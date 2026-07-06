// 小型UIドメインの束（Stage2: useState 11本を useReducer へ純移動）。
// リムーブ／ガード応答（バリア【起】・G154回避）／エンド手札捨て／拡大表示 の4ドメインを1ファイルに同居。
import { useDomainState } from './useDomainState';

// リムーブ（RemoveZoneModal）
export interface RemoveZoneState {
  showRemoveModal: boolean;
  selectedRemoveZones: Set<number>;
}

export function useRemoveZone() {
  const [state, set, patch] = useDomainState<RemoveZoneState>({ showRemoveModal: false, selectedRemoveZones: new Set() });
  return {
    ...state,
    setShowRemoveModal: set.showRemoveModal,
    setSelectedRemoveZones: set.selectedRemoveZones,
    /** リムーブモーダルを開く（ゾーン選択は白紙化） */
    openRemoveZone: () => patch({ showRemoveModal: true, selectedRemoveZones: new Set() }),
  };
}

// ガード応答（GuardBarrierActModal＝WX25-P2-001 付与【起】／NegateEscapeModal＝G154 BURST 回避）
export interface GuardResponsesState {
  // v0.278: WX25-P2-001 付与【起】（ガードシグニ捨て→ルリグバリア）
  pendingGuardBarrierAct: boolean;
  selectedBarrierGuardCard: number | null;
  // G154 BURST: アタック無効化を「手札N枚捨て」で回避するか選択（NEGATE_ATTACK escapeDiscard）
  negateEscape: { zoneIndex: number; targetOpZone?: number; cardNum: string; count: number } | null;
  selectedNegateEscape: Set<number>;
}

export function useGuardResponses() {
  const [state, set] = useDomainState<GuardResponsesState>({
    pendingGuardBarrierAct: false,
    selectedBarrierGuardCard: null,
    negateEscape: null,
    selectedNegateEscape: new Set(),
  });
  return {
    ...state,
    setPendingGuardBarrierAct: set.pendingGuardBarrierAct,
    setSelectedBarrierGuardCard: set.selectedBarrierGuardCard,
    setNegateEscape: set.negateEscape,
    setSelectedNegateEscape: set.selectedNegateEscape,
  };
}

// エンドフェイズ手札捨て選択UI（EndDiscardModal）
export interface EndDiscardState {
  pendingEndDiscard: number | null;
  selectedEndDiscard: Set<number>;
}

export function useEndDiscard() {
  const [state, set] = useDomainState<EndDiscardState>({ pendingEndDiscard: null, selectedEndDiscard: new Set() });
  return { ...state, setPendingEndDiscard: set.pendingEndDiscard, setSelectedEndDiscard: set.selectedEndDiscard };
}

// カード拡大表示（ライフバースト確認・相手ライフクラッシュ・スペルカットイン）
export interface ZoomOverlaysState {
  burstCardZoomed: boolean;
  opCheckCardZoomed: boolean; // 相手ライフクラッシュ拡大
  cutinSpellZoomed: boolean;  // スペルカットイン画面の拡大
}

export function useZoomOverlays() {
  const [state, set] = useDomainState<ZoomOverlaysState>({ burstCardZoomed: false, opCheckCardZoomed: false, cutinSpellZoomed: false });
  return {
    ...state,
    setBurstCardZoomed: set.burstCardZoomed,
    setOpCheckCardZoomed: set.opCheckCardZoomed,
    setCutinSpellZoomed: set.cutinSpellZoomed,
  };
}
