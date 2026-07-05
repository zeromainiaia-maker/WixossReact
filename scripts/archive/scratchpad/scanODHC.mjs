import { readFileSync } from 'fs';
import { join } from 'path';
import Papa from 'papaparse';

const root = 'C:/Users/zerom/WixossReact';
const STUB = process.argv[2] || 'OPTIONAL_DISCARD_HAND_CLASS';

const textByNum = {};
for (let i = 1; i <= 10; i++) {
  const p = join(root, 'public/data', `CardData_Sheet${i}.csv`);
  let text;
  try { text = readFileSync(p, 'utf-8').replace(/^﻿/, ''); } catch { continue; }
  const parsed = Papa.parse(text, { header: true, skipEmptyLines: true });
  for (const row of parsed.data) {
    const num = row.CardNum?.trim();
    if (!num) continue;
    textByNum[num] = ((row.EffectText || '')).trim();
  }
}

const files = ['effects_misc.json','effects_WX.json','effects_WX24_26.json','effects_WXDi.json','effects_WXK.json'];
const all = {};
for (const f of files) Object.assign(all, JSON.parse(readFileSync(join(root, 'public/data', f), 'utf-8')));
const manualSrc = readFileSync(join(root, 'src/data/manualEffects.ts'), 'utf-8');

const hits = new Set();
for (const [num, effs] of Object.entries(all)) {
  if (JSON.stringify(effs).includes(STUB)) hits.add(num);
}
for (const m of manualSrc.matchAll(new RegExp(`"([A-Z0-9-]+)":\\s*\\[\\{[^\\n]*${STUB}`, 'g'))) hits.add(m[1]);

const reCur = /手札から(?:あなたの)?(?:＜([^＞]+)＞の)?(?:シグニ|カード)を?([０-９\d]+)枚/;
const reNew = /手札から(?:あなたの)?(?:＜([^＞]+)＞の)?(シグニ|カード)を?([０-９\d]+)枚/;

for (const num of [...hits].sort()) {
  const txt = textByNum[num] || '(原文なし)';
  const mc = txt.match(reCur);
  const mn = txt.match(reNew);
  // 「カード」表記か
  console.log(`\n■ ${num}`);
  console.log('  原文:', txt.replace(/\s+/g, ' ').slice(0, 160));
  console.log('  cur:', mc ? `cls=${mc[1]||'-'} n=${mc[2]}` : 'NO MATCH', ' | new:', mn ? `cls=${mn[1]||'-'} kind=${mn[2]} n=${mn[3]}` : 'NO MATCH');
}
console.log('\n総数:', hits.size);
