import type { CardData, PlayerState, TurnPhase } from '../../types';
import type { CardEffect, EffectAction } from '../../types/effects';
import { getCardNum } from '../../engine/effectExecutor';
import { matchesFilter } from '../../engine/execUtils';
import { type ArtsPayerCtx, type ArtsUseCheck, listUsableArts } from './artsUseGate';
import { selectEnergyIndicesForCost, type CpuEnergyReserve } from './cpuActivate';
import { energyPoolCardNums } from './energyPaySource';
import { scoreCardUseGain, type LookaheadCtx } from './cpuLookahead';
import { planArtsMarkedFor, planCardUse, type CpuDeckPlan } from './cpuDeckPlan';
import { cpuBetCoinsFor, cpuBetCoinsNeeded, cpuCanDeclareBet, withCpuBet } from './cpuBet';

/**
 * CPU が**アーツを使う**ための選択ロジック（§8／§6.4 `O-1` (a)(b)）。窓は2つ＝
 * **応答**（相手のアタックフェイズ＝`pickCpuResponseArts`）と**攻め**（自ターンの `MAIN` /
 * `ATTACK_ARTS`＝`pickCpuOffensiveArts`）。
 *
 * ■ 設計（`cpuActivate.ts` と同じ規律）
 *   - **「使えるか」の判定は `artsUseGate.checkArtsUse`（人間のボタン生成と同じ関数）**。ここは
 *     「使えるもののうち **CPU が使うべき1枚**を選ぶ」だけを担う。
 *   - 実行は `performArts`（人間のアーツ使用と同じ関数）。**CPU 専用の実行経路は作らない**
 *     （DESIGN §4「CPU は対人戦と同じ処理を使う」）。
 *   - 2つの窓で違うのは **`isMyTurn` と許す分類だけ**（`pickCpuArtsBy` の引数）。
 *
 * ■ v1 の意図的な限界（honest defer・広げるときは §7 の実機検証とセットで）
 *   - **分類できた札だけ**（下の `defensiveKindOf`）。強化・展開・ドロー・サーチは盤面評価が要るので使わない。
 *   - **効果側コスト（手札を捨てる等）があるアーツは使わない**＝内訳に盤面評価が要る。
 *     エナ（CSV `Cost`）だけで払える札に限る。**アンコール／ブーストは宣言しない**（🆕ベットは `cpuBet.ts` が判断する）。
 *   - **意味があるときだけ使う**＝応答は `hasIncomingThreat`、攻めは `hasBlockedAttacker`。
 *     ⚠これは「強い AI」ではなく「一方的に殴られない／一方的に止められない」ための最小線。
 *   - 優先度は**分類（無効化→除去→軽減）→ルリグデッキ順**の決定論（盤面評価はしない）。
 */

/** CPU が守りに使う価値があると判断するアーツの分類。数字が小さいほど優先。 */
export type CpuDefensiveKind = 'negate' | 'removal' | 'prevent';

const KIND_PRIORITY: Record<CpuDefensiveKind, number> = { negate: 0, removal: 1, prevent: 2 };

/**
 * 🆕**選んだ理由**（§5.7 `S-31` ③）＝分類の3つに **`'plan'`＝作戦データが指名した**を足したもの。
 * 🔴**`'plan'` が最優先**＝作り手が「この札を守り／攻めで使う」と書いたなら、機械の分類より先に使う。
 */
export type CpuArtsPickKind = CpuDefensiveKind | 'plan';

const PICK_PRIORITY: Record<CpuArtsPickKind, number> = { plan: -1, negate: 0, removal: 1, prevent: 2 };

/** ダメージそのものを止める／肩代わりするアクション。 */
const PREVENT_TYPES = new Set<string>([
  'PREVENT_DAMAGE', 'PREVENT_NEXT_DAMAGE', 'REPLACE_NEXT_DAMAGE_WITH_MILL', 'LIFE_CRASH_REPLACE',
]);
/** 相手シグニを盤面から退かす／アタックできなくするアクション（`target.owner === 'opponent'` のときだけ守り）。 */
const REMOVAL_TYPES = new Set<string>([
  'BANISH', 'TRASH', 'BOUNCE', 'SEND_TO_ENERGY', 'FREEZE', 'DOWN',
]);

/**
 * アクション木を歩いて守りの分類を返す（該当が無ければ `null`）。
 *
 * ⚠**`STUB` は対象外**＝id ごとに意味が違うので、機械的に「守り」と決めつけない（保守側に倒す）。
 * 撃つべき STUB アーツを足すときは、id を明示的にこの関数へ足すこと。
 */
export function defensiveKindOf(action: EffectAction | undefined): CpuDefensiveKind | null {
  let found: CpuDefensiveKind | null = null;
  const better = (k: CpuDefensiveKind) => {
    if (found === null || KIND_PRIORITY[k] < KIND_PRIORITY[found]) found = k;
  };
  const walk = (node: unknown) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) { for (const v of node) walk(v); return; }
    const obj = node as Record<string, unknown>;
    const type = typeof obj.type === 'string' ? obj.type : null;
    if (type === 'NEGATE_ATTACK') better('negate');
    else if (type && PREVENT_TYPES.has(type)) better('prevent');
    else if (type === 'SIGNI_ATTACK_BAN' && obj.owner === 'opponent') better('removal');
    else if (type && REMOVAL_TYPES.has(type)) {
      const target = obj.target as { type?: string; owner?: string } | undefined;
      if (target?.owner === 'opponent' && target?.type === 'SIGNI') better('removal');
    }
    for (const v of Object.values(obj)) walk(v);
  };
  walk(action);
  return found;
}

/**
 * 🆕2026-09-22＝**除去の対象が相手の場に実際にいるか**（アクション木の除去ノードのどれか1つでも）。
 *
 * 🔴**なぜ要るか（ユーザーのバグ報告 `4d79fdf9`）**＝`defensiveKindOf` は「相手シグニを除去する札」までしか見ず、
 *   **原文の条件（パワー12000以上・レベル3 …）に合う対象がいるか**を見ていなかった
 *   ⇒ 相手の場がキョウギュ（7000）2体だけなのに《付和雷同》（相手のパワー12000以上のシグニ1体をバニッシュ）を緑3で撃った。
 * ⚠**判定は engine と同じ `matchesFilter`**（実効パワーがあればそれで比べる）。
 * ⚠「対象にならない」系の耐性までは見ていない。
 *
 * 🆕2026-09-22＝**CPU が宣言しない任意コストの分岐は歩かない**（バグ報告 `8c59ee3c`）。
 *   《一騎当閃》は `CONDITIONAL{IS_BETTING}` の then＝パワー20000以下／else＝7000以下だが、
 *   ベットしない使用では**実際に解決されるのは else だけ**（宣言するかは `cpuBet.ts` が決めて `betting` で渡す）。
 *   両枝を歩いていたので、相手が 12000 だけの盤面で「対象あり」と数えて空撃ちしていた。
 */
export function removalTargetExists(
  action: EffectAction | undefined, opponent: PlayerState, cardMap: Map<string, CardData>, powers?: Map<string, number>,
  /** 🆕この使用で CPU がベットを宣言するか（`cpuBet.ts`）＝`IS_BETTING` の分岐のどちらを歩くか。ブーストは CPU が宣言しない。 */
  betting = false,
): boolean {
  const tops = opponent.field.signi.map(z => z?.at(-1)).filter((x): x is string => !!x);
  let found = false;
  const walk = (node: unknown) => {
    if (found || !node || typeof node !== 'object') return;
    if (Array.isArray(node)) { for (const v of node) walk(v); return; }
    const obj = node as Record<string, unknown>;
    const type = typeof obj.type === 'string' ? obj.type : null;
    if (type === 'CONDITIONAL') {
      const cond = obj.condition as { type?: string; negate?: boolean } | undefined;
      if (cond?.type === 'IS_BETTING' || cond?.type === 'IS_BOOSTING') {
        const declared = cond.type === 'IS_BETTING' && betting;
        walk(declared !== !!cond.negate ? obj.then : obj.else);
        return;
      }
    }
    if (type === 'SIGNI_ATTACK_BAN' && obj.owner === 'opponent') { if (tops.length > 0) found = true; return; }
    if (type && REMOVAL_TYPES.has(type)) {
      const target = obj.target as { type?: string; owner?: string; filter?: Parameters<typeof matchesFilter>[1] } | undefined;
      if (target?.owner === 'opponent' && target?.type === 'SIGNI'
        && tops.some(id => matchesFilter(cardMap.get(getCardNum(id)), target.filter, powers?.get(id)))) { found = true; return; }
    }
    for (const v of Object.values(obj)) walk(v);
  };
  walk(action);
  return found;
}

/**
 * いま守る価値があるか＝**このアタックフェイズで実害が出る見込み**があるか。
 *
 * v1 の判定は2つだけ（どちらも盤面から機械的に決まる）：
 *   ① 正面が空いている相手のアップ状態シグニがいる（＝ライフクラッシュが通る）
 *   ② 自分のライフクロスが1枚以下（＝ルリグアタック1回で負ける射程）
 * ⚠CPU は【ガード】しない（`performGuardResponse(null)`）ので、②を入れないと詰め切られる。
 */
export function hasIncomingThreat(actor: PlayerState, attacker: PlayerState): boolean {
  if ((actor.life_cloth?.length ?? 0) <= 1) return true;
  for (let zi = 0; zi < attacker.field.signi.length; zi++) {
    const top = attacker.field.signi[zi]?.at(-1);
    if (!top) continue;
    if (attacker.field.signi_down?.[zi]) continue;   // ダウン状態はアタックできない
    if (attacker.field.signi_frozen?.[zi]) continue; // 凍結もアタックできない
    // 盤面は左右反転する＝engine 共通規約の facing は **2 - zi**。
    const facing = actor.field.signi[2 - zi];
    if (!facing || facing.length === 0) return true;
  }
  return false;
}

/**
 * CPU が使うと**いまの CPU 進行では壊れる**アクション（＝分類できても選ばない）。
 *
 * 🆕**2026-08-18（§6.4 O-1 (e)）で空集合になった**＝唯一の登録だった `ADD_EXTRA_ATTACK_PHASE` は、
 * CPU の `ATTACK_LRIG`→`END` 遷移を state 込みコミット（`ADVANCE_TURN_WITH_STATE`）へ揃えて
 * `resolveNextPhaseAfterAttack` を通すようにしたので**キューを正しく1件消化できる**＝除外不要になった。
 *
 * 🔑**受け口としては残す**＝「CPU 進行がまだ支えられない綴り」が出たらここへ1行足せば、
 * アーツ（`cpuArts`）・スペル（`cpuSpell`）の両方の候補選定から同時に落ちる（判定は funnel 1箇所）。
 * ⚠**外すときは必ず「その綴りを CPU が撃った後の進行」を先に直す**（除外は原因ではなく回避策）。
 */
export const CPU_UNSUPPORTED_ACTION_TYPES: ReadonlySet<string> = new Set<string>();

/**
 * アクション木のどこかに `CPU_UNSUPPORTED_ACTION_TYPES` が含まれるか。
 *
 * ⚠`types` は**テストから合成集合を差し込むためだけ**の引数（既定＝本番の集合）。
 *   本番の集合が空になっても「入れ子の `SEQUENCE`/分岐まで歩く」ことを golden で検査し続けられるようにする
 *   （空集合のままだと walker が常に false を返し、回帰が計器に映らなくなる）。
 */
export function hasCpuUnsupportedAction(
  action: EffectAction | undefined,
  types: ReadonlySet<string> = CPU_UNSUPPORTED_ACTION_TYPES,
): boolean {
  if (types.size === 0) return false;
  let found = false;
  const walk = (node: unknown) => {
    if (found || !node || typeof node !== 'object') return;
    if (Array.isArray(node)) { for (const v of node) walk(v); return; }
    const obj = node as Record<string, unknown>;
    if (typeof obj.type === 'string' && types.has(obj.type)) { found = true; return; }
    for (const v of Object.values(obj)) walk(v);
  };
  walk(action);
  return found;
}

/**
 * 自ターンに除去を使う価値があるか＝**アタックが正面で塞がれているアップのシグニがいる**か。
 *
 * 正面（facing ＝ `2 - zi`）に相手シグニがいるとアタックは**バトル**になりライフに通らない。
 * 塞いでいる札を退かせばライフクラッシュに変わる＝これが「攻めのアーツ」の唯一の目的（v1）。
 * ⚠**相手の場が空なら除去は無価値**なので false（開幕に撃ち尽くさないための足切り）。
 */
export function hasBlockedAttacker(actor: PlayerState, defender: PlayerState): boolean {
  for (let zi = 0; zi < actor.field.signi.length; zi++) {
    const top = actor.field.signi[zi]?.at(-1);
    if (!top) continue;
    if (actor.field.signi_down?.[zi]) continue;   // ダウン状態はアタックできない
    if (actor.field.signi_frozen?.[zi]) continue; // 凍結もアタックできない
    const facing = defender.field.signi[2 - zi];
    if (facing && facing.length > 0) return true;
  }
  return false;
}

/**
 * そのアーツを CPU が「エナだけで」使えるか。
 *
 * ⚠**allowlist は `energy` 1本だけ**にする（denylist にしない）。理由は
 * **`performArts` がエナ以外の宣言コストを払わない**から＝`down_self` や `lrigDown` のような
 * 「シグニ【起】なら自動で払える」キーをここに足すと、**宣言だけして踏み倒す**ことになる。
 * （実測＝アタックフェイズの Timing を持つアーツ 428枚は全枚 `cost` が `energy` のみ＝
 * CSV `Cost` 列の写し。手札を捨てる等が出てきたら内訳に盤面評価が要るので使わない側へ倒れる。）
 */
export const CPU_ARTS_PAYABLE_COST_KEYS: ReadonlySet<string> = new Set([
  'energy',
  // 🆕2026-09-17＝**判定側（`artsUseGate`／`spellUseGate`）が実効コスト（`check.effectiveCost`）へ織り込み済み**＝エナの額として払われる。
  'costScaling', 'costReplacement',
]);

/**
 * 🆕**任意の宣言コスト**（2026-09-17）＝**宣言しなければ払わない**＝CPU は宣言せず基本コスト（`check.effectiveCost`）で使う。
 * 🔴**なぜ要るか**＝§5.3 `O-86`（2026-09-02）で【ブースト】【ベット】【アンコール】使用時の任意支払い等が**原文 regex から
 *   コストの payload へ移った**。allowlist が `energy` 1本のままだったので、**それらのキーを持つアーツ・スペル（約230効果）を
 *   CPU が一切使わなくなっていた**（実機 `v82ResponseArtsPreventAtLowLife`＝ブースト付きの《千里同風》を使わない、で発覚）。
 * ⚠**エナ以外を必ず払うキー（`discard`／`charmTrash`／`trashExile` …）はここに入れない**（宣言だけして踏み倒す）。
 */
export const CPU_ARTS_DECLINABLE_COST_KEYS: ReadonlySet<string> = new Set([
  'boostCost', 'betOptions', 'encoreCost', 'useTimeCost', 'optionalDiscardCost',
]);

export function cpuCanPayArtsWithEnergyOnly(effects: readonly CardEffect[]): boolean {
  return effects
    .filter(e => e.effectType === 'ACTIVATED')
    .every(e => Object.entries(e.cost ?? {})
      .every(([k, v]) => v === undefined || CPU_ARTS_PAYABLE_COST_KEYS.has(k) || CPU_ARTS_DECLINABLE_COST_KEYS.has(k)));
}

export interface CpuArtsChoice {
  card: CardData;
  check: ArtsUseCheck;
  /** 🆕`'plan'`＝作戦データの指名で選んだ（§5.7 `S-31` ③）。 */
  kind: CpuArtsPickKind;
  /** `performArts` に渡すエナ pool index。 */
  costIndices: Set<number>;
  /** 🆕ベットするコインの枚数（省略＝0＝宣言しない）。 */
  betCoins?: number;
}

export interface CpuArtsPickInput {
  actor: PlayerState;
  opponent: PlayerState;
  cards: CardData[];
  cardMap: Map<string, CardData>;
  effectsMap: Map<string, CardEffect[]>;
  payer: ArtsPayerCtx;
  /** 窓のフェイズ（応答＝`'ATTACK_ARTS_OP'`／自ターン＝`'MAIN'` か `'ATTACK_ARTS'`）。 */
  turnPhase: TurnPhase;
  /** このターン CPU が既に使ったアーツの CardNum（同じ札を選び直さない安全弁）。 */
  alreadyUsedNums: readonly string[];
  /** 可否の権威＝人間の支払いUIと同じ `canAffordWithExtraCost`。 */
  isAffordable: (selectedNums: string[], costStr: string, extraCosts: { color: string; count: number }[]) => boolean;
  effectivePowers?: Map<string, number>;
  /**
   * 🆕§5.7 `S-4c`＝先読み（攻めのアーツだけで使う）。渡すと候補の中から**使った結果の盤面が一番良くなる**ものを選び、
   * 増分が0以下なら使わない。⚠アーツは使い切りなので**使う条件（正面が塞がれている・除去）は据置**＝1手先だけで使い切らない。
   */
  lookahead?: LookaheadCtx;
  /** 🆕グロウ用エナの予約（`cpuGrowReserve.ts`）＝応答アーツでも CPU の次のグロウ用エナを残す。 */
  energyReserve?: CpuEnergyReserve;
  /**
   * 🆕§5.7 `S-31` ③＝デッキの作戦データ（**札ごとの使いどころ**）。省略可＝**渡さなければ従来どおり**
   * （分類できた札だけを、窓ごとの分類の絞りで使う）。
   */
  plan?: CpuDeckPlan;
}

/**
 * 「使える（gate）× 指定した分類 × エナだけで払える × このターン未使用」を満たす1枚を
 * **分類→ルリグデッキ順の決定論**で選ぶ内部共通処理。
 *
 * ⚠**応答（相手ターン）と攻め（自ターン）で違うのは `isMyTurn` と `allowKinds` だけ**にする＝
 * 選び方の本体を2本に分けると、片方だけに条件を足したときに気付けない。
 */
/** 🆕§5.7 `S-15`＝列挙の1件＝分類で絞る前（`kinds` は分類の全部＝空もありうる）。 */
export interface CpuArtsCandidate {
  card: CardData;
  check: ArtsUseCheck;
  /** この札の【起】が持つ分類（`defensiveKindOf`・重複なし・`KIND_PRIORITY` 順）。 */
  kinds: CpuDefensiveKind[];
  costIndices: Set<number>;
  /** 🆕ベットするコインの枚数（0＝宣言しない・`cpuBet.ts`）。`costIndices` はこの宣言に合わせた支払い。 */
  betCoins: number;
}

/**
 * 🆕§5.7 `S-15`＝CPU が**いま使える**アーツを全部（ルリグデッキ順）。**分類では絞らない**＝窓ごとの分類の絞り
 * （応答＝温存規律／攻め＝除去だけ）は選ぶ側（`pickCpuArtsBy`）が持つ。
 * ⚠CPU が払いきれない札（エナ以外の宣言コスト・未対応アクション）はここで外す＝列挙に出た札は実行できる。
 */
export function listCpuArts(p: CpuArtsPickInput, isMyTurn: boolean): CpuArtsCandidate[] {
  const { actor, opponent, cards, cardMap, effectsMap, payer } = p;
  const poolNums = energyPoolCardNums(payer.energyPayPool);
  const candidates: CpuArtsCandidate[] = [];
  for (const { card, check } of listUsableArts({
    my: actor, op: opponent, isMyTurn, turnPhase: p.turnPhase,
    cards, cardMap, effectsMap, payer, effectivePowers: p.effectivePowers,
  })) {
    if (p.alreadyUsedNums.includes(card.CardNum)) continue;
    // 🆕§5.7 `S-31` ③＝作戦データの「使いどころ」は**列挙の段階で効かせる**。
    //   🔴**なぜ pick 側だけでは足りないか（2026-09-21 の自己対戦で実測）**＝
    //   **探索（`S-16`）はこの列挙をそのまま手にする**ので、分類（`defensiveKindOf`）の絞りを通らない。
    //   ⇒ 窓の指定を pick 側にだけ書くと、**「守りで使う」と書いた札を探索が攻めで撃つ**。
    //   - `never`＝どちらの窓にも出さない（温存が探索にも効く）
    //   - `defense`/`offense`＝**その窓にだけ**出す（指定が無い札は従来どおり両方の窓に出る）
    const use = planCardUse(p.plan, card.CardNum);
    if (use === 'never') continue;
    if ((use === 'defense' && isMyTurn) || (use === 'offense' && !isMyTurn)) continue;
    const effects = effectsMap.get(card.CardNum) ?? [];
    if (!cpuCanPayArtsWithEnergyOnly(effects)) continue;
    const acts = effects.filter(e => e.effectType === 'ACTIVATED');
    if (acts.some(e => hasCpuUnsupportedAction(e.action))) continue;
    const selectFor = (costStr: string) => selectEnergyIndicesForCost({
      poolNums, cards, costStr,
      isAffordable: (selectedNums, cs) => p.isAffordable(selectedNums, cs, check.extraCosts),
      wholeSubstitutes: payer.wholeEnergySubstitutes,
      extraCosts: check.extraCosts,
      reserve: p.energyReserve,
    });
    const plainIndices = selectFor(check.effectiveCost);
    // 🆕2026-09-22＝**ベットするかを決める**（`cpuBet.ts`）。ベットでコストが置き換わる札（`check.betCost`）はその額で払う。
    const betNeed = cpuBetCoinsNeeded(effects);
    const betIndices = betNeed !== null && check.betCost !== null ? selectFor(check.betCost) : plainIndices;
    let betCoins = 0;
    if (betNeed !== null && betIndices) {
      betCoins = plainIndices
        ? cpuBetCoinsFor({
            cardId: actor.lrig_deck.find(id => getCardNum(id) === card.CardNum) ?? card.CardNum,
            effects, actor, opponent, cardMap, blockedSelf: payer.blockedSelf, kind: 'arts', from: 'lrig_deck',
            costCount: plainIndices.size, betCostCount: betIndices.size,
            effectivePowers: p.effectivePowers, lookahead: p.lookahead,
          })
        // ベットしないと払えない（置き換え後のコストでだけ払える）札は、宣言できるならベットする。
        : (cpuCanDeclareBet(actor, payer.blockedSelf, 'arts', betNeed) ? betNeed : 0);
    }
    const costIndices = betCoins > 0 ? betIndices : plainIndices;
    if (!costIndices) continue;
    const kinds = [...new Set(acts
      .map(e => defensiveKindOf(e.action))
      .filter((k): k is CpuDefensiveKind => k !== null))]
      // 🆕2026-09-22＝**除去は対象がいるときだけ除去として数える**（バグ報告 `4d79fdf9`＝対象のいない《付和雷同》）。
      .filter(k => k !== 'removal' || acts.some(e => removalTargetExists(e.action, opponent, cardMap, p.effectivePowers, betCoins > 0)))
      .sort((a, b) => KIND_PRIORITY[a] - KIND_PRIORITY[b]);
    candidates.push({ card, check, kinds, costIndices, betCoins });
  }
  return candidates;
}

function pickCpuArtsBy(
  p: CpuArtsPickInput,
  opts: { isMyTurn: boolean; allowKinds: ReadonlySet<CpuDefensiveKind>; window: 'defense' | 'offense' },
): CpuArtsChoice | null {
  const { actor, opponent } = p;
  const candidates: CpuArtsChoice[] = [];
  for (const { card, check, kinds, costIndices, betCoins } of listCpuArts(p, opts.isMyTurn)) {
    // 🆕§5.7 `S-31` ③＝**作戦データがこの窓に指名した札は、分類を通らなくても候補になる**。
    //   🔴これが③の本体＝実測でユーザー作21デッキのアーツ76種のうち52種が「分類できない」（ドロー・サーチ・強化・展開）。
    if (planArtsMarkedFor(p.plan, card.CardNum, opts.window)) {
      candidates.push({ card, check, kind: 'plan', costIndices, betCoins });
      continue;
    }
    const kind = kinds.find(k => opts.allowKinds.has(k));
    if (!kind) continue;
    candidates.push({ card, check, kind, costIndices, betCoins });
  }
  if (candidates.length === 0) return null;
  if (p.lookahead && opts.isMyTurn) {
    const lrigIdOf = (num: string) => actor.lrig_deck.find(id => getCardNum(id) === num) ?? num;
    const scored = candidates
      // 🆕ベットする札は「ベットした盤面」で採点する（`withCpuBet`）。
      .map(c => ({ c, gain: scoreCardUseGain(lrigIdOf(c.card.CardNum), c.costIndices.size, withCpuBet(actor, c.betCoins ?? 0), opponent, p.lookahead!, 'lrig_deck') }))
      // ⚠**指名された札は増分0でも残す**＝作り手が「攻めで使う」と書いた札は、盤面の点数に出ない見返り
      //   （ドロー・サーチ）でも撃つ。🔴**解決できなかった（`null`）札は指名でも落とす**＝実行できないため。
      .filter((x): x is { c: CpuArtsChoice; gain: number } => x.gain !== null && (x.gain > 0 || x.c.kind === 'plan'))
      // 指名（`plan`）を先に、その中では増分の大きい順。
      .sort((a, b) => (PICK_PRIORITY[a.c.kind] - PICK_PRIORITY[b.c.kind]) || (b.gain - a.gain));
    return scored[0]?.c ?? null;
  }
  // 指名（作戦データ）→分類（無効化→除去→軽減）が第一。同点はルリグデッキ順＝決定論。
  const deckOrder = new Map<string, number>();
  actor.lrig_deck.forEach((instId, i) => {
    const num = getCardNum(instId);
    if (!deckOrder.has(num)) deckOrder.set(num, i);
  });
  candidates.sort((a, b) =>
    (PICK_PRIORITY[a.kind] - PICK_PRIORITY[b.kind]) ||
    ((deckOrder.get(a.card.CardNum) ?? 0) - (deckOrder.get(b.card.CardNum) ?? 0)));
  return candidates[0];
}

/** 🆕§5.7 `S-31` ③＝その窓に指名された札が**1枚でも使える状態にあるか**（窓の足切りを外す判定）。 */
function hasPlanMarkedArts(p: CpuArtsPickInput, isMyTurn: boolean, window: 'defense' | 'offense'): boolean {
  if (!p.plan || Object.keys(p.plan.cardUse ?? {}).length === 0) return false;
  return listCpuArts(p, isMyTurn).some(c => planArtsMarkedFor(p.plan, c.card.CardNum, window));
}

const ALL_KINDS: ReadonlySet<CpuDefensiveKind> = new Set<CpuDefensiveKind>(['negate', 'removal', 'prevent']);
const REMOVAL_ONLY: ReadonlySet<CpuDefensiveKind> = new Set<CpuDefensiveKind>(['removal']);
/** 🆕分類では1枚も許さない窓（＝作戦データの指名だけで開く窓・§5.7 `S-31` ③）。 */
const NO_KINDS: ReadonlySet<CpuDefensiveKind> = new Set<CpuDefensiveKind>();
/** 軽減（`prevent`）を温存する窓＝無効化と除去だけ許す。 */
const KEEP_PREVENT: ReadonlySet<CpuDefensiveKind> = new Set<CpuDefensiveKind>(['negate', 'removal']);

/**
 * 応答窓で**使ってよい分類**（§8 `O-1` (g)＝「守りの札を温存する」）。
 *
 * `prevent`（ダメージ軽減・肩代わり）は**ライフが実際に危ないときだけ**使う。ライフ7枚で
 * 1点を軽減しても盤面は何も変わらず、**その札は二度と戻らない**＝終盤に本当に必要な場面で無くなる。
 * v1 の線は **残りライフ2枚以下**（＝ダブルクラッシュ1回やルリグアタック2回で負ける射程）。
 * ⚠`negate`（アタック無効）と `removal`（相手シグニ除去）は**盤面に残る効果**なので温存しない
 * （除去は壁を1枚減らす＝次のターン以降も効く／無効化はそのアタック1回を丸ごと消す）。
 */
export function responseArtsAllowedKinds(actor: PlayerState): ReadonlySet<CpuDefensiveKind> {
  return (actor.life_cloth?.length ?? 0) <= 2 ? ALL_KINDS : KEEP_PREVENT;
}

/**
 * CPU がいま使う**応答アーツ**を1枚選ぶ（相手ターンのアーツステップ・無ければ `null`）。
 * **1回の呼び出しで1枚だけ**＝実行後はスタック解決を待って CPU ループが再入する
 * （人間が1枚ずつ使うのと同じ順序）。
 */
export function pickCpuResponseArts(p: CpuArtsPickInput): CpuArtsChoice | null {
  // 🔴**`hasIncomingThreat` は指名された札にも効かせる**（§5.7 `S-31` ③の意図的な非対称）＝
  //   これは「このアタックフェイズで実害が出るか」の判定で、**守りの札を撃つ意味がある窓そのもの**。
  //   外すと、何も通らないアタックに対してもアーツを撃ち尽くす。⚠攻め側（`hasBlockedAttacker`）は逆＝下を見よ。
  if (!hasIncomingThreat(p.actor, p.opponent)) return null;
  // §8 `O-1` (g)＝ライフに余裕があるうちは**軽減（`prevent`）を温存**する（`responseArtsAllowedKinds`）。
  return pickCpuArtsBy(p, { isMyTurn: false, allowKinds: responseArtsAllowedKinds(p.actor), window: 'defense' });
}

/**
 * CPU がいま使う**攻めのアーツ**を1枚選ぶ（自ターンの `MAIN` / `ATTACK_ARTS`・無ければ `null`）。
 *
 * ■ v1 は**除去だけ**（honest defer）
 *   - 目的は「**アタックを通す**」の1点＝正面が埋まっているとアタックはバトルになりライフに通らない。
 *     相手シグニを退かす札だけを使い、**アタッカーが実際に塞がれているとき**にしか使わない
 *     （`hasBlockedAttacker`）＝盤面が空の相手に除去を撃たない。
 *   - 強化（パワー付与）・展開・ドロー・サーチは**盤面評価が要る**ので使わない。撃たない＝現状と同じ安全側。
 *   - 無効化／ダメージ軽減は**自ターンには意味が無い**ので分類から外してある。
 */
export function pickCpuOffensiveArts(p: CpuArtsPickInput): CpuArtsChoice | null {
  // 🆕§5.7 `S-31` ③＝**足切りは「除去のための足切り」なので、指名された札には掛けない**（応答窓と逆）＝
  //   🔑`hasBlockedAttacker` は「正面が塞がれている＝除去すればアタックが通る」という
  //   **除去に固有の理由**であって、ドロー・サーチ・強化を撃つ理由ではない。
  //   ⚠代わりに、指名が無いときは従来どおり**除去だけ・塞がれているときだけ**（開幕に撃ち尽くさない）。
  const blocked = hasBlockedAttacker(p.actor, p.opponent);
  if (!blocked && !hasPlanMarkedArts(p, true, 'offense')) return null;
  return pickCpuArtsBy(p, {
    isMyTurn: true,
    allowKinds: blocked ? REMOVAL_ONLY : NO_KINDS,
    window: 'offense',
  });
}
