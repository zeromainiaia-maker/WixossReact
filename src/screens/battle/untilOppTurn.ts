import type { PlayerState } from '../../types';

/** 次の相手ターン終了時（＝このプレイヤーの次ターン開始時）までの状態をクリアする。 */
export function clearUntilOppTurnEffects(state: PlayerState): PlayerState {
  return {
    ...state,
    keyword_grants_until_opp_turn: undefined,
    granted_effects_until_opp_turn: undefined,
    power_mods_until_opp_turn: undefined,
    lrig_granted_auto_effects_until_opp_turn: undefined,
    guard_alt_hand_until_opp_turn: undefined,
    opp_cost_up_until_opp_turn: undefined,
    prevent_refresh_until_opp_turn: undefined,
    treated_as_resona_until_opp_turn: undefined, // §5.3 `O-203`（レゾナとしても扱う）
  };
}
