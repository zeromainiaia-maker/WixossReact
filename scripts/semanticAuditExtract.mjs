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
    // コスト列を渡さないと、JSON の cost（例＝《無》×８）が「原文に無い支払い」と誤読される（round5 batch_001 の偽陽性）
    cost: norm(c.Cost), growCost: norm(c.GrowCost),
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

27. **原文に無い「中継ステップ」だけを根拠に EXTRA を報告しない（同上）**＝実例＝「探して…コストを支払わずに使用するかトラッシュに置く」は、engine に「探して手に持つ」専用ゾーンが無いため **SEARCH 既定の 「ADD_TO_HAND」 を一度経由する**既知の近似（どちらの枝でも手札には残らないので最終盤面は正しい）。🔑**根拠（2026-09-15 実測）**＝原文に「手札に加えたとき／加わったとき」のトリガーを持つ効果は **1件だけ**（「WX20-046-E2」＝**エナゾーンから**加えたとき）で、デッキからの経由では発火しない＝**中継で誘発するトリガーが存在しない。**⇒ **カードの最終的な行き先が原文と一致しているなら、途中に余分なゾーン移動があっても報告しない**（最終的な行き先が違うときだけ報告する）。

28. 🔴**「〜を対象とし、それが〈状態〉の場合」を候補フィルターへ畳んだ形は §5.3 「O-413」 として登録済み（2026-09-15 に「既知の近似」から格下げ）**＝旧版は「最終盤面が一致するので偽陽性」としていたが、**これは誤りだった**＝「ON_TARGETED」（「対戦相手の能力か効果の**対象になったとき**」）は **engine 実装済み・live 18効果**（「triggerCollect.ts:743」）なので、**条件不成立で対象に取られないと相手のトリガーが発火しない**＝実挙動差がある。母集団は**104効果**（原文が「対象とし」→「〜の場合」の順なのに対象ノードが条件の内側にしかない効果）。
    ⇒ **この形そのものは 「O-413」 に集約済みなので個別に報告しなくてよい。** ただし**「等価だから」ではない**＝**別の形の対象落ち**（対象の所有者・フィルタ・体数が原文と違う、対象がどこにも無い）は報告する。

29. **STUB の id が原文のイディオム丸ごとに対応していることがある（同上・規則15の系）**＝実例＝「SUMMON_RESONA_FROM_LRIG_DECK」 は「ルリグデッキから**出現条件を無視して**場に出す」こと自体が本体の意味で、ハンドラは出現条件を一度も見ない。⇒ **「原文の修飾語（『出現条件を無視して』等）が payload に無い」という理由だけの finding は報告しない**（payload に**その修飾語と食い違う値**が入っているときだけ報告する）。

30. 🔴**「このシグニ」は 「filter」 を書かないのが正準形（同上・規則19の AUTO 版）**＝「GRANT_KEYWORD」 / 「POWER_MODIFY」 などは **「filter」 が無い（または 「thisCardOnly」）かつ 「explicitTarget」 が無い**とき、engine が**効果元自身へ自動適用**する（対象選択UIを出さない）。⇒ **「原文は『このシグニは』なのに thisCardOnly が無いから任意のシグニを選べてしまう」という finding は報告しない。** 報告してよいのは **「explicitTarget:true」 が立っている**・**「owner」 が逆**・**「filter」 に別のカードを指す条件が入っている**ときだけ。

31. **同じ STUB id が並んでいても engine が効果ごとに読み分けていることがある（同上）**＝実例＝「PREVENT_ZONE_MOVE_BY_OPP」 は E1（エナ保護）と E2（手札保護）で payload が同一だが、engine は 「abilityBlockTextOf(card, effectId)」 で**その効果のブロックだけ**を読んで保護ゾーンを決める。⇒ **「2つの効果が同一の JSON なので区別されていない」という理由だけの finding は報告しない**（区別が**盤面の挙動として**間違っている根拠があるときだけ報告する）。

32. **「置く。その後、それらを場に出す」の往復は1アクションに畳んである（同上・規則27の系）**＝「FIELD_SIGNI_TO_CHECK_ZONE」 は「チェックゾーンに置く→場に出し直す」を1アクションで表し、「lastProcessedCards」 経由で【出】も再発火する。⇒ **「『その後それらを場に出す』のステップが JSON に無い」という finding は報告しない**（往復先のゾーンが原文と違うときだけ報告する）。

33. 🔴**「N枚まで」の任意性は engine が構造ごとに補っていることがある（2026-09-07 第219の偽陽性から追加）**＝実例＝「transferGroups」（「あなたのトラッシュから＜A＞と＜B＞をそれぞれ1枚まで対象とし、それらを手札に加える」）は各群が 「count:1」 としか書かれていないが、「execTransferToHand」 が群を展開するときに **「upToCount:true」 を無条件で付ける**ので、実挙動は既に「0〜1枚」になっている。⇒ **「原文に『まで』があるのに 「upToCount」/「upTo」 が JSON に無いので0枚を選べない」という finding は報告しない。** 報告してよいのは **原文が「まで」を持たない（＝強制）のに JSON か engine が任意にしている**とき、つまり**逆向き**のときだけ。

34. 🔴**逆翻訳（decompile）に原文の一節が出ていても、それが JSON に載っているとは限らない（同上・第218の差し戻しから追加）**＝逆翻訳器は 「value2」 のような**別の軸から原文の言い回しを復元してしまう**ことがある（実例＝領域が両者のルリグトラッシュなら「限定条件を無視して」と描く実装が入りかけた）。⇒ **逆翻訳文を「JSON にその軸がある証拠」として使わない。** 判定は必ず JSON の payload と engine の消費地点で行う。

35. **「あなたのターン開始時／終了時／アタックフェイズ開始時」等のフェイズ timing は、自分のターンにしか発火しない（2026-09-15 round5 の偽陽性から追加）**＝「ON_TURN_END」「ON_TURN_START」「ON_ATTACK_PHASE_START」 などは、engine の収集関数が**ターンプレイヤー側の場だけ**を 「triggerScope:self」 で走査する。⇒ **「原文は『あなたのターン終了時』なのに、ターン所有者を自分に限定する条件が JSON に無い」という finding は報告しない**（「triggerScope」 が 「any」/「opponent」 系になっていて**相手のターンにも発火する形**のときだけ報告する）。

36. **「ガードステップ以外で手札を捨てたとき」の限定は構造的に守られている（同上）**＝ガードで手札を捨てても engine は手札破棄トリガー（「ON_HAND_DISCARDED」／「ON_DISCARDED_AS_COST」）を**立てない**。⇒ **「『ガードステップ以外で』の制限が JSON に無い」という finding は報告しない。**

37. **「＜X＞のシグニの【出】【起】能力のコストとして捨てられたとき」は 「triggerCondition.discardCostSourceStory」 だけで表す（同上）**＝engine はコストを支払った能力の持ち主シグニのクラスを照合する。シグニのコストつき能力は【出】【起】なので、**能力種別の条件は別に書かない。** ⇒ **「【出】【起】という能力種別の限定が JSON に無い」という理由だけの finding は報告しない**（「discardCostSourceStory」 自体が無い／クラスが原文と違うときだけ報告する）。

38. 🔴**「その後」は「そうした場合」の**内側**（2026-09-15 索引 H の裁定・「O-377」）**＝「〜して**もよい**。**そうした場合**、A。**その後**、B」の B は、**任意の行動を実行したときだけ**起きる。
    根拠＝原文コーパス全数（10,768効果）で「そうした場合、…。」の直後が「その後」で始まる形は**13件しかなく、13件すべて**「その後」の中身が直前の行為にぶら下がっている。
    無条件の後続を書くときはコネクタを付けない（「WD12-006-E1」 のアーツ本体／「WD06-018-E1」 のドロー）。
    ⇒ **「その後」節がゲートの外（兄弟ステップ）にある形は報告してよい（「WRONG」）。** 逆に**内側にあることを「原文に無い入れ子」として報告しない。**

39. **「他の」＝**このカード自身**を除く（同上・「O-378」）**＝原文コーパスの「他の」350件は例外なく自己相対で、**「それ以外の」「そのシグニ以外」は0件**（直前の参照先を除く語彙がゲームに無い）。
    トリガー側の「あなたの**他の**シグニ1体がアタックしたとき」（「WX22-022-E4」／「WXK11-022-E1」）が決定的＝**トリガー時点では参照先が無い**。
    ⇒ **「『他の』はトリガーしたカード以外の意味ではないか」という finding は報告しない**（「excludeSelf」 が**無い**ときだけ報告する）。

40. **「N体につき〜して**もよい**」は全体で1回の二択（同上・「O-379」）**＝「それのレベル1につき《無》を支払ってもよい。そうした場合、〜」型（コーパス18件）は**全額払うか払わないか**であって、1単位ずつ選べる形ではない。
    「N体**まで**対象とし」が既に粒度を持っている（1体だけ対象にすれば1単位）。
    ⇒ **「1体ずつ選べるはずなのに全体で1回になっている」という finding は報告しない。**

41. 🔴**「OPTIONAL_COST」 の直後にゲートが無い形は「払わなければ残りステップごとスキップ」（2026-09-15 round5 の偽陽性3件から追加・規則9の系）**＝engine の Pattern ⑤ が 「OPTIONAL_COST」/「OPTIONAL_TRASH_ENERGY_CLASS」/「OPTIONAL_ACTIVATE」 を見つけると、**その後ろのステップ全部**を「支払う→実行／辞退→スキップ」の二択にする（「CONDITIONAL」 は要らない）。
    ⇒ **「支払い成否を判定する分岐が無いので、払わなくても後続が実行される」という finding は報告しない。** CHOOSE の選択肢の中でも同じ。

42. **原文が「強制」の手札破棄を 「OPTIONAL_COST」 で表すのは engine の制約（同上・規則13の系／🔴挙動差は残る＝§5.3 「O-418」 に登録済み）**＝「TRASH」 は engine の 「DID_IT_GATED_TYPES」（effectExecutor.ts:6163）に**入っていない**ので、「素の TRASH ＋ CONDITIONAL」 で書くと**手札0枚でも後続が通る過剰実行**になる。「OPTIONAL_COST」 なら 「canAffordOptionalCostSpec」 が払えない盤面を弾き、「PAID_ADDITIONAL_COST」 が「そうした場合」を正しく閉じる。
    ⇒ **この形は 「O-418」 に集約済みなので個別に報告しなくてよい**（🔴「差が無い」からではない＝**払える盤面で辞退できる**という実挙動差は残っている）。

43. **《リコレクトアイコン》［N枚以上］＝「ルリグトラッシュの**アーツ**が N 枚以上」（同上）**＝カードのルール注記が「（あなたのルリグトラッシュに４枚以上の**アーツ**があるかぎり…）」と明記している。
    ⇒ **「LRIG_TRASH_COUNT の cardType がアーツに限定されていて原文の『カード』より狭い」という finding は報告しない**（live 16効果すべてがこの形）。

44. **【ライズ】は「配置条件」であって効果ではない（同上・規則2の系）**＝下敷きにする材料の判定・支払いは 「src/screens/battle/riseSummon.ts」 が持ち、JSON の effects には出ない（【グロウ】条件と同じ扱い）。
    ⇒ **「【ライズ】の重ねる処理が JSON に無い」という finding は報告しない。**

45. 🔴**規則41 の適用範囲＝「任意行動を辞退したら『そうした場合』は落ちる」（2026-09-15 第354バッチで全面改訂＝旧45 は stale）**＝対象を選ばせる任意行動（「DOWN」/「BOUNCE」/「TRANSFER_TO_HAND」/「TRANSFER_TO_DECK」/「REVEAL」/「BANISH」/「ADD_TO_FIELD」 など）は 「selectOrInteract」 を通り、0体選択で 「resumeSelectTarget」 が 「stripDidItConditional」 を呼ぶ（「effectExecutor.ts:12065」「:12074」）＝直後の 「CONDITIONAL{IS_MY_TURN}」（＝「そうした場合」）は**落ちる**。候補0で対話に入らない経路も 「DID_IT_GATED_TYPES」（「:6177」）の did-it ゲートが覆う。
    ⇒ **「任意の〈対象を選ぶ行動〉を辞退しても後続の CONDITIONAL{IS_MY_TURN} が走る」という finding は報告しない。**
    ⚠**例外＝報告してよいのは次の2形だけ**＝①**「MILL」 のように 「CHOOSE{実行／しない}」 で任意性を表す型**（「execMill:10126」 の skip は**空の SEQUENCE**＝後続を止めない）②**後続が 「CONDITIONAL{IS_MY_TURN}」 ではない**形（生のアクションや別の条件＝「stripDidItConditional」 は 「IS_MY_TURN」 の CONDITIONAL しか剥がせない）。

46. **帰結が「この方法で〜した枚数／量」に比例する形はゲートが要らない（同上）**＝「addLastProcessedCount」（N＋1体）や 「deltaPerLastProcessedCount」（移動したカードのパワー合計）は、任意行動を辞退すると**自動的に 0 になる**ので、did-it ゲートが無くても原文どおりに落ちる。
    ⇒ **「任意行動を辞退しても後続が実行される」という finding は、後続が枚数/量に比例する形なら報告しない。**

47. **ルリグデッキの「シグニ」＝クラフト（同上）**＝ルリグデッキに入るシグニはクラフトだけなので、「ルリグデッキからクラフトであるシグニ」に対する 「filter:{cardType:"シグニ"}」 は原文どおり。
    ⇒ **「クラフト限定の条件が無い」という finding は報告しない**（参照元がルリグデッキのとき）。

48. **任意コスト STUB が 「CONDITIONAL{盤面条件}」 に包まれ、対の 「CONDITIONAL{IS_MY_TURN}」 が兄弟にある形は engine が包みを解く（2026-09-15 round5 r5-177 の偽陽性から追加・規則9の系）**＝「effectExecutor.ts:6269」 の 「OPT_IDS_WRAP」 が、盤面条件が不成立なら**対になる「そうした場合」の本体（直後の IS_MY_TURN / PAID_ADDITIONAL_COST ゲート）ごと読み飛ばす**。
    ⇒ **「盤面条件が任意コストだけを囲んでいて、後続の本体が条件の外にある」という finding は報告しない。**

49. 🔴**JSON の入れ子を読み違えない（同上）**＝「{"type":"CONDITIONAL","condition":…,"then":{…}}」 の 「then」 は**その CONDITIONAL の内側**であって効果定義の直下ではない。
    ⇒ **「then が CONDITIONAL の外にあるので条件成立時にも実行されない」といった finding は、入れ子を数え直してから報告する**（実測でこの誤読が出た）。

50. 🔴🔑**「実害が小さい」は偽陽性の理由にならない（2026-09-15 ユーザー指示）**＝原文と挙動が違うと分かったものは、**影響が小さくても必ず報告する**（閉じるのは Claude ではなく §5.3 への登録）。
    **偽陽性にしてよいのは ①engine／JSON の事実で「差が出ない」と示せるとき ②コーパスの実測で原文の読みが確定したとき の2つだけ。**

51. 🔴**「そうした場合」ゲートは 「DID_IT_GATED_TYPES」 だけではない＝「TRASH」 には**別建ての粗ゲート**がある（2026-09-15 「O-398」 の実測で追加）**＝「effectExecutor.ts:7320」 が、「TRASH」 の 「target.owner==="self"」 かつ 「HAND_CARD|SIGNI|ENERGY_CARD」 かつ 「bestEffort」 でない形について、空振り（「lastProcessedCards」 が空）なら**残りの SEQUENCE を丸ごとスキップ**する。live 60箇所のうち **52箇所がこれで覆われていた**（round5 で BUG 判定した13効果は**全部これ＝偽陽性**だった）。
    ⇒ **「前段が TRASH なのに後続が CONDITIONAL{IS_MY_TURN} だから did-it ゲートにならない」という finding は報告しない**（「owner:"opponent"」 か 「LIFE_CLOTH_CARD」 の形だけが例外だったが、2026-09-15 に修正済み）。

52. 🔴🔑**「CONDITIONAL{IS_MY_TURN}」 は相手のターンでも必ず成立する（同上）**＝「execUtils.ts:3507」 が 「case 'IS_MY_TURN': return true;」（executor は常にオーナー視点なので実行時には判定できず、ターン判定は収集側が 「condHas」 で行う）。
    ⇒ **「相手のターンに発火する効果なので IS_MY_TURN が false になって後続が落ちる」という finding は報告しない**（この向きの壊れ方は存在しない）。「そうした場合」ゲートの誤りは**常に過剰実行の側だけ**に出る。

53. 🔴**「対象とし」より前に「〈条件〉の場合」が来る原文で、対象宣言（「STUB{SELECT_TARGET_ONLY}」）が条件の外にあるのは既知（「O-452」・実測36効果）**＝2026-09-15 の 「O-413」（対象宣言を条件の外へ引き上げる修正）が**行きすぎた**形。
    ⇒ **「JSON は条件判定より前に対象を選んでいる」という finding は個別に報告しない**（「O-452」 に集約済み。差はある）。⚠**逆向き**（原文が「〜を対象とし、〜の場合」の順なのに対象が条件の**内側**）は 「O-413」/「O-451」 として**引き続き報告する**。

54. 🔴**自分の 「TRASH」 の空振りが後続の独立文まで消すのは既知（「O-453」・実測34効果）**＝規則51 の粗ゲート（「effectExecutor.ts:7348」 の 「return done()」）は**残りの SEQUENCE を丸ごと**捨てるので、原文が「手札を１枚捨てる。**カードを３枚引く**。（手札を捨てられなくてもカードを引ける）」のように独立している形でも後続が消える。
    ⇒ **「TRASH が空振りすると後続まで実行されない」という finding は個別に報告しない**（「O-453」 に集約済み。差はある）。

55. **「OPTIONAL_COST」 を辞退したときに後続ステップ全体が飛ぶ形は既知（「O-495」）**＝「effectExecutor.ts:7094」 の Pattern ⑤。
    ⇒ **個別には報告しない**（差はある）。

56. 🔑**ユーザー判断で決着した読み（2026-09-16・PLAN 索引H）＝BUG として報告しない。**
    - 「WDK17-009-E2」＝「対戦相手は〜を対象とする。〜の場合、対戦相手は、手札を１枚捨てそれらをトラッシュに置く」は**対象2枚のトラッシュが無条件**、手札1枚捨てだけが条件付き（「O-444」 読みA）。
    - 【起】・スペル・アーツの本文が「**手札をN枚捨てる。そうした場合、**」で始まる形は**使用コスト**（N枚そろわないと使えない＝「cost.discard」）（「O-518」 読みA）。
    - 「シグニが持つ《レイヤーアイコン》１つにつき」は**印刷された**アイコンの個数（【レイヤー】で得た能力のアイコンは数えない）（「O-404」 読みB）。

57. 🔑**engine が JSON の見た目を原文どおりに読み替えている形（2026-09-16・第367バッチの偽陽性）＝BUG として報告しない。**
    - 「ON_SIGNI_FROZEN」 で 「triggerScope」 が無い＝**既定は相手のシグニの凍結だけ**（「any_opp」）（「O-503」）。
    - 「COST_SUBSTITUTE.substituteCost.banish_self」＝**エナゾーンからこのシグニをトラッシュに置く**代替コストとして読まれる（場からのバニッシュではない）（「O-504」）。
    - 「TRANSFER_TO_DECK{position:'top'}」 の複数枚＝**選んだ順のまま**一番上に差し込む（逆順にはならない）（「O-419」）。
    - 「STUB{TARGET_OPP_SIGNI_ONLY}」＝「対戦相手のシグニ１体を対象とする。対戦相手は手札を２枚捨てないかぎり、それをデッキの一番下に置く」を**丸ごと実装**している（「O-473」）。
    - 「GRANT_EFFECT{target:SIGNI, filter:{thisCardOnly}}」 をルリグの能力が使う形＝**センター／アシストのルリグ自身に付く**（「O-488」）。
    - 「対戦相手のターン終了時、このターンにアタックしたシグニ」を 「owner:'opponent'」 に絞るのは等価（相手のターンにアタックできるのは相手のシグニだけ）（「O-493」）。
    - 「それを手札に**戻す**」は**場のシグニ**に使う言い回し（トラッシュ→手札は「手札に加える」）＝場のシグニを対象にしているのは正しい（「O-497」）。
    - 「GRANT_PLAYER_ABILITY」 の常在の中の 「SEQUENCE[POWER_MODIFY, GRANT_FIELD_SIGNI_ABILITY]」 は 「collectGrantedFromLayer」 が読む（恒久 no-op ではない）（「O-509」）。

58. 🔑**「センタールリグは以下の能力を得る」で、そのあとに続く能力が付与か本体かは「」で決まる**（2026-09-16・第369バッチ・「O-411」 が FP）。
    - 付与ブロックが**複数あるカードは原文が 「」 で括る**（「PR-257-E1」＝「…は「【起】…」「【起】…」「【起】…」を得る」）。
    - 括りが無いカードは**直後の1能力だけが付与**で、続く【出】【自】【常】は**そのキー／シグニ自身の能力**
      （「WXK01-028」 の3つ目は「**このキーを場から**ルリグトラッシュに置く」＝キー自身であることが原文から確定する）。
    ⇒ **「以下の能力を得る」の後ろの能力が付与に入っていない、という finding は報告しない**（同型30カードで検算済み）。

59. 🔴**（2026-09-16・第371バッチで**差し戻し**）「クラフトではないアーツ」は **payload（「excludeCraft」）** で表す。**
    旧規則は「「Type === 'アーツ'」 の完全一致が既にクラフトを弾いている」としていたが、それは**偶然**で、
    同じ完全一致が**原文に除外の無い残り11効果からもクラフトのアーツを奇っていた**（「O-521」で修正）。
    ⇒ いまは **原文が「クラフトではない」と書くときだけ 「trashArtsFromLrigDeck.excludeCraft」 が立つ**のが正しい形。
    書いてあるのに payload が無ければ BUG、書いていないのに payload があっても BUG。

60. 🔑**「このピースはあなたの場にルリグが３体いなくても使用できる」が 「STUB{RULE_REMINDER_TEXT}」 なのは正しい**
    （2026-09-16・第369バッチ・「O-500」）＝**緩和の対象になっているルール（ピースはルリグ3体でなければ使えない）自体が engine 未実装**なので、
    緩和も no-op でよい。⇒ **「使用条件の緩和が payload を持たない」という finding は報告しない。**

61. 🔑**ユーザー判断で決着した読み（2026-09-16・第370バッチ・PLAN 索引H）＝BUG として報告しない。**
    - **カードテキストの「【自】能力」は【出】能力を含まない**（「O-416」＝読みB）。engine は 「CardEffect.onPlayIcon」
      （parser が原文のアイコンから刻む）で分けており、「対戦相手のシグニの【自】能力が発動する場合…」の
      支払いゲート（「isSigniAutoAbility」）は【出】に掛からない。⚠「【自】：このシグニが場に出たとき」は**対象のまま**。
    - **【アンチェイン】／【サイレント】は必殺技名のような意味のない語**（「O-469」）＝コスト・使用条件ではない。
      ⇒ **JSON に現れないのが正しい**（「WX25-P2-018-E2」／「WDK13-001-E3」／「WX25-P2-030-E2」）。

62. 🔑**「原文と JSON が違う」だけでは BUG にしない（盤面差を挙げられること）**（2026-09-16・第371バッチで実測した2件）。
    - **グロウコスト軽減の「この方法で公開した」が 「HAND_COUNT_FILTER」（手札全体）になっている**（「WD13-002-E1」／「WD13-003-E1」）は報告しない。
      公開は**無償**で、原文の上限「２枚まで」は**両方の軽減に必要な公開枚数とちょうど一致する**⇒ 盤面の結果が変わらない。
    - **「そのバトル終了時に」の遅延が JSON に無い**（「PR-305-E1」）も報告しない。
      「ON_SIGNI_BATTLE」 の収集地点は**バニッシュ解決の後**に走り、トリガーはスタックへ積まれてから解決する
      ＝engine は既に「バトル終了時」に解決している。
    ⇒ **判定の型は「原文どおりの実装」と「いまの実装」で分岐を並べ、盤面の差が出る分岐を1つ以上挙げられるか」。

63. 🔑**離場置換（「場を離れる場合、代わりに〜」）が 「BANISH_SUBSTITUTE」 で表されていても BUG ではない**
    （2026-09-16・第371バッチ・「O-401」 が stale）。宣言の**名前**はバニッシュだが、読み手の
    「applyEffectLeavePowerReductionSubstitute」 は **BANISH / BOUNCE / SEND_TO_ENERGY / TRASH / EXILE / TRANSFER_TO_DECK の全経路**から呼ばれる。
    また「**他の**」の除外も 「top === victimNum」 で入っている⇒ 「excludeSelf」 が JSON に無いことも報告しない。

64. 🔑**クロス宣言（「《クロスアイコン》《相方名》の左」）はゲートではない**（2026-09-16・ユーザー判断・「O-525」 読みA）。
    宣言は**クロスできる相方と位置を示すだけ**。クロス状態でないと働かないのは 【クロス常】【クロス出】【クロス自】【クロス起】 と
    **ラベルに「クロス」と書かれた能力だけ**（【クロス出】＝クロスが成立しているときの出現時効果）。
    ⇒ **宣言の直後の普通の 【出】【自】【常】【起】 に 「crossOnly」 が無いことを報告しない**（クロスしなくても発動するのが正しい）。
    逆に、**普通のラベルの能力に 「crossOnly:true」 がある**、または **【クロス〜】 の能力に 「crossOnly」 が無い**なら BUG（WRONG）。

65. 🔑**《ヘブン》はアタックによるダウンでだけ起きる**（2026-09-16・ユーザー判断）。
    効果（「ダウンする」等）でクロス状態のシグニがダウンしてもヘブンにはならない。判定は 「BattleScreen.tsx」 のアタック処理の中だけにあり、
    engine の DOWN 系ハンドラに無いのが正しい。
    ⇒ **「効果でダウンさせたのにヘブン（「ON_HEAVEN」）が発火しない」ことを報告しない。**

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
