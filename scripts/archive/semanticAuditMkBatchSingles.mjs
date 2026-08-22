/**
 * 意味照合監査 段1 **単発** バッチ明細ジェネレータ（2026-08-22 続き595 新設）
 *
 * ## なぜ別ツールか
 * `semanticAuditMkBatch.mjs` は **段0 の quote クラスタ**（147個）を切り出す道具で、
 * それは 2026-08-21 の7バッチで**完走済み**。残っている未 triage は **単発 quote 662件**で、
 * quote がカード固有なので同じ切り方ができない。
 * ⇒ こちらは **段3 の再クラスタ化（欠落語彙キー軸 × action型）**でまとめて切り出す。
 *
 * ## 使い方
 *   node scripts/archive/semanticAuditMkBatchSingles.mjs --list                 … 軸ごとの残件
 *   node scripts/archive/semanticAuditMkBatchSingles.mjs --axis "filter.story" --n 8
 *   node scripts/archive/semanticAuditMkBatchSingles.mjs --skip 0 --take 40 --n 8
 *
 * ⚠**1バッチ 40 findings 前後に保つ**（CODEX_GUIDE §8 続き592c/592d＝107件投げたバッチは
 *   根拠がテンプレート化して証拠にならなかった）。
 * ⚠**消化済み判定は台帳と同じ**＝段0 除去／段1 偽陽性／`stage2_closed.txt` を除く。
 */
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'fs';
import Papa from 'papaparse';

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const DIR = arg('outDir', 'scripts/archive/scratchpad/semantic_audit_clean_round1');
const R = f => readFileSync(`${DIR}/${f}`, 'utf8');

// ── 残 OPEN かつ「段1 未 triage」の findings を集める（台帳と同じ判定）──
const findings = R('findings.jsonl').split('\n').filter(Boolean).map(l => JSON.parse(l));
const st0 = JSON.parse(R('clusters_stage0.json'));
const removed = new Set();
for (const rows of Object.values(st0.excluded ?? {})) for (const r of rows) removed.add(`${r.effectId} ${r.quote}`);
const closed = new Set(R('stage2_closed.txt').split('\n').map(l => l.replace(/#.*$/, '').trim()).filter(Boolean));
const triaged = new Set();
for (const f of readdirSync(DIR).filter(n => /^stage1_batch\d+_triage\.md$/.test(n))) {
  for (const line of R(f).split('\n')) {
    const m = line.match(/^\|\s*([A-Za-z0-9][A-Za-z0-9-]*?-(?:E\d+[a-z]?|BURST|CB-E\d+|[A-Z]{2,}))\s*\|\s*(?:AUTO|MANUAL|PARTIAL)\s*\|/);
    if (m) triaged.add(m[1]);
  }
}
const open = findings.filter(f =>
  !removed.has(`${f.effectId} ${f.quote}`) && !closed.has(f.effectId) && !triaged.has(f.effectId));

// ── 段3 の軸（欠落語彙キー）を貼る ──
const axisOf = new Map();
if (existsSync(`${DIR}/stage3_recluster.json`)) {
  for (const g of JSON.parse(R('stage3_recluster.json'))) {
    for (const r of (g.findings ?? [])) axisOf.set(`${r.effectId} ${r.quote}`, g.axis);
  }
}
const live = {};
for (const k of ['WX', 'WXDi', 'WX24_26', 'WXK', 'misc']) Object.assign(live, JSON.parse(readFileSync(`public/data/effects_${k}.json`, 'utf8')));
const effOf = {};
for (const c of Object.keys(live)) for (const e of live[c] ?? []) effOf[e.effectId] = e;
const actionTypeOf = eid => {
  const a = effOf[eid]?.action;
  return a?.type === 'SEQUENCE' || a?.type === 'CHOOSE'
    ? `${a.type}(${[...new Set(JSON.stringify(a).match(/"type":"[A-Z_]+"/g) ?? [])].slice(0, 3).map(s => s.slice(8, -1)).join('/')})`
    : (a?.type ?? '(live無)');
};

const rows = open.map(f => ({ ...f, axis: axisOf.get(`${f.effectId} ${f.quote}`) ?? '(軸なし)', at: actionTypeOf(f.effectId) }));

if (process.argv.includes('--list')) {
  const m = new Map();
  for (const r of rows) m.set(r.axis, (m.get(r.axis) ?? 0) + 1);
  console.log('--- 段1 未 triage の残（段3 欠落語彙キー軸）---');
  for (const [k, v] of [...m].sort((a, b) => b[1] - a[1])) console.log(`  ${String(v).padStart(4)}件  ${k}`);
  console.log(`  合計 ${rows.length}件 / ${new Set(rows.map(r => r.effectId)).size}効果`);
  process.exit(0);
}

const axis = arg('axis', null);
const skip = parseInt(arg('skip', '0'), 10);
const take = parseInt(arg('take', '40'), 10);
const n = arg('n', '0');
const pool = axis ? rows.filter(r => r.axis === axis) : rows;
// 同じ action 型を隣り合わせる＝Codex が「同じ穴か」を判断しやすい
pool.sort((a, b) => (a.at + a.quote).localeCompare(b.at + b.quote));
const pick = pool.slice(skip, skip + take);
if (!pick.length) { console.error('該当 findings なし'); process.exit(1); }

const cards = new Map();
for (const f of [...Array.from({ length: 11 }, (_, i) => `CardData_Sheet${i + 1}.csv`), 'CardData_TK.csv']) {
  const p = 'public/data/' + f;
  if (!existsSync(p)) continue;
  for (const r of Papa.parse(readFileSync(p, 'utf8'), { header: true }).data) if (r.CardNum && !cards.has(r.CardNum)) cards.set(r.CardNum, r);
}

let tbl = '| # | effectId | action型 | 軸 | sev/type | quote |\n|---|---|---|---|---|---|\n';
let out = `=== 段1 第${n}バッチ（単発）＝${axis ? `軸「${axis}」` : '全軸'} の ${skip + 1}〜${skip + pick.length}件目 ===\n`;
out += `残 ${pool.length}件中の切り出し。**quote がカード固有なので、同じ action 型で隣り合わせてある**。\n`;
out += '⚠クラスタではないので「共通の根拠」を横展開しないこと＝**1件ずつ live JSON と原文を照合する**。\n\n';

pick.forEach((f, i) => {
  const id = `S${String(i + 1).padStart(3, '0')}`;
  const cd = cards.get(f.cardNum);
  tbl += `| ${id} | ${f.effectId} | ${f.at} | ${f.axis} | ${f.severity}/${f.type} | ${f.quote.slice(0, 24)} |\n`;
  out += '='.repeat(78) + '\n';
  out += `【${id}】 ${f.effectId}  [${f.severity}/${f.type}]  ${cd?.CardName ?? ''}  action=${f.at}  軸=${f.axis}\n`;
  out += `  原文: ${(cd?.EffectText ?? '').replace(/\r?\n/g, ' ').slice(0, 500)}\n`;
  if (cd?.BurstText && cd.BurstText !== '-') out += `  LB  : ${cd.BurstText.replace(/\r?\n/g, ' ').slice(0, 200)}\n`;
  out += `  指摘: 「${f.quote}」 ${f.claim}\n`;
  out += `  live: ${JSON.stringify(effOf[f.effectId] ?? null).slice(0, 700)}\n`;
});

writeFileSync(`${DIR}/stage1_batch${n}.txt`, out, 'utf8');
writeFileSync(`${DIR}/stage1_batch${n}_index.md`, tbl, 'utf8');
console.log(`第${n}バッチ（単発）: ${pick.length}件 / ${new Set(pick.map(f => f.effectId)).size}効果 / 残 ${pool.length - skip - pick.length}件`);
console.log(tbl.split('\n').slice(0, 12).join('\n'));
