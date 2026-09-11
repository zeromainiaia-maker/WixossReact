import type { PlayerState } from '../../types';

/** 次の相手ターン終了時（＝このプレイヤーの次ターン開始時）までの状態をクリアする。 */
export function clearUntilOppTurnEffects(state: PlayerState): PlayerState {
  return {
    ...state,
    keyword_grants_until_opp_turn: undefined,
    granted_effects_until_opp_turn: undefined,
    power_mods_until_opp_turn: undefined,
    lrig_granted_auto_effects_until_opp_turn: undefined,
    lrig_attack_phase_power_down_per_signi_until_opp_turn: undefined,
    guard_alt_hand_until_opp_turn: undefined,
    opp_cost_up_until_opp_turn: undefined,
    prevent_refresh_until_opp_turn: undefined,
    treated_as_resona_until_opp_turn: undefined, // §5.3 `O-203`（レゾナとしても扱う）
    lrig_opp_act_cost_plus_until_opp_turn: undefined,
    base_level_overrides_until_opp_turn: undefined, // §5.3 `O-296`（次の対戦相手のターン終了時まで基本レベルはNになる）
    signi_extra_colors_until_opp_turn: undefined, // §5.3 `O-320`（追加で宣言した色を得る）
  };
}
