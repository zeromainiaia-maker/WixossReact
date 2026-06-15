import type { CardData } from '../types';
import { mergeManualEffects } from './manualEffects';
import type {
  EffectAction,
  CardEffect,
  EffectType,
  EffectTiming,
  EffectCost,
  EffectDuration,
  ActiveCondition,
  TargetFilter,
  Owner,
  CompareOp,
  SequenceAction,
  ChooseAction,
  UnknownAction,
  RevealAndPickAction,
  EnergyChargeAction,
  GrantLrigAbilityAction,
  LookAndReorderAction,
  StubAction,
  Condition,
} from '../types/effects';
import {
  parseNum, parseLevelFilter, parseColorFilter, parseStoryFilter, parseEnergyCosts, toHalf, stripRuleParens,
} from './parserUtils';
import { parseSentencePart1 } from './parsers/parseSentencePart1';
import { parseSentencePart2 } from './parsers/parseSentencePart2';
import { parseSentencePart3 } from './parsers/parseSentencePart3';
import { parseSentencePart4 } from './parsers/parseSentencePart4';

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

  // このシグニが血晶武装状態
  if (text.match(/このシグニが血晶武装状態/))
    return { type: 'THIS_CARD_IS_ARMORED' };

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
  // シグニを【ビート】にする（コスト）: "他のシグニ1体" or "シグニ1体"
  const beatM = costStr.match(/(?:他の)?シグニ([０-９\d]+)体を【ビート】にする/);
  if (beatM) cost.beat_signi = parseNum(beatM[1]);
  else if (costStr.includes('シグニ１体を【ビート】にする') || costStr.includes('他のシグニ１体を【ビート】にする')) cost.beat_signi = 1;
  const coinM = costStr.match(/《コインアイコン》/g);
  if (coinM?.length) cost.coin = coinM.length;
  // 対戦相手の場の【ウィルス】N個を取り除く → removeOppVirus
  const virusM = costStr.match(/【ウィルス】([０-９\d]+)(?:つ|個)を取り除く/);
  if (virusM) cost.removeOppVirus = parseNum(virusM[1]);
  else if (costStr.includes('【ウィルス】１つを取り除く') || costStr.includes('【ウィルス】１個を取り除く')) cost.removeOppVirus = 1;
  // 手札から[OR指定]シグニをN枚捨てる → handDiscardSigni
  const hdsOr = costStr.match(/手札から((?:＜[^＞]+＞か)+＜[^＞]+＞)のシグニを([０-９\d]+)枚捨てる/);
  const hdsSimple = !hdsOr ? costStr.match(/手札から(?:([白赤青緑黒])の)?(?:＜([^＞]+)＞の)?シグニを([０-９\d]+)枚捨てる/) : null;
  if (hdsOr) {
    const stories = [...hdsOr[1].matchAll(/＜([^＞]+)＞/g)].map(m => m[1]);
    cost.handDiscardSigni = { story: stories, count: parseNum(hdsOr[2]) };
  } else if (hdsSimple) {
    const hdsObj: NonNullable<EffectCost['handDiscardSigni']> = { count: parseNum(hdsSimple[3]) };
    if (hdsSimple[1]) hdsObj.color = hdsSimple[1];
    if (hdsSimple[2]) hdsObj.story = hdsSimple[2];
    cost.handDiscardSigni = hdsObj;
  }
  // エナゾーンから[フィルター]シグニN枚をトラッシュに置く → energyTrash
  const etM = costStr.match(/エナゾーンから(?:(?:それぞれ?レベルの異なる|名前の異なる)?(?:レベル([０-９\d]+)の)?(?:＜([^＞]+)＞の)?)?シグニ([０-９\d]+)枚をトラッシュに置く/);
  if (etM) {
    const etFilter: TargetFilter = { cardType: 'シグニ' };
    if (etM[1]) etFilter.level = parseNum(etM[1]);
    if (etM[2]) etFilter.story = etM[2];
    cost.energyTrash = { count: parseNum(etM[3]), filter: etFilter };
  }
  // トラッシュにあるカードをゲームから除外するコスト → trashExile
  if (costStr.match(/トラッシュにあるこのカードをゲームから除外する/)) {
    cost.trashExile = { self: true };
  } else {
    const teNamedM = costStr.match(/トラッシュにある《([^》]+)》([０-９\d]+)枚をゲームから除外する/);
    const teGenericM = !teNamedM ? costStr.match(/トラッシュにあるカード([０-９\d]+)枚をゲームから除外する/) : null;
    if (teNamedM) cost.trashExile = { count: parseNum(teNamedM[2]), filter: { cardName: teNamedM[1] } };
    else if (teGenericM) cost.trashExile = { count: parseNum(teGenericM[1]) };
  }
  return Object.keys(cost).length > 0 ? cost : undefined;
}


function parseArtsTiming(timingStr: string): EffectTiming[] {
  const t: EffectTiming[] = [];
  if (timingStr.includes('メインフェイズ')) t.push('MAIN');
  if (timingStr.includes('アタックフェイズ')) t.push('ATTACK');
  if (timingStr.includes('スペルカットイン')) t.push('SPELL_CUTIN');
  return t.length > 0 ? t : ['MAIN'];
}


type ConditionParseResult = {
  condition: ActiveCondition | undefined;
  rest: string;
  conditionFound: boolean; // true=条件文が見つかったがパース成功かどうかはconditionで判断
  isTimingMarker?: boolean; // true=条件ではなくタイミング/期間マーカー（anyFailed対象外）
};

function parseActiveCondition(text: string): ConditionParseResult {
  // パターン-1: 「英知=N：」（英知シグニのレベル合計条件）
  const eichiM = text.match(/^英知=([０-９\d]+)：/);
  if (eichiM) {
    const toHW = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFF10 + 0x30));
    const value = parseInt(toHW(eichiM[1]));
    return {
      condition: { type: 'EICHI_LEVEL_SUM', operator: 'eq', value } as import('../types/effects').ActiveCondition,
      rest: text.slice(eichiM[0].length),
      conditionFound: true,
    };
  }

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
    return { condition: { type: 'ENA_DIFF', operator: 'gte', value: parseNum(enaDiffM[1]) }, rest: text.slice(enaDiffM[0].length), conditionFound: true };
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

  // パターン5e: 「(あなた|対戦相手)のセンタールリグがレベルN(以上|以下|)であるかぎり、」
  const centerLrigLevelM = text.match(/^(あなた|対戦相手)のセンタールリグがレベル([０-９\d]+)(以上|以下)?(?:であるかぎり|かぎり)、/);
  if (centerLrigLevelM) {
    const owner = centerLrigLevelM[1] === 'あなた' ? 'self' : 'opponent';
    const val = parseNum(centerLrigLevelM[2]);
    const op: CompareOp = centerLrigLevelM[3] === '以上' ? 'gte' : centerLrigLevelM[3] === '以下' ? 'lte' : 'eq';
    return { condition: { type: 'LRIG_LEVEL', owner, operator: op, value: val }, rest: text.slice(centerLrigLevelM[0].length), conditionFound: true };
  }
  const handZeroM = text.match(/^あなたの手札が０枚であるかぎり、/);
  if (handZeroM) {
    return { condition: { type: 'COUNT_THRESHOLD', location: 'hand', owner: 'self', operator: 'eq', value: 0 }, rest: text.slice(handZeroM[0].length), conditionFound: true };
  }

  // パターン7: 「あなたの手札が対戦相手よりN枚以上多いかぎり、」（handGenMより先に評価）
  const handDiffM = text.match(/^あなたの手札が対戦相手より([０-９\d]+)枚以上多いかぎり、/);
  if (handDiffM) {
    return {
      condition: { type: 'HAND_DIFF', operator: 'gte', value: parseNum(handDiffM[1]) },
      rest: text.slice(handDiffM[0].length),
      conditionFound: true,
    };
  }

  // パターン8: 「あなたの手札が対戦相手より多いかぎり、」（枚数なし → ≥1、handGenMより先に評価）
  if (text.startsWith('あなたの手札が対戦相手より多いかぎり、')) {
    return {
      condition: { type: 'HAND_DIFF', operator: 'gte', value: 1 },
      rest: text.slice('あなたの手札が対戦相手より多いかぎり、'.length),
      conditionFound: true,
    };
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

  // パターン6b: 「このシグニが血晶武装状態であるかぎり、」
  const armorKagiriM = text.match(/^このシグニが血晶武装状態であるかぎり、/);
  if (armorKagiriM) {
    return {
      condition: { type: 'IS_SELF_ARMORED' } as ActiveCondition,
      rest: text.slice(armorKagiriM[0].length),
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

  return (
    parseSentencePart1(t) ??
    parseSentencePart2(t) ??
    parseSentencePart3(t) ??
    parseSentencePart4(t) ??
    { type: 'UNKNOWN', raw: t } as UnknownAction
  );
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
  // 「。」の直後に【(クロス)?(ドライブ|チーム)?(常|出|起|自|ガード)】が来る箇所で分割
  // （《レイヤーアイコン》接頭辞付きのマーカーにも対応）
  return text.split(/(?<=。)(?=(?:《レイヤーアイコン》)?【(?:クロス)?(?:ドライブ|チーム)?(?:常|出|起|自|ガード)】)/).map(b => b.trim()).filter(Boolean);
}

// 効果ではないキーワード接頭辞（ライズ条件・ハーモニー条件等）を除去する
// （【レイヤー】はparseCardEffects内のextractLayerGrantで先に処理される）
function stripKeywordPrefixes(text: string): string {
  let t = text.trim();
  // 先頭の非効果キーワードを繰り返し除去
  const PREFIXES = [
    /^【ライド】/,                 // ライド（注釈はstripRuleParensで除去済み）
    /^【デコレ】/,                 // デコレ（同上）
    /^【ライズ】[^【]*/,           // ライズ：出現条件テキスト
    /^【ハーモニー】[^【]*/,       // ハーモニー：条件テキスト
    /^【グロウ】[^【]*/,           // グロウ：グロウ条件テキスト
    /^【チーム】[^【]*/,           // チーム：チーム名（【チーム自】等は別マーカー）
  ];
  let prev: string;
  do {
    prev = t;
    for (const re of PREFIXES) t = t.replace(re, '').trim();
  } while (t !== prev);
  return t;
}

// ===== 単一ブロックパース =====

function parseBlock(cardNum: string, block: string, index: number): CardEffect | null {
  const typeM = block.match(/^【(クロス)?(ドライブ|チーム)?(常|出|起|自|ガード)】/);
  if (!typeM) return null;
  const isCrossOnly = typeM[1] === 'クロス';
  // ドライブ：そのシグニがドライブ状態であるかぎり有効（IS_DRIVE_STATE条件）
  // チーム：チームルリグが揃っているかぎり有効（既存JSONの慣例に合わせ条件なしで登録）
  const isDrive = typeM[2] === 'ドライブ';
  const marker = typeM[3];

  // 【ガード】キーワードは効果として登録しない（ルール処理済み）
  if (marker === 'ガード') return null;

  const afterMarker = block.slice(typeM[0].length);
  const colonIdx = afterMarker.indexOf('：');
  if (colonIdx < 0) return null;

  let costStr = afterMarker.slice(0, colonIdx).trim();
  let actionText = afterMarker.slice(colonIdx + 1).trim();

  // ビートアイコン条件を costStr から抽出（《ビートアイコン》[条件]）
  let beatCondition: import('../types/effects').Condition | undefined;
  const beatIconM = costStr.match(/^《ビートアイコン》\[([^\]]+)\]\s*/);
  if (beatIconM) {
    beatCondition = { type: 'BEAT_CONDITION', condText: beatIconM[1] };
    costStr = costStr.slice(beatIconM[0].length).trim();
  }

  // 英知=N 条件を costStr から抽出（AUTO/ACTIVATED 効果の使用条件）
  let eichiCondition: ActiveCondition | undefined;
  const eichiInCostM = costStr.match(/^英知=([０-９\d]+)\s*/);
  if (eichiInCostM) {
    const toHWEC = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFF10 + 0x30));
    eichiCondition = { type: 'EICHI_LEVEL_SUM', operator: 'eq', value: parseInt(toHWEC(eichiInCostM[1])) } as ActiveCondition;
    costStr = costStr.slice(eichiInCostM[0].length).trim();
  }

  let effectType: EffectType;
  let timing: EffectTiming[] | undefined;
  let mandatory = false;

  switch (marker) {
    case '常': effectType = 'CONTINUOUS'; mandatory = true; break;
    case '出':
      effectType = 'AUTO'; timing = ['ON_PLAY'];
      mandatory = costStr === '' && !eichiCondition;
      break;
    case '起': effectType = 'ACTIVATED'; timing = ['MAIN']; break;
    case '自':
      effectType = 'AUTO';
      timing = actionText.includes('《ヘブン》したとき') ? ['ON_HEAVEN']
             : actionText.includes('アタックしたとき') ? ['ON_ATTACK_SIGNI']
             : actionText.includes('バニッシュされたとき') ? ['ON_BANISH']
             : actionText.match(/(?:手札か?デッキから|場から|いずれかの領域から)トラッシュに置かれたとき/) ? ['ON_TRASH']
             : actionText.match(/トラッシュからエナゾーンに置かれたとき/) ? ['ON_ENERGY_FROM_TRASH']
             : actionText.match(/このカードがあなたの効果によって手札から公開されたとき/) ? ['ON_REVEALED_FROM_HAND']
             : actionText.includes('血晶武装状態になったとき') ? ['ON_BLOOD_CRYSTAL_ARMOR']
             : actionText.includes('各アタックフェイズ開始時') ? ['ATTACK']
             : actionText.includes('アタックフェイズ開始時') ? ['ATTACK']
             : actionText.includes('ターン終了時') ? ['ON_TURN_END']
             : actionText.includes('ターン開始時') ? ['ON_TURN_START']
             : ['ON_PLAY'];
      // トリガー文を除去してアクション部分のみparseSentenceに渡す
      if (timing[0] === 'ON_HEAVEN') {
        const m = actionText.match(/このシグニが《ヘブン》したとき[、,]\s*(.+)/s);
        if (m) actionText = m[1];
      }
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
      if (timing[0] === 'ON_BLOOD_CRYSTAL_ARMOR') {
        const m = actionText.match(/(?:(?:あなたの|このシグニが?)(?:シグニ[１-９\d０-９]*体?が?)?血晶武装状態になったとき)[、,]\s*(.+)/s);
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
    // costStr に「英知=N」条件が含まれる場合（「【常】英知=N：効果テキスト」形式）
    const eichiCostM = costStr.match(/^英知=([０-９\d]+)$/);
    if (eichiCostM) {
      const toHWE = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFF10 + 0x30));
      activeCondition = { type: 'EICHI_LEVEL_SUM', operator: 'eq', value: parseInt(toHWE(eichiCostM[1])) } as ActiveCondition;
      const resolvedEichi = parseActionText(actionText);
      return {
        effectId: `${cardNum}-E${index + 1}`,
        effectType: 'CONTINUOUS',
        activeCondition,
        action: resolvedEichi,
        duration: 'PERMANENT',
        mandatory: true,
        parseStatus: 'AUTO',
      };
    }
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

  // eichiCondition（英知=N 使用条件）を activeCondition に統合
  let finalActiveCondition: ActiveCondition | undefined = eichiCondition
    ? (activeCondition ? { type: 'AND', conditions: [eichiCondition, activeCondition] } : eichiCondition)
    : activeCondition;

  // 【ドライブ常】【ドライブ自】：ドライブ状態であるかぎり有効
  if (isDrive) {
    const driveCond: ActiveCondition = { type: 'IS_DRIVE_STATE' };
    finalActiveCondition = finalActiveCondition
      ? { type: 'AND', conditions: [driveCond, finalActiveCondition] }
      : driveCond;
  }

  // ビートアイコン条件を useCondition にマージ
  const mergedCondition: import('../types/effects').Condition | undefined = beatCondition
    ? (useCondition ? { type: 'AND', conditions: [beatCondition, useCondition] } : beatCondition)
    : useCondition;

  return {
    effectId: `${cardNum}-E${index + 1}`,
    effectType,
    timing,
    activeCondition: finalActiveCondition,
    condition: mergedCondition,
    altCostOppTurn,
    cost,
    action: resolvedAction,
    duration,
    mandatory,
    parseStatus,
    ...(isCrossOnly ? { crossOnly: true } : {}),
  };
}

// ===== アーツ・スペルパース =====

function parseArtsEffect(card: CardData): CardEffect | null {
  if (!card.EffectText || card.EffectText === '-') return null;
  // アンコール（《cost》（説明）本文）とベット（《cost》本文）のプレフィックスを除去してから解析
  const stripped = stripRuleParens(card.EffectText)
    .replace(/^(?:アンコール－|ベット[―─])(?:《[^》]+》)*\s*/, '');
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

  const baseType = card.Type?.split('/')[0] ?? '';
  if (baseType === 'アーツ' || baseType === 'ピース' || baseType === 'リレーピース') {
    const e = parseArtsEffect(card);
    if (e) effects.push(e);
  } else if (baseType === 'スペル') {
    const e = parseSpellEffect(card);
    if (e) effects.push(e);
  } else {
    // シグニ・ルリグ・その他：EffectTextを複数ブロックに分割して解析
    if (card.EffectText && card.EffectText !== '-') {
      let effectText = card.EffectText;
      // クロスアイコン prefix の検出と除去
      if (effectText.startsWith('《クロスアイコン》')) {
        card.hasCrossIcon = true;
        const crossM = effectText.match(/^《クロスアイコン》([^【]+)/);
        if (crossM) card.crossConditionText = crossM[1].trim();
        effectText = effectText.replace(/^《クロスアイコン》[^【]*/, '');
      }
      // 『』ブラケット除去（アクセクラフト等の効果表記）
      effectText = effectText.replace(/[『』]/g, '');
      // 【出現条件】プレフィックス除去（レゾナクラフト等）
      if (effectText.includes('【出現条件】')) {
        effectText = effectText.replace(/^【出現条件】[^【]+/, '');
      }
      // 【レイヤー】付与の検出：「あなたの＜X＞のシグニは《レイヤーアイコン》の能力を得る」
      // 《レイヤーアイコン》接頭辞付きブロックは付与能力、それ以外はこのカード自身の能力
      const layerM = effectText.match(/【レイヤー】あなたの＜([^＞]+)＞のシグニは《レイヤーアイコン》の能力を得る/);
      if (layerM) {
        effectText = effectText.replace(/【レイヤー】[^【]*?《レイヤーアイコン》の能力を得る。?/, '');
      }

      const layerAbilities: CardEffect[] = [];
      splitEffectBlocks(stripKeywordPrefixes(stripRuleParens(effectText))).forEach((block, i) => {
        if (layerM && block.startsWith('《レイヤーアイコン》')) {
          const e = parseBlock(card.CardNum, block.replace(/^《レイヤーアイコン》/, ''), i);
          if (e) layerAbilities.push({ ...e, effectId: `${card.CardNum}-LAYER-E${layerAbilities.length + 1}` });
          return;
        }
        const e = parseBlock(card.CardNum, block, i);
        if (e) effects.push(e);
      });

      if (layerM && layerAbilities.length > 0) {
        effects.unshift({
          effectId: `${card.CardNum}-LAYER`,
          effectType: 'CONTINUOUS',
          action: {
            type: 'GRANT_FIELD_SIGNI_ABILITY',
            filter: { cardType: 'シグニ', story: layerM[1] },
            abilities: layerAbilities,
          },
          duration: 'PERMANENT',
          mandatory: true,
          parseStatus: layerAbilities.every(e => e.parseStatus === 'AUTO') ? 'AUTO' : 'PARTIAL',
        });
      }
    }
  }

  // ライフバースト（全タイプ共通）
  if (card.LifeBurst === '1' && card.BurstText && card.BurstText !== '-') {
    const burst = parseBurstEffect(card);
    if (burst) effects.push(burst);
  }

  // 歌のカケラ効果（EffectTextに【歌のカケラ】：〜 がある場合）
  if (card.EffectText && card.EffectText !== '-' && card.EffectText.includes('【歌のカケラ】')) {
    // 句点+効果マーカー または ルールテキスト括弧 で区切る（「」内の【自】で止めない）
    const songM = card.EffectText.match(/【歌のカケラ】：(.+?)(?=（【|。【[常出起自ガ]】|$)/s);
    if (songM) {
      const raw = stripRuleParens(songM[1]).trim();
      if (raw) {
        const action = parseActionText(raw);
        effects.push({
          effectId: `${card.CardNum}-SONG`,
          effectType: 'SONG_ICON',
          timing: ['ON_SONG_ACTIVATE'],
          action,
          duration: 'INSTANT',
          mandatory: false,
          parseStatus: action.type === 'UNKNOWN' ? 'UNKNOWN' : 'AUTO',
        });
      }
    }
  }

  // トラップアイコン効果（EffectTextに【トラップアイコン】：〜 がある場合）
  if (card.EffectText && card.EffectText !== '-' && card.EffectText.includes('【トラップアイコン】')) {
    const trapM = card.EffectText.match(/【トラップアイコン】：(.+?)(?=（|【[常出起自ガ]】|$)/s);
    if (trapM) {
      const raw = stripRuleParens(trapM[1]).trim();
      if (raw) {
        const action = parseActionText(raw);
        effects.push({
          effectId: `${card.CardNum}-TRAP`,
          effectType: 'TRAP_ICON',
          timing: ['ON_TRAP_ACTIVATE'],
          action,
          duration: 'INSTANT',
          mandatory: false,
          parseStatus: action.type === 'UNKNOWN' ? 'UNKNOWN' : 'AUTO',
        });
      }
    }
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
  const text = (card.EffectText ?? '') + (card.BurstText ?? '');
  if (effect.timing?.includes('ON_BLOOD_CRYSTAL_ARMOR')) {
    // 「あなたのシグニ１体が血晶武装状態になったとき」→ 味方シグニ全体
    if (/あなたのシグニ[１-９\d０-９]*体?が血晶武装状態になったとき/.test(text)) return 'any_ally';
    return 'self'; // 「このシグニが血晶武装状態になったとき」→ 自身のみ
  }
  if (!effect.timing?.includes('ON_PLAY')) return undefined;
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
