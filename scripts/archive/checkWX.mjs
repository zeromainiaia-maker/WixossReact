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
  if (!fs.existsSync(filepath)) return {};
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
for (const f of ['CardData_Sheet1.csv','CardData_Sheet2.csv','CardData_Variants.csv'])
  Object.assign(csv, loadCSV(path.join(root, 'public/data', f)));

const effects = JSON.parse(fs.readFileSync(path.join(root, 'public/data/effects_WX.json'), 'utf8'));

function flatActions(a) {
  if (!a) return [];
  if (a.type === 'SEQUENCE') return (a.steps||[]).flatMap(flatActions);
  if (a.type === 'CONDITIONAL') return [...flatActions(a.then), ...flatActions(a.else)];
  if (a.type === 'CHOOSE') return (a.choices||[]).flatMap(c => flatActions(c.action));
  if (a.type === 'FOREACH') return flatActions(a.action);
  return [a];
}

// 1. 「以下の○つから選ぶ」があるのにCHOOSE/STUBなし
const chooseIssues = [];
for (const [cardId, efList] of Object.entries(effects)) {
  const c = csv[cardId];
  if (!c) continue;
  if (!/以下の[０-９\d]+つから/.test(c.eff) && !/以下の[０-９\d]+つから/.test(c.burst)) continue;
  const acts = efList.flatMap(ef => flatActions(ef.action));
  if (!acts.some(a => a.type === 'CHOOSE' || a.type === 'STUB')) {
    chooseIssues.push({ cardId, name: c.name, eff: c.eff.substring(0, 200), burst: c.burst.substring(0,200) });
  }
}
console.log('\n=== CHOOSE欠落:', chooseIssues.length, '件 ===');
chooseIssues.forEach(i => {
  console.log(' ', i.cardId, i.name);
  if (i.eff) console.log('   EFF:', i.eff);
  if (i.burst) console.log('   BURST:', i.burst);
});

// 2. 「対戦相手のシグニ」テキストがあるのにopponentターゲットが一切ないカード
const ownerIssues = [];
for (const [cardId, efList] of Object.entries(effects)) {
  const c = csv[cardId];
  if (!c || !/対戦相手のシグニ/.test(c.eff + c.burst)) continue;
  const acts = efList.flatMap(ef => flatActions(ef.action));
  const hasOpponent = acts.some(a => {
    return (a.target?.owner === 'opponent') ||
           (a.source?.owner === 'opponent') ||
           (a.from?.owner === 'opponent') ||
           a.type === 'STUB' ||
           a.type === 'BANISH' ||
           a.type === 'BOUNCE' ||
           (a.type === 'DAMAGE' && a.target?.owner === 'opponent') ||
           (a.signi?.owner === 'opponent');
  });
  if (!hasOpponent) {
    ownerIssues.push({ cardId, name: c.name, eff: c.eff.substring(0, 150) });
  }
}
console.log('\n=== OWNER疑い(opponent対象なし):', ownerIssues.length, '件 ===');
ownerIssues.forEach(i => console.log(' ', i.cardId, i.name, '\n   ', i.eff));

// 3. SEQUENCE欠落 - 複数の効果記述があるのに1つしか実装されていないカード
const seqIssues = [];
for (const [cardId, efList] of Object.entries(effects)) {
  const c = csv[cardId];
  if (!c) continue;
  // 「①②」や「①」などの記号で複数効果があるか判断
  const hasMultiEffect = /①.*①|①.*②|②.*③/.test(c.eff + c.burst);
  if (!hasMultiEffect) continue;

  for (const ef of efList) {
    const acts = flatActions(ef.action);
    const nonStub = acts.filter(a => a.type !== 'STUB');
    if (nonStub.length === 1 && acts.length < 3) {
      seqIssues.push({ cardId, name: c.name, eff: (c.eff + c.burst).substring(0, 150) });
      break;
    }
  }
}
console.log('\n=== SEQUENCE欠落疑い:', seqIssues.length, '件 ===');
seqIssues.slice(0, 20).forEach(i => console.log(' ', i.cardId, i.name));

// 4. STUB_LOGのみのカード（本実装なし）
const stubOnlyCards = [];
for (const [cardId, efList] of Object.entries(effects)) {
  const c = csv[cardId];
  if (!c) continue;
  for (const ef of efList) {
    if (ef.action?.type === 'STUB') {
      stubOnlyCards.push({ cardId, name: c.name, parseStatus: ef.parseStatus, stub: ef.action.description?.substring(0,80) });
      break;
    }
    const acts = flatActions(ef.action);
    if (acts.length > 0 && acts.every(a => a.type === 'STUB')) {
      stubOnlyCards.push({ cardId, name: c.name, parseStatus: ef.parseStatus, stub: acts[0]?.description?.substring(0,80) });
      break;
    }
  }
}
console.log('\n=== STUBのみのカード:', stubOnlyCards.length, '件 ===');
stubOnlyCards.slice(0, 30).forEach(i => console.log(' ', i.cardId, i.name, `[${i.parseStatus}]`));

// 5. owner:"self" で「対戦相手」が含まれる場所を詳細調査
console.log('\n=== 詳細: CHOOSE欠落カードの現在の実装 ===');
chooseIssues.slice(0, 10).forEach(i => {
  const efList = effects[i.cardId];
  console.log(`\n${i.cardId} ${i.name}:`);
  console.log('CSV:', i.eff.substring(0, 300));
  console.log('JSON:', JSON.stringify(efList, null, 2).substring(0, 500));
});
