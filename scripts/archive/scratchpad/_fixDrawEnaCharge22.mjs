// 2026-07-03 「カードをN枚引き（、）【エナチャージM】をする」のドロー無言脱落 系統22枚を是正
// parser の【エナチャージ】ショートハンドが先頭ドロー節を飲み込んでいた（同時にparser修正済み）。
// curated 側：該当カードの ENERGY_CHARGE_FROM_DECK ノード（DRAWが同居しない最初の1つ）を
// SEQUENCE[DRAW n, ENERGY_CHARGE_FROM_DECK] に外科的置換。枚数は各カードの原文から取得。
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import Papa from 'papaparse';
const root = process.cwd();
const DRY = process.argv.includes('--dry');
const targets = 'WXK05-073 WDK12-008 WXDi-P02-009 WXDi-P02-043 WXDi-P03-009 WXDi-P03-079 WXDi-P04-007 WXDi-P05-006 WXDi-P05-007 WXDi-P07-071 WXDi-P08-040 WXDi-P12-047 WXDi-P13-007 WXDi-P13-052 WXDi-P16-002 WXDi-P16-009 WXDi-P16-010 WXDi-P16-011 WX24-P1-031 WX25-P3-003 WX25-P3-019 WX25-CP1-082'.split(' ');

// 原文からカードごとの (draw, charge) を取得
const toHW = s => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
const spec = new Map();
for (let i = 1; i <= 11; i++) {
  const p = join(root, `public/data/CardData_Sheet${i}.csv`);
  if (!existsSync(p)) continue;
  const { data } = Papa.parse(readFileSync(p, 'utf8').replace(/^﻿/, ''), { header: true, skipEmptyLines: true });
  for (const r of data) {
    if (!targets.includes(r.CardNum)) continue;
    const t = (r.EffectText ?? '') + (r.BurstText ?? '');
    const m = t.match(/カードを([０-９\d]+)枚引き、?【エナチャ[ー―‐−-]ジ([０-９\d]+)】/);
    if (m) spec.set(r.CardNum, { draw: parseInt(toHW(m[1])), charge: parseInt(toHW(m[2])) });
  }
}

// 効果ツリー内の「DRAWが直前にない ENERGY_CHARGE_FROM_DECK(count=charge)」を1つだけ SEQUENCE 化
function patchNode(container, key, chargeCount, drawCount) {
  const node = container[key];
  if (!node || typeof node !== 'object') return false;
  if (node.type === 'ENERGY_CHARGE_FROM_DECK' && node.count === chargeCount) {
    container[key] = { type: 'SEQUENCE', steps: [{ type: 'DRAW', owner: 'self', count: drawCount }, node] };
    return true;
  }
  if (node.type === 'SEQUENCE' && Array.isArray(node.steps)) {
    for (let i = 0; i < node.steps.length; i++) {
      const s = node.steps[i];
      if (s?.type === 'ENERGY_CHARGE_FROM_DECK' && s.count === chargeCount) {
        // 直前ステップが DRAW なら既に正しい
        if (node.steps[i - 1]?.type === 'DRAW') return false;
        node.steps.splice(i, 0, { type: 'DRAW', owner: 'self', count: drawCount });
        return true;
      }
      if (patchNode(node.steps, i, chargeCount, drawCount)) return true;
    }
    return false;
  }
  // CONDITIONAL then/else・CHOOSE choices 等の入れ子
  for (const k of ['then', 'else', 'action']) {
    if (node[k] && patchNode(node, k, chargeCount, drawCount)) return true;
  }
  if (Array.isArray(node.choices)) {
    for (const c of node.choices) if (c.action && patchNode(c, 'action', chargeCount, drawCount)) return true;
  }
  return false;
}

const files = ['effects_WX.json', 'effects_WXDi.json', 'effects_WX24_26.json', 'effects_WXK.json', 'effects_misc.json'];
const done = [];
for (const f of files) {
  const p = join(root, 'public/data', f);
  const raw = readFileSync(p, 'utf8');
  const eol = (raw.match(/(\r?\n)$/) || [, ''])[1];
  const body = eol ? raw.slice(0, -eol.length) : raw;
  const data = JSON.parse(body);
  if (JSON.stringify(data) !== body) { console.error(`⚠ ${f} 往復不安定 中断`); process.exit(1); }
  let changed = false;
  for (const [id, effs] of Object.entries(data)) {
    if (!targets.includes(id) || !spec.has(id)) continue;
    const { draw, charge } = spec.get(id);
    for (const e of effs) {
      if (patchNode(e, 'action', charge, draw)) { done.push(`${e.effectId}(draw${draw})`); changed = true; break; }
    }
  }
  if (changed && !DRY) writeFileSync(p, JSON.stringify(data) + eol, 'utf8');
  console.log(`${f}: ${changed ? '更新' : '-'}`);
}
console.log(`適用 ${done.length}/${targets.length}:`);
console.log(done.join(' '));
const doneCards = new Set(done.map(d => d.replace(/-(E\d+|BURST|LAYER)\(.*/, '')));
const miss = targets.filter(t => ![...doneCards].some(c => c === t));
if (miss.length) console.log('⚠未適用:', miss.join(' '));
console.log(DRY ? '[DRY]' : '[書込完了]');
