/**
 * G023グループ（＜X＞か＜Y＞のシグニが合計N体あるかぎり）の6枚だけ再パースして
 * effects_WX.json にパッチする一時スクリプト。
 */
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import Papa from 'papaparse';
import { parseCardEffects } from '../src/data/effectParser';
import { mergeManualEffects } from '../src/data/manualEffects';
import type { CardData } from '../src/types';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

const TARGETS = ['WX07-067', 'WX07-068', 'WX07-070', 'WX08-054', 'WX08-056', 'WX08-058'];

const allRows: Record<string, string>[] = [];
for (let i = 1; i <= 11; i++) {
  const csvPath = join(root, `public/data/CardData_Sheet${i}.csv`);
  if (!existsSync(csvPath)) break;
  const csvText = readFileSync(csvPath, 'utf-8').replace(/^﻿/, '');
  const { data } = Papa.parse<Record<string, string>>(csvText, { header: true, skipEmptyLines: true });
  allRows.push(...data);
}

const jsonPath = join(root, 'public/data/effects_WX.json');
const json = JSON.parse(readFileSync(jsonPath, 'utf-8'));

for (const r of allRows) {
  if (!TARGETS.includes(r.CardNum)) continue;
  const card = { ...r, effects: [] } as unknown as CardData;
  const effects = mergeManualEffects(card.CardNum, parseCardEffects(card));
  console.log(`${r.CardNum}:`, JSON.stringify(effects));
  json[r.CardNum] = effects;
}

writeFileSync(jsonPath, JSON.stringify(json), 'utf-8');
console.log('patched effects_WX.json');
