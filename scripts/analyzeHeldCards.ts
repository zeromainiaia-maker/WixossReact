/**
 * 収穫マージで「温存：要レビュー」になったカード＝現パーサーが既存JSONを再現できない札を、
 * 「パーサーがどの構文を落としているか」のパターン別に分類・件数化する。
 * existing(git HEAD の effects_*.json) と fresh(現パーサー出力) のリーフ差分を集計。
 *
 * 実行: npx tsx scripts/analyzeHeldCards.ts
 */
import { readFileSync, existsSync } from 'fs';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import Papa from 'papaparse';
import { parseCardEffects } from '../src/data/effectParser';
import { mergeManualEffects } from '../src/data/manualEffects';
import type { CardData } from '../src/types';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const EFFECT_FILES = ['effects_WX.json', 'effects_WXDi.json', 'effects_WX24_26.json', 'effects_WXK.json', 'effects_misc.json'];
const PRESERVE = new Set(['MANUAL', 'PARTIAL']);

// 既存（HEAD）
const existing = new Map<string, any[]>();
for (const f of EFFECT_FILES) {
  const j = JSON.parse(execSync(`git show HEAD:public/data/${f}`, { maxBuffer: 1e9 }).toString());
  for (const [k, v] of Object.entries(j)) existing.set(k, v as any[]);
}
// CSV → fresh パース
const rows: Record<string, string>[] = [];
for (let i = 1; i <= 11; i++) {
  const p = join(root, `public/data/CardData_Sheet${i}.csv`);
  if (!existsSync(p)) break;
  const { data } = Papa.parse<Record<string, string>>(readFileSync(p, 'utf-8').replace(/^﻿/, ''), { header: true, skipEmptyLines: true });
  rows.push(...data);
}
const tk = join(root, 'public/data/CardData_TK.csv');
if (existsSync(tk)) { const { data } = Papa.parse<Record<string, string>>(readFileSync(tk, 'utf-8').replace(/^﻿/, ''), { header: true, skipEmptyLines: true }); rows.push(...data); }
const fresh = new Map<string, any[]>();
for (const r of rows) {
  const card = { ...r, effects: [] } as unknown as CardData;
  if (!r.CardNum) continue;
  const eff = mergeManualEffects(r.CardNum, parseCardEffects(card));
  if (eff.length) fresh.set(r.CardNum, eff);
}

function leafMap(o: any, pre = '', out = new Map<string, any>()): Map<string, any> {
  if (Array.isArray(o)) o.forEach((v, i) => leafMap(v, `${pre}[${i}]`, out));
  else if (o && typeof o === 'object') for (const k of Object.keys(o)) leafMap(o[k], `${pre}.${k}`, out);
  else out.set(pre, o);
  return out;
}
function isPureSuperset(e: any, f: any): boolean {
  const em = leafMap(e), fm = leafMap(f);
  for (const [p, v] of em) { if (!fm.has(p)) return false; if (JSON.stringify(fm.get(p)) !== JSON.stringify(v)) return false; }
  return fm.size > em.size;
}

// パターン分類：失われたリーフパス（の末尾キー）を意味カテゴリへ
function categorize(path: string): string {
  if (/frontOfSelf/.test(path)) return 'target.frontOfSelf（正面）';
  if (/\.activeCondition/.test(path)) return 'activeCondition（〜があるかぎり等）';
  if (/\.triggerCondition|\.triggerScope|\.triggerFilter/.test(path)) return 'triggerCondition/Scope/Filter（トリガー詳細）';
  if (/\.timing\b/.test(path)) return 'timing（トリガー種別）';
  if (/\.duration\b/.test(path)) return 'duration（期間）';
  if (/target\.filter\.story|source\.filter\.story/.test(path)) return 'filter.story（種族）';
  if (/filter\.color|filter\.colorMatchesLrig/.test(path)) return 'filter.color（色）';
  if (/filter\.isResona/.test(path)) return 'filter.isResona';
  if (/filter\.thisCardOnly/.test(path)) return 'filter.thisCardOnly';
  if (/filter\.cardType/.test(path)) return 'filter.cardType';
  if (/\.filter\b|\.filter\./.test(path)) return 'filter（その他）';
  if (/\.optional\b/.test(path)) return 'optional（任意）';
  if (/\.excludeSelf\b/.test(path)) return 'excludeSelf（他の）';
  if (/\.upToCount\b/.test(path)) return 'upToCount（〜まで）';
  if (/\.cost\b|\.cost\./.test(path)) return 'cost（コスト）';
  if (/\.then\b|\.then\.|\.steps/.test(path)) return 'then/steps（後続処理）';
  if (/\.type\b/.test(path)) return 'type（アクション種別）';
  if (/\.count\b/.test(path)) return 'count（数）';
  return 'その他: ' + path.replace(/\[\d+\]/g, '[]');
}

const patternCount = new Map<string, number>();      // カテゴリ → 該当カード数（重複なし）
const patternCards = new Map<string, Set<string>>();
let held = 0, valueChangeOnly = 0;
for (const [id, e] of existing) {
  const f = fresh.get(id);
  if (!f) continue;
  if (JSON.stringify(e) === JSON.stringify(f)) continue;
  if (e.some(x => PRESERVE.has(x?.parseStatus))) continue;
  if (isPureSuperset(e, f)) continue; // 採用済み
  held++;
  const em = leafMap(e), fm = leafMap(f);
  const cats = new Set<string>();
  let anyLost = false;
  for (const [p, v] of em) {
    if (!fm.has(p)) { cats.add(categorize(p)); anyLost = true; }
    else if (JSON.stringify(fm.get(p)) !== JSON.stringify(v)) cats.add('値変更: ' + categorize(p));
  }
  if (!anyLost && [...cats].every(c => c.startsWith('値変更'))) valueChangeOnly++;
  for (const c of cats) {
    patternCount.set(c, (patternCount.get(c) ?? 0) + 1);
    if (!patternCards.has(c)) patternCards.set(c, new Set());
    patternCards.get(c)!.add(id);
  }
}

console.log(`要レビュー(held)カード: ${held}  うち値変更のみ: ${valueChangeOnly}`);
console.log('\n=== パターン別カード数（多い順）===');
const sorted = [...patternCount.entries()].sort((a, b) => b[1] - a[1]);
for (const [cat, n] of sorted) {
  const ex = [...patternCards.get(cat)!].sort().slice(0, 6).join(', ');
  console.log(`${String(n).padStart(4)}  ${cat}  例: ${ex}`);
}
