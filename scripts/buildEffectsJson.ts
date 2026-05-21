/**
 * public/data/CardData_Sheet*.csv を読み込み、
 * parseCardEffects で全カードの効果を解析して
 * public/data/effects.json として出力するスクリプト。
 *
 * 実行: npm run build:effects
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

// 存在する Sheet*.csv を順番に読み込んで結合
const allRows: Record<string, string>[] = [];
for (let i = 1; i <= 11; i++) {
  const csvPath = join(root, `public/data/CardData_Sheet${i}.csv`);
  if (!existsSync(csvPath)) break;
  const csvText = readFileSync(csvPath, 'utf-8').replace(/^﻿/, ''); // BOM除去
  const { data } = Papa.parse<Record<string, string>>(csvText, {
    header: true,
    skipEmptyLines: true,
  });
  console.log(`Sheet${i}: ${data.length}件`);
  allRows.push(...data);
}

// CardData_TK.csv（クラフトカード・トークン）も読み込む
const tkPath = join(root, 'public/data/CardData_TK.csv');
if (existsSync(tkPath)) {
  const tkText = readFileSync(tkPath, 'utf-8').replace(/^﻿/, '');
  const { data: tkData } = Papa.parse<Record<string, string>>(tkText, {
    header: true,
    skipEmptyLines: true,
  });
  console.log(`CardData_TK: ${tkData.length}件`);
  allRows.push(...tkData);
}

const rows = allRows;

console.log(`カード数: ${rows.length}`);

// 効果解析
const result: Record<string, ReturnType<typeof parseCardEffects>> = {};
let parsed = 0, unknown = 0;

for (const r of rows) {
  const card: CardData = {
    CardNum:     r.CardNum     ?? '',
    CardName:    r.CardName    ?? '',
    ImgURL:      r.ImgURL      ?? '',
    Type:        r.Type        ?? '',
    CardClass:   r.CardClass   ?? '',
    Color:       r.Color       ?? '',
    Level:       r.Level       ?? '',
    GrowCost:    r.GrowCost    ?? '',
    Cost:        r.Cost        ?? '',
    Limit:       r.Limit       ?? '',
    Power:       r.Power       ?? '',
    Restriction: r.Restriction ?? '',
    Team:        r.Team        ?? '',
    Timing:      r.Timing      ?? '',
    Guard:       r.Guard       ?? '',
    Coin:        r.Coin        ?? '',
    Story:       r.Story       ?? '',
    LifeBurst:   r.LifeBurst   ?? '',
    EffectText:  r.EffectText  ?? '',
    BurstText:   r.BurstText   ?? '',
    effects:     [],
  };

  const parsedEffects = parseCardEffects(card);
  const effects = mergeManualEffects(card.CardNum, parsedEffects);
  if (effects.length === 0) continue;

  result[card.CardNum] = effects;
  parsed++;
  unknown += effects.filter(e => e.parseStatus === 'UNKNOWN').length;
}

const total = Object.values(result).flat().length;
console.log(`効果あり: ${parsed}枚 / 合計${total}効果 / UNKNOWN: ${unknown}件`);

// JSON出力
const outPath = join(root, 'public/data/effects.json');
writeFileSync(outPath, JSON.stringify(result), 'utf-8');
console.log(`出力: ${outPath}`);
