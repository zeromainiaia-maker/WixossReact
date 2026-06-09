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
for (const f of ['CardData_Sheet9.csv','CardData_Sheet10.csv','CardData_Variants.csv'])
  Object.assign(csv, loadCSV(path.join(root, 'public/data', f)));

const effects = JSON.parse(fs.readFileSync(path.join(root, 'public/data/effects_WX24_26.json'), 'utf8'));

function flatActions(a) {
  if (!a) return [];
  if (a.type === 'SEQUENCE') return (a.steps||[]).flatMap(flatActions);
  if (a.type === 'CONDITIONAL') return [...flatActions(a.then), ...flatActions(a.else)];
  if (a.type === 'CHOOSE') return (a.choices||[]).flatMap(c => flatActions(c.action));
  return [a];
}

// --- CHOOSE欠落チェック ---
const chooseIssues = [];
for (const [cardId, efList] of Object.entries(effects)) {
  const c = csv[cardId];
  if (!c) continue;
  if (!/以下の[０-９\d]+つから/.test(c.eff) && !/以下の[０-９\d]+つから/.test(c.burst)) continue;
  const acts = efList.flatMap(ef => flatActions(ef.action));
  if (!acts.some(a => a.type === 'CHOOSE' || a.type === 'STUB')) {
    const textSnippet = (c.eff + c.burst).substring(0, 200);
    chooseIssues.push({ cardId, name: c.name, eff: textSnippet });
  }
}
console.log('\n=== CHOOSE欠落: ' + chooseIssues.length + ' 件 ===');
chooseIssues.forEach(i => {
  console.log('  ' + i.cardId + ' ' + i.name);
  console.log('    ' + i.eff);
});

// --- ownerの間違いチェック ---
const ownerIssues = [];
for (const [cardId, efList] of Object.entries(effects)) {
  const c = csv[cardId];
  if (!c) continue;
  const fullText = c.eff + c.burst;
  if (!/対戦相手のシグニ/.test(fullText)) continue;
  const acts = efList.flatMap(ef => flatActions(ef.action));
  const owners = new Set(acts.map(a => a.target?.owner || a.source?.owner).filter(Boolean));
  if (!owners.has('opponent') && !acts.some(a => a.type === 'STUB')) {
    ownerIssues.push({ cardId, name: c.name, eff: fullText.substring(0, 120) });
  }
}
console.log('\n=== OWNER疑い: ' + ownerIssues.length + ' 件 ===');
ownerIssues.forEach(i => {
  console.log('  ' + i.cardId + ' ' + i.name);
  console.log('    ' + i.eff.substring(0, 100));
});

// --- 詳細調査: CHOOSEパターンのあるカードの全リスト ---
console.log('\n=== CHOOSEパターンのあるカード全リスト (JSON内) ===');
for (const [cardId, efList] of Object.entries(effects)) {
  const acts = efList.flatMap(ef => flatActions(ef.action));
  if (acts.some(a => a.type === 'CHOOSE')) {
    console.log('  CHOOSE OK: ' + cardId);
  }
}

// --- CHOOSE欠落の詳細（全テキスト確認用） ---
console.log('\n=== CHOOSE欠落カードの詳細 ===');
chooseIssues.forEach(i => {
  const c = csv[i.cardId];
  console.log('\n[' + i.cardId + '] ' + i.name);
  console.log('EffectText: ' + c.eff);
  if (c.burst) console.log('BurstText: ' + c.burst);
  const efList = effects[i.cardId];
  console.log('JSON: ' + JSON.stringify(efList, null, 2));
});
