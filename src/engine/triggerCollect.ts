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
 * usageLimit を消費した effectId は usedHostIds/usedGuestIds で返す（呼び出し元が watcher 側の
 * actions_done へ書き戻す責務を持つ＝他コレクターと同型。返さないと同一ターン内に何度でも再発火する）。
 */
export function collectTargetedTriggers(
  ctx: TrigCtx,
  targetedNums: string[],
  targetedOwnerId: string,
  afterHostState: PlayerState,
  afterGuestState: PlayerState,
): { entries: StackEntry[]; usedHostIds: string[]; usedGuestIds: string[] } {
  const entries: StackEntry[] = [];
  const usedHostIds: string[] = [];
  const usedGuestIds: string[] = [];
  const targetedSet = new Set(targetedNums);
  for (const watcherIsHost of [true, false]) {
    const watcherId = watcherIsHost ? ctx.hostId : ctx.guestId;
    const watcherState = watcherIsHost ? afterHostState : afterGuestState;
    const otherState = watcherIsHost ? afterGuestState : afterHostState;
    const targetedIsWatcherOwn = targetedOwnerId === watcherId;
    const watcherIsTurn = ctx.activeUserId === watcherId;
    const limitOk = mkLimitOk(watcherState.actions_done, watcherIsHost ? usedHostIds : usedGuestIds);
    for (const topNum of ownFieldSources(watcherState)) {
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
        if (!limitOk(eff)) continue;
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
  return { entries, usedHostIds, usedGuestIds };
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
): { entries: StackEntry[]; usedHostIds: string[]; usedGuestIds: string[] } {
  const entries: StackEntry[] = [];
  // usageLimit の消費 effectId を watcher 側で返す（呼び出し元が actions_done へ書き戻す＝他コレクタと同型）。
  // 従来は actions_done を「読む」だけで書き戻し機構が無く、《ターン1回》が実質ノーガードだった（続き132・Opusタスク12(vi-5)）。
  const usedHostIds: string[] = [];
  const usedGuestIds: string[] = [];
  const oppOfGrowerId = grownOwnerId === ctx.hostId ? ctx.guestId : ctx.hostId;
  for (const watcherIsGrower of [true, false]) {
    const watcherId = watcherIsGrower ? grownOwnerId : oppOfGrowerId;
    const watcherState = watcherIsGrower ? afterGrowerState : afterOpState;
    const otherState = watcherIsGrower ? afterOpState : afterGrowerState;
    const watcherIsTurn = ctx.activeUserId === watcherId;
    const limitOk = mkLimitOk(watcherState.actions_done, watcherId === ctx.hostId ? usedHostIds : usedGuestIds);
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
        if (!limitOk(eff)) continue;
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
  return { entries, usedHostIds, usedGuestIds };
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
): { entries: StackEntry[]; usedIds: string[] } {
  const entries: StackEntry[] = [];
  // usageLimit の消費を usedIds で返す（呼び出し側で payer の actions_done へ書き戻す）。
  // 従来は StackEntry[] のみ返し書き戻しが無く、《ターン1回/2回》が実質ノーガードだった（続き99・WXDi-P15-069）。
  const usedIds: string[] = [];
  const limitOk = mkLimitOk(afterPayerState.actions_done, usedIds);
  const payerIsTurn = ctx.activeUserId === payerId;
  for (const topNum of ownFieldSources(afterPayerState)) {
    for (const eff of effsOf(ctx, topNum)) {
      if (eff.effectType !== 'AUTO' || !eff.timing?.includes('ON_COIN_PAID')) continue;
      const scope = eff.triggerScope ?? 'self';
      if (scope === 'any_opp') continue; // 相手支払いは対象外（payer 視点では発火しない）
      const to = eff.triggerCondition?.turnOwner;
      if (to === 'self' && !payerIsTurn) continue;
      if (to === 'opponent' && payerIsTurn) continue;
      if (eff.condition && !evalUseCondition(eff.condition, afterPayerState, afterOpState, ctx.cardMap, topNum, ctx.turnPhase, ctx.effectivePowers)) continue;
      if (!limitOk(eff)) continue;
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
  return { entries, usedIds };
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
): { entries: StackEntry[]; usedHostIds: string[]; usedGuestIds: string[] } {
  const entries: StackEntry[] = [];
  // usageLimit の消費 effectId を watcher 側で返す（呼び出し元が actions_done へ書き戻す。続き100・Opusタスク12(vi-5)）。
  const usedHostIds: string[] = [];
  const usedGuestIds: string[] = [];
  for (const watcherIsHost of [true, false]) {
    const watcherId = watcherIsHost ? ctx.hostId : ctx.guestId;
    const watcherState = watcherIsHost ? afterHostState : afterGuestState;
    const zeroedIsWatcherOwn = zeroedOwnerId === watcherId;
    const watcherIsTurn = ctx.activeUserId === watcherId;
    const limitOk = mkLimitOk(watcherState.actions_done, watcherIsHost ? usedHostIds : usedGuestIds);
    // ownFieldSources = 場シグニ最上段＋センタールリグ最上段。field.signi のみ走査だと
    // LRIG が watcher の ON_SIGNI_POWER_ZERO_OR_LESS が構造的に絶対発火しなかった（続き95/96・WX22-013/WXDi-P14-009）。
    for (const topNum of ownFieldSources(watcherState)) {
      for (const eff of (ctx.effectsMap.get(topNum) ?? [])) {
        if (eff.effectType !== 'AUTO' || !eff.timing?.includes('ON_SIGNI_POWER_ZERO_OR_LESS')) continue;
        const scope = eff.triggerScope ?? 'any';
        if (scope === 'self' && topNum !== zeroedCardNum) continue;
        if (scope === 'any_ally' && !zeroedIsWatcherOwn) continue;
        if (scope === 'any_opp' && zeroedIsWatcherOwn) continue;
        const to = eff.triggerCondition?.turnOwner;
        if (to === 'self' && !watcherIsTurn) continue;
        if (to === 'opponent' && watcherIsTurn) continue;
        if (!limitOk(eff)) continue;
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
  return { entries, usedHostIds, usedGuestIds };
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
): { entries: StackEntry[]; usedHostIds: string[]; usedGuestIds: string[] } {
  const entries: StackEntry[] = [];
  const ownerStateAfter = armoredPlayerId === ctx.hostId ? afterHostState : afterGuestState;
  // usageLimit の消費 effectId（呼び出し元が actions_done へ書き戻す＝ON_BANISH と同型）。
  // any_ally パスは続き181 まで parser が self に潰していて死んでおり、ノーガードが露見しなかった。
  const usedHostIds: string[] = [];
  const usedGuestIds: string[] = [];
  const limitOkOwner = mkLimitOk(ownerStateAfter.actions_done, armoredPlayerId === ctx.hostId ? usedHostIds : usedGuestIds);
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
  // フィールド上の全シグニ＋ルリグの ON_BLOOD_CRYSTAL_ARMOR (scope=any_ally)
  for (const topNum of ownFieldSources(ownerStateAfter)) {
    for (const eff of (ctx.effectsMap.get(topNum) ?? [])) {
      if (eff.effectType !== 'AUTO' || !eff.timing?.includes('ON_BLOOD_CRYSTAL_ARMOR')) continue;
      const scope = eff.triggerScope ?? 'self';
      if (scope !== 'any_ally' && scope !== 'any') continue;
      // triggerFilter は血晶武装状態になったシグニ側の限定。
      if (eff.triggerFilter?.excludeSelf && armoredCardNum === topNum) continue;
      if (eff.triggerFilter) {
        const { excludeSelf: _excludeSelf, ...filter } = eff.triggerFilter;
        if (Object.keys(filter).length > 0 && !matchesFilter(ctx.cardMap.get(getCardNum(armoredCardNum)), filter)) continue;
      }
      if (!limitOkOwner(eff)) continue;
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
  return { entries, usedHostIds, usedGuestIds };
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
  causeSourceCardNum?: string,
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
    // byOwnEffect（「あなたの効果によって/あなたがこのカードを捨てたとき」＝タスク16[C]機構②）: 対戦相手効果起因では発火しない。
    if (eff.triggerCondition?.byOwnEffect && causeByOpponent) continue;
    // trashSourceStory（「あなたの＜X＞のシグニの効果によって捨てられたとき」WXDi-P14-086）: 原因効果の発生源
    // カードが自分側の＜X＞のシグニのときのみ（発生源不明＝ガード/ルール処理では発火しない）。
    if (eff.triggerCondition?.trashSourceStory) {
      if (causeByOpponent) continue;
      const srcCard = causeSourceCardNum ? ctx.cardMap.get(getCardNum(causeSourceCardNum)) : undefined;
      if (!srcCard || srcCard.Type !== 'シグニ' || !(srcCard.CardClass ?? '').includes(eff.triggerCondition.trashSourceStory)) continue;
    }
    // turnOwner（「あなたのターンの間、このカードが捨てられたとき」WXDi-P10-070）: 捨てられたカードの持ち主視点。
    const toAZ = eff.triggerCondition?.turnOwner;
    const ownerIsTurnAZ = ctx.activeUserId === trashedPlayerId;
    if (toAZ === 'self' && !ownerIsTurnAZ) continue;
    if (toAZ === 'opponent' && ownerIsTurnAZ) continue;
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
 * byEffectCause: このトラッシュが効果によるものか（コスト・バトル・ルール処理は false。byEffect ゲート用）。
 */
export function collectTrashTriggers(
  ctx: TrigCtx,
  trashedCardNum: string,
  trashedPlayerId: string,
  afterHostState: PlayerState,
  afterGuestState: PlayerState,
  causeByOpponent = false,
  byCostOrEffect = true,
  byEffectCause = true,
): { entries: StackEntry[]; usedHostIds: string[]; usedGuestIds: string[] } {
  const entries: StackEntry[] = [];
  // usageLimit（《ターン1回/2回》）の消費 effectId を返す（呼び出し元が actions_done へ書き戻す＝ON_BANISH と同型。
  // 続き181 までは any_ally が parser で self に潰れていてこのパス自体が死んでおり、ノーガードが露見しなかった）。
  const usedHostIds: string[] = [];
  const usedGuestIds: string[] = [];
  const ownerState = trashedPlayerId === ctx.hostId ? afterHostState : afterGuestState;
  const limitOkOwner = mkLimitOk(ownerState.actions_done, trashedPlayerId === ctx.hostId ? usedHostIds : usedGuestIds);
  // 「あなたの…シグニがトラッシュに置かれたとき」の watcher＝トラッシュされたシグニのオーナー。
  const ownerIsTurnPlayer = ctx.activeUserId === trashedPlayerId;
  // トラッシュに置かれたカード自身の ON_TRASH 効果（このパスは「場から」トラッシュ＝field origin）
  for (const eff of (ctx.effectsMap.get(trashedCardNum) ?? [])) {
    if (eff.effectType !== 'AUTO' || !eff.timing?.includes('ON_TRASH')) continue;
    const scope = eff.triggerScope ?? 'self';
    if (scope !== 'self' && scope !== 'any_ally' && scope !== 'any') continue;
    if (scope !== 'self') {
      // any_ally は**トラッシュされたカード自身も母集団に含む**（自身が＜X＞なら自分のトラッシュでも発火）。
      // 既に場から離れているため下の field 走査では拾えず、ここで拾わないと自己発火だけが落ちる（ON_BANISH と同型）。
      if (eff.triggerFilter?.excludeSelf) continue;
      if (eff.triggerFilter) {
        const { excludeSelf: _excludeSelf, ...filter } = eff.triggerFilter;
        if (Object.keys(filter).length > 0 && !matchesFilter(ctx.cardMap.get(getCardNum(trashedCardNum)), filter)) continue;
      }
      if (condHas(eff.condition, 'IS_MY_TURN') && !ownerIsTurnPlayer) continue;
      if (condHas(eff.condition, 'IS_OPPONENT_TURN') && ownerIsTurnPlayer) continue;
      if (eff.condition && !evalUseCondition(eff.condition, ownerState, trashedPlayerId === ctx.hostId ? afterGuestState : afterHostState, ctx.cardMap, trashedCardNum, ctx.turnPhase ?? '')) continue;
      if (!limitOkOwner(eff)) continue;
    }
    // 「対戦相手の効果によって」限定トリガーは対戦相手効果が原因のときのみ発火（WX04-035-E2）
    if (eff.triggerCondition?.byOpponentEffect && !causeByOpponent) continue;
    // 「効果によって」だけの文型はコストを含まない。effect 起因シグナルが無ければ発火しない。
    if (eff.triggerCondition?.byEffect && !byEffectCause) continue;
    // 「あなたの効果によって」＝自分の効果起因のみ。コスト・バトル・ルール処理（!byEffectCause）と相手効果（causeByOpponent）を除外。
    if (eff.triggerCondition?.byOwnEffect && (!byEffectCause || causeByOpponent)) continue;
    // 「コストか効果によって場から」限定トリガーはコスト/効果起因のときのみ発火（バトル・ルール処理では発火しない。G204）
    if (eff.triggerCondition?.fromFieldByCostOrEffect && !byCostOrEffect) continue;
    // 「コストかあなたの効果によって場から」＝コスト、または trashed owner 自身の効果だけを許可。
    if (eff.triggerCondition?.fromFieldByCostOrOwnEffect
        && !(byCostOrEffect && (!byEffectCause || !causeByOpponent))) continue;
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
  // フィールド上シグニ＋ルリグのON_TRASHフィールドトリガー（ally_banished等）
  for (const topNum of ownFieldSources(ownerState)) {
    for (const eff of (ctx.effectsMap.get(topNum) ?? [])) {
      if (eff.effectType !== 'AUTO' || !eff.timing?.includes('ON_TRASH')) continue;
      if (eff.triggerCondition?.byOpponentEffect && !causeByOpponent) continue;
      if (eff.triggerCondition?.byEffect && !byEffectCause) continue;
      if (eff.triggerCondition?.byOwnEffect && (!byEffectCause || causeByOpponent)) continue;
      if (eff.triggerCondition?.fromFieldByCostOrEffect && !byCostOrEffect) continue;
      if (eff.triggerCondition?.fromFieldByCostOrOwnEffect
          && !(byCostOrEffect && (!byEffectCause || !causeByOpponent))) continue;
      const scope = eff.triggerScope ?? 'self';
      if (scope !== 'any_ally' && scope !== 'any') continue;
      // triggerFilter はトラッシュに置かれたシグニ側の限定。watcher 自身を除く指定もここで評価する。
      if (eff.triggerFilter?.excludeSelf && trashedCardNum === topNum) continue;
      if (eff.triggerFilter) {
        const { excludeSelf: _excludeSelf, ...filter } = eff.triggerFilter;
        if (Object.keys(filter).length > 0 && !matchesFilter(ctx.cardMap.get(getCardNum(trashedCardNum)), filter)) continue;
      }
      // ターン所有者条件は evalCondition では判定できない（IS_MY_TURN はプレースホルダで常時 true）ため、
      // watcher＝トラッシュされたシグニのオーナー視点で収集側が判定する（WX24-P1-015-E1「あなたのメインフェイズの間」＝
      // AND(DURING_PHASE:MAIN, IS_MY_TURN)。DURING_PHASE 単独だと相手のメインフェイズでも発火してしまう）。
      if (condHas(eff.condition, 'IS_MY_TURN') && !ownerIsTurnPlayer) continue;
      if (condHas(eff.condition, 'IS_OPPONENT_TURN') && ownerIsTurnPlayer) continue;
      if (eff.condition && !evalUseCondition(eff.condition, ownerState, trashedPlayerId === ctx.hostId ? afterGuestState : afterHostState, ctx.cardMap, topNum, ctx.turnPhase ?? '')) continue;
      if (!limitOkOwner(eff)) continue;
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
  const limitOkWatcher = mkLimitOk(watcherState.actions_done, watcherPlayerId === ctx.hostId ? usedHostIds : usedGuestIds);
  for (const topNum of ownFieldSources(watcherState)) {
    for (const eff of (ctx.effectsMap.get(topNum) ?? [])) {
      if (eff.effectType !== 'AUTO' || !eff.timing?.includes('ON_TRASH')) continue;
      if (eff.triggerCondition?.byOpponentEffect && !causeByOpponent) continue;
      if (eff.triggerCondition?.byEffect && !byEffectCause) continue;
      if (eff.triggerCondition?.byOwnEffect && (!byEffectCause || causeByOpponent)) continue;
      if (eff.triggerCondition?.fromFieldByCostOrEffect && !byCostOrEffect) continue;
      if (eff.triggerCondition?.fromFieldByCostOrOwnEffect
          && !(byCostOrEffect && (!byEffectCause || !causeByOpponent))) continue;
      const scope = eff.triggerScope ?? 'self';
      if (scope !== 'any_opp') continue; // 'any' は既存の自分側ループで収集済み
      // any_ally と同じく、トラッシュに置かれたシグニ側へ watcher の triggerFilter を適用する。
      if (eff.triggerFilter?.excludeSelf && trashedCardNum === topNum) continue;
      if (eff.triggerFilter) {
        const { excludeSelf: _excludeSelf, ...filter } = eff.triggerFilter;
        if (Object.keys(filter).length > 0 && !matchesFilter(ctx.cardMap.get(getCardNum(trashedCardNum)), filter)) continue;
      }
      // 「あなたのターンの間」: IS_MY_TURN 指定があれば watcher がターンプレイヤーのときのみ
      if (condHas(eff.condition, 'IS_MY_TURN') && !watcherIsTurnPlayer) continue;
      if (condHas(eff.condition, 'IS_OPPONENT_TURN') && watcherIsTurnPlayer) continue;
      // ターン条件以外の condition を評価
      if (eff.condition && !evalUseCondition(eff.condition, watcherState, watcherOppState, ctx.cardMap, topNum, ctx.turnPhase ?? '')) continue;
      if (!limitOkWatcher(eff)) continue;
      entries.push({
        id: ctx.genId(), playerId: watcherPlayerId, cardNum: topNum, effectId: eff.effectId,
        label: `${ctx.cardMap.get(topNum)?.CardName ?? topNum} の【自】効果（対戦相手シグニのトラッシュ時）`, effect: eff,
      });
    }
  }
  return { entries, usedHostIds, usedGuestIds };
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
): { entries: StackEntry[]; usedHostIds: string[]; usedGuestIds: string[] } {
  const entries: StackEntry[] = [];
  const meId = ctx.meId ?? ctx.hostId;
  const isHost = meId === ctx.hostId;
  const opId = isHost ? ctx.guestId : ctx.hostId;
  const myAfterState = isHost ? afterHostState : afterGuestState;
  const opAfterState = isHost ? afterGuestState : afterHostState;
  const banishedOwnerIsMe = banishedPlayerId === meId;
  // usageLimit の消費 effectId を watcher 側で返す（呼び出し元が actions_done へ書き戻す。続き100・Opusタスク12(vi-5)）。
  // 従来は actions_done を「読む」だけで書き戻しが無く、《ターン1回》が実質ノーガードだった（ON_BANISH watcher 18枚）。
  const usedHostIds: string[] = [];
  const usedGuestIds: string[] = [];
  const limitOkMy = mkLimitOk(myAfterState.actions_done, isHost ? usedHostIds : usedGuestIds);
  const limitOkOp = mkLimitOk(opAfterState.actions_done, isHost ? usedGuestIds : usedHostIds);

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
    const selfScope = eff.triggerScope ?? 'self';
    if (selfScope !== 'self') {
      // any_ally（「あなたの＜悪魔＞のシグニ1体がバニッシュされたとき」）は**被バニッシュ側自身も母集団に含む**
      // （自身が＜悪魔＞なら自分のバニッシュでも発火する）。既に場から離れているため下の field 走査では拾えず、
      // ここで拾わないと自己発火だけが落ちる。「他の」＝excludeSelf のみ自身を除外。
      if (selfScope !== 'any_ally' && selfScope !== 'any') continue;
      if (eff.triggerFilter?.excludeSelf) continue;
      if (eff.triggerFilter) {
        const { excludeSelf: _x, ...restFilter } = eff.triggerFilter;
        if (Object.keys(restFilter).length > 0
          && !matchesFilter(ctx.cardMap.get(getCardNum(banishedCardNum)), restFilter)) continue;
      }
      // condition/usageLimit は field 走査側と同じ条件で評価（WXDi-P16-074-E2 の FIELD_HAS_GATE 等）
      const ownerStateForCond = banishedOwnerIsMe ? myAfterState : opAfterState;
      const otherStateForCond = banishedOwnerIsMe ? opAfterState : myAfterState;
      if (eff.condition && !evalUseCondition(eff.condition, ownerStateForCond, otherStateForCond, ctx.cardMap, banishedCardNum, ctx.turnPhase, ctx.effectivePowers)) continue;
      if (!(banishedOwnerIsMe ? limitOkMy : limitOkOp)(eff)) continue;
    }
    // activeCondition チェック（「対戦相手のターンの間」等）
    const isBanishedOwnerTurn = ctx.activeUserId === banishedPlayerId;
    if (!checkActiveCondition(eff.activeCondition, banishedOwnerIsMe ? myAfterState : opAfterState, banishedOwnerIsMe ? opAfterState : myAfterState, isBanishedOwnerTurn, ctx.cardMap, banishedCardNum)) continue;
    const cardName = ctx.cardMap.get(banishedCardNum)?.CardName ?? banishedCardNum;
    entries.push({
      id: ctx.genId(), playerId: banishedPlayerId, cardNum: banishedCardNum, effectId: eff.effectId,
      label: `${cardName} の【バニッシュ時】効果`, effect: eff,
    });
  }

  // 2. 自分フィールド上シグニ＋ルリグのトリガー
  const isMyTurn = ctx.activeUserId === meId;
  for (const topNum of ownFieldSources(myAfterState)) {
    for (const eff of (ctx.effectsMap.get(topNum) ?? [])) {
      if (eff.effectType !== 'AUTO' || !eff.timing?.includes('ON_BANISH')) continue;
      const scope = eff.triggerScope ?? 'self';
      if (banishedOwnerIsMe  && scope !== 'any_ally' && scope !== 'any') continue;
      if (!banishedOwnerIsMe && scope !== 'any_opp'  && scope !== 'any') continue;
      // duringAttackPhase＝アタックフェイズ中のバニッシュのみ発火（「（対戦相手の）アタックフェイズの間、」WX18-002/WXEX1-18）。
      if (eff.triggerCondition?.duringAttackPhase && !(ctx.turnPhase ?? '').startsWith('ATTACK')) continue;
      // turnOwner＝反応側（me）のターン限定（'self'＝自分ターン／'opponent'＝相手ターン。「対戦相手のアタックフェイズ」等）。
      if (eff.triggerCondition?.turnOwner === 'self' && !isMyTurn) continue;
      if (eff.triggerCondition?.turnOwner === 'opponent' && isMyTurn) continue;
      // triggerFilter＝バニッシュされたシグニ側の限定（「あなたの＜悪魔＞のシグニ1体が」の＜悪魔＞・excludeSelf）。
      if (eff.triggerFilter?.excludeSelf && banishedCardNum === topNum) continue;
      if (eff.triggerFilter) {
        const { excludeSelf: _x, ...restFilter } = eff.triggerFilter;
        if (Object.keys(restFilter).length > 0
          && !matchesFilter(ctx.cardMap.get(getCardNum(banishedCardNum)), restFilter)) continue;
      }
      // condition を持つAUTOは条件を満たす場合のみ収集（WXDi-P16-074-E2 の FIELD_HAS_GATE 等）
      if (eff.condition && !evalUseCondition(eff.condition, myAfterState, opAfterState, ctx.cardMap, topNum, ctx.turnPhase, ctx.effectivePowers)) continue;
      // usageLimit（《ターン1回/2回》）: actions_done（永続）＋今回の収集内で回数上限に達していればスキップ。
      if (!limitOkMy(eff)) continue;
      const cardName = ctx.cardMap.get(topNum)?.CardName ?? topNum;
      entries.push({
        id: ctx.genId(), playerId: meId, cardNum: topNum, effectId: eff.effectId,
        label: `${cardName} の【自】効果（バニッシュ時）`, effect: eff,
      });
    }
  }

  // 3. 相手フィールド上シグニ＋ルリグのトリガー
  const isOpTurn = ctx.activeUserId === opId;
  for (const topNum of ownFieldSources(opAfterState)) {
    for (const eff of (ctx.effectsMap.get(topNum) ?? [])) {
      if (eff.effectType !== 'AUTO' || !eff.timing?.includes('ON_BANISH')) continue;
      const scope = eff.triggerScope ?? 'self';
      // 相手視点：「自分の味方がバニッシュ」= !banishedOwnerIsMe
      if (!banishedOwnerIsMe && scope !== 'any_ally' && scope !== 'any') continue;
      if (banishedOwnerIsMe  && scope !== 'any_opp'  && scope !== 'any') continue;
      // duringAttackPhase / turnOwner（反応側＝opId 視点）を section2 と対称に評価。
      if (eff.triggerCondition?.duringAttackPhase && !(ctx.turnPhase ?? '').startsWith('ATTACK')) continue;
      if (eff.triggerCondition?.turnOwner === 'self' && !isOpTurn) continue;
      if (eff.triggerCondition?.turnOwner === 'opponent' && isOpTurn) continue;
      if (eff.triggerFilter?.excludeSelf && banishedCardNum === topNum) continue;
      if (eff.triggerFilter) {
        const { excludeSelf: _x, ...restFilter } = eff.triggerFilter;
        if (Object.keys(restFilter).length > 0
          && !matchesFilter(ctx.cardMap.get(getCardNum(banishedCardNum)), restFilter)) continue;
      }
      // condition / usageLimit（相手＝opAfterState 視点で評価）
      if (eff.condition && !evalUseCondition(eff.condition, opAfterState, myAfterState, ctx.cardMap, topNum, ctx.turnPhase, ctx.effectivePowers)) continue;
      if (!limitOkOp(eff)) continue;
      const cardName = ctx.cardMap.get(topNum)?.CardName ?? topNum;
      entries.push({
        id: ctx.genId(), playerId: opId, cardNum: topNum, effectId: eff.effectId,
        label: `${cardName} の【自】効果（バニッシュ時）`, effect: eff,
      });
    }
  }

  return { entries, usedHostIds, usedGuestIds };
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
  // この離脱を引き起こした効果のオーナー userId（中央 diff の meta.causeOwnerId）。
  // undefined＝バトル/ルール処理など効果起因でない離脱＝byOwnEffect/byOpponentEffect ゲート付き効果は発火しない。
  causeOwnerId?: string,
): { entries: StackEntry[]; usedHostIds: string[]; usedGuestIds: string[] } {
  const entries: StackEntry[] = [];
  const usedHostIds: string[] = [];
  const usedGuestIds: string[] = [];
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
  const leftIsHost = leftPlayerId === ctx.hostId;
  const ownerStateAfter = leftIsHost ? afterHostState : afterGuestState;
  // watcher（味方）視点のターン。turnOwner 条件（「対戦相手/あなたのターンの間」）判定に使う。
  const watcherIsTurn = ctx.activeUserId === leftPlayerId;
  const allyLimitOk = mkLimitOk(ownerStateAfter.actions_done, leftIsHost ? usedHostIds : usedGuestIds);
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
      // turnOwner（「あなた/対戦相手のターンの間」）: watcher 視点のターンで絞る（WX19-003/WX25-P1-034 等）
      const to = eff.triggerCondition?.turnOwner;
      if (to === 'self' && !watcherIsTurn) continue;
      if (to === 'opponent' && watcherIsTurn) continue;
      // leftToZone:'hand'（「場から手札に戻ったとき」WXK02-041）: 離れたカードが所有者の手札に在中する場合のみ発火
      if (eff.triggerCondition?.leftToZone === 'hand' && !ownerStateAfter.hand.includes(leftCardNum)) continue;
      // byOpponentEffect（「対戦相手の効果によって場を離れたとき」WX19-026）: 原因効果のオーナーが watcher の相手側のときのみ。
      if (eff.triggerCondition?.byOpponentEffect && causeOwnerId === undefined) continue;
      if (eff.triggerCondition?.byOpponentEffect && causeOwnerId === leftPlayerId) continue;
      // usageLimit（《ターン1回/2回》）＝呼び出し側が usedHostIds/usedGuestIds を actions_done へ書き戻す（続き104 と同型）。
      if (!allyLimitOk(eff)) continue;
      entries.push({
        id: ctx.genId(), playerId: leftPlayerId, cardNum: topNum, effectId: eff.effectId,
        label: `${ctx.cardMap.get(getCardNum(topNum))?.CardName ?? topNum} の【自】効果（味方が場を離れたとき）`,
        effect: resolveLeaveFieldDynamicFilters(ctx.cardMap, eff, leftCard, leftUnder),
      });
    }
  }
  // 跨サイド any_opp（タスク16[C]機構③）: 「（あなたの効果によって）対戦相手のシグニが場を離れた/手札に戻ったとき」
  // ＝離脱したカードの**相手側**（＝効果を与えた側）の watcher（WXK11-049/WXDi-CP01-027-E2）。
  const oppId = leftIsHost ? ctx.guestId : ctx.hostId;
  const oppStateAfter = leftIsHost ? afterGuestState : afterHostState;
  const oppIsTurn = ctx.activeUserId === oppId;
  const oppLimitOk = mkLimitOk(oppStateAfter.actions_done, leftIsHost ? usedGuestIds : usedHostIds);
  const oppLrigTop = oppStateAfter.field.lrig.at(-1);
  const oppWatcherNums = [
    ...oppStateAfter.field.signi.flatMap(stack => stack?.length ? [stack[stack.length - 1]] : []),
    ...(oppLrigTop ? [oppLrigTop] : []),
  ];
  for (const topNum of oppWatcherNums) {
    for (const eff of (ctx.effectsMap.get(getCardNum(topNum)) ?? [])) {
      if (eff.effectType !== 'AUTO' || !eff.timing?.includes('ON_LEAVE_FIELD')) continue;
      if (eff.triggerScope !== 'any_opp') continue;
      if (eff.triggerFilter && !matchesFilter(leftCard, eff.triggerFilter)) continue;
      const to = eff.triggerCondition?.turnOwner;
      if (to === 'self' && !oppIsTurn) continue;
      if (to === 'opponent' && oppIsTurn) continue;
      if (eff.triggerCondition?.leftToZone === 'hand' && !ownerStateAfter.hand.includes(leftCardNum)) continue;
      // byOwnEffect（「**あなたの効果によって**対戦相手のシグニが…」）: watcher 自身の効果が原因のときのみ
      // （バトル・ルール処理・相手自身の効果では発火しない）。
      if (eff.triggerCondition?.byOwnEffect && causeOwnerId !== oppId) continue;
      if (eff.activeCondition && !checkActiveCondition(eff.activeCondition, oppStateAfter, ownerStateAfter, oppIsTurn, ctx.cardMap, topNum)) continue;
      if (!oppLimitOk(eff)) continue;
      entries.push({
        id: ctx.genId(), playerId: oppId, cardNum: topNum, effectId: eff.effectId,
        label: `${ctx.cardMap.get(getCardNum(topNum))?.CardName ?? topNum} の【自】効果（相手シグニが場を離れたとき）`,
        effect: resolveLeaveFieldDynamicFilters(ctx.cardMap, eff, leftCard, leftUnder),
      });
    }
  }
  return { entries, usedHostIds, usedGuestIds };
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
      // turnOwner（「あなたのターンの間、…引いたとき」WXK10-040）: drawer 視点のターンで絞る。
      const toDR = eff.triggerCondition?.turnOwner;
      if (toDR === 'self' && !isDrawerTurn) continue;
      if (toDR === 'opponent' && isDrawerTurn) continue;
      // duringAttackPhase（「アタックフェイズの間にあなたがカードをN枚以上引いたとき」WX11-030）。
      if (eff.triggerCondition?.duringAttackPhase && !(ctx.turnPhase ?? '').startsWith('ATTACK')) continue;
      // drawByDrawerOwnEffect（「あなたの効果1つによってあなたが…引いたとき」WXK10-040）: 自分の効果による
      // ドローのみ（相手効果に引かされた場合・通常ドローでは発火しない。execDraw が記録する last_draw_by_own_effect）。
      if (eff.triggerCondition?.drawByDrawerOwnEffect && !drawerState.last_draw_by_own_effect) continue;
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
      // 「対戦相手が【自分の効果で】引いたとき」限定（PR-423）＝drawer が自身の効果で引いた場合のみ発火。
      // reactor 自身の効果で drawer を引かせた場合（drawer.last_draw_by_own_effect=false）は誤発火しない。
      if (eff.triggerCondition?.drawByDrawerOwnEffect && !drawerState.last_draw_by_own_effect) continue;
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
  // 起動効果でセンタールリグへ一時付与された AUTO 能力も同じイベントで収集する。
  // GRANT_LRIG_ABILITY の実行結果は effectsMap ではなく lrig_granted_auto_effects に格納されるため、
  // ここを走査しないと ON_ENERGY_TO_TRASH の内側能力（SPDi43-12）が timing を持っていても no-op になる。
  const lrigTop = controllerState.field.lrig.at(-1);
  if (lrigTop && !controllerState.lrig_abilities_disabled) {
    for (const eff of controllerState.lrig_granted_auto_effects ?? []) {
      if (eff.effectType !== 'AUTO' || !eff.timing?.includes('ON_ENERGY_TO_TRASH')) continue;
      const owner = eff.triggerCondition?.energyTrashedOwner ?? 'any';
      const relevant = owner === 'self' ? fromControllerEnergy
        : owner === 'opponent' ? fromOppEnergy
        : fromControllerEnergy + fromOppEnergy;
      if (relevant <= 0) continue;
      if (eff.activeCondition && !checkActiveCondition(eff.activeCondition, controllerState, otherState, isControllerTurn, ctx.cardMap, lrigTop)) continue;
      if (eff.condition && !evalUseCondition(eff.condition, controllerState, otherState, ctx.cardMap, lrigTop, ctx.turnPhase, ctx.effectivePowers)) continue;
      if (!limitOk(eff)) continue;
      entries.push({
        id: ctx.genId(), playerId: controllerId, cardNum: lrigTop, effectId: eff.effectId,
        label: `${ctx.cardMap.get(lrigTop)?.CardName ?? lrigTop} の【自】効果（エナトラッシュ時・付与能力）`, effect: eff,
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
  // INSTALL_DELAYED_TRIGGER（B3）: controller に設置された「このターン、…がリフレッシュをした場合」
  // 遅延トリガーを収集する（WX11-024。refreshedOwner で発生源限定・省略=any）。
  for (const dt of controllerState.delayed_triggers ?? []) {
    if (dt.trigger?.timing !== 'ON_REFRESH') continue;
    const owner = dt.trigger.refreshedOwner ?? 'any';
    const relevant = owner === 'self' ? refreshedByController
      : owner === 'opponent' ? refreshedByOpp
      : refreshedByController + refreshedByOpp;
    if (relevant <= 0) continue;
    entries.push({
      id: ctx.genId(), playerId: controllerId, cardNum: 'DELAYED_TRIGGER', effectId: 'DELAYED_TRIGGER',
      label: 'このターンの遅延トリガー（リフレッシュ時）',
      effect: {
        effectId: 'DELAYED_TRIGGER', effectType: 'AUTO', timing: ['ON_REFRESH'],
        action: dt.effect, duration: 'INSTANT', mandatory: true, parseStatus: 'MANUAL',
      },
    });
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
 * ON_SIGNI_DOWN / ON_SIGNI_BECOMES_UP トリガーを収集する（タスク16[C]機構①・collectFreezeTriggers と同型）。
 * changedByOwner＝各所有者と状態が変わったシグニ番号（byEffect＝効果起因か。アタックダウン＝false）。
 * lrigNum＝センタールリグがアップした場合のカード番号（ON_SIGNI_BECOMES_UP＋upIncludesLrig のみ反応・WX20-051）。
 * 評価軸: triggerScope（self/any_ally 既定/any）／triggerFilter（story・cardName 部分一致・excludeSelf）／
 *   triggerCondition.byEffect（「効果によって」＝アタック/コストのダウンでは発火しない・WX05-040 公式注釈）／
 *   triggerCondition.duringAttackPhase（「アタックフェイズの間」＝ctx.turnPhase が ATTACK_* のときのみ）。
 * watcher は場シグニ＋センタールリグ＋キー（WXK11-015 はキーカード自身の AUTO）。
 */
export function collectSigniDownUpTriggers(
  ctx: TrigCtx,
  event: 'ON_SIGNI_DOWN' | 'ON_SIGNI_BECOMES_UP',
  changedByOwner: { ownerId: string; nums: string[]; lrigNum?: string | null; byEffect: boolean }[],
  hostState: PlayerState,
  guestState: PlayerState,
): { entries: StackEntry[]; usedHostIds: string[]; usedGuestIds: string[] } {
  const entries: StackEntry[] = [];
  const usedHostIds: string[] = [];
  const usedGuestIds: string[] = [];
  const isAttackPhase = (ctx.turnPhase ?? '').startsWith('ATTACK');
  for (const watcherIsHost of [true, false]) {
    const watcherId = watcherIsHost ? ctx.hostId : ctx.guestId;
    const watcherState = watcherIsHost ? hostState : guestState;
    const otherState = watcherIsHost ? guestState : hostState;
    if (watcherState.blocked_actions?.includes('BLOCK_OWN_SIGNI_AUTO')) continue;
    const watcherIsTurn = watcherId === ctx.activeUserId;
    const usedIds = watcherIsHost ? usedHostIds : usedGuestIds;
    const sources = [
      ...ownFieldSources(watcherState),
      ...(watcherState.field.key_piece ? [watcherState.field.key_piece] : []),
      ...(watcherState.field.key_piece_extra ?? []),
    ];
    for (const topNum of sources) {
      for (const eff of effsOf(ctx, topNum)) {
        if (eff.effectType !== 'AUTO' || !eff.timing?.includes(event)) continue;
        const scope = eff.triggerScope ?? 'any_ally';
        if (eff.triggerCondition?.duringAttackPhase && !isAttackPhase) continue;
        const to = eff.triggerCondition?.turnOwner;
        if (to === 'self' && !watcherIsTurn) continue;
        if (to === 'opponent' && watcherIsTurn) continue;
        if (eff.activeCondition && !checkActiveCondition(eff.activeCondition, watcherState, otherState, watcherIsTurn, ctx.cardMap, topNum)) continue;
        if (eff.condition && !evalUseCondition(eff.condition, watcherState, otherState, ctx.cardMap, topNum, ctx.turnPhase, ctx.effectivePowers)) continue;
        const max = eff.usageLimit === 'once_per_turn' ? 1 : eff.usageLimit === 'twice_per_turn' ? 2 : Infinity;
        for (const grp of changedByOwner) {
          const changedIsWatcherOwn = grp.ownerId === watcherId;
          if (scope === 'any_opp' && changedIsWatcherOwn) continue;
          if (scope === 'any_ally' && !changedIsWatcherOwn) continue;
          if (eff.triggerCondition?.byEffect && !grp.byEffect) continue;
          const changedNums = [
            ...grp.nums,
            ...(event === 'ON_SIGNI_BECOMES_UP' && eff.triggerCondition?.upIncludesLrig && grp.lrigNum ? [grp.lrigNum] : []),
          ];
          for (const changedNum of changedNums) {
            if (scope === 'self' && changedNum !== topNum) continue;
            if (eff.triggerFilter?.excludeSelf && changedNum === topNum) continue;
            if (eff.triggerFilter) {
              const { excludeSelf: _x, ...restFilter } = eff.triggerFilter;
              if (Object.keys(restFilter).length > 0
                && !matchesFilter(ctx.cardMap.get(getCardNum(changedNum)), restFilter, ctx.effectivePowers?.get(changedNum))) continue;
            }
            const used = (watcherState.actions_done ?? []).filter(id => id === eff.effectId).length
              + usedIds.filter(id => id === eff.effectId).length;
            if (used >= max) break;
            if (eff.usageLimit === 'once_per_turn' || eff.usageLimit === 'twice_per_turn') usedIds.push(eff.effectId);
            const cardName = ctx.cardMap.get(getCardNum(topNum))?.CardName ?? topNum;
            entries.push({
              id: ctx.genId(), playerId: watcherId, cardNum: topNum, effectId: eff.effectId,
              label: `${cardName} の【自】効果（${event === 'ON_SIGNI_DOWN' ? 'ダウン時' : 'アップ時'}）`, effect: eff, triggeringCardNum: changedNum,
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
  opState?: PlayerState, opId?: string, costSourceNum?: string,
): { entries: StackEntry[]; usedLimitIds: string[] } {
  const entries: StackEntry[] = [];
  const usedLimitIds: string[] = [];
  if (discardedNums.length === 0) return { entries, usedLimitIds };
  const limitOk = mkLimitOk(myState.actions_done, usedLimitIds);
  const matchesTrigFilter = (eff: CardEffect): boolean =>
    !eff.triggerFilter || discardedNums.some(cn => matchesFilter(ctx.cardMap.get(cn), eff.triggerFilter));
  // ON_DISCARDED_AS_COST: 捨てられたカード自身（コストとして捨てられた場合のみ）
  // 発生源限定「あなたの＜X＞のシグニの【出】【起】能力のコストとして」＝コストを支払った能力の host シグニ
  //（costSourceNum）の CardClass に X を含むときだけ発火（Opusタスク12(xxiv)）。
  const costSrcClass = costSourceNum ? (ctx.cardMap.get(costSourceNum)?.CardClass ?? '') : '';
  if (asCost) {
    for (const cn of discardedNums) {
      for (const eff of (ctx.effectsMap.get(cn) ?? [])) {
        if (eff.effectType !== 'AUTO' || !eff.timing?.includes('ON_DISCARDED_AS_COST')) continue;
        const reqStory = eff.triggerCondition?.discardCostSourceStory;
        if (reqStory && !costSrcClass.includes(reqStory)) continue;
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
      // any_opp＝「対戦相手が捨てたとき」＝discarder 自身の場では発火しない（相手フィールド path で拾う）。
      if (eff.triggerScope === 'any_opp') continue;
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
  // 自分のセンタールリグ（ON_HAND_DISCARDED self/any）。signi のみ走査で LRIG が発火しなかった
  // （続き96・アロス・ピルルク ACRO/MIRA/kl＝WXEX2-12/WXDi-P11-006/WXDi-P14-007・月雪ミヤコ WX25-CP1-016）。
  // BLOCK_OWN_SIGNI_AUTO はシグニ限定なので LRIG には適用しない。
  const myLrigHD = myState.field.lrig.at(-1);
  if (myLrigHD) {
    for (const eff of (ctx.effectsMap.get(myLrigHD) ?? [])) {
      if (eff.effectType !== 'AUTO' || !eff.timing?.includes('ON_HAND_DISCARDED')) continue;
      if (eff.triggerScope === 'any_opp') continue; // 相手が捨てたとき＝discarder 自身の LRIG では発火しない
      const isAny = eff.triggerScope === 'any';
      if (eff.triggerCondition?.turnOwner === 'opponent') { if (myIsTurn) continue; }
      else if (!isAny && !myIsTurn) continue;
      if (!matchesTrigFilter(eff)) continue;
      if (!limitOk(eff)) continue;
      entries.push({
        id: ctx.genId(), playerId: discarderId, cardNum: myLrigHD, effectId: eff.effectId,
        label: `${ctx.cardMap.get(myLrigHD)?.CardName ?? myLrigHD}【自】手札捨て時`, effect: eff,
      });
    }
  }
  // ON_HAND_DISCARDED 'any'/'any_opp': discarder の相手フィールド（センタールリグ＋シグニ）の watcher を
  // 相手コントローラーで収集。'any'＝いずれかが捨てたとき（自分の捨ても含む）／'any_opp'＝対戦相手（＝discarder）
  // が捨てたときのみ（「あなたの効果によって対戦相手が手札を捨てたとき」WXDi-P04-063 等・続き175・Opusタスク16）。
  // LRIG は BLOCK_OWN_SIGNI_AUTO の対象外（シグニ限定）＝別途走査（続き96 の path1 と同じ扱い）。
  if (opState && opId) {
    const oppBlocked = !!opState.blocked_actions?.includes('BLOCK_OWN_SIGNI_AUTO');
    const oppSources: Array<{ num: string | undefined; isLrig: boolean }> = [
      { num: opState.field.lrig.at(-1), isLrig: true },
      ...opState.field.signi.map(s => ({ num: s?.at(-1), isLrig: false })),
    ];
    for (const { num: topNum, isLrig } of oppSources) {
      if (!topNum) continue;
      if (oppBlocked && !isLrig) continue;
      for (const eff of (ctx.effectsMap.get(topNum) ?? [])) {
        if (eff.effectType !== 'AUTO' || !eff.timing?.includes('ON_HAND_DISCARDED')) continue;
        if (eff.triggerScope !== 'any' && eff.triggerScope !== 'any_opp') continue;
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
  // ownFieldSources = 場シグニ＋センタールリグ。signi のみ走査だと LRIG watcher が発火しなかった
  // （続き96・ON_OPP_ARTS_USE self の WX16-003）。姉妹関数 collectArtsUseTriggers は元から lrig 対応済み。
  for (const topNum of ownFieldSources(myState)) {
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
  usedArtsNum?: string,
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
      // triggerFilter: 使用したアーツの色条件（「あなたが緑のアーツを使用したとき」WXK01-043）。
      // filter があるのにアーツが特定できない呼び出しでは発火させない（過剰発火抑止）。
      if (eff.triggerFilter && !matchesFilter(usedArtsNum ? ctx.cardMap.get(getCardNum(usedArtsNum)) : undefined, eff.triggerFilter)) continue;
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
): { entries: StackEntry[]; usedHostIds: string[]; usedGuestIds: string[] } {
  const entries: StackEntry[] = [];
  const opId = ownerId === ctx.hostId ? ctx.guestId : ctx.hostId;
  // usageLimit（《ターン1回/2回》）を watcher 側で判定し、消費 effectId を返す（呼び出し元が actions_done へ
  // 書き戻す＝他コレクタと同型）。この関数にはガード自体が丸ごと無く、「味方のシグニが場に出るたびに◯◯
  // （ターンに1回）」型が同一ターンに複数体召喚すると毎回発火する過剰効果だった（続き104・実カード32枚）。
  const usedHostIds: string[] = [];
  const usedGuestIds: string[] = [];
  const ownerIsHost = ownerId === ctx.hostId;
  const limitOkAlly = mkLimitOk(myState.actions_done, ownerIsHost ? usedHostIds : usedGuestIds);
  const limitOkOpp = mkLimitOk(opState.actions_done, ownerIsHost ? usedGuestIds : usedHostIds);
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
  // センタールリグも any_ally/any watcher に含める（ON_PLAY 限定だと ON_ATTACK_SIGNI/ON_BANISH/ON_BLOOM の
  // LRIG watcher が構造的に発火しなかった＝続き96・WX12-001/WX14-003/WXDi-P08-007 等）。scope フィルタが発火可否を担保。
  const myLrigWatcher = myState.field.lrig.at(-1);
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
      if (!limitOkAlly(eff)) continue; // 《ターン1回/2回》＝全ゲート通過後に消費する（最後に置く）
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
  // 相手のセンタールリグも any_opp/any watcher に含める（signi のみ走査だと相手 LRIG watcher が
  // 構造的に発火しなかった＝続き96・ON_BANISH any_opp の WXEX2-26 等）。
  for (const topNum of ownFieldSources(opState)) {
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
      // placedOnTrapZone（WX21-025）/ placedOnGateZone（WXK10-044）: トリガー元シグニの持ち主（myState）の
      // ゾーン状態（signi_traps / own_gate_zones）に【トラップ】/【ゲート】がある場合のみ（タスク16[C]機構⑤）。
      if (eff.triggerCondition?.placedOnTrapZone || eff.triggerCondition?.placedOnGateZone) {
        if (event !== 'ON_PLAY') continue;
        const ziTrig2 = myState.field.signi.findIndex(s => s?.at(-1) === triggeringCardNum);
        if (ziTrig2 < 0) continue;
        if (eff.triggerCondition.placedOnTrapZone && !(myState.field.signi_traps?.[ziTrig2])) continue;
        if (eff.triggerCondition.placedOnGateZone && !(myState.own_gate_zones ?? []).includes(ziTrig2)) continue;
      }
      if (!limitOkOpp(eff)) continue; // 《ターン1回/2回》＝全ゲート通過後に消費する（最後に置く）
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
        if (!limitOkAlly(eff)) continue;
        const cardName = ctx.cardMap.get(artsNum)?.CardName ?? artsNum;
        entries.push({
          id: ctx.genId(), playerId: ownerId, cardNum: artsNum, effectId: eff.effectId,
          label: `${cardName} の【自】効果（シグニ召喚時）`, effect: eff,
        });
      }
    }
  }

  return { entries, usedHostIds, usedGuestIds };
}

/**
 * 【シード】が開花したとき（ON_BLOOM）のトリガーを収集する（Stage2 抽出）。
 * 開花シグニ自身の self ON_BLOOM ＋場の他シグニの any_ally/any（collectFieldTriggers 経由）。
 * 開花は「場に出た」扱いではないため ON_PLAY は発火させない（公式ルール）。
 */
export function collectBloomTriggers(
  ctx: TrigCtx, bloomedInstanceId: string, myState: PlayerState, opState: PlayerState, ownerId: string,
): { entries: StackEntry[]; usedHostIds: string[]; usedGuestIds: string[] } {
  const entries: StackEntry[] = [];
  const usedHostIds: string[] = [];
  const usedGuestIds: string[] = [];
  const ownerIsHost = ownerId === ctx.hostId;
  const limitOkSelf = mkLimitOk(myState.actions_done, ownerIsHost ? usedHostIds : usedGuestIds);
  const cn = getCardNum(bloomedInstanceId);
  const cardName = ctx.cardMap.get(cn)?.CardName ?? cn;
  for (const eff of (ctx.effectsMap.get(cn) ?? [])) {
    if (eff.effectType !== 'AUTO' || !eff.timing?.includes('ON_BLOOM')) continue;
    if ((eff.triggerScope ?? 'self') !== 'self') continue;
    if (!limitOkSelf(eff)) continue;
    entries.push({
      id: ctx.genId(), playerId: ownerId, cardNum: bloomedInstanceId, effectId: eff.effectId,
      label: `${cardName} の【自】効果（開花時）`, effect: eff,
    });
  }
  const ft = collectFieldTriggers(ctx, 'ON_BLOOM', bloomedInstanceId, myState, opState, ownerId);
  entries.push(...ft.entries);
  usedHostIds.push(...ft.usedHostIds);
  usedGuestIds.push(...ft.usedGuestIds);
  return { entries, usedHostIds, usedGuestIds };
}

/**
 * ターン/フェイズ境界トリガー（ON_TURN_START/END・ON_ATTACK_PHASE_START・ON_MAIN_PHASE_START・ON_LRIG_ATTACK_STEP_START）を収集する（Stage2 抽出）。
 * myState=ターンプレイヤー（=視点 meId）の状態。自シグニ/キーワードトークン/自ルリグ/相手場 any_opp/ルリグトラッシュ自己回収/
 * 相手ルリグ付与AUTO/FUTURE SESSION③/PR-Di035 を保持。ctx.meId で my/op を確定。
 */
export function collectTurnTriggers(
  ctx: TrigCtx,
  timing: 'ON_TURN_START' | 'ON_TURN_END' | 'ON_ATTACK_PHASE_START' | 'ON_MAIN_PHASE_START' | 'ON_LRIG_ATTACK_STEP_START',
  myState: PlayerState,
  opState: PlayerState,
): { entries: StackEntry[]; usedHostIds: string[]; usedGuestIds: string[] } {
  const entries: StackEntry[] = [];
  const meId = ctx.meId ?? ctx.hostId;
  const opId = meId === ctx.hostId ? ctx.guestId : ctx.hostId;
  // usageLimit（《ターン1回/2回》）を消費した effectId を watcher 側で返す（呼び出し元が actions_done へ
  // 書き戻す＝他コレクターと同型。返さないと同一ターン内にフェイズ境界を跨いで何度でも再発火する。続き119）。
  const usedHostIds: string[] = [];
  const usedGuestIds: string[] = [];
  const meIsHost = meId === ctx.hostId;
  const limitOkMy = mkLimitOk(myState.actions_done, meIsHost ? usedHostIds : usedGuestIds); // 自分側 entries 用
  const limitOkOp = mkLimitOk(opState.actions_done, meIsHost ? usedGuestIds : usedHostIds); // 相手側 entries 用
  const labelSuffix = timing === 'ON_TURN_START' ? 'ターン開始時'
    : timing === 'ON_TURN_END' ? 'ターン終了時'
    : timing === 'ON_MAIN_PHASE_START' ? 'メインフェイズ開始時'
    : timing === 'ON_LRIG_ATTACK_STEP_START' ? 'ルリグアタックステップ開始時' : 'アタックフェイズ開始時';

  const ownAutoBlockedTurn = myState.blocked_actions?.includes('BLOCK_OWN_SIGNI_AUTO');
  // collectTurnTriggers はターンプレイヤー=自分が主体（isOwnerTurn: my=true / op=false）
  const myAbilitiesRemovedTurn = collectContinuousAbilitiesRemovedSigni(myState, opState, true, ctx.effectsMap, ctx.cardMap);
  const opAbilitiesRemovedTurn = collectContinuousAbilitiesRemovedSigni(opState, myState, false, ctx.effectsMap, ctx.cardMap);
  // 自分のフィールドシグニ（self）
  for (const stack of myState.field.signi) {
    if (!stack?.length) continue;
    const topNum = stack[stack.length - 1];
    if (ownAutoBlockedTurn) continue;
    if (myAbilitiesRemovedTurn.has(topNum)) continue;
    for (const eff of (ctx.effectsMap.get(topNum) ?? [])) {
      if (eff.effectType !== 'AUTO' || !eff.timing?.includes(timing)) continue;
      if ((eff.triggerScope ?? 'self') !== 'self') continue;
      if (eff.condition && !evalUseCondition(eff.condition, myState, opState, ctx.cardMap, topNum, ctx.turnPhase, ctx.effectivePowers)) continue;
      if (!limitOkMy(eff)) continue;
      const cardName = ctx.cardMap.get(topNum)?.CardName ?? topNum;
      entries.push({
        id: ctx.genId(), playerId: meId, cardNum: topNum, effectId: eff.effectId,
        label: `${cardName} の【自】効果（${labelSuffix}）`, effect: eff,
      });
    }
  }

  // キーワードトークン効果（GRANT_KEYWORD で付与されたキーワードが ON_TURN_END 等を持つ場合）
  const KEYWORD_TOKEN_MAP: Record<string, string> = { 'みこみこ親衛隊': 'WX25-P3-TK03' };
  const myGrantsKT = myState.keyword_grants ?? {};
  for (const stack of myState.field.signi) {
    if (!stack?.length) continue;
    const topNumKT = stack[stack.length - 1];
    if (ownAutoBlockedTurn) continue;
    if (myAbilitiesRemovedTurn.has(topNumKT)) continue;
    for (const kw of (myGrantsKT[topNumKT] ?? [])) {
      const tokenCardKT = KEYWORD_TOKEN_MAP[kw];
      if (!tokenCardKT) continue;
      for (const eff of (ctx.effectsMap.get(tokenCardKT) ?? [])) {
        if (eff.effectType !== 'AUTO' || !eff.timing?.includes(timing)) continue;
        if (!limitOkMy(eff)) continue;
        const cardNameKT = ctx.cardMap.get(topNumKT)?.CardName ?? topNumKT;
        entries.push({
          id: ctx.genId(), playerId: meId, cardNum: topNumKT, effectId: `${tokenCardKT}:${eff.effectId}:${topNumKT}`,
          label: `${cardNameKT}【${kw}】（${labelSuffix}）`, effect: eff,
        });
      }
    }
  }

  // 自分のルリグ
  const myLrigNum = myState.field.lrig.at(-1);
  if (myLrigNum) {
    for (const eff of (ctx.effectsMap.get(myLrigNum) ?? [])) {
      if (eff.effectType !== 'AUTO' || !eff.timing?.includes(timing)) continue;
      if (eff.activeCondition && !checkActiveCondition(eff.activeCondition, myState, opState, true, ctx.cardMap, myLrigNum)) continue;
      if (!limitOkMy(eff)) continue;
      const cardName = ctx.cardMap.get(myLrigNum)?.CardName ?? myLrigNum;
      entries.push({
        id: ctx.genId(), playerId: meId, cardNum: myLrigNum, effectId: eff.effectId,
        label: `${cardName} の【自】効果（${labelSuffix}）`, effect: eff,
      });
    }
  }

  // 相手フィールドシグニ（any_opp / any でこちらのターンにも反応するカード）
  for (const stack of opState.field.signi) {
    if (!stack?.length) continue;
    const topNum = stack[stack.length - 1];
    if (opAbilitiesRemovedTurn.has(topNum)) continue;
    for (const eff of (ctx.effectsMap.get(topNum) ?? [])) {
      if (eff.effectType !== 'AUTO' || !eff.timing?.includes(timing)) continue;
      const scope = eff.triggerScope ?? 'self';
      if (scope !== 'any_opp' && scope !== 'any') continue;
      if (!limitOkOp(eff)) continue;
      const cardName = ctx.cardMap.get(topNum)?.CardName ?? topNum;
      entries.push({
        id: ctx.genId(), playerId: opId, cardNum: topNum, effectId: eff.effectId,
        label: `${cardName} の【自】効果（${labelSuffix}）`, effect: eff,
      });
    }
  }

  // 相手のセンタールリグ（any_opp/any でこちらのターンにも反応する印刷【自】）。
  // 相手フィールド走査が signi のみで LRIG が構造的に発火しなかった（続き96・ON_ATTACK_PHASE_START の
  // WX12-002/WX19-002/WX21-001 等11枚）。own側ルリグと同じく activeCondition で発火可否を担保する。
  const opLrigNumTurn = opState.field.lrig.at(-1);
  if (opLrigNumTurn) {
    for (const eff of (ctx.effectsMap.get(opLrigNumTurn) ?? [])) {
      if (eff.effectType !== 'AUTO' || !eff.timing?.includes(timing)) continue;
      const scope = eff.triggerScope ?? 'self';
      if (scope !== 'any_opp' && scope !== 'any') continue;
      if (eff.activeCondition && !checkActiveCondition(eff.activeCondition, opState, myState, false, ctx.cardMap, opLrigNumTurn)) continue;
      if (!limitOkOp(eff)) continue;
      const cardName = ctx.cardMap.get(opLrigNumTurn)?.CardName ?? opLrigNumTurn;
      entries.push({
        id: ctx.genId(), playerId: opId, cardNum: opLrigNumTurn, effectId: eff.effectId,
        label: `${cardName} の【自】効果（${labelSuffix}）`, effect: eff,
      });
    }
  }

  // 自分のルリグトラッシュ（ARTS_SELF_RECYCLE_ON_TRIGGER）
  for (const artsNum of (myState.lrig_trash ?? [])) {
    for (const eff of (ctx.effectsMap.get(artsNum) ?? [])) {
      if (eff.effectType !== 'AUTO' || !eff.timing?.includes(timing)) continue;
      const act = eff.action as StubAction;
      if (act.type !== 'STUB' || act.id !== 'ARTS_SELF_RECYCLE_ON_TRIGGER') continue;
      if (!limitOkMy(eff)) continue;
      const cardName = ctx.cardMap.get(artsNum)?.CardName ?? artsNum;
      entries.push({
        id: ctx.genId(), playerId: meId, cardNum: artsNum, effectId: eff.effectId,
        label: `${cardName} の【自】効果（${labelSuffix}）`, effect: eff,
      });
    }
  }

  // 相手ルリグの付与AUTO（lrig_granted_auto_effects: any_opp/any scope）
  for (const eff of (opState.lrig_granted_auto_effects ?? [])) {
    if (eff.effectType !== 'AUTO' || !eff.timing?.includes(timing)) continue;
    const scope = eff.triggerScope ?? 'self';
    if (scope !== 'any_opp' && scope !== 'any') continue;
    if (!limitOkOp(eff)) continue;
    const opLrigNum = opState.field.lrig.at(-1) ?? '';
    entries.push({
      id: ctx.genId(), playerId: opId, cardNum: opLrigNum, effectId: eff.effectId,
      label: `ルリグ付与効果（${labelSuffix}）`, effect: eff,
    });
  }

  // FUTURE SESSION③: 次のAPSにプリオケシグニへアタック時トラッシュ能力を付与（フラグ検出）
  if (timing === 'ON_ATTACK_PHASE_START' && myState.pending_prioke_attack_trash_grant) {
    const priokeSignis = myState.field.signi.flatMap(s => {
      const top = s?.at(-1);
      return (top && (ctx.cardMap.get(top)?.CardClass ?? '').includes('プリオケ')) ? [top] : [];
    });
    if (priokeSignis.length > 0) {
      entries.push({
        id: ctx.genId(), playerId: meId, cardNum: 'WX26-CP1-001', effectId: 'WX26-CP1-001-DELAYED-FS3',
        label: 'FUTURE SESSION③ プリオケシグニへアタック時トラッシュ能力付与',
        effect: {
          effectId: 'WX26-CP1-001-DELAYED-FS3', effectType: 'AUTO', timing: ['ON_ATTACK_PHASE_START'],
          action: { type: 'STUB', id: 'INTERNAL_APPLY_PRIOKE_ATTACK_TRASH' } as StubAction,
          duration: 'INSTANT', mandatory: true, parseStatus: 'MANUAL',
        },
      });
    }
  }

  // PR-Di035 OPEN DREAM LAND!: 次のAPSにプリパラ共通色・レベル3種類チェック（フラグ検出）
  if (timing === 'ON_ATTACK_PHASE_START' && myState.pending_pridi035_paradise) {
    entries.push({
      id: ctx.genId(), playerId: meId, cardNum: 'PR-Di035', effectId: 'PR-Di035-DELAYED-PARADISE',
      label: 'OPEN DREAM LAND! 色別効果（アタックフェイズ開始時）',
      effect: {
        effectId: 'PR-Di035-DELAYED-PARADISE', effectType: 'AUTO', timing: ['ON_ATTACK_PHASE_START'],
        action: { type: 'STUB', id: 'PRDI035_APPLY_PARADISE' } as StubAction,
        duration: 'INSTANT', mandatory: true, parseStatus: 'MANUAL',
      },
    });
  }

  // INSTALL_DELAYED_TRIGGER（B3）: 「**次の**あなたのアタックフェイズ開始時、…」等のターン境界/フェイズ遅延トリガー
  // （§3 Opusタスク10 パターンF-4）。従来 delayed_triggers を見ていたのは ON_REFRESH だけで、フェイズ系の
  // 遅延は parser 側で遅延句が落ちて**即時実行**になっていた（＝アタックフェイズを待たずにその場で発動する過剰効果）。
  for (const dt of myState.delayed_triggers ?? []) {
    if (dt.trigger?.timing !== timing) continue;
    entries.push({
      id: ctx.genId(), playerId: meId, cardNum: 'DELAYED_TRIGGER', effectId: 'DELAYED_TRIGGER',
      label: `このターンの遅延トリガー（${labelSuffix}）`,
      effect: {
        effectId: 'DELAYED_TRIGGER', effectType: 'AUTO', timing: [timing],
        action: dt.effect, duration: 'INSTANT', mandatory: true, parseStatus: 'MANUAL',
      },
    });
  }

  return { entries, usedHostIds, usedGuestIds };
}

/**
 * ON_ALLY_PLAY_OR_OPP_HAND_DISCARD（OR複合・WXDi-P11-064「あなたのターンの間、あなたの他の＜天使＞のシグニが
 * 場に出る か あなたの効果で対戦相手が手札を捨てたとき」）のトリガーを収集する（C1・2026-06-29 配線）。
 * 「あなたのターンの間」＝controller がターンプレイヤーのときのみ。allyPlacedNums=この解決で controller 場に出たシグニ／
 * oppDiscardCount=この解決で相手手札→トラッシュに置かれた枚数。play 枝は triggerFilter（excludeSelf/story）で絞る。
 * ⚠ 近似：「あなたの効果によって」の発生源限定は未判定（相手効果での相手手札捨ても発火しうる）。usedOncePerTurnIds は呼び出し側で永続化。
 */
export function collectAllyPlayOrOppDiscardTriggers(
  ctx: TrigCtx,
  controllerId: string,
  controllerState: PlayerState,
  allyPlacedNums: string[],
  oppDiscardCount: number,
): { entries: StackEntry[]; usedOncePerTurnIds: string[] } {
  const entries: StackEntry[] = [];
  const usedOncePerTurnIds: string[] = [];
  if (controllerId !== ctx.activeUserId) return { entries, usedOncePerTurnIds }; // 「あなたのターンの間」
  if (controllerState.blocked_actions?.includes('BLOCK_OWN_SIGNI_AUTO')) return { entries, usedOncePerTurnIds };
  const limitOk = mkLimitOk(controllerState.actions_done, usedOncePerTurnIds);
  // ⚠上の BLOCK_OWN_SIGNI_AUTO 早期 return はシグニ限定の封じだが、ここでは関数全体を止めるため
  //   ルリグ watcher も巻き添えで止まる（該当実カード0のため既知の近似として据置）。
  for (const topNum of ownFieldSources(controllerState)) {
    for (const eff of effsOf(ctx, topNum)) {
      if (eff.effectType !== 'AUTO' || !eff.timing?.includes('ON_ALLY_PLAY_OR_OPP_HAND_DISCARD')) continue;
      const filter = eff.triggerFilter;
      // play 枝：味方が場に出た（excludeSelf＝発火元自身は除外／story 等は triggerFilter で照合）
      const playOk = allyPlacedNums.some(n => {
        if (filter?.excludeSelf && n === topNum) return false;
        return !filter || matchesFilter(ctx.cardMap.get(getCardNum(n)), filter);
      });
      // discard 枝：相手手札がトラッシュに置かれた（filter は play 枝専用＝discard 枝には適用しない）
      const discardOk = oppDiscardCount > 0;
      if (!playOk && !discardOk) continue;
      if (!limitOk(eff)) continue;
      const cardName = ctx.cardMap.get(topNum)?.CardName ?? topNum;
      entries.push({
        id: ctx.genId(), playerId: controllerId, cardNum: topNum, effectId: eff.effectId,
        label: `${cardName} の【自】効果（味方場出し/相手手札捨て時）`, effect: eff,
      });
    }
  }
  return { entries, usedOncePerTurnIds };
}

/**
 * ON_MATERIAL_USED の「あなたが《改造素材》を使用したとき」（materialUsedByPlayer）変種を収集する（改造素材機構 Step3a・2026-06-29）。
 * 使用者 userId の場シグニ／ルリグの ON_MATERIAL_USED AUTO のうち triggerCondition.materialUsedByPlayer===true のものを発火。
 * 対象シグニ不要（プレイヤー起点）＝WXK09-047-E2（エナから電機回収）/WXK09-049-E1（デッキから電機サーチ）。
 * ⚠「このシグニに/他の味方に使用されたとき」（self/any_ally・対象シグニ依存）は Step2（トークン3択の対象捕捉）が前提＝別途。
 * usedOncePerTurnIds は呼び出し側で userState の actions_done に永続化すること。
 */
export function collectMaterialUsedByPlayerTriggers(
  ctx: TrigCtx, userId: string, userState: PlayerState,
): { entries: StackEntry[]; usedOncePerTurnIds: string[] } {
  const entries: StackEntry[] = [];
  const usedOncePerTurnIds: string[] = [];
  if (userState.blocked_actions?.includes('BLOCK_OWN_SIGNI_AUTO')) return { entries, usedOncePerTurnIds };
  const limitOk = mkLimitOk(userState.actions_done, usedOncePerTurnIds);
  for (const topNum of ownFieldSources(userState)) {
    for (const eff of effsOf(ctx, topNum)) {
      if (eff.effectType !== 'AUTO' || !eff.timing?.includes('ON_MATERIAL_USED')) continue;
      if (!eff.triggerCondition?.materialUsedByPlayer) continue;
      if (!limitOk(eff)) continue;
      const cardName = ctx.cardMap.get(getCardNum(topNum))?.CardName ?? topNum;
      entries.push({
        id: ctx.genId(), playerId: userId, cardNum: topNum, effectId: eff.effectId,
        label: `${cardName} の【自】効果（改造素材を使用したとき）`, effect: eff,
      });
    }
  }
  return { entries, usedOncePerTurnIds };
}

/**
 * ON_MATERIAL_USED の「このシグニに/あなたの他のシグニに《改造素材》が使用されたとき」（self/any_ally）変種を収集する（改造素材機構 Step3b・2026-06-29）。
 * targetNums=この解決で《改造素材》が使用された対象シグニ（所有者 ownerId の場）。ownerState の場シグニ/ルリグから ON_MATERIAL_USED AUTO
 * （materialUsedByPlayer でないもの）を triggerScope で絞る：self（W が targetNums に含まれる）／any_ally+excludeSelf（W 以外の対象がある）。
 * triggeringCardNum に対象シグニを渡す（targetsTriggerSource 用）。usedOncePerTurnIds は呼び出し側で永続化。
 */
export function collectMaterialUsedOnSigniTriggers(
  ctx: TrigCtx, targetNums: string[], ownerId: string, ownerState: PlayerState,
): { entries: StackEntry[]; usedOncePerTurnIds: string[] } {
  const entries: StackEntry[] = [];
  const usedOncePerTurnIds: string[] = [];
  if (targetNums.length === 0) return { entries, usedOncePerTurnIds };
  if (ownerState.blocked_actions?.includes('BLOCK_OWN_SIGNI_AUTO')) return { entries, usedOncePerTurnIds };
  const limitOk = mkLimitOk(ownerState.actions_done, usedOncePerTurnIds);
  const targetSet = new Set(targetNums);
  for (const topNum of ownFieldSources(ownerState)) {
    for (const eff of effsOf(ctx, topNum)) {
      if (eff.effectType !== 'AUTO' || !eff.timing?.includes('ON_MATERIAL_USED')) continue;
      if (eff.triggerCondition?.materialUsedByPlayer) continue; // materialUsedByPlayer 変種は別収集
      const scope = eff.triggerScope ?? 'self';
      let trgSigni: string | undefined;
      if (scope === 'any_ally') {
        trgSigni = targetNums.find(n => n !== topNum); // excludeSelf＝発火元以外の対象
        if (!trgSigni) continue;
      } else { // self（既定）＝対象が発火元自身
        if (!targetSet.has(topNum)) continue;
        trgSigni = topNum;
      }
      if (!limitOk(eff)) continue;
      const cardName = ctx.cardMap.get(getCardNum(topNum))?.CardName ?? topNum;
      entries.push({
        id: ctx.genId(), playerId: ownerId, cardNum: topNum, effectId: eff.effectId,
        label: `${cardName} の【自】効果（改造素材が使用されたとき）`, effect: eff, triggeringCardNum: trgSigni,
      });
    }
  }
  return { entries, usedOncePerTurnIds };
}

/**
 * ON_SIGNI_BANISH_OPPONENT_BY_EFFECT（「あなたの＜ウェポン＞シグニが効果で対戦相手シグニをバニッシュしたとき」WX07-036）を収集する（C1・2026-06-29）。
 * banisherCardNum=この解決でバニッシュを行った効果の発生源シグニ（＝解決中 entry.cardNum）／banisherOwnerId=その所有者。
 * banisherOwnerState の場シグニ/ルリグから ON_SIGNI_BANISH_OPPONENT_BY_EFFECT AUTO（any_ally/any）を triggerFilter（ウェポン等・バニッシュ実行シグニに対して）で絞って収集。
 * ⚠ 近似：効果解決＝「効果によって」を満たすとみなす／バニッシュ実行シグニは entry.cardNum で近似（連鎖の実発生源は未追跡）。
 */
export function collectBanishOppByEffectTriggers(
  ctx: TrigCtx, banisherCardNum: string, banisherOwnerId: string, banisherOwnerState: PlayerState,
): { entries: StackEntry[]; usedOncePerTurnIds: string[] } {
  const entries: StackEntry[] = [];
  const usedOncePerTurnIds: string[] = [];
  if (banisherOwnerState.blocked_actions?.includes('BLOCK_OWN_SIGNI_AUTO')) return { entries, usedOncePerTurnIds };
  const limitOk = mkLimitOk(banisherOwnerState.actions_done, usedOncePerTurnIds);
  const banisherCard = ctx.cardMap.get(getCardNum(banisherCardNum));
  for (const topNum of ownFieldSources(banisherOwnerState)) {
    for (const eff of effsOf(ctx, topNum)) {
      if (eff.effectType !== 'AUTO' || !eff.timing?.includes('ON_SIGNI_BANISH_OPPONENT_BY_EFFECT')) continue;
      const scope = eff.triggerScope ?? 'self';
      if (scope !== 'any_ally' && scope !== 'any') continue;
      // triggerFilter（＜ウェポン＞等）はバニッシュ実行シグニ（banisher）に対して照合
      if (eff.triggerFilter && !matchesFilter(banisherCard, eff.triggerFilter)) continue;
      if (!limitOk(eff)) continue;
      const cardName = ctx.cardMap.get(getCardNum(topNum))?.CardName ?? topNum;
      entries.push({
        id: ctx.genId(), playerId: banisherOwnerId, cardNum: topNum, effectId: eff.effectId,
        label: `${cardName} の【自】効果（味方ウェポンが効果でバニッシュ時）`, effect: eff, triggeringCardNum: banisherCardNum,
      });
    }
  }
  return { entries, usedOncePerTurnIds };
}

/**
 * ON_LRIG_UNDER_MOVED（「あなたのターンの間、あなたのルリグの下からカード1枚が移動したとき」WXDi-P04-042）を収集する（C1・2026-06-29）。
 * controllerId=ルリグ下が変化したプレイヤー。「あなたのターンの間」＝controller がターンプレイヤーのときのみ発火。
 * controller の場シグニ/ルリグから ON_LRIG_UNDER_MOVED self【自】を once_per_turn 制御で収集。
 */
export function collectLrigUnderMovedTriggers(
  ctx: TrigCtx, controllerId: string, controllerState: PlayerState,
): { entries: StackEntry[]; usedOncePerTurnIds: string[] } {
  const entries: StackEntry[] = [];
  const usedOncePerTurnIds: string[] = [];
  if (controllerId !== ctx.activeUserId) return { entries, usedOncePerTurnIds }; // 「あなたのターンの間」
  if (controllerState.blocked_actions?.includes('BLOCK_OWN_SIGNI_AUTO')) return { entries, usedOncePerTurnIds };
  const limitOk = mkLimitOk(controllerState.actions_done, usedOncePerTurnIds);
  for (const topNum of ownFieldSources(controllerState)) {
    for (const eff of effsOf(ctx, topNum)) {
      if (eff.effectType !== 'AUTO' || !eff.timing?.includes('ON_LRIG_UNDER_MOVED')) continue;
      if (!limitOk(eff)) continue;
      const cardName = ctx.cardMap.get(getCardNum(topNum))?.CardName ?? topNum;
      entries.push({
        id: ctx.genId(), playerId: controllerId, cardNum: topNum, effectId: eff.effectId,
        label: `${cardName} の【自】効果（ルリグ下からカード移動時）`, effect: eff,
      });
    }
  }
  return { entries, usedOncePerTurnIds };
}

/**
 * ON_DECK_SHUFFLED（「あなたのデッキがシャッフルされたとき」PR-470A）を収集する（C1・2026-06-29）。
 * shufflerId=デッキがシャッフルされたプレイヤー。その場シグニ/ルリグから ON_DECK_SHUFFLED self【自】を収集（usageLimit も評価）。
 */
export function collectDeckShuffledTriggers(
  ctx: TrigCtx, shufflerId: string, shufflerState: PlayerState,
): { entries: StackEntry[]; usedOncePerTurnIds: string[] } {
  const entries: StackEntry[] = [];
  const usedOncePerTurnIds: string[] = [];
  if (shufflerState.blocked_actions?.includes('BLOCK_OWN_SIGNI_AUTO')) return { entries, usedOncePerTurnIds };
  const limitOk = mkLimitOk(shufflerState.actions_done, usedOncePerTurnIds);
  for (const topNum of ownFieldSources(shufflerState)) {
    for (const eff of effsOf(ctx, topNum)) {
      if (eff.effectType !== 'AUTO' || !eff.timing?.includes('ON_DECK_SHUFFLED')) continue;
      if ((eff.triggerScope ?? 'self') !== 'self') continue;
      if (!limitOk(eff)) continue;
      const cardName = ctx.cardMap.get(getCardNum(topNum))?.CardName ?? topNum;
      entries.push({
        id: ctx.genId(), playerId: shufflerId, cardNum: topNum, effectId: eff.effectId,
        label: `${cardName} の【自】効果（デッキシャッフル時）`, effect: eff,
      });
    }
  }
  return { entries, usedOncePerTurnIds };
}

/**
 * ON_KEYWORD_GAINED（「あなたの他のシグニ1体が【アサシン】か【ランサー】か【ダブルクラッシュ】を得たとき」WXDi-P04-035）を収集する（C1）。
 * gains=この解決で得られた {cardNum, keyword} のリスト（detectKeywordGained）。gainOwnerId=得たプレイヤー（＝watcher と同じ側）。
 * 「他のシグニ」＝watcher 自身（topNum）を得た側（gain.cardNum）から除外。得た各キーワードを triggeringKeyword に積み、
 * COPY_ABILITY が「その能力」として watcher 自身へ付与する。usageLimit（《ターン1回》）も評価。
 */
export function collectKeywordGainedTriggers(
  ctx: TrigCtx, gains: { cardNum: string; keyword: string }[], gainOwnerId: string, ownerState: PlayerState,
): { entries: StackEntry[]; usedOncePerTurnIds: string[] } {
  const entries: StackEntry[] = [];
  const usedOncePerTurnIds: string[] = [];
  if (gains.length === 0) return { entries, usedOncePerTurnIds };
  if (ownerState.blocked_actions?.includes('BLOCK_OWN_SIGNI_AUTO')) return { entries, usedOncePerTurnIds };
  const limitOk = mkLimitOk(ownerState.actions_done, usedOncePerTurnIds);
  for (const topNum of ownFieldSources(ownerState)) {
    for (const eff of effsOf(ctx, topNum)) {
      if (eff.effectType !== 'AUTO' || !eff.timing?.includes('ON_KEYWORD_GAINED')) continue;
      for (const gain of gains) {
        if (gain.cardNum === topNum) continue; // 「他のシグニ」＝自身が得た場合は除外
        if (!limitOk(eff)) continue;
        const cardName = ctx.cardMap.get(getCardNum(topNum))?.CardName ?? topNum;
        entries.push({
          id: ctx.genId(), playerId: gainOwnerId, cardNum: topNum, effectId: eff.effectId,
          label: `${cardName} の【自】効果（味方が【${gain.keyword}】を得たとき）`, effect: eff,
          triggeringCardNum: gain.cardNum, triggeringKeyword: gain.keyword,
        });
      }
    }
  }
  return { entries, usedOncePerTurnIds };
}
