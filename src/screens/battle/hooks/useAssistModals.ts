// アシストルリグ（グロウモーダル＋アシスト【起】モーダル）のドメイン state（Stage2: useState 6本を useReducer へ純移動）。
import type { CardData } from '../../../types';
import type { CardEffect } from '../../../types/effects';
import { useDomainState } from './useDomainState';

export interface AssistModalsState {
  showAssistGrowModal: boolean;
  pendingAssistGrowCard: CardData | null;
  pendingAssistSide: 'l' | 'r' | null;
  selectedAssistGrowCost: Set<number>;
  pendingAssistActivated: { cardNum: string; effect: CardEffect } | null;
  selectedAssistActivatedCost: Set<number>;
  selectedAssistActivatedDiscard: Set<number>;
}

const initialState: AssistModalsState = {
  showAssistGrowModal: false,
  pendingAssistGrowCard: null,
  pendingAssistSide: null,
  selectedAssistGrowCost: new Set(),
  pendingAssistActivated: null,
  selectedAssistActivatedCost: new Set(),
  selectedAssistActivatedDiscard: new Set(),
};

export function useAssistModals() {
  const [state, set, patch] = useDomainState<AssistModalsState>(initialState);
  return {
    ...state,
    setShowAssistGrowModal: set.showAssistGrowModal,
    setPendingAssistGrowCard: set.pendingAssistGrowCard,
    setPendingAssistSide: set.pendingAssistSide,
    setSelectedAssistGrowCost: set.selectedAssistGrowCost,
    setPendingAssistActivated: set.pendingAssistActivated,
    setSelectedAssistActivatedCost: set.selectedAssistActivatedCost,
    setSelectedAssistActivatedDiscard: set.selectedAssistActivatedDiscard,
    /** アシストグロウモーダルを指定サイドで開く（候補・コスト選択は白紙化） */
    openAssistGrow: (side: 'l' | 'r') =>
      patch({ pendingAssistSide: side, pendingAssistGrowCard: null, selectedAssistGrowCost: new Set(), showAssistGrowModal: true }),
    /** アシストグロウモーダルを閉じて選択をリセット */
    closeAssistGrow: () =>
      patch({ showAssistGrowModal: false, pendingAssistGrowCard: null, pendingAssistSide: null, selectedAssistGrowCost: new Set() }),
    /** アシスト【起】モーダルを開く（コスト選択は白紙化） */
    openAssistActivated: (pending: NonNullable<AssistModalsState['pendingAssistActivated']>) =>
      patch({ pendingAssistActivated: pending, selectedAssistActivatedCost: new Set() }),
    /** アシスト【起】モーダルを閉じて選択をリセット */
    closeAssistActivated: () =>
      patch({ pendingAssistActivated: null, selectedAssistActivatedCost: new Set(), selectedAssistActivatedDiscard: new Set() }),
  };
}
