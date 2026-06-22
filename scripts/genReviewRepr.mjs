/**
 * genReviewRepr.mjs
 * docs/decompile_sheet*.txt を groupSimilar と同じロジックで正規化グループ化し、
 * 各グループの「代表1枚（先頭カード）」の原文と逆翻訳だけを並べた要約を出力する。
 *
 * groupSimilar.mjs（grouped_all.txt）はグループ内全カードを列挙するのに対し、
 * 本スクリプトは代表1枚のみを示す軽量レビュー用ビュー。
 *
 * 出力: docs/_review_repr.txt
 * 使い方: node scripts/genReviewRepr.mjs
 */
import { readFileSync, writeFileSync, readdirSync } from 'fs';
import { join } from 'path';

const outPath = process.argv[2] ?? 'docs/_review_repr.txt';
const text = readdirSync('docs').filter(f => /^decompile_sheet\d+\.txt$/.test(f))
  .map(f => readFileSync(join('docs', f), 'utf-8')).join('\n');

const CARD_NUM_RE = /[A-Z][A-Za-z0-9]*(?:-[A-Za-z0-9]+)+/g;

function norm(s) {
  return s
    .replace(CARD_NUM_RE, '<CARD>')
    .replace(/《[^》]*》/g, '《X》')
    .replace(/＜[^＞]*＞/g, '＜X＞')
    .replace(/[0-9０-９]+/g, 'N')
    .replace(/\s+/g, ' ')
    .trim();
}

function normDec(s) {
  return norm(
    s.replace(CARD_NUM_RE, '')
     .replace(/〈[^〉]*〉/g, '')
     .replace(/【[^】]*】/g, '')
     .replace(/（[^）]*）/g, '')
     .replace(/[／\/]?[A-Z][A-Z_]+/g, '')
  );
}

const blocks = text.split(/^={10,}\s*$/m).map(b => b.trim()).filter(Boolean);
const cards = [];
for (const b of blocks) {
  const header = b.match(/^([A-Z0-9][A-Za-z0-9-]*)\s+(\S.*?)\s+\[/m);
  if (!header) continue;
  const origM = b.match(/【原文 EffectText】([\s\S]*?)【JSON 逆翻訳】/);
  const decM = b.match(/【JSON 逆翻訳】([\s\S]*?)$/);
  const orig = (origM?.[1] ?? '').replace(/【原文 BurstText】/g, ' ').trim();
  const decomp = (decM?.[1] ?? '').trim();
  if (!orig || orig === '-') continue;
  cards.push({ num: header[1], name: header[2], orig, decomp });
}

const groups = new Map();
for (const c of cards) {
  const key = norm(c.orig);
  if (!groups.has(key)) groups.set(key, { key, cards: [] });
  groups.get(key).cards.push(c);
}

const multi = [...groups.values()].filter(g => g.cards.length >= 2);
for (const g of multi) {
  g.decPatternCount = new Set(g.cards.map(c => normDec(c.decomp))).size;
  g.flagged = g.decPatternCount >= 2;
}
multi.sort((a, b) => (Number(b.flagged) - Number(a.flagged)) || (b.cards.length - a.cards.length));

const lines = [];
let gid = 0;
for (const g of multi) {
  gid++;
  const rep = g.cards[0];
  lines.push(`【G${String(gid).padStart(3, '0')}  カード${g.cards.length}枚 / 逆翻訳${g.decPatternCount}型】`);
  lines.push(`  テンプレ: ${g.key}`);
  lines.push(`  代表 ${rep.num} ${rep.name}`);
  lines.push(`  原文  : ${rep.orig.replace(/\s+/g, ' ')}`);
  lines.push(`  逆翻訳: ${rep.decomp.replace(/\s+/g, ' ')}`);
  lines.push('');
}

writeFileSync(outPath, lines.join('\n'), 'utf-8');
console.log(`出力: ${outPath} （${multi.length}グループ / 代表のみ）`);
