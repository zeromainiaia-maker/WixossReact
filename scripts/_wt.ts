import { readFileSync, existsSync } from 'fs';
import Papa from 'papaparse';
import { parseCardEffects } from '../src/data/effectParser';
import { mergeManualEffects } from '../src/data/manualEffects';
import type { CardData } from '../src/types';
const FILES=['effects_WX.json','effects_WXDi.json','effects_WX24_26.json','effects_WXK.json','effects_misc.json'];
const PRESERVE=new Set(['MANUAL','PARTIAL']);
const existing=new Map<string,any[]>();
for(const f of FILES){const j=JSON.parse(readFileSync(`public/data/${f}`,'utf-8'));for(const[k,v]of Object.entries(j))existing.set(k,v as any[]);}
const rows:any[]=[];for(let i=1;i<=11;i++){const p=`public/data/CardData_Sheet${i}.csv`;if(!existsSync(p))break;const{data}=Papa.parse(readFileSync(p,'utf-8').replace(/^﻿/,''),{header:true,skipEmptyLines:true});rows.push(...data as any[]);}
const tk='public/data/CardData_TK.csv';if(existsSync(tk)){const{data}=Papa.parse(readFileSync(tk,'utf-8').replace(/^﻿/,''),{header:true,skipEmptyLines:true});rows.push(...data as any[]);}
const fresh=new Map<string,any[]>();for(const r of rows){if(!r.CardNum)continue;const e=mergeManualEffects(r.CardNum,parseCardEffects({...r,effects:[]} as unknown as CardData));if(e.length)fresh.set(r.CardNum,e);}
function lm(o:any,p='',out=new Map<string,any>()):Map<string,any>{if(Array.isArray(o))o.forEach((v,i)=>lm(v,`${p}[${i}]`,out));else if(o&&typeof o==='object')for(const k of Object.keys(o))lm(o[k],`${p}.${k}`,out);else out.set(p,o);return out;}
function sup(e:any,f:any){const em=lm(e),fm=lm(f);for(const[p,v]of em){if(!fm.has(p))return false;if(JSON.stringify(fm.get(p))!==JSON.stringify(v))return false;}return fm.size>em.size;}
let loss=0,val=0,add=0;const vi:string[]=[],li:string[]=[];
for(const[id,e]of existing){const f=fresh.get(id);if(!f)continue;if(JSON.stringify(e)===JSON.stringify(f))continue;if(e.some((x:any)=>PRESERVE.has(x?.parseStatus)))continue;if(sup(e,f))continue;const em=lm(e),fm=lm(f);let lo=0,ch=0;for(const[p,v]of em){if(!fm.has(p))lo++;else if(JSON.stringify(fm.get(p))!==JSON.stringify(v))ch++;}if(lo){loss++;li.push(id);}else if(ch){val++;vi.push(id);}else add++;}
console.log(`WORKTREE LOSS:${loss} VALUE:${val} ADD:${add}`);console.log('VALUE:',vi.join(', '));if(li.length)console.log('LOSS:',li.join(', '));
