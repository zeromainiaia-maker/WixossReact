// S-2（母集団の grep 実測）用の共通ローダ。使い捨て（tmp_*・gitignore 圏内）。
// 使い方:
//   import { SRC, LIVE, scan, jsonOf, srcOf } from './tmp_s2_lib.mjs';
//   scan(/ダウン状態で場に出/, (json, id) => hasKey(json, 'asDown'));
import fs from 'fs';

/** effectId -> 効果単位の原文（10,768件） */
export const SRC = JSON.parse(fs.readFileSync('docs/_effect_srctext.json', 'utf8'));

/** effectId -> live の効果 JSON（public/data/effects_*.json をカード単位で束ねたもの） */
export const LIVE = {};
/** cardNum -> 効果配列 */
export const LIVE_BY_CARD = {};
for (const f of fs.readdirSync('public/data').filter((x) => /^effects_.*\.json$/.test(x))) {
  const j = JSON.parse(fs.readFileSync('public/data/' + f, 'utf8'));
  for (const [cardNum, effs] of Object.entries(j)) {
    LIVE_BY_CARD[cardNum] = effs;
    for (const e of effs) if (e && e.effectId) LIVE[e.effectId] = e;
  }
}

export const srcOf = (id) => SRC[id] || '';
export const jsonOf = (id) => LIVE[id];
export const cardOf = (id) => String(id).replace(/-(E\d+.*|BURST.*|TRAP.*|CB.*|RIDE.*|UG.*|G)$/, '');

/** JSON のどこかにキー name が在るか（構造キーだけを辿る＝総当たり再帰は使わない） */
const STRUCT_KEYS = ['steps', 'then', 'else', 'choices', 'abilities', 'action', 'continuation', 'thenAction', 'afterSearch', 'target', 'filter', 'cost', 'effects', 'options', 'remainder', 'destination', 'optionalCostTarget', 'activeCondition', 'condition'];
export function walkNodes(node, fn, depth = 0) {
  if (!node || typeof node !== 'object' || depth > 40) return;
  if (Array.isArray(node)) { for (const n of node) walkNodes(n, fn, depth + 1); return; }
  fn(node);
  for (const k of Object.keys(node)) {
    if (!STRUCT_KEYS.includes(k)) continue;
    walkNodes(node[k], fn, depth + 1);
  }
}
export function hasKey(json, key, val) {
  let found = false;
  walkNodes(json, (n) => {
    if (!(key in n)) return;
    if (val === undefined || n[key] === val) found = true;
  });
  return found;
}
export function hasType(json, ...types) {
  let found = false;
  walkNodes(json, (n) => { if (types.includes(n.type)) found = true; });
  return found;
}
/** JSON 全文（構造を無視した素の文字列化）に部分文字列が在るか＝取りこぼし防止の粗い網 */
export const raw = (json) => JSON.stringify(json ?? null);

/**
 * 原文 regex に当たる「効果」を全数で拾い、受け皿 predicate で HIT / MISS に割る。
 * @param {RegExp} re 原文（効果単位）に当てる正規表現
 * @param {(json:object|undefined, id:string, src:string)=>boolean} ok 受け皿が在る＝true（HIT＝直っている）
 */
export function scan(re, ok) {
  const hit = [], miss = [], nojson = [];
  for (const [id, src] of Object.entries(SRC)) {
    if (!re.test(src)) continue;
    const j = LIVE[id];
    if (!j) { nojson.push(id); continue; }
    (ok(j, id, src) ? hit : miss).push(id);
  }
  return { total: hit.length + miss.length + nojson.length, hit, miss, nojson };
}

export function report(label, re, r, { show = 100 } = {}) {
  console.log(`\n=== ${label} ===`);
  console.log(`regex: ${re}`);
  console.log(`候補(効果単位): ${r.total} / HIT(受け皿あり): ${r.hit.length} / MISS(受け皿なし=母集団上限): ${r.miss.length} / live JSON 無し: ${r.nojson.length}`);
  for (const id of r.miss.slice(0, show)) {
    const j = LIVE[id];
    console.log(`--- MISS ${id} [${j?.parseStatus ?? '?'}]`);
    console.log(`  原文: ${srcOf(id).replace(/\s+/g, ' ').slice(0, 260)}`);
    console.log(`  JSON: ${raw(j).slice(0, 420)}`);
  }
  if (r.nojson.length) console.log(`  (live JSON 無し: ${r.nojson.slice(0, 20).join(', ')})`);
}
