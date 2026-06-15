import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

const targetCards = [
  "WX15-001","WX15-002","WX15-003","WX15-004",
  "WX16-001","WX16-002","WX16-003",
  "WX17-001","WX17-002",
  "WX18-001","WX18-002",
  "WXEX1-02","WXEX1-03","WXEX1-04","WXEX1-05",
  "WXEX1-06","WXEX1-07","WXEX1-08","WXEX1-09",
  "WXEX1-10","WXEX1-24",
  "WXK01-001","WXK01-002","WXK02-001","WXK02-004",
  "WD17-001","WD18-001","WD19-001","WD20-001","WD21-001",
  "WDK01-001","WDK07-E01",
];

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

for (const cardNum of targetCards) {
  const effects = allEffects[cardNum];
  if (!effects) { console.log("MISSING: " + cardNum); continue; }
  const activated = effects.filter(e => e.effectType === "ACTIVATED");
  activated.forEach(e => {
    const coinOk = e.cost && e.cost.coin ? "coin=" + e.cost.coin : "NO_COIN";
    console.log(cardNum + " " + e.effectId + " " + coinOk + " cost=" + JSON.stringify(e.cost));
  });
}
