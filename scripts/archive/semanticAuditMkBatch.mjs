/**
 * 意味照合監査 段1 バッチ明細ジェネレータ（2026-08-21・続き592）
 *
 * clusters_stage0.json（= semanticAuditStage0.mjs の出力）から、
 * 「先頭から skip 個を消化済みとして飛ばし、次の take 個」でバッチ明細を作る。
 *
 *   node scripts/archive/semanticAuditMkBatch.mjs --skip 90 --take 20 --id E --n 5
 *
 * 出力＝<outDir>/stage1_batch<n>.txt（原文＋指摘の全文）と stage1_batch<n>_index.md（索引表）。
 * ⚠**バッチは 20クラスタ／40 findings 前後に保つ**＝40クラスタ（107件）投げた第3バッチは
 *   根拠がテンプレート化して証拠にならなかった（CODEX_GUIDE §8 続き592c/592d）。
 */
import { readFileSync, writeFileSync, existsSync } from 'fs';
import Papa from 'papaparse';

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const skip = parseInt(arg('skip', '0'), 10);
const take = parseInt(arg('take', '20'), 10);
const idPfx = arg('id', 'X');
const n = arg('n', '0');
const DIR = arg('outDir', 'scripts/archive/scratchpad/semantic_audit_clean_round1');

const J = JSON.parse(readFileSync(DIR + '/clusters_stage0.json', 'utf8'));
const pick = J.clusters.slice(skip, skip + take);
if (!pick.length) { console.error('該当クラスタなし'); process.exit(1); }

const cards = new Map();
for (const f of [...Array.from({ length: 11 }, (_, i) => `CardData_Sheet${i + 1}.csv`), 'CardData_TK.csv']) {
  const p = 'public/data/' + f;
  if (!existsSync(p)) continue;
  for (const r of Papa.parse(readFileSync(p, 'utf8'), { header: true }).data) if (r.CardNum) cards.set(r.CardNum, r);
}

const total = pick.reduce((a, c) => a + c.n, 0);
const cardSet = new Set(pick.flatMap((c) => c.cards));
let tbl = '| ID | quote | 件数 | HIGH | カード数 |\n|---|---|---:|---:|---:|\n';
let out = `=== 段1 第${n}バッチ＝クラスタ ${skip + 1}〜${skip + pick.length}位（${total} findings / ${cardSet.size}カード）===\n`;
out += 'clusters_stage0.json の並び（件数降順）で、消化済みの次を切り出したもの。\n\n';

pick.forEach((c, i) => {
  const id = idPfx + String(i + 1).padStart(3, '0');
  tbl += `| ${id} | ${c.quote} | ${c.n} | ${c.sev.HIGH} | ${c.cards.length} |\n`;
  out += '='.repeat(78) + '\n';
  out += `【${id}】「${c.quote}」 ${c.n}件（HIGH ${c.sev.HIGH}/MED ${c.sev.MED}/LOW ${c.sev.LOW}） type=${c.types.join(',')}\n`;
  out += '-'.repeat(78) + '\n';
  for (const f of c.findings) {
    const cd = cards.get(f.cardNum);
    out += `\n● ${f.effectId}  [${f.severity}/${f.type}]  ${cd?.CardName ?? ''}\n`;
    out += `  原文: ${(cd?.EffectText ?? '').replace(/\r?\n/g, ' ').slice(0, 500)}\n`;
    if (cd?.BurstText && cd.BurstText !== '-') out += `  LB  : ${cd.BurstText.replace(/\r?\n/g, ' ').slice(0, 200)}\n`;
    out += `  指摘: 「${f.quote}」 ${f.claim}\n`;
  }
  out += '\n';
});

writeFileSync(`${DIR}/stage1_batch${n}.txt`, out, 'utf8');
writeFileSync(`${DIR}/stage1_batch${n}_index.md`, tbl, 'utf8');
console.log(`第${n}バッチ: クラスタ${skip + 1}〜${skip + pick.length} / ${total} findings / ${cardSet.size} cards`);
console.log(tbl);
