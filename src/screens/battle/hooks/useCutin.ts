// スペルカットイン（CutinModal / SpellCutinOverlays）のドメイン state（Stage2: useState 3本を useReducer へ純移動）。
import type { CutinCandidate } from '../modals/types';
import { useDomainState } from './useDomainState';

export interface CutinState {
  pendingCutinCard: CutinCandidate | null;
  selectedCutinCost: Set<number>;
  selectedCutinExceed: Set<number>;
}

const initialState: CutinState = {
  pendingCutinCard: null,
  selectedCutinCost: new Set(),
  selectedCutinExceed: new Set(),
};

export function useCutin() {
  const [state, set] = useDomainState<CutinState>(initialState);
  return {
    ...state,
    setPendingCutinCard: set.pendingCutinCard,
    setSelectedCutinCost: set.selectedCutinCost,
    setSelectedCutinExceed: set.selectedCutinExceed,
  };
}
