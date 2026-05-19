import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import Papa from 'papaparse';
import { parseCardEffects } from '../src/data/effectParser';
import { mergeManualEffects } from '../src/data/manualEffects';
import type { CardData } from '../src/types';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

const allRows: Record<string, string>[] = [];
for (let i = 1; i <= 11; i++) {
  const p = join(root, `public/data/CardData_Sheet${i}.csv`);
  if (!existsSync(p)) break;
  const csv = readFileSync(p, 'utf-8').replace(/^﻿/, '');
  const { data } = Papa.parse<Record<string, string>>(csv, { header: true, skipEmptyLines: true });
  allRows.push(...data);
}

const unknownList: Array<{ cardNum: string; cardName: string; effectText: string; burstText: string; rawText: string }> = [];
const patternMap: Record<string, { count: number; examples: string[] }> = {};

for (const r of allRows) {
  const card: CardData = {
    CardNum: r.CardNum ?? '', CardName: r.CardName ?? '', ImgURL: '',
    Type: r.Type ?? '', CardClass: r.CardClass ?? '', Color: r.Color ?? '',
    Level: r.Level ?? '', GrowCost: r.GrowCost ?? '', Cost: r.Cost ?? '',
    Limit: r.Limit ?? '', Power: r.Power ?? '', Restriction: r.Restriction ?? '',
    Team: r.Team ?? '', Timing: r.Timing ?? '', Guard: r.Guard ?? '',
    Coin: r.Coin ?? '', Story: r.Story ?? '', LifeBurst: r.LifeBurst ?? '',
    EffectText: r.EffectText ?? '', BurstText: r.BurstText ?? '', effects: [],
  };
  const effects = mergeManualEffects(card.CardNum, parseCardEffects(card));
  for (const e of effects.filter(x => x.parseStatus === 'UNKNOWN')) {
    unknownList.push({
      cardNum: r.CardNum,
      cardName: r.CardName,
      effectText: r.EffectText ?? '',
      burstText: r.BurstText ?? '',
      rawText: e.rawText ?? '(undefined)',
    });

    const key = (e.rawText ?? '')
      .replace(/《[^》]*》/g, '《?》')
      .replace(/【[^】]*】/g, '【?】')
      .replace(/[（(].*?[)）]/g, '(...)')
      .replace(/[０-９0-9]+/g, 'N')
      .substring(0, 60)
      || '(rawText空)';
    if (!patternMap[key]) patternMap[key] = { count: 0, examples: [] };
    patternMap[key].count++;
    if (patternMap[key].examples.length < 2) patternMap[key].examples.push(`${r.CardNum} ${r.CardName}`);
  }
}

console.log(`\n=== UNKNOWN効果 全${unknownList.length}件（EffectText付き） ===\n`);
for (const u of unknownList) {
  console.log(`${u.cardNum} ${u.cardName}`);
  console.log(`  EffectText: ${u.effectText.substring(0, 100)}`);
  if (u.burstText && u.burstText !== '-') console.log(`  BurstText:  ${u.burstText.substring(0, 80)}`);
  if (u.rawText !== '(undefined)') console.log(`  rawText:    ${u.rawText.substring(0, 80)}`);
  console.log('');
}

const sorted = Object.entries(patternMap).sort((a, b) => b[1].count - a[1].count);
console.log(`=== パターン別集計 ===`);
for (const [pat, info] of sorted) {
  console.log(`\n(${info.count}件) "${pat}"`);
  info.examples.forEach(ex => console.log(`  例: ${ex}`));
}
console.log(`\nユニークパターン数: ${sorted.length}`);
