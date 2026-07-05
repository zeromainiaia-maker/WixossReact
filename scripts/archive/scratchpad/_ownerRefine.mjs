// owner取り違え系統の安全な切り分け
// - 距離を近づけた対象マッチ：TRASH DECK_CARD owner:self の effect が「対戦相手のデッキ…トラッシュ」原文を持つか
// - 同一カードに「自分のデッキ…トラッシュ/切り札」自ミル文も併存するか（要精査）を分類
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import Papa from 'papaparse';

const root = process.cwd();
const effFiles = ['effects_WX.json', 'effects_WXDi.json', 'effects_WX24_26.json', 'effects_WXK.json', 'effects_misc.json'];
const effectsMap = new Map();
for (const f of effFiles) for (const [k, v] of Object.entries(JSON.parse(readFileSync(join(root, 'public/data', f), 'utf8')))) effectsMap.set(k, v);
const cards = new Map();
for (const f of [...Array.from({ length: 11 }, (_, i) => `CardData_Sheet${i + 1}.csv`), 'CardData_TK.csv']) {
  const p = join(root, 'public/data', f);
  if (!existsSync(p)) continue;
  for (const r of Papa.parse(readFileSync(p, 'utf8'), { header: true }).data) if (r.CardNum) cards.set(r.CardNum, r);
}
function* walk(o, path = '') {
  if (!o || typeof o !== 'object') return;
  yield [o, path];
  for (const [k, v] of Object.entries(o)) if (v && typeof v === 'object') yield* walk(v, `${path}.${k}`);
}

const oppTrash = /対戦相手のデッキの上から(?:カード)?を?[０-９\d]*枚?(?:.{0,12})?トラッシュに置/;
const selfTrash = /(?:あなた|自分)のデッキの上から(?:カード)?を?[０-９\d]*枚?(?:.{0,12})?トラッシュに置/;

const cleanCards = new Set();   // opp文あり・自ミル文なし → 一括是正候補
const mixedCards = new Set();   // 両方あり → 要精査
let nodes = 0;
for (const [num, effs] of effectsMap) {
  const c = cards.get(num);
  const text = (c?.EffectText ?? '') + (c?.BurstText ?? '');
  if (!oppTrash.test(text)) continue;
  let has = false;
  for (const eff of effs) for (const [node] of walk(eff)) {
    if (node.type === 'TRASH' && node.target?.type === 'DECK_CARD' && node.target?.owner === 'self') { has = true; nodes++; }
  }
  if (!has) continue;
  if (selfTrash.test(text)) mixedCards.add(num); else cleanCards.add(num);
}
console.log(`node数(owner:self DECK_CARD, 対象カード内)=${nodes}`);
console.log(`\n=== クリーン（opp文のみ・一括是正候補）: ${cleanCards.size}枚 ===`);
console.log([...cleanCards].join(' '));
console.log(`\n=== 混在（自ミル文も併存・要精査・ノード単位で判別要）: ${mixedCards.size}枚 ===`);
console.log([...mixedCards].join(' '));
