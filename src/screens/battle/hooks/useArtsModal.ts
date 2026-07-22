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
  isBoosting: boolean;
  isEncore: boolean;
}

const initialState: ArtsModalState = {
  showArtsModal: false,
  pendingArtsCard: null,
  pendingArtsEffectiveCost: null,
  selectedArtsCost: new Set(),
  selectedArtsDiscard: new Set(),
  betAmount: 0,
  isBoosting: false,
  isEncore: false,
};

export function useArtsModal() {
  const [state, set, patch] = useDomainState<ArtsModalState>(initialState);
  return {
    ...state,
    setShowArtsModal: set.showArtsModal,
    setPendingArtsCard: set.pendingArtsCard,
    setPendingArtsEffectiveCost: set.pendingArtsEffectiveCost,
    setSelectedArtsCost: set.selectedArtsCost,
    setSelectedArtsDiscard: set.selectedArtsDiscard,
    setBetAmount: set.betAmount,
    setIsBoosting: set.isBoosting,
    setIsEncore: set.isEncore,
    /** アーツ詳細（Phase2）を開く：対象カード＋減額後実効コストをセットし選択を白紙化 */
    openArtsModal: (card: CardData, effectiveCost: string | null) =>
      patch({ pendingArtsCard: card, pendingArtsEffectiveCost: effectiveCost, selectedArtsCost: new Set(), isBoosting: false, showArtsModal: true }),
    /** モーダルを閉じて選択・ベット・アンコールを全リセット（keySubstituteEnabled はキー側で別途） */
    closeArtsModal: () =>
      patch({
        showArtsModal: false, pendingArtsCard: null, selectedArtsCost: new Set(),
        selectedArtsDiscard: new Set(), betAmount: 0, isBoosting: false, isEncore: false,
      }),
    /** コスト支払いエナの選択トグル */
    toggleArtsCost: (idx: number) =>
      set.selectedArtsCost((prev) => {
        const next = new Set(prev);
        if (next.has(idx)) next.delete(idx); else next.add(idx);
        return next;
      }),
  };
}
