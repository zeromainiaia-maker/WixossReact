import { readFileSync, existsSync } from 'fs';
import Papa from 'papaparse';
import { parseCardEffects } from './src/data/effectParser';
import type { CardData } from './src/types';
const rows: Record<string,string>[] = [];
for(let i=1;i<=11;i++){const p=`public/data/CardData_Sheet${i}.csv`;if(!existsSync(p))break;const {data}=Papa.parse<Record<string,string>>(readFileSync(p,'utf-8').replace(/^﻿/,''),{header:true,skipEmptyLines:true});rows.push(...data);}
for (const id of process.argv.slice(2)) {
  const row=rows.find(r=>r.CardNum===id)!;
  console.log('== '+id+' ==');
  console.log('text:', (row.EffectText||'').slice(0,200));
  const effs=parseCardEffects({...row, effects: []} as unknown as CardData);
  for(const e of effs) console.log(' ', e.effectId, 'cond:'+JSON.stringify((e as {condition?:unknown}).condition||null), 'action:'+JSON.stringify(e.action).slice(0,200));
}
