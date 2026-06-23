/** G086-G090(WXK) と G100(WXDi) の対象カードを再パースしてパッチする一時スクリプト。 */
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import Papa from 'papaparse';
import { parseCardEffects } from '../src/data/effectParser';
import { mergeManualEffects } from '../src/data/manualEffects';
import type { CardData } from '../src/types';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const TARGETS: Record<string, string> = {
  // G086
  'WXK01-088': 'WXK', 'WDK02-013': 'WXK', 'WDK02-015': 'WXK',
  // G087
  'WXK02-067': 'WXK', 'WXK02-069': 'WXK', 'WXK02-072': 'WXK',
  // G088
  'WXK02-081': 'WXK', 'WDK06-R13': 'WXK', 'WDK06-R15': 'WXK',
  // G089
  'WXK02-090': 'WXK', 'WDK05-R13': 'WXK', 'WDK05-R15': 'WXK',
  // G090
  'WXK02-099': 'WXK', 'WDK06-C13': 'WXK', 'WDK06-C15': 'WXK',
  // G100
  'WXDi-P02-025': 'WXDi', 'WXDi-P07-022': 'WXDi', 'WXDi-CP02-032': 'WXDi',
};
const fileMap: Record<string, string> = { WXK: 'effects_WXK.json', WXDi: 'effects_WXDi.json' };

const allRows: Record<string, string>[] = [];
for (let i = 1; i <= 11; i++) {
  const csvPath = join(root, `public/data/CardData_Sheet${i}.csv`);
  if (!existsSync(csvPath)) break;
  const csvText = readFileSync(csvPath, 'utf-8').replace(/^﻿/, '');
  const { data } = Papa.parse<Record<string, string>>(csvText, { header: true, skipEmptyLines: true });
  allRows.push(...data);
}

const jsonCache: Record<string, Record<string, unknown>> = {};
for (const f of Object.values(fileMap)) jsonCache[f] = JSON.parse(readFileSync(join(root, 'public/data', f), 'utf-8'));

for (const r of allRows) {
  const grp = TARGETS[r.CardNum];
  if (!grp) continue;
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
  jsonCache[fileMap[grp]][card.CardNum] = effects;
  console.log(`${card.CardNum}:`, JSON.stringify(effects));
}

for (const [f, json] of Object.entries(jsonCache)) writeFileSync(join(root, 'public/data', f), JSON.stringify(json), 'utf-8');
console.log('patched');
