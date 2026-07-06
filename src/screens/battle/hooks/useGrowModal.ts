// グロウモーダルのドメイン state（Stage2: BattleScreen.tsx の useState 4本を useReducer へ純移動）。
// セッターは useState と同じ Dispatch<SetStateAction<T>> 互換シグネチャを公開し、呼び出し側は無変更で使える。
import { useCallback, useReducer } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { CardData } from '../../../types';

export interface GrowModalState {
  showGrowModal: boolean;
  // GROW_FREE（ゲット・グロウ等）の発動中。'same'=現センターと同レベルへ、'plus1'=通常の+1。null=通常グロウ。
  freeGrowFilter: 'same' | 'plus1' | null;
  pendingGrowCard: CardData | null;
  selectedGrowCost: Set<number>;
}

const initialState: GrowModalState = {
  showGrowModal: false,
  freeGrowFilter: null,
  pendingGrowCard: null,
  selectedGrowCost: new Set(),
};

type GrowModalAction = {
  [K in keyof GrowModalState]: { field: K; value: SetStateAction<GrowModalState[K]> };
}[keyof GrowModalState];

function apply<K extends keyof GrowModalState>(
  state: GrowModalState, field: K, value: SetStateAction<GrowModalState[K]>,
): GrowModalState {
  const prev = state[field];
  const next = typeof value === 'function' ? value(prev) : value;
  if (Object.is(prev, next)) return state; // useState と同じ同値ベイルアウト
  return { ...state, [field]: next };
}

function reducer(state: GrowModalState, a: GrowModalAction): GrowModalState {
  switch (a.field) {
    case 'showGrowModal': return apply(state, a.field, a.value);
    case 'freeGrowFilter': return apply(state, a.field, a.value);
    case 'pendingGrowCard': return apply(state, a.field, a.value);
    case 'selectedGrowCost': return apply(state, a.field, a.value);
  }
}

export function useGrowModal() {
  const [state, dispatch] = useReducer(reducer, initialState);
  const setShowGrowModal: Dispatch<SetStateAction<boolean>> =
    useCallback((value) => dispatch({ field: 'showGrowModal', value }), []);
  const setFreeGrowFilter: Dispatch<SetStateAction<'same' | 'plus1' | null>> =
    useCallback((value) => dispatch({ field: 'freeGrowFilter', value }), []);
  const setPendingGrowCard: Dispatch<SetStateAction<CardData | null>> =
    useCallback((value) => dispatch({ field: 'pendingGrowCard', value }), []);
  const setSelectedGrowCost: Dispatch<SetStateAction<Set<number>>> =
    useCallback((value) => dispatch({ field: 'selectedGrowCost', value }), []);
  return {
    ...state,
    setShowGrowModal, setFreeGrowFilter, setPendingGrowCard, setSelectedGrowCost,
  };
}
