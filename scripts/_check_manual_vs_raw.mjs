/**
 * manualEffects.ts の各カードについて、パーサー生出力（manual未適用）を確認する
 */
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import Papa from 'papaparse';
import { createRequire } from 'module';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

// ts-node/register で TypeScript をロード
const require = createRequire(import.meta.url);
process.chdir(root);

// 動的 import（tsx 経由）
const { parseCardEffects } = await import('../src/data/effectParser.ts');

const TARGET_IDS = [
  'WX01-025','WX01-029','WX04-101','WX05-020','WX06-019','WX08-022',
  'WX10-008','WX10-020','WX10-024','WX11-013','WX13-028',
  'WX15-004','WX15-066','WX16-032',
];

const allRows = [];
for (let i = 1; i <= 11; i++) {
  const p = join(root, `public/data/CardData_Sheet${i}.csv`);
  if (!existsSync(p)) break;
  const { data } = Papa.parse(readFileSync(p, 'utf-8').replace(/^﻿/, ''), { header: true, skipEmptyLines: true });
  allRows.push(...data);
}

for (const r of allRows) {
  if (!TARGET_IDS.includes(r.CardNum)) continue;
  const card = {
    CardNum: r.CardNum ?? '', CardName: r.CardName ?? '', ImgURL: '', Type: r.Type ?? '',
    CardClass: r.CardClass ?? '', Color: r.Color ?? '', Level: r.Level ?? '',
    GrowCost: r.GrowCost ?? '', Cost: r.Cost ?? '', Limit: r.Limit ?? '', Power: r.Power ?? '',
    Restriction: r.Restriction ?? '', Team: r.Team ?? '', Timing: r.Timing ?? '',
    Guard: r.Guard ?? '', Coin: r.Coin ?? '', Story: r.Story ?? '',
    LifeBurst: r.LifeBurst ?? '', EffectText: r.EffectText ?? '', BurstText: r.BurstText ?? '',
    effects: [],
  };
  // manualEffects を適用しないでパース
  const raw = parseCardEffects(card);
  console.log(`\n=== ${r.CardNum} (${r.CardName}) ===`);
  if (raw.length === 0) {
    console.log('  [パーサー出力なし]');
  } else {
    for (const e of raw) {
      const { effectId, effectType, action, cost, parseStatus } = e;
      console.log(`  ${effectId} [${effectType}] parseStatus=${parseStatus}`);
      console.log('    action:', JSON.stringify(action).slice(0, 150));
      if (cost) console.log('    cost:', JSON.stringify(cost));
    }
  }
}
