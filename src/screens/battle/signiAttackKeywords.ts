import type { CardData, PlayerState } from '../../types';
import type { GrantKeywordAction } from '../../types/effects';
import { hasApplicableAssassin, hasKeyword, isKeywordAbilityRemoved } from '../../utils/keywords';
import { activeFieldGrantKeywordsForSigni } from '../../engine/effectEngine';

export interface SigniAttackKeywordState {
  isAssassin: boolean;
  isLancer: boolean;
  lancerKeywords: string[];
  isSLancer: boolean;
  isDoubleCrush: boolean;
  isTripleCrush: boolean;
  isShoot: boolean;
}

/** シグニアタック解決が実際に消費するキーワードを1か所で判定する純関数。 */
export function getSigniAttackKeywordState(
  cardNum: string,
  attacker: PlayerState,
  defender: PlayerState,
  cardMap: Map<string, CardData>,
  effectivePowers: Map<string, number>,
  continuousKeywords: Iterable<string> = [],
): SigniAttackKeywordState {
  const activeFieldKeywords = activeFieldGrantKeywordsForSigni(attacker, defender, cardNum, cardMap);
  const continuous = [...continuousKeywords]
    .filter(keyword => !isKeywordAbilityRemoved(cardNum, keyword, attacker.keyword_abilities_removed));
  const has = (keyword: string): boolean =>
    hasKeyword(cardNum, keyword, cardMap,
      attacker.keyword_grants, undefined,
      attacker.keyword_grants_until_opp_turn, activeFieldKeywords,
      attacker.abilities_removed, attacker.keyword_abilities_removed)
    || continuous.some(value => value === keyword || value.startsWith(`${keyword}:`));

  const attackKeywords = new Set<string>([
    ...(attacker.keyword_grants?.[cardNum] ?? []),
    ...(attacker.keyword_grants_until_opp_turn?.[cardNum] ?? []),
    ...activeFieldKeywords,
    ...continuous,
    ...((cardMap.get(cardNum)?.effects ?? [])
      .filter(effect => effect.effectType === 'CONTINUOUS' && effect.action.type === 'GRANT_KEYWORD' && !effect.activeCondition)
      .map(effect => (effect.action as GrantKeywordAction).keyword)),
  ].filter(keyword => !isKeywordAbilityRemoved(cardNum, keyword, attacker.keyword_abilities_removed)));

  return {
    isAssassin: !attacker.abilities_removed?.includes(cardNum)
      // ⚠`attacker` も渡す＝「あなたの手札がN枚以下であるかぎり」（`selfHandLte`）は**アタック側**の条件（§6.4 O-28）。
      && hasApplicableAssassin(attackKeywords, defender, cardMap, effectivePowers, attacker),
    isLancer: has('ランサー'),
    lancerKeywords: [...attackKeywords].filter(keyword => keyword === 'ランサー' || keyword.startsWith('ランサー:')),
    isSLancer: has('Sランサー'),
    isDoubleCrush: has('ダブルクラッシュ'),
    isTripleCrush: has('トリプルクラッシュ'),
    isShoot: has('シュート'),
  };
}
