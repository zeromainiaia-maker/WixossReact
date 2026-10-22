// カードの知識帳（`src/data/cardKnowledge.json`）を人が読む文書（`docs/CARD_KNOWLEDGE.md`）にする（2026-10-22 ユーザー要望）。
//   node scripts/genCardKnowledgeMd.mjs
// ⚠文書は生成物＝手で直さない。直すのは JSON の方。
import { readFileSync, writeFileSync } from 'fs';
import Papa from 'papaparse';
import { packCsvPaths, readCsvText, packOf } from './cardDataFiles.mjs';

const know = JSON.parse(readFileSync('src/data/cardKnowledge.json', 'utf8'));
const cards = [];
for (const p of packCsvPaths()) for (const r of Papa.parse(readCsvText(p), { header: true, skipEmptyLines: true }).data) if (r.CardNum?.trim()) cards.push(r);
const done = cards.filter(c => know[c.CardNum]);
const WHEN = { own: '自分のターン', opp: '相手のターン', both: 'どちらのターンでも', '-': '' };
const f = (v) => (v && v !== '-' ? v : '');

const out = [];
out.push('# カードの知識帳', '');
out.push(`> 生成物（\`node scripts/genCardKnowledgeMd.mjs\`）。元データは \`src/data/cardKnowledge.json\`＝Claude がカードを1枚ずつ読んで書いた解説・使いどき・相性・評価値。`);
out.push(`> 進み具合：**${done.length} / ${cards.length} 枚**（パック順・再録とトークンは除く）。評価値はパワー換算（バニラのシグニは素のパワーが基準）。`, '');
let pack = '';
for (const c of done) {
  const k = know[c.CardNum];
  const pk = packOf(c.CardNum);
  if (pk !== pack) { pack = pk; out.push(`## ${pack}`, ''); }
  const spec = [f(c.Type), f(c.Color), c.Level && c.Level !== '-' ? `Lv${c.Level}` : '', f(c.Power) ? `P${c.Power}` : '', f(c.Limit) ? `リミット${c.Limit}` : '',
    f(c.Cost) ? `コスト${c.Cost}` : '', f(c.Restriction), c.Guard === '1' ? 'ガード' : '', c.LifeBurst === '1' ? 'LB' : ''].filter(Boolean).join('・');
  out.push(`### ${c.CardName}（${c.CardNum}）　評価 ${Number(k.v).toLocaleString()}`);
  out.push(`- ${spec}${f(c.CardClass) ? `／${c.CardClass}` : ''}`);
  out.push(`- **解説**：${k.s}`);
  const meta = [k.role?.length ? `役割：${k.role.join('・')}` : '', WHEN[k.when] ? `使いどき：${WHEN[k.when]}` : ''].filter(Boolean).join('　');
  if (meta) out.push(`- ${meta}`);
  if (!k.syn?.length && k.why) out.push(`- **メモ**：${k.why}`);
  else if (k.syn?.length) out.push(`- **相性**：${(k.syn ?? []).map(s => s.replace(/^name:/, '《').replace(/^(《.*)$/, '$1》').replace(/^class:/, '＜').replace(/^(＜.*)$/, '$1＞').replace(/^mech:/, '').replace(/^color:/, '色：').replace(/^team:/, 'チーム：')).join('、')}${k.why ? `${k.syn?.length ? ' ― ' : ''}${k.why}` : ''}`);
  if (k.lb) out.push(`- **ライフバースト**：${k.lb}`);
  out.push('');
}
writeFileSync('docs/CARD_KNOWLEDGE.md', out.join('\n'));
console.log(`docs/CARD_KNOWLEDGE.md ← ${done.length} / ${cards.length} 枚`);
