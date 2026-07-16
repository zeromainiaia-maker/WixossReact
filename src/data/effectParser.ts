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
  CardTypeFilter,
  EffectTarget,
  Owner,
  CompareOp,
  SequenceAction,
  ChooseAction,
  UnknownAction,
  RevealAndPickAction,
  EnergyChargeAction,
  AddToEnergyAction,
  GrantLrigAbilityAction,
  GrantAcceHostAbilityAction,
  GrantFieldSigniAbilityAction,
  LookAndReorderAction,
  StubAction,
  Condition,
  GrantKeywordAction,
  PowerModifyAction,
  TransferToHandAction,
  AddToFieldAction,
} from '../types/effects';
import {
  parseNum, parseLevelFilter, parseColorFilter, parseStoryFilter, parseGuardFilter, parseNameFilter, parseEnergyCosts, toHalf, stripRuleParens, parseSuperlative, parseSelfComparison, parseTriggerComparison, parseSigniTarget,
} from './parserUtils';
import { parseSentencePart1 } from './parsers/parseSentencePart1';
import { parseSentencePart2 } from './parsers/parseSentencePart2';
import { parseSentencePart3 } from './parsers/parseSentencePart3';
import { parseSentencePart4 } from './parsers/parseSentencePart4';
import { encodeShadowScopesInText } from '../utils/keywords';

function parseUseCondition(text: string): Condition {
  const n = (s: string) => parseInt(toHalf(s), 10);
  const op = (s: string): import('../types/effects').CompareOp => s === '以上' ? 'gte' : s === '以下' ? 'lte' : 'eq';

  // 「(あなた|対戦相手)の場にクロス状態の[＜X＞の]シグニがある」＝HAS_CARD_IN_FIELD。
  // engine は crossState フィルタを実装済み（execUtils evaluateCondition HAS_CARD_IN_FIELD / fieldCandidates）。
  // 旧: クロス状態を一律 COND_STUB（常に許可）にしていたが、それは未実装時代の名残＝場の存在条件は正規化する。
  const crossFieldM = text.match(/(あなた|対戦相手)の場に(?:ある)?クロス状態の(?:(＜[^＞]+＞)の)?シグニが(?:いる|ある)/);
  if (crossFieldM) {
    return {
      type: 'HAS_CARD_IN_FIELD',
      owner: crossFieldM[1] === 'あなた' ? 'self' : 'opponent',
      filter: { cardType: 'シグニ', crossState: true, ...(crossFieldM[2] ? parseStoryFilter(crossFieldM[2]) : {}) },
    };
  }
  // それ以外のクロス状態参照（このシグニ自身がクロス状態 等）は未対応 → COND_STUB（常に許可）
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
  // このルリグの下からカードN枚をルリグトラッシュに置く → exceed（エクシードの文章表現）
  const emLrig = !em ? costStr.match(/このルリグの下からカード([０-９\d]+)枚をルリグトラッシュに置く/) : null;
  if (emLrig) cost.exceed = parseNum(emLrig[1]);
  // シグニを【ビート】にする（コスト）: "他のシグニ1体" or "シグニ1体"
  const beatM = costStr.match(/(?:他の)?シグニ([０-９\d]+)体を【ビート】にする/);
  if (beatM) cost.beat_signi = parseNum(beatM[1]);
  else if (costStr.includes('シグニ１体を【ビート】にする') || costStr.includes('他のシグニ１体を【ビート】にする') || costStr.includes('このシグニを【ビート】にする')) cost.beat_signi = 1;
  const coinM = costStr.match(/《コインアイコン》/g);
  if (coinM?.length) cost.coin = coinM.length;
  // 対戦相手の場の【ウィルス】N個を取り除く → removeOppVirus
  const virusM = costStr.match(/【ウィルス】([０-９\d]+)(?:つ|個)を取り除く/);
  if (virusM) cost.removeOppVirus = parseNum(virusM[1]);
  else if (costStr.includes('【ウィルス】１つを取り除く') || costStr.includes('【ウィルス】１個を取り除く')) cost.removeOppVirus = 1;
  // 手札から[OR指定]シグニをN枚捨てる → handDiscardSigni (合計N枚も対応)
  const hdsOr = costStr.match(/手札から((?:＜[^＞]+＞か)+＜[^＞]+＞)のシグニを(?:合計)?([０-９\d]+)枚捨てる/);
  const hdsSimple = !hdsOr ? costStr.match(/手札から(?:([白赤青緑黒])の)?(?:(?:それぞれ名前の異なる)?＜([^＞]+)＞の)?シグニを([０-９\d]+)枚捨てる/) : null;
  if (hdsOr) {
    const stories = [...hdsOr[1].matchAll(/＜([^＞]+)＞/g)].map(m => m[1]);
    cost.handDiscardSigni = { story: stories, count: parseNum(hdsOr[2]) };
  } else if (hdsSimple) {
    const hdsObj: NonNullable<EffectCost['handDiscardSigni']> = { count: parseNum(hdsSimple[3]) };
    if (hdsSimple[1]) hdsObj.color = hdsSimple[1];
    if (hdsSimple[2]) hdsObj.story = hdsSimple[2];
    cost.handDiscardSigni = hdsObj;
  }
  // このシグニを場からトラッシュに置く（単独、または「このシグニと《XXX》」形式）→ trash_self
  if (/このシグニを(?:場から)?トラッシュに置く/.test(costStr) || /このシグニと《[^》]+》[０-９\d]*体を場からトラッシュに置く/.test(costStr)) cost.trash_self = true;
  // このキーを場からルリグトラッシュに置く（単独 or 複合「置き」形も含む） → trash_key
  if (/このキーを(?:場から)?ルリグトラッシュに置く/.test(costStr) || /このキーを(?:場から)?ルリグトラッシュに置き/.test(costStr)) cost.trash_key = true;
  // 手札からこのカードを捨てる → discardSelfFromHand（「捨てる：」終止形と「捨て、…を取り除く：」複合コストの連用形両対応）
  if (/手札からこのカードを捨て[る、]/.test(costStr)) cost.discardSelfFromHand = true;
  // 場のシグニN体をトラッシュ（フィールドから、クラス指定あり） → fieldTrash
  const ftM = costStr.match(/(?:＜([^＞]+)＞の)?シグニ([０-９\d]+)体(?:まで)?を場からトラッシュに置く/);
  const ftVerbM = !ftM ? costStr.match(/シグニを([０-９\d]+)体(?:まで)?場からトラッシュに置く/) : null;
  const ftArmWep = !ftM && !ftVerbM ? costStr.match(/＜アーム＞のシグニ[１1]体と＜ウェポン＞のシグニ[１1]体を場からトラッシュに置く/) : null;
  // 「他の…シグニを場からトラッシュ」= 効果元自身を除く（excludeSelf）。WX03-035「他の＜古代兵器＞のシグニ1体」等
  const ftOther = /他の(?:＜[^＞]+＞の)?シグニ([０-９\d]+)体(?:まで)?を場からトラッシュに置く/.test(costStr)
    || /他のシグニを([０-９\d]+)体(?:まで)?場からトラッシュに置く/.test(costStr);
  if (ftArmWep) {
    cost.fieldTrash = { count: 2 };
  } else if (ftM) {
    const ftFilter: TargetFilter = { cardType: 'シグニ' };
    if (ftM[1]) ftFilter.story = ftM[1];
    cost.fieldTrash = { count: parseNum(ftM[2]), filter: ftFilter, ...(ftOther ? { excludeSelf: true } : {}) };
  } else if (ftVerbM) {
    cost.fieldTrash = { count: parseNum(ftVerbM[1]), filter: { cardType: 'シグニ' } };
  }
  // 場のチャームN枚をトラッシュ → charmTrash
  const ctM = costStr.match(/(?:あなたの)?(?:場にある)?【チャーム】([０-９\d]+)枚をトラッシュに置く/);
  if (ctM) cost.charmTrash = parseNum(ctM[1]);
  // エナゾーンのカードをすべてトラッシュ → energyTrashAll
  if (/エナゾーンから(?:すべての)?カードをすべてトラッシュに置く|エナゾーンからすべてのカードをトラッシュに置く/.test(costStr)) {
    cost.energyTrashAll = true;
  }
  // エナゾーンから[フィルター]シグニN枚をトラッシュに置く → energyTrash（前置き形）
  const etM = !cost.energyTrashAll ? costStr.match(/エナゾーンから(?:(?:それぞれ?レベルの異なる|名前の異なる|それぞれ共通するクラスを持たない)?(?:レベル([０-９\d]+)の)?(?:＜([^＞]+)＞の)?)?シグニ([０-９\d]+)枚をトラッシュに置く/) : null;
  // エナゾーンから後置き形（「シグニN枚をエナゾーンからトラッシュに置く」）
  const etRevM = !etM && !cost.energyTrashAll ? costStr.match(/(?:(?:それぞれ?レベルの異なる)?(?:＜([^＞]+)＞の)?)?シグニ([０-９\d]+)枚をエナゾーンからトラッシュに置く/) : null;
  // エナゾーンから＜クラス＞のカードN枚をトラッシュ（カード型）
  const etCardM = !etM && !etRevM && !cost.energyTrashAll ? costStr.match(/エナゾーンから(?:＜([^＞]+)＞の)?カード([０-９\d]+)枚をトラッシュに置く/) : null;
  // エナゾーンから【keyword】を持つカードN枚をトラッシュ（キーワード型）
  const etKwM = !etM && !etRevM && !etCardM && !cost.energyTrashAll ? costStr.match(/エナゾーンから【([^】]+)】を持つカード([０-９\d]+)枚をトラッシュに置く/) : null;
  if (etM) {
    const etFilter: TargetFilter = { cardType: 'シグニ' };
    if (etM[1]) etFilter.level = parseNum(etM[1]);
    if (etM[2]) etFilter.story = etM[2];
    cost.energyTrash = { count: parseNum(etM[3]), filter: etFilter };
  } else if (etRevM) {
    const etRFilter: TargetFilter = { cardType: 'シグニ' };
    if (etRevM[1]) etRFilter.story = etRevM[1];
    cost.energyTrash = { count: parseNum(etRevM[2]), filter: etRFilter };
  } else if (etCardM) {
    const etCFilter: TargetFilter = {};
    if (etCardM[1]) etCFilter.story = etCardM[1];
    cost.energyTrash = { count: parseNum(etCardM[2]), filter: Object.keys(etCFilter).length ? etCFilter : undefined };
  } else if (etKwM) {
    cost.energyTrash = { count: parseNum(etKwM[2]), filter: { keyword: etKwM[1] } };
  }
  // エナゾーンから[フィルター]シグニを1枚以上トラッシュ（可変枚数）
  if (!cost.energyTrash && !cost.energyTrashAll) {
    const etVarM = costStr.match(/エナゾーンから(?:＜([^＞]+)＞の)?シグニを([０-９\d]+)枚以上トラッシュに置く/);
    if (etVarM) {
      const etVFilter: TargetFilter = { cardType: 'シグニ' };
      if (etVarM[1]) etVFilter.story = etVarM[1];
      cost.energyTrash = { count: parseNum(etVarM[2]), filter: etVFilter };
    }
  }
  // エナゾーンから《keyword》のカードN枚をトラッシュ（アイコン型）
  if (!cost.energyTrash && !cost.energyTrashAll) {
    const etIconM = costStr.match(/エナゾーンから《([^》]+)》のカード([０-９\d]+)枚をトラッシュに置く/);
    if (etIconM) cost.energyTrash = { count: parseNum(etIconM[2]), filter: { keyword: etIconM[1] } };
  }
  // 手札から[フィルター]カードN枚を捨てる（シグニ以外の汎用手札捨て）
  if (!cost.handDiscardSigni && !cost.discardSelfFromHand && !cost.discard && !cost.discardVariable) {
    const hcColorCardM = costStr.match(/手札から([白赤青緑黒])のカードを([０-９\d]+)枚捨てる/);
    const hcCardM = !hcColorCardM ? costStr.match(/手札から(?:＜([^＞]+)＞の)?カードを?([０-９\d]+)枚捨てる/) : null;
    const hcSpellM = !hcColorCardM && !hcCardM ? costStr.match(/手札からスペルを([０-９\d]+)枚捨てる/) : null;
    const hcVarSigniM = !hcColorCardM && !hcCardM && !hcSpellM ? costStr.match(/手札から(?:＜([^＞]+)＞の)?シグニを([０-９\d]+)枚以上捨てる/) : null;
    const hcLvSigniM = !hcColorCardM && !hcCardM && !hcSpellM && !hcVarSigniM ? costStr.match(/手札からレベル([０-９\d]+)のシグニを([０-９\d]+)枚捨てる/) : null;
    if (hcColorCardM) {
      cost.discard = parseNum(hcColorCardM[2]);
      cost.discardFilter = { color: hcColorCardM[1] };
    } else if (hcCardM) {
      const hcFilter: TargetFilter = {};
      if (hcCardM[1]) hcFilter.story = hcCardM[1];
      cost.discard = parseNum(hcCardM[2]);
      if (Object.keys(hcFilter).length) cost.discardFilter = hcFilter;
    } else if (hcSpellM) {
      cost.discard = parseNum(hcSpellM[1]);
      cost.discardFilter = { cardType: 'スペル' };
    } else if (hcVarSigniM) {
      const hvFilter: TargetFilter = { cardType: 'シグニ' };
      if (hcVarSigniM[1]) hvFilter.story = hcVarSigniM[1];
      cost.discardVariable = { min: parseNum(hcVarSigniM[2]), filter: hvFilter };
    } else if (hcLvSigniM) {
      cost.handDiscardSigni = { count: parseNum(hcLvSigniM[2]), level: parseNum(hcLvSigniM[1]) };
    }
  }
  // このシグニの下からカード/スペルN枚をトラッシュ → underSelfTrash
  const ustM = costStr.match(/(?:このシグニ)の下から(?:同名の)?(?:カード|スペル|シグニ)(?:を?合計)?([０-９\d]+)枚をトラッシュに置く/);
  const ustAnyM = !ustM ? costStr.match(/(?:あなたのシグニ(?:[０-９\d]+体)?)の下からカードを?合計([０-９\d]+)枚トラッシュに置く/) : null;
  if (ustM) cost.underSelfTrash = parseNum(ustM[1]);
  else if (ustAnyM) cost.underSelfTrash = parseNum(ustAnyM[1]);
  else if (/このシグニの下からカード(?:１枚|一枚)をトラッシュに置く/.test(costStr)) cost.underSelfTrash = 1;
  // 可変枚数チャームトラッシュ → charmTrashVariable
  const ctVarM = costStr.match(/【チャーム】を([０-９\d]+)枚以上トラッシュに置く/);
  if (ctVarM && !cost.charmTrash) cost.charmTrashVariable = { min: parseNum(ctVarM[1]) };
  // デッキ上からN枚トラッシュ → deckTrash
  const dtM = costStr.match(/デッキの(?:一番)?上からカードを?([０-９\d]+)枚トラッシュに置く/);
  if (dtM) cost.deckTrash = parseNum(dtM[1]);
  else if (/デッキの一番上のカードをトラッシュに置く/.test(costStr)) cost.deckTrash = 1;
  // ライフクロスをクラッシュ → life_crash
  const lcM = costStr.match(/ライフクロス([０-９\d]+)枚をクラッシュ(?:する)?/);
  if (lcM) cost.life_crash = parseNum(lcM[1]);
  else if (/ライフクロス[１1]枚をクラッシュ/.test(costStr)) cost.life_crash = 1;
  // トラッシュにあるカードをゲームから除外するコスト → trashExile
  if (costStr.match(/トラッシュにあるこのカードをゲームから除外する/)) {
    cost.trashExile = { self: true };
  } else {
    const teNamedM = costStr.match(/トラッシュにある《([^》]+)》([０-９\d]+)枚をゲームから除外する/);
    const teGenericM = !teNamedM ? costStr.match(/トラッシュにあるカード([０-９\d]+)枚をゲームから除外する/) : null;
    if (teNamedM) cost.trashExile = { count: parseNum(teNamedM[2]), filter: { cardName: teNamedM[1] } };
    else if (teGenericM) cost.trashExile = { count: parseNum(teGenericM[1]) };
  }
  // コストとしてシグニをバニッシュ → fieldTrash で近似
  if (!cost.fieldTrash) {
    const banishCostM = costStr.match(/レベル([０-９\d]+)以下の(?:＜([^＞]+)＞の)?シグニ([０-９\d]+)体をバニッシュする/);
    if (banishCostM) {
      const bcFilter: TargetFilter = { cardType: 'シグニ', level: { max: parseNum(banishCostM[1]) } as TargetFilter['level'] };
      if (banishCostM[2]) bcFilter.story = banishCostM[2];
      cost.fieldTrash = { count: parseNum(banishCostM[3]), filter: bcFilter };
    }
  }
  // アップ状態のルリグN体をダウン → lrigDown
  if (!cost.lrigDown) {
    const ldM = costStr.match(/アップ状態の(?:レベル([０-９\d]+)の)?(?:センター)?ルリグ([０-９\d]+)体をダウンする/);
    if (ldM) cost.lrigDown = { count: parseNum(ldM[2]) };
  }
  // アップ状態のシグニN体をダウン → fieldDown
  if (!cost.fieldDown) {
    const fdM = costStr.match(/アップ状態の(?:(?:他の)?(?:レベル([０-９\d]+)(?:以下)?の)?(?:＜([^＞]+)＞の)?)?(?:他の)?シグニ([０-９\d]+)体をダウンする/);
    if (fdM) {
      const fdFilter: TargetFilter = { cardType: 'シグニ', isUp: true };
      if (fdM[1]) fdFilter.level = { max: parseNum(fdM[1]) } as TargetFilter['level'];
      if (fdM[2]) fdFilter.story = fdM[2];
      cost.fieldDown = { count: parseNum(fdM[3]), filter: fdFilter };
    }
  }
  // 手札をすべて捨てる → discardAll
  if (!cost.discard && !cost.discardFilter && !cost.discardAll) {
    if (/手札をすべて捨てる/.test(costStr)) cost.discardAll = true;
  }
  // 手札をN枚まで捨てる → discardUpTo
  if (!cost.discard && !cost.discardAll && !cost.discardUpTo) {
    const discardUpToM = costStr.match(/手札を([０-９\d]+)枚まで捨てる/);
    if (discardUpToM) cost.discardUpTo = parseNum(discardUpToM[1]);
  }
  // 手札をN枚デッキの一番下に置く → handBottomDeck
  if (!cost.handBottomDeck) {
    const hbdM = costStr.match(/手札を([０-９\d]+)枚デッキの一番下に置く/);
    if (hbdM) cost.handBottomDeck = parseNum(hbdM[1]);
  }
  // エナゾーンにあるすべてのカードをトラッシュに置き、手札をすべて捨てる → combined
  if (/エナゾーンにあるすべてのカードをトラッシュに置き(?:、)?手札をすべて捨てる/.test(costStr)) {
    cost.energyTrashAll = true;
    cost.discardAll = true;
  }
  // ルリグデッキから[色]のアーツN枚をルリグトラッシュ → trashArtsFromLrigDeck（色指定は任意）
  if (!cost.trashArtsFromLrigDeck) {
    const tArtM = costStr.match(/ルリグデッキから(?:(白|赤|青|緑|黒|無)の)?アーツ([０-９\d]+)枚をルリグトラッシュに置く/);
    if (tArtM) cost.trashArtsFromLrigDeck = { count: parseNum(tArtM[2]), ...(tArtM[1] ? { color: tArtM[1] } : {}) };
  }
  // 手札から＜A＞と＜B＞のシグニを合計N枚捨てる → discardGroups
  if (!cost.handDiscardSigni && !cost.discardGroups) {
    const hdsAndM = costStr.match(/手札から＜([^＞]+)＞と＜([^＞]+)＞のシグニを合計([０-９\d]+)枚捨てる/);
    if (hdsAndM) {
      const perGroup = Math.floor(parseNum(hdsAndM[3]) / 2);
      cost.discardGroups = [
        { count: perGroup, filter: { cardType: 'シグニ', story: hdsAndM[1] } },
        { count: perGroup, filter: { cardType: 'シグニ', story: hdsAndM[2] } },
      ];
    }
  }
  // 手札から[色]の＜A＞のシグニN枚と[色]の＜B＞のシグニN枚を捨てる → discardGroups
  if (!cost.handDiscardSigni && !cost.discardGroups) {
    const hdsColorGroupM = costStr.match(/手札から([白赤青緑黒])の＜([^＞]+)＞のシグニ([０-９\d]+)枚と([白赤青緑黒])の＜([^＞]+)＞のシグニ([０-９\d]+)枚を捨てる/);
    if (hdsColorGroupM) {
      cost.discardGroups = [
        { count: parseNum(hdsColorGroupM[3]), filter: { cardType: 'シグニ', color: hdsColorGroupM[1], story: hdsColorGroupM[2] } },
        { count: parseNum(hdsColorGroupM[6]), filter: { cardType: 'シグニ', color: hdsColorGroupM[4], story: hdsColorGroupM[5] } },
      ];
    }
  }
  // 手札からカード名に《XXX》を含むカードをN枚捨てる → discard + discardFilter
  if (!cost.discard && !cost.discardFilter && !cost.discardGroups) {
    const hcNameM = costStr.match(/手札からカード名に《([^》]+)》を含むカードを([０-９\d]+)枚捨てる/);
    if (hcNameM) {
      cost.discard = parseNum(hcNameM[2]);
      cost.discardFilter = { cardName: hcNameM[1] };
    }
  }
  // 手札から《keyword》のカードをN枚捨てる → discard + discardFilter
  if (!cost.discard && !cost.discardFilter && !cost.discardGroups) {
    const hcKwM = costStr.match(/手札から《([^》]+)》のカードを([０-９\d]+)枚捨てる/);
    if (hcKwM) {
      cost.discard = parseNum(hcKwM[2]);
      cost.discardFilter = { keyword: hcKwM[1] };
    }
  }
  // 手札にあるこのカードをゲームから除外する → handExileSelf
  if (/手札にあるこのカードをゲームから除外する/.test(costStr)) cost.handExileSelf = true;
  // このシグニを場からデッキの一番下に置く → selfToDeckBottom
  if (/このシグニを(?:場から)?デッキの一番下に置く/.test(costStr)) cost.selfToDeckBottom = true;
  // このシグニのパワーをN減らす（コスト） → selfPowerDown
  if (!cost.selfPowerDown) {
    const spdM = costStr.match(/このシグニのパワーを([０-９\d]+)減らす/);
    if (spdM) cost.selfPowerDown = parseNum(spdM[1]);
  }
  // 場のレゾナをルリグトラッシュに置く → fieldToLrigTrash
  if (!cost.fieldToLrigTrash) {
    if (/レゾナ[１1]体を場からルリグトラッシュに置く/.test(costStr)) {
      cost.fieldToLrigTrash = { count: 1, filter: { cardType: 'レゾナ' } };
    } else {
      const fltM = costStr.match(/レゾナ([０-９\d]+)体を場からルリグトラッシュに置く/);
      if (fltM) cost.fieldToLrigTrash = { count: parseNum(fltM[1]), filter: { cardType: 'レゾナ' } };
    }
  }
  // エナゾーンからすべての[色]のカードをトラッシュ → energyTrashColorAll
  if (!cost.energyTrashAll && !cost.energyTrash && !cost.energyTrashColorAll) {
    const etcaM = costStr.match(/エナゾーンからすべての([白赤青緑黒])のカードをトラッシュに置く/);
    if (etcaM) cost.energyTrashColorAll = etcaM[1];
  }
  // エナゾーンからこのカード自身をトラッシュ → energyTrashSelf
  if (/エナゾーンからこのカードをトラッシュに置く/.test(costStr)) cost.energyTrashSelf = true;
  // あなたのシグニの下からカード1枚をトラッシュに置く → underSelfTrash (任意シグニ)
  if (!cost.underSelfTrash) {
    if (/あなたのシグニの下からカード[１1]枚をトラッシュに置く/.test(costStr)) cost.underSelfTrash = 1;
  }
  // あなたの【アクセ】N枚をトラッシュに置く → acceTrash
  if (!cost.acceTrash) {
    const acceM = costStr.match(/あなたの【アクセ】([０-９\d]+)枚をトラッシュに置く/);
    if (acceM) cost.acceTrash = parseNum(acceM[1]);
    else if (/あなたの【アクセ】[１1]枚をトラッシュに置く/.test(costStr)) cost.acceTrash = 1;
  }
  // この上からカウンター（【貯菌】等）Nつを取り除く → chargeCounterRemove
  if (!cost.chargeCounterRemove) {
    const ccM = costStr.match(/この上から【[^】]+】([０-９\d]+)つを取り除く/);
    if (ccM) cost.chargeCounterRemove = parseNum(ccM[1]);
    else if (/この上から【[^】]+】[１1]つを取り除く/.test(costStr)) cost.chargeCounterRemove = 1;
  }
  // あなたの【トラップ】N体/つを手札に加える（コスト） → trapToHand
  if (!cost.trapToHand) {
    const ttM = costStr.match(/あなたの【トラップ】([０-９\d]+)(?:体|つ|枚)を手札に加える/);
    if (ttM) cost.trapToHand = parseNum(ttM[1]);
    else if (/あなたの【トラップ】[１1](?:体|つ|枚)を手札に加える/.test(costStr)) cost.trapToHand = 1;
  }
  // エナゾーンからレベルN1～N2の＜クラス＞のシグニを1枚ずつトラッシュ → energyTrash拡張
  if (!cost.energyTrash && !cost.energyTrashAll) {
    const etLvRangeM = costStr.match(/エナゾーンからレベル([０-９\d]+)～([０-９\d]+)の＜([^＞]+)＞のシグニを([０-９\d]+)枚ずつトラッシュに置く/);
    if (etLvRangeM) {
      const minLv = parseNum(etLvRangeM[1]);
      const maxLv = parseNum(etLvRangeM[2]);
      cost.energyTrash = { count: maxLv - minLv + 1, filter: { cardType: 'シグニ', story: etLvRangeM[3], levelRange: { min: minLv, max: maxLv } } };
    }
  }
  // エナゾーンからそれぞれ名前の異なる、カード名に《XXX》を含むシグニN枚をトラッシュ → energyTrash
  if (!cost.energyTrash && !cost.energyTrashAll) {
    const etDistinctM = costStr.match(/エナゾーンからそれぞれ名前の異なる、カード名に《([^》]+)》を含む(?:シグニ|カード)([０-９\d]+)枚をトラッシュに置く/);
    if (etDistinctM) {
      cost.energyTrash = { count: parseNum(etDistinctM[2]), filter: { cardName: etDistinctM[1] } };
    }
  }
  // 手札とエナゾーンとトラッシュにある《XXX》をN枚ずつゲームから除外する → trashExile で近似
  if (!cost.trashExile) {
    const multiExileM = costStr.match(/手札とエナゾーンとトラッシュにある《([^》]+)》を([０-９\d]+)枚ずつゲームから除外する/);
    if (multiExileM) {
      cost.trashExile = { count: parseNum(multiExileM[2]), filter: { cardName: multiExileM[1] } };
    }
  }
  // 【トラップ】であるこのカードを公開するコスト → none（特殊コスト）
  if (/【トラップ】であるこのカードを公開する/.test(costStr)) cost.none = true;
  // コラボコスト → none（ゲーム実装外コスト）
  if (/コラボライバー/.test(costStr)) cost.none = true;
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

  // パターン2a: 「あなたの場に《X》(か《Y》)*があるかぎり、」（複数カード名のいずれか存在。WX08-049「《羅星　アルシャ》か《羅星　ディアデム》」）
  // 単一名は cardName、複数名は cardNames に解決。下のパターン2は単一《》/＜＞のみなので、複数《》はここで先取りする。
  const fieldNamesM = text.match(/^あなたの場に((?:《[^》]+》(?:か)?)+)があるかぎり、/);
  if (fieldNamesM && fieldNamesM[1].includes('か《')) {
    const names = [...fieldNamesM[1].matchAll(/《([^》]+)》/g)].map(m => m[1]);
    return {
      condition: { type: 'HAS_CARD_IN_FIELD', owner: 'self', filter: { cardNames: names } },
      rest: text.slice(fieldNamesM[0].length),
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

  // パターン3b2: 「あなたの場にそれぞれ名前の異なる＜X＞のシグニがN体あるかぎり、」（名前相違N種条件）
  const fieldDistinctCountM = text.match(/^あなたの場にそれぞれ名前の異なる((?:＜[^＞]+＞(?:か)?)+)のシグニが([０-９\d]+)体あるかぎり、/);
  if (fieldDistinctCountM) {
    const storyFilter = parseStoryFilter(fieldDistinctCountM[1]);
    return {
      condition: { type: 'HAS_CARD_IN_FIELD', owner: 'self', filter: { cardType: 'シグニ', ...storyFilter }, minCount: parseNum(fieldDistinctCountM[2]), distinctNames: true },
      rest: text.slice(fieldDistinctCountM[0].length),
      conditionFound: true,
    };
  }

  // パターン3b: 「あなたの場に〜クラスのシグニが(合計)?N体あるかぎり、」（クラス数体条件 / ＜X＞か＜Y＞の合計指定を含む）
  const fieldClassCountM = text.match(/^あなたの場に(?:他の)?((?:＜[^＞]+＞(?:か)?)+)のシグニが(?:合計)?([０-９\d]+)体あるかぎり、/);
  if (fieldClassCountM) {
    const storyFilter = parseStoryFilter(fieldClassCountM[1]);
    return {
      condition: { type: 'HAS_CARD_IN_FIELD', owner: 'self', filter: { cardType: 'シグニ', ...storyFilter }, minCount: parseNum(fieldClassCountM[2]) },
      rest: text.slice(fieldClassCountM[0].length),
      conditionFound: true,
    };
  }

  // パターン3c: 「あなたの場にレベルNの＜X＞のシグニがあるかぎり、」（レベル＋クラス条件）
  const fieldLevelStoryM = text.match(/^あなたの場にレベル([０-９\d]+)の((?:＜[^＞]+＞(?:か)?)+)のシグニがあるかぎり、/);
  if (fieldLevelStoryM) {
    const storyFilter = parseStoryFilter(fieldLevelStoryM[2]);
    return {
      condition: { type: 'HAS_CARD_IN_FIELD', owner: 'self', filter: { cardType: 'シグニ', level: parseNum(fieldLevelStoryM[1]), ...storyFilter } },
      rest: text.slice(fieldLevelStoryM[0].length),
      conditionFound: true,
    };
  }

  // 「あなたの場に《ライズアイコン》を持つシグニが3体あるかぎり、」
  // ＝ライズアイコン持ちシグニ3体の条件（WXEX1-35）。別枚数の既存カードは今回の採用対象に混ぜない。
  const fieldRiseCountM = text.match(/^(?:このシグニは)?あなたの場に《ライズアイコン》を持つシグニが[３3]体あるかぎり、/);
  if (fieldRiseCountM) {
    return {
      condition: { type: 'HAS_CARD_IN_FIELD', owner: 'self', filter: { cardType: 'シグニ', hasRiseIcon: true }, minCount: 3 },
      rest: text.slice(fieldRiseCountM[0].length),
      conditionFound: true,
    };
  }

  // パターン3d: 「対戦相手の場にシグニが(合計)?N体あるかぎり、」（相手シグニ数体条件。G075）
  const oppFieldSigniCountM = text.match(/^対戦相手の場にシグニが(?:合計)?([０-９\d]+)体あるかぎり、/);
  if (oppFieldSigniCountM) {
    return {
      condition: { type: 'HAS_CARD_IN_FIELD', owner: 'opponent', filter: { cardType: 'シグニ' }, minCount: parseNum(oppFieldSigniCountM[1]) },
      rest: text.slice(oppFieldSigniCountM[0].length),
      conditionFound: true,
    };
  }

  // パターン3e: 「対戦相手の場にパワーN以上のシグニがあるかぎり、」（相手シグニのパワー条件。G076）
  const oppFieldPowerM = text.match(/^対戦相手の場にパワー([０-９\d]+)以上のシグニがあるかぎり、/);
  if (oppFieldPowerM) {
    return {
      condition: { type: 'HAS_CARD_IN_FIELD', owner: 'opponent', filter: { cardType: 'シグニ', powerRange: { min: parseNum(oppFieldPowerM[1]) } } },
      rest: text.slice(oppFieldPowerM[0].length),
      conditionFound: true,
    };
  }

  // パターン3g: 「あなたのトラッシュに＜X＞(か＜Y＞)*のシグニがN枚以上あるかぎり、」（トラッシュのクラス指定枚数条件。G090）
  const trashStoryCountM = text.match(/^あなたのトラッシュに((?:＜[^＞]+＞(?:か)?)+)のシグニが([０-９\d]+)枚以上あるかぎり、/);
  if (trashStoryCountM) {
    const storyFilter = parseStoryFilter(trashStoryCountM[1]);
    return {
      condition: { type: 'TRASH_HAS_CARD', owner: 'self', filter: { cardType: 'シグニ', ...storyFilter }, minCount: parseNum(trashStoryCountM[2]) },
      rest: text.slice(trashStoryCountM[0].length),
      conditionFound: true,
    };
  }

  // パターン3i: 「このターンにシグニが場から手札に戻っていた場合、」（このターンのシグニ手札戻り条件。G087）
  if (text.startsWith('このターンにシグニが場から手札に戻っていた場合、')) {
    return {
      condition: { type: 'SIGNI_RETURNED_TO_HAND_THIS_TURN', owner: 'self' } as ActiveCondition,
      rest: text.slice('このターンにシグニが場から手札に戻っていた場合、'.length),
      conditionFound: true,
    };
  }

  // パターン3h: 「このターンにあなたが手札をN枚以上捨てていた場合、」（このターンの手札捨て枚数条件。G088）
  const turnDiscardM = text.match(/^このターンにあなたが手札を([０-９\d]+)枚以上捨てていた場合、/);
  if (turnDiscardM) {
    return {
      condition: { type: 'TURN_HAND_DISCARD_GTE', value: parseNum(turnDiscardM[1]) } as ActiveCondition,
      rest: text.slice(turnDiscardM[0].length),
      conditionFound: true,
    };
  }

  // パターン3f: 「このシグニがアクセされているかぎり、」「このシグニに【アクセ】が付いているかぎり、」（自身にアクセが付いている条件。G078／WXK04-080）
  for (const accePhrase of ['このシグニがアクセされているかぎり、', 'このシグニに【アクセ】が付いているかぎり、']) {
    if (text.startsWith(accePhrase)) {
      return {
        condition: { type: 'IS_SELF_ACCED' } as ActiveCondition,
        rest: text.slice(accePhrase.length),
        conditionFound: true,
      };
    }
  }

  // パターン3f2: 「あなたの登録者数がN万人を達成しているかぎり、」（登録者数条件。WXK08-061/064）
  const subscriberM = text.match(/^あなたの登録者数が([０-９\d]+)万人を達成しているかぎり、/);
  if (subscriberM) {
    return {
      condition: { type: 'SUBSCRIBER_COUNT', operator: 'gte', value: parseNum(subscriberM[1]) } as ActiveCondition,
      rest: text.slice(subscriberM[0].length),
      conditionFound: true,
    };
  }

  // パターン3z: 「あなたの場に[色][＜クラス＞]のシグニが(N体)?あるかぎり、」（色/クラス指定の存在条件。WX03-038「赤のシグニがあるかぎり」）
  // 上の story/count/level 専用パターンに当たらない素の色・クラス存在条件を拾う（従来はキャッチオールで condition=undefined に落ちていた）。
  const fieldColorStoryM = text.match(/^あなたの場に((?:[白赤青緑黒]の|＜[^＞]+＞(?:か)?)+)シグニが(?:([０-９\d]+)体)?あるかぎり、/);
  if (fieldColorStoryM) {
    const sub = fieldColorStoryM[1];
    const filter: TargetFilter = { cardType: 'シグニ', ...parseColorFilter(sub), ...parseStoryFilter(sub) };
    return {
      condition: { type: 'HAS_CARD_IN_FIELD', owner: 'self', filter, ...(fieldColorStoryM[2] ? { minCount: parseNum(fieldColorStoryM[2]) } : {}) },
      rest: text.slice(fieldColorStoryM[0].length),
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

  // パターン4a2: 「あなたのルリグトラッシュに〔アーツ/スペル/シグニ/カード〕が(N枚以上)?あるかぎり、」（ルリグトラッシュ枚数条件。WDK03-015/WXK01-098）
  const lrigTrashM = text.match(/^あなたのルリグトラッシュに(アーツ|スペル|シグニ|カード)が(?:([０-９\d]+)枚以上)?あるかぎり、/);
  if (lrigTrashM) {
    const noun = lrigTrashM[1];
    return {
      condition: { type: 'LRIG_TRASH_COUNT', ...(noun !== 'カード' ? { cardType: noun as CardTypeFilter } : {}), operator: 'gte', value: lrigTrashM[2] ? parseNum(lrigTrashM[2]) : 1 },
      rest: text.slice(lrigTrashM[0].length),
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

  // パターン5a1: 「あなたのエナゾーンにあるカードが持つ色がN種類以上あるかぎり、」（無色は数えない。G070）
  const enaColorTypesM = text.match(/^あなたのエナゾーンにあるカードが持つ色が([０-９\d]+)種類(以上|以下)?あるかぎり、/);
  if (enaColorTypesM) {
    const op: CompareOp = enaColorTypesM[2] === '以下' ? 'lte' : 'gte';
    return {
      condition: { type: 'ENERGY_COLOR_TYPES', owner: 'self', operator: op, value: parseNum(enaColorTypesM[1]) },
      rest: text.slice(enaColorTypesM[0].length),
      conditionFound: true,
    };
  }

  // パターン5a2: 「あなたのエナゾーンに＜X＞(か＜Y＞)*のシグニが(N枚)?あるかぎり、」（クラス指定エナ存在条件。G038）
  const enaSigniM = text.match(/^あなたのエナゾーンに((?:＜[^＞]+＞(?:か)?)+)のシグニが(?:([０-９\d]+)枚以上)?あるかぎり、/);
  if (enaSigniM) {
    const storyFilter = parseStoryFilter(enaSigniM[1]);
    return {
      condition: { type: 'ENERGY_HAS_CARD', owner: 'self', filter: { cardType: 'シグニ', ...storyFilter }, ...(enaSigniM[2] ? { minCount: parseNum(enaSigniM[2]) } : {}) },
      rest: text.slice(enaSigniM[0].length),
      conditionFound: true,
    };
  }

  // パターン5a3: 「あなたのエナゾーンに<色>のカードがN枚以上あるかぎり、」（色指定エナ枚数条件。
  // WXDi-P11-046 の引用付与内側「緑のカードが３枚以上あるかぎり」＝続き77観測(b)）
  const enaColorCountM = text.match(/^あなたのエナゾーンに([白赤青緑黒])のカードが([０-９\d]+)枚以上あるかぎり、/);
  if (enaColorCountM) {
    return {
      condition: { type: 'ENERGY_HAS_CARD', owner: 'self', filter: { color: enaColorCountM[1] }, minCount: parseNum(enaColorCountM[2]) },
      rest: text.slice(enaColorCountM[0].length),
      conditionFound: true,
    };
  }

  // パターン5b: 「あなたのエナゾーンにあるカードが対戦相手よりN枚以上多いかぎり、」
  const enaDiffM = text.match(/^あなたのエナゾーンにあるカードが対戦相手より([０-９\d]+)枚以上多いかぎり、/);
  if (enaDiffM) {
    return { condition: { type: 'ENA_DIFF', operator: 'gte', value: parseNum(enaDiffM[1]) }, rest: text.slice(enaDiffM[0].length), conditionFound: true };
  }

  // パターン5c: 「あなたの手札がN枚以上/以下(である)?(ある)?かぎり、」（「以上あるかぎり」「N枚以下であるかぎり」も含む。G086）
  const handCountM = text.match(/^あなたの手札が([０-９\d]+)枚(以上あるかぎり|以下あるかぎり|以上であるかぎり|以下であるかぎり|以上かぎり|以下かぎり|あるかぎり)、/);
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

  // パターン5d2: 「(あなた|対戦相手)のライフクロスがN枚(以上|以下|)であるかぎり、」
  const lifeCountM = text.match(/^(あなた|対戦相手)のライフクロスが([０-９\d]+)枚(以上|以下)?(?:であるかぎり|かぎり)、/);
  if (lifeCountM) {
    const owner: Owner = lifeCountM[1] === 'あなた' ? 'self' : 'opponent';
    const val = parseNum(lifeCountM[2]);
    const op: CompareOp = lifeCountM[3] === '以上' ? 'gte' : lifeCountM[3] === '以下' ? 'lte' : 'eq';
    return { condition: { type: 'COUNT_THRESHOLD', location: 'life_cloth', owner, operator: op, value: val }, rest: text.slice(lifeCountM[0].length), conditionFound: true };
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

  // パターン6b: 「このシグニ{は/が}血晶武装状態であるかぎり、」
  const armorKagiriM = text.match(/^このシグニ[はが]血晶武装状態であるかぎり、/);
  if (armorKagiriM) {
    return {
      condition: { type: 'IS_SELF_ARMORED' } as ActiveCondition,
      rest: text.slice(armorKagiriM[0].length),
      conditionFound: true,
    };
  }

  // パターン6c: 「このシグニ{は/が}中央のシグニゾーンにあるかぎり、」（engine checkActiveCondition 実装済み）
  const centerKagiriM = text.match(/^このシグニ[はが]中央のシグニゾーンにあるかぎり、/);
  if (centerKagiriM) {
    return {
      condition: { type: 'IS_SELF_IN_CENTER_ZONE' } as ActiveCondition,
      rest: text.slice(centerKagiriM[0].length),
      conditionFound: true,
    };
  }

  // パターン6d: 「このシグニ{は/が}覚醒状態であるかぎり、」（engine checkActiveCondition 実装済み）
  const awakenKagiriM = text.match(/^このシグニ[はが]覚醒状態であるかぎり、/);
  if (awakenKagiriM) {
    return {
      condition: { type: 'IS_SELF_AWAKENED' } as ActiveCondition,
      rest: text.slice(awakenKagiriM[0].length),
      conditionFound: true,
    };
  }

  // パターン6e: 複合条件「あなたのセンタールリグが<色>で、このシグニ{は/が}{中央のシグニゾーンにある|覚醒状態である}かぎり、」
  //   → AND[LRIG_COLOR, IS_SELF_IN_CENTER_ZONE|IS_SELF_AWAKENED]（WX06-032/035/WX15-054 等・引用付与の外側条件。
  //   engine checkActiveCondition は AND / LRIG_COLOR 実装済み）。generic フォールバック（下）に飲まれると条件脱落＝
  //   無条件付与の過剰効果になるため、その前に複合を捕捉する。part2 が既知の自己状態のときのみ AND 化。
  const compoundLrigColorM = text.match(/^あなたのセンタールリグが([白赤青緑黒])で、このシグニ[はが](中央のシグニゾーンにある|覚醒状態である)かぎり、/);
  if (compoundLrigColorM) {
    const inner: ActiveCondition = compoundLrigColorM[2].startsWith('中央')
      ? { type: 'IS_SELF_IN_CENTER_ZONE' }
      : { type: 'IS_SELF_AWAKENED' };
    return {
      condition: { type: 'AND', conditions: [{ type: 'LRIG_COLOR', owner: 'self', color: compoundLrigColorM[1] }, inner] } as ActiveCondition,
      rest: text.slice(compoundLrigColorM[0].length),
      conditionFound: true,
    };
  }

  // それ以外の「〜かぎり、」パターン（複雑な条件→未解析、句点を越えない）
  // ⚠引用「」も越えない＝引用内の「…かぎり、」は付与能力側の条件であり、跨いで消費すると
  //   引用前の本文（「パワーは＋3000され、このシグニは」等）まで無言消失する（WXDi-P11-046＝続き77観測(b)）
  const genericKagiriM = text.match(/^[^。「」]+かぎり、/);
  if (genericKagiriM && genericKagiriM[0].length < 60) {
    return { condition: undefined, rest: text.slice(genericKagiriM[0].length), conditionFound: true, isTimingMarker: true };
  }

  return { condition: undefined, rest: text, conditionFound: false };
}

// ── 無言フォールバックの刻印（PLAN §5c 死角(d)対応・2026-07-07） ──
// parser が「原文の条件/ステップを黙って落とす近似」を行った箇所で markSilentFallback(理由) を呼ぶ。
// 効果1件のトップレベル action パース直後に consumeSilentFallbacks() で回収し、parseStatus 'AUTO' を
// 'PARTIAL' へ降格＋計器ログへ記録する（build:effects が docs/_partial_report.txt に書き出す）。
// ⚠意図的な慣例エンコードは刻印しない：「そうした場合、」の常時true IS_MY_TURN（§9-9・engine特別処理あり）・
// 「代わりに」REPLACEモード・OPPONENT_PAY_OPTIONAL の else ラップ・「あなたのターンの間」正抽出。
let _silentFallbacks: string[] = [];
function markSilentFallback(reason: string): void { _silentFallbacks.push(reason); }
function consumeSilentFallbacks(): string[] {
  if (_silentFallbacks.length === 0) return [];
  const v = _silentFallbacks;
  _silentFallbacks = [];
  return v;
}
export interface SilentFallbackEntry { effectId: string; reasons: string[] }
const _silentFallbackLog: SilentFallbackEntry[] = [];
export function getSilentFallbackLog(): readonly SilentFallbackEntry[] { return _silentFallbackLog; }

// ── timing フォールバック計器（続き75で新設）──
// 【自】ブロックで timing 判定が**全て外れて** ON_PLAY へ落ちた効果を記録する。原文に「…したとき」がある
// のに ON_PLAY になったなら、それは「場に出たとき」ではない別トリガーの取りこぼし＝**parser の timing 語彙欠落**。
// この穴で ON_SIGNI_BANISH_OPPONENT（「バトルによってバニッシュしたとき」）の31枚が「召喚しただけで発火する」
// 幻覚になっていた（続き75で是正）。⚠parseStatus は変えない（純粋な観測計器）。集計は `npm run census:timing`。
export interface TimingFallbackEntry { effectId: string; text: string }
const _timingFallbackLog: TimingFallbackEntry[] = [];
export function getTimingFallbackLog(): readonly TimingFallbackEntry[] { return _timingFallbackLog; }
function logTimingFallback(effectId: string, text: string): void {
  if (_timingFallbackLog.length < 100000) _timingFallbackLog.push({ effectId, text });
}
function logSilentFallbacks(effectId: string, reasons: string[]): void {
  // 実行時アプリでも parser が呼ばれうるため、ログは上限付き（計器用途は build:effects 内で完結する）
  if (reasons.length > 0 && _silentFallbackLog.length < 100000) _silentFallbackLog.push({ effectId, reasons });
}

// ── 原文ブロック対応表（続き109で新設・語彙センサスの効果単位化の基盤）──
// parseCardEffects が effectId ごとに「どの原文ブロックから作られたか」を記録する。
// 語彙センサス（vocabCensus.ts）はカード単位判定＝「同カード別効果に語彙があれば合格」という
// 粗い網だったため、効果Aの原文修飾句を効果BのJSON語彙で救ってしまっていた（死角(b)）。
// この対応表があれば「原文ブロック × その効果のJSON」だけで突き合わせできる＝効果単位の厳密判定。
// ⚠計器専用。既定は無効（実行時アプリでもparserは呼ばれるためメモリを食わせない）。
// build:effects が enableSourceTextLog() で有効化し、getSourceTextLog() で回収する。
const _sourceTextLog = new Map<string, string>();
let _collectSourceText = false;
export function enableSourceTextLog(): void { _collectSourceText = true; _sourceTextLog.clear(); }
export function getSourceTextLog(): ReadonlyMap<string, string> { return _sourceTextLog; }
function logSourceText(effectId: string | undefined, text: string): void {
  if (!_collectSourceText || !effectId) return;
  // 同一 effectId が複数ブロック由来になることは無いが、後勝ちで上書きせず初出を残す
  if (!_sourceTextLog.has(effectId)) _sourceTextLog.set(effectId, text.trim());
}

// 「この方法で…トラッシュに置かれた場合、」の条件文を解析する。
// 該当しない場合は null（呼び出し側で IS_MY_TURN にフォールバック）。
// prevIsDeckMill: 直前ステップが「デッキの上からトラッシュ（TRASH DECK_CARD）」か。
//   トラッシュ枚数/クラス系の条件は lastProcessedCards（＝デッキミル結果）に依存するため、
//   前段が deck-mill のときだけ抽出する。search-trash / under-signi-trash / energy-trash /
//   life-crash / optional-cost などが前段の場合は IS_MY_TURN のまま据置（curated と乖離させない・§5c）。
function parseThisWayTrashCondition(clause: string, prevIsDeckMill = true): Condition | null {
  if (prevIsDeckMill) {
    // この方法で（それぞれ）レベルの異なるシグニがN体/N枚トラッシュに置かれた場合（WX03-015・WXK03-025）
    const dl = clause.match(/この方法で.*?レベルの異なるシグニが?([０-９\d]+)(?:体|枚)が?.*?トラッシュに置かれた場合/);
    if (dl) return { type: 'TRASHED_DISTINCT_LEVELS_GTE', count: parseNum(dl[1]) };
    // この方法でN体の＜X＞のシグニがトラッシュに置かれた場合（WX03-021）
    const sc = clause.match(/この方法で([０-９\d]+)体の?＜([^＞]+)＞のシグニ.*?トラッシュに置かれた場合/);
    if (sc) return { type: 'TRASHED_STORY_COUNT_GTE', story: sc[2], count: parseNum(sc[1]) };
    // この方法で＜X＞のシグニがN枚(以上)/N枚がトラッシュに置かれた場合（語順違い・WX20-075/WD08-015/WX24-P3-075/WXDi-CP01-045）
    const sc2 = clause.match(/この方法で(?:あなたのデッキから)?＜([^＞]+)＞のシグニ(?:が([０-９\d]+)枚(?:以上)?|([０-９\d]+)枚(?:以上)?が)トラッシュに置かれた場合/);
    if (sc2) return { type: 'TRASHED_STORY_COUNT_GTE', story: sc2[1], count: parseNum(sc2[2] ?? sc2[3]) };
    // この方法で＜X＞のシグニ（が）トラッシュに置かれた場合（枚数指定なし＝1枚以上・WXDi-P10-071）
    const sc3 = clause.match(/この方法で(?:あなたのデッキから)?＜([^＞]+)＞のシグニ(?:が)?トラッシュに置かれた場合/);
    if (sc3) return { type: 'TRASHED_STORY_COUNT_GTE', story: sc3[1], count: 1 };
    // この方法でカードをN枚(以上)トラッシュに置いた/N枚(以上)のカードが|カードがN枚(以上)トラッシュに置かれた場合
    //（プレーンなカード枚数＝MILL結果。PR-442/WX09-Re19/WXK02-063/WXDi-P11-082）
    const cc = clause.match(/この方法で(?:あなたのデッキから)?(?:カードを([０-９\d]+)枚(?:以上)?トラッシュに置いた|([０-９\d]+)枚(?:以上)?のカードがトラッシュに置かれた|カードが([０-９\d]+)枚(?:以上)?トラッシュに置かれた)場合/);
    if (cc) return { type: 'LAST_PROCESSED_COUNT_GTE', value: parseNum(cc[1] ?? cc[2] ?? cc[3]) };
  }
  // 「その後、あなたの手札がN枚以下/以上の場合、」→ HAND_COUNT
  // （IS_MY_TURN フォールバック＝常時真で条件が無言で消えるのを防ぐ。WX12-020/WX21-026-BURST）
  const hc = clause.match(/あなたの手札が([０-９\d]+)枚(以上|以下)の場合/);
  if (hc) return { type: 'HAND_COUNT', owner: 'self', operator: hc[2] === '以上' ? 'gte' : 'lte', value: parseNum(hc[1]) };
  // 「その後、あなたのエナゾーンにあるカードがN枚以下/以上の場合、」→ ENERGY_COUNT（WX05-042-BURST）
  const ec = clause.match(/エナゾーンにあるカードが([０-９\d]+)枚(以上|以下)の場合/);
  if (ec) return { type: 'ENERGY_COUNT', owner: 'self', operator: ec[2] === '以上' ? 'gte' : 'lte', value: parseNum(ec[1]) };
  return null;
}

// 「（その後、）それが〔＜X＞(か＜Y＞)?の／レベルNの〕シグニの場合、」→ LAST_PROCESSED_MATCHES。
// 直前ステップが lastProcessedCards を記録する（ミル/公開/エナチャージ）ときだけ呼ぶこと（呼び出し側でゲート）。
// 「レベルが奇数の」等の表現不能フィルタは null（呼び出し側で従来挙動に据置＝IS_MY_TURN化けを増やさない）。
// prevIsEnergyPlace: 直前がエナチャージ系＝「この方法で＜X＞のシグニがエナゾーンに置かれた場合」も抽出（WXEX1-43-BURST）。
function parseLastProcessedMatchesCondition(clause: string, prevIsEnergyPlace = false): Condition | null {
  const sg = clause.match(/^(?:その後、)?(?:それが|そのカードが)(.+?)の場合、$/);
  if (sg) {
    const desc = sg[1];
    if (desc === 'シグニ') return { type: 'LAST_PROCESSED_MATCHES', filter: { cardType: 'シグニ' } };
    if (desc === 'レゾナ') return { type: 'LAST_PROCESSED_MATCHES', filter: { cardType: 'レゾナ' } };
    // 「レベルが偶数／奇数のシグニ」＝ engine matchesFilter の levelParity 対応済み（従来は表現不能で IS_MY_TURN 据置）。
    const par = desc.match(/^レベルが(偶数|奇数)のシグニ$/);
    if (par) return { type: 'LAST_PROCESSED_MATCHES', filter: { cardType: 'シグニ', levelParity: par[1] === '偶数' ? 'even' : 'odd' } };
    // 「＜X＞(か＜Y＞)?」単独（「のシグニ」なし＝カード種別を問わない story 一致。デッキ公開＜ブルアカ＞系）。
    const st = desc.match(/^＜([^＞]+)＞(?:か＜([^＞]+)＞)?$/);
    if (st) return { type: 'LAST_PROCESSED_MATCHES', filter: { story: st[2] ? [st[1], st[2]] : st[1] } };
    const sm = desc.match(/^(?:レベル[０-９\d]+(?:以上|以下)?の)?(?:《ガードアイコン》を持つ)?(?:＜[^＞]+＞(?:か＜[^＞]+＞)?の)?シグニ$/);
    if (sm) {
      const filter: TargetFilter = { cardType: 'シグニ', ...parseLevelFilter(desc), ...parseStoryFilter(desc), ...parseGuardFilter(desc) };
      if (Object.keys(filter).length > 1) return { type: 'LAST_PROCESSED_MATCHES', filter };
    }
    return null;
  }
  if (prevIsEnergyPlace) {
    const ep = clause.match(/この方法で＜([^＞]+)＞のシグニがエナゾーンに置かれた場合、$/);
    if (ep) return { type: 'LAST_PROCESSED_MATCHES', filter: { cardType: 'シグニ', story: ep[1] } };
  }
  return null;
}

// 「(その後、)この方法で〔フィルタ〕を/がN枚/体(以上) 〔lastProcessedCards を残す動詞〕た/れた場合、」→
//   LAST_PROCESSED_MATCHES{filter, minCount} / LAST_PROCESSED_COUNT_GTE（結果カウント閾値・§3 タスク12(xxii) Cluster B）。
// 前段が lastProcessedCards を記録するステップのときだけ呼ぶ（呼び出し側 prevRecords でゲート）。
// **記録することを engine 実装で確認済みの動詞に限定**＝公開(REVEAL)／トラッシュに置く(TRASH/MILL)／エナゾーンに置く
//   (ENERGY_CHARGE)／ゲームから除外(EXILE)／バニッシュ(BANISH)／デッキに戻す(TRANSFER_TO_DECK)／
//   捨てる(TRASH{HAND_CARD}＝ALL/blind/選択resume の全経路で lastProcessedCards を記録することを engine で確認済み・
//   §3 タスク12(xxii) 捨てカウントバッチ)。手札に加える(ADD_TO_HAND は SEARCH 内処理で非記録)は除外。
// 全セマンティクスを捕捉できる形に限定＝捕捉不能なフィルタ（N種類/共通クラス/偶数/レベルの異なる/名前ペア/
//   センターレベル依存）は null を返し IS_MY_TURN 据置（census が継続検出＝偽陰性を作らない）。
function parseThisWayGenericCount(clause: string): Condition | null {
  const DBG = process.env.TRACE_GC;
  if (DBG) console.error('[GC] clause=', JSON.stringify(clause));
  if (!/^(?:その後、)?この方法で/.test(clause)) { if (DBG) console.error('[GC] fail: prefix'); return null; }
  // lastProcessedCards を残すと確認済みの動詞に限定
  if (!/(?:公開|トラッシュに置|エナゾーンに置|ゲームから除外|バニッシュ|デッキに(?:加え|戻)|捨て)/.test(clause)) { if (DBG) console.error('[GC] fail: verb'); return null; }
  // 全セマンティクスを捕捉できない形は据置（誤って過剰許容の条件を作らない）。
  //   合計＝レベル総和条件（LAST_PROCESSED_LEVEL_SUM 系）／すべて＝全一致（minCount≥N では表せない）／
  //   枚数が＝ちょうどN・多分岐の枝／《…》＝アイコン/名前フィルタ（本パーサ非対応）／
  //   なかった＝否定条件（Cluster C・結果が起きなかった側＝COUNT_GTE では表せない・据置）。
  // 「レベルが偶数/奇数」は levelParity で捕捉できる（engine matchesFilter 対応済み）＝除外から外す。
  //   ただし「合計/すべて/枚数が/なかった」等の捕捉不能形は引き続き据置（誤って過剰許容の条件を作らない）。
  if (/種類|共通する|異なる|合計|すべて|枚数|センタールリグのレベル|【|《|になった|なかった/.test(clause)) return null;
  if (parseNameFilter(clause).cardName || parseNameFilter(clause).cardNames) return null; // 特定カード名指定は別機構
  // カウント（N枚/N体）。無指定は1（「＜X＞のシグニを公開した場合」＝1枚以上）。
  const cm = clause.match(/([０-９\d]+)(?:枚|体)/);
  const minCount = cm ? parseNum(cm[1]) : 1;
  const parityM = clause.match(/レベルが(偶数|奇数)/);
  const filter: TargetFilter = {
    ...parseStoryFilter(clause), ...parseLevelFilter(clause), ...parseColorFilter(clause), ...parseGuardFilter(clause),
    ...(parityM ? { levelParity: parityM[1] === '偶数' ? 'even' as const : 'odd' as const } : {}),
  };
  if (/スペル/.test(clause)) filter.cardType = 'スペル';
  else if (/シグニ/.test(clause)) filter.cardType = 'シグニ';
  if (Object.keys(filter).length === 0) return { type: 'LAST_PROCESSED_COUNT_GTE', value: minCount };
  return { type: 'LAST_PROCESSED_MATCHES', filter, minCount };
}

// 「(その後、)(この方法で…／それら…)(シグニの)?レベルの合計がN(以上/以下)?の場合、」→ LAST_PROCESSED_LEVEL_SUM。
// engine は lastProcessedCards のシグニレベル合計を operator で判定＝前段が lastProcessedCards を記録するとき
//（呼び出し側 prevRecords）だけ呼ぶ。「以上」→gte／「以下」→lte／無印→eq（ちょうどN）。§3 タスク12(xxii) 合計系。
// ⚠多分岐の2枝目以降（「レベルの合計が６の場合、」＝接頭辞なし・前段の then が lastProcessedCards を上書きしうる）は
//   誤読の恐れがあるため据置＝ここは先頭枝（この方法で/それら 付き）専用。
function parseLevelSumCondition(clause: string): Condition | null {
  const m = clause.match(/^(?:その後、)?(?:この方法で|それら).*?レベルの合計が([０-９\d]+)(以上|以下)?(?:の)?場合、?$/);
  if (!m) return null;
  const operator: CompareOp = m[2] === '以上' ? 'gte' : m[2] === '以下' ? 'lte' : 'eq';
  return { type: 'LAST_PROCESSED_LEVEL_SUM', operator, value: parseNum(m[1]) };
}

// 多分岐の後続枝：「〔レベルN(以上/以下)?/スペル/＜X＞の(シグニ)?/(色)の(シグニ)?〕の場合、X」（名詞を省略した
// elliptical 形＝「レベル２の場合、」等を含む）を、直前に処理した公開/ミル結果への LAST_PROCESSED_MATCHES 追加分岐
// として解く。**多分岐（レベル別に効果が変わる公開/ミル結果）の後続枝専用**＝呼び出し側で prevIsLpmChain
//（直前ステップが LAST_PROCESSED_MATCHES の CONDITIONAL）をゲートすること。これが無いと後続枝が条件を失った
// bare step になり無条件発火する（§3 タスク12(xxii) 多分岐＝WXDi-P13-049「レベル1→引く。レベル2→捨てさせる。…」）。
// カード属性フィルタが1つも取れない（レベルが偶数/奇数・「シグニの場合」等）や盤面語を含む desc は null（bare 据置）。
function parseBareBranchCondition(clause: string): { condition: Condition; rest: string } | null {
  const m = clause.match(/^(.+?)の場合、(.+)$/s);
  if (!m) return null;
  const desc = m[1];
  // 盤面状態・コスト・カウント語を含む desc は別種の条件＝多分岐の枝ではない（誤変換を防ぐ）。
  if (/あなた|対戦相手|場|トラッシュ|エナ|ライフ|ルリグ|手札|デッキ|この方法|そうした|支払|ベット|達成|枚|体|種類|合計/.test(desc)) return null;
  const filter: TargetFilter = {};
  const parity = desc.match(/レベルが(偶数|奇数)/);
  if (parity) filter.levelParity = parity[1] === '偶数' ? 'even' : 'odd';
  const lvAbove = desc.match(/レベル([０-９\d]+)以上/);
  const lvBelow = desc.match(/レベル([０-９\d]+)以下/);
  const lvExact = desc.match(/レベル([０-９\d]+)(?:の|$)/);
  if (lvAbove || lvBelow) filter.level = { ...(lvAbove ? { min: parseNum(lvAbove[1]) } : {}), ...(lvBelow ? { max: parseNum(lvBelow[1]) } : {}) };
  else if (lvExact) filter.level = parseNum(lvExact[1]);
  Object.assign(filter, parseStoryFilter(desc), parseColorFilter(desc), parseGuardFilter(desc));
  if (/スペル/.test(desc)) filter.cardType = 'スペル';
  else if (/シグニ/.test(desc)) filter.cardType = 'シグニ';
  const hasDisc = filter.level !== undefined || filter.levelParity !== undefined || filter.story !== undefined || filter.color !== undefined ||
    !!filter.hasGuard || !!filter.noGuard || filter.cardType === 'スペル';
  if (!hasDisc) return null;
  return { condition: { type: 'LAST_PROCESSED_MATCHES', filter }, rest: m[2] };
}

// ===== アクションパース（1文） =====


// 続き29追加分（「代わりに」B系統残バッチ・2026-07-05）。STATE_CONDITION_CLAUSES と
// parseSingleSentence の CONDITIONAL 持ち上げ CLAUSES の両方に組み込む共通テンプレ
// （engine evalCondition・decompiler 対応済みの条件型のみ）。
const STATE_CONDITION_CLAUSES_V2: Array<[RegExp, (g: string[]) => Condition]> = [
  // 「場にレベルN、レベルM、レベルKのシグニがある場合」＝各レベルのシグニがそれぞれ存在する（PR-K073）。
  [/あなたの場にレベル([０-９\d]+)、レベル([０-９\d]+)、レベル([０-９\d]+)のシグニがある場合/,
    g => ({ type: 'AND', conditions: g.map(level => ({
      type: 'HAS_CARD_IN_FIELD', owner: 'self', filter: { cardType: 'シグニ', level: parseNum(level) },
    })) })],
  // 「対戦相手の場にキーがある場合」＝key_piece にキーが存在する（WDK09〜13-008）。
  [/対戦相手の場にキーがある場合/,
    () => ({ type: 'HAS_CARD_IN_FIELD', owner: 'opponent', filter: { cardType: 'キー' } })],
  [/あなたのトラッシュに＜([^＞]+)＞のカードが([０-９\d]+)枚以上ある場合/,
    g => ({ type: 'TRASH_HAS_CARD', owner: 'self', filter: { story: g[0] }, minCount: parseNum(g[1]) })],
  [/あなたのトラッシュにレベル([０-９\d]+)のシグニが([０-９\d]+)枚以上ある場合/,
    g => ({ type: 'TRASH_HAS_CARD', owner: 'self', filter: { cardType: 'シグニ', level: parseNum(g[0]) }, minCount: parseNum(g[1]) })],
  [/あなたのトラッシュに(白|赤|青|緑|黒)のカードが([０-９\d]+)枚以上ある場合/,
    g => ({ type: 'TRASH_HAS_CARD', owner: 'self', filter: { color: g[0] }, minCount: parseNum(g[1]) })],
  [/あなたのトラッシュにカード名に《([^》]+)》を含むカードがある場合/,
    g => ({ type: 'TRASH_HAS_CARD', owner: 'self', filter: { cardName: g[0] } })],
  [/あなたの場にカード名に《([^》]+)》を含むシグニがある場合/,
    g => ({ type: 'HAS_CARD_IN_FIELD', owner: 'self', filter: { cardType: 'シグニ', cardName: g[0] } })],
  [/あなたのルリグトラッシュにカードが([０-９\d]+)枚以上ある場合/,
    g => ({ type: 'LRIG_TRASH_COUNT', operator: 'gte', value: parseNum(g[0]) })],
  [/このシグニがトラッシュから場に出(?:てい)?た場合/,
    () => ({ type: 'THIS_CARD_FROM_TRASH' })],
  [/あなたの場にレベル([０-９\d]+)以上のルリグがいる場合/,
    g => ({ type: 'HAS_CARD_IN_FIELD', owner: 'self', filter: { cardType: 'ルリグ', level: { min: parseNum(g[0]) } } })],
  // 「このターンにあなたがスペルを使用していた場合」＝actions_done の 'USE_SPELL' マーカー参照（続き110）。
  // AUTO 効果全体のゲートは hoist（parseBlock 側）が先に処理する＝ここは選択肢内条件（WX25-P2-086/105 の②）と
  // 「代わりに」置換（WX25-P2-108＝matchLeadingStateCondition 経由の per-target 値すり替え）用。
  [/このターンにあなたがスペルを使用していた場合/,
    () => ({ type: 'SPELL_USED_THIS_TURN', owner: 'self' })],
  // 「あなたの場に(色)の＜C＞のシグニがある場合」（WX25-P2-086/105 の①）／「あなたの場に＜C＞のシグニがある場合」
  // （census 条件節クラスタ6効果）＝枚数指定なしの存在ゲート。N体/他の付き変種は先行エントリが先にマッチする。
  // 「のシグニ」省略形（「あなたの場に赤の＜天使＞がある場合」）も許容する
  [/あなたの場に(白|赤|青|緑|黒)の＜([^＞]+)＞(?:のシグニ)?がある場合/,
    g => ({ type: 'HAS_CARD_IN_FIELD', owner: 'self', filter: { cardType: 'シグニ', color: g[0], story: g[1] } })],
  // ⚠文頭の楕円形「(色)の＜C＞がある場合、X」（WX22-002「赤の＜天使＞がある場合」等）は**ここに足さない**＝
  //   省略記法は直前節のゾーンを引き継ぐ文脈依存（WX22-002 は「あなたの場に」だが WXDi-P03-038 は
  //   「このシグニの下に」）で、場条件への固定エンコードは誤変換になる（続き110 で実測・撤回済み）。
  [/あなたの場に＜([^＞]+)＞のシグニがある場合/,
    g => ({ type: 'HAS_CARD_IN_FIELD', owner: 'self', filter: { cardType: 'シグニ', story: g[0] } })],
  // ── 続き156（2026-07-16）：census 条件節クラスタ残の engine 対応済み条件を追加（過剰効果是正）。
  //    いずれも execUtils.evalCondition・decompileEffects の condToText 両対応を確認済み。
  // 「このシグニのパワーがN以上の場合」＝効果元シグニのパワー閾値（SELF_POWER_GTE・gte のみ）。
  //   従来は語彙が無くアタック時/アタックフェイズ開始時/起動時に無条件発火の過剰効果（WXDi-P03-060/062・
  //   PR-470A・WXK05-043・WXK10-046 等）。「ちょうどNの場合」は engine が gte のみ＝据置（誤変換を作らない）。
  [/このシグニのパワーが([０-９\d]+)以上の場合/,
    g => ({ type: 'SELF_POWER_GTE', value: parseNum(g[0]) })],
  // 「(あなた|対戦相手)の場にパワーN以上のシグニがある場合」＝場のパワー閾値シグニ数（FIELD_SIGNI_POWER_COUNT・
  //   minPower N を1体以上）。従来は語彙が無く無条件発火（WXDi-P00-069/P05-076・WXK02-046 等）。
  [/(あなた|対戦相手)の場にパワー([０-９\d]+)以上のシグニがある場合/,
    g => ({ type: 'FIELD_SIGNI_POWER_COUNT', owner: g[0] === '対戦相手' ? 'opponent' : 'self', minPower: parseNum(g[1]), operator: 'gte', value: 1 })],
  // 「(あなた|対戦相手)の場に凍結状態のシグニがN体以上ある場合」＝場の凍結シグニ数（HAS_CARD_IN_FIELD の
  //   isFrozen 状態フィルタ＝execUtils が signi_frozen を走査・実装済）。従来は無条件発火（WXDi-P02-065/071 等）。
  [/(あなた|対戦相手)の場に凍結状態のシグニが([０-９\d]+)体以上ある場合/,
    g => ({ type: 'HAS_CARD_IN_FIELD', owner: g[0] === '対戦相手' ? 'opponent' : 'self', filter: { cardType: 'シグニ', isFrozen: true }, minCount: parseNum(g[1]) })],
  // 「対戦相手のライフクロスの枚数があなたより多い場合」＝相手ライフ>自ライフ＝自ライフ<相手ライフ（LIFE_COMPARE_OPP・
  //   cmp(自ライフ, operator, 相手ライフ) なので 'lt'）。従来は無条件発火（WX15-033/WX17-040/WX18-032 等）。
  [/対戦相手のライフクロスの枚数があなたより多い場合/,
    () => ({ type: 'LIFE_COMPARE_OPP', operator: 'lt' })],
  // 「あなたのセンタールリグと対戦相手のセンタールリグのレベルが同じ場合」＝両中央ルリグ同レベル（LRIG_LEVEL_EQ_OPP）。
  [/あなたのセンタールリグと対戦相手のセンタールリグのレベルが同じ場合/,
    () => ({ type: 'LRIG_LEVEL_EQ_OPP' })],
  // 「あなたのセンタールリグが(色)の場合」＝中央ルリグの色（LRIG_COLOR・Color.includes）。
  [/あなたのセンタールリグが(白|赤|青|緑|黒)の場合/,
    g => ({ type: 'LRIG_COLOR', owner: 'self', color: g[0] })],
  // 「(あなた|対戦相手)の場に(色)のシグニがN体以上ある場合」＝色シグニ数（HAS_CARD_IN_FIELD color minCount）。
  //   従来は無条件発火（WXDi-P05-015 赤3体／WXDi-P08-043 青3体 等）。
  [/(あなた|対戦相手)の場に(白|赤|青|緑|黒)のシグニが([０-９\d]+)体以上ある場合/,
    g => ({ type: 'HAS_CARD_IN_FIELD', owner: g[0] === '対戦相手' ? 'opponent' : 'self', filter: { cardType: 'シグニ', color: g[1] }, minCount: parseNum(g[2]) })],
  // 「あなたの場に《X》のシグニがN体(以上)ある場合」＝名前/アイコン指定シグニ数（HAS_CARD_IN_FIELD minCount）。
  //   《ディソナアイコン》は Story='Dissona'（isDisona フラグ・line 1552 慣例）＝カード名ではない。
  //   従来は無条件発火（WXDi-P13-066/068 ディソナ3体・WXDi-P12-006 ディソナ2体 等）。
  [/あなたの場に《([^》]+)》のシグニが([０-９\d]+)体(?:以上)?ある場合/,
    g => ({ type: 'HAS_CARD_IN_FIELD', owner: 'self', filter: g[0] === 'ディソナアイコン' ? { cardType: 'シグニ', isDisona: true } : { cardType: 'シグニ', cardName: g[0] }, minCount: parseNum(g[1]) })],
  // 「このシグニに【アクセ】が付いている場合」＝効果元シグニにアクセ付与（THIS_CARD_IS_ACCED）。
  //   ⚠実カードの文言は「【アクセ】が付いている」＝旧 CLAUSES の「アクセされている」regex は実文言と不一致で
  //   一度も発火せず、アタック時/ターン終了時に無条件発火の過剰効果だった（WDK07-E13/WXK04-081/083 等）。
  [/このシグニに【アクセ】が付いている場合/,
    () => ({ type: 'THIS_CARD_IS_ACCED' })],
  // 「あなたの場に《X》と《Y》がある場合」＝2枚の名前指定シグニがそれぞれ場に居る（AND・既存の色AND clause と
  //   同形＝decompiler の condToText は AND 対応済）。従来は無条件発火（WX05-033/WX08-034/WXK10-034 等）。
  [/あなたの場に《([^》]+)》と《([^》]+)》がある場合/,
    g => ({ type: 'AND', conditions: [
      { type: 'HAS_CARD_IN_FIELD', owner: 'self', filter: { cardName: g[0] } },
      { type: 'HAS_CARD_IN_FIELD', owner: 'self', filter: { cardName: g[1] } },
    ] })],
  // 「あなたの場に(色)のルリグがいる場合」＝場（センター＋アシスト）に指定色のルリグが1体以上いる
  //   （HAS_CARD_IN_FIELD が lrigZoneTops を走査・color フィルタは matchesFilter が Color.includes で判定）。
  //   ドリームチーム系（WXDi-P08-001〜005）の色別3分岐が丸ごと脱落し全枝を無条件実行していた過剰効果を是正。
  // 複合ゲート「あなたの場に(色)のルリグがいて対戦相手のセンタールリグがレベルN以上の場合」＝AND（WXDi-P08-005）。
  //   単独 color-lrig 規則より先に置く（先勝ち）。
  [/あなたの場に(白|赤|青|緑|黒)のルリグがいて対戦相手のセンタールリグがレベル([０-９\d]+)以上の場合/,
    g => ({ type: 'AND', conditions: [
      { type: 'HAS_CARD_IN_FIELD', owner: 'self', filter: { cardType: 'ルリグ', color: g[0] } },
      { type: 'LRIG_LEVEL', owner: 'opponent', operator: 'gte', value: parseNum(g[1]) },
    ] })],
  [/あなたの場に(白|赤|青|緑|黒)のルリグがいる場合/,
    g => ({ type: 'HAS_CARD_IN_FIELD', owner: 'self', filter: { cardType: 'ルリグ', color: g[0] } })],
  // 「あなたのトラッシュに《X》と《Y》がある場合」＝2枚の名前指定カードがそれぞれトラッシュに有る（AND）。
  //   従来は無条件発火（WX12-043/WX13-077/WXDi-P14-082 等）。decompiler は AND を「かつ」で描画（同型★0 維持済）。
  [/あなたのトラッシュに《([^》]+)》と《([^》]+)》がある場合/,
    g => ({ type: 'AND', conditions: [
      { type: 'TRASH_HAS_CARD', owner: 'self', filter: { cardName: g[0] } },
      { type: 'TRASH_HAS_CARD', owner: 'self', filter: { cardName: g[1] } },
    ] })],
  // 「このシグニの下にカードがある場合」＝効果元シグニの下に1枚以上（THIS_CARD_HAS_UNDER・filter 無し）。
  //   従来は無条件発火（WDK15-014/WXDi-P11-081）。
  [/このシグニの下にカードがある場合/,
    () => ({ type: 'THIS_CARD_HAS_UNDER' })],
  // ── 続き166（2026-07-16）：semantic audit Cluster A の条件節丸ごと脱落（常時発動化）を是正。
  // 「あなたの場にパワーN以上の＜C＞のシグニがある場合」＝同一シグニに power/story の積条件（WXEX1-50-E1）。
  //   AND に分けると別々のシグニで条件成立してしまうため、1つの HAS_CARD_IN_FIELD filter に積む。
  [/あなたの場にパワー([０-９\d]+)以上の＜([^＞]+)＞のシグニがある場合/,
    g => ({ type: 'HAS_CARD_IN_FIELD', owner: 'self', filter: {
      cardType: 'シグニ', story: g[1], powerRange: { min: parseNum(g[0]) },
    } })],
];

// 盤面状態の条件節（「〜の場合」）を既存 Condition 型にエンコードするテンプレ表。
// parseSingleSentence の CONDITIONAL 持ち上げと、SEQUENCE 組み立て時の「代わりに」昇格置換の
// 両方から使う（engine evalCondition・decompiler 対応済みの条件型のみ）。
const STATE_CONDITION_CLAUSES: Array<[RegExp, (g: string[]) => Condition]> = [
  [/あなたの場に《([^》]+)》が(?:い|あ)る場合/,
    g => ({ type: 'HAS_CARD_IN_FIELD', owner: 'self', filter: { cardName: g[0] } })],
  // 「このターンに対戦相手の効果によってあなたの手札／エナゾーンからカードがN枚以上トラッシュに移動していた場合」
  // ＝「代わりに」昇格置換のゲート（§3 Opusタスク10 パターンF-2）。この表は matchLeadingStateCondition が使う＝
  // ここに無いと「代わりに」が置換にならず **SEQUENCE で両方実行**される（WXDi-P02-005＝1枚引く→3枚引く＝計4枚）。
  [/このターンに対戦相手の効果によってあなたの手札からカードが([０-９\d]*)枚?以上?トラッシュに移動していた場合/,
    g => ({ type: 'HAND_TRASHED_BY_OPP', owner: 'self', operator: 'gte', value: g[0] ? parseNum(g[0]) : 1 })],
  [/このターンに対戦相手の効果によってあなたのエナゾーンからカードが([０-９\d]*)枚?以上?トラッシュに移動していた場合/,
    g => ({ type: 'ENERGY_TRASHED_BY_OPP', owner: 'self', operator: 'gte', value: g[0] ? parseNum(g[0]) : 1 })],
  [/あなたのライフクロスが([０-９\d]+)枚(以上|以下)の場合/,
    g => ({ type: 'LIFE_COUNT', owner: 'self', operator: g[1] === '以上' ? 'gte' : 'lte', value: parseNum(g[0]) })],
  // ⚠「以上/以下」が付かない**ちょうどN枚**（WD20-018②「あなたのライフクロスが０枚の場合」）が上の規則に
  //   当たらず、条件ゲートごと脱落して**無条件に自分の全シグニをトラッシュする**過剰効果になっていた
  //   （§3 Opusタスク10 パターンD）。
  [/あなたのライフクロスが([０-９\d]+)枚の場合/,
    g => ({ type: 'LIFE_COUNT', owner: 'self', operator: 'eq', value: parseNum(g[0]) })],
  [/(あなた|対戦相手)の手札が([０-９\d]+)枚(以上|以下)?の場合/,
    g => ({ type: 'HAND_COUNT', owner: g[0] === '対戦相手' ? 'opponent' : 'self', operator: g[2] === '以上' ? 'gte' : g[2] === '以下' ? 'lte' : 'eq', value: parseNum(g[1]) })],
  [/(あなた|対戦相手)のエナゾーンにカードが([０-９\d]+)枚(以上|以下)ある場合/,
    g => ({ type: 'ENERGY_COUNT', owner: g[0] === '対戦相手' ? 'opponent' : 'self', operator: g[2] === '以上' ? 'gte' : 'lte', value: parseNum(g[1]) })],
  [/あなたのトラッシュに＜([^＞]+)＞のシグニが([０-９\d]+)枚以上ある場合/,
    g => ({ type: 'TRASH_HAS_CARD', owner: 'self', filter: { cardType: 'シグニ', story: g[0] }, minCount: parseNum(g[1]) })],
  [/あなたの場に他の＜([^＞]+)＞のシグニがある場合/,
    g => ({ type: 'HAS_CARD_IN_FIELD', owner: 'self', filter: { cardType: 'シグニ', story: g[0] }, excludeSelf: true })],
  [/あなたの場に＜([^＞]+)＞のシグニが([０-９\d]+)体(?:以上)?ある場合/,
    g => ({ type: 'HAS_CARD_IN_FIELD', owner: 'self', filter: { cardType: 'シグニ', story: g[0] }, minCount: parseNum(g[1]) })],
  [/あなたの場にクロス状態のシグニがある場合/,
    () => ({ type: 'HAS_CARD_IN_FIELD', owner: 'self', filter: { cardType: 'シグニ', crossState: true } })],
  [/このシグニのパワーが([０-９\d]+)以上の場合/,
    g => ({ type: 'SELF_POWER_GTE', value: parseNum(g[0]) })],
  [/あなたのセンタールリグが＜([^＞]+)＞の場合/,
    g => ({ type: 'LRIG_STORY', owner: 'self', story: g[0] })],
  // 「あなたのセンタールリグが(色)で、あなたのライフクロスがN枚以下の場合、代わりに強化」（WX06-002〜006「五面」）
  // ＝LRIG色＋ライフ枚数の複合条件。表に無いと「代わりに」が置換にならず SEQUENCE 両実行の過剰効果になる。
  [/あなたのセンタールリグが(白|赤|青|緑|黒)で、あなたのライフクロスが([０-９\d]+)枚以下の場合/,
    g => ({ type: 'AND', conditions: [
      { type: 'LRIG_COLOR', owner: 'self', color: g[0] },
      { type: 'LIFE_COUNT', owner: 'self', operator: 'lte', value: parseNum(g[1]) },
    ] })],
  [/あなたの登録者数が([０-９\d]+)万人を達成している場合/,
    g => ({ type: 'SUBSCRIBER_COUNT', operator: 'gte', value: parseNum(g[0]) })],
  // 「あなたがベットしていた場合、代わりに＜enhanced＞」＝ベット択一（置換）。表に無いと「代わりに」が
  // 置換にならず SEQUENCE 両実行の過剰効果になる（基本効果＋強化効果を二重適用）。engine/decompiler は
  // IS_BETTING 実装済み（execUtils.evalCondition・decompileEffects）。「追加で」形は line 1460 の専用ブロックが
  // then のみ CONDITIONAL で処理するため、ここは matchLeadingStateCondition 経由の「代わりに」置換専用（§3 Opusタスク6）。
  [/あなたがベットしていた場合/,
    () => ({ type: 'IS_BETTING' })],
  // 「このターンにあなたが(色)のアーツを使用していた場合、代わりに＜enhanced＞」＝色別ARTS_USED_THIS_TURN の置換
  // （WX25-P3-116＝-3000基本／黒アーツ使用時 代わりに-5000）。効果全体の hoist（line 3210）は「代わりに」時は
  // スキップし、ここで per-target 値すり替えの置換ゲートとして拾う（engine/decompiler は color 付き実装済み・続き106）。
  [/このターンにあなたが(白|赤|青|緑|黒)のアーツを使用していた場合/,
    g => ({ type: 'ARTS_USED_THIS_TURN', owner: 'self', color: g[0] })],
  // ── 続き158（2026-07-16）：PARTIAL 刻印 IS_MY_TURN化残の盤面状態系（engine evalCondition・decompiler condJa 両対応）。
  //    従来は語彙が無く「その後、<状態条件>の場合」の条件節ごと脱落して無条件発火の過剰効果だった。
  // 「あなたの場にレゾナがある場合」＝HAS_CARD_IN_FIELD{cardType:レゾナ}（matchesFilter は Type='レゾナ' を照合。WD09/11/12-018 の「追加で」枝）。
  [/あなたの場にレゾナがある場合/,
    () => ({ type: 'HAS_CARD_IN_FIELD', owner: 'self', filter: { cardType: 'レゾナ' } })],
  // 「(あなた|対戦相手)のトラッシュにカードがN枚以上ある場合」＝TRASH_COUNT（trash.length 比較）。
  //   ⚠フィルタ付き（＜X＞のシグニ/レベル/色）は先行エントリが先にマッチする＝ここは無フィルタの総枚数専用。
  [/(あなた|対戦相手)のトラッシュにカードが([０-９\d]+)枚以上ある場合/,
    g => ({ type: 'TRASH_COUNT', owner: g[0] === '対戦相手' ? 'opponent' : 'self', operator: 'gte', value: parseNum(g[1]) })],
  // 「(あなた|対戦相手)の手札がN枚より多い場合」＝HAND_COUNT{gt}（既存 HAND_COUNT 節は「の場合」＝以上/以下/eq 専用で「より多い」を落とす。WDK08-Y08）。
  [/(あなた|対戦相手)の手札が([０-９\d]+)枚より多い場合/,
    g => ({ type: 'HAND_COUNT', owner: g[0] === '対戦相手' ? 'opponent' : 'self', operator: 'gt', value: parseNum(g[1]) })],
  // 「(あなた|対戦相手)の場にシグニがない場合」＝FIELD_COUNT{eq,0}（field.signi の非空スタック数=0。WX04-025）。
  [/(あなた|対戦相手)の場にシグニがない場合/,
    g => ({ type: 'FIELD_COUNT', owner: g[0] === '対戦相手' ? 'opponent' : 'self', operator: 'eq', value: 0 })],
  ...STATE_CONDITION_CLAUSES_V2,
];

// text 先頭が STATE_CONDITION_CLAUSES のいずれかの条件節「〜の場合、」で始まれば、その Condition と
// 残り（「、」以降）を返す。マッチしなければ null。
function matchLeadingStateCondition(text: string): { condition: Condition; rest: string } | null {
  const t = text.trim();
  for (const [re, mk] of STATE_CONDITION_CLAUSES) {
    const m = t.match(new RegExp('^' + re.source + '、(.+)$', 's'));
    if (m) return { condition: mk(m.slice(1, m.length - 1)), rest: m[m.length - 1] };
  }
  return null;
}

// CONDITIONAL 持ち上げの条件節「その後、〜の場合、」全体を STATE_CONDITION_CLAUSES で照合する
//（前段の記録に依存しない独立ゲート＝盤面状態条件。engine evalCondition 対応済みの型のみ）。
// 例：「その後、対戦相手の手札が０枚の場合、」→ HAND_COUNT(opponent,eq,0)／
//     「その後、あなたのライフクロスが１枚以下の場合、」→ LIFE_COUNT(self,lte,1)。
// これが無いと thenM 一致後に condition=null で IS_MY_TURN 化（常時真）＝条件の無言脱落になる（§3 Opusタスク12(xxii)）。
function parseHoistStateCondition(prefix: string): Condition | null {
  const t = prefix.trim().replace(/^その後、/, '').replace(/、$/, '');
  for (const [re, mk] of STATE_CONDITION_CLAUSES) {
    const m = t.match(new RegExp('^' + re.source + '$'));
    if (m) return mk(m.slice(1));
  }
  return null;
}

// 文が最上級句（「最も…パワー/レベル」）を含むとき、その文で組み立てた action の SIGNI target.filter へ
// superlative を注入する（BANISH/BOUNCE/POWER_MODIFY/GRANT_KEYWORD 等 target 経路が多岐にわたるため中央で一括）。
// parseSuperlative は「最も[大きい/高い/小さい/低い]パワー/レベル」等でのみ非nullなので誤爆しない。
function injectSuperlativeIntoSigniTargets(action: EffectAction, sup: { key: 'power' | 'level'; dir: 'max' | 'min' }): void {
  if (!action || typeof action !== 'object') return;
  const withTarget = action as unknown as { target?: { type?: string; filter?: TargetFilter } };
  if (withTarget.target?.type === 'SIGNI') {
    withTarget.target.filter = withTarget.target.filter ?? { cardType: 'シグニ' };
    if (!withTarget.target.filter.superlative) withTarget.target.filter.superlative = sup;
  }
  if (action.type === 'SEQUENCE') (action as SequenceAction).steps.forEach(s => injectSuperlativeIntoSigniTargets(s, sup));
  else if (action.type === 'CONDITIONAL') {
    const c = action as import('../types/effects').ConditionalAction;
    injectSuperlativeIntoSigniTargets(c.then, sup);
    if (c.else) injectSuperlativeIntoSigniTargets(c.else, sup);
  } else if (action.type === 'CHOOSE') {
    (action as import('../types/effects').ChooseAction).choices.forEach(ch => ch.action && injectSuperlativeIntoSigniTargets(ch.action, sup));
  }
}

// 先頭「ターン終了時まで、」で始まる文の action 内 duration/until を復元する。
// Inner の共通プレフィックス除去（`^ターン終了時まで、`）で期間句が消え、GRANT_KEYWORD 等の
// action 内 duration が PERMANENT に化けるため（WX25-P2-062 の内側 duration＝続き77 Sonnet観測(d)）、
// 句の有無を知っているこの層で PERMANENT→UNTIL_END_OF_TURN に戻す（upThen 分割の既存復元と同方式）。
function restoreLeadUntilEndOfTurn(a: EffectAction | undefined): void {
  if (!a || typeof a !== 'object') return;
  const ra = a as { type: string; until?: string; duration?: string; steps?: EffectAction[] };
  if (ra.until === 'PERMANENT') ra.until = 'UNTIL_END_OF_TURN';
  if (ra.duration === 'PERMANENT') ra.duration = 'UNTIL_END_OF_TURN';
  if (ra.type === 'SEQUENCE') ra.steps?.forEach(restoreLeadUntilEndOfTurn);
}

// 「次の対戦相手のターン終了時まで／の間」（＝次の相手ターン終了時まで）は UNTIL_OPP_TURN_END。
// 汎用パーサは substring 一致で先に「ターン終了時まで」を拾い UNTIL_END_OF_TURN に潰し（`次の対戦相手の
// ターン終了時まで` は `ターン終了時まで` を内包するため）、先頭句剥がしでは PERMANENT に化ける。engine は
// action 内 duration===UNTIL_OPP_TURN_END を長期ストア（power_mods_until_opp_turn / keyword_grants_until_opp_turn
// / granted_effects_until_opp_turn）へ振り、POWER_MODIFY/GRANT_KEYWORD/GRANT_EFFECT/GRANT_PROTECTION が対応。
// 続き148・タスク12(xxix)＝semantic audit stub群 duration系統53効果。文単位（1文＝1期間句）で処理するため、
// SEQUENCE へ合流する他文の正当な PERMANENT（別文の【常】付与等）は潰さない。付与能力の内側（abilities/rawText）
// には潜らない（内側 duration は別スコープ）。
const OPP_TURN_END_RE = /次の(?:対戦相手|相手)の?ターン(?:終了時まで|の間)/;
function upgradeToOppTurnEnd(a: EffectAction | undefined): void {
  if (!a || typeof a !== 'object') return;
  const ra = a as { type: string; until?: string; duration?: string; steps?: EffectAction[]; then?: EffectAction; else?: EffectAction; choices?: { action?: EffectAction }[] };
  // until は POWER_MODIFY_PER_* 等が EffectDuration 型で持つ。短縮 enum（END_OF_TURN/NEXT_TURN/PERMANENT）とは
  // 値が異なる（UNTIL_ 接頭辞）ので、UNTIL_END_OF_TURN のみを昇格し短縮 enum は触らない。
  if (ra.until === 'UNTIL_END_OF_TURN') ra.until = 'UNTIL_OPP_TURN_END';
  if (ra.duration === 'UNTIL_END_OF_TURN' || ra.duration === 'PERMANENT') ra.duration = 'UNTIL_OPP_TURN_END';
  // duration 未設定の POWER_MODIFY/POWER_SET は既定でターン終了クリア（temp_power_mods）。この句では長期化が要る。
  if ((ra.type === 'POWER_MODIFY' || ra.type === 'POWER_SET') && ra.duration === undefined) ra.duration = 'UNTIL_OPP_TURN_END';
  if (ra.type === 'SEQUENCE') ra.steps?.forEach(upgradeToOppTurnEnd);
  else if (ra.type === 'CONDITIONAL') { upgradeToOppTurnEnd(ra.then); upgradeToOppTurnEnd(ra.else); }
  else if (ra.type === 'CHOOSE') ra.choices?.forEach(c => upgradeToOppTurnEnd(c.action));
}

// 「（対象を）手札に加えるか場に出す」＝そのカードの行き先二択（手札 or 場）。従来 parser は
// 「手札に加える」だけを拾って「場に出す」選択肢を無言脱落させ、手札固定（TRANSFER_TO_HAND）へ
// 縮退させていた（LIFE_BURST 中心の系統バグ・85効果）。既存の hand-transfer を CHOOSE(手札/場) に
// 包み直し、source を両枝で共有する（MANUAL 正解 3枚＝WX04-038-BURST 等と同形）。
// 「デッキ上から公開し手札に加えるか場に出し」系は上流で REVEAL_AND_PICK(handOrField) に解決済みで
// この関数へ到達しないため衝突しない。
const HAND_OR_FIELD_RE = /手札に加えるか、?場に出す|場に出すか、?手札に加える/;
function wrapHandOrField(action: EffectAction, text: string): EffectAction {
  if (!HAND_OR_FIELD_RE.test(text)) return action;
  // top-level が source 付き hand-transfer のときだけ包む（複合文は個別文で個々に処理される）。
  if (action.type !== 'TRANSFER_TO_HAND' || !(action as TransferToHandAction).source) return action;
  const src = (action as TransferToHandAction).source;
  const fieldSrc = JSON.parse(JSON.stringify(src)) as EffectTarget;
  return {
    type: 'CHOOSE', choose_count: 1, from_count: 2,
    choices: [
      { choiceId: 'hand', label: '手札に加える', action },
      { choiceId: 'field', label: '場に出す', action: { type: 'ADD_TO_FIELD', owner: 'self', source: fieldSrc } as AddToFieldAction },
    ],
  } as ChooseAction;
}

function parseSingleSentence(text: string): EffectAction {
  let action = parseSingleSentenceInner(text);
  action = wrapHandOrField(action, text);
  const sup = parseSuperlative(text);
  if (sup) injectSuperlativeIntoSigniTargets(action, sup);
  const trimmed = text.trim();
  if (OPP_TURN_END_RE.test(trimmed)) upgradeToOppTurnEnd(action);
  else if (/^ターン終了時まで[、,]/.test(trimmed)) restoreLeadUntilEndOfTurn(action);
  return action;
}

function parseSingleSentenceInner(text: string): EffectAction {
  // 「対戦相手のセンタールリグより低いレベルを持つ、あなたの＜X＞のシグニN体を対象とし、…」＝相手中央ルリグの
  // レベルを基準にした動的レベルフィルタ（levelLtOppLrig）。この先頭修飾句を剥がさないと汎用ターゲット解析が
  // 「対戦相手のセンタールリグ」に釣られて対象を LRIG に誤選択し、本来の self シグニ対象と動的フィルタが丸ごと
  // 脱落する（WX19-042＝【ランサー】が自ルリグに誤付与）。剥がして残りを解析→最初の self シグニ対象へ
  // levelLtOppLrig を刻む（resolveDynamicFilter が level.max へ解決・engine 実装済み）。
  {
    const m = text.trim().match(/^対戦相手のセンタールリグより低いレベルを持つ、(.+)$/s);
    if (m) {
      const inner = parseSingleSentence(m[1]);
      let stamped = false;
      const walk = (a: EffectAction | undefined | null): void => {
        if (stamped || !a || typeof a !== 'object') return;
        const tgt = (a as { target?: { type?: string; owner?: string; filter?: Record<string, unknown> } }).target;
        if (tgt && tgt.type === 'SIGNI' && tgt.owner === 'self') {
          tgt.filter = tgt.filter ?? { cardType: 'シグニ' };
          tgt.filter.levelLtOppLrig = true;
          stamped = true;
          return;
        }
        if (a.type === 'SEQUENCE') for (const st of (a as SequenceAction).steps) { walk(st); if (stamped) return; }
        else if (a.type === 'CONDITIONAL') { const c = a as import('../types/effects').ConditionalAction; walk(c.then); if (!stamped && c.else) walk(c.else); }
      };
      walk(inner);
      if (stamped) return inner;
    }
  }
  // 「（ターン終了時まで、）この方法/効果で場に出たシグニ/レゾナは「Q」/【K】を得る／のパワーを＋N」＝直前に
  // 場出ししたカード（lastProcessedCards＝dual-pick の field ピック等）への付与。engine の targetsLastProcessed
  // 機構（GRANT_KEYWORD/POWER_MODIFY/GRANT_EFFECT で実装済＝選択UIなしで lastProcessedCards へ適用）へ振り分ける。
  // (A)単一キーワード付与・(B)パワー修整 は実装済み機構で正エンコード。(C)引用複合能力「「…」を得る」・レベル比例
  // ミル「のレベル１につき…」等は未実装機構のため honest STUB（decompiler が value=原文描画・engine no-op）に温存し、
  // 汎用パーサの誤抽出（REMOVE_ABILITIES/GRANT_KEYWORD:any/内側action漏れ）を防ぐ。§6.3。
  {
    const trimmed = text.trim();
    const m = trimmed.match(/^(?:(ターン終了時まで)、|(次の対戦相手のターン(?:終了時まで|の間))、)?この(?:方法|効果)で場に出た(?:シグニ|レゾナ)(?:[０-９\d]+体)?(は.+を得る|の(?:パワー|レベル).+)。?$/s);
    if (m) {
      const duration: EffectDuration = m[2] ? 'UNTIL_OPP_TURN_END' : 'UNTIL_END_OF_TURN';
      const body = m[3].replace(/。+$/, ''); // 末尾の句点（greedy `.+` が拾う）を落として下の完全一致 regex を安定させる
      // (A) 単一キーワード付与：「は【KEYWORD】を得る」（引用「」・入れ子（）を含む複合能力/変種キーワードは STUB へ）
      const kwM = body.match(/^は【([^】「」（）]+)】を得る$/);
      if (kwM) {
        return {
          type: 'GRANT_KEYWORD',
          target: { type: 'SIGNI', owner: 'self', count: 'ALL' },
          keyword: kwM[1],
          duration,
          targetsLastProcessed: true,
        } as GrantKeywordAction;
      }
      // (B) パワー修整：「のパワーを＋N（する）」（＋のみ。レベル比例ミル・複合「し、…」は本 regex 非一致で STUB へ）
      const pwM = body.match(/^のパワーを[＋+]([０-９\d]+)(?:する)?$/);
      if (pwM) {
        return {
          type: 'POWER_MODIFY',
          target: { type: 'SIGNI', owner: 'self', count: 'ALL', filter: { cardType: 'シグニ' } },
          delta: parseNum(pwM[1]),
          duration,
          targetsLastProcessed: true,
        } as PowerModifyAction;
      }
      // (C) レベル比例ミル：「のレベル１につき〈相手/自分〉のデッキの上からカードを１枚トラッシュに置く」＝場出しシグニ
      //     （lastProcessedCards）のレベル合計枚数だけデッキトップをトラッシュ（WX24-P3-039）。1:1 比のみ実装（他比率は STUB）。
      const millM = body.match(/^のレベル[１1]につき(対戦相手|あなた)のデッキの上からカードを[１1]枚トラッシュに置く$/);
      if (millM) {
        return { type: 'MILL', owner: millM[1] === '対戦相手' ? 'opponent' : 'self', count: 0, countIsLastProcessedLevelSum: true } as EffectAction;
      }
      // (C') 引用複合能力付与：「は「【自】…」を得る」＝場に出したシグニ（lastProcessedCards）へ引用能力を一時付与
      //      （WX24-P1-017／WX25-P3-038）。GRANT_EFFECT の rawText に載せると expandGrantEffectRawTexts が
      //      parseBlock で内側を CardEffect へ展開し（AUTO のときだけ effect に入る／失敗時は rawText 温存＝PARTIAL）、
      //      engine は既存の targetsLastProcessed 経路で granted_effects（instanceId 単位・ターン終了時失効）へ積む。
      //      ＝新規 engine 機構は不要（続き75・§3 Opusタスク1）。
      const quotedM = body.match(/^は「(.+)」を得る$/s);
      if (quotedM) {
        return {
          type: 'GRANT_EFFECT',
          target: { type: 'SIGNI', owner: 'self', count: 'ALL' },
          rawText: quotedM[1],
          duration,
          targetsLastProcessed: true,
        } as EffectAction;
      }
      // (D) 未実装機構（非1:1レベル比例等）は honest STUB に温存
      return { type: 'STUB', id: 'GRANT_TO_PLACED_SIGNI', value: trimmed } as StubAction;
    }
  }
  // 一時召喚の後始末: 「（ターン終了時、）それら?を（場から）トラッシュに置く」＝直前に出したカードを
  // ターン終了時にトラッシュ（lastProcessedCards を turn_end_field_trash_targets へ）。
  // 「それら」を全シグニ BANISH と誤解しないよう、プレフィックス除去前に検出する。
  if (/^ターン終了時、(?:それら?|そのシグニ)を(?:場から)?トラッシュに置く。?$/.test(text.trim())) {
    return { type: 'STUB', id: 'TRASH_AT_TURN_END' } as StubAction;
  }
  // 「あなたのトラッシュにカードがN枚以上/以下ある場合、〜」→ CONDITIONAL(TRASH_COUNT)
  {
    const m = text.trim().match(/^あなたのトラッシュにカードが([０-９\d]+)枚(以上|以下)ある場合、(.+)/s);
    if (m) {
      const val = parseNum(m[1]);
      const op = m[2] === '以上' ? 'gte' : 'lte';
      return {
        type: 'CONDITIONAL',
        condition: { type: 'TRASH_COUNT', owner: 'self', operator: op, value: val },
        then: parseSingleSentence(m[3]),
      } as import('../types/effects').ConditionalAction;
    }
  }
  // 「（公開した）そのカードが【ライフバースト】を持つ場合、〜」→ CONDITIONAL(LAST_PROCESSED_HAS_BURST)
  {
    const m = text.trim().match(/^(?:公開した)?そのカードが【ライフバースト】を持つ場合、(.+)/s);
    if (m) {
      return {
        type: 'CONDITIONAL',
        condition: { type: 'LAST_PROCESSED_HAS_BURST' },
        then: parseSingleSentence(m[1]),
      } as import('../types/effects').ConditionalAction;
    }
  }
  // 「この方法で〔…〕の中に〔Type〕がある場合、〜」→ CONDITIONAL(LAST_PROCESSED_HAS_TYPE)（G164 WX12-054/055）
  {
    const m = text.trim().match(/^この方法で.*?の中に(スペル|シグニ|アーツ|ルリグ)がある場合、(.+)/s);
    if (m) {
      return {
        type: 'CONDITIONAL',
        condition: { type: 'LAST_PROCESSED_HAS_TYPE', cardType: m[1] },
        then: parseSingleSentence(m[2]),
      } as import('../types/effects').ConditionalAction;
    }
  }
  // 「(その後、)それが〔色/＜C＞〕のシグニの場合、追加で〜」→ CONDITIONAL(LAST_PROCESSED_MATCHES{filter})。
  // ＝直前の対象処理アクション（DOWN/SEND_TO_ENERGY/BANISH/GRANT 等が lastProcessedCards をセット・SEQUENCE で
  //   step 間伝播・SELECT_TARGET の continuation にも伝播）で処理したカードが filter 一致なら追加効果を実行する。
  //   ⚠「追加で」を必須にして REVEAL_AND_PICK（「デッキ公開→それが〜の場合、それを手札に加える」＝filter で表現済み）
  //   と厳密に区別＝偽陽性回避。色は OR（「白か赤」）、＜C＞クラスも OR（「＜鉱石＞か＜宝石＞」）。
  {
    const m = text.trim().match(/^(?:その後、)?それが((?:[白赤青緑黒](?:か[白赤青緑黒])?)|(?:＜[^＞]+＞(?:か＜[^＞]+＞)?))の(?:シグニ|カード)の場合、追加で(.+)/s);
    if (m) {
      const sM = m[1].match(/^＜([^＞]+)＞(?:か＜([^＞]+)＞)?$/);
      const cM = m[1].match(/^([白赤青緑黒])(?:か([白赤青緑黒]))?$/);
      const filt: TargetFilter | null = sM ? { story: sM[2] ? [sM[1], sM[2]] : sM[1] }
        : cM ? { color: cM[2] ? [cM[1], cM[2]] : cM[1] } : null;
      if (filt) {
        return {
          type: 'CONDITIONAL',
          condition: { type: 'LAST_PROCESSED_MATCHES', filter: { cardType: 'シグニ', ...filt } },
          then: parseSingleSentence(m[2]),
        } as import('../types/effects').ConditionalAction;
      }
    }
  }
  // 「あなたの場に＜X＞(か＜Y＞)*のシグニがある場合、〜」→ CONDITIONAL(HAS_CARD_IN_FIELD)
  {
    const m = text.trim().match(/^(あなた|対戦相手)の場に((?:＜[^＞]+＞(?:か)?)+)のシグニがある場合、(.+)/s);
    if (m) {
      const owner: Owner = m[1] === '対戦相手' ? 'opponent' : 'self';
      return {
        type: 'CONDITIONAL',
        condition: { type: 'HAS_CARD_IN_FIELD', owner, filter: { cardType: 'シグニ', ...parseStoryFilter(m[2]) } },
        then: parseSingleSentence(m[3]),
      } as import('../types/effects').ConditionalAction;
    }
  }
  // ---- 状態条件節の CONDITIONAL 持ち上げ（2026-07-04 続き23・census文型クラスタバッチ①）----
  // 文頭または「〜対象とし、」の直後に現れる盤面状態の条件節を既存 Condition 型でエンコードする
  // （従来は語彙が無く条件丸ごと脱落＝無条件発火の過剰効果。docs/_census_clusters.txt 上位テンプレ）。
  // engine（evalCondition）・decompiler 対応済みの条件型のみ扱う。「あなたのターンの場合」は
  // engine 側 IS_MY_TURN がプレースホルダ常時真のため対象外。「場に《X》がいる」（X はルリグ名の
  // ことが多い）は execUtils/effectEngine の HAS_CARD_IN_FIELD がルリグゾーンも走査するよう対応済み
  // （2026-07-05 続き26）＝cardName フィルタで照合する。
  // ⚠2026-07-16 続き155：本ブロックを nested 関数 tryWrapLeadingStateCond に切り出し、①この位置（トリガー句が
  //   残っている text）と、②下のトリガー句除去（1668〜）後の t の**2箇所**から呼ぶ。①のプレフィックス許可リストに
  //   無いトリガー句（「ターン終了時、」等・1668 で除去される）直後の条件節は、①では拾えず 1668 除去後に②が拾う
  //   （WX12-046「ターン終了時、手札がN枚以上ある場合、…」等）。②は t 先頭がクリーン（トリガー句既除去）なので
  //   プレフィックス空でマッチする。①が return したら②へは来ない＝二重ラップしない。
  function tryWrapLeadingStateCond(text: string): EffectAction | null {
    const CLAUSES: Array<[RegExp, (g: string[]) => Condition]> = [
      [/あなたの場に《([^》]+)》が(?:い|あ)る場合/,
        g => ({ type: 'HAS_CARD_IN_FIELD', owner: 'self', filter: { cardName: g[0] } })],
      [/あなたのライフクロスが([０-９\d]+)枚(以上|以下)の場合/,
        g => ({ type: 'LIFE_COUNT', owner: 'self', operator: g[1] === '以上' ? 'gte' : 'lte', value: parseNum(g[0]) })],
      // ⚠「以上/以下」が付かない**ちょうどN枚**（WD20-018②「あなたのライフクロスが０枚の場合」）はこの表に
      //   無く、条件ゲートごと脱落して**無条件に自分の全シグニをトラッシュする**過剰効果になっていた（タスク10 パターンD）。
      [/あなたのライフクロスが([０-９\d]+)枚の場合/,
        g => ({ type: 'LIFE_COUNT', owner: 'self', operator: 'eq', value: parseNum(g[0]) })],
      // 「このターンに対戦相手の効果によってあなたの手札／エナゾーンからカードがN枚以上トラッシュに移動していた場合」
      // （WXDi-P02-005／WXDi-P07-023／SPK16-13E）。engine に状態カウンタを新設（§3 Opusタスク10 パターンF-2）。
      // ⚠これが無いと「代わりに」の置換ゲートが立たず、**SEQUENCE に化けて両方実行**される（1枚引く→3枚引く＝計4枚）。
      [/このターンに対戦相手の効果によってあなたの手札からカードが([０-９\d]*)枚?以上?トラッシュに移動していた場合/,
        g => ({ type: 'HAND_TRASHED_BY_OPP', owner: 'self', operator: 'gte', value: g[0] ? parseNum(g[0]) : 1 })],
      [/このターンに対戦相手の効果によってあなたのエナゾーンからカードが([０-９\d]*)枚?以上?トラッシュに移動していた場合/,
        g => ({ type: 'ENERGY_TRASHED_BY_OPP', owner: 'self', operator: 'gte', value: g[0] ? parseNum(g[0]) : 1 })],
      // ⚠「N枚以上ある場合」（枚+以上+ある+場合／の 無し）は census 条件節クラスタの独立テンプレ＝
      //   「の場合」固定だと "ある場合" 形（WX12-046/WXDi-P15-094/WXEX1-39 等）が未マッチで条件ごと脱落した。
      //   `(?:ある)?の?場合` で「N枚以上ある場合」「N枚以下の場合」「N枚の場合」の三形を許容する。
      [/(あなた|対戦相手)の手札が([０-９\d]+)枚(以上|以下)?(?:ある)?の?場合/,
        g => ({ type: 'HAND_COUNT', owner: g[0] === '対戦相手' ? 'opponent' : 'self', operator: g[2] === '以上' ? 'gte' : g[2] === '以下' ? 'lte' : 'eq', value: parseNum(g[1]) })],
      // 「エナゾーンにあるカードがN枚以下の場合」（にある＋の場合）も許容（WX21-064/WX24-P3-056 等）。
      [/(あなた|対戦相手)のエナゾーンに(?:ある)?カードが([０-９\d]+)枚(以上|以下)(?:ある)?の?場合/,
        g => ({ type: 'ENERGY_COUNT', owner: g[0] === '対戦相手' ? 'opponent' : 'self', operator: g[2] === '以上' ? 'gte' : 'lte', value: parseNum(g[1]) })],
      // 「あなたのトラッシュにカードがN枚以上/以下ある場合」＝トラッシュ総枚数ゲート（engine TRASH_COUNT 実装済）。
      //   ＜C＞/レベル/色付きは先行の TRASH_HAS_CARD が先にマッチする＝ここは無フィルタの総枚数のみ（WXDi-P01-079 等）。
      [/(あなた|対戦相手)のトラッシュにカードが([０-９\d]+)枚(以上|以下)ある場合/,
        g => ({ type: 'TRASH_COUNT', owner: g[0] === '対戦相手' ? 'opponent' : 'self', operator: g[2] === '以上' ? 'gte' : 'lte', value: parseNum(g[1]) })],
      [/あなたのトラッシュに＜([^＞]+)＞のシグニが([０-９\d]+)枚以上ある場合/,
        g => ({ type: 'TRASH_HAS_CARD', owner: 'self', filter: { cardType: 'シグニ', story: g[0] }, minCount: parseNum(g[1]) })],
      [/あなたの場に他の＜([^＞]+)＞のシグニがある場合/,
        g => ({ type: 'HAS_CARD_IN_FIELD', owner: 'self', filter: { cardType: 'シグニ', story: g[0] }, excludeSelf: true })],
      [/あなたの場に＜([^＞]+)＞のシグニが([０-９\d]+)体(?:以上)?ある場合/,
        g => ({ type: 'HAS_CARD_IN_FIELD', owner: 'self', filter: { cardType: 'シグニ', story: g[0] }, minCount: parseNum(g[1]) })],
      // 「あなたの場に(色)と(色)のシグニがある場合」＝両方の色のシグニがそれぞれ1体以上（同一カードの多色でも別々の2枚でも可）。
      // 従来は語彙が無くルリグアタック時に無条件発火の過剰効果（WX14-010/WX14-013/WX20-009/WX20-015/WX20-019・census 条件節クラスタ）。
      [/あなたの場に(白|赤|青|緑|黒|無色)と(白|赤|青|緑|黒|無色)のシグニがある場合/,
        g => ({ type: 'AND', conditions: [
          { type: 'HAS_CARD_IN_FIELD', owner: 'self', filter: { cardType: 'シグニ', color: g[0] } },
          { type: 'HAS_CARD_IN_FIELD', owner: 'self', filter: { cardType: 'シグニ', color: g[1] } },
        ] })],
      [/あなたの場にクロス状態のシグニがある場合/,
        () => ({ type: 'HAS_CARD_IN_FIELD', owner: 'self', filter: { cardType: 'シグニ', crossState: true } })],
      // 「あなたの場にあるすべてのシグニが＜C＞/《X》の場合、〜」＝場の全シグニ同クラス/同名ゲート
      // （engine ALL_FIELD_SIGNI_MATCH 実装済＝execUtils/effectEngine・空盤面 false）。従来は語彙が無く
      // アタックフェイズ開始時に無条件発火の過剰効果（WX25-CP1-042/WX26-CP1-048 等・census 条件節クラスタ）。
      [/あなたの場にあるすべてのシグニが＜([^＞]+)＞の場合/,
        g => ({ type: 'ALL_FIELD_SIGNI_MATCH', owner: 'self', filter: { cardType: 'シグニ', story: g[0] } })],
      // 《ディソナアイコン》は Story='Dissona'（isDisona フラグ・matchesFilter/execUtils 慣例）＝カード名ではない。
      [/あなたの場にあるすべてのシグニが《([^》]+)》の場合/,
        g => ({ type: 'ALL_FIELD_SIGNI_MATCH', owner: 'self', filter: g[0] === 'ディソナアイコン' ? { cardType: 'シグニ', isDisona: true } : { cardType: 'シグニ', cardName: g[0] } })],
      // 「このシグニが覚醒状態の場合、〜」＝効果元シグニの覚醒状態ゲート（engine THIS_CARD_IS_AWAKENED
      // 実装済＝execUtils.ts・awakened_signi 参照）。従来は語彙が無くアタックフェイズ開始時に無条件発火の
      // 過剰効果（PR-Di038/039・WXDi-P14-045/047/049）。「代わりに」置換の WX25-P2-078 は rest ガードで除外。
      [/このシグニが覚醒状態の場合/,
        () => ({ type: 'THIS_CARD_IS_AWAKENED' })],
      // 「あなたの場にレベルNの覚醒状態のシグニがある場合、〜」＝場に覚醒状態のシグニが居る盤面ゲート
      // （engine HAS_CARD_IN_FIELD の isAwakened 状態フィルタ実装済＝execUtils/matchesStateFilter・
      // awakened_signi 参照）。従来は語彙が無くアタック時/アタックフェイズ開始時に無条件発火の過剰効果
      // （WXDi-P14-054/058/066）。
      [/あなたの場にレベル([０-９\d]+)の覚醒状態のシグニがある場合/,
        g => ({ type: 'HAS_CARD_IN_FIELD', owner: 'self', filter: { cardType: 'シグニ', level: parseNum(g[0]), isAwakened: true } })],
      // 「このシグニが〔アップ/ダウン〕状態の場合、〜」＝効果元シグニの向き状態ゲート（engine THIS_CARD_IS_UP/DOWN
      // 実装済＝execUtils.ts・signi_down 参照）。従来は語彙が無く無条件発火の過剰効果（WX15-055/056・WXDi-P02-038 等）。
      [/このシグニがアップ状態の場合/,
        () => ({ type: 'THIS_CARD_IS_UP' })],
      [/このシグニがダウン状態の場合/,
        () => ({ type: 'THIS_CARD_IS_DOWN' })],
      [/あなたのセンタールリグが＜([^＞]+)＞の場合/,
        g => ({ type: 'LRIG_STORY', owner: 'self', story: g[0] })],
      // 「あなたのセンタールリグのレベルが対戦相手のセンタールリグ〔以下/より低い/より高い/以上〕の場合」＝
      // 自/相手中央ルリグのレベル比較（engine LRIG_LEVEL_CMP_OPP 実装済＝execUtils・EQ の不等号版）。
      // 従来は語彙が無くアタック時に無条件発火の過剰効果（WXK07-025-E1/E2・WXK10-068-E2）。
      // ⚠「以下/以上」は「〜の場合」だが「より低い/より高い」は「〜場合」（の無し）＝「の?」で両対応
      // （続き55 は以下のみ対応でWXK07-025-E2「より低い場合」の condition が脱落＝毎アタック無条件発火の過剰効果だった）
      [/あなたのセンタールリグのレベルが対戦相手のセンタールリグ(以下|より低い|より高い|以上)の?場合/,
        g => ({ type: 'LRIG_LEVEL_CMP_OPP', operator: g[0] === '以下' ? 'lte' : g[0] === 'より低い' ? 'lt' : g[0] === 'より高い' ? 'gt' : 'gte' })],
      [/あなたの登録者数が([０-９\d]+)万人を達成している場合/,
        g => ({ type: 'SUBSCRIBER_COUNT', operator: 'gte', value: parseNum(g[0]) })],
      // 「このターンにあなたが手札をN枚以上捨てていた場合」＝turn_hand_discarded_count ゲート
      //   （engine TURN_HAND_DISCARD_GTE 実装済）。従来は語彙が無くアタックフェイズ開始時/出時に無条件発火の
      //   過剰効果（WX24-P1-062/WX25-P3-090/WXK02-049 等・census 条件節クラスタ6枚）。
      [/このターンにあなたが手札を([０-９\d]+)枚以上捨てていた場合/,
        g => ({ type: 'TURN_HAND_DISCARD_GTE', value: parseNum(g[0]) })],
      // 「(あなた|対戦相手)の場にシグニがN体(以上)ある場合」＝場のシグニ数ゲート（engine FIELD_COUNT 実装済）。
      //   ＜C＞/色/状態付きは先行の HAS_CARD_IN_FIELD が先にマッチ＝ここは無フィルタの総数のみ。旧3ゾーン札の
      //   「3体ある」＝満場＝gte で正しい（PR-464/WX10-065/WXK06-085）。
      [/(あなた|対戦相手)の場にシグニが([０-９\d]+)体(?:以上)?ある場合/,
        g => ({ type: 'FIELD_COUNT', owner: g[0] === '対戦相手' ? 'opponent' : 'self', operator: 'gte', value: parseNum(g[1]) })],
      // 「(あなた|対戦相手)のセンタールリグがレベルN以上の場合」＝中央ルリグのレベル閾値（engine LRIG_LEVEL 実装済）。
      //   従来は語彙が無く無条件発火（WX24-P2-003 相手Lv3以上・WXDi-D08-011 等）。
      [/(あなた|対戦相手)のセンタールリグがレベル([０-９\d]+)(以上|以下)の場合/,
        g => ({ type: 'LRIG_LEVEL', owner: g[0] === '対戦相手' ? 'opponent' : 'self', operator: g[2] === '以上' ? 'gte' : 'lte', value: parseNum(g[1]) })],
      // 「あなたの場にレゾナがある場合」＝場にレゾナが1体以上（engine HAS_CARD_IN_FIELD の cardType レゾナ）。
      //   WD11-018/WX07-023 等。「追加で」形は line 1456 ブロックが then だけ CONDITIONAL で処理するため、
      //   ここは matchLeadingStateCondition 経由の先頭マッチ用。
      [/あなたの場にレゾナがある場合/,
        () => ({ type: 'HAS_CARD_IN_FIELD', owner: 'self', filter: { cardType: 'レゾナ' } })],
      // 「このシグニがアクセされている場合」＝効果元シグニにアクセが付いているか（engine THIS_CARD_IS_ACCED 実装済）。
      //   従来は語彙が無くアタック時に無条件発火（WX15-098/101/104）。
      [/このシグニがアクセされている場合/,
        () => ({ type: 'THIS_CARD_IS_ACCED' })],
      ...STATE_CONDITION_CLAUSES_V2,
    ];
    const t0 = text.trim();
    for (const [re, mk] of CLAUSES) {
      // 先頭の任意プレフィックス（m[1]）は「…対象とし、」に加えトリガー句「このシグニがアタックしたとき、」
      // 「このルリグがアタックしたとき、」も許容する（ON_ATTACK_SIGNI/ON_ATTACK_LRIG のトリガー除去は本ループ
      // より後の 1365 行で行われるため、ここでは条件節の前に居残っている＝素の先頭マッチが外れる）。
      // 「このルリグがアタックしたとき」は続き105で追加＝WX14-010等「あなたの場に(色)と(色)のシグニがある場合」
      // クラスタが未マッチだった原因（プレフィックス未対応で条件節ごと無条件発火の過剰効果になっていた）。
      // m[1] は then へ再prependされ parseSingleSentence が同プレフィックスを除去するので整合する（WXDi-P14-058/066）。
      const m = t0.match(new RegExp('^((?:[^。「」]*?(?:対象とし|このシグニがアタックしたとき|このルリグがアタックしたとき)、)?)' + re.source + '、(.+)$', 's'));
      // 「〜の場合、代わりに〜」（昇格置換）は then だけのラップだと「基本＋条件時追加」の誤近似になり、
      // 既存 STUB（CONDITIONAL_MULTI_CHOOSE_BY_CENTER 等の実装済みハンドラ）も横取りして退化させる
      // ＝ else 表現が要る別系統として据置（本規則の対象外）
      if (m && !m[m.length - 1].startsWith('代わりに')) {
        const rest = m[m.length - 1];
        // ガードA: コスト減文（「〜の場合、このアーツの使用コストは…減る/になる」）は全文STUB
        // （ARTS_COST_REDUCTION_BY_CENTER_LRIG 等＝条件込みでengine実装済み・トップレベル収集）に
        // 委ねる＝横取りしない（CONDITIONAL に包むと収集から隠れる。WX05-038「このカードの使用コストは
        // 《青×1》になる」は続き29で本ガードに追加）
        // ⚠「このターン、そのピースの使用コストは…」（WXDi-P16-009）は対象外＝先頭形に限定
        if (/^この(アーツ|スペル|カード)の使用コスト.*(減る|になる)/.test(rest)) continue;
        const then = parseSingleSentence(m[1] + rest);
        // ガードB: rest 単体では UNKNOWN に退化する文は、全文対象のSTUB規則
        // （CONDITIONAL_POWER_BONUS 等の実装済みハンドラ）に委ねる＝STUB→UNKNOWN退化の防止
        const thenS = JSON.stringify(then);
        if (thenS.includes('"UNKNOWN"')) continue;
        // ガードD: OPTIONAL_COST 系 STUB（支払う/スキップ選択）は effectExecutor が SEQUENCE の**直接ステップ**
        // としてインターセプトし、後続の CONDITIONAL(IS_MY_TURN/PAID_ADDITIONAL_COST) と組で支払フローを
        // 生成する（Pattern ④/⑤・effectExecutor.ts:2353）＝CONDITIONAL に包むと選択フローが丸ごと壊れる
        // （WX24-P1-011/012・続き110）。条件付与は効果レベル hoist の領分＝持ち上げない。
        if (/"id":"(?:OPTIONAL_COST|TARGET_OPP_SIGNI_OPTIONAL_COLOR_COST|OPTIONAL_TRASH_ENERGY_CLASS)"/.test(thenS)) continue;
        // ガードE: COUNTER_SPELL はスペルカットイン UI が findCounterSpellMaxCost（SEQUENCE/CHOOSE のみ再帰・
        // CONDITIONAL 非対応）で maxCost を読み、打ち消し自体も UI 側で無条件実行＝CONDITIONAL に包むと
        // maxCost ゲートが失われ条件も効かない（WX17-031・続き110）。条件は effect.condition
        // （カットイン候補収集が evalUseCondition で評価済み＝BattleScreen:4934/4963）の領分＝持ち上げない。
        if (thenS.includes('"COUNTER_SPELL"')) continue;
        // ガードC: コスト減STUB（COST_REDUCTION系）はコスト計算側がトップレベル走査で収集する＝
        // CONDITIONAL に包むと収集から隠れて無効化するため持ち上げない（WX25-CD1-17 等。続き29）
        // ⚠例外＝ARTS_COST_REDUCTION_BY_EFFECT は実行時マーカー（execStubPart1 で no-op・トップレベル収集なし）
        //   ＝CONDITIONAL に包んでも失うものが無く、包まないと条件節ごと脱落する
        //   （WXDi-P16-009 LIFE_COUNT／WXDi-P16-011 HAND_COUNT＝続き77 Sonnet観測(c)）。
        const thenStub = then as import('../types/effects').StubAction;
        if (thenStub.type === 'STUB' && typeof thenStub.id === 'string' && thenStub.id.includes('COST_REDUCTION')
            && thenStub.id !== 'ARTS_COST_REDUCTION_BY_EFFECT') continue;
        // rest 先頭の「ターン終了時まで、」は再帰先の ^プレフィックス除去で消え PERMANENT 化する
        // （元の全文パースでは節が前置していたため中置扱いで拾えていた）＝ここで復元する
        if (/^(追加で)?ターン終了時まで、/.test(rest)) {
          const t = then as { duration?: string; until?: string };
          if (t.until === 'PERMANENT') t.until = 'UNTIL_END_OF_TURN';
          else if (t.duration === 'PERMANENT') t.duration = 'UNTIL_END_OF_TURN';
        }
        return {
          type: 'CONDITIONAL',
          condition: mk(m.slice(2, m.length - 1)),
          then,
        } as import('../types/effects').ConditionalAction;
      }
    }
    return null;
  }
  // first pass（トリガー句が残っている text）
  { const _w = tryWrapLeadingStateCond(text); if (_w) return _w; }
  // 「(その後、)あなたがベットしていた場合、追加で<X>」→ CONDITIONAL{IS_BETTING, then:<X>}
  // （2026-07-05 続き27・census文型「あなたがベットしていた場合」バッチ）。ベット宣言は
  // BattleScreen が raw text の「ベット―《X》」から UI 提示し is_betting_this_effect を立てる＝
  // engine 配線済み（execUtils.evalCondition の IS_BETTING）。追加ボーナス文を条件ゲートする。
  // ⚠「追加で」を必須にする＝「あなたがベットしていた場合、代わりに<X>」（置換）は else 表現が要る
  // 別系統（§5c「代わりに」バッチ）として据置。遅延トリガー入れ子（「場合、このターン、〜とき、追加で」）
  // も「追加で」が直後に無いため対象外＝§6.3。
  {
    const bm = text.trim().replace(/。$/, '').match(/^(?:その後、)?あなたがベットしていた場合、追加で(.+)$/s);
    if (bm) {
      const then = parseSingleSentence(bm[1]);
      if (!JSON.stringify(then).includes('"UNKNOWN"')) {
        return { type: 'CONDITIONAL', condition: { type: 'IS_BETTING' }, then } as import('../types/effects').ConditionalAction;
      }
    }
  }
  // 「（ターン終了時まで|次のあなたのターン）、あなたの（すべての）＜X＞(と＜Y＞)*のシグニは【K】を得る」
  // → 期間つき全シグニへのキーワード付与（ストリップ前に期間/クラスフィルタを抽出）
  {
    const m = text.trim().replace(/。$/, '').match(/^(ターン終了時まで|次のあなたのターン|次の自分のターン)、あなたの(?:すべての)?(.*?)シグニ(?:は|が)?【([^】]+)】を得る$/);
    if (m && !['常', '出', '起', '自', 'ガード'].includes(m[3])) {
      const dur: EffectDuration = m[1] === 'ターン終了時まで' ? 'UNTIL_END_OF_TURN' : 'NEXT_TURN';
      const filter: TargetFilter = { cardType: 'シグニ', ...parseStoryFilter(m[2]) };
      return { type: 'GRANT_KEYWORD', target: { type: 'SIGNI', owner: 'self', count: 'ALL', filter }, keyword: m[3], duration: dur };
    }
  }
  // 「ターン終了時まで、あなたの/対戦相手の(感染状態の)すべての(＜X＞の/レベルNの)シグニは「【自/出/起】…」を得る」
  // → GRANT_EFFECT count:'ALL'（引用は expandGrantEffectRawTexts が parseBlock で展開・§5c 続き30）。
  // 期間プレフィックス必須＝【常】の場全体付与（duration無し）はここでは扱わない（GRANT_FIELD_SIGNI_ABILITY の領分）。
  {
    const m = text.trim().replace(/。$/, '').match(/^ターン終了時まで、(あなたの|対戦相手の)(.*?)すべての(.*?)シグニは「(【[自出起]】.+)」を得る$/s);
    if (m && !/」と「|」か「/.test(m[4])) {
      const owner: Owner = m[1] === '対戦相手の' ? 'opponent' : 'self';
      const seg = m[2] + m[3];
      const filter: TargetFilter = { cardType: 'シグニ', ...parseStoryFilter(seg), ...parseLevelFilter(seg), ...parseColorFilter(seg) };
      if (seg.includes('感染状態')) filter.infected = true;
      return { type: 'GRANT_EFFECT', target: { type: 'SIGNI', owner, count: 'ALL', filter },
        duration: 'UNTIL_END_OF_TURN', rawText: m[4] } as EffectAction;
    }
  }
  // タイミング・期間プレフィックスを除去（既にパースブロックで処理済み）
  const t = text.trim().replace(/。$/, '')
    .replace(/^ターン終了時まで、/, '')
    .replace(/^あなたのターン終了時、/, '')
    .replace(/^対戦相手のターン終了時、/, '')
    .replace(/^あなたのターン開始時、/, '')
    .replace(/^ターン終了時、/, '')
    // ⚠続き156：アタックフェイズ開始時／捨てられたとき の直後に居残る状態条件節を second pass で拾うため
    //   strip-list を拡張（従来は非対応で条件節ごと脱落＝無条件発火の過剰効果。WXDi-P05-015/P12-006・
    //   PR-470A・WXK03-037・WXK04-081/083・WXDi-P11-066 等）。トリガー句は parseBlock で既処理＝除去しても
    //   action 部の意味は変わらない（既存の「あなたのターン終了時、」strip と同じ扱い）。
    .replace(/^(?:あなた|対戦相手)のアタックフェイズ開始時、/, '')
    .replace(/^対戦相手の効果によってこのカードが(?:手札から)?捨てられたとき、/, '')
    .replace(/^このシグニがアタックしたとき、/, '')
    .replace(/^このシグニが開花したとき、/, '')
    .replace(/^あなたの(?:他の)?(?:＜[^＞]+＞の)?シグニ(?:[０-９\d]+体)?が開花したとき、/, '')
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

  // second pass（トリガー句除去後の t 先頭に居残った状態条件節を拾う・続き155）。
  // ①のプレフィックス許可リストに無いトリガー句（「ターン終了時、」等）直後の条件は、1668 除去で t 先頭へ来る。
  { const _w = tryWrapLeadingStateCond(t); if (_w) return _w; }

  // 「対戦相手が《…》…を支払わないかぎり、X」＝相手が任意コストを支払わなければ X を実行する対話ゲート。
  // STUB OPPONENT_PAY_OPTIONAL ＋ CONDITIONAL(IS_MY_TURN) の標準ペア＝effectExecutor:2339 が
  // 「支払う（pay＝何も起きない）／支払わない（skip＝X 実行）」の相手側 CHOOSE を生成する。
  // 従来はこの節に対応する規則が無く、下流の非アンカー規則が X だけを拾って節全体が無言消費され
  // **X が無条件実行の過剰効果**になっていた（WX24-P2-018-E1 の引用内側＝タスク12(i) と同系統・§3 Opusタスク1）。
  // ⚠「対戦相手**は**〜支払わないかぎり、手札を捨てる/アタックできない」は主語が帰結節にも分配される別形
  //   （part3:2095 等の専用規則の領分）＝ここでは「対戦相手**が**」形のみ扱う。
  // ⚠帰結が「そのシグニ」照応（トリガー元シグニ参照＝WXDi-P08-007）は、単文パースで owner が self に
  //   反転する退化を起こすため据置（従来どおり条件脱落の既知バグとして残る＝タスク12 在庫）。
  {
    const oppUnlessPayM = t.match(/^対戦相手が((?:《[白赤青緑黒無]》)+)を支払わないかぎり、(.+)$/s);
    if (oppUnlessPayM && !/^(?:ターン終了時まで、)?そのシグニ/.test(oppUnlessPayM[2])) {
      const costColors = [...oppUnlessPayM[1].matchAll(/《([白赤青緑黒無])》/g)].map(x => x[1]);
      const unlessThen = parseSingleSentence(oppUnlessPayM[2]);
      if (!JSON.stringify(unlessThen).includes('"UNKNOWN"')) {
        return { type: 'SEQUENCE', steps: [
          { type: 'STUB', id: 'OPPONENT_PAY_OPTIONAL', costColors } as StubAction,
          { type: 'CONDITIONAL', condition: { type: 'IS_MY_TURN' }, then: unlessThen } as EffectAction,
        ] } as SequenceAction;
      }
    }
  }

  // 「[<トリガー句>、]このシグニをアップし、<残り>」＝2動作の複合文（「アップ＋ターン終了時まで能力を失う」＝
  // 再攻撃コンボの定番・6枚）。従来は先頭の「アップ」が無言脱落し、残り（能力喪失）だけが実行されていた＝
  // **デメリットだけ適用される**過少パース（WX24-P1-017 の引用付与の内側／WXDi-P15-056／WXDi-CP02-051 等）。
  // ⚠ON_SIGNI_BANISH_OPPONENT のトリガー句（「…がバトルによって…をバニッシュしたとき、」）は **除去しない**
  //   （既存の全文 STUB 規則＝BATTLE_BANISH_LIFE_BURST 等がトリガー句込みでマッチする前提で書かれており、
  //    除去すると別 STUB へ誤マッチして退化する＝WXEX2-40 で実測）。よってここはトリガー句を跨いで拾う。
  {
    const upThenM = t.match(/^(?:[^。]{2,60}たとき[、,])?この(?:シグニ|カード)をアップし[、,]\s*(.+)$/s);
    if (upThenM) {
      const restText = upThenM[1];
      // 「ターン終了時まで、」が残り文の先頭へ回るケースの期間復元は parseSingleSentence 側の
      // restoreLeadUntilEndOfTurn が共通処理する（旧・ここでのインライン復元は共通化に伴い削除）。
      const rest = parseSingleSentence(restText);
      const up: EffectAction = { type: 'UP', target: { type: 'SIGNI', owner: 'self', count: 1, filter: { thisCardOnly: true } } };
      return { type: 'SEQUENCE', steps: [up, rest] } as EffectAction;
    }
  }

  // トップレベル動作選択「（カードをN枚）引くか<B>」→ CHOOSE（§4タスク4）。
  // 【自】/【起】のトリガー句除去後にここへ届く単文も拾う（parseActionTextInner 冒頭と同じルール）。
  {
    const drawChoose = parseDrawOrChoice(t);
    if (drawChoose) return drawChoose;
  }

  // 「**次の**あなたのアタックフェイズ開始時、<効果>」＝**遅延トリガー**（§3 Opusタスク10 パターンF-4）。
  // ⚠従来は遅延句が無言脱落して**その場で即時実行**されていた（アタックフェイズを待たずに発動する過剰効果）。
  // engine 実装済みの `INSTALL_DELAYED_TRIGGER`（B3・duration:'THIS_TURN'）に載せる＝collectTurnTriggers が
  // ON_ATTACK_PHASE_START で delayed_triggers を収集する（続き76で配線）。
  // ⚠「次の対戦相手のターン終了時**まで**」は**持続期間**であってトリガーではない（読点必須で除外される）。
  // ⚠相手ターンに設置すると delayed_triggers はターン終了でクリアされる＝次の自ターンまで残らない既知の近似。
  {
    const delayM = t.match(/^次のあなたのアタックフェイズ開始時[、,]\s*(.+)$/s);
    if (delayM) {
      const inner = parseSingleSentence(delayM[1]);
      if (inner.type !== 'UNKNOWN') {
        return {
          type: 'INSTALL_DELAYED_TRIGGER',
          duration: 'THIS_TURN',
          trigger: { timing: 'ON_ATTACK_PHASE_START' },
          effect: inner,
        } as unknown as EffectAction;
      }
    }
  }

  // 連用中止形の並列動作「Aし、Bする」→ SEQUENCE（§3 Opusタスク10 パターンF-1）。
  // ⚠従来は**先頭の動作が無言脱落**して後半だけが残っていた（「シグニ1体をバニッシュ**し**、シグニ1体を
  //   ダウンする」→ DOWN だけ／「手札をすべて捨て、カードを4枚引く」→ DRAW だけ）。
  // ガード＝①「〜を対象とし、」「〜として、」は**対象指定の節**であって並列動作ではない（split しない）
  //        ②「とき」「場合」「代わりに」を含む文は条件/トリガー構造なので触らない
  //        ③**両半分が非UNKNOWNに解けたときだけ** SEQUENCE 化（片方でも解けなければ従来動作＝据置）。
  // ⚠左半分は**連用形**（「バニッシュ**し**」「捨て」）で終わるため、そのままでは各規則（終止形前提）に
  //   当たらない＝**終止形へ正規化してから**パースする。
  {
    const CONJ_FIN: Array<[RegExp, string]> = [
      [/バニッシュし$/, 'バニッシュする'], [/ダウンし$/, 'ダウンする'], [/アップし$/, 'アップする'],
      [/凍結し$/, '凍結する'], [/捨て$/, '捨てる'], [/場に出し$/, '場に出す'],
      // 「〜を場からトラッシュに置き、X」＝自己/自シグニの場→トラッシュ（コスト/デメリット）が先頭脱落していた
      // （続き107・タスク3(c)＝PR-422「このシグニをトラッシュに置き、3枚引く」・SP24-009 等。「対象とし」「探して」
      //  「場合」を含む複合は既存ガードが split を止めるため対象外＝WXK07-042/WX20-049/WX26-CP1-066 は別テール）。
      [/場からトラッシュに置き$/, '場からトラッシュに置く'],
    ];
    const conjM = t.match(/^(.*?(?:バニッシュし|ダウンし|アップし|凍結し|手札を[^、。]{0,6}捨て|場に出し|場からトラッシュに置き))、(.+)$/s);
    // ⚠SEARCH 文（「デッキから…を探して場に出し、デッキをシャッフルする」）は **1つの SEARCH アクション**であって
    //   並列動作ではない（分割すると SEARCH が丸ごと壊れて ADD_TO_FIELD だけになる＝デッキ検索が消える）。
    //   同様に「公開し」「手札に加え」を含む探索文も触らない。
    //   「（デッキの上から見た/公開した）**その中から**…場に出し、**残りを**…」も1つの REVEAL_AND_PICK 系アクション。
    const isSearchLike = /探して|デッキから[^。]{0,30}(?:場に出し|手札に加え|公開し)|その中から|残りを/.test(t);
    if (conjM && !isSearchLike && !/対象とし、|として、|とき|場合|代わりに/.test(t)) {
      let leftText = conjM[1];
      for (const [re, fin] of CONJ_FIN) { if (re.test(leftText)) { leftText = leftText.replace(re, fin); break; } }
      const left = parseSingleSentence(leftText);
      const right = parseSingleSentence(conjM[2]);
      // ⚠右半分が STUB に解ける場合は **その STUB が文全体（左の動作を含む）を実装している**ことが多く、
      //   分割すると二重実行になる（WXDi-P00-018＝`DRAW_DISCARD_COUNT_PLUS_N` は「手札をすべて捨て」を内包）。
      if (left.type !== 'UNKNOWN' && right.type !== 'UNKNOWN' && right.type !== 'STUB') {
        return { type: 'SEQUENCE', steps: [left, right] } as SequenceAction;
      }
    }
  }

  const result =
    parseSentencePart1(t) ??
    parseSentencePart2(t) ??
    parseSentencePart3(t) ??
    parseSentencePart4(t) ??
    { type: 'UNKNOWN', raw: t } as UnknownAction;

  // 「カードをN枚引き、X」で下流パーサが先頭 DRAW を落としていた場合のみ DRAW を前置する。
  // ⚠isolation で rest を再parse しない（＝続き59で revert した eager split の敗因＝複合ハンドラ
  //   「カードを引き、手札からデッキへ置く」=SEQUENCE[DRAW,TRANSFER_TO_DECK] の preempt や、単独 fragment の
  //   mis-parse を回避）。全文の parseSentencePart 結果が「既に先頭 DRAW を含む＝複合ハンドラが正しく処理済み」
  //   なら触らず、含まない＝X だけ解析され DRAW が飲まれた場合のみ DRAW を積む。UNKNOWN は悪化させない。
  // 「その後、」プレフィックスも許容（続き107・非先頭の連用ドロー＝SP24-009「その後、5枚引き、ライフに加える」等。
  // splitSentences 各文が parseSingleSentence 経由で来るため、SEQUENCE 内の後続文でも安全網が効く）。
  const leadDrawM = t.match(/^(?:その後、)?カードを([０-９\d]+)枚引き、/);
  if (leadDrawM && result.type !== 'UNKNOWN') {
    const steps0 = result.type === 'SEQUENCE' ? (result as SequenceAction).steps : [result];
    const hasLeadingDraw = steps0[0]?.type === 'DRAW';
    if (!hasLeadingDraw) {
      return { type: 'SEQUENCE', steps: [
        { type: 'DRAW', owner: 'self', count: parseNum(leadDrawM[1]) },
        ...steps0,
      ] } as SequenceAction;
    }
  }
  return result;
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

// ===== CONTINUOUS 引用能力付与（【常】自己付与形/場全体常時付与形）=====
// 「【常】：<cond>かぎり、このシグニは「Q」を得る」（thisCardOnly＝付与元自身のみ）と
// 「【常】：あなたの<C>シグニは「Q」を得る」（場全体常時付与）を GRANT_FIELD_SIGNI_ABILITY で正エンコード。
// collectGrantedFromLayer が activeCondition 評価のうえ augmented effectsMap へ合成し、付与された
// 【自】/【常】/【起】をトリガー/常時/UI 収集が拾う（§5c 続き34）。引用内は下流の展開分岐が parseBlock で
// abilities へ展開する（rawText 一時保持・展開不能なら PARTIAL）。
// ⚠ CONTINUOUS 効果でのみ呼ぶこと（GRANT_FIELD_SIGNI_ABILITY は CONTINUOUS 収集専用。
//   durational な 【起】/【自】「ターン終了時まで、このシグニは「Q」を得る」は GRANT_EFFECT 系の管轄で本関数の対象外）。
// ---- 多段「（このシグニは）下にレベルNのシグニがあるかぎり、「Q」を得る。」（WX24-P1-043＝ライズ3段付与）----
// 従来は genericKagiri（条件抽出ループ）が1段目条件を無言消費し、qfSelf の貪欲マッチが残り3引用を
// 1つの rawText へ丸呑みして展開不能（1段目のみ UNKNOWN で残存・2/3段目消失＝続き77 Sonnet観測(b)）。
// 段ごとに THIS_CARD_HAS_UNDER{filter:{level:N}} を付与した rawStages に分解し、展開時（parseBlock 後）に
// 各 CardEffect の activeCondition へ注入する。⚠条件抽出ループより**前**に呼ぶこと（1段目条件が要る）。
function parseMultiStageUnderGrant(text: string): EffectAction | null {
  const stageRe = /(?:このシグニは)?(下に)?レベル([０-９\d]+)のシグニがあるかぎり、「(【[自常起出]】[\s\S]*?)」を得る。?/g;
  const stages = [...text.matchAll(stageRe)];
  if (stages.length >= 2 && stages[0][1] === '下に') {
    // 全文が段マッチで尽きる（他の文を無言脱落させない）ことを確認
    const leftover = stages.reduce((acc, m) => acc.replace(m[0], ''), text).trim();
    if (leftover === '') {
      return {
        type: 'GRANT_FIELD_SIGNI_ABILITY', thisCardOnly: true, abilities: [],
        rawStages: stages.map(m => ({
          activeCondition: { type: 'THIS_CARD_HAS_UNDER', filter: { cardType: 'シグニ', level: parseNum(m[2]) } } as ActiveCondition,
          // 主語省略形「【常】：対戦相手の効果によってダウンしない」は既存規則（part2）が
          // 「このシグニは…」主語を要求するため、省略された主語を補って渡す
          rawText: m[3].trim().replace(/^(【[自常起出]】(?:《[^》]*》)?：)(対戦相手の効果によって)/, '$1このシグニは$2'),
        })),
      } as GrantFieldSigniAbilityAction;
    }
  }
  return null;
}

function parseContinuousQuotedGrant(text: string): EffectAction | null {
  // ---- 連用中止「このシグニのパワーは＋Nされ、<B>」＝パワー修正＋残りの複合（WXDi-P11-046 等）----
  // 従来は先頭のパワー修正が無言脱落し <B> だけが残る（＋3000 消失＝続き77 Sonnet観測(b)）。
  // CONT の POWER_MODIFY 収集（extractPowerModifies）は SEQUENCE を再帰するため SEQUENCE 化で正しく効く。
  // <B> が UNKNOWN に落ちる場合は分割せず従来経路へ委ねる（退化防止）。
  {
    const renyoM = text.match(/^このシグニのパワーは([＋+－-])([０-９\d]+)され、(.+)$/s);
    if (renyoM) {
      const rest = renyoM[3].trim();
      const restAction = parseContinuousQuotedGrant(rest) ?? parseActionText(rest);
      if (restAction.type !== 'UNKNOWN' && !JSON.stringify(restAction).includes('"UNKNOWN"')) {
        const sign = (renyoM[1] === '－' || renyoM[1] === '-') ? -1 : 1;
        return { type: 'SEQUENCE', steps: [
          { type: 'POWER_MODIFY', target: { type: 'SIGNI', owner: 'self', count: 1, filter: { thisCardOnly: true } }, delta: sign * parseNum(renyoM[2]) },
          restAction,
        ] } as SequenceAction;
      }
    }
  }
  const qfSelf = text.match(/^(?:このシグニは)?「(【[自常起出]】.+)」を得る。?$/s);
  if (qfSelf && !/」と「|」か「/.test(qfSelf[1])) {
    return { type: 'GRANT_FIELD_SIGNI_ABILITY', thisCardOnly: true, abilities: [], rawText: qfSelf[1] } as GrantFieldSigniAbilityAction;
  }
  const qfField = text.match(/^(あなたの|対戦相手の)((?:[白赤青緑黒]の|＜[^＞]+＞[かの]?|他の|レベル[０-９\d]+の|すべての|感染状態の)*)シグニは「(【[自常起出]】.+)」を得る。?$/s);
  if (qfField && !/」と「|」か「/.test(qfField[3])) {
    const owner: Owner = qfField[1] === '対戦相手の' ? 'opponent' : 'self';
    const filter: TargetFilter = { cardType: 'シグニ', ...parseStoryFilter(qfField[2]), ...parseColorFilter(qfField[2]), ...parseLevelFilter(qfField[2]) };
    return {
      type: 'GRANT_FIELD_SIGNI_ABILITY',
      ...(owner === 'opponent' ? { targetOwner: 'opponent' as Owner } : {}),
      filter,
      abilities: [],
      rawText: qfField[3],
    } as GrantFieldSigniAbilityAction;
  }
  return null;
}

// ===== アクションテキスト全体パース =====

// 「（この/その）シグニより〔パワー/レベル〕の〔低い/高い〕対戦相手のシグニN体を対象とし、…それを〈除去〉」形（続き44・§4タスク2 残）。
// 対象選択が STUB（TARGET_OPP_SIGNI_OPTIONAL_COLOR_COST/OPTIONAL_COST）や別文（cost/条件）に分かれ、
// 除去アクションの target 文（「それをバニッシュする」等）には比較語が残らないため parseSigniTarget 経由の
// 比較パーサが届かず、動的比較フィルタが全数脱落していた（過剰効果＝比較なしで全シグニ対象）。
// 先頭 designation を検出し、後続の opponent-signi ターゲット（BANISH/SEND_TO_ENERGY/BOUNCE 等）へ比較キーを刻む。
// ⚠「その」は自身とは限らない＝基準を厳密に切る：
//   ・「このシグニより」＝効果元自身（parseSelfComparison→powerLtSelf 等・sourceCardNum 基準）
//   ・「そのシグニより」＝トリガー主語＝アタッカー/被バニッシュ等（parseTriggerComparison→powerLtTrigger 等・triggeringCardNum 基準）。
//     WXK07-030「あなたのシグニ1体がアタックしたとき、そのシグニより」＝別シグニでも正しい／WXK11-041「…がバニッシュされたとき、そのシグニより」。
//   ・「…公開する。その後、そのシグニより」＝公開カード（lastProcessed）＝parseTriggerComparison が「その後」で {} を返し据置（WXK10-031・別機構）。
// parseActionText の全 return を横断して1箇所で適用（単文早期return も多段SEQUENCEも同じ経路に乗る）。冪等（既存の動的キーがあれば据置）。
function applyLeadingSelfComparison(text: string, action: EffectAction): EffectAction {
  if (!/(?:この|その)シグニより(?:パワーの低い|パワーの高い|低いレベルを持つ|レベルの低い|高いレベルを持つ|レベルの高い)対戦相手のシグニ[０-９\d]*体を対象とし、/.test(text)) return action;
  const selfFilter = { ...parseSelfComparison(text), ...parseTriggerComparison(text) };
  if (Object.keys(selfFilter).length === 0) return action;
  const DYN = ['powerLtSelf', 'powerGtSelf', 'powerLteSelf', 'levelLtSelf', 'levelGtSelf', 'powerLtTrigger', 'levelLtTrigger', 'levelGtTrigger'];
  let stamped = false;
  const walk = (a: EffectAction | undefined | null): void => {
    if (stamped || !a || typeof a !== 'object') return;
    const tgt = (a as { target?: { type?: string; owner?: string; filter?: Record<string, unknown> } }).target;
    if (tgt && tgt.type === 'SIGNI' && tgt.owner === 'opponent') {
      if (!tgt.filter) tgt.filter = {};
      if (!DYN.some(k => k in tgt.filter!)) {
        Object.assign(tgt.filter, selfFilter);
        stamped = true;
        return;
      }
    }
    if (a.type === 'SEQUENCE') {
      for (const st of (a as SequenceAction).steps) { walk(st); if (stamped) return; }
    } else if (a.type === 'CONDITIONAL') {
      const c = a as import('../types/effects').ConditionalAction;
      walk(c.then); if (!stamped && c.else) walk(c.else);
    }
  };
  walk(action);
  return action;
}

// 「AかB」トップレベル動作選択（プレイヤーが2動作から1つを選ぶ）→ CHOOSE(2択・§4タスク4 引用内CHOOSE）。
// DRAW を確実な錨にする：形A「カードをN枚引くか、B」／形B「AかカードをN枚引く」（「か」は「カードをN枚引く」に隣接）。
//  ・形A は先頭が「カードを…引く」＝命令形（トリガー主語「あなたが引くか…とき」は先頭が別語で除外）。
//  ・両動作が非UNKNOWNに解けたときのみ CHOOSE 化（片方でも解けなければ従来動作＝据置）。
//  ・トリガー/条件構造（「とき」「そうした場合」）を含む場合は 2択でなく条件/連鎖なので除外。
// 選択肢の action が leading CONDITIONAL（状態条件ゲート・else 無し）なら、engine の choice.condition
// （execChoose の available 判定＝effectExecutor.ts:2540）へ持ち上げ、action を then へ差し替える。
// 「②<状態条件>の場合、X」は「条件を満たすときだけ選べる」＝availability。action を CONDITIONAL 包みに
// すると選択肢が常時選択可に化け、条件が偽でも選んで空振りできる（続き156・§3 Opusタスク12🆕 の解消）。
// IS_MY_TURN/IS_OPPONENT_TURN（プレースホルダ常時真）は availability に持ち上げても無意味＝据置。
// rawText＝選択肢の原文（①②除去後）。**条件が選択肢の先頭にある availability ゲートのときだけ**持ち上げる。
// 「…を対象とし、<条件>の場合、それを〜」（対象化の後で条件判定＝action ゲート）は持ち上げない＝(a) 意味的に
// 選択後に対象を取ってから条件判定するもので availability とは違う、(b) choice.condition は decompiler で
// 条件を選択肢先頭へ描画するため、対象化が先の原文とは語順がズレて 同型★ 割れになる。
function liftChoiceOptionCondition(action: EffectAction, rawText?: string): { action: EffectAction; condition?: Condition } {
  if (action && action.type === 'CONDITIONAL') {
    const c = action as import('../types/effects').ConditionalAction;
    if (c.condition && c.then && !c.else &&
        c.condition.type !== 'IS_MY_TURN' && c.condition.type !== 'IS_OPPONENT_TURN') {
      // 条件が先頭にあるか（＝「〜の場合、」より前に「対象とし」等の対象化・先行アクションが無いか）を原文で判定。
      if (rawText != null) {
        const baIdx = rawText.indexOf('場合');
        const tgIdx = rawText.indexOf('対象とし');
        if (baIdx < 0 || (tgIdx >= 0 && tgIdx < baIdx)) return { action };
      }
      return { action: c.then, condition: c.condition };
    }
  }
  return { action };
}

function parseDrawOrChoice(text: string): ChooseAction | null {
  const t = text.replace(/。$/, '').trim();
  if (/とき|そうした場合/.test(t)) return null;
  let aText: string | null = null;
  let bText: string | null = null;
  const mA = t.match(/^カードを([０-９\d]+)枚引くか、?(.+)$/);
  if (mA) { aText = `カードを${mA[1]}枚引く`; bText = mA[2]; }
  else {
    const mB = t.match(/^(.+?)か、?カードを([０-９\d]+)枚引く$/);
    if (mB) { aText = mB[1]; bText = `カードを${mB[2]}枚引く`; }
  }
  if (!aText || !bText) return null;
  const aAction = parseActionText(aText);
  const bAction = parseActionText(bText);
  if (aAction.type === 'UNKNOWN' || bAction.type === 'UNKNOWN') return null;
  const aLift = liftChoiceOptionCondition(aAction, aText);
  const bLift = liftChoiceOptionCondition(bAction, bText);
  return {
    type: 'CHOOSE',
    choose_count: 1,
    from_count: 2,
    choices: [
      { choiceId: 'c0', label: '選択肢1', action: aLift.action, ...(aLift.condition ? { condition: aLift.condition } : {}) },
      { choiceId: 'c1', label: '選択肢2', action: bLift.action, ...(bLift.condition ? { condition: bLift.condition } : {}) },
    ],
  };
}

// 「対戦相手の〔レベル/パワー/色/状態…〕シグニN体を対象とし、…そうした場合、それを〈除去/移動〉」形（続き111）。
// 対象指定文と最終アクション文（「それを…する」）が別文に割れ、最終アクションの owner が designation を
// 継承せず default（BOUNCE→self・TRASH→any・TRANSFER_TO_DECK→self 等）へ落ち、「それ」が自分/任意の
// シグニを指す過剰・誤効果になる（70効果）。designation を parseSigniTarget で解決し、末尾（「それ」参照）の
// SIGNI ターゲット（owner が明示 opponent でない＝default に落ちた側）へ owner:opponent と欠落フィルタを刻む。
// ⚠「対象とし」が複数ある文は「それ」の指し先が曖昧＝適用しない（単一 designation に限定）。冪等（既に opponent なら据置）。
function applyLeadingOpponentDesignation(text: string, action: EffectAction): EffectAction {
  if (!/そうした場合、それを/.test(text)) return action;
  if ((text.match(/を対象とし/g)?.length ?? 0) !== 1) return action;
  const desigM = text.match(/(対戦相手の[^、。]*?シグニ[０-９\d]*体)を対象とし、/);
  if (!desigM) return action;
  const desig = parseSigniTarget(desigM[1], 'opponent');
  // 末尾（「それを…」）アクションの target/source を1つだけ補正（コスト等の先行 self ターゲットは触らない）。
  const findFinal = (a: EffectAction | null | undefined): EffectAction | null => {
    if (!a || typeof a !== 'object') return null;
    if (a.type === 'CONDITIONAL') { const c = a as import('../types/effects').ConditionalAction; return findFinal(c.then) ?? c.then; }
    if (a.type === 'SEQUENCE') { const st = (a as SequenceAction).steps; for (let i = st.length - 1; i >= 0; i--) { const f = findFinal(st[i]); if (f) return f; } return null; }
    return a;
  };
  const fin = findFinal(action) as (EffectAction & { target?: EffectTarget; source?: EffectTarget }) | null;
  // 特例（続き147・§3 タスク12(xxviii)）：末尾が「そうした場合、それをエナゾーンに置く」＝
  // 対象化した相手シグニ（designation）のエナ送り。parseSentencePart1 が REVEAL 文脈用の
  // ENERGY_CHARGE{DECK_CARD,self}（＝自分デッキからのチャージ）に誤マップするため、
  // designation を的にした SEND_TO_ENERGY へ置換する（該当8効果の除去脱落を一括是正）。
  if (fin && fin.type === 'ENERGY_CHARGE' && /そうした場合、それをエナゾーンに置く/.test(text)) {
    const mut = fin as unknown as { type: string; target: EffectTarget };
    mut.type = 'SEND_TO_ENERGY';
    mut.target = desig;
    return action;
  }
  const tgt = fin?.target ?? fin?.source;
  if (!tgt || tgt.type !== 'SIGNI' || tgt.owner === 'opponent') return action;
  tgt.owner = 'opponent';
  if (!tgt.filter) tgt.filter = {};
  for (const [k, v] of Object.entries(desig.filter ?? {})) {
    if (!(k in tgt.filter)) (tgt.filter as Record<string, unknown>)[k] = v;
  }
  return action;
}

function parseActionText(text: string): EffectAction {
  return applyLeadingSelfComparison(text, applyLeadingOpponentDesignation(text, parseActionTextInner(text)));
}

function parseActionTextInner(text: string): EffectAction {
  // ---- ベット選択数変更型（最優先）----
  // 「以下のN個からMつ(まで)選ぶ。あなたがベットしていた場合、代わりにKつ(まで)選ぶ。①…②…」
  // → CHOOSE(choose_count=M) に betChoose(thenChooseCount=K) を付与（ベット宣言で選択数が増える）。
  // リコレクトの chooseHeadM/chooseRecoM 型と同型（engine effectExecutor が betChoose で count を上書き）。
  // ⚠「以下から…選ぶ。同じ選択肢を2回以上選んでもよい」（WX17-003 の CHOOSE_SAME_OPTION 型）は
  //   「以下のN個から」で始まらないため未マッチ＝据置（repeat 選択は別機構）。
  {
    const chooseHeadM = text.match(/以下の[０-９\d二三四五六七八九]+つから([０-９\d一二三四五六七八九]+)つ(まで)?(?:を)?選ぶ/);
    const chooseBetM = text.match(/あなたがベットしていた場合、代わりに([０-９\d一二三四五六七八九]+)つ(まで)?(?:を)?選ぶ/);
    if (chooseHeadM && chooseBetM && /[①②③④⑤]/.test(text)) {
      const items = [...text.matchAll(/[①②③④⑤]([^①②③④⑤]+?)(?=[①②③④⑤]|$)/gs)];
      if (items.length >= 2) {
        return {
          type: 'CHOOSE',
          choose_count: parseNum(chooseHeadM[1]),
          from_count: items.length,
          choices: items.map((m, i) => {
            const optRaw = m[1].replace(/[。）\s]+$/, '').trim();
            const { action, condition } = liftChoiceOptionCondition(parseActionText(optRaw), optRaw);
            return { choiceId: `c${i}`, label: `選択肢${i + 1}`, action, ...(condition ? { condition } : {}) };
          }),
          ...(chooseHeadM[2] ? { upTo: true } : {}),
          betChoose: { thenChooseCount: parseNum(chooseBetM[1]), thenUpTo: !!chooseBetM[2] },
        } as ChooseAction;
      }
    }
  }
  // ---- リコレクトアイコン分割（最優先：他の早期returnに飲み込まれる前に処理する） ----
  // 《リコレクトアイコン》［N枚以上］を境界に base（前）と bonus/replacement（後）へ分割する。
  // リコレクトは「ルリグトラッシュのアーツ枚数」で判定し、使用中のアーツ自身(sourceCardNum)は数えない（excludeSource）。
  //  - 「追加で」/ アイコン直後効果 = 条件達成時に追加発動 → base + RECOLLECT_GATE + bonus
  //  - 「代わりに」                 = 条件達成時に基本効果を置換 → CONDITIONAL(then=置換 / else=基本)
  {
    const iconIdx = text.indexOf('《リコレクトアイコン》［');
    const head = iconIdx >= 0
      ? text.slice(iconIdx).match(/^《リコレクトアイコン》［([０-９\d]+)枚以上］(代わりに|追加で)?[、,]?/)
      : null;
    if (head) {
      // 選択数変更型: 「以下のN個からMつ(まで)選ぶ。《リコレクトアイコン》［X］代わりにKつ(まで)選ぶ。①…②…」
      // → CHOOSE(choose_count=M) に recollectArts(thenChooseCount=K) を付与（条件達成で選択数が増える）。
      const chooseHeadM = text.match(/以下の[０-９\d二三四五六七八九]+つから([０-９\d一二三四五六七八九]+)つ(まで)?(?:を)?選ぶ/);
      const chooseRecoM = text.match(/《リコレクトアイコン》［([０-９\d]+)枚以上］代わりに([０-９\d一二三四五六七八九]+)つ(まで)?(?:を)?選ぶ/);
      if (chooseHeadM && chooseRecoM && /[①②③④⑤]/.test(text)) {
        const items = [...text.matchAll(/[①②③④⑤]([^①②③④⑤]+?)(?=[①②③④⑤]|$)/gs)];
        if (items.length >= 2) {
          return {
            type: 'CHOOSE',
            choose_count: parseNum(chooseHeadM[1]),
            from_count: items.length,
            choices: items.map((m, i) => {
              const optRaw = m[1].replace(/[。）\s]+$/, '').trim();
            const { action, condition } = liftChoiceOptionCondition(parseActionText(optRaw), optRaw);
              return { choiceId: `c${i}`, label: `選択肢${i + 1}`, action, ...(condition ? { condition } : {}) };
            }),
            ...(chooseHeadM[2] ? { upTo: true } : {}),
            recollectArts: { minArts: parseNum(chooseRecoM[1]), thenChooseCount: parseNum(chooseRecoM[2]), thenUpTo: !!chooseRecoM[3] },
          } as ChooseAction;
        }
      }
      const minArts = parseNum(head[1]);
      const mode = head[2]; // '代わりに' | '追加で' | undefined
      const baseText = text.slice(0, iconIdx).trim().replace(/。$/, '');
      // 末尾のルール注釈（丸括弧）を除去してから bonus を取り出す
      const bonusText = text.slice(iconIdx + head[0].length).trim().replace(/（[^（）]*）\s*$/, '').trim();
      const recoCond = { type: 'LRIG_TRASH_COUNT' as const, cardType: 'アーツ' as const, operator: 'gte' as const, value: minArts, excludeSource: true };
      // SEQUENCE を平坦化しつつ UNKNOWN ステップを除去して push するヘルパー（除去＝無言脱落として刻印）
      const pushFlat = (arr: EffectAction[], a: EffectAction) => {
        if (a.type === 'SEQUENCE') for (const st of (a as SequenceAction).steps) { if (st.type !== 'UNKNOWN') arr.push(st); else markSilentFallback('リコレクト分割:UNKNOWNステップ除去'); }
        else if (a.type !== 'UNKNOWN') arr.push(a); else markSilentFallback('リコレクト分割:UNKNOWNアクション除去');
      };

      const baseAction = baseText ? parseActionText(baseText) : null;
      // base 全体がパース不能（例:「以下のN個から1つ選ぶ」だけが残る選択数変更型）なら
      // 分割を諦めて通常パースにフォールバック（UNKNOWN 退化を防ぐ）。
      const baseUnknown = !!baseText && baseAction!.type === 'UNKNOWN';

      if (mode === '代わりに' && baseText && !baseUnknown) {
        const thenAction = parseActionText(bonusText);
        if (thenAction.type !== 'UNKNOWN') {
          return { type: 'CONDITIONAL', condition: recoCond, then: thenAction, else: baseAction! };
        }
        // bonus がパース不能なら分割を諦める
      } else if (mode !== '代わりに' && !baseUnknown) {
        // 追加で / アイコン直後効果（baseText が空の場合も含む）: base + GATE + bonus
        const flat: EffectAction[] = [];
        if (baseAction) pushFlat(flat, baseAction);
        flat.push({ type: 'RECOLLECT_GATE', minArts });
        // bonus 先頭が「…対象とする。」のみの文なら剥がす（本体効果は後続文にある＝余計な対象STUBを避ける）。
        const strippedBonus = bonusText.replace(/^[^。]*?対象とする。/, '').trim();
        const effBonus = strippedBonus || bonusText;
        if (effBonus && !/^[^。]*?対象とする$/.test(effBonus)) pushFlat(flat, parseActionText(effBonus));
        return flat.length === 1 ? flat[0] : { type: 'SEQUENCE', steps: flat };
      }
      // ここに来た場合は分割を諦め、以降の通常パースに委ねる
    }
  }
  // ---- トップレベル動作選択「（カードをN枚）引くか<B>」→ CHOOSE（§4タスク4 引用内CHOOSE） ----
  // プレイヤーが2つの動作から1つを選ぶ「AかB」を CHOOSE(2択) で正エンコード。従来は先頭動詞だけ拾い
  // もう片方を無言脱落させていた（WXDi-D09-P20 引用内・WXDi-P02-011「引くか【エナチャージ】」等 約19効果）。
  // DRAW を錨にする（「引く」は動詞終止形で節境界が明確）。行き先選択（「（それを）加えるか場に出す」＝
  // 単一カードの destination 二択）は別系統＝対象/公開文脈が先行するため本ルールでは扱わない（下流で処理）。
  {
    const drawChoose = parseDrawOrChoice(text);
    if (drawChoose) return drawChoose;
  }
  // ---- ARTS_SELF_RECYCLE_ON_TRIGGER: コスト支払いでルリグトラッシュ→ルリグデッキへ戻す ----
  if (text.match(/《[^》]+》を支払ってもよい。そうした場合、このカードを(?:あなたの)?ルリグトラッシュからルリグデッキに戻す/))
    return { type: 'STUB', id: 'ARTS_SELF_RECYCLE_ON_TRIGGER' } as import('../types/effects').StubAction;
  // ---- エナ色条件つき単体除去（「シグニ1体を対象とし、あなたのエナゾーンに〈色〉のカードと〈色〉のカードがある場合、それを〜する」）----
  // エナの色条件を CONDITIONAL でラップ。対象は対戦相手シグニ（owner未指定の除去はopponent）、色フィルタは付けない。
  {
    const enaCondM = text.match(/^シグニ([０-９\d]+)体を対象とし、あなたのエナゾーンに(.+?)がある場合、それを(バニッシュする|手札に戻す|トラッシュに置く|ダウンする|凍結する)。?$/);
    if (enaCondM) {
      const colors = [...enaCondM[2].matchAll(/([白赤青緑黒])のカード/g)].map(m => m[1]);
      if (colors.length > 0) {
        const cnt = parseNum(enaCondM[1]);
        const verb = enaCondM[3];
        const tgt: EffectTarget = { type: 'SIGNI', owner: 'opponent', count: cnt, filter: { cardType: 'シグニ' }, upToCount: false };
        const inner: EffectAction =
          verb === 'バニッシュする'   ? { type: 'BANISH', target: tgt }
          : verb === '手札に戻す'      ? { type: 'BOUNCE', target: tgt }
          : verb === 'トラッシュに置く' ? { type: 'TRASH', target: tgt }
          : verb === 'ダウンする'      ? { type: 'DOWN', target: tgt }
          :                             { type: 'FREEZE', target: tgt };
        return { type: 'CONDITIONAL', condition: { type: 'ENERGY_HAS_COLOR', owner: 'self', colors }, then: inner };
      }
    }
  }
  // ---- センタールリグへの能力付与 ----
  if (text.includes('センタールリグは以下の能力を得る') || text.includes('レベルN以上のセンタールリグは以下の能力を得る')) {
    const m = text.match(/以下の能力を得る[。、]?(.+)/s);
    // abilities は parseBlock 後に埋められる（此処では rawText のみ保持）
    return { type: 'GRANT_LRIG_ABILITY', abilities: [], rawText: m?.[1]?.trim() ?? '',
      ...(text.includes('このゲームの間') ? { permanent: true } : {}) } as GrantLrigAbilityAction;
  }
  // ---- センタールリグへの能力付与（引用符形式: 「（ターン終了時まで、）あなたのセンタールリグは「...」を得る」）----
  {
    const quotedLrigM = text.match(/あなたのセンタールリグは[「『]([\s\S]+?)[」』]を得る/);
    if (quotedLrigM) {
      // abilities は parseBlock / parseSpellEffect で rawText から埋められる
      return { type: 'GRANT_LRIG_ABILITY', abilities: [], rawText: quotedLrigM[1].trim(),
        ...(text.includes('このゲームの間') ? { permanent: true } : {}) } as GrantLrigAbilityAction;
    }
  }
  // ---- センタールリグ自身への能力付与（「(ターン終了時まで、)このルリグは「...」を得る」＝ルリグ【起】/【出】の自己付与・§5c 続き30）----
  // GRANT_LRIG_ABILITY の省略デフォルト＝ターン終了時まで。「次の対戦相手のターン終了時まで」は表現語彙が無いため据置。
  {
    const quotedSelfLrigM = text.match(/(?:ターン終了時まで、)?このルリグは[「『]([\s\S]+?)[」』]を得る/);
    if (quotedSelfLrigM && !text.includes('次の対戦相手のターン終了時まで、このルリグは')) {
      return { type: 'GRANT_LRIG_ABILITY', abilities: [], rawText: quotedSelfLrigM[1].trim(),
        ...(text.includes('このゲームの間') ? { permanent: true } : {}) } as GrantLrigAbilityAction;
    }
  }
  // ---- アクセホストへの能力付与（GRANT_ACCE_HOST_ABILITY）----
  // 「これにアクセされている[＜X＞の|《Y》の]シグニは「...」を得る」（引用能力）/「...は【ランサー】等を得る」（キーワード）。
  // splitSentences で引用内の「。」により wrapper が壊れる前に最優先で捕捉する（さもないと内側の能力が単独効果として漏れ出す）。
  // abilities は parseBlock で rawText から展開する（GRANT_LRIG_ABILITY と同方式）。
  {
    // 本体は引用能力「…」/『…』 か キーワード【…】 に限定する（「すべての色を得る」等は専用STUB＝ここでは捕捉しない）。
    const acceGrantM = text.match(/^これにアクセされている(?:＜([^＞]+)＞の|《([^》]+)》の)?シグニは([「『【][\s\S]+?)を得る。?$/);
    if (acceGrantM) {
      const filter: TargetFilter = { cardType: 'シグニ' };
      if (acceGrantM[1]) filter.cardClass = acceGrantM[1];
      if (acceGrantM[2]) filter.cardName = acceGrantM[2];
      return { type: 'GRANT_ACCE_HOST_ABILITY', filter, abilities: [], rawText: acceGrantM[3].trim() } as GrantAcceHostAbilityAction;
    }
  }

  // ---- デッキ上N枚見て「＜C＞シグニをM枚まで手札に加え、＜C＞シグニをK枚まで場に出し、残りをデッキ下」＝
  //      二目的 dual-pick＝LOOK_PICK_CHAIN[hand ステージ, field ステージ]。後続「この方法で場に出たシグニは…」等が
  //      付く札は前後を parseActionText で解析し SEQUENCE[prefix, LPC, suffix] に組む（bare LOOK_AND_REORDER 化を防ぐ）。
  {
    const dp = text.match(/デッキの上からカードを([０-９\d]+)枚見る。\s*その中から(?:＜([^＞]+)＞の)?シグニを?([０-９\d]+)枚まで(?:公開し)?手札に加え、(?:＜([^＞]+)＞の)?シグニを?([０-９\d]+)枚まで場に出し、残り[^。]*?(デッキの一番下|トラッシュ)[^。]*?。/);
    if (dp && dp.index !== undefined) {
      // dp: [1]revealCount [2]手札クラス [3]手札枚数 [4]場クラス [5]場枚数 [6]残り先
      const remainder: { location: 'deck' | 'trash'; position: 'top' | 'bottom' | 'any' } =
        dp[6].includes('トラッシュ') ? { location: 'trash', position: 'any' } : { location: 'deck', position: 'bottom' };
      const handFilter: TargetFilter = { cardType: 'シグニ', ...(dp[2] ? parseStoryFilter(`＜${dp[2]}＞`) : {}) };
      const fieldFilter: TargetFilter = { cardType: 'シグニ', ...(dp[4] ? parseStoryFilter(`＜${dp[4]}＞`) : (dp[2] ? parseStoryFilter(`＜${dp[2]}＞`) : {})) };
      const lpc: EffectAction = {
        type: 'LOOK_PICK_CHAIN', owner: 'self', revealCount: parseNum(dp[1]),
        stages: [
          { filter: handFilter, pickCount: parseNum(dp[3]), then: 'hand' },
          { filter: fieldFilter, pickCount: parseNum(dp[5]), then: 'field' },
        ],
        remainder,
      } as unknown as EffectAction;
      const before = text.slice(0, dp.index).trim().replace(/。$/, '');
      const after = text.slice(dp.index + dp[0].length).trim();
      const steps: EffectAction[] = [];
      const pushFlatDp = (a: EffectAction) => { if (a.type === 'SEQUENCE') for (const st of (a as SequenceAction).steps) { if (st.type !== 'UNKNOWN') steps.push(st); else markSilentFallback('multi-dest分割:UNKNOWNステップ除去'); } else if (a.type !== 'UNKNOWN') steps.push(a); else markSilentFallback('multi-dest分割:UNKNOWNアクション除去'); };
      if (before) pushFlatDp(parseActionText(before));
      steps.push(lpc);
      if (after) pushFlatDp(parseActionText(after));
      return steps.length === 1 ? steps[0] : { type: 'SEQUENCE', steps } as SequenceAction;
    }
  }

  // ---- デッキ上N枚見て「（＜C＞の）シグニM枚を公開し手札に加えるか場に出し、残りをデッキ下」＝REVEAL_AND_PICK（handOrField）----
  // 2文（「…見る。その中から…」）にまたがるため splitSentences 前に全文で捕捉する（22枚の系統・pick 脱落を防ぐ）。
  {
    const m = text.match(/デッキの上からカードを([０-９\d]+)枚(?:見る|公開する)。?\s*その中から(?:(＜[^＞]+＞)の)?シグニ([０-９\d]+)枚(まで)?を?(?:公開し)?手札に加えるか場に出し/);
    if (m) {
      const remainder: { location: 'deck' | 'trash'; position: 'top' | 'bottom' | 'any' } =
        /残り[^。]*トラッシュ/.test(text) ? { location: 'trash', position: 'any' }
        : { location: 'deck', position: 'bottom' };
      return {
        type: 'REVEAL_AND_PICK', owner: 'self',
        revealCount: parseNum(m[1]),
        filter: { cardType: 'シグニ', ...(m[2] ? parseStoryFilter(m[2]) : {}) },
        pickCount: parseNum(m[3]),
        ...(m[4] ? { pickUpTo: true } : {}),
        handOrField: true,
        then: { type: 'ADD_TO_HAND', owner: 'self' },
        remainder,
      } as EffectAction;
    }
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
    if (/^[①②③④⑤]/.test(c)) return false;
    // 「どちらか/以下のN/から選ぶ」などCHOOSEヘッダ文はスキップ
    if (/^(?:どちらか|以下の?[０-９\d２-４]+つから)/.test(c) && c.includes('選ぶ')) return false;
    return true;
  });
  // CHOOSEパターン共通ヘルパー
  function buildChoose(rawText: string, chooseCount: number): ChooseAction | null {
    const items = [...rawText.matchAll(/[①②③④⑤]([^①②③④⑤]+?)(?=[①②③④⑤]|$)/gs)];
    if (items.length < 2) return null;
    return {
      type: 'CHOOSE',
      choose_count: chooseCount,
      from_count: items.length,
      choices: items.map((m, i) => {
        const optRaw = m[1].replace(/[。）\s]+$/, '').trim();
        const parsed = parseActionText(optRaw);
        const { action, condition } = liftChoiceOptionCondition(parsed, optRaw);
        return { choiceId: `c${i}`, label: `選択肢${i + 1}`, action, ...(condition ? { condition } : {}) };
      }),
    };
  }

  // text 先頭が「以下のNつからMつ選ぶ」ヘッダで①②③④選択肢を持つ場合、残存文の数に関わらず CHOOSE を組む。
  // 選択肢が複数文のとき（③「…－5000する。２０枚以上ある場合、代わりに…」等）2文目以降が①フィルタを
  // 生き残って単文/複文パスに落ち、選択構造ごと消えて平坦化していた（WD08-006。2026-07-05 続き29）。
  // ⚠選択数変更型「〜の場合、代わりにNつまで選ぶ」（CONDITIONAL_MULTI_CHOOSE_BY_CENTER 等の実装済み
  // STUB・リコレクトの選択数変更を含む）は選択数の条件分岐が要る＝素の CHOOSE に退化させない（据置）。
  {
    const headM = text.trim().match(/^以下の[０-９\d２-９]+つから([０-９\d１-９]+)つ(?:まで)?を?選ぶ。/);
    if (headM && /[①②③④⑤]/.test(text) && !/代わりに[^。①②③④⑤]*選ぶ/.test(text)) {
      // ⚠「…それは**選んだ能力を得る**。①【アサシン】②【ランサー】」型（WXK10-018）は、選択肢が
      //   **付与される能力名**であって実行するアクションではない＝素の CHOOSE に組むと「②【ランサー】」が
      //   別アクション（DRAW 等）に誤マッチする幻覚になる（§3 Opusタスク10 パターンC）。
      //   engine 実装済みの STUB `GRANT_CHOSEN_ABILITY`（原文を実行時に解析して能力選択→付与）に委ねる。
      //   ⚠付与先で id を使い分ける（engine 側は3つとも同一分岐で処理するが curated の慣例に揃える）＝
      //     「**このシグニ**は選んだ能力を得る」＝`_SELF`／それ以外（対象シグニに付与）＝`GRANT_CHOSEN_ABILITY`。
      if (/選んだ能力を得る/.test(text)) {
        const selfGrant = /この(?:シグニ|カード)は[^。]*選んだ能力を得る/.test(text);
        return { type: 'STUB', id: selfGrant ? 'GRANT_CHOSEN_ABILITY_SELF' : 'GRANT_CHOSEN_ABILITY' } as unknown as EffectAction;
      }
      const chosen = buildChoose(text, parseNum(headM[1]));
      if (chosen) return chosen;
    }
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
      /[①②③④⑤]/.test(text) &&
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
      let thenAction = parseSingleSentence(thenText);
      // 「公開した（＝選んだ）カードをエナゾーンに置く」は ADD_TO_ENERGY（applyDirectAction が選択カードをエナへ）。
      // ENERGY_CHARGE{DECK_CARD} だと execEnergyCharge が場のシグニを選ぶ誤動作になるため正規化する。
      if (thenAction.type === 'ENERGY_CHARGE' && (thenAction as EnergyChargeAction).target?.type === 'DECK_CARD') {
        thenAction = { type: 'ADD_TO_ENERGY', owner: 'self' } as AddToEnergyAction;
      }
      const filter: TargetFilter = {
        cardType: 'シグニ',
        ...parseStoryFilter(condText),
        ...parseLevelFilter(condText),
        ...parseColorFilter(condText),
      };
      const rp = { type: 'REVEAL_AND_PICK', owner: 'self', revealCount: 1, filter, pickCount: 1, then: thenAction, remainder: { location: 'deck', position: 'top' } } as RevealAndPickAction;
      // 公開文の前置き「あなたのエナゾーンにあるカードがN枚以下の場合、／エナゾーンにカードがない場合、」
      // が丸ごと脱落していた（無条件公開の過剰効果）＝ ENERGY_COUNT で持ち上げる（WX12-051/WX12-052）
      const enaPrefM = sentences[0].trim().match(/^あなたのエナゾーンに(?:あるカードが([０-９\d]+)枚(以上|以下)の|カードがない)場合、/);
      if (enaPrefM) {
        return {
          type: 'CONDITIONAL',
          condition: { type: 'ENERGY_COUNT', owner: 'self', operator: enaPrefM[1] ? (enaPrefM[2] === '以上' ? 'gte' : 'lte') : 'lte', value: enaPrefM[1] ? parseNum(enaPrefM[1]) : 0 },
          then: rp,
        } as import('../types/effects').ConditionalAction;
      }
      return rp;
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
  let prevRawSentence = '';
  for (const s of sentences) {
    const clean = s.trim();
    if (!clean) continue;
    // 直前文の原文（2文型規則が S1 の対象節を参照するために保持。continue で飛んでも常に直前の非空文を指す）
    const prevRaw = prevRawSentence;
    prevRawSentence = clean;

    // 「＜盤面状態条件＞の場合、代わりに＜enhanced＞」= 昇格置換（else付きCONDITIONAL）。（2026-07-05 続き28）
    // 直前ステップ（base）を else に、enhanced を then にして CONDITIONAL で前ステップを置換する。
    // 従来は条件が脱落し base+enhanced の二重適用/値すり替えの実バグだった（WX24-D3-15/WD08-006等）。
    // 続き29拡張＝(a)裸の多段閾値「N枚以上ある場合、代わりに〜」は前段 CONDITIONAL の同一 subject 条件の
    // 数値だけ差し替えて引き継ぐ（WD08-006/WXDi-P03-088/WXK11-075）。(b)per-target 値のみ形
    // 「代わりに(ターン終了時まで、)それのパワーを－Nする」は base のコア POWER_MODIFY をターゲット指定
    // ごと複製し delta だけ差し替えて then にする（ターゲット共有・WXDi-CP01-047 等17枚の系統）。
    // ⚠条件が表現できない形（コスト参照・ターン中イベント等）は据置。
    if (steps.length > 0) {
      let cm = matchLeadingStateCondition(clean);
      if (!cm) {
        // (a) 裸の多段閾値: 前段が数量条件の CONDITIONAL のときだけ、その条件の複製に新数値を入れて引き継ぐ
        // （帰結は「代わりに」＝昇格置換 か「追加で」＝追加ボーナスの CONDITIONAL 積み増し）
        const bm = clean.match(/^(?:その後、)?([０-９\d]+)[枚体]以上ある場合、((?:代わりに|追加で).+)$/s);
        const prev = steps[steps.length - 1] as import('../types/effects').ConditionalAction;
        if (bm && prev?.type === 'CONDITIONAL' && prev.condition &&
            ['TRASH_COUNT', 'TRASH_HAS_CARD', 'LRIG_TRASH_COUNT', 'HAS_CARD_IN_FIELD', 'ENERGY_COUNT', 'HAND_COUNT', 'LIFE_COUNT'].includes(prev.condition.type)) {
          const cond = JSON.parse(JSON.stringify(prev.condition)) as Condition & { minCount?: number; value?: number };
          if (cond.type === 'TRASH_HAS_CARD' || cond.type === 'HAS_CARD_IN_FIELD') cond.minCount = parseNum(bm[1]);
          else cond.value = parseNum(bm[1]);
          cm = { condition: cond, rest: bm[2] };
        }
      }
      // 「N枚以上ある場合、追加で<X>」＝置換ではなく追加ボーナス＝CONDITIONAL を新ステップとして積む
      // （WXDi-CP02-062「ブルアカ5枚→−5000。10枚以上ある場合、追加で3枚ミル」。続き29）
      if (cm && cm.rest.startsWith('追加で')) {
        const bonusText = cm.rest.slice('追加で'.length);
        const bonus = parseSingleSentence(bonusText);
        if (!JSON.stringify(bonus).includes('"UNKNOWN"')) {
          // 「ターン終了時まで、」先頭文は再帰先のプレフィックス除去で PERMANENT 化する＝復元
          // （parseSingleSentence の CONDITIONAL 持ち上げと同じ補正）
          if (/^ターン終了時まで、/.test(bonusText)) {
            const t = bonus as { duration?: string; until?: string };
            if (t.until === 'PERMANENT') t.until = 'UNTIL_END_OF_TURN';
            else if (t.duration === 'PERMANENT') t.duration = 'UNTIL_END_OF_TURN';
          }
          steps.push({ type: 'CONDITIONAL', condition: cm.condition, then: bonus });
          continue;
        }
      }
      if (cm && cm.rest.startsWith('代わりに')) {
        const enhancedText = cm.rest.slice('代わりに'.length);
        const base = steps[steps.length - 1];
        const coreOf = (a: EffectAction): EffectAction => a.type === 'CONDITIONAL' ? coreOf((a as import('../types/effects').ConditionalAction).then)
          : a.type === 'SEQUENCE' ? (((a as SequenceAction).steps.at(-1)) ?? a) : a;
        // (b) per-target 値のみ形（SEQUENCE base は対象選択が then に載らないため除外）
        const vm = enhancedText.match(/^(?:ターン終了時まで、)?(?:それら?のパワーを(?:それぞれ)?)?([－\-＋+])([０-９\d]+)する。?$/);
        const baseCore = coreOf(base);
        if (vm && (base.type === 'POWER_MODIFY' || base.type === 'CONDITIONAL') &&
            baseCore.type === 'POWER_MODIFY' && typeof (baseCore as import('../types/effects').PowerModifyAction).delta === 'number') {
          const thenPM = JSON.parse(JSON.stringify(baseCore)) as import('../types/effects').PowerModifyAction;
          thenPM.delta = ((vm[1] === '－' || vm[1] === '-') ? -1 : 1) * parseNum(vm[2]);
          steps[steps.length - 1] = { type: 'CONDITIONAL', condition: cm.condition, then: thenPM, else: base };
          continue;
        }
        const perTarget = /それ/.test(enhancedText) && !/対象とし/.test(enhancedText);
        if (!perTarget) {
          const then = parseSingleSentence(enhancedText);
          // enhanced（then）は base（else）と同じ種類の効果の「強化版」であるべき。文脈欠落（「デッキから」
          // 等）で then が別アクションに縮退する誤マージを防ぐ＝両者のコアaction型が一致する場合のみ置換。
          if (!JSON.stringify(then).includes('"UNKNOWN"') && coreOf(then).type === coreOf(base).type) {
            steps[steps.length - 1] = { type: 'CONDITIONAL', condition: cm.condition, then, else: base };
            continue;
          }
        }
      }
    }

    // 「そうした場合、(期間、)それ(ら)は「【自/出/起/常】…」を得る」＝直前文「<対象>を対象とし、<任意コスト>てもよい」
    // の対象へ引用能力を付与する2文型（引用付与の対象-コスト分離・§3 Opusタスク1・全18効果の家族）。
    // 従来は S1 の対象節が任意コスト STUB／誤 DOWN に飲まれて脱落し、S2 は引用内側が漏れ出して即時実行に
    // 平坦化していた（WX24-P2-018＝ルリグ自身へ即アサシン付与・WX25-P3-089/WXDi-P15-084＝内側効果の即時実行）。
    // S1 のコストステップはそのまま（executor Pattern③〔STUB+CONDITIONAL〕／DOWN 空振りスキップが支払フローを
    // 生成する）、対象情報だけを prevRaw から GRANT_EFFECT.target へ運ぶ（「それ」の解決＝付与時に選択UI）。
    // 引用内は expandGrantEffectRawTexts が parseBlock で CardEffect へ展開する（失敗時は rawText 温存＝PARTIAL）。
    {
      const grantM = clean.match(/^そうした場合、(ターン終了時まで、|次の対戦相手のターン終了時まで、)それ(?:ら)?は「(【[自出起常]】.+)」を得る。?$/s);
      if (grantM && steps.length > 0) {
        const prevT = prevRaw.match(/^((?:あなた|対戦相手)の[^。「」]*?を?)対象とし、([^。「」]+てもよい)。?$/);
        // 対象は場のシグニ/ルリグ限定＝出自ゾーン付き対象（トラッシュ/エナ/手札/デッキ）や表現不能修飾は据置
        if (prevT && !/トラッシュ|エナゾーン|手札|デッキ|アイコン|同じシグニゾーン/.test(prevT[1])) {
          const preQG2 = prevT[1].endsWith('を') ? prevT[1].slice(0, -1) + 'を対象とし、' : prevT[1] + '対象とし、';
          const ownerQG2: Owner = preQG2.startsWith('対戦相手の') ? 'opponent' : 'self';
          let targetQG2: EffectTarget | null = null;
          if (/ルリグかシグニ/.test(preQG2)) {
            const cm = preQG2.match(/([０-９\d]+)体(まで)?を?対象とし、$/);
            targetQG2 = { type: 'CENTER_LRIG_OR_SIGNI', owner: ownerQG2, count: cm ? parseNum(cm[1]) : 1, ...(cm?.[2] ? { upToCount: true } : {}) };
          } else if (/シグニ/.test(preQG2)) {
            targetQG2 = parseSigniTarget(preQG2, ownerQG2);
          } else if (/ルリグ/.test(preQG2)) {
            targetQG2 = { type: 'LRIG', owner: ownerQG2, count: 1 };
          }
          // 前段がコストとして機能するステップ（STUB 任意コスト系／DOWN）であることを確認＝
          // 他形（能動アクション）に誤ペアリングして無条件付与にしない
          const prevStepQG2 = steps[steps.length - 1] as { type?: string };
          const prevPairsQG2 = prevStepQG2?.type === 'STUB' || prevStepQG2?.type === 'DOWN' || prevStepQG2?.type === 'BOUNCE' || prevStepQG2?.type === 'TRASH';
          // 内側引用が単一ブロックの AUTO でパースできるときだけ発火する（試験展開＝結果は捨てて
          // 実展開は expandGrantEffectRawTexts に委ねる。無言フォールバック刻印は退避して汚染しない）。
          // 展開不能な内側（「【常】：アタックできない。」等）で rawText 温存の GRANT_EFFECT を作ると
          // engine が no-op ガードするため、従来の粗い即時エンコード（BLOCK_ACTION 等＝動く近似）より
          // 退化する＝そのケースは従来規則に据置（WXK10-007/WXDi-P06-047/WXDi-P08-053 で実測）。
          let innerOkQG2 = false;
          if (targetQG2 && prevPairsQG2) {
            const savedFbQG2 = _silentFallbacks;
            _silentFallbacks = [];
            try {
              const subsQG2 = splitEffectBlocks(grantM[2])
                .map((bq, si) => parseBlock('QG2-trial', bq, si))
                .filter((e): e is CardEffect => e !== null);
              innerOkQG2 = subsQG2.length === 1 && subsQG2[0].parseStatus === 'AUTO';
            } finally {
              _silentFallbacks = savedFbQG2;
            }
          }
          if (targetQG2 && prevPairsQG2 && innerOkQG2) {
            // コストが「アップ状態のこのシグニをダウン」形なら S1 を正準形（DOWN self thisCardOnly optional＝
            // WD12-013・続き163）へ置き換える（従来は対象節のフィルタが DOWN に誤って載り、コストのはずの
            // ダウンが対象シグニに掛かる誤実装だった）。ダウン不可時は executor が残りをスキップする。
            if (/^アップ状態のこのシグニをダウンしてもよい$/.test(prevT[2])) {
              steps[steps.length - 1] = { type: 'DOWN', target: { type: 'SIGNI', owner: 'self', count: 1, filter: { cardType: 'シグニ', thisCardOnly: true, isUp: true } }, optional: true } as EffectAction;
            }
            const durQG2: EffectDuration = grantM[1].startsWith('次の対戦相手') ? 'UNTIL_OPP_TURN_END' : 'UNTIL_END_OF_TURN';
            steps.push({ type: 'CONDITIONAL', condition: { type: 'IS_MY_TURN' }, then: { type: 'GRANT_EFFECT', target: targetQG2, duration: durQG2, rawText: grantM[2] } as EffectAction });
            continue;
          }
        }
      }
    }

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

    // 「その後、デッキをシャッフルし、X」→ 直前のSEARCHにafterSearchをマージしてXを次ステップに
    const shuffleThenM = clean.match(/^その後、デッキをシャッフルし、(.+)$/s);
    if (shuffleThenM && steps.length > 0) {
      const prev = steps[steps.length - 1] as import('../types/effects').SearchAction;
      if (prev?.type === 'SEARCH' && !prev.afterSearch) {
        prev.afterSearch = { type: 'SHUFFLE_DECK', owner: 'self' };
      }
      steps.push(parseSingleSentence(shuffleThenM[1].replace(/。$/, '').trim()));
      continue;
    }

    // 「そうした場合、」「この方法で...た場合、」「《色》を支払った場合、」「それが〜の場合、」はCONDITIONALとして前のステップと結合
    // ⚠「その後、<状態条件>場合、」の状態条件は「の場合」だけでなく「がいる場合／ある場合」（の 無し）も取る
    //   （ドリームチーム「その後、あなたの場に(色)のルリグがいる場合、X」＝WXDi-P08 等）＝`の?` で両対応。
    //   実際の条件抽出は parseHoistStateCondition 等が STATE_CONDITION_CLAUSES で検証するため過剰マッチは無害
    //   （未知条件は IS_MY_TURN 据置＝機能的に bare と同値）。
    const thenM = clean.match(/^(?:そうした場合、|その後、(?:[^、]+の?場合、|この方法で.+(?:支払った|た)場合、)|この方法で.+(?:支払った|た)場合、|(?:《[^》]+》)+を支払った場合、|それが[^、。]+の場合、)/);
    if (thenM && steps.length > 0) {
      const rest = clean.slice(thenM[0].length);
      // 先頭「それが」形は新設 alternation（従来は thenM 非マッチ＝parseSingleSentence 直行だった）。
      // 「代わりに」帰結（昇格置換＝else 表現が要る）と表現不能フィルタは従来挙動に据置する。
      const soreGaOnly = /^それが/.test(thenM[0]);
      // トラッシュ枚数/クラス条件は直前ステップが lastProcessedCards を残す trash 系
      //（デッキミル TRASH DECK_CARD／場・手札・エナの TRASH／LIFE_CRASH）のときだけ抽出する。
      // search/optional-cost/grant 等が前段の場合は誤抽出になるため IS_MY_TURN 据置（§5c）。
      const prevStep = steps[steps.length - 1] as { type?: string };
      const prevSetsProcessed = prevStep?.type === 'TRASH' || prevStep?.type === 'LIFE_CRASH';
      // 「それが〜の場合」（LAST_PROCESSED_MATCHES）の前段ゲート＝lastProcessedCards を記録するステップ。
      // 「デッキの一番上を公開する」は LOOK_AND_REORDER(1枚・並べ替えなし・公開・デッキ上) に近似されている
      // ため、条件持ち上げ時に記録付き公開 REVEAL_DECK_TOP へ置換する（WXEX1-36-BURST）。
      const lar = prevStep as Partial<import('../types/effects').LookAndReorderAction> & { type?: string };
      const prevIsRevealLook = lar?.type === 'LOOK_AND_REORDER' && lar.count === 1 && lar.private === false &&
        lar.reorder === false && !lar.canTrash && lar.destination?.position === 'top';
      const prevIsEnergyPlace = prevStep?.type === 'ENERGY_CHARGE_FROM_DECK';
      // 「それが〜の場合」が連続する形（WXDi-P04-008「それがレベル1なら引く。それが《ガード》持ちならクラッシュ」）：
      // 直前の CONDITIONAL(LAST_PROCESSED_MATCHES) は公開カードの記録を消費しない（then の DRAW 等は
      // lastProcessedCards を上書きしない）ため、その前の公開ステップの記録が生きている＝記録扱い。
      const prevIsLpmChain = prevStep?.type === 'CONDITIONAL' &&
        (prevStep as import('../types/effects').ConditionalAction).condition?.type === 'LAST_PROCESSED_MATCHES';
      // BANISH／EXILE／SEND_TO_ENERGY も engine が lastProcessedCards を記録する（execBanish/execExile/execSendToEnergy＝
      // ALL・selectOrInteract の両経路）。「この方法で〜バニッシュした／ゲームから除外した／エナゾーンに置いた場合」の
      // 結果カウント条件を拾えるよう prevRecords に含める（parseThisWayTrashCondition の prevIsDeckMill は
      // 「トラッシュに置かれた」限定なので誤反応しない＝parseThisWayGenericCount 経由でのみ効く）。
      const prevIsProcessRecorder = prevStep?.type === 'BANISH' || prevStep?.type === 'EXILE' || prevStep?.type === 'SEND_TO_ENERGY';
      const prevRecords = prevSetsProcessed || prevIsRevealLook || prevIsEnergyPlace || prevIsLpmChain || prevIsProcessRecorder || prevStep?.type === 'REVEAL_DECK_TOP';
      let condition = parseThisWayTrashCondition(thenM[0], prevSetsProcessed);
      if (!condition && prevRecords && !rest.startsWith('代わりに')) {
        condition = parseLastProcessedMatchesCondition(thenM[0], prevIsEnergyPlace);
      }
      // 結果カウント閾値「この方法で〔フィルタ〕がN枚以上〜した場合」（Cluster B）。前段が lastProcessedCards を
      // 記録するとき（prevRecords）だけ抽出。engine の LAST_PROCESSED_MATCHES/COUNT_GTE で評価される。
      if (!condition && prevRecords && !rest.startsWith('代わりに')) {
        condition = parseThisWayGenericCount(thenM[0]);
      }
      // 結果のレベル合計閾値「この方法で〜レベルの合計がN(以上/以下)?の場合」（LAST_PROCESSED_LEVEL_SUM）。
      if (!condition && prevRecords && !rest.startsWith('代わりに')) {
        condition = parseLevelSumCondition(thenM[0]);
      }
      // 「その後、それのパワーがN以上(である)?の場合」＝直前 POWER_MODIFY で強化した「それ」（lastProcessedCards）の
      // 実効パワー閾値（LAST_PROCESSED_POWER_GTE・engine 実装済み）。effectivePowers は POWER_MODIFY 適用前スナップショット
      // のため、直前 delta を addDelta として渡して加味する（WX03-046「+5000後15000以上」/WXK11-065「+4000後10000以上」）。
      // 従来は語彙が無く常時true化（IS_MY_TURN）していた過剰効果。
      if (!condition && !rest.startsWith('代わりに')) {
        const pm = thenM[0].match(/^(?:その後、)?それのパワーが([０-９\d]+)以上(?:である|の)?場合、$/);
        const pv = prevStep as { type?: string; delta?: number };
        if (pm && pv?.type === 'POWER_MODIFY' && typeof pv.delta === 'number') {
          condition = { type: 'LAST_PROCESSED_POWER_GTE', value: parseNum(pm[1]), addDelta: pv.delta };
        }
      }
      // 前段の記録に依存しない盤面状態条件（対戦相手手札N枚・ライフ枚数・センタールリグ＜X＞等）。
      // 「代わりに」帰結（置換機構待ち）は据置＝ここでは拾わない。
      if (!condition && !rest.startsWith('代わりに')) {
        condition = parseHoistStateCondition(thenM[0]);
      }
      if (soreGaOnly && condition?.type !== 'LAST_PROCESSED_MATCHES') {
        // 新設 alternation で持ち上げできない形（レベルが奇数の等・前段非記録・代わりに）＝従来どおり全文パース
        steps.push(parseSingleSentence(clean));
        continue;
      }
      if (condition?.type === 'LAST_PROCESSED_MATCHES' && prevIsRevealLook) {
        steps[steps.length - 1] = { type: 'REVEAL_DECK_TOP', owner: 'self', count: 1 };
      }
      // 具体的な条件節（この方法で…た場合/《色》を支払った場合/それが〜の場合）を抽出できず常時true化
      // ＝条件の無言脱落。「そうした場合、」だけは慣例エンコード（§9-9）のため刻印しない。
      if (!condition && !/^(?:その後、)?そうした場合、$/.test(thenM[0])) {
        markSilentFallback(`IS_MY_TURN化:${thenM[0]}`);
      }
      steps.push({ type: 'CONDITIONAL', condition: condition ?? { type: 'IS_MY_TURN' as const }, then: parseSingleSentence(rest) });
    } else {
      // 多分岐の後続枝（「レベル２の場合、」「スペルの場合、」等・接頭辞なし）＝直前が LAST_PROCESSED_MATCHES の
      // CONDITIONAL（＝公開/ミル結果のレベル別分岐の途中）のときに限り、同じ結果への追加分岐として CONDITIONAL 化する。
      const prevStepE = steps[steps.length - 1] as { type?: string };
      const prevIsLpmChainE = steps.length > 0 && prevStepE?.type === 'CONDITIONAL' &&
        (prevStepE as import('../types/effects').ConditionalAction).condition?.type === 'LAST_PROCESSED_MATCHES';
      const branch = prevIsLpmChainE ? parseBareBranchCondition(clean) : null;
      if (branch) {
        steps.push({ type: 'CONDITIONAL', condition: branch.condition, then: parseSingleSentence(branch.rest) });
      } else {
        steps.push(parseSingleSentence(clean));
      }
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
  // 【マルチエナ】の直後に別の効果マーカーが続く場合は句点を挿入（WX04-054等）
  // 「。」と効果マーカーの間の全角/半角スペースを除去（WX10-029等）
  const MARKER_RE = /(?:《レイヤーアイコン》)?【(?:クロス)?(?:ドライブ|チーム)?(?:常|出|起|自|ガード)】/;
  const MARKER_PAT = MARKER_RE.source;
  const normalized = text
    .replace(new RegExp(`【マルチエナ】(?=${MARKER_PAT})`, 'g'), '【マルチエナ】。')
    // 【ガード】（注釈はstripRuleParensで除去済み）の直後に別マーカーが続く場合も句点を挿入。
    // 挿入しないと【ガード】ブロック（=効果登録しない）に後続の【常】等が飲み込まれ丸ごと欠落する（WX12-025/034/036）
    .replace(new RegExp(`【ガード】(?=${MARKER_PAT})`, 'g'), '【ガード】。')
    // 文末キーワードトークン（【エナチャージN】/【シュート】/【ダブルクラッシュ】）直後のマーカーも同様＝
    // 後続の【出】/【起】/【自】が前ブロックに飲み込まれ丸ごと欠落していた（WXDi-P07-081/P14-056/P03-016/
    // P03-030/P06-010/P13-050/WXK04-015/WXK01-028/WX25-P3-036/WX25-CP1-040/WX24-P4-058/WXK01-074）
    .replace(new RegExp(`(【エナチャージ[０-９\\d]+】|【シュート】|【ダブルクラッシュ】)(?=${MARKER_PAT})`, 'g'), '$1。')
    .replace(new RegExp(`。[\\s　]+(?=${MARKER_PAT})`, 'g'), '。');
  return normalized.split(/(?<=。)(?=(?:《レイヤーアイコン》)?【(?:クロス)?(?:ドライブ|チーム)?(?:常|出|起|自|ガード)】)/).map(b => b.trim()).filter(Boolean);
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

// パース中のカードの基本種別（'ルリグ'/'シグニ'/…）。timing 判定で「同じ原文でも主体がルリグかシグニかで
// engine の受け皿が違う」ケースに使う（【アクセ】が付いたとき＝ルリグは ON_ACCE_ATTACH〔ルリグ監視〕・
// シグニは ON_ACCE〔場のシグニ〕。引用付与の内側 parseBlock も外側カードの種別を引き継ぐ）。
let _parsingBaseType = '';

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
  const beatIconM = costStr.match(/^《ビートアイコン》[[［]([^\]］]+)[\]］]\s*/);
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

  // 《相手ターン》《自分ターン》: そのターン中のみ有効。CONTINUOUS は activeCondition TURN_OWNER として適用
  // （checkActiveCondition が評価）。AUTO/ACTIVATED の turn 限定はトリガー収集側の ad-hoc 判定が必要なため
  // 現状はマーカー除去のみ（condition 化は別タスク・TODO）。
  let turnOwnerCond: ActiveCondition | undefined;
  if (costStr.includes('《相手ターン》')) { turnOwnerCond = { type: 'TURN_OWNER', owner: 'opponent' }; costStr = costStr.replace('《相手ターン》', '').trim(); }
  else if (costStr.includes('《自分ターン》')) { turnOwnerCond = { type: 'TURN_OWNER', owner: 'self' }; costStr = costStr.replace('《自分ターン》', '').trim(); }

  let effectType: EffectType;
  let timing: EffectTiming[] | undefined;
  let mandatory = false;
  let extractedTriggerScope: import('../types/effects').TriggerScope | undefined;
  let extractedTriggerFilter: TargetFilter | undefined;
  let extractedTriggerCondition: Condition | undefined; // トリガー文から抽出した発動条件（ON_ENERGY_CHARGE=IS_MY_TURN等）
  let extractedTriggerCondObj: import('../types/effects').CardEffect['triggerCondition']; // トリガー文から抽出した発火限定（byOpponentEffect/fromZones/forResonaCondition）
  let forcedActiveCondition: ActiveCondition | undefined; // marker処理で強制設定する activeCondition（G150「【常】…バニッシュされたとき」のON_BANISH再分類＝相手ターン限定）

  // 【自】の timing 判定に使うテキスト＝**効果ブロック先頭のトリガー句だけ**（続き136・PLAN §3 Opusタスク17）。
  // 従来は actionText 全体を判定チェーンにかけていたため、トリガー句より後ろ（本文や引用付与の内側）に出てくる
  // 「…したとき」「…クラッシュされたとき」等が先にマッチし、外側 timing が化けていた（実測27効果）。
  //   例：WX25-CP1-085「【自】：あなたのアタックフェイズ開始時、…このターン、…がアタックしたとき、…」→ ON_ATTACK_SIGNI
  //   例：WX25-CP1-065「【自】：あなたのアタックフェイズ開始時、…対戦相手のライフクロス…クラッシュしたとき…」→ ON_OPP_LIFE_CRASHED
  // 先頭の「…とき、／…時、」までを取り、見つからなければ従来どおり全文で判定する（＝挙動不変のフォールバック）。
  const trigText = actionText.match(/^.*?(?:とき|時)[、,]/)?.[0] ?? actionText;
  switch (marker) {
    case '常':
      effectType = 'CONTINUOUS'; mandatory = true;
      // 【常】表記だが「（対戦相手のターンの間、）このシグニがバニッシュされたとき、…」は ON_BANISH トリガー（AUTO）として扱う（G150）。
      // 相手ターン限定は activeCondition TURN_OWNER(opponent)（ON_BANISH 自己トリガー収集が activeCondition を評価するため）。
      {
        const banishTrigM = actionText.match(/このシグニがバニッシュされたとき[、,]\s*(.+)/s);
        if (banishTrigM) {
          effectType = 'AUTO';
          timing = ['ON_BANISH'];
          extractedTriggerScope = 'self';
          if (/対戦相手のターンの間/.test(actionText)) forcedActiveCondition = { type: 'TURN_OWNER', owner: 'opponent' };
          actionText = banishTrigM[1];
        }
      }
      break;
    case '出':
      effectType = 'AUTO'; timing = ['ON_PLAY'];
      mandatory = costStr === '' && !eichiCondition;
      // 「このシグニが（シグニの）効果によって場に出たとき」限定（G079）。通常召喚・グロウでは発火しない。
      // 「シグニの効果によって」= bySigniEffect（シグニの効果のみ。スペル/アーツ/ルリグの効果では発火しない）。
      // 「効果によって」（シグニの無し）= byEffect（任意の効果）。
      {
        const bySigniM = actionText.match(/^このシグニがシグニの効果によって場に出たとき[、,]\s*(.+)/s);
        const byEffM = actionText.match(/^このシグニが効果によって場に出たとき[、,]\s*(.+)/s);
        if (bySigniM) {
          extractedTriggerCondObj = { ...(extractedTriggerCondObj ?? {}), bySigniEffect: true };
          actionText = bySigniM[1];
        } else if (byEffM) {
          extractedTriggerCondObj = { ...(extractedTriggerCondObj ?? {}), byEffect: true };
          actionText = byEffM[1];
        }
      }
      break;
    case '起':
      effectType = 'ACTIVATED';
      // 使用フェイズはコスト先頭のアイコンで決まる（スペルカットイン／アタックフェイズ／メインフェイズ）。
      // 手札起動（手札からこのカードを捨てる）でも場の【起】でも同様にアイコンで判定する（G082「【起】《アタックフェイズアイコン》このシグニを場からトラッシュに置く」）。
      {
        const iconT: EffectTiming[] = [];
        if (costStr.includes('《スペルカットインアイコン》')) iconT.push('SPELL_CUTIN');
        if (costStr.includes('《アタックフェイズアイコン》')) iconT.push('ATTACK_ARTS');
        if (costStr.includes('《メインフェイズアイコン》')) iconT.push('MAIN');
        timing = iconT.length > 0 ? iconT : ['MAIN'];
      }
      break;
    case '自':
      effectType = 'AUTO';
      // ⚠timing 判定は trigText（＝先頭のトリガー句だけ・上の定義参照）で行う。actionText 全体を見ると、
      //   トリガー句より後ろの本文や引用付与の内側にある「…したとき」を先に拾って timing が化ける（タスク17）。
      timing = trigText.includes('《ヘブン》したとき') ? ['ON_HEAVEN']
             // 「他のシグニゾーンに移動したとき」は付与能力の引用内「アタックしたとき」より優先（WXK10-079 等）。
             : trigText.match(/他のシグニゾーンに移動したとき/) ? ['ON_ZONE_MOVED']
             : trigText.includes('このルリグがアタックしたとき') ? ['ON_ATTACK_LRIG']
             : trigText.includes('アタックしたとき') ? ['ON_ATTACK_SIGNI']
             : trigText.includes('バニッシュされたとき') ? ['ON_BANISH']
             // 「あなたの＜X＞のシグニが効果によって対戦相手のシグニをバニッシュしたとき」（WX07-036）。既存 ON_SIGNI_BANISH_OPPONENT（バトル経路のみ配線）と別＝効果バニッシュ経路。⚠engine未配線。トリガー文非除去・scope/filter は下で抽出
             : trigText.match(/効果によって対戦相手のシグニ[^。]{0,4}をバニッシュしたとき/) ? ['ON_SIGNI_BANISH_OPPONENT_BY_EFFECT']
             // 「（このシグニ／あなたの[他の][＜X＞の]シグニ）がバトルによって（対戦相手の）シグニN体をバニッシュしたとき」
             // ＝バトル勝利トリガー。**engine 配線済み**（BattleScreen の resolvePendingSigniBattleFor が
             // ON_SIGNI_BANISH_OPPONENT を triggerScope/usageLimit/condition 込みで収集する `battleBanishEntries`）。
             // 従来 parser がこの語彙を持たず **ON_PLAY へ誤フォールバック**していたため、31枚が「バトルでバニッシュ
             // したとき」ではなく「場に出たとき」に発火する幻覚になっていた（続き75で是正）。scope は下で抽出。
             : trigText.match(/バトルによって(?:対戦相手の)?シグニ[^。]{0,6}をバニッシュしたとき/) ? ['ON_SIGNI_BANISH_OPPONENT']
             // 同上の「バトルによって」が明記されない表記（19件）。**効果によるバニッシュは必ず「効果によって」と
             // 明記される**ため、明記が無い＝バトルによるバニッシュ（WX10-048「このシグニが対戦相手のシグニ1体を
             // バニッシュしたとき」等）。上の BY_EFFECT 判定が先に走るので効果バニッシュを奪わない。
             : trigText.match(/(?:この(?:シグニ|カード)|あなたの(?:他の)?(?:＜[^＞]+＞の)?シグニ)(?:[０-９\d]+体)?が対戦相手のシグニ[^。]{0,6}をバニッシュしたとき/) ? ['ON_SIGNI_BANISH_OPPONENT']
             // 「あなたの他の＜X＞のシグニが場に出るか、あなたの効果によって対戦相手が手札を捨てたとき」（WXDi-P11-064）＝複合ORトリガー。⚠engine未配線。トリガー文非除去・filter は下で抽出
             : trigText.match(/あなたの他の＜[^＞]+＞のシグニ[^。]{0,4}が場に出るか[、,]?\s*あなたの効果によって対戦相手が手札を[^。]{0,4}捨てたとき/) ? ['ON_ALLY_PLAY_OR_OPP_HAND_DISCARD']
             // 「このシグニが対戦相手の、能力か効果の対象になったとき」（WXDi-P11-040/WX25-P2-055/WX25-CP1-060）。⚠engine未配線
             // 「対戦相手の**シグニの**、能力か効果の対象になったとき」（WXDi-P03-056/WXDi-P13-089）も同じ受け皿。
             : trigText.match(/対戦相手の(?:シグニの)?[、,]?\s*能力か効果の対象になったとき/) ? ['ON_TARGETED']
             // 「あなたのデッキがシャッフルされたとき」（PR-470A）。⚠engine未配線。トリガー文は除去しない（action 解析を変えないため）
             : trigText.match(/デッキがシャッフルされたとき/) ? ['ON_DECK_SHUFFLED']
             // 「あなたの他のシグニが【アサシン】か【ランサー】か【ダブルクラッシュ】を得たとき」（WXDi-P04-035）。⚠engine未配線。トリガー文非除去
             : trigText.match(/(?:【アサシン】|【ランサー】|【ダブルクラッシュ】)[^。]{0,40}を得たとき/) ? ['ON_KEYWORD_GAINED']
             // 「あなたのルリグの下からカードが移動したとき」（WXDi-P04-042）。⚠engine未配線。トリガー文非除去
             : trigText.match(/ルリグ[^。]{0,6}下から[^。]{0,8}移動したとき/) ? ['ON_LRIG_UNDER_MOVED']
             // 「あなたのルリグアタックステップ開始時」（WX25-CP1-042-E2）。⚠engine未配線。先頭アンカー＝句が action 内/付与内に出る WXK01-038/WXDi-CP02-059 を誤分類しない
             : trigText.match(/^あなたのルリグアタックステップ開始時/) ? ['ON_LRIG_ATTACK_STEP_START']
             // 「あなたのシグニが対戦相手のアーツの効果を受けたとき」（WXK11-019-E2 等）＝ON_OPP_ARTS_USE（配線済み）。トリガー文非除去
             : trigText.match(/対戦相手のアーツの効果を受けたとき/) ? ['ON_OPP_ARTS_USE']
             // 「あなた/対戦相手の[他の][センター]ルリグがグロウしたとき」（WXDi-P05-010 等）。⚠engine未配線。トリガー文非除去・scope は下で抽出
             : trigText.match(/(?:あなた|対戦相手)の(?:他の)?(?:センター)?ルリグがグロウしたとき/) ? ['ON_LRIG_GROW']
             // 「あなたが《コイン》を1枚以上支払ったとき」（WXDi-P15-055/069・WXDi-P16-057）。⚠engine未配線。トリガー文非除去
             : trigText.match(/あなたが《コイン[^》]*》を[^。]{0,8}支払ったとき/) ? ['ON_COIN_PAID']
             // 「《改造素材》が使用された/あなたが《改造素材》を使用したとき」（WXK09-047 等）。⚠engine未配線。トリガー文非除去・scope/cond は下で抽出
             : trigText.match(/《改造素材》[^。]{0,12}(?:使用された|使用した)とき/) ? ['ON_MATERIAL_USED']
             // 「（このシグニ／あなたの他のシグニが）開花したとき」=【シード】開花トリガー。場に出た扱いではないため ON_PLAY とは別（triggerScope は下で設定）。
             : trigText.includes('開花したとき') ? ['ON_BLOOM']
             : trigText.match(/対戦相手のライフ(?:クロス)?[^、。]*クラッシュ(?:した|された)とき/) ? ['ON_OPP_LIFE_CRASHED']
             : trigText.match(/(?:あなたの)?ライフ(?:クロス)?[^、。]*クラッシュされたとき/) ? ['ON_LIFE_CRASHED']
             : trigText.includes('場を離れたとき') ? ['ON_LEAVE_FIELD']
             // ⚠「手札から」**単独**が抜けていて11件が ON_PLAY へ誤フォールバックしていた（続き75・§3 Opusタスク16）。
             //   engine は `triggerCondition.fromZones` で領域を判定する（collectAnyZoneTrashSelfTriggers）＝下の
             //   fromZones 抽出にも同じく「手札」単独を足してある。「シグニの下から」は別（under）なので拾わない。
             : trigText.match(/(?:手札(?:かデッキ)?から|デッキから|場から|いずれかの領域から)トラッシュに置かれたとき/) ? ['ON_TRASH']
             : trigText.match(/トラッシュからエナゾーンに置かれたとき/) ? ['ON_ENERGY_FROM_TRASH']
             : trigText.match(/このシグニのパワーが[０-９\d]+以上になったとき/) ? ['ON_POWER_THRESHOLD']
             // 「（対戦相手／あなた）のシグニN体のパワーが0以下になったとき」（6件・続き76）。engine 配線済み
             //   （collectPowerZeroTriggers＝パワー0以下でバニッシュされる際に triggerScope で watcher を絞る）。
             //   ⚠engine は「0以下」専用（閾値付きの「N以下」は受け皿が無い）＝0 に限定してマッチする。scope は下で抽出。
             : trigText.match(/シグニ(?:[０-９\d]+体)?のパワーが[0０]以下になったとき/) ? ['ON_SIGNI_POWER_ZERO_OR_LESS']
             // 「あなたが【エナチャージ】をしたとき」（2件・続き76）も同じ受け皿（engine はエナゾーンが1枚増えたことを
             //   スナップショット差分で検知＝所有者自身の場のシグニが反応する）。
             //   ⚠「**対戦相手の**エナゾーンにカードN枚が置かれたとき」は engine の受け皿が無い（watcher は
             //     エナが増えた側の場しか走査しない）＝拾わない（§6.3 機構待ち）。
             : trigText.match(/あなたのエナゾーンに[^、。]*置かれたとき|あなたが【エナチャージ】をしたとき/) ? ['ON_ENERGY_CHARGE']
             // 「対戦相手の場に【ウィルス】Nつが置かれたとき」（2件）。engine 配線済み（collectSelfEventTriggers の ON_OPP_VIRUS_PLACED）。
             : trigText.match(/対戦相手の場に【ウィルス】[０-９\d]*つ?が置かれたとき/) ? ['ON_OPP_VIRUS_PLACED']
             // 「あなたの効果N つによって対戦相手のカードがN枚以上デッキに移動したとき」（2件）。engine 配線済み
             //   （collectMoveToDeckTriggers＝triggerCondition.movedToDeckOwner／movedToDeckMinCount）。cond は下で抽出。
             : trigText.match(/カードが[０-９\d]+枚以上デッキに移動したとき/) ? ['ON_CARD_MOVED_TO_DECK']
             : trigText.match(/このカードが.{0,40}手札から公開されたとき/) ? ['ON_REVEALED_FROM_HAND']
             : trigText.includes('血晶武装状態になったとき') ? ['ON_BLOOD_CRYSTAL_ARMOR']
             // 「（あなた/対戦相手/いずれかのプレイヤー）が（[色]の）スペルを使用したとき」（16件・§3 Opusタスク16）。
             // engine 配線済み＝スペル解決時に使用者の場（ルリグ＋シグニ）を走査（triggerFilter.color／usageLimit 対応）。
             // 続き75で triggerScope any_opp/any（相手/いずれかのプレイヤーの使用に反応）も engine に配線した。
             // ⚠「あなたが対戦相手のスペルを使用したとき」＝奪って使う側＝使用者は自分（self）。
             : /スペルを使用したとき/.test(trigText) ? ['ON_SPELL_USE']
             // 「このカードがエクシードのコストとしてルリグトラッシュに置かれたとき」（13件・§3 Opusタスク16）。
             // engine 配線済み＝エクシード支払い時に「ルリグトラッシュへ置かれたカード自身」の AUTO を発火
             // （`exceedPaidCards` 走査。※`triggerCondition.exceedCostPaidByPlayer` を持つ「あなたが支払ったとき」変種は
             //  場のシグニ側で発火する別経路＝そちらは MANUAL 管理）。ON_TRASH の regex は領域指定が先頭に要るため競合しない。
             : /エクシードのコストとしてルリグトラッシュに置かれたとき/.test(trigText) ? ['ON_EXCEED_COST']
             // 「このシグニがライズされたとき」（11件・§3 Opusタスク16）。engine 配線済み＝ライズ配置時に
             // **ライズされたシグニ自身**（self）の AUTO を収集。
             // ⚠「《X》にライズされたとき」（2件）は**下敷きになった側**の反応＝別機構なので拾わない（self とは主語が違う）。
             : /このシグニがライズされたとき/.test(trigText) ? ['ON_RISE']
             // 「（この/あなたの）シグニがドライブ状態になったとき」（15件・§3 Opusタスク16）。engine 配線済み
             // （collectSigniBecomesDriveTriggers＝triggerScope self/any_ally/any を評価）。scope は下で抽出。
             : /(?:この|あなたの)シグニ(?:[０-９\d]+体)?がドライブ状態になったとき/.test(trigText) ? ['ON_SIGNI_BECOMES_DRIVE']
             // 「（この/あなたの他の）カードが【ビート】になったとき」（8件）。engine 配線済み（self＝なったカード自身／
             // any_ally＝オーナーの場のシグニ）。scope は下で抽出。
             : /(?:この|あなたの(?:他の)?)カードが【ビート】になったとき/.test(trigText) ? ['ON_BECOME_BEAT']
             // 「あなたが（あなたのターンに）アーツを使用したとき」（7件）。engine 配線済み＝**使用者(caster)側のみ**
             // （collectArtsUseTriggers は triggerScope self 限定）。⚠「対戦相手がアーツを使用したとき」は engine の
             //   受け皿が別（ON_OPP_ARTS_USE 系）＝ここでは拾わない（誤って self 扱いにすると発火主体が逆になる）。
             : /あなた(?:のターンにあなた)?がアーツを使用したとき/.test(trigText) ? ['ON_ARTS_USE']
             // 「（ガードステップ以外で）（あなた／いずれかのプレイヤー）が手札をN枚捨てたとき」（9件・§3 Opusタスク16）。
             // engine 配線済み（collectHandDiscardTriggers）。**「ガードステップ以外で」は engine 側で構造的に担保**
             // されている＝ガードによる手札捨ては `hand_discarded_just`/`asCost` のどちらも立たない
             // （BattleScreen の performGuardResponse・同関数の doc コメント参照）ので、条件語彙は不要。
             // ⚠「（あなたの効果によって）対戦相手が手札を捨てたとき」は主語が相手＝engine に専用 scope が無く
             //   'any'（いずれかが捨てたとき）に倒すと自分の手札捨てでも発火する過剰効果になるため**拾わない**。
             // 「あなたが（手札から）（＜X＞の/《ディソナアイコン》の）シグニ/カードをN枚捨てたとき」（6件・続き76）
             //   ＝捨てたカードの種別限定は engine の `triggerFilter`（collectHandDiscardTriggers の matchesTrigFilter）で
             //   評価される。filter は下で抽出。
             : (/(?:あなた|いずれかのプレイヤー)が手札を[^。]{0,8}捨てたとき/.test(trigText)
                || /あなたが(?:手札から)?(?:＜[^＞]+＞の|《ディソナアイコン》の)?(?:シグニ|カード)を[０-９\d]+枚捨てたとき/.test(trigText)) ? ['ON_HAND_DISCARDED']
             // 「（この／あなたの）シグニ[N体]に【アクセ】が付いたとき」（8件・§3 Opusタスク16）。engine 配線済み
             // ＝ATTACH_ACCE 完了後の checkAndFireOnAcceTriggersForOwner。**受け皿がカード種別で分かれる**＝
             //   シグニ＝ON_ACCE（場のシグニを走査。scope self＝アクセが付いた当のシグニ／any_ally＝あなたのシグニ全体）、
             //   ルリグ＝ON_ACCE_ATTACH（ルリグ監視の別ループ）。scope は下で抽出。
             // ⚠「このカードが【アクセ】としてシグニに付いたとき」（アクセカード自身の反応）は別＝この regex に当たらない。
             : /(?:この|あなたの)シグニ(?:[０-９\d]+体)?に【アクセ】が付いたとき/.test(trigText)
                 ? (_parsingBaseType === 'ルリグ' ? ['ON_ACCE_ATTACH'] : ['ON_ACCE'])
             // 「（あなた／対戦相手／いずれかのプレイヤー）がリフレッシュしたとき」（6件）。engine 配線済み
             // （collectRefreshTriggers＝triggerCondition.refreshedOwner で発生源を判定）。owner は下で抽出。
             : /(?:あなた|対戦相手|いずれかのプレイヤー)がリフレッシュしたとき/.test(trigText) ? ['ON_REFRESH']
             // 「あなたの効果によって（対戦相手の）エナゾーンからカードN枚がトラッシュに置かれたとき」（3件）。
             // engine 配線済み（collectEnergyToTrashTriggers＝triggerCondition.energyTrashedOwner で発生源エナを判定）。
             // ⚠「あなたの効果によって」限定は engine 側で未表現＝既知の近似（engine の doc コメント参照）。
             : (/(?:エナゾーンからカード[^。]{0,8}が|エナゾーンからカードが合計[０-９\d]+枚以上)トラッシュに置かれたとき/.test(trigText)) ? ['ON_ENERGY_TO_TRASH']
             // 「（対戦相手／あなた）のシグニN体が凍結状態になったとき」（3件）。engine 配線済み
             // （collectFreezeTriggers＝triggerScope any_opp 既定／any_ally／any）。scope は下で抽出。
             : /シグニ(?:[０-９\d]+体)?が凍結状態になったとき/.test(trigText) ? ['ON_SIGNI_FROZEN']
             // 「あなたの[＜X＞の]シグニの効果によって対戦相手のシグニ[N体]のパワーが減ったとき」（4件・毒牙）。
             // engine 配線済み（collectPowerDecreaseTriggers＝temp_power_mods の新規負 delta を set-diff で検出）。
             // ⚠発生源フィルタ（「＜毒牙＞のシグニの効果によって」「他の」）は engine が未表現＝落とす近似（下で刻印）。
             : /対戦相手のシグニ(?:[０-９\d]+体)?のパワーが減ったとき/.test(trigText) ? ['ON_OPP_POWER_DECREASED']
             // 「あなたの＜X＞のシグニの【出】【起】能力のコストとしてこのカードが捨てられたとき」（4件）。
             // engine 配線済み（collectHandDiscardTriggers の asCost 分岐＝捨てられたカード自身の AUTO を発火）。
             // ⚠「どの能力のコストとして捨てられたか」のフィルタは engine が未表現＝落とす近似（下で刻印）。
             : /能力のコストとしてこのカードが捨てられたとき/.test(trigText) ? ['ON_DISCARDED_AS_COST']
             // 「あなたが【ガード】したとき」（2件）。engine 配線済み（collectSelfEventTriggers の ON_GUARD）。
             : /あなたが【ガード】したとき/.test(trigText) ? ['ON_GUARD']
             // 「（あなたか）対戦相手がアーツを使用したとき」（4件）。engine 配線済み（collectOppArtsUseTriggers＝相手の
             // アーツ使用に自分の場が反応）。既存の「対戦相手のアーツの効果を受けたとき」と同じ受け皿。
             // ⚠「**あなたか**対戦相手が」（WX16-003）は**どちらの使用でも**発火する＝ON_ARTS_USE（使用者側・
             //   collectArtsUseTriggers）と両方を持たせる（片方だけだと自分のアーツ使用を取りこぼす）。
             : /あなたか対戦相手がアーツを使用したとき/.test(trigText) ? ['ON_ARTS_USE', 'ON_OPP_ARTS_USE']
             : /対戦相手がアーツを使用したとき/.test(trigText) ? ['ON_OPP_ARTS_USE']
             // 「（効果N つによって）（あなた/対戦相手）のデッキからカードが（N枚以上）トラッシュに置かれたとき」（6件）。
             // engine 配線済み（collectMillTriggers＝triggerCondition.milledDeckOwner／milledMinCount）。
             // ⚠ON_TRASH の regex は「デッキから」の直後が「トラッシュに置かれたとき」でないと当たらないので競合しない。
             : /の(?:デッキ|山札)からカード(?:が[０-９\d]+枚以上|[０-９\d]+枚が|が)トラッシュに置かれたとき/.test(trigText) ? ['ON_CARD_MILLED_FROM_DECK']
             // 「あなたが自分の効果によって手札からカードをN枚以上公開したとき」（6件）。engine 配線済み
             // （BattleScreen＝場のシグニ自身が反応。G198）。
             : /あなたが自分の効果によって手札からカードを[０-９\d]+枚以上公開したとき/.test(trigText) ? ['ON_SELF_REVEAL_FROM_HAND']
             // 「対戦相手のシグニN体がこのシグニの正面に配置されたとき」（3件）。engine 配線済み
             // （collectFieldTriggers の `triggerCondition.placedFront`＝正面ゾーン一致を判定）。timing は ON_PLAY のまま。
             : /対戦相手のシグニ(?:[０-９\d]+体)?がこのシグニの正面に配置されたとき/.test(trigText) ? ['ON_PLAY']
             // 「（あなたの）シグニN体が場から手札に戻ったとき」（4件）。engine 配線済み
             // （collectLeaveFieldTriggers の `triggerCondition.leftToZone:'hand'`＝離れたカードが手札に在中する場合のみ）。
             : /シグニ(?:[０-９\d]+体)?が場から手札に戻ったとき/.test(trigText) ? ['ON_LEAVE_FIELD']
             : trigText.includes('アタックフェイズ開始時') ? ['ON_ATTACK_PHASE_START']
             // 「（あなた/対戦相手の）メインフェイズ開始時」（29件・§3 Opusタスク16 の最大クラスタ）。engine 配線済み
             // ＝GROW→MAIN 移行時に collectTurnTriggers が収集（triggerScope self/any_opp も評価）。parser に語彙が
             // 無いため ON_PLAY（＝「場に出たとき」）へ誤フォールバックしていた＝召喚しただけで発火する幻覚。
             // ⚠「次の（次の）あなたのメインフェイズ開始時」＝**遅延トリガー**（設置して次ターンに発火）は別機構なので除外。
             : (/メインフェイズ開始時/.test(trigText) && !/次の(?:次の)?あなたのメインフェイズ開始時/.test(trigText)) ? ['ON_MAIN_PHASE_START']
             : trigText.includes('ライフバーストが発動したとき') ? ['ON_LIFE_BURST']
             // 「あなたがカードをN枚引いたとき」= ドロー時トリガー（G089）。「ターン終了時まで」より先に判定する。
             : /(?:あなたが)?カードを[０-９\d]+枚引いたとき/.test(trigText) ? ['ON_DRAW']
             // 「ターン終了時まで」は持続期間指定であってトリガーではない（G085「ターン終了時まで、このシグニのパワーを＋N」）。
             // 実トリガーの「ターン終了時、/に」のみ ON_TURN_END とする。
             : /ターン終了時(?!まで)/.test(trigText) ? ['ON_TURN_END']
             : trigText.includes('ターン開始時') ? ['ON_TURN_START']
             // ⚠ここに落ちる＝【自】なのに timing 判定が全て外れて ON_PLAY（「場に出たとき」）になった。原文に
             //   「…とき/…時」があるならそれは別トリガーの取りこぼし＝timing 語彙の欠落。計器に刻む（parseStatus は不変）。
             : (logTimingFallback(`${cardNum}-E${index + 1}`, actionText), ['ON_PLAY']);
      // ON_TURN_END / ON_TURN_START: トリガー元ターンの所有者を triggerScope に抽出（actionText 非改変）。
      //   「対戦相手のターン終了/開始時」= any_opp（能力保持シグニが相手のターン境界に反応。collectTurnTriggers の
      //     相手フィールド any_opp/any 分岐が拾う）／「あなたの/自分のターン…」or 無指定 = self（既定）。
      //   ⚠ 引用付与（GRANT_FIELD_SIGNI_ABILITY/GRANT_EFFECT）の granted サブ能力も parseBlock 経由で本抽出を通る＝
      //     「対戦相手のターン終了時…を得る」型（WX21-056/061 等）の triggerScope 欠落（既定 self で誤発火）を是正。
      if (timing[0] === 'ON_TURN_END' || timing[0] === 'ON_TURN_START') {
        // トリガー句限定（直後が読点＝トリガー）。「対戦相手のターン終了時まで」（持続期間）は
        // 別効果の duration であり誤爆させない（WX24-P2-059＝トリガーは「あなたのターン終了時」self）。
        if (/対戦相手のターン(?:終了|開始)時(?:に)?[、,]/.test(actionText)) extractedTriggerScope = 'any_opp';
      }
      // ON_MAIN_PHASE_START も同じく主語で scope を決める（「対戦相手のメインフェイズ開始時」＝any_opp・1件）。
      if (timing[0] === 'ON_MAIN_PHASE_START') {
        if (/対戦相手のメインフェイズ開始時/.test(actionText)) extractedTriggerScope = 'any_opp';
      }
      // ON_SIGNI_BECOMES_DRIVE / ON_BECOME_BEAT: 主語で scope を決める。
      //   「このシグニ/このカードが…」＝self（既定）／「あなたの[他の]シグニ・カードが…」＝any_ally（「他の」は excludeSelf）。
      if (timing[0] === 'ON_SIGNI_BECOMES_DRIVE') {
        if (/あなたのシグニ(?:[０-９\d]+体)?がドライブ状態になったとき/.test(actionText)) extractedTriggerScope = 'any_ally';
      }
      if (timing[0] === 'ON_BECOME_BEAT') {
        const beatM = actionText.match(/あなたの(他の)?カードが【ビート】になったとき/);
        if (beatM) {
          extractedTriggerScope = 'any_ally';
          if (beatM[1]) extractedTriggerFilter = { ...(extractedTriggerFilter ?? {}), excludeSelf: true };
        }
      }
      // ON_HAND_DISCARDED: 主語で scope を決める（「あなたが」＝self 既定／「いずれかのプレイヤーが」＝any）。
      if (timing[0] === 'ON_HAND_DISCARDED') {
        if (/いずれかのプレイヤーが手札を/.test(actionText)) extractedTriggerScope = 'any';
      }
      // ON_ACCE: 主語で scope を決める（「このシグニに」＝self 既定＝アクセが付いた当のシグニのみ／
      //   「あなたのシグニN体に」＝any_ally＝あなたの場のシグニ全体が反応）。
      if (timing[0] === 'ON_ACCE') {
        if (/あなたのシグニ(?:[０-９\d]+体)?に【アクセ】が付いたとき/.test(actionText)) extractedTriggerScope = 'any_ally';
      }
      // ON_CARD_MILLED_FROM_DECK: 削られたデッキの持ち主と枚数閾値を triggerCondition に抽出。
      //   ⚠「あなたの＜X＞のシグニの効果1つによって」の**発生源フィルタ**は engine が未表現＝落とす近似（下で刻印）。
      if (timing[0] === 'ON_CARD_MILLED_FROM_DECK') {
        const mo = /いずれかのプレイヤーの(?:デッキ|山札)からカード/.test(actionText) ? 'any'
          : /対戦相手の(?:デッキ|山札)からカード/.test(actionText) ? 'opponent' : 'self';
        const mc = actionText.match(/カードが([０-９\d]+)枚以上トラッシュに置かれたとき/)
                ?? actionText.match(/カード([０-９\d]+)枚がトラッシュに置かれたとき/);
        extractedTriggerCondObj = {
          ...(extractedTriggerCondObj ?? {}),
          milledDeckOwner: mo,
          milledMinCount: mc ? parseInt(toHalf(mc[1]), 10) : 1,
        };
        if (/(?:＜[^＞]+＞の)シグニの効果/.test(actionText)) {
          markSilentFallback('ON_CARD_MILLED_FROM_DECK:発生源フィルタ（＜X＞のシグニの効果）を落とす近似');
        }
      }
      // ON_SIGNI_POWER_ZERO_OR_LESS: 0以下になったシグニの持ち主で scope を決める（engine 既定は 'any'）。
      if (timing[0] === 'ON_SIGNI_POWER_ZERO_OR_LESS') {
        if (/対戦相手のシグニ(?:[０-９\d]+体)?のパワーが[0０]以下になったとき/.test(actionText)) extractedTriggerScope = 'any_opp';
        else if (/あなたのシグニ(?:[０-９\d]+体)?のパワーが[0０]以下になったとき/.test(actionText)) extractedTriggerScope = 'any_ally';
        else if (/このシグニのパワーが[0０]以下になったとき/.test(actionText)) extractedTriggerScope = 'self';
      }
      // ON_CARD_MOVED_TO_DECK: デッキに移動したカードの持ち主と枚数閾値を triggerCondition に抽出。
      //   「あなたの**トラッシュから**カードがN枚以上デッキに移動したとき」（WX22-014）は fromTrash 限定（engine が別カウンタで数える）。
      if (timing[0] === 'ON_CARD_MOVED_TO_DECK') {
        const cnt = actionText.match(/カードが([０-９\d]+)枚以上デッキに移動したとき/);
        const fromTrash = /あなたのトラッシュから[^。]{0,12}デッキに移動したとき/.test(actionText);
        const owner = /対戦相手の(?:カード|トラッシュ)/.test(actionText) ? 'opponent'
          : (fromTrash || /あなたのカード/.test(actionText)) ? 'self' : 'any';
        extractedTriggerCondObj = {
          ...(extractedTriggerCondObj ?? {}),
          movedToDeckOwner: owner,
          movedToDeckMinCount: cnt ? parseInt(toHalf(cnt[1]), 10) : 1,
          ...(fromTrash ? { movedToDeckFromTrash: true } : {}),
        };
      }
      // ON_PLAY + placedFront（「対戦相手のシグニN体がこのシグニの正面に配置されたとき」）: 相手の配置に反応（any_opp）。
      if (timing[0] === 'ON_PLAY' && /対戦相手のシグニ(?:[０-９\d]+体)?がこのシグニの正面に配置されたとき/.test(actionText)) {
        extractedTriggerScope = 'any_opp';
        extractedTriggerCondObj = { ...(extractedTriggerCondObj ?? {}), placedFront: true };
      }
      // ON_LEAVE_FIELD + leftToZone:'hand'（「シグニN体が場から手札に戻ったとき」）: 主語で scope を決める
      //   （「あなたのシグニ」＝any_ally／主語なしの「シグニ1体が」＝any＝どちらの場のシグニでも反応）。
      if (timing[0] === 'ON_LEAVE_FIELD' && /シグニ(?:[０-９\d]+体)?が場から手札に戻ったとき/.test(actionText)) {
        extractedTriggerCondObj = { ...(extractedTriggerCondObj ?? {}), leftToZone: 'hand' };
        extractedTriggerScope = /あなたのシグニ(?:[０-９\d]+体)?が場から手札に戻ったとき/.test(actionText) ? 'any_ally' : 'any';
      }
      // ON_HAND_DISCARDED の triggerFilter（捨てたカードの種別限定）＝「＜X＞のシグニ」「《ディソナアイコン》のカード」「シグニ」。
      if (timing[0] === 'ON_HAND_DISCARDED') {
        const hdM = actionText.match(/あなたが(?:手札から)?(＜[^＞]+＞の|《ディソナアイコン》の)?(シグニ|カード)を[０-９\d]+枚捨てたとき/);
        if (hdM) {
          const cls = hdM[1];
          const f: Record<string, unknown> = {};
          if (cls?.startsWith('＜')) f.story = cls.slice(1, -2);        // 「＜アーム＞の」→ アーム
          else if (cls) f.isDisona = true;                              // 《ディソナアイコン》の（curated の慣例＝isDisona）
          if (hdM[2] === 'シグニ') f.cardType = 'シグニ';
          if (Object.keys(f).length > 0) extractedTriggerFilter = { ...(extractedTriggerFilter ?? {}), ...f };
        }
      }
      // ON_OPP_ARTS_USE: 「対戦相手が**使用**したとき」と既存の「対戦相手のアーツの**効果を受けた**とき」は
      //   engine の受け皿は同じだが原文が違う＝逆翻訳の描画を分けるため any_opp を刻む（engine は scope を見ない）。
      if (timing[0] === 'ON_OPP_ARTS_USE' && /対戦相手がアーツを使用したとき/.test(actionText)) {
        extractedTriggerScope = 'any_opp';
      }
      // ON_REFRESH: リフレッシュした側を triggerCondition.refreshedOwner に抽出（省略時 engine 既定 = any）。
      if (timing[0] === 'ON_REFRESH') {
        const ro = /あなたがリフレッシュしたとき/.test(actionText) ? 'self'
          : /対戦相手がリフレッシュしたとき/.test(actionText) ? 'opponent'
          : /いずれかのプレイヤーがリフレッシュしたとき/.test(actionText) ? 'any' : undefined;
        if (ro) extractedTriggerCondObj = { ...(extractedTriggerCondObj ?? {}), refreshedOwner: ro };
      }
      // ON_ENERGY_TO_TRASH: どちらのエナゾーンから置かれたかを triggerCondition.energyTrashedOwner に抽出。
      if (timing[0] === 'ON_ENERGY_TO_TRASH') {
        const eo = /対戦相手のエナゾーンから/.test(actionText) ? 'opponent'
          : /あなたのエナゾーンから/.test(actionText) ? 'self' : undefined;
        if (eo) extractedTriggerCondObj = { ...(extractedTriggerCondObj ?? {}), energyTrashedOwner: eo };
      }
      // ON_SIGNI_FROZEN: 凍結されたシグニの持ち主で scope を決める（「対戦相手の」＝any_opp〔engine 既定〕／「あなたの」＝any_ally）。
      if (timing[0] === 'ON_SIGNI_FROZEN') {
        if (/あなたのシグニ(?:[０-９\d]+体)?が凍結状態になったとき/.test(actionText)) extractedTriggerScope = 'any_ally';
      }
      // ON_OPP_POWER_DECREASED: 発生源の限定（「＜X＞のシグニの効果によって」「他の」）は engine が未表現＝落とす近似。
      //   その分だけ過剰発火しうる（自分の別効果でパワーを減らしても発火する）ので計器に刻む。
      if (timing[0] === 'ON_OPP_POWER_DECREASED' && /(?:＜[^＞]+＞の|他の)シグニの効果によって/.test(actionText)) {
        markSilentFallback('ON_OPP_POWER_DECREASED:発生源フィルタ（＜X＞/他のシグニの効果）を落とす近似');
      }
      // ON_DISCARDED_AS_COST: 「あなたの＜X＞のシグニの【出】【起】能力のコストとして」の発生源クラス限定を
      //   triggerCondition.discardCostSourceStory に抽出（engine が host シグニの CardClass で判定・続き162 タスク12(xxiv)）。
      //   ＜X＞が無い（クラス無指定）ときは従来どおり限定なし。
      if (timing[0] === 'ON_DISCARDED_AS_COST') {
        const dcs = actionText.match(/(?:あなたの)?＜([^＞]+)＞のシグニの【[^】]+】(?:【[^】]+】)?能力のコストとして/);
        if (dcs) extractedTriggerCondObj = { ...(extractedTriggerCondObj ?? {}), discardCostSourceStory: dcs[1] };
      }
      // ON_SPELL_USE: 使用者（主語）を triggerScope に、スペルの色を triggerFilter.color に抽出。
      //   「あなたが…」＝self（既定）／「対戦相手が…」＝any_opp／「いずれかのプレイヤーが…」＝any。
      //   ⚠「あなたが**対戦相手のスペル**を使用したとき」は使用者が自分＝self（「対戦相手が」より先に判定しない）。
      if (timing[0] === 'ON_SPELL_USE') {
        if (/対戦相手が(?:[^。]{0,8}の)?スペルを使用したとき/.test(actionText)) extractedTriggerScope = 'any_opp';
        else if (/いずれかのプレイヤーが(?:[^。]{0,8}の)?スペルを使用したとき/.test(actionText)) extractedTriggerScope = 'any';
        const colM = actionText.match(/([白赤青緑黒])のスペルを使用したとき/);
        if (colM) extractedTriggerFilter = { ...(extractedTriggerFilter ?? {}), color: colM[1] };
      }
      // ON_ATTACK_SIGNI: トリガー元（このシグニ/あなたのシグニ等）のスコープを抽出
      if (timing[0] === 'ON_ATTACK_SIGNI') {
        const selfAttM = actionText.match(/^このシグニがアタックしたとき、/);
        if (selfAttM) {
          extractedTriggerScope = 'self';
        } else {
          const allyColorM = actionText.match(/^あなたの([白赤青緑黒])のシグニがアタックしたとき、/);
          const oppAttM = actionText.match(/^対戦相手の(?:(?:すべての|各)?)(?:＜([^＞]+)＞の)?シグニ(?:[０-９\d]+体)?がアタックしたとき[、,]/);
          if (allyColorM) {
            extractedTriggerScope = 'any_ally';
            extractedTriggerFilter = { color: allyColorM[1] };
          } else if (/^あなたのシグニがアタックしたとき、/.test(actionText)) {
            extractedTriggerScope = 'any_ally';
          } else if (oppAttM) {
            // 「対戦相手の（＜X＞の）シグニがアタックしたとき」: 防御側シグニが相手アタックに反応（any_opp）
            extractedTriggerScope = 'any_opp';
            if (oppAttM[1]) extractedTriggerFilter = { story: oppAttM[1] };
          }
        }
      }
      // ON_BLOOM: トリガー元のスコープを抽出（「このシグニが開花したとき」=self／「あなたの[他の]シグニが開花したとき」=any_ally）
      if (timing[0] === 'ON_BLOOM') {
        if (/^このシグニが開花したとき[、,]/.test(actionText)) {
          extractedTriggerScope = 'self';
        } else if (/あなたの(?:他の)?(?:＜([^＞]+)＞の)?シグニ(?:[０-９\d]+体)?が開花したとき/.test(actionText)) {
          extractedTriggerScope = 'any_ally';
          const storyBloomM = actionText.match(/あなたの(?:他の)?＜([^＞]+)＞のシグニ(?:[０-９\d]+体)?が開花したとき/);
          if (storyBloomM) extractedTriggerFilter = { story: storyBloomM[1] };
        } else {
          extractedTriggerScope = 'self';
        }
      }
      // ON_LEAVE_FIELD: トリガー元のスコープを抽出（「このシグニ」=self／「あなたの＜X＞のシグニが」=any_ally＋triggerFilter）
      if (timing[0] === 'ON_LEAVE_FIELD') {
        // 「(対戦相手|あなた)のターンの間、」前置きは turnOwner に落とし、主語判定はこの後の残り文で行う（WX19-003「相手ターン中、あなたの水獣が離れたとき」）
        const leaveScan = actionText.replace(/^(対戦相手|あなた)のターンの間、/, (_m, who) => {
          extractedTriggerCondObj = { ...(extractedTriggerCondObj ?? {}), turnOwner: who === '対戦相手' ? 'opponent' : 'self' };
          return '';
        });
        const selfLeaveM = leaveScan.match(/^このシグニが場を離れたとき[、,]/);
        if (!selfLeaveM) {
          const allyLeaveM = leaveScan.match(/^あなたの(?:＜([^＞]+)＞の)?シグニ(?:[０-９\d]+体)?が場を離れたとき[、,]/);
          if (allyLeaveM) {
            extractedTriggerScope = 'any_ally';
            if (allyLeaveM[1]) extractedTriggerFilter = { story: allyLeaveM[1] };
          }
        }
        // アクション部分の抽出は parseSingleSentence 側のプレフィックス除去に委ねる
      }
      // ON_PLAY: 「あなたの[＜X＞の]シグニ[N体]が（効果によって）場に出たとき」= any_ally＋triggerFilter。「効果によって」= byEffect 限定
      if (timing[0] === 'ON_PLAY') {
        // 「傀儡状態の」修飾＝placedPuppet（WDK17-001）。「他の」「＜X＞の」と同様にあなたのシグニ全体（any_ally）の一種。
        const allyPlayM = actionText.match(/^あなたの(他の)?(傀儡状態の)?(?:＜([^＞]+)＞の)?シグニ(?:[０-９\d]+体)?が(効果によって)?場に出たとき[、,]\s*(.+)/s);
        // 「あなたのレゾナ[N体]が場に出たとき」= any_ally＋cardType:レゾナ（レゾナは効果でのみ場に出る。G148）
        const allyResonaPlayM = !allyPlayM && actionText.match(/^あなたのレゾナ(?:[０-９\d]+体)?が場に出たとき[、,]\s*(.+)/s);
        // 所有者指定なしの「シグニ[N体]が場に出たとき」= any（両者のシグニ。自身も含む。G085「（このシグニが場に出たときも発動する）」）。
        const anyPlayM = !allyPlayM && !allyResonaPlayM && actionText.match(/^シグニ(?:[０-９\d]+体)?が場に出たとき[、,]\s*(.+)/s);
        if (allyPlayM) {
          extractedTriggerScope = 'any_ally';
          const tf: NonNullable<typeof extractedTriggerFilter> = {};
          if (allyPlayM[1]) tf.excludeSelf = true; // 「他の」＝自身を除く
          if (allyPlayM[3]) tf.story = allyPlayM[3];
          if (Object.keys(tf).length) extractedTriggerFilter = tf;
          if (allyPlayM[2]) extractedTriggerCondObj = { ...(extractedTriggerCondObj ?? {}), placedPuppet: true }; // 「傀儡状態の」
          if (allyPlayM[4]) extractedTriggerCondObj = { ...(extractedTriggerCondObj ?? {}), byEffect: true };
          actionText = allyPlayM[5];
        } else if (allyResonaPlayM) {
          extractedTriggerScope = 'any_ally';
          extractedTriggerFilter = { cardType: 'レゾナ' };
          actionText = allyResonaPlayM[1];
        } else if (anyPlayM) {
          extractedTriggerScope = 'any';
          actionText = anyPlayM[1];
        } else {
          // 「（このシグニが）（シグニの）効果によって場に出たとき」= self 限定。
          // 「シグニの効果によって」= bySigniEffect（シグニの効果のみ）／「効果によって」= byEffect（任意の効果）。
          const selfBySigniM = actionText.match(/^(?:このシグニが)?シグニの効果によって場に出たとき[、,]\s*(.+)/s);
          const selfByEffM = actionText.match(/^(?:このシグニが)?効果によって場に出たとき[、,]\s*(.+)/s);
          if (selfBySigniM) {
            extractedTriggerCondObj = { ...(extractedTriggerCondObj ?? {}), bySigniEffect: true };
            actionText = selfBySigniM[1];
          } else if (selfByEffM) {
            extractedTriggerCondObj = { ...(extractedTriggerCondObj ?? {}), byEffect: true };
            actionText = selfByEffM[1];
          }
        }
      }
      // ON_LIFE_CRASHED / ON_OPP_LIFE_CRASHED: 自分ライフ＝triggerScope:self。トリガー文を除去
      if (timing[0] === 'ON_LIFE_CRASHED' || timing[0] === 'ON_OPP_LIFE_CRASHED') {
        if (timing[0] === 'ON_LIFE_CRASHED') extractedTriggerScope = 'self';
        // 「あなたのシグニが対戦相手のライフクロスをクラッシュしたとき」（能動態）もカバー
        const m = actionText.match(/^.*?クラッシュ(?:した|された)とき[、,]\s*(.+)/s);
        if (m) actionText = m[1];
      }
      // ON_MATERIAL_USED（《改造素材》使用）：主語を区別（actionText 非改変）。
      //   「あなたが…を使用したとき」＝materialUsedByPlayer／「あなたの他の…シグニに…使用されたとき」＝any_ally+excludeSelf／「このシグニに…使用されたとき」＝self 既定。
      if (timing[0] === 'ON_MATERIAL_USED') {
        if (/あなたが《改造素材》[^。]{0,12}を使用したとき/.test(actionText)) {
          extractedTriggerCondObj = { ...(extractedTriggerCondObj ?? {}), materialUsedByPlayer: true };
        } else if (/あなたの他の[^。]{0,8}シグニ[^。]{0,8}に《改造素材》が使用されたとき/.test(actionText)) {
          extractedTriggerScope = 'any_ally';
          extractedTriggerFilter = { ...(extractedTriggerFilter ?? {}), excludeSelf: true };
        }
      }
      // ON_LRIG_GROW（「あなた/対戦相手の[他の]ルリグがグロウしたとき」）：主語の所有者を triggerScope に抽出（actionText 非改変）。
      if (timing[0] === 'ON_LRIG_GROW') {
        // 「あなたのターンの間、対戦相手のルリグがグロウしたとき」（WXDi-P13-047）の前置きを turnOwner へ落とす
        // （ON_LEAVE_FIELD と同型）。未抽出だと相手が自分のターンに通常グロウするだけで毎回誤発火する（続き73の実機観測）。
        const growScan = actionText.replace(/^(対戦相手|あなた)のターンの間、/, (_m, who) => {
          extractedTriggerCondObj = { ...(extractedTriggerCondObj ?? {}), turnOwner: who === '対戦相手' ? 'opponent' : 'self' };
          return '';
        });
        if (/対戦相手の(?:センター)?ルリグがグロウしたとき/.test(growScan)) extractedTriggerScope = 'any_opp';
        else {
          extractedTriggerScope = 'any_ally';
          if (/あなたの他の(?:センター)?ルリグがグロウしたとき/.test(growScan)) extractedTriggerFilter = { ...(extractedTriggerFilter ?? {}), excludeSelf: true };
        }
      }
      // ON_SIGNI_BANISH_OPPONENT（「…がバトルによって…をバニッシュしたとき」）：主語を triggerScope に抽出。
      //   「このシグニが」＝self（既定・バニッシュしたアタッカー自身のみ）／「あなたの[他の][＜X＞の]シグニが」＝any_ally（＋triggerFilter）。
      if (timing[0] === 'ON_SIGNI_BANISH_OPPONENT') {
        // 「あなたの[他の][＜X＞の]シグニが（バトルによって／対戦相手の）…」＝any_ally。「このシグニが」＝self。
        const subjM = actionText.match(/あなたの(他の)?(?:＜([^＞]+)＞の)?シグニ(?:[０-９\d]+体)?が(?:バトルによって|対戦相手の)/);
        if (subjM) {
          extractedTriggerScope = 'any_ally';
          const tf: NonNullable<typeof extractedTriggerFilter> = {};
          if (subjM[1]) tf.excludeSelf = true;
          if (subjM[2]) tf.story = subjM[2];
          if (Object.keys(tf).length) extractedTriggerFilter = tf;
        } else {
          extractedTriggerScope = 'self';
        }
      }
      // ON_SIGNI_BANISH_OPPONENT_BY_EFFECT（「あなたの＜X＞のシグニが効果によって…バニッシュしたとき」WX07-036）：主語を triggerScope:any_ally＋triggerFilter に抽出（actionText 非改変）。
      if (timing[0] === 'ON_SIGNI_BANISH_OPPONENT_BY_EFFECT') {
        const subjM = actionText.match(/^あなたの(他の)?(?:＜([^＞]+)＞の)?シグニが効果によって対戦相手のシグニ/);
        if (subjM) {
          extractedTriggerScope = 'any_ally';
          const tf: NonNullable<typeof extractedTriggerFilter> = {};
          if (subjM[1]) tf.excludeSelf = true;
          if (subjM[2]) tf.story = subjM[2];
          if (Object.keys(tf).length) extractedTriggerFilter = tf;
        }
      }
      // ON_ALLY_PLAY_OR_OPP_HAND_DISCARD（複合ORトリガー WXDi-P11-064）：「あなたの他の＜X＞の」を triggerFilter に抽出（triggerScope は設定せず・主語は decompiler の専用レンダリングが担う／actionText 非改変）。
      if (timing[0] === 'ON_ALLY_PLAY_OR_OPP_HAND_DISCARD') {
        const subjM = actionText.match(/あなたの(他の)?＜([^＞]+)＞のシグニ[^。]{0,4}が場に出るか/);
        if (subjM) {
          const tf: NonNullable<typeof extractedTriggerFilter> = {};
          if (subjM[1]) tf.excludeSelf = true;
          if (subjM[2]) tf.story = subjM[2];
          if (Object.keys(tf).length) extractedTriggerFilter = tf;
        }
      }
      // ON_TARGETED（「このシグニが対戦相手の、能力か効果の対象になったとき」）はトリガー文を除去しない。
      //   除去すると後続アクションの target/owner 解析が変わり手修正JSONと乖離するため、actionText 全体を parseSentence に委ねる
      //   （トリガー句は parseSentence 側で前置きとして消費される）。timing のみ ON_TARGETED に確定する。
      //   ただし主語が「あなたの[＜X＞/色]のシグニ」の場合は triggerScope:any_ally＋triggerFilter を抽出（actionText は非改変）。
      if (timing[0] === 'ON_TARGETED') {
        const subjM = actionText.match(/^あなたの(他の)?(?:＜([^＞]+)＞の|([赤青白緑黒])の)?シグニ(?:[０-９\d]+体)?が対戦相手の[、,]?\s*能力か効果の対象になったとき/);
        if (subjM) {
          extractedTriggerScope = 'any_ally';
          const tf: NonNullable<typeof extractedTriggerFilter> = {};
          if (subjM[1]) tf.excludeSelf = true;
          if (subjM[2]) tf.story = subjM[2];
          if (subjM[3]) tf.color = subjM[3];
          if (Object.keys(tf).length) extractedTriggerFilter = tf;
        }
      }
      // トリガー文を除去してアクション部分のみparseSentenceに渡す
      if (timing[0] === 'ON_HEAVEN') {
        const m = actionText.match(/このシグニが《ヘブン》したとき[、,]\s*(.+)/s);
        if (m) actionText = m[1];
      }
      if (timing[0] === 'ON_BANISH') {
        // 「(対戦相手|あなた)のターンの間、」前置き＝そのプレイヤーのターン限定（activeCondition TURN_OWNER）。
        // engine の ON_BANISH 自己トリガー収集（BattleScreen collectBanishTriggers）が activeCondition を評価する。
        // 【常】→ON_BANISH 再分類（G150）と同じ扱い。WXK04-065/067 等の【自】版がここに該当。
        const turnIntervalM = actionText.match(/^(対戦相手|あなた)のターンの間、(.+)/s);
        if (turnIntervalM) {
          forcedActiveCondition = { type: 'TURN_OWNER', owner: turnIntervalM[1] === '対戦相手' ? 'opponent' : 'self' };
          actionText = turnIntervalM[2];
        }
        // 「対戦相手の（＜X＞の）シグニ[N体]がバニッシュされたとき」= any_opp（相手シグニのバニッシュに反応。collectBanishTriggers step2 が triggerScope で処理）
        const oppBanM = actionText.match(/^対戦相手の(?:＜([^＞]+)＞の)?シグニ(?:[０-９\d]+体)?がバニッシュされたとき[、,]\s*(.+)/s);
        if (oppBanM) {
          extractedTriggerScope = 'any_opp';
          if (oppBanM[1]) extractedTriggerFilter = { story: oppBanM[1] };
          actionText = oppBanM[2];
        } else {
          // 「このシグニが（パワーN以下の場合）バニッシュされたとき、」のみ除去（前置き条件がある場合は除去しない）
          const m = actionText.match(/^(?:パワー[０-９\d]+以下の)?このシグニがバニッシュされたとき[、,]\s*(.+)/s);
          if (m) actionText = m[1];
        }
      }
      if (timing[0] === 'ON_ZONE_MOVED') {
        // 「（あなたの効果によって）（場にある）<主語>が（効果によって）他のシグニゾーンに移動したとき、」を除去し主語からスコープ判定。
        // 「このシグニ」=self／「対戦相手の(場にある)シグニ」=any_opp／「あなたの(場にある)シグニ」=any_ally／無主語「シグニ」=any。
        // パワー＋N（このシグニ自身）は MOVE_TO_OTHER_SIGNI_ZONE ハンドラ（execStubPart1）が原文を読んで適用済み。
        // ON_ZONE_MOVED トリガー自体は現状 engine 未配線（TODO 参照）。decompile の表現整合と ON_TURN_END/ON_PLAY 誤分類解消が目的。
        const zmM = actionText.match(/^(?:あなたの効果によって、?)?(?:場にある)?(対戦相手の|あなたの|この)?(?:場にある)?シグニ(?:[０-９\d]+体)?が(?:[０-９\d]+体以上)?(?:あなたの効果によって|効果によって)?他のシグニゾーンに移動したとき[、,]\s*(.+)/s);
        if (zmM) {
          const subj = zmM[1] ?? '';
          extractedTriggerScope = subj === '対戦相手の' ? 'any_opp'
            : subj === 'あなたの' ? 'any_ally'
            : subj === 'この' ? 'self'
            : 'any';
          actionText = zmM[2];
        }
      }
      if (timing[0] === 'ON_TRASH') {
        // 「レゾナの出現条件のために、〜トラッシュに置かれたとき」: レゾナ出現条件の支払い時のみ発火
        if (/レゾナの出現条件のために/.test(actionText)) {
          extractedTriggerCondObj = { ...(extractedTriggerCondObj ?? {}), forResonaCondition: true };
        }
        const m = actionText.match(/(手札(?:かデッキ)?|デッキ|場|いずれかの領域)からトラッシュに置かれたとき[、,]\s*(.+)/s);
        if (m) {
          // 出自ゾーンを fromZones に記録（「デッキから」=deck／「場から」=field／「手札かデッキから」=hand+deck）。
          const zoneStr = m[1];
          const zones: string[] = [];
          if (zoneStr.includes('手札')) zones.push('hand');
          if (zoneStr.includes('デッキ')) zones.push('deck');
          if (zoneStr === '場') zones.push('field');
          if (zones.length) extractedTriggerCondObj = { ...(extractedTriggerCondObj ?? {}), fromZones: zones as ('hand' | 'deck' | 'field')[] };
          actionText = m[2];
        }
        else {
          // 「対戦相手の効果によって〜」等のトリガー文を除去
          const m2 = actionText.match(/[^、。「」]{2,100}トラッシュに置かれたとき[、,]\s*(.+)/s);
          if (m2) actionText = m2[1];
        }
      }
      if (timing[0] === 'ON_ATTACK_PHASE_START') {
        // 「対戦相手の」=相手のアタックフェイズ→any_opp、「各」=any、それ以外（あなたの）=self
        if (/対戦相手のアタックフェイズ開始時/.test(actionText)) extractedTriggerScope = 'any_opp';
        else if (/各アタックフェイズ開始時/.test(actionText)) extractedTriggerScope = 'any';
        else extractedTriggerScope = 'self';
        const m = actionText.match(/(?:対戦相手の|あなたの|各)?アタックフェイズ開始時[、,]\s*(.+)/s);
        if (m) actionText = m[1];
      }
      if (timing[0] === 'ON_REVEALED_FROM_HAND') {
        const m = actionText.match(/このカードが.{0,40}手札から公開されたとき[、,]\s*(.+)/s);
        if (m) actionText = m[1];
      }
      if (timing[0] === 'ON_ENERGY_FROM_TRASH') {
        const m = actionText.match(/トラッシュからエナゾーンに置かれたとき[、,]\s*(.+)/s);
        if (m) actionText = m[1];
      }
      // ON_ENERGY_CHARGE: 「（あなたのターンの間、）あなたのエナゾーンにカード1枚が置かれたとき、」を除去。
      // 「あなたのターンの間」が前置されていれば IS_MY_TURN 条件を付与。発生源＝このシグニ自身（self）。
      if (timing[0] === 'ON_ENERGY_CHARGE') {
        extractedTriggerScope = 'self';
        if (/あなたのターンの間/.test(actionText)) extractedTriggerCondition = { type: 'IS_MY_TURN' };
        const m = actionText.match(/^.*?あなたのエナゾーンに[^、。]*置かれたとき[、,]\s*(.+)/s);
        if (m) actionText = m[1];
      }
      // ON_POWER_THRESHOLD: 「このシグニのパワーがN以上になったとき、」を除去し、閾値を SELF_POWER_GTE 条件に保持。
      if (timing[0] === 'ON_POWER_THRESHOLD') {
        extractedTriggerScope = 'self';
        const pm = actionText.match(/このシグニのパワーが([０-９\d]+)以上になったとき/);
        if (pm) extractedTriggerCondition = { type: 'SELF_POWER_GTE', value: parseNum(pm[1]) };
        const m = actionText.match(/このシグニのパワーが[０-９\d]+以上になったとき[、,]\s*(.+)/s);
        if (m) actionText = m[1];
      }
      if (timing[0] === 'ON_BLOOD_CRYSTAL_ARMOR') {
        const m = actionText.match(/(?:(?:あなたの|このシグニが?)(?:(?:＜[^＞]*＞の)?シグニ[１-９\d０-９]*体?が?)?血晶武装状態になったとき)[、,]\s*(.+)/s);
        if (m) actionText = m[1];
      }
      if (timing[0] === 'ON_LIFE_BURST') {
        const m = actionText.match(/(?:あなたか?(?:対戦相手の)?)?ライフバーストが発動したとき[、,]\s*(.+)/s);
        if (m) actionText = m[1];
      }
      // ON_DRAW: 「（あなたが）カードをN枚引いたとき、」を除去（G089）
      if (timing[0] === 'ON_DRAW') {
        const m = actionText.match(/(?:あなたが)?カードを[０-９\d]+枚引いたとき[、,]\s*(.+)/s);
        if (m) actionText = m[1];
      }
      mandatory = true;
      // ON_LEAVE_FIELD / ON_REVEALED_FROM_HAND / ON_LIFE_CRASHED / ON_TRASH の「〜してもよい」等は任意トリガー（発動しない選択可）
      if ((timing[0] === 'ON_LEAVE_FIELD' || timing[0] === 'ON_REVEALED_FROM_HAND'
           || timing[0] === 'ON_LIFE_CRASHED' || timing[0] === 'ON_OPP_LIFE_CRASHED'
           || timing[0] === 'ON_TRASH')
          && /もよい/.test(actionText)) mandatory = false;
      break;
    default: return null;
  }

  // 「このシグニのパワーがN以上の場合、」= SELF_POWER_GTE 条件に昇格（WXK05-073 等19枚の系統）。
  // ⚠読点「、」必須＝「〜の場合にしか使用できない」（使用条件文・extractUseCondition の領分）への誤マッチを防ぐ。
  // ⚠「代わりに」昇格型（WXDi-P01-054/WXDi-P02-061等）・多段閾値型（PR-470A等）は別構造のため除外（ガード）。
  if (actionText && /このシグニのパワーが([０-９\d]+)以上の場合、/.test(actionText)
      && !/代わりに/.test(actionText)
      && !/その後、?このシグニのパワーが/.test(actionText) // 中間節型（「その後、〜なら…」WXDi-P07-065等）は別構造＝昇格しない
      && (!costStr || costStr === '-') // 【起】（コスト付き）は evalUseCondition 配線が別途要＝AUTO系のみ昇格
      && (actionText.match(/以上の場合/g) ?? []).length === 1) {
    const pm = actionText.match(/このシグニのパワーが([０-９\d]+)以上の場合、/)!;
    const powCond = { type: 'SELF_POWER_GTE', value: parseNum(pm[1]) } as const;
    extractedTriggerCondition = extractedTriggerCondition
      ? { type: 'AND', conditions: [extractedTriggerCondition, powCond] }
      : powCond;
    actionText = actionText.replace(/、?このシグニのパワーが[０-９\d]+以上の場合、/, '、').replace(/^、/, '');
  }

  // 「このターンにあなたが(色)のアーツを使用していた場合」= 色別 ARTS_USED_THIS_TURN 条件に昇格（WX24-D1-11〜D4-11）。
  // 色なし版の規則より先に評価する（色なし規則は「(色)の」が挟まると match しないため従来は条件が丸ごと脱落していた）。
  // ⚠直後が「代わりに」の場合は効果全体のゲートではなく per-target 置換（基本を強化で置換）＝ここで hoist すると
  //   基本効果まで条件付きになり、かつ SEQUENCE 両実行の過剰効果になる（WX25-P3-116）。hoist せず actionText に
  //   残し、SEQUENCE 組み立ての「代わりに」昇格置換（matchLeadingStateCondition + STATE_CONDITION_CLAUSES の
  //   ARTS_USED_THIS_TURN エントリ）に委ねる。
  const artsColorMatch = actionText
    && !/このターンにあなたが(?:白|赤|青|緑|黒)のアーツを使用していた場合、?代わりに/.test(actionText)
    && actionText.match(/このターンにあなたが(白|赤|青|緑|黒)のアーツを使用していた場合/);
  if (artsColorMatch) {
    const artsColorCond = { type: 'ARTS_USED_THIS_TURN', owner: 'self', color: artsColorMatch[1] } as const;
    extractedTriggerCondition = extractedTriggerCondition
      ? { type: 'AND', conditions: [extractedTriggerCondition, artsColorCond] }
      : artsColorCond;
    actionText = actionText.replace(/、?このターンにあなたが(?:白|赤|青|緑|黒)のアーツを使用していた場合(?:、)?/, '、').replace(/^、/, '');
  }

  // 「このターンにあなたがアーツを使用していた場合」= ARTS_USED_THIS_TURN 条件に昇格（WX25-P1-106 等11枚の系統）。
  // アクション文中から条件節を除去し、発動条件に昇格する（turn_arts_used フラグを evalCondition が参照）。
  if (actionText && /このターンにあなたがアーツを使用していた場合/.test(actionText)) {
    const artsCond = { type: 'ARTS_USED_THIS_TURN', owner: 'self' } as const;
    extractedTriggerCondition = extractedTriggerCondition
      ? { type: 'AND', conditions: [extractedTriggerCondition, artsCond] }
      : artsCond;
    actionText = actionText.replace(/、?このターンにあなたがアーツを使用していた場合(?:、)?/, '、').replace(/^、/, '');
  }

  // 「このターンにあなたがスペルを使用していた場合」= SPELL_USED_THIS_TURN 条件に昇格（WX24-P1-068 等8枚の系統・続き110）。
  // ⚠(a) 直後が「代わりに」の場合は per-target 置換（WX25-P2-108）＝hoist せず STATE_CONDITION_CLAUSES_V2 の
  //     置換ゲート（matchLeadingStateCondition）に委ねる（色別 ARTS_USED と同じ扱い）。
  // ⚠(b) 節が①②③の選択肢内にある場合（WX25-P2-086/105＝②の選択肢別条件）は効果全体のゲートではない＝
  //     hoist せず、選択肢 action の parseSingleSentence CONDITIONAL 持ち上げ（STATE_CONDITION_CLAUSES_V2）に委ねる。
  if (actionText) {
    const spellCondIdx = actionText.indexOf('このターンにあなたがスペルを使用していた場合');
    const spellCondInChoice = spellCondIdx >= 0 && /[①②③④⑤]/.test(actionText.slice(0, spellCondIdx));
    if (spellCondIdx >= 0 && !spellCondInChoice
        && !/このターンにあなたがスペルを使用していた場合、?代わりに/.test(actionText)) {
      const spellCond = { type: 'SPELL_USED_THIS_TURN', owner: 'self' } as const;
      extractedTriggerCondition = extractedTriggerCondition
        ? { type: 'AND', conditions: [extractedTriggerCondition, spellCond] }
        : spellCond;
      actionText = actionText.replace(/、?このターンにあなたがスペルを使用していた場合(?:、)?/, '、').replace(/^、/, '');
    }
  }

  // CHOOSE ヘッダより前の「場にレベルN、レベルM、レベルKのシグニがある場合」は
  // 選択肢の一部ではなく効果全体の発動条件（PR-K073）。CHOOSE 分解はヘッダ以前を捨てるため、
  // 先に CardEffect.condition へ持ち上げる。
  const fieldLevelSetM = actionText?.match(/^あなたの場にレベル([０-９\d]+)、レベル([０-９\d]+)、レベル([０-９\d]+)のシグニがある場合、(?=以下の)/);
  if (fieldLevelSetM) {
    const levelSetCond: Condition = { type: 'AND', conditions: fieldLevelSetM.slice(1).map(level => ({
      type: 'HAS_CARD_IN_FIELD', owner: 'self', filter: { cardType: 'シグニ', level: parseNum(level) },
    })) };
    extractedTriggerCondition = extractedTriggerCondition
      ? { type: 'AND', conditions: [extractedTriggerCondition, levelSetCond] }
      : levelSetCond;
    actionText = actionText.slice(fieldLevelSetM[0].length);
  }

  // 「このシグニがトラッシュから場に出た場合」= 効果元がトラッシュ出自であることを条件化（WX03-034-E1）。
  // アクション文中から条件節を除去し、THIS_CARD_FROM_TRASH を発動条件に昇格する。
  if (actionText && /このシグニがトラッシュから場に出た場合/.test(actionText)) {
    extractedTriggerCondition = extractedTriggerCondition
      ? { type: 'AND', conditions: [extractedTriggerCondition, { type: 'THIS_CARD_FROM_TRASH' }] }
      : { type: 'THIS_CARD_FROM_TRASH' };
    actionText = actionText.replace(/、?このシグニがトラッシュから場に出た場合(?:、)?/, '、').replace(/^、/, '');
  }

  const cost = parseCost(costStr);
  // 「手札からこのカードを捨てる」起動能力は手札カードアクションUI（getMyHandCardActions）の対象。
  const handActivated = cost?.discardSelfFromHand === true;
  // 「このシグニ/カードをトラッシュから場に出す」等のトラッシュ自己起動【起】はトラッシュゾーンUIの対象。
  const trashActivated = effectType === 'ACTIVATED'
    && /(?:この(?:シグニ|カード)|トラッシュからこの(?:シグニ|カード))/.test(actionText)
    && actionText.includes('トラッシュ') && /(?:場に出す|シグニゾーンに出す)/.test(actionText);
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
      const eichiFb = consumeSilentFallbacks();
      logSilentFallbacks(`${cardNum}-E${index + 1}`, eichiFb);
      return {
        effectId: `${cardNum}-E${index + 1}`,
        effectType: 'CONTINUOUS',
        activeCondition,
        action: resolvedEichi,
        duration: 'PERMANENT',
        mandatory: true,
        parseStatus: eichiFb.length > 0 ? 'PARTIAL' : 'AUTO',
      };
    }
    // 多段「下にレベルNのシグニがあるかぎり、「Q」を得る。」は条件抽出ループより**前**に丸ごと取る
    // （1段目条件を genericKagiri に消費させない。WX24-P1-043＝続き77 Sonnet観測(b)）
    const multiStage = parseMultiStageUnderGrant(actionText);
    if (multiStage) {
      resolvedAction = multiStage;
    } else {
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
    // CONTINUOUS 限定の引用能力付与（このシグニは/場全体「Q」を得る）を先に試す（GRANT_FIELD_SIGNI_ABILITY）
    resolvedAction = parseContinuousQuotedGrant(remaining || actionText) ?? parseActionText(remaining || actionText);
    // 一部条件が解析済みで残りが未解析の場合のみPARTIAL
    // 全条件がundefinedの場合はAUTO（activeCondition=undefinedで動作は同じ）
    if (anyFound && anyFailed && parsedConds.length > 0) parseStatus = 'PARTIAL';
    }
  } else {
    // 使用条件（「この能力は〜にしか使用できない」）を抽出してからパース
    const extracted = extractUseCondition(actionText);
    if (extracted.condition) {
      useCondition = extracted.condition;
      actionText = extracted.cleaned;
    }
    resolvedAction = parseActionText(actionText);
  }
  // 無言フォールバック刻印をここで回収（以降のサブ展開 parseBlock は各自の効果内で回収する）
  const silentFb = consumeSilentFallbacks();

  // GRANT_ACCE_HOST_ABILITY: rawText から付与能力を展開（引用「…」ブロック or 引用符なしキーワード）。
  // 既存JSONの慣例に合わせ、付与能力の effectId は `{cardNum}-E{N}-G` とする。
  if (resolvedAction.type === 'GRANT_ACCE_HOST_ABILITY') {
    const gaa = resolvedAction as GrantAcceHostAbilityAction;
    const raw = gaa.rawText ?? '';
    const subBlocks = /[「『]/.test(raw)
      ? splitEffectBlocks(raw.replace(/^[『「]/, '').replace(/[』」]$/, ''))
      // 引用符なし（「…は【ランサー】を得る」等のキーワード付与）→ ホスト自身の能力として再構成
      : [`【常】：このシグニは${raw}を得る`];
    gaa.abilities = subBlocks
      .map((b, si) => {
        const e = parseBlock(cardNum, b, index);
        if (e) e.effectId = `${cardNum}-E${index + 1}-G${si > 0 ? si + 1 : ''}`;
        return e;
      })
      .filter((e): e is import('../types/effects').CardEffect => e !== null);
    delete gaa.rawText;
    const hasUnknownSub = gaa.abilities.length === 0 || gaa.abilities.some(e => e.parseStatus === 'UNKNOWN');
    parseStatus = hasUnknownSub ? 'PARTIAL' : 'AUTO';
  } else
  // GRANT_LRIG_ABILITY: rawText からサブ能力をここでパース（parseBlock が使えるタイミング）
  // rawTextが「。」だけ（句点のみ）の場合は、実際の能力は別のブロックで解析済みのためAUTO扱い
  if (resolvedAction.type === 'GRANT_LRIG_ABILITY') {
    const hasUnknownSub = expandGrantLrigAbilities(resolvedAction, cardNum);
    parseStatus = hasUnknownSub ? 'PARTIAL' : 'AUTO';
  } else
  // GRANT_FIELD_SIGNI_ABILITY: rawStages（多段「<条件>かぎり、「Q」を得る。」＝WX24-P1-043）を段ごとに
  // parseBlock し、各段の activeCondition（THIS_CARD_HAS_UNDER{filter} 等）を CardEffect へ注入して展開。
  if (resolvedAction.type === 'GRANT_FIELD_SIGNI_ABILITY' &&
      (resolvedAction as GrantFieldSigniAbilityAction).rawStages !== undefined) {
    const gfa = resolvedAction as GrantFieldSigniAbilityAction;
    gfa.abilities = (gfa.rawStages ?? [])
      .map((st, si) => {
        const e = parseBlock(cardNum, st.rawText.replace(/^[『「]/, '').replace(/[』」]$/, ''), index);
        if (e) {
          e.effectId = `${cardNum}-E${index + 1}-G${si > 0 ? si + 1 : ''}`;
          if (st.activeCondition) {
            e.activeCondition = e.activeCondition
              ? { type: 'AND', conditions: [st.activeCondition, e.activeCondition] }
              : st.activeCondition;
          }
        }
        return e;
      })
      .filter((e): e is import('../types/effects').CardEffect => e !== null);
    const stageCount = (gfa.rawStages ?? []).length;
    delete gfa.rawStages;
    const hasUnknownStage = gfa.abilities.length < stageCount
      || gfa.abilities.some(e => e.parseStatus === 'UNKNOWN' || e.parseStatus === 'PARTIAL');
    parseStatus = hasUnknownStage ? 'PARTIAL' : 'AUTO';
  } else
  // GRANT_FIELD_SIGNI_ABILITY: rawText（引用能力原文）を parseBlock で abilities へ展開（§5c 続き34）。
  // 付与能力の effectId は `{cardNum}-E{N}-G` とする（GRANT_ACCE と同慣例）。
  if (resolvedAction.type === 'GRANT_FIELD_SIGNI_ABILITY' &&
      (resolvedAction as GrantFieldSigniAbilityAction).rawText !== undefined) {
    const gfa = resolvedAction as GrantFieldSigniAbilityAction;
    const raw = gfa.rawText ?? '';
    const subBlocks = splitEffectBlocks(raw.replace(/^[『「]/, '').replace(/[』」]$/, ''));
    gfa.abilities = subBlocks
      .map((b, si) => {
        const e = parseBlock(cardNum, b, index);
        if (e) e.effectId = `${cardNum}-E${index + 1}-G${si > 0 ? si + 1 : ''}`;
        return e;
      })
      .filter((e): e is import('../types/effects').CardEffect => e !== null);
    delete gfa.rawText;
    const hasUnknownSub = gfa.abilities.length === 0 || gfa.abilities.some(e => e.parseStatus === 'UNKNOWN' || e.parseStatus === 'PARTIAL');
    parseStatus = hasUnknownSub ? 'PARTIAL' : 'AUTO';
  } else if (resolvedAction.type === 'UNKNOWN') {
    parseStatus = 'UNKNOWN';
  } else if (resolvedAction.type === 'SEQUENCE') {
    const seq = resolvedAction as SequenceAction;
    if (seq.steps.some(s => s.type === 'UNKNOWN')) parseStatus = 'PARTIAL';
  }
  // SEQUENCE 内の GRANT_FIELD_SIGNI_ABILITY rawText 展開（連用中止形「パワーは＋Nされ、…「Q」を得る」＝
  // SEQUENCE[POWER_MODIFY, GRANT]。WXDi-P11-046 等。collectGrantedFromLayer も SEQUENCE 直下を走査する）
  if (resolvedAction.type === 'SEQUENCE') {
    for (const stp of (resolvedAction as SequenceAction).steps) {
      if (stp.type !== 'GRANT_FIELD_SIGNI_ABILITY') continue;
      const g = stp as GrantFieldSigniAbilityAction;
      if (g.rawText === undefined) continue;
      const subBlocks = splitEffectBlocks((g.rawText ?? '').replace(/^[『「]/, '').replace(/[』」]$/, ''));
      g.abilities = subBlocks
        .map((b, si) => {
          const e = parseBlock(cardNum, b, index);
          if (e) e.effectId = `${cardNum}-E${index + 1}-G${si > 0 ? si + 1 : ''}`;
          return e;
        })
        .filter((e): e is import('../types/effects').CardEffect => e !== null);
      delete g.rawText;
      if ((g.abilities.length === 0 || g.abilities.some(e => e.parseStatus === 'UNKNOWN' || e.parseStatus === 'PARTIAL'))
          && parseStatus === 'AUTO') parseStatus = 'PARTIAL';
    }
  }
  // GRANT_EFFECT の rawText 展開（SEQUENCE/CONDITIONAL/CHOOSE 内も対象）
  if (expandGrantEffectRawTexts(resolvedAction, cardNum) && parseStatus === 'AUTO') parseStatus = 'PARTIAL';

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

  // ON_ZONE_MOVED self-scope: 主語「このシグニ」＝移動したシグニ自身。POWER_MODIFY(self,count:1) を
  // トリガー源（移動シグニ）に自動対象化（targetsTriggerSource）。engine は triggeringCardNum で解決。
  if (timing?.[0] === 'ON_ZONE_MOVED' && extractedTriggerScope === 'self') {
    const markSelfPM = (a: EffectAction): EffectAction => {
      if (a.type === 'POWER_MODIFY') {
        const pm = a as import('../types/effects').PowerModifyAction;
        if (pm.target?.owner === 'self' && pm.target?.count === 1) return { ...pm, targetsTriggerSource: true };
      }
      if (a.type === 'GRANT_KEYWORD') {
        const gk = a as import('../types/effects').GrantKeywordAction;
        if (gk.target?.owner === 'self' && gk.target?.count === 1 && !gk.target.filter) return { ...gk, targetsTriggerSource: true };
      }
      if (a.type === 'SEQUENCE') {
        const seq = a as import('../types/effects').SequenceAction;
        return { ...seq, steps: seq.steps.map(markSelfPM) };
      }
      return a;
    };
    resolvedAction = markSelfPM(resolvedAction);
  }

  const duration: EffectDuration = effectType === 'CONTINUOUS' ? 'PERMANENT'
    : actionText.includes('ターン終了時まで') ? 'UNTIL_END_OF_TURN'
    : 'INSTANT';

  // eichiCondition（英知=N 使用条件）を activeCondition に統合
  let finalActiveCondition: ActiveCondition | undefined = eichiCondition
    ? (activeCondition ? { type: 'AND', conditions: [eichiCondition, activeCondition] } : eichiCondition)
    : activeCondition;

  // marker処理で強制設定した activeCondition（G150のON_BANISH再分類等）をマージ
  if (forcedActiveCondition) {
    finalActiveCondition = finalActiveCondition
      ? { type: 'AND', conditions: [forcedActiveCondition, finalActiveCondition] }
      : forcedActiveCondition;
  }

  // 【ドライブ常】【ドライブ自】：ドライブ状態であるかぎり有効
  if (isDrive) {
    const driveCond: ActiveCondition = { type: 'IS_DRIVE_STATE' };
    finalActiveCondition = finalActiveCondition
      ? { type: 'AND', conditions: [driveCond, finalActiveCondition] }
      : driveCond;
  }

  // 《相手ターン》《自分ターン》：CONTINUOUS は activeCondition TURN_OWNER、
  // AUTO/ACTIVATED は triggerCondition.turnOwner（engine effectStack がターン照合でゲート＝機構④で配線済み）。
  if (effectType === 'CONTINUOUS' && turnOwnerCond) {
    finalActiveCondition = finalActiveCondition
      ? { type: 'AND', conditions: [turnOwnerCond, finalActiveCondition] }
      : turnOwnerCond;
  } else if (effectType !== 'CONTINUOUS' && turnOwnerCond?.type === 'TURN_OWNER') {
    extractedTriggerCondObj = { ...(extractedTriggerCondObj ?? {}), turnOwner: (turnOwnerCond as { owner: 'self' | 'opponent' }).owner };
  }

  // ビートアイコン条件：【常】CONTINUOUS は activeCondition（engine checkActiveCondition が評価）、
  // それ以外（起動/自動）は useCondition にマージ。（WXK08-073＝【常】《ビートアイコン》[１枚以上]）
  if (effectType === 'CONTINUOUS' && beatCondition) {
    finalActiveCondition = finalActiveCondition
      ? { type: 'AND', conditions: [beatCondition as ActiveCondition, finalActiveCondition] }
      : (beatCondition as ActiveCondition);
  }
  let mergedCondition: import('../types/effects').Condition | undefined =
    (effectType !== 'CONTINUOUS' && beatCondition)
      ? (useCondition ? { type: 'AND', conditions: [beatCondition, useCondition] } : beatCondition)
      : useCondition;
  // トリガー文から抽出した条件（ON_ENERGY_CHARGE=IS_MY_TURN / ON_POWER_THRESHOLD=SELF_POWER_GTE）をマージ
  if (extractedTriggerCondition) {
    mergedCondition = mergedCondition
      ? { type: 'AND', conditions: [extractedTriggerCondition, mergedCondition] }
      : extractedTriggerCondition;
  }

  // 使用回数制限（《ターン１回》《ターン２回》《ゲーム１回》）。CONTINUOUS には付けない。
  let usageLimit: import('../types/effects').UsageLimit | undefined;
  if (effectType !== 'CONTINUOUS') {
    if (costStr.includes('《ターン２回》')) usageLimit = 'twice_per_turn';
    else if (costStr.includes('《ターン１回》')) usageLimit = 'once_per_turn';
    else if (costStr.includes('《ゲーム１回》')) usageLimit = 'once_per_game';
  }

  // 無言フォールバックがあった効果は AUTO を PARTIAL に降格（UNKNOWN/既存PARTIALはそのまま）
  if (silentFb.length > 0) {
    logSilentFallbacks(`${cardNum}-E${index + 1}`, silentFb);
    if (parseStatus === 'AUTO') parseStatus = 'PARTIAL';
  }

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
    ...(handActivated ? { handActivated: true } : {}),
    ...(trashActivated ? { trashActivated: true } : {}),
    ...(extractedTriggerScope !== undefined ? { triggerScope: extractedTriggerScope } : {}),
    ...(extractedTriggerFilter !== undefined ? { triggerFilter: extractedTriggerFilter } : {}),
    ...(extractedTriggerCondObj !== undefined ? { triggerCondition: extractedTriggerCondObj } : {}),
    ...(usageLimit !== undefined ? { usageLimit } : {}),
  };
}

// ===== アーツ・スペルパース =====

// GRANT_LRIG_ABILITY の rawText からサブ能力を展開する（parseBlock/parseSpellEffect と同処理）。
// SEQUENCE/CONDITIONAL 内の GLA も対象。展開できないサブがあれば true（=PARTIAL相当）を返す。
function expandGrantLrigAbilities(action: EffectAction, cardNum: string): boolean {
  let hasUnknownSub = false;
  const walk = (a: EffectAction) => {
    if (a.type === 'GRANT_LRIG_ABILITY') {
      const gla = a as GrantLrigAbilityAction;
      if (gla.rawText && (!gla.abilities || gla.abilities.length === 0)) {
        const cleanRaw = gla.rawText.replace(/^[『「]/, '').replace(/[』」]$/, '');
        // 「【起】…。」「【起】…。」の複数引用形式は 」「 境界で各能力に分割してから展開する
        const pieces = cleanRaw.split(/[」』]\s*[「『]/);
        gla.abilities = pieces
          .flatMap(p => splitEffectBlocks(p))
          .map((b, si) => parseBlock(`${cardNum}-sub`, b, si))
          .filter((e): e is CardEffect => e !== null);
      }
      const rawTextOnlyPunct = !gla.rawText || /^[。、\s]*$/.test(gla.rawText);
      if (!rawTextOnlyPunct && (gla.abilities.length === 0 || gla.abilities.some(e => e.parseStatus === 'UNKNOWN'))) {
        hasUnknownSub = true;
      }
    } else if (a.type === 'SEQUENCE') {
      (a as SequenceAction).steps.forEach(walk);
    } else if (a.type === 'CONDITIONAL') {
      const c = a as import('../types/effects').ConditionalAction;
      walk(c.then);
      if (c.else) walk(c.else);
    }
  };
  walk(action);
  return hasUnknownSub;
}

// GRANT_EFFECT の rawText（引用「…」の原文）を parseBlock で CardEffect へ展開する（§5c 続き30）。
// SEQUENCE/CONDITIONAL/CHOOSE 内の GRANT_EFFECT も対象。引用が単一ブロックかつ AUTO でパースできた
// 場合のみ effect に設定して rawText を削除。展開できなければ rawText を温存して true（=PARTIAL相当）を
// 返す（engine は effect 無し GRANT_EFFECT を no-op ガード・decompiler は rawText を表示）。
function expandGrantEffectRawTexts(action: EffectAction, cardNum: string): boolean {
  let hasUnknownSub = false;
  const walk = (a: EffectAction) => {
    if (a.type === 'GRANT_EFFECT') {
      const ge = a as import('../types/effects').GrantEffectAction;
      if (ge.rawText && !ge.effect) {
        const cleanRaw = ge.rawText.replace(/^[『「]/, '').replace(/[』」]$/, '');
        const subs = splitEffectBlocks(cleanRaw)
          .map((b, si) => parseBlock(`${cardNum}-sub`, b, si))
          .filter((e): e is CardEffect => e !== null);
        if (subs.length === 1 && subs[0].parseStatus === 'AUTO') {
          ge.effect = subs[0];
          delete ge.rawText;
        } else {
          // 複数ブロック引用 or パース不全＝据置（採用ゲートで PARTIAL として弾かれる）
          hasUnknownSub = true;
        }
      }
    } else if (a.type === 'SEQUENCE') {
      (a as SequenceAction).steps.forEach(walk);
    } else if (a.type === 'CONDITIONAL') {
      const c = a as import('../types/effects').ConditionalAction;
      walk(c.then);
      if (c.else) walk(c.else);
    } else if (a.type === 'CHOOSE') {
      for (const ch of (a as ChooseAction).choices ?? []) walk(ch.action);
    }
  };
  walk(action);
  return hasUnknownSub;
}

function parseArtsEffect(card: CardData): CardEffect | null {
  if (!card.EffectText || card.EffectText === '-') return null;
  // アンコール（《cost》（説明）本文）とベット（《cost》本文）のプレフィックスを除去してから解析
  const isBet = /^ベット[―─]/.test(card.EffectText);
  const stripped = stripRuleParens(card.EffectText)
    .replace(/^(?:アンコール－|ベット[―─])(?:《[^》]+》)*\s*/, '')
    // 【使用条件】【ドリームチーム】合計N種類以上の色を持つ（＝場の3ルリグが合計N色以上：ピースの使用条件）。
    //   engine に「チームの合計色数」条件が無いため近似省略（WXDi-P15-003 と同じ扱い）。⚠除去しないと
    //   末尾「…色を持つ」が part1 の「を持つ」キーワード付与規則に食われ GRANT_KEYWORD"使用条件" のゴミになり、
    //   続く色別3分岐（あなたの場に(色)のルリグがいる場合）が丸ごと脱落して無条件実行される（WXDi-P08-001〜005）。
    //   （…）は stripRuleParens が既に除去済み。
    .replace(/^【使用条件】【ドリームチーム】合計[０-９\d]+種類以上の色を持つ/, '');
  // ピースの印刷済み使用条件「【使用条件】あなたの場に(色)のルリグがいる」。
  // CardEffect.condition は BattleScreen の候補表示・実行直前の双方で evalUseCondition に評価される。
  const printedColorLrig = stripped.match(/^【使用条件】あなたの場に(白|赤|青|緑|黒)のルリグがいる/);
  const withoutPrintedUseCondition = printedColorLrig ? stripped.slice(printedColorLrig[0].length) : stripped;
  const extractedUse = extractUseCondition(withoutPrintedUseCondition);
  const condition: Condition | undefined = printedColorLrig
    ? (extractedUse.condition
        ? { type: 'AND', conditions: [{ type: 'LRIG_COLOR', owner: 'self', color: printedColorLrig[1] }, extractedUse.condition] }
        : { type: 'LRIG_COLOR', owner: 'self', color: printedColorLrig[1] })
    : extractedUse.condition;
  const cleaned = extractedUse.cleaned;
  // ベットの多択メカニクス（「以下のN個からM個を選ぶ。…あなたがベットしていた場合、代わりに…」）。
  // parseActionTextInner の「ベット選択数変更型」ブランチが CHOOSE+betChoose に展開できればそれを採用
  // （§3 Opusタスク6・engine が is_betting で choose_count を上書き）。展開できない構造（repeat 選択・
  // 「代わりに」節が選択数変更でない等）は従来どおり BET_MECHANIC(no-op) に温存する。
  // （GRANT_QUOTED_AUTO_ABILITY 等の専用処理が必要な少数カードは manualEffects 側で上書きする）
  const isBetMultiChoose = isBet && /以下の[^。]*から[^。]*選ぶ/.test(stripped);
  let action: EffectAction;
  if (isBetMultiChoose) {
    const parsed = parseActionText(condition ? cleaned : stripped);
    action = (parsed.type === 'CHOOSE' && (parsed as ChooseAction).betChoose)
      ? parsed
      : ({ type: 'STUB', id: 'BET_MECHANIC' } as StubAction);
  } else {
    action = parseActionText(condition ? cleaned : stripped);
  }
  const artsFb = consumeSilentFallbacks();
  const hasUnknown = action.type === 'UNKNOWN'
    || (action.type === 'SEQUENCE' && (action as SequenceAction).steps.some(s => s.type === 'UNKNOWN'));
  // GRANT_LRIG_ABILITY: rawText から付与能力を展開（parseSpellEffect と同処理。アーツ/ピース経路の展開漏れ是正）
  const glaSub = expandGrantLrigAbilities(action, card.CardNum);
  // GRANT_EFFECT の rawText 展開（アーツ経路）。短絡で展開が飛ばないよう両方を必ず評価する
  const geSub = expandGrantEffectRawTexts(action, card.CardNum);
  const glaUnknownSub = glaSub || geSub;
  // 後置文「このアーツによってあなたのルリグが得た能力は、使用タイミング《…》を得る」を granted abilities の timing に反映
  if (/得た能力は、?使用タイミング《メインフェイズアイコン》《アタックフェイズアイコン》を得る/.test(stripped)) {
    const applyTiming = (a: EffectAction) => {
      if (a.type === 'GRANT_LRIG_ABILITY') {
        for (const ab of (a as GrantLrigAbilityAction).abilities) {
          if (ab.effectType === 'ACTIVATED') ab.timing = ['ATTACK_ARTS', 'MAIN'];
        }
      } else if (a.type === 'SEQUENCE') (a as SequenceAction).steps.forEach(applyTiming);
    };
    applyTiming(action);
  }
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
  logSilentFallbacks(`${card.CardNum}-E1`, artsFb);
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
    parseStatus: hasUnknown ? (action.type === 'UNKNOWN' ? 'UNKNOWN' : 'PARTIAL') : (glaUnknownSub || artsFb.length > 0 ? 'PARTIAL' : 'AUTO'),
  };
}

function parseSpellEffect(card: CardData): CardEffect | null {
  if (!card.EffectText || card.EffectText === '-') return null;
  const stripped = stripRuleParens(card.EffectText);
  const { cleaned, condition } = extractUseCondition(stripped);
  const action = parseActionText(condition ? cleaned : stripped);
  const spellFb = consumeSilentFallbacks();
  logSilentFallbacks(`${card.CardNum}-E1`, spellFb);
  let parseStatus: CardEffect['parseStatus'] = action.type === 'UNKNOWN' ? 'UNKNOWN' : spellFb.length > 0 ? 'PARTIAL' : 'AUTO';
  // GRANT_LRIG_ABILITY: rawText から付与能力（サブブロック）をパース（parseBlock と同じ処理）
  if (action.type === 'GRANT_LRIG_ABILITY') {
    const hasUnknownSub = expandGrantLrigAbilities(action, card.CardNum);
    parseStatus = hasUnknownSub ? 'PARTIAL' : 'AUTO';
  }
  // GRANT_EFFECT の rawText 展開（スペル経路・SEQUENCE/CONDITIONAL/CHOOSE 内も対象）
  if (expandGrantEffectRawTexts(action, card.CardNum) && parseStatus === 'AUTO') parseStatus = 'PARTIAL';
  return {
    effectId: `${card.CardNum}-E1`,
    effectType: 'ACTIVATED',
    timing: ['MAIN'],
    cost: parseCost(card.Cost),
    condition,
    action,
    duration: 'INSTANT',
    mandatory: false,
    parseStatus,
  };
}

function parseBurstEffect(card: CardData): CardEffect | null {
  if (!card.BurstText || card.BurstText === '-') return null;
  const raw = stripRuleParens(card.BurstText).replace(/^：/, '').trim();
  if (!raw) return null;
  const action = parseActionText(raw);
  const burstFb = consumeSilentFallbacks();
  logSilentFallbacks(`${card.CardNum}-BURST`, burstFb);
  return {
    effectId: `${card.CardNum}-BURST`,
    effectType: 'LIFE_BURST',
    timing: ['ON_LIFE_BURST'],
    action,
    duration: 'INSTANT',
    mandatory: false,
    parseStatus: action.type === 'UNKNOWN' ? 'UNKNOWN' : burstFb.length > 0 ? 'PARTIAL' : 'AUTO',
  };
}

// ===== メインエクスポート =====

export function parseCardEffects(card: CardData): CardEffect[] {
  const effects: CardEffect[] = [];

  const baseType = card.Type?.split('/')[0] ?? '';
  _parsingBaseType = baseType;
  if (baseType === 'アーツ' || baseType === 'ピース' || baseType === 'リレーピース') {
    // 「」『』外側にある【自】：セクションを分離してパース（ARTS_SELF_RECYCLE_ON_TRIGGER等）
    // 「」内の【自】は付与能力なので除外する
    const rawEff = card.EffectText ?? '';
    let artsAutoIdx = -1;
    {
      let depth = 0;
      for (let ci = 0; ci < rawEff.length; ci++) {
        const ch = rawEff[ci];
        if (ch === '「' || ch === '『') depth++;
        else if (ch === '」' || ch === '』') depth--;
        else if (depth === 0 && rawEff.startsWith('【自】：', ci)) { artsAutoIdx = ci; break; }
      }
    }
    if (artsAutoIdx >= 0) {
      const mainPart = rawEff.slice(0, artsAutoIdx).trim();
      if (mainPart) {
        const mainCard = { ...card, EffectText: mainPart };
        const e = parseArtsEffect(mainCard);
        if (e) { logSourceText(e.effectId, mainPart); effects.push(e); }
      }
      const autoPart = stripRuleParens(rawEff.slice(artsAutoIdx));
      const autoEffect = parseBlock(card.CardNum, autoPart, effects.length);
      if (autoEffect) {
        autoEffect.effectId = `${card.CardNum}-E${effects.length + 1}`;
        logSourceText(autoEffect.effectId, autoPart);
        effects.push(autoEffect);
      }
    } else {
      const e = parseArtsEffect(card);
      if (e) { logSourceText(e.effectId, card.EffectText ?? ''); effects.push(e); }
    }
  } else if (baseType === 'スペル') {
    // スペルも「」『』外側の【自】：セクションを分離する（アーツと同じ）。
    // ⚠従来は分離しておらず、**後続の独立した【自】能力がスペル本体の最後の選択肢に流入**していた
    //   （WXK01-041＝選択肢③「相手の全シグニを凍結する」に、別能力の「トラッシュから手札に戻す」が
    //    連結されていた＝§3 Opusタスク10 パターンF-3）。「」内の【自】は付与能力なので除外する。
    const rawSp = card.EffectText ?? '';
    let spAutoIdx = -1;
    {
      let depth = 0;
      for (let ci = 0; ci < rawSp.length; ci++) {
        const ch = rawSp[ci];
        if (ch === '「' || ch === '『') depth++;
        else if (ch === '」' || ch === '』') depth--;
        else if (depth === 0 && rawSp.startsWith('【自】：', ci)) { spAutoIdx = ci; break; }
      }
    }
    if (spAutoIdx >= 0) {
      const mainPart = rawSp.slice(0, spAutoIdx).trim();
      if (mainPart) {
        const e = parseSpellEffect({ ...card, EffectText: mainPart });
        if (e) { logSourceText(e.effectId, mainPart); effects.push(e); }
      }
      const autoPart = stripRuleParens(rawSp.slice(spAutoIdx));
      const autoEffect = parseBlock(card.CardNum, autoPart, effects.length);
      if (autoEffect) {
        autoEffect.effectId = `${card.CardNum}-E${effects.length + 1}`;
        logSourceText(autoEffect.effectId, autoPart);
        effects.push(autoEffect);
      }
    } else {
      const e = parseSpellEffect(card);
      if (e) { logSourceText(e.effectId, card.EffectText ?? ''); effects.push(e); }
    }
  } else {
    // シグニ・ルリグ・その他：EffectTextを複数ブロックに分割して解析
    if (card.EffectText && card.EffectText !== '-') {
      // 【シャドウ（X）】のスコープ条件を stripRuleParens で括弧除去される前に符号化する
      let effectText = encodeShadowScopesInText(card.EffectText);
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
      const layerBlocks: string[] = [];
      splitEffectBlocks(stripKeywordPrefixes(stripRuleParens(effectText))).forEach((block, i) => {
        if (layerM && block.startsWith('《レイヤーアイコン》')) {
          const e = parseBlock(card.CardNum, block.replace(/^《レイヤーアイコン》/, ''), i);
          if (e) {
            const lid = `${card.CardNum}-LAYER-E${layerAbilities.length + 1}`;
            logSourceText(lid, block);
            layerBlocks.push(block);
            layerAbilities.push({ ...e, effectId: lid });
          }
          return;
        }
        const e = parseBlock(card.CardNum, block, i);
        if (e) { logSourceText(e.effectId, block); effects.push(e); }
      });

      if (layerM && layerAbilities.length > 0) {
        // 付与親（-LAYER）の JSON は内側能力（abilities）を内包する＝原文側も内側ブロックを含めて
        // 突き合わせる（宣言文だけにすると内側能力の語彙欠落を計器が見落とす）
        logSourceText(`${card.CardNum}-LAYER`, [layerM[0], ...layerBlocks].join(' '));
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
    if (burst) { logSourceText(burst.effectId, card.BurstText); effects.push(burst); }
  }

  // 歌のカケラ効果（EffectTextに【歌のカケラ】：〜 がある場合）
  if (card.EffectText && card.EffectText !== '-' && card.EffectText.includes('【歌のカケラ】')) {
    // 句点+効果マーカー または ルールテキスト括弧 で区切る（「」内の【自】で止めない）
    const songM = card.EffectText.match(/【歌のカケラ】：(.+?)(?=（【|。【[常出起自ガ]】|$)/s);
    if (songM) {
      const raw = stripRuleParens(songM[1]).trim();
      if (raw) {
        const action = parseActionText(raw);
        const songFb = consumeSilentFallbacks();
        logSilentFallbacks(`${card.CardNum}-SONG`, songFb);
        logSourceText(`${card.CardNum}-SONG`, songM[0]);
        effects.push({
          effectId: `${card.CardNum}-SONG`,
          effectType: 'SONG_ICON',
          timing: ['ON_SONG_ACTIVATE'],
          action,
          duration: 'INSTANT',
          mandatory: false,
          parseStatus: action.type === 'UNKNOWN' ? 'UNKNOWN' : songFb.length > 0 ? 'PARTIAL' : 'AUTO',
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
        const trapFb = consumeSilentFallbacks();
        logSilentFallbacks(`${card.CardNum}-TRAP`, trapFb);
        logSourceText(`${card.CardNum}-TRAP`, trapM[0]);
        effects.push({
          effectId: `${card.CardNum}-TRAP`,
          effectType: 'TRAP_ICON',
          timing: ['ON_TRAP_ACTIVATE'],
          action,
          duration: 'INSTANT',
          mandatory: false,
          parseStatus: action.type === 'UNKNOWN' ? 'UNKNOWN' : trapFb.length > 0 ? 'PARTIAL' : 'AUTO',
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
    // 「あなたの（＜紅蓮＞の）シグニ１体が血晶武装状態になったとき」→ 味方シグニ全体
    if (/あなたの(?:＜[^＞]*＞の)?シグニ[１-９\d０-９]*体?が血晶武装状態になったとき/.test(text)) return 'any_ally';
    return 'self'; // 「このシグニが血晶武装状態になったとき」→ 自身のみ
  }
  // 「対戦相手のターン開始時/終了時」→ 相手ターン中に自分のシグニが発動（any_opp）
  if (effect.timing?.includes('ON_TURN_START') || effect.timing?.includes('ON_TURN_END')) {
    if (/対戦相手のターン(?:開始時|終了時)/.test(text)) return 'any_opp';
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
