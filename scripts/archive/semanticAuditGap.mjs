// 意味照合の「未監査カード」在庫計器（2026-09-06・第197バッチで恒久化）
//
// なぜ要るか＝2026-09-06 時点で3つの進捗計器（census 高シグナル／Sheet1 要対応／台帳 残 OPEN）が
// すべて底を打ち、「いまある計器が指すものが尽きた」状態になった。意味照合は
// **受け皿の名前を知らない穴も拾える唯一の発見器**なので、「まだ1度も読んでいないカード」が
// そのまま在庫になる。PLAN §5.2 round4 の残数はこの計器で測る。
//
//   node scripts/archive/semanticAuditGap.mjs            … シート別の未監査枚数
//   node scripts/archive/semanticAuditGap.mjs --sheet 1  … そのシートの未監査カード番号を列挙
//
// ⚠監査済みの集合は scripts/archive/scratchpad/semantic_audit_*/ 配下の
//   *cumulative.txt / sampled_cards.txt の**和集合**（ラウンドを増やしても自動で入る＝
//   ディレクトリ名を列挙しない。これを固定リストで書いた版は round4 を数え落とした）。
// ⚠`npm run census:cards` の「監査を通したのは N 枚」とは別物＝あちらは clean_round1 の
//   1ファイルしか読まない（cardProgressCensus.mjs:221）。
import fs from 'fs';
import Papa from 'papaparse';

const sheetArg = (() => { const i = process.argv.indexOf('--sheet'); return i >= 0 ? process.argv[i + 1] : null; })();

const rows = new Map(), sheetOf = new Map();
const loadCsv = f => {
  const p = `public/data/${f}`;
  if (!fs.existsSync(p)) return false;
  for (const r of Papa.parse(fs.readFileSync(p, 'utf-8').replace(/^﻿/, ''), { header: true, skipEmptyLines: true }).data) {
    const id = (r.CardNum ?? '').trim();
    if (id && !rows.has(id)) { rows.set(id, r); sheetOf.set(id, f); } // シート帰属は先勝ち（decompile/build と同じ規約）
  }
  return true;
};
for (let i = 1; i <= 11; i++) if (!loadCsv(`CardData_Sheet${i}.csv`)) break;
loadCsv('CardData_TK.csv');

const hasEffect = r => {
  const ok = s => s && s !== '--' && s !== '-';
  return ok((r.EffectText ?? '').trim()) || ok((r.BurstText ?? '').trim());
};

const SCRATCH = 'scripts/archive/scratchpad';
const audited = new Set();
for (const d of fs.readdirSync(SCRATCH)) {
  if (!d.startsWith('semantic_audit')) continue;
  const base = `${SCRATCH}/${d}`;
  if (!fs.statSync(base).isDirectory()) continue;
  for (const f of fs.readdirSync(base)) {
    if (!/cumulative\.txt$|sampled_cards\.txt$/.test(f)) continue;
    for (const l of fs.readFileSync(`${base}/${f}`, 'utf-8').split('\n')) {
      const t = l.trim();
      if (t && !t.startsWith('#')) audited.add(t);
    }
  }
}

const sheets = {};
const pending = [];
for (const [id, f] of sheetOf) {
  const r = rows.get(id);
  if (!hasEffect(r)) continue;
  (sheets[f] ??= { tot: 0, aud: 0 }).tot++;
  if (audited.has(id)) sheets[f].aud++;
  else if (sheetArg && f === `CardData_Sheet${sheetArg}.csv`) pending.push(id);
}

if (sheetArg) {
  for (const id of pending) console.log(id);
  console.error(`[gap] Sheet${sheetArg} 未監査 ${pending.length} 枚`);
} else {
  let T = 0, A = 0;
  for (const [f, v] of Object.entries(sheets)) {
    T += v.tot; A += v.aud;
    console.log(`${f}\t効果あり ${v.tot}\t監査済 ${v.aud}\t未監査 ${v.tot - v.aud}\t(${(100 * v.aud / v.tot).toFixed(1)}%)`);
  }
  console.log(`合計\t効果あり ${T}\t監査済 ${A}\t未監査 ${T - A}\t(${(100 * A / T).toFixed(1)}%)`);
}
