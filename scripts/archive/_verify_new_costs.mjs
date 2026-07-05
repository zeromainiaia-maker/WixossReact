import { readFileSync } from "fs";
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

// energyTrash コスト確認
console.log("=== energyTrash コスト確認 ===");
const etCases = [];
for (const [cn, effects] of Object.entries(allEffects)) {
  for (const e of effects) {
    if (e.cost?.energyTrash) etCases.push({ cn, id: e.effectId, cost: e.cost.energyTrash });
  }
}
console.log(`energyTrash 設定件数: ${etCases.length}`);
etCases.slice(0, 15).forEach(({ cn, id, cost }) => console.log(`  ${id}: ${JSON.stringify(cost)}`));

// trashExile コスト確認
console.log("\n=== trashExile コスト確認 ===");
const teCases = [];
for (const [cn, effects] of Object.entries(allEffects)) {
  for (const e of effects) {
    if (e.cost?.trashExile) teCases.push({ cn, id: e.effectId, cost: e.cost.trashExile });
  }
}
console.log(`trashExile 設定件数: ${teCases.length}`);
teCases.forEach(({ id, cost }) => console.log(`  ${id}: ${JSON.stringify(cost)}`));

// cost=undefined チェック（上記パターンのはずが未設定のもの）
console.log("\n=== 残 cost=undefined ACTIVATED ===");
let cnt = 0;
for (const [cn, effects] of Object.entries(allEffects)) {
  for (const e of effects) {
    if (e.effectType === "ACTIVATED" && e.cost === undefined) { cnt++; }
  }
}
console.log(`cost=undefined ACTIVATED 件数: ${cnt}`);
