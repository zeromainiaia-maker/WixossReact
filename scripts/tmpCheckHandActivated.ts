import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import Papa from 'papaparse';
import { parseCardEffects } from '../src/data/effectParser';
import { mergeManualEffects } from '../src/data/manualEffects';
import type { CardData } from '../src/types';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const targets = ['WX17-031', 'WX18-029', 'WX18-053', 'WX18-055', 'WX19-022', 'WX19-045', 'WX21-030', 'WXK11-067', 'WXDi-P08-070'];

const rows: Record<string, string>[] = [];
for (let i = 1; i <= 11; i++) {
  const p = join(root, `public/data/CardData_Sheet${i}.csv`);
  if (!existsSync(p)) break;
  const { data } = Papa.parse<Record<string, string>>(readFileSync(p, 'utf-8').replace(/^﻿/, ''), { header: true, skipEmptyLines: true });
  rows.push(...data);
}

for (const t of targets) {
  const r = rows.find(x => x.CardNum === t);
  if (!r) { console.log(`${t}: CSVなし`); continue; }
  const card = r as unknown as CardData;
  const effs = mergeManualEffects(t, parseCardEffects(card));
  console.log(`\n=== ${t} ${r.CardName} ===`);
  for (const e of effs) {
    if (e.effectType !== 'ACTIVATED') continue;
    console.log(`  ${e.effectId} timing=${(e.timing || []).join('/')} handActivated=${(e as { handActivated?: boolean }).handActivated} disc=${e.cost?.discardSelfFromHand} act=${e.action?.type}`);
  }
}
