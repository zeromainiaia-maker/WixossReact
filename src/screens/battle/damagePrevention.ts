import type { PlayerState } from '../../types';

export type DamageSourceContext = { type: 'lrig' | 'signi'; level?: number };

export function consumeNextDamagePrevention(
  state: PlayerState,
  source?: DamageSourceContext,
): PlayerState | undefined {
  if ((state.prevent_next_damage ?? 0) > 0) {
    return { ...state, prevent_next_damage: state.prevent_next_damage! - 1 };
  }
  const reservations = state.prevent_next_damage_reservations ?? [];
  const index = reservations.findIndex(r =>
    (!r.damageSource || r.damageSource === source?.type)
    && (r.sourceLevelLt === undefined
      || (source?.type === 'signi' && source.level !== undefined && source.level < r.sourceLevelLt)));
  if (index < 0) return undefined;
  const hit = reservations[index];
  const next = reservations.flatMap((r, i) =>
    i !== index ? [r] : r.count > 1 ? [{ ...r, count: r.count - 1 }] : []);
  return {
    ...state,
    prevent_next_damage_reservations: next,
    turn_end_mill_count: (state.turn_end_mill_count ?? 0) + (hit.millAtTurnEndPerPrevented ?? 0),
  };
}

export function resolveTurnEndPreventionMill(state: PlayerState): { state: PlayerState; milled: string[] } {
  const count = Math.min(state.turn_end_mill_count ?? 0, state.deck.length);
  const milled = state.deck.slice(0, count);
  return {
    state: {
      ...state,
      deck: state.deck.slice(count),
      trash: [...state.trash, ...milled],
      turn_end_mill_count: undefined,
    },
    milled,
  };
}
