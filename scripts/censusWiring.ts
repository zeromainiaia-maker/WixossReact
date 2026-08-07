// 被覆マトリクス（wiring census）＝「語彙は型にも engine にも実装済みなのに、一部のアクション入口から呼ばれていない」
// を機械検出する計器。PLAN.md §5d-0 ① の常設化（2026-08-07 続き376）。
//
// 【なぜ要るか】§5d の続き369〜375 の7バッチ中4バッチが同じ形だった＝
//   「TargetFilter のキーは型にもあり matchesFilter も見ているが、parser の *一部のビルダー* が
//     そのフィルタを合成し忘れていて、その入口から作られた効果だけ制限が落ちている」。
//   例: `nonColorless` は SEARCH には載っていたがトラッシュ→デッキ／エナ→手札には載っていなかった（続き372）。
//   これを1効果ずつ原文照合で探すのは探索コストが高い。**(語彙キー × アクション入口) のマトリクス**にすると、
//   同じ語彙が「入口Aでは56件配線済み／入口Bでは6件だけ落ちている」という形で穴が一目で出る。
//
// 【作業単位が変わる】従来「1効果」だった単位が「1セル（語彙×入口）」になる。
//   セルを取る → そのセルの効果を全数原文照合 → parser の該当ビルダーへフィルタ合成を1本足す、が1バッチ。
//
// 実行: npx tsx scripts/censusWiring.ts  （npm run census:wiring）
//       --key <キー名>   … 1語彙だけに絞る（バッチを取るとき）
//       --cell <キー名>:<入口ラベル> … 1セルの効果IDを全部出す
// 出力: サマリ表を stdout、明細を docs/_census_wiring.txt（コミット対象・回帰diff用）
//
// ⚠これは**ゲートではない**（常に exit 0）。census（`npm run census`）と違って
//   「数字が増えたら回帰」ではなく「掘る場所を指す索引」。
//
// ⚠偽陽性は必ず混じる。既知の系統：
//   (a) リマインダー文（全角括弧の中）に語が出るだけ → 括弧内は除去して緩和済みだが完全ではない。
//   (b) engine が原文から直接読んでいる形（【ビート】コストの `《X》以外` ＝`analyzeBeatSigniCost`）
//       ＝JSON に語彙が無くても正しく動く。**直す対象ではなく計器の較正対象。**
//   (c) 条件節・付与文の用法（「〜を持たない場合」「〜として場に出す」）＝filter にしてはいけない。
//   したがって **セルを取るたびに全CSV走査で用法を分類してから配線する**（§5d の既存規律）。
//
// ⚠⚠**セルの miss 数は「1本直せば N 件直る」ではない**（2026-08-07 続き376b に実測で判明）。
//   判定（has/miss）は**効果単位**だが、その効果は**持っている入口ラベル全部**のセルに計上される。
//   したがって「原文にはフレーズがあるが、それは同じ効果の**別の入口**に掛かっている」効果が
//   関係ないセルにも miss として現れる（＝**クロス計上**）。
//   実測例：`cardClass × SIGNI[filter]`（miss 46）の中身は少なくとも4系統だった＝
//     ①対象フィルタの真の脱落（`WDK05-T07-E1`＝自分の全シグニを戻せる）
//     ②クロス計上（`PR-322-E1`＝クラスは対象シグニではなく**トラッシュ側**に掛かる語）
//     ③**トリガー主語**（`WX13-037-E2`＝「＜凶蟲＞のシグニがアタックしたとき」→ どのシグニでも発火）
//     ④**コスト側のフィルタ**（`WX05-044-E1`＝「他の＜古代兵器＞をバニッシュする」コスト）
//   ③は `triggerSubjectClass`（labelBy:'timing'）として分離済み。①②④の切り分けは
//   **`--cell` で原文を出して読むしかない**＝セル選定後の全数分類は省略できない。
//   **セルの miss 数は「掘る価値の指標」であって「見込み件数」ではない。**

import * as fs from 'fs';
import * as path from 'path';

// パスは他の計器スクリプト（timingCensus 等）と同じく **リポジトリルート相対**（npm scripts はルートで走る）。
const SRCTEXT = path.join('docs', '_effect_srctext.json');
const EFFECTS_DIR = path.join('public', 'data');
const OUT = path.join('docs', '_census_wiring.txt');

// ===== 語彙表 =====
// [表示名, 原文フレーズ正規表現, TargetFilter キー]
// **既に型にも engine（execUtils.matchesFilter か effectExecutor.resolveDynamicFilter）にも実装済みの語彙だけ**を載せる。
// 未実装語彙は「配線漏れ」ではなく「機構未実装」＝§6.3 の領分なのでここには載せない。
//
// `key` は表示名。JSON 側で探すキーが表示名と違う／複数ありうる場合だけ `jsonKeys` を書く
// （例: ＜クラス＞は歴史的経緯で `story` と `cardClass` の2名があり、どちらでも「配線済み」）。
//
// `labelBy:'timing'` は**入口ラベルを差し替える**指定。トリガー主語のように
// 「直す場所がアクションの target ではなく **timing の抽出側**」の語彙は、アクション別ラベルに
// 散らすと大セルに埋もれてしまう（実際 `ON_ATTACK_SIGNI` の8件は `cardClass × POWER_MODIFY{SIGNI}`
// 等に紛れていた）。timing でまとめると「どの timing の抽出を直せばよいか」がそのままセルになる。
// `jsonRe` は `jsonKeys` の逃げ道＝**キー名だけでは等価表現を判定できない**語彙に使う
// （例: `noGuard:true` と `hasGuard:false` は `matchesFilter`（execUtils:663-668）で**完全に等価**なので、
//  キー名照合だけだと後者を miss と誤検出する＝続き377b で `WXDi-P11-008-E3` がこれだった）。
interface Vocab { key: string; re: RegExp; jsonKeys?: string[]; jsonRe?: RegExp; note?: string; labelBy?: 'timing'; }
const VOCAB: Vocab[] = [
  // --- 静的カード属性（execUtils.matchesFilter） ---
  { key: 'noGuard',          re: /《ガードアイコン》を持たない/, jsonRe: /"noGuard"\s*:|"hasGuard"\s*:\s*false/ },
  { key: 'hasGuard',         re: /《ガードアイコン》を持つ/, jsonRe: /"hasGuard"\s*:\s*true|"noGuard"\s*:\s*false/ },
  { key: 'noRiseIcon',       re: /《ライズアイコン》を持たない/ },
  // ⚠**アイコンは2つのキー綴りが併存している**（続き377c 実測）＝専用キー `hasRiseIcon`/`hasCrossIcon` と
  //   汎用キー `hasIcon:'ライズ'|'クロス'`。`matchesFilter` は両方を見ており（execUtils:624-626 と :689-698）、
  //   ライズは判定式まで同一（どちらも `EffectText.includes('【ライズ】')`）、クロスも実データで 74 vs 73（差は `WX10-060` 1枚）。
  //   キー名照合だけだと `hasIcon` 側を全部 miss と誤検出する（cross は miss 22 のうち実質4件だけが本物だった）。
  { key: 'hasRiseIcon',      re: /《ライズアイコン》を持つ/,  jsonRe: /"hasRiseIcon"\s*:|"hasIcon"\s*:\s*"ライズ"/ },
  { key: 'hasCrossIcon',     re: /《クロスアイコン》を持つ/, jsonRe: /"hasCrossIcon"\s*:|"hasIcon"\s*:\s*"クロス"/ },
  // ディソナは「《ディソナアイコン》のシグニ／のカード」という**連体の「の」**で書かれる（「を持つ」形は原文に無い）
  { key: 'isDisona',         re: /《ディソナアイコン》の/ },
  { key: 'excludeResona',    re: /レゾナではない/ },
  { key: 'nonColorless',     re: /無色ではない/ },
  { key: 'noAbilities',      re: /能力を持たない/ },
  { key: 'levelParity',      re: /レベルが(奇数|偶数)|(奇数|偶数)のレベル/ },
  { key: 'excludeCardName',  re: /《[^》]+》以外の/ },
  { key: 'eachDistinctLevel', re: /それぞれレベルの異なる/, note: '選択補助のみ（厳密enforceはTODO）' },
  { key: 'eachDistinctColor', re: /それぞれ共通する色を持たない/, note: '選択補助のみ（厳密enforceはTODO）' },

  // --- 動的比較（effectExecutor.resolveDynamicFilter） ---
  { key: 'levelEqTrigger',   re: /そのシグニと同じレベル/ },
  { key: 'levelLtTrigger',   re: /そのシグニより低いレベル/ },
  { key: 'levelGtTrigger',   re: /そのシグニより高いレベル/ },
  { key: 'powerLtTrigger',   re: /そのシグニよりパワーの低い/ },
  { key: 'powerLteTrigger',  re: /そのシグニのパワー以下/ },
  { key: 'powerLtSelf',      re: /この(シグニ|カード)よりパワーの低い|自身よりパワーの低い/ },
  { key: 'powerGtSelf',      re: /この(シグニ|カード)よりパワーの高い/ },
  { key: 'powerLteSelf',     re: /この(シグニ|カード)のパワー以下|自身のパワー以下/ },
  { key: 'levelLtSelf',      re: /この(シグニ|カード)より低いレベル/ },
  { key: 'levelGtSelf',      re: /この(シグニ|カード)より高いレベル/ },

  // --- 盤面状態（matchesStateFilter） ---
  { key: 'isAwakened',       re: /覚醒状態(のシグニ|の)/ },
  { key: 'isDrive',          re: /ドライブ状態/ },
  { key: 'crossState',       re: /クロス状態/ },
  { key: 'isPuppet',         re: /傀儡状態/ },

  // --- 大クラスタ語彙（2026-08-07 続き376b 追加）---
  // ⚠上の「マイナーな真偽値フラグ」群と**性質が違う**＝原文にも live JSON にも大量にあり、
  //   **has が桁で大きい**（`cardClass` は 1407 配線済み／154 未配線）。つまり
  //   **miss 率が低いぶん、miss したセルは「同じ入口の他は全部正しいのにこれだけ落ちた」＝穴が濃い。**
  //   ②の無作為20件でも配線ギャップ5件中2件がここ（`WX12-016-E1` の色／`WXDi-P02-073-E1` の level:1）だった。
  // ⚠**この5キーは誤検出も多い。**（a）**条件節用法**＝「あなたの場に＜天使＞のシグニがある場合」は
  //   対象フィルタではない（`(filter無)` ラベルのセルはこれが濃い）。（b）**コスト文・リマインダー文**。
  //   （c）**数値が filter ではなく action の値**＝「パワーを＋10000」「基本パワーを1にする」は
  //   `powerRange` ではなく `POWER_MODIFY`/`POWER_SET` の値。
  //   **セルを取るたびに全CSV走査で用法を分類する**という §5d の規律は、ここでは特に外せない。
  // ⚠**条件節・コスト軽減の用法を除く**（続き377e 較正）＝「あなたの場に＜X＞のシグニが**ある場合**／**あるかぎり**」
  //   「＜X＞のシグニ**１体につき**《赤×1》減る」「トラッシュに＜X＞のシグニが**１８枚以上ある**かぎり」は
  //   `HAS_CARD_IN_FIELD` やコスト軽減の領分であって **TargetFilter ではない**。実測 38効果がこれだけで miss に居た。
  //   ⚠**否定先読みなので、同じ効果に対象用法が別にあれば従来どおり miss に残る**（混在ケースは落とさない）。
  // ⚠**`triggerCondition` 側の `*Story` 系も「配線済み」に数える**（続き377f 較正）＝トリガーの
  //   **原因カード／host カード**のクラス限定は `TargetFilter.story` ではなく専用キー（`banishedSourceStory`
  //   ＝「あなたの＜X＞のシグニの**効果によって**」／`accedHostStory`＝「＜X＞のシグニに**付いたとき**」等）
  //   に載る。キー名照合だけの計器はこれを見落として **配線済みの効果を miss と誤検出**していた
  //   （trap (h)「同じ概念に2つのキー綴りが併存」と同型）。
  { key: 'cardClass',   re: /＜[^＞]{1,8}＞の(?:シグニ|カード)(?![^。]{0,10}?(?:がある|がいる|があるかぎり|につき|以上ある|以上あるかぎり|種類以上|の数))/,   jsonKeys: ['story', 'cardClass', 'banishedSourceStory', 'accedHostStory', 'trashSourceStory', 'milledSourceStory', 'discardCostSourceStory', 'drawBySourceStory', 'powerDecreaseSourceStory'], note: '大クラスタ・対象名詞句用法のみ' },
  // ⚠**名詞に係る形だけを見る**（続き377d 較正）＝素の `/レベルN以上|以下/` は
  //   **ルリグのレベル条件**（「センタールリグが**レベル４以上**であるかぎり／の場合」）・**使用条件**・
  //   **【チーム】全員レベルN以上**にも当たり、TargetFilter とは無関係な 59件を miss に混ぜていた。
  //   実測＝`levelRange × GRANT_KEYWORD{SIGNI}`（miss 9）は**9件すべて**がこれだった。
  { key: 'levelRange',  re: /レベル[０-９0-9]+以(?:上|下)の(?:[^。、]{0,20}?)?(?:シグニ|カード|スペル|ルリグ|レゾナ)/, jsonKeys: ['level', 'levelRange'], note: '大クラスタ' },
  { key: 'levelExact',  re: /レベル[０-９0-9]+の(シグニ|カード)/, jsonKeys: ['level', 'levelRange'], note: '大クラスタ・レベル丁度' },
  { key: 'color',       re: /[白赤青緑黒]の(シグニ|カード|スペル)/, jsonKeys: ['color'], note: '大クラスタ' },
  { key: 'powerRange',  re: /パワー[0-9０-９,，]+以(上|下)/,      jsonKeys: ['powerRange'], note: '大クラスタ・action の値との取り違えに注意' },

  // --- トリガー主語（timing の抽出側で直す）---
  // 「あなたの＜凶蟲＞のシグニ1体がアタックしたとき」＝**誰が引き金か**の限定。落ちると
  // 「どのシグニがアタックしても発火」する過剰効果になる（`WX13-037-E2` ほか実測）。
  // 直す場所は target の filter ビルダーではなく **parser の timing/トリガー抽出**なので `labelBy:'timing'`。
  { key: 'triggerSubjectClass', re: /(あなた|対戦相手)の(他の)?＜[^＞]{1,8}＞の(シグニ|カード)[^、。]{0,12}?が[^、。]{0,10}?(とき|たび)/,
    jsonKeys: ['triggerFilter'], labelBy: 'timing', note: 'トリガー主語のクラス限定' },
];

// ===== 入力 =====
function loadSrcText(): Record<string, string> {
  if (!fs.existsSync(SRCTEXT)) {
    console.error(`[census:wiring] ${SRCTEXT} が無い。先に \`npm run build:effects\` を回すこと。`);
    process.exit(0);
  }
  return JSON.parse(fs.readFileSync(SRCTEXT, 'utf8'));
}

// live JSON はこの計器にとって「木を歩いて type/target を拾うだけ」の相手なので、
// src/types/effects.ts の厳密な型は引かずに最小の構造だけ宣言する（計器を型変更に巻き込まない）。
interface EffectObj { effectId?: string; parseStatus?: string; timing?: unknown[]; action?: unknown; condition?: unknown; cost?: unknown; }
interface EffectRec { effectId: string; cardNum: string; json: string; obj: EffectObj; }
function loadEffects(): Map<string, EffectRec> {
  const out = new Map<string, EffectRec>();
  for (const f of fs.readdirSync(EFFECTS_DIR)) {
    if (!/^effects_.*\.json$/.test(f)) continue;
    const j: unknown = JSON.parse(fs.readFileSync(path.join(EFFECTS_DIR, f), 'utf8'));
    for (const [cardNum, effs] of Object.entries(j as Record<string, EffectObj[]>)) {
      if (!Array.isArray(effs)) continue;
      for (const e of effs) {
        if (!e?.effectId) continue;
        out.set(e.effectId, { effectId: e.effectId, cardNum, json: JSON.stringify(e), obj: e });
      }
    }
  }
  return out;
}

// リマインダー文（全角括弧の中）を落とす。キーワード能力の説明文に語彙語が出るだけの偽陽性を減らす。
function stripReminder(t: string): string {
  return t.replace(/（[^（）]*）/g, '');
}

// ===== 入口ラベル =====
// 「filter を保持しうるアクション」を `アクション型{ターゲット型}` でラベル化する。
// これが parser のビルダー1本にほぼ対応する＝配線を足す先の単位。
function entryLabels(eff: EffectObj): string[] {
  const labels = new Set<string>();
  const walk = (node: unknown): void => {
    if (node === null || typeof node !== 'object') return;
    if (Array.isArray(node)) { node.forEach(walk); return; }
    const rec = node as Record<string, unknown>;
    const t = rec.type;
    if (typeof t === 'string') {
      const tgt = rec.target as Record<string, unknown> | undefined;
      if (tgt && typeof tgt === 'object' && typeof tgt.type === 'string') {
        labels.add(`${t}{${tgt.type}}`);
      }
      // target を持たないが filter を直接持つ形（countFilter / triggerFilter / cost 内 filter 等）
      for (const k of ['filter', 'countFilter', 'triggerFilter', 'sourceFilter']) {
        if (rec[k] && typeof rec[k] === 'object' && !rec.target) labels.add(`${t}[${k}]`);
      }
    }
    for (const v of Object.values(rec)) walk(v);
  };
  walk(eff.action);
  if (eff.condition) walk(eff.condition);
  if (eff.cost) walk(eff.cost);
  if (labels.size === 0) labels.add('(filter無)');
  return [...labels];
}

// ===== 集計 =====
interface Cell { has: string[]; miss: string[]; }

// ★の意味＝「**同じ入口で既に配線済みの効果がどれだけあるか**」＝穴の確からしさ。
// 大クラスタ語彙（cardClass 等）は has が桁で大きいので、has>0 だけでは全部★になって選別に使えない。
// has が多いほど「他は全部正しいのにこれだけ落ちた」＝実バグの確度が高い、として段階化する。
function starOf(c: Cell): string {
  if (c.has.length >= 20) return '★★同入口に20件以上の配線済み＝穴がほぼ確実';
  if (c.has.length >= 5) return '★同入口に配線済みあり＝穴が濃い';
  if (c.has.length > 0) return '（同入口の配線済みは僅少＝先に用法分類を）';
  return '（同入口に配線済みなし＝機構未実装の可能性）';
}

function main(): void {
  const args = process.argv.slice(2);
  const onlyKey = args.includes('--key') ? args[args.indexOf('--key') + 1] : undefined;
  const onlyCell = args.includes('--cell') ? args[args.indexOf('--cell') + 1] : undefined;

  const src = loadSrcText();
  const effects = loadEffects();

  // キー単位の総計（has が全0の語彙を落とすため）
  const keyTotal = new Map<string, { has: number; miss: number }>();
  // セル単位
  const cells = new Map<string, Map<string, Cell>>(); // key -> label -> Cell
  let scanned = 0, skippedStub = 0, skippedManual = 0, noText = 0;

  for (const [effectId, rec] of effects) {
    const raw = src[effectId];
    if (typeof raw !== 'string' || !raw) { noText++; continue; }
    // STUB / MANUAL は別経路（parser が作っていない or 手管理）なので除外する。
    if (rec.json.includes('"STUB"') || rec.json.includes('STUB_')) { skippedStub++; continue; }
    if (rec.obj.parseStatus === 'MANUAL') { skippedManual++; continue; }
    scanned++;

    const text = stripReminder(raw);
    const labels = entryLabels(rec.obj);
    // labelBy:'timing' の語彙用＝【自】のトリガー種別そのものを入口にする
    const timings = Array.isArray(rec.obj.timing) && rec.obj.timing.length
      ? rec.obj.timing.map(t => `TRIGGER{${String(t)}}`) : ['TRIGGER{(timing無)}'];

    for (const v of VOCAB) {
      if (onlyKey && v.key !== onlyKey) continue;
      if (!v.re.test(text)) continue;
      // jsonKeys のどれか1つでも載っていれば「配線済み」（＜クラス＞の story/cardClass のような別名対応）
      const hasKey = v.jsonRe ? v.jsonRe.test(rec.json)
        : (v.jsonKeys ?? [v.key]).some(k => new RegExp(`"${k}"\\s*:`).test(rec.json));
      const tot = keyTotal.get(v.key) ?? { has: 0, miss: 0 };
      if (hasKey) tot.has++; else tot.miss++;
      keyTotal.set(v.key, tot);

      let byLabel = cells.get(v.key);
      if (!byLabel) { byLabel = new Map(); cells.set(v.key, byLabel); }
      for (const lb of (v.labelBy === 'timing' ? timings : labels)) {
        let c = byLabel.get(lb);
        if (!c) { c = { has: [], miss: [] }; byLabel.set(lb, c); }
        (hasKey ? c.has : c.miss).push(effectId);
      }
    }
  }

  // --cell モード＝1セルの効果IDを全部出して終わり（バッチの入口）
  if (onlyCell) {
    const [k, lb] = onlyCell.split(':');
    const c = cells.get(k)?.get(lb);
    if (!c) { console.log(`セル ${onlyCell} は空`); return; }
    console.log(`# セル ${k} × ${lb}  has=${c.has.length} miss=${c.miss.length}`);
    console.log('## miss（原文にフレーズがあるのに JSON にキーが無い＝配線候補）');
    for (const id of c.miss) console.log(`  ${id}\t${stripReminder(src[id] ?? '').slice(0, 90)}`);
    console.log('## has（既に配線済み＝正しい形の見本）');
    for (const id of c.has) console.log(`  ${id}`);
    return;
  }

  // has が一度も無い語彙＝「未実装」であって「配線漏れ」ではない（§6.3 の領分）ので落とす
  const live = [...keyTotal.entries()].filter(([, t]) => t.has > 0);
  const dead = [...keyTotal.entries()].filter(([, t]) => t.has === 0 && t.miss > 0);

  const lines: string[] = [];
  const emit = (s = ''): void => { lines.push(s); console.log(s); };

  emit('===== 被覆マトリクス（wiring census）=====');
  emit(`走査効果 ${scanned}（STUB除外 ${skippedStub} / MANUAL除外 ${skippedManual} / 原文なし ${noText}）`);
  emit('');
  emit('--- 語彙キー別サマリ（miss 降順）---');
  emit('  miss   has  語彙キー');
  live.sort((a, b) => b[1].miss - a[1].miss);
  let totalMiss = 0;
  for (const [k, t] of live) {
    totalMiss += t.miss;
    const note = VOCAB.find(v => v.key === k)?.note;
    emit(`${String(t.miss).padStart(6)}${String(t.has).padStart(6)}  ${k}${note ? `  ※${note}` : ''}`);
  }
  emit(`${String(totalMiss).padStart(6)}        合計`);

  if (dead.length) {
    emit('');
    emit('--- 除外：一度も配線されていない語彙（＝配線漏れではなく機構未実装／計器の誤検出）---');
    for (const [k, t] of dead) emit(`  ${k}  miss=${t.miss} has=0`);
  }

  emit('');
  emit('--- セル別明細（miss 降順・上位のみ stdout／全量は docs/_census_wiring.txt）---');
  const allCells: { key: string; label: string; c: Cell }[] = [];
  for (const [k, byLabel] of cells) {
    if (!keyTotal.get(k)?.has) continue;
    for (const [lb, c] of byLabel) if (c.miss.length) allCells.push({ key: k, label: lb, c });
  }
  allCells.sort((a, b) => b.c.miss.length - a.c.miss.length);
  allCells.slice(0, 30).forEach(({ key, label, c }) => {
    emit(`  miss=${String(c.miss.length).padStart(3)} has=${String(c.has.length).padStart(4)}  ${key} × ${label}  ${starOf(c)}`);
  });

  // 明細ファイル（全量）
  lines.push('');
  lines.push('===== セル別 全明細 =====');
  for (const { key, label, c } of allCells) {
    lines.push('');
    lines.push(`## ${key} × ${label}   miss=${c.miss.length} has=${c.has.length}`);
    for (const id of c.miss) {
      lines.push(`   MISS ${id}\t${stripReminder(src[id] ?? '').replace(/\s+/g, ' ').slice(0, 110)}`);
    }
    if (c.has.length) lines.push(`   （配線済み見本: ${c.has.slice(0, 8).join(', ')}${c.has.length > 8 ? ' …' : ''}）`);
  }
  fs.writeFileSync(OUT, lines.join('\n') + '\n', 'utf8');
  console.log('');
  console.log(`明細 → ${OUT}`);
  console.log('セル1本を取るときは `npx tsx scripts/censusWiring.ts --cell <キー>:<入口ラベル>`');
}

main();
