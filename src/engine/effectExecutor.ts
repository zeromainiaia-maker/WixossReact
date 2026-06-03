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
  PlaceVirusAction,
  AttachAcceAction,
  BloodCrystalArmorAction,
  GrantLrigAbilityAction,
  GrantEffectAction,
  StubAction,
} from '../types/effects';
import type { ExecCtx, ExecResult } from './execUtils';
import {
  done, addLog, needsInteraction, ownerState, setOwnerState, shuffle, resolveNum,
  matchesFilter, getCardNum, removeFromField, fieldCandidates, handCandidates,
  trashCandidates, energyCandidates, evalCondition, selectOrInteract, canPayOptionalCost,
  evalUseCondition,
} from './execUtils';
export type { ExecCtx, ExecResult };
export { matchesFilter, getCardNum, removeFromField, evalUseCondition };
import { execStub } from './execStub';

// ===== 蛟句挨繧｢繧ｯ繧ｷ繝ｧ繝ｳ螳溯｡・=====

function execDraw(a: DrawAction, ctx: ExecCtx): ExecResult {
  const count = resolveNum(a.count);
  const state = ownerState(a.owner, ctx);
  const canDraw = Math.min(count, state.deck.length);
  let s: PlayerState = {
    ...state,
    hand: [...state.hand, ...state.deck.slice(0, canDraw)],
    deck: state.deck.slice(canDraw),
  };
  if (canDraw < count && s.trash.length > 0) {
    const topLife = s.life_cloth.at(-1) ?? null;
    s = {
      ...s,
      deck: shuffle([...s.trash]),
      trash: topLife ? [topLife] : [],
      life_cloth: topLife ? s.life_cloth.slice(0, -1) : s.life_cloth,
    };
  }
  return done(addLog(setOwnerState(a.owner, s, ctx), `${count}譫壹ラ繝ｭ繝ｼ`));
}

function execBanish(a: BanishAction, ctx: ExecCtx): ExecResult {
  const tgt = a.target;
  const state = ownerState(tgt.owner, ctx);
  const cands = fieldCandidates(state, tgt.filter, ctx.cardMap, ctx.effectivePowers, ctx.allColorSigniNums, ctx.fieldSigniExtraColors);
  const scope: TargetScope = tgt.owner === 'self' ? 'self_field' : 'opp_field';

  function applyBanish(selected: string[], c: ExecCtx): ExecCtx {
    let cur = c;
    for (const num of selected) {
      const s = ownerState(tgt.owner, cur);
      const removed = removeFromField(num, s);
      const withEnergy: PlayerState = { ...removed, energy: [...removed.energy, num] };
      cur = addLog(setOwnerState(tgt.owner, withEnergy, cur),
        `${cur.cardMap.get(num)?.CardName ?? num}繧偵ヰ繝九ャ繧ｷ繝･`);
    }
    return cur;
  }

  if (tgt.count === 'ALL') return done(applyBanish(cands, ctx));
  const count = resolveNum(tgt.count);
  return selectOrInteract(cands, count, (a.optional ?? false) || (tgt.upToCount ?? false), scope, a, undefined, ctx);
}

function execBounce(a: BounceAction, ctx: ExecCtx): ExecResult {
  const tgt = a.target;
  const state = ownerState(tgt.owner, ctx);
  const bounceProtected = tgt.owner === 'opponent' ? new Set(ctx.otherBounceProtectedNums ?? []) : new Set<string>();
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
        `${cur.cardMap.get(num)?.CardName ?? num}繧呈焔譛ｭ縺ｫ謌ｻ縺兪`);
    }
    return cur;
  }

  if (tgt.count === 'ALL') return done(applyBounce(cands, ctx));
  const count = resolveNum(tgt.count);
  return selectOrInteract(cands, count, (a.optional ?? false) || (tgt.upToCount ?? false), scope, a, undefined, ctx);
}

function execPowerModify(a: PowerModifyAction, ctx: ExecCtx): ExecResult {
  const delta = resolveNum(a.delta);
  const tgtOwner = a.target.owner === 'any' ? 'self' : a.target.owner as Owner;
  const state = ownerState(tgtOwner, ctx);
  const cands = fieldCandidates(state, a.target.filter, ctx.cardMap, ctx.effectivePowers, ctx.allColorSigniNums, ctx.fieldSigniExtraColors);
  if (cands.length === 0) return done(ctx);

  function applyPowerMod(selected: string[], c: ExecCtx): ExecCtx {
    const s = ownerState(tgtOwner, c);
    const mods = [
      ...(s.temp_power_mods ?? []),
      ...selected.map(cardNum => ({ cardNum, delta })),
    ];
    const newS: PlayerState = { ...s, temp_power_mods: mods };
    return addLog(setOwnerState(tgtOwner, newS, c), 'パワー' + (delta > 0 ? '+' : '') + delta);
  }

  if (a.target.count === 'ALL') return done(applyPowerMod(cands, ctx));
  const count = resolveNum(a.target.count);
  const scope: TargetScope = tgtOwner === 'self' ? 'self_field' : 'opp_field';
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
    return addLog(setOwnerState(tgtOwner, { ...s, temp_power_mods: [...filtered, ...setMods] }, c), 'パワーを' + value + 'にセット');
  }

  if (a.target.count === 'ALL') return done(applyPowerSet(cands, ctx));

  const count = resolveNum(a.target.count);
  // 縲後％縺ｮ繧ｷ繧ｰ繝九・ sourceCardNum 縺悟呵｣懊↓蜷ｫ縺ｾ繧後※縺・ｌ縺ｰ閾ｪ蜍暮←逕ｨ
  if (ctx.sourceCardNum && cands.includes(ctx.sourceCardNum)) {
    return done(applyPowerSet([ctx.sourceCardNum], ctx));
  }
  const scope: TargetScope = tgtOwner === 'self' ? 'self_field' : 'opp_field';
  return selectOrInteract(cands, count, a.target.upToCount ?? false, scope, a, undefined, ctx);
}

function execTrash(a: TrashAction, ctx: ExecCtx): ExecResult {
  const tgt = a.target;
  const state = ownerState(tgt.owner, ctx);

  if (tgt.type === 'SIGNI') {
    const cands = fieldCandidates(state, tgt.filter, ctx.cardMap, ctx.effectivePowers, ctx.allColorSigniNums, ctx.fieldSigniExtraColors);
    const scope: TargetScope = tgt.owner === 'self' ? 'self_field' : 'opp_field';
    function applyTrashField(selected: string[], c: ExecCtx): ExecCtx {
      let cur = c;
      // PREVENT_SIGNI_MOVE_BY_OPP_EXCEPT_BANISH遲峨・菫晁ｭｷ繝√ぉ繝・け・育嶌謇九す繧ｰ繝九ｒ繝医Λ繝・す繝･遘ｻ蜍輔☆繧句ｴ蜷茨ｼ・      const trashFieldProtected = tgt.owner === 'opponent'
        ? new Set(c.otherTrashFieldProtectedNums ?? [])
        : new Set<string>();
      for (const num of selected) {
        if (trashFieldProtected.has(num)) {
          cur = addLog(cur, `${cur.cardMap.get(num)?.CardName ?? num}縺ｯ菫晁ｭｷ荳ｭ・医ヨ繝ｩ繝・す繝･遘ｻ蜍輔ｒ髦ｻ豁｢・荏`);
          continue;
        }
        const s = ownerState(tgt.owner, cur);
        const removed = removeFromField(num, s);
        cur = addLog(setOwnerState(tgt.owner,
          { ...removed, trash: [...removed.trash, num] }, cur),
          `${cur.cardMap.get(num)?.CardName ?? num}繧偵ヨ繝ｩ繝・す繝･縺ｸ`);
      }
      return cur;
    }
    if (tgt.count === 'ALL') return done({ ...applyTrashField(cands, ctx), lastProcessedCards: cands });
    const count = resolveNum(tgt.count);
    return selectOrInteract(cands, count, false, scope, a, undefined, ctx);
  }

  if (tgt.type === 'HAND_CARD') {
    if (tgt.blind) {
      const count = tgt.count === 'ALL' ? state.hand.length : resolveNum(tgt.count);
      const picked = shuffle([...state.hand]).slice(0, count);
      const newS: PlayerState = {
        ...state,
        hand: state.hand.filter(n => !picked.includes(n)),
        trash: [...state.trash, ...picked],
      };
      return done({ ...addLog(setOwnerState(tgt.owner, newS, ctx), `謇区惆${count}譫壹Λ繝ｳ繝繝謐ｨ縺ｦ`), lastProcessedCards: picked });
    }
    const cands = handCandidates(state, tgt.filter, ctx.cardMap);
    const scope: TargetScope = tgt.owner === 'self' ? 'self_hand' : 'opp_hand';
    function applyTrashHand(selected: string[], c: ExecCtx): ExecCtx {
      const s = ownerState(tgt.owner, c);
      // PREVENT_ZONE_MOVE_BY_OPP: 逶ｸ謇句柑譫懊〒謇区惆繧偵ヨ繝ｩ繝・す繝･縺ｫ遘ｻ蜍輔＆縺帙↑縺・ｼ亥虚逧・ｨ育ｮ礼沿 + AUTO險ｭ鄂ｮ繝輔Λ繧ｰ・・      if (tgt.owner === 'opponent' && (c.otherProtectedZones?.includes('hand') || c.otherState.prevent_opp_trash_from?.includes('hand'))) {
        return addLog(c, '逶ｸ謇区焔譛ｭ菫晁ｭｷ・・REVENT_ZONE_MOVE_BY_OPP・会ｼ壽焔譛ｭ竊偵ヨ繝ｩ繝・す繝･髦ｻ豁｢');
      }
      const remaining = [...s.hand];
      const toTrash: string[] = [];
      for (const n of selected) {
        const idx = remaining.indexOf(n);
        if (idx >= 0) { remaining.splice(idx, 1); toTrash.push(n); }
      }
      const newS: PlayerState = { ...s, hand: remaining, trash: [...s.trash, ...toTrash] };
      return addLog(setOwnerState(tgt.owner, newS, c), `謇区惆${toTrash.length}譫壽昏縺ｦ繧義`);
    }
    if (tgt.count === 'ALL') return done({ ...applyTrashHand(cands, ctx), lastProcessedCards: cands });
    const count = resolveNum(tgt.count);
    // actingPlayerSelects=true: 縲梧焔譛ｭ繧定ｦ九※N譫夐∈縺ｳ謐ｨ縺ｦ縺輔○繧九・ 閾ｪ蛻・′驕ｸ謚・    // 縺昴ｌ莉･螟悶・ opponent 謇区惆: 縲悟ｯｾ謌ｦ逶ｸ謇九・謇区惆繧誰譫壽昏縺ｦ繧九・ 逶ｸ謇玖・霄ｫ縺碁∈謚・    const opponentResponds = tgt.owner === 'opponent' && !tgt.blind && !tgt.actingPlayerSelects;
    return selectOrInteract(cands, count, a.target.upToCount ?? false, scope, a, undefined, ctx, opponentResponds);
  }

  if (tgt.type === 'ENERGY_CARD') {
    const cands = energyCandidates(state, tgt.filter, ctx.cardMap);
    const scope: TargetScope = tgt.owner === 'self' ? 'self_energy' : 'opp_energy';
    function applyTrashEnergy(selected: string[], c: ExecCtx): ExecCtx {
      const s = ownerState(tgt.owner, c);
      // PREVENT_ZONE_MOVE_BY_OPP: 逶ｸ謇句柑譫懊〒繧ｨ繝翫ｒ繝医Λ繝・す繝･縺ｫ遘ｻ蜍輔＆縺帙↑縺・ｼ亥虚逧・ｨ育ｮ礼沿 + AUTO險ｭ鄂ｮ繝輔Λ繧ｰ・・      if (tgt.owner === 'opponent' && (c.otherProtectedZones?.includes('energy') || c.otherState.prevent_opp_trash_from?.includes('energy'))) {
        return addLog(c, '逶ｸ謇九お繝贋ｿ晁ｭｷ・・REVENT_ZONE_MOVE_BY_OPP・会ｼ壹お繝岩・繝医Λ繝・す繝･髦ｻ豁｢');
      }
      const newS: PlayerState = {
        ...s,
        energy: s.energy.filter(n => !selected.includes(n)),
        trash: [...s.trash, ...selected],
      };
      return addLog(setOwnerState(tgt.owner, newS, c), `繧ｨ繝翫だ繝ｼ繝ｳ${selected.length}譫壹ヨ繝ｩ繝・す繝･縺ｸ`);
    }
    if (tgt.count === 'ALL') return done({ ...applyTrashEnergy(cands, ctx), lastProcessedCards: cands });
    const count = resolveNum(tgt.count);
    return selectOrInteract(cands, count, tgt.upToCount ?? false, scope, a, undefined, ctx);
  }

  if (tgt.type === 'DECK_CARD') {
    const count = tgt.count === 'ALL' ? state.deck.length : resolveNum(tgt.count);
    const took = state.deck.slice(0, count);
    const newS: PlayerState = {
      ...state,
      deck: state.deck.slice(count),
      trash: [...state.trash, ...took],
    };
    return done({ ...addLog(setOwnerState(tgt.owner, newS, ctx), `繝・ャ繧ｭ荳・{count}譫壹ヨ繝ｩ繝・す繝･縺ｸ`), lastProcessedCards: took });
  }

  return done(ctx);
}

function execEnergyCharge(a: EnergyChargeAction, ctx: ExecCtx): ExecResult {
  const tgt = a.target;
  const state = ownerState(tgt.owner, ctx);
  let cands: string[];
  let scope: TargetScope;

  if (tgt.type === 'HAND_CARD') {
    cands = handCandidates(state, tgt.filter, ctx.cardMap);
    scope = 'self_hand';
  } else if (tgt.type === 'TRASH_CARD') {
    cands = trashCandidates(state, tgt.filter, ctx.cardMap);
    scope = 'self_trash';
  } else {
    cands = fieldCandidates(state, tgt.filter, ctx.cardMap, ctx.effectivePowers, ctx.allColorSigniNums, ctx.fieldSigniExtraColors);
    scope = 'self_field';
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
    return addLog(setOwnerState(tgt.owner, newS, c), `繧ｨ繝翫メ繝｣繝ｼ繧ｸ${selected.length}譫啻`);
  }

  const count = tgt.count === 'ALL' ? cands.length : resolveNum(tgt.count);
  if (tgt.count === 'ALL') return done(applyCharge(cands, ctx));
  return selectOrInteract(cands, count, tgt.upToCount ?? false, scope, a, undefined, ctx);
}

function execEnergyChargeFromDeck(a: EnergyChargeFromDeckAction, ctx: ExecCtx): ExecResult {
  // BLOCK_OPP_DECK_TO_ENERGY: 逶ｸ謇気ONT縺後い繧ｯ繝・ぅ繝悶↑繧芽・蛻・・繝・ャ繧ｭ竊偵お繝翫ｒ繝悶Ο繝・け
  if (a.owner === 'self' && ctx.deckToEnergyBlocked) {
    return done(addLog(ctx, '繝・ャ繧ｭ竊偵お繝顔ｧｻ蜍輔′繝悶Ο繝・け縺輔ｌ縺滂ｼ・ONT蜉ｹ譫懶ｼ・));
  }
  const count = resolveNum(a.count);
  const state = ownerState(a.owner, ctx);
  const took = state.deck.slice(0, count);
  const newS: PlayerState = {
    ...state,
    deck: state.deck.slice(count),
    energy: [...state.energy, ...took],
  };
  return done(addLog(setOwnerState(a.owner, newS, ctx), `繧ｨ繝翫メ繝｣繝ｼ繧ｸ${count}譫夲ｼ医ョ繝・く縺九ｉ・荏)`);
}

function execLifeCrash(a: LifeCrashAction, ctx: ExecCtx): ExecResult {
  const count = resolveNum(a.count);
  const state = ownerState(a.owner, ctx);
  const crashed: string[] = [];
  const life = [...state.life_cloth];
  for (let i = 0; i < count && life.length > 0; i++) {
    crashed.push(life.pop()!);
  }
  // 繧ｯ繝ｩ繝・す繝･縺励◆繧ｫ繝ｼ繝峨・check繧ｾ繝ｼ繝ｳ縺ｸ・医ヰ繝ｼ繧ｹ繝医ヨ繝ｪ繧ｬ繝ｼ縺ｯ蜻ｼ縺ｳ蜃ｺ縺怜・縺梧球蠖難ｼ・  const checkCard = crashed[0] ?? null;
  const newS: PlayerState = {
    ...state,
    life_cloth: life,
    field: { ...state.field, check: checkCard },
  };
  return done(addLog(setOwnerState(a.owner, newS, ctx), `繝ｩ繧､繝輔け繝ｭ繧ｹ${count}譫壹け繝ｩ繝・す繝･`));
}

function execShuffleDeck(a: ShuffleDeckAction, ctx: ExecCtx): ExecResult {
  const state = ownerState(a.owner, ctx);
  const newS: PlayerState = { ...state, deck: shuffle([...state.deck]) };
  return done(addLog(setOwnerState(a.owner, newS, ctx), '繝・ャ繧ｭ繧ｷ繝｣繝・ヵ繝ｫ'));
}

function execTransferToHand(a: TransferToHandAction, ctx: ExecCtx): ExecResult {
  const src = a.source;
  const tgtOwner = src.owner;
  const state = ownerState(tgtOwner, ctx);

  let cands: string[];
  let scope: TargetScope;

  if (src.type === 'TRASH_CARD') {
    cands = trashCandidates(state, src.filter, ctx.cardMap);
    scope = tgtOwner === 'self' ? 'self_trash' : 'opp_trash';
  } else if (src.type === 'ENERGY_CARD') {
    cands = energyCandidates(state, src.filter, ctx.cardMap);
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
    return addLog(setOwnerState(tgtOwner, newS, c), `${selected.length}譫壹ｒ謇区惆縺ｫ蜉縺医ｋ`);
  }

  const count = src.count === 'ALL' ? cands.length : resolveNum(src.count);
  if (src.count === 'ALL') return done(applyTransfer(cands, ctx));
  return selectOrInteract(cands, count, src.upToCount ?? false, scope, a, undefined, ctx);
}

function execAddToField(a: AddToFieldAction, ctx: ExecCtx): ExecResult {
  const tgtOwner = a.owner;
  const src = a.source;

  // BLOCK_OPP_SIGNI_FIELD_PLACE_BY_SIGNI_EFFECT: 繧ｷ繧ｰ繝句柑譫懊↓繧医ｋ閾ｪ繝輔ぅ繝ｼ繝ｫ繝峨∈縺ｮ繧ｷ繧ｰ繝矩・鄂ｮ繧偵ヶ繝ｭ繝・け
  if (tgtOwner === 'self' && ctx.signiFieldPlaceByEffectBlocked) {
    const srcCard = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    if (srcCard?.Type === '繧ｷ繧ｰ繝・) {
      return done(addLog(ctx, '繧ｷ繧ｰ繝句柑譫懊↓繧医ｋ繧ｷ繧ｰ繝矩・鄂ｮ縺後ヶ繝ｭ繝・け縺輔ｌ縺滂ｼ・ONT蜉ｹ譫懶ｼ・));
    }
  }

  // source譛ｪ謖・ｮ夲ｼ昴ョ繝・く繝医ャ繝励・繧ｫ繝ｼ繝峨ｒ繝励Ξ繧､繝､繝ｼ縺碁∈繧薙□繧ｾ繝ｼ繝ｳ縺ｫ蜃ｺ縺・  if (!src) {
    const state = ownerState(tgtOwner, ctx);
    if (state.deck.length === 0) return done(ctx);
    // 遨ｺ縺阪だ繝ｼ繝ｳ縺後↑縺代ｌ縺ｰ繧ｹ繧ｭ繝・・
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

  if (src.type === 'TRASH_CARD') {
    cands = trashCandidates(state, src.filter, ctx.cardMap);
    scope = tgtOwner === 'self' ? 'self_trash' : 'opp_trash';
  } else if (src.type === 'ENERGY_CARD') {
    cands = energyCandidates(state, src.filter, ctx.cardMap);
    scope = tgtOwner === 'self' ? 'self_energy' : 'opp_energy';
  } else {
    return done(ctx);
  }

  // 蝣ｴ縺ｫ蜃ｺ縺呻ｼ夂ｩｺ縺阪だ繝ｼ繝ｳ縺ｫ驟咲ｽｮ・亥他縺ｳ蜃ｺ縺怜・縺梧球蠖薙〒縺阪↑縺・◆繧∬・蜍慕噪縺ｫ譛蛻昴・遨ｺ縺阪∈・・  const srcDefined = src!;
  function applyToField(selected: string[], c: ExecCtx): ExecCtx {
    let cur = c;
    for (const n of selected) {
      const s = ownerState(tgtOwner, cur);
      let newS = { ...s };
      if (srcDefined.type === 'TRASH_CARD') {
        newS = { ...newS, trash: newS.trash.filter(x => x !== n) };
      } else if (srcDefined.type === 'ENERGY_CARD') {
        newS = { ...newS, energy: newS.energy.filter(x => x !== n) };
      }
      // 遨ｺ縺阪だ繝ｼ繝ｳ縺ｫ驟咲ｽｮ
      const signi = [...newS.field.signi] as (string[] | null)[];
      const emptyIdx = signi.findIndex(z => !z || z.length === 0);
      if (emptyIdx >= 0) signi[emptyIdx] = [n];
      newS = { ...newS, field: { ...newS.field, signi } };
      cur = addLog(setOwnerState(tgtOwner, newS, cur),
        `${cur.cardMap.get(n)?.CardName ?? n}繧貞ｴ縺ｫ蜃ｺ縺兪`);
    }
    return cur;
  }

  const count = src.count === 'ALL' ? cands.length : resolveNum(src.count);
  if (src.count === 'ALL') return done(applyToField(cands, ctx));
  return selectOrInteract(cands, count, src.upToCount ?? false, scope, a, undefined, ctx);
}

function execAddToLife(a: AddToLifeAction, ctx: ExecCtx): ExecResult {
  const count = resolveNum(a.count);
  const state = ownerState(a.owner, ctx);
  if (!a.fromTop) return done(ctx);
  const took = state.deck.slice(0, count);
  const newS: PlayerState = {
    ...state,
    deck: state.deck.slice(count),
    life_cloth: [...state.life_cloth, ...took],
  };
  return done(addLog(setOwnerState(a.owner, newS, ctx), `繝ｩ繧､繝輔け繝ｭ繧ｹ+${count}譫啻)`);
}

function execFreeze(a: FreezeAction, ctx: ExecCtx): ExecResult {
  const state = ownerState(a.target.owner, ctx);
  const cands = fieldCandidates(state, a.target.filter, ctx.cardMap, ctx.effectivePowers, ctx.allColorSigniNums, ctx.fieldSigniExtraColors);
  const scope: TargetScope = a.target.owner === 'self' ? 'self_field' : 'opp_field';

  function applyFreeze(selected: string[], c: ExecCtx): ExecCtx {
    let cur = c;
    for (const num of selected) {
      const s = ownerState(a.target.owner, cur);
      const zoneIdx = s.field.signi.findIndex(st => st?.at(-1) === num);
      if (zoneIdx < 0) continue;
      const newFrozen = [...(s.field.signi_frozen ?? [false, false, false])] as boolean[];
      const newDown   = [...(s.field.signi_down   ?? [false, false, false])] as boolean[];
      newFrozen[zoneIdx] = true;
      newDown[zoneIdx]   = true; // 蜃咲ｵ舌・繝繧ｦ繝ｳ迥ｶ諷九ｂ莨ｴ縺・      const newS: PlayerState = { ...s, field: { ...s.field, signi_frozen: newFrozen, signi_down: newDown } };
      cur = addLog(setOwnerState(a.target.owner, newS, cur),
        `${cur.cardMap.get(num)?.CardName ?? num}繧貞㍾邨秦`);
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
    const newS: PlayerState = { ...state, field: { ...state.field, lrig_down: true } };
    const lrigName = state.field.lrig?.length
      ? (ctx.cardMap.get(getCardNum(state.field.lrig.at(-1) ?? ''))?.CardName ?? '繝ｫ繝ｪ繧ｰ')
      : '繝ｫ繝ｪ繧ｰ';
    return done(addLog(setOwnerState(a.target.owner, newS, ctx), `${lrigName}繧偵ム繧ｦ繝ｳ`));
  }
  // PREVENT_SIGNI_DOWN_BY_OPP (state flag) 縺ｾ縺溘・ CONT菫晁ｭｷ蜉ｹ譫懊↓繧医ｊ繝繧ｦ繝ｳ辟｡蜉ｹ
  if (a.target.owner === 'opponent' && ctx.otherState.prevent_signi_down_by_opp) {
    return done(addLog(ctx, '逶ｸ謇九す繧ｰ繝九ム繧ｦ繝ｳ辟｡蜉ｹ・医ム繧ｦ繝ｳ髦ｲ豁｢蜉ｹ譫懶ｼ・));
  }
  const state = ownerState(a.target.owner, ctx);
  const downProtected = a.target.owner === 'opponent' ? new Set(ctx.otherDownProtectedNums ?? []) : new Set<string>();
  // keyword_grants 縺ｮ PROTECTION:DOWN:opponent 繧堤｢ｺ隱搾ｼ井ｸ譎ら噪縺ｪ菫晁ｭｷ莉倅ｸ趣ｼ・  if (a.target.owner === 'opponent') {
    const grants = ctx.otherState.keyword_grants ?? {};
    for (const [cardNum, kws] of Object.entries(grants)) {
      if (kws.some(kw => kw.startsWith('PROTECTION:') && kw.includes('DOWN') && kw.endsWith(':opponent'))) {
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
        `${cur.cardMap.get(num)?.CardName ?? num}繧偵ム繧ｦ繝ｳ`);
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
      ? (ctx.cardMap.get(getCardNum(s.field.lrig.at(-1) ?? ''))?.CardName ?? '繝ｫ繝ｪ繧ｰ')
      : '繝ｫ繝ｪ繧ｰ';
    const newS: PlayerState = { ...s, field: { ...s.field, lrig_down: false } };
    return done(addLog(setOwnerState(a.target.owner, newS, ctx), `${lrigName}繧偵い繝・・`));
  }
  const state = ownerState(a.target.owner, ctx);
  const cands = fieldCandidates(state, a.target.filter, ctx.cardMap, ctx.effectivePowers, ctx.allColorSigniNums, ctx.fieldSigniExtraColors);
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
        `${cur.cardMap.get(num)?.CardName ?? num}繧偵い繝・・`);
    }
    return cur;
  }

  if (a.target.count === 'ALL') return done(applyUp(cands, ctx));
  const count = resolveNum(a.target.count);
  return selectOrInteract(cands, count, false, scope, a, undefined, ctx);
}

function execBlockAction(a: BlockActionAction, ctx: ExecCtx): ExecResult {
  const state = ownerState(a.target.owner, ctx);
  // NEXT_TURN 縺ｯ ':NEXT_TURN' 繧ｵ繝輔ぅ繝・け繧ｹ縺ｧ蛹ｺ蛻･縺励√ち繝ｼ繝ｳ邨ゆｺ・凾縺ｫ螟画鋤縺励※谺｡縺ｮ繧ｿ繝ｼ繝ｳ縺ｫ驕ｩ逕ｨ
  const id = a.until === 'NEXT_TURN' ? `${a.actionId}:NEXT_TURN` : a.actionId;
  const blocked = [...(state.blocked_actions ?? []), id];
  const newS: PlayerState = { ...state, blocked_actions: blocked };
  return done(addLog(setOwnerState(a.target.owner, newS, ctx), `繧｢繧ｯ繧ｷ繝ｧ繝ｳ${a.actionId}繧貞ｰ√§繧義)`);
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
      `繧ｹ繝医・繝ｪ繝ｼ繧・{a.newStory}縺ｫ螟画峩`);
  }

  if (tgt.count === 'ALL') return done(applyStory(cands, ctx));
  const count = resolveNum(tgt.count);
  const scope: TargetScope = tgt.owner === 'self' ? 'self_field' : 'opp_field';
  return selectOrInteract(cands, count, false, scope, a, undefined, ctx);
}

function execGrantKeyword(a: GrantKeywordAction, ctx: ExecCtx): ExecResult {
  const tgt = a.target;
  const state = ownerState(tgt.owner, ctx);
  const cands = fieldCandidates(state, tgt.filter, ctx.cardMap, ctx.effectivePowers, ctx.allColorSigniNums, ctx.fieldSigniExtraColors);

  function applyGrant(selected: string[], c: ExecCtx): ExecCtx {
    const s = ownerState(tgt.owner, c);
    const grants = { ...(s.keyword_grants ?? {}) };
    for (const n of selected) {
      grants[n] = [...(grants[n] ?? []), a.keyword];
    }
    let newS: PlayerState = { ...s, keyword_grants: grants };

    // 繝√い繧ｬ繝ｼ繝ｫ縺ｯ繝輔Μ繝ｼ繧ｾ繝ｼ繝ｳ縺ｸ遘ｻ蜍・    if (a.keyword === '繝√い繧ｬ繝ｼ繝ｫ') {
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

    return addLog(setOwnerState(tgt.owner, newS, c), `縲・{a.keyword}縲代ｒ莉倅ｸ餐`);
  }

  if (tgt.count === 'ALL') return done(applyGrant(cands, ctx));
  const count = resolveNum(tgt.count);
  const scope: TargetScope = tgt.owner === 'self' ? 'self_field' : 'opp_field';
  return selectOrInteract(cands, count, false, scope, a, undefined, ctx);
}

function execGrantEffect(a: GrantEffectAction, ctx: ExecCtx): ExecResult {
  const tgt = a.target;
  const state = ownerState(tgt.owner, ctx);
  const cands = fieldCandidates(state, tgt.filter, ctx.cardMap, ctx.effectivePowers, ctx.allColorSigniNums, ctx.fieldSigniExtraColors);

  function applyGrant(selected: string[], c: ExecCtx): ExecCtx {
    const s = ownerState(tgt.owner, c);
    const granted = { ...(s.granted_effects ?? {}) };
    for (const n of selected) {
      granted[n] = [...(granted[n] ?? []), a.effect];
    }
    return addLog(setOwnerState(tgt.owner, { ...s, granted_effects: granted }, c), `閭ｽ蜉帑ｻ倅ｸ趣ｼ・{selected.length}菴難ｼ荏`);
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

  // '__lastRevealed__' 迚ｹ谿翫ヵ繧｣繝ｫ繧ｿ: 逶ｴ蜑阪↓蜈ｬ髢九＠縺溘き繝ｼ繝峨→蜷悟錐縺ｧ繧ｵ繝ｼ繝・  const resolvedFilter = { ...a.filter };
  if (resolvedFilter.cardName === '__lastRevealed__') {
    const revealedNum = ctx.lastProcessedCards?.[0];
    const revealedName = revealedNum ? ctx.cardMap.get(revealedNum)?.CardName : undefined;
    if (revealedName) resolvedFilter.cardName = revealedName;
    else delete resolvedFilter.cardName;
  }

  // 蟇ｾ雎｡繧ｫ繝ｼ繝峨′1譫壹〒繧ょｭ伜惠縺吶ｋ縺狗｢ｺ隱・  const hasVisible = pool.some(n => matchesFilter(ctx.cardMap.get(n), resolvedFilter));
  if (!hasVisible) {
    if (a.afterSearch) return executeAction(a.afterSearch, ctx);
    return done(ctx);
  }

  // 繝輔ぅ繝ｫ繧ｿ縺後≠繧句ｴ蜷医・荳閾ｴ繧ｫ繝ｼ繝峨・縺ｿ陦ｨ遉ｺ縲√↑縺・ｴ蜷医・蜈ｨ菴薙ｒ蜈ｬ髢・  const visibleCards = pool.filter(n => matchesFilter(ctx.cardMap.get(n), resolvedFilter));

  return needsInteraction(ctx, {
    type: 'SEARCH',
    visibleCards,
    maxPick: a.maxCount,
    thenAction: a.then,
    afterAction: a.afterSearch,
  });
}

function execSequence(a: SequenceAction, ctx: ExecCtx): ExecResult {
  let cur = ctx;
  for (let i = 0; i < a.steps.length; i++) {
    const step = a.steps[i];
    // 繝ｪ繧ｳ繝ｬ繧ｯ繝医ご繝ｼ繝茨ｼ壽擅莉ｶ譛ｪ驕斐↑繧画ｮ九ｊ繧ｹ繝・ャ繝励ｒ縺吶∋縺ｦ繧ｹ繧ｭ繝・・
    if (step.type === 'RECOLLECT_GATE') {
      const gate = step as import('../types/effects').RecollectGateAction;
      const artsInLrigTrash = (cur.ownerState.lrig_trash ?? []).filter(
        n => cur.cardMap.get(n)?.Type === '繧｢繝ｼ繝・
      ).length;
      if (artsInLrigTrash < gate.minArts) {
        return done(addLog(cur, `繝ｪ繧ｳ繝ｬ繧ｯ繝域擅莉ｶ譛ｪ驕費ｼ医い繝ｼ繝・{artsInLrigTrash}譫・/ 蠢・ｦ・{gate.minArts}譫壻ｻ･荳奇ｼ荏)`);
      }
      cur = addLog(cur, `繝ｪ繧ｳ繝ｬ繧ｯ繝域擅莉ｶ驕疲・・医い繝ｼ繝・{artsInLrigTrash}譫夲ｼ荏`);
      continue;
    }
    // TARGET_AND_DISCARD_HAND: 蟇ｾ謌ｦ逶ｸ謇九す繧ｰ繝九ｒ蟇ｾ雎｡縺ｨ縺玲焔譛ｭ繧呈昏縺ｦ縺ｦ繝舌ル繝・す繝･/繝舌え繝ｳ繧ｹ/繝代Ρ繝ｼ螟画峩
    if (step.type === 'STUB' && (step as import('../types/effects').StubAction).id === 'TARGET_AND_DISCARD_HAND') {
      const remaining = a.steps.slice(i + 1);
      const cont: EffectAction | undefined = remaining.length > 0
        ? (remaining.length === 1 ? remaining[0] : { type: 'SEQUENCE', steps: remaining } as SequenceAction)
        : undefined;
      const oppState = cur.otherState;
      const cands = fieldCandidates(oppState, { cardType: '繧ｷ繧ｰ繝・ }, cur.cardMap, cur.effectivePowers);
      // 蟇ｾ謌ｦ逶ｸ謇九す繧ｰ繝九ｒ繝舌ル繝・す繝･・・pplyDirectAction縺梧ｭ｣縺励＞繧ｫ繝ｼ繝峨ｒ迚ｹ螳夲ｼ峨√◎縺ｮ蠕梧焔譛ｭ1譫壽昏縺ｦ
      const banishAction: import('../types/effects').BanishAction = {
        type: 'BANISH', target: { type: 'SIGNI', owner: 'opponent', count: 1 },
      };
      const discardCont: EffectAction = { type: 'TRASH', target: { type: 'HAND_CARD', owner: 'self', count: 1 } } as import('../types/effects').TrashAction;
      const fullCont: EffectAction = cont
        ? { type: 'SEQUENCE', steps: [discardCont, cont] } as SequenceAction
        : discardCont;
      return selectOrInteract(cands, 1, false, 'opp_field', banishAction, fullCont, cur);
    }
    // COST_COLOR_SELECT: 繧ｳ繧ｹ繝郁牡縺ｫ蝓ｺ縺･縺肴ｬ｡縺ｮSEARCH縺ｫ濶ｲ繝輔ぅ繝ｫ繧ｿ繧帝←逕ｨ
    if (step.type === 'STUB' && (step as import('../types/effects').StubAction).id === 'COST_COLOR_SELECT') {
      const ccStub = step as import('../types/effects').StubAction;
      const colors = ccStub.costColors ?? [];
      const nextSearchStep = i + 1 < a.steps.length ? a.steps[i + 1] : undefined;
      if (nextSearchStep?.type === 'SEARCH' && colors.length > 0) {
        const searchStep = nextSearchStep as SearchAction;
        const afterRemaining = a.steps.slice(i + 2);
        const uniqueColors = [...new Set(colors)];
        if (uniqueColors.length === 1) {
          // 濶ｲ縺・遞ｮ鬘・ 濶ｲ繝輔ぅ繝ｫ繧ｿ莉倥″SEARCH繧堤峩謗･螳溯｡・          const coloredSearch: SearchAction = { ...searchStep, filter: { ...searchStep.filter, color: uniqueColors[0] } };
          const newSteps = [coloredSearch as EffectAction, ...afterRemaining];
          return execSequence({ type: 'SEQUENCE', steps: newSteps } as SequenceAction, addLog(cur, `繧ｳ繧ｹ繝郁牡驕ｸ謚橸ｼ・{uniqueColors[0]}`));
        } else {
          // 濶ｲ縺瑚､・焚: CHOOSE縺ｧ濶ｲ繧帝∈謚槭＆縺帙∝推濶ｲ縺ｮSEARCH繧貞ｮ溯｡・          const afterCont: EffectAction | undefined = afterRemaining.length > 0
            ? (afterRemaining.length === 1 ? afterRemaining[0] : { type: 'SEQUENCE', steps: afterRemaining } as SequenceAction)
            : undefined;
          const opts = uniqueColors.map(c => ({
            id: c, label: `縲・{c}縲九・繧ｷ繧ｰ繝九ｒ繧ｵ繝ｼ繝～, available: true,
            action: (() => {
              const cs: SearchAction = { ...searchStep, filter: { ...searchStep.filter, color: c } };
              return afterCont ? { type: 'SEQUENCE', steps: [cs as EffectAction, afterCont] } as SequenceAction : cs as EffectAction;
            })(),
          }));
          return needsInteraction(addLog(cur, '繧ｳ繧ｹ繝郁牡驕ｸ謚橸ｼ壹し繝ｼ繝√☆繧玖牡繧帝∈繧薙〒縺上□縺輔＞'), {
            type: 'CHOOSE', options: opts, count: 1,
          });
        }
      }
      cur = addLog(cur, '繧ｳ繧ｹ繝郁牡驕ｸ謚橸ｼ医せ繧ｭ繝・・・・);
      continue;
    }
    // 莉ｻ諢上さ繧ｹ繝医ヱ繧ｿ繝ｼ繝ｳ: STUB(蜷・ｨｮ莉ｻ諢上さ繧ｹ繝・ 竊・CONDITIONAL(IS_MY_TURN)
    // IS_MY_TURN 縺ｯ繝代・繧ｵ繝ｼ縺後後さ繧ｹ繝域髪謇輔＞ 竊・蜉ｹ譫懃匱蜍輔阪ｒ陦ｨ縺吶・繝ｬ繝ｼ繧ｹ繝帙Ν繝繝ｼ縺ｨ縺励※菴ｿ逕ｨ
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

        // SOUL_OP: 繧ｽ繧ｦ繝ｫ繧ｫ繝ｼ繝峨ｒ豸郁ｲｻ縺励※繧ｳ繧ｹ繝域髪謇輔＞・・XDi繧ｷ繝ｪ繝ｼ繧ｺ・・        if (stub.id === 'SOUL_OP') {
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
              label: soulName ? `繧ｽ繧ｦ繝ｫ・・{soulName}・峨ｒ菴ｿ逕ｨ縺励※逋ｺ蜍描 : '繧ｽ繧ｦ繝ｫ繧剃ｽｿ逕ｨ縺励※逋ｺ蜍・,
              action: payActionSO,
            },
            { id: 'skip', label: '繧ｹ繧ｭ繝・・', action: (conditional.else ?? noopAction) as EffectAction, available: true },
          ];
          const pendingSO: PendingInteractionDef = {
            type: 'CHOOSE', options: optionsSO, count: 1,
            ...(cont ? { continuation: cont } : {}),
          };
          return needsInteraction(addLog(cur, '繧ｽ繧ｦ繝ｫ繧剃ｽｿ逕ｨ縺励※逋ｺ蜍輔＠縺ｾ縺吶°・・), pendingSO);
        }

        // LRIG_UNDER_CARD_OP: 繧ｷ繧ｰ繝倶ｸ九・繧ｫ繝ｼ繝峨ｒ豸郁ｲｻ縺励※繧ｳ繧ｹ繝域髪謇輔＞・・X24/WX25/WXDi繧ｷ繝ｪ繝ｼ繧ｺ・・        if (stub.id === 'LRIG_UNDER_CARD_OP') {
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
              label: underName ? `縲・{underName}縲阪ｒ菴ｿ逕ｨ縺励※逋ｺ蜍描 : '繧ｷ繧ｰ繝倶ｸ九・繧ｫ繝ｼ繝峨ｒ菴ｿ逕ｨ縺励※逋ｺ蜍・,
              action: payActionLUCO,
            },
            { id: 'skip', label: '繧ｹ繧ｭ繝・・', action: (conditional.else ?? noopAction) as EffectAction, available: true },
          ];
          const pendingLUCO: PendingInteractionDef = {
            type: 'CHOOSE', options: optionsLUCO, count: 1,
            ...(cont ? { continuation: cont } : {}),
          };
          return needsInteraction(addLog(cur, '繧ｷ繧ｰ繝倶ｸ九・繧ｫ繝ｼ繝峨ｒ菴ｿ逕ｨ縺励※逋ｺ蜍輔＠縺ｾ縺吶°・・), pendingLUCO);
        }

        // OPTIONAL_HAND_REVEAL_NAMED: 蜷榊燕謖・ｮ壹き繝ｼ繝峨ｒ謇区惆縺九ｉ莉ｻ諢丞・髢・竊・縺昴≧縺励◆蝣ｴ蜷・conditional.then
        if (stub.id === 'OPTIONAL_HAND_REVEAL_NAMED') {
          const srcOHRN = cur.sourceCardNum ? cur.cardMap.get(cur.sourceCardNum) : undefined;
          const txtOHRN = srcOHRN ? (srcOHRN.EffectText ?? '') + ' ' + (srcOHRN.BurstText ?? '') : '';
          const nameM = txtOHRN.match(/縲・[^縲犠+)縲擬・・]譫壹ｒ蜈ｬ髢九＠縺ｦ繧ゅｈ縺・);
          const targetName = nameM ? nameM[1] : '';
          const hasCard = targetName
            ? cur.ownerState.hand.some(cn => cur.cardMap.get(cn)?.CardName === targetName)
            : false;
          const optionsOHRN = [
            { id: 'reveal', available: hasCard,
              label: targetName ? `縲・{targetName}縲九ｒ蜈ｬ髢九☆繧義 : '蜈ｬ髢九☆繧・,
              action: conditional.then },
            { id: 'skip', label: '蜈ｬ髢九＠縺ｪ縺・, action: (conditional.else ?? noopAction) as EffectAction, available: true },
          ];
          const pendingOHRN: PendingInteractionDef = {
            type: 'CHOOSE', options: optionsOHRN, count: 1,
            ...(cont ? { continuation: cont } : {}),
          };
          return needsInteraction(addLog(cur, `縲・{targetName}縲九ｒ蜈ｬ髢九＠縺ｾ縺吶°・歔), pendingOHRN`);
        }

        // TARGET_OPP_SIGNI_OPTIONAL_COLOR_COST: 逶ｸ謇九す繧ｰ繝九ｒ蟇ｾ雎｡縺ｫ縺励※莉ｻ諢剰牡繧ｳ繧ｹ繝域髪謇輔＞
        // 繝代・繧ｵ繝ｼ縺・conditional.then 縺ｮ target.owner 繧・'self' 縺ｨ隱､逕滓・縺吶ｋ縺溘ａ菫ｮ豁｣縺吶ｋ
        if (stub.id === 'TARGET_OPP_SIGNI_OPTIONAL_COLOR_COST') {
          const toHWTOSOC = (s: string) => s.replace(/[・・・兢/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
          const oppCandsTOSOC = fieldCandidates(cur.otherState, { cardType: '繧ｷ繧ｰ繝・ }, cur.cardMap, cur.effectivePowers);
          if (oppCandsTOSOC.length === 0) {
            if (cont) return executeAction(cont, cur);
            return done(addLog(cur, '蟇ｾ雎｡繧ｷ繧ｰ繝九↑縺暦ｼ・ARGET_OPP_SIGNI_OPTIONAL_COLOR_COST・・));
          }
          const canAffordTOSOC = costColors.length === 0 || canPayOptionalCost(costColors, cur.ownerState, cur.cardMap);
          // 繝代・繧ｵ繝ｼ繝舌げ菫ｮ豁｣: conditional.then 縺ｮ target.owner='self'/'any' 竊・'opponent'
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
          void toHWTOSOC; // count 隗｣譫舌・蛻ｩ逕ｨ縺励↑縺・ｼ・xecBanish/execBounce 縺瑚・蠕狗噪縺ｫ蛟呵｣懊ｒ謠千､ｺ・・          const fixedThenTOSOC = fixOwnerTOSOC(conditional.then);
          const payLabelTOSOC = costColors.length > 0
            ? `蟇ｾ雎｡驕ｸ謚槭＠縺ｦ逋ｺ蜍包ｼ・{costColors.map(c => `縲・{c}縲義).join('')}・荏
            : '蟇ｾ雎｡驕ｸ謚槭＠縺ｦ逋ｺ蜍・;
          // BANISH/BOUNCE遲峨・ opponent 菫ｮ豁｣縺ｫ繧医ｊ execBanish 縺ｧ逶ｸ謇九ヵ繧｣繝ｼ繝ｫ繝峨°繧・selectOrInteract 縺瑚ｵｰ繧・          const optsTOSOC = [
            { id: 'pay', label: payLabelTOSOC, action: fixedThenTOSOC, available: canAffordTOSOC, ...(costColors.length ? { costColors } : {}) },
            { id: 'skip', label: '繧ｹ繧ｭ繝・・', action: (conditional.else ?? noopAction) as EffectAction, available: true },
          ];
          return needsInteraction(addLog(cur, '莉ｻ諢上さ繧ｹ繝茨ｼ壼ｯｾ雎｡繧ｷ繧ｰ繝九ｒ驕ｸ繧薙〒逋ｺ蜍輔＠縺ｾ縺吶°・・), {
            type: 'CHOOSE', options: optsTOSOC, count: 1, ...(cont ? { continuation: cont } : {}),
          });
        }

        // OPTIONAL_TRASH_ENERGY_CLASS: 繧ｨ繝翫だ繝ｼ繝ｳ縺九ｉ迚ｹ螳壹け繝ｩ繧ｹ縺ｮ繧ｫ繝ｼ繝峨ｒ莉ｻ諢上〒繝医Λ繝・す繝･/謇区惆縺ｸ
        if (stub.id === 'OPTIONAL_TRASH_ENERGY_CLASS') {
          const srcOTEC = cur.sourceCardNum ? cur.cardMap.get(cur.sourceCardNum) : undefined;
          const txtOTEC = srcOTEC ? (srcOTEC.EffectText ?? '') + ' ' + (srcOTEC.BurstText ?? '') : '';
          const toHWOTEC = (s: string) => s.replace(/[・・・兢/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
          const classMOTEC = txtOTEC.match(/繧ｨ繝翫だ繝ｼ繝ｳ縺九ｉ(?:縺ゅ↑縺溘・)?(?:・・[^・枉+)・槭・)?(?:繧ｷ繧ｰ繝弓繧ｫ繝ｼ繝・/);
          const reqClassOTEC = classMOTEC?.[1] ?? '';
          const energyCandsOTEC = cur.ownerState.energy.filter(cn => {
            if (!reqClassOTEC) return true;
            return (cur.cardMap.get(cn)?.CardClass ?? '').includes(reqClassOTEC);
          });
          if (energyCandsOTEC.length === 0) {
            if (cont) return executeAction(cont, cur);
            return done(addLog(cur, `繧ｨ繝翫↓${reqClassOTEC || '繧ｫ繝ｼ繝・}縺ｪ縺暦ｼ・PTIONAL_TRASH_ENERGY_CLASS・荏)`);
          }
          const toHandOTEC = !!(txtOTEC.match(/縺昴ｌ繧呈焔譛ｭ縺ｫ蜉縺医ｋ/) || conditional.then.type === 'TRANSFER_TO_HAND');
          // conditional.then 縺ｮ BOUNCE/BANISH/DOWN 縺ｮ target.owner='self' 竊・'opponent' 菫ｮ豁｣
          let thenOTEC = conditional.then;
          if (['BOUNCE', 'BANISH', 'DOWN', 'POWER_MODIFY'].includes(thenOTEC.type)) {
            const wt = thenOTEC as unknown as { target?: { owner?: string; [k: string]: unknown }; [k: string]: unknown };
            if (wt.target?.owner === 'self') thenOTEC = { ...wt, target: { ...wt.target, owner: 'opponent' } } as unknown as EffectAction;
          }
          const cntMOTEC = txtOTEC.match(/([・・・兔d]+)譫・(?:縺ｾ縺ｧ)?繧・蟇ｾ雎｡/);
          const pickCountOTEC = cntMOTEC ? parseInt(toHWOTEC(cntMOTEC[1])) : 1;
          const destOTEC = toHandOTEC ? 'hand' : 'trash';
          const selectStubOTEC: import('../types/effects').StubAction = {
            type: 'STUB', id: 'INTERNAL_OTEC_SELECT',
            value: `${destOTEC}:${reqClassOTEC}:${pickCountOTEC}`,
          };
          // "謇区惆縺ｸ" 繝代ち繝ｼ繝ｳ: 繧ｨ繝翫き繝ｼ繝臥ｧｻ蜍輔′繝｡繧､繝ｳ蜉ｹ譫・ conditional.then 繧定ｿｽ蜉縺励↑縺・          // "繝医Λ繝・す繝･" 繝代ち繝ｼ繝ｳ: 繧ｨ繝翫き繝ｼ繝臥ｧｻ蜍・+ conditional.then・郁ｿｽ蜉蜉ｹ譫懶ｼ・          const payStepsOTEC: EffectAction[] = [selectStubOTEC as EffectAction];
          if (!toHandOTEC) payStepsOTEC.push(thenOTEC);
          const payActionOTEC: EffectAction = payStepsOTEC.length === 1
            ? payStepsOTEC[0]
            : { type: 'SEQUENCE', steps: payStepsOTEC } as import('../types/effects').SequenceAction;
          const payLabelOTEC = reqClassOTEC ? `繧ｨ繝奇ｼ・{reqClassOTEC}・槭ｒ驕ｸ謚槭＠縺ｦ逋ｺ蜍描 : '繧ｨ繝翫°繧蛾∈謚槭＠縺ｦ逋ｺ蜍・;
          const optsOTEC = [
            { id: 'pay', label: payLabelOTEC, action: payActionOTEC, available: true },
            { id: 'skip', label: '繧ｹ繧ｭ繝・・', action: (conditional.else ?? noopAction) as EffectAction, available: true },
          ];
          return needsInteraction(addLog(cur, `繧ｨ繝翫だ繝ｼ繝ｳ縺ｮ繧ｫ繝ｼ繝峨ｒ驕ｸ謚槭＠縺ｾ縺吶°・歔), {
            type: 'CHOOSE', options: optsOTEC, count: 1, ...(cont ? { continuation: cont } : {}),
          });
        }

        // REMOVE_VIRUS: 繧ｦ繧､繝ｫ繧ｹ繧誰蛟句叙繧企勁縺・※縺九ｉconditional.then繧貞ｮ溯｡・        if (stub.id === 'REMOVE_VIRUS') {
          const toHWRV = (s: string) => s.replace(/[・・・兢/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
          const virusArrRV = cur.otherState.field.signi_virus ?? [0, 0, 0];
          const totalVirusRV = virusArrRV.reduce((s, v) => s + v, 0);
          const srcRV = cur.sourceCardNum ? cur.cardMap.get(cur.sourceCardNum) : undefined;
          const txtRV = srcRV ? (srcRV.EffectText ?? '') + ' ' + (srcRV.BurstText ?? '') : '';
          const cntMRV = txtRV.match(/縲舌え繧｣繝ｫ繧ｹ縲・[・・・兔d]+)縺､繧・蜿悶ｊ髯､縺・);
          const removeCountRV = cntMRV ? parseInt(toHWRV(cntMRV[1])) : 1;
          const isOptionalRV = !!(txtRV.match(/蜿悶ｊ髯､縺・※繧ゅｈ縺・));
          // 繧ｦ繧､繝ｫ繧ｹ髯､蜴ｻ繧ｹ繧ｿ繝・+ conditional.then 繧帝｣邨舌＠縺溘い繧ｯ繧ｷ繝ｧ繝ｳ
          const removeStubRV: import('../types/effects').StubAction = {
            type: 'STUB', id: 'INTERNAL_REMOVE_VIRUS_N', value: removeCountRV,
          };
          const payActionRV: EffectAction = {
            type: 'SEQUENCE', steps: [removeStubRV as EffectAction, conditional.then],
          } as import('../types/effects').SequenceAction;
          if (totalVirusRV < removeCountRV) {
            // 繧ｦ繧､繝ｫ繧ｹ縺瑚ｶｳ繧翫↑縺・ｴ蜷医・繧ｹ繧ｭ繝・・
            if (cont) return executeAction(cont, cur);
            return done(addLog(cur, `繧ｦ繧､繝ｫ繧ｹ荳崎ｶｳ・亥ｿ・ｦ・{removeCountRV}縲∝ｮ溷惠${totalVirusRV}・荏)`);
          }
          if (isOptionalRV) {
            const optsRV = [
              { id: 'pay', label: `縲舌え繧｣繝ｫ繧ｹ縲・{removeCountRV}縺､繧貞叙繧企勁縺汁, action: payActionRV, available: true },
              { id: 'skip', label: '繧ｹ繧ｭ繝・・', action: (conditional.else ?? noopAction) as EffectAction, available: true },
            ];
            return needsInteraction(addLog(cur, '縲舌え繧｣繝ｫ繧ｹ縲代ｒ蜿悶ｊ髯､縺阪∪縺吶°・・), {
              type: 'CHOOSE', options: optsRV, count: 1, ...(cont ? { continuation: cont } : {}),
            });
          }
          // 蠑ｷ蛻ｶ髯､蜴ｻ: 繧ｦ繧､繝ｫ繧ｹ髯､蜴ｻ 竊・conditional.then
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

        // OPPONENT_PAY_OPTIONAL: 蟇ｾ謌ｦ逶ｸ謇九′繧ｳ繧ｹ繝医ｒ謾ｯ謇輔≧/謾ｯ謇輔ｏ縺ｪ縺・        // pay 竊・菴輔ｂ襍ｷ縺阪↑縺・ｼ亥ｯｾ謌ｦ逶ｸ謇九・繧ｨ繝頑ｶ郁ｲｻ・・ skip 竊・蜉ｹ譫懃匱蜍包ｼ・onditional.then・・        if (stub.id === 'OPPONENT_PAY_OPTIONAL') {
          const canOppAfford = costColors.length === 0 || canPayOptionalCost(costColors, cur.otherState, cur.cardMap);
          const payLabel = costColors.length > 0
            ? `謾ｯ謇輔≧・医さ繧ｹ繝・ ${costColors.map(c => `縲・{c}縲義).join('')}・荏
            : '謾ｯ謇輔≧';
          const options = [
            { id: 'pay', label: payLabel, action: noopAction as EffectAction, available: canOppAfford, ...(costColors.length ? { costColors } : {}) },
            { id: 'skip', label: '謾ｯ謇輔ｏ縺ｪ縺・, action: conditional.then, available: true },
          ];
          const pending: PendingInteractionDef = {
            type: 'CHOOSE', options, count: 1, opponentResponds: true,
            ...(cont ? { continuation: cont } : {}),
          };
          return needsInteraction(addLog(cur, '蟇ｾ謌ｦ逶ｸ謇具ｼ壹さ繧ｹ繝医ｒ謾ｯ謇輔＞縺ｾ縺吶°・・), pending);
        }

        const canAfford = costColors.length === 0 || canPayOptionalCost(costColors, cur.ownerState, cur.cardMap);
        const payLabel = costColors.length > 0
          ? `逋ｺ蜍輔☆繧具ｼ医さ繧ｹ繝・ ${costColors.map(c => `縲・{c}縲義).join('')}・荏
          : '逋ｺ蜍輔☆繧・;
        const options = [
          { id: 'pay', label: payLabel, action: conditional.then, available: canAfford, ...(costColors.length ? { costColors } : {}) },
          { id: 'skip', label: '繧ｹ繧ｭ繝・・', action: (conditional.else ?? noopAction) as EffectAction, available: true },
        ];
        const pending: PendingInteractionDef = {
          type: 'CHOOSE',
          options,
          count: 1,
          ...(cont ? { continuation: cont } : {}),
        };
        return needsInteraction(addLog(cur, '莉ｻ諢上さ繧ｹ繝茨ｼ夂匱蜍輔＠縺ｾ縺吶°・・), pending);
      }

      // Pattern 竭｣ 霑ｽ蜉繧ｳ繧ｹ繝亥ｼｷ蛹・ STUB ... BASE_STEPS ... CONDITIONAL(IS_MY_TURN|PAID_ADDITIONAL_COST)
      // (逶ｴ蠕後〒縺ｪ縺城屬繧後◆菴咲ｽｮ縺ｫ縺ゅｋ CONDITIONAL 繧貞・隱ｭ縺ｿ縺励※繧､繝ｳ繧ｿ繝ｩ繧ｯ繧ｷ繝ｧ繝ｳ繧堤函謌・
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
              : conditional4.then; // replace mode: 蠑ｷ蛹門柑譫懊・縺ｿ
            const costColors4 = stub4.costColors ?? [];
            const canAfford4 = costColors4.length === 0 || canPayOptionalCost(costColors4, cur.ownerState, cur.cardMap);
            const payLabel4 = costColors4.length > 0
              ? `霑ｽ蜉繧ｳ繧ｹ繝域髪謇輔≧・・{costColors4.map(c => `縲・{c}縲義).join('')}・荏
              : '霑ｽ蜉繧ｳ繧ｹ繝医ｒ謾ｯ謇輔≧';
            const opts4 = [
              { id: 'pay', label: payLabel4, action: payAction4, available: canAfford4, ...(costColors4.length ? { costColors: costColors4 } : {}) },
              { id: 'skip', label: '繧ｹ繧ｭ繝・・・亥渕譛ｬ蜉ｹ譫懊・縺ｿ・・, action: baseAction4, available: true },
            ];
            const pending4: PendingInteractionDef = {
              type: 'CHOOSE', options: opts4, count: 1,
              ...(cont4 ? { continuation: cont4 } : {}),
            };
            return needsInteraction(addLog(cur, '霑ｽ蜉繧ｳ繧ｹ繝茨ｼ壽髪謇輔＞縺ｾ縺吶°・・), pending4);
          }
        }
      }
      // Pattern 竭､: OPTIONAL_COST (蠕檎ｶ壹・CONDITIONAL縺ｪ縺・
      // pay 竊・谿九ｊ繧ｹ繝・ャ繝怜ｮ溯｡・ skip 竊・谿九ｊ繧ｹ繝・ャ繝励ｒ繧ｹ繧ｭ繝・・
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
            ? `謾ｯ謇輔≧・・{costColors5.map(c => `縲・{c}縲義).join('')}・荏
            : '謾ｯ謇輔≧';
          const options5 = [
            { id: 'pay', label: payLabel5, action: cont5, available: canAfford5, ...(costColors5.length ? { costColors: costColors5 } : {}) },
            { id: 'skip', label: '繧ｹ繧ｭ繝・・', action: noopAction5 as EffectAction, available: true },
          ];
          const pending5: PendingInteractionDef = { type: 'CHOOSE', options: options5, count: 1 };
          return needsInteraction(addLog(cur, '莉ｻ諢上さ繧ｹ繝茨ｼ壽髪謇輔＞縺ｾ縺吶°・・), pending5);
        }
      }
      // Pattern 竭･: TARGET_AND_DISCARD_HAND
      // 謇区惆1譫壹ｒ閾ｪ蜍墓昏縺ｦ 竊・谿九ｊ繧ｹ繝・ャ繝励∈邯夊｡鯉ｼ医ち繝ｼ繧ｲ繝・ヨ縺ｯ蠕檎ｶ壹せ繝・ャ繝励′迢ｬ遶九＠縺ｦ驕ｸ謚橸ｼ・      if (step.type === 'STUB' && (step as import('../types/effects').StubAction).id === 'TARGET_AND_DISCARD_HAND') {
        if (cur.ownerState.hand.length > 0) {
          const discardIdx = cur.ownerState.hand.length - 1;
          const discarded = cur.ownerState.hand[discardIdx];
          const newOwnerHand = [...cur.ownerState.hand.slice(0, discardIdx)];
          const newOwnerTrash = [...cur.ownerState.trash, discarded];
          const discardName = cur.cardMap.get(discarded)?.CardName ?? discarded;
          cur = {
            ...cur,
            ownerState: { ...cur.ownerState, hand: newOwnerHand, trash: newOwnerTrash },
            logs: [...cur.logs, `謇区惆繧呈昏縺ｦ蟇ｾ謌ｦ逶ｸ謇九す繧ｰ繝九ｒ蟇ｾ雎｡縺ｫ・・{discardName}繧呈昏縺ｦ・荏],
          };
        } else {
          cur = { ...cur, logs: [...cur.logs, '謇区惆縺ｪ縺暦ｼ・ARGET_AND_DISCARD_HAND・・] };
        }
        continue;
      }
      // Pattern 竭ｦ: REMOVE_VIRUS + TRANSFER_TO_HAND (螂ｽ縺阪↑謨ｰ蜿悶ｊ髯､縺・竊・N譫壽焔譛ｭ縺ｸ)
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
            i++; // TRANSFER_TO_HAND 繧ゅせ繧ｭ繝・・
            cur = addLog(cur, '繧ｦ繧､繝ｫ繧ｹ縺ｪ縺暦ｼ・EMOVE_VIRUS+TRANSFER 繧ｹ繧ｭ繝・・・・);
            continue;
          }
          const optsRV7 = Array.from({ length: totalRV7 + 1 }, (_, n) => ({
            id: `rv7_${n}`,
            label: n === 0 ? '蜿悶ｊ髯､縺九↑縺・ : `縲舌え繧｣繝ｫ繧ｹ縲・{n}縺､蜿悶ｊ髯､縺擾ｼ医す繧ｰ繝・{n}譫壽焔譛ｭ縺ｸ・荏,
            action: ({ type: 'STUB', id: 'INTERNAL_RV_BATCH_TRANSFER', value: n } as import('../types/effects').StubAction) as EffectAction,
            available: true,
          }));
          return needsInteraction(addLog(cur, '蜿悶ｊ髯､縺上舌え繧｣繝ｫ繧ｹ縲第焚繧帝∈謚・), {
            type: 'CHOOSE', options: optsRV7, count: 1, ...(contRV7 ? { continuation: contRV7 } : {}),
          });
        }
      }
    }
    const result = executeAction(step, cur);
    if (!result.done) {
      // 繧､繝ｳ繧ｿ繝ｩ繧ｯ繧ｷ繝ｧ繝ｳ蠢・ｦ・ｼ壽ｮ九ｊ縺ｮ繧ｹ繝・ャ繝励ｒcontinuation縺ｫ蜈･繧後ｋ
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
  return needsInteraction(ctx, { type: 'CHOOSE', options, count: a.choose_count });
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
  // 荳譎ら噪縺ｫ繝・ャ繧ｭ縺九ｉ繧ｫ繝ｼ繝峨ｒ蜿悶ｊ髯､縺・  const newS: PlayerState = { ...state, deck: state.deck.slice(count) };
  const newCtx = setOwnerState(a.source.owner as Owner, newS, ctx);
  return needsInteraction(newCtx, {
    type: 'LOOK_AND_REORDER',
    cards,
    canTrash: a.canTrash ?? false,
    destLocation: 'deck',
    destOwner: (a.destination.owner === 'any' ? 'self' : a.destination.owner) as 'self' | 'opponent',
    destPosition: a.destination.position,
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
    const cands = trashCandidates(state, src.filter, ctx.cardMap);
    const cards = src.count === 'ALL' ? cands : cands.slice(0, resolveNum(src.count));
    const newS = insertToDeck({ ...state, trash: state.trash.filter(n => !cards.includes(n)) }, cards);
    return done({ ...addLog(setOwnerState(src.owner, newS, ctx), `${cards.length}譫壹ｒ繝・ャ繧ｭ縺ｫ謌ｻ縺兪), lastProcessedCards: cards }`);
  }

  if (src.type === 'HAND_CARD') {
    const cands = handCandidates(state, src.filter, ctx.cardMap);
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
        `謇区惆${toMove.length}譫壹ｒ繝・ャ繧ｭ${toBottom ? '荳・ : '荳・}縺ｫ鄂ｮ縺汁`);
    }

    if (src.count === 'ALL') return done({ ...applyHandToDeck(cands, ctx), lastProcessedCards: cands });
    return selectOrInteract(cands, count, a.source.upToCount ?? false, scope, a, undefined, ctx);
  }

  if (src.type === 'SIGNI') {
    const cands = fieldCandidates(state, src.filter, ctx.cardMap, ctx.effectivePowers);
    const count = src.count === 'ALL' ? cands.length : resolveNum(src.count);
    const scope: TargetScope = src.owner === 'self' ? 'self_field' : 'opp_field';

    function applyToBottom(selected: string[], c: ExecCtx): ExecCtx {
      let cur = c;
      for (const num of selected) {
        const s = ownerState(src.owner, cur);
        const removed = removeFromField(num, s);
        const newS = insertToDeck(removed, [num]);
        cur = addLog(setOwnerState(src.owner, newS, cur),
          `${cur.cardMap.get(num)?.CardName ?? num}繧偵ョ繝・く${toBottom ? '荳・ : '荳・}縺ｸ`);
      }
      return cur;
    }

    if (src.count === 'ALL') return done({ ...applyToBottom(cands, ctx), lastProcessedCards: cands });
    return selectOrInteract(cands, count, false, scope, a, undefined, ctx);
  }

  return done(ctx);
}

function execGrantProtection(a: GrantProtectionAction, ctx: ExecCtx): ExecResult {
  // subjectFilter 縺ｮ縺ｿ縺ｮ蝣ｴ蜷医・ CONTINUOUS 逕ｨ螳｣險・・ffectEngine 蛛ｴ縺ｧ蜃ｦ逅・ｼ俄・ no-op
  if (!a.target && a.subjectFilter) {
    return done(addLog(ctx, `蜉ｹ譫懆先ｧ螳｣險・・{a.from.join('/')}菫晁ｭｷ・荏)`);
  }
  if (!a.target) return done(ctx);
  // 蜉ｹ譫懆先ｧ縺ｯ繧ｭ繝ｼ繝ｯ繝ｼ繝我ｻ倅ｸ弱→縺励※謇ｱ縺・  const tgt = a.target;
  const state = ownerState(tgt.owner, ctx);
  const cands = fieldCandidates(state, tgt.filter, ctx.cardMap, ctx.effectivePowers, ctx.allColorSigniNums, ctx.fieldSigniExtraColors);
  const keyword = `PROTECTION:${a.from.join(',')}:${a.sourceOwner}`;

  function applyProtection(selected: string[], c: ExecCtx): ExecCtx {
    const s = ownerState(tgt.owner, c);
    const grants = { ...(s.keyword_grants ?? {}) };
    for (const n of selected) grants[n] = [...(grants[n] ?? []), keyword];
    return addLog(setOwnerState(tgt.owner, { ...s, keyword_grants: grants }, c), '蜉ｹ譫懆先ｧ莉倅ｸ・);
  }

  if (tgt.count === 'ALL') return done(applyProtection(cands, ctx));
  const count = resolveNum(tgt.count);
  const scope: TargetScope = tgt.owner === 'self' ? 'self_field' : 'opp_field';
  return selectOrInteract(cands, count, false, scope, a, undefined, ctx);
}

function execAttachCharm(a: AttachCharmAction, ctx: ExecCtx): ExecResult {
  const charmOwner = a.charm.owner ?? 'self';
  const toOwner    = a.to.owner ?? 'self';
  const charmSrc   = ownerState(charmOwner, ctx);
  const toState    = ownerState(toOwner, ctx);

  // 繝√Ε繝ｼ繝繧ｫ繝ｼ繝峨・蛟呵｣懊ｒ繧ｽ繝ｼ繧ｹ・域焔譛ｭ/繧ｨ繝・繝医Λ繝・す繝･/繝・ャ繧ｭ・峨°繧画爾縺・  let charmCands: string[];
  let charmFromLocation: 'hand' | 'energy' | 'trash' | 'deck';
  if (a.charm.type === 'DECK_CARD') {
    charmCands = charmSrc.deck.slice(0, 1);
    charmFromLocation = 'deck';
  } else if (a.charm.type === 'TRASH_CARD') {
    charmCands = charmSrc.trash.filter(n => matchesFilter(ctx.cardMap.get(n), a.charm.filter));
    charmFromLocation = 'trash';
  } else {
    // 繝・ヵ繧ｩ繝ｫ繝医・謇区惆 or 繧ｨ繝奇ｼ・ilter謖・ｮ壹′縺ゅｌ縺ｰ繧ｨ繝翫°繧会ｼ・    const fromEnergy = charmSrc.energy.filter(n => matchesFilter(ctx.cardMap.get(n), a.charm.filter));
    const fromHand = charmSrc.hand.filter(n => matchesFilter(ctx.cardMap.get(n), a.charm.filter));
    if (fromEnergy.length > 0) { charmCands = fromEnergy; charmFromLocation = 'energy'; }
    else { charmCands = fromHand; charmFromLocation = 'hand'; }
  }
  if (charmCands.length === 0) return done(addLog(ctx, '繝√Ε繝ｼ繝蟇ｾ雎｡縺ｪ縺・));

  // 蟇ｾ雎｡繧ｷ繧ｰ繝九・繧ｾ繝ｼ繝ｳ繧呈爾縺・  const toCands = fieldCandidates(toState, a.to.filter, ctx.cardMap, ctx.effectivePowers);
  if (toCands.length === 0) return done(addLog(ctx, '繝√Ε繝ｼ繝莉倅ｸ主ｯｾ雎｡繧ｷ繧ｰ繝九↑縺・));

  const charmNum = charmCands[0];
  const targetNum = toCands[0];
  const zoneIdx = toState.field.signi.findIndex(s => s?.at(-1) === targetNum);
  if (zoneIdx < 0) return done(addLog(ctx, '繝√Ε繝ｼ繝莉倅ｸ・ 繧ｾ繝ｼ繝ｳ荳肴・'));

  // 繝√Ε繝ｼ繝繧ｫ繝ｼ繝峨ｒ繧ｽ繝ｼ繧ｹ縺九ｉ髯､蜴ｻ
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

  // 蟇ｾ雎｡繧ｷ繧ｰ繝九・繧ｾ繝ｼ繝ｳ縺ｫ繝√Ε繝ｼ繝繧偵そ繝・ヨ
  let newToState = ownerState(toOwner, ctx2);
  const charms = [...(newToState.field.signi_charms ?? [null, null, null])];
  charms[zoneIdx] = charmNum;
  newToState = { ...newToState, field: { ...newToState.field, signi_charms: charms } };
  ctx2 = setOwnerState(toOwner, newToState, ctx2);

  const cardName = ctx.cardMap.get(charmNum)?.CardName ?? charmNum;
  const targetName = ctx.cardMap.get(targetNum)?.CardName ?? targetNum;
  return done(addLog(ctx2, `${cardName}繧・{targetName}縺ｫ繝√Ε繝ｼ繝縺ｨ縺励※莉倅ｸ餐)`);
}

/** LEVEL_REFERENCE_OVERRIDE: 繧ｫ繝ｼ繝峨ユ繧ｭ繧ｹ繝医°繧芽ｨｱ螳ｹ繝ｬ繝吶Ν遽・峇繧定ｧ｣譫舌＠縺ｦ霑斐☆縲・ * 縲後Ξ繝吶Ν繧貞盾辣ｧ縺吶ｋ蝣ｴ蜷医√Ξ繝吶Ν・斐→縺励※謇ｱ縺｣縺ｦ繧ゅｈ縺・坂・ { min:4, max:4 }
 * 縲後Ξ繝吶Ν繧貞盾辣ｧ縺吶ｋ蝣ｴ蜷医・ｼ托ｽ橸ｼ斐＞縺壹ｌ縺九・繝ｬ繝吶Ν・代▽縺ｨ縺励※謇ｱ縺｣縺ｦ繧ゅｈ縺・坂・ { min:1, max:4 }
 */
function getLevelReferenceOverride(card: import('../types').CardData | undefined): { min: number; max: number } | null {
  const txt = card?.EffectText ?? '';
  if (!txt.includes('繝ｬ繝吶Ν繧貞盾辣ｧ縺吶ｋ蝣ｴ蜷・)) return null;
  const toHW = (s: string) => s.replace(/[・・・兢/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
  // 縲後Ξ繝吶Ν・ｮ縺ｨ縺励※謇ｱ縺｣縺ｦ繧ゅｈ縺・・  const single = txt.match(/繝ｬ繝吶Ν繧貞盾辣ｧ縺吶ｋ蝣ｴ蜷医√Ξ繝吶Ν([・・・兔d]+)縺ｨ縺励※謇ｱ縺｣縺ｦ繧ゅｈ縺・);
  if (single) {
    const lv = parseInt(toHW(single[1]));
    return { min: lv, max: lv };
  }
  // 縲鯉ｼｮ・橸ｼｭ縺・★繧後°縺ｮ繝ｬ繝吶Ν・代▽縺ｨ縺励※謇ｱ縺｣縺ｦ繧ゅｈ縺・・  const range = txt.match(/繝ｬ繝吶Ν繧貞盾辣ｧ縺吶ｋ蝣ｴ蜷医・[・・・兔d]+)・・[・・・兔d]+)縺・★繧後°縺ｮ繝ｬ繝吶Ν/);
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
  // LEVEL_REFERENCE_OVERRIDE: 繝ｬ繝吶Ν繝輔ぅ繝ｫ繧ｿ繝ｼ縺後≠繧句ｴ蜷医√ョ繝・く/謇区惆/繝医Λ繝・す繝･荳ｭ縺ｮ
  // 縲後Ξ繝吶Ν蜿ら・荳頑嶌縺阪阪き繝ｼ繝峨ｂ蟇ｾ雎｡縺ｫ蜷ｫ繧√ｋ
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
    // 繝斐ャ繧ｯ蟇ｾ雎｡縺ｪ縺暦ｼ壽ｮ九ｊ繧呈欠螳壼ｴ謇縺ｸ
    if (a.remainder) {
      const pos = a.remainder.position;
      const newS: PlayerState = {
        ...state,
        deck: pos === 'bottom'
          ? [...state.deck.slice(count), ...visible]
          : state.deck,
      };
      return done(addLog(setOwnerState(a.owner, newS, ctx), `繝・ャ繧ｭ${count}譫壼・髢具ｼ壼ｯｾ雎｡縺ｪ縺輿)`);
    }
    return done(ctx);
  }

  // 荳譎ら噪縺ｫ繝・ャ繧ｭ荳企Κ繧帝勁蜴ｻ
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

function execPlayFree(a: PlayFreeAction, ctx: ExecCtx): ExecResult {
  let cands: string[];

  if (a.source === 'hand') {
    cands = handCandidates(ctx.ownerState, a.filter, ctx.cardMap);
  } else if (a.source === 'opp_hand') {
    cands = handCandidates(ctx.otherState, a.filter, ctx.cardMap);
  } else if (a.source === 'opp_trash') {
    cands = trashCandidates(ctx.otherState, a.filter, ctx.cardMap);
  } else {
    // lrig_deck: 繝ｫ繝ｪ繧ｰ繝・ャ繧ｭ縺ｮ蜈磯ｭ縺九ｉ蟇ｾ雎｡繧呈爾縺・    cands = (ctx.ownerState.lrig_deck ?? []).filter(n => matchesFilter(ctx.cardMap.get(n), a.filter));
  }

  if (cands.length === 0) return done(addLog(ctx, 'PlayFree: 蟇ｾ雎｡縺ｪ縺・));

  // 繧､繝ｳ繧ｿ繝ｩ繧ｯ繧ｷ繝ｧ繝ｳ縺ｧ繧ｫ繝ｼ繝峨ｒ驕ｸ縺ｰ縺帙ｋ・磯∈謚槫ｾ後・螳滄圀縺ｮ菴ｿ逕ｨ縺ｯBattleScreen縺梧球蠖難ｼ・  return needsInteraction(ctx, {
    type: 'SEARCH',
    visibleCards: cands,
    maxPick: 1,
    thenAction: { type: 'ADD_TO_HAND', owner: 'self' }, // 繝励Ξ繝ｼ繧ｹ繝帙Ν繝繝ｼ
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
  return done(addLog(setOwnerState(tgtOwner, newS, ctx), `${a.targetCardType}繧ｳ繧ｹ繝・${a.amount.map(e => e.count + e.color).join('')}`));
}

function execPowerModifyPerField(a: PowerModifyPerFieldAction, ctx: ExecCtx): ExecResult {
  // 繧ｿ繝ｼ繧ｲ繝・ヨ縺ｮcardNum繧貞叙蠕暦ｼ・xcludeSelf逕ｨ・・  const tgtOwnerForExclude = a.target.owner === 'any' ? 'self' : a.target.owner as Owner;
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
      `繝代Ρ繝ｼ${delta > 0 ? '+' : ''}${delta}・医ヵ繧｣繝ｼ繝ｫ繝嘉・{fieldCount}菴難ｼ荏`);
  }

  if (a.target.count === 'ALL') return done(applyMod(cands, ctx));
  const cnt = resolveNum(a.target.count);
  const scope: TargetScope = tgtOwner === 'self' ? 'self_field' : 'opp_field';
  return selectOrInteract(cands, cnt, a.target.upToCount ?? false, scope, a, undefined, ctx);
}

function execPlaceUnderSigni(a: import('../types/effects').PlaceUnderSigniAction, ctx: ExecCtx): ExecResult {
  const sourceCardNum = ctx.sourceCardNum;
  if (!sourceCardNum) return done(ctx);

  // 繧ｽ繝ｼ繧ｹ繧ｷ繧ｰ繝九′縺ゅｋ繧ｾ繝ｼ繝ｳ縺ｮ繧､繝ｳ繝・ャ繧ｯ繧ｹ繧呈爾縺・  const zoneIdx = ctx.ownerState.field.signi.findIndex(stack => stack?.includes(sourceCardNum));
  if (zoneIdx === -1) return done(ctx);

  if (a.source === 'deck_top') {
    const count = Math.min(a.count, ctx.ownerState.deck.length);
    if (count === 0) return done(ctx);
    const cards = ctx.ownerState.deck.slice(0, count);  // 繝・ャ繧ｭ縺ｮ荳逡ｪ荳翫°繧丑譫・    const newDeck = ctx.ownerState.deck.slice(count);
    const newSigni = ctx.ownerState.field.signi.map((stack, i) => {
      if (i !== zoneIdx) return stack;
      return [...cards, ...(stack ?? [])];
    }) as (string[] | null)[];
    const newOwner = { ...ctx.ownerState, deck: newDeck, field: { ...ctx.ownerState.field, signi: newSigni } };
    return done(addLog({ ...ctx, ownerState: newOwner }, `繝・ャ繧ｭ繝医ャ繝励°繧・{count}譫壹ｒ繧ｷ繧ｰ繝九・荳九↓鄂ｮ縺・◆`));
  }

  // trash/hand/energy: SELECT_TARGET 繧､繝ｳ繧ｿ繝ｩ繧ｯ繧ｷ繝ｧ繝ｳ
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
    return done(addLog(setOwnerState(tgtOwner, newS, ctx), `${cands.length}菴薙・繧ｷ繧ｰ繝九・繧｢繧ｿ繝・け繧堤┌蜉ｹ蛹冒)`);
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
  return done(addLog({ ...ctx, ownerState: newOwner }, `${ctx.sourceCardNum} 縺瑚ｦ夐・迥ｶ諷九↓縺ｪ縺｣縺歔)`);
}

function execDrawPerFieldCount(a: import('../types/effects').DrawPerFieldCountAction, ctx: ExecCtx): ExecResult {
  const countState = ownerState(a.countOwner, ctx);
  const fieldCount = countState.field.signi.filter(stack => {
    if (!stack || stack.length === 0) return false;
    const card = ctx.cardMap.get(stack[stack.length - 1]);
    return matchesFilter(card, a.countFilter);
  }).length;
  if (fieldCount === 0) return done(ctx);
  const drawCount = a.drawPerUnit * fieldCount;
  return executeAction({ type: 'DRAW', owner: 'self', count: drawCount }, ctx);
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
      `繝代Ρ繝ｼ${delta > 0 ? '+' : ''}${delta}・医Ν繝ｪ繧ｰlv${lv}ﾃ・{a.deltaPerLevel}・荏`);
  }

  if (a.target.count === 'ALL') return done(applyMod(cands, ctx));
  const count = resolveNum(a.target.count);
  const scope: TargetScope = tgtOwner === 'self' ? 'self_field' : 'opp_field';
  return selectOrInteract(cands, count, a.target.upToCount ?? false, scope, a, undefined, ctx);
}

function execCharmProtection(a: CharmProtectionAction, ctx: ExecCtx): ExecResult {
  // 繝√Ε繝ｼ繝菫晁ｭｷ縺ｯ BattleScreen 縺ｮ繝舌ル繝・す繝･蜃ｦ逅・・縺ｧ蛻､螳壹☆繧九◆繧√・  // 縺薙％縺ｧ縺ｯ繝励Ξ繧､繝､繝ｼ迥ｶ諷九↓繧ｭ繝ｼ繝ｯ繝ｼ繝峨→縺励※險倬鹸縺吶ｋ
  const keyword = `CHARM_PROTECTION:${JSON.stringify(a.signiFilter)}`;
  const grants = { ...(ctx.ownerState.keyword_grants ?? {}) };
  // 繝輔ぅ繝ｼ繝ｫ繝峨・蟇ｾ雎｡繧ｷ繧ｰ繝句・菴薙↓莉倅ｸ・  const cands = fieldCandidates(ctx.ownerState, a.signiFilter, ctx.cardMap, ctx.effectivePowers);
  for (const n of cands) grants[n] = [...(grants[n] ?? []), keyword];
  const newOwner: PlayerState = { ...ctx.ownerState, keyword_grants: grants };
  return done(addLog({ ...ctx, ownerState: newOwner }, '繝√Ε繝ｼ繝菫晁ｭｷ莉倅ｸ・));
}

function execMutualDiscardAndDraw(a: MutualDiscardAndDrawAction, ctx: ExecCtx): ExecResult {
  // 荳｡閠・・謇区惆譫壽焚繧定ｨ倬鹸縺励※縺九ｉ蜈ｨ謐ｨ縺ｦ
  const selfCount  = ctx.ownerState.hand.length;
  const otherCount = ctx.otherState.hand.length;
  const maxCount   = Math.max(selfCount, otherCount);

  let cur: ExecCtx = {
    ...ctx,
    ownerState: { ...ctx.ownerState, hand: [], trash: [...ctx.ownerState.trash, ...ctx.ownerState.hand] },
    otherState: { ...ctx.otherState, hand: [], trash: [...ctx.otherState.trash, ...ctx.otherState.hand] },
  };
  cur = addLog(cur, `荳｡閠・焔譛ｭ蜈ｨ謐ｨ縺ｦ・・{selfCount}譫・${otherCount}譫夲ｼ荏`);

  if (!a.drawMax || maxCount === 0) return done(cur);

  // 蜿梧婿縺・maxCount 譫壼ｼ輔￥
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
  return done(addLog(cur, `蜷・{maxCount}譫壹ラ繝ｭ繝ｼ`));
}

function execRemoveAbilities(a: RemoveAbilitiesAction, ctx: ExecCtx): ExecResult {
  const tgtOwner = a.target.owner === 'any' ? 'opponent' : a.target.owner as Owner;
  const state = ownerState(tgtOwner, ctx);
  const cands = fieldCandidates(state, a.target.filter, ctx.cardMap, ctx.effectivePowers, ctx.allColorSigniNums, ctx.fieldSigniExtraColors);
  const removed = [...(state.abilities_removed ?? []), ...cands];
  const newS: PlayerState = { ...state, abilities_removed: removed };
  return done(addLog(setOwnerState(tgtOwner, newS, ctx), `繧ｷ繧ｰ繝・{cands.length}菴薙・閭ｽ蜉帙ｒ豸亥悉`));
}

function execGainCoin(a: GainCoinAction, ctx: ExecCtx): ExecResult {
  const s = ownerState(a.owner, ctx);
  const gained = Math.min(a.count, 5 - s.coins);
  const newS: PlayerState = { ...s, coins: Math.min(5, s.coins + a.count) };
  return done(addLog(setOwnerState(a.owner, newS, ctx), `繧ｳ繧､繝ｳ${gained}譫夂佐蠕暦ｼ郁ｨ・{newS.coins}譫夲ｼ荏)`);
}

function execGainBond(a: import('../types/effects').GainBondAction, ctx: ExecCtx): ExecResult {
  if (a.source === 'last_found') {
    const lastCard = ctx.lastProcessedCards?.[ctx.lastProcessedCards.length - 1];
    const cardName = lastCard ? ctx.cardMap.get(lastCard)?.CardName : undefined;
    if (!cardName) return done(addLog(ctx, '邨・佐蠕・ 蟇ｾ雎｡繧ｫ繝ｼ繝峨′隕九▽縺九ｊ縺ｾ縺帙ｓ'));
    const current = ctx.ownerState.bonds ?? [];
    if (current.includes(cardName)) return done(addLog(ctx, `${cardName}縺ｨ縺ｮ邨・・譌｢縺ｫ迯ｲ蠕玲ｸ医∩`));
    const newOwner: PlayerState = { ...ctx.ownerState, bonds: [...current, cardName] };
    return done(addLog({ ...ctx, ownerState: newOwner }, `${cardName}縺ｨ縺ｮ邨・ｒ迯ｲ蠕輿)`);
  }
  // 'declared': 繝・ャ繧ｭ縺九ｉ繧ｫ繝ｼ繝峨ｒ驕ｸ謚槭＆縺帙ｋ
  const deckCards = [...ctx.ownerState.deck];
  if (deckCards.length === 0) return done(addLog(ctx, '邨・佐蠕・ 繝・ャ繧ｭ縺檎ｩｺ'));
  return needsInteraction(ctx, {
    type: 'DECLARE_BOND',
    deckCards,
    continuation: a.source === 'declared' ? undefined : undefined,
  });
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
      // 繝輔ぅ繝ｫ繧ｿ繝ｼ縺後≠繧後・繝√ぉ繝・け
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
  return done({ ...addLog(ctx2, `繝√Ε繝ｼ繝${removed}譫壹ｒ繝医Λ繝・す繝･縺ｫ鄂ｮ縺・◆`), lastProcessedCards: removedCards });
}

function execForceSigniAttack(a: ForceSigniAttackAction, ctx: ExecCtx): ExecResult {
  const s = ownerState(a.targetOwner, ctx);
  const newS: PlayerState = { ...s, must_attack_signi: true };
  const ctx2 = setOwnerState(a.targetOwner, newS, ctx);
  return done(addLog(ctx2, `${a.targetOwner === 'opponent' ? '蟇ｾ謌ｦ逶ｸ謇・ : '閾ｪ蛻・}縺ｮ繧ｷ繧ｰ繝九・蜿ｯ閭ｽ縺ｪ繧峨・繧｢繧ｿ繝・け縺励↑縺代ｌ縺ｰ縺ｪ繧峨↑縺Я)`);
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
      `繝代Ρ繝ｼ${delta > 0 ? '+' : ''}${delta}・医ヨ繝ｩ繝・す繝･${count}譫堙・{a.deltaPerUnit}/${a.unitSize}・荏`);
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
      `繝代Ρ繝ｼ${delta > 0 ? '+' : ''}${delta}・医Λ繧､繝・{count}譫堙・{a.deltaPerLife}・荏`);
  }

  if (a.target.count === 'ALL') return done(applyMod(cands, ctx));
  const cnt = resolveNum(a.target.count);
  const scope: TargetScope = tgtO === 'self' ? 'self_field' : 'opp_field';
  return selectOrInteract(cands, cnt, a.target.upToCount ?? false, scope, a, undefined, ctx);
}

function execDiscardBoth(a: DiscardBothAction, ctx: ExecCtx): ExecResult {
  const selfDiscard = Math.min(a.count, ctx.ownerState.hand.length);
  const otherDiscard = Math.min(a.count, ctx.otherState.hand.length);
  const newCtx: ExecCtx = {
    ...ctx,
    ownerState: { ...ctx.ownerState, hand: ctx.ownerState.hand.slice(selfDiscard), trash: [...ctx.ownerState.trash, ...ctx.ownerState.hand.slice(0, selfDiscard)] },
    otherState: { ...ctx.otherState, hand: ctx.otherState.hand.slice(otherDiscard), trash: [...ctx.otherState.trash, ...ctx.otherState.hand.slice(0, otherDiscard)] },
  };
  return done(addLog(newCtx, `蜷・・繝ｬ繧､繝､繝ｼ謇区惆${a.count}譫壽昏縺ｦ`));
}

function execPlaceVirus(a: PlaceVirusAction, ctx: ExecCtx): ExecResult {
  const tgtState = a.targetOwner === 'opponent' ? ctx.otherState : ctx.ownerState;
  const ZONE_COUNT = 3;
  const virus = [...(tgtState.field.signi_virus ?? [0, 0, 0])];
  // 縺ｩ縺ｮ繧ｾ繝ｼ繝ｳ縺ｫ鄂ｮ縺代ｋ縺具ｼ医∪縺繧ｦ繧｣繝ｫ繧ｹ縺檎ｽｮ縺九ｌ縺ｦ縺・↑縺・だ繝ｼ繝ｳ・・  const available = [0, 1, 2].filter(i => virus[i] === 0);

  let placed = 0;
  if (a.zoneCount === 'ALL') {
    for (let i = 0; i < ZONE_COUNT; i++) {
      if (virus[i] === 0) { virus[i] = a.virusCount; placed++; }
    }
  } else {
    const maxZones = Math.min(a.zoneCount as number, available.length);
    for (let i = 0; i < maxZones; i++) {
      virus[available[i]] = a.virusCount; placed++;
    }
  }

  const newField = { ...tgtState.field, signi_virus: virus };
  const newState: PlayerState = { ...tgtState, field: newField };
  const ctx2 = a.targetOwner === 'opponent'
    ? { ...ctx, otherState: newState }
    : { ...ctx, ownerState: newState };
  return done(addLog(ctx2, `縲舌え繧｣繝ｫ繧ｹ縲代ｒ${placed}繧ｾ繝ｼ繝ｳ縺ｫ驟咲ｽｮ`));
}

function execAttachAcce(a: AttachAcceAction, ctx: ExecCtx): ExecResult {
  const srcState = a.sourceOwner === 'opponent' ? ctx.otherState : ctx.ownerState;
  const tgtState = a.targetSigniOwner === 'opponent' ? ctx.otherState : ctx.ownerState;
  const acce = tgtState.field.signi_acce ?? [null, null, null];

  // 繝・さ繝ｬ・・romHand・・ 縺ｾ縺壽焔譛ｭ縺九ｉ繧｢繧ｯ繧ｻ繧ｫ繝ｼ繝蛾∈謚・竊・谺｡縺ｫ繝帙せ繝医す繧ｰ繝矩∈謚・  if (a.fromHand) {
    const handCands = srcState.hand.filter(cn => {
      const card = ctx.cardMap.get(cn);
      return card && card.Type === '繧ｷ繧ｰ繝・ && (!a.signiFilter || matchesFilter(card, a.signiFilter));
    });
    if (handCands.length === 0) return done(addLog(ctx, '繧｢繧ｯ繧ｻ蜿ｯ閭ｽ縺ｪ謇区惆繧ｷ繧ｰ繝九↑縺・));
    // 繧ｹ繝・ャ繝・: 謇区惆縺九ｉ繧｢繧ｯ繧ｻ繧ｫ繝ｼ繝峨ｒ驕ｸ謚・竊・繧ｹ繝・ャ繝・: 繝帙せ繝医す繧ｰ繝矩∈謚槭∈
    const selectHostAction: AttachAcceAction = { ...a, fromHand: false };
    return needsInteraction(addLog(ctx, '謇区惆縺九ｉ繧｢繧ｯ繧ｻ縺吶ｋ繧ｷ繧ｰ繝九ｒ驕ｸ謚・), {
      type: 'SELECT_TARGET',
      candidates: handCands,
      count: 1,
      optional: false,
      targetScope: 'self_hand',
      thenAction: selectHostAction as import('../types/effects').EffectAction,
    });
  }

  // 繧ｨ繝翫だ繝ｼ繝ｳ/謇区惆縺九ｉ縺ｮ繧｢繧ｯ繧ｻ: 繝帙せ繝医す繧ｰ繝矩∈謚・  // targetFilter 縺ｧ繝帙せ繝亥・繝輔ぅ繝ｫ繧ｿ繝ｼ縲《igniFilter 縺ｧ繧｢繧ｯ繧ｻ繧ｫ繝ｼ繝牙・繝輔ぅ繝ｫ繧ｿ繝ｼ
  const hostCands = (tgtState.field.signi ?? []).flatMap((stack, i) => {
    if (!stack || stack.length === 0) return [];
    if (acce[i] !== null) return []; // 縺吶〒縺ｫ繧｢繧ｯ繧ｻ縺ゅｊ・・譫壼宛髯撰ｼ・    const top = stack[stack.length - 1];
    if (a.targetFilter && !matchesFilter(ctx.cardMap.get(top), a.targetFilter)) return [];
    return [top];
  });
  if (hostCands.length === 0) return done(addLog(ctx, '繧｢繧ｯ繧ｻ蟇ｾ雎｡縺ｪ縺・));

  const scope: TargetScope = a.targetSigniOwner === 'opponent' ? 'opp_field' : 'self_field';
  return needsInteraction(addLog(ctx, '縺ｩ縺ｮ繧ｷ繧ｰ繝九↓繧｢繧ｯ繧ｻ縺励∪縺吶°・・), {
    type: 'SELECT_TARGET',
    candidates: hostCands,
    count: 1,
    optional: false,
    targetScope: scope,
    thenAction: a as import('../types/effects').EffectAction,
  });
}

function execBloodCrystalArmor(a: BloodCrystalArmorAction, ctx: ExecCtx): ExecResult {
  // 閾ｪ蛻・・繝輔ぅ繝ｼ繝ｫ繝峨↓縺・ｋ蟇ｾ雎｡繧ｷ繧ｰ繝九・縺・■縲∝酔蜷阪き繝ｼ繝峨′謖・ｮ夐伜沺縺ｫ縺ゅｋ繧ゅ・繧帝∈謚槫呵｣懊→縺吶ｋ
  const candidates = (ctx.ownerState.field.signi ?? []).flatMap((stack, zoneIdx) => {
    if (!stack || stack.length === 0) return [];
    const top = stack[stack.length - 1];
    const card = ctx.cardMap.get(top);
    if (a.targetFilter && !matchesFilter(card, a.targetFilter)) return [];
    const sameName = card?.CardName;
    if (!sameName) return [];
    // 譌｢縺ｫ陦譎ｶ豁ｦ陬・憾諷九〒繧る∈謚槫庄閭ｽ・医＆繧峨↓驥阪・繧九％縺ｨ縺後〒縺阪ｋ・・    const inHand  = a.source.includes('hand')  && ctx.ownerState.hand.some(n => ctx.cardMap.get(n)?.CardName === sameName);
    const inTrash = a.source.includes('trash') && ctx.ownerState.trash.some(n => ctx.cardMap.get(n)?.CardName === sameName);
    const inDeck  = a.source.includes('deck')  && ctx.ownerState.deck.some(n => ctx.cardMap.get(n)?.CardName === sameName);
    // 閾ｪ霄ｫ縺ｨ蜷悟錐縺ｮ繧ｫ繝ｼ繝峨ｒ繧ｫ繧ｦ繝ｳ繝医☆繧矩圀縲√ヵ繧｣繝ｼ繝ｫ繝峨↓縺ゅｋ閾ｪ霄ｫ縺ｯ髯､縺・    const fieldSelf = stack[stack.length - 1];
    const inHandExcSelf  = a.source.includes('hand')  && ctx.ownerState.hand.some(n => { const cn = ctx.cardMap.get(n)?.CardName; return cn === sameName && n !== fieldSelf; });
    const inTrashExcSelf = a.source.includes('trash') && ctx.ownerState.trash.some(n => ctx.cardMap.get(n)?.CardName === sameName);
    const inDeckExcSelf  = a.source.includes('deck')  && ctx.ownerState.deck.some(n => ctx.cardMap.get(n)?.CardName === sameName);
    void zoneIdx; void inHand; void inTrash; void inDeck;
    if (!inHandExcSelf && !inTrashExcSelf && !inDeckExcSelf) return [];
    return [top];
  });
  if (candidates.length === 0) return done(addLog(ctx, '陦譎ｶ豁ｦ陬・ｯｾ雎｡縺ｪ縺・));

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
      thenAction: a, // applyDirectAction 縺ｮ BLOOD_CRYSTAL_ARMOR 繧ｱ繝ｼ繧ｹ縺ｧ蜃ｦ逅・    } as PendingInteractionDef,
  };
}

function execAddCraftToLrigDeck(a: import('../types/effects').AddCraftToLrigDeckAction, ctx: ExecCtx): ExecResult {
  // CardData_TK 縺九ｉ cardName 縺御ｸ閾ｴ縺吶ｋ繧ｯ繝ｩ繝輔ヨ繧ｫ繝ｼ繝峨ｒ讀懃ｴ｢
  const craftCard = [...ctx.cardMap.values()].find(
    c => c.CardName === a.cardName && c.Type?.includes('繧ｯ繝ｩ繝輔ヨ'),
  );
  if (!craftCard) {
    return done(addLog(ctx, `繧ｯ繝ｩ繝輔ヨ繧ｫ繝ｼ繝峨・{a.cardName}縲阪′隕九▽縺九ｊ縺ｾ縺帙ｓ`));
  }
  const s = ownerState(a.owner, ctx);
  const additions = Array(a.count).fill(craftCard.CardNum);
  const newState: PlayerState = {
    ...s,
    lrig_deck: [...additions, ...s.lrig_deck],
  };
  return done(addLog(
    setOwnerState(a.owner, newState, ctx),
    `繧ｯ繝ｩ繝輔ヨ縲・{a.cardName}縲催・{a.count}譫壹ｒ繝ｫ繝ｪ繧ｰ繝・ャ繧ｭ縺ｫ霑ｽ蜉`,
  ));
}

// ===== 繝｡繧､繝ｳ螳溯｡碁未謨ｰ =====

export function executeAction(action: EffectAction, ctx: ExecCtx): ExecResult {
  switch (action.type) {
    case 'DRAW':                    return execDraw(action as DrawAction, ctx);
    case 'BANISH':                  return execBanish(action as BanishAction, ctx);
    case 'BOUNCE':                  return execBounce(action as BounceAction, ctx);
    case 'POWER_MODIFY':            return execPowerModify(action as PowerModifyAction, ctx);
    case 'POWER_SET':               return execPowerSet(action as PowerSetAction, ctx);
    case 'TRASH':                   return execTrash(action as TrashAction, ctx);
    case 'ENERGY_CHARGE':           return execEnergyCharge(action as EnergyChargeAction, ctx);
    case 'ENERGY_CHARGE_FROM_DECK': return execEnergyChargeFromDeck(action as EnergyChargeFromDeckAction, ctx);
    case 'LIFE_CRASH':              return execLifeCrash(action as LifeCrashAction, ctx);
    case 'SHUFFLE_DECK':            return execShuffleDeck(action as ShuffleDeckAction, ctx);
    case 'REVEAL':                  return done(addLog(ctx, '繧ｫ繝ｼ繝峨ｒ蜈ｬ髢・));
    case 'ADD_TO_HAND':             return done(addLog(ctx, '繧ｫ繝ｼ繝峨ｒ謇区惆縺ｫ蜉縺医ｋ')); // SEARCH蜀・〒蜃ｦ逅・    case 'TRANSFER_TO_HAND':        return execTransferToHand(action as TransferToHandAction, ctx);
    case 'ADD_TO_FIELD':            return execAddToField(action as AddToFieldAction, ctx);
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
    case 'RECOLLECT_GATE':         return done(addLog(ctx, '繝ｪ繧ｳ繝ｬ繧ｯ繝医ご繝ｼ繝茨ｼ医す繝ｼ繧ｱ繝ｳ繧ｹ螟悶〒縺ｯ蟶ｸ縺ｫ騾夐℃・・));
    case 'CHOOSE':                  return execChoose(action as ChooseAction, ctx);
    case 'CONDITIONAL':             return execConditional(action as ConditionalAction, ctx);
    case 'LOOK_AND_REORDER':        return execLookAndReorder(action as LookAndReorderAction, ctx);
    case 'TRANSFER_TO_DECK':        return execTransferToDeck(action as TransferToDeckAction, ctx);
    case 'COUNTER_SPELL':           return done(addLog(ctx, '繧ｹ繝壹Ν/繧｢繝ｼ繝・遠縺｡豸医＠'));
    case 'COST_REDUCTION':          return done(addLog(ctx, '繧ｳ繧ｹ繝域ｸ帛ｰ大柑譫懶ｼ域ｬ｡縺ｮ繧ｫ繝ｼ繝我ｽｿ逕ｨ譎る←逕ｨ・・));
    case 'GRANT_PROTECTION':        return execGrantProtection(action as GrantProtectionAction, ctx);
    case 'ATTACH_CHARM':            return execAttachCharm(action as AttachCharmAction, ctx);
    case 'REVEAL_AND_PICK':         return execRevealAndPick(action as RevealAndPickAction, ctx);
    case 'PLAY_FREE':               return execPlayFree(action as PlayFreeAction, ctx);
    case 'COST_INCREASE':           return execCostIncrease(action as CostIncreaseAction, ctx);
    case 'POWER_MODIFY_PER_FIELD':     return execPowerModifyPerField(action as PowerModifyPerFieldAction, ctx);
    case 'DRAW_PER_FIELD_COUNT':       return execDrawPerFieldCount(action as import('../types/effects').DrawPerFieldCountAction, ctx);
    case 'AWAKEN_SIGNI':               return execAwakenSigni(ctx);
    case 'NEGATE_ATTACK':              return execNegateAttack(action as import('../types/effects').NegateAttackAction, ctx);
    case 'PLACE_UNDER_SIGNI':          return execPlaceUnderSigni(action as import('../types/effects').PlaceUnderSigniAction, ctx);
    case 'PLACE_UNDER_SOURCE_SIGNI':   return done(addLog(ctx, '繧ｷ繧ｰ繝九・荳九↓鄂ｮ縺擾ｼ育峩謗･蜻ｼ蜃ｺ・・)); // applyDirectAction蜀・〒蜃ｦ逅・    case 'TAKE_FROM_UNDER_SIGNI':      return execTakeFromUnderSigni(action as import('../types/effects').TakeFromUnderSigniAction, ctx);
    case 'POWER_MODIFY_PER_LRIG_LEVEL': return execPowerModifyPerLrigLevel(action as PowerModifyPerLrigLevelAction, ctx);
    case 'FORCE_END_TURN':             return done(addLog({ ...ctx, forceEndTurn: true }, '繧ｿ繝ｼ繝ｳ繧貞ｼｷ蛻ｶ邨ゆｺ・));
    case 'CHARM_PROTECTION':           return execCharmProtection(action as CharmProtectionAction, ctx);
    case 'MUTUAL_DISCARD_AND_DRAW': return execMutualDiscardAndDraw(action as MutualDiscardAndDrawAction, ctx);
    case 'REMOVE_ABILITIES':        return execRemoveAbilities(action as RemoveAbilitiesAction, ctx);
    case 'GAIN_COIN':               return execGainCoin(action as GainCoinAction, ctx);
    case 'DISCARD_BOTH':            return execDiscardBoth(action as DiscardBothAction, ctx);
    case 'REMOVE_CHARM':            return execRemoveCharm(action as RemoveCharmAction, ctx);
    case 'FORCE_SIGNI_ATTACK':      return execForceSigniAttack(action as ForceSigniAttackAction, ctx);
    case 'POWER_MODIFY_PER_TRASH_COUNT': return execPowerModifyPerTrashCount(action as PowerModifyPerTrashCountAction, ctx);
    case 'POWER_MODIFY_PER_LIFE_COUNT':  return execPowerModifyPerLifeCount(action as PowerModifyPerLifeCountAction, ctx);
    case 'GRANT_LRIG_ABILITY': {
      const ga = action as GrantLrigAbilityAction;
      if (ga.abilities && ga.abilities.length > 0) {
        const existing = ctx.ownerState.lrig_granted_auto_effects ?? [];
        const newOwner: PlayerState = {
          ...ctx.ownerState,
          lrig_granted_auto_effects: [...existing, ...ga.abilities],
        };
        return done(addLog({ ...ctx, ownerState: newOwner }, `繝ｫ繝ｪ繧ｰ莉倅ｸ手・蜉・ ${ga.rawText}`));
      }
      return done(ctx);
    }
    case 'PLACE_VIRUS':                  return execPlaceVirus(action as PlaceVirusAction, ctx);
    case 'ATTACH_ACCE':                  return execAttachAcce(action as AttachAcceAction, ctx);
    case 'BLOOD_CRYSTAL_ARMOR':          return execBloodCrystalArmor(action as BloodCrystalArmorAction, ctx);
    case 'POWER_MODIFY_PER_VIRUS_COUNT': return done(addLog(ctx, '繧ｦ繧｣繝ｫ繧ｹ謨ｰ豈比ｾ九ヱ繝ｯ繝ｼ・・ffectEngine蜃ｦ逅・ｼ・));
    case 'LRIG_LIMIT_MODIFY':            return done(addLog(ctx, `繝ｪ繝溘ャ繝・{(action as import('../types/effects').LrigLimitModifyAction).delta > 0 ? '+' : ''}${(action as import('../types/effects').LrigLimitModifyAction).delta}・・I蜃ｦ逅・ｼ荏)`);
    case 'ADD_CRAFT_TO_LRIG_DECK':       return execAddCraftToLrigDeck(action as import('../types/effects').AddCraftToLrigDeckAction, ctx);
    // 莉･荳九・ CONTINUOUS 蜉ｹ譫懷ｰら畑・・ffectEngine 蛛ｴ縺ｧ蜃ｦ逅・ｼ・    case 'BANISH_REDIRECT': {
      const newOwner: PlayerState = { ...ctx.ownerState, banish_redirect: true };
      return done(addLog({ ...ctx, ownerState: newOwner }, '蟇ｾ謌ｦ逶ｸ謇九・繧ｷ繧ｰ繝九・繝舌ル繝・す繝･蜈医ｒ繝医Λ繝・す繝･縺ｸ螟画峩'));
    }
    case 'REARRANGE_SIGNI':                return done(addLog(ctx, '繧ｷ繧ｰ繝倶ｸｦ縺ｳ譖ｿ縺茨ｼ・attleScreen蛛ｴ縺ｧ蜃ｦ逅・ｼ・));
    case 'GROW_FREE':                      return done(addLog(ctx, '繝輔Μ繝ｼ繧ｰ繝ｭ繧ｦ・・attleScreen蜃ｦ逅・ｼ・));
    case 'POWER_MODIFY_PER_STACK':         return done(addLog(ctx, '繧ｹ繧ｿ繝・け蜿ら・繝代Ρ繝ｼ・・ffectEngine蜃ｦ逅・ｼ・));
    case 'POWER_MODIFY_PER_DECK_COUNT':    return done(addLog(ctx, '繝・ャ繧ｭ譫壽焚豈比ｾ九ヱ繝ｯ繝ｼ・・ffectEngine蜃ｦ逅・ｼ・));
    case 'POWER_MODIFY_PER_ENERGY_COLOR':  return done(addLog(ctx, '繧ｨ繝願牡遞ｮ鬘樊ｯ比ｾ九ヱ繝ｯ繝ｼ・・ffectEngine蜃ｦ逅・ｼ・));
    case 'ALT_COST_OPP_TURN':
      return done(addLog(ctx, '蟇ｾ謌ｦ逶ｸ謇九ち繝ｼ繝ｳ髢薙さ繧ｹ繝亥､牙虚・亥ｱ暮幕繝輔ぉ繧､繧ｺ縺ｧ驕ｩ逕ｨ貂医∩・・));
    case 'BLOCK_CARD_USE': {
      const bcu = action as import('../types/effects').BlockCardUseAction;
      const newOwner = { ...ctx.ownerState, blocked_card_names: [...(ctx.ownerState.blocked_card_names ?? []), bcu.cardName] };
      return done(addLog({ ...ctx, ownerState: newOwner }, `縺薙・繧ｿ繝ｼ繝ｳ縲・{bcu.cardName}縲九ｒ菴ｿ逕ｨ荳榊庄`));
    }
    case 'PREVENT_NEXT_DAMAGE': {
      const pnd = action as import('../types/effects').PreventNextDamageAction;
      const newOwner = { ...ctx.ownerState, prevent_next_damage: (ctx.ownerState.prevent_next_damage ?? 0) + (pnd.count ?? 1) };
      return done(addLog({ ...ctx, ownerState: newOwner }, `縺薙・繧ｿ繝ｼ繝ｳ縲∵ｬ｡縺ｮ${pnd.count ?? 1}蝗槭・繝繝｡繝ｼ繧ｸ繧堤┌蜉ｹ`));
    }
    case 'GAIN_BOND':               return execGainBond(action as import('../types/effects').GainBondAction, ctx);
    case 'STUB': return execStub(action as StubAction, ctx, executeAction);
    case 'UNKNOWN':                 return done(addLog(ctx, `[UNKNOWN: ${(action as {raw:string}).raw?.slice(0, 40) ?? ''}]`));
    default:                        return done(ctx);
  }
}

export function executeEffect(effect: CardEffect, ctx: ExecCtx): ExecResult {
  return executeAction(effect.action, ctx);
}

// ===== 繧､繝ｳ繧ｿ繝ｩ繧ｯ繧ｷ繝ｧ繝ｳ隗｣豎ｺ・・I縺九ｉ蜻ｼ縺ｰ繧後ｋ・・=====

// SELECT_TARGET: 繝ｦ繝ｼ繧ｶ繝ｼ縺・selected[] 縺ｮ繧ｫ繝ｼ繝峨ｒ驕ｸ謚槭＠縺・export function resumeSelectTarget(
  selected: string[],
  pending: PendingInteractionDef & { type: 'SELECT_TARGET' },
  ctx: ExecCtx,
): ExecResult {
  // 驕ｸ謚槭＆繧後◆繧ｫ繝ｼ繝峨↓ thenAction 繧貞句挨驕ｩ逕ｨ
  let cur = ctx;
  for (const cardNum of selected) {
    // thenAction繧貞腰荳繧ｫ繝ｼ繝峨↓驕ｩ逕ｨ縺吶ｋ縺溘ａ縲√ヵ繧｣繝ｫ繧ｿ縺ｪ縺励〒逶ｴ謗･驕ｩ逕ｨ
    const result = applyDirectAction(pending.thenAction, cardNum, cur);
    if (!result.done) return result; // 繝阪せ繝医＠縺溘う繝ｳ繧ｿ繝ｩ繧ｯ繧ｷ繝ｧ繝ｳ・磯壼ｸｸ縺ｪ縺暦ｼ・    cur = { ...cur, ownerState: result.ownerState, otherState: result.otherState, logs: result.logs };
  }
  cur = { ...cur, lastProcessedCards: selected };
  if (pending.continuation) return executeAction(pending.continuation, cur);
  return done(cur);
}

// SEARCH: 繝ｦ繝ｼ繧ｶ繝ｼ縺・picked[] 縺ｮ繧ｫ繝ｼ繝峨ｒ繝斐ャ繧ｯ縺励◆
export function resumeSearch(
  picked: string[],
  pending: PendingInteractionDef & { type: 'SEARCH' },
  ctx: ExecCtx,
): ExecResult {
  let cur = ctx;
  for (const id of picked) {
    const result = applyDirectAction(pending.thenAction, id, cur);
    if (!result.done) return result;
    cur = { ...cur, ownerState: result.ownerState, otherState: result.otherState, logs: result.logs };
  }
  // 譛ｪ繝斐ャ繧ｯ繧ｫ繝ｼ繝峨・蜃ｦ逅・ｼ・EVEAL_PICK_HAND_SHUFFLE_BOTTOM 縺ｪ縺ｩ・・  if (pending.restDest) {
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
        logMsg = '谿九ｊ繧偵ョ繝・く荳九∈';
      } else if (pending.restDest === 'trash') {
        cur = { ...cur, ownerState: { ...cur.ownerState, deck: newDeck, trash: [...cur.ownerState.trash, cardNum] } };
        logMsg = '谿九ｊ繧偵ヨ繝ｩ繝・す繝･縺ｸ';
      } else if (pending.restDest === 'energy') {
        cur = { ...cur, ownerState: { ...cur.ownerState, deck: newDeck, energy: [...cur.ownerState.energy, cardNum] } };
        logMsg = '谿九ｊ繧偵お繝翫だ繝ｼ繝ｳ縺ｸ';
      }
    }
    if (logMsg && remaining.length > 0) cur = addLog(cur, logMsg);
  }
  if (pending.afterAction) {
    const r = executeAction(pending.afterAction, cur);
    if (!r.done) return r;
    cur = { ...cur, ownerState: r.ownerState, otherState: r.otherState, logs: r.logs };
  }
  if (pending.continuation) return executeAction(pending.continuation, cur);
  return done(cur);
}

// CHOOSE: 繝ｦ繝ｼ繧ｶ繝ｼ縺・choiceId 繧帝∈謚槭＠縺・export function resumeChoose(
  choiceId: string,
  pending: PendingInteractionDef & { type: 'CHOOSE' },
  ctx: ExecCtx,
): ExecResult {
  const opt = pending.options.find(o => o.id === choiceId);
  if (!opt) return done(ctx);
  const result = executeAction(opt.action, ctx);
  if (!result.done) {
    // 繝阪せ繝医＠縺溘う繝ｳ繧ｿ繝ｩ繧ｯ繧ｷ繝ｧ繝ｳ・・ELECT_TARGET 遲会ｼ峨・ continuation 縺ｫ螟門・縺ｮ continuation 繧貞粋謌・    if (pending.continuation) {
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

// OPTIONAL_COST: 莉ｻ諢上さ繧ｹ繝井ｻ倥″蜉ｹ譫懊・逋ｺ蜍・繧ｹ繧ｭ繝・・驕ｸ謚槫ｾ後・蜃ｦ逅・// choiceId='pay': energyNums 蛻・・繧ｨ繝翫ｒ謾ｯ謇輔＞蜉ｹ譫懃匱蜍・ 'skip': 繧ｹ繧ｭ繝・・
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
    // 繧ｹ繧ｭ繝・・: 繧ｹ繧ｭ繝・・繧｢繧ｯ繧ｷ繝ｧ繝ｳ 竊・continuation
    const result = executeAction(skipOpt?.action ?? noopAction, ctx);
    if (!result.done) return result;
    if (pending.continuation) {
      return executeAction(pending.continuation, { ...ctx, ownerState: result.ownerState, otherState: result.otherState, logs: result.logs });
    }
    return result;
  }

  // 繧ｳ繧ｹ繝域髪謇輔＞: 濶ｲ繝舌Μ繝・・繧ｷ繝ｧ繝ｳ 竊・繧ｨ繝頑ｶ郁ｲｻ 竊・繧｢繧ｯ繧ｷ繝ｧ繝ｳ螳溯｡・  const costColors = [...(payOpt?.costColors ?? [])];
  for (const n of energyNums) {
    const color = ctx.cardMap.get(n)?.Color ?? '辟｡';
    const idx = costColors.findIndex(c => c === color || c === '辟｡');
    if (idx === -1) return done(addLog(ctx, `繧ｳ繧ｹ繝域髪謇輔＞繧ｨ繝ｩ繝ｼ: ${color}縺ｯ荳崎ｦ～)`);
    costColors.splice(idx, 1);
  }
  if (costColors.length > 0) return done(addLog(ctx, `繧ｳ繧ｹ繝域髪謇輔＞繧ｨ繝ｩ繝ｼ: 繧ｨ繝贋ｸ崎ｶｳ`));

  const newEnergy = ctx.ownerState.energy.filter(n => !energyNums.includes(n));
  const newTrash  = [...ctx.ownerState.trash, ...energyNums];
  const cur = addLog(
    { ...ctx, ownerState: { ...ctx.ownerState, energy: newEnergy, trash: newTrash } },
    `繧ｳ繧ｹ繝域髪謇輔＞: ${(payOpt?.costColors ?? []).map(c => `縲・{c}縲義).join('')}`,
  );

  const result = executeAction(payOpt?.action ?? noopAction, cur);
  if (!result.done) {
    // continuation繧・result.pending 縺ｫ莉倥￠雜ｳ縺・    if (pending.continuation) {
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

// OPPONENT_PAY_OPTIONAL: 蟇ｾ謌ｦ逶ｸ謇九′繧ｳ繧ｹ繝域髪謇輔＞繧帝∈謚槭＠縺溷ｾ後・蜃ｦ逅・// pay 竊・蟇ｾ謌ｦ逶ｸ謇具ｼ・therState・峨・繧ｨ繝翫ｒ豸郁ｲｻ縺励※蜉ｹ譫懊↑縺・ skip 竊・蜉ｹ譫懃匱蜍・export function resumeOpponentPayOptional(
  choiceId: string,
  energyNums: string[], // 蟇ｾ謌ｦ逶ｸ謇九′驕ｸ謚槭＠縺溘お繝翫き繝ｼ繝峨・CardNum
  pending: PendingInteractionDef & { type: 'CHOOSE' },
  ctx: ExecCtx,
): ExecResult {
  const noopAction: SequenceAction = { type: 'SEQUENCE', steps: [] };
  const payOpt  = pending.options.find(o => o.id === 'pay');
  const skipOpt = pending.options.find(o => o.id === 'skip');

  if (choiceId !== 'pay') {
    // 蟇ｾ謌ｦ逶ｸ謇九′謾ｯ謇輔ｏ縺ｪ縺・竊・蜉ｹ譫懃匱蜍・    const result = executeAction(skipOpt?.action ?? noopAction, ctx);
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

  // 蟇ｾ謌ｦ逶ｸ謇九′謾ｯ謇輔≧ 竊・otherState 縺ｮ繧ｨ繝翫ｒ豸郁ｲｻ・亥柑譫懊↑縺暦ｼ・  const costColors = [...(payOpt?.costColors ?? [])];
  for (const n of energyNums) {
    const color = ctx.cardMap.get(n)?.Color ?? '辟｡';
    const idx = costColors.findIndex(c => c === color || c === '辟｡');
    if (idx === -1) return done(addLog(ctx, `繧ｳ繧ｹ繝域髪謇輔＞繧ｨ繝ｩ繝ｼ: ${color}縺ｯ荳崎ｦ～)`);
    costColors.splice(idx, 1);
  }
  if (costColors.length > 0) return done(addLog(ctx, '繧ｳ繧ｹ繝域髪謇輔＞繧ｨ繝ｩ繝ｼ: 繧ｨ繝贋ｸ崎ｶｳ'));

  const newOppEnergy = ctx.otherState.energy.filter(n => !energyNums.includes(n));
  const newOppTrash  = [...ctx.otherState.trash, ...energyNums];
  const cur = addLog(
    { ...ctx, otherState: { ...ctx.otherState, energy: newOppEnergy, trash: newOppTrash } },
    `蟇ｾ謌ｦ逶ｸ謇九さ繧ｹ繝域髪謇輔＞: ${(payOpt?.costColors ?? []).map(c => `縲・{c}縲義).join('')}`,
  );
  if (pending.continuation) return executeAction(pending.continuation, cur);
  return done(cur);
}

// LOOK_AND_REORDER: 繝ｦ繝ｼ繧ｶ繝ｼ縺・reordered[] 縺ｮ鬆・↓荳ｦ縺ｹ・亥・鬆ｭ=繝・ャ繧ｭ繝医ャ繝暦ｼ・export function resumeLookAndReorder(
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
    // 1譫夂岼竊偵ョ繝・く繝医ャ繝励∵ｮ九ｊ竊偵ョ繝・く荳・    const [firstCard, ...restCards] = keep;
    newS = { ...state, deck: [...(firstCard ? [firstCard] : []), ...state.deck, ...restCards], trash: [...state.trash, ...trashed] };
  } else {
    newS = { ...state, deck: [...keep, ...state.deck], trash: [...state.trash, ...trashed] };
  }
  const cur = addLog(setOwnerState(destOwner, newS, ctx), `繝・ャ繧ｭ繧剃ｸｦ縺ｹ譖ｿ縺・`);
  if (pending.continuation) return executeAction(pending.continuation, cur);
  return done(cur);
}

// SELECT_ZONE: 繝励Ξ繧､繝､繝ｼ縺碁∈繧薙□繧ｾ繝ｼ繝ｳ逡ｪ蜿ｷ縺ｫ繧ｫ繝ｼ繝峨ｒ驟咲ｽｮ縺吶ｋ
export function resumeSelectZone(
  zoneIndex: number,
  pending: PendingInteractionDef & { type: 'SELECT_ZONE' },
  ctx: ExecCtx,
): ExecResult {
  const state = ownerState(pending.owner, ctx);
  const signi = [...state.field.signi] as (string[] | null)[];
  if (signi[zoneIndex] && (signi[zoneIndex]?.length ?? 0) > 0) return done(ctx); // 蜊譛画ｸ医∩縺ｪ繧峨せ繧ｭ繝・・
  signi[zoneIndex] = [pending.cardNum];
  const newS: PlayerState = { ...state, field: { ...state.field, signi } };
  const cur = addLog(setOwnerState(pending.owner, newS, ctx),
    `${ctx.cardMap.get(pending.cardNum)?.CardName ?? pending.cardNum}繧貞ｴ縺ｫ蜃ｺ縺兪`);
  if (pending.continuation) return executeAction(pending.continuation, cur);
  return done(cur);
}

// DECLARE_BOND: 繝励Ξ繧､繝､繝ｼ縺後ョ繝・く縺九ｉ繧ｫ繝ｼ繝峨ｒ驕ｸ繧薙〒邨・ｒ迯ｲ蠕励☆繧・export function resumeDeclareBond(
  selectedCardNum: string,
  pending: PendingInteractionDef & { type: 'DECLARE_BOND' },
  ctx: ExecCtx,
): ExecResult {
  const cardName = ctx.cardMap.get(selectedCardNum)?.CardName;
  if (!cardName) return done(addLog(ctx, '邨・佐蠕・ 驕ｸ謚槭き繝ｼ繝峨′隕九▽縺九ｊ縺ｾ縺帙ｓ'));
  const current = ctx.ownerState.bonds ?? [];
  const newBonds = current.includes(cardName) ? current : [...current, cardName];
  const shuffled = shuffle([...ctx.ownerState.deck]);
  const newOwner: PlayerState = { ...ctx.ownerState, bonds: newBonds, deck: shuffled };
  const cur = addLog({ ...ctx, ownerState: newOwner }, `${cardName}縺ｨ縺ｮ邨・ｒ迯ｲ蠕暦ｼ医ョ繝・く繧偵す繝｣繝・ヵ繝ｫ・荏`);
  if (pending.continuation) return executeAction(pending.continuation, cur);
  return done(cur);
}

// ===== 逶ｴ謗･繧｢繧ｯ繧ｷ繝ｧ繝ｳ驕ｩ逕ｨ・育音螳壹・cardNum縺ｫ蟇ｾ縺励※・・=====

function applyDirectAction(action: EffectAction, cardNum: string, ctx: ExecCtx): ExecResult {
  switch (action.type) {
    case 'BANISH': {
      // cardNum縺・opponent.field 縺ｫ縺ゅｋ縺玖・蛻・・繝輔ぅ繝ｼ繝ｫ繝峨↓縺ゅｋ縺九ｒ讀懃ｴ｢
      let found: Owner | null = null;
      if (ctx.ownerState.field.signi.some(s => s?.at(-1) === cardNum)) found = 'self';
      if (ctx.otherState.field.signi.some(s => s?.at(-1) === cardNum)) found = 'opponent';
      if (!found) return done(ctx);
      const s = ownerState(found, ctx);
      const removed = removeFromField(cardNum, s);
      const withEnergy: PlayerState = { ...removed, energy: [...removed.energy, cardNum] };
      return done(addLog(setOwnerState(found, withEnergy, ctx),
        `${ctx.cardMap.get(cardNum)?.CardName ?? cardNum}繧偵ヰ繝九ャ繧ｷ繝･`));
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
        `${ctx.cardMap.get(cardNum)?.CardName ?? cardNum}繧呈焔譛ｭ縺ｫ謌ｻ縺兪)`);
    }
    case 'TRASH': {
      const trashAction = action as TrashAction;
      const tgt = trashAction.target;
      if (tgt.type === 'SIGNI') {
        // 繝輔ぅ繝ｼ繝ｫ繝峨・繧ｷ繧ｰ繝九ｒ繝医Λ繝・す繝･
        const owner = tgt.owner as Owner;
        const s = ownerState(owner, ctx);
        if (s.field.signi.some(stack => stack?.at(-1) === cardNum)) {
          const removed = removeFromField(cardNum, s);
          const newS: PlayerState = { ...removed, trash: [...removed.trash, cardNum] };
          return done(addLog(setOwnerState(owner, newS, ctx),
            `${ctx.cardMap.get(cardNum)?.CardName ?? cardNum}繧偵ヨ繝ｩ繝・す繝･縺ｸ`));
        }
        return done(ctx);
      }
      // HAND_CARD: hand 縺九ｉ繝医Λ繝・す繝･・亥酔蜷阪き繝ｼ繝峨′隍・焚縺ゅｋ蝣ｴ蜷医・蜈磯ｭ縺ｮ1譫壹・縺ｿ・・      for (const owner of ['self', 'opponent'] as Owner[]) {
        const s = ownerState(owner, ctx);
        const hi = s.hand.indexOf(cardNum);
        if (hi >= 0) {
          const newHand = [...s.hand];
          newHand.splice(hi, 1);
          const newS: PlayerState = { ...s, hand: newHand, trash: [...s.trash, cardNum] };
          return done(addLog(setOwnerState(owner, newS, ctx), `謇区惆繧偵ヨ繝ｩ繝・す繝･縺ｸ`));
        }
      }
      return done(ctx);
    }
    case 'POWER_MODIFY': {
      const pmAction = action as PowerModifyAction;
      const delta = resolveNum(pmAction.delta);
      const tgtOwner = pmAction.target.owner === 'any' ? 'self' : pmAction.target.owner as Owner;
      const s = ownerState(tgtOwner, ctx);
      const mods = [...(s.temp_power_mods ?? []), { cardNum, delta }];
      const newS: PlayerState = { ...s, temp_power_mods: mods };
      return done(addLog(setOwnerState(tgtOwner, newS, ctx), `繝代Ρ繝ｼ${delta > 0 ? '+' : ''}${delta}`));
    }
    case 'ADD_TO_HAND': {
      // 繧､繝ｳ繧ｹ繧ｿ繝ｳ繧ｹID縺ｧ豁｣遒ｺ縺ｪ1譫壹ｒ迚ｹ螳壹＠繝・ャ繧ｭ/繝医Λ繝・す繝･縺九ｉ髯､蜴ｻ縺励※謇区惆縺ｸ
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
      return done(addLog({ ...ctx, ownerState: newS }, `${ctx.cardMap.get(cn)?.CardName ?? cn}繧呈焔譛ｭ縺ｫ蜉縺医ｋ`));
    }
    case 'ADD_TO_ENERGY': {
      // 繝・ャ繧ｭ/繝医Λ繝・す繝･縺九ｉ髯､蜴ｻ縺励※繧ｨ繝翫だ繝ｼ繝ｳ縺ｸ
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
      return done(addLog({ ...ctx, ownerState: newSE }, `${ctx.cardMap.get(cnE)?.CardName ?? cnE}繧偵お繝翫だ繝ｼ繝ｳ縺ｸ`));
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
      return done(addLog(setOwnerState(src.owner, newS, ctx), `${ctx.cardMap.get(cardNum)?.CardName ?? cardNum}繧呈焔譛ｭ縺ｫ蜉縺医ｋ`));
    }
    case 'ADD_TO_FIELD': {
      const owner = (action as AddToFieldAction).owner;
      const src = (action as AddToFieldAction).source;
      const state = ownerState(owner, ctx);
      let newS = { ...state };
      if (src?.type === 'TRASH_CARD') {
        const ti = newS.trash.indexOf(cardNum);
        if (ti >= 0) { const t = [...newS.trash]; t.splice(ti, 1); newS = { ...newS, trash: t }; }
      } else if (src?.type === 'ENERGY_CARD') {
        const ei = newS.energy.indexOf(cardNum);
        if (ei >= 0) { const e = [...newS.energy]; e.splice(ei, 1); newS = { ...newS, energy: e }; }
      }
      const signi = [...newS.field.signi] as (string[] | null)[];
      const emptyIdx = signi.findIndex(z => !z || z.length === 0);
      if (emptyIdx >= 0) signi[emptyIdx] = [cardNum];
      newS = { ...newS, field: { ...newS.field, signi } };
      return done(addLog(setOwnerState(owner, newS, ctx), `${ctx.cardMap.get(cardNum)?.CardName ?? cardNum}繧貞ｴ縺ｫ蜃ｺ縺兪)`);
    }
    case 'ATTACH_ACCE': {
      // cardNum = SELECT_TARGET 縺ｧ驕ｸ縺ｰ繧後◆繧ｷ繧ｰ繝・      const acceAction = action as import('../types/effects').AttachAcceAction;
      const tgtState = ownerState(acceAction.targetSigniOwner, ctx);
      const srcState = ownerState(acceAction.sourceOwner, ctx);
      // cardNum = SELECT_TARGET縺ｧ驕ｸ縺ｰ繧後◆繝帙せ繝医す繧ｰ繝・      const zoneIdx  = tgtState.field.signi.findIndex(s => s?.at(-1) === cardNum);
      if (zoneIdx < 0) return done(ctx);
      // acce繧ｫ繝ｼ繝・= sourceCardNum・医お繝翫だ繝ｼ繝ｳ縺九ｉ縺ｮ蝣ｴ蜷茨ｼ峨∪縺溘・ lastProcessedCards[0]・域焔譛ｭ驕ｸ謚槫ｾ鯉ｼ・      const acceCardNum = ctx.sourceCardNum ?? ctx.lastProcessedCards?.[0];
      if (!acceCardNum) return done(ctx);
      // 繧ｨ繝翫だ繝ｼ繝ｳ縺ｾ縺溘・謇区惆縺九ｉ繧｢繧ｯ繧ｻ繧ｫ繝ｼ繝峨ｒ髯､蜴ｻ
      let newSrc = { ...srcState };
      if (newSrc.energy.includes(acceCardNum)) {
        newSrc = { ...newSrc, energy: newSrc.energy.filter(n => n !== acceCardNum) };
      } else if (newSrc.hand.includes(acceCardNum)) {
        newSrc = { ...newSrc, hand: newSrc.hand.filter(n => n !== acceCardNum) };
      } else {
        return done(addLog(ctx, `ATTACH_ACCE: ${ctx.cardMap.get(acceCardNum)?.CardName ?? acceCardNum}縺後お繝・謇区惆縺ｫ縺ｪ縺Я)`);
      }
      let ctx2 = setOwnerState(acceAction.sourceOwner, newSrc, ctx);
      // signi_acce[zoneIdx] 縺ｫ險ｭ螳・      const tgt2 = ownerState(acceAction.targetSigniOwner, ctx2);
      const newAcce = [...(tgt2.field.signi_acce ?? [null, null, null])];
      newAcce[zoneIdx] = acceCardNum;
      const newTgt: import('../types').PlayerState = { ...tgt2, field: { ...tgt2.field, signi_acce: newAcce } };
      ctx2 = setOwnerState(acceAction.targetSigniOwner, newTgt, ctx2);
      const acceCardName  = ctx.cardMap.get(acceCardNum)?.CardName ?? acceCardNum;
      const signiCardName = ctx.cardMap.get(cardNum)?.CardName ?? cardNum;
      // ON_ACCE 繝医Μ繧ｬ繝ｼ: 繧｢繧ｯ繧ｻ縺励◆縺薙→縺ｧ繝輔ぅ繝ｼ繝ｫ繝峨す繧ｰ繝九・ ON_ACCE AUTO 蜉ｹ譫懊ｒ逋ｺ轣ｫ
      // ・・attleScreen蛛ｴ縺ｮ queueCardEffects 縺ｧ ON_ACCE 繧貞・逅・ｼ・      const ctx3 = addLog(ctx2, `${acceCardName}繧・{signiCardName}縺ｫ繧｢繧ｯ繧ｻ`);
      // acce_just_done 繝輔Λ繧ｰ: BattleScreen縺ｧ ON_ACCE 繝医Μ繧ｬ繝ｼ繧呈､懷・縺吶ｋ縺溘ａ縺ｫ菴ｿ逕ｨ
      const tgt3 = ownerState(acceAction.targetSigniOwner, ctx3);
      const withFlag: import('../types').PlayerState = {
        ...tgt3,
        acce_just_done: cardNum, // 繝帙せ繝医す繧ｰ繝九・cardNum
      };
      return done(setOwnerState(acceAction.targetSigniOwner, withFlag, ctx3));
    }
    case 'SEQUENCE': {
      // SEARCH 縺ｮ thenAction 縺・SEQUENCE[REVEAL, ADD_TO_HAND] 遲峨・蝣ｴ蜷医・      // cardNum 繧貞推繧ｹ繝・ャ繝励↓蠑輔″邯吶＞縺ｧ螳溯｡後☆繧・      const steps = (action as import('../types/effects').SequenceAction).steps;
      let cur = ctx;
      for (const step of steps) {
        const r = applyDirectAction(step, cardNum, cur);
        if (!r.done) return r;
        cur = { ...cur, ownerState: r.ownerState, otherState: r.otherState, logs: r.logs };
      }
      return done(cur);
    }
    case 'NEGATE_ATTACK': {
      // cardNum 繧貞ｯｾ雎｡繧ｷ繧ｰ繝九・ negated_attacks 縺ｫ霑ｽ蜉
      const na = action as import('../types/effects').NegateAttackAction;
      const tgtOwner = na.target.owner === 'any' ? 'opponent' : na.target.owner as Owner;
      const s = ownerState(tgtOwner, ctx);
      const negated = [...(s.negated_attacks ?? []), cardNum];
      const newS = { ...s, negated_attacks: negated };
      return done(addLog(setOwnerState(tgtOwner, newS, ctx),
        `${ctx.cardMap.get(cardNum)?.CardName ?? cardNum}縺ｮ繧｢繧ｿ繝・け繧堤┌蜉ｹ蛹冒)`);
    }
    case 'BLOOD_CRYSTAL_ARMOR': {
      // cardNum = 陦譎ｶ豁ｦ陬・☆繧句ｯｾ雎｡繧ｷ繧ｰ繝具ｼ・ELECT_TARGET縺ｧ驕ｸ縺ｰ繧後◆繝輔ぅ繝ｼ繝ｫ繝峨す繧ｰ繝具ｼ・      const bcaA = action as import('../types/effects').BloodCrystalArmorAction;
      const zoneIdx = ctx.ownerState.field.signi.findIndex(stack => stack?.at(-1) === cardNum);
      if (zoneIdx < 0) return done(ctx);
      const targetCard = ctx.cardMap.get(cardNum);
      const sameName = targetCard?.CardName;
      if (!sameName) return done(ctx);

      let newState = { ...ctx.ownerState };
      let foundCard: string | null = null;
      let shuffleNeeded = false;

      // hand / trash 縺九ｉ蜷悟錐繧ｫ繝ｼ繝峨ｒ謗｢縺呻ｼ・eck 縺ｯ譛蠕後↓・・      for (const src of bcaA.source) {
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
      if (!foundCard) return done(addLog({ ...ctx, ownerState: newState }, `陦譎ｶ豁ｦ陬・ｯｾ雎｡縺ｪ縺暦ｼ・{sameName}・荏)`);

      // 繧ｷ繧ｰ繝九せ繧ｿ繝・け縺ｮ蜈磯ｭ縺ｫ霑ｽ蜉・井ｸ九↓鄂ｮ縺擾ｼ・      const newSigni = newState.field.signi.map((stack, i) => {
        if (i !== zoneIdx) return stack;
        return [foundCard!, ...(stack ?? [])];
      }) as (string[] | null)[];

      // 陦譎ｶ豁ｦ陬・ヵ繝ｩ繧ｰ繧堤ｫ九※繧具ｼ域里縺ｫtrue縺ｧ繧Ｕrue縺ｮ縺ｾ縺ｾ・・      const wasAlreadyArmored = newState.field.signi_armor?.[zoneIdx] ?? false;
      const newArmor = [...(newState.field.signi_armor ?? [false, false, false])];
      newArmor[zoneIdx] = true;

      newState = { ...newState, field: { ...newState.field, signi: newSigni, signi_armor: newArmor as boolean[] } };

      // 繝・ャ繧ｭ縺九ｉ豁ｦ陬・＠縺溷ｴ蜷医・繧ｷ繝｣繝・ヵ繝ｫ
      if (shuffleNeeded) {
        newState = { ...newState, deck: [...newState.deck].sort(() => Math.random() - 0.5) };
      }

      const newCtx = { ...ctx, ownerState: newState };
      const logMsg = `${sameName}繧定｡譎ｶ豁ｦ陬・{wasAlreadyArmored ? '・郁ｿｽ蜉・・ : ''}`;
      // wasAlreadyArmored 繧貞､門・繝医Μ繧ｬ繝ｼ讀懷・縺ｮ縺溘ａ縺ｫ lastProcessedCards 縺ｨ縺励※貂｡縺・      // ON_BLOOD_CRYSTAL_ARMOR 繝医Μ繧ｬ繝ｼ縺ｯBattleScreen蛛ｴ縺ｧ讀懷・繝ｻ逋ｺ轣ｫ縺吶ｋ
      return done(addLog(newCtx, logMsg));
    }
    case 'PLACE_UNDER_SOURCE_SIGNI': {
      // ctx.sourceCardNum 縺ｫ縺ゅｋ繧ｷ繧ｰ繝九・繧ｾ繝ｼ繝ｳ縺ｫ cardNum 繧剃ｸ九°繧芽ｿｽ蜉
      const fromLoc = (action as import('../types/effects').PlaceUnderSourceSigniAction).fromLocation;
      const sourceCard = ctx.sourceCardNum;
      if (!sourceCard) return done(ctx);
      const zoneIdx = ctx.ownerState.field.signi.findIndex(stack => stack?.includes(sourceCard));
      if (zoneIdx === -1) return done(ctx);
      // 遘ｻ蜍募・縺ｮ繝ｪ繧ｹ繝医°繧蛾勁蜴ｻ
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
      // 繧ｾ繝ｼ繝ｳ縺ｮ蜈磯ｭ縺ｫ霑ｽ蜉・井ｸ九↓鄂ｮ縺擾ｼ・      const newSigni = newState.field.signi.map((stack, i) => {
        if (i !== zoneIdx) return stack;
        return [cardNum, ...(stack ?? [])];
      }) as (string[] | null)[];
      newState = { ...newState, field: { ...newState.field, signi: newSigni } };
      return done(addLog({ ...ctx, ownerState: newState },
        `${ctx.cardMap.get(cardNum)?.CardName ?? cardNum}繧偵す繧ｰ繝九・荳九↓鄂ｮ縺・◆`));
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
        `${ctx.cardMap.get(cardNum)?.CardName ?? cardNum}繧偵ム繧ｦ繝ｳ`));
    }
    case 'FREEZE': {
      const frzA = action as import('../types/effects').FreezeAction;
      const frzOwner = frzA.target.owner === 'any' ? 'opponent' : frzA.target.owner as Owner;
      const frzS = ownerState(frzOwner, ctx);
      const frzIdx = frzS.field.signi.findIndex(st => st?.at(-1) === cardNum);
      if (frzIdx < 0) return done(ctx);
      const newFrz = [...(frzS.field.signi_frozen ?? [false, false, false])] as boolean[];
      newFrz[frzIdx] = true;
      return done(addLog(setOwnerState(frzOwner, { ...frzS, field: { ...frzS.field, signi_frozen: newFrz } }, ctx),
        `${ctx.cardMap.get(cardNum)?.CardName ?? cardNum}繧貞㍾邨秦)`);
    }
    case 'GRANT_KEYWORD': {
      const gkA = action as GrantKeywordAction;
      let gkOwner: Owner | null = null;
      if (ctx.ownerState.field.signi.some(s => s?.at(-1) === cardNum)) gkOwner = 'self';
      else if (ctx.otherState.field.signi.some(s => s?.at(-1) === cardNum)) gkOwner = 'opponent';
      if (!gkOwner) return done(ctx);
      const gkS = ownerState(gkOwner, ctx);
      const gkGrants = { ...(gkS.keyword_grants ?? {}) };
      gkGrants[cardNum] = [...new Set([...(gkGrants[cardNum] ?? []), gkA.keyword])];
      return done(addLog(setOwnerState(gkOwner, { ...gkS, keyword_grants: gkGrants }, ctx),
        `縲・{gkA.keyword}縲代ｒ莉倅ｸ趣ｼ・{ctx.cardMap.get(cardNum)?.CardName ?? cardNum}・荏)`);
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
        `閭ｽ蜉帑ｻ倅ｸ趣ｼ・{ctx.cardMap.get(cardNum)?.CardName ?? cardNum}・荏)`);
    }
    case 'TAKE_FROM_UNDER_SIGNI': {
      const ta = action as import('../types/effects').TakeFromUnderSigniAction;
      // cardNum 繧偵す繧ｰ繝九だ繝ｼ繝ｳ縺ｮ荳九き繝ｼ繝峨°繧蛾勁蜴ｻ
      const newSigni = ctx.ownerState.field.signi.map(stack => {
        if (!stack) return stack;
        const idx = stack.indexOf(cardNum);
        if (idx === -1 || idx === stack.length - 1) return stack; // 荳翫↓縺ゅｋ or 譛荳贋ｽ・繧ｷ繧ｰ繝玖・菴・
        return [...stack.slice(0, idx), ...stack.slice(idx + 1)];
      }) as (string[] | null)[];
      let newOwner = { ...ctx.ownerState, field: { ...ctx.ownerState.field, signi: newSigni } };
      const destLabel = ta.destination === 'hand' ? '謇区惆' : ta.destination === 'energy' ? '繧ｨ繝翫だ繝ｼ繝ｳ' : '繝医Λ繝・す繝･';
      if (ta.destination === 'hand') {
        newOwner = { ...newOwner, hand: [...newOwner.hand, cardNum] };
      } else if (ta.destination === 'energy') {
        newOwner = { ...newOwner, energy: [...newOwner.energy, cardNum] };
      } else {
        newOwner = { ...newOwner, trash: [...newOwner.trash, cardNum] };
      }
      return done(addLog({ ...ctx, ownerState: newOwner },
        `${ctx.cardMap.get(cardNum)?.CardName ?? cardNum}繧偵す繧ｰ繝九・荳九°繧・{destLabel}縺ｫ遘ｻ蜍描)`);
    }
    default:
      // STUB 遲峨・蝣ｴ蜷医・∈謚樔ｸｭ縺ｮ cardNum 繧・lastProcessedCards 縺ｧ蠑輔″貂｡縺・      return executeAction(action, { ...ctx, lastProcessedCards: [cardNum] });
  }
}

