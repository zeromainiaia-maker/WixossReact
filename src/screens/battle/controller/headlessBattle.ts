import type { BattleStateRow } from '../../../types';
import { reduceBattle } from './battleController';
import { createMemoryPersist, type MemoryBattlePersist } from './memoryPersist';
import { resolveStackStep, type StackResolveDeps } from './stackResolve';

/**
 * 🆕**ヘッドレスの盤面ドライバ**（§5.7 `S-5c` 第1段・2026-09-18）＝React も supabase も無しで盤面を進める入口。
 *
 * ■ いま回せるもの＝**効果スタックの解決**（`resolveStackStep` を「進まなくなるまで」繰り返す）。
 *   これは `BattleScreen` では `useEffect` ＋ DB の通知待ちで1手ずつ回っていた部分で、
 *   ヘッドレスでは**同期ループ**になる（`memoryPersist` の `commit` が即反映されるため）。
 * ■ まだ回せないもの＝**CPU のターン進行**（`cpuTurnAction` 1,362行）と**実行関数**（`perform*` 計5,098行）。
 *   どちらも `persist.commit` / `appendBattleLogs` を直に呼ぶので、次段で I/O を差し替え可能にする。
 *
 * ⚠**対話（`pending_effect`）が立ったら止まる**＝答えるのは呼び出し側の仕事（CPU なら `cpuInteraction.ts`）。
 *   ここで勝手に自動応答しない（「誰が答えたか」が消えると、人間の対戦と挙動が割れる）。
 */
export interface HeadlessBattle {
  /** メモリ上の盤面（`BattlePersist` と同じ口）。 */
  persist: MemoryBattlePersist;
  /** いまの盤面。 */
  row: () => BattleStateRow;
  /** これまでに積まれた対戦ログ（画面の `appendBattleLogs` に相当）。 */
  logs: string[];
  /**
   * スタックを**進まなくなるまで**解決する。戻り値は「なぜ止まったか」。
   * - `empty`＝解決するものが無い（スタックが空／整列待ち）
   * - `pending`＝対話が立った（`row().pending_effect` を見て答える）
   * - `cap`＝安全弁（既定200手）に当たった＝**無限ループの疑い**（`S-5` の自己対戦では必ず異常）
   */
  resolveStacks: (maxSteps?: number) => 'empty' | 'pending' | 'cap';
}

export function createHeadlessBattle(initial: BattleStateRow, deps: StackResolveDeps): HeadlessBattle {
  const persist = createMemoryPersist(initial);
  const logs: string[] = [];
  const row = () => persist.current()!;
  const resolveStacks = (maxSteps = 200): 'empty' | 'pending' | 'cap' => {
    for (let i = 0; i < maxSteps; i++) {
      const cur = row();
      // 🔴対話が残っている間は解決を進めない（画面側の `resolveStackNext` も `pending_effect` を跨がない）。
      if (cur.pending_effect) return 'pending';
      const step = resolveStackStep(cur, deps);
      if (!step) return 'empty';
      logs.push(...step.logs);
      persist.commit(reduceBattle(cur, step.action));
      if (row().pending_effect) return 'pending';
    }
    return 'cap';
  };
  return { persist, row, logs, resolveStacks };
}
