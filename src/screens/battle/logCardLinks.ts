import type { CardData } from '../../types';

/**
 * 🆕**対戦ログの行からカード名を見つけて区切る**（2026-10-22 ユーザー要望＝「ログで使用・発動したカードを色文字にして、そこから拡大カードを出す」）。
 *
 * 🔑**名前はその対戦に出てくるカード（`battleCards`）だけから当てる**＝ログの文型ごとに正規表現を書かない
 *   （文型は engine・controller・CPU で数十あり、1つ増えるたびに拾い漏れる）。
 * ⚠**長い名前から当てる**＝《羅原　Ｎｅ》と《羅原姫　Ｎｅ》のように片方がもう片方を含む名前があるので、
 *   短い名前を先に当てると長い名前の途中で切れる。
 * ⚠**1文字の名前は当てない**＝「X」「Ｕ」のような名前が普通の語の中で当たるのを避ける。
 * ⚠ログに名前が出る時点で相手にも見えている情報＝拡大して見せても新しく漏れるものは無い。
 */
export type LogSegment = { text: string; card?: CardData };

export interface LogCardMatcher {
  re: RegExp | null;
  byName: Map<string, CardData>;
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** 対戦のカードから照合器を作る（`useMemo` で1回だけ作る）。 */
export function buildLogCardMatcher(cards: CardData[]): LogCardMatcher {
  const byName = new Map<string, CardData>();
  for (const c of cards) {
    const name = c.CardName?.trim();
    if (!name || name.length < 2 || byName.has(name)) continue;
    byName.set(name, c);
  }
  const names = [...byName.keys()].sort((a, b) => b.length - a.length);
  return { re: names.length ? new RegExp(names.map(escapeRe).join('|'), 'g') : null, byName };
}

/** ログ1行をカード名とそれ以外に区切る（カード名の区間だけ `card` を持つ）。 */
export function splitLogByCardNames(text: string, m: LogCardMatcher): LogSegment[] {
  if (!m.re || !text) return [{ text }];
  const out: LogSegment[] = [];
  let last = 0;
  for (const hit of text.matchAll(m.re)) {
    const at = hit.index ?? 0;
    if (at > last) out.push({ text: text.slice(last, at) });
    out.push({ text: hit[0], card: m.byName.get(hit[0]) });
    last = at + hit[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last) });
  return out;
}
