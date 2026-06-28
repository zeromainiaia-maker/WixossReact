import { readFileSync, writeFileSync, existsSync } from 'fs';
import Papa from 'papaparse';
import { parseCardEffects } from '../src/data/effectParser';
import { mergeManualEffects } from '../src/data/manualEffects';
import type { CardData } from '../src/types';
const FILES = ['effects_WX.json','effects_WXDi.json','effects_WX24_26.json','effects_WXK.json','effects_misc.json'];
const rows:any[]=[];
for(let i=1;i<=11;i++){const p=`public/data/CardData_Sheet${i}.csv`;if(!existsSync(p))break;const {data}=Papa.parse(readFileSync(p,'utf-8').replace(/^﻿/,''),{header:true,skipEmptyLines:true});rows.push(...data as any[]);}
const tk='public/data/CardData_TK.csv';if(existsSync(tk)){const {data}=Papa.parse(readFileSync(tk,'utf-8').replace(/^﻿/,''),{header:true,skipEmptyLines:true});rows.push(...data as any[]);}
// FRESH: effectId -> true (timing は ['ON_TARGETED'])
const targetedEffectIds = new Set<string>();
const targetedScope = new Map<string,any>();
const targetedFilter = new Map<string,any>();
for(const r of rows){if(!r.CardNum)continue;const eff=mergeManualEffects(r.CardNum, parseCardEffects({...r,effects:[]} as unknown as CardData));
  for(const e of eff){ if(Array.isArray(e.timing)&&e.timing.length===1&&e.timing[0]==='ON_TARGETED'){ targetedEffectIds.add(e.effectId); targetedScope.set(e.effectId, e.triggerScope); targetedFilter.set(e.effectId, (e as any).triggerFilter); } }
}
let patched=0;
for(const f of FILES){
  const p=`public/data/${f}`; const raw=readFileSync(p,'utf-8'); const j=JSON.parse(raw); let changed=false;
  for(const [cid, effs] of Object.entries(j) as any){
    for(const e of effs as any[]){
      if(targetedEffectIds.has(e.effectId)){
        const want = JSON.stringify(['ON_TARGETED']);
        if(JSON.stringify(e.timing)!==want){ e.timing=['ON_TARGETED']; changed=true; patched++; console.log('patched', e.effectId, '->ON_TARGETED'); }
        const fscope = targetedScope.get(e.effectId);
        if(fscope===undefined && 'triggerScope' in e){ delete e.triggerScope; changed=true; console.log('  removed triggerScope from', e.effectId); }
        else if(fscope!==undefined && e.triggerScope!==fscope){ e.triggerScope=fscope; changed=true; console.log('  set scope', e.effectId, fscope); }
      }
    }
  }
  if(changed){ const trailing=raw.endsWith('\n')?'\n':''; writeFileSync(p, JSON.stringify(j)+trailing, 'utf-8'); }
}
console.log('total patched:', patched, '| targeted effectIds:', targetedEffectIds.size);
