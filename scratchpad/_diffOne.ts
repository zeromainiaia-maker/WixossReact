import fs from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';
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
const files = ['effects_WX.json','effects_WXDi.json','effects_WX24_26.json','effects_WXK.json','effects_misc.json'];
const head: Record<string, unknown> = {};
for (const f of files) Object.assign(head, JSON.parse(execSync(`git show HEAD:public/data/${f}`,{maxBuffer:1e9}).toString()));
const id = process.argv[2] ?? 'WX20-075';
const parsed = parseCardEffects(cardMap.get(id)!);
console.log('=== PARSER ===');
console.log(JSON.stringify(parsed, null, 1));
console.log('=== HEAD JSON ===');
console.log(JSON.stringify(head[id], null, 1));
