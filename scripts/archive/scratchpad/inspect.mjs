import { readFileSync } from 'fs';
import { join } from 'path';
import Papa from 'papaparse';

const root = 'C:/Users/zerom/WixossReact';
const target = process.argv[2];

const textByNum = {};
for (let i = 1; i <= 10; i++) {
  const p = join(root, 'public/data', `CardData_Sheet${i}.csv`);
  let text;
  try { text = readFileSync(p, 'utf-8').replace(/^﻿/, ''); } catch { continue; }
  const parsed = Papa.parse(text, { header: true, skipEmptyLines: true });
  for (const row of parsed.data) {
    const num = row.CardNum?.trim();
    if (!num) continue;
    textByNum[num] = row;
  }
}

const files = ['effects_misc.json','effects_WX.json','effects_WX24_26.json','effects_WXDi.json','effects_WXK.json'];
const all = {};
for (const f of files) Object.assign(all, JSON.parse(readFileSync(join(root, 'public/data', f), 'utf-8')));

const row = textByNum[target];
console.log('=== 原文 ' + target + ' ===');
console.log('Name:', row?.CardName);
console.log('EffectText:\n' + (row?.EffectText || '(なし)'));
console.log('BurstText:\n' + (row?.BurstText || '(なし)'));
console.log('\n=== JSON effects ===');
console.log(JSON.stringify(all[target], null, 2));
