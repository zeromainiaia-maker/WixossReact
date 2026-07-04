// fresh に curated に無い effectId が現れたカードを全数列挙（正規化拡張の波及確認・続き20）
import { readFileSync, existsSync } from 'fs';
import Papa from 'papaparse';
import { parseCardEffects } from '../src/data/effectParser';
import { mergeManualEffects } from '../src/data/manualEffects';
import type { CardData } from '../src/types';
const FILES = ['effects_WX.json','effects_WXDi.json','effects_WX24_26.json','effects_WXK.json','effects_misc.json'];
const existing = new Map<string, any[]>();
for (const f of FILES) { const j = JSON.parse(readFileSync(`public/data/${f}`,'utf-8')); for (const [k,v] of Object.entries(j)) existing.set(k, v as any[]); }
const rows: Record<string,string>[] = [];
for (let i=1;i<=11;i++){ const p=`public/data/CardData_Sheet${i}.csv`; if(!existsSync(p))break; const {data}=Papa.parse<Record<string,string>>(readFileSync(p,'utf-8').replace(/^﻿/,''),{header:true,skipEmptyLines:true}); rows.push(...data); }
const tk='public/data/CardData_TK.csv'; if(existsSync(tk)){const {data}=Papa.parse<Record<string,string>>(readFileSync(tk,'utf-8').replace(/^﻿/,''),{header:true,skipEmptyLines:true});rows.push(...data);}
for (const r of rows){
  if(!r.CardNum)continue;
  const cur = existing.get(r.CardNum); if(!cur) continue;
  const f = mergeManualEffects(r.CardNum, parseCardEffects({...r,effects:[]} as unknown as CardData));
  const curIds = new Set(cur.map((e:any)=>e.effectId));
  const extra = f.filter((e:any)=>!curIds.has(e.effectId));
  const manual = cur.some((e:any)=>['MANUAL','PARTIAL'].includes(e?.parseStatus));
  if (extra.length) console.log(r.CardNum, manual?'[MANUAL]':'[auto]', '| extra:', extra.map((e:any)=>`${e.effectId.replace(r.CardNum+'-','')}:${e.effectType}:${e.action?.type}${e.action?.id?':'+e.action.id:''}`).join(' '));
}
