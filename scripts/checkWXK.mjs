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
for (const f of ['CardData_Sheet4.csv','CardData_Sheet1.csv','CardData_Variants.csv'])
  Object.assign(csv, loadCSV(path.join(root, 'public/data', f)));

const effects = JSON.parse(fs.readFileSync(path.join(root, 'public/data/effects_WXK.json'), 'utf8'));

function flatActions(a) {
  if (!a) return [];
  if (a.type === 'SEQUENCE') return (a.steps||[]).flatMap(flatActions);
  if (a.type === 'CONDITIONAL') return [...flatActions(a.then), ...flatActions(a.else)];
  if (a.type === 'CHOOSE') return (a.choices||[]).flatMap(c => flatActions(c.action));
  return [a];
}

// 1. 「以下の○つから選ぶ」があるのにCHOOSE/STUBなし
const chooseIssues = [];
for (const [cardId, efList] of Object.entries(effects)) {
  const c = csv[cardId];
  if (!c) continue;
  if (!/以下の[０-９\d]+つから/.test(c.eff)) continue;
  const acts = efList.flatMap(ef => flatActions(ef.action));
  if (!acts.some(a => a.type === 'CHOOSE' || a.type === 'STUB')) {
    chooseIssues.push({ cardId, name: c.name, eff: c.eff.substring(0, 160) });
  }
}
console.log('\nCHOOSE欠落:', chooseIssues.length, '件');
chooseIssues.forEach(i => console.log(' ', i.cardId, i.name, '\n   ', i.eff));

// 2. 「対戦相手のシグニ」があるのにopponent対象が一切ない
const ownerIssues = [];
for (const [cardId, efList] of Object.entries(effects)) {
  const c = csv[cardId];
  if (!c || !/対戦相手のシグニ/.test(c.eff + c.burst)) continue;
  const acts = efList.flatMap(ef => flatActions(ef.action));
  const owners = new Set(acts.map(a => a.target?.owner || a.source?.owner).filter(Boolean));
  if (!owners.has('opponent') && !acts.some(a => a.type === 'STUB')) {
    ownerIssues.push({ cardId, name: c.name, eff: (c.eff + ' [BURST:' + c.burst + ']').substring(0, 160) });
  }
}
console.log('\nOWNER疑い:', ownerIssues.length, '件');
ownerIssues.forEach(i => console.log(' ', i.cardId, i.name, '\n   ', i.eff));

// 3. 複数の独立効果があるのにSEQUENCEでない / steps数が効果数と大幅に乖離
// 「さらに」「その後」「加えて」などのキーワードがあるのに1アクションしかない
const seqIssues = [];
for (const [cardId, efList] of Object.entries(effects)) {
  const c = csv[cardId];
  if (!c) continue;
  for (const ef of efList) {
    const text = c.eff + ' ' + c.burst;
    // 「その後」「さらに」「加えて」「に加え」のキーワードが3回以上
    const multiMarkers = (text.match(/その後|さらに|加えて|に加え/g) || []).length;
    if (multiMarkers < 2) continue;
    const acts = flatActions(ef.action);
    if (acts.length <= 1 && !acts.some(a => a.type === 'STUB')) {
      seqIssues.push({ cardId, name: c.name, markers: multiMarkers, eff: c.eff.substring(0, 160) });
      break;
    }
  }
}
console.log('\nSEQUENCE疑い(多重マーカーなのに1アクション):', seqIssues.length, '件');
seqIssues.forEach(i => console.log(' ', i.cardId, i.name, '(markers:', i.markers, ')\n   ', i.eff));

// 4. バースト効果テキストがあるのにburst triggerがない
const burstIssues = [];
for (const [cardId, efList] of Object.entries(effects)) {
  const c = csv[cardId];
  if (!c || !c.burst || c.burst.trim() === '') continue;
  const hasBurst = efList.some(ef => ef.trigger === 'burst' || ef.trigger === 'BURST');
  if (!hasBurst) {
    burstIssues.push({ cardId, name: c.name, burst: c.burst.substring(0, 120) });
  }
}
console.log('\nBURST未実装(bursts欄があるのにtrigger=burstなし):', burstIssues.length, '件');
burstIssues.slice(0, 20).forEach(i => console.log(' ', i.cardId, i.name, '\n   ', i.burst));
if (burstIssues.length > 20) console.log('  ... and', burstIssues.length - 20, 'more');

// 5. 「バニッシュ」テキストがあるのにBANISH/STUBアクションがない
const banishIssues = [];
for (const [cardId, efList] of Object.entries(effects)) {
  const c = csv[cardId];
  if (!c) continue;
  const text = c.eff + ' ' + c.burst;
  if (!/バニッシュ/.test(text)) continue;
  const acts = efList.flatMap(ef => flatActions(ef.action));
  if (!acts.some(a => a.type === 'BANISH' || a.type === 'STUB')) {
    banishIssues.push({ cardId, name: c.name, eff: c.eff.substring(0, 120) });
  }
}
console.log('\nBANISH欠落:', banishIssues.length, '件');
banishIssues.slice(0, 15).forEach(i => console.log(' ', i.cardId, i.name, '\n   ', i.eff));
if (banishIssues.length > 15) console.log('  ... and', banishIssues.length - 15, 'more');

// 6. STUB_LOG ではないSTUBの数
let stubCount = 0;
for (const efList of Object.values(effects)) {
  const acts = efList.flatMap(ef => flatActions(ef.action));
  stubCount += acts.filter(a => a.type === 'STUB').length;
}
console.log('\nSTUB総数:', stubCount);
