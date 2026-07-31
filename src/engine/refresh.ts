import type { PlayerState } from '../types';
import { shuffle } from './execUtils';

/**
 * リフレッシュの共通状態遷移。
 * next_refresh_replaced は通常のリフレッシュダメージを置換し、
 * ルリグデッキ先頭1枚をルリグトラッシュへ置いて一度だけ消費する。
 */
export function applyRefreshState(state: PlayerState, preventLifeToTrash = false): PlayerState {
  if (state.prevent_refresh_until_opp_turn) return state;
  if (state.trash.length === 0) return state;
  if (state.next_refresh_replaced) {
    const [lrigCard, ...remainingLrigDeck] = state.lrig_deck;
    return {
      ...state,
      deck: shuffle([...state.deck, ...state.trash]),
      trash: [],
      lrig_deck: remainingLrigDeck,
      lrig_trash: lrigCard ? [...state.lrig_trash, lrigCard] : state.lrig_trash,
      next_refresh_replaced: false,
      refresh_count_this_turn: (state.refresh_count_this_turn ?? 0) + 1,
    };
  }
  const topLife = (!preventLifeToTrash && state.life_cloth.length > 0)
    ? state.life_cloth[state.life_cloth.length - 1]
    : null;
  return {
    ...state,
    deck: shuffle([...state.trash]),
    trash: preventLifeToTrash ? state.trash : (topLife ? [topLife] : []),
    life_cloth: (!preventLifeToTrash && topLife) ? state.life_cloth.slice(0, -1) : state.life_cloth,
    refresh_count_this_turn: (state.refresh_count_this_turn ?? 0) + 1,
  };
}
