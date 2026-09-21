import type { PlayerState } from '../../types';

/**
 * **`cost.trapToHand`（自分の【トラップ】N個を手札に加える）の支払い funnel。**
 *
 * 🆕2026-09-22・§5.7 `S-31` ② 第6段で新設。🔴**この支払いもどこにも無かった**＝
 * `WX21-003-E1`「【起】《ターン１回》あなたの【トラップ】１つを手札に加える：…」が
 * **トラップを1つも回収せずに撃てた**（設置したままコストだけ踏み倒せた）。
 *
 * ⚠**どのトラップを戻すかは自動（左のゾーンから）**＝honest defer。
 *   トラップは**裏向き**なので画面に選択UIが無く、人間にも CPU にも同じ既定を使う
 *   （選ばせるなら「裏向きのまま選ぶ」UI が要る＝別バッチ）。
 * ⚠足りなければ `null`（＝発動を中止する＝踏み倒しを作らない）。
 */
export function payTrapToHandCost(
  state: PlayerState,
  count: number | undefined,
): { state: PlayerState; moved: string[] } | null {
  if (!count) return { state, moved: [] };
  const traps = [...(state.field.signi_traps ?? [null, null, null])];
  const moved: string[] = [];
  for (let zi = 0; zi < traps.length && moved.length < count; zi++) {
    const t = traps[zi];
    if (!t) continue;
    moved.push(t);
    traps[zi] = null;
  }
  if (moved.length < count) return null;
  return {
    state: { ...state, field: { ...state.field, signi_traps: traps }, hand: [...state.hand, ...moved] },
    moved,
  };
}

/** `payTrapToHandCost` と**同じ軸**で「いま払えるか」だけを返す（提示ゲート用）。 */
export function canPayTrapToHandCost(state: PlayerState, count: number | undefined): boolean {
  return payTrapToHandCost(state, count) !== null;
}
