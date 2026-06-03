/**
 * バックアップCSVにあって現在のCSVにないカードの画像を
 * タカラトミーサイトからダウンロードし、ImageKitにアップロードする
 *
 * 実行:
 *   node scripts/upload-backup-only-cards.mjs
 *
 * 差分確認のみ（アップロードなし）:
 *   DRY_RUN=1 node scripts/upload-backup-only-cards.mjs
 */

import { readFileSync, existsSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';

const __dirname = dirname(fileURLToPath(import.meta.url));

const IMAGEKIT_PRIVATE_KEY = 'private_DobBYzfSy5+QXVOAAqfkFJsQNcQ=';
const IMAGEKIT_UPLOAD_URL = 'https://upload.imagekit.io/api/v1/files/upload';
const AUTH = 'Basic ' + Buffer.from(IMAGEKIT_PRIVATE_KEY + ':').toString('base64');
const CONCURRENCY = 3;
const DELAY_MS = 300;
const DRY_RUN = process.env.DRY_RUN === '1';

const CURRENT_CSV_FILES = [
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

const BACKUP_CSV_FILES = [
  '../public/data/backup/CardData_Sheet1.csv',
  '../public/data/backup/CardData_Sheet2.csv',
  '../public/data/backup/CardData_Sheet3.csv',
  '../public/data/backup/CardData_Sheet4.csv',
  '../public/data/backup/CardData_Sheet5.csv',
  '../public/data/backup/CardData_Sheet6.csv',
  '../public/data/backup/CardData_Sheet7.csv',
  '../public/data/backup/CardData_Sheet8.csv',
  '../public/data/backup/CardData_Sheet9.csv',
  '../public/data/backup/CardData_Sheet10.csv',
  '../public/data/backup/CardData_TK.csv',
];

function parseCSV(filePath) {
  const cards = new Map(); // cardNum -> imgUrl
  const path = resolve(__dirname, filePath);
  if (!existsSync(path)) return cards;
  const lines = readFileSync(path, 'utf-8').replace(/^﻿/, '').split('\n').slice(1);
  for (const line of lines) {
    if (!line.trim()) continue;
    const cols = line.split(',');
    const cardNum = cols[0]?.trim();
    const imgUrl = cols[2]?.trim();
    if (cardNum && imgUrl && imgUrl.startsWith('http')) {
      cards.set(cardNum, imgUrl);
    }
  }
  return cards;
}

// 現在のCSVから全CardNumを収集
const currentNums = new Set();
for (const f of CURRENT_CSV_FILES) {
  const cards = parseCSV(f);
  for (const num of cards.keys()) currentNums.add(num);
}
console.log(`現在のCSV: ${currentNums.size} 枚`);

// バックアップCSVから全CardNum+ImgURLを収集
const backupCards = new Map();
for (const f of BACKUP_CSV_FILES) {
  const cards = parseCSV(f);
  for (const [num, url] of cards) {
    if (!backupCards.has(num)) backupCards.set(num, url);
  }
}
console.log(`バックアップCSV: ${backupCards.size} 枚`);

// 差分: バックアップにあって現在にないカード
const diffCards = [];
for (const [num, url] of backupCards) {
  if (!currentNums.has(num)) {
    diffCards.push({ cardNum: num, imgUrl: url });
  }
}
console.log(`差分（バックアップのみ）: ${diffCards.length} 枚\n`);

if (diffCards.length === 0) {
  console.log('アップロード対象なし。終了します。');
  process.exit(0);
}

if (DRY_RUN) {
  console.log('[DRY RUN] アップロード対象カード一覧:');
  diffCards.forEach(c => console.log(`  ${c.cardNum}  ${c.imgUrl}`));
  const outPath = resolve(__dirname, '../diff-backup-only.txt');
  writeFileSync(outPath, diffCards.map(c => `${c.cardNum}\t${c.imgUrl}`).join('\n'), 'utf-8');
  console.log(`\n一覧を ${outPath} に保存しました`);
  process.exit(0);
}

async function downloadAsWebp(url) {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Referer': 'https://www.takaratomy.co.jp/products/wixoss/',
      'Accept': 'image/webp,image/apng,image/*,*/*',
    },
    redirect: 'follow',
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error(`ダウンロード失敗 HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  return sharp(buf).webp({ quality: 82 }).toBuffer();
}

async function uploadToImageKit(cardNum, webpBuf) {
  const fileName = `${cardNum}.webp`;
  const form = new FormData();
  form.append('file', new Blob([webpBuf], { type: 'image/webp' }), fileName);
  form.append('fileName', fileName);
  form.append('useUniqueFileName', 'false');

  const res = await fetch(IMAGEKIT_UPLOAD_URL, {
    method: 'POST',
    headers: { Authorization: AUTH },
    body: form,
    signal: AbortSignal.timeout(60000),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`アップロード失敗 HTTP ${res.status}: ${err}`);
  }
}

let ok = 0, fail = 0;
const failList = [];

async function processCard(card, index) {
  const label = `[${String(index + 1).padStart(4)}/${diffCards.length}] ${card.cardNum.padEnd(14)}`;
  try {
    const webp = await downloadAsWebp(card.imgUrl);
    await uploadToImageKit(card.cardNum, webp);
    process.stdout.write(`${label} ✓ ${(webp.length / 1024).toFixed(0)}KB\n`);
    ok++;
  } catch (e) {
    process.stdout.write(`${label} ✗ ${e.message}\n`);
    fail++;
    failList.push(card.cardNum);
  }
}

for (let i = 0; i < diffCards.length; i += CONCURRENCY) {
  const batch = diffCards.slice(i, i + CONCURRENCY);
  await Promise.all(batch.map((c, j) => processCard(c, i + j)));
  if (i + CONCURRENCY < diffCards.length) await new Promise(r => setTimeout(r, DELAY_MS));
}

console.log('\n--- 完了 ---');
console.log(`成功: ${ok} / 失敗: ${fail} / 合計: ${diffCards.length}`);
if (failList.length > 0) {
  console.log('\n失敗リスト:');
  failList.forEach(c => console.log(`  ${c}`));
}
