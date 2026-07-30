import type { PlayerState } from '../../types';
import type { CardEffect } from '../../types/effects';

/** 「次に」だけ発火する一時付与AUTOを、最初の該当イベント収集時に消費する。 */
export function consumeTriggeredGrantedAutos(state: PlayerState, triggered: CardEffect[]): PlayerState {
  const ids = new Set(triggered.filter(e => e.consumeOnTrigger).map(e => e.effectId));
  if (ids.size === 0) return state;
  return {
    ...state,
    lrig_granted_auto_effects: (state.lrig_granted_auto_effects ?? []).filter(e => !ids.has(e.effectId)),
  };
}
