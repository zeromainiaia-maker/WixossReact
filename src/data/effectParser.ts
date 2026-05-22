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
  AddCraftToLrigDeckAction,
  StubAction,
  PowerModifyAction,
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
    .replace(/^[^、。「」]{2,60}バニッシュされたとき、/, '')
    .replace(/^[^、。「」]{2,60}トラッシュに置かれたとき、/, '')
    .replace(/^[^、。「」]{2,60}場を離れ?たとき、/, '')
    .replace(/^このカードがエクシードのコストとしてルリグトラッシュに置かれたとき、/, '')
    .replace(/^対戦相手がアーツを使用したとき、/, '')
    .replace(/^あなたの[^、「」]{2,30}が場に出たとき、/, '')
    .replace(/^[^、。「」]{2,60}ライズされたとき、/, '')
    .replace(/^[^、。「」]{2,60}アタックしたとき、/, '');

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
    return { type: 'STUB', id: 'PREVENT_NEXT_DAMAGE' } as StubAction;
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

  // ---- トラッシュから特定カード複数をシグニ下に置く ----
  if (t.match(/あなたのトラッシュから《[^》]+》.*枚.*このシグニの下に置く/)) {
    return { type: 'STUB', id: 'STACK_SPECIFIC_CARDS_FROM_TRASH_UNDER' } as StubAction;
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
  if (t.match(/あなたのデッキの一番上のカードをこのシグニの下に置く/)) {
    return { type: 'STUB', id: 'DECK_TOP_UNDER_SELF' } as StubAction;
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

  // ---- ライフクロスの上から2枚を好きな順番で戻す ----
  {
    const lifeReorderM = t.match(/ライフクロスの上からカードを([０-９\d]+)枚見て.*好きな順番で一番上に戻す/);
    if (lifeReorderM) {
      return {
        type: 'LOOK_AND_REORDER',
        source: { type: 'LIFE_CLOTH_CARD', owner: 'self', count: parseNum(lifeReorderM[1]) },
        canTrash: false,
        destLocation: 'deck',
        destOwner: 'self',
        destPosition: 'any',
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

  // ---- 覚醒する ----
  if (t.includes('覚醒する') || t.includes('覚醒状態にする')) {
    return { type: 'STUB', id: 'AWAKEN' } as StubAction;
  }

  // ---- 歌のカケラ ----
  if (t.includes('歌のカケラ')) {
    return { type: 'STUB', id: 'SONG_FRAGMENT' } as StubAction;
  }

  // ---- ルリグの下のカード操作（ソウル・移動） ----
  if (t.match(/ルリグの下.+カード/) || t.includes('ソウル】にする')) {
    return { type: 'STUB', id: 'LRIG_UNDER_CARD_OP' } as StubAction;
  }

  // ---- シグニの下にカードを置く（手札・エナ・デッキから） ----
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

  // ---- アタックを無効にする ----
  if (t.includes('アタックを無効') && !t.includes('無効にし')) {
    return { type: 'STUB', id: 'NEGATE_ATTACK_ON_TRIGGER' } as StubAction;
  }
  if (t.includes('アタックしたとき、そのアタックを無効にする')) {
    return { type: 'STUB', id: 'NEGATE_ATTACK_ON_TRIGGER' } as StubAction;
  }

  // ---- 場所（ゾーン）を入れ替える ----
  if (t.includes('場所を入れ替える') || t.includes('場所を入れ替えてもよい')) {
    return { type: 'STUB', id: 'SWAP_ZONES' } as StubAction;
  }

  // ---- すべての領域で色を失う ----
  if (t.match(/すべての領域で色を失う/)) {
    return { type: 'STUB', id: 'LOSE_COLOR_ALL_ZONES' } as StubAction;
  }

  // ---- ルリグ名コピー（ルリグトラッシュのルリグと同じカード名） ----
  if (t.match(/ルリグトラッシュにある.+と同じカード名/)) {
    return { type: 'STUB', id: 'COPY_LRIG_NAME_ABILITY' } as StubAction;
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
  if (t.match(/次に.*アタックしたとき.*アタックを無効/)) {
    return { type: 'STUB', id: 'NEGATE_NEXT_ATTACK' } as StubAction;
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
  if (t.match(/《リコレクトアイコン》/)) {
    return { type: 'STUB', id: 'RECOLLECT_ICON' } as StubAction;
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

  // ---- 対戦相手が自分のシグニを選びエナゾーンに置く ----
  if (t.match(/対戦相手は自分の.+シグニ.+選び.+エナゾーン/) ||
      t.match(/対戦相手の.+シグニ.+エナゾーンに置く/)) {
    return { type: 'STUB', id: 'OPP_SIGNI_TO_ENERGY' } as StubAction;
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
    return { type: 'STUB', id: 'LOOK_TOP_ADD_HAND_REST_BOTTOM' } as StubAction;
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
    if (chooseIdx >= 1) {
      const chooseCountM = sentences[chooseIdx].match(/以下の[０-９\d２-９]+つから([０-９\d１-９]+)つまで?を?選ぶ/);
      const chooseCount = chooseCountM ? parseNum(chooseCountM[1]) : 1;
      const chooseAction = buildChoose(text, chooseCount);
      if (chooseAction) {
        const priorActions = sentences.slice(0, chooseIdx).map(s => parseSingleSentence(s.trim()));
        return { type: 'SEQUENCE', steps: [...priorActions, chooseAction] } as SequenceAction;
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
             : actionText.match(/(?:手札か?デッキから|場から|いずれかの領域から)トラッシュに置かれたとき/) ? ['ON_TRASH']
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
      mandatory = true;
      break;
    default: return null;
  }

  const cost = parseCost(costStr);
  let activeCondition: ActiveCondition | undefined;
  let resolvedAction: EffectAction;
  let parseStatus: CardEffect['parseStatus'] = 'AUTO';

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
      else anyFailed = true;
      remaining = r.rest;
    }
    if (parsedConds.length === 0) activeCondition = undefined;
    else if (parsedConds.length === 1) activeCondition = parsedConds[0];
    else activeCondition = { type: 'AND', conditions: parsedConds };
    resolvedAction = parseActionText(remaining || actionText);
    if (anyFound && (parsedConds.length === 0 || anyFailed)) parseStatus = 'PARTIAL';
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
