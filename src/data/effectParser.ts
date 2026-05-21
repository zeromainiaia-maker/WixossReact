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
  StubAction,
} from '../types/effects';

// ===== 数値ユーティリティ =====

const FW_DIGIT: Record<string, string> = {
  '０':'0','１':'1','２':'2','３':'3','４':'4',
  '５':'5','６':'6','７':'7','８':'8','９':'9',
};
function toHalf(s: string): string {
  return s.replace(/[０-９]/g, c => FW_DIGIT[c] ?? c);
}
function parseNum(s: string): number {
  return parseInt(toHalf(s), 10);
}

// ===== コストパース =====

const ENERGY_COLORS = new Set(['白', '赤', '青', '緑', '黒', '無']);

function parseEnergyCosts(str: string): EnergyCost[] {
  const costs: EnergyCost[] = [];
  const re = /《([^》]+)》(?:×([０-９\d]+))?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(str)) !== null) {
    if (ENERGY_COLORS.has(m[1])) {
      costs.push({
        color: m[1] as EnergyCost['color'],
        count: m[2] ? parseNum(m[2]) : 1,
      });
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
  return { type: 'SIGNI', owner, count, filter, upToCount: !!upToM };
}

// ===== CONTINUOUS activeCondition パース =====

type ConditionParseResult = {
  condition: ActiveCondition | undefined;
  rest: string;
  conditionFound: boolean; // true=条件文が見つかったがパース成功かどうかはconditionで判断
};

function parseActiveCondition(text: string): ConditionParseResult {
  // パターン0: 「このターン、」（ターン終了時まで適用される常時効果）
  if (text.startsWith('このターン、')) {
    return { condition: undefined, rest: text.slice('このターン、'.length), conditionFound: true };
  }

  // パターン0b: 「ターン終了時まで、」（常時効果の持続期間指定）
  if (text.startsWith('ターン終了時まで、')) {
    return { condition: undefined, rest: text.slice('ターン終了時まで、'.length), conditionFound: true };
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

  // パターン5: 「あなたのエナゾーンにカードがN枚以上あるかぎり、」
  const enaM = text.match(/^あなたのエナゾーンにカードが([０-９\d]+)枚以上あるかぎり、/);
  if (enaM) {
    return {
      condition: { type: 'COUNT_THRESHOLD', location: 'energy', owner: 'self', operator: 'gte', value: parseNum(enaM[1]) },
      rest: text.slice(enaM[0].length),
      conditionFound: true,
    };
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

  // それ以外の「〜かぎり、」パターン（複雑な条件→未解析）
  const genericKagiriM = text.match(/^.+かぎり、/);
  if (genericKagiriM && genericKagiriM[0].length < 60) {
    return { condition: undefined, rest: text.slice(genericKagiriM[0].length), conditionFound: true };
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
    .replace(/^[^、]{2,50}がバニッシュされたとき、/, '')
    .replace(/^このカードがエクシードのコストとしてルリグトラッシュに置かれたとき、/, '')
    .replace(/^対戦相手がアーツを使用したとき、/, '')
    .replace(/^あなたの[^、]{2,30}が場に出たとき、/, '');

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

  // ---- スタック枚数依存パワー修正（CONTINUOUS: 下にあるカード1枚につき）----
  const perStackM = t.match(/このシグニの下にあるカード.*につき([＋－])([０-９\d]+)される/);
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
        until: 'END_OF_TURN',
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
        until: 'END_OF_TURN',
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
        until: 'END_OF_TURN',
      } as PowerModifyPerTrashCountAction;
    }
  }

  // ---- ACTIVATED: ターン終了時まで、パワーをフィールドの＜クラス＞シグニN体につき ----
  {
    const m = t.match(/対戦相手のシグニ([０-９\d]+)体を対象とし.*ターン終了時まで.*パワーをあなたの(＜[^＞]+＞)のシグニ([０-９\d]+)体につき([＋－])([０-９\d]+)する/);
    if (m) {
      const sign = m[4] === '＋' ? 1 : -1;
      return {
        type: 'POWER_MODIFY_PER_FIELD',
        target: { type: 'SIGNI', owner: 'opponent', count: parseNum(m[1]) },
        deltaPerUnit: sign * parseNum(m[5]),
        countFilter: { cardType: 'シグニ', story: [m[2].slice(1, -1)] },
        countOwner: 'self',
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
  const drawM = t.match(/カードを([０-９\d]+)枚引く/);
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
    return { type: 'BANISH', target: parseSigniTarget(t, owner) };
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
    if (t.match(/あなたのすべてのシグニ/) || t.match(/あなたのシグニのパワーを/)) {
      target = { type: 'SIGNI', owner: 'self', count: 'ALL', filter: { cardType: 'シグニ', ...parseColorFilter(t) } };
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
  const deckLookM = t.match(/デッキの上からカードを([０-９\d]+)枚(?:公開|見)る/);
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
    const isTrash = t.includes('トラッシュ');
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

  // ---- このシグニのパワーはあなたの場にある[他の]＜X＞のシグニ１体につき±Nされる ----
  const perFieldSelfM = t.match(/このシグニのパワーは(あなた|対戦相手)の場にある(?:他の)?(.+?)のシグニ(?:[０-９\d]+)?体?につき([＋－])([０-９\d]+)され/);
  if (perFieldSelfM) {
    const countOwner: Owner = perFieldSelfM[1] === '対戦相手' ? 'opponent' : 'self';
    const sign = perFieldSelfM[3] === '＋' ? 1 : -1;
    return {
      type: 'POWER_MODIFY_PER_FIELD',
      target: { type: 'SIGNI', owner: 'self', count: 1 },
      deltaPerUnit: sign * parseNum(perFieldSelfM[4]),
      countFilter: { cardType: 'シグニ', ...parseStoryFilter(perFieldSelfM[2]) },
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
      source: { type: 'LIFE_CLOTH_CARD', owner: 'self', count: 1 },
      canTrash: false,
      destLocation: 'deck',
      destOwner: 'self',
      destPosition: 'top',
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
        source: { type: 'LIFE_CLOTH_CARD', owner: 'self', count: parseNum(lifeToTopM[1]) },
        canTrash: false,
        destLocation: 'deck',
        destOwner: 'self',
        destPosition: 'any',
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
  if (t.match(/あなたのルリグデッキに《改造素材》.*加える/)) {
    return { type: 'STUB', id: 'ADD_MATERIAL' } as StubAction;
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

  // ---- シグニ下のウェポンシグニを手札に加える ----
  if (t.match(/あなたのシグニの下にある.*シグニ.*を手札に加える/)) {
    return { type: 'STUB', id: 'ADD_UNDER_SIGNI_TO_HAND' } as StubAction;
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
    return { type: 'LIFE_CRASH', owner: 'self', count: 1 };
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
  if (t.match(/^対戦相手のライフクロスの一番上を見る$/)) {
    return { type: 'STUB', id: 'LOOK_OPP_LIFE_TOP' } as StubAction;
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

  // ---- このシグニのレベル以上のトラッシュシグニを下に置く（天使等）----
  if (t.match(/あなたのトラッシュからレベル.*のシグニ.*このシグニの下に置く/)) {
    return { type: 'STUB', id: 'ADD_UNDER_STACK_FROM_TRASH' } as StubAction;
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

  // ---- シグニ下に積む（英知など）----
  if (t.match(/あなたのトラッシュから.*シグニ.*枚.*このシグニの下に置く/)) {
    return { type: 'STUB', id: 'STACK_SIGNI_UNDER' } as StubAction;
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
    // 「」を得る」などのフラグメントをスキップ（引用符付き能力の末尾切れ）
    if (c.startsWith('」') || c === '」を得る' || c === '」を持つ') return false;
    // 数字+丸括弧で始まる選択肢番号行（①②③）はスキップ（CHOOSE ヘッダと対にあるため）
    if (/^[①②③]/.test(c)) return false;
    // 「どちらか/以下のN/から選ぶ」などCHOOSEヘッダ文はスキップ
    if (/^(?:どちらか|以下の?[０-９\d２３]+つから)/.test(c) && c.includes('選ぶ')) return false;
    return true;
  });
  if (sentences.length === 0) {
    // CHOOSEパターン: フィルタで全文が除去された場合、①②③付き選択肢を解析
    const choiceItems = [...text.matchAll(/[①②③]([^①②③。]+)。?/g)];
    if (choiceItems.length >= 2) {
      return {
        type: 'CHOOSE',
        choose_count: 1,
        from_count: choiceItems.length,
        choices: choiceItems.map((m, i) => ({
          choiceId: `c${i}`,
          label: `選択肢${i + 1}`,
          action: parseSingleSentence(m[1].trim()),
        })),
      } as ChooseAction;
    }
    return { type: 'UNKNOWN', raw: text };
  }
  if (sentences.length === 1) {
    const s = sentences[0];
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
    // 「そうした場合、」「その後、〜の場合、」はCONDITIONALとして前のステップと結合
    const thenM = clean.match(/^(?:そうした場合、|その後、([^、]+の場合、))/);
    if (thenM && steps.length > 0) {
      const rest = clean.slice(thenM[0].length);
      const thenAction = parseSingleSentence(rest);
      steps.push({ type: 'CONDITIONAL', condition: { type: 'IS_MY_TURN' }, then: thenAction });
    } else {
      steps.push(parseSingleSentence(clean));
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
             : actionText.match(/(?:手札か?デッキから|場から)トラッシュに置かれたとき/) ? ['ON_TRASH']
             : actionText.includes('各アタックフェイズ開始時') ? ['ATTACK']
             : actionText.includes('アタックフェイズ開始時') ? ['ATTACK']
             : actionText.includes('ターン終了時') ? ['ON_TURN_END']
             : actionText.includes('ターン開始時') ? ['ON_TURN_START']
             : ['ON_PLAY'];
      // トリガー文を除去してアクション部分のみparseSentenceに渡す
      if (timing[0] === 'ON_TRASH') {
        const m = actionText.match(/(?:(?:手札か?デッキから|場から)トラッシュに置かれたとき)[、,]\s*(.+)/);
        if (m) actionText = m[1];
      }
      if (timing[0] === 'ATTACK') {
        const m = actionText.match(/各?アタックフェイズ開始時[、,]\s*(.+)/);
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

  if (effectType === 'CONTINUOUS') {
    const { condition, rest, conditionFound } = parseActiveCondition(actionText);
    activeCondition = condition;
    resolvedAction = parseActionText(rest || actionText);
    // 条件が見つかったが解析できなかった場合はPARTIAL
    if (conditionFound && !condition) parseStatus = 'PARTIAL';
  } else {
    resolvedAction = parseActionText(actionText);
  }

  // GRANT_LRIG_ABILITY: rawText からサブ能力をここでパース（parseBlock が使えるタイミング）
  if (resolvedAction.type === 'GRANT_LRIG_ABILITY') {
    const gla = resolvedAction as GrantLrigAbilityAction;
    if (gla.rawText) {
      const subBlocks = splitEffectBlocks(gla.rawText);
      gla.abilities = subBlocks
        .map((b, si) => parseBlock(`${cardNum}-sub`, b, si))
        .filter((e): e is import('../types/effects').CardEffect => e !== null);
    }
    const hasUnknownSub = gla.abilities.length === 0 || gla.abilities.some(e => e.parseStatus === 'UNKNOWN');
    parseStatus = hasUnknownSub ? 'PARTIAL' : 'AUTO';
  } else if (resolvedAction.type === 'UNKNOWN') {
    parseStatus = 'UNKNOWN';
  } else if (resolvedAction.type === 'SEQUENCE') {
    const seq = resolvedAction as SequenceAction;
    if (seq.steps.some(s => s.type === 'UNKNOWN')) parseStatus = 'PARTIAL';
  }

  const duration: EffectDuration = effectType === 'CONTINUOUS' ? 'PERMANENT'
    : actionText.includes('ターン終了時まで') ? 'UNTIL_END_OF_TURN'
    : 'INSTANT';

  return {
    effectId: `${cardNum}-E${index + 1}`,
    effectType,
    timing,
    activeCondition,
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
  const action = parseActionText(card.EffectText);
  const hasUnknown = action.type === 'UNKNOWN'
    || (action.type === 'SEQUENCE' && (action as SequenceAction).steps.some(s => s.type === 'UNKNOWN'));
  return {
    effectId: `${card.CardNum}-E1`,
    effectType: 'ACTIVATED',
    timing: parseArtsTiming(card.Timing ?? ''),
    cost: parseCost(card.Cost),
    action,
    duration: 'INSTANT',
    mandatory: false,
    parseStatus: hasUnknown ? (action.type === 'UNKNOWN' ? 'UNKNOWN' : 'PARTIAL') : 'AUTO',
  };
}

function parseSpellEffect(card: CardData): CardEffect | null {
  if (!card.EffectText || card.EffectText === '-') return null;
  const action = parseActionText(card.EffectText);
  return {
    effectId: `${card.CardNum}-E1`,
    effectType: 'ACTIVATED',
    timing: ['MAIN'],
    cost: parseCost(card.Cost),
    action,
    duration: 'INSTANT',
    mandatory: false,
    parseStatus: action.type === 'UNKNOWN' ? 'UNKNOWN' : 'AUTO',
  };
}

function parseBurstEffect(card: CardData): CardEffect | null {
  if (!card.BurstText || card.BurstText === '-') return null;
  const raw = card.BurstText.replace(/^：/, '').trim();
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
      splitEffectBlocks(card.EffectText).forEach((block, i) => {
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
