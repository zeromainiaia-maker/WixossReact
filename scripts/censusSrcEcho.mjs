// 原文エコー・センサス（§5.3 `O-356`・2026-09-13新設）
//   実行: npm run census:srcecho              （明細 docs/_census_src_echo.txt）
//         node scripts/censusSrcEcho.mjs --id <STUB_ID>   （1 id の当たりカード全部）
//         node scripts/censusSrcEcho.mjs --group A        （A群だけ／B・C も同様）
//
// 🔴**ねらい**＝**`scripts/decompileEffects.ts` が「カードの原文」を regex で切り出して、
//   それをそのまま逆翻訳の出力にしている箇所**を全数で出す。
//
// 🔑**なぜ致命的か**＝このプロジェクトの主軸の検査は「**原文 × 逆翻訳の目視照合**」である。
//   原文をコピーして返す実装では、**payload が何であろうと、engine が何をしようと、
//   逆翻訳は必ず原文と一致する**＝**そのカードでだけ照合が構造的に無効**になる。
//   しかも「正しく描けているように見える」ので、**読んだ人がそのカードを検査済みだと誤認する。**
//
// 🔴**この形はどの既存計器にも映らない**＝
//   ・`census:payloadkeys` は「payload キー名が `decompileEffects.ts` に出てこないか」しか見ない
//     （原文エコーの分岐はキー名を書かないので、**キーが未判定リストに出る理由が説明できないまま残る**。
//      実測＝`resonaSummon` 11ノードはこれで説明がついた）
//   ・`census:stublabel` は「ラベルが原文を説明しているか」を見るので、**原文そのものは満点で通る**
//   ・`census:enginetext` / `census:costtext` は `src/engine/` と UI 層しか走査しない
//   ・golden・smoke・fuzz・census も緑（engine も JSON も正しく動く）
//
// **実績（2026-09-13 第305バッチで3 id を payload 化して判明）**＝原文を regex で切り出す実装は、
//   **その regex が拾い損ねた文を静かに捨てる**。
//   `WX16-Re18-E1` は「この方法で場に出たレゾナの【出】能力は発動しない。」が丸ごと消えていた
//   （regex が `[^。：]*?` で1文しか取らなかった）／`WXDi-CP01-024-E1` は「＜バーチャル＞の」と
//   「それの【出】能力は発動しない。」の2つが消えていた。
//
// ⚠**候補出しであって判定ではない。** 原文をそのまま返してよい分岐は実在する
//   （引用能力をそのまま与える `GRANT_QUOTED_*` など＝**原文の引用が効果の中身そのもの**）。
//   1件ずつ「payload から同じ意味を組み立てられるか」で判定し、
//   組み立てられないなら **`ALLOWED` に理由つきで登録**する（🔴**理由を書かずに足さない**＝計器が死ぬ）。
//
// ⚠**この計器を書くときに踏んだ罠（2026-09-13）**＝初版は
//   「`const m = 原文.match(...)` の直後 10行以内に `return m[0]` があるか」だけを見ていたので、
//   **原文が中間変数を経由して戻り値に入る形を取りこぼした**
//   （`OPTIONAL_TRASH_ENERGY_CLASS` 33ノード＝`m[1]`→`cls`→テンプレ／`DESIGNATE_SIGNI_ZONE` 15ノード＝
//    `m[0]`→`bodyDSZ`→`return`）。⇒ **多段の taint 追跡**にしてある。
//   🔴**taint はブロック内でだけ伝播させる**（`m`／`cls`／`n` は一般名なので、ファイル全体へ広げると
//   無関係な分岐まで原文由来に化ける＝`census:costtext` が 3規則/14カード → 6規則/941カード に膨張した罠）。
import { readFileSync, readdirSync, writeFileSync } from 'fs';
import { join } from 'path';

const root = join(import.meta.dirname, '..');
const argv = process.argv.slice(2);
const argOf = (name) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : null; };
const onlyId = argOf('--id');
const onlyGroup = argOf('--group');

// ── 原文をそのまま返してよいと登録済みの id（理由つき。理由を書かずに足さない）──
// 🔑判定基準＝**payload から同じ意味を組み立てられるか**。
//   「原文の引用そのものが効果の中身」＝組み立て不能＝ここへ入れてよい。
const ALLOWED = new Map([
  // 「『…』を得る」の『…』は能力テキストそのもの＝構造化された別表現が存在しない
  // （引用を引用として描くのが正しい。payload 側も同じ原文文字列を保持している）。
  ['GRANT_QUOTED_AUTO_ABILITY', '付与する能力の『引用文』そのものが効果の中身＝構造化された別表現が無い'],
  ['GRANT_QUOTED_ACTIVATE_ABILITY', '同上（【起】の引用）'],
]);

const SRC = 'scripts/decompileEffects.ts';
const lines = readFileSync(join(root, SRC), 'utf-8').split('\n');

// 原文の変数は2つだけ（カード全文 / 効果セクション）。宣言行と出力ループの代入行は対象外。
const TAINT_SOURCE = /\b(?:currentCardText|currentEffectText)\b/;
const DECL_OR_ASSIGN = /^\s*(?:let\s+)?(?:currentCardText|currentEffectText)\s*(?:=|;)/;
// 分岐のアンカー＝`if (a.id === 'X')` / `case 'X':`。ここでブロックを切る。
const ANCHOR = /a\.id === '([A-Z0-9_]+)'|^\s*case '([A-Z0-9_]+)':/;

// ── ブロック分割（taint のスコープ）──
const blocks = [];
{
  let curStart = 0;
  let curId = '(非STUB＝汎用ヘルパー)';
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(ANCHOR);
    if (!m) continue;
    blocks.push({ id: curId, from: curStart, to: i - 1 });
    curId = m[1] ?? m[2];
    curStart = i;
  }
  blocks.push({ id: curId, from: curStart, to: lines.length - 1 });
}

const isCommentLine = (raw) => {
  const t = raw.replace(/^\s*/, '');
  return t.startsWith('//') || t.startsWith('*');
};
// 変数名の参照判定＝前後1文字が識別子でないこと（`\b` に頼らず境界を自分で見る）。
const refsAny = (line, names) => {
  for (const n of names) {
    let from = 0;
    for (;;) {
      const at = line.indexOf(n, from);
      if (at < 0) break;
      const before = at === 0 ? '' : line[at - 1];
      const after = line[at + n.length] ?? '';
      const idch = (c) => c !== '' && /[A-Za-z0-9_$]/.test(c);
      if (!idch(before) && !idch(after)) return true;
      from = at + n.length;
    }
  }
  return false;
};

const rows = [];   // {line, id, group, code}
for (const b of blocks) {
  const tainted = new Set();
  for (let i = b.from; i <= b.to; i++) {
    const raw = lines[i];
    if (isCommentLine(raw)) {
      if (TAINT_SOURCE.test(raw)) rows.push({ line: i + 1, id: b.id, group: 'C', code: raw.trim() });
      continue;
    }
    if (DECL_OR_ASSIGN.test(raw)) continue;
    const hasSrc = TAINT_SOURCE.test(raw);
    const hasTainted = tainted.size > 0 && refsAny(raw, tainted);
    if (!hasSrc && !hasTainted) continue;

    // ① 代入なら taint を伝播（多段＝`const m = 原文.match(); const cls = m?.[1]; return `…${cls}…`` を追う）
    const decl = raw.match(/\b(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=/);
    if (decl && !/\breturn\b/.test(raw)) {
      tainted.add(decl[1]);
      // 代入行そのものは「原文を読んだ」だけ。群は同ブロックに return があるかで後から決める。
      rows.push({ line: i + 1, id: b.id, group: 'READ', code: raw.trim() });
      continue;
    }
    // ② return に原文（直接 or taint 済み変数）が乗っていれば A＝原文エコー
    if (/\breturn\b/.test(raw)) {
      rows.push({ line: i + 1, id: b.id, group: 'A', code: raw.trim() });
      continue;
    }
    // ③ それ以外で原文に触る行＝分岐の判定など
    rows.push({ line: i + 1, id: b.id, group: 'B', code: raw.trim() });
  }
}
// READ 行は、同じブロックに A があれば A の一部（原文を読んだ地点）、無ければ B（判定にだけ使った）。
const aIds = new Set(rows.filter((r) => r.group === 'A').map((r) => r.id));
for (const r of rows) if (r.group === 'READ') r.group = aIds.has(r.id) ? 'A' : 'B';

// ── live の母集団（A群の id が何ノード / 何カードに出るか）──
const liveByIdNodes = new Map();
const liveByIdCards = new Map();
for (const f of readdirSync(join(root, 'public/data')).filter((x) => /^effects_.*\.json$/.test(x))) {
  const data = JSON.parse(readFileSync(join(root, 'public/data', f), 'utf-8'));
  for (const cardNum of Object.keys(data)) {
    const raw = data[cardNum];
    const effects = Array.isArray(raw) ? raw : (raw?.effects ?? []);
    const walk = (n) => {
      if (!n || typeof n !== 'object') return;
      if (Array.isArray(n)) { n.forEach(walk); return; }
      if (n.type === 'STUB' && typeof n.id === 'string') {
        liveByIdNodes.set(n.id, (liveByIdNodes.get(n.id) ?? 0) + 1);
        if (!liveByIdCards.has(n.id)) liveByIdCards.set(n.id, new Set());
        liveByIdCards.get(n.id).add(cardNum);
      }
      for (const v of Object.values(n)) walk(v);
    };
    effects.forEach(walk);
  }
}
const nodesOf = (id) => liveByIdNodes.get(id) ?? 0;
const cardsOf = (id) => liveByIdCards.get(id)?.size ?? 0;

// ── 集計 ──
const groupA = rows.filter((r) => r.group === 'A' && !ALLOWED.has(r.id));
const groupAllowed = rows.filter((r) => r.group === 'A' && ALLOWED.has(r.id));
const groupB = rows.filter((r) => r.group === 'B');
const groupC = rows.filter((r) => r.group === 'C');

const byId = new Map();
for (const r of groupA) {
  if (!byId.has(r.id)) byId.set(r.id, { lines: [], nodes: nodesOf(r.id), cards: cardsOf(r.id) });
  byId.get(r.id).lines.push(r.line);
}
const idRows = [...byId].sort((a, b) => b[1].nodes - a[1].nodes || a[0].localeCompare(b[0]));
const totalNodes = idRows.reduce((s, [, v]) => s + v.nodes, 0);
const totalCards = new Set(idRows.flatMap(([id]) => [...(liveByIdCards.get(id) ?? [])])).size;

// ── --id / --group ──
if (onlyId) {
  const hit = rows.filter((r) => r.id.includes(onlyId));
  if (hit.length === 0) { console.log(`[census:srcecho] '${onlyId}' に当たる行が無い`); process.exit(0); }
  console.log(`## ${onlyId}  live ${nodesOf(onlyId)}ノード / ${cardsOf(onlyId)}カード`);
  console.log(`   ALLOWED: ${ALLOWED.get(onlyId) ?? '(未登録)'}`);
  for (const r of hit) console.log(`   [${r.group}] ${SRC}:${r.line}  ${r.code.slice(0, 160)}`);
  const cards = [...(liveByIdCards.get(onlyId) ?? [])];
  if (cards.length) console.log(`   カード: ${cards.join(', ')}`);
  process.exit(0);
}
if (onlyGroup) {
  const g = onlyGroup.toUpperCase();
  const hit = rows.filter((r) => r.group === g && (g !== 'A' || !ALLOWED.has(r.id)));
  console.log(`## 群 ${g}: ${hit.length}行`);
  for (const r of hit) console.log(`   ${SRC}:${r.line}  [${r.id}]  ${r.code.slice(0, 140)}`);
  process.exit(0);
}

// ── 明細 ──
const out = [];
const p = (s = '') => out.push(s);
p('===== 原文エコー・センサス（§5.3 O-356・逆翻訳が原文を切り出してそのまま返す箇所） =====');
p('生成: npm run census:srcecho   1 id の内訳: node scripts/censusSrcEcho.mjs --id <STUB_ID>');
p('');
p(`走査対象: ${SRC}`);
p(`  🔴A ECHO  （原文が戻り値に乗る＝本命の worklist）: ${groupA.length}行 / ${idRows.length}id / live ${totalNodes}ノード / ${totalCards}カード`);
p(`    うち原文を返してよいと登録済み（ALLOWED）     : ${groupAllowed.length}行 / ${ALLOWED.size}id`);
p(`  B READ/GUARD（原文を読むが戻り値には乗らない）  : ${groupB.length}行`);
p(`  C COMMENT （コメント）                          : ${groupC.length}行`);
p('');
p('⚠候補出しであって判定ではない＝1件ずつ「payload から同じ意味を組み立てられるか」で判定する。');
p('  組み立てられる → payload から描く分岐へ置換／組み立て不能（引用そのものが中身） → ALLOWED に理由つきで登録。');
p('🔑置換すると逆翻訳が原文と「ずれる」カードが出る＝**退化ではなく可視化**（engine の欠落が初めて見える）。');
p('   原文へ寄せて隠さないこと（逆翻訳は engine が何をするかを描く）。');
p('⚠live 0 の id は parser に生成元が無い＝**触らない・消さない**（安全網）。');
p('');
p('── A群（live 出現の多い順）──');
for (const [id, v] of idRows) {
  p(`  ${String(v.nodes).padStart(4)}ノード ${String(v.cards).padStart(3)}枚  ${id}`);
  p(`        ${SRC}:${v.lines.join(', ')}`);
}
p('');
p('── B群（原文を読むが戻り値には乗らない＝照合は生きている）──');
for (const r of groupB) p(`  ${SRC}:${r.line}  [${r.id}]  ${r.code.slice(0, 120)}`);
writeFileSync(join(root, 'docs/_census_src_echo.txt'), out.join('\n') + '\n');
console.log(out.slice(0, 14).join('\n'));
console.log('明細 → docs/_census_src_echo.txt');

// ── ラチェット ──
// 🔴**0 を目標にしない**＝原文の引用そのものが中身の分岐は `ALLOWED` に落とすのが正で、そちらは件数に出ない。
//   ここで止めるのは「**A群の id 数が増えた**」場合＝**逆翻訳で新しく原文 regex を書いた回**（payload 化と逆）。
//   払い戻したら BASELINE を実測値へ下げる（下げ忘れも exit 1 で気づく）。
// 🔑**数えるのは行数ではなく id 数**＝**払い戻しの単位が「1 id を payload 化する」だから**。
//   行数は同じ意味のまま増減する（`const` を1行に畳む・判定を1行足す）ので基準にすると空振りで止まる。
const BASELINE_ECHO_IDS = 45;  // 2026-09-13 O-356 払い戻し②＝ARTS_COST_REDUCTION_BY_EFFECT（live 59ノード）を撤去＝コストは costJa が cost payload（useTimeCost/costReplacement）から描く。PLAN の「payload なし」分類は STUB ノード単体で数えた誤り（58カード全部 cost 側に payload があった）。 以前＝払い戻し①＝payload を持つ10 id（COPY_LRIG_NAME_ABILITY / DESIGNATE_SIGNI_ZONE / DEPLOY_RESTRICT / GAIN_SIGNI_BARRIER / PICK_FROM_TRASHED_CARDS / COLLAB / DECLARE_CLASS / SET_OPP_SIGNI_AS_TRAP / CAST_FROM_OPP_TRASH / DOWN_UP_SIGNI_AND_CHOOSE）を payload から描いた後の実数。新設時は 56
if (idRows.length > BASELINE_ECHO_IDS) {
  console.error(`\n[census:srcecho] 🔴 GATE FAIL: A群（原文エコー）の id が基準 ${BASELINE_ECHO_IDS} を超えた（現在 ${idRows.length}）`);
  for (const [id, v] of idRows.slice(0, 10)) console.error(`   - ${id}（live ${v.nodes}ノード / ${v.cards}枚・${SRC}:${v.lines[0]}）`);
  console.error('   payload から描く分岐へ置き換えるか、引用そのものが中身なら ALLOWED に理由つきで登録して、npm run regen。');
  process.exit(1);
}
if (idRows.length < BASELINE_ECHO_IDS) {
  console.error(`\n[census:srcecho] 🔴 GATE FAIL: 基準 ${BASELINE_ECHO_IDS} を下回った（現在 ${idRows.length}）`);
  console.error(`   払い戻しは歓迎。BASELINE_ECHO_IDS を ${idRows.length} へ下げてコミットすること（下げ忘れ防止のため止めている）。`);
  process.exit(1);
}
