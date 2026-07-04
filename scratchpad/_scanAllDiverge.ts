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
const NEW = new Set(['LAST_PROCESSED_COUNT_GTE','TRASHED_STORY_COUNT_GTE','TRASHED_DISTINCT_LEVELS_GTE']);
// collect all condition types anywhere
function conds(action: unknown, out: string[]) {
  if (!action||typeof action!=='object') return;
  const a = action as Record<string,unknown>;
  if (a.type==='CONDITIONAL' && a.condition) out.push((a.condition as {type:string}).type);
  for (const v of Object.values(a)) { if (Array.isArray(v)) v.forEach(x=>conds(x,out)); else if (v&&typeof v==='object') conds(v,out); }
}
// find effectIds where parser has a NEW cond but curated has IS_MY_TURN (any position)
const flagged: string[] = [];
for (const [cid, card] of cardMap) {
  const parsed = parseCardEffects(card);
  const cj = (cur[cid] ?? []) as {effectId?:string;action?:unknown}[];
  for (const pe of parsed) {
    const eid = (pe as {effectId?:string}).effectId;
    const pc: string[] = []; conds((pe as {action?:unknown}).action, pc);
    if (!pc.some(t=>NEW.has(t))) continue;
    const ce = cj.find(e=>e.effectId===eid);
    if (!ce) { flagged.push(`${eid} (no curated effect)`); continue; }
    const cc: string[] = []; conds(ce.action, cc);
    if (cc.includes('IS_MY_TURN') && !cc.some(t=>NEW.has(t))) flagged.push(`${eid} parser=${pc.filter(t=>NEW.has(t))} curated=IS_MY_TURN`);
  }
}
console.log('parser=NEW but curated=IS_MY_TURN (divergences):', flagged.length);
flagged.forEach(f=>console.log('  '+f));
