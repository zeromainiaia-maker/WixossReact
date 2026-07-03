// 一時スクリプト：指定カードの curated JSON（作業ツリー版）vs fresh parse の leaf 差分（終わったら削除）
import { readFileSync, existsSync } from 'fs';
import Papa from 'papaparse';
import { parseCardEffects } from './src/data/effectParser';
import { mergeManualEffects } from './src/data/manualEffects';
import type { CardData } from './src/types';

const ids = process.argv.slice(2);
const FILES = ['effects_WX.json','effects_WXDi.json','effects_WX24_26.json','effects_WXK.json','effects_misc.json'];
const existing = new Map<string, unknown[]>();
for (const f of FILES) { const j = JSON.parse(readFileSync(`public/data/${f}`,'utf-8')); for (const [k,v] of Object.entries(j)) existing.set(k, v as unknown[]); }
const rows: Record<string,string>[] = [];
for (let i=1;i<=11;i++){ const p=`public/data/CardData_Sheet${i}.csv`; if(!existsSync(p))break; const {data}=Papa.parse<Record<string,string>>(readFileSync(p,'utf-8').replace(/^﻿/,''),{header:true,skipEmptyLines:true}); rows.push(...data); }

function leafMap(o:unknown,pre='',out=new Map<string,unknown>()):Map<string,unknown>{ if(Array.isArray(o))o.forEach((v,i)=>leafMap(v,`${pre}[${i}]`,out)); else if(o&&typeof o==='object')for(const k of Object.keys(o as object))leafMap((o as Record<string,unknown>)[k],`${pre}.${k}`,out); else out.set(pre,o); return out; }

for (const id of ids) {
  const row = rows.find(r=>r.CardNum===id);
  if (!row) { console.log(`== ${id}: CSV行なし`); continue; }
  const fresh = mergeManualEffects(id, parseCardEffects({...row, effects: []} as unknown as CardData));
  const cur = existing.get(id);
  console.log(`\n== ${id} ==`);
  if (!cur) { console.log('curated JSONなし'); continue; }
  if ((cur as {parseStatus?:string}[]).some(x=>['MANUAL','PARTIAL'].includes(x?.parseStatus ?? ''))) { console.log('  (MANUAL/PARTIAL含む＝計器対象外)'); }
  const em = leafMap(cur), fm = leafMap(fresh);
  let any = false;
  for (const [p,v] of em) {
    if (!fm.has(p)) { console.log(`  LOST  ${p} = ${JSON.stringify(v)}`); any = true; }
    else if (JSON.stringify(fm.get(p))!==JSON.stringify(v)) { console.log(`  DIFF  ${p}: curated=${JSON.stringify(v)} fresh=${JSON.stringify(fm.get(p))}`); any = true; }
  }
  for (const [p,v] of fm) if (!em.has(p) && v !== undefined) { console.log(`  EXTRA ${p} = ${JSON.stringify(v)}`); any = true; }
  if (!any) console.log('  一致');
}
