import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

// 対象カードのEffectTextをCSVから取得
const targets = new Set([
  "WX17-002","WXEX1-10","WXEX1-12","WXEX1-24","WD18-001","WDK10-001","WDK13-001"
]);

const sheets = [];
for (let i = 1; i <= 11; i++) {
  const p = join(root, `public/data/CardData_Sheet${i}.csv`);
  try { sheets.push(readFileSync(p, "utf-8").replace(/^﻿/, "")); } catch {}
}

for (const csv of sheets) {
  const lines = csv.split("\n");
  const header = lines[0].split(",");
  const numIdx = header.indexOf("CardNum");
  const effectIdx = header.indexOf("EffectText");
  for (const line of lines.slice(1)) {
    // CSVの簡易分割（引用符考慮）
    const cols = [];
    let cur = "", inQ = false;
    for (const ch of line) {
      if (ch === '"') { inQ = !inQ; }
      else if (ch === ',' && !inQ) { cols.push(cur); cur = ""; }
      else { cur += ch; }
    }
    cols.push(cur);
    const cardNum = cols[numIdx]?.trim();
    if (!targets.has(cardNum)) continue;
    const effectText = cols[effectIdx]?.trim() ?? "";
    console.log(`\n=== ${cardNum} ===`);
    // 【起】部分だけ抜き出す
    const activated = effectText.match(/【起】[^【]*/g) ?? [];
    activated.forEach((a, i) => console.log(`  [起${i+1}] ${a.slice(0, 200)}`));
    if (activated.length === 0) console.log("  (【起】なし) " + effectText.slice(0, 200));
  }
}
