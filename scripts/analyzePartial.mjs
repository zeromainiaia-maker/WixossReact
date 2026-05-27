import { readFileSync } from 'fs';

const data = JSON.parse(readFileSync('public/data/effects.json', 'utf8'));
const unknowns = [];

function findUnknown(node) {
  if (!node || typeof node !== 'object') return;
  if (node.type === 'UNKNOWN') unknowns.push(node.raw);
  if (Array.isArray(node.steps)) node.steps.forEach(findUnknown);
  if (node.then) findUnknown(node.then);
  if (node.else) findUnknown(node.else);
  // action (singular) and actions (plural)
  if (node.action) findUnknown(node.action);
  if (Array.isArray(node.actions)) node.actions.forEach(findUnknown);
  if (Array.isArray(node.effects)) node.effects.forEach(findUnknown);
  if (Array.isArray(node.options)) node.options.forEach(o => { if (o.action) findUnknown(o.action); });
  if (node.left) findUnknown(node.left);
  if (node.right) findUnknown(node.right);
}

let partialCount = 0;
let partialNoUnknown = 0;

for (const [cardNum, effects] of Object.entries(data)) {
  for (const e of effects) {
    if (e.parseStatus === 'PARTIAL') {
      partialCount++;
      const before = unknowns.length;
      findUnknown(e);
      if (unknowns.length === before) {
        partialNoUnknown++;
        // console.log('PARTIAL with no UNKNOWN:', cardNum, e.effectId);
      }
    }
  }
}

const counts = new Map();
for (const u of unknowns) counts.set(u, (counts.get(u) || 0) + 1);
const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
console.log('=== Top UNKNOWN patterns in PARTIAL effects ===');
sorted.slice(0, 40).forEach(([k, v]) => console.log(v, k));
console.log('\nTotal PARTIAL effects:', partialCount);
console.log('PARTIAL with no UNKNOWN nodes:', partialNoUnknown);
console.log('Total PARTIAL UNKNOWN instances:', unknowns.length);
console.log('Unique patterns:', counts.size);
