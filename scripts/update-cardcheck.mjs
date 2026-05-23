import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, '../public/data');

// 簡易CSVパーサー（ダブルクォートのフィールドに対応）
function parseCSVLine(line) {
  const fields = [];
  let cur = '';
  let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuote && line[i + 1] === '"') { cur += '"'; i++; }
      else inQuote = !inQuote;
    } else if (ch === ',' && !inQuote) {
      fields.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  fields.push(cur);
  return fields;
}

// 全SheetからCardNum→{EffectText,BurstText}マップを構築
const effectMap = new Map(); // CardNum → { effectText, burstText }

for (let i = 1; i <= 10; i++) {
  const file = path.join(dataDir, `CardData_Sheet${i}.csv`);
  if (!fs.existsSync(file)) continue;
  const lines = fs.readFileSync(file, 'utf-8').split('\n');
  for (let li = 1; li < lines.length; li++) {
    const line = lines[li].trim();
    if (!line) continue;
    const fields = parseCSVLine(line);
    const cardNum = fields[0]?.trim();
    if (!cardNum) continue;
    // ヘッダー: CardNum,CardName,ImgURL,Type,CardClass,Color,Level,GrowCost,Cost,Limit,Power,Restriction,Team,Timing,Guard,Coin,Story,LifeBurst,EffectText,BurstText
    //           0       1        2      3    4          5     6     7        8    9     10    11           12   13     14    15   16    17         18         19
    const effectText = fields[18] ?? '';
    const burstText  = fields[19] ?? '';
    if (!effectMap.has(cardNum)) {
      effectMap.set(cardNum, { effectText, burstText });
    }
  }
}

// CardCheck.csvを読み込んで更新
const checkFile = path.join(dataDir, 'CardCheck.csv');
const lines = fs.readFileSync(checkFile, 'utf-8').split('\n');

const output = [];
output.push('CardNum,CardName,チェック済み,EffectText,BurstText');

for (let i = 1; i < lines.length; i++) {
  const line = lines[i].trim();
  if (!line) continue;
  const fields = parseCSVLine(line);
  const cardNum  = fields[0] ?? '';
  const cardName = fields[1] ?? '';
  const checked  = fields[2] ?? '';

  const entry = effectMap.get(cardNum);
  const effectText = entry?.effectText ?? '';
  const burstText  = entry?.burstText  ?? '';

  // フィールドにカンマや改行が含まれる場合はクォートで囲む
  function quoteIfNeeded(s) {
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
      return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
  }

  output.push(`${cardNum},${quoteIfNeeded(cardName)},${checked},${quoteIfNeeded(effectText)},${quoteIfNeeded(burstText)}`);
}

fs.writeFileSync(checkFile, output.join('\n'), 'utf-8');
console.log(`完了: ${output.length - 1} 行を更新しました`);
