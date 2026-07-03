// 語彙センサス（vocab census）＝原文の修飾句パターン × effects JSON の対応語彙の全数突き合わせ lint
//
// 既存の検出網（behavior-audit キュー＝無変化no-op／脱落疑い＝文数比較／smoke＝クラッシュ）は
// すべて「効果が足りない側」を見る網で、対象フィルタ脱落による**過剰効果**
// （例: SP07-010「最も大きいパワーを持つすべて」→無条件 BOUNCE ALL）は盤面が変化するため掛からない。
// 本 lint はその死角＝「原文に修飾句があるのに JSON に対応語彙が無い」カードを機械抽出する。
// 2026-07-04 続き18 で逆方向（JSON にあるのに原文に無い＝幻覚/取り違え）と構造軸
// （能力マーカー/引用付与平坦化/BURST内IS_MY_TURN/BURST↔E1誤配置/アーツタイミング列）を追加＝両方向網。
//
// 実行: npx tsx scripts/vocabCensus.ts  （npm run census）
// 出力: サマリ表を stdout、明細を docs/_vocab_census.txt（コミット対象・回帰diff用）
// 判定はカード単位（同カード別効果に語彙があれば合格）＝過小評価側に倒した高シグナル。
// STUB/MANUAL を含むカードは「要個別確認」枠に隔離（実装済みハンドラの可能性があるため）。
// ⚠ベースラインから増えたら回帰（PLAN.md §恒久指標）。JSON手パッチで語彙を足したら数字は自然に減る。

import * as fs from 'fs';
import * as path from 'path';

// 2026-07-04 続き18: 死角調査第2〜4弾（トリガー種別/コスト/ゾーン/構造マーカー/引用付与平坦化/
// 代わりに/できない/機構/逆方向action・数値 等）を組み込み＝25計測 → 94計測に拡張、実数 2023 で再登録。
// 旧ベースライン履歴: 529（続き15初回・14パターン）→522→498（続き16）→1469（続き17・25計測）
const BASELINE_HIGH = 2023;

const DATA_DIR = path.join(process.cwd(), 'public', 'data');
const OUT_PATH = path.join(process.cwd(), 'docs', '_vocab_census.txt');

interface Pattern {
  name: string;
  re: RegExp;
  /** カードJSON文字列にいずれか1つでも含まれれば「表現あり」とみなす語彙キー */
  keys: string[];
  /** 判定前に原文へ適用する前処理（例: 「そうした場合」＝then連鎖の帰結句を条件節から除外） */
  pre?: (t: string) => string;
  /** keys で表せない語彙判定（true＝表現あり＝合格）。keys との OR */
  extraOk?: (js: string, t: string) => boolean;
  /** 照合する原文: 'all'（効果+LB・既定）| 'eff'（効果テキストのみ。トリガー句/コスト節等LBに現れない系） */
  src?: 'all' | 'eff';
}

// キー表は 2026-07-04 に抜き取り検査で較正済み（SELF_POWER_GTE / levelFilter:"same" / $ref 等の
// 条件系・動的解決系の表現を偽陽性として除外できることを確認）。新語彙を DSL に足したらここにも足す。
// 続き17追加分の較正メモ: クラス＝JSON語彙は `story`／色＝コスト側（energy/handDiscardSigni）の色値は
// 正当なので extraOk で色値単位判定／「持続(ターン終了時まで)」は不採用＝engine が INSTANT の
// POWER_MODIFY/GRANT_KEYWORD を temp バケツ（ターン終了時リセット）で吸収するため偽陽性が支配的。
// 続き18追加分の較正メモ: 基本パワー＝`POWER_SET`／コイン＝`GAIN_COIN`（大文字）+cost `coin`／
// LB有無は effectType 判定（STUB id への部分一致誤爆回避）／マーカー系は引用『「…」』と
// 「【出】能力/効果」参照文を除去してから判定／「対戦相手→opponent不在」は HAND_DIFF 等の
// 条件型で正当表現されるため不採用（未較正）。
const PATTERNS: Pattern[] = [
  {
    name: '最上級(最も×パワー/レベル)',
    re: /(最も|一番)[^。]{0,10}(パワー|レベル)|(パワー|レベル)[^。]{0,6}(最も|一番)(高|低|大き|小さ)/,
    keys: ['superlative', 'HIGHEST', 'LOWEST'],
  },
  {
    name: '動的比較(〜より高い/低い)',
    re: /より[^。]{0,6}(高い|低い|大きい|小さい)/,
    keys: ['powerLtSelf', 'powerLteSelf', 'powerBelowLeftCard', 'levelBelowLeftCard',
      'powerLteLastProcessed', 'levelLteLastProcessed', 'levelLteDiscardSigni',
      'levelBelow', 'powerBelow', 'LowerLevel', 'LOWER', 'HIGHER'],
  },
  {
    name: 'パワー閾値(NN以上/以下)',
    re: /パワー(が)?[０-９\d]+以[上下]/,
    keys: ['powerRange', 'SELF_POWER', 'POWER_GTE', 'POWER_LTE', 'powerGte', 'powerLte', 'powerMin', 'powerMax'],
  },
  {
    name: 'レベル閾値(N以上/以下)',
    re: /レベル[０-９\d]以[上下]/,
    keys: ['"level"', 'levelRange', 'levelFilter', 'LEVEL_GTE', 'LEVEL_LTE', 'levelMax', 'levelMin', 'requiredLevel'],
  },
  {
    name: '同一性(〜と同じ色/レベル/名前)',
    re: /と同じ(色|レベル|カード名|名前|クラス)/,
    keys: ['levelEq', 'colorMatchesLrig', 'sameAs', '"same"', 'sameLevel', 'sameName', 'sameColor',
      'levelEqualsVar', 'SAME_'],
  },
  {
    name: '共通する色',
    re: /共通する色/,
    keys: ['MatchesLrig', 'eachDistinctColor', 'commonColor', 'sharedColor', 'SAME_COLOR', 'COMMON_COLOR'],
  },
  {
    name: '凍結状態フィルタ',
    re: /凍結状態の/,
    keys: ['isFrozen'],
  },
  {
    name: 'ダウン/アップ状態フィルタ',
    re: /(ダウン状態の|アップ状態の)/,
    keys: ['isDown', 'isUp'],
  },
  {
    name: '名前包含(カード名に《X》を含む)',
    re: /カード名に《[^》]+》を含む/,
    keys: ['cardName', 'cardNames', 'nameContains'],
  },
  {
    name: '否定フィルタ(〜ではない○○)',
    re: /では?ない(シグニ|カード|スペル|ルリグ)/,
    keys: ['Exclude', 'exclude', 'nonColorless', 'noGuard', 'notResona', 'isResona'],
  },
  {
    name: '数量比例(1枚/1体につき)',
    re: /(１|1)(枚|体|つ)につき/,
    keys: ['deltaPer', 'PER_', 'perCount', 'countFilter', 'PerCard', 'PerLevel', 'PerCharm',
      '$ref', 'last_processed', 'lastProcessed', 'addLast'],
  },
  {
    name: '合計制約(合計がN以上/以下)',
    re: /(パワー|レベル|コスト)の合計が[０-９\d]+以[上下]?/,
    keys: ['costMax', 'costMin', 'Sum', 'sum', 'totalPower', 'totalLevel'],
  },
  {
    name: 'それぞれ異なる',
    re: /それぞれ(色|レベル|カード名|名前)?の?異なる/,
    keys: ['eachDistinct', 'distinctName'],
  },
  {
    name: '奇数/偶数',
    re: /(奇数|偶数)/,
    keys: ['levelParity', 'odd', 'even'],
  },
  // ---- 2026-07-04 続き17 追加分（死角調査＝抜き取り較正済み。確定バグ例は PLAN.md §4 続き17）----
  {
    // 「そうした/そうしなかった場合」は直前の任意行動の帰結（then連鎖で表現）なので状態条件から除外
    name: '条件節(〜の場合)',
    re: /場合[、,]/,
    pre: t => t.replace(/そう(しなかった|した|でない|である)場合/g, ''),
    keys: ['condition', 'Condition', 'CONDITIONAL', 'HAS_CARD_IN_FIELD', 'COUNT_THRESHOLD',
      'DECK_TOP', 'TRASH_HAS', 'ENERGY_HAS', 'HAND_COUNT', 'LIFE_COUNT', 'TRASH_COUNT',
      'FIELD_COUNT', 'ENERGY_COUNT', 'LRIG_LEVEL', 'LRIG_STORY', 'LRIG_TEAM', 'LRIG_NAME',
      'ARTS_USED', 'LIFE_CRASHED', 'FIELD_HAS', 'FIELD_SIGNI', 'FIELD_CLASS'],
  },
  {
    name: 'クラス指定(＜X＞のシグニ)',
    re: /＜[^＞]+＞の(シグニ|カード)/,
    keys: ['story', 'cardClass', 'commonClass', 'CLASS'],
  },
  {
    // 色値はコスト側（energy/handDiscardSigni）にも正当に現れるため、
    // 原文で言及された色がどこにも color 値として現れない場合のみ欠落（保守的下限）
    name: '色フィルタ(白/赤/青/緑/黒/無色の○○)',
    re: /[白赤青緑黒]の(シグニ|カード|スペル|ルリグ)|無色の(シグニ|カード)/,
    keys: [],
    extraOk: (js, t) => {
      const colors = [...t.matchAll(/([白赤青緑黒])の(?:シグニ|カード|スペル|ルリグ)/g)].map(m => m[1]);
      if (/無色の(シグニ|カード)/.test(t)) colors.push('無');
      return colors.every(c => js.includes(`"color":"${c}`) || js.includes('"colors"')
        || js.includes('colorMatchesLrig') || js.includes('nonColorless'));
    },
  },
  {
    name: '正面(正面のシグニ等)',
    re: /正面/,
    keys: ['front', 'Front', 'FRONT', 'facing', 'opposite'],
  },
  {
    name: 'ライフクロス枚数条件',
    re: /ライフクロスが[０-９\d]枚/,
    keys: ['LIFE_COUNT', 'lifeCount', 'LIFE_CLOTH', 'condition', 'Condition'],
  },
  {
    name: '任意(してもよい)',
    re: /(してもよい|することができる)/,
    keys: ['"mandatory":false', '"optional":true', 'mayChoose'],
  },
  {
    name: '能力を持たない/失っている',
    re: /能力を(持たない|失って)/,
    keys: ['keyword', 'Abilit', 'abilit', 'vanilla'],
  },
  {
    name: '除外(〜以外の)',
    re: /以外の(シグニ|カード|スペル|ルリグ)/,
    keys: ['xclude', 'nonColorless', 'noGuard', 'thisCardOnly', 'exceptSource'],
  },
  {
    name: 'ターン1回制限',
    re: /《ターン(１|1)回》|ターンに(一度|１回|1回|一回)/,
    keys: ['usageLimit'],
  },
  {
    name: 'ゲーム1回制限',
    re: /《ゲーム(１|1)回》|ゲーム(中に)?(一度|１回|1回|一回)/,
    keys: ['usageLimit', '"GAME"'],
  },
  // ---- 2026-07-04 続き18 追加分・第2弾（トリガー種別/コスト/ゾーン/基本パワー。PLAN.md §4 続き18）----
  { name: 'トリガー:アタックしたとき', re: /がアタックしたとき/, keys: ['ON_ATTACK', 'ATTACK_ARTS'], src: 'eff' },
  { name: 'トリガー:場に出たとき', re: /場に出たとき/, keys: ['ON_PLAY', 'ON_ZONE_MOVED', 'ADD_TO_FIELD'], src: 'eff' },
  { name: 'トリガー:バニッシュされたとき', re: /バニッシュされたとき/, keys: ['ON_BANISH'], src: 'eff' },
  { name: 'トリガー:アタックフェイズ開始時', re: /アタックフェイズ開始時/, keys: ['ON_ATTACK_PHASE_START'], src: 'eff' },
  { name: 'トリガー:ターン終了時に', re: /ターン終了時[、に]/, keys: ['ON_TURN_END', 'TURN_END', 'turn_end'], src: 'eff' },
  { name: 'トリガー:トラッシュに置かれたとき', re: /トラッシュに置かれたとき/, keys: ['ON_TRASH', 'ON_CHARM_TO_TRASH', 'ON_ENERGY_TO_TRASH', 'ON_EXCEED_COST'], src: 'eff' },
  { name: 'トリガー:場を離れたとき', re: /場を離れ(たとき|るとき)/, keys: ['ON_LEAVE_FIELD'], src: 'eff' },
  { name: 'トリガー:スペルを使用したとき', re: /スペルを使用した(とき|場合)/, keys: ['ON_SPELL_USE', 'SPELL'], src: 'eff' },
  { name: 'トリガー:アーツを使用したとき', re: /アーツを使用した(とき|場合)/, keys: ['ARTS_USE', 'ARTS_USED'], src: 'eff' },
  { name: 'トリガー:クラッシュされたとき', re: /クラッシュされたとき/, keys: ['LIFE_CRASHED', 'ON_LIFE_CRASH'], src: 'eff' },
  { name: 'トリガー:手札から捨てられたとき', re: /手札から捨てられたとき/, keys: ['ON_HAND_DISCARDED', 'ON_DISCARDED'], src: 'eff' },
  { name: 'トリガー:凍結されたとき', re: /凍結されたとき/, keys: ['ON_SIGNI_FROZEN'], src: 'eff' },
  { name: 'トリガー:グロウしたとき', re: /グロウした(とき|場合)/, keys: ['ON_LRIG_GROW', 'GROW'], src: 'eff' },
  { name: 'トリガー:エナチャージしたとき', re: /【?エナチャージ】?を?した?とき/, keys: ['ON_ENERGY_CHARGE'], src: 'eff' },
  { name: 'コスト:《ダウン》', re: /《ダウン》/, keys: ['down_self', 'lrigDown', 'fieldDown', '"down"', 'ダウン》'], src: 'eff' },
  { name: 'コスト:エクシードN', re: /《?エクシード[０-９\d]/, keys: ['exceed', 'エクシード'], src: 'eff' },
  { name: 'コスト:《コイン》', re: /《コイン/, keys: ['coin', 'COIN', 'コイン'], src: 'eff' },
  { name: 'コスト:手札を捨てる', re: /手札[かをら][^。：]{0,12}捨て(る|て)：/, keys: ['discard', 'handDiscard', 'Discard'], src: 'eff' },
  { name: 'コスト:エナからトラッシュ', re: /エナゾーンから[^。：]{0,18}(トラッシュに置く|支払う)：?/, keys: ['energyTrash', 'ENERGY'], src: 'eff' },
  { name: 'コスト:場からトラッシュ', re: /場から[^。：]{0,18}トラッシュに置く：/, keys: ['fieldTrash', 'trash_self', 'beat', 'fieldTo'], src: 'eff' },
  { name: 'ゾーン:エナゾーンに置く', re: /エナゾーンに置/, keys: ['ENERGY', 'nerg'] },
  { name: 'ゾーン:デッキの一番下', re: /デッキの一番下/, keys: ['BOTTOM', 'bottom', 'Bottom'] },
  { name: 'ゾーン:ルリグデッキに戻す', re: /ルリグデッキに戻/, keys: ['LRIG_DECK', 'lrigDeck', 'RETURN_TO_LRIG'] },
  { name: '基本パワー変更', re: /基本パワーは/, keys: ['POWER_SET', 'basePower', 'SET_POWER'], src: 'eff' },
  // ---- 続き18 追加分・第3弾（構造/様相。マーカー構造・逆方向は下部の専用セクション）----
  { name: '「Nまで」上限選択', re: /[０-９\d](枚|体)まで/, keys: ['"upToCount":true', 'maxCount', 'upTo'] },
  { name: '公開し', re: /公開し/, keys: ['REVEAL', 'reveal'] },
  { name: '次の相手ターン終了時まで', re: /次の(対戦相手の)?ターン(の)?終了時まで/, keys: ['UNTIL_OPP_TURN_END', 'NEXT_OPP_TURN', 'NEXT_TURN'] },
  { name: '相手が選ぶ', re: /対戦相手[はが](自分の)?[^。]{0,25}選[びぶ]/, keys: ['opponentSelects', 'actingPlayerSelects', 'OPPONENT_SELECT'] },
  { name: '出現条件(レゾナ/クラフト)', re: /【出現条件】/, keys: ['forResonaCondition', 'playCondition', 'appearCondition', '出現条件'] },
  { name: 'ダメージを受けない', re: /ダメージを受けない/, keys: ['PREVENT', 'DAMAGE', 'damage'] },
  { name: '付着(チャーム/トラップ/アクセとして)', re: /(チャーム|トラップ|アクセ)として/, keys: ['CHARM', 'TRAP', 'ACCE', 'charm', 'trap', 'acce'] },
  { name: 'X変数コスト/効果', re: /[《【]無×Ｘ[》】]|Ｘ[はにをと]|Ｘ枚|Ｘ体|Ｘ000/, keys: ['ariable', '"X"', 'xCost', 'XCOST', '$ref'], src: 'eff' },
  { name: 'triggerScope(他シグニ起点トリガー)', re: /(あなたの|対戦相手の)(他の)?シグニ[０-９\d]体が(場に出た|バニッシュされた|アタックした)とき/, keys: ['triggerScope'], src: 'eff' },
  // ---- 続き18 追加分・第4弾（引用付与平坦化/置換/制限/機構）----
  { name: '引用能力付与の平坦化', re: /「[^」]*【(自|起|常|出)】[^」]*」を(得る|与え)/, keys: ['GRANT', 'grant', 'rawText', 'keyword'] },
  { name: '代わりに(置換)', re: /代わりに/, keys: ['CONDITIONAL', 'REPLACE', 'instead', 'IS_MY_TURN', 'PAID_ADDITIONAL'] },
  { name: '制限「できない」', re: /(場に出すことができない|使用できない|アタックできない|ガードできない|支払うことができない|選べない|引けない|出せない)/, keys: ['BLOCK', 'できない', 'PREVENT', 'NEGATE', 'COST_INCREASE', 'Block'] },
  { name: '見ないで(blind)', re: /見ないで/, keys: ['"blind"', 'blind'] },
  { name: '無作為に(blind)', re: /無作為に/, keys: ['"blind"', 'random', 'RANDOM'] },
  { name: 'シグニの下に置く', re: /の下に置/, keys: ['UNDER', 'under'] },
  { name: 'ゲームから除外', re: /ゲームから除外/, keys: ['EXILE', 'exile'] },
  { name: '遅延トリガー(このターン〜したとき)', re: /このターン、[^。]{0,40}したとき/, keys: ['DELAYED', 'delayed', 'this_turn', 'turn_end', 'ON_'] },
  { name: '機構:ライズ', re: /【ライズ】/, keys: ['RISE', 'ise'] },
  { name: '機構:クロス', re: /【クロス/, keys: ['cross', 'CROSS', 'crossOnly'] },
  { name: '機構:ハーモニー', re: /【ハーモニー/, keys: ['HARMONY', 'harmony'] },
  { name: '機構:ベット', re: /ベット―|【ベット/, keys: ['BET', 'bet', 'Betting'] },
  { name: '機構:チーム', re: /【チーム/, keys: ['TEAM', 'team', 'Team'] },
  { name: '機構:ゲート', re: /ゲート/, keys: ['GATE', 'Gate', 'gate'] },
  { name: '機構:ウィルス', re: /ウィルス/, keys: ['VIRUS', 'irus'] },
  { name: '機構:シード', re: /【シード|シードを/, keys: ['SEED', 'eed'] },
  { name: '機構:エクシード持ち', re: /エクシード/, keys: ['exceed', 'EXCEED'] },
  { name: '機構:アンコール', re: /アンコール/, keys: ['ENCORE', 'encore', 'coin'] },
  { name: '機構:ソウル', re: /【ソウル/, keys: ['SOUL', 'soul'] },
  { name: '機構:ドライブ', re: /【ドライブ|ドライブ状態/, keys: ['DRIVE', 'rive'] },
];

interface Corpus {
  /** 効果テキスト＋LBテキスト連結（従来の texts） */
  all: Map<string, string>;
  /** 効果テキストのみ（トリガー句・コスト節などLBに現れない照合用） */
  eff: Map<string, string>;
  /** LBテキストのみ */
  burst: Map<string, string>;
  /** カード種別（アーツ/シグニ/…・col4） */
  ctype: Map<string, string>;
  /** アーツ使用タイミング列（col14） */
  ctiming: Map<string, string>;
}

function loadTexts(): Corpus {
  // 効果テキスト列（0-idx 18）・LBテキスト列（19以降）を保持し、注釈・キーワード説明の（…）を除去
  const all = new Map<string, string>(), eff = new Map<string, string>(), burst = new Map<string, string>();
  const ctype = new Map<string, string>(), ctiming = new Map<string, string>();
  const files = fs.readdirSync(DATA_DIR).filter(f => f.startsWith('CardData_') && f.endsWith('.csv')).sort();
  for (const f of files) {
    for (const line of fs.readFileSync(path.join(DATA_DIR, f), 'utf8').split('\n')) {
      const cols = line.split(',');
      const id = cols[0];
      if (!id || !/^[A-Z]/.test(id) || id === 'CardNum') continue;
      const strip = (s: string) => s.replace(/（[^）]*）/g, '');
      const e = strip(cols[18] ?? '');
      const b = strip(cols.slice(19).join(','));
      eff.set(id, (eff.get(id) ?? '') + e);
      burst.set(id, (burst.get(id) ?? '') + b);
      // 旧実装（cols.slice(18).join(',')）と同一の連結を維持＝列境界のカンマを保存
      all.set(id, (all.get(id) ?? '') + e + ',' + b);
      if (!ctype.has(id)) ctype.set(id, cols[3] ?? '');
      if (!ctiming.has(id)) ctiming.set(id, cols[13] ?? '');
    }
  }
  return { all, eff, burst, ctype, ctiming };
}

function loadJson(): { str: Map<string, string>; obj: Map<string, unknown[]> } {
  const str = new Map<string, string>();
  const obj = new Map<string, unknown[]>();
  const files = fs.readdirSync(DATA_DIR).filter(f => f.startsWith('effects_') && f.endsWith('.json')).sort();
  for (const f of files) {
    const j = JSON.parse(fs.readFileSync(path.join(DATA_DIR, f), 'utf8')) as Record<string, unknown[]>;
    for (const [id, effs] of Object.entries(j)) { str.set(id, JSON.stringify(effs)); obj.set(id, effs); }
  }
  return { str, obj };
}

function main(): void {
  const corpus = loadTexts();
  const texts = corpus.all;
  const { str: jsonStr, obj: jsonObj } = loadJson();
  const highAll = new Set<string>();
  const detail: string[] = [
    '# 語彙センサス明細（原文修飾句 × effects JSON 対応語彙・両方向）',
    '# 生成: npx tsx scripts/vocabCensus.ts（npm run census）',
    '# 高シグナル＝STUB/MANUALを含まないカードで対応語彙ゼロ＝フィルタ/条件/構造脱落（過剰効果）候補',
    '',
  ];
  const summary: string[] = [];

  const pushSection = (name: string, hits: number, missHigh: string[], missStub: string[]): void => {
    missHigh.sort();
    missStub.sort();
    summary.push(`${name} | ${hits} | ${missHigh.length} | ${missStub.length}`);
    detail.push(`## ${name} ［原文該当 ${hits}／高シグナル ${missHigh.length}／STUB・MANUAL格納 ${missStub.length}］`);
    detail.push('### 高シグナル（対応語彙なし）');
    detail.push(missHigh.join(' ') || '（なし）');
    detail.push('### STUB/MANUAL格納（要個別確認）');
    detail.push(missStub.join(' ') || '（なし）');
    detail.push('');
  };

  for (const { name, re, keys, pre, extraOk, src } of PATTERNS) {
    const srcMap = src === 'eff' ? corpus.eff : texts;
    let hits = 0;
    const missHigh: string[] = [];
    const missStub: string[] = [];
    for (const [id, t0] of srcMap) {
      const t = pre ? pre(t0) : t0;
      if (!re.test(t)) continue;
      hits++;
      const js = jsonStr.get(id);
      if (!js) continue;
      if (keys.some(k => js.includes(k)) || (extraOk && extraOk(js, t0))) continue;
      if (js.includes('STUB') || js.includes('MANUAL')) missStub.push(id);
      else { missHigh.push(id); highAll.add(id); }
    }
    pushSection(name, hits, missHigh, missStub);
  }

  const zen2han = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));

  // ---- 数値不一致（語彙有無では見えない別軸・2026-07-04 続き17）----
  // 原文のパワー系数値（4〜5桁）がカードJSONのどこにも現れない＝値の脱落/誤記の候補。
  // 《…》内のカード名由来の数字（例: タンポポ2434）は除外。抜き取り4/4が確定バグ
  // （WX06-028 第2対象丸ごと・WX13-030 パワー合計上限・WX09-017 基本パワー/×3000・WX11-053 基本パワー）。
  {
    let hits = 0;
    const missHigh: string[] = [];
    const missStub: string[] = [];
    for (const [id, t] of texts) {
      const nums = [...zen2han(t.replace(/《[^》]*》/g, '')).matchAll(/\d{4,5}/g)].map(m => m[0]);
      if (nums.length === 0) continue;
      const js = jsonStr.get(id);
      if (!js) continue;
      hits++;
      const missing = [...new Set(nums.filter(n => !js.includes(n)))];
      if (missing.length === 0) continue;
      if (js.includes('STUB') || js.includes('MANUAL')) missStub.push(id);
      else { missHigh.push(`${id}(${missing.join('/')})`); highAll.add(id); }
    }
    pushSection('数値不一致(4-5桁がJSONに不在)', hits, missHigh, missStub);
  }

  // ---- 小さい数（2〜5枚/体が JSON に独立数値として無い・続き18第2弾。粗い網＝脱落節の検出器）----
  {
    let hits = 0;
    const missHigh: string[] = [];
    const missStub: string[] = [];
    for (const [id, t0] of texts) {
      const t = zen2han(t0);
      const nums = [...new Set([...t.matchAll(/([2-5])(枚|体)/g)].map(m => m[1]))];
      if (!nums.length) continue;
      hits++;
      const js = jsonStr.get(id);
      if (!js) continue;
      const missing = nums.filter(n => !new RegExp('[:\\[,]' + n + '[,}\\]]').test(js));
      if (!missing.length) continue;
      if (js.includes('STUB') || js.includes('MANUAL')) missStub.push(id);
      else { missHigh.push(`${id}(${missing.join('/')})`); highAll.add(id); }
    }
    pushSection('小さい数(2-5枚/体)不在', hits, missHigh, missStub);
  }

  // ---- 逆方向数値（JSONの4-5桁が原文に無い＝幻覚パラメータ・続き18第4弾。WX24-P4-078=原文に無い powerLte:5000）----
  {
    let hits = 0;
    const missHigh: string[] = [];
    const missStub: string[] = [];
    for (const [id, js] of jsonStr) {
      const nums = [...new Set([...js.matchAll(/(?<![\dA-Za-z-])(\d{4,5})(?!\d)/g)].map(m => m[1]))];
      if (!nums.length) continue;
      hits++;
      const t = zen2han(texts.get(id) ?? '');
      const missing = nums.filter(n => !t.includes(n));
      if (!missing.length) continue;
      if (js.includes('STUB') || js.includes('MANUAL')) missStub.push(id);
      else { missHigh.push(`${id}(${missing.join('/')})`); highAll.add(id); }
    }
    pushSection('逆:JSON数値が原文に無い(幻覚)', hits, missHigh, missStub);
  }

  // ---- キーワード能力語の不在（原文のキーワードがJSONに文字列として無い・続き18第2弾）----
  {
    const KWS = ['アサシン', 'ダブルクラッシュ', 'トリプルクラッシュ', 'ランサー', 'シャドウ', 'マルチエナ',
      'シュート', 'チアガール', 'バニッシュされない', 'ガードできない'];
    let hits = 0;
    const missHigh: string[] = [];
    const missStub: string[] = [];
    for (const [id, t] of texts) {
      const found = KWS.filter(k => t.includes(k));
      if (!found.length) continue;
      hits++;
      const js = jsonStr.get(id);
      if (!js) continue;
      const missing = found.filter(k => !js.includes(k));
      if (!missing.length) continue;
      if (js.includes('STUB') || js.includes('MANUAL')) missStub.push(id);
      else { missHigh.push(`${id}(${missing.join('/')})`); highAll.add(id); }
    }
    pushSection('キーワード能力語の不在', hits, missHigh, missStub);
  }

  // ---- 逆方向 action センサス（JSONのaction型に対応する動詞が原文に無い＝幻覚/取り違え・続き18第4弾）----
  // STUB/MANUAL/rawText 含みの効果はスキップ（近似表現のため）。
  // 抜き取り確定バグ: WX16-021（置換ルールが即時LIFE_CRASH化）・PR-322（トラッシュ送りがBANISH化）。
  {
    const VERB: Array<[string, RegExp]> = [
      ['BANISH', /バニッシュ/],
      ['FREEZE', /凍結/],
      ['EXILE', /除外/],
      ['GAIN_COIN', /コイン/],
      ['LIFE_CRASH', /クラッシュ/],
      ['DRAW', /引/],
      ['SEARCH', /探し/],
    ];
    for (const [act, re] of VERB) {
      let hits = 0;
      const missHigh: string[] = [];
      for (const [id, effs] of jsonObj) {
        if (!Array.isArray(effs)) continue;
        let has = false;
        for (const e of effs) {
          const s = JSON.stringify(e);
          if (s.includes('"' + act + '"') && !s.includes('STUB') && !s.includes('MANUAL') && !s.includes('rawText')) has = true;
        }
        if (!has) continue;
        hits++;
        if (!re.test(texts.get(id) ?? '')) { missHigh.push(id); highAll.add(id); }
      }
      pushSection(`逆:JSONに${act}→原文に語なし`, hits, missHigh, []);
    }
  }

  // ---- 能力マーカー構造census（引用『「…」』と「【出】能力/効果」参照を除いた原文マーカー vs effectType・続き18第3弾）----
  {
    const stripQuote = (t: string) => t
      .replace(/『[^』]*』/g, '').replace(/「[^」]*」/g, '')
      .replace(/【出】(能力|効果)/g, '');
    interface Eff { effectType?: string; timing?: string[] }
    const MARKERS: Array<[string, RegExp, (e: Eff) => boolean]> = [
      ['構造:【常】→CONTINUOUS無', /【常】/, e => e.effectType === 'CONTINUOUS'],
      ['構造:【起】→ACTIVATED無', /【起】/, e => e.effectType === 'ACTIVATED'],
      ['構造:【自】→AUTO無', /【自】/, e => e.effectType === 'AUTO' && !(e.timing ?? []).includes('ON_LIFE_BURST')],
      ['構造:【出】→ON_PLAY無', /【出】/, e => (e.timing ?? []).includes('ON_PLAY')],
    ];
    for (const [name, re, pred] of MARKERS) {
      let hits = 0;
      const missHigh: string[] = [];
      const missStub: string[] = [];
      for (const [id, t0] of corpus.eff) {
        if (!re.test(stripQuote(t0))) continue;
        hits++;
        const effs = jsonObj.get(id) as Eff[] | undefined;
        if (!Array.isArray(effs)) continue;
        if (effs.some(pred)) continue;
        const js = jsonStr.get(id) ?? '';
        if (js.includes('STUB') || js.includes('MANUAL')) missStub.push(id);
        else { missHigh.push(id); highAll.add(id); }
      }
      pushSection(name, hits, missHigh, missStub);
    }
    // 【起】マーカー個数 > ACTIVATED効果数（能力丸ごと欠落）
    {
      let hits = 0;
      const missHigh: string[] = [];
      const missStub: string[] = [];
      for (const [id, t0] of corpus.eff) {
        const n = (stripQuote(t0).match(/【起】/g) ?? []).length;
        if (!n) continue;
        hits++;
        const effs = jsonObj.get(id) as Eff[] | undefined;
        if (!Array.isArray(effs)) continue;
        const m = effs.filter(e => e.effectType === 'ACTIVATED').length;
        if (m >= n) continue;
        const js = jsonStr.get(id) ?? '';
        if (js.includes('STUB') || js.includes('MANUAL')) missStub.push(id);
        else { missHigh.push(`${id}(${n}vs${m})`); highAll.add(id); }
      }
      pushSection('構造:【起】個数>ACTIVATED個数', hits, missHigh, missStub);
    }
  }

  // ---- BURST内 IS_MY_TURN（LBは相手ターン発動＝常に偽＝then永久不発・続き18第2弾。WX03-034で確認）----
  {
    let hits = 0;
    const missHigh: string[] = [];
    const missStub: string[] = [];
    for (const [id, effs] of jsonObj) {
      if (!Array.isArray(effs)) continue;
      for (const e of effs as Array<{ effectType?: string; effectId?: string }>) {
        if (e?.effectType !== 'LIFE_BURST') continue;
        const s = JSON.stringify(e);
        if (!s.includes('IS_MY_TURN')) continue;
        hits++;
        if (s.includes('STUB') || s.includes('MANUAL')) missStub.push(e.effectId ?? id);
        else { missHigh.push(e.effectId ?? id); highAll.add(id); }
        break;
      }
    }
    pushSection('BURST内IS_MY_TURN(常に偽=不発)', hits, missHigh, missStub);
  }

  // ---- IS_MY_TURN 誤変換疑い（原文に「そうした場合」等の該当句が無いのに IS_MY_TURN が居る・続き18第2弾）----
  // parser のフォールバック（effectParser.ts の「該当しない場合は IS_MY_TURN」）で実条件が消えた候補。
  // WX05-013 で確認（「8種類以上公開された場合」→無条件全バウンス）。
  {
    let hits = 0;
    const missHigh: string[] = [];
    const missStub: string[] = [];
    for (const [id, js] of jsonStr) {
      if (!js.includes('IS_MY_TURN')) continue;
      hits++;
      const t = texts.get(id) ?? '';
      if (/そう(した|しなかった)場合|支払わなかった場合|捨てなかった場合|しなければ|代わりに|あなたのターンの間|しない場合/.test(t)) continue;
      if (js.includes('STUB') || js.includes('MANUAL')) missStub.push(id);
      else { missHigh.push(id); highAll.add(id); }
    }
    pushSection('IS_MY_TURN誤変換疑い(該当句なし)', hits, missHigh, missStub);
  }

  // ---- BURST↔E1 誤配置（LB原文の動詞がBURST効果に無く非BURST効果にだけある・続き18第4弾。WD21-011で確認）----
  {
    const VB: Array<[RegExp, string]> = [[/引/, 'DRAW'], [/バニッシュ/, 'BANISH'], [/エナ/, 'ENERGY'], [/凍結/, 'FREEZE'], [/クラッシュ/, 'LIFE_CRASH']];
    let hits = 0;
    const missHigh: string[] = [];
    const missStub: string[] = [];
    for (const [id, bt] of corpus.burst) {
      if (!/：/.test(bt)) continue;
      const effs = jsonObj.get(id) as Array<{ effectType?: string }> | undefined;
      if (!Array.isArray(effs)) continue;
      const burstEffs = effs.filter(e => e.effectType === 'LIFE_BURST');
      const otherEffs = effs.filter(e => e.effectType !== 'LIFE_BURST');
      if (!burstEffs.length) continue;
      hits++;
      const bs = JSON.stringify(burstEffs), os = JSON.stringify(otherEffs);
      if (bs.includes('STUB') || bs.includes('MANUAL')) { missStub.push(id); continue; }
      for (const [re, act] of VB) {
        if (re.test(bt) && !bs.includes(act) && os.includes(act)) { missHigh.push(`${id}(${act})`); highAll.add(id); break; }
      }
    }
    pushSection('BURST動詞がBURST効果に無くE側にある', hits, missHigh, missStub);
  }

  // ---- アーツ使用タイミング列 vs timing 配列（両方向・続き18第4弾。682枚中5枚のみ＝ほぼ健全の維持ガード）----
  {
    const MAPPING: Array<[string, string[]]> = [
      ['メインフェイズ', ['MAIN']],
      ['アタックフェイズ', ['ATTACK', 'ATTACK_ARTS']],
      ['スペルカットイン', ['SPELL_CUTIN']],
    ];
    let hits = 0;
    const under: string[] = [];
    const over: string[] = [];
    const missStub: string[] = [];
    for (const [id, ty] of corpus.ctype) {
      if (ty !== 'アーツ') continue;
      const effs = jsonObj.get(id) as Array<{ timing?: string[] }> | undefined;
      if (!Array.isArray(effs)) continue;
      hits++;
      const js = jsonStr.get(id) ?? '';
      const stub = js.includes('STUB') || js.includes('MANUAL');
      const col = corpus.ctiming.get(id) ?? '';
      const timings = new Set<string>();
      for (const e of effs) for (const tm of (e.timing ?? [])) timings.add(tm);
      for (const [jp, ens] of MAPPING) {
        const colHas = col.includes(jp);
        const jsonHas = ens.some(e => timings.has(e));
        if (colHas && !jsonHas) { if (stub) missStub.push(`${id}(-${jp})`); else { under.push(`${id}(-${jp})`); highAll.add(id); } }
        if (!colHas && jsonHas) { if (stub) missStub.push(`${id}(+${jp})`); else { over.push(`${id}(+${jp})`); highAll.add(id); } }
      }
    }
    pushSection('アーツ:列タイミング→JSON欠(使えない側)', hits, under, missStub);
    pushSection('アーツ:JSON過剰タイミング(使えすぎ側)', hits, over, []);
  }

  detail.push(`# 高シグナル欠落カード総数（重複除外）: ${highAll.size}（ベースライン ${BASELINE_HIGH}）`);
  fs.writeFileSync(OUT_PATH, detail.join('\n') + '\n', 'utf8');

  console.log('パターン | 原文該当 | 高シグナル欠落 | STUB・MANUAL格納(要確認)');
  for (const row of summary) console.log(row);
  console.log(`\n高シグナル欠落カード総数(重複除外): ${highAll.size} ／ ベースライン: ${BASELINE_HIGH}`);
  console.log(`明細: docs/_vocab_census.txt`);

  if (highAll.size > BASELINE_HIGH) {
    console.error(`\n⚠回帰: 高シグナルがベースライン ${BASELINE_HIGH} を超過（${highAll.size}）。`
      + ' JSON手パッチ時はフィルタ語彙もセットで入れる（or 本ファイルのキー表・ベースラインを実数更新）。');
    process.exit(1);
  }
  if (highAll.size < BASELINE_HIGH) {
    console.log(`\n改善: ${BASELINE_HIGH} → ${highAll.size}。本ファイルの BASELINE_HIGH と PLAN.md §恒久指標を実数更新してよい。`);
  }
}

main();
