/** 人間向け固定枚数選択で、実際に要求できる枚数。任意選択の上限は宣言値を維持する。 */
export function fixedSelectionPickLimit(requestedCount: number, candidateCount: number, optional: boolean): number {
  return optional ? requestedCount : Math.min(requestedCount, candidateCount);
}

/** 固定枚数選択の枚数条件。集合制約やパワー合計制約は呼び出し側で別途評価する。 */
export function fixedSelectionCountCanConfirm(
  selectedCount: number,
  requestedCount: number,
  candidateCount: number,
  optional: boolean,
): boolean {
  return optional || selectedCount >= fixedSelectionPickLimit(requestedCount, candidateCount, optional);
}
