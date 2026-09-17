import type { CardData, PendingInteractionDef, PlayerState } from '../../types';
import type { CardEffect } from '../../types/effects';
import { cardStrength } from './cpuCardStrength';
import { canAddToSelection, findValidConstrainedSelection, getCardNum, selectOptionalCostEnergy } from '../../engine/execUtils';
import { shuffle as rngShuffle } from '../../engine/rng';
import { declareNameCandidates } from './declareNameCandidates';

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

export type TargetIntent = 'harm' | 'benefit' | 'unknown';

/** 対象に対するアクションの損得（パワー修正は `delta` の符号）。分からなければ `unknown`＝乱数に回す。 */
export function targetIntentOf(action: { type: string; delta?: unknown } | undefined): TargetIntent {
  if (!action) return 'unknown';
  if (action.type === 'POWER_MODIFY') {
    const d = Number(action.delta);
    return Number.isFinite(d) && d !== 0 ? (d < 0 ? 'harm' : 'benefit') : 'unknown';
  }
  if (HARMFUL_ACTIONS.has(action.type)) return 'harm';
  if (BENEFICIAL_ACTIONS.has(action.type)) return 'benefit';
  return 'unknown';
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

/** 場のシグニ（どちらかの場のゾーンのトップ）か。 */
function isOnField(id: string, ctx: CpuInteractionCtx): boolean {
  return [ctx.cpuState, ctx.oppState].some(st => st.field.signi.some(stack => stack?.includes(id)));
}

/**
 * カードの価値＝**強さ（パワー＋効果の点数）**を主、レベルを従にした数（§5.7 `S-1`）。
 * 場のシグニは `field` 文脈（【出】は済んでいる）、手札・デッキ等は `deploy` 文脈で測る。
 * 効果の一覧が無ければパワーだけ（旧挙動）。
 */
function cardValue(id: string, ctx: CpuInteractionCtx, powers?: Record<string, number>): number {
  const card = ctx.cardMap.get(getCardNum(id));
  const effects = ctx.effectsOf?.(id) ?? [];
  const strength = cardStrength(card, effects, isOnField(id, ctx) ? 'field' : 'deploy', powers?.[id]);
  return strength * 100 + (parseInt(card?.Level ?? '', 10) || 0);
}

// ── 対象を選ぶ（SELECT_TARGET）────────────────────────────────

/**
 * 対象の選び方。
 * - 害（除去・ダウン・マイナス修正…）＝**相手の価値が高い順**、相手の候補が尽きたら**自分の価値が低い順**。
 * - 得（強化・付与・アップ…）＝**自分の価値が高い順**、尽きたら相手の価値が低い順。
 * - 🔑**任意（`optional`）なら損になる対象は選ばない**＝害を自分に／得を相手に与える候補しか無ければ0体で止める。
 * - 損得が分からなければ乱数（旧実装と同じ）。
 */
export function pickCpuTargets(inter: Inter<'SELECT_TARGET'>, ctx: CpuInteractionCtx): string[] {
  const { cardMap, cpuState } = ctx;
  if (inter.totalPowerMax !== undefined) {
    // パワー合計上限つき＝パワーの小さい順に上限まで貪欲に（できるだけ多く）。
    const powers = inter.candidatePowers ?? {};
    const sorted = [...inter.candidates].sort((a, b) => (powers[a] ?? 0) - (powers[b] ?? 0));
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
  const intent = targetIntentOf(inter.thenAction as { type: string; delta?: unknown });
  let ordered: string[];
  if (intent === 'unknown') {
    ordered = rngShuffle(inter.candidates);
  } else {
    const favorable = (id: string) => (intent === 'harm') !== isCpuOwned(id, cpuState);
    const value = (id: string) => cardValue(id, ctx, inter.candidatePowers);
    const good = inter.candidates.filter(favorable).sort((a, b) => value(b) - value(a));
    const bad = inter.candidates.filter(id => !favorable(id)).sort((a, b) => value(a) - value(b));
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
  const ordered = inter.deckOwner === 'opponent'
    ? [...inter.visibleCards]
    : [...inter.visibleCards].sort((a, b) => cardValue(b, ctx) - cardValue(a, ctx));
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
