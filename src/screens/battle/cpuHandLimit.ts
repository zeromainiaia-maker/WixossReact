import type { CardData } from '../../types';
import { getCardNum } from '../../engine/execUtils';

/**
 * CPU の**マリガンで戻す札**と**手札上限で捨てる札**（§5.6 `C-4`・2026-09-17）。
 *
 * ■ 規律（§5.6.3）＝ここは「どれを選ぶか」だけ。実行は人間と同じ `applyMulligan`（`mulligan.ts`）／
 *   エンドフェイズの手札上限は人間の `confirmEndDiscard` と同じ規則（捨てた札の「手札からトラッシュに置かれたとき」を収集）。
 *
 * ■ なぜ要るか＝旧実装は CPU が**引き直さず**、**手札上限の処理自体が無かった**（§5.6.1）＝
 *   CPU の手札は無限に増え、エンドフェイズの捨て札で誘発する能力が CPU 側で一度も踏まれていなかった。
 *
 * ■ 方針（決定論・強さではなく経路を踏むための最小線）
 *   - 【ガード】を持つ札は残す（C-2 で CPU がガードするようになったので、手放すと守れない）。
 *   - それ以外は**レベルの高い札から**手放す（序盤に出せない札）。同レベルは手札の後ろから。
 */
const levelOf = (num: string, cardMap: Map<string, CardData>): number => {
  const lv = parseInt(cardMap.get(getCardNum(num))?.Level ?? '');
  return Number.isFinite(lv) ? lv : -1;
};
const isGuard = (num: string, cardMap: Map<string, CardData>): boolean => cardMap.get(getCardNum(num))?.Guard === '1';

/** 手放す優先順（先頭ほど手放す）の添字列。 */
function discardOrder(hand: string[], cardMap: Map<string, CardData>): number[] {
  return hand.map((_, i) => i).sort((a, b) =>
    Number(isGuard(hand[a], cardMap)) - Number(isGuard(hand[b], cardMap))
    || levelOf(hand[b], cardMap) - levelOf(hand[a], cardMap)
    || b - a);
}

/**
 * マリガンで戻す手札の添字＝**レベル3以上のシグニ**（【ガード】持ちは除く）。
 * ⚠「戻さない」も正しい選択なので、該当が無ければ空配列（引き直さない）。
 */
export function pickCpuMulliganIndices(hand: string[], cardMap: Map<string, CardData>): number[] {
  return hand.map((num, i) => ({ num, i }))
    .filter(({ num }) => cardMap.get(getCardNum(num))?.Type === 'シグニ' && levelOf(num, cardMap) >= 3 && !isGuard(num, cardMap))
    .map(({ i }) => i);
}

/** 手札上限で捨てる手札の添字（ちょうど `count` 枚。`count` が手札を超えるなら全部）。 */
export function pickCpuHandLimitDiscards(hand: string[], count: number, cardMap: Map<string, CardData>): number[] {
  if (count <= 0) return [];
  return discardOrder(hand, cardMap).slice(0, count).sort((a, b) => a - b);
}
