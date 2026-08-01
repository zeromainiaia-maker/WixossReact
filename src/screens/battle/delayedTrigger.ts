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
