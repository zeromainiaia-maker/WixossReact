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

const targetCards = [
  "WX15-001","WX15-002","WX15-003","WX15-004",
  "WX16-001","WX16-002","WX16-003",
  "WX17-001","WX17-002","WX18-001","WX18-002",
  "WXEX1-02","WXEX1-03","WXEX1-04","WXEX1-05","WXEX1-06","WXEX1-07","WXEX1-08","WXEX1-09",
  "WXEX1-10","WXEX1-11","WXEX1-12","WXEX1-13","WXEX1-14","WXEX1-15","WXEX1-16",
  "WXEX1-17","WXEX1-18","WXEX1-19","WXEX1-20","WXEX1-21","WXEX1-22","WXEX1-23","WXEX1-24",
  "WXEX2-05","WXEX2-06","WXEX2-09","WXEX2-10","WXEX2-15","WXEX2-18","WXEX2-19","WXEX2-20",
  "WXEX2-24","WXEX2-25","WXEX2-26","WXEX2-27",
  "WXK01-001","WXK01-002","WXK01-003","WXK01-004",
  "WXK02-001","WXK02-002","WXK02-003","WXK02-004",
  "WXK04-001","WXK04-002","WXK04-003","WXK04-004",
  "WXK09-006","WXK09-015",
  "WD17-001","WD18-001","WD19-001","WD20-001","WD21-001",
  "WD22-007-G","WD23-008-A",
  "WDK01-001","WDK03-001","WDK05-R01","WDK07-E01","WDK09-001","WDK10-001",
  "WDK12-001","WDK13-001","WDK14-001","WDK15-001","WDK17-001",
];

for (const cardNum of targetCards) {
  const effects = allEffects[cardNum];
  if (!effects) { console.log("MISSING_IN_JSON: " + cardNum); continue; }
  const activated = effects.filter(e => e.effectType === "ACTIVATED");
  for (const e of activated) {
    if (!e.cost) {
      console.log("NO_COST: " + cardNum + " " + e.effectId);
    }
  }
}

for (const c of ["WX15-002","WX16-002"]) {
  console.log("\n=== " + c + " ===");
  (allEffects[c] ?? []).forEach(e =>
    console.log("  " + e.effectId + " type=" + e.effectType + " cost=" + JSON.stringify(e.cost))
  );
}
