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

// ── 非破壊再生成のための「手修正カード温存」──
// 既存 effects_*.json を読み、parseStatus が MANUAL/PARTIAL を含むカードは
// パーサー出力で上書きせずカード単位で丸ごと温存する（全効果 AUTO のカードのみ再生成）。
const EFFECT_FILES = ['effects_WX.json', 'effects_WXDi.json', 'effects_WX24_26.json', 'effects_WXK.json', 'effects_misc.json'];
const PRESERVE_STATUSES = new Set(['MANUAL', 'PARTIAL']);
const existingEffects = new Map<string, any[]>();
for (const f of EFFECT_FILES) {
  const p = join(root, 'public/data', f);
  if (!existsSync(p)) continue;
  const j = JSON.parse(readFileSync(p, 'utf-8')) as Record<string, any[]>;
  for (const [id, effs] of Object.entries(j)) existingEffects.set(id, effs);
}

// 値を「リーフパス→値」の平坦マップへ。配列は添字パスで表す。
function leafMap(o: any, pre = '', out: Map<string, any> = new Map()): Map<string, any> {
  if (Array.isArray(o)) {
    o.forEach((v, i) => leafMap(v, `${pre}[${i}]`, out));
  } else if (o && typeof o === 'object') {
    for (const k of Object.keys(o)) leafMap(o[k], `${pre}.${k}`, out);
  } else {
    out.set(pre, o); // リーフ（プリミティブ）
  }
  return out;
}
// fresh が existing の「完全上位集合」か：existing の全リーフを同値で保持し、かつ追加リーフがある。
// = 既存の情報を一切失わずに情報だけ増えている（証明可能に無損失な改善）。
function isPureSuperset(existing: any, fresh: any): boolean {
  const e = leafMap(existing), f = leafMap(fresh);
  for (const [path, val] of e) {
    if (!f.has(path)) return false;            // 既存パスが消えた＝損失
    if (JSON.stringify(f.get(path)) !== JSON.stringify(val)) return false; // 値が変わった＝損失/改変
  }
  return f.size > e.size;                       // 純粋に増えている
}

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

// ── richness ガード付き収穫マージ ──
// カードごとに existing(現JSON) と fresh(パーサー出力) を比較し、
//   - 既存なし          → fresh 採用（新規カード）
//   - fresh なし/空      → existing 温存
//   - 同一              → 変化なし
//   - MANUAL/PARTIAL含む → existing 温存（手修正のハード保護）
//   - fresh が純粋上位集合 → fresh 採用（証明可能に無損失な改善のみ自動収穫）
//   - それ以外（損失/値変更/混在）→ existing 温存し、レポートに記録（人が後でレビュー）
const report: Record<string, string[]> = {
  adopted_new: [], adopted_gain: [], preserved_manual: [],
  preserved_emptyFresh: [], preserved_held: [],
};
const allIds = new Set<string>([...existingEffects.keys(), ...Object.keys(result)]);
for (const id of allIds) {
  const existing = existingEffects.get(id);
  const fresh = result[id];
  if (!existing) { report.adopted_new.push(id); continue; }              // fresh は既に result[id]
  if (!fresh || fresh.length === 0) { result[id] = existing as ReturnType<typeof parseCardEffects>; report.preserved_emptyFresh.push(id); continue; }
  if (JSON.stringify(existing) === JSON.stringify(fresh)) continue;       // 変化なし
  if (existing.some(e => PRESERVE_STATUSES.has(e?.parseStatus))) { result[id] = existing as ReturnType<typeof parseCardEffects>; report.preserved_manual.push(id); continue; }
  if (isPureSuperset(existing, fresh)) { report.adopted_gain.push(id); continue; } // fresh をそのまま採用
  result[id] = existing as ReturnType<typeof parseCardEffects>;          // 損失リスク→温存
  report.preserved_held.push(id);
}
console.log(`収穫マージ: 新規採用 ${report.adopted_new.length} / 純改善採用 ${report.adopted_gain.length} / 温存(手修正) ${report.preserved_manual.length} / 温存(要レビュー) ${report.preserved_held.length} / 温存(fresh空) ${report.preserved_emptyFresh.length}`);
// レポート出力（採用・保留の全カードIDを残し、何も黙って変えない）
{
  const lines: string[] = [];
  lines.push('# build:effects 収穫マージ レポート', '', `生成: ${new Date().toISOString()}`, '');
  const section = (title: string, ids: string[]) => {
    lines.push(`## ${title}（${ids.length}）`, '');
    if (ids.length) lines.push(ids.sort().join(', '));
    lines.push('');
  };
  section('採用：新規パース可能カード', report.adopted_new);
  section('採用：純改善（無損失で情報増）', report.adopted_gain);
  section('温存：手修正(MANUAL/PARTIAL)', report.preserved_manual);
  section('温存：要レビュー（再生成で損失/値変更/混在＝パーサー改善候補）', report.preserved_held);
  section('温存：パーサーが効果0（既存維持）', report.preserved_emptyFresh);
  writeFileSync(join(root, 'docs', 'effects_merge_report.md'), lines.join('\n'), 'utf-8');
  console.log('レポート: docs/effects_merge_report.md');
}

const total = Object.values(result).flat().length;
console.log(`効果あり: ${parsed}枚 / 合計${total}効果 / UNKNOWN: ${unknown}件`);

// JSON出力（5ファイルに分割）
const groups: Record<string, Record<string, ReturnType<typeof parseCardEffects>>> = {
  WXDi: {}, WX24_26: {}, WXK: {}, WX: {}, misc: {},
};
for (const [cardNum, effects] of Object.entries(result)) {
  if (/^WXDi/i.test(cardNum))         groups.WXDi[cardNum]    = effects;
  else if (/^WX2[4-6]/.test(cardNum)) groups.WX24_26[cardNum] = effects;
  else if (/^WXK/.test(cardNum))       groups.WXK[cardNum]     = effects;
  else if (/^WX(0[0-9]|1[0-9]|2[0-3]|EX)/.test(cardNum)) groups.WX[cardNum] = effects;
  else                                 groups.misc[cardNum]    = effects;
}
const fileMap: Record<string, string> = {
  WX:      'effects_WX.json',
  WXDi:    'effects_WXDi.json',
  WX24_26: 'effects_WX24_26.json',
  WXK:     'effects_WXK.json',
  misc:    'effects_misc.json',
};
for (const [key, fname] of Object.entries(fileMap)) {
  const outPath = join(root, 'public/data', fname);
  writeFileSync(outPath, JSON.stringify(groups[key]), 'utf-8');
  console.log(`出力: ${fname} (${Object.keys(groups[key]).length}件)`);
}
