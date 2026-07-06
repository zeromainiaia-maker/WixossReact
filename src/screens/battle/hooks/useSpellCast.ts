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
  const [state, set, patch] = useDomainState<SpellCastState>(initialState);
  return {
    ...state,
    setPendingSpellCast: set.pendingSpellCast,
    setSelectedSpellCost: set.selectedSpellCost,
    /** スペル発動フローを開始（コスト選択は白紙化）。ベット枚数のリセットは useArtsModal.setBetAmount(0) を併用 */
    openSpellCast: (pending: NonNullable<SpellCastState['pendingSpellCast']>) =>
      patch({ pendingSpellCast: pending, selectedSpellCost: new Set() }),
    /** スペル発動フローを終了（コスト選択も白紙化） */
    closeSpellCast: () =>
      patch({ pendingSpellCast: null, selectedSpellCost: new Set() }),
    /** コスト支払いエナの選択トグル */
    toggleSpellCost: (idx: number) =>
      set.selectedSpellCost((prev) => {
        const next = new Set(prev);
        if (next.has(idx)) next.delete(idx); else next.add(idx);
        return next;
      }),
  };
}
