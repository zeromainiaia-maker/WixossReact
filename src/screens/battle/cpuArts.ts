import type { CardData, PlayerState, TurnPhase } from '../../types';
import type { CardEffect, EffectAction } from '../../types/effects';
import { getCardNum } from '../../engine/effectExecutor';
import { type ArtsPayerCtx, type ArtsUseCheck, listUsableArts } from './artsUseGate';
import { selectEnergyIndicesForCost } from './cpuActivate';
import { energyPoolCardNums } from './energyPaySource';

/**
 * CPU が**相手（人間）のアタックフェイズに応答アーツを使う**ための選択ロジック（§8／§6.4 `O-1` (a)）。
 *
 * ■ 設計（`cpuActivate.ts` と同じ規律）
 *   - **「使えるか」の判定は `artsUseGate.checkArtsUse`（人間のボタン生成と同じ関数）**。ここは
 *     「使えるもののうち **CPU が守りに使うべき1枚**を選ぶ」だけを担う。
 *   - 実行は `performArts`（人間のアーツ使用と同じ関数）。**CPU 専用の実行経路は作らない**
 *     （DESIGN §4「CPU は対人戦と同じ処理を使う」）。
 *
 * ■ v1 の意図的な限界（honest defer・広げるときは §7 の実機検証とセットで）
 *   - **守りのアーツだけ**（下の分類）。攻めのアーツ（自ターンの `ATTACK_ARTS` / `MAIN`）は別バッチ。
 *   - **効果側コスト（手札を捨てる等）があるアーツは使わない**＝内訳に盤面評価が要る。
 *     エナ（CSV `Cost`）だけで払える札に限る。**ベット／アンコール／ブーストも宣言しない**。
 *   - **脅威があるときだけ使う**（`hasIncomingThreat`）＝毎ターン開幕に撃ち尽くさないための足切り。
 *     ⚠これは「強い AI」ではなく「一方的に殴られない」ための最小線。優先度の精緻化は別バッチ。
 *   - 優先度は**分類（無効化→除去→軽減）→ルリグデッキ順**の決定論（盤面評価はしない）。
 */

/** CPU が守りに使う価値があると判断するアーツの分類。数字が小さいほど優先。 */
export type CpuDefensiveKind = 'negate' | 'removal' | 'prevent';

const KIND_PRIORITY: Record<CpuDefensiveKind, number> = { negate: 0, removal: 1, prevent: 2 };

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
export const CPU_ARTS_PAYABLE_COST_KEYS: ReadonlySet<string> = new Set(['energy']);

export function cpuCanPayArtsWithEnergyOnly(effects: readonly CardEffect[]): boolean {
  return effects
    .filter(e => e.effectType === 'ACTIVATED')
    .every(e => Object.entries(e.cost ?? {})
      .every(([k, v]) => v === undefined || CPU_ARTS_PAYABLE_COST_KEYS.has(k)));
}

export interface CpuArtsChoice {
  card: CardData;
  check: ArtsUseCheck;
  kind: CpuDefensiveKind;
  /** `performArts` に渡すエナ pool index。 */
  costIndices: Set<number>;
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
}

/**
 * 「使える（gate）× 指定した分類 × エナだけで払える × このターン未使用」を満たす1枚を
 * **分類→ルリグデッキ順の決定論**で選ぶ内部共通処理。
 *
 * ⚠**応答（相手ターン）と攻め（自ターン）で違うのは `isMyTurn` と `allowKinds` だけ**にする＝
 * 選び方の本体を2本に分けると、片方だけに条件を足したときに気付けない。
 */
function pickCpuArtsBy(
  p: CpuArtsPickInput,
  opts: { isMyTurn: boolean; allowKinds: ReadonlySet<CpuDefensiveKind> },
): CpuArtsChoice | null {
  const { actor, opponent, cards, cardMap, effectsMap, payer } = p;
  const poolNums = energyPoolCardNums(payer.energyPayPool);
  const candidates: CpuArtsChoice[] = [];
  for (const { card, check } of listUsableArts({
    my: actor, op: opponent, isMyTurn: opts.isMyTurn, turnPhase: p.turnPhase,
    cards, cardMap, effectsMap, payer, effectivePowers: p.effectivePowers,
  })) {
    if (p.alreadyUsedNums.includes(card.CardNum)) continue;
    const effects = effectsMap.get(card.CardNum) ?? [];
    if (!cpuCanPayArtsWithEnergyOnly(effects)) continue;
    const kind = effects
      .filter(e => e.effectType === 'ACTIVATED')
      .map(e => defensiveKindOf(e.action))
      .filter((k): k is CpuDefensiveKind => k !== null && opts.allowKinds.has(k))
      .sort((a, b) => KIND_PRIORITY[a] - KIND_PRIORITY[b])[0];
    if (!kind) continue;
    const costIndices = selectEnergyIndicesForCost({
      poolNums, cards, costStr: check.effectiveCost,
      isAffordable: (selectedNums, costStr) => p.isAffordable(selectedNums, costStr, check.extraCosts),
    });
    if (!costIndices) continue;
    candidates.push({ card, check, kind, costIndices });
  }
  if (candidates.length === 0) return null;
  // 分類（無効化→除去→軽減）が第一。同点はルリグデッキ順＝決定論。
  const deckOrder = new Map<string, number>();
  actor.lrig_deck.forEach((instId, i) => {
    const num = getCardNum(instId);
    if (!deckOrder.has(num)) deckOrder.set(num, i);
  });
  candidates.sort((a, b) =>
    (KIND_PRIORITY[a.kind] - KIND_PRIORITY[b.kind]) ||
    ((deckOrder.get(a.card.CardNum) ?? 0) - (deckOrder.get(b.card.CardNum) ?? 0)));
  return candidates[0];
}

const ALL_KINDS: ReadonlySet<CpuDefensiveKind> = new Set<CpuDefensiveKind>(['negate', 'removal', 'prevent']);
const REMOVAL_ONLY: ReadonlySet<CpuDefensiveKind> = new Set<CpuDefensiveKind>(['removal']);

/**
 * CPU がいま使う**応答アーツ**を1枚選ぶ（相手ターンのアーツステップ・無ければ `null`）。
 * **1回の呼び出しで1枚だけ**＝実行後はスタック解決を待って CPU ループが再入する
 * （人間が1枚ずつ使うのと同じ順序）。
 */
export function pickCpuResponseArts(p: CpuArtsPickInput): CpuArtsChoice | null {
  if (!hasIncomingThreat(p.actor, p.opponent)) return null;
  return pickCpuArtsBy(p, { isMyTurn: false, allowKinds: ALL_KINDS });
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
  if (!hasBlockedAttacker(p.actor, p.opponent)) return null;
  return pickCpuArtsBy(p, { isMyTurn: true, allowKinds: REMOVAL_ONLY });
}
