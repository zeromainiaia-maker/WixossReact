import { readFileSync, existsSync } from 'fs';
import Papa from 'papaparse';
import { parseCardEffects } from '../src/data/effectParser';
import { mergeManualEffects } from '../src/data/manualEffects';
import type { CardData } from '../src/types';
const rows:any[]=[];
for(let i=1;i<=11;i++){const p=`public/data/CardData_Sheet${i}.csv`;if(!existsSync(p))break;const {data}=Papa.parse(readFileSync(p,'utf-8').replace(/^﻿/,''),{header:true,skipEmptyLines:true});rows.push(...data as any[]);}
const tk='public/data/CardData_TK.csv';if(existsSync(tk)){const {data}=Papa.parse(readFileSync(tk,'utf-8').replace(/^﻿/,''),{header:true,skipEmptyLines:true});rows.push(...data as any[]);}
const re=/《コイン[^》]*》を[^。]{0,8}支払ったとき/;
const hits=rows.filter(r=>re.test(r.EffectText??'')).map(r=>r.CardNum);
console.log('CASCADE:', hits.join(', '));
const files=['WX','WXDi','WX24_26','WXK','misc'];
function fileOf(id:string){for(const f of files){const j=JSON.parse(readFileSync(`public/data/effects_${f}.json`,'utf-8'));if(j[id])return f;}return '';}
function lv(o:any,p='',out:Record<string,any>={}){if(Array.isArray(o))o.forEach((v,i)=>lv(v,`${p}[${i}]`,out));else if(o&&typeof o==='object')for(const k of Object.keys(o))lv(o[k],`${p}.${k}`,out);else out[p]=o;return out;}
for(const id of hits){
  const r=rows.find(r=>r.CardNum===id);
  const m=(r.EffectText??'').match(/.{0,12}《コイン[^》]*》を[^。]{0,8}支払ったとき/g);
  const fresh=mergeManualEffects(id, parseCardEffects({...r,effects:[]} as unknown as CardData));
  const ff=fileOf(id); const exist=ff?JSON.parse(readFileSync(`public/data/effects_${ff}.json`,'utf-8'))[id]:null;
  console.log(`\n== ${id} (${ff}) phrase=${JSON.stringify(m)} ==`);
  fresh.forEach((e:any,i:number)=>console.log(`  [${i}] ${e.effectId} ${e.effectType} timing=${JSON.stringify(e.timing)} scope=${e.triggerScope}`));
  if(exist){const le=lv(exist),lf=lv(fresh);for(const k of new Set([...Object.keys(le),...Object.keys(lf)]))if(JSON.stringify(le[k])!==JSON.stringify(lf[k]))console.log(`  DIFF ${k} EXIST=${JSON.stringify(le[k])} FRESH=${JSON.stringify(lf[k])}`);}
}
