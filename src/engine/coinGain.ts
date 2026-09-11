/**
 * coinGain.ts — 《コイン》獲得の唯一の funnel（2026-09-12・§5.3 `O-318`・`WXDi-P07-006-E1`）。
 *
 * 🔴**なぜ funnel が要るか**＝獲得地点は engine の `GAIN_COIN` / `STUB{GAIN_COIN_AND_DISCARD}` と、
 *   UI 層のグロウ（ルリグの印刷コイン）／アシストグロウの **4箇所**に散っていた。そのため
 *   ①「このゲーム、あなたは《コイン》を得られない」（`game_no_coin_gain`）が **`GAIN_COIN` の1箇所でしか
 *     効いておらず**、グロウで得るコインは素通りしていた
 *   ②「このゲームの間に《コイン》を得ていない場合」を判定する材料が**どこにも記録されていなかった**。
 * ⚠**`coins`（現在値）では②を代用できない**＝得たあとに払えば0へ戻り、最初から得ていない場合と区別できない。
 * ⚠**上限は5枚**（既存の各獲得地点と同じ）。上限で頭打ちになって0枚しか増えなかったときは「得た」に数えない。
 * ⚠**ゲーム開始時に持っているコイン（ルリグの印刷値）は「得た」ではない**＝この funnel を通さない。
 */
import type { PlayerState } from '../types';

/** 《コイン》の保持上限。 */
export const MAX_COINS = 5;

/**
 * `count` 枚の《コイン》獲得を適用する。
 * @returns 適用後の state と、実際に増えた枚数（禁止・上限で0になることがある）
 */
export function applyCoinGain(state: PlayerState, count: number): { state: PlayerState; gained: number } {
  if (!Number.isFinite(count) || count <= 0) return { state, gained: 0 };
  // 「このゲーム、あなたは《コイン》を得られない」＝どの獲得地点でも止める。
  if (state.game_no_coin_gain) return { state, gained: 0 };
  const cur = state.coins ?? 0;
  const gained = Math.max(0, Math.min(count, MAX_COINS - cur));
  if (gained === 0) return { state, gained: 0 };
  return { state: { ...state, coins: cur + gained, coins_gained_this_game: true }, gained };
}
