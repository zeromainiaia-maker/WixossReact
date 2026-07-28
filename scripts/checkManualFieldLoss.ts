import fs from 'node:fs';
import path from 'node:path';
import { MANUAL_EFFECTS } from '../src/data/manualEffects';

const dataDir = path.join(process.cwd(), 'public', 'data');
const effectFiles = [
  'effects_WX.json',
  'effects_WXDi.json',
  'effects_WX24_26.json',
  'effects_WXK.json',
  'effects_misc.json',
];

const parsedByCard = new Map<string, Record<string, unknown>[]>();
for (const file of effectFiles) {
  const parsed = JSON.parse(fs.readFileSync(path.join(dataDir, file), 'utf8')) as
    Record<string, Record<string, unknown>[]>;
  for (const [cardNum, effects] of Object.entries(parsed)) parsedByCard.set(cardNum, effects);
}

const losses: { cardNum: string; effectId: string; fields: string[] }[] = [];
for (const [cardNum, manualEffects] of Object.entries(MANUAL_EFFECTS)) {
  const parsedEffects = parsedByCard.get(cardNum);
  if (!parsedEffects) continue;
  for (const manual of manualEffects as unknown as Record<string, unknown>[]) {
    const effectId = String(manual.effectId);
    const parsed = parsedEffects.find(effect => effect.effectId === effectId);
    if (!parsed) continue;
    const fields = Object.keys(parsed).filter(field => !(field in manual));
    if (fields.length > 0) losses.push({ cardNum, effectId, fields });
  }
}

if (losses.length > 0) {
  console.error(`manual field loss: ${losses.length} effect(s)`);
  for (const loss of losses) {
    console.error(`  ${loss.cardNum} / ${loss.effectId}: ${loss.fields.join(', ')}`);
  }
  process.exit(1);
}

console.log('manual field loss: 0 effects');
