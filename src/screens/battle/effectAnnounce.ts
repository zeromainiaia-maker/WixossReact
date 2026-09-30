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

/**
 * 効果の開始を表す文型（ログの文言が契約＝golden が各文型を検査する）。
 * 🆕2026-10-01（ユーザー要望）＝**告知の文面を「相手が《X》を使用」の形に統一する**＝ログは経路ごとに
 *   書き方が違う（「アーツを使用: X」「X を使用（コストを支払う）」「X の【自】効果」…）ので、
 *   ここで**カード名と種類だけを取り出して組み立て直す**。上から順に当てる（先に当たったものが勝つ）。
 *   ⚠アーツ・スペルは「使用」、能力は「〇〇を発動」（【自】を「使用」とは言わないため）。
 */
const RULES: { re: RegExp; fmt: (name: string, m: RegExpExecArray) => string }[] = [
  // `[CPU] アーツを使用: X` ／ `[CPU] スペルを発動: X`
  { re: /^(?:アーツ|スペル)を(?:使用|発動): (.+)$/, fmt: n => `《${n}》を使用` },
  // `[CPU] 【起】を発動: X` ／ `[CPU] ルリグの【起】を発動: X`（ゾーン名つきも）
  { re: /^(?:\S+の)?【起】を発動: (.+)$/, fmt: n => `《${n}》の【起】を発動` },
  // `[CPU] ライフクロスをオープン: X（ライフバースト発動）`
  { re: /^ライフクロスをオープン: (.+?)（ライフバースト発動）/, fmt: n => `《${n}》のライフバーストを発動` },
  // `X の【ライフバースト】（付与）`
  { re: /^(.+?) ?の【ライフバースト】/, fmt: n => `《${n}》のライフバーストを発動` },
  // `X の【自】効果` ／ `X の【出】/【自】効果` ／ `X の【起】効果（相手シグニのアタックに応答）` 等
  { re: /^(.+?) ?の(【(?:出|自|起|常)】)(?:\/【自】)?(?:効果|能力)/, fmt: (n, m) => `《${n}》の${m[2]}を発動` },
  // `X を使用（コストを支払う）` ／ `[カットイン] Xを使用` ／ `X を使用（カットイン）`
  { re: /^(?:\[カットイン\] ?)?(.+?) ?を使用(?!でき|し|す|さ|済)/, fmt: n => `《${n}》を使用` },
];

/**
 * そのログ行が「相手の効果が始まった」行なら、告知に出す文面（例「相手が《母性本能》を使用」）を返す（違えば null）。
 */
export function opponentEffectAnnouncement(log: Pick<GameLog, 'user_id' | 'action'>, viewerId: string): string | null {
  const text = logTextFor(log, viewerId);
  const tagged = /^\[(相手|CPU)\]\s*/.exec(text);
  const mine = /^\[(あなた|自分)\]/.test(text);
  if (mine) return null;
  if (!tagged && log.user_id === viewerId) return null;
  const body = (tagged ? text.slice(tagged[0].length) : text).trim();
  // 🔴否定の説明文（engine の「Xの【出】能力は発動しない（抑止効果）」等）は開始ではない。
  if (/発動しない|使用できない|使用しない/.test(body)) return null;
  for (const r of RULES) {
    const m = r.re.exec(body);
    if (!m) continue;
    const name = m[1].trim();
    // 🔴`[CPU] アーツを使用`（名前なし＝次の行に `アーツを使用: X` が来る）を「《アーツ》」にしない。
    if (!name || name === 'アーツ' || name === 'スペル') return null;
    return `相手が${r.fmt(name, m)}`;
  }
  return null;
}
