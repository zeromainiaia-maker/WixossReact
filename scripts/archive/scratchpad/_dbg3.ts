import fs from 'fs';
import { join } from 'path';
import Papa from 'papaparse';
import { parseCardEffects } from '../src/data/effectParser';
import type { CardData } from '../src/types';
const root = process.cwd();
const cardMap = new Map<string, CardData>();
for (let i = 1; i <= 11; i++) {
  const p = join(root, 'public/data', `CardData_Sheet${i}.csv`);
  if (!fs.existsSync(p)) continue;
  const { data } = Papa.parse<Record<string, string>>(fs.readFileSync(p, 'utf-8').replace(/^﻿/, ''), { header: true, skipEmptyLines: true });
  for (const r of data) { const id = r.CardNum?.trim(); if (id && !cardMap.has(id)) cardMap.set(id, r as unknown as CardData); }
}
for (const id of ['WXK06-031', 'WXK03-039', 'WXDi-P13-003A']) {
  console.log('##### PARSER', id);
  for (const e of parseCardEffects(cardMap.get(id)!)) console.log(JSON.stringify(e).slice(0, 500));
  console.log();
}
// curated
const files = ['effects_WX.json','effects_WXDi.json','effects_WX24_26.json','effects_WXK.json','effects_misc.json'];
const all: Record<string, unknown> = {};
for (const f of files) Object.assign(all, JSON.parse(fs.readFileSync(join(root,'public/data',f),'utf8')));
for (const id of ['WXK06-031','WXK03-039','WXDi-P13-003A']) {
  console.log('##### CURATED', id);
  console.log(JSON.stringify(all[id]).slice(0, 600));
  console.log();
}
