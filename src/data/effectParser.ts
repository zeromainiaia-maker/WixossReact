import type { CardData } from '../types';
import { mergeManualEffects } from './manualEffects';
import type {
  CardEffect,
  EffectType,
  EffectTiming,
  EffectCost,
  EnergyCost,
  EffectAction,
  EffectTarget,
  EffectDuration,
  ActiveCondition,
  TargetFilter,
  Owner,
  CompareOp,
  SequenceAction,
  ChooseAction,
  UnknownAction,
  TransferToDeckAction,
  CounterSpellAction,
  CostReductionAction,
  GrantProtectionAction,
  GrantKeywordAction,
  AttachCharmAction,
  RevealAndPickAction,
  BanishRedirectAction,
  RearrangeSigniAction,
  GrowFreeAction,
  RemoveAbilitiesAction,
  PlayFreeAction,
  CostIncreaseAction,
  PowerModifyPerStackAction,
  PowerModifyPerFieldAction,
  PowerModifyPerLevelSumAction,
  CharmProtectionAction,
  MutualDiscardAndDrawAction,
  BlockActionAction,
  EnergyChargeAction,
  PowerModifyByTargetLevelAction,
  PowerMultiplyAction,
  LevelModifyAction,
  PowerModifyPerCharmAction,
  PowerModifyPerEnergyAction,
  PreventDamageAction,
  EqualizeEnergyAction,
  VariableDiscardAndDrawAction,
  BanishSubstituteAction,
  StackSpellAction,
  ColorInheritAction,
  ConditionalDiscardAction,
  EnergyChargeByFieldCountAction,
  LookAtDeckAndLifeAction,
  GrowCostReductionAction,
  NameBanAction,
  PlayFreeFromTrashAction,
  PowerThresholdTrashAction,
  PowerFlipAction,
  SelfTrashPreventAction,
  CostSubstituteAction,
  PowerModifyPerTrashedLevelAction,
  RemoveCharmAction,
  ForceSigniAttackAction,
  GrantLrigAbilityAction,
  PowerModifyPerTrashCountAction,
  PowerModifyPerLifeCountAction,
  PowerModifyPerLrigLevelAction,
  PlaceVirusAction,
  AttachAcceAction,
  BloodCrystalArmorAction,
  PowerModifyPerVirusCountAction,
  LrigLimitModifyAction,
  FreezeAction,
  LookAndReorderAction,
  AddCraftToLrigDeckAction,
  DrawPerFieldCountAction,
  AwakenSigniAction,
  NegateAttackAction,
  PlaceUnderSigniAction,
  PreventNextDamageAction,
  TakeFromUnderSigniAction,
  StubAction,
  PowerModifyAction,
  BanishAction,
  Condition,
} from '../types/effects';

// costColors から実際の色名だけを抽出（カード名を除外、《赤×2》→["赤","赤"]に展開）
function extractCostColors(text: string): string[] {
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
function makeRevealPickStub(t: string): StubAction {
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

// ===== 数値ユーティリティ =====

const FW_DIGIT: Record<string, string> = {
  '０':'0','１':'1','２':'2','３':'3','４':'4',
  '５':'5','６':'6','７':'7','８':'8','９':'9',
};
function toHalf(s: string): string {
  return s.replace(/[０-９]/g, c => FW_DIGIT[c] ?? c);
}
// ルール補足テキスト（全角括弧）を除去（入れ子対応：内側から順に除去）
function stripRuleParens(s: string): string {
  let result = s;
  let prev: string;
  do {
    prev = result;
    result = result.replace(/（[^（）]*）/g, '');
  } while (result !== prev);
  return result.trim();
}
// ===== 使用条件パース =====

function parseUseCondition(text: string): Condition {
  const n = (s: string) => parseInt(toHalf(s), 10);
  const op = (s: string): import('../types/effects').CompareOp => s === '以上' ? 'gte' : s === '以下' ? 'lte' : 'eq';

  // クロス状態（未実装メカニクス → COND_STUB で常に許可）
  if (text.match(/クロス状態/)) return { type: 'COND_STUB', raw: text };

  // 対戦相手のセンタールリグがレベルX以上/以下
  let m = text.match(/対戦相手のセンタールリグがレベル([０-９\d]+)(以上|以下)/);
  if (m) return { type: 'LRIG_LEVEL', owner: 'opponent', operator: op(m[2]), value: n(m[1]) };

  // あなたのセンタールリグがレベルX以上/以下
  m = text.match(/あなたのセンタールリグがレベル([０-９\d]+)(以上|以下)/);
  if (m) return { type: 'LRIG_LEVEL', owner: 'self', operator: op(m[2]), value: n(m[1]) };

  // あなたのセンタールリグが＜X＞
  m = text.match(/あなたのセンタールリグが＜([^＞]+)＞/);
  if (m) return { type: 'LRIG_STORY', owner: 'self', story: m[1] };

  // 対戦相手の手札がX枚
  m = text.match(/対戦相手の手札が([０-９\d]+)枚/);
  if (m) return { type: 'HAND_COUNT', owner: 'opponent', operator: 'eq', value: n(m[1]) };

  // あなたの手札がX枚
  m = text.match(/あなたの手札が([０-９\d]+)枚/);
  if (m) return { type: 'HAND_COUNT', owner: 'self', operator: 'eq', value: n(m[1]) };

  // 対戦相手のエナゾーンにカードがX枚以上/以下
  m = text.match(/対戦相手のエナゾーンに(?:ある)?カードが([０-９\d]+)枚(以上|以下)/);
  if (m) return { type: 'ENERGY_COUNT', owner: 'opponent', operator: op(m[2]), value: n(m[1]) };

  // あなたのライフクロスが対戦相手より少ない
  if (text.match(/あなたのライフクロスが対戦相手より少ない/))
    return { type: 'LIFE_COMPARE_OPP', operator: 'lt' };

  // あなたのライフクロスがX枚
  m = text.match(/あなたのライフクロスが([０-９\d]+)枚/);
  if (m) return { type: 'LIFE_COUNT', owner: 'self', operator: 'eq', value: n(m[1]) };

  // このシグニが中央のシグニゾーンにある
  if (text.match(/このシグニが中央のシグニゾーンにある/))
    return { type: 'THIS_CARD_IN_CENTER_ZONE' };

  // このシグニがダウン状態
  if (text.match(/このシグニがダウン状態/))
    return { type: 'THIS_CARD_IS_DOWN' };

  // このカード/シグニ/スペルがトラッシュにある
  if (text.match(/この(?:カード|シグニ|スペル)がトラッシュにある/))
    return { type: 'THIS_CARD_IN_LOCATION', location: 'trash' };

  // このスペルがエナゾーンにある
  if (text.match(/このスペルがエナゾーンにある/))
    return { type: 'THIS_CARD_IN_LOCATION', location: 'energy' };

  // あなたのトラッシュにカード名に《X》を含むカードがある
  m = text.match(/あなたのトラッシュにカード名に《([^》]+)》を含むカードがある/);
  if (m) return { type: 'TRASH_HAS_CARD', owner: 'self', filter: { cardName: m[1] } };

  // あなたの場にカード名に《X》を含むシグニがある
  m = text.match(/あなたの場にカード名に《([^》]+)》を含むシグニがある/);
  if (m) return { type: 'HAS_CARD_IN_FIELD', owner: 'self', filter: { cardType: 'シグニ', cardName: m[1] } };

  // あなたの場に他の＜X＞のシグニがある
  m = text.match(/あなたの場に他の＜([^＞]+)＞のシグニがある/);
  if (m) return { type: 'HAS_CARD_IN_FIELD', owner: 'self', filter: { cardType: 'シグニ', story: m[1] }, excludeSelf: true };

  // あなたの場に＜X＞のシグニがある
  m = text.match(/あなたの場に＜([^＞]+)＞のシグニがある/);
  if (m) return { type: 'HAS_CARD_IN_FIELD', owner: 'self', filter: { cardType: 'シグニ', story: m[1] } };

  // 対戦相手の場にレベルX以上のシグニがある
  m = text.match(/対戦相手の場にレベル([０-９\d]+)以上のシグニがある/);
  if (m) return { type: 'HAS_CARD_IN_FIELD', owner: 'opponent', filter: { cardType: 'シグニ', levelRange: { min: n(m[1]) } } };

  // あなたの場にパワーX以上のシグニがある
  m = text.match(/あなたの場にパワー([０-９\d]+)以上のシグニがある/);
  if (m) return { type: 'HAS_CARD_IN_FIELD', owner: 'self', filter: { cardType: 'シグニ', powerRange: { min: n(m[1]) } } };

  // このシグニのパワーがX以上
  m = text.match(/このシグニのパワーが([０-９\d]+)以上/);
  if (m) return { type: 'SELF_POWER_GTE', value: n(m[1]) };

  // あなたの場にシグニがない
  if (text.match(/あなたの場にシグニがない/))
    return { type: 'FIELD_COUNT', owner: 'self', operator: 'eq', value: 0 };

  // あなたの場にアクセされているシグニがある
  if (text.match(/あなたの場にアクセされているシグニがある/))
    return { type: 'HAS_CARD_IN_FIELD', owner: 'self', filter: { cardType: 'シグニ', hasAcce: true } };

  // あなたの場に《X》がいる（特定カード名）
  m = text.match(/あなたの場に《([^》]+)》が(?:いる|ある)/);
  if (m) return { type: 'HAS_CARD_IN_FIELD', owner: 'self', filter: { cardName: m[1] } };

  // 対戦相手のシグニ１体がアタックした（タイミング制限）
  if (text.match(/対戦相手のシグニ.*がアタックした/))
    return { type: 'DURING_PHASE', phases: ['ATTACK_SIGNI_OP'] };

  // AND条件（〜にあり〜）
  m = text.match(/^この(?:カード|シグニ)がトラッシュにあり(.+)$/);
  if (m) {
    const cond2 = parseUseCondition(m[1]);
    return { type: 'AND', conditions: [{ type: 'THIS_CARD_IN_LOCATION', location: 'trash' }, cond2] };
  }

  // 《ライズアイコン》その他未対応
  return { type: 'COND_STUB', raw: text };
}

// 効果テキストから「この能力は〜にしか使用できない」を抽出し、残りのテキストと条件を返す
function extractUseCondition(text: string): { cleaned: string; condition?: Condition } {
  const RESTRICT_SUFFIX = '(?:場合(?:に)?しか使用できない|ときにしか使用できない|場合(?:に)?しか発動しない|ときにしか発動しない)';
  const marker = new RegExp(`この(?:能力|カード|シグニ|スペル)は(.+?)${RESTRICT_SUFFIX}`);

  // 末尾パターン：「…。この能力は〜できない。」
  const endM = text.match(new RegExp(`^([\\s\\S]+?)。この(?:能力|カード|シグニ|スペル)は(.+?)${RESTRICT_SUFFIX}。?$`));
  if (endM) {
    return { cleaned: endM[1].trim(), condition: parseUseCondition(endM[2].trim()) };
  }

  // 先頭パターン：「このカードは〜できない。…」（スペル/アーツ全体への条件）
  const startM = text.match(new RegExp(`^この(?:カード|スペル|アーツ)は(.+?)${RESTRICT_SUFFIX}。([\\s\\S]+)$`));
  if (startM) {
    return { cleaned: startM[2].trim(), condition: parseUseCondition(startM[1].trim()) };
  }

  // 全体が条件文（単独で現れる場合）
  const wholeM = text.match(marker);
  if (wholeM && wholeM[0] === text.replace(/。$/, '').trim()) {
    return { cleaned: '', condition: parseUseCondition(wholeM[1].trim()) };
  }

  return { cleaned: text };
}

function parseNum(s: string): number {
  return parseInt(toHalf(s), 10);
}

// ===== コストパース =====

const ENERGY_COLORS = new Set(['白', '赤', '青', '緑', '黒', '無']);

function parseEnergyCosts(str: string): EnergyCost[] {
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
      }
    }
  }
  return costs;
}

function parseCost(costStr: string): EffectCost | undefined {
  if (!costStr || costStr === '-') return undefined;
  const cost: EffectCost = {};
  const energy = parseEnergyCosts(costStr);
  if (energy.length > 0) cost.energy = energy;
  if (costStr.includes('《ダウン》')) cost.down_self = true;
  const dm = costStr.match(/手札を([０-９\d]+)枚捨てる/);
  if (dm) cost.discard = parseNum(dm[1]);
  const em = costStr.match(/エクシード([０-９\d]+)/);
  if (em) cost.exceed = parseNum(em[1]);
  return Object.keys(cost).length > 0 ? cost : undefined;
}

// ===== タイミングパース（アーツ用）=====

function parseArtsTiming(timingStr: string): EffectTiming[] {
  const t: EffectTiming[] = [];
  if (timingStr.includes('メインフェイズ')) t.push('MAIN');
  if (timingStr.includes('アタックフェイズ')) t.push('ATTACK');
  if (timingStr.includes('スペルカットイン')) t.push('SPELL_CUTIN');
  return t.length > 0 ? t : ['MAIN'];
}

// ===== ターゲットフィルタパース =====

function parsePowerFilter(text: string): Partial<TargetFilter> {
  const above = text.match(/パワー([０-９\d]+)以上/);
  const below = text.match(/パワー([０-９\d]+)以下/);
  if (above || below) {
    return { powerRange: { min: above ? parseNum(above[1]) : undefined, max: below ? parseNum(below[1]) : undefined } };
  }
  return {};
}

function parseLevelFilter(text: string): Partial<TargetFilter> {
  const above = text.match(/レベル([０-９\d]+)以上/);
  const below = text.match(/レベル([０-９\d]+)以下/);
  const exact = text.match(/レベル([０-９\d]+)の/);
  if (above || below) {
    return { level: { min: above ? parseNum(above[1]) : undefined, max: below ? parseNum(below[1]) : undefined } };
  }
  if (exact) return { level: parseNum(exact[1]) };
  return {};
}

function parseColorFilter(text: string): Partial<TargetFilter> {
  for (const c of ['白', '赤', '青', '緑', '黒']) {
    if (text.includes(`${c}の`)) return { color: c };
  }
  return {};
}

function parseCardTypeFilter(text: string): Partial<TargetFilter> {
  if (text.includes('シグニ')) return { cardType: 'シグニ' };
  if (text.includes('スペル')) return { cardType: 'スペル' };
  if (text.includes('アーツ')) return { cardType: 'アーツ' };
  if (text.includes('ルリグ')) return { cardType: 'ルリグ' };
  return {};
}

// ＜クラス名＞ を配列で抽出（例: ＜鉱石＞か＜宝石＞ → ['鉱石','宝石']）
function parseStoryFilter(text: string): Partial<TargetFilter> {
  const matches = [...text.matchAll(/＜([^＞]+)＞/g)].map(m => m[1]);
  if (matches.length === 0) return {};
  return { story: matches.length === 1 ? matches[0] : matches };
}

// ===== シグニターゲットパース =====

function parseSigniTarget(text: string, owner: Owner): EffectTarget {
  const all = text.includes('すべてのシグニ') || text.includes('全てのシグニ');
  const upToM = text.match(/シグニ([０-９\d]+)体まで/);
  const countM = text.match(/シグニ([０-９\d]+)体/);
  const count = all ? 'ALL' : (upToM ? parseNum(upToM[1]) : (countM ? parseNum(countM[1]) : 1));
  const filter: TargetFilter = {
    cardType: 'シグニ',
    ...parsePowerFilter(text),
    ...parseLevelFilter(text),
    ...parseColorFilter(text),
  };
  if (text.includes('感染状態')) filter.infected = true;
  if (text.includes('アクセされている') || text.match(/アクセされて(?:いる|いた)/)) filter.hasAcce = true;
  if (text.includes('アップ状態')) filter.isUp = true;
  if (text.includes('ダウン状態') && !text.includes('ダウン状態で場に出')) filter.isDown = true;
  if (text.includes('凍結状態')) filter.isFrozen = true;
  return { type: 'SIGNI', owner, count, filter, upToCount: !!upToM };
}

// ===== CONTINUOUS activeCondition パース =====

type ConditionParseResult = {
  condition: ActiveCondition | undefined;
  rest: string;
  conditionFound: boolean; // true=条件文が見つかったがパース成功かどうかはconditionで判断
  isTimingMarker?: boolean; // true=条件ではなくタイミング/期間マーカー（anyFailed対象外）
};

function parseActiveCondition(text: string): ConditionParseResult {
  // パターン0: 「このターン、」（ターン終了時まで適用される常時効果）
  if (text.startsWith('このターン、')) {
    return { condition: undefined, rest: text.slice('このターン、'.length), conditionFound: true, isTimingMarker: true };
  }

  // パターン0b: 「ターン終了時まで、」（常時効果の持続期間指定）
  if (text.startsWith('ターン終了時まで、')) {
    return { condition: undefined, rest: text.slice('ターン終了時まで、'.length), conditionFound: true, isTimingMarker: true };
  }

  // パターン1: 「対戦相手のターンの間、」「あなたのターンの間、」
  const turnM = text.match(/^(対戦相手|あなた)のターンの間、/);
  if (turnM) {
    return {
      condition: { type: 'TURN_OWNER', owner: turnM[1] === '対戦相手' ? 'opponent' : 'self' },
      rest: text.slice(turnM[0].length),
      conditionFound: true,
    };
  }

  // パターン2: 「あなたの場に《カード名》/＜カード名＞があるかぎり、」
  const fieldNameM = text.match(/^あなたの場に(《[^》]+》|＜[^＞]+＞)があるかぎり、/);
  if (fieldNameM) {
    const nameM = fieldNameM[1].match(/[《＜]([^》＞]+)[》＞]/);
    return {
      condition: { type: 'HAS_CARD_IN_FIELD', owner: 'self', filter: { cardName: nameM?.[1] } },
      rest: text.slice(fieldNameM[0].length),
      conditionFound: true,
    };
  }

  // パターン2b: 「あなたの場に《カード名》/＜カード名＞があり、」（複合条件の前半）
  const fieldNameAndM = text.match(/^あなたの場に(《[^》]+》|＜[^＞]+＞)があり、/);
  if (fieldNameAndM) {
    const nameM = fieldNameAndM[1].match(/[《＜]([^》＞]+)[》＞]/);
    return {
      condition: { type: 'HAS_CARD_IN_FIELD', owner: 'self', filter: { cardName: nameM?.[1] } },
      rest: text.slice(fieldNameAndM[0].length),
      conditionFound: true,
    };
  }

  // パターン2c: 「あなたの場に他の＜X＞(か＜Y＞)*のシグニがあるかぎり、」（自身を除く同ストーリー）
  const fieldOtherStoryM = text.match(/^あなたの場に他の((?:＜[^＞]+＞(?:か)?)+)のシグニがあるかぎり、/);
  if (fieldOtherStoryM) {
    const storyFilter = parseStoryFilter(fieldOtherStoryM[1]);
    return {
      condition: { type: 'HAS_CARD_IN_FIELD', owner: 'self', filter: { cardType: 'シグニ', ...storyFilter }, excludeSelf: true },
      rest: text.slice(fieldOtherStoryM[0].length),
      conditionFound: true,
    };
  }

  // パターン2d: 「あなたの場に他の《X》のシグニがあるかぎり、」（アイコン条件）
  const fieldOtherIconM = text.match(/^あなたの場に他の《([^》]+)》のシグニがあるかぎり、/);
  if (fieldOtherIconM) {
    return {
      condition: { type: 'HAS_CARD_IN_FIELD', owner: 'self', filter: { cardType: 'シグニ' }, excludeSelf: true },
      rest: text.slice(fieldOtherIconM[0].length),
      conditionFound: true,
    };
  }

  // パターン3a: 「あなたの場にレゾナがあるかぎり、」
  if (text.startsWith('あなたの場にレゾナがあるかぎり、')) {
    return { condition: { type: 'HAS_CARD_IN_FIELD', owner: 'self', filter: { cardType: 'レゾナ' } }, rest: text.slice('あなたの場にレゾナがあるかぎり、'.length), conditionFound: true };
  }

  // パターン3b: 「あなたの場に〜クラスのシグニがN体あるかぎり、」（クラス数体条件）
  const fieldClassCountM = text.match(/^あなたの場に(?:他の)?((?:＜[^＞]+＞(?:か)?)+)のシグニが([０-９\d]+)体あるかぎり、/);
  if (fieldClassCountM) {
    const storyFilter = parseStoryFilter(fieldClassCountM[1]);
    return {
      condition: { type: 'HAS_CARD_IN_FIELD', owner: 'self', filter: { cardType: 'シグニ', ...storyFilter } },
      rest: text.slice(fieldClassCountM[0].length),
      conditionFound: true,
    };
  }

  // パターン3: 「あなたの場に〜があるかぎり、」（カード名特定不可→conditionはundefined）
  const fieldGenM = text.match(/^あなたの場に.+があるかぎり、/);
  if (fieldGenM) {
    return { condition: undefined, rest: text.slice(fieldGenM[0].length), conditionFound: true };
  }

  // パターン4: 「あなたのトラッシュにカードがN枚以上あるかぎり、」
  const trashM = text.match(/^あなたのトラッシュにカードが([０-９\d]+)枚以上あるかぎり、/);
  if (trashM) {
    return {
      condition: { type: 'COUNT_THRESHOLD', location: 'trash', owner: 'self', operator: 'gte', value: parseNum(trashM[1]) },
      rest: text.slice(trashM[0].length),
      conditionFound: true,
    };
  }

  // パターン4b: 「あなたのトラッシュに〜があるかぎり、」（スペル等）
  const trashGenM = text.match(/^あなたのトラッシュに.+があるかぎり、/);
  if (trashGenM) {
    return { condition: undefined, rest: text.slice(trashGenM[0].length), conditionFound: true };
  }

  // パターン5: 「あなたのエナゾーンにカードがN枚以上あるかぎり、」
  const enaM = text.match(/^あなたのエナゾーンにカードが([０-９\d]+)枚以上あるかぎり、/);
  if (enaM) {
    return {
      condition: { type: 'COUNT_THRESHOLD', location: 'energy', owner: 'self', operator: 'gte', value: parseNum(enaM[1]) },
      rest: text.slice(enaM[0].length),
      conditionFound: true,
    };
  }

  // パターン5b: 「あなたのエナゾーンにあるカードが対戦相手よりN枚以上多いかぎり、」
  const enaDiffM = text.match(/^あなたのエナゾーンにあるカードが対戦相手より([０-９\d]+)枚以上多いかぎり、/);
  if (enaDiffM) {
    return { condition: undefined, rest: text.slice(enaDiffM[0].length), conditionFound: true };
  }

  // パターン5c: 「あなたの手札がN枚以上/以下あるかぎり、」（「以上あるかぎり」も含む）
  const handCountM = text.match(/^あなたの手札が([０-９\d]+)枚(以上あるかぎり|以下あるかぎり|以上かぎり|以下かぎり|あるかぎり)、/);
  if (handCountM) {
    const val = parseNum(handCountM[1]);
    const op: CompareOp = handCountM[2].startsWith('以上') ? 'gte' : handCountM[2].startsWith('以下') ? 'lte' : 'eq';
    return { condition: { type: 'COUNT_THRESHOLD', location: 'hand', owner: 'self', operator: op, value: val }, rest: text.slice(handCountM[0].length), conditionFound: true };
  }

  // パターン5d: 「対戦相手の手札がN枚以上/以下であるかぎり、」
  const oppHandM = text.match(/^対戦相手の手札が([０-９\d]+)枚(以上|以下)(?:であるかぎり|かぎり)、/);
  if (oppHandM) {
    const val = parseNum(oppHandM[1]);
    const op: CompareOp = oppHandM[2] === '以上' ? 'gte' : 'lte';
    return { condition: { type: 'COUNT_THRESHOLD', location: 'hand', owner: 'opponent', operator: op, value: val }, rest: text.slice(oppHandM[0].length), conditionFound: true };
  }

  // パターン5e: 「あなたのセンタールリグがレベルN以上であるかぎり、」
  const centerLrigLevelM = text.match(/^あなたのセンタールリグがレベル([０-９\d]+)以上(?:であるかぎり|かぎり)、/);
  if (centerLrigLevelM) {
    const val = parseNum(centerLrigLevelM[1]);
    return { condition: { type: 'COUNT_THRESHOLD', location: 'lrig_deck', owner: 'self', operator: 'gte', value: val }, rest: text.slice(centerLrigLevelM[0].length), conditionFound: true };
  }
  const handZeroM = text.match(/^あなたの手札が０枚であるかぎり、/);
  if (handZeroM) {
    return { condition: { type: 'COUNT_THRESHOLD', location: 'hand', owner: 'self', operator: 'eq', value: 0 }, rest: text.slice(handZeroM[0].length), conditionFound: true };
  }
  const handGenM = text.match(/^あなたの手札が.+かぎり、/);
  if (handGenM) {
    return { condition: undefined, rest: text.slice(handGenM[0].length), conditionFound: true };
  }

  // パターン6: 「このシグニのパワーがN以上であるかぎり、」
  const selfPowerM = text.match(/^このシグニのパワーが([０-９\d]+)以上であるかぎり、/);
  if (selfPowerM) {
    return {
      condition: { type: 'SELF_POWER_THRESHOLD', operator: 'gte', value: parseNum(selfPowerM[1]) },
      rest: text.slice(selfPowerM[0].length),
      conditionFound: true,
    };
  }

  // パターン7: 「あなたの手札が対戦相手よりN枚以上多いかぎり、」
  const handDiffM = text.match(/^あなたの手札が対戦相手より([０-９\d]+)枚以上多いかぎり、/);
  if (handDiffM) {
    return {
      condition: { type: 'HAND_DIFF', operator: 'gte', value: parseNum(handDiffM[1]) },
      rest: text.slice(handDiffM[0].length),
      conditionFound: true,
    };
  }

  // パターン8: 「あなたの手札が対戦相手より多いかぎり、」（枚数なし → ≥1）
  if (text.startsWith('あなたの手札が対戦相手より多いかぎり、')) {
    return {
      condition: { type: 'HAND_DIFF', operator: 'gte', value: 1 },
      rest: text.slice('あなたの手札が対戦相手より多いかぎり、'.length),
      conditionFound: true,
    };
  }

  // それ以外の「〜かぎり、」パターン（複雑な条件→未解析、句点を越えない）
  const genericKagiriM = text.match(/^[^。]+かぎり、/);
  if (genericKagiriM && genericKagiriM[0].length < 60) {
    return { condition: undefined, rest: text.slice(genericKagiriM[0].length), conditionFound: true, isTimingMarker: true };
  }

  return { condition: undefined, rest: text, conditionFound: false };
}

// ===== アクションパース（1文） =====

function parseSingleSentence(text: string): EffectAction {
  // タイミング・期間プレフィックスを除去（既にparseBlockで処理済み）
  const t = text.trim().replace(/。$/, '')
    .replace(/^ターン終了時まで、/, '')
    .replace(/^あなたのターン終了時、/, '')
    .replace(/^あなたのターン開始時、/, '')
    .replace(/^ターン終了時、/, '')
    .replace(/^このシグニがアタックしたとき、/, '')
    .replace(/^このシグニがバニッシュされたとき、/, '')
    .replace(/^バニッシュされたとき、/, '')
    .replace(/^パワー[０-９\d]+以下のこのシグニがバニッシュされたとき、/, '')
    .replace(/^[^、。「」]{2,60}バニッシュされたとき、/, '')
    .replace(/^[^、。「」]{2,60}トラッシュに置かれたとき、/, '')
    .replace(/^[^、。「」]{2,60}場を離れ?たとき、/, '')
    .replace(/^このカードがエクシードのコストとしてルリグトラッシュに置かれたとき、/, '')
    .replace(/^対戦相手がアーツを使用したとき、/, '')
    .replace(/^あなたの[^、「」]{2,30}が場に出たとき、/, '')
    .replace(/^[^、。「」]{2,60}ライズされたとき、/, '')
    .replace(/^[^、。「」]{2,60}アタックしたとき、/, '');

  // ---- 条件かぎり、代わりに＋Nされる/する（条件付き代替パワー修正）----
  if (t.match(/^[^。]+かぎり、代わりに[＋+][０-９\d]+(?:される|する)/)) {
    return { type: 'STUB', id: 'CONDITIONAL_ALT_POWER_BOOST' } as StubAction;
  }

  // ---- このシグニは＜X＞を持つ（クラス/ストーリー付与）----
  if (t.match(/^このシグニは＜[^＞]+＞を持つ/)) {
    return { type: 'STUB', id: 'GRANT_SIGNI_CLASS' } as StubAction;
  }

  // ---- このシグニはアタックできない（CONTINUOUS）----
  if (t.match(/このシグニはアタックできない/)) {
    return { type: 'BLOCK_ACTION', target: { type: 'SIGNI', owner: 'self', count: 1 }, actionId: 'ATTACK', until: 'PERMANENT' };
  }

  // ---- バニッシュ先変更（エナゾーン→トラッシュ）----
  if (t.match(/バニッシュされる場合.*エナゾーンに置かれる代わりにトラッシュに置かれる/)) {
    const owner: Owner = t.includes('対戦相手') ? 'opponent' : 'self';
    const until = t.includes('このターン') ? 'END_OF_TURN' : 'PERMANENT';
    return {
      type: 'BANISH_REDIRECT',
      target: { type: 'SIGNI', owner, count: 'ALL', filter: { cardType: 'シグニ' } },
      redirectTo: 'trash',
      until,
    } as BanishRedirectAction;
  }

  // ---- 対戦相手エナゾーン→トラッシュ ----
  if (t.match(/対戦相手(?:は自分)?のエナゾーンから.*カード.*トラッシュに置く/)) {
    const cM = t.match(/カード([０-９\d]+)枚/);
    return { type: 'TRASH', target: { type: 'ENERGY_CARD', owner: 'opponent', count: cM ? parseNum(cM[1]) : 1 } };
  }
  // ---- 自分エナゾーン→トラッシュ ----
  if (t.match(/あなたのエナゾーンからカード([０-９\d]+)枚をトラッシュに置く/)) {
    const cM = t.match(/カード([０-９\d]+)枚/);
    return { type: 'TRASH', target: { type: 'ENERGY_CARD', owner: 'self', count: cM ? parseNum(cM[1]) : 1 } };
  }

  // ---- エナゾーン全色破壊（各プレイヤー）----
  if (t.match(/エナゾーンからすべての.*白.*赤.*青.*緑.*黒.*のカードをトラッシュに置く/)) {
    const colorFilter: TargetFilter = { color: ['白', '赤', '青', '緑', '黒'] };
    return {
      type: 'SEQUENCE',
      steps: [
        { type: 'TRASH', target: { type: 'ENERGY_CARD', owner: 'self', count: 'ALL', filter: colorFilter } },
        { type: 'TRASH', target: { type: 'ENERGY_CARD', owner: 'opponent', count: 'ALL', filter: colorFilter } },
      ],
    };
  }

  // ---- 対戦相手エナゾーン全カード＋シグニ全滅 ----
  if (t.match(/対戦相手のエナゾーンにあるすべてのカード.*対戦相手のすべてのシグニをトラッシュに置く/)) {
    return {
      type: 'SEQUENCE',
      steps: [
        { type: 'TRASH', target: { type: 'ENERGY_CARD', owner: 'opponent', count: 'ALL' } },
        { type: 'BANISH', target: { type: 'SIGNI', owner: 'opponent', count: 'ALL', filter: { cardType: 'シグニ' } } },
      ],
    };
  }

  // ---- フリーグロウ（コスト不要でグロウ）----
  if (t.match(/グロウコストを支払わず.*センタールリグにグロウする/)) {
    return { type: 'GROW_FREE', levelFilter: 'same' } as GrowFreeAction;
  }

  // ---- グロウコスト減少（ルリグ対象）----
  if (t.match(/グロウコストは.*になる/)) {
    const costs = parseEnergyCosts(t);
    const dur = t.includes('次のあなたのターン') ? 'NEXT_TURN' : 'PERMANENT';
    return {
      type: 'COST_REDUCTION',
      targetCardType: 'ルリグ',
      reduction: costs.length > 0 ? costs : [{ color: '無', count: 0 }],
      isGrowCost: true,
      duration: dur,
    } as CostReductionAction;
  }

  // ---- ルリグトラッシュ→ルリグデッキ ----
  if (t.match(/ルリグトラッシュから.*ルリグデッキに加える/)) {
    const filter: TargetFilter = { ...parseCardTypeFilter(t), ...parseColorFilter(t) };
    return {
      type: 'TRANSFER_TO_DECK',
      source: { type: 'LRIG_TRASH_CARD', owner: 'self', count: 1, filter },
      shuffle: false,
      destination: 'lrig_deck',
    } as TransferToDeckAction;
  }

  // ---- シグニ再配置 ----
  if (t.match(/シグニを好きなように配置し直/)) {
    const owner: Owner = t.includes('対戦相手') ? 'opponent' : 'self';
    return { type: 'REARRANGE_SIGNI', target: { type: 'SIGNI', owner, count: 'ALL' } } as RearrangeSigniAction;
  }
  if (t.match(/シグニ.*とこのシグニの場所を入れ替えてもよい/)) {
    return { type: 'REARRANGE_SIGNI', target: { type: 'SIGNI', owner: 'self', count: 1 }, swap: true } as RearrangeSigniAction;
  }

  // ---- アーツ使用禁止 ----
  if (t.match(/対戦相手はアーツを使用できない/)) {
    const until = t.includes('次のターン') ? 'NEXT_TURN' : 'END_OF_TURN';
    return { type: 'BLOCK_ACTION', target: { type: 'PLAYER', owner: 'opponent', count: 1 }, actionId: 'ARTS', until };
  }

  // ---- エナフェーズスキップ ----
  if (t.match(/対戦相手は.*エナフェイズをスキップする/)) {
    return { type: 'BLOCK_ACTION', target: { type: 'PLAYER', owner: 'opponent', count: 1 }, actionId: 'ENERGY_PHASE', until: 'END_OF_TURN' };
  }

  // ---- ガード不可 ----
  if (t.match(/対戦相手は(?:.*シグニで)?【ガード】ができない/)) {
    const until: BlockActionAction['until'] = t.includes('次の') ? 'NEXT_TURN' : 'END_OF_TURN';
    return { type: 'BLOCK_ACTION', target: { type: 'PLAYER', owner: 'opponent', count: 1 }, actionId: 'GUARD', until };
  }

  // ---- 能力消去 ----
  if (t.match(/能力を失[うい]/) || t.match(/能力を新たに得られない/)) {
    const owner: Owner = t.includes('対戦相手') ? 'opponent' : 'self';
    const dur: EffectDuration = t.includes('ターン終了時まで') ? 'UNTIL_END_OF_TURN' : 'PERMANENT';
    const all = t.match(/すべての.*シグニ/) || t.match(/場にあるシグニは能力を失/);
    return { type: 'REMOVE_ABILITIES', target: { type: 'SIGNI', owner, count: all ? 'ALL' : 1 }, until: dur } as RemoveAbilitiesAction;
  }

  // ---- 条件付きドロー（手札が少ない場合に差分だけ引く）----
  const handFillM = t.match(/手札が([０-９\d]+)枚より少ない場合、その差の分だけカードを引く/);
  if (handFillM) {
    return {
      type: 'CONDITIONAL',
      condition: { type: 'HAND_COUNT', owner: 'self', operator: 'lt', value: parseNum(handFillM[1]) },
      then: { type: 'DRAW', owner: 'self', count: 1 },
    };
  }

  // ---- ハンデス（レベル指定）----
  const levelHandM = t.match(/対戦相手の手札を見て.*レベル([０-９\d]+).*カード.*選び.*捨てさせる/);
  if (levelHandM) {
    return { type: 'TRASH', target: { type: 'HAND_CARD', owner: 'opponent', count: 1, filter: { level: parseNum(levelHandM[1]) } } };
  }

  // ---- パワー増減禁止（CONTINUOUS 耐性）----
  if (t.match(/シグニのパワーは増減しない/)) {
    return {
      type: 'GRANT_PROTECTION',
      target: { type: 'SIGNI', owner: 'self', count: 'ALL' },
      from: ['POWER_MODIFY'],
      sourceOwner: 'opponent',
      duration: 'PERMANENT',
    } as GrantProtectionAction;
  }

  // ---- 相手シグニの自発トラッシュ禁止 ----
  if (t.match(/自分で自分のシグニを場からトラッシュに置くことができない/)) {
    return { type: 'BLOCK_ACTION', target: { type: 'PLAYER', owner: 'opponent', count: 1 }, actionId: 'SELF_SIGNI_TRASH', until: 'PERMANENT' };
  }

  // ---- フェーズ外ドロー禁止 ----
  if (t.match(/グロウフェイズとドローフェイズ以外でカードを引いたり.*できない/)) {
    return { type: 'BLOCK_ACTION', target: { type: 'PLAYER', owner: 'opponent', count: 1 }, actionId: 'DRAW_OUTSIDE_DRAW_PHASE', until: 'END_OF_TURN' };
  }

  // ---- 両者手札全捨て＋最多ドロー ----
  if (t.match(/あなたと対戦相手は手札をすべて捨て.*最も大きい数に等しい枚数のカードを引く/)) {
    return { type: 'MUTUAL_DISCARD_AND_DRAW', drawMax: true } as MutualDiscardAndDrawAction;
  }

  // ---- ドローフェイズ枚数制限（すべてのプレイヤー）----
  const drawLimitM = t.match(/すべてのプレイヤーはドローフェイズにカードを([０-９\d]+)枚しか引くことができない/);
  if (drawLimitM) {
    const n = parseNum(drawLimitM[1]);
    return {
      type: 'SEQUENCE',
      steps: [
        { type: 'BLOCK_ACTION', target: { type: 'PLAYER', owner: 'self', count: 1 }, actionId: `DRAW_LIMIT_${n}`, until: 'PERMANENT' },
        { type: 'BLOCK_ACTION', target: { type: 'PLAYER', owner: 'opponent', count: 1 }, actionId: `DRAW_LIMIT_${n}`, until: 'PERMANENT' },
      ],
    };
  }

  // ---- 次のカード使用コスト減少＋打ち消し耐性 ----
  if (t.match(/次にあなたが(スペル|アーツ)を使用する場合.*コストは.*減り.*打ち消されない/)) {
    const typeM = t.match(/次にあなたが(スペル|アーツ)/);
    const costs = parseEnergyCosts(t);
    return {
      type: 'SEQUENCE',
      steps: [
        { type: 'COST_REDUCTION', targetCardType: (typeM?.[1] ?? 'スペル') as 'スペル' | 'アーツ', reduction: costs, duration: 'UNTIL_END_OF_TURN' } as CostReductionAction,
        { type: 'GRANT_KEYWORD', target: { type: 'SIGNI', owner: 'self', count: 'ALL' }, keyword: 'NEXT_UNCOUNTERABLE', duration: 'UNTIL_END_OF_TURN' },
      ],
    };
  }

  // ---- 対戦相手スペル/アーツのコスト増加 ----
  const costIncM = t.match(/対戦相手の(スペル|アーツ|ルリグ)(?:の【[^】]+】能力)?の使用コストは/);
  if (costIncM && t.includes('増える')) {
    const amount = parseEnergyCosts(t);
    return {
      type: 'COST_INCREASE',
      targetCardType: costIncM[1] as 'スペル' | 'アーツ' | 'ルリグ',
      targetOwner: 'opponent',
      amount: amount.length > 0 ? amount : [{ color: '無', count: 1 }],
      duration: 'PERMANENT',
    } as CostIncreaseAction;
  }

  // ---- フィールドカウント依存パワー修正（AUTO: 〜につき±N）----
  const perFieldM = t.match(/シグニのパワーを.*＜([^＞]+)＞のシグニ１体につき([＋－])([０-９\d]+)する/);
  if (perFieldM) {
    const sign = perFieldM[2] === '＋' ? 1 : -1;
    const delta = sign * parseNum(perFieldM[3]);
    const tgtOwner: Owner = t.includes('対戦相手') ? 'opponent' : 'self';
    return {
      type: 'POWER_MODIFY_PER_FIELD',
      target: { type: 'SIGNI', owner: tgtOwner, count: 'ALL', filter: { cardType: 'シグニ' } },
      deltaPerUnit: delta,
      countFilter: { cardType: 'シグニ', story: perFieldM[1] },
      countOwner: 'self',
    } as PowerModifyPerFieldAction;
  }

  // ---- スタック枚数依存パワー修正（CONTINUOUS: 下にあるカード/シグニ1枚につき）----
  const perStackM = t.match(/このシグニの下にある(?:カード|シグニ)[０-９\d０-９]*枚?につき([＋－])([０-９\d]+)され/);
  if (perStackM) {
    const sign = perStackM[1] === '＋' ? 1 : -1;
    return {
      type: 'POWER_MODIFY_PER_STACK',
      target: { type: 'SIGNI', owner: 'self', count: 1 },
      deltaPerCard: sign * parseNum(perStackM[2]),
    } as PowerModifyPerStackAction;
  }

  // ---- 他シグニのレベル合計依存パワー修正（CONTINUOUS: 場にある他の＜X＞のレベル1につき±N）----
  const perLevelSumM = t.match(/このシグニのパワーはあなたの場にある他の(.+?)のシグニのレベル１につき([＋－])([０-９\d]+)される/);
  if (perLevelSumM) {
    const sign = perLevelSumM[2] === '＋' ? 1 : -1;
    return {
      type: 'POWER_MODIFY_PER_LEVEL_SUM',
      target: { type: 'SIGNI', owner: 'self', count: 1 },
      deltaPerLevel: sign * parseNum(perLevelSumM[3]),
      countFilter: { cardType: 'シグニ', ...parseStoryFilter(perLevelSumM[1]) },
      countOwner: 'self',
      excludeSelf: true,
    } as PowerModifyPerLevelSumAction;
  }

  // ---- デッキ枚数比例パワー修正（CONTINUOUS: デッキのN枚につき±M）----
  {
    const perDeckM = t.match(/このシグニのパワーはあなたのデッキの枚数([０-９\d]+)枚につき([＋－])([０-９\d]+)される/);
    if (perDeckM) {
      const sign = perDeckM[2] === '＋' ? 1 : -1;
      return {
        type: 'POWER_MODIFY_PER_DECK_COUNT',
        target: { type: 'SIGNI', owner: 'self', count: 1 },
        deltaPerUnit: sign * parseNum(perDeckM[3]),
        unitSize: parseNum(perDeckM[1]),
        deckOwner: 'self',
      } as import('../types/effects').PowerModifyPerDeckCountAction;
    }
  }

  // ---- エナ色種類比例パワー修正（CONTINUOUS: エナの色の種類N種につき±M）----
  {
    const perColorM = t.match(/このシグニのパワーはあなたのエナゾーンにあるカードが持つ色の種類([０-９\d]+)つにつき([＋－])([０-９\d]+)される/);
    if (perColorM) {
      const sign = perColorM[2] === '＋' ? 1 : -1;
      return {
        type: 'POWER_MODIFY_PER_ENERGY_COLOR',
        target: { type: 'SIGNI', owner: 'self', count: 1 },
        deltaPerColor: sign * parseNum(perColorM[3]),
        energyOwner: 'self',
      } as import('../types/effects').PowerModifyPerEnergyColorAction;
    }
  }

  // ---- CONTINUOUS: センタールリグのレベルN につきパワー±M ----
  {
    const m = t.match(/このシグニのパワーは(あなた|対戦相手)のセンタールリグのレベル([０-９\d]+)につき([＋－])([０-９\d]+)される/);
    if (m) {
      const lrigOwner: Owner = m[1] === 'あなた' ? 'self' : 'opponent';
      const sign = m[3] === '＋' ? 1 : -1;
      return {
        type: 'POWER_MODIFY_PER_LRIG_LEVEL',
        target: { type: 'SIGNI', owner: 'self', count: 1 },
        deltaPerLevel: sign * parseNum(m[4]),
        lrigOwner,
      } as PowerModifyPerLrigLevelAction;
    }
  }

  // ---- ACTIVATED: 対戦相手のシグニのパワーをルリグレベルNにつき（ターン終了時まで）----
  {
    const m = t.match(/対戦相手のシグニ([０-９\d]+)体を対象とし.*ターン終了時まで.*パワーを(?:あなた|対戦相手)のセンタールリグのレベル([０-９\d]+)につき([＋－])([０-９\d]+)する/);
    if (m) {
      const sign = m[3] === '＋' ? 1 : -1;
      const lrigOwner: Owner = t.includes('対戦相手のセンタールリグのレベル') ? 'opponent' : 'self';
      return {
        type: 'POWER_MODIFY_PER_LRIG_LEVEL',
        target: { type: 'SIGNI', owner: 'opponent', count: parseNum(m[1]) },
        deltaPerLevel: sign * parseNum(m[4]),
        lrigOwner,
      } as PowerModifyPerLrigLevelAction;
    }
  }

  // ---- ACTIVATED: 対戦相手の全シグニのパワーをルリグレベルにつき（即時）----
  {
    const m = t.match(/対戦相手のすべてのシグニのパワーを(?:あなた|対戦相手)のセンタールリグのレベル([０-９\d]+)につき([＋－])([０-９\d]+)する/);
    if (m) {
      const sign = m[2] === '＋' ? 1 : -1;
      const lrigOwner: Owner = t.includes('対戦相手のセンタールリグのレベル') ? 'opponent' : 'self';
      return {
        type: 'POWER_MODIFY_PER_LRIG_LEVEL',
        target: { type: 'SIGNI', owner: 'opponent', count: 'ALL', filter: { cardType: 'シグニ' } },
        deltaPerLevel: sign * parseNum(m[3]),
        lrigOwner,
      } as PowerModifyPerLrigLevelAction;
    }
  }

  // ---- CONTINUOUS: トラッシュのカードN枚につきパワー±M ----
  {
    // "あなたのトラッシュにある＜X＞のシグニN枚につき"
    const m1 = t.match(/このシグニのパワーは(あなた|対戦相手|すべてのプレイヤー)のトラッシュにある(.+?)([０-９\d]+)枚につき([＋－])([０-９\d]+)される/);
    if (m1) {
      const trashOwner: 'self' | 'opponent' | 'both' =
        m1[1] === 'すべてのプレイヤー' ? 'both' : m1[1] === 'あなた' ? 'self' : 'opponent';
      const sign = m1[4] === '＋' ? 1 : -1;
      const filterStr = m1[2].trim();
      const filter: import('../types/effects').TargetFilter | undefined =
        filterStr === 'カード' ? undefined
        : filterStr.includes('シグニ') ? { cardType: 'シグニ', ...parseStoryFilter(filterStr) }
        : filterStr.includes('スペル') ? { cardType: 'スペル' }
        : undefined;
      return {
        type: 'POWER_MODIFY_PER_TRASH_COUNT',
        target: { type: 'SIGNI', owner: 'self', count: 1 },
        deltaPerUnit: sign * parseNum(m1[5]),
        unitSize: parseNum(m1[3]),
        trashOwner,
        countFilter: filter,
      } as PowerModifyPerTrashCountAction;
    }
    // 種類カウント版 "N種類につき"
    const m2 = t.match(/このシグニのパワーは(あなた|対戦相手)のトラッシュにある(.+?)([０-９\d]+)種類につき([＋－])([０-９\d]+)される/);
    if (m2) {
      const trashOwner: 'self' | 'opponent' | 'both' = m2[1] === 'あなた' ? 'self' : 'opponent';
      const sign = m2[4] === '＋' ? 1 : -1;
      const filterStr = m2[2].trim();
      const filter: import('../types/effects').TargetFilter | undefined =
        filterStr.includes('シグニ') ? { cardType: 'シグニ', ...parseStoryFilter(filterStr) } : undefined;
      return {
        type: 'POWER_MODIFY_PER_TRASH_COUNT',
        target: { type: 'SIGNI', owner: 'self', count: 1 },
        deltaPerUnit: sign * parseNum(m2[5]),
        unitSize: parseNum(m2[3]),
        trashOwner,
        countFilter: filter,
        countByVariety: true,
      } as PowerModifyPerTrashCountAction;
    }
  }

  // ---- ACTIVATED: ターン終了時まで、パワーをトラッシュ枚数につき ----
  {
    const m = t.match(/対戦相手のシグニ([０-９\d]+)体を対象とし.*ターン終了時まで.*パワーを(あなた|対戦相手|すべてのプレイヤー)のトラッシュにある(.+?)([０-９\d]+)枚につき([＋－])([０-９\d]+)する/);
    if (m) {
      const trashOwner: 'self' | 'opponent' | 'both' =
        m[2] === 'すべてのプレイヤー' ? 'both' : m[2] === 'あなた' ? 'self' : 'opponent';
      const sign = m[5] === '＋' ? 1 : -1;
      const filterStr = m[3].trim();
      const filter: import('../types/effects').TargetFilter | undefined =
        filterStr === 'カード' ? undefined
        : filterStr.includes('シグニ') ? { cardType: 'シグニ', ...parseStoryFilter(filterStr) }
        : filterStr.includes('スペル') ? { cardType: 'スペル' }
        : filterStr.match(/[赤青緑黒白]/u) ? { color: filterStr.replace(/のカード|のシグニ/g, '').trim() }
        : undefined;
      return {
        type: 'POWER_MODIFY_PER_TRASH_COUNT',
        target: { type: 'SIGNI', owner: 'opponent', count: parseNum(m[1]) },
        deltaPerUnit: sign * parseNum(m[6]),
        unitSize: parseNum(m[4]),
        trashOwner,
        countFilter: filter,
        until: 'UNTIL_END_OF_TURN',
      } as PowerModifyPerTrashCountAction;
    }
  }

  // ---- ACTIVATED: ターン終了時まで、パワーをトラッシュ1枚につき ----
  {
    const m = t.match(/対戦相手のシグニ([０-９\d]+)体を対象とし.*ターン終了時まで.*パワーを(あなた|すべてのプレイヤー)のトラッシュにある(?:カード)?([１-９]?)枚につき([＋－ー])([０-９\d]+)する/);
    if (m) {
      const trashOwner: 'self' | 'both' = m[2] === 'すべてのプレイヤー' ? 'both' : 'self';
      const sign = m[4] === '＋' ? 1 : -1;
      return {
        type: 'POWER_MODIFY_PER_TRASH_COUNT',
        target: { type: 'SIGNI', owner: 'opponent', count: parseNum(m[1]) },
        deltaPerUnit: sign * parseNum(m[5]),
        unitSize: m[3] ? parseNum(m[3]) : 1,
        trashOwner,
        until: 'UNTIL_END_OF_TURN',
      } as PowerModifyPerTrashCountAction;
    }
  }

  // ---- ACTIVATED: ターン終了時まで、パワーをトラッシュN種類につき ----
  {
    const m = t.match(/対戦相手のシグニ([０-９\d]+)体を対象とし.*ターン終了時まで.*パワーを(あなた|対戦相手)のトラッシュにある(.+?)([０-９\d]+)種類につき([＋－])([０-９\d]+)する/);
    if (m) {
      const trashOwner: 'self' | 'opponent' | 'both' = m[2] === 'あなた' ? 'self' : 'opponent';
      const sign = m[5] === '＋' ? 1 : -1;
      const filterStr = m[3].trim();
      const filter: import('../types/effects').TargetFilter | undefined =
        filterStr.includes('シグニ') ? { cardType: 'シグニ', ...parseStoryFilter(filterStr) } : undefined;
      return {
        type: 'POWER_MODIFY_PER_TRASH_COUNT',
        target: { type: 'SIGNI', owner: 'opponent', count: parseNum(m[1]) },
        deltaPerUnit: sign * parseNum(m[6]),
        unitSize: parseNum(m[4]),
        trashOwner,
        countFilter: filter,
        countByVariety: true,
        until: 'UNTIL_END_OF_TURN',
      } as PowerModifyPerTrashCountAction;
    }
  }

  // ---- ACTIVATED: ターン終了時まで、パワーをフィールドの＜クラス＞シグニN体につき（対象:相手シグニ、フィルタ:クラス）----
  {
    const m = t.match(/対戦相手のシグニ([０-９\d]+)体を対象とし.*ターン終了時まで.*パワーをあなたの(?:場にある)?(?:(他の))?(＜[^＞]+＞)のシグニ([０-９\d]+)体につき([＋－])([０-９\d]+)する/);
    if (m) {
      const sign = m[5] === '＋' ? 1 : -1;
      const excludeSelf = !!m[2];
      return {
        type: 'POWER_MODIFY_PER_FIELD',
        target: { type: 'SIGNI', owner: 'opponent', count: parseNum(m[1]) },
        deltaPerUnit: sign * parseNum(m[6]),
        countFilter: { cardType: 'シグニ', story: m[3].slice(1, -1) },
        countOwner: 'self',
        ...(excludeSelf ? { excludeSelf: true } : {}),
      } as PowerModifyPerFieldAction;
    }
  }

  // ---- ACTIVATED: ターン終了時まで、パワーをフィールドの色のシグニN体につき（対象:相手シグニ、フィルタ:色）----
  {
    const m = t.match(/対戦相手のシグニ([０-９\d]+)体を対象とし.*ターン終了時まで.*パワーをあなたの場にある(?:(他の))?([白赤青緑黒]+)のシグニ([０-９\d]+)体につき([＋－])([０-９\d]+)する/);
    if (m) {
      const sign = m[5] === '＋' ? 1 : -1;
      return {
        type: 'POWER_MODIFY_PER_FIELD',
        target: { type: 'SIGNI', owner: 'opponent', count: parseNum(m[1]) },
        deltaPerUnit: sign * parseNum(m[6]),
        countFilter: { cardType: 'シグニ', color: m[3] },
        countOwner: 'self',
        ...(m[2] ? { excludeSelf: true } : {}),
      } as PowerModifyPerFieldAction;
    }
  }

  // ---- ACTIVATED: ターン終了時まで、パワーをフィールドの「下にカードがある」シグニN体につき（対象:相手シグニ）----
  {
    const m = t.match(/対戦相手のシグニ([０-９\d]+)体を対象とし.*ターン終了時まで.*パワーを(?:あなたの場にある)?下にカードがある(?:あなたの)?シグニ([０-９\d]+)体につき([＋－])([０-９\d]+)する/);
    if (m) {
      const sign = m[3] === '＋' ? 1 : -1;
      return {
        type: 'POWER_MODIFY_PER_FIELD',
        target: { type: 'SIGNI', owner: 'opponent', count: parseNum(m[1]) },
        deltaPerUnit: sign * parseNum(m[4]),
        countFilter: { cardType: 'シグニ' },
        countOwner: 'self',
      } as PowerModifyPerFieldAction;
    }
  }

  // ---- ACTIVATED: ターン終了時まで、パワーを自分シグニ１体につき±N（対象:自シグニ）----
  {
    const m = t.match(/あなたのシグニ([０-９\d]+)体を対象とし.*ターン終了時まで.*パワーをあなたの(?:場にある)?(?:(他の))?(＜[^＞]+＞)のシグニ([０-９\d]+)体につき([＋－])([０-９\d]+)する/);
    if (m) {
      const sign = m[5] === '＋' ? 1 : -1;
      return {
        type: 'POWER_MODIFY_PER_FIELD',
        target: { type: 'SIGNI', owner: 'self', count: parseNum(m[1]) },
        deltaPerUnit: sign * parseNum(m[6]),
        countFilter: { cardType: 'シグニ', story: m[3].slice(1, -1) },
        countOwner: 'self',
        ...(m[2] ? { excludeSelf: true } : {}),
      } as PowerModifyPerFieldAction;
    }
  }

  // ---- CONTINUOUS: ライフクロスN枚につきパワー±M ----
  {
    const m = t.match(/このシグニのパワーは(あなた|対戦相手)のライフクロス([０-９\d]+)枚につき([＋－])([０-９\d]+)される/);
    if (m) {
      const lifeOwner: Owner = m[1] === 'あなた' ? 'self' : 'opponent';
      const sign = m[3] === '＋' ? 1 : -1;
      return {
        type: 'POWER_MODIFY_PER_LIFE_COUNT',
        target: { type: 'SIGNI', owner: 'self', count: 1 },
        deltaPerLife: sign * parseNum(m[4]),
        lifeOwner,
      } as PowerModifyPerLifeCountAction;
    }
  }

  // ---- CONTINUOUS: 場にある【ウィルス】N つにつきパワー±M ----
  {
    const m = t.match(/このシグニのパワーは(対戦相手|あなた)の場にある【ウィルス】([０-９\d]+)つにつき([＋－])([０-９\d]+)される/);
    if (m) {
      const virusOwner: Owner = m[1] === '対戦相手' ? 'opponent' : 'self';
      const sign = m[3] === '＋' ? 1 : -1;
      return {
        type: 'POWER_MODIFY_PER_VIRUS_COUNT',
        target: { type: 'SIGNI', owner: 'self', count: 1 },
        deltaPerVirus: sign * parseNum(m[4]),
        virusOwner,
      } as PowerModifyPerVirusCountAction;
    }
  }

  // ---- CONTINUOUS: この下にあるカード1枚につきパワー±M（PER_STACK補完）----
  {
    const m = t.match(/このシグニのパワーはこの下にあるカード([０-９\d]+)枚につき([＋－])([０-９\d]+)される/);
    if (m) {
      const sign = m[2] === '＋' ? 1 : -1;
      return {
        type: 'POWER_MODIFY_PER_STACK',
        target: { type: 'SIGNI', owner: 'self', count: 1 },
        deltaPerCard: sign * parseNum(m[3]),
      } as PowerModifyPerStackAction;
    }
  }

  // ---- チャーム保護（バニッシュ時チャーム消費で防ぐ）----
  if (t.match(/シグニ.*バニッシュされる場合.*チャーム.*トラッシュに置いてもよい/)) {
    const storyF = parseStoryFilter(t) as TargetFilter;
    return {
      type: 'CHARM_PROTECTION',
      signiFilter: { cardType: 'シグニ', ...storyF },
      optional: true,
    } as CharmProtectionAction;
  }

  // ---- 限定条件無視 ----
  if (t.match(/限定条件は無視される/)) {
    return { type: 'BLOCK_ACTION', target: { type: 'PLAYER', owner: 'self', count: 1 }, actionId: 'IGNORE_RESTRICTIONS', until: 'PERMANENT' };
  }

  // ---- PlayFree: ルリグデッキからアーツをコストなしで使用 ----
  if (t.match(/ルリグデッキから.*アーツ.*コストを支払わずに使用する/)) {
    const filter: TargetFilter = { cardType: 'アーツ', ...parseColorFilter(t) };
    return { type: 'PLAY_FREE', source: 'lrig_deck', filter, ignoreCost: true, optional: false } as PlayFreeAction;
  }

  // ---- PlayFree: 手札からスペルをコストなしで使用 ----
  if (t.match(/手札から.*スペル.*コストを支払わずに使用する/)) {
    const filter: TargetFilter = { cardType: 'スペル', ...parseColorFilter(t) };
    return { type: 'PLAY_FREE', source: 'hand', filter, ignoreCost: true, optional: false } as PlayFreeAction;
  }

  // ---- PlayFree: 対戦相手手札からスペルを使用 ----
  if (t.match(/対戦相手の手札を見て.*スペル.*使用してもよい/)) {
    return { type: 'PLAY_FREE', source: 'opp_hand', filter: { cardType: 'スペル' }, ignoreCost: true, ignoreRestrictions: true, optional: true } as PlayFreeAction;
  }

  // ---- PlayFree: 対戦相手トラッシュからスペルを使用 ----
  if (t.match(/対戦相手のトラッシュから.*スペル.*使用してもよい/)) {
    return { type: 'PLAY_FREE', source: 'opp_trash', filter: { cardType: 'スペル' }, ignoreCost: true, ignoreRestrictions: true, optional: true } as PlayFreeAction;
  }

  // ---- グロウフェイズスキップ ----
  if (t.includes('グロウフェイズをスキップする')) {
    return { type: 'BLOCK_ACTION', target: { type: 'PLAYER', owner: 'self', count: 1 }, actionId: 'GROW', until: 'END_OF_TURN' };
  }

  // ---- スペル/アーツ打ち消し ----
  if ((t.includes('スペル') || t.includes('アーツ')) && t.includes('打ち消す')) {
    return { type: 'COUNTER_SPELL' } as CounterSpellAction;
  }

  // ---- コスト減少（「青のスペルのコストは《無×1》減る」など）----
  const costRedM = t.match(/(白|赤|青|緑|黒)の(スペル|アーツ)のコストは《([^》]+)》(?:×([０-９\d]+))?減/);
  if (costRedM) {
    return {
      type: 'COST_REDUCTION',
      targetCardType: costRedM[2] as 'スペル' | 'アーツ',
      color: costRedM[1],
      reduction: [{ color: costRedM[3] as EnergyCost['color'], count: costRedM[4] ? parseNum(costRedM[4]) : 1 }],
    } as CostReductionAction;
  }

  // ---- エナチャージ（【エナチャージN】ショートハンド）----
  const ecM = t.match(/【エナチャージ([０-９\d]+)】/);
  if (ecM) return { type: 'ENERGY_CHARGE_FROM_DECK', owner: 'self', count: parseNum(ecM[1]) };

  // ---- ドロー：まず「引き、捨てる」複合パターンを先にチェック ----
  const drawDiscardM = t.match(/カードを([０-９\d]+)枚引き、手札を([０-９\d]+)枚捨てる/);
  if (drawDiscardM) {
    return {
      type: 'SEQUENCE',
      steps: [
        { type: 'DRAW', owner: 'self', count: parseNum(drawDiscardM[1]) },
        { type: 'TRASH', target: { type: 'HAND_CARD', owner: 'self', count: parseNum(drawDiscardM[2]) } },
      ],
    };
  }
  const drawM = t.match(/カードを([０-９\d]+)枚引(?:く|いてもよい)/);
  if (drawM) return { type: 'DRAW', owner: 'self', count: parseNum(drawM[1]) };

  // ---- 対戦相手シグニをエナゾーンに置く（パワーフィルタあり）----
  {
    // "対戦相手のパワーN以上のシグニN体を対象とし、それをエナゾーンに置く"
    const m1 = t.match(/対戦相手のパワー([０-９\d]+)以上のシグニ([０-９\d]+|すべての)体?を対象とし.*エナゾーンに置く/);
    if (m1) {
      const count = m1[2] === 'すべての' ? 'ALL' : parseNum(m1[2]);
      return {
        type: 'ENERGY_CHARGE',
        target: { type: 'SIGNI', owner: 'opponent', count, filter: { cardType: 'シグニ', powerRange: { min: parseNum(m1[1]) } } },
      } as EnergyChargeAction;
    }
    // "対戦相手のパワーN以上のすべてのシグニをエナゾーンに置く"
    const m2 = t.match(/対戦相手のパワー([０-９\d]+)以上のすべてのシグニをエナゾーンに置く/);
    if (m2) {
      return {
        type: 'ENERGY_CHARGE',
        target: { type: 'SIGNI', owner: 'opponent', count: 'ALL', filter: { cardType: 'シグニ', powerRange: { min: parseNum(m2[1]) } } },
      } as EnergyChargeAction;
    }
    // "対戦相手のシグニN体を対象とし、それをエナゾーンに置く" （フィルタなし）
    const m3 = t.match(/対戦相手の(?:レベル([０-９\d]+)(以下|以上)の)?シグニ([０-９\d]+)体を対象とし.*それをエナゾーンに置く/);
    if (m3) {
      const lv = m3[1] ? parseNum(m3[1]) : undefined;
      const filter: import('../types/effects').TargetFilter = lv !== undefined
        ? { cardType: 'シグニ', level: m3[2] === '以下' ? { max: lv } : { min: lv } }
        : { cardType: 'シグニ' };
      return {
        type: 'ENERGY_CHARGE',
        target: { type: 'SIGNI', owner: 'opponent', count: parseNum(m3[3]), filter },
      } as EnergyChargeAction;
    }
  }

  // ---- ルリグタイプ無視（グロウ制限解除）----
  if (t.match(/このルリグにグロウするためのルリグタイプは無視される/)) {
    return { type: 'BLOCK_ACTION', target: { type: 'PLAYER', owner: 'self', count: 1 }, actionId: 'IGNORE_LRIG_TYPE', until: 'PERMANENT' };
  }

  // ---- 正面への配置強制（CONTINUOUS: 相手のシグニ配置先を制限）----
  if (t.match(/対戦相手がシグニを配置する場合、可能ならばこのシグニの正面に配置しなければならない/)) {
    return { type: 'BLOCK_ACTION', target: { type: 'PLAYER', owner: 'opponent', count: 1 }, actionId: 'FORCE_PLACE_FRONT', until: 'PERMANENT' };
  }

  // ---- バニッシュ ----
  if (t.includes('バニッシュする') || t.includes('バニッシュしてもよい')) {
    if (t.match(/すべてのシグニをバニッシュ/)) {
      const owner: Owner = t.includes('対戦相手') ? 'opponent' : 'any';
      return { type: 'BANISH', target: { type: 'SIGNI', owner, count: 'ALL', filter: { cardType: 'シグニ' } } };
    }
    const owner: Owner = t.includes('対戦相手') ? 'opponent' : 'self';
    const isOptional = t.includes('バニッシュしてもよい');
    return { type: 'BANISH', target: parseSigniTarget(t, owner), ...(isOptional ? { optional: true } : {}) };
  }

  // ---- デッキからトラッシュ（もよい）----
  {
    const deckOptM = t.match(/(?:あなたの)?デッキの上からカードを([０-９\d]+)枚トラッシュに置いてもよい/);
    if (deckOptM) {
      return { type: 'TRASH', target: { type: 'DECK_CARD', owner: 'self', count: parseNum(deckOptM[1]) } };
    }
  }

  // ---- トラッシュに置く（直接除去）----
  if (t.includes('トラッシュに置く') || t.includes('トラッシュに置く')) {
    // デッキからトラッシュ
    const deckM = t.match(/デッキの上からカードを([０-９\d]+)枚トラッシュに置く/);
    if (deckM) {
      const both = t.includes('各プレイヤー');
      if (both) {
        return {
          type: 'SEQUENCE',
          steps: [
            { type: 'TRASH', target: { type: 'DECK_CARD', owner: 'self', count: parseNum(deckM[1]) } },
            { type: 'TRASH', target: { type: 'DECK_CARD', owner: 'opponent', count: parseNum(deckM[1]) } },
          ],
        };
      }
      return { type: 'TRASH', target: { type: 'DECK_CARD', owner: 'self', count: parseNum(deckM[1]) } };
    }
    // シグニ・ルリグをトラッシュへ（対戦相手 or 自分）
    if (t.includes('対戦相手のシグニ') || t.includes('対戦相手の感染状態のシグニ') || t.includes('対戦相手のパワー') || t.includes('対戦相手のセンタールリグ')) {
      return { type: 'TRASH', target: parseSigniTarget(t, 'opponent') };
    }
    if (t.includes('あなたのシグニ') || t.includes('あなたの他のシグニ') || t.includes('あなたの感染状態のシグニ')) {
      return { type: 'TRASH', target: parseSigniTarget(t, 'self') };
    }
  }

  // ---- バウンス（手札に戻す / 戻してもよい）----
  if (t.includes('手札に戻す') || t.includes('手札に戻してもよい')) {
    const owner: Owner = t.includes('対戦相手') ? 'opponent' : 'self';
    const upToM = t.match(/([０-９\d]+)体まで/);
    const countM = t.match(/([０-９\d]+)体を対象/);
    const all = t.includes('すべて');
    const count = all ? 'ALL' : (upToM ? parseNum(upToM[1]) : (countM ? parseNum(countM[1]) : 1));
    return {
      type: 'BOUNCE',
      target: {
        type: 'SIGNI', owner, count, upToCount: !!upToM,
        filter: { cardType: 'シグニ', ...parsePowerFilter(t), ...parseLevelFilter(t) },
      },
      optional: t.includes('もよい'),
    };
  }

  // ---- ハンデス（相手手札捨て）----
  if (t.includes('捨てさせる') || (t.includes('対戦相手は手札を') && t.includes('捨てる'))) {
    // 見ないで選ぶ（ランダム）
    const blindM = t.match(/対戦相手の手札を([０-９\d]+)枚見ないで選び、捨てさせる/)
                ?? t.match(/対戦相手の手札を([０-９\d]+)枚見ないで選び捨てさせる/);
    if (blindM) {
      return { type: 'TRASH', target: { type: 'HAND_CARD', owner: 'opponent', count: parseNum(blindM[1]), blind: true } };
    }
    // 1枚版（「1枚」省略パターン）
    if (t.match(/対戦相手の手札を.*見ないで選び/)) {
      return { type: 'TRASH', target: { type: 'HAND_CARD', owner: 'opponent', count: 1, blind: true } };
    }
    // 強制捨て
    const forceM = t.match(/対戦相手は手札を([０-９\d]+)枚捨てる/);
    if (forceM) {
      return { type: 'TRASH', target: { type: 'HAND_CARD', owner: 'opponent', count: parseNum(forceM[1]) } };
    }
    // 「対戦相手は手札を1枚捨てる」
    if (t.match(/対戦相手は手札を.*捨てる/)) {
      return { type: 'TRASH', target: { type: 'HAND_CARD', owner: 'opponent', count: 1 } };
    }
    // 見てからレベル指定で捨てさせる（複雑→UNKNOWN）
  }

  // ---- 各プレイヤーは手札をN枚捨てる ----
  {
    const bothDiscardM = t.match(/各プレイヤーは手札を([０-９\d]+)枚捨てる/);
    if (bothDiscardM) {
      return { type: 'DISCARD_BOTH', count: parseNum(bothDiscardM[1]) };
    }
  }

  // ---- 自分手札を捨てる ----
  const selfDiscardM = t.match(/^(?:あなたは)?手札を([０-９\d]+)枚捨てる$/);
  if (selfDiscardM) {
    return { type: 'TRASH', target: { type: 'HAND_CARD', owner: 'self', count: parseNum(selfDiscardM[1]) } };
  }

  // ---- サーチ（手札 or 場に出す）----
  if (t.includes('デッキから') && t.includes('探して') &&
      (t.includes('手札に加え') || t.includes('場に出し') || t.includes('トラッシュに置き'))) {
    const filter: TargetFilter = {
      ...parseCardTypeFilter(t),
      ...parseLevelFilter(t),
      ...parseColorFilter(t),
      ...parseStoryFilter(t),
    };
    const nameM = t.match(/《([^》]+)》/);
    if (nameM) filter.cardName = nameM[1];
    const upToM = t.match(/([０-９\d]+)枚まで/);
    const countM = t.match(/([０-９\d]+)枚を探/);
    const maxCount = upToM ? parseNum(upToM[1]) : (countM ? parseNum(countM[1]) : 1);
    const toField = t.includes('場に出し');
    const toTrash = t.includes('トラッシュに置き');
    return {
      type: 'SEARCH',
      from: { location: 'deck', owner: 'self' },
      filter,
      maxCount,
      then: toField
        ? { type: 'ADD_TO_FIELD', owner: 'self' }
        : toTrash
          ? { type: 'TRASH', target: { type: 'DECK_CARD', owner: 'self', count: 1 } }
          : { type: 'SEQUENCE', steps: [{ type: 'REVEAL' }, { type: 'ADD_TO_HAND', owner: 'self' }] },
      afterSearch: t.includes('シャッフル') ? { type: 'SHUFFLE_DECK', owner: 'self' } : undefined,
    };
  }

  // ---- 複数対象パワー修整（「それらのパワーをそれぞれ±N」）----
  {
    const multiPowerM = t.match(/シグニ([０-９\d]+)体を対象とし.*それらのパワーをそれぞれ([＋－])([０-９\d]+)する/);
    if (multiPowerM) {
      const count = parseNum(multiPowerM[1]);
      const delta = multiPowerM[2] === '＋' ? parseNum(multiPowerM[3]) : -parseNum(multiPowerM[3]);
      const owner: Owner = t.includes('対戦相手') ? 'opponent' : 'self';
      const target: EffectTarget = { type: 'SIGNI', owner, count, filter: { cardType: 'シグニ' } };
      return { type: 'POWER_MODIFY', target, delta } as PowerModifyAction;
    }
  }

  // ---- パワーパンプ / デバフ ----
  const plusM = t.match(/パワーを＋([０-９\d]+)する/) ?? t.match(/パワーは＋([０-９\d]+)され/);
  const minusM = t.match(/パワーを－([０-９\d]+)する/) ?? t.match(/パワーは－([０-９\d]+)され/)
               ?? t.match(/パワーを-([０-９\d]+)する/);
  if (plusM || minusM) {
    const delta = plusM ? parseNum(plusM[1]) : -(parseNum(minusM![1]));
    let target: EffectTarget;
    if (t.match(/あなたのすべてのシグニ/) || t.match(/あなたの(?:[白赤青緑黒]の|＜[^＞]+＞の|他の)?シグニのパワーを/)) {
      target = { type: 'SIGNI', owner: 'self', count: 'ALL', filter: { cardType: 'シグニ', ...parseColorFilter(t), ...parseStoryFilter(t) } };
    } else if (t.match(/対戦相手の(?:感染状態の)?シグニ([０-９\d]+)体/) || t.match(/対戦相手の感染状態のシグニ/)) {
      target = parseSigniTarget(t, 'opponent');
    } else if (t.match(/あなたの(?:感染状態の)?シグニ([０-９\d]+)体/)) {
      target = parseSigniTarget(t, 'self');
    } else if (t.match(/このシグニ/)) {
      target = { type: 'SIGNI', owner: 'self', count: 1 };
    } else {
      target = { type: 'SIGNI', owner: 'any', count: 1 };
    }
    return { type: 'POWER_MODIFY', target, delta };
  }

  // ---- パワーセット（基本パワーはNになる / それの基本パワーをNにする）----
  const powerSetM = t.match(/(?:基本)?パワーは([０-９\d]+)になる/)
                 ?? t.match(/(?:基本)?パワーを([０-９\d]+)にする/);
  if (powerSetM) {
    const owner: Owner = t.includes('対戦相手') ? 'opponent' : 'self';
    const cM = t.match(/シグニ([０-９\d]+)体/);
    const count = cM ? parseNum(cM[1]) : 1;
    const target: EffectTarget = t.includes('このシグニ')
      ? { type: 'SIGNI', owner: 'self', count: 1 }
      : { type: 'SIGNI', owner, count };
    return { type: 'POWER_SET', target, value: parseNum(powerSetM[1]) };
  }

  // ---- ダウンし凍結（複合）----
  if (t.includes('ダウンし凍結')) {
    const owner: Owner = t.includes('対戦相手') ? 'opponent' : 'self';
    const signiTgt = parseSigniTarget(t, owner);
    return { type: 'SEQUENCE', steps: [{ type: 'DOWN', target: signiTgt }, { type: 'FREEZE', target: signiTgt }] };
  }

  // ---- ダウン ----
  if (t.includes('ダウンする') || t.match(/をダウン/)) {
    const owner: Owner = t.includes('対戦相手') ? 'opponent' : 'self';
    if (t.includes('センタールリグ') && t.includes('シグニ')) {
      // 「センタールリグとすべてのシグニをダウン」のような複合ダウン
      const signiTgt = parseSigniTarget(t, owner);
      return { type: 'SEQUENCE', steps: [
        { type: 'DOWN', target: { type: 'LRIG', owner, count: 1 } },
        { type: 'DOWN', target: signiTgt },
      ]};
    }
    if (t.includes('センタールリグ')) {
      return { type: 'DOWN', target: { type: 'LRIG', owner, count: 1 } };
    }
    return { type: 'DOWN', target: parseSigniTarget(t, owner) };
  }

  // ---- 凍結 ----
  if (t.includes('凍結する')) {
    const owner: Owner = t.includes('対戦相手') ? 'opponent' : 'self';
    return { type: 'FREEZE', target: parseSigniTarget(t, owner) };
  }

  // ---- アップ ----
  if (t.includes('アップする') || t.match(/をアップ/)) {
    if (t.includes('すべてのシグニをアップ') || t.match(/あなたのシグニ[をが]アップ/)) {
      return { type: 'UP', target: { type: 'SIGNI', owner: 'self', count: 'ALL' } };
    }
    return { type: 'UP', target: { type: 'SIGNI', owner: 'self', count: 1 } };
  }

  // ---- デッキ上 → エナゾーン ----
  if ((t.includes('デッキの一番上のカードをエナゾーンに置')) ||
      (t.includes('デッキの上からカードを') && t.includes('エナゾーンに置'))) {
    const cM = t.match(/カードを([０-９\d]+)枚/);
    return { type: 'ENERGY_CHARGE_FROM_DECK', owner: 'self', count: cM ? parseNum(cM[1]) : 1 };
  }

  // ---- トラッシュ → 手札 ----
  if (t.includes('トラッシュから') && t.includes('手札に加える')) {
    const filter: TargetFilter = { ...parseCardTypeFilter(t) };
    const upToM = t.match(/([０-９\d]+)枚まで/);
    const cM = t.match(/([０-９\d]+)枚を対象/);
    const count = upToM ? parseNum(upToM[1]) : (cM ? parseNum(cM[1]) : 1);
    return { type: 'TRANSFER_TO_HAND', source: { type: 'TRASH_CARD', owner: 'self', count, upToCount: !!upToM, filter } };
  }

  // ---- トラッシュ → デッキ（全回収+シャッフル）----
  if ((t.includes('トラッシュ') || t.includes('トラッシュにある')) &&
      (t.includes('デッキに加え') || t.includes('デッキに戻し')) &&
      (t.includes('シャッフル') || t.includes('シャッフルする'))) {
    const all = t.includes('すべて') || t.includes('全て') || t.includes('全部');
    const count = all ? 'ALL' : 1;
    return {
      type: 'TRANSFER_TO_DECK',
      source: { type: 'TRASH_CARD', owner: 'self', count },
      shuffle: true,
    } as TransferToDeckAction;
  }

  // ---- エナゾーン → 手札 ----
  if (t.includes('エナゾーンから') && t.includes('手札に加える')) {
    const upToM = t.match(/([０-９\d]+)枚まで/);
    const cM = t.match(/([０-９\d]+)枚を対象/);
    const count = upToM ? parseNum(upToM[1]) : (cM ? parseNum(cM[1]) : 1);
    return { type: 'TRANSFER_TO_HAND', source: { type: 'ENERGY_CARD', owner: 'self', count, upToCount: !!upToM } };
  }

  // ---- デッキ上を見て並び替え ----
  if (t.includes('デッキの上からカードを') && (t.includes('見て') || t.includes('見る')) &&
      (t.includes('デッキの一番上に戻す') || t.includes('デッキの一番下に置き'))) {
    const cM = t.match(/カードを([０-９\d]+)枚見/);
    const toBottom = t.includes('デッキの一番下に置き');
    return {
      type: 'LOOK_AND_REORDER',
      source: { location: 'deck', owner: 'self' },
      count: cM ? parseNum(cM[1]) : 3,
      private: true,
      reorder: t.includes('好きな順番'),
      canTrash: t.includes('トラッシュに置き'),
      destination: { location: 'deck', owner: 'self', position: toBottom ? 'bottom' : 'top' },
    };
  }

  // ---- デッキ一番上を見る（1枚確認）----
  if (t.match(/デッキの一番上を見る/)) {
    return {
      type: 'LOOK_AND_REORDER',
      source: { location: 'deck', owner: 'self' },
      count: 1, private: true, reorder: false,
      destination: { location: 'deck', owner: 'self', position: 'top' },
    };
  }

  // ---- ライフクロスに加える ----
  if (t.includes('ライフクロスに加える') || t.includes('ライフクロスに置く')) {
    const cM = t.match(/カードを([０-９\d]+)枚/);
    return { type: 'ADD_TO_LIFE', owner: 'self', count: cM ? parseNum(cM[1]) : 1, fromTop: true };
  }

  // ---- ライフクロスをクラッシュ ----
  if (t.includes('ライフクロス') && t.includes('クラッシュ')) {
    const op = t.includes('対戦相手');
    const cM = t.match(/([０-９\d]+)枚をクラッシュ/) ?? t.match(/ライフクロス([０-９\d]+)枚/);
    return { type: 'LIFE_CRASH', owner: op ? 'opponent' : 'self', count: cM ? parseNum(cM[1]) : 1, triggerBurst: true };
  }

  // ---- エナゾーンから場に出す ----
  if (t.includes('エナゾーンから') && t.includes('場に出す')) {
    return { type: 'ADD_TO_FIELD', owner: 'self' };
  }

  // ---- このシグニをトラッシュから場に出す（自己蘇生）----
  if (t.match(/このシグニをトラッシュから場に出す/)) {
    return { type: 'ADD_TO_FIELD', owner: 'self', source: { type: 'TRASH_CARD', owner: 'self', count: 1 } };
  }

  // ---- トラッシュからシグニを場に出す ----
  if (t.includes('トラッシュから') && (t.includes('場に出す') || t.includes('場に出してもよい'))) {
    const filter: TargetFilter = {
      cardType: 'シグニ',
      ...parseLevelFilter(t),
      ...parseColorFilter(t),
      ...parseStoryFilter(t),
    };
    const upToM = t.match(/([０-９\d]+)枚まで/);
    const countM = t.match(/([０-９\d]+)枚を対象/);
    const count = upToM ? parseNum(upToM[1]) : (countM ? parseNum(countM[1]) : 1);
    return { type: 'ADD_TO_FIELD', owner: 'self', source: { type: 'TRASH_CARD', owner: 'self', count, upToCount: !!upToM, filter } };
  }

  // ---- 場に出す（デッキ上から / 手札から など）----
  if (t.includes('場に出してもよい') || (t.includes('場に出す') && !t.includes('エナ') && !t.includes('トラッシュ'))) {
    return { type: 'ADD_TO_FIELD', owner: 'self' };
  }

  // ---- 効果耐性付与（「対戦相手の〜の効果を受けない」）----
  if (t.includes('効果を受けない')) {
    const from: string[] = [];
    if (t.includes('ルリグ')) from.push('ルリグ');
    if (t.match(/シグニの効果|シグニとシグニ|シグニ以外/)) from.push('シグニ');
    if (t.includes('スペル')) from.push('スペル');
    if (t.includes('アーツ')) from.push('アーツ');
    if (from.length === 0) from.push('any');
    const signiFilter: TargetFilter = { cardType: 'シグニ', ...parseStoryFilter(t), ...parsePowerFilter(t) };
    const hasFilter = signiFilter.story || signiFilter.powerRange;
    const target: EffectTarget = hasFilter
      ? { type: 'SIGNI', owner: 'self', count: 'ALL', filter: signiFilter }
      : { type: 'SIGNI', owner: 'self', count: 'ALL' };
    return { type: 'GRANT_PROTECTION', target, from, sourceOwner: 'opponent', duration: 'PERMANENT' } as GrantProtectionAction;
  }

  // ---- チアガール変換 ----
  if (t.includes('チアガールにする')) {
    const owner: Owner = t.includes('対戦相手') ? 'opponent' : 'self';
    const target: EffectTarget = t.includes('このシグニ')
      ? { type: 'SIGNI', owner: 'self', count: 1 }
      : { type: 'SIGNI', owner, count: 1 };
    return { type: 'GRANT_KEYWORD', target, keyword: 'チアガール', duration: 'PERMANENT' };
  }

  // ---- 強制攻撃 ----
  if (t.includes('可能ならばアタックしなければならない')) {
    const target: Owner = t.includes('対戦相手') ? 'opponent' : 'self';
    return { type: 'FORCE_SIGNI_ATTACK', targetOwner: target } as ForceSigniAttackAction;
  }

  // ---- チャーム除去 ----
  if ((t.includes('チャーム】') || t.includes('【チャーム】')) && t.includes('トラッシュに置く')) {
    const isOpp = t.includes('対戦相手');
    const targetOwner: Owner = isOpp ? 'opponent' : 'self';
    const countM = t.match(/【チャーム】([１-９\d]+)枚/);
    const toHalf = (s: string) => s.replace(/[１-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFF11 + 0x31));
    const count: number | 'ALL' = countM ? (parseInt(toHalf(countM[1])) || 1) : 'ALL';
    return { type: 'REMOVE_CHARM', targetOwner, count } as RemoveCharmAction;
  }

  // ---- チャーム付与 ----
  if (t.includes('チャーム】にする') || t.includes('チャーム】にしてもよい')) {
    // チャーム付与先オーナー判定
    const toOwner: Owner = t.match(/対戦相手のシグニ.+【チャーム】/) ? 'opponent' : 'self';
    // チャームの出所判定
    const charmIsTopOfDeck = t.includes('デッキの一番上のカード') || t.includes('デッキの上からカード');
    const charmFromTrash = t.includes('トラッシュから');
    const charmIsSelf = (t.includes('このシグニをそれの') || t.includes('このシグニを')) && !charmIsTopOfDeck && !charmFromTrash;
    const charmIsThisCard = t.includes('このカードをそれの') || t.includes('このカードを');
    // チャームの出所オーナー
    const charmOwner: Owner = t.includes('対戦相手のデッキ') || t.includes('対戦相手のトラッシュ') ? 'opponent' : 'self';
    const charm: EffectTarget = charmIsTopOfDeck
      ? { type: 'DECK_CARD', owner: charmOwner, count: 1 }
      : charmFromTrash
        ? { type: 'TRASH_CARD', owner: charmOwner, count: 1, filter: parseStoryFilter(t) as TargetFilter }
        : charmIsSelf || charmIsThisCard
          ? { type: 'SIGNI', owner: 'self', count: 1 }
          : { type: 'SIGNI', owner: 'self', count: 1 };
    const toTarget: EffectTarget = { type: 'SIGNI', owner: toOwner, count: 1 };
    return { type: 'ATTACH_CHARM', charm, to: toTarget } as AttachCharmAction;
  }

  // ---- キーワード能力（スタンドアロン形式：【XXX】（説明）or 【XXX】のみ）----
  // 【マルチエナ】など CONTINUOUS 効果として記載されるキーワード能力
  {
    const saM = t.match(/^【([^】]+)】[（(]?/);
    if (saM && !['常','出','起','自','ガード','エナチャージ'].includes(saM[1]) && !saM[1].match(/^エナチャージ/)) {
      const dur: EffectDuration = t.includes('ターン終了時まで') ? 'UNTIL_END_OF_TURN' : 'PERMANENT';
      const target: EffectTarget = { type: 'SIGNI', owner: 'self', count: 1 };
      return { type: 'GRANT_KEYWORD', target, keyword: saM[1], duration: dur };
    }
  }

  // ---- 引用符キーワード効果付与（「【常】：XXX」を得る）----
  const grantQuotedM = t.match(/を対象とし、ターン終了時まで、それは「【常】：(.+?)。?」を得る/);
  if (grantQuotedM) {
    const keyword = grantQuotedM[1].replace(/。$/, '');
    const owner: Owner = t.includes('対戦相手') ? 'opponent' : 'self';
    const target: EffectTarget = t.includes('シグニ') && t.includes('センタールリグ')
      ? { type: 'SIGNI', owner, count: 1 } // ルリグかシグニ → 近似でSIGNI
      : t.includes('シグニ')
        ? parseSigniTarget(t, owner)
        : { type: 'LRIG', owner, count: 1 };
    return { type: 'GRANT_KEYWORD', target, keyword, duration: 'UNTIL_END_OF_TURN' };
  }

  // ---- コイン獲得（《コインアイコン》を得る）----
  if (t.match(/《コインアイコン》/) && t.includes('を得る')) {
    const count = (t.match(/《コインアイコン》/g) ?? []).length;
    return { type: 'GAIN_COIN', owner: 'self', count };
  }

  // ---- キーワード能力付与（【ランサー】【ダブルクラッシュ】など）----
  if (t.includes('を得る') || t.includes('を持つ')) {
    const kwM = t.match(/【([^】]+)】/);
    if (kwM && !['常','出','起','自','ガード'].includes(kwM[1])) {
      const dur: EffectDuration = t.includes('ターン終了時まで') ? 'UNTIL_END_OF_TURN' : 'PERMANENT';
      // エナゾーンのカード全体 or シグニ or ルリグ
      const target: EffectTarget = t.includes('エナゾーンにあるカード') || t.includes('エナゾーンのカード')
        ? { type: 'ENERGY_CARD', owner: 'self', count: 'ALL' }
        : t.includes('このシグニ') ? { type: 'SIGNI', owner: 'self', count: 1 }
        : t.includes('センタールリグ') ? { type: 'LRIG', owner: 'self', count: 1 }
        : { type: 'SIGNI', owner: 'any', count: 1 };
      return { type: 'GRANT_KEYWORD', target, keyword: kwM[1], duration: dur };
    }
  }

  // ---- 【ガード】キーワード（説明文はスキップ）----
  if (t.startsWith('【ガード】')) {
    return { type: 'UNKNOWN', raw: '【ガード】（ルール処理済み）' };
  }

  // ---- アーツ使用禁止 ----
  if (t.match(/対戦相手はアーツを使用できない/)) {
    const until: BlockActionAction['until'] = t.includes('次のターン') ? 'NEXT_TURN'
      : t.includes('このターン') ? 'END_OF_TURN' : 'PERMANENT';
    return { type: 'BLOCK_ACTION', target: { type: 'PLAYER', owner: 'opponent', count: 1 }, actionId: 'USE_ARTS', until };
  }

  // ---- スペル使用禁止 ----
  if (t.match(/対戦相手はスペルを使用できない/)) {
    const until: BlockActionAction['until'] = t.includes('次のターン') ? 'NEXT_TURN' : 'PERMANENT';
    return { type: 'BLOCK_ACTION', target: { type: 'PLAYER', owner: 'opponent', count: 1 }, actionId: 'USE_SPELL', until };
  }

  // ---- エナフェイズスキップ（対戦相手）----
  if (t.match(/対戦相手は自分のエナフェイズをスキップする/)) {
    return { type: 'BLOCK_ACTION', target: { type: 'PLAYER', owner: 'opponent', count: 1 }, actionId: 'ENERGY', until: 'NEXT_TURN' };
  }

  // ---- このシグニはアタックできない（CONTINUOUS）----
  if (t.match(/このシグニはアタックできない/)) {
    return { type: 'BLOCK_ACTION', target: { type: 'PLAYER', owner: 'self', count: 1 }, actionId: 'ATTACK_SIGNI_SELF', until: 'PERMANENT' };
  }

  // ---- ガード制限（このターン、レベルN以下はガードできない）----
  const guardLvM = t.match(/対戦相手.*レベル([０-９\d]+)以下のシグニで【ガード】ができない/);
  if (guardLvM) {
    const lv = parseNum(guardLvM[1]);
    return { type: 'BLOCK_ACTION', target: { type: 'PLAYER', owner: 'opponent', count: 1 }, actionId: `GUARD_MAX_LV${lv}`, until: 'END_OF_TURN' };
  }

  // ---- ライフクロス → トラッシュ ----
  if (t.match(/ライフクロス.*トラッシュに置く/) || t.match(/ライフクロス.*を捨てる/)) {
    const cM = t.match(/([０-９\d]+)枚/);
    return { type: 'LIFE_CRASH', owner: 'self', count: cM ? parseNum(cM[1]) : 1, triggerBurst: false };
  }

  // ---- 手札をすべて捨てる ----
  if (t.match(/手札をすべて捨てる/) || t.match(/手札を全て捨てる/)) {
    return { type: 'TRASH', target: { type: 'HAND_CARD', owner: 'self', count: 'ALL' } };
  }

  // ---- 自分のシグニを場からトラッシュ（ストーリー・色フィルタ付き）----
  if (t.match(/あなたの.+シグニ.+場からトラッシュに置く/) && !t.includes('対戦相手')) {
    const filter: TargetFilter = { cardType: 'シグニ', ...parseStoryFilter(t), ...parseColorFilter(t) };
    const upToM = t.match(/好きな数/);
    const cM = t.match(/([０-９\d]+)体/);
    const count = upToM ? 'ALL' : (cM ? parseNum(cM[1]) : 1);
    return { type: 'TRASH', target: { type: 'SIGNI', owner: 'self', count, filter } };
  }

  // ---- 各プレイヤーは自分のシグニをトラッシュ ----
  if (t.match(/各プレイヤーは自分のシグニ.*トラッシュに置く/)) {
    return { type: 'SEQUENCE', steps: [
      { type: 'TRASH', target: { type: 'SIGNI', owner: 'self', count: 1 } },
      { type: 'TRASH', target: { type: 'SIGNI', owner: 'opponent', count: 1 } },
    ] };
  }

  // ---- ライフクロス → 手札 ----
  if (t.match(/ライフクロス/) && t.match(/手札に加える/)) {
    const cM = t.match(/([０-９\d]+)枚/);
    return { type: 'TRANSFER_TO_HAND', source: { type: 'LIFE_CLOTH_CARD', owner: 'self', count: cM ? parseNum(cM[1]) : 1 } };
  }

  // ---- このシグニを手札に加える（自己バウンス）----
  if (t.match(/このシグニを手札に加える/)) {
    return { type: 'BOUNCE', target: { type: 'SIGNI', owner: 'self', count: 1 } };
  }

  // ---- このシグニを場からトラッシュに置く（自己トラッシュ）----
  if (t.match(/^このシグニを場からトラッシュに置く/)) {
    return { type: 'TRASH', target: { type: 'SIGNI', owner: 'self', count: 1 } };
  }

  // ---- 自分のすべてのシグニをトラッシュ（任意）----
  if (t.match(/あなたのすべてのシグニを場からトラッシュに置いてもよい/)) {
    return { type: 'TRASH', target: { type: 'SIGNI', owner: 'self', count: 'ALL' } };
  }

  // ---- 自分のXかYのシグニを好きな数トラッシュ ----
  if (t.match(/あなたの.+のシグニを好きな数対象とし.*トラッシュに置く/)) {
    const filter: TargetFilter = { cardType: 'シグニ', ...parseStoryFilter(t) };
    return { type: 'TRASH', target: { type: 'SIGNI', owner: 'self', count: 'ALL', upToCount: true, filter } };
  }

  // ---- シグニをデッキに戻す ----
  if (t.includes('デッキに戻す') || t.includes('デッキに戻し')) {
    const owner: Owner = t.includes('対戦相手') ? 'opponent' : 'self';
    const filter: TargetFilter = { cardType: 'シグニ', ...parseLevelFilter(t) };
    return { type: 'TRANSFER_TO_DECK', source: { type: 'SIGNI', owner, count: 1, filter }, shuffle: false } as TransferToDeckAction;
  }

  // ---- デッキの一番上を公開する（単独文） ----
  {
    const deckTopM = t.match(/^(?:あなたの|対戦相手の)?デッキの一番上を公開する$/);
    if (deckTopM) {
      const owner: Owner = t.includes('対戦相手') ? 'opponent' : 'self';
      return {
        type: 'LOOK_AND_REORDER',
        source: { location: 'deck', owner },
        count: 1,
        private: false,
        reorder: false,
        destination: { location: 'deck', owner, position: 'top' },
      };
    }
  }

  // ---- それを手札に加える（REVEAL_AND_PICK の then、またはデッキトップ公開後の処理）----
  if (t.match(/^それを手札に加える$/)) {
    return { type: 'TRANSFER_TO_HAND', source: { type: 'DECK_CARD', owner: 'self', count: 1 } };
  }
  // ---- それをエナゾーンに置く（REVEAL後の処理）----
  if (t.match(/^それをエナゾーンに置く$/)) {
    return { type: 'ENERGY_CHARGE', target: { type: 'DECK_CARD', owner: 'self', count: 1 } } as EnergyChargeAction;
  }
  // ---- それを場からトラッシュに置く ----
  if (t.match(/^それを場からトラッシュに置く$/) || t.match(/^それをトラッシュに置く$/)) {
    return { type: 'BANISH', target: { type: 'SIGNI', owner: 'any', count: 1 } };
  }
  // ---- それらを場からトラッシュに置く ----
  if (t.match(/^それらを場からトラッシュに置く$/) || t.match(/^それらをトラッシュに置く$/)) {
    return { type: 'BANISH', target: { type: 'SIGNI', owner: 'any', count: 'ALL' } };
  }

  // ---- 残りをシャッフルして/好きな順番でデッキへ（LOOK/REVEALの後続フラグメント）----
  if (t.match(/^残りをシャッフルして(?:デッキの一番下に置く|デッキに戻す)/)) {
    return { type: 'SHUFFLE_DECK', owner: 'self' };
  }
  if (t.match(/^残りを好きな順番でデッキの一番下に置く/)) {
    return {
      type: 'LOOK_AND_REORDER',
      source: { location: 'deck', owner: 'self' },
      count: 0,
      private: true,
      reorder: true,
      destination: { location: 'deck', owner: 'self', position: 'bottom' },
    };
  }
  if (t.match(/^残りをデッキの一番下に置く/)) {
    return {
      type: 'LOOK_AND_REORDER',
      source: { location: 'deck', owner: 'self' },
      count: 0,
      private: true,
      reorder: false,
      destination: { location: 'deck', owner: 'self', position: 'bottom' },
    };
  }

  // ---- デッキ上公開 / 見る（単独 or シャッフル付き）----
  const deckLookM = t.match(/デッキの上からカードを([０-９\d]+)枚(?:公開する|見る|公開し)/);
  if (deckLookM) {
    return {
      type: 'LOOK_AND_REORDER',
      source: { location: 'deck', owner: 'self' },
      count: parseNum(deckLookM[1]),
      private: !t.includes('公開'),
      reorder: t.includes('好きな順番'),
      canTrash: t.includes('トラッシュに置き') || t.includes('トラッシュに置いてもよい'),
      destination: { location: 'deck', owner: 'self', position: 'top' },
    };
  }

  // ---- それをトラッシュに置く（コンテキスト依存）----
  if (t.match(/^それをトラッシュに置く/) || t.match(/^それらをトラッシュに置く/)) {
    const all = t.includes('それら');
    return { type: 'TRASH', target: { type: 'SIGNI', owner: 'opponent', count: all ? 'ALL' : 1 } };
  }

  // ---- デッキをシャッフルする（単独）----
  if (t.match(/デッキをシャッフルする|自分のデッキをシャッフルする/)) {
    const owner: Owner = t.includes('対戦相手') ? 'opponent' : 'self';
    return { type: 'SHUFFLE_DECK', owner };
  }

  // ---- 手札から<X>のシグニを１枚捨てる（コスト・追加コスト）----
  const handDiscardStoryM = t.match(/^手札から.+シグニ.+捨てる$/);
  if (handDiscardStoryM) {
    const filter: TargetFilter = { cardType: 'シグニ', ...parseStoryFilter(t), ...parseColorFilter(t) };
    const cM = t.match(/([０-９\d]+)枚/);
    return { type: 'TRASH', target: { type: 'HAND_CARD', owner: 'self', count: cM ? parseNum(cM[1]) : 1, filter } };
  }

  // ---- デッキの一番上のカードをエナゾーンに加える（単独）----
  if (t.match(/デッキの一番上のカードをエナゾーンに(?:加える|置く)/)) {
    return { type: 'ENERGY_CHARGE_FROM_DECK', owner: 'self', count: 1 };
  }

  // ---- 対戦相手のシグニをトラッシュに置く（対戦相手が対象を選ぶパターン）----
  if (t.match(/対戦相手は.*自分のシグニ.*トラッシュに置く/)) {
    return { type: 'TRASH', target: { type: 'SIGNI', owner: 'opponent', count: 1 } };
  }

  // ---- デッキからサーチしてトラッシュへ ----
  if (t.includes('デッキから') && t.includes('探して') && t.includes('トラッシュに置く')) {
    const filter: TargetFilter = { cardType: 'シグニ', ...parseLevelFilter(t), ...parseStoryFilter(t) };
    return { type: 'SEARCH', from: { location: 'deck', owner: 'self' }, filter, maxCount: 1, then: { type: 'TRASH', target: { type: 'DECK_CARD', owner: 'self', count: 1 } } };
  }

  // ---- シグニの【出】能力の発動を止める ----
  if (t.match(/シグニの【出】能力は発動しない/)) {
    const owner: Owner = t.includes('対戦相手') ? 'opponent' : 'self';
    return { type: 'BLOCK_ACTION', target: { type: 'PLAYER', owner, count: 1 }, actionId: 'ON_PLAY_ABILITY', until: 'END_OF_TURN' };
  }

  // ---- 基本レベルをNにする ----
  const baseLevelM = t.match(/基本レベルは([０-９\d]+)になる/) ?? t.match(/基本レベルを([０-９\d]+)にする/);
  if (baseLevelM) {
    const owner: Owner = t.includes('対戦相手') ? 'opponent' : 'self';
    const until: BlockActionAction['until'] = t.includes('次のターン') ? 'NEXT_TURN' : 'END_OF_TURN';
    return { type: 'BLOCK_ACTION', target: { type: 'SIGNI', owner, count: t.includes('すべて') || t.includes('場にあるシグニ') ? 'ALL' : 1 }, actionId: `SET_LEVEL_${toHalf(baseLevelM[1])}`, until };
  }

  // ---- このシグニはバニッシュされない（耐性）----
  if (t.match(/バニッシュされない/)) {
    const from: string[] = [];
    if (t.includes('シグニの効果')) from.push('シグニ');
    if (t.includes('ルリグの効果') || t.includes('ルリグによって')) from.push('ルリグ');
    if (t.includes('スペルの効果') || t.includes('スペルによって')) from.push('スペル');
    if (t.includes('アーツの効果') || t.includes('アーツによって')) from.push('アーツ');
    if (from.length === 0) from.push('BANISH');
    return {
      type: 'GRANT_PROTECTION',
      target: { type: 'SIGNI', owner: 'self', count: 1 },
      from,
      sourceOwner: 'opponent',
      duration: 'PERMANENT',
    } as GrantProtectionAction;
  }

  // ---- ゲームから除外する ----
  if (t.match(/ゲームから除外する/)) {
    const owner: Owner = t.includes('対戦相手') ? 'opponent' : 'self';
    const isHand = t.includes('手札');
    const isEnergy = t.includes('エナゾーン');
    if (isHand && isEnergy) {
      return { type: 'SEQUENCE', steps: [
        { type: 'TRASH', target: { type: 'HAND_CARD', owner, count: 'ALL' } },
        { type: 'TRASH', target: { type: 'ENERGY_CARD', owner, count: 'ALL' } },
      ] };
    }
    const count = t.includes('すべて') ? 'ALL' : (t.match(/([０-９\d]+)枚まで/) ? parseNum(t.match(/([０-９\d]+)枚まで/)![1]) : 1);
    const srcType = isHand ? 'HAND_CARD' : isEnergy ? 'ENERGY_CARD' : 'TRASH_CARD';
    return { type: 'TRASH', target: { type: srcType as EffectTarget['type'], owner, count } };
  }

  // ---- 対戦相手のすべてのシグニをトラッシュに置く ----
  if (t.match(/対戦相手のすべてのシグニをトラッシュに置く/)) {
    return { type: 'TRASH', target: { type: 'SIGNI', owner: 'opponent', count: 'ALL' } };
  }

  // ---- デッキの一番上のカードをトラッシュに置く ----
  if (t.match(/デッキの一番上のカードをトラッシュに置く/) || t.match(/あなたのデッキの一番上のカードをトラッシュに置く/)) {
    const cM = t.match(/([０-９\d]+)枚/);
    const count = cM ? parseNum(cM[1]) : 1;
    return { type: 'TRASH', target: { type: 'DECK_CARD', owner: 'self', count } };
  }

  // ---- シグニをデッキの一番下に置く ----
  if (t.match(/デッキの一番下に置く/) && (t.includes('シグニ') || t.includes('それ'))) {
    const owner: Owner = t.includes('対戦相手') ? 'opponent' : 'self';
    const cM = t.match(/([０-９\d]+)体/);
    const count = cM ? parseNum(cM[1]) : 1;
    return {
      type: 'TRANSFER_TO_DECK',
      source: { type: 'SIGNI', owner, count, filter: { cardType: 'シグニ' } },
      shuffle: false,
      position: 'bottom',
    } as import('../types/effects').TransferToDeckAction;
  }

  // ---- あなたの他のシグニ１体をトラッシュ（コスト系効果）----
  if (t.match(/あなたの他のシグニ.+をトラッシュに置く/)) {
    const cM = t.match(/([０-９\d]+)体/);
    return { type: 'TRASH', target: { type: 'SIGNI', owner: 'self', count: cM ? parseNum(cM[1]) : 1 } };
  }

  // ---- 対戦相手にダメージを与える（直接ライフクラッシュ）----
  if (t.match(/対戦相手にダメージを与える/)) {
    return { type: 'LIFE_CRASH', owner: 'opponent', count: 1, triggerBurst: true };
  }

  // ---- このターン／次にスペルを使用する場合コスト減 ----
  if (t.match(/次に.*スペルを使用する場合.*コストは.*減る/)) {
    const costs = parseEnergyCosts(t);
    return {
      type: 'COST_REDUCTION',
      targetCardType: 'スペル',
      reduction: costs.length > 0 ? costs : [{ color: '無', count: 1 }],
      duration: 'UNTIL_END_OF_TURN',
    } as CostReductionAction;
  }

  // ---- 対戦相手の手札を見てN枚選び捨てさせる ----
  {
    const hvdM = t.match(/対戦相手の手札を見て([０-９\d]+)枚選び/);
    if (hvdM) {
      return { type: 'TRASH', target: { type: 'HAND_CARD', owner: 'opponent', count: parseNum(hvdM[1]) } };
    }
    if (t.match(/対戦相手の手札を見て.*カード.*選び.*捨てさせる/)) {
      return { type: 'TRASH', target: { type: 'HAND_CARD', owner: 'opponent', count: 1 } };
    }
  }

  // ---- シグニをデッキの一番上に置く ----
  if (t.match(/それをデッキの一番上に置く/) || t.match(/シグニ.+をデッキの一番上に置く/)) {
    const owner: Owner = t.includes('対戦相手') ? 'opponent' : 'self';
    return { type: 'TRANSFER_TO_DECK', source: { type: 'SIGNI', owner, count: 1, filter: { cardType: 'シグニ' } }, shuffle: false } as TransferToDeckAction;
  }

  // ---- 対戦相手は自分のデッキの一番上を公開する ----
  if (t.match(/対戦相手は自分のデッキの一番上を公開する/)) {
    return {
      type: 'LOOK_AND_REORDER',
      source: { location: 'deck', owner: 'opponent' },
      count: 1, private: false, reorder: false,
      destination: { location: 'deck', owner: 'opponent', position: 'top' },
    };
  }

  // ---- CONTINUOUS: このシグニのパワーはあなたの場にいるルリグ N体につき±N（ルリグ参照）----
  {
    const m = t.match(/このシグニのパワーは(あなた|対戦相手)の場に(?:いる|ある)(?:他の)?(.+?)のルリグ(?:[０-９\d]+)?体?につき([＋－])([０-９\d]+)され/);
    if (m) {
      const countOwner: Owner = m[1] === '対戦相手' ? 'opponent' : 'self';
      const sign = m[3] === '＋' ? 1 : -1;
      return {
        type: 'POWER_MODIFY_PER_FIELD',
        target: { type: 'SIGNI', owner: 'self', count: 1 },
        deltaPerUnit: sign * parseNum(m[4]),
        countFilter: { cardType: 'ルリグ', ...parseColorFilter(m[2]), ...parseStoryFilter(m[2]) },
        countOwner,
      } as PowerModifyPerFieldAction;
    }
  }

  // ---- CONTINUOUS: このシグニのパワーは他のシグニ N体につき±N（両プレイヤー参照）----
  {
    const m = t.match(/このシグニのパワーは他のシグニ(?:[０-９\d]+)?体?につき([＋－])([０-９\d]+)され/);
    if (m) {
      const sign = m[1] === '＋' ? 1 : -1;
      return {
        type: 'POWER_MODIFY_PER_FIELD',
        target: { type: 'SIGNI', owner: 'self', count: 1 },
        deltaPerUnit: sign * parseNum(m[2]),
        countFilter: { cardType: 'シグニ' },
        countOwner: 'any',
        excludeSelf: true,
      } as PowerModifyPerFieldAction;
    }
  }

  // ---- このシグニのパワーはあなたの場にある[他の]＜X＞のシグニ１体につき±Nされる ----
  const perFieldSelfM = t.match(/このシグニのパワーは(あなた|対戦相手)の場にある(?:他の)?(.+?)のシグニ(?:[０-９\d]+)?体?につき([＋－])([０-９\d]+)され/);
  if (perFieldSelfM) {
    const countOwner: Owner = perFieldSelfM[1] === '対戦相手' ? 'opponent' : 'self';
    const sign = perFieldSelfM[3] === '＋' ? 1 : -1;
    return {
      type: 'POWER_MODIFY_PER_FIELD',
      target: { type: 'SIGNI', owner: 'self', count: 1 },
      deltaPerUnit: sign * parseNum(perFieldSelfM[4]),
      countFilter: { cardType: 'シグニ', ...parseStoryFilter(perFieldSelfM[2]), ...parseColorFilter(perFieldSelfM[2]) },
      countOwner,
    } as PowerModifyPerFieldAction;
  }

  // ---- このシグニのパワーは対戦相手の場にあるシグニN体につき±Nされる（ストーリーなし）----
  const perFieldOppM = t.match(/このシグニのパワーは対戦相手の場にあるシグニ(?:[０-９\d]+)?体?につき([＋－])([０-９\d]+)され/);
  if (perFieldOppM) {
    const sign = perFieldOppM[1] === '＋' ? 1 : -1;
    return {
      type: 'POWER_MODIFY_PER_FIELD',
      target: { type: 'SIGNI', owner: 'self', count: 1 },
      deltaPerUnit: sign * parseNum(perFieldOppM[2]),
      countFilter: { cardType: 'シグニ' },
      countOwner: 'opponent',
    } as PowerModifyPerFieldAction;
  }

  // ---- 対戦相手の手札を見る ----
  if (t.match(/対戦相手の手札を見る/)) {
    return {
      type: 'LOOK_AND_REORDER',
      source: { location: 'hand', owner: 'opponent' },
      count: 99,
      private: true,
      reorder: false,
      destination: { location: 'hand', owner: 'opponent', position: 'top' },
    };
  }

  // ---- トラッシュからN枚エナゾーンに置く（フィルタあり・なし両対応）----
  {
    const trashToEnaM = t.match(/トラッシュからカードを([０-９\d]+)枚までを?対象とし、それら?をエナゾーンに置く/);
    if (trashToEnaM) {
      return {
        type: 'ENERGY_CHARGE',
        target: { type: 'TRASH_CARD', owner: 'self', count: parseNum(trashToEnaM[1]), upToCount: true },
      } as EnergyChargeAction;
    }
    // 汎用: トラッシュから(フィルタ)N枚を対象とし、それをエナゾーンに置く
    const trashToEnaG = t.match(/トラッシュから.{0,30}?([０-９\d]+)枚(まで)?を?対象とし、それら?をエナゾーンに置く/);
    if (trashToEnaG) {
      const filter: TargetFilter = { ...parseStoryFilter(t), ...parseColorFilter(t), ...parseLevelFilter(t) };
      if (t.includes('シグニ')) filter.cardType = 'シグニ';
      if (t.includes('スペル')) filter.cardType = 'スペル';
      return {
        type: 'ENERGY_CHARGE',
        target: { type: 'TRASH_CARD', owner: 'self', count: parseNum(trashToEnaG[1]), upToCount: !!trashToEnaG[2], filter: Object.keys(filter).length > 0 ? filter : undefined },
      } as EnergyChargeAction;
    }
  }

  // ---- エナゾーンからN枚まで手札に加える ----
  {
    const enaToHandM = t.match(/エナゾーンからカードを([０-９\d]+)枚まで対象とし、それら?を手札に加えてもよい/);
    if (enaToHandM) {
      return {
        type: 'TRANSFER_TO_HAND',
        source: { type: 'ENERGY_CARD', owner: 'self', count: parseNum(enaToHandM[1]), upToCount: true },
      };
    }
  }

  // ---- あなたの＜色＞のシグニの基本パワーをNにする ----
  {
    const colorPowerSetM = t.match(/あなたの([白赤青緑黒])のシグニの基本パワーを([０-９\d]+)にする/);
    if (colorPowerSetM) {
      return {
        type: 'POWER_SET',
        target: { type: 'SIGNI', owner: 'self', count: 'ALL', filter: { color: colorPowerSetM[1] } },
        value: parseNum(colorPowerSetM[2]),
      };
    }
  }

  // ---- 手札をN枚捨てる（自分）----
  {
    const selfDiscardM = t.match(/^あなたは手札を([０-９\d]+)枚捨てる$/);
    if (selfDiscardM) {
      return { type: 'TRASH', target: { type: 'HAND_CARD', owner: 'self', count: parseNum(selfDiscardM[1]) } };
    }
  }

  // ---- 対戦相手の場にあるすべての【チャーム】をトラッシュに置く ----
  if (t.match(/すべての【チャーム】をトラッシュに置く/)) {
    return { type: 'TRASH', target: { type: 'SIGNI', owner: 'opponent', count: 'ALL', filter: { hasCharm: true } as TargetFilter } };
  }

  // ---- パワーをターゲット自身のレベル×N変更 ----
  {
    const byTargetLevelM = t.match(/シグニ([０-９\d]+)体を対象とし.*それのパワーをそれのレベル([０-９\d]+)につき([＋－])([０-９\d]+)する/);
    if (byTargetLevelM) {
      const owner: Owner = t.includes('対戦相手') ? 'opponent' : 'self';
      const sign = byTargetLevelM[3] === '＋' ? 1 : -1;
      return {
        type: 'POWER_MODIFY_BY_TARGET_LEVEL',
        target: { type: 'SIGNI', owner, count: parseNum(byTargetLevelM[1]) },
        deltaPerLevel: sign * parseNum(byTargetLevelM[4]),
        until: 'UNTIL_END_OF_TURN',
      } as PowerModifyByTargetLevelAction;
    }
  }

  // ---- パワーをN倍にする ----
  {
    const multiplyM = t.match(/シグニ([０-９\d]+)体を対象とし.*それのパワーを([０-９\d]+)倍にする/);
    if (multiplyM) {
      const owner: Owner = t.includes('対戦相手') ? 'opponent' : 'self';
      return {
        type: 'POWER_MULTIPLY',
        target: { type: 'SIGNI', owner, count: parseNum(multiplyM[1]) },
        multiplier: parseNum(multiplyM[2]),
        until: 'UNTIL_END_OF_TURN',
      } as PowerMultiplyAction;
    }
  }

  // ---- レベルをN変更する ----
  {
    const levelModM = t.match(/シグニ([０-９\d]+)体を対象とし.*それのレベルを([＋－])([０-９\d]+)する/);
    if (levelModM) {
      const owner: Owner = t.includes('対戦相手') ? 'opponent' : 'self';
      const sign = levelModM[2] === '＋' ? 1 : -1;
      return {
        type: 'LEVEL_MODIFY',
        target: { type: 'SIGNI', owner, count: parseNum(levelModM[1]) },
        delta: sign * parseNum(levelModM[3]),
        until: 'UNTIL_END_OF_TURN',
      } as LevelModifyAction;
    }
    // このシグニのレベルをN変更する
    const selfLevelModM = t.match(/このシグニのレベルを([＋－])([０-９\d]+)する/);
    if (selfLevelModM) {
      const sign = selfLevelModM[1] === '＋' ? 1 : -1;
      return {
        type: 'LEVEL_MODIFY',
        target: { type: 'SIGNI', owner: 'self', count: 1 },
        delta: sign * parseNum(selfLevelModM[2]),
        until: 'UNTIL_END_OF_TURN',
      } as LevelModifyAction;
    }
  }

  // ---- チャーム枚数比例パワー変更（フィールド上）----
  {
    const perCharmM = t.match(/シグニ([０-９\d]+)体を対象とし.*それのパワーを場にある【チャーム】([０-９\d]+)枚につき([＋－])([０-９\d]+)する/);
    if (perCharmM) {
      const owner: Owner = t.includes('対戦相手') ? 'opponent' : 'self';
      const sign = perCharmM[3] === '＋' ? 1 : -1;
      return {
        type: 'POWER_MODIFY_PER_CHARM',
        target: { type: 'SIGNI', owner, count: parseNum(perCharmM[1]) },
        deltaPerCharm: sign * parseNum(perCharmM[4]),
        sourceOwner: t.includes('対戦相手のシグニN体') ? 'any' : 'any',
        sourceLocation: 'field',
        until: 'UNTIL_END_OF_TURN',
      } as PowerModifyPerCharmAction;
    }
    const oppCharmM = t.match(/対戦相手のシグニのパワーを、対戦相手の場にある【チャーム】([０-９\d]+)枚につき([＋－])([０-９\d]+)する/);
    if (oppCharmM) {
      const sign = oppCharmM[2] === '＋' ? 1 : -1;
      return {
        type: 'POWER_MODIFY_PER_CHARM',
        target: { type: 'SIGNI', owner: 'opponent', count: 'ALL' },
        deltaPerCharm: sign * parseNum(oppCharmM[3]),
        sourceOwner: 'opponent',
        sourceLocation: 'field',
        until: 'UNTIL_END_OF_TURN',
      } as PowerModifyPerCharmAction;
    }
    // この方法でトラッシュに置いたシグニのレベル合計×N
    const perTrashedLevelM = t.match(/シグニ([０-９\d]+)体を対象とし.*それのパワーをこの方法でトラッシュに置いたシグニのレベル([０-９\d]+)につき([＋－])([０-９\d]+)/);
    if (perTrashedLevelM) {
      const owner: Owner = t.includes('対戦相手') ? 'opponent' : 'self';
      const sign = perTrashedLevelM[3] === '＋' ? 1 : -1;
      return {
        type: 'POWER_MODIFY_PER_TRASHED_LEVEL',
        target: { type: 'SIGNI', owner, count: parseNum(perTrashedLevelM[1]) },
        deltaPerLevel: sign * parseNum(perTrashedLevelM[4]),
        until: 'UNTIL_END_OF_TURN',
      } as PowerModifyPerTrashedLevelAction;
    }
    // この方法でトラッシュに置いたチャーム枚数×N
    const perTrashedCharmM = t.match(/シグニ([０-９\d]+)体を対象とし.*それのパワーをこの方法でトラッシュに置いた【チャーム】([０-９\d]+)枚につき([＋－])([０-９\d]+)/);
    if (perTrashedCharmM) {
      const owner: Owner = t.includes('対戦相手') ? 'opponent' : 'self';
      const sign = perTrashedCharmM[3] === '＋' ? 1 : -1;
      return {
        type: 'POWER_MODIFY_PER_CHARM',
        target: { type: 'SIGNI', owner, count: parseNum(perTrashedCharmM[1]) },
        deltaPerCharm: sign * parseNum(perTrashedCharmM[4]),
        sourceOwner: owner,
        sourceLocation: 'trashed_this_effect',
        until: 'UNTIL_END_OF_TURN',
      } as PowerModifyPerCharmAction;
    }
  }

  // ---- エナゾーンカード枚数比例パワー変更（常時）----
  {
    const perEnergyM = t.match(/このシグニのパワーはあなたのエナゾーンにあるカード([０-９\d]+)枚につき([＋－])([０-９\d]+)され/);
    if (perEnergyM) {
      const sign = perEnergyM[2] === '＋' ? 1 : -1;
      return {
        type: 'POWER_MODIFY_PER_ENERGY',
        target: { type: 'SIGNI', owner: 'self', count: 1 },
        deltaPerCard: sign * parseNum(perEnergyM[3]),
        energyOwner: 'self',
      } as PowerModifyPerEnergyAction;
    }
  }

  // ---- ダメージを受けない ----
  if (t.match(/あなたはダメージを受けない/)) {
    return { type: 'PREVENT_DAMAGE', owner: 'self', until: 'UNTIL_END_OF_TURN' } as PreventDamageAction;
  }

  // ---- 次のターンの間、対戦相手のルリグはダメージを与えない ----
  if (t.match(/次の.*ターンの間、対戦相手のルリグはあなたにダメージを与えない/)) {
    return { type: 'PREVENT_DAMAGE', owner: 'self', until: 'NEXT_TURN' } as PreventDamageAction;
  }

  // ---- シグニの位置交換 ----
  if (t.match(/あなたの他のシグニ[０-９\d]*体を対象とし、それとこのシグニの場所を入れ替える/)) {
    return {
      type: 'REARRANGE_SIGNI',
      target: { type: 'SIGNI', owner: 'self', count: 1 },
      swap: true,
    } as RearrangeSigniAction;
  }

  // ---- エナゾーンをN枚に均等化 ----
  {
    const equalizeM = t.match(/自分のエナゾーンのカードが([０-９\d]+)枚になるように/);
    if (equalizeM) {
      return { type: 'EQUALIZE_ENERGY', targetCount: parseNum(equalizeM[1]) } as EqualizeEnergyAction;
    }
  }

  // ---- 手札を任意枚捨て、捨てた枚数+N枚引く ----
  {
    const varDiscardM = t.match(/手札を好きな枚数捨て、捨てた枚数に([０-９\d]+)を加えた枚数のカードを引く/);
    if (varDiscardM) {
      return { type: 'VARIABLE_DISCARD_AND_DRAW', drawBonus: parseNum(varDiscardM[1]), owner: 'self' } as VariableDiscardAndDrawAction;
    }
  }

  // ---- バニッシュの代替コスト（手札からスペルを捨てる）----
  {
    const banishSubstSpellM = t.match(/バニッシュされる場合、代わりに手札からスペルを([０-９\d]+)枚捨ててもよい/);
    if (banishSubstSpellM) {
      const count = parseNum(banishSubstSpellM[1]);
      const tgtCount = t.match(/あなたのシグニ([０-９\d]+)体が/);
      return {
        type: 'BANISH_SUBSTITUTE',
        trigger: { type: 'SIGNI', owner: 'self', count: tgtCount ? parseNum(tgtCount[1]) : 1 },
        substituteCost: { discardSpell: count },
        optional: true,
      } as BanishSubstituteAction;
    }
    // ---- バニッシュの代替コスト（下のスペルをトラッシュ）----
    const banishSubstStackM = t.match(/シグニ([０-９\d]+)体がバニッシュされる場合、代わりにこのシグニの下からスペル([０-９\d]+)枚をトラッシュに置いてもよい/);
    if (banishSubstStackM) {
      return {
        type: 'BANISH_SUBSTITUTE',
        trigger: { type: 'SIGNI', owner: 'self', count: parseNum(banishSubstStackM[1]) },
        substituteCost: { trashStackSpell: parseNum(banishSubstStackM[2]) },
        optional: true,
      } as BanishSubstituteAction;
    }
  }

  // ---- トラッシュからスペルをこのカードの下に置く ----
  {
    const stackSpellM = t.match(/トラッシュからスペルを([０-９\d]+)枚まで対象とし、それらをこのカードの下に置く/);
    if (stackSpellM) {
      return {
        type: 'STACK_SPELL',
        from: 'trash',
        filter: { cardType: 'スペル' },
        maxCount: parseNum(stackSpellM[1]),
      } as StackSpellAction;
    }
  }

  // ---- エナゾーンのカード色を継承 ----
  if (t.match(/エナゾーンにあるカードの色を追加で持つ/)) {
    return { type: 'COLOR_INHERIT', source: 'energy', owner: 'self' } as ColorInheritAction;
  }

  // ---- 条件付きディスカード（無色カードN枚捨てないかぎりM枚捨てる）----
  {
    const condDiscM = t.match(/対戦相手は無色のカードを([０-９\d]+)枚捨てないかぎり手札を([０-９\d]+)枚捨てる/);
    if (condDiscM) {
      return {
        type: 'CONDITIONAL_DISCARD',
        owner: 'opponent',
        avoidCount: parseNum(condDiscM[1]),
        avoidFilter: { color: '無' },
        elseCount: parseNum(condDiscM[2]),
      } as ConditionalDiscardAction;
    }
  }

  // ---- フィールドシグニ数+N枚エナチャージ ----
  {
    const enaByFieldM = t.match(/あなたの場にあるシグニの数に([０-９\d]+)を加えた枚数のカードをデッキの上からエナゾーンに置く/);
    if (enaByFieldM) {
      return { type: 'ENERGY_CHARGE_BY_FIELD_COUNT', owner: 'self', bonus: parseNum(enaByFieldM[1]) } as EnergyChargeByFieldCountAction;
    }
  }

  // ---- 対戦相手のデッキ上か/とライフクロス上を見る ----
  if (t.match(/対戦相手のデッキの一番上.*ライフクロスの一番上.*見る/)) {
    const mode = t.includes('か') ? 'either' : 'both';
    return { type: 'LOOK_AT_DECK_AND_LIFE', targetOwner: 'opponent', mode } as LookAtDeckAndLifeAction;
  }

  // ---- グロウコスト減少 ----
  {
    // コスト0（ライフ条件付き等）
    const growFreeCondM = t.match(/ライフクロスが([０-９\d]+)枚以下の場合.*グロウするためのコストは.*×0.*になる/);
    if (growFreeCondM) {
      return {
        type: 'CONDITIONAL',
        condition: { type: 'LIFE_COUNT', owner: 'self', operator: 'lte', value: parseNum(growFreeCondM[1]) },
        then: { type: 'GROW_FREE' } as GrowFreeAction,
      };
    }
    const growCostM = t.match(/(?:この?カードの上に)?グロウするためのコストは(.+)減る/);
    if (growCostM) {
      const costs = parseEnergyCosts(growCostM[1]);
      return { type: 'GROW_COST_REDUCTION', reduction: costs.length > 0 ? costs : [{ color: '無', count: 1 }] } as GrowCostReductionAction;
    }
  }

  // ---- 同名カード使用禁止 ----
  if (t.match(/対戦相手はそれと同じ名前のカードを使用できない/)) {
    return { type: 'NAME_BAN', targetSelf: true, duration: 'GAME' } as NameBanAction;
  }

  // ---- トラッシュからコスト以下のスペルを使用 ----
  {
    const playFreeM = t.match(/トラッシュからコストの合計が([０-９\d]+)以下の(.+?)スペル([０-９\d]+)枚を対象とし、それをコストを支払わずに使用してもよい/);
    if (playFreeM) {
      const colorFilter = parseStoryFilter(playFreeM[2]) as TargetFilter;
      return {
        type: 'PLAY_FREE_FROM_TRASH',
        costThreshold: parseNum(playFreeM[1]),
        filter: { cardType: 'スペル', ...colorFilter },
        maxCount: parseNum(playFreeM[3]),
      } as PlayFreeFromTrashAction;
    }
    // ルリグトラッシュからコスト以下のアーツを使用
    const lrigTrashArtsM = t.match(/ルリグトラッシュからコストの合計が([０-９\d]+)以下のアーツ([０-９\d]+)枚を対象とし、それをコストを支払わずに使用する/);
    if (lrigTrashArtsM) {
      return {
        type: 'PLAY_FREE_FROM_TRASH',
        costThreshold: parseNum(lrigTrashArtsM[1]),
        filter: { cardType: 'アーツ' },
        maxCount: parseNum(lrigTrashArtsM[2]),
      } as PlayFreeFromTrashAction;
    }
  }

  // ---- パワー閾値でトラッシュ ----
  {
    const powerThreshM = t.match(/このシグニのパワーが([０-９\d]+)以上になったとき、これをトラッシュに置く/);
    if (powerThreshM) {
      return { type: 'POWER_THRESHOLD_TRASH', threshold: parseNum(powerThreshM[1]), operator: 'gte' } as PowerThresholdTrashAction;
    }
  }

  // ---- パワーバフをデバフへ反転 ----
  if (t.match(/対戦相手のシグニのパワーが対戦相手の効果によって＋.*される場合、代わりに－.*される/)) {
    return {
      type: 'POWER_FLIP',
      target: { type: 'SIGNI', owner: 'opponent', count: 'ALL' },
      sourceOwner: 'opponent',
    } as PowerFlipAction;
  }

  // ---- 自分自身ではトラッシュに置けない ----
  if (t.match(/自分でこのシグニを場からトラッシュに置くことができない/)) {
    return { type: 'SELF_TRASH_PREVENT' } as SelfTrashPreventAction;
  }

  // ---- 代替コストで支払う（エナゾーンからこのシグニをトラッシュ）----
  {
    const costSubM = t.match(/《([^》]+)》を支払う際、代わりにあなたのエナゾーンからこのシグニをトラッシュに置いてもよい/);
    if (costSubM) {
      const origCost = parseEnergyCosts(`《${costSubM[1]}》`);
      return {
        type: 'COST_SUBSTITUTE',
        originalCost: origCost,
        substituteCost: { banish_self: true },
        optional: true,
      } as CostSubstituteAction;
    }
  }

  // ---- 自身の基本パワーはNになる（条件なし単独文）----
  {
    const basePowerM = t.match(/^このシグニの基本パワーは([０-９\d]+)になる$/);
    if (basePowerM) {
      return { type: 'POWER_SET', target: { type: 'SIGNI', owner: 'self', count: 1 }, value: parseNum(basePowerM[1]) };
    }
  }

  // ---- 無色ではないすべてのシグニをトラッシュ ----
  if (t.match(/無色ではないすべてのシグニをトラッシュに置く/)) {
    return { type: 'BANISH', target: { type: 'SIGNI', owner: 'any', count: 'ALL' } };
  }

  // ---- 対戦相手の場にあるすべての【チャーム】をトラッシュに置く ----
  if (t.match(/すべての【チャーム】をトラッシュに置く/)) {
    return { type: 'TRASH', target: { type: 'SIGNI', owner: 'opponent', count: 'ALL', filter: { hasCharm: true } as TargetFilter } };
  }

  // ---- 正面の１つ隣のシグニゾーンにもアタックできる（クロスアタック）----
  if (t.match(/このシグニは.*正面の[１-９\d]?つ隣.*シグニゾーンにもアタックできる/)) {
    return { type: 'GRANT_KEYWORD', target: { type: 'SIGNI', owner: 'self', count: 1 }, keyword: '側面アタック', duration: 'PERMANENT' } as GrantKeywordAction;
  }

  // ---- シグニアタックフェイズをスキップ ----
  if (t.match(/シグニアタックフェイズをスキップする/)) {
    return { type: 'BLOCK_ACTION', target: { type: 'PLAYER', owner: 'self', count: 1 }, actionId: 'SIGNI_ATTACK_PHASE', until: 'END_OF_TURN' };
  }

  // ---- 手札からパワーN以上のシグニを場に出せない ----
  {
    const blockPlayM = t.match(/対戦相手は手札からパワー([０-９\d]+)以上のシグニを場に出せない/);
    if (blockPlayM) {
      const until = t.includes('次の対戦相手のターン') ? 'END_OF_TURN' : 'END_OF_TURN';
      return {
        type: 'BLOCK_ACTION',
        target: { type: 'PLAYER', owner: 'opponent', count: 1 },
        actionId: `PLAY_SIGNI_POWER_${parseNum(blockPlayM[1])}_OR_MORE`,
        until,
        filter: { powerRange: { min: parseNum(blockPlayM[1]) } },
      } as BlockActionAction;
    }
  }

  // ---- 場にあるシグニの起動能力使用禁止 ----
  if (t.match(/対戦相手は場にあるシグニの【起】能力を使用できない/)) {
    const until = t.includes('ターン終了時') ? 'END_OF_TURN' : 'PERMANENT';
    return { type: 'BLOCK_ACTION', target: { type: 'PLAYER', owner: 'opponent', count: 1 }, actionId: 'SIGNI_ACTIVATED_ABILITY', until };
  }

  // ---- 各ターン1回しかアーツを使用できない ----
  if (t.match(/対戦相手は各ターンに一度しかアーツを使用できない/)) {
    return { type: 'BLOCK_ACTION', target: { type: 'PLAYER', owner: 'opponent', count: 1 }, actionId: 'ARTS_LIMIT_1', until: 'PERMANENT' };
  }

  // ---- スペル/カードをトラッシュからデッキの一番上に置く ----
  {
    const trashToDeckTopM = t.match(/トラッシュから(.+?)([０-９\d]+)枚を?対象とし、それ(?:ら)?を(?:対戦相手の)?デッキの一番上に置く/);
    if (trashToDeckTopM) {
      const owner: Owner = t.includes('対戦相手のトラッシュ') ? 'opponent' : 'self';
      const filter: TargetFilter = { ...parseStoryFilter(trashToDeckTopM[1]) };
      if (trashToDeckTopM[1].includes('スペル')) filter.cardType = 'スペル';
      if (trashToDeckTopM[1].includes('シグニ')) filter.cardType = 'シグニ';
      return {
        type: 'TRANSFER_TO_DECK',
        source: { type: 'TRASH_CARD', owner, count: parseNum(trashToDeckTopM[2]), filter: Object.keys(filter).length > 0 ? filter : undefined },
        shuffle: false,
        position: 'top',
      } as TransferToDeckAction;
    }
  }

  // ---- ウィルス配置 ----
  {
    // すべてのシグニゾーンに１つずつ置く
    if (t.match(/対戦相手のすべてのシグニゾーンに【ウィルス】を?[１-９\d]?つずつ置く/)) {
      return { type: 'PLACE_VIRUS', targetOwner: 'opponent', zoneCount: 'ALL', virusCount: 1 } as PlaceVirusAction;
    }
    // N つまでに１つずつ
    const vm1 = t.match(/対戦相手のシグニゾーン([１-９\d]+)つまでに【ウィルス】を?[１-９\d]*つずつ?置く/);
    if (vm1) {
      return { type: 'PLACE_VIRUS', targetOwner: 'opponent', zoneCount: parseNum(vm1[1]), virusCount: 1, upToZoneCount: true } as PlaceVirusAction;
    }
    // N つに M つ置く
    const vm2 = t.match(/対戦相手のシグニゾーン([１-９\d]+)つに【ウィルス】([１-９\d]+)つを?置く/);
    if (vm2) {
      return { type: 'PLACE_VIRUS', targetOwner: 'opponent', zoneCount: parseNum(vm2[1]), virusCount: parseNum(vm2[2]) } as PlaceVirusAction;
    }
    // 「に【ウィルス】を置く」（対戦相手シグニゾーン1つ＋ウィルス数省略）
    const vm3 = t.match(/対戦相手のシグニゾーン([１-９\d]+)つに【ウィルス】を?置く/);
    if (vm3) {
      return { type: 'PLACE_VIRUS', targetOwner: 'opponent', zoneCount: parseNum(vm3[1]), virusCount: 1 } as PlaceVirusAction;
    }
  }

  // ---- アクセ ----
  if (t.match(/このカードをエナゾーンからそれの【アクセ】にする/)) {
    return { type: 'ATTACH_ACCE', targetSigniOwner: 'self', sourceOwner: 'self' } as AttachAcceAction;
  }

  // ---- 血晶武装 ----
  {
    const bcaM = t.match(/血晶武装［([^］]+)］する/);
    if (bcaM) {
      const srcText = bcaM[1];
      const sources: ('hand' | 'trash')[] = [];
      if (srcText.includes('手札')) sources.push('hand');
      if (srcText.includes('トラッシュ')) sources.push('trash');
      return { type: 'BLOOD_CRYSTAL_ARMOR', source: sources.length > 0 ? sources : ['hand', 'trash'], count: 1 } as BloodCrystalArmorAction;
    }
  }

  // ---- 手札からシグニを公開してもよい ----
  {
    const revealHandM = t.match(/あなたの手札から(?:名前の異なる)?(?:(.+?)の)?シグニを?([０-９\d]+)枚まで公開してもよい/);
    if (revealHandM) {
      const filter: TargetFilter = { cardType: 'シグニ' };
      if (revealHandM[1]) Object.assign(filter, parseStoryFilter(revealHandM[1]));
      const count = parseNum(revealHandM[2]);
      return { type: 'REVEAL', source: { type: 'HAND_CARD', owner: 'self', count, upToCount: true, filter } } as { type: 'REVEAL'; source?: EffectTarget };
    }
  }

  // ---- このアーツは対戦相手のターンにしか使用できない ----
  if (t.match(/このアーツは対戦相手のターンにしか使用できない/)) {
    return { type: 'BLOCK_ACTION', target: { type: 'PLAYER', owner: 'self', count: 1 }, actionId: 'USE_ARTS_EXCEPT_OPP_TURN', until: 'PERMANENT' };
  }

  // ---- このシグニには（N枚まで/好きな枚数）アクセを付けることができる ----
  if (t.match(/このシグニには.*【アクセ】を付けることができる/)) {
    const maxM = t.match(/([０-９\d]+)枚まで/);
    const unlimited = t.includes('好きな枚数');
    const max = unlimited ? 99 : (maxM ? parseNum(maxM[1]) : 1);
    return { type: 'BLOCK_ACTION', target: { type: 'SIGNI', owner: 'self', count: 1 }, actionId: `ACCE_LIMIT_${max}`, until: 'PERMANENT' };
  }

  // ---- このターン、次に対戦相手のシグニがアタックしたとき、そのアタックを無効にする ----
  if (t.match(/次に対戦相手のシグニがアタックしたとき.*アタックを無効にする/)) {
    return { type: 'BLOCK_ACTION', target: { type: 'PLAYER', owner: 'opponent', count: 1 }, actionId: 'NEGATE_NEXT_SIGNI_ATTACK', until: 'END_OF_TURN' };
  }

  // ---- あなたのライフクロスの一番上を見る ----
  if (t.match(/あなたのライフクロスの一番上を見る/)) {
    return {
      type: 'LOOK_AND_REORDER',
      source: { location: 'life_cloth' as import('../types/effects').CardLocation, owner: 'self' },
      count: 1,
      private: true,
      reorder: false,
      canTrash: false,
      destination: { location: 'life_cloth' as import('../types/effects').CardLocation, owner: 'self', position: 'top' },
    } as LookAndReorderAction;
  }

  // ---- このシグニはダウン状態でもアタックできる（スリープアタッカー）----
  if (t.match(/このシグニはダウン状態でもアタックできる/)) {
    return { type: 'GRANT_KEYWORD', target: { type: 'SIGNI', owner: 'self', count: 1 }, keyword: 'スリープアタッカー', duration: 'PERMANENT' } as GrantKeywordAction;
  }

  // ---- 対戦相手の効果でシグニのパワーは増加しない（CONTINUOUS保護）----
  if (t.match(/対戦相手の効果によって.*シグニのパワーは＋.*されない/)) {
    const owner: Owner = t.includes('対戦相手のシグニ') ? 'opponent' : 'self';
    return {
      type: 'GRANT_PROTECTION',
      target: { type: 'SIGNI', owner, count: 'ALL' },
      from: ['POWER_MODIFY'],
      sourceOwner: 'opponent',
      duration: 'PERMANENT',
    } as GrantProtectionAction;
  }

  // ---- コスト0スペル使用禁止（すべてのプレイヤー）----
  if (t.match(/すべてのプレイヤーはコストの合計が[０-９\d]+のスペルを使用できない/)) {
    const costM = t.match(/コストの合計が([０-９\d]+)/);
    const cost = costM ? parseNum(costM[1]) : 0;
    return {
      type: 'SEQUENCE',
      steps: [
        { type: 'BLOCK_ACTION', target: { type: 'PLAYER', owner: 'self', count: 1 }, actionId: `USE_SPELL_COST_${cost}`, until: 'PERMANENT' },
        { type: 'BLOCK_ACTION', target: { type: 'PLAYER', owner: 'opponent', count: 1 }, actionId: `USE_SPELL_COST_${cost}`, until: 'PERMANENT' },
      ],
    };
  }

  // ---- 手札以外からシグニを場に出せない ----
  if (t.match(/自身の効果によって手札以外からシグニを場に出せない/)) {
    return { type: 'BLOCK_ACTION', target: { type: 'PLAYER', owner: 'opponent', count: 1 }, actionId: 'PLAY_SIGNI_NOT_FROM_HAND', until: 'PERMANENT' };
  }

  // ---- ルリグアタックステップスキップ ----
  if (t.match(/ルリグアタックステップをスキップする/)) {
    const owner: Owner = t.includes('対戦相手') ? 'opponent' : 'self';
    return { type: 'BLOCK_ACTION', target: { type: 'PLAYER', owner, count: 1 }, actionId: 'LRIG_ATTACK_STEP', until: 'END_OF_TURN' };
  }

  // ---- シグニアタックステップスキップ ----
  if (t.match(/シグニアタックステップをスキップする/)) {
    const owner: Owner = t.includes('対戦相手') ? 'opponent' : 'self';
    return { type: 'BLOCK_ACTION', target: { type: 'PLAYER', owner, count: 1 }, actionId: 'SIGNI_ATTACK_STEP', until: 'END_OF_TURN' };
  }

  // ---- アーツとスペル使用禁止 ----
  if (t.match(/アーツとスペルを使用できない/)) {
    const owner: Owner = (t.includes('あなたはアーツ') || (t.includes('あなたは') && !t.includes('対戦相手'))) ? 'self' : 'opponent';
    const until: BlockActionAction['until'] = t.includes('次のあなたのターン') ? 'NEXT_TURN' : t.includes('次の対戦相手のターン') ? 'NEXT_TURN' : 'END_OF_TURN';
    return { type: 'BLOCK_ACTION', target: { type: 'PLAYER', owner, count: 1 }, actionId: 'ARTS_AND_SPELL', until };
  }

  // ---- センタールリグのリミット増減 ----
  {
    const limitM = t.match(/(?:対戦相手の)?センタールリグのリミットは([１-９\d]+)(増え|減る)/);
    if (limitM) {
      const delta = parseNum(limitM[1]) * (limitM[2] === '増え' ? 1 : -1);
      const owner: Owner = t.includes('対戦相手') ? 'opponent' : 'self';
      const until: LrigLimitModifyAction['until'] = t.includes('次の') ? 'NEXT_TURN' : t.includes('このターン') ? 'END_OF_TURN' : 'PERMANENT';
      return { type: 'LRIG_LIMIT_MODIFY', owner, delta, until } as LrigLimitModifyAction;
    }
  }

  // ---- 対戦相手の手札が多い場合に捨てさせる ----
  {
    const discardSizeM = t.match(/対戦相手の手札が([０-９\d]+)枚以上ある場合、対戦相手は手札が([０-９\d]+)枚になるようにカードを捨てる/);
    if (discardSizeM) {
      const threshold = parseNum(discardSizeM[1]);
      const target = parseNum(discardSizeM[2]);
      return {
        type: 'CONDITIONAL',
        condition: { type: 'HAND_COUNT', owner: 'opponent', operator: 'gte', value: threshold },
        then: { type: 'TRASH', target: { type: 'HAND_CARD', owner: 'opponent', count: threshold - target } },
      };
    }
  }

  // ---- 感染状態のシグニはアップフェイズにアップしない ----
  if (t.match(/感染状態のシグニはアップフェイズにアップしない/)) {
    const owner: Owner = t.includes('対戦相手') ? 'opponent' : 'self';
    return { type: 'FREEZE', target: { type: 'SIGNI', owner, count: 'ALL', filter: { infected: true } } } as FreezeAction;
  }

  // ---- ライフクロスを見てデッキに戻す ----
  {
    const lifeToTopM = t.match(/ライフクロスの上からカードを([０-９\d]+)枚まで見て.*(?:デッキの一番上に戻す|好きな順番でデッキの一番上に戻す)/);
    if (lifeToTopM) {
      return {
        type: 'LOOK_AND_REORDER',
        source: { location: 'life_cloth' as import('../types/effects').CardLocation, owner: 'self' },
        count: parseNum(lifeToTopM[1]),
        private: true,
        reorder: true,
        canTrash: false,
        destination: { location: 'deck' as import('../types/effects').CardLocation, owner: 'self', position: 'any' },
      } as LookAndReorderAction;
    }
  }

  // ---- このシグニはすべての領域で黒でもある ----
  if (t.match(/このシグニはすべての領域で黒でもある/)) {
    return { type: 'STUB', id: 'ALL_ZONE_BLACK' } as StubAction;
  }

  // ---- センタールリグは黒になる ----
  if (t.match(/あなたのセンタールリグは黒になる/)) {
    return { type: 'STUB', id: 'CENTER_LRIG_COLOR_CHANGE_BLACK' } as StubAction;
  }

  // ---- すべての領域のルリグとシグニが黒になる ----
  if (t.match(/あなたのすべての領域にあるルリグとシグニは黒になる/)) {
    return { type: 'STUB', id: 'ALL_CARDS_COLOR_CHANGE_BLACK' } as StubAction;
  }

  // ---- 対戦相手のすべてのシグニを《サーバントＺＥＲＯ》にする ----
  if (t.match(/対戦相手のすべてのシグニを《サーバントＺＥＲＯ》にする/)) {
    return { type: 'STUB', id: 'ALL_OPP_SIGNI_SERVANT_ZERO' } as StubAction;
  }

  // ---- シグニ1体を《サーバントＺＥＲＯ》にする ----
  if (t.match(/(?:対戦相手のシグニ|それ).*《サーバントＺＥＲＯ》にする/)) {
    return { type: 'STUB', id: 'SIGNI_SERVANT_ZERO' } as StubAction;
  }

  // ---- 対戦相手のエナの【マルチエナ】を除去 ----
  if (t.match(/対戦相手のエナゾーンにあるカードは【マルチエナ】を失い/)) {
    return { type: 'STUB', id: 'REMOVE_OPP_MULTI_ENA' } as StubAction;
  }

  // ---- ゲームに敗北しない（条件付き）----
  {
    const preventDefeatM = t.match(/ライフクロスが([０-９\d]+)枚以上ある場合.*ゲームに敗北しない/);
    if (preventDefeatM) {
      return {
        type: 'CONDITIONAL',
        condition: { type: 'LIFE_COUNT', owner: 'self', operator: 'gte', value: parseNum(preventDefeatM[1]) },
        then: { type: 'STUB', id: 'PREVENT_DEFEAT' },
      };
    }
  }

  // ---- ゲームに敗北する（デメリット）----
  if (t.match(/あなたはゲームに敗北する/)) {
    return { type: 'STUB', id: 'DEFEAT' } as StubAction;
  }

  // ---- レベル参照オーバーライド ----
  if (t.match(/(?:あなたの)?能力か効果.*レベルを参照する場合.*として扱ってもよい/)) {
    return { type: 'STUB', id: 'LEVEL_REFERENCE_OVERRIDE' } as StubAction;
  }

  // ---- 下にあるルリグの【起】/【自】能力を持つ ----
  if (t.match(/このルリグはこのカードの下にあるルリグの【起】能力を持つ/)) {
    return { type: 'STUB', id: 'GRANT_UNDER_LRIG_ACTIVATE_ABILITY' } as StubAction;
  }
  if (t.match(/このルリグはこのカードの下にあるルリグの【自】能力を持つ/)) {
    return { type: 'STUB', id: 'GRANT_UNDER_LRIG_AUTO_ABILITY' } as StubAction;
  }

  // ---- 改造素材をルリグデッキに加える ----
  {
    const m = t.match(/あなたのルリグデッキに《([^》]+)》([０-９\d]*)枚?を?加える/);
    if (m) {
      return { type: 'ADD_CRAFT_TO_LRIG_DECK', owner: 'self', cardName: m[1], count: m[2] ? parseNum(m[2]) : 1 } as AddCraftToLrigDeckAction;
    }
  }

  // ---- エナコスト色代替（赤か青→白）----
  {
    const colorSubM = t.match(/あなたが《([^》]+)》か《([^》]+)》を支払う際.*代わりに《([^》]+)》を支払ってもよい/);
    if (colorSubM) {
      return { type: 'STUB', id: `ENERGY_COLOR_SUBSTITUTE_${colorSubM[1]}_OR_${colorSubM[2]}_TO_${colorSubM[3]}` } as StubAction;
    }
  }

  // ---- エナコスト色代替（黒トラッシュで任意色）----
  if (t.match(/エナコストを支払う際.*エナゾーンから.*トラッシュに置くことで.*エナ.*支払える/)) {
    return { type: 'STUB', id: 'ENERGY_COLOR_SUBSTITUTE_TRASH' } as StubAction;
  }

  // ---- ＜アーム＞シグニ保護 ----
  if (t.match(/あなたの＜アーム＞のシグニは対戦相手のルリグの効果を受けず/)) {
    return { type: 'STUB', id: 'ARM_SIGNI_LRIG_PROTECTION' } as StubAction;
  }

  // ---- ＜ウェポン＞シグニ保護 ----
  if (t.match(/あなたの＜ウェポン＞のシグニは対戦相手のシグニの効果を受けず/)) {
    return { type: 'STUB', id: 'WEAPON_SIGNI_PROTECTION' } as StubAction;
  }

  // ---- ライドオン（乗機）----
  if (t.match(/センタールリグ.*＜乗機＞のシグニ.*乗ってもよい/)) {
    return { type: 'STUB', id: 'RIDE_ON' } as StubAction;
  }

  // ---- シードを開花する ----
  if (t.match(/【シード】.*開花する/)) {
    return { type: 'STUB', id: 'SEED_BLOOM' } as StubAction;
  }

  // ---- 選んだ能力を得る ----
  if (t.match(/あなたのシグニ.*ターン終了時まで.*選んだ能力を得る/)) {
    return { type: 'STUB', id: 'GRANT_CHOSEN_ABILITY' } as StubAction;
  }

  // ---- シグニの下にあるカードを手札・エナ等へ移動（他のシグニ基準） ----
  {
    const m = t.match(/あなたのシグニの下にある(.*?)(?:シグニ|カード)([０-９\d]*)枚?まで?を?対象とし、それ(?:ら)?を(手札に加える|エナゾーンに置く|トラッシュに置く)/);
    if (m) {
      const dest: 'hand' | 'energy' | 'trash' = m[3].includes('手札') ? 'hand' : m[3].includes('エナ') ? 'energy' : 'trash';
      const cnt = m[2] ? parseNum(m[2]) : 1;
      const storyFilter = m[1] ? parseStoryFilter(m[1]) : {};
      return { type: 'TAKE_FROM_UNDER_SIGNI', destination: dest, count: cnt, upToCount: t.includes('まで'), filter: { cardType: 'シグニ', ...storyFilter } } as TakeFromUnderSigniAction;
    }
    if (t.match(/あなたのシグニの下にある.*シグニ.*を手札に加える/)) {
      const storyM = t.match(/あなたのシグニの下にある(＜[^＞]+＞)の/);
      const storyFilter = storyM ? parseStoryFilter(storyM[1]) : {};
      return { type: 'TAKE_FROM_UNDER_SIGNI', destination: 'hand', count: 1, upToCount: t.includes('まで'), filter: { cardType: 'シグニ', ...storyFilter } } as TakeFromUnderSigniAction;
    }
  }

  // ---- 対戦相手の効果によってダメージを受けない ----
  if (t.match(/あなたは対戦相手の効果によってダメージを受けず/)) {
    return { type: 'STUB', id: 'PREVENT_DAMAGE_FROM_OPP_EFFECTS' } as StubAction;
  }

  // ---- 対戦相手がルリグアタックした際、追加で1枚捨てないとガードできない ----
  if (t.match(/手札から.*【ガードアイコン】.*追加で.*捨てないかぎり【ガード】ができない/)) {
    return { type: 'STUB', id: 'EXTRA_GUARD_COST' } as StubAction;
  }

  // ---- このターン、シグニ/センタールリグのアタックを無効にする（複数回目） ----
  if (t.match(/対戦相手の(?:シグニ|センタールリグ).*アタック.*(?:一度目|二度目).*無効にする/)) {
    return { type: 'STUB', id: 'NEGATE_NTH_ATTACK' } as StubAction;
  }

  // ---- 対戦相手はシグニをN体までしか場に出せない ----
  {
    const fieldLimitM = t.match(/対戦相手はシグニを([０-９\d]+)体までしか場に出すことができない/);
    if (fieldLimitM) {
      return { type: 'STUB', id: `LIMIT_OPP_FIELD_${parseNum(fieldLimitM[1])}` } as StubAction;
    }
  }

  // ---- 《レイヤーアイコン》能力コピー ----
  if (t.match(/《レイヤーアイコン》能力.*を得る/)) {
    return { type: 'STUB', id: 'LAYER_ABILITY_COPY' } as StubAction;
  }

  // ---- あなたにダメージを与える ----
  if (t.match(/^あなたにダメージを与える$/)) {
    return { type: 'LIFE_CRASH', owner: 'self', count: 1, triggerBurst: true };
  }

  // ---- 手札からカードをエナゾーンに置く（optional）----
  if (t.match(/あなたの手札からカード([０-９\d]+)枚をエナゾーンに置いてもよい/)) {
    return { type: 'STUB', id: 'HAND_TO_ENERGY_OPTIONAL' } as StubAction;
  }

  // ---- 対戦相手のエナゾーンにカードが置かれたとき、超過分をトラッシュ ----
  if (t.match(/対戦相手のエナゾーンに.*カード.*置かれたとき.*エナゾーンにある.*[０-９\d]+枚以上.*トラッシュに置く/)) {
    return { type: 'STUB', id: 'OPP_ENERGY_OVERFLOW_TRASH' } as StubAction;
  }

  // ---- このシグニが場に出たターン、自身の【出】能力で選んだ能力を得る ----
  if (t.match(/このシグニが場に出たターン.*自身の【出】能力で選んだ能力を得る/)) {
    return { type: 'STUB', id: 'GRANT_CHOSEN_ABILITY_FROM_PLAY' } as StubAction;
  }

  // ---- 次のターンまで対戦相手は各シグニアタックステップで1度しかアタックできない ----
  if (t.match(/対戦相手は各シグニアタックステップに.*合計一度しかアタックできない/)) {
    return { type: 'STUB', id: 'LIMIT_OPP_SIGNI_ATTACKS_ONCE' } as StubAction;
  }

  // ---- 対戦相手のライフクロスの一番上を見る ----
  if (t.match(/対戦相手のライフクロスの一番上を見る/)) {
    return { type: 'STUB', id: 'LOOK_OPP_LIFE_TOP' } as StubAction;
  }

  // ---- センタールリグのレベルが条件で代わりに複数選択（レベルが以上）----
  if (t.match(/センタールリグのレベルが?[０-９\d]+以上の場合.*代わりに[２-９]つまで選ぶ/)) {
    return { type: 'STUB', id: 'CONDITIONAL_MULTI_CHOOSE_BY_CENTER_LEVEL_GTE' } as StubAction;
  }

  // ---- そのシグニは引用符付き能力を得る（ライズ時等）----
  if (t.match(/そのシグニは「【常】.*」を得る/s)) {
    return { type: 'STUB', id: 'RISE_TARGET_SIGNI_GAIN_CONSTANT_ABILITY' } as StubAction;
  }

  // ---- ルリグアタックで特定カード名をすべてトラッシュ ----
  if (t.match(/対戦相手の場とエナゾーンからカード名に.*を含むすべてのカードをトラッシュに置く/)) {
    return { type: 'STUB', id: 'TRASH_ALL_BY_NAME_FROM_FIELD_AND_ENERGY' } as StubAction;
  }

  // ---- スペルを制限なし・コスト0で使用 ----
  if (t.match(/スペル.*コストを支払わずに限定条件を無視して使用/)) {
    return { type: 'STUB', id: 'PLAY_SPELL_FREE_IGNORE_RESTRICTION' } as StubAction;
  }

  // ---- シグニ1体かセンタールリグのアタックを無効 ----
  if (t.match(/対戦相手のシグニ.*かセンタールリグ.*がアタックしたとき.*そのアタックを無効にする/)) {
    return { type: 'STUB', id: 'NEGATE_SIGNI_OR_LRIG_ATTACK' } as StubAction;
  }

  // ---- カードを1枚引き手札1枚をデッキ下に ----
  if (t.match(/^カードを([０-９\d]+)枚引き、手札からカード([０-９\d]+)枚をデッキの一番下に置く$/)) {
    const m = t.match(/^カードを([０-９\d]+)枚引き、手札からカード([０-９\d]+)枚をデッキの一番下に置く$/);
    if (m) {
      return {
        type: 'SEQUENCE',
        steps: [
          { type: 'DRAW', owner: 'self', count: parseNum(m[1]) },
          { type: 'TRANSFER_TO_DECK', target: { type: 'HAND_CARD', owner: 'self', count: parseNum(m[2]) }, position: 'bottom' },
        ],
      } as import('../types/effects').SequenceAction;
    }
  }

  // ---- 同じ選択肢を2回選んでもよい ----
  if (t.match(/同じ選択肢を[２-９]回選んでもよい/)) {
    return { type: 'STUB', id: 'CHOOSE_SAME_OPTION_TWICE' } as StubAction;
  }

  // ---- 対戦相手のレベルNのシグニをトラッシュに置く ----
  if (t.match(/対戦相手のレベル[０-９\d]+(?:以下)?のシグニ([０-９\d]+)体を対象とし.*トラッシュに置く/)) {
    const m = t.match(/対戦相手のレベル([０-９\d]+)(以下)?のシグニ([０-９\d]+)?体を対象とし.*トラッシュに置く/);
    if (m) {
      const filter: import('../types/effects').TargetFilter = { cardType: 'シグニ', levelRange: { max: parseNum(m[1]) } };
      if (!m[2]) filter.levelRange = { min: parseNum(m[1]), max: parseNum(m[1]) };
      return {
        type: 'TRASH',
        target: { type: 'SIGNI', owner: 'opponent', count: m[3] ? parseNum(m[3]) : 1, filter },
      };
    }
  }

  // ---- 他のシグニのパワーが対戦相手の効果で－されない ----
  if (t.match(/あなたの(?:他の)?シグニのパワーは対戦相手の効果によって－.*されない/)) {
    return { type: 'STUB', id: 'PREVENT_ALL_SIGNI_POWER_MINUS_BY_OPP' } as StubAction;
  }

  // ---- このターン4度目のアタックかつ特定センタールリグで選択 ----
  if (t.match(/そのアタックがこのターン[一二三四五六七八九十]+度目.*センタールリグ.*の場合.*以下の.*から.*選ぶ/)) {
    return { type: 'STUB', id: 'NTH_ATTACK_CENTER_LRIG_CHOOSE' } as StubAction;
  }

  // ---- 対戦相手がシグニとエナゾーンのカードをトラッシュ ----
  if (t.match(/対戦相手は.*自分の場からシグニ.*自分のエナゾーンからカード.*トラッシュに置く/)) {
    return { type: 'STUB', id: 'OPP_TRASH_FIELD_SIGNI_AND_ENERGY' } as StubAction;
  }

  // ---- 対戦相手のターン中、このシグニがバニッシュされたとき相手が手札をデッキ上に ----
  if (t.match(/対戦相手のターンの間.*このシグニがバニッシュされたとき.*対戦相手は手札.*デッキの一番上に置く/)) {
    return { type: 'STUB', id: 'OPP_RETURN_HAND_ON_SELF_BANISH' } as StubAction;
  }

  // ---- 対戦相手は手札をN枚デッキの一番上に置く ----
  if (t.match(/対戦相手は手札を[０-９\d１-３]+枚デッキの一番上に置く/)) {
    return { type: 'STUB', id: 'OPP_HAND_TO_DECK_TOP' } as StubAction;
  }

  // ---- バニッシュしたシグニがエナ代わりにトラッシュ（このシグニによって）----
  if (t.match(/このシグニによってバニッシュされたシグニはエナゾーンに置かれる代わりにトラッシュに置かれる/)) {
    return { type: 'STUB', id: 'BANISH_BY_SELF_GOES_TO_TRASH' } as StubAction;
  }

  // ---- シグニがアタックしたとき、このシグニを別のゾーンに配置 ----
  if (t.match(/対戦相手のシグニ.*がアタックしたとき.*このシグニを他のシグニゾーンに配置してもよい/)) {
    return { type: 'STUB', id: 'MOVE_SELF_TO_OTHER_ZONE_ON_OPP_ATTACK' } as StubAction;
  }

  // ---- ターン終了時まで、特定クラス複数体のパワーUP ----
  if (t.match(/あなたの＜[^＞]+＞のシグニを[０-９\d]+体まで対象とし.*ターン終了時まで.*それらのパワーを.*[＋+]/)) {
    const m = t.match(/[＋+]([０-９\d]+)する/);
    if (m) {
      return { type: 'STUB', id: `MULTI_SIGNI_POWER_UP_${parseNum(m[1])}` } as StubAction;
    }
    return { type: 'STUB', id: 'MULTI_SIGNI_POWER_UP' } as StubAction;
  }

  // ---- このシグニは効果によって手札に戻らずダウンしない ----
  if (t.match(/このシグニは対戦相手の効果によって.*手札に戻らずダウンしない/)) {
    return { type: 'STUB', id: 'PREVENT_BOUNCE_AND_DOWN_BY_OPP' } as StubAction;
  }

  // ---- 手札が少ない場合、対戦相手の手札をデッキ下に ----
  if (t.match(/あなたの手札が対戦相手より少ない場合.*対戦相手は手札を.*デッキの一番下に置く/)) {
    return { type: 'STUB', id: 'OPP_HAND_TO_DECK_BOTTOM_IF_LESS_HAND' } as StubAction;
  }

  // ---- 対戦相手シグニのパワーをトラッシュされたシグニのレベル×Nだけ減少 ----
  if (t.match(/対戦相手のシグニ.*ターン終了時まで.*それのパワーをトラッシュに置かれたそのシグニのレベル.*につき－/)) {
    return { type: 'STUB', id: 'OPP_SIGNI_POWER_DOWN_BY_TRASHED_LEVEL' } as StubAction;
  }

  // ---- シード開花（optional）----
  if (t.match(/あなたの【シード】.*開花してもよい/)) {
    return { type: 'STUB', id: 'SEED_BLOOM_OPTIONAL' } as StubAction;
  }

  // ---- 手札から無色ではないカードをエナゾーンに置く ----
  if (t.match(/あなたの手札から.*無色ではないカードを.*枚までエナゾーンに置く/)) {
    return { type: 'STUB', id: 'HAND_NONCOLORLESS_TO_ENERGY' } as StubAction;
  }

  // ---- エナゾーンのカードをトラッシュ（自分の）----
  if (t.match(/^あなたのエナゾーンからカード([０-９\d]+)枚を対象とし、それをトラッシュに置く$/) ||
      t.match(/^あなたのエナゾーンからカード([０-９\d]+)枚をトラッシュに置く$/)) {
    const m = t.match(/カード([０-９\d]+)枚/);
    return {
      type: 'TRASH',
      target: { type: 'ENERGY_CARD', owner: 'self', count: m ? parseNum(m[1]) : 1 },
    };
  }

  // ---- 対戦相手のトラッシュの色とクラスを失わせる ----
  if (t.match(/対戦相手のトラッシュにあるカードは色とクラスを失う/)) {
    return { type: 'STUB', id: 'OPP_TRASH_LOSE_COLOR_AND_CLASS' } as StubAction;
  }

  // ---- このシグニには複数枚アクセを付けられる ----
  if (t.match(/このシグニには[２-９]枚まで【アクセ】を付けられる/)) {
    return { type: 'STUB', id: 'MULTI_ACCE_LIMIT' } as StubAction;
  }

  // ---- 手札から調理シグニをアクセにする（枚数付き）----
  if (t.match(/あなたの手札から.*シグニを[０-９\d]+枚までこのシグニの【アクセ】にする/)) {
    return { type: 'STUB', id: 'MULTI_ACCE_FROM_HAND' } as StubAction;
  }

  // ---- チャーム枚数でパワーアップ ----
  if (t.match(/このシグニのパワーは.*【チャーム】.*枚につき[＋+]/)) {
    return { type: 'STUB', id: 'POWER_BY_CHARM_COUNT' } as StubAction;
  }

  // ---- 《ライズアイコン_黒》を持つシグニが場に出たとき ----
  if (t.match(/《ライズアイコン[_黒]*》.*持つ.*シグニ.*場に出たとき/)) {
    return { type: 'STUB', id: 'BLACK_RISE_PLAY_STACK_FROM_TRASH' } as StubAction;
  }

  // ---- トラッシュから特定名前シグニをアクセにする ----
  if (t.match(/あなたのトラッシュから《[^》]+》.*このシグニの【アクセ】にする/)) {
    return { type: 'STUB', id: 'NAMED_SIGNI_ACCE_FROM_TRASH' } as StubAction;
  }

  // ---- このシグニはダウン状態で場に出る ----
  if (t.match(/このシグニはダウン状態で場に出る/)) {
    return { type: 'STUB', id: 'ENTERS_FIELD_DOWNED' } as StubAction;
  }

  // ---- ルリグデッキに特定カードを加える ----
  if (t.match(/あなたのルリグデッキに《[^》]+》.*加える/)) {
    return { type: 'STUB', id: 'ADD_CARD_TO_LRIG_DECK' } as StubAction;
  }

  // ---- このシグニはすべての色を得る ----
  if (t.match(/このシグニはすべての色を得る/)) {
    return { type: 'STUB', id: 'ALL_COLOR' } as StubAction;
  }

  // ---- アクセされているシグニに色付与 ----
  if (t.match(/アクセされている.*シグニはすべての色を得る/)) {
    return { type: 'STUB', id: 'ACCE_SIGNI_ALL_COLOR' } as StubAction;
  }

  // ---- あなたのルリグは対戦相手のセンタールリグのタイプを追加で得る ----
  if (t.match(/このルリグは対戦相手のセンタールリグのルリグタイプを追加で得る/)) {
    return { type: 'STUB', id: 'INHERIT_OPP_LRIG_TYPE' } as StubAction;
  }

  // ---- このルリグはルリグトラッシュの特定ルリグの【起】能力を得る ----
  if (t.match(/このルリグはあなたのルリグトラッシュにある.*の【起】能力を得る/)) {
    return { type: 'STUB', id: 'GRANT_LRIG_TRASH_ACTIVATE_ABILITY' } as StubAction;
  }

  // ---- このターンにルリグがアタックしたとき登録者数 ----
  if (t.match(/このルリグがアタックしたとき.*登録者数/)) {
    return { type: 'STUB', id: 'LRIG_ATTACK_SUBSCRIBER_COUNT' } as StubAction;
  }

  // ---- 登録者数を得る（条件付き）----
  if (t.match(/登録者数を[０-９\d０-９万]+人得る/)) {
    return { type: 'STUB', id: 'GAIN_SUBSCRIBER_COUNT' } as StubAction;
  }

  // ---- 場のすべてのシグニとキーをトラッシュ ----
  if (t.match(/すべてのシグニをトラッシュに置き.*すべてのキーをルリグトラッシュに置く/)) {
    return { type: 'STUB', id: 'TRASH_ALL_SIGNI_AND_KEY' } as StubAction;
  }

  // ---- 場以外のカードが対戦相手の効果で移動しない ----
  if (t.match(/場以外のあなたの領域.*クラッシュ以外の対戦相手の効果.*他の領域に移動しない/)) {
    return { type: 'STUB', id: 'PREVENT_NON_FIELD_MOVE_BY_OPP' } as StubAction;
  }

  // ---- 感染シグニのパワーを減少 ----
  if (t.match(/対戦相手の感染状態のシグニのパワーをそのシグニのレベル.*－/)) {
    return { type: 'STUB', id: 'INFECTED_SIGNI_POWER_DOWN_BY_LEVEL' } as StubAction;
  }

  // ---- 能力なしシグニがデッキ行き ----
  if (t.match(/能力を持たない対戦相手のシグニが場を離れる場合.*デッキの一番下に置かれる/)) {
    return { type: 'STUB', id: 'NO_ABILITY_SIGNI_TO_DECK_BOTTOM' } as StubAction;
  }

  // ---- レゾナがバニッシュ代替（自分をトラッシュ）----
  if (t.match(/あなたの.*レゾナ.*対戦相手の効果によって場を離れる場合.*代わりに.*このシグニを.*トラッシュに置いてもよい/)) {
    return { type: 'STUB', id: 'RESONANCE_LEAVE_SELF_TRASH_SUBSTITUTE' } as StubAction;
  }

  // ---- 水獣がバトルでバニッシュしたときライフバースト ----
  if (t.match(/あなたの.*シグニがバトルによって.*対戦相手のシグニ.*バニッシュしたとき.*ライフバースト/)) {
    return { type: 'STUB', id: 'BATTLE_BANISH_LIFE_BURST' } as StubAction;
  }

  // ---- デッキの一番上をライフクロスに加える ----
  if (t.match(/あなたのデッキの一番上のカードをライフクロスに加え/)) {
    return { type: 'STUB', id: 'DECK_TOP_TO_LIFE' } as StubAction;
  }

  // ---- 特定クラスのシグニは能力を失わず新たに得られない ----
  if (t.match(/あなたの.*のシグニは対戦相手の効果によって.*能力を失わず新たに能力を得られない/)) {
    return { type: 'STUB', id: 'PREVENT_ABILITY_CHANGE_BY_OPP' } as StubAction;
  }

  // ---- 対戦相手はすべての【起】能力を使用できない ----
  if (t.match(/対戦相手はすべての領域にあるシグニの【起】能力を使用できない/)) {
    return { type: 'STUB', id: 'BLOCK_ALL_OPP_ACTIVATE_ABILITY' } as StubAction;
  }

  // ---- 中央シグニゾーンにウィルスを置く ----
  if (t.match(/対戦相手の中央のシグニゾーンに【ウィルス】.*置く/)) {
    return { type: 'STUB', id: 'PLACE_VIRUS_CENTER' } as StubAction;
  }

  // ---- 下にあるシグニの色を得る ----
  if (t.match(/このシグニはこのカードの下にある.*シグニが持つ色を得る/)) {
    return { type: 'STUB', id: 'INHERIT_UNDER_SIGNI_COLOR' } as StubAction;
  }

  // ---- 次の対戦相手のアタックフェイズ開始時にダウン化 ----
  if (t.match(/次の対戦相手のアタックフェイズ開始時.*アタックできない.*を得る/)) {
    return { type: 'STUB', id: 'PREVENT_ATTACK_UNTIL_OPP_ATTACK_PHASE' } as StubAction;
  }

  // ---- このルリグは自身のアタックで複数回ダメージ ----
  if (t.match(/このターン.*このルリグは自身のアタックによってダメージを[０-９\d]+回与える/)) {
    return { type: 'STUB', id: 'MULTI_DAMAGE_ON_LRIG_ATTACK' } as StubAction;
  }

  // ---- すべての効果を無効 ----
  if (t.match(/現在影響している対戦相手のすべての効果は何もしない/)) {
    return { type: 'STUB', id: 'NEGATE_ALL_OPP_EFFECTS' } as StubAction;
  }

  // ---- キーをトラッシュしてエナ代替 ----
  if (t.match(/あなたがエナコストを支払う際.*キーを場からルリグトラッシュに置くことで.*エナ.*支払える/)) {
    return { type: 'STUB', id: 'ENERGY_SUBSTITUTE_TRASH_KEY' } as StubAction;
  }

  // ---- シグニに凍結条件付きアサシン付与 ----
  if (t.match(/凍結状態のシグニがあるかぎり.*【アサシン】を得る.*を得る/s)) {
    return { type: 'STUB', id: 'GRANT_CONDITIONAL_ASSASSIN_ABILITY' } as StubAction;
  }

  // ---- ルリグによってダメージを受けない ----
  if (t.match(/あなたはルリグによってダメージを受けない/)) {
    return { type: 'STUB', id: 'PREVENT_LRIG_DAMAGE' } as StubAction;
  }

  // ---- 次のターンまでルリグダメージを受けない ----
  if (t.match(/次のターンの間.*あなたは対戦相手のルリグによってダメージを受けない/)) {
    return { type: 'STUB', id: 'PREVENT_LRIG_DAMAGE_UNTIL_NEXT_TURN' } as StubAction;
  }

  // ---- 今ターンだけルリグダメージを受けない ----
  if (t.match(/このターン.*あなたは対戦相手のルリグによってダメージを受けない/)) {
    return { type: 'STUB', id: 'PREVENT_LRIG_DAMAGE_THIS_TURN' } as StubAction;
  }

  // ---- 対戦相手のエナゾーンのカードがマルチエナを失う ----
  if (t.match(/対戦相手のエナゾーンにあるカードは【マルチエナ】を失う/)) {
    return { type: 'STUB', id: 'REMOVE_OPP_MULTI_ENA_ONLY' } as StubAction;
  }

  // ---- 対戦相手の効果でこのシグニのパワーは－されない ----
  if (t.match(/対戦相手の効果によって.*このシグニのパワーは－.*されない/)) {
    return { type: 'STUB', id: 'PREVENT_POWER_MINUS_BY_OPP' } as StubAction;
  }

  // ---- ルリグデッキに特定カードを加える（場から移動時）----
  if (t.match(/場にある.*シグニが.*シグニゾーンに移動したとき.*ルリグデッキに.*加える/)) {
    return { type: 'STUB', id: 'MOVE_SIGNI_ZONE_ADD_CARD_TO_LRIG_DECK' } as StubAction;
  }

  // ---- 奇数レベルのシグニはアタックできない ----
  if (t.match(/レベルが奇数の.*シグニは.*アタックできない.*を得る/)) {
    return { type: 'STUB', id: 'ODD_LEVEL_SIGNI_CANT_ATTACK' } as StubAction;
  }

  // ---- ドライブ状態のシグニが効果によってダウンしない ----
  if (t.match(/あなたのドライブ状態のシグニ.*対戦相手の効果によってダウンしない/)) {
    return { type: 'STUB', id: 'DRIVE_SIGNI_PREVENT_DOWN' } as StubAction;
  }

  // ---- センタールリグが降りてもよい ----
  if (t.match(/あなたのセンタールリグ.*降りてもよい/)) {
    return { type: 'STUB', id: 'CENTER_LRIG_DISMOUNT' } as StubAction;
  }

  // ---- カードを1枚引き手札を1枚デッキ下に置く ----
  if (t.match(/^カードを([０-９\d]+)枚引き、手札を([０-９\d]+)枚デッキの一番下に置く$/) ||
      t.match(/^各プレイヤーは、カードを([０-９\d]+)枚引き手札を([０-９\d]+)枚デッキの一番下に置く$/)) {
    return { type: 'STUB', id: 'DRAW_AND_PUT_HAND_TO_DECK_BOTTOM' } as StubAction;
  }

  // ---- アクセがバニッシュされる場合このカードをトラッシュ ----
  if (t.match(/これにアクセされているシグニがバニッシュされる場合.*代わりに.*トラッシュに置く/)) {
    return { type: 'STUB', id: 'ACCE_BANISH_SELF_TRASH' } as StubAction;
  }

  // ---- このシグニが場を離れたとき、対戦相手が選択効果 ----
  if (t.match(/このシグニが場を離れたとき、対戦相手は以下の.*選び/)) {
    return { type: 'STUB', id: 'LEAVE_FIELD_OPP_CHOOSE' } as StubAction;
  }

  // ---- 【出】能力のコストを減少 ----
  if (t.match(/次にあなたが【出】能力を発動する場合.*発動コストは.*減る/)) {
    return { type: 'STUB', id: 'REDUCE_PLAY_ABILITY_COST' } as StubAction;
  }

  // ---- 手札から特定クラスのシグニを公開してもよい ----
  if (t.match(/あなたの手札から.*のシグニを.*枚公開してもよい/)) {
    return {
      type: 'REVEAL',
      source: { type: 'HAND_CARD', owner: 'self', count: 1 },
    } as import('../types/effects').RevealAction;
  }

  // ---- 悪魔シグニは場から手札に戻らない ----
  if (t.match(/あなたの.*シグニは場から手札に戻らない/)) {
    return { type: 'STUB', id: 'SIGNI_CANT_BOUNCE_FROM_FIELD' } as StubAction;
  }

  // ---- 調理シグニをアクセにする ----
  if (t.match(/あなたの手札から.*シグニを.*それの【アクセ】にする/)) {
    return { type: 'STUB', id: 'ACCE_FROM_HAND' } as StubAction;
  }

  // ---- 【アクセ】を別シグニに付ける ----
  if (t.match(/対象のあなたの【アクセ】.*対象のあなたの.*シグニ.*に付けてもよい/)) {
    return { type: 'STUB', id: 'MOVE_ACCE_TO_SIGNI' } as StubAction;
  }

  // ---- トラッシュから特定シグニをアクセにする ----
  if (t.match(/あなたのトラッシュから.*シグニ.*このシグニの【アクセ】にする/)) {
    return { type: 'STUB', id: 'ACCE_FROM_TRASH' } as StubAction;
  }

  // ---- 対戦相手のシグニをデッキに加えてシャッフル ----
  if (t.match(/対戦相手のシグニ.*をデッキに加えてシャッフルする/)) {
    return { type: 'STUB', id: 'OPP_SIGNI_TO_DECK_AND_SHUFFLE' } as StubAction;
  }

  // ---- 対戦相手の手札を見て特定パワーのシグニを捨てさせる ----
  if (t.match(/対戦相手の手札を見て.*この方法で捨てたシグニと同じパワーのシグニ.*捨てさせる/)) {
    return { type: 'STUB', id: 'DISCARD_BY_POWER_MATCH' } as StubAction;
  }

  // ---- このターン次にダメージを受ける場合代わりに受けない ----
  if (t.match(/このターン.*次にあなたがダメージを受ける場合.*代わりにダメージを受けない/)) {
    return { type: 'PREVENT_NEXT_DAMAGE', count: 1 } as PreventNextDamageAction;
  }

  // ---- 代わりに＋Nする（前の効果に続く）----
  if (t.match(/^代わりに[＋+][０-９\d]+する$/)) {
    return { type: 'STUB', id: 'ALTERNATIVE_POWER_UP' } as StubAction;
  }

  // ---- 対戦相手シグニをレベル合計制限でエナに置く ----
  if (t.match(/対戦相手のシグニを.*レベルの合計が.*以下になるように.*対象.*エナゾーンに置く/)) {
    return {
      type: 'SEQUENCE',
      steps: [{
        type: 'STUB', id: 'ENERGY_BY_LEVEL_SUM_LIMIT',
      } as StubAction],
    } as import('../types/effects').SequenceAction;
  }

  // ---- 《ライズアイコン》を持つシグニのパワーに比例 ----
  if (t.match(/このシグニのパワーはあなたの場にある《ライズアイコン》を持つシグニ.*につき[＋+]/)) {
    return { type: 'STUB', id: 'POWER_BY_RISE_SIGNI_COUNT' } as StubAction;
  }

  // ---- 引用符付き起動能力を得る（【起】...）----
  if (t.match(/「【起】.*」を得る/s)) {
    return { type: 'STUB', id: 'GRANT_QUOTED_ACTIVATE_ABILITY' } as StubAction;
  }

  // ---- 引用符付き自動能力を得る（【自】...）----
  if (t.match(/「【自】.*」を得る/s)) {
    return { type: 'STUB', id: 'GRANT_QUOTED_AUTO_ABILITY' } as StubAction;
  }

  // ---- 特定シグニゾーンにアタック可能 ----
  if (t.match(/正面に加えてその隣のシグニゾーン.*にアタックしてもよい/)) {
    return { type: 'STUB', id: 'ADJACENT_ZONE_ATTACK' } as StubAction;
  }

  // ---- 手札が少ない場合対戦相手が捨てる ----
  if (t.match(/あなたの手札が対戦相手より少ない場合.*対戦相手は手札を.*捨てる/)) {
    return { type: 'STUB', id: 'OPP_DISCARD_IF_LESS_HAND' } as StubAction;
  }

  // ---- 古代兵器/特定クラスのシグニが場から移動しない ----
  if (t.match(/あなたのアタックフェイズの間.*対戦相手の効果はバニッシュ以外でお?あなたの.*シグニを場から移動させない/)) {
    return { type: 'STUB', id: 'PREVENT_SIGNI_MOVE_BY_OPP_EXCEPT_BANISH' } as StubAction;
  }

  // ---- アタックフェイズ間、対戦相手の効果で場から移動させない ----
  if (t.match(/あなたのアタックフェイズの間.*対戦相手の効果はバニッシュ以外でお?.*シグニを場から移動させない/)) {
    return { type: 'STUB', id: 'PREVENT_SIGNI_MOVE_BY_OPP_ATTACK_PHASE' } as StubAction;
  }

  // ---- このシグニは対戦相手の効果で場から移動しない ----
  if (t.match(/対戦相手の効果はバニッシュ以外でこのシグニを場から移動させない/)) {
    return { type: 'STUB', id: 'PREVENT_SELF_MOVE_BY_OPP_EXCEPT_BANISH' } as StubAction;
  }

  // ---- 基本レベルを変更（ターン終了時まで）----
  if (t.match(/次のあなたのターン.*基本レベルを.*にしてもよい/)) {
    return { type: 'STUB', id: 'CHANGE_BASE_LEVEL_UNTIL_NEXT_TURN' } as StubAction;
  }

  // ---- 対戦相手はアンコールとベットができない ----
  if (t.match(/対戦相手はアンコールとベットをできない/)) {
    return { type: 'STUB', id: 'BLOCK_OPP_ENCORE_AND_BET' } as StubAction;
  }

  // ---- このシグニは選んだ能力を得る ----
  if (t.match(/^このシグニは選んだ能力を得る$/)) {
    return { type: 'STUB', id: 'GRANT_CHOSEN_ABILITY_SELF' } as StubAction;
  }

  // ---- ＜ウェポン＞の下にトラッシュからシグニを1枚ずつ置く ----
  if (t.match(/あなたのすべての＜ウェポン＞のシグニの下に.*トラッシュからシグニを.*置く/)) {
    return { type: 'STUB', id: 'PLACE_TRASH_SIGNI_UNDER_ALL_WEAPON' } as StubAction;
  }

  // ---- 対戦相手のシグニゾーンのカード数でパワー減少 ----
  if (t.match(/ターン終了時まで.*それのパワーをあなたのシグニゾーンにある.*につき－/)) {
    return { type: 'STUB', id: 'POWER_DOWN_BY_ZONE_CARD_COUNT' } as StubAction;
  }

  // ---- アタックフェイズ間に下にあるシグニの【自】能力を得る ----
  if (t.match(/あなたのアタックフェイズの間.*このシグニはこのカードの下.*シグニの【自】能力を得る/)) {
    return { type: 'STUB', id: 'GRANT_UNDER_SIGNI_AUTO_ABILITY_ATTACK_PHASE' } as StubAction;
  }

  // ---- 上にあるシグニに起動能力付与 ----
  if (t.match(/このカードの上にある.*シグニは「【起】.*」を得る/s)) {
    return { type: 'STUB', id: 'GRANT_ACTIVATE_ABILITY_TO_SIGNI_ABOVE' } as StubAction;
  }

  // ---- ウェポンシグニの下に1枚置く ----
  if (t.match(/あなたの＜ウェポン＞のシグニ.*あなたのデッキの一番上のカードをそれの下に置く/)) {
    return { type: 'STUB', id: 'PLACE_DECK_TOP_UNDER_WEAPON_SIGNI' } as StubAction;
  }

  // ---- 対戦相手のセンタールリグが特定の場合コスト軽減 ----
  if (t.match(/あなたのセンタールリグが.*の場合.*このアーツの使用コストは.*減る/)) {
    return { type: 'STUB', id: 'ARTS_COST_REDUCTION_BY_CENTER_LRIG' } as StubAction;
  }

  // ---- それは追加で特定ルリグタイプを得る ----
  if (t.match(/^それは追加で.*を得る$/)) {
    return { type: 'STUB', id: 'GAIN_ADDITIONAL_LRIG_TYPE' } as StubAction;
  }

  // ---- ルリグトラッシュからキーを取り出してセンタールリグの下に置く ----
  if (t.match(/あなたのルリグトラッシュから.*キー.*あなたのセンタールリグの下に置く/)) {
    return { type: 'STUB', id: 'LRIG_TRASH_KEY_TO_CENTER_UNDER' } as StubAction;
  }

  // ---- トラッシュからエナゾーンに置かれたとき手札に加えてもよい ----
  if (t.match(/このカードがトラッシュからエナゾーンに置かれたとき.*エナゾーンから手札に加えてもよい/)) {
    return { type: 'STUB', id: 'TRASH_TO_ENERGY_TO_HAND' } as StubAction;
  }

  // ---- 対戦相手のエナゾーンに特定色/無色でないカードが置かれる場合トラッシュ ----
  if (t.match(/対戦相手のエナゾーンに.*色を持たず.*置かれる場合.*トラッシュに置かれる/)) {
    return { type: 'STUB', id: 'OPP_ENERGY_COLOR_CONDITION_TRASH' } as StubAction;
  }

  // ---- 電機シグニにターン終了時まで能力付与 ----
  if (t.match(/あなたの.*シグニ.*ターン終了時まで.*選んだ能力を得る/)) {
    return { type: 'STUB', id: 'SIGNI_GRANT_CHOSEN_ABILITY' } as StubAction;
  }

  // ---- トラッシュから特定カード名指定でシグニ下に置く ----
  {
    const nameMatches = [...t.matchAll(/《([^》]+)》/g)].map(m => m[1]);
    if (nameMatches.length > 0 && t.startsWith('あなたのトラッシュから《') && t.includes('このシグニの下に置く')) {
      if (nameMatches.length === 1) {
        return { type: 'PLACE_UNDER_SIGNI', source: 'trash', count: 1, filter: { cardName: nameMatches[0] } } as PlaceUnderSigniAction;
      }
      // 複数名：「か」ならどれか1枚、「と」なら全部
      const count = /》か《/.test(t) ? 1 : nameMatches.length;
      return { type: 'PLACE_UNDER_SIGNI', source: 'trash', count, upToCount: false, filter: { cardType: 'シグニ' } } as PlaceUnderSigniAction;
    }
  }

  // ---- 対戦相手のシグニをデッキの上から3番目に置く ----
  if (t.match(/対戦相手のシグニ.*をデッキの上から.*番目に置く/)) {
    return { type: 'STUB', id: 'OPP_SIGNI_TO_DECK_NTH' } as StubAction;
  }

  // ---- 対戦相手はエナゾーンから特定操作と引き換え ----
  if (t.match(/対戦相手は.*エナゾーン.*捨てないかぎり.*トラッシュに置く/)) {
    return { type: 'STUB', id: 'OPP_ENERGY_OR_DISCARD_CONDITION' } as StubAction;
  }

  // ---- レベルが奇数偶数のトリックシグニがアタックしたとき ----
  if (t.match(/レベルが(?:奇数|偶数)の.*＜トリック＞.*シグニ.*がアタックしたとき/)) {
    return { type: 'STUB', id: 'TRICK_SIGNI_LEVEL_PARITY_ATTACK' } as StubAction;
  }

  // ---- シグニのレベル差でパワー変動 ----
  if (t.match(/あなたの場にあるシグニのレベルの合計が対戦相手の場にあるシグニのレベルの合計以下の場合/)) {
    return { type: 'STUB', id: 'POWER_BY_LEVEL_SUM_COMPARE' } as StubAction;
  }

  // ---- 対戦相手はシグニの【起】能力を使えない ----
  if (t.match(/対戦相手は自分のシグニの効果によってシグニを新たに場に出せない/)) {
    return { type: 'STUB', id: 'BLOCK_OPP_SIGNI_FIELD_PLACE_BY_SIGNI_EFFECT' } as StubAction;
  }

  // ---- 対戦相手のシグニ1体をターン終了時まで特定パワーに変更 ----
  if (t.match(/対戦相手のシグニ.*ターン終了時まで.*パワーをこのシグニのパワーと同じだけ－/)) {
    return { type: 'STUB', id: 'SET_OPP_SIGNI_POWER_BY_SELF_POWER' } as StubAction;
  }

  // ---- 対戦相手のすべてのシグニと手札とエナゾーンをトラッシュ ----
  if (t.match(/対戦相手のすべてのシグニと.*手札と.*エナゾーン.*トラッシュに置く/)) {
    return { type: 'STUB', id: 'TRASH_ALL_OPP_CARDS' } as StubAction;
  }

  // ---- エナゾーンの色種類でパワーアップ ----
  if (t.match(/このシグニのパワーはあなたのエナゾーンにあるカードが持つ.*色.*種類につき[＋+]/)) {
    return { type: 'STUB', id: 'POWER_BY_ENERGY_COLOR_VARIETY' } as StubAction;
  }

  // ---- 対戦相手はエナゾーンからカードをデッキに移動できない ----
  if (t.match(/対戦相手は自分の効果によってカードをデッキからエナゾーンに移動できない/)) {
    return { type: 'STUB', id: 'BLOCK_OPP_DECK_TO_ENERGY' } as StubAction;
  }

  // ---- 対戦相手のトラッシュから下に置く ----
  if (t.match(/対戦相手のトラッシュから.*対戦相手のシグニ.*の下に置く/)) {
    return { type: 'STUB', id: 'OPP_TRASH_TO_OPP_SIGNI_UNDER' } as StubAction;
  }

  // ---- シグニが《ヘブン》したとき ----
  if (t.match(/あなたのシグニが《ヘブン》したとき.*カードを.*引いてもよい/)) {
    return { type: 'STUB', id: 'DRAW_ON_HEAVEN' } as StubAction;
  }

  // ---- 手札の天使シグニが《ガードアイコン》を持つ ----
  if (t.match(/あなたの手札にある.*シグニは《ガードアイコン》を持つ/)) {
    return { type: 'STUB', id: 'HAND_SIGNI_HAS_GUARD_ICON' } as StubAction;
  }

  // ---- 《コインアイコン》を得て手札を捨てる ----
  if (t.match(/《コインアイコン》を得.*手札を.*捨てる/)) {
    return { type: 'STUB', id: 'GAIN_COIN_AND_DISCARD' } as StubAction;
  }

  // ---- 水獣/特定クラスのシグニが場を離れる代わりにパワー減少 ----
  if (t.match(/あなたの.*シグニ.*対戦相手の効果によって場を離れる場合.*代わりに.*パワーを.*してもよい/)) {
    return { type: 'STUB', id: 'SUBSTITUTE_LEAVE_WITH_POWER_DOWN' } as StubAction;
  }

  // ---- アーツのコストを特定条件で軽減 ----
  if (t.match(/あなたがコストの合計が[０-９\d]+以上のアーツを使用する場合.*使用コストは.*減る/)) {
    return { type: 'STUB', id: 'ARTS_COST_REDUCTION_BY_COST_THRESHOLD' } as StubAction;
  }

  // ---- シードが開花したとき選択効果 ----
  if (t.match(/このシグニが開花したとき.*以下の.*から.*選ぶ/)) {
    return { type: 'STUB', id: 'BLOOM_CHOOSE' } as StubAction;
  }

  // ---- そうした場合、シードを手札に加えデッキ上からシードとして出す ----
  if (t.match(/対象のあなたの【シード】.*手札に加え.*デッキの一番上を見て.*【シード】として.*出す/)) {
    return { type: 'STUB', id: 'SEED_HAND_AND_BLOOM_FROM_DECK_TOP' } as StubAction;
  }

  // ---- 水獣を捨てて同パワーの水獣をターン終了時まで強化 ----
  if (t.match(/あなたの.*のシグニ.*を対象とし.*ターン終了時まで.*パワーを.*捨てたシグニのパワーと同じだけ[＋+]/)) {
    return { type: 'STUB', id: 'POWER_UP_BY_DISCARDED_SIGNI_POWER' } as StubAction;
  }

  // ---- 対戦相手は【ゲート】があるゾーンのシグニをデッキに加えてシャッフル ----
  if (t.match(/対戦相手は.*【ゲート】がある.*シグニゾーン.*シグニをデッキに加えてシャッフルする/)) {
    return { type: 'STUB', id: 'OPP_SIGNI_TO_DECK_BY_GATE' } as StubAction;
  }

  // ---- 対戦相手の手札の上限を減らす ----
  if (t.match(/対戦相手の手札の上限は[０-９\d]+減る/)) {
    return { type: 'STUB', id: 'REDUCE_OPP_HAND_LIMIT' } as StubAction;
  }

  // ---- 各ターン終了時にビートにする ----
  if (t.match(/あなたのトラッシュから.*シグニを.*枚.*を?【ビート】にする/)) {
    return { type: 'STUB', id: 'TRASH_SIGNI_TO_BEAT' } as StubAction;
  }

  // ---- ライズアイコン黒シグニが場に出たとき下に置く ----
  if (t.match(/《ライズアイコン.*》を持つあなたのシグニ.*場に出たとき.*トラッシュからシグニ.*そのシグニの下に置く/)) {
    return { type: 'STUB', id: 'RISE_PLAY_PLACE_FROM_TRASH_UNDER' } as StubAction;
  }

  // ---- 対戦相手シグニのパワーの半分だけ減少 ----
  if (t.match(/対戦相手のすべてのシグニのパワーをこのシグニのパワーの半分だけ－/)) {
    return { type: 'STUB', id: 'ALL_OPP_SIGNI_POWER_DOWN_HALF' } as StubAction;
  }

  // ---- 対象のシグニをウェポンシグニの下に置く ----
  if (t.match(/対象のあなたのシグニ.*対象のあなたの＜ウェポン＞のシグニ.*の下に置く/)) {
    return { type: 'STUB', id: 'SIGNI_UNDER_WEAPON_SIGNI' } as StubAction;
  }

  // ---- デッキの一番上のカードをシグニの下に置く ----
  {
    const m = t.match(/あなたのデッキの一番上のカードを([０-９\d]+)枚?このシグニの下に置く/);
    if (m) return { type: 'PLACE_UNDER_SIGNI', source: 'deck_top', count: parseNum(m[1]) } as PlaceUnderSigniAction;
    if (t.match(/あなたのデッキの一番上のカードをこのシグニの下に置く/)) {
      return { type: 'PLACE_UNDER_SIGNI', source: 'deck_top', count: 1 } as PlaceUnderSigniAction;
    }
  }

  // ---- 限定条件無視アーツ使用 ----
  if (t.match(/あなたは限定条件を無視してアーツを使用できる/)) {
    return { type: 'STUB', id: 'IGNORE_LRIG_RESTRICTION_ARTS' } as StubAction;
  }

  // ---- 場にレベルN+M+Kのシグニがあれば選択効果 ----
  if (t.match(/あなたの場にレベル[０-９\d]+.*シグニがある場合.*以下の.*から.*選ぶ/)) {
    return { type: 'STUB', id: 'CHOOSE_IF_MULTI_LEVEL_SIGNI' } as StubAction;
  }

  // ---- シグニのパワーをセンタールリグのルリグタイプ数で増加 ----
  if (t.match(/このシグニのパワーはあなたのセンタールリグのルリグタイプ.*つき[＋+]/)) {
    return { type: 'STUB', id: 'POWER_BY_CENTER_LRIG_TYPE_COUNT' } as StubAction;
  }

  // ---- シグニの基本パワーは正面のシグニのパワーと同じ ----
  if (t.match(/このシグニの基本パワーは正面のシグニのパワーと同じ値になる/)) {
    return { type: 'STUB', id: 'POWER_EQUALS_FRONT_SIGNI' } as StubAction;
  }

  // ---- シグニ1体にパワーUPと引用符付き自動能力付与 ----
  if (t.match(/あなたのシグニ.*ターン終了時まで.*パワーを[＋+].*「【自】.*」を得る/s)) {
    return { type: 'STUB', id: 'SIGNI_POWER_UP_AND_AUTO_ABILITY' } as StubAction;
  }

  // ---- 手札からカードをシグニの下に置く ----
  if (t.match(/あなたの手札からカードを.*枚.*このシグニの下に置く/)) {
    return { type: 'STUB', id: 'HAND_CARDS_UNDER_SIGNI' } as StubAction;
  }

  // ---- カードが【アクセ】としてシグニに付いたとき選択効果 ----
  if (t.match(/このカードが【アクセ】としてシグニに付いたとき.*以下の.*から.*選ぶ/)) {
    return { type: 'STUB', id: 'ACCE_PLAY_CHOOSE' } as StubAction;
  }

  // ---- サーバントを含むシグニ数でスペルコスト軽減 ----
  if (t.match(/このスペルの使用コストは.*《サーバント》を含むシグニ.*につき.*減る/)) {
    return { type: 'STUB', id: 'SPELL_COST_REDUCTION_BY_SERVANT_COUNT' } as StubAction;
  }

  // ---- 武勇シグニを捨ててもよい（手札から）----
  if (t.match(/手札から.*シグニを.*枚まで捨ててもよい/)) {
    return { type: 'STUB', id: 'OPTIONAL_DISCARD_CLASS_SIGNI' } as StubAction;
  }

  // ---- 英知シグニの【自】能力を発動させる ----
  if (t.match(/あなたの他のシグニ.*【自】の【英知】能力.*発動させる/)) {
    return { type: 'STUB', id: 'TRIGGER_OTHER_SIGNI_EICHI_ABILITY' } as StubAction;
  }

  // ---- ルリグアタックでダメージ受けない（対戦相手レベル以下）----
  if (t.match(/あなたは対戦相手のレベル[０-９\d]+以下のルリグによってダメージを受けない/)) {
    return { type: 'STUB', id: 'PREVENT_LOW_LEVEL_LRIG_DAMAGE' } as StubAction;
  }

  // ---- 日付制限（このカードは場に出せない）----
  if (t.match(/[０-９\d年月日以降]+、このシグニは場に出せない/)) {
    return { type: 'STUB', id: 'DATE_RESTRICTION_CANT_PLAY' } as StubAction;
  }

  // ---- それがルリグでない場合ルリグトラッシュへ ----
  if (t.match(/それがルリグでない場合.*ルリグトラッシュに置く/)) {
    return { type: 'STUB', id: 'NON_LRIG_TO_LRIG_TRASH' } as StubAction;
  }

  // ---- このゲームすべてのセンタールリグが特定タイプを追加で得る ----
  if (t.match(/このゲームの間.*すべての場にあるセンタールリグは.*追加で得る/)) {
    return { type: 'STUB', id: 'ALL_CENTER_LRIG_GAIN_TYPE_GAME_WIDE' } as StubAction;
  }

  // ---- トラッシュ枚数でスペルコスト軽減 ----
  if (t.match(/このスペルの使用コストはあなたのトラッシュにある.*[０-９\d]+枚につき.*減る/)) {
    return { type: 'STUB', id: 'SPELL_COST_REDUCTION_BY_TRASH_COUNT' } as StubAction;
  }

  // ---- 《白》を支払う際代わりに特定シグニをトラッシュ ----
  if (t.match(/あなたが《白》を支払う際.*代わりに.*シグニ.*トラッシュに置いてもよい/)) {
    return { type: 'STUB', id: 'ENERGY_SUBSTITUTE_WHITE_TRASH_SIGNI' } as StubAction;
  }

  // ---- グロウコストで特定シグニをトラッシュ代替 ----
  if (t.match(/グロウコストとして.*《白》を支払う際.*代わりに.*シグニ.*トラッシュに置いてもよい/)) {
    return { type: 'STUB', id: 'GROW_COST_SUBSTITUTE_TRASH_SIGNI' } as StubAction;
  }

  // ---- 対象シグニをセンタールリグの下に置く（乗機乗る）----
  if (t.match(/対象のあなたのセンタールリグ.*対象のあなたの.*シグニ.*に乗る/)) {
    return { type: 'STUB', id: 'CENTER_LRIG_RIDES_ON_SIGNI' } as StubAction;
  }

  // ---- シグニに引用符付き自動能力複数個を付与 ----
  if (t.match(/あなたのシグニ.*ターン終了時まで.*「【常】：.*」を得る/s)) {
    return { type: 'STUB', id: 'SIGNI_GRANT_QUOTED_CONSTANT_ABILITY' } as StubAction;
  }

  // ---- あなたの他の赤のシグニは能力を失わない ----
  if (t.match(/あなたの他の.*のシグニは対戦相手の効果によって能力を失わない/)) {
    return { type: 'STUB', id: 'PREVENT_SIGNI_ABILITY_LOSS_BY_OPP' } as StubAction;
  }

  // ---- ルリグトラッシュのすべてのルリグをこのカードの下に置く ----
  if (t.match(/あなたのルリグトラッシュからすべてのルリグをこのカードの下に置く/)) {
    return { type: 'STUB', id: 'STACK_ALL_LRIG_UNDER' } as StubAction;
  }

  // ---- 【チャーム】数以下のスペル使用禁止 ----
  if (t.match(/対戦相手はコストの合計が場にある【チャーム】の数以下のスペルを使用できない/)) {
    return { type: 'STUB', id: 'BLOCK_LOW_COST_SPELL_BY_CHARM_COUNT' } as StubAction;
  }

  // ---- このシグニのレベルはエナ枚数に比例する ----
  if (t.match(/このシグニのレベルはあなたのエナゾーンにある.*につき.*＋[１-９\d]/)) {
    return { type: 'STUB', id: 'DYNAMIC_LEVEL_BY_ENERGY' } as StubAction;
  }

  // ---- シグニがクラスを失い別クラスを得る ----
  if (t.match(/(?:シグニ|それ).*クラスを失い.*を得る/)) {
    return { type: 'STUB', id: 'CLASS_CHANGE' } as StubAction;
  }

  // ---- 【起】能力コストを《黒×0》にする ----
  if (t.match(/次に.*【起】能力を使用する場合.*コストは《黒×0》になる/)) {
    return { type: 'STUB', id: 'ACTIVATE_COST_ZERO_BLACK' } as StubAction;
  }

  // ---- アクセされていた場合、エナゾーンに置く ----
  if (t.match(/アクセされていた場合.*エナゾーンに置く/)) {
    return { type: 'STUB', id: 'ACCE_TO_ENERGY' } as StubAction;
  }

  // ---- 対戦相手のライフクロスを見て選択的にグロウ ----
  if (t.match(/対戦相手のセンタールリグがレベル[０-９\d]+以上の場合.*グロウコストを支払わずにグロウする/)) {
    return { type: 'STUB', id: 'CONDITIONAL_FREE_GROW' } as StubAction;
  }

  // ---- センタールリグが特定色の場合、このシグニは条件付き能力を得る ----
  if (t.match(/あなたのセンタールリグが.*であるかぎり.*このシグニは.*を得る/)) {
    return { type: 'STUB', id: 'CONDITIONAL_KEYWORD_BY_CENTER_COLOR' } as StubAction;
  }

  // ---- このターンにアタックしていた場合、手札を捨てる ----
  if (t.match(/このターンにこのシグニがアタックしていた場合.*手札を.*枚捨てる/)) {
    return { type: 'STUB', id: 'DISCARD_IF_ATTACKED_THIS_TURN' } as StubAction;
  }

  // ---- 正面以外のシグニゾーンにもアタックできる ----
  if (t.match(/このシグニの正面以外.*シグニゾーンにもアタックできる/)) {
    return { type: 'STUB', id: 'MULTI_ZONE_ATTACK' } as StubAction;
  }

  // ---- 対戦相手のシグニは能力を得られない ----
  if (t.match(/対戦相手のシグニは.*新たに能力を得られない/)) {
    return { type: 'STUB', id: 'PREVENT_OPP_SIGNI_ABILITY_GAIN' } as StubAction;
  }

  // ---- 対戦相手のトラッシュからスペルを使用する ----
  if (t.match(/対戦相手のトラッシュからスペル.*あなたの手札にあるかのように使用する/)) {
    return { type: 'STUB', id: 'CAST_FROM_OPP_TRASH' } as StubAction;
  }

  // ---- 対戦相手の手札とルリグデッキを公開させる ----
  if (t.match(/対戦相手は自分の手札を公開し.*ルリグデッキからカードを.*選び公開する/)) {
    return { type: 'STUB', id: 'OPP_REVEAL_HAND_AND_LRIG_DECK' } as StubAction;
  }

  // ---- 特定センタールリグのとき、トラッシュからエナゾーンに置く ----
  if (t.match(/センタールリグが.*の場合.*トラッシュからエナゾーンに置く/)) {
    return { type: 'STUB', id: 'CONDITIONAL_TRASH_TO_ENERGY' } as StubAction;
  }

  // ---- シグニの【出】能力で指定したシグニがクラスを失い別クラスを得る ----
  if (t.match(/【出】能力で指定された.*シグニ.*クラスと色を失い.*を得る/)) {
    return { type: 'STUB', id: 'PLAY_EFFECT_TARGET_CLASS_CHANGE' } as StubAction;
  }

  // ---- 対戦相手の手札を見て特定スペルを捨てさせる ----
  if (t.match(/対戦相手の手札を見て.*スペル.*捨てさせる/)) {
    return { type: 'STUB', id: 'VIEW_AND_DISCARD_SPELL' } as StubAction;
  }

  // ---- 《ライズアイコン》を持つシグニがバニッシュされる場合、代わりに下のカードをトラッシュ ----
  if (t.match(/《ライズアイコン》.*バニッシュされる場合.*下から.*枚をトラッシュに置いてもよい/)) {
    return { type: 'STUB', id: 'RISE_BANISH_SUBSTITUTE' } as StubAction;
  }

  // ---- スペルの使用コスト減少（色指定あり）----
  {
    const spellCostM = t.match(/あなたが使用する(.+)スペルの使用コストは《[^》]+》減る/);
    if (spellCostM) {
      const costs = parseEnergyCosts(t);
      if (costs.length > 0) {
        return {
          type: 'COST_REDUCTION',
          targetCardType: 'スペル',
          reduction: costs,
          duration: 'PERMANENT',
        } as CostReductionAction;
      }
    }
  }

  // ---- センタールリグがレベルN以上の場合、代わりに複数選択 ----
  if (t.match(/センタールリグ.*レベル[０-９\d]+以上の場合.*代わりに[２-９]つまで選ぶ/)) {
    return { type: 'STUB', id: 'CONDITIONAL_MULTI_CHOOSE' } as StubAction;
  }

  // ---- センタールリグが特定キャラの場合、代わりに複数選択 ----
  if (t.match(/センタールリグが.*の場合.*代わりに[２-９]つまで選ぶ/)) {
    return { type: 'STUB', id: 'CONDITIONAL_MULTI_CHOOSE_BY_CENTER' } as StubAction;
  }

  // ---- ④など番号付きの選択肢 ----
  if (t.match(/^[④⑤⑥][^⑦].*(?:する|ない|る)$/)) {
    return { type: 'STUB', id: 'NUMBERED_CHOICE_OPTION' } as StubAction;
  }


  // ---- アンコール（特定コスト付）----
  if (t.match(/^アンコール－/)) {
    return { type: 'STUB', id: 'ENCORE' } as StubAction;
  }

  // ---- 以下のN個から選ぶ（番号なし）----
  if (t.match(/^以下の[０-９\d２-９]+つから/)) {
    return { type: 'STUB', id: 'CHOOSE_FROM_OPTIONS' } as StubAction;
  }

  // ---- あなたのシグニの効果で対戦相手のパワーが減ったとき、自身パワーUP ----
  if (t.match(/対戦相手のシグニのパワーが減ったとき.*このシグニのパワーを減った値/)) {
    return { type: 'STUB', id: 'REACTIVE_POWER_UP' } as StubAction;
  }

  // ---- このターン、あなたのシグニは対戦相手の効果によってダウンしない ----
  if (t.match(/このターン.*あなたのシグニは対戦相手の効果によってダウンしない/)) {
    return { type: 'STUB', id: 'PREVENT_SIGNI_DOWN_BY_OPP' } as StubAction;
  }

  // ---- このシグニは◎能力を得る（引用符付き複雑な能力文）----
  if (t.match(/このシグニは「【[常出起自]】.*」を得る/s)) {
    return { type: 'STUB', id: 'GRANT_QUOTED_ABILITY' } as StubAction;
  }

  // ---- エナコスト節約（センタールリグの色のエナの代わりにシグニをトラッシュ）----
  if (t.match(/センタールリグが持つ色のエナ.*支払う際.*代わりに.*シグニをトラッシュに置いてもよい/)) {
    return { type: 'STUB', id: 'ENERGY_SUBSTITUTE_TRASH_SIGNI' } as StubAction;
  }

  // ---- 【トラップ】を表向きにして発動 ----
  if (t.match(/【トラップ】.*表向きにし《トラップアイコン》を発動させる/)) {
    return { type: 'STUB', id: 'ACTIVATE_TRAP' } as StubAction;
  }

  // ---- 対戦相手のシグニを【トラップ】として設置 ----
  if (t.match(/対戦相手のシグニ.*【トラップ】としてそのシグニゾーンに設置する/)) {
    return { type: 'STUB', id: 'SET_OPP_SIGNI_AS_TRAP' } as StubAction;
  }

  // ---- 手札からカードを【トラップ】として設置 ----
  if (t.match(/あなたの手札からカード.*【トラップ】.*シグニゾーンに設置してもよい/)) {
    return { type: 'STUB', id: 'SET_HAND_CARD_AS_TRAP' } as StubAction;
  }

  // ---- 対戦相手のエナゾーンにカードが置かれたとき条件付きトラッシュ ----
  if (t.match(/対戦相手のエナゾーンに.*置かれたとき.*以上.*トラッシュに置く/)) {
    return { type: 'STUB', id: 'OPP_ENERGY_OVERFLOW_TRASH_CONDITIONAL' } as StubAction;
  }

  // ---- 対戦相手の効果によってダメージを受けず/ライフクロスは移動しない ----
  if (t.match(/対戦相手の効果によって.*ダメージを受けず/)) {
    return { type: 'STUB', id: 'PREVENT_DAMAGE_AND_LIFE_MOVE_BY_OPP' } as StubAction;
  }

  // ---- 対戦相手の効果によってエナゾーン/手札はトラッシュに移動しない ----
  if (t.match(/対戦相手の効果によって.*(?:エナゾーン|手札).*トラッシュに移動しない/)) {
    return { type: 'STUB', id: 'PREVENT_ZONE_MOVE_BY_OPP' } as StubAction;
  }

  // ---- 他のシグニは対戦相手の効果によってダウンしない ----
  if (t.match(/あなたの(?:他の)?シグニは対戦相手の効果によってダウンしない/)) {
    return { type: 'STUB', id: 'PREVENT_SIGNI_DOWN_BY_OPP_ALL' } as StubAction;
  }

  // ---- 【アクセ】をトラッシュに置く（各ターン終了時）----
  if (t.match(/このシグニに付いている【アクセ】.*トラッシュに置く/)) {
    return { type: 'STUB', id: 'TRASH_ACCE_AT_TURN_END' } as StubAction;
  }

  // ---- 【チャーム】カウントに基づいてカードを引く ----
  if (t.match(/【チャーム】の数に.*加えた枚数のカードを引く/)) {
    return { type: 'STUB', id: 'DRAW_BY_CHARM_COUNT' } as StubAction;
  }

  // ---- 場の＜精羅＞/特定クラスに基づいてコスト軽減 ----
  if (t.match(/あなたの場に.*のシグニがある場合.*使用コストは.*減る/)) {
    return { type: 'STUB', id: 'CONDITIONAL_COST_REDUCTION_BY_FIELD' } as StubAction;
  }

  // ---- パワーN以上のシグニがある場合コスト軽減 ----
  if (t.match(/あなたの場にパワー[０-９\d]+以上のシグニがある場合.*使用コストは.*減る/)) {
    return { type: 'STUB', id: 'COST_REDUCTION_IF_HIGH_POWER_SIGNI' } as StubAction;
  }

  // ---- 各プレイヤーがセンタールリグレベル分手札を捨てる ----
  if (t.match(/各プレイヤーは.*センタールリグのレベルの数だけ手札を捨てる/)) {
    return { type: 'STUB', id: 'BOTH_DISCARD_BY_CENTER_LEVEL' } as StubAction;
  }

  // ---- コイン技を無効にする ----
  if (t.match(/コイン技を無効にする/)) {
    return { type: 'STUB', id: 'NEGATE_COIN_ABILITY' } as StubAction;
  }

  // ---- ウィルス追加コストでのアーツ使用 ----
  if (t.match(/使用コストとして追加で.*【ウィルス】を.*取り除いてもよい/)) {
    return { type: 'STUB', id: 'EXTRA_COST_REMOVE_VIRUS' } as StubAction;
  }

  // ---- アクセコスト軽減 ----
  if (t.match(/このシグニにアクセするための.*使用コストは.*減る/)) {
    return { type: 'STUB', id: 'ACCE_COST_REDUCTION' } as StubAction;
  }

  // ---- 貯菌を置く ----
  if (t.match(/【貯菌】.*置く/)) {
    return { type: 'STUB', id: 'PLACE_CHOKKIN' } as StubAction;
  }

  // ---- ＜調理＞シグニのバニッシュ代替 ----
  if (t.match(/＜調理＞のシグニ.*バニッシュされる場合.*代わりに.*【アクセ】.*トラッシュに置いてもよい/)) {
    return { type: 'STUB', id: 'COOKING_BANISH_SUBSTITUTE' } as StubAction;
  }

  // ---- 《ライズアイコン》を持つシグニのパワーに比例したパワーアップ ----
  if (t.match(/《ライズアイコン》を持つあなたのシグニ.*につき\+[０-９\d]+する/)) {
    return { type: 'STUB', id: 'POWER_UP_BY_RISE_COUNT' } as StubAction;
  }

  // ---- 《ライズアイコン》を持つシグニが場に出たとき選択効果 ----
  if (t.match(/《ライズアイコン》を持つあなたのシグニ.*場に出たとき.*以下の.*から.*選ぶ/)) {
    return { type: 'STUB', id: 'RISE_PLAY_CHOOSE' } as StubAction;
  }

  // ---- デッキのシグニをレベル参照 ----
  if (t.match(/あなたのデッキにある.*シグニのレベルを参照する場合.*として扱ってもよい/)) {
    return { type: 'STUB', id: 'DECK_SIGNI_LEVEL_OVERRIDE' } as StubAction;
  }

  // ---- 水獣/特定クラスのシグニが場を離れたとき引く ----
  if (t.match(/あなたの.*のシグニ.*対戦相手の効果によって場を離れたとき.*カードを.*引いてもよい/)) {
    return { type: 'STUB', id: 'DRAW_ON_SIGNI_LEAVE_BY_OPP' } as StubAction;
  }

  // ---- シグニ下に積む（トラッシュからシグニ）----
  {
    // それぞれN枚まで（レベルN, M, K のシグニをそれぞれ）
    const mEach = t.match(/あなたのトラッシュから((?:レベル[０-９\d]+[、，]?)+)のシグニをそれぞれ([０-９\d]+)枚まで.*このシグニの下に置く/);
    if (mEach) {
      const levelCount = (mEach[1].match(/レベル/g) || []).length;
      const perCount = parseNum(mEach[2]);
      return { type: 'PLACE_UNDER_SIGNI', source: 'trash', count: levelCount * perCount, upToCount: true, filter: { cardType: 'シグニ' } } as PlaceUnderSigniAction;
    }
    // N枚まで or N枚を（レベル・クラス条件付き）
    const m = t.match(/あなたのトラッシュから(＜[^＞]+＞の|共通する色を持たない)?(?:レベル[０-９\d＋以下上]+の)?([＜〈<][^＞〉>]+[＞〉>]の)?(?:シグニ|カード)を?([０-９\d]+)枚?(まで)?(?:を)?対象とし.*このシグニの下に置く/);
    if (m) {
      const cnt = parseNum(m[3]);
      const storyFilter = (m[1] || m[2]) ? parseStoryFilter(m[1] ?? m[2] ?? '') : {};
      return {
        type: 'PLACE_UNDER_SIGNI',
        source: 'trash',
        count: cnt,
        upToCount: !!m[4],
        filter: { cardType: 'シグニ', ...storyFilter },
      } as PlaceUnderSigniAction;
    }
    // フォールバック：トラッシュから置く
    if (t.match(/あなたのトラッシュから.*シグニ.*枚.*このシグニの下に置く/)) {
      return { type: 'PLACE_UNDER_SIGNI', source: 'trash', count: 1, filter: { cardType: 'シグニ' } } as PlaceUnderSigniAction;
    }
  }

  // ---- 下にあるシグニの【常】能力を得る ----
  if (t.match(/このシグニはこのカードの下にあるシグニの【常】.*能力を得る/)) {
    return { type: 'STUB', id: 'GRANT_UNDER_SIGNI_CONSTANT_ABILITY' } as StubAction;
  }

  // ---- 基本レベルを変更 ----
  if (t.match(/このシグニの基本レベルを.*にしてもよい/)) {
    return { type: 'STUB', id: 'CHANGE_BASE_LEVEL' } as StubAction;
  }

  // ---- 【トラップ】を手札に加える ----
  if (t.match(/あなたの【トラップ】.*手札に加える/)) {
    return { type: 'STUB', id: 'TRAP_TO_HAND' } as StubAction;
  }

  // ---- 手札からスペルを使用する ----
  if (t.match(/あなたの手札から.*スペル.*コストを支払って使用する/)) {
    return { type: 'STUB', id: 'PLAY_SPELL_FROM_HAND' } as StubAction;
  }

  // ---- 対戦相手の場に【ウィルス】がない場合このシグニをトラッシュ ----
  if (t.match(/対戦相手の場に【ウィルス】がない場合.*このシグニを.*トラッシュに置く/)) {
    return { type: 'STUB', id: 'SELF_TRASH_IF_NO_OPP_VIRUS' } as StubAction;
  }

  // ---- 対戦相手のシグニ１体とこのシグニが同じカードになる ----
  if (t.match(/対象のあなたのシグニ.*トラッシュにある.*シグニ.*と同じカードになる/)) {
    return { type: 'STUB', id: 'COPY_SIGNI' } as StubAction;
  }

  // ---- 対戦相手は追加で《ガードアイコン》カードを捨てないとガードできない ----
  if (t.match(/手札から《ガードアイコン》.*追加で.*捨てないかぎり【ガード】ができない/)) {
    return { type: 'STUB', id: 'EXTRA_GUARD_COST_FROM_HAND' } as StubAction;
  }

  // ---- ルリグデッキのレゾナに出現条件追加 ----
  if (t.match(/あなたのルリグデッキにあるレゾナは出現条件に追加で.*を持つ/)) {
    return { type: 'STUB', id: 'ADD_RESONANCE_CONDITION' } as StubAction;
  }

  // ---- ライズされたとき能力付与 ----
  if (t.match(/ライズされたとき.*シグニは.*能力を得る/s)) {
    return { type: 'STUB', id: 'GRANT_ABILITY_ON_RISE' } as StubAction;
  }

  // ---- 手札からスペルをコスト不要で使用 ----
  if (t.match(/あなたの手札から.*スペル.*コストを支払わずに使用してもよい/)) {
    return { type: 'STUB', id: 'PLAY_SPELL_FROM_HAND_FREE' } as StubAction;
  }

  // ---- このシグニはすべてのクラスを持つ ----
  if (t.match(/このシグニはすべてのクラスを持つ/)) {
    return { type: 'STUB', id: 'ALL_CLASS' } as StubAction;
  }

  // ---- 下にあるシグニの複数能力を得る ----
  if (t.match(/このシグニはこのカードの下にある.*シグニの【常】と【自】と【起】の能力/)) {
    return { type: 'STUB', id: 'GRANT_UNDER_SIGNI_ALL_ABILITIES' } as StubAction;
  }

  // ---- 英知能力が有効になる ----
  if (t.match(/【英知】能力.*有効になる/)) {
    return { type: 'STUB', id: 'ACTIVATE_EICHI_ABILITY' } as StubAction;
  }

  // ---- アタックフェイズの間レベル参照変更 ----
  if (t.match(/アタックフェイズの間.*レベルを参照する場合.*レベルは.*として扱う/)) {
    return { type: 'STUB', id: 'ATTACK_PHASE_LEVEL_OVERRIDE' } as StubAction;
  }

  // ---- アクセされているシグニが能力を得る ----
  if (t.match(/これにアクセされている.*シグニは.*を得る/s)) {
    return { type: 'STUB', id: 'ACCE_SIGNI_GRANT_ABILITY' } as StubAction;
  }

  // ---- 対戦相手のシグニに起動能力付与 ----
  if (t.match(/対戦相手のレベル.*シグニ.*【起】.*能力を持つ.*ターン終了時.*トラッシュ/s)) {
    return { type: 'STUB', id: 'OPP_SIGNI_SELF_TRASH_TRIGGER' } as StubAction;
  }

  // ---- 対戦相手のシグニが攻撃不可コスト付き ----
  if (t.match(/対戦相手のすべてのシグニは.*支払わないかぎりアタックできない.*を得る/s)) {
    return { type: 'STUB', id: 'OPP_SIGNI_ATTACK_COST' } as StubAction;
  }

  // ---- 対戦相手のエナゾーン超過でトラッシュ ----
  if (t.match(/対戦相手のエナゾーンにカードが[０-９\d]+枚以上ある場合.*トラッシュに置く/)) {
    return { type: 'STUB', id: 'OPP_ENERGY_EXCESS_TRASH' } as StubAction;
  }

  // ---- 次のターンまで引ける枚数制限 ----
  if (t.match(/次のターンの間.*対戦相手はカードを合計[０-９\d]+枚までしか引けない/)) {
    return { type: 'STUB', id: 'LIMIT_OPP_DRAW_COUNT' } as StubAction;
  }

  // ---- レゾナの出現条件のカードをエナゾーンに置く ----
  if (t.match(/レゾナの出現条件のためにトラッシュに置いたカード.*エナゾーンに置く/)) {
    return { type: 'STUB', id: 'RESONANCE_COST_CARDS_TO_ENERGY' } as StubAction;
  }

  // ---- トラッシュから3種類のゾーンに置く ----
  if (t.match(/あなたのトラッシュから.*エナゾーンに置き.*手札に加え.*デッキの一番下に置く/)) {
    return { type: 'STUB', id: 'TRIPLE_ZONE_DISTRIBUTE_FROM_TRASH' } as StubAction;
  }

  // ---- ルリグデッキから特定ルリグをこのルリグの上に置く ----
  if (t.match(/あなたのルリグデッキから.*このルリグの上に置く/)) {
    return { type: 'STUB', id: 'PLACE_LRIG_FROM_DECK_ON_TOP' } as StubAction;
  }

  // ---- 凍結状態のシグニが場を離れる場合トラッシュ ----
  if (t.match(/対戦相手の凍結状態のシグニが場を離れる場合.*トラッシュに置かれる/)) {
    return { type: 'STUB', id: 'FROZEN_SIGNI_TO_TRASH_ON_LEAVE' } as StubAction;
  }

  // ---- 感染状態のシグニの起動能力使用禁止 ----
  if (t.match(/対戦相手は感染状態のシグニの【起】能力を使用できない/)) {
    return { type: 'STUB', id: 'PREVENT_INFECTED_SIGNI_ACTIVATE' } as StubAction;
  }

  // ---- あなたの効果1つによるレベル参照override ----
  if (t.match(/あなたの効果[０-９\d]*つによってこのシグニのレベルを参照する場合.*として扱ってもよい/)) {
    return { type: 'STUB', id: 'LEVEL_REFERENCE_OVERRIDE_BY_OWN_EFFECT' } as StubAction;
  }

  // ---- 【トラップ】と同じゾーンにシグニがない場合シグニになる ----
  if (t.match(/この【トラップ】と同じシグニゾーンにシグニがない場合.*シグニにする/)) {
    return { type: 'STUB', id: 'TRAP_TO_SIGNI_IF_ZONE_EMPTY' } as StubAction;
  }

  // ---- 英知シグニの基本レベル変更 ----
  if (t.match(/あなたの＜英知＞のシグニ.*基本レベルを.*にする/)) {
    return { type: 'STUB', id: 'CHANGE_EICHI_SIGNI_BASE_LEVEL' } as StubAction;
  }

  // ---- 次の対戦相手ターン終了時まで保護 ----
  if (t.match(/次の対戦相手のターン終了時まで.*ダメージを受けず/)) {
    return { type: 'STUB', id: 'PREVENT_DAMAGE_UNTIL_OPP_TURN_END' } as StubAction;
  }

  // ---- 次のターンまでゲームに敗北しない ----
  if (t.match(/次の.*ターン.*ゲームに敗北しない/)) {
    return { type: 'STUB', id: 'PREVENT_DEFEAT_UNTIL_NEXT_TURN' } as StubAction;
  }

  // ---- ライズシグニが場を離れる際にその下のカードをトラッシュ ----
  if (t.match(/アタックフェイズの間.*《ライズアイコン》を持つあなたのシグニが.*場を離れる場合.*その下からすべてのカード/)) {
    return { type: 'STUB', id: 'RISE_LEAVE_DISCARD_STACK' } as StubAction;
  }

  // ---- このルリグのリミット増加と追加色取得 ----
  if (t.match(/このルリグのリミットは[０-９\d]+増え.*追加で.*を得る/)) {
    return { type: 'STUB', id: 'LRIG_LIMIT_UP_AND_COLOR_GAIN' } as StubAction;
  }

  // ---- このシグニは対戦相手の効果によってダウンしない ----
  if (t.match(/このシグニは対戦相手の効果によってダウンしない/)) {
    return { type: 'STUB', id: 'PREVENT_SELF_DOWN_BY_OPP' } as StubAction;
  }

  // ---- ＜ウェポン＞シグニはダウンしない ----
  if (t.match(/あなたの＜ウェポン＞のシグニは対戦相手の効果によってダウンしない/)) {
    return { type: 'STUB', id: 'WEAPON_SIGNI_PREVENT_DOWN' } as StubAction;
  }

  // ---- 各ターンパワーに基づいてアタック回数制限 ----
  if (t.match(/このシグニは自身のパワー.*につき一度までしかアタックできない/)) {
    return { type: 'STUB', id: 'ATTACK_COUNT_BY_POWER' } as StubAction;
  }

  // ---- パワー上限設定 ----
  if (t.match(/このシグニのパワーは[０-９\d]+より大きくならない/)) {
    return { type: 'STUB', id: 'POWER_CAP' } as StubAction;
  }

  // ---- 対戦相手のシグニのパワーが－される場合、代わりに２倍 ----
  if (t.match(/対戦相手のシグニのパワーが－.*される場合.*代わりに２倍/)) {
    return { type: 'STUB', id: 'DOUBLE_POWER_MINUS' } as StubAction;
  }

  // ---- バニッシュ代替（ライズ下のカードをトラッシュ）----
  if (t.match(/このシグニがバニッシュされる場合.*代わりにこのシグニの下から.*トラッシュに置く/)) {
    return { type: 'STUB', id: 'BANISH_SUBSTITUTE_RISE_STACK' } as StubAction;
  }

  // ---- トラッシュから天使シグニを別シグニの下に置く ----
  if (t.match(/あなたのトラッシュから.*シグニ.*あなたの.*シグニ.*の下に置く/)) {
    return { type: 'STUB', id: 'TRASH_SIGNI_UNDER_FIELD_SIGNI' } as StubAction;
  }

  // ---- アクセされているシグニがすべての色を得る ----
  if (t.match(/アクセされている.*シグニはすべての色を得る/)) {
    return { type: 'STUB', id: 'ACCE_SIGNI_ALL_COLOR' } as StubAction;
  }

  // ---- あなたのターン中にレゾナが場に出たとき選択 ----
  if (t.match(/あなたのターン.*レゾナ.*が場に出たとき.*以下の.*から.*選ぶ/)) {
    return { type: 'STUB', id: 'RESONANCE_PLAY_CHOOSE' } as StubAction;
  }

  // ---- あなたのシグニのパワーが【アクセ】数に比例 ----
  if (t.match(/このシグニのパワーはあなたの場にある【アクセ】.*につき/)) {
    return { type: 'STUB', id: 'POWER_BY_ACCE_COUNT' } as StubAction;
  }

  // ---- ライフクロスの上からN枚を好きな順番で戻す ----
  {
    const lifeReorderM = t.match(/ライフクロスの上からカードを([０-９\d]+)枚見て.*好きな順番で一番上に戻す/);
    if (lifeReorderM) {
      return {
        type: 'LOOK_AND_REORDER',
        source: { location: 'life_cloth' as import('../types/effects').CardLocation, owner: 'self' },
        count: parseNum(lifeReorderM[1]),
        private: true,
        reorder: true,
        canTrash: false,
        destination: { location: 'life_cloth' as import('../types/effects').CardLocation, owner: 'self', position: 'any' },
      } as LookAndReorderAction;
    }
  }

  // ---- ルリグデッキにクラフトの《CardName》N枚を加える ----
  {
    const m = t.match(/あなたのルリグデッキにクラフトの《([^》]+)》([１-９\d一二三四五六七八九十]+)枚を加える/);
    if (m) {
      const count = parseNum(m[2]);
      return {
        type: 'ADD_CRAFT_TO_LRIG_DECK',
        owner: 'self',
        cardName: m[1],
        count: count > 0 ? count : 1,
      } as AddCraftToLrigDeckAction;
    }
  }

  // ---- センタールリグは「【自】...」を得る ----
  if (t.match(/あなたのセンタールリグは「【[常出起自]】/s)) {
    return { type: 'STUB', id: 'CENTER_LRIG_GAIN_AUTO_ABILITY' } as StubAction;
  }

  // ---- 引用符の内側のテキスト（...」を得る で終わる）----
  if (t.endsWith('」を得る') || t.endsWith('」を得る。')) {
    const quoted = (t.match(/「([^」]+)」を得る/) ?? [])[1] ?? '';
    if (quoted.includes('アタックできない')) {
      return { type: 'BLOCK_ACTION', target: { type: 'SIGNI', owner: 'any', count: 1 }, actionId: 'ATTACK', until: 'END_OF_TURN' } as BlockActionAction;
    }
    const kwMatch = quoted.match(/^(ランサー|アサシン|ダブルクラッシュ|トリプルクラッシュ|シャドウ|バニッシュ耐性|シールド|チャーム)$/);
    if (kwMatch) {
      return { type: 'GRANT_KEYWORD', target: { type: 'SIGNI', owner: 'any', count: 1 }, keyword: kwMatch[1], duration: 'UNTIL_END_OF_TURN' } as GrantKeywordAction;
    }
    return { type: 'STUB', id: 'GRANT_ABILITY_INNER_TEXT' } as StubAction;
  }

  // ---- そのアタックを無効にする（単独）----
  if (t.match(/^そのアタックを無効にする/)) {
    return { type: 'STUB', id: 'NEGATE_THAT_ATTACK' } as StubAction;
  }

  // ---- このシグニのパワーをXを持つシグニ１体につき＋Nする ----
  if (t.match(/このシグニのパワーを.*を持つ.*シグニ１体につき[＋+]\d+する/)) {
    return { type: 'STUB', id: 'POWER_BOOST_PER_SIGNI_WITH_ICON' } as StubAction;
  }

  // ---- カード名を宣言して相手デッキ公開 ----
  if (t.match(/カード名[１-９\d一二三]つを宣言する/)) {
    return { type: 'STUB', id: 'DECLARE_CARD_NAME' } as StubAction;
  }

  // ---- 対戦相手が選択して行う（以下の〜から〜を選ぶ）----
  if (t.match(/対戦相手は以下の[２-９\d]つから[１-９\d]つを選び.*対戦相手はそれを行う/s)) {
    return { type: 'STUB', id: 'OPP_CHOOSE_EFFECT' } as StubAction;
  }

  // ---- 【アクセ】にする ----
  if (t.match(/【アクセ】にする/)) {
    return { type: 'STUB', id: 'ACCE_FROM_HAND' } as StubAction;
  }

  // ---- このシグニを他のシグニゾーンに配置 ----
  if (t.match(/このシグニを他のシグニゾーンに配置/)) {
    return { type: 'STUB', id: 'MOVE_TO_OTHER_SIGNI_ZONE' } as StubAction;
  }

  // ---- それのパワーをアタックしたシグニのレベル１につき±Nする ----
  if (t.match(/それのパワーをアタックした.*シグニのレベル[１-９\d]につき[＋＋－-]/)) {
    return { type: 'STUB', id: 'POWER_MOD_BY_ATTACKER_LEVEL' } as StubAction;
  }

  // ---- アップ状態のシグニをトラッシュに置く ----
  if (t.includes('アップ状態のシグニ') && t.includes('トラッシュに置く')) {
    const owner: Owner = t.includes('対戦相手') ? 'opponent' : 'self';
    return { type: 'BANISH', target: parseSigniTarget(t, owner) };
  }

  // ---- このシグニは覚醒する ----
  if (t.includes('覚醒する') || t.includes('覚醒状態にする')) {
    return { type: 'AWAKEN_SIGNI' } as AwakenSigniAction;
  }

  // ---- 歌のカケラ ----
  if (t.includes('歌のカケラ')) {
    return { type: 'STUB', id: 'SONG_FRAGMENT' } as StubAction;
  }

  // ---- ルリグの下のカード操作（ソウル・移動） ----
  if (t.match(/ルリグの下.+カード/) || t.includes('ソウル】にする')) {
    return { type: 'STUB', id: 'LRIG_UNDER_CARD_OP' } as StubAction;
  }

  // ---- デッキからN枚このシグニの下に置く ----
  {
    const m = t.match(/あなたのデッキの上からカードを([０-９\d]+)枚?このシグニの下に置く/);
    if (m) return { type: 'PLACE_UNDER_SIGNI', source: 'deck_top', count: parseNum(m[1]) } as PlaceUnderSigniAction;
    // シャッフルしてデッキ上からN枚置く
    const ms = t.match(/デッキをシャッフルし上からカード([０-９\d]+)枚をこのシグニの下に置く/);
    if (ms) {
      return {
        type: 'SEQUENCE', steps: [
          { type: 'SHUFFLE_DECK', owner: 'self' },
          { type: 'PLACE_UNDER_SIGNI', source: 'deck_top', count: parseNum(ms[1]) },
        ]
      } as import('../types/effects').SequenceAction;
    }
  }

  // ---- エナゾーンからN枚このシグニの下に置く ----
  {
    const m = t.match(/あなたのエナゾーンから((?:《ガードアイコン》を持たない)?(?:カード|シグニ))を?([０-９\d]+)枚?(まで)?(?:を対象とし、それ(?:ら)?を)?このシグニの下に置く/);
    if (m) {
      return {
        type: 'PLACE_UNDER_SIGNI',
        source: 'energy',
        count: parseNum(m[2]),
        upToCount: !!m[3],
        filter: { cardType: 'シグニ' },
      } as PlaceUnderSigniAction;
    }
  }

  // ---- 手札からN枚このシグニの下に置く ----
  {
    const m = t.match(/あなたの手札から((?:レベル[０-９\d０-９]+の)?(?:シグニ|カード))を?([０-９\d]+)枚?(まで)?(?:を対象とし、それ(?:ら)?を)?このシグニの下に置く/);
    if (m) {
      return {
        type: 'PLACE_UNDER_SIGNI',
        source: 'hand',
        count: parseNum(m[2]),
        upToCount: !!m[3],
        filter: { cardType: 'シグニ' },
      } as PlaceUnderSigniAction;
    }
    // 「あなたは手札をN枚まで」形式
    const m2 = t.match(/あなたは手札を([０-９\d]+)枚?(まで)?このシグニの下に置く/);
    if (m2) {
      return { type: 'PLACE_UNDER_SIGNI', source: 'hand', count: parseNum(m2[1]), upToCount: !!m2[2], filter: { cardType: 'シグニ' } } as PlaceUnderSigniAction;
    }
  }

  // ---- シグニの下にカードを置く（手札・エナ・デッキから、汎用） ----
  if (t.match(/(?:このシグニ|シグニ１体)の下に置く/) || t.match(/このシグニの下から.*エナゾーンに置く/)) {
    return { type: 'STUB', id: 'PLACE_CARD_UNDER_SIGNI' } as StubAction;
  }

  // ---- クラフト ----
  if (t.includes('クラフトから') && t.includes('ルリグデッキに加える')) {
    return { type: 'STUB', id: 'CRAFT_TO_LRIG_DECK' } as StubAction;
  }

  // ---- アーツ移動不可 ----
  if (t.match(/アーツ.*ルリグデッキから他の領域に移動しない/)) {
    return { type: 'STUB', id: 'ARTS_IMMOVABLE' } as StubAction;
  }

  // ---- 各ターンに一度しかアタックできない ----
  if (t.match(/各ターンに一度しかアタックできない/)) {
    return { type: 'STUB', id: 'ONE_ATTACK_PER_TURN' } as StubAction;
  }

  // ---- 対戦相手がシグニを選びエナゾーンに置く ----
  if (t.match(/対戦相手は自分の.+シグニ.+選び.+エナゾーン/)) {
    return { type: 'STUB', id: 'OPP_CHOOSE_SIGNI_TO_ENERGY' } as StubAction;
  }

  // ---- コラボ・コラボライバー ----
  if (t.includes('コラボライバー') || t.includes('コラボしてもよい')) {
    return { type: 'STUB', id: 'COLLAB' } as StubAction;
  }

  // ---- デッキ一番上を見て一番下に置いてもよい ----
  if (t.match(/デッキの一番上を見て.*一番下に置いてもよい/)) {
    return { type: 'STUB', id: 'TOP_TO_BOTTOM_OPTIONAL' } as StubAction;
  }

  // ---- 対戦相手のシグニN体を対象とし、このターン、次にアタックしたとき無効 ----
  {
    const m = t.match(/対戦相手の(?:シグニ(?:やルリグ)?|ルリグとシグニ)(?:を([１-９\d０-９]+)体)?(?:まで)?を?対象とし.*次に.*アタックしたとき.*そのアタックを無効にする/);
    if (m || t.includes('アタックしたとき、そのアタックを無効にする')) {
      const cnt = m?.[1] ? parseNum(m[1]) : 1;
      return {
        type: 'NEGATE_ATTACK',
        target: { type: 'SIGNI', owner: 'opponent', count: cnt, upToCount: t.includes('まで') },
      } as NegateAttackAction;
    }
  }
  // ---- アタックを無効にする（一度・汎用） ----
  if (t.includes('アタックを無効') && !t.includes('無効にし')) {
    return { type: 'STUB', id: 'NEGATE_ATTACK_ON_TRIGGER' } as StubAction;
  }

  // ---- 場所（ゾーン）を入れ替える → REARRANGE_SIGNI (swap) ----
  if (t.includes('場所を入れ替える') || t.includes('場所を入れ替えてもよい')) {
    return { type: 'REARRANGE_SIGNI', target: { type: 'SIGNI', owner: 'any', count: 1 }, swap: true } as RearrangeSigniAction;
  }

  // ---- すべての領域で色を失う ----
  if (t.match(/すべての領域で色を失う/)) {
    return { type: 'STUB', id: 'LOSE_COLOR_ALL_ZONES' } as StubAction;
  }

  // ---- ルリグ名コピー（ルリグトラッシュのルリグと同じカード名） ----
  if (t.match(/ルリグトラッシュにある.+と同じカード名/)) {
    return { type: 'STUB', id: 'COPY_LRIG_NAME_ABILITY' } as StubAction;
  }

  // ---- 〈クラス〉のシグニN体につきカードをM枚引く ----
  {
    const m = t.match(/(あなた|対戦相手)?の?場にある(＜[^＞]+＞の)?シグニ([０-９\d]+)体につきカードを([０-９\d]+)枚引く/);
    if (m) {
      const countOwner: Owner = m[1] === '対戦相手' ? 'opponent' : 'self';
      const storyFilter = m[2] ? parseStoryFilter(m[2]) : {};
      return {
        type: 'DRAW_PER_FIELD_COUNT',
        drawPerUnit: parseNum(m[4]),
        countFilter: { cardType: 'シグニ', ...storyFilter },
        countOwner,
      } as DrawPerFieldCountAction;
    }
  }

  // ---- 対戦相手のシグニ/ルリグのパワーをX×N修正（動的倍率） ----
  if (t.match(/シグニ１体につき[－＋][０-９\d]+する/) || t.match(/につき[－＋][０-９\d]+される/)) {
    return { type: 'STUB', id: 'POWER_MOD_PER_COUNT' } as StubAction;
  }

  // ---- 各プレイヤーがドローして捨てる ----
  if (t.match(/各プレイヤーは.*カードを.*引き.*手札を.*捨てる/)) {
    return { type: 'STUB', id: 'EACH_PLAYER_DRAW_DISCARD' } as StubAction;
  }

  // ---- このシグニをデッキの一番上に置く ----
  if (t.match(/このシグニをデッキの一番上に置く/)) {
    return { type: 'STUB', id: 'SELF_TO_DECK_TOP' } as StubAction;
  }

  // ---- パワーが対戦相手の効果でマイナスされる場合プラスになる ----
  if (t.match(/対戦相手の効果によって－.*される場合.*代わりに＋/)) {
    return { type: 'STUB', id: 'REVERSE_OPP_POWER_MINUS' } as StubAction;
  }

  // ---- 対戦相手がデッキ一番上と手札を公開する ----
  if (t.match(/対戦相手はデッキの一番上と手札を公開する/)) {
    return { type: 'STUB', id: 'OPP_REVEAL_TOP_AND_HAND' } as StubAction;
  }

  // ---- 対戦相手のターンは使用コスト増加 ----
  if (t.match(/対戦相手のターンの場合.*エナコストを支払えない/)) {
    return { type: 'STUB', id: 'OPP_TURN_NO_ENERGY_COST' } as StubAction;
  }

  // ---- 対戦相手はルリグでアタックできない ----
  if (t.match(/対戦相手は.*(?:《無》|コスト).*支払わないかぎりルリグでアタックできない/)) {
    return { type: 'STUB', id: 'OPP_LRIG_ATTACK_COST' } as StubAction;
  }

  // ---- このターン、プレイヤーはそれ（対象ルリグ）でアタックできない ----
  if (t.match(/このターン.*プレイヤーはそれでアタックできない/)) {
    return { type: 'STUB', id: 'PREVENT_TARGET_LRIG_ATTACK_THIS_TURN' } as StubAction;
  }

  // ---- アーツの《無》コストはセンタールリグの色でしか支払えない ----
  if (t.match(/このアーツの使用コストに含まれる《無》コストは.*センタールリグが持つ色でしか支払えない/)) {
    return { type: 'STUB', id: 'ARTS_COLORLESS_MUST_PAY_CENTER_COLOR' } as StubAction;
  }

  // ---- グリッド固有デッキ公開+1 ----
  if (t.match(/デッキ上公開枚数\+[０-９\d]+/)) {
    return { type: 'STUB', id: 'GRID_REVEAL_PLUS' } as StubAction;
  }

  // ---- ガード代替コスト ----
  if (t.match(/【ガード】する際.*代わりに/)) {
    return { type: 'STUB', id: 'GUARD_ALTERNATIVE_COST' } as StubAction;
  }

  // ---- 特定カードの使用コスト減少 ----
  if (t.match(/《.+》の使用コストは《無×[０-９\d]+》減る/)) {
    return { type: 'STUB', id: 'SPECIFIC_CARD_COST_REDUCE' } as StubAction;
  }

  // ---- シグニが場を離れる場合デッキ一番下 ----
  if (t.match(/場を離れる場合.*代わりに.*デッキの一番下に置いてもよい/)) {
    return { type: 'STUB', id: 'LEAVE_FIELD_TO_DECK_BOTTOM' } as StubAction;
  }

  // ---- デッキシャッフルしてシグニの下に置く ----
  if (t.match(/デッキをシャッフルし.*シグニの下に置く/)) {
    return { type: 'STUB', id: 'SHUFFLE_DECK_UNDER_SIGNI' } as StubAction;
  }

  // ---- ライフバーストが二度発動する ----
  if (t.match(/ライフバーストは二度発動する/)) {
    return { type: 'STUB', id: 'LIFE_BURST_DOUBLE' } as StubAction;
  }

  // ---- 対戦相手のシグニがバニッシュされる場合手札に戻る ----
  if (t.match(/バニッシュされる場合.*手札に戻される/)) {
    return { type: 'STUB', id: 'BANISH_REDIRECT_TO_HAND' } as StubAction;
  }

  // ---- 対戦相手のシグニが場を離れる場合トラッシュに置かれる ----
  if (t.match(/対戦相手のシグニが場を離れる場合.*トラッシュに置かれる/)) {
    return { type: 'STUB', id: 'OPP_SIGNI_LEAVE_TO_TRASH' } as StubAction;
  }

  // ---- 【常】能力の効果でパワーはプラスされない ----
  if (t.match(/【常】能力の効果.*パワーは.*プラス.*されない/)) {
    return { type: 'STUB', id: 'BLOCK_CONTINUOUS_POWER_PLUS' } as StubAction;
  }

  // ---- 対戦相手はシグニゾーンにレベルN以上を配置できない ----
  if (t.match(/対戦相手は中央のシグニゾーンにレベル.*以上のシグニを.*配置できない/)) {
    return { type: 'STUB', id: 'OPP_ZONE_PLACEMENT_RESTRICT' } as StubAction;
  }

  // ---- このターン対戦相手はシグニで合計一度しかアタックできない ----
  if (t.match(/対戦相手はシグニで合計一度しかアタックできない/)) {
    return { type: 'STUB', id: 'OPP_SIGNI_ONE_ATTACK_TOTAL' } as StubAction;
  }

  // ---- アップ状態のシグニをダウンして選択 ----
  if (t.match(/アップ状態の.*シグニ.*ダウン/)) {
    return { type: 'STUB', id: 'DOWN_UP_SIGNI_AND_CHOOSE' } as StubAction;
  }

  // ---- デッキ一番下を見る ----
  if (t.match(/デッキの一番下のカードを見る/)) {
    return { type: 'STUB', id: 'LOOK_DECK_BOTTOM' } as StubAction;
  }

  // ---- ターン中と次のターンの間、対戦相手シグニの【自】能力発動しない ----
  if (t.match(/このターンと次のターンの間.*シグニの【自】能力は発動しない/)) {
    return { type: 'STUB', id: 'BLOCK_OPP_AUTO_ABILITY_EXTENDED' } as StubAction;
  }

  // ---- 対戦相手のメインフェイズ間リミット減少 ----
  if (t.match(/対戦相手のメインフェイズの間.*リミット/)) {
    return { type: 'STUB', id: 'OPP_MAIN_PHASE_LIMIT_DOWN' } as StubAction;
  }

  // ---- 白のシグニは効果で能力を失わない ----
  if (t.match(/白のシグニは対戦相手の効果によって能力を失わない/)) {
    return { type: 'STUB', id: 'WHITE_SIGNI_ABILITY_PROTECT' } as StubAction;
  }

  // ---- シグニが対戦相手の効果でエナゾーン以外に移動しない ----
  if (t.match(/対戦相手の効果によって場からエナゾーン以外の領域に移動しない/)) {
    return { type: 'STUB', id: 'SIGNI_PROTECT_MOVE_EXCEPT_ENERGY' } as StubAction;
  }

  // ---- 対戦相手は追加で無を支払わないかぎりガードできない ----
  if (t.match(/追加で《無》を支払わないかぎり【ガード】ができない/)) {
    return { type: 'STUB', id: 'OPP_GUARD_COST_COLORLESS' } as StubAction;
  }

  // ---- 対戦相手のアーツ・スペル・起使用不可（複合） ----
  if (t.match(/アーツとスペルと【起】能力を使用できない/)) {
    return { type: 'STUB', id: 'BLOCK_OPP_ARTS_SPELL_ACT' } as StubAction;
  }

  // ---- このルリグは特定色のルリグにしかグロウできない ----
  if (t.match(/このルリグは.+のルリグにしかグロウできない/)) {
    return { type: 'STUB', id: 'LRIG_GROW_RESTRICT' } as StubAction;
  }

  // ---- 場にあるこのルリグはすべてのルリグのカード名を得る ----
  if (t.match(/このルリグはすべてのルリグのカード名を得る/)) {
    return { type: 'STUB', id: 'LRIG_ALL_NAMES' } as StubAction;
  }

  // ---- エナフェイズ終了時までリミット変更 ----
  if (t.match(/エナフェイズ終了時まで.*リミット/)) {
    return { type: 'STUB', id: 'LIMIT_CHANGE_UNTIL_ENERGY_PHASE_END' } as StubAction;
  }

  // ---- このターン、あなたはダメージを受けない・敗北しない ----
  if (t.match(/このターン.*パワー\d+以下のシグニによってダメージを受けない/)) {
    return { type: 'STUB', id: 'PREVENT_DAMAGE_BY_LOW_POWER_SIGNI' } as StubAction;
  }

  // ---- 次の対戦相手のターン、最初のダメージを受けない ----
  if (t.match(/最初にダメージを受ける場合.*代わりにダメージを受けない/)) {
    return { type: 'STUB', id: 'PREVENT_FIRST_DAMAGE_NEXT_OPP_TURN' } as StubAction;
  }

  // ---- 対戦相手のシグニゾーンを消す ----
  if (t.match(/シグニゾーン.*消す/)) {
    return { type: 'STUB', id: 'REMOVE_SIGNI_ZONE' } as StubAction;
  }

  // ---- ゲートを置く ----
  if (t.includes('【ゲート】')) {
    return { type: 'STUB', id: 'GATE' } as StubAction;
  }

  // ---- ハスターリクを置く ----
  if (t.includes('【ハスターリク】')) {
    return { type: 'STUB', id: 'HASTARLIQ' } as StubAction;
  }

  // ---- 色を指定する ----
  if (t.match(/^色[１-９\d]*つを指定する/)) {
    return { type: 'STUB', id: 'DECLARE_COLOR' } as StubAction;
  }

  // ---- シグニの色を変更する ----
  if (t.match(/シグニ.*を(?:白|黒|赤|青|緑|無)にする/)) {
    return { type: 'STUB', id: 'CHANGE_SIGNI_COLOR' } as StubAction;
  }

  // ---- 対戦相手の色を失う ----
  if (t.match(/シグニ.*色を失う/)) {
    return { type: 'STUB', id: 'SIGNI_LOSE_COLOR' } as StubAction;
  }

  // ---- このシグニの基本パワーをターゲットのパワーと同じにする ----
  if (t.match(/基本パワーは.*パワーと同じ値になる/)) {
    return { type: 'STUB', id: 'COPY_TARGET_POWER' } as StubAction;
  }

  // ---- 対戦相手のシグニに次にアタックしたとき（シングル/マルチ） ----
  {
    const m = t.match(/対戦相手の(?:シグニ|ルリグ|シグニかルリグ|ルリグとシグニ)(?:を([１-９\d０-９]+)体)?(?:まで)?を?対象とし.*次に.*アタックしたとき.*アタックを無効/);
    if (m) {
      const cnt = m[1] ? parseNum(m[1]) : 1;
      return {
        type: 'NEGATE_ATTACK',
        target: { type: 'SIGNI', owner: 'opponent', count: cnt, upToCount: t.includes('まで') },
      } as NegateAttackAction;
    }
  }

  // ---- 対戦相手のセンタールリグのアタック無効 ----
  if (t.match(/センタールリグ.*アタックしたとき.*無効/)) {
    return { type: 'STUB', id: 'NEGATE_CENTER_LRIG_ATTACK' } as StubAction;
  }

  // ---- 正面シグニのアタック禁止 ----
  if (t.match(/このシグニの正面にあるシグニでアタックできない/)) {
    return { type: 'STUB', id: 'BLOCK_FRONT_SIGNI_ATTACK' } as StubAction;
  }

  // ---- 対戦相手のシグニを複数エナゾーンに置く（セレクト） ----
  if (t.match(/対戦相手のシグニ.*体まで.*エナゾーンに置く/)) {
    return { type: 'STUB', id: 'MULTI_SIGNI_TO_ENERGY' } as StubAction;
  }

  // ---- 毒牙/微菌系複合トリガー ----
  if (t.match(/毒牙|微菌/) && t.match(/以下の[２-９]つから/)) {
    return { type: 'STUB', id: 'CLASS_TRIGGER_CHOOSE' } as StubAction;
  }

  // ---- 特定条件（場に特定カードがいる場合）の分岐 ----
  if (t.match(/あなたの場に《.+》がいる場合.*以下の[２-９]つから/) ||
      t.match(/あなたの場に《.+》がいる場合.*以下の[２-９]つから/)) {
    return { type: 'STUB', id: 'FIELD_CONDITION_CHOOSE' } as StubAction;
  }

  // ---- ディソナアイコン系 ----
  if (t.match(/《ディソナアイコン》.*以下の[２-９]つから/)) {
    return { type: 'STUB', id: 'DISONA_CHOOSE' } as StubAction;
  }

  // ---- リコレクトアイコン条件 ----
  const recollectM = t.match(/《リコレクトアイコン》［([０-９\d]+)枚以上/);
  if (recollectM) {
    return { type: 'RECOLLECT_GATE', minArts: parseNum(recollectM[1]) } as import('../types/effects').RecollectGateAction;
  }

  // ---- 対戦相手が手札を捨てないかぎり分岐 ----
  if (t.match(/対戦相手が手札を.+捨てないかぎり/)) {
    return { type: 'STUB', id: 'OPP_DISCARD_OR_CHOOSE' } as StubAction;
  }

  // ---- あなたのコインを支払ったとき分岐 ----
  if (t.match(/《コインアイコン》.*支払ったとき/)) {
    return { type: 'STUB', id: 'COIN_PAID_TRIGGER' } as StubAction;
  }

  // ---- このシグニはルリグが持つ色を得る ----
  if (t.match(/このシグニはあなたの場にいるルリグが持つ色を得る/)) {
    return { type: 'STUB', id: 'GAIN_LRIG_COLOR' } as StubAction;
  }

  // ---- 特定カードによってしか場に出せない ----
  if (t.match(/の効果によってしか新たに場に出せない/)) {
    return { type: 'STUB', id: 'DEPLOY_RESTRICT' } as StubAction;
  }

  // ---- スペル使用コスト増加（各ターン最初） ----
  if (t.match(/最初に使用するスペルの使用コストは/)) {
    return { type: 'STUB', id: 'FIRST_SPELL_COST_UP' } as StubAction;
  }

  // ---- 凍結シグニのバニッシュ先をデッキ一番下に変更 ----
  if (t.match(/凍結状態のシグニ.*バニッシュされる場合.*デッキの一番下/)) {
    return { type: 'STUB', id: 'FROZEN_SIGNI_BANISH_TO_DECK_BOTTOM' } as StubAction;
  }

  // ---- ダメージ時このシグニをトラッシュに置いてもよい（ブロッカー系） ----
  if (t.match(/ダメージを受ける場合.*代わりにこのシグニを.*トラッシュに置いてもよい/)) {
    return { type: 'STUB', id: 'SUBSTITUTE_DAMAGE_WITH_SELF_TRASH' } as StubAction;
  }

  // ---- 複数シグニの【自】能力をブロック ----
  if (t.match(/対戦相手のターンの場合.*エナコストを支払えない/)) {
    return { type: 'STUB', id: 'OPP_TURN_NO_ENERGY_COST_ZERO' } as StubAction;
  }

  // ---- 対戦相手のシグニをエナゾーンに置く → BANISH と同等 ----
  {
    const m = t.match(/対戦相手のシグニ([０-９\d]*)体(?:を対象とし、)?(?:それを)?エナゾーンに置く/);
    if (m) {
      const cnt = m[1] ? parseNum(m[1]) : 1;
      return { type: 'BANISH', target: { type: 'SIGNI', owner: 'opponent', count: cnt } } as BanishAction;
    }
  }
  if (t.match(/対戦相手は自分の.+シグニ.+選び.+エナゾーン/)) {
    return { type: 'BANISH', target: { type: 'SIGNI', owner: 'opponent', count: 1 } } as BanishAction;
  }

  // ---- サーバントZEROにする / シグニ名変更 ----
  if (t.match(/それを《サーバント.*》にする/)) {
    return { type: 'STUB', id: 'MAKE_SERVANT_ZERO' } as StubAction;
  }

  // ---- 可能ならばこのシグニを対象とする（強制ターゲット） ----
  if (t.match(/可能ならばこのシグニを対象とする/)) {
    return { type: 'STUB', id: 'FORCE_TARGET_SELF' } as StubAction;
  }

  // ---- デッキからエナゾーンに置かれたとき手札に加えてもよい ----
  if (t.match(/デッキから.*エナゾーンに置かれたとき.*手札に加えてもよい/)) {
    return { type: 'STUB', id: 'ENERGY_TO_HAND_ON_DECK' } as StubAction;
  }

  // ---- 正面にシグニがない場合アタックしたシグニの正面に配置 ----
  if (t.match(/正面にシグニがない場合.*正面に配置してもよい/)) {
    return { type: 'STUB', id: 'MOVE_TO_ATTACKER_FRONT' } as StubAction;
  }

  // ---- この方法で捨てた・置いた・減ったカード枚数分だけドロー/修正 ----
  if (t.match(/この方法で(?:捨てた|トラッシュに置かれた|ダウンした).*(?:枚数|合計|値).*(?:引く|する|＋)/)) {
    return { type: 'STUB', id: 'COUNT_BASED_DRAW_OR_POWER' } as StubAction;
  }

  // ---- 正面シグニのレベルにつきパワー修正 ----
  if (t.match(/正面のシグニのパワーをそのシグニのレベル.*につき/)) {
    return { type: 'STUB', id: 'POWER_MOD_BY_FRONT_LEVEL' } as StubAction;
  }

  // ---- 起動能力コスト増加（センタールリグ・シグニ） ----
  if (t.match(/センタールリグとシグニの【起】能力の使用コスト/)) {
    return { type: 'STUB', id: 'INCREASE_ACT_ABILITY_COST' } as StubAction;
  }

  // ---- 場とエナゾーンのシグニが追加で色を得る ----
  if (t.match(/場とエナゾーンにある.*シグニは追加で.*を得る/)) {
    return { type: 'STUB', id: 'FIELD_ENERGY_SIGNI_GAIN_COLOR' } as StubAction;
  }

  // ---- 特定クラスがいない場合手札を捨てる ----
  if (t.match(/場に他の.+のシグニがない場合.*手札を.*捨てる/)) {
    return { type: 'STUB', id: 'DISCARD_IF_NO_CLASS_SIGNI' } as StubAction;
  }

  // ---- 手札からカードを複数枚エナゾーンに置く ----
  if (t.match(/あなたの手札から(?:カードを|シグニを?)[０-９\d]+枚まで(?:エナゾーン|エナ)に置く/)) {
    const countM = t.match(/([０-９\d]+)枚まで/);
    const count = countM ? parseNum(countM[1]) : 1;
    return { type: 'ENERGY_CHARGE', target: { type: 'HAND_CARD', owner: 'self', count, filter: { cardType: 'シグニ' } } } as EnergyChargeAction;
  }
  if (t.match(/あなたの手札からカードを[０-９\d]+枚まで(?:エナゾーン|エナ)に置く/)) {
    const countM = t.match(/([０-９\d]+)枚まで/);
    const count = countM ? parseNum(countM[1]) : 1;
    return { type: 'ENERGY_CHARGE', target: { type: 'HAND_CARD', owner: 'self', count, filter: { cardType: 'シグニ' } } } as EnergyChargeAction;
  }

  // ---- このターン対戦相手の効果でパワーが減る場合2倍になる ----
  if (t.match(/あなたの効果によって.*パワーが－.*場合.*代わりに２倍/)) {
    return { type: 'STUB', id: 'DOUBLE_OWN_POWER_MINUS' } as StubAction;
  }

  // ---- ルリグトラッシュのアーツ枚数につきパワー修正 ----
  if (t.match(/ルリグトラッシュ.*アーツ.*につき[－＋]/)) {
    return { type: 'STUB', id: 'POWER_MOD_BY_LRIG_TRASH_ARTS' } as StubAction;
  }

  // ---- 対戦相手のシグニが正面に配置されたときパワー修正 ----
  if (t.match(/このシグニの正面に配置されたとき.*パワーを/)) {
    return { type: 'STUB', id: 'POWER_MOD_ON_FRONT_PLACE' } as StubAction;
  }

  // ---- 白ではないスペルを使用できない ----
  if (t.match(/白ではないスペルを使用できない/)) {
    return { type: 'STUB', id: 'BLOCK_NON_WHITE_SPELL' } as StubAction;
  }

  // ---- このシグニは対象のルリグの色を得る ----
  if (t.match(/このシグニは.*ルリグ.*持つ色.*得る/)) {
    return { type: 'STUB', id: 'SIGNI_GAIN_LRIG_COLOR' } as StubAction;
  }

  // ---- トラッシュから中央のシグニゾーンに出す ----
  if (t.match(/トラッシュから中央のシグニゾーンに出す/)) {
    return { type: 'STUB', id: 'FROM_TRASH_TO_CENTER_ZONE' } as StubAction;
  }

  // ---- 対戦相手のシグニ1体を対象とし、手札1枚につきパワー修正 ----
  if (t.match(/手札[１-９\d]+枚につき[－＋][０-９\d]+/)) {
    return { type: 'STUB', id: 'POWER_MOD_BY_HAND_COUNT' } as StubAction;
  }

  // ---- このターン対戦相手はパワーNのシグニでアタックできない ----
  if (t.match(/対戦相手はパワーが\d+以下のシグニでアタックできない/)) {
    return { type: 'STUB', id: 'OPP_SIGNI_ATTACK_POWER_RESTRICT' } as StubAction;
  }

  // ---- 捨てた・置いた枚数と同じ数のシグニのパワー修正 ----
  if (t.match(/この方法で捨てた.*枚数と同じ数.*シグニ.*パワー/)) {
    return { type: 'STUB', id: 'POWER_MOD_BY_DISCARD_COUNT' } as StubAction;
  }

  // ---- このシグニをデッキ上に / このシグニの下にシグニを置く ----
  if (t.match(/(?:このシグニ|シグニ１体)をこのシグニの下に置いてもよい/) ||
      t.match(/(?:レベル[０-９\d]+以上|レベル[０-９\d]+の)シグニ.*このシグニの下に置く/)) {
    return { type: 'STUB', id: 'PLACE_SIGNI_UNDER_SELF' } as StubAction;
  }

  // ---- エナゾーンからカード1枚を選びトラッシュに置く ----
  if (t.match(/エナゾーンからカード[０-９\d]*枚(?:を選び)?トラッシュに置く/)) {
    return { type: 'STUB', id: 'ENERGY_TO_TRASH' } as StubAction;
  }

  // ---- 対戦相手は以下のN個から1個を選び、あなたが行う ----
  if (t.match(/対戦相手は以下の[２-９]つから[１-９]つを選び.*あなた/)) {
    return { type: 'STUB', id: 'OPP_CHOOSES_FOR_YOU' } as StubAction;
  }

  // ---- 対戦相手のトラッシュからデッキトップに ----
  if (t.match(/対戦相手のトラッシュから.*デッキの一番上に置いてもよい/)) {
    return { type: 'STUB', id: 'OPP_TRASH_TO_DECK_TOP' } as StubAction;
  }

  // ---- シグニの下のカードをエナゾーンに置く ----
  if (t.match(/シグニの下にあるカード.*エナゾーンに置く/)) {
    return { type: 'STUB', id: 'UNDER_SIGNI_TO_ENERGY' } as StubAction;
  }

  // ---- デッキ上複数枚見て一部を手札・残りをデッキ下 ----
  if (t.match(/その中からカードを.*手札に加え.*残り.*デッキの一番下に置く/)) {
    return makeRevealPickStub(t);
  }

  // ---- 対戦相手のスペル・起を使用できない（次のターン間） ----
  if (t.match(/次の対戦相手のターンの間.*スペルと【起】能力を使用できない/)) {
    return { type: 'STUB', id: 'BLOCK_OPP_SPELL_ACT_NEXT_TURN' } as StubAction;
  }

  // ---- 対戦相手のルリグデッキからカードを公開する ----
  if (t.match(/対戦相手は自分のルリグデッキからカード.*公開する/)) {
    return { type: 'STUB', id: 'OPP_REVEAL_LRIG_DECK' } as StubAction;
  }

  // ---- このシグニのパワー以下の対戦相手シグニ１体とともにエナゾーンに置く ----
  if (t.match(/このシグニのパワー以下.*シグニ.*このシグニをエナゾーンに置いてもよい/)) {
    return { type: 'STUB', id: 'TRADE_SELF_AND_OPP_TO_ENERGY' } as StubAction;
  }

  // ---- 以下の3つを行う ----
  if (t.match(/^以下の[３-９]つを行う$/)) {
    return { type: 'STUB', id: 'DO_THREE_THINGS' } as StubAction;
  }

  // ---- 捨てたカード枚数に1加えた枚数ドロー ----
  if (t.match(/捨てたカードの枚数に[０-９\d]+を加えた枚数.*カードを引く/)) {
    return { type: 'STUB', id: 'DRAW_DISCARD_COUNT_PLUS_N' } as StubAction;
  }

  // ---- このターンゲームに敗北しない ----
  if (t.match(/このターン.*ゲームに敗北しない/)) {
    return { type: 'STUB', id: 'PREVENT_DEFEAT_THIS_TURN' } as StubAction;
  }

  // ---- ダウンしたシグニのパワーと同じだけこのシグニのパワーをプラス ----
  if (t.match(/ダウンしたシグニのパワーと同じだけ/)) {
    return { type: 'STUB', id: 'POWER_COPY_FROM_DOWNED' } as StubAction;
  }

  // ---- その中からカード1枚をデッキ上に戻し残りをデッキ下に ----
  if (t.match(/その中からカード.*デッキの一番上に戻し.*残り.*デッキの一番下に置く/)) {
    return { type: 'STUB', id: 'LOOK_TOP_ONE_RETURN_REST_BOTTOM' } as StubAction;
  }

  // ---- ガードアイコンを持たないカードを捨てたときトラッシュからエナへ ----
  if (t.match(/《ガードアイコン》を持たないカードを[０-９\d]*枚捨てたとき.*エナゾーンに置く/)) {
    return { type: 'STUB', id: 'NON_GUARD_DISCARD_TO_ENERGY' } as StubAction;
  }

  // ---- トラッシュに置かれたカードの中からカードを手札・エナ ----
  if (t.match(/トラッシュに置かれたカードの中から.*手札に加えるかエナゾーンに置く/)) {
    return { type: 'STUB', id: 'TRASHED_CARD_TO_HAND_OR_ENERGY' } as StubAction;
  }

  // ---- 特定クラスのシグニをエナゾーンから複数枚手札に加える/エナに置く ----
  if (t.match(/あなたのトラッシュから.+のカードを.*手札に加え.*エナゾーンに置く/)) {
    return { type: 'STUB', id: 'TRASH_CLASS_TO_HAND_OR_ENERGY' } as StubAction;
  }

  // ---- トラッシュからコスト合計N以下のスペルを使用 ----
  if (t.match(/トラッシュからコストの合計が[０-９\d]+以下.*スペル.*コストを支払わずに使用する/)) {
    return { type: 'STUB', id: 'TRASH_SPELL_FREE_USE_LIMIT' } as StubAction;
  }

  // ---- 手札から特定クラスのシグニをエナゾーンに置く ----
  if (t.match(/あなたの手札から[＜＜][^＞]+[＞＞]のシグニを.*エナゾーンに置く/)) {
    const countM = t.match(/([０-９\d]+)枚まで/);
    const count = countM ? parseNum(countM[1]) : 1;
    return { type: 'ENERGY_CHARGE', target: { type: 'HAND_CARD', owner: 'self', count, filter: { cardType: 'シグニ' } } } as EnergyChargeAction;
  }

  // ---- ダウンしたルリグのレベル合計につきパワー修正 ----
  if (t.match(/ダウンしたルリグのレベルの合計[0-9１-９]+につき[－＋]/)) {
    return { type: 'STUB', id: 'POWER_MOD_BY_DOWNED_LRIG_LEVEL' } as StubAction;
  }

  // ---- 他のシグニ1体を選ぶ（選択のみ） ----
  if (t.match(/^あなたの他のシグニ[０-９\d]*体を選ぶ$/)) {
    return { type: 'STUB', id: 'SELECT_OTHER_SIGNI' } as StubAction;
  }

  // ---- シグニの下にあるシグニをエナゾーンに置く（条件付き） ----
  if (t.match(/このシグニの下にある.*シグニ.*エナゾーンにそれと共通するクラスを持つシグニがない場合/)) {
    return { type: 'STUB', id: 'UNDER_SIGNI_TO_ENERGY_IF_NO_CLASS' } as StubAction;
  }

  // ---- ルリグのレベル合計につきパワープラス ----
  if (t.match(/ルリグのレベルの合計[0-9１-９]+につき[－＋]/)) {
    return { type: 'STUB', id: 'POWER_MOD_BY_LRIG_LEVEL_SUM' } as StubAction;
  }

  // ---- 場にあるシグニが持つ色の種類につきパワー修正 ----
  if (t.match(/シグニが持つ色の種類.*につき[－＋]/)) {
    return { type: 'STUB', id: 'POWER_MOD_BY_COLOR_VARIETY' } as StubAction;
  }

  // ---- 毒牙の他のシグニ効果によってパワーが減ったとき自身パワーアップ ----
  if (t.match(/他の.+のシグニの効果によって.*パワーが減ったとき.*パワーを.*プラス/)) {
    return { type: 'STUB', id: 'POWER_UP_ON_ALLY_POWER_DOWN' } as StubAction;
  }

  // ---- クラス指定の複数シグニのパワーを手札枚数×Nする ----
  if (t.match(/すべての.+のシグニのパワーをあなたの手札.*につき[－＋]/)) {
    return { type: 'STUB', id: 'CLASS_SIGNI_POWER_BY_HAND' } as StubAction;
  }

  // ---- 対戦相手が自分のパワーN以上のシグニを選びエナゾーンに置く ----
  if (t.match(/対戦相手は自分の.+シグニ.+エナゾーンに置く/)) {
    return { type: 'STUB', id: 'OPP_CHOOSE_OWN_SIGNI_TO_ENERGY' } as StubAction;
  }

  // ---- そのシグニとこのシグニのパワーをそれぞれ±Nする ----
  if (t.match(/そのシグニとこのシグニのパワーをそれぞれ[－＋][０-９\d]+する/)) {
    const mPlus  = t.match(/＋([０-９\d]+)/);
    const mMinus = t.match(/－([０-９\d]+)/);
    const delta = mPlus ? parseNum(mPlus[1]) : -(mMinus ? parseNum(mMinus[1]) : 0);
    return { type: 'STUB', id: 'POWER_MOD_TARGET_AND_SELF', delta } as unknown as StubAction;
  }

  // ---- 手札からレベルNのシグニをエナゾーンに置く ----
  if (t.match(/手札からレベル[０-９\d]+(?:以上|以下)?のシグニを[０-９\d]*枚?(?:まで)?エナゾーンに置く/)) {
    const countM = t.match(/([０-９\d]+)枚まで/);
    const count = countM ? parseNum(countM[1]) : 1;
    return { type: 'ENERGY_CHARGE', target: { type: 'HAND_CARD', owner: 'self', count, filter: { cardType: 'シグニ' } } } as EnergyChargeAction;
  }

  // ---- このシグニはルリグが持つ色1つを得る ----
  if (t.match(/このシグニは.*(?:ルリグ|それ).*持つ色[１-９\d]*つを得る/)) {
    return { type: 'STUB', id: 'SIGNI_GAIN_ONE_LRIG_COLOR' } as StubAction;
  }

  // ---- レベルNのシグニをこのシグニの下に置いてもよい ----
  if (t.match(/(?:レベル[０-９\d]+(?:以上|以下)?の)?シグニ.*をこのシグニの下に置いてもよい/)) {
    return { type: 'STUB', id: 'PLACE_SIGNI_UNDER_SELF_OPT' } as StubAction;
  }

  // ---- シグニ複数体を《サーバントZERO》にする ----
  if (t.match(/シグニ.*体.*を.*《サーバント.*》にする/)) {
    return { type: 'STUB', id: 'MAKE_MULTI_SERVANT_ZERO' } as StubAction;
  }

  // ---- トラッシュに置かれたシグニのレベル合計×Nパワー修正 ----
  if (t.match(/トラッシュに置かれたシグニのレベル[０-９\d]+につき[－＋]/)) {
    return { type: 'STUB', id: 'POWER_MOD_BY_TRASHED_SIGNI_LEVEL' } as StubAction;
  }

  // ---- 捨てたカード1枚につき-N万 ----
  if (t.match(/捨てたカード[０-９\d]+枚につき[－＋][０-９\d]+する/)) {
    return { type: 'STUB', id: 'POWER_MOD_BY_DISCARD_COUNT_HIGH' } as StubAction;
  }

  // ---- 対戦相手のシグニ1体と以下の２つから１つを選ぶ ----
  if (t.match(/対戦相手のシグニ.*以下の[２-９]つから[１-９]つを選ぶ/)) {
    return { type: 'STUB', id: 'TARGET_AND_CHOOSE' } as StubAction;
  }

  // ---- 特定カードがいる場合、以下のN個から ----
  if (t.match(/場に他の[＜＜][^＞＞]+[＞＞]のシグニがある場合.*以下の[２-９]つから/)) {
    return { type: 'STUB', id: 'ALLY_CLASS_CHOOSE' } as StubAction;
  }

  // ---- 代わりに+Nされる（前文の続き） ----
  if (t.match(/^代わりに[＋＋][０-９\d]+される$/)) {
    return { type: 'STUB', id: 'REPLACE_PLUS_N' } as StubAction;
  }

  // ---- 数字を宣言する ----
  if (t.match(/^数字[０-９\d]*つ?を宣言する$/)) {
    return { type: 'STUB', id: 'DECLARE_NUMBER' } as StubAction;
  }

  // ---- 手札をN枚捨ててもよい（任意）----
  if (t.match(/^手札を([０-９\d]+)枚捨ててもよい$/)) {
    const cnt = parseNum((t.match(/([０-９\d]+)枚/) ?? [])[1] ?? '1');
    return { type: 'TRASH', target: { type: 'HAND_CARD', owner: 'self', count: cnt } };
  }

  // ---- それの【出】能力は発動しない（出コストを支払ったが効果を抑止）----
  if (t.match(/それの【出】能力は発動しない/)) {
    return { type: 'BLOCK_ACTION', target: { type: 'SIGNI', owner: 'any', count: 1 }, actionId: 'ON_PLAY_ABILITY', until: 'END_OF_TURN' } as BlockActionAction;
  }

  // ---- このシグニを場からトラッシュに置いてもよい ----
  if (t.match(/^このシグニを場からトラッシュに置いてもよい$/)) {
    return { type: 'TRASH', target: { type: 'SIGNI', owner: 'self', count: 1 } };
  }

  // ---- 《色》を支払ってもよい（単色任意コスト）→ OPTIONAL_COST with costColors ----
  if (t.match(/^《[赤青緑黒白無]》を支払ってもよい$/)) {
    const costColors = [...t.matchAll(/《([^》]+)》/g)].map(m => m[1]);
    return { type: 'STUB', id: 'OPTIONAL_COST', costColors } as StubAction;
  }

  // ---- あなたのルリグゾーンに【リミットアッパー】を置く ----
  if (t.match(/ルリグゾーンに【リミットアッパー】[０-９\d]*つを置く/)) {
    return { type: 'STUB', id: 'PLACE_LIMIT_UPPER' } as StubAction;
  }

  // ---- 括弧ルール説明の後続フラグメント ----
  if (t.startsWith('（【トラップ】') || t.startsWith('（【シード】')) {
    return { type: 'STUB', id: 'RULE_REMINDER_TEXT' } as StubAction;
  }
  if (t.endsWith('トラッシュに置く）') || t.endsWith('置く）') || t.endsWith('いてもよい）')) {
    return { type: 'STUB', id: 'RULE_REMINDER_TEXT' } as StubAction;
  }

  // ---- 公開したカードをシャッフル・並べ替えてデッキに戻す ----
  if (t.match(/公開したカードをシャッフルして(?:デッキの一番下|デッキ)に置く/)) {
    return { type: 'LOOK_AND_REORDER', source: { location: 'deck', owner: 'self' }, count: 0, private: false, reorder: false, destination: { location: 'deck', owner: 'self', position: 'bottom' } };
  }
  if (t.match(/残りを好きな順番でデッキの一番上に戻す/)) {
    return { type: 'LOOK_AND_REORDER', source: { location: 'deck', owner: 'self' }, count: 0, private: false, reorder: true, destination: { location: 'deck', owner: 'self', position: 'top' } };
  }

  // ---- 対戦相手のシグニ1体を対象とし、《色》を支払ってもよい ----
  if (t.match(/対戦相手のシグニ[０-９\d]*体を対象とし、《[赤青緑黒白無]》を支払ってもよい/)) {
    const costColors = extractCostColors(t);
    return { type: 'STUB', id: 'TARGET_OPP_SIGNI_OPTIONAL_COLOR_COST', costColors } as StubAction;
  }

  // ---- その中からカード1枚を【シード】/【トラップ】として設置 ----
  if (t.match(/その中からカード[０-９\d]+枚を【シード】として.*シグニゾーンに出して/)) {
    return { type: 'STUB', id: 'PLACE_SEED_FROM_REVEALED' } as StubAction;
  }
  if (t.match(/その中からカード[０-９\d]+枚を【トラップ】として.*シグニゾーンに設置/)) {
    return { type: 'STUB', id: 'PLACE_TRAP_FROM_REVEALED' } as StubAction;
  }

  // ---- このゲームの間、以下の能力を得る ----
  if (t.match(/このゲームの間、あなたは以下の能力を得る/)) {
    return { type: 'STUB', id: 'GAIN_ABILITY_THIS_GAME' } as StubAction;
  }

  // ---- 以下をN回行う ----
  if (t.match(/^以下を[０-９\d]+回行う$/)) {
    return { type: 'STUB', id: 'REPEAT_N_TIMES' } as StubAction;
  }

  // ---- 対戦相手のパワーN以下のシグニをエナゾーンに置く ----
  {
    const banishM = t.match(/対戦相手のパワー([０-９\d]+)以下のシグニ([０-９\d]*)体?を対象とし、それをエナゾーンに置く/);
    if (banishM) {
      const cnt = banishM[2] ? parseNum(banishM[2]) : 1;
      return { type: 'BANISH', target: { type: 'SIGNI', owner: 'opponent', count: cnt, filter: { maxPower: parseNum(banishM[1]) } } } as BanishAction;
    }
  }

  // ---- 公開したカードをトラッシュに置く ----
  if (t.match(/^公開したカードをトラッシュに置く$/)) {
    return { type: 'TRASH', target: { type: 'DECK_CARD', owner: 'self', count: 1 } };
  }

  // ---- それらを好きな順番でデッキの一番上/下に戻す ----
  if (t.match(/それらを好きな順番でデッキの一番上に戻す/)) {
    return { type: 'LOOK_AND_REORDER', source: { location: 'deck', owner: 'self' }, count: 0, private: false, reorder: true, destination: { location: 'deck', owner: 'self', position: 'top' } };
  }
  if (t.match(/それらを好きな順番でデッキの一番下に置く/)) {
    return { type: 'LOOK_AND_REORDER', source: { location: 'deck', owner: 'self' }, count: 0, private: false, reorder: true, destination: { location: 'deck', owner: 'self', position: 'bottom' } };
  }
  if (t.match(/その後、残りを好きな順番でデッキの一番下に置く/)) {
    return { type: 'LOOK_AND_REORDER', source: { location: 'deck', owner: 'self' }, count: 0, private: false, reorder: true, destination: { location: 'deck', owner: 'self', position: 'bottom' } };
  }

  // ---- 対戦相手はデッキの一番上を公開する ----
  if (t.match(/対戦相手はデッキの一番上を公開する/)) {
    return { type: 'LOOK_AND_REORDER', source: { location: 'deck', owner: 'opponent' }, count: 1, private: false, reorder: false, destination: { location: 'deck', owner: 'opponent', position: 'top' } };
  }

  // ---- あなたのデッキをシャッフルし一番上を公開する ----
  if (t.match(/あなたのデッキをシャッフルし.*一番上を公開する/)) {
    return { type: 'LOOK_AND_REORDER', source: { location: 'deck', owner: 'self' }, count: 1, private: false, reorder: false, destination: { location: 'deck', owner: 'self', position: 'top' } };
  }

  // ---- その後、あなたのキー１枚を場からルリグトラッシュに置いてもよい ----
  if (t.match(/あなたのキー[０-９\d]*枚?を場からルリグトラッシュに置いてもよい/)) {
    return { type: 'STUB', id: 'TRASH_OWN_KEY_OPTIONAL' } as StubAction;
  }

  // ---- それらのどちらか／一方を対戦相手に見せずに裏向きでルリグデッキに加える ----
  if (t.match(/(?:どちらか|いずれか|一方)[０-９\d]*枚?を対戦相手に見せず.*ルリグデッキに加える/)) {
    return { type: 'STUB', id: 'ADD_CARD_TO_LRIG_DECK_HIDDEN' } as StubAction;
  }

  // ---- このアーツを使用する際、ルリグデッキからアーツをルリグトラッシュに置いてもよい ----
  if (t.match(/このアーツを使用する際.*ルリグデッキから.*アーツ.*ルリグトラッシュに置いてもよい/)) {
    return { type: 'STUB', id: 'ARTS_USE_DISCARD_LRIG_DECK' } as StubAction;
  }

  // ---- このアーツの使用コストは《無×N》減る ----
  if (t.match(/このアーツの使用コストは.*減る/)) {
    return { type: 'STUB', id: 'ARTS_COST_REDUCTION_BY_EFFECT' } as StubAction;
  }

  // ---- ベットメカニクス ----
  if (t.match(/あなたがベットしていた場合、代わりに/)) {
    return { type: 'STUB', id: 'BET_ALTERNATIVE' } as StubAction;
  }
  if (t.match(/^ベット―/)) {
    return { type: 'STUB', id: 'BET_MECHANIC' } as StubAction;
  }

  // ---- トラップメカニクス ----
  if (t.match(/【トラップ】を表向きにし.*《トラップアイコン》/)) {
    return { type: 'STUB', id: 'ACTIVATE_TRAP_IN_FIELD' } as StubAction;
  }

  // ---- 同じ選択肢をN回以上選んでもよい ----
  if (t.match(/同じ選択肢を[０-９\d]+回以上選んでもよい/)) {
    return { type: 'STUB', id: 'CHOOSE_SAME_OPTION_MULTIPLE' } as StubAction;
  }

  // ---- 対戦相手のシグニとあなたのシグニ各1体（トレード）----
  if (t.match(/対戦相手のシグニ[０-９\d]*体?を対象とし、(?:あなたの|この)?シグニ[０-９\d]*体?を場からトラッシュに置いてもよい/)) {
    return { type: 'STUB', id: 'TRADE_BANISH_SELF_SIGNI' } as StubAction;
  }

  // ---- 対戦相手はあなたの手札を見ないで選び捨てさせる ----
  if (t.match(/対戦相手はあなたの手札を[０-９\d]*枚?見ないで選び、あなたはそれを捨てる/)) {
    return { type: 'STUB', id: 'OPP_CHOOSE_YOUR_HAND_DISCARD' } as StubAction;
  }

  // ---- その中から特定ストーリーのカードを公開して手札に加え残りをデッキ下に置く ----
  if (t.match(/その中から.+のカード[０-９\d]+枚を公開し手札に加え、残りをシャッフルしてデッキの一番下に置く/)) {
    return makeRevealPickStub(t);
  }

  // ---- ゲームルール説明フラグメント（スキップ）----
  if (t.match(/この効果では[０-９\d]+単位でしか数字を割り振ることができない/)) {
    return { type: 'STUB', id: 'RULE_REMINDER_TEXT' } as StubAction;
  }
  if (t.match(/^（実際の.+は変わらない$/)) {
    return { type: 'STUB', id: 'RULE_REMINDER_TEXT' } as StubAction;
  }

  // ---- ターン終了時に裏向きシグニを表向きにする ----
  if (t.match(/この方法で裏向きにしたシグニを.*表向きにする/)) {
    return { type: 'STUB', id: 'FLIP_FACE_DOWN_SIGNI' } as StubAction;
  }

  // ---- 特定クラフトカードをルリグデッキに加える ----
  if (t.match(/クラフトの《[^》]+》[０-９\d]*枚?をルリグデッキに加える/)) {
    return { type: 'STUB', id: 'ADD_CRAFT_TO_LRIG_DECK' } as StubAction;
  }

  // ---- デッキ上をN枚公開する後続処理 ----
  if (t.match(/その後、あなたのデッキの一番上を公開する/)) {
    return { type: 'LOOK_AND_REORDER', source: { location: 'deck', owner: 'self' }, count: 1, private: false, reorder: false, destination: { location: 'deck', owner: 'self', position: 'top' } };
  }

  // ---- あなたのデッキ上を宣言した枚数トラッシュに置く ----
  if (t.match(/あなたのデッキの上からカードを宣言した数字に等しい枚数トラッシュに置く/)) {
    return { type: 'STUB', id: 'DECK_TOP_DECLARED_NUM_TRASH' } as StubAction;
  }

  // ---- それ/あなたはそれをトラッシュに置いてもよい ----
  if (t.match(/^(?:あなたは)?それをトラッシュに置いてもよい$/)) {
    return { type: 'TRASH', target: { type: 'SIGNI', owner: 'opponent', count: 1 } };
  }

  // ---- そのシグニ/それを場からトラッシュに置く ----
  if (t.match(/^(?:その|それ)(?:シグニ)?を場からトラッシュに置く$/)) {
    return { type: 'BANISH', target: { type: 'SIGNI', owner: 'opponent', count: 1 } } as BanishAction;
  }

  // ---- それらの【出】能力は発動しない ----
  if (t.match(/それらの【出】能力は発動しない/)) {
    return { type: 'BLOCK_ACTION', target: { type: 'SIGNI', owner: 'any', count: 'ALL' }, actionId: 'ON_PLAY_ABILITY', until: 'END_OF_TURN' } as BlockActionAction;
  }

  // ---- シグニゾーンを指定する ----
  if (t.match(/(?:あなたの|対戦相手の)?シグニゾーン[０-９\d]*つ?を指定する/)) {
    return { type: 'STUB', id: 'DESIGNATE_SIGNI_ZONE' } as StubAction;
  }

  // ---- この効果で公開したカードを好きな順番でデッキの一番上に戻す ----
  if (t.match(/この効果で公開したカードを好きな順番でデッキの一番上に戻す/)) {
    return { type: 'LOOK_AND_REORDER', source: { location: 'deck', owner: 'self' }, count: 0, private: false, reorder: true, destination: { location: 'deck', owner: 'self', position: 'top' } };
  }

  // ---- そのカードをデッキの一番下に置いてもよい ----
  if (t.match(/そのカードをデッキの一番下に置いてもよい/)) {
    return { type: 'LOOK_AND_REORDER', source: { location: 'deck', owner: 'self' }, count: 1, private: false, reorder: false, destination: { location: 'deck', owner: 'self', position: 'bottom' } };
  }

  // ---- 対戦相手がアーツを使用できない ----
  if (t.match(/このターン、あなたはアーツを使用できない/)) {
    return { type: 'STUB', id: 'PREVENT_OWN_ARTS_USE' } as StubAction;
  }

  // ---- 追加ターン ----
  if (t.match(/追加の[０-９\d]*ターンを得る/)) {
    return { type: 'STUB', id: 'GAIN_EXTRA_TURN' } as StubAction;
  }

  // ---- 括弧ルール説明（【ビート】等）----
  if (t.startsWith('（') && t.includes('この能力はあなたの【')) {
    return { type: 'STUB', id: 'RULE_REMINDER_TEXT' } as StubAction;
  }
  if (t.startsWith('（') && t.includes('コストの合計とは')) {
    return { type: 'STUB', id: 'RULE_REMINDER_TEXT' } as StubAction;
  }

  // ---- このターンそれがチェックゾーンから移動された場合、ゲームから除外 ----
  if (t.match(/チェックゾーンから.*ゲームから除外/)) {
    return { type: 'STUB', id: 'EXILE_FROM_CHECK_ZONE' } as StubAction;
  }

  // ---- この効果でクラッシュされたカードのライフバーストは発動しない ----
  if (t.match(/この効果でクラッシュされたカードのライフバーストは発動しない/)) {
    return { type: 'STUB', id: 'SUPPRESS_LIFE_BURST_ON_CRASH' } as StubAction;
  }

  // ---- あなたのエナゾーンからすべてのカードをトラッシュに置く ----
  if (t.match(/あなたのエナゾーンからすべてのカードをトラッシュに置く/)) {
    return { type: 'TRASH', target: { type: 'ENERGY_CARD', owner: 'self', count: 'ALL' } };
  }

  // ---- 手札からクラス等のシグニをN枚捨ててもよい ----
  {
    const optDiscardM = t.match(/手札から(.+?)のシグニ?を([０-９\d]+)枚?捨ててもよい/);
    if (optDiscardM) {
      const cnt = parseNum(optDiscardM[2]);
      return { type: 'TRASH', target: { type: 'HAND_CARD', owner: 'self', count: cnt, filter: parseCardTypeFilter(optDiscardM[1]) } };
    }
  }

  // ---- 対戦相手が任意コストを支払う（支払わなかった場合に効果発動）----
  if (t.match(/^対戦相手は.*を支払ってもよい/)) {
    const costColors = extractCostColors(t);
    return { type: 'STUB', id: 'OPPONENT_PAY_OPTIONAL', ...(costColors.length ? { costColors } : {}) } as StubAction;
  }

  // ---- 任意コスト支払い（広い汎用パターン）→ STUB with costColors ----
  if (t.match(/を支払ってもよい$/) || t.match(/を支払ってもよい。$/)) {
    const costColors = extractCostColors(t);
    return { type: 'STUB', id: 'OPTIONAL_COST', ...(costColors.length ? { costColors } : {}) } as StubAction;
  }

  // ---- 括弧で始まるルール説明（汎用スキップ）----
  if (t.startsWith('（') && (t.endsWith('）') || t.length > 8)) {
    return { type: 'STUB', id: 'RULE_REMINDER_TEXT' } as StubAction;
  }

  // ---- デッキの一番下に置く系 ----
  if (t.match(/手札からカード[０-９\d]+枚を好きな順番でデッキの一番下に置く/)) {
    return { type: 'LOOK_AND_REORDER', source: { location: 'hand', owner: 'self' }, count: 1, private: true, reorder: false, destination: { location: 'deck', owner: 'self', position: 'bottom' } };
  }
  if (t.match(/あなたのデッキの(?:下|一番下)からカードを?([０-９\d]+)枚?トラッシュに置く/)) {
    const m = t.match(/([０-９\d]+)枚/);
    const cnt = m ? parseNum(m[1]) : 1;
    return { type: 'TRASH', target: { type: 'DECK_CARD', owner: 'self', count: cnt } };
  }
  if (t.match(/あなたのデッキの一番下のカードをトラッシュに置いてもよい/)) {
    return { type: 'TRASH', target: { type: 'DECK_CARD', owner: 'self', count: 1 } };
  }
  if (t.match(/(?:それ|そのカード)をデッキの一番下に置いてもよい$/)) {
    return { type: 'LOOK_AND_REORDER', source: { location: 'deck', owner: 'self' }, count: 1, private: true, reorder: false, destination: { location: 'deck', owner: 'self', position: 'bottom' } };
  }
  if (t.match(/手札からカード[０-９\d]+枚を(?:好きな順番で)?デッキの一番下に置く/)) {
    const m = t.match(/([０-９\d]+)枚/);
    return { type: 'LOOK_AND_REORDER', source: { location: 'hand', owner: 'self' }, count: m ? parseNum(m[1]) : 1, private: true, reorder: false, destination: { location: 'deck', owner: 'self', position: 'bottom' } };
  }

  // ---- 次の対戦相手のターンの間、特定ゾーンのシグニでアタックできない ----
  if (t.match(/次の対戦相手のターン.*アタックできない/)) {
    return { type: 'BLOCK_ACTION', target: { type: 'SIGNI', owner: 'opponent', count: 1 }, actionId: 'ATTACK', until: 'NEXT_TURN' } as BlockActionAction;
  }

  // ---- 対戦相手のシグニ1体を対象とし、それを裏向きにする ----
  if (t.match(/対戦相手のシグニ[０-９\d]*体?を対象とし、それを裏向きにする/)) {
    return { type: 'STUB', id: 'FACE_DOWN_OPP_SIGNI' } as StubAction;
  }

  // ---- 色宣言・手札選択 ----
  if (t.match(/^色[０-９\d]*つを宣言する$/)) {
    return { type: 'STUB', id: 'DECLARE_COLOR' } as StubAction;
  }
  if (t.match(/^対戦相手は色[０-９\d]*つを宣言する$/)) {
    return { type: 'STUB', id: 'OPP_DECLARE_COLOR' } as StubAction;
  }
  if (t.match(/^あなたの手札を[０-９\d]*枚?選ぶ$/)) {
    return { type: 'STUB', id: 'CHOOSE_HAND_CARD' } as StubAction;
  }

  // ---- ライフバーストを発動しない（そのカードの）----
  if (t.match(/そのカードのライフバーストは発動しない/)) {
    return { type: 'STUB', id: 'SUPPRESS_LIFE_BURST_ON_CARD' } as StubAction;
  }

  // ---- アクセアイコン持ちシグニをエナゾーンへ ----
  if (t.match(/《アクセアイコン》を持つシグニ.*エナゾーンに置く/)) {
    return { type: 'STUB', id: 'PLACE_ACCE_SIGNI_TO_ENERGY' } as StubAction;
  }

  // ---- 同じ場所にシグニがある/ない場合トラッシュ/表向き ----
  if (t.match(/同じ場所にシグニがある場合、トラッシュに置く/)) {
    return { type: 'STUB', id: 'TRASH_IF_ZONE_OCCUPIED' } as StubAction;
  }

  // ---- 好きな枚数手札に加え残りをエナゾーンに置く ----
  if (t.match(/その中からカードを好きな枚数手札に加え、残りをエナゾーンに置く/)) {
    return { type: 'STUB', id: 'CHOOSE_HAND_OR_ENERGY' } as StubAction;
  }

  // ---- ウィルスを除く ----
  if (t.match(/【ウィルス】を好きな数取り除く/)) {
    return { type: 'STUB', id: 'REMOVE_VIRUS' } as StubAction;
  }

  // ---- マジックボックス/トラップ設置 ----
  if (t.match(/【マジックボックス】として.*シグニゾーンに設置/)) {
    return { type: 'STUB', id: 'PLACE_MAGIC_BOX' } as StubAction;
  }
  if (t.match(/【マジックボックス】.*表向きにし.*トラッシュに置いてもよい/)) {
    return { type: 'STUB', id: 'OPEN_MAGIC_BOX' } as StubAction;
  }
  if (t.match(/【トラップ】として.*シグニゾーンに設置してもよい/)) {
    return { type: 'STUB', id: 'PLACE_TRAP_OPTIONAL' } as StubAction;
  }

  // ---- デッキ上からシグニがめくれるまで/宣言したカードまで公開する ----
  if (t.match(/デッキの上から.*めくれるまで公開する/)) {
    return { type: 'STUB', id: 'DECK_REVEAL_UNTIL' } as StubAction;
  }

  // ---- デッキ上を公開し、宣言レベルのシグニなら手札/エナに加える ----
  if (t.match(/デッキの一番上を公開し、それが宣言した数字と同じレベル.*手札に加える/)) {
    return { type: 'STUB', id: 'DECK_TOP_CHECK_LEVEL_HAND' } as StubAction;
  }
  if (t.match(/デッキの一番上を公開し、それが宣言した数字と同じレベル.*エナゾーンに置く/)) {
    return { type: 'STUB', id: 'DECK_TOP_CHECK_LEVEL_ENERGY' } as StubAction;
  }

  // ---- この方法で公開されたカードをシャッフルしてデッキの一番下に置く ----
  if (t.match(/この方法で公開されたカードをシャッフルしてデッキの一番下に置く/)) {
    return { type: 'LOOK_AND_REORDER', source: { location: 'deck', owner: 'self' }, count: 0, private: false, reorder: false, destination: { location: 'deck', owner: 'self', position: 'bottom' } };
  }

  // ---- この効果/方法でクラッシュされたカードのライフバーストは発動しない ----
  if (t.match(/この(?:効果|方法)でクラッシュされたカードのライフバーストは発動しない/)) {
    return { type: 'STUB', id: 'SUPPRESS_LIFE_BURST_ON_CRASH' } as StubAction;
  }

  // ---- この効果はN枚までしか適用されない ----
  if (t.match(/この効果は[０-９\d]+枚までしか適用されない/)) {
    return { type: 'STUB', id: 'EFFECT_LIMIT' } as StubAction;
  }

  // ---- 対戦相手のセンタールリグが〜の場合、このアーツの使用コストは〜になる ----
  if (t.match(/対戦相手のセンタールリグが.*の場合、このアーツの使用コストは/)) {
    return { type: 'STUB', id: 'CONDITIONAL_ARTS_COST' } as StubAction;
  }

  // ---- この方法でカードをN枚以上捨てた場合、捨てた枚数＋Nのカードを引く ----
  if (t.match(/この方法でカードを[０-９\d]+枚以上捨てた場合、捨てた枚数に[０-９\d]+を加えた枚数のカードを引く/)) {
    return { type: 'STUB', id: 'VARIABLE_DRAW_BY_DISCARD' } as StubAction;
  }

  // ---- 色リストから1つを選ぶ ----
  if (t.match(/^(?:白|赤|青|緑|黒)(?:、(?:白|赤|青|緑|黒))+から[０-９\d]+つを選ぶ$/)) {
    return { type: 'STUB', id: 'CHOOSE_COLOR_FROM_LIST' } as StubAction;
  }

  // ---- 対戦相手は色・コストを宣言する ----
  if (t.match(/対戦相手は.*から[０-９\d]*つを宣言する/)) {
    return { type: 'STUB', id: 'OPP_DECLARE_CHOICE' } as StubAction;
  }

  // ---- その中から特定条件のシグニをエナゾーンに置き残りをデッキ上に ----
  if (t.match(/その中から.*のシグニをエナゾーンに置き、残りを好きな順番でデッキの一番上に置く/)) {
    return { type: 'STUB', id: 'REVEAL_PICK_CLASS_TO_ENERGY' } as StubAction;
  }

  // ---- 対戦相手のシグニN体を対象とし、手札から〜を捨てる（複合パターン）----
  if (t.match(/対戦相手のシグニ[０-９\d]*体?(?:まで)?を対象とし、手札から.+捨て(?:る|てもよい)?$/)) {
    return { type: 'STUB', id: 'TARGET_AND_DISCARD_HAND' } as StubAction;
  }

  // ---- このシグニのレベル以下のシグニN体を対象とし、手札から〜捨てる ----
  if (t.match(/このシグニのレベル以下の対戦相手のシグニ.+手札から.+捨て(?:る|てもよい)?$/)) {
    return { type: 'STUB', id: 'TARGET_AND_DISCARD_HAND' } as StubAction;
  }

  // ---- あなたの場に〜がいる場合、対戦相手のシグニN体を対象とし... ----
  if (t.match(/あなたの場に.+がいる場合、対戦相手のシグニ.+を対象とし、手札から.+捨て/) ||
      t.match(/あなたの場に.+がいる場合、対戦相手のシグニ.+を対象とし、あなたの.+置いてもよい/)) {
    return { type: 'STUB', id: 'TARGET_AND_DISCARD_HAND' } as StubAction;
  }

  // ---- 対戦相手のシグニN体を対象とし、あなたの〜をトラッシュ/デッキに置いてもよい ----
  if (t.match(/対戦相手のシグニ[０-９\d]*体?(?:まで)?を対象とし、あなたの.+(?:トラッシュに置いてもよい|デッキの一番.+に置いてもよい)/)) {
    return { type: 'STUB', id: 'TRADE_BANISH_SELF_SIGNI' } as StubAction;
  }

  // ---- 対戦相手のシグニN体を対象とし、あなたの手札から〜公開する ----
  if (t.match(/対戦相手のシグニ[０-９\d]*体?を対象とし、あなたの(?:手札から|トラッシュから|エナゾーン)/)) {
    return { type: 'STUB', id: 'TRADE_BANISH_SELF_SIGNI' } as StubAction;
  }

  // ---- 対戦相手のシグニを〜体まで対象とし（複数ターゲット）----
  if (t.match(/対戦相手のシグニを[０-９\d]+体まで対象とし/)) {
    return { type: 'STUB', id: 'TARGET_AND_DISCARD_HAND' } as StubAction;
  }

  // ---- このターンと次のターンの間〜（二ターン効果）----
  if (t.match(/このターンと次のターンの間/)) {
    return { type: 'STUB', id: 'LRIG_GROW_RESTRICT' } as StubAction;
  }

  // ---- このゲームの間、あなたのセンタールリグは〜を得る ----
  if (t.match(/このゲームの間、あなたの(?:センタールリグ|《.+》)は/) ||
      t.match(/このゲームの間、あなたはグロウできない/) ||
      t.match(/このゲームの間、あなたは.+を使用できない/)) {
    return { type: 'STUB', id: 'GAIN_ABILITY_THIS_GAME' } as StubAction;
  }

  // ---- その中からN枚を手札に加え、M枚をエナゾーンに/残りを〜 ----
  if (t.match(/その中から[０-９\d]*枚?を手札に加え/) ||
      t.match(/その中から好きな枚数を手札に加え/)) {
    return makeRevealPickStub(t);
  }

  // ---- あなたのメインフェイズ開始時〜（フェーズトリガー前置きを剥がして再解析）----
  {
    const m = t.match(/^あなたのメインフェイズ開始時[、,]\s*(.+)$/);
    if (m) return parseSingleSentence(m[1].trim());
  }
  if (t === 'あなたのメインフェイズ開始時') {
    return { type: 'STUB', id: 'MAIN_PHASE_START_TRIGGER' } as StubAction;
  }

  // ---- あなたのエナゾーンにあるすべてのカードを手札に加える ----
  if (t.match(/あなたのエナゾーンにあるすべてのカードを手札に加える/)) {
    return { type: 'TRANSFER_TO_HAND', source: { type: 'ENERGY_CARD', owner: 'self', count: 'ALL' } };
  }

  // ---- あなたのエナゾーンにあるカードが持つ色から最大N色まで選ぶ ----
  if (t.match(/あなたのエナゾーンにあるカードが持つ色から最大[０-９\d]+色まで選ぶ/)) {
    return { type: 'STUB', id: 'CHOOSE_COLOR_FROM_LIST' } as StubAction;
  }

  // ---- 対戦相手の場にある【ウィルス】を取り除く ----
  if (t.match(/対戦相手の場にある【ウィルス】[０-９\d]*つを取り除く(?:てもよい)?/)) {
    return { type: 'STUB', id: 'REMOVE_VIRUS' } as StubAction;
  }

  // ---- あなたのシグニに手札からカードを裏向きで付ける（チャーム）----
  if (t.match(/手札からカード[０-９\d]*枚?を裏向きで付ける/) ||
      t.match(/あなたのシグニ.+に.+手札からカードを.+付ける/)) {
    return { type: 'STUB', id: 'PLACE_CARD_UNDER_SIGNI' } as StubAction;
  }

  // ---- 対戦相手のルリグトラッシュからアーツを使用する ----
  if (t.match(/対戦相手のルリグトラッシュから.+を対象とし/) ||
      t.match(/対戦相手のルリグトラッシュから.+使用/)) {
    return { type: 'STUB', id: 'CAST_FROM_OPP_TRASH' } as StubAction;
  }

  // ---- このアーツはあなたのセンタールリグが〜の場合にしか使用できない ----
  if (t.match(/^このアーツはあなたのセンタールリグが.+の場合(?:にしか使用できない|か、)/)) {
    return { type: 'STUB', id: 'USE_CONDITION_TEXT' } as StubAction;
  }

  // ---- あなたの場にあるすべてのシグニが〜の場合（条件付き効果）----
  if (t.match(/^あなたの場にあるすべてのシグニが.+の場合/)) {
    return { type: 'STUB', id: 'CONDITIONAL_POWER_BONUS' } as StubAction;
  }

  // ---- このシグニの下からカードをトラッシュに置く ----
  if (t.match(/このシグニの下からカード[０-９\d]*枚?をトラッシュに置いてもよい/) ||
      t.match(/このシグニの下からカード[０-９\d]*枚?をトラッシュに置く$/)) {
    return { type: 'STUB', id: 'LRIG_UNDER_CARD_OP' } as StubAction;
  }

  // ---- デッキをシャッフルし、そのシグニを公開しデッキの〜に置く ----
  if (t.match(/デッキをシャッフルし、そのシグニを公開しデッキの(?:一番上|上から)/)) {
    return { type: 'STUB', id: 'DECK_TOP_TO_LIFE' } as StubAction;
  }

  // ---- その後、デッキをシャッフルし、それをコストを支払わずに使用する ----
  if (t.match(/デッキをシャッフルし、(?:それ|そのカード)をコストを支払わずに使用する/)) {
    return { type: 'STUB', id: 'PLAY_FREE' } as StubAction;
  }

  // ---- デッキをシャッフルし、そのカードをデッキの一番上に置く ----
  if (t.match(/デッキをシャッフルし、そのカードをデッキの一番上に置く/)) {
    return { type: 'TRANSFER_TO_DECK', source: { type: 'DECK_CARD', owner: 'self', count: 1 }, position: 'top', shuffle: true };
  }

  // ---- あなたのトラッシュにカード名に〜を含むカードがある場合 ----
  if (t.match(/あなたのトラッシュにカード名に.+を含むカードがある場合/)) {
    return { type: 'STUB', id: 'CONDITIONAL_POWER_BONUS' } as StubAction;
  }

  // ---- センタールリグのレベルが〜の場合のアーツコスト変動 ----
  if (t.match(/あなたのセンタールリグのレベルが.+の場合/) ||
      t.match(/あなたのセンタールリグのレベルが対戦相手より/)) {
    return { type: 'STUB', id: 'CONDITIONAL_ARTS_COST' } as StubAction;
  }

  // ---- 対戦相手のパワーN以下/以上のシグニを対象とし手札から〜 ----
  if (t.match(/対戦相手のパワー[０-９\d]+以[下上]のシグニ[０-９\d]*体?を対象とし/) ||
      t.match(/対戦相手のパワー[０-９\d]+以[下上]のシグニ[０-９\d]*体?.*手札から.+捨て/)) {
    return { type: 'STUB', id: 'TARGET_AND_DISCARD_HAND' } as StubAction;
  }

  // ---- この方法でトラッシュに置かれたカードの中からシグニをN枚対象とし〜 ----
  if (t.match(/この方法でトラッシュに置かれたカードの中からシグニ/)) {
    return { type: 'STUB', id: 'POWER_MOD_PER_COUNT' } as StubAction;
  }

  // ---- その中から〜アイコンを持つカードをエナゾーンに置き残りを〜 ----
  if (t.match(/その中から.+アイコン》を持つ.+エナゾーンに置き、残り/)) {
    return { type: 'STUB', id: 'REVEAL_PICK_CLASS_TO_ENERGY' } as StubAction;
  }

  // ---- この方法でトラッシュに置いたカードの中に〜がある場合 ----
  if (t.match(/この方法でトラッシュに置いたカードの中に/)) {
    return { type: 'STUB', id: 'POWER_MOD_PER_COUNT' } as StubAction;
  }

  // ---- その中から《アクセアイコン》を持つカードをエナゾーンに ----
  if (t.match(/その中から《アクセアイコン》を持つ.+エナゾーンに置き/)) {
    return { type: 'STUB', id: 'REVEAL_PICK_CLASS_TO_ENERGY' } as StubAction;
  }

  // ---- 数値範囲で数字を宣言する ----
  if (t.match(/[０-９\d]+～[０-９\d]+の数字[０-９\d]*つを宣言する/)) {
    return { type: 'STUB', id: 'DECLARE_NUMBER_RANGE' } as StubAction;
  }

  // ---- 手札からクラスシグニを好きな枚数公開する ----
  if (t.match(/手札から.+のシグニを好きな枚数公開する/)) {
    return { type: 'STUB', id: 'REVEAL_CLASS_SIGNI_FROM_HAND' } as StubAction;
  }

  // ---- この方法で公開したカード1枚につき±Nパワー ----
  if (t.match(/この方法で公開したカード[０-９\d]*枚につき[＋－][０-９\d]+する/)) {
    return { type: 'STUB', id: 'POWER_MOD_PER_REVEALED' } as StubAction;
  }

  // ---- ターン終了時まで、公開シグニのレベル合計につき±Nパワー ----
  if (t.match(/ターン終了時まで.*公開された.*レベル.*につき[＋－][０-９\d]+する/)) {
    return { type: 'STUB', id: 'POWER_MOD_PER_REVEALED_LEVEL' } as StubAction;
  }

  // ---- このカードはこのターンにアーツを使用していた場合、使用できない ----
  if (t.match(/このカードはあなたがこのターンにアーツを使用していた場合、使用できない/)) {
    return { type: 'STUB', id: 'USE_CONDITION_ARTS_USED' } as StubAction;
  }

  // ---- アーツ使用時に手札から色のカードをN枚まで捨てる ----
  if (t.match(/このアーツを使用する際、手札から.+のカードを[０-９\d]+枚まで捨てる/)) {
    return { type: 'STUB', id: 'ARTS_USE_DISCARD_COLOR_HAND' } as StubAction;
  }

  // ---- 対戦相手の手札をN枚見ないで選び公開させる ----
  if (t.match(/対戦相手の手札を[０-９\d]*枚?見ないで選び、対戦相手はそのカードを公開する/)) {
    return { type: 'STUB', id: 'REVEAL_OPP_HAND_CARD' } as StubAction;
  }

  // ---- 対戦相手のエナゾーンからカードをトラッシュに置いてもよい ----
  if (t.match(/対戦相手のエナゾーンからカード[０-９\d]*枚?を対象とし、それをトラッシュに置いてもよい/)) {
    return { type: 'TRASH', target: { type: 'ENERGY_CARD', owner: 'opponent', count: 1 } };
  }

  // ---- 対戦相手のシグニN体を対象とする（単独）----
  if (t.match(/^対戦相手のシグニ[０-９\d]*体?を対象とする$/)) {
    return { type: 'STUB', id: 'TARGET_OPP_SIGNI_ONLY' } as StubAction;
  }

  // ---- そのカード/それをトラッシュに置いてもよい（単独）----
  if (t.match(/^(?:そのカード|それ)をトラッシュに置いてもよい$/)) {
    return { type: 'TRASH', target: { type: 'SIGNI', owner: 'any', count: 1 } };
  }

  // ---- このゲームの間、コインの使用制限 ----
  if (t.match(/このゲームの間.*《コインアイコン》.*しか支払えない/)) {
    return { type: 'STUB', id: 'COIN_USE_RESTRICTION' } as StubAction;
  }

  // ---- ビート説明テキスト（括弧複合）→ スキップ ----
  if (t.match(/【ビート】はターン終了時まであなたが持ち/) || t.includes('コストの支払いで【ビート】')) {
    return { type: 'STUB', id: 'RULE_REMINDER_TEXT' } as StubAction;
  }

  // ---- 括弧で終わるルール説明（後続フラグメント）→ スキップ ----
  if (t.endsWith('）') && (t.includes('【マジックボックス】') || t.includes('【ビート】') || t.includes('コストの合計') || t.includes('例えば'))) {
    return { type: 'STUB', id: 'RULE_REMINDER_TEXT' } as StubAction;
  }

  // ---- この効果ではN単位でしか数字を割り振れない → スキップ ----
  if (t.match(/この効果では[０-９\d]+単位でしか数字を割り振れない/)) {
    return { type: 'STUB', id: 'RULE_REMINDER_TEXT' } as StubAction;
  }

  // ---- 対戦相手のセンタールリグが〜の場合、このカード/アーツのコストが変わる ----
  if (t.match(/対戦相手のセンタールリグが.+の場合、このカードの基本コストは/)) {
    return { type: 'STUB', id: 'CONDITIONAL_CARD_COST_BY_OPP_LRIG' } as StubAction;
  }

  // ---- それが能力を持たない場合、代わりにトラッシュ ----
  if (t.match(/能力を持たない場合、代わりにそれをトラッシュに置く/)) {
    return { type: 'STUB', id: 'ABILITY_CHECK_ELSE_TRASH' } as StubAction;
  }

  // ---- 特定条件の場合、手札を捨てる/捨てない選択 ----
  if (t.match(/の場合、手札を[０-９\d]+枚捨ててもよい/)) {
    return { type: 'STUB', id: 'CONDITIONAL_DISCARD' } as StubAction;
  }

  // ---- エナから特定クラスのカードをトラッシュに置いてもよい（任意）----
  if (t.match(/あなたのエナゾーンから.+のカード[０-９\d]+枚?をトラッシュに置いてもよい/)) {
    return { type: 'STUB', id: 'OPTIONAL_TRASH_ENERGY_CLASS' } as StubAction;
  }

  // ---- 対戦相手はデッキをシグニ/スペルがめくれるまで公開する ----
  if (t.match(/対戦相手は.*デッキを上から.*めくれるまで公開する/)) {
    return { type: 'STUB', id: 'OPP_DECK_REVEAL_UNTIL' } as StubAction;
  }

  // ---- あなたのデッキを上から特定カードがめくれるまで公開する ----
  if (t.match(/あなたのデッキを上から.+がめくれるまで公開する/)) {
    return { type: 'STUB', id: 'DECK_REVEAL_UNTIL_CLASS' } as StubAction;
  }

  // ---- その中のそれぞれ名前の異なる〜の枚数を数える ----
  if (t.match(/その中のそれぞれ名前の異なる.*の枚数を数える/)) {
    return { type: 'STUB', id: 'COUNT_DISTINCT_NAMES' } as StubAction;
  }

  // ---- 手札から捨てなければ手札をN枚捨てる（コスト選択）----
  if (t.match(/手札から.+捨てないかぎり手札を[０-９\d]+枚捨てる/)) {
    return { type: 'STUB', id: 'DISCARD_OR_PENALTY' } as StubAction;
  }

  // ---- デッキ上から宣言数に等しい枚数をトラッシュ ----
  if (t.match(/デッキの上から宣言した数字に等しい枚数のカードをトラッシュに置く/)) {
    return { type: 'STUB', id: 'DECK_TOP_DECLARED_NUM_TRASH' } as StubAction;
  }

  // ---- 場の条件＋代わりに修正（条件付きパワーボーナス）----
  if (t.match(/あなたの場に.*シグニが[０-９\d]+体ある場合、代わりに[＋－][０-９\d]+する/)) {
    return { type: 'STUB', id: 'CONDITIONAL_POWER_BONUS' } as StubAction;
  }

  // ---- あなたの手札を公開する ----
  if (t.match(/^あなたの手札(?:を|から.+)?を?公開する$/)) {
    return { type: 'REVEAL' };
  }

  // ---- デッキの一番上を公開し、選んだ色を持つシグニである場合、手札/エナゾーンに ----
  if (t.match(/あなたのデッキの一番上を公開し、それが選んだ色を持つシグニである場合/)) {
    const toHand = t.includes('手札に加える');
    const owner: Owner = 'self';
    return {
      type: 'REVEAL_AND_PICK',
      owner,
      revealCount: 1,
      pickCount: 1,
      then: { type: 'ADD_TO_HAND', owner } as import('../types/effects').AddToHandAction,
      remainder: { location: 'deck' as import('../types/effects').CardLocation, position: 'top' },
    };
    void toHand;
  }

  // ---- デッキの一番下のカードをチェックゾーンに置く ----
  if (t.match(/あなたのデッキの一番下のカードをチェックゾーンに置く/)) {
    return { type: 'STUB', id: 'DECK_TOP_TO_LIFE' } as StubAction;
  }

  // ---- その中から1枚を手札に加え〜残りをX置く ----
  if (t.match(/その中から[０-９\d]*枚?を手札に加え(?:、[０-９\d]*枚?を)?(?:エナゾーンに置く|トラッシュに置く|デッキの.+に置く)/)) {
    return makeRevealPickStub(t);
  }

  // ---- このアーツはあなたの〜の場合にしか使用できない ----
  if (t.match(/^このアーツはあなたの.+の場合(?:か、|にしか)(?:あなたの.+の場合)?(?:か、)?にしか?使用できない/)) {
    return { type: 'STUB', id: 'USE_CONDITION_TEXT' } as StubAction;
  }

  // ---- デッキの上からN枚見て特定クラスを手札/エナゾーンに加える ----
  {
    const m = t.match(/あなたのデッキの上からカードを([０-９\d]+)枚見て、その中から(.+?)([０-９\d]+)枚?(?:を公開し)?(?:手札に加える|エナゾーンに置く)/);
    if (m) {
      const revealCount = parseNum(m[1]);
      const filter = parseCardTypeFilter(m[2]);
      return {
        type: 'REVEAL_AND_PICK',
        owner: 'self',
        revealCount,
        pickCount: parseNum(m[3]),
        filter,
        then: { type: 'ADD_TO_HAND', owner: 'self' } as import('../types/effects').AddToHandAction,
        remainder: { location: 'deck' as import('../types/effects').CardLocation, position: 'bottom' },
      };
    }
  }

  // ---- デッキの上から〜がめくれるまで公開し手札に加える（汎用）----
  if (t.match(/あなたのデッキの上から.+がめくれるまで公開し(?:、それ)?を手札に加える/)) {
    return { type: 'STUB', id: 'DECK_REVEAL_UNTIL' } as StubAction;
  }

  // ---- デッキの上からN枚のカードを公開する（センタールリグレベル参照等）----
  if (t.match(/あなたのデッキの上からあなたのセンタールリグのレベルと同じ枚数のカードを公開する/)) {
    return { type: 'STUB', id: 'DECK_REVEAL_UNTIL' } as StubAction;
  }

  // ---- あなたのトラッシュからクラスのシグニを対象とし（コスト付き）手札に ----
  if (t.match(/あなたのトラッシュから.+のシグニ[０-９\d]*枚?を対象とし、手札からカードを[０-９\d]+枚捨て(?:る|てもよい)/)) {
    return { type: 'STUB', id: 'OPTIONAL_TRASH_ENERGY_CLASS' } as StubAction;
  }

  // ---- あなたのトラッシュからクラスのシグニを使用する ----
  if (t.match(/あなたのトラッシュから.+のシグニ[０-９\d]*枚?を対象とし、.*使用する/)) {
    return { type: 'STUB', id: 'ENCORE' } as StubAction;
  }

  // ---- あなたのエナゾーンからクラスのシグニをトラッシュ/公開する（複数）----
  if (t.match(/あなたのエナゾーンから.+のシグニを?[０-９\d好きな枚数]*枚?(?:まで)?対象とし/) ||
      t.match(/あなたのエナゾーンから.+のシグニ[０-９\d]*枚?をトラッシュに置いてもよい/)) {
    return { type: 'STUB', id: 'OPTIONAL_TRASH_ENERGY_CLASS' } as StubAction;
  }

  // ---- ライフクロスが〜の場合の条件テキスト ----
  if (t.match(/あなたのライフクロスが[０-９\d]+枚以下の場合/) ||
      t.match(/あなたのライフクロスの(?:上から|一番上)/)) {
    return { type: 'STUB', id: 'CONDITIONAL_ARTS_COST' } as StubAction;
  }

  // ---- センタールリグが〜の場合の条件テキスト ----
  if (t.match(/あなたのセンタールリグが.+の場合、(?:代わりに|追加で|この能力)/)) {
    return { type: 'STUB', id: 'CONDITIONAL_POWER_BONUS' } as StubAction;
  }

  // ---- 次の対戦相手のターン〜（一時的制限）----
  if (t.match(/^次の対戦相手のターン(?:終了時まで|の間|、)/)) {
    return { type: 'STUB', id: 'LRIG_GROW_RESTRICT' } as StubAction;
  }

  // ---- このターン、対戦相手が〜（アタック制限・コスト条件）----
  if (t.match(/^このターン、対戦相手(?:が|は)/)) {
    return { type: 'STUB', id: 'LRIG_GROW_RESTRICT' } as StubAction;
  }

  // ---- 対戦相手のアタックしているシグニのアタックを一度無効にする ----
  if (t.match(/対戦相手の.*アタックしている.*シグニ.*アタックを.*無効にする/)) {
    return { type: 'STUB', id: 'NEGATE_ATTACK_ON_TRIGGER' } as StubAction;
  }

  // ---- 使用条件：特定タイミングにしか使えない ----
  if (t.match(/この能力は.*アタックしたときにしか使用できない/) ||
      t.match(/この能力は.*時にしか使用できない/)) {
    return { type: 'STUB', id: 'USE_CONDITION_TEXT' } as StubAction;
  }

  // ---- 対戦相手のターンの間、このカードの使用コストは《》になる ----
  {
    const m = t.match(/^(?:対戦相手のターン|次のターン)の間、この(?:カード|アーツ|スペル|シグニ)の使用コストは(.+)になる/);
    if (m) {
      const cost = parseEnergyCosts(m[1]);
      if (cost.length > 0) return { type: 'ALT_COST_OPP_TURN', cost } as import('../types/effects').AltCostOppTurnAction;
    }
    if (t.match(/(?:対戦相手のターン|次のターン).*使用コストは/)) {
      return { type: 'STUB', id: 'ARTS_COST_MODIFY_OPP_TURN' } as StubAction;
    }
  }

  // ---- このシグニの下からカードを移動 ----
  {
    const m = t.match(/このシグニの下から(?:《[^》]+》の)?カード([０-９\d]*)枚?まで?を?(?:対象とし、それ(?:ら)?を)?(手札に加える|エナゾーンに置く|トラッシュに置く)/);
    if (m) {
      const dest: 'hand' | 'energy' | 'trash' = m[2].includes('手札') ? 'hand' : m[2].includes('エナ') ? 'energy' : 'trash';
      const cnt = m[1] ? parseNum(m[1]) : 1;
      return { type: 'TAKE_FROM_UNDER_SIGNI', destination: dest, count: cnt, upToCount: t.includes('まで'), fromThis: true } as TakeFromUnderSigniAction;
    }
  }

  // ---- 次のターンの間、対戦相手はグロウできない ----
  if (t.match(/次のターンの間、対戦相手はグロウできない/)) {
    return { type: 'STUB', id: 'LRIG_GROW_RESTRICT' } as StubAction;
  }

  // ---- 対戦相手のターン終了時、このシグニをトラッシュに置いてもよい ----
  if (t.match(/対戦相手のターン終了時、このシグニを場からトラッシュに置いてもよい/)) {
    return { type: 'STUB', id: 'OPTIONAL_TRASH_ENERGY_CLASS' } as StubAction;
  }

  // ---- トリガーした能力の処理順説明（ルール説明）----
  if (t.match(/トリガーした能力は.*好きな順番で処理する/) ||
      t.match(/（このアーツの後に.*処理する）/) ||
      t.match(/このカードの使用コストは.*にしか支払えない/)) {
    return { type: 'STUB', id: 'RULE_REMINDER_TEXT' } as StubAction;
  }

  // ---- このアーツは/このカードは対戦相手の手札が0枚の場合にしか使用できない ----
  if (t.match(/この(?:アーツ|カード)は.*手札が[０-９\d０]枚の場合にしか使用できない/)) {
    return { type: 'STUB', id: 'USE_CONDITION_TEXT' } as StubAction;
  }

  // ---- 選んだカードによって追加効果（CHOOSE系）----
  if (t.match(/あなたの場に.*シグニが[０-９\d]+体ある場合、代わりにカードを.*トラッシュに置く/)) {
    return { type: 'STUB', id: 'CONDITIONAL_ARTS_COST' } as StubAction;
  }

  // ---- この方法で〜N単位につきパワー±N / コスト減少（汎用）----
  if (t.match(/この方法で.*につき/)) {
    return { type: 'STUB', id: 'POWER_MOD_PER_COUNT' } as StubAction;
  }

  // ---- 公開したカードを好きな順番でデッキの一番下に置く ----
  if (t.match(/公開したカードを好きな順番でデッキの一番下に置く/)) {
    return { type: 'LOOK_AND_REORDER', source: { location: 'deck', owner: 'self' }, count: 0, private: false, reorder: false, destination: { location: 'deck', owner: 'self', position: 'bottom' } };
  }

  // ---- 使用しなかった場合、そのスペルを対戦相手のトラッシュに置く ----
  if (t.match(/使用しなかった場合、そのスペルを対戦相手のトラッシュに置く/)) {
    return { type: 'STUB', id: 'RULE_REMINDER_TEXT' } as StubAction;
  }

  // ---- N体以下/以上のシグニに使用することはできない（使用条件テキスト）----
  if (t.match(/のシグニに使用することはできない[）]?$/) || t.match(/にしか使用することはできない[）]?$/)) {
    return { type: 'STUB', id: 'USE_CONDITION_TEXT' } as StubAction;
  }

  // ---- このゲームの間、特定カードを使用できない ----
  if (t.match(/このゲームの間、あなたは《.+》を使用できない/)) {
    return { type: 'STUB', id: 'USE_CONDITION_TEXT' } as StubAction;
  }

  // ---- 対戦相手のシグニN体を対象とし、手札をN枚捨ててもよい ----
  if (t.match(/対戦相手のシグニ[０-９\d]*体?を対象とし、手札を好きな枚数捨ててもよい/) ||
      t.match(/対戦相手のシグニ[０-９\d]*体?を対象とし、手札を[０-９\d]+枚?捨ててもよい$/)) {
    return { type: 'STUB', id: 'TARGET_AND_DISCARD_HAND' } as StubAction;
  }

  // ---- 各プレイヤーは手札・エナ・シグニをすべてトラッシュに ----
  if (t.match(/各プレイヤーは.*(?:手札|エナゾーン).*シグニをすべてトラッシュに置く/)) {
    return { type: 'STUB', id: 'TRASH_ALL_SIGNI_AND_KEY' } as StubAction;
  }

  // ---- このシグニのレベルはN枚につきN減る ----
  if (t.match(/このシグニのレベルは.*[０-９\d]枚?につき[０-９\d]+減る/)) {
    return { type: 'STUB', id: 'POWER_MOD_PER_COUNT' } as StubAction;
  }

  // ---- そうしない場合、このシグニを場からトラッシュに置く ----
  if (t.match(/そうしない場合、このシグニを場からトラッシュに置く/)) {
    return { type: 'TRASH', target: { type: 'SIGNI', owner: 'self', count: 1 } };
  }

  // ---- あなたのデッキを上から/手札からカードをN枚公開する（汎用）----
  if (t.match(/^あなたの(?:デッキの一番上|手札から)を?公開する$/) ||
      t.match(/^デッキの一番上を公開する$/)) {
    return { type: 'REVEAL' };
  }

  // ---- 対戦相手の手札をN枚見る ----
  if (t.match(/^対戦相手の手札を見る$/) || t.match(/^対戦相手の手札を[０-９\d]+枚見る$/)) {
    return { type: 'STUB', id: 'LOOK_OPP_LIFE_TOP' } as StubAction;
  }

  // ---- このカードがあなたの効果によって手札から公開されたとき（parseBlock未処理フォールバック） ----
  if (t.match(/このカードがあなたの効果によって手札から公開されたとき/)) {
    return { type: 'STUB', id: 'REVEALED_FROM_HAND_UNSTRIPPED' } as StubAction;
  }

  // ---- 対戦相手のシグニN体を対象とし、ターン終了時まで、パワー±N ----
  {
    const m = t.match(/対戦相手のシグニ([０-９\d０-９]+)体?(?:まで)?を対象とし(?:、ターン終了時まで、それら?のパワーを([＋－][０-９\d]+)する)?/);
    if (m) {
      const cnt = parseNum(m[1]);
      const deltaStr = m[2];
      if (deltaStr) {
        const sign = deltaStr[0] === '＋' ? 1 : -1;
        const delta = sign * parseNum(deltaStr.slice(1));
        return {
          type: 'POWER_MODIFY',
          target: { type: 'SIGNI', owner: 'opponent', count: cnt, upToCount: t.includes('まで') },
          delta,
        };
      }
    }
  }

  // ---- あなたのシグニN体を対象とし、ターン終了時まで、パワー±N ----
  {
    const m = t.match(/あなたのシグニ([０-９\d０-９]+)体?(?:まで)?を対象とし(?:、ターン終了時まで、それら?のパワーを([＋－][０-９\d]+)する)?/);
    if (m) {
      const cnt = parseNum(m[1]);
      const deltaStr = m[2];
      if (deltaStr) {
        const sign = deltaStr[0] === '＋' ? 1 : -1;
        const delta = sign * parseNum(deltaStr.slice(1));
        return {
          type: 'POWER_MODIFY',
          target: { type: 'SIGNI', owner: 'self', count: cnt, upToCount: t.includes('まで') },
          delta,
        };
      }
    }
  }

  // ---- ゲームから除外 ----
  if (t.match(/をゲームから除外(?:してもよい|する)/))
    return { type: 'STUB', id: 'BANISH_FROM_GAME' } as StubAction;

  // ---- アーツ/スペル使用条件でコスト変化 ----
  if (t.match(/対戦相手が(?:アーツ|スペル)を使用していた場合/) ||
      t.match(/このターンに対戦相手が(?:アーツ|スペル)/) ||
      t.match(/両方を使用していた場合/))
    return { type: 'STUB', id: 'ARTS_COST_REDUCTION_BY_EFFECT' } as StubAction;

  // ---- 使用コストがXになる/減る ----
  if (t.match(/このアーツの使用コストは《.+》になる/) ||
      t.match(/このアーツの使用コストは《.+》減る/) ||
      t.match(/使用コストは《.+》になる$/) ||
      t.match(/それの使用コストは《.+》減る$/) ||
      t.match(/使用コストは[、《].+?[》]?に?なる/))
    return { type: 'STUB', id: 'ARTS_COST_REDUCTION_BY_EFFECT' } as StubAction;

  // ---- 選んだ数がN以上の場合コストが変わる ----
  if (t.match(/選んだ数が[０-９\d]+つ以上の場合、このアーツの使用コストは/))
    return { type: 'STUB', id: 'ARTS_COST_REDUCTION_BY_EFFECT' } as StubAction;

  // ---- ライフバーストを発動させる ----
  if (t.match(/そのライフバーストを発動させる/) ||
      t.match(/ライフバーストを持っていた場合.*チェックゾーンに置き/))
    return { type: 'STUB', id: 'TRIGGER_LIFE_BURST' } as StubAction;

  // ---- 《ヘブン》/自動能力引用文 ----
  if (t.match(/が《ヘブン》したとき/) ||
      t.match(/^【自】：.+したとき/))
    return { type: 'STUB', id: 'GRANT_QUOTED_AUTO_ABILITY' } as StubAction;

  // ---- アタックを一度無効にする ----
  if (t.match(/のアタックを一度無効にする/) ||
      t.match(/アタックであなたにダメージを与えない/))
    return { type: 'STUB', id: 'NEGATE_ATTACK_ON_TRIGGER' } as StubAction;

  // ---- 対戦相手はデッキの一番上を公開する ----
  if (t.match(/対戦相手は(?:自分の)?デッキの一番上のカードを公開する/))
    return { type: 'STUB', id: 'LOOK_OPP_LIFE_TOP' } as StubAction;

  // ---- それらを入れ替えてもよい ----
  if (t.match(/^あなたはそれらを入れ替えてもよい$/))
    return { type: 'STUB', id: 'SWAP_OPTIONAL' } as StubAction;

  // ---- トラッシュから手札にあるかのように使用 ----
  if (t.match(/トラッシュから.*手札にあるかのように.*(?:使用|発動)(?:する|してもよい)/) ||
      t.match(/トラッシュから.*コストを支払わずに.*使用してもよい/))
    return { type: 'STUB', id: 'PLAY_FREE' } as StubAction;

  // ---- 代替コスト支払い（支払う際、代わりにトラッシュ） ----
  if (t.match(/支払う際、代わりに.*トラッシュに置いてもよい/))
    return { type: 'STUB', id: 'OPTIONAL_COST' } as StubAction;

  // ---- 対戦相手エナゾーン全カードとシグニをすべてトラッシュ ----
  if (t.match(/対戦相手のエナゾーンにあるすべての.*カードと対戦相手の場にあるすべてのシグニをトラッシュに置く/))
    return { type: 'STUB', id: 'MASS_TRASH' } as StubAction;

  // ---- 選んだ色につきシグニを手札/エナ ----
  if (t.match(/選んだ色[１-９1-9]+つにつき.*シグニ[１-９1-9]+枚を手札に加えるかエナゾーンに置く/))
    return { type: 'STUB', id: 'CHOOSE_COLOR_FROM_LIST' } as StubAction;

  // ---- カード名に〜含むすべてを手札に加え残りをトラッシュ ----
  if (t.match(/その中からカード名に《.+》を含むすべてのカードを手札に加え、残りをトラッシュに置く/))
    return makeRevealPickStub(t);

  // ---- 好きな数の〈クラス〉シグニを場に出す ----
  if (t.match(/その中から好きな数の[＜〈<].+[＞〉>]のシグニを場に出し、残りをトラッシュに置く/))
    return { type: 'STUB', id: 'REVEAL_PICK_PLAY' } as StubAction;

  // ---- 以下からN選ぶ ----
  if (t.match(/^以下から[０-９\d]+つから[０-９\d]+つまで選ぶ$/) ||
      t.match(/^以下から[０-９\d]+つ選ぶ$/))
    return { type: 'STUB', id: 'CHOOSE_N_FROM_LIST' } as StubAction;

  // ---- それをトラッシュに置いて対戦相手デッキ上をライフに ----
  if (t.match(/トラッシュに置いて対戦相手のデッキの一番上のカードをライフクロスに加えてもよい/))
    return { type: 'STUB', id: 'DECK_TOP_TO_LIFE' } as StubAction;

  // ---- 感染状態の場合、代わりに ----
  if (t.match(/感染状態の場合、代わりに/))
    return { type: 'STUB', id: 'CONDITIONAL_POWER_BONUS' } as StubAction;

  // ---- ウィルスN個取り除く（複数形） ----
  if (t.match(/対戦相手の場にある【ウィルス】[０-９\d]+つを取り除いてもよい/))
    return { type: 'STUB', id: 'REMOVE_VIRUS' } as StubAction;

  // ---- シグニがアクセされたとき自動能力 ----
  if (t.match(/シグニ[１-９1-9０-９\d]*体?がアクセされたとき/))
    return { type: 'STUB', id: 'GRANT_QUOTED_AUTO_ABILITY' } as StubAction;

  // ---- そのシグニと共通する色を持つシグニを手札から捨ててもよい ----
  if (t.match(/手札からそのシグニと共通する色を持つシグニを[１-９1-9０-９\d]*枚捨ててもよい/))
    return { type: 'STUB', id: 'OPTIONAL_COST' } as StubAction;

  // ---- 対戦相手シグニのアタックを無効にしたとき/センタールリグをガードしたとき ----
  if (t.match(/対戦相手のシグニ[１-９1-9０-９\d]*体?のアタックを(?:効果によって)?無効にしたとき/) ||
      t.match(/対戦相手のセンタールリグのアタックを【ガード】するか/))
    return { type: 'STUB', id: 'NEGATE_ATTACK_ON_TRIGGER' } as StubAction;

  // ---- 正面のシグニを対象とし、デッキ上カードをトラッシュ ----
  if (t.match(/正面のシグニ[１-９1-9０-９\d]*体?を対象とし、あなたのデッキの一番上のカードをトラッシュに置いてもよい/))
    return { type: 'STUB', id: 'TARGET_AND_DISCARD_HAND' } as StubAction;

  // ---- 【トラップ】をトラッシュに置く ----
  if (t.match(/【トラップ】[１-９1-9０-９\d]*つをトラッシュに置く/))
    return { type: 'STUB', id: 'LRIG_UNDER_CARD_OP' } as StubAction;

  // ---- このシグニによってクラッシュされたLBは発動しない ----
  if (t.match(/このシグニによってクラッシュされたカードのライフバーストは発動しない/))
    return { type: 'STUB', id: 'SUPPRESS_LIFE_BURST_ON_CRASH' } as StubAction;

  // ---- この効果でレベルは0以下にならない ----
  if (t.match(/この効果でレベルは[０0]以下にはならない/))
    return { type: 'STUB', id: 'RULE_REMINDER_TEXT' } as StubAction;

  // ---- 宣言した数字と同じレベルシグニを捨てさせる ----
  if (t.match(/宣言した数字と同じレベルのシグニをすべて捨てさせる/) ||
      t.match(/その後、数字[１-９1-9０-９\d]*つを宣言し、その数字と同じレベル.*シグニをすべて捨てさせる/))
    return { type: 'STUB', id: 'DECLARE_NUMBER' } as StubAction;

  // ---- 対戦相手の手札を見てシグニを捨てさせる ----
  if (t.match(/対戦相手の手札を見て.*シグニ(?:を|すべて)捨てさせる/))
    return { type: 'STUB', id: 'LOOK_OPP_LIFE_TOP' } as StubAction;

  // ---- この方法で場に出たレゾナの【出】能力は発動しない ----
  if (t.match(/この方法で場に出たレゾナの【出】能力は発動しない/))
    return { type: 'STUB', id: 'RULE_REMINDER_TEXT' } as StubAction;

  // ---- 好きな数のシグニを対象とし、合わせてパワーを増やす ----
  if (t.match(/好きな数のシグニを対象とし、ターン終了時まで、それらのパワーを合わせて/))
    return { type: 'STUB', id: 'POWER_MOD_PER_COUNT' } as StubAction;

  // ---- この下から好きな枚数のシグニをトラッシュ ----
  if (t.match(/この下から好きな枚数のシグニを対象とし、それらをトラッシュに置く/))
    return { type: 'STUB', id: 'LRIG_UNDER_CARD_OP' } as StubAction;

  // ---- 公開した他のカードをシャッフルしてデッキ下 ----
  if (t.match(/公開した他のカードをシャッフルしてデッキの一番下に置く/))
    return { type: 'STUB', id: 'LOOK_OPP_LIFE_TOP' } as StubAction;

  // ---- N以外/0からNの数字を宣言する ----
  if (t.match(/^[０0]から[０-９\d]+までの数字[１-９1-9０-９\d]*つを宣言する$/) ||
      t.match(/^[０-９\d]+以外の数字[１-９1-9０-９\d]*つを宣言する$/))
    return { type: 'STUB', id: 'DECLARE_NUMBER' } as StubAction;

  // ---- 括弧で終わる注釈文（場合/含まれる/何もしない） ----
  if (t.match(/[）)）]$/) &&
      (t.includes('この効果は何もしない') || t.includes('含まれる') || t.includes('場を離れていた場合')))
    return { type: 'STUB', id: 'RULE_REMINDER_TEXT' } as StubAction;

  // ---- トラップ配置し直す ----
  if (t.match(/すべての【トラップ】を好きなように配置し直す/))
    return { type: 'STUB', id: 'LRIG_UNDER_CARD_OP' } as StubAction;

  // ---- 手札からカードを【トラップ】として設置する ----
  if (t.match(/手札からカードを[１-９\d]*枚?まで【トラップ】として.*シグニゾーンに設置する/))
    return { type: 'STUB', id: 'LRIG_UNDER_CARD_OP' } as StubAction;

  // ---- その中から〈クラス〉/レベル/色シグニを手札に加え残りをトラッシュ ----
  if (t.match(/その中から.*[＜〈<].*[＞〉>].*シグニ.*手札に加え/) ||
      t.match(/その中から.*シグニ.*手札に加え(?:、残りをトラッシュに置く)?$/) ||
      t.match(/その中から.*(?:好きな数の|それぞれ名前の異なるように).*シグニ.*手札に加え/) ||
      t.match(/その中から(?:白か黒|青か黒|赤か白).+シグニ.+手札に加え/) ||
      t.match(/その中からレベル[０-９\d０-９]+のシグニ.+手札に加え/))
    return makeRevealPickStub(t);

  // ---- その中からスペル/カードを手札に加える ----
  if (t.match(/その中から.*スペル[１-９\d]*枚を(?:公開し)?手札に加える$/) ||
      t.match(/その中から.*を公開し手札に加えるかエナゾーンに置く$/) ||
      t.match(/その中から.*アイコン》を持つシグニ[１-９\d]*枚を(?:公開し)?手札に加える$/))
    return makeRevealPickStub(t);

  // ---- その後、そのシグニを場に出し残りをトラッシュ ----
  if (t.match(/その後、そのシグニを場に出し、残りをトラッシュに置く/))
    return { type: 'STUB', id: 'REVEAL_PICK_PLAY' } as StubAction;

  // ---- センタールリグが〈クラス〉の場合にしか使用できない ----
  if (t.match(/この能力の使用コストは無色ではないカードでしか支払えない/) ||
      t.match(/このアーツの使用コストに含まれる.*コストは.*でしか支払えない/))
    return { type: 'STUB', id: 'RULE_REMINDER_TEXT' } as StubAction;
  if (t.match(/この能力はあなたのセンタールリグが[＜〈<].+[＞〉>]の場合しか使用できない/) ||
      t.match(/この能力はこのシグニが.+の場合にしか発動しない/))
    return { type: 'STUB', id: 'USE_CONDITION_TEXT' } as StubAction;

  // ---- 手札から《特定カード》を捨てる ----
  if (t.match(/^手札から《.+》を[１-９\d]*枚捨てる$/))
    return { type: 'TRASH', target: { type: 'HAND_CARD', owner: 'self', count: 1 } };

  // ---- 手札の枚数の上限がN増える ----
  if (t.match(/あなたの手札の枚数の上限は[１-９\d０-９]+増える/))
    return { type: 'STUB', id: 'HAND_SIZE_INCREASE' } as StubAction;

  // ---- ウィルスをシグニゾーンに置く（合計N個になるように） ----
  if (t.match(/【ウィルス】の合計が[１-９\d０-９]+つになるように.*シグニゾーンに【ウィルス】を置く/))
    return { type: 'STUB', id: 'REMOVE_VIRUS' } as StubAction;

  // ---- 対戦相手の場のすべての【ウィルス】を取り除く ----
  if (t.match(/対戦相手の場にあるすべての【ウィルス】を取り除く/))
    return { type: 'STUB', id: 'REMOVE_VIRUS' } as StubAction;

  // ---- シグニ１体の基本レベルをN～Nにする ----
  if (t.match(/それの基本レベルを[１-９\d０-９]～[１-９\d０-９]いずれかのレベル[１-９\d０-９]つにする/))
    return { type: 'STUB', id: 'POWER_MOD_PER_COUNT' } as StubAction;

  // ---- それらの【出】能力は発動せず〜 ----
  if (t.match(/【出】能力は発動せず/) ||
      t.match(/【英知】能力の条件がこのシグニのレベルを参照する場合/) ||
      t.match(/アタックフェイズの開始時.*シグニをチェックゾーンに置く/))
    return { type: 'STUB', id: 'RULE_REMINDER_TEXT' } as StubAction;

  // ---- デッキを公開しクラスシグニがめくれるまで ----
  if (t.match(/デッキの上から.*シグニがめくれるまで公開し、そのシグニを手札に加える/))
    return makeRevealPickStub(t);

  // ---- このシグニが〜したとき（AUTO能力引用） ----
  if (t.match(/このシグニが対戦相手のシグニ[１-９\d０-９]*体?をバニッシュしたとき/))
    return { type: 'STUB', id: 'GRANT_QUOTED_AUTO_ABILITY' } as StubAction;

  // ---- カード名に〜を含むシグニを手札/エナ ----
  if (t.match(/あなたの場にカード名に《.+》を含むシグニがある場合、代わりに/))
    return { type: 'STUB', id: 'CONDITIONAL_POWER_BONUS' } as StubAction;

  // ---- 選んだ数がNつの場合コストが変わる ----
  if (t.match(/選んだ数が[１-９\d０-９]+つの場合、このアーツの使用コストは/))
    return { type: 'STUB', id: 'ARTS_COST_REDUCTION_BY_EFFECT' } as StubAction;

  // ---- それが〜の場合、追加でトラッシュ ----
  if (t.match(/それが.+のシグニの場合、追加でそれをトラッシュに置く/))
    return { type: 'STUB', id: 'CONDITIONAL_POWER_BONUS' } as StubAction;

  // ---- ルリグのエクシード能力をコスト0で使用 ----
  if (t.match(/ルリグのエクシード(?:の値が[１-９\d０-９]+以下の)?能力[１-９\d０-９]*つをコストを支払わずに使用する/))
    return { type: 'STUB', id: 'PLAY_FREE' } as StubAction;

  // ---- 対戦相手はライフクロスの一番上を公開する ----
  if (t.match(/対戦相手はライフクロスの一番上を公開する/))
    return { type: 'STUB', id: 'LOOK_OPP_LIFE_TOP' } as StubAction;

  // ---- カードがLBを持たない場合トラッシュ ----
  if (t.match(/そのカードが【ライフバースト】を持たない場合、それをトラッシュに置く/))
    return { type: 'STUB', id: 'CONDITIONAL_POWER_BONUS' } as StubAction;

  // ---- 追加のアタックフェイズを加える ----
  if (t.match(/追加のアタックフェイズを加える/))
    return { type: 'STUB', id: 'LRIG_GROW_RESTRICT' } as StubAction;

  // ---- この方法でN枚以上公開/トラッシュした場合 ----
  if (t.match(/この方法でカードが[１-９\d０-９]+枚以上公開された場合/) ||
      t.match(/この方法でカードを[１-９\d０-９]+枚トラッシュに置いた場合/))
    return { type: 'STUB', id: 'CONDITIONAL_POWER_BONUS' } as StubAction;

  // ---- 手札からそれぞれ異なる色を持つシグニを好きな枚数捨てる ----
  if (t.match(/手札からそれぞれ異なる色を持つ.+シグニを好きな枚数捨てる/))
    return { type: 'STUB', id: 'OPTIONAL_COST' } as StubAction;

  // ---- このシグニは色を失い、宣言した色を得る ----
  if (t.match(/このシグニは色を失い、宣言した色を得る/))
    return { type: 'STUB', id: 'POWER_MOD_PER_COUNT' } as StubAction;

  // ---- このカードをトラッシュからデッキ下に置く ----
  if (t.match(/^このカードをトラッシュからデッキの一番下に置く$/))
    return { type: 'STUB', id: 'LOOK_OPP_LIFE_TOP' } as StubAction;

  // ---- 対戦相手の場かエナゾーンからシグニをトラッシュ ----
  if (t.match(/対戦相手の、場かエナゾーンから.+シグニ[１-９\d０-９]*枚を対象とし、それをトラッシュに置く/))
    return { type: 'STUB', id: 'TRADE_BANISH_SELF_SIGNI' } as StubAction;

  // ---- レベルN〜Nについても同様に行う ----
  if (t.match(/レベル[１-９\d０-９]、レベル[１-９\d０-９].*についても同様に行う/))
    return { type: 'STUB', id: 'RULE_REMINDER_TEXT' } as StubAction;

  // ---- 対戦相手ライフクロス上からカードを見る ----
  if (t.match(/対戦相手のライフクロスの上からカードを[１-９\d０-９]+枚見る/))
    return { type: 'STUB', id: 'LOOK_OPP_LIFE_TOP' } as StubAction;

  // ---- チェックゾーンに置き残りをライフに戻す ----
  if (t.match(/チェックゾーンに置き、残りを対戦相手のライフクロスの一番上に戻す/))
    return { type: 'STUB', id: 'LOOK_OPP_LIFE_TOP' } as StubAction;

  // ---- その中からN枚を【トラップ】として設置する ----
  if (t.match(/その中から[１-９\d０-９]*枚?まで?を【トラップ】として.*シグニゾーンに設置する/))
    return { type: 'STUB', id: 'LRIG_UNDER_CARD_OP' } as StubAction;

  // ---- パワーをこの方法で捨てたシグニのパワーと同じだけ増減 ----
  if (t.match(/パワーをこの方法で捨てたシグニのパワーと同じだけ/))
    return { type: 'STUB', id: 'POWER_MOD_PER_COUNT' } as StubAction;

  // ---- 《レイヤーアイコン》の能力を得る ----
  if (t.match(/《レイヤーアイコン》の能力を得る/))
    return { type: 'STUB', id: 'GRANT_ABILITY_INNER_TEXT' } as StubAction;

  // ---- この下からカードをトラッシュに置いてもよい ----
  if (t.match(/この下からカード[１-９\d０-９]*枚をトラッシュに置いてもよい/))
    return { type: 'STUB', id: 'LRIG_UNDER_CARD_OP' } as StubAction;

  // ---- スペルがN種類以上ある場合 ----
  if (t.match(/スペルが[１-９\d０-９]+種類以上ある場合/))
    return { type: 'STUB', id: 'CONDITIONAL_POWER_BONUS' } as StubAction;

  // ---- この方法でシグニをN枚以上公開した場合 ----
  if (t.match(/この方法でシグニを[１-９\d０-９]+枚以上公開した場合/))
    return { type: 'STUB', id: 'CONDITIONAL_POWER_BONUS' } as StubAction;

  // ---- 手札をすべて捨ててもよい ----
  if (t.match(/^あなたは手札をすべて捨ててもよい$/))
    return { type: 'STUB', id: 'OPTIONAL_COST' } as StubAction;

  // ---- すべてのシグニを好きなように配置し直してもよい ----
  if (t.match(/すべてのシグニを、?好きなように配置し直してもよい/))
    return { type: 'STUB', id: 'LRIG_UNDER_CARD_OP' } as StubAction;

  // ---- 宣言されたカード名のカードが《サーバントZERO》になる ----
  if (t.match(/宣言されたカード名のカードは《サーバント.*》になる/))
    return { type: 'STUB', id: 'DECLARE_CARD_NAME' } as StubAction;

  // ---- ルリグデッキを分ける/束から選ぶ ----
  if (t.match(/ルリグデッキを裏向きで[１-９\d０-９]+つの束に分ける/) ||
      t.match(/どちらかの束を見て.*アーツ[１-９\d０-９]*枚をルリグトラッシュに置く/))
    return { type: 'STUB', id: 'CAST_FROM_OPP_TRASH' } as StubAction;

  // ---- そのカードのライフバーストを発動する ----
  if (t.match(/そのカードのライフバーストを発動する/))
    return { type: 'STUB', id: 'TRIGGER_LIFE_BURST' } as StubAction;

  // ---- トラップを表向きにして発動 / トラップアイコン発動 ----
  if (t.match(/【トラップ】.*表向きにし.*トラップアイコン.*発動してもよい/) ||
      t.match(/トラップアイコン》を発動させる/))
    return { type: 'STUB', id: 'LRIG_UNDER_CARD_OP' } as StubAction;

  // ---- このターン終了時、手札をN枚捨てる ----
  if (t.match(/^このターン終了時、手札を[１-９\d０-９]+枚捨てる$/))
    return { type: 'TRASH', target: { type: 'HAND_CARD', owner: 'self', count: 2 } };

  // ---- プレイヤーを1人まで選ぶ ----
  if (t.match(/^プレイヤーを[１-９\d０-９]*人?まで選ぶ$/))
    return { type: 'STUB', id: 'CHOOSE_N_FROM_LIST' } as StubAction;

  // ---- 対戦相手のすべてのシグニをエナゾーンに置く ----
  if (t.match(/対戦相手のすべてのシグニをエナゾーンに置く/))
    return { type: 'STUB', id: 'MASS_TRASH' } as StubAction;

  // ---- あなたの他の＜クラス＞のシグニ１体を場からトラッシュに置いてもよい ----
  if (t.match(/対象のあなたの他の[＜〈<].+[＞〉>]のシグニ[１-９\d０-９]*体?を場からトラッシュに置いてもよい/))
    return { type: 'STUB', id: 'TRADE_BANISH_SELF_SIGNI' } as StubAction;

  // ---- 手札から《特定カード》をN枚捨ててもよい（ターゲット指定後） ----
  if (t.match(/手札から《.+》を[１-９\d０-９]*枚?捨ててもよい$/))
    return { type: 'STUB', id: 'OPTIONAL_COST' } as StubAction;

  // ---- 各プレイヤーは手札からカードを公開する ----
  if (t.match(/各プレイヤーは手札からカードを[１-９\d０-９]*枚?公開する/))
    return { type: 'STUB', id: 'LOOK_OPP_LIFE_TOP' } as StubAction;

  // ---- シグニが0枚の場合、何もしない） ----
  if (t.match(/シグニが[０0]枚の場合、何もしない[）)）]/))
    return { type: 'STUB', id: 'RULE_REMINDER_TEXT' } as StubAction;

  // ---- 対戦相手はシグニをN枚まで場に出す ----
  if (t.match(/対戦相手はその中からシグニを[１-９\d０-９]+枚まで場に出し、残りをトラッシュに置く/))
    return { type: 'STUB', id: 'REVEAL_PICK_PLAY' } as StubAction;

  // ---- 次のメインフェイズまでリミットが変わり〜 ----
  if (t.match(/次のあなたのメインフェイズまで.*リミットは/) ||
      t.match(/次のあなたのメインフェイズまで.*ダメージを受けない/))
    return { type: 'STUB', id: 'LRIG_GROW_RESTRICT' } as StubAction;

  // ---- 手札がN枚以下の場合にしか使用できない ----
  if (t.match(/手札が[１-９\d０-９]+枚以下の場合にしか使用できない/))
    return { type: 'STUB', id: 'USE_CONDITION_TEXT' } as StubAction;

  // ---- にしか使用できない（汎用）----
  if (t.match(/にしか使用できない$/))
    return { type: 'STUB', id: 'USE_CONDITION_TEXT' } as StubAction;

  // ---- そのシグニを場に出し、公開されたカードをトラッシュ ----
  if (t.match(/そのシグニを場に出し、この方法で公開されたカードをトラッシュに置く/))
    return { type: 'STUB', id: 'REVEAL_PICK_PLAY' } as StubAction;

  // ---- その中から〈クラス〉シグニをN枚まで場に出す ----
  if (t.match(/その中から[＜〈<].+[＞〉>]のシグニを[１-９\d０-９]+枚まで場に出し/))
    return { type: 'STUB', id: 'REVEAL_PICK_PLAY' } as StubAction;

  // ---- 手札からカードをデッキの一番上に置く ----
  if (t.match(/手札からカード[１-９\d０-９]+枚を好きな順番でデッキの一番上に置く/))
    return { type: 'STUB', id: 'LOOK_AND_REORDER' } as StubAction;

  // ---- 対戦相手は数字を宣言する ----
  if (t.match(/^対戦相手は数字[１-９\d０-９]*つを宣言する$/))
    return { type: 'STUB', id: 'DECLARE_NUMBER' } as StubAction;

  // ---- アーツ回数と宣言数字が異なる場合敗北 ----
  if (t.match(/アーツの回数が宣言した数字と異なる場合.*ゲームに敗北する/))
    return { type: 'STUB', id: 'RULE_REMINDER_TEXT' } as StubAction;

  // ---- デッキの上からシグニのレベルと同じ枚数をトラッシュ ----
  if (t.match(/デッキの上からそのシグニのレベルと同じ枚数のカードをトラッシュに置く/))
    return { type: 'STUB', id: 'POWER_MOD_PER_COUNT' } as StubAction;

  // ---- デッキからシグニを探して公開する ----
  if (t.match(/^あなたのデッキからシグニ[１-９\d０-９]*枚を探して公開する$/))
    return { type: 'STUB', id: 'REVEAL_AND_PICK' } as StubAction;

  // ---- 場に出さない場合、トラッシュ ----
  if (t.match(/^場に出さない場合、それをトラッシュに置く$/))
    return { type: 'STUB', id: 'RULE_REMINDER_TEXT' } as StubAction;

  // ---- トラッシュから場に出た場合、代わりにパワー変動 ----
  if (t.match(/トラッシュから場に出た場合、代わりに[＋－][０-９\d０-９]+する/))
    return { type: 'STUB', id: 'CONDITIONAL_POWER_BONUS' } as StubAction;

  // ---- 手札をN枚捨ててもよい（任意） ----
  if (t.match(/^あなたは手札を[１-９\d０-９]+枚捨ててもよい$/))
    return { type: 'STUB', id: 'OPTIONAL_COST' } as StubAction;

  // ---- デッキからシグニを探してもよい ----
  if (t.match(/あなたのデッキから.+シグニ[１-９\d０-９]*枚を探してもよい/))
    return { type: 'STUB', id: 'REVEAL_AND_PICK' } as StubAction;

  // ---- このゲームの間の特殊効果 ----
  if (t.match(/このゲームの間、あなた(?:の場|のメイン|が)/))
    return { type: 'STUB', id: 'GAIN_ABILITY_THIS_GAME' } as StubAction;

  // ---- このゲームの間、N回目の使用で ----
  if (t.match(/このゲームの間に.*[N回目].*である場合/))
    return { type: 'STUB', id: 'GAIN_ABILITY_THIS_GAME' } as StubAction;

  // ---- このゲームの間（汎用フォールバック） ----
  if (t.match(/^このゲームの間、/))
    return { type: 'STUB', id: 'GAIN_ABILITY_THIS_GAME' } as StubAction;

  // ---- 残りをトラッシュに置く（単独文） ----
  if (t.match(/^残りをトラッシュに置く$/) || t.match(/^残りを好きな順番でデッキの一番下に置く$/))
    return { type: 'STUB', id: 'RULE_REMINDER_TEXT' } as StubAction;

  // ---- 手札からカードをデッキ上/下に置く ----
  if (t.match(/手札からカード[１-９\d０-９]*枚?をデッキの一番[上下]に置く/))
    return { type: 'STUB', id: 'LOOK_AND_REORDER' } as StubAction;

  // ---- あなたのターンの場合（条件付き効果） ----
  if (t.match(/^あなたのターンの場合、/))
    return { type: 'STUB', id: 'CONDITIONAL_POWER_BONUS' } as StubAction;

  // ---- アーツ/シグニ使用/バニッシュしたとき（AUTO内包テキスト） ----
  if (t.match(/あなたがアーツを使用したとき、このシグニを/) ||
      t.match(/このシグニが場を離れたとき/) ||
      t.match(/ドローフェイズ以外であなたがカードを[１-９\d０-９]*枚引いたとき/) ||
      t.match(/対戦相手のレベル[０-９\d０-９]+以下のシグニ[１-９\d０-９]*体?がこのシグニの正面.*出たとき/))
    return { type: 'STUB', id: 'GRANT_QUOTED_AUTO_ABILITY' } as StubAction;

  // ---- コスト支払いでシグニをトラッシュ（任意コスト形式） ----
  if (t.match(/《[白赤青緑黒無][^》]*》.*を支払い、このシグニを場からトラッシュに置いてもよい/))
    return { type: 'STUB', id: 'OPTIONAL_COST' } as StubAction;

  // ---- バニッシュできなかった場合の注釈） ----
  if (t.match(/バニッシュできなかった場合は.*[）)）]/))
    return { type: 'STUB', id: 'RULE_REMINDER_TEXT' } as StubAction;

  // ---- レベルが偶数/奇数の場合 ----
  if (t.match(/レベルが(?:偶数|奇数)のシグニの場合/))
    return { type: 'STUB', id: 'CONDITIONAL_POWER_BONUS' } as StubAction;

  // ---- 手札から〜捨てないかぎり ----
  if (t.match(/手札から.+捨てないかぎり/))
    return { type: 'STUB', id: 'OPTIONAL_COST' } as StubAction;

  // ---- 対象のシグニをエナゾーンに置く（BOUNCE to energy） ----
  if (t.match(/^対象の対戦相手のシグニ[１-９\d０-９]*体?をエナゾーンに置く$/))
    return { type: 'STUB', id: 'MASS_TRASH' } as StubAction;

  // ---- デッキ公開して宣言した色のカードをエナゾーン ----
  if (t.match(/デッキの一番上を公開し、それが宣言した色を持つカードの場合.*エナゾーンに置く/))
    return { type: 'STUB', id: 'CONDITIONAL_POWER_BONUS' } as StubAction;

  // ---- 【シード】として場に出す ----
  if (t.match(/【シード】として.*シグニゾーンに出してもよい/) ||
      t.match(/【シード】として.*シグニゾーンに出すか/))
    return { type: 'STUB', id: 'REVEAL_PICK_PLAY' } as StubAction;

  // ---- 正面に加え両隣にもアタック（トリプルアタック） ----
  if (t.match(/正面に加えてその両隣のシグニゾーンにもアタックする/))
    return { type: 'STUB', id: 'LRIG_GROW_RESTRICT' } as StubAction;

  // ---- 追加ターン/追加フェイズのルール注釈 ----
  if (t.match(/この方法で追加されたターンの.+の間、あなたは/) ||
      t.match(/この方法で追加されたアタックフェイズ/))
    return { type: 'STUB', id: 'RULE_REMINDER_TEXT' } as StubAction;

  // ---- センタールリグがNでない場合、カードをデッキに加える ----
  if (t.match(/センタールリグが.*でない場合.*デッキに加える/))
    return { type: 'STUB', id: 'CONDITIONAL_POWER_BONUS' } as StubAction;

  // ---- その中から赤/白/特定色シグニを場に出す ----
  if (t.match(/その中から(?:赤|白|青|緑|黒)のシグニ[１-９\d０-９]*枚を場に出し、残りをトラッシュに置く/))
    return { type: 'STUB', id: 'REVEAL_PICK_PLAY' } as StubAction;

  // ---- 以下のN個を行う ----
  if (t.match(/^以下の[１-９\d０-９]+つを行う$/))
    return { type: 'STUB', id: 'CHOOSE_N_FROM_LIST' } as StubAction;

  // ---- グロウフェイズのコスト変化 ----
  if (t.match(/グロウフェイズの間.*エナコストは/))
    return { type: 'STUB', id: 'ARTS_COST_REDUCTION_BY_EFFECT' } as StubAction;

  // ---- 《サーバントZERO》にする ----
  if (t.match(/を《サーバント.*》にする/))
    return { type: 'STUB', id: 'DECLARE_CARD_NAME' } as StubAction;

  // ---- コストの色を無視して支払える/支払う ----
  if (t.match(/コストの色を無視して支払(?:える|ってもよい)/))
    return { type: 'STUB', id: 'ARTS_COST_REDUCTION_BY_EFFECT' } as StubAction;

  // ---- トラッシュからすべてのカードをデッキに加えてもよい ----
  if (t.match(/トラッシュからすべてのカードをデッキに加えてもよい/))
    return { type: 'STUB', id: 'LOOK_AND_REORDER' } as StubAction;

  // ---- センタールリグのレベル以下の数字を宣言 ----
  if (t.match(/センタールリグのレベル以下の数字[１-９\d０-９]*つを宣言する/))
    return { type: 'STUB', id: 'DECLARE_NUMBER' } as StubAction;

  // ---- プレイヤーはそこにシグニを配置できない） ----
  if (t.match(/シグニを配置できない[）)）]/))
    return { type: 'STUB', id: 'RULE_REMINDER_TEXT' } as StubAction;

  // ---- 対戦相手は手札をすべて捨てN枚引く ----
  if (t.match(/対戦相手は手札をすべて捨て.*枚.*カードを引く/))
    return { type: 'STUB', id: 'TARGET_AND_DISCARD_HAND' } as StubAction;

  // ---- 対戦相手はデッキの一番下のカードをトラッシュ ----
  if (t.match(/対戦相手は(?:自分の)?デッキの一番下のカードをトラッシュに置く/))
    return { type: 'STUB', id: 'LOOK_OPP_LIFE_TOP' } as StubAction;

  // ---- このシグニが場を離れる場合、代わりに裏向きに ----
  if (t.match(/このシグニが場を離れる場合、代わりに.*裏向きにしてもよい/))
    return { type: 'STUB', id: 'RULE_REMINDER_TEXT' } as StubAction;

  // ---- デッキの一番上か一番下に置く ----
  if (t.match(/デッキの一番上か一番下に置く/))
    return { type: 'STUB', id: 'LOOK_AND_REORDER' } as StubAction;

  // ---- シグニゾーンに配置してもよい ----
  if (t.match(/シグニゾーン[１-９\d０-９]*つに配置してもよい/))
    return { type: 'STUB', id: 'LRIG_UNDER_CARD_OP' } as StubAction;

  // ---- 各プレイヤーがシグニを場に出す ----
  if (t.match(/各プレイヤーは.*シグニを.*場に出し/))
    return { type: 'STUB', id: 'REVEAL_PICK_PLAY' } as StubAction;

  // ---- シグニを裏向きにしてもよい ----
  if (t.match(/シグニ[１-９\d０-９]*体?(?:まで)?を対象とし、それらを裏向きにしてもよい/))
    return { type: 'STUB', id: 'LRIG_UNDER_CARD_OP' } as StubAction;

  // ---- シグニをエナゾーンからデッキ下に置いてもよい ----
  if (t.match(/このシグニをエナゾーンからデッキの一番下に置いてもよい/))
    return { type: 'STUB', id: 'LRIG_UNDER_CARD_OP' } as StubAction;

  // ---- 正面にあったシグニをトラッシュ（単独文） ----
  if (t.match(/^正面にあったそのシグニをトラッシュに置く$/))
    return { type: 'STUB', id: 'RULE_REMINDER_TEXT' } as StubAction;

  // ---- トラッシュから〜シグニを対象とし、手札を捨ててもよい ----
  if (t.match(/あなたのトラッシュから.*シグニ[１-９\d０-９]*枚を対象とし、手札を[１-９\d０-９]*枚捨ててもよい/))
    return { type: 'STUB', id: 'TRADE_BANISH_SELF_SIGNI' } as StubAction;

  // ---- 手札からスペルN枚を公開してもよい ----
  if (t.match(/あなたの手札からスペル[１-９\d０-９]*枚を公開してもよい/))
    return { type: 'STUB', id: 'LOOK_OPP_LIFE_TOP' } as StubAction;

  // ---- このターン終了時、手札とエナをすべてトラッシュ ----
  if (t.match(/このターン終了時、あなたの手札とエナゾーンにあるすべてのカードをトラッシュに置く/))
    return { type: 'STUB', id: 'MASS_TRASH' } as StubAction;

  // ---- デッキ上N枚を見て表/裏束に分けて対戦相手がどちらかをトラッシュ ----
  if (t.match(/表向きの束にし、残りを裏向きの束にする/) ||
      t.match(/どちらかの束をトラッシュに置き.*残りの束を手札に加える/))
    return { type: 'STUB', id: 'LOOK_AND_REORDER' } as StubAction;

  // ---- 対戦相手は手札を２枚捨ててもよい ----
  if (t.match(/^対戦相手は手札を[１-９\d０-９]+枚(?:まで)?捨ててもよい$/))
    return { type: 'STUB', id: 'TARGET_AND_DISCARD_HAND' } as StubAction;

  // ---- 《ガードアイコン》を持たないカードをデッキ下に ----
  if (t.match(/《ガードアイコン》を持たないカード[１-９\d０-９]*枚を選び.*デッキの一番下に置く/))
    return { type: 'STUB', id: 'LOOK_OPP_LIFE_TOP' } as StubAction;

  // ---- 対戦相手はシグニを好きな数選ぶ ----
  if (t.match(/^対戦相手は(?:自分の)?シグニを好きな数選ぶ$/))
    return { type: 'STUB', id: 'CHOOSE_N_FROM_LIST' } as StubAction;

  // ---- あなたのライフクロスN枚をトラッシュに置いてもよい ----
  if (t.match(/^あなたのライフクロス[１-９\d０-９]*枚をトラッシュに置いてもよい$/))
    return { type: 'STUB', id: 'OPTIONAL_COST' } as StubAction;

  // ---- 対戦相手のシグニを対象とし、手札をN枚捨てる（条件付き） ----
  if (t.match(/対戦相手のシグニ[１-９\d０-９]*体?を対象とし、手札を[１-９\d０-９]*枚(?:まで)?捨てる$/))
    return { type: 'STUB', id: 'TARGET_AND_DISCARD_HAND' } as StubAction;

  // ---- あなたのデッキをシャッフルしてもよい ----
  if (t.match(/^あなたのデッキをシャッフルしてもよい$/))
    return { type: 'STUB', id: 'RULE_REMINDER_TEXT' } as StubAction;

  // ---- デッキを公開してシグニ場に出し残りをトラッシュ（各プレイヤー） ----
  if (t.match(/デッキの上から.*見て.*好きな枚数のシグニを場に出し/))
    return { type: 'STUB', id: 'REVEAL_PICK_PLAY' } as StubAction;

  // ---- 対戦相手のターン終了時、シグニを場からデッキ下に置いてもよい ----
  if (t.match(/対戦相手のターン終了時.*このシグニを場からデッキの一番下に置いてもよい/))
    return { type: 'STUB', id: 'LRIG_UNDER_CARD_OP' } as StubAction;

  // ---- このターン終了時、すべてのシグニを裏向きにする ----
  if (t.match(/このターン終了時.*すべてのシグニを裏向きにする/))
    return { type: 'STUB', id: 'LRIG_UNDER_CARD_OP' } as StubAction;

  // ---- デッキ一番上のカードを公開し（デッキ上確認系） ----
  if (t.match(/^このシグニがアップ状態の場合、あなたのデッキの一番上を公開してもよい$/) ||
      t.match(/^あなたのデッキの一番上を公開し、そのカードが宣言した.*場合.*手札に加える$/))
    return { type: 'STUB', id: 'CONDITIONAL_POWER_BONUS' } as StubAction;

  // ---- 対戦相手は手札をすべてルリグゾーンに裏向きで置く ----
  if (t.match(/対戦相手は手札をすべてルリグゾーンに裏向きで置く/))
    return { type: 'STUB', id: 'TARGET_AND_DISCARD_HAND' } as StubAction;

  // ---- 対戦相手はそれらのカードを手札に加える ----
  if (t.match(/^対戦相手はそれらのカードを手札に加える$/))
    return { type: 'STUB', id: 'RULE_REMINDER_TEXT' } as StubAction;

  // ---- 次の対戦相手のアタックフェイズ開始時〜 ----
  if (t.match(/次の対戦相手のアタックフェイズ開始時/))
    return { type: 'STUB', id: 'LRIG_GROW_RESTRICT' } as StubAction;

  // ---- 各プレイヤーは自分のデッキの一番上を公開する ----
  if (t.match(/各プレイヤーは自分のデッキの一番上のカードを公開する/))
    return { type: 'STUB', id: 'LOOK_OPP_LIFE_TOP' } as StubAction;

  // ---- エナゾーンから白/色のシグニをデッキ上に置いてもよい ----
  if (t.match(/エナゾーンから.+のシグニ[１-９\d０-９]*枚をデッキの一番上に置いてもよい/))
    return { type: 'STUB', id: 'LRIG_UNDER_CARD_OP' } as StubAction;

  // ---- その中から色のカードをN枚まで選び手札に加えるかエナゾーンに置き残りをトラッシュ ----
  if (t.match(/その中から(?:白|赤|青|緑|黒)のカードを[１-９\d０-９]+枚まで選び.*手札に加えるかエナゾーンに置き/) ||
      t.match(/その中からすべての(?:白|赤|青|緑|黒)のカードを手札に加え/))
    return makeRevealPickStub(t);

  // ---- その中から色のカードをN枚まで公開し手札に加え残りをデッキ下 ----
  if (t.match(/その中から(?:白|赤|青|緑|黒)のカードを[１-９\d０-９]+枚まで公開し手札に加え.*デッキの一番下に置く/))
    return makeRevealPickStub(t);

  // ---- その中からすべての緑のカードをエナゾーンに置き残りをトラッシュ ----
  if (t.match(/その中からすべての(?:白|赤|青|緑|黒)のカードをエナゾーンに置き/))
    return makeRevealPickStub(t);

  // ---- 対戦相手のシグニを対象とし、パワーをN体/N枚につき変動 ----
  if (t.match(/対戦相手のシグニ[１-９\d０-９]*体?を対象とし.*パワーを.*につき[＋－][０-９\d０-９]+する/) ||
      t.match(/対戦相手のシグニを好きな数対象とし.*それらのパワーを合計で/))
    return { type: 'STUB', id: 'POWER_MOD_PER_COUNT' } as StubAction;

  // ---- このターン〜スペルを使用していた場合 ----
  if (t.match(/このターンにあなたがスペルを使用していた場合/))
    return { type: 'STUB', id: 'CONDITIONAL_POWER_BONUS' } as StubAction;

  // ---- その中からスペル１枚を公開し手札に加え残りをデッキ下 ----
  if (t.match(/その中からスペル[１-９\d０-９]*枚を公開し手札に加え.*デッキの一番下に置く/))
    return makeRevealPickStub(t);

  // ---- レベルN についても同様である） ----
  if (t.match(/レベル[１-９\d０-９]についても同様(?:である)?[）)）]/))
    return { type: 'STUB', id: 'RULE_REMINDER_TEXT' } as StubAction;

  // ---- その後、パワーをこの方法で場に出たシグニのパワーと同じだけ ----
  if (t.match(/パワーをこの方法で場に出たシグニのパワーと同じだけ/))
    return { type: 'STUB', id: 'POWER_MOD_PER_COUNT' } as StubAction;

  // ---- そのシグニを場に出し、残りをトラッシュに置く ----
  if (t.match(/^そのシグニを場に出し、残りをトラッシュに置く$/))
    return { type: 'STUB', id: 'REVEAL_PICK_PLAY' } as StubAction;

  // ---- エナゾーンのカードをすべてトラッシュに置いてもよい ----
  if (t.match(/エナゾーンにあるすべてのカードをトラッシュに置いてもよい/))
    return { type: 'STUB', id: 'OPTIONAL_COST' } as StubAction;

  // ---- あなたはそのカードを捨てさせてもよい / 対戦相手は〜捨てさせる ----
  if (t.match(/^あなたはそのカードを捨てさせてもよい$/))
    return { type: 'STUB', id: 'TARGET_AND_DISCARD_HAND' } as StubAction;

  // ---- ライフクロスがN枚以下の場合コスト減 ----
  if (t.match(/ライフクロスが[１-９\d０-９]+枚以下の場合.*コストは/))
    return { type: 'STUB', id: 'ARTS_COST_REDUCTION_BY_EFFECT' } as StubAction;

  // ---- 手札がN枚以下の場合コスト減 ----
  if (t.match(/手札が[１-９\d０-９]+枚以下の場合.*コストは/))
    return { type: 'STUB', id: 'ARTS_COST_REDUCTION_BY_EFFECT' } as StubAction;

  // ---- 場にカード名を含むルリグがいる場合、以下のN個から選ぶ ----
  if (t.match(/場にカード名に《.+》を含む.*がいる場合、以下の[１-９\d０-９]+つから/))
    return { type: 'STUB', id: 'CONDITIONAL_POWER_BONUS' } as StubAction;

  // ---- このシグニの下にあるカード全てトラッシュ ----
  if (t.match(/このシグニの下にあるすべてのカードをトラッシュに置く/) ||
      t.match(/このシグニに付いている.*下に置かれているすべてのカードをトラッシュに置く/))
    return { type: 'STUB', id: 'LRIG_UNDER_CARD_OP' } as StubAction;

  // ---- このシグニはそれと同じカードになる ----
  if (t.match(/このシグニはそれと同じカードになる/))
    return { type: 'STUB', id: 'POWER_MOD_PER_COUNT' } as StubAction;

  // ---- 他のすべてのシグニをトラッシュに置く ----
  if (t.match(/^他のすべてのシグニをトラッシュに置く$/))
    return { type: 'STUB', id: 'MASS_TRASH' } as StubAction;

  // ---- このターン、あなたは他のシグニを場に出せない ----
  if (t.match(/このターン、あなたは他のシグニを場に出せない/) ||
      t.match(/このターン、あなたは[１以上０-９\d０-９]+のエナコストを支払えない/))
    return { type: 'STUB', id: 'LRIG_GROW_RESTRICT' } as StubAction;

  // ---- このシグニのパワーを自身の下にあるシグニのパワーの合計と同じだけ ----
  if (t.match(/このシグニのパワーを自身の下にあるすべてのシグニのパワーの合計と同じだけ/))
    return { type: 'STUB', id: 'POWER_MOD_PER_COUNT' } as StubAction;

  // ---- デッキの一番下のカードを公開する ----
  if (t.match(/^あなたのデッキの一番下のカードを公開する$/))
    return { type: 'REVEAL' };

  // ---- そのカードを場に出すかトラッシュに置く ----
  if (t.match(/^そのカードを場に出すかトラッシュに置く$/))
    return { type: 'STUB', id: 'REVEAL_PICK_PLAY' } as StubAction;

  // ---- 対戦相手のライフクロスの一番上を公開する ----
  if (t.match(/^対戦相手のライフクロスの一番上を公開する$/))
    return { type: 'STUB', id: 'LOOK_OPP_LIFE_TOP' } as StubAction;

  // ---- それらのカードを入れ替えてもよい / カードとデッキ上カードを入れ替えてもよい ----
  if (t.match(/とデッキの一番上のカードを入れ替えてもよい/) ||
      t.match(/それらを好きな順番でデッキの一番上に置く/))
    return { type: 'STUB', id: 'LOOK_AND_REORDER' } as StubAction;

  // ---- 手札を好きな枚数捨てる ----
  if (t.match(/^あなたは手札を好きな枚数捨てる$/) ||
      t.match(/^手札からシグニを好きな枚数捨てる$/))
    return { type: 'STUB', id: 'OPTIONAL_COST' } as StubAction;

  // ---- 手札から〈クラス〉/特定カードを捨ててもよい（条件付き） ----
  if (t.match(/対戦相手のエナゾーンにカードが[１-９\d０-９]+枚以上ある場合、手札から/) ||
      t.match(/このターンにあなたが効果によってカードを[１-９\d０-９]+枚以上引いていた場合.*手札を/) ||
      t.match(/あなたの手札が[１-９\d０-９]+枚以上ある場合.*手札から/))
    return { type: 'STUB', id: 'CONDITIONAL_POWER_BONUS' } as StubAction;

  // ---- エナゾーンに置いてもよい（シグニ → エナ転換） ----
  if (t.match(/そのアタック終了時.*エナゾーンから.*シグニ.*場にあるこのシグニをエナゾーンに置いてもよい/))
    return { type: 'STUB', id: 'LRIG_UNDER_CARD_OP' } as StubAction;

  // ---- 対戦相手のデッキ上からN枚トラッシュ（条件付きN） ----
  if (t.match(/対戦相手のデッキの上からこの方法でダウンしたルリグのレベルの合計.*枚のカードをトラッシュ/) ||
      t.match(/対戦相手のデッキの上からカードを宣言した数字に等しい枚数トラッシュに置く/))
    return { type: 'STUB', id: 'POWER_MOD_PER_COUNT' } as StubAction;

  // ---- 〈クラス〉のシグニをN枚場に出しN枚エナゾーンに置く ----
  if (t.match(/その中からシグニを.*場に出し.*エナゾーンに置く/))
    return { type: 'STUB', id: 'REVEAL_PICK_PLAY' } as StubAction;

  // ---- 赤、青、緑、黒についても同様に行う ----
  if (t.match(/赤、青、緑、黒についても同様に行う/))
    return { type: 'STUB', id: 'RULE_REMINDER_TEXT' } as StubAction;

  // ---- 次のターンの間、そのシグニゾーンにシグニを配置できない ----
  if (t.match(/次のターンの間、対戦相手はそのシグニゾーンにシグニを新たに配置できない/))
    return { type: 'STUB', id: 'LRIG_GROW_RESTRICT' } as StubAction;

  // ---- あなたの能力として発動する） ----
  if (t.match(/あなたの能力として発動する[）)）]/))
    return { type: 'STUB', id: 'RULE_REMINDER_TEXT' } as StubAction;

  // ---- これを取り除く（単独文） ----
  if (t.match(/^これを取り除く$/))
    return { type: 'STUB', id: 'REMOVE_VIRUS' } as StubAction;

  // ---- 手札をすべて捨ててもよい（全捨て任意） ----
  if (t.match(/^手札をすべて捨ててもよい$/))
    return { type: 'STUB', id: 'OPTIONAL_COST' } as StubAction;

  // ---- 対戦相手は手札を裏向きでN束に分ける ----
  if (t.match(/対戦相手は手札を裏向きで[１-９\d０-９]+つの束に分ける/) ||
      t.match(/どちらかの束を選び、対戦相手はその束を捨てる/))
    return { type: 'STUB', id: 'TARGET_AND_DISCARD_HAND' } as StubAction;

  // ---- ライフクロスをすべて見て〜場に出すかエナゾーン ----
  if (t.match(/ライフクロスをすべて見て.*場に出すかエナゾーンに置き/))
    return { type: 'STUB', id: 'LOOK_OPP_LIFE_TOP' } as StubAction;

  // ---- カードをルリグゾーンに裏向きで置く ----
  if (t.match(/カードを[１-９\d０-９]*枚?まで?ルリグゾーンに裏向きで置く/))
    return { type: 'STUB', id: 'LRIG_UNDER_CARD_OP' } as StubAction;

  // ---- 場に凍結状態/レゾナがない場合、手札を捨てる ----
  if (t.match(/場に.*がない場合、手札を[１-９\d０-９]*枚捨てる/))
    return { type: 'STUB', id: 'CONDITIONAL_POWER_BONUS' } as StubAction;

  // ---- カードをN枚引き、手札をN枚まで捨てる ----
  if (t.match(/カードを[１-９\d０-９]+枚引き、手札を[１-９\d０-９]+枚まで捨てる/))
    return { type: 'STUB', id: 'CONDITIONAL_POWER_BONUS' } as StubAction;

  // ---- 対戦相手のシグニを対象とし、それを他のシグニゾーンに配置してもよい ----
  if (t.match(/対戦相手のシグニ[１-９\d０-９]*体?を対象とし、それを他のシグニゾーン/))
    return { type: 'STUB', id: 'LRIG_UNDER_CARD_OP' } as StubAction;

  // ---- このシグニと同じシグニゾーンに〜がある場合 ----
  if (t.match(/このシグニと同じシグニゾーンに.*がある場合/))
    return { type: 'STUB', id: 'CONDITIONAL_POWER_BONUS' } as StubAction;

  // ---- それのレベルN につき手札を捨ててもよい ----
  if (t.match(/それのレベル[１-９\d０-９]につき手札を[１-９\d０-９]*枚捨ててもよい/))
    return { type: 'STUB', id: 'OPTIONAL_COST' } as StubAction;

  // ---- 次にN以下のレベルを持つシグニによってダメージを受ける場合、代わりに ----
  if (t.match(/次に.*レベルを持つ対戦相手のシグニによってダメージを受ける場合、代わりにダメージを受けない/))
    return { type: 'STUB', id: 'NEGATE_ATTACK_ON_TRIGGER' } as StubAction;

  // ---- 発動後にデッキに加わった〜） (注釈） ----
  if (t.match(/発動後にデッキに加わった.*[）)）]/))
    return { type: 'STUB', id: 'RULE_REMINDER_TEXT' } as StubAction;

  // ---- このアーツを使用する際〜コストを支払ってもよい ----
  if (t.match(/このアーツを使用する際.*コスト.*支払(?:ってもよい|っていた場合)/))
    return { type: 'STUB', id: 'OPTIONAL_COST' } as StubAction;

  // ---- 『【常】：…を得る（長文引用） ----
  if (t.match(/^『【常】：/))
    return { type: 'STUB', id: 'GRANT_QUOTED_ABILITY' } as StubAction;

  // ---- 手札から《ガードアイコン》を持つシグニを捨てる ----
  if (t.match(/手札から《ガードアイコン》を持つシグニを.+捨てる/))
    return { type: 'STUB', id: 'OPTIONAL_COST' } as StubAction;

  // ---- あなたの場にあるシグニが持つ色がN種類以上ある場合 ----
  if (t.match(/あなたの場にあるシグニが持つ色が合計[１-９\d０-９]+種類以上ある場合/))
    return { type: 'STUB', id: 'CONDITIONAL_POWER_BONUS' } as StubAction;

  // ---- 手札/エナゾーンからカードをN枚エナゾーンに置く ----
  if (t.match(/^手札からカードを[１-９\d０-９]+枚エナゾーンに置く$/) ||
      t.match(/^手札からカードを[１-９\d０-９]+枚まで好きな順番でデッキの一番下に置く$/))
    return { type: 'STUB', id: 'OPTIONAL_COST' } as StubAction;

  // ---- その中から〈クラス〉のカードをN枚まで選びエナゾーンに置き残りをデッキ下 ----
  if (t.match(/その中から[＜〈<].+[＞〉>]のカードを[１-９\d０-９]*枚?まで?エナゾーンに置き/) ||
      t.match(/その中から[＜〈<].+[＞〉>]のカードを[１-９\d０-９]*枚?を?公開し手札に加え/))
    return makeRevealPickStub(t);

  // ---- 手札から〈クラス〉のカードをN枚公開してもよい ----
  if (t.match(/あなたの手札から[＜〈<].+[＞〉>]のカードを[１-９\d０-９]*枚?まで?公開してもよい/))
    return { type: 'STUB', id: 'OPTIONAL_COST' } as StubAction;

  // ---- それらのシグニがカード名と同じ場合、手札に加える ----
  if (t.match(/それらのシグニがそれぞれあなたの場にあるシグニと同じカード名の場合/))
    return { type: 'STUB', id: 'CONDITIONAL_POWER_BONUS' } as StubAction;

  // ---- 残りをデッキに加えてシャッフルする ----
  if (t.match(/^残りをデッキに加えてシャッフルする$/))
    return { type: 'STUB', id: 'LOOK_AND_REORDER' } as StubAction;

  // ---- このターン、このシグニはバトルしない ----
  if (t.match(/このシグニは、正面にアタックしている対戦相手のシグニとバトルしない/))
    return { type: 'STUB', id: 'NEGATE_ATTACK_ON_TRIGGER' } as StubAction;

  // ---- ブースト（追加コスト形式の注釈） ----
  if (t.match(/^ブースト―《[白赤青緑黒無][^（)）]*》[（(（]このアーツを使用する際/))
    return { type: 'STUB', id: 'OPTIONAL_COST' } as StubAction;

  // ---- あなたがブーストしていた場合、ダメージを受けない ----
  if (t.match(/あなたがブーストしていた場合.*ダメージを受けない/))
    return { type: 'STUB', id: 'NEGATE_ATTACK_ON_TRIGGER' } as StubAction;

  // ---- この方法でデッキに移動したカードの枚数＋Nを引く ----
  if (t.match(/この方法でデッキに移動したカードの枚数に[１-９\d０-９]+を加えた枚数のカードを引く/))
    return { type: 'STUB', id: 'POWER_MOD_PER_COUNT' } as StubAction;

  // ---- このターンにあなたがアーツを使用していた場合 ----
  if (t.match(/このターンにあなたがアーツを使用していた場合/))
    return { type: 'STUB', id: 'CONDITIONAL_POWER_BONUS' } as StubAction;

  // ---- 【起】〜シグニを捨てる：能力を得る（コスト形式） ----
  if (t.match(/^【起】《ターン[１-９\d０-９]*回》手札から.+捨てる：/))
    return { type: 'STUB', id: 'OPTIONAL_COST' } as StubAction;

  // ---- このターン、パワーN以上のシグニによってダメージを受けない ----
  if (t.match(/このターン、あなたはパワー[０-９\d０-９]+以上のシグニによってダメージを受けない/))
    return { type: 'STUB', id: 'NEGATE_ATTACK_ON_TRIGGER' } as StubAction;

  // ---- 対戦相手は偶数か奇数かを宣言する ----
  if (t.match(/^対戦相手は偶数か奇数かを宣言する$/))
    return { type: 'STUB', id: 'DECLARE_NUMBER' } as StubAction;

  // ---- このシグニが血晶武装状態の場合 ----
  if (t.match(/このシグニが血晶武装状態の場合/))
    return { type: 'STUB', id: 'CONDITIONAL_POWER_BONUS' } as StubAction;

  // ---- そのカードがNのシグニの場合（レベル条件） ----
  if (t.match(/そのカードがレベル[１-９\d０-９]+のシグニの場合/))
    return { type: 'STUB', id: 'CONDITIONAL_POWER_BONUS' } as StubAction;

  // ---- あなたのシグニ１体に【ソウル】が付いたとき ----
  if (t.match(/【ソウル】が付いたとき/))
    return { type: 'STUB', id: 'GRANT_QUOTED_AUTO_ABILITY' } as StubAction;

  // ---- このゲームの間N回使用したのが〜回目である場合 ----
  if (t.match(/このゲームの間にあなたがこの【起】を使用したのが[１-９\d０-９]+回目である場合/))
    return { type: 'STUB', id: 'GAIN_ABILITY_THIS_GAME' } as StubAction;

  // ---- レベル合計がNの場合〜 ----
  if (t.match(/レベルの合計が[１-９\d０-９]+の場合/))
    return { type: 'STUB', id: 'CONDITIONAL_POWER_BONUS' } as StubAction;

  // ---- それを【シード】として出すかエナゾーンに置く ----
  if (t.match(/シード.*出すか.*エナゾーンに置く/))
    return { type: 'STUB', id: 'REVEAL_PICK_PLAY' } as StubAction;

  // ---- 対戦相手のシグニがこのシグニの正面〜 (AUTO trigger) ----
  if (t.match(/対戦相手のシグニ.*がこのシグニの正面のシグニゾーンに出たとき/))
    return { type: 'STUB', id: 'GRANT_QUOTED_AUTO_ABILITY' } as StubAction;

  // ---- あなたの場にあるシグニの下からそれぞれレベルの異なるシグニをトラッシュ ----
  if (t.match(/このシグニの下からそれぞれレベルの異なるシグニ[１-９\d０-９]+枚をトラッシュに置いてもよい/))
    return { type: 'STUB', id: 'LRIG_UNDER_CARD_OP' } as StubAction;

  // ---- 手札から〈クラス〉のシグニを好きな枚数/N枚捨てる（条件付きコスト） ----
  if (t.match(/対戦相手のシグニ[１-９\d０-９]*体?を対象とし.*手札から[＜〈<].+[＞〉>]のシグニを[１-９\d０-９]+枚公開してもよい/))
    return { type: 'STUB', id: 'OPTIONAL_COST' } as StubAction;

  // ---- あなたの場に共通する色を持つルリグがN体以上いる場合 ----
  if (t.match(/あなたの場に共通する色を持つルリグが[１-９\d０-９]+体以上いる場合/))
    return { type: 'STUB', id: 'CONDITIONAL_POWER_BONUS' } as StubAction;

  // ---- スペルの場合、対戦相手はそのカードを捨てる ----
  if (t.match(/^スペルの場合、対戦相手はそのカードを捨てる$/))
    return { type: 'STUB', id: 'TARGET_AND_DISCARD_HAND' } as StubAction;

  // ---- 対戦相手のセンタールリグが〜を得、〜パワーを下げる ----
  if (t.match(/対象の対戦相手のセンタールリグ[１-９\d０-９]*体?は.*アタックできない.*を得/))
    return { type: 'STUB', id: 'POWER_MOD_PER_COUNT' } as StubAction;

  // ---- コードN枚と〜１枚を公開する（特定カード名公開） ----
  if (t.match(/《[^》]+》[１-９\d０-９]*枚と《[^》]+》[１-９\d０-９]*枚を公開する/))
    return { type: 'STUB', id: 'OPTIONAL_COST' } as StubAction;

  // ---- 好きな生徒との絆を獲得する ----
  if (t.match(/好きな生徒.+との絆を獲得する/))
    return { type: 'STUB', id: 'POWER_MOD_PER_COUNT' } as StubAction;

  // ---- あなたの場に他の〈クラス〉のシグニがある場合、対戦相手のシグニをトラッシュ ----
  if (t.match(/あなたの場に他の[＜〈<].+[＞〉>]のシグニがある場合、対戦相手のレベル.+のシグニ.+対象とし、それをトラッシュに置く/))
    return { type: 'STUB', id: 'CONDITIONAL_POWER_BONUS' } as StubAction;

  // ---- このシグニが対戦相手の能力か効果の対象になったとき、裏向き/表向きにする ----
  if (t.match(/このシグニが対戦相手の.*対象になったとき.*裏向きにし、表向きにする/))
    return { type: 'STUB', id: 'GRANT_QUOTED_AUTO_ABILITY' } as StubAction;

  // ---- 手札から〈クラス〉のカードをN枚まで公開してもよい ----
  if (t.match(/あなたの手札から[＜〈<].+[＞〉>]のカードを[１-９\d０-９]+枚?まで(?:公開|捨て)(?:てもよい)?$/))
    return { type: 'STUB', id: 'OPTIONAL_COST' } as StubAction;

  // ---- 対戦相手のアタックフェイズ開始時、手札から捨ててもよい ----
  if (t.match(/対戦相手のアタックフェイズ開始時、手札から.*捨ててもよい/))
    return { type: 'STUB', id: 'GRANT_QUOTED_AUTO_ABILITY' } as StubAction;

  // ---- エナゾーンからカードをトラッシュに置いてもよい（条件付き） ----
  if (t.match(/あなたのエナゾーンから[＜〈<].+[＞〉>]のカードを[１-９\d０-９]+枚までトラッシュに置いてもよい/))
    return { type: 'STUB', id: 'OPTIONAL_COST' } as StubAction;

  // ---- ターン終了時、〜をトラッシュに置く ----
  if (t.match(/このターン終了時、それを場からトラッシュに置く$/))
    return { type: 'STUB', id: 'RULE_REMINDER_TEXT' } as StubAction;

  // ---- トラッシュからスペルを使用する ----
  if (t.match(/あなたのトラッシュからスペル[１-９\d０-９]*枚?まで?を対象とし、それを使用する/))
    return { type: 'STUB', id: 'PLAY_FREE' } as StubAction;

  // ---- 〈クラス〉のシグニ１体につきパワーを変動 ----
  if (t.match(/のシグニ[１-９\d０-９]*体?につき[＋－][０-９\d０-９]+する/))
    return { type: 'STUB', id: 'POWER_MOD_PER_COUNT' } as StubAction;

  // ---- 手札を公開してもよい ----
  if (t.match(/^あなたの手札を公開してもよい$/))
    return { type: 'STUB', id: 'OPTIONAL_COST' } as StubAction;

  // ---- 対戦相手はルリグデッキからカードを見てあなたが公開 ----
  if (t.match(/対戦相手は.*ルリグデッキからカード[１-９\d０-９]*枚を見ないで選び/))
    return { type: 'STUB', id: 'LOOK_OPP_LIFE_TOP' } as StubAction;

  // ---- 対戦相手はあなたの手札を見ないで選ぶ ----
  if (t.match(/対戦相手はあなたの手札を[１-９\d０-９]*枚見ないで選び/))
    return { type: 'STUB', id: 'LOOK_OPP_LIFE_TOP' } as StubAction;

  // ---- あなたの手札からスペルを公開してもよい ----
  if (t.match(/あなたの手札からスペルを[１-９\d０-９]*枚公開してもよい/))
    return { type: 'STUB', id: 'OPTIONAL_COST' } as StubAction;

  // ---- このターン次にルリグによってダメージを受ける場合受けない ----
  if (t.match(/このターン、次に.*ルリグによってダメージを受ける場合、代わりにダメージを受けない/))
    return { type: 'STUB', id: 'NEGATE_ATTACK_ON_TRIGGER' } as StubAction;

  // ---- このシグニをデッキの一番下に置いてもよい ----
  if (t.match(/^このシグニを場からデッキの一番下に置いてもよい$/))
    return { type: 'STUB', id: 'LRIG_UNDER_CARD_OP' } as StubAction;

  // ---- そうした場合、それの効果を打ち消す ----
  if (t.match(/^そうした場合、それの効果を打ち消す$/))
    return { type: 'STUB', id: 'NEGATE_ATTACK_ON_TRIGGER' } as StubAction;

  // ---- 【起】コインN枚支払いの能力 ----
  if (t.match(/^【起】《ターン[１-９\d０-９]*回》手札から.*：【ルリグバリア】/))
    return { type: 'STUB', id: 'OPTIONAL_COST' } as StubAction;

  // ---- ゲームN回のコイン技 ----
  if (t.match(/《ゲーム[１-９\d０-９]+回》を《ゲーム[１-９\d０-９]+回》にし/))
    return { type: 'STUB', id: 'GAIN_ABILITY_THIS_GAME' } as StubAction;

  // ---- 対戦相手の凍結シグニにつき手札を捨てる ----
  if (t.match(/対戦相手は.*凍結状態のシグニ[１-９\d０-９]*体?につき手札を[１-９\d０-９]*枚捨てる/))
    return { type: 'STUB', id: 'TARGET_AND_DISCARD_HAND' } as StubAction;

  // ---- あなたのターンの間、バトルしたとき〜 ----
  if (t.match(/あなたのターンの間、このシグニがバトルしたとき/))
    return { type: 'STUB', id: 'GRANT_QUOTED_AUTO_ABILITY' } as StubAction;

  // ---- このアーツによってルリグが得た能力 ----
  if (t.match(/このアーツによってあなたのルリグが得た能力は/))
    return { type: 'STUB', id: 'GRANT_LRIG_ABILITY' } as StubAction;

  // ---- 対戦相手のレベルN以下のシグニを対象とし手札から〜捨ててもよい ----
  if (t.match(/対戦相手のレベル[０-９\d０-９]+以[下上]のシグニ[１-９\d０-９]*体?を対象とし、手札から.*捨ててもよい/))
    return { type: 'STUB', id: 'TARGET_AND_DISCARD_HAND' } as StubAction;

  // ---- 公開されたカードをシャッフルしてデッキ下に置く ----
  if (t.match(/^公開されたカードをシャッフルしてデッキの一番下に置く$/))
    return { type: 'STUB', id: 'LOOK_AND_REORDER' } as StubAction;

  // ---- 対戦相手のシグニを好きな数対象とし、パワーを合計でN減らす ----
  if (t.match(/対戦相手のシグニを好きな数対象とし.*それらのパワーを合計で[＋－][０-９\d０-９]+する/))
    return { type: 'STUB', id: 'POWER_MOD_PER_COUNT' } as StubAction;

  // ---- あなたのデッキの一番下のカードをトラッシュに置く ----
  if (t.match(/^あなたのデッキの一番下のカードをトラッシュに置く$/))
    return { type: 'STUB', id: 'CONDITIONAL_POWER_BONUS' } as StubAction;

  // ---- この方法でカードをN枚以上トラッシュに置いた場合 ----
  if (t.match(/この方法でカードを[１-９\d０-９]+枚以上トラッシュに置いた場合/))
    return { type: 'STUB', id: 'CONDITIONAL_POWER_BONUS' } as StubAction;

  // ---- N枚以上トラッシュに置いた場合、追加で〜 ----
  if (t.match(/[１-９\d０-９]+枚以上トラッシュに置いた場合、追加で/))
    return { type: 'STUB', id: 'CONDITIONAL_POWER_BONUS' } as StubAction;

  // ---- その後、手札を１枚捨てる（単独文） ----
  if (t.match(/^その後、手札を[１-９\d０-９]+枚捨てる$/))
    return { type: 'TRASH', target: { type: 'HAND_CARD', owner: 'self', count: 1 } };

  // ---- このシグニの下にあるカードをトラッシュに置く ----
  if (t.match(/このシグニの下にある.*カード[１-９\d０-９]*枚をトラッシュに置いてもよい/))
    return { type: 'STUB', id: 'LRIG_UNDER_CARD_OP' } as StubAction;

  // ---- あなたのグロウフェイズ開始時〜 ----
  if (t.match(/^あなたのグロウフェイズ開始時/))
    return { type: 'STUB', id: 'GAIN_ABILITY_THIS_GAME' } as StubAction;

  // ---- 手札からスペルを好きな枚数捨てる ----
  if (t.match(/手札からスペルを好きな枚数捨てる/))
    return { type: 'STUB', id: 'OPTIONAL_COST' } as StubAction;

  // ---- この方法であなたのセンタールリグのレベル以下のシグニがトラッシュに置かれた場合 ----
  if (t.match(/この方法であなたのセンタールリグのレベル以下のシグニがトラッシュに置かれた場合/))
    return { type: 'STUB', id: 'CONDITIONAL_POWER_BONUS' } as StubAction;

  // ---- 対戦相手のシグニ１体が場に出たとき（自動能力） ----
  if (t.match(/対戦相手のシグニ[１-９\d０-９]*体?が場に出たとき/))
    return { type: 'STUB', id: 'GRANT_QUOTED_AUTO_ABILITY' } as StubAction;

  // ---- そのシグニをトラッシュに置く（単独文） ----
  if (t.match(/^そのシグニをトラッシュに置く$/))
    return { type: 'STUB', id: 'RULE_REMINDER_TEXT' } as StubAction;

  // ---- グロウする際、手札からシグニを公開してもよい ----
  if (t.match(/このカードにグロウする際、手札から.*シグニ.*を?公開してもよい/))
    return { type: 'STUB', id: 'OPTIONAL_COST' } as StubAction;

  // ---- あなたの他のすべてのシグニをトラッシュに置く ----
  if (t.match(/^あなたの他のすべてのシグニをトラッシュに置く$/))
    return { type: 'STUB', id: 'MASS_TRASH' } as StubAction;

  // ---- この方法で手札を1枚捨てなかった場合、このシグニをトラッシュ ----
  if (t.match(/この方法で手札を[１-９\d０-９]+枚捨てなかった場合、このシグニを場からトラッシュに置く/))
    return { type: 'STUB', id: 'RULE_REMINDER_TEXT' } as StubAction;

  // ---- このターン、次にスペルを使用するコストが変わる ----
  if (t.match(/このターン、あなたが次にスペルを使用する場合.*使用コストは/))
    return { type: 'STUB', id: 'ARTS_COST_REDUCTION_BY_EFFECT' } as StubAction;

  // ---- 各アタックフェイズ開始時、裏向きのシグニゾーンに〜場合 ----
  if (t.match(/各アタックフェイズ開始時、裏向きの.*場合/))
    return { type: 'STUB', id: 'GRANT_QUOTED_AUTO_ABILITY' } as StubAction;

  // ---- それを表向きにする（単独文） ----
  if (t.match(/^それを表向きにする$/))
    return { type: 'STUB', id: 'RULE_REMINDER_TEXT' } as StubAction;

  // ---- 対戦相手はあなたのライフクロスをN枚公開させる ----
  if (t.match(/対戦相手はあなたのルリグデッキからカード[１-９\d０-９]*枚を見ないで選び/))
    return { type: 'STUB', id: 'LOOK_OPP_LIFE_TOP' } as StubAction;

  // ---- このターン、〜ライフバーストは発動しない ----
  if (t.match(/このターン、すべての領域にある.*シグニのトリガー能力は発動しない/))
    return { type: 'STUB', id: 'SUPPRESS_LIFE_BURST_ON_CRASH' } as StubAction;

  // ---- 追加で《色》を支払っていた場合 ----
  if (t.match(/追加で《[白赤青緑黒無][^》]*》を支払っていた場合/))
    return { type: 'STUB', id: 'CONDITIONAL_POWER_BONUS' } as StubAction;

  // ---- この方法でグロウしたルリグの【出】能力は発動しない ----
  if (t.match(/この方法でグロウしたルリグの【出】能力は発動しない/))
    return { type: 'STUB', id: 'RULE_REMINDER_TEXT' } as StubAction;

  // ---- 対戦相手のルリグのレベルを－１する ----
  if (t.match(/対戦相手のルリグ[１-９\d０-９]*体?を対象とし.*それのレベルを[＋－][０-９\d０-９]+する/))
    return { type: 'STUB', id: 'POWER_MOD_PER_COUNT' } as StubAction;

  // ---- それらをエナゾーンからトラッシュに置く ----
  if (t.match(/^それらをあなたのエナゾーンからトラッシュに置く$/))
    return { type: 'STUB', id: 'OPTIONAL_COST' } as StubAction;

  // ---- 〈レイラ〉コイン技ゲーム効果 ----
  if (t.match(/あなたの[＜〈<].+[＞〉>]が持つコイン技の《ゲーム[１-９\d０-９]+回》を/))
    return { type: 'STUB', id: 'GAIN_ABILITY_THIS_GAME' } as StubAction;

  // ---- 対戦相手のトラッシュからカードをデッキ上に ----
  if (t.match(/対戦相手のトラッシュからカードを[１-９\d０-９]+枚まで対象とし.*デッキの一番上に置く/))
    return { type: 'STUB', id: 'LOOK_OPP_LIFE_TOP' } as StubAction;

  // ---- 選ばれた各プレイヤーは手札をすべてデッキに加えてシャッフルし引く ----
  if (t.match(/選ばれた各プレイヤーは手札をすべてデッキに加えてシャッフルし/))
    return { type: 'STUB', id: 'MASS_TRASH' } as StubAction;

  // ---- この効果によって各プレイヤーは最大N枚までしか引けない ----
  if (t.match(/この効果によって各プレイヤーは最大[１-９\d０-９]+枚までしかカードを引くことができない/))
    return { type: 'STUB', id: 'RULE_REMINDER_TEXT' } as StubAction;

  // ---- いずれかのプレイヤーがリフレッシュしていた場合 ----
  if (t.match(/いずれかのプレイヤーがリフレッシュしていた場合/))
    return { type: 'STUB', id: 'CONDITIONAL_POWER_BONUS' } as StubAction;

  // ---- 各ターン終了時、エナゾーンから対象とし自分をトラッシュ ----
  if (t.match(/各ターン終了時、対戦相手のエナゾーンからカード[１-９\d０-９]*枚を対象とし/))
    return { type: 'STUB', id: 'GRANT_QUOTED_AUTO_ABILITY' } as StubAction;

  // ---- 対戦相手の手札を見て無色ではないカードを選ぶ ----
  if (t.match(/対戦相手の手札を見て無色ではないカードを[１-９\d０-９]*枚?まで?選ぶ/))
    return { type: 'STUB', id: 'LOOK_OPP_LIFE_TOP' } as StubAction;

  // ---- 公開したカードを手札に加える（単独文） ----
  if (t.match(/^公開したカードを手札に加える$/))
    return { type: 'ADD_TO_HAND', owner: 'self' };

  // ---- あなたのトラッシュから〈クラス〉のシグニをトラッシュ置き換えでシグニゾーンに ----
  if (t.match(/あなたのトラッシュから[＜〈<].+[＞〉>]のシグニ[１-９\d０-９]*枚を対象とし.*シグニ.*場からトラッシュに置いてもよい/))
    return { type: 'STUB', id: 'TRADE_BANISH_SELF_SIGNI' } as StubAction;

  // ---- エナゾーンのシグニをデッキ一番下に置いてもよい ----
  if (t.match(/あなたの[＜〈<].+[＞〉>]のシグニ[１-９\d０-９]*体?を場からデッキの一番下に置いてもよい/))
    return { type: 'STUB', id: 'LRIG_UNDER_CARD_OP' } as StubAction;

  // ---- 各プレイヤーは手札をすべてエナゾーンに置く ----
  if (t.match(/^各プレイヤーは手札をすべてエナゾーンに置く$/))
    return { type: 'STUB', id: 'MASS_TRASH' } as StubAction;

  // ---- この方法でカードを何枚かトラッシュ後、ライフを加える ----
  if (t.match(/この方法でカードを[１-９\d０-９]+枚以上捨てた場合.*ライフクロス/))
    return { type: 'STUB', id: 'CONDITIONAL_POWER_BONUS' } as StubAction;

  // ---- アタックフェイズ終了時〜（条件付き） ----
  if (t.match(/あなたのアタックフェイズ終了時.*場を離れていた場合.*デッキの一番下に置いてもよい/))
    return { type: 'STUB', id: 'LRIG_UNDER_CARD_OP' } as StubAction;

  // ---- 場に出さない場合、エナゾーンに置く ----
  if (t.match(/^《無》《無》を支払わなかった場合、それを手札に加える$/))
    return { type: 'STUB', id: 'CONDITIONAL_POWER_BONUS' } as StubAction;

  // ---- そのカードとエナゾーンにあるこのシグニを入れ替えてもよい ----
  if (t.match(/そのカードとエナゾーンにあるこのシグニを入れ替えてもよい/))
    return { type: 'STUB', id: 'SWAP_OPTIONAL' } as StubAction;

  // ---- あなたの効果によって対戦相手が手札を捨てたとき ----
  if (t.match(/あなたの効果によって対戦相手が手札を[１-９\d０-９]*枚捨てたとき/))
    return { type: 'STUB', id: 'GRANT_QUOTED_AUTO_ABILITY' } as StubAction;

  // ---- チェックゾーンから《ガードアイコン》を持たないカードを手札に ----
  if (t.match(/チェックゾーンから《ガードアイコン》を持たないカードを[１-９\d０-９]*枚まで対象とし.*手札に加える/))
    return { type: 'STUB', id: 'LOOK_OPP_LIFE_TOP' } as StubAction;

  // ---- 対戦相手は自分の場からシグニとエナゾーンからカードを対象とする ----
  if (t.match(/対戦相手は自分の場からシグニ[１-９\d０-９]*体と自分のエナゾーンからカード[１-９\d０-９]*枚を対象とする/))
    return { type: 'STUB', id: 'LOOK_OPP_LIFE_TOP' } as StubAction;

  // ---- このシグニを【アクセ】にしてもよい ----
  if (t.match(/このシグニをそれの【アクセ】にしてもよい/))
    return { type: 'STUB', id: 'LRIG_UNDER_CARD_OP' } as StubAction;

  // ---- 手札から〈クラス〉のシグニをN枚捨ててよい ----
  if (t.match(/その後、手札から[＜〈<].+[＞〉>]のシグニを[１-９\d０-９]+枚捨ててよい/))
    return { type: 'STUB', id: 'OPTIONAL_COST' } as StubAction;

  // ---- 残りをライフクロスの上に戻す ----
  if (t.match(/残りを好きな順番でライフクロスの一番上に戻す/))
    return { type: 'STUB', id: 'LOOK_AND_REORDER' } as StubAction;

  // ---- 引いた枚数と同じ枚数をデッキの下に置く ----
  if (t.match(/この方法で引いたカードの枚数と同じ枚数のカードを手札から.*デッキの一番下に置く/))
    return { type: 'STUB', id: 'LOOK_AND_REORDER' } as StubAction;

  // ---- 引いた枚数と同じ枚数を捨てる ----
  if (t.match(/この方法で引いた枚数と同じ枚数のカードを捨てる/))
    return { type: 'STUB', id: 'TRASH' } as StubAction;

  // ---- 手札から〈クラス〉シグニをN枚公開してもよい ----
  if (t.match(/手札から.*[＜〈<].+[＞〉>].*のシグニを[１-９\d０-９]+枚公開してもよい/))
    return { type: 'STUB', id: 'REVEAL_AND_PICK' } as StubAction;

  // ---- トラッシュのスペルをコスト支払って/コストを支払わずに使用する ----
  if (t.match(/トラッシュにあるスペル.*使用する/) || t.match(/トラッシュからスペルを.*使用する/))
    return { type: 'STUB', id: 'PLAY_FREE' } as StubAction;

  // ---- 正面のシグニをトラッシュに置いてもよい ----
  if (t.match(/正面のシグニ.*トラッシュに置いてもよい/))
    return { type: 'STUB', id: 'BANISH' } as StubAction;

  // ---- N枚以上移動していた場合、代わりにN以上選ぶ ----
  if (t.match(/代わりに[１-９\d０-９２三四五六七八九]+つまで選ぶ/))
    return { type: 'STUB', id: 'RULE_REMINDER_TEXT' } as StubAction;

  // ---- ～枚以上/ある場合、以下のN以上から選ぶ ----
  if (t.match(/以上.*場合、以下の.*から.*選ぶ/) || t.match(/以上ある場合、以下.*選ぶ/))
    return { type: 'STUB', id: 'USE_CONDITION_TEXT' } as StubAction;

  // ---- デッキを上から条件が満たされるまで公開してもよい ----
  if (t.match(/デッキを上から.*が[２-９\d]枚めくれるまで公開してもよい/))
    return { type: 'STUB', id: 'REVEAL_AND_PICK' } as StubAction;
  if (t.match(/デッキを上から.*のレベルの合計が.*以上になるまで公開する/))
    return { type: 'STUB', id: 'REVEAL_AND_PICK' } as StubAction;
  if (t.match(/デッキを上から.*のシグニが[１-９\d０-９]+枚めくれるまで公開/))
    return { type: 'STUB', id: 'REVEAL_AND_PICK' } as StubAction;

  // ---- それの基本レベルを宣言した数字にする ----
  if (t.match(/それの基本レベルを宣言した数字にする/))
    return { type: 'STUB', id: 'DECLARE_CARD_NAME' } as StubAction;

  // ---- このターン、デッキにある〈X〉のシグニのレベルはNになる ----
  if (t.match(/このターン.*デッキにある.*のシグニのレベルは[０-９\d]+になる/))
    return { type: 'STUB', id: 'GAIN_ABILITY_THIS_GAME' } as StubAction;

  // ---- その中から１枚をそれの下に置く ----
  if (t.match(/その中から[１-９\d０-９]*枚をそれの下に置く/))
    return { type: 'STUB', id: 'LRIG_UNDER_CARD_OP' } as StubAction;

  // ---- ルリグトラッシュからアーツをコストを支払わずに使用する ----
  if (t.match(/ルリグトラッシュから.*アーツ.*コストを支払わずに.*使用する/))
    return { type: 'STUB', id: 'PLAY_FREE' } as StubAction;

  // ---- 赤の場合、対戦相手のライフクロスをエナゾーンに置く ----
  if (t.match(/.*の場合、対戦相手のライフクロス.*エナゾーンに置く/))
    return { type: 'STUB', id: 'CONDITIONAL_POWER_BONUS' } as StubAction;

  // ---- エナゾーンにレベルXシグニがそれぞれN枚以上ある場合、シグニをエナゾーンに置く ----
  if (t.match(/エナゾーンに.*のシグニがそれぞれ.*以上ある場合.*シグニ.*エナゾーンに置く/))
    return { type: 'STUB', id: 'ENERGY_LEVEL_CONDITION_CHOOSE' } as StubAction;

  // ---- 対戦相手のシグニのパワーが効果によって+される場合、代わりに-される ----
  if (t.match(/対戦相手のシグニのパワーが効果によって.*される場合、代わりに.*される/))
    return { type: 'STUB', id: 'REPLACE_PLUS_N' } as StubAction;

  // ---- それのパワーをこの方法でXのパワーと同じだけ±する ----
  if (t.match(/それのパワーをこの方法で.*のパワーと同じだけ/))
    return { type: 'STUB', id: 'POWER_MOD_PER_COUNT' } as StubAction;

  // ---- 対戦相手は手札を〜チェックゾーンに置く ----
  if (t.match(/対戦相手は手札を.*チェックゾーンに置く/))
    return { type: 'STUB', id: 'LRIG_UNDER_CARD_OP' } as StubAction;

  // ---- それのレベルをこの方法で公開されたシグニのレベルと同じだけ-する ----
  if (t.match(/それのレベルをこの方法で.*のレベルと同じだけ/))
    return { type: 'STUB', id: 'POWER_MOD_PER_COUNT' } as StubAction;

  // ---- この方法で〈X〉のシグニがN種類公開された場合 ----
  if (t.match(/この方法で.*のシグニが[１-９\d０-９]+種類公開された場合/))
    return { type: 'STUB', id: 'CONDITIONAL_POWER_BONUS' } as StubAction;

  // ---- この効果をセンタールリグのレベルと同じ回数行う ----
  if (t.match(/この効果を.*センタールリグのレベルと同じ回数行う/))
    return { type: 'STUB', id: 'POWER_MOD_PER_COUNT' } as StubAction;

  // ---- この方法でデッキにカードをN枚以上加えた場合 ----
  if (t.match(/この方法でデッキにカードを[１-９\d０-９]+枚以上加えた場合/))
    return { type: 'STUB', id: 'CONDITIONAL_POWER_BONUS' } as StubAction;

  // ---- このカードにグロウする際、手札からシグニをN枚まで公開する ----
  if (t.match(/このカードにグロウする際、手札から.*公開する/))
    return { type: 'STUB', id: 'GRANT_QUOTED_AUTO_ABILITY' } as StubAction;

  // ---- 使用コストはセンタールリグのレベルにつきN減る ----
  if (t.match(/使用コストは.*センタールリグのレベル.*減る/))
    return { type: 'STUB', id: 'ARTS_COST_REDUCTION_BY_EFFECT' } as StubAction;

  // ---- ベットしていなかった場合、次のターンをスキップする ----
  if (t.match(/ベットしていなかった場合.*ターンをスキップする/))
    return { type: 'STUB', id: 'LRIG_GROW_RESTRICT' } as StubAction;

  // ---- 対象のシグニは選んだ能力を得る ----
  if (t.match(/対象のシグニ.*選んだ能力を得る/))
    return { type: 'STUB', id: 'GRANT_QUOTED_AUTO_ABILITY' } as StubAction;

  // ---- あなたがベットしていた場合（繰り返す・代わりに等） ----
  if (t.match(/あなたがベットしていた場合/))
    return { type: 'STUB', id: 'BET_CONDITION' } as StubAction;

  // ---- シグニがトラッシュから場に出たとき、払い、トラッシュに置いてもよい ----
  if (t.match(/のシグニ.*がトラッシュから場に出たとき.*払い.*トラッシュに置いてもよい/))
    return { type: 'STUB', id: 'GRANT_QUOTED_AUTO_ABILITY' } as StubAction;

  // ---- このターン、あなたは《X》を使用できない ----
  {
    const m = t.match(/このターン、あなたは《(.+)》を使用できない/);
    if (m) return { type: 'BLOCK_CARD_USE', cardName: m[1] } as import('../types/effects').BlockCardUseAction;
  }

  // ---- その後、それをクラッシュしてもよい ----
  if (t.match(/それをクラッシュしてもよい/))
    return { type: 'STUB', id: 'LRIG_UNDER_CARD_OP' } as StubAction;

  // ---- デッキからカードN枚を探す ----
  if (t.match(/あなたのデッキからカード[１-９\d０-９]*枚を探す/))
    return { type: 'STUB', id: 'REVEAL_AND_PICK' } as StubAction;

  // ---- 好きな枚数の無色ではないシグニを場に出し、残りをトラッシュに置く ----
  if (t.match(/好きな枚数の無色ではないシグニを場に出し/))
    return { type: 'STUB', id: 'REVEAL_PICK_PLAY' } as StubAction;

  // ---- それぞれレベルの異なるシグニをN枚まで捨てる ----
  if (t.match(/それぞれレベルの異なるシグニを[１-９\d０-９]+枚まで捨てる/))
    return { type: 'STUB', id: 'TRASH' } as StubAction;

  // ---- 代わりにN枚まで対象とし、それらを手札に加える ----
  if (t.match(/代わりに[１-９\d０-９]+枚まで対象とし、それらを手札に加える/))
    return { type: 'STUB', id: 'CONDITIONAL_POWER_BONUS' } as StubAction;

  // ---- このシグニが中央のシグニゾーンにある場合 ----
  if (t.match(/このシグニが中央のシグニゾーンにある場合/))
    return { type: 'STUB', id: 'CENTER_ZONE_CONDITION' } as StubAction;

  // ---- このターンにアタックしたシグニを対象とし、キーをルリグトラッシュに置いてもよい ----
  if (t.match(/このターンにアタックしたシグニを.*対象とし.*ルリグトラッシュに置いてもよい/))
    return { type: 'STUB', id: 'LRIG_GROW_RESTRICT' } as StubAction;

  // ---- トラッシュにある〈X〉のシグニN枚につき±Nする ----
  if (t.match(/トラッシュにある.*のシグニ[１-９\d０-９]+枚につき/))
    return { type: 'STUB', id: 'POWER_MOD_PER_COUNT' } as StubAction;

  // ---- シグニゾーンにシグニがある場合、手札に戻してから開花する ----
  if (t.match(/シグニゾーンにシグニがある場合.*手札に戻してから開花する/))
    return { type: 'STUB', id: 'LRIG_GROW_RESTRICT' } as StubAction;

  // ---- それぞれレベルの異なるシグニN枚が公開された場合、追加で ----
  if (t.match(/それぞれレベルの異なるシグニ[１-９\d０-９]+枚が公開された場合/))
    return { type: 'STUB', id: 'CONDITIONAL_POWER_BONUS' } as StubAction;

  // ---- 手札がN枚より多い場合、その差の分だけ手札からカードをエナゾーンに置く ----
  if (t.match(/手札が[１-９\d０-９]+枚より多い場合、その差.*エナゾーンに置く/))
    return { type: 'STUB', id: 'CONDITIONAL_POWER_BONUS' } as StubAction;

  // ---- 対戦相手のトラッシュから〜デッキの一番下に置く ----
  if (t.match(/対戦相手のトラッシュから.*デッキの一番下に置く/))
    return { type: 'STUB', id: 'LRIG_UNDER_CARD_OP' } as StubAction;

  // ---- 対象のシグニを他のシグニゾーンに配置してもよい ----
  if (t.match(/対象のシグニ.*他のシグニゾーンに配置してもよい/))
    return { type: 'STUB', id: 'LRIG_UNDER_CARD_OP' } as StubAction;

  // ---- 指定されたシグニゾーンにあるシグニのパワーをそのシグニのレベルにつきNする ----
  if (t.match(/指定されたシグニゾーンにあるシグニのパワーを.*レベル.*につき/))
    return { type: 'STUB', id: 'POWER_MOD_PER_COUNT' } as StubAction;

  // ---- チャームをトラッシュに置いてもよい（コスト支払い） ----
  if (t.match(/【チャーム】.*枚をトラッシュに置いてもよい/))
    return { type: 'STUB', id: 'OPTIONAL_COST' } as StubAction;

  // ---- 残りを好きな順番でデッキの一番上に置く ----
  if (t.match(/^残りを好きな順番でデッキの一番上に置く$/))
    return { type: 'STUB', id: 'LOOK_AND_REORDER' } as StubAction;

  // ---- それらのパワーを合わせて－Nする ----
  if (t.match(/それらのパワーを合わせて[－-][０-９\d]+する/))
    return { type: 'STUB', id: 'POWER_MOD_PER_COUNT' } as StubAction;

  // ---- センタールリグと共通する色を持つすべてのカードをエナゾーンに置き ----
  if (t.match(/センタールリグと共通する色を持つすべてのカードをエナゾーンに置き/))
    return { type: 'STUB', id: 'REVEAL_AND_PICK' } as StubAction;

  // ---- レベルNのシグニの場合、手札をN枚捨てる ----
  if (t.match(/レベル[０-９\d]+のシグニの場合、あなたは手札を[１-９\d０-９]+枚捨てる/))
    return { type: 'STUB', id: 'LEVEL_BASED_CONDITIONAL' } as StubAction;

  // ---- それがスペルの場合、コストを支払わずに使用してもよい ----
  if (t.match(/それがスペルの場合.*コストを支払わずに使用してもよい/))
    return { type: 'STUB', id: 'PLAY_FREE' } as StubAction;

  // ---- この方法でカードがN枚トラッシュに置かれた場合 ----
  if (t.match(/この方法でカードが[１-９\d０-９]+枚トラッシュに置かれた場合/))
    return { type: 'STUB', id: 'CONDITIONAL_POWER_BONUS' } as StubAction;

  // ---- あなたと対戦相手のデッキの一番下のカードをトラッシュに置く ----
  if (t.match(/あなたと対戦相手のデッキの一番下のカードをトラッシュに置く/))
    return { type: 'STUB', id: 'LRIG_UNDER_CARD_OP' } as StubAction;

  // ---- このアーツの使用コストは選んだ数だけ増える ----
  if (t.match(/このアーツの使用コストは選んだ数だけ.*増える/))
    return { type: 'STUB', id: 'ARTS_COST_REDUCTION_BY_EFFECT' } as StubAction;

  // ---- 対戦相手は手札を公開する ----
  if (t.match(/^対戦相手は手札を公開する$/))
    return { type: 'STUB', id: 'PEEP_HAND' } as StubAction;

  // ---- それを対戦相手のデッキの一番下に置いてもよい ----
  if (t.match(/それを対戦相手のデッキの一番下に置いてもよい/))
    return { type: 'STUB', id: 'LRIG_UNDER_CARD_OP' } as StubAction;

  // ---- シグニを〜体まで対象とし、それらを裏向きにしてもよい ----
  if (t.match(/シグニを[１-９\d０-９]+体まで対象とし.*裏向きにしてもよい/))
    return { type: 'STUB', id: 'LRIG_UNDER_CARD_OP' } as StubAction;

  // ---- この方法でシグニを手札に加えた場合、手札をN枚捨てる ----
  if (t.match(/この方法でシグニを手札に加えた場合、手札を[１-９\d０-９]+枚捨てる/))
    return { type: 'STUB', id: 'CONDITIONAL_POWER_BONUS' } as StubAction;

  // ---- デッキの上からカードをN枚を見る（重複「を」) ----
  if (t.match(/デッキの上からカードを[１-９\d０-９]+枚を見る/))
    return { type: 'STUB', id: 'LOOK_AND_REORDER' } as StubAction;

  // ---- スペルを使用する場合、コストに含まれるエナコストを代わりに《無》として支払ってもよい ----
  if (t.match(/スペルを使用する場合.*代わりに《無》として支払ってもよい/))
    return { type: 'STUB', id: 'ARTS_COST_REDUCTION_BY_EFFECT' } as StubAction;

  // ---- そのカードと対戦相手のデッキの一番上のカードを入れ替えてもよい ----
  if (t.match(/そのカードと.*デッキの一番上のカードを入れ替えてもよい/))
    return { type: 'STUB', id: 'LRIG_UNDER_CARD_OP' } as StubAction;

  // ---- デッキの上からカードをN枚トラッシュに置きカードをN枚見る ----
  if (t.match(/デッキの上から、?カードを[１-９\d０-９]+枚トラッシュに置きカードを[１-９\d０-９]+枚見る/))
    return { type: 'STUB', id: 'LOOK_AND_REORDER' } as StubAction;

  // ---- 見たカードの中から《X》を〜ダウン状態で場に出し、残りをデッキの一番下に置く ----
  if (t.match(/見たカードの中から.*場に出し.*残りを.*デッキの一番下に置く/))
    return { type: 'STUB', id: 'REVEAL_PICK_PLAY' } as StubAction;

  // ---- 《ガードアイコン》を持たないカード〜デッキの一番下に置いてもよい ----
  if (t.match(/《ガードアイコン》を持たないカード.*デッキの一番下に置いてもよい/))
    return { type: 'STUB', id: 'LOOK_AND_REORDER' } as StubAction;

  // ---- 手札〜ルリグゾーンに裏向きで置く ----
  if (t.match(/手札.*ルリグゾーンに裏向きで置く/))
    return { type: 'STUB', id: 'LRIG_UNDER_CARD_OP' } as StubAction;

  // ---- 次の対戦相手のターン終了時、そのカードを手札に加える ----
  if (t.match(/次の対戦相手のターン終了時、そのカードを手札に加える/))
    return { type: 'STUB', id: 'LOOK_AND_REORDER' } as StubAction;

  // ---- メインフェイズの間、デッキからシグニがトラッシュに置かれたとき、場に出す ----
  if (t.match(/メインフェイズの間.*デッキから.*シグニ.*がトラッシュに置かれたとき.*場に出す/))
    return { type: 'STUB', id: 'GRANT_QUOTED_AUTO_ABILITY' } as StubAction;

  // ---- デッキをシャッフルし一番上のカードを公開し手札に加える ----
  if (t.match(/デッキをシャッフルし.*一番上のカードを公開し手札に加える/))
    return { type: 'STUB', id: 'DRAW' } as StubAction;

  // ---- 対戦相手のシグニ〜体を対象とし、以下からN以上選ぶ ----
  if (t.match(/対戦相手のシグニ.*体を対象とし、以下から[１-９\d０-９]*つを選ぶ/))
    return { type: 'STUB', id: 'TARGET_OPP_SIGNI_FROM_CONTEXT_CHOOSE' } as StubAction;

  // ---- 〈X〉のシグニをN枚捨てるか手札をN枚捨てる ----
  if (t.match(/のシグニを[１-９\d０-９]+枚捨てるか手札を[１-９\d０-９]+枚捨てる/))
    return { type: 'STUB', id: 'OPTIONAL_COST' } as StubAction;

  // ---- このカードが捨てられたとき、手札を〜してもよい ----
  if (t.match(/このカードが捨てられたとき/))
    return { type: 'STUB', id: 'GRANT_QUOTED_AUTO_ABILITY' } as StubAction;

  // ---- アタックフェイズの間、エナコストを支払う際、シグニの下のカードをトラッシュに置いて支払える ----
  if (t.match(/アタックフェイズの間.*エナコストを支払う際.*シグニの下にあるカードを.*トラッシュに置いて支払える/))
    return { type: 'STUB', id: 'GRANT_QUOTED_AUTO_ABILITY' } as StubAction;

  // ---- この方法でエナコストはNターンにN以上しか支払えない ----
  if (t.match(/この方法でエナコストは.*ターンに.*しか支払えない/))
    return { type: 'STUB', id: 'RULE_REMINDER_TEXT' } as StubAction;

  // ---- このシグニの下にあったカードをトラッシュからエナゾーンに置く ----
  if (t.match(/このシグニの下にあったカード.*エナゾーンに置く/))
    return { type: 'STUB', id: 'LRIG_UNDER_CARD_OP' } as StubAction;

  // ---- 《ガードアイコン》を持たないシグニをデッキに加えてもよい ----
  if (t.match(/《ガードアイコン》を持たないシグニを.*枚まで.*デッキに加えてもよい/))
    return { type: 'STUB', id: 'LRIG_UNDER_CARD_OP' } as StubAction;

  // ---- デッキの一番上のカードを公開し宣言したレベルのシグニの場合手札に加える ----
  if (t.match(/デッキの一番上のカードを公開し.*宣言した.*レベルのシグニの場合.*手札に加える/))
    return { type: 'STUB', id: 'REVEAL_AND_PICK' } as StubAction;

  // ---- デッキの上からそれのレベルと同じ枚数のカードをトラッシュに置く ----
  if (t.match(/デッキの上からそれのレベルと同じ枚数のカードをトラッシュに置く/))
    return { type: 'STUB', id: 'POWER_MOD_PER_COUNT' } as StubAction;

  // ---- 正面にシグニがない場合、そのアタックを無効にしてもよい ----
  if (t.match(/正面にシグニがない場合、そのアタックを無効にしてもよい/))
    return { type: 'STUB', id: 'NEGATE_ATTACK_ON_TRIGGER' } as StubAction;

  // ---- スペルを使用したとき、手札を捨ててもよい ----
  if (t.match(/スペルを使用したとき.*手札を.*枚捨ててもよい/))
    return { type: 'STUB', id: 'GRANT_QUOTED_AUTO_ABILITY' } as StubAction;

  // ---- このカードを捨てたとき、手札を捨ててもよい ----
  if (t.match(/このカードを捨てたとき.*手札を.*枚捨ててもよい/))
    return { type: 'STUB', id: 'GRANT_QUOTED_AUTO_ABILITY' } as StubAction;

  // ---- このシグニの下からカードを好きな枚数トラッシュに置く ----
  if (t.match(/このシグニの下からカードを好きな枚数トラッシュに置く/))
    return { type: 'STUB', id: 'LRIG_UNDER_CARD_OP' } as StubAction;

  // ---- そうしなかった場合、次のドローフェイズの間にカードを合計N枚までしか引けない ----
  if (t.match(/そうしなかった場合.*次の.*ドローフェイズの間.*引けない/))
    return { type: 'STUB', id: 'RULE_REMINDER_TEXT' } as StubAction;

  // ---- そのカードをデッキに加えてシャッフルしてもよい ----
  if (t.match(/そのカードをデッキに加えてシャッフルしてもよい/))
    return { type: 'STUB', id: 'LRIG_UNDER_CARD_OP' } as StubAction;

  // ---- 《ディソナアイコン》のカードをN枚捨ててもよい ----
  if (t.match(/《ディソナアイコン》のカードを[１-９\d０-９]*枚捨ててもよい/))
    return { type: 'STUB', id: 'OPTIONAL_COST' } as StubAction;

  // ---- 対戦相手のエナゾーンにカードがN枚以上ある場合、シグニの下から〜トラッシュに置いてもよい ----
  if (t.match(/対戦相手のエナゾーンにカードが[１-９\d０-９]+枚以上ある場合.*シグニの下から.*トラッシュに置いてもよい/))
    return { type: 'STUB', id: 'CONDITIONAL_TRASH_UNDER_SIGNI' } as StubAction;

  // ---- このターン終了時、《コインアイコン》を合計N枚以上支払っていなかった場合 ----
  if (t.match(/このターン終了時.*《コインアイコン》を合計[１-９\d０-９]+枚以上支払っていなかった場合/))
    return { type: 'STUB', id: 'COIN_SPEND_CONDITION' } as StubAction;

  // ---- 対戦相手のレベルN以上のシグニをトラッシュに置く ----
  if (t.match(/対戦相手のレベル[０-９\d]+以上のシグニ.*体を対象とし.*トラッシュに置く/))
    return { type: 'STUB', id: 'BANISH' } as StubAction;

  // ---- そのカードが《X》の場合、この効果を繰り返す ----
  if (t.match(/そのカードが《.+》の場合、この効果を繰り返す/))
    return { type: 'STUB', id: 'CONDITIONAL_POWER_BONUS' } as StubAction;

  // ---- それらのカードを好きな順番でデッキの一番上に戻す ----
  if (t.match(/それらのカードを好きな順番でデッキの一番上に戻す/))
    return { type: 'STUB', id: 'LOOK_AND_REORDER' } as StubAction;

  // ---- 対戦相手の効果によって〜が場を離れる場合、〜行ってもよい ----
  if (t.match(/対戦相手の効果によって.*が場を離れる場合.*行ってもよい/))
    return { type: 'STUB', id: 'GRANT_QUOTED_AUTO_ABILITY' } as StubAction;

  // ---- バトルによってシグニをバニッシュしたとき、〜捨ててもよい ----
  if (t.match(/バトルによってシグニ.*をバニッシュしたとき.*捨ててもよい/))
    return { type: 'STUB', id: 'GRANT_QUOTED_AUTO_ABILITY' } as StubAction;

  // ---- このターンにあなたが手札からXのカードをN枚以上捨てていた場合 ----
  if (t.match(/このターンにあなたが手札から.*カードを[１-９\d０-９]+枚以上捨てていた場合/))
    return { type: 'STUB', id: 'USE_CONDITION_TEXT' } as StubAction;

  // ---- パワーをこの方法でデッキに移動したシグニのパワーと同じだけ±する ----
  if (t.match(/パワーをこの方法でデッキに移動したシグニのパワーと同じだけ/))
    return { type: 'STUB', id: 'POWER_MOD_PER_COUNT' } as StubAction;

  // ---- このアーツを使用する際、ライフクロスをトラッシュに置いてもよい ----
  if (t.match(/このアーツを使用する際.*ライフクロス.*枚をトラッシュに置いてもよい/))
    return { type: 'STUB', id: 'OPTIONAL_COST' } as StubAction;

  // ---- このアーツを使用する際、手札からパワーN以上のシグニをN枚まで捨てる ----
  if (t.match(/このアーツを使用する際.*手札からパワー[０-９\d]+以上のシグニを.*枚まで捨てる/))
    return { type: 'STUB', id: 'OPTIONAL_COST' } as StubAction;

  // ---- デッキの一番上を見て、裏向きでルリグゾーンに置く ----
  if (t.match(/デッキの一番上を見て.*裏向きでルリグゾーンに置く/))
    return { type: 'STUB', id: 'LRIG_UNDER_CARD_OP' } as StubAction;

  // ---- 場に〈X〉のシグニがある場合、カードを引き、対戦相手のデッキの一番上を公開する ----
  if (t.match(/場に.*のシグニがある場合.*カードを.*引き.*対戦相手のデッキの一番上を公開する/))
    return { type: 'STUB', id: 'FIELD_COND_DRAW_REVEAL' } as StubAction;

  // ---- デッキの一番上のカードをトラッシュに置いてもよい ----
  if (t.match(/^あなたのデッキの一番上のカードをトラッシュに置いてもよい$/))
    return { type: 'STUB', id: 'LRIG_UNDER_CARD_OP' } as StubAction;

  // ---- 対戦相手の手札をN枚見ないで選び、公開させる ----
  if (t.match(/対戦相手の手札を[１-９\d０-９]*枚見ないで選び/))
    return { type: 'STUB', id: 'PEEP_HAND' } as StubAction;

  // ---- 場にそのカードと共通する色を持つルリグがいる場合、捨てさせる ----
  if (t.match(/場にそのカードと共通する色を持つルリグがいる場合.*捨てさせる/))
    return { type: 'STUB', id: 'REVEALED_CARD_COLOR_DISCARD' } as StubAction;

  // ---- 手札からカードをN枚まで好きな順番でデッキの一番下に置く ----
  if (t.match(/手札からカードを[１-９\d０-９]+枚まで好きな順番でデッキの一番下に置く/))
    return { type: 'STUB', id: 'LOOK_AND_REORDER' } as StubAction;

  // ---- シグニによってダメージを受ける場合、代わりに手札を捨ててもよい ----
  if (t.match(/シグニによってダメージを受ける場合、代わりに手札を.*捨ててもよい/))
    return { type: 'STUB', id: 'GAIN_ABILITY_THIS_GAME' } as StubAction;

  // ---- 〈X〉のシグニN体を対象とし、以下のN以上から選ぶ ----
  if (t.match(/のシグニ[１-９\d０-９]*体を対象とし、以下の[１-９\d０-９]*つから[１-９\d０-９]*つを選ぶ/))
    return { type: 'STUB', id: 'TARGET_SIGNI_CHOOSE' } as StubAction;

  // ---- 手札からカードをN枚まで裏向きでルリグゾーンに置く ----
  if (t.match(/手札からカードを[１-９\d０-９]*枚まで裏向きでルリグゾーンに置く/))
    return { type: 'STUB', id: 'LRIG_UNDER_CARD_OP' } as StubAction;

  // ---- この方法でダウンしたルリグのレベルの合計に〜カードをトラッシュに置く ----
  if (t.match(/この方法でダウンしたルリグのレベルの合計に.*枚数のカードをトラッシュに置く/))
    return { type: 'STUB', id: 'POWER_MOD_PER_COUNT' } as StubAction;

  // ---- それがレベルN以下の場合、代わりにそれをトラッシュに置く ----
  if (t.match(/それがレベル[０-９\d]+以下の場合、代わりにそれをトラッシュに置く/))
    return { type: 'STUB', id: 'RULE_REMINDER_TEXT' } as StubAction;

  // ---- 対戦相手の【Xトークン名】を好きな数取り除いてもよい ----
  if (t.match(/対戦相手の【.+】を好きな数取り除いてもよい/))
    return { type: 'STUB', id: 'REMOVE_VIRUS' } as StubAction;

  // ---- アタック終了時、このシグニを場から〜に置いてもよい ----
  if (t.match(/そのアタック終了時.*このシグニを場から.*に置いてもよい/))
    return { type: 'STUB', id: 'GRANT_QUOTED_AUTO_ABILITY' } as StubAction;

  // ---- このアーツを使用する際に〈X〉のカードをトラッシュに置いていた場合 ----
  if (t.match(/このアーツを使用する際に.*のカード.*枚をトラッシュに置いていた場合/))
    return { type: 'STUB', id: 'ARTS_EXTRA_COST_CONDITION' } as StubAction;

  // ---- 手札から色の〈X〉のカードをN枚まで捨てる ----
  if (t.match(/手札から.*の[＜〈<].+[＞〉>]のカードを[１-９\d０-９]+枚まで捨てる/))
    return { type: 'STUB', id: 'OPTIONAL_COST' } as StubAction;

  // ---- 〈X〉のシグニを対象とし、トラッシュからそれぞれレベルの異なる〈X〉のシグニN枚をデッキの一番下に置いてもよい ----
  if (t.match(/のシグニ.*を対象とし.*トラッシュからそれぞれレベルの異なる.*のシグニ.*枚を.*デッキの一番下に置いてもよい/))
    return { type: 'STUB', id: 'LOOK_AND_REORDER' } as StubAction;

  // ---- この方法でトラッシュに置いたカードの中からカードをN枚まで対象とし、エナゾーンに置く ----
  if (t.match(/この方法でトラッシュに置いたカードの中からカードを.*枚まで対象とし.*エナゾーンに置く/))
    return { type: 'STUB', id: 'CONDITIONAL_POWER_BONUS' } as StubAction;

  // ---- 場に《X》がいる場合、色を宣言し、エナゾーンから宣言した色を持つカードをトラッシュに置いてもよい ----
  if (t.match(/場に《.+》がいる場合.*色.*宣言し.*エナゾーンから.*カード.*トラッシュに置いてもよい/))
    return { type: 'STUB', id: 'DECLARE_COLOR_COND_ENERGY_TRASH' } as StubAction;

  // ---- 手札から白/赤/青/緑/黒のカードをN枚捨ててもよい ----
  if (t.match(/手札から[白赤青緑黒]のカードを[１-９\d０-９]+枚捨ててもよい/))
    return { type: 'STUB', id: 'OPTIONAL_COST' } as StubAction;

  // ---- 場に《X》がいる場合、対戦相手のシグニを対象とし〜捨ててもよい ----
  if (t.match(/場に《.+》がいる場合.*対戦相手.*シグニ.*捨ててもよい/))
    return { type: 'STUB', id: 'USE_CONDITION_TEXT' } as StubAction;

  // ---- 手札をN枚以上捨てた場合、追加でライフクロス〜デッキの一番下に置く ----
  if (t.match(/手札を[１-９\d０-９]+枚以上捨てた場合.*ライフクロス.*デッキの一番下に置く/))
    return { type: 'STUB', id: 'CONDITIONAL_POWER_BONUS' } as StubAction;

  // ---- 不明 ----
  return { type: 'UNKNOWN', raw: t };
}

// ===== 文分割 =====

function splitSentences(text: string): string[] {
  // 引用符「...」内の句点では分割しない
  const result: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '「') depth++;
    else if (text[i] === '」') depth--;
    else if (text[i] === '。' && depth === 0) {
      result.push(text.slice(start, i + 1));
      start = i + 1;
    }
  }
  if (start < text.length) {
    const tail = text.slice(start).trim();
    if (tail) result.push(tail);
  }
  return result.filter(s => s.trim() && s !== '。');
}

// ===== アクションテキスト全体パース =====

function parseActionText(text: string): EffectAction {
  // ---- センタールリグへの能力付与 ----
  if (text.includes('センタールリグは以下の能力を得る') || text.includes('レベルN以上のセンタールリグは以下の能力を得る')) {
    const m = text.match(/以下の能力を得る[。、]?(.+)/s);
    // abilities は parseBlock 後に埋められる（此処では rawText のみ保持）
    return { type: 'GRANT_LRIG_ABILITY', abilities: [], rawText: m?.[1]?.trim() ?? '' } as GrantLrigAbilityAction;
  }

  const sentences = splitSentences(text).filter(s => {
    const c = s.trim().replace(/。$/, '');
    if (!c) return false;
    // 括弧内のルール注釈をスキップ（例: 「（それは次のアップフェイズにアップしない）」）
    if (c.startsWith('（') && (c.endsWith('）') || c.endsWith('）。'))) return false;
    // 複数文にまたがる丸括弧ルール説明のフラグメントをスキップ
    if (c.startsWith('（') && c.includes('【出】能力')) return false;
    if (c.includes('コストを支払わず発動しないことを選んでもよい')) return false;
    // 単独の閉じ括弧・鍵括弧フラグメントをスキップ
    if (c === '）' || c === '』') return false;
    // 「」を得る」などのフラグメントをスキップ（引用符付き能力の末尾切れ）
    if (c.startsWith('」') || c === '」を得る' || c === '」を持つ') return false;
    // 数字+丸括弧で始まる選択肢番号行（①②③④）はスキップ（CHOOSE ヘッダと対にあるため）
    if (/^[①②③④]/.test(c)) return false;
    // 「どちらか/以下のN/から選ぶ」などCHOOSEヘッダ文はスキップ
    if (/^(?:どちらか|以下の?[０-９\d２-４]+つから)/.test(c) && c.includes('選ぶ')) return false;
    return true;
  });
  // CHOOSEパターン共通ヘルパー
  function buildChoose(rawText: string, chooseCount: number): ChooseAction | null {
    const items = [...rawText.matchAll(/[①②③④]([^①②③④]+?)(?=[①②③④]|$)/gs)];
    if (items.length < 2) return null;
    return {
      type: 'CHOOSE',
      choose_count: chooseCount,
      from_count: items.length,
      choices: items.map((m, i) => ({
        choiceId: `c${i}`,
        label: `選択肢${i + 1}`,
        action: parseActionText(m[1].replace(/[。）\s]+$/, '').trim()),
      })),
    };
  }

  if (sentences.length === 0) {
    // CHOOSEパターン: フィルタで全文が除去された場合、①②③④付き選択肢を解析
    const chooseCountM = text.match(/以下の[０-９\d２-９]+つから([０-９\d１-９]+)つまで?を?選ぶ/);
    const chooseCount = chooseCountM ? parseNum(chooseCountM[1]) : 1;
    const chosen = buildChoose(text, chooseCount);
    if (chosen) return chosen;
    return { type: 'UNKNOWN', raw: text };
  }
  if (sentences.length === 1) {
    const s = sentences[0];
    // ---- 「以下のN個から選ぶ」を含む1文の場合、元textから①②③④を解析 ----
    if (s.match(/以下の[０-９\d２-９]+つから[０-９\d１-９]+つ(?:まで)?を?選ぶ/)) {
      const chooseCountM = s.match(/以下の[０-９\d２-９]+つから([０-９\d１-９]+)つまで?を?選ぶ/);
      const chooseCount = chooseCountM ? parseNum(chooseCountM[1]) : 1;
      const chosen = buildChoose(text, chooseCount);
      if (chosen) return chosen;
    }
    // ---- 「どちらか/いずれか選ぶ。①...②...」パターン：フィルタで選択肢行が消えたが元textにある場合 ----
    // 残存 sentence が「①②③④」に続く選択肢の内容テキストで、元のテキストが選択肢構造の場合のみ適用
    if (
      /[①②③④]/.test(text) &&
      /(?:どちらか|いずれか)[１-９\d０-９]*つ?を?選ぶ/.test(text) &&
      // 残存 sentence が「その中から」「残りを」等、選択肢後続テキストの典型パターンで始まる場合
      /^(?:その中から|残りを|以下の)/.test(s.trim())
    ) {
      const chosen = buildChoose(text, 1);
      if (chosen) return chosen;
    }
    // ---- 「カードをN枚引き、X」複合文 ----
    const drawAndM = s.trim().match(/^カードを([０-９\d]+)枚引き、(.+)/);
    if (drawAndM) {
      return {
        type: 'SEQUENCE',
        steps: [
          { type: 'DRAW', owner: 'self', count: parseNum(drawAndM[1]) },
          parseSingleSentence(drawAndM[2]),
        ],
      } as SequenceAction;
    }
    return parseSingleSentence(s);
  }

  // ---- 「...もよい。そうした場合、以下のN個から選ぶ。①...②...」 ----
  {
    const chooseIdx = sentences.findIndex(s => s.match(/以下の[０-９\d２-９]+つから.*選ぶ/));
    if (chooseIdx >= 0) {
      const chooseSentence = sentences[chooseIdx];
      const chooseCountM = chooseSentence.match(/以下の[０-９\d２-９]+つから([０-９\d１-９]+)つまで?を?選ぶ/);
      const chooseCount = chooseCountM ? parseNum(chooseCountM[1]) : 1;
      const chooseAction = buildChoose(text, chooseCount);
      if (chooseAction) {
        const priorActions = sentences.slice(0, chooseIdx).map(s => parseSingleSentence(s.trim()));
        return priorActions.length === 0
          ? chooseAction
          : { type: 'SEQUENCE', steps: [...priorActions, chooseAction] } as SequenceAction;
      }
    }
  }

  // ---- デッキ上からN枚見る → その中から好きな枚数をトラッシュ/デッキへ ----
  if (sentences[0].trim().match(/デッキの上からカードを([０-９\d]+)枚見る/) && sentences.length >= 2) {
    const cM = sentences[0].match(/([０-９\d]+)枚見る/);
    if (cM) {
      const nextS = sentences[1].trim();
      if (nextS.match(/その中から.*(?:デッキ|トラッシュ)/)) {
        return {
          type: 'LOOK_AND_REORDER',
          source: { location: 'deck', owner: 'self' },
          count: parseNum(cM[1]),
          private: true,
          reorder: nextS.includes('好きな順番'),
          canTrash: nextS.includes('トラッシュ'),
          destination: { location: 'deck', owner: 'self', position: nextS.includes('一番下') ? 'bottom' : 'top' },
        };
      }
      // その中からXを手札に加える → 残りをシャッフルしてデッキへ
      if (nextS.match(/その中から.+(手札に加える|手札に加え)/)) {
        const pickM = nextS.match(/その中から(?:(.+?)の)?(?:シグニ|カード)?([０-９\d]+|すべて)枚?(?:を公開し)?(?:手札に加える|手札に加え)/);
        const remainS = sentences.find(s => s.trim().match(/残りを(?:シャッフルして)?デッキ/));
        const remainder: RevealAndPickAction['remainder'] = remainS?.includes('一番下')
          ? { location: 'deck', position: 'bottom' }
          : { location: 'deck', position: 'top' };
        if (pickM) {
          const story = pickM[1] ? parseStoryFilter(pickM[1]) : {};
          const filter: TargetFilter = { ...story };
          const pickCount = pickM[2] === 'すべて' ? 'ALL' : parseNum(pickM[2]);
          return {
            type: 'REVEAL_AND_PICK',
            owner: 'self',
            revealCount: parseNum(cM[1]),
            filter: Object.keys(filter).length > 0 ? filter : undefined,
            pickCount,
            then: { type: 'ADD_TO_HAND', owner: 'self' },
            remainder,
          } as RevealAndPickAction;
        }
      }
    }
  }

  // ---- デッキの一番上を公開 → 条件分岐（それが〜の場合）----
  if (sentences[0].trim().match(/デッキの一番上を公開する/) && sentences.length >= 2) {
    const condS = sentences[1].trim();
    // "それが/そのカードが ... の場合/ではない場合、..."
    const condM = condS.match(/^(?:それが|そのカードが)(.+?)(?:の場合|であった場合|でない場合|ではない場合)、(.+)/);
    if (condM) {
      const condText = condM[1];
      const thenText = condM[2].replace(/。$/, '');
      const thenAction = parseSingleSentence(thenText);
      const filter: TargetFilter = {
        cardType: 'シグニ',
        ...parseStoryFilter(condText),
        ...parseLevelFilter(condText),
        ...parseColorFilter(condText),
      };
      return { type: 'REVEAL_AND_PICK', owner: 'self', revealCount: 1, filter, pickCount: 1, then: thenAction, remainder: { location: 'deck', position: 'top' } } as RevealAndPickAction;
    }
    // マッチしない場合、単純に「公開する + 後続」のシーケンスとして扱う
  }

  // ---- デッキの上からN枚公開 → その中からフィルタでピック → 残りを処理 ----
  if (sentences[0].trim().match(/デッキの上からカードを([０-９\d]+)枚公開する/) && sentences.length >= 2) {
    const revM = sentences[0].match(/([０-９\d]+)枚公開する/);
    if (revM) {
      // 「その中から(すべての|N枚の)XXシグニをN枚手札に加え」パターン
      const pickSentence = sentences.find(s => s.includes('その中から') && (s.includes('手札に加える') || s.includes('手札に加え')));
      if (pickSentence) {
        const pickM1 = pickSentence.match(/その中から(.+?)のシグニ([０-９\d]+|すべて)枚?を手札に加え/);
        const pickM2 = pickSentence.match(/その中からすべての(.+?)のシグニを手札に加え/);
        const pickM3 = pickSentence.match(/その中から(.+?)のシグニをすべて手札に加え/);
        const pickM4 = pickSentence.match(/その中からカード([０-９\d]+)枚を手札に加え/);
        const remainS = sentences.find(s => s.includes('デッキの一番下') || s.includes('デッキの一番上に戻す') || s.includes('トラッシュに置く'));
        const toBottom = remainS?.includes('一番下') ?? false;
        const toTrash = !!(remainS?.includes('トラッシュ') && !remainS?.includes('デッキ'));
        const remainder: RevealAndPickAction['remainder'] = toTrash
          ? { location: 'trash', position: 'any' }
          : { location: 'deck', position: toBottom ? 'bottom' : 'top' };
        if (pickM1) {
          const filter: TargetFilter = { cardType: 'シグニ', ...parseStoryFilter(pickM1[1]) };
          const pickCount = pickM1[2] === 'すべて' ? 'ALL' : parseNum(pickM1[2]);
          return { type: 'REVEAL_AND_PICK', owner: 'self', revealCount: parseNum(revM[1]), filter, pickCount, then: { type: 'ADD_TO_HAND', owner: 'self' }, remainder } as RevealAndPickAction;
        }
        if (pickM2 || pickM3) {
          const storyStr = (pickM2 || pickM3)![1];
          const filter: TargetFilter = { cardType: 'シグニ', ...parseStoryFilter(storyStr) };
          return { type: 'REVEAL_AND_PICK', owner: 'self', revealCount: parseNum(revM[1]), filter, pickCount: 'ALL', then: { type: 'ADD_TO_HAND', owner: 'self' }, remainder } as RevealAndPickAction;
        }
        if (pickM4) {
          return { type: 'REVEAL_AND_PICK', owner: 'self', revealCount: parseNum(revM[1]), pickCount: parseNum(pickM4[1]), then: { type: 'ADD_TO_HAND', owner: 'self' }, remainder } as RevealAndPickAction;
        }
      }
    }
  }

  const steps: EffectAction[] = [];
  for (const s of sentences) {
    const clean = s.trim();
    if (!clean) continue;

    // 「そうしなかった場合、」= 直前が OPPONENT_PAY_OPTIONAL の場合、その else アクションを IS_MY_TURN CONDITIONAL でラップ
    const notThenM = clean.match(/^そうしなかった場合、/);
    if (notThenM && steps.length > 0) {
      const prev = steps[steps.length - 1];
      if (prev && (prev as import('../types/effects').StubAction).type === 'STUB' &&
          (prev as import('../types/effects').StubAction).id === 'OPPONENT_PAY_OPTIONAL') {
        const rest = clean.slice(notThenM[0].length);
        steps.push({ type: 'CONDITIONAL', condition: { type: 'IS_MY_TURN' }, then: parseSingleSentence(rest) });
        continue;
      }
    }

    // 「*を支払わなかった場合、」= 直近の CONDITIONAL(IS_MY_TURN) に else を追加
    const notPaidM = clean.match(/^(?:《[^》]+》)+を支払わなかった場合、/);
    if (notPaidM && steps.length > 0) {
      for (let j = steps.length - 1; j >= 0; j--) {
        const st = steps[j] as import('../types/effects').ConditionalAction;
        if (st?.type === 'CONDITIONAL' && st.condition?.type === 'IS_MY_TURN') {
          const rest = clean.slice(notPaidM[0].length);
          st.else = parseSingleSentence(rest);
          break;
        }
      }
      continue;
    }

    // 「追加で.*を支払っていた場合、[代わりに]」= Pattern④ 追加コスト強化
    // 代わりに → IS_MY_TURN (REPLACE モード)、なし → PAID_ADDITIONAL_COST (ADDITIONAL モード)
    const additionalPaidM = clean.match(/^(?:この方法で)?追加で.+を支払っていた場合、(代わりに)?/);
    if (additionalPaidM && steps.length > 0) {
      const isReplace = !!additionalPaidM[1];
      const rest = clean.slice(additionalPaidM[0].length);
      const thenAction = parseSingleSentence(rest);
      const condition = isReplace
        ? { type: 'IS_MY_TURN' as const }
        : { type: 'PAID_ADDITIONAL_COST' as const };
      steps.push({ type: 'CONDITIONAL', condition, then: thenAction });
      continue;
    }

    // 「そうした場合、」「この方法で...た場合、」「《色》を支払った場合、」はCONDITIONALとして前のステップと結合
    const thenM = clean.match(/^(?:そうした場合、|その後、(?:[^、]+の場合、|この方法で.+(?:支払った|た)場合、)|この方法で.+(?:支払った|た)場合、|(?:《[^》]+》)+を支払った場合、)/);
    if (thenM && steps.length > 0) {
      const rest = clean.slice(thenM[0].length);
      const thenAction = parseSingleSentence(rest);
      steps.push({ type: 'CONDITIONAL', condition: { type: 'IS_MY_TURN' }, then: thenAction });
    } else {
      steps.push(parseSingleSentence(clean));
    }
  }

  // LOOK_AND_REORDER(reveal) + STUB(REVEAL_PICK_HAND_SHUFFLE_BOTTOM) → REVEAL_AND_PICK
  {
    const merged: EffectAction[] = [];
    for (let mi = 0; mi < steps.length; mi++) {
      const cur = steps[mi];
      const nxt = steps[mi + 1];
      if (
        cur?.type === 'LOOK_AND_REORDER' &&
        typeof (cur as LookAndReorderAction).count === 'number' &&
        ((cur as LookAndReorderAction).count as number) > 0 &&
        nxt?.type === 'STUB' &&
        (nxt as StubAction).id === 'REVEAL_PICK_HAND_SHUFFLE_BOTTOM'
      ) {
        const look = cur as LookAndReorderAction;
        const stub = nxt as StubAction;
        const rpp = stub.revealPickParams;
        const pickCount = rpp?.pickCount ?? 1;
        const restDest = rpp?.restDest ?? 'deck_bottom';
        const thenDest = rpp?.then ?? 'hand';
        const thenAction: EffectAction = thenDest === 'energy'
          ? { type: 'ENERGY_CHARGE', target: { type: 'DECK_CARD', owner: 'self' as Owner, count: 1 } } as EnergyChargeAction
          : { type: 'ADD_TO_HAND', owner: 'self' } as import('../types/effects').AddToHandAction;
        const remainder = restDest === 'trash'
          ? { location: 'trash' as import('../types/effects').CardLocation, position: 'bottom' as const }
          : { location: 'deck' as import('../types/effects').CardLocation, position: 'bottom' as const };
        merged.push({
          type: 'REVEAL_AND_PICK',
          owner: 'self',
          revealCount: look.count,
          pickCount,
          then: thenAction,
          remainder,
        } as RevealAndPickAction);
        mi++;
      } else {
        merged.push(cur);
      }
    }
    if (merged.length !== steps.length) {
      steps.length = 0;
      steps.push(...merged);
    }
  }

  if (steps.length === 1) return steps[0];
  return { type: 'SEQUENCE', steps };
}

// ===== 効果ブロック分割 =====

function splitEffectBlocks(text: string): string[] {
  // 「。」の直後に【常/出/起/自/ガード】が来る箇所で分割（lookbehind）
  return text.split(/(?<=。)(?=【(?:常|出|起|自|ガード)】)/).map(b => b.trim()).filter(Boolean);
}

// ===== 単一ブロックパース =====

function parseBlock(cardNum: string, block: string, index: number): CardEffect | null {
  const typeM = block.match(/^【(常|出|起|自|ガード)】/);
  if (!typeM) return null;
  const marker = typeM[1];

  // 【ガード】キーワードは効果として登録しない（ルール処理済み）
  if (marker === 'ガード') return null;

  const afterMarker = block.slice(typeM[0].length);
  const colonIdx = afterMarker.indexOf('：');
  if (colonIdx < 0) return null;

  const costStr = afterMarker.slice(0, colonIdx).trim();
  let actionText = afterMarker.slice(colonIdx + 1).trim();

  let effectType: EffectType;
  let timing: EffectTiming[] | undefined;
  let mandatory = false;

  switch (marker) {
    case '常': effectType = 'CONTINUOUS'; mandatory = true; break;
    case '出':
      effectType = 'AUTO'; timing = ['ON_PLAY'];
      mandatory = costStr === '';
      break;
    case '起': effectType = 'ACTIVATED'; timing = ['MAIN']; break;
    case '自':
      effectType = 'AUTO';
      timing = actionText.includes('アタックしたとき') ? ['ON_ATTACK_SIGNI']
             : actionText.includes('バニッシュされたとき') ? ['ON_BANISH']
             : actionText.match(/(?:手札か?デッキから|場から|いずれかの領域から)トラッシュに置かれたとき/) ? ['ON_TRASH']
             : actionText.match(/トラッシュからエナゾーンに置かれたとき/) ? ['ON_ENERGY_FROM_TRASH']
             : actionText.match(/このカードがあなたの効果によって手札から公開されたとき/) ? ['ON_REVEALED_FROM_HAND']
             : actionText.includes('各アタックフェイズ開始時') ? ['ATTACK']
             : actionText.includes('アタックフェイズ開始時') ? ['ATTACK']
             : actionText.includes('ターン終了時') ? ['ON_TURN_END']
             : actionText.includes('ターン開始時') ? ['ON_TURN_START']
             : ['ON_PLAY'];
      // トリガー文を除去してアクション部分のみparseSentenceに渡す
      if (timing[0] === 'ON_BANISH') {
        // 「このシグニが（パワーN以下の場合）バニッシュされたとき、」のみ除去（前置き条件がある場合は除去しない）
        const m = actionText.match(/^(?:パワー[０-９\d]+以下の)?このシグニがバニッシュされたとき[、,]\s*(.+)/s);
        if (m) actionText = m[1];
      }
      if (timing[0] === 'ON_TRASH') {
        const m = actionText.match(/(?:(?:手札か?デッキから|場から|いずれかの領域から)トラッシュに置かれたとき)[、,]\s*(.+)/s);
        if (m) actionText = m[1];
        else {
          // 「対戦相手の効果によって〜」等のトリガー文を除去
          const m2 = actionText.match(/[^、。「」]{2,100}トラッシュに置かれたとき[、,]\s*(.+)/s);
          if (m2) actionText = m2[1];
        }
      }
      if (timing[0] === 'ATTACK') {
        const m = actionText.match(/各?アタックフェイズ開始時[、,]\s*(.+)/s);
        if (m) actionText = m[1];
      }
      if (timing[0] === 'ON_REVEALED_FROM_HAND') {
        const m = actionText.match(/このカードがあなたの効果によって手札から公開されたとき[、,]\s*(.+)/s);
        if (m) actionText = m[1];
      }
      if (timing[0] === 'ON_ENERGY_FROM_TRASH') {
        const m = actionText.match(/トラッシュからエナゾーンに置かれたとき[、,]\s*(.+)/s);
        if (m) actionText = m[1];
      }
      mandatory = true;
      break;
    default: return null;
  }

  const cost = parseCost(costStr);
  let activeCondition: ActiveCondition | undefined;
  let resolvedAction: EffectAction;
  let parseStatus: CardEffect['parseStatus'] = 'AUTO';
  let useCondition: Condition | undefined;

  if (effectType === 'CONTINUOUS') {
    // 複数条件を繰り返しパースして AND で結合する
    let remaining = actionText;
    const parsedConds: ActiveCondition[] = [];
    let anyFound = false;
    let anyFailed = false;
    while (true) {
      const r = parseActiveCondition(remaining);
      if (!r.conditionFound) break;
      anyFound = true;
      if (r.condition) parsedConds.push(r.condition);
      else if (!r.isTimingMarker) anyFailed = true;
      remaining = r.rest;
    }
    if (parsedConds.length === 0) activeCondition = undefined;
    else if (parsedConds.length === 1) activeCondition = parsedConds[0];
    else activeCondition = { type: 'AND', conditions: parsedConds };
    resolvedAction = parseActionText(remaining || actionText);
    // 一部条件が解析済みで残りが未解析の場合のみPARTIAL
    // 全条件がundefinedの場合はAUTO（activeCondition=undefinedで動作は同じ）
    if (anyFound && anyFailed && parsedConds.length > 0) parseStatus = 'PARTIAL';
  } else {
    // 使用条件（「この能力は〜にしか使用できない」）を抽出してからパース
    const extracted = extractUseCondition(actionText);
    if (extracted.condition) {
      useCondition = extracted.condition;
      actionText = extracted.cleaned;
    }
    resolvedAction = parseActionText(actionText);
  }

  // GRANT_LRIG_ABILITY: rawText からサブ能力をここでパース（parseBlock が使えるタイミング）
  if (resolvedAction.type === 'GRANT_LRIG_ABILITY') {
    const gla = resolvedAction as GrantLrigAbilityAction;
    if (gla.rawText) {
      const cleanRaw = gla.rawText.replace(/^[『「]/, '').replace(/[』」]$/, '');
      const subBlocks = splitEffectBlocks(cleanRaw);
      gla.abilities = subBlocks
        .map((b, si) => parseBlock(`${cardNum}-sub`, b, si))
        .filter((e): e is import('../types/effects').CardEffect => e !== null);
    }
    // rawTextが「。」だけ（句点のみ）の場合は、実際の能力は別のブロックで解析済みのためAUTO扱い
    const rawTextOnlyPunct = !gla.rawText || /^[。、\s]*$/.test(gla.rawText);
    const hasUnknownSub = !rawTextOnlyPunct && (gla.abilities.length === 0 || gla.abilities.some(e => e.parseStatus === 'UNKNOWN'));
    parseStatus = hasUnknownSub ? 'PARTIAL' : 'AUTO';
  } else if (resolvedAction.type === 'UNKNOWN') {
    parseStatus = 'UNKNOWN';
  } else if (resolvedAction.type === 'SEQUENCE') {
    const seq = resolvedAction as SequenceAction;
    if (seq.steps.some(s => s.type === 'UNKNOWN')) parseStatus = 'PARTIAL';
  }

  // ALT_COST_OPP_TURN をアクション列から抽出して CardEffect フィールドに昇格
  let altCostOppTurn: import('../types/effects').EnergyCost[] | undefined;
  if (resolvedAction.type === 'ALT_COST_OPP_TURN') {
    altCostOppTurn = (resolvedAction as import('../types/effects').AltCostOppTurnAction).cost;
    resolvedAction = { type: 'SEQUENCE', steps: [] } as import('../types/effects').SequenceAction;
  } else if (resolvedAction.type === 'SEQUENCE') {
    const seq = resolvedAction as import('../types/effects').SequenceAction;
    const altStep = seq.steps.find(s => s.type === 'ALT_COST_OPP_TURN') as import('../types/effects').AltCostOppTurnAction | undefined;
    if (altStep) {
      altCostOppTurn = altStep.cost;
      resolvedAction = { ...seq, steps: seq.steps.filter(s => s.type !== 'ALT_COST_OPP_TURN') };
    }
  }

  const duration: EffectDuration = effectType === 'CONTINUOUS' ? 'PERMANENT'
    : actionText.includes('ターン終了時まで') ? 'UNTIL_END_OF_TURN'
    : 'INSTANT';

  return {
    effectId: `${cardNum}-E${index + 1}`,
    effectType,
    timing,
    activeCondition,
    condition: useCondition,
    altCostOppTurn,
    cost,
    action: resolvedAction,
    duration,
    mandatory,
    parseStatus,
  };
}

// ===== アーツ・スペルパース =====

function parseArtsEffect(card: CardData): CardEffect | null {
  if (!card.EffectText || card.EffectText === '-') return null;
  const stripped = stripRuleParens(card.EffectText);
  const { cleaned, condition } = extractUseCondition(stripped);
  let action = parseActionText(condition ? cleaned : stripped);
  const hasUnknown = action.type === 'UNKNOWN'
    || (action.type === 'SEQUENCE' && (action as SequenceAction).steps.some(s => s.type === 'UNKNOWN'));
  // ALT_COST_OPP_TURN をアクション列から CardEffect フィールドに昇格
  let altCostOppTurn: import('../types/effects').EnergyCost[] | undefined;
  if (action.type === 'ALT_COST_OPP_TURN') {
    altCostOppTurn = (action as import('../types/effects').AltCostOppTurnAction).cost;
    action = { type: 'SEQUENCE', steps: [] } as import('../types/effects').SequenceAction;
  } else if (action.type === 'SEQUENCE') {
    const seq = action as SequenceAction;
    const altStep = seq.steps.find(s => s.type === 'ALT_COST_OPP_TURN') as import('../types/effects').AltCostOppTurnAction | undefined;
    if (altStep) {
      altCostOppTurn = altStep.cost;
      action = { ...seq, steps: seq.steps.filter(s => s.type !== 'ALT_COST_OPP_TURN') };
    }
  }
  return {
    effectId: `${card.CardNum}-E1`,
    effectType: 'ACTIVATED',
    timing: parseArtsTiming(card.Timing ?? ''),
    cost: parseCost(card.Cost),
    altCostOppTurn,
    condition,
    action,
    duration: 'INSTANT',
    mandatory: false,
    parseStatus: hasUnknown ? (action.type === 'UNKNOWN' ? 'UNKNOWN' : 'PARTIAL') : 'AUTO',
  };
}

function parseSpellEffect(card: CardData): CardEffect | null {
  if (!card.EffectText || card.EffectText === '-') return null;
  const stripped = stripRuleParens(card.EffectText);
  const { cleaned, condition } = extractUseCondition(stripped);
  const action = parseActionText(condition ? cleaned : stripped);
  return {
    effectId: `${card.CardNum}-E1`,
    effectType: 'ACTIVATED',
    timing: ['MAIN'],
    cost: parseCost(card.Cost),
    condition,
    action,
    duration: 'INSTANT',
    mandatory: false,
    parseStatus: action.type === 'UNKNOWN' ? 'UNKNOWN' : 'AUTO',
  };
}

function parseBurstEffect(card: CardData): CardEffect | null {
  if (!card.BurstText || card.BurstText === '-') return null;
  const raw = stripRuleParens(card.BurstText).replace(/^：/, '').trim();
  if (!raw) return null;
  const action = parseActionText(raw);
  return {
    effectId: `${card.CardNum}-BURST`,
    effectType: 'LIFE_BURST',
    timing: ['ON_LIFE_BURST'],
    action,
    duration: 'INSTANT',
    mandatory: false,
    parseStatus: action.type === 'UNKNOWN' ? 'UNKNOWN' : 'AUTO',
  };
}

// ===== メインエクスポート =====

export function parseCardEffects(card: CardData): CardEffect[] {
  const effects: CardEffect[] = [];

  if (card.Type === 'アーツ') {
    const e = parseArtsEffect(card);
    if (e) effects.push(e);
  } else if (card.Type === 'スペル') {
    const e = parseSpellEffect(card);
    if (e) effects.push(e);
  } else {
    // シグニ・ルリグ：EffectTextを複数ブロックに分割して解析
    if (card.EffectText && card.EffectText !== '-') {
      splitEffectBlocks(stripRuleParens(card.EffectText)).forEach((block, i) => {
        const e = parseBlock(card.CardNum, block, i);
        if (e) effects.push(e);
      });
    }
  }

  // ライフバースト（全タイプ共通）
  if (card.LifeBurst === '1' && card.BurstText && card.BurstText !== '-') {
    const burst = parseBurstEffect(card);
    if (burst) effects.push(burst);
  }

  return effects;
}

// CardData[] → Map<CardNum, CardEffect[]>（ゲーム起動時に使用）
/**
 * AUTO ON_PLAY 効果のテキストから triggerScope を推定する。
 * Supabase 保存済みの effects には triggerScope が含まれていない場合があるため、
 * 実行時にカードテキストから動的に補完する。
 */
function inferTriggerScope(effect: CardEffect, card: CardData): import('../types/effects').TriggerScope | undefined {
  if (effect.effectType !== 'AUTO') return undefined;
  if (!effect.timing?.includes('ON_PLAY')) return undefined;
  const text = (card.EffectText ?? '') + (card.BurstText ?? '');
  // 「他のシグニが場に出たとき」「あなたのシグニが場に出たとき」→ 味方シグニ全体
  if (/他の.*シグニ.*場に出たとき/.test(text) ||
      /あなたのシグニが場に出たとき/.test(text)) {
    return 'any_ally';
  }
  // 「対戦相手.*シグニ.*場に出たとき」→ 相手シグニ
  if (/対戦相手.*シグニ.*場に出たとき/.test(text)) {
    return 'any_opp';
  }
  return undefined; // 'self'（このカード自身が出たとき）
}

export function buildEffectsMap(cards: CardData[]): Map<string, CardEffect[]> {
  const map = new Map<string, CardEffect[]>();
  for (const card of cards) {
    // Supabaseからプリパース済みeffectsがある場合はそれを優先
    const raw = (card.effects && card.effects.length > 0)
      ? card.effects
      : parseCardEffects(card);
    // マニュアル効果をマージ
    const merged = mergeManualEffects(card.CardNum, raw);
    // triggerScope を動的に補完（Supabase保存時に欠けている場合に対応）
    const effects = merged.map(e =>
      e.triggerScope !== undefined
        ? e
        : { ...e, triggerScope: inferTriggerScope(e, card) },
    );
    if (effects.length > 0) map.set(card.CardNum, effects);
  }
  return map;
}

// 解析統計（デバッグ用）
export function analyzeParseResults(cards: CardData[]): {
  total: number; auto: number; partial: number; unknown: number;
  unknownCards: { cardNum: string; cardName: string; raw: string }[];
} {
  let auto = 0, partial = 0, unknown = 0;
  const unknownCards: { cardNum: string; cardName: string; raw: string }[] = [];
  for (const card of cards) {
    for (const e of parseCardEffects(card)) {
      if (e.parseStatus === 'AUTO') auto++;
      else if (e.parseStatus === 'PARTIAL') partial++;
      else if (e.parseStatus === 'UNKNOWN') {
        unknown++;
        unknownCards.push({
          cardNum: card.CardNum,
          cardName: card.CardName,
          raw: (e.action as UnknownAction).raw ?? e.effectId,
        });
      }
    }
  }
  return { total: auto + partial + unknown, auto, partial, unknown, unknownCards };
}
