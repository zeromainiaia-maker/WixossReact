// キーピース（使用モーダル＋キー【起】モーダル）のドメイン state（Stage2: useState 7本を useReducer へ純移動）。
// ⚠ keySubstituteEnabled（ENERGY_SUBSTITUTE_TRASH_KEY 代替コスト）はアーツ/シグニ【起】のコストUIでも共有される（従来と同じ1状態）。
import type { CardData } from '../../../types';
import type { CardEffect } from '../../../types/effects';
import { useDomainState } from './useDomainState';

export interface KeyModalsState {
  showKeyModal: boolean;
  pendingKeyCard: CardData | null;
  selectedKeyCost: Set<number>;
  pendingKeyActivated: { cardNum: string; effect: CardEffect } | null;
  selectedKeyActivatedCost: Set<number>;
  selectedKeyActivatedDiscard: Set<number>;
  // キーピース代替コスト（ENERGY_SUBSTITUTE_TRASH_KEY）
  keySubstituteEnabled: boolean;
}

const initialState: KeyModalsState = {
  showKeyModal: false,
  pendingKeyCard: null,
  selectedKeyCost: new Set(),
  pendingKeyActivated: null,
  selectedKeyActivatedCost: new Set(),
  selectedKeyActivatedDiscard: new Set(),
  keySubstituteEnabled: false,
};

export function useKeyModals() {
  const [state, set, patch] = useDomainState<KeyModalsState>(initialState);
  return {
    ...state,
    setShowKeyModal: set.showKeyModal,
    setPendingKeyCard: set.pendingKeyCard,
    setSelectedKeyCost: set.selectedKeyCost,
    setPendingKeyActivated: set.pendingKeyActivated,
    setSelectedKeyActivatedCost: set.selectedKeyActivatedCost,
    setSelectedKeyActivatedDiscard: set.selectedKeyActivatedDiscard,
    setKeySubstituteEnabled: set.keySubstituteEnabled,
    /** キーピース使用モーダルを開く（コスト選択は白紙化） */
    openKeyModal: (card: CardData) =>
      patch({ pendingKeyCard: card, selectedKeyCost: new Set(), showKeyModal: true }),
    /** キーピース使用モーダルを閉じて選択をリセット */
    closeKeyModal: () =>
      patch({ showKeyModal: false, pendingKeyCard: null, selectedKeyCost: new Set() }),
    /** キー【起】モーダルを開く（コスト選択は白紙化） */
    openKeyActivated: (pending: NonNullable<KeyModalsState['pendingKeyActivated']>) =>
      patch({ pendingKeyActivated: pending, selectedKeyActivatedCost: new Set() }),
    /** キー【起】モーダルを閉じて選択をリセット */
    closeKeyActivated: () =>
      patch({ pendingKeyActivated: null, selectedKeyActivatedCost: new Set(), selectedKeyActivatedDiscard: new Set() }),
  };
}
