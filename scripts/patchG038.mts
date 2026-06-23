import { readFileSync, writeFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import Papa from 'papaparse';
import { parseCardEffects } from '../src/data/effectParser';
import { mergeManualEffects } from '../src/data/manualEffects';
import type { CardData } from '../src/types';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const TARGETS = ['WXDi-P10-064', 'WXDi-P14-089', 'WX24-P1-074', 'WX24-P4-077', 'WX25-P2-092'];

const allRows: Record<string, string>[] = [];
const csvs: string[] = [];
for (let i = 1; i <= 11; i++) csvs.push(`CardData_Sheet${i}.csv`);
csvs.push('CardData_TK.csv');
for (const f of csvs) {
  const p = join(root, 'public/data', f);
  if (!existsSync(p)) continue;
  const { data } = Papa.parse<Record<string, string>>(readFileSync(p, 'utf-8').replace(/^﻿/, ''), { header: true, skipEmptyLines: true });
  allRows.push(...data);
}

// 対象がどのeffectsファイルにいるか判定してパッチ
const files = ['effects_WX.json', 'effects_WXDi.json', 'effects_WX24_26.json', 'effects_WXK.json', 'effects_misc.json'];
const jsons: Record<string, any> = {};
for (const f of files) jsons[f] = JSON.parse(readFileSync(join(root, 'public/data', f), 'utf-8'));

for (const r of allRows) {
  if (!TARGETS.includes(r.CardNum)) continue;
  const card = { ...r, effects: [] } as unknown as CardData;
  const effects = mergeManualEffects(card.CardNum, parseCardEffects(card));
  console.log(`${r.CardNum}:`, JSON.stringify(effects));
  for (const f of files) if (r.CardNum in jsons[f]) jsons[f][r.CardNum] = effects;
}
for (const f of files) writeFileSync(join(root, 'public/data', f), JSON.stringify(jsons[f]), 'utf-8');
console.log('patched');
