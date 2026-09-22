// バグ報告のペイロード組み立て（§5.6 `C-0`・2026-09-16）。
//
// 🔑**なぜ純関数なのか**＝報告は「遊んで見つけた型」を拾う唯一の導線なので、**中身が欠けていると
//   その報告は死ぬ**（再現できない＝golden に落とせない）。組み立てを React から切り離して
//   golden で固定する（DESIGN §4 と同じ規律＝判定・組み立ては純関数、I/O は呼び出し側）。
//
// 🔴**`snapshot.row` は `battle_states` の行そのもの**にする＝`scripts/verifyBattleDrive.mjs` の
//   `injectScenario` が**この形をそのまま流し込める**ので、**報告がそのまま実機シナリオになる**。
//   ⇒ キーを間引いたり別名にしたりしない（`host_state` を `my` に直す等をやると変換が1枚挟まる）。
import type { BattleStateRow, GameLog } from '../../types';

/** 報告のタグ（スマホで1タップできるよう固定の5択）。 */
export const BUG_TAGS = [
  { id: 'stuck',      label: '進まない・押せない' },
  { id: 'no_button',  label: 'できるはずが出ない' },
  { id: 'wrong',      label: '起きるはずがないことが起きた' },
  { id: 'order',      label: '順番・タイミングが変' },
  { id: 'other',      label: 'その他' },
] as const;

export type BugTagId = typeof BUG_TAGS[number]['id'];

/** 報告に載せるログの件数。⚠**多すぎると行が肥大**し、少なすぎると経路が追えない。 */
export const REPORT_LOG_TAIL = 50;

export interface BugReportRow {
  room_id: string;
  tag: BugTagId;
  comment: string | null;
  app_version: string;
  snapshot: {
    /** `injectScenario` へそのまま渡せる `battle_states` の行（ログだけ末尾 N 件に間引く）。 */
    row: BattleStateRow;
    /** 人間が読むための要約（どの局面かを JSON を開かずに掴むため）。 */
    at: {
      global_phase: BattleStateRow['global_phase'];
      setup_phase: BattleStateRow['setup_phase'];
      turn_phase: BattleStateRow['turn_phase'];
      turn_count: number;
      /** 手番がこの報告者か。🔑「相手のターンで固まった」を区別する。 */
      isMyTurn: boolean;
      /** 開いている対話の種類（`SELECT_TARGET` 等）。**ソフトロックの一次切り分け**。 */
      pendingInteraction: string | null;
      /** 対話に応答すべき側がこの報告者か。🔑**「自分が答える番なのに答えられない」**が最重要の型。 */
      pendingIsMine: boolean | null;
      /** スペル解決待ちか。 */
      pendingSpell: boolean;
      /** 解決待ちのスタック残数（整列前は未整列の総数）。 */
      stackLen: number;
      /** 自分/相手のライフ。盤面の進み具合の当たり。 */
      life: { me: number; opp: number };
    };
    reportedAt: string;
    /**
     * 🆕2026-09-22＝**CPU観戦からの報告**（対戦の報告には無い）。どの山どうしの何手目か。
     * 🔑`seed` と山が同じなら同じ試合が再計算できる（観戦は乱数を seed 固定で回す）。
     * ⚠観戦の `row` は DB に無い行＝`host_id` は `spectate-host`、`room_id` は観戦ごとの uuid。
     */
    spectate?: { deckA: string; deckB: string; frame: number; totalFrames: number; seed: number; firstMode?: 'random' | 'A' | 'B' };
  };
}

/** `effect_stack` の残数（`verifyBattleDrive.mjs` の `queryState` と同じ数え方に揃える）。 */
export function stackLenOf(stack: BattleStateRow['effect_stack']): number {
  if (!stack) return 0;
  return (stack.orderTurnDone && stack.orderOppDone)
    ? (stack.queue?.length ?? 0)
    : ((stack.pendingTurn?.length ?? 0) + (stack.pendingOpp?.length ?? 0));
}

/**
 * 報告1件分の行を組み立てる。
 *
 * ⚠**`user_id` は入れない**＝DB 側が `default auth.uid()` で入れる（クライアントが詐称できない形）。
 * ⚠**`status` も入れない**＝既定の `'OPEN'` に任せる（消化印は `scripts/fetchReports.mjs` が書く）。
 */
export function buildBugReport(args: {
  bs: BattleStateRow;
  myUserId: string;
  tag: BugTagId;
  comment: string;
  appVersion: string;
  now?: Date;
}): BugReportRow {
  const { bs, myUserId, tag, comment, appVersion } = args;
  const logs: GameLog[] = bs.game_logs ?? [];
  // 🔑ログは末尾 N 件だけ載せる（行の肥大を防ぐ）。`injectScenario` はログを読まないので影響しない。
  const row: BattleStateRow = { ...bs, game_logs: logs.slice(-REPORT_LOG_TAIL) };
  const isHost = bs.host_id === myUserId;
  const me = isHost ? bs.host_state : bs.guest_state;
  const opp = isHost ? bs.guest_state : bs.host_state;
  const pe = bs.pending_effect;
  return {
    room_id: bs.room_id,
    tag,
    // 空文字は `null` にする（DB 側で「書いていない」と「空を書いた」を区別しない）。
    comment: comment.trim() === '' ? null : comment.trim(),
    app_version: appVersion,
    snapshot: {
      row,
      at: {
        global_phase: bs.global_phase,
        setup_phase: bs.setup_phase,
        turn_phase: bs.turn_phase,
        turn_count: bs.turn_count,
        isMyTurn: bs.active_user_id === myUserId,
        pendingInteraction: pe?.interaction?.type ?? null,
        // ⚠応答者は `respondPlayerId`（省略時は効果オーナー）＝**相手に選ばせる形**があるのでここを見る。
        pendingIsMine: pe ? (pe.respondPlayerId ?? pe.sourcePlayerId) === myUserId : null,
        pendingSpell: !!bs.pending_spell,
        stackLen: stackLenOf(bs.effect_stack),
        life: { me: me?.life_cloth?.length ?? 0, opp: opp?.life_cloth?.length ?? 0 },
      },
      reportedAt: (args.now ?? new Date()).toISOString(),
    },
  };
}
