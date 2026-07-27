/**
 * 続き270: costText だけで実コストが欠落していた追加エクシード13効果へ、
 * effectId アンカーで exceed を外科反映する。
 * npm run build:effects は使わない。
 */
import fs from 'node:fs';
import path from 'node:path';

const targets = new Map([
  ['WXDi-P03-005-E1', 4],
  ['WXDi-P03-054-E1', 4],
  ['WXDi-P11-070-E1', 7],
  ['WXDi-P11-076-E1', 7],
  ['WXDi-P11-083-E1', 7],
  ['WXDi-CP01-001-E1', 4],
  ['WXDi-CP01-003-E1', 4],
  ['WX25-P3-001-E1', 3],
  ['WX25-P3-003-E1', 3],
  ['WX25-P3-005-E1', 3],
  ['WX25-P3-007-E1', 3],
  ['WX25-P3-009-E1', 3],
  ['PR-Di013-E1', 4],
]);
const handDiscardTargets = new Map([
  // 原文「手札を2枚捨てる」。costTextだけでは0枚支払いになるため代表修正。
  ['WXDi-CP02-056-E1', { count: 2 }],
]);

const files = [
  'effects_WXDi.json',
  'effects_WX24_26.json',
  'effects_misc.json',
];

function optionalCostStubs(value, found = []) {
  if (!value || typeof value !== 'object') return found;
  if (value.type === 'STUB' && value.id === 'OPTIONAL_COST') found.push(value);
  for (const child of Object.values(value)) optionalCostStubs(child, found);
  return found;
}

let changed = 0;
for (const file of files) {
  const filePath = path.join(process.cwd(), 'public', 'data', file);
  const json = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  let dirty = false;
  for (const effects of Object.values(json)) {
    for (const effect of effects) {
      const exceed = targets.get(effect.effectId);
      const handDiscard = handDiscardTargets.get(effect.effectId);
      if (exceed === undefined && handDiscard === undefined) continue;
      const stubs = optionalCostStubs(effect.action);
      if (stubs.length !== 1) {
        throw new Error(`${effect.effectId}: expected exactly one OPTIONAL_COST, got ${stubs.length}`);
      }
      const stub = stubs[0];
      if (exceed !== undefined && stub.exceed !== undefined && stub.exceed !== exceed) {
        throw new Error(`${effect.effectId}: existing exceed ${stub.exceed} != expected ${exceed}`);
      }
      if (exceed !== undefined && stub.exceed === undefined) {
        stub.exceed = exceed;
        changed++;
        dirty = true;
      }
      if (handDiscard !== undefined && stub.handDiscard === undefined) {
        stub.handDiscard = handDiscard;
        changed++;
        dirty = true;
      }
      targets.delete(effect.effectId);
      handDiscardTargets.delete(effect.effectId);
    }
  }
  if (dirty) fs.writeFileSync(filePath, JSON.stringify(json), 'utf8');
}

if (targets.size) throw new Error(`unresolved effectId anchors: ${[...targets.keys()].join(', ')}`);
if (handDiscardTargets.size) throw new Error(`unresolved hand-discard anchors: ${[...handDiscardTargets.keys()].join(', ')}`);
// Fresh続き269 treeでは14。13件適用後に代表修正だけ追走する場合は1。
if (changed !== 14 && changed !== 1) throw new Error(`expected 14 (or incremental 1) changed fields, got ${changed}`);
console.log(`patched ${changed} OPTIONAL_COST fields by effectId anchor`);
