import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import Papa from 'papaparse';
import { analyzeParseResults } from '../src/data/effectParser';
import type { CardData } from '../src/types';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

const makeCard = (r: Record<string, string>): CardData => ({
  CardNum: r.CardNum ?? '', CardName: r.CardName ?? '', ImgURL: '',
  Type: r.Type ?? '', CardClass: r.CardClass ?? '', Color: r.Color ?? '',
  Level: r.Level ?? '', GrowCost: r.GrowCost ?? '', Cost: r.Cost ?? '',
  Limit: r.Limit ?? '', Power: r.Power ?? '', Restriction: r.Restriction ?? '',
  Team: r.Team ?? '', Timing: r.Timing ?? '', Guard: r.Guard ?? '',
  Coin: r.Coin ?? '', Story: r.Story ?? '', LifeBurst: r.LifeBurst ?? '',
  EffectText: r.EffectText ?? '', BurstText: r.BurstText ?? '', effects: [],
});

const allRows: Record<string, string>[] = [];
for (let i = 1; i <= 11; i++) {
  const p = join(root, `public/data/CardData_Sheet${i}.csv`);
  if (!existsSync(p)) break;
  const { data } = Papa.parse<Record<string, string>>(
    readFileSync(p, 'utf-8').replace(/^﻿/, ''), { header: true, skipEmptyLines: true }
  );
  console.log(`Sheet${i}: ${data.length}件`);
  allRows.push(...data);
}

const tkPath = join(root, 'public/data/CardData_TK.csv');
let tkRows: Record<string, string>[] = [];
if (existsSync(tkPath)) {
  const { data } = Papa.parse<Record<string, string>>(
    readFileSync(tkPath, 'utf-8').replace(/^﻿/, ''), { header: true, skipEmptyLines: true }
  );
  tkRows = data;
  console.log(`TK: ${data.length}件`);
}

const sheetCards = allRows.map(makeCard);
const tokenCards = tkRows.map(makeCard);
const allCards = [...sheetCards, ...tokenCards];
console.log(`\n合計カード数: ${allCards.length}枚 (Sheet: ${sheetCards.length}, TK: ${tokenCards.length})\n`);

const res = analyzeParseResults(allCards);
const pct = (v: number) => (v / res.total * 100).toFixed(1);

console.log('=== パース率分析 ===');
console.log(`効果数合計 : ${res.total}`);
console.log(`AUTO       : ${res.auto} (${pct(res.auto)}%)`);
console.log(`PARTIAL    : ${res.partial} (${pct(res.partial)}%)`);
console.log(`UNKNOWN    : ${res.unknown} (${pct(res.unknown)}%)`);
console.log(`自動解決率 : ${pct(res.auto + res.partial)}% (AUTO+PARTIAL)`);

if (res.unknownCards.length > 0) {
  console.log(`\n--- UNKNOWNカード (${res.unknownCards.length}件) ---`);
  // カード番号でユニーク化
  const seen = new Set<string>();
  const unique = res.unknownCards.filter(c => { if (seen.has(c.cardNum)) return false; seen.add(c.cardNum); return true; });
  console.log(`UNKNOWNカード種類: ${unique.length}枚`);
  unique.forEach(c => console.log(`  ${c.cardNum}  ${c.cardName}`));
}
