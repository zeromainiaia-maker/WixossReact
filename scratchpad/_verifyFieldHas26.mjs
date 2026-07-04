import fs from 'fs';
const IDS = 'SPDi43-06 SPDi43-08 SPDi43-09 SPDi43-32 WDK06-R01 WX24-P1-042 WX24-P1-044 WX24-P1-046 WX24-P2-047 WX24-P2-054 WX24-P3-047 WX24-P3-052 WX25-CD1-17 WX25-P1-056 WX25-P2-054 WX25-P2-056 WX25-P2-060 WX25-P2-063 WX25-P3-056 WX25-P3-058 WXDi-P12-047 WXDi-P12-050 WXDi-P12-054 WXDi-P13-055 WXDi-P15-048 WXDi-P16-051'.split(' ');
const csvFiles = fs.readdirSync('public/data').filter(f => f.startsWith('CardData_') && f.endsWith('.csv'));
const texts = new Map();
for (const f of csvFiles) for (const line of fs.readFileSync('public/data/' + f, 'utf8').split('\n')) {
  const cols = line.split(','); if (IDS.includes(cols[0])) texts.set(cols[0], cols.slice(18).join(',').replace(/（[^）]*）/g, ''));
}
let ok = 0, bad = 0;
for (const id of IDS) {
  const t = texts.get(id) || '';
  const m = t.match(/あなたの場に《([^》]+)》がいる場合/);
  if (m) { ok++; }
  else { bad++; console.log('!! NO CLAUSE: ' + id + ' | ' + t.slice(0, 120)); }
}
console.log(`\n該当句あり: ${ok} / 無し: ${bad} / 全: ${IDS.length}`);
