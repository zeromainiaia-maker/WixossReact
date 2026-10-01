// `public/data/CardDatas/index.json`（カード CSV の並び順の正本）をフォルダの中身に合わせる。
// 実行: node scripts/cardDataIndex.mjs [--check]
//   ・フォルダにあって index に無いパック CSV を**末尾に足す**（legacySheet は null）
//   ・index にあってフォルダに無いものは**消さずに報告して exit 1**（消すと並びが黙って変わるので手で直す）
//   ・`--check` は書き換えずに食い違いだけ報告（食い違いがあれば exit 1）
// 🔑アプリ（`App.tsx`）は index.json に載っている CSV しか読まない＝**新しいパックの CSV を置いたらこれを回す**。
import { readdirSync, writeFileSync } from 'node:fs';
import { CARD_DATA_DIR, CARD_DATA_INDEX, cardDataIndex } from './cardDataFiles.mjs';

const check = process.argv.includes('--check');
const idx = cardDataIndex();
const special = new Set([idx.tokens, idx.variants]);
const onDisk = readdirSync(CARD_DATA_DIR).filter(f => f.endsWith('.csv') && !special.has(f));
const listed = new Set(idx.packs.map(p => p.file));
const added = onDisk.filter(f => !listed.has(f)).sort();
const missing = [...listed].filter(f => !onDisk.includes(f));

if (missing.length) console.error(`⚠index にあるのにフォルダに無い: ${missing.join(', ')}（並びが変わるので手で index.json を直す）`);
if (added.length) console.log(`${check ? '⚠index に無い' : '＋index に追加'}: ${added.join(', ')}`);
if (!added.length && !missing.length) console.log(`✅ index.json とフォルダは一致（パック ${idx.packs.length}）`);
if (!check && added.length) {
  const next = { ...idx, packs: [...idx.packs, ...added.map(f => ({ pack: f.replace(/\.csv$/, ''), file: f, legacySheet: null }))] };
  writeFileSync(CARD_DATA_INDEX, JSON.stringify(next, null, 1) + '\n');
}
process.exit(missing.length || (check && added.length) ? 1 : 0);
