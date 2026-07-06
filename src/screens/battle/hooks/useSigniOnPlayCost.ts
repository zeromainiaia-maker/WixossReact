// シグニ出現時コスト付き任意【出】効果（SigniOnPlayCostModal）のドメイン state
// （Stage2: useState 10本を useReducer へ純移動）。
import type { PlayerState, StackEntry } from '../../../types';
import type { CardEffect } from '../../../types/effects';
import { useDomainState } from './useDomainState';

export interface SigniOnPlayCostState {
  pendingSigniOnPlayCost: {
    cardNum: string;
    costEffect: CardEffect;
    placedState: PlayerState;
    mandatoryEntries: StackEntry[];
    remainingCostEffects?: CardEffect[]; // 2つ目以降のコスト付き任意【出】（1効果ずつモーダルを連鎖）
    placedZone?: number; // 召喚したゾーン（fieldTrashのexcludeSelf / handToUnderSelfの行き先に使用。グロウ経路はundefined）
  } | null;
  selectedSigniOnPlayCost: Set<number>;
  selectedSigniOnPlayDiscard: Set<number>;
  // エナゾーンからのカード指定コスト（cost.energyTrash）の選択
  selectedSigniOnPlayEnergyTrash: Set<number>;
  // 場のシグニをトラッシュするコスト（cost.fieldTrash）のゾーン選択
  selectedSigniOnPlayFieldTrash: Set<number>;
  // 「シグニを【ビート】にする」コスト（cost.beat_signi）の「他の/任意」beat対象ゾーン選択（自動近似の代替）
  selectedSigniOnPlayBeat: Set<number>;
  // ルリグデッキからアーツを選択するコスト（trashArtsFromLrigDeck）
  selectedSigniOnPlayArtsTrash: string | null;
  // 可変チャームトラッシュコスト - ON_PLAY効果用
  signiOnPlayCharmTrashVar: number;
  // 任意コスト支払い（OPTIONAL_COST）のエナ選択
  selectedOptCost: Set<number>;
}

const initialState: SigniOnPlayCostState = {
  pendingSigniOnPlayCost: null,
  selectedSigniOnPlayCost: new Set(),
  selectedSigniOnPlayDiscard: new Set(),
  selectedSigniOnPlayEnergyTrash: new Set(),
  selectedSigniOnPlayFieldTrash: new Set(),
  selectedSigniOnPlayBeat: new Set(),
  selectedSigniOnPlayArtsTrash: null,
  signiOnPlayCharmTrashVar: 0,
  selectedOptCost: new Set(),
};

export function useSigniOnPlayCost() {
  const [state, set] = useDomainState<SigniOnPlayCostState>(initialState);
  return {
    ...state,
    setPendingSigniOnPlayCost: set.pendingSigniOnPlayCost,
    setSelectedSigniOnPlayCost: set.selectedSigniOnPlayCost,
    setSelectedSigniOnPlayDiscard: set.selectedSigniOnPlayDiscard,
    setSelectedSigniOnPlayEnergyTrash: set.selectedSigniOnPlayEnergyTrash,
    setSelectedSigniOnPlayFieldTrash: set.selectedSigniOnPlayFieldTrash,
    setSelectedSigniOnPlayBeat: set.selectedSigniOnPlayBeat,
    setSelectedSigniOnPlayArtsTrash: set.selectedSigniOnPlayArtsTrash,
    setSigniOnPlayCharmTrashVar: set.signiOnPlayCharmTrashVar,
    setSelectedOptCost: set.selectedOptCost,
  };
}
