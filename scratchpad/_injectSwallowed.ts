// splitEffectBlocks 正規化拡張（【エナチャージN】/【シュート】/【ダブルクラッシュ】/【ガード】+マーカー隣接）で
// 復元された「飲み込まれ効果」を curated に注入（続き20）。
// 対象: MANUAL/PARTIAL を含まないカードで、curated の全効果が fresh に同一存在（cur⊆fresh）かつ fresh に追加効果がある場合
// → カード全体を fresh に差し替え（fresh==curated でパリティ維持）。
import { readFileSync, writeFileSync, existsSync } from 'fs';
import Papa from 'papaparse';
import { parseCardEffects } from '../src/data/effectParser';
import { mergeManualEffects } from '../src/data/manualEffects';
import type { CardData } from '../src/types';
const FILES = ['effects_WX.json','effects_WXDi.json','effects_WX24_26.json','effects_WXK.json','effects_misc.json'];
const jsons = new Map<string, Record<string, any[]>>();
const fileOf = new Map<string, string>();
for (const f of FILES) { const j = JSON.parse(readFileSync(`public/data/${f}`,'utf-8')); jsons.set(f, j); for (const k of Object.keys(j)) fileOf.set(k, f); }
const rows: Record<string,string>[] = [];
for (let i=1;i<=11;i++){ const p=`public/data/CardData_Sheet${i}.csv`; if(!existsSync(p))break; const {data}=Papa.parse<Record<string,string>>(readFileSync(p,'utf-8').replace(/^﻿/,''),{header:true,skipEmptyLines:true}); rows.push(...data); }
const tk='public/data/CardData_TK.csv'; if(existsSync(tk)){const {data}=Papa.parse<Record<string,string>>(readFileSync(tk,'utf-8').replace(/^﻿/,''),{header:true,skipEmptyLines:true});rows.push(...data);}
let cards=0, effects=0; const skipped:string[]=[];
for (const r of rows){
  if(!r.CardNum)continue;
  const file = fileOf.get(r.CardNum); if(!file) continue;
  const j = jsons.get(file)!;
  const cur = j[r.CardNum]; if(!cur) continue;
  if (cur.some((e:any)=>['MANUAL','PARTIAL'].includes(e?.parseStatus))) continue;
  const f = mergeManualEffects(r.CardNum, parseCardEffects({...r,effects:[]} as unknown as CardData));
  const curIds = new Set(cur.map((e:any)=>e.effectId));
  const extra = f.filter((e:any)=>!curIds.has(e.effectId));
  if (!extra.length) continue;
  // cur⊆fresh（既存効果が全て同一で残っている）ことを確認
  const ok = cur.every((e:any)=>{ const fe=f.find((x:any)=>x.effectId===e.effectId); return fe && JSON.stringify(fe)===JSON.stringify(e); });
  if (!ok) { skipped.push(r.CardNum); continue; }
  j[r.CardNum] = f;
  cards++; effects += extra.length;
  console.log('INJECT', r.CardNum, '+', extra.map((e:any)=>e.effectId.replace(r.CardNum+'-','')+':'+JSON.stringify(e.action).slice(0,120)).join(' | '));
}
for (const f of FILES) writeFileSync(`public/data/${f}`, JSON.stringify(jsons.get(f)));
console.log('cards:', cards, 'effects:', effects, skipped.length?('SKIP(not cur⊆fresh): '+skipped.join(' ')):'');
