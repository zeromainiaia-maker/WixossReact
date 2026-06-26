import fs from 'fs';
import Papa from 'papaparse';

// CardData をロード（全シート）
const cardMap = new Map();
for (let n = 1; n <= 10; n++) {
  const p = `public/data/CardData_Sheet${n}.csv`;
  if (!fs.existsSync(p)) continue;
  const text = fs.readFileSync(p, 'utf8').replace(/^﻿/, '');
  const { data } = Papa.parse(text, { header: true, skipEmptyLines: true });
  for (const r of data) { if (r.CardNum) cardMap.set(r.CardNum.trim(), r); }
}

const jsonFiles = ['effects_WX', 'effects_WXK', 'effects_WXDi', 'effects_WX24_26', 'effects_misc'];
const effects = {};
for (const f of jsonFiles) {
  const j = JSON.parse(fs.readFileSync(`public/data/${f}.json`, 'utf8'));
  for (const [k, v] of Object.entries(j)) effects[k] = { file: f, arr: v };
}

const cards = process.argv.slice(2);
for (const c of cards) {
  const cd = cardMap.get(c);
  console.log('\n========== ' + c + ' ' + (cd?.CardName ?? '') + ' [' + (cd?.Type ?? '') + ' Lv' + (cd?.Level ?? '') + '] ==========');
  console.log('EffectText:');
  console.log('  ' + (cd?.EffectText ?? '(none)').replace(/\n/g, '\n  '));
  if (cd?.BurstText) console.log('BurstText:\n  ' + cd.BurstText.replace(/\n/g, '\n  '));
  const e = effects[c];
  if (!e) { console.log('  [no effects JSON]'); continue; }
  console.log('Effects (' + e.file + '):');
  for (const ef of e.arr) {
    console.log('  - ' + ef.effectId + ' [' + ef.effectType + '] timing=' + JSON.stringify(ef.timing) +
      (ef.cost ? ' cost=' + JSON.stringify(ef.cost) : '') +
      (ef.condition ? ' condition=' + JSON.stringify(ef.condition) : '') +
      (ef.activeCondition ? ' activeCondition=' + JSON.stringify(ef.activeCondition) : '') +
      (ef.triggerScope ? ' scope=' + ef.triggerScope : ''));
    console.log('      action=' + JSON.stringify(ef.action).slice(0, 200));
  }
}
