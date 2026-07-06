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
  const [state, set] = useDomainState<AssistModalsState>(initialState);
  return {
    ...state,
    setShowAssistGrowModal: set.showAssistGrowModal,
    setPendingAssistGrowCard: set.pendingAssistGrowCard,
    setPendingAssistSide: set.pendingAssistSide,
    setSelectedAssistGrowCost: set.selectedAssistGrowCost,
    setPendingAssistActivated: set.pendingAssistActivated,
    setSelectedAssistActivatedCost: set.selectedAssistActivatedCost,
    setSelectedAssistActivatedDiscard: set.selectedAssistActivatedDiscard,
  };
}
