// §5.7 S-31 ② の続き＝残っているコストキーの母集団（文脈別）
import fs from 'fs';
import { join } from 'path';
import Papa from 'papaparse';
import type { CardData } from '../../src/types';
import type { CardEffect, EffectCost } from '../../src/types/effects';
import { mergeManualEffects } from '../../src/data/manualEffects';
import { CPU_AUTO_PAYABLE_COST_KEYS } from '../../src/screens/battle/cpuActivate';
import { CPU_LRIG_AUTO_PAYABLE_COST_KEYS } from '../../src/screens/battle/cpuLrigActivate';

const root = join(import.meta.dirname, '../..');
const cardMap = new Map<string, CardData>();
for (const f of [...Array.from({ length: 11 }, (_, i) => `CardData_Sheet${i + 1}.csv`), 'CardData_TK.csv']) {
  const p = join(root, 'public/data', f);
  if (!fs.existsSync(p)) continue;
  const text = fs.readFileSync(p, 'utf-8').replace(/^﻿/, '');
  const { data } = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: true });
  for (const r of data) { const id = r.CardNum?.trim(); if (id && !cardMap.has(id)) cardMap.set(id, r as unknown as CardData); }
}
const effectsMap = new Map<string, CardEffect[]>();
for (const f of ['effects_WX.json', 'effects_WXDi.json', 'effects_WX24_26.json', 'effects_WXK.json', 'effects_misc.json']) {
  const j = JSON.parse(fs.readFileSync(join(root, 'public/data', f), 'utf-8'));
  for (const [id, effs] of Object.entries(j)) effectsMap.set(id, effs as CardEffect[]);
}
for (const [id] of cardMap) {
  const merged = mergeManualEffects(id, (effectsMap.get(id) ?? []) as never[]);
  if (merged.length > 0) effectsMap.set(id, merged as CardEffect[]);
}

function report(label: string, types: string[], allow: ReadonlySet<keyof EffectCost>, excludeOffField = false) {
  let total = 0, blocked = 0;
  const byKey = new Map<string, { eff: number; cards: Set<string> }>();
  for (const [num, card] of cardMap) {
    if (!types.includes(card.Type)) continue;
    for (const e of effectsMap.get(num) ?? []) {
      if ((e as unknown as { effectType?: string }).effectType !== 'ACTIVATED') continue;
      // 🔴場のシグニの gate は「入口が場ではない【起】」を除く（`signiActivateGate`）＝母集団からも除く。
      const ee = e as unknown as { trashActivated?: boolean; energyActivated?: boolean; handActivated?: boolean; costUnparsed?: boolean };
      // 🆕§5.7 `S-31` ② 第5段＝`handExileSelf`／`energyTrashSelf` も「入口が場ではない」形として gate が落とす。
      if (excludeOffField && (ee.trashActivated || ee.energyActivated || ee.handActivated
        || e.cost?.discardSelfFromHand || e.cost?.handExileSelf || e.cost?.energyTrashSelf)) continue;
      if (ee.costUnparsed) continue;
      total++;
      const cost = e.cost;
      if (!cost) continue;
      const bad: string[] = [];
      for (const key of Object.keys(cost) as (keyof EffectCost)[]) {
        if (cost[key] === undefined) continue;
        if (key === 'trashExile' && (cost.trashExile as { self?: boolean } | undefined)?.self) continue;
        if (key === 'discardFilter' && cost.discard === undefined) continue;
        if (!allow.has(key)) bad.push(key);
      }
      if (bad.length === 0) continue;
      blocked++;
      for (const k of bad) {
        const cur = byKey.get(k) ?? { eff: 0, cards: new Set<string>() };
        cur.eff++; cur.cards.add(num); byKey.set(k, cur);
      }
    }
  }
  console.log(`\n=== ${label} ===  ACTIVATED ${total} / 撃てない ${blocked} (${(blocked / total * 100).toFixed(1)}%)`);
  for (const [k, v] of [...byKey.entries()].sort((a, b) => b[1].eff - a[1].eff)) {
    console.log(`  ${k.padEnd(26)} 効果 ${String(v.eff).padStart(3)} / カード ${String(v.cards.size).padStart(3)}  例: ${[...v.cards].slice(0, 3).join(', ')}`);
  }
}
report('場のシグニ（cpuActivate）', ['シグニ', 'レゾナ'], CPU_AUTO_PAYABLE_COST_KEYS, true);
report('ルリグ（cpuLrigActivate）', ['ルリグ'], CPU_LRIG_AUTO_PAYABLE_COST_KEYS);
