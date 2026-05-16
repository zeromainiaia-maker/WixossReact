import type { CardData } from '../types';

/**
 * シグニがキーワード能力を持つかチェックする。
 * - card.effects の CONTINUOUS GRANT_KEYWORD（先天的 / 恒久付与）
 * - keywordGrants[cardNum]（ターン内の動的付与）
 * の両方を確認する。
 */
export function hasKeyword(
  cardNum: string,
  keyword: string,
  cardMap: Map<string, CardData>,
  keywordGrants?: Record<string, string[]>,
): boolean {
  const card = cardMap.get(cardNum);
  if (
    card?.effects?.some(
      e =>
        e.effectType === 'CONTINUOUS' &&
        e.action.type === 'GRANT_KEYWORD' &&
        (e.action as { keyword: string }).keyword === keyword,
    )
  )
    return true;
  return keywordGrants?.[cardNum]?.includes(keyword) ?? false;
}

/**
 * シグニがシャドウを持つかチェックする（hasKeyword の糖衣構文）。
 */
export function hasShadow(
  cardNum: string,
  cardMap: Map<string, CardData>,
  keywordGrants?: Record<string, string[]>,
): boolean {
  return hasKeyword(cardNum, 'シャドウ', cardMap, keywordGrants);
}
