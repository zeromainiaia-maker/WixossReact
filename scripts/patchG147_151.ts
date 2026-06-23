/** G147-G151 の対象カードを再パースして effects_WX.json にパッチする一時スクリプト。 */
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import Papa from 'papaparse';
import { parseCardEffects } from '../src/data/effectParser';
import { mergeManualEffects } from '../src/data/manualEffects';
import type { CardData } from '../src/types';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const TARGETS = ['WX10-089','WX10-093','WX10-090','WX10-095','WX11-057','WX11-061','WX11-063','WX11-064','WX11-068','WX11-071'];

const allRows: Record<string, string>[] = [];
for (let i = 1; i <= 11; i++) {
  const csvPath = join(root, `public/data/CardData_Sheet${i}.csv`);
  if (!existsSync(csvPath)) break;
  const csvText = readFileSync(csvPath, 'utf-8').replace(/^﻿/, '');
  const { data } = Papa.parse<Record<string, string>>(csvText, { header: true, skipEmptyLines: true });
  allRows.push(...data);
}

const jsonPath = join(root, 'public/data/effects_WX.json');
const json = JSON.parse(readFileSync(jsonPath, 'utf-8'));

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
  json[card.CardNum] = effects;
  console.log(`${card.CardNum}:`, JSON.stringify(effects));
}

writeFileSync(jsonPath, JSON.stringify(json), 'utf-8');
console.log('patched');
