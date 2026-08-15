import type { PlayerState } from '../../types';

/**
 * 「カード名を指定して使用を封じる」の**唯一の判定入口**（§6.4 O-3 続き498）。
 *
 * 軸は3本あり、いずれも**封じられる側の state** に載る：
 *  - `blocked_card_names`（このターン・blacklist／`BLOCK_CARD_USE`・`DECLARED_SPELL_NAME_LOCK`）
 *  - `blocked_card_names_game`（このゲームの間・blacklist／`NAME_BAN`）
 *  - `arts_name_whitelist_this_turn`（このターン・**whitelist**／「宣言したカード名以外のアーツを使用できない」）
 *
 * ⚠**軸ごとに読み手を書かない**。従来は blacklist 2本だけが手札スペル／ルリグデッキのタップ経路で
 *   個別に読まれており、**アーツ一覧（`artsCandidates`）と実行入口（`executeArts`）は素通り**だった
 *   ＝カード名で封じても一覧からは普通に使えた。判定はこの1関数に集約する。
 */
export function cardNameUseBlocked(
  state: Pick<PlayerState, 'blocked_card_names' | 'blocked_card_names_game' | 'arts_name_whitelist_this_turn'>,
  cardName: string | undefined,
  cardType: string | undefined,
): boolean {
  const name = cardName ?? '';
  if (state.blocked_card_names?.includes(name)) return true;
  if (state.blocked_card_names_game?.includes(name)) return true;
  // 「宣言したカード名**以外**のアーツを使用できない」＝アーツだけに掛かる whitelist。
  // ⚠空配列（＝何も宣言できなかった）は「すべてのアーツが使えない」＝undefined と区別する。
  const whitelist = state.arts_name_whitelist_this_turn;
  if (whitelist && (cardType ?? '').startsWith('アーツ') && !whitelist.includes(name)) return true;
  return false;
}
