/**
 * cardProgressCensus.mjs — **カード単位の進捗計器**（2026-08-22 続き595 新設）
 *
 * ## 何を答える計器か
 * 「全カード約7000枚のうち、どれだけ出来ているのか」への**分解した回答**。
 * ⚠**単一の「完成度○%」は出さない**（PLAN §3 の原則＝件数メトリクスを完了指標にしない）。
 * 代わりに **母数 → 効果の parseStatus → 懸念フラグ別のカード数** の3段で出す。
 *
 * ## 使い方
 *   npm run census:cards                       … 全カードの現在地
 *   npm run census:cards -- --sheet 1          … **1枚の CSV だけを母数にする**（Sheet1 = WX01〜WX11＋WD01〜05）
 *   npm run census:cards -- --sheet 1 --list   … そのスコープで懸念フラグが立つカードを列挙（次バッチの取り出し口）
 *
 * ## `--sheet` は何のためにあるか（2026-08-27 続き679 新設）
 * 全6,666枚を分母にすると、計器が新しい findings を生み続けて **0 に向かうカウンタにならない**
 * （＝「終わりが見えない」）。**1シートを分母に固定すると有限で単調減少するカウンタになる**。
 * ⚠**シートの帰属は「先勝ち」**＝`CardData_Sheet1.csv` に先に出たカードは Sheet1 のもの
 *   （decompile / build:effects と同じ規約）。同じカードが後のシートにも載っていても二重に数えない。
 * ⚠**「懸念ゼロ」は「正しい」ではない**＝計器が見ていないだけ。シートを閉じるには
 *   フラグの立たない残りへの**検出パス**（そのシート限定の意味照合再監査）が別途要る。
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
 * 5. 🔴**意味照合の残 OPEN を自前で数えない**（2026-08-27 続き679 に実測して修正）。
 *    従来このファイルは `stage2_closed.txt` を素の Set で読んでいたため、
 *    **`EFFECTID :: <quote>` 形（488件中332件）を1件も消化として数えられず**、
 *    未消化 findings を **643 → 948**、影響カードを **485 → 695** と大幅に過大報告していた。
 *    ⇒ **判定は `scripts/archive/semanticAuditLedger.mjs`（唯一の残件カウンタ）から import する。**
 *    同じ「インライン実装が合流点から乖離する」型は同日の Sheet1 B1 でも踏んでいる（BUGFIXES 参照）。
 */
import fs from 'fs';
import Papa from 'papaparse';
// 🔴意味照合の残 OPEN は**この1本だけ**が正（罠5）。import しても何も印字しない作りにしてある。
import { open as ledgerOpen } from './archive/semanticAuditLedger.mjs';

// ── 引数：--sheet <1|Sheet1|CardData_Sheet1.csv> / --list ──
const argv = process.argv.slice(2);
const sheetArg = (() => {
  const i = argv.indexOf('--sheet');
  if (i < 0) return null;
  const raw = (argv[i + 1] ?? '').trim();
  if (!raw || raw.startsWith('--')) { console.error('--sheet には 1 / Sheet1 / CardData_Sheet1.csv のいずれかを渡す'); process.exit(1); }
  const m = raw.match(/^(?:CardData_)?(?:Sheet)?([0-9]+|TK)(?:\.csv)?$/i);
  if (!m) { console.error(`--sheet の指定が不正: ${raw}`); process.exit(1); }
  return m[1].toUpperCase() === 'TK' ? 'CardData_TK.csv' : `CardData_Sheet${m[1]}.csv`;
})();
const listMode = argv.includes('--list');

// ── 母数：CSV の全カード（先勝ち＝decompile/build と同じ規約）──
const rows = new Map();
const sheetOf = new Map();   // cardNum -> 最初に出会った CSV 名（＝先勝ちの帰属）
const loadCsv = file => {
  const p = `public/data/${file}`;
  if (!fs.existsSync(p)) return false;
  for (const r of Papa.parse(fs.readFileSync(p, 'utf-8').replace(/^﻿/, ''), { header: true, skipEmptyLines: true }).data) {
    const id = (r.CardNum ?? '').trim();
    if (id && !rows.has(id)) { rows.set(id, r); sheetOf.set(id, file); }
  }
  return true;
};
for (let i = 1; i <= 11; i++) if (!loadCsv(`CardData_Sheet${i}.csv`)) break;
loadCsv('CardData_TK.csv');
if (sheetArg && ![...sheetOf.values()].includes(sheetArg)) {
  console.error(`--sheet ${sheetArg} に該当するカードが1枚も無い（ファイル名を確認）`); process.exit(1);
}
// スコープ述語＝`--sheet` 無指定なら全カード。指定時は**そのシートに帰属するカードだけ**。
const inScope = id => !sheetArg || sheetOf.get(id) === sheetArg;

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
for (const c of Object.keys(live).filter(inScope)) for (const e of live[c] ?? []) {
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
// 🔴**自前で数えない**（罠5）＝残 OPEN の判定は `semanticAuditLedger.mjs` が唯一の実装。
//   従来ここに置いていたローカル版は `stage2_closed.txt` の `EFFECTID :: <quote>` 形（488件中332件）を
//   見落としており、未消化を 643→948 と過大に報告していた。
const D = 'scripts/archive/scratchpad/semantic_audit_clean_round1/';
let openFindings = 0;
for (const f of ledgerOpen) {
  const card = f.cardNum ?? effToCard.get(f.effectId);
  if (!card || !live[card]) continue;
  mark(card, 'audit');                 // フラグは全カードに立てる（byFlag 側がスコープで絞る）
  if (inScope(card)) openFindings++;   // ⚠件数だけは**スコープ内に限る**（旧＝全体の643件を出していた）
}
// (3) ⚠**STUB は「未実装」ではない**（実装済みハンドラの表示名でもある＝CLAUDE.md）。
//     無言 no-op（`census:stubs` の A群🔴）は現在0件なので、**懸念フラグには数えない**（別枠で表示）。
// (4) 収穫マージの温存キュー
for (const c of Object.keys(JSON.parse(fs.readFileSync('docs/_held_fresh.json', 'utf-8')))) mark(c, 'held');
for (const c of Object.keys(JSON.parse(fs.readFileSync('docs/_partial_fresh.json', 'utf-8')))) mark(c, 'partial');
// (5) 🆕**id 集合が live と fresh でズレたカード**（§6.4 O-39）＝収穫マージが effectId で
//     突き合わせられず、そのカードへの parser 改善が届いていない。「parser を直したのに live が
//     変わらない」ときの三大容疑者のひとつ（held / partial / idset）なので懸念フラグに数える。
if (fs.existsSync('docs/_idset_fresh.json')) {
  for (const c of Object.keys(JSON.parse(fs.readFileSync('docs/_idset_fresh.json', 'utf-8')))) mark(c, 'idset');
}

// ── 集計（`--sheet` 指定時はすべてそのシートに帰属するカードだけ）──
const all = [...rows.keys()].filter(inScope);
const withText = all.filter(hasText);
const withEffects = Object.keys(live).filter(inScope);
const scopeLabel = sheetArg ? `${sheetArg} スコープ` : '全カード';
const audited = new Set(fs.readFileSync(D + 'audited_clean_cards_cumulative.txt', 'utf-8').split('\n').map(s => s.trim()).filter(Boolean));

const flagged = withEffects.filter(c => flags.has(c));
const clean = withEffects.filter(c => !flags.has(c));
const byFlag = f => withEffects.filter(c => flags.get(c)?.has(f)).length;
const pct = (n, d) => d ? `${(n / d * 100).toFixed(1)}%` : '—';

console.log(`===== カード母数（${scopeLabel}）=====`);
console.log(`CSV の全カード              : ${all.length}`);
console.log(`  効果テキストを持つ        : ${withText.length}`);
console.log(`  live に効果が載っている    : ${withEffects.length}  （効果 ${effTotal}件）`);
console.log(`  効果テキスト無し（バニラ等）: ${all.length - withText.length}`);
console.log('\n===== 効果の parseStatus =====');
for (const [k, v] of Object.entries(status).sort((a, b) => b[1] - a[1])) console.log(`  ${k.padEnd(8)} ${String(v).padStart(6)}  (${pct(v, effTotal)})`);
console.log('\n===== 「懸念フラグ」が立つカード（重複あり）=====');
console.log(`  census（語彙の欠落疑い）    : ${byFlag('census')}`);
console.log(`  意味照合の未消化 findings   : ${byFlag('audit')}   （このスコープの findings ${openFindings}件／台帳の残 OPEN 全体 ${ledgerOpen.length}件）`);
console.log(`  （参考）STUB を含むカード   : ${stubCards.size}（STUB効果 ${stubEffects.size}件）※STUB＝未実装ではない。無言 no-op は census:stubs A群🔴＝0`);
console.log(`  held（parser 改善の未採用）  : ${byFlag('held')}`);
console.log(`  partial（同上・MANUAL 混在） : ${byFlag('partial')}`);
console.log(`  idset（id 集合ズレ＝§6.4 O-39）: ${byFlag('idset')}`);
console.log(`\n===== 束ねた現在地（${scopeLabel}）=====`);
console.log(`  🎯要対応カード（フラグ1つ以上）: ${flagged.length} / ${withEffects.length}  (${pct(flagged.length, withEffects.length)})`);
console.log(`  どのフラグも立たないカード     : ${clean.length} / ${withEffects.length}  (${pct(clean.length, withEffects.length)})`);
if (!sheetArg) {
  console.log(`  意味照合監査を通したカード  : ${audited.size}（clean群）＋ 2401（stub群・PLAN 記載）= ${audited.size + 2401} / ${withEffects.length}  (${pct(audited.size + 2401, withEffects.length)})`);
} else {
  // ⚠**「どのフラグも立たない」＝「正しい」ではない**（計器が見ていないだけ）。シートを閉じるには
  //   この残りへの検出パス（シート限定の意味照合再監査）が別途要る＝ここで毎回言う。
  console.log(`  ⚠うち意味照合監査を通したのは ${withEffects.filter(c => audited.has(c)).length} 枚`);
  console.log(`  ⚠「フラグ0 = 正しい」ではない（計器が見ていないだけ）。このシートを閉じるには`);
  console.log(`    残り ${clean.length} 枚への検出パス（シート限定の意味照合再監査）が別途要る。`);
}

if (listMode) {
  console.log(`\n===== 要対応カード一覧（${scopeLabel}・${flagged.length}枚）=====`);
  console.log('  ※次バッチはここから取る。フラグの並びは census / audit / held / partial / idset。');
  const order = ['census', 'audit', 'held', 'partial', 'idset'];
  for (const c of flagged.sort()) {
    const fs_ = order.filter(f => flags.get(c).has(f));
    const name = (rows.get(c)?.CardName ?? '').trim();
    console.log(`  ${c.padEnd(18)} ${fs_.join(',').padEnd(24)} ${name}`);
  }
}
