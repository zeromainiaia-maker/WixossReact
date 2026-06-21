import type {
  EffectAction,
  EnergyCost,
  EffectTarget,
  EffectDuration,
  TargetFilter,
  Owner,
  TransferToDeckAction,
  CounterSpellAction,
  CostReductionAction,
  GrantProtectionAction,
  AttachCharmAction,
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
  PowerModifyPerTrashedLevelAction,
  RemoveCharmAction,
  ForceSigniAttackAction,
  PowerModifyPerTrashCountAction,
  PowerModifyPerLifeCountAction,
  PowerModifyPerLrigLevelAction,
  PowerModifyPerVirusCountAction,
  PowerModifyPerDeckCountAction,
  PowerModifyPerEnergyColorAction,
  StubAction,
  PowerModifyAction,
  BanishAction,
} from '../../types/effects';
import {
  parseNum, parseSigniTarget, parsePowerFilter, parseLevelFilter, parseColorFilter, parseCardTypeFilter, parseStoryFilter, parseNameFilter, parseEnergyCosts, toHalf,
} from '../parserUtils';

export function parseSentencePart1(t: string): EffectAction | null {
  // ---- 【シグニバリア】/【ルリグバリア】を得る ----
  // 純粋なバリア付与文のみマッチ（「白のルリグ1体につき【ルリグバリア】…」等の複雑文は別stubで処理するため除外）。
  // 従来は汎用 GRANT_KEYWORD(keyword:○バリア) になり no-op だった。エンジン実装済みの
  // GAIN_SIGNI_BARRIER / GAIN_LRIG_BARRIER stub（フリーゾーンにトークン設置）を返す。
  {
    const barrierM = t.match(/^【(シグニバリア|ルリグバリア)】([０-９\d]+)?つ?(?:と【(シグニバリア|ルリグバリア)】([０-９\d]+)?つ?)?を得る。?$/);
    if (barrierM) {
      const mkBarrier = (kw: string, numStr?: string): StubAction => {
        const id = kw === 'シグニバリア' ? 'GAIN_SIGNI_BARRIER' : 'GAIN_LRIG_BARRIER';
        const n = numStr ? parseNum(numStr) : 1;
        return n !== 1 ? { type: 'STUB', id, count: n } : { type: 'STUB', id };
      };
      const first = mkBarrier(barrierM[1], barrierM[2]);
      if (barrierM[3]) return { type: 'SEQUENCE', steps: [first, mkBarrier(barrierM[3], barrierM[4])] };
      return first;
    }
  }

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

  // ---- バニッシュ先変更（ルリグデッキ→ルリグトラッシュ: レゾナ系）----
  if (t.match(/このシグニがバニッシュされる場合、ルリグデッキに戻る代わりにルリグトラッシュに置かれる/)) {
    return { type: 'STUB', id: 'BANISH_TO_LRIG_TRASH_INSTEAD' } as StubAction;
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
  if (t.match(/シグニを(?:好きなように)?配置し直/)) {
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
    // 「レベルN以下のシグニで【ガード】ができない」はレベル制限ガード（GUARD_MAX_LVN）として扱う。
    // この一般ルールを先に評価するため、ここで判別しないと後段の専用ルールに到達せず
    // 全ガード禁止(GUARD)に誤分類される（WX01-004 等で発生していた不具合）。
    const lvM = t.match(/レベル([０-９\d]+)以下のシグニで【ガード】ができない/);
    if (lvM) {
      return { type: 'BLOCK_ACTION', target: { type: 'PLAYER', owner: 'opponent', count: 1 }, actionId: `GUARD_MAX_LV${parseNum(lvM[1])}`, until };
    }
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
    return { type: 'TRASH', target: { type: 'HAND_CARD', owner: 'opponent', count: 1, filter: { level: parseNum(levelHandM[1]) }, actingPlayerSelects: true } };
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
      } as PowerModifyPerDeckCountAction;
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
      } as PowerModifyPerEnergyColorAction;
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
      const filter: TargetFilter | undefined =
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
      const filter: TargetFilter | undefined =
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
      const filter: TargetFilter | undefined =
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
      const filter: TargetFilter | undefined =
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
    const cs: CounterSpellAction = { type: 'COUNTER_SPELL' };
    // 「コストの合計が０のスペル」「コストの合計がN以下のスペル」→ 対象スペルのコスト上限（WX17-031等）
    const mcM = t.match(/コストの合計が([０-９\d]+)(?:以下)?のスペル/);
    if (mcM) cs.maxCost = parseNum(mcM[1]);
    return cs;
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
  const drawM = t.match(/カードを?([０-９\d]+)枚引(?:く|いてもよい)/);
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
      const filter: TargetFilter = lv !== undefined
        ? { cardType: 'シグニ', level: m3[2] === '以下' ? { max: lv } : { min: lv } }
        : { cardType: 'シグニ' };
      return {
        type: 'ENERGY_CHARGE',
        target: { type: 'SIGNI', owner: 'opponent', count: parseNum(m3[3]), filter },
      } as EnergyChargeAction;
    }
  }

  // ---- 対戦相手の色か色のシグニをトラッシュ/エナ（色フィルター付き）----
  {
    const colorBanishM = t.match(/対戦相手の([白赤青緑黒]か[白赤青緑黒])のシグニ([０-９\d]+)体を対象とし.*トラッシュに置く/);
    if (colorBanishM) {
      return { type: 'BANISH', target: { type: 'SIGNI', owner: 'opponent', count: parseNum(colorBanishM[2]) } } as BanishAction;
    }
    const colorEnergyM = t.match(/対戦相手の([白赤青緑黒]か[白赤青緑黒])のシグニ([０-９\d]+)体を対象とし.*エナゾーンに置く/);
    if (colorEnergyM) {
      return { type: 'ENERGY_CHARGE', target: { type: 'SIGNI', owner: 'opponent', count: parseNum(colorEnergyM[2]) } } as EnergyChargeAction;
    }
    // 対戦相手は自分のシグニN体を選びエナゾーンに置く
    if (t.match(/対戦相手は自分のシグニ[０-９\d]*体?を選びエナゾーンに置く/)) {
      const cntM = t.match(/([０-９\d]+)体/);
      const cnt = cntM ? parseNum(cntM[1]) : 1;
      return { type: 'ENERGY_CHARGE', target: { type: 'SIGNI', owner: 'opponent', count: cnt } } as EnergyChargeAction;
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
    // 「それをバニッシュする」= 前文で「対戦相手のシグニを対象とし」た相手シグニをバニッシュ
    if (t.match(/^それをバニッシュする$/)) {
      return { type: 'BANISH', target: { type: 'SIGNI', owner: 'opponent', count: 1, filter: { cardType: 'シグニ' }, upToCount: false } };
    }
    // 「（この方法で）トラッシュに置いたシグニ1体につき対戦相手のシグニ1体を対象とし、それらをバニッシュする」
    // ＝直前ステップでトラッシュした枚数だけ対戦相手シグニをバニッシュ（動的数: last_processed_count）
    if (t.match(/トラッシュに置いたシグニ[０-９\d]*体?につき対戦相手のシグニ[０-９\d]*体?を.*バニッシュ/)) {
      return { type: 'BANISH', target: { type: 'SIGNI', owner: 'opponent', count: { $ref: 'last_processed_count' }, filter: { cardType: 'シグニ' }, upToCount: true } };
    }
    if (t.match(/すべてのシグニをバニッシュ/)) {
      const owner: Owner = t.includes('対戦相手') ? 'opponent' : 'any';
      return { type: 'BANISH', target: { type: 'SIGNI', owner, count: 'ALL', filter: { cardType: 'シグニ', ...parsePowerFilter(t) } } };
    }
    // 「パワーの合計がN以下になるように好きな数対象とし、それらをバニッシュする」（合計パワー制限の複数選択）
    const sumBanishM = t.match(/パワーの合計が([０-９\d]+)以下になるように好きな数/);
    if (sumBanishM) {
      const owner: Owner = t.includes('対戦相手') ? 'opponent' : 'self';
      return {
        type: 'BANISH',
        target: {
          type: 'SIGNI', owner, count: 'ALL',
          filter: { cardType: 'シグニ', ...parseStoryFilter(t) },
          totalPowerMax: parseNum(sumBanishM[1]),
        },
      };
    }
    const owner: Owner = t.includes('対戦相手') ? 'opponent' : 'self';
    const isOptional = t.includes('バニッシュしてもよい');
    // 「このシグニをバニッシュする」＝自身のみ（任意選択でなく thisCardOnly）
    if (/このシグニを(?:[^。、]*)?バニッシュ/.test(t) && !t.includes('対戦相手')) {
      return { type: 'BANISH', target: { type: 'SIGNI', owner: 'self', count: 1, filter: { cardType: 'シグニ', thisCardOnly: true } }, ...(isOptional ? { optional: true } : {}) };
    }
    // 「対戦相手は自分のシグニ1体を対象とし、それをバニッシュする」＝対戦相手が自分のシグニを選んでバニッシュ
    const oppSelects = /対戦相手は自分の/.test(t);
    return { type: 'BANISH', target: parseSigniTarget(t, owner), ...(isOptional ? { optional: true } : {}), ...(oppSelects ? { opponentSelects: true } : {}) };
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
    // 「対戦相手のシグニを対象とし、あなたのシグニをトラッシュ」→ self のトラッシュ
    if (t.match(/対戦相手のシグニ.+体を対象とし.*あなたのシグニ.*トラッシュに置く/)) {
      return { type: 'TRASH', target: parseSigniTarget(t, 'self') };
    }
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

  // ---- 自分手札を捨てる（任意含む）----
  const selfDiscardM = t.match(/^(?:あなたは)?手札を([０-９\d]+)枚?捨てる(?:もよい)?$/);
  if (selfDiscardM) {
    return { type: 'TRASH', target: { type: 'HAND_CARD', owner: 'self', count: parseNum(selfDiscardM[1]) } };
  }
  // ---- 「その後、手札をN枚捨ててもよい」 ----
  {
    const optDiscardM = t.match(/手札を([０-９\d]+)枚捨ててもよい$/);
    if (optDiscardM) return { type: 'TRASH', target: { type: 'HAND_CARD', owner: 'self', count: parseNum(optDiscardM[1]) } };
  }

  // ---- サーチ（手札 or 場に出す or エナゾーン）----
  if (t.includes('デッキから') && t.includes('探して') &&
      (t.includes('手札に加え') || t.includes('場に出し') || t.includes('トラッシュに置き') || t.includes('エナゾーンに置く'))) {
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
    const toEnergy = t.includes('エナゾーンに置く');
    return {
      type: 'SEARCH',
      from: { location: 'deck', owner: 'self' },
      filter,
      maxCount,
      then: toField
        ? { type: 'ADD_TO_FIELD', owner: 'self' }
        : toTrash
          ? { type: 'TRASH', target: { type: 'DECK_CARD', owner: 'self', count: 1 } }
          : toEnergy
            ? { type: 'ENERGY_CHARGE', target: { type: 'DECK_CARD', owner: 'self', count: 1 } } as EnergyChargeAction
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
    // フラグメント「それらのパワーをそれぞれ±N000する」- 対戦相手シグニを近似ターゲットとして使用
    const fragM = t.match(/^(?:それら|それとこのシグニ)のパワーをそれぞれ([＋－])([０-９\d]+)する$/);
    if (fragM) {
      const delta = fragM[1] === '＋' ? parseNum(fragM[2]) : -parseNum(fragM[2]);
      return { type: 'POWER_MODIFY', target: { type: 'SIGNI', owner: 'opponent', count: 1 }, delta } as PowerModifyAction;
    }
  }

  // ---- パワーパンプ / デバフ ----
  const plusM = t.match(/パワーを＋([０-９\d]+)する/) ?? t.match(/パワーは＋([０-９\d]+)され/);
  const minusM = t.match(/パワーを－([０-９\d]+)する/) ?? t.match(/パワーは－([０-９\d]+)され/)
               ?? t.match(/パワーを-([０-９\d]+)する/);
  if (plusM || minusM) {
    const delta = plusM ? parseNum(plusM[1]) : -(parseNum(minusM![1]));
    let target: EffectTarget;
    let isTriggerSource = false;
    if (t.match(/あなたのすべてのシグニ/) || t.match(/あなたの(?:[白赤青緑黒]の|＜[^＞]+＞の|他の)?(?:すべての)?シグニのパワーを/)) {
      target = { type: 'SIGNI', owner: 'self', count: 'ALL', filter: { cardType: 'シグニ', ...parseColorFilter(t), ...parseStoryFilter(t) } };
    } else if (t.match(/対戦相手のすべてのシグニ/) ||
               t.match(/(?:感染状態の)?対戦相手のシグニすべて/) ||
               t.match(/対戦相手の(?:[白赤青緑黒]の|＜[^＞]+＞の|感染状態の)?(?:すべての)?シグニのパワーを/)) {
      target = { type: 'SIGNI', owner: 'opponent', count: 'ALL', filter: { cardType: 'シグニ', ...parseColorFilter(t), ...parseStoryFilter(t), ...(t.includes('感染状態') ? { infected: true } : {}) } };
    } else if (t.match(/対戦相手の(?:感染状態の)?シグニ([０-９\d]+)体/) || t.match(/対戦相手の感染状態のシグニ/)) {
      target = parseSigniTarget(t, 'opponent');
    } else if (t.match(/あなたの(?:感染状態の)?シグニ([０-９\d]+)体/)) {
      target = parseSigniTarget(t, 'self');
    } else if (t.match(/このシグニ/)) {
      target = { type: 'SIGNI', owner: 'self', count: 1 };
    } else if (t.match(/^それのパワーを/) || t.match(/^それはパワーが/)) {
      // 「それ」= トリガー元シグニ（ON_ATTACK_SIGNI等で発火したシグニ自身）
      target = { type: 'SIGNI', owner: 'self', count: 1 };
      isTriggerSource = true;
    } else {
      target = { type: 'SIGNI', owner: 'any', count: 1 };
    }
    const pmAction: PowerModifyAction = { type: 'POWER_MODIFY', target, delta };
    if (isTriggerSource) pmAction.targetsTriggerSource = true;
    return pmAction;
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
  // 「それら（＝選んだ同一対象）をダウンし凍結」。FREEZE(down:true) で同一対象にダウン＆凍結を適用
  // （SEQUENCE[DOWN, FREEZE] だと選択対象が別々になりうるため単一アクションにする）。
  if (t.includes('ダウンし凍結')) {
    const owner: Owner = t.includes('対戦相手') ? 'opponent' : 'self';
    const signiTgt = parseSigniTarget(t, owner);
    return { type: 'FREEZE', target: signiTgt, down: true };
  }

  // ---- ダウン ----
  if (t.includes('ダウンする') || t.match(/をダウン/)) {
    const owner: Owner = t.includes('対戦相手') ? 'opponent' : 'self';
    if (t.includes('センタールリグ') && t.includes('シグニ')) {
      // 「センタールリグかシグニ１体」→ OR選択（CENTER_LRIG_OR_SIGNI）
      if (t.match(/センタールリグか.*シグニ|センタールリグまたは.*シグニ/)) {
        return { type: 'DOWN', target: { type: 'CENTER_LRIG_OR_SIGNI', owner, count: 1 } };
      }
      // 「センタールリグとすべてのシグニをダウン」のような複合ダウン（AND）
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
    const cM = t.match(/カードを([０-９\d]+)枚/) ?? t.match(/([０-９\d]+)枚(?:の手札)?をライフクロス/);
    const count = cM ? parseNum(cM[1]) : 1;
    // 「手札を〜ライフクロスに加える」は手札選択
    if (t.match(/^手札(?:を|から)/)) {
      return { type: 'ADD_TO_LIFE', owner: 'self', count, fromTop: false, fromHand: true };
    }
    return { type: 'ADD_TO_LIFE', owner: 'self', count, fromTop: true };
  }

  // ---- ライフクロスをクラッシュ ----
  if (t.includes('ライフクロス') && t.includes('クラッシュ')) {
    const op = t.includes('対戦相手');
    const cM = t.match(/([０-９\d]+)枚をクラッシュ/) ?? t.match(/ライフクロス([０-９\d]+)枚/);
    return { type: 'LIFE_CRASH', owner: op ? 'opponent' : 'self', count: cM ? parseNum(cM[1]) : 1, triggerBurst: true };
  }

  // ---- 「（このアタックフェイズの間、）〜が場を離れたとき、〜を場に出す」付与型の遅延トリガー ----
  // 即時配置ではなく付与トリガーなので、bare ADD_TO_FIELD（=デッキトップ誤配置）や手札ハンドラの
  // 即時配置を避けて no-op STUB に。忠実実装には「場を離れたとき手札から配置」を期間付きで付与する
  // 機構が必要（WX22-001-E3）。※【自】ON_LEAVE_FIELD はトリガー文が除去済みで此処に来ない。
  if (t.includes('場を離れたとき') && t.includes('場に出す')) {
    return { type: 'STUB', id: 'GRANT_LEAVE_PLACE_PENDING' } as StubAction;
  }

  // ---- クラフトの《X》を場に出す（ゲーム外からトークン生成）----
  // 旧実装は bare ADD_TO_FIELD でデッキトップを出していた（誤り）。
  // cardName を付けて execAddToField のトークン生成パスへ（CardName→CardNum は engine 側で解決）。
  {
    const craftM = t.match(/クラフトの《([^》]+)》(?:[０-９\d一二三四五六七八九]+)?(?:つ|体|枚)?を場に出す/);
    if (craftM) {
      return { type: 'ADD_TO_FIELD', owner: 'self', cardName: craftM[1] };
    }
  }

  // ---- エナゾーンからシグニを場に出す ----
  // 旧実装は source 無しの bare ADD_TO_FIELD でデッキトップを出してしまっていた（誤り）。
  // エナから対象を選んで場に出すよう source:ENERGY_CARD＋フィルタ/枚数を付与（トラッシュ版と同形）。
  if (t.includes('エナゾーンから') && t.includes('場に出す')) {
    const filter: TargetFilter = {
      cardType: 'シグニ',
      ...parseLevelFilter(t),
      ...parseColorFilter(t),
      ...parseStoryFilter(t),
    };
    const upToM = t.match(/([０-９\d]+)枚まで/);
    const countM = t.match(/([０-９\d]+)枚を対象/);
    const count = upToM ? parseNum(upToM[1]) : (countM ? parseNum(countM[1]) : 1);
    return { type: 'ADD_TO_FIELD', owner: 'self', source: { type: 'ENERGY_CARD', owner: 'self', count, upToCount: !!upToM, filter } };
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

  // ---- ルリグデッキからレゾナを出現条件無視で場に出す ----
  // 旧実装は bare ADD_TO_FIELD でデッキトップを出していた（誤り）。専用STUBはクラスを EffectText から読む。
  if (t.includes('ルリグデッキから') && t.includes('レゾナ') && t.includes('場に出す')) {
    return { type: 'STUB', id: 'SUMMON_RESONA_FROM_LRIG_DECK' } as StubAction;
  }

  // ---- 手札からシグニを場に出す ----
  // 旧実装は bare ADD_TO_FIELD でデッキトップを出していた（誤り）。手札から対象を選んで出す。
  if (t.includes('手札から') && (t.includes('場に出す') || t.includes('場に出してもよい'))
      && !t.includes('エナ') && !t.includes('トラッシュ') && !t.includes('ルリグデッキ') && !t.includes('デッキの一番上') && !t.includes('デッキの上')) {
    const filter: TargetFilter = { cardType: 'シグニ', ...parseLevelFilter(t), ...parseStoryFilter(t), ...parseNameFilter(t) };
    const exclM = t.match(/([白青赤緑黒])ではない/);
    if (exclM) filter.colorExclude = exclM[1];
    else Object.assign(filter, parseColorFilter(t));
    // 動的フィルタ（ON_LEAVE_FIELD トリガー時に離れたカードの値で解決）
    // 「（この/その）シグニより低いレベル／レベルの低い」→ levelBelowLeftCard
    if (/(?:この|その)シグニより(?:低いレベル|レベルの低い)/.test(t)) { delete filter.level; filter.levelBelowLeftCard = true; }
    // 「（この/その）シグニよりパワーの低い／低いパワー」→ powerBelowLeftCard
    if (/(?:この|その)シグニより(?:パワーの低い|低いパワー)/.test(t)) filter.powerBelowLeftCard = true;
    const upToM = t.match(/([０-９\d]+)枚まで/);
    const count = upToM ? parseNum(upToM[1]) : 1;
    return { type: 'ADD_TO_FIELD', owner: 'self', source: { type: 'HAND_CARD', owner: 'self', count, upToCount: !!upToM, filter } };
  }

  // ---- 場に出す（デッキ上から / 手札から など）----
  if (t.includes('場に出してもよい') || (t.includes('場に出す') && !t.includes('エナ') && !t.includes('トラッシュ'))) {
    return { type: 'ADD_TO_FIELD', owner: 'self' };
  }

  // ---- 効果耐性付与（「〜のルリグ以外からの効果を受けない」）----
  // 「ルリグ以外」は「ルリグからは受けるが、それ以外全てから受けない」という意味
  if (t.match(/ルリグ以外からの効果を受けない/)) {
    const classM = t.match(/あなたの(?:他の)?＜([^＞]+)＞のシグニは/);
    if (classM) {
      return {
        type: 'GRANT_PROTECTION',
        subjectFilter: { cardType: 'シグニ', story: classM[1] },
        fromAll: true,
        exceptSource: { sourceType: 'ルリグ', sourceOwner: 'opponent' as Owner },
        duration: 'PERMANENT',
      } as GrantProtectionAction;
    }
  }

  // ---- 効果耐性付与（「対戦相手の〜の効果を受けない/受けず」）----
  if (t.match(/効果を受けない|効果を受けず/)) {
    const from: string[] = [];
    if (t.includes('ルリグ')) from.push('ルリグ');
    if (t.match(/シグニの効果|シグニとシグニ|シグニ以外/)) from.push('シグニ');
    if (t.includes('スペル')) from.push('スペル');
    if (t.includes('アーツ')) from.push('アーツ');
    if (from.length === 0) from.push('any');
    // 「あなたの＜CLASS＞のシグニは」→ CONTINUOUS用 subjectFilter（全一致シグニを保護）
    const classM = t.match(/あなたの(?:他の)?＜([^＞]+)＞のシグニは/);
    if (classM) {
      return {
        type: 'GRANT_PROTECTION',
        subjectFilter: { cardType: 'シグニ', story: classM[1] },
        from, sourceOwner: 'opponent', duration: 'PERMANENT',
      } as GrantProtectionAction;
    }
    // 個別シグニへの保護（従来通り）
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
    const infectedOnly = t.includes('感染状態');
    return { type: 'FORCE_SIGNI_ATTACK', targetOwner: target, ...(infectedOnly ? { infectedOnly: true } : {}) } as ForceSigniAttackAction;
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
      ? { type: 'CENTER_LRIG_OR_SIGNI', owner, count: 1 }
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
      const dur: EffectDuration = t.includes('ターン終了時まで') ? 'UNTIL_END_OF_TURN'
        : (t.includes('次の対戦相手のターンの間') || t.includes('次の対戦相手のターン終了時まで')) ? 'UNTIL_OPP_TURN_END'
        : 'PERMANENT';
      // ターゲット解決（エナゾーン → 全シグニ → 個別）
      const kwAllSelf = t.match(/あなたのシグニ(?:すべて|は|が)/) || t.includes('すべてのあなたのシグニ');
      const kwCountSelfM = t.match(/あなたのシグニ([０-９\d]+)体/);
      const target: EffectTarget = t.includes('エナゾーンにあるカード') || t.includes('エナゾーンのカード')
        ? { type: 'ENERGY_CARD', owner: 'self', count: 'ALL' }
        : t.includes('このシグニ') ? { type: 'SIGNI', owner: 'self', count: 1 }
        : t.includes('センタールリグ') ? { type: 'LRIG', owner: 'self', count: 1 }
        : kwAllSelf ? { type: 'SIGNI', owner: 'self', count: 'ALL' }
        : kwCountSelfM ? { type: 'SIGNI', owner: 'self', count: parseNum(kwCountSelfM[1]) }
        : t.includes('あなたのシグニ') ? { type: 'SIGNI', owner: 'self', count: 1 }
        : t.includes('対戦相手のシグニ') ? { type: 'SIGNI', owner: 'opponent', count: 1 }
        : { type: 'SIGNI', owner: 'any', count: 1 };
      // 「【X】と【Y】を得る」「【X】【Y】を持つ」複合付与 → SEQUENCE
      // 「を得る/を持つ」直前に隣接するキーワード連続（と/・接続のみ）に限定し、
      // 文境界を跨いだ無関係キーワードの巻き込みを防ぐ
      const gainM = t.match(/((?:【[^】]+】[と・]*)+)を(?:得る|持つ)/);
      if (gainM) {
        const runKw = [...gainM[1].matchAll(/【([^】]+)】/g)]
          .map(m => m[1])
          .filter(k => !['常','出','起','自','ガード'].includes(k));
        if (runKw.length >= 2) {
          return {
            type: 'SEQUENCE',
            steps: runKw.map(k => ({ type: 'GRANT_KEYWORD', target, keyword: k, duration: dur })),
          };
        }
      }
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

  // ---- スペル使用禁止（対戦相手 or 自分）----
  if (t.match(/対戦相手はスペルを使用できない/)) {
    const until: BlockActionAction['until'] = t.includes('次のターン') ? 'NEXT_TURN' : 'PERMANENT';
    return { type: 'BLOCK_ACTION', target: { type: 'PLAYER', owner: 'opponent', count: 1 }, actionId: 'USE_SPELL', until };
  }
  if (t.match(/このターン、あなたはスペルを使用できない/)) {
    return { type: 'BLOCK_ACTION', target: { type: 'PLAYER', owner: 'self', count: 1 }, actionId: 'USE_SPELL', until: 'END_OF_TURN' };
  }

  // ---- エナフェイズスキップ（対戦相手）----
  if (t.match(/対戦相手は自分のエナフェイズをスキップする/)) {
    return { type: 'BLOCK_ACTION', target: { type: 'PLAYER', owner: 'opponent', count: 1 }, actionId: 'ENERGY', until: 'NEXT_TURN' };
  }

  // ---- このシグニはアタックできない（CONTINUOUS）----
  if (t.match(/このシグニはアタックできない/)) {
    return { type: 'BLOCK_ACTION', target: { type: 'PLAYER', owner: 'self', count: 1 }, actionId: 'ATTACK_SIGNI_SELF', until: 'PERMANENT' };
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

  // ---- それ/それら/これ/そのカードを手札に加える ----
  if (t.match(/^(?:それら?を|これを|そのカードを)?手札に加える$/)) {
    return { type: 'TRANSFER_TO_HAND', source: { type: 'DECK_CARD', owner: 'self', count: 1 } };
  }
  // ---- それ/それらをエナゾーンに置く（REVEAL後の処理）----
  if (t.match(/^それら?をエナゾーンに置く$/)) {
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

  // ---- 手札からシグニをN枚捨てる（クラス指定なし）----
  {
    const m = t.match(/^手札からシグニを([０-９\d]+)枚捨てる$/);
    if (m) return { type: 'TRASH', target: { type: 'HAND_CARD', owner: 'self', count: parseNum(m[1]), filter: { cardType: 'シグニ' } } };
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
  // ---- この方法で場に出たシグニの【出】能力は発動しない ----
  if (t.match(/この方法で場に出たシグニの【出】能力は発動しない/)) {
    return { type: 'BLOCK_ACTION', target: { type: 'SIGNI', owner: 'any', count: 1 }, actionId: 'ON_PLAY_ABILITY', until: 'END_OF_TURN' };
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
    } as TransferToDeckAction;
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
  // 「見て…選び」＝自分（効果使用側）が相手手札を見て選ぶ → actingPlayerSelects:true
  // （無印だと execTrash で opponentResponds=相手が選ぶ になり取り違える）
  {
    const hvdM = t.match(/対戦相手の手札を見て([０-９\d]+)枚選び/);
    if (hvdM) {
      return { type: 'TRASH', target: { type: 'HAND_CARD', owner: 'opponent', count: parseNum(hvdM[1]), actingPlayerSelects: true } };
    }
    if (t.match(/対戦相手の手札を見て.*カード.*選び.*捨てさせる/)) {
      return { type: 'TRASH', target: { type: 'HAND_CARD', owner: 'opponent', count: 1, actingPlayerSelects: true } };
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
      const targetOwner: Owner = t.includes('対戦相手') ? 'opponent' : 'self';
      const sign = perTrashedCharmM[3] === '＋' ? 1 : -1;
      return {
        type: 'POWER_MODIFY_PER_CHARM',
        target: { type: 'SIGNI', owner: targetOwner, count: parseNum(perTrashedCharmM[1]) },
        deltaPerCharm: sign * parseNum(perTrashedCharmM[4]),
        sourceOwner: 'self',  // trashed_this_effect は常に自分のチャームをコストとしてトラッシュ
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

  return null;
}
