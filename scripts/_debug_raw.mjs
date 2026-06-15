import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const targets = new Set(["WXEX1-24", "WD18-001"]);
for (let i = 1; i <= 11; i++) {
  const p = join(root, `public/data/CardData_Sheet${i}.csv`);
  if (!existsSync(p)) break;
  const lines = readFileSync(p, "utf-8").replace(/^﻿/, "").split("\n");
  const h = lines[0].split(",");
  const ni = h.indexOf("CardNum"), ti = h.indexOf("EffectText"), lv = h.indexOf("Level");
  for (const l of lines.slice(1)) {
    const cols = []; let c = "", q = false;
    for (const ch of l) {
      if (ch === '"') { q = !q; } else if (ch === ',' && !q) { cols.push(c); c = ""; } else { c += ch; }
    }
    cols.push(c);
    const num = cols[ni]?.trim();
    if (!targets.has(num)) continue;
    const text = cols[ti]?.trim() ?? "";
    console.log(`\n=== ${num} Lv${cols[lv]?.trim()} ===`);
    console.log(`EffectText: ${text.slice(0, 400)}`);
  }
}
