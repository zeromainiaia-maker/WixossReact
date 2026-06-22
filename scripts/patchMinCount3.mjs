/**
 * パターン3b（「あなたの場に＜X＞のシグニがN体あるかぎり、」）の minCount 反映用ターゲットパッチ。
 * 該当カードのみ parseCardEffects で再生成し、既存 effects_WX.json の該当エントリを差し替える。
 * 全再生成による手修正巻き戻しを避けるため、対象カードのみ touch する。
 *
 * 実行: node --import tsx scripts/patchMinCount3.mjs
 */
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import Papa from 'papaparse';
import { parseCardEffects } from '../src/data/effectParser.ts';
import { mergeManualEffects } from '../src/data/manualEffects.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

const PATTERN = /のシグニが[０-９\d]+体あるかぎり/;

// 全CSV読み込み
const allRows = [];
for (let i = 1; i <= 11; i++) {
  const csvPath = join(root, `public/data/CardData_Sheet${i}.csv`);
  if (!existsSync(csvPath)) break;
  const csvText = readFileSync(csvPath, 'utf-8').replace(/^﻿/, '');
  const { data } = Papa.parse(csvText, { header: true, skipEmptyLines: true });
  allRows.push(...data);
}

const effPath = join(root, 'public/data/effects_WX.json');
const eff = JSON.parse(readFileSync(effPath, 'utf-8'));

const stripMinCount = (json) => json.replace(/,"minCount":\d+/g, '').replace(/,"distinctNames":true/g, '');

let touched = 0;
const changedCards = [];
const suspicious = [];
for (const r of allRows) {
  const text = `${r.EffectText ?? ''}\n${r.BurstText ?? ''}`;
  if (!PATTERN.test(text)) continue;
  const cardNum = r.CardNum ?? '';
  if (!/^WX(0[0-9]|1[0-9]|2[0-3]|EX)/.test(cardNum)) continue; // effects_WX.json 対象のみ

  const card = {
    CardNum: cardNum, CardName: r.CardName ?? '', ImgURL: r.ImgURL ?? '',
    Type: r.Type ?? '', CardClass: r.CardClass ?? '', Color: r.Color ?? '',
    Level: r.Level ?? '', GrowCost: r.GrowCost ?? '', Cost: r.Cost ?? '',
    Limit: r.Limit ?? '', Power: r.Power ?? '', Restriction: r.Restriction ?? '',
    Team: r.Team ?? '', Timing: r.Timing ?? '', Guard: r.Guard ?? '',
    Coin: r.Coin ?? '', Story: r.Story ?? '', LifeBurst: r.LifeBurst ?? '',
    EffectText: r.EffectText ?? '', BurstText: r.BurstText ?? '', effects: [],
  };
  const regenerated = mergeManualEffects(cardNum, parseCardEffects(card));
  if (regenerated.length === 0) continue;

  const before = JSON.stringify(eff[cardNum] ?? null);
  const after = JSON.stringify(regenerated);
  if (before !== after) {
    // minCount を除いて比較し、それ以外の差分があるカードは手修正の可能性 → スキップ
    if (stripMinCount(before) !== stripMinCount(after)) {
      suspicious.push(cardNum);
      continue;
    }
    eff[cardNum] = regenerated;
    touched++;
    changedCards.push(cardNum);
  }
}

writeFileSync(effPath, JSON.stringify(eff), 'utf-8');
console.log(`パッチ済み: ${touched}枚`);
console.log(changedCards.join(', '));
if (suspicious.length > 0) {
  console.log(`スキップ（minCount以外の差分あり=手修正の可能性。要個別確認）: ${suspicious.join(', ')}`);
}
