import { readFileSync, existsSync } from 'fs';
import Papa from 'papaparse';
import { parseCardEffects } from '../src/data/effectParser';
import { mergeManualEffects } from '../src/data/manualEffects';
import type { CardData } from '../src/types';
const rows:any[]=[];
for(let i=1;i<=11;i++){const p=`public/data/CardData_Sheet${i}.csv`;if(!existsSync(p))break;const {data}=Papa.parse(readFileSync(p,'utf-8').replace(/^﻿/,''),{header:true,skipEmptyLines:true});rows.push(...data as any[]);}
const tk='public/data/CardData_TK.csv';if(existsSync(tk)){const {data}=Papa.parse(readFileSync(tk,'utf-8').replace(/^﻿/,''),{header:true,skipEmptyLines:true});rows.push(...data as any[]);}
// cascade: 他のルリグがグロウしたとき を含むカード
const re=/ルリグ.{0,6}グロウしたとき/;
const hits=rows.filter(r=>re.test(r.EffectText??'')).map(r=>r.CardNum);
console.log('CASCADE candidates (ルリグ...グロウしたとき):', hits.join(', '));
const r=rows.find(r=>r.CardNum==='WXDi-P05-010');
const eff=mergeManualEffects('WXDi-P05-010', parseCardEffects({...r,effects:[]} as unknown as CardData));
eff.forEach((e:any,i:number)=>console.log(`[${i}] ${e.effectId} type=${e.effectType} timing=${JSON.stringify(e.timing)} scope=${e.triggerScope} cond=${JSON.stringify(e.triggerCondition)} filter=${JSON.stringify(e.triggerFilter)}`));
