/**
 * triggerCollect.ts — C1 配線のトリガー収集（pure 関数・Stage2 抽出）
 *
 * BattleScreen.tsx の React クロージャだった collect*Triggers を、依存を ctx で注入する
 * pure 関数として抽出した。これにより golden/fuzz から呼んで C1 配線（ON_TARGETED 発火等）を
 * ヘッドレス自動検証できる（＝実機検証(C2)の宿題を削減）。BattleScreen 側は本関数を呼ぶ薄いラッパに置換。
 *
 * 対象 timing: ON_TARGETED / ON_LRIG_GROW / ON_COIN_PAID（いずれも C1・2026-06-29 配線）。
 */
import type { PlayerState, CardData, StackEntry } from '../types';
import type { CardEffect } from '../types/effects';
import { evalUseCondition, matchesFilter, getCardNum } from './execUtils';

/** トリガー収集の依存（BattleScreen の bs/effectsMap/battleCardMap 等を注入）。 */
export interface TrigCtx {
  hostId: string;
  guestId: string;
  activeUserId: string | null;
  turnPhase: string;
  effectsMap: Map<string, CardEffect[]>;
  cardMap: Map<string, CardData>;
  effectivePowers?: Map<string, number>;
  genId: () => string;
}

const effsOf = (ctx: TrigCtx, n: string): CardEffect[] =>
  ctx.effectsMap.get(n) ?? ctx.effectsMap.get(getCardNum(n)) ?? [];

/**
 * ON_TARGETED（「このシグニが対戦相手の能力か効果の対象になったとき」）のトリガーを収集する。
 * targetedNums=対象に取られたシグニのカード番号群／targetedOwnerId=その所有者（＝効果発生源の対戦相手）。
 *   self（既定）: 対象に取られたシグニ自身が ON_TARGETED を持つ場合
 *   any_ally: watcher 自分側のシグニが対象に取られ triggerFilter（色等）に一致する場合
 *   any_opp/any: 対戦相手側 / いずれか
 * triggerCondition.turnOwner・condition・usageLimit（《ターン1回》）も評価。
 */
export function collectTargetedTriggers(
  ctx: TrigCtx,
  targetedNums: string[],
  targetedOwnerId: string,
  afterHostState: PlayerState,
  afterGuestState: PlayerState,
): StackEntry[] {
  const entries: StackEntry[] = [];
  const targetedSet = new Set(targetedNums);
  for (const watcherIsHost of [true, false]) {
    const watcherId = watcherIsHost ? ctx.hostId : ctx.guestId;
    const watcherState = watcherIsHost ? afterHostState : afterGuestState;
    const otherState = watcherIsHost ? afterGuestState : afterHostState;
    const targetedIsWatcherOwn = targetedOwnerId === watcherId;
    const watcherIsTurn = ctx.activeUserId === watcherId;
    for (const stack of watcherState.field.signi) {
      if (!stack?.length) continue;
      const topNum = stack[stack.length - 1];
      for (const eff of (ctx.effectsMap.get(topNum) ?? [])) {
        if (eff.effectType !== 'AUTO' || !eff.timing?.includes('ON_TARGETED')) continue;
        const scope = eff.triggerScope ?? 'self';
        if (scope === 'self') {
          if (!targetedSet.has(topNum)) continue;
        } else if (scope === 'any_ally') {
          if (!targetedIsWatcherOwn) continue;
          if (eff.triggerFilter && !targetedNums.some(n => matchesFilter(ctx.cardMap.get(getCardNum(n)), eff.triggerFilter))) continue;
        } else if (scope === 'any_opp') {
          if (targetedIsWatcherOwn) continue;
          if (eff.triggerFilter && !targetedNums.some(n => matchesFilter(ctx.cardMap.get(getCardNum(n)), eff.triggerFilter))) continue;
        } // 'any' は無条件
        const to = eff.triggerCondition?.turnOwner;
        if (to === 'self' && !watcherIsTurn) continue;
        if (to === 'opponent' && watcherIsTurn) continue;
        if (eff.condition && !evalUseCondition(eff.condition, watcherState, otherState, ctx.cardMap, topNum, ctx.turnPhase, ctx.effectivePowers)) continue;
        if (eff.usageLimit === 'once_per_turn' && watcherState.actions_done?.includes(eff.effectId)) continue;
        const cardName = ctx.cardMap.get(topNum)?.CardName ?? topNum;
        entries.push({
          id: ctx.genId(),
          playerId: watcherId,
          cardNum: topNum,
          effectId: eff.effectId,
          label: `${cardName} の【自】効果（対象になったとき）`,
          effect: eff,
        });
      }
    }
  }
  return entries;
}

/**
 * ON_LRIG_GROW（「（センター）ルリグがグロウしたとき」）のトリガーを収集する。
 * grownOwnerId=グロウしたプレイヤー（センターグロウの実行者）。両プレイヤーの場（シグニ＋キー＋ルリグ上）から収集。
 *   any_ally: watcher 自分側のルリグがグロウ ／ any_opp: 対戦相手のルリグがグロウ ／ self: グロウ先自身（ON_PLAY 経路で処理）＝除外。
 * triggerCondition.turnOwner・condition・usageLimit（《ターン1回》）も評価。
 */
export function collectLrigGrowTriggers(
  ctx: TrigCtx,
  grownOwnerId: string,
  afterGrowerState: PlayerState,
  afterOpState: PlayerState,
): StackEntry[] {
  const entries: StackEntry[] = [];
  const oppOfGrowerId = grownOwnerId === ctx.hostId ? ctx.guestId : ctx.hostId;
  for (const watcherIsGrower of [true, false]) {
    const watcherId = watcherIsGrower ? grownOwnerId : oppOfGrowerId;
    const watcherState = watcherIsGrower ? afterGrowerState : afterOpState;
    const otherState = watcherIsGrower ? afterOpState : afterGrowerState;
    const watcherIsTurn = ctx.activeUserId === watcherId;
    const watcherCardNums: string[] = [];
    for (const stack of watcherState.field.signi) { if (stack?.length) watcherCardNums.push(stack[stack.length - 1]); }
    if (watcherState.field.key_piece) watcherCardNums.push(watcherState.field.key_piece);
    const lrigTop = watcherState.field.lrig?.at(-1);
    if (lrigTop) watcherCardNums.push(lrigTop);
    for (const topNum of watcherCardNums) {
      for (const eff of effsOf(ctx, topNum)) {
        if (eff.effectType !== 'AUTO' || !eff.timing?.includes('ON_LRIG_GROW')) continue;
        const scope = eff.triggerScope ?? 'self';
        if (scope === 'self') continue;
        if (scope === 'any_ally' && !watcherIsGrower) continue;
        if (scope === 'any_opp' && watcherIsGrower) continue;
        const to = eff.triggerCondition?.turnOwner;
        if (to === 'self' && !watcherIsTurn) continue;
        if (to === 'opponent' && watcherIsTurn) continue;
        if (eff.condition && !evalUseCondition(eff.condition, watcherState, otherState, ctx.cardMap, topNum, ctx.turnPhase, ctx.effectivePowers)) continue;
        if (eff.usageLimit === 'once_per_turn' && watcherState.actions_done?.includes(eff.effectId)) continue;
        const cardName = ctx.cardMap.get(getCardNum(topNum))?.CardName ?? topNum;
        entries.push({
          id: ctx.genId(),
          playerId: watcherId,
          cardNum: topNum,
          effectId: eff.effectId,
          label: `${cardName} の【自】効果（グロウ時）`,
          effect: eff,
        });
      }
    }
  }
  return entries;
}

/**
 * ON_COIN_PAID（「あなたが《コイン》を1枚以上支払ったとき」）のトリガーを収集する。
 * payerId=コインを支払ったプレイヤー。支払い1イベントにつき1回発火（枚数に依らず）。
 *   self（既定・「あなたが」）/any_ally/any＝payer 側で発火。any_opp（相手が支払い）は対象外。
 * triggerCondition.turnOwner・condition・usageLimit（《ターン1回/2回》）も評価。
 */
export function collectCoinPaidTriggers(
  ctx: TrigCtx,
  payerId: string,
  afterPayerState: PlayerState,
  afterOpState: PlayerState,
): StackEntry[] {
  const entries: StackEntry[] = [];
  const payerIsTurn = ctx.activeUserId === payerId;
  for (const stack of afterPayerState.field.signi) {
    if (!stack?.length) continue;
    const topNum = stack[stack.length - 1];
    for (const eff of effsOf(ctx, topNum)) {
      if (eff.effectType !== 'AUTO' || !eff.timing?.includes('ON_COIN_PAID')) continue;
      const scope = eff.triggerScope ?? 'self';
      if (scope === 'any_opp') continue; // 相手支払いは対象外（payer 視点では発火しない）
      const to = eff.triggerCondition?.turnOwner;
      if (to === 'self' && !payerIsTurn) continue;
      if (to === 'opponent' && payerIsTurn) continue;
      if (eff.condition && !evalUseCondition(eff.condition, afterPayerState, afterOpState, ctx.cardMap, topNum, ctx.turnPhase, ctx.effectivePowers)) continue;
      const doneCount = afterPayerState.actions_done?.filter(id => id === eff.effectId).length ?? 0;
      if (eff.usageLimit === 'once_per_turn' && doneCount >= 1) continue;
      if (eff.usageLimit === 'twice_per_turn' && doneCount >= 2) continue;
      const cardName = ctx.cardMap.get(getCardNum(topNum))?.CardName ?? topNum;
      entries.push({
        id: ctx.genId(),
        playerId: payerId,
        cardNum: topNum,
        effectId: eff.effectId,
        label: `${cardName} の【自】効果（コイン支払時）`,
        effect: eff,
      });
    }
  }
  return entries;
}
