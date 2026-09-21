/** tmp: 下書きの作戦データを「書き出したデッキ JSON」へ当てる（DB は触らない）。 */
import fs from 'fs';
const P = 'scratchpad-decks/decks_カルカドール.json';
const draft = {
  'WD01': { keyCards: ['WD01-009'], priorityCards: ['WD01-011'], combos: [{ first: 'WD01-011', then: 'WD01-009' }] },
  'WD02': { keyCards: ['WD02-009'], priorityCards: ['WD02-011', 'WD02-014'], combos: [] },
  'WD03': { keyCards: ['WD03-009'], priorityCards: ['WD03-011', 'WD03-014'], combos: [] },
  'WD04': { keyCards: ['WD04-009'], priorityCards: ['WD04-011', 'WD04-012'], combos: [{ first: 'WD04-010', then: 'WD04-011' }] },
  'WD05': { keyCards: ['WD05-009'], priorityCards: ['WD05-014'], combos: [{ first: 'WD05-014', then: 'WD05-011' }] },
  'WD06': { keyCards: ['WX19-Re10'], priorityCards: ['WD06-013', 'WX02-056'], combos: [] },
  'WD07': { keyCards: ['WD07-012'], priorityCards: ['WX19-Re04', 'WD07-010'], combos: [{ first: 'WX19-Re04', then: 'WD07-012' }] },
  'WD08': { keyCards: ['WX22-Re17'], priorityCards: ['WX03-047', 'WD08-015'], combos: [{ first: 'WX22-Re17', then: 'WX03-047' }] },
  'WD09': { keyCards: ['WD09-009'], priorityCards: ['WD09-011'], combos: [{ first: 'WD09-011', then: 'WD09-009' }] },
  'WD10': { keyCards: ['WD10-009'], priorityCards: ['WD10-011'], combos: [{ first: 'WD10-011', then: 'WD10-009' }, { first: 'WD10-013', then: 'WD10-015' }] },
  'WD11': { keyCards: ['WD11-009'], priorityCards: ['WX19-Re19'], combos: [{ first: 'WD11-008', then: 'WD11-009' }] },
  'WD12': { keyCards: ['WD12-009'], priorityCards: ['WD12-011'], combos: [{ first: 'WD12-009', then: 'WD12-010' }] },
  'WD13': { keyCards: ['WX02-021'], priorityCards: ['WD13-016', 'WX01-036'], combos: [{ first: 'WD13-016', then: 'WX02-021' }] },
  'WD14': { keyCards: ['WD14-012'], priorityCards: ['WX11-083', 'WD14-015'], combos: [{ first: 'WD14-015', then: 'WX11-083' }] },
  'WD15': { keyCards: ['WD15-015'], priorityCards: ['WD15-014', 'WD15-018'], combos: [{ first: 'WD15-015', then: 'WD15-014' }] },
  'WD16': { keyCards: ['WD16-016'], priorityCards: ['WD16-014', 'WX09-Re14'], combos: [] },
  '天使軸1': { keyCards: ['WX02-021'], priorityCards: ['WX03-037'], combos: [] },
  'ケトッシー軸': { keyCards: ['WX01-087'], priorityCards: ['WD04-011'], combos: [{ first: 'WD04-010', then: 'WD04-011' }] },
  'レベル2止め': { keyCards: [], priorityCards: ['WX01-067', 'WX01-070'], combos: [] },
  'SP06': { keyCards: ['WX04-079'], priorityCards: ['WX05-061', 'WX12-Re14'], combos: [] },
  'SP07': { keyCards: ['WX04-089'], priorityCards: ['WX05-068', 'SP07-011'], combos: [] },
};
const decks = JSON.parse(fs.readFileSync(P, 'utf8'));
let applied = 0, missing = [];
for (const d of decks) {
  const p = draft[d.name];
  if (!p || d.deck_kind !== 'cpu') continue;
  const inDeck = new Set([...(d.main_deck ?? []), ...(d.lrig_deck ?? [])].map(String));
  for (const n of [...p.keyCards, ...p.priorityCards, ...p.combos.flatMap(c => [c.first, c.then])]) {
    if (!inDeck.has(n)) missing.push(`${d.name}: ${n}`);
  }
  d.cpu_plan = p; applied++;
}
if (missing.length) { console.log('🔴 デッキに無いカード番号:'); missing.forEach(m => console.log('  ' + m)); process.exit(1); }
fs.writeFileSync(P, JSON.stringify(decks, null, 1), 'utf8');
console.log(`適用 ${applied} デッキ（デッキに無いカード番号 0）`);
