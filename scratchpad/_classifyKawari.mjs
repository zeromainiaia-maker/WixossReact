import fs from 'fs';
const IDS = 'SP27-012 WD06-009 WD08-006 WD10-018 WDK03-006 WDK16-06S WDK16-06T WDK17-014 WX01-027 WX05-018 WX06-002 WX06-003 WX06-004 WX06-005 WX06-006 WX07-027 WX07-078 WX08-042 WX09-021 WX09-022 WX09-045 WX09-Re01 WX11-011 WX11-012 WX13-031 WX14-070 WX16-001 WX16-021 WX16-058 WX19-078 WX20-043 WX20-055 WX20-065 WX20-076 WX21-005 WX21-039 WX21-044 WX24-D1-19 WX24-D3-15 WX24-D3-19 WX24-D5-15 WX24-P1-060 WX24-P3-043 WX24-P4-009 WX24-P4-042 WX24-P4-061 WX24-P4-068 WX25-P1-078 WX25-P1-108 WX25-P2-068 WX25-P2-070 WX25-P2-071 WX25-P2-078 WX25-P2-088 WX25-P2-098 WX25-P2-101 WX25-P2-102 WX25-P2-107 WX25-P2-108 WX25-P2-109 WX25-P3-038 WX25-P3-073 WX25-P3-076 WX25-P3-116 WX26-CP1-005 WX26-CP1-009 WX26-CP1-093 WXDi-CP01-023 WXDi-CP01-026 WXDi-CP01-032 WXDi-CP01-043 WXDi-CP01-047 WXDi-CP01-051 WXDi-CP02-062 WXDi-CP02-066 WXDi-CP02-071 WXDi-CP02-102 WXDi-D01-016 WXDi-D04-016 WXDi-P00-073 WXDi-P01-054 WXDi-P02-005 WXDi-P03-088 WXDi-P05-076 WXDi-P07-002 WXDi-P07-023 WXDi-P10-069 WXDi-P11-067 WXDi-P12-067 WXDi-P12-081 WXDi-P13-004A WXDi-P13-005 WXDi-P14-025 WXDi-P14-053 WXDi-P15-044 WXDi-P16-063 WXEX2-28 WXEX2-60 WXEX2-75 WXK02-037 WXK02-052 WXK03-032-CB WXK03-041-CB WXK04-068 WXK06-027 WXK06-048 WXK06-071 WXK07-028 WXK08-035 WXK08-049 WXK08-057 WXK09-051 WXK09-057 WXK09-066 WXK09-068 WXK09-081 WXK10-035 WXK11-005 WXK11-019 WXK11-032 WXK11-075'.split(' ');
const csvFiles = fs.readdirSync('public/data').filter(f => f.startsWith('CardData_') && f.endsWith('.csv'));
const texts = new Map();
for (const f of csvFiles) for (const line of fs.readFileSync('public/data/' + f, 'utf8').split('\n')) {
  const c = line.split(','); if (IDS.includes(c[0])) texts.set(c[0], c.slice(18).join(',').replace(/（[^）]*）/g, ''));
}
const cats = { A_ena2trash: [], B_cond_repl: [], C_cost_sub: [], D_no_banish: [], E_other: [] };
const clause = new Map();
for (const id of IDS) {
  const t = texts.get(id) || '';
  const s = t.split('。').find(x => /代わりに|代わり,/.test(x)) || '';
  clause.set(id, s.slice(Math.max(0, s.indexOf('代わり') - 30)).slice(0, 90));
  if (/エナゾーンに置かれる代わりにトラッシュに置かれる/.test(t)) cats.A_ena2trash.push(id);
  else if (/(を支払う際|コストに含まれる|を支払わないかぎり).*代わりに|代わりに.*(捨てても|トラッシュに置いても)/.test(t)) cats.C_cost_sub.push(id);
  else if (/代わりにバニッシュされ(ず|ない)/.test(t)) cats.D_no_banish.push(id);
  else if (/(場合|かぎり|とき)、代わりに/.test(t)) cats.B_cond_repl.push(id);
  else cats.E_other.push(id);
}
for (const [k, v] of Object.entries(cats)) {
  console.log(`\n### ${k}  [${v.length}枚]`);
  console.log(v.join(' '));
}
console.log('\n\n===== 各カテゴリ 代表3枚の節 =====');
for (const [k, v] of Object.entries(cats)) {
  console.log(`\n--- ${k} ---`);
  for (const id of v.slice(0, 4)) console.log(`  ${id}: ${clause.get(id)}`);
}
