// 手札から＜XXX＞のシグニをN枚捨てる コストが未設定のACTIVATED効果を検出
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

// CSVから全カードのEffectTextを読む
const cardMap = {};
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
    if (num) cardMap[num] = cols[effectIdx]?.trim() ?? "";
  }
}

// cost=undefined の ACTIVATED効果でハンド捨てパターンがあるものを探す
const handDiscardRe = /手札から(?:[白赤青緑黒]の)?(?:＜[^＞]+＞の)?シグニを[０-９\d]+枚捨てる/;
const trashExileRe = /トラッシュにある.+ゲームから除外する/;
const issues = [];

for (const [cardNum, effects] of Object.entries(allEffects)) {
  for (const e of effects) {
    if (e.effectType !== "ACTIVATED" || e.cost !== undefined) continue;
    const text = cardMap[cardNum] ?? "";
    // 該当【起】ブロックを探す
    const blocks = text.match(/【起】[^【]*/g) ?? [];
    const idx = parseInt(e.effectId?.match(/E(\d+)/)?.[1] ?? "0") - 1;
    // effectId の index（E1 = 0, E2 = 1, ...）に対応するブロック（出/常効果でずれる可能性あり）
    for (const block of blocks) {
      const colonIdx = block.indexOf("：");
      if (colonIdx < 0) continue;
      const costPart = block.slice(block.indexOf("】") + 1, colonIdx);
      if (handDiscardRe.test(costPart)) {
        issues.push({ cardNum, effectId: e.effectId, type: "handDiscard", costPart });
        break;
      }
      if (trashExileRe.test(costPart)) {
        issues.push({ cardNum, effectId: e.effectId, type: "trashExile", costPart });
        break;
      }
    }
  }
}

console.log(`\n=== cost=undefined かつ handDiscard/trashExile パターンあり: ${issues.length}件 ===`);
for (const { cardNum, effectId, type, costPart } of issues) {
  console.log(`[${type}] ${effectId}: "${costPart}"`);
}
