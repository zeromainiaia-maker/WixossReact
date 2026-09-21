import type { CardData, PlayerState } from '../../types';
import type { EffectCost } from '../../types/effects';
import { getCardNum, matchesFilter } from '../../engine/effectExecutor';

/**
 * **`cost.fieldDown`（アップ状態の該当シグニN体をダウンする）の支払い funnel。**
 *
 * 🆕2026-09-22・§5.7 `S-31` ② 第5段で `performSigniActivated` のインライン実装から切り出した。
 * 🔴**なぜ切り出すか**＝**ルリグ【起】には支払いが1行も無く、踏み倒して撃てた**（live 2効果＝
 *   `WXDi-P15-010-E2`「アップ状態の＜防衛派＞のシグニ１体をダウンする：」ほか）。
 *   写経で2本目を書くと、どちらかだけが `excludeSelf`／`isUp` の扱いを落とす（§5.6.3）。
 *
 * ⚠**候補の軸は提示ゲート（`signiActivateGate` / `lrigActivateGate`）と同じ**＝
 *   アップ状態・フィルタ一致・`excludeSelf`。`isUp`/`isDown` は**盤面側の状態**なので
 *   カードのフィルタからは外して見る（`matchesFilter` に渡すと必ず外れる）。
 * ⚠**払えなければ `null`**（呼び出し側は発動そのものを中止する＝踏み倒しを作らない）。
 *
 * @param sourceCardNum 効果元シグニの instance id（ルリグ【起】は `undefined`＝`excludeSelf` は効かない）。
 */
export function payFieldDownCost(
  state: PlayerState,
  cost: EffectCost['fieldDown'] | undefined,
  cardMap: Map<string, CardData>,
  sourceCardNum?: string,
): PlayerState | null {
  if (!cost) return state;
  const down = [...(state.field.signi_down ?? [false, false, false])];
  const { isUp: _isUp, isDown: _isDown, ...cardFilter } = cost.filter ?? {};
  let remaining = cost.count;
  for (let zi = 0; zi < state.field.signi.length && remaining > 0; zi++) {
    const top = state.field.signi[zi]?.at(-1);
    if (!top || down[zi]) continue;
    if (cost.excludeSelf && sourceCardNum && top === sourceCardNum) continue;
    if (!matchesFilter(cardMap.get(getCardNum(top)), cardFilter)) continue;
    down[zi] = true;
    remaining--;
  }
  if (remaining > 0) return null;
  return { ...state, field: { ...state.field, signi_down: down } };
}

/** `payFieldDownCost` と**同じ軸**で「いま払えるか」だけを返す（提示ゲート用）。 */
export function canPayFieldDownCost(
  state: PlayerState,
  cost: EffectCost['fieldDown'] | undefined,
  cardMap: Map<string, CardData>,
  sourceCardNum?: string,
): boolean {
  return payFieldDownCost(state, cost, cardMap, sourceCardNum) !== null;
}
