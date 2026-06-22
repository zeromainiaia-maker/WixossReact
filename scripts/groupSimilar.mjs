/**
 * groupSimilar.mjs
 * docs/decompile_sheet1.txt の各カードについて、原文を「正規化」(カード名《…》・種族＜…＞・
 * 数字をプレースホルダに置換)して、同型の効果を持つカードを束ねる。
 *
 * 目的:「対象カードが違うだけ」「数字が違うだけ」で他は同じ文のカードをグループ化し、
 * 人間が原文↔逆翻訳の差をグループ単位で判断 → まとめて修正できるようにする。
 *
 * さらに「原文は同型なのに逆翻訳の構造が割れている」グループに ★ を付ける
 * (= どれかの逆翻訳がバグの可能性。WX05-009 型の静かな食い違いも拾える)。
 *
 * 出力: docs/grouped_<sheet>.txt （コンテキストには載せず、人間が開いて使う）
 * 使い方: node scripts/groupSimilar.mjs [入力decompile] [出力txt]
 */
import { readFileSync, writeFileSync } from 'fs';

const inPath = process.argv[2] ?? 'docs/decompile_sheet1.txt';
const outPath = process.argv[3] ?? 'docs/grouped_sheet1.txt';
const text = readFileSync(inPath, 'utf-8');

// カードのカード番号パターン (逆翻訳のエフェクトID内に出るので正規化対象)
const CARD_NUM_RE = /[A-Z][A-Za-z0-9]*-[A-Za-z0-9]+(?:-[A-Za-z0-9]+)?/g;

/** 正規化: カード名・種族・色・数字・カード番号をマスクして「型」を抽出 */
function norm(s) {
  return s
    .replace(CARD_NUM_RE, '<CARD>')        // WX05-009-E1 等のID
    .replace(/《[^》]*》/g, '《X》')          // カード名・色
    .replace(/＜[^＞]*＞/g, '＜X＞')          // 種族・カードタイプ
    .replace(/[0-9０-９]+/g, 'N')           // 数字(半角/全角)
    .replace(/\s+/g, ' ')                   // 空白圧縮
    .trim();
}

/** 逆翻訳用: コスト〈…〉とタイミング修飾(/ATTACK等)を除去してから正規化。
 *  → コスト個数やタイミングの違いで★が誤検出されるのを防ぎ、真の構造差だけを残す。 */
function normDec(s) {
  return norm(
    s.replace(/〈[^〉]*〉/g, '')            // コスト塊 〈《赤×1》《無×1》〉
     .replace(/\/[A-Z_]+/g, '')            // /ATTACK 等のタイミング修飾
  );
}

// カードブロックへ分割
const blocks = text.split(/^={10,}\s*$/m).map(b => b.trim()).filter(Boolean);
const cards = [];
for (const b of blocks) {
  const header = b.match(/^([A-Z0-9][A-Za-z0-9-]*)\s+(\S.*?)\s+\[/m);
  if (!header) continue;
  const origM = b.match(/【原文 EffectText】([\s\S]*?)【JSON 逆翻訳】/);
  const decM = b.match(/【JSON 逆翻訳】([\s\S]*?)$/);
  const orig = (origM?.[1] ?? '').replace(/【原文 BurstText】/g, ' ').trim();
  const decomp = (decM?.[1] ?? '').trim();
  if (!orig || orig === '-') continue;   // 原文「-」= 効果なし(バニラ)は除外
  cards.push({ num: header[1], name: header[2], orig, decomp });
}

// 原文の正規化キーでグループ化
const groups = new Map(); // key -> {key, cards:[]}
for (const c of cards) {
  const key = norm(c.orig);
  if (!groups.has(key)) groups.set(key, { key, cards: [] });
  groups.get(key).cards.push(c);
}

// サイズ2+のグループのみ。逆翻訳の正規化パターン数も数える
const multi = [...groups.values()].filter(g => g.cards.length >= 2);
for (const g of multi) {
  const decPatterns = new Set(g.cards.map(c => normDec(c.decomp)));
  g.decPatternCount = decPatterns.size;       // 2以上 = 原文同型なのに逆翻訳が割れている
  g.flagged = g.decPatternCount >= 2;
}
// 並び順: ★(逆翻訳割れ)を上に、その中はサイズ降順
multi.sort((a, b) => (Number(b.flagged) - Number(a.flagged)) || (b.cards.length - a.cards.length));

// ---- 出力ファイル ----
const lines = [];
const flaggedGroups = multi.filter(g => g.flagged);
lines.push(`入力: ${inPath}`);
lines.push(`総カード数: ${cards.length}`);
lines.push(`同型グループ(2枚以上): ${multi.length}`);
lines.push(`★逆翻訳が割れているグループ(要確認): ${flaggedGroups.length}`);
lines.push(`  └ それらに属するカード数: ${flaggedGroups.reduce((s, g) => s + g.cards.length, 0)}`);
lines.push('');
lines.push('※★ = 原文は同型なのに逆翻訳の構造が違う = どれかがバグの可能性');
lines.push('='.repeat(78));

let gid = 0;
for (const g of multi) {
  gid++;
  const mark = g.flagged ? '★' : ' ';
  lines.push('');
  lines.push(`${mark} G${String(gid).padStart(3, '0')}  カード${g.cards.length}枚 / 逆翻訳${g.decPatternCount}型`);
  lines.push(`  テンプレ原文: ${g.key}`);
  for (const c of g.cards) {
    lines.push(`  ── ${c.num}  ${c.name}`);
    lines.push(`     原文 : ${c.orig.replace(/\s+/g, ' ')}`);
    lines.push(`     逆翻訳: ${c.decomp.replace(/\s+/g, ' ')}`);
  }
}

writeFileSync(outPath, lines.join('\n'), 'utf-8');

// ---- コンテキスト用サマリ(標準出力) ----
console.log(`出力: ${outPath}`);
console.log(`総カード数: ${cards.length}`);
console.log(`同型グループ(2枚以上): ${multi.length}`);
console.log(`★逆翻訳割れグループ(要確認): ${flaggedGroups.length}  (属するカード ${flaggedGroups.reduce((s, g) => s + g.cards.length, 0)}枚)`);
console.log('');
console.log('=== ★逆翻訳割れグループ 上位15 (要確認) ===');
for (const g of flaggedGroups.slice(0, 15)) {
  console.log(`  ${g.cards.length}枚/${g.decPatternCount}型 | ${g.cards.map(c => c.num).join(', ')}`);
  console.log(`     ${g.key.slice(0, 90)}`);
}
