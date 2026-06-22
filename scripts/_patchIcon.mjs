import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import Papa from 'papaparse';
import { parseCardEffects } from '../src/data/effectParser.ts';
import { mergeManualEffects } from '../src/data/manualEffects.ts';
const root = process.cwd();
const PATTERN = /《(クロス|ライズ|トラップ|アクセ)アイコン》を持つシグニのパワーを[＋－-]/;
const allRows = [];
for (let i = 1; i <= 11; i++) {
  const p = join(root, `public/data/CardData_Sheet${i}.csv`);
  if (!existsSync(p)) break;
  const { data } = Papa.parse(readFileSync(p,'utf-8').replace(/^﻿/,''), { header:true, skipEmptyLines:true });
  allRows.push(...data);
}
const effPath = join(root,'public/data/effects_WX.json');
const eff = JSON.parse(readFileSync(effPath,'utf-8'));
const changed = [], suspicious = [];
for (const r of allRows) {
  if (!PATTERN.test(`${r.EffectText ?? ''}\n${r.BurstText ?? ''}`)) continue;
  const cn = r.CardNum ?? '';
  if (!/^WX(0[0-9]|1[0-9]|2[0-3]|EX)/.test(cn)) continue;
  const regen = mergeManualEffects(cn, parseCardEffects({...r, effects:[]}));
  if (regen.length === 0) continue;
  const before = JSON.stringify(eff[cn] ?? null), after = JSON.stringify(regen);
  if (before === after) continue;
  // owner/count/filter の追加のみか緩く確認（POWER_MODIFY target の変化を許容）
  changed.push(cn);
  eff[cn] = regen;
}
writeFileSync(effPath, JSON.stringify(eff), 'utf-8');
console.log(`パッチ: ${changed.length}枚 → ${changed.join(', ')}`);
