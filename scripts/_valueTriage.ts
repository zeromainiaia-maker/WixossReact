/**
 * VALUE トラック（EXIST と FRESH で同キー値違い・leaf 喪失なし）の変更リーフを詳細出力する診断。
 * 実行: npx tsx scripts/_valueTriage.ts [bucketフィルタ]
 *   例: npx tsx scripts/_valueTriage.ts owner   → owner バケツのみ
 *   bucket未指定なら全VALUEをバケツ順に出力。
 * EXIST は git show HEAD（計器と同じ）。FRESH は parser+mergeManual。
 */
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
const rowOf = new Map(rows.filter(r=>r.CardNum).map(r=>[r.CardNum,r]));
const fresh = new Map<string, any[]>();
for (const r of rows){ if(!r.CardNum)continue; const eff=mergeManualEffects(r.CardNum, parseCardEffects({...r,effects:[]} as unknown as CardData)); if(eff.length) fresh.set(r.CardNum, eff); }

function leafMap(o:any,pre='',out=new Map<string,any>()):Map<string,any>{ if(Array.isArray(o))o.forEach((v,i)=>leafMap(v,`${pre}[${i}]`,out)); else if(o&&typeof o==='object')for(const k of Object.keys(o))leafMap(o[k],`${pre}.${k}`,out); else out.set(pre,o); return out; }
function isPureSuperset(e:any,f:any){ const em=leafMap(e),fm=leafMap(f); for(const[p,v]of em){if(!fm.has(p))return false;if(JSON.stringify(fm.get(p))!==JSON.stringify(v))return false;} return fm.size>em.size; }
function lossCat(path:string):string{
  if(/\.timing\b/.test(path)) return 'timing';
  if(/\.effectType\b/.test(path)) return 'effectType';
  if(/\.triggerCondition|\.triggerScope|\.triggerFilter/.test(path)) return 'triggerCond';
  if(/\.activeCondition/.test(path)) return 'activeCondition';
  if(/\.action\.type\b|\.steps\[\d+\]\.type\b|\.then\.type\b/.test(path)) return 'action.type';
  if(/filter\.cardType/.test(path)) return 'filter.cardType';
  if(/filter\.story/.test(path)) return 'filter.story';
  if(/filter\.color/.test(path)) return 'filter.color';
  if(/\.filter\b|\.filter\./.test(path)) return 'filter(other)';
  if(/\.upToCount\b/.test(path)) return 'upToCount';
  if(/\.duration\b/.test(path)) return 'duration';
  if(/\.count\b/.test(path)) return 'count';
  if(/\.optional\b|\.mandatory\b/.test(path)) return 'optional/mandatory';
  if(/\.then\b|\.then\.|\.steps/.test(path)) return 'then/steps';
  if(/\.cost\b|\.cost\./.test(path)) return 'cost';
  if(/owner/.test(path)) return 'owner';
  return 'other:'+path.replace(/\[\d+\]/g,'[]');
}
const PRIORITY=['timing','effectType','triggerCond','activeCondition','action.type','filter.cardType','filter.story','filter.color','filter(other)','upToCount','duration','count','optional/mandatory','then/steps','cost','owner'];
const bucketFilter = process.argv[2];

type V={id:string;bucket:string;changed:{p:string;e:any;f:any}[]};
const vals:V[]=[];
for(const [id,e] of existing){
  const f=fresh.get(id); if(!f)continue;
  if(JSON.stringify(e)===JSON.stringify(f))continue;
  if(e.some((x:any)=>PRESERVE.has(x?.parseStatus)))continue;
  if(isPureSuperset(e,f))continue;
  const em=leafMap(e),fm=leafMap(f);
  const lost:string[]=[],changed:{p:string;e:any;f:any}[]=[];
  for(const[p,v]of em){ if(!fm.has(p))lost.push(p); else if(JSON.stringify(fm.get(p))!==JSON.stringify(v))changed.push({p,e:v,f:fm.get(p)}); }
  if(lost.length)continue; // LOSS は対象外
  if(!changed.length)continue;
  const cats=new Set(changed.map(c=>lossCat(c.p)));
  const primary=PRIORITY.find(c=>cats.has(c)) ?? [...cats][0];
  vals.push({id,bucket:primary,changed});
}
const byBucket=new Map<string,V[]>();
for(const v of vals){ if(!byBucket.has(v.bucket))byBucket.set(v.bucket,[]); byBucket.get(v.bucket)!.push(v); }
const order=[...byBucket.entries()].sort((a,b)=>b[1].length-a[1].length);
for(const [b,list] of order){
  if(bucketFilter && b!==bucketFilter)continue;
  console.log(`\n########## BUCKET: ${b}  (${list.length}枚) ##########`);
  for(const v of list){
    const r=rowOf.get(v.id);
    console.log(`\n--- ${v.id} ---`);
    if(r) console.log(`  TEXT: ${[r.EffectText,r.BurstText].filter(x=>x&&x!=='-').join(' ║ ').slice(0,300)}`);
    for(const c of v.changed) console.log(`  [${c.p}]  EXIST=${JSON.stringify(c.e)}  FRESH=${JSON.stringify(c.f)}`);
  }
}
if(!bucketFilter) console.log(`\n\n=== bucket一覧 ===`);
for(const [b,list] of order) if(!bucketFilter) console.log(`${String(list.length).padStart(3)}  ${b}`);
