// census 高シグナルの「真バグ率」測定器（PLAN.md §5d-0 ②・2026-08-07 続き376 新設）
//
// 【なぜ要るか】残件の見積もりは **真バグ率 × 残件数** でしか出せない。census の高シグナルには
//   計器側の誤検出（対応語彙表の漏れ）が混じっており、続き376 の実測ではサンプルの **30%** がそれだった。
//   「census に残っている＝バグ」ではないので、**バッチを何本か消化したら測り直す**こと。
//   易しい系統から消化するぶん、母集団の実バグ率は**下がっていく**（続き369 の 92% → 続き376 の 70%）。
//
// 使い方: node scripts/archive/censusSample.mjs [seed] [n]
//   既定 seed=20260807 n=20（続き376 の測定と同一＝結果を再現できる）
//   前提＝`npm run census` が走って `docs/_vocab_census.txt` が最新であること。
//
// 出力: union のサイズ（**注記の（…）を剥がすと census 公称と一致するはず**）と、
//       抽出した各効果の 原文（docs/_effect_srctext.json）× live JSON。
//       これを目視照合し PLAN §5d-0 ③ の4区分〔(i)配線 (ii)機構 (iii)構造混線 (iv)計器較正〕へ仕分ける。

import fs from 'fs';

const seed = Number(process.argv[2] ?? 20260807);
const n = Number(process.argv[3] ?? 20);

// ---- census 明細から「高シグナル」だけを union する ----
const lines = fs.readFileSync('docs/_vocab_census.txt', 'utf8').split(/\r?\n/);
const union = new Set();
let inHigh = false;
for (const l of lines) {
  if (l.startsWith('###')) { inHigh = l.startsWith('### 高シグナル'); continue; }
  if (l.startsWith('#')) { inHigh = false; continue; }
  if (!inHigh || !l.trim()) continue;
  // ⚠一部の行は `WX14-CB02-E1(バニッシュされない)` のように**注記つき**で出る。
  //   剥がさないと同じ効果が別IDとして二重に数えられ、union が公称より膨らむ（続き376 で 1365 → 1162）。
  for (const raw of l.trim().split(/\s+/)) union.add(raw.replace(/（[^）]*）|\([^)]*\)/g, ''));
}
const all = [...union].filter(Boolean).sort();

// ---- シード固定サンプリング（mulberry32）----
function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(seed);
const pool = all.slice();
const pick = [];
for (let i = 0; i < Math.min(n, pool.length); i++) pick.push(pool.splice(Math.floor(rnd() * pool.length), 1)[0]);

// ---- 原文 × live JSON を並べて出す ----
const src = JSON.parse(fs.readFileSync('docs/_effect_srctext.json', 'utf8'));
const eff = new Map();
for (const f of fs.readdirSync('public/data')) {
  if (!/^effects_.*\.json$/.test(f)) continue;
  const j = JSON.parse(fs.readFileSync('public/data/' + f, 'utf8'));
  for (const [cn, arr] of Object.entries(j)) for (const e of arr ?? []) if (e?.effectId) eff.set(e.effectId, { cn, e });
}

console.log(`# census 高シグナル union = ${all.length} 件（seed=${seed} で ${pick.length} 件抽出）`);
console.log('# ⚠この union サイズが `npm run census` の「高シグナル欠落 効果総数」と一致しなければ、');
console.log('#   census の出力書式が変わっている＝このスクリプトのパーサを直すこと。');
for (const id of pick) {
  const r = eff.get(id);
  console.log('='.repeat(100));
  console.log(`## ${id}   card=${r?.cn ?? '?'}  parseStatus=${r?.e?.parseStatus ?? '?'}`);
  console.log(`[原文] ${src[id] ?? '(なし)'}`);
  console.log(`[JSON] ${JSON.stringify(r?.e ?? null)}`);
}
