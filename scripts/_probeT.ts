import { readFileSync, existsSync } from 'fs';
import Papa from 'papaparse';
import { parseCardEffects } from '../src/data/effectParser';
import { mergeManualEffects } from '../src/data/manualEffects';
import type { CardData } from '../src/types';
const rows:any[]=[];
for(let i=1;i<=11;i++){const p=`public/data/CardData_Sheet${i}.csv`;if(!existsSync(p))break;const {data}=Papa.parse(readFileSync(p,'utf-8').replace(/^﻿/,''),{header:true,skipEmptyLines:true});rows.push(...data as any[]);}
const tk='public/data/CardData_TK.csv';if(existsSync(tk)){const {data}=Papa.parse(readFileSync(tk,'utf-8').replace(/^﻿/,''),{header:true,skipEmptyLines:true});rows.push(...data as any[]);}
for(const id of ['WXDi-P11-040','WX25-P2-055','WX25-CP1-060']){
  const r=rows.find(r=>r.CardNum===id);
  console.log('\n==== '+id+' ====');
  console.log('TEXT:', r?.EffectText);
  const eff=mergeManualEffects(id, parseCardEffects({...r,effects:[]} as unknown as CardData));
  eff.forEach((e:any,i:number)=>console.log(`  [${i}] type=${e.effectType} timing=${JSON.stringify(e.timing)} scope=${e.triggerScope} cond=${JSON.stringify(e.triggerCondition)}`));
}
