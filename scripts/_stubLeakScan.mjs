// docs/decompile_sheet*.txt を走査し、逆翻訳に残る英語ID漏れ（[STUB:xxx]/[アクション:xxx]/[条件:xxx]/[未実装/UNKNOWN...]）を
// 系統（テーマ）別に集計する診断ツール（§5b・PLAN §3 Sonnetタスク12）。
// 実行: node scripts/_stubLeakScan.mjs > docs/_stub_leak_classification.txt
// JSON/engine は一切変更しない（分析専用）。JSON再構造化の本修正は Opusタスク13。
import fs from 'fs';

const files = fs.readdirSync('docs').filter(f => /^decompile_sheet\d+\.txt$/.test(f));
let all = '';
for (const f of files) all += fs.readFileSync('docs/' + f, 'utf8');
const blocks = all.split('==============================================================================\n');

const leakRe = /\[STUB:[^\]]*\]|\[アクション:[^\]]*\]|\[条件:[^\]]*\]|\[未実装\/UNKNOWN[^\]]*\]/g;

const tags = new Map(); // key -> { count, cards:Set, text }
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

// 系統分類：キーワードでテーマ分け（idの英語部分＋説明文の日本語部分の両方を見る）。
// 上から順にマッチした最初のテーマへ入れる＝優先順位はキーワードリストの並び。
const themes = [
  { name: 'デッキ操作系（公開/めくる/並べ替え/下に置く等）', kws: ['デッキ', 'DECK', 'REVEAL_TOP', 'LOOK_TOP'] },
  { name: 'パワー修正系（動的計算・条件付き・分配等）', kws: ['パワー', 'POWER'] },
  { name: '手札系', kws: ['手札', 'HAND'] },
  { name: 'トラッシュ系', kws: ['トラッシュ', 'TRASH'] },
  { name: '対戦相手コスト/条件系', kws: ['対戦相手', 'OPP'] },
  { name: 'エナゾーン系', kws: ['エナ', 'ENERGY'] },
  { name: 'ライフクロス系', kws: ['ライフ', 'LIFE'] },
  { name: 'シグニ配置/移動系', kws: ['シグニ', 'SIGNI', 'REPOSITION', 'PLACE', 'MOVE'] },
  { name: 'ルリグ/センタールリグ/リミット系', kws: ['ルリグ', 'LRIG', 'リミット', 'CENTER'] },
  { name: '能力付与/喪失系', kws: ['能力', 'ABILITY', 'GRANT'] },
  { name: 'ガード/アタック制限系', kws: ['ガード', 'GUARD', 'アタック', 'ATTACK'] },
  { name: 'ソウル/アーツ/リコレクト系', kws: ['ソウル', 'SOUL', 'アーツ', 'ARTS', 'リコレクト'] },
  { name: 'ウィルス系', kws: ['ウィルス', 'VIRUS', 'ウイルス'] },
  { name: '色/クラス系', kws: ['色', 'COLOR', 'クラス', 'CLASS'] },
  { name: 'ゲーム除外/バニッシュ系', kws: ['除外', 'BANISH', 'EXILE'] },
  { name: 'チャーム系', kws: ['チャーム', 'CHARM'] },
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
  b.ids.push([key, e.count, [...e.cards]]);
}

console.log('===== 英語ID漏れ 系統別サマリ（該当カード数の多い順） =====');
console.log('（decompile_sheet*.txt の [STUB:xxx]/[アクション:xxx]/[条件:xxx]/[未実装/UNKNOWN...] を集計・分析専用＝JSON/engineは無変更）\n');
const sortedBuckets = [...buckets.entries()].sort((a, b) => b[1].cards.size - a[1].cards.size);
for (const [theme, b] of sortedBuckets) {
  console.log(`\n### ${theme}  ── distinct id数:${b.tagCount} / 総出現数:${b.occCount} / 該当カード数:${b.cards.size}`);
  const sortedIds = b.ids.sort((a, c) => c[1] - a[1]);
  for (const [id, cnt, cards] of sortedIds) {
    console.log(`  ${cnt}\t${id}\tカード:${cards.join(',')}`);
  }
}

console.log('\n\n===== 全体集計 =====');
console.log('英語ID/未実装タグを含むカード数:', cardsWithLeak.size);
console.log('タグ出現総数:', [...tags.values()].reduce((a, e) => a + e.count, 0));
console.log('distinct タグ種別数:', tags.size);
