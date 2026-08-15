import type { PlayerState, TurnPhase } from '../../types';
import { PHASE_NEXT } from './uiConstants';

/**
 * 「〈X〉フェイズ／ステップをスキップする」の受け皿＝**フェイズごとの封じ id 表**（§6.4 O-3）。
 *
 * 🔑**スキップは「次のフェイズを決める1点」だけで表す**＝そのフェイズ中の個別アクションを
 * 1つずつ封じて回ると、封じ漏れが1つでもあると無言ですり抜ける（続き488 の
 * `PAY_ENERGY_COST` と同じ設計＝判定を funnel に1本だけ置く）。
 *
 * ⚠**同じ概念に2つの綴りが併存している**（原文の表記ゆれ）＝
 * 「シグニアタック**ステップ**」（`SIGNI_ATTACK_STEP`）と「シグニアタック**フェイズ**」
 * （`SIGNI_ATTACK_PHASE`・`WX16-001-E3`）は同じもの。parser 側でも正規化するが、
 * 過去 JSON の手パッチが残るのでここでも両方を受ける。
 *
 * ⚠**`GROW` はここに載せない**＝「グロウフェイズをスキップする」（8効果）は従来どおり
 * 「グロウという行動を封じる」近似で表す（`ON_GROW_PHASE_START` は従来どおり走る）。
 * フェイズ自体を飛ばす形へ寄せると 8効果のトリガー発火が同時に変わるので別件で扱う。
 */
const PHASE_SKIP_BLOCK_IDS: Partial<Record<TurnPhase, readonly string[]>> = {
  ENERGY:         ['ENERGY_PHASE'],
  MAIN:           ['MAIN_PHASE'],
  ATTACK_ARTS:    ['ATTACK_PHASE'],
  ATTACK_ARTS_OP: ['ATTACK_PHASE'],
  ATTACK_SIGNI:   ['ATTACK_PHASE', 'SIGNI_ATTACK_STEP', 'SIGNI_ATTACK_PHASE'],
  ATTACK_LRIG:    ['ATTACK_PHASE', 'LRIG_ATTACK_STEP'],
};

/**
 * `phase` がターンプレイヤーにとってスキップされるか。
 *
 * @param blocked      `PlayerState.blocked_actions`（このターン有効ぶん）
 * @param contBlocked  CONTINUOUS 由来の封じ（`calcContinuousBlockedActions(...).forSelf`）。
 *   ⚠**これを渡さないと `【常】：対戦相手は自分のエナフェイズをスキップする` のような常在は効かない**
 *   （CONTINUOUS の `BLOCK_ACTION` は `blocked_actions` へ書かれないため）。
 */
export function isPhaseSkipped(
  phase: TurnPhase,
  turnPlayer: Pick<PlayerState, 'blocked_actions'>,
  contBlocked?: ReadonlySet<string>,
): boolean {
  const ids = PHASE_SKIP_BLOCK_IDS[phase];
  if (!ids) return false;
  const blocked = turnPlayer.blocked_actions ?? [];
  return ids.some(id => blocked.includes(id) || (contBlocked?.has(id) ?? false));
}

/**
 * スキップされるフェイズを飛ばして次のフェイズを返す。
 *
 * ⚠**「入ったフェイズ」で判定するので、飛ばしたフェイズの開始時トリガーは自動的に走らない**
 * （`BattleScreen` 側のフェイズ開始時フックは遷移**先**（`nextPhase`）で判定する）。
 * ⚠ループ上限は `PHASE_NEXT` の要素数＝表が壊れても無限ループにしない。
 */
export function resolveNextPhaseWithSkips(
  phase: TurnPhase,
  turnPlayer: Pick<PlayerState, 'blocked_actions'>,
  contBlocked?: ReadonlySet<string>,
): TurnPhase {
  let next = PHASE_NEXT[phase];
  for (let guard = Object.keys(PHASE_NEXT).length; guard > 0; guard--) {
    if (!isPhaseSkipped(next, turnPlayer, contBlocked)) break;
    next = PHASE_NEXT[next];
  }
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
 * ⚠**アタックフェイズ自体がスキップされている場合は追加フェイズも消化しない**
 *   （`resolveNextPhaseWithSkips` が `ATTACK_ARTS` を飛ばすので `next` が `END` にならない
 *   ＝下の早期 return に落ちる。予約はキューに残る）。
 */
export function resolveNextPhaseAfterAttack(
  phase: TurnPhase,
  turnPlayer: PlayerState,
  contBlocked?: ReadonlySet<string>,
): { next: TurnPhase; state: PlayerState; addedExtraPhase: boolean } {
  const next = resolveNextPhaseWithSkips(phase, turnPlayer, contBlocked);
  const queue = turnPlayer.extra_attack_phases_this_turn ?? [];
  if (next !== 'END' || queue.length === 0 || isPhaseSkipped('ATTACK_ARTS', turnPlayer, contBlocked)) {
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
