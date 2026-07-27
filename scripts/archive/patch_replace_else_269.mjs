/**
 * 続き269: effectId アンカーで置換else修正を curated JSON へ外科反映する。
 * npm run build:effects は使わず、manualEffects の正準定義から対象効果だけを置換する。
 */
import fs from 'node:fs';
import path from 'node:path';
import { mergeManualEffects } from '../../src/data/manualEffects.ts';

const targets = new Map([
  ['WX15-029', 'WX15-029-E1'],
  ['WXDi-D09-H29', 'WXDi-D09-H29-E1'],
  ['WXDi-D09-P25', 'WXDi-D09-P25-E1'],
  ['WXDi-P03-063', 'WXDi-P03-063-E1'],
  ['WXDi-P03-072', 'WXDi-P03-072-E1'],
  ['WXDi-P03-080', 'WXDi-P03-080-E1'],
  ['WXDi-P03-089', 'WXDi-P03-089-E1'],
  ['WXDi-P14-025', 'WXDi-P14-025-E1'],
  ['WXK06-027', 'WXK06-027-E1'],
]);
const files = [
  'effects_WX.json',
  'effects_WXDi.json',
  'effects_WX24_26.json',
  'effects_WXK.json',
  'effects_misc.json',
];

let changed = 0;
for (const file of files) {
  const filePath = path.join(process.cwd(), 'public', 'data', file);
  const json = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  let dirty = false;
  for (const [cardNum, effectId] of targets) {
    if (!json[cardNum]) continue;
    const index = json[cardNum].findIndex(effect => effect.effectId === effectId);
    if (index < 0) throw new Error(`${file}: effectId anchor not found: ${effectId}`);
    const replacement = mergeManualEffects(cardNum, []).find(effect => effect.effectId === effectId);
    if (!replacement) throw new Error(`manual replacement not found: ${effectId}`);
    if (JSON.stringify(json[cardNum][index]) !== JSON.stringify(replacement)) {
      json[cardNum][index] = replacement;
      changed++;
      dirty = true;
    }
    targets.delete(cardNum);
  }
  if (dirty) fs.writeFileSync(filePath, JSON.stringify(json), 'utf8');
}

if (targets.size) throw new Error(`unresolved anchors: ${[...targets.values()].join(', ')}`);
if (changed !== 9) throw new Error(`expected 9 changed effects, got ${changed}`);
console.log(`patched ${changed} effects by effectId anchor`);
