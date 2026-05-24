/**
 * タカラトミー旧サイトから画像を取得して Supabase にアップロードする。
 * upload-retry.md の失敗リストはそのまま残す（元サイトが復旧したら再利用するため）。
 *
 * URL形式: https://www.takaratomy.co.jp/products/wixoss/library/images/card/{PREFIX}/{CARDNUM}.jpg
 * PREFIX = CardNum のハイフン前の部分（例: WD01-002 → WD01、WXK02-030 → WXK02）
 */

import { createClient } from '@supabase/supabase-js';
import sharp from 'sharp';

const SUPABASE_URL = 'https://dmxomxrdnwbojdypdtvu.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRteG9teHJkbndib2pkeXBkdHZ1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg0MTYyNDMsImV4cCI6MjA5Mzk5MjI0M30.-2CR96PNyoGgiLuf_h0M74pL4ENjIX_shG4lD0Dl8rg';
const BUCKET = 'card-images';
const CONCURRENCY = 3;
const DELAY_MS = 400;

// upload-retry.md の失敗リスト（そのまま維持）
const RETRY_LIST = [
  'WD01-002', 'WD01-006', 'WD01-007', 'WD01-008', 'WD01-011',
  'WD02-003', 'WD02-005', 'WD02-009', 'WD02-012', 'WD02-014',
  'WD03-004', 'WD03-005', 'WD03-009',
  'WD04-003', 'WD04-004',
  'WD05-004', 'WD05-005',
  'WD06-018',
  'WD09-018',
  'WD11-004',
  'WD12-004',
  'WD15-002', 'WD15-006', 'WD15-013', 'WD15-014', 'WD15-015', 'WD15-018',
  'WD17-009',
  'WX01-032', 'WX01-085',
  'WX03-019',
  'WX04-020', 'WX04-064',
  'WX08-032', 'WX08-044', 'WX08-071',
  'WX11-012', 'WX11-042',
  'WX15-094', 'WX15-096',
  'WX16-Re17',
  'WX17-040', 'WX17-044',
  'WX18-074',
  'WX19-004',
  'WX20-022', 'WX20-033',
  'WXK02-030',
];

function buildUrl(cardNum) {
  const prefix = cardNum.split('-')[0];
  return `https://www.takaratomy.co.jp/products/wixoss/library/images/card/${prefix}/${cardNum}.jpg`;
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

console.log(`タカラトミー旧サイトから ${RETRY_LIST.length} 枚をアップロード\n`);

let ok = 0, fail = 0;
const failed = [];

async function processOne(cardNum, index) {
  const url   = buildUrl(cardNum);
  const label = `[${String(index + 1).padStart(2)}/${RETRY_LIST.length}] ${cardNum}`;
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://www.takaratomy.co.jp/products/wixoss/',
        'Accept': 'image/webp,image/apng,image/*,*/*',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const webp = await sharp(Buffer.from(await res.arrayBuffer()))
      .webp({ quality: 82 })
      .toBuffer();
    const { error } = await supabase.storage.from(BUCKET)
      .upload(`${cardNum}.webp`, webp, { contentType: 'image/webp', upsert: true });
    if (error) throw new Error(error.message);
    console.log(`${label} ✓  ${(webp.length / 1024).toFixed(0)}KB  ${url}`);
    return 'ok';
  } catch (e) {
    console.log(`${label} ✗  ${e.message}  ${url}`);
    failed.push(cardNum);
    return 'fail';
  }
}

for (let i = 0; i < RETRY_LIST.length; i += CONCURRENCY) {
  const batch = RETRY_LIST.slice(i, i + CONCURRENCY);
  const results = await Promise.all(batch.map((n, j) => processOne(n, i + j)));
  results.forEach(r => r === 'ok' ? ok++ : fail++);
  if (i + CONCURRENCY < RETRY_LIST.length) {
    await new Promise(r => setTimeout(r, DELAY_MS));
  }
}

console.log(`\n完了: 成功 ${ok} / 失敗 ${fail}`);
if (failed.length > 0) {
  console.log('\n--- 引き続き失敗したカード ---');
  failed.forEach(n => console.log(` ${n}  →  ${buildUrl(n)}`));
}
