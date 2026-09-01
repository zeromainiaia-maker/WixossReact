// グロウモーダルのドメイン state（Stage2: BattleScreen.tsx の useState 4本を useReducer へ純移動）。
// セッターは useState と同じ Dispatch<SetStateAction<T>> 互換シグネチャ（useDomainState 提供）で、呼び出し側は無変更。
import type { CardData } from '../../../types';
import { useDomainState } from './useDomainState';

export interface GrowModalState {
  showGrowModal: boolean;
  // GROW_FREE（ゲット・グロウ等）の発動中。'same'=現センターと同レベルへ、'plus1'=通常の+1。null=通常グロウ。
  // 🆕`'plus1_paid'`＝**効果によるグロウだがコストは払う**（§5.3 `O-83`／`SP38-001-E1`
  //   「あなたのセンタールリグをグロウしてもよい」＝原文に「支払わずに」が無い）。
  //   🔴他の3値と違い `freeCost` は **false**＝ここを混ぜるとコスト踏み倒しになる。
  freeGrowFilter: 'same' | 'plus1' | 'plus1_paid' | null;
  pendingGrowCard: CardData | null;
  selectedGrowCost: Set<number>;
}

const initialState: GrowModalState = {
  showGrowModal: false,
  freeGrowFilter: null,
  pendingGrowCard: null,
  selectedGrowCost: new Set(),
};

export function useGrowModal() {
  const [state, set, patch] = useDomainState<GrowModalState>(initialState);
  return {
    ...state,
    setShowGrowModal: set.showGrowModal,
    setFreeGrowFilter: set.freeGrowFilter,
    setPendingGrowCard: set.pendingGrowCard,
    setSelectedGrowCost: set.selectedGrowCost,
    /** GROW_FREE（ゲット・グロウ等）でモーダルを開く（選択状態は白紙化） */
    openFreeGrow: (filter: 'same' | 'plus1' | 'plus1_paid') =>
      patch({ freeGrowFilter: filter, pendingGrowCard: null, selectedGrowCost: new Set(), showGrowModal: true }),
    /** モーダルを閉じて選択状態・フリーグロウを全リセット */
    closeGrowModal: () =>
      patch({ showGrowModal: false, pendingGrowCard: null, selectedGrowCost: new Set(), freeGrowFilter: null }),
    /** コスト支払いエナの選択トグル */
    toggleGrowCost: (idx: number) =>
      set.selectedGrowCost((prev) => {
        const next = new Set(prev);
        if (next.has(idx)) next.delete(idx); else next.add(idx);
        return next;
      }),
  };
}
