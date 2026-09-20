import type { CardData } from '../../types';
import { getCardNum } from '../../engine/execUtils';
import type { CardEffect } from '../../types/effects';
import { cardStrength } from './cpuCardStrength';
import type { CpuPolicy } from './cpuPolicy';

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

/**
 * 手放す優先順（先頭ほど手放す）の添字列。
 * 🆕§5.7 `S-1`＝効果の一覧（`effectsOf`）があれば**強さ（パワー＋効果の点数）の低い札から**手放す。無ければ旧挙動（レベルの高い札から）。
 * 【ガード】は常に最後まで残す。
 */
function discardOrder(
  hand: string[], cardMap: Map<string, CardData>, effectsOf?: (id: string) => readonly CardEffect[], keepBonus?: (id: string) => number,
  policy?: CpuPolicy,
): number[] {
  const strength = (num: string) => cardStrength(cardMap.get(getCardNum(num)), effectsOf?.(num) ?? [], 'deploy', undefined, policy) + (keepBonus?.(num) ?? 0);
  return hand.map((_, i) => i).sort((a, b) =>
    Number(isGuard(hand[a], cardMap)) - Number(isGuard(hand[b], cardMap))
    || (effectsOf ? strength(hand[a]) - strength(hand[b]) : levelOf(hand[b], cardMap) - levelOf(hand[a], cardMap))
    || b - a);
}

/**
 * マリガンで戻す手札の添字＝**レベル3以上のシグニ**（【ガード】持ちは除く）。
 * ⚠「戻さない」も正しい選択なので、該当が無ければ空配列（引き直さない）。
 */
export function pickCpuMulliganIndices(hand: string[], cardMap: Map<string, CardData>, keeps?: (id: string) => boolean): number[] {
  return hand.map((num, i) => ({ num, i }))
    // §5.7 `S-2`＝作戦データのキーカード・コンボのパーツは戻さない。
    .filter(({ num }) => cardMap.get(getCardNum(num))?.Type === 'シグニ' && levelOf(num, cardMap) >= 3 && !isGuard(num, cardMap) && !keeps?.(num))
    .map(({ i }) => i);
}

/** 手札上限で捨てる手札の添字（ちょうど `count` 枚。`count` が手札を超えるなら全部）。 */
export function pickCpuHandLimitDiscards(
  hand: string[], count: number, cardMap: Map<string, CardData>, effectsOf?: (id: string) => readonly CardEffect[],
  keepBonus?: (id: string) => number, policy?: CpuPolicy,
): number[] {
  if (count <= 0) return [];
  return discardOrder(hand, cardMap, effectsOf, keepBonus, policy).slice(0, count).sort((a, b) => a - b);
}

/**
 * 🆕§5.7 `S-1`＝**エナチャージする手札**の添字＝強さの低い札（【ガード】は最後）。
 * ⚠ルリグのレベルより2以上高いシグニは、しばらく出せないので**強さを割り引く**（エナに回しやすくする）。
 * 旧実装は「手札の先頭1枚」固定だった（強い札でもエナに置いていた）。
 * @returns 手札が空なら -1
 */
export function pickCpuEnergyChargeIndex(
  hand: string[], cardMap: Map<string, CardData>, effectsOf: (id: string) => readonly CardEffect[], lrigLevel: number,
  keepBonus?: (id: string) => number, policy?: CpuPolicy,
): number {
  if (hand.length === 0) return -1;
  const keepValue = (num: string) => {
    const card = cardMap.get(getCardNum(num));
    const base = cardStrength(card, effectsOf(num), 'deploy', undefined, policy);
    // §5.7 `S-2`＝作戦データのキーカード・コンボのパーツは残す（加点）。
    return (card?.Type === 'シグニ' && levelOf(num, cardMap) >= lrigLevel + 2 ? base * 0.6 : base) + (keepBonus?.(num) ?? 0);
  };
  return hand.map((_, i) => i).sort((a, b) =>
    Number(isGuard(hand[a], cardMap)) - Number(isGuard(hand[b], cardMap))
    || keepValue(hand[a]) - keepValue(hand[b])
    || a - b)[0];
}
