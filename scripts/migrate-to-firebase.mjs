/**
 * SupabaseのカードバケットをFirebase Storageに移行するスクリプト
 *
 * 事前準備:
 *   1. npm install firebase-admin
 *   2. Firebase Console > プロジェクト設定 > サービスアカウント > 秘密鍵を生成
 *      → scripts/firebase-service-account.json として保存
 *   3. Firebase Storage のルールを公開読み取りに設定:
 *      rules_version = '2';
 *      service firebase.storage {
 *        match /b/{bucket}/o {
 *          match /{allPaths=**} {
 *            allow read: if true;
 *            allow write: if false;
 *          }
 *        }
 *      }
 *
 * 実行:
 *   FIREBASE_STORAGE_BUCKET=your-project.appspot.com node scripts/migrate-to-firebase.mjs
 */

import { initializeApp, cert } from 'firebase-admin/app';
import { getStorage } from 'firebase-admin/storage';
import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const SERVICE_ACCOUNT_PATH = resolve(__dirname, 'firebase-service-account.json');
const BUCKET_NAME = process.env.FIREBASE_STORAGE_BUCKET;
const SUPABASE_URL = 'https://dmxomxrdnwbojdypdtvu.supabase.co';
const CONCURRENCY = 8;
const DELAY_MS = 100;

if (!existsSync(SERVICE_ACCOUNT_PATH)) {
  console.error('❌ scripts/firebase-service-account.json が見つかりません');
  console.error('   Firebase Console > プロジェクト設定 > サービスアカウント > 秘密鍵を生成');
  process.exit(1);
}
if (!BUCKET_NAME) {
  console.error('❌ 環境変数 FIREBASE_STORAGE_BUCKET が未設定です');
  console.error('   例: FIREBASE_STORAGE_BUCKET=wixoss-app.appspot.com node scripts/migrate-to-firebase.mjs');
  process.exit(1);
}

initializeApp({
  credential: cert(JSON.parse(readFileSync(SERVICE_ACCOUNT_PATH, 'utf-8'))),
  storageBucket: BUCKET_NAME,
});
const bucket = getStorage().bucket();

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

let ok = 0, skipped = 0, fail = 0;
const failList = [];

async function processOne(cardNum, index) {
  const label = `[${String(index + 1).padStart(5)}/${all.length}] ${cardNum.padEnd(14)}`;
  const destPath = `${cardNum}.webp`;
  const file = bucket.file(destPath);

  const [exists] = await file.exists();
  if (exists) {
    process.stdout.write(`${label} ○ skip\n`);
    skipped++;
    return;
  }

  const srcUrl = `${SUPABASE_URL}/storage/v1/object/public/card-images/${cardNum}.webp`;
  try {
    const res = await fetch(srcUrl, { signal: AbortSignal.timeout(30000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    await file.save(buf, { metadata: { contentType: 'image/webp' } });
    process.stdout.write(`${label} ✓ ${(buf.length / 1024).toFixed(0)}KB\n`);
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
console.log(`成功: ${ok} / スキップ: ${skipped} / 失敗: ${fail}`);
if (failList.length > 0) {
  console.log('\n失敗リスト:');
  failList.forEach(c => console.log(` ${c}`));
  console.log('\n再実行すると失敗分だけ自動リトライします（スキップ済みはスキップ）');
}
