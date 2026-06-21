import { readFileSync, existsSync } from 'fs';
import Papa from 'papaparse';
import { parseCardEffects } from './src/data/effectParser.ts';
import { mergeManualEffects } from './src/data/manualEffects.ts';
import type { CardData } from './src/types';

const rows: Record<string, string>[] = [];
for (let i = 1; i <= 11; i++) {
  const p = `./public/data/CardData_Sheet${i}.csv`;
  if (!existsSync(p)) break;
  const { data } = Papa.parse<Record<string, string>>(readFileSync(p, 'utf-8').replace(/^﻿/, ''), { header: true, skipEmptyLines: true });
  rows.push(...data);
}
const tk = './public/data/CardData_TK.csv';
if (existsSync(tk)) { const { data } = Papa.parse<Record<string, string>>(readFileSync(tk, 'utf-8').replace(/^﻿/, ''), { header: true, skipEmptyLines: true }); rows.push(...data); }

const committed: Record<string, unknown> = {};
for (const f of ['effects_WX', 'effects_WXDi', 'effects_WX24_26', 'effects_WXK', 'effects_misc']) {
  Object.assign(committed, JSON.parse(readFileSync(`./public/data/${f}.json`, 'utf-8')));
}

const changed: string[] = [];
for (const r of rows) {
  const card = { ...r, effects: [] } as unknown as CardData;
  const num = (r.CardNum ?? '').trim();
  if (!num) continue;
  const effs = mergeManualEffects(num, parseCardEffects(card));
  if (effs.length === 0) continue;
  const a = JSON.stringify(committed[num]);
  const b = JSON.stringify(effs);
  if (a !== b) changed.push(num);
}
console.log('再パースでコミット版と差分のあるカード数:', changed.length);
console.log(changed.join(' '));
