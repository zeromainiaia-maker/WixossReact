/**
 * backup/CardData_TK.csv の全カード画像をタカラトミーからダウンロードし
 * ImageKit にアップロードする（upsert）。
 *
 * 実行:
 *   node scripts/upload-tk-images.mjs
 */

import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const IMAGEKIT_PRIVATE_KEY = 'private_DobBYzfSy5+QXVOAAqfkFJsQNcQ=';
const IMAGEKIT_UPLOAD_URL = 'https://upload.imagekit.io/api/v1/files/upload';
const AUTH = 'Basic ' + Buffer.from(IMAGEKIT_PRIVATE_KEY + ':').toString('base64');
const CONCURRENCY = 3;
const DELAY_MS = 300;

const BACKUP_TK_CSV = resolve(__dirname, '../public/data/backup/CardData_TK.csv');

function parseCSV(filePath) {
  const cards = [];
  const lines = readFileSync(filePath, 'utf-8').replace(/^﻿/, '').split('\n').slice(1);
  for (const line of lines) {
    if (!line.trim()) continue;
    const cols = line.split(',');
    const cardNum = cols[0]?.trim();
    const imgUrl = cols[2]?.trim();
    if (cardNum && imgUrl && imgUrl.startsWith('http')) {
      cards.push({ cardNum, imgUrl });
    }
  }
  return cards;
}

const cards = parseCSV(BACKUP_TK_CSV);
console.log(`対象: ${cards.length} 枚\n`);

async function downloadAsWebp(url) {
  const { default: sharp } = await import('sharp');
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Referer': 'https://www.takaratomy.co.jp/products/wixoss/',
      'Accept': 'image/webp,image/apng,image/*,*/*',
    },
    redirect: 'follow',
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error(`DL失敗 HTTP ${res.status}`);
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
    throw new Error(`UL失敗 HTTP ${res.status}: ${err}`);
  }
}

let ok = 0, fail = 0;
const failList = [];

async function processCard(card, index) {
  const label = `[${String(index + 1).padStart(3)}/${cards.length}] ${card.cardNum.padEnd(20)}`;
  try {
    const webp = await downloadAsWebp(card.imgUrl);
    await uploadToImageKit(card.cardNum, webp);
    process.stdout.write(`${label} ✓ ${(webp.length / 1024).toFixed(0)}KB\n`);
    ok++;
  } catch (e) {
    process.stdout.write(`${label} ✗ ${e.message}\n`);
    fail++;
    failList.push({ cardNum: card.cardNum, url: card.imgUrl });
  }
}

for (let i = 0; i < cards.length; i += CONCURRENCY) {
  const batch = cards.slice(i, i + CONCURRENCY);
  await Promise.all(batch.map((c, j) => processCard(c, i + j)));
  if (i + CONCURRENCY < cards.length) await new Promise(r => setTimeout(r, DELAY_MS));
}

console.log(`\n--- 完了 ---`);
console.log(`成功: ${ok} / 失敗: ${fail} / 合計: ${cards.length}`);
if (failList.length > 0) {
  console.log('\n失敗リスト:');
  failList.forEach(c => console.log(`  ${c.cardNum}  ${c.url}`));
}
