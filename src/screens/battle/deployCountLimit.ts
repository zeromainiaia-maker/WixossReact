import type { PlayerState } from '../../types';
import { removeFromField } from '../../engine/execUtils';

export interface DeployCountLimitResult {
  state: PlayerState;
  trashedCount: number;
}

/** 配置数制限を有効化し、超過シグニを末尾ゾーン側から自動でトラッシュする。 */
export function applyDeployCountLimit(state: PlayerState, cap: number): DeployCountLimitResult {
  let next = state;
  const tops = next.field.signi.map(stack => stack?.at(-1)).filter((x): x is string => !!x);
  let trashedCount = 0;
  for (const cardNum of tops.slice(cap)) {
    next = removeFromField(cardNum, next);
    next = { ...next, trash: [...next.trash, cardNum] };
    trashedCount++;
  }
  return {
    state: { ...next, signi_deploy_count_limit: cap },
    trashedCount,
  };
}

/** 次の自分ターン用の予約を、そのターンの配置数制限へちょうど1回だけ移す。 */
export function activateNextTurnDeployCountLimit(
  state: PlayerState,
  turnActuallyStarts = true,
): DeployCountLimitResult {
  if (!turnActuallyStarts) return { state, trashedCount: 0 };
  const cap = state.signi_deploy_count_limit_next_turn;
  if (cap === undefined) return { state, trashedCount: 0 };
  const activated = applyDeployCountLimit(state, cap);
  return {
    ...activated,
    state: { ...activated.state, signi_deploy_count_limit_next_turn: undefined },
  };
}
