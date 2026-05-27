import { readFileSync } from 'fs';

const data = JSON.parse(readFileSync('public/data/effects.json', 'utf8'));
const unknowns = [];

function findUnknown(node) {
  if (!node || typeof node !== 'object') return;
  if (node.type === 'UNKNOWN') unknowns.push(node.raw);
  if (Array.isArray(node.steps)) node.steps.forEach(findUnknown);
  if (node.then) findUnknown(node.then);
  if (node.else) findUnknown(node.else);
  if (Array.isArray(node.actions)) node.actions.forEach(findUnknown);
  if (Array.isArray(node.effects)) node.effects.forEach(findUnknown);
  if (Array.isArray(node.options)) node.options.forEach(o => { if(o.action) findUnknown(o.action); });
}

for (const effects of Object.values(data)) {
  for (const e of effects) {
    if (e.parseStatus === 'PARTIAL') {
      for (const a of (e.actions || [])) findUnknown(a);
    }
  }
}

const counts = new Map();
for (const u of unknowns) counts.set(u, (counts.get(u) || 0) + 1);
const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
sorted.slice(0, 40).forEach(([k, v]) => console.log(v, k));
console.log('\nTotal PARTIAL UNKNOWN instances:', unknowns.length);
console.log('Unique patterns:', counts.size);
