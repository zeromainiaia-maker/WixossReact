import type {PlayerState, CardData, StackEntry, EffectStack, TurnPhase} from '../../../types';
import type {CardEffect, TriggerOriginZone} from '../../../types/effects';
import {calcFieldPowers, calcContinuousBlockedActions, checkActiveCondition, collectEnergyTrashSubstituteInfo, collectHandLimits, collectHandGuardIconClasses, drawPhaseLimitFromBlocked} from '../../../engine/effectEngine';
import {getCardNum, evalUseCondition} from '../../../engine/effectExecutor';
import {resolvePendingExiles} from '../../../engine/execUtils';
import {initStack, pushToStack} from '../../../engine/effectStack';
import {collectAnyZoneTrashSelfTriggers as pureCollectAnyZoneTrashSelfTriggers, collectDrawTriggers as pureCollectDrawTriggers, collectFieldTriggers as pureCollectFieldTriggers, collectTurnTriggers as pureCollectTurnTriggers, isOptionalOwnOnPlayForNormalSummon, isSigniOwnOnPlaySuppressed, onPlayOriginMatches, wrapOptionalOnPlay} from '../../../engine/triggerCollect';
import {resolveTurnEndEnergyTrash} from '../turnEndEnergyTrash';
import {type HandActivateSelections} from '../handActivateCost';
import {cpuOffFieldLedgerKey, pickCpuOffFieldActivated, type CpuOffFieldChoice} from '../cpuOffFieldActivate';
import {applyUpPhaseToField, upPhaseRecipient} from '../upPhase';
import {CPU_PLAYER_ID, CPU_ACTION_DELAY, generateUUID, drawCards} from '../battleUtils';
import {canGrowNow} from '../growLogic';
import {resolveLrigAttackContinuation} from '../attackNegation';
import {clearEndOfTurnDelayedTriggers} from '../delayedTrigger';
import {resolveTurnEndFacedownReturns} from '../../../engine/facedownSigni';
import {resolveNextPhaseWithSkips, resolveNextPhaseAfterAttack, resolveNextPhaseAfterMain, isPhaseSkipped} from '../attackStepPhase';
import {resolveTurnHandover} from '../turnHandover';
import {allZoneBurstGrantMatches, clearAllZoneBurstGrantUntilOppTurn, hasNativeLifeBurst} from '../allZoneBurst';
import {performAssistGrow as performAssistGrowImpl} from './performAssistGrow';
import {performLrigAttack as performLrigAttackImpl} from './performLrigAttack';
import {performLrigActivated as performLrigActivatedImpl} from './performLrigActivated';
import {performSigniActivated as performSigniActivatedImpl} from './performSigniActivated';
import {performSummonSigni as performSummonSigniImpl} from './performSummonSigni';
import {performGuardResponse as performGuardResponseImpl} from './performGuardResponse';
import {performArts as performArtsImpl} from './performArts';
import {performKeyPiece as performKeyPieceImpl} from './performKeyPiece';
import {executeHandActivated as executeHandActivatedImpl, executeTrashActivated as executeTrashActivatedImpl, type OffFieldActor} from './offFieldActivateExec';
import {performSigniAttack as performSigniAttackImpl} from './performSigniAttack';
import {resolvePendingSigniBattleFor as resolvePendingSigniBattleImpl, powerZeroBanishCandidates} from './resolveSigniBattle';
import {makeTrigCtxForPhase} from './execCtxDeps';
import {performLifeBurstResponse as performLifeBurstResponseImpl} from './performLifeBurstResponse';
import {performGrow as performGrowImpl} from './performGrow';
import {performSpell as performSpellImpl} from './performSpell';
import type {PerformCtx} from './performCtx';
import {reduceBattle, type PlayerStateKey} from './battleController';
import {guardableHandIndices} from '../guard';
import {getLrigAttackCrashState} from '../lrigCrash';
import {pickCpuGuardHandIndex} from '../cpuGuard';
import {pickCpuHandLimitDiscards} from '../cpuHandLimit';
import {pickCpuEnergyCharge} from '../cpuEnergyCharge';
import {performEnergyCharge} from './performEnergyCharge';
import {scoreDeploy, type LookaheadCtx} from '../cpuLookahead';
import {buildCpuGrowReserve, chargeNeedColors} from '../cpuGrowReserve';
import {listGrowCandidates} from '../growLogic';
import {cpuPlanBoardCtx, normalizeCpuDeckPlan, planDeployBonus, planKeepBonus, planUseBonus} from '../cpuDeckPlan';
import {clearEndOfAttackPhaseDelayedTriggers} from '../attackDuration';
import {clearTurnGrantedLrigAbilities} from '../grantedAuto';
import {activateNextTurnDeployCountLimit} from '../deployCountLimit';
import {resolveSigniZonePlacement, activateNextTurnSigniZoneBlocks} from '../signiZoneBlock';
import {clearUntilOppTurnEffects} from '../untilOppTurn';
import {clearAttackFieldTrashCosts} from '../attackFieldTrashCost';
import {effectivePowerOf, facingSigniPower, pickCpuAttackZone, pickCpuDeployCard} from '../cpuBoardEval';
import {pickCpuSigniActivated, type CpuActivatedChoice} from '../cpuActivate';
import {pickCpuLrigActivated, type CpuLrigActivatedChoice} from '../cpuLrigActivate';
import {type CpuArtsChoice, type CpuArtsPickInput, pickCpuOffensiveArts, pickCpuResponseArts} from '../cpuArts';
import {pickCpuKeyPiece} from '../cpuKeyPiece';
import {pickCpuMainSpell, type CpuSpellChoice} from '../cpuSpell';
import {searchCpuMove} from '../cpuSearch';
import {type CpuMove, type CpuMoveCtx, cpuArtsInput, cpuDeployBudget, cpuDeployPlaceable, cpuDeployZoneOpen, cpuFieldSigniCap, cpuHandSignis, cpuKeyPieceInput, cpuLrigActivatedInput, cpuOffFieldInput, cpuPlanMoveStep, cpuPaySigniCostEnergy, cpuSigniActivatedInput, cpuSpellInput, cpuSummonBudget, listCpuAssistGrows, listCpuGrows, listCpuMoves, listCpuResonas, listCpuRises} from '../cpuMoves';
import {assistLrigAttackableSlots} from '../assistLrigAttack';
import {activateTurnStartScopedState, clearAttackPhaseScopedState, clearMainPhaseScopedState, clearTurnEndScopedState} from '../turnScopedState';
import {DEFAULT_CPU_POLICY, type CpuPolicy} from '../cpuPolicy';

import type { SummonActorCtx } from './performSummonSigni';

/* eslint-disable @typescript-eslint/no-explicit-any */
type DropLast<T extends unknown[]> = T extends [...infer H, unknown] ? H : T;
/** 画面のラッパ＝実行関数から最後の材料引数（`ctx`）を除いた形（画面の UI コールバックを詰めて呼ぶ）。 */
type ScreenWrapped<F extends (...a: any[]) => any> = (...args: DropLast<Parameters<F>>) => ReturnType<F>;
/* eslint-enable @typescript-eslint/no-explicit-any */

/**
 * CPU が使う**行動の口**＝画面のラッパをそのまま渡す（人間と同じ実行関数・同じ UI コールバック）。
 * ⚠ヘッドレス（`S-5`）は同じ形を `performCtx` 相当と no-op の UI で組み立てる。
 */
export interface CpuTurnActions {
  performSummonSigni: ScreenWrapped<typeof performSummonSigniImpl>;
  performGrow: ScreenWrapped<typeof performGrowImpl>;
  performArts: ScreenWrapped<typeof performArtsImpl>;
  performKeyPiece: ScreenWrapped<typeof performKeyPieceImpl>;
  performAssistGrow: ScreenWrapped<typeof performAssistGrowImpl>;
  performSpell: ScreenWrapped<typeof performSpellImpl>;
  performSigniAttack: ScreenWrapped<typeof performSigniAttackImpl>;
  performLrigAttack: ScreenWrapped<typeof performLrigAttackImpl>;
  performGuardResponse: ScreenWrapped<typeof performGuardResponseImpl>;
  performLifeBurstResponse: ScreenWrapped<typeof performLifeBurstResponseImpl>;
  performSigniActivated: ScreenWrapped<typeof performSigniActivatedImpl>;
  performLrigActivated: ScreenWrapped<typeof performLrigActivatedImpl>;
  resolvePendingSigniBattleFor: ScreenWrapped<typeof resolvePendingSigniBattleImpl>;
  handleCutinPass: () => Promise<void>;
}

/** CPU の1手に要る、画面だけが持つもの。 */
export interface CpuTurnDeps {
  actions: CpuTurnActions;
  /** 画面の props の全カード（⚠`PerformCtx.cards`＝場で使う `battleCards` とは別物）。 */
  allCards: CardData[];
  /** CPU デッキの作戦データ（画面の `cpuPlan`）。 */
  cpuPlan: ReturnType<typeof normalizeCpuDeckPlan>;
  /** パワー0以下のルール処理を今すぐ回す（画面の `checkPowerZeroBanishRef.current`）。 */
  checkPowerZeroBanish: () => Promise<void> | undefined;
  /**
   * 🆕§5.7 `S-9`＝この席の CPU のポリシー（盤面の重み・閾値）。省略時は `DEFAULT_CPU_POLICY`。
   * ⚠**画面（`BattleScreen`）は渡さない**＝実機の挙動は変わらない。渡すのは自己対戦の A/B だけ。
   */
  policy?: CpuPolicy;
  /**
   * 🆕§5.7 `S-15`＝**候補列挙の観測フック**（計測専用）。CPU 自身のターンの `ENERGY`／`GROW`／`MAIN`／`ATTACK_ARTS` で
   * 行動を選ぶ前に `listCpuMoves` の結果を渡す。⚠**画面は渡さない**＝渡さなければ列挙もしない（本番の手数は増えない）。
   */
  observeMoves?: (e: { phase: TurnPhase; moves: CpuMove[]; ms: number; ctx: CpuMoveCtx }) => void;
  /**
   * 🆕§5.7 `S-15`＝**CPU が実際に選んだ手**（`observeMoves` の直後に、同じ盤面で選んだもの）。
   * 🔑**golden が「本番で打った手は必ず列挙に出ている」を照合する口**（列挙の道が1本であることの検査）。
   */
  observeChoice?: (m: CpuMove) => void;
}

// 🆕§5.7 `S-5c` 第3段（2026-09-18）＝CPU の1手（`cpuTurnAction`・1,362行）を `BattleScreen` から**逐語で移設**。
export async function cpuTurnAction(c: PerformCtx, d: CpuTurnDeps): Promise<void> {
  // ── 注入された材料を**画面と同じ名前**で取り出す（下の本体は画面から逐語で移設＝名前を変えない）──
  const { bs, cardMap: battleCardMap, effectsMap, effectivePowers, isHost, cards: battleCards } = c;
  const user = { id: c.userId };
  const persist = { commit: c.io.commit };
  const appendBattleLogs = c.io.appendLogs;
  const mkTrigCtx = c.trigCtx;
  const mkTrigCtxForPhase = makeTrigCtxForPhase({ bs, effectsMap, cardMap: battleCardMap, trigCtx: c.trigCtx });
  const cards = d.allCards;
  const cpuPlan = d.cpuPlan;
  const checkPowerZeroBanishRef = { current: d.checkPowerZeroBanish };
  const {
    performSummonSigni, performGrow, performArts, performKeyPiece, performAssistGrow, performSpell,
    performSigniAttack, performLrigAttack, performGuardResponse, performLifeBurstResponse,
    performSigniActivated, performLrigActivated, resolvePendingSigniBattleFor, handleCutinPass,
  } = d.actions;
  // 画面の派生値（`drawCount`・`useMemo` の `contBlocked`＝**見ている人（人間）基準**）を同じ式で作る。
  const drawCount = bs.turn_count === 1 && bs.active_user_id === bs.first_player_id ? 1 : 2;
  const contBlocked = calcContinuousBlockedActions(
    isHost ? bs.host_state : bs.guest_state, isHost ? bs.guest_state : bs.host_state,
    bs.active_user_id === user.id, effectsMap, battleCardMap, effectivePowers);
  const collectPowerZeroBanishCandidates = (hostState: PlayerState, guestState: PlayerState): string[] =>
    powerZeroBanishCandidates(bs, hostState, guestState, effectsMap, battleCardMap);
  // CPU は常に行為者を渡す＝画面ラッパの「行為者なしなら人間（loading を見る）」の枝は通らない。
  const executeHandActivated = (
    cardNum: string, handIndex: number, effect: CardEffect,
    selections: HandActivateSelections, actorCtx: OffFieldActor,
  ) => executeHandActivatedImpl(cardNum, handIndex, effect, selections, actorCtx, c);
  const executeTrashActivated = (
    cardNum: string, effect: CardEffect, costIndices: Set<number>,
    discardIndices: Set<number> = new Set(), exceedIndices: Set<number> = new Set(),
    trashExileIndices: Set<number> = new Set(), actorCtx: OffFieldActor,
  ) => executeTrashActivatedImpl(cardNum, effect, costIndices, discardIndices, exceedIndices, trashExileIndices, actorCtx, c);

  // ── 画面にあった薄いラッパ（逐語）──
  const collectCpuTurnTriggers = (
    timing: 'ON_TURN_START' | 'ON_TURN_END' | 'ON_ATTACK_PHASE_START' | 'ON_ATTACK_PHASE_END' | 'ON_GROW_PHASE_START' | 'ON_MAIN_PHASE_START' | 'ON_LRIG_ATTACK_STEP_START',
    cpuState: PlayerState,
    humanState: PlayerState,
    /** 🆕遷移「先」のフェイズ（§5.3 `O-72`）。⚠**人間側と同じ引数を渡す**＝写経して片方だけ落とすと
     *  「人間ターンでは発火するのに CPU ターンでは発火しない」無言のズレになる。 */
    enteringPhase?: TurnPhase,
  ): { entries: StackEntry[]; cpuState: PlayerState; humanState?: PlayerState } => {
    const baseCtxCT = enteringPhase
      ? mkTrigCtxForPhase(enteringPhase, cpuState, humanState, true)
      : mkTrigCtx();
    const r = pureCollectTurnTriggers({ ...baseCtxCT, meId: CPU_PLAYER_ID }, timing, cpuState, humanState);
    return {
      entries: r.entries,
      cpuState: r.usedGuestIds.length > 0
        ? { ...cpuState, actions_done: [...(cpuState.actions_done ?? []), ...r.usedGuestIds] }
        : cpuState,
      humanState: r.usedHostIds.length > 0
        ? { ...humanState, actions_done: [...(humanState.actions_done ?? []), ...r.usedHostIds] }
        : undefined,
    };
  };

  const collectFieldTriggers = (
    event: 'ON_PLAY' | 'ON_BANISH' | 'ON_ATTACK_SIGNI' | 'ON_BLOOM',
    triggeringCardNum: string,
    myState: PlayerState,
    opState: PlayerState,
    ownerId: string = user.id, // myState の持ち主（CPU効果収集時はCPU_PLAYER_ID）
    opts?: { placedByEffect?: boolean; placeSourceIsSigni?: boolean; placedFromZone?: TriggerOriginZone; placedFromTrash?: boolean; sideAttack?: boolean },
  ): { entries: StackEntry[]; usedHostIds: string[]; usedGuestIds: string[] } =>
    pureCollectFieldTriggers(mkTrigCtx(), event, triggeringCardNum, myState, opState, ownerId, opts);

  const collectDrawTriggers = (
    drawerId: string,
    drawerState: PlayerState,
    otherState: PlayerState,
    isDrawPhaseDraw = false,
  ): { entries: StackEntry[]; usedOncePerTurnIds: string[] } =>
    pureCollectDrawTriggers(mkTrigCtx(), drawerId, drawerState, otherState, isDrawPhaseDraw);

  const collectAnyZoneTrashSelfTriggers = (trashedCardNum: string, trashedPlayerId: string, causeByOpponent = false, origin: 'hand' | 'energy' | 'under_signi' = 'hand', causeSourceCardNum?: string, byEffectCause = true, ownerState?: PlayerState, otherState?: PlayerState): StackEntry[] =>
    pureCollectAnyZoneTrashSelfTriggers(mkTrigCtx(), trashedCardNum, trashedPlayerId, causeByOpponent, origin, causeSourceCardNum, byEffectCause, ownerState, otherState);

  const matchesAllZoneBurstGrant = (
    cardNum: string,
    ownerState: PlayerState,
    includeTemporary = bs.active_user_id !== user.id,
  ): boolean => {
    return allZoneBurstGrantMatches(cardNum, ownerState, battleCardMap, effectsMap, includeTemporary);
  };
  const effectiveHasBurst = (cardNum: string, ownerState: PlayerState, ownerId: string): boolean => {
    if (hasNativeLifeBurst(cardNum, battleCardMap, effectsMap)) return true;
    return matchesAllZoneBurstGrant(cardNum, ownerState, bs.active_user_id !== ownerId);
  };

  if (!bs || bs.global_phase !== 'PLAYING') return;
  const cpuSt = bs.guest_state;   // CPUは常にguest
  const huSt  = bs.host_state;    // 人間は常にhost
  const isCpuTurnNow = bs.active_user_id === CPU_PLAYER_ID;

  // 人間がライフバースト処理中（チェックゾーンにカードあり）はCPU行動しない
  if (huSt.field?.check) return;

  /**
   * CPU の場のシグニ【起】を1つぶん試す（撃ったら `true`＝呼び出し元は即 return する）。§8／§6.4 `O-1`。
   *
   * ⚠**窓は2つ（`MAIN` の無印【起】／`ATTACK_ARTS` の《アタックフェイズアイコン》付き【起】）だが
   *   通す道は1本**＝窓ごとに書き分けると、片方だけに条件を足したときに気付けない。
   * ⚠**判定は `signiActivateGate`・実行は `performSigniActivated`＝どちらも人間と同じ関数**
   *   （DESIGN §4）。CPU 専用の判定/実行をここに書かない。
   * ⚠1回の呼び出しで**1つだけ**撃つ＝スタック解決（対象選択の自動応答を含む）を待ってから次を選ぶ。
   */
  // ── 🆕§5.6 `C-5`/`C-6`＝CPU のアシストグロウ・レゾナ・ライズ ────────────────────────────────
  // 🔑**3本とも「可否＝人間と同じ関数」「実行＝人間と同じ関数」「CPU は通った候補から1つ選ぶだけ」**（§5.6.3）。
  //   ⚠**安全弁**＝実行より先に `cpu_used_card_nums_this_turn` へ札を刻む（実行側が黙って return しても同じ札を選び直さない）。
  //   🔴**印は実行の前に単独でコミットする**（スペルと同じ）＝実行側が黙って return すると印ごと失われ、
  //   ログだけが増えて同じ札を選び直し続ける。
  const cpuMarkUsed = async (s: PlayerState, cardNum: string): Promise<PlayerState> => {
    const marked: PlayerState = { ...s, cpu_used_card_nums_this_turn: [...(s.cpu_used_card_nums_this_turn ?? []), cardNum] };
    await persist.commit(reduceBattle(bs, { type: 'WRITE_STATE', myKey: 'guest_state', myState: marked }));
    return marked;
  };
  /** CPU の召喚文脈（人間の `handleSummonSigni` が memo 値で渡すものを、CPU の盤面から同じ式で作る）。 */
  const cpuSummonCtx = (s: PlayerState): SummonActorCtx => ({
    ...cpuSummonBudget(cpuMoveCtx(s), s),
    actor: s, opponent: huSt, actorId: CPU_PLAYER_ID, actorKey: 'guest_state', isActorTurn: true,
    costOnPlay: 'skip',
  });
  // 🆕§5.7 `S-15`＝候補の列挙は `cpuMoves.ts`（探索と本番で同じ道）。ここは「選んで実行する」だけ。
  const cpuMoveCtx = (actorState: PlayerState): CpuMoveCtx => ({
    actor: actorState, opponent: huSt, allCards: cards, battleCards, cardMap: battleCardMap, effectsMap,
    lookahead: cpuLookahead, reserveFor: cpuGrowReserveFor,
    // 🆕§5.7 `S-31` ②＝手札を捨てるコストで「どれを捨てるか」（作戦データの札と【ガード】は最後）。
    planKeepBonus: id => planKeepBonus(cpuPlan, id, cpuPolicy), policy: cpuPolicy,
  });
  const tryCpuAssistGrow = async (actorState: PlayerState): Promise<boolean> => {
    const m = listCpuAssistGrows(cpuMoveCtx(actorState))[0];
    if (!m) return false;
    d.observeChoice?.(m);
    const { card, side, costIndices, pool } = m;
    appendBattleLogs([`[CPU] アシストグロウ: ${card.CardName}（Lv.${card.Level}・${side === 'l' ? '左' : '右'}）`]);
    await performAssistGrow(card, side, costIndices, {
      owner: await cpuMarkUsed(actorState, card.CardNum), other: huSt,
      ownerId: CPU_PLAYER_ID, ownerKey: 'guest_state', energyPayPool: pool,
    });
    return true;
  };
  const tryCpuResona = async (actorState: PlayerState): Promise<boolean> => {
    if (bs.pending_spell) return false;
    const m = listCpuResonas(cpuMoveCtx(actorState))[0];
    if (!m) return false;
    d.observeChoice?.(m);
    const sc = cpuSummonCtx(actorState);
    appendBattleLogs([`[CPU] レゾナ: ${m.card.CardName}（ゾーン${m.zone + 1}）`]);
    await performSummonSigni(-1, m.zone, { candidate: m.candidate, selection: m.selection }, undefined, { ...sc, actor: await cpuMarkUsed(actorState, m.card.CardNum) });
    return true;
  };
  const tryCpuRise = async (actorState: PlayerState): Promise<boolean> => {
    const m = listCpuRises(cpuMoveCtx(actorState))[0];
    if (!m) return false;
    d.observeChoice?.(m);
    const sc = cpuSummonCtx(actorState);
    appendBattleLogs([`[CPU] ライズ: ${m.card.CardName}（ゾーン${m.zone + 1}）`]);
    await performSummonSigni(m.handIndex, m.zone, undefined, m.selection, { ...sc, actor: await cpuMarkUsed(actorState, m.card.CardNum) });
    return true;
  };
  const tryCpuSigniActivated = async (
    actorState: PlayerState,
    phase: 'MAIN' | 'ATTACK_ARTS',
    /** 🆕§5.7 `S-16`＝探索が選んだ手（渡されたらここでは選ばない）。 */
    preset?: CpuActivatedChoice,
  ): Promise<boolean> => {
    const input = cpuSigniActivatedInput(cpuMoveCtx(actorState), phase);
    const pool = input.pool;
    const choice = preset ?? pickCpuSigniActivated(input);
    if (!choice) return false;
    d.observeChoice?.({ kind: 'activate', choice, pool, phase });
    appendBattleLogs([`[CPU] 【起】を発動: ${battleCardMap.get(choice.cardNum)?.CardName ?? choice.cardNum}`]);
    // ⚠**安全弁＝実行より先に「撃った」履歴を確定させる**。`performSigniActivated` は
    //   支払い不能を検出すると**何も書かずに return** するので、履歴を実行の成否に委ねると
    //   CPU が同じ効果を選び直して無限ループになる（＝画面が止まる）。
    const actActor: PlayerState = {
      ...actorState,
      cpu_activated_effect_ids_this_turn: [
        ...(actorState.cpu_activated_effect_ids_this_turn ?? []), choice.effect.effectId,
      ],
    };
    await persist.commit(reduceBattle(bs, { type: 'WRITE_STATE', myKey: 'guest_state', myState: actActor }));
    await performSigniActivated(choice.cardNum, choice.effect, {
      // 🆕§5.7 `S-31` ②＝手札を捨てるコストも CPU が払う（旧は空＝そのコストを持つ【起】は撃てなかった）。
      costIndices: choice.costIndices, discardCostIndices: choice.discardIndices,
    }, {
      actor: actActor, opponent: huSt,
      actorId: CPU_PLAYER_ID, opponentId: bs.host_id,
      actorKey: 'guest_state',
      energyPayPool: pool,
      energyTrashSubInfo: collectEnergyTrashSubstituteInfo(actorState, battleCardMap, effectsMap),
    });
    return true;
  };

  /**
   * CPU のセンタールリグ【起】を1つぶん試す（撃ったら `true`＝呼び出し元は即 return する）。§8 `O-1` (c)。
   *
   * ⚠**判定は `lrigActivateGate`・実行は `performLrigActivated`＝どちらも人間と同じ関数**（DESIGN §4）。
   * ⚠台帳（`cpu_activated_effect_ids_this_turn`）は**シグニ【起】と共通**＝effectId は型を跨いで衝突しない。
   */
  const tryCpuLrigActivated = async (
    actorState: PlayerState,
    phase: 'MAIN' | 'ATTACK_ARTS',
    preset?: CpuLrigActivatedChoice,
  ): Promise<boolean> => {
    const input = cpuLrigActivatedInput(cpuMoveCtx(actorState), phase);
    const pool = input.pool;
    const choice = preset ?? pickCpuLrigActivated(input);
    if (!choice) return false;
    d.observeChoice?.({ kind: 'lrigActivate', choice, pool, phase });
    const lrigName = battleCardMap.get(actorState.field.lrig.at(-1) ?? '')?.CardName ?? 'ルリグ';
    appendBattleLogs([`[CPU] ルリグの【起】を発動: ${lrigName}`]);
    // ⚠安全弁＝実行より先に「撃った」履歴を確定させる（シグニ【起】と同じ理由）。
    const actActor: PlayerState = {
      ...actorState,
      cpu_activated_effect_ids_this_turn: [
        ...(actorState.cpu_activated_effect_ids_this_turn ?? []), choice.effect.effectId,
      ],
    };
    await persist.commit(reduceBattle(bs, { type: 'WRITE_STATE', myKey: 'guest_state', myState: actActor }));
    await performLrigActivated(choice.effect, { costIndices: choice.costIndices }, {
      actor: actActor, opponent: huSt,
      actorId: CPU_PLAYER_ID, actorKey: 'guest_state',
      energyPayPool: pool,
    });
    return true;
  };

  /**
   * 🆕§5.6 `C-7`＝CPU のキー配置／ピース使用を1枚ぶん試す（使ったら `true`＝呼び出し元は即 return する）。
   * ⚠**判定は `keyPieceUseGate`・実行は `performKeyPiece`＝どちらも人間と同じ関数**（§5.6.3）。
   * ⚠**安全弁**＝実行より先に `cpu_used_card_nums_this_turn` へ札を刻む（`performKeyPiece` は使用条件の再検算で黙って return しうる）。
   * ⚠ピースのカットイン窓（人間が打ち消しピースを持つとき）は `pending_spell`（caster＝CPU）で止まり、上の早期 return が受ける。
   */
  const tryCpuKeyPiece = async (actorState: PlayerState, turnPhase: 'MAIN' | 'ATTACK_ARTS'): Promise<boolean> => {
    if (bs.pending_spell) return false;
    const input = cpuKeyPieceInput(cpuMoveCtx(actorState), turnPhase);
    const payer = input.payer;
    const choice = pickCpuKeyPiece(input);
    if (!choice) return false;
    d.observeChoice?.({ kind: 'piece', choice, pool: payer.energyPayPool });
    // ⚠文言は `census:play` の契約（anchor は `[CPU] ピース:` / `[CPU] キー:` をそのまま含むこと）。
    appendBattleLogs([choice.check.isPiece ? `[CPU] ピース: ${choice.card.CardName}` : `[CPU] キー: ${choice.card.CardName}`]);
    await performKeyPiece(choice.card, choice.costIndices, {
      actor: await cpuMarkUsed(actorState, choice.card.CardNum), opponent: huSt,
      actorId: CPU_PLAYER_ID, actorKey: 'guest_state', isActorTurn: true,
      energyPayPool: payer.energyPayPool, coinNeeded: choice.check.coinNeeded,
    });
    return true;
  };

  /**
   * 🆕§5.7 `S-7`＝CPU の**場以外の【起】**（トラッシュ／手札／エナ）を1つぶん試す（撃ったら `true`）。
   * ⚠**判定は `listOffFieldActivatableEffects`・実行は `executeTrashActivated`／`executeHandActivated`＝どちらも人間と同じ関数**（§5.6.3）。
   * ⚠**安全弁**＝実行より先に台帳（`cpu_activated_effect_ids_this_turn`）へ刻む（実行側は支払い不能で黙って return しうる）。
   *   キーは `effectId@instance`＝トラッシュに同名が2枚あれば2枚とも使える（回数制限の無い【起】）。
   */
  const tryCpuOffFieldActivated = async (
    actorState: PlayerState, phase: 'MAIN' | 'ATTACK_ARTS' | 'ATTACK_ARTS_OP',
    preset?: CpuOffFieldChoice,
  ): Promise<boolean> => {
    // 🆕`ATTACK_ARTS_OP`＝人間のターンのアーツステップ（CPU は非ターンプレイヤー）＝手札の《アタックフェイズアイコン》【起】で応答する。
    const input = cpuOffFieldInput(cpuMoveCtx(actorState), phase);
    const pool = input.pool;
    const choice = preset ?? pickCpuOffFieldActivated(input);
    if (!choice) return false;
    if (phase !== 'ATTACK_ARTS_OP') d.observeChoice?.({ kind: 'offFieldActivate', choice, pool, phase });
    const zoneJa = choice.zone === 'trash' ? 'トラッシュ' : choice.zone === 'hand' ? '手札' : 'エナゾーン';
    // ⚠文言は `census:play` の契約（anchor＝`の【起】を発動: `）。
    appendBattleLogs([`[CPU] ${zoneJa}の【起】を発動: ${battleCardMap.get(choice.cardNum)?.CardName ?? choice.cardNum}`]);
    const actActor: PlayerState = {
      ...actorState,
      cpu_activated_effect_ids_this_turn: [
        ...(actorState.cpu_activated_effect_ids_this_turn ?? []), cpuOffFieldLedgerKey(choice.effect.effectId, choice.cardNum),
      ],
    };
    await persist.commit(reduceBattle(bs, { type: 'WRITE_STATE', myKey: 'guest_state', myState: actActor }));
    const actorCtx = {
      actor: actActor, opponent: huSt, actorId: CPU_PLAYER_ID, opponentId: bs.host_id,
      actorKey: 'guest_state' as const, energyPayPool: pool,
    };
    if (choice.zone === 'hand') {
      await executeHandActivated(choice.cardNum, choice.handIndex, choice.effect, { energy: choice.selections.energy, fieldTrash: choice.fieldTrash }, actorCtx);
    } else {
      const sel = choice.selections;
      await executeTrashActivated(choice.cardNum, choice.effect, sel.energy, sel.handDiscard, sel.exceed, sel.trashExile, actorCtx);
    }
    return true;
  };

  /**
   * CPU のアーツ使用を1枚ぶん試す（使ったら `true`＝呼び出し元は即 return する）。§8／§6.4 `O-1` (a)(b)。
   *
   * ⚠**窓は3つ（相手ターンの応答／自ターンの MAIN／自ターンの ATTACK_ARTS）だが通す道は1本**。
   *   窓ごとに書き分けると、片方だけに条件を足したときに気付けない。
   * ⚠**判定は `artsUseGate`・実行は `performArts`＝どちらも人間と同じ関数**（DESIGN §4）。
   *   CPU 専用の判定/実行をここに書かない＝軸がずれると人間には見えないアーツを CPU だけが
   *   使える（またはその逆）という無言のズレになる。
   * ⚠1回の呼び出しで**1枚だけ**使う＝スタック解決（対象選択の自動応答を含む）を待ってから次を選ぶ。
   */
  // 🆕§5.7 `S-4`＝浅い先読み（盤面をコピーして engine だけで効果を解決し、結果の盤面を採点する）。
  //   召喚（【出】の結果）・スペル（使うか・どれを使うか）・攻めのアーツ（候補のうちどれか）で使う。本番の盤面には書かない。
  // 🆕§5.7 `S-9`＝席ごとのポリシー（無ければ既定）＝盤面の採点・閾値はここから流す。
  const cpuPolicy = d.policy ?? DEFAULT_CPU_POLICY;
  const cpuLookahead: LookaheadCtx = {
    cardMap: battleCardMap,
    effectsOf: id => effectsMap.get(id) ?? [],
    powersOf: (c, o) => calcFieldPowers(c, o, true, effectsMap, battleCardMap, 'MAIN'),
    turnPhase: 'MAIN',
    policy: cpuPolicy,
    // 🆕§5.7 `S-18`＝**次のグロウのコストをいま払えるか**（判定は人間の支払いと同じ `cpuGrowReserve`）。
    //   ⚠グロウ先が1枚も無ければ `undefined`＝加点も減点もしない。
    canPayNextGrow: st => {
      const reserve = cpuGrowReserveFor(st);
      return reserve ? reserve.keepsAfter(st.energy) : undefined;
    },
  };
  // 🆕**グロウ用エナの予約**（ユーザー指示・2026-09-17）＝アーツ・スペル・【起】・キー／ピース・アシストグロウ・召喚コストで
  //   エナを払った残りで、次のグロウ先のどれかを払えないなら、その支払いはしない（`cpuGrowReserve.ts`）。
  const cpuGrowReserveFor = (actorState: PlayerState) =>
    buildCpuGrowReserve({ actor: actorState, opponent: huSt, cardMap: battleCardMap, effectsMap, cards });
  const tryCpuUseArts = async (
    actorState: PlayerState,
    turnPhase: TurnPhase,
    pick: (p: CpuArtsPickInput) => CpuArtsChoice | null,
    preset?: CpuArtsChoice,
  ): Promise<boolean> => {
    const isActorTurn = turnPhase !== 'ATTACK_ARTS_OP';
    const input = cpuArtsInput(cpuMoveCtx(actorState), turnPhase);
    const payer = input.payer;
    const choice = preset ?? pick(input);
    if (!choice) return false;
    if (isActorTurn) d.observeChoice?.({ kind: 'arts', choice: { card: choice.card, check: choice.check, kinds: [choice.kind], costIndices: choice.costIndices }, pool: payer.energyPayPool, turnPhase });
    appendBattleLogs([`[CPU] アーツを使用: ${choice.card.CardName}`]);
    // ⚠**安全弁＝実行より先に「使った」履歴を確定させる**。`performArts` は使用不能を検出すると
    //   **何も書かずに return** するので、履歴を実行の成否に委ねると CPU が同じ札を選び直して
    //   その窓から先へ進まなくなる（＝画面が止まる）。
    const artsActor: PlayerState = {
      ...actorState,
      cpu_used_card_nums_this_turn: [...(actorState.cpu_used_card_nums_this_turn ?? []), choice.card.CardNum],
    };
    await persist.commit(reduceBattle(bs, { type: 'WRITE_STATE', myKey: 'guest_state', myState: artsActor }));
    await performArts(choice.card, { costIndices: choice.costIndices }, {
      actor: artsActor, opponent: huSt,
      actorId: CPU_PLAYER_ID, actorKey: 'guest_state',
      isActorTurn,
      energyPayPool: payer.energyPayPool,
      energyTrashSubInfo: payer.energyTrashSubInfo,
      blockedSelf: payer.blockedSelf,
      enaAllMulti: payer.enaAllMulti,
      enaMultiStripped: payer.enaMultiStripped,
    });
    return true;
  };

  /**
   * CPU がメインフェイズにスペルを1枚使う（使ったら `true`）。🆕§5.7 `S-15`／`S-16`＝
   * **選ぶ**（`pickCpuMainSpell`）と**実行**（人間と同じ `performSpell`）を分け、**探索が選んだ手**も同じ口から流す。
   */
  const tryCpuMainSpell = async (actorState: PlayerState, preset?: CpuSpellChoice): Promise<boolean> => {
    const input = cpuSpellInput(cpuMoveCtx(actorState), !!bs.pending_spell);
    const payer = input.payer;
    const choice = preset ?? pickCpuMainSpell(input);
    if (!choice) return false;
    d.observeChoice?.({ kind: 'spell', choice, pool: payer.energyPayPool });
    appendBattleLogs([`[CPU] スペルを発動: ${choice.card.CardName}`]);
    // ⚠アーツと同じ安全弁＝実行より先に「使った」履歴を確定させる（`performSpell` は
    //   使用不能を検出すると何も書かずに return するので、履歴を実行の成否に委ねると
    //   CPU が同じ札を選び直して MAIN から先へ進まなくなる）。
    const spellActor: PlayerState = {
      ...actorState,
      cpu_used_card_nums_this_turn: [...(actorState.cpu_used_card_nums_this_turn ?? []), choice.card.CardNum],
    };
    await persist.commit(reduceBattle(bs, { type: 'WRITE_STATE', myKey: 'guest_state', myState: spellActor }));
    await performSpell(choice.card, {
      costIndices: choice.costIndices, handIdx: choice.handIndex,
    }, {
      actor: spellActor, opponent: huSt,
      actorId: CPU_PLAYER_ID, actorKey: 'guest_state',
      isActorTurn: true,
      energyPayPool: payer.energyPayPool,
      blockedSelf: payer.blockedSelf,
      enaAllMulti: payer.enaAllMulti,
      enaMultiStripped: payer.enaMultiStripped,
    });
    return true;
  };

  /**
   * 🆕§5.7 `S-16`＝**探索が選んだ1手を、本番の実行関数へ流す**（`applyCpuMove` の本番側）。
   * 🔴**実行は人間と同じ `perform*` の1本**（§5.6.3）＝探索用の `applyCpuMoveSim`（engine だけの近似）とは別物で、
   *   **打つのはこちらが正**。⚠**列挙は共通**（`listCpuMoves`）＝「探索では出たのに本番で出ない手」を作らない。
   * ⚠召喚（`deploy`）はメインの召喚ループが扱う（ゾーンの徴収・【出】の収集がそこにある）＝ここでは受けない。
   */
  const doCpuSearchedMove = async (actorState: PlayerState, move: CpuMove, phase: 'MAIN' | 'ATTACK_ARTS'): Promise<boolean> => {
    switch (move.kind) {
      case 'activate': return tryCpuSigniActivated(actorState, phase, move.choice);
      case 'lrigActivate': return tryCpuLrigActivated(actorState, phase, move.choice);
      case 'offFieldActivate': return tryCpuOffFieldActivated(actorState, phase, move.choice);
      case 'arts': return tryCpuUseArts(actorState, phase, pickCpuOffensiveArts,
        { card: move.choice.card, check: move.choice.check, kind: move.choice.kinds[0] ?? 'removal', costIndices: move.choice.costIndices });
      case 'spell': return tryCpuMainSpell(actorState, move.choice);
      default: return false;
    }
  };

  // ─── ライフバースト確認（チェックゾーンのカードを処理）───
  if (cpuSt.field?.check) {
    const cardNum = cpuSt.field.check;
    const burstCard = battleCardMap.get(cardNum);
    // LIFE_BURST効果があれば発動する（対人戦と同じ共通処理：ON_LIFE_CRASHED・CRASH_TO_TRASH_INSTEADを含む）
    // WD14-001: 付与された【ライフバースト】も含めて判定
    const hasBurst = effectiveHasBurst(cardNum, cpuSt, CPU_PLAYER_ID);
    appendBattleLogs([`[CPU] ライフクロスをオープン: ${burstCard?.CardName ?? cardNum}${hasBurst ? '（ライフバースト発動）' : '（ライフバーストなし）'}`]);
    await performLifeBurstResponse(hasBurst, undefined, {
      owner: cpuSt, opponent: huSt,
      ownerId: CPU_PLAYER_ID, ownerKey: 'guest_state',
    });
    return;
  }

  // ─── ダブルクラッシュ等の同時クラッシュ予約を順次checkへ（人間側のtriggerPendingCrash相当）───
  if ((cpuSt.pending_crashed_cards?.length ?? 0) > 0 && !bs.effect_stack && !bs.pending_effect) {
    const [nextCard, ...remaining] = cpuSt.pending_crashed_cards!;
    const [nextSource, ...remainingSources] = cpuSt.pending_crash_source_card_nums ?? [];
    appendBattleLogs([`[CPU] 同時クラッシュ：ライフクロスをクラッシュ（${battleCardMap.get(nextCard)?.CardName ?? nextCard}）`]);
    await persist.commit(reduceBattle(bs, {
      type: 'WRITE_STATE', myKey: 'guest_state',
      myState: { ...cpuSt, pending_crashed_cards: remaining, pending_crash_source_card_nums: remainingSources,
        crash_source_card_num: nextSource ?? undefined, field: { ...cpuSt.field, check: nextCard } },
    }));
    return;
  }

  // ─── CPUのON_ATTACK_LRIG処理完了後のガード応答セット（pending_lrig_attack）───
  if (cpuSt.pending_lrig_attack && !bs.effect_stack && !bs.pending_effect) {
    // ⚠人間経路（`resolvePendingLrigAttack`）と**同じ関数**を通す（意味照合 段2・`WXDi-P09-036-E1`）。
    const contCpuLA = resolveLrigAttackContinuation(cpuSt, huSt);
    if (contCpuLA.cancelled) appendBattleLogs(['[CPU] ルリグのアタックは無効化された']);
    await persist.commit(reduceBattle(bs, { type: 'WRITE_STATE', myKey: 'guest_state', myState: contCpuLA.attacker, opp: { key: 'host_state', state: contCpuLA.defender } }));
    return;
  }

  // ─── CPUのpending_signi_battle（ON_ATTACK_SIGNI処理完了後のバトル解決）───
  if (cpuSt.pending_signi_battle && !bs.effect_stack && !bs.pending_effect) {
    // バトルはすべての処理が完了してから行う。パワー0以下バニッシュ対象が残っている
    // 場合は先にバニッシュさせる（state更新でCPUドライバが再実行され、その後バトル解決される）。
    if (collectPowerZeroBanishCandidates(bs.host_state, bs.guest_state).length > 0) {
      await checkPowerZeroBanishRef.current?.();
      return;
    }
    await resolvePendingSigniBattleFor(cpuSt, huSt, 'guest_state', CPU_PLAYER_ID, bs.host_id);
    return;
  }

  // ─── ルリグアタックのガード応答（CPUがlrig_attackedされている）───
  if (cpuSt.field?.lrig_attacked) {
    // 🆕§5.6 `C-2`＝**CPU もガードする**。候補は人間のダイアログと同じ `guardableHandIndices`、
    //   選ぶのは `pickCpuGuardHandIndex`、実行は人間と同じ `performGuardResponse`
    //   （各種ダメージ無効・ダブルクラッシュ・敗北無効・MULTI_DAMAGE再アタックを含む）。
    const cpuGuardCandidates = guardableHandIndices({
      responder: cpuSt, attacker: huSt, cardMap: battleCardMap, effectsMap,
      contBlockedForSelf: calcContinuousBlockedActions(cpuSt, huSt, false, effectsMap, battleCardMap).forSelf,
      handGuardClasses: collectHandGuardIconClasses(cpuSt, battleCardMap, effectsMap, huSt, false),
    });
    const cpuAttackingLrig = cpuSt.lrig_attacked_by_num ?? huSt.field.lrig.at(-1);
    const cpuGuardIdx = pickCpuGuardHandIndex({
      candidates: cpuGuardCandidates, hand: cpuSt.hand, cardMap: battleCardMap,
      lifeCount: cpuSt.life_cloth.length,
      // 🔑§5.6 `C-9` `R-06`＝見積りと解決で**同じ関数**を使う（写経すると CPU の判断だけがズレる）。
      incomingCrushCount: getLrigAttackCrashState(cpuAttackingLrig, huSt, cpuSt, battleCardMap, effectsMap).crashCount,
    });
    appendBattleLogs([cpuGuardIdx === null
      ? `[CPU] ガードしない`
      : `[CPU] ガードする（${battleCardMap.get(cpuSt.hand[cpuGuardIdx])?.CardName ?? cpuSt.hand[cpuGuardIdx]}）`]);
    await performGuardResponse(cpuGuardIdx, {
      responder: cpuSt, attacker: huSt,
      responderId: CPU_PLAYER_ID, attackerId: bs.host_id,
      responderKey: 'guest_state',
    });
    return;
  }

  // ─── スペルカットインパス（人間のスペルに対してCPUは常にパス）───
  if (bs.pending_spell && bs.pending_spell.caster_id !== CPU_PLAYER_ID) {
    // 対人戦と同じ共通処理（NEGATE_SPELL打ち消し・ON_SPELL_USEトリガーを含む）でスペルを解決
    await handleCutinPass();
    return;
  }
  // ─── CPU 自身が使ったスペルの解決待ち（§8／§6.4 O-1 (b)）───
  // ⚠**人間のカットイン応答を待つ**（`CutinModal` は `caster_id !== user.id` のときに出る）。
  //   ここで待たないと CPU が窓を無視してフェイズを進めてしまう＝スペルが宙に浮く。
  if (bs.pending_spell && bs.pending_spell.caster_id === CPU_PLAYER_ID) return;

  // ─── ATTACK_ARTS_OPフェイズ：CPUが非ターンプレイヤー＝応答アーツの窓 ───
  // ※ このチェックは !isCpuTurnNow の早期リターンより前に置く必要がある
  if (bs.turn_phase === 'ATTACK_ARTS_OP' && !isCpuTurnNow) {
    // ── §8／§6.4 O-1 (a): CPU が人間のアタックフェイズに応答アーツで守る ──────────
    if (await tryCpuUseArts(cpuSt, 'ATTACK_ARTS_OP', pickCpuResponseArts)) return;
    // 🆕§5.7 `S-7`＝手札の《アタックフェイズアイコン》【起】で応答する（判定・実行は人間と同じ・先読みで得なものだけ）。
    if (await tryCpuOffFieldActivated(cpuSt, 'ATTACK_ARTS_OP')) return;
    appendBattleLogs(['[CPU] アーツを使用しない']);
    await persist.commit(reduceBattle(bs, { type: 'SET_TURN_PHASE', phase: resolveNextPhaseWithSkips('ATTACK_ARTS_OP', huSt, contBlocked.forSelf) }));
    return;
  }

  // ─── パワー0以下シグニのバニッシュ（バースト後パワーダウンで発生）───
  // useEffectのチェックはCPUターン中（active_user_id !== user.id）をスキップするためここで補完
  if (!bs.effect_stack && !bs.pending_effect) {
    const isCpuHostLocal = bs.active_user_id === bs.host_id;
    const powersCpu = calcFieldPowers(bs.host_state, bs.guest_state, isCpuHostLocal, effectsMap, battleCardMap, bs.turn_phase);
    const hasPowerZero = [bs.host_state, bs.guest_state].some(st =>
      st.field.signi.some(stack => {
        if (!stack?.length) return false;
        const topNum = stack[stack.length - 1];
        const rawPower = battleCardMap.get(topNum)?.Power;
        const power = powersCpu.get(topNum) ?? (rawPower === '∞' ? Infinity : parseInt(rawPower ?? '0', 10));
        return !isNaN(power) && power <= 0;
      })
    );
    if (hasPowerZero) {
      await checkPowerZeroBanishRef.current?.();
      return;
    }
  }

  if (!isCpuTurnNow) return;

  const phase = bs.turn_phase;

  // 🆕§5.7 `S-15`＝候補数の実測フック（渡したときだけ・盤面には書かない）。`S-16` のビーム幅を決める材料。
  const observeMovesAt = (s: PlayerState) => {
    if (!d.observeMoves) return;
    const moveCtx = cpuMoveCtx(s);
    const t0 = performance.now();
    const moves = listCpuMoves(moveCtx, phase, { pendingSpell: !!bs.pending_spell });
    d.observeMoves({ phase, moves, ms: performance.now() - t0, ctx: moveCtx });
  };
  // 🆕§5.7 `S-17` 第1段（2026-09-20）＝**アタックの2フェイズも観測する**＝
  //   これで `S-15` の「打った手は必ず列挙に出ている」の全数照合が**アタックにも掛かる**。
  if (phase === 'ENERGY' || phase === 'GROW' || phase === 'MAIN' || phase === 'ATTACK_ARTS'
    || phase === 'ATTACK_SIGNI' || phase === 'ATTACK_LRIG') observeMovesAt(cpuSt);

  // §6.4 O-3（フェイズスキップ）＝CPU 側も人間と同じ `PHASE_SKIP_BLOCK_IDS` 表で判定する。
  // ⚠**CONTINUOUS 由来の封じ（`WX05-018-E1` の「対戦相手は自分のエナフェイズをスキップする」等）は
  //   `blocked_actions` に載らない**ので、`calcContinuousBlockedActions(...).forSelf` を必ず渡す。
  const cpuContBlockedSelf = calcContinuousBlockedActions(cpuSt, huSt, true, effectsMap, battleCardMap).forSelf;
  /** CPU 視点の遷移先（スキップされるフェイズを飛ばす）。 */
  const cpuNextPhase = (from: TurnPhase) => resolveNextPhaseWithSkips(from, cpuSt, cpuContBlockedSelf);

  // ─── UPフェイズ（ドロー）───
  if (phase === 'UP') {
    // ⚠**ドロー上限は人間側と同じ funnel を通す**（2026-08-19 続き567）＝`DRAW_LIMIT_<n>` は
    //   「すべてのプレイヤーは…1枚しか引けない」（`WX04-005-E2`）なので、片側だけだと CPU だけ2枚引く。
    //   📋`collectDrawLimits`（`LIMIT_OPP_DRAW_COUNT`）と `draw_limit` は CPU 側では従来から未適用＝別の穴（§7 送り）。
    const cpuDrawCount = Math.min(drawCount, drawPhaseLimitFromBlocked(cpuContBlockedSelf) ?? drawCount);
    appendBattleLogs([`[CPU] ${cpuDrawCount}枚ドロー`]);
    const cpuPreventRefresh = cpuSt.field.signi.some(s => {
      const top = s?.at(-1);
      return top && (effectsMap.get(top) ?? []).some(e =>
        e.effectType === 'CONTINUOUS' &&
        (e.action as import('../../../types/effects').StubAction).type === 'STUB' &&
        (e.action as import('../../../types/effects').StubAction).id === 'PREVENT_LIFE_REFRESH_TRASH',
      );
    });
    // ⚠人間経路（UP→DRAW）と**同じ前処理**に揃える（タスク12(xcviii)）：
    //   ①ターン開始スコープの funnel＝リフレッシュ回数・出自履歴・無料グロウ予約を一括切替。
    //     従来 CPU 側は refresh_count を一度もリセットしていなかったため、
    //     ゲーム中に累計2回リフレッシュした以降は「ターンプレイヤーの2回目リフレッシュならターン終了」
    //     （`resolveStackNext` の判定）が**CPU ターンで毎回成立**してしまう。
    //   ②`last_effect_draw_source: undefined`＝ターンドローは「効果ドロー」ではないので、直後の ON_DRAW 収集で
    //     `drawBySourceStory` トリガー（`WX20-026-E3`）が前ターンの残値で誤発火しないようにする。
    let newCpuSt: PlayerState = {
      ...drawCards(activateTurnStartScopedState(cpuSt), cpuDrawCount, cpuPreventRefresh),
      actions_done: ['DRAW'], last_effect_draw_source: undefined,
    };
    if ((newCpuSt.refresh_count_this_turn ?? 0) > 0) appendBattleLogs(['[CPU] リフレッシュ（デッキを再構築）']);
    // UPKEEP_OR_NO_UP: CPUは支払えるなら自動で支払いセンタールリグをアップする
    if (newCpuSt.lrig_upkeep_condition) {
      const payCountCpu = newCpuSt.lrig_upkeep_condition === 'pay_colorless3' ? 3 : 1;
      if (newCpuSt.energy.length >= payCountCpu) {
        const paidCpu = newCpuSt.energy.slice(-payCountCpu);
        newCpuSt = { ...newCpuSt, energy: newCpuSt.energy.slice(0, -payCountCpu), trash: [...newCpuSt.trash, ...paidCpu],
          lrig_upkeep_condition: undefined, field: { ...newCpuSt.field, lrig_down: false } };
        appendBattleLogs([`[CPU] センタールリグのアップ条件：《無》×${payCountCpu}を支払いアップ`]);
      } else if (newCpuSt.lrig_upkeep_condition === 'discard_or_colorless1' && newCpuSt.hand.length > 0) {
        const discardedCpu = newCpuSt.hand.slice(0, 1);
        newCpuSt = { ...newCpuSt, hand: newCpuSt.hand.slice(1), trash: [...newCpuSt.trash, ...discardedCpu],
          lrig_upkeep_condition: undefined, field: { ...newCpuSt.field, lrig_down: false } };
        appendBattleLogs(['[CPU] センタールリグのアップ条件：手札を1枚捨ててアップ']);
      } else {
        newCpuSt = { ...newCpuSt, lrig_upkeep_condition: undefined };
        appendBattleLogs(['[CPU] センタールリグのアップ条件（未払い）→ダウン状態でターン開始']);
      }
    }
    // ON_TURN_START（タスク12(lxvii)）＝人間ターンの UP→DRAW と同じ位置で収集する。
    const tsCpu = collectCpuTurnTriggers('ON_TURN_START', newCpuSt, huSt);
    const upEntries = [...tsCpu.entries];
    let cpuAfterUp = tsCpu.cpuState;
    // ON_DRAW（タスク12(xcviii)）＝人間経路は同じ位置で `collectDrawTriggers(..., isDrawPhaseDraw=true)` を
    // 呼ぶが、**CPU 経路には無かった**＝live 13効果／13カードが CPU のターン開始ドローで発火しない。
    // ⚠効果ドローは中央 diff ブロック（`resolveStackNext`）が両プレイヤー分を拾うので、**穴はターンドローだけ**。
    if (drawCount > 0) {
      const dtCpu = collectDrawTriggers(bs.active_user_id ?? CPU_PLAYER_ID, cpuAfterUp, huSt, true);
      upEntries.push(...dtCpu.entries);
      if (dtCpu.usedOncePerTurnIds.length > 0) {
        cpuAfterUp = { ...cpuAfterUp, actions_done: [...(cpuAfterUp.actions_done ?? []), ...dtCpu.usedOncePerTurnIds] };
      }
    }
    await persist.commit(reduceBattle(bs, {
      type: 'ADVANCE_TURN_WITH_STATE', playerKey: 'guest_state', playerState: cpuAfterUp, phase: 'DRAW',
      opp: tsCpu.humanState ? { key: 'host_state', state: tsCpu.humanState } : undefined,
      effectStack: upEntries.length > 0
        ? (bs.effect_stack ? pushToStack(bs.effect_stack, upEntries) : initStack(bs.active_user_id ?? CPU_PLAYER_ID, upEntries))
        : undefined,
    }));
    return;
  }

  // ─── DRAWフェイズ → ENERGYへ ───
  if (phase === 'DRAW') {
    await persist.commit(reduceBattle(bs, { type: 'SET_TURN_PHASE', phase: 'ENERGY' }));
    return;
  }

  // ─── ENERGYフェイズ：手札の先頭1枚をエナチャージ ───
  if (phase === 'ENERGY') {
    let cpuAtGrowStart = cpuSt;
    const used    = cpuSt.actions_done?.includes('ENERGY') ?? false;
    // §6.4 O-3: 「エナフェイズをスキップする」（`WX05-018-E1`）＝人間側はフェイズごと飛ばすが、
    // CPU 経路はフェイズ内の唯一の行動（エナチャージ）を行わないことで同じ結果にする
    // （`ON_GROW_PHASE_START` の収集はこのハンドラ内にあるため、飛ばすと開始時トリガーごと落ちる）。
    const blocked = (cpuSt.blocked_actions?.includes('ENERGY') ?? false)
      || isPhaseSkipped('ENERGY', cpuSt, cpuContBlockedSelf);
    if (blocked) appendBattleLogs(['[CPU] エナフェイズをスキップする']);
    if (!used && !blocked && cpuSt.hand.length > 0) {
      // 🆕§5.7 `S-1`＝旧「手札の先頭1枚」固定をやめ、**強さ（パワー＋効果の点数）の低い札**をエナへ（【ガード】は最後）。
      const cpuLrigLevelEna = parseInt(battleCardMap.get(cpuSt.field.lrig.at(-1) ?? '')?.Level ?? '0', 10) || 0;
      // 🆕§5.7 `S-26`（2026-09-21）＝**ターンをまたいだ情報**を渡す＝
      //   ①**次のグロウでまだ足りない色**（置きに行く） ②**空きシグニゾーンの数**（出せる札を温存する）。
      //   🔴**これが無いと「グロウできない」「出す札が無い」が繰り返し起きる**（実測＝7% と 22%）。
      // 🔴🔑**「このターンのグロウ」を見ても遅い**（2026-09-21 実測で分かった）＝失敗した3件は**全部**
      //   「**今回は無料／払える** ⇒ 要る色は空 ⇒ 無色をチャージ ⇒ **次のターン**に《白》が要って払えない」だった。
      //   ⇒ **1回グロウしたあとの盤面**で足りない色を見る（＝ユーザーの言う「ターンをまたいだ考え」）。
      //   ⚠**いまのグロウが払えないなら、そちらが先**（2手先より目先）。
      const chargeCtx = {
        needColors: chargeNeedColors(cpuMoveCtx(cpuSt), cards),
        emptyZones: cpuSt.field.signi.filter(stk => !(stk ?? []).length).length,
      };
      // 🆕🔴§5.7 `S-28`（2026-09-21）＝**手札だけでなく場のシグニも候補にする**（人間は前から出来た）。
      const chargeSource = pickCpuEnergyCharge({
        actor: cpuSt, opponent: huSt, cardMap: battleCardMap, effectsOf: id => effectsMap.get(id) ?? [],
        lrigLevel: cpuLrigLevelEna, keepBonus: id => planKeepBonus(cpuPlan, id, cpuPolicy), policy: cpuPolicy, charge: chargeCtx,
        powers: Object.fromEntries(calcFieldPowers(cpuSt, huSt, true, effectsMap, battleCardMap, 'ENERGY')),
      });
      if (!chargeSource) return;
      const charged = chargeSource.from === 'hand' ? cpuSt.hand[chargeSource.handIndex] : cpuSt.field.signi[chargeSource.zone]!.at(-1)!;
      d.observeChoice?.(chargeSource.from === 'hand'
        ? { kind: 'energy', from: 'hand', handIndex: chargeSource.handIndex, id: charged }
        : { kind: 'energy', from: 'field', zone: chargeSource.zone, id: charged });
      // 🔴**実行は人間と同じ `performEnergyCharge` の1本**（§5.6.3）＝旧はここが第3の写経で、
      //   **相手の「エナチャージの色制限」を CPU だけが無視していた**（人間はトラッシュ送りになる）。
      const chargeRes = performEnergyCharge(cpuSt, huSt, chargeSource, battleCardMap, effectsMap, '[CPU] ');
      // ⚠**`[CPU] エナチャージ: <名前>` は `census:play` の規則 `enaCharge` の契約**＝必ず出す。
      //   `performEnergyCharge` の行は**場から置いた回**と**色制限でトラッシュへ行った回**だけ足す（同じ内容を2度書かない）。
      appendBattleLogs([`[CPU] エナチャージ: ${battleCardMap.get(charged)?.CardName ?? charged}`,
        // 🔴**この文言は literal で書く**＝`census:play` の規則 `enaChargeField` の anchor を
        //   golden `§5.6 C-3` が**ソースに literal で残っているか**で検査する（合成すると黙って0件になる）。
        ...(chargeSource.from === 'field' ? [`[CPU] エナチャージ（場のシグニ: ${battleCardMap.get(charged)?.CardName ?? charged}）`] : []),
        ...(chargeRes.toTrash ? chargeRes.logs : [])]);
      const newCpuSt: PlayerState = chargeRes.state;
      cpuAtGrowStart = newCpuSt;
      await persist.commit(reduceBattle(bs, { type: 'WRITE_STATE', myKey: 'guest_state', myState: newCpuSt }));
      // 少し待ってGROWへ進む
      await new Promise(r => setTimeout(r, CPU_ACTION_DELAY));
    }
    // CPU側も人間側の ENERGY→GROW と同じ pure collector を使用する。
    const gpsCpu = pureCollectTurnTriggers({ ...mkTrigCtx(), meId: CPU_PLAYER_ID }, 'ON_GROW_PHASE_START', cpuAtGrowStart, huSt);
    const cpuAfterGps: PlayerState = gpsCpu.usedGuestIds.length > 0
      ? { ...cpuAtGrowStart, actions_done: [...(cpuAtGrowStart.actions_done ?? []), ...gpsCpu.usedGuestIds] }
      : cpuAtGrowStart;
    const humanAfterGps: PlayerState | undefined = gpsCpu.usedHostIds.length > 0
      ? { ...huSt, actions_done: [...(huSt.actions_done ?? []), ...gpsCpu.usedHostIds] }
      : undefined;
    const gpsStack = gpsCpu.entries.length > 0
      ? (bs.effect_stack ? pushToStack(bs.effect_stack, gpsCpu.entries) : initStack(bs.active_user_id ?? CPU_PLAYER_ID, gpsCpu.entries))
      : undefined;
    await persist.commit(reduceBattle(bs, {
      type: 'ADVANCE_TURN_WITH_STATE', phase: 'GROW', playerKey: 'guest_state', playerState: cpuAfterGps,
      opp: humanAfterGps ? { key: 'host_state', state: humanAfterGps } : undefined,
      effectStack: gpsStack, // トリガー無し（undefined）ならスタックは不干渉
    }));
    return;
  }

  // ─── GROWフェイズ：グロウ可能なら最初の候補でグロウ ───
  // ⚠**判定は `growLogic.listGrowCandidates`・実行は `performGrow`＝どちらも人間と同じ関数**
  //   （DESIGN §4・§8 `O-1` (d)）。従来ここには**約150行の手書き再実装**があり、
  //   `GROW_COST_SUBSTITUTE_TRASH_SIGNI`／グロウ色制限／`GROW_FROM_LEVEL0`／
  //   コピー元ルリグの【出】（`collectCopiedLrigAutoEffects`）／`SUPPRESS_CENTER_ON_PLAY` などを
  //   取りこぼしていた（＝人間ターンとだけ挙動が違う）。
  if (phase === 'GROW') {
    const cpuContBlockedGrow = calcContinuousBlockedActions(cpuSt, huSt, true, effectsMap, battleCardMap).forSelf;
    if (canGrowNow(cpuSt, cpuContBlockedGrow)) {
      // 候補は人間と同じ gate。コストは**払える1枚目**を選ぶ（決定論・盤面評価はしない）。
      // 🆕§5.7 `S-15`＝列挙は `listCpuGrows`（探索と同じ道）。
      const cpuGrowMove = listCpuGrows(cpuMoveCtx(cpuSt))[0];
      // 🆕🔴§5.7 `S-26`（2026-09-21）＝**グロウ先はあるのにエナで払えなかった**ことをログに出す。
      //   🔑**「グロウしないことがかなりの悪手」**（ユーザー）なのに、**この失敗はどの計器にも映っていなかった**
      //   （盤面も勝敗も静かに悪くなるだけ）。⚠文言は `census:play` の規則 `growUnpayable` の契約。
      if (!cpuGrowMove && listGrowCandidates({ my: cpuSt, cardMap: battleCardMap, effectsMap }).length > 0) {
        appendBattleLogs([`[CPU] グロウできない（エナ不足）: エナ${cpuSt.energy.length}枚`]);
      }
      if (cpuGrowMove) {
        d.observeChoice?.(cpuGrowMove);
        const { card: growCard, costIndices, pool: cpuGrowPool } = cpuGrowMove;
        appendBattleLogs([`[CPU] グロウ: ${growCard.CardName}（Lv.${growCard.Level}）`]);
        await performGrow(growCard, costIndices, {}, {
          actor: cpuSt, opponent: huSt,
          actorId: CPU_PLAYER_ID, opponentId: bs.host_id,
          actorKey: 'guest_state',
          isActorTurn: true,
          energyPayPool: cpuGrowPool,
          // ⚠CPU にモーダルは出せない＝コインだけで払える任意【出】は自動で払う。
          onCostOnPlay: 'auto',
        });
        return;   // グロウで state が動く＝次の再実行で MAIN へ進む
      }
    }

    // ON_MAIN_PHASE_START（タスク12(lxvii)）＝人間ターンの GROW→MAIN と同じ位置で収集する。
    // `triggerScope:any_opp`（「対戦相手のメインフェイズ開始時」）は人間側の場から拾われる＝
    // **CPU ターンだけ人間の【自】が不発**という非対称もここで解消する。
    // ⚠§6.4 O-3: メインフェイズがスキップされているなら**開始時トリガーごと収集しない**
    //   （人間側は「遷移先で判定する」ことで同じ結果になる）。
    const mpsCpu = isPhaseSkipped('MAIN', cpuSt, cpuContBlockedSelf)
      ? { cpuState: cpuSt, humanState: undefined as PlayerState | undefined, entries: [] as StackEntry[] }
      : collectCpuTurnTriggers('ON_MAIN_PHASE_START', cpuSt, huSt);
    // §6.4 O-3: 「次のあなたのメインフェイズまで」の予約はここで失効させる（人間経路と同じ1点）。
    const cpuAtMainStart = clearMainPhaseScopedState(mpsCpu.cpuState);
    await persist.commit(reduceBattle(bs, {
      type: 'ADVANCE_TURN_WITH_STATE', playerKey: 'guest_state', playerState: cpuAtMainStart, phase: 'MAIN',
      opp: mpsCpu.humanState ? { key: 'host_state', state: mpsCpu.humanState } : undefined,
      effectStack: mpsCpu.entries.length > 0
        ? (bs.effect_stack ? pushToStack(bs.effect_stack, mpsCpu.entries) : initStack(bs.active_user_id ?? CPU_PLAYER_ID, mpsCpu.entries))
        : undefined,
    }));
    return;
  }

  // ─── MAINフェイズ：シグニを手札から召喚（空きゾーンに1枚ずつ）───
  if (phase === 'MAIN') {
    // 🔴旧＝`turn_count === 1` でメインフェイズごと END へ飛ばしていた＝**CPU が先攻の1ターン目（ルリグ Lv1）に
    //   シグニを1体も出さなかった**（ユーザー報告）。公式ルール `R-23` で飛ばすのは**アタックフェイズだけ**
    //   ＝メインフェイズは通常どおり行い、出口（下の `resolveNextPhaseAfterMain`）で END へ進む。
    // §6.4 O-3: メインフェイズがスキップされている（`WXEX2-19-E3`）なら**召喚を1体も行わず**
    // 下の MAIN→アタックフェイズ遷移へ落ちる（`ON_ATTACK_PHASE_START` の収集はそちらが行う）。
    const cpuMainSkipped = isPhaseSkipped('MAIN', cpuSt, cpuContBlockedSelf);
    if (cpuMainSkipped) appendBattleLogs(['[CPU] メインフェイズをスキップする']);
    // 🆕§5.7 `S-15`＝枠・手札のシグニ・ゾーンの可否・コストの支払いは `cpuMoves.ts`（探索の列挙と同じ関数）。
    const cpuDeployMoveCtx = cpuMoveCtx(cpuSt);
    const { lrigLevel: cpuLrigLevel, limit: cpuLimit, fieldTotal: cpuFieldTotal0 } = cpuDeployBudget(cpuDeployMoveCtx, cpuSt);
    // 現在のフィールドのシグニの合計レベル
    let fieldTotal = cpuFieldTotal0;

    // 手札のシグニ（**順序はここで決めない**）。
    // 🔴**旧実装は「レベル昇順」で並べて「入る最初の1枚」**＝リミットが余っていてもわざと弱い札から出しており、
    //   強い札が一生手札で腐っていた。§8 `O-1` (g) で**盤面評価（`pickCpuDeployCard`）**へ置き換えた＝
    //   「残りゾーンを埋められる範囲でいちばん強い札」を選ぶ。⚠**手札の並び順に依存しない**ように、
    //   ここでのソートは**同点解決のための安定順（手札順）だけ**にする。
    const handSignis = cpuHandSignis(cpuDeployMoveCtx, cpuSt);

    /**
     * 🆕§5.7 `S-16`＝**メインフェイズをビーム探索で決める**（ポリシーの数値で入切・**既定 0＝従来の優先順**）。
     * 🔑**1回の呼び出しで1手**＝打つと盤面が動いて再入するので、そこでまた探索し直す（＝ドローで増えた選択肢が入る）。
     * ⚠**探索が扱えない手**（アシストグロウ・レゾナ・ライズ・キー／ピース）は**従来の優先順のまま**下で処理する。
     * ⚠**エナチャージは探索の担当ではない**（`ENERGY` フェイズ＝「置くか」ではなく「どれを置くか」の判断）。
     */
    const cpuSearchOn = cpuPolicy.searchWidth > 0 && cpuPolicy.searchDepth > 0 && !cpuMainSkipped;
    let cpuSearchedDeploy: Extract<CpuMove, { kind: 'deploy' }> | null = null;
    /** 🆕§5.7 `S-16`＝探索が選んだ召喚を置いたか（置いたら**その場で return**＝再入してまた探索する）。 */
    let cpuSearchDeployed = false;
    if (cpuSearchOn) {
      const searched = searchCpuMove(cpuMoveCtx(cpuSt), 'MAIN', {
        width: cpuPolicy.searchWidth, depth: cpuPolicy.searchDepth, pendingSpell: !!bs.pending_spell,
        // 🆕§5.7 `S-21`＝「行動する」側への下駄（既定 0＝従来どおり）。
        actionBias: cpuPolicy.actionBias,
        // 🆕🔴§5.7 `S-14`（2026-09-21）＝**作戦データ（`S-2`）を探索にも効かせる**。
        //   🔴`S-25` で既定を「探索あり」へ上げた瞬間、召喚を決めるのが下の `pickCpuDeployCard`
        //   （`planDeployBonus` を足す側）から探索へ移り、**`priorityCards` と `combos` が黙って効かなくなっていた**。
        //   🆕**コンボの「使い方」（`S-14` 第2段）＝【起】・アーツ・スペルもここで加点する**
        //   （探索は既定なので、`activate` を含むコンボはこの口でしか効かない）。
        //   ⚠**加点の式は1本**＝ここも下の `pickCpuDeployCard` も同じ `planUseBonus`／`planDeployBonus` を呼ぶ。
        moveBonus: (mv, board) => {
          const step = cpuPlanMoveStep(mv, board.cpu);
          if (!step) return 0;
          return planUseBonus(cpuPlan, step.num, step.use, cpuPlanBoardCtx(board.cpu), cpuPolicy);
        },
      });
      if (searched.move && searched.move.kind !== 'deploy') {
        // 🔴**実行は人間と同じ `perform*`**（`doCpuSearchedMove`）＝探索用の近似適用では打たない。
        if (await doCpuSearchedMove(cpuSt, searched.move, 'MAIN')) return;
      }
      cpuSearchedDeploy = searched.move?.kind === 'deploy' ? searched.move : null;
    }

    let newCpuSt = { ...cpuSt };
    // 配置したシグニの【出】/ON_PLAYトリガー（対人戦handleSummonSigniと同じ収集）
    const cpuOnPlayEntries: StackEntry[] = [];
    // 人間（host）側 watcher の usageLimit 消費を畳み込む作業用（huSt と異なれば host_state も併せて保存する）
    let cpuHuSt: PlayerState = huSt;
    // LIMIT_ALL_FIELD_N（シグニ場出し数の上限）と DEPLOY_RESTRICT（配置数制限）の小さい方＝`cpuFieldSigniCap`
    // （上限計算は `engine/deployLimit.ts` に一本化＝人間UI・engine の効果配置と同じ関数＝続き405）。
    const cpuFieldSigniLimit = cpuFieldSigniCap(cpuDeployMoveCtx, newCpuSt);

    for (let zone = 0; !cpuMainSkipped && zone < 3; zone++) {
      // 🆕§5.7 `S-16`＝探索が有効なら、**探索が選んだゾーンだけ**（選ばなかったターンは1体も置かない）。
      if (cpuSearchOn && cpuSearchedDeploy?.zone !== zone) continue;
      if ((newCpuSt.field.signi[zone] ?? []).length > 0) continue; // ゾーン埋まってる
      if (handSignis.length === 0) break;
      // 場出し数上限に達していたら召喚しない
      if (newCpuSt.field.signi.filter(stk => (stk ?? []).length > 0).length >= cpuFieldSigniLimit) break;
      // 正面強制（FORCE_PLACE_FRONT）・配置禁止ゾーン（《無》回避つきは払えるときだけ・徴収はシグニコスト確定後）。
      if (!cpuDeployZoneOpen(cpuDeployMoveCtx, newCpuSt, zone, cpuFieldSigniLimit)) continue;

      // 召喚できるシグニ（リミット内 かつ シグニLv ≤ ルリグLv かつ 配置制限を満たす）。
      // ⚠【ライズ】は外す（§5.3 `O-147`＝CPU のライズは `tryCpuRise`）。
      // ⚠**可否（ここ）と選択（`pickCpuDeployCard`）を分ける**＝可否は人間と同じ gate 群が権威。
      const placeable = cpuDeployPlaceable(cpuDeployMoveCtx, newCpuSt, zone, handSignis,
        { lrigLevel: cpuLrigLevel, limit: cpuLimit, fieldTotal });
      // §8 `O-1` (g)＝盤面評価で1枚選ぶ。**残ゾーン数**は「この先まだ空いていて置けるゾーンの数」＝
      // 上限（`cpuFieldSigniLimit`）で頭打ちにする（取り置きが過剰にならないように）。
      const emptyZonesAhead = newCpuSt.field.signi
        .filter((stk, zi) => zi >= zone && (stk ?? []).length === 0).length;
      const placedCount = newCpuSt.field.signi.filter(stk => (stk ?? []).length > 0).length;
      // 🆕§5.7 `S-16`＝探索が選んだ札（無効なら従来の盤面評価＝`pickCpuDeployCard`）。
      const pickedId = cpuSearchedDeploy ? cpuSearchedDeploy.id : pickCpuDeployCard({
        candidates: placeable.map(({ id, card }) => ({
          id,
          level: parseInt(card!.Level) || 0,
          power: card!.Power === '∞' ? Infinity : (parseInt(card!.Power ?? '', 10) || 0),
          // §5.7 `S-1`＝パワーだけでなく効果の強さでも比べる（【出】の除去を持つ低パワーの札を後回しにしない）。
          // §5.7 `S-4b`＝このゾーンに出して【出】を解決した**結果の盤面の点数**（先読み）＋ `S-2` 作戦データの加点。
          value: scoreDeploy(id, zone, newCpuSt, cpuHuSt, cpuLookahead)
            + planDeployBonus(cpuPlan, id, handSignis.map(h => h.id),
              [...newCpuSt.field.signi.map(stk => stk?.at(-1) ?? ''), ...newCpuSt.field.lrig].filter(Boolean), cpuPolicy),
          guard: card!.Guard === '1',
        })),
        handGuardCount: handSignis.filter(({ card }) => card?.Guard === '1').length,
        keepGuards: cpuPolicy.keepGuards,
        remainingLimit: cpuLimit - fieldTotal,
        zonesRemaining: Math.max(1, Math.min(emptyZonesAhead, cpuFieldSigniLimit - placedCount)),
      });
      const candidate = placeable.find(c => c.id === pickedId);
      if (!candidate) break;

      // エナ支払い（シグニのコスト）。ゾーン配置禁止の《無》回避コストと合わせて成立を確かめてから
      // 一括で newCpuSt へ反映する（片方だけ払って置けない＝エナの取りこぼしを作らない）。
      // 🆕グロウ用エナの予約＝払った残りで次のグロウが払えないなら、この札は出さない（`cpuPaySigniCostEnergy`）。
      const cpuPaidEnergy = cpuPaySigniCostEnergy(cpuDeployMoveCtx, newCpuSt, candidate.card!);
      if (!cpuPaidEnergy) {
        handSignis.splice(handSignis.indexOf(candidate), 1);
        continue;
      }
      const cpuStAfterCost = cpuPaidEnergy === newCpuSt.energy ? newCpuSt : { ...newCpuSt, energy: cpuPaidEnergy };
      // ゾーン配置禁止の《無》回避コストを徴収する。シグニコスト支払い後のエナで再検証し、
      // 足りなくなっていたらこのゾーンには置かない（エナは減らさない）。
      const cpuZonePay = resolveSigniZonePlacement(cpuStAfterCost, zone);
      if (!cpuZonePay.allowed) continue;
      if (cpuZonePay.paidColorless > 0) {
        appendBattleLogs([`[CPU] シグニゾーン${zone + 1}への配置コスト《無》×${cpuZonePay.paidColorless}を支払う`]);
      }
      newCpuSt = cpuZonePay.state;

      // 観測は1体目だけ（2体目以降は観測した盤面から動いている）。
      if (newCpuSt.field.signi.every((stk, zi) => zi === zone || (stk ?? []).length === (cpuSt.field.signi[zi] ?? []).length)) {
        d.observeChoice?.({ kind: 'deploy', handIndex: candidate.idx, id: candidate.id, zone });
      }
      appendBattleLogs([`[CPU] シグニ配置: ${candidate.card!.CardName}（ゾーン${zone + 1}）`]);
      const newSigni = [...newCpuSt.field.signi] as (string[] | null)[];
      newSigni[zone] = [candidate.id];
      newCpuSt = {
        ...newCpuSt,
        signi_played_from_non_hand_this_turn: (newCpuSt.signi_played_from_non_hand_this_turn ?? []).filter(n => n !== candidate.id),
        hand: newCpuSt.hand.filter(id => id !== candidate.id),
        field: { ...newCpuSt.field, signi: newSigni },
      };
      const lv = parseInt(candidate.card!.Level) || 0;
      fieldTotal += lv;
      handSignis.splice(handSignis.indexOf(candidate), 1);

      // 【出】/ON_PLAYトリガー収集（コスト付き任意【出】はCPUは発動しない＝mandatory:falseを除外）
      const cpuOwnOnPlayBlocked = isSigniOwnOnPlaySuppressed(
        candidate.id, newCpuSt, huSt, true, effectsMap, battleCardMap,
      );
      const ownOnPlayCpu = (cpuOwnOnPlayBlocked ? [] : effectsMap.get(candidate.id) ?? []).filter(e =>
        e.effectType === 'AUTO' &&
        e.timing?.includes('ON_PLAY') &&
        // self/未指定に加え、'any'（「シグニが場に出たとき」=自身も含む。G085）も自身召喚時に発火
        (e.triggerScope === undefined || e.triggerScope === 'self' || e.triggerScope === 'any') &&
        e.mandatory !== false &&
        // byEffect/bySigniEffect:「（シグニの）効果によって場に出たとき」限定は通常召喚では発火しない
        !e.triggerCondition?.byEffect && !e.triggerCondition?.bySigniEffect &&
        onPlayOriginMatches(e, 'hand') &&
        // activeCondition（英知=N等）を満たさない【出】は発火しない
        (!e.activeCondition || checkActiveCondition(e.activeCondition, newCpuSt, huSt, true, battleCardMap, candidate.id)),
      );
      cpuOnPlayEntries.push(...ownOnPlayCpu.map(eff => ({
        id: generateUUID(),
        playerId: CPU_PLAYER_ID,
        cardNum: candidate.id,
        effectId: eff.effectId,
        label: `${candidate.card!.CardName} の【出】/【自】効果`,
        effect: eff,
      } satisfies StackEntry)));
      // 任意・無コストの自身【出】（「〜してもよい」）＝**人間の通常召喚（`handleSummonSigni`）と同じ収集**へ揃える
      // （タスク12(lv)③）。従来は mandatory だけを積んでいたため、**CPU の場では一度も発火しなかった**（過小実行）。
      // ⚠方針＝**無コストに限る**。コスト付き任意【出】は従来どおり発動しない＝踏み倒しも過剰支払いも作らない
      //   （COLLAB で起きた「mandatory 判定なしで全 ON_PLAY を無条件に積む」過剰実行の再発を避ける）。
      //   engine の `OPTIONAL_ACTIVATE` は「発動する／発動しない」の CHOOSE を出し、CPU 自動応答は先頭
      //   （＝発動する）を選ぶ＝「**CPU は無コストの任意【出】を必ず発動する**」という明示方針になる。
      const optionalNoCostCpu = (cpuOwnOnPlayBlocked ? [] : effectsMap.get(candidate.id) ?? []).filter(e =>
        isOptionalOwnOnPlayForNormalSummon(e) && !e.cost &&
        (!e.activeCondition || checkActiveCondition(e.activeCondition, newCpuSt, huSt, true, battleCardMap, candidate.id)) &&
        (!e.condition || evalUseCondition(e.condition, newCpuSt, huSt, battleCardMap, candidate.id, bs.turn_phase)),
      );
      for (const effOpt of optionalNoCostCpu) {
        // `costUnparsed` 等で包めないものは従来どおり発火させない（踏み倒し防止の安全弁をそのまま使う）。
        const wrappedCpu = wrapOptionalOnPlay(effOpt);
        if (!wrappedCpu) continue;
        cpuOnPlayEntries.push({
          id: generateUUID(),
          playerId: CPU_PLAYER_ID,
          cardNum: candidate.id,
          effectId: effOpt.effectId,
          label: `${candidate.card!.CardName} の任意【出】効果`,
          effect: wrappedCpu,
        } satisfies StackEntry);
      }
      const cpuFt = collectFieldTriggers('ON_PLAY', candidate.id, newCpuSt, cpuHuSt, CPU_PLAYER_ID, { placedFromZone: 'hand' });
      cpuOnPlayEntries.push(...cpuFt.entries);
      // usageLimit（《ターン1回/2回》）消費を actions_done へ永続化（CPU=guest／人間=host）。
      // 畳み込んだ状態を次ループの収集に渡すことで、同一ターンに複数体召喚しても《ターン1回》は1度だけ発火する（続き135）。
      if (cpuFt.usedGuestIds.length > 0) newCpuSt = { ...newCpuSt, actions_done: [...(newCpuSt.actions_done ?? []), ...cpuFt.usedGuestIds] };
      if (cpuFt.usedHostIds.length > 0) cpuHuSt = { ...cpuHuSt, actions_done: [...(cpuHuSt.actions_done ?? []), ...cpuFt.usedHostIds] };

      // 1枚ずつSupabaseを更新して画面に反映させてから次へ
      await persist.commit(reduceBattle(bs, { type: 'WRITE_STATE', myKey: 'guest_state', myState: newCpuSt, opp: cpuHuSt !== huSt ? { key: 'host_state', state: cpuHuSt } : undefined }));
      await new Promise(r => setTimeout(r, CPU_ACTION_DELAY));
      // 🔴**【出】（と相手側の誘発）は、出したシグニごとに解決してから次のシグニを出す**（ユーザーのバグ報告・2026-09-17）。
      //   旧＝ループの最後までためて一括で積んでいた＝「Ｒ・Ｆ・Ｒ を出す → Ｓ・Ｃ を出す → Ｒ・Ｆ・Ｒ の【出】」の順になり、
      //   【出】で引いた札を次の召喚に使えない／【出】の対象に後から出したシグニが入る、という順序違いになっていた。
      //   ⇒ 誘発が1つでもあればここで止め、下でスタックに積んで return。解決後にメインフェイズが再実行され、残りのゾーンを埋める。
      if (cpuOnPlayEntries.length > 0) break;
      // 🆕§5.7 `S-16`＝探索は**1回の呼び出しで1手**（次の1手は再入して探索し直す）。
      // 🔴**`break` だけで下へ落とさない**＝落とすとそのまま MAIN が終わり、**1ターンに1体しか出せない**
      //   （2026-09-20 実測＝シグニ配置が 62 → 38 に減っていた真因）。
      if (cpuSearchOn) { cpuSearchDeployed = true; break; }
    }

    // 🆕§5.7 `S-16`＝探索が選んだ召喚を置いた＝ここで一旦返す（再入してまた探索する）。
    //   ⚠【出】があるときは下の push が受ける（そちらが先）。
    if (cpuSearchDeployed && cpuOnPlayEntries.length === 0) return;
    // 配置で【出】トリガーが発生した場合はスタックに積んで解決を待つ（MAINに留まり、解決後の再実行で先へ進む）
    if (cpuOnPlayEntries.length > 0) {
      const existingStackOP = bs.effect_stack ?? null;
      const newStackOP = existingStackOP
        ? pushToStack(existingStackOP, cpuOnPlayEntries)
        : initStack(bs.active_user_id ?? CPU_PLAYER_ID, cpuOnPlayEntries);
      await persist.commit(reduceBattle(bs, { type: 'SET_STACK', stack: newStackOP }));
      return;
    }

    // ⚠召喚ループは**同じ呼び出しのまま**下の候補へ進む＝置いたあとの盤面で観測し直す（`S-15` の照合が別の盤面同士を比べない）。
    if (newCpuSt.field.signi.some((stk, zi) => (stk ?? []).length !== (cpuSt.field.signi[zi] ?? []).length)) observeMovesAt(newCpuSt);
    // 🆕§5.6 `C-5`/`C-6`＝アシストグロウ → レゾナ → ライズ（どれも1回ごとに state が動く＝再実行で次へ進む）。
    if (!cpuMainSkipped && cpuHuSt === huSt && await tryCpuAssistGrow(newCpuSt)) return;
    if (!cpuMainSkipped && cpuHuSt === huSt && await tryCpuResona(newCpuSt)) return;
    if (!cpuMainSkipped && cpuHuSt === huSt && await tryCpuRise(newCpuSt)) return;
    // 🆕§5.6 `C-7`＝キー → ピース（1回ごとに state が動く＝再実行で次へ進む）。
    if (!cpuMainSkipped && cpuHuSt === huSt && await tryCpuKeyPiece(newCpuSt, 'MAIN')) return;

    // ── §8／§6.4 O-1: CPU がメインフェイズに場のシグニの【起】を能動使用する ──────────
    // ⚠`cpuHuSt` が書き換わっている間は撃たない＝`performSigniActivated` は相手 state を
    //   ウィルス除去時しか書かないので、ここで撃つと配置で積んだ人間側の変更を取りこぼす。
    if (!cpuSearchOn && !cpuMainSkipped && cpuHuSt === huSt
      && await tryCpuSigniActivated(newCpuSt, 'MAIN')) return;
    // §8／§6.4 O-1 (c)＝センタールリグの【起】（live 492効果がメイン窓）。
    if (!cpuSearchOn && !cpuMainSkipped && cpuHuSt === huSt
      && await tryCpuLrigActivated(newCpuSt, 'MAIN')) return;
    // 🆕§5.7 `S-7`＝トラッシュ／手札／エナの【起】（`WD08-009` ほか・人間と同じ判定と実行関数）。
    if (!cpuSearchOn && !cpuMainSkipped && cpuHuSt === huSt
      && await tryCpuOffFieldActivated(newCpuSt, 'MAIN')) return;

    // ── §8／§6.4 O-1 (b): CPU がメインフェイズに攻めのアーツ／スペル（＝除去）を使う ──────────
    // ⚠`cpuHuSt` が書き換わっている間は使わない＝`performArts`／`performSpell` は相手 state を
    //   書かないので、ここで使うと配置で積んだ人間側の変更を取りこぼす（【起】と同じ理由）。
    if (!cpuSearchOn && !cpuMainSkipped && cpuHuSt === huSt) {
      if (await tryCpuUseArts(newCpuSt, 'MAIN', pickCpuOffensiveArts)) return;
      // スペルは1枚使うと `pending_spell`（人間のカットイン窓）で止まる＝上の早期 return が受ける。
      if (await tryCpuMainSpell(newCpuSt)) return;
    }

    // ── MAIN→ATTACK_ARTS 移行（アタックフェイズ開始時）。以下のトリガーを1つのスタックに集約し、
    //    フェイズを ATTACK_ARTS へ進めながら積む（MAIN に留まると再実行で無限収集になるため）。
    const cpuTurnPlayerId = bs.active_user_id ?? CPU_PLAYER_ID;
    const apsStackEntries: StackEntry[] = [];
    // §6.4 O-3: アタックフェイズ自体がスキップされていれば遷移先は END になる＝
    // **開始時トリガー（`ON_ATTACK_PHASE_START`・【ハスターリク】）も収集しない**。
    // `R-23` 先攻1ターン目はアタックフェイズをスキップ（人間と同じ1本）。
    const cpuPhaseAfterMain = resolveNextPhaseAfterMain(bs.turn_count, cpuSt, cpuContBlockedSelf);
    const cpuAttackPhaseSkipped = cpuPhaseAfterMain !== 'ATTACK_ARTS';
    if (cpuAttackPhaseSkipped) appendBattleLogs(['[CPU] アタックフェイズをスキップする']);

    // ON_ATTACK_PHASE_START（タスク12(lxvii)）＝人間ターンと**同じ pure collector** に統一する。
    // ⚠🔴従来ここは**手書きの部分再実装**で、CPU 自身の場の `triggerScope:'self'` しか拾っていなかった＝
    //   ①`any`／`any_opp`（「相手のアタックフェイズ開始時」等＝実測 **57効果**）が CPU ターンだけ不発
    //   ②`usageLimit`（《ターン1回》）を `actions_done` に記録しないので同一ターンに再発火しうる
    //   ③人間側の場のシグニを一切見ない、という3点で人間ターンと挙動が食い違っていた。
    const apsCpu = cpuAttackPhaseSkipped
      ? { cpuState: newCpuSt, humanState: undefined as PlayerState | undefined, entries: [] as StackEntry[] }
      : collectCpuTurnTriggers('ON_ATTACK_PHASE_START', newCpuSt, huSt, 'ATTACK_ARTS');
    apsStackEntries.push(...apsCpu.entries);
    newCpuSt = apsCpu.cpuState;
    // §6.3 J-4: アタックフェイズ開始時に離場履歴をリセットする（`SIGNI_LEFT_FIELD_THIS_ATTACK_PHASE` の母集団）。
    newCpuSt = clearAttackPhaseScopedState(newCpuSt);
    let huStAfterAps: PlayerState | undefined = apsCpu.humanState;

    // HASTARLIQ: CPUのMAIN→ATTACK_ARTS移行時、相手(人間)の hastarliq_zones があれば発動。
    // ⚠🔴従来ここは人間経路の式 `isHost ? 'guest_state' : 'host_state'` をそのまま流用しており、
    //   **CPU ターンでは反転して CPU 側を指していた**（人間経路の `isHost` はローカルユーザー＝ターン
    //   プレイヤー前提で「相手」を選ぶ式だが、CPU ターンではローカルユーザーが**非ターンプレイヤー**）。
    //   結果、人間の【ハスターリク】は CPU ターンに発動せず、代わりに CPU 側の予約を消していた。
    //   `cpuTurnAction` の他の全箇所と同じく **人間＝host 固定**へ揃える（タスク12(lxvii)）。
    const huStForHL = huSt;
    const huKeyForHL: PlayerStateKey = 'host_state';
    const hlZonesCpu = cpuAttackPhaseSkipped ? [] : (huStForHL.hastarliq_zones ?? []);
    // ハスターリク発動時のみ人間側の予約ゾーンをクリアする（発動が無ければ状態は書かない）
    let huWrite: { key: PlayerStateKey; state: PlayerState } | undefined;
    if (hlZonesCpu.length > 0) {
      apsStackEntries.push(...hlZonesCpu.map(zi => ({
        id: generateUUID(),
        playerId: cpuTurnPlayerId,
        cardNum: 'WXDi-P05-TK01A',
        effectId: `HASTARLIQ_TRIGGER_Z${zi}_${Date.now()}`,
        label: `【ハスターリク】ゾーン${zi + 1}発動`,
        effect: {
          effectId: `HASTARLIQ_TRIGGER_Z${zi}`,
          effectType: 'AUTO' as const,
          action: { type: 'STUB', id: 'HASTARLIQ_TRIGGER', value: zi } as import('../../../types/effects').StubAction,
          duration: 'INSTANT' as const,
          mandatory: true,
          parseStatus: 'AUTO' as const,
        },
      } satisfies StackEntry)));
      // ⚠ハスターリクの人間側書き込みと `ON_ATTACK_PHASE_START` の once_per_turn 記録は
      //   **同じ human state に重ねる**（どちらか一方だけを書くと他方が消える）。
      huWrite = { key: huKeyForHL, state: { ...(huStAfterAps ?? huStForHL), hastarliq_zones: undefined } };
      huStAfterAps = undefined;
    }

    let apsStack: EffectStack | undefined;
    if (apsStackEntries.length > 0) {
      const existingStackAPS = bs.effect_stack ?? null;
      apsStack = existingStackAPS
        ? pushToStack(existingStackAPS, apsStackEntries)
        : initStack(cpuTurnPlayerId, apsStackEntries);
    }
    // ⚠従来は `SET_TURN_PHASE`（人間側1件しか書けない）だったが、`ON_ATTACK_PHASE_START` の
    //   once_per_turn 記録で **CPU 側の state も書く必要がある**ため両側書ける action へ移す。
    const huWriteAps = huWrite ?? (huStAfterAps ? { key: huKeyForHL, state: huStAfterAps } : undefined);
    await persist.commit(reduceBattle(bs, {
      type: 'ADVANCE_TURN_WITH_STATE', phase: cpuPhaseAfterMain,
      playerKey: 'guest_state', playerState: newCpuSt,
      opp: huWriteAps, effectStack: apsStack,
    }));
    return;
  }

  // ─── ATTACK_ARTSフェイズ：攻めのアーツ／《アタックフェイズアイコン》付き【起】を使ってからアタックへ ───
  if (phase === 'ATTACK_ARTS') {
    // §8／§6.4 O-1 (b)。⚠《アタックフェイズアイコン》付きの札はここでしか使えない
    //   （MAIN 窓は CSV Timing に「メインフェイズ」がある札だけを通す＝gate 側で切れる）。
    if (await tryCpuUseArts(cpuSt, 'ATTACK_ARTS', pickCpuOffensiveArts)) return;
    // 🆕§5.6 `C-7`＝Timing が「アタックフェイズ」のピース（MAIN で使えなかった札）。
    if (await tryCpuKeyPiece(cpuSt, 'ATTACK_ARTS')) return;
    // §8／§6.4 O-1 (c)＝《アタックフェイズアイコン》付きシグニ【起】（`timing:['ATTACK_ARTS']`）。
    // ⚠**MAIN 窓では出ない**（`signiActivateGate` が timing で切る）＝この窓を足すまで恒久 no-op だった。
    if (await tryCpuSigniActivated(cpuSt, 'ATTACK_ARTS')) return;
    if (await tryCpuLrigActivated(cpuSt, 'ATTACK_ARTS')) return;
    // 🆕§5.7 `S-7`＝《アタックフェイズアイコン》付きのトラッシュ／手札の【起】。
    if (await tryCpuOffFieldActivated(cpuSt, 'ATTACK_ARTS')) return;
    await persist.commit(reduceBattle(bs, { type: 'SET_TURN_PHASE', phase: cpuNextPhase('ATTACK_ARTS') }));
    return;
  }

  // ─── ATTACK_SIGNIフェイズ：全シグニでアタック ───
  // ⚠強制攻撃（`resolveForcedSigniAttack`）は CPU 側では**自動的に満たされている**＝アタック可能な
  //   シグニを1体も残さないため。**CPU がアタックを選ぶようになったら**（§8 メインフェイズAI拡張）、
  //   ここで `collectForcedAttackZones` を見て強制対象を先に消化すること。
  // 🆕**アタック順（§6.4 O-8(a)「他のシグニより先にアタックしなければならない」）は
  //   `signiAttackGate` 側で効く**＝下の `canSigniAttack` が非強制シグニを候補から外すので、
  //   CPU も「強制対象 → その他」の順に殴る（ここに順序ロジックを写経しないこと）。
  if (phase === 'ATTACK_SIGNI') {
    // まだダウンしていない（かつアタック可能な）シグニを1枚ずつアタック
    // ⚠「すでにダウン」判定も gate（`ALREADY_DOWN`）へ寄せた（§6.4 O-10）＝ここで先に落とすと
    //   【常】「ダウン状態でもアタックできる」が CPU 側にだけ効かない軸ズレになる。
    // アタック**できる**ゾーン（可否＝人間ボタン／共通実行経路と同じ `signiAttackGate` に一本化。
    // 旧実装は blocked_actions と場トラッシュコストしか見ておらず、付与「アタックできない」等の
    // `cannotAttackSigni` 軸が CPU に効いていなかった）。アタック不可のシグニはダウンされず
    // `performSigniAttack` が早期 return して無限ループするので、必ずここで落とす。
    // 🆕§5.7 `S-17` 第1段（2026-09-20）＝**候補は `listCpuMoves` から取る**（列挙の道は1本＝`S-15` の規律）。
    //   ⚠旧はここで `canSigniAttack` を直接回していた＝**探索が見る候補と本番が見る候補が別の実装**だった。
    const attackMoves = listCpuMoves(cpuMoveCtx(cpuSt), 'ATTACK_SIGNI', { pendingSpell: !!bs.pending_spell })
      .flatMap(m => (m.kind === 'signiAttack' ? [m] : []));
    // §8 `O-1` (g)＝**どれで殴るかを盤面で選ぶ**（旧実装はゾーン0から順に全部＝格上の正面へ突っ込んで
    // 自分だけ落ちていた）。優先は ライフに通る → 勝てるバトル →（撃たない）。強制アタックは最優先。
    const cpuAttackPowers = calcFieldPowers(cpuSt, huSt, true, effectsMap, battleCardMap, bs.turn_phase);
    const cpuDefenderPowers = calcFieldPowers(huSt, cpuSt, false, effectsMap, battleCardMap, bs.turn_phase);
    /**
     * 🆕§5.7 `S-17` 第2段＝**アタックの手順を探索で決める**（ポリシーの数値で入切・**既定 0＝従来の価値表の順**）。
     * 🔴**強制アタック（「可能ならばアタックしなければならない」）がある間は探索を通さない**＝
     *   あれはルール由来の義務で、「撃たない」も「順番を変える」も選べない（`signiAttackGate` が他を弾く）。
     * 🔴🔑**探索が決めるのは「順番」であって「撃つかどうか」ではない**（2026-09-20 実測で決めた）＝
     *   探索が `null`（＝1手も得にならない）と言ったら**従来の価値表の順で撃つ**。
     *   **なぜ**＝実測（`--census-moves`・1戦）で**探索はアタックを20回「打たない」と判定した**が、その中身は
     *   **「正面が格上＝バトルで何も起きない」＝点数が baseline と同点**で、**同点は「何もしない」が勝つ**ため。
     *   ⚠実際には**アタックに損は無い**（規則上アタッカーは落ちない）どころか、
     *   **`ON_ATTACK_SIGNI` の【自】 684効果/667枚**を捨てることになる（登録票の警告そのもの）。
     *   🔑**「撃たない」が正しくなるのは、ライフバースト・ガードを確率で見られるようになってから**（第3段）＝
     *   現に人間が撃たない理由は「割るとバーストで損をする」＝**いまの楽観的な近似には原理的に映らない**。
     * ⚠**近似の向きは楽観**（ライフバースト・ガードを解かない＝`cpuMoves.ts` の `simCrushLife`）。
     */
    const attackSearchOn = cpuPolicy.searchAttacks && cpuPolicy.searchWidth > 0 && cpuPolicy.searchDepth > 0
      && attackMoves.length > 0 && !attackMoves.some(m => m.forced);
    const searchedAttack = attackSearchOn
      ? searchCpuMove(cpuMoveCtx(cpuSt), 'ATTACK_SIGNI', {
        width: cpuPolicy.searchWidth, depth: cpuPolicy.searchDepth, pendingSpell: !!bs.pending_spell,
        actionBias: cpuPolicy.actionBias,
      })
      : null;
    const searchedZone = searchedAttack?.move?.kind === 'signiAttack' ? searchedAttack.move.zone : null;
    /**
     * 🆕🔴§5.7 `S-17` 第3段（2026-09-21）＝**ここで初めて「撃たない」を探索に決めさせてよくなる**。
     * 🔑**第2段で禁じた理由は「近似が楽観だから」**＝ライフバーストもガードも解いていない盤面では
     *   「撃たない」が得に見えるのは**同点のときだけ**で、それは**損の無い行動を捨てている**だけだった。
     *   第3段で**期待損**（`cpuAttackRisk`）を点数に入れたので、**行動が baseline を「厳密に下回る」**という
     *   判定が意味を持つようになった。
     * 🔴**条件を4つとも要求する**＝①期待損を実際に見ているポリシーか（既定 0 ＝ **実機は従来どおり**）
     *   ②候補はあった（`candidates > 0`＝「探索の外の手しか無い」と混ぜない＝`S-21` の計器）
     *   ③**同点ではなく厳密に損**（`actionScore < baseline`）
     *   ④🔴**その損に期待損が効いている**（`actionRisk > 0`）。**④が無いと誤帰属する**＝
     *     2026-09-21 の実測（96戦）で出た「撃たない」**3件は全部 `risk === 0`**＝バトルで相手をバニッシュすると
     *     相手のエナが増えて点数が下がる、という**第3段とは無関係の理由**だった。
     *     ④を落とすと「アタックに損は無い」という第2段の結論（規則上アタッカーは落ちない）を黙って覆す。
     * ⚠**強制アタックのある盤面ではそもそも探索を通さない**（`attackSearchOn`）＝義務は「撃たない」を選べない。
     */
    const attackRiskAware = cpuPolicy.lifeBurstCost > 0 || cpuPolicy.guardDeckCount > 0;
    const declinedAttack = !!searchedAttack && attackRiskAware && searchedZone === null
      && searchedAttack.candidates > 0 && searchedAttack.actionScore < searchedAttack.baseline
      && searchedAttack.actionRisk > 0;
    // 🔑**数値も書く**＝「なぜ撃たなかったのか」をログだけで追えるようにする（2026-09-21＝推論で2往復ムダにした反省・§5.6 `C-0`）。
    if (declinedAttack) {
      appendBattleLogs([`[CPU] アタックしない（損と判定: ${Math.round(searchedAttack!.actionScore - searchedAttack!.baseline)}`
        + `／期待損${Math.round(searchedAttack!.actionRisk)}／候補${searchedAttack!.candidates}）`]);
    }
    const firstUp = declinedAttack ? -1 : searchedZone ?? pickCpuAttackZone({
      attackable: attackMoves.map(m => m.zone),
      // ⚠**強制は列挙が刻んだ印から読む**（`collectForcedAttackZones` をここでもう一度回さない＝二重実装）。
      forced: attackMoves.filter(m => m.forced).map(m => m.zone),
      attackerPower: zi => effectivePowerOf((cpuSt.field.signi[zi] ?? []).at(-1) ?? '', cpuAttackPowers, battleCardMap),
      facingPower: zi => facingSigniPower(huSt, zi, cpuDefenderPowers, battleCardMap),
    }) ?? -1;

    if (firstUp >= 0) {
      const myTopNum = (cpuSt.field.signi[firstUp] ?? []).at(-1)!;
      // 🆕§5.7 `S-17` 第1段＝**打った手を照合へ流す**（列挙に無い手を本番が打っていないか＝`S-15` の全数照合）。
      d.observeChoice?.(attackMoves.find(m => m.zone === firstUp) ?? { kind: 'signiAttack', zone: firstUp, id: myTopNum, forced: false });
      appendBattleLogs([`[CPU] ${battleCardMap.get(myTopNum)?.CardName ?? myTopNum} がアタック`]);
      // 対人戦と同じ共通処理でバトル解決（バニッシュ先エナ・各種代替・ON_BANISH等トリガー収集を含む）
      await performSigniAttack(firstUp, {
        attacker: cpuSt,
        defender: huSt,
        attackerId: CPU_PLAYER_ID,
        defenderId: bs.host_id,
        attackerKey: 'guest_state',
      });
      return; // 次のuseEffectトリガーで残りのシグニをアタック
    }

    // 全シグニアタック完了 → ATTACK_LRIGへ
    // ON_LRIG_ATTACK_STEP_START（タスク12(lxvii)）＝人間ターンの ATTACK_SIGNI→ATTACK_LRIG と同じ位置。
    // ⚠**移行先が ATTACK_LRIG のときだけ**収集する（ステップ封じで飛ばされる場合は開始しない）。
    const nextAfterSigni = cpuNextPhase('ATTACK_SIGNI');
    if (nextAfterSigni !== 'ATTACK_LRIG') {
      await persist.commit(reduceBattle(bs, { type: 'SET_TURN_PHASE', phase: nextAfterSigni }));
      return;
    }
    const lasCpu = collectCpuTurnTriggers('ON_LRIG_ATTACK_STEP_START', cpuSt, huSt);
    await persist.commit(reduceBattle(bs, {
      type: 'ADVANCE_TURN_WITH_STATE', phase: nextAfterSigni,
      playerKey: 'guest_state', playerState: lasCpu.cpuState,
      opp: lasCpu.humanState ? { key: 'host_state', state: lasCpu.humanState } : undefined,
      effectStack: lasCpu.entries.length > 0
        ? (bs.effect_stack ? pushToStack(bs.effect_stack, lasCpu.entries) : initStack(bs.active_user_id ?? CPU_PLAYER_ID, lasCpu.entries))
        : undefined,
    }));
    return;
  }

  // ─── ATTACK_LRIGフェイズ：ルリグアタック ───
  if (phase === 'ATTACK_LRIG') {
    // 🆕**§5.3 `O-366`（2026-09-14）＝人間のボタン生成／共通実行経路と**同じ**
    //   `centerLrigAttackBlock` を通す（3地点セット）。従来ここはダウン状態しか見ておらず、
    //   付与された上限（`O-236`）も再アタック（効果でアップ）も CPU には届いていなかった。
    // 🆕§5.7 `S-17` 第1段（2026-09-20）＝**可否は列挙から読む**（`listCpuMoves` が `centerLrigAttackBlock` を呼ぶ）。
    //   ⚠**アシストルリグのアタックはまだ列挙に無い**（下の `assistLrigAttackableSlots`）＝その手は照合の対象外。
    const lrigAttackMove = listCpuMoves(cpuMoveCtx(cpuSt), 'ATTACK_LRIG', { pendingSpell: !!bs.pending_spell })
      .find(m => m.kind === 'lrigAttack');
    if (lrigAttackMove) {
      d.observeChoice?.(lrigAttackMove);
      // 対人戦と同じ共通処理（追加コスト・ON_ATTACK_LRIGトリガー収集を含む）
      const attacked = await performLrigAttack({
        attacker: cpuSt, defender: huSt,
        attackerId: CPU_PLAYER_ID, attackerKey: 'guest_state',
      });
      // §5.6 `C-3`＝機構踏破計器（`playCensus.ts`）が数える行。
      if (attacked) { appendBattleLogs(['[CPU] ルリグアタック']); return; }
      // アタック不可（ドライブ状態・無効化等）→ そのままENDへ進む
    }
    // ガード応答待ち・ライフバースト処理中はENDへ進まない
    if (huSt.field.lrig_attacked || huSt.field.check) return;
    // アシストルリグのアタック（§6.4 A群・続き427）。センターの後に1体ずつ。
    // ⚠人間側のボタン生成と同じ `assistLrigAttackableSlots` を通す（軸ズレ防止）。
    const cpuAssistSlots = assistLrigAttackableSlots(cpuSt, battleCardMap);
    if (cpuAssistSlots.length > 0) {
      const attackedAssist = await performLrigAttack({
        attacker: cpuSt, defender: huSt,
        attackerId: CPU_PLAYER_ID, attackerKey: 'guest_state',
        slot: cpuAssistSlots[0],
      });
      if (attackedAssist) { appendBattleLogs(['[CPU] アシストルリグでアタック']); return; }   // 次の useEffect で残りのアシストへ   // 次の useEffect で残りのアシストへ
    }
    // ── ルリグアタック済み → アタックフェイズ終了（§8／§6.4 O-1 (e)・2026-08-18）────────────
    // 🔑**人間経路（`doPhaseAdvance` の同じ遷移）と同じ4点をこの1コミットで行う**＝
    //   ①`ON_ATTACK_PHASE_END` 収集 ②「このアタックフェイズの間」の遅延 watcher を両者から消す
    //   ③追加のアタックフェイズ（§6.4 O-3）の予約を**1件消化して** `ATTACK_ARTS` へ戻す
    //   ④戻る場合は2周目の `ON_ATTACK_PHASE_START` を収集する。
    // ⚠🔴**従来ここは `SET_TURN_PHASE`（state を書けない）だった**＝③が構造的に不可能で、
    //   `resolveNextPhaseAfterAttack` を通すとキューを減らせないまま ATTACK_ARTS へ戻る無限ループ。
    //   そのため `hasCpuUnsupportedAction` で `ADD_EXTRA_ATTACK_PHASE` を含む札を CPU が**選ばない**
    //   除外で回避していた（母集団2枚＝`WX22-010` ルリグ【起】／`WXK06-026` スペル）。
    //   state 込みコミットへ移したので**その除外は撤去した**（`CPU_UNSUPPORTED_ACTION_TYPES` は空集合）。
    // ⚠**`ON_ATTACK_PHASE_END` は CPU 経路では一度も収集されていなかった**（人間ターンだけ発火）＝
    //   タスク12(lxvii) が配線した5 timing に続く6本目。live 母集団は1効果（`WX24-P2-075`）。
    // ⚠【ハスターリク】は2周目では発動しない（人間経路の `phase !== 'ATTACK_LRIG'` と同じ扱い）。
    // ⚠人間側 state は**必ず書く**（遅延 watcher のクリアが両者に掛かるため）＝`opp` を省略しない。
    {
      const apeCpu = collectCpuTurnTriggers('ON_ATTACK_PHASE_END', cpuSt, huSt);
      const apeEntries: StackEntry[] = [...apeCpu.entries];
      let nextCpuState = clearEndOfAttackPhaseDelayedTriggers(apeCpu.cpuState);
      let nextHuState = clearEndOfAttackPhaseDelayedTriggers(apeCpu.humanState ?? huSt);
      const nextResCpu = resolveNextPhaseAfterAttack('ATTACK_LRIG', nextCpuState, cpuContBlockedSelf);
      nextCpuState = nextResCpu.state;
      if (nextResCpu.addedExtraPhase) {
        appendBattleLogs(['[CPU] 追加のアタックフェイズを開始する']);
        // §6.3 J-4: アタックフェイズ開始時に離場履歴をリセット（人間経路と同じ順＝クリア→収集）。
        nextCpuState = clearAttackPhaseScopedState(nextCpuState);
        const aps2 = collectCpuTurnTriggers('ON_ATTACK_PHASE_START', nextCpuState, nextHuState, 'ATTACK_ARTS');
        nextCpuState = aps2.cpuState;
        if (aps2.humanState) nextHuState = aps2.humanState;
        apeEntries.push(...aps2.entries);
      }
      await persist.commit(reduceBattle(bs, {
        type: 'ADVANCE_TURN_WITH_STATE', phase: nextResCpu.next,
        playerKey: 'guest_state', playerState: nextCpuState,
        opp: { key: 'host_state', state: nextHuState },
        effectStack: apeEntries.length > 0
          ? (bs.effect_stack ? pushToStack(bs.effect_stack, apeEntries) : initStack(bs.active_user_id ?? CPU_PLAYER_ID, apeEntries))
          : undefined,
      }));
    }
    return;
  }

  // ─── ENDフェイズ：ターン終了処理 ───
  if (phase === 'END') {
    // ON_TURN_END（タスク12(lxvii) 本体）＝**CPU ターンでは一度も収集していなかった**
    // （live 190効果／185カードが CPU のターンだけ全て不発）。人間経路（`doPhaseAdvance` の END 分岐）と
    // 同じ「`__TURN_END__` マーカーで1回だけ収集し、スタックを積んで return → 解決後の再入でこの先へ進む」型に揃える。
    // ⚠**エンドフェイズの順序**は ①ターン終了時効果 → ②手札上限 → ③終了 なので、
    //   下のクリーンアップ（＝③相当）より**必ず前**で解決しきる。
    if (!cpuSt.actions_done?.includes('__TURN_END__')) {
      const endCpu = collectCpuTurnTriggers('ON_TURN_END', cpuSt, huSt);
      if (endCpu.entries.length > 0) {
        const markedCpuSt: PlayerState = {
          ...endCpu.cpuState,
          actions_done: [...(endCpu.cpuState.actions_done ?? []), '__TURN_END__'],
        };
        await persist.commit(reduceBattle(bs, {
          type: 'WRITE_STATE', myKey: 'guest_state', myState: markedCpuSt,
          opp: endCpu.humanState ? { key: 'host_state', state: endCpu.humanState } : undefined,
          effectStack: bs.effect_stack
            ? pushToStack(bs.effect_stack, endCpu.entries)
            : initStack(bs.active_user_id ?? CPU_PLAYER_ID, endCpu.entries),
        }));
        return; // 解決後に再度この END 分岐へ入り、マーカー済みなので素通りして後始末へ進む
      }
    }
    const cpuEndState = resolveTurnEndFacedownReturns(cpuSt).state;
    const huEndState = resolveTurnEndFacedownReturns(huSt).state;
    // ⚠アップ処理は**ここでは書かない**＝誰がアップフェイズを迎えるかは `resolveTurnHandover` の後で決まる（§5.6 `C-9`）。
    // CPUターン終了＝人間側から見た「次の相手ターン終了時」。PvP の doPhaseAdvance / confirmEndDiscard と同じく、
    // 次ターンプレイヤーが保持する UNTIL_OPP_TURN_END 状態をここで失効させる。
    const nextHuSt = clearEndOfTurnDelayedTriggers(activateNextTurnSigniZoneBlocks(activateNextTurnDeployCountLimit(clearTurnEndScopedState({
      ...clearUntilOppTurnEffects(clearAllZoneBurstGrantUntilOppTurn(huEndState)),
      turn_arts_used: undefined, turn_arts_used_names: undefined, turn_arts_used_colors: undefined, turn_pieces_used_names: undefined, // CPUターン中のガード使用分をリセット（ARTS_USED_THIS_TURN）
      signi_deploy_count_limit: undefined, // 配置数制限（このターン・CPUにかけられた分）を人間のターン開始時にリセット
      banish_redirect_power0_target_nums: undefined,
      banish_redirect_battle_target_nums: undefined,
    })).state));
    // turn_end_draw_count: このターン終了時、カードをN枚引く（DRAW_AT_TURN_END。場を離れても引く）
    let cpuHandEND = cpuEndState.hand;
    let cpuDeckEND = cpuEndState.deck;
    if ((cpuEndState.turn_end_draw_count ?? 0) > 0) {
      const drawnCPU = cpuDeckEND.slice(0, cpuEndState.turn_end_draw_count);
      cpuDeckEND = cpuDeckEND.slice(cpuEndState.turn_end_draw_count);
      cpuHandEND = [...cpuHandEND, ...drawnCPU];
      appendBattleLogs([`ターン終了時：CPUがカードを${drawnCPU.length}枚引く`]);
    }
    // 🆕§5.6 `C-4`＝**CPU の手札上限**（公式ルール：エンドフェイズ ①ターン終了時の効果 → ②手札が上限を超えていれば捨てる）。
    //   🔴旧実装は CPU に手札上限の処理自体が無かった（DESIGN §4 の注記）。
    //   上限は人間と同じ `collectHandLimits`、捨てた札の「手札からトラッシュに置かれたとき」は人間の `confirmEndDiscard` と同じ
    //   `collectAnyZoneTrashSelfTriggers(…, 'hand', undefined, false)`（ルール処理＝効果起因ではない）。
    let cpuTrashEND = cpuEndState.trash;
    const cpuHandLimit = collectHandLimits(cpuEndState, huEndState, battleCardMap, effectsMap);
    if (cpuHandEND.length > cpuHandLimit) {
      const discardIdx = pickCpuHandLimitDiscards(cpuHandEND, cpuHandEND.length - cpuHandLimit, battleCardMap, id => effectsMap.get(id) ?? [], id => planKeepBonus(cpuPlan, id, cpuPolicy), cpuPolicy);
      const discardNums = discardIdx.map(i => cpuHandEND[i]);
      appendBattleLogs([`[CPU] 手札上限: ${cpuHandEND.length}枚→${cpuHandEND.length - discardNums.length}枚（${discardNums.map(n => battleCardMap.get(n)?.CardName ?? n).join('・')}を捨て）`]);
      cpuHandEND = cpuHandEND.filter((_, i) => !discardIdx.includes(i));
      cpuTrashEND = [...cpuTrashEND, ...discardNums];
      const cpuRuleDiscardEntries = discardNums.flatMap(cn =>
        collectAnyZoneTrashSelfTriggers(cn, CPU_PLAYER_ID, false, 'hand', undefined, false));
      if (cpuRuleDiscardEntries.length > 0) {
        // 誘発を先に解決する＝人間経路と同じ。再入時は手札が上限以下なので素通りし、ターン終了時の予約（ドロー）も消費済み。
        await persist.commit(reduceBattle(bs, {
          type: 'WRITE_STATE', myKey: 'guest_state',
          myState: { ...cpuEndState, hand: cpuHandEND, deck: cpuDeckEND, trash: cpuTrashEND, turn_end_draw_count: undefined },
          opp: { key: 'host_state', state: huEndState },
          effectStack: bs.effect_stack
            ? pushToStack(bs.effect_stack, cpuRuleDiscardEntries)
            : initStack(bs.active_user_id ?? CPU_PLAYER_ID, cpuRuleDiscardEntries),
        }));
        return;
      }
    }
    // turn_end_energy_trash_targets: ターン終了時にエナゾーンからトラッシュへ（人間側と同じ funnel）。
    // CPU も 【出】でこの予約を積む札（`SPK01-10`）を召喚しうるので、人間の2経路と同じ関数を通す。
    const cpuEnergyTrashEND = resolveTurnEndEnergyTrash({ ...cpuEndState, trash: cpuTrashEND });
    if (cpuEnergyTrashEND.trashed.length > 0) {
      appendBattleLogs([`ターン終了時：CPUの${cpuEnergyTrashEND.trashed.map(n => battleCardMap.get(getCardNum(n))?.CardName ?? n).join('・')}をエナゾーンからトラッシュへ`]);
    }
    const cleanCpuSt: PlayerState = clearTurnEndScopedState(resolvePendingExiles(clearAttackFieldTrashCosts(clearEndOfTurnDelayedTriggers({
      ...cpuEndState,
      energy: cpuEnergyTrashEND.state.energy,
      trash: cpuEnergyTrashEND.state.trash,
      turn_end_energy_trash_targets: undefined,
      hand: cpuHandEND, deck: cpuDeckEND, turn_end_draw_count: undefined,
      actions_done: [],
      signi_zone_blocks: undefined, // ゾーン配置禁止をクリア。トラッシュ移動ロックは funnel（予約は別フィールド）
      pending_crashed_cards: [], pending_crash_source_card_nums: [], crash_source_card_num: undefined, prevent_next_damage: undefined, prevent_next_damage_reservations: undefined, turn_end_mill_count: undefined,
      damage_replace_mill: undefined, // ターン内ダメージ置換（REPLACE_NEXT_DAMAGE_WITH_MILL）をリセット
      life_crash_replacements: undefined,
      turn_end_return_to_lrig_deck: undefined, last_summoned_resonas: undefined,
      attacked_signi_ids: undefined, // 共通アタック処理（performSigniAttack）が記録するためリセット
      lrig_granted_auto_effects: clearTurnGrantedLrigAbilities(cpuEndState).lrig_granted_auto_effects,
      banish_redirect: undefined, banish_redirect_to_hand: undefined, banish_redirect_to_exile: undefined,
      banish_redirect_power0_target_nums: undefined,
      banish_redirect_battle_target_nums: undefined,
      power0_banish_to_trash: undefined, power0_banish_to_trash_opp_only: undefined, double_power_minus_sources: undefined,
      lrig_has_attacked: undefined, // ルリグアタック済みフラグをリセット
      pending_signi_battle: undefined, // シグニバトル解決待ちフラグをリセット
      pending_lrig_attack: undefined,  // ルリグアタック解決待ちフラグをリセット
      turn_arts_used: undefined, turn_arts_used_names: undefined, turn_arts_used_colors: undefined, turn_pieces_used_names: undefined, // アーツ使用履歴をリセット
    })), true));
    // §6.4 O-3: CPU のターン終了も人間の2経路と**同じ `resolveTurnHandover`** を通す。
    // ⚠🔴従来ここは無条件で `activeUserId: user.id`＝**CPU が取った追加ターンも、人間が予約した
    //   「次の自分のターンをスキップ」（`WD20-006-E1`＝相手ターン中に撃つアーツ）も効かなかった**。
    //   `WD20-006` の母集団はまさに「このターンが対戦相手のターンで」＝この経路が本命。
    const handoverCpu = resolveTurnHandover(cleanCpuSt, nextHuSt);
    if (handoverCpu.log) appendBattleLogs([`[CPU] ${handoverCpu.log}`]);
    // 🔴§5.6 `C-9`＝**アップを受けるのは次にターンを行うプレイヤー**（`upPhase.ts`）。
    //   旧実装は交代しない場合（CPU の追加ターン／人間が予約した「次の自分のターンをスキップ」）も人間をアップしていた。
    const upHuman = upPhaseRecipient(handoverCpu.keepTurn) === 'opponent';
    // ⚠センタールリグのアップ条件（`lrig_upkeep_condition`）は**人間側だけ**尊重する＝支払い対話は人間の UP 分岐にしか無く、
    //   CPU の UP 分岐はこの条件を一度も消費しない（尊重すると CPU のルリグが永久にダウンしたままになる）。
    const upped = (s: PlayerState, honorUpkeep: boolean): PlayerState =>
      ({ ...s, field: applyUpPhaseToField(s.field, honorUpkeep && s.lrig_upkeep_condition !== undefined) });
    await persist.commit(reduceBattle(bs, {
      type: 'BEGIN_NEXT_TURN',
      activeUserId: handoverCpu.keepTurn ? undefined : user.id,
      myKey: 'guest_state', myState: handoverCpu.consumeTurnEnder(upHuman ? cleanCpuSt : upped(cleanCpuSt, false)),
      // 遅延自己除外は非ターンプレイヤー（人間）側にも適用（WX16-040 等はCPUターン中に蘇生→そのターン終了時に除外）
      opp: { key: 'host_state', state: handoverCpu.consumeOpponent(resolvePendingExiles(upHuman ? upped(nextHuSt, true) : nextHuSt, true)) },
    }));
  }
}
