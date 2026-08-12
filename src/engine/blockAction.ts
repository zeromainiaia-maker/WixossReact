import type { PlayerState } from '../types';

const PLAY_SIGNI_POWER_BLOCK_RE = /^PLAY_SIGNI_POWER_(\d+)_OR_MORE$/;

/** 手札から場に出そうとしているシグニが、一時的なパワー下限ブロックに該当するか。 */
export function isHandSigniPlayBlockedByPower(state: PlayerState, printedPower: number): boolean {
  if (!Number.isFinite(printedPower)) return false;
  return (state.blocked_actions ?? []).some(actionId => {
    const match = actionId.match(PLAY_SIGNI_POWER_BLOCK_RE);
    return match ? printedPower >= Number(match[1]) : false;
  });
}
