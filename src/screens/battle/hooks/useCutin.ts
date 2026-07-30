// スペルカットイン（CutinModal / SpellCutinOverlays）のドメイン state（Stage2: useState 3本を useReducer へ純移動）。
import type { CutinCandidate } from '../modals/types';
import { useDomainState } from './useDomainState';

export interface CutinState {
  pendingCutinCard: CutinCandidate | null;
  selectedCutinCost: Set<number>;
  selectedCutinExceed: Set<number>;
  selectedCutinUnderTrash: Set<string>;
}

const initialState: CutinState = {
  pendingCutinCard: null,
  selectedCutinCost: new Set(),
  selectedCutinExceed: new Set(),
  selectedCutinUnderTrash: new Set(),
};

export function useCutin() {
  const [state, set, patch] = useDomainState<CutinState>(initialState);
  return {
    ...state,
    setPendingCutinCard: set.pendingCutinCard,
    setSelectedCutinCost: set.selectedCutinCost,
    setSelectedCutinExceed: set.selectedCutinExceed,
    setSelectedCutinUnderTrash: set.selectedCutinUnderTrash,
    /** カットイン UI を畳んで選択を全リセット（パス/使用の双方で使う） */
    closeCutin: () =>
      patch({ pendingCutinCard: null, selectedCutinCost: new Set(), selectedCutinExceed: new Set(), selectedCutinUnderTrash: new Set() }),
    /** コスト支払いエナの選択トグル */
    toggleCutinCost: (idx: number) =>
      set.selectedCutinCost((prev) => {
        const next = new Set(prev);
        if (next.has(idx)) next.delete(idx); else next.add(idx);
        return next;
      }),
  };
}
