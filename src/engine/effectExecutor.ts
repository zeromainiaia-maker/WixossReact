import type { PlayerState, PendingInteractionDef, TargetScope, FieldGrant } from '../types';
import { applyRefreshState } from './refresh';
import type {
  CardEffect, EffectAction, EffectTarget, Owner, DrawAction, BanishAction, BanishRedirectAction, BounceAction, SendToEnergyAction, PowerModifyAction, PowerSetAction, TrashAction, EnergyChargeAction, EnergyChargeFromDeckAction, LifeCrashAction, ShuffleDeckAction, TransferToHandAction, AddToFieldAction, AddToLifeAction, FreezeAction, DownAction, UpAction, BlockActionAction, StoryChangeAction, GrantKeywordAction, SearchAction, SequenceAction, RepeatAction, PreventRefreshAction, SelectColorAction, ChooseAction, ConditionalAction, LookAndReorderAction, TransferToDeckAction, GrantProtectionAction, AttachCharmAction, AttachFacedownFromHandAction, RevealAndPickAction, PlayFreeAction, PlayFreeFromTrashAction, CostIncreaseAction, PowerModifyPerFieldAction, PowerModifyPerLrigLevelAction, CharmProtectionAction, MutualDiscardAndDrawAction, VariableDiscardAndDrawAction, RemoveAbilitiesAction, ReturnAssistLrigToDeckAction, GainCoinAction, DiscardBothAction, RemoveCharmAction, ForceSigniAttackAction, PowerModifyPerTrashCountAction, PowerModifyPerLifeCountAction, PowerModifyByTargetLevelAction, PlaceVirusAction, AttachAcceAction, BloodCrystalArmorAction, GrantLrigAbilityAction, GrantEffectAction, StubAction, MILLAction, } from '../types/effects';
import type { ExecCtx, ExecResult
} from './execUtils';
import {
  done, addLog, needsInteraction, ownerState, setOwnerState, shuffle, resolveNum, resolveCountRef,
  matchesFilter, getCardNum, removeFromField, fieldCandidates, handCandidates,
  trashCandidates, energyCandidates, evalCondition, selectOrInteract, canPayOptionalCost,
  costSlotIsAny, energyMatchesCostSlot,
  evalUseCondition, banishDestination, banishRedirectOpts, sweepPuppets, payBeatSigniCost, payBeatSigniFromTrashCost, addToBeatZone, analyzeBeatSigniCost,
  canAddToSelection, findValidConstrainedSelection, satisfiesSelectionConstraint, fieldCandidatesByOwner, sideOfFieldCard,
  resolveOptionalCostSpec, canAffordOptionalCostSpec, optionalCostPaySteps, optionalCostExtraLabels, selectOptionalCostEnergy,
  movableTrashCandidates, isOwnTrashMoveLocked, hasNoAbility, lrigZoneTops, designatedZones,
  sourceAbilityText, deckSigniOverrideLevel, countFromZone,
} from './execUtils';
export type { ExecCtx, ExecResult };
export { matchesFilter, getCardNum, removeFromField, evalUseCondition, payBeatSigniCost, payBeatSigniFromTrashCost, addToBeatZone, analyzeBeatSigniCost };
import { activeOppMoveImmunityZones, checkActiveCondition, collectBanishSubstitutes, collectMultiAcceLimits, keySlotCardNums, matchesStateFilter } from './effectEngine';
import type { BanishSubstituteOption } from './effectEngine';
import { deployLimitBlockReason, deployLimitLogMessage, effectPlacementSource, type DeployBlockReason } from './deployLimit';
import { allowedLifeCrashCount } from './lifeCrashGate';
import { isHandSigniPlayBlockedByPower } from './blockAction';
import { parseEnergyCosts } from '../data/parserUtils';
import { execStub } from './execStub';
import { hasBanishResist, decodeShadowKeyword, encodeShadowKeyword, isKeywordAbilityRemoved } from '../utils/keywords';
import { payLrigDownCost } from '../screens/battle/lrigDownCost';
import { collectReturnableAssistLrigTops } from './assistLrig';
import { acceCardsAt, cloneAcceSlots } from '../utils/acce';

// いま**アタックを宣言していてバトル未解決**のシグニ（`pending_signi_battle` のゾーン頂点）。無ければ undefined。
// 「対戦相手のアタックしているシグニ」の解決と、進行中アタックの無効化先の判定に使う（Opusタスク12(cx)）。
export const attackingSigniOf = (state: PlayerState): string | undefined =>
  state.pending_signi_battle
    ? state.field.signi[state.pending_signi_battle.zoneIndex]?.at(-1)
    : undefined;

function resolvedNextTurnOwner(
  nextTurnOwner: 'self' | 'opponent' | 'next' | undefined,
  ctx: ExecCtx,
): 'self' | 'opponent' {
  if (nextTurnOwner === 'next') {
    // undefined は旧呼び出し互換で self。実対戦の ExecCtx は isOwnerTurn を持つ。
    return ctx.isOwnerTurn === true ? 'opponent' : 'self';
  }
  return nextTurnOwner ?? 'self';
}

/** target 側の次の自ターン／次の相手ターンへ、場レベル grant を同じ契約で予約する。 */
function reserveFieldGrant(
  target: EffectTarget,
  grant: FieldGrant,
  nextTurnOwner: 'self' | 'opponent' | 'next' | undefined,
  ctx: ExecCtx,
): { ctx: ExecCtx; reserved: boolean; activeOwner: 'self' | 'opponent' } {
  const activeOwner = resolvedNextTurnOwner(nextTurnOwner, ctx);
  if (target.type !== 'SIGNI' || target.count !== 'ALL' || target.owner === 'any') {
    return { ctx, reserved: false, activeOwner };
  }
  const targetOwner = target.owner as Owner;
  const state = ownerState(targetOwner, ctx);
  // 指定ゾーンは**複数ありうる**（「シグニゾーンを２つまで指定し」）＝ゾーンごとに1件ずつ grant を積む。
  const stored = fieldGrantsForTargetZones(target, grant, state);
  if (stored === null) return { ctx, reserved: false, activeOwner };
  const reservationKey = targetOwner === activeOwner
    ? 'field_grants_next_turn'
    : 'field_grants_next_opp_turn';
  const nextState: PlayerState = {
    ...state,
    [reservationKey]: [...(state[reservationKey] ?? []), ...stored],
  };
  return { ctx: setOwnerState(targetOwner, nextState, ctx), reserved: true, activeOwner };
}

/**
 * target のゾーン限定を解決して、実際に積む FieldGrant の配列を返す（§6.4 O-16）。
 * ゾーン限定なし＝grant 1件そのまま／指定ゾーン＝**ゾーンごとに1件**。
 * 指定が空（DESIGNATE が空振り）なら `null`＝**何も積まない**（盤面全体へ広げない）。
 */
function fieldGrantsForTargetZones(
  target: EffectTarget, grant: FieldGrant, state: PlayerState,
): FieldGrant[] | null {
  if (target.zoneSource !== 'designated') return [grant];
  const zones = designatedZones(state);
  if (zones.length === 0) return null;
  return zones.map(zone => ({ ...grant, zone }));
}

/**
 * **このターンの間**の場レベル grant を `field_grants_active` へ直接書く（§6.4 O-16）。
 *
 * ⚠従来 `field_grants_active` は**予約からの昇格でしか埋まらず**、「このターン、指定したシグニゾーンに
 *   あるシグニのパワーを－N（このアーツの使用後にそこに置かれたシグニにも影響を与える）」という
 *   **現ターンのゾーン継続**を書く先が無かった。そのため該当効果は per-card の `temp_power_mods` へ
 *   落ちるしかなく、**後からそのゾーンへ出たシグニに効かない**（原文の括弧書きが丸ごと死ぬ）。
 * ⚠`field_grants_active` は `turnScopedState` に turn-end 登録済み＝失効は既存の funnel が担う。
 */
function applyActiveFieldGrant(
  target: EffectTarget,
  grant: FieldGrant,
  ctx: ExecCtx,
): { ctx: ExecCtx; applied: boolean } {
  if (target.type !== 'SIGNI' || target.count !== 'ALL' || target.owner === 'any') {
    return { ctx, applied: false };
  }
  const targetOwner = target.owner as Owner;
  const state = ownerState(targetOwner, ctx);
  const stored = fieldGrantsForTargetZones(target, grant, state);
  if (stored === null) return { ctx, applied: false };
  const next: PlayerState = { ...state, field_grants_active: [...(state.field_grants_active ?? []), ...stored] };
  return { ctx: setOwnerState(targetOwner, next, ctx), applied: true };
}

function filterCandidatesToTargetZone(cands: string[], target: EffectTarget, state: PlayerState): string[] {
  if (target.zoneSource !== 'designated') return cands;
  const zones = designatedZones(state);
  if (zones.length === 0) return [];
  const tops = zones.map(z => state.field.signi[z]?.at(-1)).filter((n): n is string => !!n);
  return cands.filter(n => tops.includes(n));
}

const exceedPoolCountOf = (state: PlayerState): number =>
  state.field.lrig.slice(0, -1).length
  + (state.field.assist_lrig_l?.slice(0, -1).length ?? 0)
  + (state.field.assist_lrig_r?.slice(0, -1).length ?? 0);

// 任意コストの pay/skip 分岐に埋め込む本体アクションの対象を、いま固定されている storedTargetCards へ
// 焼き込む。storedTargetCards はインタラクションの resume を跨いで生存しないため、targetsStored のまま
// 分岐に渡すと支払い後に候補が空になり空振りする（WXDi-D08-012 の未払いBANISH）。
// SEND_TO_ENERGY / TRANSFER_TO_DECK はタスク12(liii) の族（エナ送り・デッキの一番下）で必要になり追加。
function freezeStoredTargets(action: EffectAction, ctx: ExecCtx): EffectAction {
  const FREEZABLE = ['BANISH', 'BOUNCE', 'TRASH', 'EXILE', 'SEND_TO_ENERGY', 'TRANSFER_TO_DECK'];
  if (FREEZABLE.includes(action.type) && (action as { targetsStored?: boolean }).targetsStored) {
    return { ...action, targetsStored: false, fixedCardNums: [...(ctx.storedTargetCards ?? [])] } as EffectAction;
  }
  if (action.type === 'SEQUENCE') return { ...action, steps: action.steps.map(s => freezeStoredTargets(s, ctx)) };
  return action;
}

// exact 合計の任意コストは、外部応答を resume 側で再検証して不正集合を0枚へ倒す。
// pay を選んだ事実だけで後段を走らせず、実際に有効な支払い札が処理された場合だけ帰結へ進む。
function guardExactOptionalSelectionPayment(
  spec: import('./execUtils').OptionalCostSpec,
  paidAction: EffectAction,
): EffectAction {
  const exact = spec.handDiscard?.selectionConstraint?.totalLevelExact
    ?? spec.energyTrash?.selectionConstraint?.totalLevelExact;
  if (exact === undefined || exact <= 0) return paidAction;
  return {
    type: 'CONDITIONAL',
    condition: { type: 'LAST_PROCESSED_COUNT_GTE', value: 1 },
    then: paidAction,
  } as ConditionalAction;
}

// ===== 個別アクション実行 =====

// LOOK_AT_DECK_AND_LIFE: 対象プレイヤーのデッキトップ／ライフトップを「見る」（純粋な情報＝盤面変化なし）。
//   mode 'both'=両方 / 'either'=どちらか。engine は情報開示のみでログに記録する（状態は不変）。
function execLookAtDeckAndLife(a: import('../types/effects').LookAtDeckAndLifeAction, ctx: ExecCtx): ExecResult {
  const s = ownerState(a.targetOwner, ctx);
  const who = a.targetOwner === 'self' ? '自分' : '相手';
  const nm = (n: string | undefined) => (n ? ctx.cardMap.get(n)?.CardName ?? n : '（なし）');
  const deckTop = nm(s.deck[0]);
  const lifeTop = nm(s.life_cloth[s.life_cloth.length - 1]);
  const scope = a.mode === 'either' ? 'デッキの一番上かライフの一番上' : 'デッキの一番上とライフの一番上';
  return done(addLog(ctx, `${who}の${scope}を見る（デッキ:${deckTop} / ライフ:${lifeTop}）`));
}

function execDraw(a: DrawAction, ctx: ExecCtx): ExecResult {
  const state = ownerState(a.owner, ctx);
  // BLOCK_ACTION 'DRAW_OR_ADD_TO_HAND_BY_EFFECT'（WXK10-010①「このターン、対戦相手は自分の効果によって
  //   カードを引いたりカードを手札に加えることができない」）＝**効果によるドロー**を封じる。
  //   ドローフェイズの通常ドローは drawCards 経由でここを通らないので影響しない。
  if (state.blocked_actions?.includes('DRAW_OR_ADD_TO_HAND_BY_EFFECT')) {
    return done(addLog(ctx, '効果によるドローは封じられている'));
  }
  // untilHandCount: 手札が N 枚になるまで（差の分だけ）引く。N 枚以上なら引かない（WX05-003）
  // addLastProcessedCount: 直前の選択枚数（捨てた枚数等）を count に加算（VARIABLE_DISCARD_AND_DRAW 用）
  // perLastProcessedLevel: 直前に公開/処理したカードのレベル合計 × count 分を引く
  //   （「公開したシグニのレベル１につきカードを１枚引く」WD21-001-E2＝REVEAL_AND_PICK の then）
  const perLevelSum = a.perLastProcessedLevel
    ? (ctx.lastProcessedCards ?? []).reduce((sum, n) => sum + (parseInt(ctx.cardMap.get(getCardNum(n))?.Level ?? '', 10) || 0), 0)
    : 0;
  const count = a.untilHandCount !== undefined
    ? Math.max(0, a.untilHandCount - state.hand.length)
    : a.perLastProcessedLevel
    ? resolveCountRef(a.count, ctx, a.countFromZone) * perLevelSum
    : resolveCountRef(a.count, ctx, a.countFromZone) + (a.addLastProcessedCount ? (ctx.lastProcessedCards?.length ?? 0) : 0);
  const canDraw = Math.min(count, state.deck.length);
  const s: PlayerState = {
    ...state,
    hand: [...state.hand, ...state.deck.slice(0, canDraw)],
    deck: state.deck.slice(canDraw),
    // このターンに効果で引いた累計枚数（CARDS_DRAWN_BY_EFFECT 条件用）。ドローフェイズのドローは drawCards 経由でここを通らない。
    cards_drawn_by_effect_this_turn: (state.cards_drawn_by_effect_this_turn ?? 0) + canDraw,
    cards_drawn_this_attack_phase: (state.cards_drawn_this_attack_phase ?? 0) + canDraw,
    // このドローの原因カード（drawBySourceStory 判定用）。実際に引いた場合のみ更新。collectDrawTriggers が
    // cards_drawn_by_effect_this_turn の増加を検出した直後に読むため、ここで上書きすれば常に最新の原因が反映される。
    last_effect_draw_source: canDraw > 0 ? ctx.sourceCardNum : state.last_effect_draw_source,
    // このドローがドロー側自身の効果か（a.owner==='self'＝効果元＝ドロー側）。相手にドローさせた（a.owner==='opponent'）
    // 場合は false。ON_DRAW any_opp「対戦相手が自分の効果で引いたとき」（PR-423）の発生源プレイヤー限定に使う。
    last_draw_by_own_effect: canDraw > 0 ? (a.owner === 'self') : state.last_draw_by_own_effect,
  };
  // リフレッシュはここでは行わず、効果解決後（result.done）の applyRefreshOnDone に集約する
  // （ルール：効果解決中はデッキ0のまま可能な限り解決し、その後リフレッシュ）。
  return done(addLog(setOwnerState(a.owner, s, ctx), `${count}枚ドロー`));
}

/**
 * 場のカードが**いま宣言している**能力（印字＋付与2ストアの3軸）。
 *
 * ⚠離場置換の宣言走査は 2026-08-11（続き432）まで**印字（`CardData.effects`）だけ**を見ていた＝
 *   同じ【常】を `GRANT_EFFECT` で付与するカードが出た瞬間に**無言で落ちる**状態だった
 *   （`signiDamageGate.ts` のコメントに書いてある罠と同じ）。現状 live に付与するカードは 0 件なので
 *   挙動は変わらないが、走査軸を先に揃えておく。
 */
function declaredContinuousEffects(
  cardNum: string,
  state: PlayerState,
  cardMap: Map<string, import('../types').CardData>,
): CardEffect[] {
  const base = getCardNum(cardNum);
  // ⚠付与ストアのキーは**書き手が instance 付きの CardNum を使う**ことがある（`GRANT_EFFECT` の
  //   `geGranted[cardNum]`）。base だけで引くと、instance を持つ個体への付与が黙って読めない。
  const grantKeys = base === cardNum ? [base] : [cardNum, base];
  return [
    ...(cardMap.get(base)?.effects ?? []),
    ...grantKeys.flatMap(k => [
      ...(state.granted_effects?.[k] ?? []),
      ...(state.granted_effects_until_opp_turn?.[k] ?? []),
    ]),
  ];
}

// 効果離場の powerReduction 身代わり（WX06-019 シロナクジ型）:
// victim owner の場に「あなたの他の＜X＞が対戦相手の効果で場を離れる場合、代わりにこのシグニのパワーを-N」を
// CONTINUOUS BANISH_SUBSTITUTE{substituteCost.powerReduction} で宣言するカード(protector)があり、
// victim がその trigger フィルタに合致すれば、victim を残し protector のパワーを -N する身代わりを返す。
// 「してもよい」は自動適用（pause/resume を伴わない決定論的な近似。バトル経路の対話本実装とは別経路）。
function findEffectLeavePowerReductionSubstitute(
  victimNum: string,
  victimState: PlayerState,
  cardMap: Map<string, import('../types').CardData>,
): { protectorNum: string; reduction: number } | null {
  const victimCard = cardMap.get(victimNum);
  for (const stack of victimState.field.signi) {
    const top = stack?.at(-1);
    if (!top || top === victimNum) continue; // 「他の」＝victim自身は除外
    for (const eff of declaredContinuousEffects(top, victimState, cardMap)) {
      if (eff.effectType !== 'CONTINUOUS' || eff.action.type !== 'BANISH_SUBSTITUTE') continue;
      const ba = eff.action as import('../types/effects').BanishSubstituteAction;
      if (!ba.substituteCost.powerReduction) continue;
      if (ba.trigger.owner !== 'self') continue;
      if (!matchesFilter(victimCard, ba.trigger.filter)) continue;
      return { protectorNum: top, reduction: ba.substituteCost.powerReduction };
    }
  }
  return null;
}

/**
 * 相手効果による場離れを、場のシグニが宣言する powerReduction で置換する。
 * owner 省略時の挙動を変えないため、ctx から見た opponent の場離れだけを対象にする。
 */
export function applyEffectLeavePowerReductionSubstitute(
  victimNum: string,
  victimOwner: Owner,
  ctx: ExecCtx,
): { ctx: ExecCtx; replaced: boolean } {
  if (victimOwner !== 'opponent') return { ctx, replaced: false };
  const state = ownerState(victimOwner, ctx);
  if (!state.field.signi.some(stack => stack?.at(-1) === victimNum)) return { ctx, replaced: false };
  const sub = findEffectLeavePowerReductionSubstitute(victimNum, state, ctx.cardMap);
  if (!sub) return { ctx, replaced: false };
  const mods = [...(state.temp_power_mods ?? []), { cardNum: sub.protectorNum, delta: -sub.reduction }];
  return {
    ctx: addLog(setOwnerState(victimOwner, { ...state, temp_power_mods: mods }, ctx),
      `${ctx.cardMap.get(getCardNum(sub.protectorNum))?.CardName ?? sub.protectorNum}のパワー-${sub.reduction}で${ctx.cardMap.get(getCardNum(victimNum))?.CardName ?? victimNum}の場離れを身代わり`),
    replaced: true,
  };
}

/**
 * 相手効果による場離れを、被害側ルリグに付与された「代わりにこの能力を失う」で1回だけ置換する。
 * 該当する付与 CardEffect そのものだけを長期ストアから除き、他の付与能力と同時付与の POWER_SET は残す。
 */
export function applyEffectLeaveLrigAbilitySubstitute(
  victimNum: string,
  victimOwner: Owner,
  ctx: ExecCtx,
): { ctx: ExecCtx; replaced: boolean } {
  if (victimOwner !== 'opponent') return { ctx, replaced: false };
  const state = ownerState(victimOwner, ctx);
  const baseNum = victimNum.includes('#') ? victimNum.slice(0, victimNum.indexOf('#')) : victimNum;
  const victim = ctx.cardMap.get(baseNum);
  const victimZone = state.field.signi.findIndex(stack => stack?.at(-1) === victimNum);
  const stores = [
    'lrig_granted_auto_effects_until_opp_turn',
    'lrig_granted_auto_effects',
  ] as const;
  for (const key of stores) {
    const effects = state[key] ?? [];
    const index = effects.findIndex(effect => {
      const action = effect.action as import('../types/effects').StubAction;
      const filter = action.leaveVictimFilter;
      const { crossState: _cross, ...cardFilter } = filter ?? {};
      return effect.effectType === 'CONTINUOUS'
        && action.type === 'STUB'
        && action.id === 'EFFECT_LEAVE_PREVENT_LOSE_LRIG_ABILITY'
        && (filter?.crossState === undefined || (state.field.cross_state?.[victimZone] ?? false) === filter.crossState)
        && matchesFilter(victim, cardFilter);
    });
    if (index < 0) continue;
    const kept = effects.filter((_, i) => i !== index);
    const nextState = { ...state, [key]: kept.length > 0 ? kept : undefined };
    return {
      ctx: addLog(setOwnerState(victimOwner, nextState, ctx),
        `${victim?.CardName ?? victimNum}の場離れをルリグ付与能力の喪失で置換`),
      replaced: true,
    };
  }
  return { ctx, replaced: false };
}

/**
 * 相手効果による場離れを、**そのシグニ自身**が宣言する
 * 「代わりに（ターン終了時まで、）この能力を失う」で置換する（§6.4 O-10・続き507）。
 *
 * `applyEffectLeaveLrigAbilitySubstitute`（ルリグ付与ストア版）の**シグニ自身版**。
 * 対象は `WX25-P3-055-E2`（印刷【常】《相手ターン》）と `WX25-P2-071-E1` が付与する
 * 【常】（`thenDown`＝「そうした場合、このシグニをダウンする」）。
 *
 * 🔑**失うのは「この効果1つ」だけ**＝`lost_ability_effect_ids_this_turn`（効果単位）に刻む。
 *   `abilities_removed`（カード単位・全能力）で表すと `WX25-P3-055` の E1（パワー＋3000）と
 *   E3（ターン終了時の手札戻し）まで巻き添えで消える＝原文にない過剰。
 * ⚠**同じ効果で2回目は置換しない**＝刻んだ effectId を毎回先に見る（見ないと
 *   「ターン中は何度でも場を離れない」＝無敵になる）。
 * ⚠`victimOwner === 'opponent'` ガードは他3本と同じ＝原文の「**対戦相手の**効果によって」。
 */
export function applyEffectLeaveSelfAbilitySubstitute(
  victimNum: string,
  victimOwner: Owner,
  ctx: ExecCtx,
): { ctx: ExecCtx; replaced: boolean } {
  if (victimOwner !== 'opponent') return { ctx, replaced: false };
  const state = ownerState(victimOwner, ctx);
  const zone = state.field.signi.findIndex(stack => stack?.at(-1) === victimNum);
  if (zone < 0) return { ctx, replaced: false };
  const attackerState = ownerState('self', ctx);
  // `checkActiveCondition` の isOwnerTurn は**victim オーナー視点**。ctx.isOwnerTurn は効果主視点なので反転する
  // （`collectEffectBanishSubstituteChoices` と同じ規約）。
  const victimOwnerTurn = ctx.isOwnerTurn === undefined ? false : !ctx.isOwnerTurn;
  const lost = state.lost_ability_effect_ids_this_turn ?? [];
  for (const eff of declaredContinuousEffects(victimNum, state, ctx.cardMap)) {
    if (eff.effectType !== 'CONTINUOUS' || eff.action.type !== 'STUB') continue;
    const act = eff.action as import('../types/effects').StubAction;
    if (act.id !== 'EFFECT_LEAVE_PREVENT_LOSE_SELF_ABILITY') continue;
    if (lost.includes(eff.effectId)) continue;
    if (!checkActiveCondition(eff.activeCondition, state, attackerState, victimOwnerTurn, ctx.cardMap, victimNum)) continue;
    const down = [...(state.field.signi_down ?? [false, false, false])] as boolean[];
    if (act.leaveLoseSelfAbility?.thenDown) down[zone] = true;
    const nextState: PlayerState = {
      ...state,
      lost_ability_effect_ids_this_turn: [...lost, eff.effectId],
      ...(act.leaveLoseSelfAbility?.thenDown ? { field: { ...state.field, signi_down: down as [boolean, boolean, boolean] } } : {}),
    };
    const name = ctx.cardMap.get(getCardNum(victimNum))?.CardName ?? victimNum;
    return {
      ctx: addLog(setOwnerState(victimOwner, nextState, ctx),
        `${name}の場離れをこの能力の喪失で置換${act.leaveLoseSelfAbility?.thenDown ? '（そうした場合ダウン）' : ''}`),
      replaced: true,
    };
  }
  return { ctx, replaced: false };
}

/**
 * 相手効果による場離れを、**任意コストを払って**「この能力を失う」で置換する（§6.4 O-10・続き511）。
 *
 * 上の `applyEffectLeaveSelfAbilitySubstitute` の**コスト付き**版
 * （`WX25-P2-059-E1`／`WX26-CP1-047-E1`／`WXDi-CP02-056-E1`＝原文 regex でちょうど3効果）。
 *
 * 🔑**victim（守られる側）と宣言元（能力を失う側）は別**＝原文は「あなたの〈filter〉のシグニ１体が…
 *   **この**シグニはこの能力を失う」。victim は `victimFilter` で絞り、失効させるのは**宣言元の effectId**。
 * ⚠**払うのは victim のオーナー**＝ctx から見た `otherState`（`victimOwner==='opponent'` ガードは他軸と同じ）。
 *   `optionalCostPaySteps`／`canAffordOptionalCostSpec` は `ownerState` 固定で視点が合わないので使わず、
 *   `selectOptionalCostEnergy`（state 非依存）で**同期的に**払う。
 * ⚠原文は「支払っ**てもよい**」＝`kind:'optional'`。engine の現行 policy はこれを自動適用する
 *   （`discardSpell`／`trashStackSpell` と同じ決定論的近似）。対話 policy が入れば選択肢として出る。
 */
export function applyEffectLeavePayLoseSelfAbilitySubstitute(
  victimNum: string,
  victimOwner: Owner,
  ctx: ExecCtx,
): { ctx: ExecCtx; replaced: boolean } {
  if (victimOwner !== 'opponent') return { ctx, replaced: false };
  const state = ownerState(victimOwner, ctx);
  const victimZone = state.field.signi.findIndex(stack => stack?.at(-1) === victimNum);
  if (victimZone < 0) return { ctx, replaced: false };
  const attackerState = ownerState('self', ctx);
  const victimOwnerTurn = ctx.isOwnerTurn === undefined ? false : !ctx.isOwnerTurn;
  const lost = state.lost_ability_effect_ids_this_turn ?? [];
  const victimCard = ctx.cardMap.get(getCardNum(victimNum));
  for (let zi = 0; zi < state.field.signi.length; zi++) {
    const declarer = state.field.signi[zi]?.at(-1);
    if (!declarer) continue;
    for (const eff of declaredContinuousEffects(declarer, state, ctx.cardMap)) {
      if (eff.effectType !== 'CONTINUOUS' || eff.action.type !== 'STUB') continue;
      const act = eff.action as import('../types/effects').StubAction;
      if (act.id !== 'EFFECT_LEAVE_PAY_TO_LOSE_SELF_ABILITY') continue;
      const spec = act.leavePayLoseSelfAbility;
      if (!spec) continue;
      if (lost.includes(eff.effectId)) continue;
      if (!checkActiveCondition(eff.activeCondition, state, attackerState, victimOwnerTurn, ctx.cardMap, declarer)) continue;
      // ⚠victim 条件は**盤面状態込み**で見る（`matchesStateFilter`＝凍結/ダウン等）＝他軸と同じ規約。
      if (spec.victimFilter
        && (!matchesFilter(victimCard, spec.victimFilter) || !matchesStateFilter(state, victimZone, spec.victimFilter))) continue;
      // ── 支払い（払えないなら成立しない＝タダで置換しない）──
      let paidState = state;
      const paidLabels: string[] = [];
      if (spec.costColors?.length) {
        const picked = selectOptionalCostEnergy(spec.costColors, paidState, ctx.cardMap);
        if (!picked) continue;
        const rest = [...paidState.energy];
        for (const n of picked) { const i = rest.indexOf(n); if (i >= 0) rest.splice(i, 1); }
        paidState = { ...paidState, energy: rest, trash: [...paidState.trash, ...picked] };
        paidLabels.push(spec.costColors.map(c => `《${c}》`).join(''));
      }
      if (spec.handDiscard) {
        if (paidState.hand.length < spec.handDiscard) continue;
        const discarded = paidState.hand.slice(0, spec.handDiscard);
        paidState = { ...paidState, hand: paidState.hand.slice(spec.handDiscard), trash: [...paidState.trash, ...discarded] };
        paidLabels.push(`手札${spec.handDiscard}枚`);
      }
      if (paidLabels.length === 0) continue;   // コストの無い宣言は成立させない（タダ置換の防止）
      const nextState: PlayerState = {
        ...paidState,
        lost_ability_effect_ids_this_turn: [...lost, eff.effectId],
      };
      const name = ctx.cardMap.get(getCardNum(victimNum))?.CardName ?? victimNum;
      return {
        ctx: addLog(setOwnerState(victimOwner, nextState, ctx),
          `${paidLabels.join('・')}を支払い、${name}の場離れをこの能力の喪失で置換`),
        replaced: true,
      };
    }
  }
  return { ctx, replaced: false };
}

/**
 * 相手効果による**非バニッシュ**の場離れ（手札戻し／トラッシュ／エナ送り／デッキ戻し／除外）を、
 * 被害側の場が宣言する CONTINUOUS STUB `EFFECT_LEAVE_REPLACE_BANISH` でバニッシュへ置換する
 * （WX25-P1-056-E1「あなたの＜原子＞のシグニが対戦相手の効果によって場を離れる場合、その移動が
 *   バニッシュによるものでないなら、代わりにそのシグニをバニッシュしてもよい」＝タスク12(lx)①）。
 *
 * - `victimOwner === 'opponent'` ＝ ctx の効果主から見た相手側＝**「対戦相手の効果によって」** を満たす側だけを置換する
 *   （自分の効果で自分のシグニを動かす場合は対象外）。`applyEffectLeaveLrigAbilitySubstitute` と同じガード。
 * - **バニッシュ経路からは呼ばない**（「その移動がバニッシュによるものでないなら」）。
 * - 「してもよい」は**自動適用**＝`findEffectLeavePowerReductionSubstitute` /
 *   `applyEffectLeaveLrigAbilitySubstitute` と同じ決定論的近似。場離れ各経路は同期的な ctx 変換で
 *   対話 pause を張れない（バトルバニッシュの BANISH_SUBSTITUTE だけが BattleScreen 側で対話実装）。
 * - バニッシュ先は execBanish と同じ `banishDestination`（エナ／トラッシュ／手札／デッキ下への置換走査つき）を通す。
 * - バニッシュ耐性（【常】バニッシュされない／PROTECTION 付与）を持つ victim は置換しない＝元の移動をそのまま通す。
 */
export function applyEffectLeaveReplaceBanishSubstitute(
  victimNum: string,
  victimOwner: Owner,
  ctx: ExecCtx,
): { ctx: ExecCtx; replaced: boolean } {
  if (victimOwner !== 'opponent') return { ctx, replaced: false };
  const state = ownerState(victimOwner, ctx);
  if (!state.field.signi.some(stack => stack?.at(-1) === victimNum)) return { ctx, replaced: false };
  const victim = ctx.cardMap.get(getCardNum(victimNum));
  if (!victim) return { ctx, replaced: false };
  // バニッシュできない相手は置換しない（置換で耐性を踏み越えない）
  if (ctx.otherBanishProtectedNums?.has(victimNum)) return { ctx, replaced: false };
  if (hasBanishResist(victimNum, ctx.cardMap, state.keyword_grants)) return { ctx, replaced: false };
  const declarer = state.field.signi.some(stack => {
    const top = stack?.at(-1);
    if (!top) return false;
    return declaredContinuousEffects(top, state, ctx.cardMap).some(eff => {
      if (eff.effectType !== 'CONTINUOUS' || eff.action.type !== 'STUB') return false;
      const act = eff.action as import('../types/effects').StubAction;
      if (act.id !== 'EFFECT_LEAVE_REPLACE_BANISH' || !act.leaveReplaceBanish) return false;
      const story = act.leaveReplaceBanish.story;
      return matchesFilter(victim, { cardType: 'シグニ', ...(story ? { story } : {}) });
    });
  });
  if (!declarer) return { ctx, replaced: false };
  const removed = removeFromField(victimNum, state);
  const opp = ownerState('self', ctx); // victim から見た対戦相手＝効果主側（バニッシュ先置換の持ち主候補）
  const { state: dest, log } = banishDestination(removed, opp, victimNum, banishRedirectOpts(ctx, state, victimNum));
  return {
    ctx: addLog(setOwnerState(victimOwner, dest, ctx),
      `${victim.CardName ?? victimNum}の場離れを代わりにバニッシュへ置換${log}`),
    replaced: true,
  };
}

/**
 * 場離れを、**相手側の場が宣言する**「アタックフェイズの間、能力を持たない対戦相手のシグニが場を離れる場合、
 * 代わりにデッキの一番下に置かれる」で置換する（`WXEX2-30` の CONTINUOUS STUB
 * `NO_ABILITY_SIGNI_TO_DECK_BOTTOM`＝タスク12(xcv)）。
 *
 * 既存3本（`…LrigAbility` / `…PowerReduction` / `…ReplaceBanish`）が**被害側の場**が自衛のために宣言する
 * 置換なのに対し、これは**被害側の対面**が宣言する妨害＝宣言者は victim の反対側の場を見る。
 * - `victimOwner` の**反対側**を宣言者として引くので、victim が ctx のどちら側でも成立する（ゲート不要）。
 * - **チェーンの最後に置く**＝被害側の自衛置換（3本）が先に成立したらそちらを優先する。
 * - アタックフェイズ限定（`currentPhase` が `ATTACK_*`）。フェイズ不明なら成立させない。
 * ⚠**バトルによるバニッシュは BattleScreen 側の経路**なのでここには乗らない（効果による場離れのみ）。
 *
 * ⚠**離場経路すべてから呼ぶこと**＝原文が「場を離れる場合」なので、1経路でも呼び忘れるとそこだけ素通りする。
 *   **2026-08-06（タスク12(xcvii)）以降、直接呼ばずに `applyEffectLeaveSubstitutes` 経由で呼ぶ**＝
 *   置換4本の適用順と呼び忘れを1箇所に閉じ込めた（この関数を直接呼ぶ新規経路を足さないこと）。
 */
export function applyEffectLeaveNoAbilityDeckBottomSubstitute(
  victimNum: string,
  victimOwner: Owner,
  ctx: ExecCtx,
): { ctx: ExecCtx; replaced: boolean } {
  if (!(ctx.currentPhase ?? '').startsWith('ATTACK')) return { ctx, replaced: false };
  const state = ownerState(victimOwner, ctx);
  if (!state.field.signi.some(stack => stack?.at(-1) === victimNum)) return { ctx, replaced: false };
  if (!hasNoAbility(victimNum, ctx.cardMap, state, ctx.effectsMap?.get(getCardNum(victimNum)))) return { ctx, replaced: false };
  const declarerState = ownerState(victimOwner === 'self' ? 'opponent' : 'self', ctx);
  const declared = declarerState.field.signi.some(stack => {
    const top = stack?.at(-1);
    if (!top) return false;
    return declaredContinuousEffects(top, declarerState, ctx.cardMap).some(eff =>
      eff.effectType === 'CONTINUOUS' && eff.action.type === 'STUB'
      && (eff.action as import('../types/effects').StubAction).id === 'NO_ABILITY_SIGNI_TO_DECK_BOTTOM');
  });
  if (!declared) return { ctx, replaced: false };
  const removed = removeFromField(victimNum, state);
  return {
    ctx: addLog(setOwnerState(victimOwner, { ...removed, deck: [...removed.deck, victimNum] }, ctx),
      `${ctx.cardMap.get(getCardNum(victimNum))?.CardName ?? victimNum}は能力を持たないため代わりにデッキの一番下へ`),
    replaced: true,
  };
}

/**
 * **効果による**バニッシュを、被害側の場が宣言する `BANISH_SUBSTITUTE`（F-3）で置換する（続き406）。
 *
 * 対象は `collectBanishSubstitutes` が列挙する2形＝
 * **犠牲型**（`self_sacrifice_other`＝`WX12-024`/`WXEX2-60`／`protect_other_sacrifice_self`＝
 * `WX20-055`/`WXDi-CP01-032`/`WXDi-P10-052`）と**コスト払い型**（`discardSpell`＝`WX10-033`／
 * `trashStackSpell`＝`WX11-029`）。
 *
 * ⚠**これらの原文は「このシグニがバニッシュされる場合」＝バトル限定ではない**のに、
 * 従来 `collectBanishSubstitutes` の消費地点は **BattleScreen のバトルバニッシュ経路1箇所だけ**で、
 * `execBanish`（効果によるバニッシュ）からは一切参照されていなかった＝効果バニッシュに対しては丸ごと無効だった。
 *
 * - `victimOwner === 'opponent'` ＝ ctx の効果主から見た相手側だけを置換する（自分の効果で自分のシグニを
 *   バニッシュする「コスト/利得」型を、勝手に他シグニの犠牲へすり替えないため）。他3本と同じガード。
 * - 「してもよい」は現状**自動適用**（決定論的近似）＝`autoChooseLeaveSubstitute` の policy。
 *   **選ぶ順は安い順に固定**＝①スタック下のスペル→②手札のスペル→③他シグニの犠牲。
 * - ⚠**`lifeCrash`（`WX14-026`）は列挙はするが自動選択しない**（`autoEligible:false`）＝ライフクラッシュは
 *   【ライフバースト】確認フロー（`field.check`）を伴うため効果解決の途中で同期的に差し込めない。
 *   **対話 policy が入れば選択肢として出せる**ところまで配線済み（従来は列挙からも落としていた）。
 */

/**
 * F-3 身代わりの候補を**適用せずに**列挙する（決定層の enumerate 側）。
 * 並びは「安い順」＝①スタック下のスペル→②手札のスペル→③他シグニの犠牲で固定
 * （`autoChooseLeaveSubstitute` はこの先頭から採るので、並びを変えると自動選択が変わる）。
 */
export function collectEffectBanishSubstituteChoices(
  victimNum: string,
  victimOwner: Owner,
  ctx: ExecCtx,
): BanishSubstituteOption[] {
  if (victimOwner !== 'opponent') return [];
  const state = ownerState(victimOwner, ctx);
  if (!state.field.signi.some(stack => stack?.at(-1) === victimNum)) return [];
  const attackerState = ownerState('self', ctx);
  // `collectBanishSubstitutes` の isOwnerTurn は**victim オーナー視点**。ctx.isOwnerTurn は効果主視点なので反転する。
  // 未設定なら false＝「victim オーナーのターンではない」に倒す（バトル経路の呼び出しも常に false。
  // 効果主が動いている＝多くは効果主のターン、という最頻ケースに合わせる）。
  const victimOwnerTurn = ctx.isOwnerTurn === undefined ? false : !ctx.isOwnerTurn;
  // 付与ストアと同じ理由で `ctx.effectsMap` には依存できない（代入されるのは BattleScreen の1経路だけ）。
  // 実アプリでは CardData.effects に live JSON が載っている（App.tsx）ので、そちらを優先フォールバックにする。
  const localEffects = new Map<string, CardEffect[]>();
  for (const stack of state.field.signi) {
    const top = stack?.at(-1);
    if (!top) continue;
    // ⚠付与ストアも足す（続き432）＝`GRANT_EFFECT` で F-3 身代わりを付与された瞬間に落ちないため。
    localEffects.set(top, [
      ...(ctx.effectsMap?.get(top)
        ?? ctx.effectsMap?.get(getCardNum(top))
        ?? ctx.cardMap.get(getCardNum(top))?.effects
        ?? []),
      ...(state.granted_effects?.[getCardNum(top)] ?? []),
      ...(state.granted_effects_until_opp_turn?.[getCardNum(top)] ?? []),
    ]);
  }
  const rank = (o: BanishSubstituteOption): number =>
    o.kind === 'pay_cost' ? (o.costType === 'trashStackSpell' ? 0 : 1) : 2;
  return [...collectBanishSubstitutes(
    state, attackerState, victimOwnerTurn, ctx.cardMap, localEffects, victimNum,
  )].sort((a, b) => rank(a) - rank(b));
}

/**
 * その身代わり候補のコストを **engine が実際に徴収できる**か（§3 (cxxix) の再発防止）。
 *
 * 🔴**ここに無い costType は列挙段階で落とす**＝`applyEffectBanishSubstituteChoice` の末尾は
 * `trashStackSpell` 専用で、**在庫が0でも「0枚トラッシュ」で成立する**ため、未実装のものが
 * そこへ落ちると**コスト0でバニッシュを回避できる**（(cxxix) の実体がこれだった）。
 * **新しい costType を足すときは apply 側の分岐とこの集合を必ず対で更新する。**
 */
function isImplementedSubstituteCost(o: BanishSubstituteOption): boolean {
  return o.kind !== 'pay_cost'
    || o.costType === 'discardSpell' || o.costType === 'trashStackSpell' || o.costType === 'lifeCrash';
}

/**
 * F-3 身代わり候補が engine の**自動 policy** で選べるか。`lifeCrash` だけ対話専用。
 *
 * ⚠**「実装が無い」からではない**（続き475b で apply 側を実装済み）＝**原文が「してもよい」**なので、
 * **プレイヤーの同意なしにライフクロスを割ってはいけない**という理由で自動選択から外している。
 * 対話（`leaveSubstituteAskOptions`）には従来どおり出る。
 */
export function banishSubstituteAutoEligible(o: BanishSubstituteOption): boolean {
  return !(o.kind === 'pay_cost' && o.costType === 'lifeCrash');
}

/** 選んだ F-3 身代わりを適用する（決定層の apply 側）。 */
export function applyEffectBanishSubstituteChoice(
  victimNum: string,
  victimOwner: Owner,
  chosen: BanishSubstituteOption,
  ctx: ExecCtx,
): ExecCtx {
  const state = ownerState(victimOwner, ctx);
  const attackerState = ownerState(victimOwner === 'self' ? 'opponent' : 'self', ctx);
  const isSpell = (n: string) => ctx.cardMap.get(getCardNum(n))?.Type === 'スペル';
  const nameOf = (n: string) => ctx.cardMap.get(getCardNum(n))?.CardName ?? n;

  if (chosen.kind === 'sacrifice') {
    // victim は場に残り、代わりに sacrificeNum をバニッシュする（バニッシュ先は通常経路と同じ）。
    const removed = removeFromField(chosen.sacrificeNum, state);
    const { state: dest, log } = banishDestination(
      removed, attackerState, chosen.sacrificeNum, banishRedirectOpts(ctx, state, chosen.sacrificeNum),
    );
    return addLog(setOwnerState(victimOwner, dest, ctx),
      `身代わり：${nameOf(victimNum)}の代わりに${nameOf(chosen.sacrificeNum)}${log}`);
  }

  if (chosen.costType === 'discardSpell') {
    const picked: string[] = [];
    const restHand: string[] = [];
    for (const h of state.hand) {
      if (picked.length < chosen.amount && isSpell(h)) picked.push(h); else restHand.push(h);
    }
    return addLog(setOwnerState(victimOwner,
      { ...state, hand: restHand, trash: [...state.trash, ...picked] }, ctx),
      `身代わり：手札からスペル${picked.length}枚を捨てて${nameOf(victimNum)}のバニッシュを回避`);
  }

  if (chosen.costType === 'lifeCrash') {
    // 🔴§3 (cxxix)＝**ここに分岐が無く末尾の trashStackSpell へ落ちていた**＝スペルが無いので
    //   「0枚トラッシュ」で成立し、**ライフを払わずにバニッシュを回避**していた（実機で検出）。
    //   engine 側でも `execLifeCrash` と同じ形で刻む＝**ライフクロスは裏向きで選べない**ので
    //   一番上（配列末尾）から amount 枚、先頭1枚は `field.check` へ＝**【ライフバースト】確認フローへ
    //   通常どおり乗る**（バトル経路の `crashOneLife` と同じ扱い）。
    //   ⚠**ダメージではなく置換コスト**なので、ダメージ無効・ライフクラッシュ置換は通さない
    //   （バトル経路が `crashOneLife` を通しているのとは別の判断＝ここは engine の同期経路）。
    const life = [...state.life_cloth];
    const crashed: string[] = [];
    for (let i = 0; i < chosen.amount && life.length > 0; i++) crashed.push(life.pop()!);
    const checkCard = crashed[0] ?? null;
    const pending = crashed.slice(1);
    return addLog(setOwnerState(victimOwner, {
      ...state,
      life_cloth: life,
      life_crashed_this_turn: (state.life_crashed_this_turn ?? 0) + crashed.length,
      field: { ...state.field, check: checkCard },
      pending_crashed_cards: pending.length > 0
        ? [...(state.pending_crashed_cards ?? []), ...pending] : state.pending_crashed_cards,
      crash_source_card_num: checkCard ? victimNum : state.crash_source_card_num,
      pending_crash_source_card_nums: pending.length > 0
        ? [...(state.pending_crash_source_card_nums ?? []), ...pending.map(() => victimNum)]
        : state.pending_crash_source_card_nums,
    }, ctx),
      `身代わり：ライフクロス${crashed.length}枚をクラッシュして${nameOf(victimNum)}のバニッシュを回避`);
  }

  // ⚠**ここから下は `trashStackSpell` 専用**＝在庫0でも「0枚トラッシュ」で**成立してしまう**ので、
  //   未実装 costType を落とし込むと**コスト0の身代わり**になる（§3 (cxxix) がまさにこれだった）。
  //   ⇒ **新しい costType を足したら、まず `isImplementedSubstituteCost` に登録すること**
  //      （登録しないものは列挙側で落ちるので、そもそもここへ来ない）。
  // trashStackSpell: 宣言者（sourceNum）の下からスペルを amount 枚トラッシュへ。トップと残りは維持。
  const srcZone = state.field.signi.findIndex(stack => stack?.at(-1) === chosen.sourceNum);
  const stack = srcZone >= 0 ? (state.field.signi[srcZone] ?? []) : [];
  const top = stack.at(-1);
  const trashed: string[] = [];
  const keptUnder: string[] = [];
  for (const u of stack.slice(0, -1)) {
    if (trashed.length < chosen.amount && isSpell(u)) trashed.push(u); else keptUnder.push(u);
  }
  const nextSigni = [...state.field.signi] as (string[] | null)[];
  if (srcZone >= 0 && top) nextSigni[srcZone] = [...keptUnder, top];
  return addLog(setOwnerState(victimOwner,
    { ...state, trash: [...state.trash, ...trashed], field: { ...state.field, signi: nextSigni } }, ctx),
    `身代わり：${nameOf(chosen.sourceNum)}の下からスペル${trashed.length}枚をトラッシュして${nameOf(victimNum)}のバニッシュを回避`);
}

/** 従来の入口（自動 policy で1本選んで適用する）。決定層の collect→choose→apply を束ねたもの。 */
export function applyEffectBanishSubstitute(
  victimNum: string,
  victimOwner: Owner,
  ctx: ExecCtx,
): { ctx: ExecCtx; replaced: boolean } {
  const chosen = collectEffectBanishSubstituteChoices(victimNum, victimOwner, ctx)
    .find(banishSubstituteAutoEligible);
  if (!chosen) return { ctx, replaced: false };
  return { ctx: applyEffectBanishSubstituteChoice(victimNum, victimOwner, chosen, ctx), replaced: true };
}

/**
 * 相手効果による場離れの**置換チェーンの唯一の入口**（タスク12(xcvii)）。
 *
 * 適用順は固定＝①ルリグ付与能力の喪失（`…LrigAbility`）→②パワー減の身代わり（`…PowerReduction`）→
 * ③**バニッシュ経路なら** F-3 身代わり（`…BanishSubstitute`）／**非バニッシュ経路なら**バニッシュへの
 * 差し替え（`…ReplaceBanish`）→④能力なし→デッキ下（`…NoAbilityDeckBottom`）。
 * 先に成立したものを1つだけ適用して打ち切る（従来の手書きチェーンと同じ早期 return）。
 *
 * - **バニッシュ経路からは `isBanish: true`** で呼ぶ。③の2本は排他＝`ReplaceBanish` の原文は
 *   「その移動が**バニッシュによるものでないなら**」、F-3 身代わりは逆に**バニッシュのときだけ**成立する。
 *   ⚠**フラグを1つにまとめてあるのは、バニッシュ経路を新設した人が片方だけ書いて取りこぼすのを防ぐため**。
 * - 呼び出し側は `if (sub.replaced) { …置換済みなので本来の移動はしない… }` だけ書けばよい。
 *
 * 【背景】従来は離場11経路が3〜4本の置換を**手書きで並べて**いて、`execSendToEnergy` の複数選択経路だけ
 * ①の呼び出しが抜けていた＝「代わりにこの能力を失う」（`SPDi44-08`／`WX25-P1-018` の【常】）が
 * **エナ送りに対してだけ効かない**（原文は「場を離れる場合」＝エナ送りも当然含む）。
 * 置換手段が増えるたびに11箇所へ追記する形だと同じ漏れが再発するので、入口を1本に畳んで構造的に潰す。
 */

/**
 * 離場置換の「軸」。⚠**`kind` は原文の語尾で決まる**（実装の都合ではない）＝
 * `mandatory` は原文に「してもよい」が**無い**＝プレイヤーに選択の余地が無く、**自動適用が正しい**
 * （近似ではない）。`optional` は「〜してもよい」＝本来は被害側プレイヤーが選ぶ。
 *
 * 2026-08-11（続き429）の原文全数照合の結果：
 * - `lrigAbility`（`EFFECT_LEAVE_PREVENT_LOSE_LRIG_ABILITY`＝`SPDi44-08`/`WX25-P1-018`）
 *   「代わりにこのルリグはこの能力を失う」＝**強制**
 * - `noAbilityDeckBottom`（`NO_ABILITY_SIGNI_TO_DECK_BOTTOM`＝`WXEX2-30`）
 *   「代わりにデッキの一番下に置かれる」＝**強制**
 * - `powerReduction`（`WX06-019`）／`banishSubstitute`（F-3 8枚）／`replaceBanish`（`WX25-P1-056`）＝**任意**
 */
export type LeaveSubstituteAxisId =
  | 'lrigAbility' | 'selfAbility' | 'powerReduction' | 'selfAbilityPay' | 'banishSubstitute' | 'replaceBanish' | 'noAbilityDeckBottom';

export interface LeaveSubstituteOption {
  axis: LeaveSubstituteAxisId;
  /**
   * 決定を state に刻むための安定キー（`PlayerState.leave_substitute_choices` の値）。
   * ⚠**盤面から再導出できる情報だけで組む**＝pause を跨いだあとに `collectLeaveSubstituteOptions` を
   *   引き直して同じキーが出せなければ、その決定は「もう成立しない」として通常の移動に倒す。
   */
  key: string;
  /** 原文の語尾由来。`mandatory` は選択肢に出さず必ず適用する。 */
  kind: 'mandatory' | 'optional';
  /** 対話UI／ログ用の短い説明（この置換を選ぶと何が起きるか）。 */
  label: string;
  /**
   * engine の自動 policy で選んでよいか。`false` は**対話が来るまで適用しない**もの
   * （現状 `WX14-026` の `lifeCrash` だけ＝【ライフバースト】確認フローを同期的に差し込めない）。
   */
  autoEligible: boolean;
  /**
   * この置換を適用した後の ctx（**投機実行済み**）。`ExecCtx` は `setOwnerState`／`addLog` とも
   * 不変なので、採用しなかった候補の ctx は捨てるだけで副作用は残らない（ログも漏れない）。
   */
  resultCtx: ExecCtx;
}

/**
 * 離場置換の候補を**適用せずに**列挙する（決定層の enumerate 側・続き429）。
 *
 * 並びは従来の適用順そのまま＝①`lrigAbility`（強制）→②`powerReduction`→
 * ③`isBanish` なら F-3 身代わり／そうでなければ `replaceBanish`→④`noAbilityDeckBottom`（強制）。
 * ⚠**この並びを変えると `autoChooseLeaveSubstitute` の選択が変わる**＝挙動が変わる。
 *
 * ⚠③の2本が排他なのは原文の条件が排他だから（`replaceBanish`＝「その移動がバニッシュによるもので
 * ないなら」／F-3＝「バニッシュされる場合」）。`isBanish` を1つのフラグにまとめてあるのは、
 * 離場経路を新設した人が片方だけ書いて取りこぼすのを防ぐため。
 */
export function collectLeaveSubstituteOptions(
  victimNum: string,
  victimOwner: Owner,
  ctx: ExecCtx,
  opts?: { isBanish?: boolean },
): LeaveSubstituteOption[] {
  const out: LeaveSubstituteOption[] = [];
  const push = (
    axis: LeaveSubstituteAxisId, kind: 'mandatory' | 'optional', label: string,
    r: { ctx: ExecCtx; replaced: boolean },
  ) => { if (r.replaced) out.push({ axis, key: axis, kind, label, autoEligible: true, resultCtx: r.ctx }); };

  push('lrigAbility', 'mandatory', '代わりにルリグがこの能力を失う',
    applyEffectLeaveLrigAbilitySubstitute(victimNum, victimOwner, ctx));
  // §6.4 O-10（続き507）＝シグニ自身の「代わりにこの能力を失う」。原文に「してもよい」が無いので
  // **強制**（`lrigAbility` と同じ扱い）。⚠`lrigAbility` の直後に置く＝どちらも強制なので、
  // 順序を任意軸より後ろにすると「任意置換を辞退したのに強制が効かない」形の取りこぼしになる。
  push('selfAbility', 'mandatory', '代わりにこのシグニがこの能力を失う',
    applyEffectLeaveSelfAbilitySubstitute(victimNum, victimOwner, ctx));
  push('powerReduction', 'optional', '代わりに身代わりシグニのパワーを下げる',
    applyEffectLeavePowerReductionSubstitute(victimNum, victimOwner, ctx));
  // §6.4 O-10（続き511）＝コスト付きの「代わりにこの能力を失う」。⚠**無料の軸より後ろ**に置く
  //   （自動 policy は先頭から採るので、先に置くとタダで済む置換があるのに資源を払ってしまう）。
  push('selfAbilityPay', 'optional', '〈コスト〉を払って代わりにこの能力を失う',
    applyEffectLeavePayLoseSelfAbilitySubstitute(victimNum, victimOwner, ctx));
  if (opts?.isBanish) {
    // ⚠**engine が徴収できないコストは列挙しない**（§3 (cxxix)＝落とすと apply 側の末尾へ流れて
    //   「0枚トラッシュ」で成立し、コスト0でバニッシュを回避できてしまう）。
    for (const choice of collectEffectBanishSubstituteChoices(victimNum, victimOwner, ctx)
      .filter(isImplementedSubstituteCost)) {
      out.push({
        axis: 'banishSubstitute',
        key: `banishSubstitute:${choice.sourceNum}:${choice.kind === 'sacrifice' ? choice.sacrificeNum : `${choice.costType}${choice.amount}`}`,
        kind: 'optional',
        label: choice.kind === 'sacrifice'
          ? `代わりに${ctx.cardMap.get(getCardNum(choice.sacrificeNum))?.CardName ?? choice.sacrificeNum}をバニッシュする`
          : choice.costType === 'discardSpell' ? `代わりに手札からスペル${choice.amount}枚を捨てる`
          : choice.costType === 'trashStackSpell' ? `代わりにこのシグニの下からスペル${choice.amount}枚をトラッシュに置く`
          : `代わりにライフクロス${choice.amount}枚をクラッシュする`,
        autoEligible: banishSubstituteAutoEligible(choice),
        resultCtx: applyEffectBanishSubstituteChoice(victimNum, victimOwner, choice, ctx),
      });
    }
  } else {
    push('replaceBanish', 'optional', '代わりにそのシグニをバニッシュする',
      applyEffectLeaveReplaceBanishSubstitute(victimNum, victimOwner, ctx));
  }
  push('noAbilityDeckBottom', 'mandatory', '代わりにデッキの一番下に置く',
    applyEffectLeaveNoAbilityDeckBottomSubstitute(victimNum, victimOwner, ctx));
  return out;
}

/**
 * engine の現行 policy＝**成立した最初の1本を適用する**（決定論的近似）。
 *
 * ⚠`optional`（原文「してもよい」）を勝手に適用しているのはこの policy であって、列挙側ではない。
 * **対話化はこの関数を差し替えるだけ**＝`collectLeaveSubstituteOptions` の結果を被害側プレイヤーへ
 * `CHOOSE{opponentResponds:true}` で出し、選ばれた option の `resultCtx` を採る（§6.4 の残作業）。
 * `mandatory` は選択肢に出さず必ず適用すること（原文に「してもよい」が無い）。
 */
export function autoChooseLeaveSubstitute(
  options: readonly LeaveSubstituteOption[],
): LeaveSubstituteOption | null {
  return options.find(o => o.autoEligible) ?? null;
}

/** 被害側が下した決定を1件消費する（`ctx` から取り除いた新しい ctx を返す）。 */
function consumeLeaveSubstituteDecision(
  victimNum: string, victimOwner: Owner, ctx: ExecCtx,
): { decision: string | undefined; ctx: ExecCtx } {
  const state = ownerState(victimOwner, ctx);
  const decision = state.leave_substitute_choices?.[victimNum];
  if (decision === undefined) return { decision, ctx };
  const rest = { ...state.leave_substitute_choices };
  delete rest[victimNum];
  return {
    decision,
    ctx: setOwnerState(victimOwner,
      { ...state, leave_substitute_choices: Object.keys(rest).length > 0 ? rest : undefined }, ctx),
  };
}

/**
 * 被害側の決定（`leave_substitute_choices`）があればそれを、無ければ現行 policy を採る。
 *
 * ⚠**「置換しない」を選んでも `mandatory` 軸は適用する**＝原文に「してもよい」が無い置換
 * （`WXEX2-30`／`SPDi44-08`）はプレイヤーが断れない。任意軸を辞退した結果として強制軸が
 * 残るなら、そちらは必ず効く。
 * ⚠**決定は再検証する**＝pause 中に盤面が変わって同じ key の候補が出せないなら、
 * 黙って「置換しない」に倒す（存在しない身代わりを適用して盤面を壊さない）。
 */
export function applyEffectLeaveSubstitutes(
  victimNum: string,
  victimOwner: Owner,
  ctx: ExecCtx,
  opts?: { isBanish?: boolean },
): { ctx: ExecCtx; replaced: boolean } {
  const consumed = consumeLeaveSubstituteDecision(victimNum, victimOwner, ctx);
  const base = consumed.ctx;
  const options = collectLeaveSubstituteOptions(victimNum, victimOwner, base, opts);
  const chosen = consumed.decision === undefined
    ? autoChooseLeaveSubstitute(options)
    : (options.find(o => o.key === consumed.decision && o.kind === 'optional')
       ?? options.find(o => o.kind === 'mandatory')
       ?? null);
  return chosen ? { ctx: chosen.resultCtx, replaced: true } : { ctx: base, replaced: false };
}

/**
 * その instance がまだ**シグニゾーンの一番上**に居るか（§3 (cxxvi) の再処理ガード）。
 *
 * 🔑**離場の per-card ループは「選んだ時点の盤面」で回る**ので、ループ中に別の victim の身代わりが
 * 成立して**先にこの instance が場を離れている**ことがある（相互身代わり＝A が B を、B が A を指定）。
 * そのまま `removeFromField`（空振り）→移動先へ push すると、**同じ instance がエナ/トラッシュに2枚**現れる。
 * ⚠**`at(-1)` で見る**＝下のカードは「場のシグニ」ではない（EXILE の下カード経路だけは別判定なので、
 * このヘルパを使わないこと）。
 */
function isOnFieldTop(num: string, owner: Owner, ctx: ExecCtx): boolean {
  return ownerState(owner, ctx).field.signi.some(st => st?.at(-1) === num);
}

/**
 * その victim について**被害側に問うべき任意置換**があるか（`hoistLeaveSubstituteAsks` の判定）。
 *
 * - 既に決定済みなら問わない（同じ問いを2回出さない）。
 * - `mandatory` が先に成立するなら問わない＝強制置換が勝つので選択の余地が無い。
 * - `optional` が1つでもあれば問う。⚠`autoEligible:false`（`WX14-026` の lifeCrash）も**問う**＝
 *   対話でなら選べる（engine の自動適用ができないだけ）。ここが M1 で列挙側に載せておいた効き目。
 */
export function leaveSubstituteAskOptions(
  victimNum: string,
  victimOwner: Owner,
  ctx: ExecCtx,
  opts?: { isBanish?: boolean },
): LeaveSubstituteOption[] {
  if (ownerState(victimOwner, ctx).leave_substitute_choices?.[victimNum] !== undefined) return [];
  const options = collectLeaveSubstituteOptions(victimNum, victimOwner, ctx, opts);
  if (options.length === 0 || options[0].kind === 'mandatory') return [];
  return options.filter(o => o.kind === 'optional');
}

/**
 * 離場置換の「先に全部聞く」チェーンを組む（§6.4 M2・続き430）。
 *
 * 🔑**設計の要点＝離場ループの途中では pause しない**。engine には「per-card ループの途中で中断して
 * 残りを再開する」機構が無い（`resumeSelectTarget` の per-card ループは pause すると残りを落とすため、
 * ADD_TO_FIELD 等は個別に特例回避してある）。そこで**移動を1つも適用する前に**、対象すべてについて
 * 被害側へ問い、決定を `PlayerState.leave_substitute_choices` に刻んでから、**従来どおり同期的に**
 * 適用する。決定は PlayerState なので pause を跨いで自動的に保持される（`banish_substitute_choice` と同型）。
 *
 * - 問う相手は**被害側**＝`CHOOSE{opponentResponds:true}`（`victimOwner==='opponent'` のときだけ
 *   任意置換が成立するので、応答者は常に効果主の対戦相手）。
 * - 問う必要が1体も無ければ `null` を返す＝**呼び出し側は従来の同期パスをそのまま走らせる**
 *   （＝大多数の盤面でコードパスが変わらない＝退化リスクを新経路だけに閉じ込める）。
 * - `then` は「問い終わったあとに実行する本来の処理」。
 */
/**
 * `applyDirectAction` が離場置換を通すアクション型（＝原文「場を離れる場合」の対象）。
 * ⚠**ここに足し忘れると、その移動だけ置換の対話を素通りする**（`applyEffectLeaveSubstitutes` の
 *   呼び出し箇所と1対1で対応させること）。
 */
const LEAVE_MOVE_ACTION_TYPES = new Set(['BANISH', 'BOUNCE', 'SEND_TO_ENERGY', 'TRASH', 'EXILE', 'TRANSFER_TO_DECK']);

/** その離場アクションで被害側へ問うべき任意置換があるか（`hoistLeaveSubstituteAsks` の呼び出し前判定）。 */
export function leaveSubstituteAskQueue(
  actionType: string,
  cardNums: readonly string[],
  ctx: ExecCtx,
): { queue: string[]; isBanish: boolean } {
  if (!LEAVE_MOVE_ACTION_TYPES.has(actionType)) return { queue: [], isBanish: false };
  const isBanish = actionType === 'BANISH';
  // ⚠任意置換は `victimOwner === 'opponent'`（＝効果主から見た相手側）でしか成立しないので、
  //   自分の効果で自分のシグニを動かす経路はここで落ちる＝問い自体が出ない。
  const queue = cardNums.filter(n =>
    ctx.otherState.field.signi.some(st => st?.at(-1) === n)
    && leaveSubstituteAskOptions(n, 'opponent', ctx, { isBanish }).length > 0);
  return { queue, isBanish };
}

export function hoistLeaveSubstituteAsks(
  victims: readonly string[],
  victimOwner: Owner,
  ctx: ExecCtx,
  then: EffectAction,
  opts?: { isBanish?: boolean },
): ExecResult | null {
  const queue = victims.filter(v => leaveSubstituteAskOptions(v, victimOwner, ctx, opts).length > 0);
  if (queue.length === 0) return null;
  return executeAction(makeLeaveSubAsk(queue, victimOwner, then, opts), ctx);
}

/** 何もしない action（ask チェーンの末端が空のとき用）。 */
const noOpAction = (): EffectAction =>
  ({ type: 'STUB', id: 'INTERNAL_LEAVE_SUB_NOOP' } as unknown as EffectAction);

function makeLeaveSubAsk(
  queue: string[], victimOwner: Owner, then: EffectAction, opts?: { isBanish?: boolean },
): EffectAction {
  return {
    type: 'STUB', id: 'INTERNAL_LEAVE_SUB_ASK',
    leaveSub: { queue, victimOwner, ...(opts?.isBanish ? { isBanish: true } : {}) },
    thenAction: then,
  } as unknown as EffectAction;
}

/**
 * `INTERNAL_LEAVE_SUB_ASK` の本体＝待ち行列の先頭1体について被害側へ CHOOSE を出す。
 * 候補が無くなっていたら（盤面が変わった／既に決定済み）その1体は飛ばして次へ進む。
 */
export function execLeaveSubAsk(stub: StubAction, ctx: ExecCtx): ExecResult {
  const spec = stub.leaveSub ?? {};
  const victimOwner: Owner = spec.victimOwner ?? 'opponent';
  const isBanish = spec.isBanish;
  const then = (stub as unknown as { thenAction?: EffectAction }).thenAction;
  const queue = [...(spec.queue ?? [])];
  while (queue.length > 0) {
    const victim = queue.shift()!;
    const options = leaveSubstituteAskOptions(victim, victimOwner, ctx, { isBanish });
    if (options.length === 0) continue;
    const rest: EffectAction | undefined = queue.length > 0
      ? makeLeaveSubAsk(queue, victimOwner, then ?? noOpAction(), { isBanish })
      : then;
    const decide = (choice: string): EffectAction => ({
      type: 'STUB', id: 'INTERNAL_LEAVE_SUB_DECIDE',
      leaveSub: { victim, choice, victimOwner },
    } as unknown as EffectAction);
    const victimName = ctx.cardMap.get(getCardNum(victim))?.CardName ?? victim;
    return needsInteraction(addLog(ctx, `${victimName}の場離れを置換しますか？（対戦相手が選択）`), {
      type: 'CHOOSE',
      count: 1,
      opponentResponds: true,
      leaveSubstituteAsk: true,
      options: [
        ...options.map(o => ({ id: o.key, label: o.label, available: true, action: decide(o.key) })),
        { id: 'none', label: '置換しない', available: true, action: decide('none') },
      ],
      ...(rest ? { continuation: rest } : {}),
    });
  }
  return then ? executeAction(then, ctx) : done(ctx);
}

/** `INTERNAL_LEAVE_SUB_DECIDE` の本体＝被害側の決定を state に刻むだけ（適用は移動の直前）。 */
export function execLeaveSubDecide(stub: StubAction, ctx: ExecCtx): ExecResult {
  const spec = stub.leaveSub ?? {};
  const victim = spec.victim;
  if (!victim) return done(ctx);
  const victimOwner: Owner = spec.victimOwner ?? 'opponent';
  const state = ownerState(victimOwner, ctx);
  const next = { ...(state.leave_substitute_choices ?? {}), [victim]: spec.choice ?? 'none' };
  return done(setOwnerState(victimOwner, { ...state, leave_substitute_choices: next }, ctx));
}

/** 効果元シグニの正面（相手ゾーン 2-zi）にいる相手シグニを解決する。 */
export function resolveFrontOfSelfCardNum(ctx: Pick<ExecCtx, 'ownerState' | 'otherState' | 'sourceCardNum'>): string | null {
  const zi = ctx.ownerState.field.signi.findIndex(s => s?.at(-1) === ctx.sourceCardNum);
  if (zi < 0) return null;
  return ctx.otherState.field.signi[2 - zi]?.at(-1) ?? null;
}

/**
 * filter.aboveSelf:「このカードの上にあるシグニ」＝効果元カード（sourceCardNum）が**下に置かれている**
 * スタックの最前面シグニ。効果元が最前面（＝自分自身がホスト）の場合は該当なし＝null を返す
 * （自己バフに化けさせない）。WXDi-P11-063-E2（ON_PLACED_UNDER_SIGNI）で使用。
 */
export function resolveAboveSelfCardNum(ctx: Pick<ExecCtx, 'ownerState' | 'sourceCardNum'>): string | null {
  const self = ctx.sourceCardNum;
  if (!self) return null;
  for (const stack of ctx.ownerState.field.signi) {
    if (!stack || stack.length < 2) continue;
    if (stack.at(-1) === self) continue; // 自分が最前面＝「上にあるシグニ」は存在しない
    if (!stack.includes(self)) continue;
    return stack[stack.length - 1];
  }
  return null;
}

function execBanish(a: BanishAction, ctx: ExecCtx): ExecResult {
  // conditional: true = 前ステップ（STUB等）がlastProcessedCardsを設定した場合のみ実行
  if (a.conditional && (!ctx.lastProcessedCards || ctx.lastProcessedCards.length === 0)) {
    return done(addLog(ctx, '条件未達成 → BANISH スキップ'));
  }
  const tgt = a.target;
  // levelEqDiscardLevelSum / levelEqualsVar: コスト支払い時の動的値でフィルターを解決
  const preResolvedFilter: import('../types/effects').TargetFilter | undefined = tgt.filter?.levelEqDiscardLevelSum
    ? { ...tgt.filter, levelEqDiscardLevelSum: undefined, level: ctx.ownerState.last_activated_discard_level_sum ?? -1 }
    : tgt.filter?.levelEqualsVar === 'charm_trash_count'
    ? { ...tgt.filter, levelEqualsVar: undefined, level: ctx.ownerState.last_charm_trash_count ?? 0 }
    : tgt.filter?.levelEqualsVar === 'field_trash_level'
    ? { ...tgt.filter, levelEqualsVar: undefined, level: ctx.ownerState.last_field_trash_level ?? -1 }
    : tgt.filter?.levelEqualsVar === 'cost_hand_to_energy_level'
    ? { ...tgt.filter, levelEqualsVar: undefined, level: typeof ctx.ownerState.last_cost_hand_to_energy_level === 'number' ? ctx.ownerState.last_cost_hand_to_energy_level : -1 }
    : tgt.filter?.levelEqualsVar === 'cost_energy_trash_level_sum'
    ? { ...tgt.filter, levelEqualsVar: undefined, level: typeof ctx.ownerState.last_cost_energy_trash_level_sum === 'number' ? ctx.ownerState.last_cost_energy_trash_level_sum : -1 }
    : tgt.filter;
  // colorMatchesLrig / levelLteFieldVirusCount / powerLtSelf等の動的フィルタを解決（activatorはctx.ownerState固定）
  const colorUsesTargetLrig = !!(preResolvedFilter?.colorMatchesLrig || preResolvedFilter?.colorNotMatchesLrig);
  const filterOwnerSt = colorUsesTargetLrig && tgt.owner === 'opponent' ? ctx.otherState : ctx.ownerState;
  const filterOtherSt = colorUsesTargetLrig && tgt.owner === 'opponent' ? ctx.ownerState : ctx.otherState;
  let resolvedFilter = resolveDynamicFilter(preResolvedFilter, filterOwnerSt, ctx.cardMap, filterOtherSt, ctx.lastProcessedCards, ctx.effectivePowers, ctx.sourceCardNum, ctx.triggeringCardNum);
  // WX09-027(羅石オリハルティア): 自場にオリハルティアがあるとき、《オリハルティア》以外のシグニの
  // 「対戦相手のパワー7000以下を1体バニッシュ」→「15000以下」に書き換える
  if (tgt.owner === 'opponent' && resolvedFilter?.powerRange?.max === 7000) {
    const srcName = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum)?.CardName : undefined;
    if (srcName !== '羅石　オリハルティア') {
      const hasOrihaltia = ctx.ownerState.field.signi.some(stack => {
        const top = stack?.at(-1);
        return !!top && ctx.cardMap.get(top)?.CardName === '羅石　オリハルティア';
      });
      if (hasOrihaltia) {
        resolvedFilter = { ...resolvedFilter, powerRange: { ...resolvedFilter.powerRange, max: 15000 } };
      }
    }
  }
  // owner:any は両側が候補になる。相手側は opponent/any、自分側は any の保護集合を使う。
  const banishProtected = new Set<string>([
    ...(tgt.owner !== 'self' ? ctx.otherBanishProtectedNums ?? [] : []),
    ...(tgt.owner !== 'opponent' ? ctx.ownBanishProtectedNums ?? [] : []),
  ]);
  if (tgt.owner !== 'self') {
    const grants = ctx.otherState.keyword_grants ?? {};
    for (const [cardNum, kws] of Object.entries(grants)) {
      if (kws.some(kw => kw.startsWith('PROTECTION:') && (kw.includes('BANISH') || kw.includes('any'))
        && (kw.endsWith(':opponent') || kw.endsWith(':any')))) {
        banishProtected.add(cardNum);
      }
    }
  }
  if (tgt.owner !== 'opponent') {
    const grants = ctx.ownerState.keyword_grants ?? {};
    for (const [cardNum, kws] of Object.entries(grants)) {
      if (kws.some(kw => kw.startsWith('PROTECTION:') && (kw.includes('BANISH') || kw.includes('any')) && kw.endsWith(':any'))) {
        banishProtected.add(cardNum);
      }
    }
  }
  // thisCardOnly: 効果元シグニ自身のみを対象（「このシグニをバニッシュする」）
  let thisCardRestrict: string[] | null = null;
  if (resolvedFilter?.thisCardOnly) {
    const { thisCardOnly: _t, ...rest } = resolvedFilter;
    resolvedFilter = rest;
    thisCardRestrict = ctx.sourceCardNum ? [ctx.sourceCardNum] : [];
  }
  // isTriggerSource: トリガー元カード（ctx.triggeringCardNum）のみを対象
  let triggerRestrict: string[] | null = null;
  if (resolvedFilter?.isTriggerSource) {
    const { isTriggerSource: _ts, ...rest } = resolvedFilter;
    resolvedFilter = rest;
    triggerRestrict = ctx.triggeringCardNum ? [ctx.triggeringCardNum] : [];
  }
  // frontOfSelf: 効果元シグニの正面（相手ゾーン 2-zi）のシグニに限定
  let frontRestrict: string[] | null = null;
  if (resolvedFilter?.frontOfSelf) {
    const { frontOfSelf: _f, ...rest } = resolvedFilter;
    resolvedFilter = rest;
    const frontNum = tgt.owner === 'opponent' ? resolveFrontOfSelfCardNum(ctx) : null;
    frontRestrict = frontNum ? [frontNum] : [];
  }
  // owner:'any'（修飾語なし「シグニ1体を対象とし」）は両フィールドから候補を集める（タスク12(lii)）。
  // 適用は applyDirectAction の BANISH が選択カードの所属側を探索して解決する（既存実装）。
  const { cands: allBanishCands, scope: banishScope } = fieldCandidatesByOwner(tgt.owner, resolvedFilter, ctx);
  let cands = banishProtected.size > 0 ? allBanishCands.filter(n => !banishProtected.has(n)) : allBanishCands;
  if (a.targetsLastProcessed) {
    const fixed = new Set(ctx.lastProcessedCards ?? []);
    cands = cands.filter(n => fixed.has(n));
  }
  if (a.targetsStored) {
    const fixed = new Set(ctx.storedTargetCards ?? []);
    cands = cands.filter(n => fixed.has(n));
  }
  if (a.fixedCardNums) {
    const fixed = new Set(a.fixedCardNums);
    cands = cands.filter(n => fixed.has(n));
  }
  if (thisCardRestrict !== null) cands = cands.filter(n => thisCardRestrict!.includes(n));
  if (triggerRestrict !== null) cands = cands.filter(n => triggerRestrict!.includes(n));
  if (frontRestrict !== null) cands = cands.filter(n => frontRestrict!.includes(n));
  // excludeSelf（「（あなたの）他のシグニ」）＝効果元シグニ自身を対象から除外。⚠**execBanish だけ未配線だった**
  //   （続き377）＝`matchesFilter` は excludeSelf を見ないので、`WX22-024-E2`「あなたの他のすべてのシグニを
  //   バニッシュしてもよい」のように JSON には載っているのに**効果元自身まで巻き込んで消えて**いた。
  //   POWER_MODIFY（:809）・GRANT_KEYWORD（:2667）等は既に同じ形で実装済み。
  if (resolvedFilter?.excludeSelf && ctx.sourceCardNum) cands = cands.filter(n => n !== ctx.sourceCardNum);
  if (tgt.owner !== 'self') {
    const grants = ctx.otherState.keyword_grants;
    // 'any' の場合は相手側の候補にだけバニッシュ耐性を効かせる（自分の場のシグニには相手の耐性は無関係）
    const oppSide = new Set(ctx.otherState.field.signi.flatMap(st => st?.at(-1) ? [st.at(-1)!] : []));
    cands = cands.filter(n => (tgt.owner === 'any' && !oppSide.has(n)) || !hasBanishResist(n, ctx.cardMap, grants));
  }
  const scope: TargetScope = banishScope;

  function applyBanish(selected: string[], c: ExecCtx): ExecCtx {
    let cur = c;
    for (const num of selected) {
      // owner:'any' は選んだ1枚がどちらの場にあるかで所属を決める（タスク12(lii)）
      const own: Owner = tgt.owner === 'any' ? sideOfFieldCard(num, cur) : tgt.owner;
      const s = ownerState(own, cur);
      // CHARM_PROTECTION（WX04-052-E1）: チャーム盾対象なら、チャーム1枚をトラッシュして場に残す（バニッシュ回避）
      if (cur.charmShieldNums?.has(num)) {
        const zi = s.field.signi.findIndex(st => st?.at(-1) === num);
        const charm = zi >= 0 ? (s.field.signi_charms?.[zi] ?? null) : null;
        if (charm) {
          const newCharms = [...(s.field.signi_charms ?? [null, null, null])];
          newCharms[zi] = null;
          cur = addLog(setOwnerState(own, { ...s, field: { ...s.field, signi_charms: newCharms }, trash: [...s.trash, charm] }, cur),
            `${cur.cardMap.get(num)?.CardName ?? num}の【チャーム】をトラッシュしてバニッシュを回避`);
          continue;
        }
      }
      // バニッシュ経路＝`ReplaceBanish` は対象外／代わりに F-3 身代わり（BANISH_SUBSTITUTE）が乗る
      const sub = applyEffectLeaveSubstitutes(num, own, cur, { isBanish: true });
      cur = sub.ctx;              // ⚠(cxxx)＝置換不成立でも「決定の消費」は必ず反映する
      if (sub.replaced) continue;
      if (!isOnFieldTop(num, own, cur)) continue;  // (cxxvi)＝もう場に居ないものは二度と動かさない
      const s2 = ownerState(own, cur);             // ⚠`cur` を更新したので取り直す
      const removed = removeFromField(num, s2);
      // バニッシュ先リダイレクト（トラッシュ/手札/デッキ下＋効果経路の【常】置換走査）を適用
      const opp = ownerState(own === 'self' ? 'opponent' : 'self', cur);
      const { state: dest, log } = banishDestination(removed, opp, num, banishRedirectOpts(cur, s2, num));
      cur = addLog(setOwnerState(own, dest, cur),
        `${cur.cardMap.get(num)?.CardName ?? num}${log}`);
    }
    return cur;
  }

  // totalPowerMax: 「パワーの合計がN以下になるように好きな数」→ 合計パワー制限つき複数選択
  if (tgt.totalPowerMax !== undefined) {
    if (cands.length === 0) return done(ctx);
    const candidatePowers: Record<string, number> = {};
    for (const n of cands) {
      candidatePowers[n] = ctx.effectivePowers?.get(n) ?? parseInt(ctx.cardMap.get(n)?.Power ?? '0', 10);
    }
    const maxPick = typeof tgt.count === 'number' ? Math.min(tgt.count, cands.length) : cands.length;
    return selectOrInteract(cands, maxPick, true, scope, a, undefined, ctx, false, {
      totalPowerMax: tgt.totalPowerMax,
      candidatePowers,
    });
  }
  // totalLevelMax: 「レベルの合計がN以下になるようにM体まで」→ レベル合計制限つき複数選択（最大 tgt.count 体）
  if (tgt.totalLevelMax !== undefined) {
    if (cands.length === 0) return done(ctx);
    const candidateLevels: Record<string, number> = {};
    for (const n of cands) candidateLevels[n] = parseInt(ctx.cardMap.get(n)?.Level ?? '0', 10) || 0;
    const maxPick = typeof tgt.count === 'number' ? tgt.count : cands.length;
    return selectOrInteract(cands, maxPick, true, scope, a, undefined, ctx, false, {
      totalLevelMax: tgt.totalLevelMax,
      candidateLevels,
    });
  }
  if (tgt.count === 'ALL') {
    // 「他のすべてを〜してもよい」は全件実行／全件スキップの二択。部分選択にはしない。
    if (a.optional) {
      const banishAll = { ...a, optional: false } as BanishAction;
      const skip = { type: 'STUB', id: 'INTERNAL_SKIP_OPTIONAL_ACTION' } as import('../types/effects').StubAction;
      return needsInteraction(addLog(ctx, '対象のシグニをすべてバニッシュしますか？'), {
        type: 'CHOOSE', count: 1,
        options: [
          { id: 'banish', label: 'すべてバニッシュする', action: banishAll, available: true },
          { id: 'skip', label: 'バニッシュしない', action: skip, available: true },
        ],
      });
    }
    // 「好きな数」（count:'ALL' + upToCount）: プレイヤーが0〜全部を選択（自動全バニッシュにしない）。execTrash と同じ慣例。
    if (tgt.upToCount) {
      if (cands.length === 0) return done({ ...ctx, lastProcessedCards: [] });
      return selectOrInteract(cands, cands.length, true, scope, a, undefined, ctx, false,
        { selectionConstraint: tgt.selectionConstraint });
    }
    // §6.4 離場置換の対話化（続き430）＝適用前に被害側へまとめて問い、決定を刻んでから**同じ action を再入**する
    //   （count:'ALL' 経路は候補が盤面から再導出されるので、適用前に戻っても選び直しにはならない）。
    { const ask = leaveSubstituteAskQueue('BANISH', cands, ctx);
      if (ask.queue.length > 0) return executeAction(makeLeaveSubAsk(ask.queue, 'opponent', a as EffectAction, { isBanish: ask.isBanish }), ctx); }
    return done({ ...applyBanish(cands, ctx), lastProcessedCards: cands });
  }
  // last_processed_count: 「トラッシュに置いたシグニ1体につき対戦相手のシグニ1体」→ 直前にトラッシュした枚数
  const count = resolveCountRef(tgt.count, ctx, tgt.countFromZone)
    + (tgt.addLastProcessedCount ? (ctx.lastProcessedCards?.length ?? 0) : 0);
  if (count <= 0) return done(addLog(ctx, 'バニッシュ数0 → スキップ'));
  // opponentSelects: 「対戦相手は自分のシグニ1体を対象とし、それをバニッシュする」→ 対戦相手が選ぶ
  const oppResponds = !!a.opponentSelects && tgt.owner === 'opponent';
  return selectOrInteract(cands, count, (a.optional ?? false) || (tgt.upToCount ?? false), scope, a, undefined, ctx, oppResponds, { selectionConstraint: tgt.selectionConstraint });
}

function execBounce(a: BounceAction, ctx: ExecCtx): ExecResult {
  const tgt = a.target;
  const bounceProtected = tgt.owner !== 'self' ? new Set(ctx.otherBounceProtectedNums ?? []) : new Set<string>();
  if (tgt.owner !== 'self') {
    const grants = ctx.otherState.keyword_grants ?? {};
    for (const [cardNum, kws] of Object.entries(grants)) {
      if (kws.some(kw => kw.startsWith('PROTECTION:') && (kw.includes('BOUNCE') || kw.includes('any')) && kw.endsWith(':opponent'))) {
        bounceProtected.add(cardNum);
      }
    }
  }
  // 動的フィルタ（powerLteLastProcessed / levelLteLastProcessed＝「この方法で処理したシグニのパワー/レベル以下」等）を解決
  const resolvedFilter = resolveDynamicFilter(tgt.filter, ctx.ownerState, ctx.cardMap, ctx.otherState, ctx.lastProcessedCards, ctx.effectivePowers, ctx.sourceCardNum, ctx.triggeringCardNum);
  // owner:'any'（修飾語なし「シグニ1体を対象とし」）は両フィールドから候補を集める（タスク12(lii)）
  const { cands: allCands, scope: bounceScope } = fieldCandidatesByOwner(tgt.owner, resolvedFilter, ctx);
  let cands = bounceProtected.size > 0 ? allCands.filter(n => !bounceProtected.has(n)) : allCands;
  if (a.targetsStored) cands = cands.filter(n => (ctx.storedTargetCards ?? []).includes(n));
  if (a.fixedCardNums) cands = cands.filter(n => a.fixedCardNums!.includes(n));
  const scope: TargetScope = bounceScope;

  function applyBounce(selected: string[], c: ExecCtx): ExecCtx {
    let cur = c;
    for (const num of selected) {
      const own: Owner = tgt.owner === 'any' ? sideOfFieldCard(num, cur) : tgt.owner;
      const sub = applyEffectLeaveSubstitutes(num, own, cur);
      cur = sub.ctx;              // ⚠(cxxx)＝置換不成立でも「決定の消費」は必ず反映する
      if (sub.replaced) continue;
      if (!isOnFieldTop(num, own, cur)) continue;  // (cxxvi)
      const s = ownerState(own, cur);
      const removed = removeFromField(num, s);
      // turn_signi_returned_to_hand: このターンにシグニが場から手札に戻ったフラグ（G087）
      const withHand: PlayerState = { ...removed, hand: [...removed.hand, num], turn_signi_returned_to_hand: true, signi_returned_to_hand_count_this_turn: (removed.signi_returned_to_hand_count_this_turn ?? 0) + 1 };
      cur = addLog(setOwnerState(own, withHand, cur),
        `${cur.cardMap.get(num)?.CardName ?? num}を手札に戻す`);
    }
    return cur;
  }

  if (tgt.count === 'ALL') {
    const moved = cands.filter(num =>
      ctx.ownerState.field.signi.some(stack => stack?.at(-1) === num)
      || ctx.otherState.field.signi.some(stack => stack?.at(-1) === num));
    // §6.4 離場置換の対話化（続き430）＝適用前に被害側へまとめて問い、決定を刻んでから**同じ action を再入**する
    //   （count:'ALL' 経路は候補が盤面から再導出されるので、適用前に戻っても選び直しにはならない）。
    { const ask = leaveSubstituteAskQueue('BOUNCE', moved, ctx);
      if (ask.queue.length > 0) return executeAction(makeLeaveSubAsk(ask.queue, 'opponent', a as EffectAction, { isBanish: ask.isBanish }), ctx); }
    return done({ ...applyBounce(moved, ctx), lastProcessedCards: moved });
  }
  const count = resolveCountRef(tgt.count, ctx, tgt.countFromZone);
  // opponentSelects: 「対戦相手は対象の自分のシグニ1体を手札に戻す」→ 対戦相手が選ぶ
  const oppResponds = !!a.opponentSelects && tgt.owner === 'opponent';
  return selectOrInteract(cands, count, (a.optional ?? false) || (tgt.upToCount ?? false), scope, a, undefined, ctx, oppResponds, { selectionConstraint: tgt.selectionConstraint });
}

// REVEAL: カードを公開する。source が HAND_CARD のときは手札からフィルタ一致のカードを選んで公開し、
// 公開したカードを lastProcessedCards に記録する（「公開されたシグニのパワー以下」等の参照用。WDK08-Y07）。
// 公開しても手札からは移動しない（選択＝公開のみ。thenAction はノーオップ REVEAL）。
function execReveal(a: import('../types/effects').RevealAction, ctx: ExecCtx): ExecResult {
  const src = a.source;
  if (src && src.type === 'HAND_CARD') {
    const state = ownerState(src.owner, ctx);
    const cands = handCandidates(state, src.filter, ctx.cardMap, ctx.treatAsClassAllZones);
    if (cands.length === 0) return done({ ...addLog(ctx, '公開できるカードがない'), lastProcessedCards: [] });
    const scope: TargetScope = src.owner === 'self' ? 'self_hand' : 'opp_hand';
    // 選択＝公開（手札に残す）。resumeSelectTarget が lastProcessedCards=選択カード をセットし continuation を実行する
    const revealCount = src.count === 'ALL' ? cands.length : resolveNum(src.count);
    // 「手札を公開してもよい」は一部公開ではなく、全公開／非公開の二択。
    if (src.count === 'ALL' && a.optional) {
      const revealAll = { ...a, optional: false } as import('../types/effects').RevealAction;
      const skip = { type: 'STUB', id: 'INTERNAL_SKIP_OPTIONAL_ACTION' } as import('../types/effects').StubAction;
      return needsInteraction(addLog(ctx, '手札をすべて公開しますか？'), {
        type: 'CHOOSE', count: 1,
        options: [
          { id: 'reveal', label: '公開する', action: revealAll, available: true },
          { id: 'skip', label: '公開しない', action: skip, available: true },
        ],
      });
    }
    return selectOrInteract(cands, revealCount, (a.optional ?? false) || (src.upToCount ?? false), scope, { type: 'REVEAL' }, undefined, ctx,
      false, { selectionConstraint: src.selectionConstraint });
  }
  return done(addLog(ctx, 'カードを公開'));
}

// REVEAL_DECK_TOP（B2）: デッキの上から count 枚を公開（ピックしない）。公開シグニのレベル合計と公開カード番号を記録。
// デッキからは取り除かない（公開のみ）。後続の動的閾値フィルタ・TRASH_REVEALED が記録を参照する。WX17-028。
function execRevealDeckTop(a: import('../types/effects').RevealDeckTopAction, ctx: ExecCtx): ExecResult {
  if (a.owner === 'self'
      && ctx.ownerState.holograph_reveal_replace_this_turn
      && ctx.ownerState.is_holograph_this_effect) {
    return execLookAndReorder({
      type: 'LOOK_AND_REORDER',
      source: { location: 'deck', owner: 'self' },
      count: 3,
      private: true,
      reorder: true,
      destination: { location: 'deck', owner: 'self', position: 'top' },
      revealTopAfterReorder: true,
    }, ctx);
  }
  const state = ownerState(a.owner, ctx);
  const n = resolveNum(a.count);
  const revealed = state.deck.slice(0, Math.min(n, state.deck.length));
  const levelSum = revealed.reduce((s, num) => {
    const card = ctx.cardMap.get(getCardNum(num));
    if (card?.Type !== 'シグニ') return s;
    const lv = parseInt(card?.Level ?? '', 10);
    return s + (isNaN(lv) ? 0 : lv);
  }, 0);
  const newS: PlayerState = { ...state, last_revealed_signi_level_sum: levelSum, last_revealed_deck_cards: revealed };
  return done({ ...addLog(setOwnerState(a.owner, newS, ctx), `デッキの上から${revealed.length}枚を公開（公開シグニのレベル合計${levelSum}）`), lastProcessedCards: revealed });
}

// TRASH_REVEALED（B2）: 直前に REVEAL_DECK_TOP で公開したカード（last_revealed_deck_cards）をデッキからトラッシュへ移す。WX17-028。
function execTrashRevealed(a: import('../types/effects').TrashRevealedAction, ctx: ExecCtx): ExecResult {
  const state = ownerState(a.owner, ctx);
  const revealed = state.last_revealed_deck_cards ?? [];
  if (revealed.length === 0) return done(addLog(ctx, '公開したカードがない'));
  const newDeck = state.deck.filter(n => !revealed.includes(n));
  const newS: PlayerState = {
    ...state,
    deck: newDeck,
    trash: [...state.trash, ...revealed.filter(n => state.deck.includes(n))],
    last_revealed_deck_cards: undefined,
  };
  return done(addLog(setOwnerState(a.owner, newS, ctx), `公開した${revealed.length}枚をトラッシュに置く`));
}

// EXILE: カードをゲームから除外し、専用 excluded ゾーンへ記録する。
// 選択カードを lastProcessedCards に記録（後続の LAST_PROCESSED_SHARE_COLOR 等の参照用。WDK10-008）。
function execExile(a: import('../types/effects').ExileAction, ctx: ExecCtx): ExecResult {
  const tgt = a.target;
  if (tgt.type === 'LRIG_DECK_CARD') {
    const state = ownerState(tgt.owner, ctx);
    const cands = state.lrig_deck.filter(n => {
      const card = ctx.cardMap.get(getCardNum(n));
      if (!card) return false;
      if (tgt.filter?.cardType) {
        const wanted = Array.isArray(tgt.filter.cardType) ? tgt.filter.cardType : [tgt.filter.cardType];
        if (!wanted.some(t => card.Type.includes(t))) return false;
      }
      return true;
    });
    if (cands.length === 0) return done({ ...addLog(ctx, '除外できるルリグデッキのカードがない'), lastProcessedCards: [] });
    const count = tgt.count === 'ALL' ? cands.length : Math.min(resolveNum(tgt.count), cands.length);
    const scope: TargetScope = tgt.owner === 'opponent' ? 'opp_lrig_deck' : 'self_lrig_deck';
    return selectOrInteract(cands, count, tgt.upToCount ?? false, scope, a, undefined, ctx, false, { selectionConstraint: tgt.selectionConstraint });
  }
  // 場のシグニをゲームから除外（「このシグニとそれをゲームから除外する」等。トラッシュ経由せず消去）
  if (tgt.type === 'SIGNI') {
    let exFilter = tgt.filter;
    let thisRestrict: string[] | null = null;
    let triggerRestrict: string[] | null = null;
    if (exFilter?.thisCardOnly) { const { thisCardOnly: _t, ...rest } = exFilter; exFilter = rest; thisRestrict = ctx.sourceCardNum ? [ctx.sourceCardNum] : []; }
    if (exFilter?.isTriggerSource) { const { isTriggerSource: _s, ...rest } = exFilter; exFilter = rest; triggerRestrict = ctx.triggeringCardNum ? [ctx.triggeringCardNum] : []; }
    const state = ownerState(tgt.owner, ctx);
    let cands = fieldCandidates(state, exFilter, ctx.cardMap, ctx.effectivePowers, ctx.allColorSigniNums, ctx.fieldSigniExtraColors);
    if (thisRestrict) cands = cands.filter(n => thisRestrict!.includes(n));
    if (triggerRestrict) cands = cands.filter(n => triggerRestrict!.includes(n));
    if (a.targetsStored) cands = cands.filter(n => (ctx.storedTargetCards ?? []).includes(n));
    if (a.fixedCardNums) cands = cands.filter(n => a.fixedCardNums!.includes(n));
    if (cands.length === 0) return done({ ...addLog(ctx, '除外できるシグニがない'), lastProcessedCards: [] });
    const scope: TargetScope = tgt.owner === 'self' ? 'self_field' : 'opp_field';
    const count = tgt.count === 'ALL' ? cands.length : Math.min(resolveNum(tgt.count), cands.length);
    return selectOrInteract(cands, count, tgt.upToCount ?? false, scope, a, undefined, ctx, false, { selectionConstraint: tgt.selectionConstraint });
  }
  // 手札をゲームから除外（「対戦相手はあなたの手札をN枚見ないで選び、あなたはそれらをゲームから除外する」WX14-011①）。
  // ⚠従来 HAND_CARD 分岐が無く **no-op** に落ちていた。`blind`（＝相手が伏せたまま選ぶ）は
  //   selectOrInteract の blind フラグで表現する（OPP_CHOOSE_YOUR_HAND_DISCARD と同じ慣例）。
  if (tgt.type === 'HAND_CARD') {
    const hstate = ownerState(tgt.owner, ctx);
    const hcands = hstate.hand;
    if (hcands.length === 0) return done({ ...addLog(ctx, '除外できる手札がない'), lastProcessedCards: [] });
    const hcount = tgt.count === 'ALL' ? hcands.length : Math.min(resolveNum(tgt.count), hcands.length);
    const hscope: TargetScope = tgt.owner === 'self' ? 'self_hand' : 'opp_hand';
    return selectOrInteract(hcands, hcount, tgt.upToCount ?? false, hscope, a, undefined, ctx, !!a.blind);
  }
  if (tgt.type !== 'TRASH_CARD') return done(ctx);
  const state = ownerState(tgt.owner, ctx);
  const cands = movableTrashCandidates(tgt.owner, state, tgt.filter, ctx.cardMap, ctx, ctx.treatAsClassAllZones);
  if (cands.length === 0) return done({ ...addLog(ctx, '除外できるカードがない'), lastProcessedCards: [] });
  const scope: TargetScope = tgt.owner === 'opponent' ? 'opp_trash' : 'self_trash';
  const count = tgt.count === 'ALL' ? cands.length : Math.min(resolveNum(tgt.count), cands.length);
  return selectOrInteract(cands, count, tgt.upToCount ?? false, scope, a, undefined, ctx, false, { selectionConstraint: tgt.selectionConstraint });
}

// SEND_TO_ENERGY: フィールドのシグニをエナゾーンに置く（エナ送り）。
// execBounce と同型だが送り先が「対象オーナーのエナゾーン」。バニッシュではないので
// 「バニッシュされたとき」を誘発しない（banishDestination/トラッシュ経路を通さない）。
function execSendToEnergy(a: SendToEnergyAction, ctx: ExecCtx): ExecResult {
  const tgt = a.target;
  const state = ownerState(tgt.owner, ctx);
  // 動的フィルタ（powerLteLastProcessed=「公開したシグニのパワー以下」等）を解決（WDK08-Y07）
  let resolvedFilter = resolveDynamicFilter(tgt.filter, ctx.ownerState, ctx.cardMap, ctx.otherState, ctx.lastProcessedCards, ctx.effectivePowers, ctx.sourceCardNum, ctx.triggeringCardNum);
  // thisCardOnly: 効果元シグニ自身のみ（「このシグニをエナゾーンに置く」＝§6.4 O-7 の `selfToEnergy` 任意コスト等）。
  // ⚠`matchesFilter` は `thisCardOnly` を**黙って無視する**ので、ここで剥がして候補を絞らないと
  //   「自分のシグニを1体選んでエナへ置く」選択UIに化ける（＝原文より広い別動作）。
  let sendThisCardRestrict: string[] | null = null;
  if (resolvedFilter?.thisCardOnly) {
    const { thisCardOnly: _t, ...rest } = resolvedFilter;
    resolvedFilter = rest;
    sendThisCardRestrict = ctx.sourceCardNum ? [ctx.sourceCardNum] : [];
  }
  let cands = fieldCandidates(state, resolvedFilter, ctx.cardMap, ctx.effectivePowers, ctx.allColorSigniNums, ctx.fieldSigniExtraColors);
  if (sendThisCardRestrict) cands = cands.filter(n => sendThisCardRestrict!.includes(n));
  if (a.targetsStored) cands = cands.filter(n => (ctx.storedTargetCards ?? []).includes(n));
  if (a.fixedCardNums) cands = cands.filter(n => a.fixedCardNums!.includes(n));
  const scope: TargetScope = tgt.owner === 'self' ? 'self_field' : 'opp_field';

  function applySend(selected: string[], c: ExecCtx): ExecCtx {
    let cur = c;
    for (const num of selected) {
      // ⚠2026-08-06（タスク12(xcvii)）まで、ここだけ `…LrigAbility` を呼び落としていた＝
      //   「代わりにこの能力を失う」がエナ送りにだけ効かなかった。共通入口へ寄せて解消。
      const sub = applyEffectLeaveSubstitutes(num, tgt.owner, cur);
      cur = sub.ctx;              // ⚠(cxxx)＝置換不成立でも「決定の消費」は必ず反映する
      if (sub.replaced) continue;
      if (!isOnFieldTop(num, tgt.owner, cur)) continue;  // (cxxvi)
      const s = ownerState(tgt.owner, cur);
      const removed = removeFromField(num, s);
      const withEnergy: PlayerState = { ...removed, energy: [...removed.energy, num] };
      cur = addLog(setOwnerState(tgt.owner, withEnergy, cur),
        `${cur.cardMap.get(num)?.CardName ?? num}をエナゾーンに置く`);
    }
    return cur;
  }

  // thisCardOnly＝「このシグニを」＝選ぶ余地が無いので**UI を出さず即適用**する
  // （`execUp` / `execPowerModify` の thisCardOnly 分岐と同規約）。
  // ⚠ここでプロンプトを出すと、`OPTIONAL_COST{selfToEnergy}` の pay 枝が**支払いの途中で中断**し、
  //   本体（＝「そうした場合」）へ進む前に選択待ちが1つ挟まる＝候補1件のダイアログが無意味に出る。
  if (sendThisCardRestrict) {
    if (cands.length === 0) return done(addLog(ctx, 'このシグニが場にないためエナ送りをスキップ'));
    return done({ ...applySend(cands, ctx), lastProcessedCards: cands });
  }
  // 「レベルの合計がN以下になるようにM体まで」: 候補の提示時と resume 時の双方で
  // 合計上限を強制する。BANISH と同じ pending 語彙を使い、0候補は空処理で閉じる。
  if (tgt.totalLevelMax !== undefined) {
    if (cands.length === 0) return done({ ...ctx, lastProcessedCards: [] });
    const candidateLevels: Record<string, number> = {};
    for (const n of cands) candidateLevels[n] = parseInt(ctx.cardMap.get(n)?.Level ?? '0', 10) || 0;
    const maxPick = typeof tgt.count === 'number' ? Math.min(tgt.count, cands.length) : cands.length;
    return selectOrInteract(cands, maxPick, true, scope, a, undefined, ctx, false, {
      totalLevelMax: tgt.totalLevelMax,
      candidateLevels,
    });
  }
  if (tgt.count === 'ALL') {
    // §6.4 離場置換の対話化（続き430）＝適用前に被害側へまとめて問い、決定を刻んでから**同じ action を再入**する
    //   （count:'ALL' 経路は候補が盤面から再導出されるので、適用前に戻っても選び直しにはならない）。
    { const ask = leaveSubstituteAskQueue('SEND_TO_ENERGY', cands, ctx);
      if (ask.queue.length > 0) return executeAction(makeLeaveSubAsk(ask.queue, 'opponent', a as EffectAction, { isBanish: ask.isBanish }), ctx); }
    return done({ ...applySend(cands, ctx), lastProcessedCards: cands });
  }
  const count = resolveCountRef(tgt.count, ctx, tgt.countFromZone)
    + (tgt.addLastProcessedCount ? (ctx.lastProcessedCards?.length ?? 0) : 0);
  if (count <= 0) return done(addLog(ctx, 'エナ送り数0 → スキップ'));
  const oppResponds = !!a.opponentSelects && tgt.owner === 'opponent';
  return selectOrInteract(cands, count, (a.optional ?? false) || (tgt.upToCount ?? false), scope, a, undefined, ctx, oppResponds, { selectionConstraint: tgt.selectionConstraint });
}

// 発生元カード（ctx.sourceCardNum）の Type を返す（'シグニ'/'スペル'/'アーツ'/'ルリグ' 等）。
// パワー修正の発生元種別を temp_power_mods に保持し、「あなたのシグニ/アーツ/ルリグの効果で」等の参照に使う。
function srcTypeOf(ctx: ExecCtx): string | undefined {
  const src = ctx.sourceCardNum ? ctx.cardMap.get(getCardNum(ctx.sourceCardNum)) : undefined;
  return src?.Type;
}

// LEVEL_MODIFY: 対象シグニのレベルを±する（UNTIL_END_OF_TURN）。temp_level_mods へ積み、
//   fieldCandidates が実効レベルとしてレベルフィルタ判定に反映する（matchesFilter の effectiveLevel）。
function execLevelModify(a: import('../types/effects').LevelModifyAction, ctx: ExecCtx): ExecResult {
  const tgtO: Owner = a.target.owner === 'opponent' ? 'opponent' : 'self';
  const state = ownerState(tgtO, ctx);
  // thisCardOnly:「このシグニのレベルを＋X」＝効果元シグニ自身へ選択UIなしで適用（WX16-070・execPowerModify と同型・続き137）
  if (a.target.filter?.thisCardOnly) {
    const selfNum = ctx.sourceCardNum;
    if (!selfNum || !state.field.signi.some(s => s?.at(-1) === selfNum)) {
      return done({ ...addLog(ctx, 'レベル修正の対象がない'), lastProcessedCards: [] });
    }
    const mods = [...(state.temp_level_mods ?? []), { cardNum: selfNum, delta: a.delta }];
    return done({ ...addLog(setOwnerState(tgtO, { ...state, temp_level_mods: mods }, ctx),
      `${ctx.cardMap.get(selfNum)?.CardName ?? selfNum}のレベル${a.delta > 0 ? '+' : ''}${a.delta}`), lastProcessedCards: [selfNum] });
  }
  // owner:'any'（修飾語なし「シグニ1体を対象とし」）は両フィールドが候補（タスク12(lii)）。
  // 単体適用は applyDirectAction の LEVEL_MODIFY が選択カードの所属側で解決する（既存実装）。
  const { cands, scope: lmScope } = fieldCandidatesByOwner(a.target.owner, a.target.filter, ctx);
  if (cands.length === 0) return done({ ...addLog(ctx, 'レベル修正の対象がない'), lastProcessedCards: [] });
  if (a.target.count === 'ALL') {
    let cur = ctx;
    for (const cardNum of cands) {
      const own: Owner = a.target.owner === 'any' ? sideOfFieldCard(cardNum, cur) : tgtO;
      const s = ownerState(own, cur);
      cur = setOwnerState(own, { ...s, temp_level_mods: [...(s.temp_level_mods ?? []), { cardNum, delta: a.delta }] }, cur);
    }
    return done(addLog(cur, `レベル${a.delta > 0 ? '+' : ''}${a.delta}`));
  }
  const cnt = resolveNum(a.target.count);
  return selectOrInteract(cands, cnt, a.target.upToCount ?? false, lmScope, a, undefined, ctx, false, { selectionConstraint: a.target.selectionConstraint });
}

/**
 * `deltaPerLastProcessedCount` の倍率＝**直前ステップで処理したカードのうち原文が数えている分**
 * （§5.3 `O-80` 第1バッチ・2026-08-26）。
 * 🔴**旧 `STUB{POWER_MOD_PER_COUNT}` はここを `lastProcessedCards.length` の素の枚数でしか数えられず**、
 *   「**黒の**シグニ1枚につき」「**＜悪魔＞の**シグニ1枚につき」「**レベルの合計**1につき」を
 *   全部「処理した枚数」に潰していた（＝絞り込みぶん過剰）。
 * ⚠`spec` 省略＝従来どおり素の枚数（既存の `deltaPerLastProcessedCount` 利用箇所の挙動を変えない）。
 */
function lastProcessedUnits(spec: PowerModifyAction['perLastProcessed'], ctx: ExecCtx): number {
  const cards = ctx.lastProcessedCards ?? [];
  const matched = spec?.filter
    ? cards.filter(cn => matchesFilter(ctx.cardMap.get(getCardNum(cn)), spec.filter))
    : cards;
  const raw = spec?.unit === 'level_sum'
    ? matched.reduce((sum, cn) => {
        const lv = Number.parseInt(ctx.cardMap.get(getCardNum(cn))?.Level ?? '', 10);
        return sum + (Number.isFinite(lv) ? lv : 0);
      }, 0)
    : matched.length;
  return Math.floor(raw / Math.max(1, spec?.divisor ?? 1));
}

function execPowerModify(a: PowerModifyAction, ctx: ExecCtx): ExecResult {
  // deltaPerLastProcessedCount: 「この方法で捨てた手札1枚につき－N」＝直前ステップで実際に処理した枚数が倍率
  // （WX12-020-E3・タスク12(lx)②）。現在の手札枚数を数える POWER_MODIFY_PER_HAND_COUNT とは別物。
  // deltaFromZone:「〈ゾーン〉にある〈filter〉のカード1枚につき±N」＝枚数×per（§6.4 O-3）。
  // ⚠`resolveNum` は `{$ref}` を 0 に潰すので、動的値は必ず `resolveCountRef` 側で解決する。
  const delta = a.deltaFromZone
    ? resolveCountRef(a.delta, ctx, a.deltaFromZone)
    : a.deltaPerLastProcessedCount
      ? resolveNum(a.delta) * lastProcessedUnits(a.perLastProcessed, ctx)
      : resolveNum(a.delta);
  const srcType = srcTypeOf(ctx);
  // 「そのシグニのレベル１につき±N」（§6.4 O-16(a)）＝delta はレベル1あたりの単価。**ここで数値へ
  // 焼き込まない**＝倍率は grant の適用時に対象シグニ自身のレベルから毎回決まる。
  const perLevel = a.deltaPerTargetLevel === true;
  const deltaJa = perLevel
    ? `そのシグニのレベル1につき${delta > 0 ? '+' : ''}${delta}`
    : `${delta > 0 ? '+' : ''}${delta}`;
  if (a.duration === 'NEXT_TURN') {
    const reservation = reserveFieldGrant(a.target, {
      kind: 'power', delta, filter: a.target.filter, condition: a.fieldCondition,
      ...(perLevel ? { perTargetLevel: true } : {}),
      srcType, srcCardNum: ctx.sourceCardNum,
    }, a.nextTurnOwner, ctx);
    if (reservation.reserved) {
      ctx = addLog(reservation.ctx,
        `次の${reservation.activeOwner === 'opponent' ? '対戦相手の' : '自分の'}ターンの間、場のシグニのパワー${deltaJa}`);
      if (!a.appliesThisTurn) return done(ctx);
    }
  }
  // §6.4 O-16:「このターン、（指定された）シグニゾーンにあるシグニのパワーを±N」＝**現ターンのゾーン継続**。
  // per-card の temp_power_mods へ落とすと**後からそのゾーンへ出たシグニに効かない**（原文の
  // 「このアーツの使用後にそこに置かれたシグニにも影響を与える」が死ぬ）ので、場レベル grant で表す。
  // ⚠適用条件を `zoneSource:'designated'` に限定する＝ゾーン限定でない count:'ALL' のパワー修正は
  //   従来どおり per-card（挙動不変）。ゾーンが未指定なら applied:false で下の通常経路へ落ちる。
  if (a.target.zoneSource === 'designated' && a.target.count === 'ALL') {
    const active = applyActiveFieldGrant(a.target, {
      kind: 'power', delta, filter: a.target.filter, condition: a.fieldCondition,
      ...(perLevel ? { perTargetLevel: true } : {}),
      srcType, srcCardNum: ctx.sourceCardNum,
    }, ctx);
    if (active.applied) {
      return done(addLog(active.ctx, `このターン、指定シグニゾーンのシグニのパワー${deltaJa}`));
    }
    return done(addLog(ctx, '指定されたシグニゾーンがない'));
  }
  // owner:'any'（「対象のシグニ」）= 自分・対戦相手どちらのシグニも選べる
  const isAny = a.target.owner === 'any';
  const tgtOwner = isAny ? 'self' : a.target.owner as Owner;
  const state = ownerState(tgtOwner, ctx);
  const colorUsesTargetLrig = !!(a.target.filter?.colorMatchesLrig || a.target.filter?.colorNotMatchesLrig);
  const targetOwnerSt = tgtOwner === 'self' ? ctx.ownerState : ctx.otherState;
  const targetOtherSt = tgtOwner === 'self' ? ctx.otherState : ctx.ownerState;
  const resolvedTargetFilter = colorUsesTargetLrig
    ? resolveDynamicFilter(a.target.filter, targetOwnerSt, ctx.cardMap, targetOtherSt, ctx.lastProcessedCards, ctx.effectivePowers, ctx.sourceCardNum, ctx.triggeringCardNum)
    : a.target.filter;
  let cands: string[];
  if (isAny) {
    const selfCands = fieldCandidates(ctx.ownerState, a.target.filter, ctx.cardMap, ctx.effectivePowers, ctx.allColorSigniNums, ctx.fieldSigniExtraColors);
    let oppCands = fieldCandidates(ctx.otherState, a.target.filter, ctx.cardMap, ctx.effectivePowers, ctx.allColorSigniNums, ctx.fieldSigniExtraColors);
    // 完全効果耐性: 相手のパワーをマイナスする効果は耐性シグニに無効
    if (delta < 0 && ctx.otherEffectImmuneNums?.size) {
      oppCands = oppCands.filter(n => !ctx.otherEffectImmuneNums!.has(n));
    }
    cands = [...selfCands, ...oppCands];
  } else {
    cands = fieldCandidates(state, resolvedTargetFilter, ctx.cardMap, ctx.effectivePowers, ctx.allColorSigniNums, ctx.fieldSigniExtraColors);
    // 完全効果耐性: 相手のパワーをマイナスする効果は耐性シグニに無効（プラスは利益なので除外しない）
    if (tgtOwner === 'opponent' && delta < 0 && ctx.otherEffectImmuneNums?.size) {
      cands = cands.filter(n => !ctx.otherEffectImmuneNums!.has(n));
    }
  }
  cands = filterCandidatesToTargetZone(cands, a.target, state);
  // excludeSelf: 効果元シグニ自身を対象から除外（「あなたの他の＜地獣＞のシグニ」。WXDi-P15-093 / WX24-P1-076）
  if ((a.excludeSelf || a.target.filter?.excludeSelf) && ctx.sourceCardNum) {
    cands = cands.filter(n => n !== ctx.sourceCardNum);
  }
  // thisCardOnly: 効果元シグニ自身のみ（「このシグニのパワーを±X」。WX25-CP1-075 等の付与能力で使用）
  if (a.target.filter?.thisCardOnly) {
    cands = (ctx.sourceCardNum && state.field.signi.some(s => s?.at(-1) === ctx.sourceCardNum))
      ? [ctx.sourceCardNum] : [];
  }
  // frontOfSelf: effect source SIGNI's opposing zone (2 - source zone).
  // Omitted filters retain the existing candidate behavior.
  if (a.target.filter?.frontOfSelf) {
    const frontNum = tgtOwner === 'opponent' ? resolveFrontOfSelfCardNum(ctx) : undefined;
    cands = frontNum ? cands.filter(n => n === frontNum) : [];
  }
  // aboveSelf:「このカードの上にあるシグニ」＝効果元カードが下に置かれているスタックの最前面シグニ。
  // 選択UIを出さず1体に固定する（＜クラス＞/《名前》/色 の限定は fieldCandidates が既に適用済み）。
  if (a.target.filter?.aboveSelf) {
    const hostNum = resolveAboveSelfCardNum(ctx);
    cands = hostNum ? cands.filter(n => n === hostNum) : [];
  }
  if (a.targetsStored) {
    cands = cands.filter(n => (ctx.storedTargetCards ?? []).includes(n));
  }
  if (cands.length === 0) return done(ctx);

  // UNTIL_OPP_TURN_END は長期ストア power_mods_until_opp_turn へ（次の相手ターン終了時までクリアされない）
  const powerModKey = a.duration === 'UNTIL_OPP_TURN_END' ? 'power_mods_until_opp_turn' : 'temp_power_mods';

  // targetsTriggerSource: 「それ」= triggeringCardNum（なければ sourceCardNum）を自動対象
  if (a.targetsTriggerSource) {
    const autoNum = ctx.triggeringCardNum ?? ctx.sourceCardNum;
    if (autoNum && cands.includes(autoNum)) {
      const s = ownerState(tgtOwner, ctx);
      const mods = [...(s[powerModKey] ?? []), { cardNum: autoNum, delta, srcType, srcCardNum: ctx.sourceCardNum }];
      const newS: PlayerState = { ...s, [powerModKey]: mods };
      // 選択UIを経ないため handleEffectInteraction の ON_TARGETED 収集を通らない。
      // 自動対象化したシグニを surface し、BattleScreen の done 分岐で ON_TARGETED を収集させる（続き137・タスク12(xx)）。
      // 自動対象でも「直前に処理したそのシグニ」は後続の置換条件から参照できるようにする。
      // 選択経路の POWER_MODIFY と同じく、実際に修正した1体を lastProcessedCards に残す。
      const withTgt = {
        ...setOwnerState(tgtOwner, newS, ctx),
        lastProcessedCards: [autoNum],
        autoTargetedCards: [...(ctx.autoTargetedCards ?? []), autoNum],
      };
      return done(addLog(withTgt,
        `${ctx.cardMap.get(autoNum)?.CardName ?? autoNum}のパワー${delta > 0 ? '+' : ''}${delta}`));
    }
    return done(ctx);
  }

  function applyPowerMod(selected: string[], c: ExecCtx): ExecCtx {
    // owner:'any' は対象ごとに所属フィールドを判定して該当プレイヤーの mods に加える
    let cur = c;
    for (const cardNum of selected) {
      const own: Owner = isAny
        ? (cur.ownerState.field.signi.some(s => s?.at(-1) === cardNum) ? 'self' : 'opponent')
        : tgtOwner;
      const s = ownerState(own, cur);
      const mods = [...(s[powerModKey] ?? []), { cardNum, delta, srcType, srcCardNum: cur.sourceCardNum }];
      cur = addLog(setOwnerState(own, { ...s, [powerModKey]: mods }, cur),
        `${cur.cardMap.get(cardNum)?.CardName ?? cardNum}のパワー${delta > 0 ? '+' : ''}${delta}`);
    }
    return cur;
  }

  // aboveSelf:「このカードの上にあるシグニ」は原文に「を対象とし」が無い＝選択もなければ対象化もしない。
  // 候補は上で1体（ホスト）に確定済みなので、選択UIを出さず直接適用する（autoTargetedCards には積まない）。
  if (a.target.filter?.aboveSelf) return done(applyPowerMod(cands, ctx));

  // targetsLastProcessed: 「それ」= 直前ステップで選択/処理したシグニ(lastProcessedCards)へ選択UIなしで適用
  // （WXDi-P07-079「それが＜毒牙＞のシグニの場合、代わりに＋10000」＝直前 POWER_MODIFY の選択対象と同一）
  if (a.targetsLastProcessed) {
    const autoNums = (ctx.lastProcessedCards ?? []).filter(n => cands.includes(n));
    if (autoNums.length === 0) return done(ctx);
    const applied = applyPowerMod(autoNums, ctx);
    // targetsTriggerSource と同型＝選択UIを経ない自動対象化を ON_TARGETED 収集用に surface（続き137・タスク12(xx)）。
    return done({ ...applied, autoTargetedCards: [...(ctx.autoTargetedCards ?? []), ...autoNums] });
  }

  // targetsStored:「それのパワーを…」＝対象は先行の SELECT_TARGET_ONLY / 対象宣言ステップで**すでに確定**している。
  // 再び選択UIを出すのは冗長で、しかも同じ対象へ ON_TARGETED が二度立つ（対象宣言は1回）。ここで自動適用する
  // （autoTargetedCards には積まない＝対象化はその宣言ステップで済んでいる。タスク12(lx)②）。
  if (a.targetsStored) return done(applyPowerMod(cands, ctx));

  if (a.target.count === 'ALL') return done(applyPowerMod(cands, ctx));
  const count = resolveNum(a.target.count);
  const scope: TargetScope = isAny ? 'both_field' : (tgtOwner === 'self' ? 'self_field' : 'opp_field');
  // 🔴**`deltaPerLastProcessedCount` は選択の向こう側では解けない**（§5.3 `O-80` 第1バッチ）＝
  //   選択後に走る `applyDirectAction` の時点では `lastProcessedCards` が**いま選んだ対象**に
  //   置き換わっており、倍率が必ず1（＝1枚あたりの単価そのもの）に潰れる。
  //   ⇒ 選択UIへ渡す action には**ここで解決済みの delta を焼き込む**。
  //   ⚠`deltaFromZone` は盤面のゾーンを数え直すだけなので焼き込み不要（あちらは選択後も同じ値）。
  const actionForSelect: PowerModifyAction = a.deltaPerLastProcessedCount
    ? { ...a, delta, deltaPerLastProcessedCount: false, perLastProcessed: undefined }
    : a;
  return selectOrInteract(cands, count, a.target.upToCount ?? false, scope, actionForSelect, undefined, ctx, false, { selectionConstraint: a.target.selectionConstraint });
}

function execPowerSet(a: PowerSetAction, ctx: ExecCtx): ExecResult {
  const value = resolveNum(a.value);
  const tgtOwner = a.target.owner === 'any' ? 'self' : a.target.owner as Owner;
  // owner:'any'（修飾語なし「シグニ1体を対象とし」）は両フィールドが候補（タスク12(lii)）。
  // 単体適用は applyDirectAction の POWER_SET が選択カードの所属側で解決する（既存実装）。
  const { cands, scope: psScope } = fieldCandidatesByOwner(a.target.owner, a.target.filter, ctx);
  if (cands.length === 0) return done(ctx);

  function applyPowerSet(targets: string[], c: ExecCtx): ExecCtx {
    let cur = c;
    for (const cardNum of targets) {
      const own: Owner = a.target.owner === 'any' ? sideOfFieldCard(cardNum, cur) : tgtOwner;
      const s = ownerState(own, cur);
      const base = parseInt(cur.cardMap.get(cardNum)?.Power ?? '0') || 0;
      const mods = [...(s.temp_power_mods ?? []).filter(m => m.cardNum !== cardNum), { cardNum, delta: value - base }];
      cur = addLog(setOwnerState(own, { ...s, temp_power_mods: mods }, cur),
        `${cur.cardMap.get(cardNum)?.CardName ?? cardNum}のパワーを${value}に`);
    }
    return cur;
  }

  if (a.target.count === 'ALL') return done(applyPowerSet(cands, ctx));

  const count = resolveNum(a.target.count);
  // 「このシグニ」: sourceCardNum が候補に含まれていれば自動適用。
  // ⚠`explicitTarget`（原文が「〜を対象とし」）のときは**プレイヤーが選ぶ**ので横取りしない（§6.4 O-61）。
  if (!a.target.explicitTarget && ctx.sourceCardNum && cands.includes(ctx.sourceCardNum)) {
    return done(applyPowerSet([ctx.sourceCardNum], ctx));
  }
  return selectOrInteract(cands, count, a.target.upToCount ?? false, psScope, a, undefined, ctx);
}

// POWER_MULTIPLY: シグニのパワーをN倍にする（delta = currentPower × (multiplier-1)）
function execPowerMultiply(a: import('../types/effects').PowerMultiplyAction, ctx: ExecCtx): ExecResult {
  const tgtOwner: Owner = a.target.owner === 'any' ? 'self' : a.target.owner as Owner;
  const state = ownerState(tgtOwner, ctx);
  const cands = fieldCandidates(state, a.target.filter, ctx.cardMap, ctx.effectivePowers, ctx.allColorSigniNums, ctx.fieldSigniExtraColors);
  if (cands.length === 0) return done(addLog(ctx, 'パワー倍増：対象シグニなし'));

  const applyMultiply = (selected: string[], c: ExecCtx): ExecCtx => {
    const s = ownerState(tgtOwner, c);
    const mods = [...(s.temp_power_mods ?? [])];
    for (const cn of selected) {
      const curPw = c.effectivePowers?.get(cn) ?? (parseInt(c.cardMap.get(cn)?.Power ?? '0') || 0);
      mods.push({ cardNum: cn, delta: curPw * (a.multiplier - 1) });
    }
    const newS: PlayerState = { ...s, temp_power_mods: mods };
    return addLog(setOwnerState(tgtOwner, newS, c),
      `${selected.map(cn => c.cardMap.get(cn)?.CardName ?? cn).join('、')}のパワー×${a.multiplier}`);
  };

  if (a.target.count === 'ALL') return done(applyMultiply(cands, ctx));
  const count = resolveNum(a.target.count as number);
  // 「このシグニ」自動適用。`explicitTarget` は選択UIへ回す（§6.4 O-61）。
  if (!a.target.explicitTarget && ctx.sourceCardNum && cands.includes(ctx.sourceCardNum)) return done(applyMultiply([ctx.sourceCardNum], ctx));
  const scope: TargetScope = tgtOwner === 'self' ? 'self_field' : 'opp_field';
  return selectOrInteract(cands, count, a.target.upToCount ?? false, scope, a, undefined, ctx);
}

function execTrash(a: TrashAction, ctx: ExecCtx): ExecResult {
  const tgt = a.target;
  const state = ownerState(tgt.owner, ctx);

  if (tgt.type === 'LIFE_CLOTH_CARD') {
    const count = tgt.count === 'ALL' ? state.life_cloth.length : resolveNum(tgt.count);
    const moved = state.life_cloth.slice(Math.max(0, state.life_cloth.length - count));
    const newS: PlayerState = {
      ...state,
      life_cloth: state.life_cloth.slice(0, Math.max(0, state.life_cloth.length - moved.length)),
      trash: [...state.trash, ...moved],
      ...(a.asCost && moved.length > 0
        ? { last_cost_trashed_cards: [...(state.last_cost_trashed_cards ?? []), ...moved] }
        : {}),
    };
    return done({
      ...addLog(setOwnerState(tgt.owner, newS, ctx), `ライフクロス${moved.length}枚をトラッシュへ`),
      lastProcessedCards: moved,
    });
  }

  if (tgt.type === 'SIGNI') {
    // thisCardOnly: 効果元シグニ自身のみを対象（「このシグニを場からトラッシュに置く」。WXDi-P04-040 等の自己犠牲）
    // excludeSelf: 効果元シグニ自身を対象から除外（「あなたの他の＜原子＞のシグニ」。WXK10-039 等）
    let trashFilter = resolveDynamicFilter(
      tgt.filter, ctx.ownerState, ctx.cardMap, ctx.otherState, ctx.lastProcessedCards,
      ctx.effectivePowers, ctx.sourceCardNum, ctx.triggeringCardNum,
    );
    let trashThisCardRestrict: string[] | null = null;
    let trashExcludeSelf = false;
    if (trashFilter?.thisCardOnly) {
      const { thisCardOnly: _t, ...rest } = trashFilter;
      trashFilter = rest;
      trashThisCardRestrict = ctx.sourceCardNum ? [ctx.sourceCardNum] : [];
    }
    if (trashFilter?.excludeSelf) {
      const { excludeSelf: _e, ...rest } = trashFilter;
      trashFilter = rest;
      trashExcludeSelf = true;
    }
    const allSigCands0 = fieldCandidates(state, trashFilter, ctx.cardMap, ctx.effectivePowers, ctx.allColorSigniNums, ctx.fieldSigniExtraColors);
    let allSigCands = trashThisCardRestrict ? allSigCands0.filter(n => trashThisCardRestrict!.includes(n)) : allSigCands0;
    if (trashExcludeSelf && ctx.sourceCardNum) allSigCands = allSigCands.filter(n => n !== ctx.sourceCardNum);
    const trashFieldProtected = tgt.owner === 'opponent' ? new Set(ctx.otherTrashFieldProtectedNums ?? []) : new Set<string>();
    let cands = trashFieldProtected.size > 0 ? allSigCands.filter(n => !trashFieldProtected.has(n)) : allSigCands;
    if (a.targetsStored) cands = cands.filter(n => (ctx.storedTargetCards ?? []).includes(n));
    // targetsTriggerSource:「そのシグニ」＝トリガー元シグニを無選択で対象（targetsStored と同じく候補を絞る形）。
    // タスク12(lxi) 第3波＝`WXEX2-25-E1`「対戦相手のシグニ１体が場に出たとき…そのシグニを場からトラッシュに置く」は
    // 従来どのシグニでも選べる過剰対象化だった。
    if (a.targetsTriggerSource) {
      const trigTS = ctx.triggeringCardNum ?? ctx.sourceCardNum;
      cands = trigTS ? cands.filter(n => n === trigTS) : [];
    }
    if (a.fixedCardNums) cands = cands.filter(n => a.fixedCardNums!.includes(n));
    // SELF_TRASH_PREVENT（WX07-033・§6.1）: 自分（owner:self）の効果で自シグニをトラッシュに置く場合、
    // 「自分でトラッシュに置けない」シグニを候補から除外する（相手効果によるトラッシュは対象外）。
    if (tgt.owner === 'self' && ctx.ownSelfTrashPreventNums && ctx.ownSelfTrashPreventNums.size > 0) {
      cands = cands.filter(n => !ctx.ownSelfTrashPreventNums!.has(n));
    }
    const scope: TargetScope = tgt.owner === 'self' ? 'self_field' : 'opp_field';
    function applyTrashField(selected: string[], c: ExecCtx): ExecCtx {
      const before = ownerState(tgt.owner, c);
      const costCards = selected.map(getCardNum);
      const costLevels = selected
        .map(n => parseInt(c.cardMap.get(getCardNum(n))?.Level ?? '', 10))
        .filter(n => !Number.isNaN(n));
      const trashedPuppet = selected.some(n => (before.field.puppet_signi ?? []).includes(n));
      let cur = c;
      for (const num of selected) {
        const sub = applyEffectLeaveSubstitutes(num, tgt.owner, cur);
        cur = sub.ctx;            // ⚠(cxxx)＝置換不成立でも「決定の消費」は必ず反映する
        if (sub.replaced) continue;
        if (!isOnFieldTop(num, tgt.owner, cur)) continue;  // (cxxvi)
        const s = ownerState(tgt.owner, cur);
        const removed = removeFromField(num, s);
        const destination = a.destination ?? 'trash';
        cur = addLog(setOwnerState(tgt.owner,
          destination === 'lrig_trash'
            ? { ...removed, lrig_trash: [...removed.lrig_trash, num] }
            : { ...removed, trash: [...removed.trash, num] }, cur),
          `${cur.cardMap.get(num)?.CardName ?? num}を${destination === 'lrig_trash' ? 'ルリグトラッシュ' : 'トラッシュ'}へ`);
      }
      if (a.asCost && selected.length > 0) {
        cur = {
          ...cur,
          fieldTrashCostCards: [...(cur.fieldTrashCostCards ?? []), ...selected],
          ownerState: {
            ...cur.ownerState,
            last_field_trash_level: costLevels.at(-1),
            last_cost_trashed_puppet: trashedPuppet,
            last_cost_trashed_cards: [...(cur.ownerState.last_cost_trashed_cards ?? []), ...costCards],
          },
        };
      }
      return cur;
    }
    if (tgt.count === 'ALL') {
      // 「好きな数」（count:'ALL' + upToCount）: プレイヤーが0〜全部を選択（自動全トラッシュにしない）
      if (tgt.upToCount) {
        if (cands.length === 0) return done({ ...ctx, lastProcessedCards: [] });
        return selectOrInteract(cands, cands.length, true, scope, a, undefined, ctx, false,
          { selectionConstraint: tgt.selectionConstraint });
      }
      // §6.4 離場置換の対話化（続き430）＝適用前に被害側へまとめて問い、決定を刻んでから**同じ action を再入**する
      //   （count:'ALL' 経路は候補が盤面から再導出されるので、適用前に戻っても選び直しにはならない）。
      { const ask = leaveSubstituteAskQueue('TRASH', cands, ctx);
        if (ask.queue.length > 0) return executeAction(makeLeaveSubAsk(ask.queue, 'opponent', a as EffectAction, { isBanish: ask.isBanish }), ctx); }
      return done({ ...applyTrashField(cands, ctx), lastProcessedCards: cands });
    }
    const count = resolveCountRef(tgt.count, ctx, tgt.countFromZone)
      + (tgt.addLastProcessedCount ? (ctx.lastProcessedCards?.length ?? 0) : 0);
    // 「各プレイヤーは自分のシグニ1体を対象とし、それをトラッシュ」：相手のシグニは相手自身が選ぶ（WX04-025）
    const oppRespondsField = !!a.opponentSelects && tgt.owner === 'opponent';
    // optional:「場からトラッシュに置いてもよい」＝スキップ可。スキップ時は後続の CONDITIONAL(IS_MY_TURN)=「そうした場合」を実行しない（WXK10-055-E1）
  return selectOrInteract(cands, count, a.optional ?? false, scope, a, undefined, ctx, oppRespondsField,
    { selectionConstraint: tgt.selectionConstraint });
  }

  if (tgt.type === 'HAND_CARD') {
    if (tgt.blind) {
      const count = tgt.count === 'ALL' ? state.hand.length : resolveCountRef(tgt.count, ctx, tgt.countFromZone);
      const picked = shuffle([...state.hand]).slice(0, count);
      const newS: PlayerState = {
        ...state,
        hand: state.hand.filter(n => !picked.includes(n)),
        trash: [...state.trash, ...picked],
        // ON_HAND_DISCARDEDトリガー検出用（BattleScreenが消化してクリア）
        hand_discarded_just: picked.length > 0 ? [...(state.hand_discarded_just ?? []), ...picked] : state.hand_discarded_just,
        // 相手側に捨てさせた＝その相手から見れば「対戦相手の効果によって」（byOwnEffect の否定材料）
        hand_discarded_just_by_opp: tgt.owner === 'opponent' && picked.length > 0 ? true : state.hand_discarded_just_by_opp,
        turn_hand_discarded_count: tgt.owner === 'self' && picked.length > 0
          ? (state.turn_hand_discarded_count ?? 0) + picked.length : state.turn_hand_discarded_count,
        // 「見ないで選ぶ」経路でも相手効果による手札喪失としてカウントする（HAND_TRASHED_BY_OPP）。
        hand_trashed_by_opp_this_turn: tgt.owner === 'opponent' && picked.length > 0
          ? (state.hand_trashed_by_opp_this_turn ?? 0) + picked.length : state.hand_trashed_by_opp_this_turn,
      };
      return done({ ...addLog(setOwnerState(tgt.owner, newS, ctx), `手札からランダム${count}枚をトラッシュへ`), lastProcessedCards: picked });
    }
    const cands = handCandidates(state, tgt.filter, ctx.cardMap, ctx.treatAsClassAllZones);
    const scope: TargetScope = tgt.owner === 'self' ? 'self_hand' : 'opp_hand';
    function applyTrashHand(selected: string[], c: ExecCtx): ExecCtx {
      const s = ownerState(tgt.owner, c);
      // PREVENT_ZONE_MOVE_BY_OPP: 相手効果で手札をトラッシュに移動させない（動的計算版 + AUTO設置フラグ）
      if (tgt.owner === 'opponent' && (c.otherProtectedZones?.includes('hand') || activeOppMoveImmunityZones(c.otherState).includes('hand'))) {
        return addLog(c, '手札保護により効果なし');
      }
      const remaining = [...s.hand];
      const toTrash: string[] = [];
      for (const n of selected) {
        const idx = remaining.indexOf(n);
        if (idx >= 0) { remaining.splice(idx, 1); toTrash.push(n); }
      }
      const newS: PlayerState = {
        ...s, hand: remaining, trash: [...s.trash, ...toTrash],
        // ON_HAND_DISCARDEDトリガー検出用（BattleScreenが消化してクリア）
        hand_discarded_just: toTrash.length > 0 ? [...(s.hand_discarded_just ?? []), ...toTrash] : s.hand_discarded_just,
        // 相手側に捨てさせた＝その相手から見れば「対戦相手の効果によって」（byOwnEffect の否定材料）
        hand_discarded_just_by_opp: tgt.owner === 'opponent' && toTrash.length > 0 ? true : s.hand_discarded_just_by_opp,
        turn_hand_discarded_count: tgt.owner === 'self' && toTrash.length > 0
          ? (s.turn_hand_discarded_count ?? 0) + toTrash.length : s.turn_hand_discarded_count,
        // 「このターンに**対戦相手の効果によって**あなたの手札からカードがトラッシュに移動していた場合」条件用
        // （HAND_TRASHED_BY_OPP・WXDi-P02-005）。tgt.owner==='opponent' ＝ **実行者から見た相手**の手札を捨てさせた
        // ＝その相手から見れば「対戦相手の効果で捨てられた」。ターン境界で 0 にリセットされる。
        hand_trashed_by_opp_this_turn: tgt.owner === 'opponent' && toTrash.length > 0
          ? (s.hand_trashed_by_opp_this_turn ?? 0) + toTrash.length : s.hand_trashed_by_opp_this_turn,
      };
      return addLog(setOwnerState(tgt.owner, newS, c),
        `手札から${toTrash.map(n => c.cardMap.get(n)?.CardName ?? n).join('・')}をトラッシュへ`);
    }
    if (tgt.count === 'ALL') {
      // 「好きな枚数」（count:'ALL' + upToCount）: プレイヤーが0〜全部を選択（自動全捨てにしない）。
      // SIGNI 分岐の同形（execTrash:671）を手札に移植＝「手札を好きな枚数捨てる」（SPDi47-03 等）。
      // resumeSelectTarget が lastProcessedCards を記録するため「この方法で手札をN枚以上捨てた場合」条件と連鎖できる。
      if (tgt.upToCount) {
        if (cands.length === 0) return done({ ...ctx, lastProcessedCards: [] });
        return selectOrInteract(cands, cands.length, true, scope, a, undefined, ctx, false,
          { selectionConstraint: tgt.selectionConstraint });
      }
      if (a.optional) {
        const trashAll = { ...a, optional: false } as TrashAction;
        const skip = { type: 'STUB', id: 'INTERNAL_SKIP_OPTIONAL_ACTION' } as import('../types/effects').StubAction;
        return needsInteraction(addLog(ctx, '手札をすべて捨てますか？'), {
          type: 'CHOOSE', count: 1,
          options: [
            { id: 'trash', label: 'すべて捨てる', action: trashAll, available: true },
            { id: 'skip', label: 'スキップ', action: skip, available: true },
          ],
        });
      }
      return done({ ...applyTrashHand(cands, ctx), lastProcessedCards: cands });
    }
    // untilHandCount:「手札がN枚になるようにカードを捨てる」＝**実行時の**手札枚数との差だけ捨てる
    // （DRAW の untilHandCount と対。タスク12(lxiv)②＝従来は「閾値−N」を固定枚数で焼き込んでおり、
    //  手札が閾値ちょうどのときしか正しくなかった）。
    const count = a.untilHandCount !== undefined
      ? Math.max(0, state.hand.length - a.untilHandCount)
      : resolveCountRef(tgt.count, ctx, tgt.countFromZone)
      + (tgt.addLastProcessedCount ? (ctx.lastProcessedCards?.length ?? 0) : 0);
    if (count <= 0) return done({ ...addLog(ctx, '手札を捨てる枚数0（処理なし）'), lastProcessedCards: [] });
    // actingPlayerSelects=true: 「手札を見てN枚選び捨てさせる」＝自分が選ぶ
    // それ以外の opponent 手札: 「対戦相手は手札をN枚捨てる」＝相手自身が選ぶ
    const opponentResponds = tgt.owner === 'opponent' && !tgt.blind && !tgt.actingPlayerSelects;
    return selectOrInteract(cands, count, (a.optional || a.target.upToCount) ?? false, scope, a, undefined, ctx, opponentResponds,
      { selectionConstraint: tgt.selectionConstraint });
  }

  if (tgt.type === 'ENERGY_CARD') {
    // colorNotMatchesLrig 等の動的フィルタを対象オーナーのルリグ基準で解決（WX21-035①）
    const ownerSt = tgt.owner === 'self' ? ctx.ownerState : ctx.otherState;
    const otherSt = tgt.owner === 'self' ? ctx.otherState : ctx.ownerState;
    let resolvedFilter = resolveDynamicFilter(tgt.filter, ownerSt, ctx.cardMap, otherSt, ctx.lastProcessedCards, ctx.effectivePowers, ctx.sourceCardNum, ctx.triggeringCardNum);
    // isTriggerSource: ON_OPP_ENERGY_ADDED の「そのカード」＝この解決で置かれたカード自身。
    // 既存 TargetFilter 語彙を ENERGY_CARD にも適用し、任意の相手エナを選ぶ効果と取り違えない。
    let triggerRestrict: string[] | null = null;
    if (resolvedFilter?.isTriggerSource) {
      const { isTriggerSource: _ts, ...rest } = resolvedFilter;
      resolvedFilter = rest;
      triggerRestrict = ctx.triggeringCardNum ? [ctx.triggeringCardNum] : [];
    }
    let cands = energyCandidates(state, resolvedFilter, ctx.cardMap, ctx.treatAsClassAllZones);
    if (triggerRestrict !== null) cands = cands.filter(n => triggerRestrict!.includes(n));
    const scope: TargetScope = tgt.owner === 'self' ? 'self_energy' : 'opp_energy';
    function applyTrashEnergy(selected: string[], c: ExecCtx): ExecCtx {
      const s = ownerState(tgt.owner, c);
      // PREVENT_ZONE_MOVE_BY_OPP: 相手効果でエナをトラッシュに移動させない（動的計算版 + AUTO設置フラグ）
      if (tgt.owner === 'opponent' && (c.otherProtectedZones?.includes('energy') || activeOppMoveImmunityZones(c.otherState).includes('energy'))) {
        return addLog(c, 'エナ保護により効果なし');
      }
      const newS: PlayerState = {
        ...s,
        energy: s.energy.filter(n => !selected.includes(n)),
        trash: [...s.trash, ...selected],
        ...(a.asCost && selected.length > 0 ? {
          last_cost_trashed_cards: [...(s.last_cost_trashed_cards || []), ...selected.map(getCardNum)],
          last_cost_energy_trash_count: (s.last_cost_energy_trash_count || 0) + selected.length,
          last_cost_energy_trash_level_sum:
            (s.last_cost_energy_trash_level_sum || 0) + selected.reduce((sum, n) => {
              const level = parseInt(c.cardMap.get(getCardNum(n))?.Level || '', 10);
              return sum + (Number.isFinite(level) ? level : 0);
            }, 0),
        } : {}),
        // 「このターンに対戦相手の効果によってあなたのエナゾーンからカードがトラッシュに移動していた場合」条件用
        // （ENERGY_TRASHED_BY_OPP・WXDi-P02-005②）。上の手札版と同じ考え方。
        energy_trashed_by_opp_this_turn: tgt.owner === 'opponent' && selected.length > 0
          ? (s.energy_trashed_by_opp_this_turn ?? 0) + selected.length : s.energy_trashed_by_opp_this_turn,
      };
      return addLog(setOwnerState(tgt.owner, newS, c),
        `エナから${selected.map(n => c.cardMap.get(n)?.CardName ?? n).join('・')}をトラッシュへ`);
    }
    // 「そのカード」は既にトリガーで一意に決まっており、対象を取らないため選択UIを出さず直接処理する。
    if (triggerRestrict !== null) return done({ ...applyTrashEnergy(cands, ctx), lastProcessedCards: cands });
    if (tgt.count === 'ALL') {
      if (tgt.upToCount) {
        if (cands.length === 0) return done({ ...ctx, lastProcessedCards: [] });
        return selectOrInteract(cands, cands.length, true, scope, a, undefined, ctx, false,
          { selectionConstraint: tgt.selectionConstraint });
      }
      if (a.optional) {
        const trashAll = { ...a, optional: false } as TrashAction;
        const skip = { type: 'STUB', id: 'INTERNAL_SKIP_OPTIONAL_ACTION' } as import('../types/effects').StubAction;
        return needsInteraction(addLog(ctx, 'エナゾーンのカードをすべてトラッシュに置きますか？'), {
          type: 'CHOOSE', count: 1,
          options: [
            { id: 'trash', label: 'すべてトラッシュに置く', action: trashAll, available: true },
            { id: 'skip', label: 'スキップ', action: skip, available: true },
          ],
        });
      }
      return done({ ...applyTrashEnergy(cands, ctx), lastProcessedCards: cands });
    }
    const count = resolveCountRef(tgt.count, ctx, tgt.countFromZone);
    // opponentSelects: 「対戦相手は自分のエナから1枚を対象とし、それをトラッシュに置く」→ 対戦相手が選ぶ（WX04-009）
    const oppResponds = !!a.opponentSelects && tgt.owner === 'opponent';
    return selectOrInteract(cands, count, tgt.upToCount ?? false, scope, a, undefined, ctx, oppResponds,
      { selectionConstraint: tgt.selectionConstraint });
  }

  if (tgt.type === 'DECK_CARD') {
    const count = tgt.count === 'ALL' ? state.deck.length : resolveCountRef(tgt.count, ctx, tgt.countFromZone)
      + (tgt.addLastProcessedCount ? (ctx.lastProcessedCards?.length ?? 0) : 0);
    const took = state.deck.slice(0, count);
    const newS: PlayerState = {
      ...state,
      deck: state.deck.slice(count),
      trash: [...state.trash, ...took],
      // 🔴**V-83（2026-08-24）＝ここに発生源を書いていなかったのが恒久 no-op の真因**。
      //   `ON_CARD_MILLED_FROM_DECK` の誘発判定そのものは BattleScreen の**盤面差分**（デッキ減＋トラッシュ増）で
      //   行うので `MILL` でも `TRASH{DECK_CARD}` でも発火するが、発生源限定
      //   （`triggerCondition.milledSourceStory`＝「あなたの＜悪魔＞のシグニの効果１つによって」）は
      //   `last_effect_mill_source` を見て **fail-closed**（原因不明なら非発火）で判定する。
      //   ⚠**書き手は `execMill` の1箇所だけ**だったので、＜悪魔＞シグニの自デッキミルの**ほぼ全部**
      //   （`TRASH{DECK_CARD}` 経路・実測35枚以上／`MILL` 経路はわずか2枚）が誘発しなかった。
      //   ⚠**書き込み先はミルされたデッキの持ち主**（`tgt.owner` 側の state）＝読み手が
      //   `milledDeckOwner` で選ぶ state と一致させる（`triggerCollect.ts` の `collectMillTriggers`）。
      last_effect_mill_source: ctx.sourceCardNum,
    };
    return done({ ...addLog(setOwnerState(tgt.owner, newS, ctx), `デッキトップ${count}枚をトラッシュへ`), lastProcessedCards: took });
  }

  return done(ctx);
}

// EQUALIZE_ENERGY:「各プレイヤーは自分のエナが N枚になるようにエナからトラッシュに置く」（4枚以下のプレイヤーは影響なし）。
// 各プレイヤーの超過分をトラッシュへ（どのカードを残すかのプレイヤー選択は近似＝末尾の超過分を落とす）。
function execEqualizeEnergy(a: import('../types/effects').EqualizeEnergyAction, ctx: ExecCtx): ExecResult {
  const target = a.targetCount ?? 0;
  let c = ctx;
  // owner 未指定＝各プレイヤー（両方）／指定時はそのプレイヤーのみ調整
  const owners: Owner[] = a.owner ? [a.owner] : ['self', 'opponent'];
  for (const owner of owners) {
    const s = ownerState(owner, c);
    if (s.energy.length > target) {
      const keep = s.energy.slice(0, target);
      const toTrash = s.energy.slice(target);
      c = addLog(setOwnerState(owner, { ...s, energy: keep, trash: [...s.trash, ...toTrash] }, c),
        `${owner === 'self' ? '自分' : '相手'}のエナを${target}枚に調整（${toTrash.length}枚トラッシュ）`);
    }
  }
  return done(c);
}

function execEnergyCharge(a: EnergyChargeAction, ctx: ExecCtx): ExecResult {
  const tgt = a.target;
  const state = ownerState(tgt.owner, ctx);
  let cands: string[];
  let scope: TargetScope;

  if (tgt.type === 'HAND_CARD') {
    cands = handCandidates(state, tgt.filter, ctx.cardMap, ctx.treatAsClassAllZones);
    scope = tgt.owner === 'opponent' ? 'opp_hand' : 'self_hand';
  } else if (tgt.type === 'TRASH_CARD') {
    cands = movableTrashCandidates(tgt.owner, state, tgt.filter, ctx.cardMap, ctx, ctx.treatAsClassAllZones);
    scope = tgt.owner === 'opponent' ? 'opp_trash' : 'self_trash';
  } else {
    cands = fieldCandidates(state, tgt.filter, ctx.cardMap, ctx.effectivePowers, ctx.allColorSigniNums, ctx.fieldSigniExtraColors);
    scope = tgt.owner === 'opponent' ? 'opp_field' : 'self_field';
  }

  function applyCharge(selected: string[], c: ExecCtx): ExecCtx {
    const s = ownerState(tgt.owner, c);
    let newS = { ...s };
    for (const n of selected) {
      if (tgt.type === 'HAND_CARD') {
        newS = { ...newS, hand: newS.hand.filter(x => x !== n), energy: [...newS.energy, n] };
      } else if (tgt.type === 'TRASH_CARD') {
        newS = { ...newS, trash: newS.trash.filter(x => x !== n), energy: [...newS.energy, n] };
      } else {
        const removed = removeFromField(n, newS);
        newS = { ...removed, energy: [...removed.energy, n] };
      }
    }
    const names = selected.map(n => c.cardMap.get(n)?.CardName ?? n).join('・');
    const from = tgt.type === 'HAND_CARD' ? '手札' : tgt.type === 'TRASH_CARD' ? 'トラッシュ' : 'フィールド';
    if (a.asCost && tgt.type === 'HAND_CARD' && selected.length > 0) {
      const level = parseInt(c.cardMap.get(getCardNum(selected.at(-1)!))?.Level || '', 10);
      newS = {
        ...newS,
        last_cost_hand_to_energy_level: Number.isFinite(level) ? level : undefined,
      };
    }
    return addLog({ ...setOwnerState(tgt.owner, newS, c), lastProcessedCards: selected }, `${from}から${names}をエナゾーンへ`);
  }

  const count = tgt.count === 'ALL' ? cands.length : resolveCountRef(tgt.count, ctx, tgt.countFromZone)
    + (tgt.addLastProcessedCount ? (ctx.lastProcessedCards?.length ?? 0) : 0);
  if (tgt.count === 'ALL') return done(applyCharge(cands, ctx));
  // selectionConstraint（「それぞれ名前の異なる」等）を pending へ伝搬（5c検証是正・WX20-002）
  return selectOrInteract(cands, count, tgt.upToCount ?? false, scope, a, undefined, ctx, false, { selectionConstraint: tgt.selectionConstraint });
}

function execEnergyChargeFromDeck(a: EnergyChargeFromDeckAction, ctx: ExecCtx): ExecResult {
  // BLOCK_OPP_DECK_TO_ENERGY: 相手CONTがアクティブなら自分のデッキ→エナをブロック
  if (a.owner === 'self' && ctx.deckToEnergyBlocked) {
    return done(addLog(ctx, 'デッキ→エナ移動がブロックされた（CONT効果）'));
  }
  const count = resolveCountRef(a.count, ctx, a.countFromZone);
  const state = ownerState(a.owner, ctx);
  const took = state.deck.slice(0, count);
  const newS: PlayerState = {
    ...state,
    deck: state.deck.slice(count),
    energy: [...state.energy, ...took],
    self_deck_to_energy_this_turn: (state.self_deck_to_energy_this_turn ?? 0) + took.length,
  };
  // エナに置いたカードを lastProcessedCards に記録（「この方法で＜X＞のシグニがエナゾーンに置かれた場合」
  // ＝後続 LAST_PROCESSED_MATCHES の参照用。WXEX1-43-BURST）
  return done({ ...addLog(setOwnerState(a.owner, newS, ctx), `エナチャージ${count}`), lastProcessedCards: took });
}

function execLifeCrash(a: LifeCrashAction, ctx: ExecCtx): ExecResult {
  if (a.optional) {
    return needsInteraction(addLog(ctx, 'ライフクロスをクラッシュしますか？'), {
      type: 'CHOOSE',
      count: 1,
      options: [
        { id: 'crash', label: 'クラッシュする', action: { ...a, optional: false }, available: true },
        { id: 'skip', label: 'クラッシュしない', action: { type: 'STUB', id: 'INTERNAL_SKIP_OPTIONAL_ACTION' }, available: true },
      ],
    });
  }
  // conditional: 前ステップが lastProcessedCards を残した場合のみ実行（「そうした場合」）
  if (a.conditional && (!ctx.lastProcessedCards || ctx.lastProcessedCards.length === 0)) {
    return done(ctx);
  }
  const state = ownerState(a.owner, ctx);
  // §5.3 O-66: クラッシュ防止／回数制限のゲート（**効果によるクラッシュ**＝cause:'effect'）。
  // 🔴「ダメージ以外によってはクラッシュされない」（`WX19-046-E2`／`WD13-010-E1`①）が効くのは**この経路だけ**
  //   ＝アタックのダメージは通す。3つある実行地点のうちここを通し忘れると守り札が丸ごと効かない。
  // ⚠**全か無かにしない**＝上限型は枚数を切り詰める（`WX20-032` の原文注記）。
  const victimIsSelf = a.owner !== 'opponent';
  const wanted = resolveNum(a.count);
  const count = allowedLifeCrashCount(
    state,
    victimIsSelf ? ctx.otherState : ctx.ownerState,
    (victimIsSelf ? ctx.lifeCrashPreventionsSelf : ctx.lifeCrashPreventionsOpponent) ?? [],
    'effect',
    wanted,
  );
  if (count <= 0) {
    return done(addLog(ctx, `ライフクロスはクラッシュされない（クラッシュ防止）`));
  }
  const crashed: string[] = [];
  const life = [...state.life_cloth];
  for (let i = 0; i < count && life.length > 0; i++) {
    crashed.push(life.pop()!);
  }
  let newS: PlayerState;
  // LIFE_CRASHED_THIS_TURN 用カウンタ（実際にクラッシュした枚数を加算）
  const crashedCountAcc = (state.life_crashed_this_turn ?? 0) + crashed.length;
  if (a.triggerBurst) {
    // バースト発動あり: 先頭1枚をチェックゾーンへ、残りはpending
    const checkCard = crashed[0] ?? null;
    const pending = crashed.slice(1);
    newS = {
      ...state,
      life_cloth: life,
      life_crashed_this_turn: crashedCountAcc,
      field: { ...state.field, check: checkCard },
      pending_crashed_cards: pending.length > 0 ? [...(state.pending_crashed_cards ?? []), ...pending] : state.pending_crashed_cards,
      crash_source_card_num: checkCard ? ctx.sourceCardNum : state.crash_source_card_num,
      pending_crash_source_card_nums: pending.length > 0
        ? [...(state.pending_crash_source_card_nums ?? []), ...pending.map(() => ctx.sourceCardNum ?? null)]
        : state.pending_crash_source_card_nums,
    };
  } else {
    // バースト発動なし: クラッシュしたカードはそのままトラッシュへ
    newS = {
      ...state,
      life_cloth: life,
      life_crashed_this_turn: crashedCountAcc,
      trash: [...state.trash, ...crashed],
    };
  }
  let afterCtx = setOwnerState(a.owner, newS, ctx);
  // ON_SIGNI_CRASHED_LIFE_TOTAL 用の主体別カウンタ＝「このシグニが1ターンに合計N枚クラッシュしたか」。
  // 対戦相手のライフを削った場合だけ、効果元シグニ（場のスタック頂点にいるときのみ）に加算する
  // （自分のライフを自分で削る効果は「クラッシュした」主体としては数えない）。
  // ⚠アタックによるクラッシュは BattleScreen の攻撃解決側で同じキーへ加算する（経路が別なので両方に要る）。
  if (a.owner === 'opponent' && crashed.length > 0 && ctx.sourceCardNum
      && afterCtx.ownerState.field.signi.some(st => st?.at(-1) === ctx.sourceCardNum)) {
    const prevMap = afterCtx.ownerState.life_crashed_by_signi_this_turn ?? {};
    afterCtx = {
      ...afterCtx,
      ownerState: {
        ...afterCtx.ownerState,
        life_crashed_by_signi_this_turn: {
          ...prevMap,
          [ctx.sourceCardNum]: (prevMap[ctx.sourceCardNum] ?? 0) + crashed.length,
        },
      },
    };
  }
  // crashed を lastProcessedCards に残す（後続の conditional LIFE_CRASH「そうした場合」用）
  return done({ ...addLog(afterCtx, `ライフクロスを${crashed.length}枚クラッシュ`), lastProcessedCards: crashed });
}

// INSTALL_DELAYED_TRIGGER（B3）: 「このターン、…したとき、…」の遅延トリガーを効果オーナーに設置する。
// conditional:true のときは直前ステップ（任意コスト等）が成功＝lastProcessedCards が残る場合のみ設置（「そうした場合」）。
function execInstallDelayedTrigger(
  a: import('../types/effects').InstallDelayedTriggerAction,
  ctx: ExecCtx,
): ExecResult {
  if (a.conditional && (!ctx.lastProcessedCards || ctx.lastProcessedCards.length === 0)) {
    return done(addLog(ctx, '条件未達成 → 遅延トリガー設置スキップ'));
  }
  const state = ctx.ownerState;
  const installed = { ...a, sourceCardNum: ctx.sourceCardNum };
  const newS: PlayerState = { ...state, delayed_triggers: [...(state.delayed_triggers ?? []), installed] };
  const label = a.duration === 'THIS_ATTACK_PHASE' ? 'このアタックフェイズ' : 'このターン';
  return done(addLog(setOwnerState('self', newS, ctx), `${label}の遅延トリガーを設置`));
}

function execShuffleDeck(a: ShuffleDeckAction, ctx: ExecCtx): ExecResult {
  const state = ownerState(a.owner, ctx);
  // deck_shuffled_count をインクリメント（ON_DECK_SHUFFLED 検出用・PR-470A）。
  const newS: PlayerState = { ...state, deck: shuffle([...state.deck]), deck_shuffled_count: (state.deck_shuffled_count ?? 0) + 1 };
  return done(addLog(setOwnerState(a.owner, newS, ctx), 'デッキをシャッフル'));
}

// levelLteDiscardSigni:「この方法で捨てたシグニのレベル以下」を caster（効果実行者）の
// last_discarded_signi_level で level.max に解決。対象オーナーに依らず常にキャスター側の値を読むため、
// resolveDynamicFilter とは別に ctx.ownerState を明示で渡すこの関数で前処理する。
function resolveDiscardLevelFilter(
  filter: import('../types/effects').TargetFilter | undefined,
  casterState: import('../types').PlayerState,
): import('../types/effects').TargetFilter | undefined {
  if (!filter) return filter;
  if (!filter.levelLteDiscardSigni && !filter.levelLtDiscardSigni
      && filter.levelEqDiscardSigniOffset === undefined && !filter.classMatchesDiscardSigni) return filter;
  const { levelLteDiscardSigni: _x, levelLtDiscardSigni: _y, levelEqDiscardSigniOffset: offset,
    classMatchesDiscardSigni: _z, ...rest } = filter;
  let out: import('../types/effects').TargetFilter = { ...rest };
  const lvl = casterState.last_discarded_signi_level;
  const lvlOk = lvl != null && !isNaN(lvl);
  // レベル関係: ≤（Lte）/ <（Lt）/ ＝捨てレベル+offset（Eq）。参照不能なら制限なしへフォールバック
  if (filter.levelLteDiscardSigni && lvlOk) out = { ...out, level: { ...(typeof out.level === 'object' ? out.level : {}), max: lvl } };
  if (filter.levelLtDiscardSigni && lvlOk) out = { ...out, level: { ...(typeof out.level === 'object' ? out.level : {}), max: lvl - 1 } };
  if (offset !== undefined && lvlOk) out = { ...out, level: lvl + offset };
  // クラス関係: 捨てたシグニと共通するクラス（CardClass の「：」以降トークンを OR 展開して story へ）
  if (filter.classMatchesDiscardSigni) {
    const cc = casterState.last_discarded_signi_class ?? '';
    const tokens = cc.split(/[/／]/).map(seg => seg.split(/[:：]/).pop()?.trim() ?? '').filter(Boolean);
    if (tokens.length > 0) out = { ...out, story: tokens.length === 1 ? tokens[0] : tokens };
  }
  return out;
}

function resolveDynamicFilter(
  filter: import('../types/effects').TargetFilter | undefined,
  ownerSt: import('../types').PlayerState,
  cardMap: Map<string, import('../types').CardData>,
  otherSt?: import('../types').PlayerState,
  lastProcessedCards?: string[],
  effectivePowers?: Map<string, number>,
  sourceCardNum?: string,
  triggeringCardNum?: string,
  declaredRefSt?: import('../types').PlayerState,
): import('../types/effects').TargetFilter | undefined {
  if (!filter) return filter;
  let result = filter;
  // anyOf の下位フィルタも個別に解決する（下位が動的語彙を持つ場合に取り残さない）
  if (result.anyOf) {
    result = {
      ...result,
      anyOf: result.anyOf.map(sub =>
        resolveDynamicFilter(sub, ownerSt, cardMap, otherSt, lastProcessedCards, effectivePowers, sourceCardNum, triggeringCardNum, declaredRefSt) ?? sub),
    };
  }
  // 公開・探索対象の owner と宣言者は一致しないことがある（O-57 B群＝相手デッキを、効果所有者が宣言した
  // カード名で照合）。省略時は従来どおり候補 owner の state を参照する。
  const declarationState = declaredRefSt ?? ownerSt;
  const noMatch = (rest: import('../types/effects').TargetFilter): import('../types/effects').TargetFilter =>
    ({ ...rest, cardNum: '__dynamic_filter_reference_unavailable__' });
  if (result.levelEqDeclaredNumber) {
    const { levelEqDeclaredNumber: _dn, ...rest } = result;
    // declared_number（ガード制限を伴わない汎用宣言）を優先し、旧来の DECLARE_NUMBER 保存先へフォールバック。
    const value = declarationState.declared_number ?? declarationState.declared_guard_restrict_level;
    result = value == null || !Number.isFinite(value) ? noMatch(rest) : { ...rest, level: value };
  }
  // 宣言参照 filter（タスク12(xlvi)(c)）。⚠未宣言なら noMatch＝「宣言していないのにどのカードでも拾える」
  // 過剰実行を避ける（従来この2語彙が無く、宣言参照の pick は filter ごと落ちて全公開札が候補になっていた）。
  if (result.nameEqDeclaredName) {
    const { nameEqDeclaredName: _nd, ...rest } = result;
    const name = declarationState.declared_card_name;
    // cardName は部分一致なのでカード名の完全一致には cardNames（配列＝完全一致）を使う。
    result = name ? { ...rest, cardNames: [name] } : noMatch(rest);
  }
  if (result.nameMatchesAnyFieldSigni) {
    const { nameMatchesAnyFieldSigni: _nf, ...rest } = result;
    const names = [...new Set(ownerSt.field.signi
      .map(stack => stack?.at(-1))
      .filter((n): n is string => !!n)
      .map(n => cardMap.get(getCardNum(n))?.CardName)
      .filter((name): name is string => !!name))];
    result = names.length > 0 ? { ...rest, cardNames: names } : noMatch(rest);
  }
  if (result.classEqDeclaredClass) {
    const { classEqDeclaredClass: _cd, ...rest } = result;
    const cls = declarationState.declared_class;
    result = cls ? { ...rest, story: cls } : noMatch(rest);
  }
  if (result.colorEqDeclaredColorIndex != null) {
    const { colorEqDeclaredColorIndex: index, ...rest } = result;
    const color = declarationState.declared_colors?.[index];
    result = color ? { ...rest, color } : noMatch(rest);
  }
  if (result.colorMatchesLrigIndex != null) {
    const { colorMatchesLrigIndex: index, ...rest } = result;
    const lrigNums = [
      ownerSt.field.lrig.at(-1),
      ownerSt.field.assist_lrig_l?.at(-1),
      ownerSt.field.assist_lrig_r?.at(-1),
    ];
    const lrig = lrigNums[index];
    const colors = lrig
      ? (cardMap.get(getCardNum(lrig))?.Color ?? '').split(/[/／、]/).map(s => s.trim()).filter(Boolean)
      : [];
    result = colors.length > 0 ? { ...rest, color: colors.length === 1 ? colors[0] : colors } : noMatch(rest);
  }
  // コスト記録参照。従来 execBanish だけにあった前処理を共通解決器へ集約し、
  // BOUNCE/SEARCH/TRASH 等でも同じ語彙を使えるようにする。
  if (result.levelEqDiscardLevelSum || result.levelEqualsVar) {
    const { levelEqDiscardLevelSum: _ds, levelEqualsVar: variable, ...rest } = result;
    const value = _ds
      ? ownerSt.last_activated_discard_level_sum
      : variable === 'charm_trash_count'
        ? ownerSt.last_charm_trash_count
        : variable === 'field_trash_level'
          ? ownerSt.last_field_trash_level
          : variable === 'cost_hand_to_energy_level'
            ? ownerSt.last_cost_hand_to_energy_level
            : ownerSt.last_cost_energy_trash_level_sum;
    result = value == null || !Number.isFinite(value) ? noMatch(rest) : { ...rest, level: value };
  }
  if (result.levelEqLastProcessed || result.nameEqLastProcessed
      || result.levelEqLastProcessedCount || result.levelLteLastProcessedCount || result.levelEqLastProcessedLevelSum) {
    const {
      levelEqLastProcessed: levelEq, nameEqLastProcessed: nameEq,
      levelEqLastProcessedCount: countFilter,
      levelLteLastProcessedCount: lteCountFilter,
      levelEqLastProcessedLevelSum: levelSum, ...rest
    } = result;
    const processed = lastProcessedCards ?? [];
    if (levelEq || nameEq) {
      const ref = processed[0] ? cardMap.get(getCardNum(processed[0])) : undefined;
      const level = ref ? parseInt(ref.Level ?? '', 10) : NaN;
      result = nameEq
        ? (ref?.CardName ? { ...rest, cardName: ref.CardName } : noMatch(rest))
        : (!isNaN(level) ? { ...rest, level } : noMatch(rest));
    } else if (countFilter || lteCountFilter) {
      const selectedFilter = countFilter || lteCountFilter;
      const count = selectedFilter === true
        ? processed.length
        : processed.filter(n => matchesFilter(cardMap.get(getCardNum(n)), selectedFilter)).length;
      result = lteCountFilter
        ? { ...rest, level: { ...(typeof rest.level === 'object' ? rest.level : {}), max: count } }
        : processed.length > 0 ? { ...rest, level: count } : noMatch(rest);
    } else if (levelSum) {
      const levels = processed.map(n => parseInt(cardMap.get(getCardNum(n))?.Level ?? '', 10));
      result = levels.length > 0 && levels.every(Number.isFinite)
        ? { ...rest, level: levels.reduce((a, b) => a + b, 0) }
        : noMatch(rest);
    }
  }
  if (result.levelEqLrig || result.levelLteLrig) {
    const { levelEqLrig, levelLteLrig, ...rest } = result;
    const side = levelEqLrig ?? levelLteLrig!;
    const state = side === 'self' ? ownerSt : otherSt;
    const lrig = state?.field.lrig.at(-1);
    const level = lrig ? parseInt(cardMap.get(getCardNum(lrig))?.Level ?? '', 10) : NaN;
    result = !isNaN(level)
      ? (levelEqLrig
          ? { ...rest, level }
          : { ...rest, level: { ...(typeof rest.level === 'object' ? rest.level : {}), max: level } })
      : noMatch(rest);
  }
  if (result.levelEqSelf) {
    const { levelEqSelf: _self, ...rest } = result;
    const level = sourceCardNum
      ? parseInt(cardMap.get(getCardNum(sourceCardNum))?.Level ?? '', 10)
      : NaN;
    result = !isNaN(level) ? { ...rest, level } : noMatch(rest);
  }
  // powerLteSelf / powerLteSelfHalf / powerLtSelf / powerGtSelf: 効果元シグニの実効パワーを基準に powerRange へ解決
  // （「このシグニ/自身よりパワーの低い・高い」。参照不能ならフラグを外すだけ＝制限なしにフォールバック）
  if ((result.powerLteSelf || result.powerLteSelfHalf || result.powerLtSelf || result.powerGtSelf) && sourceCardNum) {
    const selfPower = effectivePowers?.get(sourceCardNum)
      ?? parseInt(cardMap.get(getCardNum(sourceCardNum))?.Power ?? '0', 10);
    const { powerLteSelf: _pa, powerLteSelfHalf: _ph, powerLtSelf: _pb, powerGtSelf: _pc, ...rest } = result;
    result = result.powerGtSelf
      ? { ...rest, powerRange: { ...(rest.powerRange ?? {}), min: selfPower + 1 } }
      : { ...rest, powerRange: { ...(rest.powerRange ?? {}), max: result.powerLtSelf ? selfPower - 1 : result.powerLteSelfHalf ? selfPower / 2 : selfPower } };
  }
  // levelLtSelf / levelGtSelf: 効果元シグニのレベルを基準に level へ解決（「このシグニより低い/高いレベルを持つ」）
  if ((result.levelLtSelf || result.levelGtSelf) && sourceCardNum) {
    const selfLevel = parseInt(cardMap.get(getCardNum(sourceCardNum))?.Level ?? '', 10);
    const { levelLtSelf: _la, levelGtSelf: _lb, ...rest } = result;
    result = !isNaN(selfLevel)
      ? (result.levelGtSelf
          ? { ...rest, level: { ...(typeof rest.level === 'object' ? rest.level : {}), min: selfLevel + 1 } }
          : { ...rest, level: { ...(typeof rest.level === 'object' ? rest.level : {}), max: selfLevel - 1 } })
      : rest;
  }
  // powerLtTrigger / powerLteTrigger: トリガー元シグニ（被バニッシュ/場に出た/アタッカー/ダウンした）のパワーを基準に
  // powerRange.max へ解決（「そのシグニよりパワーの低い」＝N-1／「そのシグニのパワー以下の」＝N。
  // 被バニッシュ等 場外のシグニは cardMap の表記パワーで参照）。
  // Lte 形のみ trigger 不在時は lastProcessedCards[0] へフォールバック（「ダウンする。そうした場合、そのシグニの
  // パワー以下」＝ACTIVATED 内の直前アクション参照。WD04-018 の powerLteLastProcessed と同じ解決になる）。
  {
    const trigRef = (result.powerLtTrigger || result.powerLteTrigger)
      ? (triggeringCardNum ?? (result.powerLteTrigger ? lastProcessedCards?.[0] : undefined))
      : undefined;
    if (trigRef) {
      const trigPower = effectivePowers?.get(trigRef)
        ?? parseInt(cardMap.get(getCardNum(trigRef))?.Power ?? '0', 10);
      const { powerLtTrigger: _pt, powerLteTrigger: _pe, ...rest } = result;
      result = { ...rest, powerRange: { ...(rest.powerRange ?? {}), max: result.powerLtTrigger ? trigPower - 1 : trigPower } };
    }
  }
  // levelLtTrigger / levelEqTrigger / levelGtTrigger
  if ((result.levelLtTrigger || result.levelEqTrigger || result.levelGtTrigger) && triggeringCardNum) {
    const trigLevel = parseInt(cardMap.get(getCardNum(triggeringCardNum))?.Level ?? '', 10);
    const { levelLtTrigger: _lt, levelEqTrigger: _eq, levelGtTrigger: _gt, ...rest } = result;
    result = !isNaN(trigLevel)
      ? (result.levelEqTrigger
          ? { ...rest, level: trigLevel }
          : result.levelGtTrigger
          ? { ...rest, level: { ...(typeof rest.level === 'object' ? rest.level : {}), min: trigLevel + 1 } }
          : { ...rest, level: { ...(typeof rest.level === 'object' ? rest.level : {}), max: trigLevel - 1 } })
      : rest;
  }
  // levelLtOppLrig: 対戦相手のセンタールリグのレベルより低いレベルを持つ（「対戦相手のセンタールリグより低いレベルを持つ、
  // あなたの＜X＞のシグニ」＝WX19-042）→ level.max:oppLrigLevel-1 へ解決。opp 中央ルリグ（otherSt.field.lrig 頂点）が
  // 参照不能/レベル非数値なら制限なしへフォールバック（フラグを外すだけ）。
  if (result.levelLtOppLrig) {
    const { levelLtOppLrig: _lo, ...rest } = result;
    const opLrig = otherSt?.field.lrig.at(-1);
    const opLv = opLrig ? parseInt(cardMap.get(getCardNum(opLrig))?.Level ?? '', 10) : NaN;
    result = !isNaN(opLv)
      ? { ...rest, level: { ...(typeof rest.level === 'object' ? rest.level : {}), max: opLv - 1 } }
      : rest;
  }
  // powerLtAnyAlly: 自分の場のシグニのいずれか（＝最大実効パワー）よりパワーが低い（「あなたのいずれかのシグニよりパワーの低い」。
  // 「いずれか…より低い」＝いずれか1体より低ければ可＝最大値未満）→ powerRange.max:maxAlly-1 へ解決。参照不能（場に自シグニ無し）なら制限なしへフォールバック
  if (result.powerLtAnyAlly) {
    const { powerLtAnyAlly: _pa, ...rest } = result;
    const allyPowers = ownerSt.field.signi
      .map(stack => stack?.at(-1))
      .filter((n): n is string => !!n)
      .map(n => effectivePowers?.get(n) ?? parseInt(cardMap.get(getCardNum(n))?.Power ?? '0', 10));
    const maxAlly = allyPowers.length ? Math.max(...allyPowers) : undefined;
    result = (maxAlly !== undefined && maxAlly > 0)
      ? { ...rest, powerRange: { ...(rest.powerRange ?? {}), max: maxAlly - 1 } }
      : rest;
  }
  if (result.powerLteLastProcessed) {
    const { powerLteLastProcessed: _p, ...rest } = result;
    const ref = lastProcessedCards?.[0];
    const pw = ref ? (effectivePowers?.get(ref) ?? parseInt(cardMap.get(getCardNum(ref))?.Power ?? '0', 10)) : undefined;
    result = (pw !== undefined && !isNaN(pw))
      ? { ...rest, powerRange: { ...(rest.powerRange ?? {}), max: pw } }
      : rest;
  }
  // powerLtLastProcessed: 直前に処理したシグニ（場に出た/公開した＝lastProcessedCards[0]）の実効パワー"未満"（「その後、そのシグニよりパワーの低い」）。
  // Lte と異なり、参照不能（配置0体・非シグニ等）なら到達不能 powerRange で空ヒット＝対象なし（「そのシグニ」が存在しないため）。
  if (result.powerLtLastProcessed) {
    const { powerLtLastProcessed: _plt, ...rest } = result;
    const ref = lastProcessedCards?.[0];
    const pw = ref ? (effectivePowers?.get(ref) ?? parseInt(cardMap.get(getCardNum(ref))?.Power ?? '0', 10)) : undefined;
    result = (pw !== undefined && !isNaN(pw))
      ? { ...rest, powerRange: { ...(rest.powerRange ?? {}), max: pw - 1 } }
      : { ...rest, powerRange: { min: 1, max: 0 } };
  }
  if (result.levelLteLastProcessed) {
    const { levelLteLastProcessed: _l, ...rest } = result;
    const ref = lastProcessedCards?.[0];
    const lvl = ref ? parseInt(cardMap.get(getCardNum(ref))?.Level ?? '', 10) : NaN;
    result = !isNaN(lvl)
      ? { ...rest, level: { ...(typeof rest.level === 'object' ? rest.level : {}), max: lvl } }
      : rest;
  }
  // levelLtLastProcessed: 直前に処理したシグニのレベル"未満"（「その後、そのシグニより低いレベルを持つ」）。
  // 参照不能なら到達不能 level で空ヒット＝対象なし。
  if (result.levelLtLastProcessed) {
    const { levelLtLastProcessed: _llt, ...rest } = result;
    const ref = lastProcessedCards?.[0];
    const lvl = ref ? parseInt(cardMap.get(getCardNum(ref))?.Level ?? '', 10) : NaN;
    result = !isNaN(lvl)
      ? { ...rest, level: { ...(typeof rest.level === 'object' ? rest.level : {}), max: lvl - 1 } }
      : { ...rest, level: { min: 99, max: -1 } };
  }
  // levelGtLastProcessed: 直前に処理したシグニのレベル"より高い"（「その後、…それよりレベルの高い」＝直前配置シグニ基準。WXEX2-28）。
  // 参照不能なら到達不能 level で空ヒット＝対象なし。
  if (result.levelGtLastProcessed) {
    const { levelGtLastProcessed: _lgt, ...rest } = result;
    const ref = lastProcessedCards?.[0];
    const lvl = ref ? parseInt(cardMap.get(getCardNum(ref))?.Level ?? '', 10) : NaN;
    result = !isNaN(lvl)
      ? { ...rest, level: { ...(typeof rest.level === 'object' ? rest.level : {}), min: lvl + 1 } }
      : { ...rest, level: { min: 99, max: -1 } };
  }
  if (result.levelEqLastProcessed) {
    const { levelEqLastProcessed: _le, ...rest } = result;
    const ref = lastProcessedCards?.[0];
    const lvl = ref ? parseInt(cardMap.get(getCardNum(ref))?.Level ?? '', 10) : NaN;
    // 同じレベル＝min/max を同値に。参照不能（NaN・非シグニ等）なら到達不能 level にして空ヒット
    result = !isNaN(lvl)
      ? { ...rest, level: { min: lvl, max: lvl } }
      : { ...rest, level: { min: 99, max: -1 } };
  }
  if (result.colorMatchesLrig || result.colorNotMatchesLrig) {
    const lrigTop = ownerSt.field.lrig.at(-1);
    const lrigColor = lrigTop ? cardMap.get(getCardNum(lrigTop))?.Color : undefined;
    if (result.colorMatchesLrig) {
      const { colorMatchesLrig: _, ...rest } = result;
      result = lrigColor ? { ...rest, color: lrigColor } : rest;
    } else {
      // colorNotMatchesLrig
      const { colorNotMatchesLrig: _, ...rest } = result;
      result = lrigColor ? { ...rest, colorExclude: lrigColor } : rest;
    }
  }
  // 場のルリグ（センター＋アシスト）の色の和／アシストのみの色の和（タスク12(xlvi)(a)）。
  // color 配列は matchesFilter で OR＝「いずれかのルリグと共通する色」を素直に表す。
  if (result.colorMatchesAnyLrig || result.colorMatchesNonCenterLrig) {
    const center = ownerSt.field.lrig.at(-1);
    const assists = [...(ownerSt.field.assist_lrig_l ?? []), ...(ownerSt.field.assist_lrig_r ?? [])];
    const srcLrigs = result.colorMatchesAnyLrig ? [...(center ? [center] : []), ...assists] : assists;
    const colors = [...new Set(srcLrigs.flatMap(n => (cardMap.get(getCardNum(n))?.Color ?? '').split(/[/／、]/).map(s => s.trim()).filter(Boolean)))];
    const { colorMatchesAnyLrig: _a, colorMatchesNonCenterLrig: _n, ...rest } = result;
    // アシスト限定で参照先が無いときは候補ゼロ（到達不能色）＝原文どおりに絞れないなら過剰実行しない側へ。
    // 場のルリグ全体なら（センター不在は起きない前提で）制限なしへフォールバック。
    result = colors.length > 0 ? { ...rest, color: colors }
      : result.colorMatchesNonCenterLrig ? { ...rest, color: '__none__' } : rest;
  }
  if (result.colorNotMatchesOppLrig) {
    const { colorNotMatchesOppLrig: _, ...rest } = result;
    const lrigTop = otherSt?.field.lrig.at(-1);
    const lrigColor = lrigTop ? cardMap.get(getCardNum(lrigTop))?.Color : undefined;
    result = lrigColor ? { ...rest, colorExclude: lrigColor } : rest;
  }
  // colorMatchesLastProcessed: 直前に処理したカード（lastProcessedCards[0]＝「この方法でダウンしたルリグ」等）と
  // 共通する色（1色でも一致）。owner 非依存＝相手エナを自ルリグ色で絞る（WX25-P2-112）。参照不能（スキップ／
  // 該当なし）なら到達不能な色にして空ヒット＝「この方法でダウンした場合」の did-it ゲートを兼ねる。
  if (result.colorMatchesLastProcessed) {
    const { colorMatchesLastProcessed: _cm, ...rest } = result;
    const ref = lastProcessedCards?.[0];
    const cols = ref ? (cardMap.get(getCardNum(ref))?.Color?.match(/[白赤青緑黒無]/g) ?? []) : [];
    result = cols.length ? { ...rest, color: cols } : { ...rest, color: ['__NONE__'] };
  }
  // 「この方法でダウンしたルリグと同じレベル／共通する色」（タスク12(cix)）。
  // 参照先は ①lastProcessedCards[0] がルリグならそれ（同一 SEQUENCE 内の DOWN。任意ダウンのスキップで空＝did-it
  // ゲート）②なければ ownerSt.last_lrig_down_cards（コスト経路。実UIは支払いと解決が別 ExecCtx なので
  // PlayerState 経由でしか届かない）。参照不能なら空ヒット＝原文どおりに絞れないなら過剰実行しない側へ倒す。
  if (result.levelEqLastDownedLrig || result.colorMatchesLastDownedLrig) {
    const { levelEqLastDownedLrig: _ld, colorMatchesLastDownedLrig: _lc, ...rest } = result;
    const processedTop = lastProcessedCards?.[0];
    const fromProcessed = processedTop && cardMap.get(getCardNum(processedTop))?.Type === 'ルリグ'
      ? processedTop : undefined;
    const ref = fromProcessed ?? ownerSt.last_lrig_down_cards?.[0];
    const card = ref ? cardMap.get(getCardNum(ref)) : undefined;
    if (result.levelEqLastDownedLrig) {
      const level = card ? parseInt(card.Level ?? '', 10) : NaN;
      result = !isNaN(level) ? { ...rest, level } : noMatch(rest);
    } else {
      const cols = card?.Color?.match(/[白赤青緑黒無]/g) ?? [];
      result = cols.length ? { ...rest, color: cols } : noMatch(rest);
    }
  }
  if (result.colorMatchesUnderCards) {
    const { colorMatchesUnderCards: _cu, ...rest } = result;
    const stack = ownerSt.field.signi.find(s => s?.includes(sourceCardNum ?? ''));
    const sourceIndex = stack?.indexOf(sourceCardNum ?? '') ?? -1;
    const refs = sourceIndex > 0 ? stack!.slice(0, sourceIndex) : [];
    const cols = [...new Set(refs.flatMap(n => cardMap.get(getCardNum(n))?.Color?.match(/[白赤青緑黒]/g) ?? []))];
    result = cols.length ? { ...rest, color: cols } : { ...rest, color: ['__NONE__'] };
  }
  if (result.colorMatchesCostTrashed) {
    const { colorMatchesCostTrashed: _cc, ...rest } = result;
    const cols = [...new Set((ownerSt.last_cost_trashed_cards ?? [])
      .flatMap(n => cardMap.get(getCardNum(n))?.Color?.match(/[白赤青緑黒]/g) ?? []))];
    result = cols.length ? { ...rest, color: cols } : { ...rest, color: ['__NONE__'] };
  }
  if (result.powerLteRevealedSigniLevelSum != null) {
    const { powerLteRevealedSigniLevelSum: mult, ...rest } = result;
    const sum = ownerSt.last_revealed_signi_level_sum ?? 0;
    result = { ...rest, powerRange: { ...(rest.powerRange ?? {}), max: sum * mult } };
  }
  if (result.powerLteZoneCount) {
    const { powerLteZoneCount: spec, ...rest } = result;
    const max = countFromZone(spec, ownerSt, otherSt ?? ownerSt, cardMap);
    result = { ...rest, powerRange: { ...(rest.powerRange ?? {}), max } };
  }
  if (result.levelLteZoneCount) {
    const { levelLteZoneCount: spec, ...rest } = result;
    const max = countFromZone(spec, ownerSt, otherSt ?? ownerSt, cardMap);
    result = { ...rest, level: { ...(typeof rest.level === 'object' ? rest.level : {}), max } };
  }
  if (result.powerLteLastProcessedCount != null) {
    const { powerLteLastProcessedCount: mult, ...rest } = result;
    const max = (lastProcessedCards?.length ?? 0) * mult;
    result = { ...rest, powerRange: { ...(rest.powerRange ?? {}), max } };
  }
  if (result.levelLteFieldVirusCount && otherSt) {
    const ownVirus = (ownerSt.field.signi_virus ?? []).reduce((s, v) => s + (v ?? 0), 0);
    const oppVirus = (otherSt.field.signi_virus ?? []).reduce((s, v) => s + (v ?? 0), 0);
    const { levelLteFieldVirusCount: _, ...rest } = result;
    result = { ...rest, level: { max: ownVirus + oppVirus } };
  }
  // levelLteHandDiff: レベルが自分と対戦相手の手札枚数の差（self−opp）以下（「その枚数の差以下のレベルを持つ」WXK10-045）。
  // ownerSt は常に効果キャスター＝self。HAND_DIFF{gt,0} ゲート下でのみ実行されるが、防御的に max(0, diff) でクランプ。
  if (result.levelLteHandDiff && otherSt) {
    const diff = ownerSt.hand.length - otherSt.hand.length;
    const { levelLteHandDiff: _, ...rest } = result;
    result = { ...rest, level: { ...(typeof rest.level === 'object' ? rest.level : {}), max: Math.max(0, diff) } };
  }
  if (result.levelLteHandCount) {
    const { levelLteHandCount: _hand, ...rest } = result;
    result = { ...rest, level: { ...(typeof rest.level === 'object' ? rest.level : {}), max: ownerSt.hand.length } };
  }
  if (result.levelLteUnderSelfCount) {
    const { levelLteUnderSelfCount: _under, ...rest } = result;
    const stack = sourceCardNum
      ? ownerSt.field.signi.find(s => {
          const top = s?.at(-1);
          return top === sourceCardNum || (!!top && getCardNum(top) === getCardNum(sourceCardNum));
        })
      : undefined;
    result = stack
      ? { ...rest, level: { ...(typeof rest.level === 'object' ? rest.level : {}), max: Math.max(0, stack.length - 1) } }
      : noMatch(rest);
  }
  return result;
}

function execTransferToHand(a: TransferToHandAction, ctx: ExecCtx): ExecResult {
  if (a.transferGroups?.length) {
    return executeAction({
      type: 'SEQUENCE',
      steps: a.transferGroups.map(group => ({
        type: 'TRANSFER_TO_HAND',
        source: { ...a.source, count: group.count, filter: group.filter, upToCount: true },
      })),
    }, ctx);
  }
  const src = a.source;
  const tgtOwner = src.owner;
  const state = ownerState(tgtOwner, ctx);
  // 上記 execDraw と同じブロック（「カードを**手札に加える**ことができない」側）。
  if (state.blocked_actions?.includes('DRAW_OR_ADD_TO_HAND_BY_EFFECT')) {
    return done(addLog(ctx, '効果で手札に加えることは封じられている'));
  }
  const ownerSt = tgtOwner === 'self' ? ctx.ownerState : ctx.otherState;
  const otherSt = tgtOwner === 'self' ? ctx.otherState : ctx.ownerState;

  let cands: string[];
  let scope: TargetScope;

  if (src.type === 'LIFE_CLOTH_CARD') {
    const count = src.count === 'ALL' ? state.life_cloth.length : resolveNum(src.count);
    const moved = state.life_cloth.slice(Math.max(0, state.life_cloth.length - count));
    const newS: PlayerState = {
      ...state,
      life_cloth: state.life_cloth.slice(0, Math.max(0, state.life_cloth.length - moved.length)),
      hand: [...state.hand, ...moved],
    };
    return done({
      ...addLog(setOwnerState(tgtOwner, newS, ctx), `ライフクロス${moved.length}枚を手札へ`),
      lastProcessedCards: moved,
    });
  } else if (src.type === 'TRASH_CARD') {
    // thisCardOnly: 効果元カード自身のみ（「このシグニを手札に加える」。トラッシュに置かれた自身を回収。WX04-035-E2）
    if (src.filter?.thisCardOnly) {
      cands = (ctx.sourceCardNum && state.trash.includes(ctx.sourceCardNum)) ? [ctx.sourceCardNum] : [];
    } else {
      const resolvedFilter = resolveDynamicFilter(resolveDiscardLevelFilter(src.filter, ctx.ownerState), ownerSt, ctx.cardMap, otherSt, ctx.lastProcessedCards, ctx.effectivePowers, ctx.sourceCardNum, ctx.triggeringCardNum);
      cands = movableTrashCandidates(src.owner, state, resolvedFilter, ctx.cardMap, ctx, ctx.treatAsClassAllZones);
    }
    if (src.fromLeftFieldUnder) {
      const allowed = new Set(ctx.leftFieldUnderCards ?? []);
      cands = cands.filter(n => allowed.has(n));
    }
    scope = tgtOwner === 'self' ? 'self_trash' : 'opp_trash';
  } else if (src.type === 'ENERGY_CARD') {
    // thisCardOnly: 効果元カード自身のみ（「このシグニをエナゾーンから手札に加える」＝バニッシュで
    // エナへ行った自分自身を拾う。`WX17-052-LAYER`・§6.4 O-4）。⚠TRASH_CARD 側と同じ規約。
    if (src.filter?.thisCardOnly) {
      cands = (ctx.sourceCardNum && state.energy.includes(ctx.sourceCardNum)) ? [ctx.sourceCardNum] : [];
    } else {
      const resolvedFilter = resolveDynamicFilter(src.filter, ownerSt, ctx.cardMap, otherSt, ctx.lastProcessedCards, ctx.effectivePowers, ctx.sourceCardNum, ctx.triggeringCardNum);
      cands = energyCandidates(state, resolvedFilter, ctx.cardMap, ctx.treatAsClassAllZones);
    }
    scope = tgtOwner === 'self' ? 'self_energy' : 'opp_energy';
  } else {
    return done(ctx);
  }

  function applyTransfer(selected: string[], c: ExecCtx): ExecCtx {
    const s = ownerState(tgtOwner, c);
    let newS = { ...s };
    for (const n of selected) {
      if (src.type === 'TRASH_CARD') {
        newS = { ...newS, trash: newS.trash.filter(x => x !== n), hand: [...newS.hand, n] };
      } else if (src.type === 'ENERGY_CARD') {
        newS = { ...newS, energy: newS.energy.filter(x => x !== n), hand: [...newS.hand, n] };
      }
    }
    const names = selected.map(n => c.cardMap.get(n)?.CardName ?? n).join('・');
    const from = src.type === 'TRASH_CARD' ? 'トラッシュ' : 'エナ';
    return {
      ...addLog(setOwnerState(tgtOwner, newS, c), `${from}から${names}を手札へ`),
      lastProcessedCards: selected,
    };
  }

  const count = src.count === 'ALL' ? cands.length : resolveCountRef(src.count, ctx, src.countFromZone);
  if (src.count === 'ALL') return done(applyTransfer(cands, ctx));
  // thisCardOnly: 「このカードを手札に加える」は選択不要 → 即適用（候補なしはスキップ）
  if (src.type === 'TRASH_CARD' && src.filter?.thisCardOnly) {
    return cands.length > 0 ? done(applyTransfer(cands, ctx)) : done(ctx);
  }
  return selectOrInteract(cands, count, src.upToCount ?? false, scope, a, undefined, ctx, false, { selectionConstraint: src.selectionConstraint });
}

// PLACE_SIGNI_ON_FIELD: cardNums を1枚ずつ場に出す。各カードでゾーン選択が必要なら、残りカードの配置を
// continuation にチェーンして順次解決する（複数枚の場出しでカードが消失しないようにする）。
function execPlaceSigniOnField(a: import('../types/effects').PlaceSigniOnFieldAction, ctx: ExecCtx): ExecResult {
  if (a.cardNums.length === 0) {
    const completed = a.lastProcessedCardsAfter ? { ...ctx, lastProcessedCards: a.lastProcessedCardsAfter } : ctx;
    return a.afterAction ? executeAction(a.afterAction, completed) : done(completed);
  }
  const [head, ...rest] = a.cardNums;
  const placeAction: AddToFieldAction = { type: 'ADD_TO_FIELD', owner: a.owner, ...(a.asDown ? { asDown: a.asDown } : {}),
    ...(a.opponentSelectsZone ? { opponentSelectsZone: true } : {}) };
  const cont: import('../types/effects').PlaceSigniOnFieldAction = {
    type: 'PLACE_SIGNI_ON_FIELD', owner: a.owner, cardNums: rest,
    ...(a.asDown ? { asDown: a.asDown } : {}),
    ...(a.afterAction ? { afterAction: a.afterAction } : {}),
    ...(a.lastProcessedCardsAfter ? { lastProcessedCardsAfter: a.lastProcessedCardsAfter } : {}),
    ...(a.opponentSelectsZone ? { opponentSelectsZone: true } : {}),
  };
  const result = applyDirectAction(placeAction, head, ctx);
  if (!result.done) {
    // ゾーン選択待ち: 残りカードの配置を continuation に合成
    const existing = result.pending.continuation;
    result.pending = {
      ...result.pending,
      // ゾーン選択を跨いで lastProcessedCards（この効果で場に出したシグニ）を維持する。
      // applyDirectAction の SELECT_SIGNI_ZONE は placedSoFar を積まないため、ここで補わないと
      // resume 後の afterAction（levelGtLastProcessed 等の動的比較 SEARCH）が直前配置シグニを
      // 参照できず空振りする（WXEX2-28-E3）。head は配置中＝resume 側が末尾に足すので除外。
      ...(result.pending.type === 'SELECT_SIGNI_ZONE'
          && (result.pending as { placedSoFar?: string[] }).placedSoFar === undefined
        ? { placedSoFar: (ctx.lastProcessedCards ?? []).filter(n => n !== head) }
        : {}),
      continuation: existing
        ? ({ type: 'SEQUENCE', steps: [existing, cont] } as SequenceAction)
        : cont,
    };
    return result;
  }
  // 即時配置完了（空きゾーン1つ/空きなし）→ 残りを継続
  return executeAction(cont, { ...ctx, ownerState: result.ownerState, otherState: result.otherState, logs: result.logs, fieldTrashCostCards: result.fieldTrashCostCards ?? ctx.fieldTrashCostCards, trapActivated: result.trapActivated ?? ctx.trapActivated, trapSetOwners: result.trapSetOwners ?? ctx.trapSetOwners });
}

// 効果によって場に出したシグニの発生源（sourceCardNum）を記録する（出自条件 THIS_CARD_PLACED_BY_CLASS 用・WX26-CP1-048）。
// 通常召喚（sourceCardNum なし）は記録しない。自身の効果による再配置も効果起因として記録する。
function recordPlacedBySource(state: PlayerState, placedInstanceId: string, sourceCardNum?: string): PlayerState {
  if (!sourceCardNum) return state;
  return { ...state, signi_placed_by_source: { ...(state.signi_placed_by_source ?? {}), [placedInstanceId]: sourceCardNum } };
}

function recordNonHandPlacement(state: PlayerState, placedInstanceId: string): PlayerState {
  return {
    ...state,
    signi_played_from_non_hand_this_turn: [
      ...(state.signi_played_from_non_hand_this_turn ?? []).filter(n => n !== placedInstanceId),
      placedInstanceId,
    ],
  };
}

function clearNonHandPlacement(state: PlayerState, placedInstanceId: string): PlayerState {
  return {
    ...state,
    signi_played_from_non_hand_this_turn: (state.signi_played_from_non_hand_this_turn ?? []).filter(n => n !== placedInstanceId),
  };
}

/**
 * 配置制限（`deployLimit.ts`）を ExecCtx から評価する。**engine の「シグニを新たに場に出す」全経路で呼ぶこと**。
 * 通常召喚UI／CPU召喚と同じ関数を共有する（旧実装は engine 側だけ判定が無く素通りしていた）。
 */
function deployLimitBlockedFor(
  tgtOwner: Owner, cardNum: string, ctx: ExecCtx, fieldCountAdjust = 0,
): DeployBlockReason | null {
  const placingIsSelf = tgtOwner === 'self';
  return deployLimitBlockReason({
    placingState: ownerState(tgtOwner, ctx),
    opponentState: placingIsSelf ? ctx.otherState : ctx.ownerState,
    cardNum,
    cardMap: ctx.cardMap,
    effectsMap: ctx.effectsMap,
    contCountCap: placingIsSelf ? ctx.deployCountCapSelf : ctx.deployCountCapOpponent,
    isPlacingOwnerTurn: ctx.isOwnerTurn === undefined
      ? undefined
      : (placingIsSelf ? ctx.isOwnerTurn : !ctx.isOwnerTurn),
    fieldCountAdjust,
    // engine 経路＝**効果による配置**。出自は効果元カードの Type で決める（§6.4 O-3 続き487）。
    placementSource: effectPlacementSource(ctx.sourceCardNum, ctx.cardMap),
  });
}

function execAddToField(a: AddToFieldAction, ctx: ExecCtx): ExecResult {
  const tgtOwner = a.owner;
  const src = a.source;

  // BLOCK_OPP_SIGNI_FIELD_PLACE_BY_SIGNI_EFFECT: シグニ効果による自フィールドへのシグニ配置をブロック
  if (tgtOwner === 'self' && ctx.signiFieldPlaceByEffectBlocked) {
    const srcCard = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    if (srcCard?.Type === 'シグニ') {
      return done(addLog(ctx, 'シグニ効果によるシグニ配置がブロックされた（CONT効果）'));
    }
  }

  // ゲーム外からトークン生成（cardName指定時）
  if (!src && a.cardName) {
    const state = ownerState(tgtOwner, ctx);
    if (!state.field.signi.some(z => !z || z.length === 0)) {
      return done(addLog(ctx, `空きシグニゾーンなし（${a.cardName}配置不可）`));
    }
    // 配置制限（「シグニをN体までしか場に出せない」）。⚠ゾーン選択UIを出す**前**に弾く。
    {
      const blocked = deployLimitBlockedFor(tgtOwner, a.cardName, ctx);
      if (blocked) return done(addLog(ctx, deployLimitLogMessage(blocked, a.cardName)));
    }
    // a.cardName は原文の《CardName》。InstanceMap は CardNum でカードデータを引くため、
    // クラフト/トークンの CardName を CardNum に解決してインスタンスの基底にする
    // （未解決だと能力・パワーが付かない空トークンになる）。
    let tokenBase = a.cardName;
    if (!ctx.cardMap.has(a.cardName)) {
      // 全角英数・表意空白を半角化して照合（原文《ＺＥＲＯ》とトークン名 "ZERO" の幅差を吸収）
      const norm = (s: string) => s.replace(/[！-～]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0)).replace(/　/g, ' ');
      const want = norm(a.cardName);
      for (const [num, cd] of ctx.cardMap) {
        if (norm(cd.CardName ?? '') === want && (cd.Type ?? '').includes('クラフト')) { tokenBase = getCardNum(num); break; }
      }
      // クラフト型が見つからなければ CardName 一致のみで解決
      if (tokenBase === a.cardName) {
        for (const [num, cd] of ctx.cardMap) {
          if (norm(cd.CardName ?? '') === want) { tokenBase = getCardNum(num); break; }
        }
      }
    }
    let maxIdx = 0;
    const scanNums = (arr: string[] | null | undefined) => arr?.forEach(n => {
      if (getCardNum(n) === tokenBase) {
        const i = parseInt(n.slice(tokenBase.length + 1), 10) || 0;
        if (i > maxIdx) maxIdx = i;
      }
    });
    const scanSt = (s: PlayerState) => {
      scanNums(s.deck); scanNums(s.hand); scanNums(s.trash); scanNums(s.energy);
      s.field.signi.forEach(z => scanNums(z));
      scanNums(s.field.free_zone);
    };
    scanSt(ctx.ownerState);
    scanSt(ctx.otherState);
    const instanceId = `${tokenBase}#${maxIdx + 1}`;
    const signi = [...state.field.signi] as (string[] | null)[];
    const emptyZones = signi.map((z, i) => ({ i, empty: !z || z.length === 0 })).filter(x => x.empty);
    if (emptyZones.length >= 2) {
      return needsInteraction(ctx, {
        type: 'SELECT_SIGNI_ZONE',
        cardNum: instanceId,
        owner: tgtOwner === 'opponent' ? 'opponent' : 'self',
        fromNonHand: true,
      });
    }
    signi[emptyZones[0].i] = [instanceId];
    const newS: PlayerState = recordNonHandPlacement({ ...state, field: { ...state.field, signi } }, instanceId);
    const cardLabel = ctx.cardMap.get(instanceId)?.CardName ?? a.cardName;
    return done(addLog(setOwnerState(tgtOwner, newS, ctx),
      `${cardLabel}をゾーン${emptyZones[0].i + 1}に場に出す（ゲーム外から）`));
  }

  // source
  if (!src) {
    const state = ownerState(tgtOwner, ctx);
    if (state.deck.length === 0) return done(ctx);
    // 空きゾーンがなければスキップ
    if (!state.field.signi.some(z => !z || z.length === 0)) return done(ctx);
    const cardNum = state.deck[0];
    // 配置制限（「シグニをN体までしか場に出せない」）。⚠ゾーン選択UI／任意選択を出す**前**に弾く。
    {
      const blocked = deployLimitBlockedFor(tgtOwner, cardNum, ctx);
      if (blocked) {
        return done(addLog(ctx, deployLimitLogMessage(
          blocked, ctx.cardMap.get(getCardNum(cardNum))?.CardName ?? cardNum)));
      }
    }
    // optional:「場に出してもよい」＝出す/出さないを選択（デッキトップ公開後の任意配置。WDK16-13/WXK08-033）。
    // 出す側は optional を落として同アクションへ再入し、下の SELECT_ZONE 分岐で配置する。
    if (a.optional) {
      const placeAct = { ...a, optional: false } as AddToFieldAction;
      const cardLbl = ctx.cardMap.get(getCardNum(cardNum))?.CardName ?? cardNum;
      return needsInteraction(ctx, {
        type: 'CHOOSE', count: 1, options: [
          { id: 'place', label: `${cardLbl}を場に出す`, action: placeAct as EffectAction, available: true },
          { id: 'skip', label: '場に出さない', action: { type: 'SEQUENCE', steps: [] } as EffectAction, available: true },
        ],
      });
    }
    const newS: PlayerState = { ...state, deck: state.deck.slice(1) };
    const newCtx = setOwnerState(tgtOwner, newS, ctx);
    return needsInteraction(newCtx, {
      type: 'SELECT_ZONE',
      cardNum,
      owner: tgtOwner === 'opponent' ? 'opponent' : 'self',
    });
  }

  const state = ownerState(tgtOwner, ctx);
  let cands: string[];
  let scope: TargetScope;

  const addToFieldOwnerSt = tgtOwner === 'self' ? ctx.ownerState : ctx.otherState;
  const addToFieldOtherSt = tgtOwner === 'self' ? ctx.otherState : ctx.ownerState;
  if (src.type === 'TRASH_CARD') {
    const resolvedFilter = resolveDynamicFilter(src.filter, addToFieldOwnerSt, ctx.cardMap, addToFieldOtherSt, ctx.lastProcessedCards, ctx.effectivePowers, ctx.sourceCardNum, ctx.triggeringCardNum);
    cands = movableTrashCandidates(tgtOwner, state, resolvedFilter, ctx.cardMap, ctx, ctx.treatAsClassAllZones);
    // thisCardOnly: 「このシグニをトラッシュから場に出す」＝効果元カード自身のみ（トラッシュ自己起動）
    if (src.filter?.thisCardOnly) {
      cands = (ctx.sourceCardNum && state.trash.includes(ctx.sourceCardNum)) ? [ctx.sourceCardNum] : [];
    }
    if (src.fromLeftFieldUnder) {
      const allowed = new Set(ctx.leftFieldUnderCards ?? []);
      cands = cands.filter(n => allowed.has(n));
    }
    scope = tgtOwner === 'self' ? 'self_trash' : 'opp_trash';
  } else if (src.type === 'ENERGY_CARD') {
    const resolvedFilter = resolveDynamicFilter(src.filter, addToFieldOwnerSt, ctx.cardMap, addToFieldOtherSt, ctx.lastProcessedCards, ctx.effectivePowers, ctx.sourceCardNum, ctx.triggeringCardNum);
    cands = energyCandidates(state, resolvedFilter, ctx.cardMap, ctx.treatAsClassAllZones);
    // thisCardOnly: 効果元カード自身のみ（「このシグニをエナゾーンから場に出す」＝バニッシュでエナへ
    // 行った自分自身を戻す自己蘇生）。⚠`matchesFilter` は `thisCardOnly` を**黙って無視する**ので
    // `energyCandidates` の結果には効かない＝ここで絞らないと**エナのどのシグニでも出せる過剰実行**になる。
    // TRASH_CARD 分岐・`execTransferToHand` の ENERGY_CARD 分岐と同じ規約。
    if (src.filter?.thisCardOnly) {
      cands = (ctx.sourceCardNum && state.energy.includes(ctx.sourceCardNum)) ? [ctx.sourceCardNum] : [];
    }
    if (a.targetsTriggerSource) {
      cands = ctx.triggeringCardNum && state.energy.includes(ctx.triggeringCardNum) ? [ctx.triggeringCardNum] : [];
    }
    scope = tgtOwner === 'self' ? 'self_energy' : 'opp_energy';
  } else if (src.type === 'HAND_CARD') {
    cands = handCandidates(state, src.filter, ctx.cardMap, ctx.treatAsClassAllZones);
    scope = tgtOwner === 'self' ? 'self_hand' : 'opp_hand';
  } else if (src.type === 'DECK_CARD') {
    // 「デッキの一番上を見る。それが〈filter〉の場合、場に出してもよい」（G141）。
    // デッキ上から count 枚を対象に filter で絞る。一致しなければ候補なし＝何も起きない。
    const resolvedFilter = resolveDynamicFilter(src.filter, addToFieldOwnerSt, ctx.cardMap, addToFieldOtherSt, ctx.lastProcessedCards, ctx.effectivePowers, ctx.sourceCardNum, ctx.triggeringCardNum);
    const topCount = src.count === 'ALL' ? state.deck.length : resolveCountRef(src.count, ctx, src.countFromZone);
    const pool = state.deck.slice(0, topCount);
    cands = pool.filter(n => matchesFilter(ctx.cardMap.get(n), resolvedFilter, undefined, undefined, ctx.treatAsClassAllZones));
    // 配置は applyDirectAction(ADD_TO_FIELD) が所在（デッキ）を問わず除去・配置する。scope はUI表示用の近似。
    scope = tgtOwner === 'self' ? 'self_field' : 'opp_field';
  } else {
    return done(ctx);
  }

  // 場に出す：空きゾーンに配置（呼び出し元が担当できないため自動的に最初の空きへ）
  const srcDefined = src!;
  function applyToField(selected: string[], c: ExecCtx): ExecCtx {
    let cur = c;
    const placed: string[] = [];
    for (const n of selected) {
      const s = ownerState(tgtOwner, cur);
      // 空きゾーンがない場合は移動させずスキップ（カード消失防止）
      const emptyIdxCheck = s.field.signi.findIndex(z => !z || z.length === 0);
      if (emptyIdxCheck < 0) {
        cur = addLog(cur, '空きシグニゾーンがないため場に出せない');
        continue;
      }
      // 配置制限は**1枚ごとに**評価する（複数枚配置は場のシグニ数が増えながら進むため、
      // まとめて1回だけ見ると上限を跨いで置けてしまう）。
      const blockedDL = deployLimitBlockedFor(tgtOwner, n, cur);
      if (blockedDL) {
        cur = addLog(cur, deployLimitLogMessage(blockedDL, ctx.cardMap.get(getCardNum(n))?.CardName ?? n));
        continue;
      }
      let newS = { ...s };
      if (srcDefined.type === 'TRASH_CARD') {
        // THIS_CARD_FROM_TRASH 用に「トラッシュから出た」インスタンスを記録（直後の【出】効果が参照）
        newS = { ...newS, trash: newS.trash.filter(x => x !== n),
          signi_played_from_trash: [...(newS.signi_played_from_trash ?? []), n] };
        newS = recordNonHandPlacement(newS, n);
      } else if (srcDefined.type === 'DECK_CARD') {
        newS = { ...newS, deck: newS.deck.filter(x => x !== n),
          signi_played_from_deck: [...(newS.signi_played_from_deck ?? []), n],
          signi_played_from_trash: (newS.signi_played_from_trash ?? []).filter(x => x !== n) };
        newS = recordNonHandPlacement(newS, n);
      } else if (srcDefined.type === 'ENERGY_CARD') {
        newS = { ...newS, energy: newS.energy.filter(x => x !== n),
          signi_played_from_trash: (newS.signi_played_from_trash ?? []).filter(x => x !== n) };
        newS = recordNonHandPlacement(newS, n);
      } else if (srcDefined.type === 'HAND_CARD') {
        newS = { ...newS, hand: newS.hand.filter(x => x !== n),
          signi_played_from_trash: (newS.signi_played_from_trash ?? []).filter(x => x !== n) };
        newS = clearNonHandPlacement(newS, n);
      }
      // 空きゾーンに配置
      const signi = [...newS.field.signi] as (string[] | null)[];
      const emptyIdx = signi.findIndex(z => !z || z.length === 0);
      if (emptyIdx >= 0) signi[emptyIdx] = [n];
      newS = { ...newS, field: { ...newS.field, signi } };
      // 出自記録: この配置が効果起因（sourceCardNum あり・自身の再配置でない）なら発生源を記録（WX26-CP1-048）。
      newS = recordPlacedBySource(newS, n, ctx.sourceCardNum);
      // ダウン状態で場に出す（ミズフウセン等「ダウン状態で場に出してもよい」）
      if (a.asDown && emptyIdx >= 0) {
        const newDown = [...(newS.field.signi_down ?? [false, false, false])] as boolean[];
        newDown[emptyIdx] = true;
        newS = { ...newS, field: { ...newS.field, signi_down: newDown } };
      }
      cur = addLog(setOwnerState(tgtOwner, newS, cur),
        `${cur.cardMap.get(n)?.CardName ?? n}をフィールドに出す`);
      placed.push(n);
    }
    return { ...cur, lastProcessedCards: placed };
  }

  const count = src.count === 'ALL' ? cands.length : resolveCountRef(src.count, ctx, src.countFromZone);
  if (src.count === 'ALL') return done(applyToField(cands, ctx));
  // a.optional:「場に出してもよい」→ 出す/出さないを選択可能にする（src.upToCount と同様に任意化）
  return selectOrInteract(cands, count, (a.optional ?? false) || (src.upToCount ?? false), scope, a, undefined, ctx, false, { selectionConstraint: src.selectionConstraint });
}

function execAddToLife(a: AddToLifeAction, ctx: ExecCtx): ExecResult {
  // last_processed_count: 「トラッシュに置いたシグニ1体につき…ライフクロスに加える」→ 直前にトラッシュした枚数
  const count = resolveCountRef(a.count, ctx);
  if (count <= 0) return done(ctx);
  const state = ownerState(a.owner, ctx);
  if (a.fromField) {
    const target = a.target ?? { type: 'SIGNI', owner: a.owner, count: 1 };
    const targetState = ownerState(target.owner, ctx);
    let cands = fieldCandidates(targetState, target.filter, ctx.cardMap, ctx.effectivePowers, ctx.allColorSigniNums, ctx.fieldSigniExtraColors);
    if (a.targetsStored) cands = cands.filter(n => (ctx.storedTargetCards ?? []).includes(n));
    // ⚠場の持ち主（target.owner）とライフクロスの持ち主（a.owner）は別人でありうる。
    // 「対戦相手のシグニ１体を対象とし…それをライフクロスに加える」（WX24-P4-045）＝原文が
    // 加える先を修飾しない場合は**効果の使用者**のライフクロス（CSV 全文調査で、相手のライフに
    // 加える文型は必ず「対戦相手は/対戦相手の…」と明示される）。両者を同一視すると相手に
    // ライフを与えてしまう＝真逆の効果になる。
    const moveToLife = (selected: string[], c: ExecCtx): ExecCtx => {
      let cur = c;
      const moved: string[] = [];
      for (const n of selected) {
        const fromState = ownerState(target.owner, cur);
        if (!fromState.field.signi.some(stack => stack?.at(-1) === n)) continue;
        cur = setOwnerState(target.owner, removeFromField(n, fromState), cur);
        const lifeState = ownerState(a.owner, cur);
        cur = setOwnerState(a.owner, { ...lifeState, life_cloth: [...lifeState.life_cloth, n] }, cur);
        moved.push(n);
      }
      return addLog(
        { ...cur, lastProcessedCards: moved },
        `${moved.length}枚を場から${a.owner === 'opponent' ? '対戦相手の' : ''}ライフクロスへ`,
      );
    };
    if (a.targetsStored || target.count === 'ALL') {
      const take = target.count === 'ALL' ? cands : cands.slice(0, count);
      return done(moveToLife(take, ctx));
    }
    return selectOrInteract(cands, count, target.upToCount ?? false,
      target.owner === 'opponent' ? 'opp_field' : 'self_field', a, undefined, ctx, !!a.opponentSelects);
  }
  if (a.fromTrash) {
    // ⚠`a.filter` を渡さないと**トラッシュのどのカードでもライフに置ける過剰実行**になる
    //   （原文は必ず「【ライフバースト】を持たないカード」「＜龍獣＞のシグニ」等で絞る）。
    const cands = movableTrashCandidates(a.owner ?? 'self', state, a.filter, ctx.cardMap, ctx, ctx.treatAsClassAllZones);
    if (cands.length === 0) return done(addLog(ctx, 'トラッシュがないためライフクロスに加えられない'));
    const scope: TargetScope = a.owner === 'self' ? 'self_trash' : 'opp_trash';
    return selectOrInteract(cands, count, false, scope, a, undefined, ctx, !!a.opponentSelects);
  }
  if (a.fromEnergy) {
    // 「このシグニを**エナゾーンから**ライフクロスに加える」（`WXDi-P08-038`＝バニッシュでエナへ行った
    // 自分自身を戻す）。⚠`fromTop` に落とすと**デッキの一番上**が乗って自分自身はエナに残る＝別物。
    // thisCardOnly は `matchesFilter` が黙って無視するので、ここで剥がして候補を自分自身に絞る
    // （`execAddToField`／`execTransferToHand` の ENERGY_CARD 分岐と同じ規約）。
    let energyFilter = a.filter;
    let selfOnly = false;
    if (energyFilter?.thisCardOnly) {
      const { thisCardOnly: _t, ...rest } = energyFilter;
      energyFilter = Object.keys(rest).length > 0 ? rest : undefined;
      selfOnly = true;
    }
    let cands = energyCandidates(state, energyFilter, ctx.cardMap, ctx.treatAsClassAllZones);
    if (selfOnly) cands = (ctx.sourceCardNum && state.energy.includes(ctx.sourceCardNum)) ? [ctx.sourceCardNum] : [];
    if (cands.length === 0) return done({ ...addLog(ctx, 'エナゾーンに該当カードがないためライフクロスに加えられない'), lastProcessedCards: [] });
    // thisCardOnly＝選ぶ余地が無いので選択UIを出さず即適用（`execTransferToHand` の TRASH_CARD 側と同規約）
    if (selfOnly) {
      const num = cands[0];
      const newE: PlayerState = {
        ...state,
        energy: state.energy.filter(x => x !== num),
        life_cloth: [...state.life_cloth, num],
      };
      return done(addLog({ ...setOwnerState(a.owner, newE, ctx), lastProcessedCards: [num] },
        `${ctx.cardMap.get(getCardNum(num))?.CardName ?? num}をエナゾーンからライフクロスに追加`));
    }
    const scope: TargetScope = a.owner === 'self' ? 'self_energy' : 'opp_energy';
    return selectOrInteract(cands, count, false, scope, a, undefined, ctx, !!a.opponentSelects);
  }
  if (a.fromHand) {
    // 手札から1枚選んでライフクロスに追加
    const cands = handCandidates(state, undefined, ctx.cardMap, ctx.treatAsClassAllZones);
    if (cands.length === 0) return done(addLog(ctx, '手札がないためライフクロスに加えられない'));
    const scope: TargetScope = a.owner === 'self' ? 'self_hand' : 'opp_hand';
    return selectOrInteract(cands, count, false, scope, a, undefined, ctx);
  }
  if (a.fromBottom) {
    // 「デッキの**一番下**のカードをライフクロスに加える」（`WXK03-066`）。
    // ⚠一番上と同一視すると**別のカードがライフに乗る**（デッキ構築上は別札＝盤面が変わる）。
    if (state.deck.length === 0) return done(ctx);
    const tookB = state.deck.slice(Math.max(0, state.deck.length - count));
    const newB: PlayerState = {
      ...state,
      deck: state.deck.slice(0, Math.max(0, state.deck.length - count)),
      life_cloth: [...state.life_cloth, ...tookB],
    };
    return done(addLog(setOwnerState(a.owner, newB, ctx), `デッキの一番下${tookB.length}枚をライフクロスに追加`));
  }
  if (!a.fromTop) return done(ctx);
  const took = state.deck.slice(0, count);
  const newS: PlayerState = {
    ...state,
    deck: state.deck.slice(count),
    life_cloth: [...state.life_cloth, ...took],
  };
  return done(addLog(setOwnerState(a.owner, newS, ctx), `デッキトップ${count}枚をライフクロスに追加`));
}

function applyFreezeToFieldCard(a: FreezeAction, cardNum: string, own: Owner, ctx: ExecCtx): ExecCtx {
  const state = ownerState(own, ctx);
  const name = ctx.cardMap.get(getCardNum(cardNum))?.CardName ?? cardNum;
  const fieldPatch: Partial<PlayerState['field']> = {};

  if (state.field.lrig.at(-1) === cardNum) {
    fieldPatch.lrig_frozen = true;
    if (a.down) fieldPatch.lrig_down = true;
  } else if (state.field.assist_lrig_l?.at(-1) === cardNum) {
    fieldPatch.assist_lrig_l_frozen = true;
    if (a.down) fieldPatch.assist_lrig_l_down = true;
  } else if (state.field.assist_lrig_r?.at(-1) === cardNum) {
    fieldPatch.assist_lrig_r_frozen = true;
    if (a.down) fieldPatch.assist_lrig_r_down = true;
  } else {
    const zoneIdx = state.field.signi.findIndex(stack => stack?.at(-1) === cardNum);
    if (zoneIdx < 0) return ctx;
    const frozen = [...(state.field.signi_frozen ?? [false, false, false])] as boolean[];
    frozen[zoneIdx] = true;
    fieldPatch.signi_frozen = frozen;
    if (a.down) {
      const down = [...(state.field.signi_down ?? [false, false, false])] as boolean[];
      down[zoneIdx] = true;
      fieldPatch.signi_down = down;
    }
  }

  const next = { ...state, field: { ...state.field, ...fieldPatch } };
  return addLog(setOwnerState(own, next, ctx), `${name}を${a.down ? 'ダウンしてフリーズ' : 'フリーズ'}`);
}

function execFreeze(a: FreezeAction, ctx: ExecCtx): ExecResult {
  // CENTER_LRIG_OR_SIGNI + ALL: センター／左右アシストの各トップと全シグニを同じ候補集合で解決する。
  // 「すべてのルリグとシグニ」（WXDi-P16-005）は LRIG(センター固定)+SIGNI の2段では
  // アシストが永久に対象外になるため、既存の複合対象型をこの action でも実装する。
  if (a.target.type === 'CENTER_LRIG_OR_SIGNI') {
    const tgtOwner = a.target.owner === 'any' ? 'opponent' : a.target.owner as Owner;
    const state = ownerState(tgtOwner, ctx);
    const lrigs = lrigZoneTops(state.field).filter((num): num is string => !!num);
    const signis = fieldCandidates(state, a.target.filter, ctx.cardMap, ctx.effectivePowers, ctx.allColorSigniNums, ctx.fieldSigniExtraColors);
    let cands = [...lrigs, ...signis];
    if (tgtOwner === 'opponent' && ctx.otherEffectImmuneNums?.size) {
      cands = cands.filter(num => !ctx.otherEffectImmuneNums!.has(num));
    }
    if (cands.length === 0) return done(ctx);
    if (a.target.count === 'ALL') {
      let cur = ctx;
      for (const num of cands) cur = applyFreezeToFieldCard(a, num, tgtOwner, cur);
      return done({ ...cur, lastProcessedCards: cands });
    }
    const count = resolveNum(a.target.count);
    const scope: TargetScope = tgtOwner === 'self' ? 'self_field' : 'opp_field';
    return selectOrInteract(cands, count, a.target.upToCount ?? false, scope, a, undefined, ctx, false, { selectionConstraint: a.target.selectionConstraint });
  }
  // LRIG 対象（「対戦相手のセンタールリグ1体を対象とし、それを凍結する」WX17-020③）。
  // `lrig_frozen` は PlayerState/UI/BattleScreen 側に既にあり（アップフェイズでアップしない）、
  // STUB からは設定されていたが FREEZE アクションが LRIG 対象を扱っていなかった＝execDown の LRIG 分岐と同型で対応する。
  if (a.target.type === 'LRIG') {
    const lstate = ownerState(a.target.owner, ctx);
    const lrigTopId = lstate.field.lrig?.at(-1);
    if (a.target.owner === 'opponent' && lrigTopId && ctx.otherEffectImmuneNums?.has(lrigTopId)) {
      return done(addLog(ctx, 'センタールリグは効果を受けない（凍結無効）'));
    }
    if (!lrigTopId) return done(ctx);
    return done(applyFreezeToFieldCard(a, lrigTopId, a.target.owner as Owner, ctx));
  }
  // owner:'any'＋isTriggerSource（「シグニ1体がダウン状態になったとき、そのシグニを凍結する」WXK11-015-E3＝
  // triggerScope:any でトリガー元がどちらの場かは実行時に決まる）: トリガー元の所在側を特定してから通常経路へ。
  // 所在不明（既に場を離れた等）なら no-op。
  if (a.target.owner === 'any' && a.target.filter?.isTriggerSource) {
    const trigNum = ctx.triggeringCardNum;
    const side: Owner | null = !trigNum ? null
      : ctx.ownerState.field.signi.some(s => s?.at(-1) === trigNum) ? 'self'
      : ctx.otherState.field.signi.some(s => s?.at(-1) === trigNum) ? 'opponent' : null;
    if (!side) return done(ctx);
    return execFreeze({ ...a, target: { ...a.target, owner: side } }, ctx);
  }
  // isTriggerSource: トリガー元カード（ctx.triggeringCardNum＝アタッカー等）のみを対象（「アタックしたそのシグニ」WX04-082-E1）
  let freezeFilter = a.target.filter;
  let triggerRestrictFZ: string[] | null = null;
  if (freezeFilter?.isTriggerSource) {
    const { isTriggerSource: _ts, ...rest } = freezeFilter;
    freezeFilter = rest;
    triggerRestrictFZ = ctx.triggeringCardNum ? [ctx.triggeringCardNum] : [];
  }
  // owner:'any'（修飾語なし「シグニ1体を対象とし」）は両フィールドから候補を集める（タスク12(lii)）
  const { cands: rawCands, scope } = fieldCandidatesByOwner(a.target.owner, freezeFilter, ctx);
  let cands = rawCands;
  if (triggerRestrictFZ !== null) cands = cands.filter(n => triggerRestrictFZ!.includes(n));
  // targetsStored: 先行の SELECT_TARGET_ONLY で固定した対象だけに絞る（「それを凍結する」。タスク12(lxiv)）
  if (a.targetsStored) cands = cands.filter(n => (ctx.storedTargetCards ?? []).includes(n));
  // 完全効果耐性: 相手の凍結効果は耐性シグニに無効
  if (a.target.owner === 'opponent' && ctx.otherEffectImmuneNums?.size) {
    cands = cands.filter(n => !ctx.otherEffectImmuneNums!.has(n));
  }
  function applyFreeze(selected: string[], c: ExecCtx): ExecCtx {
    let cur = c;
    for (const num of selected) {
      const own: Owner = a.target.owner === 'any' ? sideOfFieldCard(num, cur) : a.target.owner;
      cur = applyFreezeToFieldCard(a, num, own, cur);
    }
    return cur;
  }

  if (a.target.count === 'ALL') return done(applyFreeze(cands, ctx));
  const count = resolveNum(a.target.count);
  return selectOrInteract(cands, count, a.target.upToCount ?? false, scope, a, undefined, ctx, false, { selectionConstraint: a.target.selectionConstraint });
}

function execDown(a: DownAction, ctx: ExecCtx): ExecResult {
  if (a.target.type === 'LRIG') {
    const state = ownerState(a.target.owner, ctx);
    const lrigTopId = state.field.lrig?.at(-1);
    // 効果耐性（「あなたのセンタールリグはアーツの効果を受けない」WX04-064 等）: 相手効果ならダウン無効
    if (a.target.owner === 'opponent' && lrigTopId && ctx.otherEffectImmuneNums?.has(lrigTopId)) {
      return done(addLog(ctx, 'センタールリグは効果を受けない（ダウン無効）'));
    }
    // 「あなたのアップ状態の（レベルNの）ルリグN体をダウン（してもよい）」＝**センター固定ではない**（アシスト
    // ルリグも「ルリグ」）。コスト経路と同じ `payLrigDownCost` を単一入口に使い、センター→アシストL→R の
    // 正規順で count 体を払う。ここを通ると「この方法でダウンしたルリグ」の記録（lastProcessedCards／
    // PlayerState.last_lrig_down_cards／seqVars）も同時に入る（タスク12(cix)）。
    // ⚠ 判別子は **filter.isUp**＝原文が「アップ状態の…ルリグ」と言っている形だけ。素の
    //   `{type:'LRIG',count:1}`（「対戦相手のセンタールリグ1体をダウン」等）は従来どおりセンター限定で扱う。
    if (a.target.owner === 'self' && a.target.filter?.isUp) {
      const lvlAll = typeof a.target.filter.level === 'number' ? a.target.filter.level : undefined;
      // 「アップ状態のルリグを**好きな数**ダウンする」（count:'ALL'）＝0..N の枚数選択。可変コスト
      // （INTERNAL_PAY_LRIG_DOWN_VARIABLE）と同じ形の CHOOSE を出し、選んだ枚数の固定ダウンへ落とす。
      if (a.target.count === 'ALL') {
        const maxAll = [
          state.field.lrig.length > 0 && !state.field.lrig_down,
          (state.field.assist_lrig_l?.length ?? 0) > 0 && !state.field.assist_lrig_l_down,
          (state.field.assist_lrig_r?.length ?? 0) > 0 && !state.field.assist_lrig_r_down,
        ].filter(Boolean).length;
        if (maxAll === 0) return done({ ...addLog(ctx, 'ダウンできるアップ状態のルリグがない'), lastProcessedCards: [] });
        return needsInteraction(addLog(ctx, 'ダウンするルリグの数を選択'), {
          type: 'CHOOSE', count: 1,
          options: Array.from({ length: maxAll + 1 }, (_, n) => ({
            id: `lrig_down_${n}`,
            label: `ルリグ${n}体をダウン`,
            // 0体＝ダウンしない。記録も落として後続の「この方法でダウンしたルリグ」を空にする。
            action: (n === 0
              ? { type: 'STUB', id: 'INTERNAL_SKIP_OPTIONAL_ACTION', value: 'lrig_down' }
              : { ...a, target: { ...a.target, count: n }, optional: false }) as EffectAction,
            available: true,
          })),
        });
      }
      const wantCount = typeof a.target.count === 'number' ? a.target.count : 1;
      const lvl = lvlAll;
      const paidLD = payLrigDownCost(state, { count: wantCount, ...(lvl !== undefined ? { level: lvl } : {}) }, ctx.cardMap);
      // 払えない＝ダウンするものがない no-op。lastProcessedCards を空にして後続の「この方法で〜」を不成立にする。
      if (!paidLD) return done({ ...addLog(ctx, 'ダウンできるアップ状態のルリグがない'), lastProcessedCards: [] });
      if (a.optional) {
        const downNowLD = { ...a, optional: false } as DownAction;
        // value:'lrig_down'＝スキップ時に「この方法でダウンしたルリグ」の記録も落とす目印（execStubPart1）。
        const skipLD = { type: 'STUB', id: 'INTERNAL_SKIP_OPTIONAL_ACTION', value: 'lrig_down' } as import('../types/effects').StubAction;
        return needsInteraction(addLog(ctx, 'ルリグをダウンしますか？'), {
          type: 'CHOOSE', count: 1,
          options: [
            { id: 'down', label: `ルリグ${wantCount}体をダウンする`, action: downNowLD, available: true },
            { id: 'skip', label: 'スキップ', action: skipLD, available: true },
          ],
        });
      }
      const namesLD = paidLD.paidCards.map(id => ctx.cardMap.get(getCardNum(id))?.CardName ?? id).join('・');
      const ctxLD = { ...addLog(setOwnerState(a.target.owner, paidLD.state, ctx), `${namesLD}をダウン`),
        lastProcessedCards: paidLD.paidCards };
      const singleLevelLD = paidLD.paidCards.length === 1
        ? parseInt(ctx.cardMap.get(getCardNum(paidLD.paidCards[0]))?.Level ?? '', 10) : NaN;
      return done({ ...ctxLD, seqVars: {
        ...ctxLD.seqVars,
        ...(isNaN(singleLevelLD) ? {} : { lastDownedLrigLevel: singleLevelLD }),
        lastDownedLrigLevelSum: paidLD.levelSum,
      } });
    }
    // 「アップ状態のルリグをダウン」＝既にダウン済み（アップでない）ならダウンするものがない＝no-op。
    // lastProcessedCards を空にして後続の「この方法でダウンしたルリグと共通する色」等の did-it を不成立にする。
    if (state.field.lrig_down) {
      return done({ ...addLog(ctx, 'ルリグは既にダウン状態'), lastProcessedCards: [] });
    }
    // 「ダウンしてもよい」＝ダウン/スキップの二択（スキップ時は INTERNAL_SKIP が lastProcessedCards を空にする）。
    if (a.optional) {
      const downNow = { ...a, optional: false } as DownAction;
      const skip = { type: 'STUB', id: 'INTERNAL_SKIP_OPTIONAL_ACTION' } as import('../types/effects').StubAction;
      return needsInteraction(addLog(ctx, 'ルリグをダウンしますか？'), {
        type: 'CHOOSE', count: 1,
        options: [
          { id: 'down', label: 'ダウンする', action: downNow, available: true },
          { id: 'skip', label: 'スキップ', action: skip, available: true },
        ],
      });
    }
    const lrigCardNum = lrigTopId ? getCardNum(lrigTopId) : undefined;
    const lrigCard = lrigCardNum ? ctx.cardMap.get(lrigCardNum) : undefined;
    const lrigLevel = lrigCard ? parseInt(lrigCard.Level ?? '', 10) : NaN;
    const newS: PlayerState = { ...state, field: { ...state.field, lrig_down: true } };
    const lrigName = lrigCard?.CardName ?? 'ルリグ';
    // ダウンしたルリグ自身を lastProcessedCards に記録（「この方法でダウンしたルリグと共通する色を持つカード」
    // 等の後続動的フィルタ／条件が参照する。従来は seqVars.lastDownedLrigLevel のみで色参照ができなかった）。
    const newCtx = { ...addLog(setOwnerState(a.target.owner, newS, ctx), `${lrigName}をダウン`),
      lastProcessedCards: lrigTopId ? [lrigTopId] : [] };
    return done(!isNaN(lrigLevel)
      ? { ...newCtx, seqVars: { ...newCtx.seqVars, lastDownedLrigLevel: lrigLevel } }
      : newCtx);
  }
  // PREVENT_SIGNI_DOWN_BY_OPP (state flag) または CONT保護効果によりダウン無効
  if (a.target.owner === 'opponent' && ctx.otherState.prevent_signi_down_by_opp) {
    return done(addLog(ctx, 'シグニダウン防止（常時効果）'));
  }
  // 'any' は両側が候補になりうるため、相手側だけに効く保護は候補フィルタ側で効かせる
  const downProtected = a.target.owner !== 'self' ? new Set(ctx.otherDownProtectedNums ?? []) : new Set<string>();
  // keyword_grants  PROTECTION:DOWN:opponent
  if (a.target.owner !== 'self') {
    const grants = ctx.otherState.keyword_grants ?? {};
    for (const [cardNum, kws] of Object.entries(grants)) {
      if (kws.some(kw => kw.startsWith('PROTECTION:') && (kw.includes('DOWN') || kw.includes('any')) && kw.endsWith(':opponent'))) {
        downProtected.add(cardNum);
      }
    }
  }
  // frontOfSelf: 効果元シグニの正面（相手ゾーン 2-zi）のシグニに限定（WDA-F02-17-E2「このシグニの正面のシグニ」）。
  //   execBanish（208-225）と同型＝filter から剥がして frontRestrict で絞る。
  let downFilter = a.target.filter;
  let frontRestrict: string[] | null = null;
  let downThisCardRestrict: string[] | null = null;
  if (downFilter?.thisCardOnly) {
    const { thisCardOnly: _t, ...rest } = downFilter;
    downFilter = rest;
    downThisCardRestrict = ctx.sourceCardNum ? [ctx.sourceCardNum] : [];
  }
  if (downFilter?.frontOfSelf) {
    const { frontOfSelf: _f, ...rest } = downFilter;
    downFilter = rest;
    if (a.target.owner === 'opponent' && ctx.sourceCardNum) {
      const zi = ctx.ownerState.field.signi.findIndex(s => s?.at(-1) === ctx.sourceCardNum);
      const frontNum = zi >= 0 ? ctx.otherState.field.signi[2 - zi]?.at(-1) : undefined;
      frontRestrict = frontNum ? [frontNum] : [];
    } else {
      frontRestrict = [];
    }
  }
  // owner:'any'（修飾語なし「シグニ1体を対象とし」）は両フィールドから候補を集める（タスク12(lii)）
  const { cands: rawCands, scope } = fieldCandidatesByOwner(a.target.owner, downFilter, ctx);
  let cands = rawCands;
  if (downProtected.size > 0) cands = cands.filter(n => !downProtected.has(n));
  // targetsStored: 先行の SELECT_TARGET_ONLY で固定した対象だけに絞る（「それをダウンする」。タスク12(lxiv)）
  if (a.targetsStored) cands = cands.filter(n => (ctx.storedTargetCards ?? []).includes(n));
  if (frontRestrict !== null) cands = cands.filter(n => frontRestrict!.includes(n));
  if (downThisCardRestrict !== null) cands = cands.filter(n => downThisCardRestrict!.includes(n));

  function applyDown(selected: string[], c: ExecCtx): ExecCtx {
    let cur = c;
    for (const num of selected) {
      const own: Owner = a.target.owner === 'any' ? sideOfFieldCard(num, cur) : a.target.owner;
      const s = ownerState(own, cur);
      const zoneIdx = s.field.signi.findIndex(st => st?.at(-1) === num);
      if (zoneIdx < 0) continue;
      const newDown = [...(s.field.signi_down ?? [false, false, false])] as boolean[];
      newDown[zoneIdx] = true;
      cur = addLog(setOwnerState(own,
        { ...s, field: { ...s.field, signi_down: newDown } }, cur),
        `${cur.cardMap.get(num)?.CardName ?? num}をダウン`);
    }
    return cur;
  }

  // 「レベルの合計がN以下になるようにM体まで」: BANISH/SEND_TO_ENERGY と同じ
  // SELECT_TARGET metadata を渡し、resumeSelectTarget の再検証も必ず通す。
  if (a.target.totalLevelMax !== undefined) {
    if (cands.length === 0) return done({ ...ctx, lastProcessedCards: [] });
    const candidateLevels: Record<string, number> = {};
    for (const n of cands) candidateLevels[n] = parseInt(ctx.cardMap.get(n)?.Level ?? '0', 10) || 0;
    const maxPick = typeof a.target.count === 'number' ? Math.min(a.target.count, cands.length) : cands.length;
    return selectOrInteract(cands, maxPick, true, scope, a, undefined, ctx, false, {
      totalLevelMax: a.target.totalLevelMax,
      candidateLevels,
    });
  }
  // 「レベル合計が直前に処理した枚数と同じになるように好きな数」。ref は pending を作る前に
  // 固定値へ解決し、UI/CPU/resume の既存 SelectionConstraint 検証へそのまま渡す。
  const exactRef = a.target.selectionConstraint?.totalLevelExactRef;
  if (exactRef !== undefined) {
    const exact = resolveCountRef(exactRef, ctx);
    if (exact <= 0) return done({ ...addLog(ctx, '動的レベル合計0（処理なし）'), lastProcessedCards: [] });
    if (cands.length === 0) return done({ ...ctx, lastProcessedCards: [] });
    const { totalLevelExactRef: _ref, ...restConstraint } = a.target.selectionConstraint!;
    return selectOrInteract(cands, cands.length, true, scope, a, undefined, ctx, false, {
      selectionConstraint: { ...restConstraint, totalLevelExact: exact },
    });
  }
  if (a.target.count === 'ALL') return done({ ...applyDown(cands, ctx), lastProcessedCards: cands });
  if (downThisCardRestrict !== null) {
    return done({ ...applyDown(cands, ctx), lastProcessedCards: cands });
  }
  const count = resolveCountRef(a.target.count, ctx, a.target.countFromZone);
  if (count <= 0) return done({ ...addLog(ctx, 'ダウン数0（処理なし）'), lastProcessedCards: [] });
  // optional:「ダウンしてもよい」（スキップ可。スキップ時は resumeSelectTarget が後続の「そうした場合」を除去）
  const downOptional = a.optional || (a.target.upToCount ?? false);
  return selectOrInteract(cands, count, downOptional, scope, a, undefined, ctx);
}

function execUp(a: UpAction, ctx: ExecCtx): ExecResult {
  if (a.target.type === 'LRIG') {
    const s = ownerState(a.target.owner, ctx);
    const lrigName = s.field.lrig?.length
      ? (ctx.cardMap.get(getCardNum(s.field.lrig.at(-1) ?? ''))?.CardName ?? 'ルリグ')
      : '';
    // 「あなたの**すべての**ルリグをアップする」（続き634・`WX25-P2-048-E1`）＝センターだけでなく
    // **アシストルリグ2枠**も起こす。⚠`count:'ALL'` はここでしか消費されない＝parser 側だけ直しても
    // 挙動は変わらない（§5-14 の死フラグ）。既定（`count:1` ほか）は**従来どおりセンターだけ**。
    const upAllLrig = a.target.count === 'ALL';
    const newS: PlayerState = {
      ...s,
      field: {
        ...s.field,
        lrig_down: false,
        ...(upAllLrig ? { assist_lrig_l_down: false, assist_lrig_r_down: false } : {}),
      },
    };
    return done(addLog(setOwnerState(a.target.owner, newS, ctx),
      upAllLrig ? 'すべてのルリグをアップ' : `${lrigName}をアップ`));
  }
  // owner:'any'（修飾語なし「シグニ1体を対象とし」）は両フィールドから候補を集める（タスク12(lii)）
  const { cands: rawCandsUp, scope } = fieldCandidatesByOwner(a.target.owner, a.target.filter, ctx);
  // targetsStored: 先行の SELECT_TARGET_ONLY で固定した対象だけに絞る（「それをアップする」。タスク12(lxiv)）
  const cands = a.targetsStored ? rawCandsUp.filter(n => (ctx.storedTargetCards ?? []).includes(n)) : rawCandsUp;
  const state = ownerState(a.target.owner === 'any' ? 'self' : a.target.owner, ctx);
  // thisCardOnly: 効果元シグニ自身のみ（「このシグニをアップする」。WX16-Re07/G145等）→ 選択不要で即アップ
  if (a.target.filter?.thisCardOnly) {
    const selfNum = (ctx.sourceCardNum && state.field.signi.some(s => s?.at(-1) === ctx.sourceCardNum))
      ? [ctx.sourceCardNum] : [];
    return done(applyUp(selfNum, ctx));
  }
  // targetsTriggerSource: 「それ」= トリガー元シグニ（ダウン状態で場に出たそのシグニ）を無選択でアップ（G144）
  if (a.targetsTriggerSource) {
    const autoNum = ctx.triggeringCardNum ?? ctx.sourceCardNum;
    if (autoNum && state.field.signi.some(s => s?.at(-1) === autoNum)) {
      return done(applyUp([autoNum], ctx));
    }
    return done(ctx);
  }
  // targetsBattleAttacker: 「そのアタックしているシグニ」= バトルを行ったアタッカー自身を無選択でアップ（ON_SIGNI_BANISH_OPPONENT
  // any_ally 等・能力ホスト＝topNumBB とアタッカーが別カードになりうるため sourceCardNum は使えない。WX17-032）
  if (a.targetsBattleAttacker) {
    const autoNum = ctx.battleAttackerCardNum;
    if (autoNum && state.field.signi.some(s => s?.at(-1) === autoNum)) {
      return done(applyUp([autoNum], ctx));
    }
    return done(ctx);
  }
  function applyUp(selected: string[], c: ExecCtx): ExecCtx {
    let cur = c;
    for (const num of selected) {
      const own: Owner = a.target.owner === 'any' ? sideOfFieldCard(num, cur) : a.target.owner;
      const s = ownerState(own, cur);
      const zoneIdx = s.field.signi.findIndex(st => st?.at(-1) === num);
      if (zoneIdx < 0) continue;
      const wasDown = (s.field.signi_down ?? [])[zoneIdx] === true; // 効果でダウン→アップした記録（THIS_CARD_UPPED_FROM_DOWN_THIS_TURN。WX14-070）
      const newDown = [...(s.field.signi_down ?? [false, false, false])] as boolean[];
      newDown[zoneIdx] = false;
      cur = addLog(setOwnerState(own,
        { ...s, field: { ...s.field, signi_down: newDown },
          ...(wasDown ? { upped_from_down_this_turn: [...(s.upped_from_down_this_turn ?? []), num] } : {}) }, cur),
        `${cur.cardMap.get(num)?.CardName ?? num}をアップ`);
    }
    return cur;
  }

  if (a.target.count === 'ALL') {
    // `count:'ALL'` + `upToCount` ＝「（該当するシグニを）好きな数アップして**もよい**」＝0体も選べる
    // （§6.4 O-8(b)・`SELECT_TARGET_ONLY` / `execTrash` の手札版と同規約）。
    // ⚠これが無いと `applyUp(cands)` が**全部を無選択でアップ**する＝任意性が消える。
    if (a.target.upToCount) {
      if (cands.length === 0) return done(addLog(ctx, 'アップできる対象がない'));
      return selectOrInteract(cands, cands.length, true, scope, a, undefined, ctx);
    }
    return done(applyUp(cands, ctx));
  }
  const count = resolveCountRef(a.target.count, ctx, a.target.countFromZone);
  if (count <= 0) return done({ ...addLog(ctx, 'アップ数0（処理なし）'), lastProcessedCards: [] });
  return selectOrInteract(cands, count, a.target.upToCount ?? false, scope, a, undefined, ctx);
}

const BLOCK_ACTION_LABELS: Record<string, string> = {
  ARTS: 'アーツ使用封じ',
  USE_ARTS: 'アーツ使用封じ',
  ARTS_AND_SPELL: 'アーツ・スペル使用封じ',
  ARTS_LIMIT_1: 'アーツ使用1回制限',
  USE_ARTS_EXCEPT_OPP_TURN: '自分のターン以外アーツ使用封じ',
  GROW: 'グロウ封じ',
  SELF_SIGNI_TRASH: '自シグニトラッシュ封じ',
  ATTACK_SIGNI_SELF: 'シグニアタック封じ（自）',
  SIGNI_ATTACK_PHASE: 'シグニアタックフェイズスキップ',
  SIGNI_ATTACK_STEP: 'シグニアタックステップ封じ',
  SIGNI_ACTIVATED_ABILITY: 'シグニ起動能力封じ',
  USE_LRIG_ACT: 'ルリグ起動能力封じ',
  PAY_ENERGY_COST: 'エナコスト支払い封じ',
  PLAY_SIGNI_NOT_FROM_HAND: '手札以外からのシグニ出し封じ',
  NEGATE_NEXT_SIGNI_ATTACK: '次のシグニアタック無効',
  ENCORE: 'アンコール封じ',
  BET: 'ベット封じ',
};

function execBlockAction(a: BlockActionAction, ctx: ExecCtx): ExecResult {
  if (a.actionId === 'GUARD' && a.until === 'END_OF_ATTACK') {
    return done(addLog({ ...ctx, ownerState: { ...ctx.ownerState, prevent_opp_guard: true } },
      '相手はこのアタックの間【ガード】できない'));
  }
  // §6.4 O-41: レベルが**実行時にしか決まらない**ガード制限。
  //   `GUARD_LV_DECLARED`    ＝「対戦相手は宣言された数字と同じレベルのシグニで【ガード】ができない」
  //   `GUARD_LV_LAST_DOWNED` ＝「対戦相手はこの方法でダウンしたシグニと同じレベルのシグニで【ガード】ができない」
  // ⚠**書き込み先は効果元（`ctx.ownerState`）**＝`GuardResponseDialog` は防御側から見た
  //   `op.declared_guard_restrict_levels` を読む。`a.target.owner`（＝相手）側に書くと誰も読まない。
  // ⚠**レベルが確定しないときは制限を課さない**（fail-open ではなく「制限なし」）＝
  //   ここで素の `GUARD` に倒すと「ガードそのものができない」に化ける（この機構が直した過剰実行そのもの）。
  if (a.actionId === 'GUARD_LV_DECLARED' || a.actionId === 'GUARD_LV_LAST_DOWNED') {
    const levelOf = (cn: string): number => parseInt(ctx.cardMap.get(cn)?.Level ?? '', 10);
    const found = a.actionId === 'GUARD_LV_DECLARED'
      ? [ctx.ownerState.declared_number ?? ctx.ownerState.declared_guard_restrict_level]
      : (ctx.lastProcessedCards ?? []).map(levelOf);
    const levels = found.filter((n): n is number => typeof n === 'number' && Number.isFinite(n));
    if (levels.length === 0) return done(addLog(ctx, 'ガード制限のレベルが未確定＝制限は課されない'));
    const merged = [...new Set([...(ctx.ownerState.declared_guard_restrict_levels ?? []), ...levels])];
    return done(addLog({ ...ctx, ownerState: { ...ctx.ownerState, declared_guard_restrict_levels: merged } },
      `対戦相手はレベル${levels.join('・')}のシグニで【ガード】ができない`));
  }
  // シグニへのアタックブロック（ATTACK）は keyword_grants 経由で処理する。
  // blocked_actions に 'ATTACK'（カードIDなし）で追加しても CPU の
  // 'ATTACK:${topId}' チェックと一致しないため。また、CPU ターン開始の
  // UPフェイズで otherState.blocked_actions がリセットされる問題も回避する。
  if (a.target.type === 'SIGNI' && a.actionId === 'ATTACK') {
    const tgtOwner: Owner = a.target.owner === 'self' ? 'self' : 'opponent';
    const tgtState = ownerState(tgtOwner, ctx);
    // §6.4 O-16:「（指定した）そのシグニゾーンにあるシグニでアタックできない」＝**ゾーン継続**。
    // per-signi 付与では**そのゾーンに後から出たシグニ**に効かない（ゾーンを封じる原文の意図が死ぬ）。
    // POWER_MODIFY / REMOVE_ABILITIES と同じ形で場レベル grant に載せる。
    if (a.target.zoneSource === 'designated' && a.target.count === 'ALL') {
      const grantBA: FieldGrant = { kind: 'blockAction', actionId: 'ATTACK', filter: a.target.filter };
      // 「次の対戦相手のターンの間」＝**対象（相手）自身の次のターン**に有効化する予約。
      // それ以外（「このターン」）は現ターンの active grant。
      const { ctx: curBA, touched: touchedBA } = a.until === 'NEXT_TURN'
        ? (() => { const r = reserveFieldGrant(a.target, grantBA, tgtOwner, ctx); return { ctx: r.ctx, touched: r.reserved }; })()
        : (() => { const r = applyActiveFieldGrant(a.target, grantBA, ctx); return { ctx: r.ctx, touched: r.applied }; })();
      return done(addLog(curBA, touchedBA
        ? `指定シグニゾーンのシグニはアタックできない${a.until === 'NEXT_TURN' ? '（次のターンの間）' : '（このターン）'}`
        : '指定されたシグニゾーンがない'));
    }
    const untilLbl = a.until === 'END_OF_TURN' ? '（ターン終了時まで）' : a.until === 'NEXT_TURN' ? '（次の自分ターンまで）' : '';
    // 解除コストつき制限は対象側 state の per-signi 予約へ格納する。
    // keyword_grants の「アタックできない」は UI の継続判定しか見ないため、共通実行経路と CPU に届かない。
    const applyAttackCost = (targets: string[], c: ExecCtx): ExecResult => {
      const count = a.attackCost?.fieldTrash.count ?? 0;
      if (targets.length === 0 || count <= 0) return done(c);
      const state = ownerState(tgtOwner, c);
      const costs = { ...(state.signi_attack_field_trash_costs ?? {}) };
      for (const cn of targets) costs[cn] = Math.max(costs[cn] ?? 0, count);
      return done(addLog(setOwnerState(tgtOwner, { ...state, signi_attack_field_trash_costs: costs }, c),
        `${targets.map(cn => c.cardMap.get(cn)?.CardName ?? cn).join('・')}は他のシグニ${count}体を場からトラッシュに置かなければアタックできない${untilLbl}`));
    };
    // 無条件のアタック不可付与は効果元（ctx.ownerState）の keyword_grants にカード番号キーで格納する
    // （effectEngine.ts の判定が host/guest 両者の keyword_grants を攻撃シグニの cardNum で参照するため、
    //  相手シグニへの付与も効果元側に置いてよい）。
    const applyAttackBlock = (targets: string[], c: ExecCtx): ExecResult => {
      if (targets.length === 0) return done(c);
      if (a.attackCost?.fieldTrash) return applyAttackCost(targets, c);
      const grants = { ...(c.ownerState.keyword_grants ?? {}) };
      for (const cn of targets) grants[cn] = [...new Set([...(grants[cn] ?? []), 'アタックできない'])];
      return done(addLog({ ...c, ownerState: { ...c.ownerState, keyword_grants: grants } },
        `${targets.map(cn => c.cardMap.get(cn)?.CardName ?? cn).join('・')}はアタックできない${untilLbl}`));
    };
    // 前段ステップで対象確定済み（lastProcessedCards）＝選択解決後の再入含む。そのまま付与する。
    if (ctx.lastProcessedCards && ctx.lastProcessedCards.length > 0) {
      return applyAttackBlock(ctx.lastProcessedCards.filter(cn => tgtState.field.signi.some(s => s?.at(-1) === cn)), ctx);
    }
    // filter（thisCardOnly=効果元自身のみ / excludeSelf）を適用して候補を絞る（続き103＝従来は count/filter を無視し全ブロック）。
    let blkFilter = a.target.filter;
    let blkThisCardRestrict: string[] | null = null;
    let blkExcludeSelf = false;
    if (blkFilter?.thisCardOnly) { const { thisCardOnly: _t, ...rest } = blkFilter; blkFilter = rest; blkThisCardRestrict = ctx.sourceCardNum ? [ctx.sourceCardNum] : []; }
    if (blkFilter?.excludeSelf) { const { excludeSelf: _e, ...rest } = blkFilter; blkFilter = rest; blkExcludeSelf = true; }
    // 動的フィルタ（levelLtOppLrig 等）を具体値へ解決してから候補を絞る（WXK11-003②）。
    // 解決しないと未知フラグが matchesFilter で無視され、全シグニへの過剰アタックブロックに化ける。
    if (blkFilter) {
      blkFilter = resolveDynamicFilter(blkFilter, ctx.ownerState, ctx.cardMap, ctx.otherState, ctx.lastProcessedCards, ctx.effectivePowers, ctx.sourceCardNum, ctx.triggeringCardNum);
    }
    let cands = fieldCandidates(tgtState, blkFilter, ctx.cardMap, ctx.effectivePowers, ctx.allColorSigniNums, ctx.fieldSigniExtraColors);
    if (blkThisCardRestrict) cands = cands.filter(n => blkThisCardRestrict!.includes(n));
    if (blkExcludeSelf && ctx.sourceCardNum) cands = cands.filter(n => n !== ctx.sourceCardNum);
    if (cands.length === 0) return done(ctx);
    // count 数値なら N 体選択（選択後は lastProcessedCards 経路で個別付与）。ALL/未指定は全候補へ。
    if (a.target.count !== undefined && a.target.count !== 'ALL') {
      const count = resolveNum(a.target.count);
      const scope: TargetScope = tgtOwner === 'self' ? 'self_field' : 'opp_field';
      return selectOrInteract(cands, count, a.target.upToCount ?? false, scope, a, undefined, ctx);
    }
    return applyAttackBlock(cands, ctx);
  }

  const state = ownerState(a.target.owner, ctx);
  if (a.actionId === 'ON_PLAY_ABILITY' && a.suppressSigniOnPlayThisTurn) {
    const newS: PlayerState = { ...state, suppress_signi_on_play_this_turn: true };
    const who = a.target.owner === 'self' ? '自分' : '相手';
    return done(addLog(setOwnerState(a.target.owner, newS, ctx), `${who}のシグニの【出】能力はこのターン発動しない`));
  }
  // NEXT_TURN  ':NEXT_TURN'
  const id = a.until === 'NEXT_TURN' ? `${a.actionId}:NEXT_TURN` : a.actionId;
  const blocked = [...(state.blocked_actions ?? []), id];
  const newS: PlayerState = { ...state, blocked_actions: blocked };
  const baseId = a.actionId
    .replace(/^PLAY_SIGNI_POWER_(\d+)_OR_MORE$/, 'パワー$1以上のシグニ出し封じ')
    // §6.4 O-41: レベル限定つきガード禁止（`GUARD_MAX_LV<n>` ＝n以下／`GUARD_LV<n>[_<m>…]` ＝ちょうど・列挙）。
    .replace(/^GUARD_MAX_LV(\d+)$/, 'レベル$1以下のシグニでガード封じ')
    .replace(/^GUARD_LV(\d+(?:_\d+)*)$/, (_m, lv: string) => `レベル${lv.split('_').join('・')}のシグニでガード封じ`);
  const label = BLOCK_ACTION_LABELS[baseId] ?? baseId;
  const who = a.target.owner === 'self' ? '自分' : '相手';
  const until = a.until === 'END_OF_TURN' ? '（ターン終了時まで）' : a.until === 'NEXT_TURN' ? '（次の自分ターンまで）' : '';
  return done(addLog(setOwnerState(a.target.owner, newS, ctx), `${who}：${label}${until}`));
}

function execStoryChange(a: StoryChangeAction, ctx: ExecCtx): ExecResult {
  const tgt = a.target;
  const state = ownerState(tgt.owner, ctx);
  const cands = fieldCandidates(state, tgt.filter, ctx.cardMap, ctx.effectivePowers, ctx.allColorSigniNums, ctx.fieldSigniExtraColors);

  function applyStory(selected: string[], c: ExecCtx): ExecCtx {
    const s = ownerState(tgt.owner, c);
    const overrides = { ...(s.story_overrides ?? {}) };
    for (const n of selected) overrides[n] = a.newStory;
    return addLog(setOwnerState(tgt.owner, { ...s, story_overrides: overrides }, c),
      `${selected.map(n => c.cardMap.get(n)?.CardName ?? n).join('・')}のストーリーを${a.newStory}に変更`);
  }

  if (tgt.count === 'ALL') return done(applyStory(cands, ctx));
  const count = resolveNum(tgt.count);
  const scope: TargetScope = tgt.owner === 'self' ? 'self_field' : 'opp_field';
  return selectOrInteract(cands, count, false, scope, a, undefined, ctx);
}

function resolveDynamicShadowKeyword(kw: string, ctx: ExecCtx): string {
  if (!kw.startsWith('シャドウ:')) return kw;
  const scope = decodeShadowKeyword(kw);
  if (!scope) return kw;
  if (scope.downerLrigLevel) {
    // ⚠ `seqVars` は**インタラクションを跨げない**（実UIの resume は ExecCtx を作り直し seqVars を渡さない）。
    //   「ダウンしてもよい」→ CHOOSE を挟む札（WX24-P1-040-E2）は seqVars が必ず消えるため、
    //   lastProcessedCards（同一 SEQUENCE 内の DOWN）→ PlayerState.last_lrig_down_cards（＝支払い/ダウンの
    //   単一入口が記録）の順にフォールバックする（タスク12(cix)）。取れなければ素の「シャドウ」＝全シグニ対象。
    const fromCards = (): number | undefined => {
      const top = ctx.lastProcessedCards?.[0];
      const ref = (top && ctx.cardMap.get(getCardNum(top))?.Type === 'ルリグ' ? top : undefined)
        ?? ctx.ownerState.last_lrig_down_cards?.[0];
      const lv = ref ? parseInt(ctx.cardMap.get(getCardNum(ref))?.Level ?? '', 10) : NaN;
      return isNaN(lv) ? undefined : lv;
    };
    const level = ctx.seqVars?.lastDownedLrigLevel ?? fromCards();
    return level !== undefined && !isNaN(level) ? encodeShadowKeyword({ levelEq: level }) : 'シャドウ';
  }
  if (scope.declaredNumberPowerEq) {
    const pw = ctx.seqVars?.declaredNumber;
    return pw !== undefined && !isNaN(pw) ? encodeShadowKeyword({ powerEq: pw }) : 'シャドウ';
  }
  return kw;
}

function execGrantKeyword(a: GrantKeywordAction, ctx: ExecCtx): ExecResult {
  const resolvedKeyword = resolveDynamicShadowKeyword(a.keyword, ctx);
  const a2 = resolvedKeyword !== a.keyword ? { ...a, keyword: resolvedKeyword } : a;
  a = a2;
  // targetsLastProcessed:「それ」= 直前に選択/処理したシグニ(lastProcessedCards)へ付与（WX03-046「打突」。選択UIを出さず同一対象に付与）
  if (a.targetsLastProcessed) {
    const gkey = a.duration === 'UNTIL_OPP_TURN_END' ? 'keyword_grants_until_opp_turn' : 'keyword_grants';
    let cur = ctx;
    for (const cn of ctx.lastProcessedCards ?? []) {
      let owner: Owner | null = null;
      if (cur.ownerState.field.signi.some(s => s?.at(-1) === cn)) owner = 'self';
      else if (cur.otherState.field.signi.some(s => s?.at(-1) === cn)) owner = 'opponent';
      if (!owner) continue;
      const s = ownerState(owner, cur);
      if (isKeywordAbilityRemoved(cn, a.keyword, s.keyword_abilities_removed)) continue;
      const grants = { ...(s[gkey] ?? {}) };
      grants[cn] = [...new Set([...(grants[cn] ?? []), a.keyword])];
      cur = addLog(setOwnerState(owner, { ...s, [gkey]: grants }, cur),
        `${a.keyword}：${cur.cardMap.get(cn)?.CardName ?? cn}`);
    }
    return done(cur);
  }
  // targetsTriggerSource:「このシグニ/それ」= トリガー元シグニ（triggeringCardNum→sourceCardNum）へ無選択付与（ON_ZONE_MOVED self 等）
  if (a.targetsTriggerSource) {
    const autoNum = ctx.triggeringCardNum ?? ctx.sourceCardNum;
    if (!autoNum) return done(ctx);
    let owner: Owner | null = null;
    if (ctx.ownerState.field.signi.some(s => s?.at(-1) === autoNum)) owner = 'self';
    else if (ctx.otherState.field.signi.some(s => s?.at(-1) === autoNum)) owner = 'opponent';
    if (!owner) return done(ctx);
    const gkey = a.duration === 'UNTIL_OPP_TURN_END' ? 'keyword_grants_until_opp_turn' : 'keyword_grants';
    const s = ownerState(owner, ctx);
    if (isKeywordAbilityRemoved(autoNum, a.keyword, s.keyword_abilities_removed)) return done(ctx);
    const grants = { ...(s[gkey] ?? {}) };
    grants[autoNum] = [...new Set([...(grants[autoNum] ?? []), a.keyword])];
    return done(addLog(setOwnerState(owner, { ...s, [gkey]: grants }, ctx),
      `${ctx.cardMap.get(autoNum)?.CardName ?? autoNum}に「${a.keyword}」を付与`));
  }
  const tgt = a.target;
  if (a.duration === 'NEXT_TURN') {
    const reservation = reserveFieldGrant(tgt, {
      kind: 'keyword', keyword: a.keyword, filter: tgt.filter, condition: a.fieldCondition,
    }, a.nextTurnOwner, ctx);
    if (reservation.reserved) {
      ctx = addLog(reservation.ctx,
        `次の${reservation.activeOwner === 'opponent' ? '対戦相手の' : '自分の'}ターンの間、場のシグニが【${a.keyword}】を得る`);
      if (!a.appliesThisTurn) return done(ctx);
    }
  }
  const tgtOwner: Owner = tgt.owner === 'any' ? 'opponent' : tgt.owner as Owner;
  const state = ownerState(tgtOwner, ctx);

  const abilityGainBlocked = tgtOwner === 'opponent' ? new Set(ctx.otherAbilityGainProtectedNums ?? []) : new Set<string>();

  let cands: string[];
  if (tgt.type === 'LRIG') {
    // ルリグ対象：センタールリグトップを直接付与（ユーザー選択不要）
    const lrigTop = state.field.lrig.at(-1);
    cands = lrigTop ? [lrigTop] : [];
  } else if (tgt.type === 'CENTER_LRIG_OR_SIGNI') {
    // センタールリグとシグニ両方を候補に追加
    const lrigTop = state.field.lrig.at(-1);
    const signiCands = fieldCandidates(state, tgt.filter, ctx.cardMap, ctx.effectivePowers, ctx.allColorSigniNums, ctx.fieldSigniExtraColors)
      .filter(n => !abilityGainBlocked.has(n));
    cands = lrigTop ? [lrigTop, ...signiCands] : signiCands;
  } else {
    // 動的フィルタ（levelLtOppLrig/levelLtSelf 等）を具体値へ解決してから候補を絞る（付与も除去系と同じ resolve 経路に乗せる）
    const gkResolvedFilter = resolveDynamicFilter(tgt.filter, ctx.ownerState, ctx.cardMap, ctx.otherState, ctx.lastProcessedCards, ctx.effectivePowers, ctx.sourceCardNum, ctx.triggeringCardNum);
    cands = fieldCandidates(state, gkResolvedFilter, ctx.cardMap, ctx.effectivePowers, ctx.allColorSigniNums, ctx.fieldSigniExtraColors)
      .filter(n => !abilityGainBlocked.has(n));
    cands = filterCandidatesToTargetZone(cands, tgt, state);
    // thisCardOnly: 効果元シグニ自身のみへ付与（「このシグニは【X】を得る」）
    if (tgt.filter?.thisCardOnly) {
      cands = (ctx.sourceCardNum && cands.includes(ctx.sourceCardNum)) ? [ctx.sourceCardNum] : [];
    }
    // excludeSelf: 効果元シグニ自身を対象から除外（「あなたの他のシグニ1体を対象とし…【シャドウ】を得る」WXDi-P11-040）。
    // 未実装だと他に味方シグニが居ないとき自分自身に付いてしまう（続き72の実機観測・続き75で修正）。
    if (tgt.filter?.excludeSelf && ctx.sourceCardNum) {
      cands = cands.filter(n => n !== ctx.sourceCardNum);
    }
    // 対象宣言の後に任意コストを挟む形は lastProcessedCards が支払いカードで上書きされるため、
    // STORE_LAST_PROCESSED_TARGETS が保持した同一対象だけへ付与する。
    if (a.targetsStored) cands = cands.filter(n => (ctx.storedTargetCards ?? []).includes(n));
  }

  function applyGrant(selected: string[], c: ExecCtx): ExecCtx {
    const s = ownerState(tgtOwner, c);
    // UNTIL_OPP_TURN_END は長期ストア keyword_grants_until_opp_turn へ（次の相手ターン終了時＝付与者の次ターン開始時までクリアされない）。
    // 通常の keyword_grants は付与者のターン終了時にクリアされるため、ターン終了時付与は必ずこちらを使う。
    const gkey = a.duration === 'UNTIL_OPP_TURN_END' ? 'keyword_grants_until_opp_turn' : 'keyword_grants';
    const grants = { ...(s[gkey] ?? {}) };
    const grantable = selected.filter(n => !isKeywordAbilityRemoved(n, a.keyword, s.keyword_abilities_removed));
    for (const n of grantable) {
      grants[n] = [...(grants[n] ?? []), a.keyword];
    }
    let newS: PlayerState = { ...s, [gkey]: grants };

    // チアガールはフリーゾーンへ移動
    if (a.keyword === 'チアガール') {
      for (const n of grantable) {
        const zoneIdx = newS.field.signi.findIndex(stack => stack?.at(-1) === n);
        if (zoneIdx >= 0) {
          const newSigni = [...newS.field.signi] as (string[] | null)[];
          newSigni[zoneIdx] = null;
          const newFreeZone = [...(newS.field.free_zone ?? []), n];
          newS = { ...newS, field: { ...newS.field, signi: newSigni, free_zone: newFreeZone } };
        }
      }
    }

    return addLog(setOwnerState(tgtOwner, newS, c),
      grantable.length > 0
        ? `${grantable.map(n => c.cardMap.get(n)?.CardName ?? n).join('・')}に「${a.keyword}」を付与`
        : `【${a.keyword}】は新たに得られない`);
  }

  // 「レベルの合計がN以下になるように好きな数」: count:'ALL' の自動全付与より先に
  // 選択へ落とす。上限を無視した外部応答も resumeSelectTarget が再検証する。
  if (tgt.totalLevelMax !== undefined) {
    if (cands.length === 0) return done({ ...ctx, lastProcessedCards: [] });
    const candidateLevels: Record<string, number> = {};
    for (const n of cands) candidateLevels[n] = parseInt(ctx.cardMap.get(n)?.Level ?? '0', 10) || 0;
    const maxPick = typeof tgt.count === 'number' ? Math.min(tgt.count, cands.length) : cands.length;
    const scope: TargetScope = tgtOwner === 'self' ? 'self_field' : 'opp_field';
    return selectOrInteract(cands, maxPick, true, scope, a, undefined, ctx, false, {
      totalLevelMax: tgt.totalLevelMax,
      candidateLevels,
    });
  }
  // LRIGは選択UIを出さず自動付与
  if (tgt.type === 'LRIG') return cands.length > 0 ? done(applyGrant(cands, ctx)) : done(ctx);
  if (a.targetsStored || tgt.count === 'ALL') return done(applyGrant(cands, ctx));
  const count = resolveNum(tgt.count);
  // 「このシグニ」: フィルターなし or thisCardOnly・sourceCardNum が候補に含まれていれば自動適用（選択UIを出さない）
  // ⚠「フィルタ無し」を「このシグニ」と読む既定は、原文「あなたのシグニ１体を**対象とし**」が生む
  //   `{owner:'self',count:1}` と**見分けがつかない**＝プレイヤーが選べるはずの対象を選べなくなる。
  //   parser が刻む `explicitTarget` を opt-out にする（§6.4 O-61・`WX25-P3-059-E1` の実機観測）。
  if ((!tgt.filter || tgt.filter.thisCardOnly) && !tgt.explicitTarget
      && ctx.sourceCardNum && cands.includes(ctx.sourceCardNum)) {
    return done(applyGrant([ctx.sourceCardNum], ctx));
  }
  const scope: TargetScope = tgtOwner === 'self' ? 'self_field' : 'opp_field';
  // 「N体**まで**を対象とし」＝上限（0体でもよい）。第3引数を `false` に固定していたため、
  // parser が `upToCount` を載せても**死にフラグ**で N体の強制選択のままだった（続き377m の実測）。
  // BANISH（`:516`）と同じく `upToCount` を optional として渡す（GRANT_KEYWORD に `optional` フィールドは無い）。
  return selectOrInteract(cands, count, tgt.upToCount ?? false, scope, a, undefined, ctx, false,
    { selectionConstraint: tgt.selectionConstraint });
}

function execGrantEffect(a: GrantEffectAction, ctx: ExecCtx): ExecResult {
  // rawText 未展開（パース失敗の PARTIAL 温存）＝付与内容が無いので no-op
  if (!a.effect) return done(ctx);
  const grantEff: CardEffect = a.effect;
  // targetsLastProcessed:「それ」= 直前に選択/処理したシグニ(lastProcessedCards)へ付与（WX04-094。選択UIを出さず同一対象に付与）
  if (a.targetsLastProcessed) {
    const key = a.duration === 'UNTIL_OPP_TURN_END' ? 'granted_effects_until_opp_turn' : 'granted_effects';
    let cur = ctx;
    for (const cn of ctx.lastProcessedCards ?? []) {
      let owner: Owner | null = null;
      if (cur.ownerState.field.signi.some(s => s?.at(-1) === cn)) owner = 'self';
      else if (cur.otherState.field.signi.some(s => s?.at(-1) === cn)) owner = 'opponent';
      if (!owner) continue;
      const s = ownerState(owner, cur);
      const granted = { ...(s[key] ?? {}) };
      granted[cn] = [...(granted[cn] ?? []), grantEff];
      const effectLabel = (grantEff as { effectType?: string })?.effectType ?? '効果';
      cur = addLog(setOwnerState(owner, { ...s, [key]: granted }, cur),
        `${cur.cardMap.get(cn)?.CardName ?? cn}に${effectLabel}を付与`);
    }
    return done(cur);
  }
  const tgt = a.target;
  const state = ownerState(tgt.owner, ctx);
  // LRIG / CENTER_LRIG_OR_SIGNI 対象（execGrantKeyword と同ロジック。fieldCandidates はシグニ限定のため）
  let cands: string[];
  if (tgt.type === 'LRIG') {
    // ルリグ対象：センタールリグトップへ直接付与（ユーザー選択不要）
    const lrigTop = state.field.lrig.at(-1);
    cands = lrigTop ? [lrigTop] : [];
  } else if (tgt.type === 'CENTER_LRIG_OR_SIGNI') {
    const lrigTop = state.field.lrig.at(-1);
    const signiCands = fieldCandidates(state, tgt.filter, ctx.cardMap, ctx.effectivePowers, ctx.allColorSigniNums, ctx.fieldSigniExtraColors);
    cands = lrigTop ? [lrigTop, ...signiCands] : signiCands;
  } else {
    cands = fieldCandidates(state, tgt.filter, ctx.cardMap, ctx.effectivePowers, ctx.allColorSigniNums, ctx.fieldSigniExtraColors);
  }
  // thisCardOnly: 効果元自身のみへ付与（「このシグニ/このルリグは『…』を得る」。WXDi-CP02-084・WXDi-P16-039等）
  // シグニだけでなくセンタールリグ・アシストルリグも対象にする（アシストルリグの【出】が自身に能力を付与するケース）。
  if (tgt.filter?.thisCardOnly) {
    const src = ctx.sourceCardNum;
    const inSelfZone = !!src && (
      state.field.signi.some(s => s?.at(-1) === src) ||
      state.field.lrig.at(-1) === src ||
      state.field.assist_lrig_l?.at(-1) === src ||
      state.field.assist_lrig_r?.at(-1) === src
    );
    cands = inSelfZone ? [src!] : [];
  }

  const untilOppTurn = a.duration === 'UNTIL_OPP_TURN_END';
  function applyGrant(selected: string[], c: ExecCtx): ExecCtx {
    const s = ownerState(tgt.owner, c);
    // UNTIL_OPP_TURN_END は長期ストア granted_effects_until_opp_turn へ（次の相手ターン終了時までクリアされない）
    const key = untilOppTurn ? 'granted_effects_until_opp_turn' : 'granted_effects';
    const granted = { ...(s[key] ?? {}) };
    for (const n of selected) {
      granted[n] = [...(granted[n] ?? []), grantEff];
    }
    const effectLabel = (grantEff as { effectType?: string })?.effectType ?? '効果';
    return addLog(setOwnerState(tgt.owner, { ...s, [key]: granted }, c),
      `${selected.map(n => c.cardMap.get(n)?.CardName ?? n).join('・')}に${effectLabel}を付与`);
  }

  // LRIG は選択UIを出さず自動付与（execGrantKeyword と同様）
  if (tgt.type === 'LRIG') return cands.length > 0 ? done(applyGrant(cands, ctx)) : done(ctx);
  if (tgt.count === 'ALL') return done(applyGrant(cands, ctx));
  // 「このシグニは「Q」を得る」＝thisCardOnly は**選択UIを出さず自動付与**（execGrantKeyword:3448 と同ロジック）。
  // ⚠ここが無いと `selectOrInteract` が候補1件でも必ず問いを出す＝「自分自身を選べ」という無意味な
  //   モーダルが挟まる（§6.4 O-25 で parser が GRANT_EFFECT{thisCardOnly} を作り始めたので必要になった）。
  if (tgt.filter?.thisCardOnly && ctx.sourceCardNum && cands.includes(ctx.sourceCardNum)) {
    return done(applyGrant([ctx.sourceCardNum], ctx));
  }
  const count = resolveNum(tgt.count);
  const scope: TargetScope = tgt.owner === 'self' ? 'self_field' : 'opp_field';
  return selectOrInteract(cands, count, false, scope, a, undefined, ctx);
}

function execSearch(a: SearchAction, ctx: ExecCtx): ExecResult {
  const state = ownerState(a.from.owner as Owner, ctx);
  const fromDeck = a.from.location === 'deck';
  const pool = fromDeck ? state.deck : state.trash;

  // '__lastRevealed__' / colorMatchesLrig / colorNotMatchesLrig の動的解決
  let resolvedFilter = { ...a.filter };
  if (resolvedFilter.cardName === '__lastRevealed__') {
    const revealedNum = ctx.lastProcessedCards?.[0];
    const revealedName = revealedNum ? ctx.cardMap.get(revealedNum)?.CardName : undefined;
    if (revealedName) resolvedFilter.cardName = revealedName;
    else delete resolvedFilter.cardName;
  }
  {
    // 動的フィルタ（colorMatchesLrig / powerLteLastProcessed / levelLteLastProcessed 等）を解決。
    // 該当フラグが無ければ no-op。lastProcessedCards を渡して「この方法で処理したシグニのレベル/パワー以下」を解決可能にする。
    const searchOwnerSt = a.from.owner === 'self' ? ctx.ownerState : ctx.otherState;
    const searchOtherSt = a.from.owner === 'self' ? ctx.otherState : ctx.ownerState;
    // 「この方法で捨てたシグニ」基準のレベル/クラス相対（levelLt/LteDiscardSigni・levelEqDiscardSigniOffset・
    // classMatchesDiscardSigni）は常にキャスター（ctx.ownerState＝コスト支払者）の記録値で解決する。WDK13-013/WXK10-033/WXEX2-37。
    resolvedFilter = { ...resolveDiscardLevelFilter(resolvedFilter, ctx.ownerState) };
    resolvedFilter = { ...resolveDynamicFilter(resolvedFilter, searchOwnerSt, ctx.cardMap, searchOtherSt, ctx.lastProcessedCards, ctx.effectivePowers, ctx.sourceCardNum, ctx.triggeringCardNum) };
  }
  // 「A1枚とB1枚」は1回の探索で候補をまとめて提示し、SelectionConstraint.groups が
  // 選択集合の割当を検証する。SEQUENCE の SEARCH 2本へ割ると公開・シャッフル・afterSearch が
  // 二重になるため、群 filter もこの1回の探索コンテキストで動的解決する。
  const resolvedSelectionConstraint = a.selectionConstraint?.groups
    ? {
        ...a.selectionConstraint,
        groups: a.selectionConstraint.groups.map(group => {
          if (!group.filter) return group;
          const searchOwnerSt = a.from.owner === 'self' ? ctx.ownerState : ctx.otherState;
          const searchOtherSt = a.from.owner === 'self' ? ctx.otherState : ctx.ownerState;
          const discarded = resolveDiscardLevelFilter(group.filter, ctx.ownerState);
          return {
            ...group,
            filter: resolveDynamicFilter(discarded, searchOwnerSt, ctx.cardMap, searchOtherSt,
              ctx.lastProcessedCards, ctx.effectivePowers, ctx.sourceCardNum, ctx.triggeringCardNum),
          };
        }),
      }
    : a.selectionConstraint;

  // TREAT_AS_LEVEL1_IN_DECK_TRASH: デッキ/トラッシュ内でレベル1シグニとして扱うカードのオーバーライド
  let searchCardMap = ctx.cardMap;
  if (ctx.deckTrashLevel1Nums && ctx.deckTrashLevel1Nums.size > 0) {
    const overrides = new Map(ctx.cardMap);
    for (const cn of ctx.deckTrashLevel1Nums) {
      if (pool.includes(cn)) {
        const card = ctx.cardMap.get(cn);
        if (card) overrides.set(cn, { ...card, Type: 'シグニ', Level: '1' });
      }
    }
    searchCardMap = overrides;
  }
  // deck_signi_level_override:「このターン、あなたのデッキにある〈クラス〉のシグニのレベルは N になる」（§6.4 O-34(c)）。
  // ⚠**デッキ探索は `searchCardMap` 差し替えで読む**＝上の `deckTrashLevel1Nums` と同じ規約に揃える
  //   （`matchesFilter` の `effectiveLevel` 引数はここでは1枚ずつ渡せないため）。
  // ⚠トラッシュ探索には効かない（原文が「デッキにある」と限定している）。
  if (fromDeck && state.deck_signi_level_override) {
    const lvOverrides = new Map(searchCardMap);
    for (const n of pool) {
      const cn = getCardNum(n);
      const card = searchCardMap.get(cn);
      const lv = deckSigniOverrideLevel(state, card);
      if (card && lv !== undefined) lvOverrides.set(cn, { ...card, Level: String(lv) });
    }
    searchCardMap = lvOverrides;
  }

  // maxCount の解決（{$ref:'last_processed_count'} = 直前にバニッシュ/トラッシュした枚数。「同じ枚数」）
  const maxPick = resolveCountRef(a.maxCount, ctx);
  // 探索枚数0（同数が0等）: 探索せず afterSearch のみ実行
  if (maxPick <= 0) {
    if (a.afterSearch) return executeAction(a.afterSearch, ctx);
    return done(ctx);
  }

  // 1
  const groupFilters = resolvedSelectionConstraint?.groups?.map(group => group.filter);
  const matchesSearchPool = (n: string): boolean => groupFilters?.length
    ? groupFilters.some(filter => matchesFilter(searchCardMap.get(getCardNum(n)), filter))
    : matchesFilter(searchCardMap.get(getCardNum(n)), resolvedFilter);
  const hasVisible = pool.some(matchesSearchPool);
  if (!hasVisible) {
    if (a.afterSearch) return executeAction(a.afterSearch, ctx);
    return done(ctx);
  }

  // フィルタがある場合は一致カードのみ表示、ない場合は全体を公開
  const visibleCards = pool.filter(matchesSearchPool);

  // exact 合計を作れないときは選択不能UIを出さず、0枚探索としてシャッフルまで進める。
  if (resolvedSelectionConstraint?.totalLevelExact !== undefined
      && findValidConstrainedSelection(visibleCards, a.upToTarget === false ? maxPick : 0, maxPick,
        resolvedSelectionConstraint, searchCardMap) === null) {
    const emptyCtx = { ...ctx, lastProcessedCards: [] };
    if (a.afterSearch) return executeAction(a.afterSearch, emptyCtx);
    return done(emptyCtx);
  }

  return needsInteraction(ctx, {
    type: 'SEARCH',
    visibleCards,
    maxPick,
    optional: a.upToTarget !== false,
    revealPicked: a.revealPicked,
    thenAction: a.then,
    ...(a.handOrField ? { handOrField: true } : {}),
    afterAction: a.afterSearch,
    selectionConstraint: resolvedSelectionConstraint,
  });
}

// 「そうした場合」ゲートの対象アクション型（execSequence の did-it ゲート・タスク12(xxix)③）。
// 条件＝**対象を処理したら lastProcessedCards に記録する型**＝空振りを機械判定できるもの。
// DRAW/SHUFFLE_DECK/GRANT_KEYWORD 等の「常に成功する・記録しない」型は入れてはならない
// （入れると空振りでないのに then を殺す＝過小実行に化ける）。追加時は tmp_gate_matrix 相当の
// 「空振り盤面＝skip／成功盤面＝fire」の両側で必ず検証すること（片側だけ見ると全抑制が満点に見える）。
const DID_IT_GATED_TYPES = new Set<string>([
  'BANISH', 'BOUNCE', 'DOWN', 'FREEZE', 'TRANSFER_TO_DECK', 'TRANSFER_TO_HAND',
  'SEND_TO_ENERGY', 'LIFE_CRASH', 'EXILE',
  'REVEAL', 'TAKE_FROM_UNDER_SIGNI', 'REMOVE_CHARM', 'ADD_TO_FIELD', 'FIELD_SIGNI_TO_ACCE',
]);

const OPTIONAL_COST_STUB_IDS = new Set([
  'OPTIONAL_COST', 'TARGET_OPP_SIGNI_OPTIONAL_COLOR_COST', 'OPTIONAL_TRASH_ENERGY_CLASS',
]);

function isOptionalCostStub(action: EffectAction): action is StubAction {
  return action.type === 'STUB' && OPTIONAL_COST_STUB_IDS.has(action.id);
}

function execSequence(a: SequenceAction, ctx: ExecCtx): ExecResult {
  if (a.snapshotLastProcessedForConditionals) {
    const snapshotCtx = { ...ctx, lastProcessedCards: [...(ctx.lastProcessedCards ?? [])] };
    const resolvedSteps = a.steps.flatMap(step => {
      if (step.type !== 'CONDITIONAL') return [step];
      const conditional = step as ConditionalAction;
      if (evalCondition(conditional.condition, snapshotCtx)) return [conditional.then];
      return conditional.else ? [conditional.else] : [];
    });
    return execSequence({ type: 'SEQUENCE', steps: resolvedSteps }, ctx);
  }
  let cur = ctx;
  for (let i = 0; i < a.steps.length; i++) {
    const step = a.steps[i];
    // リコレクトゲート：条件未達なら残りステップをすべてスキップ
    if (step.type === 'RECOLLECT_GATE') {
      const gate = step as import('../types/effects').RecollectGateAction;
      // 使用中のアーツ自身（sourceCardNum）はまだルリグトラッシュに置かれていない扱いのため数えない。
      // エンジンでは使用時に先行してlrig_trashへ移すため、source分を除外して正しい枚数にする。
      const artsInLrigTrash = (cur.ownerState.lrig_trash ?? []).filter(
        n => n !== cur.sourceCardNum && cur.cardMap.get(n)?.Type === 'アーツ'
      ).length;
      if (artsInLrigTrash < gate.minArts) {
        return done(addLog(cur, `リコレクト条件未達（アーツ${artsInLrigTrash}枚 / 必要${gate.minArts}枚以上）`));
      }
      cur = addLog(cur, `リコレクト条件達成（アーツ${artsInLrigTrash}枚）`);
      continue;
    }
    // 条件付き任意コストの「包み形」＝CONDITIONAL{ <ゲート条件>, then: STUB OPTIONAL_COST系 }（46効果・タスク12(xi)）。
    // 原文「<ゲート>の場合、<コスト>を支払ってもよい。そうした場合、<本体>」を parser がこの形で表現する
    // （ゲートは「支払ってもよい」に掛かるので、この入れ子は表現として正しい）。
    // ⚠従来は Pattern ④/⑤ が「STUB が SEQUENCE の直下ステップ」だけを見ていたため包み形にマッチせず、
    //   execStubPart1 のエッジケース（pay/skip とも no-op）に落ちていた。その結果:
    //     (a) コストを払わなくても直後の CONDITIONAL{IS_MY_TURN, then:<本体>} が実行される＝**コスト踏み倒し**
    //     (b) ゲート条件がプロンプトにしか掛からず、条件を満たさなくても本体が実行される＝**過剰効果**
    //   ここでゲートを評価して包みを解き、既存の Pattern ④/⑤ に委譲することで両方を解消する。
    if (step.type === 'CONDITIONAL') {
      const wrapCond = step as ConditionalAction;
      const wrapStub = wrapCond.then as import('../types/effects').StubAction;
      const OPT_IDS_WRAP = ['OPTIONAL_COST', 'TARGET_OPP_SIGNI_OPTIONAL_COLOR_COST', 'OPTIONAL_TRASH_ENERGY_CLASS'];
      if (wrapStub?.type === 'STUB' && OPT_IDS_WRAP.includes(wrapStub.id) && !wrapCond.else) {
        if (evalCondition(wrapCond.condition, cur)) {
          // ゲート成立＝包みを解いて「STUB が直下ステップ」の正準形に直し、Pattern ④/⑤ へ委譲する
          const unwrapped: SequenceAction = { type: 'SEQUENCE', steps: [wrapStub, ...a.steps.slice(i + 1)] };
          return executeAction(unwrapped, cur);
        }
        // ゲート不成立＝任意コストを提示しないだけでなく、対になる「そうした場合」の本体もスキップする。
        // （本体は直後の CONDITIONAL{IS_MY_TURN|PAID_ADDITIONAL_COST}＝parser が「そうした場合」に使う形）
        const bodyIdx = a.steps.findIndex((s, idx) => {
          if (idx <= i) return false;
          if (s?.type !== 'CONDITIONAL') return false;
          const c = (s as ConditionalAction).condition.type;
          return c === 'IS_MY_TURN' || c === 'PAID_ADDITIONAL_COST';
        });
        cur = addLog(cur, '任意コストの条件を満たさない（スキップ）');
        if (bodyIdx > i) { i = bodyIdx; continue; }   // 本体ごと読み飛ばす
        continue;
      }
    }
    // LRIG_UNDER_TO_TRASH ゲート：センタールリグの下からN枚をルリグトラッシュへ（エクシード相当）。
    // 「そうした場合」効果のため、下のカードがN枚未満なら置けず残りステップをスキップ（WX05-007）。
    if (step.type === 'STUB' && (step as import('../types/effects').StubAction).id === 'LRIG_UNDER_TO_TRASH') {
      const gateLUT = step as import('../types/effects').StubAction;
      const needLUT = typeof gateLUT.value === 'number' ? gateLUT.value : parseInt(String(gateLUT.value ?? '0'), 10) || 0;
      const lrigLUT = [...cur.ownerState.field.lrig];
      const underCountLUT = lrigLUT.length - 1; // 現センタールリグ（末尾）を除いた下のカード枚数
      if (underCountLUT < needLUT) {
        return done(addLog(cur, `センタールリグの下が${underCountLUT}枚（必要${needLUT}枚）→ 置けないため以降スキップ`));
      }
      const movedLUT = lrigLUT.splice(0, needLUT); // 下（スタック先頭）からN枚
      cur = {
        ...cur,
        ownerState: { ...cur.ownerState, field: { ...cur.ownerState.field, lrig: lrigLUT }, lrig_trash: [...cur.ownerState.lrig_trash, ...movedLUT] },
        logs: [...cur.logs, `センタールリグの下から${needLUT}枚をルリグトラッシュに置いた`],
      };
      continue;
    }
    // TARGET_AND_DISCARD_HAND: 対戦相手シグニを対象とし手札を捨ててバニッシュ/バウンス/パワー変更など
    // 直後の CONDITIONAL(IS_MY_TURN) は「捨てた場合の効果」のプレースホルダーなので消費し、
    // その then を対象シグニへの適用アクションに使う（素通しすると二重実行になる）
    if (step.type === 'STUB' && (step as import('../types/effects').StubAction).id === 'TARGET_AND_DISCARD_HAND') {
      // パーサーが then の target.owner を 'self'/'any' と誤生成するため 'opponent' に修正（SEQUENCE内も再帰）
      const fixOwnerTADH = (act: EffectAction): EffectAction => {
        if (!act || typeof act !== 'object') return act;
        if (act.type === 'SEQUENCE') {
          return { ...act, steps: (act as SequenceAction).steps.map(fixOwnerTADH) } as SequenceAction;
        }
        if (['BANISH', 'BOUNCE', 'DOWN', 'FREEZE', 'GRANT_KEYWORD', 'POWER_MODIFY', 'TRANSFER_TO_DECK'].includes(act.type)) {
          const withTgt = act as unknown as { target?: { owner?: string; [k: string]: unknown }; [k: string]: unknown };
          if (withTgt.target && (withTgt.target.owner === 'self' || withTgt.target.owner === 'any')) {
            return { ...withTgt, target: { ...withTgt.target, owner: 'opponent' } } as unknown as EffectAction;
          }
        }
        return act;
      };
      const nextTADH = i + 1 < a.steps.length ? a.steps[i + 1] : undefined;
      let thenTADH: EffectAction = {
        type: 'BANISH', target: { type: 'SIGNI', owner: 'opponent', count: 1 },
      } as import('../types/effects').BanishAction;
      let restIdxTADH = i + 1;
      if (nextTADH?.type === 'CONDITIONAL' && (nextTADH as ConditionalAction).condition.type === 'IS_MY_TURN') {
        thenTADH = fixOwnerTADH((nextTADH as ConditionalAction).then);
        restIdxTADH = i + 2;
      }
      const remaining = a.steps.slice(restIdxTADH);
      const cont: EffectAction | undefined = remaining.length > 0
        ? (remaining.length === 1 ? remaining[0] : { type: 'SEQUENCE', steps: remaining } as SequenceAction)
        : undefined;
      const cands = fieldCandidates(cur.otherState, { cardType: 'シグニ' }, cur.cardMap, cur.effectivePowers, cur.allColorSigniNums, cur.fieldSigniExtraColors);
      // 対象シグニに then を適用（applyDirectActionが正しいカードを特定）、その後手札1枚捨て
      const discardCont: EffectAction = { type: 'TRASH', target: { type: 'HAND_CARD', owner: 'self', count: 1 } } as import('../types/effects').TrashAction;
      const fullCont: EffectAction = cont
        ? { type: 'SEQUENCE', steps: [discardCont, cont] } as SequenceAction
        : discardCont;
      return selectOrInteract(cands, 1, false, 'opp_field', thenTADH, fullCont, cur);
    }
    // NEGATE_ATTACK_ON_TRIGGER: 「そのアタックを無効にしてもよい」（WXDi-P11-055）
    // 直後の CONDITIONAL(IS_MY_TURN) は「そうした場合」のプレースホルダーとして消費する
    if (step.type === 'STUB' && (step as import('../types/effects').StubAction).id === 'NEGATE_ATTACK_ON_TRIGGER') {
      const nextNAT = i + 1 < a.steps.length ? a.steps[i + 1] : undefined;
      const thenNAT: EffectAction[] = [];
      let restIdxNAT = i + 1;
      if (nextNAT?.type === 'CONDITIONAL' && (nextNAT as ConditionalAction).condition.type === 'IS_MY_TURN') {
        thenNAT.push((nextNAT as ConditionalAction).then);
        restIdxNAT = i + 2;
      }
      const remainingNAT = a.steps.slice(restIdxNAT);
      const cancelFlagStub: import('../types/effects').StubAction = { type: 'STUB', id: 'SET_CANCEL_ATTACK_FLAG' };
      const yesSteps: EffectAction[] = [cancelFlagStub as EffectAction, ...thenNAT, ...remainingNAT];
      const yesAction: EffectAction = yesSteps.length === 1
        ? yesSteps[0]
        : { type: 'SEQUENCE', steps: yesSteps } as SequenceAction;
      const noopNAT: SequenceAction = { type: 'SEQUENCE', steps: [] };
      return needsInteraction(cur, {
        type: 'CHOOSE',
        options: [
          { id: 'yes', label: 'アタックを無効にする', action: yesAction, available: true },
          { id: 'no',  label: '無効にしない',           action: noopNAT as EffectAction, available: true },
        ],
        count: 1,
      });
    }
    // COST_COLOR_SELECT: コスト色に基づき次のSEARCHに色フィルタを適用
    if (step.type === 'STUB' && (step as import('../types/effects').StubAction).id === 'COST_COLOR_SELECT') {
      const ccStub = step as import('../types/effects').StubAction;
      const colors = ccStub.costColors ?? [];
      const nextSearchStep = i + 1 < a.steps.length ? a.steps[i + 1] : undefined;
      if (nextSearchStep?.type === 'SEARCH' && colors.length > 0) {
        const searchStep = nextSearchStep as SearchAction;
        const afterRemaining = a.steps.slice(i + 2);
        const uniqueColors = [...new Set(colors)];
        if (uniqueColors.length === 1) {
          // 色が1種類: 色フィルタ付きSEARCHを直接実行
      const coloredSearch: SearchAction = { ...searchStep, filter: { ...searchStep.filter, color: uniqueColors[0] } };
          const newSteps = [coloredSearch as EffectAction, ...afterRemaining];
          return execSequence({ type: 'SEQUENCE', steps: newSteps } as SequenceAction, addLog(cur, `コスト色選択：${uniqueColors[0]}`));
        } else {
          // 色が複数: CHOOSEで色を選択させ、各色のSEARCHを実行
      const afterCont: EffectAction | undefined = afterRemaining.length > 0
            ? (afterRemaining.length === 1 ? afterRemaining[0] : { type: 'SEQUENCE', steps: afterRemaining } as SequenceAction)
            : undefined;
          const opts = uniqueColors.map(c => ({
            id: c, label: `《${c}》のシグニをサーチ`, available: true,
            action: (() => {
              const cs: SearchAction = { ...searchStep, filter: { ...searchStep.filter, color: c } };
              return afterCont ? { type: 'SEQUENCE', steps: [cs as EffectAction, afterCont] } as SequenceAction : cs as EffectAction;
            })(),
          }));
          return needsInteraction(addLog(cur, 'コスト色選択：サーチする色を選んでください'), {
            type: 'CHOOSE', options: opts, count: 1,
          });
        }
      }
      cur = addLog(cur, 'コスト色選択（スキップ）');
      continue;
    }
    // DECLARE_NUMBER: 数字を宣言し、次のGRANT_KEYWORD(シャドウ:{declaredNumberPowerEq:true})に反映
    // ⚠**この横取りは「次が GRANT_KEYWORD」＝シャドウのパワー宣言のときだけ**。
    // 🔴**2026-08-22（§6.4 O-41）まで、それ以外は `continue` で宣言そのものを黙って飛ばしていた**＝
    //   `SEQUENCE` の中の `DECLARE_NUMBER` は**一度も数字を宣言しないまま**後段へ進み、宣言値を読む
    //   `levelEqDeclaredNumber` / `DECK_TOP_CHECK_LEVEL_*` / `useDeclaredCount` が軒並み空振りしていた
    //   （live で `DECLARE_NUMBER` を持つ30カードのほとんどがこの形）。裸の `DECLARE_NUMBER` だけが
    //   `execStub` 側の CHOOSE に届いていたので、golden も片側しか踏んでいなかった。
    //   フォールバックは**素通りではなく通常の STUB 実行**＝下の汎用ステップ実行に落として CHOOSE を出す。
    if (step.type === 'STUB' && (step as import('../types/effects').StubAction).id === 'DECLARE_NUMBER'
        && i + 1 < a.steps.length && a.steps[i + 1]?.type === 'GRANT_KEYWORD') {
      const grantDN = a.steps[i + 1] as GrantKeywordAction;
      const remaining = a.steps.slice(i + 2);
      const cont: EffectAction | undefined = remaining.length > 0
        ? (remaining.length === 1 ? remaining[0] : { type: 'SEQUENCE', steps: remaining } as SequenceAction)
        : undefined;
      const powerValues = [1000, 2000, 3000, 4000, 5000, 6000, 7000, 8000, 9000, 10000, 12000, 15000, 20000];
      const optsDN = powerValues.map(pw => ({
        id: String(pw),
        label: String(pw),
        available: true,
        action: (cont
          ? { type: 'SEQUENCE', steps: [{ ...grantDN, keyword: encodeShadowKeyword({ powerEq: pw }) } as EffectAction, cont] } as SequenceAction
          : { ...grantDN, keyword: encodeShadowKeyword({ powerEq: pw }) }) as EffectAction,
      }));
      return needsInteraction(addLog(cur, '数字を宣言してください（シャドウが適用されるパワー）'), {
        type: 'CHOOSE', options: optsDN, count: 1,
      });
    }
    // 任意コストパターン: STUB(各種任意コスト) → CONDITIONAL(IS_MY_TURN|PAID_ADDITIONAL_COST)
    // IS_MY_TURN は旧パーサーのプレースホルダー、PAID_ADDITIONAL_COST は明示的な支払い結果条件。
    if (step.type === 'STUB') {
      const nextStep = i + 1 < a.steps.length ? a.steps[i + 1] : undefined;
      if (nextStep?.type === 'CONDITIONAL' &&
          ['IS_MY_TURN', 'PAID_ADDITIONAL_COST'].includes((nextStep as ConditionalAction).condition.type)) {
        let conditional = nextStep as ConditionalAction;
        const remaining = a.steps.slice(i + 2);
        let cont: EffectAction | undefined = remaining.length > 0
          ? (remaining.length === 1 ? remaining[0] : { type: 'SEQUENCE', steps: remaining } as SequenceAction)
          : undefined;
        // 二段以上の任意コストだけは、後続を外側 CHOOSE の無条件 continuation にしない。
        // pay 枝へ畳むことで内側の任意コストが同じ dispatcher に再入し、各 skip が後段を止める。
        // 帰結が通常 action の25箇所は従来どおり cont に残し、独立した後続を過小実行にしない。
        if (remaining.length > 0 && isOptionalCostStub(conditional.then)) {
          conditional = {
            ...conditional,
            then: { type: 'SEQUENCE', steps: [conditional.then, ...remaining] } as SequenceAction,
          };
          cont = undefined;
        }
        const noopAction: SequenceAction = { type: 'SEQUENCE', steps: [] };
        const stub = step as import('../types/effects').StubAction;
        const costColors = stub.costColors ?? [];

        // ルリグ下の任意コスト。対象カードを先に保持する専用機構を持たない
        // WXDi-P05-009 は、解決中に割り込みがないため「支払い→トラッシュ選択」で
        // 最終盤面が一致する。消費自体は既存 INTERNAL_CONSUME_LRIG_UNDER を再利用する。
        if (stub.id === 'OPTIONAL_LRIG_UNDER_COST') {
          const lrigStack = cur.ownerState.field.lrig;
          const hasUnder = lrigStack.length >= 2;
          const underCard = hasUnder ? lrigStack.at(-2) : undefined;
          const underName = underCard ? (cur.cardMap.get(underCard)?.CardName ?? underCard) : null;
          const payAction: EffectAction = {
            type: 'SEQUENCE',
            steps: [
              { type: 'STUB', id: 'INTERNAL_CONSUME_LRIG_UNDER', value: 1 } as import('../types/effects').StubAction,
              conditional.then,
            ],
          };
          return needsInteraction(addLog(cur, 'ルリグ下のカードを使用して発動しますか？'), {
            type: 'CHOOSE',
            count: 1,
            options: [
              {
                id: 'pay',
                available: hasUnder,
                label: underName ? `ルリグ下（${underName}）を使用して発動` : 'ルリグ下のカードを使用して発動',
                action: payAction,
              },
              {
                id: 'skip',
                available: true,
                label: 'スキップ',
                action: (conditional.else ?? noopAction) as EffectAction,
              },
            ],
            ...(cont ? { continuation: cont } : {}),
          });
        }

        // SOUL_OP: ソウルカードを消費してコスト支払い（WXDiシリーズ）
      if (stub.id === 'SOUL_OP') {
          const srcZoneSO = cur.ownerState.field.signi.findIndex(s => s?.at(-1) === cur.sourceCardNum);
          const stackSO = srcZoneSO >= 0 ? cur.ownerState.field.signi[srcZoneSO] : null;
          const hasSoul = stackSO != null && stackSO.length >= 2;
          const soulCard = hasSoul ? stackSO![0] : null;
          const soulName = soulCard ? (cur.cardMap.get(soulCard)?.CardName ?? soulCard) : null;
          const consumeSoulStub: import('../types/effects').StubAction = { type: 'STUB', id: 'INTERNAL_CONSUME_SOUL' };
          const payActionSO: EffectAction = hasSoul
            ? ({ type: 'SEQUENCE', steps: [consumeSoulStub as EffectAction, conditional.then] } as SequenceAction)
            : conditional.then;
          const optionsSO = [
            {
              id: 'pay', available: hasSoul,
              label: soulName ? `ソウル（${soulName}）を使用して発動` : 'ソウルを使用して発動',
              action: payActionSO,
            },
            { id: 'skip', label: 'スキップ', action: (conditional.else ?? noopAction) as EffectAction, available: true },
          ];
          const pendingSO: PendingInteractionDef = {
            type: 'CHOOSE', options: optionsSO, count: 1,
            ...(cont ? { continuation: cont } : {}),
          };
          return needsInteraction(addLog(cur, 'ソウルを使用して発動しますか？'), pendingSO);
        }

        // LRIG_UNDER_CARD_OP: シグニ下のカードを消費してコスト支払い（WX24/WX25/WXDiシリーズ）
      if (stub.id === 'LRIG_UNDER_CARD_OP') {
          const srcZoneLUCO = cur.ownerState.field.signi.findIndex(s => s?.at(-1) === cur.sourceCardNum);
          const stackLUCO = srcZoneLUCO >= 0 ? cur.ownerState.field.signi[srcZoneLUCO] : null;
          const hasUnder = stackLUCO != null && stackLUCO.length >= 2;
          const underCard = hasUnder ? stackLUCO![0] : null;
          const underName = underCard ? (cur.cardMap.get(underCard)?.CardName ?? underCard) : null;
          const consumeUnderStub: import('../types/effects').StubAction = { type: 'STUB', id: 'INTERNAL_CONSUME_SOUL' };
          const payActionLUCO: EffectAction = hasUnder
            ? ({ type: 'SEQUENCE', steps: [consumeUnderStub as EffectAction, conditional.then] } as SequenceAction)
            : conditional.then;
          const optionsLUCO = [
            {
              id: 'pay', available: hasUnder,
              label: underName ? `「${underName}」を使用して発動` : 'シグニ下のカードを使用して発動',
              action: payActionLUCO,
            },
            { id: 'skip', label: 'スキップ', action: (conditional.else ?? noopAction) as EffectAction, available: true },
          ];
          const pendingLUCO: PendingInteractionDef = {
            type: 'CHOOSE', options: optionsLUCO, count: 1,
            ...(cont ? { continuation: cont } : {}),
          };
          return needsInteraction(addLog(cur, 'シグニ下のカードを使用して発動しますか？'), pendingLUCO);
        }

        // OPTIONAL_HAND_REVEAL_NAMED: 名前指定カードを手札から任意公開 → そうした場合 conditional.then
        if (stub.id === 'OPTIONAL_HAND_REVEAL_NAMED') {
          const srcOHRN = cur.sourceCardNum ? cur.cardMap.get(cur.sourceCardNum) : undefined;
          const txtOHRN = srcOHRN ? (srcOHRN.EffectText ?? '') + ' ' + (srcOHRN.BurstText ?? '') : '';
          const nameM = txtOHRN.match(/《([^《》]+)》を公開/);
          const targetName = nameM ? nameM[1] : '';
          const hasCard = targetName
            ? cur.ownerState.hand.some(cn => cur.cardMap.get(cn)?.CardName === targetName)
            : false;
          const optionsOHRN = [
            { id: 'reveal', available: hasCard,
              label: targetName ? `《${targetName}》を公開する` : '公開する',
              // 公開記録（ON_REVEALED_FROM_HANDトリガー検出用）を挟んでから then を実行
              action: { type: 'SEQUENCE', steps: [
                { type: 'STUB', id: 'INTERNAL_MARK_REVEALED_NAMED' } as StubAction,
                conditional.then,
              ] } as EffectAction },
            { id: 'skip', label: '公開しない', action: (conditional.else ?? noopAction) as EffectAction, available: true },
          ];
          const pendingOHRN: PendingInteractionDef = {
            type: 'CHOOSE', options: optionsOHRN, count: 1,
            ...(cont ? { continuation: cont } : {}),
          };
          return needsInteraction(addLog(cur, `《${targetName}》を公開しますか？`), pendingOHRN);
        }

        // TARGET_OPP_SIGNI_OPTIONAL_COLOR_COST: 相手シグニを対象にして任意色コスト支払い
        // パーサーが conditional.then の target.owner を 'self' と誤生成するため修正する
        if (stub.id === 'TARGET_OPP_SIGNI_OPTIONAL_COLOR_COST') {
          const toHWTOSOC = (s: string) => s.replace(/[\uFF01-\uFF5E]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
          const declaredTargetTOSOC = stub.optionalCostTarget;
          const targetAvailableTOSOC = declaredTargetTOSOC?.type === 'LRIG'
            ? cur.otherState.field.lrig.length > 0
            : declaredTargetTOSOC?.type === 'TRASH_CARD'
              ? cur.ownerState.trash.some(cn => matchesFilter(cur.cardMap.get(getCardNum(cn)), declaredTargetTOSOC.filter ?? {}))
              : fieldCandidates(cur.otherState, declaredTargetTOSOC?.filter ?? { cardType: 'シグニ' }, cur.cardMap, cur.effectivePowers, cur.allColorSigniNums, cur.fieldSigniExtraColors).length > 0;
          if (!targetAvailableTOSOC) {
            if (cont) return executeAction(cont, cur);
            return done(addLog(cur, '任意コストの対象なし（TARGET_OPP_SIGNI_OPTIONAL_COLOR_COST）'));
          }
          const canAffordTOSOC = costColors.length === 0 || canPayOptionalCost(costColors, cur.ownerState, cur.cardMap);
          // パーサーバグ修正: conditional.then の target.owner='self'/'any' → 'opponent'
          const fixOwnerTOSOC = (a: EffectAction): EffectAction => {
            if (!a || typeof a !== 'object') return a;
            if (['BANISH', 'BOUNCE', 'DOWN', 'FREEZE', 'GRANT_KEYWORD', 'POWER_MODIFY'].includes(a.type)) {
              const withTgt = a as unknown as { target?: { owner?: string; [k: string]: unknown }; [k: string]: unknown };
              if (withTgt.target && (withTgt.target.owner === 'self' || withTgt.target.owner === 'any')) {
                return { ...withTgt, target: { ...withTgt.target, owner: 'opponent' } } as unknown as EffectAction;
              }
            }
            return a;
          };
          void toHWTOSOC; // 対象の枚数・種別は optionalCostTarget と各 executor が解決する
          const fixedThenTOSOC = fixOwnerTOSOC(conditional.then);
          const payLabelTOSOC = costColors.length > 0
            ? `対象選択して発動（${costColors.map(c => c.split('|').map(x => `《${x}》`).join('か')).join('')}）`
            : '対象選択して発動';
          // BANISH/BOUNCE等は opponent 修正により execBanish で相手フィールドから selectOrInteract が走る
      const optsTOSOC = [
            { id: 'pay', label: payLabelTOSOC, action: fixedThenTOSOC, available: canAffordTOSOC, ...(costColors.length ? { costColors } : {}) },
            { id: 'skip', label: 'スキップ', action: (conditional.else ?? noopAction) as EffectAction, available: true },
          ];
          return needsInteraction(addLog(cur, '任意コスト：対象シグニを選んで発動しますか？'), {
            type: 'CHOOSE', options: optsTOSOC, count: 1, ...(cont ? { continuation: cont } : {}),
          });
        }

        // OPTIONAL_TRASH_ENERGY_CLASS: エナゾーンから特定クラスのカードを任意でトラッシュ/手札へ
        if (stub.id === 'OPTIONAL_TRASH_ENERGY_CLASS') {
          // §6.4 O-20: 全文だと別能力の行先を拾う（`WX25-CP1-049-E1` は E3 の「それを手札に加える」を拾い、
          // **払ったエナがトラッシュではなく手札へ**行き、さらに後続の帰結まで省略されていた）。
          const txtOTEC = sourceAbilityText(cur);
          const toHWOTEC = (s: string) => s.replace(/[\uFF01-\uFF5E]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
          // クラス・トラッシュ枚数は「エナゾーンから＜X＞の(シグニ|カード)N枚をトラッシュ」句から取る。
          // （同カード内の「N体を対象」＝バニッシュ対象数 や 別記述＝場出し記述 の誤マッチを避ける。
          //  従来は枚数を別途「N枚を対象」から取り multi-card 札で常に1枚しか払わなかったバグの修正）
          const trashClauseMOTEC = txtOTEC.match(/エナゾーンから(?:あなたの)?(?:＜([^＞]+)＞の)?(?:シグニ|カード)([０-９\d]+)枚を?トラッシュ/);
          const classMOTEC = trashClauseMOTEC ?? txtOTEC.match(/エナゾーンから(?:あなたの)?(?:＜([^＞]+)＞の)?(?:シグニ|カード)/);
          const reqClassOTEC = classMOTEC?.[1] ?? '';
          const energyCandsOTEC = cur.ownerState.energy.filter(cn => {
            if (!reqClassOTEC) return true;
            return (cur.cardMap.get(cn)?.CardClass ?? '').includes(reqClassOTEC);
          });
          if (energyCandsOTEC.length === 0) {
            if (cont) return executeAction(cont, cur);
            return done(addLog(cur, `エナに${reqClassOTEC || 'カード'}なし（OPTIONAL_TRASH_ENERGY_CLASS）`));
          }
          const toHandOTEC = !!(txtOTEC.match(/それを手札に加える/) || conditional.then.type === 'TRANSFER_TO_HAND');
          // conditional.then の BOUNCE/BANISH/DOWN の target.owner='self' → 'opponent' 修正
          let thenOTEC = conditional.then;
          if (['BOUNCE', 'BANISH', 'DOWN', 'POWER_MODIFY'].includes(thenOTEC.type)) {
            const wt = thenOTEC as unknown as { target?: { owner?: string; [k: string]: unknown }; [k: string]: unknown };
            if (wt.target?.owner === 'self') thenOTEC = { ...wt, target: { ...wt.target, owner: 'opponent' } } as unknown as EffectAction;
          }
          // トラッシュ枚数＝「(シグニ|カード)N枚をトラッシュ」句の N（取れなければ1）。
          const pickCountOTEC = trashClauseMOTEC?.[2] ? parseInt(toHWOTEC(trashClauseMOTEC[2])) : 1;
          const destOTEC = toHandOTEC ? 'hand' : 'trash';
          const selectStubOTEC: import('../types/effects').StubAction = {
            type: 'STUB', id: 'INTERNAL_OTEC_SELECT',
            value: `${destOTEC}:${reqClassOTEC}:${pickCountOTEC}`,
          };
          // "手札へ" パターン: エナカード移動がメイン効果、conditional.then を追加しない
          // "トラッシュ" パターン: エナカード移動 + conditional.then（追加効果）
      const payStepsOTEC: EffectAction[] = [selectStubOTEC as EffectAction];
          if (!toHandOTEC) payStepsOTEC.push(thenOTEC);
          const payActionOTEC: EffectAction = payStepsOTEC.length === 1
            ? payStepsOTEC[0]
            : { type: 'SEQUENCE', steps: payStepsOTEC } as import('../types/effects').SequenceAction;
          const payLabelOTEC = reqClassOTEC ? `エナ＜${reqClassOTEC}＞を選択して発動` : 'エナから選択して発動';
          const optsOTEC = [
            { id: 'pay', label: payLabelOTEC, action: payActionOTEC, available: true },
            { id: 'skip', label: 'スキップ', action: thenOTEC.type === 'STUB' && thenOTEC.id === 'ARTS_EXTRA_COST_CONDITION'
              ? ({ type: 'SEQUENCE', steps: [
                  { type: 'STUB', id: 'INTERNAL_OTEC_SKIP' } as StubAction,
                  thenOTEC,
                ] } as EffectAction)
              : (conditional.else ?? noopAction) as EffectAction, available: true },
          ];
          return needsInteraction(addLog(cur, `エナゾーンのカードを選択しますか？`), {
            type: 'CHOOSE', options: optsOTEC, count: 1, ...(cont ? { continuation: cont } : {}),
          });
        }

        // OPTIONAL_TRASH_SELF: 「このシグニを場からトラッシュに置いてもよい。そうした場合、X」＝
        //   効果元シグニ自身を任意でトラッシュ（コスト）→ 支払ったら conditional.then（X）。
        //   pay=SEQUENCE[自トラッシュ, then] / skip=conditional.else。自シグニが場にないと支払い不可。
        //   （旧: line 1738 が self-trash を誤って OPTIONAL_TRASH_ENERGY_CLASS へ流し、エナを探す no-op になっていた）
        if (stub.id === 'OPTIONAL_TRASH_SELF') {
          const selfNumOTS = cur.sourceCardNum;
          const onFieldOTS = !!selfNumOTS && cur.ownerState.field.signi.some(s => s?.at(-1) === selfNumOTS);
          if (!onFieldOTS) {
            if (cont) return executeAction(cont, cur);
            return done(addLog(cur, 'このシグニが場にない（OPTIONAL_TRASH_SELF）'));
          }
          const trashSelfActionOTS: EffectAction = {
            type: 'TRASH',
            target: { type: 'SIGNI', owner: 'self', count: 1, upToCount: false, filter: { cardType: 'シグニ', thisCardOnly: true } },
            asCost: true,
          } as EffectAction;
          const payActionOTS: EffectAction = { type: 'SEQUENCE', steps: [trashSelfActionOTS, conditional.then] } as SequenceAction;
          const optsOTS = [
            { id: 'pay', label: 'このシグニをトラッシュして発動', action: payActionOTS, available: true },
            { id: 'skip', label: 'スキップ', action: (conditional.else ?? noopAction) as EffectAction, available: true },
          ];
          return needsInteraction(addLog(cur, 'このシグニを場からトラッシュに置きますか？'), {
            type: 'CHOOSE', options: optsOTS, count: 1, ...(cont ? { continuation: cont } : {}),
          });
        }

        // OPTIONAL_DISCARD_HAND_CLASS: 手札から＜X＞のシグニ1枚を任意で捨てる → そうした場合 conditional.then（G253）
        // クラスは EffectText から解釈（OPTIONAL_TRASH_ENERGY_CLASS の手札版）。
        if (stub.id === 'OPTIONAL_DISCARD_HAND_CLASS') {
          const srcODHC = cur.sourceCardNum ? cur.cardMap.get(cur.sourceCardNum) : undefined;
          const txtODHC = srcODHC ? (srcODHC.EffectText ?? '') + ' ' + (srcODHC.BurstText ?? '') : '';
          const clsMODHC = txtODHC.match(/手札から(?:あなたの)?(?:＜([^＞]+)＞の)?(?:シグニ|カード)/);
          const reqClassODHC = clsMODHC?.[1] ?? '';
          const handFilterODHC = { cardType: 'シグニ' as const, ...(reqClassODHC ? { story: reqClassODHC } : {}) };
          const handCandsODHC = cur.ownerState.hand.filter(cn => matchesFilter(cur.cardMap.get(cn), handFilterODHC));
          const elseActODHC = (conditional.else ?? noopAction) as EffectAction;
          if (handCandsODHC.length === 0) {
            // 捨てられる候補なし: 効果不発（else があれば実行）。続行ステップは継続。
            if (cont) return executeAction(cont, cur);
            return executeAction(elseActODHC, cur);
          }
          const discardODHC: EffectAction = {
            type: 'TRASH',
            target: { type: 'HAND_CARD', owner: 'self', count: 1, filter: handFilterODHC },
          } as EffectAction;
          const payActODHC: EffectAction = { type: 'SEQUENCE', steps: [discardODHC, conditional.then] } as SequenceAction;
          const optsODHC = [
            { id: 'pay', label: reqClassODHC ? `手札から＜${reqClassODHC}＞のシグニを捨てて発動` : '手札を捨てて発動', action: payActODHC, available: true },
            { id: 'skip', label: 'スキップ', action: elseActODHC, available: true },
          ];
          return needsInteraction(addLog(cur, '手札を捨てて発動しますか？'), {
            type: 'CHOOSE', options: optsODHC, count: 1, ...(cont ? { continuation: cont } : {}),
          });
        }

        // REMOVE_VIRUS: ウイルスをN個取り除いてからconditional.thenを実行
      if (stub.id === 'REMOVE_VIRUS') {
          const toHWRV = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
          const virusArrRV = cur.otherState.field.signi_virus ?? [0, 0, 0];
          const totalVirusRV = virusArrRV.reduce((s, v) => s + v, 0);
          const srcRV = cur.sourceCardNum ? cur.cardMap.get(cur.sourceCardNum) : undefined;
          const txtRV = srcRV ? (srcRV.EffectText ?? '') + ' ' + (srcRV.BurstText ?? '') : '';
          const cntMRV = txtRV.match(/【ウィルス】([０-９\d]+)つを?取り除く/);
          const removeCountRV = cntMRV ? parseInt(toHWRV(cntMRV[1])) : 1;
          const isOptionalRV = !!(txtRV.match(/取り除いてもよい/));
          // ウイルス除去スタブ + conditional.then を連結したアクション
          const removeStubRV: import('../types/effects').StubAction = {
            type: 'STUB', id: 'INTERNAL_REMOVE_VIRUS_N', value: removeCountRV,
          };
          const payActionRV: EffectAction = {
            type: 'SEQUENCE', steps: [removeStubRV as EffectAction, conditional.then],
          } as import('../types/effects').SequenceAction;
          if (totalVirusRV < removeCountRV) {
            // ウイルスが足りない場合はスキップ
            if (cont) return executeAction(cont, cur);
            return done(addLog(cur, `ウイルス不足（必要${removeCountRV}、実在${totalVirusRV}）`));
          }
          if (isOptionalRV) {
            const optsRV = [
              { id: 'pay', label: `【ウィルス】${removeCountRV}つを取り除く`, action: payActionRV, available: true },
              { id: 'skip', label: 'スキップ', action: (conditional.else ?? noopAction) as EffectAction, available: true },
            ];
            return needsInteraction(addLog(cur, '【ウィルス】を取り除きますか？'), {
              type: 'CHOOSE', options: optsRV, count: 1, ...(cont ? { continuation: cont } : {}),
            });
          }
          // 強制除去: ウイルス除去 → conditional.then
          const mandRV = executeAction(payActionRV, cur);
          if (!mandRV.done && cont) {
            const ex = mandRV.pending.continuation;
            mandRV.pending = { ...mandRV.pending, continuation: ex
              ? { type: 'SEQUENCE', steps: [ex, cont] } as import('../types/effects').SequenceAction
              : cont };
          }
          if (mandRV.done && cont) return executeAction(cont, { ...cur, ownerState: mandRV.ownerState, otherState: mandRV.otherState, logs: mandRV.logs });
          return mandRV;
        }

        // OPPONENT_PAY_OPTIONAL: 対戦相手がコストを支払う/支払わない
        // pay → 何も起きない（対戦相手のエナ消費）、skip → 効果発動（conditional.then）
      if (stub.id === 'OPPONENT_PAY_OPTIONAL') {
          // 可変《無》コスト（タスク12(lxi) 第8波・`WXK05-009-E2`）＝「このターンにシグニがアタックした
          // 回数１回につき《無》」。枚数は**支払う側**（otherState）の attacked_signi_ids から実行時に決まる。
          // ⚠回数0は「アタックが発火させたトリガー」からは到達しない（発火元のアタックは既に数えられている）が、
          //   0 のまま素通りさせると《無》×0＝**タダで回避できる穴**になるため支払い枝を出さない。
          const perAttackOPO = stub.opponentPayColorlessPerSigniAttack === true;
          const attackCountOPO = cur.otherState.attacked_signi_ids?.length ?? 0;
          const costColorsOPO = perAttackOPO ? Array<string>(attackCountOPO).fill('無') : costColors;
          const canOppAfford = perAttackOPO
            ? attackCountOPO > 0 && canPayOptionalCost(costColorsOPO, cur.otherState, cur.cardMap)
            : costColorsOPO.length === 0 || canPayOptionalCost(costColorsOPO, cur.otherState, cur.cardMap);
          const payLabel = costColorsOPO.length > 0
            ? `支払う（コスト: ${costColorsOPO.map(c => `《${c}》`).join('')}）`
            : '支払う';
          // 回避手段は「エナ支払い」以外に**手札捨て**と**自分のエナをトラッシュ**を取りうる（タスク12(lxi) 第2波）。
          // いずれも相手が自分の資源を払って効果を回避する枝＝選んだ時点で conditional.then は実行しない。
          // 'ALL' は「手札をすべて捨てる」「エナゾーンにあるすべてのカードをトラッシュに置く」（WX24-P4-023）。
          //
          // ⚠**極性は2種類ある**（§6.4・続き425）。既定は上記の回避ゲート（＝払わなかったら then）だが、
          //   原文「対戦相手は〈コスト〉**してもよい。そうした場合**、X」は**払ったら then** の逆向き。
          //   `thenOnPay` が立っているときだけ then を支払い枝へ移す（既定の65効果には影響しない）。
          const thenOnPay = stub.thenOnPay === true;
          /** 支払い枝のアクション。`thenOnPay` のときだけ帰結（then）を後ろに繋ぐ。 */
          const payBranch = (payment: EffectAction): EffectAction => thenOnPay
            ? { type: 'SEQUENCE', steps: [payment, conditional.then] } as SequenceAction
            : payment;
          const handSpec = stub.opponentHandDiscard;
          const handFilter = stub.opponentHandDiscardFilter;
          const eligibleHand = handFilter
            ? cur.otherState.hand.filter(cn => matchesFilter(cur.cardMap.get(getCardNum(cn)), handFilter))
            : cur.otherState.hand;
          const handCount = handSpec === 'ALL' ? eligibleHand.length : (handSpec ?? 0);
          const handLabelNoun = handFilter?.color ? `${handFilter.color}のカード` : '手札';
          const enSpec = stub.opponentEnergyTrash;
          const enCount = enSpec === 'ALL' ? cur.otherState.energy.length : (enSpec ?? 0);
          const options = [
            // ⚠**エナコストを持つときだけ「支払う」枝を出す**（タスク12(ci)）。costColors 非搭載の
            //   STUB（＝原文の回避手段が手札捨て/エナトラッシュ等**のみ**の札。live 68効果中 33効果）で
            //   無条件に積んでいた結果、`canOppAfford` が `length===0` で常に true になり
            //   **コスト0でタダで回避できる枝**が生まれていた。CPU 自動応答は available な先頭を採るので
            //   意図した discard/energyTrash 枝にも skip（本体発動）にも到達しなくなる。
            //   ⚠`perAttackOPO` で回数0のときも costColorsOPO は空＝ここで枝ごと消えるのが正しい
            //   （既存コメントの「タダで回避できる穴を作らない」意図と一致）。
            ...(costColorsOPO.length > 0 ? [{
              id: 'pay', label: payLabel, action: payBranch(noopAction as EffectAction), available: canOppAfford, costColors: costColorsOPO,
            }] : []),
            ...(handSpec !== undefined && handCount > 0 ? [{
              id: 'discard',
              label: handSpec === 'ALL' ? '手札をすべて捨てる' : `${handLabelNoun}を${handCount}枚捨てる`,
              action: payBranch({
                type: 'TRASH',
                target: { type: 'HAND_CARD', owner: 'opponent', count: handSpec === 'ALL' ? 'ALL' : handCount, ...(handFilter ? { filter: handFilter } : {}) },
              } as EffectAction),
              available: eligibleHand.length >= handCount,
            }] : []),
            // 🆕§6.4 O-9(a)「対戦相手は手札を**N枚まで**捨ててもよい」＝**枚数が可変**。
            // ⚠all-or-nothing の `opponentHandDiscard` で近似すると **0枚かN枚**に丸まり、
            //   「この方法で捨てたカード1枚につきカードを1枚引く」の**中間値が選べない**
            //   （`WXDi-P09-064-E1` は「2枚捨てて2枚引く」か「何もしない」の二択になっていた）。
            //   0枚は既存の skip 枝が担当するので、ここは 1..N を並べる。
            //   帰結（`conditional.then`）は `DRAW{addLastProcessedCount}` 等で**実枚数に追従**させる規約
            //   ＝枚数をここで焼き込まない（`resumeSelectTarget` が `lastProcessedCards` を残す）。
            ...(stub.opponentHandDiscardUpTo !== undefined
              ? Array.from({ length: stub.opponentHandDiscardUpTo }, (_unused, i) => i + 1).map(k => ({
                  id: `discard${k}`,
                  label: `${handLabelNoun}を${k}枚捨てる`,
                  action: payBranch({
                    type: 'TRASH',
                    target: { type: 'HAND_CARD', owner: 'opponent', count: k, ...(handFilter ? { filter: handFilter } : {}) },
                  } as EffectAction),
                  available: eligibleHand.length >= k,
                }))
              : []),
            ...(enSpec !== undefined && enCount > 0 ? [{
              id: 'energyTrash',
              label: enSpec === 'ALL' ? 'エナゾーンのすべてのカードをトラッシュに置く' : `エナゾーンからカードを${enCount}枚トラッシュに置く`,
              action: payBranch({
                type: 'TRASH',
                target: { type: 'ENERGY_CARD', owner: 'opponent', count: enSpec === 'ALL' ? 'ALL' : enCount },
              } as EffectAction),
              available: cur.otherState.energy.length >= enCount,
            }] : []),
            // 「自分のシグニ１体を場からトラッシュに置く」枝（タスク12(lxi) 第3波）。相手が自分の場から選ぶので
            // opponentSelects＝相手側の選択UIに載せる。場のシグニが足りなければ選べない。
            ...(stub.opponentSigniTrash !== undefined && stub.opponentSigniTrash > 0 ? [{
              id: 'signiTrash',
              label: `自分のシグニを${stub.opponentSigniTrash}体トラッシュに置く`,
              action: payBranch({
                type: 'TRASH',
                target: { type: 'SIGNI', owner: 'opponent', count: stub.opponentSigniTrash, filter: { cardType: 'シグニ' } },
                opponentSelects: true,
              } as EffectAction),
              available: cur.otherState.field.signi.filter(s => s && s.length > 0).length >= stub.opponentSigniTrash,
            }] : []),
            ...(stub.opponentSigniToDeckTop !== undefined && stub.opponentSigniToDeckTop > 0 ? [{
              id: 'signiToDeckTop',
              label: `自分のシグニを${stub.opponentSigniToDeckTop}体デッキの一番上に置く`,
              action: payBranch({
                type: 'TRANSFER_TO_DECK',
                source: { type: 'SIGNI', owner: 'opponent', count: stub.opponentSigniToDeckTop, filter: { cardType: 'シグニ' } },
                shuffle: false,
                position: 'top',
                opponentSelects: true,
              } as EffectAction),
              available: cur.otherState.field.signi.filter(s => s && s.length > 0).length >= stub.opponentSigniToDeckTop,
            }] : []),
            // 「エナゾーンのカードと手札を合計N枚デッキの一番上に置く」枝（タスク12(lxi) 第11波・`WXK06-067-E1`）。
            // ⚠**ゾーンを跨ぐ単一プール**＝「手札からN枚」「エナからN枚」の2枝に割ると内訳の自由度を失う
            //   （原文は合計N枚で、手札2／手札1+エナ1／エナ2 のどれでもよい）。
            ...(stub.opponentHandOrEnergyToDeckTop !== undefined && stub.opponentHandOrEnergyToDeckTop > 0 ? [{
              id: 'handOrEnergyToDeckTop',
              label: `手札とエナゾーンから合計${stub.opponentHandOrEnergyToDeckTop}枚をデッキの一番上に置く`,
              action: payBranch({
                type: 'TRANSFER_TO_DECK',
                source: { type: 'HAND_OR_ENERGY_CARD', owner: 'opponent', count: stub.opponentHandOrEnergyToDeckTop },
                shuffle: false,
                position: 'top',
                opponentSelects: true,
              } as EffectAction),
              available: cur.otherState.hand.length + cur.otherState.energy.length >= stub.opponentHandOrEnergyToDeckTop,
            }] : []),
            // ⚠可変枚数（§6.4 O-9(a)）では skip が **「0枚捨てる」**＝原文の合法な選択肢なので、
            //   「支払わない」ではなく枚数の言葉で出す（0枚も選べることが実機で判別できるようにする）。
            {
              id: 'skip',
              label: stub.opponentHandDiscardUpTo !== undefined ? `${handLabelNoun}を捨てない（0枚）` : '支払わない',
              action: thenOnPay ? ((conditional.else ?? noopAction) as EffectAction) : conditional.then,
              available: true,
            },
          ];
          const pending: PendingInteractionDef = {
            type: 'CHOOSE', options, count: 1, opponentResponds: true,
            ...(cont ? { continuation: cont } : {}),
          };
          return needsInteraction(addLog(cur, '対戦相手：コストを支払いますか？'), pending);
        }

        const needsMaregabi = stub.costText?.includes('幻水マレガビ') === true;
        const hasMaregabi = !needsMaregabi || cur.ownerState.hand.some(cn =>
          matchesFilter(cur.cardMap.get(cn), { cardName: '幻水　マレガビ' }));
        const spec = resolveOptionalCostSpec(stub, cur);
        const payColors = spec.costColors;
        const handDiscardGroups = stub.handDiscardGroups ?? [];
        const exceed = stub.exceed ?? 0;
        const exceedPoolCount = exceedPoolCountOf(cur.ownerState);
        const groupsAffordable = handDiscardGroups.every(g =>
          cur.ownerState.hand.filter(n => !g.filter || matchesFilter(cur.cardMap.get(getCardNum(n)), g.filter)).length >= g.count);
        const canAfford = canAffordOptionalCostSpec(spec, cur)
          && hasMaregabi && groupsAffordable && exceedPoolCount >= exceed;
        const paidAction = guardExactOptionalSelectionPayment(spec, freezeStoredTargets(conditional.then, cur));
        const costActions: EffectAction[] = [
          ...(exceed > 0 ? [{ type: 'STUB', id: 'INTERNAL_PAY_EXCEED', value: exceed } as EffectAction] : []),
          ...optionalCostPaySteps(spec),
          ...handDiscardGroups.map(g => ({ type: 'TRASH', asCost: true,
            target: { type: 'HAND_CARD', owner: 'self', count: g.count, filter: g.filter } } as EffectAction)),
        ];
        const payAction: EffectAction = costActions.length > 0
          ? { type: 'SEQUENCE', steps: [...costActions, paidAction] }
          : paidAction;
        // ⚠**「支払わないかぎり」形は文言だけ反転する**（§6.4 O-30）＝機構は同じ（pay→then／skip→else）だが、
        //   「発動する／スキップ」のままだと**払わない方が得に見える**表示になり実機で判断できない。
        const unlessPay = stub.unlessPay === true;
        const payParts = [...payColors.map(c => `《${c}》`), ...optionalCostExtraLabels(spec)];
        const payLabel = payParts.length > 0
          ? `${unlessPay ? '支払う' : '発動する'}（コスト: ${payParts.join('＋')}）`
          : (unlessPay ? '支払う' : '発動する');
        const options = [
          { id: 'pay', label: payLabel, action: payAction, available: canAfford, ...(payColors.length ? { costColors: payColors } : {}) },
          // skip 側（else）も凍結する＝storedTargetCards は resume を跨いで生存しないため、
          // else に targetsStored があると未払い経路で候補が空になり空振りする（WXDi-D08-012 の未払いBANISH）
          { id: 'skip', label: unlessPay ? '支払わない' : 'スキップ', action: freezeStoredTargets((conditional.else ?? noopAction) as EffectAction, cur), available: true },
        ];
        const pending: PendingInteractionDef = {
          type: 'CHOOSE',
          options,
          count: 1,
          ...(cont ? { continuation: cont } : {}),
        };
        return needsInteraction(addLog(cur, '任意コスト：発動しますか？'), pending);
      }

      // Pattern ④ 追加コスト強化: STUB ... BASE_STEPS ... CONDITIONAL(IS_MY_TURN|PAID_ADDITIONAL_COST)
      // (直後でなく離れた位置にある CONDITIONAL を先読みしてインタラクションを生成)
      {
        const stub4 = step as import('../types/effects').StubAction;
        const optIds = ['OPTIONAL_COST', 'TARGET_OPP_SIGNI_OPTIONAL_COLOR_COST', 'OPTIONAL_TRASH_ENERGY_CLASS'];
        if (stub4.id === 'OPTIONAL_COST' && stub4.additionalCostChoices?.length) {
          const remaining = a.steps.slice(i + 1);
          const continuation: EffectAction | undefined = remaining.length === 0 ? undefined
            : remaining.length === 1 ? remaining[0]
            : { type: 'SEQUENCE', steps: remaining } as SequenceAction;
          const options = [
            ...stub4.additionalCostChoices.map(choice => ({
              id: choice.id,
              label: choice.label,
              action: choice.action,
              available: canPayOptionalCost(choice.costColors, cur.ownerState, cur.cardMap),
              costColors: choice.costColors,
            })),
            {
              id: 'skip',
              label: '追加コストを支払わない',
              action: stub4.unpaidAction ?? (({ type: 'SEQUENCE', steps: [] } as SequenceAction) as EffectAction),
              available: true,
            },
          ];
          return needsInteraction(addLog(cur, '追加コストを選んでください'), {
            type: 'CHOOSE',
            options,
            count: 1,
            ...(continuation ? { continuation } : {}),
          });
        }
        if (optIds.includes(stub4.id)) {
          const condIdx = a.steps.findIndex((s, idx) => {
            if (idx <= i + 1) return false;
            if (s?.type !== 'CONDITIONAL') return false;
            const c = (s as ConditionalAction).condition.type;
            return c === 'IS_MY_TURN' || c === 'PAID_ADDITIONAL_COST';
          });
          if (condIdx > i + 1) {
            const conditional4 = a.steps[condIdx] as ConditionalAction;
            const baseSteps = a.steps.slice(i + 1, condIdx);
            const remaining4 = a.steps.slice(condIdx + 1);
            const noopAction4: SequenceAction = { type: 'SEQUENCE', steps: [] };
            const baseAction4: EffectAction = baseSteps.length === 0 ? noopAction4
              : baseSteps.length === 1 ? baseSteps[0]
              : { type: 'SEQUENCE', steps: baseSteps } as SequenceAction;
            const cont4: EffectAction | undefined = remaining4.length > 0
              ? (remaining4.length === 1 ? remaining4[0] : { type: 'SEQUENCE', steps: remaining4 } as SequenceAction)
              : undefined;
            const isAdditional = conditional4.condition.type === 'PAID_ADDITIONAL_COST';
            const freezeStoredTargets4 = (action: EffectAction): EffectAction => freezeStoredTargets(action, cur);
            const paidBody4Raw: EffectAction = isAdditional
              ? (baseSteps.length === 0
                  ? conditional4.then
                  : { type: 'SEQUENCE', steps: [...baseSteps, conditional4.then] } as SequenceAction)
              : conditional4.then; // replace mode: 強化効果のみ
            const paidBody4 = freezeStoredTargets4(paidBody4Raw);
            const spec4 = resolveOptionalCostSpec(stub4, cur);
            const costColors4 = spec4.costColors;
            const handDiscardGroups4 = stub4.handDiscardGroups ?? [];
            const exceed4 = stub4.exceed ?? 0;
            const exceedPoolCount4 = exceedPoolCountOf(cur.ownerState);
            const groupsAffordable4 = handDiscardGroups4.every(g =>
              cur.ownerState.hand.filter(n => !g.filter || matchesFilter(cur.cardMap.get(getCardNum(n)), g.filter)).length >= g.count);
            const canAfford4 = canAffordOptionalCostSpec(spec4, cur)
              && groupsAffordable4 && exceedPoolCount4 >= exceed4;
            const costActions4: EffectAction[] = [
              ...(exceed4 > 0 ? [{ type: 'STUB', id: 'INTERNAL_PAY_EXCEED', value: exceed4 } as EffectAction] : []),
              ...optionalCostPaySteps(spec4),
              ...handDiscardGroups4.map(g => ({ type: 'TRASH', asCost: true,
                target: { type: 'HAND_CARD', owner: 'self', count: g.count, filter: g.filter } } as EffectAction)),
            ];
            const payAction4: EffectAction = costActions4.length
              ? { type: 'SEQUENCE', steps: [...costActions4, paidBody4] }
              : paidBody4;
            // ⚠**このシグニ自身を失う対価はラベルに出す**（§6.4 O-26・続き535）。色だけ並べると
            //   「《無》を1つ払うだけ」に見えるのに実際は場のシグニが1体消える＝選択を誤らせる。
            const payParts4 = [...costColors4.map(c => `《${c}》`), ...optionalCostExtraLabels(spec4)];
            const payLabel4 = payParts4.length > 0
              ? `追加コスト支払う（${payParts4.join('＋')}）`
              : '追加コストを支払う';
            const opts4 = [
              { id: 'pay', label: payLabel4, action: payAction4, available: canAfford4, ...(costColors4.length ? { costColors: costColors4 } : {}) },
              // skip 側も凍結（site A と同じ理由＝storedTargetCards は resume を跨がない）
              { id: 'skip', label: 'スキップ（基本効果のみ）', action: freezeStoredTargets4(baseAction4), available: true },
            ];
            const pending4: PendingInteractionDef = {
              type: 'CHOOSE', options: opts4, count: 1,
              ...(cont4 ? { continuation: cont4 } : {}),
            };
            return needsInteraction(addLog(cur, '追加コスト：支払いますか？'), pending4);
          }
        }
      }
      // Pattern ⑤: OPTIONAL_COST (後続のCONDITIONALなし)
      // pay → 残りステップ実行; skip → 残りステップをスキップ
      {
        const stub5 = step as import('../types/effects').StubAction;
        // OPTIONAL_ACTIVATE＝**コストの無い**任意効果（「〜してもよい」／【出】英知＝N）の発動可否だけを問う形
        // （タスク12(xxix)(2)）。支払い機構は同じで良いが、コスト0で「支払う」と表示すると意味が通らないので
        // 文言だけ分ける。resolveOptionalCostSpec は空 spec を返し canAfford は常に true。
        const optIds5 = ['OPTIONAL_COST', 'TARGET_OPP_SIGNI_OPTIONAL_COLOR_COST', 'OPTIONAL_TRASH_ENERGY_CLASS', 'OPTIONAL_ACTIVATE'];
        if (optIds5.includes(stub5.id)) {
          // 「この方法で払ったカード」参照は任意コスト1解決ごとの値。前の効果の記録を
          // pay/skip のどちらでも持ち越さない（参照不能時は resolveDynamicFilter が空ヒットへ倒す）。
          cur = {
            ...cur,
            ownerState: {
              ...cur.ownerState,
              last_cost_hand_to_energy_level: undefined,
              last_cost_energy_trash_level_sum: undefined,
              // 枚数側も同じ寿命（execTrash{asCost} が累算するため、クリアしないと前の効果の
              // 支払い枚数が costThresholdFromPaidCount の閾値に足し込まれて上限が膨らむ）。
              last_cost_energy_trash_count: undefined,
            },
          };
          const activateOnly5 = stub5.id === 'OPTIONAL_ACTIVATE';
          const remaining5 = a.steps.slice(i + 1);
          const noopAction5: SequenceAction = { type: 'SEQUENCE', steps: [] };
          const cont5: EffectAction = remaining5.length > 0
            ? (remaining5.length === 1 ? remaining5[0] : { type: 'SEQUENCE', steps: remaining5 } as SequenceAction)
            : noopAction5;
          const additionalCostChoose5 = cont5.type === 'CHOOSE'
            && !!(cont5 as ChooseAction).additionalCostChoose;
          // この文型では任意支払いの成否にかかわらず後続の選択効果を実行し、
          // 支払った場合だけ ARTS_EXTRA_COST_CONDITION の選択数を増やす。
          if (stub5.id === 'OPTIONAL_TRASH_ENERGY_CLASS'
              && cont5.type === 'STUB' && cont5.id === 'ARTS_EXTRA_COST_CONDITION') {
            const src5 = cur.sourceCardNum ? cur.cardMap.get(cur.sourceCardNum) : undefined;
            const txt5 = src5?.EffectText ?? '';
            const toHW5 = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
            const clause5 = txt5.match(/エナゾーンから(?:あなたの)?(?:＜([^＞]+)＞の)?(?:シグニ|カード)([０-９\d]+)枚を?トラッシュ/);
            const cls5 = clause5?.[1] ?? '';
            const count5 = clause5?.[2] ? parseInt(toHW5(clause5[2])) : 1;
            const candidates5 = cur.ownerState.energy.filter(cn => !cls5 || (cur.cardMap.get(getCardNum(cn))?.CardClass ?? '').includes(cls5));
            const pay5: EffectAction = { type: 'SEQUENCE', steps: [
              { type: 'STUB', id: 'INTERNAL_OTEC_SELECT', value: `trash:${cls5}:${count5}` } as StubAction,
              cont5,
            ] } as SequenceAction;
            const skip5: EffectAction = { type: 'SEQUENCE', steps: [
              { type: 'STUB', id: 'INTERNAL_OTEC_SKIP' } as StubAction,
              cont5,
            ] } as SequenceAction;
            return needsInteraction(addLog(cur, '任意エナコスト：支払いますか？'), {
              type: 'CHOOSE', count: 1, options: [
                { id: 'pay', label: cls5 ? `エナ＜${cls5}＞${count5}枚をトラッシュ` : `エナ${count5}枚をトラッシュ`, action: pay5, available: candidates5.length >= count5 },
                { id: 'skip', label: '支払わない', action: skip5, available: true },
              ],
            });
          }
          // 可変枚数コストは Pattern ⑦ と同じく 0..N の CHOOSE で解決する。
          if (stub5.charmTrashVariable || stub5.lrigDownVariable) {
            const max5 = stub5.charmTrashVariable
              ? (cur.ownerState.field.signi_charms ?? []).filter(Boolean).length
              : [
                  cur.ownerState.field.lrig.length > 0 && !cur.ownerState.field.lrig_down,
                  (cur.ownerState.field.assist_lrig_l?.length ?? 0) > 0 && !cur.ownerState.field.assist_lrig_l_down,
                  (cur.ownerState.field.assist_lrig_r?.length ?? 0) > 0 && !cur.ownerState.field.assist_lrig_r_down,
                ].filter(Boolean).length;
            const min5 = stub5.charmTrashVariable?.min ?? stub5.lrigDownVariable?.min ?? 0;
            const options5 = Array.from({ length: max5 - min5 + 1 }, (_, offset) => {
              const n = min5 + offset;
              const payStub = stub5.charmTrashVariable
                ? ({ type: 'STUB', id: 'INTERNAL_PAY_CHARM_TRASH_VARIABLE', charmTrash: n } as import('../types/effects').StubAction)
                : ({ type: 'STUB', id: 'INTERNAL_PAY_LRIG_DOWN_VARIABLE', lrigDownVariableCount: n } as import('../types/effects').StubAction);
              return {
                id: `variable_cost_${n}`,
                label: stub5.charmTrashVariable ? `【チャーム】${n}枚をトラッシュ` : `ルリグ${n}体をダウン`,
                action: ({ type: 'SEQUENCE', steps: [payStub, freezeStoredTargets(cont5, cur)] } as SequenceAction) as EffectAction,
                available: true,
              };
            });
            return needsInteraction(addLog(cur, '支払う枚数を選択'), {
              type: 'CHOOSE', options: options5, count: 1,
            });
          }
          const spec5 = resolveOptionalCostSpec(stub5, cur);
          const costColors5 = spec5.costColors;
          const coinCost5 = stub5.coinCost ?? 0;
          const handDiscardGroups5 = stub5.handDiscardGroups ?? [];
          const exceed5 = stub5.exceed ?? 0;
          const groupsAffordable5 = handDiscardGroups5.every(g =>
            cur.ownerState.hand.filter(n => !g.filter || matchesFilter(cur.cardMap.get(getCardNum(n)), g.filter)).length >= g.count);
          const canAfford5 = canAffordOptionalCostSpec(spec5, cur)
            && (cur.ownerState.coins ?? 0) >= coinCost5
            && groupsAffordable5
            && exceedPoolCountOf(cur.ownerState) >= exceed5;
          const costParts5 = [
            ...costColors5.map(c => `《${c}》`),
            ...(coinCost5 > 0 ? [`《コイン》×${coinCost5}`] : []),
            ...(exceed5 > 0 ? [`エクシード${exceed5}`] : []),
          ];
          // ⚠**このシグニ自身を失う対価はラベルに出す**（§6.4 O-26・続き535＝site4 と同じ理由）。
          const payParts5 = [...costParts5, ...optionalCostExtraLabels(spec5)];
          const payLabel5 = activateOnly5 ? '発動する'
            : payParts5.length > 0 ? `支払う（${payParts5.join('')}）` : '支払う';
          const paySteps5: EffectAction[] = [
            ...(exceed5 > 0 ? [{ type: 'STUB', id: 'INTERNAL_PAY_EXCEED', value: exceed5 } as EffectAction] : []),
            ...optionalCostPaySteps(spec5),
            ...handDiscardGroups5.map(g => ({ type: 'TRASH', asCost: true,
              target: { type: 'HAND_CARD', owner: 'self', count: g.count, filter: g.filter } } as EffectAction)),
            ...(additionalCostChoose5 ? [{ type: 'STUB', id: 'INTERNAL_SET_OPTIONAL_EFFECT_TAKEN' } as EffectAction] : []),
          ];
          const payAction5: EffectAction = paySteps5.length > 0
            ? { type: 'SEQUENCE', steps: [...paySteps5, freezeStoredTargets(cont5, cur)] }
            : cont5;
          const options5 = [
            { id: 'pay', label: payLabel5, action: payAction5, available: canAfford5, ...(costColors5.length ? { costColors: costColors5 } : {}), ...(coinCost5 > 0 ? { coinCost: coinCost5 } : {}) },
            { id: 'skip', label: activateOnly5 ? '発動しない' : 'スキップ', action: additionalCostChoose5
              ? ({ type: 'SEQUENCE', steps: [{ type: 'STUB', id: 'INTERNAL_CLEAR_OPTIONAL_EFFECT_TAKEN' }, freezeStoredTargets(cont5, cur)] } as SequenceAction)
              : noopAction5 as EffectAction, available: true },
          ];
          const pending5: PendingInteractionDef = { type: 'CHOOSE', options: options5, count: 1 };
          return needsInteraction(addLog(cur, activateOnly5 ? '任意効果：発動しますか？' : '任意コスト：支払いますか？'), pending5);
        }
      }
      // Pattern ⑥: TARGET_AND_DISCARD_HAND
      // 手札1枚を自動捨て → 残りステップへ続行（ターゲットは後続ステップが独立して選択）
      if (step.type === 'STUB' && (step as import('../types/effects').StubAction).id === 'TARGET_AND_DISCARD_HAND') {
        if (cur.ownerState.hand.length > 0) {
          const discardIdx = cur.ownerState.hand.length - 1;
          const discarded = cur.ownerState.hand[discardIdx];
          const newOwnerHand = [...cur.ownerState.hand.slice(0, discardIdx)];
          const newOwnerTrash = [...cur.ownerState.trash, discarded];
          const discardName = cur.cardMap.get(discarded)?.CardName ?? discarded;
          cur = {
            ...cur,
            ownerState: { ...cur.ownerState, hand: newOwnerHand, trash: newOwnerTrash },
            logs: [...cur.logs, `手札を捨て対戦相手シグニを対象に（${discardName}を捨て）`],
          };
        } else {
          cur = { ...cur, logs: [...cur.logs, '手札なし（TARGET_AND_DISCARD_HAND）'] };
        }
        continue;
      }
      // Pattern ⑦: REMOVE_VIRUS + TRANSFER_TO_HAND (好きな数取り除く → N枚手札へ)
      if (step.type === 'STUB' && (step as import('../types/effects').StubAction).id === 'REMOVE_VIRUS') {
        const nextRV7 = i + 1 < a.steps.length ? a.steps[i + 1] : undefined;
        if (nextRV7?.type === 'TRANSFER_TO_HAND') {
          const virusArrRV7 = cur.otherState.field.signi_virus ?? [0, 0, 0];
          const totalRV7 = virusArrRV7.reduce((s, v) => s + v, 0);
          const remainingRV7 = a.steps.slice(i + 2);
          const contRV7: EffectAction | undefined = remainingRV7.length > 0
            ? (remainingRV7.length === 1 ? remainingRV7[0] : { type: 'SEQUENCE', steps: remainingRV7 } as import('../types/effects').SequenceAction)
            : undefined;
          if (totalRV7 === 0) {
            i++; // TRANSFER_TO_HAND もスキップ
            cur = addLog(cur, 'ウイルスなし（REMOVE_VIRUS+TRANSFER スキップ）');
            continue;
          }
          const optsRV7 = Array.from({ length: totalRV7 + 1 }, (_, n) => ({
            id: `rv7_${n}`,
            label: n === 0 ? '取り除かない' : `【ウィルス】${n}つ取り除く（シグニ${n}枚手札へ）`,
            action: ({ type: 'STUB', id: 'INTERNAL_RV_BATCH_TRANSFER', value: n } as import('../types/effects').StubAction) as EffectAction,
            available: true,
          }));
          return needsInteraction(addLog(cur, '取り除く【ウィルス】数を選択'), {
            type: 'CHOOSE', options: optsRV7, count: 1, ...(contRV7 ? { continuation: contRV7 } : {}),
          });
        }
      }
    }
    // 自分のHAND_CARD/SIGNI/ENERGY_CARDのTRASH実行前にlastProcessedCardsをリセット（対象なし判定のため）
    if (step.type === 'TRASH') {
      const tA = step as import('../types/effects').TrashAction;
      if (tA.target.owner === 'self' &&
          (tA.target.type === 'HAND_CARD' || tA.target.type === 'SIGNI' || tA.target.type === 'ENERGY_CARD')) {
        cur = { ...cur, lastProcessedCards: [] };
      }
    }
    // 自分の DOWN（このシグニをダウン）実行前にもリセット（ダウン不可＝対象なしなら「そうした場合」をスキップ。WD12-013/015）
    if (step.type === 'DOWN') {
      const dA = step as DownAction;
      if (dA.target.owner === 'self') cur = { ...cur, lastProcessedCards: [] };
    }
    // did-it ゲート追加型は、候補0件や配置不能の done(ctx) が直前ステップの記録を持ち越さないよう
    // 実行直前に空へ倒す。成功時は各 direct/選択再開経路が選択カードを必ず書き直す。
    if (step.type === 'REVEAL' || step.type === 'TAKE_FROM_UNDER_SIGNI'
        || step.type === 'REMOVE_CHARM'
        || step.type === 'FIELD_SIGNI_TO_ACCE') {
      cur = { ...cur, lastProcessedCards: [] };
    }
    const ctxBeforeStep = cur;
    const result = executeAction(step, cur);
    if (!result.done) {
      // インタラクション必要：残りのステップをcontinuationに入れる。
      // 🔴**入れ子 SEQUENCE では合成する**＝内側が既に continuation（内側の残りステップ）を積んでいるのに
      //   外側が上書きすると、内側の残りが**無言で消える**（§6.4 O-28 で発見＝`WX24-P4-001-E1` は
      //   SEQUENCE[SEQUENCE[対象宣言,STORE,ban], GRANT_EFFECT] で、対象宣言の対話に入った瞬間
      //   STORE と ban が落ちて**丸ごと no-op**になっていた。STUB ですらないので計器にも映らない）。
      const innerCont = result.pending.continuation;
      const chain: EffectAction[] = [...(innerCont ? [innerCont] : []), ...a.steps.slice(i + 1)];
      const cont: EffectAction | undefined = chain.length === 0 ? undefined
        : chain.length === 1 ? chain[0]
        : { type: 'SEQUENCE', steps: chain };
      const pending: PendingInteractionDef = cont
        ? { ...result.pending, continuation: cont }
        : result.pending;
      return { ...result, pending };
    }
      cur = { ...cur, ownerState: result.ownerState, otherState: result.otherState, logs: result.logs, lastProcessedCards: result.lastProcessedCards, lastLookTrashedCards: result.lastLookTrashedCards ?? cur.lastLookTrashedCards, storedTargetCards: result.storedTargetCards ?? cur.storedTargetCards, fieldTrashCostCards: result.fieldTrashCostCards ?? cur.fieldTrashCostCards, trapActivated: result.trapActivated ?? cur.trapActivated, trapSetOwners: result.trapSetOwners ?? cur.trapSetOwners };
    // did-it ゲートは「条件で包まれた前段」も対象にする（タスク12(lxiii)＝`WXK11-031-E1`
    // 「〈ライフ比較〉の場合、手札を1枚捨ててもよい。そうした場合、それをバニッシュする」）。
    // 包む前は TRASH が直下ステップだったので下のゲートが効いていたが、条件を付与した途端に外れて
    // **条件不成立でも本体が撃てる過剰実行**になる。else 付き（分岐が別にある）は対象外。
    const gateStep: EffectAction = (step.type === 'CONDITIONAL' && !(step as ConditionalAction).else)
      ? (step as ConditionalAction).then : step;
    // 包み条件が不成立なら中身は動いていない＝空振り扱いにする。lastProcessedCards の中身だけを見ると、
    // 先行の SELECT_TARGET_ONLY（対象宣言）が残した値を「前段が処理した」と誤読して本体が撃ててしまう
    // （タスク12(lxiv) で対象宣言ステップを前置したため顕在化）。
    const wrapCondFalse = gateStep !== step
      && !evalCondition((step as ConditionalAction).condition, ctxBeforeStep);
    const effLastProcessed = wrapCondFalse ? [] : (cur.lastProcessedCards ?? []);
    // 自分のTRASH（HAND_CARD/SIGNI/ENERGY_CARD）が対象なし（done だが lastProcessedCards 空）→ 残りSEQUENCEをスキップ
    if (gateStep.type === 'TRASH' && i + 1 < a.steps.length) {
      const tA = gateStep as import('../types/effects').TrashAction;
      if (tA.target.owner === 'self' && !tA.bestEffort &&
          (tA.target.type === 'HAND_CARD' || tA.target.type === 'SIGNI' || tA.target.type === 'ENERGY_CARD') &&
          effLastProcessed.length === 0) {
        return done(addLog(cur, 'TRASH対象なし：残りのSEQUENCEをスキップ'));
      }
    }
    // 自分の DOWN がダウン不可（アップ状態でない等で対象なし＝done だが lastProcessedCards 空）→ 残り（「そうした場合」）をスキップ
    if (gateStep.type === 'DOWN' && i + 1 < a.steps.length) {
      const dA = gateStep as DownAction;
      if (dA.target.owner === 'self' && effLastProcessed.length === 0) {
        return done(addLog(cur, 'ダウン不可：残りのSEQUENCEをスキップ'));
      }
    }
    // 「そうした場合」＝CONDITIONAL{IS_MY_TURN} プレースホルダの did-it ゲート（タスク12(xxix)③）。
    // parser は「そうした場合、」を常時 true の IS_MY_TURN で表す慣例エンコード（§9-9）のため、
    // 前段が空振り（対象なし＝lastProcessedCards 空）でも本体が実行される＝**過剰発火**だった。
    // 上の TRASH/DOWN 専用ゲートは「残りのSEQUENCEを丸ごと捨てる」粗い形なので既存挙動のまま温存し、
    // ここでは**プレースホルダ1ステップだけを消費**して以降の独立ステップは残す（過剰も過小も作らない）。
    // 対象は「処理したカードを lastProcessedCards に記録する＝空振りを判定できる」型に限定する
    // （DRAW/SHUFFLE_DECK 等の常に成功する型を入れると逆に正しい発火を殺すため入れない）。
    if (DID_IT_GATED_TYPES.has(gateStep.type) && i + 1 < a.steps.length
        && effLastProcessed.length === 0) {
      const nextDI = a.steps[i + 1];
      if (nextDI?.type === 'CONDITIONAL' && (nextDI as ConditionalAction).condition.type === 'IS_MY_TURN') {
        cur = addLog(cur, '前段が空振り：「そうした場合」の効果は発生しない');
        i++;  // プレースホルダを消費
        const elseDI = (nextDI as ConditionalAction).else;
        if (elseDI) {
          const resElse = executeAction(elseDI, cur);
          if (!resElse.done) {
            // ⚠上と同じ規約＝内側が既に持っている continuation は**合成する**（上書きすると無言で消える）。
            const innerElse = resElse.pending.continuation;
            const chainElse: EffectAction[] = [...(innerElse ? [innerElse] : []), ...a.steps.slice(i + 1)];
            const contElse: EffectAction | undefined = chainElse.length === 0 ? undefined
              : chainElse.length === 1 ? chainElse[0]
              : { type: 'SEQUENCE', steps: chainElse };
            return { ...resElse, pending: contElse ? { ...resElse.pending, continuation: contElse } : resElse.pending };
          }
          cur = { ...cur, ownerState: resElse.ownerState, otherState: resElse.otherState, logs: resElse.logs, lastProcessedCards: resElse.lastProcessedCards };
        }
        continue;
      }
    }
  }
  return done(cur);
}

function execChoose(a: ChooseAction, ctx: ExecCtx): ExecResult {
  const options = a.choices.map(ch => ({
    id: ch.choiceId,
    label: ch.label,
    action: ch.action,
    available: ch.condition ? evalCondition(ch.condition, ctx) : true,
  }));
  let effectiveCount = a.choose_count;
  let effectiveUpTo = a.upTo ?? false;
  // リコレクト条件: トラッシュの<プリオケ>カード数が閾値以上なら choose_count/upTo を上書き
  if (a.recollect) {
    const priokeCount = ctx.ownerState.trash.filter(n =>
      (ctx.cardMap.get(n)?.CardClass ?? '').includes('プリオケ'),
    ).length;
    if (priokeCount >= a.recollect.minCount) {
      effectiveCount = a.recollect.thenChooseCount;
      effectiveUpTo = a.recollect.thenUpTo ?? false;
    }
  }
  // 《リコレクトアイコン》条件: ルリグトラッシュのアーツ枚数が閾値以上なら choose_count/upTo を上書き。
  // 使用中のアーツ自身(sourceCardNum)はまだルリグトラッシュに置かれていない扱いのため数えない。
  if (a.recollectArts) {
    const artsCount = ctx.ownerState.lrig_trash.filter(n =>
      n !== ctx.sourceCardNum && ctx.cardMap.get(n)?.Type === 'アーツ',
    ).length;
    if (artsCount >= a.recollectArts.minArts) {
      effectiveCount = a.recollectArts.thenChooseCount;
      effectiveUpTo = a.recollectArts.thenUpTo ?? false;
    }
  }
  // ベット条件: このアーツ/スペルでベットを宣言していたら choose_count/upTo を上書き（recollectArts と同型）。
  if (a.betChoose && ctx.ownerState.is_betting_this_effect) {
    effectiveCount = a.betChoose.thenChooseCount;
    effectiveUpTo = a.betChoose.thenUpTo ?? false;
  }
  if (a.preUseVirusChoose && (ctx.preUseVirusRemoved ?? 0) >= a.preUseVirusChoose.minRemoved) {
    effectiveCount = a.preUseVirusChoose.thenChooseCount;
    effectiveUpTo = a.preUseVirusChoose.thenUpTo ?? false;
  }
  if (a.additionalCostChoose && ctx.ownerState.self_optional_effect_taken) {
    effectiveCount = a.additionalCostChoose.thenChooseCount;
    effectiveUpTo = a.additionalCostChoose.thenUpTo ?? false;
  }
  // 汎用の盤面条件による上書き（§6.4 O-11）＝上の5本と違いトリガーを型名に焼き込まない。
  if (a.conditionChoose && evalCondition(a.conditionChoose.condition, ctx)) {
    effectiveCount = a.conditionChoose.thenChooseCount;
    effectiveUpTo = a.conditionChoose.thenUpTo ?? false;
  }
  // 選択数そのものが実行時に決まる形（§6.4 O-11）。
  // ⚠**0 のときは選ばせない**＝「捨てた枚数と同じ数だけ選ぶ」で0枚捨てたのに1つ選べると過剰実行になる。
  if (a.countChoose) {
    effectiveCount = Math.max(0, resolveCountRef(a.countChoose.count, ctx, a.countChoose.countFromZone));
    effectiveUpTo = a.countChoose.upTo ?? false;
    if (effectiveCount === 0) return done(addLog(ctx, '選択数0（選ばない）'));
    // 同じ選択肢を繰り返せない通常形では、存在する選択肢数を越える要求を作らない。
    if (!a.allowRepeat) effectiveCount = Math.min(effectiveCount, options.filter(o => o.available).length);
    if (effectiveCount === 0) return done(addLog(ctx, '選択可能な選択肢0（選ばない）'));
  }
  const chooseCtx = a.additionalCostChoose
    ? { ...ctx, ownerState: { ...ctx.ownerState, self_optional_effect_taken: false } }
    : ctx;
  return needsInteraction(chooseCtx, {
    type: 'CHOOSE', options, count: effectiveCount,
    ...(effectiveUpTo || effectiveCount > 1 ? { multiSelect: true } : {}),
    ...(effectiveUpTo ? { upTo: true } as Record<string, unknown> : {}),
    // 「同じ選択肢を２回以上選んでもよい」（§6.4 O-29）＝UI を回数マップへ切り替える。
    // ⚠**選択数が1のときは意味が無い**ので立てない（`multiSelect` が付かず単発UIになるため）。
    ...(a.allowRepeat && effectiveCount > 1 ? { allowRepeat: true, multiSelect: true } : {}),
    ...(a.opponentResponds ? { opponentResponds: true } : {}),
    ...(a.costlessOpponentChoice ? { costlessOpponentChoice: true } : {}),
  } as PendingInteractionDef & { type: 'CHOOSE' });
}

function execConditional(a: ConditionalAction, ctx: ExecCtx): ExecResult {
  const cond = evalCondition(a.condition, ctx);
  if (cond) return executeAction(a.then, ctx);
  if (a.else) return executeAction(a.else, ctx);
  return done(ctx);
}

/**
 * `SELECT_COLOR`（§5.3 `O-87`）＝色を選択する。選んだ色は `story_overrides['__selected_colors__']` に
 * 溜まり、`SELECTED_COLOR` 条件が読む（`WX10-025` が使っていた既存の store をそのまま使う）。
 *
 * ⚠**初回に必ずクリアする**＝同じターンに2度撃つと前回の色が残って条件が誤成立する。
 * ⚠`from:'last_processed'` は**カード1枚につき1色**（原文「カード１枚につきそのカードに含まれる色１つ」）＝
 *   1色しか持たないカードは選ぶ余地が無いので自動確定し、対話は**多色カードのぶんだけ**出す。
 * 🔴旧 `STUB{CHOOSE_COLOR_FROM_LIST}` は**カード全文を `最大N色` で読んでいた**（§5.3 `O-60` A群）＝
 *   payload 化してその regex を撤去した。
 */
function execSelectColor(a: SelectColorAction, ctx: ExecCtx): ExecResult {
  const COLORS = ['白', '赤', '青', '緑', '黒'];
  const colorsOf = (cardNum: string): string[] =>
    [...(ctx.cardMap.get(getCardNum(cardNum))?.Color ?? '')].filter(c => COLORS.includes(c));
  // 2周目以降（`_cards` 付き）はクリアしない＝1枚目で選んだ色を消してしまう。
  let base = ctx;
  if (!a._cards) {
    const cleared = { ...(ctx.ownerState.story_overrides ?? {}) };
    delete cleared['__selected_colors__'];
    base = { ...ctx, ownerState: { ...ctx.ownerState, story_overrides: cleared } };
  }

  if (a.from === 'last_processed') {
    const queue = (a._cards ?? ctx.lastProcessedCards ?? []).filter(cn => colorsOf(cn).length > 0);
    if (queue.length === 0) return done(addLog(base, '色選択：対象カードに色がない'));
    const [head, ...tail] = queue;
    const cols = colorsOf(head);
    const name = ctx.cardMap.get(getCardNum(head))?.CardName ?? head;
    const restAct: EffectAction | undefined = tail.length > 0
      ? ({ ...a, _cards: tail } as SelectColorAction) as EffectAction
      : undefined;
    // 単色＝選ぶ余地が無いので自動確定（対話を出さない）
    if (cols.length === 1) {
      const applied = pushSelectedColor(cols[0], base);
      return restAct ? executeAction(restAct, applied) : done(applied);
    }
    return needsInteraction(addLog(base, `${name}に含まれる色を1つ選択`), {
      type: 'CHOOSE',
      count: 1,
      options: cols.map(col => ({
        id: `color_${col}`,
        label: `《${col}》を選ぶ（${name}）`,
        action: ({ type: 'STUB', id: 'INTERNAL_SELECT_COLOR', value: col } as StubAction) as EffectAction,
        available: true,
      })),
      ...(restAct ? { continuation: restAct } : {}),
    } as PendingInteractionDef);
  }

  // from:'energy'＝エナゾーンにあるカードが持つ色から最大 count 色（`WX10-025`）。
  const enaColors = [...new Set(ctx.ownerState.energy.flatMap(colorsOf))];
  if (enaColors.length === 0) return done(addLog(base, '色選択：エナに色なし'));
  const max = Math.max(1, a.count ?? 1);
  return needsInteraction(addLog(base, `色を選択（最大${max}色）`), {
    type: 'CHOOSE',
    count: Math.min(max, enaColors.length),
    options: enaColors.map(col => ({
      id: `color_${col}`,
      label: `《${col}》を選ぶ`,
      action: ({ type: 'STUB', id: 'INTERNAL_SELECT_COLOR', value: col } as StubAction) as EffectAction,
      available: true,
    })),
  } as PendingInteractionDef);
}

/**
 * 選んだ色を `__selected_colors__` へ積む。⚠**`INTERNAL_SELECT_COLOR`（execStubPart3）と同じ動作**＝
 * 対話を経る枝はそちら、単色で自動確定する枝はこちらを通る。**片方だけ直さないこと。**
 */
function pushSelectedColor(color: string, ctx: ExecCtx): ExecCtx {
  const prev = ctx.ownerState.story_overrides?.['__selected_colors__']?.split(',').filter(Boolean) ?? [];
  const ov = { ...(ctx.ownerState.story_overrides ?? {}), '__selected_colors__': [...prev, color].join(',') };
  return addLog({ ...ctx, ownerState: { ...ctx.ownerState, story_overrides: ov } }, `《${color}》を選択`);
}

function execRepeat(a: RepeatAction, ctx: ExecCtx): ExecResult {
  // §5.3 `O-87`＝回数を実行時に解決する（「この方法で手札に加えた【トラップ】1つにつき」）。
  // ⚠**解決した回数を `count` へ焼き込んでから回す**＝周回の途中で `lastProcessedCards` が
  //   書き換わる（設置は選択 UI を通る）ので、毎周 `$ref` を引き直すと回数が変わる。
  if (a.countRef !== undefined) {
    const resolved = Math.max(0, resolveCountRef(a.countRef, ctx));
    const { countRef: _cr, ...rest } = a;
    if (resolved <= 0) return done(addLog(ctx, '繰り返し回数0（対象なし）'));
    return execRepeat({ ...rest, count: resolved } as RepeatAction, ctx);
  }
  if (a.count <= 0) return done(ctx);
  // 「あとN回まで繰り返して**もよい**」（§6.4 O-32・`WX16-042-E1`）＝1周ごとに可否を問う。
  // ⚠**問うのは実行の前**＝「繰り返さない」を選んだ時点で残り周回ごと打ち切る（`count` は減らさない）。
  //   後ろで問う形にすると最後の1周が必ず走って原文より1回多くなる。
  if (a.optional) {
    const perform = { ...a, optional: false, count: 1 } as RepeatAction;
    const rest: EffectAction | undefined = a.count > 1
      ? ({ type: 'REPEAT', count: a.count - 1, action: a.action, optional: true } as RepeatAction)
      : undefined;
    const yes: EffectAction = rest
      ? ({ type: 'SEQUENCE', steps: [perform, rest] } as SequenceAction)
      : (perform as EffectAction);
    return needsInteraction(ctx, {
      type: 'CHOOSE', count: 1, options: [
        { id: 'repeat', label: `繰り返す（残り${a.count}回まで）`, action: yes, available: true },
        { id: 'stop', label: '繰り返さない', action: { type: 'SEQUENCE', steps: [] } as EffectAction, available: true },
      ],
    });
  }
  const continuation: EffectAction | undefined = a.count > 1
    ? { type: 'REPEAT', count: a.count - 1, action: a.action }
    : undefined;
  const result = executeAction(a.action, ctx);
  if (!result.done) {
    if (continuation) {
      const existing = result.pending.continuation;
      result.pending = {
        ...result.pending,
        continuation: existing
          ? { type: 'SEQUENCE', steps: [existing, continuation] }
          : continuation,
      };
    }
    return result;
  }
  return continuation
    ? executeAction(continuation, {
        ...ctx,
        ownerState: result.ownerState,
        otherState: result.otherState,
        logs: result.logs,
        lastProcessedCards: result.lastProcessedCards,
      })
    : result;
}

function execPreventRefresh(_a: PreventRefreshAction, ctx: ExecCtx): ExecResult {
  return done(addLog({
    ...ctx,
    ownerState: {
      ...ctx.ownerState,
      prevent_refresh_until_opp_turn: true,
    },
  }, 'このターンと次のターンの間、リフレッシュできない'));
}

function execLookAndReorder(a: LookAndReorderAction, ctx: ExecCtx): ExecResult {
  if (a.source.location === 'deck'
      && a.source.owner === 'self'
      && a.count === 1
      && a.private === false
      && ctx.ownerState.holograph_reveal_replace_this_turn
      && ctx.ownerState.is_holograph_this_effect) {
    return execLookAndReorder({
      ...a,
      count: 3,
      private: true,
      reorder: true,
      revealTopAfterReorder: true,
    }, ctx);
  }
  const state = ownerState(a.source.owner as Owner, ctx);
  // 手札を見る効果は閲覧専用。LOOK_AND_REORDER のデッキ並べ替えUIへ渡すと、手札ではなく
  // デッキを取り除いて戻す別効果になるため、既存の REVEAL_CARDS で盤面を変えずに見せる。
  if (a.source.location === 'hand') {
    if (a.destination.location !== 'hand' || a.destination.owner !== a.source.owner) {
      return done(addLog(ctx,
        `LOOK_AND_REORDER未対応: handから${a.destination.location}への移動はTRANSFER_TO_DECK等を使用する`));
    }
    const count = a.count === 'ALL' ? state.hand.length : resolveNum(a.count);
    const cards = state.hand.slice(0, count);
    const viewed = { ...ctx, lastProcessedCards: cards };
    if (cards.length === 0) return done(addLog(viewed, '見る手札がない'));
    return needsInteraction(addLog(viewed,
      `${a.source.owner === 'opponent' ? '対戦相手の' : ''}手札${cards.length}枚を見る`), {
      type: 'REVEAL_CARDS',
      cards,
      title: a.source.owner === 'opponent' ? '対戦相手の手札' : '手札',
    });
  }

  let sourceCards: string[];
  if (a.source.location === 'deck') sourceCards = state.deck;
  else if (a.source.location === 'life_cloth') sourceCards = state.life_cloth;
  else return done(addLog(ctx, `LOOK_AND_REORDER未対応source: ${String(a.source.location)}`));
  // `'ALL'`＝そのゾーンの全部（「あなたのすべてのライフクロスを見て」＝§6.4 O-4）。
  const count = a.count === 'ALL' ? sourceCards.length : resolveNum(a.count);
  // 「N枚まで見る」は情報を得る前に見る枚数を0..Nから決める。既定（フィールド省略）は
  // 従来どおりN枚固定のままにし、upToCount:trueだけを選択経路へ送る。
  if (a.upToCount && a.count !== 'ALL') {
    const max = Math.min(count, sourceCards.length);
    if (max === 0) return done(ctx);
    return needsInteraction(addLog(ctx, `見る枚数を0～${max}枚から選ぶ`), {
      type: 'CHOOSE', count: 1,
      options: Array.from({ length: max + 1 }, (_, n) => ({
        id: `look_${n}`,
        label: `${n}枚見る`,
        action: n === 0
          ? ({ type: 'STUB', id: 'INTERNAL_SKIP_OPTIONAL_ACTION' } as import('../types/effects').StubAction)
          : ({ ...a, count: n, upToCount: false } as LookAndReorderAction),
        available: true,
      })),
    });
  }
  const cards = a.source.location === 'life_cloth'
    ? sourceCards.slice(Math.max(0, sourceCards.length - count))
    : sourceCards.slice(0, count);
  if (cards.length === 0) return done(ctx);
  const destLocation = a.destination.location === 'life_cloth'
    ? 'life'
    : a.destination.location === 'deck'
      ? 'deck'
      : undefined;
  if (!destLocation) {
    return done(addLog(ctx, `LOOK_AND_REORDER未対応destination: ${String(a.destination.location)}`));
  }
  // 一時的に元ゾーンからカードを取り除く
  const newS: PlayerState = a.source.location === 'life_cloth'
    ? { ...state, life_cloth: state.life_cloth.slice(0, Math.max(0, state.life_cloth.length - cards.length)) }
    : { ...state, deck: state.deck.slice(cards.length) };
  const newCtx = setOwnerState(a.source.owner as Owner, newS, ctx);
  return needsInteraction(newCtx, {
    type: 'LOOK_AND_REORDER',
    cards,
    canTrash: a.canTrash ?? false,
    destLocation,
    destOwner: (a.destination.owner === 'any' ? 'self' : a.destination.owner) as 'self' | 'opponent',
    destPosition: a.destination.position,
    private: a.private,
    ...(a.revealTopAfterReorder ? { revealTopAfterReorder: true } : {}),
    ...(a.shuffle ? { shuffle: true } : {}),
  });
}

// PLACE_LRIGS_UNDER_CENTER: ルリグトラッシュのすべてのルリグを、自分のセンタールリグの下（スタック最下部）に置く（WX05-001）。
function execPlaceLrigsUnderCenter(a: import('../types/effects').PlaceLrigsUnderCenterAction, ctx: ExecCtx): ExecResult {
  const state = ownerState(a.owner, ctx);
  const lrigs = (state.lrig_trash ?? []).filter(n => ctx.cardMap.get(n)?.Type === 'ルリグ');
  if (lrigs.length === 0) return done(addLog(ctx, 'ルリグトラッシュにルリグがない'));
  const newLrigTrash = state.lrig_trash.filter(n => !lrigs.includes(n));
  // 「下に置く」= センタールリグスタックの最下部（applyGrowEffect と同じ並び）
  const newLrig = [...lrigs, ...state.field.lrig];
  const newS: PlayerState = { ...state, lrig_trash: newLrigTrash, field: { ...state.field, lrig: newLrig } };
  return done(addLog(setOwnerState(a.owner, newS, ctx),
    `ルリグトラッシュのルリグ${lrigs.length}枚をセンタールリグの下に置く`));
}

function transferSpecificDeckCard(a: TransferToDeckAction, cardNum: string, ctx: ExecCtx): ExecResult {
  const owner = a.source.owner as Owner;
  const state = ownerState(owner, ctx);
  const index = state.deck.indexOf(cardNum);
  if (index < 0) return done(ctx);
  const deck = [...state.deck];
  deck.splice(index, 1);
  if (a.shuffle) {
    deck.push(cardNum);
    const newS = { ...state, deck: shuffle(deck) };
    return done({ ...addLog(setOwnerState(owner, newS, ctx), `${ctx.cardMap.get(getCardNum(cardNum))?.CardName ?? cardNum}をデッキに加えてシャッフル`), lastProcessedCards: [cardNum] });
  }
  const insertAt = a.position === 'bottom' ? deck.length : a.position === 'second' ? Math.min(1, deck.length) : 0;
  deck.splice(insertAt, 0, cardNum);
  const posJa = a.position === 'bottom' ? '一番下' : a.position === 'second' ? '上から二番目' : '一番上';
  const newS = { ...state, deck };
  return done({ ...addLog(setOwnerState(owner, newS, ctx), `${ctx.cardMap.get(getCardNum(cardNum))?.CardName ?? cardNum}をデッキの${posJa}に置く`), lastProcessedCards: [cardNum] });
}

function execTransferToDeck(a: TransferToDeckAction, ctx: ExecCtx): ExecResult {
  const src = a.source;
  const state = ownerState(src.owner, ctx);
  const toBottom = a.position === 'bottom';

  // SEARCH で選択済みの DECK_CARD を位置確定する経路。選択前の DECK_CARD を count だけ
  // 自動取得すると「探したカード」と無関係な札を動かすため、fixedCardNums がある場合だけ実行する。
  // 通常の SEARCH then は applyDirectAction、CHOOSE を挟む top/second 選択はこの経路を通る。
  if (src.type === 'DECK_CARD') {
    let cur = ctx;
    for (const cardNum of a.fixedCardNums ?? []) {
      const moved = transferSpecificDeckCard(a, cardNum, cur);
      cur = { ...cur, ownerState: moved.ownerState, otherState: moved.otherState, logs: moved.logs, lastProcessedCards: moved.lastProcessedCards };
    }
    return done(cur);
  }

  // LRIG_TRASH_CARD: ルリグトラッシュから（アーツ等を）ルリグデッキ/デッキへ戻す（WX05-001「白と黒のアーツをルリグデッキに戻す」）
  if (src.type === 'LRIG_TRASH_CARD') {
    const cands = (state.lrig_trash ?? []).filter(n => matchesFilter(ctx.cardMap.get(n), src.filter));
    if (src.upToCount && src.count !== 'ALL') {
      const count = resolveNum(src.count);
      const scope: TargetScope = src.owner === 'opponent' ? 'opp_lrig_trash' : 'self_lrig_trash';
      return selectOrInteract(cands, count, true, scope, a, undefined, ctx, false, { selectionConstraint: src.selectionConstraint });
    }
    const cards = src.count === 'ALL' ? cands : cands.slice(0, resolveNum(src.count));
    if (cards.length === 0) return done(addLog(ctx, '対象のカードがルリグトラッシュにない'));
    const newLrigTrash = state.lrig_trash.filter(n => !cards.includes(n));
    const dest = a.destination ?? 'deck';
    const newS: PlayerState = dest === 'lrig_deck'
      ? { ...state, lrig_trash: newLrigTrash, lrig_deck: [...(state.lrig_deck ?? []), ...cards] }
      : { ...state, lrig_trash: newLrigTrash, deck: a.shuffle ? shuffle([...state.deck, ...cards]) : (toBottom ? [...state.deck, ...cards] : [...cards, ...state.deck]) };
    return done({ ...addLog(setOwnerState(src.owner, newS, ctx), `${cards.length}枚を${dest === 'lrig_deck' ? 'ルリグデッキ' : 'デッキ'}に戻す`), lastProcessedCards: cards });
  }

  function insertToDeck(s: PlayerState, cards: string[]): PlayerState {
    if (a.shuffle) return { ...s, deck: shuffle([...s.deck, ...cards]) };
    return toBottom
      ? { ...s, deck: [...s.deck, ...cards] }
      : { ...s, deck: [...cards, ...s.deck] };
  }

  // LIFE_CLOTH_CARD: ライフクロスをデッキへ（「対戦相手のライフクロス１枚をデッキの一番下に置く」SPDi47-03）。
  // ライフクロスは裏向き＝選択の余地がないため一番上（配列末尾＝crashOneLife と同じ向き）から N 枚を移す。
  // ⚠lastProcessedCards は上書きしない（「この方法で手札をN枚捨てた場合」等の直前記録を後続 CONDITIONAL が
  //   参照する連鎖の途中に置かれるため＝SPDi47-03 の2段閾値）。
  if (src.type === 'LIFE_CLOTH_CARD') {
    const n = src.count === 'ALL' ? state.life_cloth.length : resolveNum(src.count);
    const life = [...state.life_cloth];
    const moved: string[] = [];
    for (let i = 0; i < n && life.length > 0; i++) moved.push(life.pop()!);
    if (moved.length === 0) return done(addLog(ctx, 'ライフクロスがない'));
    const newS = insertToDeck({ ...state, life_cloth: life }, moved);
    return done(addLog(setOwnerState(src.owner, newS, ctx),
      `${src.owner === 'opponent' ? '対戦相手の' : ''}ライフクロス${moved.length}枚をデッキ${toBottom ? '下' : '上'}に置く`));
  }

  if (src.type === 'TRASH_CARD') {
    const cands = movableTrashCandidates(src.owner, state, src.filter, ctx.cardMap, ctx, ctx.treatAsClassAllZones);
    // 「好きな枚数」は0〜全件の選択。optional×ALL の全件実行／全件スキップとは別形。
    if (src.count === 'ALL' && src.upToCount) {
      if (cands.length === 0) return done({ ...ctx, lastProcessedCards: [] });
      const scope: TargetScope = src.owner === 'opponent' ? 'opp_trash' : 'self_trash';
      return selectOrInteract(cands, cands.length, true, scope, a, undefined, ctx, false,
        { selectionConstraint: src.selectionConstraint });
    }
    // 「トラッシュからすべてのカードをデッキに加えてもよい」は、枚数選択ではなく
    // 全件実行／全件スキップの二択。execReveal の optional×ALL と同じ形に揃える。
    if (src.count === 'ALL' && a.optional) {
      const transferAll = { ...a, optional: false } as TransferToDeckAction;
      const skip = { type: 'STUB', id: 'INTERNAL_SKIP_OPTIONAL_ACTION' } as import('../types/effects').StubAction;
      return needsInteraction(addLog(ctx, 'トラッシュのすべてのカードをデッキに戻しますか？'), {
        type: 'CHOOSE', count: 1,
        options: [
          { id: 'transfer', label: 'デッキに戻す', action: transferAll, available: true },
          { id: 'skip', label: '戻さない', action: skip, available: true },
        ],
      });
    }
    // optional:「トラッシュから…をデッキに戻してもよい」（WX17-028-E1）。選択 or スキップにし、
    // スキップ（0体選択）時は resumeSelectTarget が続く「そうした場合」(CONDITIONAL IS_MY_TURN) を stripDidItConditional で無効化する。
    // ⚠従来は無条件で slice(0,N) を強制していた（続き137・タスク12(viii)）。
    // `src.upToCount`（「N枚**まで**」）も同じ扱い＝上限 N の任意枚数選択（続き377b）。従来は `a.optional` しか
    //   見ておらず、`upToCount` は**素通りして slice(0,N) の強制 N 枚**になっていた（`WXK09-067-E1`「４枚まで」等）。
    if ((a.optional || src.upToCount) && src.count !== 'ALL') {
      const count = resolveNum(src.count);
      const scope: TargetScope = src.owner === 'opponent' ? 'opp_trash' : 'self_trash';
      return selectOrInteract(cands, count, true, scope, a, undefined, ctx, false, { selectionConstraint: src.selectionConstraint });
    }
    // selectionConstraint（「それぞれレベル/名前の異なる」等）は自動 slice で不正 set を作れないため必ず選択させる
    // （5c検証是正・Claude 2026-07-23＝この必須経路が constraint 素通りだった）。
    if (src.selectionConstraint && src.count !== 'ALL') {
      const count = resolveNum(src.count);
      const scope: TargetScope = src.owner === 'opponent' ? 'opp_trash' : 'self_trash';
      return selectOrInteract(cands, count, false, scope, a, undefined, ctx, false, { selectionConstraint: src.selectionConstraint });
    }
    const cards = src.count === 'ALL' ? cands : cands.slice(0, resolveNum(src.count));
    const newS = insertToDeck({ ...state, trash: state.trash.filter(n => !cards.includes(n)) }, cards);
    return done({ ...addLog(setOwnerState(src.owner, newS, ctx), `${cards.length}枚をデッキに戻す`), lastProcessedCards: cards });
  }

  if (src.type === 'HAND_CARD') {
    const cands = handCandidates(state, src.filter, ctx.cardMap, ctx.treatAsClassAllZones);
    const count = src.count === 'ALL' ? cands.length : resolveNum(src.count);
    const scope: TargetScope = src.owner === 'self' ? 'self_hand' : 'opp_hand';

    function applyHandToDeck(selected: string[], c: ExecCtx): ExecCtx {
      const cur = c;
      const s = ownerState(src.owner, cur);
      const remaining = [...s.hand];
      const toMove: string[] = [];
      for (const n of selected) {
        const i = remaining.indexOf(n);
        if (i >= 0) { remaining.splice(i, 1); toMove.push(n); }
      }
      const newS = insertToDeck({ ...s, hand: remaining }, toMove);
      return addLog(setOwnerState(src.owner, newS, cur),
        `手札${toMove.length}枚をデッキ${toBottom ? '下' : '上'}に置く`);
    }

    if (src.count === 'ALL') return done({ ...applyHandToDeck(cands, ctx), lastProcessedCards: cands });
    return selectOrInteract(cands, count, a.source.upToCount ?? false, scope, a, undefined, ctx);
  }

  // ENERGY_CARD: エナゾーンからデッキへ戻す（§6.4 O-35・続き529）。
  // 🔴従来この分岐だけが無く、`HAND_CARD`／`SIGNI`／`TRASH_CARD` は在るのにエナだけ**無言 no-op**だった
  //   （`WXK05-005-E1`「あなたの手札とエナゾーンとシグニゾーンにあるすべてのカードをデッキに加える」）。
  // ⚠`HAND_OR_ENERGY_CARD`（＝手札とエナを跨いだ単一プールから合計N枚）とは別物＝**エナ単独**のゾーン指定。
  if (src.type === 'ENERGY_CARD') {
    // thisCardOnly: 効果元カード自身のみ（「このシグニをエナゾーンからデッキの一番下に置く」＝§5.3 `O-55`）。
    // ⚠`matchesFilter` は `thisCardOnly` を**黙って無視する**ので、剥がさないと**エナ全部が候補**になる
    //   （`execAddToField`／`execAddToLife`／`execTransferToHand` の ENERGY_CARD 分岐と同規約）。
    let candsEN = state.energy.filter(n => matchesFilter(ctx.cardMap.get(getCardNum(n)), src.filter));
    if (src.filter?.thisCardOnly) {
      candsEN = (ctx.sourceCardNum && state.energy.includes(ctx.sourceCardNum)) ? [ctx.sourceCardNum] : [];
      if (candsEN.length === 0) return done({ ...ctx, lastProcessedCards: [] });
      // 選ぶ余地が無いので選択UIを出さず即適用する。
      const newSelfEN = insertToDeck({ ...state, energy: state.energy.filter(n => n !== candsEN[0]) }, candsEN);
      return done({
        ...addLog(setOwnerState(src.owner, newSelfEN, ctx),
          `${ctx.cardMap.get(getCardNum(candsEN[0]))?.CardName ?? candsEN[0]}をエナゾーンからデッキ${toBottom ? 'の一番下' : 'の一番上'}に置く`),
        lastProcessedCards: candsEN,
      });
    }
    const scopeEN: TargetScope = src.owner === 'self' ? 'self_energy' : 'opp_energy';
    if (src.count === 'ALL') {
      const newS = insertToDeck({ ...state, energy: state.energy.filter(n => !candsEN.includes(n)) }, candsEN);
      return done({
        ...addLog(setOwnerState(src.owner, newS, ctx), `エナゾーン${candsEN.length}枚をデッキ${toBottom ? '下' : '上'}に置く`),
        lastProcessedCards: candsEN,
      });
    }
    return selectOrInteract(candsEN, resolveNum(src.count), src.upToCount ?? false, scopeEN, a, undefined, ctx);
  }

  // HAND_OR_ENERGY_CARD: 手札とエナゾーンを跨いだ**単一プール**から合計N枚をデッキへ（タスク12(lxi) 第11波）。
  // 原文「対象としたエナゾーンのカードと手札を合計２枚デッキの一番上に置く」（`WXK06-067-E1`）＝
  // 内訳（手札2／手札1+エナ1／エナ2）は選ぶ側が自由に決める＝2つの単一ゾーン枝には割れない。
  // ⚠1枚ずつの適用は resumeSelectTarget の TRANSFER_TO_DECK が hand/energy 双方を見て弁別するので追加不要。
  //   instanceId はデッキ配布時に1プレイヤー内で一意（assignInstanceIds）なので取り違えない。
  if (src.type === 'HAND_OR_ENERGY_CARD') {
    const handCandsHE = handCandidates(state, src.filter, ctx.cardMap, ctx.treatAsClassAllZones);
    const enCandsHE = state.energy.filter(n => matchesFilter(ctx.cardMap.get(getCardNum(n)), src.filter));
    const candsHE = [...handCandsHE, ...enCandsHE];
    const scopeHE: TargetScope = src.owner === 'self' ? 'self_hand_energy' : 'opp_hand_energy';
    const applyHandOrEnergyToDeck = (selected: string[], c: ExecCtx): ExecCtx => {
      const s = ownerState(src.owner, c);
      const moved = selected.filter(n => s.hand.includes(n) || s.energy.includes(n));
      if (moved.length === 0) return c;
      const newS = insertToDeck({
        ...s,
        hand: s.hand.filter(n => !moved.includes(n)),
        energy: s.energy.filter(n => !moved.includes(n)),
      }, moved);
      return addLog(setOwnerState(src.owner, newS, c),
        `手札／エナゾーンから合計${moved.length}枚をデッキ${toBottom ? '下' : '上'}に置く`);
    };
    if (src.count === 'ALL') return done({ ...applyHandOrEnergyToDeck(candsHE, ctx), lastProcessedCards: candsHE });
    const countHE = resolveNum(src.count);
    // 候補が必要枚数に満たないときは「置けない」＝回避が成立しない。呼び出し側（OPPONENT_PAY_OPTIONAL）が
    // available:false で枝を出さないので通常ここへは来ないが、直接実行された場合の安全弁として no-op で返す。
    if (candsHE.length < countHE) return done(addLog(ctx, '手札とエナゾーンの合計が足りない'));
    const oppRespondsHE = !!a.opponentSelects && src.owner === 'opponent';
    return selectOrInteract(candsHE, countHE, src.upToCount ?? false, scopeHE, a, undefined, ctx, oppRespondsHE);
  }

  if (src.type === 'SIGNI') {
    // frontOfGateZone: THE DOOR【ゲート】がある自分のシグニゾーンの正面にある対戦相手のシグニに限定
    let gateFrontRestrict: string[] | null = null;
    let selfFrontRestrict: string[] | null = null;
    // levelLteDiscardSigni:「この方法で捨てたシグニのレベル以下」をキャスター側の値で解決（WXK10-044）
    let srcFilter = resolveDiscardLevelFilter(src.filter, ctx.ownerState);
    // 任意コスト「他のシグニをデッキの一番下に置く」。fieldCandidates 自体は効果元を知らないため、
    // フィルターから制御フラグを外し、通常の場候補を作った後で sourceCardNum を除く。
    const deckExcludeSelf = srcFilter?.excludeSelf === true;
    const deckThisCardOnly = srcFilter?.thisCardOnly === true;
    if (deckExcludeSelf && srcFilter) {
      const { excludeSelf: _e, ...rest } = srcFilter;
      srcFilter = rest;
    }
    if (deckThisCardOnly && srcFilter) {
      const { thisCardOnly: _t, ...rest } = srcFilter;
      srcFilter = rest;
    }
    // frontOfSelf: 効果元シグニの正面（相手ゾーン 2-zi）だけをデッキへ移す。
    // filter を宣言しただけでは fieldCandidates が盤面幾何を評価しないため、ここで候補を固定する（WXEX1-65）。
    // ⚠正面の解決は execBanish/execDown と同じ共通ヘルパーに揃える（発生源がスタックのトップでない＝
    //   下敷きのときは正面を解決しない＝場に出ているシグニだけが発生源になりうる、という既存規約）。
    if (srcFilter?.frontOfSelf) {
      const { frontOfSelf: _f, ...rest } = srcFilter;
      srcFilter = rest;
      const front = src.owner === 'opponent' ? resolveFrontOfSelfCardNum(ctx) : null;
      selfFrontRestrict = front ? [front] : [];
    }
    if (srcFilter?.frontOfGateZone) {
      const { frontOfGateZone: _g, ...rest } = srcFilter;
      srcFilter = rest;
      if (src.owner === 'opponent') {
        const gateZones = ctx.ownerState.own_gate_zones ?? [];
        gateFrontRestrict = gateZones
          .map(zi => ctx.otherState.field.signi[2 - zi]?.at(-1))
          .filter((n): n is string => !!n);
      } else {
        gateFrontRestrict = [];
      }
    }
    let cands = fieldCandidates(state, srcFilter, ctx.cardMap, ctx.effectivePowers);
    if (deckExcludeSelf && ctx.sourceCardNum) cands = cands.filter(n => n !== ctx.sourceCardNum);
    if (deckThisCardOnly) cands = ctx.sourceCardNum ? cands.filter(n => n === ctx.sourceCardNum) : [];
    if (gateFrontRestrict !== null) cands = cands.filter(n => gateFrontRestrict!.includes(n));
    if (selfFrontRestrict !== null) cands = cands.filter(n => selfFrontRestrict!.includes(n));
    // 任意コスト前に固定した対象だけをデッキへ（タスク12(liii)＝「それのレベル１につき…そうした場合、
    // それをデッキの一番下に置く」。コストのレベル倍率と本体が同じ1体を指す必要がある）
    if (a.targetsStored) cands = cands.filter(n => (ctx.storedTargetCards ?? []).includes(n));
    if (a.fixedCardNums) cands = cands.filter(n => a.fixedCardNums!.includes(n));
    const count = src.count === 'ALL' ? cands.length : resolveNum(src.count);
    const scope: TargetScope = src.owner === 'self' ? 'self_field' : 'opp_field';

    function applyToBottom(selected: string[], c: ExecCtx): ExecCtx {
      let cur = c;
      for (const num of selected) {
        const sub = applyEffectLeaveSubstitutes(num, src.owner, cur);
        cur = sub.ctx;            // ⚠(cxxx)＝置換不成立でも「決定の消費」は必ず反映する
        if (sub.replaced) continue;
        if (!isOnFieldTop(num, src.owner, cur)) continue;  // (cxxvi)
        const s = ownerState(src.owner, cur);
        const removed = removeFromField(num, s);
        const newS = insertToDeck(removed, [num]);
        cur = addLog(setOwnerState(src.owner, newS, cur),
          `${cur.cardMap.get(num)?.CardName ?? num}をデッキ${toBottom ? '下' : '上'}へ`);
      }
      return cur;
    }

    if (deckThisCardOnly) return done({ ...applyToBottom(cands, ctx), lastProcessedCards: cands });

    if (src.count === 'ALL') {
      // §6.4 離場置換の対話化（続き430）＝適用前に被害側へまとめて問い、決定を刻んでから**同じ action を再入**する
      //   （count:'ALL' 経路は候補が盤面から再導出されるので、適用前に戻っても選び直しにはならない）。
      { const ask = leaveSubstituteAskQueue('TRANSFER_TO_DECK', cands, ctx);
        if (ask.queue.length > 0) return executeAction(makeLeaveSubAsk(ask.queue, 'opponent', a as EffectAction, { isBanish: ask.isBanish }), ctx); }
      return done({ ...applyToBottom(cands, ctx), lastProcessedCards: cands });
    }
    const oppResponds = !!a.opponentSelects && src.owner === 'opponent';
    return selectOrInteract(cands, count, false, scope, a, undefined, ctx, oppResponds);
  }

  return done(ctx);
}

function protectionKeyword(a: GrantProtectionAction): string {
  if (a.bySourceType || a.bySourceLevel !== undefined) {
    return `PROTECTION_BY_SOURCE:${JSON.stringify({
      from: a.from ?? [],
      sourceOwner: a.sourceOwner,
      bySourceType: a.bySourceType,
      bySourceLevel: a.bySourceLevel,
    })}`;
  }
  // AUTO/ACTIVATED の期間付与でも、解決中ソースカードの属性制約を失わない。
  // CONTINUOUS は collectEffectImmuneSigni が action を直接読むが、こちらは keyword store が消費地点。
  if (a.sourceFilter || a.sourceCostMin !== undefined || a.sourceEffectType) {
    return `PROTECTION_FILTERED:${JSON.stringify({
      from: a.from ?? [],
      sourceOwner: a.sourceOwner,
      sourceFilter: a.sourceFilter,
      sourceCostMin: a.sourceCostMin,
      sourceEffectType: a.sourceEffectType,
    })}`;
  }
  return `PROTECTION:${(a.from ?? []).join(',')}:${a.sourceOwner ?? ''}`;
}

function execGrantProtection(a: GrantProtectionAction, ctx: ExecCtx): ExecResult {
  // 効果耐性はキーワード付与として扱う
  const keyword = protectionKeyword(a);
  // AUTO/ACTIVATED の subjectFilter は、そのターン中に場へ出た後続シグニにも効く場レベル付与へ載せる。
  // CONTINUOUS 宣言は executeAction を通らず effectEngine が直接読むため、ここへ来るのは期間付与だけ。
  // excludeSelf は FieldGrant が発生源identityを保持しないため、能力を得た発生源シグニ自身の
  // granted_effects へ CONTINUOUS 宣言を積む。これなら後から場に出た一致シグニも毎回評価しつつ、
  // collector が sourceNum を使って「他の」を厳密に除外できる。
  if (!a.target && a.subjectFilter?.excludeSelf && (a.subjectOwner ?? 'self') === 'self'
      && ctx.sourceCardNum && ctx.ownerState.field.signi.some(stack => stack?.at(-1) === ctx.sourceCardNum)) {
    const grantedEffect: CardEffect = {
      effectId: `${ctx.sourceCardNum}-GRANTED-PROTECTION`,
      effectType: 'CONTINUOUS', action: a, duration: 'PERMANENT', mandatory: true, parseStatus: 'AUTO',
    };
    return execGrantEffect({
      type: 'GRANT_EFFECT',
      target: { type: 'SIGNI', owner: 'self', count: 1, filter: { thisCardOnly: true } },
      effect: grantedEffect,
      duration: a.duration,
    } as GrantEffectAction, ctx);
  }
  if (!a.target && a.subjectFilter && !a.subjectFilter.excludeSelf) {
    const target: EffectTarget = {
      type: 'SIGNI', owner: a.subjectOwner ?? 'self', count: 'ALL', filter: a.subjectFilter,
    };
    const applied = applyActiveFieldGrant(target, { kind: 'keyword', keyword, filter: a.subjectFilter }, ctx);
    if (applied.applied) {
      return done(addLog(applied.ctx, `対象集合に効果耐性（${a.from?.join('/')}）を付与`));
    }
  }
  // 発生源が場にいない等、動的宣言を保持できない異常系だけは解決時点の集合へ fail-safe 付与する。
  const tgt: EffectTarget | undefined = a.target ?? (a.subjectFilter ? {
    type: 'SIGNI', owner: a.subjectOwner ?? 'self', count: 'ALL', filter: a.subjectFilter,
  } : undefined);
  if (!tgt) return done(ctx);
  // UNTIL_OPP_TURN_END は長期ストア keyword_grants_until_opp_turn へ（次の相手ターン終了時までクリアされない）
  const gkey = a.duration === 'UNTIL_OPP_TURN_END' ? 'keyword_grants_until_opp_turn' : 'keyword_grants';

  // owner:'any' は選ばれた1枚がどちらの場にあるかで所属を決める（タスク12(lii)）
  const applyProtection = (selected: string[], c: ExecCtx): ExecCtx => {
    let cur = c;
    for (const n of selected) {
      const own: Owner = tgt.owner === 'any' ? sideOfFieldCard(n, cur) : tgt.owner;
      const s = ownerState(own, cur);
      const grants = { ...(s[gkey] ?? {}) };
      grants[n] = [...new Set([...(grants[n] ?? []), keyword])];
      cur = setOwnerState(own, { ...s, [gkey]: grants }, cur);
    }
    return addLog(cur,
      `${selected.map(n => cur.cardMap.get(getCardNum(n))?.CardName ?? n).join('・')}に効果耐性（${(a.from ?? []).join('/')}）を付与`);
  };

  // 「そのレゾナ」＝出現条件支払いトリガーが保持した、今出たレゾナへ直接付与。
  if (a.targetsTriggerSource) {
    const trigger = ctx.triggeringCardNum;
    const onField = trigger && ownerState(tgt.owner, ctx).field.signi.some(stack => stack?.at(-1) === trigger);
    return done(trigger && onField ? applyProtection([trigger], ctx) : ctx);
  }

  // センタールリグへの付与（「あなたのセンタールリグ…は効果を受けない」WX04-064 等）
  if (tgt.type === 'LRIG') {
    const lrigTop = ownerState(tgt.owner, ctx).field.lrig?.at(-1);
    return done(lrigTop ? applyProtection([lrigTop], ctx) : ctx);
  }

  const protectionCandidates = fieldCandidatesByOwner(tgt.owner, tgt.filter, ctx);
  let cands = protectionCandidates.cands;
  const gpScope = protectionCandidates.scope;
  // thisCardOnly は matchesFilter のカード属性ではないため、効果元 identity で明示的に絞る。
  // 「このシグニは耐性を得る」を別の自シグニへ付け替えられないよう、選択UIも出さず即適用する。
  if (tgt.filter?.thisCardOnly) {
    cands = ctx.sourceCardNum ? cands.filter(n => n === ctx.sourceCardNum) : [];
  }
  // excludeSelf:「あなたの他のシグニ」への一時耐性付与では、効果元自身を候補から除く。
  // フィールド省略時の従来候補集合は変えず、明示された場合だけ additive に絞る。
  if (tgt.filter?.excludeSelf && ctx.sourceCardNum) {
    cands = cands.filter(n => n !== ctx.sourceCardNum);
  }
  if (a.targetsLastProcessed) {
    const previous = new Set(ctx.lastProcessedCards ?? []);
    return done(applyProtection(cands.filter(n => previous.has(n)), ctx));
  }
  if (tgt.filter?.thisCardOnly) return done(applyProtection(cands, ctx));
  if (tgt.count === 'ALL') return done(applyProtection(cands, ctx));
  const count = resolveNum(tgt.count);
  return selectOrInteract(cands, count, false, gpScope, a, undefined, ctx);
}

function execAttachCharm(a: AttachCharmAction, ctx: ExecCtx): ExecResult {
  // optional:「チャームにしてもよい」→ 付ける/付けないを選択
  if (a.optional) {
    const noop: SequenceAction = { type: 'SEQUENCE', steps: [] };
    const attachAct: AttachCharmAction = { ...a, optional: false };
    return needsInteraction(ctx, {
      type: 'CHOOSE', count: 1, options: [
        { id: 'attach', label: 'チャームにする', action: attachAct as EffectAction, available: true },
        { id: 'skip',   label: 'しない',        action: noop as EffectAction, available: true },
      ],
    } as PendingInteractionDef);
  }
  const charmOwner = a.charm.owner ?? 'self';
  const toOwner    = a.to.owner ?? 'self';
  const charmSrc   = ownerState(charmOwner, ctx);
  const toState    = ownerState(toOwner, ctx);

  if (a.perAllSigni && a.charm.type === 'DECK_CARD') {
    const targetZones = toState.field.signi
      .map((stack, index) => ({ stack, index }))
      .filter(({ stack }) => stack && stack.length > 0);
    const attachCount = Math.min(targetZones.length, charmSrc.deck.length);
    if (attachCount === 0) return done(addLog(ctx, '一斉チャーム付与対象なし'));
    const cards = charmSrc.deck.slice(0, attachCount);
    let ctx2 = setOwnerState(charmOwner, { ...charmSrc, deck: charmSrc.deck.slice(attachCount) }, ctx);
    const currentTo = ownerState(toOwner, ctx2);
    const charms = [...(currentTo.field.signi_charms ?? [null, null, null])];
    targetZones.slice(0, attachCount).forEach(({ index }, i) => { charms[index] = cards[i]; });
    ctx2 = setOwnerState(toOwner, { ...currentTo, field: { ...currentTo.field, signi_charms: charms } }, ctx2);
    return done({ ...addLog(ctx2, `${attachCount}体へチャームを一斉付与`), lastProcessedCards: cards });
  }

  // 「カードをN枚まで × シグニN体まで」＝**複数ペア**（続き377n）。従来は charm/to とも先頭1件しか見ず、
  // `WX07-045-E2`（トラッシュから3枚まで）・`WXEX1-22-E2`（3枚→3体）・`WXK07-070-E1`／`WX17-Re05-E1`（2枚→2体）が
  // **常に1組だけ**になる過小実行だった。ペア数＝min(チャーム候補, 付与先候補, charm.count, to.count)。
  const pairLimit = (tgt: import('../types/effects').EffectTarget): number =>
    tgt.count === 'ALL' ? Number.MAX_SAFE_INTEGER : Math.max(1, resolveNum(tgt.count));
  const charmLimit = pairLimit(a.charm);
  const toLimit = pairLimit(a.to);

  // //
  let charmCands: string[];
  let charmFromLocation: 'hand' | 'energy' | 'trash' | 'deck';
  if (a.charm.type === 'DECK_CARD') {
    charmCands = charmSrc.deck.slice(0, Math.min(charmLimit, charmSrc.deck.length));
    charmFromLocation = 'deck';
  } else if (a.charm.type === 'TRASH_CARD') {
    // thisCardOnly:「このカードを【チャーム】にする」= 効果元カード自身（トラッシュにある）（WX04-102）
    if (a.charm.filter?.thisCardOnly) {
      // A resolving spell is not in a zone yet. Treat self-charming as a
      // replacement for its pending post-resolution trash placement.
      charmCands = ctx.sourceCardNum && (
        charmSrc.trash.includes(ctx.sourceCardNum)
        || (ctx.sourcePlacementPending && charmOwner === 'self')
      ) ? [ctx.sourceCardNum] : [];
    } else {
      // LOCK_OPP_TRASH_MOVE（タスク12(lxxiii)）: 【チャーム】化もトラッシュからの領域移動。
      charmCands = isOwnTrashMoveLocked(charmOwner, ctx)
        ? []
        : charmSrc.trash.filter(n => matchesFilter(ctx.cardMap.get(n), a.charm.filter));
    }
    charmFromLocation = 'trash';
  } else {
    // デフォルトは手札 or エナ（filter指定があればエナから）
    const fromEnergy = charmSrc.energy.filter(n => matchesFilter(ctx.cardMap.get(n), a.charm.filter));
    const fromHand = charmSrc.hand.filter(n => matchesFilter(ctx.cardMap.get(n), a.charm.filter));
    if (fromEnergy.length > 0) { charmCands = fromEnergy; charmFromLocation = 'energy'; }
    else { charmCands = fromHand; charmFromLocation = 'hand'; }
  }
  if (charmCands.length === 0) return done(addLog(ctx, 'チャームなし'));

  // 対象シグニのゾーンを探す。thisCardOnly=効果元シグニ自身（「このシグニの【チャーム】にする」）
  let toCands: string[];
  if (a.to.filter?.thisCardOnly) {
    toCands = (ctx.sourceCardNum && toState.field.signi.some(s => s?.at(-1) === ctx.sourceCardNum)) ? [ctx.sourceCardNum] : [];
  } else if (a.to.filter?.isTriggerSource) {
    // 「そのシグニの【チャーム】にする」＝場に出たトリガー元シグニ（WXEX2-76/WX08-006/WXK10-048）
    toCands = (ctx.triggeringCardNum && toState.field.signi.some(s => s?.at(-1) === ctx.triggeringCardNum)) ? [ctx.triggeringCardNum] : [];
  } else {
    toCands = fieldCandidates(toState, a.to.filter, ctx.cardMap, ctx.effectivePowers);
  }
  if (toCands.length === 0) return done(addLog(ctx, 'チャーム付与対象なし'));

  // ペアを i 番目どうしで対応させる（原文は「カードN枚を、シグニN体の【チャーム】にする」＝1体1枚）。
  const pairCount = Math.min(charmCands.length, toCands.length, charmLimit, toLimit);
  if (pairCount <= 0) return done(addLog(ctx, 'チャーム付与対象なし'));
  const charmNums = charmCands.slice(0, pairCount);
  const targetNums = toCands.slice(0, pairCount);
  const zoneIdxs = targetNums.map(n => toState.field.signi.findIndex(s => s?.at(-1) === n));
  if (zoneIdxs.some(i => i < 0)) return done(addLog(ctx, 'チャーム付与: ゾーン不明'));

  // チャームカードをソースから除去
  let newCharmSrc: PlayerState = { ...charmSrc };
  if (charmFromLocation === 'deck') {
    newCharmSrc = { ...newCharmSrc, deck: newCharmSrc.deck.slice(pairCount) };
  } else if (charmFromLocation === 'energy') {
    newCharmSrc = { ...newCharmSrc, energy: newCharmSrc.energy.filter(n => !charmNums.includes(n)) };
  } else if (charmFromLocation === 'trash') {
    newCharmSrc = { ...newCharmSrc, trash: newCharmSrc.trash.filter(n => !charmNums.includes(n)) };
  } else {
    newCharmSrc = { ...newCharmSrc, hand: newCharmSrc.hand.filter(n => !charmNums.includes(n)) };
  }
  let ctx2 = setOwnerState(charmOwner, newCharmSrc, ctx);

  // 対象シグニのゾーンにチャームをセット
  let newToState = ownerState(toOwner, ctx2);
  const charms = [...(newToState.field.signi_charms ?? [null, null, null])];
  zoneIdxs.forEach((zoneIdx, i) => { charms[zoneIdx] = charmNums[i]; });
  newToState = { ...newToState, field: { ...newToState.field, signi_charms: charms } };
  ctx2 = setOwnerState(toOwner, newToState, ctx2);

  const nameOf = (n: string) => ctx.cardMap.get(n)?.CardName ?? n;
  // 「〜をそれの【チャーム】にする。…それはアタックできない」の「それ」＝**チャームを付けた側のシグニ**。
  // ⚠`lastProcessedCards` ではなく `storedTargetCards` に置く＝後続が `targetsStored` を明示した時だけ読む軸なので、
  //   既存の ATTACH_CHARM 後続3件（POWER_MODIFY / GRANT_KEYWORD＝いずれも新規対象）に影響しない。
  return done({
    ...addLog(ctx2, charmNums.map((c, i) => `${nameOf(c)}を${nameOf(targetNums[i])}にチャームとして付与`).join('／')),
    storedTargetCards: [...targetNums],
  });
}

/**
 * `ATTACH_FACEDOWN_FROM_HAND`（§5.3 `O-81`・`WX16-003-E2`）＝
 * 「あなたのシグニ１体を対象とし、それにあなたの手札からカード１枚を裏向きで付ける。」
 *
 * 3段の対話（段1=ホストシグニ／段2=手札のカード／段3=適用）。段間は `_hostPending`／`_host` で繋ぐ
 * （新しい `INTERNAL_*` STUB を作らないため＝`LOOK_PICK_CHAIN` の `_revealed` と同じ規約）。
 *
 * ⚠**受け皿は `signi_charms` ではない**＝原文が【チャーム】と書いていないので
 *   `field.signi_facedown_attached` へ入れる。混ぜると `hasCharm`／`CHARM_COUNT`／
 *   `ON_CHARM_TO_TRASH`／`IS_SELF_CHARMED` が過剰発火し、【チャーム】との併存もできなくなる。
 * 🔑離脱時の「公開し手札に戻す」は `removeFromField` の1点が担当（全離脱経路が通る funnel）。
 */
function execAttachFacedownFromHand(a: AttachFacedownFromHandAction, ctx: ExecCtx): ExecResult {
  const toOwner = a.to.owner ?? 'self';
  const toState = ownerState(toOwner, ctx);
  const count = a.count ?? 1;

  // 段3: ホスト確定済み＝直前に選ばれた手札のカードを付ける
  if (a._host) {
    const picked = (ctx.lastProcessedCards ?? []).slice(0, count);
    if (picked.length === 0) return done(addLog(ctx, '裏向きで付けるカードがない'));
    const hostState = ownerState(toOwner, ctx);
    const zoneIdx = hostState.field.signi.findIndex(st => st?.at(-1) === a._host);
    if (zoneIdx < 0) return done(addLog(ctx, '付ける先のシグニが場にいない'));
    const slots = [...(hostState.field.signi_facedown_attached ?? [null, null, null])] as (string[] | null)[];
    slots[zoneIdx] = [...(slots[zoneIdx] ?? []), ...picked];
    let ctx2 = setOwnerState(toOwner, {
      ...hostState,
      field: { ...hostState.field, signi_facedown_attached: slots },
    }, ctx);
    // 付けたカードは手札から抜く（`selectOrInteract` は選ばせるだけで領域を動かさない）。
    const handOwnerState = ownerState('self', ctx2);
    const newHand = [...handOwnerState.hand];
    for (const cn of picked) {
      const i = newHand.indexOf(cn);
      if (i >= 0) newHand.splice(i, 1);
    }
    ctx2 = setOwnerState('self', { ...ownerState('self', ctx2), hand: newHand }, ctx2);
    const hostName = ctx.cardMap.get(getCardNum(a._host))?.CardName ?? a._host;
    return done({
      ...addLog(ctx2, `手札から${picked.length}枚を${hostName}に裏向きで付けた`),
      lastProcessedCards: [a._host],
    });
  }

  // 段2: ホストが選ばれた直後＝手札から付けるカードを選ぶ
  if (a._hostPending) {
    const host = ctx.lastProcessedCards?.[0];
    if (!host) return done(addLog(ctx, '付ける先のシグニが選ばれていない'));
    const handCands = handCandidates(ctx.ownerState, a.handFilter, ctx.cardMap);
    if (handCands.length === 0) return done(addLog(ctx, '裏向きで付けられる手札がない'));
    const { _hostPending: _hp, ...rest } = a;
    const applyAct: AttachFacedownFromHandAction = { ...rest, _host: host };
    return selectOrInteract(handCands, Math.min(count, handCands.length), false, 'self_hand',
      applyAct as EffectAction, undefined, ctx);
  }

  // 段1: 付ける先シグニを選ぶ。⚠手札が空なら**何もしない**（対象だけ取って空振りにしない）。
  if (handCandidates(ctx.ownerState, a.handFilter, ctx.cardMap).length === 0) {
    return done(addLog(ctx, '裏向きで付けられる手札がない'));
  }
  const hostCands = a.to.filter?.thisCardOnly
    ? (ctx.sourceCardNum && toState.field.signi.some(st => st?.at(-1) === ctx.sourceCardNum) ? [ctx.sourceCardNum] : [])
    : fieldCandidates(toState, a.to.filter, ctx.cardMap, ctx.effectivePowers);
  if (hostCands.length === 0) return done(addLog(ctx, '裏向きで付ける対象のシグニがいない'));
  const pickHostAct: AttachFacedownFromHandAction = { ...a, _hostPending: true };
  return selectOrInteract(hostCands, 1, false, toOwner === 'self' ? 'self_field' : 'opp_field',
    pickHostAct as EffectAction, undefined, ctx);
}

/** LEVEL_REFERENCE_OVERRIDE: カードテキストから許容レベル範囲を解析して返す。
 * 「レベルを参照する場合、レベル４として扱ってもよい」→ { min:4, max:4 }
 * 「レベルを参照する場合、１～４いずれかのレベル１つとして扱ってもよい」→ { min:1, max:4 }
 */
function getLevelReferenceOverride(card: import('../types').CardData | undefined): { min: number; max: number } | null {
  const txt = card?.EffectText ?? '';
  if (!txt.includes('レベルを参照する場合')) return null;
  const toHW = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
  // 「レベルＮとして扱ってもよい」
  const single = txt.match(/レベルを参照する場合、レベル([０-９\d]+)として扱ってもよい/);
  if (single) {
    const lv = parseInt(toHW(single[1]));
    return { min: lv, max: lv };
  }
  // 「Ｎ～Ｍいずれかのレベル１つとして扱ってもよい」
  const range = txt.match(/レベルを参照する場合、([０-９\d]+)～([０-９\d]+)いずれかのレベル/);
  if (range) {
    return { min: parseInt(toHW(range[1])), max: parseInt(toHW(range[2])) };
  }
  return null;
}

function execRevealAndPick(a: RevealAndPickAction, ctx: ExecCtx): ExecResult {
  const state = ownerState(a.owner, ctx);
  const count = resolveCountRef(a.revealCount, ctx);
  const fromBottom = a.from === 'deck_bottom';
  const visible = fromBottom ? state.deck.slice(-count) : state.deck.slice(0, count);
  // colorMatchesLrig 等の動的フィルタを具体値へ解決（「センタールリグと共通する色を持つカード」G236）
  const ownerSt = a.owner === 'self' ? ctx.ownerState : ctx.otherState;
  const otherSt = a.owner === 'self' ? ctx.otherState : ctx.ownerState;
  // 捨札参照（`classMatchesDiscardSigni` 等）は**キャスター（コスト支払者）の記録値**で解決する＝
  // `resolveDynamicFilter` は知らないので、SEARCH（`:2812`）／ADD_TO_FIELD（`:4171`）と同じく先に前処理する。
  // 落ちていると `WXK10-029-E2`「コストで捨てたシグニと共通するクラスを持つシグニを２枚まで」が
  // **公開3枚から何でも2枚拾える**過剰効果になる（続き377n）。
  const rapFilter = resolveDynamicFilter(
    resolveDiscardLevelFilter(a.filter, ctx.ownerState), ownerSt, ctx.cardMap, otherSt,
    ctx.lastProcessedCards, ctx.effectivePowers, ctx.sourceCardNum, ctx.triggeringCardNum,
    // 宣言は効果所有者が行う。公開元が opponent でも宣言値は ctx.ownerState に保存される。
    ctx.ownerState,
  );
  let pickable = rapFilter ? visible.filter(n => matchesFilter(ctx.cardMap.get(n), rapFilter)) : visible;
  // LEVEL_REFERENCE_OVERRIDE: レベルフィルターがある場合、デッキ/手札/トラッシュ中の
  // 「レベル参照上書き」カードも対象に含める
  if (a.filter?.level !== undefined) {
    const targetLevel = typeof a.filter.level === 'number' ? a.filter.level : null;
    if (targetLevel !== null) {
      const overridable = visible.filter(n => {
        if (pickable.includes(n)) return false;
        const card = ctx.cardMap.get(n);
        const override = getLevelReferenceOverride(card);
        return override !== null && targetLevel >= override.min && targetLevel <= override.max;
      });
      if (overridable.length > 0) pickable = [...pickable, ...overridable];
    }
  }
  let maxPick = a.pickCount === 'ALL' ? pickable.length : a.pickCount;
  // 公開札を場に出す場合、選択上限を空きシグニゾーン数までに絞る。
  // 配置段階だけで切り捨てると、選択済みだが置けなかった札が remainder からも除外され消失する。
  if (a.then.type === 'ADD_TO_FIELD') {
    const emptyZones = state.field.signi.filter(zone => !zone || zone.length === 0).length;
    maxPick = Math.min(maxPick, emptyZones);
  }

  if (pickable.length === 0) {
    // ピック対象なし：残りを指定場所へ
    if (a.remainder) {
      const restOrdered = a.remainder.shuffle ? shuffle([...visible]) : visible;
      const deckRest = fromBottom
        ? state.deck.slice(0, Math.max(0, state.deck.length - visible.length))
        : state.deck.slice(visible.length);
      // 行き先を実装していない location（hand/field/lrig_* 等）ではデッキから抜かない＝公開札の消失を防ぐ。
      const movesOutOfDeck = a.remainder.location === 'trash' || a.remainder.location === 'energy';
      const newS: PlayerState = {
        ...state,
        deck: a.remainder.location === 'deck'
          ? (a.remainder.position === 'bottom' ? [...deckRest, ...restOrdered] : [...restOrdered, ...deckRest])
          : movesOutOfDeck ? deckRest : state.deck,
        ...(a.remainder.location === 'trash' ? { trash: [...state.trash, ...restOrdered] } : {}),
        ...(a.remainder.location === 'energy' ? { energy: [...state.energy, ...restOrdered] } : {}),
      };
      const unmatched = addLog(setOwnerState(a.owner, newS, ctx), `デッキ${fromBottom ? '下' : '上'}${count}枚を確認`);
      const recorded = { ...unmatched, lastProcessedCards: a.recordRevealed ? visible : [] };
      return a.elseAction ? executeAction(a.elseAction, recorded) : done(recorded);
    }
    const recorded = { ...ctx, lastProcessedCards: a.recordRevealed ? visible : [] };
    return a.elseAction ? executeAction(a.elseAction, recorded) : done(recorded);
  }

  // デッキはスライスせず公開カードを残す（resumeSearch が picked を各領域へ、未pick公開カードを
  // revealRemainder で指定場所へ移す＝公開カードの消失を防ぐ）。旧実装は deck.slice で公開分を除去し
  // 未pick/非対象カードを復元できず消失させていた（実バグ）。
  return needsInteraction(setOwnerState(a.owner, state, ctx), {
    type: 'SEARCH',
    visibleCards: pickable,
    maxPick,
    ...(a.pickUpTo ? { optional: true } : {}),
    // 選んだ複数枚どうしの相互差異（「それぞれレベルの異なるシグニを４枚まで」）。§6.2 段2 第42バッチ。
    // resumeSearch（:8757）が `satisfiesSelectionConstraint` で検査し、選択UIも候補を絞る。
    ...(a.selectionConstraint ? { selectionConstraint: a.selectionConstraint } : {}),
    thenAction: a.then,
    ...(a.handOrField ? { handOrField: true } : {}),
    ...(a.handOrEnergy ? { handOrEnergy: true } : {}),
    ...(a.opponentChoosesPileToTrash ? { opponentChoosesPileToTrash: true } : {}),
    ...(a.remainder ? { revealRemainder: { cards: visible, location: a.remainder.location as 'deck' | 'trash' | 'energy', position: a.remainder.position, ...(a.remainder.shuffle ? { shuffle: true } : {}) } } : {}),
    ...(a.recordRevealed ? { lastProcessedCardsAfter: visible } : {}),
    // §6.4 O-2: 公開元／残り札の行き先の持ち主と、選ぶ人を pending へ引き継ぐ。
    // deckOwner を落とすと resumeSearch が**効果オーナーのデッキ**を掘る（相手の公開札が自分のデッキから消える）。
    ...(a.owner === 'opponent' ? { deckOwner: 'opponent' as const } : {}),
    ...(a.opponentResponds ? { opponentResponds: true } : {}),
  });
}

function lookPickThenAction(then: 'hand' | 'energy' | 'trash' | 'field' | 'beat' | 'deck_top' | 'trap' | 'seed' | 'magic_box', owner: Owner): EffectAction {
  if (then === 'hand') return { type: 'ADD_TO_HAND', owner } as EffectAction;
  // 'trap': ゾーン選択の CHOOSE を挟むため applyDirectAction のループには載せられない
  // （そこで !done を返すと外側 continuation が落ちる）。resumeSearch が専用分岐で受ける。
  if (then === 'trap') return { type: 'STUB', id: 'INTERNAL_ASK_TRAP_ZONE' } as EffectAction;
  // 'seed': 既存の複数シード設置ループへ公開札の選択結果を渡す。resumeSearch が外側 continuation と
  // SEQUENCE 化するため、全シードのゾーン選択後にだけ remainder 処理へ戻る。
  if (then === 'seed') return { type: 'STUB', id: 'INTERNAL_SEEDS_PLACE_LOOP' } as EffectAction;
  if (then === 'magic_box') return { type: 'STUB', id: 'PLACE_MAGIC_BOX' } as EffectAction;
  // 'deck_top': 盤面は動かさない（デッキ内に残したまま）。execLookPickChain が remainder 処理時に
  // lastProcessedCards 経由で受け取った予約カードを一番上へ置く。
  if (then === 'deck_top') return { type: 'STUB', id: 'INTERNAL_KEEP_ON_DECK_TOP' } as EffectAction;
  if (then === 'energy') return { type: 'ADD_TO_ENERGY', owner } as EffectAction;
  // 'field': resumeSearch の ADD_TO_FIELD 分岐がゾーン選択チェーン＋外側 continuation を処理する
  if (then === 'field') return { type: 'ADD_TO_FIELD', owner } as EffectAction;
  // 'beat': 公開中のデッキカードを【ビート】にする（applyDirectAction の ADD_TO_BEAT 分岐・ゾーン選択不要）
  if (then === 'beat') return { type: 'ADD_TO_BEAT', owner } as EffectAction;
  return { type: 'TRASH', target: { type: 'DECK_CARD', owner } } as EffectAction;
}

// LOOK_PICK_CHAIN: デッキ上N枚を1度公開し、stages を順にピック（手札/エナ/トラッシュ）、残りを remainder へ。
// 段間は SEARCH の continuation に自身（remaining stages + _revealed）を渡して再入し、resumeSearch が
// セットする lastProcessedCards（直前ステージのピック）を sharesClassWithPrev の参照に使う。
function execLookPickChain(a: import('../types/effects').LookPickChainAction, ctx: ExecCtx): ExecResult {
  const owner = a.owner;
  const isCont = !!a._revealed;
  const deck0 = ownerState(owner, ctx).deck;
  const revealed: string[] = a._revealed ?? deck0.slice(0, Math.min(resolveCountRef(a.revealCount, ctx), deck0.length));
  if (revealed.length === 0) return done(ctx);
  let cur = isCont ? ctx : addLog(ctx, `デッキ上${revealed.length}枚を見る`);
  let prevPicks: string[] = isCont ? (cur.lastProcessedCards ?? []) : [];
  const completedPicks: string[] = [...(a._picked ?? []), ...prevPicks];
  // then:'deck_top' のピックは盤面を動かさずここで予約し、remainder 処理でまとめて一番上へ置く。
  // 直前ステージが deck_top だった再入（_pendingTop）でだけ lastProcessedCards を予約へ移す。
  const topReserved: string[] = [...(a._topReserved ?? []), ...(a._pendingTop ? prevPicks : [])];
  let stages = a.stages;
  while (stages.length > 0) {
    const stage = stages[0];
    const state = ownerState(owner, cur);
    let cands = revealed.filter(n => state.deck.includes(n));
    // ⚠ stage.filter は **resolveDynamicFilter を通してから** matchesFilter に渡す。
    //   matchesFilter は colorMatchesLrig 等の動的語彙を理解せず**黙って無視する**ため、素通しすると
    //   「センタールリグと共通する色を持つシグニ」が単なる「シグニ」に化ける（タスク12(xlvi)(a) で実測）。
    if (stage.filter) {
      const stageOwnerSt = owner === 'self' ? cur.ownerState : cur.otherState;
      const stageOtherSt = owner === 'self' ? cur.otherState : cur.ownerState;
      const resolved = resolveDynamicFilter(stage.filter, stageOwnerSt, cur.cardMap, stageOtherSt, cur.lastProcessedCards, cur.effectivePowers, cur.sourceCardNum, cur.triggeringCardNum);
      cands = cands.filter(n => matchesFilter(cur.cardMap.get(getCardNum(n)), resolved));
    }
    if (stage.sharesClassWithPrev) {
      const prevClasses = prevPicks.flatMap(p => (cur.cardMap.get(getCardNum(p))?.CardClass ?? '').split(/[/／]/).map(s => s.trim()).filter(Boolean));
      cands = prevClasses.length === 0 ? [] : cands.filter(n => {
        const cls = cur.cardMap.get(getCardNum(n))?.CardClass ?? '';
        return prevClasses.some(pc => cls.includes(pc));
      });
    }
    // 直前ステージのピックと**共通クラスを持たない**もののみ（「そのシグニと共通するクラスを持たないシグニ」）。
    // 直前が空振り（prevPicks 無し）なら参照先が無い＝制限なしのまま通す。
    if (stage.notSharesClassWithPrev && prevPicks.length > 0) {
      const prevClasses = prevPicks.flatMap(p => (cur.cardMap.get(getCardNum(p))?.CardClass ?? '').split(/[/／]/).map(s => s.trim()).filter(Boolean));
      cands = cands.filter(n => {
        const cls = cur.cardMap.get(getCardNum(n))?.CardClass ?? '';
        return !prevClasses.some(pc => cls.includes(pc));
      });
    }
    // deck_top 段は「デッキに残す」ため、既に予約済みのカードを再度選ばせない
    if (stage.then === 'deck_top') cands = cands.filter(n => !topReserved.includes(n));
    if (cands.length === 0) { stages = stages.slice(1); prevPicks = []; continue; }
    // 場出し段は選択上限を空きシグニゾーン数まで絞る（execRevealAndPick と同じ手当て）。
    // ⚠絞らないと、超過分は applyDirectAction の「空きシグニゾーンなし」分岐へ落ちるが、
    //   **その時点でカードは既にデッキから抜かれている**＝盤面にもデッキにも残らず消失する。
    let stageMax = stage.pickCount === 'ALL' ? cands.length : stage.pickCount;
    if (stage.then === 'field') {
      stageMax = Math.min(stageMax, state.field.signi.filter(z => !z || z.length === 0).length);
      if (stageMax === 0) { stages = stages.slice(1); prevPicks = []; continue; }
    }
    const cont = { type: 'LOOK_PICK_CHAIN', owner, revealCount: a.revealCount, stages: stages.slice(1), remainder: a.remainder, _revealed: revealed,
      ...(completedPicks.length > 0 ? { _picked: completedPicks } : {}),
      ...(topReserved.length > 0 ? { _topReserved: topReserved } : {}),
      ...(a.opponentResponds ? { opponentResponds: true } : {}),
      ...(stage.then === 'deck_top' ? { _pendingTop: true } : {}) } as import('../types/effects').LookPickChainAction;
    return needsInteraction(cur, {
      type: 'SEARCH',
      visibleCards: cands,
      maxPick: stageMax,
      ...(stage.pickUpTo ? { optional: true } : {}),
      thenAction: lookPickThenAction(stage.then, owner),
      continuation: cont as EffectAction,
      ...(stage.handOrEnergy ? { handOrEnergy: true } : {}),
      // §6.4 O-2: 「対戦相手は自分のデッキの上から〜見て」＝相手のデッキを相手自身が掘る。
      ...(owner === 'opponent' ? { deckOwner: 'opponent' as const } : {}),
      ...(a.opponentResponds ? { opponentResponds: true } : {}),
    });
  }
  // 後続の「この方法で1枚も〜していない／N枚〜した場合」は最後の stage だけでなく、
  // 1度の公開から選んだ全 stage の合計を見る。
  cur = { ...cur, lastProcessedCards: completedPicks };
  // 残り（公開してまだデッキにあるカード）を remainder へ。
  // then:'deck_top' の予約分は「残り」から外し、remainder を動かしたあとのデッキの一番上に置く。
  const state = ownerState(owner, cur);
  const stillInDeck = revealed.filter(n => state.deck.includes(n));
  const reservedTop = topReserved.filter(n => stillInDeck.includes(n));
  const rest = stillInDeck.filter(n => !reservedTop.includes(n));
  if (rest.length === 0 && reservedTop.length === 0) return done(cur);
  const deckRest = state.deck.filter(n => !stillInDeck.includes(n));
  const withTop = (deck: string[]) => (reservedTop.length > 0 ? [...reservedTop, ...deck] : deck);
  const topLog = (c: ExecCtx) => (reservedTop.length > 0 ? addLog(c, `${reservedTop.length}枚をデッキの一番上へ戻す`) : c);
  if (a.remainder.location === 'deck') {
    const orderedRest = a.remainder.shuffle ? shuffle([...rest]) : rest;
    const newDeck = withTop(a.remainder.position === 'bottom' ? [...deckRest, ...orderedRest] : [...orderedRest, ...deckRest]);
    const moved = setOwnerState(owner, { ...state, deck: newDeck }, cur);
    return done(topLog(rest.length > 0
      ? addLog(moved, `残り${rest.length}枚をデッキの${a.remainder.position === 'bottom' ? '一番下' : '上'}へ`)
      : moved));
  }
  if (reservedTop.length > 0) {
    // 残りの行き先がデッキ以外（トラッシュ/エナ）でも、予約分はデッキの一番上へ戻す
    if (a.remainder.location === 'trash') {
      return done(topLog(addLog(setOwnerState(owner, { ...state, deck: withTop(deckRest), trash: [...state.trash, ...rest] }, cur), `残り${rest.length}枚をトラッシュへ`)));
    }
    if (a.remainder.location === 'energy') {
      return done(topLog(addLog(setOwnerState(owner, { ...state, deck: withTop(deckRest), energy: [...state.energy, ...rest] }, cur), `残り${rest.length}枚をエナゾーンへ`)));
    }
    if (a.remainder.location === 'hand') {
      return done(topLog(addLog(setOwnerState(owner, { ...state, deck: withTop(deckRest), hand: [...state.hand, ...rest] }, cur), `残り${rest.length}枚を手札へ`)));
    }
    return done(topLog(setOwnerState(owner, { ...state, deck: withTop(deckRest) }, cur)));
  }
  if (a.remainder.location === 'trash') {
    return done(addLog(setOwnerState(owner, { ...state, deck: deckRest, trash: [...state.trash, ...rest] }, cur), `残り${rest.length}枚をトラッシュへ`));
  }
  // 「残りをエナゾーンに置く」（WX24-P4-022-E2 等）。未対応だと残りが黙ってデッキに残る＝原文と違う盤面になる。
  if (a.remainder.location === 'energy') {
    return done(addLog(setOwnerState(owner, { ...state, deck: deckRest, energy: [...state.energy, ...rest] }, cur), `残り${rest.length}枚をエナゾーンへ`));
  }
  // 「残りを手札に加える」（WX15-083-TRAP＝トラップ設置1枚＋残り手札・タスク12(xlvi)(g)）
  if (a.remainder.location === 'hand') {
    return done(addLog(setOwnerState(owner, { ...state, deck: deckRest, hand: [...state.hand, ...rest] }, cur), `残り${rest.length}枚を手札へ`));
  }
  return done(cur);
}

function execRevealUntilBanishSameLevel(
  a: import('../types/effects').RevealUntilBanishSameLevelAction,
  ctx: ExecCtx,
): ExecResult {
  const state = ctx.ownerState; // 公開はあなたのデッキ
  // デッキ上から revealClass のシグニがめくれるまで公開
  let foundIdx = -1;
  for (let i = 0; i < state.deck.length; i++) {
    const card = ctx.cardMap.get(state.deck[i]);
    if (card?.Type === 'シグニ' && (card.CardClass ?? '').includes(a.revealClass)) { foundIdx = i; break; }
  }
  if (foundIdx < 0) {
    // 見つからない：デッキ全体を見たがいない（実質シャッフルのみ）
    const newS: PlayerState = { ...state, deck: shuffle([...state.deck]) };
    return done(addLog(setOwnerState('self', newS, ctx), `デッキに＜${a.revealClass}＞のシグニがなかった`));
  }
  const revealed = state.deck.slice(0, foundIdx + 1);
  const foundCard = ctx.cardMap.get(state.deck[foundIdx]);
  const level = parseInt(foundCard?.Level ?? '0', 10) || 0;
  // 公開したカードをシャッフルしてデッキの一番下へ
  const remaining = state.deck.slice(foundIdx + 1);
  const newDeck = [...remaining, ...shuffle(revealed)];
  const newCtx = setOwnerState('self', { ...state, deck: newDeck }, ctx);
  const logged = addLog(newCtx, `＜${a.revealClass}＞のシグニ（レベル${level}）が公開された`);
  // そのレベルの相手シグニ1体をバニッシュ
  const banishState = ownerState(a.banishOwner, logged);
  const cands = fieldCandidates(banishState, { cardType: 'シグニ', level }, logged.cardMap, logged.effectivePowers, logged.allColorSigniNums, logged.fieldSigniExtraColors);
  if (cands.length === 0) return done(addLog(logged, `レベル${level}の対戦相手のシグニはいなかった`));
  const banishAction: BanishAction = { type: 'BANISH', target: { type: 'SIGNI', owner: a.banishOwner, count: 1, filter: { cardType: 'シグニ', level }, upToCount: false } };
  const scope: TargetScope = a.banishOwner === 'self' ? 'self_field' : 'opp_field';
  return selectOrInteract(cands, 1, false, scope, banishAction, undefined, logged);
}

function revealUntilStopIndex(
  stop: import('../types/effects').RevealUntilStopCondition,
  owner: Owner,
  ctx: ExecCtx,
): { endIndex: number; matched: boolean } {
  const state = ownerState(owner, ctx);
  const ownerSt = owner === 'self' ? ctx.ownerState : ctx.otherState;
  const otherSt = owner === 'self' ? ctx.otherState : ctx.ownerState;
  const resolvedFilter = resolveDynamicFilter(
    stop.filter, ownerSt, ctx.cardMap, otherSt, ctx.lastProcessedCards,
    ctx.effectivePowers, ctx.sourceCardNum, ctx.triggeringCardNum,
  );
  let matchingCount = 0;
  let levelSum = 0;
  for (let i = 0; i < state.deck.length; i++) {
    const card = ctx.cardMap.get(getCardNum(state.deck[i]));
    // 🔑デッキ内シグニのレベル上書き（§6.4 O-34(c)）＝`WXK07-034-E1`① で全シグニを Lv4 にしてから
    //   ② の「レベル4のシグニが2枚めくれるまで」を判定する。**停止条件と当たり札判定の両方**に通す
    //   （片方だけだと「止まるのに当たらない／当たるのに止まらない」でズレる）。
    const filterOk = !resolvedFilter
      || matchesFilter(card, resolvedFilter, undefined, undefined, undefined, deckSigniOverrideLevel(state, card));
    if (stop.kind === 'declaredName') {
      if (ownerSt.declared_card_name && card?.CardName === ownerSt.declared_card_name && filterOk) {
        return { endIndex: i, matched: true };
      }
      continue;
    }
    if (card?.Type !== 'シグニ' || !filterOk) continue;
    if (stop.kind === 'signiCount') {
      matchingCount++;
      if (matchingCount >= stop.count) return { endIndex: i, matched: true };
    } else {
      levelSum += Number.parseInt(card.Level ?? '0', 10) || 0;
      if (levelSum >= stop.threshold) return { endIndex: i, matched: true };
    }
  }
  return { endIndex: state.deck.length - 1, matched: false };
}

function moveRevealedDirect(
  owner: Owner,
  cards: string[],
  destination: import('../types/effects').RevealUntilDestination,
  ctx: ExecCtx,
): ExecCtx {
  if (cards.length === 0) return ctx;
  const state = ownerState(owner, ctx);
  // CardNum が同じテスト札も「公開した枚数分だけ」抜く。Set/filter だと未公開の同名札まで消える。
  const deck = [...state.deck];
  for (const cardNum of cards) {
    const index = deck.indexOf(cardNum);
    if (index >= 0) deck.splice(index, 1);
  }
  const ordered = destination === 'deck_bottom_shuffled' ? shuffle([...cards]) : cards;
  if (destination === 'hand') return setOwnerState(owner, { ...state, deck, hand: [...state.hand, ...cards] }, ctx);
  if (destination === 'trash') return setOwnerState(owner, { ...state, deck, trash: [...state.trash, ...cards] }, ctx);
  if (destination === 'deck_bottom' || destination === 'deck_bottom_shuffled') {
    return setOwnerState(owner, { ...state, deck: [...deck, ...ordered] }, ctx);
  }
  return ctx;
}

function revealUntilThenAction(
  hit: import('../types/effects').RevealUntilHitSpec,
  owner: Owner,
): EffectAction | null {
  if (hit.destination === 'hand') return { type: 'ADD_TO_HAND', owner } as EffectAction;
  if (hit.destination === 'field') {
    return { type: 'ADD_TO_FIELD', owner, ...(hit.suppressOnPlay ? { suppressOnPlay: true } : {}) } as EffectAction;
  }
  if (hit.destination === 'trash') {
    return { type: 'TRASH', target: { type: 'DECK_CARD', owner, count: 1 } } as EffectAction;
  }
  return null;
}

/**
 * REVEAL_UNTIL: 停止条件・ヒット札・残りの行き先をJSONだけから解決する。
 * EffectText/BurstText は参照しない。公開集合全体を lastProcessedCards に残す。
 */
function execRevealUntil(a: import('../types/effects').RevealUntilAction, ctx: ExecCtx): ExecResult {
  if (a._skip) return done({ ...ctx, lastProcessedCards: [] });
  if (a.optional) {
    const perform = { ...a, optional: false } as import('../types/effects').RevealUntilAction;
    return needsInteraction(addLog(ctx, 'デッキを公開するか選択'), {
      type: 'CHOOSE', count: 1, options: [
        { id: 'reveal', label: '公開する', action: perform, available: true },
        { id: 'skip', label: '公開しない', action: { ...perform, _skip: true }, available: true },
      ],
    });
  }
  const state = ownerState(a.owner, ctx);
  if (state.deck.length === 0) return done({ ...addLog(ctx, 'デッキが空のため公開しない'), lastProcessedCards: [] });
  const stopResult = revealUntilStopIndex(a.stopCondition, a.owner, ctx);
  const revealed = state.deck.slice(0, Math.max(0, stopResult.endIndex + 1));
  const logged = addLog(ctx, `デッキ上${revealed.length}枚を公開`);
  if (!a.hit) {
    const moved = moveRevealedDirect(a.owner, revealed, a.restDestination, logged);
    return done({ ...moved, lastProcessedCards: revealed });
  }
  const ownerSt = a.owner === 'self' ? ctx.ownerState : ctx.otherState;
  const otherSt = a.owner === 'self' ? ctx.otherState : ctx.ownerState;
  const resolvedHitFilter = resolveDynamicFilter(
    a.hit.filter, ownerSt, ctx.cardMap, otherSt, ctx.lastProcessedCards,
    ctx.effectivePowers, ctx.sourceCardNum, ctx.triggeringCardNum,
  );
  const candidates = resolvedHitFilter
    ? revealed.filter(n => {
        const c = ctx.cardMap.get(getCardNum(n));
        // ⚠公開した束はまだデッキ由来なので、停止条件と同じレベル上書きを適用する（§6.4 O-34(c)）。
        return matchesFilter(c, resolvedHitFilter, undefined, undefined, undefined, deckSigniOverrideLevel(state, c));
      })
    : [...revealed];
  const maxPick = a.hit.count === 'ALL' ? candidates.length : Math.min(a.hit.count, candidates.length);
  if (candidates.length === 0 || maxPick === 0) {
    const moved = moveRevealedDirect(a.owner, revealed, a.restDestination, logged);
    return done({ ...moved, lastProcessedCards: revealed });
  }
  const thenAction = revealUntilThenAction(a.hit, a.owner);
  // デッキ下系は現在の採用効果では全件必須ALL。選択UIを挟まず、2束を構造どおり直接移動する。
  if (!thenAction) {
    if (a.hit.upToCount || a.hit.count !== 'ALL') {
      return done(addLog(ctx, 'REVEAL_UNTIL: 選択式のデッキ下移動は未対応'));
    }
    const hitSet = new Set(candidates);
    const rest = revealed.filter(n => !hitSet.has(n));
    let moved = moveRevealedDirect(a.owner, rest, a.restDestination, logged);
    moved = moveRevealedDirect(a.owner, candidates, a.hit.destination, moved);
    return done({ ...moved, lastProcessedCards: revealed });
  }
  const remainder = a.restDestination === 'trash'
    ? { location: 'trash' as const, position: 'bottom' as const }
    : a.restDestination === 'deck_bottom' || a.restDestination === 'deck_bottom_shuffled'
      ? { location: 'deck' as const, position: 'bottom' as const,
          ...(a.restDestination === 'deck_bottom_shuffled' ? { shuffle: true } : {}) }
      : null;
  if (!remainder) return done(addLog(ctx, `REVEAL_UNTIL: 残りの行き先 ${a.restDestination} は選択式処理で未対応`));
  let cappedPick = maxPick;
  if (a.hit.destination === 'field') {
    const emptyZones = state.field.signi.filter(zone => !zone || zone.length === 0).length;
    cappedPick = Math.min(cappedPick, emptyZones);
  }
  if (cappedPick === 0) {
    const moved = moveRevealedDirect(a.owner, revealed, a.restDestination, logged);
    return done({ ...moved, lastProcessedCards: revealed });
  }
  return needsInteraction(logged, {
    type: 'SEARCH', visibleCards: candidates, maxPick: cappedPick,
    optional: a.hit.upToCount ?? false,
    thenAction,
    revealRemainder: { cards: revealed, ...remainder },
    lastProcessedCardsAfter: revealed,
  });
}

// REVEAL_UNTIL_TO_HAND: デッキ上から revealClass のシグニ（省略=任意シグニ）がめくれるまで公開し、
// そのシグニを手札に加え、公開した他のカードを restDest（シャッフルしてデッキ下/デッキ下/トラッシュ）へ。
function execRevealUntilToHand(a: import('../types/effects').RevealUntilToHandAction, ctx: ExecCtx): ExecResult {
  const state = ownerState(a.owner, ctx);
  const legacyStop: import('../types/effects').RevealUntilStopCondition = {
    kind: 'signiCount', count: 1,
    ...(a.revealClass ? { filter: { cardType: 'シグニ', story: a.revealClass } } : {}),
  };
  const stop = a.stopCondition ?? legacyStop;
  const stopResult = state.deck.length === 0
    ? { endIndex: -1, matched: false }
    : revealUntilStopIndex(stop, a.owner, ctx);
  if (!stopResult.matched) {
    // 該当シグニなし：公開した全カード（=デッキ全体）を restDest へ（シャッフル）
    const newS: PlayerState = { ...state, deck: a.restDest === 'trash' ? [] : shuffle([...state.deck]),
      ...(a.restDest === 'trash' ? { trash: [...state.trash, ...state.deck] } : {}) };
    return done(addLog(setOwnerState(a.owner, newS, ctx), `デッキに${a.revealClass ? `＜${a.revealClass}＞の` : ''}シグニがなかった`));
  }
  const foundIdx = stopResult.endIndex;
  const hit = state.deck[foundIdx];
  const revealedRest = state.deck.slice(0, foundIdx); // ヒット手前の公開カード
  const remaining = state.deck.slice(foundIdx + 1);   // 未公開の残りデッキ
  let newDeck: string[];
  let newTrash = state.trash;
  if (a.restDest === 'trash') { newDeck = remaining; newTrash = [...state.trash, ...revealedRest]; }
  else if (a.restDest === 'deck_bottom_shuffled') newDeck = [...remaining, ...shuffle(revealedRest)];
  else newDeck = [...remaining, ...revealedRest];
  const newS: PlayerState = { ...state, deck: newDeck, trash: newTrash, hand: [...state.hand, hit] };
  return done(addLog(setOwnerState(a.owner, newS, ctx),
    `${ctx.cardMap.get(hit)?.CardName ?? hit}を手札に加える（公開${revealedRest.length + 1}枚）`));
}

// REVEAL_UNTIL_TO_FIELD: デッキ上からシグニがめくれるまで公開→そのシグニを場に出し、公開した他のカードをトラッシュへ。
// これを repeat 回繰り返す（WX04-093「惰眠」）。空きゾーンがなく場に出せないシグニはトラッシュへ。
function execRevealUntilToField(a: import('../types/effects').RevealUntilToFieldAction, ctx: ExecCtx): ExecResult {
  if (a.repeat <= 0) return done(ctx);
  const state = ownerState(a.owner, ctx);
  let foundIdx = -1;
  for (let i = 0; i < state.deck.length; i++) {
    const card = ctx.cardMap.get(state.deck[i]);
    if (card?.Type === 'シグニ' && (!a.revealClass || (card.CardClass ?? '').includes(a.revealClass))) { foundIdx = i; break; }
  }
  // 該当シグニなし：公開した全カード（=デッキ全体）をトラッシュ。残りデッキが尽きるので繰り返し終了。
  if (foundIdx < 0) {
    if (state.deck.length === 0) return done(addLog(ctx, 'デッキが空のため何もしない'));
    const newS: PlayerState = { ...state, deck: [], trash: [...state.trash, ...state.deck] };
    return done(addLog(setOwnerState(a.owner, newS, ctx),
      `デッキに${a.revealClass ? `＜${a.revealClass}＞の` : ''}シグニがなかった（${state.deck.length}枚をトラッシュ）`));
  }
  const hit = state.deck[foundIdx];
  const revealedRest = state.deck.slice(0, foundIdx); // ヒット手前の公開カード → トラッシュ
  const remaining = state.deck.slice(foundIdx + 1);   // 未公開の残りデッキ
  // ヒットをデッキから除去し、手前の公開カードをトラッシュへ
  let cur = addLog(setOwnerState(a.owner, { ...state, deck: remaining, trash: [...state.trash, ...revealedRest] }, ctx),
    `${ctx.cardMap.get(hit)?.CardName ?? hit}を公開（手前${revealedRest.length}枚をトラッシュ）`);
  const next: import('../types/effects').RevealUntilToFieldAction = {
    type: 'REVEAL_UNTIL_TO_FIELD', owner: a.owner, repeat: a.repeat - 1,
    ...(a.revealClass ? { revealClass: a.revealClass } : {}),
  };
  // 公開したシグニを場に出す
  const fieldState = ownerState(a.owner, cur);
  const signi = [...fieldState.field.signi] as (string[] | null)[];
  const emptyZones = signi.map((z, i) => ({ i, empty: !z || z.length === 0 })).filter(x => x.empty);
  // 配置制限で出せない場合も「場に出すことのできないシグニ」＝原文どおりトラッシュへ送る。
  const blockedRU = emptyZones.length > 0 ? deployLimitBlockedFor(a.owner, hit, cur) : null;
  if (emptyZones.length === 0 || blockedRU) {
    // 場に出せない → トラッシュ（原文「場に出すことのできないシグニはトラッシュに置かれる」）
    cur = addLog(setOwnerState(a.owner, { ...fieldState, trash: [...fieldState.trash, hit] }, cur),
      blockedRU
        ? `${deployLimitLogMessage(blockedRU, ctx.cardMap.get(hit)?.CardName ?? hit)} → トラッシュ`
        : `空きゾーンなし → ${ctx.cardMap.get(hit)?.CardName ?? hit}をトラッシュ`);
    return executeAction(next, cur);
  }
  // 場に出したシグニは lastProcessedCards に蓄積する。呼び出し側（BattleScreen）が
  // このスペル/能力の処理後に【出】(ON_PLAY) を発火するためのキーにする。
  if (emptyZones.length === 1 || (a.owner !== 'self' && a.owner !== 'opponent')) {
    // 空きゾーンが1つ（または非プレイヤー owner）なら選択不要 → 自動配置して継続
    signi[emptyZones[0].i] = [hit];
    cur = addLog(setOwnerState(a.owner, recordNonHandPlacement({ ...fieldState, field: { ...fieldState.field, signi } }, hit), cur),
      `${ctx.cardMap.get(hit)?.CardName ?? hit}を場に出す`);
    cur = { ...cur, lastProcessedCards: [...(cur.lastProcessedCards ?? []), hit] };
    return executeAction(next, cur);
  }
  // 複数空きゾーン：プレイヤーに配置先を選ばせる。残りの繰り返しを continuation に、
  // これまで場に出したシグニを placedSoFar に積んで中断を跨いで追跡する。
  return needsInteraction(cur, {
    type: 'SELECT_SIGNI_ZONE',
    cardNum: hit,
    owner: a.owner,
    continuation: next,
    placedSoFar: cur.lastProcessedCards ?? [],
    fromNonHand: true,
  });
}

function execPlayFree(a: PlayFreeAction, ctx: ExecCtx): ExecResult {
  let cands: string[];

  if (a.source === 'hand') {
    cands = handCandidates(ctx.ownerState, a.filter, ctx.cardMap, ctx.treatAsClassAllZones);
  } else if (a.source === 'opp_hand') {
    cands = handCandidates(ctx.otherState, a.filter, ctx.cardMap, ctx.treatAsClassAllZones);
  } else if (a.source === 'opp_trash') {
    cands = trashCandidates(ctx.otherState, a.filter, ctx.cardMap, ctx.treatAsClassAllZones);
  } else {
    // lrig_deck: ルリグデッキの先頭から対象を探す
    cands = (ctx.ownerState.lrig_deck ?? []).filter(n => matchesFilter(ctx.cardMap.get(n), a.filter));
  }

  // costThreshold: 使用コストの合計が閾値以下のカードに限定（WX04-011「コストの合計が３以下の青のアーツ」）
  const dynamicThreshold = a.costThresholdFromPaidCount
    ? (a.costThresholdFromPaidCount.source === 'discard'
        ? (ctx.ownerState.last_activated_discard_count ?? 0)
        : (ctx.ownerState.last_cost_energy_trash_count ?? 0))
      + (a.costThresholdFromPaidCount.plus ?? 0)
    : undefined;
  const costThreshold = dynamicThreshold ?? a.costThreshold;
  if (costThreshold != null) {
    cands = cands.filter(n => {
      const c = ctx.cardMap.get(n);
      const total = parseEnergyCosts(c?.Cost ?? '').reduce((s, e) => s + e.count, 0);
      return total <= costThreshold;
    });
  }
  // useTimingIncludes: 使用タイミングに指定アイコンを含むカードに限定（WX04-011「使用タイミングに《メインフェイズアイコン》を含む」）
  if (a.useTimingIncludes) {
    cands = cands.filter(n => (ctx.cardMap.get(n)?.Timing ?? '').includes(a.useTimingIncludes!));
  }

  if (cands.length === 0) return done(addLog(ctx, 'PlayFree: 対象なし'));

  // opp_hand: 相手の手札から選んだスペルを「あなたの手札にあるかのように」コストなしで使用する（WX04-003）。
  // STUB 'PLAY_FREE' が選択カードの主効果を実際に実行し、使用後は持ち主（相手）のトラッシュへ送る。
  // その他のソース（self hand / opp_trash / lrig_deck）は従来どおりのプレースホルダー（暫定）。
  const thenAction: EffectAction = a.source === 'opp_hand'
    ? ({ type: 'STUB', id: 'PLAY_FREE' } as StubAction)
    : ({ type: 'ADD_TO_HAND', owner: 'self' } as EffectAction);

  // SEARCH は0枚選択で確定でき、「使用してもよい」（辞退）に対応する
  return needsInteraction(ctx, {
    type: 'SEARCH',
    visibleCards: cands,
    maxPick: 1,
    thenAction,
  });
}

// §6.1 タスク7: トラッシュ（スペル）/ルリグトラッシュ（アーツ）からコストの合計が閾値以下のカードを選び、
// コストを支払わずに使用する（WX09-012-E2／WX19-002-E4）。使用の実体は STUB 'USE_SPELL_FROM_TRASH'
// （フリープレイ系＝主効果を実行。スペルはトラッシュに残置・アーツはルリグトラッシュに残置）。
function execPlayFreeFromTrash(a: PlayFreeFromTrashAction, ctx: ExecCtx): ExecResult {
  const isArts = a.filter?.cardType === 'アーツ';
  const zone = isArts ? (ctx.ownerState.lrig_trash ?? []) : ctx.ownerState.trash;
  const cands = zone.filter(n => {
    const c = ctx.cardMap.get(n);
    if (!matchesFilter(c, a.filter)) return false;
    const total = parseEnergyCosts(c?.Cost ?? '').reduce((s, e) => s + e.count, 0);
    return total <= a.costThreshold;
  });
  if (cands.length === 0) return done(addLog(ctx, 'PlayFreeFromTrash: 対象なし'));
  // SEARCH は0枚選択で確定でき、「使用してもよい」（辞退）に対応する
  return needsInteraction(ctx, {
    type: 'SEARCH',
    visibleCards: cands,
    maxPick: a.maxCount,
    thenAction: ({ type: 'STUB', id: 'USE_SPELL_FROM_TRASH' } as StubAction) as EffectAction,
  });
}

function execCostIncrease(a: CostIncreaseAction, ctx: ExecCtx): ExecResult {
  // NEXT_OPP_TURN: 「次の対戦相手のターン、相手のコストが増える」＝キャスター(self)側へ保持し、
  // 相手ターンのコスト計算で参照する（power_mods_until_opp_turn と同型のライフサイクル）。
  if (a.duration === 'NEXT_OPP_TURN') {
    const selfS = ownerState('self', ctx);
    const entry = { targetCardType: a.targetCardType, amount: a.amount };
    const newSelf: PlayerState = {
      ...selfS,
      opp_cost_up_until_opp_turn: [...(selfS.opp_cost_up_until_opp_turn ?? []), entry],
    };
    return done(addLog(setOwnerState('self', newSelf, ctx), `次の相手ターン、相手の${a.targetCardType}コスト+${a.amount.map(e => e.count + e.color).join('')}`));
  }
  const tgtOwner = a.targetOwner === 'self' ? 'self' : 'opponent';
  const state = ownerState(tgtOwner, ctx);
  const mod = {
    direction: 'increase' as const,
    targetCardType: a.targetCardType,
    amount: a.amount,
    // UNTIL_END_OF_TURN（action 側の語彙）は cost_modifiers のターン境界クリア条件 'END_OF_TURN' へ正規化する
    // （そのまま通すと until 不一致で永続化する。WXK11-003①「このターン」）
    until: (a.duration === 'UNTIL_END_OF_TURN' ? 'END_OF_TURN' : (a.duration ?? 'PERMANENT')) as 'END_OF_TURN' | 'NEXT_TURN' | 'PERMANENT',
  };
  const newS: PlayerState = {
    ...state,
    cost_modifiers: [...(state.cost_modifiers ?? []), mod],
  };
  return done(addLog(setOwnerState(tgtOwner, newS, ctx), `${a.targetCardType}コスト+${a.amount.map(e => e.count + e.color).join('')}`));
}

function execPowerModifyPerField(a: PowerModifyPerFieldAction, ctx: ExecCtx): ExecResult {
  // excludeSelf は「カウント対象から効果元自身を除く」。thisCardOnly では対象そのものは除外しない。
  const tgtOwnerForExclude = a.target.owner === 'any' ? 'self' : a.target.owner as Owner;
  const tgtStatePre = ownerState(tgtOwnerForExclude, ctx);
  const tgtCandsPre = a.target.count !== 'ALL'
    ? fieldCandidates(tgtStatePre, a.target.filter, ctx.cardMap, ctx.effectivePowers)
    : [];
  const excludeCardNum = a.excludeSelf
    ? (a.target.filter?.thisCardOnly ? ctx.sourceCardNum : tgtCandsPre[0])
    : undefined;

  const countSigniInState = (s: PlayerState) => s.field.signi.filter(stack => {
    if (!stack || stack.length === 0) return false;
    const cn = stack[stack.length - 1];
    if (a.excludeSelf && cn === excludeCardNum) return false;
    const card = ctx.cardMap.get(cn);
    return matchesFilter(card, a.countFilter);
  }).length;

  const fieldCount = a.countOwner === 'any'
    ? countSigniInState(ctx.ownerState) + countSigniInState(ctx.otherState)
    : countSigniInState(ownerState(a.countOwner, ctx));

  if (fieldCount === 0) return done(ctx);

  const delta = a.deltaPerUnit * fieldCount;
  const tgtOwner = a.target.owner === 'any' ? 'self' : a.target.owner as Owner;
  const state = ownerState(tgtOwner, ctx);
  let cands = fieldCandidates(state, a.target.filter, ctx.cardMap, ctx.effectivePowers, ctx.allColorSigniNums, ctx.fieldSigniExtraColors);
  if (a.excludeSelf && ctx.sourceCardNum && !a.target.filter?.thisCardOnly) {
    cands = cands.filter(cn => cn !== ctx.sourceCardNum);
  }

  function applyMod(selected: string[], c: ExecCtx): ExecCtx {
    const s = ownerState(tgtOwner, c);
    const key = a.duration === 'UNTIL_OPP_TURN_END' ? 'power_mods_until_opp_turn' : 'temp_power_mods';
    const mods = [...(s[key] ?? []), ...selected.map(cardNum => ({ cardNum, delta }))];
    return addLog(setOwnerState(tgtOwner, { ...s, [key]: mods }, c),
      `${delta > 0 ? '+' : ''}${delta}（フィールド${fieldCount}体）`);
  }

  if (a.target.count === 'ALL') return done(applyMod(cands, ctx));
  if (a.target.filter?.thisCardOnly && ctx.sourceCardNum && cands.includes(ctx.sourceCardNum)) {
    return done(applyMod([ctx.sourceCardNum], ctx));
  }
  const cnt = resolveNum(a.target.count);
  const scope: TargetScope = tgtOwner === 'self' ? 'self_field' : 'opp_field';
  // 選択後は解決済み delta の POWER_MODIFY を適用（applyDirectAction が直接処理。
  // PER_FIELD case 欠落による default 再入＝同一SELECT_TARGET無限再発行を回避。続き93）。
  const pmAction: PowerModifyAction = { type: 'POWER_MODIFY', target: a.target, delta, duration: a.duration };
  return selectOrInteract(cands, cnt, a.target.upToCount ?? false, scope, pmAction, undefined, ctx);
}

function execPlaceUnderSigni(a: import('../types/effects').PlaceUnderSigniAction, ctx: ExecCtx): ExecResult {
  const sourceCardNum = ctx.sourceCardNum;
  if (!sourceCardNum) return done(ctx);

  // ソースシグニがあるゾーンのインデックスを探す
  const zoneIdx = ctx.ownerState.field.signi.findIndex(stack => stack?.includes(sourceCardNum));
  if (zoneIdx === -1) return done(ctx);

  if (a.source === 'deck_top') {
    const count = Math.min(a.count, ctx.ownerState.deck.length);
    if (count === 0) return done(ctx);
    const cards = ctx.ownerState.deck.slice(0, count);
    const newDeck = ctx.ownerState.deck.slice(count);
    const newSigni = ctx.ownerState.field.signi.map((stack, i) => {
      if (i !== zoneIdx) return stack;
      return [...cards, ...(stack ?? [])];
    }) as (string[] | null)[];
    const newOwner = { ...ctx.ownerState, deck: newDeck, field: { ...ctx.ownerState.field, signi: newSigni } };
    return done(addLog({ ...ctx, ownerState: newOwner }, `${count}`));
  }

  // trash/hand/energy: SELECT_TARGET インタラクション
  const state = ctx.ownerState;
  // LOCK_OPP_TRASH_MOVE（タスク12(lxxiii)）: 自分のトラッシュがロック中は「下に置く」も領域移動なので不可。
  if (a.source === 'trash' && isOwnTrashMoveLocked('self', ctx)) {
    return done(addLog(ctx, 'トラッシュのカードは自分の効果で移動できない'));
  }
  const srcList = a.source === 'trash' ? state.trash :
                  a.source === 'hand'  ? state.hand  :
                                          state.energy;
  const cands = srcList.filter(cn => {
    const card = ctx.cardMap.get(cn);
    return !a.filter || matchesFilter(card, a.filter);
  });
  if (cands.length === 0) return done(ctx);
  const thenAction: import('../types/effects').PlaceUnderSourceSigniAction =
    { type: 'PLACE_UNDER_SOURCE_SIGNI', fromLocation: a.source as 'trash' | 'hand' | 'energy' };
  const scope: TargetScope = a.source === 'hand' ? 'self_hand' :
                              a.source === 'energy' ? 'self_energy' : 'self_trash';
  return selectOrInteract(cands, a.count, a.upToCount ?? false, scope, thenAction, undefined, ctx, false, { selectionConstraint: a.selectionConstraint });
}

function execTakeFromUnderSigni(a: import('../types/effects').TakeFromUnderSigniAction, ctx: ExecCtx): ExecResult {
  let cands: string[] = [];
  let scope: TargetScope = 'self_field';
  if (a.fromThis && ctx.sourceCardNum) {
    const zoneIdx = ctx.ownerState.field.signi.findIndex(s => s?.includes(ctx.sourceCardNum!));
    if (zoneIdx !== -1) {
      const stack = ctx.ownerState.field.signi[zoneIdx]!;
      // under-cards = all except the last (top) card
      cands = stack.slice(0, -1).filter(cn => !a.filter || matchesFilter(ctx.cardMap.get(cn), a.filter));
    } else {
      // ON_LEAVE_FIELD では発火元は既に場を離れ、直前の下カードはルール処理でトラッシュにある。
      // StackEntry→ExecCtx で運ばれた既存スナップショットとの積集合だけを候補にする。
      const allowed = new Set(ctx.leftFieldUnderCards ?? []);
      cands = movableTrashCandidates('self', ctx.ownerState, a.filter, ctx.cardMap, ctx, ctx.treatAsClassAllZones)
        .filter(cn => allowed.has(cn));
      scope = 'self_trash';
    }
  } else {
    ctx.ownerState.field.signi.forEach(stack => {
      if (!stack || stack.length <= 1) return;
      stack.slice(0, -1).forEach(cn => {
        if (!a.filter || matchesFilter(ctx.cardMap.get(cn), a.filter)) cands.push(cn);
      });
    });
  }
  if (cands.length === 0) return done(ctx);
  return selectOrInteract(cands, a.count, a.upToCount ?? false, scope, a, undefined, ctx);
}

function execNegateAttack(a: import('../types/effects').NegateAttackAction, ctx: ExecCtx): ExecResult {
  const tgtOwner = a.target.owner === 'any' ? 'opponent' : a.target.owner as Owner;
  const state = ownerState(tgtOwner, ctx);
  // CENTER_LRIG_OR_SIGNI:「ルリグかシグニ」を候補に（G154 BURST）。それ以外はシグニ候補。
  let cands: string[];
  if (a.target.type === 'CENTER_LRIG_OR_SIGNI') {
    const lrigTop = state.field.lrig.at(-1);
    const signiCands = fieldCandidates(state, a.target.filter, ctx.cardMap, ctx.effectivePowers, ctx.allColorSigniNums, ctx.fieldSigniExtraColors);
    cands = lrigTop ? [lrigTop, ...signiCands] : signiCands;
  } else if (a.target.type === 'LRIG') {
    // 「対戦相手のセンタールリグがアタックしたとき、そのアタックを無効にする」（WXK10-012②）＝ルリグ単独対象。
    const lrigTop = state.field.lrig.at(-1);
    cands = lrigTop ? [lrigTop] : [];
  } else {
    cands = fieldCandidates(state, a.target.filter, ctx.cardMap, ctx.effectivePowers, ctx.allColorSigniNums, ctx.fieldSigniExtraColors);
  }
  // attackingOnly（「対戦相手の**アタックしている**シグニ1体」）＝候補はいま宣言中のアタッカーだけ。
  // 宣言中のアタッカーが居なければ空振り（この効果は ON_OPP_SIGNI_ATTACK 窓でしか撃てないので通常は必ず1体）。
  if (a.attackingOnly) {
    cands = cands.filter(n => n === attackingSigniOf(state));
  }
  if (cands.length === 0) return done(ctx);

  if (a.target.count === 'ALL') {
    const s = ownerState(tgtOwner, ctx);
    const negated = [...(s.negated_attacks ?? []), ...cands];
    const escape = a.escapeDiscard ? { ...(s.negated_attacks_escape ?? {}), ...Object.fromEntries(cands.map(n => [n, a.escapeDiscard!])) } : s.negated_attacks_escape;
    const newS = { ...s, negated_attacks: negated, ...(escape ? { negated_attacks_escape: escape } : {}) };
    return done(addLog(setOwnerState(tgtOwner, newS, ctx), `${cands.length}体のシグニのアタックを無効化`));
  }
  const cnt = resolveNum(a.target.count);
  const scope: TargetScope = tgtOwner === 'self' ? 'self_field' : 'opp_field';
  return selectOrInteract(cands, cnt, a.target.upToCount ?? false, scope, a, undefined, ctx, false, { selectionConstraint: a.target.selectionConstraint });
}

function execAwakenSigni(a: import('../types/effects').AwakenSigniAction, ctx: ExecCtx): ExecResult {
  const targets = a.targetsLastProcessed ? (ctx.lastProcessedCards ?? []) : (ctx.sourceCardNum ? [ctx.sourceCardNum] : []);
  const fieldTargets = targets.filter(n => ctx.ownerState.field.signi.some(s => s?.at(-1) === n));
  if (fieldTargets.length === 0) return done(ctx);
  const awakened = [...(ctx.ownerState.awakened_signi ?? [])];
  for (const n of fieldTargets) if (!awakened.includes(n)) awakened.push(n);
  const newOwner = { ...ctx.ownerState, awakened_signi: awakened };
  return done(addLog({ ...ctx, ownerState: newOwner }, `${fieldTargets.join('・')}が覚醒状態になった`));
}

function execDrawPerFieldCount(a: import('../types/effects').DrawPerFieldCountAction, ctx: ExecCtx): ExecResult {
  const countState = ownerState(a.countOwner, ctx);
  let fieldCount = 0;
  for (let zi = 0; zi < countState.field.signi.length; zi++) {
    const stack = countState.field.signi[zi];
    if (!stack || stack.length === 0) continue;
    const card = ctx.cardMap.get(stack[stack.length - 1]);
    // カード属性フィルタ（クラス/色/レベル等）に加えて、盤面ステート（凍結/ダウン等）も評価する
    if (!matchesFilter(card, a.countFilter)) continue;
    if (!matchesStateFilter(countState, zi, a.countFilter)) continue;
    fieldCount++;
  }
  if (fieldCount === 0) return done(ctx);
  const drawCount = a.drawPerUnit * fieldCount;
  return executeAction({ type: 'DRAW', owner: 'self', count: drawCount }, ctx);
}

function execDrawPerLrigLevel(a: import('../types/effects').DrawPerLrigLevelAction, ctx: ExecCtx): ExecResult {
  const lrigState = ownerState(a.lrigOwner, ctx);
  const lrigNum = lrigState.field.lrig.at(-1);
  const lv = parseInt(ctx.cardMap.get(lrigNum ?? '')?.Level ?? '0', 10);
  if (isNaN(lv) || lv <= 0) return done(ctx);
  const drawCount = a.drawPerLevel * lv;
  if (drawCount <= 0) return done(ctx);
  return executeAction({ type: 'DRAW', owner: a.owner, count: drawCount }, ctx);
}

function execEnergyChargePerLrigLevel(a: import('../types/effects').EnergyChargePerLrigLevelAction, ctx: ExecCtx): ExecResult {
  const lrigState = ownerState(a.lrigOwner, ctx);
  const lrigNum = lrigState.field.lrig.at(-1);
  const lv = parseInt(ctx.cardMap.get(lrigNum ?? '')?.Level ?? '0', 10);
  if (isNaN(lv) || lv <= 0) return done(ctx);
  const chargeCount = a.chargePerLevel * lv;
  if (chargeCount <= 0) return done(ctx);
  return executeAction({ type: 'ENERGY_CHARGE_FROM_DECK', owner: a.owner, count: chargeCount }, ctx);
}

function execEnergyChargeFromDeckPerFieldCount(a: import('../types/effects').EnergyChargeFromDeckPerFieldCountAction, ctx: ExecCtx): ExecResult {
  const countState = ownerState(a.countOwner, ctx);
  let fieldCount = 0;
  for (let zi = 0; zi < countState.field.signi.length; zi++) {
    const stack = countState.field.signi[zi];
    if (!stack || stack.length === 0) continue;
    const top = stack[stack.length - 1];
    // excludeSelf（「他の」）: 効果元シグニ自身はカウントから除外
    if (a.countFilter.excludeSelf && top === ctx.sourceCardNum) continue;
    const card = ctx.cardMap.get(top);
    if (!matchesFilter(card, a.countFilter)) continue;
    if (!matchesStateFilter(countState, zi, a.countFilter)) continue;
    fieldCount++;
  }
  if (fieldCount === 0) return done(ctx);
  const chargeCount = a.chargePerUnit * fieldCount;
  return executeAction({ type: 'ENERGY_CHARGE_FROM_DECK', owner: a.owner, count: chargeCount }, ctx);
}

function execPowerModifyPerLrigLevel(a: PowerModifyPerLrigLevelAction, ctx: ExecCtx): ExecResult {
  const lrigState = a.lrigOwner === 'self' ? ctx.ownerState : ctx.otherState;
  const lrigNum = lrigState.field.lrig.at(-1);
  const lv = a.useLastDownedLrigLevelSum
    ? (ctx.seqVars?.lastDownedLrigLevelSum ?? ctx.ownerState.last_lrig_down_level_sum ?? 0)
    : parseInt(ctx.cardMap.get(lrigNum ?? '')?.Level ?? '0', 10);
  if (isNaN(lv) || lv === 0) return done(ctx);

  const delta = a.deltaPerLevel * lv;
  const tgtOwner = a.target.owner === 'any' ? 'self' : a.target.owner as Owner;
  const state = ownerState(tgtOwner, ctx);
  const cands = fieldCandidates(state, a.target.filter, ctx.cardMap, ctx.effectivePowers, ctx.allColorSigniNums, ctx.fieldSigniExtraColors);
  if (cands.length === 0) return done(ctx);

  function applyMod(selected: string[], c: ExecCtx): ExecCtx {
    const s = ownerState(tgtOwner, c);
    const mods = [...(s.temp_power_mods ?? []), ...selected.map(cardNum => ({ cardNum, delta }))];
    return addLog(setOwnerState(tgtOwner, { ...s, temp_power_mods: mods }, c),
      `パワー${delta > 0 ? '+' : ''}${delta}（ルリグlv${lv}×${a.deltaPerLevel}）`);
  }

  if (a.target.count === 'ALL') return done(applyMod(cands, ctx));
  const count = resolveNum(a.target.count);
  const scope: TargetScope = tgtOwner === 'self' ? 'self_field' : 'opp_field';
  // 選択後は解決済み delta の POWER_MODIFY を適用（applyDirectAction が直接処理。
  // PER_LRIG_LEVEL case 欠落による default 再入＝同一SELECT_TARGET無限再発行を回避。続き93）。
  const pmAction: PowerModifyAction = { type: 'POWER_MODIFY', target: a.target, delta };
  return selectOrInteract(cands, count, a.target.upToCount ?? false, scope, pmAction, undefined, ctx);
}

// POWER_MODIFY_PER_LEVEL_SUM（ACTIVATED/INSTANT 一回限り）: 指定オーナー場のフィルタ一致シグニのレベル合計 × deltaPerLevel を、
// 選択した対象シグニへ temp_power_mods で付与する（CONTINUOUS 版は calcFieldPowers 側で処理）。WX04-103。
function execPowerModifyPerLevelSum(a: import('../types/effects').PowerModifyPerLevelSumAction, ctx: ExecCtx): ExecResult {
  const countState = a.countOwner === 'self' ? ctx.ownerState : ctx.otherState;
  let levelSum = 0;
  for (const s of countState.field.signi) {
    if (!s || s.length === 0) continue;
    const sNum = s[s.length - 1];
    if (a.excludeSelf && sNum === ctx.sourceCardNum) continue;
    const sCard = ctx.cardMap.get(sNum);
    if (!matchesFilter(sCard, a.countFilter)) continue;
    const lv = parseInt(sCard?.Level ?? '', 10);
    if (!isNaN(lv)) levelSum += lv;
  }
  if (levelSum === 0) return done(addLog(ctx, 'レベル合計0のためパワー修正なし'));
  const delta = a.deltaPerLevel * levelSum;
  const tgtOwner: Owner = a.target.owner === 'any' ? 'self' : a.target.owner as Owner;
  const state = ownerState(tgtOwner, ctx);
  const cands = fieldCandidates(state, a.target.filter, ctx.cardMap, ctx.effectivePowers, ctx.allColorSigniNums, ctx.fieldSigniExtraColors);
  if (cands.length === 0) return done(ctx);
  // 解決済み delta の POWER_MODIFY を thenAction にして適用（applyDirectAction が直接処理。再帰ループを避ける）
  const pmAction: PowerModifyAction = { type: 'POWER_MODIFY', target: a.target, delta };
  if (a.target.count === 'ALL') {
    let cur = ctx;
    for (const n of cands) {
      const r = applyDirectAction(pmAction, n, cur);
      cur = { ...cur, ownerState: r.ownerState, otherState: r.otherState, logs: r.logs };
    }
    return done(addLog(cur, `パワー${delta > 0 ? '+' : ''}${delta}（レベル合計${levelSum}×${a.deltaPerLevel}）`));
  }
  const count = resolveNum(a.target.count);
  const scope: TargetScope = tgtOwner === 'self' ? 'self_field' : 'opp_field';
  return selectOrInteract(cands, count, a.target.upToCount ?? false, scope, pmAction, undefined, ctx);
}

function execCharmProtection(a: CharmProtectionAction, ctx: ExecCtx): ExecResult {
  // チャーム保護は BattleScreen のバニッシュ処理側で判定するため、
  // ここではプレイヤー状態にキーワードとして記録する
  const keyword = `CHARM_PROTECTION:${JSON.stringify(a.signiFilter)}`;
  const grants = { ...(ctx.ownerState.keyword_grants ?? {}) };
  // フィールドの対象シグニ全体に付与
  const cands = fieldCandidates(ctx.ownerState, a.signiFilter, ctx.cardMap, ctx.effectivePowers);
  for (const n of cands) grants[n] = [...(grants[n] ?? []), keyword];
  const newOwner: PlayerState = { ...ctx.ownerState, keyword_grants: grants };
  return done(addLog({ ...ctx, ownerState: newOwner },
    cands.length > 0 ? `${cands.map(n => ctx.cardMap.get(n)?.CardName ?? n).join('・')}にチャーム保護を付与` : 'チャーム保護対象なし'));
}

function execMutualDiscardAndDraw(a: MutualDiscardAndDrawAction, ctx: ExecCtx): ExecResult {
  // 両者の手札枚数を記録してから全捨て
  const selfCount  = ctx.ownerState.hand.length;
  const otherCount = ctx.otherState.hand.length;
  const maxCount   = Math.max(selfCount, otherCount);

  let cur: ExecCtx = {
    ...ctx,
    ownerState: { ...ctx.ownerState, hand: [], trash: [...ctx.ownerState.trash, ...ctx.ownerState.hand] },
    otherState: { ...ctx.otherState, hand: [], trash: [...ctx.otherState.trash, ...ctx.otherState.hand] },
  };
  cur = addLog(cur, `両者手札全捨て（${selfCount}枚/${otherCount}枚）`);

  if (!a.drawMax || maxCount === 0) return done(cur);

  // 双方が maxCount 枚引く
  const drawSelf  = Math.min(maxCount, cur.ownerState.deck.length);
  const drawOther = Math.min(maxCount, cur.otherState.deck.length);
  cur = {
    ...cur,
    ownerState: {
      ...cur.ownerState,
      hand: [...cur.ownerState.deck.slice(0, drawSelf)],
      deck: cur.ownerState.deck.slice(drawSelf),
    },
    otherState: {
      ...cur.otherState,
      hand: [...cur.otherState.deck.slice(0, drawOther)],
      deck: cur.otherState.deck.slice(drawOther),
    },
  };
  return done(addLog(cur, `各${maxCount}枚ドロー`));
}

// VARIABLE_DISCARD_AND_DRAW: 手札を好きな枚数捨て、捨てた枚数 + drawBonus 枚引く（WX09-Re15）
function execVariableDiscardAndDraw(a: VariableDiscardAndDrawAction, ctx: ExecCtx): ExecResult {
  const state = ownerState(a.owner, ctx);
  // 手札が無ければ捨てる選択は不要、bonus 枚だけ引く
  if (state.hand.length === 0) {
    return executeAction({ type: 'DRAW', owner: a.owner, count: a.drawBonus }, ctx);
  }
  // 手札から好きな枚数（0〜全部）を選んで捨て、その後 lastProcessedCards.length + drawBonus 枚引く
  return needsInteraction(addLog(ctx, '捨てる手札を選ぶ（0枚可）'), {
    type: 'SELECT_TARGET',
    candidates: [...state.hand],
    count: state.hand.length,
    optional: true,
    targetScope: a.owner === 'self' ? 'self_hand' : 'opp_hand',
    thenAction: { type: 'TRASH', target: { type: 'HAND_CARD', owner: a.owner } } as import('../types/effects').EffectAction,
    continuation: { type: 'DRAW', owner: a.owner, count: a.drawBonus, addLastProcessedCount: true } as import('../types/effects').EffectAction,
  });
}

/**
 * 「能力を失う」の書き込み。§6.4 O-3 で **`action.until` を読むようにした**。
 *
 * ⚠従来この関数は `until` を**一切見ておらず**、`PERMANENT` / `UNTIL_OPP_TURN_END` / `NEXT_TURN` が
 *   すべて `abilities_removed`（＝このターン終了時まで）へ丸められていた＝型に値はあるのに engine に
 *   消費地点が無い死フィールド。`UNTIL_OPP_TURN_END` の5効果は**次の相手ターンに効かない過少実行**、
 *   「次のあなたのターンの間」の効果は**そもそも表せない**状態だった。
 * ⚠`PERMANENT` は **CONTINUOUS 宣言（「【常】：〜は能力を失う」）でしか使われない**＝そちらは
 *   `collectContinuousAbilitiesRemovedSigni` が毎回再評価するのでこの関数を通らない。ここに来る
 *   `PERMANENT` は「このターン」の書き間違いなので、従来どおり現ターン扱いに寄せる（挙動不変）。
 */
function applyAbilitiesRemoval(
  action: RemoveAbilitiesAction,
  state: PlayerState,
  cardNums: string[],
): PlayerState {
  if (action.keywords?.length) {
    // キーワード限定の喪失は現状「このターン」語彙しか live に無い＝期間分岐は持たせない。
    const removedKeywords = { ...(state.keyword_abilities_removed ?? {}) };
    for (const cardNum of cardNums) {
      removedKeywords[cardNum] = [...new Set([...(removedKeywords[cardNum] ?? []), ...action.keywords])];
    }
    return { ...state, keyword_abilities_removed: removedKeywords };
  }
  // NEXT_TURN＝「次のターンの間」だけ＝現ターンには効かせない（予約のみ）。
  const reservesNextTurn = action.until === 'NEXT_TURN' || action.until === 'UNTIL_OPP_TURN_END';
  const appliesThisTurn = action.until !== 'NEXT_TURN';
  return {
    ...state,
    ...(appliesThisTurn
      ? { abilities_removed: [...new Set([...(state.abilities_removed ?? []), ...cardNums])] }
      : {}),
    ...(reservesNextTurn
      ? { abilities_removed_next_turn: [...new Set([...(state.abilities_removed_next_turn ?? []), ...cardNums])] }
      : {}),
  };
}

function execReturnAssistLrigToDeck(a: ReturnAssistLrigToDeckAction, ctx: ExecCtx): ExecResult {
  const candidates = collectReturnableAssistLrigTops(ctx.ownerState, a, ctx.cardMap);
  return selectOrInteract(candidates, 1, false, 'self_assist_lrig', a, undefined, ctx);
}

function execRemoveAbilities(a: RemoveAbilitiesAction, ctx: ExecCtx): ExecResult {
  const tgtOwner = a.target.owner === 'any' ? 'opponent' : a.target.owner as Owner;
  // §6.4 O-16(b):「対戦相手の場にある**キーと**シグニは能力を失い、新たに得られない」＝キーは
  // `field.signi` に居ないので per-card の `abilities_removed` では表せない。専用フラグへ倒し、
  // 読みは `activeKeyAbilitySources` funnel（CONT／AUTO／【起】の全収集経路が通る）に任せる。
  // ⚠シグニ側の候補が0でもキーは失わせる＝下の `cands.length === 0` の早期 return より前に置く。
  if (a.alsoKeys) {
    const keyState = ownerState(tgtOwner, ctx);
    ctx = addLog(setOwnerState(tgtOwner, { ...keyState, keys_abilities_disabled: true }, ctx),
      `${tgtOwner === 'self' ? 'あなた' : '対戦相手'}のすべてのキーは能力を失う`);
  }
  // 段2 第45バッチ:「対戦相手の**センタールリグと**すべてのシグニは能力を失う」＝ルリグ側は
  // `abilities_removed`（cardNum リスト）に載せても**どこも読まない**ので専用フラグへ倒す（`alsoKeys` と同形）。
  // ⚠シグニ候補が0でもルリグは失わせる＝下の `cands.length === 0` の早期 return より前に置く。
  if (a.alsoCenterLrig) {
    const lrigState = ownerState(tgtOwner, ctx);
    const reservesNext = a.until === 'NEXT_TURN' || a.until === 'UNTIL_OPP_TURN_END';
    const appliesNow = a.until !== 'NEXT_TURN';
    ctx = addLog(setOwnerState(tgtOwner, {
      ...lrigState,
      ...(appliesNow ? { lrig_abilities_disabled: true } : {}),
      ...(reservesNext ? { lrig_abilities_disabled_next_turn: true } : {}),
    }, ctx), `${tgtOwner === 'self' ? 'あなた' : '対戦相手'}のセンタールリグは能力を失う`);
  }
  const state = ownerState(tgtOwner, ctx);
  // §6.4 O-16:「（指定した）シグニゾーンにあるシグニは能力を失い、新たに得られない」＝**ゾーン継続**。
  // per-card の abilities_removed は適用時点の instanceId を記録するので**後からそのゾーンへ出たシグニに
  // 効かない**。POWER_MODIFY と同じ形で場レベル grant に載せる。
  // ⚠`until` が次ターンまで及ぶ形（NEXT_TURN / UNTIL_OPP_TURN_END）は予約も併せて積む＝
  //   現ターンだけ active、次ターンぶんは reserveFieldGrant（続き450 の2スロット式）。
  if (a.target.zoneSource === 'designated' && a.target.count === 'ALL' && !a.keywords?.length) {
    const grant: FieldGrant = { kind: 'abilityLoss', filter: a.target.filter };
    let cur = ctx;
    let touched = false;
    if (a.until === 'NEXT_TURN' || a.until === 'UNTIL_OPP_TURN_END') {
      const reservation = reserveFieldGrant(a.target, grant, undefined, cur);
      cur = reservation.ctx;
      touched ||= reservation.reserved;
    }
    if (a.until !== 'NEXT_TURN') {
      const active = applyActiveFieldGrant(a.target, grant, cur);
      cur = active.ctx;
      touched ||= active.applied;
    }
    return done(addLog(cur, touched ? '指定シグニゾーンのシグニは能力を失う' : '指定されたシグニゾーンがない'));
  }
  // targetsTriggerSource: 「そのシグニ」= トリガー元シグニ（場に出た相手シグニ。WXK10-022 ON_PLAY any_opp）へ無選択で適用
  if (a.targetsTriggerSource) {
    const autoNum = ctx.triggeringCardNum ?? ctx.sourceCardNum;
    if (autoNum && state.field.signi.some(s => s?.at(-1) === autoNum)) {
      const newS = applyAbilitiesRemoval(a, state, [autoNum]);
      return done(addLog(setOwnerState(tgtOwner, newS, ctx), `1`));
    }
    return done(ctx);
  }
  // ⚠ 動的フィルタ（「この方法でダウンしたルリグと同じレベル」等）を先に解決する。ここだけ
  //   `resolveDynamicFilter` を通していなかったため、動的キーは matchesFilter が黙って無視し**制限なし**に
  //   倒れていた（WX25-P1-112＝相手シグニ全体から能力を奪う過剰効果。タスク12(cix)）。
  //   参照元は**発動側**の状態（ctx.ownerState）＝コスト支払いの記録はそこにある。
  // frontOfSelf: 効果元シグニの正面（相手ゾーン 2-zi）のシグニに限定（WX17-035「このシグニの正面のシグニ」）
  let resolvedFilter = resolveDynamicFilter(
    a.target.filter, ctx.ownerState, ctx.cardMap, ctx.otherState,
    ctx.lastProcessedCards, ctx.effectivePowers, ctx.sourceCardNum, ctx.triggeringCardNum);
  let frontRestrict: string[] | null = null;
  if (resolvedFilter?.frontOfSelf) {
    const { frontOfSelf: _f, ...rest } = resolvedFilter;
    resolvedFilter = rest;
    const frontNum = tgtOwner === 'opponent' ? resolveFrontOfSelfCardNum(ctx) : null;
    frontRestrict = frontNum ? [frontNum] : [];
  }
  // thisCardOnly: 効果元シグニ自身のみ（「このシグニは能力を失う」）
  let thisCardRestrict: string[] | null = null;
  if (resolvedFilter?.thisCardOnly) {
    const { thisCardOnly: _t, ...rest } = resolvedFilter;
    resolvedFilter = rest;
    thisCardRestrict = (ctx.sourceCardNum && state.field.signi.some(s => s?.at(-1) === ctx.sourceCardNum))
      ? [ctx.sourceCardNum] : [];
  }
  const signiCands = fieldCandidates(state, resolvedFilter, ctx.cardMap, ctx.effectivePowers, ctx.allColorSigniNums, ctx.fieldSigniExtraColors);
  const lrigTop = state.field.lrig.at(-1);
  // §6.4 O-17:「対戦相手の**キー**１枚を対象とし、ターン終了時まで、それは能力を失う」（`WXK05-010-E2`）。
  // ⚠候補は `keySlotCardNums`（喪失を考慮しない母集団）＝既に能力を失っているキーを候補から隠すと
  //   「対象がない」と「もう効いている」を UI が区別できない。適用側は cardNum なので既存の
  //   `abilities_removed` にそのまま載り、読みは `activeKeyAbilitySources` funnel が受ける。
  let cands = a.target.type === 'CENTER_LRIG_OR_SIGNI'
    ? [...(lrigTop ? [lrigTop] : []), ...signiCands]
    : a.target.type === 'LRIG'
      ? (lrigTop ? [lrigTop] : [])
      : a.target.type === 'KEY'
        ? keySlotCardNums(state)
        : signiCands;
  // §6.4 O-17:「対戦相手の**すべての領域にある**シグニは能力を失う」（`WX24-P4-013-E3`）／
  // 「対戦相手の**手札と場とエナゾーンとトラッシュにある**シグニは能力を失う」（`SPDi47-01-E2`）。
  // `abilities_removed` は cardNum のリストでゾーンに依存しないので、候補プールを広げるだけで載る。
  // ⚠デッキ／ライフは足さない＝消費地点が無く「実装したように見えるだけ」になる。
  if (a.target.allZones) {
    const zoneCards = [...state.hand, ...state.energy, ...state.trash]
      .filter(n => matchesFilter(ctx.cardMap.get(getCardNum(n)), resolvedFilter));
    cands = [...new Set([...cands, ...zoneCards])];
  }
  if (frontRestrict !== null) cands = cands.filter(n => frontRestrict!.includes(n));
  if (thisCardRestrict !== null) cands = cands.filter(n => thisCardRestrict!.includes(n));
  if (a.targetsLastProcessed) {
    const previous = new Set(ctx.lastProcessedCards ?? []);
    const selected = cands.filter(n => previous.has(n));
    if (selected.length === 0) return done(ctx);
    const newS = applyAbilitiesRemoval(a, state, selected);
    return done(addLog({ ...setOwnerState(tgtOwner, newS, ctx), lastProcessedCards: selected }, `${selected.length}`));
  }
  if (cands.length === 0) return done(ctx);
  // count:'ALL'（または thisCardOnly/frontOfSelf で対象が確定済み）は全候補に適用。
  // count が数値（「対戦相手のシグニ1体を対象とし」等。G085）は選択して該当数だけに適用する。
  if (a.target.count !== 'ALL' && thisCardRestrict === null && frontRestrict === null) {
    const count = resolveNum(a.target.count);
    const scope: TargetScope = a.target.type === 'KEY'
      ? (tgtOwner === 'self' ? 'self_key' : 'opp_key')
      : tgtOwner === 'self' ? 'self_field' : 'opp_field';
    return selectOrInteract(cands, count, a.target.upToCount ?? false, scope, a, undefined, ctx);
  }
  const newS = applyAbilitiesRemoval(a, state, cands);
  // 非対話経路（ALL / thisCardOnly / frontOfSelf で対象確定）も lastProcessedCards を残す（§3タスク6 E）。
  return done(addLog({ ...setOwnerState(tgtOwner, newS, ctx), lastProcessedCards: cands }, `${cands.length}`));
}

function execGainCoin(a: GainCoinAction, ctx: ExecCtx): ExecResult {
  const s = ownerState(a.owner, ctx);
  if (s.game_no_coin_gain) return done(addLog(ctx, 'コイン獲得禁止（このゲーム）'));
  const gained = Math.min(a.count, 5 - s.coins);
  const newS: PlayerState = { ...s, coins: Math.min(5, s.coins + a.count) };
  return done(addLog(setOwnerState(a.owner, newS, ctx), `コイン${gained}枚獲得（計${newS.coins}枚）`));
}

function execEnergyChargeByFieldCount(a: import('../types/effects').EnergyChargeByFieldCountAction, ctx: ExecCtx): ExecResult {
  const state = ownerState(a.owner, ctx);
  const fieldCount = state.field.signi.filter(s => s && s.length > 0).length;
  const chargeCount = fieldCount + (a.bonus ?? 0);
  if (chargeCount <= 0) return done(ctx);
  const took = state.deck.slice(0, chargeCount);
  // デッキ→エナの累計（SELF_DECK_TO_ENERGY_THIS_TURN）は execEnergyChargeFromDeck と同じくここでも加算する。
  // ⚠ この経路を落とすと WXDi-P03-044-E2 のターン累計3枚ゲートが過小になる。
  const newS: PlayerState = {
    ...state, deck: state.deck.slice(chargeCount), energy: [...state.energy, ...took],
    self_deck_to_energy_this_turn: (state.self_deck_to_energy_this_turn ?? 0) + took.length,
  };
  return done(addLog(setOwnerState(a.owner, newS, ctx), `エナチャージ${chargeCount}（フィールド${fieldCount}体+${a.bonus}）`));
}

function execPowerModifyByTargetLevel(a: PowerModifyByTargetLevelAction, ctx: ExecCtx): ExecResult {
  const tgtOwner = a.target.owner === 'any' ? 'self' : a.target.owner as Owner;
  const state = ownerState(tgtOwner, ctx);
  const cands = fieldCandidates(state, a.target.filter, ctx.cardMap, ctx.effectivePowers, ctx.allColorSigniNums, ctx.fieldSigniExtraColors);
  if (cands.length === 0) return done(ctx);
  const scope: TargetScope = tgtOwner === 'self' ? 'self_field' : 'opp_field';
  if (a.target.count === 'ALL') {
    const mods = [...(state.temp_power_mods ?? []), ...cands.map(cardNum => {
      const lv = parseInt(ctx.cardMap.get(cardNum)?.Level ?? '0', 10);
      return { cardNum, delta: a.deltaPerLevel * (isNaN(lv) ? 0 : lv) };
    })];
    return done(addLog(setOwnerState(tgtOwner, { ...state, temp_power_mods: mods }, ctx), `対象レベル比例パワー修正`));
  }
  const count = resolveNum(a.target.count);
  return selectOrInteract(cands, count, a.target.upToCount ?? false, scope, a, undefined, ctx);
}

function execPowerModifyBySource(a: import('../types/effects').PowerModifyBySourceAction, ctx: ExecCtx): ExecResult {
  // 効果元シグニ（このシグニ）のレベル/実効パワーを基準に delta を算出して POWER_MODIFY へ委譲する。
  const src = ctx.sourceCardNum;
  if (!src) return done(ctx);
  let base: number;
  if (a.basis === 'level') {
    base = parseInt(ctx.cardMap.get(getCardNum(src))?.Level ?? '0', 10);
  } else {
    base = ctx.effectivePowers?.get(src)
      ?? parseInt(ctx.cardMap.get(getCardNum(src))?.Power ?? '0', 10);
  }
  if (isNaN(base)) base = 0;
  const delta = base * a.multiplier;
  if (delta === 0) return done(ctx);
  const mod: PowerModifyAction = { type: 'POWER_MODIFY', target: a.target, delta, ...(a.until ? { duration: a.until } : {}) };
  return execPowerModify(mod, ctx);
}

function execPowerModifyPerTrashedLevel(a: import('../types/effects').PowerModifyPerTrashedLevelAction, ctx: ExecCtx): ExecResult {
  const processed = ctx.lastProcessedCards ?? [];
  const totalLevel = processed.reduce((acc, cn) => {
    const lv = parseInt(ctx.cardMap.get(cn)?.Level ?? '0', 10);
    return acc + (isNaN(lv) ? 0 : lv);
  }, 0);
  if (totalLevel === 0) return done(ctx);
  const delta = a.deltaPerLevel * totalLevel;
  const modAction: PowerModifyAction = { type: 'POWER_MODIFY', target: a.target, delta };
  return executeAction(modAction, ctx);
}

function execPowerModifyPerCharm(a: import('../types/effects').PowerModifyPerCharmAction, ctx: ExecCtx): ExecResult {
  if (a.sourceLocation === 'trashed_this_effect') {
    // last_charm_trash_count設定済み = charmTrashVariableコストとして既にトラッシュ済み（WX07-045等）
    if (ctx.ownerState.last_charm_trash_count !== undefined) {
      const charmCount = ctx.ownerState.last_charm_trash_count;
      if (charmCount === 0) return done(ctx);
      const delta = a.deltaPerCharm * charmCount;
      const modAction: PowerModifyAction = { type: 'POWER_MODIFY', target: a.target, delta };
      return executeAction(modAction, ctx);
    }
    // コスト：自分の場のチャームを全てトラッシュに置く（固定）
    // sourceOwner は本来 'self' だが parser バグで 'opponent' になる場合があるため、常に自分のチャームを使用
    const ownCharms = (ctx.ownerState.field.signi_charms ?? []).filter(c => c !== null) as string[];
    if (ownCharms.length === 0) return done(ctx);
    const newCharmSlots = (ctx.ownerState.field.signi_charms ?? [null, null, null]).map(() => null);
    const newOwner: PlayerState = {
      ...ctx.ownerState,
      trash: [...ctx.ownerState.trash, ...ownCharms],
      field: { ...ctx.ownerState.field, signi_charms: newCharmSlots },
    };
    const charmCount = ownCharms.length;
    const delta = a.deltaPerCharm * charmCount;
    const newCtx = addLog({ ...ctx, ownerState: newOwner }, `チャーム${charmCount}枚をトラッシュ`);
    const modAction: PowerModifyAction = { type: 'POWER_MODIFY', target: a.target, delta };
    return executeAction(modAction, newCtx);
  }
  const countCharms = (state: PlayerState) => (state.field.signi_charms ?? []).filter(c => c !== null).length;
  const charmCount = a.sourceOwner === 'self' ? countCharms(ctx.ownerState)
    : a.sourceOwner === 'opponent' ? countCharms(ctx.otherState)
    : countCharms(ctx.ownerState) + countCharms(ctx.otherState);
  if (charmCount === 0) return done(ctx);
  const delta = a.deltaPerCharm * charmCount;
  const modAction: PowerModifyAction = { type: 'POWER_MODIFY', target: a.target, delta };
  return executeAction(modAction, ctx);
}

function execGainBond(a: import('../types/effects').GainBondAction, ctx: ExecCtx): ExecResult {
  if (a.source === 'last_found') {
    const lastCard = ctx.lastProcessedCards?.[ctx.lastProcessedCards.length - 1];
    const cardName = lastCard ? ctx.cardMap.get(lastCard)?.CardName : undefined;
    if (!cardName) return done(addLog(ctx, '絆獲得: 対象カードが見つかりません'));
    const current = ctx.ownerState.bonds ?? [];
    if (current.includes(cardName)) return done(addLog(ctx, `${cardName}との絆は既に獲得済み`));
    const newOwner: PlayerState = { ...ctx.ownerState, bonds: [...current, cardName] };
    return done(addLog({ ...ctx, ownerState: newOwner }, `${cardName}との絆を獲得`));
  }
  // 'declared': デッキからカードを選択させる
  const deckCards = [...ctx.ownerState.deck];
  if (deckCards.length === 0) return done(addLog(ctx, '絆獲得: デッキが空'));
  return needsInteraction(ctx, {
    type: 'DECLARE_BOND',
    deckCards,
    continuation: a.source === 'declared' ? undefined : undefined,
  });
}

function execMill(a: MILLAction, ctx: ExecCtx): ExecResult {
  if (a.alsoOpponent) {
    const first = execMill({ ...a, alsoOpponent: false }, ctx);
    if (!first.done) return first;
    return execMill(
      { ...a, owner: 'opponent', alsoOpponent: false, appendLastProcessed: true },
      {
        ...ctx,
        ownerState: first.ownerState,
        otherState: first.otherState,
        logs: first.logs,
        lastProcessedCards: first.lastProcessedCards,
      },
    );
  }
  if (a.optional) {
    return needsInteraction({ ...ctx, lastProcessedCards: [] }, {
      type: 'CHOOSE',
      count: 1,
      options: [
        { id: 'mill', label: 'トラッシュに置く', action: { ...a, optional: false }, available: true },
        { id: 'skip', label: '置かない', action: { type: 'SEQUENCE', steps: [] }, available: true },
      ],
    });
  }
  // countIsLastProcessedLevelSum: 「この方法で場に出たシグニのレベル１につき…1枚トラッシュ」＝直前ステップ
  // （LOOK_PICK_CHAIN の field 配置等）が lastProcessedCards に残したシグニのレベル合計を枚数にする（WX24-P3-039）。
  const count = a.countFromZone
    ? resolveCountRef(a.count, ctx, a.countFromZone)
    : a.countIsLastProcessedLevelSum
    ? (ctx.lastProcessedCards ?? []).reduce((sum, cn) => sum + (parseInt(ctx.cardMap.get(cn)?.Level ?? '0', 10) || 0), 0)
    : a.countPerSourceLevel !== undefined
    ? (parseInt(ctx.cardMap.get(ctx.sourceCardNum ?? '')?.Level ?? '0', 10) || 0) * a.countPerSourceLevel
    : a.countPerLastProcessed !== undefined
    ? (ctx.lastProcessedCards ?? []).length * a.countPerLastProcessed
    : a.countPerStoredTargets !== undefined
    ? (ctx.storedTargetCards ?? []).length * a.countPerStoredTargets
    : a.useDeclaredCount
    // 宣言値は `declared_number` が正（`declared_guard_restrict_level` は**ガード制限専用**へ分離した＝§6.4 O-41）。
    ? (ctx.ownerState.declared_number ?? ctx.ownerState.declared_guard_restrict_level ?? 0)
    : a.countPlusLastDownedLrigLevelSum
    // 「この方法でダウンしたルリグのレベルの合計に１を加えた枚数」＝記録が無ければ 0体ダウン＝count のみ。
    ? a.count + (ctx.seqVars?.lastDownedLrigLevelSum ?? ctx.ownerState.last_lrig_down_level_sum ?? 0)
    : a.count;
  const state = ownerState(a.owner, ctx);
  // `all`＝デッキ全体（`PR-469`②「対戦相手のデッキからすべてのカードをトラッシュに置く」）
  let actual = a.all ? state.deck.length : Math.min(count, state.deck.length);
  if (a.untilFilter) {
    const need = a.untilCount ?? 1;
    let matched = 0;
    actual = 0;
    for (const cn of (a.fromBottom ? [...state.deck].reverse() : state.deck)) {
      actual++;
      if (matchesFilter(ctx.cardMap.get(getCardNum(cn)), a.untilFilter)) matched++;
      if (matched >= need) break;
    }
  }
  if (actual === 0) return done(addLog({
    ...ctx,
    lastProcessedCards: a.appendLastProcessed ? (ctx.lastProcessedCards ?? []) : [],
  }, 'デッキが空のためミルをスキップ'));
  const milled = a.fromBottom ? state.deck.slice(state.deck.length - actual) : state.deck.slice(0, actual);
  const newState: PlayerState = {
    ...state,
    deck: a.fromBottom ? state.deck.slice(0, state.deck.length - actual) : state.deck.slice(actual),
    trash: [...state.trash, ...milled],
    // このミルの原因カード（milledSourceStory 判定用・last_effect_draw_source と同型）。
    // trash は string[] でエントリに発生源を持てないため、直近のミル発生源を state 側に記録する。
    last_effect_mill_source: ctx.sourceCardNum,
  };
  const updatedCtx = setOwnerState(a.owner, newState, ctx);
  return done(addLog(
    { ...updatedCtx, lastProcessedCards: a.appendLastProcessed ? [...(ctx.lastProcessedCards ?? []), ...milled] : milled },
    `デッキ上から${actual}枚をトラッシュに置いた`
  ));
}

function execRemoveCharm(a: RemoveCharmAction, ctx: ExecCtx): ExecResult {
  const s = ownerState(a.targetOwner, ctx);
  const charms = [...(s.field.signi_charms ?? [null, null, null])];
  const count = a.count === 'ALL'
    ? charms.filter(c => c !== null).length
    : a.count;
  let removed = 0;
  let newTrash = [...s.trash];
  const removedCards: string[] = [];
  const newCharms = charms.map(c => {
    if (c !== null && removed < count) {
      // フィルターがあればチェック
      if (!a.targetFilter || matchesFilter(ctx.cardMap.get(c), a.targetFilter)) {
        newTrash = [...newTrash, c];
        removedCards.push(c);
        removed++;
        return null;
      }
    }
    return c;
  });
  const newS: PlayerState = { ...s, field: { ...s.field, signi_charms: newCharms }, trash: newTrash };
  const ctx2 = setOwnerState(a.targetOwner, newS, ctx);
  return done({ ...addLog(ctx2, `チャーム${removed}枚をトラッシュに置いた`), lastProcessedCards: removedCards });
}

function execForceSigniAttack(a: ForceSigniAttackAction, ctx: ExecCtx): ExecResult {
  const s = ownerState(a.targetOwner, ctx);
  const newS: PlayerState = a.duration === 'NEXT_TURN'
    ? {
        ...s,
        must_attack_signi_next_turn: true,
        must_attack_infected_only_next_turn: a.infectedOnly ?? false,
      }
    : { ...s, must_attack_signi: true, must_attack_infected_only: a.infectedOnly ?? false };
  const ctx2 = setOwnerState(a.targetOwner, newS, ctx);
  const who = a.targetOwner === 'opponent' ? '対戦相手' : '自分';
  const scopeLabel = a.infectedOnly ? '感染状態の' : '';
  return done(addLog(ctx2, `${a.duration === 'NEXT_TURN' ? '次のターンの間、' : ''}${who}の${scopeLabel}シグニは可能ならばアタックしなければならない`));
}

function execPowerModifyPerTrashCount(a: PowerModifyPerTrashCountAction, ctx: ExecCtx): ExecResult {
  const countTrash = (st: PlayerState) => {
    const cards = st.trash;
    if (a.countByVariety) {
      const names = new Set(cards
        .filter(n => !a.countFilter || matchesFilter(ctx.cardMap.get(n), a.countFilter))
        .map(n => ctx.cardMap.get(n)?.CardClass ?? n));
      return names.size;
    }
    return cards.filter(n => !a.countFilter || matchesFilter(ctx.cardMap.get(n), a.countFilter)).length;
  };
  let count = 0;
  if (a.trashOwner === 'both') {
    count = countTrash(ctx.ownerState) + countTrash(ctx.otherState);
  } else {
    count = countTrash(a.trashOwner === 'self' ? ctx.ownerState : ctx.otherState);
  }
  const delta = Math.floor(count / a.unitSize) * a.deltaPerUnit;
  if (delta === 0) return done(ctx);

  const tgtO = a.target.owner === 'opponent' ? 'opponent' : 'self' as 'self' | 'opponent';
  const state = ownerState(tgtO, ctx);
  const cands = fieldCandidates(state, a.target.filter, ctx.cardMap, ctx.effectivePowers, ctx.allColorSigniNums, ctx.fieldSigniExtraColors);
  if (cands.length === 0) return done(ctx);

  function applyMod(selected: string[], c: ExecCtx): ExecCtx {
    const s = ownerState(tgtO, c);
    const mods = [...(s.temp_power_mods ?? []), ...selected.map(cardNum => ({ cardNum, delta }))];
    return addLog(setOwnerState(tgtO, { ...s, temp_power_mods: mods }, c),
      `パワー${delta > 0 ? '+' : ''}${delta}（トラッシュ${count}枚×${a.deltaPerUnit}/${a.unitSize}）`);
  }

  if (a.target.count === 'ALL') return done(applyMod(cands, ctx));
  const cnt = resolveNum(a.target.count);
  const scope: TargetScope = tgtO === 'self' ? 'self_field' : 'opp_field';
  // delta は算出済みなので thenAction は POWER_MODIFY に変換して渡す
  // （applyDirectAction に PER_* 系の case が無く、自身を渡すと default→再実行→再選択の無限ループ＝選択後 no-op になる）
  const pmTC: PowerModifyAction = { type: 'POWER_MODIFY', target: a.target, delta };
  return selectOrInteract(cands, cnt, a.target.upToCount ?? false, scope, pmTC, undefined, ctx);
}

function execPowerModifyPerLifeCount(a: PowerModifyPerLifeCountAction, ctx: ExecCtx): ExecResult {
  const lifeState = a.lifeOwner === 'self' ? ctx.ownerState : ctx.otherState;
  const count = lifeState.life_cloth.length;
  const delta = a.deltaPerLife * count;
  if (delta === 0) return done(ctx);

  const tgtO = a.target.owner === 'opponent' ? 'opponent' : 'self' as 'self' | 'opponent';
  const state = ownerState(tgtO, ctx);
  const cands = fieldCandidates(state, a.target.filter, ctx.cardMap, ctx.effectivePowers, ctx.allColorSigniNums, ctx.fieldSigniExtraColors);

  function applyMod(selected: string[], c: ExecCtx): ExecCtx {
    const s = ownerState(tgtO, c);
    const mods = [...(s.temp_power_mods ?? []), ...selected.map(cardNum => ({ cardNum, delta }))];
    return addLog(setOwnerState(tgtO, { ...s, temp_power_mods: mods }, c),
      `パワー${delta > 0 ? '+' : ''}${delta}（ライフ${count}枚×${a.deltaPerLife}）`);
  }

  if (a.target.count === 'ALL') return done(applyMod(cands, ctx));
  const cnt = resolveNum(a.target.count);
  const scope: TargetScope = tgtO === 'self' ? 'self_field' : 'opp_field';
  // delta 算出済み＝POWER_MODIFY に変換（PER_TRASH_COUNT と同じ理由）
  const pmLC: PowerModifyAction = { type: 'POWER_MODIFY', target: a.target, delta };
  return selectOrInteract(cands, cnt, a.target.upToCount ?? false, scope, pmLC, undefined, ctx);
}

function execPowerModifyPerHandCount(a: import('../types/effects').PowerModifyPerHandCountAction, ctx: ExecCtx): ExecResult {
  const handState = a.handOwner === 'self' ? ctx.ownerState : ctx.otherState;
  const count = handState.hand.length;
  const delta = a.deltaPerCard * count;
  if (delta === 0) return done(ctx);

  const tgtO = a.target.owner === 'opponent' ? 'opponent' : 'self' as 'self' | 'opponent';
  const state = ownerState(tgtO, ctx);
  let cands = fieldCandidates(state, a.target.filter, ctx.cardMap, ctx.effectivePowers, ctx.allColorSigniNums, ctx.fieldSigniExtraColors);
  if (a.excludeSelf && ctx.sourceCardNum) cands = cands.filter(cn => cn !== ctx.sourceCardNum);
  // UNTIL_OPP_TURN_END は長期ストアへ（次の相手ターン終了時までクリアされない）
  const powerModKey = a.until === 'UNTIL_OPP_TURN_END' ? 'power_mods_until_opp_turn' : 'temp_power_mods';

  function applyMod(selected: string[], c: ExecCtx): ExecCtx {
    const s = ownerState(tgtO, c);
    const mods = [...(s[powerModKey] ?? []), ...selected.map(cardNum => ({ cardNum, delta }))];
    return addLog(setOwnerState(tgtO, { ...s, [powerModKey]: mods }, c),
      `パワー${delta > 0 ? '+' : ''}${delta}（手札${count}枚×${a.deltaPerCard}）`);
  }

  if (a.target.count === 'ALL') return done(applyMod(cands, ctx));
  const cnt = resolveNum(a.target.count);
  const scope: TargetScope = tgtO === 'self' ? 'self_field' : 'opp_field';
  // delta 算出済み＝POWER_MODIFY に変換（PER_TRASH_COUNT と同じ理由。UNTIL_OPP_TURN_END は duration で伝播）
  const pmHC: PowerModifyAction = { type: 'POWER_MODIFY', target: a.target, delta,
    ...(a.excludeSelf ? { excludeSelf: true } : {}),
    ...(a.until === 'UNTIL_OPP_TURN_END' ? { duration: 'UNTIL_OPP_TURN_END' as const } : {}) };
  return selectOrInteract(cands, cnt, a.target.upToCount ?? false, scope, pmHC, undefined, ctx);
}

function execDiscardBoth(a: DiscardBothAction, ctx: ExecCtx): ExecResult {
  const selfDiscard = Math.min(a.count, ctx.ownerState.hand.length);
  const otherDiscard = Math.min(a.count, ctx.otherState.hand.length);
  const selfDiscarded = ctx.ownerState.hand.slice(0, selfDiscard);
  const otherDiscarded = ctx.otherState.hand.slice(0, otherDiscard);
  const newCtx: ExecCtx = {
    ...ctx,
    // hand_discarded_just: ON_HAND_DISCARDEDトリガー検出用（BattleScreenが消化してクリア）
    ownerState: { ...ctx.ownerState, hand: ctx.ownerState.hand.slice(selfDiscard), trash: [...ctx.ownerState.trash, ...selfDiscarded],
      hand_discarded_just: selfDiscarded.length > 0 ? [...(ctx.ownerState.hand_discarded_just ?? []), ...selfDiscarded] : ctx.ownerState.hand_discarded_just },
    otherState: { ...ctx.otherState, hand: ctx.otherState.hand.slice(otherDiscard), trash: [...ctx.otherState.trash, ...otherDiscarded],
      hand_discarded_just: otherDiscarded.length > 0 ? [...(ctx.otherState.hand_discarded_just ?? []), ...otherDiscarded] : ctx.otherState.hand_discarded_just,
      // otherState 側＝相手から見れば「対戦相手の効果によって」（ownerState 側は自分の効果なので立てない）
      hand_discarded_just_by_opp: otherDiscarded.length > 0 ? true : ctx.otherState.hand_discarded_just_by_opp },
  };
  return done(addLog(newCtx, `各プレイヤー手札${a.count}枚捨て`));
}

function execPlaceVirus(a: PlaceVirusAction, ctx: ExecCtx): ExecResult {
  const tgtOwner: Owner = a.targetOwner === 'opponent' ? 'opponent' : 'self';
  const tgtState = ownerState(tgtOwner, ctx);
  const virus = [...(tgtState.field.signi_virus ?? [0, 0, 0])];

  // powerDeltaOnZone: ウィルス済みゾーンも選択可（ウィルスは置けないがパワー修正は適用される）ため常に選択式
  if (a.powerDeltaOnZone !== undefined) {
    return needsInteraction(ctx, {
      type: 'SELECT_VIRUS_ZONE',
      owner: tgtOwner,
      virusCount: a.virusCount,
      remainingZones: typeof a.zoneCount === 'number' ? a.zoneCount : 1,
      upTo: a.upToZoneCount ?? false,
      powerDeltaOnZone: a.powerDeltaOnZone,
    });
  }

  // どのゾーンに置けるか（まだウィルスが置かれていないゾーン）
  const available = [0, 1, 2].filter(i => virus[i] === 0);
  if (available.length === 0) return done(addLog(ctx, '【ウィルス】を置けるゾーンなし'));

  // fillToTotal: 合計がこの値になるように不足分だけ置く（WX19-045）。既に達していれば何もしない。
  if (a.fillToTotal !== undefined) {
    const curTotal = virus.reduce((s, v) => s + (v ?? 0), 0);
    const needed = Math.max(0, a.fillToTotal - curTotal);
    if (needed === 0) return done(addLog(ctx, `相手の【ウィルス】は既に合計${a.fillToTotal}個以上`));
    return needsInteraction(ctx, {
      type: 'SELECT_VIRUS_ZONE',
      owner: tgtOwner,
      virusCount: a.virusCount,
      remainingZones: Math.min(needed, available.length),
      upTo: false,
    });
  }

  const zoneCount = a.zoneCount === 'ALL'
    ? available.length
    : Math.min(a.zoneCount, available.length);

  // 全空きゾーンに置く場合は選択の余地がない（「まで」の場合は減らせるので選択させる）
  if (zoneCount >= available.length && !a.upToZoneCount) {
    for (const i of available) virus[i] = a.virusCount;
    const newState: PlayerState = { ...tgtState, field: { ...tgtState.field, signi_virus: virus } };
    // ON_OPP_VIRUS_CHANGED検出用: 置かれた場の相手側にフラグ（watcher = 置かれた場から見た対戦相手）
    let cur = setOwnerState(tgtOwner, newState, ctx);
    const watcherOwner: Owner = tgtOwner === 'opponent' ? 'self' : 'opponent';
    cur = setOwnerState(watcherOwner, { ...ownerState(watcherOwner, cur), opp_virus_placed_just: true }, cur);
    return done(addLog(cur, `【ウィルス】を${available.length}ゾーンに配置`));
  }

  // 配置先ゾーンをプレイヤーが選択する
  return needsInteraction(ctx, {
    type: 'SELECT_VIRUS_ZONE',
    owner: tgtOwner,
    virusCount: a.virusCount,
    remainingZones: zoneCount,
    upTo: a.upToZoneCount ?? false,
  });
}

// SELECT_VIRUS_ZONE: プレイヤーが選んだシグニゾーンに【ウィルス】を置く（zoneIndex=nullで配置打ち切り）
export function resumeSelectVirusZone(
  zoneIndex: number | null,
  pending: PendingInteractionDef & { type: 'SELECT_VIRUS_ZONE' },
  ctx: ExecCtx,
): ExecResult {
  if (zoneIndex === null) {
    const cur = addLog(ctx, '【ウィルス】配置を終了');
    if (pending.continuation) return executeAction(pending.continuation, cur);
    return done(cur);
  }
  const state = ownerState(pending.owner, ctx);
  const virus = [...(state.field.signi_virus ?? [0, 0, 0])];
  // 既にウィルスがあるゾーンが選ばれた場合は再選択（powerDeltaOnZone時はウィルス済みゾーンも選択可）
  const alreadyHasVirus = (virus[zoneIndex] ?? 0) > 0;
  if (alreadyHasVirus && pending.powerDeltaOnZone === undefined) return needsInteraction(ctx, pending);
  if (!alreadyHasVirus) virus[zoneIndex] = pending.virusCount;
  let newS: PlayerState = { ...state, field: { ...state.field, signi_virus: virus } };
  let logMsg = alreadyHasVirus
    ? `ゾーン${zoneIndex + 1}は【ウィルス】配置済み`
    : `ゾーン${zoneIndex + 1}に【ウィルス】を配置`;
  // 選択ゾーンのシグニへのパワー修正（WD19-009: そのシグニゾーンにあるシグニのパワーを－8000）
  if (pending.powerDeltaOnZone !== undefined) {
    const zoneTop = newS.field.signi[zoneIndex]?.at(-1);
    if (zoneTop) {
      newS = { ...newS, temp_power_mods: [...(newS.temp_power_mods ?? []), { cardNum: zoneTop, delta: pending.powerDeltaOnZone }] };
      logMsg += `、${ctx.cardMap.get(zoneTop)?.CardName ?? zoneTop}のパワー${pending.powerDeltaOnZone > 0 ? '+' : ''}${pending.powerDeltaOnZone}`;
    }
  }
  let cur = addLog(setOwnerState(pending.owner, newS, ctx), logMsg);
  // ON_OPP_VIRUS_CHANGED検出用: 実際に置かれた場合のみ、置かれた場の相手側にフラグ
  if (!alreadyHasVirus) {
    const watcherOwnerRSV: Owner = pending.owner === 'opponent' ? 'self' : 'opponent';
    cur = setOwnerState(watcherOwnerRSV, { ...ownerState(watcherOwnerRSV, cur), opp_virus_placed_just: true }, cur);
  }
  const remaining = pending.remainingZones - 1;
  if (remaining > 0 && [0, 1, 2].some(i => virus[i] === 0)) {
    return needsInteraction(cur, { ...pending, remainingZones: remaining });
  }
  if (pending.continuation) return executeAction(pending.continuation, cur);
  return done(cur);
}

export function canAttachAcceToHost(
  state: PlayerState,
  otherState: PlayerState,
  hostNum: string,
  zoneIdx: number,
  ctx: ExecCtx,
  isStateOwnerTurn: boolean,
): boolean {
  const limit = ctx.effectsMap
    ? (collectMultiAcceLimits(state, ctx.effectsMap, ctx.cardMap, otherState, isStateOwnerTurn).get(hostNum) ?? 1)
    : 1;
  return acceCardsAt(state.field, zoneIdx).length < limit;
}

function execAttachAcce(a: AttachAcceAction, ctx: ExecCtx): ExecResult {
  const srcState = a.sourceOwner === 'opponent' ? ctx.otherState : ctx.ownerState;
  const tgtState = a.targetSigniOwner === 'opponent' ? ctx.otherState : ctx.ownerState;
  const tgtOther = a.targetSigniOwner === 'opponent' ? ctx.ownerState : ctx.otherState;
  const isTgtTurn = a.targetSigniOwner === 'opponent' ? !(ctx.isOwnerTurn ?? true) : (ctx.isOwnerTurn ?? true);

  // romHand
   if (a.fromHand) {
    const handCands = srcState.hand.filter(cn => {
      const card = ctx.cardMap.get(cn);
      return card && card.Type === 'シグニ' && (!a.signiFilter || matchesFilter(card, a.signiFilter));
    });
    if (handCands.length === 0) return done(addLog(ctx, 'アクセ可能な手札シグニなし'));
    // ステップ1: 手札からアクセカードを選択（cardNum=選ばれたアクセカード） → ステップ2: ホストシグニ選択へ
    // thenAction には _selectingAcceFromHand マーカーを付け、applyDirectAction の ATTACH_ACCE ケースで
    // 「選ばれた cardNum＝アクセカード」として扱い、続けてホスト選択の SELECT_TARGET を再発行する。
    const pickAcceAction: AttachAcceAction = { ...a, fromHand: false, _selectingAcceFromHand: true };
    return needsInteraction(addLog(ctx, '手札からアクセするシグニを選択'), {
      type: 'SELECT_TARGET',
      candidates: handCands,
      count: 1,
      optional: false,
      targetScope: 'self_hand',
      thenAction: pickAcceAction as import('../types/effects').EffectAction,
    });
  }

  // エナゾーン/手札からのアクセ: ホストシグニ選択
  // targetFilter でホスト側フィルター、signiFilter でアクセカード側フィルター
  const hostCands = (tgtState.field.signi ?? []).flatMap((stack, i) => {
    if (!stack || stack.length === 0) return [];
    const top = stack[stack.length - 1];
    if (!canAttachAcceToHost(tgtState, tgtOther, top, i, ctx, isTgtTurn)) return [];
    if (a.targetFilter && !matchesFilter(ctx.cardMap.get(top), a.targetFilter)) return [];
    return [top];
  });
  if (hostCands.length === 0) return done(addLog(ctx, 'アクセ対象なし'));

  const scope: TargetScope = a.targetSigniOwner === 'opponent' ? 'opp_field' : 'self_field';
  return needsInteraction(addLog(ctx, 'どのシグニにアクセしますか？'), {
    type: 'SELECT_TARGET',
    candidates: hostCands,
    count: 1,
    optional: false,
    targetScope: scope,
    thenAction: a as import('../types/effects').EffectAction,
  });
}

function execFieldSigniToAcce(a: import('../types/effects').FieldSigniToAcceAction, ctx: ExecCtx): ExecResult {
  const srcState = ownerState(a.sourceOwner, ctx);
  const tgtState = ownerState(a.targetSigniOwner, ctx);
  const tgtOther = a.targetSigniOwner === 'opponent' ? ctx.ownerState : ctx.otherState;
  const isTgtTurn = a.targetSigniOwner === 'opponent' ? !(ctx.isOwnerTurn ?? true) : (ctx.isOwnerTurn ?? true);
  const picked = a.sourceThisCard ? ctx.sourceCardNum : a._pickedFieldSigni;

  if (a._reattachSelectingHost && a._reattachAcceCard) {
    const hostCands = fieldCandidates(tgtState, a.targetFilter, ctx.cardMap, ctx.effectivePowers, ctx.allColorSigniNums, ctx.fieldSigniExtraColors)
      .filter(n => {
        const zi = tgtState.field.signi.findIndex(s => s?.at(-1) === n);
        return zi >= 0 && canAttachAcceToHost(tgtState, tgtOther, n, zi, ctx, isTgtTurn);
      });
    if (hostCands.length === 0) return done(ctx);
    const scope: TargetScope = a.targetSigniOwner === 'opponent' ? 'opp_field' : 'self_field';
    return needsInteraction(addLog(ctx, '移設するアクセの付け先を選択（任意）'), {
      type: 'SELECT_TARGET', candidates: hostCands, count: 1, optional: true, targetScope: scope,
      thenAction: a as import('../types/effects').EffectAction,
    });
  }

  if (!picked) {
    const sourceCands = fieldCandidates(srcState, a.sourceFilter, ctx.cardMap, ctx.effectivePowers, ctx.allColorSigniNums, ctx.fieldSigniExtraColors);
    if (sourceCands.length === 0) return done(addLog(ctx, 'アクセ元になる場のシグニなし'));
    const scope: TargetScope = a.sourceOwner === 'opponent' ? 'opp_field' : 'self_field';
    return needsInteraction(addLog(ctx, 'アクセにする場のシグニを選択'), {
      type: 'SELECT_TARGET', candidates: sourceCands, count: 1, optional: false, targetScope: scope,
      thenAction: { ...a, _pickedFieldSigni: '__SELECTED__' } as import('../types/effects').EffectAction,
    });
  }

  const hostCands = fieldCandidates(tgtState, a.targetFilter, ctx.cardMap, ctx.effectivePowers, ctx.allColorSigniNums, ctx.fieldSigniExtraColors).filter(cn => {
    if (cn === picked) return false;
    const zi = tgtState.field.signi.findIndex(s => s?.at(-1) === cn);
    return zi >= 0 && canAttachAcceToHost(tgtState, tgtOther, cn, zi, ctx, isTgtTurn);
  });
  if (hostCands.length === 0) return done(addLog(ctx, 'アクセ対象なし'));
  const scope: TargetScope = a.targetSigniOwner === 'opponent' ? 'opp_field' : 'self_field';
  return needsInteraction(addLog(ctx, 'どのシグニにアクセしますか？'), {
    type: 'SELECT_TARGET', candidates: hostCands, count: 1, optional: false, targetScope: scope,
    thenAction: a as import('../types/effects').EffectAction,
  });
}

function execBloodCrystalArmor(a: BloodCrystalArmorAction, ctx: ExecCtx): ExecResult {
  // 自分のフィールドにいる対象シグニのうち、同名カードが指定領域にあるものを選択候補とする
  const candidates = (ctx.ownerState.field.signi ?? []).flatMap((stack, zoneIdx) => {
    if (!stack || stack.length === 0) return [];
    const top = stack[stack.length - 1];
    const card = ctx.cardMap.get(top);
    if (a.targetFilter && !matchesFilter(card, a.targetFilter)) return [];
    const sameName = card?.CardName;
    if (!sameName) return [];
    // 既に血晶武装状態でも選択可能（さらに重ねることができる）
    const inHand  = a.source.includes('hand')  && ctx.ownerState.hand.some(n => ctx.cardMap.get(n)?.CardName === sameName);
    const inTrash = a.source.includes('trash') && ctx.ownerState.trash.some(n => ctx.cardMap.get(n)?.CardName === sameName);
    const inDeck  = a.source.includes('deck')  && ctx.ownerState.deck.some(n => ctx.cardMap.get(n)?.CardName === sameName);
    // 自身と同名のカードをカウントする際、フィールドにある自身は除く
    const fieldSelf = stack[stack.length - 1];
    const inHandExcSelf  = a.source.includes('hand')  && ctx.ownerState.hand.some(n => { const cn = ctx.cardMap.get(n)?.CardName; return cn === sameName && n !== fieldSelf; });
    const inTrashExcSelf = a.source.includes('trash') && ctx.ownerState.trash.some(n => ctx.cardMap.get(n)?.CardName === sameName);
    const inDeckExcSelf  = a.source.includes('deck')  && ctx.ownerState.deck.some(n => ctx.cardMap.get(n)?.CardName === sameName);
    void zoneIdx; void inHand; void inTrash; void inDeck;
    if (!inHandExcSelf && !inTrashExcSelf && !inDeckExcSelf) return [];
    return [top];
  });
  if (candidates.length === 0) return done(addLog(ctx, '血晶武装対象なし'));

  return {
    done: false,
    ownerState: ctx.ownerState,
    otherState: ctx.otherState,
    logs: ctx.logs,
    pending: {
      type: 'SELECT_TARGET',
      candidates,
      count: Math.min(a.count, candidates.length),
      optional: false,
      targetScope: 'self_field',
      thenAction: a, // applyDirectAction の BLOOD_CRYSTAL_ARMOR ケースで処理
    } as PendingInteractionDef,
  };
}

function execAddCraftToLrigDeck(a: import('../types/effects').AddCraftToLrigDeckAction, ctx: ExecCtx): ExecResult {
  // CardData_TK から cardName が一致するクラフトカードを検索
  const craftCard = [...ctx.cardMap.values()].find(
    c => c.CardName === a.cardName && c.Type?.includes('クラフト'),
  );
  if (!craftCard) {
    return done(addLog(ctx, `クラフトカード「${a.cardName}」が見つかりません`));
  }
  const s = ownerState(a.owner, ctx);
  const additions = Array(a.count).fill(craftCard.CardNum);
  const newState: PlayerState = {
    ...s,
    lrig_deck: [...additions, ...s.lrig_deck],
  };
  return done(addLog(
    setOwnerState(a.owner, newState, ctx),
    `${a.cardName}×${a.count}`,
  ));
}

// SET_CARD_COST_REPLACEMENT: カード名指定の使用コスト置換をゲーム間の PlayerState へ書く（WXK03-002-E3）。
// 実際の適用は支払い時＝`src/screens/battle/costs.ts` の `computeCostReplacement` が
// `card_cost_replacements` を最優先で参照する（軽減系より前）。同名カードの再設定は後勝ちで上書き。
function execSetCardCostReplacement(a: import('../types/effects').SetCardCostReplacementAction, ctx: ExecCtx): ExecResult {
  const s = ownerState(a.owner, ctx);
  const rest = (s.card_cost_replacements ?? []).filter(r => r.cardName !== a.cardName);
  const newState: PlayerState = {
    ...s,
    card_cost_replacements: [...rest, { cardName: a.cardName, cost: a.cost }],
  };
  const costStr = a.cost.map(c => `《${c.color}×${c.count}》`).join('');
  return done(addLog(
    setOwnerState(a.owner, newState, ctx),
    `このゲームの間、《${a.cardName}》の使用コストは${costStr}になる`,
  ));
}

// ===== メイン実行関数 =====

export function executeAction(action: EffectAction, ctx: ExecCtx): ExecResult {
  switch (action.type) {
    case 'DRAW':                    return execDraw(action as DrawAction, ctx);
    case 'LOOK_AT_DECK_AND_LIFE':   return execLookAtDeckAndLife(action as import('../types/effects').LookAtDeckAndLifeAction, ctx);
    case 'BANISH':                  return execBanish(action as BanishAction, ctx);
    case 'BOUNCE':                  return execBounce(action as BounceAction, ctx);
    case 'SEND_TO_ENERGY':          return execSendToEnergy(action as SendToEnergyAction, ctx);
    case 'POWER_MODIFY':            return execPowerModify(action as PowerModifyAction, ctx);
    case 'LEVEL_MODIFY':            return execLevelModify(action as import('../types/effects').LevelModifyAction, ctx);
    case 'POWER_MULTIPLY':          return execPowerMultiply(action as import('../types/effects').PowerMultiplyAction, ctx);
    case 'POWER_SET':               return execPowerSet(action as PowerSetAction, ctx);
    case 'TRASH':                   return execTrash(action as TrashAction, ctx);
    case 'EXILE':                   return execExile(action as import('../types/effects').ExileAction, ctx);
    case 'ENERGY_CHARGE':           return execEnergyCharge(action as EnergyChargeAction, ctx);
    case 'EQUALIZE_ENERGY':         return execEqualizeEnergy(action as import('../types/effects').EqualizeEnergyAction, ctx);
    case 'ENERGY_CHARGE_FROM_DECK': return execEnergyChargeFromDeck(action as EnergyChargeFromDeckAction, ctx);
    case 'LIFE_CRASH':              return execLifeCrash(action as LifeCrashAction, ctx);
    case 'INSTALL_DELAYED_TRIGGER': return execInstallDelayedTrigger(action as import('../types/effects').InstallDelayedTriggerAction, ctx);
    case 'REVEAL_DECK_TOP':         return execRevealDeckTop(action as import('../types/effects').RevealDeckTopAction, ctx);
    case 'TRASH_REVEALED':          return execTrashRevealed(action as import('../types/effects').TrashRevealedAction, ctx);
    case 'SHUFFLE_DECK':            return execShuffleDeck(action as ShuffleDeckAction, ctx);
    case 'REVEAL':                  return execReveal(action as import('../types/effects').RevealAction, ctx);
    case 'ADD_TO_HAND':             return done(addLog(ctx, 'カードを手札に加える')); // SEARCH内で処理
    case 'TRANSFER_TO_HAND':        return execTransferToHand(action as TransferToHandAction, ctx);
    case 'ADD_TO_FIELD':            return execAddToField(action as AddToFieldAction, ctx);
    case 'PLACE_SIGNI_ON_FIELD':    return execPlaceSigniOnField(action as import('../types/effects').PlaceSigniOnFieldAction, ctx);
    case 'ADD_TO_LIFE':             return execAddToLife(action as AddToLifeAction, ctx);
    case 'FREEZE':                  return execFreeze(action as FreezeAction, ctx);
    case 'DOWN':                    return execDown(action as DownAction, ctx);
    case 'UP':                      return execUp(action as UpAction, ctx);
    case 'BLOCK_ACTION':            return execBlockAction(action as BlockActionAction, ctx);
    case 'STORY_CHANGE':            return execStoryChange(action as StoryChangeAction, ctx);
    case 'GRANT_KEYWORD':           return execGrantKeyword(action as GrantKeywordAction, ctx);
    case 'GRANT_EFFECT':            return execGrantEffect(action as GrantEffectAction, ctx);
    case 'SEARCH':                  return execSearch(action as SearchAction, ctx);
    case 'SEQUENCE':                return execSequence(action as SequenceAction, ctx);
    case 'REPEAT':                  return execRepeat(action as RepeatAction, ctx);
    case 'SELECT_COLOR':            return execSelectColor(action as SelectColorAction, ctx);
    case 'PREVENT_REFRESH':         return execPreventRefresh(action as PreventRefreshAction, ctx);
    case 'RECOLLECT_GATE':         return done(addLog(ctx, 'レコレクトゲート'));
    case 'CHOOSE':                  return execChoose(action as ChooseAction, ctx);
    case 'CONDITIONAL':             return execConditional(action as ConditionalAction, ctx);
    case 'LOOK_AND_REORDER':        return execLookAndReorder(action as LookAndReorderAction, ctx);
    case 'TRANSFER_TO_DECK':        return execTransferToDeck(action as TransferToDeckAction, ctx);
    case 'PLACE_LRIGS_UNDER_CENTER': return execPlaceLrigsUnderCenter(action as import('../types/effects').PlaceLrigsUnderCenterAction, ctx);
    case 'COUNTER_SPELL':           return done(ctx); // 打ち消しログはBattleScreen側でスペル名付きで出力
    case 'SELF_PLAY_RESTRICT':      return done(ctx); // CONTINUOUS 出撃制限。実 enforcement は handleSummonSigni の canSelfPlay（executor では no-op）
    case 'COST_REDUCTION': {
      // 次に使用するスペルのコスト軽減（WX04-008）: フラグに積み、BattleScreenのスペル使用コスト計算で消費。
      const cr = action as import('../types/effects').CostReductionAction;
      if (cr.targetCardType === 'スペル' && !cr.isGrowCost && cr.reduction?.length) {
        const existing = ctx.ownerState.next_spell_cost_reduction ?? [];
        return done(addLog(
          { ...ctx, ownerState: { ...ctx.ownerState, next_spell_cost_reduction: [...existing, ...cr.reduction] } },
          `次に使用するスペルのコストを${cr.reduction.map(r => `《${r.color}×${r.count}》`).join('')}軽減`));
      }
      // 【チェイン】＝「このターン、あなたが次にアーツを使用する場合、それの使用コストは《色×1》…減る」
      // （タスク12(xciii)）。スペル版と同型の状態に積み、ArtsModal のコスト計算で消費する。
      if (cr.targetCardType === 'アーツ' && !cr.isGrowCost && cr.reduction?.length) {
        const existingArts = ctx.ownerState.next_arts_cost_reduction ?? [];
        return done(addLog(
          { ...ctx, ownerState: { ...ctx.ownerState, next_arts_cost_reduction: [...existingArts, ...cr.reduction] } },
          `次に使用するアーツのコストを${cr.reduction.map(r => `《${r.color}×${r.count}》`).join('')}軽減`));
      }
      return done(addLog(ctx, 'コスト軽減'));
    }
    case 'GRANT_PROTECTION':        return execGrantProtection(action as GrantProtectionAction, ctx);
    case 'ATTACH_CHARM':            return execAttachCharm(action as AttachCharmAction, ctx);
    case 'ATTACH_FACEDOWN_FROM_HAND': return execAttachFacedownFromHand(action as AttachFacedownFromHandAction, ctx);
    case 'REVEAL_AND_PICK':         return execRevealAndPick(action as RevealAndPickAction, ctx);
    case 'LOOK_PICK_CHAIN':         return execLookPickChain(action as import('../types/effects').LookPickChainAction, ctx);
    case 'PLAY_FREE':               return execPlayFree(action as PlayFreeAction, ctx);
    case 'PLAY_FREE_FROM_TRASH':    return execPlayFreeFromTrash(action as import('../types/effects').PlayFreeFromTrashAction, ctx);
    case 'COST_INCREASE':           return execCostIncrease(action as CostIncreaseAction, ctx);
    case 'POWER_MODIFY_PER_FIELD':     return execPowerModifyPerField(action as PowerModifyPerFieldAction, ctx);
    case 'DRAW_PER_FIELD_COUNT':       return execDrawPerFieldCount(action as import('../types/effects').DrawPerFieldCountAction, ctx);
    case 'DRAW_PER_LRIG_LEVEL':        return execDrawPerLrigLevel(action as import('../types/effects').DrawPerLrigLevelAction, ctx);
    case 'ENERGY_CHARGE_PER_LRIG_LEVEL': return execEnergyChargePerLrigLevel(action as import('../types/effects').EnergyChargePerLrigLevelAction, ctx);
    case 'ENERGY_CHARGE_FROM_DECK_PER_FIELD_COUNT': return execEnergyChargeFromDeckPerFieldCount(action as import('../types/effects').EnergyChargeFromDeckPerFieldCountAction, ctx);
    case 'AWAKEN_SIGNI':               return execAwakenSigni(action as import('../types/effects').AwakenSigniAction, ctx);
    case 'NEGATE_ATTACK':              return execNegateAttack(action as import('../types/effects').NegateAttackAction, ctx);
    case 'PLACE_UNDER_SIGNI':          return execPlaceUnderSigni(action as import('../types/effects').PlaceUnderSigniAction, ctx);
    case 'STACK_SPELL': {  // §6.1 タスク7: トラッシュ等からスペルをmaxCount枚まで選び、このカードの下に置く（WX11-029）
      const ss = action as import('../types/effects').StackSpellAction;
      return execPlaceUnderSigni({ type: 'PLACE_UNDER_SIGNI', source: ss.from, count: ss.maxCount, upToCount: true, filter: ss.filter }, ctx);
    }
    case 'PLACE_UNDER_SOURCE_SIGNI':   return done(addLog(ctx, 'シグニの下に置く（直接呼出）')); // applyDirectAction内で処理
    case 'TAKE_FROM_UNDER_SIGNI':      return execTakeFromUnderSigni(action as import('../types/effects').TakeFromUnderSigniAction, ctx);
    case 'POWER_MODIFY_PER_LRIG_LEVEL': return execPowerModifyPerLrigLevel(action as PowerModifyPerLrigLevelAction, ctx);
    case 'POWER_MODIFY_PER_LEVEL_SUM':  return execPowerModifyPerLevelSum(action as import('../types/effects').PowerModifyPerLevelSumAction, ctx);
    case 'FORCE_END_TURN':             return done(addLog({ ...ctx, forceEndTurn: true }, 'ターンを強制終了'));
    case 'CHARM_PROTECTION':           return execCharmProtection(action as CharmProtectionAction, ctx);
    case 'MUTUAL_DISCARD_AND_DRAW': return execMutualDiscardAndDraw(action as MutualDiscardAndDrawAction, ctx);
    case 'VARIABLE_DISCARD_AND_DRAW': return execVariableDiscardAndDraw(action as VariableDiscardAndDrawAction, ctx);
    case 'RETURN_ASSIST_LRIG_TO_DECK': return execReturnAssistLrigToDeck(action as ReturnAssistLrigToDeckAction, ctx);
    case 'REMOVE_ABILITIES':        return execRemoveAbilities(action as RemoveAbilitiesAction, ctx);
    case 'GAIN_COIN':               return execGainCoin(action as GainCoinAction, ctx);
    case 'DISCARD_BOTH':            return execDiscardBoth(action as DiscardBothAction, ctx);
    case 'REMOVE_CHARM':            return execRemoveCharm(action as RemoveCharmAction, ctx);
    case 'FORCE_SIGNI_ATTACK':      return execForceSigniAttack(action as ForceSigniAttackAction, ctx);
    case 'POWER_MODIFY_PER_TRASH_COUNT': return execPowerModifyPerTrashCount(action as PowerModifyPerTrashCountAction, ctx);
    case 'POWER_MODIFY_PER_LIFE_COUNT':  return execPowerModifyPerLifeCount(action as PowerModifyPerLifeCountAction, ctx);
    case 'POWER_MODIFY_PER_HAND_COUNT':  return execPowerModifyPerHandCount(action as import('../types/effects').PowerModifyPerHandCountAction, ctx);
    case 'GRANT_LRIG_ABILITY': {
      const ga = action as GrantLrigAbilityAction;
      if (ga.abilities && ga.abilities.length > 0) {
        const untilOppTurn = ga.duration === 'UNTIL_OPP_TURN_END';
        const storeKey = untilOppTurn ? 'lrig_granted_auto_effects_until_opp_turn' : 'lrig_granted_auto_effects';
        const targetsOpponent = ga.targetOwner === 'opponent';
        const targetState = targetsOpponent ? ctx.otherState : ctx.ownerState;
        const existing = targetState[storeKey] ?? [];
        // permanent（「このゲームの間」）は各能力に permanentGrant を刻み、ターン境界リセットで残す
        const granted = ga.permanent ? ga.abilities.map(ab => ({ ...ab, permanentGrant: true })) : ga.abilities;
        const guardAlt = ga.abilities
          .map(ab => ab.action)
          .find((act): act is import('../types/effects').StubAction =>
            act.type === 'STUB' && act.id === 'GUARD_ALT_HAND_REPLACE');
        const holographReplace = ga.abilities.some(ab =>
          ab.action.type === 'STUB' && ab.action.id === 'HOLOGRAPH_REVEAL_REPLACE');
        // §6.4 ライフクラッシュ置換の【常】付与（`WXDi-CP01-023`）＝**付与時に宣言を積む**。
        // ⚠CONTINUOUS は `executeAction` を通らないので、能力として持たせるだけでは恒久 no-op になる
        //   （続き424 の `FORCE_SIGNI_ATTACK` と同型）。`GUARD_ALT_HAND_REPLACE` と同じ扱い。
        const lifeCrashRepl = ga.abilities
          .map(ab => ab.action)
          .filter((act): act is import('../types/effects').LifeCrashReplaceAction =>
            act.type === 'LIFE_CRASH_REPLACE')
          .map((act): import('../types').LifeCrashReplacement => ({
            kind: act.replaceKind, count: act.count,
            ...(act.damageSource ? { damageSource: act.damageSource } : {}),
            ...(act.byAttack ? { byAttack: true } : {}),
            ...(act.once ? { once: true } : {}),
            ...(act.optional ? { optional: true } : {}),
          }));
        const newTarget: PlayerState = {
          ...targetState,
          [storeKey]: [...existing, ...granted],
          ...(guardAlt
            ? (untilOppTurn
              ? { guard_alt_hand_until_opp_turn: guardAlt.count ?? 1 }
              : { game_guard_alt_hand: guardAlt.count ?? 1 })
            : {}),
          ...(holographReplace ? { holograph_reveal_replace_this_turn: true } : {}),
          ...(lifeCrashRepl.length > 0
            ? { life_crash_replacements: [...(targetState.life_crash_replacements ?? []), ...lifeCrashRepl] }
            : {}),
        };
        const nextCtx = targetsOpponent ? { ...ctx, otherState: newTarget } : { ...ctx, ownerState: newTarget };
        return done(addLog(nextCtx, `${targetsOpponent ? '対戦相手の' : ''}ルリグ付与能力${ga.permanent ? '（このゲームの間）' : ''}: ${ga.rawText}`));
      }
      return done(ctx);
    }
    case 'GRANT_PLAYER_ABILITY': {
      const gp = action as import('../types/effects').GrantPlayerAbilityAction;
      if (!gp.abilities?.length) return done(ctx);
      // ⚠**得る側は効果のオーナーとは限らない**（「対戦相手は以下の能力を得る」＝§6.4 O-4）。
      //   落とすと相手に課すはずの不利益を自分が背負う裏返しになる。
      const gpOwner: Owner = gp.targetOwner === 'opponent' ? 'opponent' : 'self';
      const gpState = ownerState(gpOwner, ctx);
      const existing = gpState.game_granted_effects ?? [];
      const existingIds = new Set(existing.map(e => e.effectId));
      const additions = gp.abilities.filter(e => !existingIds.has(e.effectId));
      return done(addLog(setOwnerState(gpOwner, { ...gpState, game_granted_effects: [...existing, ...additions] }, ctx),
        `${gpOwner === 'self' ? 'あなた' : '対戦相手'}のプレイヤー付与能力（このゲームの間）: ${gp.rawText ?? additions.map(e => e.effectId).join(',')}`));
    }
    case 'DRAW_PHASE_REPLACEMENT':
      return done(addLog(ctx, 'ドローフェイズの通常ドロー置換（フェイズ進行時に適用）'));
    case 'PLACE_VIRUS':                  return execPlaceVirus(action as PlaceVirusAction, ctx);
    case 'ATTACH_ACCE':                  return execAttachAcce(action as AttachAcceAction, ctx);
    case 'FIELD_SIGNI_TO_ACCE':          return execFieldSigniToAcce(action as import('../types/effects').FieldSigniToAcceAction, ctx);
    case 'BLOOD_CRYSTAL_ARMOR':          return execBloodCrystalArmor(action as BloodCrystalArmorAction, ctx);
    case 'POWER_MODIFY_PER_VIRUS_COUNT': return done(addLog(ctx, 'ウィルス数比例パワー（effectEngine処理）'));
    case 'LRIG_LIMIT_MODIFY': {
      // ⚠**`until:'PERMANENT'` だけが「常在」＝`collectLrigColorAndLimitMods` が毎フレーム集計する**ので
      //   ここでは何もしない（実行するとフラグ側と二重計上になる）。
      //   `END_OF_TURN`/`NEXT_TURN` は**実行時に1回だけ state へ書く**種類で、従来ここはログだけの no-op だった
      //   ＝`WX16-Re19-E2`（【出】「次の対戦相手のメインフェイズの間、対戦相手のリミットは1減る」）が丸ごと死んでいた（続き407）。
      const lm = action as import('../types/effects').LrigLimitModifyAction;
      if (lm.until === 'PERMANENT') return done(addLog(ctx, `リミット${lm.delta > 0 ? '+' : ''}${lm.delta}（常在＝effectEngine が集計）`));
      const lmOwner: Owner = lm.owner === 'opponent' ? 'opponent' : 'self';
      const lmState = ownerState(lmOwner, ctx);
      // NEXT_TURN は「次のそのプレイヤーのメインフェイズから」＝pending へ積み、BattleScreen の
      // GROW→MAIN 遷移が `lrig_limit_mod` へ移す（STUB `OPP_MAIN_PHASE_LIMIT_DOWN` と同じ経路）。
      const lmNext: PlayerState = lm.until === 'NEXT_TURN'
        ? { ...lmState, pending_lrig_limit_mod: (lmState.pending_lrig_limit_mod ?? 0) + lm.delta }
        : { ...lmState, lrig_limit_mod: (lmState.lrig_limit_mod ?? 0) + lm.delta };
      return done(addLog(setOwnerState(lmOwner, lmNext, ctx),
        `${lmOwner === 'opponent' ? '対戦相手の' : ''}ルリグリミット${lm.delta > 0 ? '+' : ''}${lm.delta}${lm.until === 'NEXT_TURN' ? '（次のメインフェイズから）' : '（ターン終了時まで）'}`));
    }
    case 'ADD_CRAFT_TO_LRIG_DECK':       return execAddCraftToLrigDeck(action as import('../types/effects').AddCraftToLrigDeckAction, ctx);
    case 'SET_CARD_COST_REPLACEMENT':    return execSetCardCostReplacement(action as import('../types/effects').SetCardCostReplacementAction, ctx);
    //  以下はCONTINUOUS効果専用（effectEngine側で処理）
    case 'BANISH_REDIRECT': {
      const brAction = action as BanishRedirectAction;
      // targetsLastProcessed: 「それ」= 直前ステップで選択/処理したシグニへ選択UIなしで適用。
      // 直前ステップが空振りなら did-it ゲートとして no-op（全体フラグや全候補へのフォールバックはしない）。
      if (brAction.targetsLastProcessed) {
        let cur = ctx;
        for (const cardNum of ctx.lastProcessedCards ?? []) {
          const applied = applyDirectAction(brAction, cardNum, cur);
          cur = { ...cur, ownerState: applied.ownerState, otherState: applied.otherState, logs: applied.logs };
        }
        return done(cur);
      }
      // 「相手のシグニ1体を対象とし、このターン、それが…」は選択対象だけを保持する。
      if (!brAction.bySource && brAction.redirectTo === 'trash' && brAction.target.owner === 'opponent' && brAction.target.count === 1) {
        const cands = fieldCandidates(ctx.otherState, brAction.target.filter, ctx.cardMap, ctx.effectivePowers,
          ctx.allColorSigniNums, ctx.fieldSigniExtraColors);
        return selectOrInteract(cands, 1, brAction.target.upToCount ?? false, 'opp_field', brAction, undefined, ctx);
      }
      // 付与形「シグニ1体を対象とし、それは能力を得る」：対象シグニ自身を redirect 発生源として登録する。
      if (brAction.bySource && brAction.target.owner === 'self' && brAction.target.count === 1) {
        const cands = fieldCandidates(ctx.ownerState, brAction.target.filter, ctx.cardMap, ctx.effectivePowers,
          ctx.allColorSigniNums, ctx.fieldSigniExtraColors);
        return selectOrInteract(cands, 1, brAction.target.upToCount ?? false, 'self_field', brAction, undefined, ctx);
      }
      // redirectTo:'exile'＝「エナゾーンに置かれる代わりにゲームから除外」（SPDi47-05）。既定（trash）と同じ
      // ターン内フラグ方式＝banishDestination／BattleScreen のバトル・パワー0経路が参照し、ターン境界でリセット。
      if ((action as BanishRedirectAction).redirectTo === 'exile') {
        const newOwnerEx: PlayerState = { ...ctx.ownerState, banish_redirect_to_exile: true };
        return done(addLog({ ...ctx, ownerState: newOwnerEx }, '対戦相手のシグニのバニッシュ先をゲーム除外へ変更'));
      }
      // whenPowerZero（「パワーが０以下の対戦相手のシグニがバニッシュされる場合」）＝パワー0消滅経路だけに効く
      // 限定（続き218）。無条件フラグを立てると相手の全バニッシュがトラッシュ送りになる過剰発火。
      // 所有者問わずの `power0_banish_to_trash`（STUB BANISH_REDIRECT_POWER0_TRASH・WX04-038-E1）とは別フラグ
      // ＝こちらは「設定した側の対戦相手のシグニ」限定。
      if ((action as BanishRedirectAction).whenPowerZero === true) {
        const newOwnerP0: PlayerState = { ...ctx.ownerState, power0_banish_to_trash_opp_only: true };
        return done(addLog({ ...ctx, ownerState: newOwnerP0 },
          'このターン、対戦相手のパワー0以下のシグニのバニッシュ先→トラッシュ'));
      }
      // bySource（「このシグニとのバトルによって」等）付きは無条件フラグを立てない＝関与したシグニに限定する
      // （続き217。無条件にすると場に1体いるだけで相手の全バニッシュがトラッシュ送りになる過剰発火）。
      const brSrc = (action as BanishRedirectAction).bySource;
      if (brSrc !== undefined) {
        if (!ctx.sourceCardNum) return done(addLog(ctx, 'バニッシュ先変更（限定付き・発生源不明のため適用なし）'));
        const prevNums = ctx.ownerState.banish_redirect_by_source_nums ?? [];
        const newOwnerBs: PlayerState = {
          ...ctx.ownerState,
          banish_redirect_by_source_nums: prevNums.includes(ctx.sourceCardNum) ? prevNums : [...prevNums, ctx.sourceCardNum],
        };
        return done(addLog({ ...ctx, ownerState: newOwnerBs },
          `${ctx.cardMap.get(ctx.sourceCardNum)?.CardName ?? ctx.sourceCardNum}とのバトルでのバニッシュ先をトラッシュへ変更`));
      }
      const newOwner: PlayerState = { ...ctx.ownerState, banish_redirect: true };
      return done(addLog({ ...ctx, ownerState: newOwner }, '対戦相手のシグニのバニッシュ先をトラッシュへ変更'));
    }
    case 'REARRANGE_SIGNI':                return execRearrangeSigni(action as import('../types/effects').RearrangeSigniAction, ctx);
    case 'SET_BASE_LEVEL': {
      // until:END_OF_TURN は【起】等で一時的に基本レベルを変更（CHANGE_BASE_LEVEL STUB と同じ attack_phase_level_overrides を使用）。
      const sbl = action as import('../types/effects').SetBaseLevelAction;
      if (sbl.until === 'END_OF_TURN' && ctx.sourceCardNum && typeof sbl.value === 'number') {
        const newOv = { ...(ctx.ownerState.attack_phase_level_overrides ?? {}), [ctx.sourceCardNum]: sbl.value };
        return done(addLog({ ...ctx, ownerState: { ...ctx.ownerState, attack_phase_level_overrides: newOv } },
          `${ctx.cardMap.get(ctx.sourceCardNum)?.CardName ?? ctx.sourceCardNum}の基本レベルを${sbl.value}に変更（ターン終了時まで）`));
      }
      return done(ctx); // CONTINUOUS。基本レベルは applyContinuousBaseLevelOverride（cardMap上書き）で反映
    }
    case 'GROW_FREE':                      return done(addLog(ctx, 'フリーグロウ（BattleScreen処理）'));
    case 'POWER_MODIFY_PER_STACK':         return done(addLog(ctx, 'スタック参照パワー（effectEngine処理）'));
    // CONTINUOUS 専用（calcFieldPowers 内の extractPowerModifiesPerDeckCount で計算＝続き135で実装）。
    // ここへ来るのは AUTO/ACTIVATED 経路だけで、その用法の実カードは存在しない（PR-442 は CONTINUOUS）。
    case 'POWER_MODIFY_PER_DECK_COUNT':    return done(addLog(ctx, 'デッキ枚数比例パワー（effectEngine処理）'));
    case 'POWER_MODIFY_PER_ENERGY_COLOR':  return done(addLog(ctx, 'エナ色種類比例パワー（effectEngine処理）'));
    case 'POWER_MODIFY_PER_ENERGY':        return done(addLog(ctx, 'エナ枚数比例パワー（effectEngine処理）'));
    case 'ALT_COST_OPP_TURN':
      return done(addLog(ctx, '対戦相手ターン間コスト変動（展開フェイズで適用済み）'));
    case 'BLOCK_CARD_USE': {
      const bcu = action as import('../types/effects').BlockCardUseAction;
      const newOwner = { ...ctx.ownerState, blocked_card_names: [...(ctx.ownerState.blocked_card_names ?? []), bcu.cardName] };
      return done(addLog({ ...ctx, ownerState: newOwner }, `${bcu.cardName}`));
    }
    case 'NAME_BAN': {
      // 直前に処理（除外等）したカードと同名のカードを、このゲームの間使用禁止にする（WX10-023/WXDi-P13-040）。
      // 禁止対象プレイヤー＝targetSelf ? 効果オーナー : 対戦相手。
      const nb = action as import('../types/effects').NameBanAction;
      const names = [...new Set((ctx.lastProcessedCards ?? [])
        .map(n => ctx.cardMap.get(getCardNum(n))?.CardName)
        .filter((s): s is string => !!s))];
      if (names.length === 0) return done(addLog(ctx, '同名禁止: 対象カードなし'));
      const tgtOwner: Owner = nb.targetSelf ? 'self' : 'opponent';
      const s = ownerState(tgtOwner, ctx);
      // 期間は原文どおり（§6.4 O-11）＝`TURN` は turn-end で消える `blocked_card_names` へ載せる。
      // どちらの軸も読み手は `cardNameUseBlocked` の1関数に集約済み。
      const perTurn = nb.duration === 'TURN';
      const newS: PlayerState = perTurn
        ? { ...s, blocked_card_names: [...(s.blocked_card_names ?? []), ...names] }
        : { ...s, blocked_card_names_game: [...(s.blocked_card_names_game ?? []), ...names] };
      return done(addLog(setOwnerState(tgtOwner, newS, ctx),
        `${perTurn ? 'このターン' : 'このゲームの間'}、${nb.targetSelf ? 'あなた' : '対戦相手'}は${names.join('・')}を使用できない`));
    }
    case 'SIGNI_ATTACK_BAN': {
      // 「このターン、対戦相手は〈条件〉のシグニでアタックできない」（§6.4 O-3）。
      // ⚠**禁止を受ける側の state に積む**（判定は signiAttackGate が attacker 側だけを見る）。
      // ⚠宣言値・「それ」の解決は**ここで焼き込む**＝判定地点からは宣言者側の state も対象宣言も見えない。
      const sab = action as import('../types/effects').SigniAttackBanAction;
      const ban: import('../types').SigniAttackBan = {};
      if (sab.levelFromDeclaredNumber) {
        const declared = ctx.ownerState.declared_number;
        if (declared === undefined) return done(addLog(ctx, 'アタック制限: 数字が宣言されていない'));
        ban.level = declared;
      }
      // 「そのカードと同じレベルのシグニ」＝直前に処理したカード（＝公開した裏向きカード）のレベル。
      // ⚠取れないときは ban を張らない（全シグニ禁止へ広げない＝過少側に倒す）。
      if (sab.levelFromLastProcessed) {
        const refLv = (ctx.lastProcessedCards ?? [])
          .map(n => parseInt(ctx.cardMap.get(getCardNum(n))?.Level ?? '', 10))
          .find(lv => Number.isFinite(lv));
        if (refLv === undefined) return done(addLog(ctx, 'アタック制限: 参照するカードのレベルが取れない'));
        ban.level = refLv;
      }
      if (sab.powerDiffersFromPrinted) ban.powerDiffersFromPrinted = true;
      // 対象がルリグだった分は**別の ban**として積む（判定軸が違う＝§6.4 O-28）。
      // 「対戦相手のルリグかシグニ1体」（`CENTER_LRIG_OR_SIGNI`）は選ばれた側で決まるので、
      // 静的な type ではなく**実際に確定した対象の Type**で仕分ける。
      let lrigBan: import('../types').SigniAttackBan | undefined;
      if (sab.targetsStored) {
        const stored = ctx.storedTargetCards ?? [];
        if (stored.length === 0) return done(addLog(ctx, 'アタック制限: 対象が確定していない'));
        const isLrigNum = (n: string) => (ctx.cardMap.get(getCardNum(n))?.Type ?? '').includes('ルリグ');
        const lrigNums = stored.filter(isLrigNum);
        const signiNums = stored.filter(n => !isLrigNum(n));
        if (lrigNums.length > 0) lrigBan = { ...ban, appliesTo: 'LRIG', cardNums: lrigNums };
        if (signiNums.length > 0) ban.cardNums = signiNums;
        else if (lrigNums.length > 0) ban.cardNums = [];   // シグニ側は空＝下で積まない
        else return done(addLog(ctx, 'アタック制限: 対象が確定していない'));
      }
      // 「選んだシグニ**以外**のシグニでアタックできない」（`WXDi-P08-030-E1`・§6.4 O-3）。
      // ⚠**0体選択でも ban を張る**＝「1体も選ばなかった＝どのシグニでもアタックできない」が原文の意味。
      //   `targetsStored`（選んだものを禁止）とは逆向きなので、空集合の扱いも逆になる。
      if (sab.exceptTargetsStored) ban.exceptCardNums = [...(ctx.storedTargetCards ?? [])];
      // ゾーン限定（「中央のシグニゾーンにあるシグニでアタックできない」＝§6.4 O-33）。
      // ⚠**ルリグ側 ban には載せない**＝ルリグにシグニゾーンは無く、載せると判定地点でゾーンが取れず
      //   「掛からない」に倒れる（`zones` 付き ban は `appliesTo:'LRIG'` と両立しない）。
      if (sab.zones?.length) ban.zones = [...sab.zones];
      // 動的ゾーン（「【ゲート】があるシグニゾーン」＝§6.4 O-33 据置分・続き508）。
      // ⚠**静的な `zones` へ解決して焼き込まない**＝ban を張ったあとに【ゲート】が増減する。
      if (sab.zoneSource) ban.zoneSource = sab.zoneSource;
      for (const b of [ban, lrigBan]) {
        if (!b) continue;
        if (sab.unlessPayColorless) b.unlessPayColorless = sab.unlessPayColorless;
        if (sab.unlessPayHandDiscard) b.unlessPayHandDiscard = sab.unlessPayHandDiscard;
        // 「次の対戦相手のターン（終了時まで）」＝ターン数カウントダウン（§6.4 O-4）。
        if (sab.turns && sab.turns > 1) b.turnsRemaining = sab.turns;
        b.label = b.unlessPayColorless ? `《無》×${b.unlessPayColorless}`
          : b.unlessPayHandDiscard ? `手札${b.unlessPayHandDiscard}枚`
          : 'アタック不可';
      }
      const zoneLabelJa = (zi: number) => (zi === 0 ? '左' : zi === 1 ? '中央' : '右');
      const scopeLabel = [
        ban.zoneSource === 'gate' ? '【ゲート】があるシグニゾーンにある'
          : ban.zones?.length ? `${ban.zones.map(zoneLabelJa).join('か')}のシグニゾーンにある` : '',
        ban.level !== undefined ? `レベル${ban.level}の` : '',
        ban.powerDiffersFromPrinted ? '表記と異なるパワーの' : '',
        sab.targetsStored
          ? [...(ban.cardNums ?? []), ...(lrigBan?.cardNums ?? [])]
              .map(n => ctx.cardMap.get(getCardNum(n))?.CardName ?? n).join('・') + 'は'
          : sab.exceptTargetsStored
            ? (ban.exceptCardNums?.length
                ? ban.exceptCardNums.map(n => ctx.cardMap.get(getCardNum(n))?.CardName ?? n).join('・') + '以外のシグニでは'
                : 'シグニでは')
            : 'シグニでは',
      ].join('');
      const banOwner: Owner = sab.owner === 'opponent' ? 'opponent' : 'self';
      const banState = ownerState(banOwner, ctx);
      const addedBans = [ban, lrigBan]
        .filter((b): b is import('../types').SigniAttackBan => !!b && (b.cardNums?.length !== 0));
      const newBanState: PlayerState = {
        ...banState,
        signi_attack_bans_this_turn: [...(banState.signi_attack_bans_this_turn ?? []), ...addedBans],
      };
      const costLabel = ban.unlessPayColorless ? `《無》×${ban.unlessPayColorless}を支払わないかぎりアタックできない`
        : ban.unlessPayHandDiscard ? `手札を${ban.unlessPayHandDiscard}枚捨てないかぎりアタックできない（アタックするごとに捨てる）`
        : 'アタックできない';
      return done(addLog(setOwnerState(banOwner, newBanState, ctx),
        `このターン、${banOwner === 'self' ? 'あなた' : '対戦相手'}は${scopeLabel}${costLabel}`));
    }
    case 'SIGNI_DEPLOY_BAN': {
      // 「このターンと次のターンの間、対戦相手は〈条件〉のシグニを新たに場に出せない」（§6.4 O-3）。
      // ⚠**禁止を受ける側（場に出す側）の state に積む**＝判定は `deployLimitBlockReason` の1本。
      // ⚠「それと同じ名前」はここでカード名を焼き込む（判定地点には対象宣言が残っていない）。
      const sdb = action as import('../types/effects').SigniDeployBanAction;
      const ban: import('../types').SigniDeployBan = { turnsRemaining: Math.max(1, sdb.turns) };
      if (sdb.namesFromTargets) {
        const refs = (ctx.storedTargetCards ?? []).length > 0
          ? (ctx.storedTargetCards ?? [])
          : (ctx.lastProcessedCards ?? []);
        const names = [...new Set(refs
          .map(n => ctx.cardMap.get(getCardNum(n))?.CardName)
          .filter((s): s is string => !!s))];
        if (names.length === 0) return done(addLog(ctx, '配置制限: 対象が確定していない'));
        ban.cardNames = names;
        ban.label = names.join('・');
      }
      if (sdb.bySource) ban.bySource = sdb.bySource;
      const sdbOwner: Owner = sdb.owner === 'opponent' ? 'opponent' : 'self';
      const sdbState = ownerState(sdbOwner, ctx);
      const newSdbState: PlayerState = {
        ...sdbState,
        signi_deploy_bans: [...(sdbState.signi_deploy_bans ?? []), ban],
      };
      const scopeSdb = ban.cardNames ? `《${ban.cardNames.join('》《')}》と同じ名前の`
        : ban.bySource ? 'シグニとスペルの効果では' : '';
      return done(addLog(setOwnerState(sdbOwner, newSdbState, ctx),
        `${sdb.turns >= 2 ? 'このターンと次のターンの間' : 'このターン'}、`
        + `${sdbOwner === 'self' ? 'あなた' : '対戦相手'}は${scopeSdb}シグニを新たに場に出せない`));
    }
    case 'ADD_EXTRA_ATTACK_PHASE': {
      // 「（このターンの最初の／次の）アタックフェイズの後に、追加のアタックフェイズを加える」（§6.4 O-3）。
      // ⚠キューに積むだけ＝`onStart` は**追加したフェイズの開始時**に走る（ここでは実行しない）。
      const eap = action as import('../types/effects').AddExtraAttackPhaseAction;
      const nEap = Math.max(1, eap.count ?? 1);
      const queuedEap = Array.from({ length: nEap }, () => ({
        ...(ctx.sourceCardNum ? { sourceCardNum: ctx.sourceCardNum } : {}),
        ...(eap.onStart ? { onStart: eap.onStart } : {}),
      }));
      return done(addLog({
        ...ctx,
        ownerState: {
          ...ctx.ownerState,
          extra_attack_phases_this_turn: [...(ctx.ownerState.extra_attack_phases_this_turn ?? []), ...queuedEap],
        },
      }, `このアタックフェイズの後に追加のアタックフェイズを${nEap}回加える`));
    }
    case 'DELAY_TO_NEXT_OPP_ATTACK_PHASE': {
      // 「次の対戦相手のアタックフェイズ開始時、〈本文〉」（§6.4 O-3）＝予約するだけ。
      // ⚠本文はここで実行しない（従来は後続文が即時実行されていた＝過剰実行）。
      const dna = action as import('../types/effects').DelayToNextOppAttackPhaseAction;
      return done(addLog({
        ...ctx,
        ownerState: {
          ...ctx.ownerState,
          pending_next_opp_attack_phase_effects: [
            ...(ctx.ownerState.pending_next_opp_attack_phase_effects ?? []),
            { ...(ctx.sourceCardNum ? { sourceCardNum: ctx.sourceCardNum } : {}), action: dna.action },
          ],
        },
      }, '次の対戦相手のアタックフェイズ開始時の効果を予約'));
    }
    case 'DELAY_TO_NEXT_OPP_TURN_END': {
      // 「次の対戦相手のターン終了時、〈本文〉」（§6.4 O-3）＝予約するだけ。
      // ⚠本文はここで実行しない（続き493 で明示 defer に落として止めた即時実行が、機構が入って予約になった）。
      const dnt = action as import('../types/effects').DelayToNextOppTurnEndAction;
      return done(addLog({
        ...ctx,
        ownerState: {
          ...ctx.ownerState,
          pending_next_opp_turn_end_effects: [
            ...(ctx.ownerState.pending_next_opp_turn_end_effects ?? []),
            { ...(ctx.sourceCardNum ? { sourceCardNum: ctx.sourceCardNum } : {}), action: dnt.action },
          ],
        },
      }, '次の対戦相手のターン終了時の効果を予約'));
    }
    case 'DELAY_TO_NEXT_OWN_TURN_END': {
      // 「次の**あなたの**ターン終了時、〈本文〉」（§6.4 O-4）＝予約するだけ。
      // ⚠**予約スロットへ積む**（active スロットへ直接積むと `ON_TURN_END` が
      //   予約したそのターンの終了時に拾ってしまい「次の」が消える）。
      const dnown = action as import('../types/effects').DelayToNextOwnTurnEndAction;
      return done(addLog({
        ...ctx,
        ownerState: {
          ...ctx.ownerState,
          pending_next_own_turn_end_effects: [
            ...(ctx.ownerState.pending_next_own_turn_end_effects ?? []),
            { ...(ctx.sourceCardNum ? { sourceCardNum: ctx.sourceCardNum } : {}), action: dnown.action },
          ],
        },
      }, '次のあなたのターン終了時の効果を予約'));
    }
    case 'PLACE_FACEDOWN_LRIG_ZONE': {
      // 「デッキの一番上／手札のカードN枚まで を裏向きでルリグゾーンに置く」（§6.4 O-3）。
      const pfl = action as import('../types/effects').PlaceFacedownLrigZoneAction;
      if (pfl.source === 'deck_top') {
        const n = Math.max(1, pfl.count);
        const took = ctx.ownerState.deck.slice(0, n);
        if (took.length === 0) return done(addLog(ctx, 'デッキが空で裏向きに置けない'));
        return done(addLog({
          ...ctx,
          ownerState: {
            ...ctx.ownerState,
            deck: ctx.ownerState.deck.slice(took.length),
            facedown_lrig_zone_cards: [...(ctx.ownerState.facedown_lrig_zone_cards ?? []), ...took],
          },
          lastProcessedCards: took,
        }, `デッキの一番上${took.length}枚を裏向きでルリグゾーンへ`));
      }
      // 「対戦相手は手札を**すべて**〜置く」＝選択の余地が無いので一括で動かす（`SPDi43-02-E2`）。
      // ⚠置く側は効果のオーナーとは限らない＝`owner` を見る（旧実装は自分の手札を1枚捨てていた）。
      const pflOwner: Owner = pfl.owner ?? 'self';
      const pflState = ownerState(pflOwner, ctx);
      if (pfl.all || pflOwner === 'opponent') {
        const movedPFL = pfl.all ? [...pflState.hand] : pflState.hand.slice(0, Math.max(1, pfl.count));
        if (movedPFL.length === 0) return done(addLog(ctx, '手札が無く裏向きに置けない'));
        return done({
          ...addLog(setOwnerState(pflOwner, {
            ...pflState,
            hand: pflState.hand.filter(cn => !movedPFL.includes(cn)),
            facedown_lrig_zone_cards: [...(pflState.facedown_lrig_zone_cards ?? []), ...movedPFL],
          }, ctx), `${pflOwner === 'self' ? 'あなた' : '対戦相手'}の手札${movedPFL.length}枚を裏向きでルリグゾーンへ`),
          lastProcessedCards: movedPFL,
        });
      }
      // 手札からは選択させる（「N枚まで」＝0枚可）。選択後は下の applyDirectAction 側で確定する。
      if (ctx.ownerState.hand.length === 0) return done(addLog(ctx, '手札が無く裏向きに置けない'));
      return selectOrInteract(
        ctx.ownerState.hand, Math.max(1, pfl.count), pfl.upToCount ?? false, 'self_hand', action, undefined, ctx);
    }
    case 'REVEAL_BOTH_DECK_TOPS': {
      // 「あなたと対戦相手は自分のデッキの一番上を公開し、そのカードをデッキの一番下に置く。
      //   どちらも【ライフバースト】を持っている／どちらも持っていない場合、〈帰結〉」（§6.4 O-4）。
      // 🔑公開・比較・帰結は1つの判定なので畳んである（分けると帰結だけが無条件に走る）。
      const rbd = action as import('../types/effects').RevealBothDeckTopsAction;
      const myTopRB = ctx.ownerState.deck[0];
      const opTopRB = ctx.otherState.deck[0];
      if (!myTopRB || !opTopRB) return done(addLog(ctx, '両者公開：どちらかのデッキが空'));
      const hasBurstRB = (n: string) => {
        const c = ctx.cardMap.get(getCardNum(n));
        return !!c?.BurstText && c.BurstText !== '-';
      };
      const nameRB = (n: string) => ctx.cardMap.get(getCardNum(n))?.CardName ?? n;
      const rotated: ExecCtx = {
        ...ctx,
        ownerState: { ...ctx.ownerState, deck: [...ctx.ownerState.deck.slice(1), myTopRB] },
        otherState: { ...ctx.otherState, deck: [...ctx.otherState.deck.slice(1), opTopRB] },
      };
      const matchRB = hasBurstRB(myTopRB) === hasBurstRB(opTopRB);
      const loggedRB = addLog(rotated,
        `両者がデッキの一番上を公開（あなた: ${nameRB(myTopRB)}${hasBurstRB(myTopRB) ? '/LBあり' : '/LBなし'}・`
        + `対戦相手: ${nameRB(opTopRB)}${hasBurstRB(opTopRB) ? '/LBあり' : '/LBなし'}）→ ${matchRB ? '一致' : '不一致'}`);
      return matchRB ? executeAction(rbd.matchAction, loggedRB) : done(loggedRB);
    }
    case 'DECLARE_DECK_TOP_ICON': {
      // 「対戦相手はあなたのデッキの一番上のカードが《X アイコン》を持つか持たないかを宣言する。
      //   公開する。宣言が外れた場合、〈帰結〉」（§6.4 O-4）。
      // ⚠宣言するのは**相手**＝コスト無しの相手応答 CHOOSE（`costlessOpponentChoice` が無いと
      //   支払いフローへ流れて「エナ不足」で無言に潰れる）。
      const ddt = action as import('../types/effects').DeclareDeckTopIconAction;
      const deckStateDDT = ownerState(ddt.deckOwner, ctx);
      if (deckStateDDT.deck.length === 0) return done(addLog(ctx, 'デッキが空で宣言できない'));
      const mkOptDDT = (declaredHas: boolean) => ({
        id: `ddt_${declaredHas ? 'has' : 'not'}`,
        label: `《${ddt.icon}アイコン》を${declaredHas ? '持つ' : '持たない'}と宣言`,
        action: { type: 'STUB', id: 'INTERNAL_DECLARE_DECK_TOP_ICON',
          value: declaredHas ? 1 : 0, deckTopIcon: { icon: ddt.icon, deckOwner: ddt.deckOwner, onWrongAction: ddt.onWrongAction },
        } as unknown as EffectAction,
        available: true,
      });
      return needsInteraction(addLog(ctx, `対戦相手がデッキの一番上の《${ddt.icon}アイコン》の有無を宣言`), {
        type: 'CHOOSE', options: [mkOptDDT(true), mkOptDDT(false)], count: 1,
        opponentResponds: true, costlessOpponentChoice: true,
      });
    }
    case 'DECLARE_CARD_NAME_LOCK': {
      // 「カード名1つを宣言する。〈期間〉、その名前（以外）の〈種別〉を使用できない」（§6.4 O-3）。
      const dcl = action as import('../types/effects').DeclareCardNameLockAction;
      const declarerSt = ownerState(dcl.declarer, ctx);
      const targetSt = ownerState(dcl.lockedPlayer, ctx);
      // ⚠候補は**宣言者が実際に知りうる領域**からしか作らない（隠された手札／デッキは覗かない）。
      //   blacklist＝封じる相手の公開領域／whitelist＝宣言者自身のルリグデッキ。
      const poolDCL = dcl.mode === 'whitelist'
        ? declarerSt.lrig_deck
        : [...targetSt.trash, ...targetSt.energy, ...targetSt.lrig_deck];
      const namesDCL = [...new Set(poolDCL
        .map(cn => ctx.cardMap.get(getCardNum(cn)))
        .filter(c => (c?.Type ?? '').startsWith(dcl.cardType))
        .map(c => c!.CardName)
        .filter((n): n is string => !!n))];
      if (namesDCL.length === 0) {
        return done(addLog(ctx, `宣言できる${dcl.cardType}のカード名が無い`));
      }
      const applyDCL: EffectAction = { type: 'STUB', id: 'INTERNAL_APPLY_CARD_NAME_LOCK',
        cardNameLock: { lockedPlayer: dcl.lockedPlayer, mode: dcl.mode, until: dcl.until } } as unknown as EffectAction;
      const optsDCL = namesDCL.slice(0, 8).map(name => ({
        id: `dcl_${name}`,
        label: name,
        action: { ...(applyDCL as StubAction), value: name } as unknown as EffectAction,
        available: true,
      }));
      // ⚠相手が宣言する形は**コストの無い相手応答**＝`costlessOpponentChoice` を立てないと
      //   支払いフロー（`resumeOpponentPayOptional`）へ流れて「エナ不足」で無言に潰れる。
      const oppDeclares = dcl.declarer === 'opponent';
      return needsInteraction(
        addLog(ctx, `${oppDeclares ? '対戦相手が' : ''}${dcl.cardType}のカード名を宣言`),
        { type: 'CHOOSE', options: optsDCL, count: 1,
          ...(oppDeclares ? { opponentResponds: true, costlessOpponentChoice: true } : {}) });
    }
    case 'GAIN_LRIG_TYPE': {
      // 「〈期間〉、あなたのセンタールリグは対戦相手のセンタールリグのルリグタイプを追加で得る」（§6.4 O-3）。
      // ⚠**タイプ名はここで焼き込む**（判定地点＝グロウ候補／使用制限からは相手の state が見えない）。
      const glt = action as import('../types/effects').GainLrigTypeAction;
      const gltOwner: Owner = glt.owner === 'opponent' ? 'opponent' : 'self';
      const srcLrigGLT = (gltOwner === 'self' ? ctx.otherState : ctx.ownerState).field.lrig.at(-1);
      const gainedGLT = srcLrigGLT ? (ctx.cardMap.get(getCardNum(srcLrigGLT))?.CardClass ?? '') : '';
      const typesGLT = gainedGLT.split(/[/／]/).map(s => s.trim()).filter(Boolean);
      if (typesGLT.length === 0) return done(addLog(ctx, 'ルリグタイプ追加：対戦相手のセンタールリグが無い'));
      const stGLT = ownerState(gltOwner, ctx);
      // 「このゲームの間」＝恒久側へ積む（`ALL_CENTER_LRIG_GAIN_TYPE_GAME_WIDE` と同じ器）。
      // ⚠🔴`WDK17-001-E2` は【起】なのに CONTINUOUS 専用の `STUB{INHERIT_OPP_LRIG_TYPE}` へ落ちており、
      //   `collectLrigNameAliases` が CONTINUOUS しか走査しないため**恒久 no-op** だった（続き498）。
      if (glt.turns === 'GAME') {
        const permGLT = stGLT.lrig_gained_types ?? [];
        const addPerm = typesGLT.filter(t => !permGLT.includes(t));
        if (addPerm.length === 0) return done(addLog(ctx, `ルリグタイプ追加：既に＜${typesGLT.join('/')}＞を得ている`));
        return done(addLog(setOwnerState(gltOwner, {
          ...stGLT, lrig_gained_types: [...permGLT, ...addPerm],
        }, ctx), `このゲームの間、センタールリグが＜${addPerm.join('/')}＞を追加で得た`));
      }
      const prevGLT = stGLT.lrig_gained_types_timed ?? [];
      const addGLT = typesGLT
        .filter(t => !prevGLT.some(p => p.lrigType === t))
        .map(t => ({ lrigType: t, turnsRemaining: Math.max(1, typeof glt.turns === 'number' ? glt.turns : 1) }));
      if (addGLT.length === 0) return done(addLog(ctx, `ルリグタイプ追加：既に＜${typesGLT.join('/')}＞を得ている`));
      return done(addLog(setOwnerState(gltOwner, {
        ...stGLT, lrig_gained_types_timed: [...prevGLT, ...addGLT],
      }, ctx), `センタールリグが＜${addGLT.map(a => a.lrigType).join('/')}＞を追加で得た`));
    }
    case 'FIELD_SIGNI_TO_CHECK_ZONE': {
      // 「あなたのすべての〈条件〉のシグニをチェックゾーンに置く。その後、それらを場に出す」（§6.4 O-3）。
      // 🔑チェックゾーンは**経由地**なので往復を1アクションに畳む（型コメント参照）。意味は
      //   「場を離れて出直す」＝アップした新しいシグニとして場に出る＝アタック済みの記録も落ちる。
      // ⚠`lastProcessedCards` に載せる＝呼び出し側（BattleScreen）がここから【出】を発火する
      //   （`ADD_TO_FIELD` と同じ受け渡し）。
      const fsc = action as import('../types/effects').FieldSigniToCheckZoneAction;
      const fscOwner: Owner = (fsc.target?.owner === 'opponent') ? 'opponent' : 'self';
      const fscState = ownerState(fscOwner, ctx);
      const zonesFSC = [0, 1, 2].filter(zi => {
        const top = fscState.field.signi[zi]?.at(-1);
        if (!top) return false;
        return !fsc.target?.filter || matchesFilter(ctx.cardMap.get(getCardNum(top)), fsc.target.filter);
      });
      if (zonesFSC.length === 0) return done(addLog(ctx, 'チェックゾーンに置くシグニなし'));
      const topsFSC = zonesFSC.map(zi => fscState.field.signi[zi]!.at(-1)!);
      const downFSC = [...(fscState.field.signi_down ?? [false, false, false])];
      const frozenFSC = [...(fscState.field.signi_frozen ?? [false, false, false])];
      for (const zi of zonesFSC) { downFSC[zi] = false; frozenFSC[zi] = false; }
      const newFSC: PlayerState = {
        ...fscState,
        field: { ...fscState.field, signi_down: downFSC, signi_frozen: frozenFSC },
        // 場を離れて出直すので「このターンにアタックした」記録は落ちる（＝再びアタックできる）。
        attacked_signi_ids: (fscState.attacked_signi_ids ?? []).filter(id => !topsFSC.includes(id)),
      };
      const namesFSC = topsFSC.map(n => ctx.cardMap.get(getCardNum(n))?.CardName ?? n).join('・');
      return done({
        ...addLog(setOwnerState(fscOwner, newFSC, ctx),
          `${namesFSC}をチェックゾーンに置き、場に出し直す`),
        lastProcessedCards: [...(ctx.lastProcessedCards ?? []), ...topsFSC],
      });
    }
    case 'RETURN_FACEDOWN_LRIG_ZONE_TO_HAND': {
      // 「そのカードを手札に加える」＝裏向きでルリグゾーンに置いたカードを手札へ（§6.4 O-3）。
      // ⚠遅延（`DELAY_TO_NEXT_OPP_TURN_END` / `INSTALL_DELAYED_TRIGGER`）を跨いで発火するので、
      //   参照先は `lastProcessedCards` ではなく **state に残っている `facedown_lrig_zone_cards`** を読む。
      const rfl = action as import('../types/effects').ReturnFacedownLrigZoneToHandAction;
      const rflOwner: Owner = rfl.owner ?? 'self';
      const rflState = ownerState(rflOwner, ctx);
      const backRFL = rflState.facedown_lrig_zone_cards ?? [];
      if (backRFL.length === 0) return done(addLog(ctx, 'ルリグゾーンに裏向きのカードが無い'));
      return done({
        ...addLog(setOwnerState(rflOwner, {
          ...rflState,
          facedown_lrig_zone_cards: undefined,
          hand: [...rflState.hand, ...backRFL],
        }, ctx), `裏向きのカード${backRFL.length}枚を${rflOwner === 'self' ? 'あなた' : '対戦相手'}の手札へ`),
        lastProcessedCards: backRFL,
      });
    }
    case 'REVEAL_FACEDOWN_LRIG_ZONE': {
      // 「そのカードを表向きにしてトラッシュに置き、」＝裏向きカードを公開してトラッシュへ。
      // ⚠**`lastProcessedCards` に載せる**＝後続の「そのカードと同じレベルの〜」が
      //   既存の `levelEqLastProcessed` / `levelFromLastProcessed` でそのまま解ける。
      const facedown = ctx.ownerState.facedown_lrig_zone_cards ?? [];
      if (facedown.length === 0) return done(addLog(ctx, '裏向きのカードが無い'));
      return done({
        ...addLog({
          ...ctx,
          ownerState: {
            ...ctx.ownerState,
            facedown_lrig_zone_cards: undefined,
            trash: [...ctx.ownerState.trash, ...facedown],
          },
        }, `${facedown.map(n => ctx.cardMap.get(getCardNum(n))?.CardName ?? n).join('・')}を表向きにしてトラッシュへ`),
        lastProcessedCards: facedown,
      });
    }
    case 'PREVENT_NEXT_DAMAGE': {
      const pnd = action as import('../types/effects').PreventNextDamageAction;
      const restricted = !!(pnd.damageSource || pnd.sourceLevelLtLastProcessed || pnd.millAtTurnEndPerPrevented);
      const refNum = ctx.lastProcessedCards?.[0];
      const refLevel = refNum ? parseInt(ctx.cardMap.get(getCardNum(refNum))?.Level ?? '', 10) : NaN;
      const reservation = restricted ? {
        count: pnd.count ?? 1,
        ...(pnd.damageSource ? { damageSource: pnd.damageSource } : {}),
        ...(pnd.sourceLevelLtLastProcessed && !isNaN(refLevel) ? { sourceLevelLt: refLevel } : {}),
        ...(pnd.millAtTurnEndPerPrevented ? { millAtTurnEndPerPrevented: pnd.millAtTurnEndPerPrevented } : {}),
      } : undefined;
      const newOwner = restricted
        ? { ...ctx.ownerState, prevent_next_damage_reservations: [...(ctx.ownerState.prevent_next_damage_reservations ?? []), reservation!] }
        : { ...ctx.ownerState, prevent_next_damage: (ctx.ownerState.prevent_next_damage ?? 0) + (pnd.count ?? 1) };
      return done(addLog({ ...ctx, ownerState: newOwner }, `このターン、次の${pnd.count ?? 1}回のダメージを無効`));
    }
    case 'PREVENT_DAMAGE': {
      // 期間中のダメージ無効ウィンドウを張る（回数無制限）。消費は BattleScreen の crashOneLife／ルリグアタック応答。
      const pd = action as import('../types/effects').PreventDamageAction;
      const scopePD = pd.scope ?? (pd.until === 'NEXT_TURN' ? 'LRIG' : 'ALL');
      // §6.4 O-3 続き492: 「次のあなたのメインフェイズまで」はターン境界を跨ぐ（相手のターンを丸ごと含む）。
      const expiresPD = pd.untilNextMainPhase ? 'MY_NEXT_MAIN_PHASE'
        : pd.until === 'NEXT_TURN' ? 'NEXT_TURN_START'
          : pd.until === 'END_OF_ATTACK' ? 'END_OF_ATTACK' : 'MY_TURN_END';
      const tgtOwnerPD: Owner = pd.owner === 'opponent' ? 'opponent' : 'self';
      const sPD = ownerState(tgtOwnerPD, ctx);
      const newSPD: PlayerState = {
        ...sPD,
        prevent_damage_windows: [...(sPD.prevent_damage_windows ?? []), { scope: scopePD, expires: expiresPD }],
      };
      const periodJaPD = pd.untilNextMainPhase ? '次のあなたのメインフェイズまで'
        : pd.until === 'NEXT_TURN' ? '次のターンの間'
          : pd.until === 'END_OF_ATTACK' ? 'そのアタックで' : 'このターン';
      return done(addLog(setOwnerState(tgtOwnerPD, newSPD, ctx),
        `${periodJaPD}、${tgtOwnerPD === 'self' ? 'あなた' : '対戦相手'}は${scopePD === 'LRIG' ? 'ルリグアタックによるダメージ' : 'ダメージ'}を受けない`));
    }
    case 'ZONE_MOVE_IMMUNITY': {
      // 「（このターンと次のターンの間、）対戦相手の効果によって〈ゾーン〉のカードは移動しない」
      // （§6.4 O-3 続き493）。⚠**ターン数カウントダウン式**（`signi_deploy_bans` と同じ）＝
      //   減算は `clearTurnEndScopedState` の1点だけ。旧実装は失効地点が無く永続していた。
      const zmi = action as import('../types/effects').ZoneMoveImmunityAction;
      const tgtOwnerZMI: Owner = zmi.owner === 'opponent' ? 'opponent' : 'self';
      const sZMI = ownerState(tgtOwnerZMI, ctx);
      const newZMI: PlayerState = {
        ...sZMI,
        opp_move_immunity: [...(sZMI.opp_move_immunity ?? []), { zones: zmi.zones, turnsRemaining: zmi.turns }],
      };
      const zonesJaZMI = zmi.zones.map(z => (z === 'hand' ? '手札' : 'エナゾーン')).join('と');
      return done(addLog(setOwnerState(tgtOwnerZMI, newZMI, ctx),
        `${zmi.turns >= 2 ? 'このターンと次のターンの間' : 'このターン'}、対戦相手の効果によって${zonesJaZMI}のカードは移動しない`));
    }
    case 'SET_LRIG_BASE_LIMIT': {
      // 「（次のあなたのメインフェイズまで、）このルリグの基本リミットは N になる」（§6.4 O-3 続き492）。
      // ⚠**置換**なので `lrig_limit_mod`（加算）へ書かない＝`computeEffectiveLrigLimit` の basicOverride 層。
      const sbl = action as import('../types/effects').SetLrigBaseLimitAction;
      const tgtOwnerSBL: Owner = sbl.owner === 'opponent' ? 'opponent' : 'self';
      const sSBL = ownerState(tgtOwnerSBL, ctx);
      return done(addLog(
        setOwnerState(tgtOwnerSBL, { ...sSBL, lrig_base_limit_override: sbl.value }, ctx),
        `${sbl.untilNextMainPhase ? '次のあなたのメインフェイズまで、' : ''}${tgtOwnerSBL === 'self' ? 'あなた' : '対戦相手'}のルリグの基本リミットは${sbl.value}になる`));
    }
    case 'RESERVE_DRAW_PHASE_REPLACEMENT': {
      // 「あなたが次のあなたのドローフェイズにカードを N 枚引く場合、代わりに M 枚引く」（§6.4 O-3 続き492）。
      // 読みは `applyLrigDrawPhaseReplacement` 1本／失効は `clearMainPhaseScopedState` 1点。
      const rdp = action as import('../types/effects').ReserveDrawPhaseReplacementAction;
      const tgtOwnerRDP: Owner = rdp.owner === 'opponent' ? 'opponent' : 'self';
      const sRDP = ownerState(tgtOwnerRDP, ctx);
      return done(addLog(
        setOwnerState(tgtOwnerRDP, { ...sRDP, draw_phase_replacement: { fromCount: rdp.fromCount, toCount: rdp.toCount } }, ctx),
        `次のドローフェイズに${rdp.fromCount}枚引く場合、代わりに${rdp.toCount}枚引く`));
    }
    case 'REPLACE_NEXT_DAMAGE_WITH_MILL': {
      // 「次にダメージを受ける場合、代わりにデッキ上N枚をトラッシュ」の予約
      // （消費は `screens/battle/lifeCrashReplace.ts` の funnel＝crashOneLife／ルリグアタック応答の2地点）。
      // ⚠**`damageSource` を落とさない**＝従来は宣言していたのに捨てており、「シグニによって」限定の札
      //   （`WX25-P1-010`）が**ルリグアタックのダメージまで置換**していた。
      const rdm = action as import('../types/effects').ReplaceNextDamageWithMillAction;
      const decl: import('../types').LifeCrashReplacement = {
        kind: 'mill', count: rdm.millCount, once: true,
        ...(rdm.damageSource ? { damageSource: rdm.damageSource } : {}),
      };
      const newOwner = {
        ...ctx.ownerState,
        life_crash_replacements: [...(ctx.ownerState.life_crash_replacements ?? []), decl],
      };
      return done(addLog({ ...ctx, ownerState: newOwner }, `このターン、次のダメージを代わりにデッキ上${rdm.millCount}枚トラッシュで置き換え（予約）`));
    }
    case 'LIFE_CRASH_REPLACE': {
      // 「あなたのライフクロスがクラッシュされる場合、代わりに〜する」の宣言（§6.4）。
      // ⚠**その場で実行してはいけない**＝従来 `WX24-P4-009` は自分のデッキを即10枚削り、
      //   `WX25-P3-004` はタダで相手のライフを割っていた。
      const lcr = action as import('../types/effects').LifeCrashReplaceAction;
      const declared: import('../types').LifeCrashReplacement = {
        kind: lcr.replaceKind, count: lcr.count,
        ...(lcr.damageSource ? { damageSource: lcr.damageSource } : {}),
        ...(lcr.byAttack ? { byAttack: true } : {}),
        ...(lcr.once ? { once: true } : {}),
        ...(lcr.optional ? { optional: true } : {}),
      };
      return done(addLog({
        ...ctx,
        ownerState: {
          ...ctx.ownerState,
          life_crash_replacements: [...(ctx.ownerState.life_crash_replacements ?? []), declared],
        },
      }, `このターン、あなたのライフクロスのクラッシュを置換（${declared.kind === 'mill' ? `デッキ上${declared.count}枚トラッシュ` : `対戦相手のライフクロス${declared.count}枚クラッシュ`}）`));
    }
    case 'ENERGY_CHARGE_BY_FIELD_COUNT':   return execEnergyChargeByFieldCount(action as import('../types/effects').EnergyChargeByFieldCountAction, ctx);
    case 'POWER_MODIFY_BY_TARGET_LEVEL':   return execPowerModifyByTargetLevel(action as PowerModifyByTargetLevelAction, ctx);
    case 'POWER_MODIFY_BY_SOURCE':         return execPowerModifyBySource(action as import('../types/effects').PowerModifyBySourceAction, ctx);
    case 'POWER_MODIFY_PER_TRASHED_LEVEL': return execPowerModifyPerTrashedLevel(action as import('../types/effects').PowerModifyPerTrashedLevelAction, ctx);
    case 'POWER_MODIFY_PER_CHARM':         return execPowerModifyPerCharm(action as import('../types/effects').PowerModifyPerCharmAction, ctx);
    case 'REVEAL_UNTIL_BANISH_SAME_LEVEL': return execRevealUntilBanishSameLevel(action as import('../types/effects').RevealUntilBanishSameLevelAction, ctx);
    case 'REVEAL_UNTIL':                   return execRevealUntil(action as import('../types/effects').RevealUntilAction, ctx);
    case 'REVEAL_UNTIL_TO_HAND':           return execRevealUntilToHand(action as import('../types/effects').RevealUntilToHandAction, ctx);
    case 'REVEAL_UNTIL_TO_FIELD':          return execRevealUntilToField(action as import('../types/effects').RevealUntilToFieldAction, ctx);
    case 'GAIN_BOND':               return execGainBond(action as import('../types/effects').GainBondAction, ctx);
    case 'MILL':                    return execMill(action as MILLAction, ctx);
    case 'STUB': {
      // §6.4 離場置換の対話化（続き430）の内部 STUB は**このファイル内**で処理する
      //   （置換の列挙・適用と同じ場所に閉じておく／`execStubPart*` は effectExecutor を
      //     import できない＝循環参照になるため）。
      const stub = action as StubAction;
      if (stub.id === 'INTERNAL_LEAVE_SUB_ASK') return execLeaveSubAsk(stub, ctx);
      if (stub.id === 'INTERNAL_LEAVE_SUB_DECIDE') return execLeaveSubDecide(stub, ctx);
      if (stub.id === 'INTERNAL_LEAVE_SUB_NOOP') return done(ctx);
      // 「〜1枚**まで**」の CHOOSE に出す「何もしない」枝の受け皿（engine 内部専用・parser は生成しない）。
      if (stub.id === 'INTERNAL_NOOP') return done(ctx);
      if (stub.id === 'INTERNAL_LEAVE_SUB_RESUME_SELECT') {
        const r = (stub as unknown as { leaveSubResume?: { selected: string[]; pending: PendingInteractionDef & { type: 'SELECT_TARGET' } } }).leaveSubResume;
        return r ? resumeSelectTarget(r.selected, r.pending, ctx) : done(ctx);
      }
      return execStub(stub, ctx, executeAction);
    }
    case 'UNKNOWN':                 return done(addLog(ctx, `[UNKNOWN: ${(action as {raw:string}).raw?.slice(0, 40) ?? ''}]`));
    default:                        return done(ctx);
  }
}

export function executeEffect(effect: CardEffect, ctx: ExecCtx): ExecResult {
  // Cards in an energy zone with this turn-wide marker have no abilities.
  // The source is still in energy for 【出】/energy-zone triggered effects.
  if (ctx.ownerState.energy_colorless_ability_loss_this_turn
      && ctx.sourceCardNum
      && ctx.ownerState.energy.includes(ctx.sourceCardNum)) {
    return done(addLog(ctx, 'エナゾーンのカードは能力を失っているため効果は発動しない'));
  }
  // 「ホログラフの効果によって〜する場合、代わりに」（WX16-004-E1）の発動元判定。
  // 判定は **データ側の CardEffect.holograph**（parser がコスト表記「ホログラフ」から立て、
  // ホログラフ効果が付与した能力へも伝播させる）で行う。effectId のハードコード表は使わない
  // ＝共有関数にカード固有テーブルを埋めると parser の採番変更で静かに死ぬ（CODEX_GUIDE §5-18）。
  const holographEffect = !!effect.holograph;
  // §6.4 O-20 の source 配線＝「いま解決中の効果がカードのどの能力ブロックから来たか」を
  // ハンドラが引けるようにする（`sourceAbilityText(ctx)`）。呼び出し側が既に入れていれば尊重する。
  const idCtx = ctx.sourceEffectId ? ctx : { ...ctx, sourceEffectId: effect.effectId };
  const markedCtx = holographEffect
    ? { ...idCtx, ownerState: { ...idCtx.ownerState, is_holograph_this_effect: true } }
    : idCtx;
  const result = executeAction(effect.action, markedCtx);
  if (!result.done || !holographEffect) return result;
  return { ...result, ownerState: { ...result.ownerState, is_holograph_this_effect: undefined } };
}

// デッキが0枚（かつトラッシュにカードあり）のプレイヤーをリフレッシュする。
// ルール：メインデッキが0枚になったらトラッシュをシャッフルして新デッキとし、
// ライフクロスがあれば一番上を1枚トラッシュへ（バーストなし）。トラッシュが空ならリフレッシュしない（保留）。
// 場に PREVENT_LIFE_REFRESH_TRASH があればライフをトラッシュに置かない。
function refreshPlayerIfDeckEmpty(
  st: PlayerState,
  cardMap: Map<string, import('../types').CardData>,
): { state: PlayerState; refreshed: boolean } {
  if (st.deck.length > 0 || st.trash.length === 0) return { state: st, refreshed: false };
  const preventLifeToTrash = st.field.signi.some(stack => {
    const top = stack?.at(-1);
    return !!top && (cardMap.get(top)?.effects ?? []).some(e =>
      e.effectType === 'CONTINUOUS'
      && e.action?.type === 'STUB'
      && (e.action as import('../types/effects').StubAction).id === 'PREVENT_LIFE_REFRESH_TRASH');
  });
  return {
    state: applyRefreshState(st, preventLifeToTrash),
    refreshed: true,
  };
}

// 効果解決完了時（result.done）に、デッキが0枚になった両プレイヤーをリフレッシュする。
// 戻り値に owner/other がリフレッシュされたかを含める（ターンプレイヤーの2回目→ターン終了の判定用）。
export function applyRefreshOnDone(
  result: ExecResult,
  cardMap: Map<string, import('../types').CardData>,
): ExecResult & { ownerRefreshed?: boolean; otherRefreshed?: boolean } {
  if (!result.done) return result;
  // 傀儡の離場回収（効果で場を離れた傀儡を持ち主のトラッシュへ。WDK17-007）
  const swept = sweepPuppets(result.ownerState, result.otherState);
  if (swept.a !== result.ownerState || swept.b !== result.otherState) {
    result = { ...result, ownerState: swept.a, otherState: swept.b };
  }
  const o = refreshPlayerIfDeckEmpty(result.ownerState, cardMap);
  const t = refreshPlayerIfDeckEmpty(result.otherState, cardMap);
  if (!o.refreshed && !t.refreshed) return result;
  const logs = [...result.logs];
  if (o.refreshed) logs.push('リフレッシュ（デッキを再構築）');
  if (t.refreshed) logs.push('相手リフレッシュ（デッキを再構築）');
  return { ...result, ownerState: o.state, otherState: t.state, logs, ownerRefreshed: o.refreshed, otherRefreshed: t.refreshed };
}

// ===== インタラクション解決（UIから呼ばれる） =====

// SELECT_TARGET: selected[] export
export function resumeSelectTarget(
  selected: string[],
  pending: PendingInteractionDef & { type: 'SELECT_TARGET' },
  ctx: ExecCtx,
): ExecResult {
  // UI外から過剰な件数が渡っても、宣言された最大選択数を超えて処理しない。
  selected = selected.slice(0, pending.count);
  // totalPowerMax: 選択カードの実効パワー合計が上限を超えないよう保証（超過分は順に切り捨て）
  if (pending.totalPowerMax !== undefined) {
    const powers = pending.candidatePowers ?? {};
    let sum = 0;
    selected = selected.filter(n => {
      const p = powers[n] ?? 0;
      if (sum + p > pending.totalPowerMax!) return false;
      sum += p;
      return true;
    });
  }
  // totalLevelMax: 選択カードのレベル合計が上限を超えないよう保証（超過分は順に切り捨て）
  if (pending.totalLevelMax !== undefined) {
    const levels = pending.candidateLevels ?? {};
    let lsum = 0;
    selected = selected.filter(n => {
      const l = levels[n] ?? 0;
      if (lsum + l > pending.totalLevelMax!) return false;
      lsum += l;
      return true;
    });
  }
  if (pending.selectionConstraint) {
    const accepted: string[] = [];
    for (const n of selected) {
      if (canAddToSelection(accepted, n, pending.selectionConstraint, ctx.cardMap)) accepted.push(n);
    }
    selected = accepted;
    // exact は prefix 判定（候補追加）と最終判定を分ける。N-1/N+1 は1枚も処理しない。
    if (!satisfiesSelectionConstraint(selected, pending.selectionConstraint, ctx.cardMap)) selected = [];
  }
  // 選択されたカードに thenAction を個別適用
  let cur = ctx;
  // ADD_TO_FIELD（場に出す）: 配置先が空きゾーン2つ以上だと applyDirectAction が SELECT_SIGNI_ZONE で
  // 中断する。個別 applyDirectAction ループで受けると `if (!result.done) return result;` が外側の
  // pending.continuation（後続の GRANT_KEYWORD / CONDITIONAL 等）を握り潰し無言 no-op 化していたため
  // （Opusタスク12(xiv)）、resumeSearch と同型に execPlaceSigniOnField 経由でチェーン配置し、外側
  // continuation を afterAction として全配置後に実行する（複数枚配置でも消失しない）。
  if (pending.thenAction.type === 'ADD_TO_FIELD' && selected.length > 0) {
    cur = { ...cur, lastProcessedCards: selected };
    const placeAll: import('../types/effects').PlaceSigniOnFieldAction = {
      type: 'PLACE_SIGNI_ON_FIELD',
      owner: (pending.thenAction as AddToFieldAction).owner,
      cardNums: selected,
      ...((pending.thenAction as AddToFieldAction).asDown ? { asDown: true } : {}),
      ...(pending.continuation ? { afterAction: pending.continuation } : {}),
    };
    return execPlaceSigniOnField(placeAll, cur);
  }
  if (pending.thenAction.type === 'STUB' && (pending.thenAction as StubAction).id === 'INTERNAL_TRASH_UNDER_SIGNI') {
    const signi = cur.ownerState.field.signi.map(stack => stack ? stack.filter(n => !selected.includes(n)) : stack) as (string[] | null)[];
    cur = addLog({
      ...cur,
      ownerState: { ...cur.ownerState, trash: [...cur.ownerState.trash, ...selected], field: { ...cur.ownerState.field, signi } },
      lastProcessedCards: selected,
    }, `シグニの下から${selected.length}枚をトラッシュへ`);
    if (pending.continuation) return executeAction(pending.continuation, cur);
    return done(cur);
  }
  // §6.4 O-5: レゾナの複数枚配置＝**選んだ全枚数をまとめて渡す**。
  // ⚠下の per-card ループは**最初の pause で残りを落とす**（ADD_TO_FIELD が特例回避しているのと同じ理由）＝
  //   ゾーン選択を挟む配置を個別適用すると2枚目以降が無言で消える（実測で1枚しか出なかった）。
  //   STUB 側が `value` のキューで自己チェーンするので、ここでは1回だけ実行する。
  if (pending.thenAction.type === 'STUB'
      && (pending.thenAction as StubAction).id === 'INTERNAL_PLACE_SUMMONED_RESONAS') {
    if (selected.length === 0) {
      if (pending.continuation) return executeAction(pending.continuation, cur);
      return done(cur);
    }
    const queued = { ...(pending.thenAction as StubAction), value: JSON.stringify(selected) } as EffectAction;
    const chained = pending.continuation
      ? ({ type: 'SEQUENCE', steps: [queued, pending.continuation] } as SequenceAction)
      : queued;
    return executeAction(chained, { ...cur, lastProcessedCards: selected });
  }
  // O-56: 手札などの SELECT_TARGET から選んだ複数枚を、既存の出所非依存トラップ設置へ1枚ずつ渡す。
  // 汎用 per-card ループは最初のゾーン選択で pause すると2枚目以降を落とすため、SEARCH の then:'trap'
  // と同じく SEQUENCE 化して外側 continuation を保つ。
  // 🆕§5.3 `O-87`＝`TRAP_TO_HAND` の適用は**選択全体を1回で**処理する専用枝。
  // ⚠汎用枝（下の `applyDirectAction` ループ）に流すと **最後に `lastProcessedCards = selected` で
  //   上書きされる**ので、「この方法で手札に加えた**【トラップ】**1つにつき」の枚数が
  //   同時に戻した＜トリック＞のシグニで水増しされる（＝設置回数が増える過剰実行）。
  if (pending.thenAction.type === 'STUB'
      && (pending.thenAction as StubAction).id === 'INTERNAL_TTH_APPLY') {
    const applied = executeAction(pending.thenAction, { ...cur, lastProcessedCards: selected });
    if (!applied.done) return applied;
    const next: ExecCtx = {
      ...cur, ownerState: applied.ownerState, otherState: applied.otherState, logs: applied.logs,
      lastProcessedCards: applied.lastProcessedCards,
    };
    if (pending.continuation) return executeAction(pending.continuation, next);
    return done(next);
  }
  if (pending.thenAction.type === 'STUB'
      && (pending.thenAction as StubAction).id === 'INTERNAL_ASK_TRAP_ZONE') {
    const trapSteps: EffectAction[] = selected.map(cardNum => ({
      type: 'STUB', id: 'INTERNAL_ASK_TRAP_ZONE', value: cardNum,
    } as StubAction));
    if (pending.continuation) trapSteps.push(pending.continuation);
    if (trapSteps.length === 0) return done(cur);
    return executeAction(
      trapSteps.length === 1 ? trapSteps[0] : { type: 'SEQUENCE', steps: trapSteps } as SequenceAction,
      { ...cur, lastProcessedCards: selected },
    );
  }
  if (pending.thenAction.type === 'STUB' && (pending.thenAction as StubAction).id === 'INTERNAL_MILL_BOTTOM_DISTINCT4_BANISH') {
    const retainedTarget = selected[0];
    if (!retainedTarget) return done(cur);
    const milled = execMill({ type: 'MILL', owner: 'self', count: 4, fromBottom: true }, cur);
    if (!milled.done) return milled;
    cur = { ...cur, ownerState: milled.ownerState, otherState: milled.otherState, logs: milled.logs, lastProcessedCards: milled.lastProcessedCards };
    if (evalCondition({ type: 'TRASHED_DISTINCT_LEVELS_GTE', count: 4 }, cur)) {
      const banished = applyDirectAction({ type: 'BANISH', target: { type: 'SIGNI', owner: 'opponent', count: 1 } }, retainedTarget, cur);
      if (!banished.done) return banished;
      cur = { ...cur, ownerState: banished.ownerState, otherState: banished.otherState, logs: banished.logs, lastProcessedCards: milled.lastProcessedCards };
    }
    if (pending.continuation) return executeAction(pending.continuation, cur);
    return done(cur);
  }
  // §6.4 離場置換の対話化（続き430）＝**移動を1つも適用する前に**被害側へまとめて問う。
  // ⚠この per-card ループは pause すると残りの選択を落とす（ADD_TO_FIELD 等が個別に特例回避して
  //   いるのがその証拠）。だから「ループの途中で聞く」のではなく、**ここで全部聞いてから**
  //   同じ引数で再入する（決定は PlayerState に載るので pause を跨いで残り、再入時は問いが出ない）。
  {
    const ask = leaveSubstituteAskQueue(pending.thenAction.type, selected, cur);
    if (ask.queue.length > 0) {
      return executeAction(makeLeaveSubAsk(ask.queue, 'opponent', {
        type: 'STUB', id: 'INTERNAL_LEAVE_SUB_RESUME_SELECT',
        leaveSubResume: { selected, pending },
      } as unknown as EffectAction, { isBanish: ask.isBanish }), cur);
    }
  }
  // 複数枚を「デッキに加えてシャッフル」は全カードを加えた後に1回だけシャッフルする。
  // per-card applyDirectAction に shuffle:true を渡すと、同じ1回の選択に対してシャッフルが枚数分発生する。
  const batchShuffleTransfer = pending.thenAction.type === 'TRANSFER_TO_DECK'
    && (pending.thenAction as TransferToDeckAction).shuffle
    && (pending.thenAction as TransferToDeckAction).destination !== 'lrig_deck';
  const perCardAction: EffectAction = batchShuffleTransfer
    ? { ...(pending.thenAction as TransferToDeckAction), shuffle: false }
    : pending.thenAction;
  for (const cardNum of selected) {
    // thenActionを単一カードに適用するため、フィルタなしで直接適用
    const result = applyDirectAction(perCardAction, cardNum, cur);
    if (!result.done) {
      // FIELD_SIGNI_TO_ACCE は「アクセ元→host」の2段選択。外側SEQUENCEの後続
      // （そうした場合のDRAW等）を2段目へ運ぶ。既存actionのresume挙動は変更しない。
      if (pending.thenAction.type === 'FIELD_SIGNI_TO_ACCE' && pending.continuation) {
        const existing = result.pending.continuation;
        return {
          ...result,
          pending: {
            ...result.pending,
            continuation: existing
              ? ({ type: 'SEQUENCE', steps: [existing, pending.continuation] } as SequenceAction)
              : pending.continuation,
          },
        };
      }
      return result;
    }
    cur = { ...cur, ownerState: result.ownerState, otherState: result.otherState, logs: result.logs, fieldTrashCostCards: result.fieldTrashCostCards ?? cur.fieldTrashCostCards, trapActivated: result.trapActivated ?? cur.trapActivated, trapSetOwners: result.trapSetOwners ?? cur.trapSetOwners };
  }
  if (batchShuffleTransfer && selected.length > 0) {
    const shuffled = execShuffleDeck({ type: 'SHUFFLE_DECK', owner: (pending.thenAction as TransferToDeckAction).source.owner as Owner }, cur);
    cur = { ...cur, ownerState: shuffled.ownerState, otherState: shuffled.otherState, logs: shuffled.logs };
  }
  cur = { ...cur, lastProcessedCards: selected };
  // selfTrashCost: 「このシグニを場からトラッシュに置いてもよい。そうした場合、それらをバニッシュする」
  // 対象を1体以上選んだ場合のみ、効果元シグニ自身をコストとしてトラッシュする（WX21-052）
  if (selected.length > 0
      && pending.thenAction.type === 'BANISH'
      && (pending.thenAction as BanishAction).selfTrashCost
      && cur.sourceCardNum
      && cur.ownerState.field.signi.some(s => s?.at(-1) === cur.sourceCardNum)) {
    const selfNum = cur.sourceCardNum;
    const removed = removeFromField(selfNum, cur.ownerState);
    cur = addLog({
      ...cur,
      ownerState: { ...removed, trash: [...removed.trash, selfNum] },
      fieldTrashCostCards: [...(cur.fieldTrashCostCards ?? []), selfNum],
    },
      `${cur.cardMap.get(selfNum)?.CardName ?? selfNum}を場からトラッシュに置く`);
  }
  if (pending.continuation) {
    // 任意選択（してもよい）をスキップした場合、「そうした場合〜」(CONDITIONAL IS_MY_TURN) は実行しない
    const cont = pending.optional && selected.length === 0
      ? stripDidItConditional(pending.continuation)
      : pending.continuation;
    if (cont) return executeAction(cont, cur);
  }
  return done(cur);
}

// 「そうした場合」を表す先頭の CONDITIONAL(IS_MY_TURN) を else 側に置き換える
function stripDidItConditional(action: EffectAction): EffectAction | undefined {
  if (action.type === 'CONDITIONAL' && action.condition.type === 'IS_MY_TURN') {
    return action.else;
  }
  if (action.type === 'SEQUENCE' && action.steps.length > 0) {
    const first = action.steps[0];
    if (first?.type === 'CONDITIONAL' && (first as ConditionalAction).condition.type === 'IS_MY_TURN') {
      const firstElse = (first as ConditionalAction).else;
      const rest = [...(firstElse ? [firstElse] : []), ...action.steps.slice(1)];
      if (rest.length === 0) return undefined;
      return rest.length === 1 ? rest[0] : { type: 'SEQUENCE', steps: rest };
    }
  }
  return action;
}

function isDeckPlacementFromSearch(action: EffectAction): boolean {
  if (action.type === 'TRANSFER_TO_DECK') {
    return (action as TransferToDeckAction).source.type === 'DECK_CARD';
  }
  if (action.type !== 'CHOOSE') return false;
  const choices = (action as ChooseAction).choices ?? [];
  return choices.length > 0 && choices.every(choice => isDeckPlacementFromSearch(choice.action));
}

function bindSearchedDeckCards(action: EffectAction, picked: string[]): EffectAction {
  if (action.type === 'TRANSFER_TO_DECK') {
    const transfer = action as TransferToDeckAction;
    return transfer.source.type === 'DECK_CARD' ? { ...transfer, fixedCardNums: [...picked] } : action;
  }
  if (action.type === 'CHOOSE') {
    const choose = action as ChooseAction;
    return { ...choose, choices: choose.choices.map(choice => ({
      ...choice,
      action: bindSearchedDeckCards(choice.action, picked),
    })) };
  }
  return action;
}

// SEARCH: picked[]
export function resumeSearch(
  picked: string[],
  pending: PendingInteractionDef & { type: 'SEARCH' },
  ctx: ExecCtx,
): ExecResult {
  picked = picked.slice(0, pending.maxPick);
  if (pending.selectionConstraint) {
    const accepted: string[] = [];
    for (const n of picked) {
      if (canAddToSelection(accepted, n, pending.selectionConstraint, ctx.cardMap)) accepted.push(n);
    }
    picked = accepted;
    // 外部応答でも exact/max を再検証し、不正集合は部分採用せず0枚へ倒す。
    if (!satisfiesSelectionConstraint(picked, pending.selectionConstraint, ctx.cardMap)) picked = [];
  }
  let cur = ctx;
  // §6.4 O-2: 公開元デッキ／残り札の行き先の持ち主。既定 'self'＝従来挙動（live の公開系は全件 self）。
  const dOwner: 'self' | 'opponent' = pending.deckOwner ?? 'self';
  const deckState = (c: ExecCtx) => ownerState(dOwner, c);
  // thenAction 欠落データへの防御: ピックの既定義（手札に加える）にフォールバック
  // （REVEAL_AND_PICK の旧不正キー pickTo:'hand' 形＝then 無しで .type 参照クラッシュしていた）
  if (!pending.thenAction) {
    pending = { ...pending, thenAction: { type: 'ADD_TO_HAND', owner: 'self' } as EffectAction };
  }
  if (pending.opponentChoosesPileToTrash) {
    const revealed = pending.revealRemainder?.cards ?? pending.visibleCards;
    const pickedSet = new Set(picked);
    const remainder = revealed.filter(n => !pickedSet.has(n));
    const resolvePile = (trashCards: string[], handCards: string[]): EffectAction => ({
      type: 'STUB',
      id: 'INTERNAL_RESOLVE_PILES',
      pileTrashCards: trashCards,
      pileHandCards: handCards,
    } as StubAction);
    return needsInteraction({ ...cur, lastProcessedCards: picked }, {
      type: 'CHOOSE',
      count: 1,
      opponentResponds: true,
      options: [
        {
          id: 'face_up',
          label: '表向きの束をトラッシュに置く',
          available: true,
          action: resolvePile(picked, remainder),
        },
        {
          id: 'face_down',
          label: '裏向きの束をトラッシュに置く',
          available: true,
          action: resolvePile(remainder, picked),
        },
      ],
      ...(pending.continuation ? { continuation: pending.continuation } : {}),
    });
  }
  // remainder が 'split_top_bottom'（「好きな枚数をデッキの一番下に置き、残りを一番上に戻す」）のときは
  //   **行き先が対話**になる。ここで即座に動かさず、デッキから抜いたうえで分割UI（G168）を
  //   **continuation の先頭に差し込む**＝ピック処理（thenAction／handOrEnergy／ADD_TO_FIELD の各分岐）が
  //   終わったあとに問う形になる。⚠この書き換えは下の早期 return 分岐より**前**に置く必要がある
  //   （それらは pending.continuation を読んで自分のチェーンを組み立てるため）。タスク12(lix)。
  if (pending.revealRemainder?.position === 'split_top_bottom') {
    const rrSplit = pending.revealRemainder;
    const restSplit = rrSplit.cards.filter(n => !picked.includes(n));
    let sSplit = { ...deckState(cur) };
    const deckSplit = [...sSplit.deck];
    const movedSplit: string[] = [];
    for (const cn of restSplit) { const di = deckSplit.indexOf(cn); if (di >= 0) { deckSplit.splice(di, 1); movedSplit.push(cn); } }
    sSplit = { ...sSplit, deck: deckSplit };
    cur = setOwnerState(dOwner, sSplit, cur);
    // ⚠owner を渡さないと分割UI が **効果オーナーのデッキ**へ戻す（deckOwner:'opponent' で複製バグ）。
    const splitStub: EffectAction = { type: 'STUB', id: 'INTERNAL_SPLIT_REVEALED', revealed: movedSplit, owner: dOwner } as StubAction as EffectAction;
    const contSplit: EffectAction = pending.continuation
      ? { type: 'SEQUENCE', steps: [splitStub, pending.continuation] } as SequenceAction
      : splitStub;
    pending = { ...pending, revealRemainder: undefined, continuation: contSplit };
  }
  // revealRemainder: 公開したがピックしなかった全カード（非対象カード含む）を指定場所へ移す（REVEAL_AND_PICK）。
  //   デッキ非スライス設計＝picked も未pick も公開時点でデッキに残っており、ここで未pick分を先に退避する。
  if (pending.revealRemainder) {
    const rr = pending.revealRemainder;
    const rest = rr.cards.filter(n => !picked.includes(n));
    let s = { ...deckState(cur) };
    let deck = [...s.deck];
    const moved: string[] = [];
    for (const cn of rest) { const di = deck.indexOf(cn); if (di >= 0) { deck.splice(di, 1); moved.push(cn); } }
    // shuffle: 「残りをシャッフルしてデッキの一番下に置く」（PR-370-E2 等）＝置く前に順序をランダム化
    const movedOrdered = rr.shuffle ? shuffle([...moved]) : moved;
    if (rr.location === 'deck') deck = rr.position === 'bottom' ? [...deck, ...movedOrdered] : [...movedOrdered, ...deck];
    s = { ...s, deck,
      ...(rr.location === 'trash' ? { trash: [...s.trash, ...moved] } : {}),
      ...(rr.location === 'energy' ? { energy: [...s.energy, ...moved] } : {}) };
    const destJa = rr.location === 'deck' ? (rr.position === 'bottom' ? 'デッキの一番下' : 'デッキの上') : rr.location === 'trash' ? 'トラッシュ' : 'エナゾーン';
    const movedCtx = setOwnerState(dOwner, s, cur);
    cur = moved.length > 0 ? addLog(movedCtx, `残り${moved.length}枚を${destJa}へ`) : movedCtx;
  }
  // 「探す → シャッフル → 探したカードをデッキ上へ」の順序予約。
  // SEARCH の通常契約は thenAction → afterAction だが、この木の形だけは選択札をデッキに残したまま
  // SHUFFLE_DECK を先に実行し、最後に instanceId で top/second を確定する。先に top へ置いてから
  // シャッフルすると選択札が流れるため（LOOK_PICK_CHAIN の _topReserved と同じ「最後に当てる」設計）。
  if (picked.length > 0
      && pending.afterAction?.type === 'SHUFFLE_DECK'
      && isDeckPlacementFromSearch(pending.thenAction)) {
    const shuffled = executeAction(pending.afterAction, { ...cur, lastProcessedCards: picked });
    if (!shuffled.done) return shuffled;
    cur = {
      ...cur,
      ownerState: shuffled.ownerState,
      otherState: shuffled.otherState,
      logs: shuffled.logs,
      lastProcessedCards: picked,
    };
    if (pending.revealPicked) {
      const names = picked.map(n => cur.cardMap.get(getCardNum(n))?.CardName ?? n).join('・');
      cur = addLog(cur, `${names}を公開`);
    }
    if (pending.thenAction.type === 'TRANSFER_TO_DECK') {
      for (const cardNum of picked) {
        const placed = applyDirectAction(pending.thenAction, cardNum, cur);
        if (!placed.done) return placed;
        cur = { ...cur, ownerState: placed.ownerState, otherState: placed.otherState, logs: placed.logs,
          lastProcessedCards: placed.lastProcessedCards ?? picked };
      }
      if (pending.continuation) return executeAction(pending.continuation, cur);
      return done(cur);
    }
    const boundChoice = bindSearchedDeckCards(pending.thenAction, picked);
    const next = pending.continuation
      ? { type: 'SEQUENCE', steps: [boundChoice, pending.continuation] } as SequenceAction
      : boundChoice;
    return executeAction(next, cur);
  }
  if (pending.revealPicked && picked.length > 0) {
    const names = picked.map(n => cur.cardMap.get(getCardNum(n))?.CardName ?? n).join('・');
    cur = addLog(cur, `${names}を公開`);
  }
  // handOrField: ピックしたシグニを「手札に加える or 場に出す」の対話選択で処理（「公開し手札に加えるか場に出し」）。
  //   対象カードは pickCount 1（シグニ1枚）＝1回の CHOOSE。余剰（防御）は手札へ。
  if (pending.handOrField && picked.length > 0) {
    const ownerHF = (pending.thenAction as { owner?: Owner }).owner ?? 'self';
    const card = picked[0];
    const hasEmptyHF = ownerState(ownerHF, cur).field.signi.some(z => !z || z.length === 0);
    const contPartsHF: EffectAction[] = [];
    for (const extra of picked.slice(1)) contPartsHF.push({ type: 'STUB', id: 'INTERNAL_PICK_TO_HAND', value: extra } as EffectAction);
    if (pending.afterAction) contPartsHF.push(pending.afterAction);
    if (pending.continuation) contPartsHF.push(pending.continuation);
    const contHF: EffectAction | undefined = contPartsHF.length === 0 ? undefined
      : contPartsHF.length === 1 ? contPartsHF[0] : { type: 'SEQUENCE', steps: contPartsHF } as SequenceAction;
    const optsHF = [
      { id: 'hand', label: '手札に加える', available: true, action: { type: 'STUB', id: 'INTERNAL_PICK_TO_HAND', value: card } as EffectAction },
      { id: 'field', label: '場に出す', available: hasEmptyHF, action: { type: 'PLACE_SIGNI_ON_FIELD', owner: ownerHF, cardNums: [card] } as EffectAction },
    ];
    return needsInteraction(addLog(cur, `${cur.cardMap.get(getCardNum(card))?.CardName ?? card}を手札に加えるか場に出すか選択`), {
      type: 'CHOOSE', options: optsHF, count: 1, ...(contHF ? { continuation: contHF } : {}),
    });
  }
  // handOrEnergy: ピックしたカードを1枚ずつ「手札に加える or エナゾーンに置く」の対話選択で処理
  //   （「白のカードを３枚まで選び、それぞれ手札に加えるかエナゾーンに置き」WXK06-011 等・タスク12(xlvi)(h)）。
  //   handOrField と違い**枚数が複数ありうる**ため、2枚目以降は INTERNAL_HAND_OR_ENERGY で1枚ずつ問い直す。
  if (pending.handOrEnergy && picked.length > 0) {
    const card = picked[0];
    const contPartsHE: EffectAction[] = [];
    if (picked.length > 1) contPartsHE.push({ type: 'STUB', id: 'INTERNAL_HAND_OR_ENERGY', pickQueue: picked.slice(1) } as EffectAction);
    if (pending.afterAction) contPartsHE.push(pending.afterAction);
    if (pending.continuation) contPartsHE.push(pending.continuation);
    const contHE: EffectAction | undefined = contPartsHE.length === 0 ? undefined
      : contPartsHE.length === 1 ? contPartsHE[0] : { type: 'SEQUENCE', steps: contPartsHE } as SequenceAction;
    return needsInteraction(addLog(cur, `${cur.cardMap.get(getCardNum(card))?.CardName ?? card}を手札に加えるかエナゾーンに置くか選択`), {
      type: 'CHOOSE',
      count: 1,
      options: [
        { id: 'hand', label: '手札に加える', available: true, action: { type: 'STUB', id: 'INTERNAL_PICK_TO_HAND', value: card } as EffectAction },
        { id: 'energy', label: 'エナゾーンに置く', available: true, action: { type: 'STUB', id: 'INTERNAL_PICK_TO_ENERGY', value: card } as EffectAction },
      ],
      ...(contHE ? { continuation: contHE } : {}),
    });
  }
  // 【トラップ】設置（LOOK_PICK_CHAIN の then:'trap'・タスク12(xlvi)(g)）: ピックしたカードを1枚ずつ
  //   ゾーン選択の CHOOSE で `field.signi_traps` へ置く。⚠下の applyDirectAction ループは **!done で即 return**
  //   するため、対話を伴うこの処理をそこに載せると外側 continuation（後続ステージ・remainder）が落ちる。
  //   SEQUENCE に積めば execSequence が残りステップを continuation へ繋いでくれる。
  if (pending.thenAction.type === 'STUB'
      && (pending.thenAction as StubAction).id === 'INTERNAL_ASK_TRAP_ZONE' && picked.length > 0) {
    const trapSteps: EffectAction[] = picked.map(
      cn => ({ type: 'STUB', id: 'INTERNAL_ASK_TRAP_ZONE', value: cn } as StubAction) as EffectAction);
    if (pending.afterAction) trapSteps.push(pending.afterAction);
    if (pending.continuation) trapSteps.push(pending.continuation);
    return executeAction(
      trapSteps.length === 1 ? trapSteps[0] : { type: 'SEQUENCE', steps: trapSteps } as SequenceAction,
      { ...cur, lastProcessedCards: picked },
    );
  }
  // 【シード】設置（LOOK_PICK_CHAIN の then:'seed'）: 選んだ束を既存の複数シード設置ループへ
  // 一度だけ渡す。picked ごとに直接実行すると同じ束をN回設置するため、trap の per-card 展開とは分ける。
  if (pending.thenAction.type === 'STUB'
      && (pending.thenAction as StubAction).id === 'INTERNAL_SEEDS_PLACE_LOOP' && picked.length > 0) {
    const seedSteps: EffectAction[] = [
      { ...(pending.thenAction as StubAction), seedCards: picked } as StubAction,
    ];
    if (pending.afterAction) seedSteps.push(pending.afterAction);
    if (pending.continuation) seedSteps.push(pending.continuation);
    return executeAction(
      seedSteps.length === 1 ? seedSteps[0] : { type: 'SEQUENCE', steps: seedSteps } as SequenceAction,
      { ...cur, lastProcessedCards: picked },
    );
  }
  // 【アクセ】付け（§6.4 O-11）: 探した札を1枚ずつ「どのシグニに付けるか」の選択へ回す。
  // ⚠【トラップ】設置と**同じ理由**でここに置く＝対話を伴うので下の applyDirectAction ループ
  //   （!done で即 return する）に載せると afterAction / continuation が落ちる。
  if (pending.thenAction.type === 'STUB'
      && (pending.thenAction as StubAction).id === 'INTERNAL_ASK_ACCE_HOST' && picked.length > 0) {
    const acceSteps: EffectAction[] = picked.map(
      cn => ({ ...(pending.thenAction as StubAction), value: cn } as StubAction) as EffectAction);
    if (pending.afterAction) acceSteps.push(pending.afterAction);
    if (pending.continuation) acceSteps.push(pending.continuation);
    return executeAction(
      acceSteps.length === 1 ? acceSteps[0] : { type: 'SEQUENCE', steps: acceSteps } as SequenceAction,
      { ...cur, lastProcessedCards: picked },
    );
  }
  // 【マジックボックス】設置: PLACE_MAGIC_BOX は lastProcessedCards[0] を設置札として読む。
  // 下の applyDirectAction ループは picked を引数で渡すだけで lastProcessedCards を設定せず、
  // 対話 pause で早期 return すると afterAction / continuation も落ちるため、SEQUENCE に積んで渡す。
  if (pending.thenAction.type === 'STUB'
      && (pending.thenAction as StubAction).id === 'PLACE_MAGIC_BOX' && picked.length > 0) {
    const magicBoxSteps: EffectAction[] = [pending.thenAction];
    if (pending.afterAction) magicBoxSteps.push(pending.afterAction);
    if (pending.continuation) magicBoxSteps.push(pending.continuation);
    return executeAction(
      magicBoxSteps.length === 1
        ? magicBoxSteps[0]
        : { type: 'SEQUENCE', steps: magicBoxSteps } as SequenceAction,
      { ...cur, lastProcessedCards: picked },
    );
  }
  // ADD_TO_FIELD（場に出す）: 複数枚を1枚ずつゾーン選択でチェーン配置（途中で消失しないように）。
  // afterAction（シャッフル等）と外側 continuation は全配置後に実行する。
  if (pending.thenAction.type === 'ADD_TO_FIELD' && picked.length > 0) {
    cur = { ...cur, lastProcessedCards: picked };
    const afterParts: EffectAction[] = [];
    if (pending.afterAction) afterParts.push(pending.afterAction);
    if (pending.continuation) afterParts.push(pending.continuation);
    const after: EffectAction | undefined = afterParts.length === 0 ? undefined
      : afterParts.length === 1 ? afterParts[0]
      : ({ type: 'SEQUENCE', steps: afterParts } as SequenceAction);
    const placeAll: import('../types/effects').PlaceSigniOnFieldAction = {
      type: 'PLACE_SIGNI_ON_FIELD',
      owner: (pending.thenAction as AddToFieldAction).owner,
      cardNums: picked,
      ...((pending.thenAction as AddToFieldAction).asDown ? { asDown: true } : {}),
      ...(after ? { afterAction: after } : {}),
      ...(pending.lastProcessedCardsAfter ? { lastProcessedCardsAfter: pending.lastProcessedCardsAfter } : {}),
      // §6.4 O-2: 「対戦相手は…場に出し」＝公開札を選んだ相手が**ゾーンも選ぶ**。
      ...(pending.opponentResponds ? { opponentSelectsZone: true } : {}),
    };
    return execPlaceSigniOnField(placeAll, cur);
  }
  for (const id of picked) {
    const result = applyDirectAction(pending.thenAction, id, cur);
    if (!result.done) return result;
    cur = { ...cur, ownerState: result.ownerState, otherState: result.otherState, logs: result.logs, fieldTrashCostCards: result.fieldTrashCostCards ?? cur.fieldTrashCostCards, trapActivated: result.trapActivated ?? cur.trapActivated, trapSetOwners: result.trapSetOwners ?? cur.trapSetOwners };
  }
  // EVEAL_PICK_HAND_SHUFFLE_BOTTOM
   if (pending.restDest) {
    const remaining = pending.visibleCards.filter(n => !picked.includes(n));
    let logMsg = '';
    for (const cardNum of remaining) {
      const st = deckState(cur);
      const di = st.deck.indexOf(cardNum);
      if (di < 0) continue;
      const newDeck = [...st.deck];
      newDeck.splice(di, 1);
      if (pending.restDest === 'deck_bottom') {
        newDeck.push(cardNum);
        cur = setOwnerState(dOwner, { ...st, deck: newDeck }, cur);
        logMsg = '残りをデッキ下へ';
      } else if (pending.restDest === 'trash') {
        cur = setOwnerState(dOwner, { ...st, deck: newDeck, trash: [...st.trash, cardNum] }, cur);
        logMsg = '残りをトラッシュへ';
      } else if (pending.restDest === 'energy') {
        cur = setOwnerState(dOwner, { ...st, deck: newDeck, energy: [...st.energy, cardNum] }, cur);
        logMsg = '残りをエナゾーンへ';
      }
    }
    if (logMsg && remaining.length > 0) cur = addLog(cur, logMsg);
  }
  cur = { ...cur, lastProcessedCards: pending.lastProcessedCardsAfter ?? picked };
  if (pending.afterAction) {
    const r = executeAction(pending.afterAction, cur);
    if (!r.done) return r;
    cur = { ...cur, ownerState: r.ownerState, otherState: r.otherState, logs: r.logs, lastProcessedCards: r.lastProcessedCards };
  }
  if (pending.continuation) return executeAction(pending.continuation, cur);
  return done(cur);
}

// CHOOSE: choiceId export
 export function resumeChoose(
  choiceId: string | string[], // 単一IDまたは複数ID（multiSelect/upTo対応）
  pending: PendingInteractionDef & { type: 'CHOOSE' },
  ctx: ExecCtx,
): ExecResult {
  const ids = Array.isArray(choiceId) ? choiceId : [choiceId];
  const opts = ids.map(id => pending.options.find(o => o.id === id)).filter((o): o is NonNullable<typeof o> => !!o);
  if (opts.length === 0) {
    // upTo=true で0個選択した場合（スキップ相当）
    if (pending.continuation) {
      return executeAction(pending.continuation, ctx);
    }
    return done(ctx);
  }
  // 複数選択時はSEQUENCEとして実行
  const combinedAction: import('../types/effects').EffectAction = opts.length === 1
    ? opts[0].action
    : ({ type: 'SEQUENCE', steps: opts.map(o => o.action) } as import('../types/effects').SequenceAction);
  const result = executeAction(combinedAction, ctx);
  if (!result.done) {
    // ネストしたインタラクション（SELECT_TARGET 等）の continuation に外側の continuation を合成
    if (pending.continuation) {
      const existing = result.pending.continuation;
      result.pending = {
        ...result.pending,
        continuation: existing
          ? ({ type: 'SEQUENCE', steps: [existing, pending.continuation] } as import('../types/effects').SequenceAction)
          : pending.continuation,
      };
    }
    return result;
  }
  if (pending.continuation) {
    // 選択したアクションが処理したシグニ（公開/場出し等）を continuation の「その後、そのシグニより…」が参照できるよう lastProcessedCards を継承
    return executeAction(pending.continuation, { ...ctx, ownerState: result.ownerState, otherState: result.otherState, logs: result.logs, lastProcessedCards: result.lastProcessedCards, storedTargetCards: result.storedTargetCards ?? ctx.storedTargetCards, fieldTrashCostCards: result.fieldTrashCostCards ?? ctx.fieldTrashCostCards, trapActivated: result.trapActivated ?? ctx.trapActivated, trapSetOwners: result.trapSetOwners ?? ctx.trapSetOwners });
  }
  return result;
}

// OPTIONAL_COST: 任意コスト付き効果の発動/スキップ選択後の処理
// choiceId='pay': energyNums 分のエナを支払い効果発動、'skip': スキップ
export function resumeOptionalCost(
  choiceId: string,
  energyNums: string[],
  pending: PendingInteractionDef & { type: 'CHOOSE' },
  ctx: ExecCtx,
): ExecResult {
  const noopAction: SequenceAction = { type: 'SEQUENCE', steps: [] };
  const skipOpt = pending.options.find(o => o.id === 'skip');
  const payOpt  = pending.options.find(o => o.id === choiceId);

  if (choiceId === 'skip' || !payOpt) {
    // スキップ: スキップアクション → continuation
    const result = executeAction(skipOpt?.action ?? noopAction, ctx);
    if (!result.done) return result;
    if (pending.continuation) {
      return executeAction(pending.continuation, { ...ctx, ownerState: result.ownerState, otherState: result.otherState, logs: result.logs, fieldTrashCostCards: result.fieldTrashCostCards ?? ctx.fieldTrashCostCards, trapActivated: result.trapActivated ?? ctx.trapActivated, trapSetOwners: result.trapSetOwners ?? ctx.trapSetOwners });
    }
    return result;
  }

  // :
     const costColors = [...(payOpt?.costColors ?? [])];
  for (const n of energyNums) {
    const color = ctx.cardMap.get(n)?.Color ?? '無';
    // 色一致コストを優先して消費し、なければ無色枠に充てる（多色カード対応／「青|黒」選択肢スロットも考慮）
    let idx = costColors.findIndex(c => !costSlotIsAny(c) && energyMatchesCostSlot(color, c));
    if (idx === -1) idx = costColors.findIndex(c => costSlotIsAny(c));
    if (idx === -1) return done(addLog(ctx, `コスト支払いエラー: ${color}は不要`));
    costColors.splice(idx, 1);
  }
  if (costColors.length > 0) return done(addLog(ctx, `コスト支払いエラー: エナ不足`));

  const newEnergy = ctx.ownerState.energy.filter(n => !energyNums.includes(n));
  const newTrash  = [...ctx.ownerState.trash, ...energyNums];
  const coinCost = payOpt?.coinCost ?? 0;
  if (coinCost > 0 && (ctx.ownerState.coins ?? 0) < coinCost) {
    return done(addLog(ctx, `コスト支払いエラー: コイン不足`));
  }
  const newCoins = Math.max(0, (ctx.ownerState.coins ?? 0) - coinCost);
  const cur = addLog(
    { ...ctx, ownerState: { ...ctx.ownerState, energy: newEnergy, trash: newTrash, coins: newCoins } },
    `コスト支払い: ${[...(payOpt?.costColors ?? []).map(c => `《${c}》`), ...(coinCost > 0 ? [`《コイン》×${coinCost}`] : [])].join('')}`,
  );

  const result = executeAction(payOpt?.action ?? noopAction, cur);
  if (!result.done) {
    // continuationをresult.pendingに付け足す
    if (pending.continuation) {
      const merged: EffectAction = result.pending.continuation
        ? { type: 'SEQUENCE', steps: [result.pending.continuation, pending.continuation] } as SequenceAction
        : pending.continuation;
      return { ...result, pending: { ...result.pending, continuation: merged } };
    }
    return result;
  }
  if (pending.continuation) {
    // lastProcessedCards を継承（支払い後の効果が公開/場出し等したシグニを「その後、そのシグニより…」で参照する。WXK10-031）
    return executeAction(pending.continuation, { ...cur, ownerState: result.ownerState, otherState: result.otherState, logs: result.logs, lastProcessedCards: result.lastProcessedCards, storedTargetCards: result.storedTargetCards ?? cur.storedTargetCards, fieldTrashCostCards: result.fieldTrashCostCards ?? cur.fieldTrashCostCards, trapActivated: result.trapActivated ?? cur.trapActivated, trapSetOwners: result.trapSetOwners ?? cur.trapSetOwners });
  }
  return result;
}

// OPPONENT_PAY_OPTIONAL: // pay therState skip export
 export function resumeOpponentPayOptional(
  choiceId: string,
  energyNums: string[], // 対戦相手が選択したエナカードのCardNum
  pending: PendingInteractionDef & { type: 'CHOOSE' },
  ctx: ExecCtx,
): ExecResult {
  const noopAction: SequenceAction = { type: 'SEQUENCE', steps: [] };
  const payOpt  = pending.options.find(o => o.id === 'pay');
  const skipOpt = pending.options.find(o => o.id === 'skip');

  if (choiceId !== 'pay') {
    // 対戦相手が支払わない → 効果発動
    const selectedOpt = pending.options.find(o => o.id === choiceId);
    const result = executeAction(selectedOpt?.action ?? skipOpt?.action ?? noopAction, ctx);
    if (!result.done) {
      if (pending.continuation) {
        const merged: EffectAction = result.pending.continuation
          ? { type: 'SEQUENCE', steps: [result.pending.continuation, pending.continuation] } as SequenceAction
          : pending.continuation;
        return { ...result, pending: { ...result.pending, continuation: merged } };
      }
      return result;
    }
    if (pending.continuation) {
      return executeAction(pending.continuation, { ...ctx, ownerState: result.ownerState, otherState: result.otherState, logs: result.logs, fieldTrashCostCards: result.fieldTrashCostCards ?? ctx.fieldTrashCostCards, trapActivated: result.trapActivated ?? ctx.trapActivated, trapSetOwners: result.trapSetOwners ?? ctx.trapSetOwners });
    }
    return result;
  }

  //  otherState
   const costColors = [...(payOpt?.costColors ?? [])];
  for (const n of energyNums) {
    const color = ctx.cardMap.get(n)?.Color ?? '無';
    // 色一致コストを優先して消費し、なければ無色枠に充てる（多色カード対応のため includes 判定）
    let idx = costColors.findIndex(c => c !== '無' && color.includes(c));
    if (idx === -1) idx = costColors.findIndex(c => c === '無');
    if (idx === -1) return done(addLog(ctx, `コスト支払いエラー: ${color}は不要`));
    costColors.splice(idx, 1);
  }
  if (costColors.length > 0) return done(addLog(ctx, `コスト支払いエラー: エナ不足`));

  const newOppEnergy = ctx.otherState.energy.filter(n => !energyNums.includes(n));
  const newOppTrash  = [...ctx.otherState.trash, ...energyNums];
  const cur = addLog(
    { ...ctx, otherState: { ...ctx.otherState, energy: newOppEnergy, trash: newOppTrash } },
    `コスト支払い: ${(payOpt?.costColors ?? []).map(c => `《${c}》`).join('')}`,
  );
  // 🔴**支払い枝のアクションを実行する**（§3 (cxxvii)・続き475d）。
  //   `thenOnPay`（原文「〈コスト〉を支払ってもよい。**そうした場合**、X」）のとき、帰結 X は
  //   `payOpt.action` に入っている（`effectExecutor.ts:4157` の `payBranch`）。
  //   従来ここはエナを引くだけで `payOpt.action` を**一度も実行していなかった**ため、
  //   **エナ払いの `thenOnPay` 効果は帰結が丸ごと落ちて**いた（実測＝`SPDi43-06-E1` は
  //   CPU がコストを払ったのにアタックが無効にならずライフが減った）。
  //   ⚠既定極性（回避ゲート）の pay 枝は `noopAction` なので実行しても無害＝両極性で同じ形になる。
  //   ⚠`choiceId !== 'pay'`（discard/energyTrash 等）は上の分岐が既に `selectedOpt.action` を
  //     実行しており、**エナ払い枝だけが取り残されていた**。
  const paid = payOpt?.action ? executeAction(payOpt.action, cur) : done(cur);
  if (!paid.done) {
    if (pending.continuation) {
      const merged: EffectAction = paid.pending.continuation
        ? { type: 'SEQUENCE', steps: [paid.pending.continuation, pending.continuation] } as SequenceAction
        : pending.continuation;
      return { ...paid, pending: { ...paid.pending, continuation: merged } };
    }
    return paid;
  }
  if (pending.continuation) {
    return executeAction(pending.continuation, {
      ...cur, ownerState: paid.ownerState, otherState: paid.otherState, logs: paid.logs,
      fieldTrashCostCards: paid.fieldTrashCostCards ?? cur.fieldTrashCostCards,
      trapActivated: paid.trapActivated ?? cur.trapActivated,
      trapSetOwners: paid.trapSetOwners ?? cur.trapSetOwners,
    });
  }
  return paid;
}

// LOOK_AND_REORDER: reordered[] =export
export function resumeLookAndReorder(
  reordered: string[],
  trashed: string[],
  pending: PendingInteractionDef & { type: 'LOOK_AND_REORDER' },
  ctx: ExecCtx,
  bottomCards: string[] = [],
): ExecResult {
  const keepRaw = reordered.filter(n => !trashed.includes(n));
  const keep = pending.shuffle ? shuffle(keepRaw) : keepRaw;
  const destOwner = pending.destOwner;
  const state = ownerState(destOwner, ctx);
  let newS: PlayerState;
  if (pending.destLocation === 'life') {
    newS = { ...state, life_cloth: [...state.life_cloth, ...keep], trash: [...state.trash, ...trashed] };
  } else if (pending.destPosition === 'top') {
    newS = { ...state, deck: [...keep, ...state.deck], trash: [...state.trash, ...trashed] };
  } else if (pending.destPosition === 'bottom') {
    newS = { ...state, deck: [...state.deck, ...keep], trash: [...state.trash, ...trashed] };
  } else if (pending.destPosition === 'first_top_rest_bottom') {
    // 1枚目→デッキトップ、残り→デッキ下
    const [firstCard, ...restCards] = keep;
    newS = { ...state, deck: [...(firstCard ? [firstCard] : []), ...state.deck, ...restCards], trash: [...state.trash, ...trashed] };
  } else if (pending.destPosition === 'split_top_bottom') {
    // 好きな枚数を一番上へ、残りを一番下へ（各群は reordered の並び順を維持）。G168
    const topGroup = keep.filter(n => !bottomCards.includes(n));
    const bottomGroup = keep.filter(n => bottomCards.includes(n));
    newS = { ...state, deck: [...topGroup, ...state.deck, ...bottomGroup], trash: [...state.trash, ...trashed] };
  } else {
    newS = { ...state, deck: [...keep, ...state.deck], trash: [...state.trash, ...trashed] };
  }
  // 見た/公開したカード（reordered＝全閲覧カード）を lastProcessedCards に記録する。後続の
  //   「この方法で公開されたN枚/すべて〜の場合」（LAST_PROCESSED_COUNT_GTE/ALL_MATCH/MATCHES）が参照する。
  //   ⚠現状 parser は公開(private:false)の LOOK_AND_REORDER 前段のみ条件を emit する（呼び出し側 prevRecords）。
  const cur = {
    ...addLog(setOwnerState(destOwner, newS, ctx), `デッキを並べ替え`),
    lastProcessedCards: pending.destLocation === 'life' ? trashed : reordered,
    lastLookTrashedCards: trashed,
  };
  if (pending.revealTopAfterReorder) {
    const revealState = ownerState(destOwner, cur);
    const revealed = revealState.deck.slice(0, 1);
    const levelSum = revealed.reduce((sum, num) => {
      const card = ctx.cardMap.get(getCardNum(num));
      if (card?.Type !== 'シグニ') return sum;
      const level = parseInt(card.Level ?? '', 10);
      return sum + (Number.isNaN(level) ? 0 : level);
    }, 0);
    const withReveal = setOwnerState(destOwner, {
      ...revealState,
      last_revealed_signi_level_sum: levelSum,
      last_revealed_deck_cards: revealed,
    }, cur);
    const revealedCtx = {
      ...addLog(withReveal, `デッキの一番上を公開`),
      lastProcessedCards: revealed,
    };
    if (pending.continuation) return executeAction(pending.continuation, revealedCtx);
    return done(revealedCtx);
  }
  if (pending.continuation) return executeAction(pending.continuation, cur);
  return done(cur);
}

// SELECT_ZONE: プレイヤーが選んだゾーン番号にカードを配置する
// REVEAL_CARDS: 閲覧専用モーダル（公開を確認したら continuation を実行するだけ。状態変更なし）
export function resumeRevealCards(
  pending: PendingInteractionDef & { type: 'REVEAL_CARDS' },
  ctx: ExecCtx,
): ExecResult {
  if (pending.continuation) return executeAction(pending.continuation, ctx);
  return done(ctx);
}

export function resumeSelectZone(
  zoneIndex: number,
  pending: PendingInteractionDef & { type: 'SELECT_ZONE' },
  ctx: ExecCtx,
): ExecResult {
  const state = ownerState(pending.owner, ctx);
  const signi = [...state.field.signi] as (string[] | null)[];
  if (signi[zoneIndex] && (signi[zoneIndex]?.length ?? 0) > 0) {
    // 選択ゾーンが埋まっている: cardNumはexecAddToFieldで既にデッキから除去済みのため、
    // そのまま終了するとカードが消失する → デッキトップに戻す
    const restored: PlayerState = { ...state, deck: [pending.cardNum, ...state.deck] };
    return done(addLog(setOwnerState(pending.owner, restored, ctx),
      `ゾーンが埋まっているため${ctx.cardMap.get(pending.cardNum)?.CardName ?? pending.cardNum}をデッキに戻す`));
  }
  signi[zoneIndex] = [pending.cardNum];
  const newS: PlayerState = recordPlacedBySource(recordNonHandPlacement({ ...state, field: { ...state.field, signi },
    signi_played_from_deck: [...(state.signi_played_from_deck ?? []), pending.cardNum] }, pending.cardNum), pending.cardNum, ctx.sourceCardNum);
  const cur = addLog(setOwnerState(pending.owner, newS, ctx),
    `${ctx.cardMap.get(pending.cardNum)?.CardName ?? pending.cardNum}を場に出す`);
  if (pending.continuation) return executeAction(pending.continuation, cur);
  return done(cur);
}

// SELECT_SIGNI_ZONE: トラッシュ/エナ/手札などから場に出す際のゾーン選択（デッキ戻し不要）
export function resumeSelectSigniZone(
  zoneIndex: number,
  pending: PendingInteractionDef & { type: 'SELECT_SIGNI_ZONE' },
  ctx: ExecCtx,
): ExecResult {
  const state = ownerState(pending.owner, ctx);
  const signi = [...state.field.signi] as (string[] | null)[];
  if (signi[zoneIndex] && (signi[zoneIndex]?.length ?? 0) > 0) {
    // 選択ゾーンが埋まっている: 再選択を促す
    return needsInteraction(ctx, pending);
  }
  signi[zoneIndex] = [pending.cardNum];
  let newS: PlayerState = recordPlacedBySource({ ...state, field: { ...state.field, signi } }, pending.cardNum, ctx.sourceCardNum);
  if (pending.fromNonHand) newS = recordNonHandPlacement(newS, pending.cardNum);
  // 一時レゾナ（`WX07-050`／`WX16-Re18`）＝ゾーン選択の pause を跨いで「置いたレゾナ」を残す。
  if (pending.recordSummonedResona) {
    newS = { ...newS, last_summoned_resonas: [...(newS.last_summoned_resonas ?? []), pending.cardNum] };
  }
  if (pending.asDown) {
    const newDown = [...(newS.field.signi_down ?? [false, false, false])] as boolean[];
    newDown[zoneIndex] = true;
    newS = { ...newS, field: { ...newS.field, signi_down: newDown } };
  }
  let cur = addLog(setOwnerState(pending.owner, newS, ctx),
    `${ctx.cardMap.get(pending.cardNum)?.CardName ?? pending.cardNum}をゾーン${zoneIndex + 1}に場に出す`);
  // REVEAL_UNTIL_TO_FIELD 等：ゾーン選択を跨いで「場に出したシグニ」を維持（【出】発火の追跡用）。
  if (pending.placedSoFar !== undefined) {
    cur = { ...cur, lastProcessedCards: [...pending.placedSoFar, pending.cardNum] };
  }
  if (pending.continuation) return executeAction(pending.continuation, cur);
  return done(cur);
}

// DECLARE_BOND: export
 export function resumeDeclareBond(
  selectedCardNum: string,
  pending: PendingInteractionDef & { type: 'DECLARE_BOND' },
  ctx: ExecCtx,
): ExecResult {
  const cardName = ctx.cardMap.get(selectedCardNum)?.CardName;
  if (!cardName) return done(addLog(ctx, '絆獲得: 選択カードが見つかりません'));
  const current = ctx.ownerState.bonds ?? [];
  const newBonds = current.includes(cardName) ? current : [...current, cardName];
  const shuffled = shuffle([...ctx.ownerState.deck]);
  const newOwner: PlayerState = { ...ctx.ownerState, bonds: newBonds, deck: shuffled };
  const cur = addLog({ ...ctx, ownerState: newOwner }, `${cardName}との絆を獲得（デッキをシャッフル）`);
  if (pending.continuation) return executeAction(pending.continuation, cur);
  return done(cur);
}

// REARRANGE_SIGNI: フィールドのシグニを好きなように配置し直す（count:'ALL'）。プレイヤーに配置選択を促す。
function execRearrangeSigni(a: import('../types/effects').RearrangeSigniAction, ctx: ExecCtx): ExecResult {
  if (a.swap) {
    // エナ／トラッシュとの二ゾーン交換は、まず場外側の1枚を通常の SELECT_TARGET で選ぶ。
    // 選択値は lastProcessedCards に載せ、既存 swapWithLastProcessed の受け渡しをそのまま再利用する。
    if (a.swapSourceLocation && a.swapSourceTarget && !a.swapWithLastProcessed) {
      const srcTarget = a.swapSourceTarget;
      const srcOwner: Owner = srcTarget.owner === 'opponent' ? 'opponent' : 'self';
      const srcState = ownerState(srcOwner, ctx);
      const resolvedSourceFilter = resolveDynamicFilter(
        srcTarget.filter, srcState, ctx.cardMap, srcOwner === 'self' ? ctx.otherState : ctx.ownerState,
        ctx.lastProcessedCards, ctx.effectivePowers, ctx.sourceCardNum, ctx.triggeringCardNum,
      );
      const candidates = a.swapSourceLocation === 'energy'
        ? energyCandidates(srcState, resolvedSourceFilter, ctx.cardMap, ctx.treatAsClassAllZones)
        : movableTrashCandidates(srcOwner, srcState, resolvedSourceFilter, ctx.cardMap, ctx, ctx.treatAsClassAllZones);
      const scope: TargetScope = a.swapSourceLocation === 'energy'
        ? (srcOwner === 'self' ? 'self_energy' : 'opp_energy')
        : (srcOwner === 'self' ? 'self_trash' : 'opp_trash');
      const continueSwap: import('../types/effects').RearrangeSigniAction = { ...a, swapWithLastProcessed: true };
      return selectOrInteract(
        candidates, 1, srcTarget.upToCount ?? false, scope,
        { type: 'SEQUENCE', steps: [] }, continueSwap, ctx,
      );
    }
    const tgtOwner: Owner = a.target.owner === 'opponent' ? 'opponent' : 'self';
    const state = ownerState(tgtOwner, ctx);
    if (a.swapBetweenTargets) {
      const pairCandidates = state.field.signi
        .map(s => s?.at(-1))
        .filter((n): n is string => !!n && matchesFilter(ctx.cardMap.get(getCardNum(n)), a.target.filter));
      if (pairCandidates.length < 2) return done(addLog(ctx, '入れ替え対象が2体未満のためスキップ'));
      return needsInteraction(ctx, {
        type: 'REARRANGE_SIGNI', owner: tgtOwner, signiNums: pairCandidates,
        optional: a.optional ?? false, mode: 'swap_pair',
      } as PendingInteractionDef);
    }
    const external = a.swapWithLastProcessed ? ctx.lastProcessedCards?.[0] : undefined;
    if (a.swapSourceLocation && !external) return done(addLog(ctx, '場外の交換元を選ばなかった'));
    const source = external ?? ctx.sourceCardNum;
    const resolvedTargetFilter = resolveDynamicFilter(
      a.target.filter, state, ctx.cardMap, tgtOwner === 'self' ? ctx.otherState : ctx.ownerState,
      ctx.lastProcessedCards, ctx.effectivePowers, ctx.sourceCardNum, ctx.triggeringCardNum,
    );
    const fixedFieldNum = a.targetsBattleAttacker
      ? ctx.battleAttackerCardNum
      : resolvedTargetFilter?.thisCardOnly ? ctx.sourceCardNum : undefined;
    const candidates = state.field.signi
      .map((s, zi) => ({ n: s?.at(-1), zi }))
      .filter(({ n, zi }) => !!n && n !== source
        && (!fixedFieldNum || n === fixedFieldNum)
        && (!resolvedTargetFilter?.isUp || !state.field.signi_down?.[zi])
        && matchesFilter(ctx.cardMap.get(getCardNum(n!)), resolvedTargetFilter))
      .map(({ n }) => n!);
    if (!source || candidates.length === 0) return done(addLog(ctx, '入れ替え対象がないためスキップ'));
    return needsInteraction(ctx, {
      type: 'REARRANGE_SIGNI',
      owner: tgtOwner,
      signiNums: candidates,
      optional: a.optional ?? false,
      mode: 'swap',
      swapSourceNum: source,
      swapSourceLocation: a.swapSourceLocation ?? (external ? 'deck' : 'field'),
      swapIfSameLevel: a.swapIfSameLevel,
      suppressOnPlay: a.suppressOnPlay,
    } as PendingInteractionDef);
  }
  if (a.target.count !== 'ALL') {
    return done(addLog(ctx, 'シグニ並び替え（未対応の形式）'));
  }
  const tgtOwner: Owner = a.target.owner === 'opponent' ? 'opponent' : 'self';
  const state = ownerState(tgtOwner, ctx);
  const signiNums = state.field.signi.map(s => s?.at(-1)).filter((x): x is string => !!x);
  // 1体以下なら並び替えても変化なし → スキップ
  if (signiNums.length <= 1) return done(addLog(ctx, '並び替え対象が1体以下のためスキップ'));
  return needsInteraction(ctx, {
    type: 'REARRANGE_SIGNI',
    owner: tgtOwner,
    signiNums,
    optional: a.optional ?? false,
  } as PendingInteractionDef);
}

// REARRANGE_SIGNI 解決: newArrangement[newZone] = 配置するシグニのトップ instance id（''=空き）。
// 元ゾーンのゾーン状態（スタック・ダウン・凍結・チャーム・アクセ・ソウル・武装・ウィルス）ごと新ゾーンへ移す。
export function resumeRearrangeSigni(
  newArrangement: string[],
  pending: PendingInteractionDef & { type: 'REARRANGE_SIGNI' },
  ctx: ExecCtx,
): ExecResult {
  const state = ownerState(pending.owner, ctx);
  const f = state.field;
  const continueAfterSwap = (cur: ExecCtx): ExecResult => pending.continuation
    ? executeAction(pending.continuation, cur)
    : done(cur);
  if (pending.mode === 'swap_pair') {
    const selected = [...new Set(newArrangement.filter(n => pending.signiNums.includes(n)))].slice(0, 2);
    if (selected.length < 2) return continueAfterSwap(addLog(ctx, 'シグニ2体の入れ替えを行わなかった'));
    const firstZone = f.signi.findIndex(s => s?.at(-1) === selected[0]);
    const secondZone = f.signi.findIndex(s => s?.at(-1) === selected[1]);
    if (firstZone < 0 || secondZone < 0 || firstZone === secondZone) {
      return continueAfterSwap(addLog(ctx, '入れ替え対象が見つからないためスキップ'));
    }
    const arrangement = f.signi.map(s => s?.at(-1) ?? '');
    [arrangement[firstZone], arrangement[secondZone]] = [arrangement[secondZone], arrangement[firstZone]];
    return resumeRearrangeSigni(arrangement, { ...pending, mode: 'rearrange' }, ctx);
  }
  if (pending.mode === 'swap') {
    const selected = newArrangement.find(n => pending.signiNums.includes(n));
    if (!selected) {
      if (pending.continuation) return executeAction(pending.continuation, ctx);
      return done(addLog(ctx, 'シグニの入れ替えを行わなかった'));
    }
    const targetZone = f.signi.findIndex(s => s?.at(-1) === selected);
    if (targetZone < 0 || !pending.swapSourceNum) return done(addLog(ctx, '入れ替え対象が見つからないためスキップ'));
    if (pending.swapSourceLocation === 'deck' || pending.swapSourceLocation === 'energy' || pending.swapSourceLocation === 'trash') {
      const sourceZone = pending.swapSourceLocation;
      const sourceCards = state[sourceZone];
      const sourceIndex = sourceCards.indexOf(pending.swapSourceNum);
      if (sourceIndex < 0) return continueAfterSwap(addLog(ctx, '場外の交換元シグニが見つからないためスキップ'));
      if (pending.swapIfSameLevel) {
        const sourceLevel = parseInt(ctx.cardMap.get(getCardNum(pending.swapSourceNum))?.Level ?? '', 10);
        const targetLevel = parseInt(ctx.cardMap.get(getCardNum(selected))?.Level ?? '', 10);
        if (!Number.isFinite(sourceLevel) || sourceLevel !== targetLevel) {
          return continueAfterSwap(addLog(ctx, '対象2枚のレベルが同じでないため入れ替えを行わなかった'));
        }
      }
      const deployBlocked = deployLimitBlockedFor(pending.owner, pending.swapSourceNum, ctx, 1);
      if (deployBlocked) {
        const label = ctx.cardMap.get(getCardNum(pending.swapSourceNum))?.CardName ?? pending.swapSourceNum;
        return continueAfterSwap(addLog(ctx, deployLimitLogMessage(deployBlocked, label)));
      }
      // 場を離れる側は通常の removeFromField 規約に従う（下敷き/チャーム/アクセはトラッシュ、
      // ソウルはルリグトラッシュ、武装等は解除。ウィルスはシグニゾーンに残る）。
      const removed = removeFromField(selected, state);
      const destination = [...removed[sourceZone]];
      const removedSourceIndex = destination.indexOf(pending.swapSourceNum);
      if (removedSourceIndex < 0) return continueAfterSwap(addLog(ctx, '場外の交換元シグニが移動済みのためスキップ'));
      destination.splice(removedSourceIndex, 1);
      if (sourceZone === 'deck') destination.unshift(selected); else destination.push(selected);
      const signi = [...removed.field.signi];
      signi[targetZone] = [pending.swapSourceNum];
      const newField: typeof f = {
        ...removed.field, signi,
      };
      const newState: PlayerState = { ...removed, [sourceZone]: destination, field: newField,
        signi_played_from_non_hand_this_turn: [
          ...(removed.signi_played_from_non_hand_this_turn ?? []).filter(n => n !== pending.swapSourceNum), pending.swapSourceNum,
        ],
        zone_moved_just: [...(removed.zone_moved_just ?? []), pending.swapSourceNum, selected] };
      const zoneLabel = sourceZone === 'deck' ? 'デッキ' : sourceZone === 'energy' ? 'エナゾーン' : 'トラッシュ';
      return continueAfterSwap({ ...addLog(setOwnerState(pending.owner, newState, ctx), `${zoneLabel}のシグニと場のシグニを入れ替えた`),
        lastProcessedCards: [pending.swapSourceNum] });
    }
    const sourceZone = f.signi.findIndex(s => s?.at(-1) === pending.swapSourceNum);
    if (sourceZone < 0) return done(addLog(ctx, '交換元シグニが場にないためスキップ'));
    const arrangement = f.signi.map(s => s?.at(-1) ?? '');
    [arrangement[sourceZone], arrangement[targetZone]] = [arrangement[targetZone], arrangement[sourceZone]];
    return resumeRearrangeSigni(arrangement, { ...pending, mode: 'rearrange' }, ctx);
  }
  // 各シグニ instance の現在ゾーンを引く
  const oldZoneOf = (num: string): number => f.signi.findIndex(s => s?.at(-1) === num);
  // newArrangement[ni] のシグニが元々あったゾーン index（''は-1）
  const srcZone = (ni: number): number => {
    const num = newArrangement[ni];
    return num ? oldZoneOf(num) : -1;
  };
  const permute = <T,>(arr: T[] | undefined, empty: T): T[] | undefined => {
    if (!arr) return arr;
    return [0, 1, 2].map(ni => { const oz = srcZone(ni); return oz >= 0 ? arr[oz] : empty; });
  };
  const newField: typeof f = {
    ...f,
    signi: permute(f.signi as (string[] | null)[], null) as typeof f.signi,
    signi_down:   permute(f.signi_down, false) as typeof f.signi_down,
    signi_frozen: permute(f.signi_frozen, false) as typeof f.signi_frozen,
    signi_charms: permute(f.signi_charms, null) as typeof f.signi_charms,
    signi_acce:   permute(f.signi_acce, null) as typeof f.signi_acce,
    signi_soul:   permute(f.signi_soul, null) as typeof f.signi_soul,
    signi_armor:  permute(f.signi_armor, false) as typeof f.signi_armor,
    signi_virus:  permute(f.signi_virus, 0) as typeof f.signi_virus,
    signi_chokkin: permute(f.signi_chokkin, 0) as typeof f.signi_chokkin,
    signi_traps: permute(f.signi_traps, null) as typeof f.signi_traps,
    signi_magic_boxes: permute(f.signi_magic_boxes, null) as typeof f.signi_magic_boxes,
    signi_seeds: permute(f.signi_seeds, null) as typeof f.signi_seeds,
    facedown_signi: permute(f.facedown_signi, null) as typeof f.facedown_signi,
    cross_state: permute(f.cross_state, false) as typeof f.cross_state,
    heaven_state: permute(f.heaven_state, false) as typeof f.heaven_state,
  };
  // ON_ZONE_MOVED 用：ゾーンが実際に変わったシグニを記録（旧ゾーン != 新ゾーン）
  const rearrMoved = [0, 1, 2]
    .filter(ni => { const num = newArrangement[ni]; return !!num && oldZoneOf(num) !== ni; })
    .map(ni => newArrangement[ni]);
  const newState: PlayerState = { ...state, field: newField,
    ...(rearrMoved.length > 0 ? { zone_moved_just: [...(state.zone_moved_just ?? []), ...rearrMoved] } : {}) };
  // §6.4 O-8(b)：後続文「この方法で**他のシグニゾーンに移動した**シグニを〜」の照応先は
  // `rearrMoved`（旧ゾーン≠新ゾーン）。`lastProcessedCards` に載せて `STORE_LAST_PROCESSED_TARGETS`
  // → `targetsStored` の正準形で受ける。
  // ⚠`zone_moved_just` は ON_ZONE_MOVED 用に**累積**するので照応先には使えない（前の移動が混ざる）。
  const cur = addLog({ ...setOwnerState(pending.owner, newState, ctx), lastProcessedCards: rearrMoved },
    'シグニを配置し直した');
  if (pending.continuation) return executeAction(pending.continuation, cur);
  return done(cur);
}

// ===== 直接アクション適用（特定のcardNumに対して） =====

function applyDirectAction(action: EffectAction, cardNum: string, ctx: ExecCtx): ExecResult {
  switch (action.type) {
    case 'BANISH_REDIRECT': {
      const br = action as BanishRedirectAction;
      if (!br.bySource && br.redirectTo === 'trash' && br.target.owner === 'opponent' && br.target.count === 1) {
        const power0Only = br.whenPowerZero === true;
        const battleOnly = br.battleOnly === true;
        const prev = power0Only
          ? (ctx.ownerState.banish_redirect_power0_target_nums ?? [])
          : battleOnly
            ? (ctx.ownerState.banish_redirect_battle_target_nums ?? [])
            : (ctx.ownerState.banish_redirect_target_nums ?? []);
        const next = prev.includes(cardNum) ? prev : [...prev, cardNum];
        const newOwner = power0Only
          ? { ...ctx.ownerState, banish_redirect_power0_target_nums: next }
          : battleOnly
            ? { ...ctx.ownerState, banish_redirect_battle_target_nums: next }
            : { ...ctx.ownerState, banish_redirect_target_nums: next };
        return done({ ...addLog({ ...ctx, ownerState: newOwner },
          `${cardNum}の${power0Only ? 'パワー0以下による' : battleOnly ? 'バトルによる' : ''}バニッシュ先をこのターン、トラッシュへ変更`),
          lastProcessedCards: [cardNum] });
      }
      if (!br.bySource || !ctx.ownerState.field.signi.some(s => s?.at(-1) === cardNum)) return done(ctx);
      const prev = ctx.ownerState.banish_redirect_by_source_nums ?? [];
      const newOwner = { ...ctx.ownerState,
        banish_redirect_by_source_nums: prev.includes(cardNum) ? prev : [...prev, cardNum] };
      return done({ ...addLog({ ...ctx, ownerState: newOwner }, `${cardNum}にバニッシュ先変更能力を付与`),
        lastProcessedCards: [cardNum] });
    }
    case 'BANISH': {
      // cardNumが opponent.field にあるか自分のフィールドにあるかを検索
      let found: Owner | null = null;
      if (ctx.ownerState.field.signi.some(s => s?.at(-1) === cardNum)) found = 'self';
      if (ctx.otherState.field.signi.some(s => s?.at(-1) === cardNum)) found = 'opponent';
      if (!found) return done(ctx);
      // バニッシュ経路＝`ReplaceBanish` は対象外／代わりに F-3 身代わり（BANISH_SUBSTITUTE）が乗る
      const sub = applyEffectLeaveSubstitutes(cardNum, found, ctx, { isBanish: true });
      if (sub.replaced) return done(sub.ctx);
      const c = sub.ctx;          // ⚠(cxxx)＝置換不成立でも「決定の消費」は必ず反映する
      const s = ownerState(found, c);
      const removed = removeFromField(cardNum, s);
      // バニッシュ先リダイレクト（トラッシュ/手札/デッキ下＋効果経路の【常】置換走査）を適用
      const opp = ownerState(found === 'self' ? 'opponent' : 'self', c);
      const { state: withEnergy, log } = banishDestination(removed, opp, cardNum, banishRedirectOpts(c, s, cardNum));
      return done(addLog(setOwnerState(found, withEnergy, c),
        `${c.cardMap.get(cardNum)?.CardName ?? cardNum}${log}`));
    }
    case 'BOUNCE': {
      let found: Owner | null = null;
      if (ctx.ownerState.field.signi.some(s => s?.at(-1) === cardNum)) found = 'self';
      if (ctx.otherState.field.signi.some(s => s?.at(-1) === cardNum)) found = 'opponent';
      if (!found) return done(ctx);
      const sub = applyEffectLeaveSubstitutes(cardNum, found, ctx);
      if (sub.replaced) return done(sub.ctx);
      const c = sub.ctx;          // ⚠(cxxx)＝置換不成立でも「決定の消費」は必ず反映する
      const s = ownerState(found, c);
      const removed = removeFromField(cardNum, s);
      // turn_signi_returned_to_hand: このターンにシグニが場から手札に戻ったフラグ（G087）
      const withHand: PlayerState = { ...removed, hand: [...removed.hand, cardNum], turn_signi_returned_to_hand: true, signi_returned_to_hand_count_this_turn: (removed.signi_returned_to_hand_count_this_turn ?? 0) + 1 };
      return done(addLog(setOwnerState(found, withHand, c),
        `${c.cardMap.get(cardNum)?.CardName ?? cardNum}`));
    }
    case 'SEND_TO_ENERGY': {
      // エナ送り（バニッシュではない）: 場から除去して対象オーナーのエナゾーンへ
      let found: Owner | null = null;
      if (ctx.ownerState.field.signi.some(s => s?.at(-1) === cardNum)) found = 'self';
      if (ctx.otherState.field.signi.some(s => s?.at(-1) === cardNum)) found = 'opponent';
      if (!found) return done(ctx);
      const sub = applyEffectLeaveSubstitutes(cardNum, found, ctx);
      if (sub.replaced) return done(sub.ctx);
      const c = sub.ctx;          // ⚠(cxxx)＝置換不成立でも「決定の消費」は必ず反映する
      const s = ownerState(found, c);
      const removed = removeFromField(cardNum, s);
      const withEnergy: PlayerState = { ...removed, energy: [...removed.energy, cardNum] };
      return done(addLog(setOwnerState(found, withEnergy, c),
        `${c.cardMap.get(cardNum)?.CardName ?? cardNum}をエナゾーンに置く`));
    }
    case 'TRASH': {
      const trashAction = action as TrashAction;
      const tgt = trashAction.target;
      if (tgt.type === 'SIGNI') {
        // フィールドのシグニをトラッシュ
        const owner = tgt.owner as Owner;
        const s = ownerState(owner, ctx);
        if (s.field.signi.some(stack => stack?.at(-1) === cardNum)) {
          const sub = applyEffectLeaveSubstitutes(cardNum, owner, ctx);
          if (sub.replaced) return done(sub.ctx);
          const c = sub.ctx;      // ⚠(cxxx)＝置換不成立でも「決定の消費」は必ず反映する
          const s2 = ownerState(owner, c);
          const wasPuppet = (s2.field.puppet_signi ?? []).includes(cardNum);
          const trashedLevel = parseInt(c.cardMap.get(getCardNum(cardNum))?.Level ?? '', 10);
          const removed = removeFromField(cardNum, s2);
          const destination = trashAction.destination ?? 'trash';
          const newS: PlayerState = destination === 'lrig_trash'
            ? { ...removed, lrig_trash: [...removed.lrig_trash, cardNum] }
            : { ...removed, trash: [...removed.trash, cardNum] };
          const movedCtx = setOwnerState(owner, newS, c);
          const causeCtx = trashAction.asCost
            ? {
                ...movedCtx,
                fieldTrashCostCards: [...(movedCtx.fieldTrashCostCards ?? []), cardNum],
                ownerState: {
                  ...movedCtx.ownerState,
                  last_field_trash_level: Number.isNaN(trashedLevel) ? undefined : trashedLevel,
                  last_cost_trashed_puppet: wasPuppet,
                  last_cost_trashed_cards: [...(movedCtx.ownerState.last_cost_trashed_cards ?? []), getCardNum(cardNum)],
                },
              }
            : movedCtx;
          return done(addLog(causeCtx,
            `${c.cardMap.get(cardNum)?.CardName ?? cardNum}を${destination === 'lrig_trash' ? 'ルリグトラッシュ' : 'トラッシュ'}へ`));
        }
        return done(ctx);
      }
      // DECK_CARD: デッキ（公開中の1枚）からトラッシュへ（LOOK_PICK_CHAIN の trash ステージ等）
      if (tgt.type === 'DECK_CARD') {
        const owner = (tgt.owner as Owner) ?? 'self';
        const s = ownerState(owner, ctx);
        const di = s.deck.indexOf(cardNum);
        if (di >= 0) {
          const newDeck = [...s.deck]; newDeck.splice(di, 1);
          // V-83（2026-08-24）＝選択解決後の1枚ずつ経路（`SEARCH`→`then:TRASH{DECK_CARD}`／`LOOK_PICK_CHAIN` の
          // trash ステージ）も**同じ理由で発生源を記録する**（上の inline 経路と揃える）。
          const newS: PlayerState = { ...s, deck: newDeck, trash: [...s.trash, cardNum], last_effect_mill_source: ctx.sourceCardNum };
          return done(addLog(setOwnerState(owner, newS, ctx), `${ctx.cardMap.get(getCardNum(cardNum))?.CardName ?? cardNum}をトラッシュへ`));
        }
        return done(ctx);
      }
      // ENERGY_CARD: エナからトラッシュ（選択制の「エナをN枚トラッシュ」。count:'ALL' は execTrash 内で inline 処理、
      //   数値countは selectOrInteract 経由でここに来る。この分岐が無いと選択後に何も起きず no-op になっていた）
      if (tgt.type === 'ENERGY_CARD') {
        for (const owner of ['self', 'opponent'] as Owner[]) {
          const s = ownerState(owner, ctx);
          const ei = s.energy.indexOf(cardNum);
          if (ei >= 0) {
            // PREVENT_ZONE_MOVE_BY_OPP: 相手効果でエナをトラッシュに移動させない（inline版と同じ保護）
            if (owner === 'opponent' && (ctx.otherProtectedZones?.includes('energy') || activeOppMoveImmunityZones(ctx.otherState).includes('energy'))) {
              return done(addLog(ctx, 'エナ保護により効果なし'));
            }
            const newEnergy = [...s.energy]; newEnergy.splice(ei, 1);
            const trashedLevel = parseInt(ctx.cardMap.get(getCardNum(cardNum))?.Level || '', 10);
            const newS: PlayerState = {
              ...s,
              energy: newEnergy,
              trash: [...s.trash, cardNum],
              ...(trashAction.asCost ? {
                last_cost_trashed_cards: [...(s.last_cost_trashed_cards || []), getCardNum(cardNum)],
                last_cost_energy_trash_count: (s.last_cost_energy_trash_count || 0) + 1,
                last_cost_energy_trash_level_sum:
                  (s.last_cost_energy_trash_level_sum || 0) + (Number.isFinite(trashedLevel) ? trashedLevel : 0),
              } : {}),
            };
            return done(addLog(setOwnerState(owner, newS, ctx), `${ctx.cardMap.get(cardNum)?.CardName ?? cardNum}をエナからトラッシュへ`));
          }
        }
        return done(ctx);
      }
      // HAND_CARD: hand からトラッシュ（同名カードが複数ある場合は先頭の1枚のみ）。
      // ⚠ここは SELECT_TARGET を挟む経路（count:1 等）の再開点。即時適用パス（execTrash の applyTrashHand）が更新する
      // hand_discarded_just / turn_hand_discarded_count / hand_trashed_by_opp_this_turn の3フィールドと手札保護が
      // 丸ごと抜けており、ON_HAND_DISCARDED 不発火・「この方法で手札を捨てた場合」条件の不成立・HAND_TRASHED_BY_OPP
      // （「代わりに」置換の起点）の不成立を併発していた（続き81・タスク12(iv)・§7 trashCounterOpp で発見）。
      for (const owner of ['self', 'opponent'] as Owner[]) {
        const s = ownerState(owner, ctx);
        const hi = s.hand.indexOf(cardNum);
        if (hi >= 0) {
          // PREVENT_ZONE_MOVE_BY_OPP: 相手効果で手札をトラッシュに移動させない（即時適用パスと同じ保護）
          if (owner === 'opponent' && (ctx.otherProtectedZones?.includes('hand') || activeOppMoveImmunityZones(ctx.otherState).includes('hand'))) {
            return done(addLog(ctx, '手札保護により効果なし'));
          }
          const newHand = [...s.hand];
          newHand.splice(hi, 1);
          const newS: PlayerState = {
            ...s, hand: newHand, trash: [...s.trash, cardNum],
            hand_discarded_just: [...(s.hand_discarded_just ?? []), cardNum], // ON_HAND_DISCARDED 検出用（BattleScreenが消化）
            // 相手側に捨てさせた＝その相手から見れば「対戦相手の効果によって」（byOwnEffect の否定材料）
            hand_discarded_just_by_opp: owner === 'opponent' ? true : s.hand_discarded_just_by_opp,
            turn_hand_discarded_count: owner === 'self'
              ? (s.turn_hand_discarded_count ?? 0) + 1 : s.turn_hand_discarded_count,
            // owner==='opponent' ＝ 実行者から見た相手の手札を捨てさせた＝その相手から見れば「対戦相手の効果で捨てられた」
            hand_trashed_by_opp_this_turn: owner === 'opponent'
              ? (s.hand_trashed_by_opp_this_turn ?? 0) + 1 : s.hand_trashed_by_opp_this_turn,
          };
          return done(addLog(setOwnerState(owner, newS, ctx), `${ctx.cardMap.get(cardNum)?.CardName ?? cardNum}をトラッシュへ`));
        }
      }
      return done(ctx);
    }
    case 'EXILE': {
      // 選択カードをゲームから除外。①場のシグニなら場から取り除く（トラッシュ経由しない）②トラッシュなら取り除く
      const exTgt = (action as import('../types/effects').ExileAction).target;
      // 場のシグニ除外: どちらかの場にあれば removeFromField で消去
      for (const o of ['self', 'opponent'] as Owner[]) {
        const s = ownerState(o, ctx);
        if (s.field.signi.some(st => st?.includes(cardNum))) {
          const sub = applyEffectLeaveSubstitutes(cardNum, o, ctx);
          if (sub.replaced) return done(sub.ctx);
          const c = sub.ctx;      // ⚠(cxxx)＝置換不成立でも「決定の消費」は必ず反映する
          // ⚠ここは `includes`（下のカードも除外対象）なので `isOnFieldTop` は使わない。
          const removed = removeFromField(cardNum, ownerState(o, c));
          return done(addLog(setOwnerState(o, { ...removed, excluded: [...(removed.excluded ?? []), cardNum] }, c),
            `${c.cardMap.get(cardNum)?.CardName ?? cardNum}をゲームから除外`));
        }
      }
      // トラッシュからの除外（owner優先、なければ両者を探索）
      const owners: Owner[] = exTgt.owner === 'opponent' ? ['opponent'] : exTgt.owner === 'self' ? ['self'] : ['self', 'opponent'];
      // 手札からの除外（WX14-011①）＝**トラッシュを経由せず**手札から消す。
      if (exTgt.type === 'HAND_CARD') {
        for (const o of owners) {
          const s = ownerState(o, ctx);
          const hi = s.hand.indexOf(cardNum);
          if (hi >= 0) {
            const newHand = [...s.hand]; newHand.splice(hi, 1);
            return done(addLog(setOwnerState(o, { ...s, hand: newHand, excluded: [...(s.excluded ?? []), cardNum] }, ctx),
              `${ctx.cardMap.get(cardNum)?.CardName ?? cardNum}を手札からゲームから除外`));
          }
        }
      }
      if (exTgt.type === 'LRIG_DECK_CARD') {
        for (const o of owners) {
          const s = ownerState(o, ctx);
          const i = s.lrig_deck.indexOf(cardNum);
          if (i >= 0) {
            const lrigDeck = [...s.lrig_deck]; lrigDeck.splice(i, 1);
            return done(addLog(setOwnerState(o, { ...s, lrig_deck: lrigDeck, excluded: [...(s.excluded ?? []), cardNum] }, ctx),
              `${ctx.cardMap.get(getCardNum(cardNum))?.CardName ?? cardNum}をルリグデッキからゲームから除外`));
          }
        }
      }
      for (const o of owners) {
        const s = ownerState(o, ctx);
        const ti = s.trash.indexOf(cardNum);
        if (ti >= 0) {
          const newTrash = [...s.trash]; newTrash.splice(ti, 1);
          return done(addLog(setOwnerState(o, { ...s, trash: newTrash, excluded: [...(s.excluded ?? []), cardNum] }, ctx),
            `${ctx.cardMap.get(cardNum)?.CardName ?? cardNum}をゲームから除外`));
        }
      }
      return done(ctx);
    }
    case 'PLACE_FACEDOWN_LRIG_ZONE': {
      // 手札から選んだ1枚を裏向きでルリグゾーンへ（§6.4 O-3）。デッキトップ版は選択を挟まない。
      const sPFL = ctx.ownerState;
      const hi = sPFL.hand.indexOf(cardNum);
      if (hi < 0) return done(ctx);
      return done({
        ...addLog({
          ...ctx,
          ownerState: {
            ...sPFL,
            hand: sPFL.hand.filter((_, i) => i !== hi),
            facedown_lrig_zone_cards: [...(sPFL.facedown_lrig_zone_cards ?? []), cardNum],
          },
        }, `${ctx.cardMap.get(getCardNum(cardNum))?.CardName ?? cardNum}を裏向きでルリグゾーンへ`),
        lastProcessedCards: [cardNum],
      });
    }
    case 'LEVEL_MODIFY': {
      const lmAction = action as import('../types/effects').LevelModifyAction;
      const tgtOwner: Owner = lmAction.target.owner === 'any'
        ? (ctx.ownerState.field.signi.some(s => s?.at(-1) === cardNum) ? 'self' : 'opponent')
        : lmAction.target.owner as Owner;
      const s = ownerState(tgtOwner, ctx);
      const mods = [...(s.temp_level_mods ?? []), { cardNum, delta: lmAction.delta }];
      return done(addLog(setOwnerState(tgtOwner, { ...s, temp_level_mods: mods }, ctx),
        `${ctx.cardMap.get(cardNum)?.CardName ?? cardNum} レベル${lmAction.delta > 0 ? '+' : ''}${lmAction.delta}`));
    }
    case 'POWER_MODIFY': {
      const pmAction = action as PowerModifyAction;
      // ⚠**対象選択を挟む経路（`applyDirectAction`）でも `deltaFromZone` を解く**（§6.4 O-3）。
      //   `execPowerModify` 側だけ直すと、選択UIを通る対象（thisCardOnly を含む）では delta が
      //   `resolveNum(0)` に潰れて**無言でパワー±0**になる（初回実装でこれを踏んだ）。
      const delta = pmAction.deltaFromZone
        ? resolveCountRef(pmAction.delta, ctx, pmAction.deltaFromZone)
        : resolveNum(pmAction.delta);
      // owner:'any' は選ばれたカードの所属フィールドを判定して該当プレイヤーへ適用
      const tgtOwner: Owner = pmAction.target.owner === 'any'
        ? (ctx.ownerState.field.signi.some(s => s?.at(-1) === cardNum) ? 'self' : 'opponent')
        : pmAction.target.owner as Owner;
      const powerModKey = pmAction.duration === 'UNTIL_OPP_TURN_END' ? 'power_mods_until_opp_turn' : 'temp_power_mods';
      const s = ownerState(tgtOwner, ctx);
      const mods = [...(s[powerModKey] ?? []), { cardNum, delta, srcType: srcTypeOf(ctx), srcCardNum: ctx.sourceCardNum }];
      const newS: PlayerState = { ...s, [powerModKey]: mods };
      return done(addLog(setOwnerState(tgtOwner, newS, ctx), `パワー${delta > 0 ? '+' : ''}${delta}`));
    }
    case 'POWER_MODIFY_BY_TARGET_LEVEL': {
      const a = action as PowerModifyByTargetLevelAction;
      const lv = parseInt(ctx.cardMap.get(cardNum)?.Level ?? '0', 10);
      const delta = a.deltaPerLevel * (isNaN(lv) ? 0 : lv);
      const tgtOwnerBTL = a.target.owner === 'any' ? 'self' : a.target.owner as Owner;
      const sBTL = ownerState(tgtOwnerBTL, ctx);
      const modsBTL = [...(sBTL.temp_power_mods ?? []), { cardNum, delta }];
      return done(addLog(setOwnerState(tgtOwnerBTL, { ...sBTL, temp_power_mods: modsBTL }, ctx),
        `${delta > 0 ? '+' : ''}${delta}（Lv${lv}）`));
    }
    case 'POWER_MULTIPLY': {
      const pmxAction = action as import('../types/effects').PowerMultiplyAction;
      const tgtOwnerPMX = pmxAction.target.owner === 'any' ? 'self' : pmxAction.target.owner as Owner;
      const sPMX = ownerState(tgtOwnerPMX, ctx);
      const curPwPMX = ctx.effectivePowers?.get(cardNum) ?? (parseInt(ctx.cardMap.get(cardNum)?.Power ?? '0') || 0);
      const deltaPMX = curPwPMX * (pmxAction.multiplier - 1);
      const modsPMX = [...(sPMX.temp_power_mods ?? []), { cardNum, delta: deltaPMX }];
      const newSPMX: PlayerState = { ...sPMX, temp_power_mods: modsPMX };
      return done(addLog(setOwnerState(tgtOwnerPMX, newSPMX, ctx), `×${pmxAction.multiplier}（+${deltaPMX}）`));
    }
    // ⚠この3つ（ADD_TO_HAND / ADD_TO_ENERGY / ADD_TO_BEAT）は **`owner` を持つのに読んでいなかった**＝
    //   `lookPickThenAction(then, owner)` は owner つきで組み立てるので、`owner:'opponent'` の公開ピックは
    //   **相手のデッキから抜いて自分の手札へ入れる**（＝カードが盤面を跨いで移る）。§6.4 O-2 で
    //   「対戦相手が自分のデッキを掘る」経路を開くまでは live 実例0件だったため無害だった。
    //   `owner:'self'` の既存全効果は `ownerState('self', ctx) === ctx.ownerState` で挙動不変。
    case 'ADD_TO_HAND': {
      // インスタンスIDで正確な1枚を特定しデッキ/トラッシュから除去して手札へ
      const cn = getCardNum(cardNum);
      const ownerH = (action as { owner?: Owner }).owner ?? 'self';
      let s = { ...ownerState(ownerH, ctx) };
      const di = s.deck.indexOf(cardNum);
      if (di >= 0) {
        const newDeck = [...s.deck]; newDeck.splice(di, 1);
        s = { ...s, deck: newDeck };
      } else {
        const ti = s.trash.indexOf(cardNum);
        if (ti >= 0) {
          const newTrash = [...s.trash]; newTrash.splice(ti, 1);
          s = { ...s, trash: newTrash };
        }
      }
      const newS: PlayerState = { ...s, hand: [...s.hand, cardNum] };
      return done(addLog(setOwnerState(ownerH, newS, ctx), `${ctx.cardMap.get(cn)?.CardName ?? cn}を手札に加える`));
    }
    case 'ADD_TO_ENERGY': {
      // デッキ/トラッシュから除去してエナゾーンへ
      const cnE = getCardNum(cardNum);
      const ownerE = (action as { owner?: Owner }).owner ?? 'self';
      let sE = { ...ownerState(ownerE, ctx) };
      const diE = sE.deck.indexOf(cardNum);
      if (diE >= 0) {
        const newDeck = [...sE.deck]; newDeck.splice(diE, 1);
        sE = { ...sE, deck: newDeck };
      } else {
        const tiE = sE.trash.indexOf(cardNum);
        if (tiE >= 0) {
          const newTrash = [...sE.trash]; newTrash.splice(tiE, 1);
          sE = { ...sE, trash: newTrash };
        }
      }
      const newSE: PlayerState = { ...sE, energy: [...sE.energy, cardNum] };
      return done(addLog(setOwnerState(ownerE, newSE, ctx), `${ctx.cardMap.get(cnE)?.CardName ?? cnE}をエナゾーンへ`));
    }
    case 'ADD_TO_BEAT': {
      // 公開中のデッキ（またはトラッシュ/手札）のカードを【ビート】にする（beat_zone へ＋ON_BECOME_BEAT 用フラグ）。WDK14-008
      const cnB = getCardNum(cardNum);
      const ownerB = (action as { owner?: Owner }).owner ?? 'self';
      let sB = { ...ownerState(ownerB, ctx) };
      const diB = sB.deck.indexOf(cardNum);
      if (diB >= 0) { const d = [...sB.deck]; d.splice(diB, 1); sB = { ...sB, deck: d }; }
      else {
        const tiB = sB.trash.indexOf(cardNum);
        if (tiB >= 0) { const t = [...sB.trash]; t.splice(tiB, 1); sB = { ...sB, trash: t }; }
        else { const hiB = sB.hand.indexOf(cardNum); if (hiB >= 0) { const h = [...sB.hand]; h.splice(hiB, 1); sB = { ...sB, hand: h }; } }
      }
      const newSB = addToBeatZone(sB, [cardNum]);
      return done(addLog(setOwnerState(ownerB, newSB, ctx), `${ctx.cardMap.get(cnB)?.CardName ?? cnB}を【ビート】にする`));
    }
    case 'TRANSFER_TO_HAND': {
      const src = (action as TransferToHandAction).source;
      const state = ownerState(src.owner, ctx);
      let newS = { ...state };
      if (src.type === 'TRASH_CARD') {
        const ti = newS.trash.indexOf(cardNum);
        if (ti >= 0) { const t = [...newS.trash]; t.splice(ti, 1); newS = { ...newS, trash: t }; }
        newS = { ...newS, hand: [...newS.hand, cardNum] };
      } else if (src.type === 'ENERGY_CARD') {
        const ei = newS.energy.indexOf(cardNum);
        if (ei >= 0) { const e = [...newS.energy]; e.splice(ei, 1); newS = { ...newS, energy: e }; }
        newS = { ...newS, hand: [...newS.hand, cardNum] };
      }
      return done(addLog(setOwnerState(src.owner, newS, ctx), `${ctx.cardMap.get(cardNum)?.CardName ?? cardNum}を手札に加える`));
    }
    case 'ADD_TO_FIELD': {
      const owner = (action as AddToFieldAction).owner;
      const asDown = (action as AddToFieldAction).asDown;
      const state = ownerState(owner, ctx);
      const placedFromHand = state.hand.includes(cardNum);
      if (placedFromHand) {
        const printedPower = ctx.cardMap.get(getCardNum(cardNum))?.Power ?? '';
        const power = printedPower === '∞' ? Infinity : parseInt(printedPower, 10);
        if (isHandSigniPlayBlockedByPower(state, power)) {
          return done(addLog(ctx, `${ctx.cardMap.get(getCardNum(cardNum))?.CardName ?? cardNum}は手札から場に出せない`));
        }
      }
      // 配置制限（「シグニをN体までしか場に出せない」）。⚠**元の領域から取り除く前**に弾く
      //   （取り除いてから弾くとカードが消失する）。
      {
        const blockedDF = deployLimitBlockedFor(owner, cardNum, ctx);
        if (blockedDF) {
          return done(addLog(ctx, deployLimitLogMessage(
            blockedDF, ctx.cardMap.get(getCardNum(cardNum))?.CardName ?? cardNum)));
        }
      }
      let newS = { ...state };
      const placedFromNonHand = state.deck.includes(cardNum) || state.trash.includes(cardNum) || state.energy.includes(cardNum);
      // 場に出すカードを現在の領域（デッキ/手札/トラッシュ/エナ）から除去する。
      // src 指定の有無に依らず、cardNum が存在する領域から取り除く（デッキ探索→場出しでデッキに残る不具合の修正）。
      const di = newS.deck.indexOf(cardNum);
      if (di >= 0) { const dk = [...newS.deck]; dk.splice(di, 1); newS = { ...newS, deck: dk }; }
      else {
        const hi = newS.hand.indexOf(cardNum);
        if (hi >= 0) { const h = [...newS.hand]; h.splice(hi, 1); newS = { ...newS, hand: h }; }
        else {
          const ti = newS.trash.indexOf(cardNum);
          if (ti >= 0) { const t = [...newS.trash]; t.splice(ti, 1); newS = { ...newS, trash: t }; }
          else {
            const ei = newS.energy.indexOf(cardNum);
            if (ei >= 0) { const e = [...newS.energy]; e.splice(ei, 1); newS = { ...newS, energy: e }; }
          }
        }
      }
      if (placedFromHand) newS = clearNonHandPlacement(newS, cardNum);
      else if (placedFromNonHand) newS = recordNonHandPlacement(newS, cardNum);
      // 🆕B8: 由来ゾーンをここで確定して記録する（`triggerCondition.fromZones` の解決に使う）。
      // ⚠**取り除いた後の盤面差分からは復元できない**＝下の SELECT_SIGNI_ZONE でインタラクションを挟むと、
      //   resume 後の before スナップショットにはもう元の領域に居ない。記録が唯一の手掛かりになる。
      {
        const originZone = placedFromHand ? 'hand'
          : state.deck.includes(cardNum) ? 'deck'
          : state.trash.includes(cardNum) ? 'trash'
          : state.energy.includes(cardNum) ? 'energy'
          : null;
        if (originZone) {
          newS = {
            ...newS,
            signi_placed_origin_this_turn: [
              ...(newS.signi_placed_origin_this_turn ?? []).filter(e => !e.startsWith(`${cardNum}:`)),
              `${cardNum}:${originZone}`,
            ],
          };
        }
      }
      const signi = [...newS.field.signi] as (string[] | null)[];
      const emptyZones = signi.map((z, i) => ({ i, empty: !z || z.length === 0 })).filter(x => x.empty);
      if (emptyZones.length === 0) {
        return done(addLog(setOwnerState(owner, newS, ctx), `空きシグニゾーンなし（${ctx.cardMap.get(cardNum)?.CardName ?? cardNum}配置不可）`));
      }
      if (emptyZones.length >= 2 && (owner === 'self' || owner === 'opponent')) {
        const ctxAfterRemove = setOwnerState(owner, newS, ctx);
        return needsInteraction(ctxAfterRemove, { type: 'SELECT_SIGNI_ZONE', cardNum, owner, ...(asDown ? { asDown } : {}),
          // §6.4 O-2: 明示指定のときだけ相手応答（既定＝従来どおり効果オーナーがゾーンを選ぶ）
          ...((action as AddToFieldAction).opponentSelectsZone ? { opponentResponds: true } : {}) });
      }
      // 空きゾーン1つのみ: 自動配置
      signi[emptyZones[0].i] = [cardNum];
      newS = { ...newS, field: { ...newS.field, signi } };
      if (asDown) {
        const newDown = [...(newS.field.signi_down ?? [false, false, false])] as boolean[];
        newDown[emptyZones[0].i] = true;
        newS = { ...newS, field: { ...newS.field, signi_down: newDown } };
      }
      return done(addLog(setOwnerState(owner, newS, ctx), `${ctx.cardMap.get(cardNum)?.CardName ?? cardNum}を場に出す`));
    }
    case 'ATTACH_ACCE': {
      const acceAction = action as import('../types/effects').AttachAcceAction;
      const tgtState = ownerState(acceAction.targetSigniOwner, ctx);
      const srcState = ownerState(acceAction.sourceOwner, ctx);
      const tgtOther = acceAction.targetSigniOwner === 'opponent' ? ctx.ownerState : ctx.otherState;
      const isTgtTurn = acceAction.targetSigniOwner === 'opponent' ? !(ctx.isOwnerTurn ?? true) : (ctx.isOwnerTurn ?? true);
      // fromHand step1完了: cardNum = 手札から選んだアクセカード。続けてホストシグニ選択(step2)を発行する。
      if (acceAction._selectingAcceFromHand) {
        const hostCands = (tgtState.field.signi ?? []).flatMap((stack, i) => {
          if (!stack || stack.length === 0) return [];
          const top = stack[stack.length - 1];
          if (!canAttachAcceToHost(tgtState, tgtOther, top, i, ctx, isTgtTurn)) return [];
          if (acceAction.targetFilter && !matchesFilter(ctx.cardMap.get(top), acceAction.targetFilter)) return [];
          return [top];
        });
        if (hostCands.length === 0) return done(addLog(ctx, 'アクセ対象なし'));
        const scope: TargetScope = acceAction.targetSigniOwner === 'opponent' ? 'opp_field' : 'self_field';
        // 選んだアクセカード(cardNum)を _pickedAcceCard に載せ、step2 の thenAction へ確実に引き渡す
        return needsInteraction(addLog(ctx, 'どのシグニにアクセしますか？'), {
          type: 'SELECT_TARGET',
          candidates: hostCands,
          count: 1,
          optional: false,
          targetScope: scope,
          thenAction: { ...acceAction, _selectingAcceFromHand: false, _pickedAcceCard: cardNum } as import('../types/effects').EffectAction,
        });
      }
      // step2 / エナ経路: cardNum = SELECT_TARGETで選ばれたホストシグニ
      const zoneIdx  = tgtState.field.signi.findIndex(s => s?.at(-1) === cardNum);
      if (zoneIdx < 0) return done(ctx);
      if (!canAttachAcceToHost(tgtState, tgtOther, cardNum, zoneIdx, ctx, isTgtTurn)) return done(ctx);
      // acceカード = _pickedAcceCard（手札選択後）／sourceCardNum（エナゾーンからの場合）／lastProcessedCards[0]
      const acceCardNum = acceAction._pickedAcceCard ?? ctx.sourceCardNum ?? ctx.lastProcessedCards?.[0];
      if (!acceCardNum) return done(ctx);
      // エナゾーンまたは手札からアクセカードを除去
      let newSrc = { ...srcState };
      if (newSrc.energy.includes(acceCardNum)) {
        newSrc = { ...newSrc, energy: newSrc.energy.filter(n => n !== acceCardNum) };
      } else if (newSrc.hand.includes(acceCardNum)) {
        newSrc = { ...newSrc, hand: newSrc.hand.filter(n => n !== acceCardNum) };
      } else {
        return done(addLog(ctx, `ATTACH_ACCE: ${ctx.cardMap.get(acceCardNum)?.CardName ?? acceCardNum}がエナ/手札にない`));
      }
      let ctx2 = setOwnerState(acceAction.sourceOwner, newSrc, ctx);
      // signi_acce[zoneIdx] の末尾へ追加
      const tgt2 = ownerState(acceAction.targetSigniOwner, ctx2);
      const newAcce = cloneAcceSlots(tgt2.field);
      newAcce[zoneIdx] = [...acceCardsAt(tgt2.field, zoneIdx), acceCardNum];
      const newTgt: import('../types').PlayerState = { ...tgt2, field: { ...tgt2.field, signi_acce: newAcce } };
      ctx2 = setOwnerState(acceAction.targetSigniOwner, newTgt, ctx2);
      const acceCardName  = ctx.cardMap.get(acceCardNum)?.CardName ?? acceCardNum;
      const signiCardName = ctx.cardMap.get(cardNum)?.CardName ?? cardNum;
      // ON_ACCE トリガー: アクセしたことでフィールドシグニの ON_ACCE AUTO 効果を発火
      // （BattleScreen側の queueCardEffects で ON_ACCE を処理）
      const ctx3 = addLog(ctx2, `${acceCardName}を${signiCardName}にアクセ`);
      // acce_just_done フラグ: BattleScreenで ON_ACCE トリガーを検出するために使用
      const tgt3 = ownerState(acceAction.targetSigniOwner, ctx3);
      const withFlag: import('../types').PlayerState = {
        ...tgt3,
        acce_just_done: cardNum, // ホストシグニのcardNum
      };
      return done(setOwnerState(acceAction.targetSigniOwner, withFlag, ctx3));
    }
    case 'FIELD_SIGNI_TO_ACCE': {
      const fieldAcce = action as import('../types/effects').FieldSigniToAcceAction;
      if (fieldAcce._reattachSelectingHost && fieldAcce._reattachAcceCard) {
        const state = ownerState(fieldAcce.targetSigniOwner, ctx);
        const other = fieldAcce.targetSigniOwner === 'opponent' ? ctx.ownerState : ctx.otherState;
        const isStateTurn = fieldAcce.targetSigniOwner === 'opponent' ? !(ctx.isOwnerTurn ?? true) : (ctx.isOwnerTurn ?? true);
        const hostZone = state.field.signi.findIndex(s => s?.at(-1) === cardNum);
        const trashIdx = state.trash.indexOf(fieldAcce._reattachAcceCard);
        if (hostZone < 0 || trashIdx < 0 || !canAttachAcceToHost(state, other, cardNum, hostZone, ctx, isStateTurn)) return done(ctx);
        const trash = [...state.trash]; trash.splice(trashIdx, 1);
        const acce = cloneAcceSlots(state.field); acce[hostZone] = [...acceCardsAt(state.field, hostZone), fieldAcce._reattachAcceCard];
        return done(addLog(setOwnerState(fieldAcce.targetSigniOwner, {
          ...state, trash, field: { ...state.field, signi_acce: acce }, acce_just_done: cardNum,
        }, ctx), `${ctx.cardMap.get(fieldAcce._reattachAcceCard)?.CardName ?? fieldAcce._reattachAcceCard}を移設`));
      }
      // step1: 選ばれた場のシグニを内部フィールドに保持し、host選択へ進む。
      if (fieldAcce._pickedFieldSigni === '__SELECTED__') {
        return executeAction({ ...fieldAcce, _pickedFieldSigni: cardNum }, ctx);
      }
      const acceCardNum = fieldAcce.sourceThisCard ? ctx.sourceCardNum : fieldAcce._pickedFieldSigni;
      if (!acceCardNum) return done(ctx);
      const tgtBefore = ownerState(fieldAcce.targetSigniOwner, ctx);
      const tgtOther = fieldAcce.targetSigniOwner === 'opponent' ? ctx.ownerState : ctx.otherState;
      const isTgtTurn = fieldAcce.targetSigniOwner === 'opponent' ? !(ctx.isOwnerTurn ?? true) : (ctx.isOwnerTurn ?? true);
      const hostZone = tgtBefore.field.signi.findIndex(s => s?.at(-1) === cardNum);
      if (hostZone < 0 || !canAttachAcceToHost(tgtBefore, tgtOther, cardNum, hostZone, ctx, isTgtTurn)) return done(ctx);
      const srcBefore = ownerState(fieldAcce.sourceOwner, ctx);
      const srcZone = srcBefore.field.signi.findIndex(s => s?.at(-1) === acceCardNum);
      const previousAcce = srcZone >= 0 ? (srcBefore.field.signi_acce?.[srcZone]?.[0] ?? null) : null;
      if (!srcBefore.field.signi.some(s => s?.at(-1) === acceCardNum)) {
        return done(addLog(ctx, 'FIELD_SIGNI_TO_ACCE: アクセ元が場にない'));
      }
      // 場離れの共通経路を通す。下敷き・チャーム・既存アクセ・ソウルのルール処理、
      // identity/status cleanup、中央board diffによる離場trigger収集を全て既存通り効かせる。
      let ctx2 = setOwnerState(fieldAcce.sourceOwner, removeFromField(acceCardNum, srcBefore), ctx);
      const tgtAfter = ownerState(fieldAcce.targetSigniOwner, ctx2);
      const hostZoneAfter = tgtAfter.field.signi.findIndex(s => s?.at(-1) === cardNum);
      if (hostZoneAfter < 0) return done(ctx2);
      const newAcce = cloneAcceSlots(tgtAfter.field);
      newAcce[hostZoneAfter] = [...acceCardsAt(tgtAfter.field, hostZoneAfter), acceCardNum];
      const withAcce: import('../types').PlayerState = {
        ...tgtAfter,
        field: { ...tgtAfter.field, signi_acce: newAcce },
        acce_just_done: cardNum,
      };
      ctx2 = setOwnerState(fieldAcce.targetSigniOwner, withAcce, ctx2);
      ctx2 = addLog(ctx2, `${ctx.cardMap.get(acceCardNum)?.CardName ?? acceCardNum}を${ctx.cardMap.get(cardNum)?.CardName ?? cardNum}にアクセ`);
      if (fieldAcce.reattachPreviousAcceOptional && previousAcce) {
        return executeAction({ ...fieldAcce, _reattachAcceCard: previousAcce, _reattachSelectingHost: true }, ctx2);
      }
      return done(ctx2);
    }
    case 'SEQUENCE': {
      // SEARCH の thenAction が SEQUENCE[REVEAL, ADD_TO_HAND] 等の場合、
      // cardNum を各ステップに引き継いで実行する
      const steps = (action as import('../types/effects').SequenceAction).steps;
      let cur = ctx;
      for (const step of steps) {
        const r = applyDirectAction(step, cardNum, cur);
        if (!r.done) return r;
        cur = { ...cur, ownerState: r.ownerState, otherState: r.otherState, logs: r.logs };
      }
      return done(cur);
    }
    case 'NEGATE_ATTACK': {
      // cardNum を対象シグニ/ルリグの negated_attacks に追加
      const na = action as import('../types/effects').NegateAttackAction;
      // §6.4 O-10（続き510）＝「このターン、あなたの効果によってシグニのアタックは無効にならない」
      // （`WX24-P4-016-E3`）。⚠**シグニ対象だけ**（原文は「シグニのアタック」）＝ルリグのアタック無効化は通す。
      // ⚠見るのは**効果を使う側**（`ctx.ownerState`）＝対戦相手の効果による無効化は止まらない。
      if (ctx.ownerState.own_effects_cannot_negate_signi_attack_this_turn && na.target.type === 'SIGNI') {
        return done(addLog(ctx, 'このターン、あなたの効果によってシグニのアタックは無効にならない'));
      }
      const tgtOwner = na.target.owner === 'any' ? 'opponent' : na.target.owner as Owner;
      const s = ownerState(tgtOwner, ctx);
      // 対象が**いま宣言中のアタッカー**なら、事前登録（negated_attacks＝アタック宣言時に見る）では止まらない。
      // 進行中のアタックは Phase2（resolvePendingSigniBattleFor）が見る cancel_current_signi_attack で落とす（Opusタスク12(cx)）。
      if (cardNum === attackingSigniOf(s)) {
        const cancelled: PlayerState = { ...s, cancel_current_signi_attack: true };
        return done(addLog(setOwnerState(tgtOwner, cancelled, ctx),
          `${ctx.cardMap.get(getCardNum(cardNum))?.CardName ?? cardNum}のアタックを無効にした`));
      }
      const negated = [...(s.negated_attacks ?? []), cardNum];
      // escapeDiscard: アタック側が手札N枚捨てで回避可（G154 BURST）
      const escape = na.escapeDiscard ? { ...(s.negated_attacks_escape ?? {}), [cardNum]: na.escapeDiscard } : s.negated_attacks_escape;
      const newS = { ...s, negated_attacks: negated, ...(escape ? { negated_attacks_escape: escape } : {}) };
      return done(addLog(setOwnerState(tgtOwner, newS, ctx),
        `${ctx.cardMap.get(cardNum)?.CardName ?? cardNum}`));
    }
    case 'BLOOD_CRYSTAL_ARMOR': {
      // cardNum = 血晶武装する対象シグニ（SELECT_TARGETで選ばれたフィールドシグニ）
      const bcaA = action as import('../types/effects').BloodCrystalArmorAction;
      const zoneIdx = ctx.ownerState.field.signi.findIndex(stack => stack?.at(-1) === cardNum);
      if (zoneIdx < 0) return done(ctx);
      const targetCard = ctx.cardMap.get(cardNum);
      const sameName = targetCard?.CardName;
      if (!sameName) return done(ctx);

      let newState = { ...ctx.ownerState };
      let foundCard: string | null = null;
      let shuffleNeeded = false;

      // hand / trash から同名カードを探す（deck は最後に）
      for (const src of bcaA.source) {
        if (src === 'hand') {
          const idx = newState.hand.findIndex(n => ctx.cardMap.get(n)?.CardName === sameName);
          if (idx >= 0) { foundCard = newState.hand[idx]; newState = { ...newState, hand: newState.hand.filter((_, i) => i !== idx) }; break; }
        } else if (src === 'trash') {
          const idx = newState.trash.findIndex(n => ctx.cardMap.get(n)?.CardName === sameName);
          if (idx >= 0) { foundCard = newState.trash[idx]; newState = { ...newState, trash: newState.trash.filter((_, i) => i !== idx) }; break; }
        } else if (src === 'deck') {
          const idx = newState.deck.findIndex(n => ctx.cardMap.get(n)?.CardName === sameName);
          if (idx >= 0) { foundCard = newState.deck[idx]; newState = { ...newState, deck: newState.deck.filter((_, i) => i !== idx) }; shuffleNeeded = true; break; }
        }
      }
      if (!foundCard) return done(addLog({ ...ctx, ownerState: newState }, `血晶武装対象なし（${sameName}）`));

      // シグニスタックの先頭に追加（下に置く）
      const newSigni = newState.field.signi.map((stack, i) => {
        if (i !== zoneIdx) return stack;
        return [foundCard!, ...(stack ?? [])];
      }) as (string[] | null)[];

      // 血晶武装フラグを立てる（既にtrueでもtrueのまま）
      const wasAlreadyArmored = newState.field.signi_armor?.[zoneIdx] ?? false;
      const newArmor = [...(newState.field.signi_armor ?? [false, false, false])];
      newArmor[zoneIdx] = true;

      newState = { ...newState, field: { ...newState.field, signi: newSigni, signi_armor: newArmor as boolean[] } };

      // デッキから武装した場合はシャッフル
      if (shuffleNeeded) {
        newState = { ...newState, deck: [...newState.deck].sort(() => Math.random() - 0.5) };
      }

      const newCtx = { ...ctx, ownerState: newState };
      const logMsg = `${sameName}を血晶武装${wasAlreadyArmored ? '（追加）' : ''}`;
      // wasAlreadyArmored を外部トリガー検出のために lastProcessedCards として渡す
      // ON_BLOOD_CRYSTAL_ARMOR トリガーはBattleScreen側で検出・発火する
      return done(addLog(newCtx, logMsg));
    }
    case 'PLACE_UNDER_SOURCE_SIGNI': {
      // ctx.sourceCardNum にあるシグニのゾーンに cardNum を下から追加
      const fromLoc = (action as import('../types/effects').PlaceUnderSourceSigniAction).fromLocation;
      const sourceCard = ctx.sourceCardNum;
      if (!sourceCard) return done(ctx);
      const zoneIdx = ctx.ownerState.field.signi.findIndex(stack => stack?.includes(sourceCard));
      if (zoneIdx === -1) return done(ctx);
      // 移動元のリストから除去
      let newState = { ...ctx.ownerState };
      if (fromLoc === 'trash') {
        newState = { ...newState, trash: newState.trash.filter(c => c !== cardNum) };
      } else if (fromLoc === 'hand') {
        newState = { ...newState, hand: newState.hand.filter(c => c !== cardNum) };
      } else if (fromLoc === 'energy') {
        newState = { ...newState, energy: newState.energy.filter(c => c !== cardNum) };
      } else if (fromLoc === 'field') {
        const newSigniWithRemoval = newState.field.signi.map(stack => {
          if (!stack?.includes(cardNum)) return stack;
          const filtered = stack.filter(c => c !== cardNum);
          return filtered.length > 0 ? filtered : null;
        }) as (string[] | null)[];
        newState = { ...newState, field: { ...newState.field, signi: newSigniWithRemoval } };
      }
      // ゾーンの先頭に追加（下に置く）
      const newSigni = newState.field.signi.map((stack, i) => {
        if (i !== zoneIdx) return stack;
        return [cardNum, ...(stack ?? [])];
      }) as (string[] | null)[];
      newState = { ...newState, field: { ...newState.field, signi: newSigni } };
      return done(addLog({ ...ctx, ownerState: newState },
        `${ctx.cardMap.get(cardNum)?.CardName ?? cardNum}をシグニの下に置いた`));
    }
    case 'DOWN': {
      const downA = action as import('../types/effects').DownAction;
      const downOwner: Owner = downA.target.owner === 'any' ? sideOfFieldCard(cardNum, ctx) : downA.target.owner as Owner;
      const downS = ownerState(downOwner, ctx);
      const zoneIdx = downS.field.signi.findIndex(st => st?.at(-1) === cardNum);
      if (zoneIdx < 0) return done(ctx);
      const newDown = [...(downS.field.signi_down ?? [false, false, false])] as boolean[];
      newDown[zoneIdx] = true;
      return done(addLog(setOwnerState(downOwner, { ...downS, field: { ...downS.field, signi_down: newDown } }, ctx),
        `${ctx.cardMap.get(cardNum)?.CardName ?? cardNum}をダウン`));
    }
    case 'UP': {
      // 選択式UP（「シグニ1体を対象とし、アップする」）の選択後適用。
      // UP case が無いと default→execUp 再実行で再選択ループ＝無限ループになるため明示処理（goldenTest 検出）。
      const upA = action as import('../types/effects').UpAction;
      // REVEAL_AND_PICK 等の then で SEQUENCE を直接適用する際も、thisCardOnly は
      // 選ばれたカード(cardNum)ではなく効果元を指す。通常経路と同じ execUp に委ねる。
      if (upA.target.filter?.thisCardOnly) return execUp(upA, ctx);
      const upOwner: Owner = upA.target.owner === 'any' ? sideOfFieldCard(cardNum, ctx) : upA.target.owner as Owner;
      const upS = ownerState(upOwner, ctx);
      const zoneIdx = upS.field.signi.findIndex(st => st?.at(-1) === cardNum);
      if (zoneIdx < 0) return done(ctx);
      const newDown = [...(upS.field.signi_down ?? [false, false, false])] as boolean[];
      newDown[zoneIdx] = false;
      return done(addLog(setOwnerState(upOwner, { ...upS, field: { ...upS.field, signi_down: newDown } }, ctx),
        `${ctx.cardMap.get(cardNum)?.CardName ?? cardNum}をアップ`));
    }
    case 'FREEZE': {
      const frzA = action as import('../types/effects').FreezeAction;
      const frzOwner: Owner = frzA.target.owner === 'any' ? sideOfFieldCard(cardNum, ctx) : frzA.target.owner as Owner;
      return done(applyFreezeToFieldCard(frzA, cardNum, frzOwner, ctx));
    }
    case 'GRANT_KEYWORD': {
      const gkA = action as GrantKeywordAction;
      let gkOwner: Owner | null = null;
      if (ctx.ownerState.field.signi.some(s => s?.at(-1) === cardNum)) gkOwner = 'self';
      else if (ctx.otherState.field.signi.some(s => s?.at(-1) === cardNum)) gkOwner = 'opponent';
      else if (ctx.ownerState.field.lrig.at(-1) === cardNum) gkOwner = 'self';
      else if (ctx.otherState.field.lrig.at(-1) === cardNum) gkOwner = 'opponent';
      if (!gkOwner) return done(ctx);
      const gkS = ownerState(gkOwner, ctx);
      if (isKeywordAbilityRemoved(cardNum, gkA.keyword, gkS.keyword_abilities_removed)) {
        return done(addLog(ctx, `【${gkA.keyword}】は新たに得られない`));
      }
      if (gkA.duration === 'UNTIL_OPP_TURN_END') {
        const gkGrantsOpp = { ...(gkS.keyword_grants_until_opp_turn ?? {}) };
        gkGrantsOpp[cardNum] = [...new Set([...(gkGrantsOpp[cardNum] ?? []), gkA.keyword])];
        return done(addLog(setOwnerState(gkOwner, { ...gkS, keyword_grants_until_opp_turn: gkGrantsOpp }, ctx),
          `${gkA.keyword}（次の相手ターン終了まで）：${ctx.cardMap.get(cardNum)?.CardName ?? cardNum}`));
      }
      const gkGrants = { ...(gkS.keyword_grants ?? {}) };
      gkGrants[cardNum] = [...new Set([...(gkGrants[cardNum] ?? []), gkA.keyword])];
      return done(addLog(setOwnerState(gkOwner, { ...gkS, keyword_grants: gkGrants }, ctx),
        `${gkA.keyword}：${ctx.cardMap.get(cardNum)?.CardName ?? cardNum}`));
    }
    case 'GRANT_EFFECT': {
      const geA = action as GrantEffectAction;
      const geEff = geA.effect;
      if (!geEff) return done(ctx); // rawText 未展開（PARTIAL 温存）＝no-op
      let geOwner: Owner | null = null;
      if (ctx.ownerState.field.signi.some(s => s?.at(-1) === cardNum)) geOwner = 'self';
      else if (ctx.otherState.field.signi.some(s => s?.at(-1) === cardNum)) geOwner = 'opponent';
      if (!geOwner) return done(ctx);
      const geS = ownerState(geOwner, ctx);
      const geKey = geA.duration === 'UNTIL_OPP_TURN_END' ? 'granted_effects_until_opp_turn' : 'granted_effects';
      const geGranted = { ...(geS[geKey] ?? {}) };
      geGranted[cardNum] = [...(geGranted[cardNum] ?? []), geEff];
      return done(addLog(setOwnerState(geOwner, { ...geS, [geKey]: geGranted }, ctx),
        `${ctx.cardMap.get(cardNum)?.CardName ?? cardNum}`));
    }
    case 'RETURN_ASSIST_LRIG_TO_DECK': {
      const left = ctx.ownerState.field.assist_lrig_l ?? [];
      const right = ctx.ownerState.field.assist_lrig_r ?? [];
      const fromLeft = left.at(-1) === cardNum;
      const fromRight = right.at(-1) === cardNum;
      if (!fromLeft && !fromRight) return done(ctx);
      const field = {
        ...ctx.ownerState.field,
        ...(fromLeft ? { assist_lrig_l: left.slice(0, -1) } : {}),
        ...(fromRight ? { assist_lrig_r: right.slice(0, -1) } : {}),
      };
      const newOwner = {
        ...ctx.ownerState,
        field,
        lrig_deck: [...ctx.ownerState.lrig_deck, cardNum],
      };
      return done(addLog({ ...ctx, ownerState: newOwner, lastProcessedCards: [cardNum] },
        `${ctx.cardMap.get(getCardNum(cardNum))?.CardName ?? cardNum}をルリグデッキへ戻す（下のカードは場に残す）`));
    }
    case 'TAKE_FROM_UNDER_SIGNI': {
      const ta = action as import('../types/effects').TakeFromUnderSigniAction;
      // cardNum をシグニゾーンの下カードから除去
      const newSigni = ctx.ownerState.field.signi.map(stack => {
        if (!stack) return stack;
        const idx = stack.indexOf(cardNum);
        if (idx === -1 || idx === stack.length - 1) return stack; // 上にある or 最上位(シグニ自体)
        return [...stack.slice(0, idx), ...stack.slice(idx + 1)];
      }) as (string[] | null)[];
      // ON_LEAVE_FIELD の fallback 候補は既にトラッシュにある。移動元を両方から除去してから
      // destination へ1回だけ追加し、energy/hand/trash のどれでも複製を起こさない。
      let newOwner = {
        ...ctx.ownerState,
        trash: ctx.ownerState.trash.filter(n => n !== cardNum),
        field: { ...ctx.ownerState.field, signi: newSigni },
      };
      const destLabel = ta.destination === 'hand' ? '手札' : ta.destination === 'energy' ? 'エナゾーン' : 'トラッシュ';
      if (ta.destination === 'hand') {
        newOwner = { ...newOwner, hand: [...newOwner.hand, cardNum] };
      } else if (ta.destination === 'energy') {
        newOwner = { ...newOwner, energy: [...newOwner.energy, cardNum] };
      } else {
        newOwner = { ...newOwner, trash: [...newOwner.trash, cardNum] };
      }
      // 「そうした場合」ゲート（`DID_IT_GATED_TYPES`）は**処理したカードを記録した型だけ**が空振りを判定できる。
      // `resumeSelectTarget` は picked をまとめて書き直すが、`applyDirectAction` を直接呼ぶ経路
      //（REPEAT／perCard 等）では記録が残らず、成功しても後段の「そうした場合」が空振り扱いへ倒れる
      //（Opusタスク12 (cli)＝`WX21-042-E2`「下からカード1枚をトラッシュに置く。そうした場合、…エナゾーンに置く」）。
      return done(addLog({ ...ctx, ownerState: newOwner, lastProcessedCards: [cardNum] },
        `${ctx.cardMap.get(cardNum)?.CardName ?? cardNum}${destLabel}`));
    }
    case 'REMOVE_ABILITIES': {
      // SELECT_TARGET 解決後: 選ばれた1枚の能力を失わせる（abilities_removed に追加）。
      // ⚠キー（§6.4 O-17）もここを通る＝**キー枠を見ないと持ち主が決まらず `done(ctx)` で無言の空振り**になる。
      let raOwner: Owner | null = null;
      if (ctx.ownerState.field.signi.some(s => s?.at(-1) === cardNum) || lrigZoneTops(ctx.ownerState.field).includes(cardNum)
        || keySlotCardNums(ctx.ownerState).includes(cardNum)) raOwner = 'self';
      else if (ctx.otherState.field.signi.some(s => s?.at(-1) === cardNum) || lrigZoneTops(ctx.otherState.field).includes(cardNum)
        || keySlotCardNums(ctx.otherState).includes(cardNum)) raOwner = 'opponent';
      if (!raOwner) return done(ctx);
      const raS = ownerState(raOwner, ctx);
      const raNew = applyAbilitiesRemoval(action as RemoveAbilitiesAction, raS, [cardNum]);
      // §3タスク6 E: 選んだ対象を lastProcessedCards に記録＝後続の「それのパワーを－Nする」
      //（POWER_MODIFY targetsLastProcessed）が**同じ対象**に載る（WX26-CP1-009-E1）。
      const label = (action as RemoveAbilitiesAction).keywords?.length
        ? `${ctx.cardMap.get(getCardNum(cardNum))?.CardName ?? cardNum}は${(action as RemoveAbilitiesAction).keywords!.map(k => `【${k}】`).join('')}を失い、新たに得られない`
        : `${ctx.cardMap.get(getCardNum(cardNum))?.CardName ?? cardNum}は能力を失う`;
      return done(addLog({ ...setOwnerState(raOwner, raNew, ctx), lastProcessedCards: [cardNum] }, label));
    }
    case 'ADD_TO_LIFE': {
      // fromHand 選択後: 手札からライフクロスに移動
      const atlA = action as import('../types/effects').AddToLifeAction;
      const atlOwner = atlA.owner;
      const atlS = ownerState(atlOwner, ctx);
      const hi = atlS.hand.indexOf(cardNum);
      const di = atlS.deck.indexOf(cardNum);
      const ti = atlS.trash.indexOf(cardNum);
      if (atlA.fromField) {
        // execAddToLife と同規約＝場の持ち主（target.owner）とライフの持ち主（atlA.owner）は別人でありうる。
        const fieldOwner = atlA.target?.owner === 'opponent' || atlA.target?.owner === 'self'
          ? atlA.target.owner : atlOwner;
        const fieldS = ownerState(fieldOwner, ctx);
        if (!fieldS.field.signi.some(stack => stack?.at(-1) === cardNum)) return done(ctx);
        let cur = setOwnerState(fieldOwner, removeFromField(cardNum, fieldS), ctx);
        const lifeS = ownerState(atlOwner, cur);
        cur = setOwnerState(atlOwner, { ...lifeS, life_cloth: [...lifeS.life_cloth, cardNum] }, cur);
        return done(addLog({ ...cur, lastProcessedCards: [cardNum] },
          `${ctx.cardMap.get(cardNum)?.CardName ?? cardNum}を場から${atlOwner === 'opponent' ? '対戦相手の' : ''}ライフクロスに追加`));
      }
      if (atlA.fromEnergy) {
        // エナゾーン選択後: エナ→ライフクロス（`fromEnergy`。thisCardOnly 経路は execAddToLife が
        // 選択UIを出さず即適用するので、ここへ来るのは filter 付きの複数候補ケースだけ）。
        const ei = atlS.energy.indexOf(cardNum);
        if (ei < 0) return done(ctx);
        const newEnergy = [...atlS.energy];
        newEnergy.splice(ei, 1);
        const newAtlS: PlayerState = { ...atlS, energy: newEnergy, life_cloth: [...atlS.life_cloth, cardNum] };
        return done(addLog({ ...setOwnerState(atlOwner, newAtlS, ctx), lastProcessedCards: [cardNum] },
          `${ctx.cardMap.get(getCardNum(cardNum))?.CardName ?? cardNum}をエナゾーンからライフクロスに追加`));
      }
      if (atlA.fromTrash && ti >= 0) {
        const newTrash = [...atlS.trash];
        newTrash.splice(ti, 1);
        const newAtlS: PlayerState = { ...atlS, trash: newTrash, life_cloth: [...atlS.life_cloth, cardNum] };
        return done(addLog(setOwnerState(atlOwner, newAtlS, ctx),
          `${ctx.cardMap.get(cardNum)?.CardName ?? cardNum}をトラッシュからライフクロスに追加`));
      }
      if (atlA.fromSearch && di >= 0) {
        const newDeck = [...atlS.deck];
        newDeck.splice(di, 1);
        const newAtlS: PlayerState = { ...atlS, deck: newDeck, life_cloth: [...atlS.life_cloth, cardNum] };
        return done(addLog(setOwnerState(atlOwner, newAtlS, ctx),
          `${ctx.cardMap.get(cardNum)?.CardName ?? cardNum}をライフクロスに追加`));
      }
      if (hi < 0) return done(ctx);
      const newHand = [...atlS.hand];
      newHand.splice(hi, 1);
      const newAtlS: PlayerState = { ...atlS, hand: newHand, life_cloth: [...atlS.life_cloth, cardNum] };
      return done(addLog({ ...setOwnerState(atlOwner, newAtlS, ctx), lastProcessedCards: [cardNum] },
        `${ctx.cardMap.get(cardNum)?.CardName ?? cardNum}をライフクロスに追加`));
    }
    case 'ENERGY_CHARGE': {
      // 外部SELECT_TARGET/SEARCH経由で選ばれた単一カードをエナゾーンへ。
      // このcaseが無いと default→execEnergyCharge 再実行で target（DECK_CARD等）を素通しで再評価し、
      // 選んだデッキ/トラッシュ札を無視して場のシグニ選択SELECT_TARGETへすり替わる/無限ループする（続き93）。
      const ecOwner = (action as EnergyChargeAction).target.owner;
      const ecS = ownerState(ecOwner, ctx);
      let ecNew = { ...ecS };
      if (ecS.hand.includes(cardNum)) ecNew = { ...ecNew, hand: ecNew.hand.filter(x => x !== cardNum) };
      else if (ecS.trash.includes(cardNum)) ecNew = { ...ecNew, trash: ecNew.trash.filter(x => x !== cardNum) };
      else if (ecS.deck.includes(cardNum)) ecNew = { ...ecNew, deck: ecNew.deck.filter(x => x !== cardNum) };
      else if (ecS.field.signi.some(st => st?.at(-1) === cardNum)) ecNew = removeFromField(cardNum, ecNew);
      else return done(ctx);
      const ecAction = action as EnergyChargeAction;
      const chargedLevel = parseInt(ctx.cardMap.get(getCardNum(cardNum))?.Level || '', 10);
      ecNew = {
        ...ecNew,
        energy: [...ecNew.energy, cardNum],
        ...(ecAction.asCost && ecAction.target.type === 'HAND_CARD' ? {
          last_cost_hand_to_energy_level: Number.isFinite(chargedLevel) ? chargedLevel : undefined,
        } : {}),
      };
      return done(addLog(setOwnerState(ecOwner, ecNew, ctx),
        `${ctx.cardMap.get(getCardNum(cardNum))?.CardName ?? cardNum}をエナゾーンへ`));
    }
    case 'TRANSFER_TO_DECK': {
      // 外部SELECT_TARGET経由で選ばれた単一カードをデッキへ戻す（top/bottom/shuffle）。
      // execTransferToDeck の insertToDeck と同じ配置ロジック（続き93）。
      const tdA = action as TransferToDeckAction;
      if (tdA.source.type === 'DECK_CARD') return transferSpecificDeckCard(tdA, cardNum, ctx);
      const tdOwner = tdA.source.owner;
      let tdCtx = ctx;
      const tdS = ownerState(tdOwner, ctx);
      let tdNew = { ...tdS };
      if (tdS.field.signi.some(st => st?.at(-1) === cardNum)) {
        const sub = applyEffectLeaveSubstitutes(cardNum, tdOwner, ctx);
        if (sub.replaced) return done(sub.ctx);
        tdCtx = sub.ctx;          // ⚠(cxxx)＝置換不成立でも「決定の消費」は必ず反映する
        tdNew = removeFromField(cardNum, ownerState(tdOwner, tdCtx));
      }
      else if (tdS.hand.includes(cardNum)) tdNew = { ...tdNew, hand: tdNew.hand.filter(x => x !== cardNum) };
      else if (tdS.trash.includes(cardNum)) tdNew = { ...tdNew, trash: tdNew.trash.filter(x => x !== cardNum) };
      else if (tdS.energy.includes(cardNum)) tdNew = { ...tdNew, energy: tdNew.energy.filter(x => x !== cardNum) };
      else if ((tdS.lrig_trash ?? []).includes(cardNum)) tdNew = { ...tdNew, lrig_trash: tdNew.lrig_trash.filter(x => x !== cardNum) };
      else return done(ctx);
      if (tdA.destination === 'lrig_deck') tdNew = { ...tdNew, lrig_deck: [...(tdNew.lrig_deck ?? []), cardNum] };
      else if (tdA.shuffle) tdNew = { ...tdNew, deck: shuffle([...tdNew.deck, cardNum]) };
      else if (tdA.position === 'bottom') tdNew = { ...tdNew, deck: [...tdNew.deck, cardNum] };
      else tdNew = { ...tdNew, deck: [cardNum, ...tdNew.deck] };
      return done(addLog(setOwnerState(tdOwner, tdNew, tdCtx),
        `${tdCtx.cardMap.get(getCardNum(cardNum))?.CardName ?? cardNum}を${tdA.destination === 'lrig_deck' ? 'ルリグデッキ' : `デッキ${tdA.position === 'bottom' ? '下' : '上'}`}へ`));
    }
    case 'GRANT_PROTECTION': {
      // 外部SELECT_TARGET経由で選ばれた単一シグニへ効果耐性を付与（execGrantProtection の applyProtection と同じ）。
      const gpA = action as GrantProtectionAction;
      if (!gpA.target) return done(ctx);
      const gpOwner: Owner = gpA.target.owner === 'any' ? sideOfFieldCard(cardNum, ctx) : gpA.target.owner;
      const gpKeyword = protectionKeyword(gpA);
      const gpGkey = gpA.duration === 'UNTIL_OPP_TURN_END' ? 'keyword_grants_until_opp_turn' : 'keyword_grants';
      const gpS = ownerState(gpOwner, ctx);
      const gpGrants = { ...(gpS[gpGkey] ?? {}) };
      gpGrants[cardNum] = [...new Set([...(gpGrants[cardNum] ?? []), gpKeyword])];
      return done(addLog(setOwnerState(gpOwner, { ...gpS, [gpGkey]: gpGrants }, ctx),
        `${ctx.cardMap.get(getCardNum(cardNum))?.CardName ?? cardNum}に効果耐性（${(gpA.from ?? []).join('/')}）を付与`));
    }
    case 'POWER_SET': {
      // 外部SELECT_TARGET経由で選ばれた単一シグニのパワーを固定値に（delta = value - 表記パワー）。execPowerSet と同じ。
      const psA = action as PowerSetAction;
      const psValue = resolveNum(psA.value);
      const psOwner: Owner = psA.target.owner === 'any'
        ? (ctx.ownerState.field.signi.some(st => st?.at(-1) === cardNum) ? 'self' : 'opponent')
        : psA.target.owner as Owner;
      const psS = ownerState(psOwner, ctx);
      const psBase = parseInt(ctx.cardMap.get(getCardNum(cardNum))?.Power ?? '0') || 0;
      const psMods = [...(psS.temp_power_mods ?? []).filter(m => m.cardNum !== cardNum), { cardNum, delta: psValue - psBase }];
      return done(addLog(setOwnerState(psOwner, { ...psS, temp_power_mods: psMods }, ctx),
        `${ctx.cardMap.get(getCardNum(cardNum))?.CardName ?? cardNum}のパワーを${psValue}に`));
    }
    case 'STORY_CHANGE': {
      // 外部SELECT_TARGET経由で選ばれた単一シグニのストーリーを書き換える。execStoryChange と同じ。
      // case が無いと default→execStoryChange 再実行で同一 SELECT_TARGET 再発行＝無限ループになる。
      const scA = action as StoryChangeAction;
      const scOwner: Owner = scA.target.owner === 'any'
        ? (ctx.ownerState.field.signi.some(st => st?.at(-1) === cardNum) ? 'self' : 'opponent')
        : scA.target.owner as Owner;
      const scS = ownerState(scOwner, ctx);
      const scOverrides = { ...(scS.story_overrides ?? {}), [cardNum]: scA.newStory };
      return done(addLog(setOwnerState(scOwner, { ...scS, story_overrides: scOverrides }, ctx),
        `${ctx.cardMap.get(cardNum)?.CardName ?? cardNum}のストーリーを${scA.newStory}に変更`));
    }
    default:
      // STUB 等の場合、選択中の cardNum を lastProcessedCards で引き渡す
      return executeAction(action, { ...ctx, lastProcessedCards: [cardNum] });
  }
}
