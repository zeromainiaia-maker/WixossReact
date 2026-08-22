/**
 * cardProgressCensus.mjs — **カード単位の進捗計器**（2026-08-22 続き595 新設）
 *
 * ## 何を答える計器か
 * 「全カード約7000枚のうち、どれだけ出来ているのか」への**分解した回答**。
 * ⚠**単一の「完成度○%」は出さない**（PLAN §3 の原則＝件数メトリクスを完了指標にしない）。
 * 代わりに **母数 → 効果の parseStatus → 懸念フラグ別のカード数** の3段で出す。
 *
 * ## 使い方
 *   npm run census:cards
 *
 * ## 実測して踏んだ罠（同じ数え違いを繰り返さないために残す）
 * 1. 🔴**CSV は効果なしカードを `--` で表す**（空文字ではない）＝空判定だけだと
 *    「6712枚 全部に効果テキストがある」という誤った母数になる。
 * 2. 🔴**`docs/_vocab_census.txt` は「### 高シグナル」の *次の行以降* に effectId が
 *    スペース区切りで並ぶ**＝行頭アンカーで拾うと1行1件しか取れず 604→108 と過小に出る。
 * 3. 🔴**STUB を「未実装」と数えない**（CLAUDE.md）＝実装済みハンドラの表示名でもある。
 *    無言 no-op は `census:stubs` の A群🔴 が測っており現在0件。ここでは参考値として出すだけ。
 *    STUB を懸念に数えると clean 率が 80.9% → 52.2% に化ける（実測）。
 * 4. **「効果テキストがあるのに live に効果が無い」56枚は実害なし**＝全部が括弧内の注釈だけ
 *    （【マルチエナ】52枚＋コイン／リミットアッパー／バリアのトークン4枚）で、能力自体は別機構。
 */
import fs from 'fs';
import Papa from 'papaparse';

// ── 母数：CSV の全カード（先勝ち＝decompile/build と同じ規約）──
const rows = new Map();
for (let i = 1; i <= 11; i++) {
  const p = `public/data/CardData_Sheet${i}.csv`;
  if (!fs.existsSync(p)) break;
  for (const r of Papa.parse(fs.readFileSync(p, 'utf-8').replace(/^﻿/, ''), { header: true, skipEmptyLines: true }).data) {
    const id = (r.CardNum ?? '').trim(); if (id && !rows.has(id)) rows.set(id, r);
  }
}
if (fs.existsSync('public/data/CardData_TK.csv')) {
  for (const r of Papa.parse(fs.readFileSync('public/data/CardData_TK.csv', 'utf-8').replace(/^﻿/, ''), { header: true, skipEmptyLines: true }).data) {
    const id = (r.CardNum ?? '').trim(); if (id && !rows.has(id)) rows.set(id, r);
  }
}

const live = {};
for (const k of ['WX', 'WXDi', 'WX24_26', 'WXK', 'misc']) Object.assign(live, JSON.parse(fs.readFileSync(`public/data/effects_${k}.json`, 'utf-8')));

// ⚠CSV は効果なしカードを **`--`** で表す（空文字ではない）。空判定だけだと
//   「6712枚 全部に効果テキストがある」という誤った母数になる（実測して修正）。
const isBlank = v => { const t = (v ?? '').trim(); return t === '' || /^-+$/.test(t); };
const hasText = id => {
  const r = rows.get(id) ?? {};
  return !(isBlank(r.EffectText) && isBlank(r.BurstText));
};

// ── 効果・parseStatus の内訳 ──
const status = {}; let effTotal = 0;
const stubEffects = new Set(), stubCards = new Set();
for (const c of Object.keys(live)) for (const e of live[c] ?? []) {
  effTotal++; status[e.parseStatus ?? '?'] = (status[e.parseStatus ?? '?'] ?? 0) + 1;
  if (/"type":"STUB"/.test(JSON.stringify(e))) { stubEffects.add(e.effectId); stubCards.add(c); }
}

// ── 計器ごとの「懸念があるカード」──
const flags = new Map();  // cardNum -> Set<flag>
const mark = (card, f) => { if (!flags.has(card)) flags.set(card, new Set()); flags.get(card).add(f); };

// (1) 語彙センサス（高シグナル欠落）
const cardOf = eid => Object.keys(live).find(c => (live[c] ?? []).some(e => e.effectId === eid));
// ⚠明細は「### 高シグナル（対応語彙なし）」の**次の行以降にスペース区切りで effectId が並ぶ**形式。
// 行頭アンカーで拾うと1行1件しか取れず 108カードに見える（実測して修正）。
const censusLines = fs.readFileSync('docs/_vocab_census.txt', 'utf-8').split(/\r?\n/);
const censusEffects = new Set();
const effToCard = new Map();
for (const c of Object.keys(live)) for (const e of live[c] ?? []) effToCard.set(e.effectId, c);
for (let i = 0; i < censusLines.length; i++) {
  if (!/^### 高シグナル/.test(censusLines[i])) continue;
  for (let j = i + 1; j < censusLines.length && !/^#/.test(censusLines[j]); j++) {
    for (const id of censusLines[j].trim().split(/\s+/).filter(Boolean)) censusEffects.add(id);
  }
}
for (const eid of censusEffects) { const card = effToCard.get(eid); if (card) mark(card, 'census'); }

// (2) 意味照合監査の未消化 findings
const D = 'scripts/archive/scratchpad/semantic_audit_clean_round1/';
const findings = fs.readFileSync(D + 'findings.jsonl', 'utf-8').split('\n').filter(Boolean).map(l => JSON.parse(l));
const st0 = JSON.parse(fs.readFileSync(D + 'clusters_stage0.json', 'utf-8'));
const removed = new Set();
for (const rowsLike of Object.values(st0.excluded ?? {})) for (const r of rowsLike) removed.add(`${r.effectId} ${r.quote}`);
const closed = new Set(fs.readFileSync(D + 'stage2_closed.txt', 'utf-8').split('\n').map(l => l.replace(/#.*$/, '').trim()).filter(Boolean));
const fpIds = new Set();
for (const f of fs.readdirSync(D).filter(n => /^stage1_batch\d+_triage\.md$/.test(n))) {
  for (const line of fs.readFileSync(D + f, 'utf-8').split('\n')) {
    const m = line.match(/^\|\s*([A-Za-z0-9][A-Za-z0-9-]*?-(?:E\d+[a-z]?|BURST|CB-E\d+|[A-Z]{2,}))\s*\|\s*(?:AUTO|MANUAL|PARTIAL)\s*\|\s*([^|]+?)\s*\|/);
    if (m && m[2].includes('偽陽性') && !m[2].includes('真バグ')) fpIds.add(m[1]);
  }
}
let openFindings = 0;
for (const f of findings) {
  if (removed.has(`${f.effectId} ${f.quote}`) || closed.has(f.effectId) || fpIds.has(f.effectId)) continue;
  openFindings++; if (live[f.cardNum]) mark(f.cardNum, 'audit');
}
// (3) ⚠**STUB は「未実装」ではない**（実装済みハンドラの表示名でもある＝CLAUDE.md）。
//     無言 no-op（`census:stubs` の A群🔴）は現在0件なので、**懸念フラグには数えない**（別枠で表示）。
// (4) 収穫マージの温存キュー
for (const c of Object.keys(JSON.parse(fs.readFileSync('docs/_held_fresh.json', 'utf-8')))) mark(c, 'held');
for (const c of Object.keys(JSON.parse(fs.readFileSync('docs/_partial_fresh.json', 'utf-8')))) mark(c, 'partial');

// ── 集計 ──
const all = [...rows.keys()];
const withText = all.filter(hasText);
const withEffects = Object.keys(live);
const audited = new Set(fs.readFileSync(D + 'audited_clean_cards_cumulative.txt', 'utf-8').split('\n').map(s => s.trim()).filter(Boolean));

const clean = withEffects.filter(c => !flags.has(c));
const byFlag = f => withEffects.filter(c => flags.get(c)?.has(f)).length;

console.log('===== カード母数 =====');
console.log(`CSV の全カード              : ${all.length}`);
console.log(`  効果テキストを持つ        : ${withText.length}`);
console.log(`  live に効果が載っている    : ${withEffects.length}  （効果 ${effTotal}件）`);
console.log(`  効果テキスト無し（バニラ等）: ${all.length - withText.length}`);
console.log('\n===== 効果の parseStatus =====');
for (const [k, v] of Object.entries(status).sort((a, b) => b[1] - a[1])) console.log(`  ${k.padEnd(8)} ${String(v).padStart(6)}  (${(v / effTotal * 100).toFixed(1)}%)`);
console.log('\n===== 「懸念フラグ」が立つカード（重複あり）=====');
console.log(`  census（語彙の欠落疑い）    : ${byFlag('census')}`);
console.log(`  意味照合の未消化 findings   : ${byFlag('audit')}   （findings ${openFindings}件）`);
console.log(`  （参考）STUB を含むカード   : ${stubCards.size}（STUB効果 ${stubEffects.size}件）※STUB＝未実装ではない。無言 no-op は census:stubs A群🔴＝0`);
console.log(`  held（parser 改善の未採用）  : ${byFlag('held')}`);
console.log(`  partial（同上・MANUAL 混在） : ${byFlag('partial')}`);
console.log('\n===== 束ねた現在地 =====');
console.log(`  どのフラグも立たないカード  : ${clean.length} / ${withEffects.length}  (${(clean.length / withEffects.length * 100).toFixed(1)}%)`);
console.log(`  フラグが1つ以上あるカード   : ${flags.size}`);
console.log(`  意味照合監査を通したカード  : ${audited.size}（clean群）＋ 2401（stub群・PLAN 記載）= ${audited.size + 2401} / ${withEffects.length}  (${((audited.size + 2401) / withEffects.length * 100).toFixed(1)}%)`);
