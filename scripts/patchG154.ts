/** G154(WX24-D3-25 / SPDi37-06) を再パースして effects_WX24_26.json にパッチ。 */
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import Papa from 'papaparse';
import { parseCardEffects } from '../src/data/effectParser';
import { mergeManualEffects } from '../src/data/manualEffects';
import type { CardData } from '../src/types';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const TARGETS = ['WX24-D3-25', 'SPDi37-06'];
// SPDi37-06 は misc 系の可能性。両ファイル探索。
const files = ['effects_WX24_26.json', 'effects_misc.json', 'effects_WXDi.json'];

const allRows: Record<string, string>[] = [];
for (let i = 1; i <= 11; i++) {
  const csvPath = join(root, `public/data/CardData_Sheet${i}.csv`);
  if (!existsSync(csvPath)) break;
  const csvText = readFileSync(csvPath, 'utf-8').replace(/^﻿/, '');
  const { data } = Papa.parse<Record<string, string>>(csvText, { header: true, skipEmptyLines: true });
  allRows.push(...data);
}

const jsonCache: Record<string, Record<string, unknown>> = {};
for (const f of files) jsonCache[f] = JSON.parse(readFileSync(join(root, 'public/data', f), 'utf-8'));

for (const r of allRows) {
  if (!TARGETS.includes(r.CardNum)) continue;
  const card = {
    CardNum: r.CardNum ?? '', CardName: r.CardName ?? '', ImgURL: r.ImgURL ?? '',
    Type: r.Type ?? '', CardClass: r.CardClass ?? '', Color: r.Color ?? '',
    Level: r.Level ?? '', GrowCost: r.GrowCost ?? '', Cost: r.Cost ?? '',
    Limit: r.Limit ?? '', Power: r.Power ?? '', Restriction: r.Restriction ?? '',
    Team: r.Team ?? '', Timing: r.Timing ?? '', Guard: r.Guard ?? '', Coin: r.Coin ?? '',
    Story: r.Story ?? '', LifeBurst: r.LifeBurst ?? '', EffectText: r.EffectText ?? '',
    BurstText: r.BurstText ?? '', effects: [],
  } as CardData;
  const effects = mergeManualEffects(card.CardNum, parseCardEffects(card));
  // どのファイルに既存があるか探して上書き
  let target = files.find(f => r.CardNum in jsonCache[f]);
  if (!target) target = r.CardNum.startsWith('SPDi') ? 'effects_misc.json' : 'effects_WX24_26.json';
  jsonCache[target][r.CardNum] = effects;
  console.log(`${r.CardNum} -> ${target}:`, JSON.stringify(effects));
}

for (const [f, json] of Object.entries(jsonCache)) writeFileSync(join(root, 'public/data', f), JSON.stringify(json), 'utf-8');
console.log('patched');
