import type { PlayerState } from '../../types';

/** Clear only effects whose lifetime is the just-resolved attack. */
export function clearEndOfAttackEffects(state: PlayerState): PlayerState {
  const windows = state.prevent_damage_windows?.filter(w => w.expires !== 'END_OF_ATTACK');
  const unchangedWindows = windows?.length === state.prevent_damage_windows?.length;
  if (!state.prevent_opp_guard && unchangedWindows) return state;
  return {
    ...state,
    prevent_opp_guard: undefined,
    prevent_damage_windows: windows?.length ? windows : undefined,
  };
}

/** Clear delayed watchers whose lifetime is the attack phase that just ended. */
export function clearEndOfAttackPhaseDelayedTriggers(state: PlayerState): PlayerState {
  const delayed = state.delayed_triggers?.filter(dt => dt.duration !== 'THIS_ATTACK_PHASE');
  if (delayed?.length === state.delayed_triggers?.length) return state;
  return { ...state, delayed_triggers: delayed?.length ? delayed : undefined };
}
