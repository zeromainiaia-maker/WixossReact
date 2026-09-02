// カードに**印刷されたキーワードコスト**（【アンコール】ほか）を原文から読む。
//
// 🆕**2026-09-02（§5.3 `O-86` 第2バッチ）で `src/screens/battle/costs.ts` からここへ移した。**
// 🔴**なぜ移したか**＝印字は「効果本文」ではなく**カード単位の事実**なのに、UI 層が
//   支払いのたびに `card.EffectText` を読み直していた（`census:costtext` の A群）。
//   parser が build 時に1度だけ読んで `EffectCost.encoreCost` へ刻み、UI は JSON だけを見る。
// ⚠**ここに新しい「意味」を足さない**＝原文の読み取りだけを置く場所（engine も UI も import しない）。
import type {
  BetCostSpec, CostReplacementTerm, EffectCost, EnergyCost, EncoreCostSpec,
  OptionalDiscardCostSpec, UseTimeCostSpecJson,
} from '../types/effects';

const toHalfWidthDigits = (t: string): string =>
  t.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFF10 + 0x30));

/**
 * アンコールコスト。
 *
 * 🆕**2026-09-02（§5.3 `O-199`）＝アイコン形だけでなく「テキスト形」も読む**（実測5枚）。
 * 🔴従来は `《…》` しか読まず `null`（＝コスト無し）へ落ちていたため、**アンコールの選択肢そのものが
 *   出ない**（`canEncore` が false）＝5枚が永久にアンコールできなかった（過小の側）。
 * ⚠**テキスト形と判定するのは「－の直後が `《` でない」ときだけ**＝
 *   `アンコール－《黒》このターン、…` のようにアイコンの後ろへ**アーツ本文**が続く形を
 *   コストと読み違えない（読み違えると払わされる側＝過剰になる）。
 * 対応する3形＝①センタールリグの下からN枚をルリグトラッシュ（＝既存 `exceed` の受け皿）
 *   ②キー1枚を場からルリグトラッシュ（＝既存 `trash_key`）③手札から＜X＞のシグニをN枚捨てる。
 */
export function parseEncoreCostText(effectText: string): EncoreCostSpec | null {
  if (!effectText.startsWith('アンコール－')) return null;
  const afterDash = effectText.slice('アンコール－'.length);
  // ── テキスト形（－の直後が `《` でない）＝アイコンを1つも持たない5枚（§5.3 `O-199`）──
  if (!afterDash.startsWith('《')) {
    const num = (t: string) => parseInt(toHalfWidthDigits(t), 10) || 0;
    const exM = afterDash.match(/^あなたの(?:センター)?ルリグの下からカード([０-９\d]+)枚をルリグトラッシュに置く/);
    if (exM) return { energy: [], coins: 0, exceed: num(exM[1]) };
    if (/^キー([０-９\d]+)枚を場から(?:ルリグ)?トラッシュに置く/.test(afterDash)) {
      return { energy: [], coins: 0, trashOwnKey: true };
    }
    const hdM = afterDash.match(/^手札から(?:＜([^＞]+)＞の)?シグニを([０-９\d]+)枚捨てる/);
    if (hdM) return { energy: [], coins: 0, handDiscardSigni: { count: num(hdM[2]), ...(hdM[1] ? { story: hdM[1] } : {}) } };
    return null;
  }
  // 「（」か漢字テキストの直前まで（アイコン部分のみ）
  const beforeContent = afterDash.split(/[（。【]/)[0];
  const ENERGY_COLORS = new Set<EnergyCost['color']>(['白', '赤', '青', '緑', '黒', '無']);
  const energy: EnergyCost[] = [];
  let coins = 0;
  const re = /《([^》]+)》/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(beforeContent)) !== null) {
    if (m[1] === 'コインアイコン') { coins++; continue; }
    if (ENERGY_COLORS.has(m[1] as EnergyCost['color'])) { energy.push({ color: m[1] as EnergyCost['color'], count: 1 }); continue; }
    const inner = m[1].match(/^([白赤青緑黒無])×([０-９0-9]+)$/);
    if (inner) {
      const cnt = parseInt(inner[2].replace(/[０-９]/g, c => String(c.charCodeAt(0) - 0x30 - 0xFEE0)));
      energy.push({ color: inner[1] as EnergyCost['color'], count: isNaN(cnt) ? parseInt(inner[2]) : cnt });
    }
  }
  return (energy.length > 0 || coins > 0) ? { energy, coins } : null;
}

/**
 * 【ベット】で支払えるコイン枚数の選択肢。
 *  - 固定（「ベット―《コイン》《コイン》」）→ `{ options:[2], variable:false }`
 *  - 段階（「ベット―《コイン》or《コイン》《コイン》」）→ `{ options:[1,2], variable:false }`
 *  - 可変（「ベット―好きな枚数の《コイン》」）→ `{ options:[], variable:true }`（UIで1..所持枚数を提示）
 *
 * 🆕**2026-09-02（§5.3 `O-86` 第3バッチ）で `src/screens/battle/costs.ts` からここへ移した。**
 * ⚠**ベットではないカードは `null`**（従来の `{options:[],variable:false}` と同義）＝payload を刻まない。
 */
export function parseBetOptionsText(effectText: string): BetCostSpec | null {
  if (!effectText) return null;
  const m = effectText.match(/ベット[―─]\s*([\s\S]*)/);
  if (!m) return null;
  const seg = m[1];
  if (/^好きな枚数/.test(seg)) return { options: [], variable: true };
  // 先頭の《コインアイコン》/or の連続部分だけを取り出して段階を数える
  const prefix = (seg.match(/^(?:《コインアイコン》|or)+/) ?? [''])[0];
  const tiers = prefix.split('or').map(t => (t.match(/《コインアイコン》/g) ?? []).length).filter(n => n > 0);
  return tiers.length > 0 ? { options: tiers, variable: false } : null;
}

/**
 * 【ブースト】の任意追加エナコスト（先頭の「ブースト―《色》…」）。
 *
 * 🆕**2026-09-02（§5.3 `O-86` 第4バッチ）で `src/screens/battle/costs.ts` からここへ移した**（5枚）。
 * ⚠アーツ本体 `cost.energy` とは分離する＝宣言時だけ `ArtsModal` の支払い検証へ加える
 *   （本体へ足すと**ブーストしなくても払わされる**＝過剰の側）。
 */
export function parseBoostCostText(effectText: string): EnergyCost[] | null {
  const m = effectText.match(/^ブースト[―─]((?:《[白赤青緑黒無]》)+)/);
  if (!m) return null;
  const counts = new Map<EnergyCost['color'], number>();
  for (const icon of m[1].matchAll(/《([白赤青緑黒無])》/g)) {
    const color = icon[1] as EnergyCost['color'];
    counts.set(color, (counts.get(color) ?? 0) + 1);
  }
  const out = [...counts].map(([color, count]) => ({ color, count }));
  return out.length > 0 ? out : null;
}

// ── 使用時の任意支払いによるコスト軽減（§5.3 `O-86` 第5バッチ・旧 `screens/battle/useTimeCost.ts`）──
//
// ⚠タスク12(lxxxi) の「使用コストは《X》に**なる**」＝**置換**（`computeCostReplacement`）とは別物。
//   あちらは色構成ごと差し替わるが、こちらは**印刷コストから差し引く**（`removeNColorFromCost` の反復）。
// ⚠**支払いは使用時に済ませる**＝効果解決中に同じ支払いを行う先頭ステップは parser 側で落とす
//   （`stripUseTimeCostReductionStep`）。

const RED_COST = '((?:《[^》]+》)+)';
const utNum = (t: string) => parseInt(toHalfWidthDigits(t), 10);

/** 「《白×2》《赤》」形式のコスト表記を色別の数量へ落とす（旧 `normalizeCostText`＋`parseGrowCost` の合成）。 */
function parseCostIcons(raw: string): { color: string; count: number }[] {
  const out: { color: string; count: number }[] = [];
  for (const m of raw.matchAll(/《([^×》]+?)(?:×([０-９\d]+))?》/g)) {
    const color = m[1].trim();
    if (['コイン', 'ターン1回', 'アタックフェイズ', 'ダウン'].includes(color)) continue;
    const count = m[2] ? utNum(m[2]) : 1;
    if (count > 0) out.push({ color, count });
  }
  return out;
}

/** 「好きな数」「２枚まで」「１枚」→ 上限枚数。`'ANY'`＝候補数が上限。 */
function parseUseCostAmount(raw: string): number | 'ANY' {
  if (/^好きな/.test(raw)) return 'ANY';
  const m = raw.match(/([０-９\d]+)(?:枚|体)(まで)?/);
  if (!m) return 1;
  return utNum(m[1]);
}

/**
 * 支払い候補の記述（「青のスペル」「＜毒牙＞のシグニ」「《ガードアイコン》を持つシグニ」
 * 「パワー10000以上のシグニ」「レベル２以下の＜古代兵器＞のシグニ」）を filter へ落とす。
 */
function parseUseCostDescriptor(d: string): UseTimeCostSpecJson['filter'] {
  const f: UseTimeCostSpecJson['filter'] = {};
  const color = d.match(/([白赤青緑黒])の/);
  if (color) f.color = color[1];
  const stories = [...d.matchAll(/＜([^＞]+)＞/g)].map(m => m[1]);
  if (stories.length > 0) f.story = stories;
  const power = d.match(/パワー([０-９\d]+)以上/);
  if (power) f.minPower = utNum(power[1]);
  const level = d.match(/レベル([０-９\d]+)以下/);
  if (level) f.maxLevel = utNum(level[1]);
  if (/《ガードアイコン》を持つ/.test(d)) f.hasGuard = true;
  const type = d.match(/(シグニ|スペル|アーツ)$/);
  // 「カード」＝種別不問なので cardType を立てない（`SP38-003` の「青のカード」）。
  if (type) f.cardType = type[1];
  return f;
}

/** 軽減量の記述（比例形／固定形）を読む。見つからなければ null。 */
function parseUseCostReductionClause(
  text: string,
): { perUnit: boolean; reduction: { color: string; count: number }[] } | null {
  // 比例形：「使用コストは(、)この方法で捨てた(カード|シグニ)１枚につき《X》減る」
  const per = text.match(
    new RegExp(`使用コストは[、,]?この方法で(?:捨てた|ダウンした|トラッシュに置いた)(?:カード|シグニ)[１1](?:枚|体)につき${RED_COST}減る`),
  );
  if (per) return { perUnit: true, reduction: parseCostIcons(per[1]) };
  // 固定形：「そうした場合、…使用コストは《X》減る」
  const fixed = text.match(new RegExp(`そうした場合[、,][^。]*?使用コストは${RED_COST}減る`));
  if (fixed) return { perUnit: false, reduction: parseCostIcons(fixed[1]) };
  return null;
}

/**
 * 使用時の任意支払いによるコスト軽減を読む。この形でなければ `null`。
 *
 * ⚠**ベット由来の「減る」（`WDK15-007`）は対象外**＝支払い元がコインで、宣言UIは既にベット枝が持っている。
 * ⚠**「使用コストとして追加で支払う」（`SPK06-01`）も対象外**＝減額ではなく増額で、原文の意味が逆。
 */
export function parseUseTimeCostReductionText(effectText: string): UseTimeCostSpecJson | null {
  if (!effectText || !/使用する際/.test(effectText)) return null;
  const red = parseUseCostReductionClause(effectText);
  if (!red || red.reduction.length === 0) return null;
  const HEAD = 'この(?:スペル|アーツ|カード)を使用する際[、,]';

  // ① 手札から捨てる
  const hand = effectText.match(
    new RegExp(`${HEAD}手札から(.+?)を(好きな枚数|[０-９\\d]+枚(?:まで)?)(?:捨ててもよい|捨てる)。`),
  );
  if (hand) {
    return { source: 'hand', filter: parseUseCostDescriptor(hand[1]), max: parseUseCostAmount(hand[2]), ...red };
  }

  // ② 場のアップ状態のシグニをダウンする
  const down = effectText.match(
    new RegExp(`${HEAD}あなたのアップ状態の(.+?)を(好きな数|[０-９\\d]+体(?:まで)?)ダウンしてもよい。`),
  );
  if (down) {
    return { source: 'signi_down', filter: parseUseCostDescriptor(down[1]), max: parseUseCostAmount(down[2]), ...red };
  }

  // ②' 場のシグニをトラッシュへ（タスク12(lxxxix)）。⚠**語順が2通りある**＝
  //    「あなたのシグニ**を好きな数**場からトラッシュに置く」／「あなたの…シグニ**１体を場から**トラッシュに置いてもよい」。
  const trashAny = effectText.match(
    new RegExp(`${HEAD}あなたの(.+?)を(好きな数|[０-９\\d]+体(?:まで)?)場からトラッシュに置(?:いてもよい|く)。`),
  );
  if (trashAny) {
    return { source: 'signi_trash', filter: parseUseCostDescriptor(trashAny[1]), max: parseUseCostAmount(trashAny[2]), ...red };
  }
  const trashN = effectText.match(
    new RegExp(`${HEAD}あなたの(.+?)([０-９\\d]+体(?:まで)?)を場からトラッシュに置(?:いてもよい|く)。`),
  );
  if (trashN) {
    return { source: 'signi_trash', filter: parseUseCostDescriptor(trashN[1]), max: parseUseCostAmount(trashN[2]), ...red };
  }

  // ③ ルリグデッキのアーツをルリグトラッシュへ
  const lrigArts = effectText.match(
    new RegExp(`${HEAD}あなたのルリグデッキから(?:([白赤青緑黒])の)?アーツ[１1]枚をルリグトラッシュに置いてもよい。`),
  );
  if (lrigArts) {
    return {
      source: 'lrig_deck_arts',
      filter: { cardType: 'アーツ', ...(lrigArts[1] ? { color: lrigArts[1] } : {}) },
      max: 1, ...red,
    };
  }

  // ④ ライフクロス1枚をトラッシュへ
  if (new RegExp(`${HEAD}あなたのライフクロス[１1]枚をトラッシュに置いてもよい。`).test(effectText)) {
    return { source: 'life_cloth', filter: {}, max: 1, ...red };
  }

  // ⑤ 場のキー1枚をルリグトラッシュへ
  if (new RegExp(`${HEAD}あなたのキー[１1]枚を場からルリグトラッシュに置いてもよい。`).test(effectText)) {
    return { source: 'key', filter: {}, max: 1, ...red };
  }

  return null;
}

// ── 条件つき使用コストの置換／軽減（§5.3 `O-86` 第6バッチ・旧 `costs.ts:computeCostReplacement`）──
//
// 🔑**旧実装の評価順をそのまま項の順序で表す**＝「順に見て最初に成立した項が勝つ」。
//   ⓪' ベット形の**軽減**（ガードより前）→ ①ベット形の**置換** → ①'任意支払い形 →
//   ②相手のこのターンのアーツ/スペル使用（両方 → どちらか）→ ③自分の場のカード名 → ④自分のトラッシュ枚数。
// 🔴**先頭3つは `stopIfUnmet`**＝旧実装が「宣言していなければ即 null」と早期 return していたため。
//   ここを落とすと、宣言しなかったときに後段の項へ落ちて**別の置換が勝手に成立する**。

/** 「使用コストは《X》**減る**」側のアイコン列（旧 `computeCostReplacement` の betReduce と同じ読み方）。 */
function parseReduceIcons(raw: string): { color: string; count: number }[] {
  const out: { color: string; count: number }[] = [];
  for (const one of raw.match(/《([^》]+)》/g) ?? []) {
    const mm = one.match(/《([白赤青緑黒無])[×x]?([０-９\d]*)》/);
    if (!mm) continue;
    out.push({ color: mm[1], count: mm[2] ? utNum(mm[2]) : 1 });
  }
  return out;
}

/**
 * 「使用する際、手札から〈色A〉と〈色B〉の＜C＞のシグニを１枚ずつ捨ててもよい。そうした場合、
 *  使用コストは《X》に**なる**」＝任意支払いでコストを置換する形（`WX21-035`／`WX21-071` の2枚）。
 */
export function parseOptionalDiscardCostText(effectText: string): OptionalDiscardCostSpec | null {
  const m = effectText.match(
    /この(?:スペル|アーツ|カード)を使用する際[、,]手札から([白赤青緑黒])と([白赤青緑黒])の＜([^＞]+)＞のシグニを[１1]枚ずつ捨ててもよい。そうした場合[、,][^。]*?使用コストは((?:《[^》]+》)+)になる/,
  );
  if (!m) return null;
  return {
    groups: [
      { color: m[1], story: m[3], count: 1 },
      { color: m[2], story: m[3], count: 1 },
    ],
    cost: parseCostIcons(m[4]),
  };
}

/** 条件つき使用コストの置換／軽減の項を、旧実装と同じ評価順で並べて返す。 */
export function parseCostReplacementTerms(effectText: string): CostReplacementTerm[] | null {
  const terms: CostReplacementTerm[] = [];
  const COST = '((?:《[^》]+》)+)';

  // ⓪' ベット形の**軽減**（`WDK15-007`）。⚠**ガード（「〜になる」）より前**に見る＝
  //     この形に当たったら以降は一切見ない（旧実装の early return）。
  const betReduce = effectText.match(/あなたがベットする場合[、,][^。]*?使用コストは((?:《[^》]+》)+)減る/);
  if (betReduce) {
    return [{ when: { kind: 'betting' }, mode: 'reduce', cost: parseReduceIcons(betReduce[1]), stopIfUnmet: true }];
  }
  // 🔴**ガード**＝「使用コストは…になる」を含まない原文には置換の項を1つも作らない（旧実装と同じ）。
  if (!/使用コストは[^。]*になる/.test(effectText)) return null;

  // ① ベット形の置換（`WD17-006` / `WDK01-007` ほか計9枚）
  const betReplace = effectText.match(new RegExp(`あなたがベットする場合[、,][^。]*?使用コストは${COST}になる`));
  if (betReplace) {
    return [{ when: { kind: 'betting' }, mode: 'replace', cost: parseCostIcons(betReplace[1]), stopIfUnmet: true }];
  }
  // ①' 使用時の任意支払い形（`WX21-035` / `WX21-071`）＝ベット形と同じく**宣言してはじめて成立する**。
  const optDiscard = parseOptionalDiscardCostText(effectText);
  if (optDiscard) {
    return [{ when: { kind: 'paidOptionalDiscard' }, mode: 'replace', cost: optDiscard.cost, stopIfUnmet: true }];
  }

  // ② 対戦相手のこのターンのアーツ／スペル使用（`WX09-Re02`）。
  //    「両方」のほうが強い条件＝先に置く（両方成立時は後段の《白×0》が正）。
  const both = effectText.match(new RegExp(`両方を使用していた場合[、,][^。]*?使用コストは${COST}になる`));
  if (both) {
    terms.push({ when: { kind: 'oppUsedThisTurn', arts: true, spell: true, mode: 'all' }, mode: 'replace', cost: parseCostIcons(both[1]) });
  }
  const either = effectText.match(
    new RegExp(`このターンに対戦相手がアーツかスペルを使用していた場合[、,][^。]*?使用コストは${COST}になる`),
  );
  if (either) {
    terms.push({ when: { kind: 'oppUsedThisTurn', arts: true, spell: true, mode: 'any' }, mode: 'replace', cost: parseCostIcons(either[1]) });
  }
  // ③ 場に特定カード名がある場合（`WX05-038`）
  const fieldName = effectText.match(new RegExp(`あなたの場に《([^》]+)》がある場合[、,][^。]*?使用コストは${COST}になる`));
  if (fieldName) {
    terms.push({ when: { kind: 'selfFieldHasCardName', cardName: fieldName[1] }, mode: 'replace', cost: parseCostIcons(fieldName[2]) });
  }
  // ④ トラッシュ枚数条件（`WD22-041-UG`）
  const trashCount = effectText.match(
    new RegExp(`あなたのトラッシュにカードが([０-９\\d]+)枚以上ある場合[、,][^。]*?使用コストは${COST}になる`),
  );
  if (trashCount) {
    terms.push({ when: { kind: 'selfTrashCountGte', value: utNum(trashCount[1]) }, mode: 'replace', cost: parseCostIcons(trashCount[2]) });
  }
  return terms.length > 0 ? terms : null;
}

/**
 * カード原文から**印字キーワードコスト**をまとめて読む（【アンコール】【ベット】【ブースト】＋使用時の任意支払い軽減）。
 *
 * 🔑**これはカード単位の事実**＝効果本文の解釈ではないので、
 *   ①`parseCardEffects` が先頭効果へ刻み（fresh 側の正）
 *   ②`buildEffectsJson.ts` が**収穫マージの後から**同じものを重ねる（`manualEffects.ts` が
 *     本文を手書きしたカードでも失われない＝実測でアンコール9枚／ベット21枚が該当）。
 *   両方を同じ関数から作ることで「fresh と live で別の値になる」経路を構造的に消している。
 */
export function printedKeywordCosts(
  effectText: string | undefined,
): Pick<EffectCost, 'encoreCost' | 'betOptions' | 'boostCost' | 'useTimeCost' | 'costReplacement' | 'optionalDiscardCost'> {
  const encoreCost = parseEncoreCostText(effectText ?? '');
  const betOptions = parseBetOptionsText(effectText ?? '');
  const boostCost = parseBoostCostText(effectText ?? '');
  const useTimeCost = parseUseTimeCostReductionText(effectText ?? '');
  const costReplacement = parseCostReplacementTerms(effectText ?? '');
  const optionalDiscardCost = parseOptionalDiscardCostText(effectText ?? '');
  return {
    ...(encoreCost ? { encoreCost } : {}),
    ...(betOptions ? { betOptions } : {}),
    ...(boostCost ? { boostCost } : {}),
    ...(useTimeCost ? { useTimeCost } : {}),
    ...(costReplacement ? { costReplacement } : {}),
    ...(optionalDiscardCost ? { optionalDiscardCost } : {}),
  };
}

/** 印字キーワードコストのキー一覧（重ねる側／除外する側の両方がこれを使う）。 */
export const PRINTED_KEYWORD_COST_KEYS = [
  'encoreCost', 'betOptions', 'boostCost', 'useTimeCost', 'costReplacement', 'optionalDiscardCost',
] as const;
