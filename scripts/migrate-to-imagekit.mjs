/**
 * SupabaseのカードバケットをImageKit Storageに移行するスクリプト
 *
 * 実行（全件）:
 *   node scripts/migrate-to-imagekit.mjs
 *
 * 失敗分のみ再実行:
 *   RETRY_FILE=/path/to/failed.txt node scripts/migrate-to-imagekit.mjs
 */

import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const IMAGEKIT_PRIVATE_KEY = 'private_DobBYzfSy5+QXVOAAqfkFJsQNcQ=';
const IMAGEKIT_UPLOAD_URL = 'https://upload.imagekit.io/api/v1/files/upload';
const SUPABASE_URL = 'https://dmxomxrdnwbojdypdtvu.supabase.co';
const AUTH = 'Basic ' + Buffer.from(IMAGEKIT_PRIVATE_KEY + ':').toString('base64');
const CONCURRENCY = 5;
const DELAY_MS = 200;

// CSVからCardNumを収集
const CSV_FILES = [
  '../public/data/CardData_Sheet1.csv',
  '../public/data/CardData_Sheet2.csv',
  '../public/data/CardData_Sheet3.csv',
  '../public/data/CardData_Sheet4.csv',
  '../public/data/CardData_Sheet5.csv',
  '../public/data/CardData_Sheet6.csv',
  '../public/data/CardData_Sheet7.csv',
  '../public/data/CardData_Sheet8.csv',
  '../public/data/CardData_Sheet9.csv',
  '../public/data/CardData_Sheet10.csv',
  '../public/data/CardData_TK.csv',
];

const cardNums = new Set();
for (const f of CSV_FILES) {
  const path = resolve(__dirname, f);
  if (!existsSync(path)) continue;
  const lines = readFileSync(path, 'utf-8').replace(/^﻿/, '').split('\n').slice(1);
  for (const line of lines) {
    if (!line.trim()) continue;
    const cardNum = line.split(',')[0]?.trim();
    if (cardNum) cardNums.add(cardNum);
  }
}

const all = [...cardNums];
console.log(`対象: ${all.length} 枚\n`);

let ok = 0, fail = 0;
const failList = [];

async function processOne(cardNum, index) {
  const label = `[${String(index + 1).padStart(5)}/${all.length}] ${cardNum.padEnd(14)}`;
  const fileName = `${cardNum}.webp`;
  const srcUrl = `${SUPABASE_URL}/storage/v1/object/public/card-images/${fileName}`;

  try {
    const imgRes = await fetch(srcUrl, { signal: AbortSignal.timeout(30000) });
    if (!imgRes.ok) throw new Error(`ダウンロード失敗 HTTP ${imgRes.status}`);
    const buf = await imgRes.arrayBuffer();

    const form = new FormData();
    form.append('file', new Blob([buf], { type: 'image/webp' }), fileName);
    form.append('fileName', fileName);
    form.append('useUniqueFileName', 'false');

    const upRes = await fetch(IMAGEKIT_UPLOAD_URL, {
      method: 'POST',
      headers: { Authorization: AUTH },
      body: form,
      signal: AbortSignal.timeout(60000),
    });
    if (!upRes.ok) {
      const err = await upRes.text();
      throw new Error(`アップロード失敗 HTTP ${upRes.status}: ${err}`);
    }
    process.stdout.write(`${label} ✓ ${(buf.byteLength / 1024).toFixed(0)}KB\n`);
    ok++;
  } catch (e) {
    process.stdout.write(`${label} ✗ ${e.message}\n`);
    fail++;
    failList.push(cardNum);
  }
}

for (let i = 0; i < all.length; i += CONCURRENCY) {
  const batch = all.slice(i, i + CONCURRENCY);
  await Promise.all(batch.map((n, j) => processOne(n, i + j)));
  if (i + CONCURRENCY < all.length) await new Promise(r => setTimeout(r, DELAY_MS));
}

console.log('\n--- 完了 ---');
console.log(`成功: ${ok} / 失敗: ${fail}`);
if (failList.length > 0) {
  console.log('\n失敗リスト:');
  failList.forEach(c => console.log(` ${c}`));
  console.log('\n再実行すると失敗分をリトライできます');
}
