import type { PlayerState } from '../../types';
import { shuffle as rngShuffle } from '../../engine/rng';

/**
 * マリガン（引き直し）とライフクロス設置（§5.6 `C-4`・2026-09-17）。
 *
 * 🔑**公式ルール**（English Rule Guide ver.1.0.0「Mulligan」／用語集 word_054）＝
 *   「初手に引いた5枚から気に入らないカードを好きな枚数選んでメインデッキに戻す。その後シャッフルし、戻したカードと同じ枚数を引く」。
 *   その後、デッキの上から7枚をライフクロスにする（ゲームの準備）。
 *
 * 🔴**なぜ純関数に切り出したか**＝この処理は人間のマリガン画面（JSX の `handleConfirm`）に直書きされ、
 *   CPU は**引き直しをせずにライフを置くだけ**の別実装だった（§5.6.1「マリガン＝引き直さない」）。
 *   ⇒ **人間と CPU が同じ関数を通る**（CPU は `pickCpuMulliganIndices` で「どれを戻すか」だけ決める）。
 *
 * @param returnIndices 戻す手札の添字（空＝引き直さない）
 */
export function applyMulligan(
  state: PlayerState,
  returnIndices: Iterable<number>,
  shuffle: <T>(xs: T[]) => T[] = rngShuffle,
): PlayerState {
  const ret = new Set(returnIndices);
  let hand = [...state.hand];
  let deck = [...state.deck];
  if (ret.size > 0) {
    const returning = state.hand.filter((_, i) => ret.has(i));
    const keeping = state.hand.filter((_, i) => !ret.has(i));
    deck = shuffle([...deck, ...returning]);
    hand = [...keeping, ...deck.slice(0, returning.length)];
    deck = deck.slice(returning.length);
  }
  return { ...state, hand, deck: deck.slice(7), life_cloth: deck.slice(0, 7) };
}
