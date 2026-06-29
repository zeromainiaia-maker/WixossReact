/**
 * triggerCollect.ts — C1 配線のトリガー収集（pure 関数・Stage2 抽出）
 *
 * BattleScreen.tsx の React クロージャだった collect*Triggers を、依存を ctx で注入する
 * pure 関数として抽出した。これにより golden/fuzz から呼んで C1 配線（ON_TARGETED 発火等）を
 * ヘッドレス自動検証できる（＝実機検証(C2)の宿題を削減）。BattleScreen 側は本関数を呼ぶ薄いラッパに置換。
 *
 * 対象 timing: ON_TARGETED / ON_LRIG_GROW / ON_COIN_PAID（いずれも C1・2026-06-29 配線）
 *           / ON_SIGNI_POWER_ZERO_OR_LESS（R37・Stage2第2弾）/ ON_BLOOD_CRYSTAL_ARMOR（Stage2第3弾）。
 */
import type { PlayerState, CardData, StackEntry } from '../types';
import type { CardEffect, Condition, GrantAcceHostAbilityAction, TargetFilter, PowerModifyAction, AddToFieldAction, StubAction } from '../types/effects';
import { evalUseCondition, matchesFilter, getCardNum } from './execUtils';
import { checkActiveCondition, collectContinuousAbilitiesRemovedSigni } from './effectEngine';

/** トリガー収集の依存（BattleScreen の bs/effectsMap/battleCardMap 等を注入）。 */
export interface TrigCtx {
  hostId: string;
  guestId: string;
  /** 視点プレイヤー（ローカル操作者）の userId。collectBanishTriggers の my/op 分岐で使用。省略時は hostId 視点。 */
  meId?: string;
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

/**
 * ON_SIGNI_POWER_ZERO_OR_LESS（「シグニのパワーが0以下になったとき」）のトリガーを収集する（Stage2 抽出）。
 * zeroedCardNum=パワー0以下になったシグニ／zeroedOwnerId=その所有者。両プレイヤーの場シグニから収集。
 *   any（既定）/any_opp（多数派「対戦相手のシグニが0以下」）/any_ally（自分側）/self（0化シグニ自身）。
 * triggerCondition.turnOwner（WXDi-P14-009「あなたのターンの間」）・usageLimit（《ターン1回》）も評価。
 */
export function collectPowerZeroTriggers(
  ctx: TrigCtx,
  zeroedCardNum: string,
  zeroedOwnerId: string,
  afterHostState: PlayerState,
  afterGuestState: PlayerState,
): StackEntry[] {
  const entries: StackEntry[] = [];
  for (const watcherIsHost of [true, false]) {
    const watcherId = watcherIsHost ? ctx.hostId : ctx.guestId;
    const watcherState = watcherIsHost ? afterHostState : afterGuestState;
    const zeroedIsWatcherOwn = zeroedOwnerId === watcherId;
    const watcherIsTurn = ctx.activeUserId === watcherId;
    for (const stack of watcherState.field.signi) {
      if (!stack?.length) continue;
      const topNum = stack[stack.length - 1];
      for (const eff of (ctx.effectsMap.get(topNum) ?? [])) {
        if (eff.effectType !== 'AUTO' || !eff.timing?.includes('ON_SIGNI_POWER_ZERO_OR_LESS')) continue;
        const scope = eff.triggerScope ?? 'any';
        if (scope === 'self' && topNum !== zeroedCardNum) continue;
        if (scope === 'any_ally' && !zeroedIsWatcherOwn) continue;
        if (scope === 'any_opp' && zeroedIsWatcherOwn) continue;
        const to = eff.triggerCondition?.turnOwner;
        if (to === 'self' && !watcherIsTurn) continue;
        if (to === 'opponent' && watcherIsTurn) continue;
        if (eff.usageLimit === 'once_per_turn' && watcherState.actions_done?.includes(eff.effectId)) continue;
        const cardName = ctx.cardMap.get(topNum)?.CardName ?? topNum;
        entries.push({
          id: ctx.genId(),
          playerId: watcherId,
          cardNum: topNum,
          effectId: eff.effectId,
          label: `${cardName} の【自】効果（パワー0以下時）`,
          effect: eff,
        });
      }
    }
  }
  return entries;
}

/**
 * ON_BLOOD_CRYSTAL_ARMOR（「血晶武装したとき」）のトリガーを収集する（Stage2 抽出）。
 * armoredCardNum=血晶武装したシグニ／armoredPlayerId=その所有者。所有者の場のみ走査。
 *   self（既定）: 血晶武装したシグニ自身（ラベルは「【血晶武装時】効果」）
 *   any_ally/any: 同じ所有者の場シグニが反応
 */
export function collectArmorTriggers(
  ctx: TrigCtx,
  armoredCardNum: string,
  armoredPlayerId: string,
  afterHostState: PlayerState,
  afterGuestState: PlayerState,
): StackEntry[] {
  const entries: StackEntry[] = [];
  const ownerStateAfter = armoredPlayerId === ctx.hostId ? afterHostState : afterGuestState;
  // このシグニ自身の ON_BLOOD_CRYSTAL_ARMOR (scope=self)
  for (const eff of (ctx.effectsMap.get(armoredCardNum) ?? [])) {
    if (eff.effectType !== 'AUTO' || !eff.timing?.includes('ON_BLOOD_CRYSTAL_ARMOR')) continue;
    const scope = eff.triggerScope ?? 'self';
    if (scope !== 'self') continue;
    entries.push({
      id: ctx.genId(),
      playerId: armoredPlayerId,
      cardNum: armoredCardNum,
      effectId: eff.effectId,
      label: `${ctx.cardMap.get(armoredCardNum)?.CardName ?? armoredCardNum} の【血晶武装時】効果`,
      effect: eff,
    });
  }
  // フィールド上の全シグニの ON_BLOOD_CRYSTAL_ARMOR (scope=any_ally)
  for (const stack of ownerStateAfter.field.signi) {
    if (!stack?.length) continue;
    const topNum = stack[stack.length - 1];
    for (const eff of (ctx.effectsMap.get(topNum) ?? [])) {
      if (eff.effectType !== 'AUTO' || !eff.timing?.includes('ON_BLOOD_CRYSTAL_ARMOR')) continue;
      const scope = eff.triggerScope ?? 'self';
      if (scope !== 'any_ally' && scope !== 'any') continue;
      entries.push({
        id: ctx.genId(),
        playerId: armoredPlayerId,
        cardNum: topNum,
        effectId: eff.effectId,
        label: `${ctx.cardMap.get(topNum)?.CardName ?? topNum} の【自】効果（血晶武装時）`,
        effect: eff,
      });
    }
  }
  return entries;
}

// 条件ツリーに IS_MY_TURN / IS_OPPONENT_TURN が含まれるか（evalCondition では IS_MY_TURN が常時true のため明示判定）。
const condHas = (c: Condition | undefined, t: string): boolean =>
  !!c && (c.type === t || (c.type === 'AND' && (c.conditions ?? []).some(cc => condHas(cc, t))));

/**
 * デッキからトラッシュに置かれたカード自身の ON_TRASH（triggerScope:self のみ）を収集する（Stage2 抽出）。
 * 場のシグニ用フィールドトリガー（any_ally等）はデッキミルでは発火しないため除外する。
 */
export function collectDeckTrashSelfTriggers(
  ctx: TrigCtx, trashedCardNum: string, trashedPlayerId: string, causeByOpponent = false,
): StackEntry[] {
  const entries: StackEntry[] = [];
  for (const eff of (ctx.effectsMap.get(trashedCardNum) ?? [])) {
    if (eff.effectType !== 'AUTO' || !eff.timing?.includes('ON_TRASH')) continue;
    if ((eff.triggerScope ?? 'self') !== 'self') continue;
    if (eff.triggerCondition?.byOpponentEffect && !causeByOpponent) continue;
    // fromZones 指定があり 'deck' を含まない場合はデッキからでは発火しない
    if (eff.triggerCondition?.fromZones && !eff.triggerCondition.fromZones.includes('deck')) continue;
    const cardName = ctx.cardMap.get(trashedCardNum)?.CardName ?? trashedCardNum;
    entries.push({
      id: ctx.genId(), playerId: trashedPlayerId, cardNum: trashedCardNum, effectId: eff.effectId,
      label: `${cardName} の【トラッシュ時】効果（デッキから）`, effect: eff,
    });
  }
  return entries;
}

/**
 * 手札・エナゾーンからトラッシュに置かれたカード自身の ON_TRASH（triggerScope:self かつ fromAnyZone）を収集する（Stage2 抽出）。
 * 「いずれかの領域からトラッシュに置かれたとき」（WX04-035-E2）のうち、場/デッキ以外（手札・エナ）の経路を補う。
 */
export function collectAnyZoneTrashSelfTriggers(
  ctx: TrigCtx, trashedCardNum: string, trashedPlayerId: string, causeByOpponent = false, origin: 'hand' | 'energy' = 'hand',
): StackEntry[] {
  const entries: StackEntry[] = [];
  for (const eff of (ctx.effectsMap.get(trashedCardNum) ?? [])) {
    if (eff.effectType !== 'AUTO' || !eff.timing?.includes('ON_TRASH')) continue;
    if ((eff.triggerScope ?? 'self') !== 'self') continue;
    // 場/デッキ以外（手札・エナ）は fromAnyZone 指定、または fromZones が当該領域を含む効果のみ
    const fromZones = eff.triggerCondition?.fromZones;
    const okByZones = fromZones ? fromZones.includes(origin) : !!eff.triggerCondition?.fromAnyZone;
    if (!okByZones) continue;
    if (eff.triggerCondition?.byOpponentEffect && !causeByOpponent) continue;
    const cardName = ctx.cardMap.get(trashedCardNum)?.CardName ?? trashedCardNum;
    entries.push({
      id: ctx.genId(), playerId: trashedPlayerId, cardNum: trashedCardNum, effectId: eff.effectId,
      label: `${cardName} の【トラッシュ時】効果（手札／エナから）`, effect: eff,
    });
  }
  return entries;
}

/**
 * ON_TRASH トリガーを収集する（Stage2 抽出。「場から」トラッシュ＝field origin が主経路）。
 * causeByOpponent: このトラッシュが対戦相手の効果によるものか（byOpponentEffect ゲート用）。
 * byCostOrEffect: このトラッシュがコストか効果によるものか（fromFieldByCostOrEffect ゲート用。G204）。
 */
export function collectTrashTriggers(
  ctx: TrigCtx,
  trashedCardNum: string,
  trashedPlayerId: string,
  afterHostState: PlayerState,
  afterGuestState: PlayerState,
  causeByOpponent = false,
  byCostOrEffect = true,
): StackEntry[] {
  const entries: StackEntry[] = [];
  // トラッシュに置かれたカード自身の ON_TRASH 効果（このパスは「場から」トラッシュ＝field origin）
  for (const eff of (ctx.effectsMap.get(trashedCardNum) ?? [])) {
    if (eff.effectType !== 'AUTO' || !eff.timing?.includes('ON_TRASH')) continue;
    // 「対戦相手の効果によって」限定トリガーは対戦相手効果が原因のときのみ発火（WX04-035-E2）
    if (eff.triggerCondition?.byOpponentEffect && !causeByOpponent) continue;
    // 「コストか効果によって場から」限定トリガーはコスト/効果起因のときのみ発火（バトル・ルール処理では発火しない。G204）
    if (eff.triggerCondition?.fromFieldByCostOrEffect && !byCostOrEffect) continue;
    // fromZones 指定があり 'field' を含まない場合は「場から」では発火しない（WX04-102「手札かデッキから」）
    if (eff.triggerCondition?.fromZones && !eff.triggerCondition.fromZones.includes('field')) continue;
    // レゾナの出現条件の支払いとしてトラッシュされた場合のみ発火（WX10-055等）。通常のトラッシュでは発火しない
    if (eff.triggerCondition?.forResonaCondition) continue;
    const cardName = ctx.cardMap.get(trashedCardNum)?.CardName ?? trashedCardNum;
    entries.push({
      id: ctx.genId(), playerId: trashedPlayerId, cardNum: trashedCardNum, effectId: eff.effectId,
      label: `${cardName} の【トラッシュ時】効果`, effect: eff,
    });
  }
  // フィールド上シグニのON_TRASHフィールドトリガー（ally_banished等）
  const ownerState = trashedPlayerId === ctx.hostId ? afterHostState : afterGuestState;
  for (const stack of ownerState.field.signi) {
    if (!stack?.length) continue;
    const topNum = stack[stack.length - 1];
    for (const eff of (ctx.effectsMap.get(topNum) ?? [])) {
      if (eff.effectType !== 'AUTO' || !eff.timing?.includes('ON_TRASH')) continue;
      if (eff.triggerCondition?.byOpponentEffect && !causeByOpponent) continue;
      const scope = eff.triggerScope ?? 'self';
      if (scope !== 'any_ally' && scope !== 'any') continue;
      entries.push({
        id: ctx.genId(), playerId: trashedPlayerId, cardNum: topNum, effectId: eff.effectId,
        label: `${ctx.cardMap.get(topNum)?.CardName ?? topNum} の【自】効果（シグニトラッシュ時）`, effect: eff,
      });
    }
  }
  // 対戦相手のシグニがトラッシュに置かれたのを監視する any_opp トリガー（トラッシュされたカードの対戦相手フィールド）。
  // 例: WX04-037-E2「あなたのターンの間、対戦相手のシグニ1体が場からトラッシュに置かれたとき」。
  const watcherPlayerId = trashedPlayerId === ctx.hostId ? ctx.guestId : ctx.hostId;
  const watcherState = trashedPlayerId === ctx.hostId ? afterGuestState : afterHostState;
  const watcherOppState = ownerState; // = トラッシュされたカードのオーナー状態
  const watcherIsTurnPlayer = ctx.activeUserId === watcherPlayerId;
  for (const stack of watcherState.field.signi) {
    if (!stack?.length) continue;
    const topNum = stack[stack.length - 1];
    for (const eff of (ctx.effectsMap.get(topNum) ?? [])) {
      if (eff.effectType !== 'AUTO' || !eff.timing?.includes('ON_TRASH')) continue;
      if (eff.triggerCondition?.byOpponentEffect && !causeByOpponent) continue;
      const scope = eff.triggerScope ?? 'self';
      if (scope !== 'any_opp') continue; // 'any' は既存の自分側ループで収集済み
      // 「あなたのターンの間」: IS_MY_TURN 指定があれば watcher がターンプレイヤーのときのみ
      if (condHas(eff.condition, 'IS_MY_TURN') && !watcherIsTurnPlayer) continue;
      if (condHas(eff.condition, 'IS_OPPONENT_TURN') && watcherIsTurnPlayer) continue;
      // ターン条件以外の condition を評価
      if (eff.condition && !evalUseCondition(eff.condition, watcherState, watcherOppState, ctx.cardMap, topNum, ctx.turnPhase ?? '')) continue;
      entries.push({
        id: ctx.genId(), playerId: watcherPlayerId, cardNum: topNum, effectId: eff.effectId,
        label: `${ctx.cardMap.get(topNum)?.CardName ?? topNum} の【自】効果（対戦相手シグニのトラッシュ時）`, effect: eff,
      });
    }
  }
  return entries;
}

/**
 * バニッシュされたシグニの ON_BANISH 効果 + フィールド上の全シグニのトリガーを収集する（Stage2 抽出）。
 * banishedPlayerId: バニッシュされたシグニのオーナーの userId。
 * prevOwnerState: バニッシュされたカードのオーナーのバニッシュ前状態（アクセ付与ON_BANISH復元用）。
 * ctx.meId（視点プレイヤー）で my/op を確定し、エントリ順（自分側→相手側）を BattleScreen 版と一致させる。
 */
export function collectBanishTriggers(
  ctx: TrigCtx,
  banishedCardNum: string,
  banishedPlayerId: string,
  afterHostState: PlayerState,
  afterGuestState: PlayerState,
  prevOwnerState?: PlayerState,
): StackEntry[] {
  const entries: StackEntry[] = [];
  const meId = ctx.meId ?? ctx.hostId;
  const isHost = meId === ctx.hostId;
  const opId = isHost ? ctx.guestId : ctx.hostId;
  const myAfterState = isHost ? afterHostState : afterGuestState;
  const opAfterState = isHost ? afterGuestState : afterHostState;
  const banishedOwnerIsMe = banishedPlayerId === meId;

  // 0. アクセ付与の ON_BANISH 能力を復元（WX18-076: 離場で消えるため前状態から再構築）
  if (prevOwnerState) {
    const zi = prevOwnerState.field.signi.findIndex(s => s?.at(-1) === banishedCardNum);
    const acceNum = zi >= 0 ? (prevOwnerState.field.signi_acce ?? [])[zi] : null;
    if (acceNum) {
      const ownerAfter = banishedOwnerIsMe ? myAfterState : opAfterState;
      const otherAfter = banishedOwnerIsMe ? opAfterState : myAfterState;
      const hostCard = ctx.cardMap.get(getCardNum(banishedCardNum));
      const isBanishedOwnerTurn = ctx.activeUserId === banishedPlayerId;
      for (const eff of (ctx.effectsMap.get(acceNum) ?? [])) {
        if (eff.effectType !== 'CONTINUOUS' || eff.action.type !== 'GRANT_ACCE_HOST_ABILITY') continue;
        const g = eff.action as GrantAcceHostAbilityAction;
        if (g.filter && !matchesFilter(hostCard, g.filter)) continue;
        for (const ab of g.abilities) {
          if (ab.effectType !== 'AUTO' || !ab.timing?.includes('ON_BANISH')) continue;
          if (ab.activeCondition && !checkActiveCondition(ab.activeCondition, ownerAfter, otherAfter, isBanishedOwnerTurn, ctx.cardMap, banishedCardNum)) continue;
          const frontNum = otherAfter.field.signi[2 - zi]?.at(-1); // 正面（前ゾーン 2-zi）の相手シグニ
          entries.push({
            id: ctx.genId(), playerId: banishedPlayerId, cardNum: banishedCardNum, effectId: ab.effectId,
            label: `${hostCard?.CardName ?? banishedCardNum} の付与【自】（バニッシュ時）`, effect: ab, triggeringCardNum: frontNum,
          });
        }
      }
    }
  }

  // 1. バニッシュされたカード自身の ON_BANISH 効果
  for (const eff of (ctx.effectsMap.get(banishedCardNum) ?? [])) {
    if (eff.effectType !== 'AUTO' || !eff.timing?.includes('ON_BANISH')) continue;
    if ((eff.triggerScope ?? 'self') !== 'self') continue;
    // activeCondition チェック（「対戦相手のターンの間」等）
    const isBanishedOwnerTurn = ctx.activeUserId === banishedPlayerId;
    if (!checkActiveCondition(eff.activeCondition, banishedOwnerIsMe ? myAfterState : opAfterState, banishedOwnerIsMe ? opAfterState : myAfterState, isBanishedOwnerTurn, ctx.cardMap, banishedCardNum)) continue;
    const cardName = ctx.cardMap.get(banishedCardNum)?.CardName ?? banishedCardNum;
    entries.push({
      id: ctx.genId(), playerId: banishedPlayerId, cardNum: banishedCardNum, effectId: eff.effectId,
      label: `${cardName} の【バニッシュ時】効果`, effect: eff,
    });
  }

  // 2. 自分フィールド上シグニのトリガー
  for (const stack of myAfterState.field.signi) {
    if (!stack?.length) continue;
    const topNum = stack[stack.length - 1];
    for (const eff of (ctx.effectsMap.get(topNum) ?? [])) {
      if (eff.effectType !== 'AUTO' || !eff.timing?.includes('ON_BANISH')) continue;
      const scope = eff.triggerScope ?? 'self';
      if (banishedOwnerIsMe  && scope !== 'any_ally' && scope !== 'any') continue;
      if (!banishedOwnerIsMe && scope !== 'any_opp'  && scope !== 'any') continue;
      // condition を持つAUTOは条件を満たす場合のみ収集（WXDi-P16-074-E2 の FIELD_HAS_GATE 等）
      if (eff.condition && !evalUseCondition(eff.condition, myAfterState, opAfterState, ctx.cardMap, topNum, ctx.turnPhase, ctx.effectivePowers)) continue;
      // usageLimit once_per_turn: actions_done に記録済みならスキップ（実行時に永続化される）
      if (eff.usageLimit === 'once_per_turn' && myAfterState.actions_done?.includes(eff.effectId)) continue;
      const cardName = ctx.cardMap.get(topNum)?.CardName ?? topNum;
      entries.push({
        id: ctx.genId(), playerId: meId, cardNum: topNum, effectId: eff.effectId,
        label: `${cardName} の【自】効果（バニッシュ時）`, effect: eff,
      });
    }
  }

  // 3. 相手フィールド上シグニのトリガー
  for (const stack of opAfterState.field.signi) {
    if (!stack?.length) continue;
    const topNum = stack[stack.length - 1];
    for (const eff of (ctx.effectsMap.get(topNum) ?? [])) {
      if (eff.effectType !== 'AUTO' || !eff.timing?.includes('ON_BANISH')) continue;
      const scope = eff.triggerScope ?? 'self';
      // 相手視点：「自分の味方がバニッシュ」= !banishedOwnerIsMe
      if (!banishedOwnerIsMe && scope !== 'any_ally' && scope !== 'any') continue;
      if (banishedOwnerIsMe  && scope !== 'any_opp'  && scope !== 'any') continue;
      // condition / usageLimit（相手＝opAfterState 視点で評価）
      if (eff.condition && !evalUseCondition(eff.condition, opAfterState, myAfterState, ctx.cardMap, topNum, ctx.turnPhase, ctx.effectivePowers)) continue;
      if (eff.usageLimit === 'once_per_turn' && opAfterState.actions_done?.includes(eff.effectId)) continue;
      const cardName = ctx.cardMap.get(topNum)?.CardName ?? topNum;
      entries.push({
        id: ctx.genId(), playerId: opId, cardNum: topNum, effectId: eff.effectId,
        label: `${cardName} の【自】効果（バニッシュ時）`, effect: eff,
      });
    }
  }

  return entries;
}

/**
 * ON_LEAVE_FIELD効果内の動的フィルタを、場を離れたカードの具体値に解決した複製を返す（Stage2 抽出）。
 *  levelBelowLeftCard → level:{max: 離れたカードのレベル-1}
 *  powerBelowLeftCard → powerRange:{max: 離れたカードのパワー-1}
 *  underLeftCard → cardNames:[下にあった《ライズアイコン》を持たないシグニ名]（該当なしなら空＝候補なし）
 */
export function resolveLeaveFieldDynamicFilters(
  cardMap: Map<string, CardData>,
  eff: CardEffect,
  leftCard: CardData | undefined,
  underCards: string[],
): CardEffect {
  if (!/"(levelBelowLeftCard|powerBelowLeftCard|underLeftCard)":true/.test(JSON.stringify(eff.action))) return eff;
  const clone = JSON.parse(JSON.stringify(eff)) as CardEffect;
  const leftLevel = parseInt(leftCard?.Level ?? '', 10);
  const leftPower = parseInt((leftCard?.Power ?? '').replace(/[^\d]/g, ''), 10);
  const underNames = underCards
    .map(n => cardMap.get(getCardNum(n)))
    .filter((c): c is CardData => !!c && !(c.EffectText ?? '').includes('【ライズ】'))
    .map(c => c.CardName);
  const visit = (node: unknown): void => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) { node.forEach(visit); return; }
    const obj = node as Record<string, unknown> & TargetFilter;
    if (obj.levelBelowLeftCard === true) {
      delete obj.levelBelowLeftCard;
      obj.level = { max: isNaN(leftLevel) ? 0 : leftLevel - 1 };
    }
    if (obj.powerBelowLeftCard === true) {
      delete obj.powerBelowLeftCard;
      obj.powerRange = { max: isNaN(leftPower) ? 0 : leftPower - 1 };
    }
    if (obj.underLeftCard === true) {
      delete obj.underLeftCard;
      obj.cardNames = underNames;
    }
    Object.values(obj).forEach(visit);
  };
  visit(clone.action);
  return clone;
}

/**
 * ON_LEAVE_FIELD トリガーを収集する（Stage2 抽出）。
 * 離れたカード自身の効果（scope=self）と、場の味方シグニ＋ルリグの効果（scope=any_ally。
 * triggerFilter があれば離れたカードがそれを満たす場合のみ）を集める。
 * leftUnder=離れたカードの下にあったカード（動的フィルタ解決用）。
 */
export function collectLeaveFieldTriggers(
  ctx: TrigCtx,
  leftCardNum: string,
  leftUnder: string[],
  leftPlayerId: string,
  afterHostState: PlayerState,
  afterGuestState: PlayerState,
): StackEntry[] {
  const entries: StackEntry[] = [];
  const leftCard = ctx.cardMap.get(getCardNum(leftCardNum));
  for (const eff of (ctx.effectsMap.get(getCardNum(leftCardNum)) ?? [])) {
    if (eff.effectType !== 'AUTO' || !eff.timing?.includes('ON_LEAVE_FIELD')) continue;
    if ((eff.triggerScope ?? 'self') !== 'self') continue;
    entries.push({
      id: ctx.genId(), playerId: leftPlayerId, cardNum: leftCardNum, effectId: eff.effectId,
      label: `${leftCard?.CardName ?? leftCardNum} の【自】効果（場を離れたとき）`,
      effect: resolveLeaveFieldDynamicFilters(ctx.cardMap, eff, leftCard, leftUnder),
    });
  }
  const ownerStateAfter = leftPlayerId === ctx.hostId ? afterHostState : afterGuestState;
  // 場のシグニに加えてルリグも監視対象（例: 炎・花代・伍はルリグの【自】で味方シグニの離脱を見る）
  const lrigTop = ownerStateAfter.field.lrig.at(-1);
  const watcherNums = [
    ...ownerStateAfter.field.signi.flatMap(stack => stack?.length ? [stack[stack.length - 1]] : []),
    ...(lrigTop ? [lrigTop] : []),
  ];
  for (const topNum of watcherNums) {
    for (const eff of (ctx.effectsMap.get(getCardNum(topNum)) ?? [])) {
      if (eff.effectType !== 'AUTO' || !eff.timing?.includes('ON_LEAVE_FIELD')) continue;
      const scope = eff.triggerScope ?? 'self';
      if (scope !== 'any_ally' && scope !== 'any') continue;
      if (eff.triggerFilter && !matchesFilter(leftCard, eff.triggerFilter)) continue;
      // leftToZone:'hand'（「場から手札に戻ったとき」WXK02-041）: 離れたカードが所有者の手札に在中する場合のみ発火
      if (eff.triggerCondition?.leftToZone === 'hand' && !ownerStateAfter.hand.includes(leftCardNum)) continue;
      entries.push({
        id: ctx.genId(), playerId: leftPlayerId, cardNum: topNum, effectId: eff.effectId,
        label: `${ctx.cardMap.get(getCardNum(topNum))?.CardName ?? topNum} の【自】効果（味方が場を離れたとき）`,
        effect: resolveLeaveFieldDynamicFilters(ctx.cardMap, eff, leftCard, leftUnder),
      });
    }
  }
  return entries;
}

/** usageLimit（once/twice_per_turn）チェッカ。actionsDone（永続）＋used（今回の収集内）の出現回数で判定し、許可時は used に積む。 */
function mkLimitOk(actionsDone: string[] | undefined, used: string[]) {
  return (eff: CardEffect): boolean => {
    if (eff.usageLimit !== 'once_per_turn' && eff.usageLimit !== 'twice_per_turn') return true;
    const max = eff.usageLimit === 'once_per_turn' ? 1 : 2;
    const n = (actionsDone ?? []).filter(id => id === eff.effectId).length + used.filter(id => id === eff.effectId).length;
    if (n >= max) return false;
    used.push(eff.effectId);
    return true;
  };
}

/** 自分の場のシグニ（各ゾーン top）＋ルリグ top を発動元候補として返す。 */
function ownFieldSources(state: PlayerState): string[] {
  return [
    ...state.field.signi.flatMap(s => (s?.at(-1) ? [s.at(-1)!] : [])),
    ...(state.field.lrig.at(-1) ? [state.field.lrig.at(-1)!] : []),
  ];
}

/**
 * ON_DRAW（「カードを引いたとき」）の自分側トリガー（triggerScope:self）を収集する（Stage2 抽出）。
 * drawBySourceStory（原因が指定storyシグニの効果）・outsideDrawPhase（通常ドローで非発火）ゲートを評価。
 * 戻り値の usedOncePerTurnIds は呼び出し側で actions_done に反映する想定。
 */
export function collectDrawTriggers(
  ctx: TrigCtx,
  drawerId: string,
  drawerState: PlayerState,
  otherState: PlayerState,
  isDrawPhaseDraw = false,
): { entries: StackEntry[]; usedOncePerTurnIds: string[] } {
  const entries: StackEntry[] = [];
  const usedOncePerTurnIds: string[] = [];
  const isDrawerTurn = drawerId === ctx.activeUserId;
  const limitOk = mkLimitOk(drawerState.actions_done, usedOncePerTurnIds);
  const removed = collectContinuousAbilitiesRemovedSigni(drawerState, otherState, isDrawerTurn, ctx.effectsMap, ctx.cardMap);
  const ownAutoBlocked = drawerState.blocked_actions?.includes('BLOCK_OWN_SIGNI_AUTO');
  for (const topNum of ownFieldSources(drawerState)) {
    if (ownAutoBlocked) continue;
    if (removed.has(topNum)) continue;
    for (const eff of (ctx.effectsMap.get(topNum) ?? [])) {
      if (eff.effectType !== 'AUTO' || !eff.timing?.includes('ON_DRAW')) continue;
      if ((eff.triggerScope ?? 'self') !== 'self') continue;
      // drawBySourceStory: このドローの原因が指定＜story＞シグニの効果である場合のみ発火（WX20-026-E3）。
      if (eff.triggerCondition?.drawBySourceStory) {
        const srcNum = drawerState.last_effect_draw_source;
        const srcCard = srcNum ? ctx.cardMap.get(srcNum) : undefined;
        if (!srcCard || srcCard.Type !== 'シグニ') continue;
        if (!(srcCard.CardClass ?? '').includes(eff.triggerCondition.drawBySourceStory)) continue;
      }
      // outsideDrawPhase: ドローフェイズの通常ドローでは発火しない（効果ドローのみ・WXDi-D09-P19 等）。
      if (eff.triggerCondition?.outsideDrawPhase && isDrawPhaseDraw) continue;
      if (eff.activeCondition && !checkActiveCondition(eff.activeCondition, drawerState, otherState, isDrawerTurn, ctx.cardMap, topNum)) continue;
      if (eff.condition && !evalUseCondition(eff.condition, drawerState, otherState, ctx.cardMap, topNum, ctx.turnPhase, ctx.effectivePowers)) continue;
      if (!limitOk(eff)) continue;
      const cardName = ctx.cardMap.get(topNum)?.CardName ?? topNum;
      entries.push({
        id: ctx.genId(), playerId: drawerId, cardNum: topNum, effectId: eff.effectId,
        label: `${cardName} の【自】効果（ドロー時）`, effect: eff,
      });
    }
  }
  return { entries, usedOncePerTurnIds };
}

/**
 * 対戦相手が（効果で）引いたとき（ON_DRAW triggerScope:any_opp）の反応側トリガーを収集する（Stage2 抽出）。
 * drawPhaseRestriction（main_attack/opp_attack）で位相を、turnOwner も評価。
 */
export function collectOppDrawTriggers(
  ctx: TrigCtx,
  reactorId: string,
  reactorState: PlayerState,
  drawerState: PlayerState,
): { entries: StackEntry[]; usedOncePerTurnIds: string[] } {
  const entries: StackEntry[] = [];
  const usedOncePerTurnIds: string[] = [];
  const reactorIsTurn = reactorId === ctx.activeUserId;
  const ATTACK_PHASES = ['ATTACK_SIGNI', 'ATTACK_ARTS', 'ATTACK_ARTS_OP', 'ATTACK_LRIG'];
  const phase = ctx.turnPhase ?? '';
  const limitOk = mkLimitOk(reactorState.actions_done, usedOncePerTurnIds);
  const removed = collectContinuousAbilitiesRemovedSigni(reactorState, drawerState, reactorIsTurn, ctx.effectsMap, ctx.cardMap);
  const ownAutoBlocked = reactorState.blocked_actions?.includes('BLOCK_OWN_SIGNI_AUTO');
  for (const topNum of ownFieldSources(reactorState)) {
    if (ownAutoBlocked) continue;
    if (removed.has(topNum)) continue;
    for (const eff of (ctx.effectsMap.get(topNum) ?? [])) {
      if (eff.effectType !== 'AUTO' || !eff.timing?.includes('ON_DRAW')) continue;
      if (eff.triggerScope !== 'any_opp') continue;
      const pr = eff.triggerCondition?.drawPhaseRestriction;
      if (pr === 'main_attack' && !(phase === 'MAIN' || ATTACK_PHASES.includes(phase))) continue;
      if (pr === 'opp_attack' && !(ATTACK_PHASES.includes(phase) && !reactorIsTurn)) continue;
      const to = eff.triggerCondition?.turnOwner;
      if (to === 'self' && !reactorIsTurn) continue;
      if (to === 'opponent' && reactorIsTurn) continue;
      if (eff.activeCondition && !checkActiveCondition(eff.activeCondition, reactorState, drawerState, reactorIsTurn, ctx.cardMap, topNum)) continue;
      if (eff.condition && !evalUseCondition(eff.condition, reactorState, drawerState, ctx.cardMap, topNum, phase, ctx.effectivePowers)) continue;
      if (!limitOk(eff)) continue;
      const cardName = ctx.cardMap.get(topNum)?.CardName ?? topNum;
      entries.push({
        id: ctx.genId(), playerId: reactorId, cardNum: topNum, effectId: eff.effectId,
        label: `${cardName} の【自】効果（対戦相手ドロー時）`, effect: eff,
      });
    }
  }
  return { entries, usedOncePerTurnIds };
}

/**
 * デッキ→トラッシュ（ミル・ON_CARD_MILLED_FROM_DECK）トリガーを収集する（Stage2 抽出）。
 * milledDeckOwner（self/opponent/any）で発生源デッキを、milledMinCount でその解決単位の最低ミル枚数を判定。
 */
export function collectMillTriggers(
  ctx: TrigCtx,
  controllerId: string,
  controllerState: PlayerState,
  otherState: PlayerState,
  milledFromControllerDeck: number,
  milledFromOppDeck: number,
): { entries: StackEntry[]; usedOncePerTurnIds: string[] } {
  const entries: StackEntry[] = [];
  const usedOncePerTurnIds: string[] = [];
  const isControllerTurn = controllerId === ctx.activeUserId;
  const limitOk = mkLimitOk(controllerState.actions_done, usedOncePerTurnIds);
  const removed = collectContinuousAbilitiesRemovedSigni(controllerState, otherState, isControllerTurn, ctx.effectsMap, ctx.cardMap);
  const ownAutoBlocked = controllerState.blocked_actions?.includes('BLOCK_OWN_SIGNI_AUTO');
  for (const topNum of ownFieldSources(controllerState)) {
    if (ownAutoBlocked) continue;
    if (removed.has(topNum)) continue;
    for (const eff of (ctx.effectsMap.get(topNum) ?? [])) {
      if (eff.effectType !== 'AUTO' || !eff.timing?.includes('ON_CARD_MILLED_FROM_DECK')) continue;
      if ((eff.triggerScope ?? 'self') !== 'self') continue;
      const owner = eff.triggerCondition?.milledDeckOwner ?? 'any';
      const minCount = eff.triggerCondition?.milledMinCount ?? 1;
      const relevant = owner === 'self' ? milledFromControllerDeck
        : owner === 'opponent' ? milledFromOppDeck
        : milledFromControllerDeck + milledFromOppDeck;
      if (relevant < minCount) continue;
      if (eff.activeCondition && !checkActiveCondition(eff.activeCondition, controllerState, otherState, isControllerTurn, ctx.cardMap, topNum)) continue;
      if (eff.condition && !evalUseCondition(eff.condition, controllerState, otherState, ctx.cardMap, topNum, ctx.turnPhase, ctx.effectivePowers)) continue;
      if (!limitOk(eff)) continue;
      const cardName = ctx.cardMap.get(topNum)?.CardName ?? topNum;
      entries.push({
        id: ctx.genId(), playerId: controllerId, cardNum: topNum, effectId: eff.effectId,
        label: `${cardName} の【自】効果（デッキトラッシュ時）`, effect: eff,
      });
    }
  }
  return { entries, usedOncePerTurnIds };
}

/**
 * 【チャーム】がトラッシュに置かれたとき（ON_CHARM_TO_TRASH）トリガーを収集する（Stage2 抽出）。
 * triggerScope（any=どちらの／any_ally=自分の／any_opp=相手の チャーム）で発生源を判定。
 * ⚠ 近似：同一解決で複数チャームがトラッシュに置かれても1回のみ発火。
 */
export function collectCharmToTrashTriggers(
  ctx: TrigCtx, controllerId: string, controllerState: PlayerState, otherState: PlayerState,
  charmsFromControllerField: number, charmsFromOppField: number,
): { entries: StackEntry[]; usedOncePerTurnIds: string[] } {
  const entries: StackEntry[] = [];
  const usedOncePerTurnIds: string[] = [];
  const isControllerTurn = controllerId === ctx.activeUserId;
  const limitOk = mkLimitOk(controllerState.actions_done, usedOncePerTurnIds);
  const removed = collectContinuousAbilitiesRemovedSigni(controllerState, otherState, isControllerTurn, ctx.effectsMap, ctx.cardMap);
  const ownAutoBlocked = controllerState.blocked_actions?.includes('BLOCK_OWN_SIGNI_AUTO');
  for (const topNum of ownFieldSources(controllerState)) {
    if (ownAutoBlocked) continue;
    if (removed.has(topNum)) continue;
    for (const eff of (ctx.effectsMap.get(topNum) ?? [])) {
      if (eff.effectType !== 'AUTO' || !eff.timing?.includes('ON_CHARM_TO_TRASH')) continue;
      const scope = eff.triggerScope ?? 'any';
      const relevant = scope === 'any_ally' ? charmsFromControllerField
        : scope === 'any_opp' ? charmsFromOppField
        : charmsFromControllerField + charmsFromOppField;
      if (relevant <= 0) continue;
      if (eff.activeCondition && !checkActiveCondition(eff.activeCondition, controllerState, otherState, isControllerTurn, ctx.cardMap, topNum)) continue;
      if (eff.condition && !evalUseCondition(eff.condition, controllerState, otherState, ctx.cardMap, topNum, ctx.turnPhase, ctx.effectivePowers)) continue;
      if (!limitOk(eff)) continue;
      const cardName = ctx.cardMap.get(topNum)?.CardName ?? topNum;
      entries.push({
        id: ctx.genId(), playerId: controllerId, cardNum: topNum, effectId: eff.effectId,
        label: `${cardName} の【自】効果（チャームトラッシュ時）`, effect: eff,
      });
    }
  }
  return { entries, usedOncePerTurnIds };
}

/**
 * エナゾーン→トラッシュ時（ON_ENERGY_TO_TRASH）トリガーを収集する（Stage2 抽出）。
 * triggerCondition.energyTrashedOwner（self/opponent/any）で発生源エナを判定。⚠「あなたの効果」限定は近似で未表現。
 */
export function collectEnergyToTrashTriggers(
  ctx: TrigCtx, controllerId: string, controllerState: PlayerState, otherState: PlayerState,
  fromControllerEnergy: number, fromOppEnergy: number,
): { entries: StackEntry[]; usedOncePerTurnIds: string[] } {
  const entries: StackEntry[] = [];
  const usedOncePerTurnIds: string[] = [];
  const isControllerTurn = controllerId === ctx.activeUserId;
  const limitOk = mkLimitOk(controllerState.actions_done, usedOncePerTurnIds);
  const removed = collectContinuousAbilitiesRemovedSigni(controllerState, otherState, isControllerTurn, ctx.effectsMap, ctx.cardMap);
  const ownAutoBlocked = controllerState.blocked_actions?.includes('BLOCK_OWN_SIGNI_AUTO');
  for (const topNum of ownFieldSources(controllerState)) {
    if (ownAutoBlocked) continue;
    if (removed.has(topNum)) continue;
    for (const eff of (ctx.effectsMap.get(topNum) ?? [])) {
      if (eff.effectType !== 'AUTO' || !eff.timing?.includes('ON_ENERGY_TO_TRASH')) continue;
      const owner = eff.triggerCondition?.energyTrashedOwner ?? 'any';
      const relevant = owner === 'self' ? fromControllerEnergy
        : owner === 'opponent' ? fromOppEnergy
        : fromControllerEnergy + fromOppEnergy;
      if (relevant <= 0) continue;
      if (eff.activeCondition && !checkActiveCondition(eff.activeCondition, controllerState, otherState, isControllerTurn, ctx.cardMap, topNum)) continue;
      if (eff.condition && !evalUseCondition(eff.condition, controllerState, otherState, ctx.cardMap, topNum, ctx.turnPhase, ctx.effectivePowers)) continue;
      if (!limitOk(eff)) continue;
      const cardName = ctx.cardMap.get(topNum)?.CardName ?? topNum;
      entries.push({
        id: ctx.genId(), playerId: controllerId, cardNum: topNum, effectId: eff.effectId,
        label: `${cardName} の【自】効果（エナトラッシュ時）`, effect: eff,
      });
    }
  }
  return { entries, usedOncePerTurnIds };
}

/**
 * いずれかのプレイヤーがリフレッシュしたとき（ON_REFRESH）トリガーを収集する（Stage2 抽出）。
 * triggerCondition.refreshedOwner（self/opponent/any）で発生源を判定。
 */
export function collectRefreshTriggers(
  ctx: TrigCtx, controllerId: string, controllerState: PlayerState, otherState: PlayerState,
  refreshedByController: number, refreshedByOpp: number,
): { entries: StackEntry[]; usedOncePerTurnIds: string[] } {
  const entries: StackEntry[] = [];
  const usedOncePerTurnIds: string[] = [];
  const isControllerTurn = controllerId === ctx.activeUserId;
  const limitOk = mkLimitOk(controllerState.actions_done, usedOncePerTurnIds);
  const removed = collectContinuousAbilitiesRemovedSigni(controllerState, otherState, isControllerTurn, ctx.effectsMap, ctx.cardMap);
  const ownAutoBlocked = controllerState.blocked_actions?.includes('BLOCK_OWN_SIGNI_AUTO');
  for (const topNum of ownFieldSources(controllerState)) {
    if (ownAutoBlocked) continue;
    if (removed.has(topNum)) continue;
    for (const eff of (ctx.effectsMap.get(topNum) ?? [])) {
      if (eff.effectType !== 'AUTO' || !eff.timing?.includes('ON_REFRESH')) continue;
      const owner = eff.triggerCondition?.refreshedOwner ?? 'any';
      const relevant = owner === 'self' ? refreshedByController
        : owner === 'opponent' ? refreshedByOpp
        : refreshedByController + refreshedByOpp;
      if (relevant <= 0) continue;
      if (eff.activeCondition && !checkActiveCondition(eff.activeCondition, controllerState, otherState, isControllerTurn, ctx.cardMap, topNum)) continue;
      if (eff.condition && !evalUseCondition(eff.condition, controllerState, otherState, ctx.cardMap, topNum, ctx.turnPhase, ctx.effectivePowers)) continue;
      if (!limitOk(eff)) continue;
      const cardName = ctx.cardMap.get(topNum)?.CardName ?? topNum;
      entries.push({
        id: ctx.genId(), playerId: controllerId, cardNum: topNum, effectId: eff.effectId,
        label: `${cardName} の【自】効果（リフレッシュ時）`, effect: eff,
      });
    }
  }
  return { entries, usedOncePerTurnIds };
}

/**
 * 対戦相手のシグニのパワーが減ったとき（ON_OPP_POWER_DECREASED・毒牙）トリガーを収集する（Stage2 抽出）。
 * deltaFromOppPowerDecrease のとき delta を decreaseOnOpp で動的注入する。
 */
export function collectPowerDecreaseTriggers(
  ctx: TrigCtx, controllerId: string, controllerState: PlayerState, otherState: PlayerState, decreaseOnOpp: number,
): { entries: StackEntry[]; usedOncePerTurnIds: string[] } {
  const entries: StackEntry[] = [];
  const usedOncePerTurnIds: string[] = [];
  if (decreaseOnOpp <= 0) return { entries, usedOncePerTurnIds };
  const isControllerTurn = controllerId === ctx.activeUserId;
  const limitOk = mkLimitOk(controllerState.actions_done, usedOncePerTurnIds);
  const removed = collectContinuousAbilitiesRemovedSigni(controllerState, otherState, isControllerTurn, ctx.effectsMap, ctx.cardMap);
  const ownAutoBlocked = controllerState.blocked_actions?.includes('BLOCK_OWN_SIGNI_AUTO');
  for (const topNum of ownFieldSources(controllerState)) {
    if (ownAutoBlocked) continue;
    if (removed.has(topNum)) continue;
    for (const eff of (ctx.effectsMap.get(topNum) ?? [])) {
      if (eff.effectType !== 'AUTO' || !eff.timing?.includes('ON_OPP_POWER_DECREASED')) continue;
      if (eff.activeCondition && !checkActiveCondition(eff.activeCondition, controllerState, otherState, isControllerTurn, ctx.cardMap, topNum)) continue;
      if (eff.condition && !evalUseCondition(eff.condition, controllerState, otherState, ctx.cardMap, topNum, ctx.turnPhase, ctx.effectivePowers)) continue;
      if (!limitOk(eff)) continue;
      // deltaFromOppPowerDecrease: 「減った値と同じだけ＋」を decreaseOnOpp で動的注入
      let resolvedEff = eff;
      const act = eff.action as PowerModifyAction;
      if (act?.type === 'POWER_MODIFY' && act.deltaFromOppPowerDecrease) {
        resolvedEff = { ...eff, action: { ...act, delta: decreaseOnOpp, deltaFromOppPowerDecrease: undefined } };
      }
      const cardName = ctx.cardMap.get(topNum)?.CardName ?? topNum;
      entries.push({
        id: ctx.genId(), playerId: controllerId, cardNum: topNum, effectId: eff.effectId,
        label: `${cardName} の【自】効果（相手パワー減少時）`, effect: resolvedEff,
      });
    }
  }
  return { entries, usedOncePerTurnIds };
}

/**
 * 他領域→デッキ移動時（ON_CARD_MOVED_TO_DECK）トリガーを収集する（Stage2 抽出）。
 * movedToDeckOwner（self/opponent/any）で宛先デッキを、movedToDeckMinCount で最低枚数を、
 * movedToDeckFromTrash で発生源をトラッシュに限定。
 */
export function collectMoveToDeckTriggers(
  ctx: TrigCtx, controllerId: string, controllerState: PlayerState, otherState: PlayerState,
  movedToControllerDeck: number, movedToControllerDeckFromTrash: number, movedToOppDeck: number,
): { entries: StackEntry[]; usedOncePerTurnIds: string[] } {
  const entries: StackEntry[] = [];
  const usedOncePerTurnIds: string[] = [];
  const isControllerTurn = controllerId === ctx.activeUserId;
  const limitOk = mkLimitOk(controllerState.actions_done, usedOncePerTurnIds);
  const removed = collectContinuousAbilitiesRemovedSigni(controllerState, otherState, isControllerTurn, ctx.effectsMap, ctx.cardMap);
  const ownAutoBlocked = controllerState.blocked_actions?.includes('BLOCK_OWN_SIGNI_AUTO');
  for (const topNum of ownFieldSources(controllerState)) {
    if (ownAutoBlocked) continue;
    if (removed.has(topNum)) continue;
    for (const eff of (ctx.effectsMap.get(topNum) ?? [])) {
      if (eff.effectType !== 'AUTO' || !eff.timing?.includes('ON_CARD_MOVED_TO_DECK')) continue;
      if ((eff.triggerScope ?? 'self') !== 'self') continue;
      const owner = eff.triggerCondition?.movedToDeckOwner ?? 'any';
      const fromTrash = eff.triggerCondition?.movedToDeckFromTrash ?? false;
      const minCount = eff.triggerCondition?.movedToDeckMinCount ?? 1;
      const relevant = owner === 'self' ? (fromTrash ? movedToControllerDeckFromTrash : movedToControllerDeck)
        : owner === 'opponent' ? movedToOppDeck
        : movedToControllerDeck + movedToOppDeck;
      if (relevant < minCount) continue;
      if (eff.activeCondition && !checkActiveCondition(eff.activeCondition, controllerState, otherState, isControllerTurn, ctx.cardMap, topNum)) continue;
      if (eff.condition && !evalUseCondition(eff.condition, controllerState, otherState, ctx.cardMap, topNum, ctx.turnPhase, ctx.effectivePowers)) continue;
      if (!limitOk(eff)) continue;
      const cardName = ctx.cardMap.get(topNum)?.CardName ?? topNum;
      entries.push({
        id: ctx.genId(), playerId: controllerId, cardNum: topNum, effectId: eff.effectId,
        label: `${cardName} の【自】効果（デッキ移動時）`, effect: eff,
      });
    }
  }
  return { entries, usedOncePerTurnIds };
}

/**
 * ON_SIGNI_FROZEN トリガーを収集する（Stage2 抽出）。frozenByOwner=各所有者と新規凍結シグニ番号。
 * 両プレイヤーの場シグニ/ルリグの【自】を triggerScope（any_opp 多数派/any_ally/any）で絞る。
 * triggeringCardNum に凍結シグニを渡す（targetsTriggerSource 用）。turnOwner/usageLimit も評価。
 */
export function collectFreezeTriggers(
  ctx: TrigCtx,
  frozenByOwner: { ownerId: string; nums: string[] }[],
  hostState: PlayerState,
  guestState: PlayerState,
): { entries: StackEntry[]; usedHostIds: string[]; usedGuestIds: string[] } {
  const entries: StackEntry[] = [];
  const usedHostIds: string[] = [];
  const usedGuestIds: string[] = [];
  for (const watcherIsHost of [true, false]) {
    const watcherId = watcherIsHost ? ctx.hostId : ctx.guestId;
    const watcherState = watcherIsHost ? hostState : guestState;
    if (watcherState.blocked_actions?.includes('BLOCK_OWN_SIGNI_AUTO')) continue;
    const watcherIsTurn = watcherId === ctx.activeUserId;
    const usedIds = watcherIsHost ? usedHostIds : usedGuestIds;
    for (const topNum of ownFieldSources(watcherState)) {
      for (const eff of (ctx.effectsMap.get(topNum) ?? [])) {
        if (eff.effectType !== 'AUTO' || !eff.timing?.includes('ON_SIGNI_FROZEN')) continue;
        const scope = eff.triggerScope ?? 'any_opp';
        const to = eff.triggerCondition?.turnOwner;
        if (to === 'self' && !watcherIsTurn) continue;
        if (to === 'opponent' && watcherIsTurn) continue;
        const max = eff.usageLimit === 'once_per_turn' ? 1 : eff.usageLimit === 'twice_per_turn' ? 2 : Infinity;
        for (const fz of frozenByOwner) {
          const frozenIsWatcherOwn = fz.ownerId === watcherId;
          if (scope === 'any_opp' && frozenIsWatcherOwn) continue;
          if (scope === 'any_ally' && !frozenIsWatcherOwn) continue;
          for (const frozenNum of fz.nums) {
            const used = (watcherState.actions_done ?? []).filter(id => id === eff.effectId).length
              + usedIds.filter(id => id === eff.effectId).length;
            if (used >= max) break;
            if (eff.usageLimit === 'once_per_turn' || eff.usageLimit === 'twice_per_turn') usedIds.push(eff.effectId);
            const cardName = ctx.cardMap.get(topNum)?.CardName ?? topNum;
            entries.push({
              id: ctx.genId(), playerId: watcherId, cardNum: topNum, effectId: eff.effectId,
              label: `${cardName} の【自】効果（凍結時）`, effect: eff, triggeringCardNum: frozenNum,
            });
          }
        }
      }
    }
  }
  return { entries, usedHostIds, usedGuestIds };
}

/**
 * 自分側イベント（ON_LIFE_CRASHED / ON_GUARD / ウィルス系）に反応する自フィールド/ルリグ/キーの AUTO を収集する（Stage2 抽出）。
 * FROZEN_LOSES_ABILITIES（相手ルリグ常在）・CONTINUOUS REMOVE_ABILITIES・トラッシュ自己復活（ON_LIFE_CRASHED）も処理。
 * usedOncePerTurnIds は呼び出し側で actions_done に追加して保存すること。
 */
export function collectSelfEventTriggers(
  ctx: TrigCtx,
  timing: 'ON_LIFE_CRASHED' | 'ON_GUARD' | 'ON_OPP_VIRUS_PLACED' | 'ON_OPP_VIRUS_REMOVED' | 'ON_OPP_VIRUS_CHANGED',
  myState: PlayerState,
  opState: PlayerState,
  labelSuffix: string,
  ownerId: string,
): { entries: StackEntry[]; usedOncePerTurnIds: string[] } {
  const entries: StackEntry[] = [];
  const usedOncePerTurnIds: string[] = [];
  const limitOk = mkLimitOk(myState.actions_done, usedOncePerTurnIds);
  if (myState.blocked_actions?.includes('BLOCK_OWN_SIGNI_AUTO')) return { entries, usedOncePerTurnIds };
  // FROZEN_LOSES_ABILITIES: 相手ルリグにこの常在があれば自分の凍結シグニのAUTOは発火しない
  const opLrigTop = opState.field.lrig.at(-1);
  const frozenLosesAbilities = opLrigTop
    ? (ctx.effectsMap.get(opLrigTop) ?? []).some(e =>
        e.effectType === 'CONTINUOUS' &&
        (e.action as StubAction)?.type === 'STUB' &&
        (e.action as StubAction)?.id === 'FROZEN_LOSES_ABILITIES',
      )
    : false;
  const isOwnerTurnForSelfTrigger = ownerId === ctx.activeUserId;
  const myAbilitiesRemovedSelf = collectContinuousAbilitiesRemovedSigni(myState, opState, isOwnerTurnForSelfTrigger, ctx.effectsMap, ctx.cardMap);
  for (let zi = 0; zi < myState.field.signi.length; zi++) {
    const topNum = myState.field.signi[zi]?.at(-1);
    if (!topNum) continue;
    if (frozenLosesAbilities && (myState.field.signi_frozen?.[zi] ?? false)) continue;
    if (myAbilitiesRemovedSelf.has(topNum)) continue;
    for (const eff of ctx.effectsMap.get(topNum) ?? []) {
      if (eff.effectType !== 'AUTO' || !eff.timing?.includes(timing)) continue;
      // トラッシュからの自己復活（ADD_TO_FIELD source:TRASH_CARD で自身を出す）はトラッシュ専用＝場走査では除外。
      {
        const fAct = eff.action as AddToFieldAction;
        const selfName = ctx.cardMap.get(topNum)?.CardName;
        if (fAct.type === 'ADD_TO_FIELD' && fAct.source?.type === 'TRASH_CARD'
          && selfName && fAct.source.filter?.cardName && selfName.includes(fAct.source.filter.cardName)) {
          continue;
        }
      }
      if (!limitOk(eff)) continue;
      const cardName = ctx.cardMap.get(topNum)?.CardName ?? topNum;
      entries.push({
        id: ctx.genId(), playerId: ownerId, cardNum: topNum, effectId: eff.effectId,
        label: `${cardName} の【自】効果（${labelSuffix}）`, effect: eff,
      });
    }
  }
  // ルリグ／アシストルリグ／キーの自イベントトリガー（シグニ以外の発生源）
  const nonSigniSources = [
    myState.field.lrig.at(-1),
    myState.field.assist_lrig_l?.at(-1),
    myState.field.assist_lrig_r?.at(-1),
    myState.field.key_piece,
    ...(myState.field.key_piece_extra ?? []),
  ].filter((n): n is string => !!n);
  for (const srcNum of nonSigniSources) {
    for (const eff of ctx.effectsMap.get(srcNum) ?? []) {
      if (eff.effectType !== 'AUTO' || !eff.timing?.includes(timing)) continue;
      if (!limitOk(eff)) continue;
      const cardName = ctx.cardMap.get(srcNum)?.CardName ?? srcNum;
      entries.push({
        id: ctx.genId(), playerId: ownerId, cardNum: srcNum, effectId: eff.effectId,
        label: `${cardName} の【自】効果（${labelSuffix}）`, effect: eff,
      });
    }
  }
  // トラッシュからの自己復活（WX11-026 ヘスチア等）：ADD_TO_FIELD source:TRASH_CARD の AUTO のみ対象。
  if (timing === 'ON_LIFE_CRASHED') {
    for (const trashInstance of myState.trash) {
      for (const eff of ctx.effectsMap.get(trashInstance) ?? []) {
        if (eff.effectType !== 'AUTO' || !eff.timing?.includes(timing)) continue;
        const act = eff.action as AddToFieldAction;
        if (act.type !== 'ADD_TO_FIELD' || act.source?.type !== 'TRASH_CARD') continue;
        if (!limitOk(eff)) continue;
        const cardName = ctx.cardMap.get(trashInstance)?.CardName ?? trashInstance;
        entries.push({
          id: ctx.genId(), playerId: ownerId, cardNum: trashInstance, effectId: eff.effectId,
          label: `${cardName} の【自】効果（${labelSuffix}・トラッシュから復活）`, effect: eff,
        });
      }
    }
  }
  return { entries, usedOncePerTurnIds };
}

/**
 * シグニが効果で他シグニゾーンに移動したとき（ON_ZONE_MOVED）のトリガーを収集する（Stage2 抽出）。
 * mover 側＝self(移動シグニ自身)/any_ally/any、対戦相手側＝any_opp/any。triggeringCardNum=移動シグニ。
 */
export function collectZoneMovedTriggers(
  ctx: TrigCtx, movedNum: string, moverState: PlayerState, otherState: PlayerState, moverId: string, otherId: string,
): { entries: StackEntry[]; moverUsedIds: string[]; otherUsedIds: string[] } {
  const entries: StackEntry[] = [];
  const moverUsedIds: string[] = [];
  const otherUsedIds: string[] = [];
  const scan = (fieldState: PlayerState, ownerId: string, usedIds: string[], accept: (scope: string) => boolean) => {
    if (fieldState.blocked_actions?.includes('BLOCK_OWN_SIGNI_AUTO')) return;
    for (let zi = 0; zi < fieldState.field.signi.length; zi++) {
      const topNum = fieldState.field.signi[zi]?.at(-1);
      if (!topNum) continue;
      for (const eff of ctx.effectsMap.get(topNum) ?? []) {
        if (eff.effectType !== 'AUTO' || !eff.timing?.includes('ON_ZONE_MOVED')) continue;
        const scope = eff.triggerScope ?? 'self';
        if (scope === 'self' && topNum !== movedNum) continue;
        if (!accept(scope)) continue;
        if (eff.usageLimit === 'once_per_turn' || eff.usageLimit === 'twice_per_turn') {
          const max = eff.usageLimit === 'once_per_turn' ? 1 : 2;
          const used = (fieldState.actions_done ?? []).filter(id => id === eff.effectId).length
            + usedIds.filter(id => id === eff.effectId).length;
          if (used >= max) continue;
          usedIds.push(eff.effectId);
        }
        const cardName = ctx.cardMap.get(topNum)?.CardName ?? topNum;
        entries.push({
          id: ctx.genId(), playerId: ownerId, cardNum: topNum, effectId: eff.effectId,
          label: `${cardName} の【自】効果（ゾーン移動時）`, effect: eff, triggeringCardNum: movedNum,
        });
      }
    }
  };
  scan(moverState, moverId, moverUsedIds, scope => scope === 'self' || scope === 'any_ally' || scope === 'any');
  scan(otherState, otherId, otherUsedIds, scope => scope === 'any_opp' || scope === 'any');
  return { entries, moverUsedIds, otherUsedIds };
}

/**
 * シグニがドライブ状態になったとき（ON_SIGNI_BECOMES_DRIVE）のトリガーを収集する（Stage2 抽出・collectZoneMovedTriggers と同型）。
 * driver 側＝self/any_ally/any、対戦相手側＝any_opp/any。triggeringCardNum=ドライブ化したシグニ。
 */
export function collectDriveBecameTriggers(
  ctx: TrigCtx, becameNum: string, driverState: PlayerState, otherState: PlayerState, driverId: string, otherId: string,
): { entries: StackEntry[]; driverUsedIds: string[]; otherUsedIds: string[] } {
  const entries: StackEntry[] = [];
  const driverUsedIds: string[] = [];
  const otherUsedIds: string[] = [];
  const scan = (fieldState: PlayerState, ownerId: string, usedIds: string[], accept: (scope: string) => boolean) => {
    if (fieldState.blocked_actions?.includes('BLOCK_OWN_SIGNI_AUTO')) return;
    for (let zi = 0; zi < fieldState.field.signi.length; zi++) {
      const topNum = fieldState.field.signi[zi]?.at(-1);
      if (!topNum) continue;
      for (const eff of ctx.effectsMap.get(topNum) ?? []) {
        if (eff.effectType !== 'AUTO' || !eff.timing?.includes('ON_SIGNI_BECOMES_DRIVE')) continue;
        const scope = eff.triggerScope ?? 'self';
        if (scope === 'self' && topNum !== becameNum) continue;
        if (!accept(scope)) continue;
        if (eff.usageLimit === 'once_per_turn' || eff.usageLimit === 'twice_per_turn') {
          const max = eff.usageLimit === 'once_per_turn' ? 1 : 2;
          const used = (fieldState.actions_done ?? []).filter(id => id === eff.effectId).length
            + usedIds.filter(id => id === eff.effectId).length;
          if (used >= max) continue;
          usedIds.push(eff.effectId);
        }
        const cardName = ctx.cardMap.get(topNum)?.CardName ?? topNum;
        entries.push({
          id: ctx.genId(), playerId: ownerId, cardNum: topNum, effectId: eff.effectId,
          label: `${cardName} の【自】効果（ドライブ状態時）`, effect: eff, triggeringCardNum: becameNum,
        });
      }
    }
  };
  scan(driverState, driverId, driverUsedIds, scope => scope === 'self' || scope === 'any_ally' || scope === 'any');
  scan(otherState, otherId, otherUsedIds, scope => scope === 'any_opp' || scope === 'any');
  return { entries, driverUsedIds, otherUsedIds };
}

/**
 * カードが【ビート】になったとき（ON_BECOME_BEAT）のトリガーを収集する（Stage2 抽出）。
 * self＝なったカード自身（beat_zone 在中）／any_ally・any＝オーナーの場のシグニ。triggeringCardNum=なったカード。
 */
export function collectBeatBecameTriggers(
  ctx: TrigCtx, becameNum: string, ownerState: PlayerState, ownerId: string,
): { entries: StackEntry[]; usedIds: string[] } {
  const entries: StackEntry[] = [];
  const usedIds: string[] = [];
  const consumeLimit = (eff: { effectId: string; usageLimit?: string }): boolean => {
    if (eff.usageLimit === 'once_per_turn' || eff.usageLimit === 'twice_per_turn') {
      const max = eff.usageLimit === 'once_per_turn' ? 1 : 2;
      const used = (ownerState.actions_done ?? []).filter(id => id === eff.effectId).length
        + usedIds.filter(id => id === eff.effectId).length;
      if (used >= max) return false;
      usedIds.push(eff.effectId);
    }
    return true;
  };
  const pushEntry = (cardNum: string, eff: CardEffect) => {
    entries.push({
      id: ctx.genId(), playerId: ownerId, cardNum, effectId: eff.effectId,
      label: `${ctx.cardMap.get(cardNum)?.CardName ?? cardNum} の【自】効果（【ビート】になったとき）`,
      effect: eff, triggeringCardNum: becameNum,
    });
  };
  if (ownerState.blocked_actions?.includes('BLOCK_OWN_SIGNI_AUTO')) return { entries, usedIds };
  // 1. なったカード自身（self scope。beat_zone 在中なので effectsMap から直接引く）
  for (const eff of ctx.effectsMap.get(becameNum) ?? []) {
    if (eff.effectType !== 'AUTO' || !eff.timing?.includes('ON_BECOME_BEAT')) continue;
    if ((eff.triggerScope ?? 'self') !== 'self') continue;
    if (!consumeLimit(eff)) continue;
    pushEntry(becameNum, eff);
  }
  // 2. オーナーの場のシグニ（any_ally/any scope）
  for (let zi = 0; zi < ownerState.field.signi.length; zi++) {
    const topNum = ownerState.field.signi[zi]?.at(-1);
    if (!topNum || topNum === becameNum) continue;
    for (const eff of ctx.effectsMap.get(topNum) ?? []) {
      if (eff.effectType !== 'AUTO' || !eff.timing?.includes('ON_BECOME_BEAT')) continue;
      const scope = eff.triggerScope ?? 'self';
      if (scope !== 'any_ally' && scope !== 'any') continue;
      if (!consumeLimit(eff)) continue;
      pushEntry(topNum, eff);
    }
  }
  return { entries, usedIds };
}

/**
 * 手札が捨てられたときのトリガー（ON_DISCARDED_AS_COST / ON_HAND_DISCARDED）を収集する（Stage2 抽出）。
 * 'any'（いずれかが捨てた）はターン問わず＋相手フィールドの 'any' も収集。turnOwner:'opponent' は相手ターンのみ。
 * usedLimitIds（discarder側）を呼び出し側で actions_done に追加して保存すること。
 */
export function collectHandDiscardTriggers(
  ctx: TrigCtx, discardedNums: string[], myState: PlayerState, discarderId: string, asCost: boolean,
  opState?: PlayerState, opId?: string,
): { entries: StackEntry[]; usedLimitIds: string[] } {
  const entries: StackEntry[] = [];
  const usedLimitIds: string[] = [];
  if (discardedNums.length === 0) return { entries, usedLimitIds };
  const limitOk = mkLimitOk(myState.actions_done, usedLimitIds);
  const matchesTrigFilter = (eff: CardEffect): boolean =>
    !eff.triggerFilter || discardedNums.some(cn => matchesFilter(ctx.cardMap.get(cn), eff.triggerFilter));
  // ON_DISCARDED_AS_COST: 捨てられたカード自身（コストとして捨てられた場合のみ）
  if (asCost) {
    for (const cn of discardedNums) {
      for (const eff of (ctx.effectsMap.get(cn) ?? [])) {
        if (eff.effectType !== 'AUTO' || !eff.timing?.includes('ON_DISCARDED_AS_COST')) continue;
        if (!limitOk(eff)) continue;
        entries.push({
          id: ctx.genId(), playerId: discarderId, cardNum: cn, effectId: eff.effectId,
          label: `${ctx.cardMap.get(cn)?.CardName ?? cn}【自】コスト捨て時`, effect: eff,
        });
      }
    }
  }
  // ON_HAND_DISCARDED: discarder の自フィールド。'any' は常時、それ以外は discarder のターンのみ。
  const myIsTurn = ctx.activeUserId === discarderId;
  const myBlocked = !!myState.blocked_actions?.includes('BLOCK_OWN_SIGNI_AUTO');
  for (const stack of myState.field.signi) {
    const topNum = stack?.at(-1);
    if (!topNum) continue;
    for (const eff of (ctx.effectsMap.get(topNum) ?? [])) {
      if (eff.effectType !== 'AUTO' || !eff.timing?.includes('ON_HAND_DISCARDED')) continue;
      const isAny = eff.triggerScope === 'any';
      if (myBlocked) continue;
      if (eff.triggerCondition?.turnOwner === 'opponent') { if (myIsTurn) continue; }
      else if (!isAny && !myIsTurn) continue;
      if (!matchesTrigFilter(eff)) continue;
      if (!limitOk(eff)) continue;
      entries.push({
        id: ctx.genId(), playerId: discarderId, cardNum: topNum, effectId: eff.effectId,
        label: `${ctx.cardMap.get(topNum)?.CardName ?? topNum}【自】手札捨て時`, effect: eff,
      });
    }
  }
  // ON_HAND_DISCARDED 'any': discarder の相手フィールドの「いずれかが捨てたとき」を相手コントローラーで収集。
  if (opState && opId && !opState.blocked_actions?.includes('BLOCK_OWN_SIGNI_AUTO')) {
    for (const stack of opState.field.signi) {
      const topNum = stack?.at(-1);
      if (!topNum) continue;
      for (const eff of (ctx.effectsMap.get(topNum) ?? [])) {
        if (eff.effectType !== 'AUTO' || !eff.timing?.includes('ON_HAND_DISCARDED')) continue;
        if (eff.triggerScope !== 'any') continue;
        if (!matchesTrigFilter(eff)) continue;
        if (eff.usageLimit === 'once_per_turn' || eff.usageLimit === 'twice_per_turn') {
          const max = eff.usageLimit === 'once_per_turn' ? 1 : 2;
          if ((opState.actions_done ?? []).filter(id => id === eff.effectId).length >= max) continue;
        }
        entries.push({
          id: ctx.genId(), playerId: opId, cardNum: topNum, effectId: eff.effectId,
          label: `${ctx.cardMap.get(topNum)?.CardName ?? topNum}【自】手札捨て時`, effect: eff,
        });
      }
    }
  }
  return { entries, usedLimitIds };
}

/**
 * 相手がアーツを使用したとき（ON_OPP_ARTS_USE）に反応する自分のシグニを収集する（Stage2 抽出）。
 * activeCondition を満たす場合のみ。playerId は視点プレイヤー（ctx.meId）。
 */
export function collectOppArtsUseTriggers(
  ctx: TrigCtx, myState: PlayerState, opState: PlayerState, isMyTurnNow: boolean,
): StackEntry[] {
  const entries: StackEntry[] = [];
  const meId = ctx.meId ?? ctx.hostId;
  for (const stack of myState.field.signi) {
    if (!stack?.length) continue;
    const topNum = stack[stack.length - 1];
    for (const eff of ctx.effectsMap.get(topNum) ?? []) {
      if (eff.effectType !== 'AUTO') continue;
      if (!eff.timing?.includes('ON_OPP_ARTS_USE')) continue;
      if (eff.activeCondition && !checkActiveCondition(eff.activeCondition, myState, opState, isMyTurnNow, ctx.cardMap)) continue;
      const cardName = ctx.cardMap.get(topNum)?.CardName ?? topNum;
      entries.push({
        id: ctx.genId(), playerId: meId, cardNum: topNum, effectId: eff.effectId,
        label: `${cardName} の【自】効果（相手アーツ使用時）`, effect: eff,
      });
    }
  }
  return entries;
}

/**
 * あなたがアーツを使用したとき（ON_ARTS_USE）、使用者自身のルリグ/シグニのトリガーを収集する（Stage2 抽出）。
 * usedIds を呼び出し側で caster の actions_done に永続化する。
 */
export function collectArtsUseTriggers(
  ctx: TrigCtx, casterId: string, casterState: PlayerState, opState: PlayerState, isCasterTurn: boolean,
): { entries: StackEntry[]; usedIds: string[] } {
  const entries: StackEntry[] = [];
  const usedIds: string[] = [];
  const sources = [
    casterState.field.lrig.at(-1),
    ...casterState.field.signi.map(s => s?.at(-1)),
  ].filter((n): n is string => !!n);
  for (const srcNum of sources) {
    for (const eff of (ctx.effectsMap.get(srcNum) ?? [])) {
      if (eff.effectType !== 'AUTO' || !eff.timing?.includes('ON_ARTS_USE')) continue;
      if ((eff.triggerScope ?? 'self') !== 'self') continue;
      if (eff.usageLimit === 'once_per_turn' || eff.usageLimit === 'twice_per_turn') {
        const max = eff.usageLimit === 'once_per_turn' ? 1 : 2;
        const used = (casterState.actions_done ?? []).filter(id => id === eff.effectId).length
          + usedIds.filter(id => id === eff.effectId).length;
        if (used >= max) continue;
        usedIds.push(eff.effectId);
      }
      if (eff.activeCondition && !checkActiveCondition(eff.activeCondition, casterState, opState, isCasterTurn, ctx.cardMap, srcNum)) continue;
      if (eff.condition && !evalUseCondition(eff.condition, casterState, opState, ctx.cardMap, srcNum, ctx.turnPhase, ctx.effectivePowers)) continue;
      entries.push({
        id: ctx.genId(), playerId: casterId, cardNum: srcNum, effectId: eff.effectId,
        label: `${ctx.cardMap.get(srcNum)?.CardName ?? srcNum}【自】アーツ使用時`, effect: eff,
      });
    }
  }
  return { entries, usedIds };
}

/**
 * フィールドのシグニ/ルリグの「他のシグニが◯◯したとき」系トリガー（ON_PLAY/ON_BANISH/ON_ATTACK_SIGNI/ON_BLOOM）を収集する（Stage2 抽出）。
 * 自分の場＝any_ally/any、相手の場＝any_opp/any。byEffect/bySigniEffect・placedDown/placedFromTrash/placedPuppet・
 * frontLowerLevelThanSource/placedFront・triggerFilter・REMOVE_ABILITIES/FROZEN_LOSES_ABILITIES・ARTS_SELF_RECYCLE を保持。
 * ownerId=myState の持ち主。
 */
export function collectFieldTriggers(
  ctx: TrigCtx,
  event: 'ON_PLAY' | 'ON_BANISH' | 'ON_ATTACK_SIGNI' | 'ON_BLOOM',
  triggeringCardNum: string,
  myState: PlayerState,
  opState: PlayerState,
  ownerId: string,
  opts?: { placedByEffect?: boolean; placeSourceIsSigni?: boolean; placedFromTrash?: boolean },
): StackEntry[] {
  const entries: StackEntry[] = [];
  const opId = ownerId === ctx.hostId ? ctx.guestId : ctx.hostId;
  // byEffect/bySigniEffect:「効果によって場に出たとき」限定の発火可否（ON_PLAY）。
  const byEffectTriggerOk = (eff: CardEffect): boolean => {
    if (event !== 'ON_PLAY') return true;
    if (eff.triggerCondition?.bySigniEffect) return !!(opts?.placedByEffect && opts?.placeSourceIsSigni);
    if (eff.triggerCondition?.byEffect) return !!opts?.placedByEffect;
    return true;
  };

  const isOwnerTurnForTrigger = ownerId === ctx.activeUserId;
  const myAbilitiesRemoved = collectContinuousAbilitiesRemovedSigni(myState, opState, isOwnerTurnForTrigger, ctx.effectsMap, ctx.cardMap);
  const opAbilitiesRemoved = collectContinuousAbilitiesRemovedSigni(opState, myState, !isOwnerTurnForTrigger, ctx.effectsMap, ctx.cardMap);

  // 自分のフィールド：'any_ally' または 'any' トリガー。ON_PLAY ではルリグも監視対象。
  const ownAutoBlocked = myState.blocked_actions?.includes('BLOCK_OWN_SIGNI_AUTO');
  const allyWatchers: { topNum: string; isLrig: boolean }[] = [];
  for (const stack of myState.field.signi) {
    if (stack?.length) allyWatchers.push({ topNum: stack[stack.length - 1], isLrig: false });
  }
  const myLrigWatcher = event === 'ON_PLAY' ? myState.field.lrig.at(-1) : undefined;
  if (myLrigWatcher) allyWatchers.push({ topNum: myLrigWatcher, isLrig: true });
  for (const { topNum, isLrig } of allyWatchers) {
    if (topNum === triggeringCardNum) continue; // 自身は除く
    if (ownAutoBlocked && !isLrig) continue; // BLOCK_OWN_SIGNI_AUTO はシグニ限定
    if (myAbilitiesRemoved.has(topNum)) continue;
    for (const eff of (ctx.effectsMap.get(topNum) ?? [])) {
      if (eff.effectType !== 'AUTO') continue;
      if (!eff.timing?.includes(event)) continue;
      const scope = eff.triggerScope ?? 'self';
      if (scope !== 'any_ally' && scope !== 'any') continue;
      if (!byEffectTriggerOk(eff)) continue;
      // placedDown（G144）: トリガー元シグニがダウン状態で出ていなければ発火しない。
      if (eff.triggerCondition?.placedDown && event === 'ON_PLAY') {
        const ziTrig = myState.field.signi.findIndex(s => s?.at(-1) === triggeringCardNum);
        if (ziTrig < 0 || !(myState.field.signi_down?.[ziTrig] ?? false)) continue;
      }
      // placedFromTrash: 配置元がトラッシュでなければ発火しない。
      if (eff.triggerCondition?.placedFromTrash && event === 'ON_PLAY' && !opts?.placedFromTrash) continue;
      // placedPuppet（WDK17-001）: トリガー元が傀儡状態でなければ発火しない。
      if (eff.triggerCondition?.placedPuppet && event === 'ON_PLAY' && !(myState.field.puppet_signi ?? []).includes(triggeringCardNum)) continue;
      if (eff.triggerFilter && !matchesFilter(ctx.cardMap.get(triggeringCardNum), eff.triggerFilter)) continue;
      const cardName = ctx.cardMap.get(topNum)?.CardName ?? topNum;
      entries.push({
        id: ctx.genId(), playerId: ownerId, cardNum: topNum, effectId: eff.effectId,
        label: `${cardName} の【自】効果（他のシグニ召喚時）`, effect: eff, triggeringCardNum,
      });
    }
  }

  // 相手のフィールド：'any_opp' または 'any' トリガー
  const oppAutoBlocked = myState.blocked_actions?.includes('BLOCK_OPP_SIGNI_AUTO');
  const myLrigTop = myState.field.lrig.at(-1);
  const frozenLosesAbilitiesOnMyLrig = myLrigTop
    ? (ctx.effectsMap.get(myLrigTop) ?? []).some(e =>
        e.effectType === 'CONTINUOUS' &&
        (e.action as StubAction)?.type === 'STUB' &&
        (e.action as StubAction)?.id === 'FROZEN_LOSES_ABILITIES',
      )
    : false;
  for (const stack of opState.field.signi) {
    if (!stack?.length) continue;
    const topNum = stack[stack.length - 1];
    if (opAbilitiesRemoved.has(topNum)) continue;
    for (const eff of (ctx.effectsMap.get(topNum) ?? [])) {
      if (eff.effectType !== 'AUTO') continue;
      if (!eff.timing?.includes(event)) continue;
      if (oppAutoBlocked) continue;
      if (frozenLosesAbilitiesOnMyLrig) {
        const zi2 = opState.field.signi.findIndex(s => s?.at(-1) === topNum);
        if (zi2 >= 0 && (opState.field.signi_frozen?.[zi2] ?? false)) continue;
      }
      const scope = eff.triggerScope ?? 'self';
      if (scope !== 'any' && scope !== 'any_opp') continue;
      // MOVE_TO_ATTACKER_FRONT / MOVE_TO_OTHER_SIGNI_ZONE は専用ハンドラ（二重発火防止）。
      const oeStub = eff.action as StubAction;
      if (event === 'ON_ATTACK_SIGNI' && oeStub.type === 'STUB'
        && (oeStub.id === 'MOVE_TO_ATTACKER_FRONT' || oeStub.id === 'MOVE_TO_OTHER_SIGNI_ZONE')) continue;
      if (eff.triggerFilter && !matchesFilter(ctx.cardMap.get(triggeringCardNum), eff.triggerFilter)) continue;
      // frontLowerLevelThanSource（WX17-075）: このシグニの正面に、これよりレベルの低いシグニが出たときのみ。
      if (eff.triggerCondition?.frontLowerLevelThanSource) {
        if (event !== 'ON_PLAY') continue;
        const ziHost = opState.field.signi.findIndex(s => s?.at(-1) === topNum);
        if (ziHost < 0) continue;
        const frontNum = myState.field.signi[2 - ziHost]?.at(-1);
        if (!frontNum || frontNum !== triggeringCardNum) continue;
        const hostLv = parseInt(ctx.cardMap.get(topNum)?.Level ?? '0', 10);
        const newLv = parseInt(ctx.cardMap.get(triggeringCardNum)?.Level ?? '0', 10);
        if (isNaN(hostLv) || isNaN(newLv) || newLv >= hostLv) continue;
      }
      // placedFront（WXDi-P03-043）: このシグニの正面ゾーンにトリガー元が配置された場合のみ。
      if (eff.triggerCondition?.placedFront) {
        if (event !== 'ON_PLAY') continue;
        const ziHost = opState.field.signi.findIndex(s => s?.at(-1) === topNum);
        if (ziHost < 0) continue;
        const frontNum = myState.field.signi[2 - ziHost]?.at(-1);
        if (!frontNum || frontNum !== triggeringCardNum) continue;
      }
      const cardName = ctx.cardMap.get(topNum)?.CardName ?? topNum;
      entries.push({
        id: ctx.genId(), playerId: opId, cardNum: topNum, effectId: eff.effectId,
        label: `${cardName} の【自】効果（相手シグニアタック時）`, effect: eff, triggeringCardNum,
      });
    }
  }

  // 自分のルリグトラッシュ（ARTS_SELF_RECYCLE_ON_TRIGGER: ON_PLAYトリガーでアーツ自己回収）
  if (event === 'ON_PLAY') {
    for (const artsNum of (myState.lrig_trash ?? [])) {
      for (const eff of (ctx.effectsMap.get(artsNum) ?? [])) {
        if (eff.effectType !== 'AUTO' || !eff.timing?.includes('ON_PLAY')) continue;
        const act = eff.action as StubAction;
        if (act.type !== 'STUB' || act.id !== 'ARTS_SELF_RECYCLE_ON_TRIGGER') continue;
        const cardName = ctx.cardMap.get(artsNum)?.CardName ?? artsNum;
        entries.push({
          id: ctx.genId(), playerId: ownerId, cardNum: artsNum, effectId: eff.effectId,
          label: `${cardName} の【自】効果（シグニ召喚時）`, effect: eff,
        });
      }
    }
  }

  return entries;
}

/**
 * 【シード】が開花したとき（ON_BLOOM）のトリガーを収集する（Stage2 抽出）。
 * 開花シグニ自身の self ON_BLOOM ＋場の他シグニの any_ally/any（collectFieldTriggers 経由）。
 * 開花は「場に出た」扱いではないため ON_PLAY は発火させない（公式ルール）。
 */
export function collectBloomTriggers(
  ctx: TrigCtx, bloomedInstanceId: string, myState: PlayerState, opState: PlayerState, ownerId: string,
): StackEntry[] {
  const entries: StackEntry[] = [];
  const cn = getCardNum(bloomedInstanceId);
  const cardName = ctx.cardMap.get(cn)?.CardName ?? cn;
  for (const eff of (ctx.effectsMap.get(cn) ?? [])) {
    if (eff.effectType !== 'AUTO' || !eff.timing?.includes('ON_BLOOM')) continue;
    if ((eff.triggerScope ?? 'self') !== 'self') continue;
    entries.push({
      id: ctx.genId(), playerId: ownerId, cardNum: bloomedInstanceId, effectId: eff.effectId,
      label: `${cardName} の【自】効果（開花時）`, effect: eff,
    });
  }
  entries.push(...collectFieldTriggers(ctx, 'ON_BLOOM', bloomedInstanceId, myState, opState, ownerId));
  return entries;
}
