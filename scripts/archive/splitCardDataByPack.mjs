// 2026-10-01 適用済み one-off：`public/data/CardData_Sheet1..10.csv`＋`CardData_TK.csv`＋`CardData_Variants.csv` を
// `public/data/CardDatas/`（パック別 CSV＋`_TK.csv`＋`_Variants.csv`＋`index.json`）へ再編した。
// 実行: node scripts/archive/splitCardDataByPack.mjs [--write]   （既定は下見＝検証だけ）
// 🔑並び＝旧シートを 1→10 の順に連結した順で**パックの初出順**。パック内は元の並びのまま。
//   ⚠パックが複数シートに散っていたもの（PR / WD12 / WX22 / WXDi-P11 / SPK）だけ全体の並びが変わる（パックごとにまとまる）。
//   🔑パック規則は `scripts/cardDataFiles.mjs` の `packOf`（SP・SPDi・SPK はそれぞれ1ファイル＝ユーザー指定）＝124 パック。
// 🔑書き出し後に**旧ファイルの全行と値で突き合わせる**（件数・カード番号の集合・20列の値・パック内の並び）。
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import Papa from 'papaparse';
import { packOf } from '../cardDataFiles.mjs';

const root = process.cwd();
const SRC = join(root, 'public', 'data');
const DST = join(SRC, 'CardDatas');
const write = process.argv.includes('--write');
const read = f => readFileSync(join(SRC, f), 'utf-8').replace(/^﻿/, '');
const parse = t => Papa.parse(t, { header: true, skipEmptyLines: true });

const sheets = Array.from({ length: 11 }, (_, i) => i + 1).filter(n => existsSync(join(SRC, `CardData_Sheet${n}.csv`)));
let fields = null;
const all = [];   // { row, sheet }
for (const n of sheets) {
  const { data, meta } = parse(read(`CardData_Sheet${n}.csv`));
  if (fields && meta.fields.join(',') !== fields.join(',')) throw new Error(`列が違う: Sheet${n}`);
  fields = meta.fields;
  for (const row of data) if (row.CardNum?.trim()) all.push({ row, sheet: n });
}
const packs = new Map();   // pack -> { rows, legacySheet }
for (const { row, sheet } of all) {
  const p = packOf(row.CardNum);
  if (!packs.has(p)) packs.set(p, { rows: [], legacySheet: sheet });
  packs.get(p).rows.push(row);
}
// 大文字小文字だけが違うパック名（Windows で同じファイルになる）を拒否
const lower = new Map();
for (const p of packs.keys()) {
  if (!/^[A-Za-z0-9-]+$/.test(p)) throw new Error(`ファイル名にできないパック名: ${p}`);
  if (lower.has(p.toLowerCase())) throw new Error(`大文字小文字だけ違うパック: ${p} / ${lower.get(p.toLowerCase())}`);
  lower.set(p.toLowerCase(), p);
}
const index = {
  packs: [...packs].map(([pack, v]) => ({ pack, file: `${pack}.csv`, legacySheet: v.legacySheet })),
  tokens: '_TK.csv',
  variants: '_Variants.csv',
};
console.log(`旧: ${sheets.length} シート / ${all.length} 枚 → パック ${packs.size}`);

const unparse = rows => Papa.unparse(rows, { columns: fields, newline: '\r\n' }) + '\r\n';
if (write) {
  mkdirSync(DST, { recursive: true });
  for (const [pack, v] of packs) writeFileSync(join(DST, `${pack}.csv`), unparse(v.rows));
  writeFileSync(join(DST, '_TK.csv'), read('CardData_TK.csv'));
  writeFileSync(join(DST, '_Variants.csv'), read('CardData_Variants.csv'));
  writeFileSync(join(DST, 'index.json'), JSON.stringify(index, null, 1) + '\n');
}

// ── 突き合わせ（書き出したファイルを読み直す） ──
if (write) {
  const got = [];
  for (const p of index.packs) {
    const { data, meta } = parse(readFileSync(join(DST, p.file), 'utf-8'));
    if (meta.fields.join(',') !== fields.join(',')) throw new Error(`列が違う: ${p.file}`);
    for (const r of data) { if (packOf(r.CardNum) !== p.pack) throw new Error(`パック違い: ${r.CardNum} in ${p.file}`); got.push(r); }
  }
  if (got.length !== all.length) throw new Error(`件数が違う ${got.length} != ${all.length}`);
  const byNum = new Map(all.map(({ row }) => [row.CardNum, row]));
  for (const r of got) {
    const o = byNum.get(r.CardNum);
    if (!o) throw new Error(`旧に無い: ${r.CardNum}`);
    for (const f of fields) if ((o[f] ?? '') !== (r[f] ?? '')) throw new Error(`値が違う: ${r.CardNum}.${f}`);
  }
  // パック内の並びは旧と同じ
  const oldOrder = new Map(); all.forEach(({ row }, i) => oldOrder.set(row.CardNum, i));
  for (const p of index.packs) {
    const idx = got.filter(r => packOf(r.CardNum) === p.pack).map(r => oldOrder.get(r.CardNum));
    if (idx.some((v, i) => i > 0 && v < idx[i - 1])) throw new Error(`パック内の並びが変わった: ${p.pack}`);
  }
  for (const f of ['_TK.csv', '_Variants.csv']) {
    const a = readFileSync(join(DST, f), 'utf-8'), b = read(f === '_TK.csv' ? 'CardData_TK.csv' : 'CardData_Variants.csv');
    if (a !== b) throw new Error(`${f} が元と違う`);
  }
  const onDisk = readdirSync(DST).filter(f => f.endsWith('.csv')).length;
  console.log(`✅ 突き合わせ OK＝${got.length} 枚・20列の値すべて一致・パック内の並び不変／CSV ${onDisk} 本（パック ${index.packs.length}＋_TK＋_Variants）`);
}
