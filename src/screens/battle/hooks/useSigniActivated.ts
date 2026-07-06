// シグニ起動効果（SigniActivatedModal）のドメイン state（Stage2: useState 9本を useReducer へ純移動）。
import type { CardEffect } from '../../../types/effects';
import { useDomainState } from './useDomainState';

export interface SigniActivatedState {
  pendingSigniActivated: { cardNum: string; effect: CardEffect } | null;
  selectedSigniActivatedCost: Set<number>;
  selectedSigniActivatedDiscard: Set<number>;
  // v0.278: 可変枚数手札捨てコスト（WDK13-011用）
  selectedSigniActivatedDiscardVar: Set<number>;
  // 起動能力 fieldTrash コスト（場のシグニを場からトラッシュ）のゾーン選択
  selectedSigniActivatedFieldTrash: Set<number>;
  // シグニ起動効果: energyTrash（エナゾーンから指定カードをトラッシュ）選択インデックス
  selectedSigniActivatedEnergyTrash: Set<number>;
  // シグニ起動効果: trashExile（トラッシュからカードをゲーム除外）選択インデックス
  selectedSigniActivatedTrashExile: Set<number>;
  // 「シグニを【ビート】にする」コスト（cost.beat_signi）の選択（起動効果用）
  selectedSigniActivatedBeat: Set<number>;
  // 可変チャームトラッシュコスト - シグニ起動効果用
  signiActCharmTrashVar: number;
}

const initialState: SigniActivatedState = {
  pendingSigniActivated: null,
  selectedSigniActivatedCost: new Set(),
  selectedSigniActivatedDiscard: new Set(),
  selectedSigniActivatedDiscardVar: new Set(),
  selectedSigniActivatedFieldTrash: new Set(),
  selectedSigniActivatedEnergyTrash: new Set(),
  selectedSigniActivatedTrashExile: new Set(),
  selectedSigniActivatedBeat: new Set(),
  signiActCharmTrashVar: 0,
};

export function useSigniActivated() {
  const [state, set, patch] = useDomainState<SigniActivatedState>(initialState);
  return {
    ...state,
    /** シグニ【起】モーダルを開く（コスト・可変捨て・場トラッシュ選択を白紙化） */
    openSigniActivated: (pending: NonNullable<SigniActivatedState['pendingSigniActivated']>) =>
      patch({
        pendingSigniActivated: pending,
        selectedSigniActivatedCost: new Set(),
        selectedSigniActivatedDiscardVar: new Set(),
        selectedSigniActivatedFieldTrash: new Set(),
      }),
    /** シグニ【起】モーダルを閉じて選択を全リセット（keySubstituteEnabled はキー側で別途） */
    closeSigniActivated: () => patch({ ...initialState, selectedSigniActivatedCost: new Set(), selectedSigniActivatedDiscard: new Set(), selectedSigniActivatedDiscardVar: new Set(), selectedSigniActivatedFieldTrash: new Set(), selectedSigniActivatedEnergyTrash: new Set(), selectedSigniActivatedTrashExile: new Set(), selectedSigniActivatedBeat: new Set() }),
    setPendingSigniActivated: set.pendingSigniActivated,
    setSelectedSigniActivatedCost: set.selectedSigniActivatedCost,
    setSelectedSigniActivatedDiscard: set.selectedSigniActivatedDiscard,
    setSelectedSigniActivatedDiscardVar: set.selectedSigniActivatedDiscardVar,
    setSelectedSigniActivatedFieldTrash: set.selectedSigniActivatedFieldTrash,
    setSelectedSigniActivatedEnergyTrash: set.selectedSigniActivatedEnergyTrash,
    setSelectedSigniActivatedTrashExile: set.selectedSigniActivatedTrashExile,
    setSelectedSigniActivatedBeat: set.selectedSigniActivatedBeat,
    setSigniActCharmTrashVar: set.signiActCharmTrashVar,
  };
}
