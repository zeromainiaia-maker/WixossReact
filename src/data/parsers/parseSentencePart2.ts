import type {
  EffectAction,
  EffectTarget,
  PowerModifyAction,
  PowerModifyPerCharmAction,
  PowerModifyPerFieldAction,
  TargetFilter,
  Owner,
  SequenceAction,
  TransferToDeckAction,
  EnergyChargeAction,
  CostReductionAction,
  GrantProtectionAction,
  GrantKeywordAction,
  GrowFreeAction,
  BlockActionAction,
  PreventDamageAction,
  ZoneMoveImmunityAction,
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
  FieldSigniToAcceAction,
  BloodCrystalArmorAction,
  LrigLimitModifyAction,
  FreezeAction,
  LookAndReorderAction,
  AddCraftToLrigDeckAction,
  AwakenSigniAction,
  PlaceUnderSigniAction,
  PreventNextDamageAction,
  NegateAttackAction,
  TakeFromUnderSigniAction,
  StubAction,
  CardLocation,
  RevealAction,
  EffectDuration,
  ConditionalAction,
} from '../../types/effects';
import {
  blockUntilFromText,
  parseNum, parseSignedNum, parseSigniTarget, parseStoryFilter, parseEnergyCosts,
  parsePowerFilter, parseLevelFilter, parseStateFilter, parseColorFilter,
  parseCardTypeFilter, parseGuardFilter, parseIconFilter, signiClauseIconFilter, parsePlaceUnderSourceSigni,
} from '../parserUtils';

/**
 * 🆕**文中の《カード名》をコスト記号を除いて列挙する**（§5.3 `O-60` 第53バッチ・2026-09-03）。
 * ⚠除外規約は `parseNameFilter` と同じ＝`《白》`〜`《無》`／`×` を含む／`アイコン` を含むものはカード名ではない。
 */
function cardNamesInText(t: string): string[] {
  const COST_LIKE = new Set(['白', '赤', '青', '緑', '黒', '無']);
  return [...t.matchAll(/《([^》]+)》/g)].map(m => m[1])
    .filter(n => !COST_LIKE.has(n) && !n.includes('×') && !n.includes('アイコン') && !/^[白赤青緑黒無][×x]\d+$/.test(n));
}

/**
 * 「このシグニはこのカードの下にある〈X〉のシグニの…能力を得る」の〈X〉を TargetFilter へ落とす
 * （§5.3 `O-66`③・2026-08-25）。旧実装は **engine が `cardMap.EffectText` を regex で読んでいた**ので
 * JSON を見ても対象が分からず、`txt.includes('【常】')` のように**カード全文**を見て別の能力の表記まで
 * 拾っていた。ここは**その能力ブロックの文だけ**を見るので誤読しない。
 *
 * ⚠**「下にある」と「のシグニ」の間だけ**を切って解釈する（文全体に `parseColorFilter` 等を当てると
 *   「黒の」が別の場所から拾われる）。修飾が無ければ `filter` を付けない＝下の全カードが対象。
 */
function underGrantFilterOf(t: string): { filter?: TargetFilter } {
  const m = t.match(/このカードの下にある(.*?)のシグニの/);
  const phrase = m?.[1] ?? '';
  if (!phrase) return {};
  const filter: TargetFilter = {
    ...parseLevelFilter(phrase), ...parseColorFilter(phrase), ...parseStoryFilter(phrase),
  };
  const excludeM = phrase.match(/《([^》]+)》以外/);
  if (excludeM) filter.excludeCardName = excludeM[1];
  return Object.keys(filter).length > 0 ? { filter } : {};
}

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
      const reduction = costs.length > 0 ? costs : [{ color: '無', count: 1 }];
      // per-count scaling:「あなたのトラッシュにある<filter>N枚につき…減る」（WX14-009/WD14-001）。
      // 一致枚数が N 未満なら減額0（従来は N を無視して常時固定減額する過大軽減バグだった）。
      const perCountM = growCostM[1].match(/トラッシュにある(.+?)([０-９\d]+)枚につき/);
      if (perCountM) {
        const subj = perCountM[1];
        const filter: TargetFilter = {};
        const nameM = subj.match(/カード名に《([^》]+)》を含む/);
        const storyM = subj.match(/＜([^＞]+)＞/);
        if (nameM) filter.cardName = nameM[1];
        if (storyM) filter.story = storyM[1];
        if (subj.includes('シグニ')) filter.cardType = 'シグニ';
        return { type: 'GROW_COST_REDUCTION', reduction, perCount: { filter, count: parseNum(perCountM[2]) } } as GrowCostReductionAction;
      }
      // 🆕**「このターン、あなたのルリグが次にアシストルリグにグロウする場合、グロウするための
      //   ルリグタイプは無視され、グロウするためのコストは《無×1》減る」**（§5.3 `O-180`・`WX24-P2-043`）。
      // 🔴この形は**一過性（次の1回だけ）かつアシストグロウ限定**なので、場の【常】軽減とは別扱いにする。
      //   落とすと「このターン中は何度でも」＋「センターグロウにも効く」の二重の過剰になる。
      if (/次にアシストルリグにグロウする場合/.test(t)) {
        return {
          type: 'GROW_COST_REDUCTION', reduction,
          nextAssistGrowOnly: true,
          ...( /ルリグタイプは無視/.test(t) ? { ignoreLrigType: true } : {}),
        } as GrowCostReductionAction;
      }
      return { type: 'GROW_COST_REDUCTION', reduction } as GrowCostReductionAction;
    }
  }

  // ---- 同名カード使用禁止（禁止されるのは対戦相手＝targetSelf:false。直前に除外したカード名を ban する）----
  if (t.match(/対戦相手はそれと同じ名前のカードを使用できない/)) {
    // ⚠期間は**原文から取る**＝「このターン、」が付く形（`WDK07-E08` ③）を `GAME` に倒すと
    //   ゲーム中ずっと封じる過剰実行になる（§6.4 O-11）。
    return { type: 'NAME_BAN', targetSelf: false,
      duration: /このターン/.test(t) ? 'TURN' : 'GAME' } as NameBanAction;
  }

  // ---- トラッシュからコスト以下のスペルを使用 ----
  {
    const playFreeM = t.match(/トラッシュからコストの合計が([０-９\d]+)以下の(.+?)スペル([０-９\d]+)枚を対象とし、それをコストを支払わずに使用してもよい/);
    if (playFreeM) {
      const storyFilter = parseStoryFilter(playFreeM[2]) as TargetFilter;
      // 「青の」等の色限定は parseStoryFilter（＜クラス＞専用）では拾えないため別途抽出（WX09-012）
      const colorsPFM = [...playFreeM[2].matchAll(/(白|赤|青|緑|黒)/g)].map(m => m[1]);
      return {
        type: 'PLAY_FREE_FROM_TRASH',
        costThreshold: parseNum(playFreeM[1]),
        filter: {
          cardType: 'スペル',
          ...(colorsPFM.length === 1 ? { color: colorsPFM[0] } : colorsPFM.length > 1 ? { color: colorsPFM } : {}),
          ...storyFilter,
        },
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
  // ⚠TRASH（バニッシュ＝エナ送りではない）＋ nonColorless フィルタ（従来は無フィルタ＝無色も巻き込む過剰・続き19是正）
  if (t.match(/無色ではないすべてのシグニをトラッシュに置く/)) {
    return { type: 'TRASH', target: { type: 'SIGNI', owner: 'any', count: 'ALL', filter: { cardType: 'シグニ', nonColorless: true } } };
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
  // ⚠🔴**綴りが1つズレていて engine に届いていなかった**（§6.4 O-3 続き491）＝
  //   スキップ機構が消費するのは `SIGNI_ATTACK_STEP`（「シグニアタック**ステップ**」の綴り）だけで、
  //   ここが吐く `SIGNI_ATTACK_PHASE` はどこにも消費地点が無く `WX16-001-E3`（コイン3の【起】）は
  //   **一度も効いていなかった**。「シグニアタックフェイズ」と「シグニアタックステップ」は同じもの。
  if (t.match(/シグニアタックフェイズをスキップする/)) {
    return { type: 'BLOCK_ACTION', target: { type: 'PLAYER', owner: 'self', count: 1 }, actionId: 'SIGNI_ATTACK_STEP', until: 'END_OF_TURN' };
  }

  // ---- 手札からパワーN以上のシグニを場に出せない ----
  {
    const blockPlayM = t.match(/対戦相手は手札からパワー([０-９\d]+)以上のシグニを場に出せない/);
    if (blockPlayM) {
      const until = t.includes('次の対戦相手のターン') ? 'NEXT_TURN' : 'END_OF_TURN';
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
    // 「N枚を対象とし」だけでなく「N枚まで対象とし」（＝upToCount）も拾う（WXDi-P01-063/WXK01-109 等）。
    const trashToDeckTopM = t.match(/トラッシュから(.+?)([０-９\d]+)枚(まで)?を?対象とし、それ(?:ら)?を(?:対戦相手の)?デッキの一番上に置く/);
    if (trashToDeckTopM) {
      const desc = trashToDeckTopM[1];
      const owner: Owner = t.includes('対戦相手のトラッシュ') ? 'opponent' : 'self';
      const filter: TargetFilter = {
        ...parseCardTypeFilter(desc), ...parseLevelFilter(desc), ...parseColorFilter(desc), ...parseStoryFilter(desc),
        // 「《ガードアイコン》を持たない〜をデッキの一番上に置く」（続き377b）＝落ちるとガード持ちも積める過剰効果
        //   （`WXDi-P01-063-E1`）。デッキに加えてシャッフルする側（part1）と同じ穴。
        ...parseGuardFilter(desc), ...parseIconFilter(desc),
      };
      const upTo = !!trashToDeckTopM[3];
      return {
        type: 'TRANSFER_TO_DECK',
        source: { type: 'TRASH_CARD', owner, count: parseNum(trashToDeckTopM[2]), ...(upTo ? { upToCount: true } : {}), filter: Object.keys(filter).length > 0 ? filter : undefined },
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
  {
    // 「アクセアイコンを持つ自シグニ1体」を、選んだカードとは別の指定クラスの
    // 自シグニへアクセする文型。GRANT_KEYWORD（「アクセを得る」）より先に構造化する。
    const fieldAcceM = t.match(/《アクセアイコン》を持つあなたのシグニ[１1]体を(?:対象とし、)?あなたの他の＜([^＞]+)＞のシグニ[１1]体の【アクセ】にする/);
    if (fieldAcceM) {
      return {
        type: 'FIELD_SIGNI_TO_ACCE',
        sourceOwner: 'self',
        targetSigniOwner: 'self',
        sourceFilter: { cardType: 'シグニ', hasIcon: 'アクセ' },
        targetFilter: { cardType: 'シグニ', story: fieldAcceM[1] },
      } as FieldSigniToAcceAction;
    }
  }
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
      const bca: BloodCrystalArmorAction = { type: 'BLOOD_CRYSTAL_ARMOR', source: sources.length > 0 ? sources : ['hand', 'trash'], count: 1 };
      // 「あなたの＜紅蓮＞のシグニ１体を対象とし、それを血晶武装」→ 対象をそのクラスに限定
      const bcaClassM = t.match(/＜([^＞]+)＞のシグニ[^。]*血晶武装/);
      if (bcaClassM) bca.targetFilter = { cardType: 'シグニ', story: bcaClassM[1] };
      return bca;
    }
  }

  // ---- 手札からシグニを公開する／公開してもよい（N枚／N枚まで／好きな枚数・名前が異なる）----
  //   従来は「N枚まで公開してもよい」限定で、「公開する」（必須形）・「好きな枚数」・「それぞれ名前が異なる」は
  //   bare REVEAL に潰れ、source/filter/count が丸ごと脱落＝engine が lastProcessedCards を記録せず「この方法で
  //   シグニをN枚以上公開した場合」の結果カウント条件が全て IS_MY_TURN 化していた（タスク12(xxii)・WX21-023/
  //   WXEX1-69/WXK04-034/WDK08-Y01/Y11 等）。source:HAND_CARD にすれば execReveal が選択カードを記録する。
  {
    // ⚠語順「シグニ**N枚を**公開する」（`WX14-072-E1`／`WX14-075-E1`／`WXK05-044-E1`）も受ける（続き373）。
    //   旧実装は「シグニ(を)N枚公開」だけを見ており、この3効果は bare REVEAL に潰れて source/filter が丸ごと
    //   落ちていた＝engine が lastProcessedCards を記録できず、後続の「この方法で公開したシグニと同じ名前の…」
    //   （`WXK05-044-E1`）が**参照先を失う**。
    const revealHandM = t.match(/あなたの手札から(それぞれ名前が異なる|名前の異なる)?(?:(.+?)の)?シグニ(?:を?(?:([０-９\d]+)枚(まで)?|好きな枚数)を?)公開(?:する|してもよい)/);
    if (revealHandM) {
      const filter: TargetFilter = { cardType: 'シグニ' };
      // 「レベル３以上の＜水獣＞の」のようにレベルとクラスが同居する（旧実装はクラスだけ拾いレベルを落としていた）。
      if (revealHandM[2]) Object.assign(filter, parseStoryFilter(revealHandM[2]), parseLevelFilter(revealHandM[2]));
      // 「それぞれ名前が異なる」は公開選択の軽微な制約＝TargetFilter 未対応・記録/条件には影響しないため据置。
      const count = revealHandM[3] ? parseNum(revealHandM[3]) : 'ALL';
      // 「N枚まで」「好きな枚数」＝可変（upTo）／「N枚」＝ちょうど。
      const upToCount = !!revealHandM[4] || !revealHandM[3];
      const optional = /公開してもよい/.test(t);
      return { type: 'REVEAL', source: { type: 'HAND_CARD', owner: 'self', count, upToCount, filter }, ...(optional ? { optional: true } : {}) } as { type: 'REVEAL'; source?: EffectTarget; optional?: boolean };
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
    const max = unlimited ? 'ALL' : (maxM ? parseNum(maxM[1]) : 1);
    return { type: 'STUB', id: 'MULTI_ACCE_LIMIT', value: max } as StubAction;
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

  // ---- アーツとスペル使用禁止（§6.4 O-3 続き459）----
  // 🔴従来は `actionId:'ARTS_AND_SPELL'` という**合成 ID 1本**を積んでいたが、封じ判定
  //   （`BattleScreen` の `isActionBlocked`）は **actionId の完全一致**なので、`USE_ARTS` / `USE_SPELL`
  //   のどちらのチェックにも当たらない＝**誰も読まない死 actionId**（live 5効果が真 no-op）。
  //   `USE_ARTS` と `USE_SPELL` の**2本に割る**＝どちらも live に消費地点がある。
  // ⚠語順は両方ある（「アーツとスペル」／「スペルとアーツ」）。
  // 🆕⚠**色で限定された使用封じは受けない**（§6.4 O-11・続き532・`PR-471`②
  //   「対戦相手は**無色ではない、**アーツとスペルを使用できない」）。
  //   `BLOCK_ACTION` は actionId しか持たず**カードの色で絞る機構が無い**ので、素の2本を積むと
  //   **無色のアーツ／スペルまで封じる過剰実行**になる（既存の `BLOCK_NON_WHITE_SPELL` も engine では
  //   ログだけの no-op ＝この層は未実装）。実装が入るまでは明示 defer。
  if (/(?:無色ではない|[白赤青緑黒]の)[、,]?(?:アーツとスペル|スペルとアーツ)を使用できない/.test(t)) {
    return { type: 'STUB', id: 'DEFERRED_COLOR_QUALIFIED_USE_BLOCK' } as StubAction;
  }
  if (t.match(/(?:アーツとスペル|スペルとアーツ)を使用できない/)) {
    const owner: Owner = (t.includes('あなたはアーツ') || (t.includes('あなたは') && !t.includes('対戦相手'))) ? 'self' : 'opponent';
    const until = blockUntilFromText(t);
    const tgt = { type: 'PLAYER' as const, owner, count: 1 };
    return { type: 'SEQUENCE', steps: [
      { type: 'BLOCK_ACTION', target: tgt, actionId: 'USE_ARTS', until },
      { type: 'BLOCK_ACTION', target: tgt, actionId: 'USE_SPELL', until },
    ] };
  }

  // ---- センタールリグのリミット増減 ----
  {
    // 🆕**「リミット**を**－N**する**」形も受ける**（§5.3 `O-60` 第52バッチ・2026-09-03）＝
    //   `WXDi-P16-047-E2`「対戦相手のセンタールリグのリミットを－１する」は**助詞と動詞が違う**だけで
    //   この typed 受け皿に届かず、`STUB{LRIG_LIMIT_MODIFY}`（engine がカード全文を読む）へ落ちていた。
    const limitVerbM = t.match(/(?:対戦相手の)?センタールリグのリミットは([１-９\d]+)(増え|減る)/);
    const limitSignM = t.match(/(?:対戦相手の)?センタールリグのリミットを([＋－+-])([１-９\d]+)する/);
    if (limitVerbM || limitSignM) {
      const delta = limitVerbM
        ? parseNum(limitVerbM[1]) * (limitVerbM[2] === '増え' ? 1 : -1)
        : parseNum(limitSignM![2]) * ('＋+'.includes(limitSignM![1]) ? 1 : -1);
      // ⚠「（お互いのセンタールリグに影響する）」の注記は **`stripRuleParens` でここへ届く前に消える**ので
      //   ここでは読めない＝`owner:'any'` はカード単位の後段（`parseCardEffects` の末尾）で刻む。
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
        // untilHandCount＝「手札がN枚になるように」＝実行時の手札枚数との差。count は旧表現の保険（engine は untilHandCount を優先）
        then: { type: 'TRASH', target: { type: 'HAND_CARD', owner: 'opponent', count: threshold - target }, untilHandCount: target },
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
  // 🆕**枚数と対象を payload で刻む**（§5.3 `O-60` 第9バッチ・2026-08-29）＝engine が
  //   **カード全文に `好きな枚数` が1度でも出るか**で分岐していたのを剥がすため。
  //   ⚠ここは**文単位**の `t` なので、同じカードの別能力の「好きな枚数」を巻き込まない。
  if (t.match(/【シード】.*開花する/)) {
    return {
      type: 'STUB', id: 'SEED_BLOOM',
      ...(/好きな枚数/.test(t) ? { seedCount: 'any' as const } : {}),
      ...(/この【シード】を開花する/.test(t) ? { seedTargetSelf: true } : {}),
    } as StubAction;
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
    // 「対戦相手の◯◯がアタック」の主語句だけを取り出し、後続の別節（WX17-006のベット節等）を混ぜない。
    const subjM = t.match(/対戦相手の([^。]*?)がアタック/);
    const subj = subjM ? subjM[1] : '';
    const signi = /シグニ/.test(subj);
    const lrig = /センタールリグ/.test(subj);
    const count = /一度目か二度目/.test(t) ? 2 : 1;
    return {
      type: 'STUB',
      id: 'NEGATE_NTH_ATTACK',
      negateNthAttack: { count, signi: signi || !lrig, lrig },
    } as StubAction;
  }

  // ---- 対戦相手はシグニをN体までしか場に出せない ----
  {
    const fieldLimitM = t.match(/対戦相手はシグニを([０-９\d]+)体までしか場に出すことができない/);
    if (fieldLimitM) {
      return { type: 'STUB', id: `LIMIT_OPP_FIELD_${parseNum(fieldLimitM[1])}` } as StubAction;
    }
  }

  // ---- すべてのプレイヤーはシグニをN体しか場に出すことができない（既に2体以上なら1体になるよう捨てる）----
  {
    const allFieldLimitM = t.match(/すべてのプレイヤーはシグニを([０-９\d]+)体しか場に出すことができない/);
    if (allFieldLimitM) {
      return { type: 'STUB', id: `LIMIT_ALL_FIELD_${parseNum(allFieldLimitM[1])}` } as StubAction;
    }
  }

  // ---- 《レイヤーアイコン》能力コピー ----
  // 🆕§5.3 `O-60` 第22バッチ（2026-09-03）＝**候補の場所を payload で運ぶ**。
  //   旧実装は engine が**カード全文**に `includes('トラッシュから')` を当てており、
  //   同じカードの別の能力に「トラッシュから」があると場所が裏返る形だった。
  //   ⚠絞り込みは `selectTarget.filter`（すぐ下で `parseSigniTarget` が出す）が正＝
  //   engine 側の `'怪異'` ハードコードはこのバッチで撤去した。
  if (t.match(/《レイヤーアイコン》能力.*を得る/)) {
    return {
      type: 'STUB', id: 'LAYER_ABILITY_COPY',
      layerCopy: { source: /トラッシュから/.test(t) ? 'trash' as const : 'field' as const },
      ...(/対象とし/.test(t) ? { selectTarget: parseSigniTarget(t, 'self') } : {}),
    } as StubAction;
  }

  // ---- あなたにダメージを与える ----
  if (t.match(/^あなたにダメージを与える$/)) {
    return { type: 'LIFE_CRASH', owner: 'self', count: 1, triggerBurst: true };
  }

  // ---- 手札からカードをエナゾーンに置く（optional）----
  // §5.3 `O-60` 第15バッチ＝**受け皿は最初から在った**（`ENERGY_CHARGE{target:{HAND_CARD}}` は live に兄弟が複数）。
  // 🔴旧 `STUB{HAND_TO_ENERGY_OPTIONAL}` は engine が実行時に**カード全文**へ
  //   `/手札から(?:カード)?N枚まで/` を当てて枚数を決めていたが、**live 2効果の原文はどちらも
  //   「カード１枚を」で「まで」が無く1本も当たっていなかった**（既定1で結果的に合っていただけ）。
  //   ここは枚数を既にキャプチャしているので、そのまま payload へ刻む。
  // ⚠「置いても**よい**」＝`upToCount:true`（0枚を選べる）。`execEnergyCharge` が `selectOrInteract` へ渡す。
  {
    const handEnaM = t.match(/あなたの手札からカード([０-９\d]+)枚をエナゾーンに置いてもよい/);
    if (handEnaM) {
      return {
        type: 'ENERGY_CHARGE',
        target: { type: 'HAND_CARD', owner: 'self', count: parseNum(handEnaM[1]), upToCount: true },
      } as EnergyChargeAction;
    }
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
  // §5.3 `O-60` 第1バッチ＝**ゾーンと枚数を `lookZone` に刻む**（engine のカード全文 regex を撤去）。
  if (t.match(/対戦相手のライフクロスの一番上を見る/)) {
    return { type: 'STUB', id: 'LOOK_OPP_LIFE_TOP', lookZone: { zone: 'opp_life', count: 1 } } as StubAction;
  }

  // ---- センタールリグのレベルが条件で代わりに複数選択（レベルが以上）----
  if (t.match(/センタールリグのレベルが?[０-９\d]+以上の場合.*代わりに[２-９]つまで選ぶ/)) {
    return { type: 'STUB', id: 'CONDITIONAL_MULTI_CHOOSE_BY_CENTER_LEVEL_GTE' } as StubAction;
  }

  // ---- ルリグアタックで特定カード名をすべてトラッシュ ----
  // 🆕§5.3 `O-60` 第34バッチ（2026-09-03）＝**カード名とゾーンを payload で運ぶ**。
  //   旧実装は engine が `/「([^」]+)」/`（**かぎ括弧**）で名前を取ろうとしており、原文の綴りは《》なので
  //   **1本も当たらず恒久 no-op** だった（照合も完全一致で「含む」と別物）。
  const trashByNameM = t.match(/対戦相手の場とエナゾーンからカード名に《([^》]+)》を含むすべてのカードをトラッシュに置く/);
  if (trashByNameM) {
    return {
      type: 'STUB', id: 'TRASH_ALL_BY_NAME_FROM_FIELD_AND_ENERGY',
      trashAllByName: { nameContains: trashByNameM[1], zones: ['field', 'energy'] },
    } as StubAction;
  }

  // ---- スペルを制限なし・コスト0で使用 ----
  // 🆕§5.3 `O-60` 第20バッチ（2026-09-03）＝**候補の場所とコスト上限を payload で運ぶ**。
  //   旧実装は engine が候補ゾーンを持たず**常に自分の手札**から選んでおり、
  //   「対戦相手のトラッシュから」「いずれかのプレイヤーのトラッシュから」の2効果が
  //   **原文と違う場所のカードを使っていた**。
  if (t.match(/スペル.*コストを支払わずに限定条件を無視して使用/)) {
    // 🔴**知っている3形だけを payload にする**＝当てはまらない文は payload を付けずに返し、
    //   engine 側で fail-closed（何もしない）にする。旧既定（自分の手札）へ倒すと、
    //   原文にない場所のカードを使える過剰実行が別の文型で再発する。
    const psfSource = /いずれかのプレイヤーのトラッシュから/.test(t) ? 'any_trash' as const
      : /対戦相手のトラッシュから/.test(t) ? 'opp_trash' as const
      : /あなたの手札から/.test(t) ? 'self_hand' as const
      : undefined;
    if (!psfSource) return { type: 'STUB', id: 'PLAY_SPELL_FREE_IGNORE_RESTRICTION' } as StubAction;
    // ⚠**コスト上限はこの文からだけ読む**（旧 engine はカード全文から拾っており、
    //   同じカードの別の能力の数字を掴みうる形だった）。
    const psfCostM = t.match(/コストの合計が([０-９\d]+)以下/);
    return {
      type: 'STUB', id: 'PLAY_SPELL_FREE_IGNORE_RESTRICTION',
      playSpellFree: {
        source: psfSource,
        ...(psfCostM ? { maxCostTotal: parseNum(psfCostM[1]) } : {}),
      },
    } as StubAction;
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
  // §6.4 O-24：旧 `STUB{OPP_TRASH_FIELD_SIGNI_AND_ENERGY}` は**相手の場のシグニ全部＋エナ全部**を流す
  // 過剰実行だった（原文は `WXK06-030-E2`「シグニ**１体**と…カード**１枚**を対象とし」）。
  // ⚠`owner:'opponent'`（誰のカードか）と `opponentSelects`（誰が選ぶか）は**独立**なので必ず併記する
  //   ＝原文の主語が「対戦相手は、自分の…を対象とし」なので選ぶのは相手（続き411 の教訓）。
  {
    const oppTrashM = t.match(/対戦相手は[、,]?自分の場からシグニ([０-９\d一二三四五六七八九十]+)体と自分のエナゾーンからカード([０-９\d一二三四五六七八九十]+)枚を対象とし[、,]?.*トラッシュに置く/);
    if (oppTrashM) {
      return {
        type: 'SEQUENCE',
        steps: [
          { type: 'TRASH', target: { type: 'SIGNI', owner: 'opponent', count: parseNum(oppTrashM[1]), filter: { cardType: 'シグニ' } }, opponentSelects: true },
          { type: 'TRASH', target: { type: 'ENERGY_CARD', owner: 'opponent', count: parseNum(oppTrashM[2]) }, opponentSelects: true },
        ],
      } as SequenceAction;
    }
  }
  // ⚠旧フォールバック（`STUB{OPP_TRASH_FIELD_SIGNI_AND_ENERGY}`）は**削除した**＝全 CSV 走査で上の
  //   明示規則が母集団（`WXK06-030-E2` の1件）を完全に覆い、フォールバックの live 利用は0件。
  //   残すと「体数/枚数を書き忘れた変種」が黙って全流しへ落ちるので、無配線のまま計器に残すほうがよい。

  // ---- 対戦相手のターン中、このシグニがバニッシュされたとき相手が手札をデッキ上に ----
  if (t.match(/対戦相手のターンの間.*このシグニがバニッシュされたとき.*対戦相手は手札.*デッキの一番上に置く/)) {
    return { type: 'STUB', id: 'OPP_RETURN_HAND_ON_SELF_BANISH' } as StubAction;
  }

  // ---- 対戦相手は手札をN枚デッキの一番上に置く ----
  // 🆕§5.3 `O-60` 第52バッチ（2026-09-03）＝枚数は payload（engine はカード全文を読まない）。
  const ohtdM = t.match(/対戦相手は手札を([０-９\d１-９]+)枚デッキの一番上に置く/);
  if (ohtdM) {
    return { type: 'STUB', id: 'OPP_HAND_TO_DECK_TOP', oppHandToDeckCount: parseNum(ohtdM[1]) } as StubAction;
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
    return {
      type: 'STUB', id: 'SEED_BLOOM_OPTIONAL',
      ...(/好きな枚数/.test(t) ? { seedCount: 'any' as const } : {}),
    } as StubAction;
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
    // live 既存語彙は値なし＝2枚上限の1件だけ。collector が後方互換で2として読む。
    return { type: 'STUB', id: 'MULTI_ACCE_LIMIT' } as StubAction;
  }

  // ---- 手札から調理シグニをアクセにする（枚数付き）----
  if (t.match(/あなたの手札から.*シグニを[０-９\d]+枚までこのシグニの【アクセ】にする/)) {
    return { type: 'STUB', id: 'MULTI_ACCE_FROM_HAND' } as StubAction;
  }

  // ---- チャーム枚数でパワーアップ ----
  // 🆕§5.3 `O-60` 第29バッチ（2026-09-03）＝**typed `POWER_MODIFY_PER_CHARM` へ寄せた**（STUB は撤去）。
  // 🔴旧 `STUB{POWER_BY_CHARM_COUNT}` は engine が原文 regex で単価を読み、さらに
  //   **自分の場のチャームしか数えず**（原文「**場にある**」＝両者）、修正先も
  //   **対戦相手のシグニ**に積んでいた（原文は「**この**シグニのパワーは」＝真逆）。
  // 🔑同型の受け皿は live に3効果（`WX08-031` ほか）で稼働中＝新設ゼロ。
  const selfPowerPerCharmM = t.match(/このシグニのパワーは(あなたの場|対戦相手の場|場)にある【チャーム】([０-９\d]+)枚につき([＋－])([０-９\d]+)される/);
  if (selfPowerPerCharmM) {
    const sign = selfPowerPerCharmM[3] === '＋' ? 1 : -1;
    const scope = selfPowerPerCharmM[1];
    return {
      type: 'POWER_MODIFY_PER_CHARM',
      target: { type: 'SIGNI', owner: 'self', count: 1 },
      deltaPerCharm: sign * parseNum(selfPowerPerCharmM[4]),
      // 「場にある」＝所有者を問わない（両者の場のチャームを数える）。
      sourceOwner: (scope === 'あなたの場' ? 'self' : scope === '対戦相手の場' ? 'opponent' : 'any') as Owner,
      sourceLocation: 'field',
      // ⚠**`until` を書かない**＝`extractPowerModifiesPerCharm` は `until` があると ACTIVATED 扱いにして
      //   CONTINUOUS 経路から外す（書くと恒久 no-op になる）。
    } as PowerModifyPerCharmAction;
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
    // 🆕§5.3 `O-60` 第53バッチ（2026-09-03）＝カード名は payload。
    // ⚠**コスト記号を除く**（`parseNameFilter` と同じ規約）＝旧 engine は同じカードの別の【起】にある
    //   《無》《ゲーム１回》《緑×0》まで候補に入れていた。
    return { type: 'STUB', id: 'ADD_CARD_TO_LRIG_DECK', addToLrigDeck: { cardNames: cardNamesInText(t) } } as StubAction;
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
  // ⚠🔴`INHERIT_OPP_LRIG_TYPE` は **CONTINUOUS 専用**＝`collectLrigNameAliases` が
  //   「センタールリグの CONTINUOUS 効果」しか走査しないので、**【起】に載ると恒久 no-op** になる
  //   （`WDK17-001-E2`「このゲームの間、〜」＝executor 側のハンドラはログを出すだけ・§6.4 O-3 続き498）。
  //   期間つきの実体を持つ `GAIN_LRIG_TYPE` へ振り替える。【常】側は従来どおり alias 走査に任せる。
  if (/^このゲームの間、この(?:ルリグ|カード)は対戦相手のセンタールリグのルリグタイプを追加で得る$/.test(t)) {
    return { type: 'GAIN_LRIG_TYPE', owner: 'self', from: 'opponent_center_lrig', turns: 'GAME' } as EffectAction;
  }
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
  const gainSubM = t.match(/登録者数を([０-９\d]+)万人得る/);
  if (gainSubM) {
    return { type: 'STUB', id: 'GAIN_SUBSCRIBER_COUNT', value: parseNum(gainSubM[1]) } as StubAction;
  }

  // ---- 場のすべてのシグニとキーをトラッシュ ----
  if (t.match(/すべてのシグニをトラッシュに置き.*すべてのキーをルリグトラッシュに置く/)) {
    return { type: 'STUB', id: 'TRASH_ALL_SIGNI_AND_KEY' } as StubAction;
  }

  // ---- 場以外のカードが対戦相手の効果で移動しない ----
  if (t.match(/場以外のあなたの領域.*クラッシュ以外の対戦相手の効果.*他の領域に移動しない/)) {
    return { type: 'STUB', id: 'PREVENT_NON_FIELD_MOVE_BY_OPP' } as StubAction;
  }

  // ---- 感染シグニのパワーを「そのシグニのレベル1につき」減少 ----
  // 🆕§5.3 `O-60` 第25バッチ（2026-09-03）＝**typed `POWER_MODIFY` へ寄せた**（STUB は撤去）。
  // 🔴旧 `STUB{INFECTED_SIGNI_POWER_DOWN_BY_LEVEL}` は engine が原文 regex（「**ウイルス**」表記＝
  //   原文の「**感染状態**」と綴りが違い**1本も当たらない**）で単価を読み、さらに
  //   **感染シグニのレベルの合計**を**相手の全シグニ**へ掛けていた＝原文（各シグニに自分のレベル分）と別物。
  // 🔑同型の平坦版4枚（`WX15-004` ほか）は既に `POWER_MODIFY{filter:{infected:true}}` で動いており、
  //   足りないのは `deltaPerTargetLevel`（＝「そのシグニのレベル1につき」）の CONTINUOUS 経路だけだった。
  const infectedPerLvM = t.match(/対戦相手の感染状態のシグニのパワーをそのシグニのレベル([０-９\d]+)につき([－＋][０-９\d]+)する/);
  if (infectedPerLvM && parseNum(infectedPerLvM[1]) === 1) {
    return {
      type: 'POWER_MODIFY',
      target: { type: 'SIGNI', owner: 'opponent', count: 'ALL', filter: { cardType: 'シグニ', infected: true } },
      delta: parseSignedNum(infectedPerLvM[2]),
      deltaPerTargetLevel: true,
    } as PowerModifyAction;
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
  // 🆕§5.3 `O-60` 第43バッチ（2026-09-03）＝typed `ADD_TO_LIFE` へ寄せた（受け皿は既存）。
  if (t.match(/あなたのデッキの一番上のカードをライフクロスに加え/)) {
    return { type: 'ADD_TO_LIFE', owner: 'self', count: 1, fromTop: true } as EffectAction;
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
  const mdalaM = t.match(/このターン[^。]*このルリグは自身のアタックによってダメージを([０-９\d]+)回与える/);
  if (mdalaM) {
    // 🆕§5.3 `O-60` 第52バッチ（2026-09-03）＝回数は payload。
    return { type: 'STUB', id: 'MULTI_DAMAGE_ON_LRIG_ATTACK', lrigAttackTimes: parseNum(mdalaM[1]) } as StubAction;
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

  // ---- ルリグによってダメージを受けない（【常】＝期間なし）----
  // ⚠**期間つき（下の2規則）とは別の層**＝【常】は場にあるかぎり有効なので予約ではなく宣言で表す。
  //   判定は `isLrigDamagePrevented`（`screens/battle/lrigDamageShield.ts`）＝シグニ／ルリグ／
  //   アシスト／キーを走査する（§6.4 O-3 続き492 で走査軸を広げた）。
  if (t.match(/あなたはルリグによってダメージを受けない/)) {
    return { type: 'STUB', id: 'PREVENT_LRIG_DAMAGE' } as StubAction;
  }

  // ---- 期間つき「対戦相手のルリグによってダメージを受けない」（§6.4 O-3 続き492）----
  // 🔑**期間軸は `PREVENT_DAMAGE{scope:'LRIG'}` の1本にまとめる**＝`prevent_damage_windows` は
  //   ターン境界の昇格まで含めて実装済みで、期間内は**回数無制限**（原文どおり）。
  // ⚠🔴旧 `STUB{PREVENT_LRIG_DAMAGE_UNTIL_NEXT_TURN}` は `prevent_lrig_damage` フラグを立てるだけで、
  //   そのフラグは**ターン終了時にクリアされる**＝「次のターンの間」が一度も効かない恒久 no-op だった
  //   （`WXK10-019-E2`）。旧 `_THIS_TURN` も**1回で消費**していたので、同一ターンの2回目以降を防げなかった。
  if (t.match(/次のターンの間.*あなたは対戦相手のルリグによってダメージを受けない/)) {
    return { type: 'PREVENT_DAMAGE', owner: 'self', until: 'NEXT_TURN', scope: 'LRIG' } as PreventDamageAction;
  }
  if (t.match(/このターン.*あなたは対戦相手のルリグによってダメージを受けない/)) {
    return { type: 'PREVENT_DAMAGE', owner: 'self', until: 'UNTIL_END_OF_TURN', scope: 'LRIG' } as PreventDamageAction;
  }
  // ---- 期間句を持たない裸の形＝**【常】の宣言**（§6.4 O-27・続き536）----
  // 「【常】：〈条件〉であるかぎり、あなたは対戦相手のルリグによってダメージを受けない。」の本体。
  // 🔑期間つき（上2つ）は `PREVENT_DAMAGE` ウィンドウだが、**【常】は宣言 STUB**（`PREVENT_LRIG_DAMAGE`）
  //   ＝`resolveLrigDamageShield` が毎回 `activeCondition` を評価し直す軸に載せる（回数無制限）。
  //   ⚠ここでウィンドウ側（`PREVENT_DAMAGE`）を返すと**条件が落ちて張りっぱなし**になる。
  // ⚠**完全一致アンカー**にする＝「次の対戦相手のターンの間、」「次のあなたのメインフェイズまで、」等の
  //   期間句つきは別規則の領分（`WX26-CP1-007-E1`／`WXK01-002-E2`）。前置きを許すと横取りする。
  if (/^あなたは対戦相手のルリグによってダメージを受けない。?$/.test(t.trim())) {
    return { type: 'STUB', id: 'PREVENT_LRIG_DAMAGE' } as StubAction;
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
  // 🆕**軽減する色と枚数を payload で刻む**（§5.3 `O-60` 第54バッチ・2026-09-03）＝
  //   engine が `EffectText`（カード全文）から読み直していた分を剥がすため。
  if (t.match(/次にあなたが【出】能力を発動する場合.*発動コストは.*減る/)) {
    const rpacM = t.match(/発動コストは《([白赤青緑黒無])×?([０-９\d]*)》?(?:×([０-９\d]+))?[^。]*?減る/);
    const rpac: StubAction = { type: 'STUB', id: 'REDUCE_PLAY_ABILITY_COST' };
    if (rpacM) {
      const n = rpacM[2] || rpacM[3];
      rpac.reduceNextOnPlayCost = { color: rpacM[1], count: n ? parseNum(n) : 1 };
    }
    return rpac;
  }

  // ---- 手札から特定クラスのシグニを公開してもよい ----
  if (t.match(/あなたの手札から.*のシグニを.*枚公開してもよい/)) {
    return {
      type: 'REVEAL',
      source: { type: 'HAND_CARD', owner: 'self', count: 1 },
    } as RevealAction;
  }

  // ---- 悪魔シグニは場から手札に戻らない ----
  // 🆕§5.3 `O-66`③：保護対象を **payload** で運ぶ（旧実装は engine が `cardMap.EffectText` を
  //   regex で読んでクラスを決めていた＝JSON を見ても何が守られるか分からなかった）。
  //   ⚠クラス修飾が無い形（`WX13-029-E1`②「このターン、あなたのシグニは場から手札に戻らない」）は
  //   **あなたのシグニ全部**が正しいので filter を付けない。
  if (t.match(/あなたの.*シグニは場から手札に戻らない/)) {
    const bounceClassM = t.match(/あなたの(?:すべての)?＜([^＞]+)＞のシグニは場から手札に戻らない/);
    return {
      type: 'STUB', id: 'SIGNI_CANT_BOUNCE_FROM_FIELD',
      ...(bounceClassM ? { moveProtectFilter: { cardType: 'シグニ', story: bounceClassM[1] } } : {}),
    } as StubAction;
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
  // 🆕**§5.3 `O-220` 第1バッチ（2026-09-02）＝「**それは**このアタックでダメージを与えない」を
  //   `NEGATE_ATTACK{attackingOnly}` へ移した**（`WX17-044-TRAP` の1効果）。
  // 🔴**「それ」＝直前に対象とした「アタックしているシグニ」なのに `PREVENT_NEXT_DAMAGE` には
  //   `target` が無く、照応先が JSON のどこにも残らなかった**（`O-96` の欠陥署名に残っていた形）。
  //   同カードの兄弟形（`WX16-029-E1`「それはこのアタックで**あなたに**ダメージを与えない」）は
  //   既に `NEGATE_ATTACK` だったので、**同じ文型を2つの型へ割っていた**ことにもなる。
  if (t.match(/それはこのアタックでダメージを与えない/)) {
    return { type: 'NEGATE_ATTACK', target: { type: 'SIGNI', owner: 'opponent', count: 1 }, attackingOnly: true } as NegateAttackAction;
  }
  if (t.match(/このターン.*次にあなたが(?:シグニ|ルリグ|[^から]*)?(?:から|によって|で)?ダメージを受ける場合.*代わりにダメージを受けない/) ||
      t.match(/このターン.*あなたは.*(?:シグニ|ルリグ|対戦相手の効果)によってダメージを受けない/) ||
      t.match(/このターン、あなたは対戦相手の効果によってダメージを受けない/)) {
    // 「シグニ/ルリグによって」のダメージ源限定を damageSource に保持（逆翻訳の原文一致用。
    // engine は現状ダメージ源を区別しない文書化済み近似＝型コメント参照。§5c 続き25・27枚）
    const srcM = t.match(/次にあなたが(シグニ|ルリグ)によってダメージを受ける場合/);
    return { type: 'PREVENT_NEXT_DAMAGE', count: 1, ...(srcM ? { damageSource: srcM[1] === 'ルリグ' ? 'lrig' : 'signi' } : {}) } as PreventNextDamageAction;
  }

  // ---- 代わりに＋Nする（前の効果に続く）----
  if (t.match(/^代わりに[＋+][０-９\d]+する$/)) {
    return { type: 'STUB', id: 'ALTERNATIVE_POWER_UP' } as StubAction;
  }

  // ---- 対戦相手シグニをレベル合計制限でエナに置く ----
  // 🆕§5.3 `O-60` 第40バッチ（2026-09-03）＝**typed `SEND_TO_ENERGY` を出す**（STUB は撤去）。
  // 🔴旧 `STUB{ENERGY_BY_LEVEL_SUM_LIMIT}` は engine が**カード全文**に `/レベルの合計が(\d*)を超え/` を
  //   当てて「**自分のエナ**のレベル合計が上限を超えたぶんを末尾からトラッシュ」する**まったく別の効果**だった。
  // ⚠上限そのものは後段の「レベルの合計がN以下になるように」句が `totalLevelMax` として載せる
  //   （静的な数のときだけ。動的しきい値は `selectionConstraint.totalLevelMaxRef` ＝ manual 側で書く）。
  if (t.match(/対戦相手のシグニを.*レベルの合計が.*以下になるように.*対象.*エナゾーンに置く/)) {
    return {
      type: 'SEND_TO_ENERGY',
      target: { type: 'SIGNI', owner: 'opponent', count: 'ALL', upToCount: true, filter: { cardType: 'シグニ' } },
    } as EffectAction;
  }

  // ---- 《ライズアイコン》を持つシグニのパワーに比例 ----
  // 🆕§5.3 `O-60` 第31バッチ（2026-09-03）＝**typed `POWER_MODIFY_PER_FIELD` へ寄せた**（STUB は撤去）。
  // 🔴旧 `STUB{POWER_BY_RISE_SIGNI_COUNT}` は engine が
  //   ①原文 regex（「ライズシグニ…体につき」＝**実在しない綴り**）で単価を読み
  //   ②数える対象を「**スタックが2枚以上のゾーン**」で近似（《ライズアイコン》の有無を見ていない）
  //   ③修正先を**対戦相手のシグニ**に積んでいた（原文は「**この**シグニのパワーは」＝真逆）。
  // 🔑`hasRiseIcon` は `matchesFilter` に実装済み・`POWER_MODIFY_PER_FIELD` は live 多数で稼働中。
  const risePowerM = t.match(/このシグニのパワーは(あなた|対戦相手)の場にある《ライズアイコン》を持つシグニ([０-９\d]+)体につき([＋－])([０-９\d]+)される/);
  if (risePowerM) {
    const signR = risePowerM[3] === '＋' ? 1 : -1;
    return {
      type: 'POWER_MODIFY_PER_FIELD',
      target: { type: 'SIGNI', owner: 'self', count: 1 },
      deltaPerUnit: signR * parseNum(risePowerM[4]),
      countFilter: { cardType: 'シグニ', hasRiseIcon: true },
      countOwner: (risePowerM[1] === 'あなた' ? 'self' : 'opponent') as Owner,
      duration: 'PERMANENT',
    } as PowerModifyPerFieldAction;
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
  // 🆕**§5.3 `O-65`＝「あなたのアタックフェイズの間、」の前置きを任意にした。**
  // この前置きは **`parseActiveCondition` のパターン1b が先に剥がして `activeCondition:DURING_ATTACK_PHASE`
  // にしている**ので、ここへ来る時点では**既に消えている**。必須にしていたため action が `UNKNOWN` へ落ち、
  // 「fresh は activeCondition を持つが action を失う」＝**held で永久に温存**され live は
  // **フェイズ限定なしの STUB のまま＝常時適用（過剰実行）**だった（実測2効果＝`WXK07-031-E1`／`WXK08-048-E1`）。
  // ⚠**フェイズ限定は activeCondition が担う**＝ここでは見ない（STUB の id 名に `ATTACK_PHASE` が
  //   残っているのは歴史的経緯で、`censusStubs`／`STUBS.md` の採番を動かさないため改名していない）。
  if (t.match(/(?:あなたのアタックフェイズの間.*)?対戦相手の効果はバニッシュ以外でお?あなたの.*シグニを場から移動させない/)) {
    // 🆕§5.3 `O-66`③：保護対象を payload で運ぶ（旧実装は engine が `EffectText` を regex で読み、
    //   外れたときは**発生源自身の CardClass** へフォールバックしていた＝原文と無関係な範囲になり得た）。
    const moveClassM = t.match(/あなたの(?:すべての)?＜([^＞]+)＞のシグニを場から移動させない/);
    return {
      type: 'STUB', id: 'PREVENT_SIGNI_MOVE_BY_OPP_EXCEPT_BANISH',
      ...(moveClassM ? { moveProtectFilter: { cardType: 'シグニ', story: moveClassM[1] } } : {}),
    } as StubAction;
  }

  // ---- アタックフェイズ間、対戦相手の効果で場から移動させない ----
  if (t.match(/(?:あなたのアタックフェイズの間.*)?対戦相手の効果はバニッシュ以外でお?.*シグニを場から移動させない/)) {
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
  // 🆕`O-65`：上と同じ理由で前置きを任意にした（フェイズ限定は `activeCondition` が担う）。
  if (t.match(/(?:あなたのアタックフェイズの間.*)?このシグニはこのカードの下.*シグニの【自】能力を得る/)) {
    return {
      type: 'STUB', id: 'GRANT_UNDER_SIGNI_AUTO_ABILITY_ATTACK_PHASE',
      underAbilityGrant: { kinds: ['AUTO'], ...underGrantFilterOf(t) },
    } as StubAction;
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
        // 「《X》以外の＜種族＞のシグニN枚」＝除外名＋種族＋枚数（cardName 誤合成の是正・WX05-023-E3 原子3枚）。
        // 「以外の」が無ければ従来どおり《X》を include 名として扱う。
        if (t.includes('以外の')) {
          const cntM = t.match(/シグニ([０-９\d]+)枚/);
          return {
            type: 'PLACE_UNDER_SIGNI', source: 'trash',
            count: cntM ? parseNum(cntM[1]) : 1, upToCount: false,
            filter: { cardType: 'シグニ', excludeCardName: nameMatches[0], ...parseStoryFilter(t) },
          } as PlaceUnderSigniAction;
        }
        return { type: 'PLACE_UNDER_SIGNI', source: 'trash', count: 1, filter: { cardName: nameMatches[0] } } as PlaceUnderSigniAction;
      }
      // 複数名：「か」ならどれか1枚、「と」なら全部
      // ⚠**名前を filter へ運ぶ**（§5.3 O-45）＝旧実装は `cardType:'シグニ'` だけで、
      //   「《A》か《B》１枚」がトラッシュのどのシグニでも下に置ける過剰実行になっていた
      //   （`WXDi-P11-050-E2`／`WXK09-060-E3`）。
      // 「と」＝**それぞれ1枚ずつ**なので groups で配分する（同名2枚を選べてしまうのを防ぐ）。
      const isOr = /》か《/.test(t);
      const count = isOr ? 1 : nameMatches.length;
      return {
        type: 'PLACE_UNDER_SIGNI', source: 'trash', count, upToCount: false,
        filter: { cardNames: nameMatches },
        ...(isOr ? {} : { selectionConstraint: { groups: nameMatches.map(nm => ({ filter: { cardName: nm }, count: 1 })) } }),
      } as PlaceUnderSigniAction;
    }
  }

  // ---- 対戦相手のシグニをデッキの上から3番目に置く ----
  // 🆕§5.3 `O-60` 第36バッチ（2026-09-03）＝**位置を payload で運ぶ**（漢数字も読む）。
  //   旧実装は engine が `/デッキの上から([０-９\d]+)番目/` を当てていたが、原文は「**三**番目」＝
  //   **漢数字**なので当たらず `nth` が **0（一番上）** に落ちていた。
  const KANJI_NTH: Record<string, number> = { 一: 1, 二: 2, ニ: 2, 三: 3, 四: 4, 五: 5 };
  const deckNthM = t.match(/対戦相手のシグニ.*をデッキの上から([０-９\d]+|[一二ニ三四五])番目に置く/);
  if (deckNthM) {
    const pos = KANJI_NTH[deckNthM[1]] ?? parseNum(deckNthM[1]);
    return { type: 'STUB', id: 'OPP_SIGNI_TO_DECK_NTH', oppSigniToDeckNth: { position: pos } } as StubAction;
  }
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
  // 🆕§5.3 `O-60` 第34バッチ（2026-09-03）＝**対象ゾーンを payload で運ぶ**。
  //   旧実装は engine が「カード名一致のエナ限定トラッシュ」へ先に分岐しようとし、外れると
  //   「場＋手札」だけの fallback へ落ちていた＝原文にある**エナゾーンが丸ごと落ちる**過少実行。
  if (t.match(/対戦相手のすべてのシグニと.*手札と.*エナゾーン.*トラッシュに置く/)) {
    return {
      type: 'STUB', id: 'TRASH_ALL_OPP_CARDS',
      trashAllOppZones: ['field', 'hand', 'energy'],
    } as StubAction;
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
  // 🆕**枚数を payload で刻む**（§5.3 `O-60` 第54バッチ・2026-09-03）。
  // 🔴engine 側のコイン regex は `コインN枚を得る` で、**原文の綴り《コインアイコン》を得 に
  //   1本も当たっていなかった**（既定 1 でたまたま合っていただけ）。
  if (t.match(/《コインアイコン》を得.*手札を.*捨てる/)) {
    const coinN = (t.match(/《コインアイコン》/g) ?? []).length || 1;
    const discM = t.match(/手札を([０-９\d]*)枚?(?:捨て|トラッシュ)/);
    return {
      type: 'STUB', id: 'GAIN_COIN_AND_DISCARD',
      coinAndDiscard: { coin: coinN, discard: discM && discM[1] ? parseNum(discM[1]) : 1 },
    } as StubAction;
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
  // 🆕§5.3 `O-60` 第19バッチ（2026-09-03）＝減少量を payload（符号つき）で運ぶ。
  const oppHandLimitM = t.match(/対戦相手の手札の上限は([０-９\d]+)減る/);
  if (oppHandLimitM) {
    return { type: 'STUB', id: 'REDUCE_OPP_HAND_LIMIT', handLimitDelta: -parseNum(oppHandLimitM[1]) } as StubAction;
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

  // ---- 手札からカードをシグニの下に置く（§5.3 `O-60` 第16バッチで typed 化）----
  // 🔴旧 `STUB{HAND_CARDS_UNDER_SIGNI}` は engine が実行時に `card.EffectText` から枚数・任意・
  //   レベル・置き元の**4軸**を regex で読んでいた＝効果元が引けない経路で全部既定値へ崩れる。
  if (t.match(/あなたの手札からカードを.*枚.*このシグニの下に置く/)) {
    const puHand = parsePlaceUnderSourceSigni(t);
    if (puHand) return puHand as EffectAction;
  }

  // ---- カードが【アクセ】としてシグニに付いたとき選択効果 ----
  if (t.match(/このカードが【アクセ】としてシグニに付いたとき.*以下の.*から.*選ぶ/)) {
    return { type: 'STUB', id: 'ACCE_PLAY_CHOOSE' } as StubAction;
  }

  // 🗑**「サーバントを含むシグニ数でスペルコスト軽減」の全文 STUB は撤去した**（2026-08-27・Sheet1 B11）。
  //   `SPELL_COST_REDUCTION_BY_SERVANT_COUNT` は **engine のどこにも消費地点が無い無言 no-op** で、
  //   しかも**文全体**（コスト軽減＋「以下の２つから１つを選ぶ」の本体）を飲み込んでいた＝
  //   採用されると `WX10-053` は**何もしないカード**になる（live は古い構造を温存していたので露呈していなかった）。
  //   ⇒ 撤去して文単位の構造（`SEQUENCE[COST_REDUCTION, CHOOSE]`）へ戻す。
  //   ⚠**コスト軽減の「1体につき」＝枚数参照は表現できていない**（`CostReductionAction` に per-count が無い）＝
  //     §5.3 へ登録して据置。ここで撤去しても**その欠落は増えも減りもしない**（旧 STUB も no-op だった）。
  //   ■原文該当は全 CSV でこの1枚。

  // ---- 武勇シグニを捨ててもよい（手札から）----
  // 🆕§5.3 `O-60` 第51バッチ（2026-09-03）＝**絞り込みと上限枚数は payload で運ぶ**。
  //   🔴旧実装は engine がカード全文へ `/シグニを?([０-９\d]+)枚まで/` を当てており、
  //   `PR-328` は**この上限がそのまま後段 CHOOSE の選択数**（`countChoose`）になるので、
  //   別の能力の数字を拾うと**選べる効果の数まで化ける**形だった。
  const odcsM = t.match(/手札から(?:あなたの)?(?:＜([^＞]+)＞の)?シグニを?([０-９\d]+)枚まで捨ててもよい/);
  if (odcsM) {
    return {
      type: 'STUB', id: 'OPTIONAL_DISCARD_CLASS_SIGNI',
      handCardPick: {
        filter: { cardType: 'シグニ', ...(odcsM[1] ? { story: odcsM[1] } : {}) },
        count: parseNum(odcsM[2]), upTo: true,
      },
    } as StubAction;
  }
  if (t.match(/手札から.*シグニを.*枚まで捨ててもよい/)) {
    return { type: 'STUB', id: 'OPTIONAL_DISCARD_CLASS_SIGNI' } as StubAction;
  }

  // ---- 英知シグニの【自】能力を発動させる ----
  if (t.match(/あなたの他のシグニ.*【自】の【英知】能力.*発動させる/)) {
    return { type: 'STUB', id: 'TRIGGER_OTHER_SIGNI_EICHI_ABILITY' } as StubAction;
  }

  // ---- ルリグアタックでダメージ受けない（対戦相手レベル以下）----
  // ⚠🔴レベル上限を `value` に載せる（§6.4 O-3 続き492）＝従来は落としており、判定側が
  //   限定を読めないので「**すべての**ルリグによってダメージを受けない」の過剰効果になりうる。
  //   判定は `isLrigDamagePrevented`（アタックしてきたルリグのレベルと突き合わせる）。
  {
    const lowLvM = t.match(/あなたは対戦相手のレベル([０-９\d]+)以下のルリグによってダメージを受けない/);
    if (lowLvM) return { type: 'STUB', id: 'PREVENT_LOW_LEVEL_LRIG_DAMAGE', value: parseNum(lowLvM[1]) } as StubAction;
  }

  // ---- 日付制限（このカードは場に出せない）----
  if (t.match(/[０-９\d年月日以降]+、このシグニは場に出せない/)) {
    return { type: 'STUB', id: 'DATE_RESTRICTION_CANT_PLAY' } as StubAction;
  }

  // ---- それがルリグでない場合ルリグトラッシュへ ----
  // 🔴**唯一の利用者は `PR-469`③**（全CSV実測）で、その1文前が「対戦相手のルリグデッキからカードを１枚
  //   見ないで選び公開する」＝**相手のゾーン**を触る。旧 `NON_LRIG_TO_LRIG_TRASH` は `ctx.ownerState` 固定で
  //   除去元が見つからなくても**無条件に自分のルリグトラッシュへ積む**ので、そのまま後段に置くと
  //   **相手のカードが自分のルリグトラッシュに複製される**（§6.4 O-11・続き533 で実測）。
  //   公開と種別判定と行き先は `OPP_LRIG_DECK_BLIND_REVEAL` が1つで済ませるので、ここは注記に畳む。
  if (t.match(/それがルリグでない場合.*ルリグトラッシュに置く/)) {
    return { type: 'STUB', id: 'RULE_REMINDER_TEXT' } as StubAction;
  }

  // ---- このゲームすべてのセンタールリグが特定タイプを追加で得る ----
  const aclgM = t.match(/このゲームの間[^。]*すべての場にあるセンタールリグは＜([^＞]+)＞を追加で得る/);
  if (aclgM) {
    // 🆕§5.3 `O-60` 第53バッチ（2026-09-03）＝ルリグタイプは payload。
    return { type: 'STUB', id: 'ALL_CENTER_LRIG_GAIN_TYPE_GAME_WIDE', gainedLrigType: aclgM[1] } as StubAction;
  }
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
  // 🆕§5.3 `O-60` 第18バッチ（2026-09-03）＝**得るクラス／全体か／色の限定を payload で運ぶ**。
  //   旧実装は engine が**カード全文**（`EffectText + BurstText`）に4本の regex を当てており、
  //   別の能力の＜＞や色表記を拾いうる形だった。ここは**この文だけ**を読むので取り違えない。
  if (t.match(/(?:シグニ|それ).*クラスを失い.*を得る/)) {
    const ccNewClassM = t.match(/クラスを失い、?(?:.*?)＜([^＞]+)＞を得る/);
    const ccFromDeclared = /クラスを失い、?(?:.*?)宣言されたクラスを得る/.test(t);
    // 「あなたの／対戦相手の **すべての**〈色〉のシグニは」＝対象選択をしない全体適用。
    // ⚠**「すべての」より前に置かれた所有者**だけを読む（文末の別句に引っ張られない）。
    const ccAllM = t.match(/(あなた|対戦相手)の(?:他の)?すべての([^。]*?)シグニ(?:は|が)/);
    const ccColors = ccAllM ? (ccAllM[2].match(/[赤青緑白黒](?=[とかや、]|の)/g) ?? []) : [];
    const ccAll = ccAllM
      ? { owner: (ccAllM[1] === 'あなた' ? 'self' : 'opponent') as Owner, ...(ccColors.length ? { colors: ccColors } : {}) }
      : undefined;
    if (!ccNewClassM && !ccFromDeclared) return { type: 'STUB', id: 'CLASS_CHANGE' } as StubAction;
    return {
      type: 'STUB', id: 'CLASS_CHANGE',
      classChange: {
        ...(ccFromDeclared ? { fromDeclared: true } : { newClass: ccNewClassM![1] }),
        ...(ccAll ? { all: ccAll } : {}),
      },
    } as StubAction;
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

  // 「あなたのセンタールリグが<色>であるかぎり、このシグニは「…」を得る」（旧 CONDITIONAL_KEYWORD_BY_CENTER_COLOR STUB）は
  // effectParser.ts の parseCenterColorFrontPowerGrant が条件抽出ループ前に構造化パースする（SP27-002-E3）。

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
  // 🆕**条件は `CONDITIONAL{LRIG_STORY}` へ出す**（§5.3 `O-60` 第54バッチ・2026-09-03）＝
  //   engine が `EffectText + BurstText`（カード全文）へ `/あなたのセンタールリグが＜X＞の場合/` を
  //   当てて判定していた分を剥がす。**受け皿は既存の条件型**（新設なし）。
  if (t.match(/センタールリグが.*の場合.*トラッシュからエナゾーンに置く/)) {
    const cttes: StubAction = { type: 'STUB', id: 'CONDITIONAL_TRASH_TO_ENERGY' };
    const ctteM = t.match(/あなたのセンタールリグが＜([^＞]+)＞の場合/);
    if (ctteM) {
      return {
        type: 'CONDITIONAL',
        condition: { type: 'LRIG_STORY', owner: 'self', story: ctteM[1] },
        then: cttes as EffectAction,
      } as ConditionalAction;
    }
    return cttes;
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
    // 🆕§5.3 `O-60` 第52バッチ（2026-09-03）＝コスト上限と枚数は payload。
    // ⚠**`costMax` は原文に書いてあるときだけ載せる**＝`WXDi-P16-050` は無条件（旧既定 99 と同義だが、
    //   「読めなかった」と「原文に無い」を JSON 上で区別できる）。
    const vdsCostM = t.match(/コストの合計が([０-９\d]+)以下のスペル/);
    const vdsCntM = t.match(/スペル([０-９\d]+)枚/);
    return {
      type: 'STUB', id: 'VIEW_AND_DISCARD_SPELL',
      viewDiscardSpell: {
        ...(vdsCostM ? { costMax: parseNum(vdsCostM[1]) } : {}),
        count: vdsCntM ? parseNum(vdsCntM[1]) : 1,
      },
    } as StubAction;
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
  // 「対戦相手のシグニ**１体**のパワーが減ったとき」（WX25-P3-062）も同型＝体数表記を許す。
  // これが無いと下流（parseSentencePart4）の全文規則が **POWER_COPY_FROM_DOWNED**（＝「**ダウンした**シグニの
  // パワーを加算」＝意味の違う別実装）へ誤ルーティングする。
  if (t.match(/対戦相手のシグニ(?:[０-９\d]+体)?のパワーが減ったとき.*このシグニのパワーを減った値/)) {
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

  // ---- 相手エナ増加トリガー後の条件付きトラッシュ（timing 句は effectParser 側で除去済み）----
  // 「そこから対象のカード」＝任意選択、「そのカード」＝置かれたカード自身（isTriggerSource）を区別する。
  {
    const oppEnergyAnyM = t.match(/^そこに([０-９\d]+)枚以上のカードがある場合、あなたはそこから対象のカード[０-９\d]+枚をトラッシュに置く$/);
    if (oppEnergyAnyM) {
      return {
        type: 'CONDITIONAL',
        condition: { type: 'ENERGY_COUNT', owner: 'opponent', operator: 'gte', value: parseNum(oppEnergyAnyM[1]) },
        then: { type: 'TRASH', target: { type: 'ENERGY_CARD', owner: 'opponent', count: 1 } },
      };
    }
    const oppEnergyThatM = t.match(/^対戦相手のエナゾーンにカードが([０-９\d]+)枚以上あり、このターンにこの能力でカードをトラッシュに置いていない場合、そのカードをトラッシュに置く$/);
    if (oppEnergyThatM) {
      return {
        type: 'CONDITIONAL',
        condition: { type: 'ENERGY_COUNT', owner: 'opponent', operator: 'gte', value: parseNum(oppEnergyThatM[1]) },
        then: { type: 'TRASH', target: { type: 'ENERGY_CARD', owner: 'opponent', count: 1, filter: { isTriggerSource: true } } },
      };
    }
  }

  // ---- 対戦相手の効果によってダメージを受けず/ライフクロスは移動しない ----
  if (t.match(/対戦相手の効果によって.*ダメージを受けず/)) {
    return { type: 'STUB', id: 'PREVENT_DAMAGE_AND_LIFE_MOVE_BY_OPP' } as StubAction;
  }

  // ---- 対戦相手の効果によって〈ゾーン〉のカードは（他の領域／トラッシュ／デッキへ）移動しない ----
  // 🔑**期間つき（アーツ/【出】）と【常】を分ける**（§6.4 O-3 続き493）＝
  //   期間つきは `ZONE_MOVE_IMMUNITY`（ターン数カウントダウン）／【常】は宣言型 STUB のまま。
  //   ⚠🔴旧実装は両方を同じ STUB に落としており、期間つき側は `prevent_opp_trash_from` を立てるだけで
  //     **失効地点が1つも無く永続していた**（`WXK10-083-E1` は「このターンと次のターンの間」）。
  // ⚠保護できるのは現状 hand / energy だけ（既存 `PREVENT_NON_FIELD_MOVE_BY_OPP` と同じ近似）＝
  //   「場以外のあなたの領域」も hand+energy に丸める。デッキ／トラッシュ／ライフは未保護。
  {
    const movesJa = /(?:他の領域|トラッシュ|デッキとトラッシュ)に移動しない/;
    if (/対戦相手の効果(?:によって|は)/.test(t) && movesJa.test(t)
        && !/この(?:シグニ|カード|アーツ)/.test(t) && !/ライフクロス/.test(t)) {
      const zones: ('hand' | 'energy')[] = [];
      if (/場以外の(?:あなたの)?領域/.test(t)) { zones.push('hand', 'energy'); }
      else {
        if (/エナゾーン/.test(t)) zones.push('energy');
        if (/手札/.test(t)) zones.push('hand');
      }
      if (zones.length > 0) {
        // 「このターンと次のターンの間」「次の対戦相手のターン（終了時まで）」＝2ターン。
        const turns = /このターンと次のターンの間|次の対戦相手のターン/.test(t) ? 2
          : /このターン/.test(t) ? 1 : 0;
        if (turns > 0) {
          const immunity = { type: 'ZONE_MOVE_IMMUNITY', owner: 'self', zones, turns } as ZoneMoveImmunityAction;
          // ⚠🔴同じ文に「あなたは対戦相手のルリグによってダメージを受けず、」が並ぶ形
          //   （`WXEX2-06-E3`／`WXDi-P16-002-E1`）＝**片方だけ拾うと残りが無言で落ちる**。
          //   ダメージ側は続き492 で整えた期間軸（`PREVENT_DAMAGE{scope:'LRIG'}`）へ載せる。
          if (/あなたは対戦相手の(?:レベル[０-９\d]+以下の)?ルリグによってダメージを受けず/.test(t)) {
            return {
              type: 'SEQUENCE',
              steps: [
                { type: 'PREVENT_DAMAGE', owner: 'self', until: turns >= 2 ? 'NEXT_TURN' : 'UNTIL_END_OF_TURN', scope: 'LRIG' } as PreventDamageAction,
                immunity,
              ],
            } as SequenceAction;
          }
          return immunity;
        }
        // 期間の指定が無い＝【常】（場にあるかぎり）＝宣言型のまま。
        return { type: 'STUB', id: 'PREVENT_ZONE_MOVE_BY_OPP' } as StubAction;
      }
    }
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
  // 🆕**取り除ける上限を payload で刻む**（§5.3 `O-60` 第54バッチ・2026-09-03）＝
  //   `REMOVE_VIRUS` と同じ `virusCount`（`'any'`＝原文「好きな数」）を共有する。
  if (t.match(/使用コストとして追加で.*【ウィルス】を.*取り除いてもよい/)) {
    const ecrv: StubAction = { type: 'STUB', id: 'EXTRA_COST_REMOVE_VIRUS' };
    const ecrvM = t.match(/【ウィルス】を([０-９\d]+)つまで取り除/);
    if (ecrvM) ecrv.virusCount = parseNum(ecrvM[1]);
    else if (/【ウィルス】を好きな数取り除/.test(t)) ecrv.virusCount = 'any';
    return ecrv;
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
  const dsloM = t.match(/あなたのデッキにある＜([^＞]+)＞のシグニのレベルを参照する場合[^。]*レベル([０-９\d]+)として扱ってもよい/);
  if (dsloM) {
    // 🆕§5.3 `O-60` 第53バッチ（2026-09-03）＝クラスとレベルは payload。
    return {
      type: 'STUB', id: 'DECK_SIGNI_LEVEL_OVERRIDE',
      deckSigniLevelOverride: { story: dsloM[1], level: parseNum(dsloM[2]) },
    } as StubAction;
  }
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
    // ⚠名詞句修飾は原文でこの順に並ぶ＝「共通する色を持たない」→「レベルN以下の」→「＜クラス＞の」。
    //   旧実装は **①レベル句を消費するだけで捨て** **②`m[1] ?? m[2]` でクラスを取りこぼす**（m[1] が
    //   「共通する色を持たない」だとクラスが落ちる）ため、`WX21-024-E1`「共通する色を持たない
    //   レベル４以下の＜天使＞のシグニを２枚まで」が `{cardType:'シグニ'}` に潰れて
    //   **トラッシュのどのシグニでも下に置ける過剰実行**になっていた（§5.3 O-45）。
    //   相互差異（「共通する色を持たない」＝`selectionConstraint.sharedColor`）は別経路で配線済み。
    const m = t.match(/あなたのトラッシュから(＜[^＞]+＞の|共通する色を持たない)?((?:レベル[０-９\d＋]+(?:以下|以上)?の)?)([＜〈<][^＞〉>]+[＞〉>]の)?(シグニ|カード)を?([０-９\d]+)枚?(まで)?(?:を)?対象とし.*このシグニの下に置く/);
    if (m) {
      const cnt = parseNum(m[5]);
      const storyFilter = parseStoryFilter(`${m[1] ?? ''}${m[3] ?? ''}`);
      const levelFilter = m[2] ? parseLevelFilter(m[2]) : {};
      return {
        type: 'PLACE_UNDER_SIGNI',
        source: 'trash',
        count: cnt,
        upToCount: !!m[6],
        // 原文の名詞が「カード」なら**シグニに限定しない**（スペル等も下に置ける）。
        filter: { ...(m[4] === 'シグニ' ? { cardType: 'シグニ' } : {}), ...storyFilter, ...levelFilter },
      } as PlaceUnderSigniAction;
    }
    // フォールバック：トラッシュから置く
    if (t.match(/あなたのトラッシュから.*シグニ.*枚.*このシグニの下に置く/)) {
      return { type: 'PLACE_UNDER_SIGNI', source: 'trash', count: 1, filter: { cardType: 'シグニ' } } as PlaceUnderSigniAction;
    }
  }

  // ---- 下にあるシグニの【常】能力を得る ----
  if (t.match(/このシグニはこのカードの下にあるシグニの【常】.*能力を得る/)) {
    return {
      type: 'STUB', id: 'GRANT_UNDER_SIGNI_CONSTANT_ABILITY',
      underAbilityGrant: {
        kinds: ['CONTINUOUS'],
        ...underGrantFilterOf(t),
        ...(/【英知】/.test(t) ? { eichiOnly: true } : {}),
      },
    } as StubAction;
  }

  // ---- 基本レベルを変更 ----
  if (t.match(/このシグニの基本レベルを.*にしてもよい/)) {
    return { type: 'STUB', id: 'CHANGE_BASE_LEVEL' } as StubAction;
  }

  // ---- 【トラップ】を手札に加える ----
  // §5.3 `O-60` 第7バッチ＝**枚数を `trapToHand` に刻む**（engine のカード全文 regex を撤去）。
  // 🔴**助数詞は「つ」**（engine の旧 regex は「枚」しか見ておらず、live 5効果すべてが既定の
  //   「場の【トラップ】を全部」へ落ちていた＝「１つを対象とし」が3つ全部の回収に化けていた）。
  if (t.match(/あなたの【トラップ】.*手札に加える/)) {
    const upToM = t.match(/【トラップ】(?:を)?([０-９\d]+)[つ枚]まで/);
    const anyM = /【トラップ】(?:と[^を]*)?を?好きな数/.test(t);
    const exactM = t.match(/【トラップ】([０-９\d]+)[つ枚]を/);
    // 🆕§5.3 `O-87`＝「**好きな数**」は `upTo` を立てる＝**0枚も選べるプレイヤーの選択**。
    //   ⚠旧実装は `{count:'ALL'}` だけを刻み、engine が**問答無用で全部回収**していた（過剰実行）。
    // 🆕同じ文で「【トラップ】**と＜X＞のシグニ**を」と書かれていたら、そのシグニも同じ選択プールに混ぜる
    //   （`WX16-017`＝場から手札へ戻すのは【トラップ】だけではない）。
    const alsoStoryM = t.match(/【トラップ】と＜([^＞]+)＞のシグニ/);
    const spec = upToM ? { count: parseNum(upToM[1]), upTo: true }
      : anyM ? { count: 'ALL' as const, upTo: true }
        : exactM ? { count: parseNum(exactM[1]) } : null;
    return {
      type: 'STUB', id: 'TRAP_TO_HAND',
      ...(spec ? { trapToHand: { ...spec, ...(alsoStoryM ? { alsoSigniFilter: { cardType: 'シグニ' as const, cardClass: alsoStoryM[1] } } : {}) } } : {}),
    } as StubAction;
  }

  // ---- 手札からスペルを使用する ----
  if (t.match(/あなたの手札から.*スペル.*コストを支払って使用する/)) {
    return { type: 'STUB', id: 'PLAY_SPELL_FROM_HAND' } as StubAction;
  }

  // ---- 対戦相手の場に【ウィルス】がない場合このシグニをトラッシュ ----
  if (t.match(/対戦相手の場に【ウィルス】がない場合.*このシグニを.*トラッシュに置く/)) {
    return { type: 'STUB', id: 'SELF_TRASH_IF_NO_OPP_VIRUS' } as StubAction;
  }

  // ---- 対戦相手の場に【チャーム】がない場合このシグニをトラッシュ ----
  if (t.match(/対戦相手の場に【チャーム】がない場合.*このシグニを.*トラッシュに置く/)) {
    return { type: 'STUB', id: 'SELF_TRASH_IF_NO_OPP_CHARM' } as StubAction;
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
    return {
      type: 'STUB', id: 'GRANT_UNDER_SIGNI_ALL_ABILITIES',
      underAbilityGrant: {
        kinds: ['CONTINUOUS', 'AUTO', 'ACTIVATED'],
        ...underGrantFilterOf(t),
        ...(/限定条件/.test(t) ? { grantRestriction: true } : {}),
      },
    } as StubAction;
  }

  // ---- 英知能力が有効になる ----
  if (t.match(/【英知】能力.*有効になる/)) {
    return { type: 'STUB', id: 'ACTIVATE_EICHI_ABILITY' } as StubAction;
  }

  // ---- 【英知】条件でだけレベルを読み替える（位相限定の有無は収集時に原文から読む）----
  // 「アタックフェイズの間、…レベルは１～９であるとして扱う」（WX21-029/WXEX2-47）に加え、
  // **位相限定なしの**「【英知】能力の条件が…レベルは１であり２であり３であるとして扱う」（WX20-044-CB）も拾う。
  // 後者は従来 RULE_REMINDER_TEXT に落ちて**能力が丸ごと未実装**だった。
  // ⚠「あなたの能力か効果１つによって…いずれかのレベル１つとして扱ってもよい」（LEVEL_REFERENCE_OVERRIDE）
  //   とは別物なので、【英知】能力の条件 か アタックフェイズの間 を必須アンカーにする。
  if (t.match(/アタックフェイズの間.*レベルを参照する場合.*レベルは.*として扱う/)
      || t.match(/【英知】能力の条件が.*レベルを参照する場合.*レベルは.*として扱う/)) {
    return { type: 'STUB', id: 'ATTACK_PHASE_LEVEL_OVERRIDE' } as StubAction;
  }

  // ---- これにアクセされている（＜クラス＞/《名前》/無限定）シグニのパワーを＋Nする ----
  //   ⚠ここにあった3本の規則は**到達不能な死んだ規則**だった（`parseSentencePart1` の汎用 POWER_MODIFY
  //   ブロックが `パワーを＋N` を常に先に食うため）。実装は Part1 の `acceHostM` 分岐（`aboveSelf` の隣）へ
  //   移した＝そこが唯一の入口。全CSVの該当10枚がこの二重定義のせいで filter 脱落していた（続き377k）。
  //   加算の実体は effectEngine の `signi_acce` ループ（＜クラス＞/《名前》限定はホスト側を matchesFilter で判定）。

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
  const oeetM = t.match(/対戦相手のエナゾーンにカードが([０-９\d]+)枚以上ある場合[^。]*トラッシュに置く/);
  if (oeetM) {
    // 🆕§5.3 `O-60` 第52バッチ（2026-09-03）＝しきい値は payload。
    return { type: 'STUB', id: 'OPP_ENERGY_EXCESS_TRASH', oppEnergyThreshold: parseNum(oeetM[1]) } as StubAction;
  }

  // ---- 次のターンまで引ける枚数制限 ----
  const lodc2M = t.match(/次のターンの間[^。]*対戦相手はカードを合計([０-９\d]+)枚までしか引けない/);
  if (lodc2M) {
    // 🆕§5.3 `O-60` 第52バッチ（2026-09-03）＝上限は payload。
    return { type: 'STUB', id: 'LIMIT_OPP_DRAW_COUNT', drawLimit: parseNum(lodc2M[1]) } as StubAction;
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
  const cesblM = t.match(/あなたの＜([^＞]+)＞のシグニ[^。]*基本レベルを[^。]*にする/);
  if (cesblM) {
    // 🆕§5.3 `O-60` 第53バッチ（2026-09-03）＝対象の絞り込みは**既存の汎用 payload `selectTarget`**。
    // 🔴旧 engine は**カード全文**の最初の `＜X＞のシグニ` を拾っており、`WXEX1-71` は【常】にも
    //   「あなたの＜英知＞のシグニ」があるので**別の能力の＜＞を掴みうる**形だった（既定も `'英知'` の焼き込み）。
    return {
      type: 'STUB', id: 'CHANGE_EICHI_SIGNI_BASE_LEVEL',
      selectTarget: { type: 'SIGNI', owner: 'self', count: 1, filter: { cardType: 'シグニ', story: cesblM[1] } },
    } as StubAction;
  }
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
  // 🆕§5.3 `O-60` 第33バッチ（2026-09-03）＝**上限値を payload で運ぶ**（engine は原文を読まない）。
  const powerCapM = t.match(/このシグニのパワーは([０-９\d]+)より大きくならない/);
  if (powerCapM) {
    return { type: 'STUB', id: 'POWER_CAP', powerCap: { max: parseNum(powerCapM[1]) } } as StubAction;
  }

  // ---- 対戦相手のシグニのパワーが－される場合、代わりに２倍 ----
  // §5.3 `O-60` 第5バッチ＝**寿命を `doublePowerMinus` に刻む**（engine のカード全文 regex を撤去）。
  // 🔴「**このターン、**〜」は実行時にフラグを立てる**アクション**、それ以外は【常】の宣言で、
  //   engine 側の経路がまったく別（前者は `double_power_minus_this_turn`、後者は場の走査）。
  //   旧実装はこの区別を持たず、**7効果すべてが無言 no-op** だった。
  if (t.match(/対戦相手のシグニのパワーが－.*される場合.*代わりに２倍/)) {
    return { type: 'STUB', id: 'DOUBLE_POWER_MINUS', doublePowerMinus: {
      duration: /このターン/.test(t) ? 'this_turn' : 'continuous',
      ...(/あなたの(?:.*の)?シグニの効果/.test(t) ? { sourceSigniOnly: true } : {}),
    } } as StubAction;
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

  // 「あなたの他の（＜X＞の）シグニN体を対象とし」＝効果元自身を除外（WXDi-P11-040＝他に味方が居ないと
  // 自分自身に付与されてしまう実機バグ・続き75で excludeSelf を engine 実装＋ここで付与）。対象節に隣接する
  // 「他の」だけを見る（「他のシグニをトラッシュして、このシグニが【ランサー】を得る」等の巻き添えを避ける）。
  const kwOtherTarget = /(?:あなた|対戦相手)の他の(?:＜[^＞]+＞の)?シグニ(?:[０-９\d]+体)?(?:まで)?を対象とし/.test(t);
  // 対象節（「…を対象とし」直前の修飾句）だけを切り出し、閾値/状態フィルタを付与対象に乗せる。
  // ⚠**全文スキャンは禁止**（parserUtils の教訓）＝「あなたの**レベル３の**シグニ1体をトラッシュに置く。
  //   対戦相手のシグニ1体を対象とし…」のような別文節の数値を拾って対象を誤って絞ってしまう。
  // 付与系の各規則（【キーワード】/「アタックできない」/引用キーワード/シャドウ）はこれを共有する
  //   ＝従来はどれもフィルタを落として「全シグニが対象」の過剰効果になっていた（続き205）。
  const kwTgtPhraseM = t.match(/(?:あなた|対戦相手)の([^。、]{0,24}?)(?:シグニ|ルリグ)(?:を)?(?:[０-９\d]+体)?(?:まで)?を?対象とし/);
  const kwThrFilter = kwTgtPhraseM
    ? { ...parsePowerFilter(kwTgtPhraseM[1]), ...parseLevelFilter(kwTgtPhraseM[1]), ...parseStateFilter(kwTgtPhraseM[1]), ...parseColorFilter(kwTgtPhraseM[1]) }
    : {};
  const kwPossessionM = kwTgtPhraseM?.[1].match(/【([^】]+)】を持つ/);
  const kwPossessionFilter = kwPossessionM ? { keyword: kwPossessionM[1] } : {};
  // 《ライズ／クロス／アクセアイコン》（続き377c）＝上の `kwTgtPhraseM` は「あなたの」と「シグニ」の**間**しか見ないので、
  //   「**《ライズアイコン》を持つ**あなたのシグニ１体を対象とし」のように**「あなたの」より前**に付く修飾を取りこぼす。
  //   `signiClauseIconFilter` は対象名詞句への隣接だけを見るので条件節（「場に…が２体あるかぎり」）は入らない。
  const kwMergedFilter = { ...(kwOtherTarget ? { excludeSelf: true } : {}), ...kwThrFilter, ...kwPossessionFilter, ...signiClauseIconFilter(t) };
  const kwTargetFilter = Object.keys(kwMergedFilter).length > 0 ? { filter: kwMergedFilter } : {};
  // 「シグニをN体まで対象とし」＝上限指定（0体でもよい）。engine は `upToCount` を見て選択UIを任意化する
  // （落とすと `WXDi-P09-053-E1`「あなたのレベル１のシグニを２体まで対象とし」が**2体を強制選択**になる）。
  // ⚠素の `t.includes('まで')` は「ターン終了時**まで**」に必ず当たるので、**数詞に隣接した「体まで」だけ**を見る。
  const kwUpToCount = /(?:あなた|対戦相手)の(?:(?!あなた|対戦相手|シグニ|ルリグ)[^。、]){0,24}?シグニ(?:を)?[０-９\d]+体まで(?:を)?対象とし/.test(t)
    ? { upToCount: true } : {};

  // ---- 【キーワード】を得る（文脈依存owner/count）----
  {
    const kwBracketM = t.match(/【(ランサー|アサシン|ダブルクラッシュ|トリプルクラッシュ|シャドウ|バニッシュ耐性|シールド|チャーム)】を得る/);
    if (kwBracketM) {
      const kwOwner: Owner = t.includes('対戦相手') && !t.includes('あなた') ? 'opponent'
        : t.includes('あなた') ? 'self' : 'any';
      const kwAll = t.includes('すべてのシグニ') || t.includes('全てのシグニ') || t.includes('シグニすべて');
      const kwCountM = t.match(/シグニ([０-９\d]+)体/);
      const kwCount: number | 'ALL' = kwAll ? 'ALL' : kwCountM ? parseNum(kwCountM[1]) : 1;
      return { type: 'GRANT_KEYWORD', target: { type: 'SIGNI', owner: kwOwner, count: kwCount, ...kwUpToCount, ...kwTargetFilter }, keyword: kwBracketM[1], duration: 'UNTIL_END_OF_TURN' } as GrantKeywordAction;
    }
  }

  // ---- 引用符の内側のテキスト（...」を得る で終わる）----
  if (t.endsWith('」を得る') || t.endsWith('」を得る。')) {
    const quoted = (t.match(/「([^」]+)」を得る/) ?? [])[1] ?? '';
    if (quoted.includes('アタックできない')) {
      // 🆕**§5.3 `O-220` 第4バッチ（2026-09-02）＝対象の指定は「引用を伏せた本文」から読む。**
      // 🔴下の `kwOwnerCA` / `lrigOnlyCA` は `t` を丸ごと見るので、**引用の中の「あなたの」「シグニ」**を
      //   付与先の指定と読み違える（`WX24-P3-049-E1`＝指定は「対戦相手のルリグ」なのに引用内の
      //   「あなたのシグニ」を拾って**自分のシグニ**を止めていた）。
      const outerCA = t.replace(/「[\s\S]*?」/g, '「」');
      const outerBothCA = /ルリグ(?:[０-９\d]+体)?(?:か|または|と)[^。]{0,12}シグニ/.test(outerCA);
      const outerLrigOnlyCA = !outerBothCA && /ルリグ/.test(outerCA) && !/シグニ/.test(outerCA);
      const outerSigniCA = !outerBothCA && /シグニ/.test(outerCA);
      const outerOwnerCA: Owner = /対戦相手/.test(outerCA) ? 'opponent' : /あなた/.test(outerCA) ? 'self' : 'any';
      // 「〈対象〉は「【常】：《無》×Nを支払わない／手札をN枚捨てないかぎりアタックできない。」を得る」
      // ＝**解除コストつきアタック禁止**。受け皿は既存の `SIGNI_ATTACK_BAN`（§6.4 `O-28`／`O-3`）で、
      //   ルリグ／シグニの仕分けは engine が**確定した対象の Type** で行う（`effectExecutor.ts` の
      //   `SIGNI_ATTACK_BAN` ＝`appliesTo:'LRIG'` を別 ban として積む）＝engine 変更なしで通る。
      // 🔴従来はここを素通りして末尾の粗い近似 `BLOCK_ACTION{SIGNI, owner:'any'}` に落ちており、
      //   **解除コストが丸ごと消えたうえ、どちらのシグニでも1体が無条件でアタック不可**になっていた
      //   （`WX24-P2-047-E1` の②枝＝指定は「対戦相手のルリグ」）。
      const quotedTaxM = quoted.trim().match(
        /^【常】：(?:あなたが)?(?:((?:《無》)+)を支払わない|手札を([０-９\d]+)枚捨てない)かぎりアタックできない。?$/);
      if (quotedTaxM && (outerLrigOnlyCA || outerSigniCA || outerBothCA) && outerOwnerCA !== 'any') {
        const taxTargetType = outerBothCA ? 'CENTER_LRIG_OR_SIGNI' : outerLrigOnlyCA ? 'LRIG' : 'SIGNI';
        const taxCountM = outerCA.match(/([０-９\d]+)体/);
        const taxTarget: EffectTarget = {
          type: taxTargetType, owner: outerOwnerCA,
          count: taxCountM ? parseNum(taxCountM[1]) : 1,
          ...(taxTargetType === 'SIGNI' ? kwTargetFilter : {}),
        };
        // 「次の対戦相手のターン終了時まで」＝ターン数カウントダウン（`turns:2`・§6.4 `O-4`）。
        const taxTurns = /次の対戦相手のターン(?:の間|終了時まで)/.test(outerCA) ? 2 : undefined;
        return { type: 'SEQUENCE', steps: [
          { type: 'STUB', id: 'SELECT_TARGET_ONLY', selectTarget: taxTarget } as StubAction,
          { type: 'STUB', id: 'STORE_LAST_PROCESSED_TARGETS' } as StubAction,
          { type: 'SIGNI_ATTACK_BAN', owner: outerOwnerCA, targetsStored: true,
            ...(quotedTaxM[1] ? { unlessPayColorless: (quotedTaxM[1].match(/《無》/g) ?? []).length } : {}),
            ...(quotedTaxM[2] ? { unlessPayHandDiscard: parseNum(quotedTaxM[2]) } : {}),
            ...(taxTurns ? { turns: taxTurns } : {}),
          } as unknown as EffectAction,
        ] } as SequenceAction;
      }
      // 「<対象>は『【常】：あなたの他のシグニN体を場からトラッシュに置かないかぎり
      // アタックできない。』を得る」＝対象シグニ別の解除コストつきアタック制限。
      // 引用能力の「あなた」は付与先シグニの持ち主なので、支払い側で攻撃シグニ自身を除外する。
      const attackFieldTrashM = quoted.trim().match(/^【常】：あなたの(他の)?シグニ([０-９\d]+)体を場からトラッシュに置かないかぎりアタックできない。?$/);
      // 🔴**§5.3 `O-222`（2026-09-02 に `O-220` 第4バッチで登録）＝ルリグ版の受け皿が無い。**
      //   `attackCost.fieldTrash` を消費するのは `execBlockAction` の**シグニ分岐だけ**で、
      //   ルリグのアタック解除コストは `lrigAttackBanCost`（`《無》×N`／`手札N枚`）しか軸を持たない。
      //   ⇒ 指定が**ルリグ**（または引用の外に指定が無い＝別文で宣言されている）ときは
      //   **受け皿が無いので `DEFERRED_` へ倒す**（従来は粗い近似で**自分のシグニ**を無条件に
      //   止めていた＝`WX24-P3-049-E1`）。⚠no-op は過少だが、無関係な自軍シグニを止めるよりは忠実。
      // 🏁**§5.3 `O-222`（2026-09-02）で受け皿を作ってクローズ**＝`SigniAttackBan.unlessPayFieldTrash`
      //   （engine の ban／`lrigAttackBanCost`／`AttackFieldTrashCostModal` のルリグ経路まで配線済み）。
      // 🔴**シグニ対象は据置**＝あちらは `BLOCK_ACTION{attackCost.fieldTrash}`（下の分岐）で既に動いており、
      //   store も判定地点も別（`signi_attack_field_trash_costs`）。**同じ文型でも軸が違うので寄せない。**
      // ⚠**対象の宣言は別の文にあることがある**（`WX24-P3-049-E1`＝「対戦相手のルリグ１体を対象とし、
      //   《白》を支払ってもよい。そうした場合、**それは**…を得る」）＝`targetsStored` で受け、
      //   `applyO96OptionalCostTargetFirst`（`O-96` の3点契約）が `SELECT_TARGET_ONLY` を前に積む。
      if (attackFieldTrashM && !outerSigniCA) {
        const banOwnerFT: Owner = outerOwnerCA !== 'any' ? outerOwnerCA : 'opponent';
        const ftTurns = /次の対戦相手のターン(?:の間|終了時まで)/.test(outerCA) ? 2 : undefined;
        return { type: 'SIGNI_ATTACK_BAN', owner: banOwnerFT, targetsStored: true,
          unlessPayFieldTrash: parseNum(attackFieldTrashM[2]),
          ...(ftTurns ? { turns: ftTurns } : {}),
        } as unknown as EffectAction;
      }
      if (attackFieldTrashM) {
        const kwOwnerCA: Owner = t.includes('対戦相手') ? 'opponent' : t.includes('あなた') ? 'self' : 'any';
        const targetCountM = t.match(/シグニを([０-９\d]+)体まで対象とし/);
        return {
          type: 'BLOCK_ACTION',
          target: {
            type: 'SIGNI', owner: kwOwnerCA,
            count: targetCountM ? parseNum(targetCountM[1]) : 1,
            ...(targetCountM ? { upToCount: true } : {}),
            ...kwTargetFilter,
          },
          actionId: 'ATTACK',
          until: 'END_OF_TURN',
          // 「**他の**シグニ」だけ `excludeSelf`＝アタッカー自身を支払いに使えない（原文どおり）。
          attackCost: { fieldTrash: { count: parseNum(attackFieldTrashM[2]), excludeSelf: !!attackFieldTrashM[1] } },
        } as BlockActionAction;
      }
      // 「<対象>は「【常】：アタックできない。」を得る」。
      // ⚠従来は対象を一切読まず SIGNI/owner:'any'/count:1/END_OF_TURN 決め打ちで、原文が**ルリグ**を対象に
      //   していても**シグニ**をブロックする別効果に化けていた（ルリグは素通り＋無関係なシグニが止まる二重誤り）。
      //   NEGATE_ATTACK で先に是正した §3 Opusタスク10 パターンB と同じ壊れ方。
      // 表現は多数派（102効果）と同じ GRANT_KEYWORD{'アタックできない'} に寄せる＝engine は LRIG /
      //   CENTER_LRIG_OR_SIGNI を解決でき、ルリグアタック判定（BattleScreen）もこの経路を見るため engine 変更不要。
      // 引用内に条件節（「…ないかぎりアタックできない」「…でアタックできない」）を持つ変種は
      //   条件を落として無条件ブロックに化ける＝過剰効果になるため、この規則では扱わず従来の粗い近似へ落とす。
      const plainCannotAttack = /^【常】：アタックできない。?$/.test(quoted.trim());
      if (plainCannotAttack) {
        const kwOwnerCA: Owner = t.includes('対戦相手') ? 'opponent' : t.includes('あなた') ? 'self' : 'any';
        // 対象種別：「ルリグかシグニ」「ルリグとシグニを合計N体」→ 両方から選ぶ／「ルリグ」単独 → LRIG／既定 → SIGNI
        // 「ルリグかシグニN体」「ルリグとシグニを合計N体」「ルリグ1体と（対戦相手の）シグニ1体」→ 両方から選ぶ
        const bothCA = /ルリグ(?:[０-９\d]+体)?(?:か|または|と)[^。]{0,12}シグニ/.test(t);
        const lrigOnlyCA = !bothCA && /ルリグ/.test(t) && !/シグニ/.test(t);
        const tgtTypeCA = bothCA ? 'CENTER_LRIG_OR_SIGNI' : lrigOnlyCA ? 'LRIG' : 'SIGNI';
        // 体数：「合計N体」優先。両対象で合計指定が無い形（ルリグ1体と シグニ1体）は各1体＝2体。
        const totalMCA = t.match(/合計([０-９\d]+)体/);
        const cntMCA = t.match(/([０-９\d]+)体/);
        const countCA = t.includes('すべてのシグニ') ? 'ALL'
          : totalMCA ? parseNum(totalMCA[1])
            : bothCA ? 2
              : cntMCA ? parseNum(cntMCA[1]) : 1;
        // ⚠upToCount は「N体まで」だけ。素朴な t.includes('まで') は「ターン終了時**まで**」に必ず当たり、
        //   ほぼ全効果が「N体まで（＝0体でもよい）」に化けるので必ず数詞に隣接させて判定する。
        const upToCA = /[０-９\d]+体まで/.test(t) || /体を[０-９\d]+体まで/.test(t);
        const durCA: EffectDuration =
          (t.includes('次の対戦相手のターンの間') || t.includes('次の対戦相手のターン終了時まで')) ? 'UNTIL_OPP_TURN_END'
            : t.includes('ターン終了時まで') ? 'UNTIL_END_OF_TURN' : 'UNTIL_END_OF_TURN';
        return {
          type: 'GRANT_KEYWORD',
          target: {
            type: tgtTypeCA, owner: kwOwnerCA, count: countCA,
            ...(upToCA ? { upToCount: true } : {}),
            ...kwTargetFilter,
          },
          keyword: 'アタックできない',
          duration: durCA,
        } as GrantKeywordAction;
      }
      return { type: 'BLOCK_ACTION', target: { type: 'SIGNI', owner: 'any', count: 1 }, actionId: 'ATTACK', until: 'END_OF_TURN' } as BlockActionAction;
    }
    const kwMatch = quoted.match(/^(ランサー|アサシン|ダブルクラッシュ|トリプルクラッシュ|シャドウ|バニッシュ耐性|シールド|チャーム)$/);
    if (kwMatch) {
      const kwOwner: Owner = t.includes('対戦相手') && !t.includes('あなた') ? 'opponent'
        : t.includes('あなた') ? 'self' : 'any';
      const kwAll = t.includes('すべてのシグニ') || t.includes('全てのシグニ') || t.includes('シグニすべて');
      const kwCountM = t.match(/シグニ([０-９\d]+)体/);
      const kwCount: number | 'ALL' = kwAll ? 'ALL' : kwCountM ? parseNum(kwCountM[1]) : 1;
      return { type: 'GRANT_KEYWORD', target: { type: 'SIGNI', owner: kwOwner, count: kwCount, ...kwUpToCount, ...kwTargetFilter }, keyword: kwMatch[1], duration: 'UNTIL_END_OF_TURN' } as GrantKeywordAction;
    }
    // 引用内が「【常】：…【シャドウ（X）】を得る。」のみの場合はシャドウ付与へ平坦化
    // （シャドウスコープは encodeShadowScopesInText 済 → 【シャドウ:{...}】）
    const innerShadowM = quoted.match(/【(シャドウ(?::\{[^}]*\})?)】を(?:得る|持つ)/);
    if (innerShadowM) {
      const swOwner: Owner = t.includes('対戦相手') && !t.includes('あなた') ? 'opponent'
        : t.includes('あなた') ? 'self' : 'any';
      const swAll = t.includes('すべてのシグニ') || t.includes('全てのシグニ') || t.includes('シグニすべて');
      const swCountM = t.match(/シグニ(?:を)?([０-９\d]+)体/);
      const swCount: number | 'ALL' = swAll ? 'ALL' : swCountM ? parseNum(swCountM[1]) : 1;
      // 引用内の 【常】：対戦相手のターンの間 は外側の継続期間に依存
      const swDur: EffectDuration = (t.includes('次の対戦相手のターンの間') || t.includes('次の対戦相手のターン終了時まで')) ? 'UNTIL_OPP_TURN_END'
        : t.includes('ターン終了時まで') ? 'UNTIL_END_OF_TURN' : 'PERMANENT';
      return { type: 'GRANT_KEYWORD', target: { type: 'SIGNI', owner: swOwner, count: swCount, ...kwUpToCount, ...kwTargetFilter }, keyword: innerShadowM[1], duration: swDur } as GrantKeywordAction;
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
  // ⚠TRASH: バニッシュ（エナ送り）ではない（続き19是正・LB 11効果がBANISH化していた）
  if (t.includes('アップ状態のシグニ') && t.includes('トラッシュに置く')) {
    const owner: Owner = t.includes('対戦相手') ? 'opponent' : 'self';
    return { type: 'TRASH', target: parseSigniTarget(t, owner) };
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

  // ---- ルリグトラッシュのルリグの【起】能力をコピー ----
  if (t.match(/このルリグはあなたのルリグトラッシュにあるルリグの【起】能力を持つ/)) {
    return { type: 'STUB', id: 'COPY_LRIG_TRASH_ACTIVATED' } as StubAction;
  }

  // ---- エナゾーン以外のシグニを黒にする ----
  if (t.match(/エナゾーン以外の領域にあるシグニは黒になる/)) {
    return { type: 'STUB', id: 'CHANGE_ALL_SIGNI_COLOR_TO_BLACK' } as StubAction;
  }

  // ---- ドライブ状態でもアタックできる ----
  if (t.match(/このルリグはドライブ状態でもアタックできる/)) {
    return { type: 'STUB', id: 'ALLOW_ATTACK_WHILE_DRIVE' } as StubAction;
  }

  // ---- あなたのシグニを他のシグニゾーンに配置（対象指定型）----
  if (t.match(/あなたのシグニ.*を対象とし.*他のシグニゾーン.*配置/)) {
    return { type: 'STUB', id: 'MOVE_TARGET_SIGNI_TO_OTHER_ZONE' } as StubAction;
  }

  // ---- ライフクロスはリフレッシュでトラッシュに移動しない ----
  if (t.match(/あなたのライフクロスはリフレッシュによってトラッシュに移動しない/)) {
    return { type: 'STUB', id: 'PREVENT_LIFE_REFRESH_TRASH' } as StubAction;
  }

  // ---- 対戦相手は追加コストを払わないかぎり【ガード】できない ----
  const guardExtraCostMatch = t.match(/対戦相手は追加で((?:《無》)+)を支払わないかぎり【ガード】ができない/);
  if (guardExtraCostMatch) {
    const count = guardExtraCostMatch[1].match(/《無》/g)?.length ?? 1;
    return {
      type: 'STUB',
      id: 'GUARD_EXTRA_COST_BY_OPP',
      ...(count === 1 ? {} : { count }),
      ...(t.includes('このターン') ? { until: 'END_OF_TURN' as const } : {}),
    } as StubAction;
  }

  // ---- 場離れ代替：下のカードをトラッシュに置く ----
  if (t.match(/このシグニが対戦相手の効果によって場を離れる場合.*代わりに.*下からすべてのカードをトラッシュに置いてもよい/)) {
    return { type: 'STUB', id: 'REPLACE_LEAVE_FIELD_WITH_TRASH_UNDER' } as StubAction;
  }

  // ---- 対戦相手のドロー枚数制限 ----
  if (t.match(/対戦相手はカードを合計.*枚までしか引けない/)) {
    return { type: 'STUB', id: 'OPP_DRAW_LIMIT' } as StubAction;
  }

  // ---- このシグニは対戦相手の効果によって新たに能力を得られない ----
  if (t.match(/このシグニは対戦相手の効果によって新たに能力を得られない/)) {
    return { type: 'STUB', id: 'PREVENT_ABILITY_GAIN_BY_OPP' } as StubAction;
  }

  // ---- 対戦相手はコストを払わないかぎり手札を捨てる ----
  if (t.match(/対戦相手は.*を支払わないかぎり[、,]?手札を.*捨てる/)) {
    return { type: 'STUB', id: 'OPP_DISCARD_OR_PAY_ENERGY' } as StubAction;
  }

  // ---- レベル０のルリグからグロウできる ----
  if (t.match(/レベル０のルリグからこのルリグにグロウできる/)) {
    return { type: 'STUB', id: 'GROW_FROM_LEVEL0' } as StubAction;
  }

  return null;
}
