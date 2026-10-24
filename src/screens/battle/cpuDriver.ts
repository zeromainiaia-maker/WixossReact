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
  // 🆕2026-10-23＝**ただし CPU のチェックゾーンにカードがある（相手のアーツで CPU のライフがクラッシュされた）ときは CPU が処理する**。
  //   🔴旧＝窓の中で止まり、誰もライフバーストを確認しないまま永久に停止した（自己対戦で《謳金時代》のクラッシュ後に実測）。
  if (bs.turn_phase === 'ATTACK_ARTS_OP' && isCpuTurn && !cpuSt?.field?.check && !(cpuSt?.pending_crashed_cards?.length)) return false;
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

/** セットアップの見張りが DB を読み直すまでの「盤面が動かない」時間（ms）。 */
export const SETUP_RESYNC_IDLE_MS = 2500;

/**
 * 🔴🆕2026-10-23（ユーザー報告＝CPU 戦のじゃんけんの後「次のフェイズへ移行中...」で止まる）
 *   ＝**セットアップ中に DB を読み直すか**。Realtime がしばらく使われず休眠していると、対戦の開始で起動し直し、
 *   **監視が始まる前の書き込みは通知されない**（実測＝13:26:13 起動開始 → 13:26:15.4 じゃんけんの解決を書く → 13:26:16.8 監視開始。
 *   DB は LRIG_SELECT へ進んだのに画面は JAN_KEN のまま）。CPU の見張りは CPU が動く場面しか見ない（`cpuShouldAct`）ので、
 *   セットアップには見張りが無かった。⇒ **セットアップ中は盤面が一定時間動かなければ読み直す**（PvP も同じ＝相手の書き込みも落ちうる）。
 */
export function setupResyncDue(p: { globalPhase: string | null | undefined; now: number; lastChangeAt: number }): boolean {
  return p.globalPhase === 'SETUP' && p.now - p.lastChangeAt >= SETUP_RESYNC_IDLE_MS;
}

/**
 * 🆕同日（同じ根）＝**自分の書き込みが画面に届かないまま止まっているか**（フェイズを問わない）。
 *   実機の通し対戦（CPU がディーバの山）で3回中2回、人間のエンドフェイズで止まった＝DB には①の解決済みの印
 *   （`end_turn_effects_resolved`）が立っているのに「ターン終了」が効かない（自動解決が画面に届くまで受け付けない）。
 *   CPU の見張りは CPU が動く場面しか見ないので、人間の手番で自分の書き込みの通知が落ちると誰も読み直さない。
 */
/*
 * 🔴🆕2026-10-24（通知の記録 `SYNC_TRACE=1` で実測）＝**待ち時間は「最後の書き込みが返ってから」で測る**（`lastCommitAt`）。
 *   旧＝「最後に盤面が変わってから」だけ＝人間が考えて盤面が15秒止まった後に書き込むと、**書き込みが返った直後の点検で
 *   もう2.5秒たった扱い**になり、通知（普通は0.2秒ほど遅れて届く）を待たずに DB を読み直していた。1戦187手の記録では
 *   通知の取りこぼしは0件で、「自分の書き込みが届かない」の警告はこの早撃ちだった。
 */
export function ownCommitResyncDue(p: { pendingCommits: number; localUpdatedAt: string | null | undefined; lastCommitUpdatedAt: string; now: number; lastChangeAt: number; lastCommitAt?: number }): boolean {
  if (p.pendingCommits > 0 || !p.lastCommitUpdatedAt) return false;
  if (updatedAtKey(p.localUpdatedAt) >= updatedAtKey(p.lastCommitUpdatedAt)) return false;
  return p.now - Math.max(p.lastChangeAt, p.lastCommitAt ?? 0) >= SETUP_RESYNC_IDLE_MS;
}

/** 読み直した行が手元より新しいか（新しいときだけ差し替える＝通知と競っても盤面を巻き戻さない）。 */
export function fetchedRowIsNewer(fetchedUpdatedAt: string | null | undefined, localUpdatedAt: string | null | undefined): boolean {
  const f = updatedAtKey(fetchedUpdatedAt);
  return f !== '' && f > updatedAtKey(localUpdatedAt);
}

/**
 * 🆕🔴2026-10-24（通知の記録 `SYNC_TRACE=1` で実測）＝**届いた行が、いま手元にある同じ部屋の行より古いか**（古ければ捨てる）。
 *   🔑**真因**＝Realtime は通知を確定の順に届けるとは限らない＝書き込み `.460`→`.520` に対して通知が `.520`→`.460` の順に届き、
 *   **新しい盤面の後に古い盤面で上書きして画面が1手前へ戻っていた**。それを見張り（`ownCommitResyncDue`）が2.5秒後に読み直して
 *   直していたのが「自分の書き込みが届かない」の正体（通知は1件も落ちていなかった）。
 *   ⚠**DB の `updated_at` が確定の順に増えることが前提**＝`docs/sql/2026-10-24_updated_at_clock_timestamp.sql`
 *   （旧 `now()` はトランザクションの開始時刻で、重なった書き込みでは最新の行のほうが小さくなりえた＝この判定は使えなかった）。
 *   ⚠部屋が違えば比べない（別の対戦の行）。時刻が読めない行は捨てない。
 */
export function incomingRowIsStale(p: { incomingUpdatedAt: string | null | undefined; lastUpdatedAt: string | null | undefined; sameRoom: boolean }): boolean {
  if (!p.sameRoom) return false;
  const inc = updatedAtKey(p.incomingUpdatedAt), last = updatedAtKey(p.lastUpdatedAt);
  return inc !== '' && last !== '' && inc < last;
}
