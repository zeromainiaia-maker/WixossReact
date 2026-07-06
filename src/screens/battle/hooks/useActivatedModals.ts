// 手札【起】・トラッシュ自己起動・エナゾーンACTIVATED・ルリグ付与【起】のドメイン state
// （Stage2: useState 11本を useReducer へ純移動。いずれも「pending＋コスト選択」の小型モーダル束）。
import type { CardEffect } from '../../../types/effects';
import { useDomainState } from './useDomainState';

export interface ActivatedModalsState {
  // v0.277: 手札から発動する【起】
  pendingHandActivated: { cardNum: string; handIndex: number; effect: CardEffect } | null;
  selectedHandActivatedCost: Set<number>;
  // トラッシュ自己起動（「このシグニをトラッシュから場に出す」等）
  pendingTrashActivated: { cardNum: string; effect: CardEffect } | null;
  selectedTrashActivatedCost: Set<number>;
  // エナゾーンのACTIVATED能力（アクセカード発動）
  pendingEnergyActivated: { cardNum: string; effect: CardEffect } | null;
  selectedEnergyActivatedCost: Set<number>;
  // ルリグ付与能力（GRANT_LRIG_ABILITY）の発動
  pendingLrigGranted: { sourceCardNum: string; effect: CardEffect } | null;
  selectedLrigGrantedCost: Set<number>;
  selectedLrigGrantedHandDiscard: Set<number>;
  // ルリグ起動付与能力: energyTrash選択インデックス
  selectedLrigGrantedEnergyTrash: Set<number>;
  // ルリグ起動付与能力: trashExile選択インデックス
  selectedLrigGrantedTrashExile: Set<number>;
}

const initialState: ActivatedModalsState = {
  pendingHandActivated: null,
  selectedHandActivatedCost: new Set(),
  pendingTrashActivated: null,
  selectedTrashActivatedCost: new Set(),
  pendingEnergyActivated: null,
  selectedEnergyActivatedCost: new Set(),
  pendingLrigGranted: null,
  selectedLrigGrantedCost: new Set(),
  selectedLrigGrantedHandDiscard: new Set(),
  selectedLrigGrantedEnergyTrash: new Set(),
  selectedLrigGrantedTrashExile: new Set(),
};

export function useActivatedModals() {
  const [state, set, patch] = useDomainState<ActivatedModalsState>(initialState);
  return {
    ...state,
    /** 手札【起】モーダルを開く（コスト選択は白紙化） */
    openHandActivated: (pending: NonNullable<ActivatedModalsState['pendingHandActivated']>) =>
      patch({ pendingHandActivated: pending, selectedHandActivatedCost: new Set() }),
    closeHandActivated: () =>
      patch({ pendingHandActivated: null, selectedHandActivatedCost: new Set() }),
    /** トラッシュ自己起動モーダルを開く（コスト選択は白紙化） */
    openTrashActivated: (pending: NonNullable<ActivatedModalsState['pendingTrashActivated']>) =>
      patch({ pendingTrashActivated: pending, selectedTrashActivatedCost: new Set() }),
    closeTrashActivated: () =>
      patch({ pendingTrashActivated: null, selectedTrashActivatedCost: new Set() }),
    /** エナACTIVATED（アクセ発動）モーダルを開く（コスト選択は白紙化） */
    openEnergyActivated: (pending: NonNullable<ActivatedModalsState['pendingEnergyActivated']>) =>
      patch({ pendingEnergyActivated: pending, selectedEnergyActivatedCost: new Set() }),
    closeEnergyActivated: () =>
      patch({ pendingEnergyActivated: null, selectedEnergyActivatedCost: new Set() }),
    /** ルリグ付与【起】モーダルを開く（コスト・手札捨て選択は白紙化） */
    openLrigGranted: (pending: NonNullable<ActivatedModalsState['pendingLrigGranted']>) =>
      patch({ pendingLrigGranted: pending, selectedLrigGrantedCost: new Set(), selectedLrigGrantedHandDiscard: new Set() }),
    /** ルリグ付与【起】モーダルを閉じて選択を全リセット */
    closeLrigGranted: () =>
      patch({
        pendingLrigGranted: null, selectedLrigGrantedCost: new Set(), selectedLrigGrantedHandDiscard: new Set(),
        selectedLrigGrantedEnergyTrash: new Set(), selectedLrigGrantedTrashExile: new Set(),
      }),
    setPendingHandActivated: set.pendingHandActivated,
    setSelectedHandActivatedCost: set.selectedHandActivatedCost,
    setPendingTrashActivated: set.pendingTrashActivated,
    setSelectedTrashActivatedCost: set.selectedTrashActivatedCost,
    setPendingEnergyActivated: set.pendingEnergyActivated,
    setSelectedEnergyActivatedCost: set.selectedEnergyActivatedCost,
    setPendingLrigGranted: set.pendingLrigGranted,
    setSelectedLrigGrantedCost: set.selectedLrigGrantedCost,
    setSelectedLrigGrantedHandDiscard: set.selectedLrigGrantedHandDiscard,
    setSelectedLrigGrantedEnergyTrash: set.selectedLrigGrantedEnergyTrash,
    setSelectedLrigGrantedTrashExile: set.selectedLrigGrantedTrashExile,
  };
}
