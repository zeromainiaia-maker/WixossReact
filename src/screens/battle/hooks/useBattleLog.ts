// Stage2: バトルログUIの state（展開トグル・ログ配列）とスクロール ref を1ドメインへ集約。
import { useRef } from 'react';
import { useDomainState } from './useDomainState';
import type { GameLog } from '../../../types';

export interface BattleLogState {
  /** ログパネルの展開状態 */
  logExpanded: boolean;
  /** 表示中のゲームログ */
  battleLogs: GameLog[];
}

/** バトルログUIの state と自動スクロール用 ref。 */
export function useBattleLog() {
  const [state, set] = useDomainState<BattleLogState>({ logExpanded: false, battleLogs: [] });
  const logScrollRef = useRef<HTMLDivElement>(null);
  return {
    ...state,
    setLogExpanded: set.logExpanded,
    setBattleLogs: set.battleLogs,
    logScrollRef,
  };
}
