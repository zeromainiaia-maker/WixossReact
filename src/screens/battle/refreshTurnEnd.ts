import type { CardData, PlayerState } from '../../types';
import type { CardEffect } from '../../types/effects';
import { collectHandLimits } from '../../engine/effectEngine';

/** 「そのターンを終了する」に達するリフレッシュ回数（公式ルール＝**2回目**）。 */
export const REFRESH_TURN_END_COUNT = 2;

/**
 * **1ターン中にターンプレイヤーが2回目のリフレッシュを行ったら、そのターンを終了する**
 * （§5.6 `C-9`・台帳 [RULES.md](../../../docs/RULES.md) `R-28`・EN Refresh）。
 *
 * 🔑**見るのはターンプレイヤーの台帳1つだけ**＝`refresh_count_this_turn` は
 *   `engine/refresh.ts` `applyRefreshState`（リフレッシュの唯一の choke point）が加算し、
 *   `turnScopedState` が **turn-start 境界**で 0 に戻す。
 *
 * 🔴**2026-09-17 の棚卸しで見つけた穴**＝この規則は**効果スタックの解決経路1本にしか書かれていなかった**。
 *   リフレッシュは他に **`applyRefreshOnDone` の8経路**（選択の再開・スペル解決・スペルカットイン解決）と
 *   **ドローフェイズ**からも起きるので、たとえばスペルの解決中に2回目のリフレッシュが起きても
 *   ターンが終わらなかった（このルールは無限ループ防止なので、抜けると止まらない盤面が作れる）。
 *   ⇒ **規則の判定はこの述語1本**にし、消費地点は①スタック解決（その場で同じ commit に重ねる）
 *     ②`BattleScreen` のルール処理 funnel（盤面が動くたび回す＝残り全経路の受け皿）の2つにした。
 *
 * ⚠**ターンプレイヤーだけ**＝非ターンプレイヤーが2回リフレッシュしてもターンは終わらない。
 * ⚠**`turn_phase === 'UP'` では判定しない**＝ターン開始時スコープ（`activateTurnStartScopedState`）が
 *   まだ走っておらず、台帳に**前のターンの回数が残っている**（読むと新しいターンを即終了させる）。
 */
export function refreshForcesTurnEnd(turnPlayerState: PlayerState): boolean {
  return (turnPlayerState.refresh_count_this_turn ?? 0) >= REFRESH_TURN_END_COUNT;
}

/**
 * 🆕2026-10-23（ユーザー裁定）＝**2回目のリフレッシュでターンを終えるときも、エンドフェイズの手札調整（上限まで捨てる）は行う**。
 * ここは「何枚捨てるか」だけ（0＝調整なし）。上限は通常のエンドフェイズと同じ `collectHandLimits`。
 * 🔴旧＝強制終了（`applyForcedTurnEnd`）は手札に触れず、手札9枚のまま相手のターンへ進んでいた（自己対戦の `HANDLIMIT`）。
 * ⚠効果の「このターンを終了する」（`FORCE_END_TURN`）には使わない＝そちらはまだ裁定が無い。
 */
export function refreshTurnEndDiscardCount(
  turnPlayerState: PlayerState, opponentState: PlayerState,
  cardMap: Map<string, CardData>, effectsMap: Map<string, CardEffect[]>,
): number {
  return Math.max(0, turnPlayerState.hand.length - collectHandLimits(turnPlayerState, opponentState, cardMap, effectsMap));
}
