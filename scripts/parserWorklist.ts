/**
 * パーサー修正の「有限ワークリスト」を生成する計器。
 * held（parser≠curated-JSON）を重複なく1カード=1プライマリバケツに分割し、
 *   - LOSS（既存JSONが持つ構造をparserが出せない＝真の弱点・直す対象）
 *   - VALUE（同キーで値違い＝慣例/1件ずつ判断・bulk禁止）
 *   - ADD/その他
 * に振り分けてランク表＋カードIDを出力する。
 * 実行: npx tsx scripts/parserWorklist.ts
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
const fresh = new Map<string, any[]>();
for (const r of rows){ if(!r.CardNum)continue; const eff=mergeManualEffects(r.CardNum, parseCardEffects({...r,effects:[]} as unknown as CardData)); if(eff.length) fresh.set(r.CardNum, eff); }

function leafMap(o:any,pre='',out=new Map<string,any>()):Map<string,any>{ if(Array.isArray(o))o.forEach((v,i)=>leafMap(v,`${pre}[${i}]`,out)); else if(o&&typeof o==='object')for(const k of Object.keys(o))leafMap(o[k],`${pre}.${k}`,out); else out.set(pre,o); return out; }
function isPureSuperset(e:any,f:any){ const em=leafMap(e),fm=leafMap(f); for(const[p,v]of em){if(!fm.has(p))return false;if(JSON.stringify(fm.get(p))!==JSON.stringify(v))return false;} return fm.size>em.size; }

// LOSSカテゴリ（直す対象）の優先順＝根に近い/影響大きい順
function lossCat(path:string):string{
  if(/\.timing\b/.test(path)) return 'timing（トリガー種別の取りこぼし）';
  if(/\.effectType\b/.test(path)) return 'effectType';
  if(/\.triggerCondition|\.triggerScope|\.triggerFilter/.test(path)) return 'triggerCondition/Scope/Filter';
  if(/\.activeCondition/.test(path)) return 'activeCondition';
  if(/\.action\.type\b|\.steps\[\d+\]\.type\b|\.then\.type\b/.test(path)) return 'action.type（アクション種別）';
  if(/filter\.cardType/.test(path)) return 'filter.cardType';
  if(/filter\.story/.test(path)) return 'filter.story';
  if(/filter\.color/.test(path)) return 'filter.color';
  if(/\.filter\b|\.filter\./.test(path)) return 'filter（その他）';
  if(/\.upToCount\b/.test(path)) return 'upToCount';
  if(/\.duration\b/.test(path)) return 'duration';
  if(/\.count\b/.test(path)) return 'count';
  if(/\.optional\b|\.mandatory\b/.test(path)) return 'optional/mandatory';
  if(/\.then\b|\.then\.|\.steps/.test(path)) return 'then/steps（後続処理の欠落）';
  if(/\.cost\b|\.cost\./.test(path)) return 'cost';
  if(/owner/.test(path)) return 'owner';
  return 'その他: '+path.replace(/\[\d+\]/g,'[]');
}
const LOSS_PRIORITY=['timing（トリガー種別の取りこぼし）','effectType','triggerCondition/Scope/Filter','activeCondition','action.type（アクション種別）','filter.cardType','filter.story','filter.color','filter（その他）','upToCount','duration','count','optional/mandatory','then/steps（後続処理の欠落）','cost','owner'];

type Rec={id:string;track:'LOSS'|'VALUE'|'ADD/OTHER';bucket:string};
const recs:Rec[]=[];
for(const [id,e] of existing){
  const f=fresh.get(id); if(!f)continue;
  if(JSON.stringify(e)===JSON.stringify(f))continue;
  if(e.some(x=>PRESERVE.has(x?.parseStatus)))continue;
  if(isPureSuperset(e,f))continue;
  const em=leafMap(e),fm=leafMap(f);
  const lost:string[]=[],changed:string[]=[];
  for(const[p,v]of em){ if(!fm.has(p))lost.push(p); else if(JSON.stringify(fm.get(p))!==JSON.stringify(v))changed.push(p); }
  if(lost.length){
    const cats=new Set(lost.map(lossCat));
    const primary=LOSS_PRIORITY.find(c=>cats.has(c)) ?? [...cats][0];
    recs.push({id,track:'LOSS',bucket:primary});
  } else if(changed.length){
    // value-change track: bucket by changed leaf category
    const cats=new Set(changed.map(lossCat));
    const primary=LOSS_PRIORITY.find(c=>cats.has(c)) ?? [...cats][0];
    recs.push({id,track:'VALUE',bucket:primary});
  } else {
    recs.push({id,track:'ADD/OTHER',bucket:'parser追加のみ'});
  }
}

function tally(track:string){
  const m=new Map<string,string[]>();
  for(const r of recs.filter(r=>r.track===track)){ if(!m.has(r.bucket))m.set(r.bucket,[]); m.get(r.bucket)!.push(r.id); }
  return [...m.entries()].sort((a,b)=>b[1].length-a[1].length);
}
const lossN=recs.filter(r=>r.track==='LOSS').length;
const valN=recs.filter(r=>r.track==='VALUE').length;
const addN=recs.filter(r=>r.track==='ADD/OTHER').length;
console.log(`held合計: ${recs.length}  ｜ LOSS(直す対象): ${lossN}  VALUE(値変更=慣例判断): ${valN}  ADD/OTHER: ${addN}\n`);
console.log('=== ① LOSS（真のパーサー弱点・有限ワークリスト・1カード1バケツ） ===');
for(const [b,ids] of tally('LOSS')) console.log(`${String(ids.length).padStart(3)}  ${b}\n       ${ids.slice(0,12).join(', ')}${ids.length>12?` …+${ids.length-12}`:''}`);
console.log('\n=== ② VALUE（値変更＝1件ずつ/慣例判断・bulk禁止） ===');
for(const [b,ids] of tally('VALUE')) console.log(`${String(ids.length).padStart(3)}  ${b}   ${ids.slice(0,6).join(', ')}${ids.length>6?' …':''}`);
console.log('\n=== ③ ADD/OTHER ===');
for(const [b,ids] of tally('ADD/OTHER')) console.log(`${String(ids.length).padStart(3)}  ${b}   ${ids.slice(0,6).join(', ')}`);
