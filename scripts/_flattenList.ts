/** timing VALUE バケツの flatten 候補を、原文テキスト＋EXIST/FRESH timing で一覧 */
import { readFileSync, existsSync } from 'fs';
import { execSync } from 'child_process';
import Papa from 'papaparse';
import { parseCardEffects } from '../src/data/effectParser';
import { mergeManualEffects } from '../src/data/manualEffects';
import type { CardData } from '../src/types';

const FILES = ['effects_WX.json','effects_WXDi.json','effects_WX24_26.json','effects_WXK.json','effects_misc.json'];
const PRESERVE = new Set(['MANUAL','PARTIAL']);
const existing = new Map<string, any[]>();
for (const f of FILES) { const j = JSON.parse(execSync(`git show HEAD:public/data/${f}`,{maxBuffer:1e9}).toString()); for (const [k,v] of Object.entries(j)) existing.set(k, v as any[]); }
const rows: Record<string,string>[] = [];
for (let i=1;i<=11;i++){ const p=`public/data/CardData_Sheet${i}.csv`; if(!existsSync(p))break; const {data}=Papa.parse<Record<string,string>>(readFileSync(p,'utf-8').replace(/^﻿/,''),{header:true,skipEmptyLines:true}); rows.push(...data); }
const tk='public/data/CardData_TK.csv'; if(existsSync(tk)){const {data}=Papa.parse<Record<string,string>>(readFileSync(tk,'utf-8').replace(/^﻿/,''),{header:true,skipEmptyLines:true});rows.push(...data);}
const rowMap = new Map<string, Record<string,string>>();
const fresh = new Map<string, any[]>();
for (const r of rows){ if(!r.CardNum)continue; rowMap.set(r.CardNum, r); const eff=mergeManualEffects(r.CardNum, parseCardEffects({...r,effects:[]} as unknown as CardData)); if(eff.length) fresh.set(r.CardNum, eff); }

function leafMap(o:any,pre='',out=new Map<string,any>()):Map<string,any>{ if(Array.isArray(o))o.forEach((v,i)=>leafMap(v,`${pre}[${i}]`,out)); else if(o&&typeof o==='object')for(const k of Object.keys(o))leafMap(o[k],`${pre}.${k}`,out); else out.set(pre,o); return out; }
function isPureSuperset(e:any,f:any){ const em=leafMap(e),fm=leafMap(f); for(const[p,v]of em){if(!fm.has(p))return false;if(JSON.stringify(fm.get(p))!==JSON.stringify(v))return false;} return fm.size>em.size; }

const filter = process.argv[2] ? new RegExp(process.argv[2]) : null;
let count = 0;
for(const [id,e] of existing){
  const f=fresh.get(id); if(!f)continue;
  if(JSON.stringify(e)===JSON.stringify(f))continue;
  if(e.some(x=>PRESERVE.has(x?.parseStatus)))continue;
  if(isPureSuperset(e,f))continue;
  const em=leafMap(e),fm=leafMap(f);
  const lost:string[]=[],changed:string[]=[];
  for(const[p,v]of em){ if(!fm.has(p))lost.push(p); else if(JSON.stringify(fm.get(p))!==JSON.stringify(v))changed.push(p); }
  if(lost.length) continue; // LOSSはスキップ
  if(!changed.length) continue;
  if(!changed.some(p=>/\.timing\b/.test(p))) continue; // timing変更のみ
  const r = rowMap.get(id)!;
  const text = ((r.EffectText||'') + ' 〔LB〕' + (r.BurstText||'')) as string;
  if(filter && !filter.test(text) && !filter.test(id)) continue;
  count++;
  const timingChanges = changed.filter(p=>/\.timing\b/.test(p));
  console.log(`\n=== ${id} (${r.CardName||''}) ===`);
  for(const p of timingChanges){ console.log(`  ${p}: EXIST=${JSON.stringify(em.get(p))} FRESH=${JSON.stringify(fm.get(p))}`); }
  console.log(`  原文: ${text.replace(/\r?\n/g,' / ').slice(0,300)}`);
}
console.log(`\n--- ${count}枚 ---`);
