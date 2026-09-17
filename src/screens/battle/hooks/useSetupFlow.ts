// Stage2: BattleScreen 本体に残っていた配置/セットアップ系の中間 state を2ドメインへ集約。
// useMiscBattleUI と同じく「小型ドメインを1ファイルに同居」させる方式。
import { useDomainState } from './useDomainState';

// ── 開始時セットアップ（マリガン選択の中間状態）──
// ⚠ルリグの配置はデッキ編成で指定する（2026-09-17）＝対戦開始時の選択の中間状態は持たない。
export interface GameStartSetupState {
  /** マリガンで選択中の手札インデックス */
  mulliganSelected: Set<number>;
}

/** ゲーム開始時セットアップ（マリガン）の中間 state。 */
export function useGameStartSetup() {
  const [state, set] = useDomainState<GameStartSetupState>({
    mulliganSelected: new Set(),
  });
  return {
    ...state,
    setMulliganSelected: set.mulliganSelected,
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
