import { readFileSync, existsSync } from 'fs';
import Papa from 'papaparse';
import { parseCardEffects } from '../src/data/effectParser';
import type { CardData } from '../src/types';

let card: CardData | null = null;
for (let i = 1; i <= 11; i++) {
  const p = `public/data/CardData_Sheet${i}.csv`;
  if (!existsSync(p)) continue;
  const text = readFileSync(p, 'utf-8').replace(/^﻿/, '');
  const { data } = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: true });
  const f = data.find(r => r.CardNum?.trim() === 'WXK01-050');
  if (f) { card = f as unknown as CardData; break; }
}
if (!card) { console.log('未発見'); process.exit(0); }
const eff = parseCardEffects(card);
const e1 = eff.find(e => (e.action as { type?: string })?.type === 'REVEAL_AND_PICK');
console.log('再パース then =', JSON.stringify((e1?.action as { then?: unknown })?.then));
