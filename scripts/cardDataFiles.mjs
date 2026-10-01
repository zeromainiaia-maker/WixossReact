// カードデータ CSV の在処（2026-10-01 にシート別 12 ファイル → パック別へ再編）。
//
// 🔑**カード CSV を読むコードは必ずここを通す**（ファイル名を決め打ちしない）。
//   置き場＝`public/data/CardDatas/`
//     ・`<パック番号>.csv`（例 `WX01.csv` / `WXDi-P11.csv` / `WX24-P1.csv`）＝列はすべて同じ20列
//     ・`_TK.csv`＝トークン・クラフト（デッキに入れない／対戦中は常時ロードする）
//     ・`_Variants.csv`＝再録・別絵柄（CardNum/CardName/ImgURL の3列）
//     ・`index.json`＝**並び順の正本**（全カードの並び＝packs の順に連結した順）。アプリ（`App.tsx`）も
//       これを fetch してから各 CSV を取りに行く＝**パックの CSV を足したら index.json にも載せる**
//       （`node scripts/cardDataIndex.mjs` が足す。golden が「フォルダと index の食い違い」を検出する）。
// 🔑パック番号＝最初のハイフンまで（`WX01-001` → `WX01`）。**WXDi と WX24 以降は2つ目のハイフンまで**
//   （`WXDi-P01-001` → `WXDi-P01`／`WX24-P1-044` → `WX24-P1`）。**SP・SPDi・SPK はそれぞれ1ファイル**（`SP.csv`／`SPDi.csv`／`SPK.csv`）。
// ⚠`legacySheet`＝再編前のシート番号（1〜10）。`census:cards --sheet N`・逆翻訳シート（`docs/decompile_sheetN.txt`）が使う。
//   **新しく足したパックは null**＝どのシートにも属さない（全体を数える計器には入る）。
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
export const CARD_DATA_DIR = join(root, 'public', 'data', 'CardDatas');
export const CARD_DATA_INDEX = join(CARD_DATA_DIR, 'index.json');

/** パック番号の規則（ユーザー指定 2026-10-01）。 */
export function packOf(cardNum) {
  const n = String(cardNum ?? '').trim();
  // 🆕ユーザー指定 2026-10-01＝SP・SPDi・SPK はそれぞれ1つのファイルにまとめる（`SP01-…`〜`SP38-…` → `SP`）。
  if (/^SPDi\d/.test(n)) return 'SPDi';
  if (/^SPK\d/.test(n)) return 'SPK';
  if (/^SP\d/.test(n)) return 'SP';
  if (/^WXDi-/.test(n)) return n.split('-').slice(0, 2).join('-');
  const m = /^WX(\d+)-/.exec(n);
  if (m && Number(m[1]) >= 24) return n.split('-').slice(0, 2).join('-');
  return n.split('-')[0];
}

let cached = null;
/** `index.json` の中身＝`{ packs: [{ pack, file, legacySheet }], tokens, variants }`。 */
export function cardDataIndex() {
  if (!cached) cached = JSON.parse(readFileSync(CARD_DATA_INDEX, 'utf-8'));
  return cached;
}

/** パック CSV の絶対パス（並び順＝index の順）。 */
export function packCsvPaths() {
  return cardDataIndex().packs.map(p => join(CARD_DATA_DIR, p.file));
}
export function tokenCsvPath() { return join(CARD_DATA_DIR, cardDataIndex().tokens); }
export function variantsCsvPath() { return join(CARD_DATA_DIR, cardDataIndex().variants); }

/**
 * カード本体の CSV（パック全部＋既定でトークン）。旧 `CardData_Sheet1..N.csv` ＋ `CardData_TK.csv` の置き換え。
 * ⚠Variants は列が違うので含めない（要るときは `variantsCsvPath()`）。
 */
export function cardCsvPaths({ tokens = true } = {}) {
  return tokens ? [...packCsvPaths(), tokenCsvPath()] : packCsvPaths();
}

/** 再編前のシート番号に属したパックの CSV（`'TK'` ならトークン）。 */
export function legacySheetCsvPaths(sheet) {
  if (String(sheet).toUpperCase() === 'TK') return [tokenCsvPath()];
  const n = Number(sheet);
  return cardDataIndex().packs.filter(p => p.legacySheet === n).map(p => join(CARD_DATA_DIR, p.file));
}
/** 再編前のシート番号の一覧（昇順）。 */
export function legacySheetNumbers() {
  return [...new Set(cardDataIndex().packs.map(p => p.legacySheet).filter(n => typeof n === 'number'))].sort((a, b) => a - b);
}

/** BOM を外した CSV テキスト（無ければ空文字）。 */
export function readCsvText(path) {
  return existsSync(path) ? readFileSync(path, 'utf-8').replace(/^﻿/, '') : '';
}

/**
 * `cardCsvPaths` の **`public/data` からの相対パス**版（`CardDatas/WX01.csv` …）。
 * 旧コードの `join(root, 'public/data', f)` / `'public/data/' + f` がそのまま使える形。
 */
export function cardCsvRelPaths({ tokens = true } = {}) {
  const idx = cardDataIndex();
  const files = idx.packs.map(p => p.file);
  if (tokens) files.push(idx.tokens);
  return files.map(f => `CardDatas/${f}`);
}
