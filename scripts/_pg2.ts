import { readFileSync, existsSync } from 'fs';
import Papa from 'papaparse';
import { parseCardEffects } from '../src/data/effectParser';
import { mergeManualEffects } from '../src/data/manualEffects';
import type { CardData } from '../src/types';
const rows:any[]=[];
for(let i=1;i<=11;i++){const p=`public/data/CardData_Sheet${i}.csv`;if(!existsSync(p))break;const {data}=Papa.parse(readFileSync(p,'utf-8').replace(/^﻿/,''),{header:true,skipEmptyLines:true});rows.push(...data as any[]);}
const tk='public/data/CardData_TK.csv';if(existsSync(tk)){const {data}=Papa.parse(readFileSync(tk,'utf-8').replace(/^﻿/,''),{header:true,skipEmptyLines:true});rows.push(...data as any[]);}
const files=['WX','WXDi','WX24_26','WXK','misc'];
function fileOf(id:string){for(const f of files){const j=JSON.parse(readFileSync(`public/data/effects_${f}.json`,'utf-8'));if(j[id])return f;}return '';}
// find all effects (incl nested abilities) whose FRESH timing === ON_LRIG_GROW
function findGrow(e:any,path:string,out:any[]){ if(Array.isArray(e?.timing)&&e.timing[0]==='ON_LRIG_GROW') out.push({effectId:e.effectId,path,scope:e.triggerScope,filter:e.triggerFilter});
  // nested granted abilities
  const ab=e?.action?.abilities; if(Array.isArray(ab))ab.forEach((a:any,i:number)=>findGrow(a,`${path}.abilities[${i}]`,out)); }
for(const r of rows){ if(!r.CardNum)continue;
  const fresh=mergeManualEffects(r.CardNum, parseCardEffects({...r,effects:[]} as unknown as CardData));
  const out:any[]=[]; fresh.forEach((e:any,i:number)=>findGrow(e,`[${i}]`,out));
  if(out.length){ const ff=fileOf(r.CardNum); console.log(`${r.CardNum} (${ff}): ${out.map(o=>`${o.effectId}[${o.path}] scope=${o.scope} filter=${JSON.stringify(o.filter)}`).join(' ; ')}`); }
}
