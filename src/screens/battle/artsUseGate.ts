import type { CardData, PlayerState, TurnPhase } from '../../types';
import type { CardEffect, StubAction } from '../../types/effects';
import {
  type ActiveCostMod,
  calcActiveCostMods, calcContinuousBlockedActions, checkActiveCondition,
  collectAllZoneBlackCardNums, collectArtsThresholdCostReductions, collectColorlessOverrides,
  collectConvertEnergyColors, collectEnergyColorSubs, collectEnergyTrashSubstituteInfo,
  collectFieldEnergySigniColorGains, collectLrigNameAliases, collectOppTurnArtsCostReductions,
  collectSpecificCardCostReductions, hasAllCardsColorBlack,
} from '../../engine/effectEngine';
import { getCardNum } from '../../engine/effectExecutor';
import { canUseArtsCondition } from './battleUtils';
import { cardNameUseBlocked } from './cardNameUseBlock';
import {
  applyContinuousCostDecreases, applyNextArtsCostReduction, applySpecificCardCostReduction,
  canAffordGrowCost, canAffordWithExtraCost, computeArtsEffectiveCost, computeCostReplacement, costReplacementOf, costScalingOf,
  energyCostToString, isEnaMultiStripped, betOptionsOf, coinPayableFor,
} from './costs';
import { type EnergyPayEntry, buildEnergyPayPool, energyPoolCardNums } from './energyPaySource';
import { effectiveLrigClass, meetsRestriction } from './growLogic';
// ⚠`useTimeCostCandidates` は別名で受ける＝`use` 始まりだと eslint の `rules-of-hooks` が React Hook と
//   誤認して警告を出す（`SpellCastModal` が同じ理由で `getTimeCostCandidates` に別名化している）。
import { applyUseTimeCostReduction, resolveUseTimeCost, useTimeCostCandidates as getTimeCostCandidates } from './useTimeCost';

/**
 * 🆕**「条件を満たす場合、このアーツは追加で《X アイコン》を持つ」で足される使用タイミング**
 * （2026-09-02・§5.3 `O-84`）。
 *
 * 🔴**使用可否の Timing は `CardData.Timing` 列を読む静的判定**なので、盤面条件で1つ足す口が無かった。
 * ⚠**条件は effect の `activeCondition`**（`checkActiveCondition` 1本で評価する）。
 * ⚠**足す側であって絞る側ではない**＝返り値は `timingOk` へ `||` で合流させること。
 * ⚠人間UI／CPU はどちらも `checkArtsUse` を通るので、消費地点はここ1本でよい。
 */
export function collectExtraUseTimings(
  effs: CardEffect[], my: PlayerState, op: PlayerState,
  cardMap: Map<string, CardData>, cardNum: string, isMyTurn: boolean,
): Set<'MAIN' | 'ATTACK_ARTS'> {
  const out = new Set<'MAIN' | 'ATTACK_ARTS'>();
  for (const eff of effs) {
    if (eff.effectType !== 'CONTINUOUS') continue;
    const act = eff.action as StubAction;
    if (act?.type !== 'STUB' || act.id !== 'EXTRA_USE_TIMING' || !act.extraUseTiming) continue;
    if (!checkActiveCondition(eff.activeCondition, my, op, isMyTurn, cardMap, cardNum)) continue;
    out.add(act.extraUseTiming.timing);
  }
  return out;
}

/**
 * アーツが**いま使えるか**（提示の可否＋請求される実効コスト）を1か所で判定する純関数群（§8／§6.4 `O-1`）。
 *
 * ⚠**必ず人間のボタン生成と CPU の候補フィルタの両方から同じ関数を呼ぶこと**
 * （`signiActivateGate.ts` / `signiAttackGate.ts` と同じ規律）。写経すると「人間には
 * 見えないのに CPU は使える」（またはその逆）という食い違いになり、ゲートにも census にも映らない。
 *
 * ⚠**コスト計算の入口を増やさない**（PLAN §4 教訓 (d)＝コスト計算の入口は3箇所あり、1つ落とすと
 * 「一覧からは使えるのにタップすると使えない」食い違いになる）。ここが唯一の funnel。
 */

/**
 * アーツの実効コスト計算に要る「支払う側の常在効果」一式。
 *
 * ⚠**フィールドを増やしたら `buildArtsPayerCtx` にも足す**（人間UIは既存の `useMemo` から、
 * CPU は `buildArtsPayerCtx` から作るが、**どちらも同じ収集関数の出力**であること）。
 */
export interface ArtsPayerCtx {
  /** `buildEnergyPayPool(actor, ...)`（エナ支払い元 funnel）。 */
  energyPayPool: EnergyPayEntry[];
  /** 全エナに【マルチエナ】を付与する常在効果が自分の場にあるか。 */
  enaAllMulti: boolean;
  /** 相手の `STRIP_OPP_ENA_MULTI_ENA` で自分のエナが【マルチエナ】を失っているか。 */
  enaMultiStripped: boolean;
  colorlessOverrides: string[];
  colorSubs: { from: string[]; to: string }[];
  energyExtraColors: Map<string, string>;
  energyTrashSubInfo: { wildcardInstIds: Set<string>; colorOverrideMap: Map<string, string>; keySubInstId: string | null };
  /** `calcActiveCostMods(...).forMy` ＋ 相手が持つ NEXT_OPP_TURN のコスト増加。 */
  costModsForMy: ActiveCostMod[];
  lrigNameAliases: string[];
  artsThresholdReductions: { minTotalCost: number; color: string; reduction: number }[];
  specificCardCostReductions: { targetCardName: string; colorlessReduction: number }[];
  /** `calcContinuousBlockedActions(...).forSelf`。 */
  blockedSelf: Set<string>;
  /** 「〇〇限定」の使用制限を見る実効ルリグクラス。 */
  lrigClass: string;
  /** `IGNORE_LRIG_RESTRICTION_ARTS`（限定を無視できる）。 */
  ignoreRestriction: boolean;
}

/**
 * 全エナに【マルチエナ】を付与する CONTINUOUS（`GRANT_KEYWORD` マルチエナ・`count:'ALL'`）が
 * 自分の場（シグニ／センタールリグ）にあるか。`WX01-027`・`WX05-006` 等。
 */
export function collectEnaAllMulti(
  my: PlayerState, op: PlayerState, isMyTurn: boolean,
  effectsMap: Map<string, CardEffect[]>, cardMap: Map<string, CardData>,
): boolean {
  const hasAllMultiEffect = (cardNum: string) =>
    (effectsMap.get(cardNum) ?? []).some(e =>
      e.effectType === 'CONTINUOUS' &&
      e.action?.type === 'GRANT_KEYWORD' &&
      (e.action as { keyword: string }).keyword === 'マルチエナ' &&
      (e.action as { target: { count: unknown } }).target?.count === 'ALL' &&
      // グロウ条件等の activeCondition（WX05-006「エナの色が3種類以上」）を尊重
      (!e.activeCondition || checkActiveCondition(e.activeCondition, my, op, isMyTurn, cardMap, cardNum))
    );
  if (my.field.signi.some(stack => { const top = stack?.at(-1); return !!top && hasAllMultiEffect(top); })) return true;
  const lrigTop = my.field.lrig.at(-1);
  return !!lrigTop && hasAllMultiEffect(lrigTop);
}

/**
 * エナゾーンの追加色マップ（instId → 追加色）。`FIELD_ENERGY_SIGNI_GAIN_COLOR` /
 * 【コンバート《色》】/ `ALL_ZONE_BLACK` / `ALL_CARDS_COLOR_CHANGE_BLACK` を合流させる。
 */
export function collectEnergyExtraColors(
  my: PlayerState, op: PlayerState, isMyTurn: boolean,
  effectsMap: Map<string, CardEffect[]>, cardMap: Map<string, CardData>,
): Map<string, string> {
  const map = new Map<string, string>();
  for (const { gainColor, instIds } of collectFieldEnergySigniColorGains(my, cardMap, effectsMap)) {
    for (const id of instIds) map.set(id, gainColor);
  }
  // 【コンバート《色》】（§6.4 O-10・続き508）＝**そのカード自身**がエナゾーンで別色としても払える。
  for (const [instId, color] of collectConvertEnergyColors(my, effectsMap)) {
    if (!map.has(instId)) map.set(instId, color);
  }
  // ALL_ZONE_BLACK: 全ゾーンで黒でもあるカードをエナ内で黒追加
  const allZoneBlackNums = collectAllZoneBlackCardNums(effectsMap);
  const allMyCardsBlack = hasAllCardsColorBlack(my, op, isMyTurn, effectsMap, cardMap);
  if (allZoneBlackNums.size > 0 || allMyCardsBlack) {
    for (const instId of my.energy) {
      const baseNum = getCardNum(instId);
      const currentColor = cardMap.get(baseNum)?.Color ?? '無';
      if (!currentColor.includes('黒') && !map.has(instId)) {
        if (allMyCardsBlack || allZoneBlackNums.has(baseNum)) map.set(instId, '黒');
      }
    }
  }
  return map;
}

/** `IGNORE_LRIG_RESTRICTION_ARTS`（「限定」を無視してアーツを使える）を持っているか。 */
function hasIgnoreLrigRestriction(my: PlayerState, effectsMap: Map<string, CardEffect[]>): boolean {
  return (my.lrig_gained_types?.includes('__ignore_lrig_restriction__') ?? false) ||
    [my.field.lrig.at(-1), my.field.key_piece].filter(Boolean).some(cn =>
      (effectsMap.get(cn!) ?? []).some(e =>
        e.effectType === 'CONTINUOUS' &&
        (e.action as StubAction).type === 'STUB' &&
        (e.action as StubAction).id === 'IGNORE_LRIG_RESTRICTION_ARTS'
      )
    );
}

/**
 * `ArtsPayerCtx` を1回で組む（**CPU 経路の入口**）。
 *
 * ⚠人間UIは同じ値を `BattleScreen` の `useMemo` 群から渡す。**両者は同じ収集関数を呼ぶ**
 * ことでのみ一致する＝ここに独自の式を書かないこと（書くと人間と CPU でコストが変わる）。
 */
export function buildArtsPayerCtx(p: {
  actor: PlayerState;
  opponent: PlayerState;
  /** `actor` がターンプレイヤーか。 */
  isActorTurn: boolean;
  turnPhase: TurnPhase;
  cardMap: Map<string, CardData>;
  effectsMap: Map<string, CardEffect[]>;
  /** 事前計算済みなら渡す（`calcContinuousBlockedActions` に流す）。 */
  effectivePowers?: Map<string, number>;
}): ArtsPayerCtx {
  const { actor, opponent, isActorTurn, cardMap, effectsMap } = p;
  const mods = calcActiveCostMods(actor, opponent, isActorTurn, effectsMap, cardMap);
  // COST_INCREASE(NEXT_OPP_TURN): 相手が保持する「相手ターンの相手コスト増加」は自分のコストへ加算。
  const toMods = (arr?: Array<{ targetCardType: string; amount: { color: string; count: number }[] }>): ActiveCostMod[] =>
    (arr ?? []).map(e => ({ direction: 'increase' as const, targetCardType: e.targetCardType, amount: e.amount as ActiveCostMod['amount'] }));
  return {
    energyPayPool: buildEnergyPayPool(actor, { turnPhase: p.turnPhase, isMyTurn: isActorTurn, effectsMap }),
    enaAllMulti: collectEnaAllMulti(actor, opponent, isActorTurn, effectsMap, cardMap),
    enaMultiStripped: isEnaMultiStripped(actor, opponent, !isActorTurn, effectsMap, cardMap),
    colorlessOverrides: collectColorlessOverrides(actor, opponent, cardMap).ownerColorless,
    colorSubs: collectEnergyColorSubs(actor, cardMap, effectsMap),
    energyExtraColors: collectEnergyExtraColors(actor, opponent, isActorTurn, effectsMap, cardMap),
    energyTrashSubInfo: collectEnergyTrashSubstituteInfo(actor, cardMap, effectsMap),
    costModsForMy: [...mods.forMy, ...toMods(opponent.opp_cost_up_until_opp_turn)],
    lrigNameAliases: collectLrigNameAliases(actor, cardMap, effectsMap, opponent),
    artsThresholdReductions: [
      ...collectArtsThresholdCostReductions(actor, cardMap, effectsMap),
      ...collectOppTurnArtsCostReductions(actor, opponent, isActorTurn, cardMap, effectsMap)
        .map(r => ({ minTotalCost: 0, color: r.color, reduction: r.reduction })),
    ],
    specificCardCostReductions: collectSpecificCardCostReductions(actor, cardMap, effectsMap),
    blockedSelf: calcContinuousBlockedActions(actor, opponent, isActorTurn, effectsMap, cardMap, p.effectivePowers).forSelf,
    lrigClass: effectiveLrigClass(actor, cardMap.get(actor.field.lrig.at(-1) ?? '')?.CardClass),
    ignoreRestriction: hasIgnoreLrigRestriction(actor, effectsMap),
  };
}

export interface ArtsUseGateInput {
  /** 判定するアーツ（`アーツ` / `アーツ/クラフト`）。 */
  card: CardData;
  my: PlayerState;
  op: PlayerState;
  /** `my` がターンプレイヤーか。 */
  isMyTurn: boolean;
  turnPhase: TurnPhase;
  cards: CardData[];
  cardMap: Map<string, CardData>;
  effectsMap: Map<string, CardEffect[]>;
  payer: ArtsPayerCtx;
  effectivePowers?: Map<string, number>;
}

export interface ArtsUseCheck {
  /** フェイズ・Timing・封じ・限定・使用条件・支払い可否をすべて満たすか。 */
  usable: boolean;
  /** 実際に請求される実効コスト（軽減・置換・相手ターン代替コストの適用後）。 */
  effectiveCost: string;
  /** 支払いUIへ持ち込む値＝印刷コストから動いていなければ `null`（Phase2 が印刷コストを使う約束）。 */
  effectiveCostForModal: string | null;
  /** ベット宣言でのみ成立する置換コスト（無ければ `null`）。 */
  betCost: string | null;
  /** CONTINUOUS のアーツコスト**増加**ぶん。 */
  extraCosts: { color: string; count: number }[];
  /**
   * エナで払えるか（ベット宣言での成立を含む）。**使用時の任意支払いは含めない**＝
   * CPU はその支払いをしないので、CPU の請求額はこちらが正（`listUsableArts` が見るのもこちら）。
   */
  affordable: boolean;
  /**
   * `affordable` は false だが、**使用時の任意支払い**（`useTimeCost.ts`＝「このアーツを使用する際、
   * 〜してもよい。この方法で〜1枚につき《X》減る」）を**いま盤面にある候補で最大まで払えば**払えるか
   * （§5.3 `O-123`）。
   *
   * 🔴**これを `usable` に入れないと、軽減が効くべき場面でだけアーツが一覧から消える**＝
   * 支払いUI（`ArtsModal` ＋ `UseCostPaymentPanel`）も解決経路も実装済みなのに、
   * **印刷コストを払えるプレイヤーにしか支払いパネルが出せない**（実測24枚のアーツが該当）。
   */
  affordableWithUseTimePay: boolean;
}

/**
 * アーツを使用できない状態か（§6.4 O-10・続き512）。
 * `ARTS_LIMIT_1` は `actions_done` の `'USE_ARTS'` 回数で数える。
 */
export function isArtsUseBlockedFor(my: PlayerState, blockedSelf: Set<string>): boolean {
  const isActionBlocked = (id: string) => (my.blocked_actions?.some(a => a === id) ?? false) || blockedSelf.has(id);
  return isActionBlocked('USE_ARTS')
    || (isActionBlocked('ARTS_LIMIT_1') && (my.actions_done ?? []).filter(a => a === 'USE_ARTS').length >= 1);
}

/** アーツ1枚の使用可否と実効コスト。**提示側と CPU の両方がこれだけを見る**。 */
export function checkArtsUse(p: ArtsUseGateInput): ArtsUseCheck {
  const { card, my, op, isMyTurn, turnPhase, cards, cardMap, effectsMap, payer } = p;
  const cardNum = card.CardNum;
  const isActionBlocked = (id: string) => (my.blocked_actions?.some(a => a === id) ?? false) || payer.blockedSelf.has(id);
  const poolNums = energyPoolCardNums(payer.energyPayPool);

  const extraCosts = payer.costModsForMy
    .filter(m => m.direction === 'increase' && m.targetCardType === 'アーツ')
    .flatMap(m => m.amount);
  // 実効コスト＝**アーツの全入口で完全に同じ式**（タスク12(xcii)(xciii)）。
  const myLrigCard = cardMap.get(my.field.lrig.at(-1) ?? '');
  const reducedCost = applyNextArtsCostReduction(applySpecificCardCostReduction(applyContinuousCostDecreases(
    computeArtsEffectiveCost(card, my, myLrigCard?.CardName,
      cardMap.get(op.field.lrig.at(-1) ?? '')?.Color ?? '',
      myLrigCard ? parseInt(myLrigCard.Level ?? '0') : 0,
      cardMap, payer.lrigNameAliases, payer.artsThresholdReductions,
      { oppState: op, cardCostReplacements: my.card_cost_replacements }, costScalingOf(cardNum, effectsMap),
      costReplacementOf(cardNum, effectsMap)),
    'アーツ', card.Color, payer.costModsForMy), card.CardName, payer.specificCardCostReductions),
    my.next_arts_cost_reduction, card.Color);
  // ベット宣言でのみ成立する置換は宣言が支払いUI内なので、ここでは「ベットすれば払えるか」だけ見る。
  const betSpec = betOptionsOf(cardNum, effectsMap);
  const betCoinMin = betSpec.variable ? 1 : Math.min(...betSpec.options, Infinity);
  // 🆕§5.3 `O-245`（2026-09-04）＝`coin_use_restriction`（コインはスペルとシグニにしか払えない）。
  const betCost = !isActionBlocked('BET') && !my.negate_coin_abilities && coinPayableFor(my, 'arts')
    && Number.isFinite(betCoinMin) && my.coins >= betCoinMin
    ? computeCostReplacement(card, my, cardMap, { oppState: op, cardCostReplacements: my.card_cost_replacements, isBetting: true },
        costReplacementOf(cardNum, effectsMap))
    : null;
  // 対戦相手ターン中の代替コスト（`altCostOppTurn`）があればそちらが請求額そのもの。
  const altCost = !isMyTurn ? effectsMap.get(cardNum)?.[0]?.altCostOppTurn : undefined;
  const altCostStr = altCost ? energyCostToString(altCost) : null;
  const affordWith = (cost: string) => canAffordWithExtraCost(
    poolNums, cards, cost, extraCosts, my.keyword_grants, payer.enaAllMulti, payer.enaMultiStripped,
    payer.colorlessOverrides, payer.colorSubs, payer.energyExtraColors,
    undefined, undefined, undefined, my.cannot_pay_colorless_this_attack_phase);
  const affordable = altCostStr !== null
    ? canAffordGrowCost(poolNums, cards, altCostStr, my.keyword_grants, payer.enaAllMulti, payer.enaMultiStripped,
        payer.colorlessOverrides, payer.colorSubs, payer.energyExtraColors,
        undefined, undefined, undefined, my.cannot_pay_colorless_this_attack_phase)
    : (affordWith(reducedCost) || (betCost !== null && affordWith(betCost)));
  // 使用時の任意支払い（`useTimeCost.ts`）で下がりうる**最良コスト**＝いま盤面にある候補を上限まで払った額。
  // ⚠固定形（`perUnit:false`）は候補が上限に届かなければ `applyUseTimeCostReduction` が 0 回に落ちる＝
  //   「半端に払っても安くならない」原文どおりの挙動がそのまま最良値になる。
  // ⚠**代替コスト（`altCostOppTurn`）が立っている窓では見ない**＝あちらが請求額そのものなので、
  //   印刷コストへの軽減を重ねると二重に安くなる。
  const useTimeSpec = altCostStr === null ? resolveUseTimeCost(cardNum, effectsMap) : null;
  const useTimeBestCost = useTimeSpec
    ? applyUseTimeCostReduction(reducedCost, useTimeSpec,
        Math.min(useTimeSpec.max, getTimeCostCandidates(useTimeSpec, my, cardMap).length))
    : reducedCost;
  const affordableWithUseTimePay =
    !affordable && useTimeBestCost !== reducedCost && affordWith(useTimeBestCost);

  // 🆕**盤面条件で使用タイミングを1つ足す**（§5.3 `O-84`・`WX16-Re20-E1`
  //   「あなたのライフクロスが２枚以下の場合、このアーツは追加で《アタックフェイズアイコン》を持つ」）。
  // 🔴旧は `card.Timing` 列だけの静的判定＝**動的に足す口が無く、この文は恒久 no-op** だった。
  // ⚠**足すだけ**（`||` で合流）＝条件を `timingOk` の必須項に混ぜると
  //   「ライフ2枚以下でしか使えないアーツ」という真逆の制限に化ける。
  const extraTimings = collectExtraUseTimings(effectsMap.get(cardNum) ?? [], my, op, cardMap, cardNum, isMyTurn);
  const timingOk =
    (turnPhase === 'MAIN' && isMyTurn && (card.Timing.includes('メインフェイズ') || extraTimings.has('MAIN'))) ||
    (turnPhase === 'ATTACK_ARTS' && isMyTurn && (card.Timing.includes('アタックフェイズ') || extraTimings.has('ATTACK_ARTS'))) ||
    (turnPhase === 'ATTACK_ARTS_OP' && !isMyTurn && (card.Timing.includes('アタックフェイズ') || extraTimings.has('ATTACK_ARTS')));
  const usable =
    meetsRestriction(card.Restriction, payer.lrigClass, payer.ignoreRestriction) &&
    // カード名指定の使用封じ（ターン内 blacklist ／ゲーム内 NAME_BAN ／アーツ名 whitelist）（§6.4 O-3）
    !cardNameUseBlocked(my, card.CardName, card.Type) &&
    !isArtsUseBlockedFor(my, payer.blockedSelf) &&
    timingOk &&
    canUseArtsCondition(effectsMap.get(cardNum) ?? [], my, op, cardMap, cardNum, turnPhase, p.effectivePowers) &&
    (affordable || affordableWithUseTimePay);

  return {
    usable,
    effectiveCost: altCostStr ?? reducedCost,
    effectiveCostForModal: altCostStr ?? (reducedCost !== card.Cost ? reducedCost : null),
    betCost,
    extraCosts,
    affordable,
    affordableWithUseTimePay,
  };
}

/** ルリグデッキの中で**いま使えるアーツ**の一覧（重複カード番号は1件）。 */
export function listUsableArts(p: Omit<ArtsUseGateInput, 'card'>): { card: CardData; check: ArtsUseCheck }[] {
  const seen = new Set<string>();
  const out: { card: CardData; check: ArtsUseCheck }[] = [];
  for (const instId of p.my.lrig_deck) {
    const cardNum = getCardNum(instId);
    if (seen.has(cardNum)) continue;
    seen.add(cardNum);
    const card = p.cardMap.get(cardNum);
    if (!card || (card.Type !== 'アーツ' && card.Type !== 'アーツ/クラフト')) continue;
    const check = checkArtsUse({ ...p, card });
    // ⚠**CPU は `affordable` も要求する**（§5.3 `O-123`）＝`usable` は使用時の任意支払いで払える
    //   ケースも通すようになったが、CPU はその支払いをしない＝請求額は `affordable` 側が正。
    if (check.usable && check.affordable) out.push({ card, check });
  }
  return out;
}
