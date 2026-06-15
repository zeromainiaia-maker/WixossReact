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

const targets = ["WX02-029","WX02-032","WX02-038","WX09-042","WX09-044","WX11-003","WXK05-038"];
for (const c of targets) {
  const effects = allEffects[c] ?? [];
  const activated = effects.filter(e => e.effectType === "ACTIVATED");
  console.log(`${c}:`);
  for (const e of activated) {
    console.log(`  ${e.effectId}: cost=${JSON.stringify(e.cost)}`);
  }
}
