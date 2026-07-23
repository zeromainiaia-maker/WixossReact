// ROADMAP batch11: build:effects が保護/held に残す curated カードへ、
// 原文照合済みの opponentSelects leaf だけを付与する再現用 one-off。
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const root = process.cwd();
const dataDir = join(root, 'public', 'data');
const files = ['effects_WX.json', 'effects_WXDi.json', 'effects_WX24_26.json', 'effects_WXK.json', 'effects_misc.json'];
const targets = new Set([
  'WX25-P3-032-E1',
  'WXDi-P05-058-E1',
  'WXDi-P10-036-E1',
  'WXDi-P14-002-E1',
]);
const found = new Map([...targets].map(id => [id, 0]));

function visit(node, effectId) {
  if (!node || typeof node !== 'object') return;
  const target = node.target ?? node.source;
  if (node.type === 'TRASH' && target?.owner === 'opponent' && target.type !== 'HAND_CARD') {
    node.opponentSelects = true;
    found.set(effectId, found.get(effectId) + 1);
  }
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) value.forEach(v => visit(v, effectId));
    else visit(value, effectId);
  }
}

for (const file of files) {
  const path = join(dataDir, file);
  const json = JSON.parse(readFileSync(path, 'utf8'));
  let changed = false;
  for (const effects of Object.values(json)) {
    for (const effect of effects) {
      if (!targets.has(effect.effectId)) continue;
      visit(effect.action, effect.effectId);
      changed = true;
    }
  }
  if (changed) writeFileSync(path, JSON.stringify(json), 'utf8');
}

const bad = [...found].filter(([, count]) => count !== 1);
if (bad.length) throw new Error(`対象 leaf 数が不正: ${bad.map(([id, n]) => `${id}=${n}`).join(', ')}`);
console.log(`batch11 preserve leaf patch: ${[...found].map(([id, n]) => `${id}:${n}`).join(' / ')}`);
