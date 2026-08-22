/**
 * semanticAuditLedger.mjs — Sonnetタスク8（意味照合監査 clean群 round1）の**燃え尽き台帳**。
 *
 * ## なぜ要るか
 * findings 1,444件を「頭から潰す」のは禁止手（PLAN §6.2）。段0（機械前処理）→段1（クラスタ triage）→
 * 段2（parser 規則で一括消化）と進むが、**いま何件残っているか**を毎回数え直さないと
 * 「簿記を信用せず実測」（PLAN §3-1）が守れない。この台帳が唯一の残件カウンタ。
 *
 * ## 入力（すべて scripts/archive/scratchpad/semantic_audit_clean_round1/）
 * - `findings.jsonl`          … 監査の生 findings（1,444件・不変）
 * - `clusters_stage0.json`    … 段0 の機械前処理（OPEN / 除去の判定）
 * - `stage1_batch*_triage.md` … 段1 の分類表（`| effectId | parseStatus | 分類 | …`。単発バッチは先頭に `| S001 |` の連番列が付く）
 * - `stage2_closed.txt`       … 段2 で**実際に live が直った** effectId（1行1件・`#` はコメント）
 *                                ⚠バッチを1本回したらここに追記する。これが唯一の消化記録。
 *
 * ## 使い方
 *   node scripts/archive/semanticAuditLedger.mjs             … サマリ
 *   node scripts/archive/semanticAuditLedger.mjs --axis      … 残件を段3 の欠落語彙キー軸で内訳
 *   node scripts/archive/semanticAuditLedger.mjs --list <軸> … その軸の残 finding を列挙
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'scratchpad', 'semantic_audit_clean_round1');
const read = f => fs.readFileSync(path.join(DIR, f), 'utf-8');

const findings = read('findings.jsonl').split('\n').filter(Boolean).map(l => JSON.parse(l));

// 段0：機械前処理で除去された finding（既知の偽陽性ファミリ）
const stage0 = JSON.parse(read('clusters_stage0.json'));
const removedKeys = new Set();       // 段0 の excluded ファミリ（FP_* / STALE_* / REVIEW_*）
for (const rowsLike of Object.values(stage0.excluded ?? {})) {
  for (const r of rowsLike) removedKeys.add(`${r.effectId} ${r.quote}`);
}

// 段1：クラスタ triage の分類表
const verdicts = new Map(); // effectId -> Set<分類>
for (const f of fs.readdirSync(DIR).filter(n => /^stage1_batch\d+_triage\.md$/.test(n))) {
  for (const line of read(f).split('\n')) {
    // ⚠先頭に finding 連番列（`| S001 | …`）が付く形も許す＝**単発バッチ（第8〜）の分類表**。
    // クラスタ段（第1〜7）は effectId 始まりだったが、単発は明細 txt との突き合わせに連番が要るので
    // 列が1本増えた。ここを固定していると**そのバッチ全件が「未 triage」に落ちて残件を過大に数える**。
    // ⚠**parseStatus 列で anchor しない**＝`(live無)` `読取不能（live null）` 等が入る行があり、
    //   `AUTO|MANUAL|PARTIAL` 固定にすると**その行が丸ごと未 triage に落ちて次バッチへ再投入される**
    //   （2026-08-22 実測＝第15バッチの16件・第17バッチの2件が二重投入されかけた）。
    //   代わりに**分類列に「真バグ／偽陽性／機構待ち／要追調査」が含まれること**で anchor する。
    // ⚠**識別子列は effectId とは限らない**＝`effectId:null` の finding（23件・出現条件系）は
    //   報告書に **CardNum** が書かれる。`-E1`/`-BURST` 終端を要求すると**その行が落ちて永久に
    //   未 triage のまま再投入される**（2026-08-22 実測＝第15バッチの16件が第23バッチへ再登場）。
    //   分類列で anchor しているので識別子側は緩くてよい。
    const m = line.match(/^\|(?:\s*[A-Z]\d+\s*\|)?\s*([A-Za-z0-9][A-Za-z0-9._-]*)\s*\|[^|]*\|\s*([^|]*?(?:真バグ|偽陽性|機構待ち|要追調査)[^|]*?)\s*\|/);
    if (!m) continue;
    const set = verdicts.get(m[1]) ?? new Set();
    for (const v of m[2].split(/[＋+・]/).map(s => s.trim())) if (v) set.add(v);
    verdicts.set(m[1], set);
  }
}

// 段2：消化済み（live が実際に直った effectId）
const closedPath = path.join(DIR, 'stage2_closed.txt');
const closed = new Set(
  fs.existsSync(closedPath)
    ? read('stage2_closed.txt').split('\n').map(l => l.replace(/#.*$/, '').trim()).filter(Boolean)
    : []);

// 段3：欠落語彙キー軸（再クラスタ化の結果を再利用）
const axisOf = new Map();            // stage3_recluster.json は [{axis, n, findings:[…]}] の配列
if (fs.existsSync(path.join(DIR, 'stage3_recluster.json'))) {
  for (const group of JSON.parse(read('stage3_recluster.json'))) {
    for (const r of (group.findings ?? [])) axisOf.set(`${r.effectId} ${r.quote}`, group.axis);
  }
}

const rows = findings.map(f => {
  const key = `${f.effectId} ${f.quote}`;
  // effectId が null の finding（出現条件系）は報告書側が CardNum で書くのでそちらで引く。
  const v = verdicts.get(f.effectId) ?? (f.effectId ? undefined : verdicts.get(f.cardNum));
  const state =
    closed.has(f.effectId) ? '✅消化'
    : removedKeys.has(key) ? '段0除去'
    : v?.has('偽陽性') && !v.has('真バグ') ? '偽陽性(段1)'
    : v?.has('機構待ち') && !v.has('真バグ') ? '機構待ち(段1)'
    : v?.has('真バグ') ? (v.has('機構待ち') ? '真バグ+機構待ち' : '真バグ(段1)')
    : v ? `段1:${[...v].join('+')}`
    : '未triage(段3)';
  return { ...f, state, axis: axisOf.get(key) ?? '(軸なし)' };
});

const count = pred => rows.filter(pred).length;
const tally = (keyFn, subset) => {
  const m = new Map();
  for (const r of subset) m.set(keyFn(r), (m.get(keyFn(r)) ?? 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
};

const open = rows.filter(r => !['段0除去', '✅消化', '偽陽性(段1)'].includes(r.state));
const actionable = open.filter(r => !r.state.startsWith('機構待ち'));

console.log('===== Sonnetタスク8 燃え尽き台帳（意味照合 clean群 round1）=====');
console.log(`findings 総数              : ${rows.length}`);
console.log(`  段0 で機械除去（偽陽性）  : ${count(r => r.state === '段0除去')}`);
console.log(`  段1 で偽陽性と判定        : ${count(r => r.state === '偽陽性(段1)')}`);
console.log(`  ✅段2 で消化（live 修正） : ${count(r => r.state === '✅消化')}`);
console.log(`  機構待ちのみ（§6.3/12へ） : ${count(r => r.state.startsWith('機構待ち'))}`);
console.log('  ' + '-'.repeat(52));
console.log(`🔥 残 OPEN                 : ${open.length}`);
console.log(`   うち段1 で真バグ確定     : ${count(r => r.state.startsWith('真バグ'))}`);
console.log(`   うち未 triage（段3 単発）: ${count(r => r.state === '未triage(段3)')}`);
console.log(`   即着手できる分           : ${actionable.length}`);
console.log(`   HIGH / MED / LOW         : ${open.filter(r => r.severity === 'HIGH').length} / ${open.filter(r => r.severity === 'MED').length} / ${open.filter(r => r.severity === 'LOW').length}`);
console.log(`   影響カード数             : ${new Set(open.map(r => r.cardNum)).size} / 効果数 ${new Set(open.map(r => r.effectId)).size}`);

if (process.argv.includes('--axis')) {
  console.log('\n--- 残 OPEN の内訳（段3 欠落語彙キー軸）---');
  for (const [axis, n] of tally(r => r.axis, open)) {
    const eff = new Set(open.filter(r => r.axis === axis).map(r => r.effectId)).size;
    console.log(`  ${String(n).padStart(4)}件 / ${String(eff).padStart(4)}効果  ${axis}`);
  }
}
if (process.argv.includes('--cluster')) {
  // 段0 のクラスタ（同一 quote で束ねた群）別に残 OPEN を数える＝**段2 の次バッチ候補**。
  const openKeys = new Set(open.map(r => `${r.effectId} ${r.quote}`));
  const out = [];
  for (const c of (stage0.clusters ?? [])) {
    // ⚠クラスタ内の finding は `quote` を持たない（quote は**クラスタ側**の代表値）＝親の quote で引く。
    const rest = (c.findings ?? []).filter(f => openKeys.has(`${f.effectId} ${c.quote}`));
    if (rest.length === 0) continue;
    out.push({ id: c.id, quote: c.quote, n: rest.length, total: (c.findings ?? []).length,
      eff: new Set(rest.map(f => f.effectId)).size,
      types: [...new Set(rest.map(f => f.type))].join('/'),
      high: rest.filter(f => f.severity === 'HIGH').length });
  }
  out.sort((a, b) => b.n - a.n);
  console.log('\n--- 残 OPEN のクラスタ別（段0 の quote クラスタ・段2 の次バッチ候補）---');
  for (const c of out) {
    console.log(`  ${String(c.n).padStart(3)}件(元${String(c.total).padStart(3)}) ${String(c.eff).padStart(3)}効果 HIGH${String(c.high).padStart(3)} ${c.types.padEnd(14)} ${c.id} 「${c.quote}」`);
  }
  console.log(`  クラスタ ${out.length}個 / 残 ${out.reduce((n, c) => n + c.n, 0)}件（単発は --axis で見る）`);
}
const li = process.argv.indexOf('--list');
if (li >= 0) {
  const want = process.argv[li + 1];
  for (const r of open.filter(r => !want || r.axis === want)) {
    console.log(`${r.state}\t${r.severity}\t${r.effectId}\t${r.quote}\t${r.claim}`);
  }
}
