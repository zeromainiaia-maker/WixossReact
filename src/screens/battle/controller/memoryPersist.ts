import type { BattleStateRow } from '../../../types';
import type { BattlePersist } from './persist';

/**
 * 🆕**メモリ上の永続化**（§5.7 `S-5a`・2026-09-18）＝`BattlePersist`（＝battle_states への I/O の唯一の口）の
 * **DB を使わない実装**。盤面を1行ぶんメモリに持ち、`commit(patch)` をその場で適用する。
 *
 * ■ なぜ要るか＝`S-5`（対戦丸ごとのシミュレータ）の第1段。画面と DB を外して盤面を進めるには、
 *   **「書いて realtime の通知を待つ」非同期の段取り**を「その場で反映する同期の代入」に差し替える必要がある。
 *   `BattleScreen` は既に**全書き込みが `persist.commit(reduceBattle(...))` の1本**を通っているので、
 *   差し替える口はここだけで足りる（`docs/BATTLE_CONTROLLER.md` の seam）。
 *
 * ■ 本物（`useBattlePersist`）との違い
 *   - `commit` は**即座に**盤面へ反映される（DB 往復も realtime も無い）＝呼び出し側は待ちを入れなくてよい。
 *   - `updated_at` は**呼ぶたびに進む**（CPU の起動が「自分の書き込みが届いたか」を見るのに使う＝`V-247`）。
 *   - `remove()` は行を消す＝以後の `fetchState()` は `{ data: null }`。
 * ⚠**パッチの意味は解釈しない**（浅いマージだけ）＝盤面の遷移は純粋 reducer（`reduceBattle`）の責務。
 *   ここで「commit の中身を見て何かする」を足すと、本物とメモリ版で挙動が割れる。
 */
export interface MemoryBattlePersist extends BattlePersist {
  /** いまの盤面（`null`＝`remove()` 済み）。 */
  current: () => BattleStateRow | null;
  /** `commit` の回数（ヘッドレスの進行が止まっていないかの計器）。 */
  commitCount: () => number;
  /** 盤面を丸ごと差し替える（テスト・シナリオの初期化用）。 */
  reset: (row: BattleStateRow) => void;
}

export function createMemoryPersist(initial: BattleStateRow): MemoryBattlePersist {
  let row: BattleStateRow | null = { ...initial };
  let commits = 0;
  // `updated_at` は DB のトリガー相当＝書き込みのたびに必ず進める（同じミリ秒でも単調に増やす）。
  let clock = Date.parse(initial.updated_at ?? '') || Date.parse('2026-01-01T00:00:00.000Z');
  const stamp = () => new Date(++clock).toISOString();
  return {
    commit: (patch) => {
      commits++;
      if (!row) return Promise.resolve({ error: { message: 'battle state removed' }, data: null });
      const updated_at = stamp();
      row = { ...row, ...patch, updated_at };
      return Promise.resolve({ error: null, data: [{ updated_at }] });
    },
    fetchState: () => Promise.resolve({ data: row ? { ...row } : null, error: null }),
    remove: () => { row = null; return Promise.resolve({ error: null }); },
    current: () => (row ? { ...row } : null),
    commitCount: () => commits,
    reset: (next) => { row = { ...next }; commits = 0; },
  };
}
