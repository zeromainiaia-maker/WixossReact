// engine 全文 regex センサス（§5.3 `O-60`・2026-08-26新設）
//   実行: npx tsx scripts/censusEngineText.ts            （明細 docs/_census_enginetext.txt）
//         npx tsx scripts/censusEngineText.ts --id X      （1ハンドラの完全内訳＝原文と regex の当たり外れ）
//
// ねらい＝**engine が「カード全文（EffectText / BurstText）」を regex で読んで意味を決めている箇所**を
// 全数で仕分ける。この形は JSON を見ても何が起きるか分からず、**逆翻訳・census・golden・smoke・fuzz が
// 全部緑のまま意味が壊れる**（§4.3 の「計器に映らない穴」）。`O-56`（`TRAP_OP`/`TRAP_OPERATION`）と
// `O-66`③ が個別に payload 化した手口を、母集団の側から測る計器にしたもの。
//
// 3分類（機械）：
//   A🔴 SELF_TEXT ＝ **効果元自身**（`ctx.sourceCardNum` 等）の全文を読んでいる
//        ＝ parser が payload に落とすべきものを engine が読み直している＝**本命の worklist**
//   B  OTHER_CARD ＝ 効果元以外のカード（対象候補・デッキトップ等）の全文を読んでいる
//        ＝ CSV に構造化列が無い属性（アイコン・キーワード）の判定で、正当な用法が多い
//   C  COMMENT ＝ コメント行（記録のみ）
//
// A群はさらに「regex が実際に外れているか」を測る＝ハンドラ内で txt 変数に適用している regex/includes を
// 全部抜き出し、**live JSON でその STUB id を持つカードの原文**に当てて miss を数える。
// ⚠**miss=0 は「正しい」ではない**＝`O-60` の登録票のとおり「たまたま当たっている」だけで、原文の
//   言い回しが1つ違えば既定値へ落ちる。miss>0 は**いま壊れている**ことの証拠なので優先度が高い、という
//   読み方をする（miss 数は「掘る価値の指標」であって「見込み件数」ではない＝§4.3）。
//
// 🔴**ゲート＝A群の行数が基準値を超えたら exit 1**（ratchet）。新しいハンドラで全文 regex を書いたら止まる。
//   payload 化して減らしたら `BASELINE_SELF_TEXT` を実測値へ下げる（下げ忘れも exit 1 で気づく）。
import { readFileSync, readdirSync, existsSync, writeFileSync } from 'fs';
import { join } from 'path';
import Papa from 'papaparse';

const root = join(import.meta.dirname, '..');
const argv = process.argv.slice(2);
const onlyId = (() => {
  const i = argv.indexOf('--id');
  return i >= 0 ? argv[i + 1] : null;
})();

// ── ratchet ─────────────────────────────────────────────────────────────────
// 2026-08-26 の実測値。**増やしてはいけない**（減らしたらこの数値を下げる）。
// 150 → 149 ＝ §5.3 `O-60` 第1バッチ（`LOOK_OPP_LIFE_TOP`）
// 149 → 146 ＝ 同 第2〜4バッチ（`LRIG_UNDER_CARD_OP` / `COPY_LRIG_NAME_ABILITY` / `DEPLOY_RESTRICT`）。
//   ⚠**行数の減りは「消費地点の数」とは一致しない**＝`COPY_LRIG_NAME_ABILITY` は消費が4地点あったが
//   `EffectText` を読む行は各1本、`DEPLOY_RESTRICT` は2地点＝**撤去した regex は行数より多い**。
// 146 → 143 ＝ 同 第5〜7バッチ（`DOUBLE_POWER_MINUS` / `PLACE_CARD_UNDER_SIGNI` / `TRAP_TO_HAND`）。
// 143 → 142 ＝ 同 第8バッチ（`CONDITIONAL_ARTS_COST`）。⚠**撤去した regex は2本だが行数は1しか減らない**
//   （`EffectText` を読む行＝`txtCAC` の代入1行だけが A群に数えられる）＝**行数は「撤去量」ではない**。
// 142 → 141 ＝ §5.3 `O-87`（`CHOOSE_COLOR_FROM_LIST` の `最大N色`）。「エナゾーンにある色から最大N色まで選ぶ」を
//   typed アクション `SELECT_COLOR{from:'energy',count}` へ移し、engine の全文読みを撤去した（残る枝は固定リスト表記のみ＝live 0）。
// 131 → 130 ＝ §5.3 `O-173` 主群（`POWER_MOD_BY_DISCARD_COUNT_HIGH`）。対象・捨て札filter/上限・単価を
//   `SELECT_TARGET_ONLY`→`TRASH`→`POWER_MODIFY{deltaPerLastProcessedCount}` の payload へ移した。
const BASELINE_SELF_TEXT = 130;

// ── 1) engine を全走査して EffectText 読み出しを拾う ────────────────────────
type Row = {
  file: string; line: number; handler: string; cls: 'SELF_TEXT' | 'OTHER_CARD' | 'COMMENT';
  varName: string | null; snippet: string; literals: string[];
  /** この読み出し地点へ到達する条件（変数ごとの id 集合）。同一変数＝OR・別変数＝AND。 */
  gates: Map<string, Set<string>>;
};
const rows: Row[] = [];
const engineDir = join(root, 'src/engine');
for (const f of readdirSync(engineDir).filter(n => n.endsWith('.ts'))) {
  const lines = readFileSync(join(engineDir, f), 'utf-8').split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].includes('EffectText')) continue;
    const trimmed = lines[i].trim();
    const isComment = /^(\/\/|\*|\/\*)/.test(trimmed);

    // ── 到達条件（gates）の収集 ──
    // ⚠**素朴に「直近の `stub.id === 'X'`」だけを見ると母集団が化ける**（初版がこれで誤検出した）＝
    //   ディスパッチャの分岐の**内側**に `stubN.id === 'Y' && contN.id === 'Z'` のような入れ子の門があり、
    //   実際にこのコードへ来るのは **その全部を満たすカードだけ**。`OPPONENT_PAY_OPTIONAL`（live 78効果）
    //   に見えた地点の真の到達条件は `OPTIONAL_TRASH_ENERGY_CLASS` ＋ `ARTS_EXTRA_COST_CONDITION` の
    //   隣接だった＝母集団を70カードと数えて miss 68 の偽の1位になっていた。
    // 規約＝**同じ変数への `=== 'X'` は OR（`stub.id === 'A' || stub.id === 'B'`）／別変数どうしは AND**。
    const gates = new Map<string, Set<string>>();
    const addGate = (v: string, id: string) => {
      if (!gates.has(v)) gates.set(v, new Set());
      gates.get(v)!.add(id);
    };
    // 🔴**後方へ1回だけ走査し、ディスパッチャ（`stub.id === 'X'`）に当たったら必ず打ち切る**。
    //   打ち切らずに固定幅の窓で拾うと、**直前の兄弟ハンドラの `if (stub.id === 'PREV')` を門として
    //   数えてしまう**（`LOOK_OPP_LIFE_TOP` が `REVEAL_EACH_PLAYER_DECK_TOP` との AND に化けた）。
    let handler = '(top)';
    for (let j = i; j >= 0 && j > i - 500; j--) {
      const g = /\b(\w+)\.id\s*===\s*'([A-Z0-9_]+)'/g;
      let mg: RegExpExecArray | null;
      let dispatcher = false;
      while ((mg = g.exec(lines[j]))) {
        addGate(mg[1], mg[2]);
        if (mg[1] === 'stub') dispatcher = true;
      }
      if (dispatcher) { handler = [...(gates.get('stub') ?? [])].join('|'); break; }
      const cs = lines[j].match(/^\s*case\s+'([A-Za-z0-9_]+)'\s*:/);
      if (cs) { handler = 'case:' + cs[1]; break; }
      const fn = lines[j].match(/^(?:export\s+)?(?:async\s+)?function\s+(\w+)/);
      if (fn) { handler = 'fn:' + fn[1]; break; }
    }
    // 入れ子の門があるならラベルにも出す（母集団はそちらで絞る）
    const nested = [...gates.entries()].filter(([v]) => v !== 'stub');
    if (nested.length) handler = [handler, ...nested.map(([, s]) => [...s].join('|'))].filter(x => x && x !== '(top)').join(' + ');

    // 読んでいるカードが「効果元自身」か（代入行の前後3行で判定）
    const win = lines.slice(Math.max(0, i - 3), i + 2).join('\n');
    const isSelf = /sourceCardNum|sourceCard\b|srcCard\b|ctx\.sourceCard/.test(win);
    const varName = lines[i].match(/const\s+(\w+)\s*=/)?.[1] ?? null;

    // その変数に適用している regex / includes リテラルを、ハンドラ末尾まで走査して収集
    const literals: string[] = [];
    if (varName) {
      for (let k = i + 1; k < Math.min(lines.length, i + 250); k++) {
        if (/stub\.id\s*===\s*'/.test(lines[k])) break;                    // 次のハンドラで打ち切り
        if (/^(export\s+)?function\s/.test(lines[k])) break;
        const re = new RegExp('\\b' + varName + '\\b\\s*\\.\\s*(match|search|split)\\s*\\(/');
        if (re.test(lines[k])) {
          const src = extractRegexLiteral(lines[k], lines[k].search(re));
          if (src) literals.push('re:' + src);
        }
        const inc = new RegExp('\\b' + varName + '\\b\\s*\\.\\s*(includes|startsWith)\\s*\\((["\'`])((?:\\\\.|(?!\\2).)*)\\2', 'g');
        let mi: RegExpExecArray | null;
        while ((mi = inc.exec(lines[k]))) literals.push('str:' + mi[3]);
        // `/…/.test(txt)` 形
        if (new RegExp('\\.test\\s*\\(\\s*' + varName + '\\s*\\)').test(lines[k])) {
          const src = extractRegexLiteral(lines[k], 0);
          if (src) literals.push('re:' + src);
        }
      }
    }
    rows.push({
      file: f, line: i + 1, handler,
      cls: isComment ? 'COMMENT' : isSelf ? 'SELF_TEXT' : 'OTHER_CARD',
      varName, snippet: trimmed.slice(0, 130), literals, gates,
    });
  }
}

/** 行の from 以降から最初の `/…/` 正規表現リテラルの中身を取り出す（文字クラス内の `/` を無視）。 */
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

// ── 2) live JSON の STUB 母集団 ─────────────────────────────────────────────
const SHEETS = ['misc', 'WX', 'WX24_26', 'WXDi', 'WXK'];
const liveCount = new Map<string, number>();
const liveCards = new Map<string, Set<string>>();
for (const s of SHEETS) {
  const data = JSON.parse(readFileSync(join(root, `public/data/effects_${s}.json`), 'utf-8')) as Record<string, unknown[]>;
  for (const [cardNum, effects] of Object.entries(data)) {
    const walk = (o: unknown): void => {
      if (!o || typeof o !== 'object') return;
      if (Array.isArray(o)) { o.forEach(walk); return; }
      const rec = o as Record<string, unknown>;
      if (rec.type === 'STUB' && typeof rec.id === 'string') {
        liveCount.set(rec.id, (liveCount.get(rec.id) ?? 0) + 1);
        if (!liveCards.has(rec.id)) liveCards.set(rec.id, new Set());
        liveCards.get(rec.id)!.add(cardNum);
      }
      for (const v of Object.values(rec)) walk(v);
    };
    (effects ?? []).forEach(walk);
  }
}

// ── 3) カード原文（EffectText + BurstText） ─────────────────────────────────
const cardText = new Map<string, string>();
for (const p of [...Array.from({ length: 11 }, (_, i) => `public/data/CardData_Sheet${i + 1}.csv`), 'public/data/CardData_TK.csv']) {
  const full = join(root, p);
  if (!existsSync(full)) continue;
  const { data } = Papa.parse<Record<string, string>>(readFileSync(full, 'utf-8').replace(/^﻿/, ''), { header: true, skipEmptyLines: true });
  for (const r of data) if (r.CardNum) cardText.set(r.CardNum, (r.EffectText ?? '') + ' ' + (r.BurstText ?? ''));
}
const baseNum = (n: string) => n.replace(/-[A-Z]+\d*$/, '');
const textOf = (n: string) => cardText.get(n) ?? cardText.get(baseNum(n)) ?? '';

// ── 4) ハンドラ単位に畳んで miss を測る ─────────────────────────────────────
type H = { handler: string; lines: Row[]; literals: string[]; effects: number; cards: string[]; missCards: string[]; gates: Map<string, Set<string>> };
const selfRows = rows.filter(r => r.cls === 'SELF_TEXT');
const handlers = new Map<string, H>();
for (const r of selfRows) {
  if (!handlers.has(r.handler)) handlers.set(r.handler, { handler: r.handler, lines: [], literals: [], effects: 0, cards: [], missCards: [], gates: new Map() });
  const h = handlers.get(r.handler)!;
  h.lines.push(r);
  for (const l of r.literals) if (!h.literals.includes(l)) h.literals.push(l);
  for (const [v, ids] of r.gates) {
    if (!h.gates.has(v)) h.gates.set(v, new Set());
    for (const id of ids) h.gates.get(v)!.add(id);
  }
}
for (const h of handlers.values()) {
  // 母集団＝gates の **変数ごとに OR（union）→ 変数どうしは AND（intersection）**
  let pop: Set<string> | null = null;
  let popEffects = 0;
  for (const [, ids] of h.gates) {
    const u = new Set<string>();
    let n = 0;
    for (const id of ids) { for (const c of liveCards.get(id) ?? []) u.add(c); n += liveCount.get(id) ?? 0; }
    pop = pop === null ? u : new Set([...pop].filter(c => u.has(c)));
    popEffects = popEffects === 0 ? n : Math.min(popEffects, n);
  }
  h.effects = popEffects;
  h.cards = [...(pop ?? new Set<string>())].sort();
  for (const c of h.cards) {
    const t = textOf(c);
    // 🔴**miss ＝ 抽出したリテラルが「1本も」当たらない**（`some` ではなく `every`）。
    //   ハンドラは同じ意味の言い回しを複数の regex で受けるのが普通なので、「1本外れた」を miss に
    //   すると母集団がまるごと赤くなって計器として使えない（初版がこれで 359 件を誤検出した）。
    //   1本も当たらない＝engine は原文から何も読めず**既定値へ落ちている**＝確実に危ない。
    const miss = h.literals.length > 0 && h.literals.every(l => {
      try {
        if (l.startsWith('str:')) return !t.includes(l.slice(4));
        return !new RegExp(l.slice(3)).test(t);
      } catch { return false; }
    });
    if (miss) h.missCards.push(c);
  }
}

// ── 5) 出力 ─────────────────────────────────────────────────────────────────
const nSelf = selfRows.length;
const nOther = rows.filter(r => r.cls === 'OTHER_CARD').length;
const nComment = rows.filter(r => r.cls === 'COMMENT').length;

if (onlyId) {
  const h = handlers.get(onlyId);
  if (!h) { console.error(`[census:enginetext] ハンドラ '${onlyId}' は A群に無い`); process.exit(1); }
  console.log(`=== ${onlyId} ===`);
  console.log(`読み出し地点: ${h.lines.map(l => `${l.file}:${l.line}`).join(', ')}`);
  console.log(`live: ${h.effects}効果 / ${h.cards.length}カード`);
  console.log(`適用リテラル(${h.literals.length}):`);
  for (const l of h.literals) console.log(`  ${l}`);
  console.log(`\n--- カード別 当たり外れ ---`);
  for (const c of h.cards) {
    const t = textOf(c);
    const hits = h.literals.map(l => {
      try {
        const ok = l.startsWith('str:') ? t.includes(l.slice(4)) : new RegExp(l.slice(3)).test(t);
        return `${ok ? 'o' : 'X'} ${l}`;
      } catch { return `? ${l}`; }
    });
    console.log(`\n[${c}] ${t.replace(/\s+/g, ' ').slice(0, 200)}`);
    for (const x of hits) console.log(`    ${x}`);
  }
  process.exit(0);
}

const ranked = [...handlers.values()].sort((a, b) =>
  (b.missCards.length - a.missCards.length) || (b.effects - a.effects) || a.handler.localeCompare(b.handler));

let out = '';
out += `# engine 全文 regex センサス（O-60）\n`;
out += `A🔴 SELF_TEXT（効果元の全文で意味を決める）: ${nSelf}行 / ${handlers.size}ハンドラ\n`;
out += `B  OTHER_CARD（他カードの属性判定）      : ${nOther}行\n`;
out += `C  COMMENT                              : ${nComment}行\n`;
out += `合計 ${rows.length}行\n\n`;
out += `## A群ランキング（miss降順→live効果数降順）\n`;
out += `miss = live でこのハンドラへ来るカードのうち、抽出した regex/includes の 1本以上が原文に当たらないもの\n`;
out += `      ＝いま既定値へフォールバックしている＝**現に壊れている可能性が高い**\n\n`;
out += `| ハンドラ | 行 | live効果 | liveカード | リテラル | miss |\n|---|---|---|---|---|---|\n`;
for (const h of ranked) {
  out += `| ${h.handler} | ${h.lines.map(l => `${l.file}:${l.line}`).join(' ')} | ${h.effects} | ${h.cards.length} | ${h.literals.length} | ${h.missCards.length} |\n`;
}
out += `\n## A群 明細\n`;
for (const h of ranked) {
  out += `\n### ${h.handler}  (live ${h.effects}効果 / ${h.cards.length}カード / miss ${h.missCards.length})\n`;
  for (const l of h.lines) out += `  ${l.file}:${l.line}  ${l.snippet}\n`;
  for (const l of h.literals) out += `    lit ${l}\n`;
  if (h.missCards.length) out += `    miss: ${h.missCards.join(', ')}\n`;
}
out += `\n## B群（他カードの属性判定＝正当寄り）\n`;
for (const r of rows.filter(x => x.cls === 'OTHER_CARD')) out += `  ${r.file}:${r.line} <${r.handler}> ${r.snippet}\n`;

writeFileSync(join(root, 'docs/_census_enginetext.txt'), out, 'utf-8');

console.log(`[census:enginetext] A🔴 SELF_TEXT ${nSelf}行 / ${handlers.size}ハンドラ・B ${nOther}行・C ${nComment}行（明細 docs/_census_enginetext.txt）`);
const missTotal = ranked.filter(h => h.missCards.length > 0);
console.log(`[census:enginetext] regex が実際に外れているハンドラ: ${missTotal.length}（miss カード計 ${missTotal.reduce((s, h) => s + h.missCards.length, 0)}）`);
console.log(`  上位: ${ranked.slice(0, 8).map(h => `${h.handler}(miss${h.missCards.length}/live${h.effects})`).join(', ')}`);

if (nSelf > BASELINE_SELF_TEXT) {
  console.error(`\n[census:enginetext] 🔴 GATE FAIL: A群が基準 ${BASELINE_SELF_TEXT} を超えた（現在 ${nSelf}）`);
  console.error(`  engine で「効果元の EffectText を regex で読む」新しい箇所が増えている。`);
  console.error(`  parser が判別子を payload へ吐き、engine は payload で分岐する形にする（§5.3 O-60 / O-56 が雛形）。`);
  process.exit(1);
}
if (nSelf < BASELINE_SELF_TEXT) {
  console.error(`\n[census:enginetext] 🔴 GATE FAIL: A群が基準 ${BASELINE_SELF_TEXT} を下回った（現在 ${nSelf}）`);
  console.error(`  払い戻しは歓迎。BASELINE_SELF_TEXT を ${nSelf} へ下げてコミットすること（下げ忘れ防止のため止めている）。`);
  process.exit(1);
}
