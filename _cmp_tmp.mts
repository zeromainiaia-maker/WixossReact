import { MANUAL_EFFECTS } from './src/data/manualEffects.ts';
import fs from 'fs';
const wx = JSON.parse(fs.readFileSync('./public/data/effects_WX.json','utf-8'));
const wxk = JSON.parse(fs.readFileSync('./public/data/effects_WXK.json','utf-8'));
const cases: [string, unknown][] = [
  ['WX17-Re14', wx['WX17-Re14']],
  ['WX20-020', wx['WX20-020']],
  ['WX21-035', wx['WX21-035']],
  ['WXK02-029', wxk['WXK02-029']],
];
for (const [c, jsonVal] of cases) {
  const man = MANUAL_EFFECTS[c];
  const same = JSON.stringify(man) === JSON.stringify(jsonVal);
  console.log(c, 'JSON==manualEffects:', same);
  if (!same) console.log('  manual:', JSON.stringify(man), '\n  json  :', JSON.stringify(jsonVal));
}
