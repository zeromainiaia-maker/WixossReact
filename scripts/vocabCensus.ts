// 語彙センサス（vocab census）＝原文の修飾句パターン × effects JSON の対応語彙の全数突き合わせ lint
//
// 既存の検出網（behavior-audit キュー＝無変化no-op／脱落疑い＝文数比較／smoke＝クラッシュ）は
// すべて「効果が足りない側」を見る網で、対象フィルタ脱落による**過剰効果**
// （例: SP07-010「最も大きいパワーを持つすべて」→無条件 BOUNCE ALL）は盤面が変化するため掛からない。
// 本 lint はその死角＝「原文に修飾句があるのに JSON に対応語彙が無い」カードを機械抽出する。
//
// 実行: npx tsx scripts/vocabCensus.ts  （npm run census）
// 出力: サマリ表を stdout、明細を docs/_vocab_census.txt（コミット対象・回帰diff用）
// 判定はカード単位（同カード別効果に語彙があれば合格）＝過小評価側に倒した高シグナル。
// STUB/MANUAL を含むカードは「要個別確認」枠に隔離（実装済みハンドラの可能性があるため）。
// ⚠ベースラインから増えたら回帰（PLAN.md §恒久指標）。JSON手パッチで語彙を足したら数字は自然に減る。

import * as fs from 'fs';
import * as path from 'path';

const BASELINE_HIGH = 498; // 2026-07-04 §5c: 凍結7枚(529→522)＋ダウン/アップ28効果(522→498)是正後（続き17でパターン拡充→下で実数更新）

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
}

// キー表は 2026-07-04 に抜き取り検査で較正済み（SELF_POWER_GTE / levelFilter:"same" / $ref 等の
// 条件系・動的解決系の表現を偽陽性として除外できることを確認）。新語彙を DSL に足したらここにも足す。
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
];

function loadTexts(): Map<string, string> {
  // 効果テキスト列（index 18 以降）を連結し、注釈・キーワード説明の（…）を除去
  const texts = new Map<string, string>();
  const files = fs.readdirSync(DATA_DIR).filter(f => f.startsWith('CardData_') && f.endsWith('.csv')).sort();
  for (const f of files) {
    for (const line of fs.readFileSync(path.join(DATA_DIR, f), 'utf8').split('\n')) {
      const cols = line.split(',');
      const id = cols[0];
      if (!id || !/^[A-Z]/.test(id) || id === 'CardNum') continue;
      const t = cols.slice(18).join(',').replace(/（[^）]*）/g, '');
      texts.set(id, (texts.get(id) ?? '') + t);
    }
  }
  return texts;
}

function loadJsonStrings(): Map<string, string> {
  const jsonStr = new Map<string, string>();
  const files = fs.readdirSync(DATA_DIR).filter(f => f.startsWith('effects_') && f.endsWith('.json')).sort();
  for (const f of files) {
    const j = JSON.parse(fs.readFileSync(path.join(DATA_DIR, f), 'utf8')) as Record<string, unknown>;
    for (const [id, effs] of Object.entries(j)) jsonStr.set(id, JSON.stringify(effs));
  }
  return jsonStr;
}

function main(): void {
  const texts = loadTexts();
  const jsonStr = loadJsonStrings();
  const highAll = new Set<string>();
  const detail: string[] = [
    '# 語彙センサス明細（原文修飾句 × effects JSON 対応語彙）',
    '# 生成: npx tsx scripts/vocabCensus.ts（npm run census）',
    '# 高シグナル＝STUB/MANUALを含まないカードで対応語彙ゼロ＝フィルタ脱落（過剰効果）候補',
    '',
  ];
  const summary: string[] = [];

  for (const { name, re, keys, pre, extraOk } of PATTERNS) {
    let hits = 0;
    const missHigh: string[] = [];
    const missStub: string[] = [];
    for (const [id, t0] of texts) {
      const t = pre ? pre(t0) : t0;
      if (!re.test(t)) continue;
      hits++;
      const js = jsonStr.get(id);
      if (!js) continue;
      if (keys.some(k => js.includes(k)) || (extraOk && extraOk(js, t0))) continue;
      if (js.includes('STUB') || js.includes('MANUAL')) missStub.push(id);
      else { missHigh.push(id); highAll.add(id); }
    }
    missHigh.sort();
    missStub.sort();
    summary.push(`${name} | ${hits} | ${missHigh.length} | ${missStub.length}`);
    detail.push(`## ${name} ［原文該当 ${hits}／高シグナル ${missHigh.length}／STUB・MANUAL格納 ${missStub.length}］`);
    detail.push('### 高シグナル（対応語彙なし）');
    detail.push(missHigh.join(' ') || '（なし）');
    detail.push('### STUB/MANUAL格納（要個別確認）');
    detail.push(missStub.join(' ') || '（なし）');
    detail.push('');
  }

  // ---- 数値不一致（語彙有無では見えない別軸・2026-07-04 続き17）----
  // 原文のパワー系数値（4〜5桁）がカードJSONのどこにも現れない＝値の脱落/誤記の候補。
  // 《…》内のカード名由来の数字（例: タンポポ2434）は除外。抜き取り4/4が確定バグ
  // （WX06-028 第2対象丸ごと・WX13-030 パワー合計上限・WX09-017 基本パワー/×3000・WX11-053 基本パワー）。
  {
    const zen2han = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
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
    missHigh.sort();
    missStub.sort();
    summary.push(`数値不一致(4-5桁がJSONに不在) | ${hits} | ${missHigh.length} | ${missStub.length}`);
    detail.push(`## 数値不一致(4-5桁がJSONに不在) ［原文該当 ${hits}／高シグナル ${missHigh.length}／STUB・MANUAL格納 ${missStub.length}］`);
    detail.push('### 高シグナル（対応数値なし）');
    detail.push(missHigh.join(' ') || '（なし）');
    detail.push('### STUB/MANUAL格納（要個別確認）');
    detail.push(missStub.join(' ') || '（なし）');
    detail.push('');
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
