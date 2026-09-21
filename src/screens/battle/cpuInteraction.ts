import type { CardData, PendingInteractionDef, PlayerState } from '../../types';
import type { CardEffect } from '../../types/effects';
import { cardStrength } from './cpuCardStrength';
import type { CpuTargetMode } from './cpuDeckPlan';
import { DEFAULT_CPU_POLICY, type CpuPolicy } from './cpuPolicy';
import { canAddToSelection, findValidConstrainedSelection, getCardNum, selectOptionalCostEnergy } from '../../engine/execUtils';
import { shuffle as rngShuffle } from '../../engine/rng';
import { declareNameCandidates } from './declareNameCandidates';
import type { CpuEnergyReserve } from './cpuActivate';
import { reserveKeptAfterPaying } from './cpuGrowReserve';
import { canAffordDeclarationCost, type DeclarationScalingCost } from './cpuDeclarationCost';

/**
 * 🆕**CPU の対話応答**（§5.6 `C-8`・2026-09-17）＝効果の途中で CPU に回ってくる選択（対象・選択肢・サーチ・
 * パワーの割り振り・ゾーン・配置し直し）に**何と答えるか**を決める純関数群。
 *
 * ■ なぜ要るか＝旧実装は `BattleScreen.tsx` の `useEffect` に直書きで、
 *   **選択肢はいつも「押せる先頭」**＝「支払う／支払わない」「AかB」の**分岐の片側しか踏まなかった**（CPU 戦で残り半分が一度も動かない）。
 *   対象は**完全ランダム**＝相手のエースを除去できる場面で弱いシグニを選び、自分のシグニを選べる効果なら自分を選ぶこともあった。
 *   golden から呼べない（React の中）ので固定もできなかった。
 *
 * ■ 方針＝**混合**（2026-09-17 ユーザー決定）
 *   - 効果の種類で損得が分かる選択は**得な方**（相手の強いシグニを除去／自分の強いシグニを強化／自分が失うなら弱い札から）。
 *   - 「してもよい」で断る肢（`declines`）がある選択は**する**（支払いがあれば、払えるときだけ払う）。
 *   - 損得が機械的に分からない選択（「AかB」）は**乱数**（`engine/rng` の seam＝seed で再現可）＝**両方の分岐を踏む**。
 *
 * ■ 規律（§5.6.3）＝ここは「通った候補から選ぶ」だけ。可否（`available`・候補集合・制約）は engine が決めた値をそのまま使い、
 *   実行は人間と同じハンドラ（`handleEffectInteraction` ほか）が行う。
 */
export interface CpuInteractionCtx {
  /** CPU 自身の盤面（支払いのエナを選ぶ・候補の持ち主を見分ける）。 */
  cpuState: PlayerState;
  /** 相手（人間）の盤面。 */
  oppState: PlayerState;
  /** カード番号（instance の `#…` を外した番号）→ カード。 */
  cardMap: Map<string, CardData>;
  /** 🆕§5.7 `S-1`＝instance ID → そのカードの効果（付与を含む）。あれば「パワー＋効果の強さ」で比べる。 */
  effectsOf?: (id: string) => readonly CardEffect[];
  /** 🆕§5.7 `S-2`＝CPU デッキの作戦データによる「手元に置く価値」の加点（キーカード・コンボのパーツ）。場のカードには足さない。 */
  planBonus?: (id: string) => number;
  /**
   * 🆕§5.7 `S-32`（2026-09-21 ユーザー要望）＝**効果の対象の狙い方**（デッキごとの指示）。
   * `mode`＝大まかな指示（強いもの／落とせるもの／弱いもの）・`targetBonus`＝固有のカード指定（狙う／狙わない）。
   * ⚠**省略できる**＝渡さなければ `strongest`＋加点0＝`S-22` のときの挙動。
   */
  targetMode?: CpuTargetMode;
  /** ⚠**実効パワーを渡す**（属性の「パワー◯以上」は印刷パワーでなく実効パワーで見る）。 */
  targetBonus?: (id: string, power?: number) => number;
  /** 🆕グロウ用エナの予約＝効果の任意コスト（エナ）を払うと次のグロウが払えなくなるなら払わない。 */
  energyReserve?: CpuEnergyReserve;
  /**
   * 🆕§5.7 `S-29`（2026-09-22）＝**この対象宣言の「帰結のコスト」**（「それのレベル１につき《無》を支払ってもよい」）。
   * 🔴**宣言の対話には後続ステップのコストが1文字も入っていない**ので、呼び出し元が効果の木から読んで渡す
   * （`declarationScalingCost`）。⚠**省略できる**＝渡さなければ `S-22`／`S-32` のときの挙動。
   */
  followUpCost?: DeclarationScalingCost;
  /**
   * 🆕§5.7 `S-6` 第2段＝この CPU のポリシー（強さ表の重み・【ガード】温存の点数）。省略時は既定。
   * ⚠**席ごとに違うものが来る**（自己対戦の A/B）＝ここから先で `WEIGHTS`／`CPU_GUARD_KEEP_VALUE` を直接読まない。
   */
  policy?: CpuPolicy;
}

type Inter<T extends PendingInteractionDef['type']> = Extract<PendingInteractionDef, { type: T }>;

// ── 損得の見立て ─────────────────────────────────────────────

/** 対象に**害がある**アクション（相手に使えば得・自分に使うなら損）。live の対象付きアクション上位から（2026-09-17 実測）。 */
const HARMFUL_ACTIONS = new Set([
  'BANISH', 'TRASH', 'BOUNCE', 'FREEZE', 'DOWN', 'REMOVE_ABILITIES', 'SEND_TO_ENERGY', 'BLOCK_ACTION',
  'NEGATE_ATTACK', 'BANISH_REDIRECT', 'EXILE', 'DISCARD', 'TRASH_CARD',
]);
/** 対象に**得がある**アクション（自分に使えば得）。 */
const BENEFICIAL_ACTIONS = new Set(['GRANT_KEYWORD', 'GRANT_EFFECT', 'UP', 'GRANT_PROTECTION']);

/**
 * 🆕**選んだ札が自分の手元から出ていく型**（§5.7 `S-22`・2026-09-21）＝
 * **効果そのものは自分の得**だが、**どれを選ぶかは「何を手放すか」**＝価値の低い順に選ぶ
 * （`ADD_TO_LIFE{fromHand}`＝「手札を1枚ライフクロスに加える」／`ENERGY_CHARGE`＝「手札・トラッシュの1枚をエナに置く」）。
 * 🔴**`harm` と同じにできない**＝`harm` は `optional` のとき「自分に損な候補は選ばない」＝**0体で止まる**ので、
 *   「〜してもよい」の形が**断る**に化けて**得な効果ごと消える**。
 * ⚠**置き場が相手側なら別物**（`ADD_TO_LIFE{fromField, owner:opponent}`＝相手のシグニを自分のライフクロスへ＝`harm`）
 *   ＝振り分けは `targetIntentFor` が `targetScope` で行う。
 */
const SELF_COST_ACTIONS = new Set(['ADD_TO_LIFE', 'ENERGY_CHARGE']);

/**
 * `POWER_MODIFY_PER_*` 族（「〜1つにつきパワーを±N」）の**1単位あたりの増減**。
 * 🔑**符号だけを使う**（何単位になるかは盤面次第だが、向きは符号で決まる）。live で 110ノード（2026-09-21 実測）。
 */
const PER_UNIT_DELTA_KEYS = [
  'deltaPerUnit', 'deltaPerLevel', 'deltaPerCard', 'deltaPerColor', 'deltaPerCharm',
  'deltaPerLife', 'deltaPerVirus', 'deltaPerTrashedLevel',
] as const;

export type TargetIntent = 'harm' | 'benefit' | 'cost' | 'unknown';

/** 対象に対するアクションの損得（パワー修正は `delta` の符号）。分からなければ `unknown`＝乱数に回す。 */
export function targetIntentOf(action: { type: string; delta?: unknown } | undefined): TargetIntent {
  if (!action) return 'unknown';
  if (action.type === 'POWER_MODIFY' || action.type === 'LEVEL_MODIFY') {
    const d = Number(action.delta);
    return Number.isFinite(d) && d !== 0 ? (d < 0 ? 'harm' : 'benefit') : 'unknown';
  }
  // 🆕§5.7 `S-22`＝`POWER_MODIFY_PER_*` 族は `delta` を持たず、**1単位あたりの増減**に符号がある。
  const rec = action as unknown as Record<string, unknown>;
  for (const k of PER_UNIT_DELTA_KEYS) {
    const d = Number(rec[k]);
    if (Number.isFinite(d) && d !== 0) return d < 0 ? 'harm' : 'benefit';
  }
  if (HARMFUL_ACTIONS.has(action.type)) return 'harm';
  if (BENEFICIAL_ACTIONS.has(action.type)) return 'benefit';
  return 'unknown';
}

/**
 * 🆕**この対話の損得**（§5.7 `S-22`・2026-09-21）＝`thenAction` から読めないときは **`targetScope`（置き場）で補う**。
 *
 * 🔴**なぜ要るか（実測＝本物のデッキ6つ × 1戦で CPU が答えた `SELECT_TARGET` 66件）**＝
 *   **32件（48%）が `thenAction` から損得を読めず乱数**だった（選ぶ余地があったのは22件）。最大の塊は**対象宣言**＝
 *   `STUB{SELECT_TARGET_ONLY}` は `thenAction` に `INTERNAL_NOOP` を置き、**帰結は宣言の後ろのステップに来る**ので
 *   **`thenAction` には何も書かれていない**（`WD15-018-E1`＝「パワー5000以下のシグニ1体を対象とし…それをバニッシュする」で
 *   相手の場の3体から乱数で選んでいた／`WD08-001-E1`＝「トラッシュのシグニ1枚の次の【起】コストを《黒×0》にする」で
 *   トラッシュ【起】を持たない `サーバント Ｔ` を選んだ＝バグ報告 `c32a37ce`）。
 * 🔑**置き場が答えを持っている**＝**相手の置き場を指す対話は相手に不利なことをするため**（`opp_*`＝`harm`）、
 *   **自分の置き場を指す対話は自分の札を活かすため**（`self_*`＝`benefit`）にある。
 * ⚠**両者を跨ぐ置き場（`both_*`）は分からない**＝乱数のまま（どちらを選ぶかで意味が反転する）。
 * ⚠**`targetScope` は効果の使用者から見た名前**＝応答者が対戦相手の形（「対戦相手は自分の手札を1枚捨てる」）では
 *   置き場が `opp_*` なのに候補は CPU の札になる。**向きの最終判定は候補の持ち主**（`favorable`）が行うので食い違わない。
 */
export function targetIntentFor(
  inter: Pick<Inter<'SELECT_TARGET'>, 'thenAction' | 'targetScope'>, policy?: CpuPolicy,
): TargetIntent {
  const action = inter.thenAction as { type: string; delta?: unknown } | undefined;
  const base = targetIntentOf(action);
  if (base !== 'unknown') return base;
  // 🔴反転の口（`legacy-targetrandom`）＝0 なら置き場を見ずに乱数へ落とす（A/B の A 側）。
  if (policy && policy.targetIntentByScope === 0) return 'unknown';
  const scope = String(inter.targetScope);
  const isSelf = scope.startsWith('self_');
  if (isSelf && action && SELF_COST_ACTIONS.has(action.type)) return 'cost';
  return scope.startsWith('opp_') ? 'harm' : isSelf ? 'benefit' : 'unknown';
}

/** instance ID が CPU の盤面のどこかにあるか（無ければ相手側とみなす）。 */
function isCpuOwned(id: string, cpu: PlayerState): boolean {
  const f = cpu.field;
  const zones: (readonly (string | null | undefined)[] | undefined)[] = [
    cpu.hand, cpu.deck, cpu.energy, cpu.trash, cpu.life_cloth, cpu.lrig_deck, cpu.lrig_trash,
    f.lrig, f.assist_lrig_l, f.assist_lrig_r, f.free_zone,
    ...f.signi.map(s => s ?? []),
  ];
  return zones.some(z => z?.includes(id));
}

/** 相手の盤面に見つからない＝CPU 側か、まだどこにも無い（サーチ中のデッキのカード等）。 */
function isCpuOwnedOrUnknown(id: string, ctx: CpuInteractionCtx): boolean {
  return isCpuOwned(id, ctx.cpuState) || !isCpuOwned(id, ctx.oppState);
}

/** 場のシグニ（どちらかの場のゾーンのトップ）か。 */
function isOnField(id: string, ctx: CpuInteractionCtx): boolean {
  return [ctx.cpuState, ctx.oppState].some(st => st.field.signi.some(stack => stack?.includes(id)));
}

/**
 * 🆕**手札の【ガード】を手元に置く価値**（2026-09-17・ユーザー指摘「CPU がガードを持っているのに使っていない」）。
 * 🔴効果で手札を捨てるとき（`SELECT_TARGET` の害）、CPU は価値の低い札から捨てる＝パワーの低い【ガード】札（サーバント等）を真っ先に捨てていた。
 *   エナチャージ・手札上限・召喚は【ガード】を残す（`S-1`）のに、効果の捨て札だけ抜けていた。
 */
/** 🔴**実体は `cpuPolicy.DEFAULT_CPU_POLICY.guardKeepValue`**（§5.7 `S-6` 第2段）＝**値をここに書かない**。 */
export const CPU_GUARD_KEEP_VALUE = DEFAULT_CPU_POLICY.guardKeepValue;

/**
 * カードの価値＝**強さ（パワー＋効果の点数）**を主、レベルを従にした数（§5.7 `S-1`）。
 * 場のシグニは `field` 文脈（【出】は済んでいる）、手札・デッキ等は `deploy` 文脈で測る。
 * 効果の一覧が無ければパワーだけ（旧挙動）。
 */
function cardValue(
  id: string, ctx: CpuInteractionCtx, powers?: Record<string, number>,
  /**
   * 🆕§5.7 `S-32`＝**パワー換算の足し引き**（対象の狙い方の固有指定）。
   * 🔴**ここへ足す**＝戻り値は `強さ × 100 + レベル` なので、**外側で足すと桁が2つ足りず効かない**
   *   （実測＝`targetPrefer: 12000` を外側に足しても、パワー差 8000 は 800,000 なので1度も覆らなかった）。
   */
  extraStrength = 0,
): number {
  const card = ctx.cardMap.get(getCardNum(id));
  const effects = ctx.effectsOf?.(id) ?? [];
  const onField = isOnField(id, ctx);
  const inCpuHand = ctx.cpuState.hand.includes(id);
  const strength = cardStrength(card, effects, onField ? 'field' : 'deploy', powers?.[id], ctx.policy)
    + (!onField && isCpuOwnedOrUnknown(id, ctx) ? (ctx.planBonus?.(id) ?? 0) : 0)
    + (inCpuHand && card?.Guard === '1' ? (ctx.policy?.guardKeepValue ?? CPU_GUARD_KEEP_VALUE) : 0)
    + extraStrength;
  return strength * 100 + (parseInt(card?.Level ?? '', 10) || 0);
}

// ── 対象を選ぶ（SELECT_TARGET）────────────────────────────────

/**
 * 対象の選び方。
 * - 害（除去・ダウン・マイナス修正…）＝**相手の価値が高い順**、相手の候補が尽きたら**自分の価値が低い順**。
 * - 得（強化・付与・アップ…）＝**自分の価値が高い順**、尽きたら相手の価値が低い順。
 * - 🔑**任意（`optional`）なら損になる対象は選ばない**＝害を自分に／得を相手に与える候補しか無ければ0体で止める。
 * - 🆕**手放す型（`cost`）＝価値の低い順**（【ガード】は `cardValue` が手札ぶんを加点するので残る）。**任意でも選ぶ**。
 * - 🆕**`thenAction` から読めないときは置き場で決める**（§5.7 `S-22`＝`targetIntentFor`）。
 * - 置き場でも分からなければ（`both_*`）乱数（旧実装と同じ）。
 */
/**
 * 🆕**その効果で、その対象を場から離せるか**（§5.7 `S-32`・2026-09-21）。
 * 🔑**分かるのはパワーを下げる／固定する効果だけ**＝`POWER_MODIFY`（負）と `POWER_SET`。
 *   バニッシュ等の除去は**全部離せる**ので `null` を返し、狙い方 `killable` は `strongest` と同じになる
 *   （⚠「全部 true」にすると並べ替えが起きず、**効いているのか分からない**指示になる）。
 * ⚠**実効パワーは `inter.candidatePowers`（engine が算出した値）だけを使う**＝CPU 側で計算し直さない。
 */
export function targetKillableBy(
  action: { type?: string; delta?: unknown; value?: unknown } | undefined,
  id: string, powers: Record<string, number> | undefined,
): boolean | null {
  const p = powers?.[id];
  if (p === undefined) return null;
  if (action?.type === 'POWER_MODIFY') {
    const d = Number(action.delta);
    return Number.isFinite(d) && d < 0 ? p + d <= 0 : null;
  }
  if (action?.type === 'POWER_SET') {
    const v = Number(action.value);
    return Number.isFinite(v) ? v <= 0 : null;
  }
  return null;
}

export function pickCpuTargets(inter: Inter<'SELECT_TARGET'>, ctx: CpuInteractionCtx): string[] {
  const { cardMap, cpuState } = ctx;
  // 🆕**選んでも場に出せない候補は選ばない**（§5.3 `O-534`・`R-48`①）＝engine が `unplaceableCards` で印を付ける。
  //   ⚠**可否は engine が決めた値をそのまま使う**（§5.6.3 の規律）＝CPU 側でレベルを測らない。
  //   ⚠全部が印つきなら空を返す＝engine 側が「対象なし」として空振らせる（無理に選んで no-op を作らない）。
  const placeable = (inter.unplaceableCards ?? []).length > 0
    ? inter.candidates.filter(n => !inter.unplaceableCards!.includes(n))
    : inter.candidates;
  // 🆕🔴**§5.7 `S-29`（2026-09-22）＝帰結のコストが「対象のレベル１につき」の形なら、払える対象だけを候補にする。**
  //   🔴旧＝`S-22` の「相手の一番強い札を選ぶ」が**レベルの高い札を選び**、支払いの段で払えずに
  //     **宣言だけして何も起きない**（`WXDi-P04-020-E1`＝「それのレベル１につき《無》を支払ってもよい。
  //     そうした場合、それをバニッシュする」でレベル5を選ぶと《無》×5）。
  //   ⚠**払える候補が1つも無ければ従来どおり**（絞らない）＝**悪化させない**（どう選んでも空振るなら同じ）。
  //   ⚠可否は**CPU の任意コスト支払いと同じ関数**（`selectOptionalCostEnergy` ＋ グロウ予約）。
  const affordable = ctx.followUpCost
    ? placeable.filter(id => canAffordDeclarationCost({
      candidate: id, cost: ctx.followUpCost!, cardMap, cpuState,
      canPayColors: colors => {
        const paid = selectOptionalCostEnergy(colors, cpuState, cardMap);
        return !!paid && reserveKeptAfterPaying(ctx.energyReserve, cpuState.energy, paid);
      },
    }))
    : placeable;
  const candidates = affordable.length > 0 ? affordable : placeable;
  if (inter.totalPowerMax !== undefined) {
    // パワー合計上限つき＝パワーの小さい順に上限まで貪欲に（できるだけ多く）。
    const powers = inter.candidatePowers ?? {};
    const sorted = [...candidates].sort((a, b) => (powers[a] ?? 0) - (powers[b] ?? 0));
    const selected: string[] = [];
    let sum = 0;
    for (const n of sorted) {
      const p = powers[n] ?? 0;
      if (sum + p > inter.totalPowerMax) continue;
      sum += p;
      selected.push(n);
    }
    return selected;
  }
  const count = typeof inter.count === 'number' ? inter.count : 1;
  const intent = targetIntentFor(inter, ctx.policy);
  let ordered: string[];
  if (intent === 'unknown') {
    ordered = rngShuffle(candidates);
  } else if (intent === 'cost') {
    // 🆕§5.7 `S-22`＝手放す札は**価値の低い順**（持ち主で分けない＝候補は全部自分の置き場にある）。
    const value = (id: string) => cardValue(id, ctx, inter.candidatePowers);
    ordered = [...candidates].sort((a, b) => value(a) - value(b));
  } else {
    const favorable = (id: string) => (intent === 'harm') !== isCpuOwned(id, cpuState);
    // 🆕§5.7 `S-32`＝**固有のカード指定**（狙う／狙わない）を価値に足し引きする。
    const value = (id: string) =>
      cardValue(id, ctx, inter.candidatePowers, ctx.targetBonus?.(id, inter.candidatePowers?.[id]) ?? 0);
    // 🆕§5.7 `S-32`＝**大まかな指示**。⚠**既定は `strongest`＝`S-22` のときと同じ並び**。
    const mode = ctx.targetMode ?? 'strongest';
    const kills = (id: string) => targetKillableBy(
      inter.thenAction as { type?: string; delta?: unknown; value?: unknown }, id, inter.candidatePowers) === true;
    /** 良い側の並び＝`weakest` は価値の低い順、`killable` は**落とせるものを先に**（その中は価値の高い順）。 */
    const rankGood = (a: string, b: string) => (mode === 'weakest' ? value(a) - value(b)
      : mode === 'killable' ? (Number(kills(b)) - Number(kills(a))) || (value(b) - value(a))
        : value(b) - value(a));
    const good = candidates.filter(favorable).sort(rankGood);
    const bad = candidates.filter(id => !favorable(id)).sort((a, b) => value(a) - value(b));
    ordered = inter.optional ? good : [...good, ...bad];
  }
  const minCount = inter.optional ? 0 : count;
  if (inter.selectionConstraint?.totalLevelExact !== undefined) {
    const exact = findValidConstrainedSelection(ordered, minCount, count, inter.selectionConstraint, cardMap);
    if (exact) return exact;
  }
  const selected: string[] = [];
  for (const n of ordered) {
    if (selected.length >= count) break;
    if (canAddToSelection(selected, n, inter.selectionConstraint, cardMap)) selected.push(n);
  }
  return selected;
}

// ── 選択肢から選ぶ（CHOOSE）───────────────────────────────────

/**
 * 「断る」肢か。🔴**`declines` の印だけでは足りない**＝engine の「してもよい」系は大半が
 * **ID（`skip` 64箇所・`none`・`no`）とラベル（「〜しない」「支払わない」「スキップ」）**で断る側を表す（2026-09-17 実測）。
 * 印だけで見ると「支払う／支払わない」が「AかB」扱いになり、**乱数で半分は支払わない**（実機 6シナリオが FAIL した）。
 */
export function isDeclineOption(o: { id: string; label: string; declines?: boolean }): boolean {
  if (o.declines) return true;
  if (/^(skip|none|no|decline)$/.test(o.id)) return true;
  return /^スキップ$|(しない|支払わない|使わない|出さない|引かない|払わない)$/.test(o.label.trim());
}

/**
 * 選択肢の選び方。戻り値は `handleEffectInteraction` へそのまま渡す形
 * （支払いのある肢は `[肢ID, ...支払うエナの instanceId]`）。
 * - カード名の宣言（`namePool`）＝名前順の先頭（旧実装と同じ）。
 * - 複数選択＝押せる肢から**乱数で** `count` 個（`allowRepeat` は巡回して埋める）。
 * - 断る肢（`isDeclineOption`）がある＝**する側**を選ぶ。支払いがあれば払えるときだけ（払えなければ断る）。
 * - それ以外（「AかB」）＝押せる肢から**乱数**。
 */
export function pickCpuChoice(inter: Inter<'CHOOSE'>, ctx: CpuInteractionCtx): string[] {
  if (inter.namePool) return declareNameCandidates(ctx.cardMap, inter.namePool, '', 1);
  const avail = inter.options.filter(o => o.available);
  if (inter.multiSelect) {
    if (inter.allowRepeat && avail.length > 0) {
      // 「同じ選択肢を２回以上選んでもよい」（§6.4 O-29）＝肢の数より多く選べるので巡回して埋める（過少にしない）。
      const order = rngShuffle(avail);
      return Array.from({ length: inter.count }, (_, i) => order[i % order.length].id);
    }
    return rngShuffle(avail).slice(0, inter.count).map(o => o.id);
  }
  if (avail.length === 0) return inter.options[0] ? [inter.options[0].id] : [];
  const declineOpt = avail.find(isDeclineOption);
  const acceptOpts = avail.filter(o => !isDeclineOption(o));
  const payFor = (opt: typeof avail[number]): string[] | null => {
    if (!opt.costColors?.length) return [opt.id];
    // ⚠支払いのある肢は**肢IDだけでは払えない**（タスク12(cii)）＝支払うエナの instanceId を後ろに付ける。
    //   選べないのに `available` だった場合は null（＝その肢は選ばない）。
    const paid = selectOptionalCostEnergy(opt.costColors, ctx.cpuState, ctx.cardMap);
    if (paid && !reserveKeptAfterPaying(ctx.energyReserve, ctx.cpuState.energy, paid)) return null;
    return paid ? [opt.id, ...paid] : null;
  };
  if (declineOpt && acceptOpts.length > 0) {
    for (const opt of rngShuffle(acceptOpts)) {
      const answer = payFor(opt);
      if (answer) return answer;
    }
    return [declineOpt.id];
  }
  for (const opt of rngShuffle(avail)) {
    const answer = payFor(opt);
    if (answer) return answer;
  }
  return [avail[0].id];
}

// ── サーチ（SEARCH）───────────────────────────────────────────

/** サーチ＝自分のデッキからなら**価値の高い順**（相手のデッキなら表示順）に `maxPick` 枚まで。制約は engine の判定を通す。 */
export function pickCpuSearch(inter: Inter<'SEARCH'>, ctx: CpuInteractionCtx): string[] {
  const count = inter.maxPick ?? 0;
  // 🆕`SELECT_TARGET` と同じ＝**場に出せない候補は選ばない**（`O-534`）。
  const visible = (inter.unplaceableCards ?? []).length > 0
    ? inter.visibleCards.filter(n => !inter.unplaceableCards!.includes(n))
    : inter.visibleCards;
  const ordered = inter.deckOwner === 'opponent'
    ? [...visible]
    : [...visible].sort((a, b) => cardValue(b, ctx) - cardValue(a, ctx));
  if (inter.selectionConstraint?.totalLevelExact !== undefined) {
    const exact = findValidConstrainedSelection(ordered, inter.optional ? 0 : count, count, inter.selectionConstraint, ctx.cardMap);
    if (exact) return exact;
  }
  const selected: string[] = [];
  for (const n of ordered) {
    if (selected.length >= count) break;
    if (canAddToSelection(selected, n, inter.selectionConstraint, ctx.cardMap)) selected.push(n);
  }
  return selected;
}

// ── パワーの割り振り（ALLOCATE_POWER）─────────────────────────

/**
 * パワーの割り振り＝`unit` 刻みで総量ちょうど。
 * - マイナス＝**相手のシグニを、落とせる（パワー0以下にできる）ものから**必要なぶんずつ。余りは相手の価値が高い順→自分。
 * - プラス＝**自分の価値が一番高いシグニ**へ全部（自分が居なければ先頭）。
 */
export function pickCpuAllocatePower(inter: Inter<'ALLOCATE_POWER'>, ctx: CpuInteractionCtx): Record<string, number> {
  const alloc: Record<string, number> = {};
  if (inter.targets.length === 0) return alloc;
  const unit = Math.max(1, Math.abs(inter.unit || 1000));
  const value = (id: string) => cardValue(id, ctx);
  const own = (id: string) => isCpuOwned(id, ctx.cpuState);
  if (inter.total >= 0) {
    const best = [...inter.targets].sort((a, b) => (Number(own(b)) - Number(own(a))) || (value(b) - value(a)))[0];
    alloc[best] = inter.total;
    return alloc;
  }
  let remaining = Math.abs(inter.total);
  const printed = (id: string) => parseInt(ctx.cardMap.get(getCardNum(id))?.Power ?? '', 10) || 0;
  const opp = inter.targets.filter(id => !own(id)).sort((a, b) => printed(a) - printed(b));
  for (const id of opp) {
    const need = Math.ceil(printed(id) / unit) * unit;
    if (need <= 0 || need > remaining) continue;
    alloc[id] = -need;
    remaining -= need;
  }
  if (remaining > 0) {
    const rest = [...opp].sort((a, b) => value(b) - value(a))[0]
      ?? [...inter.targets].sort((a, b) => value(a) - value(b))[0];
    alloc[rest] = (alloc[rest] ?? 0) - remaining;
  }
  return alloc;
}

// ── ゾーン・配置し直し ────────────────────────────────────────

/** ウィルスを置くゾーン＝パワー修正つきならシグニの居るゾーン優先（修正を活かす）、そうでなければウィルスの無いゾーン。 */
export function pickCpuVirusZone(inter: Inter<'SELECT_VIRUS_ZONE'>, target: PlayerState): number | null {
  const virus = target.field.signi_virus ?? [0, 0, 0];
  const hasSigni = (zi: number) => (target.field.signi[zi]?.length ?? 0) > 0;
  if (inter.powerDeltaOnZone !== undefined) {
    return [0, 1, 2].find(zi => hasSigni(zi) && (virus[zi] ?? 0) === 0)
      ?? [0, 1, 2].find(zi => hasSigni(zi))
      ?? 0;
  }
  return [0, 1, 2].find(zi => (virus[zi] ?? 0) === 0) ?? null;
}

/** シグニを置くゾーン＝最初の空きゾーン（無ければ null＝応答しない）。 */
export function pickCpuEmptySigniZone(target: PlayerState): number | null {
  return [0, 1, 2].find(zi => !(target.field.signi[zi]?.length)) ?? null;
}

/** 配置し直し＝任意なら現状維持（null）。交換が必須の形だけ先頭から必要数を選ぶ。 */
export function pickCpuRearrange(inter: Inter<'REARRANGE_SIGNI'>): string[] | null {
  if (inter.mode === 'swap_pair' && !inter.optional) return inter.signiNums.slice(0, 2);
  if (inter.mode === 'swap' && !inter.optional
    && (inter.swapSourceLocation === 'energy' || inter.swapSourceLocation === 'trash')) return inter.signiNums.slice(0, 1);
  return null;
}
