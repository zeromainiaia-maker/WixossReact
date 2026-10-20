import type { PlayerState } from '../../types';
import { clearAllZoneBurstGrantUntilOppTurn } from './allZoneBurst';
import { clearUntilOppTurnEffects } from './untilOppTurn';

/**
 * 🆕2026-10-21＝**ターンを終えた相手側（＝次にターンを迎える側）の後始末**（3つのターン終了経路の共通部分）。
 * 🔴旧＝経路ごとの手書き＝通常の終了（`phaseAdvance`）だけが `life_crash_counters`（防御側が立てるカウンタークラッシュ）を消し、
 *   手札を捨てる終了（`endDiscard`）と **CPU のターン終了（`cpuTurn`）は消さず**、出自の印（トラッシュ／デッキから出た等）も
 *   CPU のターン終了では消していなかった。
 * ⚠アップ（`field`）と次ターンの予約の昇格は呼び出し側（交代するかで変わる）。
 */
export function clearNextTurnPlayerState(state: PlayerState): PlayerState {
  return {
    ...clearUntilOppTurnEffects(clearAllZoneBurstGrantUntilOppTurn(state)),
    signi_played_from_trash: undefined, signi_played_from_deck: undefined, signi_placed_by_source: undefined, // 出自マーカー本体はUP開始時の funnel でクリア
    life_crash_counters: undefined, // カウンタークラッシュ（防御側がセット）をターン終了時にクリア
    turn_arts_used: undefined, turn_arts_used_names: undefined, turn_arts_used_colors: undefined, turn_pieces_used_names: undefined, // アーツ使用履歴をリセット
    signi_deploy_count_limit: undefined, // 配置数制限（このターン・相手にかけられた分）を自分のターン開始時にリセット
    banish_redirect_power0_target_nums: undefined, // 非ターンプレイヤーがこのターン中に設定した単体power0置換もクリア
    banish_redirect_battle_target_nums: undefined,
  };
}
