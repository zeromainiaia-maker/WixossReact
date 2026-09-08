/**
 * 意味照合監査（semantic audit）: 段 O-A「triage」のバッチ抽出（Codex 委譲用）
 *
 * semanticAuditPool.mjs が数えている「未 triage の finding」を、カード単位に束ねて
 * <out>/prompts/batch_NN.txt を作る。生成したプロンプトは semanticAuditRunCodex.mjs で
 * そのまま流せる（出力スキーマを監査バッチと同じ {results:[{cardNum,findings:[...]}]} にしてある）。
 *
 * 🔴なぜ「監査」と別のツールなのか
 *   監査（semanticAuditExtract.mjs）は **JSON と原文しか見ない**。だから precision が 50〜84% で振れ、
 *   偽陽性は全部「engine が JSON の見た目を裏で読み替えている」型になる（PLAN §5.0 / LESSONS §4.7）。
 *   triage は **engine の受け皿を読む工程**であり、読める実行環境（= リポジトリ内で grep できる Codex）が要る。
 *
 * 🔴安全側の非対称ルール（プロンプトにも書いてある）
 *   FP（偽陽性）と断定してよいのは **engine の該当行を file:line で引用できたときだけ**。
 *   引用できなければ UNKNOWN にする。理由＝**BUG の誤判定は実装時に気付くが、FP の誤判定は
 *   真バグをプールから恒久的に消す**（triaged.txt に書いた瞬間どの計器からも見えなくなる）。
 *
 * 使い方:
 *   node scripts/semanticAuditTriageExtract.mjs --out <dir> [--per-batch 8] [--limit 40] [--severity HIGH]
 *   node scripts/semanticAuditRunCodex.mjs --out <dir> --batches 1,2,3
 */
import fs from 'fs';
import path from 'path';
import Papa from 'papaparse';

const args = process.argv.slice(2);
const argOf = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const outDir = argOf('--out', null);
if (!outDir) { console.error('--out <dir> は必須'); process.exit(1); }
const perBatch = Number(argOf('--per-batch', '8'));
const limit = Number(argOf('--limit', '0')) || Infinity;
const sevFilter = argOf('--severity', null);

const SCRATCH = 'scripts/archive/scratchpad';
// 旧4ラウンドは台帳（semanticAuditLedger.mjs）が所有＝pool と同じ除外規約（足すと二重計上）
const LEDGER_ROUNDS = ['semantic_audit_101', 'semantic_audit_clean_round1', 'semantic_audit_stub_round2', 'semantic_audit_stub_round3'];

const rounds = fs.readdirSync(SCRATCH)
  .filter((d) => d.startsWith('semantic_audit') && fs.existsSync(`${SCRATCH}/${d}/findings.jsonl`))
  .filter((d) => !LEDGER_ROUNDS.includes(d));

const open = [];
for (const d of rounds) {
  const base = `${SCRATCH}/${d}`;
  const done = new Set();
  if (fs.existsSync(`${base}/triaged.txt`)) {
    for (const l of fs.readFileSync(`${base}/triaged.txt`, 'utf8').split('\n')) {
      const k = l.split('::')[0].trim();
      if (k && !k.startsWith('#')) done.add(k);
    }
  }
  for (const l of fs.readFileSync(`${base}/findings.jsonl`, 'utf8').split('\n')) {
    if (!l.trim()) continue;
    let f; try { f = JSON.parse(l); } catch { continue; }
    const key = f.effectId || f.cardNum;
    if (done.has(key) || done.has(f.cardNum)) continue;
    if (sevFilter && f.severity !== sevFilter) continue;
    open.push({ ...f, round: d });
  }
}

// カード単位に束ねる（同じカードの findings は同じバッチに入れる＝JSON を1回しか載せない）
const byCard = new Map();
for (const f of open) {
  if (!byCard.has(f.cardNum)) byCard.set(f.cardNum, []);
  byCard.get(f.cardNum).push(f);
}

const root = process.cwd();
const effectsMap = new Map();
for (const f of ['effects_WX.json', 'effects_WXDi.json', 'effects_WX24_26.json', 'effects_WXK.json', 'effects_misc.json']) {
  const p = path.join(root, 'public/data', f);
  if (!fs.existsSync(p)) continue;
  for (const [k, v] of Object.entries(JSON.parse(fs.readFileSync(p, 'utf8')))) effectsMap.set(k, v);
}
const cards = new Map();
for (const f of [...Array.from({ length: 11 }, (_, i) => `CardData_Sheet${i + 1}.csv`), 'CardData_TK.csv']) {
  const p = path.join(root, 'public/data', f);
  if (!fs.existsSync(p)) continue;
  for (const r of Papa.parse(fs.readFileSync(p, 'utf8'), { header: true }).data) if (r.CardNum && !cards.has(r.CardNum)) cards.set(r.CardNum, r);
}

const HEADER = `あなたは WIXOSS カードゲーム実装（このリポジトリ）の **triage 担当**です。
別の監査員が「原文と effects JSON が食い違う」と報告した finding を1件ずつ精査し、
**真バグ（BUG）／偽陽性（FP）／判定不能（UNKNOWN）** に仕分けてください。

# 最重要：あなたは JSON だけを読む監査員ではない

監査員は JSON と原文しか見ていないので、**precision は実測 50〜84%** です。
そして**偽陽性は例外なく「engine が JSON の見た目を裏で読み替えている」型**でした。
⇒ **あなたの仕事の本体は \`src/engine/\` を読むことです。** JSON と原文だけで結論を書かないでください。

## 受け皿の探し方（必ずやる）

- STUB なら **\`grep -rn "<STUB の id>" src/\`**。ハンドラは \`src/engine/execStubPart*.ts\` に散っています。
- アクション型なら **\`grep -rn "'<TYPE>'" src/engine/\`**（\`effectExecutor.ts\` が主）。
- 誘発（timing）なら \`src/engine/triggerCollect.ts\`、条件なら \`src/engine/execUtils.ts\` の \`evalCondition\`。
- コストなら \`src/data/keywordCosts.ts\` と \`src/screens/battle/costs.ts\`。
- 逆翻訳の語彙は \`scripts/decompileEffects.ts\`。**逆翻訳が正しく見えても engine が同じ嘘をついていることがある**。
- 🔴**「本体ハンドラ」以外の消費地点がある**＝\`effectExecutor.ts\` が STUB を先取りする分岐が実在します。
  \`grep -rn "<STUB id>" src/engine/\` を**必ず**打ってから「消費されていない」と書いてください。

# 判定ルール（非対称：ここが一番大事）

- **FP と書いてよいのは、engine の該当行を \`ファイル:行\` で引用して「JSON の見た目と違う挙動になる」ことを示せたときだけ。**
- 示せないなら **UNKNOWN**（人間の判断へ回す）。**曖昧なものを FP にしない。**
- 理由＝**BUG の誤判定は実装時に気付くが、FP の誤判定は真バグを恒久的に消す**（記録した瞬間どの計器からも見えなくなる）。
- **BUG と書くときも \`ファイル:行\` を挙げる**（「どの受け皿に何が無いか」）。「JSON に無い」だけでは根拠になりません。

# 既知の偽陽性パターン（これに当たったら FP。ただし該当行の引用は必須）

1. **STUB の id 名から意味を推測して「別物だ」と言う**型。id は実装済みハンドラの表示名でもある。
2. **did-it ゲート**＝STUB ハンドラが自前で「実行できたか」を見て後続を止める（例 \`effectExecutor.ts\` の \`LRIG_UNDER_TO_TRASH\`）。
   ⇒「支払わなくても後続が実行される」系の指摘は、**まずハンドラ内のゲートを探す**。
3. **\`OPPONENT_PAY_OPTIONAL\` の既定の極性**＝JSON に書いていない側が既定で正しいことがある。
4. **\`abilityBlockTextOf\` / \`sourceAbilityText(ctx)\`**＝engine が**その効果のアビリティブロックだけ**を原文から読み直す。
   ⇒「JSON に条件が無い」ように見えて、engine が原文を読んで判定していることがある。
5. **\`filter\` が無い対象は「効果元自身」**を意味することがある（対象が広すぎるという指摘の定番の外し方）。
6. **往復（出す→戻す等）が1アクションに畳んである**ことがある。
7. **\`mandatory:true\` なのに原文が「〜してもよい」**＝engine 側が任意として扱う経路がある。
8. **LIFE_BURST の \`mandatory:false\`** はルール上正しい（LB 発動は任意）。
9. **【グロウ】条件・基礎ステータス（パワー/リミット/ガード/コイン）・括弧書きのルール注記**は JSON に載らない仕様。
10. **アーツ/スペルの使用コスト増減**は engine が原文を再パースして算出する（量が JSON に無くても正しい）。

# 🔴 判定の前に必ずやる2つ（2026-09-08 の抜き取り検査で実測した誤判定2型）

- 🔴**監査員の主張が原文と合っているかを先に確かめる**＝**原文に無い限定を監査員が足していることがある。**
  実例 \`WXK07-002-E1\`＝監査員は「②の対象が対戦相手のシグニに限定されていない」と書いたが、
  **原文②に「対戦相手の」は無い**（同じカードの①だけが対戦相手限定）。engine を正確に読んでも、
  **監査員の前提を検証しないと BUG と誤判定する。** ⇒ **引用（quote）の前後を原文で読み直してから engine を見る。**
- 🔴**FP と判定するとき、その効果に別の壊れ方が無いかを最後に確かめる**＝
  実例 \`WXDi-P11-076-E1\`＝指摘の向き（未払いでも手札に加わる）は確かに FP だったが、
  **同じ機構（Pattern ⑤）が skip 側で残り全ステップを捨てるため、原文で無条件の \`ENERGY_CHARGE\` まで実行されない**
  という**逆向きの真バグ**が同居していた。⇒ **\`note\` に「別の不整合がある」と書くくらいなら verdict は \`BUG\` にする**
  （FP として閉じるとその真バグは恒久的に失われる）。

# 🔴🔴 任意コストの3分岐を取り違えない（2026-09-08 に実際に2件誤判定した）

\`SEQUENCE[STUB{任意コスト}, …]\` の挙動は**3つ**あり、どれに当たるかで結論が反転する。**必ず現物の並びを見る。**

1. **STUB の直後が \`CONDITIONAL{IS_MY_TURN|PAID_ADDITIONAL_COST}\`** → \`effectExecutor.ts:5532\` が先取りする。
   その CONDITIONAL は「そうした場合」のプレースホルダとして消費され、**その後ろのステップは
   CHOOSE の \`continuation\` に付く**（:5661 / :5707）＝**pay でも skip でも実行される**。
   ⇒ 🔴**「後続が支払いの外にある」という監査員の指摘はこの形なら正しい（BUG）。**
2. **STUB と \`CONDITIONAL{IS_MY_TURN|PAID}\` の間に別ステップがある**（\`condIdx > i + 1\`）→ **Pattern ④**（\`:6060\`）。
   間のステップは**基本効果として無条件**、CONDITIONAL の then が強化分。
3. **直後に該当 CONDITIONAL が無い**（次が普通のアクション、または CONDITIONAL でも条件が別型）→ **Pattern ⑤**（\`:6163\`）。
   **残り全ステップが pay 側だけで実行される**（skip は空 SEQUENCE）＝この形なら「未払いでも実行される」は FP。

⚠**Pattern ⑤ を根拠に FP と書く前に、STUB の直後が \`IS_MY_TURN\`/\`PAID_ADDITIONAL_COST\` の CONDITIONAL でないことを確かめる。**

# 逆向きの罠（FP に見えて BUG）

- 🔴**「恒久 no-op で発動しない」と書かれた finding が、実は engine の既定で\*\*無条件に発動\*\*していた**前例があります
  （\`triggerCollect.ts\`）＝**壊れる向きは engine を読むまで決まりません。**
- 🔴**主張が弱い（LOW・「近似では」）finding でも盤面は開く**＝近似の指摘の裏に別の重いバグが居た前例があります。
- 🔴**既定値のある regex は「当たらないこと」が可視化されない**＝engine 側が原文 regex で数値を取っている場合、
  **当たらないと既定値（1枚・-3000 等）で静かに通ります。**

# 同型の母集団（BUG のときだけ）

BUG と判定したら、finding の \`grep\` 句（原文の言い回し）で**同型が何効果あるか**を数えてください。
\`docs/_effect_srctext.json\`（効果単位の原文）を grep するのが最短です。
⚠**カード全文で数えると同じカードの別効果を数えて水増しします。**
数えられなければ \`population: null\` で構いません（**推測値を書かない**）。

# 禁止事項

- 🔴**コードを1行も変更しないでください。**（triage は判定だけ。修正は人間が別工程でやります）
- 🔴**\`triaged.txt\` などの台帳ファイルに書き込まないでください。**
- 🔴**確認していないことを書かないでください。** 読んでいないファイルの行番号を書かない。

# 出力（このJSONだけを返す。前後に文章を付けない）

\`\`\`json
{"results":[
  {"cardNum":"WX22-005","findings":[
    {"effectId":"WX22-005-E1",
     "verdict":"BUG",
     "receptacle":"src/engine/effectExecutor.ts:5294 の CHOOSE 分岐",
     "evidence":"効果元の SEQUENCE は選択肢に関係なく実行される（同ファイル 5301 行で choice を見ずに次の step へ進む）",
     "population":3,
     "note":"③を選んだ場合だけに限定する受け皿が無い"}
  ]}
]}
\`\`\`

- \`verdict\` は \`"BUG"\` / \`"FP"\` / \`"UNKNOWN"\` のいずれか。
- \`receptacle\` と \`evidence\` は**必ず \`ファイル:行\` を含める**（UNKNOWN のときは「何を探して見つからなかったか」を書く）。
- **入力に出てくる finding をすべて1件ずつ返す**（省略しない）。

---

# 精査する finding（このバッチ）
`;

const cardList = [...byCard.entries()];
let taken = 0;
const batches = [];
let cur = [];
for (const [num, fs_] of cardList) {
  if (taken >= limit) break;
  cur.push([num, fs_]);
  taken += fs_.length;
  if (cur.reduce((a, [, x]) => a + x.length, 0) >= perBatch) { batches.push(cur); cur = []; }
}
if (cur.length) batches.push(cur);

const promptDir = path.join(outDir, 'prompts');
fs.mkdirSync(promptDir, { recursive: true });
let nFind = 0;
batches.forEach((b, i) => {
  const nn = String(i + 1).padStart(2, '0');
  let body = HEADER;
  for (const [num, fs_] of b) {
    const c = cards.get(num);
    body += `\n${'='.repeat(70)}\n■ ${num} ${c?.CardName ?? '(カード名不明)'}\n`;
    body += `【原文】${(c?.EffectText ?? '').replace(/。/g, '。\n        ')}\n`;
    if (c?.BurstText && c.BurstText !== '-') body += `【LB】${c.BurstText}\n`;
    for (const f of fs_) {
      nFind++;
      body += `  ▶ 精査対象 [${f.severity}/${f.type}] effectId=${f.effectId ?? '(なし)'} 引用「${f.quote ?? ''}」\n     指摘: ${f.claim}\n`;
      if (f.grep) body += `     監査員が挙げた同型の grep 句: 「${f.grep}」\n`;
    }
    body += `【effects JSON】\n${JSON.stringify(effectsMap.get(num), null, 1)}\n`;
  }
  fs.writeFileSync(path.join(promptDir, `batch_${nn}.txt`), body, 'utf8');
});

fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify({
  createdAt: new Date().toISOString(), perBatch, severity: sevFilter ?? null,
  rounds, batches: batches.length, findings: nFind,
  cards: batches.flat().map(([n]) => n),
}, null, 1), 'utf8');
console.log(`未 triage ${open.length}件 → 抽出 ${nFind}件 / ${batches.length}バッチ（${perBatch}件/バッチ目安）→ ${outDir}`);
