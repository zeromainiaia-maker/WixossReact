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
const ids = 'PR-442 WD08-015 WDK10-017 WX09-Re19 WX20-075 WX24-P3-075 WX24-P3-088 WXK02-063 WXK10-088 WXDi-CP01-045 WXDi-P10-071 WXDi-P11-082'.split(' ');
// compare only the injected condition equality: find CONDITIONAL after MILL in both, compare condition
function firstMillCond(effs: unknown[]): string[] {
  const out: string[] = [];
  const walk = (n: unknown) => {
    if (!n || typeof n !== 'object') return;
    const a = n as Record<string, unknown>;
    if (a.type === 'SEQUENCE' && Array.isArray(a.steps)) {
      const st = a.steps as Record<string, unknown>[];
      for (let k=0;k<st.length-1;k++){ const s=st[k] as Record<string,unknown>; if(s?.type==='TRASH'&&(s.target as Record<string,unknown>)?.type==='DECK_CARD'&&st[k+1]?.type==='CONDITIONAL') out.push(JSON.stringify(st[k+1].condition)); }
      st.forEach(walk);
    }
    for (const v of Object.values(a)) if (v&&typeof v==='object'&&!Array.isArray(v)) walk(v);
  };
  effs.forEach(e=>walk((e as {action?:unknown}).action));
  return out;
}
let mism=0;
for (const id of ids) {
  const pc = firstMillCond(parseCardEffects(cardMap.get(id)!));
  const cc = firstMillCond(cur[id] ?? []);
  const eq = JSON.stringify(pc)===JSON.stringify(cc);
  if(!eq) mism++;
  console.log((eq?'OK ':'MISMATCH ')+id.padEnd(14)+' parser='+pc.join(',')+' curated='+cc.join(','));
}
console.log('\nmismatches:', mism);
