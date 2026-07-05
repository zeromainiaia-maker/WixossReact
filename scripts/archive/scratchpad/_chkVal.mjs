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
const ids = ['WX22-010','WXEX2-21','WXDi-P11-082','WX24-P3-001','WX24-P3-088','WX24-P4-034','WXDi-P16-001B','WXDi-P11-010B','WXK04-035','WXK09-015'];
for (const id of ids) {
  const c = cardMap.get(id);
  const t = (c?.EffectText ?? '');
  const gla = t.includes('センタールリグは');
  const up = /ルリグ[をが]?アップ/.test(t);
  console.log(`${id}\t${c?.Type}\tGLA文:${gla}\tルリグアップ文:${up}`);
}
