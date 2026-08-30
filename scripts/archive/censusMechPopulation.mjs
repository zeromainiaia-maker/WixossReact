/**
 * censusMechPopulation.mjs — PLAN §5.3 の各 `O-nn` の母集団を実測する（2026-08-30 続き736 新設・同日 全面改訂）
 *
 * ## なぜ要るか
 * §5.3 の登録票は**分離のきっかけになった1枚しか書いていない**ことが多く（「母集団未計測」が頻出）、
 * 「取る順」表が誤った地図になっていた。**2026-08-30 の1巡で、投入前実測が6回中6回とも登録票の見立てを訂正した。**
 *
 * ## 🔴 使うときの鉄則（全部 2026-08-30 に実際に踏んだ）
 * 1. **`liveRe` を推測で書かない。** 実キーを grep して確定する。初回は推測キーで `O-173` を 34枚と誤報した
 *    （実キー `$ref:last_processed_count` を知らなかった）。**未確定なら null にして `*` 印で出す。**
 * 2. **`srcRe` を広く取らない。**「【使用条件】」「【ライズ】」のような多用語を拾うと桁で過大に出る。
 * 3. **ルール注記を除外する。**「（シグニとのバトルやパワーが０以下になった場合はバニッシュされる）」のような
 *    丸括弧の中は効果ではない（PLAN 付録B-4）。`O-166` は16枚中9枚がこれだった。**既定で括弧内を落とす。**
 * 4. **カードの全効果を舐める。** `-BURST` を見落として「live に無い」と誤判定した（`WX21-028`）。
 * 5. ⇒ **この表は桁を見るための上限**。着手時は必ず生データへ戻して用法で割り直す。
 *
 * ## 🔴🔴 2026-08-30 の結論＝**この測り方には構造的な限界がある（9回連続で外した）**
 *
 * 「原文にフレーズがあるのに live にキーが無い」という測り方は、
 * **受け皿の"別名"を全部知らないかぎり必ず過大に出る。** 同日の実測で9回とも同じ外し方をした：
 *
 * | 項目 | 表の値 | 実際 | 見落としていた別名 |
 * |---|---|---|---|
 * | `O-173` | 34枚 | 4枚 | `$ref:last_processed_count` / `deltaPerCharm` / `addLastProcessedCount` |
 * | `O-175` | 17枚 | 8枚 | `STUB{PLACE_TRAP_OPTIONAL}`（別ハンドラで任意性を実装済み） |
 * | `O-166` | 15枚 | 6枚 | ルール注記9枚（丸括弧内＝効果ではない） |
 * | `O-159` | 10枚 | 1枚 | `PREVENT_ABILITY_GAIN_BY_OPP` ほか3本の STUB |
 * | `O-161` | 5枚 | 3枚 | `sharedColor:'none'`（BURST 側を見ていなかった） |
 * | `O-161`（再） | 2枚 | 4枚 | 🔴**逆方向**＝`NO_COMMON_COLOR_AMONG_FIELD_SIGNI` を受け皿と数えたが**意味が違った** |
 * | `census:wiring` の最大セル | 24枚 | **1枚** | `colorNotMatchesLrig`（エナ対象では対象オーナー基準で解決＝正しい） |
 * | `O-106` | 25枚 | 数枚 | `hasNoAbilities` ほか |
 *
 * 🔑**含意＝「受け皿の名前を知っている必要がある」計器は、知らない穴を測れない。**
 * **より信頼できるのは §5.2 の意味照合台帳**（LLM が原文と JSON を意味で比較するので、
 * **受け皿の名前を知らなくても「意味が違う」を検出できる**）＝これが「段1 で真バグ確定」の価値。
 * ⇒ **この計器は「§5.3 の項目に着手する前のふるい」として使い、在庫の見積もりには使わない。**
 *
 * 実行: node scripts/archive/censusMechPopulation.mjs [--id O-nn]
 */
import fs from 'fs';
import Papa from 'papaparse';

const only = (() => { const i = process.argv.indexOf('--id'); return i >= 0 ? process.argv[i + 1] : null; })();

const rows = new Map();
for (const f of fs.readdirSync('public/data').filter(f => /^CardData_.*\.csv$/.test(f)).sort())
  for (const r of Papa.parse(fs.readFileSync('public/data/' + f, 'utf-8'), { header: true, skipEmptyLines: true }).data) {
    const n = (r.CardNum ?? '').trim(); if (n && !rows.has(n)) rows.set(n, r);
  }
const live = {};
for (const f of fs.readdirSync('public/data').filter(f => /^effects_.*\.json$/.test(f)))
  Object.assign(live, JSON.parse(fs.readFileSync('public/data/' + f, 'utf-8')));

const T = c => ((c.EffectText ?? '') + ' ' + (c.BurstText ?? '')).replace(/\s+/g, '');
// 🔴ルール注記（丸括弧の中）を落とした本文＝「効果として書かれているか」を見る（PLAN 付録B-4）。
const TB = c => T(c).replace(/（[^）]*）/g, '');
const J = n => JSON.stringify(live[n] ?? []);

// [id, 一言, srcRe, liveRe|null, opts]  liveRe:null＝第1段のみ（実キー未確定。推測で書かない）
const P = [
  ['O-83',  '条件つきグロウ',            /センタールリグ.{0,20}(レベルが|より).{0,12}(低い|少ない).{0,30}グロウ/, null],
  ['O-84',  '条件つき追加使用タイミング',  /追加で《アタックフェイズアイコン》/, null],
  ['O-85',  '場のシグニ数で置換',         /場にシグニが.{0,6}体ある場合、代わりに/, null],
  ['O-147', '複数体ライズ',              /【ライズ】.{0,24}シグニ[２2３3]体の上に置く/, null],
  ['O-148', 'ウィルスを好きな数',         /【ウィルス】を好きな数/, /virusCount":"any"/],
  ['O-151', '合わせて±N',               /合わせて.{0,6}(＋|－)/, null],
  ['O-154', 'その中にNクラス枚以上',      /その中に＜[^＞]{1,8}＞のシグニが.{0,4}枚以上/, null],
  ['O-155a','同じパワーを持つ制約',       /同じパワーを持つ/, /"same":"power"/],
  ['O-155b','コストの合計が異なる',       /コストの合計が.{0,8}異な/, null],
  ['O-156', '場に【トラップ】がある',      /場に【トラップ】が/, /FIELD_HAS_TRAP|hasTrap/],
  ['O-158', 'エナのアクセを選ぶ',         /エナゾーンから.{0,30}【アクセ】にする/, /ATTACH_ACCE/],
  ['O-159', '新たに得られない(一過性)',   /新たに.{0,8}得られない/, /ability_gain_blocked_this_turn|PREVENT_ABILITY_GAIN_BY_OPP|PREVENT_OPP_SIGNI_ABILITY_GAIN|PREVENT_ABILITY_CHANGE_BY_OPP|SUPPRESS_GAIN_ABILITY/],
  ['O-160', '相手がダメージを受けたとき',  /対戦相手がダメージを受けたとき/, null],
  // 🔴`NO_COMMON_COLOR_AMONG_FIELD_SIGNI` を受け皿に数えてはいけない（2026-08-30 続き736 に実測して訂正）。
  // あれは**場のシグニ同士の相互比較**で「効果元1体と他のシグニの色比較」ではない＝**似て非なる受け皿**。
  // 数えていたせいで `SP27-012-E1` / `WX21-039-E1`（どちらも誤用したまま）を「受け皿あり」と誤報していた。
  ['O-161', '効果元と共通する色を持たない', /この(シグニ|カード)と共通する色を持たない/, /noCommonColorWithSelf|distinctColors/],
  ['O-162', 'プレイヤーを選ぶ',           /プレイヤーを.{0,8}人(まで)?(を)?選/, null],
  ['O-164', '次にバニッシュされる場合',    /次に.{0,14}バニッシュされる場合/, null],
  ['O-165', '相手ターンの間の効果耐性',    /対戦相手のターンの間.{0,40}(効果を受けない|対象にならない)/, null],
  ['O-167', 'コスト:このシグニを手札に戻す', /：?このシグニを場から手札に戻す/, null],
  ['O-168', '場とトラッシュだけの領域限定', /場とトラッシュ/, null],
  ['O-169', '被バニッシュ直前の状態',      /バニッシュされたとき.{0,40}【チャーム】/, /banishedHadCharm/],
  ['O-170', '表記パワーと異なる',          /表記されているパワーと異なる/, null],
  ['O-171', '両者のエナ合計',             /(あなたと対戦相手の.{0,12}エナゾーン|エナゾーンにあるカードの合計)/, null],
  ['O-172', '正面の〜であるかぎり',        /正面のシグニの(パワー|レベル)が.{0,12}(以上|以下).{0,8}(かぎり|限り)/, /FRONT_SIGNI_POWER|frontOfSelf/],
  ['O-173', 'N枚につき対象を取り直す',     /この方法で(捨て|トラッシュに置い)た.{0,12}１枚につき/, /last_processed_count|levelEqLastProcessed|ARTS_COST_REDUCTION_BY_EFFECT|POWER_MOD_PER|deltaPerLastProcessedCount|perLastProcessed|deltaPerCharm|countPerLastProcessed|addLastProcessedCount/],
  ['O-174', '同ゾーンのウィルス',          /同じシグニゾーンにある【ウィルス】/, null],
  ['O-176', 'このターン〜バニッシュ',      /このターン、あなたの.{0,34}(バニッシュされたとき|バニッシュしたとき)/, /INSTALL_DELAYED_TRIGGER/],
  ['O-78',  '同名の配置禁止',             /同じ名前の.{0,14}新たに場に出せない/, null],
  ['O-79',  '配置元の効果を限定',          /効果によってしか.{0,14}場に出せない/, null],
  ['O-74',  '例外つき出撃制限',            /効果以外によっては.{0,14}場に出せない/, null],
  ['O-52',  'めくれるまで公開',            /めくれるまで/, /REVEAL_UNTIL|untilReveal|revealUntil/],
  ['O-58',  'バニッシュ回避ladder',        /バニッシュされる場合、代わりに/, /BANISH_SUBSTITUTE/],
  ['O-69',  'この方法でN枚トラッシュ',      /この方法で.{0,14}枚以上.{0,14}トラッシュに置かれた/, null],
  ['O-70',  '下に置く複合対象',            /それらを.{0,10}の下に置く/, null],
  ['O-96',  'そうした場合それを',          /してもよい。そうした場合、それ/, /targetsStored|targetsLastProcessed|STORE_LAST_PROCESSED_TARGETS/],
  ['O-101', 'そうしない場合',              /そうしない場合/, null],
  ['O-103', '行き先3択',                  /手札に加えるか.{0,14}エナゾーンに置くか.{0,14}場に出/, null],
  ['O-105', '下のカードの合計枚数',         /下にあるカードの合計/, null],
  ['O-110', '最初のリフレッシュ',           /最初のリフレッシュ/, null],
  ['O-137', 'デッキトップとライフを入替',    /(デッキの一番上|チェックゾーン).{0,24}入れ替え/, null],
  ['O-138', 'チェックゾーンにスペル',        /チェックゾーンに.{0,10}スペル/, null],
  ['O-139', 'クラスの効果で手札から場に',     /の効果によって手札から場に出/, null],
  ['O-136', '相手の使用スペル枚数でコスト減', /対戦相手が.{0,14}使用した.{0,8}(スペル|アーツ)/, null],
  ['O-163', '色/アイコンを宣言',            /(色|アイコン)を.{0,4}つ宣言/, null],
  ['O-92',  'このターン〜したとき(遅延)',    /このターン、(あなた|対戦相手)の.{0,30}(したとき|されたとき|出たとき)、/, /INSTALL_DELAYED_TRIGGER/],
  ['O-95',  '自己基準の色非共通(場の条件)',   /場に.{0,20}共通する色を持たない/, /NO_COMMON_COLOR_AMONG_FIELD_SIGNI/],
  ['O-104', '数字を宣言し中間動作',          /数字[１1]つを宣言(し|する)[、,].{0,20}(その数字|それ)と同じ/, /DECLARE_NUMBER|declaredNumber|TK3_DECLARE/],
  ['O-106', 'トリガー元の能力の有無',        /能力を持たない.{0,14}(シグニ|カード)/, /LAST_PROCESSED_HAS_NO_ABILITIES/],
  ['O-71',  '遅延本文の照応',               /そのターン終了時[、,].{0,10}それら?を/, null],
  ['O-97',  '【使用条件】が2つ以上',         null, null, { count2: /【使用条件】/g }],
  ['O-128', '引用能力付与',                 null, /GRANT_ABILITY_INNER_TEXT/, { liveOnly: true }],
];

// ── 原文 grep が意味を持たない項目（engine / 計器 / UI 経路の問題）──
const NOT_TEXT = [
  ['O-60',  'engine のカード全文 regex',       'npm run census:enginetext が専用計器（A 130行/127ハンドラ）'],
  ['O-86',  'UI 層のコスト再パース',           '支払いのたびに原文を 30本超の regex で読み直す'],
  ['O-93',  'manualEffects の古い shadow',     'npx tsx scripts/censusManualDrift.ts が専用計器'],
  ['O-109', 'ON_ATTACK_SIGNI 遅延の収集漏れ',  '収集経路の問題＝原文に現れない'],
  ['O-114', 'スペル/アーツの起動が UI から不可', 'UI 経路'],
  ['O-118', 'エクシード色指定が経路依存',       'UI 経路'],
  ['O-130', 'ON_OPP_ARTS_USE の帰結が指せない', 'engine の参照系'],
  ['O-132', 'census が JSON の語彙を知らない',  '計器自身の較正（残 未調査 491）'],
  ['O-134', '代わりに帯分解が census で偽陽性', '計器自身の較正'],
  ['O-145', 'execTransferToDeck が optional 無視', 'executor の分岐'],
  ['O-146', 'underCardOp が任意を強制',        'executor の分岐'],
  ['O-150', 'remainder.reorder が唯一でない',   '要調査（実機で挙動不変だった）'],
  ['O-152', 'ON_HAND_DISCARDED が発火しない',  'watcher の発火経路'],
  ['O-153', 'LOOK_PICK_CHAIN が行き先を混ぜる', 'executor の状態管理'],
  ['O-59',  '固定ゾーンへの設置/再配置対話',    'UI 機構'],
  ['O-72',  'ON_ATTACK_PHASE_START の収集漏れ', '収集経路'],
  ['O-94',  '配置制限 collector の呼び出し漏れ', '呼び出し経路'],
  ['O-68',  '複合コストの残り3種',              '原文が定型でない＝1件ずつ読む'],
];

const out = [];
for (const [id, name, srcRe, liveRe, opts] of P) {
  if (only && id !== only) continue;
  let hit;
  if (opts && opts.liveOnly) hit = [...rows.keys()].filter(n => liveRe.test(J(n)));
  else if (opts && opts.count2) hit = [...rows.entries()].filter(([, c]) => (T(c).match(opts.count2) ?? []).length >= 2).map(([n]) => n);
  else hit = [...rows.entries()].filter(([, c]) => srcRe.test(TB(c))).map(([n]) => n);
  const miss = (liveRe && !(opts && opts.liveOnly)) ? hit.filter(n => !liveRe.test(J(n))) : hit;
  out.push({ id, name, src: hit.length, real: miss.length, hasLive: !!liveRe && !(opts && opts.liveOnly), ex: miss.slice(0, 5).join(' ') });
}
out.sort((a, b) => b.real - a.real);

console.log('ID        一言                          原文  真の候補  例');
console.log('-'.repeat(112));
for (const r of out) {
  console.log(`${r.id.padEnd(9)} ${r.name.padEnd(28)} ${String(r.src).padStart(4)}  ${String(r.real).padStart(6)}${r.hasLive ? ' ' : '*'}  ${r.ex}`);
}
console.log('\n* ＝ liveRe 未確定（実キーを grep していない）＝原文該当のまま。過大に出る。');
console.log(`合計（真の候補・延べ）: ${out.reduce((s, r) => s + r.real, 0)} 枚 / 測定 ${out.length} 項目`);

if (!only) {
  console.log('\n===== 原文 grep が意味を持たない項目（engine / 計器 / UI 経路）=====');
  for (const [id, name, why] of NOT_TEXT) console.log(`  ${id.padEnd(8)} ${name.padEnd(32)} ${why}`);
}
