import type { PlayerState } from '../../types';

/**
 * **`cost.handBottomDeck`（手札からN枚をデッキの一番下に置く）の支払い funnel。**
 *
 * 🆕2026-09-22・§5.7 `S-31` ② 第6段で新設。🔴**この支払いはどこにも無かった**＝
 * `WXK10-072-E2`「【起】手札を１枚デッキの一番下に置く：対戦相手のすべてのシグニを凍結する」が
 * **手札を1枚も失わずに撃てた**（提示ゲートも枚数を見ていなかった）。
 *
 * ⚠**捨てる（`discard`）とは行き先が違う**＝トラッシュではなく**デッキの一番下**
 *   （後で引き直せる／`MILL` の対象になる）ので `trash` へ混ぜない。
 * ⚠**選ぶのは呼び出し側**（人間はモーダル、CPU は `pickCpuDiscardCostIndices`）＝
 *   ここは「選ばれた index を動かす」だけ。枚数が足りなければ `null`（＝発動を中止する）。
 */
export function payHandBottomDeckCost(
  state: PlayerState,
  indices: ReadonlySet<number>,
  count: number | undefined,
): { state: PlayerState; moved: string[] } | null {
  if (!count) return { state, moved: [] };
  const picked = [...indices].filter(i => i >= 0 && i < state.hand.length);
  if (picked.length !== count) return null;
  const moved = picked.map(i => state.hand[i]);
  const drop = new Set(picked);
  return {
    state: { ...state, hand: state.hand.filter((_, i) => !drop.has(i)), deck: [...state.deck, ...moved] },
    moved,
  };
}
