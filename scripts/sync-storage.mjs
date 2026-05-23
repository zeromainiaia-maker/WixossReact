import { createClient } from '@supabase/supabase-js';
import sharp from 'sharp';
import fs from 'fs';

const SUPABASE_URL = 'https://dmxomxrdnwbojdypdtvu.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRteG9teHJkbndib2pkeXBkdHZ1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg0MTYyNDMsImV4cCI6MjA5Mzk5MjI0M30.-2CR96PNyoGgiLuf_h0M74pL4ENjIX_shG4lD0Dl8rg';
const BUCKET = 'card-images';
const CONCURRENCY = 3;
const DELAY_MS = 200;

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

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ── CSV から CardNum→ImgURL の Map を構築 ────────────────────
const targetMap = new Map(); // CardNum → ImgURL
for (const file of FILES) {
  if (!fs.existsSync(file)) continue;
  const lines = fs.readFileSync(file, 'utf-8').replace(/^﻿/, '').split('\n').slice(1);
  for (const line of lines) {
    if (!line.trim()) continue;
    const cardNum  = line.split(',')[0].trim();
    const urlMatch = line.match(/https?:\/\/[^\s,]+\.jpg/);
    if (cardNum && urlMatch) targetMap.set(cardNum, urlMatch[0]);
  }
}
console.log(`新CSV のターゲット: ${targetMap.size} 枚\n`);

// ── Storage の全ファイル一覧を取得 ──────────────────────────
console.log('Storage一覧を取得中...');
const storageNums = new Set();
let offset = 0;
while (true) {
  const { data, error } = await supabase.storage.from(BUCKET).list('', { limit: 1000, offset });
  if (error) { console.error('list error:', error.message); break; }
  if (!data || data.length === 0) break;
  for (const f of data) storageNums.add(f.name.replace('.webp', ''));
  if (data.length < 1000) break;
  offset += 1000;
}
console.log(`Storage現在: ${storageNums.size} 枚\n`);

// ── 差分計算 ────────────────────────────────────────────────
const toUpload = [...targetMap.keys()].filter(n => !storageNums.has(n));
const toDelete  = [...storageNums].filter(n => !targetMap.has(n));

console.log(`アップロード必要: ${toUpload.length} 枚`);
console.log(`削除必要:         ${toDelete.length} 枚\n`);

// ── 削除 ────────────────────────────────────────────────────
if (toDelete.length > 0) {
  console.log('--- 削除開始 ---');
  const CHUNK = 100;
  let deleted = 0;
  for (let i = 0; i < toDelete.length; i += CHUNK) {
    const chunk = toDelete.slice(i, i + CHUNK).map(n => `${n}.webp`);
    const { error } = await supabase.storage.from(BUCKET).remove(chunk);
    if (error) console.error(`削除エラー: ${error.message}`);
    else { deleted += chunk.length; console.log(`削除済: ${deleted}/${toDelete.length}`); }
  }
  console.log(`削除完了: ${deleted} 枚\n`);
}

// ── アップロード ─────────────────────────────────────────────
if (toUpload.length > 0) {
  console.log('--- アップロード開始 ---');
  let ok = 0, fail = 0;

  async function processOne(cardNum, index) {
    const imgUrl = targetMap.get(cardNum);
    const label  = `[${String(index + 1).padStart(4)}/${toUpload.length}] ${cardNum}`;
    try {
      const res = await fetch(imgUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Referer': 'https://www.takaratomy.co.jp/products/wixoss/',
          'Accept': 'image/webp,image/apng,image/*,*/*',
        },
        redirect: 'follow',
        signal: AbortSignal.timeout(20000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const webp = await sharp(Buffer.from(await res.arrayBuffer())).webp({ quality: 82 }).toBuffer();
      const { error } = await supabase.storage.from(BUCKET)
        .upload(`${cardNum}.webp`, webp, { contentType: 'image/webp', upsert: true });
      if (error) throw new Error(error.message);
      console.log(`${label} ✓ ${(webp.length / 1024).toFixed(0)}KB`);
      return 'ok';
    } catch (e) {
      console.log(`${label} ✗ ${e.message}`);
      return 'fail';
    }
  }

  for (let i = 0; i < toUpload.length; i += CONCURRENCY) {
    const batch = toUpload.slice(i, i + CONCURRENCY);
    const results = await Promise.all(batch.map((n, j) => processOne(n, i + j)));
    results.forEach(r => r === 'ok' ? ok++ : fail++);
    if (i + CONCURRENCY < toUpload.length) await new Promise(r => setTimeout(r, DELAY_MS));
  }
  console.log(`\nアップロード完了: 成功 ${ok} / 失敗 ${fail}`);
}

console.log('\n--- 同期完了 ---');
