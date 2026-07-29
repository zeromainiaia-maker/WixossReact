import type { CardData } from '../../types';
import type { EffectCost } from '../../types/effects';

/** 通常召喚UIとengineの双方で使う、ルリグデッキのアーツ徴収候補判定。 */
export function matchesTrashArtsFromLrigDeckCost(
  card: CardData | undefined,
  cost: NonNullable<EffectCost['trashArtsFromLrigDeck']>,
): boolean {
  return card?.Type === 'アーツ' && (!cost.color || card.Color?.includes(cost.color));
}
