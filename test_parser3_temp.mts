import { parseCardEffects } from './src/data/effectParser';
import { mergeManualEffects } from './src/data/manualEffects';
import Papa from 'papaparse';
import { readFileSync, existsSync } from 'fs';

const csvText = readFileSync('public/data/CardData_Sheet1.csv', 'utf-8').replace(/^﻿/, '');
const { data } = Papa.parse(csvText, { header: true, skipEmptyLines: true });
const r = (data as Record<string, string>[]).find(row => row.CardNum === 'WX07-045');
if (!r) { console.log('not found'); process.exit(1); }

import type { CardData } from './src/types';
const card: CardData = {
  CardNum: r.CardNum ?? '', CardName: r.CardName ?? '', ImgURL: r.ImgURL ?? '',
  Type: r.Type ?? '', CardClass: r.CardClass ?? '', Color: r.Color ?? '',
  Level: r.Level ?? '', GrowCost: r.GrowCost ?? '', Cost: r.Cost ?? '',
  Limit: r.Limit ?? '', Power: r.Power ?? '', Restriction: r.Restriction ?? '',
  Team: r.Team ?? '', Timing: r.Timing ?? '', Guard: r.Guard ?? '',
  Coin: r.Coin ?? '', Story: r.Story ?? '', LifeBurst: r.LifeBurst ?? '',
  EffectText: r.EffectText ?? '', BurstText: r.BurstText ?? '', effects: [],
};
console.log('EffectText preview:', card.EffectText.slice(0, 80));
const parsed = parseCardEffects(card);
const merged = mergeManualEffects(card.CardNum, parsed);
console.log('sourceOwner:', merged[0]?.action?.type === 'POWER_MODIFY_PER_CHARM' ? (merged[0].action as any).sourceOwner : 'N/A');
console.log(JSON.stringify(merged[0]?.action, null, 2));
