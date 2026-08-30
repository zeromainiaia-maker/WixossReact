/**
 * census 較正の候補出し＝「計器が知らない受け皿」をカテゴリ単位で見つける（2026-08-30 続き741 に道具化）。
 *
 * 使い方:
 *   node scripts/archive/censusKeyScan.mjs            … 全カテゴリの型名・キー名の頻度表
 *   node scripts/archive/censusKeyScan.mjs <部分一致>  … そのカテゴリの効果を「原文 × live JSON」で全数 dump
 *
 * 🔑**PLAN §4.3「census を減らすときの手順」の 1〜2 を機械化したもの。**
 *   ①カテゴリの高シグナル効果を全数 dump →②JSON の型名・キー名を縦に並べる
 *   →**同じ名前が縦に並んだら実装ではなく較正**（計器が受け皿の綴りを知らないだけ）。
 *
 * ⚠**候補出しであって判定ではない。** 手順③（1件ずつ原文 × live JSON を目視）と
 *   ④（較正の前後で高シグナル id 集合を機械差分し「消えた分＝目視した分／新規流入0」を確認）は必ず人がやる。
 * ⚠**排他（そのカテゴリだけで高シグナル）な効果しか数えない**＝他カテゴリと重複している効果は
 *   そこを直しても総数が減らないので、較正の候補としては数えない。
 * ⚠**事前に `npm run census` を回して `docs/_vocab_census.txt` を最新にすること。**
 */
import fs from 'fs';
import path from 'path';

const DATA_DIR = 'public/data';
const byEid = {};
for (const f of fs.readdirSync(DATA_DIR).filter(n => n.startsWith('effects_') && n.endsWith('.json'))) {
  const j = JSON.parse(fs.readFileSync(path.join(DATA_DIR, f), 'utf8'));
  for (const arr of Object.values(j)) for (const e of arr) if (!(e.effectId in byEid)) byEid[e.effectId] = e;
}
const src = JSON.parse(fs.readFileSync('docs/_effect_srctext.json', 'utf8'));

// docs/_vocab_census.txt の「### 高シグナル（対応語彙なし）」節だけを読む
const lines = fs.readFileSync('docs/_vocab_census.txt', 'utf8').split(/\r?\n/);
let cat = null, mode = null;
const cats = {};          // カテゴリ → [effectId…]
const catsOf = {};        // effectId → Set<カテゴリ>
for (const line of lines) {
  const m = line.match(/^## (.+?) ［/);
  if (m) { cat = m[1]; mode = null; cats[cat] = cats[cat] ?? []; continue; }
  if (/^### 高シグナル/.test(line)) { mode = 'hi'; continue; }
  if (/^### /.test(line)) { mode = null; continue; }
  if (mode !== 'hi' || !line.trim()) continue;
  for (const tok of line.trim().split(/\s+/)) {
    const id = tok.replace(/\(.*$/, '');   // 「WX01-001-E1(2/3)」形の注記を落とす
    cats[cat].push(id);
    (catsOf[id] ??= new Set()).add(cat);
  }
}

const typesOf = e => [...new Set([...JSON.stringify(e).matchAll(/"type":"([A-Z_][A-Z_0-9]*)"/g)].map(x => x[1]))];
const SKIP = new Set(['type', 'effectId', 'effectType', 'timing', 'action', 'owner', 'count', 'target', 'then',
  'else', 'steps', 'duration', 'mandatory', 'parseStatus', 'condition', 'choices', 'choiceId', 'label',
  'source', 'filter', 'conditions']);
const keysOf = e => [...new Set([...JSON.stringify(e).matchAll(/"([a-zA-Z][A-Za-z0-9_]*)":/g)].map(x => x[1]))]
  .filter(k => !SKIP.has(k));
const exclusive = id => catsOf[id]?.size === 1;

const target = process.argv[2];
if (target) {
  const hit = Object.keys(cats).find(c => c.includes(target));
  if (!hit) { console.log('カテゴリが見つからない。候補:'); console.log(Object.keys(cats).join('\n')); process.exit(1); }
  const ids = [...new Set(cats[hit])];
  console.log(`## ${hit}  全${ids.length}（排他=${ids.filter(exclusive).length}）`);
  for (const id of ids) {
    console.log(`=== ${id}${exclusive(id) ? '' : '  ［MULTI＝他カテゴリでも高シグナル］'}`);
    console.log('  原文: ' + (src[id] ?? '(原文ブロックなし＝カード全文 fallback)'));
    console.log('  JSON: ' + (byEid[id] ? JSON.stringify(byEid[id]) : '(live に無い)'));
  }
  process.exit(0);
}

console.log('# カテゴリ別 型名・キー名の頻度（排他な高シグナル効果のみ）');
console.log('# 🔑同じ名前が2件以上に並んだら「計器が受け皿の綴りを知らない」＝較正の候補。');
console.log('# ⚠候補出しであって判定ではない。1件ずつ原文 × live JSON を目視すること。\n');
for (const [c, list] of Object.entries(cats)) {
  const ids = [...new Set(list)].filter(exclusive);
  if (ids.length < 3) continue;
  const freq = {};
  for (const id of ids) {
    const e = byEid[id];
    if (!e) continue;
    for (const k of [...typesOf(e), ...keysOf(e)]) (freq[k] ??= new Set()).add(id);
  }
  const rows = Object.entries(freq).map(([k, s]) => [k, s.size]).filter(([, n]) => n >= 2)
    .sort((a, b) => b[1] - a[1]).slice(0, 14);
  console.log(`## ${c} (排他 ${ids.length})`);
  console.log('  ' + rows.map(([k, n]) => `${k}:${n}`).join('  ') + '\n');
}
