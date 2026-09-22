/**
 * 非公開情報（裏向き・手札・デッキ）を**共有ログに漏らさない**ための判定と、
 * 「自分だけに見えるログ」の印。（§5.1 `V-286`。先行例＝`V-285`【トラップ】／`facedownPeek.ts`）
 *
 * 🔴**なぜ要るか**＝`game_logs` は部屋で1本（`appendBattleLogs` → `append_battle_logs` RPC →
 *   Realtime で相手へ）で、**閲覧者ごとの絞り込みが型にも実装にも無い**。
 *   ⇒ engine が `addLog` に書いた札の名前は、そのまま**相手の画面に出る**。
 *   【トラップ】と同型の穴が、【チャーム】／【シード】／【マジックボックス】／ライフクロス／
 *   裏向き設置／「デッキの上から見る」／「場に出せなかった札」に**同じ形で残っていた**。
 *
 * 🔑**2つの道具しか無い**：
 *   ①`publicCardLabel()`＝**出所が公開領域のときだけ名前を出す**（相手が既に見ている札は伏せない）。
 *   ②`privateLine()`＝**自分だけに見える行**。`BattleScreen.appendBattleLogs` が印のある行を
 *     ローカルにだけ積み、**RPC へは絶対に送らない**。「見る」効果の結果はこちらで配る。
 *
 * ⚠**インタラクションUI（`pending_effect` の選択肢ラベル・`visibleCards`）は漏れていない**＝
 *   `EffectInteractionModal` が `respondPlayerId === user.id` のときしか描かない。
 *   ⇒「見た札」を選ばせる経路は**ログから名前を外すだけでよい**（情報は選択UIが配る）。
 */
import type { PlayerState } from '../types';

/** 自分だけに見える行の印。⚠**表示前に必ず取り除く**（`stripPrivateMark`）。 */
export const PRIVATE_LOG_MARK = '\u{1F512}';

/** 自分だけに見える1行を作る。 */
export function privateLine(msg: string): string {
  return PRIVATE_LOG_MARK + msg;
}

export function isPrivateLogLine(line: string): boolean {
  return line.startsWith(PRIVATE_LOG_MARK);
}

export function stripPrivateMark(line: string): string {
  return isPrivateLogLine(line) ? line.slice(PRIVATE_LOG_MARK.length) : line;
}

/**
 * ログ行を「相手にも配ってよい」「自分だけ」に振り分ける。
 * 🔑**呼び出し側が印の形を知らなくて済む**ようにここで割る（`appendBattleLogs` の1点で使う）。
 */
export function splitLogsByVisibility(lines: string[]): { shared: string[]; own: string[] } {
  const shared: string[] = [];
  const own: string[] = [];
  for (const l of lines) (isPrivateLogLine(l) ? own : shared).push(stripPrivateMark(l));
  return { shared, own };
}

/**
 * その札が**いま公開領域に居るか**（＝相手が既に中身を見ている）。
 * 🔑インスタンスIDつき（`WX01-001#3`）でも素の番号でも当たるよう、**配列の要素と完全一致**で見る
 *   （`getCardNum` で丸めると同名の別インスタンスを取り違える）。
 * ⚠**ライフクロス・手札・デッキ・ルリグデッキ・裏向きの置き場は公開領域ではない。**
 */
export function isInPublicZone(state: PlayerState, cardNum: string): boolean {
  if (state.trash.includes(cardNum)) return true;
  if (state.energy.includes(cardNum)) return true;
  if ((state.lrig_trash ?? []).includes(cardNum)) return true;
  if ((state.excluded ?? []).includes(cardNum)) return true;
  const f = state.field;
  if (f.lrig.includes(cardNum)) return true;
  if ((f.assist_lrig_l ?? []).includes(cardNum)) return true;
  if ((f.assist_lrig_r ?? []).includes(cardNum)) return true;
  if (f.signi.some(stack => (stack ?? []).includes(cardNum))) return true;
  if ((f.signi_acce ?? []).some(a => (a ?? []).includes(cardNum))) return true;
  if (f.check === cardNum) return true;
  if ((f.check_rest ?? []).includes(cardNum)) return true;
  if (f.key_piece === cardNum) return true;
  if ((f.key_piece_extra ?? []).includes(cardNum)) return true;
  return false;
}

/**
 * 共有ログ用の札の表記。**公開領域に居るときだけ名前**、それ以外は伏せた表記を返す。
 * @param fallback 伏せるときの表記（既定「カード１枚」）
 */
export function publicCardLabel(
  state: PlayerState,
  cardNum: string,
  cardName: string | undefined,
  fallback = 'カード１枚',
): string {
  return isInPublicZone(state, cardNum) ? (cardName ?? cardNum) : fallback;
}
