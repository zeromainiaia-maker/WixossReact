import { parseCardEffects } from '../src/data/effectParser';
import Papa from 'papaparse';
import { readFileSync } from 'fs';
const {data} = Papa.parse<Record<string,string>>(readFileSync('public/data/CardData_Sheet2.csv','utf-8').replace(/^﻿/,''),{header:true,skipEmptyLines:true});
const r = data.find(x=>x.CardNum==='WX12-025')!;
console.log('EffectText:', r.EffectText);
console.log(JSON.stringify(parseCardEffects({...r, effects:[]} as any), null, 1));
