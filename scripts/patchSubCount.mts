/** GAIN_SUBSCRIBER_COUNT アクションに原文由来の value（万人）を付与する一時スクリプト（surgical） */
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import Papa from 'papaparse';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

// CardNum -> EffectText
const textMap = new Map<string, string>();
const csvs = ['CardData_TK.csv'];
for (let i = 1; i <= 11; i++) csvs.unshift(`CardData_Sheet${i}.csv`);
for (const f of csvs) {
  const p = join(root, 'public/data', f);
  if (!existsSync(p)) continue;
  const { data } = Papa.parse<Record<string, string>>(readFileSync(p, 'utf-8').replace(/^﻿/, ''), { header: true, skipEmptyLines: true });
  for (const r of data) if (r.CardNum) textMap.set(r.CardNum, (r.EffectText ?? '') + ' ' + (r.BurstText ?? ''));
}

const toHalf = (s: string) => s.replace(/[０-９]/g, d => String('０１２３４５６７８９'.indexOf(d)));

for (const f of ['effects_misc.json', 'effects_WXK.json']) {
  const p = join(root, 'public/data', f);
  const json = JSON.parse(readFileSync(p, 'utf-8'));
  let changed = 0;
  for (const [cardNum, effects] of Object.entries<any[]>(json)) {
    for (const e of effects) {
      if (e?.action?.type === 'STUB' && e.action.id === 'GAIN_SUBSCRIBER_COUNT' && e.action.value == null) {
        const m = (textMap.get(cardNum) ?? '').match(/登録者数を([０-９\d]+)万人得る/);
        if (m) { e.action.value = parseInt(toHalf(m[1]), 10); changed++; console.log(`${cardNum}: value=${e.action.value}`); }
      }
    }
  }
  if (changed) writeFileSync(p, JSON.stringify(json), 'utf-8');
  console.log(`${f}: ${changed}件更新`);
}
