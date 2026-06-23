/**
 * migrateSendToEnergy.ts
 * 「対戦相手のシグニをエナゾーンに置く（エナ送り）」を BANISH で代用していた既存JSONを
 * SEND_TO_ENERGY へ移行する。
 *
 * 安全策（リコレクト移行と同じ）: 対象カードを parseCardEffects で再パースし、
 * 「現JSON」と「再パース結果」が BANISH↔SEND_TO_ENERGY / maxPower↔powerRange.max を
 * 同一視した正規化比較で一致する場合のみ、パーサー出力（SEND_TO_ENERGY入り）を再適用する。
 * 一致しない（手書き/構造差/未パース）カードは触らず manual-review として列挙。
 *
 * 実行: npx tsx scripts/migrateSendToEnergy.ts        (dry-run, 一覧表示)
 *       npx tsx scripts/migrateSendToEnergy.ts --write (適用)
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
const write = process.argv.includes('--write');

// ── カード読み込み ──
const cards = new Map<string, CardData>();
for (let i = 1; i <= 11; i++) {
  const p = join(root, `public/data/CardData_Sheet${i}.csv`);
  if (!existsSync(p)) continue;
  const text = readFileSync(p, 'utf-8').replace(/^﻿/, '');
  const { data } = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: true });
  for (const r of data) { const id = r.CardNum?.trim(); if (id && !cards.has(id)) cards.set(id, r as unknown as CardData); }
}

// ── 効果ファイル ──
const FILES = ['effects_WX.json', 'effects_WXDi.json', 'effects_WX24_26.json', 'effects_WXK.json', 'effects_misc.json'];
const data: Record<string, Record<string, unknown>> = {};
const pretty: Record<string, boolean> = {}; // 元ファイルが整形済み(改行あり)なら維持
const fileOf = new Map<string, string>();
for (const f of FILES) {
  const raw = readFileSync(join(root, 'public/data', f), 'utf-8');
  pretty[f] = raw.includes('\n');
  data[f] = JSON.parse(raw);
  for (const id of Object.keys(data[f])) fileOf.set(id, f);
}

// BANISH↔SEND_TO_ENERGY / maxPower↔powerRange.max を同一視した正規化
/* eslint-disable @typescript-eslint/no-explicit-any */
function norm(o: any): any {
  if (Array.isArray(o)) return o.map(norm);
  if (o && typeof o === 'object') {
    // 旧表現の同一視: BANISH / SEND_TO_ENERGY / 壊れたENERGY_CHARGE(フィールドSIGNI対象) はすべて「エナ送り(ENA)」扱い。
    // 正規のENERGY_CHARGE(デッキ/手札からチャージ)は target.type が DECK_CARD/HAND_CARD 等なので対象外。
    const isEnaSend = o.type === 'BANISH' || o.type === 'SEND_TO_ENERGY'
      || (o.type === 'ENERGY_CHARGE' && o.target?.type === 'SIGNI');
    const r: any = {};
    for (const k of Object.keys(o).sort()) {
      if (k === 'type' && isEnaSend) { r[k] = 'ENA'; continue; }
      r[k] = norm(o[k]);
    }
    // filter内 maxPower → powerRange.max に寄せる
    if (r.maxPower != null) { r.powerRange = { ...(r.powerRange || {}), max: r.maxPower }; delete r.maxPower; }
    // cardType:'シグニ' は SIGNI対象では自明なので比較から除外（旧ENERGY_CHARGEは付与、新SEND_TO_ENERGYは省略しがち）
    if (r.cardType === 'シグニ') delete r.cardType;
    return r;
  }
  return o;
}
const eq = (a: any, b: any) => JSON.stringify(norm(a)) === JSON.stringify(norm(b));
const has = (node: any, type: string): boolean => {
  let f = false; const walk = (o: any) => { if (!o || typeof o !== 'object' || f) return; if (Array.isArray(o)) { o.forEach(walk); return; } if (o.type === type) { f = true; return; } for (const k in o) walk(o[k]); };
  walk(node); return f;
};

// 対象カード
const targets: string[] = [];
for (const [id, c] of cards) {
  const et = (c.EffectText ?? '') + (c.BurstText ?? '');
  if (/対戦相手の.{0,30}シグニ.{0,10}をエナゾーンに置く/.test(et)) targets.push(id);
}

const applied: string[] = [];
const already: string[] = [];
const review: { id: string; reason: string }[] = [];

for (const id of targets) {
  const f = fileOf.get(id);
  const card = cards.get(id);
  if (!f || !card) { review.push({ id, reason: 'JSON未登録' }); continue; }
  const cur = data[f][id];
  if (has(cur, 'SEND_TO_ENERGY')) { already.push(id); continue; }
  const parsed = mergeManualEffects(id, parseCardEffects(card));
  if (!has(parsed, 'SEND_TO_ENERGY')) { review.push({ id, reason: '再パースにSEND_TO_ENERGYなし(STUB/未対応)' }); continue; }
  if (eq(cur, parsed)) {
    if (write) data[f][id] = parsed;
    applied.push(id);
  } else {
    review.push({ id, reason: '現JSONと再パースが不一致(手書き/構造差)' });
  }
}

if (write) {
  for (const f of FILES) {
    const out = pretty[f] ? JSON.stringify(data[f], null, 2) + '\n' : JSON.stringify(data[f]);
    writeFileSync(join(root, 'public/data', f), out);
  }
}

console.log(`対象: ${targets.length}枚`);
console.log(`既にSEND_TO_ENERGY: ${already.length}枚`, already.join(', '));
console.log(`${write ? '適用' : '適用可(一致)'}: ${applied.length}枚`, applied.join(', '));
console.log(`要手動確認: ${review.length}枚`);
for (const r of review) console.log(`  - ${r.id}: ${r.reason}`);
