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

let stubGroup = [];   // STUB/MANUAL 含有＝逆翻訳の盲点（本命）
let cleanGroup = [];  // 全効果 AUTO かつ STUB 無し＝対照群（偽陽性率の測定）
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

if (excludeFile) {
  const excludeSet = new Set(readFileSync(excludeFile, 'utf8').split(/[,\n\r]+/).map((s) => s.trim()).filter(Boolean));
  stubGroup = stubGroup.filter((n) => !excludeSet.has(n));
  cleanGroup = cleanGroup.filter((n) => !excludeSet.has(n));
}

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
  picked = [];
  if (groupsArg.includes('stub')) {
    picked.push(...(perGroup === null ? stubGroup : sample(stubGroup, perGroup, rnd)).map((num) => ({ num, group: 'stub' })));
  }
  if (groupsArg.includes('clean')) {
    picked.push(...(perGroup === null ? cleanGroup : sample(cleanGroup, perGroup, rnd)).map((num) => ({ num, group: 'clean' })));
  }
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
12. 🔴**「〜してもよい」なのに 「mandatory:true」 だ、という finding は報告しない（2026-09-07 の偽陽性4件から強化）**＝action が STUB のとき、任意性は**ハンドラ側**が持つ（「CHANGE_BASE_LEVEL」「MOVE_TO_OTHER_SIGNI_ZONE」 は CHOOSE に「スキップ」肢を出す／「SET_HAND_CARD_AS_TRAP」 は 「trapPlaceOptional」 の既定が true／「LEVEL_REFERENCE_OVERRIDE」 は「候補に足す」形で表す）。効果トップの 「mandatory」 は STUB の実行可否を決めていない。⇒ **STUB 以外の素のアクション（DRAW / BANISH / TRASH …）が 「optional」 も 「mandatory:false」 も持たないときだけ**報告する。
13. **「そうした場合」＝ did-it ゲート（2026-09-06 の偽陽性から追加）**：LIFE_CRASH・DISCARD など」実際にできたか」で後続が決まるアクションの直後に置かれた CONDITIONAL(IS_MY_TURN) は、engine の did-it ゲート（「DID_IT_GATED_TYPES」）が消費する既知イディオム＝**空振りしたら then は起きない**。**報告しない。**
14. **OPPONENT_PAY_OPTIONAL の既定の極性（同上）**：「対戦相手は〜してもよい。そうしないかぎり…」型の既定は**」払わなかったら then」**で、「thenOnPay」 を立てたときだけ逆向き。**JSON の CONDITIONAL(IS_MY_TURN) は極性を持たない**＝これを「条件が逆」と**報告しない**。
15. **STUB の id 名と payload の食い違いは報告しない（同上）**＝id は表示用の名前で、engine が読むのは payload。「..._FROM_TRASH」 という id で 「value2:"hand"」 を持つ形は**payload が原文と合っていれば正しい**。**payload の側が原文と違うときだけ**報告する。
16. 🔑**engine は JSON の見た目を裏で読み替えることがある**（13〜15 がその実例）。**「JSON にこう書いてあるから間違い」という理由だけの finding は severity を LOW にする**。原文の**語句そのもの**が JSON のどこにも無い型（欠落・数値違い・対象違い）を優先して報告すること。
17. **STUB の id 名に入っているカード種別（ARTS / SPELL / SIGNI …）は「適用範囲」を表さない（2026-09-06 の偽陽性から追加・規則15の系）**＝範囲を決めるのは engine の消費地点であって id 名ではない。実例＝「IGNORE_LRIG_RESTRICTION_ARTS」 は名前に ARTS しか無いが、engine 側はアーツとスペルの両方の使用ゲートで読んでいる。⇒ **「id 名が狭いので原文の◯◯が抜けている」という理由だけの finding は報告しない**（payload に範囲を絞る値が入っているときだけ報告する）。
18. **パワー修正の「ターン終了時まで」は書かない のが正準形（2026-09-07 の偽陽性5件から追加・規則16の系）**＝「POWER_MODIFY」 / 「POWER_MODIFY_PER_LEVEL_SUM」 などのパワー修正は、「duration」 を書かないと engine の 「temp_power_mods」 に積まれ、**ターン終了時に必ずクリアされる**。「duration」 は **ターン終了より長い** ものを表すときだけ書く（「UNTIL_OPP_TURN_END」 / 「UNTIL_NEXT_OWN_TURN_END」）。効果トップの 「duration:"INSTANT"」 はパワー修正の寿命とは無関係。⇒ **原文が「ターン終了時まで」なのに JSON に duration が無い／INSTANT だ、という理由だけの finding は報告しない。**
19. **CONTINUOUS（【常】）の 「target.count:1」 は「このシグニ自身」が正準形（2026-09-07 の偽陽性3件から追加・同系）**＝「POWER_SET」 / 「SET_BASE_LEVEL」 / 「GRANT_PROTECTION」 などの常在効果は、engine 側が 「count !== 'ALL'」 を**効果元シグニ自身**として解決する（対象選択は起きない）。⇒ **「原文は『このシグニ』なのに thisCardOnly フィルターが無い」という理由だけの finding は報告しない**（「count:'ALL'」 になっている・「owner」 が逆・「subjectFilter」 が別のカードを指している、といった**範囲が実際に広がっている**ときだけ報告する）。
20. **キーワード能力は本文に対応する語が無くても展開される（2026-09-07 の偽陽性から追加）**＝「【チェイン】《緑》《白》」のようなキーワードは、engine が読む形（この例では 「COST_REDUCTION{targetCardType:"アーツ"}」＝このターン次に使うアーツのコスト軽減）へ**parser が展開して JSON に載せる**。⇒ **「原文の効果文に書かれていないアクションが JSON にある」という理由だけの finding は報告しない**。まず**カード名の直後や効果文の先頭にキーワード（【チェイン】【アンコール】【ベット】【エクシード】等）が無いか**を確かめる。
21. **「アップ状態の〜をダウンする」使用コストに 「isUp」 フィルターは要らない（同上）**＝「useTimeCost{source:"signi_down"}」 は候補算出の時点で**既にダウンしているシグニを除外する**（ダウンできないものはダウン用コストの候補にならない）。⇒ **コスト側の 「filter」 に 「isUp」 が無いという理由だけの finding は報告しない。**
22. **「crossOnly:true」 は「クロス相手を問わない」ではない（同上）**＝クロス相手の**具体的なカード名はカードデータのクロス条件そのもの**から解決される（JSON に書き写さない）。⇒ **「特定のカードとクロスしている場合限定なのに crossOnly しか無い」という理由だけの finding は報告しない。**
23. **STUB ハンドラは自分で「そうした場合」ゲートを持っていることがある（同上・規則13の系）**＝実例＝「LRIG_UNDER_TO_TRASH」 は「ルリグの下がN枚未満なら以降のステップを丸ごとスキップ」を**ハンドラ内で**実装している。⇒ **「STUB の直後に無条件で次のアクションが並んでいる」という理由だけの finding は報告しない**（STUB 以外の普通のアクションが前段のときだけ、規則13の did-it ゲート対象型かを見て判断する）。
24. **「SEARCH」 の 「then」 は選んだカード1枚ずつに適用される（同上）**＝枚数を決めるのは 「maxCount」 で、「then」 の中の 「target.count」 は**総数の上限ではない**（engine は picked を1枚ずつ回して 「then」 を当てる）。⇒ **「maxCount は3なのに then の count が1だから1枚しか処理されない」という finding は報告しない。**

25. **STUB ハンドラは payload に 「target」 が無くても自分で対象を選ばせる（2026-09-07 の偽陽性から追加・規則23の系）**＝実例＝「CLASS_CHANGE」 は 「classChange」 だけを受け取り、対象は**ハンドラが両プレイヤーの場から SELECT_TARGET で1体選ばせる**。⇒ **「原文は『シグニ1体を対象とし』なのに STUB の payload に target/owner/count が無い」という理由だけの finding は報告しない**（payload に**別の**対象指定が入っていて原文と食い違うときだけ報告する）。

26. **「1枚につき／それぞれについて」は engine が1枚ずつ回す（同上・規則24の系）**＝「SELECT_COLOR{from:"last_processed"}」 は直前に処理したカードを1枚ずつキューで回して色を問う（2枚なら2回）。⇒ **「N枚あるのに選択アクションが1つしか無いから1回しか実行されない」という finding は報告しない。**

27. **原文に無い「中継ステップ」だけを根拠に EXTRA を報告しない（同上）**＝実例＝「探して…コストを支払わずに使用するかトラッシュに置く」は、engine に「探して手に持つ」専用ゾーンが無いため **SEARCH 既定の 「ADD_TO_HAND」 を一度経由する**既知の近似（どちらの枝でも手札には残らないので最終盤面は正しい）。⇒ **カードの最終的な行き先が原文と一致しているなら、途中に余分なゾーン移動があっても報告しない**（最終的な行き先が違うときだけ報告する）。

28. **「〜を対象とし、それが〈状態〉の場合」を候補フィルターへ畳んだ形は既知の近似（2026-09-07 の偽陽性から追加）**＝「対戦相手のシグニ1体を対象とし、**それが感染状態の場合**、パワーを－5000」に対する 「filter:{infected:true}」 は、**原文でも条件を満たさない対象を選べば何も起きない**ので最終盤面が一致する。⇒ **「正準形（SELECT_TARGET_ONLY→STORE→CONDITIONAL）を通っていない」という理由だけの finding は報告しない**（条件が**どこにも無い**＝無条件に実行されるときだけ報告する）。

29. **STUB の id が原文のイディオム丸ごとに対応していることがある（同上・規則15の系）**＝実例＝「SUMMON_RESONA_FROM_LRIG_DECK」 は「ルリグデッキから**出現条件を無視して**場に出す」こと自体が本体の意味で、ハンドラは出現条件を一度も見ない。⇒ **「原文の修飾語（『出現条件を無視して』等）が payload に無い」という理由だけの finding は報告しない**（payload に**その修飾語と食い違う値**が入っているときだけ報告する）。

30. 🔴**「このシグニ」は 「filter」 を書かないのが正準形（同上・規則19の AUTO 版）**＝「GRANT_KEYWORD」 / 「POWER_MODIFY」 などは **「filter」 が無い（または 「thisCardOnly」）かつ 「explicitTarget」 が無い**とき、engine が**効果元自身へ自動適用**する（対象選択UIを出さない）。⇒ **「原文は『このシグニは』なのに thisCardOnly が無いから任意のシグニを選べてしまう」という finding は報告しない。** 報告してよいのは **「explicitTarget:true」 が立っている**・**「owner」 が逆**・**「filter」 に別のカードを指す条件が入っている**ときだけ。

31. **同じ STUB id が並んでいても engine が効果ごとに読み分けていることがある（同上）**＝実例＝「PREVENT_ZONE_MOVE_BY_OPP」 は E1（エナ保護）と E2（手札保護）で payload が同一だが、engine は 「abilityBlockTextOf(card, effectId)」 で**その効果のブロックだけ**を読んで保護ゾーンを決める。⇒ **「2つの効果が同一の JSON なので区別されていない」という理由だけの finding は報告しない**（区別が**盤面の挙動として**間違っている根拠があるときだけ報告する）。

32. **「置く。その後、それらを場に出す」の往復は1アクションに畳んである（同上・規則27の系）**＝「FIELD_SIGNI_TO_CHECK_ZONE」 は「チェックゾーンに置く→場に出し直す」を1アクションで表し、「lastProcessedCards」 経由で【出】も再発火する。⇒ **「『その後それらを場に出す』のステップが JSON に無い」という finding は報告しない**（往復先のゾーンが原文と違うときだけ報告する）。

33. 🔴**「N枚まで」の任意性は engine が構造ごとに補っていることがある（2026-09-07 第219の偽陽性から追加）**＝実例＝「transferGroups」（「あなたのトラッシュから＜A＞と＜B＞をそれぞれ1枚まで対象とし、それらを手札に加える」）は各群が 「count:1」 としか書かれていないが、「execTransferToHand」 が群を展開するときに **「upToCount:true」 を無条件で付ける**ので、実挙動は既に「0〜1枚」になっている。⇒ **「原文に『まで』があるのに 「upToCount」/「upTo」 が JSON に無いので0枚を選べない」という finding は報告しない。** 報告してよいのは **原文が「まで」を持たない（＝強制）のに JSON か engine が任意にしている**とき、つまり**逆向き**のときだけ。

34. 🔴**逆翻訳（decompile）に原文の一節が出ていても、それが JSON に載っているとは限らない（同上・第218の差し戻しから追加）**＝逆翻訳器は 「value2」 のような**別の軸から原文の言い回しを復元してしまう**ことがある（実例＝領域が両者のルリグトラッシュなら「限定条件を無視して」と描く実装が入りかけた）。⇒ **逆翻訳文を「JSON にその軸がある証拠」として使わない。** 判定は必ず JSON の payload と engine の消費地点で行う。

# 見るべき典型バグ

- 原文の効果・後続処理（「その後…」「〜した場合…」）が JSON のどこにも無い（MISSING）
- 枚数・レベル・パワー数値・「まで」(upTo/maxCount) の違い（WRONG）
- 対象の取り違え：自分↔相手、シグニ↔ルリグ、場↔手札↔デッキ↔トラッシュ↔エナ（WRONG）
- タイミング違い：【出】↔【自】↔【常】↔【起】、ターン終了時↔開始時、自ターン↔相手ターン（WRONG）
- 任意（〜してもよい）↔強制の取り違え（⚠**規則12 を先に読む**＝STUB が action のときは報告しない）（WRONG）
- フィルター条件（クラス＜〜＞・色・レベル・カード名指定）の欠落や違い（WRONG）
- 原文に無い効果が JSON にある（EXTRA）

# 出力形式

**JSON のみを出力**（説明文・前置き・コードフェンス不要）。全カード分の results を必ず出力し、不一致が無いカードは findings を空配列にする。

{"results":[{"cardNum":"WX01-001","findings":[{"effectId":"WX01-001-E1 または null","severity":"HIGH|MED|LOW","type":"MISSING|WRONG|EXTRA|SUSPECT_STUB","quote":"原文の該当句（20字以内）","claim":"不一致の内容を日本語1文で","grep":"同じ壊れ方が他カードにもあるなら、それを探すための原文の言い回し（10字以内）。このカード固有なら null"}]}]}

🔑**「grep」 が最重要**＝この監査の目的は「このカードを直すこと」ではなく**同じ壊れ方の“型”を見つけること**。
1枚の不一致を見たら「**この言い回しを持つ他のカードでも同じことが起きるか**」を必ず考え、起きるなら
その言い回し（原文の表記そのまま・記号を含めてよい）を 「grep」 に入れる。カード名や番号は入れない。

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
const padWidth = Math.max(2, String(batches.length).length);
batches.forEach((b, i) => {
  const nn = String(i + 1).padStart(padWidth, '0');
  const entries = b.map(({ num }) => cardEntry(num));
  writeFileSync(join(outDir, 'batches', `batch_${nn}.json`), JSON.stringify(b, null, 1));
  const prompt = header + '\n' + entries.map(renderCard).join('\n---\n\n');
  writeFileSync(join(outDir, 'prompts', `batch_${nn}.txt`), prompt);
});
writeFileSync(join(outDir, 'manifest.json'), JSON.stringify({
  seed, perGroup: perGroupArg, batchSize, groups: groupsArg, excludeFile,
  population: { stubOrManual: stubGroup.length, cleanAuto: cleanGroup.length, textNoJson: textNoJson.length },
  textNoJson,
  picked,
}, null, 1));

console.log(`母集団: stub/manual=${stubGroup.length} clean=${cleanGroup.length} JSON未登録=${textNoJson.length}`);
console.log(`サンプル: ${picked.length}枚 → ${batches.length}バッチ（${batchSize}枚/バッチ） → ${outDir}`);
