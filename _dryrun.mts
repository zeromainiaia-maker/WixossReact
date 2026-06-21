import { readFileSync } from 'fs';
import Papa from 'papaparse';
import { parseCardEffects } from './src/data/effectParser.ts';
import { mergeManualEffects } from './src/data/manualEffects.ts';
import type { CardData } from './src/types';

const { data } = Papa.parse<Record<string, string>>(readFileSync('./public/data/CardData_Sheet1.csv', 'utf-8').replace(/^﻿/, ''), { header: true, skipEmptyLines: true });
const r = data.find(x => x.CardNum?.trim() === 'WX04-029')!;
console.log('EffectText:', r.EffectText);
const effs = mergeManualEffects('WX04-029', parseCardEffects({ ...r, effects: [] } as unknown as CardData));
console.log(JSON.stringify(effs, null, 2));
