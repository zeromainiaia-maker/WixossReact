import type { CardData, PlayerState } from '../../types';
import type { EffectCost } from '../../types/effects';
import { getCardNum } from '../../engine/effectExecutor';
import { matchesFilter } from '../../engine/execUtils';

type Spec = NonNullable<EffectCost['multiZoneExile']>;

/** その領域にある、コスト条件に合う札（instanceId／CardNum のまま返す）。 */
function matchesIn(state: PlayerState, zone: Spec['zones'][number], spec: Spec, cardMap: Map<string, CardData>): string[] {
  const pool = zone === 'hand' ? state.hand : zone === 'energy' ? state.energy : state.trash;
  return pool.filter(n => !spec.filter || matchesFilter(cardMap.get(getCardNum(n)), spec.filter));
}

/**
 * **「手札とエナゾーンとトラッシュにある《X》を1枚ずつゲームから除外する」コストを払えるか**
 * （2026-09-07・意味照合 段2・`WXDi-P13-089-E3`）。
 *
 * ⚠**各領域それぞれに `count` 枚**必要（合計ではない）＝1領域でも足りなければ払えない。
 * 🔑**提示ゲートと支払いが同じこの関数を通す**（§4.2 の3地点セット）＝写経すると
 *   「提示は通るのに請求できない」片肺になる。
 */
export function multiZoneExileAffordable(
  state: PlayerState, spec: Spec | undefined, cardMap: Map<string, CardData>,
): boolean {
  if (!spec) return true;
  return spec.zones.every(z => matchesIn(state, z, spec, cardMap).length >= spec.count);
}

/**
 * 同コストの支払い。**自動選択**（`filter` は `cardName` 一意なのでどれを除外しても等価）。
 * ⚠行き先は `excluded`（＝ゲームから除外の正しい置き場。`trashExile` の `lrig_trash` 近似とは別）。
 * 払えないときは `null`（呼び出し側は発動そのものを中止する＝踏み倒しを作らない）。
 */
export function payMultiZoneExileCost(
  state: PlayerState, spec: Spec | undefined, cardMap: Map<string, CardData>,
): { state: PlayerState; exiled: string[] } | null {
  if (!spec) return { state, exiled: [] };
  if (!multiZoneExileAffordable(state, spec, cardMap)) return null;
  let next = state;
  const exiled: string[] = [];
  for (const zone of spec.zones) {
    const picked = matchesIn(next, zone, spec, cardMap).slice(0, spec.count);
    const drop = [...picked];
    const remove = (pool: string[]) => pool.filter(n => {
      const i = drop.indexOf(n);
      if (i < 0) return true;
      drop.splice(i, 1);
      return false;
    });
    next = zone === 'hand' ? { ...next, hand: remove(next.hand) }
      : zone === 'energy' ? { ...next, energy: remove(next.energy) }
        : { ...next, trash: remove(next.trash) };
    exiled.push(...picked);
  }
  return { state: { ...next, excluded: [...(next.excluded ?? []), ...exiled] }, exiled };
}
