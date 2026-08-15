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

/**
 * 「追加のアタックフェイズ」（`ADD_EXTRA_ATTACK_PHASE`・§6.4 O-3）を1件消化する。
 *
 * ATTACK_LRIG の次は通常 `END` だが、ターンプレイヤーが追加フェイズを予約していれば
 * **`ATTACK_ARTS` へ戻す**＝アタックフェイズをもう1周する。
 *
 * 🔑**消化（キューを1件減らす）と遷移先の決定を同じ関数の戻り値でまとめて返す**＝
 * 「次のフェイズを決める側」と「予約を減らす側」が別々の分岐になると、片方だけを直したときに
 * 無限ループ（減らし忘れ）か不発（進めるが減る）になる。
 *
 * ⚠開始時本文（`onStart`）はここで `pending_extra_attack_phase_start_effects` へ移す。
 *   `ON_ATTACK_PHASE_START` の collector がこれを合成エントリとして積む。
 * ⚠CPU 側は【起】能力もスペルも能動使用しない（§6.4 O-1）ので、現状の母集団
 *   （`WX22-010`＝ルリグ【起】／`WXK06-026`＝スペル）はターンプレイヤーが人間のときだけ積まれる。
 *   それでも遷移の1点は共通なので、CPU 経路も同じこの関数を通す。
 */
export function resolveNextPhaseAfterAttack(
  phase: TurnPhase,
  turnPlayer: PlayerState,
): { next: TurnPhase; state: PlayerState; addedExtraPhase: boolean } {
  const next = resolveNextPhaseWithAttackStepBlocks(phase, turnPlayer);
  const queue = turnPlayer.extra_attack_phases_this_turn ?? [];
  if (next !== 'END' || queue.length === 0) {
    return { next, state: turnPlayer, addedExtraPhase: false };
  }
  const [head, ...rest] = queue;
  const pending = head.onStart
    ? [...(turnPlayer.pending_extra_attack_phase_start_effects ?? []),
       { ...(head.sourceCardNum ? { sourceCardNum: head.sourceCardNum } : {}), action: head.onStart }]
    : turnPlayer.pending_extra_attack_phase_start_effects;
  return {
    next: 'ATTACK_ARTS',
    state: {
      ...turnPlayer,
      extra_attack_phases_this_turn: rest.length > 0 ? rest : undefined,
      pending_extra_attack_phase_start_effects: pending?.length ? pending : undefined,
    },
    addedExtraPhase: true,
  };
}
