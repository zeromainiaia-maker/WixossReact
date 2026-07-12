import fs from 'fs';

const files = fs.readdirSync('docs').filter(f => /^decompile_sheet\d+\.txt$/.test(f));
let all = '';
for (const f of files) all += fs.readFileSync('docs/' + f, 'utf8');
const blocks = all.split('==============================================================================\n');

const leakRe = /\[STUB:[^\]]*\]|\[アクション:[^\]]*\]|\[条件:[^\]]*\]|\[未実装\/UNKNOWN[^\]]*\]/g;

const cardsWithLeak = [];
const tagCounts = new Map(); // normalized tag -> count
const tagCards = new Map(); // normalized tag -> card list

for (const b of blocks) {
  const headerMatch = b.match(/^([A-Za-z0-9-]+)\s{2,}/);
  if (!headerMatch) continue;
  const cardNum = headerMatch[1];
  const jsonSection = b.split('【JSON 逆翻訳】')[1] ?? '';
  const matches = jsonSection.match(leakRe);
  if (!matches || matches.length === 0) continue;
  cardsWithLeak.push(cardNum);
  for (const m of matches) {
    // normalize: strip STUB id extra params, keep the id/type name only
    let tag = m;
    const stubM = m.match(/^\[STUB:([A-Za-z0-9_]+)/);
    const actM = m.match(/^\[アクション:([A-Za-z0-9_]+)/);
    const condM = m.match(/^\[条件:([A-Za-z0-9_]+)/);
    if (stubM) tag = 'STUB:' + stubM[1];
    else if (actM) tag = 'アクション:' + actM[1];
    else if (condM) tag = '条件:' + condM[1];
    else if (m.startsWith('[未実装')) tag = '未実装/UNKNOWN';
    tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
    if (!tagCards.has(tag)) tagCards.set(tag, new Set());
    tagCards.get(tag).add(cardNum);
  }
}

console.log('総カード数（少なくとも1つの英語タグ漏れを含む）:', new Set(cardsWithLeak).size);
console.log('総タグ出現数:', [...tagCounts.values()].reduce((a, b) => a + b, 0));
console.log('distinct タグ種別:', tagCounts.size);
console.log();
const sorted = [...tagCounts.entries()].sort((a, b) => b[1] - a[1]);
for (const [tag, count] of sorted) {
  const cards = [...tagCards.get(tag)];
  console.log(`${count}\t${tag}\t例: ${cards.slice(0, 3).join(', ')}`);
}
