import type { PlayerState, PendingInteractionDef, TargetScope } from '../types';
import type {
  CardEffect,
  EffectAction,
  Owner,
  DrawAction,
  BanishAction,
  BounceAction,
  PowerModifyAction,
  PowerSetAction,
  TrashAction,
  EnergyChargeAction,
  EnergyChargeFromDeckAction,
  LifeCrashAction,
  ShuffleDeckAction,
  TransferToHandAction,
  AddToFieldAction,
  AddToLifeAction,
  FreezeAction,
  DownAction,
  UpAction,
  BlockActionAction,
  StoryChangeAction,
  GrantKeywordAction,
  SearchAction,
  SequenceAction,
  ChooseAction,
  ConditionalAction,
  LookAndReorderAction,
  TransferToDeckAction,
  GrantProtectionAction,
  AttachCharmAction,
  RevealAndPickAction,
  PlayFreeAction,
  CostIncreaseAction,
  PowerModifyPerFieldAction,
  PowerModifyPerLrigLevelAction,
  CharmProtectionAction,
  MutualDiscardAndDrawAction,
  RemoveAbilitiesAction,
  GainCoinAction,
  DiscardBothAction,
  RemoveCharmAction,
  ForceSigniAttackAction,
  PowerModifyPerTrashCountAction,
  PowerModifyPerLifeCountAction,
  PowerModifyByTargetLevelAction,
  PlaceVirusAction,
  AttachAcceAction,
  BloodCrystalArmorAction,
  GrantLrigAbilityAction,
  GrantEffectAction,
  StubAction,
  MILLAction,
} from '../types/effects';
import type { ExecCtx, ExecResult } from './execUtils';
import {
  done, addLog, needsInteraction, ownerState, setOwnerState, shuffle, resolveNum,
  matchesFilter, getCardNum, removeFromField, fieldCandidates, handCandidates,
  trashCandidates, energyCandidates, evalCondition, selectOrInteract, canPayOptionalCost,
  evalUseCondition, banishDestination,
} from './execUtils';
export type { ExecCtx, ExecResult };
export { matchesFilter, getCardNum, removeFromField, evalUseCondition };
import { matchesStateFilter } from './effectEngine';
import { parseEnergyCosts } from '../data/parserUtils';
import { execStub } from './execStub';
import { hasBanishResist, decodeShadowKeyword, encodeShadowKeyword } from '../utils/keywords';

// ===== 個別アクション実行 =====

function execDraw(a: DrawAction, ctx: ExecCtx): ExecResult {
  const count = resolveNum(a.count);
  const state = ownerState(a.owner, ctx);
  const canDraw = Math.min(count, state.deck.length);
  const s: PlayerState = {
    ...state,
    hand: [...state.hand, ...state.deck.slice(0, canDraw)],
    deck: state.deck.slice(canDraw),
    // このターンに効果で引いた累計枚数（CARDS_DRAWN_BY_EFFECT 条件用）。ドローフェイズのドローは drawCards 経由でここを通らない。
    cards_drawn_by_effect_this_turn: (state.cards_drawn_by_effect_this_turn ?? 0) + canDraw,
  };
  // リフレッシュはここでは行わず、効果解決後（result.done）の applyRefreshOnDone に集約する
  // （ルール：効果解決中はデッキ0のまま可能な限り解決し、その後リフレッシュ）。
  return done(addLog(setOwnerState(a.owner, s, ctx), `${count}枚ドロー`));
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
    for (const eff of (cardMap.get(top)?.effects ?? [])) {
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
    : tgt.filter;
  // colorMatchesLrig / levelLteFieldVirusCount等の動的フィルタを解決（activatorはctx.ownerState固定）
  let resolvedFilter = resolveDynamicFilter(preResolvedFilter, ctx.ownerState, ctx.cardMap, ctx.otherState, ctx.lastProcessedCards, ctx.effectivePowers);
  // powerLteSelf / powerLtSelf: 効果元シグニの実効パワーを基準に powerRange.max へ解決
  if (resolvedFilter && (resolvedFilter.powerLteSelf || resolvedFilter.powerLtSelf) && ctx.sourceCardNum) {
    const selfPower = ctx.effectivePowers?.get(ctx.sourceCardNum)
      ?? parseInt(ctx.cardMap.get(ctx.sourceCardNum)?.Power ?? '0', 10);
    const maxP = resolvedFilter.powerLtSelf ? selfPower - 1 : selfPower;
    const { powerLteSelf: _a, powerLtSelf: _b, ...rest } = resolvedFilter;
    resolvedFilter = { ...rest, powerRange: { ...(rest.powerRange ?? {}), max: maxP } };
  }
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
  const state = ownerState(tgt.owner, ctx);
  const banishProtected = tgt.owner === 'opponent' ? new Set(ctx.otherBanishProtectedNums ?? []) : new Set<string>();
  if (tgt.owner === 'opponent') {
    const grants = ctx.otherState.keyword_grants ?? {};
    for (const [cardNum, kws] of Object.entries(grants)) {
      if (kws.some(kw => kw.startsWith('PROTECTION:') && (kw.includes('BANISH') || kw.includes('any')) && kw.endsWith(':opponent'))) {
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
    if (tgt.owner === 'opponent' && ctx.sourceCardNum) {
      const zi = ctx.ownerState.field.signi.findIndex(s => s?.at(-1) === ctx.sourceCardNum);
      const frontNum = zi >= 0 ? ctx.otherState.field.signi[2 - zi]?.at(-1) : undefined;
      frontRestrict = frontNum ? [frontNum] : [];
    } else {
      frontRestrict = [];
    }
  }
  const allBanishCands = fieldCandidates(state, resolvedFilter, ctx.cardMap, ctx.effectivePowers, ctx.allColorSigniNums, ctx.fieldSigniExtraColors);
  let cands = banishProtected.size > 0 ? allBanishCands.filter(n => !banishProtected.has(n)) : allBanishCands;
  if (thisCardRestrict !== null) cands = cands.filter(n => thisCardRestrict!.includes(n));
  if (triggerRestrict !== null) cands = cands.filter(n => triggerRestrict!.includes(n));
  if (frontRestrict !== null) cands = cands.filter(n => frontRestrict!.includes(n));
  if (tgt.owner === 'opponent') {
    const grants = ctx.otherState.keyword_grants;
    cands = cands.filter(n => !hasBanishResist(n, ctx.cardMap, grants));
  }
  const scope: TargetScope = tgt.owner === 'self' ? 'self_field' : 'opp_field';

  function applyBanish(selected: string[], c: ExecCtx): ExecCtx {
    let cur = c;
    for (const num of selected) {
      const s = ownerState(tgt.owner, cur);
      // CHARM_PROTECTION（WX04-052-E1）: チャーム盾対象なら、チャーム1枚をトラッシュして場に残す（バニッシュ回避）
      if (cur.charmShieldNums?.has(num)) {
        const zi = s.field.signi.findIndex(st => st?.at(-1) === num);
        const charm = zi >= 0 ? (s.field.signi_charms?.[zi] ?? null) : null;
        if (charm) {
          const newCharms = [...(s.field.signi_charms ?? [null, null, null])];
          newCharms[zi] = null;
          cur = addLog(setOwnerState(tgt.owner, { ...s, field: { ...s.field, signi_charms: newCharms }, trash: [...s.trash, charm] }, cur),
            `${cur.cardMap.get(num)?.CardName ?? num}の【チャーム】をトラッシュしてバニッシュを回避`);
          continue;
        }
      }
      // 効果離場の powerReduction 身代わり（WX06-019）: tgt.owner==='opponent'＝相手効果で victim 側が場を離れる。
      // protector があれば victim を残し protector のパワーを下げてバニッシュを回避（自動適用）。
      if (tgt.owner === 'opponent') {
        const sub = findEffectLeavePowerReductionSubstitute(num, s, cur.cardMap);
        if (sub) {
          const mods = [...(s.temp_power_mods ?? []), { cardNum: sub.protectorNum, delta: -sub.reduction }];
          cur = addLog(setOwnerState(tgt.owner, { ...s, temp_power_mods: mods }, cur),
            `${cur.cardMap.get(sub.protectorNum)?.CardName ?? sub.protectorNum}のパワー-${sub.reduction}で${cur.cardMap.get(num)?.CardName ?? num}の場離れを身代わり`);
          continue;
        }
      }
      const removed = removeFromField(num, s);
      // バニッシュ先リダイレクト（トラッシュ/手札/デッキ下）を適用
      const opp = ownerState(tgt.owner === 'self' ? 'opponent' : 'self', cur);
      const { state: dest, log } = banishDestination(removed, opp, num);
      cur = addLog(setOwnerState(tgt.owner, dest, cur),
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
    return selectOrInteract(cands, cands.length, true, scope, a, undefined, ctx, false, {
      totalPowerMax: tgt.totalPowerMax,
      candidatePowers,
    });
  }
  if (tgt.count === 'ALL') {
    // 「好きな数」（count:'ALL' + upToCount）: プレイヤーが0〜全部を選択（自動全バニッシュにしない）。execTrash と同じ慣例。
    if (tgt.upToCount) {
      if (cands.length === 0) return done({ ...ctx, lastProcessedCards: [] });
      return selectOrInteract(cands, cands.length, true, scope, a, undefined, ctx);
    }
    return done({ ...applyBanish(cands, ctx), lastProcessedCards: cands });
  }
  // last_processed_count: 「トラッシュに置いたシグニ1体につき対戦相手のシグニ1体」→ 直前にトラッシュした枚数
  const count = (typeof tgt.count === 'object' && tgt.count.$ref === 'last_processed_count')
    ? (ctx.lastProcessedCards?.length ?? 0)
    : resolveNum(tgt.count);
  if (count <= 0) return done(addLog(ctx, 'バニッシュ数0 → スキップ'));
  // opponentSelects: 「対戦相手は自分のシグニ1体を対象とし、それをバニッシュする」→ 対戦相手が選ぶ
  const oppResponds = !!a.opponentSelects && tgt.owner === 'opponent';
  return selectOrInteract(cands, count, (a.optional ?? false) || (tgt.upToCount ?? false), scope, a, undefined, ctx, oppResponds);
}

function execBounce(a: BounceAction, ctx: ExecCtx): ExecResult {
  const tgt = a.target;
  const state = ownerState(tgt.owner, ctx);
  const bounceProtected = tgt.owner === 'opponent' ? new Set(ctx.otherBounceProtectedNums ?? []) : new Set<string>();
  if (tgt.owner === 'opponent') {
    const grants = ctx.otherState.keyword_grants ?? {};
    for (const [cardNum, kws] of Object.entries(grants)) {
      if (kws.some(kw => kw.startsWith('PROTECTION:') && (kw.includes('BOUNCE') || kw.includes('any')) && kw.endsWith(':opponent'))) {
        bounceProtected.add(cardNum);
      }
    }
  }
  const allCands = fieldCandidates(state, tgt.filter, ctx.cardMap, ctx.effectivePowers, ctx.allColorSigniNums, ctx.fieldSigniExtraColors);
  const cands = bounceProtected.size > 0 ? allCands.filter(n => !bounceProtected.has(n)) : allCands;
  const scope: TargetScope = tgt.owner === 'self' ? 'self_field' : 'opp_field';

  function applyBounce(selected: string[], c: ExecCtx): ExecCtx {
    let cur = c;
    for (const num of selected) {
      const s = ownerState(tgt.owner, cur);
      const removed = removeFromField(num, s);
      const withHand: PlayerState = { ...removed, hand: [...removed.hand, num] };
      cur = addLog(setOwnerState(tgt.owner, withHand, cur),
        `${cur.cardMap.get(num)?.CardName ?? num}を手札に戻す`);
    }
    return cur;
  }

  if (tgt.count === 'ALL') return done(applyBounce(cands, ctx));
  const count = resolveNum(tgt.count);
  return selectOrInteract(cands, count, (a.optional ?? false) || (tgt.upToCount ?? false), scope, a, undefined, ctx);
}

// 発生元カード（ctx.sourceCardNum）の Type を返す（'シグニ'/'スペル'/'アーツ'/'ルリグ' 等）。
// パワー修正の発生元種別を temp_power_mods に保持し、「あなたのシグニ/アーツ/ルリグの効果で」等の参照に使う。
function srcTypeOf(ctx: ExecCtx): string | undefined {
  const src = ctx.sourceCardNum ? ctx.cardMap.get(getCardNum(ctx.sourceCardNum)) : undefined;
  return src?.Type;
}

function execPowerModify(a: PowerModifyAction, ctx: ExecCtx): ExecResult {
  const delta = resolveNum(a.delta);
  const srcType = srcTypeOf(ctx);
  // owner:'any'（「対象のシグニ」）= 自分・対戦相手どちらのシグニも選べる
  const isAny = a.target.owner === 'any';
  const tgtOwner = isAny ? 'self' : a.target.owner as Owner;
  const state = ownerState(tgtOwner, ctx);
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
    cands = fieldCandidates(state, a.target.filter, ctx.cardMap, ctx.effectivePowers, ctx.allColorSigniNums, ctx.fieldSigniExtraColors);
    // 完全効果耐性: 相手のパワーをマイナスする効果は耐性シグニに無効（プラスは利益なので除外しない）
    if (tgtOwner === 'opponent' && delta < 0 && ctx.otherEffectImmuneNums?.size) {
      cands = cands.filter(n => !ctx.otherEffectImmuneNums!.has(n));
    }
  }
  // thisCardOnly: 効果元シグニ自身のみ（「このシグニのパワーを±X」。WX25-CP1-075 等の付与能力で使用）
  if (a.target.filter?.thisCardOnly) {
    cands = (ctx.sourceCardNum && state.field.signi.some(s => s?.at(-1) === ctx.sourceCardNum))
      ? [ctx.sourceCardNum] : [];
  }
  if (cands.length === 0) return done(ctx);

  // UNTIL_OPP_TURN_END は長期ストア power_mods_until_opp_turn へ（次の相手ターン終了時までクリアされない）
  const powerModKey = a.duration === 'UNTIL_OPP_TURN_END' ? 'power_mods_until_opp_turn' : 'temp_power_mods';

  // targetsTriggerSource: 「それ」= triggeringCardNum（なければ sourceCardNum）を自動対象
  if (a.targetsTriggerSource) {
    const autoNum = ctx.triggeringCardNum ?? ctx.sourceCardNum;
    if (autoNum && cands.includes(autoNum)) {
      const s = ownerState(tgtOwner, ctx);
      const mods = [...(s[powerModKey] ?? []), { cardNum: autoNum, delta, srcType }];
      const newS: PlayerState = { ...s, [powerModKey]: mods };
      return done(addLog(setOwnerState(tgtOwner, newS, ctx),
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
      const mods = [...(s[powerModKey] ?? []), { cardNum, delta, srcType }];
      cur = addLog(setOwnerState(own, { ...s, [powerModKey]: mods }, cur),
        `${cur.cardMap.get(cardNum)?.CardName ?? cardNum}のパワー${delta > 0 ? '+' : ''}${delta}`);
    }
    return cur;
  }

  if (a.target.count === 'ALL') return done(applyPowerMod(cands, ctx));
  const count = resolveNum(a.target.count);
  const scope: TargetScope = isAny ? 'both_field' : (tgtOwner === 'self' ? 'self_field' : 'opp_field');
  return selectOrInteract(cands, count, a.target.upToCount ?? false, scope, a, undefined, ctx);
}

function execPowerSet(a: PowerSetAction, ctx: ExecCtx): ExecResult {
  const value = resolveNum(a.value);
  const tgtOwner = a.target.owner === 'any' ? 'self' : a.target.owner as Owner;
  const state = ownerState(tgtOwner, ctx);
  const cands = fieldCandidates(state, a.target.filter, ctx.cardMap, ctx.effectivePowers, ctx.allColorSigniNums, ctx.fieldSigniExtraColors);
  if (cands.length === 0) return done(ctx);

  function applyPowerSet(targets: string[], c: ExecCtx): ExecCtx {
    const s = ownerState(tgtOwner, c);
    const filtered = (s.temp_power_mods ?? []).filter(m => !targets.includes(m.cardNum));
    const setMods = targets.map(cardNum => {
      const base = parseInt(c.cardMap.get(cardNum)?.Power ?? '0') || 0;
      return { cardNum, delta: value - base };
    });
    return addLog(setOwnerState(tgtOwner, { ...s, temp_power_mods: [...filtered, ...setMods] }, c),
      `${targets.map(n => c.cardMap.get(n)?.CardName ?? n).join('・')}のパワーを${value}に`);
  }

  if (a.target.count === 'ALL') return done(applyPowerSet(cands, ctx));

  const count = resolveNum(a.target.count);
  // 「このシグニ」: sourceCardNum が候補に含まれていれば自動適用
  if (ctx.sourceCardNum && cands.includes(ctx.sourceCardNum)) {
    return done(applyPowerSet([ctx.sourceCardNum], ctx));
  }
  const scope: TargetScope = tgtOwner === 'self' ? 'self_field' : 'opp_field';
  return selectOrInteract(cands, count, a.target.upToCount ?? false, scope, a, undefined, ctx);
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
  if (ctx.sourceCardNum && cands.includes(ctx.sourceCardNum)) return done(applyMultiply([ctx.sourceCardNum], ctx));
  const scope: TargetScope = tgtOwner === 'self' ? 'self_field' : 'opp_field';
  return selectOrInteract(cands, count, a.target.upToCount ?? false, scope, a, undefined, ctx);
}

function execTrash(a: TrashAction, ctx: ExecCtx): ExecResult {
  const tgt = a.target;
  const state = ownerState(tgt.owner, ctx);

  if (tgt.type === 'SIGNI') {
    // thisCardOnly: 効果元シグニ自身のみを対象（「このシグニを場からトラッシュに置く」。WXDi-P04-040 等の自己犠牲）
    // excludeSelf: 効果元シグニ自身を対象から除外（「あなたの他の＜原子＞のシグニ」。WXK10-039 等）
    let trashFilter = tgt.filter;
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
    const cands = trashFieldProtected.size > 0 ? allSigCands.filter(n => !trashFieldProtected.has(n)) : allSigCands;
    const scope: TargetScope = tgt.owner === 'self' ? 'self_field' : 'opp_field';
    function applyTrashField(selected: string[], c: ExecCtx): ExecCtx {
      let cur = c;
      for (const num of selected) {
        const s = ownerState(tgt.owner, cur);
        const removed = removeFromField(num, s);
        cur = addLog(setOwnerState(tgt.owner,
          { ...removed, trash: [...removed.trash, num] }, cur),
          `${cur.cardMap.get(num)?.CardName ?? num}をトラッシュへ`);
      }
      return cur;
    }
    if (tgt.count === 'ALL') {
      // 「好きな数」（count:'ALL' + upToCount）: プレイヤーが0〜全部を選択（自動全トラッシュにしない）
      if (tgt.upToCount) {
        if (cands.length === 0) return done({ ...ctx, lastProcessedCards: [] });
        return selectOrInteract(cands, cands.length, true, scope, a, undefined, ctx);
      }
      return done({ ...applyTrashField(cands, ctx), lastProcessedCards: cands });
    }
    const count = resolveNum(tgt.count);
    // 「各プレイヤーは自分のシグニ1体を対象とし、それをトラッシュ」：相手のシグニは相手自身が選ぶ（WX04-025）
    const oppRespondsField = !!a.opponentSelects && tgt.owner === 'opponent';
    return selectOrInteract(cands, count, false, scope, a, undefined, ctx, oppRespondsField);
  }

  if (tgt.type === 'HAND_CARD') {
    if (tgt.blind) {
      const count = tgt.count === 'ALL' ? state.hand.length : resolveNum(tgt.count);
      const picked = shuffle([...state.hand]).slice(0, count);
      const newS: PlayerState = {
        ...state,
        hand: state.hand.filter(n => !picked.includes(n)),
        trash: [...state.trash, ...picked],
        // ON_HAND_DISCARDEDトリガー検出用（BattleScreenが消化してクリア）
        hand_discarded_just: picked.length > 0 ? [...(state.hand_discarded_just ?? []), ...picked] : state.hand_discarded_just,
        turn_hand_discarded_count: tgt.owner === 'self' && picked.length > 0
          ? (state.turn_hand_discarded_count ?? 0) + picked.length : state.turn_hand_discarded_count,
      };
      return done({ ...addLog(setOwnerState(tgt.owner, newS, ctx), `手札からランダム${count}枚をトラッシュへ`), lastProcessedCards: picked });
    }
    const cands = handCandidates(state, tgt.filter, ctx.cardMap, ctx.treatAsClassAllZones);
    const scope: TargetScope = tgt.owner === 'self' ? 'self_hand' : 'opp_hand';
    function applyTrashHand(selected: string[], c: ExecCtx): ExecCtx {
      const s = ownerState(tgt.owner, c);
      // PREVENT_ZONE_MOVE_BY_OPP: 相手効果で手札をトラッシュに移動させない（動的計算版 + AUTO設置フラグ）
      if (tgt.owner === 'opponent' && (c.otherProtectedZones?.includes('hand') || c.otherState.prevent_opp_trash_from?.includes('hand'))) {
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
        turn_hand_discarded_count: tgt.owner === 'self' && toTrash.length > 0
          ? (s.turn_hand_discarded_count ?? 0) + toTrash.length : s.turn_hand_discarded_count,
      };
      return addLog(setOwnerState(tgt.owner, newS, c),
        `手札から${toTrash.map(n => c.cardMap.get(n)?.CardName ?? n).join('・')}をトラッシュへ`);
    }
    if (tgt.count === 'ALL') return done({ ...applyTrashHand(cands, ctx), lastProcessedCards: cands });
    const count = resolveNum(tgt.count);
    // actingPlayerSelects=true: 「手札を見てN枚選び捨てさせる」＝自分が選ぶ
    // それ以外の opponent 手札: 「対戦相手は手札をN枚捨てる」＝相手自身が選ぶ
    const opponentResponds = tgt.owner === 'opponent' && !tgt.blind && !tgt.actingPlayerSelects;
    return selectOrInteract(cands, count, a.target.upToCount ?? false, scope, a, undefined, ctx, opponentResponds);
  }

  if (tgt.type === 'ENERGY_CARD') {
    // colorNotMatchesLrig 等の動的フィルタを対象オーナーのルリグ基準で解決（WX21-035①）
    const ownerSt = tgt.owner === 'self' ? ctx.ownerState : ctx.otherState;
    const otherSt = tgt.owner === 'self' ? ctx.otherState : ctx.ownerState;
    const resolvedFilter = resolveDynamicFilter(tgt.filter, ownerSt, ctx.cardMap, otherSt);
    const cands = energyCandidates(state, resolvedFilter, ctx.cardMap, ctx.treatAsClassAllZones);
    const scope: TargetScope = tgt.owner === 'self' ? 'self_energy' : 'opp_energy';
    function applyTrashEnergy(selected: string[], c: ExecCtx): ExecCtx {
      const s = ownerState(tgt.owner, c);
      // PREVENT_ZONE_MOVE_BY_OPP: 相手効果でエナをトラッシュに移動させない（動的計算版 + AUTO設置フラグ）
      if (tgt.owner === 'opponent' && (c.otherProtectedZones?.includes('energy') || c.otherState.prevent_opp_trash_from?.includes('energy'))) {
        return addLog(c, 'エナ保護により効果なし');
      }
      const newS: PlayerState = {
        ...s,
        energy: s.energy.filter(n => !selected.includes(n)),
        trash: [...s.trash, ...selected],
      };
      return addLog(setOwnerState(tgt.owner, newS, c),
        `エナから${selected.map(n => c.cardMap.get(n)?.CardName ?? n).join('・')}をトラッシュへ`);
    }
    if (tgt.count === 'ALL') return done({ ...applyTrashEnergy(cands, ctx), lastProcessedCards: cands });
    const count = resolveNum(tgt.count);
    // opponentSelects: 「対戦相手は自分のエナから1枚を対象とし、それをトラッシュに置く」→ 対戦相手が選ぶ（WX04-009）
    const oppResponds = !!a.opponentSelects && tgt.owner === 'opponent';
    return selectOrInteract(cands, count, tgt.upToCount ?? false, scope, a, undefined, ctx, oppResponds);
  }

  if (tgt.type === 'DECK_CARD') {
    const count = tgt.count === 'ALL' ? state.deck.length : resolveNum(tgt.count);
    const took = state.deck.slice(0, count);
    const newS: PlayerState = {
      ...state,
      deck: state.deck.slice(count),
      trash: [...state.trash, ...took],
    };
    return done({ ...addLog(setOwnerState(tgt.owner, newS, ctx), `デッキトップ${count}枚をトラッシュへ`), lastProcessedCards: took });
  }

  return done(ctx);
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
    cands = trashCandidates(state, tgt.filter, ctx.cardMap, ctx.treatAsClassAllZones);
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
    return addLog(setOwnerState(tgt.owner, newS, c), `${from}から${names}をエナゾーンへ`);
  }

  const count = tgt.count === 'ALL' ? cands.length : resolveNum(tgt.count);
  if (tgt.count === 'ALL') return done(applyCharge(cands, ctx));
  return selectOrInteract(cands, count, tgt.upToCount ?? false, scope, a, undefined, ctx);
}

function execEnergyChargeFromDeck(a: EnergyChargeFromDeckAction, ctx: ExecCtx): ExecResult {
  // BLOCK_OPP_DECK_TO_ENERGY: 相手CONTがアクティブなら自分のデッキ→エナをブロック
  if (a.owner === 'self' && ctx.deckToEnergyBlocked) {
    return done(addLog(ctx, 'デッキ→エナ移動がブロックされた（CONT効果）'));
  }
  const count = resolveNum(a.count);
  const state = ownerState(a.owner, ctx);
  const took = state.deck.slice(0, count);
  const newS: PlayerState = {
    ...state,
    deck: state.deck.slice(count),
    energy: [...state.energy, ...took],
  };
  return done(addLog(setOwnerState(a.owner, newS, ctx), `エナチャージ${count}`));
}

function execLifeCrash(a: LifeCrashAction, ctx: ExecCtx): ExecResult {
  // conditional: 前ステップが lastProcessedCards を残した場合のみ実行（「そうした場合」）
  if (a.conditional && (!ctx.lastProcessedCards || ctx.lastProcessedCards.length === 0)) {
    return done(ctx);
  }
  const count = resolveNum(a.count);
  const state = ownerState(a.owner, ctx);
  const crashed: string[] = [];
  const life = [...state.life_cloth];
  for (let i = 0; i < count && life.length > 0; i++) {
    crashed.push(life.pop()!);
  }
  let newS: PlayerState;
  if (a.triggerBurst) {
    // バースト発動あり: 先頭1枚をチェックゾーンへ、残りはpending
    const checkCard = crashed[0] ?? null;
    const pending = crashed.slice(1);
    newS = {
      ...state,
      life_cloth: life,
      field: { ...state.field, check: checkCard },
      pending_crashed_cards: pending.length > 0 ? [...(state.pending_crashed_cards ?? []), ...pending] : state.pending_crashed_cards,
    };
  } else {
    // バースト発動なし: クラッシュしたカードはそのままトラッシュへ
    newS = {
      ...state,
      life_cloth: life,
      trash: [...state.trash, ...crashed],
    };
  }
  // crashed を lastProcessedCards に残す（後続の conditional LIFE_CRASH「そうした場合」用）
  return done({ ...addLog(setOwnerState(a.owner, newS, ctx), `ライフクロスを${crashed.length}枚クラッシュ`), lastProcessedCards: crashed });
}

function execShuffleDeck(a: ShuffleDeckAction, ctx: ExecCtx): ExecResult {
  const state = ownerState(a.owner, ctx);
  const newS: PlayerState = { ...state, deck: shuffle([...state.deck]) };
  return done(addLog(setOwnerState(a.owner, newS, ctx), 'デッキをシャッフル'));
}

function resolveDynamicFilter(
  filter: import('../types/effects').TargetFilter | undefined,
  ownerSt: import('../types').PlayerState,
  cardMap: Map<string, import('../types').CardData>,
  otherSt?: import('../types').PlayerState,
  lastProcessedCards?: string[],
  effectivePowers?: Map<string, number>,
): import('../types/effects').TargetFilter | undefined {
  if (!filter) return filter;
  let result = filter;
  if (result.powerLteLastProcessed) {
    const { powerLteLastProcessed: _p, ...rest } = result;
    const ref = lastProcessedCards?.[0];
    const pw = ref ? (effectivePowers?.get(ref) ?? parseInt(cardMap.get(getCardNum(ref))?.Power ?? '0', 10)) : undefined;
    result = (pw !== undefined && !isNaN(pw))
      ? { ...rest, powerRange: { ...(rest.powerRange ?? {}), max: pw } }
      : rest;
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
  if (result.levelLteFieldVirusCount && otherSt) {
    const ownVirus = (ownerSt.field.signi_virus ?? []).reduce((s, v) => s + (v ?? 0), 0);
    const oppVirus = (otherSt.field.signi_virus ?? []).reduce((s, v) => s + (v ?? 0), 0);
    const { levelLteFieldVirusCount: _, ...rest } = result;
    result = { ...rest, level: { max: ownVirus + oppVirus } };
  }
  return result;
}

function execTransferToHand(a: TransferToHandAction, ctx: ExecCtx): ExecResult {
  const src = a.source;
  const tgtOwner = src.owner;
  const state = ownerState(tgtOwner, ctx);
  const ownerSt = tgtOwner === 'self' ? ctx.ownerState : ctx.otherState;
  const otherSt = tgtOwner === 'self' ? ctx.otherState : ctx.ownerState;

  let cands: string[];
  let scope: TargetScope;

  if (src.type === 'TRASH_CARD') {
    // thisCardOnly: 効果元カード自身のみ（「このシグニを手札に加える」。トラッシュに置かれた自身を回収。WX04-035-E2）
    if (src.filter?.thisCardOnly) {
      cands = (ctx.sourceCardNum && state.trash.includes(ctx.sourceCardNum)) ? [ctx.sourceCardNum] : [];
    } else {
      const resolvedFilter = resolveDynamicFilter(src.filter, ownerSt, ctx.cardMap, otherSt);
      cands = trashCandidates(state, resolvedFilter, ctx.cardMap, ctx.treatAsClassAllZones);
    }
    scope = tgtOwner === 'self' ? 'self_trash' : 'opp_trash';
  } else if (src.type === 'ENERGY_CARD') {
    cands = energyCandidates(state, src.filter, ctx.cardMap, ctx.treatAsClassAllZones);
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
    return addLog(setOwnerState(tgtOwner, newS, c), `${from}から${names}を手札へ`);
  }

  const count = src.count === 'ALL' ? cands.length : resolveNum(src.count);
  if (src.count === 'ALL') return done(applyTransfer(cands, ctx));
  // thisCardOnly: 「このカードを手札に加える」は選択不要 → 即適用（候補なしはスキップ）
  if (src.type === 'TRASH_CARD' && src.filter?.thisCardOnly) {
    return cands.length > 0 ? done(applyTransfer(cands, ctx)) : done(ctx);
  }
  return selectOrInteract(cands, count, src.upToCount ?? false, scope, a, undefined, ctx);
}

// PLACE_SIGNI_ON_FIELD: cardNums を1枚ずつ場に出す。各カードでゾーン選択が必要なら、残りカードの配置を
// continuation にチェーンして順次解決する（複数枚の場出しでカードが消失しないようにする）。
function execPlaceSigniOnField(a: import('../types/effects').PlaceSigniOnFieldAction, ctx: ExecCtx): ExecResult {
  if (a.cardNums.length === 0) {
    return a.afterAction ? executeAction(a.afterAction, ctx) : done(ctx);
  }
  const [head, ...rest] = a.cardNums;
  const placeAction: AddToFieldAction = { type: 'ADD_TO_FIELD', owner: a.owner, ...(a.asDown ? { asDown: a.asDown } : {}) };
  const cont: import('../types/effects').PlaceSigniOnFieldAction = {
    type: 'PLACE_SIGNI_ON_FIELD', owner: a.owner, cardNums: rest,
    ...(a.asDown ? { asDown: a.asDown } : {}),
    ...(a.afterAction ? { afterAction: a.afterAction } : {}),
  };
  const result = applyDirectAction(placeAction, head, ctx);
  if (!result.done) {
    // ゾーン選択待ち: 残りカードの配置を continuation に合成
    const existing = result.pending.continuation;
    result.pending = {
      ...result.pending,
      continuation: existing
        ? ({ type: 'SEQUENCE', steps: [existing, cont] } as SequenceAction)
        : cont,
    };
    return result;
  }
  // 即時配置完了（空きゾーン1つ/空きなし）→ 残りを継続
  return executeAction(cont, { ...ctx, ownerState: result.ownerState, otherState: result.otherState, logs: result.logs });
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
      });
    }
    signi[emptyZones[0].i] = [instanceId];
    const newS: PlayerState = { ...state, field: { ...state.field, signi } };
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
    const resolvedFilter = resolveDynamicFilter(src.filter, addToFieldOwnerSt, ctx.cardMap, addToFieldOtherSt);
    cands = trashCandidates(state, resolvedFilter, ctx.cardMap, ctx.treatAsClassAllZones);
    // thisCardOnly: 「このシグニをトラッシュから場に出す」＝効果元カード自身のみ（トラッシュ自己起動）
    if (src.filter?.thisCardOnly) {
      cands = (ctx.sourceCardNum && state.trash.includes(ctx.sourceCardNum)) ? [ctx.sourceCardNum] : [];
    }
    scope = tgtOwner === 'self' ? 'self_trash' : 'opp_trash';
  } else if (src.type === 'ENERGY_CARD') {
    const resolvedFilter = resolveDynamicFilter(src.filter, addToFieldOwnerSt, ctx.cardMap, addToFieldOtherSt);
    cands = energyCandidates(state, resolvedFilter, ctx.cardMap, ctx.treatAsClassAllZones);
    scope = tgtOwner === 'self' ? 'self_energy' : 'opp_energy';
  } else if (src.type === 'HAND_CARD') {
    cands = handCandidates(state, src.filter, ctx.cardMap, ctx.treatAsClassAllZones);
    scope = tgtOwner === 'self' ? 'self_hand' : 'opp_hand';
  } else {
    return done(ctx);
  }

  // 場に出す：空きゾーンに配置（呼び出し元が担当できないため自動的に最初の空きへ）
  const srcDefined = src!;
  function applyToField(selected: string[], c: ExecCtx): ExecCtx {
    let cur = c;
    for (const n of selected) {
      const s = ownerState(tgtOwner, cur);
      // 空きゾーンがない場合は移動させずスキップ（カード消失防止）
      const emptyIdxCheck = s.field.signi.findIndex(z => !z || z.length === 0);
      if (emptyIdxCheck < 0) {
        cur = addLog(cur, '空きシグニゾーンがないため場に出せない');
        continue;
      }
      let newS = { ...s };
      if (srcDefined.type === 'TRASH_CARD') {
        // THIS_CARD_FROM_TRASH 用に「トラッシュから出た」インスタンスを記録（直後の【出】効果が参照）
        newS = { ...newS, trash: newS.trash.filter(x => x !== n),
          signi_played_from_trash: [...(newS.signi_played_from_trash ?? []), n] };
      } else if (srcDefined.type === 'ENERGY_CARD') {
        newS = { ...newS, energy: newS.energy.filter(x => x !== n),
          signi_played_from_trash: (newS.signi_played_from_trash ?? []).filter(x => x !== n) };
      } else if (srcDefined.type === 'HAND_CARD') {
        newS = { ...newS, hand: newS.hand.filter(x => x !== n),
          signi_played_from_trash: (newS.signi_played_from_trash ?? []).filter(x => x !== n) };
      }
      // 空きゾーンに配置
      const signi = [...newS.field.signi] as (string[] | null)[];
      const emptyIdx = signi.findIndex(z => !z || z.length === 0);
      if (emptyIdx >= 0) signi[emptyIdx] = [n];
      newS = { ...newS, field: { ...newS.field, signi } };
      // ダウン状態で場に出す（ミズフウセン等「ダウン状態で場に出してもよい」）
      if (a.asDown && emptyIdx >= 0) {
        const newDown = [...(newS.field.signi_down ?? [false, false, false])] as boolean[];
        newDown[emptyIdx] = true;
        newS = { ...newS, field: { ...newS.field, signi_down: newDown } };
      }
      cur = addLog(setOwnerState(tgtOwner, newS, cur),
        `${cur.cardMap.get(n)?.CardName ?? n}をフィールドに出す`);
    }
    return cur;
  }

  const count = src.count === 'ALL' ? cands.length : resolveNum(src.count);
  if (src.count === 'ALL') return done(applyToField(cands, ctx));
  return selectOrInteract(cands, count, src.upToCount ?? false, scope, a, undefined, ctx);
}

function execAddToLife(a: AddToLifeAction, ctx: ExecCtx): ExecResult {
  // last_processed_count: 「トラッシュに置いたシグニ1体につき…ライフクロスに加える」→ 直前にトラッシュした枚数
  const count = (typeof a.count === 'object' && a.count.$ref === 'last_processed_count')
    ? (ctx.lastProcessedCards?.length ?? 0)
    : resolveNum(a.count);
  if (count <= 0) return done(ctx);
  const state = ownerState(a.owner, ctx);
  if (a.fromHand) {
    // 手札から1枚選んでライフクロスに追加
    const cands = handCandidates(state, undefined, ctx.cardMap, ctx.treatAsClassAllZones);
    if (cands.length === 0) return done(addLog(ctx, '手札がないためライフクロスに加えられない'));
    const scope: TargetScope = a.owner === 'self' ? 'self_hand' : 'opp_hand';
    return selectOrInteract(cands, count, false, scope, a, undefined, ctx);
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

function execFreeze(a: FreezeAction, ctx: ExecCtx): ExecResult {
  const state = ownerState(a.target.owner, ctx);
  // isTriggerSource: トリガー元カード（ctx.triggeringCardNum＝アタッカー等）のみを対象（「アタックしたそのシグニ」WX04-082-E1）
  let freezeFilter = a.target.filter;
  let triggerRestrictFZ: string[] | null = null;
  if (freezeFilter?.isTriggerSource) {
    const { isTriggerSource: _ts, ...rest } = freezeFilter;
    freezeFilter = rest;
    triggerRestrictFZ = ctx.triggeringCardNum ? [ctx.triggeringCardNum] : [];
  }
  let cands = fieldCandidates(state, freezeFilter, ctx.cardMap, ctx.effectivePowers, ctx.allColorSigniNums, ctx.fieldSigniExtraColors);
  if (triggerRestrictFZ !== null) cands = cands.filter(n => triggerRestrictFZ!.includes(n));
  // 完全効果耐性: 相手の凍結効果は耐性シグニに無効
  if (a.target.owner === 'opponent' && ctx.otherEffectImmuneNums?.size) {
    cands = cands.filter(n => !ctx.otherEffectImmuneNums!.has(n));
  }
  const scope: TargetScope = a.target.owner === 'self' ? 'self_field' : 'opp_field';

  function applyFreeze(selected: string[], c: ExecCtx): ExecCtx {
    let cur = c;
    for (const num of selected) {
      const s = ownerState(a.target.owner, cur);
      const zoneIdx = s.field.signi.findIndex(st => st?.at(-1) === num);
      if (zoneIdx < 0) continue;
      const newFrozen = [...(s.field.signi_frozen ?? [false, false, false])] as boolean[];
      newFrozen[zoneIdx] = true;
      // 凍結のみ（現在のアップ/ダウン状態は変えない）。「ダウンし凍結」(down:true)のときのみダウンも行う。
      const fieldPatch: Partial<PlayerState['field']> = { signi_frozen: newFrozen };
      if (a.down) {
        const newDown = [...(s.field.signi_down ?? [false, false, false])] as boolean[];
        newDown[zoneIdx] = true;
        fieldPatch.signi_down = newDown;
      }
      const newS: PlayerState = { ...s, field: { ...s.field, ...fieldPatch } };
      cur = addLog(setOwnerState(a.target.owner, newS, cur),
        `${cur.cardMap.get(num)?.CardName ?? num}を${a.down ? 'ダウンしてフリーズ' : 'フリーズ'}`);
    }
    return cur;
  }

  if (a.target.count === 'ALL') return done(applyFreeze(cands, ctx));
  const count = resolveNum(a.target.count);
  return selectOrInteract(cands, count, a.target.upToCount ?? false, scope, a, undefined, ctx);
}

function execDown(a: DownAction, ctx: ExecCtx): ExecResult {
  if (a.target.type === 'LRIG') {
    const state = ownerState(a.target.owner, ctx);
    const lrigTopId = state.field.lrig?.at(-1);
    // 効果耐性（「あなたのセンタールリグはアーツの効果を受けない」WX04-064 等）: 相手効果ならダウン無効
    if (a.target.owner === 'opponent' && lrigTopId && ctx.otherEffectImmuneNums?.has(lrigTopId)) {
      return done(addLog(ctx, 'センタールリグは効果を受けない（ダウン無効）'));
    }
    const lrigCardNum = lrigTopId ? getCardNum(lrigTopId) : undefined;
    const lrigCard = lrigCardNum ? ctx.cardMap.get(lrigCardNum) : undefined;
    const lrigLevel = lrigCard ? parseInt(lrigCard.Level ?? '', 10) : NaN;
    const newS: PlayerState = { ...state, field: { ...state.field, lrig_down: true } };
    const lrigName = lrigCard?.CardName ?? 'ルリグ';
    const newCtx = addLog(setOwnerState(a.target.owner, newS, ctx), `${lrigName}をダウン`);
    return done(!isNaN(lrigLevel)
      ? { ...newCtx, seqVars: { ...newCtx.seqVars, lastDownedLrigLevel: lrigLevel } }
      : newCtx);
  }
  // PREVENT_SIGNI_DOWN_BY_OPP (state flag) または CONT保護効果によりダウン無効
  if (a.target.owner === 'opponent' && ctx.otherState.prevent_signi_down_by_opp) {
    return done(addLog(ctx, 'シグニダウン防止（常時効果）'));
  }
  const state = ownerState(a.target.owner, ctx);
  const downProtected = a.target.owner === 'opponent' ? new Set(ctx.otherDownProtectedNums ?? []) : new Set<string>();
  // keyword_grants  PROTECTION:DOWN:opponent
  if (a.target.owner === 'opponent') {
    const grants = ctx.otherState.keyword_grants ?? {};
    for (const [cardNum, kws] of Object.entries(grants)) {
      if (kws.some(kw => kw.startsWith('PROTECTION:') && (kw.includes('DOWN') || kw.includes('any')) && kw.endsWith(':opponent'))) {
        downProtected.add(cardNum);
      }
    }
  }
  let cands = fieldCandidates(state, a.target.filter, ctx.cardMap, ctx.effectivePowers, ctx.allColorSigniNums, ctx.fieldSigniExtraColors);
  if (downProtected.size > 0) cands = cands.filter(n => !downProtected.has(n));

  function applyDown(selected: string[], c: ExecCtx): ExecCtx {
    let cur = c;
    for (const num of selected) {
      const s = ownerState(a.target.owner, cur);
      const zoneIdx = s.field.signi.findIndex(st => st?.at(-1) === num);
      if (zoneIdx < 0) continue;
      const newDown = [...(s.field.signi_down ?? [false, false, false])] as boolean[];
      newDown[zoneIdx] = true;
      cur = addLog(setOwnerState(a.target.owner,
        { ...s, field: { ...s.field, signi_down: newDown } }, cur),
        `${cur.cardMap.get(num)?.CardName ?? num}をダウン`);
    }
    return cur;
  }

  if (a.target.count === 'ALL') return done(applyDown(cands, ctx));
  const count = resolveNum(a.target.count);
  const scope: TargetScope = a.target.owner === 'self' ? 'self_field' : 'opp_field';
  return selectOrInteract(cands, count, a.target.upToCount ?? false, scope, a, undefined, ctx);
}

function execUp(a: UpAction, ctx: ExecCtx): ExecResult {
  if (a.target.type === 'LRIG') {
    const s = ownerState(a.target.owner, ctx);
    const lrigName = s.field.lrig?.length
      ? (ctx.cardMap.get(getCardNum(s.field.lrig.at(-1) ?? ''))?.CardName ?? 'ルリグ')
      : '';
    const newS: PlayerState = { ...s, field: { ...s.field, lrig_down: false } };
    return done(addLog(setOwnerState(a.target.owner, newS, ctx), `${lrigName}をアップ`));
  }
  const state = ownerState(a.target.owner, ctx);
  let cands = fieldCandidates(state, a.target.filter, ctx.cardMap, ctx.effectivePowers, ctx.allColorSigniNums, ctx.fieldSigniExtraColors);
  // thisCardOnly: 効果元シグニ自身のみ（「このシグニをアップする」。WX16-Re07等）
  if (a.target.filter?.thisCardOnly) {
    cands = (ctx.sourceCardNum && state.field.signi.some(s => s?.at(-1) === ctx.sourceCardNum))
      ? [ctx.sourceCardNum] : [];
  }
  const scope: TargetScope = a.target.owner === 'self' ? 'self_field' : 'opp_field';

  function applyUp(selected: string[], c: ExecCtx): ExecCtx {
    let cur = c;
    for (const num of selected) {
      const s = ownerState(a.target.owner, cur);
      const zoneIdx = s.field.signi.findIndex(st => st?.at(-1) === num);
      if (zoneIdx < 0) continue;
      const newDown = [...(s.field.signi_down ?? [false, false, false])] as boolean[];
      newDown[zoneIdx] = false;
      cur = addLog(setOwnerState(a.target.owner,
        { ...s, field: { ...s.field, signi_down: newDown } }, cur),
        `${cur.cardMap.get(num)?.CardName ?? num}をアップ`);
    }
    return cur;
  }

  if (a.target.count === 'ALL') return done(applyUp(cands, ctx));
  const count = resolveNum(a.target.count);
  return selectOrInteract(cands, count, false, scope, a, undefined, ctx);
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
  PLAY_SIGNI_NOT_FROM_HAND: '手札以外からのシグニ出し封じ',
  NEGATE_NEXT_SIGNI_ATTACK: '次のシグニアタック無効',
  ENCORE: 'アンコール封じ',
  BET: 'ベット封じ',
};

function execBlockAction(a: BlockActionAction, ctx: ExecCtx): ExecResult {
  // シグニへのアタックブロック（ATTACK）は keyword_grants 経由で処理する。
  // blocked_actions に 'ATTACK'（カードIDなし）で追加しても CPU の
  // 'ATTACK:${topId}' チェックと一致しないため。また、CPU ターン開始の
  // UPフェイズで otherState.blocked_actions がリセットされる問題も回避する。
  if (a.target.type === 'SIGNI' && a.actionId === 'ATTACK') {
    const tgtOwner: Owner = a.target.owner === 'self' ? 'self' : 'opponent';
    const tgtState = ownerState(tgtOwner, ctx);
    const targets = ctx.lastProcessedCards && ctx.lastProcessedCards.length > 0
      ? ctx.lastProcessedCards.filter(cn => tgtState.field.signi.some(s => s?.at(-1) === cn))
      : tgtState.field.signi.flatMap(s => s?.at(-1) ? [s.at(-1)!] : []);
    if (targets.length === 0) return done(ctx);
    const grants = { ...(ctx.ownerState.keyword_grants ?? {}) };
    for (const cn of targets) {
      grants[cn] = [...new Set([...(grants[cn] ?? []), 'アタックできない'])];
    }
    const until = a.until === 'END_OF_TURN' ? '（ターン終了時まで）' : a.until === 'NEXT_TURN' ? '（次の自分ターンまで）' : '';
    return done(addLog({ ...ctx, ownerState: { ...ctx.ownerState, keyword_grants: grants } },
      `${targets.map(cn => ctx.cardMap.get(cn)?.CardName ?? cn).join('・')}はアタックできない${until}`));
  }

  const state = ownerState(a.target.owner, ctx);
  // NEXT_TURN  ':NEXT_TURN'
  const id = a.until === 'NEXT_TURN' ? `${a.actionId}:NEXT_TURN` : a.actionId;
  const blocked = [...(state.blocked_actions ?? []), id];
  const newS: PlayerState = { ...state, blocked_actions: blocked };
  const baseId = a.actionId.replace(/^PLAY_SIGNI_POWER_(\d+)_OR_MORE$/, 'パワー$1以上のシグニ出し封じ');
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
    const level = ctx.seqVars?.lastDownedLrigLevel;
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
      const grants = { ...(s[gkey] ?? {}) };
      grants[cn] = [...new Set([...(grants[cn] ?? []), a.keyword])];
      cur = addLog(setOwnerState(owner, { ...s, [gkey]: grants }, cur),
        `${a.keyword}：${cur.cardMap.get(cn)?.CardName ?? cn}`);
    }
    return done(cur);
  }
  const tgt = a.target;
  // duration:NEXT_TURN かつ「あなたのすべてのシグニ」（クラス等の絞り込みなし）への付与
  // → 次の自分ターン中に存在する全シグニ（新たに出したシグニも含む）が得る場全体付与として予約する。
  // （keyword_grants へのスナップショット付与では次ターンに新規召喚したシグニに付かないため）
  if (a.duration === 'NEXT_TURN' && tgt.type === 'SIGNI' && tgt.owner === 'self' && tgt.count === 'ALL'
      && (!tgt.filter || (!tgt.filter.story && !tgt.filter.cardClass && !tgt.filter.color
          && !tgt.filter.level && !tgt.filter.powerRange && !tgt.filter.cardName))) {
    const reserved = [...(ctx.ownerState.field_keyword_grants_next_turn ?? []), a.keyword];
    return done(addLog(
      { ...ctx, ownerState: { ...ctx.ownerState, field_keyword_grants_next_turn: reserved } },
      `次の自分のターンの間、あなたのすべてのシグニが【${a.keyword}】を得る`));
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
    cands = fieldCandidates(state, tgt.filter, ctx.cardMap, ctx.effectivePowers, ctx.allColorSigniNums, ctx.fieldSigniExtraColors)
      .filter(n => !abilityGainBlocked.has(n));
    // thisCardOnly: 効果元シグニ自身のみへ付与（「このシグニは【X】を得る」）
    if (tgt.filter?.thisCardOnly) {
      cands = (ctx.sourceCardNum && cands.includes(ctx.sourceCardNum)) ? [ctx.sourceCardNum] : [];
    }
  }

  function applyGrant(selected: string[], c: ExecCtx): ExecCtx {
    const s = ownerState(tgtOwner, c);
    // UNTIL_OPP_TURN_END は長期ストア keyword_grants_until_opp_turn へ（次の相手ターン終了時＝付与者の次ターン開始時までクリアされない）。
    // 通常の keyword_grants は付与者のターン終了時にクリアされるため、ターン終了時付与は必ずこちらを使う。
    const gkey = a.duration === 'UNTIL_OPP_TURN_END' ? 'keyword_grants_until_opp_turn' : 'keyword_grants';
    const grants = { ...(s[gkey] ?? {}) };
    for (const n of selected) {
      grants[n] = [...(grants[n] ?? []), a.keyword];
    }
    let newS: PlayerState = { ...s, [gkey]: grants };

    // チアガールはフリーゾーンへ移動
    if (a.keyword === 'チアガール') {
      for (const n of selected) {
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
      `${selected.map(n => c.cardMap.get(n)?.CardName ?? n).join('・')}に「${a.keyword}」を付与`);
  }

  // LRIGは選択UIを出さず自動付与
  if (tgt.type === 'LRIG') return cands.length > 0 ? done(applyGrant(cands, ctx)) : done(ctx);
  if (tgt.count === 'ALL') return done(applyGrant(cands, ctx));
  const count = resolveNum(tgt.count);
  // 「このシグニ」: フィルターなし or thisCardOnly・sourceCardNum が候補に含まれていれば自動適用（選択UIを出さない）
  if ((!tgt.filter || tgt.filter.thisCardOnly) && ctx.sourceCardNum && cands.includes(ctx.sourceCardNum)) {
    return done(applyGrant([ctx.sourceCardNum], ctx));
  }
  const scope: TargetScope = tgtOwner === 'self' ? 'self_field' : 'opp_field';
  return selectOrInteract(cands, count, false, scope, a, undefined, ctx);
}

function execGrantEffect(a: GrantEffectAction, ctx: ExecCtx): ExecResult {
  const tgt = a.target;
  const state = ownerState(tgt.owner, ctx);
  let cands = fieldCandidates(state, tgt.filter, ctx.cardMap, ctx.effectivePowers, ctx.allColorSigniNums, ctx.fieldSigniExtraColors);
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
      granted[n] = [...(granted[n] ?? []), a.effect];
    }
    const effectLabel = (a.effect as { effectType?: string })?.effectType ?? '効果';
    return addLog(setOwnerState(tgt.owner, { ...s, [key]: granted }, c),
      `${selected.map(n => c.cardMap.get(n)?.CardName ?? n).join('・')}に${effectLabel}を付与`);
  }

  if (tgt.count === 'ALL') return done(applyGrant(cands, ctx));
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
  if (resolvedFilter.colorMatchesLrig || resolvedFilter.colorNotMatchesLrig) {
    const searchOwnerSt = a.from.owner === 'self' ? ctx.ownerState : ctx.otherState;
    const searchOtherSt = a.from.owner === 'self' ? ctx.otherState : ctx.ownerState;
    resolvedFilter = { ...resolveDynamicFilter(resolvedFilter, searchOwnerSt, ctx.cardMap, searchOtherSt) };
  }

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

  // maxCount の解決（{$ref:'last_processed_count'} = 直前にバニッシュ/トラッシュした枚数。「同じ枚数」）
  const maxPick = typeof a.maxCount === 'number'
    ? a.maxCount
    : (a.maxCount?.$ref === 'last_processed_count' ? (ctx.lastProcessedCards?.length ?? 0) : 0);
  // 探索枚数0（同数が0等）: 探索せず afterSearch のみ実行
  if (maxPick <= 0) {
    if (a.afterSearch) return executeAction(a.afterSearch, ctx);
    return done(ctx);
  }

  // 1
  const hasVisible = pool.some(n => matchesFilter(searchCardMap.get(n), resolvedFilter));
  if (!hasVisible) {
    if (a.afterSearch) return executeAction(a.afterSearch, ctx);
    return done(ctx);
  }

  // フィルタがある場合は一致カードのみ表示、ない場合は全体を公開
  const visibleCards = pool.filter(n => matchesFilter(searchCardMap.get(n), resolvedFilter));

  return needsInteraction(ctx, {
    type: 'SEARCH',
    visibleCards,
    maxPick,
    thenAction: a.then,
    afterAction: a.afterSearch,
  });
}

function execSequence(a: SequenceAction, ctx: ExecCtx): ExecResult {
  let cur = ctx;
  for (let i = 0; i < a.steps.length; i++) {
    const step = a.steps[i];
    // リコレクトゲート：条件未達なら残りステップをすべてスキップ
    if (step.type === 'RECOLLECT_GATE') {
      const gate = step as import('../types/effects').RecollectGateAction;
      const artsInLrigTrash = (cur.ownerState.lrig_trash ?? []).filter(
        n => cur.cardMap.get(n)?.Type === 'アーツ'
      ).length;
      if (artsInLrigTrash < gate.minArts) {
        return done(addLog(cur, `リコレクト条件未達（アーツ${artsInLrigTrash}枚 / 必要${gate.minArts}枚以上）`));
      }
      cur = addLog(cur, `リコレクト条件達成（アーツ${artsInLrigTrash}枚）`);
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
    if (step.type === 'STUB' && (step as import('../types/effects').StubAction).id === 'DECLARE_NUMBER') {
      const nextDN = i + 1 < a.steps.length ? a.steps[i + 1] : undefined;
      const remaining = a.steps.slice(i + 2);
      const cont: EffectAction | undefined = remaining.length > 0
        ? (remaining.length === 1 ? remaining[0] : { type: 'SEQUENCE', steps: remaining } as SequenceAction)
        : undefined;
      if (nextDN?.type === 'GRANT_KEYWORD') {
        const grantDN = nextDN as GrantKeywordAction;
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
      // GRANT_KEYWORD が続かない場合: 無条件シャドウとして付与し続行
      cur = addLog(cur, '数字を宣言（スキップ：次ステップが GRANT_KEYWORD でないため）');
      continue;
    }
    // 任意コストパターン: STUB(各種任意コスト) → CONDITIONAL(IS_MY_TURN)
    // IS_MY_TURN はパーサーが「コスト支払い → 効果発動」を表すプレースホルダーとして使用
    if (step.type === 'STUB') {
      const nextStep = i + 1 < a.steps.length ? a.steps[i + 1] : undefined;
      if (nextStep?.type === 'CONDITIONAL' &&
          (nextStep as ConditionalAction).condition.type === 'IS_MY_TURN') {
        const conditional = nextStep as ConditionalAction;
        const remaining = a.steps.slice(i + 2);
        const cont: EffectAction | undefined = remaining.length > 0
          ? (remaining.length === 1 ? remaining[0] : { type: 'SEQUENCE', steps: remaining } as SequenceAction)
          : undefined;
        const noopAction: SequenceAction = { type: 'SEQUENCE', steps: [] };
        const stub = step as import('../types/effects').StubAction;
        const costColors = stub.costColors ?? [];

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
          const oppCandsTOSOC = fieldCandidates(cur.otherState, { cardType: 'シグニ' }, cur.cardMap, cur.effectivePowers, cur.allColorSigniNums, cur.fieldSigniExtraColors);
          if (oppCandsTOSOC.length === 0) {
            if (cont) return executeAction(cont, cur);
            return done(addLog(cur, '対象シグニなし（TARGET_OPP_SIGNI_OPTIONAL_COLOR_COST）'));
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
          void toHWTOSOC; // count解析は利用しない（execBanish/execBounce が自律的に候補を提示）
          const fixedThenTOSOC = fixOwnerTOSOC(conditional.then);
          const payLabelTOSOC = costColors.length > 0
            ? `対象選択して発動（${costColors.map(c => `《${c}》`).join('')}）`
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
          const srcOTEC = cur.sourceCardNum ? cur.cardMap.get(cur.sourceCardNum) : undefined;
          const txtOTEC = srcOTEC ? (srcOTEC.EffectText ?? '') + ' ' + (srcOTEC.BurstText ?? '') : '';
          const toHWOTEC = (s: string) => s.replace(/[\uFF01-\uFF5E]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
          const classMOTEC = txtOTEC.match(/エナゾーンから(?:あなたの)?(?:＜([^＞]+)＞の)?(?:シグニ|カード)/);
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
          const cntMOTEC = txtOTEC.match(/([０-９\d]+)枚?(?:まで)?を?対象/);
          const pickCountOTEC = cntMOTEC ? parseInt(toHWOTEC(cntMOTEC[1])) : 1;
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
            { id: 'skip', label: 'スキップ', action: (conditional.else ?? noopAction) as EffectAction, available: true },
          ];
          return needsInteraction(addLog(cur, `エナゾーンのカードを選択しますか？`), {
            type: 'CHOOSE', options: optsOTEC, count: 1, ...(cont ? { continuation: cont } : {}),
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
          const canOppAfford = costColors.length === 0 || canPayOptionalCost(costColors, cur.otherState, cur.cardMap);
          const payLabel = costColors.length > 0
            ? `支払う（コスト: ${costColors.map(c => `《${c}》`).join('')}）`
            : '支払う';
          const options = [
            { id: 'pay', label: payLabel, action: noopAction as EffectAction, available: canOppAfford, ...(costColors.length ? { costColors } : {}) },
            { id: 'skip', label: '支払わない', action: conditional.then, available: true },
          ];
          const pending: PendingInteractionDef = {
            type: 'CHOOSE', options, count: 1, opponentResponds: true,
            ...(cont ? { continuation: cont } : {}),
          };
          return needsInteraction(addLog(cur, '対戦相手：コストを支払いますか？'), pending);
        }

        const canAfford = costColors.length === 0 || canPayOptionalCost(costColors, cur.ownerState, cur.cardMap);
        const payLabel = costColors.length > 0
          ? `発動する（コスト: ${costColors.map(c => `《${c}》`).join('')}）`
          : '発動する';
        const options = [
          { id: 'pay', label: payLabel, action: conditional.then, available: canAfford, ...(costColors.length ? { costColors } : {}) },
          { id: 'skip', label: 'スキップ', action: (conditional.else ?? noopAction) as EffectAction, available: true },
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
            const payAction4: EffectAction = isAdditional
              ? (baseSteps.length === 0
                  ? conditional4.then
                  : { type: 'SEQUENCE', steps: [...baseSteps, conditional4.then] } as SequenceAction)
              : conditional4.then; // replace mode: 強化効果のみ
            const costColors4 = stub4.costColors ?? [];
            const canAfford4 = costColors4.length === 0 || canPayOptionalCost(costColors4, cur.ownerState, cur.cardMap);
            const payLabel4 = costColors4.length > 0
              ? `追加コスト支払う（${costColors4.map(c => `《${c}》`).join('')}）`
              : '追加コストを支払う';
            const opts4 = [
              { id: 'pay', label: payLabel4, action: payAction4, available: canAfford4, ...(costColors4.length ? { costColors: costColors4 } : {}) },
              { id: 'skip', label: 'スキップ（基本効果のみ）', action: baseAction4, available: true },
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
        const optIds5 = ['OPTIONAL_COST', 'TARGET_OPP_SIGNI_OPTIONAL_COLOR_COST', 'OPTIONAL_TRASH_ENERGY_CLASS'];
        if (optIds5.includes(stub5.id)) {
          const remaining5 = a.steps.slice(i + 1);
          const noopAction5: SequenceAction = { type: 'SEQUENCE', steps: [] };
          const cont5: EffectAction = remaining5.length > 0
            ? (remaining5.length === 1 ? remaining5[0] : { type: 'SEQUENCE', steps: remaining5 } as SequenceAction)
            : noopAction5;
          const costColors5 = stub5.costColors ?? [];
          const canAfford5 = costColors5.length === 0 || canPayOptionalCost(costColors5, cur.ownerState, cur.cardMap);
          const payLabel5 = costColors5.length > 0
            ? `支払う（${costColors5.map(c => `《${c}》`).join('')}）`
            : '支払う';
          const options5 = [
            { id: 'pay', label: payLabel5, action: cont5, available: canAfford5, ...(costColors5.length ? { costColors: costColors5 } : {}) },
            { id: 'skip', label: 'スキップ', action: noopAction5 as EffectAction, available: true },
          ];
          const pending5: PendingInteractionDef = { type: 'CHOOSE', options: options5, count: 1 };
          return needsInteraction(addLog(cur, '任意コスト：支払いますか？'), pending5);
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
    const result = executeAction(step, cur);
    if (!result.done) {
      // インタラクション必要：残りのステップをcontinuationに入れる
      const remaining = a.steps.slice(i + 1);
      const cont: EffectAction | undefined = remaining.length > 0
        ? (remaining.length === 1 ? remaining[0] : { type: 'SEQUENCE', steps: remaining })
        : undefined;
      const pending: PendingInteractionDef = cont
        ? { ...result.pending, continuation: cont }
        : result.pending;
      return { ...result, pending };
    }
    cur = { ...cur, ownerState: result.ownerState, otherState: result.otherState, logs: result.logs, lastProcessedCards: result.lastProcessedCards };
    // 自分のTRASH（HAND_CARD/SIGNI/ENERGY_CARD）が対象なし（done だが lastProcessedCards 空）→ 残りSEQUENCEをスキップ
    if (step.type === 'TRASH' && i + 1 < a.steps.length) {
      const tA = step as import('../types/effects').TrashAction;
      if (tA.target.owner === 'self' &&
          (tA.target.type === 'HAND_CARD' || tA.target.type === 'SIGNI' || tA.target.type === 'ENERGY_CARD') &&
          (cur.lastProcessedCards ?? []).length === 0) {
        return done(addLog(cur, 'TRASH対象なし：残りのSEQUENCEをスキップ'));
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
  return needsInteraction(ctx, {
    type: 'CHOOSE', options, count: effectiveCount,
    ...(effectiveUpTo || effectiveCount > 1 ? { multiSelect: true } : {}),
    ...(effectiveUpTo ? { upTo: true } as Record<string, unknown> : {}),
    ...(a.opponentResponds ? { opponentResponds: true } : {}),
  } as PendingInteractionDef & { type: 'CHOOSE' });
}

function execConditional(a: ConditionalAction, ctx: ExecCtx): ExecResult {
  const cond = evalCondition(a.condition, ctx);
  if (cond) return executeAction(a.then, ctx);
  if (a.else) return executeAction(a.else, ctx);
  return done(ctx);
}

function execLookAndReorder(a: LookAndReorderAction, ctx: ExecCtx): ExecResult {
  const state = ownerState(a.source.owner as Owner, ctx);
  const count = resolveNum(a.count);
  const cards = state.deck.slice(0, count);
  if (cards.length === 0) return done(ctx);
  // 一時的にデッキからカードを取り除く
  const newS: PlayerState = { ...state, deck: state.deck.slice(count) };
  const newCtx = setOwnerState(a.source.owner as Owner, newS, ctx);
  return needsInteraction(newCtx, {
    type: 'LOOK_AND_REORDER',
    cards,
    canTrash: a.canTrash ?? false,
    destLocation: 'deck',
    destOwner: (a.destination.owner === 'any' ? 'self' : a.destination.owner) as 'self' | 'opponent',
    destPosition: a.destination.position,
    private: a.private,
  });
}

function execTransferToDeck(a: TransferToDeckAction, ctx: ExecCtx): ExecResult {
  const src = a.source;
  const state = ownerState(src.owner, ctx);
  const toBottom = a.position === 'bottom';

  function insertToDeck(s: PlayerState, cards: string[]): PlayerState {
    if (a.shuffle) return { ...s, deck: shuffle([...s.deck, ...cards]) };
    return toBottom
      ? { ...s, deck: [...s.deck, ...cards] }
      : { ...s, deck: [...cards, ...s.deck] };
  }

  if (src.type === 'TRASH_CARD') {
    const cands = trashCandidates(state, src.filter, ctx.cardMap, ctx.treatAsClassAllZones);
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

  if (src.type === 'SIGNI') {
    // frontOfGateZone: THE DOOR【ゲート】がある自分のシグニゾーンの正面にある対戦相手のシグニに限定
    let gateFrontRestrict: string[] | null = null;
    let srcFilter = src.filter;
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
    if (gateFrontRestrict !== null) cands = cands.filter(n => gateFrontRestrict!.includes(n));
    const count = src.count === 'ALL' ? cands.length : resolveNum(src.count);
    const scope: TargetScope = src.owner === 'self' ? 'self_field' : 'opp_field';

    function applyToBottom(selected: string[], c: ExecCtx): ExecCtx {
      let cur = c;
      for (const num of selected) {
        const s = ownerState(src.owner, cur);
        const removed = removeFromField(num, s);
        const newS = insertToDeck(removed, [num]);
        cur = addLog(setOwnerState(src.owner, newS, cur),
          `${cur.cardMap.get(num)?.CardName ?? num}をデッキ${toBottom ? '下' : '上'}へ`);
      }
      return cur;
    }

    if (src.count === 'ALL') return done({ ...applyToBottom(cands, ctx), lastProcessedCards: cands });
    return selectOrInteract(cands, count, false, scope, a, undefined, ctx);
  }

  return done(ctx);
}

function execGrantProtection(a: GrantProtectionAction, ctx: ExecCtx): ExecResult {
  // subjectFilter のみの場合は CONTINUOUS 用宣言（effectEngine 側で処理）→ no-op
  if (!a.target && a.subjectFilter) {
    return done(addLog(ctx, `効果耐性宣言（${a.from?.join('/')}保護）`));
  }
  if (!a.target) return done(ctx);
  // 効果耐性はキーワード付与として扱う
  const tgt = a.target;
  const keyword = `PROTECTION:${(a.from ?? []).join(',')}:${a.sourceOwner ?? ''}`;
  // UNTIL_OPP_TURN_END は長期ストア keyword_grants_until_opp_turn へ（次の相手ターン終了時までクリアされない）
  const gkey = a.duration === 'UNTIL_OPP_TURN_END' ? 'keyword_grants_until_opp_turn' : 'keyword_grants';

  const applyProtection = (selected: string[], c: ExecCtx): ExecCtx => {
    const s = ownerState(tgt.owner, c);
    const grants = { ...(s[gkey] ?? {}) };
    for (const n of selected) grants[n] = [...new Set([...(grants[n] ?? []), keyword])];
    return addLog(setOwnerState(tgt.owner, { ...s, [gkey]: grants }, c),
      `${selected.map(n => c.cardMap.get(getCardNum(n))?.CardName ?? n).join('・')}に効果耐性（${(a.from ?? []).join('/')}）を付与`);
  };

  // センタールリグへの付与（「あなたのセンタールリグ…は効果を受けない」WX04-064 等）
  if (tgt.type === 'LRIG') {
    const lrigTop = ownerState(tgt.owner, ctx).field.lrig?.at(-1);
    return done(lrigTop ? applyProtection([lrigTop], ctx) : ctx);
  }

  const state = ownerState(tgt.owner, ctx);
  const cands = fieldCandidates(state, tgt.filter, ctx.cardMap, ctx.effectivePowers, ctx.allColorSigniNums, ctx.fieldSigniExtraColors);
  if (tgt.count === 'ALL') return done(applyProtection(cands, ctx));
  const count = resolveNum(tgt.count);
  const scope: TargetScope = tgt.owner === 'self' ? 'self_field' : 'opp_field';
  return selectOrInteract(cands, count, false, scope, a, undefined, ctx);
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

  // //
  let charmCands: string[];
  let charmFromLocation: 'hand' | 'energy' | 'trash' | 'deck';
  if (a.charm.type === 'DECK_CARD') {
    charmCands = charmSrc.deck.slice(0, 1);
    charmFromLocation = 'deck';
  } else if (a.charm.type === 'TRASH_CARD') {
    charmCands = charmSrc.trash.filter(n => matchesFilter(ctx.cardMap.get(n), a.charm.filter));
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
  } else {
    toCands = fieldCandidates(toState, a.to.filter, ctx.cardMap, ctx.effectivePowers);
  }
  if (toCands.length === 0) return done(addLog(ctx, 'チャーム付与対象なし'));

  const charmNum = charmCands[0];
  const targetNum = toCands[0];
  const zoneIdx = toState.field.signi.findIndex(s => s?.at(-1) === targetNum);
  if (zoneIdx < 0) return done(addLog(ctx, 'チャーム付与: ゾーン不明'));

  // チャームカードをソースから除去
  let newCharmSrc: PlayerState = { ...charmSrc };
  if (charmFromLocation === 'deck') {
    newCharmSrc = { ...newCharmSrc, deck: newCharmSrc.deck.slice(1) };
  } else if (charmFromLocation === 'energy') {
    newCharmSrc = { ...newCharmSrc, energy: newCharmSrc.energy.filter(n => n !== charmNum) };
  } else if (charmFromLocation === 'trash') {
    newCharmSrc = { ...newCharmSrc, trash: newCharmSrc.trash.filter(n => n !== charmNum) };
  } else {
    newCharmSrc = { ...newCharmSrc, hand: newCharmSrc.hand.filter(n => n !== charmNum) };
  }
  let ctx2 = setOwnerState(charmOwner, newCharmSrc, ctx);

  // 対象シグニのゾーンにチャームをセット
  let newToState = ownerState(toOwner, ctx2);
  const charms = [...(newToState.field.signi_charms ?? [null, null, null])];
  charms[zoneIdx] = charmNum;
  newToState = { ...newToState, field: { ...newToState.field, signi_charms: charms } };
  ctx2 = setOwnerState(toOwner, newToState, ctx2);

  const cardName = ctx.cardMap.get(charmNum)?.CardName ?? charmNum;
  const targetName = ctx.cardMap.get(targetNum)?.CardName ?? targetNum;
  return done(addLog(ctx2, `${cardName}を${targetName}にチャームとして付与`));
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
  const count = resolveNum(a.revealCount);
  const visible = state.deck.slice(0, count);
  let pickable = a.filter ? visible.filter(n => matchesFilter(ctx.cardMap.get(n), a.filter)) : visible;
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
  const maxPick = a.pickCount === 'ALL' ? pickable.length : a.pickCount;

  if (pickable.length === 0) {
    // ピック対象なし：残りを指定場所へ
    if (a.remainder) {
      const pos = a.remainder.position;
      const newS: PlayerState = {
        ...state,
        deck: pos === 'bottom'
          ? [...state.deck.slice(count), ...visible]
          : state.deck,
      };
      return done(addLog(setOwnerState(a.owner, newS, ctx), `デッキ上${count}枚を確認`));
    }
    return done(ctx);
  }

  // 一時的にデッキ上部を除去
  const newS: PlayerState = { ...state, deck: state.deck.slice(count) };
  const newCtx = setOwnerState(a.owner, newS, ctx);

  return needsInteraction(newCtx, {
    type: 'SEARCH',
    visibleCards: pickable,
    maxPick,
    thenAction: a.then,
    afterAction: a.remainder
      ? {
          type: 'LOOK_AND_REORDER',
          source: { location: 'deck', owner: a.owner },
          count: 0, // placeholder: remainder handled separately
          private: true,
          reorder: false,
          destination: { location: a.remainder.location, owner: a.owner, position: a.remainder.position },
        }
      : undefined,
  });
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

// REVEAL_UNTIL_TO_HAND: デッキ上から revealClass のシグニ（省略=任意シグニ）がめくれるまで公開し、
// そのシグニを手札に加え、公開した他のカードを restDest（シャッフルしてデッキ下/デッキ下/トラッシュ）へ。
function execRevealUntilToHand(a: import('../types/effects').RevealUntilToHandAction, ctx: ExecCtx): ExecResult {
  const state = ownerState(a.owner, ctx);
  let foundIdx = -1;
  for (let i = 0; i < state.deck.length; i++) {
    const card = ctx.cardMap.get(state.deck[i]);
    if (card?.Type === 'シグニ' && (!a.revealClass || (card.CardClass ?? '').includes(a.revealClass))) { foundIdx = i; break; }
  }
  if (foundIdx < 0) {
    // 該当シグニなし：公開した全カード（=デッキ全体）を restDest へ（シャッフル）
    const newS: PlayerState = { ...state, deck: a.restDest === 'trash' ? [] : shuffle([...state.deck]),
      ...(a.restDest === 'trash' ? { trash: [...state.trash, ...state.deck] } : {}) };
    return done(addLog(setOwnerState(a.owner, newS, ctx), `デッキに${a.revealClass ? `＜${a.revealClass}＞の` : ''}シグニがなかった`));
  }
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
  if (emptyZones.length === 0) {
    // 場に出せない → トラッシュ（原文「場に出すことのできないシグニはトラッシュに置かれる」）
    cur = addLog(setOwnerState(a.owner, { ...fieldState, trash: [...fieldState.trash, hit] }, cur),
      `空きゾーンなし → ${ctx.cardMap.get(hit)?.CardName ?? hit}をトラッシュ`);
    return executeAction(next, cur);
  }
  // 空きゾーン（最も若いゾーン）へ自動配置する。複数体を1回の効果処理内で中断なく順に場へ出すため、
  // ゾーン選択（SELECT_SIGNI_ZONE）は行わない。場に出したシグニは lastProcessedCards に蓄積し、
  // 呼び出し側（BattleScreen）がこのスペルの処理後に【出】(ON_PLAY) を発火するためのキーにする。
  signi[emptyZones[0].i] = [hit];
  cur = addLog(setOwnerState(a.owner, { ...fieldState, field: { ...fieldState.field, signi } }, cur),
    `${ctx.cardMap.get(hit)?.CardName ?? hit}を場に出す`);
  cur = { ...cur, lastProcessedCards: [...(cur.lastProcessedCards ?? []), hit] };
  return executeAction(next, cur);
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
  if (a.costThreshold != null) {
    cands = cands.filter(n => {
      const c = ctx.cardMap.get(n);
      const total = parseEnergyCosts(c?.Cost ?? '').reduce((s, e) => s + e.count, 0);
      return total <= a.costThreshold!;
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

function execCostIncrease(a: CostIncreaseAction, ctx: ExecCtx): ExecResult {
  const tgtOwner = a.targetOwner === 'self' ? 'self' : 'opponent';
  const state = ownerState(tgtOwner, ctx);
  const mod = {
    direction: 'increase' as const,
    targetCardType: a.targetCardType,
    amount: a.amount,
    until: (a.duration ?? 'PERMANENT') as 'END_OF_TURN' | 'NEXT_TURN' | 'PERMANENT',
  };
  const newS: PlayerState = {
    ...state,
    cost_modifiers: [...(state.cost_modifiers ?? []), mod],
  };
  return done(addLog(setOwnerState(tgtOwner, newS, ctx), `${a.targetCardType}コスト+${a.amount.map(e => e.count + e.color).join('')}`));
}

function execPowerModifyPerField(a: PowerModifyPerFieldAction, ctx: ExecCtx): ExecResult {
  // cardNumxcludeSelf
  const tgtOwnerForExclude = a.target.owner === 'any' ? 'self' : a.target.owner as Owner;
  const tgtStatePre = ownerState(tgtOwnerForExclude, ctx);
  const tgtCandsPre = a.target.count !== 'ALL'
    ? fieldCandidates(tgtStatePre, a.target.filter, ctx.cardMap, ctx.effectivePowers)
    : [];
  const excludeCardNum = a.excludeSelf && tgtCandsPre.length > 0 ? tgtCandsPre[0] : undefined;

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
  const cands = fieldCandidates(state, a.target.filter, ctx.cardMap, ctx.effectivePowers, ctx.allColorSigniNums, ctx.fieldSigniExtraColors);

  function applyMod(selected: string[], c: ExecCtx): ExecCtx {
    const s = ownerState(tgtOwner, c);
    const mods = [...(s.temp_power_mods ?? []), ...selected.map(cardNum => ({ cardNum, delta }))];
    return addLog(setOwnerState(tgtOwner, { ...s, temp_power_mods: mods }, c),
      `${delta > 0 ? '+' : ''}${delta}（フィールド${fieldCount}体）`);
  }

  if (a.target.count === 'ALL') return done(applyMod(cands, ctx));
  const cnt = resolveNum(a.target.count);
  const scope: TargetScope = tgtOwner === 'self' ? 'self_field' : 'opp_field';
  return selectOrInteract(cands, cnt, a.target.upToCount ?? false, scope, a, undefined, ctx);
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
  return selectOrInteract(cands, a.count, a.upToCount ?? false, scope, thenAction, undefined, ctx);
}

function execTakeFromUnderSigni(a: import('../types/effects').TakeFromUnderSigniAction, ctx: ExecCtx): ExecResult {
  let cands: string[] = [];
  if (a.fromThis && ctx.sourceCardNum) {
    const zoneIdx = ctx.ownerState.field.signi.findIndex(s => s?.includes(ctx.sourceCardNum!));
    if (zoneIdx !== -1) {
      const stack = ctx.ownerState.field.signi[zoneIdx]!;
      // under-cards = all except the last (top) card
      cands = stack.slice(0, -1).filter(cn => !a.filter || matchesFilter(ctx.cardMap.get(cn), a.filter));
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
  return selectOrInteract(cands, a.count, a.upToCount ?? false, 'self_field', a, undefined, ctx);
}

function execNegateAttack(a: import('../types/effects').NegateAttackAction, ctx: ExecCtx): ExecResult {
  const tgtOwner = a.target.owner === 'any' ? 'opponent' : a.target.owner as Owner;
  const state = ownerState(tgtOwner, ctx);
  const cands = fieldCandidates(state, a.target.filter, ctx.cardMap, ctx.effectivePowers, ctx.allColorSigniNums, ctx.fieldSigniExtraColors);
  if (cands.length === 0) return done(ctx);

  if (a.target.count === 'ALL') {
    const s = ownerState(tgtOwner, ctx);
    const negated = [...(s.negated_attacks ?? []), ...cands];
    const newS = { ...s, negated_attacks: negated };
    return done(addLog(setOwnerState(tgtOwner, newS, ctx), `${cands.length}体のシグニのアタックを無効化`));
  }
  const cnt = resolveNum(a.target.count);
  const scope: TargetScope = tgtOwner === 'self' ? 'self_field' : 'opp_field';
  return selectOrInteract(cands, cnt, a.target.upToCount ?? false, scope, a, undefined, ctx);
}

function execAwakenSigni(ctx: ExecCtx): ExecResult {
  if (!ctx.sourceCardNum) return done(ctx);
  const awakened = [...(ctx.ownerState.awakened_signi ?? [])];
  if (!awakened.includes(ctx.sourceCardNum)) awakened.push(ctx.sourceCardNum);
  const newOwner = { ...ctx.ownerState, awakened_signi: awakened };
  return done(addLog({ ...ctx, ownerState: newOwner }, `${ctx.sourceCardNum}が覚醒状態になった`));
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
  const lv = parseInt(ctx.cardMap.get(lrigNum ?? '')?.Level ?? '0', 10);
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
  return selectOrInteract(cands, count, a.target.upToCount ?? false, scope, a, undefined, ctx);
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

function execRemoveAbilities(a: RemoveAbilitiesAction, ctx: ExecCtx): ExecResult {
  const tgtOwner = a.target.owner === 'any' ? 'opponent' : a.target.owner as Owner;
  const state = ownerState(tgtOwner, ctx);
  // frontOfSelf: 効果元シグニの正面（相手ゾーン 2-zi）のシグニに限定（WX17-035「このシグニの正面のシグニ」）
  let resolvedFilter = a.target.filter;
  let frontRestrict: string[] | null = null;
  if (resolvedFilter?.frontOfSelf) {
    const { frontOfSelf: _f, ...rest } = resolvedFilter;
    resolvedFilter = rest;
    if (tgtOwner === 'opponent' && ctx.sourceCardNum) {
      const zi = ctx.ownerState.field.signi.findIndex(s => s?.at(-1) === ctx.sourceCardNum);
      const frontNum = zi >= 0 ? ctx.otherState.field.signi[2 - zi]?.at(-1) : undefined;
      frontRestrict = frontNum ? [frontNum] : [];
    } else {
      frontRestrict = [];
    }
  }
  // thisCardOnly: 効果元シグニ自身のみ（「このシグニは能力を失う」）
  let thisCardRestrict: string[] | null = null;
  if (resolvedFilter?.thisCardOnly) {
    const { thisCardOnly: _t, ...rest } = resolvedFilter;
    resolvedFilter = rest;
    thisCardRestrict = (ctx.sourceCardNum && state.field.signi.some(s => s?.at(-1) === ctx.sourceCardNum))
      ? [ctx.sourceCardNum] : [];
  }
  let cands = fieldCandidates(state, resolvedFilter, ctx.cardMap, ctx.effectivePowers, ctx.allColorSigniNums, ctx.fieldSigniExtraColors);
  if (frontRestrict !== null) cands = cands.filter(n => frontRestrict!.includes(n));
  if (thisCardRestrict !== null) cands = cands.filter(n => thisCardRestrict!.includes(n));
  const removed = [...(state.abilities_removed ?? []), ...cands];
  const newS: PlayerState = { ...state, abilities_removed: removed };
  return done(addLog(setOwnerState(tgtOwner, newS, ctx), `${cands.length}`));
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
  const newS: PlayerState = { ...state, deck: state.deck.slice(chargeCount), energy: [...state.energy, ...took] };
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
  const count = a.useDeclaredCount
    ? (ctx.ownerState.declared_guard_restrict_level ?? 0)
    : a.count;
  const state = ownerState(a.owner, ctx);
  const actual = Math.min(count, state.deck.length);
  if (actual === 0) return done(addLog(ctx, 'デッキが空のためミルをスキップ'));
  const milled = state.deck.slice(0, actual);
  const newState: PlayerState = {
    ...state,
    deck: state.deck.slice(actual),
    trash: [...state.trash, ...milled],
  };
  const updatedCtx = setOwnerState(a.owner, newState, ctx);
  return done(addLog(
    { ...updatedCtx, lastProcessedCards: milled },
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
  const newS: PlayerState = { ...s, must_attack_signi: true, must_attack_infected_only: a.infectedOnly ?? false };
  const ctx2 = setOwnerState(a.targetOwner, newS, ctx);
  const who = a.targetOwner === 'opponent' ? '対戦相手' : '自分';
  const scopeLabel = a.infectedOnly ? '感染状態の' : '';
  return done(addLog(ctx2, `${who}の${scopeLabel}シグニは可能ならばアタックしなければならない`));
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
  return selectOrInteract(cands, cnt, a.target.upToCount ?? false, scope, a, undefined, ctx);
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
  return selectOrInteract(cands, cnt, a.target.upToCount ?? false, scope, a, undefined, ctx);
}

function execPowerModifyPerHandCount(a: import('../types/effects').PowerModifyPerHandCountAction, ctx: ExecCtx): ExecResult {
  const handState = a.handOwner === 'self' ? ctx.ownerState : ctx.otherState;
  const count = handState.hand.length;
  const delta = a.deltaPerCard * count;
  if (delta === 0) return done(ctx);

  const tgtO = a.target.owner === 'opponent' ? 'opponent' : 'self' as 'self' | 'opponent';
  const state = ownerState(tgtO, ctx);
  const cands = fieldCandidates(state, a.target.filter, ctx.cardMap, ctx.effectivePowers, ctx.allColorSigniNums, ctx.fieldSigniExtraColors);
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
  return selectOrInteract(cands, cnt, a.target.upToCount ?? false, scope, a, undefined, ctx);
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
      hand_discarded_just: otherDiscarded.length > 0 ? [...(ctx.otherState.hand_discarded_just ?? []), ...otherDiscarded] : ctx.otherState.hand_discarded_just },
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

function execAttachAcce(a: AttachAcceAction, ctx: ExecCtx): ExecResult {
  const srcState = a.sourceOwner === 'opponent' ? ctx.otherState : ctx.ownerState;
  const tgtState = a.targetSigniOwner === 'opponent' ? ctx.otherState : ctx.ownerState;
  const acce = tgtState.field.signi_acce ?? [null, null, null];

  // romHand
   if (a.fromHand) {
    const handCands = srcState.hand.filter(cn => {
      const card = ctx.cardMap.get(cn);
      return card && card.Type === 'シグニ' && (!a.signiFilter || matchesFilter(card, a.signiFilter));
    });
    if (handCands.length === 0) return done(addLog(ctx, 'アクセ可能な手札シグニなし'));
    // ステップ1: 手札からアクセカードを選択 → ステップ2: ホストシグニ選択へ
    const selectHostAction: AttachAcceAction = { ...a, fromHand: false };
    return needsInteraction(addLog(ctx, '手札からアクセするシグニを選択'), {
      type: 'SELECT_TARGET',
      candidates: handCands,
      count: 1,
      optional: false,
      targetScope: 'self_hand',
      thenAction: selectHostAction as import('../types/effects').EffectAction,
    });
  }

  // エナゾーン/手札からのアクセ: ホストシグニ選択
  // targetFilter でホスト側フィルター、signiFilter でアクセカード側フィルター
  const hostCands = (tgtState.field.signi ?? []).flatMap((stack, i) => {
    if (!stack || stack.length === 0) return [];
    if (acce[i] !== null) return [];
    const top = stack[stack.length - 1];
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

// ===== メイン実行関数 =====

export function executeAction(action: EffectAction, ctx: ExecCtx): ExecResult {
  switch (action.type) {
    case 'DRAW':                    return execDraw(action as DrawAction, ctx);
    case 'BANISH':                  return execBanish(action as BanishAction, ctx);
    case 'BOUNCE':                  return execBounce(action as BounceAction, ctx);
    case 'POWER_MODIFY':            return execPowerModify(action as PowerModifyAction, ctx);
    case 'POWER_MULTIPLY':          return execPowerMultiply(action as import('../types/effects').PowerMultiplyAction, ctx);
    case 'POWER_SET':               return execPowerSet(action as PowerSetAction, ctx);
    case 'TRASH':                   return execTrash(action as TrashAction, ctx);
    case 'ENERGY_CHARGE':           return execEnergyCharge(action as EnergyChargeAction, ctx);
    case 'ENERGY_CHARGE_FROM_DECK': return execEnergyChargeFromDeck(action as EnergyChargeFromDeckAction, ctx);
    case 'LIFE_CRASH':              return execLifeCrash(action as LifeCrashAction, ctx);
    case 'SHUFFLE_DECK':            return execShuffleDeck(action as ShuffleDeckAction, ctx);
    case 'REVEAL':                  return done(addLog(ctx, 'カードを公開'));
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
    case 'RECOLLECT_GATE':         return done(addLog(ctx, 'レコレクトゲート'));
    case 'CHOOSE':                  return execChoose(action as ChooseAction, ctx);
    case 'CONDITIONAL':             return execConditional(action as ConditionalAction, ctx);
    case 'LOOK_AND_REORDER':        return execLookAndReorder(action as LookAndReorderAction, ctx);
    case 'TRANSFER_TO_DECK':        return execTransferToDeck(action as TransferToDeckAction, ctx);
    case 'COUNTER_SPELL':           return done(ctx); // 打ち消しログはBattleScreen側でスペル名付きで出力
    case 'COST_REDUCTION': {
      // 次に使用するスペルのコスト軽減（WX04-008）: フラグに積み、BattleScreenのスペル使用コスト計算で消費。
      const cr = action as import('../types/effects').CostReductionAction;
      if (cr.targetCardType === 'スペル' && !cr.isGrowCost && cr.reduction?.length) {
        const existing = ctx.ownerState.next_spell_cost_reduction ?? [];
        return done(addLog(
          { ...ctx, ownerState: { ...ctx.ownerState, next_spell_cost_reduction: [...existing, ...cr.reduction] } },
          `次に使用するスペルのコストを${cr.reduction.map(r => `《${r.color}×${r.count}》`).join('')}軽減`));
      }
      return done(addLog(ctx, 'コスト軽減'));
    }
    case 'GRANT_PROTECTION':        return execGrantProtection(action as GrantProtectionAction, ctx);
    case 'ATTACH_CHARM':            return execAttachCharm(action as AttachCharmAction, ctx);
    case 'REVEAL_AND_PICK':         return execRevealAndPick(action as RevealAndPickAction, ctx);
    case 'PLAY_FREE':               return execPlayFree(action as PlayFreeAction, ctx);
    case 'COST_INCREASE':           return execCostIncrease(action as CostIncreaseAction, ctx);
    case 'POWER_MODIFY_PER_FIELD':     return execPowerModifyPerField(action as PowerModifyPerFieldAction, ctx);
    case 'DRAW_PER_FIELD_COUNT':       return execDrawPerFieldCount(action as import('../types/effects').DrawPerFieldCountAction, ctx);
    case 'ENERGY_CHARGE_FROM_DECK_PER_FIELD_COUNT': return execEnergyChargeFromDeckPerFieldCount(action as import('../types/effects').EnergyChargeFromDeckPerFieldCountAction, ctx);
    case 'AWAKEN_SIGNI':               return execAwakenSigni(ctx);
    case 'NEGATE_ATTACK':              return execNegateAttack(action as import('../types/effects').NegateAttackAction, ctx);
    case 'PLACE_UNDER_SIGNI':          return execPlaceUnderSigni(action as import('../types/effects').PlaceUnderSigniAction, ctx);
    case 'PLACE_UNDER_SOURCE_SIGNI':   return done(addLog(ctx, 'シグニの下に置く（直接呼出）')); // applyDirectAction内で処理
    case 'TAKE_FROM_UNDER_SIGNI':      return execTakeFromUnderSigni(action as import('../types/effects').TakeFromUnderSigniAction, ctx);
    case 'POWER_MODIFY_PER_LRIG_LEVEL': return execPowerModifyPerLrigLevel(action as PowerModifyPerLrigLevelAction, ctx);
    case 'FORCE_END_TURN':             return done(addLog({ ...ctx, forceEndTurn: true }, 'ターンを強制終了'));
    case 'CHARM_PROTECTION':           return execCharmProtection(action as CharmProtectionAction, ctx);
    case 'MUTUAL_DISCARD_AND_DRAW': return execMutualDiscardAndDraw(action as MutualDiscardAndDrawAction, ctx);
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
        const existing = ctx.ownerState.lrig_granted_auto_effects ?? [];
        const newOwner: PlayerState = {
          ...ctx.ownerState,
          lrig_granted_auto_effects: [...existing, ...ga.abilities],
        };
        return done(addLog({ ...ctx, ownerState: newOwner }, `ルリグ付与能力: ${ga.rawText}`));
      }
      return done(ctx);
    }
    case 'PLACE_VIRUS':                  return execPlaceVirus(action as PlaceVirusAction, ctx);
    case 'ATTACH_ACCE':                  return execAttachAcce(action as AttachAcceAction, ctx);
    case 'BLOOD_CRYSTAL_ARMOR':          return execBloodCrystalArmor(action as BloodCrystalArmorAction, ctx);
    case 'POWER_MODIFY_PER_VIRUS_COUNT': return done(addLog(ctx, 'ウィルス数比例パワー（effectEngine処理）'));
    case 'LRIG_LIMIT_MODIFY':            return done(addLog(ctx, `リミット${(action as import('../types/effects').LrigLimitModifyAction).delta > 0 ? '+' : ''}${(action as import('../types/effects').LrigLimitModifyAction).delta}（UI処理）`));
    case 'ADD_CRAFT_TO_LRIG_DECK':       return execAddCraftToLrigDeck(action as import('../types/effects').AddCraftToLrigDeckAction, ctx);
    //  以下はCONTINUOUS効果専用（effectEngine側で処理）
    case 'BANISH_REDIRECT': {
      const newOwner: PlayerState = { ...ctx.ownerState, banish_redirect: true };
      return done(addLog({ ...ctx, ownerState: newOwner }, '対戦相手のシグニのバニッシュ先をトラッシュへ変更'));
    }
    case 'REARRANGE_SIGNI':                return execRearrangeSigni(action as import('../types/effects').RearrangeSigniAction, ctx);
    case 'SET_BASE_LEVEL':                 return done(ctx); // CONTINUOUS。基本レベルは applyContinuousBaseLevelOverride（cardMap上書き）で反映
    case 'GROW_FREE':                      return done(addLog(ctx, 'フリーグロウ（BattleScreen処理）'));
    case 'POWER_MODIFY_PER_STACK':         return done(addLog(ctx, 'スタック参照パワー（effectEngine処理）'));
    case 'POWER_MODIFY_PER_DECK_COUNT':    return done(addLog(ctx, 'デッキ枚数比例パワー（effectEngine処理）'));
    case 'POWER_MODIFY_PER_ENERGY_COLOR':  return done(addLog(ctx, 'エナ色種類比例パワー（effectEngine処理）'));
    case 'ALT_COST_OPP_TURN':
      return done(addLog(ctx, '対戦相手ターン間コスト変動（展開フェイズで適用済み）'));
    case 'BLOCK_CARD_USE': {
      const bcu = action as import('../types/effects').BlockCardUseAction;
      const newOwner = { ...ctx.ownerState, blocked_card_names: [...(ctx.ownerState.blocked_card_names ?? []), bcu.cardName] };
      return done(addLog({ ...ctx, ownerState: newOwner }, `${bcu.cardName}`));
    }
    case 'PREVENT_NEXT_DAMAGE': {
      const pnd = action as import('../types/effects').PreventNextDamageAction;
      const newOwner = { ...ctx.ownerState, prevent_next_damage: (ctx.ownerState.prevent_next_damage ?? 0) + (pnd.count ?? 1) };
      return done(addLog({ ...ctx, ownerState: newOwner }, `このターン、次の${pnd.count ?? 1}回のダメージを無効`));
    }
    case 'ENERGY_CHARGE_BY_FIELD_COUNT':   return execEnergyChargeByFieldCount(action as import('../types/effects').EnergyChargeByFieldCountAction, ctx);
    case 'POWER_MODIFY_BY_TARGET_LEVEL':   return execPowerModifyByTargetLevel(action as PowerModifyByTargetLevelAction, ctx);
    case 'POWER_MODIFY_PER_TRASHED_LEVEL': return execPowerModifyPerTrashedLevel(action as import('../types/effects').PowerModifyPerTrashedLevelAction, ctx);
    case 'POWER_MODIFY_PER_CHARM':         return execPowerModifyPerCharm(action as import('../types/effects').PowerModifyPerCharmAction, ctx);
    case 'REVEAL_UNTIL_BANISH_SAME_LEVEL': return execRevealUntilBanishSameLevel(action as import('../types/effects').RevealUntilBanishSameLevelAction, ctx);
    case 'REVEAL_UNTIL_TO_HAND':           return execRevealUntilToHand(action as import('../types/effects').RevealUntilToHandAction, ctx);
    case 'REVEAL_UNTIL_TO_FIELD':          return execRevealUntilToField(action as import('../types/effects').RevealUntilToFieldAction, ctx);
    case 'GAIN_BOND':               return execGainBond(action as import('../types/effects').GainBondAction, ctx);
    case 'MILL':                    return execMill(action as MILLAction, ctx);
    case 'STUB': return execStub(action as StubAction, ctx, executeAction);
    case 'UNKNOWN':                 return done(addLog(ctx, `[UNKNOWN: ${(action as {raw:string}).raw?.slice(0, 40) ?? ''}]`));
    default:                        return done(ctx);
  }
}

export function executeEffect(effect: CardEffect, ctx: ExecCtx): ExecResult {
  return executeAction(effect.action, ctx);
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
  const topLife = (!preventLifeToTrash && st.life_cloth.length > 0) ? st.life_cloth[st.life_cloth.length - 1] : null;
  return {
    state: {
      ...st,
      deck: shuffle([...st.trash]),
      trash: preventLifeToTrash ? st.trash : (topLife ? [topLife] : []),
      life_cloth: (!preventLifeToTrash && topLife) ? st.life_cloth.slice(0, -1) : st.life_cloth,
      refresh_count_this_turn: (st.refresh_count_this_turn ?? 0) + 1,
    },
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
  // 選択されたカードに thenAction を個別適用
  let cur = ctx;
  for (const cardNum of selected) {
    // thenActionを単一カードに適用するため、フィルタなしで直接適用
    const result = applyDirectAction(pending.thenAction, cardNum, cur);
    if (!result.done) return result;
    cur = { ...cur, ownerState: result.ownerState, otherState: result.otherState, logs: result.logs };
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
    cur = addLog({ ...cur, ownerState: { ...removed, trash: [...removed.trash, selfNum] } },
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

// SEARCH: picked[]
export function resumeSearch(
  picked: string[],
  pending: PendingInteractionDef & { type: 'SEARCH' },
  ctx: ExecCtx,
): ExecResult {
  let cur = ctx;
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
    };
    return execPlaceSigniOnField(placeAll, cur);
  }
  for (const id of picked) {
    const result = applyDirectAction(pending.thenAction, id, cur);
    if (!result.done) return result;
    cur = { ...cur, ownerState: result.ownerState, otherState: result.otherState, logs: result.logs };
  }
  // EVEAL_PICK_HAND_SHUFFLE_BOTTOM
   if (pending.restDest) {
    const remaining = pending.visibleCards.filter(n => !picked.includes(n));
    let logMsg = '';
    for (const cardNum of remaining) {
      const di = cur.ownerState.deck.indexOf(cardNum);
      if (di < 0) continue;
      const newDeck = [...cur.ownerState.deck];
      newDeck.splice(di, 1);
      if (pending.restDest === 'deck_bottom') {
        newDeck.push(cardNum);
        cur = { ...cur, ownerState: { ...cur.ownerState, deck: newDeck } };
        logMsg = '残りをデッキ下へ';
      } else if (pending.restDest === 'trash') {
        cur = { ...cur, ownerState: { ...cur.ownerState, deck: newDeck, trash: [...cur.ownerState.trash, cardNum] } };
        logMsg = '残りをトラッシュへ';
      } else if (pending.restDest === 'energy') {
        cur = { ...cur, ownerState: { ...cur.ownerState, deck: newDeck, energy: [...cur.ownerState.energy, cardNum] } };
        logMsg = '残りをエナゾーンへ';
      }
    }
    if (logMsg && remaining.length > 0) cur = addLog(cur, logMsg);
  }
  cur = { ...cur, lastProcessedCards: picked };
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
    return executeAction(pending.continuation, { ...ctx, ownerState: result.ownerState, otherState: result.otherState, logs: result.logs });
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
  const payOpt  = pending.options.find(o => o.id === 'pay');

  if (choiceId !== 'pay') {
    // スキップ: スキップアクション → continuation
    const result = executeAction(skipOpt?.action ?? noopAction, ctx);
    if (!result.done) return result;
    if (pending.continuation) {
      return executeAction(pending.continuation, { ...ctx, ownerState: result.ownerState, otherState: result.otherState, logs: result.logs });
    }
    return result;
  }

  // :
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

  const newEnergy = ctx.ownerState.energy.filter(n => !energyNums.includes(n));
  const newTrash  = [...ctx.ownerState.trash, ...energyNums];
  const cur = addLog(
    { ...ctx, ownerState: { ...ctx.ownerState, energy: newEnergy, trash: newTrash } },
    `コスト支払い: ${(payOpt?.costColors ?? []).map(c => `《${c}》`).join('')}`,
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
    return executeAction(pending.continuation, { ...cur, ownerState: result.ownerState, otherState: result.otherState, logs: result.logs });
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
    const result = executeAction(skipOpt?.action ?? noopAction, ctx);
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
      return executeAction(pending.continuation, { ...ctx, ownerState: result.ownerState, otherState: result.otherState, logs: result.logs });
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
  if (pending.continuation) return executeAction(pending.continuation, cur);
  return done(cur);
}

// LOOK_AND_REORDER: reordered[] =export
 export function resumeLookAndReorder(
  reordered: string[],
  trashed: string[],
  pending: PendingInteractionDef & { type: 'LOOK_AND_REORDER' },
  ctx: ExecCtx,
): ExecResult {
  const keep = reordered.filter(n => !trashed.includes(n));
  const destOwner = pending.destOwner;
  const state = ownerState(destOwner, ctx);
  let newS: PlayerState;
  if (pending.destPosition === 'top') {
    newS = { ...state, deck: [...keep, ...state.deck], trash: [...state.trash, ...trashed] };
  } else if (pending.destPosition === 'bottom') {
    newS = { ...state, deck: [...state.deck, ...keep], trash: [...state.trash, ...trashed] };
  } else if (pending.destPosition === 'first_top_rest_bottom') {
    // 1枚目→デッキトップ、残り→デッキ下
    const [firstCard, ...restCards] = keep;
    newS = { ...state, deck: [...(firstCard ? [firstCard] : []), ...state.deck, ...restCards], trash: [...state.trash, ...trashed] };
  } else {
    newS = { ...state, deck: [...keep, ...state.deck], trash: [...state.trash, ...trashed] };
  }
  const cur = addLog(setOwnerState(destOwner, newS, ctx), `デッキを並べ替え`);
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
  const newS: PlayerState = { ...state, field: { ...state.field, signi } };
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
  let newS: PlayerState = { ...state, field: { ...state.field, signi } };
  if (pending.asDown) {
    const newDown = [...(newS.field.signi_down ?? [false, false, false])] as boolean[];
    newDown[zoneIndex] = true;
    newS = { ...newS, field: { ...newS.field, signi_down: newDown } };
  }
  const cur = addLog(setOwnerState(pending.owner, newS, ctx),
    `${ctx.cardMap.get(pending.cardNum)?.CardName ?? pending.cardNum}をゾーン${zoneIndex + 1}に場に出す`);
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
  // swap や単体指定は未対応（従来どおりログのみ。WX04-041-E2 の「すべてを配置し直す」を対象）
  if (a.swap || a.target.count !== 'ALL') {
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
  };
  const newState: PlayerState = { ...state, field: newField };
  const cur = addLog(setOwnerState(pending.owner, newState, ctx), 'シグニを配置し直した');
  if (pending.continuation) return executeAction(pending.continuation, cur);
  return done(cur);
}

// ===== 直接アクション適用（特定のcardNumに対して） =====

function applyDirectAction(action: EffectAction, cardNum: string, ctx: ExecCtx): ExecResult {
  switch (action.type) {
    case 'BANISH': {
      // cardNumが opponent.field にあるか自分のフィールドにあるかを検索
      let found: Owner | null = null;
      if (ctx.ownerState.field.signi.some(s => s?.at(-1) === cardNum)) found = 'self';
      if (ctx.otherState.field.signi.some(s => s?.at(-1) === cardNum)) found = 'opponent';
      if (!found) return done(ctx);
      const s = ownerState(found, ctx);
      const removed = removeFromField(cardNum, s);
      // バニッシュ先リダイレクト（トラッシュ/手札/デッキ下）を適用
      const opp = ownerState(found === 'self' ? 'opponent' : 'self', ctx);
      const { state: withEnergy, log } = banishDestination(removed, opp, cardNum);
      return done(addLog(setOwnerState(found, withEnergy, ctx),
        `${ctx.cardMap.get(cardNum)?.CardName ?? cardNum}${log}`));
    }
    case 'BOUNCE': {
      let found: Owner | null = null;
      if (ctx.ownerState.field.signi.some(s => s?.at(-1) === cardNum)) found = 'self';
      if (ctx.otherState.field.signi.some(s => s?.at(-1) === cardNum)) found = 'opponent';
      if (!found) return done(ctx);
      const s = ownerState(found, ctx);
      const removed = removeFromField(cardNum, s);
      const withHand: PlayerState = { ...removed, hand: [...removed.hand, cardNum] };
      return done(addLog(setOwnerState(found, withHand, ctx),
        `${ctx.cardMap.get(cardNum)?.CardName ?? cardNum}`));
    }
    case 'TRASH': {
      const trashAction = action as TrashAction;
      const tgt = trashAction.target;
      if (tgt.type === 'SIGNI') {
        // フィールドのシグニをトラッシュ
        const owner = tgt.owner as Owner;
        const s = ownerState(owner, ctx);
        if (s.field.signi.some(stack => stack?.at(-1) === cardNum)) {
          const removed = removeFromField(cardNum, s);
          const newS: PlayerState = { ...removed, trash: [...removed.trash, cardNum] };
          return done(addLog(setOwnerState(owner, newS, ctx),
            `${ctx.cardMap.get(cardNum)?.CardName ?? cardNum}をトラッシュへ`));
        }
        return done(ctx);
      }
      // HAND_CARD: hand からトラッシュ（同名カードが複数ある場合は先頭の1枚のみ）
      for (const owner of ['self', 'opponent'] as Owner[]) {
        const s = ownerState(owner, ctx);
        const hi = s.hand.indexOf(cardNum);
        if (hi >= 0) {
          const newHand = [...s.hand];
          newHand.splice(hi, 1);
          const newS: PlayerState = { ...s, hand: newHand, trash: [...s.trash, cardNum] };
          return done(addLog(setOwnerState(owner, newS, ctx), `${ctx.cardMap.get(cardNum)?.CardName ?? cardNum}をトラッシュへ`));
        }
      }
      return done(ctx);
    }
    case 'POWER_MODIFY': {
      const pmAction = action as PowerModifyAction;
      const delta = resolveNum(pmAction.delta);
      // owner:'any' は選ばれたカードの所属フィールドを判定して該当プレイヤーへ適用
      const tgtOwner: Owner = pmAction.target.owner === 'any'
        ? (ctx.ownerState.field.signi.some(s => s?.at(-1) === cardNum) ? 'self' : 'opponent')
        : pmAction.target.owner as Owner;
      const powerModKey = pmAction.duration === 'UNTIL_OPP_TURN_END' ? 'power_mods_until_opp_turn' : 'temp_power_mods';
      const s = ownerState(tgtOwner, ctx);
      const mods = [...(s[powerModKey] ?? []), { cardNum, delta, srcType: srcTypeOf(ctx) }];
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
    case 'ADD_TO_HAND': {
      // インスタンスIDで正確な1枚を特定しデッキ/トラッシュから除去して手札へ
      const cn = getCardNum(cardNum);
      let s = { ...ctx.ownerState };
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
      return done(addLog({ ...ctx, ownerState: newS }, `${ctx.cardMap.get(cn)?.CardName ?? cn}を手札に加える`));
    }
    case 'ADD_TO_ENERGY': {
      // デッキ/トラッシュから除去してエナゾーンへ
      const cnE = getCardNum(cardNum);
      let sE = { ...ctx.ownerState };
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
      return done(addLog({ ...ctx, ownerState: newSE }, `${ctx.cardMap.get(cnE)?.CardName ?? cnE}をエナゾーンへ`));
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
      let newS = { ...state };
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
      const signi = [...newS.field.signi] as (string[] | null)[];
      const emptyZones = signi.map((z, i) => ({ i, empty: !z || z.length === 0 })).filter(x => x.empty);
      if (emptyZones.length === 0) {
        return done(addLog(setOwnerState(owner, newS, ctx), `空きシグニゾーンなし（${ctx.cardMap.get(cardNum)?.CardName ?? cardNum}配置不可）`));
      }
      if (emptyZones.length >= 2 && (owner === 'self' || owner === 'opponent')) {
        const ctxAfterRemove = setOwnerState(owner, newS, ctx);
        return needsInteraction(ctxAfterRemove, { type: 'SELECT_SIGNI_ZONE', cardNum, owner, ...(asDown ? { asDown } : {}) });
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
      // cardNum = SELECT_TARGET で選ばれたシグニ
      const acceAction = action as import('../types/effects').AttachAcceAction;
      const tgtState = ownerState(acceAction.targetSigniOwner, ctx);
      const srcState = ownerState(acceAction.sourceOwner, ctx);
      // cardNum = SELECT_TARGETで選ばれたホストシグニ
      const zoneIdx  = tgtState.field.signi.findIndex(s => s?.at(-1) === cardNum);
      if (zoneIdx < 0) return done(ctx);
      // acceカード = sourceCardNum（エナゾーンからの場合）または lastProcessedCards[0]（手札選択後）
      const acceCardNum = ctx.sourceCardNum ?? ctx.lastProcessedCards?.[0];
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
      // signi_acce[zoneIdx] に設定
      const tgt2 = ownerState(acceAction.targetSigniOwner, ctx2);
      const newAcce = [...(tgt2.field.signi_acce ?? [null, null, null])];
      newAcce[zoneIdx] = acceCardNum;
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
      // cardNum を対象シグニの negated_attacks に追加
      const na = action as import('../types/effects').NegateAttackAction;
      const tgtOwner = na.target.owner === 'any' ? 'opponent' : na.target.owner as Owner;
      const s = ownerState(tgtOwner, ctx);
      const negated = [...(s.negated_attacks ?? []), cardNum];
      const newS = { ...s, negated_attacks: negated };
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
      const downOwner = downA.target.owner === 'any' ? 'opponent' : downA.target.owner as Owner;
      const downS = ownerState(downOwner, ctx);
      const zoneIdx = downS.field.signi.findIndex(st => st?.at(-1) === cardNum);
      if (zoneIdx < 0) return done(ctx);
      const newDown = [...(downS.field.signi_down ?? [false, false, false])] as boolean[];
      newDown[zoneIdx] = true;
      return done(addLog(setOwnerState(downOwner, { ...downS, field: { ...downS.field, signi_down: newDown } }, ctx),
        `${ctx.cardMap.get(cardNum)?.CardName ?? cardNum}をダウン`));
    }
    case 'FREEZE': {
      const frzA = action as import('../types/effects').FreezeAction;
      const frzOwner = frzA.target.owner === 'any' ? 'opponent' : frzA.target.owner as Owner;
      const frzS = ownerState(frzOwner, ctx);
      const frzIdx = frzS.field.signi.findIndex(st => st?.at(-1) === cardNum);
      if (frzIdx < 0) return done(ctx);
      const newFrz = [...(frzS.field.signi_frozen ?? [false, false, false])] as boolean[];
      newFrz[frzIdx] = true;
      const frzFieldPatch: Partial<PlayerState['field']> = { signi_frozen: newFrz };
      if (frzA.down) {
        const newFrzDown = [...(frzS.field.signi_down ?? [false, false, false])] as boolean[];
        newFrzDown[frzIdx] = true;
        frzFieldPatch.signi_down = newFrzDown;
      }
      return done(addLog(setOwnerState(frzOwner, { ...frzS, field: { ...frzS.field, ...frzFieldPatch } }, ctx),
        `${ctx.cardMap.get(cardNum)?.CardName ?? cardNum}`));
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
      let geOwner: Owner | null = null;
      if (ctx.ownerState.field.signi.some(s => s?.at(-1) === cardNum)) geOwner = 'self';
      else if (ctx.otherState.field.signi.some(s => s?.at(-1) === cardNum)) geOwner = 'opponent';
      if (!geOwner) return done(ctx);
      const geS = ownerState(geOwner, ctx);
      const geGranted = { ...(geS.granted_effects ?? {}) };
      geGranted[cardNum] = [...(geGranted[cardNum] ?? []), geA.effect];
      return done(addLog(setOwnerState(geOwner, { ...geS, granted_effects: geGranted }, ctx),
        `${ctx.cardMap.get(cardNum)?.CardName ?? cardNum}`));
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
      let newOwner = { ...ctx.ownerState, field: { ...ctx.ownerState.field, signi: newSigni } };
      const destLabel = ta.destination === 'hand' ? '手札' : ta.destination === 'energy' ? 'エナゾーン' : 'トラッシュ';
      if (ta.destination === 'hand') {
        newOwner = { ...newOwner, hand: [...newOwner.hand, cardNum] };
      } else if (ta.destination === 'energy') {
        newOwner = { ...newOwner, energy: [...newOwner.energy, cardNum] };
      } else {
        newOwner = { ...newOwner, trash: [...newOwner.trash, cardNum] };
      }
      return done(addLog({ ...ctx, ownerState: newOwner },
        `${ctx.cardMap.get(cardNum)?.CardName ?? cardNum}${destLabel}`));
    }
    case 'ADD_TO_LIFE': {
      // fromHand 選択後: 手札からライフクロスに移動
      const atlA = action as import('../types/effects').AddToLifeAction;
      const atlOwner = atlA.owner;
      const atlS = ownerState(atlOwner, ctx);
      const hi = atlS.hand.indexOf(cardNum);
      if (hi < 0) return done(ctx);
      const newHand = [...atlS.hand];
      newHand.splice(hi, 1);
      const newAtlS: PlayerState = { ...atlS, hand: newHand, life_cloth: [...atlS.life_cloth, cardNum] };
      return done(addLog(setOwnerState(atlOwner, newAtlS, ctx),
        `${ctx.cardMap.get(cardNum)?.CardName ?? cardNum}をライフクロスに追加`));
    }
    default:
      // STUB 等の場合、選択中の cardNum を lastProcessedCards で引き渡す
      return executeAction(action, { ...ctx, lastProcessedCards: [cardNum] });
  }
}

