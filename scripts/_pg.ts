import { readFileSync, existsSync } from 'fs';
import Papa from 'papaparse';
import { parseCardEffects } from '../src/data/effectParser';
import { mergeManualEffects } from '../src/data/manualEffects';
import type { CardData } from '../src/types';
const rows:any[]=[];
for(let i=1;i<=11;i++){const p=`public/data/CardData_Sheet${i}.csv`;if(!existsSync(p))break;const {data}=Papa.parse(readFileSync(p,'utf-8').replace(/^﻿/,''),{header:true,skipEmptyLines:true});rows.push(...data as any[]);}
const tk='public/data/CardData_TK.csv';if(existsSync(tk)){const {data}=Papa.parse(readFileSync(tk,'utf-8').replace(/^﻿/,''),{header:true,skipEmptyLines:true});rows.push(...data as any[]);}
const re=/ルリグ.{0,8}グロウしたとき/;
const hits=rows.filter(r=>re.test(r.EffectText??'')).map(r=>r.CardNum);
const files=['WX','WXDi','WX24_26','WXK','misc'];
function fileOf(id:string){for(const f of files){const j=JSON.parse(readFileSync(`public/data/effects_${f}.json`,'utf-8'));if(j[id])return f;}return '';}
function lv(o:any,p='',out:Record<string,any>={}){if(Array.isArray(o))o.forEach((v,i)=>lv(v,`${p}[${i}]`,out));else if(o&&typeof o==='object')for(const k of Object.keys(o))lv(o[k],`${p}.${k}`,out);else out[p]=o;return out;}
for(const id of hits){
  const r=rows.find(r=>r.CardNum===id);
  // 各「グロウしたとき」の前後を抜き出す
  const m=(r.EffectText??'').match(/.{0,16}ルリグ.{0,8}グロウしたとき/g);
  const fresh=mergeManualEffects(id, parseCardEffects({...r,effects:[]} as unknown as CardData));
  const ff=fileOf(id); const exist=ff?JSON.parse(readFileSync(`public/data/effects_${ff}.json`,'utf-8'))[id]:null;
  let diffs='';
  if(exist){const le=lv(exist),lf=lv(fresh);const ds:string[]=[];for(const k of new Set([...Object.keys(le),...Object.keys(lf)]))if(JSON.stringify(le[k])!==JSON.stringify(lf[k]))ds.push(`${k}:${JSON.stringify(le[k])}→${JSON.stringify(lf[k])}`);diffs=ds.join(' | ');}
  console.log(`\n${id} (${ff}) phrases=${JSON.stringify(m)}`);
  fresh.forEach((e:any,i:number)=>console.log(`  [${i}] ${e.effectId} ${e.effectType} timing=${JSON.stringify(e.timing)}`));
  if(diffs)console.log('  DIFFS:',diffs);
}
