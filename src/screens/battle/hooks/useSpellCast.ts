// スペル発動（SpellCastModal）のドメイン state（Stage2: useState 2本を useReducer へ純移動）。
// ⚠ スペルのベット枚数は useArtsModal の betAmount を共有する（従来と同じ1状態）。
import { useDomainState } from './useDomainState';

export interface SpellCastState {
  pendingSpellCast: PendingSpellCast | null;
  selectedSpellCost: Set<number>;
  /** 使用時の任意支払い（「手札から青と黒の＜電機＞を1枚ずつ捨ててもよい」）で選んだ手札 index。タスク12(lxxxi) */
  selectedSpellDiscard: Set<number>;
  /** 使用時の任意支払いによるコスト**軽減**で選んだ支払い（`useTimeCost.ts` の候補 key）。タスク12(lxxxv) */
  selectedSpellUseCostPay: Set<string>;
}

export interface PendingSpellCast {
  cardNum: string;
  handIndex: number;
  fromLrigDeck?: boolean;
  /** WX15-067: 使用宣言中のこの1回だけに属する、相手各シグニゾーンから取り除くウィルス数。 */
  virusRemovalByZone?: number[];
}

const initialState: SpellCastState = {
  pendingSpellCast: null,
  selectedSpellCost: new Set(),
  selectedSpellDiscard: new Set(),
  selectedSpellUseCostPay: new Set(),
};

export function useSpellCast() {
  const [state, set, patch] = useDomainState<SpellCastState>(initialState);
  return {
    ...state,
    setPendingSpellCast: set.pendingSpellCast,
    setSelectedSpellCost: set.selectedSpellCost,
    setSelectedSpellDiscard: set.selectedSpellDiscard,
    setSelectedSpellUseCostPay: set.selectedSpellUseCostPay,
    /** スペル発動フローを開始（コスト選択は白紙化）。ベット枚数のリセットは useArtsModal.setBetAmount(0) を併用 */
    openSpellCast: (pending: NonNullable<SpellCastState['pendingSpellCast']>) =>
      patch({ pendingSpellCast: pending, selectedSpellCost: new Set(), selectedSpellDiscard: new Set(), selectedSpellUseCostPay: new Set() }),
    /** スペル発動フローを終了（コスト選択も白紙化） */
    closeSpellCast: () =>
      patch({ pendingSpellCast: null, selectedSpellCost: new Set(), selectedSpellDiscard: new Set(), selectedSpellUseCostPay: new Set() }),
    /** コスト支払いエナの選択トグル */
    toggleSpellCost: (idx: number) =>
      set.selectedSpellCost((prev) => {
        const next = new Set(prev);
        if (next.has(idx)) next.delete(idx); else next.add(idx);
        return next;
      }),
  };
}
