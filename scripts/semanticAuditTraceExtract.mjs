/**
 * 意味照合監査 round6（原文 × 実行結果）: プロンプト生成
 *
 * round1〜5 は「原文 × effects JSON」を読ませたため、engine が JSON を裏で読み替える箇所
 * （did-it ゲート・既定の極性・粗ゲート）は原理的に判定できなかった（PLAN §5.2 round5 総括）。
 * round6 は JSON を見せず、`behaviorAudit.ts --json-out` の実行結果（初期盤面・選択・盤面差分・engine ログ）を原文と並べる。
 *
 * 使い方:
 *   npx tsx scripts/behaviorAudit.ts --ids <CardNum,...> --json-out <out>/traces.json
 *   node scripts/semanticAuditTraceExtract.mjs --out <out> --traces <out>/traces.json [--batch-size 10]
 *   CODEX_HOME=... node scripts/semanticAuditRunCodex.mjs --out <out>   （round5 と同じランナー）
 */
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import Papa from 'papaparse';

const args = process.argv.slice(2);
const argOf = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const outDir = argOf('--out');
const tracesPath = argOf('--traces');
const batchSize = Number(argOf('--batch-size', '10'));
if (!outDir || !tracesPath) { console.error('--out と --traces は必須'); process.exit(1); }

const root = process.cwd();
const cards = new Map();
for (const f of [...Array.from({ length: 11 }, (_, i) => `CardData_Sheet${i + 1}.csv`), 'CardData_TK.csv']) {
  let text;
  try { text = readFileSync(join(root, 'public/data', f), 'utf8').replace(/^﻿/, ''); } catch { continue; }
  for (const r of Papa.parse(text, { header: true, skipEmptyLines: true }).data) {
    const id = r.CardNum?.trim();
    if (id && !cards.has(id)) cards.set(id, r);
  }
}
const norm = (s) => (s ?? '').replace(/\s+/g, ' ').trim();
const traces = JSON.parse(readFileSync(tracesPath, 'utf8'));

const header = `あなたは WIXOSS カードゲームの挙動監査員です。
各カードについて「原文テキスト」と「ゲームエンジンで効果を実際に解決した結果」を比べ、**エンジンの挙動が原文と食い違っている点だけ**を列挙してください。
効果の内部表現（JSON 等）は見せません。判定の根拠は**原文**と**盤面の変化・ログ**だけです。

# 実行結果の読み方（厳守）

1. **解決だけを見ている**。各効果は「発動条件を満たし、コストを支払い終えた」前提で強制的に解決させている。
   ⇒ **発動タイミング（【出】【自】のトリガー条件）・コストの支払い・《ターン１回》などの使用制限は検査対象外**。これらについて報告しない。
2. **【常】能力は含まれない**（解決という形で観測できないため）。
3. **盤面は汎用のテスト盤面**（自分/相手とも シグニ3体・手札5・デッキ12・トラッシュ3・エナ5色・ライフ7）。「初期盤面」に全カードの名前と属性を載せている。
   さらに**盤面の変種**で解決し、**結果が基本と違ったときだけ**「変種: 満杯」「変種: 枯渇」として載せている。
   - **満杯**＝両者シグニ3体・エナ10（「場に出す」先が無い経路）。**枯渇**＝両者 手札0・デッキ1・トラッシュ0・エナ0（効果元自身は残す）。
   - 変種では**原文の処理ができない**のが正しいことが多い（場が埋まっていて出せない／手札が無くて捨てられない）。
     ⇒ 見るのは「できないときに**カードが消える／別の物が動く／ログと盤面が食い違う／『そうした場合』の後続が起きる**」。
   - 効果元がスペル等のときは「効果元: …＝使用中（どのゾーンにも置いていない）」と書いてある（解決後の置き場はこの検査の対象外）。
   属性欄のアイコン（ガードアイコン／ライフバースト有／ライズアイコン）は**持っているときだけ**書いてある＝書いていなければ持っていない。
   ラベルの意味＝「自S源」＝この効果を持つカード自身／「〜対象」＝効果の対象になりそうなカードとして置いたもの／それ以外は汎用の埋め草。
4. **条件つきの効果は、初期盤面でその条件が成立しているかを先に判定する**。
   - 条件が**不成立**で何も起きない → 正しい。報告しない。
   - 条件が**成立しているのに**起きない／条件が**不成立なのに**起きた → 報告する。
   - 原文の条件の成否が初期盤面から判断できない（過去の出来事・このターンの履歴など）→ 報告しない。
5. **選択は自動操縦**＝対象選択・探索は**候補の先頭から**必要数を取る。「選択」欄に候補の数と選んだものを載せている。
   - 「候補N件[…]」の角括弧の中が**候補の全部**（ラベル、盤面に無いカードは《カード名》）。
   - **候補に原文の条件を満たさないカードが入っている**（例＝原文は＜天使＞なのに＜アーム＞が候補）→ 報告する（フィルターの欠落）。
   - 原文の条件を満たすカードが盤面にあるのに候補が0件 → 報告する。
6. **任意の選択肢は2通り実行した**＝「断る」（しない／スキップ側を選ぶ）と「受ける」（実行する側を選ぶ）。結果が同じなら「両方同じ」として1つだけ載せる。
   - 原文が「〜してもよい。**そうした場合**…」なのに、断っても後続が起きた → 報告する。
   - 原文が強制なのに「しない」が選べた、原文が任意なのに選択肢が出ず強制で実行された → 報告する。
   - ⚠「〜まで」「〜１体を対象とし」など**対象選択で表す任意**は選択肢に出ないことがある（自動操縦は常に最大数を選ぶ）。それだけを理由に報告しない。
7. **盤面差分が映すもの**＝カードの移動（⚠側跨ぎ＝自分↔相手の領域をまたいだ移動）／デッキの一番上・一番下への移動／パワー・レベル修正／凍結・ダウン等の状態／付与されたキーワード／プレイヤーへの行動制限／コイン／
   **「自状態 〈キー名〉」「相状態 〈キー名〉」＝エンジン内部の予約・置換・フラグの登録**（キー名は英語の内部名。例＝negated_attacks に相S対象0 が入った＝そのシグニの次のアタックが無効になる予約）。
   ⚠**「自状態」は効果を使った側、「相状態」はその対戦相手の側に登録された**という意味（相手のシグニへの予約は相状態に出る）。
   **映さないもの**＝付与された能力の中身、効果の持続期間（ターン終了時に消えるか）。
   ⇒ **差分とログのどちらにも痕跡が無いときだけ**「何も起きない」と報告する。
8. **ログはエンジン自身の文言**＝ログの記述と実際の盤面差分が食い違う（「2枚引く」とログにあるのに手札が1枚しか増えない等）→ 報告する。
9. 「能力ブロック」はエンジンがこの効果の原文として切り出した範囲。**ブロックが原文の途中で切れていて、後半の処理が実行されていない**なら報告する。
10. 実行状態が OK 以外（HANG／SKIP／CRASH）は、自動操縦が扱えない入力待ちのことがある。**それだけでは報告しない**が、その時点までの差分が原文と食い違っていれば報告する。
11. 🔑**「起きなかったこと」より「起きたこと」を優先して疑う**＝相手のカードが動いた／原文に無い枚数・パワー値／原文と違う領域へ移動、は汎用盤面でも確実に判定できる。

# 見るべき典型バグ

- 原文の処理（「その後…」「〜した場合…」）が、条件成立なのに起きていない（MISSING）
- 枚数・パワー値・レベルが原文と違う／自分と相手の取り違え／移動先の領域が違う（WRONG）
- 候補に原文の条件を満たさないカードが混ざる（WRONG）
- 任意／強制の取り違え、断ったのに後続が起きた（WRONG）
- 原文に無い変化が起きた（EXTRA）

# 出力形式

**JSON のみを出力**（説明文・前置き・コードフェンス不要）。全カード分の results を必ず出力し、食い違いが無いカードは findings を空配列にする。

{"results":[{"cardNum":"WX01-001","findings":[{"effectId":"WX01-001-E1","severity":"HIGH|MED|LOW","type":"MISSING|WRONG|EXTRA","run":"（変種名／）断る|受ける|両方","quote":"原文の該当句（20字以内）","evidence":"食い違いを示す差分・ログ・候補の行をそのまま引用","claim":"食い違いの内容を日本語1文で","grep":"同じ壊れ方が他カードにもあるなら、それを探すための原文の言い回し（10字以内）。このカード固有なら null"}]}]}

🔑**「evidence」は必須**＝実行結果のどの行が根拠か示せない finding は出さない。
🔑**「grep」が重要**＝目的は「このカードを直すこと」ではなく**同じ壊れ方の型を見つけること**。

severity: HIGH＝効果の意味が実質異なる／主要効果が起きない。MED＝数値・対象・条件・任意強制の部分的ずれ。LOW＝確信が持てない。

# 監査対象カード
`;

function renderRun(label, r) {
  let s = `**実行（${label}）**: 状態=${r.status}${r.detail ? `（${r.detail}）` : ''}\n`;
  s += `- 選択: ${r.choices.length ? '\n' + r.choices.map((c) => `  - ${c}`).join('\n') : 'なし'}\n`;
  s += `- 盤面差分: ${r.diff.length ? '\n' + r.diff.map((d) => `  - ${d}`).join('\n') : '（変化なし）'}\n`;
  s += `- ログ: ${r.logs.length ? '\n' + r.logs.map((l) => `  - ${l}`).join('\n') : '（なし）'}\n`;
  return s;
}

function renderRuns(runs) {
  return runs.both ? renderRun('断る／受ける 両方同じ', runs.both) : renderRun('断る', runs.decline) + renderRun('受ける', runs.accept);
}

function renderCard(t) {
  const c = cards.get(t.cardNum) ?? {};
  const meta = [c.CardName && `《${c.CardName}》`, c.Type, c.Level && `Lv${c.Level}`, c.Power && `パワー${c.Power}`, c.Color, norm(c.CardClass)].filter(Boolean).join(' ');
  let s = `## ${t.cardNum}（${meta}）\n\n### 原文テキスト\n${norm(c.EffectText) || '（なし）'}\n`;
  if (norm(c.BurstText) && norm(c.BurstText) !== '-') s += `ライフバースト：${norm(c.BurstText)}\n`;
  if (!t.traces.length) return s + '\n（解決で観測できる効果なし＝【常】のみ）\n';
  // 初期盤面はカード内で同一のことが多いので、直前と同じなら省略する
  let prevBoard = '';
  for (const tr of t.traces) {
    s += `\n### ${tr.effectId}（${tr.effectType}）\n能力ブロック: ${tr.abilityText}\n`;
    const board = tr.board.join('\n');
    s += board === prevBoard ? '初期盤面: 直前の効果と同じ\n' : `初期盤面:\n${tr.board.map((b) => `  ${b}`).join('\n')}\n`;
    prevBoard = board;
    s += renderRuns(tr.runs);
    for (const [, v] of Object.entries(tr.variants ?? {})) {
      s += `\n#### 変種: ${v.label}\n初期盤面:\n${v.board.map((b) => `  ${b}`).join('\n')}\n` + renderRuns(v.runs);
    }
  }
  return s;
}

mkdirSync(join(outDir, 'batches'), { recursive: true });
mkdirSync(join(outDir, 'prompts'), { recursive: true });
const batches = [];
for (let i = 0; i < traces.length; i += batchSize) batches.push(traces.slice(i, i + batchSize));
batches.forEach((b, i) => {
  const nn = String(i + 1).padStart(3, '0');
  writeFileSync(join(outDir, 'batches', `batch_${nn}.json`), JSON.stringify(b.map((t) => t.cardNum), null, 1));
  writeFileSync(join(outDir, 'prompts', `batch_${nn}.txt`), header + '\n' + b.map(renderCard).join('\n---\n\n'));
});
console.log(`${traces.length}枚 → ${batches.length}バッチ（${batchSize}枚/バッチ） → ${outDir}/prompts`);
