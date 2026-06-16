import type {
  EffectAction,
  EffectTarget,
  TargetFilter,
  Owner,
  SequenceAction,
  TransferToDeckAction,
  CostReductionAction,
  GrantProtectionAction,
  GrantKeywordAction,
  GrowFreeAction,
  BlockActionAction,
  EnergyChargeByFieldCountAction,
  LookAtDeckAndLifeAction,
  GrowCostReductionAction,
  NameBanAction,
  PlayFreeFromTrashAction,
  PowerThresholdTrashAction,
  PowerFlipAction,
  SelfTrashPreventAction,
  CostSubstituteAction,
  PlaceVirusAction,
  AttachAcceAction,
  BloodCrystalArmorAction,
  LrigLimitModifyAction,
  FreezeAction,
  LookAndReorderAction,
  AddCraftToLrigDeckAction,
  AwakenSigniAction,
  PlaceUnderSigniAction,
  PreventNextDamageAction,
  TakeFromUnderSigniAction,
  StubAction,
  CardLocation,
  RevealAction,
} from '../../types/effects';
import {
  parseNum, parseSigniTarget, parseStoryFilter, parseEnergyCosts,
} from '../parserUtils';

export function parseSentencePart2(t: string): EffectAction | null {
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
      const sources: ('hand' | 'trash' | 'deck')[] = [];
      if (srcText.includes('手札')) sources.push('hand');
      if (srcText.includes('トラッシュ')) sources.push('trash');
      if (srcText.includes('デッキ')) sources.push('deck');
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
      source: { location: 'life_cloth' as CardLocation, owner: 'self' },
      count: 1,
      private: true,
      reorder: false,
      canTrash: false,
      destination: { location: 'life_cloth' as CardLocation, owner: 'self', position: 'top' },
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
        source: { location: 'life_cloth' as CardLocation, owner: 'self' },
        count: parseNum(lifeToTopM[1]),
        private: true,
        reorder: true,
        canTrash: false,
        destination: { location: 'deck' as CardLocation, owner: 'self', position: 'any' },
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
          { type: 'TRANSFER_TO_DECK', source: { type: 'HAND_CARD', owner: 'self', count: parseNum(m[2]) }, position: 'bottom', shuffle: false } as TransferToDeckAction,
        ],
      } as SequenceAction;
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
      const filter: TargetFilter = { cardType: 'シグニ', levelRange: { max: parseNum(m[1]) } };
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
    } as RevealAction;
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

  // ---- このターン次にダメージを受ける場合代わりに受けない（シグニ/ルリグ/効果指定含む）----
  if (t.match(/このターン.*次にあなたが(?:シグニ|ルリグ|[^から]*)?(?:から|によって|で)?ダメージを受ける場合.*代わりにダメージを受けない/) ||
      t.match(/このターン.*あなたは.*(?:シグニ|ルリグ|対戦相手の効果)によってダメージを受けない/) ||
      t.match(/それはこのアタックでダメージを与えない/) ||
      t.match(/このターン、あなたは対戦相手の効果によってダメージを受けない/)) {
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
    } as SequenceAction;
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
  if (t.match(/このシグニは対戦相手の効果によって場から他の領域に移動しない/)) {
    return { type: 'STUB', id: 'PREVENT_SELF_MOVE_BY_OPP' } as StubAction;
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

  // ---- DECLARE_ZONE_FOR_CLASS_CHANGE: 【出】で領域を指定する（WX14-032）----
  if (t.match(/メインデッキ、手札、シグニゾーン、トラッシュのいずれか.*指定する/)) {
    return { type: 'STUB', id: 'DECLARE_ZONE_FOR_CLASS_CHANGE' } as StubAction;
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

  // ---- 対戦相手の効果によってダウンしない（このシグニ / ＜CLASS＞全体）----
  {
    const classDownM = t.match(/あなたの＜([^＞]+)＞のシグニは対戦相手の効果によってダウンしない/);
    if (classDownM) {
      return {
        type: 'GRANT_PROTECTION',
        subjectFilter: { cardType: 'シグニ', story: classDownM[1] },
        from: ['DOWN'], sourceOwner: 'opponent', duration: 'PERMANENT',
      } as GrantProtectionAction;
    }
    if (t.match(/このシグニは対戦相手の効果によってダウンしない/)) {
      return {
        type: 'GRANT_PROTECTION',
        target: { type: 'SIGNI', owner: 'self', count: 1 },
        from: ['DOWN'], sourceOwner: 'opponent', duration: 'PERMANENT',
      } as GrantProtectionAction;
    }
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
        source: { location: 'life_cloth' as CardLocation, owner: 'self' },
        count: parseNum(lifeReorderM[1]),
        private: true,
        reorder: true,
        canTrash: false,
        destination: { location: 'life_cloth' as CardLocation, owner: 'self', position: 'any' },
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

  // ---- 【キーワード】を得る（文脈依存owner/count）----
  {
    const kwBracketM = t.match(/【(ランサー|アサシン|ダブルクラッシュ|トリプルクラッシュ|シャドウ|バニッシュ耐性|シールド|チャーム)】を得る/);
    if (kwBracketM) {
      const kwOwner: Owner = t.includes('対戦相手') && !t.includes('あなた') ? 'opponent'
        : t.includes('あなた') ? 'self' : 'any';
      const kwAll = t.includes('すべてのシグニ') || t.includes('全てのシグニ') || t.includes('シグニすべて');
      const kwCountM = t.match(/シグニ([０-９\d]+)体/);
      const kwCount: number | 'ALL' = kwAll ? 'ALL' : kwCountM ? parseNum(kwCountM[1]) : 1;
      return { type: 'GRANT_KEYWORD', target: { type: 'SIGNI', owner: kwOwner, count: kwCount }, keyword: kwBracketM[1], duration: 'UNTIL_END_OF_TURN' } as GrantKeywordAction;
    }
  }

  // ---- 引用符の内側のテキスト（...」を得る で終わる）----
  if (t.endsWith('」を得る') || t.endsWith('」を得る。')) {
    const quoted = (t.match(/「([^」]+)」を得る/) ?? [])[1] ?? '';
    if (quoted.includes('アタックできない')) {
      return { type: 'BLOCK_ACTION', target: { type: 'SIGNI', owner: 'any', count: 1 }, actionId: 'ATTACK', until: 'END_OF_TURN' } as BlockActionAction;
    }
    const kwMatch = quoted.match(/^(ランサー|アサシン|ダブルクラッシュ|トリプルクラッシュ|シャドウ|バニッシュ耐性|シールド|チャーム)$/);
    if (kwMatch) {
      const kwOwner: Owner = t.includes('対戦相手') && !t.includes('あなた') ? 'opponent'
        : t.includes('あなた') ? 'self' : 'any';
      const kwAll = t.includes('すべてのシグニ') || t.includes('全てのシグニ') || t.includes('シグニすべて');
      const kwCountM = t.match(/シグニ([０-９\d]+)体/);
      const kwCount: number | 'ALL' = kwAll ? 'ALL' : kwCountM ? parseNum(kwCountM[1]) : 1;
      return { type: 'GRANT_KEYWORD', target: { type: 'SIGNI', owner: kwOwner, count: kwCount }, keyword: kwMatch[1], duration: 'UNTIL_END_OF_TURN' } as GrantKeywordAction;
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
    return { type: 'STUB', id: 'SOUL_OP' } as StubAction;
  }

  // ---- デッキからN枚このシグニの下に置く ----
  {
    const m = t.match(/あなたのデッキの上からカードを([０-９\d]+)枚?このシグニの下に置く/);
    if (m) return { type: 'PLACE_UNDER_SIGNI', source: 'deck_top', count: parseNum(m[1]) } as PlaceUnderSigniAction;
    // シャッフルしてデッキ上からN枚置く
    const ms = t.match(/(?:あなたの)?デッキをシャッフルし上からカード([０-９\d]+)枚をこのシグニの下に置く/);
    if (ms) {
      return {
        type: 'SEQUENCE', steps: [
          { type: 'SHUFFLE_DECK', owner: 'self' },
          { type: 'PLACE_UNDER_SIGNI', source: 'deck_top', count: parseNum(ms[1]) },
        ]
      } as SequenceAction;
    }
  }

  return null;
}
