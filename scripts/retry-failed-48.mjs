import { createClient } from '@supabase/supabase-js';
import sharp from 'sharp';
import fs from 'fs';

const SUPABASE_URL = 'https://dmxomxrdnwbojdypdtvu.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRteG9teHJkbndib2pkeXBkdHZ1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg0MTYyNDMsImV4cCI6MjA5Mzk5MjI0M30.-2CR96PNyoGgiLuf_h0M74pL4ENjIX_shG4lD0Dl8rg';
const BUCKET = 'card-images';
const CONCURRENCY = 3;
const DELAY_MS = 500;

const FAILED_CARDS = [
  'WD01-002','WD01-006','WD01-007','WD01-008','WD01-011',
  'WD02-003','WD02-005','WD02-009','WD02-012','WD02-014',
  'WD03-004','WD03-005','WD03-009',
  'WD04-003','WD04-004',
  'WD05-004','WD05-005',
  'WD06-018',
  'WD09-018',
  'WD11-004',
  'WD12-004',
  'WD15-002','WD15-006','WD15-013','WD15-014','WD15-015','WD15-018',
  'WD17-009',
  'WX01-032','WX01-085',
  'WX03-019',
  'WX04-020','WX04-064',
  'WX08-032','WX08-044','WX08-071',
  'WX11-012','WX11-042',
  'WX15-094','WX15-096',
  'WX16-Re17',
  'WX17-040','WX17-044',
  'WX18-074',
  'WX19-004',
  'WX20-022','WX20-033',
  'WXK02-030',
];

const FILES = [
  './public/data/CardData_Sheet1.csv',
  './public/data/CardData_Sheet2.csv',
  './public/data/CardData_Sheet3.csv',
  './public/data/CardData_Sheet4.csv',
  './public/data/CardData_Sheet5.csv',
  './public/data/CardData_Sheet6.csv',
  './public/data/CardData_Sheet7.csv',
  './public/data/CardData_Sheet8.csv',
  './public/data/CardData_Sheet9.csv',
  './public/data/CardData_Sheet10.csv',
  './public/data/CardData_TK.csv',
];

// CSVからCardNum→ImgURL のMapを構築
const urlMap = new Map();
for (const file of FILES) {
  if (!fs.existsSync(file)) continue;
  const lines = fs.readFileSync(file, 'utf-8').replace(/^﻿/, '').split('\n').slice(1);
  for (const line of lines) {
    if (!line.trim()) continue;
    const cols = line.split(',');
    const cardNum = cols[0]?.trim();
    const imgUrl  = cols[2]?.trim();
    if (cardNum && imgUrl && imgUrl.startsWith('http')) {
      urlMap.set(cardNum, imgUrl);
    }
  }
}

const FETCH_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Referer': 'https://www.takaratomy.co.jp/products/wixoss/',
  'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8',
};

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

let ok = 0, fail = 0, notInCsv = 0;
const failList = [];

async function processOne(cardNum, index) {
  const label = `[${String(index + 1).padStart(2)}/${FAILED_CARDS.length}] ${cardNum}`;
  const imgUrl = urlMap.get(cardNum);
  if (!imgUrl) {
    console.log(`${label} ✗ CSVにURLなし`);
    notInCsv++;
    failList.push(cardNum);
    return;
  }

  try {
    const res = await fetch(imgUrl, {
      headers: FETCH_HEADERS,
      redirect: 'follow',
      signal: AbortSignal.timeout(25000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const webp = await sharp(Buffer.from(await res.arrayBuffer())).webp({ quality: 82 }).toBuffer();
    // UPDATEポリシーがないため、削除してからINSERTする
    await supabase.storage.from(BUCKET).remove([`${cardNum}.webp`]);
    const { error } = await supabase.storage.from(BUCKET)
      .upload(`${cardNum}.webp`, webp, { contentType: 'image/webp', upsert: false });
    if (error) throw new Error(error.message);
    console.log(`${label} ✓ ${(webp.length / 1024).toFixed(0)}KB  ${imgUrl}`);
    ok++;
  } catch (e) {
    console.log(`${label} ✗ ${e.message}  ${imgUrl}`);
    fail++;
    failList.push(cardNum);
  }
}

console.log(`対象: ${FAILED_CARDS.length} 枚（正規URLから再ダウンロード試行）\n`);

for (let i = 0; i < FAILED_CARDS.length; i += CONCURRENCY) {
  const batch = FAILED_CARDS.slice(i, i + CONCURRENCY);
  await Promise.all(batch.map((n, j) => processOne(n, i + j)));
  if (i + CONCURRENCY < FAILED_CARDS.length) await new Promise(r => setTimeout(r, DELAY_MS));
}

console.log(`\n--- 結果 ---`);
console.log(`成功: ${ok} / 失敗: ${fail} / CSVなし: ${notInCsv}`);
if (failList.length > 0) {
  console.log(`\n失敗リスト:`);
  failList.forEach(c => console.log(` ${c}`));
}
