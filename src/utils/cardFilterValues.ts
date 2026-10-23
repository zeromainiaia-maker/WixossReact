/**
 * デッキ編成の絞り込み（タイプ・クラス）で、**「/」（全角「／」も）で区切られた値を1つずつの選択肢にする**（2026-10-23 ユーザー要望）。
 *
 * 🔴旧＝カードデータの値をそのまま並べていた＝「精像：悪魔/精械：電機」「シグニ/クラフト」が**それぞれ1つの選択肢**になり、
 *   クラスの欄が 218 種まで伸びていた（うち「/」入り 71 種）。しかもそれを選ぶと、その組み合わせのカードしか出なかった。
 * 🔑**後ろ側が頭を省いた形がある**＝「精武：アーム/ウェポン」は 精武：アーム と 精武：ウェポン。
 *   ⚠ただし頭を補うのは**補った形が他のカードに実在するときだけ**＝「奏械：バーチャル/世怜音女学院」の 世怜音女学院 は単独のクラス。
 */
import type { CardData } from '../types';

const SPLIT = /[/／]/;

/** 「：」を含む部分（＝頭つきの正式な形）の集合。頭を補ってよいかの判定に使う。 */
export function knownPrefixedClasses(cards: readonly CardData[]): Set<string> {
  const known = new Set<string>();
  for (const c of cards) for (const p of (c.CardClass ?? '').split(SPLIT)) if (p.includes('：')) known.add(p.trim());
  return known;
}

/** カードのクラスを1つずつに分ける。 */
export function splitCardClasses(raw: string | undefined, known: ReadonlySet<string>): string[] {
  let prefix = '';
  const out: string[] = [];
  for (const part of (raw ?? '').split(SPLIT).map(s => s.trim()).filter(Boolean)) {
    const m = /^(.+?)：/.exec(part);
    if (m) { prefix = m[1]; out.push(part); continue; }
    const withPrefix = prefix ? `${prefix}：${part}` : '';
    out.push(withPrefix && known.has(withPrefix) ? withPrefix : part);
  }
  return [...new Set(out)];
}

/** カードのタイプを1つずつに分ける（「シグニ/クラフト」→ シグニ・クラフト）。 */
export function splitCardTypes(raw: string | undefined): string[] {
  return [...new Set((raw ?? '').split(SPLIT).map(s => s.trim()).filter(Boolean))];
}
