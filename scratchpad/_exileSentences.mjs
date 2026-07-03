import fs from 'fs';
import { join } from 'path';
import Papa from 'papaparse';
const root = process.cwd();
const cardMap = new Map();
for (const f of [...Array.from({ length: 11 }, (_, i) => `CardData_Sheet${i + 1}.csv`), 'CardData_TK.csv']) {
  const p = join(root, 'public/data', f);
  if (!fs.existsSync(p)) continue;
  const { data } = Papa.parse(fs.readFileSync(p, 'utf-8').replace(/^﻿/, ''), { header: true, skipEmptyLines: true });
  for (const r of data) { const id = r.CardNum?.trim(); if (id && !cardMap.has(id)) cardMap.set(id, r); }
}
const ids = ['WX07-022','WX08-023','WX13-005B','WX13-006B','WX14-006B','WX14-021','WX16-040','WX17-044','WX21-Re06','WX25-P1-TK6','WXDi-D07-004','WXDi-D08-012','WXDi-D09-P15','WXDi-P04-013','WXDi-P11-008','WXDi-P13-040','WXK11-070','PR-378','WD22-035-G','WDK13-001','SP36-001','PR-K046'];
for (const id of ids) {
  const c = cardMap.get(id);
  const txt = ((c?.EffectText ?? '') + '|' + (c?.BurstText ?? ''));
  const sents = txt.split(/(?<=。)/).filter(s => s.includes('ゲームから除外'));
  console.log(`== ${id}: ${sents.join(' ／ ').slice(0, 220)}`);
}
