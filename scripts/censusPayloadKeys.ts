// payload キー被覆センサス（§5.5・2026-09-12新設）
//   実行: npm run census:payloadkeys        （明細 docs/_census_payload_keys.txt）
//         npx tsx scripts/censusPayloadKeys.ts --key <キー名>  （1キーの当たりカード全部）
//
// 🔴**ねらい**＝**live JSON に在るのに `decompileEffects.ts` が一度も言及していない payload キー**を
// 全数で出す。この形は**どの既存計器にも映らない**＝
//   ・`census:stubs` A群には出ない（STUB ハンドラは在って engine の消費地点もある）
//   ・`census:enginetext` にも出ない（原文を読んでいない）
//   ・golden・smoke・fuzz も緑（例外も不変条件違反も起きない。engine は正しく動く）
//   ・`census:cards` も緑（parseStatus は AUTO で、どの懸念フラグも立たない）
// ⇒ **JSON も engine も正しいのに、逆翻訳だけが嘘をつく。**
//
// 🔑**なぜ致命的か**＝このプロジェクトの主軸の検査は「原文 × 逆翻訳の目視照合」なので、
// **逆翻訳が嘘をついている箇所は検査がそこだけ効いていない**＝実バグの隠れ場所になる。
// しかも嘘の向きが「**少なく**見える」ので、読んだ人が**実バグだと誤判定して偽の worklist を作る**。
//   実例（2026-09-12 第294バッチ後半で実測）＝`MILL` の枚数キーが6つあるのに初版は `count` しか描かず、
//   **8カード9箇所が全部嘘**だった（`count:0` なので「0枚」／`untilFilter` は `count:999` なので「999枚」／
//   `alsoOpponent` は相手側のミルが丸ごと消える）。⇒ `PR-238` の「デッキの上から0枚」を最初は実バグだと読んだ。
//
// ⚠**候補出しであって判定ではない。** 描かなくてよいキーが実在する（制御フロー・内部マーカー）＝
// 下の `IGNORED` に**理由を書いて**登録する。**理由を書かずに足さない**（それをやると計器が死ぬ）。
import { readFileSync, readdirSync, writeFileSync } from 'fs';
import { join } from 'path';

const root = join(import.meta.dirname, '..');
const argv = process.argv.slice(2);
const onlyKey = (() => { const i = argv.indexOf('--key'); return i >= 0 ? argv[i + 1] : null; })();

// ── 描かなくてよいキー（理由つき。理由を書かずに足さない）──
// 🔑判定基準＝**そのキーを落として原文と照合したとき、原文のどの語が説明できなくなるか**。
//   「何も説明できなくなる語が無い」＝カードの意味ではなく実装の都合＝ここへ入れてよい。
const IGNORED = new Map<string, string>([
  // 対象候補が0件のときに後続を打ち切るかの制御フロー。原文のどの語にも対応しない。
  ['abortIfNoCandidate', '制御フロー（候補0件時に後続を打ち切るか）＝原文に対応語が無い'],
  // 「原文が対象を明示しているか」の内部マーカー。対象そのものは filter/count が描く。
  ['explicitTarget', '内部マーカー（原文が対象を明示していたか）＝対象は filter/count 側が描く'],
  // CONDITIONAL の判定用に lastProcessed を退避するかの実装都合。
  ['snapshotLastProcessedForConditionals', '実装都合（CONDITIONAL 判定用の lastProcessed 退避）'],
  // 型の識別子そのもの。
  ['type', '型の識別子'], ['id', '型の識別子'],
]);

// ── live JSON から payload キーを全数収集 ──
const SKIP = new Set(['type', 'id', 'effectId', 'effectType', 'parseStatus', 'rawText', 'duration', 'mandatory']);
type Row = { n: number; cards: Set<string>; ids: string[]; types: Set<string> };
const keys = new Map<string, Row>();
for (const f of readdirSync(join(root, 'public/data')).filter(x => /^effects_.*\.json$/.test(x))) {
  const data = JSON.parse(readFileSync(join(root, 'public/data', f), 'utf-8')) as Record<string, unknown>;
  for (const cardNum of Object.keys(data)) {
    const raw = data[cardNum];
    const effects = (Array.isArray(raw) ? raw : ((raw as { effects?: unknown[] })?.effects ?? [])) as Record<string, unknown>[];
    const walk = (n: unknown, eid: string): void => {
      if (!n || typeof n !== 'object') return;
      if (Array.isArray(n)) { n.forEach(x => walk(x, eid)); return; }
      const rec = n as Record<string, unknown>;
      if (typeof rec.type === 'string') {
        for (const k of Object.keys(rec)) {
          if (SKIP.has(k)) continue;
          let e = keys.get(k);
          if (!e) { e = { n: 0, cards: new Set(), ids: [], types: new Set() }; keys.set(k, e); }
          e.n++; e.cards.add(cardNum); e.types.add(rec.type as string);
          if (e.ids.length < 6) e.ids.push(eid);
        }
      }
      for (const v of Object.values(rec)) walk(v, eid);
    };
    for (const e of effects) walk(e, String((e as { effectId?: string }).effectId ?? '?'));
  }
}

// ── decompiler が言及しているか（文字列包含＝過小報告しない向き）──
const dec = readFileSync(join(root, 'scripts/decompileEffects.ts'), 'utf-8');
const undrawn = [...keys].filter(([k]) => !dec.includes(k) && !IGNORED.has(k))
  .sort((a, b) => b[1].n - a[1].n || a[0].localeCompare(b[0]));

if (onlyKey) {
  const row = keys.get(onlyKey);
  if (!row) { console.log(`[census:payloadkeys] '${onlyKey}' は live に無い`); process.exit(0); }
  console.log(`## ${onlyKey}  ${row.n}ノード / ${row.cards.size}カード  [${[...row.types].join(', ')}]`);
  console.log(`   decompiler の言及: ${dec.includes(onlyKey) ? 'あり' : '🔴なし'}`);
  console.log(`   IGNORED: ${IGNORED.get(onlyKey) ?? '(未登録)'}`);
  console.log(`   カード: ${[...row.cards].join(', ')}`);
  process.exit(0);
}

const out: string[] = [];
const p = (s = '') => out.push(s);
p('===== payload キー被覆センサス（§5.5・逆翻訳が描き落としている payload キー） =====');
p('生成: npm run census:payloadkeys   1キーの内訳: --key <キー名>');
p('');
p(`live JSON の payload キー: ${keys.size}種`);
p(`  描かなくてよいと登録済み（IGNORED）: ${IGNORED.size}種`);
p(`  🔴逆翻訳が一度も言及しない        : ${undrawn.length}種 / ${undrawn.reduce((a, r) => a + r[1].n, 0)}ノード`);
p('');
p('⚠候補出しであって判定ではない＝1キーずつ「落とすと原文のどの語が説明できなくなるか」で判定する。');
p('  意味を持つキー → decompileEffects.ts に描画を足す／実装の都合 → IGNORED に理由つきで登録。');
p('');
for (const [k, v] of undrawn) {
  p(`  ${String(v.n).padStart(4)}ノード ${String(v.cards.size).padStart(3)}枚  ${k}  [${[...v.types].slice(0, 3).join(', ')}]`);
  p(`        例: ${v.ids.slice(0, 4).join(', ')}`);
}
writeFileSync(join(root, 'docs/_census_payload_keys.txt'), out.join('\n') + '\n');
console.log(out.slice(0, 9).join('\n'));
console.log(`明細 → docs/_census_payload_keys.txt`);

// ── ラチェット ──
// 🔴**0 を目標にしない**＝意味を持たないキーは IGNORED に落とすのが正で、そちらは件数に出ない。
//   ここで止めるのは「**未判定のキーが増えた**」場合＝新しい payload を足して描画を忘れた回。
//   払い戻したら BASELINE を実測値へ下げる（下げ忘れも exit 1 で気づく）。
const BASELINE = 34;  // 2026-09-13 O-348 バッチB＝型つき12キー（12ノード）を payload から描画した後の実数
if (undrawn.length > BASELINE) {
  console.error(`\n[census:payloadkeys] 🔴 GATE FAIL: 未判定の payload キーが基準 ${BASELINE} を超えた（現在 ${undrawn.length}）`);
  for (const [k, v] of undrawn.slice(0, 10)) console.error(`   - ${k}（${v.n}ノード / ${v.cards.size}枚・例 ${v.ids[0]}）`);
  console.error('   decompileEffects.ts に描画を足すか、IGNORED に理由つきで登録して、npm run regen。');
  process.exit(1);
}
if (undrawn.length < BASELINE) {
  console.error(`\n[census:payloadkeys] 🔴 GATE FAIL: 基準 ${BASELINE} を下回った（現在 ${undrawn.length}）`);
  console.error(`   払い戻しは歓迎。BASELINE を ${undrawn.length} へ下げてコミットすること（下げ忘れ防止のため止めている）。`);
  process.exit(1);
}
