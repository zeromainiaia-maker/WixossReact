import fs from 'fs';

const files = fs.readdirSync('docs').filter(f => /^decompile_sheet\d+\.txt$/.test(f));
let all = '';
for (const f of files) all += fs.readFileSync('docs/' + f, 'utf8');
const blocks = all.split('==============================================================================\n');

const leakRe = /\[STUB:[^\]]*\]|\[アクション:[^\]]*\]|\[条件:[^\]]*\]|\[未実装\/UNKNOWN[^\]]*\]/g;

// tagKey -> { count, cards:Set, sampleText }
const tags = new Map();
const cardsWithLeak = new Set();

for (const b of blocks) {
  const headerMatch = b.match(/^([A-Za-z0-9-]+)\s{2,}/);
  if (!headerMatch) continue;
  const cardNum = headerMatch[1];
  const jsonSection = b.split('【JSON 逆翻訳】')[1] ?? '';
  const matches = jsonSection.match(leakRe);
  if (!matches) continue;
  cardsWithLeak.add(cardNum);
  for (const m of matches) {
    const inner = m.slice(1, -1);
    let key = inner;
    const stubM = inner.match(/^STUB:([A-Za-z0-9_]+)/);
    const actM = inner.match(/^アクション:([A-Za-z0-9_]+)/);
    const condM = inner.match(/^条件:([A-Za-z0-9_]+)/);
    if (stubM) key = 'STUB:' + stubM[1];
    else if (actM) key = 'アクション:' + actM[1];
    else if (condM) key = '条件:' + condM[1];
    else if (inner.startsWith('未実装')) key = '未実装/UNKNOWN';
    if (!tags.has(key)) tags.set(key, { count: 0, cards: new Set(), text: inner });
    const e = tags.get(key);
    e.count++; e.cards.add(cardNum);
  }
}

// 系統分類：キーワードでテーマ分け（idの英語部分＋説明文の日本語部分の両方を見る）
const themes = [
  { name: 'デッキ操作系（公開/めくる/並べ替え/下に置く等）', kws: ['デッキ', 'DECK', 'REVEAL_TOP', 'LOOK_TOP'] },
  { name: 'パワー修正系（動的計算・条件付き・分配等）', kws: ['パワー', 'POWER'] },
  { name: 'ルリグ/センタールリグ/リミット系', kws: ['ルリグ', 'LRIG', 'リミット', 'CENTER'] },
  { name: 'エナゾーン系', kws: ['エナ', 'ENERGY'] },
  { name: 'トラッシュ系', kws: ['トラッシュ', 'TRASH'] },
  { name: 'チャーム系', kws: ['チャーム', 'CHARM'] },
  { name: 'ウィルス系', kws: ['ウィルス', 'VIRUS', 'ウイルス'] },
  { name: 'ガード/アタック制限系', kws: ['ガード', 'GUARD', 'アタック', 'ATTACK'] },
  { name: '手札系', kws: ['手札', 'HAND'] },
  { name: 'ライフクロス系', kws: ['ライフ', 'LIFE'] },
  { name: 'ソウル/アーツ/リコレクト系', kws: ['ソウル', 'SOUL', 'アーツ', 'ARTS', 'リコレクト'] },
  { name: '対戦相手コスト/条件系', kws: ['対戦相手', 'OPP'] },
  { name: 'シグニ配置/移動系', kws: ['シグニ', 'SIGNI', 'REPOSITION', 'PLACE', 'MOVE'] },
  { name: '能力付与/喪失系', kws: ['能力', 'ABILITY', 'GRANT'] },
  { name: 'ゲーム除外/バニッシュ系', kws: ['除外', 'BANISH', 'EXILE'] },
  { name: '色/クラス系', kws: ['色', 'COLOR', 'クラス', 'CLASS'] },
];

function classify(key, text) {
  const hay = key + ' ' + text;
  for (const t of themes) {
    if (t.kws.some(kw => hay.includes(kw))) return t.name;
  }
  return 'その他/個別対応（テーマ不明瞭）';
}

const buckets = new Map();
for (const [key, e] of tags) {
  const theme = classify(key, e.text);
  if (!buckets.has(theme)) buckets.set(theme, { tagCount: 0, occCount: 0, cards: new Set(), ids: [] });
  const b = buckets.get(theme);
  b.tagCount++; b.occCount += e.count;
  for (const c of e.cards) b.cards.add(c);
  b.ids.push([key, e.count, [...e.cards].slice(0, 3)]);
}

console.log('===== 系統別サマリ（テーマ順・カード数の多い順） =====');
const sortedBuckets = [...buckets.entries()].sort((a, b) => b[1].cards.size - a[1].cards.size);
for (const [theme, b] of sortedBuckets) {
  console.log(`\n### ${theme}  ── distinct id数:${b.tagCount} / 総出現数:${b.occCount} / 該当カード数:${b.cards.size}`);
  const topIds = b.ids.sort((a, c) => c[1] - a[1]).slice(0, 10);
  for (const [id, cnt, sample] of topIds) {
    console.log(`  ${cnt}\t${id}\t例:${sample.join(',')}`);
  }
  if (b.ids.length > 10) console.log(`  ...他 ${b.ids.length - 10} 件`);
}

console.log('\n\n===== 全体集計 =====');
console.log('英語ID/未実装タグを含むカード数:', cardsWithLeak.size);
console.log('タグ出現総数:', [...tags.values()].reduce((a, e) => a + e.count, 0));
console.log('distinct タグ種別数:', tags.size);
