// REVEAL_AND_PICK の不正キー pickTo:'hand'（型に無い＝then欠落で resume SEARCH がクラッシュ）を
// 正規の then: REVEAL+ADD_TO_HAND に置換（WX24-P1-020 / WX25-P1-037 / WX25-P3-040・続き20）
import fs from 'fs';
const p = 'public/data/effects_WX24_26.json';
const j = JSON.parse(fs.readFileSync(p, 'utf8'));
let n = 0;
const walk = (o) => {
  if (Array.isArray(o)) return o.forEach(walk);
  if (!o || typeof o !== 'object') return;
  if (o.type === 'REVEAL_AND_PICK' && o.pickTo === 'hand' && !o.then) {
    delete o.pickTo;
    o.then = { type: 'SEQUENCE', steps: [{ type: 'REVEAL' }, { type: 'ADD_TO_HAND', owner: 'self' }] };
    n++;
  }
  for (const v of Object.values(o)) walk(v);
};
for (const id of ['WX24-P1-020', 'WX25-P1-037', 'WX25-P3-040']) walk(j[id]);
fs.writeFileSync(p, JSON.stringify(j));
console.log('fixed', n);
