import { readFileSync, existsSync } from 'fs';
import Papa from 'papaparse';
import { parseCardEffects } from '../src/data/effectParser';
import { mergeManualEffects } from '../src/data/manualEffects';
import type { CardData } from '../src/types';
const rows:any[]=[];
for(let i=1;i<=11;i++){const p=`public/data/CardData_Sheet${i}.csv`;if(!existsSync(p))break;const {data}=Papa.parse(readFileSync(p,'utf-8').replace(/^﻿/,''),{header:true,skipEmptyLines:true});rows.push(...data as any[]);}
const tk='public/data/CardData_TK.csv';if(existsSync(tk)){const {data}=Papa.parse(readFileSync(tk,'utf-8').replace(/^﻿/,''),{header:true,skipEmptyLines:true});rows.push(...data as any[]);}
// cascade check: 「下からカード...移動したとき」
const re=/下から[^。]{0,8}移動したとき/;
console.log('CASCADE:', rows.filter(r=>re.test(r.EffectText??'')).map(r=>r.CardNum).join(', '));
const r=rows.find(r=>r.CardNum==='WXDi-P04-042');
console.log('TEXT:', r?.EffectText?.slice(0,150));
const fresh=mergeManualEffects('WXDi-P04-042', parseCardEffects({...r,effects:[]} as unknown as CardData));
fresh.forEach((e:any,i:number)=>console.log(`[${i}] ${e.effectId} timing=${JSON.stringify(e.timing)} scope=${e.triggerScope}`));
const files=['WX','WXDi','WX24_26','WXK','misc'];let ff='';for(const f of files){const j=JSON.parse(readFileSync(`public/data/effects_${f}.json`,'utf-8'));if(j['WXDi-P04-042']){ff=f;break;}}
console.log('in effects_'+ff+'.json');
const exist=JSON.parse(readFileSync(`public/data/effects_${ff}.json`,'utf-8'))['WXDi-P04-042'];
function lv(o:any,p='',out:Record<string,any>={}){if(Array.isArray(o))o.forEach((v,i)=>lv(v,`${p}[${i}]`,out));else if(o&&typeof o==='object')for(const k of Object.keys(o))lv(o[k],`${p}.${k}`,out);else out[p]=o;return out;}
const le=lv(exist),lf=lv(fresh);for(const k of new Set([...Object.keys(le),...Object.keys(lf)]))if(JSON.stringify(le[k])!==JSON.stringify(lf[k]))console.log(`DIFF ${k} EXIST=${JSON.stringify(le[k])} FRESH=${JSON.stringify(lf[k])}`);
