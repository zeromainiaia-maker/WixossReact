import type { PlayerState, TurnPhase } from '../../types';
import { PHASE_NEXT } from './uiConstants';

/** Resolve the next phase while skipping attack steps blocked on the turn player. */
export function resolveNextPhaseWithAttackStepBlocks(
  phase: TurnPhase,
  turnPlayer: Pick<PlayerState, 'blocked_actions'>,
): TurnPhase {
  let next = PHASE_NEXT[phase];
  const blocked = turnPlayer.blocked_actions ?? [];
  if (next === 'ATTACK_SIGNI' && blocked.includes('SIGNI_ATTACK_STEP')) next = PHASE_NEXT[next];
  if (next === 'ATTACK_LRIG' && blocked.includes('LRIG_ATTACK_STEP')) next = PHASE_NEXT[next];
  return next;
}
