import type { PlayerState } from '../../types';

export type UsedCardPlacement = 'trash' | 'lrig_trash';

/** 解決中は未配置の使用カードを、自己除外の置換が無い場合だけ既定ゾーンへ置く。 */
export function finalizeUsedCardPlacement(
  state: PlayerState,
  sourceCardNum: string,
  placement: UsedCardPlacement | undefined,
): PlayerState {
  const placedAsCharm = state.field.signi_charms?.includes(sourceCardNum) ?? false;
  // 🆕**解決中に手札へ戻された使用カードは既定ゾーンへ置かない**（2026-09-05・§5.3 `O-258`）＝
  //   `STUB{RETURN_SELF_SPELL_TO_HAND}`（`WXK08-040-E1`③「このスペルを手札に戻す」）が
  //   手札へ入れたあとにここでトラッシュへも置くと、**同じカードが手札とトラッシュに二重で現れる**。
  const returnedToHand = state.hand.includes(sourceCardNum);
  if (!placement || state.excluded?.includes(sourceCardNum) || placedAsCharm || returnedToHand
      || state[placement].includes(sourceCardNum)) {
    return state;
  }
  return { ...state, [placement]: [...state[placement], sourceCardNum] };
}
