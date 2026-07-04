// 「探してエナゾーンに置き」SHUFFLE縮退＋《Xアイコン》cardName無言no-match の系統是正（続き20）。
// parser 修正済みの fresh 出力を source of truth に、該当 effectId のみ curated へ注入する。
// 安全弁：cur 側にしか無い有意義なリーフ（=curated の手修正）が検出されたカードはスキップして報告。
import { readFileSync, writeFileSync, existsSync } from 'fs';
import Papa from 'papaparse';
import { parseCardEffects } from '../src/data/effectParser';
import { mergeManualEffects } from '../src/data/manualEffects';
import type { CardData } from '../src/types';

const FILES = ['effects_WX.json','effects_WXDi.json','effects_WX24_26.json','effects_WXK.json','effects_misc.json'];
const PRESERVE = new Set(['MANUAL','PARTIAL']);
const fileOf = new Map<string, string>();
const jsons = new Map<string, Record<string, any[]>>();
for (const f of FILES) {
  const j = JSON.parse(readFileSync(`public/data/${f}`,'utf-8'));
  jsons.set(f, j);
  for (const k of Object.keys(j)) fileOf.set(k, f);
}
const rows: Record<string,string>[] = [];
for (let i=1;i<=11;i++){ const p=`public/data/CardData_Sheet${i}.csv`; if(!existsSync(p))break; const {data}=Papa.parse<Record<string,string>>(readFileSync(p,'utf-8').replace(/^﻿/,''),{header:true,skipEmptyLines:true}); rows.push(...data); }
const tk='public/data/CardData_TK.csv'; if(existsSync(tk)){const {data}=Papa.parse<Record<string,string>>(readFileSync(tk,'utf-8').replace(/^﻿/,''),{header:true,skipEmptyLines:true});rows.push(...data);}
const fresh = new Map<string, any[]>();
for (const r of rows){ if(!r.CardNum)continue; const eff=mergeManualEffects(r.CardNum, parseCardEffects({...r,effects:[]} as unknown as CardData)); if(eff.length) fresh.set(r.CardNum, eff); }

function leafMap(o:any,pre='',out=new Map<string,any>()):Map<string,any>{ if(Array.isArray(o))o.forEach((v,i)=>leafMap(v,`${pre}[${i}]`,out)); else if(o&&typeof o==='object')for(const k of Object.keys(o))leafMap(o[k],`${pre}.${k}`,out); else out.set(pre,o); return out; }

let replaced=0;
const skippedCards:string[]=[];
const touched=new Set<string>();
for (const [id, effs] of fresh) {
  const file = fileOf.get(id); if(!file) continue;
  const j = jsons.get(file)!;
  const cur = j[id]; if(!cur) continue;
  if (cur.some((x:any)=>PRESERVE.has(x?.parseStatus))) continue; // MANUAL/PARTIAL カードは触らない
  const plan: Array<{i:number; f:any}> = [];
  let unsafe = false;
  for (let i=0;i<cur.length;i++){
    const fe = effs.find((e:any)=>e.effectId===cur[i]?.effectId);
    if (!fe) continue;
    if (JSON.stringify(cur[i])===JSON.stringify(fe)) continue;
    const fs_ = JSON.stringify(fe);
    const isSearchFamily = (fs_.includes('"SEARCH"') && fs_.includes('"ENERGY_CHARGE"')) || fs_.includes('"hasIcon"');
    if (!isSearchFamily) continue; // 検索/エナ系以外の乖離は据置（既存held）
    // 安全弁：cur にしか無い有意義リーフ（undefined以外）のうち、既知の誤エンコード
    // （SHUFFLE_DECK縮退の owner / cardName Xアイコン / action.type SHUFFLE_DECK）以外があればスキップ
    const cm = leafMap(cur[i]), fm = leafMap(fe);
    for (const [p,v] of cm) {
      if (v === undefined) continue;
      if (fm.has(p) ) continue;
      const known = /アイコン$/.test(String(v)) || v === 'SHUFFLE_DECK' || v === 'self';
      if (!known) { console.log(`SKIP ${id} ${cur[i].effectId}: cur-only ${p}=${JSON.stringify(v)}`); unsafe = true; }
    }
    plan.push({i, f: fe});
  }
  if (unsafe) { skippedCards.push(id); continue; }
  if (!plan.length) continue;
  for (const {i,f} of plan) { cur[i] = f; replaced++; }
  touched.add(`${id}(${plan.map(p=>p.f.effectId.replace(id+'-','')).join(',')})`);
}
for (const f of FILES) writeFileSync(`public/data/${f}`, JSON.stringify(jsons.get(f)));
console.log('replaced effects:', replaced, ' / cards:', touched.size, skippedCards.length?` / SKIP cards: ${skippedCards.join(' ')}`:'');
console.log([...touched].join(' '));
