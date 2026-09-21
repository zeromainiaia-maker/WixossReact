import type { PlayerState } from '../../types';

/**
 * **`cost.deckTrash`（自分のデッキの一番上からN枚をトラッシュに置く）の支払い funnel。**
 *
 * 🆕2026-09-21・§5.7 `S-31` ② 第3段で新設。🔴**この支払いはどこにも無かった**＝
 * `performSigniActivated` / `performLrigActivated` のどちらも `cost.deckTrash` を1行も読まず、
 * **人間も CPU もこのコストを踏み倒して撃てていた**（live 9効果＝`SPK01-06-E1`「黒×1とデッキの上から4枚を
 * トラッシュに置く」ほか）。提示ゲートは `costUnparsed` ではないので通っており、
 * **逆翻訳・census・golden・smoke のどれにも映らない**形の欠落だった。
 *
 * ⚠**枚数が足りなければ在るだけ置く**＝engine の `MILL`（`Math.min(count, deck.length)`）と同じ規約。
 *   🔑リフレッシュは**効果の解決が終わった直後**にルール処理が行う（`applyRefreshOnDone`）＝ここでは触らない。
 * ⚠**`last_cost_trashed_cards` には載せない**＝あれは「**場から**コストで離れた札」の観測点で、
 *   デッキから置いた札を混ぜると `ON_TRASH` 系の判定がズレる。
 */
export function payDeckTrashCost(state: PlayerState, count: number | undefined): { state: PlayerState; log: string | null } {
  if (!count || count <= 0) return { state, log: null };
  const actual = Math.min(count, state.deck.length);
  if (actual === 0) return { state, log: null };
  const milled = state.deck.slice(0, actual);
  return {
    state: { ...state, deck: state.deck.slice(actual), trash: [...state.trash, ...milled] },
    log: `デッキの上から${actual}枚をトラッシュに置いた（コスト）`,
  };
}
