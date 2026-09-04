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
  /**
   * 🆕**§5.3 `O-248`（2026-09-05）＝グロウ先カード自身の「捨ててもよい」任意コストで捨てる手札の index。**
   * （`WX21-017`「手札から＜天使＞のシグニを2枚捨ててもよい。そうした場合、コストは《青×0》になる」）
   * ⚠**エナの選択（`selectedGrowCost`）とは別の集合**＝混ぜると「エナを選んだのに手札が減る」になる。
   */
  growPayDiscard: Set<number>;
}

const initialState: GrowModalState = {
  showGrowModal: false,
  freeGrowFilter: null,
  pendingGrowCard: null,
  selectedGrowCost: new Set(),
  growPayDiscard: new Set(),
};

export function useGrowModal() {
  const [state, set, patch] = useDomainState<GrowModalState>(initialState);
  return {
    ...state,
    setShowGrowModal: set.showGrowModal,
    setFreeGrowFilter: set.freeGrowFilter,
    setPendingGrowCard: set.pendingGrowCard,
    setSelectedGrowCost: set.selectedGrowCost,
    setGrowPayDiscard: set.growPayDiscard,
    /** GROW_FREE（ゲット・グロウ等）でモーダルを開く（選択状態は白紙化） */
    openFreeGrow: (filter: 'same' | 'plus1' | 'plus1_paid') =>
      patch({ freeGrowFilter: filter, pendingGrowCard: null, selectedGrowCost: new Set(), growPayDiscard: new Set(), showGrowModal: true }),
    /** モーダルを閉じて選択状態・フリーグロウを全リセット */
    closeGrowModal: () =>
      patch({ showGrowModal: false, pendingGrowCard: null, selectedGrowCost: new Set(), growPayDiscard: new Set(), freeGrowFilter: null }),
    /** コスト支払いエナの選択トグル */
    toggleGrowCost: (idx: number) =>
      set.selectedGrowCost((prev) => {
        const next = new Set(prev);
        if (next.has(idx)) next.delete(idx); else next.add(idx);
        return next;
      }),
    /** 任意コストで捨てる手札の選択トグル（§5.3 `O-248`）。 */
    toggleGrowPayDiscard: (idx: number) =>
      set.growPayDiscard((prev) => {
        const next = new Set(prev);
        if (next.has(idx)) next.delete(idx); else next.add(idx);
        return next;
      }),
  };
}
