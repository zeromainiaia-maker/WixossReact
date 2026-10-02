// 追加カードの取り込み（2026-10-03 新設）＝`incoming-cards/` の CSV を `public/data/CardDatas/` へ振り分ける。
// 実行: node scripts/importNewCards.mjs            # 下見（何も書かない）
//       node scripts/importNewCards.mjs --apply    # 書き込み＋ index.json 更新
//
// 置き場（列はどちらも既存の CardDatas/*.csv と同じ20列・ヘッダ行は有っても無くてもよい）
//   incoming-cards/pack/*.csv   ＝通常パック
//   incoming-cards/token/*.csv  ＝トークン
//
// 振り分け規則（ユーザー指定 2026-10-03）
//   ・パック：カード名が**既存パック**にある、または**追加分の中で先に出てきた**（ファイル名順→行順）→ `_Variants.csv`
//             それ以外 → `<パック番号>.csv`（既存ファイルなら末尾に追記・無ければ新規。番号の規則は `packOf`）
//   ・トークン：カード名が**既存トークン**にある、または追加トークンの中で先に出てきた → `_Variants.csv`
//             それ以外 → `_TK.csv`（トークンとパックの間では名前を突き合わせない）
//
// 取り込みを止める条件（--apply しても何も書かない）
//   ・ヘッダが既存と違う／列数が20でない／`"` を含む（読み手はカンマで単純分割する＝クォートは列ずれになる）
//   ・CardNum が既存（パック・トークン・Variants のどれか）または追加分の中で重複
//   ・Variants になるカードの本文（種類・色・レベル・効果文など）が本体と違う＝同名別カード／エラッタの疑い
//     ⇒ 意図どおりなら `--allow-text-diff` で通す
//
// ⚠画像のアップロードは別＝`node scripts/uploadCardImages.mjs --incoming`（取り込みの**前**に回す）。
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { CARD_DATA_DIR, packOf, packCsvPaths, tokenCsvPath, variantsCsvPath } from './cardDataFiles.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const INCOMING_DIR = join(root, 'incoming-cards');
const apply = process.argv.includes('--apply');
const allowTextDiff = process.argv.includes('--allow-text-diff');

const readText = p => readFileSync(p, 'utf-8').replace(/^﻿/, '');
const linesOf = text => text.split(/\r?\n/).filter(l => l.trim());
const eolOf = text => (text.includes('\r\n') ? '\r\n' : '\n');

/** 追加分の CSV（ファイル名順）→ ヘッダ行 `{ file, line, header }` と本体行 `{ file, line, raw, cols }` の並び。 */
function readIncoming(kind) {
  const dir = join(INCOMING_DIR, kind);
  if (!existsSync(dir)) return { rows: [] };
  const rows = [];
  for (const f of readdirSync(dir).filter(f => f.endsWith('.csv')).sort()) {
    const lines = linesOf(readText(join(dir, f)));
    // ヘッダ行は無くてもよい（スプレッドシートから本体だけ書き出した CSV が来る＝2026-10-03 の初回がそう）
    const hasHeader = lines[0]?.startsWith('CardNum,');
    if (hasHeader) rows.push({ file: `${kind}/${f}`, line: 1, header: lines[0] });
    lines.forEach((l, i) => { if (i > 0 || !hasHeader) rows.push({ file: `${kind}/${f}`, line: i + 1, raw: l, cols: l.split(',') }); });
  }
  return { rows };
}

// ── 既存データ ──
const firstPack = readText(packCsvPaths()[0]);
const HEADER = linesOf(firstPack)[0];
const NCOL = HEADER.split(',').length;
const rowsOf = p => linesOf(readText(p)).slice(1).map(l => l.split(','));
const existingPackByName = new Map();
const existingNums = new Set();
for (const p of packCsvPaths()) for (const c of rowsOf(p)) { existingNums.add(c[0]); if (!existingPackByName.has(c[1])) existingPackByName.set(c[1], c); }
const existingTkByName = new Map();
for (const c of rowsOf(tokenCsvPath())) { existingNums.add(c[0]); if (!existingTkByName.has(c[1])) existingTkByName.set(c[1], c); }
for (const c of rowsOf(variantsCsvPath())) existingNums.add(c[0]);

// ── 検査と振り分け ──
const errors = [];
const textDiffs = [];
const seenNums = new Set();
const toPack = new Map();   // packFile → raw[]
const toTk = [];
const toVariants = [];      // { cols, mainNum, kind }

// 本文の突き合わせに使う列（画像・番号・名前以外。Restriction 以降の表記ゆれは空白だけ正規化）
const COMPARE_COLS = ['Type', 'CardClass', 'Color', 'Level', 'GrowCost', 'Cost', 'Limit', 'Power', 'Team', 'Timing', 'Guard', 'LifeBurst', 'EffectText', 'BurstText'];
const colIdx = Object.fromEntries(HEADER.split(',').map((h, i) => [h, i]));
const norm = s => String(s ?? '').replace(/[\s　]+/g, '');

function route(kind, existingByName) {
  const firstInIncoming = new Map();
  for (const r of readIncoming(kind).rows) {
    const where = `${r.file}:${r.line}`;
    if (r.header !== undefined) {
      if (r.header !== HEADER) errors.push(`${where} ヘッダが既存と違う\n    既存: ${HEADER}\n    追加: ${r.header}`);
      continue;
    }
    if (r.cols.length !== NCOL) { errors.push(`${where} 列数 ${r.cols.length}（${NCOL} のはず）`); continue; }
    if (r.raw.includes('"')) { errors.push(`${where} \`"\` を含む（カンマ区切りの読み手が列ずれする）`); continue; }
    const [num, name] = r.cols;
    if (!num || !name) { errors.push(`${where} CardNum か CardName が空`); continue; }
    if (existingNums.has(num)) { errors.push(`${where} ${num} は既に存在する（取り込み済み？）`); continue; }
    if (seenNums.has(num)) { errors.push(`${where} ${num} が追加分の中で重複`); continue; }
    seenNums.add(num);

    const main = existingByName.get(name) ?? firstInIncoming.get(name);
    if (main) {
      const diff = COMPARE_COLS.filter(k => norm(main[colIdx[k]]) !== norm(r.cols[colIdx[k]]));
      if (diff.length) textDiffs.push(`${num}「${name}」 本体 ${main[0]} と違う列: ${diff.join(', ')}`);
      toVariants.push({ cols: r.cols, mainNum: main[0], kind });
      continue;
    }
    firstInIncoming.set(name, r.cols);
    if (kind === 'token') toTk.push(r.raw);
    else {
      const file = `${packOf(num)}.csv`;
      if (!toPack.has(file)) toPack.set(file, []);
      toPack.get(file).push(r.raw);
    }
  }
}
route('pack', existingPackByName);
route('token', existingTkByName);

// ── 報告 ──
const packTotal = [...toPack.values()].reduce((a, v) => a + v.length, 0);
console.log(`追加分: パック ${packTotal}枚 / トークン ${toTk.length}枚 / Variants ${toVariants.length}枚`);
for (const [file, rows] of toPack) console.log(`  ${existsSync(join(CARD_DATA_DIR, file)) ? '追記' : '新規'} ${file} … ${rows.length}枚`);
if (toTk.length) console.log(`  追記 _TK.csv … ${toTk.length}枚`);
for (const v of toVariants) console.log(`  Variants ${v.cols[0]}「${v.cols[1]}」→ 本体 ${v.mainNum}${v.kind === 'token' ? '（トークン）' : ''}`);
if (textDiffs.length) {
  console.log(`\n${allowTextDiff ? '⚠' : '✗'} 同名なのに本文が違う（同名別カード／エラッタの疑い）${textDiffs.length}件${allowTextDiff ? '＝--allow-text-diff で通す' : ''}`);
  textDiffs.forEach(s => console.log(`  ${s}`));
}
if (errors.length) { console.log(`\n✗ 取り込めない ${errors.length}件`); errors.forEach(s => console.log(`  ${s}`)); }

const blocked = errors.length > 0 || (textDiffs.length > 0 && !allowTextDiff);
if (seenNums.size === 0) { console.log('\n追加分が無い（incoming-cards/pack・token に CSV を置く）'); process.exit(errors.length ? 1 : 0); }
if (blocked) { console.log('\n何も書いていない（上の問題を直してから再実行）'); process.exit(1); }
if (!apply) { console.log('\n下見のみ（書き込むには --apply）'); process.exit(0); }

// ── 書き込み（既存ファイルの改行コードを保つ）──
function appendRows(path, rows, header) {
  if (!rows.length) return;
  if (!existsSync(path)) { writeFileSync(path, [header, ...rows].join(eolOf(firstPack)) + eolOf(firstPack), 'utf-8'); return; }
  const text = readFileSync(path, 'utf-8');
  const eol = eolOf(text);
  const sep = text.endsWith('\n') ? '' : eol;
  writeFileSync(path, text + sep + rows.join(eol) + eol, 'utf-8');
}
for (const [file, rows] of toPack) appendRows(join(CARD_DATA_DIR, file), rows, HEADER);
appendRows(tokenCsvPath(), toTk, HEADER);
appendRows(variantsCsvPath(), toVariants.map(v => [v.cols[colIdx.CardNum], v.cols[colIdx.CardName], v.cols[colIdx.ImgURL]].join(',')), 'CardNum,CardName,ImgURL');
console.log('\n✅ 書き込んだ。index.json を更新する:');
execFileSync(process.execPath, [join(root, 'scripts', 'cardDataIndex.mjs')], { stdio: 'inherit' });
console.log('\n次: npm run build:effects → held を採用（node scripts/heldReview.mjs --adopt）→ 新カードの逆翻訳（npx tsx scripts/decompileEffects.ts --pack <パック番号>）→ 実装 → npm run gates');
console.log('⚠incoming-cards/ の CSV は取り込み済み＝消してよい（残すと次回は「既に存在する」で止まる）');
