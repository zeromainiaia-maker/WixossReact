import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const SUPABASE_URL = 'https://dmxomxrdnwbojdypdtvu.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRteG9teHJkbndib2pkeXBkdHZ1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg0MTYyNDMsImV4cCI6MjA5Mzk5MjI0M30.-2CR96PNyoGgiLuf_h0M74pL4ENjIX_shG4lD0Dl8rg';
const BUCKET = 'card-images';
const CHUNK = 100; // Supabase の一括削除上限

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const before = fs.readFileSync('./public/data/backup/CardData_Sheet1.csv', 'utf-8')
  .split('\n').slice(1).filter(l => l.trim()).map(l => l.split(',')[0].trim());
const after = new Set(
  fs.readFileSync('./public/data/CardData_Sheet1.csv', 'utf-8')
    .split('\n').slice(1).filter(l => l.trim()).map(l => l.split(',')[0].trim())
);

const targets = before.filter(n => !after.has(n)).map(n => `${n}.webp`);
console.log(`削除対象: ${targets.length} ファイル\n`);

let deleted = 0, failed = 0;
for (let i = 0; i < targets.length; i += CHUNK) {
  const chunk = targets.slice(i, i + CHUNK);
  const { error } = await supabase.storage.from(BUCKET).remove(chunk);
  if (error) {
    console.error(`エラー (${i}〜): ${error.message}`);
    failed += chunk.length;
  } else {
    deleted += chunk.length;
    console.log(`削除済: ${deleted}/${targets.length}`);
  }
}

console.log(`\n完了: 削除 ${deleted} / 失敗 ${failed}`);
