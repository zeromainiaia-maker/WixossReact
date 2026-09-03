// 母集団の実測ツール（PLAN §2.1 ②）— 原文の言い回し1つを効果単位で数え、逆翻訳まで並べる。
//
// 🔴**なぜ要るか**＝2026-09-04 の第71〜83巡で、索引 A の登録票が**6件連続で「実測 0」**だった。
//   原因は毎回同じ2つで、どちらも手作業の測り方に起因していた：
//   ① **カード全文で数えた**＝同じカードの**別の効果**の言い回しを数えて母集団が水増しされる
//      （`O-92` は 109 miss → 効果単位で測り直して 53 → 実害 1）。
//   ② **キー名1つで「配線済み」を判定した**＝同じ概念に**別の正準形**があると配線済みが miss に出る
//      （trap (h)。`O-193`/`O-198`/`O-192`/`O-190`/`O-70`/`O-188`/`O-69` の全部がこれ）。
//
// ⇒ このツールは②を**人間の目視**へ差し戻す＝「JSON にキーがあるか」ではなく
//   **逆翻訳を並べて読ませる**。逆翻訳が原文どおりなら、それはどの綴りであれ配線済み。
//
// 使い方:
//   node scripts/censusPopulation.mjs "<原文の正規表現>"            … 効果単位で列挙（逆翻訳つき）
//   node scripts/censusPopulation.mjs "<regex>" --json "<部分文字列>" … live JSON に含むかで OK/MISS に仕分け
//   node scripts/censusPopulation.mjs "<regex>" --full               … 原文を全文表示（既定は120字）
//
// ⚠**逆翻訳は `npm run regen` の出力（docs/decompile_sheet*.txt）を読む**＝
//   parser を直した直後は **regen を回してから**使う（古い逆翻訳で判断すると2度手間になる）。
import fs from 'fs';
import path from 'path';

const args = process.argv.slice(2);
if (args.length === 0 || args[0].startsWith('--')) {
  console.log('使い方: node scripts/censusPopulation.mjs "<原文の正規表現>" [--json "<部分文字列>"] [--full]');
  process.exit(0);
}
const re = new RegExp(args[0]);
const jsonIdx = args.indexOf('--json');
const jsonNeedle = jsonIdx >= 0 ? args[jsonIdx + 1] : null;
const full = args.includes('--full');

const root = process.cwd();
const srcMap = JSON.parse(fs.readFileSync(path.join(root, 'docs/_effect_srctext.json'), 'utf8'));

// live（効果単位）
const live = new Map();
const dataDir = path.join(root, 'public/data');
for (const f of fs.readdirSync(dataDir).filter(x => /^effects_.*\.json$/.test(x))) {
  const j = JSON.parse(fs.readFileSync(path.join(dataDir, f), 'utf8'));
  for (const [cardNum, effs] of Object.entries(j)) {
    for (const e of effs ?? []) live.set(e.effectId, { cardNum, e });
  }
}

// 逆翻訳（`npm run regen` が書いた decompile シートから effectId 行を拾う）
const ja = new Map();
const docsDir = path.join(root, 'docs');
for (const f of fs.readdirSync(docsDir).filter(x => /^decompile_sheet\d+\.txt$/.test(x))) {
  for (const line of fs.readFileSync(path.join(docsDir, f), 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s{2}([A-Za-z0-9-]+(?:-[A-Za-z0-9]+)*):\s(.*)$/);
    if (m) ja.set(m[1], m[2]);
  }
}

const hits = [];
for (const [effectId, src] of Object.entries(srcMap)) {
  if (typeof src !== 'string' || !re.test(src)) continue;
  const rec = live.get(effectId);
  if (!rec) continue;
  const json = JSON.stringify(rec.e);
  hits.push({
    effectId, cardNum: rec.cardNum, status: rec.e.parseStatus,
    wired: jsonNeedle ? json.includes(jsonNeedle) : null,
    src, ja: ja.get(effectId) ?? '(逆翻訳なし＝npm run regen を回す)',
  });
}

const cut = (s) => (full ? s : s.slice(0, 120));
const okCount = hits.filter(h => h.wired === true).length;
console.log(`# 母集団（効果単位）: ${hits.length}効果 / ${new Set(hits.map(h => h.cardNum)).size}カード`);
if (jsonNeedle) console.log(`# --json "${jsonNeedle}" 判定: OK ${okCount} / MISS ${hits.length - okCount}`);
console.log('# ⚠ MISS は「配線されていない」ではない＝**逆翻訳を読んで判定する**（同じ概念に別の正準形がある）');
for (const h of hits) {
  const tag = h.wired === null ? '   ' : h.wired ? 'OK ' : 'MISS';
  console.log(`\n${tag} ${h.effectId}  [${h.status}]`);
  console.log(`  原文  : ${cut(h.src)}`);
  console.log(`  逆翻訳: ${cut(h.ja)}`);
}
