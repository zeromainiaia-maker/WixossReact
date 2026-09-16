import type { BattleStateRow } from '../../types';
import { CPU_PLAYER_ID } from './battleUtils';

/**
 * CPU の自動行動ドライバの判定（§5.1 `V-247`・2026-09-17）。
 *
 * 🔴**なぜ要るか**＝CPU は「盤面が変わったら（useEffect の依存が動いたら）1回走る」だけで動いていた。
 *   ①**CPU の行動が盤面を変えずに終わる／Realtime の通知を1件取りこぼす**と、依存が二度と動かず**永久に止まる**
 *     （2026-09-17 の CPU 通し対戦で、先攻1ターン目のグロウ直後に GROW で60秒停止＝6回中1回）。
 *   ②**行動の途中で自分の書き込みの通知が届く**と、同じ分岐が**古い盤面でもう1回**走る
 *     （ENERGY 分岐は「エナチャージを書く → 900ms 待つ → GROW へ進める」の2段＝待っている間に1段目の通知で再起動し、
 *     GROW への遷移と「グロウフェイズ開始時」の収集を二重に行いうる）。
 *   ⇒ 判定をここへ出し、`BattleScreen` の起動部は「実行中は重ねない」「止まったら DB を読み直して再開する」の2点を持つ。
 */

/** いま CPU が自分で動くべき盤面か（旧実装の useEffect 直書きの条件をそのまま移した）。 */
export function cpuShouldAct(bs: BattleStateRow | null): boolean {
  if (!bs || bs.global_phase !== 'PLAYING') return false;
  // CPU のチェックゾーン処理（バースト確認）は effect_stack があっても行う。
  if (bs.pending_effect || (bs.effect_stack && !bs.guest_state?.field?.check)) return false;
  // 人間がライフバースト処理中は CPU 停止。
  if (bs.host_state?.field?.check) return false;
  const cpuSt = bs.guest_state;
  const isCpuTurn = bs.active_user_id === CPU_PLAYER_ID;
  // ATTACK_ARTS_OP は CPU がターンプレイヤーのとき人間が担当。
  if (bs.turn_phase === 'ATTACK_ARTS_OP' && isCpuTurn) return false;
  if (!isCpuTurn && bs.turn_phase !== 'ATTACK_ARTS_OP' && !cpuSt?.field?.check && !cpuSt?.field?.lrig_attacked
    && !bs.pending_spell && !(cpuSt?.pending_crashed_cards?.length)) return false;
  return true;
}

/**
 * CPU の手番でも**人間の応答を待っている**盤面（見張りはここで再実行しない＝待っているのが正しい）。
 * ⚠通常の起動（盤面の更新）はこれを見ない＝旧実装どおり `cpuTurnAction` 側が待ちを判定して return する。
 */
export function cpuWaitingForHuman(bs: BattleStateRow): boolean {
  if (bs.pending_spell?.caster_id === CPU_PLAYER_ID) return true;           // 人間のカットイン窓
  if (bs.host_state?.field?.lrig_attacked) return true;                     // 人間のガード応答
  if (bs.host_state?.pending_banish_substitute) return true;                // 人間の身代わりの選択
  if (bs.host_state?.pending_life_crash_replace) return true;               // 人間のダメージ置換の選択
  return false;
}

/** 見張りが盤面の読み直しに入るまでの無変化時間（ms）。CPU の行動間隔（900ms）＋書き込みの往復より十分長く取る。 */
export const CPU_WATCHDOG_IDLE_MS = 6000;

/**
 * 見張りの判定＝**CPU が動くべきなのに、盤面も CPU の実行も一定時間止まっている**か。
 * ⚠`true` でもすぐ再実行しない＝呼び出し側は先に DB を読み直し、ローカルと違えば反映するだけにする
 *   （Realtime の取りこぼしを古い盤面のまま再実行すると、同じ行動を二重に行う）。
 */
export function cpuWatchdogShouldCheck(p: {
  shouldAct: boolean; running: boolean; now: number; lastBsChangeAt: number; lastRunEndAt: number;
}): boolean {
  return p.shouldAct && !p.running
    && p.now - p.lastBsChangeAt >= CPU_WATCHDOG_IDLE_MS
    && p.now - p.lastRunEndAt >= CPU_WATCHDOG_IDLE_MS;
}

/**
 * 読み直した行がローカルの盤面と**同じ意味か**（見張りが「再実行」と「反映」を分ける）。
 * ⚠`game_logs` は比べない＝ログの追記だけで CPU の行動は変わらない（ログは RPC で別に書かれる）。
 */
export function sameBattleForCpu(a: BattleStateRow, b: BattleStateRow): boolean {
  return cpuBattleKey(a) === cpuBattleKey(b);
}

/**
 * CPU の起動の依存に使う**盤面の中身の鍵**（`game_logs` を除く）。
 * 🔴**`bs` そのものを依存にしない**＝ログの追記（`append_battle_logs`）も行の更新として届くので、
 *   CPU が1手ごとに数行ログを書くたびに 900ms のタイマーがリセットされ、**CPU の行動が目に見えて遅れる**
 *   （`v82CpuDeploysStrongestWithinLimit` が「ターンが終わらない」で落ちた＝2026-09-17 に実測）。
 */
export function cpuBattleKey(r: BattleStateRow | null): string {
  if (!r) return '';
  return JSON.stringify([
    r.global_phase, r.turn_phase, r.turn_count, r.active_user_id,
    r.host_state, r.guest_state, r.effect_stack ?? null, r.pending_effect ?? null, r.pending_spell ?? null,
  ]);
}

/**
 * `updated_at` を**大小比較できる鍵**にする（REST は `2026-09-17T08:00:00.123456+00:00`、Realtime は区切りや桁が違いうる）。
 * ⚠どちらも UTC の前提（DB の `timestamptz` を UTC で返す）。取れなければ空文字（＝「届いていない」側へ倒れる）。
 */
export function updatedAtKey(ts: string | null | undefined): string {
  const m = (ts ?? '').match(/(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?/);
  if (!m) return '';
  return m.slice(1, 7).join('') + (m[7] ?? '').padEnd(6, '0').slice(0, 6);
}

/**
 * **自分の最後の書き込みが手元の盤面に届いているか**（CPU の次の実行を始めてよいか）。
 * 🔴時刻（手元の時計）ではなく DB の `updated_at` で判定する＝「盤面の中身が変わらない書き込み」でも通知の到着を確かめられる
 *   （手元の時刻と盤面の鍵で判定した中間案は、中身の変わらない書き込みの後に見張りの6秒まで待ち、`v82` が時間切れになった）。
 */
export function lastCommitArrived(p: { pendingCommits: number; localUpdatedAt: string | null | undefined; lastCommitUpdatedAt: string }): boolean {
  if (p.pendingCommits > 0) return false;
  if (!p.lastCommitUpdatedAt) return true;
  return updatedAtKey(p.localUpdatedAt) >= updatedAtKey(p.lastCommitUpdatedAt);
}
