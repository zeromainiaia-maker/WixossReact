import type { PlayerState, TurnPhase } from '../../types';
import { recordEnergyPlacements } from '../../engine/energyPlacement';

/**
 * 🆕2026-10-21＝**フェイズに入るときの「このゲームの間」の処理**（ターンプレイヤーの state だけを書く）。
 * 人間の `phaseAdvance`（遷移の地点）と CPU の `cpuTurn`（そのフェイズを初めて処理する地点）が同じ1本を呼ぶ。
 *
 * 🔴旧＝`phaseAdvance` にだけ書かれており、**CPU のターンでは5つとも一度も起きなかった**
 *   （グロウフェイズ開始のリミット＋・相手が予約したリミット修正・メインフェイズ開始ドロー・エナフェイズ開始ドロー／エナチャージ）。
 * ⚠判定は**遷移先**のフェイズ（§6.4 O-3＝飛ばされたフェイズの開始時処理は走らない）。
 * ⚠ログの文言は旧 `phaseAdvance` と同じ。
 */
export function applyPhaseEntryState(state: PlayerState, entering: TurnPhase): { state: PlayerState; logs: string[] } {
  let s = state;
  const logs: string[] = [];
  // →GROW（グロウフェイズ開始時）: game_grow_phase_limit_plus で game_lrig_limit_bonus を累積
  if (entering === 'GROW' && (s.game_grow_phase_limit_plus ?? 0) > 0) {
    const glp = s.game_grow_phase_limit_plus!;
    s = { ...s, game_lrig_limit_bonus: (s.game_lrig_limit_bonus ?? 0) + glp };
    logs.push(`グロウフェイズ開始：リミット+${glp}（このゲーム・累積${s.game_lrig_limit_bonus}）`);
  }
  // →MAIN 移行時: pending_lrig_limit_mod を lrig_limit_mod に適用（OPP_MAIN_PHASE_LIMIT_DOWN）
  if (entering === 'MAIN' && s.pending_lrig_limit_mod !== undefined) {
    s = { ...s, lrig_limit_mod: (s.lrig_limit_mod ?? 0) + s.pending_lrig_limit_mod, pending_lrig_limit_mod: undefined };
  }
  // →MAIN（メインフェイズ開始時）: game_main_draw（手札5枚以下ならドロー）
  if (entering === 'MAIN' && s.game_main_draw && s.hand.length <= 5 && s.deck.length > 0) {
    s = { ...s, deck: s.deck.slice(1), hand: [...s.hand, s.deck[0]] };
    logs.push('メインフェイズ開始ドロー（このゲーム）');
  }
  // →ENERGY（エナフェイズ開始時）: game_energy_phase_draw
  if (entering === 'ENERGY' && s.game_energy_phase_draw && s.deck.length > 0) {
    s = { ...s, deck: s.deck.slice(1), hand: [...s.hand, s.deck[0]] };
    logs.push('エナフェイズ開始ドロー（このゲーム）');
  }
  // →ENERGY: game_energy_phase_charge（`WX25-P2-007-E1`）＝デッキの上をエナゾーンへ（台帳へ `cause:'rule'`）
  const enaChargeN = s.game_energy_phase_charge ?? 0;
  if (entering === 'ENERGY' && enaChargeN > 0 && s.deck.length > 0) {
    const charged = s.deck.slice(0, enaChargeN);
    s = recordEnergyPlacements({ ...s, deck: s.deck.slice(charged.length), energy: [...s.energy, ...charged] }, charged, 'rule');
    logs.push(`エナフェイズ開始【エナチャージ${charged.length}】（このゲーム）`);
  }
  return { state: s, logs };
}
