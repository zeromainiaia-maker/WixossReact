// Stage2: BattleScreen 本体に散っていたセッション/構成レベルの useState を1ドメインへ集約。
// 「どのデッキで・CPU戦か・読み込み中か」＝1試合のライフサイクル状態。ゲーム盤面（bs）とは別。
import { useDomainState } from './useDomainState';

type DeckData = { main_deck: string[]; lrig_deck: string[] } | null;

export interface BattleSessionState {
  /** 非同期処理中ガード（読み込み・アクション送信中） */
  loading: boolean;
  /** 自分のデッキ（main/lrig の cardNum 配列） */
  myDeckData: DeckData;
  /** CPU 対戦か */
  isCpuBattle: boolean;
  /** CPU 側デッキ（CPU 戦のときのみ） */
  cpuDeckData: DeckData;
}

/** 試合セッション/構成レベルの state（読み込み・自/CPU デッキ・CPU 戦フラグ）。 */
export function useBattleSession() {
  const [state, set] = useDomainState<BattleSessionState>({
    loading: false,
    myDeckData: null,
    isCpuBattle: false,
    cpuDeckData: null,
  });
  return {
    ...state,
    setLoading: set.loading,
    setMyDeckData: set.myDeckData,
    setIsCpuBattle: set.isCpuBattle,
    setCpuDeckData: set.cpuDeckData,
  };
}
