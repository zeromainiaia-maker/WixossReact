import fs from 'fs';
const IDS = 'SP27-012 WD06-009 WD08-006 WD10-018 WDK03-006 WDK16-06S WDK16-06T WDK17-014 WX06-002 WX06-003 WX06-004 WX06-005 WX06-006 WX07-078 WX09-021 WX09-045 WX09-Re01 WX11-011 WX14-070 WX16-021 WX16-058 WX20-043 WX20-055 WX20-065 WX20-076 WX21-039 WX24-D1-19 WX24-D3-15 WX24-D3-19 WX24-D5-15 WX24-P1-060 WX24-P3-043 WX24-P4-061 WX24-P4-068 WX25-P1-078 WX25-P1-108 WX25-P2-068 WX25-P2-070 WX25-P2-071 WX25-P2-078 WX25-P2-088 WX25-P2-098 WX25-P2-101 WX25-P2-102 WX25-P2-107 WX25-P2-108 WX25-P2-109 WX25-P3-038 WX25-P3-073 WX25-P3-076 WX25-P3-116 WX26-CP1-093 WXDi-CP01-026 WXDi-CP01-032 WXDi-CP01-043 WXDi-CP01-047 WXDi-CP01-051 WXDi-CP02-062 WXDi-D01-016 WXDi-P00-073 WXDi-P01-054 WXDi-P02-005 WXDi-P03-088 WXDi-P05-076 WXDi-P07-002 WXDi-P07-023 WXDi-P10-069 WXDi-P11-067 WXDi-P12-067 WXDi-P12-081 WXDi-P13-004A WXDi-P13-005 WXDi-P14-025 WXEX2-28 WXEX2-60 WXK02-037 WXK02-052 WXK03-032-CB WXK03-041-CB WXK06-027 WXK06-071 WXK07-028 WXK08-035 WXK08-049 WXK08-057 WXK09-051 WXK09-057 WXK09-066 WXK09-068 WXK09-081 WXK10-035 WXK11-005 WXK11-019 WXK11-075'.split(' ');
const csvFiles = fs.readdirSync('public/data').filter(f => f.startsWith('CardData_') && f.endsWith('.csv'));
const texts = new Map();
for (const f of csvFiles) for (const line of fs.readFileSync('public/data/' + f, 'utf8').split('\n')) {
  const c = line.split(','); if (IDS.includes(c[0])) texts.set(c[0], c.slice(18).join(',').replace(/（[^）]*）/g, ''));
}
const effFiles = fs.readdirSync('public/data').filter(f => f.startsWith('effects_') && f.endsWith('.json'));
const all = {};
for (const f of effFiles) Object.assign(all, JSON.parse(fs.readFileSync('public/data/' + f, 'utf8')));

// サブパターン分類
const sub = { charm_per_target: [], threshold_multi: [], has_else: [], has_stub: [], other: [] };
for (const id of IDS) {
  const t = texts.get(id) || '';
  const j = JSON.stringify(all[id] || {});
  const kw = t.split('。').find(x => /代わりに/.test(x)) || '';
  const hasElse = j.includes('"else"');
  const hasStub = j.includes('"STUB"') || j.includes('"UNKNOWN"');
  if (/それに【チャーム】が付いている場合、代わりに/.test(t)) sub.charm_per_target.push(id);
  else if (hasElse) sub.has_else.push(id);
  else if (hasStub) sub.has_stub.push(id);
  else sub.other.push(id);
}
for (const [k, v] of Object.entries(sub)) {
  console.log(`\n### ${k} [${v.length}]`);
  console.log(v.join(' '));
}
