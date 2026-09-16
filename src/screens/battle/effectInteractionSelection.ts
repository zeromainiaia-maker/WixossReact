/**
 * 人間向け固定枚数選択で、実際に要求できる枚数。任意選択の上限は宣言値を維持する。
 *
 * 🆕🔴**§5.3 `O-530`（2026-09-16）＝`constrainedMax`（集合制約のもとで実際に選べる最大枚数）を受け取る。**
 *   🔴これが無いと「それぞれレベルの異なるシグニ４枚を〜」で**トラッシュに4種類のレベルが無い**とき、
 *     確定条件（`count` 枚ちょうど ∧ 制約を満たす）が永久に成立せず**決定ボタンが押せない＝実機が詰む**。
 *   ⇒ **「可能な限り実行する」**＝選べるところまで選ばせ、足りない回は engine 側
 *     （`resumeSelectTarget`）が直後の「そうした場合」を落とす。
 *   ⚠呼び出し側が渡さなければ従来どおり（`undefined`＝制約なし）。
 */
export function fixedSelectionPickLimit(
  requestedCount: number,
  candidateCount: number,
  optional: boolean,
  constrainedMax?: number,
): number {
  if (optional) return requestedCount;
  return Math.min(requestedCount, candidateCount, constrainedMax ?? Number.POSITIVE_INFINITY);
}

/** 固定枚数選択の枚数条件。集合制約やパワー合計制約は呼び出し側で別途評価する。 */
export function fixedSelectionCountCanConfirm(
  selectedCount: number,
  requestedCount: number,
  candidateCount: number,
  optional: boolean,
  constrainedMax?: number,
): boolean {
  return optional || selectedCount >= fixedSelectionPickLimit(requestedCount, candidateCount, optional, constrainedMax);
}
