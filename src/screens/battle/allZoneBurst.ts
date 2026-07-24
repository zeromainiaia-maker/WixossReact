import type { CardData, PlayerState } from '../../types';
import type { CardEffect, EffectAction, StubAction } from '../../types/effects';
import { matchesFilter } from '../../engine/execUtils';

export function resolveAllZoneBurstGrant(
  state: PlayerState,
  effectsMap: Map<string, CardEffect[]>,
  includeTemporary: boolean,
): StubAction | null {
  const cards: string[] = [];
  for (const stack of state.field.signi) {
    const top = stack?.at(-1);
    if (top) cards.push(top);
  }
  const lrigs = [
    state.field.lrig.at(-1),
    (state.field.assist_lrig_l ?? []).at(-1),
    (state.field.assist_lrig_r ?? []).at(-1),
  ];
  for (const top of lrigs) if (top) cards.push(top);
  for (const cardNum of cards) {
    for (const effect of effectsMap.get(cardNum) ?? []) {
      if (effect.effectType !== 'CONTINUOUS') continue;
      const action = effect.action as StubAction;
      if (action.type === 'STUB' && action.id === 'GRANT_ALL_ZONE_LIFEBURST') return action;
    }
  }
  return includeTemporary ? (state.allzone_burst_grant_until_opp_turn ?? null) : null;
}

export function allZoneBurstGrantMatches(
  cardNum: string,
  ownerState: PlayerState,
  cardMap: Map<string, CardData>,
  effectsMap: Map<string, CardEffect[]>,
  includeTemporary: boolean,
): boolean {
  const grant = resolveAllZoneBurstGrant(ownerState, effectsMap, includeTemporary);
  return !!grant && (!grant.burstFilter || matchesFilter(cardMap.get(cardNum), grant.burstFilter));
}

export function hasNativeLifeBurst(
  cardNum: string,
  cardMap: Map<string, CardData>,
  effectsMap: Map<string, CardEffect[]>,
): boolean {
  return cardMap.get(cardNum)?.LifeBurst === '1'
    || (effectsMap.get(cardNum) ?? []).some(effect => effect.effectType === 'LIFE_BURST');
}

export function grantedAllZoneBurstAction(grant: StubAction | null): EffectAction {
  return grant?.burstAction
    ?? { type: 'BANISH', target: { type: 'SIGNI', owner: 'opponent', count: 1, filter: { cardType: 'シグニ' }, upToCount: false } };
}

export function shouldAddGrantedAllZoneBurst(
  cardNum: string,
  ownerState: PlayerState,
  cardMap: Map<string, CardData>,
  effectsMap: Map<string, CardEffect[]>,
  includeTemporary: boolean,
): boolean {
  const grant = resolveAllZoneBurstGrant(ownerState, effectsMap, includeTemporary);
  return allZoneBurstGrantMatches(cardNum, ownerState, cardMap, effectsMap, includeTemporary)
    && (!!grant?.burstAdditive || !hasNativeLifeBurst(cardNum, cardMap, effectsMap));
}

export function clearAllZoneBurstGrantUntilOppTurn(state: PlayerState): PlayerState {
  return { ...state, allzone_burst_grant_until_opp_turn: undefined };
}
