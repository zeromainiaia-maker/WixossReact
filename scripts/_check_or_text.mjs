import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const targets = new Set(["WX02-029","WX02-032","WX02-038","WX09-042","WX09-044","WX11-003","WXK05-038"]);
for (let i = 1; i <= 11; i++) {
  const p = join(root, `public/data/CardData_Sheet${i}.csv`);
  if (!existsSync(p)) break;
  const lines = readFileSync(p, "utf-8").replace(/^﻿/, "").split("\n");
  const h = lines[0].split(",");
  const ni = h.indexOf("CardNum"), ti = h.indexOf("EffectText"), lv = h.indexOf("Level"), tp = h.indexOf("Type");
  for (const l of lines.slice(1)) {
    const cols = []; let c = "", q = false;
    for (const ch of l) {
      if (ch === '"') { q = !q; } else if (ch === ',' && !q) { cols.push(c); c = ""; } else { c += ch; }
    }
    cols.push(c);
    const num = cols[ni]?.trim();
    if (!targets.has(num)) continue;
    console.log(`${num} Lv${cols[lv]?.trim()} Type=${cols[tp]?.trim()}`);
    const blocks = (cols[ti]?.trim() ?? "").match(/【起】[^【]*/g) ?? [];
    blocks.forEach((b, i) => {
      const colonIdx = b.indexOf("：");
      const costPart = colonIdx >= 0 ? b.slice(b.indexOf("】") + 1, colonIdx) : "(no colon)";
      console.log(`  起${i+1} cost="${costPart}"`);
    });
  }
}
