import type { PlayerState } from '../../types';
import type { InstallDelayedTriggerAction } from '../../types/effects';

/**
 * バトルバニッシュ時の遅延 watcher を収集し、「次に」(once) だけを消費する。
 * once 省略の watcher は THIS_TURN の間残り、同じ timing で繰り返し発火する。
 */
export function consumeBattleBanishDelayedTriggers(
  state: PlayerState,
): { fired: InstallDelayedTriggerAction[]; state: PlayerState } {
  const delayed = state.delayed_triggers ?? [];
  const fired = delayed.filter(dt => dt.trigger?.timing === 'ON_SIGNI_BANISH_BATTLE');
  if (!fired.some(dt => dt.once)) return { fired, state };

  const remaining = delayed.filter(
    dt => dt.trigger?.timing !== 'ON_SIGNI_BANISH_BATTLE' || !dt.once,
  );
  return {
    fired,
    state: { ...state, delayed_triggers: remaining.length ? remaining : undefined },
  };
}

/**
 * 指定 timing の `once` 遅延 watcher を消費する（発火済みの「最初の1回だけ」設置を取り除く）。
 * §5.3 2026-08-27 Sheet1 B11＝`WX09-Re06`「このターン、あなたがリフレッシュをしたとき、それが
 * このターンであなたの最初のリフレッシュである場合、…」。`once` を消費しないと同ターン中の
 * 2回目以降のリフレッシュでも発火する（＝原文にない過剰実行）。
 * ⚠**発火した回だけ呼ぶ**（collector の `firedOnceDelayed`）。呼ばない条件で消すと過小実行になる。
 */
export function consumeOnceDelayedTriggers(state: PlayerState, timing: string): PlayerState {
  const delayed = state.delayed_triggers ?? [];
  if (!delayed.some(dt => dt.trigger?.timing === timing && dt.once)) return state;
  const remaining = delayed.filter(dt => !(dt.trigger?.timing === timing && dt.once));
  return { ...state, delayed_triggers: remaining.length ? remaining : undefined };
}

/**
 * ターン終了時に、設置者を問わずそのターン限りの遅延 watcher を破棄する。
 *
 * 🆕**`duration:'NEXT_TURN'` だけは1回だけ持ち越す**（2026-08-31 続き749・`WX14-018-E4`
 * 「**次のターンの間**、対戦相手のシグニ1体がアタックしたとき…」）＝ここで `'THIS_TURN'` へ**降格**する。
 * ⚠降格させることで**次のターン終了時には確実に消える**（2ターン残さない）。
 */
export function clearEndOfTurnDelayedTriggers(state: PlayerState): PlayerState {
  if (state.delayed_triggers === undefined) return state;
  const carried = state.delayed_triggers
    .filter(dt => dt.duration === 'NEXT_TURN')
    .map(dt => ({ ...dt, duration: 'THIS_TURN' as const }));
  return { ...state, delayed_triggers: carried.length ? carried : undefined };
}
