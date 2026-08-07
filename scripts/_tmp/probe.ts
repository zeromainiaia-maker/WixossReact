import { readFileSync } from 'fs';
import Papa from 'papaparse';
import { parseCardEffects } from '../../src/data/effectParser';
import type { CardData } from '../../src/types';
const rows: Record<string,string>[] = [];
for (let i=1;i<=11;i++){ const p=`public/data/CardData_Sheet${i}.csv`;
  try { rows.push(...(Papa.parse<Record<string,string>>(readFileSync(p,'utf-8').replace(/^﻿/,''),{header:true,skipEmptyLines:true}).data)); } catch { break; } }
for (const r of rows) {
  if (r.CardNum !== 'WX25-CP1-091') continue;
  const effs = parseCardEffects(r as unknown as CardData);
  for (const e of effs) console.log(JSON.stringify(e));
}
