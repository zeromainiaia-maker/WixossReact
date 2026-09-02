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
  negateEscape: { zoneIndex: number; targetOpZone?: number; cardNum: string; count: number; attackFieldTrashAlreadyPaid?: boolean; attackHandDiscardAlreadyPaid?: boolean } | null;
  selectedNegateEscape: Set<number>;
  // 解除コストつきアタック制限：アタック宣言前に「他のシグニ」を選んでトラッシュする
  // 🆕`forLrig`／`lrigSlot`（2026-09-02 §5.3 `O-222`）＝**ルリグアタックの解除コスト**でも同じ
  //   モーダルを使う。⚠ルリグには `zoneIndex` が無いので `-1` を入れる規約（`openNegateEscape` と同じ）。
  attackFieldTrashPayment: { zoneIndex: number; targetOpZone?: number; cardNum: string; count: number;
    forLrig?: boolean; lrigSlot?: 'center' | 'assist_l' | 'assist_r' } | null;
  selectedAttackFieldTrashZones: Set<number>;
  // 解除コストつきアタック制限（手札版・§6.4 O-3）：「手札をN枚捨てないかぎりアタックできない」。
  // ⚠`negateEscape`（1回きりの無効化回避）とは**別機構**＝こちらはアタックするごとに払う。
  attackHandDiscardPayment: { zoneIndex: number; targetOpZone?: number; cardNum: string; count: number } | null;
  selectedAttackHandDiscard: Set<number>;
}

export function useGuardResponses() {
  const [state, set, patch] = useDomainState<GuardResponsesState>({
    pendingGuardBarrierAct: false,
    selectedBarrierGuardCard: null,
    negateEscape: null,
    selectedNegateEscape: new Set(),
    attackFieldTrashPayment: null,
    selectedAttackFieldTrashZones: new Set(),
    attackHandDiscardPayment: null,
    selectedAttackHandDiscard: new Set(),
  });
  return {
    ...state,
    setPendingGuardBarrierAct: set.pendingGuardBarrierAct,
    setSelectedBarrierGuardCard: set.selectedBarrierGuardCard,
    setNegateEscape: set.negateEscape,
    setSelectedNegateEscape: set.selectedNegateEscape,
    setAttackFieldTrashPayment: set.attackFieldTrashPayment,
    setSelectedAttackFieldTrashZones: set.selectedAttackFieldTrashZones,
    /** バリア【起】の応答UIを開く（ガードカード選択は白紙化） */
    openGuardBarrierAct: () => patch({ pendingGuardBarrierAct: true, selectedBarrierGuardCard: null }),
    /** バリア【起】の応答UIを閉じる */
    closeGuardBarrierAct: () => patch({ pendingGuardBarrierAct: false, selectedBarrierGuardCard: null }),
    /** G154 回避（手札N枚捨て）の選択UIを開く（捨て札選択は白紙化） */
    openNegateEscape: (v: NonNullable<GuardResponsesState['negateEscape']>) =>
      patch({ negateEscape: v, selectedNegateEscape: new Set() }),
    /** G154 回避の選択UIを閉じる */
    closeNegateEscape: () => patch({ negateEscape: null, selectedNegateEscape: new Set() }),
    /** 解除コスト支払いUIを開く（対象ゾーン選択は白紙化） */
    openAttackFieldTrashPayment: (v: NonNullable<GuardResponsesState['attackFieldTrashPayment']>) =>
      patch({ attackFieldTrashPayment: v, selectedAttackFieldTrashZones: new Set() }),
    /** 解除コスト支払いUIを閉じる */
    closeAttackFieldTrashPayment: () => patch({ attackFieldTrashPayment: null, selectedAttackFieldTrashZones: new Set() }),
    setSelectedAttackHandDiscard: set.selectedAttackHandDiscard,
    /** 解除コスト（手札N枚捨て）支払いUIを開く（捨て札選択は白紙化） */
    openAttackHandDiscardPayment: (v: NonNullable<GuardResponsesState['attackHandDiscardPayment']>) =>
      patch({ attackHandDiscardPayment: v, selectedAttackHandDiscard: new Set() }),
    /** 同・閉じる */
    closeAttackHandDiscardPayment: () => patch({ attackHandDiscardPayment: null, selectedAttackHandDiscard: new Set() }),
  };
}

// エンドフェイズ手札捨て選択UI（EndDiscardModal）
export interface EndDiscardState {
  pendingEndDiscard: number | null;
  selectedEndDiscard: Set<number>;
}

export function useEndDiscard() {
  const [state, set, patch] = useDomainState<EndDiscardState>({ pendingEndDiscard: null, selectedEndDiscard: new Set() });
  return {
    ...state,
    setPendingEndDiscard: set.pendingEndDiscard,
    setSelectedEndDiscard: set.selectedEndDiscard,
    /** エンド手札捨てUIを開く（捨てる枚数を指定・選択は白紙化） */
    openEndDiscard: (count: number) => patch({ pendingEndDiscard: count, selectedEndDiscard: new Set() }),
    /** エンド手札捨てUIを閉じる */
    closeEndDiscard: () => patch({ pendingEndDiscard: null, selectedEndDiscard: new Set() }),
  };
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
