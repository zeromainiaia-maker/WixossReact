import { readFileSync } from 'fs';
import { join } from 'path';
import Papa from 'papaparse';

const root = 'C:/Users/zerom/WixossReact';
const pat = new RegExp(process.argv[2] || '.');

const textByNum = {};
for (let i = 1; i <= 10; i++) {
  const p = join(root, 'public/data', `CardData_Sheet${i}.csv`);
  let text;
  try { text = readFileSync(p, 'utf-8').replace(/^﻿/, ''); } catch { continue; }
  const parsed = Papa.parse(text, { header: true, skipEmptyLines: true });
  for (const row of parsed.data) {
    const num = row.CardNum?.trim();
    if (!num) continue;
    textByNum[num] = ((row.EffectText || '') + ' ||LB|| ' + (row.BurstText || '')).trim();
  }
}

const files = ['effects_misc.json','effects_WX.json','effects_WX24_26.json','effects_WXDi.json','effects_WXK.json'];
const all = {};
for (const f of files) Object.assign(all, JSON.parse(readFileSync(join(root, 'public/data', f), 'utf-8')));

const byStub = {};
for (const [num, effs] of Object.entries(all)) {
  const s = JSON.stringify(effs);
  for (const m of s.matchAll(/"id":"([A-Z][A-Z0-9_]+)"/g)) {
    if (pat.test(m[1])) (byStub[m[1]] ??= new Set()).add(num);
  }
}

for (const [id, nums] of Object.entries(byStub).sort()) {
  for (const num of nums) {
    console.log(`\n■ ${id}  (${num})`);
    console.log('  ' + (textByNum[num] || '(なし)').replace(/\s+/g, ' ').slice(0, 230));
  }
}
