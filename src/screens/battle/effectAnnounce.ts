/**
 * **相手の効果が始まったことの告知**（2026-10-01 ユーザー要望＝「急に選択肢が出て意味が分からない」の段4）。
 *
 * 🔑**ログの行から判定する**＝アーツ・スペル・【出】【自】【起】・ライフバーストの開始は経路ごとに
 *   ログを書く場所が違う（`stackResolve.ts` / CPU の `cpuTurn` 系 / カットイン / 起動モーダル …）。
 *   告知を経路ごとに書き足すと漏れるので、**全経路が必ず書いているログ**を見る（手札増減ログと同じ考え方）。
 * 🔴**相手の行だけ**＝自分の操作は自分で分かっている。判定は**視点を入れ替えた後の文面**で行う
 *   （CPU 戦では CPU の行もホスト＝自分が書くので、書き手の id では決められない）。
 */
import type { GameLog } from '../../types';
import { logTextFor } from './logPerspective';

/** 効果の開始を表す文型（ログの文言が契約＝golden が各文型を検査する）。 */
const EFFECT_START = /の【(?:出|自|起|常)】(?:\/【自】)?(?:効果|能力)|【ライフバースト】|ライフバースト発動|を使用(?!でき|し|す|さ|済)|スペルを発動|【起】を発動/;

/**
 * そのログ行が「相手の効果が始まった」行なら、告知に出す文面を返す（違えば null）。
 * 文面は行頭の `[相手]` / `[CPU]` を外し「相手：」を付けたもの。
 */
export function opponentEffectAnnouncement(log: Pick<GameLog, 'user_id' | 'action'>, viewerId: string): string | null {
  const text = logTextFor(log, viewerId);
  const tagged = /^\[(相手|CPU)\]\s*/.exec(text);
  const mine = /^\[(あなた|自分)\]/.test(text);
  if (mine) return null;
  if (!tagged && log.user_id === viewerId) return null;
  const body = tagged ? text.slice(tagged[0].length) : text;
  if (!EFFECT_START.test(body)) return null;
  // 「ライフバーストなし」は効果が始まっていない。
  if (/ライフバーストなし/.test(body)) return null;
  return `相手：${body}`;
}
