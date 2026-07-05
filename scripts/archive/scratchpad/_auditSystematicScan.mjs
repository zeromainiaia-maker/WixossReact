// 意味照合パイロットで見つかった系統バグ2種の全域スキャン
// ①「対戦相手のデッキの上から…トラッシュに置く」なのに TRASH DECK_CARD owner:'self'
// ②「このシグニは…効果を受けない」なのに GRANT_PROTECTION target.count:'ALL'（subjectFilter無し）
//   → count:'ALL' は保護コレクタの target.count===1 分岐に落ちず no-op になる
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
  for (const [k, v] of Object.entries(o)) {
    if (v && typeof v === 'object') yield* walk(v, `${path}.${k}`);
  }
}

// ① 相手デッキトラッシュの owner 取り違え
console.log('=== ① 「対戦相手のデッキの上から…トラッシュ」で owner:self ===');
let n1 = 0;
for (const [num, effs] of effectsMap) {
  const c = cards.get(num);
  const text = (c?.EffectText ?? '') + (c?.BurstText ?? '');
  if (!/対戦相手のデッキの上から(?:カード)?を?[０-９\d]*枚?(?:.{0,12})?トラッシュに置/.test(text)) continue;
  for (const eff of effs) {
    for (const [node] of walk(eff)) {
      if (node.type === 'TRASH' && node.target?.type === 'DECK_CARD' && node.target?.owner === 'self') {
        console.log(`${num}\t${eff.effectId}\t${c?.CardName}`);
        n1++;
      }
    }
  }
}
console.log(`計 ${n1}件\n`);

// ② GRANT_PROTECTION count:'ALL' + subjectFilter無し（このシグニ単体の原文）
console.log("=== ② GRANT_PROTECTION count:'ALL'・subjectFilter無し（保護コレクタでno-op疑い） ===");
let n2 = 0;
for (const [num, effs] of effectsMap) {
  const c = cards.get(num);
  for (const eff of effs) {
    for (const [node] of walk(eff)) {
      if (node.type === 'GRANT_PROTECTION' && node.target?.count === 'ALL' && !node.subjectFilter) {
        const thisOnly = /このシグニは[^。]{0,40}受けない/.test(c?.EffectText ?? '');
        console.log(`${num}\t${eff.effectId}\t原文このシグニ単体=${thisOnly ? 'YES' : 'no'}\t${c?.CardName}`);
        n2++;
      }
    }
  }
}
console.log(`計 ${n2}件`);
