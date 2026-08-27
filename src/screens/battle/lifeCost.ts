import type { PlayerState } from '../../types';

export interface LifeOnPlayCost {
  life_crash?: number;
  lifeTrash?: number;
  lifeToHand?: number;
}

export function payLifeOnPlayCost(
  state: PlayerState,
  cost: LifeOnPlayCost,
): { state: PlayerState; logs: string[] } | null {
  const crashN = cost.life_crash ?? 0;
  const trashN = cost.lifeTrash ?? 0;
  const handN = cost.lifeToHand ?? 0;
  if (state.life_cloth.length < crashN + trashN + handN) return null;

  let life = [...state.life_cloth];
  const take = (count: number) => {
    const moved = life.slice(Math.max(0, life.length - count));
    life = life.slice(0, Math.max(0, life.length - moved.length));
    return moved.reverse();
  };
  const crashed = take(crashN);
  const trashed = take(trashN);
  const toHand = take(handN);
  const pending = crashed.slice(1);
  const next: PlayerState = {
    ...state,
    life_cloth: life,
    trash: [...state.trash, ...trashed],
    hand: [...state.hand, ...toHand],
    life_crashed_this_turn: (state.life_crashed_this_turn ?? 0) + crashed.length,
    field: { ...state.field, check: crashed[0] ?? state.field.check },
    crash_source_card_num: crashed.length > 0 ? undefined : state.crash_source_card_num,
    // §5.3 O-120: コスト支払いのクラッシュに原因キーワードは無い（発生源と同じ地点で消す）。
    crash_cause: crashed.length > 0 ? undefined : state.crash_cause,
    pending_crashed_cards: pending.length > 0
      ? [...(state.pending_crashed_cards ?? []), ...pending]
      : state.pending_crashed_cards,
    pending_crash_source_card_nums: pending.length > 0
      ? [...(state.pending_crash_source_card_nums ?? []), ...pending.map(() => null)]
      : state.pending_crash_source_card_nums,
    pending_crash_causes: pending.length > 0
      ? [...(state.pending_crash_causes ?? []), ...pending.map(() => null)]
      : state.pending_crash_causes,
  };
  return {
    state: next,
    logs: [
      ...(crashed.length ? [`ライフクロス${crashed.length}枚をコストでクラッシュ`] : []),
      ...(trashed.length ? [`ライフクロス${trashed.length}枚をコストでトラッシュ`] : []),
      ...(toHand.length ? [`ライフクロス${toHand.length}枚を手札に加えた（コスト）`] : []),
    ],
  };
}
