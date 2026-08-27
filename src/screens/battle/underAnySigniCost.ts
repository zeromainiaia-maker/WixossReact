import type { CardData, PlayerState } from '../../types';
import type { SelectionConstraint, TargetFilter } from '../../types/effects';

export interface UnderAnySigniCandidate {
  cardNum: string;
  zone: number;
  index: number;
}

/** 自分の全シグニの下（各スタックの最上段を除く）を左のゾーンから列挙する。 */
export function underAnySigniCostCandidates(state: PlayerState): UnderAnySigniCandidate[] {
  return state.field.signi.flatMap((stack, zone) =>
    (stack ?? []).slice(0, -1).map((cardNum, index) => ({ cardNum, zone, index })));
}

export function canPayUnderAnySigniTrash(state: PlayerState, count: number): boolean {
  return underAnySigniCostCandidates(state).length >= count;
}

/** UIで選んだ候補を取り除く。複数シグニを跨ぐ選択を同じ規則で処理する。 */
export function payUnderAnySigniTrash(
  state: PlayerState,
  selected: ReadonlySet<string>,
  count: number,
): { state: PlayerState; moved: string[] } | null {
  const candidates = underAnySigniCostCandidates(state);
  const picked = candidates.filter(c => selected.has(`${c.zone}:${c.index}`));
  if (picked.length !== count) return null;
  const pickedKeys = new Set(picked.map(c => `${c.zone}:${c.index}`));
  const signi = state.field.signi.map((stack, zone) => {
    if (!stack) return stack;
    return stack.filter((_, index) => index === stack.length - 1 || !pickedKeys.has(`${zone}:${index}`));
  }) as (string[] | null)[];
  const moved = picked.map(c => c.cardNum);
  return {
    state: { ...state, field: { ...state.field, signi }, trash: [...state.trash, ...moved] },
    moved,
  };
}

function getCard(cardNum: string, cardMap?: Map<string, CardData>): CardData | undefined {
  const hash = cardNum.indexOf('#');
  return cardMap?.get(hash > 0 ? cardNum.slice(0, hash) : cardNum);
}

/**
 * ⚠honor するのは `cardType` **だけ**（engine の `matchesFilter` は execUtils→当モジュールの
 * import 方向と逆になるためここでは使えない）。他フィールドを持つ filter を黙って通すと
 * 「限定を無視した過剰支払い」になるので、**parser 側の生成語彙を cardType に限定して**釣り合いを取る
 * （`effectParser.ts` の underSelfTrash regex／goldenTest の「filter は cardType のみ」lock-in）。
 * 種別を増やすときは3箇所セットで拡張すること。
 */
function matchesUnderSelfFilter(card: CardData | undefined, filter?: TargetFilter): boolean {
  if (!filter) return true;
  if (filter.cardType) {
    const types = Array.isArray(filter.cardType) ? filter.cardType : [filter.cardType];
    if (!types.includes(card?.Type as never)) return false;
  }
  return true;
}

function satisfiesUnderSelfConstraint(
  candidates: UnderAnySigniCandidate[],
  constraint: SelectionConstraint | undefined,
  cardMap?: Map<string, CardData>,
): boolean {
  if (!constraint || candidates.length < 2) return true;
  if (constraint.same === 'name') {
    const names = candidates.map(c => getCard(c.cardNum, cardMap)?.CardName);
    if (names.some(name => name == null) || new Set(names).size !== 1) return false;
  }
  // 🆕`same:'level'`（2026-08-27・Sheet1 B11）＝`execUtils` の同名判定と**同じ規約**（不明は fail-closed）。
  // ⚠片方だけ実装すると入口によって払えたり払えなかったりする（§5-8′）。
  if (constraint.same === 'level') {
    const levels = candidates.map(c => getCard(c.cardNum, cardMap)?.Level ?? '');
    if (levels.some(v => !/^\d+$/.test(v)) || new Set(levels).size !== 1) return false;
  }
  return true;
}

/** 指定ゾーンのシグニの下（最上段を除く）だけを列挙する。「このシグニの下から」用。 */
export function underSelfCostCandidates(
  state: PlayerState,
  zoneIdx: number,
  cardMap?: Map<string, CardData>,
  filter?: TargetFilter,
): UnderAnySigniCandidate[] {
  const stack = state.field.signi[zoneIdx] ?? [];
  return stack.slice(0, -1)
    .map((cardNum, index) => ({ cardNum, zone: zoneIdx, index }))
    .filter(candidate => matchesUnderSelfFilter(getCard(candidate.cardNum, cardMap), filter));
}

export function canPayUnderSelfTrash(
  state: PlayerState,
  zoneIdx: number,
  count: number,
  cardMap?: Map<string, CardData>,
  filter?: TargetFilter,
  selectionConstraint?: SelectionConstraint,
): boolean {
  const candidates = underSelfCostCandidates(state, zoneIdx, cardMap, filter);
  if (candidates.length < count) return false;
  if (!selectionConstraint) return true;
  const pick = (start: number, selected: UnderAnySigniCandidate[]): boolean => {
    if (selected.length === count) return true;
    for (let i = start; i < candidates.length; i++) {
      const next = [...selected, candidates[i]];
      if (satisfiesUnderSelfConstraint(next, selectionConstraint, cardMap) && pick(i + 1, next)) return true;
    }
    return false;
  };
  return pick(0, []);
}

export function payUnderSelfTrash(
  state: PlayerState,
  zoneIdx: number,
  selected: ReadonlySet<string>,
  count: number,
  cardMap?: Map<string, CardData>,
  filter?: TargetFilter,
  selectionConstraint?: SelectionConstraint,
): { state: PlayerState; moved: string[] } | null {
  const candidates = underSelfCostCandidates(state, zoneIdx, cardMap, filter);
  const picked = candidates.filter(c => selected.has(`${c.zone}:${c.index}`));
  if (picked.length !== count || !satisfiesUnderSelfConstraint(picked, selectionConstraint, cardMap)) return null;
  const pickedIndices = new Set(picked.map(c => c.index));
  const signi = state.field.signi.map((stack, zone) => {
    if (!stack || zone !== zoneIdx) return stack;
    return stack.filter((_, index) => index === stack.length - 1 || !pickedIndices.has(index));
  }) as (string[] | null)[];
  const moved = picked.map(c => c.cardNum);
  return {
    state: { ...state, field: { ...state.field, signi }, trash: [...state.trash, ...moved] },
    moved,
  };
}
