import { readFileSync, writeFileSync, existsSync } from 'fs';
import { execSync } from 'child_process';
import Papa from 'papaparse';
import { parseCardEffects } from '../src/data/effectParser';
import { mergeManualEffects } from '../src/data/manualEffects';
import type { CardData } from '../src/types';

const FILES = ['effects_WX.json','effects_WXDi.json','effects_WX24_26.json','effects_WXK.json','effects_misc.json'];
const fileOf = new Map<string,string>(); const data: Record<string, any> = {};
for (const fn of FILES){ const j = JSON.parse(readFileSync(`public/data/${fn}`,'utf-8')); data[fn]=j; for(const k of Object.keys(j)) fileOf.set(k, fn); }
const rows: Record<string,string>[]=[];
for(let i=1;i<=11;i++){const p=`public/data/CardData_Sheet${i}.csv`; if(!existsSync(p))break; rows.push(...Papa.parse<Record<string,string>>(readFileSync(p,'utf-8').replace(/^﻿/,''),{header:true,skipEmptyLines:true}).data);}
const tk='public/data/CardData_TK.csv'; if(existsSync(tk)) rows.push(...Papa.parse<Record<string,string>>(readFileSync(tk,'utf-8').replace(/^﻿/,''),{header:true,skipEmptyLines:true}).data);
const rowOf=new Map(rows.filter(r=>r.CardNum).map(r=>[r.CardNum,r]));

function leafMap(o:any,pre='',out=new Map<string,any>()):Map<string,any>{ if(Array.isArray(o))o.forEach((v,i)=>leafMap(v,`${pre}[${i}]`,out)); else if(o&&typeof o==='object')for(const k of Object.keys(o))leafMap(o[k],`${pre}.${k}`,out); else out.set(pre,o); return out; }
// 既存 effect e に対し fresh f が「lost or changed leaf」を持つか（＝計器と同じ path ベース判定。キー順差は無視）
function effHeld(e:any,f:any):boolean{ if(!f)return true; const em=leafMap(e),fm=leafMap(f); for(const[p,v]of em){ if(!fm.has(p)||JSON.stringify(fm.get(p))!==JSON.stringify(v))return true; } return false; }
const apply = process.argv.includes('--apply');
const TARGETS = process.argv.slice(2).filter(a=>a!=='--apply');
const dirty=new Set<string>();
for(const id of TARGETS){
  const fn=fileOf.get(id); const r=rowOf.get(id);
  if(!fn||!r){console.log(`${id}: not found`);continue;}
  const eff=data[fn][id];
  const fresh=mergeManualEffects(id, parseCardEffects({...r,effects:[]} as unknown as CardData));
  const fmap=new Map(fresh.map((e:any)=>[e.effectId,e]));
  console.log(`\n===== ${id} (${fn}) =====`);
  console.log('TEXT:', [r.EffectText,r.BurstText].filter(x=>x&&x!=='-').join(' ║ '));
  for(const e of eff){
    const f=fmap.get(e.effectId);
    const differs = effHeld(e,f);
    if(differs && e.parseStatus!=='MANUAL'){
      console.log(`  -> ${e.effectId}: MANUAL化`);
      console.log(`       EXIST: ${JSON.stringify(e)}`);
      console.log(`       FRESH: ${JSON.stringify(f)}`);
      if(apply){ e.parseStatus='MANUAL'; dirty.add(fn); }
    } else console.log(`     ${e.effectId}: 一致/既MANUAL・据置`);
  }
}
if(apply){ for(const fn of dirty){ const out=JSON.stringify(data[fn]); JSON.parse(out); writeFileSync(`public/data/${fn}`,out); console.log(`\nwrote ${fn}`);} }
else console.log('\n(dry-run)');
