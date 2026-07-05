import fs from 'fs';
import path from 'path';
// 「最も」「一番」の文脈を全CSVから抽出して頻度集計
const dir = 'public/data';
const files = fs.readdirSync(dir).filter(f => f.startsWith('CardData_') && f.endsWith('.csv'));
const ctx = new Map();
const cards = new Map();
for (const f of files) {
  const lines = fs.readFileSync(path.join(dir, f), 'utf8').split('\n');
  for (const line of lines) {
    const id = line.split(',')[0];
    let idx = 0;
    for (const m of line.matchAll(/(最も|一番)([^。、]{0,14})/g)) {
      const key = m[1] + m[2];
      ctx.set(key, (ctx.get(key) || 0) + 1);
      if (!cards.has(key)) cards.set(key, new Set());
      cards.get(key).add(id);
    }
  }
}
const sorted = [...ctx.entries()].sort((a, b) => b[1] - a[1]);
for (const [k, v] of sorted) {
  const ex = [...cards.get(k)].slice(0, 4).join(' ');
  console.log(String(v).padStart(4), k, '｜例:', ex);
}
