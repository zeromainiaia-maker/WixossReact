import type { PlayerState } from '../../types';

/** Clear only effects whose lifetime is the just-resolved attack. */
export function clearEndOfAttackEffects(attacker: PlayerState): PlayerState {
  if (!attacker.prevent_opp_guard) return attacker;
  return { ...attacker, prevent_opp_guard: undefined };
}

/** Clear delayed watchers whose lifetime is the attack phase that just ended. */
export function clearEndOfAttackPhaseDelayedTriggers(state: PlayerState): PlayerState {
  const delayed = state.delayed_triggers?.filter(dt => dt.duration !== 'THIS_ATTACK_PHASE');
  if (delayed?.length === state.delayed_triggers?.length) return state;
  return { ...state, delayed_triggers: delayed?.length ? delayed : undefined };
}
