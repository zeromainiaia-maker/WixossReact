// 対象カードの ACTIVATED + discardSelfFromHand 効果に対し、修正後パーサーの timing/handActivated のみを
// プリビルド JSON に反映する外科的パッチ。他の効果・フィールドは一切変更しない（退化ゼロ）。
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import Papa from 'papaparse';
import { parseCardEffects } from '../src/data/effectParser';
import { mergeManualEffects } from '../src/data/manualEffects';
import type { CardData } from '../src/types';
import type { CardEffect } from '../src/types/effects';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const targets = ['WX17-031', 'WX18-029', 'WX18-053', 'WX18-055', 'WX19-022', 'WX19-045', 'WXK11-067', 'WXDi-P08-070'];
const files = ['effects_WX.json', 'effects_WXK.json', 'effects_WXDi.json', 'effects_WX24_26.json', 'effects_misc.json'];

// CSV を読み込み、対象カードの修正後パース結果を effectId→effect で引けるように
const rows: Record<string, string>[] = [];
for (let i = 1; i <= 11; i++) {
  const p = join(root, `public/data/CardData_Sheet${i}.csv`);
  if (!existsSync(p)) break;
  const { data } = Papa.parse<Record<string, string>>(readFileSync(p, 'utf-8').replace(/^﻿/, ''), { header: true, skipEmptyLines: true });
  rows.push(...data);
}
const freshByEffectId = new Map<string, CardEffect>();
for (const t of targets) {
  const r = rows.find(x => x.CardNum === t);
  if (!r) continue;
  for (const e of mergeManualEffects(t, parseCardEffects(r as unknown as CardData))) freshByEffectId.set(e.effectId, e);
}

let patched = 0;
for (const f of files) {
  const fp = join(root, 'public/data', f);
  if (!existsSync(fp)) continue;
  const json = JSON.parse(readFileSync(fp, 'utf-8')) as Record<string, CardEffect[]>;
  let changed = false;
  for (const t of targets) {
    const effs = json[t];
    if (!effs) continue;
    for (const e of effs) {
      if (e.effectType !== 'ACTIVATED' || e.cost?.discardSelfFromHand !== true) continue;
      const fresh = freshByEffectId.get(e.effectId);
      if (!fresh) continue;
      const before = JSON.stringify([e.timing, (e as { handActivated?: boolean }).handActivated]);
      e.timing = fresh.timing;
      (e as { handActivated?: boolean }).handActivated = true;
      const after = JSON.stringify([e.timing, true]);
      if (before !== after) { changed = true; patched++; console.log(`patch ${t} ${e.effectId}: ${before} -> ${after}`); }
    }
  }
  if (changed) writeFileSync(fp, JSON.stringify(json, null, 2) + '\n', 'utf-8');
}
console.log(`\n計 ${patched} 効果をパッチ`);
