// Stage2: BattleScreen 本体に残っていた配置/セットアップ系の中間 state を2ドメインへ集約。
// useMiscBattleUI と同じく「小型ドメインを1ファイルに同居」させる方式。
import { useDomainState } from './useDomainState';

// ── 開始時セットアップ（マリガン選択＋アシストルリグセットアップの中間状態） ──
export interface GameStartSetupState {
  /** マリガンで選択中の手札インデックス */
  mulliganSelected: Set<number>;
  /** センタールリグ選択後〜アシスト確定までの中間状態 */
  pendingLrigSetup: {
    centerCardNum: string;
    centerInstanceId: string;
    lrigWithIds: string[];
    mainWithIds: string[];
    remainingLv0: Array<{ cardNum: string; instanceId: string; origIdx: number }>;
    assistStep: 'confirm' | 'select_l' | 'select_r';
    assistLInstanceId: string | null;
    assistLCardNum: string | null;
  } | null;
}

/** ゲーム開始時セットアップ（マリガン・アシストルリグ配置）の中間 state。 */
export function useGameStartSetup() {
  const [state, set] = useDomainState<GameStartSetupState>({
    mulliganSelected: new Set(),
    pendingLrigSetup: null,
  });
  return {
    ...state,
    setMulliganSelected: set.mulliganSelected,
    setPendingLrigSetup: set.pendingLrigSetup,
  };
}

// ── シグニ召喚ゾーン選択フロー（召喚待ちカード＋ゾーンモーダル閉鎖シグナル） ──
export interface SigniSummonFlowState {
  /** 召喚ゾーン選択待ちのシグニ（cardNum＋手札index） */
  pendingSigniSummon: { cardNum: string; handIndex: number } | null;
  /** ゾーンモーダルを外部から閉じるためのインクリメント式シグナル */
  closeZoneSignal: number;
}

/** シグニ召喚ゾーン選択フローの state。 */
export function useSigniSummonFlow() {
  const [state, set] = useDomainState<SigniSummonFlowState>({
    pendingSigniSummon: null,
    closeZoneSignal: 0,
  });
  return {
    ...state,
    setPendingSigniSummon: set.pendingSigniSummon,
    setCloseZoneSignal: set.closeZoneSignal,
  };
}
