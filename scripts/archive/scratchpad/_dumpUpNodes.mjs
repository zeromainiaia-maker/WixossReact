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
const targets = {
  'effects_WX.json': ['WX08-001-E2','WX10-009-E2','WX22-010-E3','WXEX2-01-E1'],
  'effects_WX24_26.json': ['WX25-P2-048-E1'],
  'effects_WXDi.json': ['WXDi-D08-004-E3'],
  'effects_misc.json': ['PR-461-E1','SPDi43-03-E2','SPDi43-11-E2','SPDi43-12-E2','SPDi43-13-E2'],
};
for (const [f, ids] of Object.entries(targets)) {
  const j = JSON.parse(fs.readFileSync(`public/data/${f}`, 'utf8'));
  for (const id of ids) {
    const cardNum = id.replace(/-E\d+$/, '');
    const eff = (j[cardNum] ?? []).find(e => e.effectId === id);
    console.log(`\n════ ${id} ════`);
    console.log('原文:', (cardMap.get(cardNum)?.EffectText ?? '').slice(0, 350));
    console.log('JSON:', JSON.stringify(eff).slice(0, 500));
  }
}
