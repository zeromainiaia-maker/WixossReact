import fs from 'fs';
import { join } from 'path';
import Papa from 'papaparse';
import { parseCardEffects } from '../src/data/effectParser';
import type { CardData } from '../src/types';

const DRY = process.argv.includes('--dry');
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
// 全カードを対象に、parser が MILL 直後に新条件を出すもの＝IS_MY_TURN 誤変換の clean な系統。
const targets = [...cardMap.keys()];

// From parser: effectId -> new condition (that sits after a MILL step)
const wanted = new Map<string, unknown>();
function scanSeq(action: unknown, effectId: string) {
  if (!action || typeof action !== 'object') return;
  const a = action as Record<string, unknown>;
  if (a.type === 'SEQUENCE' && Array.isArray(a.steps)) {
    const steps = a.steps as Record<string, unknown>[];
    for (let k = 0; k < steps.length - 1; k++) {
      if (isMillTrash(steps[k]) && steps[k + 1]?.type === 'CONDITIONAL') {
        const c = steps[k + 1].condition as Record<string, unknown>;
        if (c && NEW_TYPES.has(c.type as string)) wanted.set(effectId, c);
      }
    }
    steps.forEach(s => scanSeq(s, effectId));
  }
  for (const v of Object.values(a)) if (v && typeof v === 'object' && !Array.isArray(v)) scanSeq(v, effectId);
}
for (const id of targets) {
  const card = cardMap.get(id);
  if (!card) { console.log('NO CARD', id); continue; }
  for (const e of parseCardEffects(card)) scanSeq((e as { action?: unknown }).action, (e as { effectId?: string }).effectId ?? '');
}
console.log('parser conditions:', wanted.size, '/', targets.length);

// inject
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
  for (const v of Object.values(a)) if (v && typeof v === 'object' && !Array.isArray(v)) cnt += injectSeq(v, newCond);
  return cnt;
}
const files = ['effects_WX.json', 'effects_WXDi.json', 'effects_WX24_26.json', 'effects_WXK.json', 'effects_misc.json'];
let replaced = 0; const done: string[] = [];
for (const f of files) {
  const p = join(root, 'public/data', f);
  const raw = fs.readFileSync(p, 'utf8');
  const eol = (raw.match(/(\r?\n)$/) ?? ['', ''])[1];
  const body = eol ? raw.slice(0, -eol.length) : raw;
  const data = JSON.parse(body) as Record<string, Array<{ effectId?: string; action?: unknown }>>;
  if (JSON.stringify(data) !== body) { console.error(`⚠ ${f} 往復不安定 中断`); process.exit(1); }
  let changed = false;
  for (const [cid, effs] of Object.entries(data)) {
    if (!targets.includes(cid)) continue;
    for (const e of effs) {
      if (!e.effectId || !wanted.has(e.effectId)) continue;
      const n = injectSeq(e.action, wanted.get(e.effectId));
      if (n > 0) { replaced += n; changed = true; done.push(`${e.effectId}=${(wanted.get(e.effectId) as { type: string }).type}`); }
    }
  }
  if (changed && !DRY) fs.writeFileSync(p, JSON.stringify(data) + eol, 'utf8');
}
console.log('replaced:', replaced);
console.log(done.join('\n'));
