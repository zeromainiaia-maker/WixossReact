import fs from 'fs';
import { join } from 'path';
import Papa from 'papaparse';
const root = process.cwd();
const cardMap = new Map();
for (const f of [...Array.from({ length: 11 }, (_, i) => `CardData_Sheet${i + 1}.csv`), 'CardData_TK.csv']) {
  const p = join(root, 'public/data', f);
  if (!fs.existsSync(p)) continue;
  const text = fs.readFileSync(p, 'utf-8').replace(/^﻿/, '');
  const { data } = Papa.parse(text, { header: true, skipEmptyLines: true });
  for (const r of data) { const id = r.CardNum?.trim(); if (id && !cardMap.has(id)) cardMap.set(id, r); }
}
const ids = ['WX10-009','WXEX2-01','WX24-P4-011','WXK11-052','SPDi43-11','SPDi43-12'];
for (const id of ids) {
  const c = cardMap.get(id);
  const t = (c?.EffectText ?? '') + '|BURST:' + (c?.BurstText ?? '');
  const m = [...t.matchAll(/.{0,40}アップ.{0,10}/g)].map(x => x[0]);
  console.log(`\n== ${id} (${c?.Type})`);
  for (const s of m) console.log('  …' + s);
}
