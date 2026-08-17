import type { PlayerState } from '../types';
import type { StubAction } from '../types/effects';
import { shuffle } from './execUtils';

/** ルリグ付与ストア2本（`lifeCrashReplace.ts` と同じ規約＝合成と消費で同じ順に見る）。 */
const LRIG_GRANT_STORES = [
  'lrig_granted_auto_effects',
  'lrig_granted_auto_effects_until_opp_turn',
] as const;

/**
 * 「あなたのライフクロスがリフレッシュによってトラッシュに移動する場合、**代わりに**
 * このルリグはこの能力を失う。」（§6.4 O-37(b)・続き543・`WX24-P3-009` が付与）。
 *
 * 🔑**置換なので「ライフを失わない」と「能力を1つ失う」は必ず対**＝どちらか片方だけだと
 *   「タダで無限に守る」か「守らないのに能力だけ消える」になる。
 * ⚠**素直に parse させると別物になる**（続き536 の実測）＝`CONTINUOUS REMOVE_ABILITIES{SIGNI self,
 *   until:PERMANENT}`＝**自分のシグニ**の能力を恒久的に消す。だから parser 側で専用の構造を組む。
 * ⚠ライフクロスが0枚のときは移動が起きない＝**能力を消費しない**（置換すべきものが無い）。
 */
function consumeRefreshLifeMoveReplace(state: PlayerState): PlayerState | null {
  if (state.lrig_abilities_disabled) return null;
  if (state.life_cloth.length === 0) return null;
  for (const key of LRIG_GRANT_STORES) {
    const effects = state[key] ?? [];
    const index = effects.findIndex(effect => {
      const action = effect.action as StubAction;
      return effect.effectType === 'CONTINUOUS'
        && action?.type === 'STUB'
        && action.id === 'REFRESH_LIFE_MOVE_REPLACE_LOSE_ABILITY';
    });
    if (index < 0) continue;
    const kept = effects.filter((_, i) => i !== index);
    return { ...state, [key]: kept.length > 0 ? kept : undefined };
  }
  return null;
}

/**
 * リフレッシュの共通状態遷移。
 * next_refresh_replaced は通常のリフレッシュダメージを置換し、
 * ルリグデッキ先頭1枚をルリグトラッシュへ置いて一度だけ消費する。
 *
 * ⚠**リフレッシュの choke point はこの1本**＝`refreshPlayerIfDeckEmpty`（engine）と
 *   `battleUtils.applyRefresh`／`drawCards`（UI）の全経路がここを通る。ライフ移動の置換は
 *   呼び出し側ではなくここに置くこと（片方だけだと経路によって効いたり効かなかったりする）。
 */
export function applyRefreshState(state: PlayerState, preventLifeToTrash = false): PlayerState {
  if (state.prevent_refresh_until_opp_turn) return state;
  if (state.trash.length === 0) return state;
  // ⚠`next_refresh_replaced` が立っているときは**そもそもライフが動かない**（下の分岐）＝
  //   置換すべきものが無いので付与能力を消費しない。
  if (!preventLifeToTrash && !state.next_refresh_replaced) {
    const replaced = consumeRefreshLifeMoveReplace(state);
    if (replaced) return applyRefreshState(replaced, true);
  }
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
    // 🔴`preventLifeToTrash` のとき従来は `state.trash` を残していた＝**トラッシュ全部がデッキと
    //   トラッシュの両方に居る**カード複製バグ（`PREVENT_LIFE_REFRESH_TRASH` の唯一の消費地点。
    //   §6.4 O-37(b) で同じフラグを通したときに golden で顕在化）。トラッシュは必ず空にする。
    trash: (!preventLifeToTrash && topLife) ? [topLife] : [],
    life_cloth: (!preventLifeToTrash && topLife) ? state.life_cloth.slice(0, -1) : state.life_cloth,
    refresh_count_this_turn: (state.refresh_count_this_turn ?? 0) + 1,
  };
}
