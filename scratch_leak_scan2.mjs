import fs from 'fs';

const files = fs.readdirSync('docs').filter(f => /^decompile_sheet\d+\.txt$/.test(f));
let all = '';
for (const f of files) all += fs.readFileSync('docs/' + f, 'utf8');
const blocks = all.split('==============================================================================\n');

const leakRe = /\[STUB:[^\]]*\]|\[アクション:[^\]]*\]|\[条件:[^\]]*\]|\[未実装\/UNKNOWN[^\]]*\]/g;
const hasJapanese = (s) => /[぀-ヿ一-鿿]/.test(s);

const pureEnglishTags = new Map(); // id -> {count, cards:Set}
const softTags = new Map();
let pureCount = 0, softCount = 0;
const cardsWithPure = new Set();

for (const b of blocks) {
  const headerMatch = b.match(/^([A-Za-z0-9-]+)\s{2,}/);
  if (!headerMatch) continue;
  const cardNum = headerMatch[1];
  const jsonSection = b.split('【JSON 逆翻訳】')[1] ?? '';
  const matches = jsonSection.match(leakRe);
  if (!matches) continue;
  for (const m of matches) {
    const inner = m.slice(1, -1); // strip [ ]
    const isPure = !hasJapanese(inner);
    // normalize id for grouping
    let key = inner;
    const stubM = inner.match(/^STUB:([A-Za-z0-9_]+)/);
    const actM = inner.match(/^アクション:([A-Za-z0-9_]+)/);
    const condM = inner.match(/^条件:([A-Za-z0-9_]+)/);
    if (stubM) key = 'STUB:' + stubM[1];
    else if (actM) key = 'アクション:' + actM[1];
    else if (condM) key = '条件:' + condM[1];
    else if (inner.startsWith('未実装')) key = '未実装/UNKNOWN';
    const map = isPure ? pureEnglishTags : softTags;
    if (!map.has(key)) map.set(key, { count: 0, cards: new Set() });
    const e = map.get(key);
    e.count++; e.cards.add(cardNum);
    if (isPure) { pureCount++; cardsWithPure.add(cardNum); } else softCount++;
  }
}

console.log('=== 純粋な英語ID漏れ（日本語グロス無し） ===');
console.log('該当カード数:', cardsWithPure.size, ' タグ出現数:', pureCount, ' distinct id数:', pureEnglishTags.size);
console.log();
const sortedPure = [...pureEnglishTags.entries()].sort((a, b) => b[1].count - a[1].count);
for (const [key, e] of sortedPure) {
  console.log(`${e.count}\t${key}\tカード数${e.cards.size}\t例:${[...e.cards].slice(0, 4).join(',')}`);
}
console.log();
console.log('=== 参考：日本語グロス付きSTUB（[STUB:説明文]形式・668件・優先度低） ===');
console.log('タグ出現数:', softCount, ' distinct id数:', softTags.size);
