import { findSigniAutoPayGate, isSigniAutoAbility, wrapSigniAutoPayGate } from '../../../engine/blockAction';
import { collectForcedTargets } from '../../../engine/effectEngine';
import { type ExecCtx, applyRefreshOnDone, executeEffect, getCardNum } from '../../../engine/effectExecutor';
import { initStack, isReadyToResolve, isStackDone, pushToStack, shiftQueue } from '../../../engine/effectStack';
import { pendingRespondsOpponent, resolvePendingExiles } from '../../../engine/execUtils';
import { type TrigCtx, collectAbilityActivatedTriggers as pureCollectAbilityActivatedTriggers, collectTargetedTriggers as pureCollectTargetedTriggers, collectTrapActivateTriggers as pureCollectTrapActivateTriggers, collectTrapSetTriggers as pureCollectTrapSetTriggers } from '../../../engine/triggerCollect';
import { type BattleStateRow, type CardData, type EffectStack, type PendingEffect, type PlayerState } from '../../../types';
import { type CardEffect } from '../../../types/effects';
import { refreshForcesTurnEnd, refreshTurnEndDiscardCount } from '../refreshTurnEnd';
import { applyForcedTurnEnd } from '../turnScopedState';
import { type BattleAction } from './battleController';
import { collectArtsUseForResolution, collectOppArtsUseForResolution } from './artsUseTriggers';
import { makeBoardDiffCollector } from './boardDiffTriggers';
import { makeFillDeployCaps, makeTrigCtx } from './execCtxDeps';
import { effectProtectionMaterials } from './effectProtectionCtx';

/**
 * 🆕**スタック解決の切り出し**（§5.7 `S-5a`・2026-09-18）＝`BattleScreen.resolveStackNext` の本体（385行）を
 * **React にも DB にも触らない純関数**へ出した1本。`docs/BATTLE_CONTROLLER.md` の seam（計算＝純粋／永続化＝`persist`）の続き。
 *
 * ■ 契約＝**盤面（`bs`）と依存（`deps`）から「次に commit する `BattleAction` と、書くログ」を求めるだけ**。
 *   書き込み（`persist.commit`）・ログの flush・多重実行の防止（ref）・`loading` は**呼び出し側**に残す。
 * ■ なぜ要るか＝`S-5`（対戦丸ごとのシミュレータ）は「スタックが空になるまで解決を繰り返す」ループが要る。
 *   画面の `useEffect` と DB の通知待ちに埋まっていると、ヘッドレスでは1手も進められない。
 * ⚠**挙動は1行も変えていない**（移設）＝人間の対戦経路もこの関数を通る。golden の `§5.7 S-5a` が
 *   「画面側に本体が残っていない（写経していない）」ことと、ヘッドレスで1手解決できることを固定する。
 * ⚠`deps` に残した5本（`trigCtx`／`fillDeployCaps`／`collectBoardDiffTriggers`／`collectArtsUseForResolution`／
 *   `collectOppArtsUseForResolution`）は**まだ `BattleScreen` のクロージャ**＝次段で外へ出す。
 *   実測（2026-09-18）＝`collectBoardDiffTriggers` は579行・下位の収集ラッパ26本を呼ぶ（この塊が次の山）。
 */

/**
 * `resolveStackStep` が必要とする材料。
 * 🆕**2026-09-18（`S-5c` の下ごしらえ）＝データだけになった**＝画面のクロージャは1本も要らない。
 *   誘発の収集・`TrigCtx`・配置数制限は、この関数が中で組み立てる（`boardDiffTriggers.ts`／`execCtxDeps.ts`／`artsUseTriggers.ts`）。
 */
export interface StackResolveDeps {
  cardMap: Map<string, CardData>;
  effectsMap: Map<string, CardEffect[]>;
  /** この client のプレイヤーID＝`ON_ARTS_USE` は caster の client だけが収集する（二重押し防止）。 */
  userId: string;
  /** この client が host 側か。 */
  isHost: boolean;
  /** 場の実効パワー（`calcFieldPowers` の結果）。`TrigCtx` が読む。 */
  effectivePowers: Map<string, number>;
}

/** 1手ぶんの結果（`action` をそのまま `persist.commit(reduceBattle(bs, action))` へ渡す）。 */
export interface StackResolveStep {
  /** 解決したエントリのID（`null`＝キューが空でスタックを畳んだだけ）。呼び出し側の二重処理防止に使う。 */
  entryId: string | null;
  action: BattleAction;
  /** 画面の対戦ログへ積む行（呼び出し側が `appendBattleLogs` する）。 */
  logs: string[];
}

/**
 * 【出】の配置アンカー判定（§6.4 `O-32`）＝この効果が「場に出す」を含むか・その配置で【出】を抑止するか。
 * 🆕§5.7 `S-5a` で `BattleScreen` から移設（純関数＝画面の状態を見ない）。
 */
export const fieldPlacementOnPlayOpts = (effect?: CardEffect): {
  collectPlacedSelfOnPlay: boolean;
  suppressOnPlay: boolean;
} => {
  if (!effect) return { collectPlacedSelfOnPlay: false, suppressOnPlay: false };
  const visit = (value: unknown): boolean => {
    if (!value || typeof value !== 'object') return false;
    const action = value as Record<string, unknown>;
    if ((action.type === 'ADD_TO_FIELD' || action.type === 'REVEAL_UNTIL_TO_FIELD') && action.suppressOnPlay === true) return true;
    // 配置を行う STUB（`placesToField` を宣言したもの）にも同じ scoped フラグが乗る（§6.4 O-32）。
    // ⚠型ごとに分岐を足していくと**新しい配置アンカーが無言で漏れる**ので、STUB 側は id ではなく
    //   フラグで判定する（`foldSuppressOnPlay` が立てる側と同じ規約）。
    if (action.type === 'STUB' && action.suppressOnPlay === true) return true;
    if (action.type === 'REVEAL_UNTIL' && action.hit && typeof action.hit === 'object') {
      const hit = action.hit as { destination?: unknown; suppressOnPlay?: unknown };
      if (hit.destination === 'field' && hit.suppressOnPlay === true) return true;
    }
    if (action.type === 'LOOK_PICK_CHAIN' && Array.isArray(action.stages)
        && action.stages.some(s => !!s && typeof s === 'object'
          && (s as { then?: string; suppressOnPlay?: boolean }).then === 'field'
          && (s as { suppressOnPlay?: boolean }).suppressOnPlay === true)) return true;
    return Object.values(action).some(v => Array.isArray(v) ? v.some(visit) : visit(v));
  };
  return {
    collectPlacedSelfOnPlay: true,
    suppressOnPlay: visit(effect.action),
  };
};

/** 《トラップアイコン》発動トリガー（画面側の薄いラッパと同じ＝効果元の持ち主から見た自/他を決めるだけ）。 */
function collectTrapActivate(
  deps: { trigCtx: () => TrigCtx }, bs: BattleStateRow, ownerId: string, hostState: PlayerState, guestState: PlayerState,
) {
  const ownerState = ownerId === bs.host_id ? hostState : guestState;
  const otherState = ownerId === bs.host_id ? guestState : hostState;
  return pureCollectTrapActivateTriggers(deps.trigCtx(), ownerId, ownerState, otherState);
}

/**
 * スタックの先頭1件を解決して「次に commit する `BattleAction`」を返す（解決するものが無ければ `null`）。
 * ⚠呼び出し側の `loading`／多重実行ガード（同じエントリを2回処理しない）は**ここには無い**。
 */
export function resolveStackStep(bs: BattleStateRow, input: StackResolveDeps): StackResolveStep | null {
  const stack = bs.effect_stack;
  if (!stack || !isReadyToResolve(stack) || stack.queue.length === 0) return null;
  const logs: string[] = [];
  // 🆕材料はここで組み立てる（呼び出し側は**データだけ**渡す）。⚠`bs` は差分の before＝収集器にもそのまま渡す。
  const trigCtx = () => makeTrigCtx({ bs, effectsMap: input.effectsMap, cardMap: input.cardMap,
    effectivePowers: input.effectivePowers, userId: input.userId });
  const artsDeps = { bs, cardMap: input.cardMap, userId: input.userId, isHost: input.isHost, trigCtx };
  const deps = {
    ...input,
    trigCtx,
    fillDeployCaps: makeFillDeployCaps({ cardMap: input.cardMap, effectsMap: input.effectsMap }),
    collectBoardDiffTriggers: makeBoardDiffCollector({
      bs, cardMap: input.cardMap, effectsMap: input.effectsMap, isHost: input.isHost, userId: input.userId, trigCtx,
    }),
    collectArtsUseForResolution: (p: Parameters<typeof collectArtsUseForResolution>[1]) =>
      collectArtsUseForResolution(artsDeps, p),
    collectOppArtsUseForResolution: (p: Parameters<typeof collectOppArtsUseForResolution>[1]) =>
      collectOppArtsUseForResolution(artsDeps, p),
  };
  const { entry, newStack: shiftedStack } = shiftQueue(stack);
  if (!entry) return { entryId: null, action: { type: 'SET_STACK', stack: null }, logs };
  const ownerIsHost = entry.playerId === bs.host_id;
  const ownerState  = ownerIsHost ? bs.host_state : bs.guest_state;
  const otherState  = ownerIsHost ? bs.guest_state : bs.host_state;
  const isOwnerTurn = bs.active_user_id === entry.playerId;
  // ON_ABILITY_ACTIVATED（§6.3 J-1「他能力の発動監視」）＝**ここが「能力が発動した」瞬間**。
  // `shiftQueue` の呼び出し元はこの1箇所だけなので、全経路（人間/CPU・【出】/【自】/LB）をここで押さえられる。
  // 監視側の【自】を同じスタックへ積み、発動した能力の直後に解決させる。
  // ⚠監視エントリ自身は ON_ABILITY_ACTIVATED なので collector 側で除外され、連鎖にはならない。
  const abilityActivated = { ownerId: entry.playerId, effect: entry.effect, cardNum: entry.cardNum, ownerState };
  const aaHost  = pureCollectAbilityActivatedTriggers(deps.trigCtx(), bs.host_id, bs.host_state, bs.guest_state, abilityActivated);
  const aaGuest = pureCollectAbilityActivatedTriggers(deps.trigCtx(), bs.guest_id, bs.guest_state, bs.host_state, abilityActivated);
  const abilityWatchEntries = [...aaHost.entries, ...aaGuest.entries];
  const newStack = abilityWatchEntries.length > 0 ? pushToStack(shiftedStack, abilityWatchEntries) : shiftedStack;
  const who = entry.playerId === deps.userId ? '自分' : '相手';
  logs.push(...[`[${who}] ${entry.label}`]);
  // 🆕2026-10-26＝保護・常時効果の材料は `effectProtectionCtx.ts` へ移設（CPU の先読みも同じ関数を使う）。
  const { ownerStateForCtx, ctxPowers, declaredCardMap1, otherProtectedZones, otherProtectedZoneRules, otherProtectedSigniNumsM, otherAttackNegationProtectedNums, otherDownProtectedNumsM, otherBounceProtectedNumsM, otherBanishProtectedNumsM, ownBanishProtectedNumsM, otherTrashFieldProtectedNumsM, ownSelfTrashPreventNums, otherAbilityGainProtectedNums, otherEffectImmuneNums, ownEffectImmuneNums, charmShieldNums, contBlockedCtx, allColorSigniNums, fieldSigniExtraColors, oppTrashColorLoss, treatAsClassAllZones, deckTrashLevel1Nums } = effectProtectionMaterials({
    ownerState, otherState, isOwnerTurn, cardMap: deps.cardMap, effectsMap: deps.effectsMap, turnPhase: bs.turn_phase,
    sourceCardNum: entry.cardNum, effectType: entry.effect.effectType,
  });
  // ⚠ `currentPhase` は**この8箇所すべてに渡すこと**（タスク12(cvii)）。engine 側にはフェイズを見る
  //   機構が4本あるが（`isOwnTrashMoveLocked`／`DURING_PHASE` 条件／`applyEffectLeaveNoAbilityDeck
  //   BottomSubstitute`／`banishRedirectOpts.turnPhase`）、いずれも**フェイズ不明なら成立させない側へ
  //   倒す**設計なので、渡し忘れると「engine は正しいのに実UIでは丸ごと不発」になり計器にも映らない。
  //   golden ハーネス（`src/verify/main.ts`）は `currentPhase:'MAIN'` を手で埋めるため緑のまま通る。
  const ctx: ExecCtx = { ownerState: ownerStateForCtx, otherState, cardMap: declaredCardMap1, logs: [], currentPhase: bs.turn_phase ?? undefined, effectivePowers: ctxPowers, sourceCardNum: entry.cardNum, sourceEffectId: entry.effectId, triggeringCardNum: entry.triggeringCardNum, leftFieldUnderCards: entry.leftFieldUnderCards, sourceLeftZoneIdx: entry.sourceLeftZoneIdx, triggeringKeyword: entry.triggeringKeyword, battleAttackerCardNum: entry.battleAttackerCardNum, banishedSigniPower: entry.banishedSigniPower, otherProtectedZones, otherProtectedZoneRules, otherProtectedSigniNums: otherProtectedSigniNumsM, otherAttackNegationProtectedNums, otherDownProtectedNums: otherDownProtectedNumsM, otherBounceProtectedNums: otherBounceProtectedNumsM, otherBanishProtectedNums: otherBanishProtectedNumsM, ownBanishProtectedNums: ownBanishProtectedNumsM, otherTrashFieldProtectedNums: otherTrashFieldProtectedNumsM, ownSelfTrashPreventNums, otherAbilityGainProtectedNums, otherEffectImmuneNums: otherEffectImmuneNums, ownEffectImmuneNums, charmShieldNums, deckToEnergyBlocked: contBlockedCtx.forSelf.has('DECK_TO_ENERGY'), signiFieldPlaceByEffectBlocked: contBlockedCtx.forSelf.has('SIGNI_FIELD_PLACE_BY_EFFECT'), allColorSigniNums, fieldSigniExtraColors, oppTrashColorLoss, treatAsClassAllZones, deckTrashLevel1Nums };
  ctx.isOwnerTurn = isOwnerTurn;
  // EFFECTIVE_LRIG_LIMIT_GTE（WXDi-P11-010A）は実効リミット計算に deps.effectsMap を要る。
  // ⚠ ExecCtx.effectsMap は省略可＝渡さないと当該条件が**常に false** になる dead flag だった（続き296 検証で発見）。
  ctx.effectsMap = deps.effectsMap;
  deps.fillDeployCaps(ctx); // 配置数制限（CONT版）をctxへ（isOwnerTurn 確定後に呼ぶ）
  // §6.4 O-38（続き544）＝「対戦相手のシグニの【自】能力が発動する場合、対戦相手が〈コスト〉を
  // 支払わないかぎり、その能力は何もしない」（`SPDi43-01-E2`）。
  // 🔑**ここが唯一の choke point**＝`shiftQueue` の呼び出し元は上の1箇所だけなので、
  //   全経路（人間/CPU・シグニの【自】）をここで包める。収集側（`triggerCollect` の42箇所に散った
  //   `BLOCK_OWN_SIGNI_AUTO` フィルタ）に支払い分岐は差し込めない。
  const autoPayGate = isSigniAutoAbility(entry.effect, entry.cardNum, deps.cardMap)
    ? findSigniAutoPayGate(ownerState, otherState) : null;
  const effectToRun = autoPayGate ? wrapSigniAutoPayGate(entry.effect, autoPayGate) : entry.effect;
  let result = executeEffect(effectToRun, ctx);
  // デッキ0枚→リフレッシュ（効果解決後）。ターンプレイヤーの2回目リフレッシュならその後ターン終了。
  // 🔑公式ルール＝「1つの効果が終わった後、**他に発動する効果より優先して**リフレッシュ」（例：《幻獣神 オサキ》）。
  /** 2回目のリフレッシュでのターン終了か（効果の「このターンを終了する」と分ける＝手札調整はこちらだけ）。 */
  let refreshForcedEnd = false;
  {
    const refreshed = applyRefreshOnDone(result, deps.cardMap);
    if (refreshed !== result) {
      const turnPlayerIsOwner = entry.playerId === bs.active_user_id;
      const turnPlayerRefreshed = turnPlayerIsOwner ? refreshed.ownerRefreshed : refreshed.otherRefreshed;
      const turnPlayerCount = (turnPlayerIsOwner ? refreshed.ownerState : refreshed.otherState).refresh_count_this_turn ?? 0;
      // §5.6 `C-9` `R-28`＝しきい値は `refreshTurnEnd.ts` の述語1本（funnel と同じ判定を通す）。
      refreshForcedEnd = !!turnPlayerRefreshed && refreshForcesTurnEnd({ refresh_count_this_turn: turnPlayerCount } as PlayerState) && refreshed.done;
      result = (refreshForcedEnd && refreshed.done) ? { ...refreshed, forceEndTurn: true } : refreshed;
    }
  }
  if (result.logs.length > 0) logs.push(...result.logs);

  // FORCE_TARGET_SELF: opp_field SELECT_TARGETで強制対象シグニが候補にある場合、候補を絞る
  if (!result.done && result.pending.type === 'SELECT_TARGET' && result.pending.targetScope === 'opp_field') {
    const effectSourceCardType = deps.cardMap.get(getCardNum(entry.cardNum))?.Type;
    const forcedNums = collectForcedTargets(otherState, ownerStateForCtx, deps.cardMap, deps.effectsMap, !isOwnerTurn, effectSourceCardType);
    const forcedInCands = forcedNums.filter(n => result.done === false && result.pending.type === 'SELECT_TARGET' && result.pending.candidates.includes(n));
    if (forcedInCands.length > 0 && result.done === false && result.pending.type === 'SELECT_TARGET' && forcedInCands.length < result.pending.candidates.length) {
      const pend = result.pending;
      result = { ...result, pending: { ...pend, candidates: forcedInCands } } as typeof result;
      logs.push(...[`[FORCE_TARGET_SELF] 対象が${forcedInCands.length}体に強制`]);
    }
  }

  const hostState  = resolvePendingExiles(ownerIsHost ? result.ownerState : result.otherState);
  const guestState = resolvePendingExiles(ownerIsHost ? result.otherState : result.ownerState);

  const stackAfter = isStackDone(newStack) ? null : newStack;
  // パッチは型付きローカルへ積み、commit 直前に `RESOLVE_EFFECT_STEP` の payload として1回だけ渡す
  // （旧実装は `Record<string, unknown>` の `update` を積み増し、`'host_state' in update ? … : hostState`
  //  で読み戻していた＝3キーとも初期化済みなので **読み戻し先は常に累積値**）。
  let hostAcc = hostState;
  let guestAcc = guestState;
  // ON_ABILITY_ACTIVATED（§6.3 J-1）の《ターン1回》消化を actions_done へ永続化する。
  // collector が使用回数を読むのは actions_done なので、書き戻さないと**同じターンに何度でも再発火**する
  // （既存 collector 群が usedOncePerTurnIds を呼び出し側で書き戻しているのと同じ規約）。
  if (aaHost.usedOncePerTurnIds.length > 0) {
    hostAcc = { ...hostAcc, actions_done: [...(hostAcc.actions_done ?? []), ...aaHost.usedOncePerTurnIds] };
  }
  if (aaGuest.usedOncePerTurnIds.length > 0) {
    guestAcc = { ...guestAcc, actions_done: [...(guestAcc.actions_done ?? []), ...aaGuest.usedOncePerTurnIds] };
  }
  let stackAcc: EffectStack | null = stackAfter;
  let pendingAcc: PendingEffect | null;
  /** FORCE_END_TURN で重ねるターン終了（未発生＝undefined）。 */
  let forceEndNextTurn: { activeUserId: string } | undefined;
  if (!result.done) {
    // opponentResponds=true の場合、相手プレイヤーがUIを操作する
    const oppId = ownerIsHost ? bs.guest_id : bs.host_id;
    const respondPlayerId = pendingRespondsOpponent(result.pending) ? oppId : undefined;
    pendingAcc = {
      sourcePlayerId: entry.playerId,
      ...(respondPlayerId ? { respondPlayerId } : {}),
      sourceCardNum: entry.cardNum,
      effectId: entry.effectId,
      interaction: result.pending,
      ...(entry.triggeringCardNum ? { triggeringCardNum: entry.triggeringCardNum } : {}),
      ...(entry.leftFieldUnderCards ? { leftFieldUnderCards: entry.leftFieldUnderCards } : {}),
      ...(entry.sourceLeftZoneIdx !== undefined ? { sourceLeftZoneIdx: entry.sourceLeftZoneIdx } : {}),
      ...(entry.triggeringKeyword ? { triggeringKeyword: entry.triggeringKeyword } : {}),
      ...(result.trapActivated ? { trapActivated: true } : {}),
      ...(result.trapSetOwners ? { trapSetOwners: result.trapSetOwners } : {}),
      ...(result.storedTargetCards ? { storedTargetCards: result.storedTargetCards } : {}),
    } satisfies PendingEffect;
    // インタラクション中はスタック（残キュー）を保持
    stackAcc = newStack;
    // === 中断前ラウンドの盤面差分トリガー（タスク12(cxi)・Opus）===
    // エントリの解決が**最初の対話で中断する**場合、そこまでに確定した盤面変化（例 SEQUENCE の
    // step1 の DRAW）は下の RESOLVE_EFFECT_STEP で bs.host_state/bs.guest_state へ取り込まれる。
    // 従来この分岐には収集が一切なく、resume 側（handleEffectInteraction）が完了時に行う
    // collectBoardDiffTriggers は **before に既にその変化を含む**ため差分ゼロ＝永久に見逃していた
    // （続き75 が resume 側の2巡目以降に入れた同じ手当ての、1巡目版が欠けていた）。
    // 実例＝WX20-026-E1 `SEQUENCE[DRAW, TRASH(手札1枚選択)]` はドロー直後に中断するため、
    // 同カード E3 の ON_DRAW（drawBySourceStory）が実機で一度も発火しなかった。
    // ⚠ pending_effect を残したままスタックに積むが、これは resume 側の中途収集と同じ扱い
    //   （pending 解決後にスタックが処理される）＝新しい実行順序を持ち込むものではない。
    const midBd = deps.collectBoardDiffTriggers(hostAcc, guestAcc, {
      causeOwnerId: entry.playerId,
      causeSourceCardNum: entry.cardNum,
      fieldTrashCostCards: result.fieldTrashCostCards,
      ...fieldPlacementOnPlayOpts(entry.effect),
    });
    hostAcc = midBd.hostState;
    guestAcc = midBd.guestState;
    if (midBd.entries.length > 0) stackAcc = pushToStack(newStack, midBd.entries);
  } else {
    pendingAcc = null;

    // === 盤面差分トリガーの統合収集（続き61・Opus）===
    // 従来ここに全 collector が並んでいたが、resume 経路（handleEffectInteraction）と共通化するため
    // collectBoardDiffTriggers に集約した。action 型固有のもの（COLLAB/REVEAL_UNTIL_TO_FIELD/arts）は下に inline 据置。
    {
      const bd = deps.collectBoardDiffTriggers(hostAcc, guestAcc, {
        causeOwnerId: entry.playerId,
        causeSourceCardNum: entry.cardNum,
        fieldTrashCostCards: result.fieldTrashCostCards,
        ...fieldPlacementOnPlayOpts(entry.effect),
      });
      hostAcc = bd.hostState;
      guestAcc = bd.guestState;
      if (bd.entries.length > 0) {
        const baseStackBD = stackAcc ?? null;
        stackAcc = baseStackBD
          ? pushToStack(baseStackBD, bd.entries)
          : initStack(stack.turnPlayerId, bd.entries);
      }
    }

    // 《トラップアイコン》発動は signi_traps の減少だけでは「破棄」と区別できないため、
    // executor が発動枝で立てた明示イベントを、現在の効果解決完了後に収集する。
    if (result.trapActivated) {
      const ta = collectTrapActivate(deps, bs, entry.playerId, hostState, guestState);
      if (ta.entries.length > 0) {
        const baseStackTA = stackAcc ?? null;
        stackAcc = baseStackTA
          ? pushToStack(baseStackTA, ta.entries)
          : initStack(stack.turnPlayerId, ta.entries);
      }
      if (ta.usedHostIds.length > 0) {
        hostAcc = { ...hostAcc, actions_done: [...(hostAcc.actions_done ?? []), ...ta.usedHostIds] };
      }
      if (ta.usedGuestIds.length > 0) {
        guestAcc = { ...guestAcc, actions_done: [...(guestAcc.actions_done ?? []), ...ta.usedGuestIds] };
      }
    }

    if ((result.trapSetOwners?.length ?? 0) > 0) {
      const ts = pureCollectTrapSetTriggers(deps.trigCtx(), entry.playerId, result.trapSetOwners!, hostState, guestState);
      if (ts.entries.length > 0) {
        const baseStackTS = stackAcc ?? null;
        stackAcc = baseStackTS
          ? pushToStack(baseStackTS, ts.entries)
          : initStack(stack.turnPlayerId, ts.entries);
      }
      if (ts.usedHostIds.length > 0) {
        hostAcc = { ...hostAcc, actions_done: [...(hostAcc.actions_done ?? []), ...ts.usedHostIds] };
      }
      if (ts.usedGuestIds.length > 0) {
        guestAcc = { ...guestAcc, actions_done: [...(guestAcc.actions_done ?? []), ...ts.usedGuestIds] };
      }
    }

    // ON_TARGETED（続き137・タスク12(xx)）: targetsTriggerSource/targetsLastProcessed の自動対象化は
    // 選択UIを経ないため handleEffectInteraction の ON_TARGETED 収集を通らない。executeEffect が
    // result.autoTargetedCards として surface した「対戦相手の場のシグニ」を対象に取った瞬間として収集する。
    if ((result.autoTargetedCards?.length ?? 0) > 0) {
      const oppOfSourceId = entry.playerId === bs.host_id ? bs.guest_id : bs.host_id;
      const oppOfSourceAfter = oppOfSourceId === bs.host_id ? hostState : guestState;
      const autoTargetedOpp = result.autoTargetedCards!.filter(n =>
        oppOfSourceAfter.field.signi.some(s => s?.at(-1) === n));
      if (autoTargetedOpp.length > 0) {
        const tt = pureCollectTargetedTriggers(
          deps.trigCtx(),
          autoTargetedOpp, oppOfSourceId, hostState, guestState,
          { cardNum: entry.cardNum, effect: entry.effect },
          bs.host_state, bs.guest_state,
        );
        if (tt.entries.length > 0) {
          const baseStackT = stackAcc ?? null;
          stackAcc = baseStackT
            ? pushToStack(baseStackT, tt.entries)
            : initStack(stack.turnPlayerId, tt.entries);
        }
        if (tt.usedHostIds.length > 0) {
          hostAcc = { ...hostAcc, actions_done: [...(hostAcc.actions_done ?? []), ...tt.usedHostIds] };
        }
        if (tt.usedGuestIds.length > 0) {
          guestAcc = { ...guestAcc, actions_done: [...(guestAcc.actions_done ?? []), ...tt.usedGuestIds] };
        }
      }
    }

    // 🏁§5.3 `O-292`（2026-09-12）＝ここにあった「COLLAB で配置したアシストルリグ自身の【出】を集める」分岐は撤去した。
    //   「コラボライバーを呼ぶ」は**ライバートークンを得るだけ**で、カードは場に出ない（公式 FAQ）。

    // 開花（ON_BLOOM）トリガーは上の detectBloomedSigni / collectBloomTriggers で収集済み。
    // ルール上「開花」は「場に出た」扱いではないため、ここで ON_PLAY（出現時）は発火させない。

    // REVEAL_UNTIL_TO_FIELD の自身【出】も上の opt-in 中央 diff に統合済み。

    // ON_OPP_ARTS_USE: 相手がアーツを使用した場合、自分側の ON_OPP_ARTS_USE トリガーを収集
    // ⚠遅延トリガー（INSTALL_DELAYED_TRIGGER の発火）は除く＝アーツを「使用した」のは設置した時点であって
    //   発火時点ではない。タスク12(lxi) 第6波で entry.cardNum に設置元カード番号を復元した副作用で、
    //   アーツ由来の遅延トリガー6枚（WX11-024／WX24-P1-007／WX25-P3-003／WX26-CP1-003／-005／-009）が
    //   発火のたびに「アーツ使用」を再発火させる二重発火になるため、effectId で弁別して抑止する。
    // §5.3 `O-131`＝収集は `collectOppArtsUseForResolution` の1本（resume 経路と同じ関数を見る）。
    const artsTriggers = deps.collectOppArtsUseForResolution({
      artsOwnerId: entry.playerId, artsCardNum: entry.cardNum, effectId: entry.effectId,
      beforeHost: bs.host_state, beforeGuest: bs.guest_state,
      afterHost: hostState, afterGuest: guestState,
      autoTargetedCards: result.autoTargetedCards,
    });
    if (artsTriggers) {
      const iAmHost = artsTriggers.iAmHost;
      if (artsTriggers.entries.length > 0) {
        const baseStack2 = stackAcc ?? null;
        stackAcc = baseStack2
          ? pushToStack(baseStack2, artsTriggers.entries)
          : initStack(iAmHost ? bs.host_id : bs.guest_id, artsTriggers.entries);
      }
      // 🆕usageLimit（《ターン1回/2回》）を反応側の actions_done へ永続化（ON_ARTS_USE 側と同型）。
      if (artsTriggers.usedIds.length > 0) {
        const baseStOA = iAmHost ? hostAcc : guestAcc;
        const withUsedOA = { ...baseStOA, actions_done: [...(baseStOA.actions_done ?? []), ...artsTriggers.usedIds] };
        if (iAmHost) hostAcc = withUsedOA; else guestAcc = withUsedOA;
      }
    }

    // ON_ARTS_USE: 自分がアーツを使用した場合、使用者自身の ON_ARTS_USE トリガーを収集（ON_SPELL_USE のアーツ版）。
    // 使用者の側を集める（どの client が解決しても＝`artsUseTriggers.ts` 冒頭）。
    // §5.3 `O-131`＝収集は `collectArtsUseForResolution` の1本（resume 経路と同じ関数を見る）。
    const au = deps.collectArtsUseForResolution({
      artsOwnerId: entry.playerId, artsCardNum: entry.cardNum, effectId: entry.effectId,
      afterHost: hostState, afterGuest: guestState,
    });
    if (au) {
      if (au.entries.length > 0) {
        const baseStackAU = stackAcc ?? null;
        stackAcc = baseStackAU
          ? pushToStack(baseStackAU, au.entries)
          : initStack(entry.playerId, au.entries);
        // usageLimit（《ターン1回/2回》）を caster の actions_done に永続化
        if (au.usedIds.length > 0) {
          const baseStAU = au.casterIsHost ? hostAcc : guestAcc;
          const withUsed = { ...baseStAU, actions_done: [...(baseStAU.actions_done ?? []), ...au.usedIds] };
          if (au.casterIsHost) hostAcc = withUsed; else guestAcc = withUsed;
        }
      }
    }

    // FORCE_END_TURN: スタック・エフェクト解決後にターンを即座に終了する
    // 🆕2026-10-23＝**2回目のリフレッシュで手札が上限を超えていれば、ここでは終えない**（手札調整を先に行う）。
    //   スタックは強制終了と同じく捨て、終了はルール処理 `checkRefreshForcedTurnEnd`（捨て札 → 終了）に任せる。
    const activeIsHostRF = bs.active_user_id === bs.host_id;
    if (result.forceEndTurn && refreshForcedEnd && refreshTurnEndDiscardCount(
      activeIsHostRF ? hostState : guestState, activeIsHostRF ? guestState : hostState, deps.cardMap, deps.effectsMap) > 0) {
      stackAcc = null;
    } else if (result.forceEndTurn) {
      const activeIsHost = bs.active_user_id === bs.host_id;
      // §5.3 `O-117`＝盤面処理は `applyForcedTurnEnd` の1本（カットイン経路と同じ関数を見る）。
      const forced = applyForcedTurnEnd(
        activeIsHost ? hostState : guestState,
        activeIsHost ? guestState : hostState,
      );
      // ⚠ ターン強制終了は**それまでの累積を上書きする**（旧 `Object.assign` の後勝ち）。
      //   forced.* は解決直後の hostState/guestState 由来＝累積側ではない。
      if (activeIsHost) { hostAcc = forced.activeAfter; guestAcc = forced.nextAfter; }
      else { guestAcc = forced.activeAfter; hostAcc = forced.nextAfter; }
      stackAcc = null;
      // 🆕§5.6 `C-9` `R-27`＝**追加ターン／相手のスキップが予約されていれば交代しない**（`applyForcedTurnEnd` が判定）。
      forceEndNextTurn = {
        activeUserId: (forced.keepTurn ? bs.active_user_id : (activeIsHost ? bs.guest_id : bs.host_id)) as string,
      };
      logs.push(...['ターンが強制終了されました', ...(forced.log ? [forced.log] : [])]);
    }
  }

  return {
    entryId: entry.id,
    action: {
      type: 'RESOLVE_EFFECT_STEP', hostState: hostAcc, guestState: guestAcc,
      pending: pendingAcc, effectStack: stackAcc, beginNextTurn: forceEndNextTurn,
      // 🆕発動中の効果欄＝解決したのはこのエントリ（盤面の `effect_stack` はもう先頭を外している）。
      lingeringSource: { playerId: entry.playerId, cardNum: entry.cardNum, effectId: entry.effectId },
    },
    logs,
  };
}
