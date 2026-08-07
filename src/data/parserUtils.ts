import type { Owner, EffectTarget, TargetFilter, StubAction, EnergyCost } from '../types/effects';

// costColors から実際の色名だけを抽出（カード名を除外、《赤×2》→["赤","赤"]に展開）
export function extractCostColors(text: string): string[] {
  const result: string[] = [];
  for (const m of text.matchAll(/《([^》]+)》/g)) {
    const s = m[1];
    const countM = s.match(/^([赤青緑黒白無])[×x×](\d+)$/);
    if (countM) {
      const count = parseInt(countM[2], 10);
      for (let i = 0; i < count; i++) result.push(countM[1]);
    } else if (/^[赤青緑黒白無]$/.test(s)) {
      result.push(s);
    }
    // カード名・その他は無視
  }
  return result;
}

// 「対戦相手のシグニ1体を対象とし、あなたの**他の**シグニ1体を場からトラッシュ／デッキの一番下に置いてもよい」＝
// トレード形の任意コスト。犠牲対象は原文どおり効果元自身を除く（excludeSelf）。
// 「他の」が無い在来形は従来どおり TRADE_BANISH_SELF_SIGNI のまま（後方互換）。
export function tradeOptionalCost(t: string): StubAction {
  const story = t.match(/他の[＜〈<]([^＞〉>]+)[＞〉>]のシグニ/)?.[1];
  const filter: TargetFilter = { cardType: 'シグニ', ...(story ? { story } : {}) };
  if (/あなたの他の(?:[＜〈<][^＞〉>]+[＞〉>]の)?シグニ[１1]体を場からデッキの一番下に置いてもよい/.test(t)) {
    return { type: 'STUB', id: 'OPTIONAL_COST', fieldToDeckBottom: { count: 1, filter, excludeSelf: true } };
  }
  if (/(?:対象の)?あなたの他の(?:[＜〈<][^＞〉>]+[＞〉>]の)?シグニ[１1]体を場からトラッシュに置(?:き|いてもよい)/.test(t)) {
    return { type: 'STUB', id: 'OPTIONAL_COST', fieldTrash: { count: 1, filter, excludeSelf: true } };
  }
  return { type: 'STUB', id: 'TRADE_BANISH_SELF_SIGNI' };
}

// REVEAL_PICK_HAND_SHUFFLE_BOTTOM STUBのメタデータを抽出して返す
export function makeRevealPickStub(t: string): StubAction {
  // タスク12(xlvi)(h)：pick 記述子（filter・枚数・上限・行き先）を先に解く。忠実表現できた場合だけ
  // 従来の粗い枚数抽出を上書きする（従来は「その中から白のカードを３枚まで選び」を拾えず 1枚固定＝過小実行、
  // かつ filter を一切運ばず**どのカードでも拾える過剰実行**だった）。
  const desc = parseRevealPickDescriptor(t);
  let pickCount: number | 'ALL' = 1;
  // パターン1: "その中からN枚" (直接)
  const countM = t.match(/その中から([０-９\d]+|好きな枚数|すべて)/);
  if (countM) {
    const v = countM[1];
    if (v === '好きな枚数' || v === 'すべて') pickCount = 'ALL';
    else pickCount = parseNum(v);
  } else {
    // パターン2: "カードをN枚まで" or "N枚まで手札に加え" (数字が中間にある場合)
    const countM2 = t.match(/([０-９\d]+)枚(?:まで)?(?:を)?手札に加え/);
    if (countM2) pickCount = parseNum(countM2[1]);
  }
  let restDest: 'deck_bottom' | 'trash' | 'energy' = 'deck_bottom';
  if (desc) {
    // 記述子が解けたときは pick の行き先が文末に来る（「宣言したカードをすべてエナゾーンに置く」WX13-054）。
    // 従来の文末アンカー（`エナゾーンに置く$`）はそれを**残りの行き先**と誤読し、非対象の公開札まで
    // エナへ送る過剰実行になるため、「残り」を明示する句だけを見る。
    if (/残り[^。]*トラッシュ/.test(t)) restDest = 'trash';
    else if (/残り[^。]*エナゾーン/.test(t)) restDest = 'energy';
  } else if (t.match(/残り.*トラッシュ|トラッシュに置く$|トラッシュに置いてもよい$/)) restDest = 'trash';
  else if (t.match(/残り.*エナゾーン|エナゾーンに置く$/)) restDest = 'energy';
  const restShuffle = /残り[^。]*シャッフル/.test(t);
  const then: 'hand' | 'energy' =
    (t.match(/エナゾーンに置く/) && !t.match(/手札に加え/)) ? 'energy' : 'hand';
  return {
    type: 'STUB', id: 'REVEAL_PICK_HAND_SHUFFLE_BOTTOM',
    revealPickParams: {
      pickCount: desc ? desc.pickCount : pickCount,
      restDest,
      ...(restShuffle ? { restShuffle: true } : {}),
      then: desc ? (desc.dest === 'energy' ? 'energy' : 'hand') : then,
      ...(desc && Object.keys(desc.filter).length > 0 ? { filter: desc.filter } : {}),
      ...(desc?.pickUpTo ? { pickUpTo: true } : {}),
      ...(desc && desc.noun !== 'シグニ' ? { pickNoun: desc.noun } : {}),
      ...(desc?.dest === 'hand_or_energy' ? { handOrEnergy: true } : {}),
    },
  } as StubAction;
}


const FW_DIGIT: Record<string, string> = {
  '０':'0','１':'1','２':'2','３':'3','４':'4',
  '５':'5','６':'6','７':'7','８':'8','９':'9',
};
export function toHalf(s: string): string {
  return s.replace(/[０-９]/g, c => FW_DIGIT[c] ?? c);
}
// ルール補足テキスト（全角括弧）を除去（入れ子対応：内側から順に除去）
export function stripRuleParens(s: string): string {
  let result = s;
  let prev: string;
  do {
    prev = result;
    result = result.replace(/（[^（）]*）/g, '');
  } while (result !== prev);
  return result.trim();
}
export function parseNum(s: string): number {
  return parseInt(toHalf(s), 10);
}

export function parseSignedNum(s: string): number {
  const h = toHalf(s);
  if (h.startsWith('-') || h.startsWith('－')) return -parseInt(h.replace(/[＋－+-]/, ''), 10);
  return parseInt(h.replace(/[＋＋+]/, ''), 10);
}

export function parsePowerFilter(text: string): Partial<TargetFilter> {
  const above = text.match(/パワー([０-９\d]+)以上/);
  const below = text.match(/パワー([０-９\d]+)以下/);
  if (above || below) {
    return { powerRange: { min: above ? parseNum(above[1]) : undefined, max: below ? parseNum(below[1]) : undefined } };
  }
  return {};
}

// 状態フィルタ（対象を「凍結/ダウン/アップ状態のシグニ」に絞る）。
// parseSigniTarget は既に isFrozen/isDown/isUp を拾うが、BOUNCE/BANISH/TRANSFER_TO_DECK 等の
// インライン target ビルダーは状態フィルタを落としていた（過剰効果の温床）ため、それらで再利用する共通化ヘルパー。
// ※ owner は呼び出し側で決まる＝状態語は「対戦相手の/あなたの」どちらでも filter として正しい。
//   「ダウン状態で場に出す」は状態フィルタではないので除外（parseSigniTarget と同一ガード）。
export function parseStateFilter(text: string): Partial<TargetFilter> {
  const f: Partial<TargetFilter> = {};
  if (text.includes('凍結状態')) f.isFrozen = true;
  if (text.includes('アップ状態')) f.isUp = true;
  if (text.includes('ダウン状態') && !text.includes('ダウン状態で場に出')) f.isDown = true;
  return f;
}

export function parseLevelFilter(text: string): Partial<TargetFilter> {
  const above = text.match(/レベル([０-９\d]+)以上/);
  const below = text.match(/レベル([０-９\d]+)以下/);
  const exact = text.match(/レベル([０-９\d]+)の/);
  if (above || below) {
    return { level: { min: above ? parseNum(above[1]) : undefined, max: below ? parseNum(below[1]) : undefined } };
  }
  if (exact) return { level: parseNum(exact[1]) };
  return {};
}

export function parseColorFilter(text: string): Partial<TargetFilter> {
  for (const c of ['白', '赤', '青', '緑', '黒']) {
    if (text.includes(`${c}の`)) return { color: c };
  }
  return {};
}

// 「(あなたの)センタールリグと共通する色を持つ／持たない〔シグニ/スペル/カード〕」
// ＝colorMatchesLrig／colorNotMatchesLrig（engine が動的解決）。
// 名詞句修飾形に限定（全文スキャン禁止の教訓・parser_backlog）。SEARCH/REVEAL/ADD_TO_FIELD/TRANSFER_TO_HAND の各 handler で共用。
const LRIG_COLOR_RE = /センタールリグと共通する色を持つ(?:それぞれレベルの異なる)?(?:＜[^＞]+＞の)?(?:レベル[０-９\d＋以下上]+の)?(?:すべての)?(?:シグニ|スペル|カード)/;
const LRIG_COLOR_NOT_RE = /センタールリグと共通する色を持たない(?:対戦相手の)?(?:シグニ|カード)/;
export function parseColorMatchesLrig(
  text: string,
  options: { includeNegative?: boolean } = {},
): Partial<TargetFilter> {
  if (options.includeNegative && LRIG_COLOR_NOT_RE.test(text)) return { colorNotMatchesLrig: true };
  return LRIG_COLOR_RE.test(text) ? { colorMatchesLrig: true } : {};
}

// 《ガードアイコン》を持つ → hasGuard ／ 持たない → noGuard（G237）。名詞句スパンに対して呼ぶこと。
/**
 * 「能力を持たない〜シグニN体/N枚」＝**対象を能力なしに絞る名詞句修飾**（§5d パターンA・14効果）。
 *
 * ⚠🔴**同じ「能力を持たない」でも用法が4つあり、3つは filter にしてはいけない**（全CSV実測）：
 *   (a) ✅名詞句修飾＝「**能力を持たない**対戦相手のシグニ**１体**を対象とし」＝これだけが filter。
 *   (b) ❌**付与形**＝「それらを**能力を持たないシグニとして**場に出す」（WXDi-P03-034/P07-005/P13-042/P15-046・
 *       WX16-Re20）＝出す**際に能力を失わせる**アクション側の修飾。filter にすると
 *       「トラッシュから選べるのが能力なしシグニだけ」になり**原文と逆の過小実行**になる。
 *   (c) ❌条件節＝「それが**能力を持たない場合**、代わりに…」（WX25-P3-038/069/072/073・WX25-CP1-002）＝
 *       `LAST_PROCESSED_HAS_NO_ABILITIES` の領分。
 *   (d) ❌リマインダー＝「（《ＳＥＲＶＡＮＴ　ＺＥＲＯ》はレベル１、＜精元＞、パワー1000、無色で
 *       **能力を持たないシグニである**）」＝カード注釈。
 *
 * したがって **「として」が後続しない**かつ **シグニに数量詞が付く**形だけを取る。
 * 「対戦相手の場に能力を持たないシグニが**ある**かぎり/場合」（存在条件）も数量詞が無いので自然に外れる。
 */
export function parseNoAbilitiesFilter(text: string): Partial<TargetFilter> {
  const m = text.match(/能力を持たない(?:対戦相手の|あなたの)?[^。、]{0,14}?シグニ(?:を)?(?:好きな枚数|[０-９\d]+(?:体|枚))/);
  if (!m) return {};
  if (/として/.test(m[0])) return {};                 // (b) 付与形
  return { noAbilities: true };
}

export function parseGuardFilter(text: string): Partial<TargetFilter> {
  if (/《ガードアイコン》を持たない/.test(text)) return { noGuard: true };
  if (/《ガードアイコン》を持つ/.test(text)) return { hasGuard: true };
  return {};
}

/**
 * 「《カード名》以外の〜」＝**カード名除外**の名詞句修飾（§5d パターンA・続き371）。
 *
 * `excludeCardName` は型・`matchesFilter`（`execUtils`/`effectEngine` の両方）・decompiler に**実装済み**で、
 * 壊れていたのは各アクションビルダーの**フィルタ合成の配線**だった（パターンA の典型形）。配線漏れの実害は2種：
 *   ①**反転**＝除外すべき名前が `cardName`（部分一致）に入り「そのカードしか選べない」原文と真逆の効果
 *     （SEARCH 系13効果。live JSON にのみ残っていた旧値で、parser 側は既に是正済みだった）。
 *   ②**脱落**＝除外が消えて自分自身も選べる**過剰効果**（トラッシュ/エナ回収系23効果）。
 *
 * ⚠全CSV走査（`《X》以外の` 50ヒット／49効果）で確認した**別用法**＝
 *   「《アーク・ディストラクト》**以外のアーツを使用していない場合**」（PR-204/PR-238）だけは**条件節**であって
 *   対象フィルタではない。したがって本関数は**対象名詞句スパンに対して呼ぶ**こと（文全体に対して呼ぶ場合は、
 *   その分岐が条件節を含まないことを確認してから使う）。
 *   それ以外の48件はすべて名詞句修飾（除外対象は常にカード名で、《…アイコン》以外 の形は存在しない）。
 */
export function parseExcludeCardNameFilter(span: string): Partial<TargetFilter> {
  const m = span.match(/《([^》]+)》以外の/);
  return m ? { excludeCardName: m[1] } : {};
}

/** 対象名詞句 span から、既存の静的 TargetFilter 語彙を合成する。 */
export function extractNounPhraseFilter(
  span: string,
  options: { levelText?: string | null } = {},
): TargetFilter {
  const levelText = options.levelText === undefined ? span : options.levelText;
  const filter: TargetFilter = {
    ...parseCardTypeFilter(span),
    ...(levelText === null ? {} : parseLevelFilter(levelText)),
    ...parseStoryFilter(span),
    ...parseColorMatchesLrig(span),
    ...parseGuardFilter(span),
  };

  const excludeName = span.match(/《([^》]+)》以外の/);
  if (excludeName) filter.excludeCardName = excludeName[1];
  Object.assign(filter, parseNoAbilitiesFilter(span));
  const containsName = span.match(/カード名に《([^》]+)》を含む/);
  if (containsName) filter.cardName = containsName[1];
  if (/無色ではない/.test(span)) filter.nonColorless = true;

  const positiveSpan = span.replace(/無色ではない/g, '');
  const colorOr = positiveSpan.match(/([白赤青緑黒])(?:か|または)([白赤青緑黒])の/);
  if (colorOr) {
    filter.color = [...new Set([colorOr[1], colorOr[2]])];
  } else if (/無色の/.test(positiveSpan)) {
    filter.color = '無';
  } else {
    const colors = [...new Set([...positiveSpan.matchAll(/([白赤青緑黒])の(?:＜[^＞]+＞の)?(?=(?:カード|シグニ|スペル))/g)].map(m => m[1]))];
    if (colors.length === 1) filter.color = colors[0];
  }
  return filter;
}

// 「この方法で〔加えた/バニッシュした/移動した等〕シグニのレベル以下」＝直前処理カードのレベル参照（動的・engine 解決済）。
export function parseLevelLteLastProcessed(text: string): Partial<TargetFilter> {
  return /この方法で[^。]{0,20}?シグニのレベル以下/.test(text) ? { levelLteLastProcessed: true } : {};
}

// 「その枚数の差以下のレベルを持つ」＝自分と対戦相手の手札枚数の差以下のレベル（動的・engine 解決済）。
// 「手札が対戦相手より多い場合」（HAND_DIFF{gt,0}）ゲート下で発火する前提。該当1枚（WXK10-045）だが、
// 無制限バニッシュへの過剰簡約を防ぐ（levelLteFieldVirusCount と同型の単発動的フィルタ）。
export function parseHandDiffLevelFilter(text: string): Partial<TargetFilter> {
  return /枚数の差以下のレベルを持つ/.test(text) ? { levelLteHandDiff: true } : {};
}

// 「(この|自身)シグニより〔パワーの低い/高い・低いレベル/レベルの高い〕」＝効果元シグニ自身を基準にした動的比較。
// resolveDynamicFilter が sourceCardNum の実効パワー/レベルで powerRange/level へ解決する。
// ⚠自己参照（このシグニ/自身）に限定＝「その/あなたのいずれか/表記されている/センタールリグ」等の別基準は対象外
//   （それらは lastProcessed/trigger/printed 等の別機構）。過剰マッチ防止のため名詞句スパンに対して呼ぶこと。
export function parseSelfComparison(text: string): Partial<TargetFilter> {
  const m = text.match(/(?:このシグニ|自身)より(パワーの低い|パワーの高い|(?:低いレベルを持つ|レベルの低い)|(?:高いレベルを持つ|レベルの高い))/);
  if (!m) return {};
  const kind = m[1];
  if (kind === 'パワーの低い') return { powerLtSelf: true };
  if (kind === 'パワーの高い') return { powerGtSelf: true };
  if (/低いレベル|レベルの低い/.test(kind)) return { levelLtSelf: true };
  return { levelGtSelf: true };
}

// 「あなたのいずれかのシグニより〔パワー〕の〔低い〕」＝自分の場のシグニのいずれか（＝最大値）を基準にした動的比較。
// 「いずれか…より低い」＝いずれか1体より低ければ可＝最大実効パワー未満。resolveDynamicFilter が ownerState.field.signi の最大で解決。
// 該当2枚（WXDi-P01-020/WXDi-P07-031）は「パワーの低い」のみ＝過剰語彙を作らない。
export function parseAnyAllyComparison(text: string): Partial<TargetFilter> {
  return /あなたのいずれかのシグニよりパワーの低い/.test(text) ? { powerLtAnyAlly: true } : {};
}

// 「表記されているパワーよりパワーの〔低い/高い〕」＝各候補の実効パワーと自身の表記パワーの per-candidate 比較。
// 低い＝パワー低下中／高い＝パワー増強中。fieldCandidates が候補ごとに判定（静的 range では表せない）。
// 実装済み STUB（SIGNI_GRANT_CHOSEN_ABILITY 等・「高い」）は据置し、フィルタ脱落の plain 過剰効果のみ拾う。
export function parsePrintedComparison(text: string): Partial<TargetFilter> {
  if (/表記されているパワーよりパワーの低い/.test(text)) return { powerLtPrinted: true };
  if (/表記されているパワーよりパワーの高い/.test(text)) return { powerGtPrinted: true };
  return {};
}

// 「そのシグニより〔パワー/レベル〕の〔低い/高い〕」＝トリガー元シグニ（triggeringCardNum＝被バニッシュ/場に出た/アタッカー）基準の動的比較。
// resolveDynamicFilter が triggeringCardNum の表記パワー/レベルで解決する。
// ⚠「その後、そのシグニ」＝直前処理カード（lastProcessed・別機構）は除外。leftCard（「場を離れたとき…手札から」）は
//   ADD_TO_FIELD hand ビルダーが levelBelowLeftCard で別処理し parseSigniTarget を通らないため衝突しない。
export function parseTriggerComparison(text: string, opts?: { allowPlacement?: boolean; allowLevelEq?: boolean }): Partial<TargetFilter> {
  if (/その後/.test(text)) return {}; // lastProcessed（「その後、そのシグニ」）は別機構
  // 「そのシグニのパワー以下の」＝トリガー元パワー以下（「より低い」と別語形の Lte 形。WXEX1-42/WXEX1-53/WDK12-001）。
  // 「そうした場合、そのシグニのパワー以下」＝直前アクション結果（lastProcessed・WD04-018）は除外。
  if (/そのシグニのパワー以下の/.test(text) && !/そうした場合/.test(text)) return { powerLteTrigger: true };
  if (opts?.allowLevelEq && /そのシグニと同じレベルの/.test(text)) return { levelEqTrigger: true };
  const m = text.match(/そのシグニより(パワーの低い|パワーの高い|(?:低いレベルを持つ|レベルの低い)|(?:高いレベルを持つ|レベルの高い))/);
  if (!m) return {};
  // 「そのシグニより…を場に出す」＝比較対象自体を場に出す placement（leftCard 手札→場＝levelBelowLeftCard の領分・
  // 「ダウン状態で場に出す」の別アクション mis-parse への spurious マッチ含む＝WX14-009）は parseSigniTarget では除外。
  // ⚠マッチ位置より後方のみ判定（トリガー句「シグニが場に出たとき」の 場に出 は誤除外しない）。
  // allowPlacement＝trash→field ビルダー等 placement 自体が目的の呼び出しでは、選ぶシグニ側を絞る比較なので適用する。
  if (!opts?.allowPlacement && /場に出/.test(text.slice(m.index ?? 0))) return {};
  const kind = m[1];
  if (kind === 'パワーの低い') return { powerLtTrigger: true };
  if (kind === 'パワーの高い') return {}; // powerGtTrigger 該当カードなし（過剰語彙を作らない）
  if (/低いレベル|レベルの低い/.test(kind)) return { levelLtTrigger: true };
  return { levelGtTrigger: true };
}

// 「その後、そのシグニ/それより〔パワーの低い/低いレベル/レベルの高い〕」＝直前に処理したシグニ（この効果内で場に出た/公開した＝lastProcessed）基準の動的比較。
// トリガー元シグニ（parseTriggerComparison）と語は同じ「そのシグニより」だが、「その後」＝同一効果内の先行アクションで生じたシグニを指す（別機構）。
// resolveDynamicFilter が lastProcessedCards[0] のパワー/レベルで powerRange.max:N-1 / level.max:N-1 / level.min:N+1 へ解決（参照不能なら空ヒット）。
// 該当（WXDi-P08-031＝場出し→powerLt／WXK10-031＝公開→levelLt／WXDi-D07-019＝「場に出たそれより」→powerLt／
// WXEX2-28＝「それよりレベルの高い」→levelGt）以外の組は該当カードなし＝過剰語彙を作らない。
export function parseLastProcessedComparison(text: string): Partial<TargetFilter> {
  if (!/その後/.test(text)) return {}; // 「その後」＝lastProcessed 文脈のマーカー（トリガー参照と切り分け）
  const m = text.match(/(?:そのシグニ|それ)より(パワーの低い|(?:低いレベルを持つ|レベルの低い)|(?:高いレベルを持つ|レベルの高い))/);
  if (!m) return {};
  if (m[1] === 'パワーの低い') return { powerLtLastProcessed: true };
  if (/低いレベル|レベルの低い/.test(m[1])) return { levelLtLastProcessed: true };
  return { levelGtLastProcessed: true };
}

export function parseCardTypeFilter(text: string): Partial<TargetFilter> {
  if (text.includes('シグニ')) return { cardType: 'シグニ' };
  if (text.includes('スペル')) return { cardType: 'スペル' };
  if (text.includes('アーツ')) return { cardType: 'アーツ' };
  if (text.includes('ルリグ')) return { cardType: 'ルリグ' };
  return {};
}

/** 「コストの合計がN以下／以上／ちょうどN」のカード対象フィルタ。 */
export function parseCostTotalFilter(text: string): Partial<TargetFilter> {
  const m = text.match(/コストの合計が([０-９\d]+)(以下|以上)?/);
  if (!m) return {};
  const value = parseNum(m[1]);
  if (m[2] === '以下') return { costMax: value };
  if (m[2] === '以上') return { costMin: value };
  return { costMin: value, costMax: value };
}

// ＜クラス名＞ を配列で抽出（例: ＜鉱石＞か＜宝石＞ → ['鉱石','宝石']）
export function parseStoryFilter(text: string): Partial<TargetFilter> {
  // 同一クラス名が複数回出る場合（条件文＋フィルタ文で＜X＞が2回など）は重複除去
  const matches = [...new Set([...text.matchAll(/＜([^＞]+)＞/g)].map(m => m[1]))];
  if (matches.length === 0) return {};
  return { story: matches.length === 1 ? matches[0] : matches };
}

// 《カード名》 を抽出してカード名フィルターを返す
// コスト色（赤青緑黒白無）やアイコン系は除外する
const COST_COLORS = new Set(['白', '赤', '青', '緑', '黒', '無']);
export function parseNameFilter(text: string): Partial<TargetFilter> {
  const names = [...text.matchAll(/《([^》]+)》/g)]
    .map(m => m[1])
    .filter(s =>
      !COST_COLORS.has(s) &&
      !s.includes('×') &&
      !s.includes('アイコン') &&
      !s.match(/^[白赤青緑黒無][×x×]\d+$/)
    );
  if (names.length === 0) return {};
  return names.length === 1 ? { cardName: names[0] } : { cardNames: names };
}

// ===== シグニターゲットパース =====

// 「〈修飾語〉シグニN体を対象とし」の**その名詞句だけ**を見て所有者を決める（Opusタスク12(lii)）。
//
// 従来はどの規則も `t.includes('対戦相手') ? 'opponent' : 'self'` と**文全体**を見ており、
// 修飾語のない「シグニ1体を対象とし、それを〜する」が既定値 self へ落ちていた。原文が
// 「どちらのプレイヤーのシグニでもよい」と言っている対象を自分のシグニに限ってしまう誤りで、
// 除去系では「自分のシグニしか狙えない」＝実質使えない効果になる（WX07-027-E2）。
//
// 判定は対象句の直前セグメント（。、「」『』（）：区切り）に限る＝「あなたが【エナチャージ】を
// したとき、レベル３以下のシグニ1体を対象とし」のような**トリガー節のあなた**を所有格と誤読しない。
// 「正面の」は専用機構（filter.frontOfSelf）の領分なので触らず fallback を返す。
const SIGNI_TARGET_CLAUSE = /シグニ(?:を)?[０-９\d]*体(?:まで)?を?対象とし/;
const CLAUSE_SEG_BREAK = /[。、「」『』（）：]/;

/**
 * 「〈…＜X＞の〉シグニN体（まで）を対象とし」の**対象名詞句に隣接する ＜クラス＞ だけ**を拾う（続き376d）。
 *
 * ⚠**素の `parseStoryFilter(文全体)` を対象フィルタに使ってはいけない。** 実測（続き376d の A/B）で
 * 7効果中4効果が誤配線になった＝
 *   ・`WX14-016-E1`「アンコール－手札から**＜美巧＞の**シグニを１枚捨てる…対戦相手のシグニ１体を対象とし」
 *     ＝クラスは**アンコールコスト**側（対象に付けると相手の美巧しか戻せない過小実行）
 *   ・`WX22-011-E1`「…あなたの場に緑と白の**＜美巧＞の**シグニがある場合」＝**条件節**
 *   ・`WXEX2-55-E1`「あなたの場にある**＜天使＞の**シグニの数以下のレベルを持つ対戦相手のシグニ１体」＝**個数参照**
 *   ・`WXEX2-57-E1`「対象のあなたの緑の**＜美巧＞の**シグニ１体と同じレベルの…対戦相手のシグニ１体」＝**別の対象**
 * これは続き372 で「部分filter禁止ガードが全文を見ていた」のと同じ事故＝**対象名詞句に限定する**のが規律。
 *
 * 判定＝`＜X＞の` と対象句の間に**別の「シグニ」を挟まない**短い窓しか許さない。挟まったらそれは別の名詞句。
 */
const SIGNI_TARGET_ADJACENT_STORY = /＜([^＞]+)＞の(?:[^。、シ]{0,10})?シグニ(?:を)?[０-９\d]*体(?:まで)?を?対象とし/;
export function signiClauseStoryFilter(text: string): Partial<TargetFilter> {
  const m = text.match(SIGNI_TARGET_ADJACENT_STORY);
  return m ? { story: m[1] } : {};
}

export function signiClauseOwner(text: string, fallback: Owner = 'self'): Owner {
  // 文中に「対戦相手」があれば従来どおり opponent（既存挙動を一切変えないための先行判定）
  if (text.includes('対戦相手')) return 'opponent';
  const m = text.match(SIGNI_TARGET_CLAUSE);
  if (!m || m.index === undefined) return fallback;   // 対象化していない文＝従来どおり
  const before = text.slice(0, m.index);
  let start = 0;
  for (let i = before.length - 1; i >= 0; i--) {
    if (CLAUSE_SEG_BREAK.test(before[i])) { start = i + 1; break; }
  }
  const seg = before.slice(start);
  if (/あなた|自分/.test(seg)) return 'self';
  if (/正面/.test(seg)) return fallback;
  return 'any';
}

export function parseSigniTarget(text: string, owner: Owner): EffectTarget {
  const all = text.includes('すべてのシグニ') || text.includes('全てのシグニ') ||
              text.includes('シグニすべて') ||
              (!text.includes('このシグニ') && !!text.match(/シグニのパワーを/) && !text.match(/シグニ([０-９\d]+)体/));
  const upToM = text.match(/シグニを?([０-９\d]+)体まで/);
  const countM = text.match(/シグニを?([０-９\d]+)体/);
  const count = all ? 'ALL' : (upToM ? parseNum(upToM[1]) : (countM ? parseNum(countM[1]) : 1));
  const filter: TargetFilter = {
    cardType: 'シグニ',
    ...parsePowerFilter(text),
    ...parseLevelFilter(text),
    ...parseHandDiffLevelFilter(text),
    ...parseColorFilter(text),
    ...parseStoryFilter(text),
  };
  // ⚠従来は `hasOtherSelfSigniNoun`（＝「他の」がある）ときだけ isDisona を立てていたため、
  //   「あなたの《ディソナアイコン》のシグニ１体を対象とし」（`WXDi-P13-077-E1`）のように
  //   「他の」が無い形で**ディソナ限定が丸ごと落ちて**いた（続き376d）。ON_ATTACK_SIGNI の主語抽出と同じ
  //   「他の」ゲートの穴。「他の」の有無ではなく**対象名詞句かどうか**で判定するのが正しい。
  //   ⚠条件節「あなたの場に《ディソナアイコン》のシグニがある場合」を巻き込まないよう、
  //     **体数付きの対象句**（「シグニN体」）に限る。
  if (/《ディソナアイコン》のシグニ(?:を)?[０-９\d]+体/.test(text) || (hasOtherSelfSigniNoun(text) && /《ディソナアイコン》のシグニ/.test(text))) {
    filter.isDisona = true;
  }
  // 「この方法でダウンしたルリグと共通する色を持つ〜シグニ」＝直前に実処理したルリグの色基準。
  // 名詞句修飾形に限定し、一般の「共通する色」全文スキャンには広げない。
  // ⚠ 参照先は「効果内の DOWN（lastProcessedCards）」と「コストのルリグダウン（PlayerState）」の両方がありうる。
  //   colorMatchesLastDownedLrig は前者を優先し後者へフォールバックする（コスト経路は実UIでは支払いと効果解決が
  //   別 ExecCtx なので lastProcessedCards が届かず、旧 colorMatchesLastProcessed は丸ごと空ヒットだった
  //   ＝WX24-P2-069。タスク12(cix)）。
  if (/この方法でダウンしたルリグと共通する色を持つ(?:対戦相手の)?(?:パワー[０-９\d]+以下の)?シグニ/.test(text)) {
    filter.colorMatchesLastDownedLrig = true;
  }
  // 「この方法でダウンしたルリグと同じレベルの〜シグニ」＝ダウンしたルリグのレベル一致（WX25-P1-112／WX24-P1-040）。
  if (/この方法でダウンしたルリグと同じレベルの/.test(text)) filter.levelEqLastDownedLrig = true;
  // 「（対戦相手|あなた）の中央のシグニゾーンにある〈filter〉シグニN体」＝ゾーン限定（centerZoneOnly・engine の
  //   matchesStateFilter が zoneIdx===1 で判定）。従来は落ちて**どのゾーンのシグニでも選べる過剰実行**だった
  //   （WX15-033-E2／WX20-025-E3／WXDi-P02-065／WX24-P2-091＝タスク12(lxiii)）。
  //   ⚠「このシグニが中央のシグニゾーンにあるかぎり／場合、…対戦相手のシグニ1体を対象とし」＝**効果元の位置条件**を
  //     巻き込まないよう、名詞句が読点を挟まずシグニへ続く形に限定する。
  if (/中央のシグニゾーンにある[^。、]*シグニ/.test(text)) filter.centerZoneOnly = true;
  Object.assign(filter, parseNoAbilitiesFilter(text)); // 「能力を持たない〜シグニN体」（§5d パターンA）
  if (text.includes('感染状態')) filter.infected = true;
  if (text.includes('アクセされている') || text.match(/アクセされて(?:いる|いた)/)) filter.hasAcce = true;
  if (/【チャーム】が付いている/.test(text)) filter.hasCharm = true; // 「【チャーム】が付いている対戦相手のシグニ」（G153）
  if (text.includes('アップ状態')) filter.isUp = true;
  if (text.includes('ダウン状態') && !text.includes('ダウン状態で場に出')) filter.isDown = true;
  if (text.includes('凍結状態')) filter.isFrozen = true;
  // 「あなたの他の（修飾）シグニ」= 効果元シグニ自身を対象から除外。
  // 「他のシグニゾーン」「他のルリグ」「他のカード名」のように「他の」がシグニへ掛からない形は除外する。
  if (hasOtherSelfSigniNoun(text)) filter.excludeSelf = true;
  // 「（〜の）シグニのうち、最も[大きい/小さい/高い/低い]パワー/レベルを持つ」= superlative（集合単位の極値フィルタ）
  const sup = parseSuperlative(text);
  if (sup) filter.superlative = sup;
  // 「このシグニ/自身より〔パワー/レベル〕の〔低い/高い〕」= 効果元シグニ基準の動的比較（過剰効果の温床＝比較脱落を防ぐ）
  Object.assign(filter, parseSelfComparison(text));
  // 「そのシグニより〔パワー/レベル〕の〔低い/高い〕」= トリガー元シグニ基準（被バニッシュ/場に出た/アタッカー）
  Object.assign(filter, parseTriggerComparison(text));
  // 「その後、そのシグニより〔パワー/レベル〕の低い」= 直前に処理したシグニ基準（この効果内で場に出た/公開した＝lastProcessed）
  Object.assign(filter, parseLastProcessedComparison(text));
  // 「あなたのいずれかのシグニよりパワーの低い」= 自分の場のシグニの最大パワー基準（WXDi-P01-020/WXDi-P07-031）
  Object.assign(filter, parseAnyAllyComparison(text));
  // 「表記されているパワーよりパワーの低い/高い」= 各候補の実効パワー vs 自身の表記パワー（WX25-CP1-093/WXK10-027）
  Object.assign(filter, parsePrintedComparison(text));
  return { type: 'SIGNI', owner, count, filter, upToCount: !!upToM };
}

export function hasOtherSelfSigniNoun(text: string): boolean {
  // 「他の、赤のシグニ」の読点は修飾語の区切りであり、名詞境界ではない。
  return /あなたの(?:効果によって)?他の(?:、)?(?!(?:シグニゾーン|ルリグ|カード名))[^。、]*シグニ/.test(text);
}

// 「最も[大きい/高い/小さい/低い](パワー|レベル)」or「最も(パワー|レベル)の[高い/低い]」→ superlative {key,dir}。
export function parseSuperlative(text: string): { key: 'power' | 'level'; dir: 'max' | 'min' } | null {
  if (!text.includes('最も')) return null;
  const m = text.match(/最も(?:(大きい|高い|小さい|低い)(パワー|レベル)|(パワー|レベル)の(?:最も)?(高い|大きい|低い|小さい))/);
  if (!m) return null;
  const keyJa = m[2] ?? m[3];
  const dirJa = m[1] ?? m[4];
  const key: 'power' | 'level' = keyJa === 'レベル' ? 'level' : 'power';
  const dir: 'max' | 'min' = (dirJa === '大きい' || dirJa === '高い') ? 'max' : 'min';
  return { key, dir };
}


const ENERGY_COLORS = new Set(['白', '赤', '青', '緑', '黒', '無']);

export function parseEnergyCosts(str: string): EnergyCost[] {
  const costs: EnergyCost[] = [];
  // 《色》×数字 形式（起動能力コスト等）
  const re = /《([^》]+)》(?:×([０-９\d]+))?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(str)) !== null) {
    if (ENERGY_COLORS.has(m[1])) {
      costs.push({
        color: m[1] as EnergyCost['color'],
        count: m[2] ? parseNum(m[2]) : 1,
      });
    } else {
      // 《色×数字》 形式（説明文中のコスト表記）
      const inner = m[1].match(/^([白赤青緑黒無])×([０-９\d]+)$/);
      if (inner && ENERGY_COLORS.has(inner[1])) {
        costs.push({ color: inner[1] as EnergyCost['color'], count: parseNum(inner[2]) });
      } else {
        // 《色1/色2》×N 形式（混色コスト、無色N枚で近似）
        const bicolorInner = m[1].match(/^([白赤青緑黒])\/([白赤青緑黒])$/);
        if (bicolorInner) {
          const cnt = m[2] ? parseNum(m[2]) : 1;
          costs.push({ color: '無', count: cnt });
        } else {
          // 《色1/色2×N》 形式
          const bicolorNum = m[1].match(/^([白赤青緑黒])\/([白赤青緑黒])×([０-９\d]+)$/);
          if (bicolorNum) {
            costs.push({ color: '無', count: parseNum(bicolorNum[3]) });
          }
        }
      }
    }
  }
  return costs;
}

// ---- 「AかB（かC…）」形の pick 記述子 → TargetFilter（タスク12(xlvi)(f)）----
// look-pick 系の「その中から**スペルか＜原子＞のシグニ**１枚を…手札に加え」等。2つの形を区別する：
//   (1) 各要素が自分の名詞（シグニ/スペル/カード）を持つ＝独立節の OR → `anyOf`。
//       cardType の配列では表せない（「＜原子＞の」がスペル側にも掛かってしまう）。
//   (2) 先行要素が名詞を持たない修飾断片＝末尾の名詞を共有する色/クラスの OR → color/story の配列。
// 忠実表現できない形（レベル比較・動的filter・色とクラスの混在・想定外トークン）は null を返し、
// 呼び出し側は従来経路（＝この規則を使わない）へ落ちる。過剰な filter を出すより取りこぼす方を選ぶ。
const OR_PICK_NOUN_RE = /(シグニ|スペル|カード)$/;
const OR_PICK_TOKEN_RE = /^(?:＜[^＞]+＞の?|[白赤青緑黒]の?|無色の?|レベル[０-９\d]+(?:以上|以下)?の?)*(?:シグニ|スペル|カード)?$/;
export function parseOrPickDescriptor(desc: string): { filter: TargetFilter; noun: 'シグニ' | 'スペル' | 'カード' } | null {
  // ＜＞ の外側の「か」だけで分割する（クラス名の内側は割らない）
  const tokens: string[] = [];
  let buf = '', depth = 0;
  for (const ch of desc.trim()) {
    if (ch === '＜') depth++;
    else if (ch === '＞') depth--;
    else if (ch === 'か' && depth === 0) { tokens.push(buf); buf = ''; continue; }
    buf += ch;
  }
  tokens.push(buf);
  if (tokens.length < 2 || tokens.some(t => t === '')) return null;
  if (!tokens.every(t => OR_PICK_TOKEN_RE.test(t))) return null;
  const last = tokens[tokens.length - 1];
  const lastNoun = last.match(OR_PICK_NOUN_RE)?.[1] as 'シグニ' | 'スペル' | 'カード' | undefined;
  if (!lastNoun) return null;
  const heads = tokens.slice(0, -1);
  const nounFilter = (n: string): TargetFilter =>
    n === 'シグニ' ? { cardType: 'シグニ' } : n === 'スペル' ? { cardType: 'スペル' } : {};

  if (heads.some(t => OR_PICK_NOUN_RE.test(t))) {
    // (1) 独立節の OR。名詞を持たない要素が混ざる形（「スペルか青のシグニ」の「青」が単独等）は表現不能。
    if (!heads.every(t => OR_PICK_NOUN_RE.test(t))) return null;
    const anyOf = tokens.map(t => ({
      ...parseStoryFilter(t), ...parseColorFilter(t), ...parseLevelFilter(t),
      ...nounFilter(t.match(OR_PICK_NOUN_RE)![1]),
    }));
    if (anyOf.some(f => Object.keys(f).length === 0)) return null;
    return { filter: { anyOf }, noun: 'カード' };
  }

  // (2) 名詞共有の修飾断片 OR。色とクラスの混在（「白か＜天使＞のシグニ」）は AND/OR が曖昧なので受けない。
  const classes = [...new Set(tokens.flatMap(t => [...t.matchAll(/＜([^＞]+)＞/g)].map(m => m[1])))];
  const colors = [...new Set(tokens.flatMap(t => [...t.replace(/＜[^＞]+＞/g, '').matchAll(/[白赤青緑黒]/g)].map(m => m[0])))];
  if (classes.length > 0 && colors.length > 0) return null;
  if (classes.length === 0 && colors.length === 0) return null;
  const filter: TargetFilter = {
    ...(classes.length > 0 ? { story: classes.length === 1 ? classes[0] : classes } : {}),
    ...(colors.length > 0 ? { color: colors.length === 1 ? colors[0] : colors } : {}),
    ...parseLevelFilter(tokens.join('')),
    ...nounFilter(lastNoun),
  };
  return { filter, noun: lastNoun };
}

// ---- look-pick の融合経路（LOOK_AND_REORDER + REVEAL_PICK_HAND_SHUFFLE_BOTTOM）の pick 記述子 ----
// タスク12(xlvi)(h)。融合規則は revealCount/pickCount/行き先しか運ばず **filter を一切運ばない**ため、
// 「その中から＜美巧＞のシグニ１枚を…」が **どのカードでも拾える過剰実行** に退化していた。
// ここで「その中から」直後の名詞句を全消費でトークン走査し、忠実表現できる形だけ filter を返す。
// ⚠未知の修飾語が1つでも残ったら null（＝従来どおり filter 無し）。部分解釈は「＜天使＞ではない」等の
//   否定修飾を取りこぼして**意味を反転**させるため、絞り込みを増やすより取りこぼす方に倒す。
export interface RevealPickDescriptor {
  filter: TargetFilter;
  pickCount: number | 'ALL';
  pickUpTo: boolean;
  noun: 'シグニ' | 'スペル' | 'カード';
  dest: 'hand' | 'energy' | 'field' | 'hand_or_energy';
}

// 記述子の先頭から1トークンずつ食べる規則表。全消費できなければ呼び出し側で null 扱い。
const REVEAL_PICK_DESC_RULES: { re: RegExp; apply: (m: RegExpMatchArray, acc: { filter: TargetFilter; classes: string[]; colors: string[] }) => boolean }[] = [
  { re: /^＜([^＞]+)＞の?/, apply: (m, a) => { a.classes.push(m[1]); return true; } },
  { re: /^([白赤青緑黒])の?/, apply: (m, a) => { a.colors.push(m[1]); return true; } },
  { re: /^レベル[０-９\d]+(?:以上|以下)?の?/, apply: (m, a) => { Object.assign(a.filter, parseLevelFilter(m[0])); return true; } },
  { re: /^カード名に《([^》]+)》を含む/, apply: (m, a) => { a.filter.cardName = m[1]; return true; } },
  { re: /^《アクセアイコン》を持つ/, apply: (_m, a) => { a.filter.hasIcon = 'アクセ'; return true; } },
  { re: /^《クロスアイコン》を持つ/, apply: (_m, a) => { a.filter.hasCrossIcon = true; return true; } },
  { re: /^《ライズアイコン》を持たない/, apply: (_m, a) => { a.filter.noRiseIcon = true; return true; } },
  { re: /^《ライズアイコン》を持つ/, apply: (_m, a) => { a.filter.hasRiseIcon = true; return true; } },
  { re: /^《ガードアイコン》を持たない/, apply: (_m, a) => { a.filter.noGuard = true; return true; } },
  { re: /^《ディソナアイコン》(?:を持つ|の)?/, apply: (_m, a) => { a.filter.isDisona = true; return true; } },
  { re: /^【ライフバースト】を持つ/, apply: (_m, a) => { a.filter.hasLifeBurst = true; return true; } },
  // ルリグ色参照（タスク12(xlvi)(a)）。「持たない」を「持つ」より先に置く必要はない（末尾が別語）が、
  // **センター／場全体／センター以外**の3種を取り違えると候補集合が丸ごとずれるので独立トークンで持つ。
  { re: /^(?:あなたの)?センタールリグと共通する色を持たない/, apply: (_m, a) => { a.filter.colorNotMatchesLrig = true; return true; } },
  { re: /^(?:あなたの)?センタールリグと共通する色を持つ/, apply: (_m, a) => { a.filter.colorMatchesLrig = true; return true; } },
  { re: /^センタールリグではない(?:あなたの)?いずれかのルリグと共通する色を持つ/, apply: (_m, a) => { a.filter.colorMatchesNonCenterLrig = true; return true; } },
  { re: /^(?:あなたの)?場に(?:いる|ある)ルリグと共通する色を持つ/, apply: (_m, a) => { a.filter.colorMatchesAnyLrig = true; return true; } },
  { re: /^共通する色を持たない/, apply: (_m, a) => { a.filter.eachDistinctColor = true; return true; } },
  { re: /^それぞれレベルの異なる/, apply: (_m, a) => { a.filter.eachDistinctLevel = true; return true; } },
  // 宣言参照（タスク12(xlvi)(c)）。⚠具体形（数字／クラス）を裸の「宣言した」より**前**に置く
  // （`.find` の先着優先なので順序を入れ替えると「宣言した数字と同じレベルを持つ」が名前一致に化ける）。
  { re: /^宣言した数字と同じレベルを持つ/, apply: (_m, a) => { a.filter.levelEqDeclaredNumber = true; return true; } },
  { re: /^宣言したクラスを持つ/, apply: (_m, a) => { a.filter.classEqDeclaredClass = true; return true; } },
  { re: /^宣言した(?=カード|シグニ|スペル|$)/, apply: (_m, a) => { a.filter.nameEqDeclaredName = true; return true; } },
];

function nounCardType(noun: string): Partial<TargetFilter> {
  return noun === 'シグニ' ? { cardType: 'シグニ' } : noun === 'スペル' ? { cardType: 'スペル' } : {};
}

/** pick 名詞句（「＜原子＞の」＋「シグニ」等）→ TargetFilter。未知の修飾語が残れば null（部分解釈しない）。 */
export function parsePickNounPhraseFilter(desc: string, noun: string): TargetFilter | null {
  return revealPickDescFilter(desc, noun);
}

function revealPickDescFilter(desc: string, noun: string): TargetFilter | null {
  const acc = { filter: {} as TargetFilter, classes: [] as string[], colors: [] as string[] };
  let rest = desc;
  while (rest.length > 0) {
    const rule = REVEAL_PICK_DESC_RULES.find(r => r.re.test(rest));
    if (!rule) return null;
    const m = rest.match(rule.re)!;
    if (!rule.apply(m, acc)) return null;
    rest = rest.slice(m[0].length);
  }
  // 複数クラス／複数色の並列（「＜天使＞と＜悪魔＞の」）は AND か OR か記述子だけでは決まらない＝受けない。
  if (acc.classes.length > 1 || acc.colors.length > 1) return null;
  return {
    ...acc.filter,
    ...(acc.classes.length === 1 ? { story: acc.classes[0] } : {}),
    ...(acc.colors.length === 1 ? { color: acc.colors[0] } : {}),
    ...nounCardType(noun),
  };
}

/**
 * 「その中から好きな枚数を（好きな順番で）デッキの一番◯に置き、残りを（好きな順番で）デッキの一番●に置く」
 * ＝**プレイヤーが上下の振り分けを選ぶ**形か（G168 の `destination.position:'split_top_bottom'`）。
 * ⚠上下が同じ語（両方「一番下」等）は分割ではないので受けない。
 * 従来この文型は「一番下」を含むだけで `position:'bottom'` に潰れ、**見た全部がデッキの一番下へ送られる**
 * （＝良い札を上に残せる原文の意味が消える）過小実行になっていた。G168 で機構は入っていたが
 * 手書き MANUAL の WX13-081/082 だけが使っており、parser 側の規則が無かった（タスク12(xlvi)(d)）。
 */
export function isSplitTopBottomReorder(t: string): boolean {
  const m = t.match(/その中から好きな枚数の?(?:カード)?を(?:好きな順番で)?デッキの一番(上|下)に(?:置き|戻し)、残りを(?:好きな順番で)?デッキの一番(上|下)に(?:置く|戻す)/);
  return !!m && m[1] !== m[2];
}

/**
 * 「（あなたの）デッキの上からカードをN枚公開し（見て）、その中から〜」＝**1文に畳まれた** look-pick か。
 * 文が分かれている形は effectParser の LOOK_AND_REORDER + STUB 融合が拾うが、読点で1文になった形は
 * 上流の汎用「デッキ上公開/見る」規則・「デッキ上→エナ」規則が先取りして **pick が丸ごと落ちる**
 * （WX13-054＝「宣言したカードだけエナへ」が「デッキ上4枚を全部エナへ」に化けていた。タスク12(xlvi)(c)）。
 * ⚠pick 記述子が忠実に解けるときだけ true＝解けない形は従来経路のまま（取りこぼしを増やさない）。
 * 返り値が true の文は parseSentencePart4 の combined 規則が REVEAL_AND_PICK として受ける。
 */
export function fusedLookPickSentence(t: string): { revealCount: number; pick: string; desc: RevealPickDescriptor } | null {
  const m = t.match(/^(?:あなたの)?デッキの上からカードを([０-９\d]+)枚(?:公開し|見て)、(その中から.+)$/);
  if (!m) return null;
  const desc = parseRevealPickDescriptor(m[2]);
  return desc ? { revealCount: parseNum(m[1]), pick: m[2], desc } : null;
}

export function parseRevealPickDescriptor(t: string): RevealPickDescriptor | null {
  // 記述子に「枚」を含めない＝「＜原子＞のシグニ１枚とスペル１枚を」のような複数グループ形で
  // 後半だけを拾ってしまうのを防ぐ（複数グループは LOOK_PICK_CHAIN の担当）。
  // 枚数トークン＝「N枚」は必ず「枚」を伴うが、「すべて」「好きな枚数」はそれ自体が枚数語なので「枚」を任意にする
  // （「宣言したカードをすべてエナゾーンに置く」WX13-054／「好きな枚数公開し手札に加えて…」WX24-P1-035）。
  // 名詞の直後の読点（「シグニを、好きな枚数…」）も許容する。
  const m = t.match(/その中から([^、。枚]*?)(シグニ|スペル|カード)を?、?(?:([０-９\d]+)枚|(すべて|好きな枚数)枚?)(まで)?を?(?:選び、それぞれ)?(?:公開し)?((?:手札に加え|エナゾーンに置|場に出)[^、。]*)/);
  if (!m || m.index === undefined) return null;
  // 後続にもう1つ pick 群がある形（「…を１枚までエナゾーンに置き、…を１枚まで手札に加え」）は
  // 単一 filter へ潰すと後段が丸ごと消える＝この規則では受けない。
  const tail = t.slice(m.index + m[0].length);
  if (/[０-９\d]+枚(?:まで)?を?(?:公開し)?(?:手札に加え|エナゾーンに置|場に出|トラッシュに置)/.test(tail)) return null;

  const desc = m[1];
  const noun = m[2] as 'シグニ' | 'スペル' | 'カード';
  // ＜＞《》【】の内側を除いた「か」があれば OR 記述子（「青か黒のスペル」）として解く。
  const bare = desc.replace(/＜[^＞]*＞|《[^》]*》|【[^】]*】/g, '');
  let filter: TargetFilter | null;
  let outNoun = noun;
  if (bare.includes('か')) {
    const or = parseOrPickDescriptor(desc + noun);
    if (!or) return null;
    filter = or.filter;
    outNoun = or.noun;
  } else {
    filter = revealPickDescFilter(desc, noun);
  }
  if (!filter) return null;

  const pickCount: number | 'ALL' = m[4] ? 'ALL' : parseNum(m[3]);
  const destPhrase = m[6];
  const toHand = destPhrase.includes('手札に加え');
  const toEnergy = destPhrase.includes('エナゾーンに置');
  const toField = destPhrase.includes('場に出');
  const dest: RevealPickDescriptor['dest'] = toHand && toEnergy ? 'hand_or_energy' : toField ? 'field' : toEnergy ? 'energy' : 'hand';
  return { filter, pickCount, pickUpTo: m[5] === 'まで' || m[4] === '好きな枚数', noun: outNoun, dest };
}
