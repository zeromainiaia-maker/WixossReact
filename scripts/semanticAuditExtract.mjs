/**
 * 意味照合監査（semantic audit）: 抽出・プロンプト生成
 *
 * 目的: 「原文テキスト vs effects JSON」を LLM に意味レベルで比較させ、
 * 誤実装（表現の不一致）を逆翻訳の文字列一致に頼らず検出する。
 * 逆翻訳が原理的に検査できない STUB/MANUAL カードも対象にできるのが利点。
 *
 * 使い方:
 *   node scripts/semanticAuditExtract.mjs --out <出力dir> [--per-group 50] [--batch-size 10] [--seed 42]
 *   node scripts/semanticAuditExtract.mjs --out <出力dir> --cards WX01-001,WX01-002   # 指定カードのみ
 *
 * 出力:
 *   <out>/manifest.json          サンプリング内訳
 *   <out>/batches/batch_NN.json  バッチのカードデータ
 *   <out>/prompts/batch_NN.txt   claude -p に渡す完成プロンプト
 *
 * 実行は scripts/semanticAuditRun.mjs。
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import Papa from 'papaparse';

const args = process.argv.slice(2);
function argOf(name, dflt) {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : dflt;
}
const outDir = argOf('--out', null);
if (!outDir) { console.error('--out <dir> は必須'); process.exit(1); }
const perGroupArg = argOf('--per-group', '50');
const perGroup = perGroupArg === 'all' ? null : Number(perGroupArg);
const batchSize = Number(argOf('--batch-size', '10'));
const seed = Number(argOf('--seed', '42'));
const cardsFileArg = argOf('--cards-file', null);
const onlyCards = argOf('--cards', null)?.split(',').map(s => s.trim()).filter(Boolean)
  ?? (cardsFileArg ? readFileSync(cardsFileArg, 'utf8').split(/[,\n\r]+/).map(s => s.trim()).filter(Boolean) : null);
const excludeFile = argOf('--exclude-file', null);
const groupsArg = argOf('--groups', 'stub,clean').split(',');

const root = process.cwd();

// ---- データ読み込み（decompileEffects.ts と同じソース） ----
const effFiles = ['effects_WX.json', 'effects_WXDi.json', 'effects_WX24_26.json', 'effects_WXK.json', 'effects_misc.json'];
const effectsMap = new Map();
for (const f of effFiles) {
  const j = JSON.parse(readFileSync(join(root, 'public/data', f), 'utf8'));
  for (const [k, v] of Object.entries(j)) effectsMap.set(k, v);
}
const cards = new Map();
const csvs = [...Array.from({ length: 11 }, (_, i) => `CardData_Sheet${i + 1}.csv`), 'CardData_TK.csv'];
for (const f of csvs) {
  const p = join(root, 'public/data', f);
  if (!existsSync(p)) continue;
  for (const r of Papa.parse(readFileSync(p, 'utf8'), { header: true }).data) {
    if (r.CardNum) cards.set(r.CardNum, r);
  }
}

// ---- 分類 ----
function hasStubDeep(o) {
  if (!o || typeof o !== 'object') return false;
  if (o.type === 'STUB') return true;
  return Object.values(o).some(hasStubDeep);
}
const norm = (s) => {
  const t = (s ?? '').trim();
  return t === '-' ? '' : t;
};

const stubGroup = [];   // STUB/MANUAL 含有＝逆翻訳の盲点（本命）
const cleanGroup = [];  // 全効果 AUTO かつ STUB 無し＝対照群（偽陽性率の測定）
const textNoJson = [];  // テキストはあるが JSON 未登録
for (const [num, card] of cards) {
  const hasText = norm(card.EffectText) || norm(card.BurstText);
  if (!hasText) continue;
  const effs = effectsMap.get(num);
  if (!effs) { textNoJson.push(num); continue; }
  if (effs.some((e) => hasStubDeep(e) || e.parseStatus === 'MANUAL')) stubGroup.push(num);
  else cleanGroup.push(num);
}
stubGroup.sort();
cleanGroup.sort();

// ---- サンプリング（シード付きで決定的） ----
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function sample(arr, n, rnd) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a.slice(0, n);
}

let picked;
if (onlyCards) {
  picked = onlyCards.map((num) => ({ num, group: stubGroup.includes(num) ? 'stub' : 'clean' }));
} else {
  const rnd = mulberry32(seed);
  picked = [
    ...sample(stubGroup, perGroup, rnd).map((num) => ({ num, group: 'stub' })),
    ...sample(cleanGroup, perGroup, rnd).map((num) => ({ num, group: 'clean' })),
  ];
}

// ---- カード1枚分の監査データ ----
function cardEntry(num) {
  const c = cards.get(num);
  const effs = effectsMap.get(num);
  const meta = {
    name: c.CardName, type: c.Type, class: norm(c.CardClass), color: c.Color,
    level: norm(c.Level), power: norm(c.Power), limit: norm(c.Limit),
    timing: norm(c.Timing), team: norm(c.Team), lifeBurst: c.LifeBurst === '1' ? 'あり' : '',
  };
  for (const k of Object.keys(meta)) if (!meta[k]) delete meta[k];
  return { cardNum: num, meta, effectText: norm(c.EffectText), burstText: norm(c.BurstText), effects: effs };
}

// ---- プロンプト ----
const guide = readFileSync(join(root, 'docs/effects-json-guide.md'), 'utf8');
const header = `あなたは WIXOSS カードゲームの効果DSL監査員です。
各カードについて「原文テキスト」と「effects JSON」を意味レベルで比較し、JSON が原文を正しく表現していない点（不一致）だけを列挙してください。
文言・語順の違いは無視し、ゲーム上の意味（何が・いくつ・誰に・いつ・任意か強制か）だけを比較します。

# effects JSON の読み方

${guide}

# 追加の読み方ルール（誤検出を避けるため厳守）

1. **STUB ノード（{"type":"STUB","id":"..."} ）は「未実装」ではなく実装済みの名前付きハンドラ**。id 名と周辺パラメータが原文の意味に対応していそうなら不一致にしない。id の意味が原文と明らかに食い違う、または原文の主要な処理がどの STUB・アクションにも対応しない場合のみ type: "SUSPECT_STUB" で報告。
2. 【グロウ】条件（「【グロウ】：…」）は JSON に含まれない仕様（エンジンが原文から直接評価）。報告しない。
3. ガード・リミット・パワー・コイン枚数などカードの基礎ステータスは別管理。JSON に無くても報告しない。
4. 括弧書きのルール注記（例:「（コストのない【出】能力は…）」「（このスペルは…）」）は効果ではない。報告しない。
5. アーツ/スペルの**使用コスト増減**文（「使用コストは《白》×１減る」等）は ARTS_COST_REDUCTION_* 系 STUB で表現され、増減量はエンジンが原文を再パースして算出する仕様。量が JSON に無くても報告しない。
6. アーツの使用タイミング（メインフェイズ/アタックフェイズ等）は別管理。報告しない。
7. **「バニッシュする」と「エナゾーンに置く」「トラッシュに置く」は厳密に別アクション**。取り違えは HIGH。
8. 効果の分割単位（1文が2 effect に分かれる等）は自由。全体として意味が揃っていれば不一致にしない。
9. **任意コストイディオム**：STUB（id が OPTIONAL_COST / TARGET_OPP_SIGNI_OPTIONAL_COLOR_COST / OPTIONAL_TRASH_ENERGY_CLASS）の後に CONDITIONAL(IS_MY_TURN または PAID_ADDITIONAL_COST) が続く形は、原文の「〜を支払ってもよい。そうした場合…」をエンジンがインターセプトして表す既知イディオム。**IS_MY_TURN を不一致として報告しない**。さらに TARGET_OPP_SIGNI_OPTIONAL_COLOR_COST の then 内 target.owner が self でもエンジンが opponent に自動修正する＝報告しない。ただし then 内のアクション種別・枚数・フィルターの違い、および原文にあるコスト以外の**発動条件（パワー条件等）が JSON のどこにも無い**場合は報告する。
10. LIFE_BURST 効果の mandatory:false は「LB発動は任意」というルールの表現＝報告しない。
11. アンコール（「アンコール－…」）・ベット（「ベット－…」）の注記は engine 側の別機構で処理される＝JSON に無くても報告しない。
12. AUTO/ACTIVATED 効果で action が STUB の場合、任意（〜してもよい）の確認は STUB ハンドラ内で行われることがある＝mandatory フラグだけの任意/強制ずれは LOW に格下げ（STUB 以外のアクションなら通常どおり）。

# 見るべき典型バグ

- 原文の効果・後続処理（「その後…」「〜した場合…」）が JSON のどこにも無い（MISSING）
- 枚数・レベル・パワー数値・「まで」(upTo/maxCount) の違い（WRONG）
- 対象の取り違え：自分↔相手、シグニ↔ルリグ、場↔手札↔デッキ↔トラッシュ↔エナ（WRONG）
- タイミング違い：【出】↔【自】↔【常】↔【起】、ターン終了時↔開始時、自ターン↔相手ターン（WRONG）
- 任意（〜してもよい）↔強制の取り違え（mandatory）（WRONG）
- フィルター条件（クラス＜〜＞・色・レベル・カード名指定）の欠落や違い（WRONG）
- 原文に無い効果が JSON にある（EXTRA）

# 出力形式

**JSON のみを出力**（説明文・前置き・コードフェンス不要）。全カード分の results を必ず出力し、不一致が無いカードは findings を空配列にする。

{"results":[{"cardNum":"WX01-001","findings":[{"effectId":"WX01-001-E1 または null","severity":"HIGH|MED|LOW","type":"MISSING|WRONG|EXTRA|SUSPECT_STUB","quote":"原文の該当句（20字以内）","claim":"不一致の内容を日本語1文で"}]}]}

severity: HIGH＝効果の意味が実質異なる／主要効果の丸ごと欠落。MED＝数値・対象・条件・任意強制の部分的ずれ。LOW＝軽微または確信が持てない。

# 監査対象カード
`;

function renderCard(e) {
  const metaStr = Object.entries(e.meta).map(([k, v]) => `${k}=${v}`).join(' ');
  let s = `## ${e.cardNum}（${metaStr}）\n\n### 原文テキスト\n${e.effectText || '（なし）'}\n`;
  if (e.burstText) s += `ライフバースト：${e.burstText}\n`;
  s += `\n### effects JSON\n${JSON.stringify(e.effects, null, 1)}\n`;
  return s;
}

// ---- 出力 ----
mkdirSync(join(outDir, 'batches'), { recursive: true });
mkdirSync(join(outDir, 'prompts'), { recursive: true });
const batches = [];
for (let i = 0; i < picked.length; i += batchSize) batches.push(picked.slice(i, i + batchSize));
batches.forEach((b, i) => {
  const nn = String(i + 1).padStart(2, '0');
  const entries = b.map(({ num }) => cardEntry(num));
  writeFileSync(join(outDir, 'batches', `batch_${nn}.json`), JSON.stringify(b, null, 1));
  const prompt = header + '\n' + entries.map(renderCard).join('\n---\n\n');
  writeFileSync(join(outDir, 'prompts', `batch_${nn}.txt`), prompt);
});
writeFileSync(join(outDir, 'manifest.json'), JSON.stringify({
  seed, perGroup, batchSize,
  population: { stubOrManual: stubGroup.length, cleanAuto: cleanGroup.length, textNoJson: textNoJson.length },
  textNoJson,
  picked,
}, null, 1));

console.log(`母集団: stub/manual=${stubGroup.length} clean=${cleanGroup.length} JSON未登録=${textNoJson.length}`);
console.log(`サンプル: ${picked.length}枚 → ${batches.length}バッチ（${batchSize}枚/バッチ） → ${outDir}`);
