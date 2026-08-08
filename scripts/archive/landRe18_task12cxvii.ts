// WX20-Re18 は MANUAL 効果を含み effectId 集合が変わる（E4 新設）＝build:effects の sameIdSet ガードで
// カード丸ごと温存され、held/partial のどちらにも載らない。parser 出力をそのまま live へ書く。
import fs from 'fs';
import { join } from 'path';
import Papa from 'papaparse';
import { parseCardEffects } from '../src/data/effectParser';
import { mergeManualEffects } from '../src/data/manualEffects';

const rows: Record<string, string>[] = [];
for (let i = 1; i <= 10; i++) {
  const p = join('public/data', `CardData_Sheet${i}.csv`);
  if (!fs.existsSync(p)) continue;
  const { data } = Papa.parse<Record<string, string>>(fs.readFileSync(p, 'utf-8').replace(/^﻿/, ''), { header: true, skipEmptyLines: true });
  rows.push(...data);
}
const path = 'public/data/effects_WX.json';
const j = JSON.parse(fs.readFileSync(path, 'utf-8'));
const id = 'WX20-Re18';
const row = rows.find(r => r.CardNum === id)!;
const freshEff = mergeManualEffects(id, parseCardEffects({ ...row, effects: [] } as never));
console.log('旧:', (j[id] ?? []).map((e: { effectId: string }) => e.effectId).join(' '));
console.log('新:', freshEff.map(e => e.effectId).join(' '));
j[id] = freshEff;
fs.writeFileSync(path, JSON.stringify(j), 'utf-8');
console.log('wrote', path);
