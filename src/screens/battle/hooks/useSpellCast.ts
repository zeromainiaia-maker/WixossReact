// スペル発動（SpellCastModal）のドメイン state（Stage2: useState 2本を useReducer へ純移動）。
// ⚠ スペルのベット枚数は useArtsModal の betAmount を共有する（従来と同じ1状態）。
import { useDomainState } from './useDomainState';

export interface SpellCastState {
  pendingSpellCast: { cardNum: string; handIndex: number; fromLrigDeck?: boolean } | null;
  selectedSpellCost: Set<number>;
}

const initialState: SpellCastState = {
  pendingSpellCast: null,
  selectedSpellCost: new Set(),
};

export function useSpellCast() {
  const [state, set] = useDomainState<SpellCastState>(initialState);
  return {
    ...state,
    setPendingSpellCast: set.pendingSpellCast,
    setSelectedSpellCost: set.selectedSpellCost,
  };
}
