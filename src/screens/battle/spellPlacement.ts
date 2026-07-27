import type { PlayerState } from '../../types';

export type UsedCardPlacement = 'trash' | 'lrig_trash';

/** 解決中は未配置の使用カードを、自己除外の置換が無い場合だけ既定ゾーンへ置く。 */
export function finalizeUsedCardPlacement(
  state: PlayerState,
  sourceCardNum: string,
  placement: UsedCardPlacement | undefined,
): PlayerState {
  const placedAsCharm = state.field.signi_charms?.includes(sourceCardNum) ?? false;
  if (!placement || state.excluded?.includes(sourceCardNum) || placedAsCharm || state[placement].includes(sourceCardNum)) {
    return state;
  }
  return { ...state, [placement]: [...state[placement], sourceCardNum] };
}
