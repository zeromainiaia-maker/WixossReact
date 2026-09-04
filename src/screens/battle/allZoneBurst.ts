import type { CardData, PlayerState } from '../../types';
import type { CardEffect, EffectAction, StubAction } from '../../types/effects';
import { matchesFilter } from '../../engine/execUtils';

export function resolveAllZoneBurstGrant(
  state: PlayerState,
  effectsMap: Map<string, CardEffect[]>,
  includeTemporary: boolean,
  /**
   * 🆕**§5.3 `O-239`（2026-09-04）＝いま判定しているライフクロス**。渡すと
   * 「このターン、N枚目までにチェックゾーンへ置かれたライフクロスは【ライフバースト】…を得る」
   * （`nth_checked_burst_grant_this_turn`）も見る。
   * ⚠**省略すると順序つきの付与は1件も効かない**＝呼び出し側は必ず渡す。
   */
  cardNum?: string,
): StubAction | null {
  // 🆕**§5.3 `O-239`**＝順序つきの付与を先に見る（`GRANT_ALL_ZONE_LIFEBURST` とは軸が別）。
  //   ⚠**「置かれた順」で判定する**＝枚数（`life_crashed_this_turn`）ではダブルクラッシュの
  //     1枚目/2枚目を区別できない。
  const nth = state.nth_checked_burst_grant_this_turn;
  if (nth && cardNum) {
    const ordinal = (state.checked_life_order_this_turn ?? []).indexOf(cardNum) + 1;
    if (ordinal >= 1 && ordinal <= nth.maxOrdinal) {
      return { type: 'STUB', id: 'GRANT_ALL_ZONE_LIFEBURST', burstAction: nth.action } as StubAction;
    }
  }
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
  const grant = resolveAllZoneBurstGrant(ownerState, effectsMap, includeTemporary, cardNum);
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
  const grant = resolveAllZoneBurstGrant(ownerState, effectsMap, includeTemporary, cardNum);
  return allZoneBurstGrantMatches(cardNum, ownerState, cardMap, effectsMap, includeTemporary)
    && (!!grant?.burstAdditive || !hasNativeLifeBurst(cardNum, cardMap, effectsMap));
}

export function clearAllZoneBurstGrantUntilOppTurn(state: PlayerState): PlayerState {
  return { ...state, allzone_burst_grant_until_opp_turn: undefined };
}
