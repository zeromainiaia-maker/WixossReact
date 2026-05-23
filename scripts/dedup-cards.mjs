import fs from 'fs';
import path from 'path';

const DATA_DIR  = './public/data';
const BACKUP_DIR = './public/data/backup';

const FILES = [
  'CardData_Sheet1.csv',  'CardData_Sheet2.csv',  'CardData_Sheet3.csv',
  'CardData_Sheet4.csv',  'CardData_Sheet5.csv',  'CardData_Sheet6.csv',
  'CardData_Sheet7.csv',  'CardData_Sheet8.csv',  'CardData_Sheet9.csv',
  'CardData_Sheet10.csv', 'CardData_TK.csv',
];

// ── 1. バックアップ ──────────────────────────────────────────
fs.mkdirSync(BACKUP_DIR, { recursive: true });
for (const f of FILES) {
  const src = path.join(DATA_DIR, f);
  if (!fs.existsSync(src)) continue;
  fs.copyFileSync(src, path.join(BACKUP_DIR, f));
}
console.log(`バックアップ完了 → ${BACKUP_DIR}\n`);

// ── 2. 全シートを走査してカード名ごとの最小 CardNum を収集 ──
const nameToMinNum = new Map(); // CardName → 最小 CardNum

for (const f of FILES) {
  const p = path.join(DATA_DIR, f);
  if (!fs.existsSync(p)) continue;
  const lines = fs.readFileSync(p, 'utf-8').replace(/^﻿/, '').split('\n');
  for (const line of lines.slice(1)) {
    if (!line.trim()) continue;
    const comma1 = line.indexOf(',');
    const comma2 = line.indexOf(',', comma1 + 1);
    const cardNum  = line.slice(0, comma1).trim();
    const cardName = line.slice(comma1 + 1, comma2).trim();
    if (!cardNum || !cardName) continue;
    const cur = nameToMinNum.get(cardName);
    if (!cur || cardNum < cur) nameToMinNum.set(cardName, cardNum);
  }
}
console.log(`ユニークなカード名: ${nameToMinNum.size} 種\n`);

// ── 3. 各 CSV から重複行を削除 ───────────────────────────────
let totalBefore = 0, totalAfter = 0;

for (const f of FILES) {
  const p = path.join(DATA_DIR, f);
  if (!fs.existsSync(p)) continue;

  const raw   = fs.readFileSync(p, 'utf-8').replace(/^﻿/, '');
  const lines = raw.split('\n');
  const header = lines[0];
  const data   = lines.slice(1).filter(l => l.trim());

  const before = data.length;
  totalBefore += before;

  const kept = data.filter(line => {
    const comma1 = line.indexOf(',');
    const comma2 = line.indexOf(',', comma1 + 1);
    const cardNum  = line.slice(0, comma1).trim();
    const cardName = line.slice(comma1 + 1, comma2).trim();
    return nameToMinNum.get(cardName) === cardNum;
  });

  totalAfter += kept.length;

  fs.writeFileSync(p, [header, ...kept].join('\n') + '\n', 'utf-8');

  const removed = before - kept.length;
  console.log(`${f.padEnd(26)}: ${String(before).padStart(4)} → ${String(kept.length).padStart(4)}  (${removed > 0 ? `-${removed}` : ' 0'}枚)`);
}

console.log(`\n${'合計'.padEnd(26)}: ${totalBefore} → ${totalAfter}  (-${totalBefore - totalAfter}枚)`);
