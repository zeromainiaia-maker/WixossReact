import { createClient } from '@supabase/supabase-js';
import sharp from 'sharp';
import fs from 'fs';

const SUPABASE_URL = 'https://dmxomxrdnwbojdypdtvu.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRteG9teHJkbndib2pkeXBkdHZ1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg0MTYyNDMsImV4cCI6MjA5Mzk5MjI0M30.-2CR96PNyoGgiLuf_h0M74pL4ENjIX_shG4lD0Dl8rg';
const BUCKET = 'card-images';
const CSV_FILE = './public/data/CardData_Sheet1.csv';
const CONCURRENCY = 3;   // 同時並行数
const DELAY_MS = 200;    // リクエスト間の待機(ms)

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

function parseCards(csvText) {
  return csvText
    .split('\n')
    .slice(1)
    .filter(l => l.trim())
    .map(line => {
      const cardNum = line.split(',')[0];
      const urlMatch = line.match(/https?:\/\/[^\s,]+\.jpg/);
      return { cardNum, imgUrl: urlMatch?.[0] };
    })
    .filter(c => c.cardNum && c.imgUrl);
}

async function downloadAsWebp(url) {
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
  const buf = Buffer.from(await res.arrayBuffer());
  return sharp(buf).webp({ quality: 82 }).toBuffer();
}

async function upload(cardNum, webpBuf) {
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(`${cardNum}.webp`, webpBuf, { contentType: 'image/webp', upsert: true });
  if (error) throw new Error(error.message);
}

async function processCard(card, index, total) {
  const label = `[${String(index + 1).padStart(3)}/${total}] ${card.cardNum}`;
  try {
    const webp = await downloadAsWebp(card.imgUrl);
    await upload(card.cardNum, webp);
    console.log(`${label} ✓ ${(webp.length / 1024).toFixed(0)}KB`);
    return 'ok';
  } catch (e) {
    console.log(`${label} ✗ ${e.message}`);
    return 'fail';
  }
}

async function main() {
  const csv = fs.readFileSync(CSV_FILE, 'utf-8');
  const cards = parseCards(csv);
  console.log(`${cards.length}枚を処理します（同時${CONCURRENCY}件）\n`);

  let ok = 0, fail = 0;

  for (let i = 0; i < cards.length; i += CONCURRENCY) {
    const batch = cards.slice(i, i + CONCURRENCY);
    const results = await Promise.all(
      batch.map((c, j) => processCard(c, i + j, cards.length))
    );
    results.forEach(r => r === 'ok' ? ok++ : fail++);
    if (i + CONCURRENCY < cards.length) {
      await new Promise(r => setTimeout(r, DELAY_MS));
    }
  }

  console.log(`\n完了: 成功 ${ok} / 失敗 ${fail} / 合計 ${cards.length}`);
}

main().catch(console.error);
