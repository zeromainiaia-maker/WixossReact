/**
 * addMissingEffects.ts
 * 効果テキストがあるのに effects JSON にエントリーが無いカードだけをパーサーで解析し、
 * 既存の effects JSON へマージする（既存エントリーは一切変更しない）。
 *
 * 実行: npx tsx scripts/addMissingEffects.ts [--write]
 *   --write なしはドライラン（解析結果の表示のみ）
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import Papa from 'papaparse';
import { parseCardEffects } from '../src/data/effectParser';
import { mergeManualEffects } from '../src/data/manualEffects';
import type { CardData } from '../src/types';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const doWrite = process.argv.includes('--write');

const TARGET_IDS = [
  'WX16-049', 'WX16-050', 'WX16-052', 'WX16-059', 'WX17-035', 'WX17-052',
  'WX17-055', 'WX18-061', 'WX21-050',
  'WXK01-010', 'WXK01-048', 'WXK01-074', 'WXK04-016', 'WXK04-017', 'WXK04-018',
  'WDK01-002', 'WDK01-003', 'WDK01-004', 'WDK01-015',
  'WDK07-E02', 'WDK07-E03', 'WDK07-E04',
  'WXDi-P02-046', 'WXDi-P03-085', 'WXDi-P07-091',
  'WX25-P2-033', 'WX25-P3-035', 'WX25-P3-036',
  'WXDi-P11-061', 'WXDi-P12-055', 'WXDi-P12-068',
  'WXDi-P16-048', 'WXDi-P16-092', 'WXDi-CP01-001', 'WXDi-CP01-003',
];

// ─── CSV読み込み ───
const rowsById: Record<string, Record<string, string>> = {};
const csvFiles = [
  ...Array.from({ length: 10 }, (_, i) => `CardData_Sheet${i + 1}.csv`),
  'CardData_TK.csv',
];
for (const fname of csvFiles) {
  const p = join(root, 'public/data', fname);
  if (!existsSync(p)) continue;
  const text = readFileSync(p, 'utf-8').replace(/^﻿/, '');
  const { data } = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: true });
  for (const r of data) {
    const id = r.CardNum?.trim();
    if (id && TARGET_IDS.includes(id) && !rowsById[id]) rowsById[id] = r;
  }
}

// ─── 解析 ───
const parsedById: Record<string, ReturnType<typeof parseCardEffects>> = {};
const emptyIds: string[] = [];

for (const id of TARGET_IDS) {
  const r = rowsById[id];
  if (!r) { console.log(`!! CSVに見つからない: ${id}`); continue; }
  const card: CardData = {
    CardNum: r.CardNum ?? '', CardName: r.CardName ?? '', ImgURL: r.ImgURL ?? '',
    Type: r.Type ?? '', CardClass: r.CardClass ?? '', Color: r.Color ?? '',
    Level: r.Level ?? '', GrowCost: r.GrowCost ?? '', Cost: r.Cost ?? '',
    Limit: r.Limit ?? '', Power: r.Power ?? '', Restriction: r.Restriction ?? '',
    Team: r.Team ?? '', Timing: r.Timing ?? '', Guard: r.Guard ?? '',
    Coin: r.Coin ?? '', Story: r.Story ?? '', LifeBurst: r.LifeBurst ?? '',
    EffectText: r.EffectText ?? '', BurstText: r.BurstText ?? '', effects: [],
  };
  const effects = mergeManualEffects(card.CardNum, parseCardEffects(card));
  if (effects.length === 0) { emptyIds.push(id); continue; }
  parsedById[id] = effects;
}

// ─── レポート ───
console.log(`解析結果: ${Object.keys(parsedById).length}枚に効果生成 / ${emptyIds.length}枚は空`);
if (emptyIds.length) console.log(`空: ${emptyIds.join(', ')}`);
for (const [id, effects] of Object.entries(parsedById)) {
  console.log(`\n### ${id} (${effects.length}効果)`);
  console.log(JSON.stringify(effects, null, 1).substring(0, 1200));
}

// ─── マージ書き込み ───
if (doWrite) {
  const fileFor = (cardNum: string): string => {
    if (/^WXDi/i.test(cardNum)) return 'effects_WXDi.json';
    if (/^WX2[4-6]/.test(cardNum)) return 'effects_WX24_26.json';
    if (/^WXK/.test(cardNum)) return 'effects_WXK.json';
    if (/^WX(0[0-9]|1[0-9]|2[0-3]|EX)/.test(cardNum)) return 'effects_WX.json';
    return 'effects_misc.json';
  };
  const byFile: Record<string, Record<string, unknown>> = {};
  for (const [id, effects] of Object.entries(parsedById)) {
    const f = fileFor(id);
    byFile[f] = byFile[f] ?? {};
    byFile[f][id] = effects;
  }
  for (const [fname, additions] of Object.entries(byFile)) {
    const p = join(root, 'public/data', fname);
    const json = JSON.parse(readFileSync(p, 'utf-8'));
    let added = 0;
    for (const [id, effects] of Object.entries(additions)) {
      if (json[id]) { console.log(`skip(既存): ${id}`); continue; }
      json[id] = effects;
      added++;
    }
    writeFileSync(p, JSON.stringify(json), 'utf-8');
    console.log(`書き込み: ${fname} (+${added}件)`);
  }
}
