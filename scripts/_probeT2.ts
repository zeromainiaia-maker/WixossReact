import { readFileSync, existsSync } from 'fs';
import Papa from 'papaparse';
import { parseCardEffects } from '../src/data/effectParser';
import { mergeManualEffects } from '../src/data/manualEffects';
import type { CardData } from '../src/types';
const rows:any[]=[];
for(let i=1;i<=11;i++){const p=`public/data/CardData_Sheet${i}.csv`;if(!existsSync(p))break;const {data}=Papa.parse(readFileSync(p,'utf-8').replace(/^﻿/,''),{header:true,skipEmptyLines:true});rows.push(...data as any[]);}
const tk='public/data/CardData_TK.csv';if(existsSync(tk)){const {data}=Papa.parse(readFileSync(tk,'utf-8').replace(/^﻿/,''),{header:true,skipEmptyLines:true});rows.push(...data as any[]);}
const files:Record<string,string>={'WXDi-P11-040':'WXDi','WX25-P2-055':'WX24_26','WX25-CP1-060':'WX24_26'};
function leaves(o:any,pre='',out:Record<string,any>={}){if(Array.isArray(o))o.forEach((v,i)=>leaves(v,`${pre}[${i}]`,out));else if(o&&typeof o==='object')for(const k of Object.keys(o))leaves(o[k],`${pre}.${k}`,out);else out[pre]=o;return out;}
for(const [id,f] of Object.entries(files)){
  const r=rows.find(r=>r.CardNum===id);
  const fresh=mergeManualEffects(id, parseCardEffects({...r,effects:[]} as unknown as CardData));
  const exist=JSON.parse(readFileSync(`public/data/effects_${f}.json`,'utf-8'))[id];
  const le=leaves(exist),lf=leaves(fresh);
  const keys=new Set([...Object.keys(le),...Object.keys(lf)]);
  let diffs=0;
  for(const k of keys){if(JSON.stringify(le[k])!==JSON.stringify(lf[k])){console.log(`DIFF ${id} ${k} EXIST=${JSON.stringify(le[k])} FRESH=${JSON.stringify(lf[k])}`);diffs++;}}
  console.log(`${id}: ${diffs===0?'PARITY OK':diffs+' diffs'}`);
}
