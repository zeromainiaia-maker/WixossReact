import type { PlayerState } from '../../types';

/**
 * **`cost.trapToHand`（自分の【トラップ】N個を手札に加える）の支払い funnel。**
 *
 * 🆕2026-09-22・§5.7 `S-31` ② 第6段で新設。🔴**この支払いもどこにも無かった**＝
 * `WX21-003-E1`「【起】《ターン１回》あなたの【トラップ】１つを手札に加える：…」が
 * **トラップを1つも回収せずに撃てた**（設置したままコストだけ踏み倒せた）。
 *
 * 🆕2026-09-29（報告 08499934 の同型）＝**どのトラップを戻すかは `picked`（人間が選んだ札）**。自分の【トラップ】は
 *   自分には見えている＝ルリグ【起】の支払い画面に選択欄を足した。省略・不正なら左のゾーンから（CPU の既定）。
 * ⚠足りなければ `null`（＝発動を中止する＝踏み倒しを作らない）。
 */
export function payTrapToHandCost(
  state: PlayerState,
  count: number | undefined,
  picked?: readonly string[],
): { state: PlayerState; moved: string[] } | null {
  if (!count) return { state, moved: [] };
  const traps = [...(state.field.signi_traps ?? [null, null, null])];
  const present = traps.filter((t): t is string => !!t);
  if (picked && picked.length === count && new Set(picked).size === count && picked.every(t => present.includes(t))) {
    return {
      state: { ...state, field: { ...state.field, signi_traps: traps.map(t => (t && picked.includes(t) ? null : t)) }, hand: [...state.hand, ...picked] },
      moved: [...picked],
    };
  }
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
