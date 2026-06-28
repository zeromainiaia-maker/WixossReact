/**
 * _dropTriage.mjs — ⚠脱落疑い（逆翻訳が原文より短い）カードを
 * 偽陽性 / 機構待ち / 要確認 にバケツ分けして棚卸しする診断スクリプト。
 * groupBySentence.mjs と同じ dropSuspect 判定を再現し、各カードに分類タグを付ける。
 * 出力: docs/_drop_triage.txt（人間が開く）＋ コンソールにバケツ別サマリ。
 */
import { readFileSync, writeFileSync, readdirSync } from 'fs';
import { join } from 'path';

const text = readdirSync('docs').filter(f => /^decompile_sheet\d+\.txt$/.test(f))
  .map(f => readFileSync(join('docs', f), 'utf-8')).join('\n');

const CARD_NUM_RE = /[A-Z][A-Za-z0-9]*(?:-[A-Za-z0-9]+)+/g;
const STOP = new Set(['', 'そうした場合', 'その後', 'あなたは', 'それを行う', '次の効果を得る']);
const MIN_LEN = 8;
const CHOICE_HEADER_RE = /(?:^|：)\s*(?:どちらか|以下の).*選ぶ$/;
function bodyKey(s) {
  return s.replace(CARD_NUM_RE, '').replace(/【[^】]*】/g, '').replace(/（[^）]*）/g, '')
    .replace(/〈[^〉]*〉/g, '').replace(/[／\/][A-Z_]+/g, '').replace(/《[^》]*》/g, '《X》')
    .replace(/＜[^＞]*＞/g, '＜X＞').replace(/[0-9０-９]+/g, 'N')
    .replace(/^(?:そして|そうした場合|その後|そうでなければ|代わりに|または)[、,]?/g, '')
    .replace(/^[①-⑳]+/, '').replace(/^[：:、。\s]+/, '').replace(/\s+/g, ' ').trim();
}
function splitDecomp(s) {
  const expanded = s.replace(/(?:次から|どちらか)[^【】]*?選ぶ【([^】]*)】/g, (_m, inner) => inner.split(' / ').join('。'));
  return expanded.split(/[。\n]/).map(x => x.trim()).filter(Boolean);
}
function origSentenceCount(orig) {
  return orig.split(/。/).filter(s => { const k = bodyKey(s); return k.length >= MIN_LEN && !STOP.has(k) && !CHOICE_HEADER_RE.test(s); }).length;
}
function decompSentenceCount(decomp) {
  return splitDecomp(decomp).map(bodyKey).filter(k => k.length >= MIN_LEN && !STOP.has(k)).length;
}

// カード分割
const blocks = text.split(/^={10,}\s*$/m).map(b => b.trim()).filter(Boolean);
const cards = [];
for (const b of blocks) {
  const header = b.match(/^([A-Z0-9][A-Za-z0-9-]*)\s+(\S.*?)\s+\[/m);
  if (!header) continue;
  const origM = b.match(/【原文 EffectText】([\s\S]*?)【JSON 逆翻訳】/);
  const decM = b.match(/【JSON 逆翻訳】([\s\S]*?)$/);
  const orig = (origM?.[1] ?? '').replace(/【原文 BurstText】/g, ' ').trim();
  const decomp = (decM?.[1] ?? '').trim();
  if (!orig || orig === '-') continue;
  cards.push({ num: header[1], name: header[2], orig, decomp });
}
const byNum = new Map(cards.map(c => [c.num, c]));

// dropSuspects 再現（flaggedOutliers 経由）
const groups = new Map();
for (const c of cards) {
  for (const s of c.orig.split(/。/).map(x => x.trim()).filter(Boolean)) {
    if (CHOICE_HEADER_RE.test(s)) continue;
    const key = bodyKey(s);
    if (key.length < MIN_LEN || STOP.has(key)) continue;
    if (!groups.has(key)) groups.set(key, new Set());
    groups.get(key).add(c.num);
  }
}
const multi = [...groups.values()].filter(s => s.size >= 2);
const flaggedOutliers = new Set();
for (const cardSet of multi) {
  const decCount = new Map(); const cardKeys = new Map();
  for (const num of cardSet) {
    const keys = new Set(splitDecomp(byNum.get(num).decomp).map(bodyKey).filter(k => k.length >= MIN_LEN));
    cardKeys.set(num, keys);
    for (const k of keys) decCount.set(k, (decCount.get(k) || 0) + 1);
  }
  const commonKeys = new Set([...decCount].filter(([, n]) => n >= 2).map(([k]) => k));
  const outliers = commonKeys.size > 0 ? [...cardSet].filter(num => { for (const k of cardKeys.get(num)) if (commonKeys.has(k)) return false; return true; }) : [];
  if (outliers.length > 0 && (cardSet.size - outliers.length) >= 2) for (const n of outliers) flaggedOutliers.add(n);
}
const dropSuspects = [...flaggedOutliers].filter(n => { const c = byNum.get(n); return decompSentenceCount(c.decomp) < origSentenceCount(c.orig); });

// ── バケツ分類 ──
function classify(c) {
  const o = c.orig, d = c.decomp;
  if (/【※engine未配線】/.test(d)) return ['機構待ち', 'engine未配線timing'];
  if (/\[STUB:/.test(d) || /\bSTUB\b/.test(d)) return ['機構待ち', 'STUB'];
  if (/生ID|\[アクション:|\[条件:|\[効果:/.test(d)) return ['機構待ち', '生ID/未解決トークン'];
  // 付与引用が空 = 中身脱落（GRANT_QUOTED_AUTO 機構待ち・P1_PLAN §5 未着手）
  if (/『。?』|「。?」|『\s*』|を得る$/.test(d) && /(以下の能力を得る|は「【|は『【|を得る。?\s*」|」を得る|』を得る)/.test(o)) return ['機構待ち', 'GRANT_QUOTED付与引用(空/圧縮)'];
  if (/未配線|未対応|近似|未実装/.test(d)) return ['機構待ち', '逆翻訳に近似/未対応注記'];
  // 偽陽性
  if (/にしか使用できない|場合にしか|でなければ使用できない/.test(o)) return ['偽陽性', '使用条件前置き'];
  // LOOK/REVEAL 一族＝文法崩れだが機能は present（R14/R28 で着手禁止確定の既知偽陽性）
  if (/デッキの(一番)?上から?カードを[0-9０-９]+枚(見る|公開)|デッキの一番上を公開/.test(o)
      && /デッキ(上|の上)[0-9０-９]*枚?を?(公開|並べ替え|見る)/.test(d)) return ['偽陽性', 'LOOK/REVEAL文法崩れ'];
  if (/(アンコール|【エクシード|ベットアイコン|《ベット|【ライズ】|【チーム】|＝)/.test(o) && origSentenceCount(o) - decompSentenceCount(d) <= 1) return ['偽陽性', 'アンコール/ベット/注記'];
  if (/[①-⑳]/.test(o) || /どちらか|から[1１一]つを?選|から[0-9０-９]+つを?選/.test(o)) return ['偽陽性', 'CHOOSE/選択肢圧縮'];
  if (/（[^）]*(発動しない|選べない|できない|扱う|数える|含む|その効果)[^）]*）/.test(o)) return ['偽陽性', 'ルール注記()'];
  // 付与引用（中身present・圧縮）＝逆翻訳に『…』が出ていれば偽陽性
  if (/(は「【|は『【|以下の能力を得る)/.test(o) && /『.*【.*』|「.*【.*」/.test(d)) return ['偽陽性', 'GRANT_QUOTED圧縮(present)'];
  // owner:any や複数効果1行圧縮は逆翻訳が出ていれば偽陽性だが機械判定が難しい→要確認
  return ['要確認', '個別判断'];
}

// 自動分類で「要確認」に落ちた残差を、原文/逆翻訳/JSON実体を個別確認して確定した手動分類（2026-06-28・棚卸し(a)）。
const MANUAL = {
  // 偽陽性（機能 present・直さない）
  'WX24-D1-07': ['偽陽性', 'リコレクト条件分岐(両分岐present)'], 'WX24-D2-07': ['偽陽性', 'リコレクト条件分岐(両分岐present)'],
  'WX24-D3-07': ['偽陽性', 'リコレクト条件分岐(両分岐present)'], 'WX24-D5-07': ['偽陽性', 'リコレクト条件分岐(両分岐present)'],
  'WX25-P1-003': ['偽陽性', 'リコレクト付与展開(effects present)'], 'WX25-P1-007': ['偽陽性', 'リコレクト付与展開(effects present)'],
  'WX13-010': ['偽陽性', 'アンコール注記+本体present'], 'WX13-015': ['偽陽性', 'アンコール注記+本体present'],
  'WX13-018': ['偽陽性', 'アンコール注記+本体present'], 'WX18-013': ['偽陽性', 'アンコール注記+本体present'],
  'WX18-027': ['偽陽性', 'アンコール注記+本体present'], 'WDK06-C07': ['偽陽性', 'アンコール注記+本体present'],
  'WDK14-008': ['偽陽性', 'アンコール注記+本体present(ビート機構済)'],
  'WX25-P2-009': ['偽陽性', '付与展開present'], 'WX25-P3-027': ['偽陽性', '付与/遅延展開present'],
  'WX17-038': ['偽陽性', 'LOOK特殊(めくれるまで)present'], 'WX15-081': ['偽陽性', 'トラップ/BURST両面present'],
  'WXK07-050': ['偽陽性', '複数効果present(条件近似)'],
  // 機構待ち（既知の未着手機構・P1_PLAN §5）
  'WXDi-P01-062': ['機構待ち', 'GRANT_QUOTED付与引用(遅延→即時近似)'], 'WX25-P3-073': ['機構待ち', 'GRANT_QUOTED付与引用'],
  'WX16-Re09': ['機構待ち', 'GRANT_QUOTED付与引用(+power脱落)'], 'WXDi-P11-032': ['機構待ち', 'GRANT_KEYWORD CHOOSE脱落(3択→1)'],
  'WX15-047': ['機構待ち', 'トラップ設置の選択肢脱落(SET_TRAP語彙なし)'],
  'WXDi-CP02-074': ['機構待ち', '1効果脱落(ターン終了時公開・別timing)'], 'WXDi-CP02-089': ['機構待ち', '1効果脱落(アタック開始時付与)'],
  // 修正済（JSON を MANUAL でパッチし逆翻訳が原文一致・2026-06-28）
  'WXK01-063': ['修正済', 'POWER_MODIFY +2000 追加(SEQUENCE)'], 'WX18-019': ['修正済', 'SEARCH→ENERGY 2枚+SHUFFLE 復元'],
  'WDK15-009': ['修正済', '2対象(ライズ持ち/無色でない)を手札に復元'], 'WX16-062': ['修正済', 'トラップ本体(BOUNCEレベル3)を復元'],
  // 機構待ち（faithful な語彙が無く再分類・要新機構）
  'WX17-028': ['機構待ち', '【出】が動的閾値「公開シグニのレベル合計×1000以下」＝語彙なし'],
  'WX25-CP1-069': ['機構待ち', '遅延条件トリガー「このターン…クラッシュしたとき」＝語彙なし'],
};

const buckets = new Map();
const detail = new Map();
for (const n of dropSuspects) {
  const c = byNum.get(n);
  const [b, sub] = MANUAL[n] ?? classify(c);
  if (!buckets.has(b)) buckets.set(b, new Map());
  const sm = buckets.get(b);
  sm.set(sub, (sm.get(sub) || 0) + 1);
  if (!detail.has(b)) detail.set(b, []);
  detail.get(b).push({ n, sub, c });
}

const order = ['機構待ち', '偽陽性', '修正済', '実バグ候補', '要確認'];
const out = [];
out.push(`⚠脱落疑い 棚卸し（${dropSuspects.length}枚）— ${new Date().toISOString().slice(0,10)}`);
out.push('='.repeat(78));
for (const b of order) {
  const sm = buckets.get(b); if (!sm) continue;
  const total = [...sm.values()].reduce((a, x) => a + x, 0);
  out.push(`\n## ${b}: ${total}枚`);
  for (const [sub, n] of [...sm].sort((a, b2) => b2[1] - a[1])) out.push(`   - ${sub}: ${n}枚`);
}
for (const b of order) {
  const arr = detail.get(b); if (!arr) continue;
  out.push(`\n${'='.repeat(78)}\n■ ${b} 明細`);
  for (const { n, sub, c } of arr.sort((a, b2) => a.sub.localeCompare(b2.sub))) {
    out.push(`\n── ${n} [${sub}]  ${c.name}`);
    out.push(`   原文 : ${c.orig.replace(/\s+/g, ' ').slice(0, 240)}`);
    out.push(`   逆翻訳: ${c.decomp.replace(/\s+/g, ' ').slice(0, 240)}`);
  }
}
writeFileSync('docs/_drop_triage.txt', out.join('\n'), 'utf-8');
console.log(`脱落疑い: ${dropSuspects.length}枚`);
for (const b of order) {
  const sm = buckets.get(b); if (!sm) continue;
  const total = [...sm.values()].reduce((a, x) => a + x, 0);
  console.log(`  ${b}: ${total}枚  {${[...sm].sort((a,b2)=>b2[1]-a[1]).map(([s,n])=>`${s}:${n}`).join(', ')}}`);
}
console.log('明細: docs/_drop_triage.txt');
