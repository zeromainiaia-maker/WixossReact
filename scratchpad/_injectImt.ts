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
const NEW_TYPES = new Set(['LAST_PROCESSED_COUNT_GTE', 'TRASHED_STORY_COUNT_GTE', 'TRASHED_DISTINCT_LEVELS_GTE']);
const isMillTrash = (s: unknown) => {
  const n = s as Record<string, unknown>;
  return n?.type === 'TRASH' && (n.target as Record<string, unknown>)?.type === 'DECK_CARD';
};

// From parser: for each effectId, find the new condition that sits in a SEQUENCE right after a MILL step.
const targets = 'PR-442 WD08-015 WDK10-017 WX09-Re19 WX20-075 WX24-P3-075 WX24-P3-088 WXK02-063 WXK06-031 WXK10-088 WXDi-CP01-045 WXDi-P10-071 WXDi-P11-082 WXK03-039 WXDi-P13-003A'.split(' ');
const wanted = new Map<string, unknown>(); // effectId -> newCondition
function scanSeq(action: unknown, effectId: string) {
  if (!action || typeof action !== 'object') return;
  const a = action as Record<string, unknown>;
  if (a.type === 'SEQUENCE' && Array.isArray(a.steps)) {
    const steps = a.steps as Record<string, unknown>[];
    for (let k = 0; k < steps.length - 1; k++) {
      if (isMillTrash(steps[k]) && steps[k + 1]?.type === 'CONDITIONAL') {
        const c = (steps[k + 1].condition as Record<string, unknown>);
        if (c && NEW_TYPES.has(c.type as string)) wanted.set(effectId, c);
      }
    }
    steps.forEach(s => scanSeq(s, effectId));
  }
  for (const v of Object.values(a)) { if (v && typeof v === 'object') scanSeq(v, effectId); }
}
for (const id of targets) {
  const card = cardMap.get(id);
  if (!card) { console.log('NO CARD', id); continue; }
  for (const e of parseCardEffects(card)) scanSeq((e as { action?: unknown }).action, (e as { effectId?: string }).effectId ?? '');
}
console.log('parser-derived conditions:', wanted.size);

// Inject into curated JSON: for each effectId, find the SEQUENCE with MILL followed by CONDITIONAL(IS_MY_TURN), replace.
const files = ['effects_WX.json', 'effects_WXDi.json', 'effects_WX24_26.json', 'effects_WXK.json', 'effects_misc.json'];
let replaced = 0;
const notFound: string[] = [];
function injectSeq(action: unknown, newCond: unknown): number {
  if (!action || typeof action !== 'object') return 0;
  const a = action as Record<string, unknown>;
  let cnt = 0;
  if (a.type === 'SEQUENCE' && Array.isArray(a.steps)) {
    const steps = a.steps as Record<string, unknown>[];
    for (let k = 0; k < steps.length - 1; k++) {
      if (isMillTrash(steps[k]) && steps[k + 1]?.type === 'CONDITIONAL') {
        const c = steps[k + 1].condition as Record<string, unknown>;
        if (c?.type === 'IS_MY_TURN') { steps[k + 1].condition = newCond; cnt++; }
      }
    }
    for (const s of steps) cnt += injectSeq(s, newCond);
  }
  for (const v of Object.values(a)) { if (v && typeof v === 'object' && !Array.isArray(v)) cnt += injectSeq(v, newCond); }
  return cnt;
}
for (const f of files) {
  const path = join(root, 'public/data', f);
  const j = JSON.parse(fs.readFileSync(path, 'utf8')) as Record<string, Array<{ effectId?: string; action?: unknown }>>;
  let changed = false;
  for (const [effectId, newCond] of wanted) {
    const cardId = effectId.replace(/-E\d.*$/, '').replace(/-BURST$/, '');
    // find the card that owns this effectId (may differ from effectId prefix for some)
    for (const [cid, effs] of Object.entries(j)) {
      if (!cid || !targets.includes(cid)) continue;
      for (const e of effs) {
        if (e.effectId !== effectId) continue;
        const n = injectSeq(e.action, newCond);
        if (n > 0) { replaced += n; changed = true; }
      }
    }
    void cardId;
  }
  if (changed) fs.writeFileSync(path, JSON.stringify(j, null, 1) + '\n', 'utf8');
}
console.log('replaced IS_MY_TURN conditionals:', replaced);
for (const id of targets) if (![...wanted.keys()].some(k => k.startsWith(id))) notFound.push(id);
if (notFound.length) console.log('WARN no parser cond for:', notFound.join(', '));
