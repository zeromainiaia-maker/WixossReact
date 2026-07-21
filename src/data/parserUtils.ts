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

// REVEAL_PICK_HAND_SHUFFLE_BOTTOM STUBのメタデータを抽出して返す
export function makeRevealPickStub(t: string): StubAction {
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
  if (t.match(/残り.*トラッシュ|トラッシュに置く$|トラッシュに置いてもよい$/)) restDest = 'trash';
  else if (t.match(/残り.*エナゾーン|エナゾーンに置く$/)) restDest = 'energy';
  const then: 'hand' | 'energy' =
    (t.match(/エナゾーンに置く/) && !t.match(/手札に加え/)) ? 'energy' : 'hand';
  return { type: 'STUB', id: 'REVEAL_PICK_HAND_SHUFFLE_BOTTOM', revealPickParams: { pickCount, restDest, then } } as StubAction;
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

// 「(あなたの)センタールリグと共通する色を持つ〔シグニ/スペル/カード〕」＝colorMatchesLrig（engine が動的解決）。
// 名詞句修飾形に限定（全文スキャン禁止の教訓・parser_backlog）。SEARCH/REVEAL/ADD_TO_FIELD/TRANSFER_TO_HAND の各 handler で共用。
const LRIG_COLOR_RE = /センタールリグと共通する色を持つ(?:それぞれレベルの異なる)?(?:＜[^＞]+＞の)?(?:レベル[０-９\d＋以下上]+の)?(?:すべての)?(?:シグニ|スペル|カード)/;
export function parseColorMatchesLrig(text: string): Partial<TargetFilter> {
  return LRIG_COLOR_RE.test(text) ? { colorMatchesLrig: true } : {};
}

// 《ガードアイコン》を持つ → hasGuard ／ 持たない → noGuard（G237）。名詞句スパンに対して呼ぶこと。
export function parseGuardFilter(text: string): Partial<TargetFilter> {
  if (/《ガードアイコン》を持たない/.test(text)) return { noGuard: true };
  if (/《ガードアイコン》を持つ/.test(text)) return { hasGuard: true };
  return {};
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
export function parseTriggerComparison(text: string, opts?: { allowPlacement?: boolean }): Partial<TargetFilter> {
  if (/その後/.test(text)) return {}; // lastProcessed（「その後、そのシグニ」）は別機構
  // 「そのシグニのパワー以下の」＝トリガー元パワー以下（「より低い」と別語形の Lte 形。WXEX1-42/WXEX1-53/WDK12-001）。
  // 「そうした場合、そのシグニのパワー以下」＝直前アクション結果（lastProcessed・WD04-018）は除外。
  if (/そのシグニのパワー以下の/.test(text) && !/そうした場合/.test(text)) return { powerLteTrigger: true };
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
  if (text.includes('感染状態')) filter.infected = true;
  if (text.includes('アクセされている') || text.match(/アクセされて(?:いる|いた)/)) filter.hasAcce = true;
  if (/【チャーム】が付いている/.test(text)) filter.hasCharm = true; // 「【チャーム】が付いている対戦相手のシグニ」（G153）
  if (text.includes('アップ状態')) filter.isUp = true;
  if (text.includes('ダウン状態') && !text.includes('ダウン状態で場に出')) filter.isDown = true;
  if (text.includes('凍結状態')) filter.isFrozen = true;
  // 「あなたの他の（＜X＞の）シグニ」= 効果元シグニ自身を対象から除外（execTrash等が filter.excludeSelf を尊重）
  if (/他の[^。、]*シグニ/.test(text)) filter.excludeSelf = true;
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
