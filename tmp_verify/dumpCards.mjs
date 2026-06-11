// タイミング不一致カードのCSVテキストとJSON定義をダンプする一時スクリプト
// 使い方: node tmp_verify/dumpCards.mjs Sheet1:WX05-001 Sheet2:WX12-029 ...
import fs from 'fs';
import path from 'path';

const EFFECT_FILES = ['effects_WX.json','effects_WXDi.json','effects_WX24_26.json','effects_WXK.json','effects_misc.json'];
const effectsAll = {};
for (const f of EFFECT_FILES) Object.assign(effectsAll, JSON.parse(fs.readFileSync(path.resolve('public/data', f), 'utf8')));

function splitCsvLine(line) {
  const result = []; let cur = ''; let q = false;
  for (const c of line) {
    if (c === '"') { q = !q; continue; }
    if (c === ',' && !q) { result.push(cur); cur = ''; continue; }
    cur += c;
  }
  result.push(cur); return result;
}

const bySheet = {};
for (const a of process.argv.slice(2)) {
  const [sheet, card] = a.split(':');
  (bySheet[sheet] ??= []).push(card);
}

for (const [sheet, cards] of Object.entries(bySheet)) {
  const raw = fs.readFileSync(path.resolve('public/data', `CardData_${sheet}.csv`), 'utf8').replace(/^﻿/, '');
  const lines = raw.split('\n').filter(l => l.trim());
  const header = splitCsvLine(lines[0]);
  const ci = header.indexOf('CardNum'), ti = header.indexOf('EffectText'), ni = header.indexOf('CardName');
  for (const line of lines.slice(1)) {
    const cols = splitCsvLine(line);
    if (!cards.includes(cols[ci]?.trim())) continue;
    const num = cols[ci].trim();
    console.log(`\n${'='.repeat(60)}\n[${sheet}] ${num} ${cols[ni]}`);
    console.log(`--- CSV EffectText ---\n${cols[ti]}`);
    const effs = effectsAll[num] ?? [];
    console.log(`--- JSON (${effs.length} effects) ---`);
    for (const e of effs) {
      console.log(JSON.stringify(e).substring(0, 500));
    }
  }
}
