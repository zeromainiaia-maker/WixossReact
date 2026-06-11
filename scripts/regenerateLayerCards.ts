/**
 * regenerateLayerCards.ts
 * 【レイヤー】を持つカードをパーサーで再解析し、effects JSON のエントリーを置き換える。
 * （GRANT_FIELD_SIGNI_ABILITY 形式への移行用）
 *
 * 実行: npx tsx scripts/regenerateLayerCards.ts [--write]
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

// 【レイヤー】付与文を持つカード（参照のみのWX18-060/WXEX1-05、アーツのSP26-005は対象外）
const TARGET_IDS = [
  'WX15-031', 'WX16-024', 'WX16-034', 'WX16-049', 'WX16-050', 'WX16-051',
  'WX16-052', 'WX16-053', 'WX17-025', 'WX17-035', 'WX17-051', 'WX17-052',
  'WX20-023', 'WX21-022', 'WX21-050', 'WXEX1-32', 'WXEX2-33', 'WXEX2-59',
];

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

const parsedById: Record<string, ReturnType<typeof parseCardEffects>> = {};
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
  parsedById[id] = effects;
}

for (const [id, effects] of Object.entries(parsedById)) {
  const layerEff = effects.find(e => e.action?.type === 'GRANT_FIELD_SIGNI_ABILITY');
  const abilityCount = layerEff ? (layerEff.action as { abilities: unknown[] }).abilities.length : 0;
  console.log(`### ${id} (${effects.length}効果 / レイヤー付与能力${abilityCount}件)`);
  console.log(JSON.stringify(effects, null, 1).substring(0, 1600));
  console.log();
}

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
    if (effects.length === 0) { console.log(`skip(解析空): ${id}`); continue; }
    const f = fileFor(id);
    byFile[f] = byFile[f] ?? {};
    byFile[f][id] = effects;
  }
  for (const [fname, replacements] of Object.entries(byFile)) {
    const p = join(root, 'public/data', fname);
    const json = JSON.parse(readFileSync(p, 'utf-8'));
    let replaced = 0;
    for (const [id, effects] of Object.entries(replacements)) {
      json[id] = effects;
      replaced++;
    }
    writeFileSync(p, JSON.stringify(json), 'utf-8');
    console.log(`書き込み: ${fname} (置換${replaced}件)`);
  }
}
