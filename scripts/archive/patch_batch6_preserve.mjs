// Applied one-off for ROADMAP batch6 PRESERVE effects.
// These cards intentionally bypass held adoption; keep JSON key order intact.
import { readFileSync, writeFileSync } from 'node:fs';

const path = new URL('../../public/data/effects_WX24_26.json', import.meta.url);
const data = JSON.parse(readFileSync(path, 'utf8'));
const effect = data['WX25-P3-084']?.find(e => e.effectId === 'WX25-P3-084-E1');
if (!effect) throw new Error('WX25-P3-084-E1 not found');
effect.action = { type: 'DRAW', owner: 'self', count: { $ref: 'last_processed_count' } };
writeFileSync(path, JSON.stringify(data), 'utf8');
console.log('patched WX25-P3-084-E1');
