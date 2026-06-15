// 手札から<xxx>か<yyy>のシグニをN枚捨てる（OR条件）パターンを確認
import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

const orRe = /手札から(?:＜[^＞]+＞か)+＜[^＞]+＞のシグニを[０-９\d]+枚捨てる/;

for (let i = 1; i <= 11; i++) {
  const p = join(root, `public/data/CardData_Sheet${i}.csv`);
  if (!existsSync(p)) break;
  const lines = readFileSync(p, "utf-8").replace(/^﻿/, "").split("\n");
  const header = lines[0].split(",");
  const numIdx = header.indexOf("CardNum");
  const effectIdx = header.indexOf("EffectText");
  for (const line of lines.slice(1)) {
    const cols = [];
    let cur = "", inQ = false;
    for (const ch of line) {
      if (ch === '"') { inQ = !inQ; }
      else if (ch === ',' && !inQ) { cols.push(cur); cur = ""; }
      else { cur += ch; }
    }
    cols.push(cur);
    const num = cols[numIdx]?.trim();
    const text = cols[effectIdx]?.trim() ?? "";
    if (orRe.test(text)) {
      const m = text.match(orRe);
      console.log(`${num}: "${m[0]}"`);
    }
  }
}
