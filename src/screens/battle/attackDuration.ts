import type { PlayerState } from '../../types';

/** Clear only effects whose lifetime is the just-resolved attack. */
export function clearEndOfAttackEffects(attacker: PlayerState): PlayerState {
  if (!attacker.prevent_opp_guard) return attacker;
  return { ...attacker, prevent_opp_guard: undefined };
}
