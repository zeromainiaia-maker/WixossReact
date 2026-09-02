// UI コスト層の全文 regex センサス（§5.3 `O-86`・2026-09-02新設）
//   実行: npx tsx scripts/censusCostText.ts            （明細 docs/_census_costtext.txt）
//         npx tsx scripts/censusCostText.ts --id <部分文字列>   （1規則の完全内訳＝当たっているカード全部）
//
// ねらい＝**「カードを使うときの実効コスト」を UI 層が原文 regex で決めている箇所**を全数で測る。
//
// 🔴**なぜ `census:enginetext`（`O-60`）では映らないか**＝あちらは `src/engine/` しか走査しない。
//   コストの置換・軽減・追加は **`src/screens/battle/costs.ts` ほかの UI 層**が
//   `card.EffectText` を毎回読み直して決めている＝**A群の数字が0になってもコストの意味は原文 regex のまま**。
//   `O-86` の登録票が「①まず計器を作る ②母集団を実測 ③payload 化」という順を指定しているのはこのため。
//
// 何を数えるか＝**「原文（`EffectText`）に当てている regex / includes リテラル」1本ずつの母集団**。
//   ⚠**「当たっているカード数」であって「壊れている件数」ではない**（`census:enginetext` の miss と同じ読み方）。
//   規則が**1枚も当たらない**（live 0）なら、その規則は**死んでいる**か原文の言い回しが変わった証拠なので
//   `O-86` の中で先に片付けられる（＝撤去できる）。逆に多数当たっている規則は
//   「payload 化したときに壊す範囲」がそのまま母集団になる。
//
// 分類（機械）：
//   A🔴 COST     ＝ 実効コスト（置換／軽減／追加／使用時の任意支払い）を決める規則＝**本命の worklist**
//   B  GATE      ＝ 使用可否・グロウ可否だけを決める規則（コストの値は動かさない）
//   C  OTHER     ＝ 上記以外（表示・フォールバック判定など）
//
// 🔴**ゲート＝A群の規則本数が基準値を超えたら exit 1**（ratchet）。UI 層で新しく原文 regex を書いたら止まる。
//   payload 化して減らしたら `BASELINE_COST_RULES` を実測値へ下げる（下げ忘れも exit 1 で気づく）。
import { readFileSync, readdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import Papa from 'papaparse';

const root = join(import.meta.dirname, '..');
const argv = process.argv.slice(2);
const onlyId = (() => {
  const i = argv.indexOf('--id');
  return i >= 0 ? argv[i + 1] : null;
})();

// ── ratchet ─────────────────────────────────────────────────────────────────
// 2026-09-02 の実測値。**増やしてはいけない**（減らしたらこの数値を下げる）。
// 50 → 45 ＝ 新設と同じ巡（`O-86` 第1バッチ）で**死に規則5本**（`《X》を〈N〉つ少なくする` 形）を撤去した分。
//   実データの言い回しは「減る」だけで、`つ少` を含むカードは全 CSV で 0枚だった＝**挙動は不変**。
const BASELINE_COST_RULES = 45;

/**
 * 走査対象＝**カードを使うときのコストと可否を決める UI 層**。
 * ⚠`DeckEditorScreen.tsx` は対戦の外なので入れない。`modals/` は表示だけで、判定は下の4本へ集約されている。
 */
const TARGETS: { file: string; cls: 'COST' | 'GATE' | 'OTHER' }[] = [
  { file: 'src/screens/battle/costs.ts', cls: 'COST' },
  { file: 'src/screens/battle/useTimeCost.ts', cls: 'COST' },
  { file: 'src/screens/battle/artsUseGate.ts', cls: 'COST' },
  { file: 'src/screens/battle/growLogic.ts', cls: 'GATE' },
  { file: 'src/screens/battle/lrigActivateGate.ts', cls: 'GATE' },
  { file: 'src/screens/battle/pieceCutin.ts', cls: 'GATE' },
  { file: 'src/screens/BattleScreen.tsx', cls: 'OTHER' },
];

/** `costs.ts` の中でも「コストの値を動かさない」関数は B へ落とす（マルチエナ判定など）。 */
const GATE_FUNCS = new Set(['isMultiEna', 'isEnaMultiStripped', 'hasMultiEnaGrant']);

type Rule = {
  file: string; line: number; fn: string; cls: 'COST' | 'GATE' | 'OTHER';
  kind: 're' | 'includes'; src: string;
};

function extractRegexLiteral(line: string, from: number): string | null {
  const start = line.indexOf('/', from);
  if (start < 0) return null;
  let inClass = false;
  for (let p = start + 1; p < line.length; p++) {
    const c = line[p];
    if (c === '\\') { p++; continue; }
    if (c === '[') inClass = true;
    else if (c === ']') inClass = false;
    else if (c === '/' && !inClass) return line.slice(start + 1, p);
  }
  return null;
}

// ── 1) UI 層を走査して「原文に当てている規則」を拾う ────────────────────────
//
// 🔑**原文由来の変数を追跡する**＝`const text = card.EffectText ?? '';` のような代入を見つけ、
//   以後その変数へ当てている regex / includes を規則として数える。
//   ⚠**素朴に「ファイル内の全 regex」を数えると桁で過大に出る**（コスト文字列 `《赤》×2` を刻む
//   `parseGrowCost` 系の regex まで混ざる）＝**原文に当てているものだけ**が `O-86` の母集団。
//
// 🔴**行ごとに読むと桁で取りこぼす**（初版で2回踏んだ）＝
//   ①ネストした arrow const（`const toCostStr = (raw: string) => …`）を関数境界と誤認して
//     追跡中の変数が消える ②`text.match(new RegExp(\`…${'${'}RED}…\`))` の**テンプレ regex**と
//     **複数行にまたがる呼び出し**が1本も拾えない（`costs.ts` だけで7本ある）。
//   ⇒ **ファイル全体を1つの文字列として走査**し、テンプレ内の `${'${'}定数}` は
//     同じファイルの `const 名 = '…'` から解決する。
const rules: Rule[] = [];
for (const { file, cls } of TARGETS) {
  const src = readFileSync(join(root, file), 'utf-8');
  const lineAt = (idx: number) => src.slice(0, idx).split('\n').length;

  // 同ファイルの文字列定数（テンプレ regex の `${NAME}` 解決用）
  const consts = new Map<string, string>();
  for (const m of src.matchAll(/^\s*const\s+(\w+)\s*=\s*'((?:\\.|[^'])*)'\s*;/gm)) consts.set(m[1], m[2]);

  // トップレベル関数の開始位置（規則をどの関数に帰属させるか）
  const fnStarts: { at: number; name: string }[] = [];
  for (const m of src.matchAll(/^(?:export\s+)?(?:async\s+)?function\s+(\w+)/gm)) fnStarts.push({ at: m.index!, name: m[1] });
  for (const m of src.matchAll(/^(?:export\s+)?const\s+(\w+)\s*[:=][^\n]*=>/gm)) fnStarts.push({ at: m.index!, name: m[1] });
  fnStarts.sort((a, b) => a.at - b.at);
  const fnOf = (idx: number) => {
    let name = '(top)';
    for (const f of fnStarts) { if (f.at > idx) break; name = f.name; }
    return name;
  };

  // 原文由来の変数名（`const text = card.EffectText ?? ''` 等）＋原文プロパティそのもの
  const vars = new Set<string>();
  for (const m of src.matchAll(/\bconst\s+(\w+)\s*=\s*[^;\n]*\bEffectText\b/g)) vars.add(m[1]);
  // 🔑**原文を「引数で受け取る」関数も数える**（`parseUseTimeCostReduction(effectText)` /
  //   `parseBetOptions(effectText)` ほか）＝呼び出し側が `card.EffectText ?? ''` を渡している。
  //   ⚠これを落とすと `costs.ts` の `parse*` 群と `useTimeCost.ts` が丸ごと母集団から消える。
  for (const m of src.matchAll(/\(\s*(effectText|rawText)\s*:\s*string/g)) vars.add(m[1]);
  const varAlt = [...vars].map(v => v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  // 「原文を指す式」＝追跡した変数、または `…EffectText …` を含む短い式
  const TEXT = varAlt ? `(?:${varAlt}|[\\w.?\\s()'??]*EffectText[\\w.?\\s()'??]*)` : `[\\w.?\\s()'??]*EffectText[\\w.?\\s()'??]*`;

  const push = (idx: number, kind: 're' | 'includes', body: string): void => {
    if (!body) return;
    // コメント行は数えない
    const lineStart = src.lastIndexOf('\n', idx) + 1;
    if (/^\s*(\/\/|\*|\/\*)/.test(src.slice(lineStart, idx))) return;
    const fn = fnOf(idx);
    rules.push({ file, line: lineAt(idx), fn, cls: clsOf(cls, fn), kind, src: body });
  };

  // (a) `<text>.match(/…/)` / `.search(/…/)` / `.split(/…/)`
  for (const m of src.matchAll(new RegExp(`${TEXT}\\.\\s*(?:match|search|split)\\s*\\(\\s*/`, 'g'))) {
    push(m.index!, 're', extractRegexLiteral(src, m.index! + m[0].length - 1) ?? '');
  }
  // (b) `/…/.test(<text>)`
  for (const m of src.matchAll(new RegExp(`/(?:\\\\.|\\[(?:\\\\.|[^\\]])*\\]|[^/\\n])+/\\w*\\s*\\.\\s*test\\s*\\(\\s*${TEXT}\\s*\\)`, 'g'))) {
    push(m.index!, 're', extractRegexLiteral(m[0], 0) ?? '');
  }
  // (c) `<text>.includes('…')` / `.startsWith('…')`
  for (const m of src.matchAll(new RegExp(`${TEXT}\\.\\s*(?:includes|startsWith)\\s*\\(\\s*(['"\`])((?:\\\\.|(?!\\1)[^\\n])*)\\1`, 'g'))) {
    push(m.index!, 'includes', m[2]);
  }
  // (d) 🔑**テンプレ regex**＝`<text>.match(new RegExp(\`…\`))`（複数行可）。`${NAME}` は同ファイルの定数で解く。
  for (const m of src.matchAll(new RegExp(`${TEXT}\\.\\s*match\\s*\\(\\s*new RegExp\\(\\s*\`((?:\\\\.|[^\`])*)\``, 'g'))) {
    const body = m[1].replace(/\$\{(\w+)\}/g, (_s, name: string) => consts.get(name) ?? '(?:.*)');
    push(m.index!, 're', body);
  }
  // (e) `new RegExp(\`…\`).test(<text>)`
  for (const m of src.matchAll(new RegExp(`new RegExp\\(\\s*\`((?:\\\\.|[^\`])*)\`\\s*\\)\\s*\\.\\s*test\\s*\\(\\s*${TEXT}`, 'g'))) {
    const body = m[1].replace(/\$\{(\w+)\}/g, (_s, name: string) => consts.get(name) ?? '(?:.*)');
    push(m.index!, 're', body);
  }
}
function clsOf(fileCls: 'COST' | 'GATE' | 'OTHER', fn: string): 'COST' | 'GATE' | 'OTHER' {
  return GATE_FUNCS.has(fn) ? 'GATE' : fileCls;
}

// 同じ規則が複数行に出ることがあるので (src, fn) で一意化する
const seen = new Set<string>();
const uniq = rules.filter(r => {
  const k = `${r.cls} ${r.fn} ${r.kind} ${r.src}`;
  if (seen.has(k)) return false;
  seen.add(k);
  return true;
});

// ── 2) 全カードの原文に当てて母集団を測る ───────────────────────────────────
type Card = { CardNum: string; CardName: string; Type: string; EffectText: string };
const cards: Card[] = [];
for (const f of readdirSync(join(root, 'public/data')).filter(n => /^CardData_.*\.csv$/.test(n)).sort()) {
  const parsed = Papa.parse<Record<string, string>>(readFileSync(join(root, 'public/data', f), 'utf-8'), {
    header: true, skipEmptyLines: true,
  });
  for (const r of parsed.data) {
    const num = (r.CardNum ?? '').trim();
    if (!num || cards.some(c => c.CardNum === num)) continue;
    cards.push({ CardNum: num, CardName: r.CardName ?? '', Type: r.Type ?? '', EffectText: r.EffectText ?? '' });
  }
}

// 🔑**payload で裏打ちされているか**＝`computeArtsEffectiveCost` は
//   「`costScaling` が評価できたら下の全文 regex 群を通さない」構造なので、**payload を持つカードは
//   既に regex から降りている**。⇒ `O-86` の真の worklist は「規則に当たる ∧ payload が無い」カード。
//   ⚠`conditionalEnergyReduction`（能力スコープの条件つき減額）も同じく payload 側。
const SHEETS = ['misc', 'WX', 'WX24_26', 'WXDi', 'WXK'];
const payloadCards = new Set<string>();
for (const s of SHEETS) {
  const data = JSON.parse(readFileSync(join(root, `public/data/effects_${s}.json`), 'utf-8')) as Record<string, unknown[]>;
  for (const [cardNum, effects] of Object.entries(data)) {
    const json = JSON.stringify(effects);
    if (json.includes('"costScaling"') || json.includes('"conditionalEnergyReduction"')) payloadCards.add(cardNum);
  }
}

const hits = new Map<Rule, Card[]>();
for (const r of uniq) {
  let match: (t: string) => boolean;
  if (r.kind === 'includes') match = (t) => t.includes(r.src);
  else {
    let re: RegExp;
    try { re = new RegExp(r.src); } catch { hits.set(r, []); continue; }
    match = (t) => re.test(t);
  }
  hits.set(r, cards.filter(c => c.EffectText && match(c.EffectText)));
}

// ── 3) 出力 ────────────────────────────────────────────────────────────────
const byCls = (c: 'COST' | 'GATE' | 'OTHER') => uniq.filter(r => r.cls === c);
const costRules = byCls('COST');
const distinct = (rs: Rule[]) => new Set(rs.flatMap(r => (hits.get(r) ?? []).map(c => c.CardNum)));

if (onlyId) {
  const picked = uniq.filter(r => r.src.includes(onlyId) || r.fn.includes(onlyId) || `${r.file}:${r.line}`.includes(onlyId));
  if (picked.length === 0) { console.error(`[census:costtext] 該当なし: ${onlyId}`); process.exit(1); }
  for (const r of picked) {
    const hs = hits.get(r) ?? [];
    console.log(`\n=== ${r.cls} ${r.file}:${r.line} ${r.fn}  (${r.kind})`);
    console.log(`  ${r.src}`);
    console.log(`  当たり ${hs.length}カード`);
    for (const c of hs) console.log(`    ${c.CardNum} ${c.CardName} [${c.Type}]`);
  }
  process.exit(0);
}

const lines: string[] = [];
lines.push('# UI コスト層の全文 regex センサス（§5.3 `O-86`）');
lines.push('');
lines.push('⚠**「当たっているカード数」であって「壊れている件数」ではない**。live 0 の規則は死に規則（先に撤去できる）。');
lines.push('');
for (const cls of ['COST', 'GATE', 'OTHER'] as const) {
  const rs = byCls(cls).slice().sort((a, b) => (hits.get(b)!.length - hits.get(a)!.length));
  lines.push(`## ${cls === 'COST' ? 'A🔴 COST' : cls === 'GATE' ? 'B GATE' : 'C OTHER'}  ${rs.length}規則 / 当たり ${distinct(rs).size}カード`);
  lines.push('');
  lines.push('| 当たり | payload無 | 場所 | 関数 | 規則 |');
  lines.push('|---:|---:|---|---|---|');
  for (const r of rs) {
    const hs = hits.get(r)!;
    const bare = hs.filter(c => !payloadCards.has(c.CardNum)).length;
    const src = r.src.replace(/\|/g, '\\|').slice(0, 160);
    lines.push(`| ${hs.length} | ${bare} | ${r.file.replace('src/screens/', '')}:${r.line} | ${r.fn} | \`${r.kind === 're' ? '/' + src + '/' : "'" + src + "'"}\` |`);
  }
  lines.push('');
  const dead = rs.filter(r => hits.get(r)!.length === 0);
  if (dead.length) {
    lines.push(`### 🔴 live 0件（死に規則）: ${dead.length}本`);
    for (const r of dead) lines.push(`- ${r.file.replace('src/screens/', '')}:${r.line} ${r.fn} \`${r.src.slice(0, 120)}\``);
    lines.push('');
  }
}
writeFileSync(join(root, 'docs/_census_costtext.txt'), lines.join('\n'), 'utf-8');

const costDistinct = distinct(costRules);
// 🔑**真の worklist ＝「規則に当たる ∧ コスト payload が無い」カード**。
//   `computeArtsEffectiveCost` は `costScaling` が評価できたら下の全文 regex 群を通さないので、
//   payload を持つカードは**既に regex から降りている**（＝`O-86` の残作業ではない）。
const costBare = new Set([...costDistinct].filter(n => !payloadCards.has(n)));
const costDead = costRules.filter(r => hits.get(r)!.length === 0);
console.log(`[census:costtext] A🔴 COST ${costRules.length}規則 / 当たり ${costDistinct.size}カード`
  + `・B GATE ${byCls('GATE').length}規則 / ${distinct(byCls('GATE')).size}カード`
  + `・C OTHER ${byCls('OTHER').length}規則 / ${distinct(byCls('OTHER')).size}カード（明細 docs/_census_costtext.txt）`);
console.log(`[census:costtext] 🔑 うち コスト payload が無い＝O-86 の真の worklist: ${costBare.size}カード`
  + `（payload 済み ${costDistinct.size - costBare.size}カードは既に regex から降りている）`);
console.log(`[census:costtext] 🔴 A群の死に規則（live 0件）: ${costDead.length}本`
  + (costDead.length ? `  → ${costDead.slice(0, 6).map(r => `${r.fn}@${r.line}`).join(', ')}` : ''));
const top = costRules.slice().sort((a, b) => hits.get(b)!.length - hits.get(a)!.length).slice(0, 8);
console.log('  上位: ' + top.map(r => `${r.fn}@${r.line}(${hits.get(r)!.length})`).join(', '));

if (costRules.length > BASELINE_COST_RULES) {
  console.error(`\n[census:costtext] 🔴 GATE FAIL: A群の規則本数が基準 ${BASELINE_COST_RULES} を超えた（現在 ${costRules.length}）`);
  console.error('  UI 層で新しく原文 regex を書いた＝payload 化の方向と逆。parser 側へ寄せること（§5.3 `O-86`）。');
  process.exit(1);
}
if (costRules.length < BASELINE_COST_RULES) {
  console.error(`\n[census:costtext] 🔴 GATE FAIL: A群の規則本数が基準 ${BASELINE_COST_RULES} を下回った（現在 ${costRules.length}）`);
  console.error(`  払い戻しは歓迎。BASELINE_COST_RULES を ${costRules.length} へ下げてコミットすること（下げ忘れ防止のため止めている）。`);
  process.exit(1);
}
