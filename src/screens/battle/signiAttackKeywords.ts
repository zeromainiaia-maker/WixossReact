import type { CardData, PlayerState } from '../../types';
import type { GrantKeywordAction } from '../../types/effects';
import { hasApplicableAssassin, hasKeyword, isKeywordAbilityRemoved } from '../../utils/keywords';

export interface SigniAttackKeywordState {
  isAssassin: boolean;
  isLancer: boolean;
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
  const continuous = [...continuousKeywords]
    .filter(keyword => !isKeywordAbilityRemoved(cardNum, keyword, attacker.keyword_abilities_removed));
  const has = (keyword: string): boolean =>
    hasKeyword(cardNum, keyword, cardMap,
      attacker.keyword_grants, undefined,
      attacker.keyword_grants_until_opp_turn, attacker.field_keyword_grants_active,
      attacker.abilities_removed, attacker.keyword_abilities_removed)
    || continuous.some(value => value === keyword || value.startsWith(`${keyword}:`));

  const assassinKeywords = new Set<string>([
    ...(attacker.keyword_grants?.[cardNum] ?? []),
    ...(attacker.keyword_grants_until_opp_turn?.[cardNum] ?? []),
    ...(attacker.field_keyword_grants_active ?? []),
    ...continuous,
    ...((cardMap.get(cardNum)?.effects ?? [])
      .filter(effect => effect.effectType === 'CONTINUOUS' && effect.action.type === 'GRANT_KEYWORD' && !effect.activeCondition)
      .map(effect => (effect.action as GrantKeywordAction).keyword)),
  ].filter(keyword => !isKeywordAbilityRemoved(cardNum, keyword, attacker.keyword_abilities_removed)));

  return {
    isAssassin: !attacker.abilities_removed?.includes(cardNum)
      && hasApplicableAssassin(assassinKeywords, defender, cardMap, effectivePowers),
    isLancer: has('ランサー'),
    isSLancer: has('Sランサー'),
    isDoubleCrush: has('ダブルクラッシュ'),
    isTripleCrush: has('トリプルクラッシュ'),
    isShoot: has('シュート'),
  };
}
