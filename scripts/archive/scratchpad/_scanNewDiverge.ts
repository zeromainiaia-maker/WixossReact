import fs from 'fs';
import { join } from 'path';
import Papa from 'papaparse';
import { parseCardEffects } from '../src/data/effectParser';
import type { CardData } from '../src/types';
const root = process.cwd();
const cardMap = new Map<string, CardData>();
for (let i = 1; i <= 11; i++) {
  const p = join(root, 'public/data', `CardData_Sheet${i}.csv`);
  if (!fs.existsSync(p)) continue;
  const { data } = Papa.parse<Record<string, string>>(fs.readFileSync(p, 'utf-8').replace(/^﻿/, ''), { header: true, skipEmptyLines: true });
  for (const r of data) { const id = r.CardNum?.trim(); if (id && !cardMap.has(id)) cardMap.set(id, r as unknown as CardData); }
}
const files = ['effects_WX.json','effects_WXDi.json','effects_WX24_26.json','effects_WXK.json','effects_misc.json'];
const cur: Record<string, unknown[]> = {};
for (const f of files) Object.assign(cur, JSON.parse(fs.readFileSync(join(root,'public/data',f),'utf8')));
const NEW_TYPES = new Set(['LAST_PROCESSED_COUNT_GTE','TRASHED_STORY_COUNT_GTE','TRASHED_DISTINCT_LEVELS_GTE']);
const isMill = (s: unknown) => { const n = s as Record<string,unknown>; return n?.type==='TRASH' && (n.target as Record<string,unknown>)?.type==='DECK_CARD'; };
// parser: effectId -> new cond after MILL
const pMap = new Map<string, string>();
function scan(action: unknown, eid: string) {
  if (!action || typeof action!=='object') return;
  const a = action as Record<string,unknown>;
  if (a.type==='SEQUENCE' && Array.isArray(a.steps)) {
    const st = a.steps as Record<string,unknown>[];
    for (let k=0;k<st.length-1;k++) if (isMill(st[k]) && st[k+1]?.type==='CONDITIONAL') { const c=st[k+1].condition as Record<string,unknown>; if (c && NEW_TYPES.has(c.type as string)) pMap.set(eid, JSON.stringify(c)); }
    st.forEach(s=>scan(s,eid));
  }
  for (const v of Object.values(a)) if (v&&typeof v==='object'&&!Array.isArray(v)) scan(v,eid);
}
for (const [, card] of cardMap) for (const e of parseCardEffects(card)) scan((e as {action?:unknown}).action, (e as {effectId?:string}).effectId ?? '');
// curated: does the same effectId still have IS_MY_TURN after MILL?
function curImt(action: unknown): boolean {
  if (!action||typeof action!=='object') return false;
  const a = action as Record<string,unknown>;
  let f = false;
  if (a.type==='SEQUENCE'&&Array.isArray(a.steps)) { const st=a.steps as Record<string,unknown>[]; for (let k=0;k<st.length-1;k++) if (isMill(st[k])&&st[k+1]?.type==='CONDITIONAL'&&(st[k+1].condition as Record<string,unknown>)?.type==='IS_MY_TURN') f=true; st.forEach(s=>{if(curImt(s))f=true;}); }
  for (const v of Object.values(a)) if (v&&typeof v==='object'&&!Array.isArray(v)) if (curImt(v)) f=true;
  return f;
}
const newDiverge: string[] = [];
for (const [eid, cond] of pMap) {
  const cardId = Object.keys(cur).find(cid => (cur[cid] as {effectId?:string}[]).some(e=>e.effectId===eid));
  if (!cardId) continue;
  const eff = (cur[cardId] as {effectId?:string;action?:unknown}[]).find(e=>e.effectId===eid);
  if (eff && curImt(eff.action)) newDiverge.push(`${eid} → ${cond}`);
}
console.log('parser new-cond effects (MILL):', pMap.size);
console.log('NEW DIVERGENCES (parser=real, curated=IS_MY_TURN):', newDiverge.length);
newDiverge.forEach(d=>console.log('  '+d));
