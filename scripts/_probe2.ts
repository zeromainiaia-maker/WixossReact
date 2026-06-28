import { readFileSync, existsSync } from 'fs';
import Papa from 'papaparse';
import { parseCardEffects } from '../src/data/effectParser';
import { mergeManualEffects } from '../src/data/manualEffects';
import type { CardData } from '../src/types';
const rows:any[]=[];
for(let i=1;i<=11;i++){const p=`public/data/CardData_Sheet${i}.csv`;if(!existsSync(p))break;const {data}=Papa.parse(readFileSync(p,'utf-8').replace(/^﻿/,''),{header:true,skipEmptyLines:true});rows.push(...data as any[]);}
const tk='public/data/CardData_TK.csv';if(existsSync(tk)){const {data}=Papa.parse(readFileSync(tk,'utf-8').replace(/^﻿/,''),{header:true,skipEmptyLines:true});rows.push(...data as any[]);}
const r=rows.find(r=>r.CardNum==='WDK17-001');
const fresh=mergeManualEffects('WDK17-001', parseCardEffects({...r,effects:[]} as unknown as CardData));
const exist=JSON.parse(readFileSync('public/data/effects_misc.json','utf-8'))['WDK17-001'];
console.log('EXIST(worktree)===FRESH(parser):', JSON.stringify(exist)===JSON.stringify(fresh));
