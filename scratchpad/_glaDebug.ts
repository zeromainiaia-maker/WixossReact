import fs from 'fs';
import { join } from 'path';
import Papa from 'papaparse';
import type { CardData } from '../src/types';
import { parseCardEffects } from '../src/data/effectParser';

const root = process.cwd();
const id = process.argv[2] ?? 'WXDi-P06-004';
const cardMap = new Map<string, CardData>();
for (const f of [...Array.from({ length: 11 }, (_, i) => `CardData_Sheet${i + 1}.csv`), 'CardData_TK.csv']) {
  const p = join(root, 'public/data', f);
  if (!fs.existsSync(p)) continue;
  const text = fs.readFileSync(p, 'utf-8').replace(/^﻿/, '');
  const { data } = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: true });
  for (const r of data) { const cid = r.CardNum?.trim(); if (cid && !cardMap.has(cid)) cardMap.set(cid, r as unknown as CardData); }
}
const card = cardMap.get(id)!;
console.log('Type:', card.Type);
console.log('EffectText:', (card.EffectText ?? '').slice(0, 300));
const parsed = parseCardEffects({ ...card });
console.log(JSON.stringify(parsed, null, 1).slice(0, 4000));
