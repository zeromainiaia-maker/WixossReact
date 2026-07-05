/**
 * 指定カード番号のみ effects を再生成して effects_*.json にパッチするスクリプト。
 * 全再生成は ~90枚が退化するため、source 欠落族など個別修正カードのみを対象に使う。
 *
 * 実行: npx tsx scripts/regenCards.ts WX24-P2-007 WXDi-P01-032 ...
 *       --dry を付けると差分表示のみ（書き込まない）
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

const args = process.argv.slice(2);
const dry = args.includes('--dry');
const targets = args.filter(a => !a.startsWith('--'));
if (targets.length === 0) { console.error('カード番号を指定してください'); process.exit(1); }

// CSV を全部読んで cardMap を作る
const rows: Record<string, string>[] = [];
for (let i = 1; i <= 11; i++) {
  const p = join(root, `public/data/CardData_Sheet${i}.csv`);
  if (!existsSync(p)) break;
  const { data } = Papa.parse<Record<string, string>>(readFileSync(p, 'utf-8').replace(/^﻿/, ''), { header: true, skipEmptyLines: true });
  rows.push(...data);
}
const tkP = join(root, 'public/data/CardData_TK.csv');
if (existsSync(tkP)) {
  const { data } = Papa.parse<Record<string, string>>(readFileSync(tkP, 'utf-8').replace(/^﻿/, ''), { header: true, skipEmptyLines: true });
  rows.push(...data);
}
const cardMap = new Map<string, Record<string, string>>();
for (const r of rows) { const id = r.CardNum?.trim(); if (id && !cardMap.has(id)) cardMap.set(id, r); }

function fileFor(cardNum: string): string {
  if (/^WXDi/i.test(cardNum)) return 'effects_WXDi.json';
  if (/^WX2[4-6]/.test(cardNum)) return 'effects_WX24_26.json';
  if (/^WXK/.test(cardNum)) return 'effects_WXK.json';
  if (/^WX(0[0-9]|1[0-9]|2[0-3]|EX)/.test(cardNum)) return 'effects_WX.json';
  return 'effects_misc.json';
}

// ファイルごとにまとめて読み書き
const fileCache = new Map<string, Record<string, unknown>>();
function loadFile(fname: string): Record<string, unknown> {
  if (!fileCache.has(fname)) {
    const p = join(root, 'public/data', fname);
    fileCache.set(fname, JSON.parse(readFileSync(p, 'utf-8')));
  }
  return fileCache.get(fname)!;
}

for (const cardNum of targets) {
  const r = cardMap.get(cardNum);
  if (!r) { console.error(`✗ ${cardNum}: CSV に見つからない`); continue; }
  const card: CardData = {
    CardNum: r.CardNum ?? '', CardName: r.CardName ?? '', ImgURL: r.ImgURL ?? '',
    Type: r.Type ?? '', CardClass: r.CardClass ?? '', Color: r.Color ?? '', Level: r.Level ?? '',
    GrowCost: r.GrowCost ?? '', Cost: r.Cost ?? '', Limit: r.Limit ?? '', Power: r.Power ?? '',
    Restriction: r.Restriction ?? '', Team: r.Team ?? '', Timing: r.Timing ?? '', Guard: r.Guard ?? '',
    Coin: r.Coin ?? '', Story: r.Story ?? '', LifeBurst: r.LifeBurst ?? '',
    EffectText: r.EffectText ?? '', BurstText: r.BurstText ?? '', effects: [],
  };
  const parsed = parseCardEffects(card);
  const effects = mergeManualEffects(card.CardNum, parsed);
  const fname = fileFor(cardNum);
  const data = loadFile(fname);
  const before = JSON.stringify(data[cardNum]);
  const after = JSON.stringify(effects);
  if (before === after) { console.log(`= ${cardNum}: 変化なし (${fname})`); continue; }
  console.log(`\n▶ ${cardNum} (${fname})`);
  console.log(`  BEFORE: ${before ?? '(なし)'}`);
  console.log(`  AFTER : ${after}`);
  if (!dry) data[cardNum] = effects;
}

if (!dry) {
  for (const [fname, data] of fileCache) {
    writeFileSync(join(root, 'public/data', fname), JSON.stringify(data), 'utf-8');
    console.log(`\n書込: ${fname}`);
  }
} else {
  console.log('\n[--dry] 書き込みなし');
}
