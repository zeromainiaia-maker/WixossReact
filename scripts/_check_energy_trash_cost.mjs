// エナゾーンから指定シグニをトラッシュするコストが未設定かを確認
import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

const jsonFiles = [
  "public/data/effects_WX.json",
  "public/data/effects_WXDi.json",
  "public/data/effects_WX24_26.json",
  "public/data/effects_WXK.json",
  "public/data/effects_misc.json",
];
const allEffects = {};
for (const f of jsonFiles) {
  const data = JSON.parse(readFileSync(join(root, f), "utf-8"));
  Object.assign(allEffects, data);
}

const cardMap = {};
for (let i = 1; i <= 11; i++) {
  const p = join(root, `public/data/CardData_Sheet${i}.csv`);
  if (!existsSync(p)) break;
  const lines = readFileSync(p, "utf-8").replace(/^﻿/, "").split("\n");
  const h = lines[0].split(",");
  const ni = h.indexOf("CardNum"), ti = h.indexOf("EffectText");
  for (const l of lines.slice(1)) {
    const cols = []; let c = "", q = false;
    for (const ch of l) {
      if (ch === '"') { q = !q; } else if (ch === ',' && !q) { cols.push(c); c = ""; } else { c += ch; }
    }
    cols.push(c);
    const num = cols[ni]?.trim();
    if (num) cardMap[num] = cols[ti]?.trim() ?? "";
  }
}

const energyTrashCostRe = /エナゾーンから.*のシグニ[０-９\d]枚をトラッシュに置く/;
const issues = [];

for (const [cardNum, effects] of Object.entries(allEffects)) {
  for (const e of effects) {
    if (e.effectType !== "ACTIVATED" || e.cost !== undefined) continue;
    const text = cardMap[cardNum] ?? "";
    const blocks = text.match(/【起】[^【]*/g) ?? [];
    for (const block of blocks) {
      const colonIdx = block.indexOf("：");
      if (colonIdx < 0) continue;
      const fullBlock = block;
      const afterMarker = fullBlock.slice(fullBlock.indexOf("】") + 1);
      const costPart = afterMarker.slice(0, afterMarker.indexOf("："));
      if (energyTrashCostRe.test(costPart)) {
        issues.push({ cardNum, effectId: e.effectId, costPart });
        break;
      }
    }
  }
}

console.log(`\nenergyTrash コスト未設定: ${issues.length}件`);
for (const { cardNum, effectId, costPart } of issues) {
  console.log(`  ${effectId}: "${costPart}"`);
}
