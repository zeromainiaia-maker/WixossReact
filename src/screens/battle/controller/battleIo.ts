import type { BattleStateRow } from '../../../types';
import type { BattlePersist } from './persist';

/**
 * 🆕**実行関数の I/O 口**（§5.7 `S-5c` 第2段・2026-09-18）。
 *
 * ■ なぜ要るか＝`perform*`（12本・計3,315行）と `cpuTurnAction`（1,362行）は
 *   **`persist.commit`／`appendBattleLogs`／`setLoading` を直に呼ぶ**ので、画面の外から回せない。
 *   ⇒ **この3つだけを注入**にすれば、実行関数そのものは人間の対戦と共有したまま、
 *   ヘッドレス（`S-5`）はメモリ上の盤面と配列ロガーを渡して同じ関数を回せる。
 *
 * ⚠**口は3つに保つ**（増やすほど画面から出せなくなる）。React の state を触りたくなったら、
 *   それは「実行関数の仕事ではない」という合図。
 * ⚠`appendLogs` の `defer`＝画面は「commit が確定してから flush」する（先に RPC が届いて
 *   stale な `effect_stack` で再実行されるのを防ぐ）。ヘッドレスでは単に配列へ積むだけでよい。
 */
export interface BattleIo {
  /** 盤面のパッチを書く（`reduceBattle` の出力をそのまま渡す）。 */
  commit: BattlePersist['commit'];
  /** 対戦ログを積む。 */
  appendLogs: (lines: string[], opts?: { defer?: boolean }) => void;
  /** 画面の操作ロック（ヘッドレスでは no-op）。 */
  setLoading: (v: boolean) => void;
}

/** ヘッドレス用の I/O（メモリ上の `BattlePersist` ＋ 配列ロガー ＋ no-op ロック）。 */
export function createHeadlessIo(persist: BattlePersist): { io: BattleIo; logs: string[] } {
  const logs: string[] = [];
  return {
    logs,
    io: {
      commit: (patch: Partial<BattleStateRow>) => persist.commit(patch),
      appendLogs: (lines) => { logs.push(...lines); },
      setLoading: () => {},
    },
  };
}
