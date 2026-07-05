/**
 * groupBySystem.mjs
 * docs/decompile_sheet1.txt をパースし、各カードの「原文」と「逆翻訳」を分離。
 * 原文の特徴フレーズで効果を系統分けし、逆翻訳側の不完全シグナル(STUB/UNKNOWN/近似)を併記する。
 * 目的: 似た系統をまとめて修正するための「検索インデックス」を機械的に作る。LLMに全文を読ませない。
 *
 * 使い方: node scripts/groupBySystem.mjs [docs/decompile_sheet1.txt]
 */
import { readFileSync } from 'fs';

const path = process.argv[2] ?? 'docs/decompile_sheet1.txt';
const text = readFileSync(path, 'utf-8');

// カードブロックに分割（"====" 区切り）
const blocks = text.split(/^={10,}\s*$/m).map(b => b.trim()).filter(Boolean);

/** @type {{num:string,name:string,orig:string,decomp:string,flags:string[]}[]} */
const cards = [];
for (const b of blocks) {
  const header = b.match(/^([A-Z0-9][A-Za-z0-9-]*)\s+(\S.*?)\s+\[/m);
  if (!header) continue;
  const num = header[1];
  const name = header[2];
  // 原文 = EffectText(+BurstText) を【JSON 逆翻訳】まで。間の BurstText マーカー行は除去。
  const origM = b.match(/【原文 EffectText】([\s\S]*?)【JSON 逆翻訳】/);
  const decM = b.match(/【JSON 逆翻訳】([\s\S]*?)$/);
  const orig = (origM?.[1] ?? '').replace(/【原文 BurstText】/g, ' ').trim();
  const decomp = (decM?.[1] ?? '').trim();
  const flags = [];
  if (/STUB/.test(decomp)) flags.push('STUB');
  if (/UNKNOWN/.test(decomp)) flags.push('UNKNOWN');
  if (/近似|要確認|未実装/.test(decomp)) flags.push('近似');
  cards.push({ num, name, orig, decomp, flags });
}

// 系統定義: [ラベル, 原文にマッチする正規表現]
const systems = [
  ['パワー参照除去(パワーN以下/合計N以下/この方法で〜以下)', /パワー\s*\d+\s*以下|パワーの合計が\s*\d+\s*以下|この方法で.{0,10}パワー以下|パワー以下の/],
  ['バニッシュ', /バニッシュ/],
  ['トラッシュに置く(除去)', /シグニ.{0,20}をトラッシュに置く|対象とし、それ.{0,6}をトラッシュに置く/],
  ['手札に戻す(バウンス)', /手札に戻す/],
  ['エナゾーン操作', /エナゾーン/],
  ['ライフ/クラッシュ', /ライフクロス|クラッシュ/],
  ['ダウン/アップ', /ダウンする|アップする|ダウン状態|アップ状態/],
  ['凍結', /凍結/],
  ['パワー増減(±)', /パワーを[＋\+－\-]/],
  ['能力を失う', /能力を失う/],
  ['シャドウ', /シャドウ/],
  ['ランサー/アサシン', /ランサー|アサシン/],
  ['ダブル/トリプルクラッシュ', /ダブルクラッシュ|トリプルクラッシュ/],
  ['ガード/バリア', /【ガード】|シグニバリア|ルリグバリア/],
  ['サーチ(探して公開)', /探して公開し/],
  ['ドロー', /カードを\s*\d+\s*枚引く|カードを１枚引く|カードを１枚引/],
  ['手札を捨てる', /手札を.{0,6}捨て/],
  ['コスト軽減/支払わず', /コストを支払わず|使用コスト.{0,10}減/],
  ['グロウ条件', /【グロウ条件】|グロウ】/],
  ['エクシード', /エクシード/],
  ['場に出す(リアニ/デッキから)', /場に出す/],
];

console.log(`総カード数: ${cards.length}`);
console.log(`不完全シグナル: STUB=${cards.filter(c=>c.flags.includes('STUB')).length} / UNKNOWN=${cards.filter(c=>c.flags.includes('UNKNOWN')).length} / 近似=${cards.filter(c=>c.flags.includes('近似')).length}`);
console.log('');
console.log('=== 原文ベース 系統別件数（不完全フラグ付きカード数も併記） ===');
for (const [label, re] of systems) {
  const hit = cards.filter(c => re.test(c.orig));
  const flagged = hit.filter(c => c.flags.length > 0);
  console.log(`${String(hit.length).padStart(4)}件 | 要確認${String(flagged.length).padStart(3)} | ${label}`);
}

console.log('');
console.log('=== 不完全シグナル付きカード（STUB/UNKNOWN/近似）の系統内訳 ===');
const flaggedCards = cards.filter(c => c.flags.length > 0);
for (const [label, re] of systems) {
  const hit = flaggedCards.filter(c => re.test(c.orig));
  if (hit.length === 0) continue;
  console.log(`${String(hit.length).padStart(3)}件 | ${label}`);
}
