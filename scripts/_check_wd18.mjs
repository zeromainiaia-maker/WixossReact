import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

const data = JSON.parse(readFileSync(join(root, "public/data/effects_misc.json"), "utf-8"));
const effects = data["WD18-001"] ?? [];
console.log("WD18-001 effects:");
effects.forEach(e => console.log(JSON.stringify(e, null, 2)));
