import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import Papa from 'papaparse';
import { parseCardEffects } from '../src/data/effectParser.ts';
import { mergeManualEffects } from '../src/data/manualEffects.ts';
const root = process.cwd();
const allRows = [];
for (let i = 1; i <= 11; i++) {
  const p = join(root, `public/data/CardData_Sheet${i}.csv`);
  if (!existsSync(p)) break;
  const { data } = Papa.parse(readFileSync(p,'utf-8').replace(/^﻿/,''), { header:true, skipEmptyLines:true });
  allRows.push(...data);
}
const r = allRows.find(x => x.CardNum === 'WX04-004');
console.log('=== EffectText ===');
console.log(r.EffectText);
const card = { ...r, effects: [] };
const regen = mergeManualEffects('WX04-004', parseCardEffects(card));
const eff = JSON.parse(readFileSync(join(root,'public/data/effects_WX.json'),'utf-8'));
console.log('=== BEFORE ===');
console.log(JSON.stringify(eff['WX04-004'], null, 1));
console.log('=== AFTER ===');
console.log(JSON.stringify(regen, null, 1));
