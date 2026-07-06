// アーツモーダルのドメイン state（Stage2: BattleScreen.tsx の useState 7本を useReducer へ純移動）。
// ⚠ betAmount はアーツのベットに加えスペル（SpellCastModal）のベットでも共有される（従来と同じ1状態）。
import type { CardData } from '../../../types';
import { useDomainState } from './useDomainState';

export interface ArtsModalState {
  showArtsModal: boolean;
  pendingArtsCard: CardData | null;
  pendingArtsEffectiveCost: string | null;
  selectedArtsCost: Set<number>;
  selectedArtsDiscard: Set<number>;
  // ベットで支払うコイン枚数（0=ベットしない）。固定/段階(or)/可変(好きな枚数)を統一表現
  betAmount: number;
  isEncore: boolean;
}

const initialState: ArtsModalState = {
  showArtsModal: false,
  pendingArtsCard: null,
  pendingArtsEffectiveCost: null,
  selectedArtsCost: new Set(),
  selectedArtsDiscard: new Set(),
  betAmount: 0,
  isEncore: false,
};

export function useArtsModal() {
  const [state, set] = useDomainState<ArtsModalState>(initialState);
  return {
    ...state,
    setShowArtsModal: set.showArtsModal,
    setPendingArtsCard: set.pendingArtsCard,
    setPendingArtsEffectiveCost: set.pendingArtsEffectiveCost,
    setSelectedArtsCost: set.selectedArtsCost,
    setSelectedArtsDiscard: set.selectedArtsDiscard,
    setBetAmount: set.betAmount,
    setIsEncore: set.isEncore,
  };
}
