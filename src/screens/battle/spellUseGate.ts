import type { CardData, PlayerState, TurnPhase } from '../../types';
import type { CardEffect } from '../../types/effects';
import { collectBlockLowCostSpellCount, collectFirstSpellCostUp } from '../../engine/effectEngine';
import { evalUseCondition, getCardNum } from '../../engine/effectExecutor';
import type { ArtsPayerCtx } from './artsUseGate';
import { cardNameUseBlocked } from './cardNameUseBlock';
import {
  applyContinuousCostDecreases, applyMeltFactPreUseCost, applySpecificCardCostReduction,
  canAffordWithExtraCost, computeArtsEffectiveCost, costReplacementOf, costScalingOf, parseGrowCost, removeNColorFromCost,
} from './costs';
import { energyPoolCardNums } from './energyPaySource';
import { meetsRestriction } from './growLogic';

/**
 * 手札スペルが**いま発動できるか**（提示の可否＋請求される実効コスト）を1か所で判定する純関数群
 * （§8／§6.4 `O-1` (b)）。`artsUseGate.ts` と同じ規律＝**人間のボタン生成と CPU の候補フィルタが
 * 同じ関数を見る**。
 *
 * ⚠**支払う側の常在効果は `ArtsPayerCtx` を共用する**（`buildArtsPayerCtx` で組む）＝
 * アーツとスペルで軽減の収集元が食い違わないようにするため。
 */

/**
 * スペルを使用できない状態か（§6.4 O-18・続き513）。
 *
 * 🔴**封じの軸は3つある**＝`USE_SPELL`／`PLAY_COLORLESS`（無色のスペル封じ）／
 * `BLOCK_NON_WHITE_SPELL`（白以外のスペル封じ）。**ボタン生成側と実行入口の両方**からこの1関数を呼ぶ
 * （片方だけだと「押しても無反応」か「UI を迂回して使える」になる）。
 */
export function isSpellUseBlockedFor(
  my: PlayerState, blockedSelf: Set<string>, card: { Color?: string } | undefined,
): boolean {
  const isActionBlocked = (id: string) => (my.blocked_actions?.some(a => a === id) ?? false) || blockedSelf.has(id);
  return isActionBlocked('USE_SPELL')
    || (isActionBlocked('PLAY_COLORLESS') && card?.Color === '無')
    || (isActionBlocked('BLOCK_NON_WHITE_SPELL') && !card?.Color?.includes('白'));
}

/**
 * スペルの実効コスト（**任意支払いを何もしていない状態**の請求額）。
 *
 * ⚠**支払いUI（`SpellCastModal`）もこの関数を通す**＝コスト計算の入口を増やさない
 * （PLAN §4 教訓 (d)）。UI 側だけが持つのは「選択枚数に追従する軽減」
 * （`useTimeCostReduction`）と、選択に応じた `paidOptionalDiscard` / `virusRemovalByZone` の値だけ。
 */
export function computeSpellEffectiveCost(p: {
  card: CardData;
  my: PlayerState;
  op: PlayerState;
  cardMap: Map<string, CardData>;
  effectsMap: Map<string, CardEffect[]>;
  payer: ArtsPayerCtx;
  /** 「手札をN枚捨てるなら使用コストは《X》になる」の任意支払いを済ませたか（支払いUI の選択）。 */
  paidOptionalDiscard?: boolean;
  /** `WX15-067`（メルト・ファクト）の事前ウィルス除去枚数（支払いUI の選択）。 */
  virusRemovalByZone?: number[];
}): string {
  const { card, my, op, cardMap, payer } = p;
  const myLrigCard = cardMap.get(my.field.lrig.at(-1) ?? '');
  let cost = applyContinuousCostDecreases(
    computeArtsEffectiveCost(card, my, myLrigCard?.CardName,
      cardMap.get(op.field.lrig.at(-1) ?? '')?.Color ?? '',
      myLrigCard ? parseInt(myLrigCard.Level ?? '0') : 0, cardMap,
      payer.lrigNameAliases, undefined,
      { oppState: op, cardCostReplacements: my.card_cost_replacements, paidOptionalDiscard: p.paidOptionalDiscard },
      costScalingOf(card.CardNum, p.effectsMap), costReplacementOf(card.CardNum, p.effectsMap)),
    'スペル', card.Color, payer.costModsForMy);
  // 次スペルコスト軽減（`WX04-008`《白×2》減）を適用
  for (const r of my.next_spell_cost_reduction ?? []) cost = removeNColorFromCost(cost, r.color, r.count);
  // SPECIFIC_CARD_COST_REDUCE（タスク12(xci)）＝「《カード名》の使用コストは《無×N》減る」
  cost = applySpecificCardCostReduction(cost, card.CardName, payer.specificCardCostReductions);
  return applyMeltFactPreUseCost(card.CardNum, cost, p.virusRemovalByZone);
}

/**
 * スペルに乗る**追加コスト**（CONTINUOUS の増加ぶん ＋ `FIRST_SPELL_COST_UP`）。
 * ⚠`FIRST_SPELL_COST_UP` は「このターン最初の1枚」だけ＝`actions_done` の `'USE_SPELL'` で判定する。
 */
export function spellExtraCosts(p: {
  my: PlayerState; op: PlayerState; payer: ArtsPayerCtx; effectsMap: Map<string, CardEffect[]>;
}): { color: string; count: number }[] {
  const extra = p.payer.costModsForMy
    .filter(m => m.direction === 'increase' && m.targetCardType === 'スペル')
    .flatMap(m => m.amount);
  const firstSpellExtra = !p.my.actions_done?.includes('USE_SPELL')
    ? collectFirstSpellCostUp(p.op, p.effectsMap) : 0;
  return firstSpellExtra > 0 ? [...extra, { color: '無', count: firstSpellExtra }] : extra;
}

export interface SpellUseCheck {
  /**
   * 提示できるか（フェイズ・限定・封じ・ディソナ制限・低コスト封じ・使用条件）。
   *
   * ⚠**`affordable` は含めない**（`checkArtsUse.usable` とはここが違う）。スペルの軽減は
   * **支払いUI の選択次第で下がる**（任意手札捨てによるコスト置換／使用時の任意支払い）ので、
   * 基本コストの支払い可否で提示を切ると**払える札を隠す**（＝人間の既存挙動も変わる）。
   * **CPU 側は `usable && affordable` を見る**（CPU は任意支払いをしないため基本コストが請求額）。
   */
  usable: boolean;
  /** 基本コスト（任意支払いなし）をエナで払えるか。 */
  affordable: boolean;
  effectiveCost: string;
  extraCosts: { color: string; count: number }[];
}

export function checkSpellUse(p: {
  card: CardData;
  my: PlayerState;
  op: PlayerState;
  /** `my` がターンプレイヤーか。 */
  isMyTurn: boolean;
  turnPhase: TurnPhase;
  /** スペル解決待ちの窓が開いていないか（`bs.pending_spell`）。 */
  pendingSpell: boolean;
  cards: CardData[];
  cardMap: Map<string, CardData>;
  effectsMap: Map<string, CardEffect[]>;
  payer: ArtsPayerCtx;
  effectivePowers?: Map<string, number>;
}): SpellUseCheck {
  const { card, my, op, cardMap, effectsMap, payer } = p;
  const cardNum = card.CardNum;
  const effectiveCost = computeSpellEffectiveCost({ card, my, op, cardMap, effectsMap, payer });
  const extraCosts = spellExtraCosts({ my, op, payer, effectsMap });
  const affordable = canAffordWithExtraCost(
    energyPoolCardNums(payer.energyPayPool), p.cards, effectiveCost, extraCosts, my.keyword_grants,
    payer.enaAllMulti, payer.enaMultiStripped, payer.colorlessOverrides, payer.colorSubs,
    payer.energyExtraColors, undefined, undefined, undefined, my.cannot_pay_colorless_this_attack_phase);

  // DISONA_RESTRICTION: このターン《ディソナアイコン》ではないスペルを使用できない
  const dissonaBlocked = !!my.dissona_only_spells_this_turn && card.Story !== 'Dissona';
  // BLOCK_LOW_COST_SPELL_BY_CHARM_COUNT: 相手フィールドのチャーム数以下コストのスペルは使用不可
  const lowCostThreshold = collectBlockLowCostSpellCount(op, cardMap, effectsMap);
  const lowCostBlocked = lowCostThreshold > 0
    && parseGrowCost(card.Cost ?? '').reduce((s, c) => s + c.count, 0) <= lowCostThreshold;
  const eff = effectsMap.get(cardNum)?.find(e => e.effectType === 'ACTIVATED');

  const usable =
    p.turnPhase === 'MAIN' && p.isMyTurn &&
    !p.pendingSpell &&
    !isSpellUseBlockedFor(my, payer.blockedSelf, card) &&
    !dissonaBlocked && !lowCostBlocked &&
    meetsRestriction(card.Restriction, payer.lrigClass, payer.ignoreRestriction) &&
    !cardNameUseBlocked(my, card.CardName, card.Type) &&
    (!eff?.condition || evalUseCondition(eff.condition, my, op, cardMap, cardNum, p.turnPhase, p.effectivePowers));

  return { usable, affordable, effectiveCost, extraCosts };
}

/**
 * 手札の中で**いま発動できて、しかもエナで払えるスペル**の一覧（CPU 用・重複カード番号は1件）。
 * `handIndex` は `castSpell`／`performSpell` にそのまま渡す。
 */
export function listCastableSpells(p: Omit<Parameters<typeof checkSpellUse>[0], 'card'>): {
  card: CardData; handIndex: number; check: SpellUseCheck;
}[] {
  const seen = new Set<string>();
  const out: { card: CardData; handIndex: number; check: SpellUseCheck }[] = [];
  p.my.hand.forEach((instId, handIndex) => {
    const cardNum = getCardNum(instId);
    if (seen.has(cardNum)) return;
    const card = p.cardMap.get(cardNum);
    if (!card || card.Type !== 'スペル') return;
    seen.add(cardNum);
    const check = checkSpellUse({ ...p, card });
    if (check.usable && check.affordable) out.push({ card, handIndex, check });
  });
  return out;
}
