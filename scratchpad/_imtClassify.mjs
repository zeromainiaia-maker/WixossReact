import fs from 'fs';
const ids = `PR-442 PR-K038 WD08-015 WDK04-011 WDK05-R14 WDK06-C07 WDK10-017 WDK16-13 WX05-013 WX06-018 WX09-Re19 WX11-041 WX12-Re10 WX13-037 WX13-057 WX14-021 WX14-069 WX14-072 WX15-106 WX19-040 WX20-053 WX20-075 WX21-016 WX21-023 WX21-059 WX22-006 WX22-Re06 WX24-P3-059 WX24-P3-075 WX24-P3-088 WX25-CP1-054 WX26-CP1-058 WX26-CP1-092 WXDi-CP01-045 WXDi-CP02-063 WXDi-D09-H18 WXDi-P01-074 WXDi-P01-082 WXDi-P03-083 WXDi-P07-064 WXDi-P10-071 WXDi-P10-073 WXDi-P11-082 WXDi-P13-003A WXDi-P15-089 WXEX1-06 WXEX1-36 WXEX1-66 WXEX2-62 WXK01-001 WXK01-005 WXK01-106 WXK02-039 WXK02-063 WXK03-039 WXK06-031 WXK07-042 WXK08-033 WXK08-055 WXK09-091 WXK10-060 WXK10-085 WXK10-088 WXK11-065 WXK11-070`.split(/\s+/);
const idset = new Set(ids);
const csvFiles = fs.readdirSync('public/data').filter(f => f.startsWith('CardData_') && f.endsWith('.csv'));
const texts = new Map();
for (const f of csvFiles) {
  for (const line of fs.readFileSync('public/data/' + f, 'utf8').split('\n')) {
    const cols = line.split(',');
    if (idset.has(cols[0])) texts.set(cols[0], cols.slice(18).join(',').replace(/\r/g,''));
  }
}
// extract the 場合 condition clause(s) from each text
for (const id of ids) {
  const t = texts.get(id) || '';
  // split into sentences and find ones containing 場合
  const clauses = t.split(/(?<=。)/).filter(s => /場合/.test(s));
  const short = clauses.map(c => {
    // extract the 〜場合 clause
    const m = c.match(/([^。、]*?場合)/);
    return m ? m[1] : c.slice(0,50);
  });
  console.log(id.padEnd(14) + ' | ' + short.join('  ///  ').slice(0,140));
}
