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
import { readFileSync, writeFileSync, readdirSync } from 'fs';
import { join } from 'path';

const arg1 = process.argv[2] ?? 'docs/decompile_sheet1.txt';
// --all: docs/decompile_sheet*.txt を全シート結合して横断分析（系統が弾をまたいでも束ねる）
const allMode = arg1 === '--all';
const inPath = allMode ? 'docs/decompile_sheet*.txt(全シート)' : arg1;
const outPath = process.argv[3] ?? (allMode ? 'docs/grouped_sentence_all.txt' : 'docs/grouped_sentence_sheet1.txt');
const text = allMode
  ? readdirSync('docs').filter(f => /^decompile_sheet\d+\.txt$/.test(f))
      .map(f => readFileSync(join('docs', f), 'utf-8')).join('\n')
  : readFileSync(arg1, 'utf-8');

// UTF-16 混入検出（PowerShell の > で decompile シートを書くと UTF-16LE になり下流が静かに壊れる）
if (text.includes(String.fromCharCode(0))) {
  console.error('⚠ 入力に UTF-16 の混入を検出（PowerShell の > で再生成した可能性）。npm run regen で UTF-8 直書き再生成すること。');
  process.exit(1);
}

// カード番号/エフェクトID (WXDi-P01-061-E1 等の多セグメントも丸ごとマスク)
const CARD_NUM_RE = /[A-Z][A-Za-z0-9]*(?:-[A-Za-z0-9]+)+/g;

// 効果本体の「型」を抽出（マーカー/タイミング/コストを落とし、カード名・数字をマスク）
function bodyKey(sentence) {
  return sentence
    .replace(CARD_NUM_RE, '')
    .replace(/【[^】]*】/g, '')       // 【常】【自】【起】【出】等
    .replace(/[／\/]?（[^）]*）/g, '')  // （メイン起動）等。複数timingは「/」連結なので先行スラッシュごと除去
    .replace(/〈[^〉]*〉/g, '')        // コスト塊
    .replace(/[／\/][A-Z_]+/g, '')    // /ATTACK 等
    .replace(/《[^》]*》/g, '《X》')     // カード名・色
    .replace(/＜[^＞]*＞/g, '＜X＞')     // 種族・タイプ
    .replace(/[0-9０-９]+/g, 'N')      // 数字
    // 先頭の接続句を除去（複合カードで2番目以降に付く「そして」「そうした場合」等で
    // 単独文型の多数派と一致しなくなる偽陽性を防ぐ。原文・逆翻訳の双方に適用）
    .replace(/^(?:そして|そうした場合|その後|そうでなければ|代わりに|または)[、,]?/g, '')
    .replace(/^[①-⑳]+/, '')           // 選択肢番号 ①②③④ 等（CHOOSE選択肢を基本効果と同型に）
    .replace(/^[：:、。\s]+/, '')      // 先頭の区切り記号
    .replace(/\s+/g, ' ')
    .trim();
}

/** 逆翻訳を文/効果行に分割（「。」と改行で区切る）。
 *  CHOOSE の「次から/どちらか…選ぶ【A / B】」ブロックは選択肢A・Bを別文に展開し、
 *  原文側の各選択肢文（「①…」等）と整列できるようにする（CHOOSE偽陽性の抑制）。 */
function splitDecomp(s) {
  const expanded = s.replace(/(?:次から|どちらか)[^【】]*?選ぶ【([^】]*)】/g,
    (_m, inner) => inner.split(' / ').join('。'));
  return expanded.split(/[。\n]/).map(x => x.trim()).filter(Boolean);
}

// 原文側の「選択ヘッダー」文（それ自体は効果でなく構造）。グルーピングから除外し、
// 選択肢の本体（①…）だけを基本効果と同型で突き合わせる。
const CHOICE_HEADER_RE = /(?:^|：)\s*(?:どちらか|以下の).*選ぶ$/;

// 効果として数える文の本数（マスク後 MIN_LEN 以上・STOP/選択ヘッダー除外）。
// 原文と逆翻訳で比較し、逆翻訳が大幅に少なければ「効果の脱落」を疑う。
function origSentenceCount(orig) {
  return orig.split(/。/).filter(s => {
    const k = bodyKey(s);
    return k.length >= MIN_LEN && !STOP.has(k) && !CHOICE_HEADER_RE.test(s);
  }).length;
}
function decompSentenceCount(decomp) {
  return splitDecomp(decomp).map(bodyKey).filter(k => k.length >= MIN_LEN && !STOP.has(k)).length;
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
    if (CHOICE_HEADER_RE.test(s)) continue;   // 「以下の2つから1つを選ぶ」等の選択ヘッダーは除外
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
  const cardKeys = new Map();
  for (const num of g.cards) {
    const keys = new Set(splitDecomp(byNum.get(num).decomp).map(bodyKey).filter(k => k.length >= MIN_LEN));
    cardKeys.set(num, keys);
    for (const k of keys) decCount.set(k, (decCount.get(k) || 0) + 1);
  }
  // 共通の逆翻訳型 = 2枚以上に現れるキー（＝正規な描画バリアントの集合。複数バリアントを許容）
  const commonKeys = new Set([...decCount].filter(([, n]) => n >= 2).map(([k]) => k));
  let top = null, topN = 0;
  for (const [k, n] of decCount) if (n > topN) { topN = n; top = k; }
  g.top = top;
  g.topN = topN;
  // outlier = 共通バリアントを1つも含まないカード（＝多数派のどの描画にも一致しない真の外れ）
  g.outliers = commonKeys.size > 0
    ? [...g.cards].filter(num => {
        for (const k of cardKeys.get(num)) if (commonKeys.has(k)) return false;
        return true;
      })
    : [];
  // 多数派（共通バリアントに適合）が2枚以上あり、それを欠くカードがある場合のみ要確認
  g.flagged = g.outliers.length > 0 && (g.cards.size - g.outliers.length) >= 2;
  // 脱落疑い（逆翻訳の文数 < 原文の文数）の外れを含むか＝最優先の実バグ候補
  g.hasDrop = g.flagged && g.outliers.some(num => {
    const c = byNum.get(num);
    return decompSentenceCount(c.decomp) < origSentenceCount(c.orig);
  });
}
// ★（さらに脱落疑い含むものを最優先）を上に、その中はサイズ降順
multi.sort((a, b) =>
  (Number(b.flagged) - Number(a.flagged)) ||
  (Number(b.hasDrop) - Number(a.hasDrop)) ||
  (b.cards.size - a.cards.size));

const coveredCards = new Set();
for (const g of multi) for (const n of g.cards) coveredCards.add(n);
const flaggedGroups = multi.filter(g => g.flagged);
const flaggedOutliers = new Set();
for (const g of flaggedGroups) for (const n of g.outliers) flaggedOutliers.add(n);
// 脱落疑い（逆翻訳の文数 < 原文の文数）の外れカード集合＝最優先の実バグ候補
const dropSuspects = new Set();
for (const n of flaggedOutliers) {
  const c = byNum.get(n);
  if (decompSentenceCount(c.decomp) < origSentenceCount(c.orig)) dropSuspects.add(n);
}

// ---- 出力ファイル ----
const lines = [];
lines.push(`入力: ${inPath}`);
lines.push(`効果ありカード数: ${cards.length}`);
lines.push(`抽出した効果文(のべ): ${totalSentences} / ユニーク文型: ${groups.size}`);
lines.push(`2枚以上にまとまる文型: ${multi.length}  (カバー ${coveredCards.size}枚)`);
lines.push(`★逆翻訳が割れている文型: ${flaggedGroups.length}  (要確認カード ${flaggedOutliers.size}枚)`);
lines.push(`⚠脱落疑い（逆翻訳が原文より短い＝効果脱落の最優先実バグ候補）: ${dropSuspects.size}枚`);
lines.push('');
lines.push('※★ = 同じ原文文型なのに、一部カードだけ逆翻訳の構造が多数派と違う = バグ候補');
lines.push('※⚠脱落疑い = 逆翻訳の効果文数 < 原文の効果文数。択一や複数効果の脱落＝実バグの主流。各★グループ内で先頭に並ぶ。');
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
    // 脱落疑い（逆翻訳の文数 < 原文の文数）を先頭に並べると実バグから着手できる
    const annotated = g.outliers.map(num => {
      const c = byNum.get(num);
      const oN = origSentenceCount(c.orig), dN = decompSentenceCount(c.decomp);
      return { num, c, oN, dN, drop: dN < oN };
    }).sort((a, b) => Number(b.drop) - Number(a.drop));
    for (const { num, c, oN, dN, drop } of annotated) {
      lines.push(`    ── ${num}  ${c.name}${drop ? `  ⚠脱落疑い(原文${oN}文/逆翻訳${dN}文)` : ''}`);
      lines.push(`       原文 : ${c.orig.replace(/\s+/g, ' ')}`);
      lines.push(`       逆翻訳: ${c.decomp.replace(/\s+/g, ' ')}`);
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
