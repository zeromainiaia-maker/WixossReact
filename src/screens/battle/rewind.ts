/**
 * **「何手目に戻る」**（2026-09-23 ユーザー要望＝「オンライン対戦中にラグかなんかでカードが消えることがあった。
 * その試合の何手目に戻ることができる機能（再現ではなく完全にその状態に戻る）が欲しい」）。
 *
 * 🔑**設計の芯＝盤面の履歴は DB が持つ**＝`battle_states` の1行が更新されるたび、
 *   **Postgres のトリガーが `move_no` を1つ進めて `battle_snapshots` へ行ごと写す**（SQL は `docs/SQL_REWIND.md`）。
 *   ⇒ クライアントは**何も溜めない**（リロードしても・別の端末でも・後から入っても同じ履歴が見える）。
 *
 * 🔑**「何手目」＝ログの行番号**（1始まり・その試合の通し番号）＝ユーザーが画面で読んでいる単位。
 *   各ログ行は書かれた時点の `move_no` を `move_no` フィールドに持つので、
 *   **行番号 → スナップショット番号**の対応はログ配列だけで引ける（ここがこのファイルの仕事）。
 *
 * 🔴**復元は「巻き戻し」ではなく「前進」**＝`rewind_battle` RPC はスナップショットの中身を現在の行へ**書き直す**
 *   ので、`move_no` はそのまま進み続ける（履歴が分岐して同じ番号が2つ現れることがない）。
 *   ⚠**ログは戻さない**＝戻すと「何が起きたか」の記録ごと消える。代わりに戻した旨の1行を足す。
 */
import type { GameLog, RewindRequest } from '../../types';

/** 1部屋あたり DB に残すスナップショットの数（SQL 側のトリガーと合わせる）。 */
export const REWIND_SNAPSHOT_KEEP = 400;

/**
 * 🔑**申請の形（`RewindRequest`）は `src/types` が正**＝`battle_states` の列の形なので、
 *   盤面の行と同じ場所に置く。ここは判定だけを持つ（再輸出は呼び出し側の便宜）。
 */
export type { RewindRequest } from '../../types';

export type RewindTarget =
  | { ok: true; logNo: number; stateNo: number; text: string }
  | { ok: false; reason: string };

/**
 * 入力された「何手目」を、復元できるスナップショット番号へ解決する。
 * ⚠**候補出しではなく判定**＝ここで `ok:false` になったものは RPC を呼んでも失敗する
 *   （呼ぶ前に理由を日本語で出せるようにする）。
 */
export function resolveRewindTarget(logs: readonly GameLog[], input: string): RewindTarget {
  const trimmed = input.trim();
  if (trimmed === '') return { ok: false, reason: '手番号を入力してください' };
  if (!/^[0-9]+$/.test(trimmed)) return { ok: false, reason: '手番号は数字で入力してください' };
  const logNo = Number(trimmed);
  if (logNo < 1 || logNo > logs.length) {
    return { ok: false, reason: `1〜${logs.length} の間で入力してください（いまは${logs.length}手目まで）` };
  }
  const log = logs[logNo - 1];
  const stateNo = log?.move_no;
  // 🔴**この機能を足す前のログには `move_no` が無い**＝その行の盤面は DB に残っていない。
  //   「戻したつもりで別の盤面になる」ほうが危険なので、黙って近くの手で代用しない。
  if (typeof stateNo !== 'number') {
    return { ok: false, reason: `${logNo}手目の盤面は保存されていません（この機能より前の手です）` };
  }
  return { ok: true, logNo, stateNo, text: log.action };
}

/** その申請に**自分が返事をする**番か（＝同意ダイアログを出すか）。 */
export function shouldAskRewindConsent(req: RewindRequest | null | undefined, myUserId: string): boolean {
  return !!req && req.status === 'PENDING' && req.by !== myUserId;
}

/** 自分が出した申請が**まだ返事待ち**か（＝待機表示を出すか）。 */
export function isMyRewindPending(req: RewindRequest | null | undefined, myUserId: string): boolean {
  return !!req && req.status === 'PENDING' && req.by === myUserId;
}

/** 戻したことを残すログ行（🔴ログは戻さないので、ここだけが「戻した」証跡になる）。 */
export function rewindDoneLogLine(logNo: number): string {
  return `━━ ${logNo}手目の盤面に戻しました（両者の同意） ━━`;
}
