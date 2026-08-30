/**
 * semanticAuditRecheck.mjs — 意味照合 段2 の**再照合**計器（2026-08-30 新設）。
 *
 * ## なぜ要るか
 * 台帳（`semanticAuditLedger.mjs`）の 残 OPEN は **`stage2_closed.txt` に手で追記しないと減らない**。
 * ところが段2 のバッチは「parser 規則1本で標本外の効果まで一緒に直る」ので（PLAN §5.2＝
 * 「175効果を直して母集団に載っていたのは約半分」）、**直っているのに OPEN のまま残る finding**が
 * 恒常的に溜まる。1件ずつ実装し直すより、**再照合して一括回収する**ほうが桁違いに安い。
 *
 * ## やること
 * 各 OPEN finding について、**現在の逆翻訳**（＝live JSON から生成した日本語）に
 * finding の `quote`（原文の該当句）がどれだけ現れるかを測る（最長共通部分文字列）。
 * 🔴**これは「候補出し」であって判定ではない。** 語句が出ていても claim が指す軸は別のことがある
 *   （実測＝LCS>=7 の 108件のうち約6割が真の stale、残りは偽陽性）。
 *   ⇒ **必ず1件ずつ 原文ブロック × 逆翻訳 を目視してから `stage2_closed.txt` へ書く。**
 *
 * ## 使い方
 *   node scripts/archive/semanticAuditRecheck.mjs [minLcs]        … 候補一覧（既定 7）
 *   node scripts/archive/semanticAuditRecheck.mjs [minLcs] --full  … 原文ブロックも出す（目視用）
 *   node scripts/archive/semanticAuditRecheck.mjs --ids A-E1,B-E2  … 指定 effectId だけを完全表示
 */
import fs from 'fs';
import path from 'path';
import Papa from 'papaparse';
import { fileURLToPath } from 'url';
import { open } from './semanticAuditLedger.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const argv = process.argv.slice(2);
const idsArg = argv.includes('--ids') ? (argv[argv.indexOf('--ids') + 1] ?? '') : '';
const ids = new Set(idsArg.split(',').map(s => s.trim()).filter(Boolean));
const full = argv.includes('--full') || ids.size > 0;
const MIN = Number(argv.find(a => /^\d+$/.test(a)) ?? 7);

// 逆翻訳（1効果1行）
const dec = new Map();
for (const f of fs.readdirSync(path.join(ROOT, 'docs')).filter(n => /^decompile_sheet\d+\.txt$/.test(n))) {
  for (const line of fs.readFileSync(path.join(ROOT, 'docs', f), 'utf-8').split('\n')) {
    const m = line.match(/^  ([A-Za-z0-9][A-Za-z0-9._-]*): (.*)$/);
    if (m && !dec.has(m[1])) dec.set(m[1], m[2]);
  }
}
// 原文（CardNum -> EffectText + BurstText）
const src = new Map();
for (const f of fs.readdirSync(path.join(ROOT, 'public', 'data')).filter(n => /^CardData_.*\.csv$/.test(n))) {
  const rows = Papa.parse(fs.readFileSync(path.join(ROOT, 'public', 'data', f), 'utf-8'), { header: true }).data;
  for (const r of rows) {
    const num = r.CardNum ?? r.カード番号;
    if (!num || src.has(num)) continue;
    src.set(num, [r.EffectText, r.BurstText].filter(Boolean).join('\n【ライフバースト】'));
  }
}

const half = s => String(s ?? '').replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
const lcs = (a, b) => {
  let best = 0;
  for (let i = 0; i < a.length; i++) for (let j = 0; j < b.length; j++) {
    let k = 0; while (i + k < a.length && j + k < b.length && a[i + k] === b[j + k]) k++;
    if (k > best) best = k;
  }
  return best;
};

const rows = [];
for (const r of open) {
  const j = dec.get(r.effectId);
  if (ids.size) { if (ids.has(r.effectId)) rows.push({ r, n: j ? lcs(half(r.quote), half(j)) : 0, j: j ?? '(逆翻訳なし)' }); continue; }
  if (!j) continue;
  const n = lcs(half(r.quote), half(j));
  if (n >= MIN) rows.push({ r, n, j });
}
rows.sort((a, b) => b.n - a.n);
console.log(`# 再照合候補 ${rows.length} 件 / 残 OPEN ${open.length}（LCS >= ${MIN}）`);
console.log('# ⚠候補であって判定ではない。1件ずつ 原文×逆翻訳 を目視してから stage2_closed.txt へ書く。\n');
for (const { r, n, j } of rows) {
  console.log(`[LCS ${n}] ${r.effectId} (${r.severity})`);
  console.log(`  Q: ${r.quote}`);
  console.log(`  C: ${r.claim}`);
  if (full) console.log(`  原文: ${(src.get(r.cardNum) ?? '(原文なし)').replace(/\s*\n\s*/g, ' / ')}`);
  console.log(`  J: ${j}`);
  console.log('');
}
