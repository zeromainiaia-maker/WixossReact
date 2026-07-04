// 一時調査: 「次に(あなたが)(シグニ/ルリグによって)ダメージを受ける場合」46枚の全数分類
// A: PREVENT_NEXT_DAMAGE あり（damageSource 適合）＝正エンコード済み（census偽陽性）
// A2: PREVENT_NEXT_DAMAGE あり・damageSource 欠落（原文はシグニ/ルリグ限定）
// B: PREVENT_NEXT_DAMAGE なし＝脱落/別形疑い
import fs from 'fs';
import Papa from 'papaparse';

const T554 = 'WDK08-L06 WX24-P1-010 WX24-P3-038 WX25-P2-099 WX25-P3-053 WX26-CP1-097 WXDi-D07-007 WXDi-D08-010 WXDi-P00-022 WXDi-P01-025 WXDi-P01-031 WXDi-P03-020 WXDi-P07-030 WXDi-P11-036 WXDi-P12-043 WXDi-P15-041 WXK10-027'.split(' ');
const T555 = 'WX24-P1-008 WX24-P1-073 WX24-P3-081 WX25-CP1-077 WX25-P1-008 WX25-P1-010 WX25-P1-090 WX25-P2-091 WX26-CP1-090 WXDi-CP02-083 WXDi-P05-071 WXDi-P07-079 WXDi-P09-074 WXDi-P10-065 WXDi-P11-073 WXDi-P12-077 WXDi-P13-077'.split(' ');
const T557 = 'WX24-P3-084 WX25-CP1-073 WX25-P1-008 WX25-P2-094 WX25-P3-095 WX25-P3-113 WX26-CP1-089 WXDi-CP02-088 WXDi-P10-068 WXDi-P11-074 WXDi-P13-080 WXDi-P16-079'.split(' ');
const IDS = [...new Set([...T554, ...T555, ...T557])];

const cards = {};
for (const s of fs.readdirSync('public/data').filter(f => /^CardData_Sheet\d+\.csv$/.test(f))) {
  const { data } = Papa.parse(fs.readFileSync(`public/data/${s}`, 'utf8'), { header: true });
  for (const row of data) {
    const id = (row['CardNum'] ?? '').trim();
    if (IDS.includes(id)) cards[id] = row;
  }
}
const effFiles = ['effects_WX.json', 'effects_WXDi.json', 'effects_WX24_26.json', 'effects_WXK.json', 'effects_misc.json'];
const effsByCard = {};
for (const f of effFiles) {
  const j = JSON.parse(fs.readFileSync(`public/data/${f}`, 'utf8'));
  for (const [k, v] of Object.entries(j)) if (IDS.includes(k)) effsByCard[k] = v;
}

const buckets = {};
for (const id of IDS) {
  const c = cards[id];
  const text = ((c?.EffectText ?? '') + '／' + (c?.BurstText ?? '')).replace(/\s+/g, '');
  const js = JSON.stringify(effsByCard[id] ?? []);
  // 原文の該当節を全部抜く
  const clauses = [...text.matchAll(/このターン、次にあなたが((?:シグニ|ルリグ)によって)?ダメージを受ける場合、([^。／]*)/g)];
  const needSigni = clauses.some(m => m[1] === 'シグニによって');
  const needLrig = clauses.some(m => m[1] === 'ルリグによって');
  const hasPND = js.includes('"PREVENT_NEXT_DAMAGE"');
  const hasSigniSrc = js.includes('"damageSource":"signi"');
  const hasLrigSrc = js.includes('"damageSource":"lrig"');
  let cls;
  if (!hasPND) cls = 'B:PND無し';
  else if ((needSigni && !hasSigniSrc) || (needLrig && !hasLrigSrc)) cls = 'A2:source欠落';
  else cls = 'A:正エンコード済';
  (buckets[cls] ??= []).push(id);
  const clauseStr = clauses.map(m => (m[1] ?? '') + 'ダメ→' + m[2].slice(0, 25)).join('｜') || '(節抽出失敗)';
  console.log(`${cls}\t${id}\t${clauseStr}`);
}
console.log('\n==== 集計 ====');
for (const [k, v] of Object.entries(buckets)) console.log(`${k}: ${v.length}枚\n  ${v.join(' ')}`);
