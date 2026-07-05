import { readFileSync, writeFileSync, existsSync } from 'fs';
import Papa from 'papaparse';
import { parseCardEffects } from '../src/data/effectParser';
import { mergeManualEffects } from '../src/data/manualEffects';
import type { CardData } from '../src/types';
const fn='public/data/effects_WXDi.json';
const data=JSON.parse(readFileSync(fn,'utf-8'));
const rows:Record<string,string>[]=[];
for(let i=1;i<=11;i++){const p=`public/data/CardData_Sheet${i}.csv`; if(!existsSync(p))break; rows.push(...Papa.parse<Record<string,string>>(readFileSync(p,'utf-8').replace(/^﻿/,''),{header:true,skipEmptyLines:true}).data);}
const r=rows.find(x=>x.CardNum==='WXDi-P14-077')!;
const fresh=mergeManualEffects('WXDi-P14-077', parseCardEffects({...r,effects:[]} as unknown as CardData));
const fmap=new Map(fresh.map((e:any)=>[e.effectId,e]));
const eff=data['WXDi-P14-077'];
for(let i=0;i<eff.length;i++){
  if(eff[i].effectId==='WXDi-P14-077-E1'){ eff[i]=fmap.get('WXDi-P14-077-E1'); console.log('E1 -> FRESH 採用:', JSON.stringify(eff[i])); }
  else if(eff[i].effectId==='WXDi-P14-077-E2'){ eff[i].parseStatus='MANUAL'; console.log('E2 -> MANUAL化'); }
}
const out=JSON.stringify(data); JSON.parse(out); writeFileSync(fn,out); console.log('wrote',fn);
