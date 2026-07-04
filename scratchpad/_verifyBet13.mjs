import fs from 'fs';
const IDS = 'PR-387 WD18-007 WD18-008 WDK01-010 WDK07-Y08 WX15-006 WX15-021 WX17-005 WX17-006 WX17-010 WX17-023 WXDi-P15-071 WXK07-105'.split(' ');
const csvFiles = fs.readdirSync('public/data').filter(f => f.startsWith('CardData_') && f.endsWith('.csv'));
const texts = new Map();
for (const f of csvFiles) for (const line of fs.readFileSync('public/data/' + f, 'utf8').split('\n')) {
  const cols = line.split(','); if (IDS.includes(cols[0])) texts.set(cols[0], cols.slice(18).join(',').replace(/（[^）]*）/g, ''));
}
const fresh = JSON.parse(fs.readFileSync('docs/_held_fresh.json', 'utf8'));
let bad = 0;
for (const id of IDS) {
  const t = texts.get(id) || '';
  const hasClause = /あなたがベットしていた場合/.test(t);
  if (!hasClause) { bad++; console.log('!! NO CLAUSE: ' + id); continue; }
  // fresh JSON で IS_BETTING を含む CONDITIONAL の then が UNKNOWN でないか確認
  const j = JSON.stringify(fresh[id] || {});
  const unk = j.includes('"UNKNOWN"');
  const betCount = (j.match(/IS_BETTING/g) || []).length;
  console.log(`${id}: clause=${hasClause} IS_BETTING×${betCount} UNKNOWN=${unk}`);
  if (unk) console.log('   ⚠ ' + j.slice(0, 300));
}
console.log('\nclause無し: ' + bad);
