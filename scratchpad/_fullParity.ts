import fs from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';
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
const head: Record<string, unknown[]> = {};
for (const f of files) Object.assign(head, JSON.parse(execSync(`git show HEAD:public/data/${f}`,{maxBuffer:1e9}).toString()));
const ids = 'PR-442 WD08-015 WDK10-017 WX09-Re19 WX20-075 WX24-P3-075 WX24-P3-088 WXK02-063 WXK10-088 WXDi-CP01-045 WXDi-P10-071 WXDi-P11-082'.split(' ');
for (const id of ids) {
  const parsed = parseCardEffects(cardMap.get(id)!);
  const hj = head[id] ?? [];
  // compare per effectId
  const pm = new Map(parsed.map(e => [(e as {effectId?:string}).effectId, JSON.stringify(e)]));
  const hm = new Map((hj as {effectId?:string}[]).map(e => [e.effectId, JSON.stringify(e)]));
  const diffs: string[] = [];
  for (const [eid, ps] of pm) { const hs = hm.get(eid); if (hs !== ps) diffs.push(eid ?? '?'); }
  console.log((diffs.length? 'DIFF ':'OK   ') + id.padEnd(14) + (diffs.length? 'effects differ: '+diffs.join(','):''));
}
