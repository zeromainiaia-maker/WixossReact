/**
 * カード画像をタカラトミーからダウンロードして ImageKit へアップロードする（upsert）。
 *
 * 🔑**復元の経緯**（2026-09-06・第174バッチ）＝この道具は 2026-06-09 の `82a1b65c1`
 *   「chore: 未使用ファイルを削除してリポジトリを整理」で `scripts/upload-*.mjs`（5本）ごと消えていた。
 *   `WXK03-003B`「夢限　-Ｅ-」を CSV へ追加したときに画像だけ 404 になり、必要になって git 履歴から戻した。
 *
 * 旧版（`scripts/upload-tk-images.mjs`）からの変更点は3つ：
 *   ① **private key をハードコードしない**＝`.env.local` の `IMAGEKIT_PRIVATE_KEY` を読む
 *      （旧版は平文で持っており、その値は git 履歴に残っている）。
 *   ② 読む CSV を `public/data/backup/CardData_TK.csv`（現存しない）から
 *      **現行の `public/data/CardData_*.csv` 全部**へ変更。
 *   ③ `--only <CardNum,...>` を追加＝**既定は全件ではなく「指定した番号だけ」**。
 *      ⚠全件を流すのは 6,700 枚への外向き書き込みなので `--all` を明示したときだけにする。
 *
 * 使い方:
 *   node scripts/archive/uploadCardImages.mjs --only WXK03-003B
 *   node scripts/archive/uploadCardImages.mjs --only WXK03-003B --dry   # DL と変換だけ（送信しない）
 *   node scripts/archive/uploadCardImages.mjs --missing                 # ImageKit に無い分だけ
 *
 * ⚠**アップロードは外向きの操作**＝実行前にユーザーの承認を取ること。
 */

import { readFileSync, existsSync, readdirSync } from 'fs';
import { resolve, dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '../..');

// ── private key は .env.local から（コミットしない）──
function readEnvLocal() {
  const p = join(root, '.env.local');
  if (!existsSync(p)) return {};
  const out = {};
  for (const line of readFileSync(p, 'utf-8').split('\n')) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m) out[m[1]] = m[2].trim();
  }
  return out;
}
const env = { ...readEnvLocal(), ...process.env };
const IMAGEKIT_PRIVATE_KEY = env.IMAGEKIT_PRIVATE_KEY;
const IMAGE_BASE = env.VITE_CARD_IMAGE_BASE;
if (!IMAGEKIT_PRIVATE_KEY) {
  console.error('IMAGEKIT_PRIVATE_KEY が .env.local にない。');
  process.exit(1);
}
const IMAGEKIT_UPLOAD_URL = 'https://upload.imagekit.io/api/v1/files/upload';
const AUTH = 'Basic ' + Buffer.from(IMAGEKIT_PRIVATE_KEY + ':').toString('base64');
const CONCURRENCY = 3;
const DELAY_MS = 300;

// ── 引数 ──
const argv = process.argv.slice(2);
const dry = argv.includes('--dry');
const all = argv.includes('--all');
const missingOnly = argv.includes('--missing');
const onlyIdx = argv.indexOf('--only');
const only = onlyIdx >= 0 ? (argv[onlyIdx + 1] ?? '').split(',').map(s => s.trim()).filter(Boolean) : [];
if (only.length === 0 && !all && !missingOnly) {
  console.error('対象の指定がない。--only <CardNum,...> / --missing / --all のどれかを付ける。');
  process.exit(1);
}

// ── CSV（現行の public/data/CardData_*.csv 全部。ImgURL 列＝原本の在処）──
// ⚠`ImgURL` は**実行時には使われない**（App.tsx が `${VITE_CARD_IMAGE_BASE}/${CardNum}.webp` を組み立てる）＝
//   この列は「原本をどこから取るか」だけに効く。
function parseCSV(filePath) {
  const cards = [];
  const lines = readFileSync(filePath, 'utf-8').replace(/^﻿/, '').split('\n').slice(1);
  for (const line of lines) {
    if (!line.trim()) continue;
    const cols = line.split(',');
    const cardNum = cols[0]?.trim();
    const imgUrl = cols[2]?.trim();
    if (cardNum && imgUrl && imgUrl.startsWith('http')) cards.push({ cardNum, imgUrl });
  }
  return cards;
}
const dataDir = join(root, 'public', 'data');
const seen = new Set();
let cards = [];
for (const f of readdirSync(dataDir).filter(f => /^CardData_.*\.csv$/.test(f))) {
  for (const c of parseCSV(join(dataDir, f))) {
    if (seen.has(c.cardNum)) continue;   // シート帰属は先勝ち（decompile/build と同じ規約）
    seen.add(c.cardNum);
    cards.push(c);
  }
}
if (only.length > 0) {
  const found = new Set(cards.map(c => c.cardNum));
  for (const n of only) if (!found.has(n)) console.error(`⚠ ${n} は CSV に無い（または ImgURL が空）`);
  cards = cards.filter(c => only.includes(c.cardNum));
}

// ── --missing: ImageKit に既に在る分を落とす ──
async function existsOnImageKit(cardNum) {
  if (!IMAGE_BASE) return false;
  try {
    const res = await fetch(`${IMAGE_BASE}/${cardNum}.webp`, { method: 'HEAD', signal: AbortSignal.timeout(15000) });
    return res.ok;
  } catch { return false; }
}
if (missingOnly) {
  const kept = [];
  for (let i = 0; i < cards.length; i += CONCURRENCY) {
    const batch = cards.slice(i, i + CONCURRENCY);
    const flags = await Promise.all(batch.map(c => existsOnImageKit(c.cardNum)));
    batch.forEach((c, j) => { if (!flags[j]) kept.push(c); });
  }
  console.log(`--missing: ${cards.length} 枚中 ${kept.length} 枚が未アップロード`);
  cards = kept;
}

if (cards.length === 0) { console.log('対象0枚。何もしない。'); process.exit(0); }
console.log(`対象: ${cards.length} 枚${dry ? '（--dry＝送信しない）' : ''}\n`);

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
    method: 'POST', headers: { Authorization: AUTH }, body: form, signal: AbortSignal.timeout(60000),
  });
  if (!res.ok) throw new Error(`UL失敗 HTTP ${res.status}: ${await res.text()}`);
}

let ok = 0, fail = 0;
const failList = [];
async function processCard(card, index) {
  const label = `[${String(index + 1).padStart(3)}/${cards.length}] ${card.cardNum.padEnd(20)}`;
  try {
    const webp = await downloadAsWebp(card.imgUrl);
    if (!dry) await uploadToImageKit(card.cardNum, webp);
    process.stdout.write(`${label} ✓ ${(webp.length / 1024).toFixed(0)}KB${dry ? '（送信せず）' : ''}\n`);
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
