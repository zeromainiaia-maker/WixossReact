// 効果インタラクション（SELECT_TARGET / SEARCH / CHOOSE / LOOK_AND_REORDER / スタック整列）の
// 選択中 UI state（Stage2: useState 8本を useReducer へ純移動）。EffectInteractionModal / StackOrderModal /
// SystemOverlays（LOOK_AND_REORDER 観戦・長押し拡大）が参照する。
import { useDomainState } from './useDomainState';

export interface EffectInteractionState {
  // 効果インタラクション：SELECT_TARGET / SEARCH / CHOOSE
  effectSelectedNums: string[];
  // REARRANGE_SIGNI: 各ゾーン（新配置）に割り当てたシグニ instance id（null=空き）
  rearrangeSlots: (string | null)[];
  // カード選択UI長押し拡大
  expandedPickImgUrl: string | null;
  // 効果スタック整列UI：自分の pending エントリの id を並べた配列
  stackOrderIds: string[];
  // LOOK_AND_REORDER インタラクション：現在の並び順
  lookReorderOrder: string[];
  // LOOK_AND_REORDER：トラッシュに置くカード（canTrash 時のみ。「好きな枚数をトラッシュに置き」）
  lookReorderTrash: Set<string>;
  // LOOK_AND_REORDER：デッキ下へ置くカード（split_top_bottom 時のみ。「残りを一番下に置く」。未選択=一番上）
  lookReorderBottom: Set<string>;
  selectedMultiChoiceIds: Set<string>;
}

const initialState: EffectInteractionState = {
  effectSelectedNums: [],
  rearrangeSlots: [null, null, null],
  expandedPickImgUrl: null,
  stackOrderIds: [],
  lookReorderOrder: [],
  lookReorderTrash: new Set(),
  lookReorderBottom: new Set(),
  selectedMultiChoiceIds: new Set(),
};

export function useEffectInteraction() {
  const [state, set] = useDomainState<EffectInteractionState>(initialState);
  return {
    ...state,
    setEffectSelectedNums: set.effectSelectedNums,
    setRearrangeSlots: set.rearrangeSlots,
    setExpandedPickImgUrl: set.expandedPickImgUrl,
    setStackOrderIds: set.stackOrderIds,
    setLookReorderOrder: set.lookReorderOrder,
    setLookReorderTrash: set.lookReorderTrash,
    setLookReorderBottom: set.lookReorderBottom,
    setSelectedMultiChoiceIds: set.selectedMultiChoiceIds,
  };
}
