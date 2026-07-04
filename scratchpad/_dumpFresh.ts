import { readFileSync, existsSync } from 'fs';
import Papa from 'papaparse';
import { parseCardEffects } from '../src/data/effectParser';
import { mergeManualEffects } from '../src/data/manualEffects';
import type { CardData } from '../src/types';
const rows: Record<string,string>[] = [];
for (let i=1;i<=11;i++){ const p=`public/data/CardData_Sheet${i}.csv`; if(!existsSync(p))break; const {data}=Papa.parse<Record<string,string>>(readFileSync(p,'utf-8').replace(/^﻿/,''),{header:true,skipEmptyLines:true}); rows.push(...data); }
const tk='public/data/CardData_TK.csv'; if(existsSync(tk)){const {data}=Papa.parse<Record<string,string>>(readFileSync(tk,'utf-8').replace(/^﻿/,''),{header:true,skipEmptyLines:true});rows.push(...data);}
for (const id of process.argv.slice(2)) {
  const r = rows.find(x=>x.CardNum===id)!;
  const f = mergeManualEffects(id, parseCardEffects({...r,effects:[]} as unknown as CardData));
  console.log('==', id, '\n  text:', (r.EffectText??'').slice(0,200));
  for (const e of f) console.log('  ', e.effectId.replace(id+'-',''), e.effectType, e.timing??'', (e as any).usageLimit??'', JSON.stringify(e.action).slice(0,220));
}
