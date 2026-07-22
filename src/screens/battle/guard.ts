import type { CardData, PlayerState } from '../../types';
import type { CardEffect, StubAction } from '../../types/effects';
import { getCardNum } from '../../engine/execUtils';

/** 現在の所有者盤面で、手札のカードを【ガード】として使用できるかを判定する。 */
export function canCardGuard(
  cardNum: string,
  ownerState: PlayerState,
  cardMap: Map<string, CardData>,
  effectsMap: Map<string, CardEffect[]>,
): boolean {
  const baseCardNum = getCardNum(cardNum);
  if (cardMap.get(baseCardNum)?.Guard !== '1') return false;

  const guardLoss = (effectsMap.get(baseCardNum) ?? []).find(effect =>
    effect.effectType === 'CONTINUOUS' &&
    effect.action.type === 'STUB' &&
    effect.action.id === 'GUARD_LOSS_UNLESS_LRIG'
  );
  if (!guardLoss || guardLoss.action.type !== 'STUB') return true;

  const requiredClass = (guardLoss.action as StubAction).lrigClass;
  if (!requiredClass) return true;

  const centerLrigNum = ownerState.field.lrig.at(-1);
  const centerLrigClass = centerLrigNum
    ? cardMap.get(getCardNum(centerLrigNum))?.CardClass ?? ''
    : '';
  return centerLrigClass.includes(requiredClass);
}
