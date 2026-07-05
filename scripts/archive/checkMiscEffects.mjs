import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

function splitCSVLine(line) {
  const result = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"' && inQ) { inQ = false; }
    else if (c === '"') { inQ = true; }
    else if (c === ',' && !inQ) { result.push(cur); cur = ''; }
    else { cur += c; }
  }
  result.push(cur);
  return result;
}

function loadCSV(filepath) {
  const lines = fs.readFileSync(filepath, 'utf8').split('\n');
  const header = splitCSVLine(lines[0]);
  const idIdx = header.indexOf('CardNum');
  const effIdx = header.indexOf('EffectText');
  const burstIdx = header.indexOf('BurstText');
  const map = {};
  for (let i = 1; i < lines.length; i++) {
    const parts = splitCSVLine(lines[i]);
    if (!parts[idIdx]) continue;
    map[parts[idIdx]] = { eff: parts[effIdx] || '', burst: parts[burstIdx] || '' };
  }
  return map;
}

const csv = {};
for (const f of ['CardData_Sheet1.csv','CardData_Sheet5.csv','CardData_Sheet6.csv','CardData_Variants.csv']) {
  Object.assign(csv, loadCSV(path.join(root, 'public/data', f)));
}

const effects = JSON.parse(fs.readFileSync(path.join(root, 'public/data/effects_misc.json'), 'utf8'));

// --- 効果タイプのマッピング検証 ---
// 【常】→CONTINUOUS, 【起】→ACTIVATED, 【自】→AUTO, 【出】→ON_PLAY/AUTO
const typePatterns = [
  { csv: /【常】/, json: 'CONTINUOUS' },
  { csv: /【起】/, json: 'ACTIVATED' },
  { csv: /【自】/, json: 'AUTO' },
  { csv: /【出】/, json: ['ON_PLAY','AUTO'] },
];

const issues = [];

for (const [cardId, efList] of Object.entries(effects)) {
  const csvData = csv[cardId];
  if (!csvData) {
    // CSV に見つからないカードは記録しない
    continue;
  }
  const fullText = (csvData.eff + ' ' + csvData.burst).trim();
  if (!fullText || fullText === ' ') continue;

  for (const ef of efList) {
    // --- effectType 不一致チェック ---
    const et = ef.effectType;
    // 【常】なのにACTIVATED/AUTO
    if (/【常】/.test(fullText) && et === 'ACTIVATED') {
      issues.push({ cardId, effectId: ef.effectId, type: 'EFFECT_TYPE_MISMATCH', detail: `CSV【常】→JSON ${et}`, csv: fullText.substring(0, 80) });
    }
    // 【起】なのにCONTINUOUS/AUTO
    if (/【起】/.test(fullText) && (et === 'CONTINUOUS' || et === 'AUTO')) {
      issues.push({ cardId, effectId: ef.effectId, type: 'EFFECT_TYPE_MISMATCH', detail: `CSV【起】→JSON ${et}`, csv: fullText.substring(0, 80) });
    }

    // --- パワー値チェック ---
    const powerMatch = fullText.match(/[＋\+](\d+(?:,\d+)?)/g);
    if (powerMatch) {
      const allActions = flatActions(ef.action);
      for (const a of allActions) {
        if (a.type === 'POWER_MODIFY' && a.delta) {
          const deltaStr = String(Math.abs(a.delta));
          const csvVals = powerMatch.map(m => m.replace(/[＋\+,]/g, '').trim());
          if (!csvVals.some(v => v === deltaStr || v.replace(',','') === deltaStr)) {
            // パワー値が合わない → 疑わしい
            issues.push({ cardId, effectId: ef.effectId, type: 'POWER_MISMATCH', detail: `JSON delta=${a.delta}, CSV values=${csvVals.join('/')}`, csv: fullText.substring(0, 80) });
          }
        }
      }
    }

    // --- owner:opponent なのに「あなた」テキスト ---
    const allActions = flatActions(ef.action);
    for (const a of allActions) {
      if (a.target?.owner === 'opponent' && /あなたのシグニ/.test(fullText)) {
        issues.push({ cardId, effectId: ef.effectId, type: 'OWNER_SUSPICIOUS', detail: `target.owner=opponent but CSV has "あなたのシグニ"`, csv: fullText.substring(0, 80) });
      }
      if (a.target?.owner === 'self' && /対戦相手のシグニ/.test(fullText) && et !== 'CONTINUOUS') {
        issues.push({ cardId, effectId: ef.effectId, type: 'OWNER_SUSPICIOUS', detail: `target.owner=self but CSV has "対戦相手のシグニ"`, csv: fullText.substring(0, 80) });
      }
    }
  }
}

function flatActions(a) {
  if (!a) return [];
  if (a.type === 'SEQUENCE') return (a.steps || []).flatMap(flatActions);
  if (a.type === 'CONDITIONAL') return [...flatActions(a.then), ...flatActions(a.else)];
  return [a];
}

// 結果出力
console.log(`\n=== 問題検出結果: ${issues.length}件 ===\n`);

const byType = {};
for (const issue of issues) {
  byType[issue.type] = byType[issue.type] || [];
  byType[issue.type].push(issue);
}

for (const [type, list] of Object.entries(byType)) {
  console.log(`\n--- ${type} (${list.length}件) ---`);
  for (const item of list.slice(0, 20)) {
    console.log(`  ${item.cardId} [${item.effectId}]`);
    console.log(`    問題: ${item.detail}`);
    console.log(`    CSV: ${item.csv}`);
  }
  if (list.length > 20) console.log(`  ... 他${list.length - 20}件`);
}

// UNKNOWN カード
console.log('\n--- UNKNOWN アクション (別途) ---');
for (const [cardId, efList] of Object.entries(effects)) {
  for (const ef of efList) {
    const acts = flatActions(ef.action);
    for (const a of acts) {
      if (a.type === 'UNKNOWN') {
        const csvData = csv[cardId];
        console.log(`  ${cardId}: ${a.raw}`);
        if (csvData) console.log(`    CSV: ${csvData.eff.substring(0,100)}`);
      }
    }
  }
}
