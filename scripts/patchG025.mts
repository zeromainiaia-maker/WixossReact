import { readFileSync, writeFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import Papa from 'papaparse';
import { parseCardEffects } from '../src/data/effectParser';
import { mergeManualEffects } from '../src/data/manualEffects';
import type { CardData } from '../src/types';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const TARGETS = ['WDK16-02T', 'WDK16-03T', 'WDK16-02H', 'WDK16-03H', 'WDK16-02S', 'WDK16-03S'];

const allRows: Record<string, string>[] = [];
for (let i = 1; i <= 11; i++) {
  const csvPath = join(root, `public/data/CardData_Sheet${i}.csv`);
  if (!existsSync(csvPath)) break;
  const { data } = Papa.parse<Record<string, string>>(readFileSync(csvPath, 'utf-8').replace(/^﻿/, ''), { header: true, skipEmptyLines: true });
  allRows.push(...data);
}
const tkPath = join(root, 'public/data/CardData_TK.csv');
if (existsSync(tkPath)) {
  const { data } = Papa.parse<Record<string, string>>(readFileSync(tkPath, 'utf-8').replace(/^﻿/, ''), { header: true, skipEmptyLines: true });
  allRows.push(...data);
}

const jsonPath = join(root, 'public/data/effects_misc.json');
const json = JSON.parse(readFileSync(jsonPath, 'utf-8'));
for (const r of allRows) {
  if (!TARGETS.includes(r.CardNum)) continue;
  const card = { ...r, effects: [] } as unknown as CardData;
  const effects = mergeManualEffects(card.CardNum, parseCardEffects(card));
  console.log(`${r.CardNum}:`, JSON.stringify(effects));
  json[r.CardNum] = effects;
}
writeFileSync(jsonPath, JSON.stringify(json), 'utf-8');
console.log('patched effects_misc.json');
