// parserWorklist の working-tree 版：HEAD ではなく作業ツリーの JSON と fresh(パーサー+manual) を比較。
// parser 修正の波及カードを事前に全数把握するための使い捨てスキャナ（続き20）。
import { readFileSync, existsSync } from 'fs';
import Papa from 'papaparse';
import { parseCardEffects } from '../src/data/effectParser';
import { mergeManualEffects } from '../src/data/manualEffects';
import type { CardData } from '../src/types';

const FILES = ['effects_WX.json','effects_WXDi.json','effects_WX24_26.json','effects_WXK.json','effects_misc.json'];
const PRESERVE = new Set(['MANUAL','PARTIAL']);
const existing = new Map<string, any[]>();
for (const f of FILES) { const j = JSON.parse(readFileSync(`public/data/${f}`,'utf-8')); for (const [k,v] of Object.entries(j)) existing.set(k, v as any[]); }
const rows: Record<string,string>[] = [];
for (let i=1;i<=11;i++){ const p=`public/data/CardData_Sheet${i}.csv`; if(!existsSync(p))break; const {data}=Papa.parse<Record<string,string>>(readFileSync(p,'utf-8').replace(/^﻿/,''),{header:true,skipEmptyLines:true}); rows.push(...data); }
const tk='public/data/CardData_TK.csv'; if(existsSync(tk)){const {data}=Papa.parse<Record<string,string>>(readFileSync(tk,'utf-8').replace(/^﻿/,''),{header:true,skipEmptyLines:true});rows.push(...data);}
const fresh = new Map<string, any[]>();
for (const r of rows){ if(!r.CardNum)continue; const eff=mergeManualEffects(r.CardNum, parseCardEffects({...r,effects:[]} as unknown as CardData)); if(eff.length) fresh.set(r.CardNum, eff); }

function leafMap(o:any,pre='',out=new Map<string,any>()):Map<string,any>{ if(Array.isArray(o))o.forEach((v,i)=>leafMap(v,`${pre}[${i}]`,out)); else if(o&&typeof o==='object')for(const k of Object.keys(o))leafMap(o[k],`${pre}.${k}`,out); else out.set(pre,o); return out; }
function isPureSuperset(e:any,f:any){ const em=leafMap(e),fm=leafMap(f); for(const[p,v]of em){if(!fm.has(p))return false;if(JSON.stringify(fm.get(p))!==JSON.stringify(v))return false;} return fm.size>em.size; }

let held=0; const ids:string[]=[];
for(const [id,e] of existing){
  const f=fresh.get(id); if(!f)continue;
  if(JSON.stringify(e)===JSON.stringify(f))continue;
  if(e.some((x:any)=>PRESERVE.has(x?.parseStatus)))continue;
  if(isPureSuperset(e,f))continue;
  held++; ids.push(id);
}
console.log('held(working tree):', held);
console.log(ids.join(' '));
