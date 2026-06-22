/**
 * groupBySentence.mjs
 * 粒度拡大版: カード全体ではなく「効果文単位」で原文を正規化してグループ化する。
 * 「対象カードが違うだけ」「数字が違うだけ」で他は同じ文を大量に束ね、
 * まとめてバグ判断・修正できる単位を作る。
 *
 * 効果本体のキー化: マーカー【…】・タイミング(…)・コスト〈…〉・先頭の「：」を除去し、
 * カード名《…》・種族＜…＞・数字をマスクする(= 効果の「型」だけ残す)。
 *
 * 出力: docs/grouped_sentence_<sheet>.txt （人間が開いて使う／コンテキストには載せない）
 * 使い方: node scripts/groupBySentence.mjs [入力decompile] [出力txt]
 */
import { readFileSync, writeFileSync } from 'fs';

const inPath = process.argv[2] ?? 'docs/decompile_sheet1.txt';
const outPath = process.argv[3] ?? 'docs/grouped_sentence_sheet1.txt';
const text = readFileSync(inPath, 'utf-8');

const CARD_NUM_RE = /[A-Z][A-Za-z0-9]*-[A-Za-z0-9]+(?:-[A-Za-z0-9]+)?/g;

// 効果本体の「型」を抽出（マーカー/タイミング/コストを落とし、カード名・数字をマスク）
function bodyKey(sentence) {
  return sentence
    .replace(CARD_NUM_RE, '')
    .replace(/【[^】]*】/g, '')       // 【常】【自】【起】【出】等
    .replace(/（[^）]*）/g, '')        // （メイン起動）等
    .replace(/〈[^〉]*〉/g, '')        // コスト塊
    .replace(/[／\/][A-Z_]+/g, '')    // /ATTACK 等
    .replace(/《[^》]*》/g, '《X》')     // カード名・色
    .replace(/＜[^＞]*＞/g, '＜X＞')     // 種族・タイプ
    .replace(/[0-9０-９]+/g, 'N')      // 数字
    .replace(/^[：:、。\s]+/, '')      // 先頭の区切り記号
    .replace(/\s+/g, ' ')
    .trim();
}

/** 逆翻訳を文/効果行に分割（「。」と改行で区切る） */
function splitDecomp(s) {
  return s.split(/[。\n]/).map(x => x.trim()).filter(Boolean);
}

// 接続句など、それ単体ではグルーピングに値しない断片を除外
const STOP = new Set(['', 'そうした場合', 'その後', 'あなたは', 'それを行う', '次の効果を得る']);
const MIN_LEN = 8;

// カードへ分割
const blocks = text.split(/^={10,}\s*$/m).map(b => b.trim()).filter(Boolean);
const cards = [];
for (const b of blocks) {
  const header = b.match(/^([A-Z0-9][A-Za-z0-9-]*)\s+(\S.*?)\s+\[/m);
  if (!header) continue;
  const origM = b.match(/【原文 EffectText】([\s\S]*?)【JSON 逆翻訳】/);
  const decM = b.match(/【JSON 逆翻訳】([\s\S]*?)$/);
  const orig = (origM?.[1] ?? '').replace(/【原文 BurstText】/g, ' ').trim();
  const decomp = (decM?.[1] ?? '').trim();
  if (!orig || orig === '-') continue;   // 効果なしは除外
  cards.push({ num: header[1], name: header[2], orig, decomp });
}

// 効果文単位でグループ化: key -> {key, example, cards:Set}
const groups = new Map();
let totalSentences = 0;
for (const c of cards) {
  // 「。」で文分割
  const sentences = c.orig.split(/。/).map(s => s.trim()).filter(Boolean);
  for (const s of sentences) {
    const key = bodyKey(s);
    if (key.length < MIN_LEN || STOP.has(key)) continue;
    totalSentences++;
    if (!groups.has(key)) groups.set(key, { key, example: s.replace(/\s+/g, ' '), cards: new Set() });
    groups.get(key).cards.add(c.num);
  }
}

const byNum = new Map(cards.map(c => [c.num, c]));

// 2枚以上のカードにまたがる文型のみ
const multi = [...groups.values()].filter(g => g.cards.size >= 2);

// 各文型グループで逆翻訳の文型を多数決し、多数派を欠くカードを ★outlier として検出。
// (= 原文は同型なのに逆翻訳の構造が違う = バグ候補。WX05-009 型を文粒度で拾う)
for (const g of multi) {
  const decCount = new Map();
  for (const num of g.cards) {
    const keys = new Set(splitDecomp(byNum.get(num).decomp).map(bodyKey).filter(k => k.length >= MIN_LEN));
    for (const k of keys) decCount.set(k, (decCount.get(k) || 0) + 1);
  }
  let top = null, topN = 0;
  for (const [k, n] of decCount) if (n > topN) { topN = n; top = k; }
  g.top = top;
  g.topN = topN;
  g.outliers = top
    ? [...g.cards].filter(num => !new Set(splitDecomp(byNum.get(num).decomp).map(bodyKey)).has(top))
    : [];
  // 多数派が2枚以上あり、それを欠くカードがある場合のみ要確認
  g.flagged = topN >= 2 && g.outliers.length > 0;
}
// ★を上に、その中・その他はサイズ降順
multi.sort((a, b) => (Number(b.flagged) - Number(a.flagged)) || (b.cards.size - a.cards.size));

const coveredCards = new Set();
for (const g of multi) for (const n of g.cards) coveredCards.add(n);
const flaggedGroups = multi.filter(g => g.flagged);
const flaggedOutliers = new Set();
for (const g of flaggedGroups) for (const n of g.outliers) flaggedOutliers.add(n);

// ---- 出力ファイル ----
const lines = [];
lines.push(`入力: ${inPath}`);
lines.push(`効果ありカード数: ${cards.length}`);
lines.push(`抽出した効果文(のべ): ${totalSentences} / ユニーク文型: ${groups.size}`);
lines.push(`2枚以上にまとまる文型: ${multi.length}  (カバー ${coveredCards.size}枚)`);
lines.push(`★逆翻訳が割れている文型: ${flaggedGroups.length}  (要確認カード ${flaggedOutliers.size}枚)`);
lines.push('');
lines.push('※★ = 同じ原文文型なのに、一部カードだけ逆翻訳の構造が多数派と違う = バグ候補');
lines.push('='.repeat(78));

let gid = 0;
for (const g of multi) {
  gid++;
  const mark = g.flagged ? '★' : ' ';
  lines.push('');
  lines.push(`${mark} S${String(gid).padStart(3, '0')}  ${g.cards.size}枚`);
  lines.push(`  文型: ${g.key}`);
  lines.push(`  例文: ${g.example}`);
  if (g.flagged) {
    lines.push(`  多数派の逆翻訳型(${g.topN}枚): ${g.top}`);
    lines.push(`  ▼要確認カード(多数派を欠く):`);
    for (const num of g.outliers) {
      lines.push(`    ── ${num}  ${byNum.get(num).name}`);
      lines.push(`       逆翻訳: ${byNum.get(num).decomp.replace(/\s+/g, ' ')}`);
    }
    lines.push(`  ・その他: ${[...g.cards].filter(n => !g.outliers.includes(n)).join(', ')}`);
  } else {
    lines.push(`  カード: ${[...g.cards].join(', ')}`);
  }
}
writeFileSync(outPath, lines.join('\n'), 'utf-8');

// ---- コンテキスト用サマリ ----
console.log(`出力: ${outPath}`);
console.log(`効果ありカード数: ${cards.length} / 効果文(のべ): ${totalSentences} / ユニーク文型: ${groups.size}`);
console.log(`2枚以上にまとまる文型: ${multi.length} (カバー ${coveredCards.size}枚)`);
console.log(`★逆翻訳が割れている文型: ${flaggedGroups.length} (要確認カード ${flaggedOutliers.size}枚)`);
console.log('');
console.log('=== ★逆翻訳割れ 文型 上位20 (要確認) ===');
for (const g of flaggedGroups.slice(0, 20)) {
  console.log(`  ${String(g.cards.size).padStart(3)}枚 多数派${g.topN}/外れ${g.outliers.length} | ${g.key.slice(0, 60)}`);
  console.log(`       外れ: ${g.outliers.join(', ')}`);
}
