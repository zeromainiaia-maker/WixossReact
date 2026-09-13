// STUB ラベル忠実性センサス（§5.3 `O-351`・2026-09-13新設）
//   実行: npm run census:stublabel                          （明細 docs/_census_stub_label.txt）
//         node scripts/censusStubLabel.mjs --show 20        （標本を原文つきで出す）
//         node scripts/censusStubLabel.mjs --show 20 --group A   （群を絞る＝A/B）
//
// 🔴**ねらい**＝**`[STUB:…]` のラベルが、そのカードの原文を忠実に説明しているか**を全数で測る。
//
// 🔑**なぜ要るか**（登録票 `O-351`）＝`[STUB:…]` が出ているカードは **292枚 / 316箇所**あるが、
//   **`census:numberdrift` も `census:payloadkeys` も 271枚については何も言わない**。
//   ⇒ **`[STUB:…]` が出ている箇所は、このプロジェクトの主軸の検査（原文 × 逆翻訳の目視照合）が
//     「ラベルを信じる」ことで成立している**＝**ラベルが嘘だと、そこだけ検査が効かない。**
//   しかも `census:stubs` の C群/E群/F群は「**生の英語 ID が出ていないか**」しか見ておらず、
//   **綺麗な日本語で書かれた嘘のラベル**は3群とも素通りする（実測＝下記の初回収穫）。
//
// 🔑**初回実測で出た本物**（2026-09-13・第300バッチ）＝
//   - 🔴`MASS_TRASH`＝**1つの id に2つの別文型が同居**。ハンドラは「**相手の**エナ全部＋**相手の**シグニ全部を
//     即トラッシュ」を焼き込んでいるが、`WXDi-P05-007-E3` の原文は「**このターン終了時、あなたの**手札と
//     エナゾーンにあるすべてのカードをトラッシュに置く」＝**プレイヤーもゾーンもタイミングも全部違う。**
//     （`TRASH_ALL_SIGNI_AND_KEY` が `O-60` 第59バッチで直したのと**同じ壊れ方が隣に残っていた**）
//   - 🔴`DECLARE_CARD_NAME`＝ラベル「（**手札の**カード名から選択）」どおり、engine も候補を
//     **自分の手札の先頭4つ**に絞る。だが原文6枚はどれも「カード名１つを宣言する」＝**手札に限定していない。**
//     しかも用途は「**デッキ**から宣言したカードを探す」なので、**手札の名前しか選べないと効果がほぼ死ぬ。**
//   - 🔴`OPP_ENERGY_COLORLESS_ABILITY_LOSS`（`WXK10-008-E1`）＝ラベルが「トラッシュから黒シグニを手札へ」＝
//     **隣の id の説明を拾った誤帰属**（F群で既知の型が、生 ID を含まないので F群に映らなかった）。
//
// ⚠🔴**候補出しであって判定ではない。** 主張しているのは「**ラベルがこのカードの原文を説明していない**」まで。
//   engine が正しいか（＝表示だけの穴か実バグか）は **live JSON とハンドラを読むまで分からない。**
//   実測した精度は下の出力ヘッダに書いてある。**件数をそのままバグ数と読まない。**
//
// ⚠**カード単位で突き合わせる**（`census:numberdrift` と同じ規約）＝parser は原文1文を `-E1`/`-E1b` に割るので、
//   効果単位の原文だけを見ると兄弟効果ぶんが偽陽性になる。ここではカード全文（EffectText＋BurstText）を使う。
import fs from 'fs';

const args = process.argv.slice(2);
const argOf = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const showN = args.includes('--show') ? Number(argOf('--show', 20)) : 0;
const onlyGroup = argOf('--group', '');

let sheets = '';
for (const f of fs.readdirSync('docs').filter(x => /^decompile_sheet[0-9]+[.]txt$/.test(x))) {
  sheets += fs.readFileSync('docs/' + f, 'utf8');
}
/** カード番号 -> { type, text }（原文はカード全文＝EffectText＋BurstText） */
const cards = new Map();
for (const b of sheets.split('==============================================================================\n')) {
  const h = /^([A-Za-z0-9-]+)\s{2,}.*?\[(\S+)[^\]]*\]/.exec(b);
  if (!h) continue;
  const t = b.split('【原文 EffectText】')[1];
  if (!t) continue;
  cards.set(h[1], { type: h[2], text: t.split('【JSON 逆翻訳】')[0].replace(/\s+/g, '') });
}
/** effectId -> 逆翻訳1行 */
const decOf = new Map();
for (const l of sheets.split('\n')) {
  const m = /^ {2}([A-Za-z0-9-]+-(?:E[0-9]+[a-z]?|BURST|ACT|DECORE|[A-Z][A-Z0-9]*)): (.*)$/.exec(l);
  if (m) decOf.set(m[1], m[2]);
}
const cardOf = (e) => { const m = /^(.*?)-(E[0-9]+[a-z]?|BURST|ACT|DECORE|[A-Z][A-Z0-9]*)$/.exec(e); return m ? m[1] : e; };

// ── A群の語彙表 ──
// [ラベルに出る語, 原文にあるべき語の候補]。**長い語から順に照合位置を潰す**＝
// 🔴部分一致で数えると「アップキープ」が「アップ」に、「パワーアップ」が「アップ」に化けて偽陽性になる（実測）。
// ⚠**足すときは「ラベルに出たら原文にも必ず出る」語だけにする。** engine 語（`近似`・`フラグ`）は B群の仕事。
const VOCAB = [
  ['ルリグトラッシュ', ['ルリグトラッシュ']],
  ['ルリグデッキ', ['ルリグデッキ']],
  ['ライフバースト', ['ライフバースト']],
  ['ライフクロス', ['ライフクロス', 'ライフバースト', 'ライフ']],
  ['チェックゾーン', ['チェックゾーン']],
  ['シグニゾーン', ['シグニゾーン', '場']],
  ['エナゾーン', ['エナゾーン', 'エナチャージ', 'エナ']],
  ['エナチャージ', ['エナチャージ', 'エナ']],
  ['アップキープ', ['アップ']],
  ['パワーアップ', ['パワー']],
  ['コストアップ', ['コスト', '増え', '支払']],
  ['ダブルクラッシュ', ['ダブルクラッシュ']],
  ['マルチエナ', ['マルチエナ']],
  ['クラッシュ', ['クラッシュ']],
  ['バニッシュ', ['バニッシュ']],
  ['アサシン', ['アサシン']],
  ['ランサー', ['ランサー']],
  ['シャドウ', ['シャドウ']],
  ['エクシード', ['エクシード']],
  ['チャーム', ['チャーム']],
  ['ウィルス', ['ウィルス', 'ウイルス']],
  ['リソナ', ['リソナ', 'レゾナ']],
  ['レゾナ', ['レゾナ', 'リソナ']],
  ['トラッシュ', ['トラッシュ']],
  ['デッキ', ['デッキ', '山札']],
  ['手札', ['手札']],
  ['シグニ', ['シグニ']],
  ['ルリグ', ['ルリグ']],
  ['スペル', ['スペル']],
  ['アーツ', ['アーツ']],
  ['ピース', ['ピース']],
  ['アクセ', ['アクセ']],
  ['キー', ['キー']],
  ['コイン', ['コイン']],
  ['グロウ', ['グロウ']],
  ['凍結', ['凍結', 'フリーズ']],
  ['除外', ['除外']],
  ['パワー', ['パワー']],
  ['レベル', ['レベル']],
  ['リミット', ['リミット']],
  ['ダウン', ['ダウン']],
  ['ガード', ['ガード']],
];
const ORDERED = [...VOCAB].sort((a, b) => b[0].length - a[0].length);
const SYN = new Map(VOCAB);
/** 長いものから消し込むトークナイザ（部分一致の誤検出よけ） */
function vocabOf(s) {
  let rest = s; const out = [];
  for (const [k] of ORDERED) {
    if (rest.includes(k)) { out.push(k); rest = rest.split(k).join(' '); }
  }
  return out;
}
// 🔑**カード自身の種別はラベルに出てよい**＝「ルリグトラッシュの**アーツ**が自己回収」は
//   アーツカード自身を指しており、原文に「アーツ」の語が無くても嘘ではない（実測の偽陽性3件）。
const SELF_TYPE = {
  'アーツ': 'アーツ', 'スペル': 'スペル', 'シグニ': 'シグニ',
  'ルリグ': 'ルリグ', 'キー': 'キー', 'ピース': 'ピース', 'アーツピース': 'ピース',
};

const Z = '０１２３４５６７８９';
const norm = (s) => s.replace(/[０-９]/g, c => String(Z.indexOf(c)));

// ── B群の型 ──
// ラベルが**このカードの内容を一切説明していない**形。engine が正しくても**原文照合が効かない**のは同じ。
const B_PATTERNS = [
  [/（engine[:：][^）]*未実装[^）]*）/, 'engine未実装の総称ラベル（カード固有の内容が無い）'],
  [/[、，]\s*$/, 'ラベルが途中で切れている（ハンドラ直前コメントの1行目だけを拾った）'],
  [/近似|概算|暫定|とりあえず|仮実装/, '実装メモ（原文ではなく engine の都合を説明している）'],
];

// ── C群の型（＝`census:stubs` F群の死角）──
// 🔴**F群と同じ「内部識別子の漏れ」だが、F群の `INTERNAL_IDENT` が1本も当たらない形**（実測 F群は 0 のまま）：
//   ①**カード番号**（`WX04-008`）＝F群のどのパターンにも無い。しかも**他カードの番号**が焼き込まれている
//     ことが多く、その id を共有する別カードのラベルが**丸ごと別カードの説明**になる。
//   ②**ドットの無い camelCase**（`costColors`・`fetchCardName`）＝F群は `x.fooBar` 形しか見ない。
//   ③**生の英語 ID のうしろが全角括弧**（`GRANT_ALL_ZONE_LIFEBURST（…`）＝`census:stubs` C群の候補判定は
//     ID の直後が `$`/`:`/空白のときしか拾わないので**素通りする**。
//   ④**Markdown の強調**（`**宣言だけ**`）＝実装メモがそのままラベルに出ている徴候。
// ⚠**F群の 0 契約は壊さない**＝あちらは「0 が正・増えたら exit 1」。ここは実測値のラチェットで持つ。
//   直し方は F群と同じ＝**ハンドラ直前に `// 表示: <日本語>` を足す** → `node scripts/genStubsMd.mjs` → `npm run regen`。
const IDENT_PATTERNS = [
  [/[A-Z][A-Z0-9]{3,}(?:_[A-Z0-9]+)+/, '生の英語 ID がラベルに出ている'],
  [/(?:^|[^A-Za-z])[a-z][a-z0-9]*[A-Z][A-Za-z0-9]*/, '内部変数名（camelCase）がラベルに出ている'],
  [/\*\*/, 'Markdown の強調＝実装メモがそのままラベルに出ている'],
];

const rowsA = []; const rowsB = []; const rowsC = [];
let occ = 0;
for (const [eid, dec] of decOf) {
  const ms = [...dec.matchAll(/\[STUB:([^\]]*)\]/g)];
  if (!ms.length) continue;
  const card = cards.get(cardOf(eid));
  if (!card) continue;
  for (const m of ms) {
    occ++;
    const label = m[1];
    // C群：識別子の漏れ（A群の語彙・数値照合より先に判定する＝カード番号は「原文に無い数値」に化けるため）
    const whyC = [];
    // 🔑カード番号は**実在するカード番号の集合**で判定する＝正規表現の当てずっぽうだと偽陽性が出る
    for (const cn of label.match(/[A-Z][A-Za-z0-9]*(?:-[A-Za-z0-9]+)+/g) ?? []) {
      if (cards.has(cn)) whyC.push('カード番号 ' + cn + ' がラベルに出ている');
    }
    for (const [re, why] of IDENT_PATTERNS) if (re.test(label)) whyC.push(why);
    if (whyC.length) { rowsC.push({ eid, label, why: [...new Set(whyC)], text: card.text }); continue; }
    // A群：ラベルの語彙・数値が原文に無い
    const selfType = SELF_TYPE[card.type];
    const miss = vocabOf(label)
      .filter(k => k !== selfType)
      .filter(k => !(SYN.get(k) ?? [k]).some(s => card.text.includes(s)));
    // 🔑「1」は既定値で原文にも表記されないことがある＝`census:numberdrift` と同じ除外
    const nmiss = [...new Set(norm(label).match(/[0-9]+/g) ?? [])]
      .filter(n => n !== '1' && !norm(card.text).includes(n));
    if (miss.length || nmiss.length) {
      rowsA.push({ eid, label, why: [...miss, ...nmiss.map(n => '数値' + n)], text: card.text });
    }
    // B群：説明になっていないラベル
    for (const [re, why] of B_PATTERNS) {
      if (re.test(label)) { rowsB.push({ eid, label, why: [why], text: card.text }); break; }
    }
  }
}

const dump = (rows, n) => {
  for (const r of rows.slice(0, n)) {
    console.log('\n' + r.eid + '  ⚠' + r.why.join(' / '));
    console.log('  ラベル: ' + r.label.slice(0, 170));
    console.log('  原文  : ' + r.text.slice(0, 200));
  }
};
if (showN) {
  for (const [g, rows] of [['A', rowsA], ['B', rowsB], ['C', rowsC]]) {
    if (onlyGroup && onlyGroup !== g) continue;
    console.log('\n===== ' + g + '群（' + rows.length + '） =====');
    dump(rows, showN);
  }
  process.exit(0);
}

const out = [];
out.push('===== STUB ラベル忠実性センサス（`[STUB:…]` のラベルが原文を説明しているか） =====');
out.push('生成: npm run census:stublabel   標本: node scripts/censusStubLabel.mjs --show 20 [--group A|B]');
out.push('');
out.push('逆翻訳シートの [STUB:…] 総数: ' + occ);
out.push('🔴A群 ラベルの語彙・数値が原文に無い       : ' + rowsA.length + ' 箇所');
out.push('🔴B群 ラベルが内容を説明していない         : ' + rowsB.length + ' 箇所');
out.push('🔴C群 ラベルに識別子が漏れている（F群の死角）: ' + rowsC.length + ' 箇所');
out.push('');
out.push('⚠候補出しであって判定ではない。主張は「ラベルがこのカードの原文を説明していない」まで。');
out.push('   engine が正しいか（表示だけの穴か実バグか）は live JSON とハンドラを読むまで分からない。');
out.push('');
out.push('🔑実測した精度（2026-09-13・第300バッチ・新設時の A群 13箇所を live JSON とハンドラまで当たって分類）＝');
out.push('   実バグ（engine がこのカードで間違って動く） 8箇所(62%) ／');
out.push('   表示だけの穴（engine は正しい・ラベルが嘘）  2箇所(15%) ／ 偽陽性 3箇所(23%)。');
out.push('   ⇒ B群・C群は「原文照合が効かない」ことの検出であって、engine の欠陥数ではない。');
out.push('');
for (const [name, rows] of [['A群', rowsA], ['B群', rowsB], ['C群', rowsC]]) {
  out.push('============================== ' + name + ' ==============================');
  for (const r of rows) {
    out.push('  ' + r.eid + '  ⚠' + r.why.join(' / '));
    out.push('      ラベル: ' + r.label.slice(0, 160));
    out.push('      原文  : ' + r.text.slice(0, 160));
  }
  out.push('');
}
fs.writeFileSync('docs/_census_stub_label.txt', out.join('\n') + '\n');
console.log(out.slice(0, 12).join('\n'));
console.log('明細 → docs/_census_stub_label.txt');

// ── ラチェット ──
// 🔴**0 を目標にしない**（偽陽性を含む＝0 にはできない）。止めるのは「**増えた**」場合＝
//   新しい STUB のラベルを、そのカードの原文を読まずに書いた回。
// ⚠払い戻したら BASELINE を実測値へ下げてコミットする（減っても exit 1）。
const BASELINE_A = 11;  // 2026-09-13 第300バッチ（新設時 13 → `MASS_TRASH` 2件を払い戻して 11）
const BASELINE_B = 1;   // 2026-09-13 第301バッチ（`O-354`＝17 → 1）
// 🔑**残り1件は意図的な真陽性**＝`ATTACH_SEARCHED_AS_ACCE`（`WX17-033-E1`）のラベル「（手札経由近似）」。
//   engine は探したカードを**いったん手札へ入れてから**【アクセ】にする（`execStubPart1.ts` が
//   `ownerState.hand.includes(...)` を必須にしている）が、原文は手札を経由しない。
//   ⇒ **ラベルから「近似」を消すと、その engine の逸脱が逆翻訳から見えなくなる**＝直すのは engine 側（`O-355`）。
const BASELINE_C = 0;   // 2026-09-13 第301バッチ（`O-354`＝26 → 0。`census:stubs` F群の死角をこちらで持つ）
let bad = false;
for (const [tag, n, base] of [['A群', rowsA.length, BASELINE_A], ['B群', rowsB.length, BASELINE_B], ['C群', rowsC.length, BASELINE_C]]) {
  if (n > base) {
    console.error('\n[census:stublabel] 🔴 GATE FAIL: ' + tag + ' が基準 ' + base + ' を超えた（現在 ' + n + '）');
    bad = true;
  } else if (n < base) {
    console.error('\n[census:stublabel] 🔴 GATE FAIL: ' + tag + ' が基準 ' + base + ' を下回った（現在 ' + n + '）。払い戻しは歓迎＝BASELINE を ' + n + ' へ下げてコミットすること。');
    bad = true;
  }
}
if (bad) process.exit(1);
