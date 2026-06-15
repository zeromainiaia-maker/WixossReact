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
  bonds?: string[], // 絆アイコン効果チェック用（プレイヤーが絆獲得済みのカード名一覧）
  extraGrants?: Record<string, string[]>, // UNTIL_OPP_TURN_END で付与されたキーワード
): boolean {
  const card = cardMap.get(cardNum);
  if (card?.effects?.some(e => {
    if (e.effectType !== 'CONTINUOUS') return false;
    if (e.action.type !== 'GRANT_KEYWORD') return false;
    if ((e.action as { keyword: string }).keyword !== keyword) return false;
    if (e.activeCondition) return false; // 条件付き付与は呼び出し元で checkActiveCondition により動的評価
    if (e.kizunaIcon) {
      if (!bonds) return false;
      if (!bonds.includes(card?.CardName ?? '')) return false;
    }
    return true;
  })) return true;
  if (keywordGrants?.[cardNum]?.includes(keyword)) return true;
  return extraGrants?.[cardNum]?.includes(keyword) ?? false;
}

/**
 * シグニがシャドウを持つかチェックする（hasKeyword の糖衣構文）。
 */
export function hasShadow(
  cardNum: string,
  cardMap: Map<string, CardData>,
  keywordGrants?: Record<string, string[]>,
  bonds?: string[],
  extraGrants?: Record<string, string[]>,
): boolean {
  return hasKeyword(cardNum, 'シャドウ', cardMap, keywordGrants, bonds, extraGrants);
}

/**
 * シグニがシャドウ(ルリグ)を持つかチェックする。
 * 「ルリグの効果によっては対象にされない」キーワード。
 */
export function hasShadowLrig(
  cardNum: string,
  cardMap: Map<string, CardData>,
  keywordGrants?: Record<string, string[]>,
  extraGrants?: Record<string, string[]>,
): boolean {
  return hasKeyword(cardNum, 'シャドウ（ルリグ）', cardMap, keywordGrants, undefined, extraGrants);
}

/**
 * シグニがバニッシュ耐性（バニッシュされない）を持つかチェックする。
 * effects.json 未登録カードは EffectText の直接検索でフォールバックする。
 */
export function hasBanishResist(
  cardNum: string,
  cardMap: Map<string, CardData>,
  keywordGrants?: Record<string, string[]>,
  extraGrants?: Record<string, string[]>,
): boolean {
  if (hasKeyword(cardNum, 'バニッシュされない', cardMap, keywordGrants, undefined, extraGrants)) return true;
  // effects.json 未登録カード用フォールバック
  const card = cardMap.get(cardNum);
  return card?.EffectText?.includes('バニッシュされない') ?? false;
}
