// 作業ツリー（git show HEAD ではなく現ファイル）基準で LOSS/VALUE を集計する診断。
import { readFileSync, existsSync } from 'fs';
import Papa from 'papaparse';
import { parseCardEffects } from '../src/data/effectParser';
import { mergeManualEffects } from '../src/data/manualEffects';
import type { CardData } from '../src/types';
const FILES = ['effects_WX.json','effects_WXDi.json','effects_WX24_26.json','effects_WXK.json','effects_misc.json'];
const PRESERVE = new Set(['MANUAL','PARTIAL']);
const existing = new Map<string, any[]>();
for (const f of FILES){ const j=JSON.parse(readFileSync(`public/data/${f}`,'utf-8')); for(const [k,v] of Object.entries(j)) existing.set(k, v as any[]); }
const rows:any[]=[];
for(let i=1;i<=11;i++){const p=`public/data/CardData_Sheet${i}.csv`;if(!existsSync(p))break;const {data}=Papa.parse(readFileSync(p,'utf-8').replace(/^﻿/,''),{header:true,skipEmptyLines:true});rows.push(...data as any[]);}
const tk='public/data/CardData_TK.csv';if(existsSync(tk)){const {data}=Papa.parse(readFileSync(tk,'utf-8').replace(/^﻿/,''),{header:true,skipEmptyLines:true});rows.push(...data as any[]);}
const fresh=new Map<string,any[]>();
for(const r of rows){if(!r.CardNum)continue;const eff=mergeManualEffects(r.CardNum, parseCardEffects({...r,effects:[]} as unknown as CardData));if(eff.length)fresh.set(r.CardNum,eff);}
function leafMap(o:any,pre='',out=new Map<string,any>()):Map<string,any>{if(Array.isArray(o))o.forEach((v,i)=>leafMap(v,`${pre}[${i}]`,out));else if(o&&typeof o==='object')for(const k of Object.keys(o))leafMap(o[k],`${pre}.${k}`,out);else out.set(pre,o);return out;}
function isPureSuperset(e:any,f:any){const em=leafMap(e),fm=leafMap(f);for(const[p,v]of em){if(!fm.has(p))return false;if(JSON.stringify(fm.get(p))!==JSON.stringify(v))return false;}return fm.size>em.size;}
let loss=0,val=0,add=0; const lossIds:string[]=[],valIds:string[]=[];
for(const [id,e] of existing){
  const f=fresh.get(id); if(!f)continue;
  if(JSON.stringify(e)===JSON.stringify(f))continue;
  if(e.some((x:any)=>PRESERVE.has(x?.parseStatus)))continue;
  if(isPureSuperset(e,f))continue;
  const em=leafMap(e),fm=leafMap(f);
  let lost=0,changed=0;
  for(const[p,v]of em){if(!fm.has(p))lost++;else if(JSON.stringify(fm.get(p))!==JSON.stringify(v))changed++;}
  if(lost){loss++;lossIds.push(id);} else if(changed){val++;valIds.push(id);} else add++;
}
console.log(`WORKTREE  LOSS:${loss}  VALUE:${val}  ADD/OTHER:${add}`);
console.log('LOSS ids:', lossIds.join(', '));
console.log('VALUE ids:', valIds.join(', '));
