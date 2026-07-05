import { readFileSync } from 'fs';
import { join } from 'path';
import Papa from 'papaparse';

const root = 'C:/Users/zerom/WixossReact';

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
// manualEffects も含めるため src からも（簡易: ソース文字列検索）
const manualSrc = readFileSync(join(root, 'src/data/manualEffects.ts'), 'utf-8');

const hits = new Set();
for (const [num, effs] of Object.entries(all)) {
  if (JSON.stringify(effs).includes('OPTIONAL_TRASH_ENERGY_CLASS')) hits.add(num);
}
// manualEffects のキーも
for (const m of manualSrc.matchAll(/"([A-Z0-9-]+)":\s*\[\{[^\n]*OPTIONAL_TRASH_ENERGY_CLASS/g)) hits.add(m[1]);

const re1 = /エナゾーンから(?:あなたの)?(?:＜([^＞]+)＞の)?(シグニ|カード)([０-９\d]+)枚を?トラッシュ/;
const reOld = /エナゾーンから(?:あなたの)?(?:＜([^＞]+)＞の)?(?:シグニ|カード)([０-９\d]+)枚/;

for (const num of [...hits].sort()) {
  const txt = textByNum[num] || '(原文なし)';
  const m1 = txt.match(re1);
  const mOld = txt.match(reOld);
  console.log(`\n■ ${num}`);
  console.log('  原文:', txt.replace(/\s+/g, ' ').slice(0, 200));
  console.log('  新re(トラッシュ優先):', m1 ? `cls=${m1[1]||'-'} kind=${m1[2]} n=${m1[3]}` : 'NO MATCH');
  console.log('  旧re:', mOld ? `cls=${mOld[1]||'-'} n=${mOld[2]}` : 'NO MATCH');
}
console.log('\n総数:', hits.size);
