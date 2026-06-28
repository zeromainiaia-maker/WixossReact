import { readFileSync, writeFileSync, existsSync } from 'fs';
import Papa from 'papaparse';
import { parseCardEffects } from '../src/data/effectParser';
import { mergeManualEffects } from '../src/data/manualEffects';
import type { CardData } from '../src/types';
const FILES=['effects_WX.json','effects_WXDi.json','effects_WX24_26.json','effects_WXK.json','effects_misc.json'];
const rows:any[]=[];for(let i=1;i<=11;i++){const p=`public/data/CardData_Sheet${i}.csv`;if(!existsSync(p))break;const{data}=Papa.parse(readFileSync(p,'utf-8').replace(/^﻿/,''),{header:true,skipEmptyLines:true});rows.push(...data as any[]);}
const tk='public/data/CardData_TK.csv';if(existsSync(tk)){const{data}=Papa.parse(readFileSync(tk,'utf-8').replace(/^﻿/,''),{header:true,skipEmptyLines:true});rows.push(...data as any[]);}
// FRESH ON_LRIG_GROW 効果の scope/filter を集める（effectId -> {scope,filter}）
const grow=new Map<string,{scope:any,filter:any}>();
for(const r of rows){if(!r.CardNum)continue;const eff=mergeManualEffects(r.CardNum,parseCardEffects({...r,effects:[]} as unknown as CardData));
  for(const e of eff){if(Array.isArray(e.timing)&&e.timing[0]==='ON_LRIG_GROW')grow.set(e.effectId,{scope:e.triggerScope,filter:(e as any).triggerFilter});}}
let n=0;
for(const f of FILES){const p=`public/data/${f}`;const raw=readFileSync(p,'utf-8');const j=JSON.parse(raw);let ch=false;
  for(const[,effs]of Object.entries(j) as any){for(const e of effs as any[]){
    if(grow.has(e.effectId)){const g=grow.get(e.effectId)!;
      if(JSON.stringify(e.timing)!==JSON.stringify(['ON_LRIG_GROW'])){e.timing=['ON_LRIG_GROW'];ch=true;}
      if(g.scope===undefined){if('triggerScope'in e){delete e.triggerScope;ch=true;}}else if(e.triggerScope!==g.scope){e.triggerScope=g.scope;ch=true;}
      if(g.filter===undefined){if('triggerFilter'in e){delete e.triggerFilter;ch=true;}}else if(JSON.stringify(e.triggerFilter)!==JSON.stringify(g.filter)){e.triggerFilter=g.filter;ch=true;}
      n++;console.log('synced',e.effectId,'scope='+g.scope,'filter='+JSON.stringify(g.filter));
    }
  }}
  if(ch)writeFileSync(p,JSON.stringify(j)+(raw.endsWith('\n')?'\n':''),'utf-8');
}
// WXDi-P05-010-E2 の action.source.filter.color:黒 を補完
{const p='public/data/effects_WXDi.json';const raw=readFileSync(p,'utf-8');const j=JSON.parse(raw);
  const e=j['WXDi-P05-010'].find((x:any)=>x.effectId==='WXDi-P05-010-E2');
  const src=e.action?.source; if(src){src.filter={...(src.filter??{}),color:'黒'};writeFileSync(p,JSON.stringify(j)+(raw.endsWith('\n')?'\n':''),'utf-8');console.log('set WXDi-P05-010-E2 source color 黒');}}
console.log('total grow effects:',grow.size,'| synced:',n);
