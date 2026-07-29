import type { PlayerState } from '../../types';

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
