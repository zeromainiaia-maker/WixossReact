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
  if (a.type === 'CHOOSE') return [a, ...(a.choices||[]).flatMap(c => flatActions(c.action))];
  if (a.type === 'CHOOSE_N_FROM_LIST') return [a, ...(a.choices||[]).flatMap(c => flatActions(c.action))];
  if (a.type === 'FOREACH') return flatActions(a.action);
  if (a.type === 'OPTIONAL') return flatActions(a.action);
  return [a];
}

// Check CHOOSE issues more carefully - need to find cards where flatActions does NOT contain CHOOSE type at the top level
// (not inside another CHOOSE's children)
function hasChooseAtTopLevel(a) {
  if (!a) return false;
  if (a.type === 'CHOOSE' || a.type === 'CHOOSE_N_FROM_LIST') return true;
  if (a.type === 'SEQUENCE') return (a.steps||[]).some(hasChooseAtTopLevel);
  if (a.type === 'CONDITIONAL') return hasChooseAtTopLevel(a.then) || hasChooseAtTopLevel(a.else);
  if (a.type === 'OPTIONAL') return hasChooseAtTopLevel(a.action);
  if (a.type === 'FOREACH') return hasChooseAtTopLevel(a.action);
  return false;
}

function hasStubAnywhere(a) {
  if (!a) return false;
  const all = flatActions(a);
  return all.some(x => x.type === 'STUB');
}

// 1. CHOOSE欠落 - 選択肢テキストがあるのにCHOOSEもSTUBもない
const realChooseIssues = [];
for (const [cardId, efList] of Object.entries(effects)) {
  const c = csv[cardId];
  if (!c) continue;
  if (!/以下の[０-９\d]+つから/.test(c.eff) && !/以下の[０-９\d]+つから/.test(c.burst)) continue;

  for (const ef of efList) {
    const hasChoose = hasChooseAtTopLevel(ef.action);
    const hasStub = hasStubAnywhere(ef.action);
    if (!hasChoose && !hasStub) {
      realChooseIssues.push({ cardId, name: c.name, eff: (c.eff||'').substring(0, 200) });
      break;
    }
  }
}
console.log('\n=== 本物のCHOOSE欠落:', realChooseIssues.length, '件 ===');
realChooseIssues.forEach(i => {
  const efList = effects[i.cardId];
  console.log(`\n[${i.cardId}] ${i.name}`);
  console.log('CSV:', i.eff);
  console.log('JSON action:', JSON.stringify(efList[0].action, null, 2).substring(0, 300));
});

// 2. owner間違い - 詳細調査
// 「対戦相手のシグニ」ターゲットがある効果で、実際にowner:"self"になっているもの
const ownerMistakes = [];
for (const [cardId, efList] of Object.entries(effects)) {
  const c = csv[cardId];
  if (!c) continue;
  const combinedText = c.eff + c.burst;

  for (const ef of efList) {
    const acts = flatActions(ef.action);
    for (const a of acts) {
      // BANISH with owner:self when text says 対戦相手のシグニ
      if ((a.type === 'BANISH' || a.type === 'BOUNCE' || a.type === 'FREEZE' || a.type === 'POWER_MODIFY')
          && a.target?.owner === 'self'
          && /対戦相手のシグニ/.test(combinedText)) {
        ownerMistakes.push({ cardId, name: c.name, action: a.type, targetOwner: a.target?.owner, eff: combinedText.substring(0,150) });
        break;
      }
    }
  }
}
console.log('\n=== owner間違い疑い:', ownerMistakes.length, '件 ===');
ownerMistakes.forEach(i => console.log(` ${i.cardId} ${i.name} - ${i.action} target.owner:${i.targetOwner}`));

// 3. OPPONENT疑いのある詳細カードの実装を確認
const suspectCards = [
  'WX03-046', 'WX04-034', 'WX10-018', 'WX11-027', 'WX11-031',
  'WX13-087', 'WX13-091', 'WX13-094', 'WX16-021', 'WX16-062', 'WX16-064',
  'WX17-028', 'WX18-004', 'WX19-048', 'WX20-Re03', 'WX20-Re08', 'WX20-Re09',
  'WX21-046', 'WX21-067', 'WX21-069'
];
console.log('\n=== 対戦相手関連カードの実装確認 ===');
for (const cardId of suspectCards) {
  const c = csv[cardId];
  const efList = effects[cardId];
  if (!c || !efList) continue;
  const acts = efList.flatMap(ef => flatActions(ef.action));
  const owners = acts.map(a => [a.type, a.target?.owner]).filter(x => x[1]);
  console.log(`\n${cardId} ${c.name}`);
  console.log('CSV:', c.eff.substring(0,150));
  console.log('Actions/owners:', JSON.stringify(owners));
}

// 4. SEQUENCE欠落の詳細確認 - 複数の【自】や【起】があるのに1エフェクトしか実装されていないカード
const multiEffectCards = [];
for (const [cardId, efList] of Object.entries(effects)) {
  const c = csv[cardId];
  if (!c) continue;
  // テキストに複数の能力記述があるか
  const txt = c.eff + c.burst;
  // 【自】が2つ以上、または【出】+【自】の組合せ
  const autoCount = (txt.match(/【自】/g)||[]).length;
  const activatedCount = (txt.match(/【起】/g)||[]).length;
  const onPlayCount = (txt.match(/【出】/g)||[]).length;
  const permanentCount = (txt.match(/【常】/g)||[]).length;
  const total = autoCount + activatedCount + onPlayCount + permanentCount;

  if (total >= 2 && efList.length === 1) {
    // 1エフェクトしかないのに複数能力記述
    const acts = flatActions(efList[0].action);
    const hasStub = acts.some(a => a.type === 'STUB');
    if (!hasStub) {
      multiEffectCards.push({ cardId, name: c.name, efCount: efList.length, total, eff: txt.substring(0,150) });
    }
  }
}
console.log('\n=== 複数能力→1エフェクトのみ(STUB以外):', multiEffectCards.length, '件 ===');
multiEffectCards.slice(0,20).forEach(i => console.log(` ${i.cardId} ${i.name} [能力${i.total}→efList:${i.efCount}]`));

// 5. effects_WX.json 内のWX05系で CHOOSE ではなく直接実装されているカードを確認
const wx05Cards = Object.entries(effects).filter(([k]) => k.startsWith('WX05-0'));
console.log('\n=== WX05系カード数:', wx05Cards.length, '===');
wx05Cards.forEach(([cardId, efList]) => {
  const c = csv[cardId];
  if (!c) return;
  const hasChoose = efList.some(ef => hasChooseAtTopLevel(ef.action));
  const hasStub = efList.some(ef => hasStubAnywhere(ef.action));
  const hasChooseText = /以下の[０-９\d]+つから/.test(c.eff + c.burst);
  if (hasChooseText && !hasChoose && !hasStub) {
    console.log(` PROBLEM: ${cardId} ${c.name} - Chooseテキストあり, CHOOSE/STUBなし`);
  }
});
