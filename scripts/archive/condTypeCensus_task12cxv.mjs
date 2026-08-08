// 使い捨て計器：live JSON の activeCondition / condition に「評価器が知らない type」が
// 混ざっていないかを機械検出する。checkActiveCondition は未知 type で `return true` に
// フォールスルーするため、間違った type を書くと**無条件成立＝過剰実行**になり全ゲート緑のまま素通りする。
import fs from 'fs';

const src = fs.readFileSync('src/engine/effectEngine.ts', 'utf8').split(/\r?\n/);
// checkActiveCondition の switch（54行目〜 `case 'AND':` の直後まで）の4スペース case を集める
function casesInRange(lines, from, to) {
  const out = new Set();
  for (let i = from; i <= to && i < lines.length; i++) {
    const m = lines[i].match(/^    case '([A-Za-z0-9_]+)':/);
    if (m) out.add(m[1]);
  }
  return out;
}
const acStart = src.findIndex(l => l.startsWith('export function checkActiveCondition'));
const acEnd = src.findIndex((l, i) => i > acStart && /^    case 'AND':/.test(l));
const acHandled = casesInRange(src, acStart, acEnd + 2);

// 型定義側の union
const types = fs.readFileSync('src/types/effects.ts', 'utf8');
function unionTypes(name) {
  const i = types.indexOf(`export type ${name} =`);
  const j = types.indexOf('\nexport ', i + 10);
  const body = types.slice(i, j < 0 ? undefined : j);
  return new Set([...body.matchAll(/\{ type: '([A-Za-z0-9_]+)'/g)].map(m => m[1]));
}
const acUnion = unionTypes('ActiveCondition');
const cUnion = unionTypes('Condition');

console.log('checkActiveCondition が扱う type:', acHandled.size);
console.log('ActiveCondition union:', acUnion.size);
console.log('■ union にあるが engine 未実装（＝JSON に書いても無条件 true）:',
  [...acUnion].filter(t => !acHandled.has(t)).join(', ') || 'なし');

// live JSON 走査
const files = ['effects_WX', 'effects_WX24_26', 'effects_WXDi', 'effects_WXK', 'effects_misc'];
const all = {};
for (const f of files) Object.assign(all, JSON.parse(fs.readFileSync(`public/data/${f}.json`, 'utf8')));

const badAC = [];   // activeCondition に未実装 type
const acNotInUnion = []; // 型定義にすら無い type
const acTypeCount = new Map();
function walkAC(node, path, card, eff) {
  if (!node || typeof node !== 'object') return;
  if (typeof node.type === 'string') {
    acTypeCount.set(node.type, (acTypeCount.get(node.type) ?? 0) + 1);
    if (!acUnion.has(node.type)) acNotInUnion.push({ card, eff, path, t: node.type, inCondUnion: cUnion.has(node.type) });
    else if (!acHandled.has(node.type)) badAC.push({ card, eff, path, t: node.type });
  }
  for (const k of ['conditions']) if (Array.isArray(node[k])) node[k].forEach((c, i) => walkAC(c, `${path}.${k}[${i}]`, card, eff));
}
// activeCondition はネスト（action 内の GRANT 系や CONDITIONAL）にも現れうるので全走査
function deepScan(node, card, eff, path) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) { node.forEach((v, i) => deepScan(v, card, eff, `${path}[${i}]`)); return; }
  for (const [k, v] of Object.entries(node)) {
    if (k === 'activeCondition' && v && typeof v === 'object') walkAC(v, `${path}.${k}`, card, eff);
    else deepScan(v, card, eff, `${path}.${k}`);
  }
}
for (const [card, effs] of Object.entries(all)) {
  for (const e of effs) deepScan(e, card, e.effectId, '');
}

console.log('\n■ activeCondition に「型定義に無い type」（＝Condition 型の流用など）:', acNotInUnion.length);
for (const b of acNotInUnion) console.log(`   ${b.card} ${b.eff} ${b.path} type=${b.t}${b.inCondUnion ? '  ← Condition 型の流用' : ''}`);
console.log('\n■ activeCondition に「union にはあるが engine 未実装の type」:', badAC.length);
for (const b of badAC) console.log(`   ${b.card} ${b.eff} ${b.path} type=${b.t}`);

// ---- 逆方向：condition スロットに Condition 型に無い type（＝ActiveCondition の流用）----
const eu = fs.readFileSync('src/engine/execUtils.ts', 'utf8').split(/\r?\n/);
const ecStart = eu.findIndex(l => l.startsWith('export function evalCondition('));
const ecEnd = eu.findIndex((l, i) => i > ecStart && /_condExhaustive/.test(l));
const ecHandled = casesInRange(eu, ecStart, ecEnd);
const cfcStart = src.findIndex(l => l.startsWith('function evalConditionForContinuous('));
const cfcEnd = src.findIndex((l, i) => i > cfcStart && /^    default:/.test(l));
const cfcHandled = casesInRange(src, cfcStart, cfcEnd);
console.log('\nevalCondition が扱う type:', ecHandled.size, '/ evalConditionForContinuous:', cfcHandled.size,
  '/ Condition union:', cUnion.size);
console.log('■ union にあるが evalCondition 未実装:',
  [...cUnion].filter(t => !ecHandled.has(t)).join(', ') || 'なし');

const cNotInUnion = [];
const cNotHandled = [];
function walkC(node, path, card, eff) {
  if (!node || typeof node !== 'object') return;
  if (typeof node.type === 'string') {
    if (!cUnion.has(node.type)) cNotInUnion.push({ card, eff, path, t: node.type, inAC: acUnion.has(node.type) });
    else if (!ecHandled.has(node.type)) cNotHandled.push({ card, eff, path, t: node.type });
  }
  if (Array.isArray(node.conditions)) node.conditions.forEach((c, i) => walkC(c, `${path}.conditions[${i}]`, card, eff));
}
function deepScanC(node, card, eff, path) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) { node.forEach((v, i) => deepScanC(v, card, eff, `${path}[${i}]`)); return; }
  for (const [k, v] of Object.entries(node)) {
    if (k === 'activeCondition') continue;
    if (k === 'condition' && v && typeof v === 'object') walkC(v, `${path}.${k}`, card, eff);
    else deepScanC(v, card, eff, `${path}.${k}`);
  }
}
for (const [card, effs] of Object.entries(all)) for (const e of effs) deepScanC(e, card, e.effectId, '');
console.log('\n■ condition に「Condition 型定義に無い type」:', cNotInUnion.length);
for (const b of cNotInUnion) console.log(`   ${b.card} ${b.eff} ${b.path} type=${b.t}${b.inAC ? '  ← ActiveCondition 型の流用' : ''}`);
console.log('■ condition に「union にはあるが evalCondition 未実装の type」:', cNotHandled.length);
for (const b of cNotHandled) console.log(`   ${b.card} ${b.eff} ${b.path} type=${b.t}`);

// ---- CONTINUOUS 効果の中の CONDITIONAL.condition は evalConditionForContinuous（19型のみ）で評価される ----
const contBad = [];
function scanCont(node, card, eff, path) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) { node.forEach((v, i) => scanCont(v, card, eff, `${path}[${i}]`)); return; }
  if (node.type === 'CONDITIONAL' && node.condition?.type) {
    const t = node.condition.type;
    const acc = t === 'AND' || t === 'OR';
    if (!acc && !cfcHandled.has(t)) contBad.push({ card, eff, path, t });
  }
  for (const [k, v] of Object.entries(node)) scanCont(v, card, eff, `${path}.${k}`);
}
// ⚠`evalConditionForContinuous` が呼ばれるのは calcFieldPowers の **action 直下が CONDITIONAL** のときだけ
//   （`effect.action.type === 'CONDITIONAL'`）。入れ子の CONDITIONAL は通常の executor（ExecCtx つき
//   `evalCondition`）が評価するので、この計器の対象は action 直下に限る。
for (const [card, effs] of Object.entries(all)) {
  for (const e of effs) if (e.effectType === 'CONTINUOUS' && e.action?.type === 'CONDITIONAL') scanCont(e.action, card, e.effectId, 'action');
}
console.log('\n■ CONTINUOUS 内 CONDITIONAL の condition が evalConditionForContinuous 未対応（＝permissive true）:', contBad.length);
const contAgg = new Map();
for (const b of contBad) contAgg.set(b.t, (contAgg.get(b.t) ?? 0) + 1);
for (const [t, n] of [...contAgg].sort((a, b) => b[1] - a[1])) console.log(`   ${t}: ${n}件  例=${contBad.find(b => b.t === t).card}`);
