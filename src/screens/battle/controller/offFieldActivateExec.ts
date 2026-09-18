import { initStack, pushToStack } from '../../../engine/effectStack';
import { collectCoinPaidTriggers as pureCollectCoinPaidTriggers, collectHandDiscardTriggers as pureCollectHandDiscardTriggers } from '../../../engine/triggerCollect';
import { type PlayerState, type StackEntry } from '../../../types';
import { generateUUID } from '../battleUtils';
import { reduceBattle } from '../controller/battleController';
import { type EnergyPayEntry } from '../energyPaySource';
import { type HandActivateSelections, handActivateVerbLabel, payHandActivateCost } from '../handActivateCost';
import { payTrashActivateCost, trashActivateVerbLabel } from '../trashActivateCost';
import type { PerformCtx } from './performCtx';

/** ON_COIN_PAID の usedIds（《ターン1回/2回》消化）を payer 状態の actions_done へ書き戻す（旧 `BattleScreen` の1行ヘルパ）。 */
const applyCoinPaidUsed = (st: PlayerState, coin: { usedIds: string[] }): PlayerState =>
  coin.usedIds.length > 0 ? { ...st, actions_done: [...(st.actions_done ?? []), ...coin.usedIds] } : st;

/**
 * 🆕**場以外（トラッシュ／手札）の【起】の実行**（§5.7 `S-5c` 第3段・2026-09-18）＝`BattleScreen` から逐語で移設。
 * 人間も CPU も同じ関数を通る（§5.6.3）。⚠**提示の判定は `offFieldActivateGate.ts`／支払いは `*Cost.ts`**＝ここには書かない。
 */
/**
 * 場以外（トラッシュ／手札／エナ）の【起】を撃つ行為者。
 * 🆕§5.7 `S-5c` 第3段（2026-09-18）＝`BattleScreen` から移設。⚠**行為者は必須**（旧実装の「省略＝人間」は
 *   画面側のラッパが `humanOffFieldActor()` を渡す形にした＝ヘッドレスから呼ぶときに人間の state を拾わない）。
 */
export interface OffFieldActor {
  actor: PlayerState; opponent: PlayerState;
  actorId: string; opponentId: string;
  actorKey: 'host_state' | 'guest_state';
  energyPayPool: EnergyPayEntry[];
}

 export const executeHandActivated = async (
  cardNum: string, handIndex: number, effect: import('../../../types/effects').CardEffect, selections: HandActivateSelections,
  actorCtx: OffFieldActor,
  ctx: PerformCtx,
  ui?: { close?: () => void },
) => {
  const { actor: my, opponent: op, actorId, opponentId, actorKey, energyPayPool } = actorCtx;
  ctx.io.setLoading(true);
  ui?.close?.();
  try {
    // 支払いは `payHandActivateCost` 1本（§5.3 `O-533`）＝CPU の先読みと提示判定も同じ関数群を使う。
    //   🔴旧実装はコストに `discardSelfFromHand` が無くても常にこのカードを捨て、`fieldTrash` を払わなかった。
    const payment = payHandActivateCost({
      effect, my, op, cardNum, handIndex, selections, cardMap: ctx.cardMap, energyPool: energyPayPool,
    });
    if (!payment) return; // 支払い不能（UI側でも無効化済み）＝finally で loading を戻す
    const isGameOnce = effect.usageLimit === 'once_per_game';
    let paid: PlayerState = {
      ...payment.my,
      actions_done: [...(my.actions_done ?? []), effect.effectId],
      game_actions_done: isGameOnce ? [...(my.game_actions_done ?? []), effect.effectId] : my.game_actions_done,
    };
    const newOpVirusState = payment.op;
    if (payment.logs.length > 0) ctx.io.appendLogs(payment.logs);
    const cardName = ctx.cardMap.get(cardNum)?.CardName ?? cardNum;
    const entry: StackEntry = {
      id: generateUUID(),
      playerId: actorId,
      cardNum,
      effectId: effect.effectId,
      label: `${cardName}【起】（${handActivateVerbLabel(effect)}）`,
      effect,
    };
    const stackEntries: StackEntry[] = [entry];
    // ON_DISCARDED_AS_COST / ON_HAND_DISCARDED: 自身をコストとして捨てた場合のトリガー
    if (payment.discardedCards.length > 0) {
      const { entries: hdEntries, usedLimitIds } = pureCollectHandDiscardTriggers(ctx.trigCtx(), 
        payment.discardedCards, paid, actorId, true,
        op, opponentId, cardNum, undefined, undefined);
      stackEntries.push(...hdEntries);
      if (usedLimitIds.length > 0) {
        paid = { ...paid, actions_done: [...(paid.actions_done ?? []), ...usedLimitIds] };
      }
    }
    const turnPlayerId = ctx.bs.active_user_id ?? actorId;
    const existingStack = ctx.bs?.effect_stack ?? null;
    const newStack = existingStack
      ? pushToStack(existingStack, stackEntries)
      : initStack(turnPlayerId, stackEntries);
    const stateKey = actorKey;
    const opKey = actorKey === 'host_state' ? 'guest_state' : 'host_state';
    await ctx.io.commit(reduceBattle(ctx.bs, {
      type: 'WRITE_STATE', myKey: stateKey, myState: paid, effectStack: newStack, clearPending: true,
      opp: newOpVirusState ? { key: opKey, state: newOpVirusState } : undefined,
    }));
  } finally {
    ctx.io.setLoading(false);
  }
};

 export const executeTrashActivated = async (
  cardNum: string,
  effect: import('../../../types/effects').CardEffect,
  costIndices: Set<number>,
  discardIndices: Set<number> = new Set(),
  exceedIndices: Set<number> = new Set(),
  trashExileIndices: Set<number> = new Set(),
  /** 🆕§5.7 `S-7`＝行為者（CPU）。省略時は人間（自分）＝従来と同一。 */
  actorCtx: OffFieldActor,
  ctx: PerformCtx,
  ui?: { close?: () => void },
) => {
  const { actor: my, opponent: op, actorId, opponentId, actorKey, energyPayPool } = actorCtx;
  ctx.io.setLoading(true);
  ui?.close?.();
  try {
    const payment = payTrashActivateCost(
      effect, my, op,
      // 🆕§5.3 `O-373`＝`trashExile{count}`（トラッシュの《X》N枚を除外）の選択。
      { energy: costIndices, handDiscard: discardIndices, exceed: exceedIndices, trashExile: trashExileIndices },
      // 🆕**§5.3 `O-262`**＝`cost.trashExile.self`（このカード自身の除外）を払うために効果元を渡す。
      ctx.cardMap, energyPayPool, cardNum,
    );
    if (!payment) return; // 支払い不能（UI側でも無効化済み）
    const isGameOnce = effect.usageLimit === 'once_per_game';
    let paid: PlayerState = {
      ...payment.my,
      actions_done: [...(my.actions_done ?? []), effect.effectId],
      game_actions_done: isGameOnce ? [...(my.game_actions_done ?? []), effect.effectId] : my.game_actions_done,
    };
    const cardName = ctx.cardMap.get(cardNum)?.CardName ?? cardNum;
    const entry: StackEntry = {
      id: generateUUID(),
      playerId: actorId,
      cardNum,
      effectId: effect.effectId,
      label: `${cardName}【起】（${trashActivateVerbLabel(effect)}）`,
      effect,
    };
    const stackEntries: StackEntry[] = [entry];
    // ON_DISCARDED_AS_COST / ON_HAND_DISCARDED: 【起】コストで手札を捨てた場合のトリガー
    if (payment.discardedCards.length > 0) {
      const { entries: hdEntries, usedLimitIds } = pureCollectHandDiscardTriggers(ctx.trigCtx(), 
        payment.discardedCards, paid, actorId, true,
        op, opponentId, cardNum, undefined, undefined);
      stackEntries.push(...hdEntries);
      if (usedLimitIds.length > 0) paid = { ...paid, actions_done: [...(paid.actions_done ?? []), ...usedLimitIds] };
    }
    // ON_COIN_PAID: 《コイン》を支払った場合に反応する【自】を積む（シグニ【起】経路と同型）
    if (payment.coinPaid > 0) {
      const coinTrig = pureCollectCoinPaidTriggers(ctx.trigCtx(), actorId, paid, op);
      stackEntries.push(...coinTrig.entries);
      paid = applyCoinPaidUsed(paid, coinTrig);
    }
    const turnPlayerId = ctx.bs.active_user_id ?? actorId;
    const existingStack = ctx.bs?.effect_stack ?? null;
    const newStack = existingStack
      ? pushToStack(existingStack, stackEntries)
      : initStack(turnPlayerId, stackEntries);
    const stateKey = actorKey;
    const oppStateKey = actorKey === 'host_state' ? 'guest_state' : 'host_state';
    await ctx.io.commit(reduceBattle(ctx.bs, {
      type: 'WRITE_STATE', myKey: stateKey, myState: paid, effectStack: newStack, clearPending: true,
      opp: payment.op ? { key: oppStateKey, state: payment.op } : undefined,
    }));
  } finally {
    ctx.io.setLoading(false);
  }
};
