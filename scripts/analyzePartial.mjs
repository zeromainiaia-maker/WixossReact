import { readFileSync } from 'fs';

const data = JSON.parse(readFileSync('public/data/effects.json', 'utf8'));

function findUnknown(node, results = []) {
  if (!node || typeof node !== 'object') return results;
  if (node.type === 'UNKNOWN') results.push(node.raw);
  if (Array.isArray(node.steps)) node.steps.forEach(s => findUnknown(s, results));
  if (node.then) findUnknown(node.then, results);
  if (node.else) findUnknown(node.else, results);
  if (node.action) findUnknown(node.action, results);
  if (Array.isArray(node.actions)) node.actions.forEach(a => findUnknown(a, results));
  if (Array.isArray(node.effects)) node.effects.forEach(a => findUnknown(a, results));
  if (Array.isArray(node.options)) node.options.forEach(o => { if (o.action) findUnknown(o.action, results); });
  if (node.left) findUnknown(node.left, results);
  if (node.right) findUnknown(node.right, results);
  return results;
}

function hasStub(node) {
  if (!node || typeof node !== 'object') return false;
  if (node.type === 'STUB') return true;
  if (Array.isArray(node.steps)) { for (const s of node.steps) { if (hasStub(s)) return true; } }
  if (node.then && hasStub(node.then)) return true;
  if (node.else && hasStub(node.else)) return true;
  if (node.action && hasStub(node.action)) return true;
  if (Array.isArray(node.actions)) { for (const a of node.actions) { if (hasStub(a)) return true; } }
  return false;
}

const unknowns = [];
let partialNoUnknown = [];

for (const [cardNum, effects] of Object.entries(data)) {
  for (const e of effects) {
    if (e.parseStatus === 'PARTIAL') {
      const u = findUnknown(e);
      unknowns.push(...u);
      if (u.length === 0) {
        partialNoUnknown.push({ cardNum, effectId: e.effectId, hasStub: hasStub(e), effect: e });
      }
    }
  }
}

console.log('=== PARTIAL effects without UNKNOWN nodes ===');
for (const { cardNum, effectId, hasStub: hs, effect } of partialNoUnknown.slice(0, 20)) {
  console.log(`${cardNum} ${effectId} hasStub:${hs}`);
  // Show the action type
  if (effect.action) {
    const a = effect.action;
    console.log('  action:', JSON.stringify(a).substring(0, 200));
  }
}
console.log(`\nTotal no-UNKNOWN PARTIAL: ${partialNoUnknown.length}`);

const counts = new Map();
for (const u of unknowns) counts.set(u, (counts.get(u) || 0) + 1);
const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
console.log('\n=== Top UNKNOWN patterns in PARTIAL effects ===');
sorted.slice(0, 40).forEach(([k, v]) => console.log(v, k));
console.log('\nTotal PARTIAL UNKNOWN instances:', unknowns.length);
