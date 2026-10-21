import { coinLedger } from '../../../engine/coinAbilityNegation';
import { initStack, pushToStack } from '../../../engine/effectStack';
import { collectCoinPaidTriggers as pureCollectCoinPaidTriggers } from '../../../engine/triggerCollect';
import { type PlayerState, type StackEntry } from '../../../types';
import type { CardEffect } from '../../../types/effects';
import { attachedOrUnderCostCandidates, payAttachedOrUnderTrash } from '../attachedOrUnderCost';
import { generateUUID } from '../battleUtils';
import { reduceBattle } from '../controller/battleController';
import { handDiscardHistoryRecord } from '../costs';
import { type EnergyPayEntry, planEnergyPayment } from '../energyPaySource';
import { removeKeyToLrigTrash } from '../keyZone';
import { effectiveCoinCost } from '../lrigActivateGate';
import type { PerformCtx } from './performCtx';

/**
 * 🆕2026-10-21＝**キーの【起】の実行（人間・CPU 共通）**。`BattleScreen` の `executeKeyActivated` から移設した。
 * ⚠**「いま撃てるか」の判定はここではなく `keyActivateGate.canActivateKeyEffect`**（提示と支払いは別の地点）。
 *
 * 🔴移設のときに塞いだ支払いの穴（どれも旧実装では提示だけして踏み倒せた）：
 *   ①《コインアイコン》（`cost.coin`・キーの【起】4効果）＝**コインが1枚も減らなかった**
 *   ②「シグニに付いているカード1枚か下にあるカード1枚をトラッシュ」（`attachedOrUnderTrash`・`WXK10-018-E2`）
 *   ③《ゲーム１回》の記録（`game_actions_done`）＝いまキーには該当が無いが、判定と対で書く
 */
export const performKeyActivated = async (
  cardNum: string,
  effect: CardEffect,
  sel: {
    costIndices: Set<number>;
    discardIndices?: Set<number>;
    /** `trashArtsFromLrigDeck` で捨てるアーツ（ルリグデッキの cardNum）。 */
    artsNums?: string[];
    /** `attachedOrUnderTrash` で置くカード（instanceId）。省略＝左のゾーンから自動（CPU）。 */
    attachedPicks?: string[];
  },
  p: {
    actor: PlayerState; opponent: PlayerState;
    actorId: string;
    actorKey: 'host_state' | 'guest_state';
    /** `buildEnergyPayPool(actor, ...)` の結果（エナ支払い元 funnel）。 */
    energyPayPool: EnergyPayEntry[];
  },
  ctx: PerformCtx,
): Promise<boolean> => {
  const my = p.actor;
  const discardIndices = sel.discardIndices ?? new Set<number>();
  const artsNums = sel.artsNums ?? [];
  // 《コインアイコン》＝足りなければ撃たない（提示ゲートと同じ関数）。
  const coinCost = effectiveCoinCost(effect, my);
  if (coinCost > 0 && (my.coins ?? 0) < coinCost) return false;
  ctx.io.setLoading(true);
  try {
    const keyActPay = planEnergyPayment(my, p.energyPayPool, sel.costIndices);
    const paidNums = keyActPay.paidNums;
    const discardNums = [...discardIndices].map(i => my.hand[i]);
    // 🆕**キー【起】の全捨てコスト**（§5.3 `O-46`）。⚠ここが無いと `WXK04-025-CB-E2`
    //   「このキーを場からルリグトラッシュに置き、エナゾーンにあるすべてのカードをトラッシュに置く：」の
    //   **エナ全損を提示だけして踏み倒せる**。
    // ⚠`energyTrashAll` は**エナ支払い（`costIndices`）の控除後**を対象にする＝`keyActPay.energyAfter`
    //   （シグニ【起】の `performSigniActivated` と同じ funnel の読み方）。
    const keyEnergyTrashAllCards = effect.cost?.energyTrashAll ? [...keyActPay.energyAfter] : [];
    const keyDiscardAllCards = effect.cost?.discardAll ? my.hand.filter((_, i) => !discardIndices.has(i)) : [];
    const newHand = effect.cost?.discardAll ? [] : my.hand.filter((_, i) => !discardIndices.has(i));
    // trash_key: このキーをルリグトラッシュに置く（コスト）
    let newField = my.field;
    let newLrigTrashKey = my.lrig_trash;
    if (effect.cost?.trash_key) {
      // §5.6 `C-9` `R-46`＝枠の見分けは `keyZone.ts` の1本。
      const keyCostRemoval = removeKeyToLrigTrash(my.field, my.lrig_trash, cardNum);
      if (keyCostRemoval.removed) {
        newField = keyCostRemoval.field;
        newLrigTrashKey = keyCostRemoval.lrigTrash;
      }
    }
    // 「ルリグデッキからアーツN枚をルリグトラッシュに置く」（§5.3 `O-68`②・`WXK10-006-E3`）。
    const keyArtsNums = effect.cost?.trashArtsFromLrigDeck ? artsNums : [];
    const newLrigDeckKey = keyArtsNums.length > 0
      ? my.lrig_deck.filter(n => !keyArtsNums.includes(n))
      : my.lrig_deck;
    let paid: PlayerState = keyActPay.applyTo({
      ...my,
      hand: newHand,
      field: newField,
      lrig_deck: newLrigDeckKey,
      lrig_trash: [...newLrigTrashKey, ...keyArtsNums],
      trash: [...my.trash, ...paidNums, ...discardNums, ...keyDiscardAllCards, ...keyEnergyTrashAllCards],
      // ⚠`keyEnergyTrashAllCards` は**エナ**なので台帳に載せない（手札から捨てた分だけ）。
      ...handDiscardHistoryRecord(my, [...discardNums, ...keyDiscardAllCards]),
      actions_done: (effect.usageLimit === 'once_per_turn' || effect.usageLimit === 'twice_per_turn')
        ? [...(my.actions_done ?? []), effect.effectId] : (my.actions_done ?? []),
      ...(effect.usageLimit === 'once_per_game'
        ? { game_actions_done: [...(my.game_actions_done ?? []), effect.effectId] } : {}),
      // 《コインアイコン》（ルリグ【起】の `performLrigActivated` と同じ台帳）。
      ...(coinCost > 0 ? {
        coins: Math.max(0, (my.coins ?? 0) - coinCost),
        coins_paid_this_turn: (my.coins_paid_this_turn ?? 0) + coinCost,
        coin_abilities_used_this_turn: [...(my.coin_abilities_used_this_turn ?? []), ...coinLedger(effect)],
      } : {}),
    });
    // energyTrashAll: エナゾーンを空にする（funnel の index 控除のあとに当てる＝`performSigniActivated` と同じ順）
    if (effect.cost?.energyTrashAll) paid = { ...paid, energy: [] };
    // 「シグニに付いている／下にあるカード」をトラッシュ（シグニ【起】と同じ関数）。
    const aou = effect.cost?.attachedOrUnderTrash;
    if (aou) {
      const picks = sel.attachedPicks ?? attachedOrUnderCostCandidates(paid).slice(0, aou.count);
      const attachedPaid = payAttachedOrUnderTrash(paid, new Set(picks), aou.count);
      if (!attachedPaid) return false;
      paid = { ...attachedPaid.state, last_cost_trashed_cards: [...(paid.last_cost_trashed_cards ?? []), ...attachedPaid.moved] };
    }
    const cardName = ctx.cardMap.get(cardNum)?.CardName ?? cardNum;
    const entries: StackEntry[] = [{
      id: generateUUID(),
      playerId: p.actorId,
      cardNum,
      effectId: effect.effectId,
      label: `${cardName} の【起】効果`,
      effect,
    }];
    // ON_COIN_PAID＝シグニ／ルリグの【起】と同じく、コインを支払ったら反応【自】を積む。
    if (coinCost > 0) {
      const coinRes = pureCollectCoinPaidTriggers(ctx.trigCtx(), p.actorId, paid, p.opponent);
      entries.push(...coinRes.entries);
      if (coinRes.usedIds.length > 0) paid = { ...paid, actions_done: [...(paid.actions_done ?? []), ...coinRes.usedIds] };
    }
    const turnPlayerId = ctx.bs.active_user_id ?? p.actorId;
    const existingStack = ctx.bs?.effect_stack ?? null;
    const newStack = existingStack ? pushToStack(existingStack, entries) : initStack(turnPlayerId, entries);
    await ctx.io.commit(reduceBattle(ctx.bs, { type: 'WRITE_STATE', myKey: p.actorKey, myState: paid, effectStack: newStack, clearPending: true }));
    return true;
  } finally {
    ctx.io.setLoading(false);
  }
};
