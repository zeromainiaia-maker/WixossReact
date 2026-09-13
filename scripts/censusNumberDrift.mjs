// 数値ドリフト・センサス（§5.5・2026-09-12新設）
//   実行: npm run census:numberdrift            （明細 docs/_census_number_drift.txt）
//         node scripts/censusNumberDrift.mjs --show 20 [--offset N]   （標本を原文つきで出す）
//
// 🔴**ねらい**＝**原文に出てくる数値が、そのカードの逆翻訳のどこにも出てこない**効果を全数で出す。
// 「枚数・パワー・レベル・体数」は原文照合で最も機械的に確かめられる軸なので、
// **ここが食い違う効果は「原文と live のどこかがズレている」ことの強い信号**になる。
//
// 🔑**なぜ要るか**＝2026-09-12 に `MILL` の枚数キーが6つあるのに逆翻訳が `count` しか描いておらず、
// **8カード9箇所が「0枚」「999枚」と表示されていた**のを、抜き取り8枚の目視で偶然見つけた。
// ⇒ **目視で見つけた型を、その場で機械の全数検出に変える**（CLAUDE.md §2.6）ための計器。
//
// ⚠🔴**候補出しであって判定ではない。実測した精度＝真バグ 20% / 表示バグ 45% / 偽陽性 35%**
//   （2026-09-12・標本20件を live JSON まで当たって分類）。⇒ **件数をそのままバグ数と読まない。**
// ⚠**カード単位で突き合わせる**＝parser は原文1文を `-E1`/`-E1b`/`-E3` に割ることがあるので、
//   **効果単位で比べると「兄弟効果が持っている」偽陽性が 44/121 = 36% 出る**（実測）。
// ⚠**ノイズ源は原文側から除く**（下の `denoise`）＝実測した偽陽性の型だけを、理由つきで消している。
//   🔴**ここに安易にパターンを足すと検出力が落ちる**＝足すときは「その型が偽陽性である根拠」を書く。
import fs from 'fs';

const args = process.argv.slice(2);
const argOf = (n, d) => { const i = args.indexOf(n); return i >= 0 ? Number(args[i + 1]) : d; };
const showN = args.includes('--show') ? argOf('--show', 20) : 0;
const offset = argOf('--offset', 0);

const src = JSON.parse(fs.readFileSync('docs/_effect_srctext.json', 'utf8'));
let sheets = '';
for (const f of fs.readdirSync('docs').filter(x => /^decompile_sheet[0-9]+[.]txt$/.test(x))) {
  sheets += fs.readFileSync('docs/' + f, 'utf8');
}
// カード単位で逆翻訳を束ねる（効果単位で比べると兄弟効果ぶんが偽陽性になる）
const cardDec = new Map();
for (const b of sheets.split('==============================================================================\n')) {
  const h = /^([A-Za-z0-9-]+)\s{2,}/.exec(b);
  if (!h) continue;
  const js = b.split('【JSON 逆翻訳】')[1];
  if (js) cardDec.set(h[1], js);
}
const lines = sheets.split('\n');
const decLineOf = (eid) => { const pre = '  ' + eid + ': '; const l = lines.find(x => x.startsWith(pre)); return l ? l.slice(pre.length) : '(行なし)'; };

const Z = '０１２３４５６７８９';
const norm = (s) => s.replace(/[０-９]/g, c => String(Z.indexOf(c)));
/** 実測した偽陽性の型だけを原文から除く（根拠は各行のコメント） */
const denoise = (s) => {
  let t = norm(s);
  t = t.replace(/（[^）]*）/g, '');                 // ルール注記＝【アサシン】の説明文などが数値を含む
  t = t.replace(/《(ターン|ゲーム)[0-9]+回》/g, ''); // 使用回数制限 → once_per_turn / twice_per_turn に化ける
  t = t.replace(/《[^》]*アイコン》/g, '');          // 《コインアイコン》×N → 「コイン2」に化ける（数え方が違う）
  t = t.replace(/英知=[0-9]+/g, '');                // 「英知=10」→「英知…が10であるかぎり」と別表記になる
  t = t.replace(/エクシード[0-9]+/g, '');           // 「エクシード2」→〈エクシード2〉だが表記揺れがある
  t = t.replace(/icon_txt[a-z_0-9]*/g, '');         // 🔴CSV に残った画像ファイル名（`icon_txt_turn_02`）＝原文ではない
  t = t.replace(/[0-9]+/g, (m) => m === '1' ? '' : m); // 🔑「1」は既定値で逆翻訳が省く＝最大のノイズ源
  return t;
};
const nums = (s) => [...norm(s).matchAll(/[0-9]+/g)].map(m => m[0]);
const cardOf = (eid) => { const m = /^(.*?)-(E[0-9]+[a-z]?|BURST|ACT|DECORE|[A-Z][A-Z0-9]*)$/.exec(eid); return m ? m[1] : eid; };

let checked = 0; const hits = [];
for (const [eid, text] of Object.entries(src)) {
  const d = cardDec.get(cardOf(eid));
  if (!d) continue;
  checked++;
  const a = nums(denoise(text));
  const b = new Set(nums(d));
  const missing = [...new Set(a.filter(x => !b.has(x)))];
  if (missing.length) hits.push({ eid, missing, text, dec: decLineOf(eid) });
}

if (showN) {
  const step = Math.max(1, Math.floor(hits.length / showN));
  for (let i = 0; i < showN; i++) {
    const k = i * step + offset; if (k >= hits.length) break;
    const r = hits[k];
    console.log(`#### [${k}] ${r.eid}  落ち=${JSON.stringify(r.missing)}`);
    console.log('  原文: ' + r.text.replace(/\n/g, ' ').slice(0, 180));
    console.log('  逆訳: ' + r.dec.slice(0, 180));
  }
  console.log(`(母集団 ${hits.length})`);
  process.exit(0);
}

const out = [];
out.push('===== 数値ドリフト・センサス（原文の数値がカードの逆翻訳に出てこない効果） =====');
out.push('生成: npm run census:numberdrift   標本を見る: node scripts/censusNumberDrift.mjs --show 20 [--offset N]');
out.push('');
out.push(`照合できた効果: ${checked}`);
out.push(`🔴原文の数値がカード全体の逆翻訳から落ちている効果: ${hits.length}`);
out.push('');
out.push('⚠候補出しであって判定ではない。実測した精度（2026-09-12・標本20件を live JSON まで当たって分類）＝');
out.push('   真バグ 20% ／ 表示バグ（engine は正しい）45% ／ 偽陽性（等価表現）35%。');
out.push('   ⇒ 件数をそのままバグ数と読まない。1件ずつ live JSON を読んで分類する。');
out.push('');
for (const r of hits) {
  out.push(`  ${r.eid}  落ち=${r.missing.join(',')}`);
  out.push(`      原文: ${r.text.replace(/\n/g, ' ').slice(0, 150)}`);
  out.push(`      逆訳: ${r.dec.slice(0, 150)}`);
}
fs.writeFileSync('docs/_census_number_drift.txt', out.join('\n') + '\n');
console.log(out.slice(0, 11).join('\n'));
console.log('明細 → docs/_census_number_drift.txt');

// ── ラチェット ──
// 🔴**0 を目標にしない**（偽陽性が 35% 含まれる＝0 にはできない）。
//   止めるのは「**増えた**」場合＝parser/decompiler の変更で原文と逆翻訳のズレが広がった回。
// 🆕**2026-09-13 第301バッチ（`O-354`）＝75 → 72。** 🔑**STUB ラベルを直すとここも払い戻される**＝
//   この計器はカードの**逆翻訳**に原文の数値が出るかを見るので、`[STUB:…]` のラベルが
//   「WX09-027(オリハルティア)の常在マーカー。」のように**中身を書いていないと、原文の数値がまるごと落ちる**。
//   ⇒ **ラベル整備（`census:stublabel` B/C群）はこの計器の払い戻しでもある。**
const BASELINE = 72;
if (hits.length > BASELINE) {
  console.error(`\n[census:numberdrift] 🔴 GATE FAIL: 基準 ${BASELINE} を超えた（現在 ${hits.length}）`);
  console.error('   逆翻訳が原文の数値を描き落としていないか、node scripts/censusNumberDrift.mjs --show 20 で確認。');
  process.exit(1);
}
if (hits.length < BASELINE) {
  console.error(`\n[census:numberdrift] 🔴 GATE FAIL: 基準 ${BASELINE} を下回った（現在 ${hits.length}）`);
  console.error(`   払い戻しは歓迎。BASELINE を ${hits.length} へ下げてコミットすること。`);
  process.exit(1);
}
