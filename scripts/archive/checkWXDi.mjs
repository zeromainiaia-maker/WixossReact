import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

function splitCSVLine(line) {
  const result = []; let cur = ''; let inQ = false;
  for (const c of line) {
    if (c === '"' && inQ) inQ = false;
    else if (c === '"') inQ = true;
    else if (c === ',' && !inQ) { result.push(cur); cur = ''; }
    else cur += c;
  }
  result.push(cur);
  return result;
}
function loadCSV(filepath) {
  const lines = fs.readFileSync(filepath, 'utf8').split('\n');
  const header = splitCSVLine(lines[0]);
  const idIdx = header.indexOf('CardNum'), nameIdx = header.indexOf('CardName');
  const effIdx = header.indexOf('EffectText'), burstIdx = header.indexOf('BurstText');
  const map = {};
  for (let i = 1; i < lines.length; i++) {
    const p = splitCSVLine(lines[i]);
    if (!p[idIdx]) continue;
    map[p[idIdx]] = { name: p[nameIdx]||'', eff: p[effIdx]||'', burst: p[burstIdx]||'' };
  }
  return map;
}

const csv = {};
for (const f of ['CardData_Sheet7.csv','CardData_Sheet8.csv','CardData_Variants.csv'])
  Object.assign(csv, loadCSV(path.join(root, 'public/data', f)));

const effects = JSON.parse(fs.readFileSync(path.join(root, 'public/data/effects_WXDi.json'), 'utf8'));

function flatActions(a) {
  if (!a) return [];
  if (a.type === 'SEQUENCE') return (a.steps||[]).flatMap(flatActions);
  if (a.type === 'CONDITIONAL') return [...flatActions(a.then), ...flatActions(a.else)];
  if (a.type === 'CHOOSE') return (a.choices||[]).flatMap(c => flatActions(c.action));
  return [a];
}

const chooseIssues = [];
for (const [cardId, efList] of Object.entries(effects)) {
  const c = csv[cardId];
  if (!c) continue;
  if (!/以下の[０-９\d]+つから/.test(c.eff)) continue;
  const acts = efList.flatMap(ef => flatActions(ef.action));
  if (!acts.some(a => a.type === 'CHOOSE' || a.type === 'STUB')) {
    chooseIssues.push({ cardId, name: c.name, eff: c.eff.substring(0, 200) });
  }
}
console.log('=== CHOOSE欠落:', chooseIssues.length, '件 ===');
chooseIssues.forEach(i => console.log(' ', i.cardId, i.name, '\n   ', i.eff));

const ownerIssues = [];
for (const [cardId, efList] of Object.entries(effects)) {
  const c = csv[cardId];
  if (!c || !/対戦相手のシグニ/.test(c.eff + c.burst)) continue;
  const acts = efList.flatMap(ef => flatActions(ef.action));
  const owners = new Set(acts.map(a => a.target?.owner || a.source?.owner).filter(Boolean));
  if (!owners.has('opponent') && !acts.some(a => a.type === 'STUB')) {
    ownerIssues.push({ cardId, name: c.name, eff: (c.eff + c.burst).substring(0, 150) });
  }
}
console.log('\n=== OWNER疑い:', ownerIssues.length, '件 ===');
ownerIssues.forEach(i => console.log(' ', i.cardId, i.name, '\n   ', i.eff));

// 追加調査：テキストに"対戦相手の"があるのに opponent が全くないカード（STUB除く）
const opponentGeneralIssues = [];
for (const [cardId, efList] of Object.entries(effects)) {
  const c = csv[cardId];
  if (!c) continue;
  const fullText = c.eff + c.burst;
  // 対戦相手が主語として出てくるパターン
  if (!/対戦相手(?:の手札|のデッキ|のエナゾーン|のトラッシュ|のシグニ|はカード|にダメージ)/.test(fullText)) continue;
  const acts = efList.flatMap(ef => flatActions(ef.action));
  const hasOpponent = acts.some(a => {
    if (a.type === 'STUB') return true;
    const checkObj = (o) => o && (o.owner === 'opponent' || o.player === 'opponent');
    return checkObj(a.target) || checkObj(a.source) || checkObj(a.from) || checkObj(a.to) ||
           a.player === 'opponent';
  });
  if (!hasOpponent) {
    opponentGeneralIssues.push({ cardId, name: c.name, eff: fullText.substring(0, 180) });
  }
}
console.log('\n=== 対戦相手テキストあり・opponent実装なし:', opponentGeneralIssues.length, '件 ===');
opponentGeneralIssues.forEach(i => console.log(' ', i.cardId, i.name, '\n   ', i.eff));
