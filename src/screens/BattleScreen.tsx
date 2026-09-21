import {useCallback, useEffect, useMemo, useState, useRef} from 'react';
import {supabase} from '../supabaseClient';
import type {User} from '@supabase/supabase-js';
import type {BattleStateRow, PlayerState, CardData, StackEntry, EffectStack} from '../types';
import type {CardEffect} from '../types/effects';
import {calcFieldPowers, calcActiveCostMods, calcContinuousBlockedActions, collectColorlessOverrides, collectEnergyColorSubs, collectEnergyTrashSubstituteInfo, collectEnergyCostSubstitutes, collectEichiStubEffects, collectSpecificCardCostReductions, collectLrigNameAliases, collectArtsThresholdCostReductions, collectOppTurnArtsCostReductions, collectOppLrigAttackExtraCost, collectHandGuardIconClasses, collectMultiAcceLimits, collectGuardAlternativeCost, collectAltAttackFlipSigni, collectContinuousGrantedKeywords, resolveForcedSigniAttack, collectGrowCostReductions} from '../engine/effectEngine';
import {getCardNum, evalUseCondition, payBeatSigniCost, payBeatSigniFromTrashCost, beatSigniCostCount} from '../engine/effectExecutor';
import {getRiseRequirement, LRIG_BARRIER_CARD, countBarrierTokens, addBarrierTokens, canSatisfyDiscardGroups} from '../engine/execUtils';
import {initStack, pushToStack, confirmTurnOrder, confirmOppOrder, isReadyToResolve} from '../engine/effectStack';
import { collectCoinPaidTriggers as pureCollectCoinPaidTriggers, collectTrashTriggers as pureCollectTrashTriggers, collectSelfEventTriggers as pureCollectSelfEventTriggers, collectZoneMovedTriggers as pureCollectZoneMovedTriggers, collectOppOwnedSpellUseTriggers as pureCollectOppOwnedSpellUseTriggers, collectDriveBecameTriggers as pureCollectDriveBecameTriggers, collectBeatBecameTriggers as pureCollectBeatBecameTriggers, collectHandDiscardTriggers as pureCollectHandDiscardTriggers, type TrigCtx} from '../engine/triggerCollect';
import { collectLrigAttackGuardedTriggers as pureCollectLrigAttackGuardedTriggers, collectRevealedFromHandTriggers as pureCollectRevealedFromHandTriggers} from '../engine/triggerCollect';
import {coinLedger} from '../engine/coinAbilityNegation';
import {acceCardsAt, allAcceCards, normalizeAcceSlots} from '../utils/acce';
import {C, HandCards, PlayerField} from '../components/BoardComponents';
import type {CardAction} from '../components/BoardComponents';
import {consumeLifeCrashReplaceDecision} from './battle/lifeCrashReplace';
import {payLifeOnPlayCost} from './battle/lifeCost';
import {payLrigDownCost, fmtLrigDownCostLabel} from './battle/lrigDownCost';
import {payFieldTrashCost} from './battle/fieldTrashCost';
import {handActivateCostLabel, type HandActivateSelections} from './battle/handActivateCost';
import {payMultiZoneExileCost} from './battle/multiZoneExileCost';
import {payFieldToDeckTopCost} from './battle/fieldToDeckTopCost';
import {trashActivateCostLabels, trashActivateVerbLabel} from './battle/trashActivateCost';
import {listOffFieldActivatableEffects} from './battle/offFieldActivateGate';
import {isTrashImmuneByOpponent} from '../engine/execUtils';
import {collectCutinCandidates} from './battle/cutinCandidates';
import {performCutinUse} from './battle/controller/performCutinUse';
import {payUnderAnySigniTrash} from './battle/underAnySigniCost';
import {buildEnergyPayPool, energyPoolCardNums, isEnergyPayBlocked, planEnergyPayment, type EnergyPayEntry} from './battle/energyPaySource';

interface Props {
  user: User;
  roomId: string;
  myDeckId: string;
  cards: CardData[];
  onBack: () => void;
}

import {randomInt} from '../engine/rng';
import {CPU_PLAYER_ID, CPU_ACTION_DELAY, generateUUID, shuffle, assignInstanceIds, assignGuestInstanceIds, jankenWinner, keyActivatedTimingMatchesPhase, isPieceCardType} from './battle/battleUtils';
import {recordEnergyPlacements} from '../engine/energyPlacement';
import {performEnergyCharge, type EnergyChargeSource} from './battle/controller/performEnergyCharge';
import {mainPhaseGateOkFor} from '../engine/triggerCollect';
import {isEnaMultiStripped, fmtHandDiscardSigniLabel, fmtDiscardFilterLabel, applyGrowCostReduction, parseCoinCost, canAffordEnergyCostWithSubstitutes, paySelectedExceed} from './battle/costs';
import {meetsRestriction, effectiveLrigClass, listGrowCandidates, declaredSigniOverride} from './battle/growLogic';
import {cardNameUseBlocked} from './battle/cardNameUseBlock';
import {computeFieldSigniLimit} from './battle/fieldLimit';
import {matchesTrashArtsFromLrigDeckCost} from './battle/artsTrashCost';
import {MAYU_ENCOUNTER_A} from './battle/mayuEncounter';
import {computeEffectiveLrigLimit} from './battle/lrigLimit';
import {resolveNegateEscapeChoice} from './battle/attackNegation';
import {moveFieldSigniFacedown, scheduleTurnEndFacedownReturns} from '../engine/facedownSigni';
import {JANKEN_LABEL, PHASE_LABEL, PHASE_BTN, NON_TURN_PLAYER_PHASES, WAITING_MSG, setupWrap, primaryBtn} from './battle/uiConstants';
import {MulliganCard} from './battle/MulliganCard';
import type {BattleModalCtx, CutinCandidate} from './battle/modals/types';
import {GrowModal} from './battle/modals/GrowModal';
import {ArtsModal} from './battle/modals/ArtsModal';
import {CutinModal} from './battle/modals/CutinModal';
import {SigniActivatedModal} from './battle/modals/SigniActivatedModal';
import {SigniOnPlayCostModal} from './battle/modals/SigniOnPlayCostModal';
import {LrigGrantedModal} from './battle/modals/LrigGrantedModal';
import {EffectInteractionModal} from './battle/modals/EffectInteractionModal';
import {KeyUseModal} from './battle/modals/KeyUseModal';
import {KeyActivatedModal} from './battle/modals/KeyActivatedModal';
import {AssistGrowModal} from './battle/modals/AssistGrowModal';
import {AssistActivatedModal} from './battle/modals/AssistActivatedModal';
import {EnergyActivatedModal} from './battle/modals/EnergyActivatedModal';
import {GuardResponseDialog} from './battle/modals/GuardResponseDialog';
import {LifeCrashReplaceModal} from './battle/modals/LifeCrashReplaceModal';
import {StackOrderModal} from './battle/modals/StackOrderModal';
import {SigniSummonZoneModal} from './battle/modals/SigniSummonZoneModal';
import {ResonaSummonModal} from './battle/modals/ResonaSummonModal';
import {RemoveZoneModal} from './battle/modals/RemoveZoneModal';
import {LifeBurstCheckModal} from './battle/modals/LifeBurstCheckModal';
import {allZoneBurstGrantMatches} from './battle/allZoneBurst';
import {EndDiscardModal} from './battle/modals/EndDiscardModal';
import {BanishSubstituteModal} from './battle/modals/BanishSubstituteModal';
import {PhaseConfirmDialogs} from './battle/modals/PhaseConfirmDialogs';
import {SpellCastModal} from './battle/modals/SpellCastModal';
import {HandActivatedModal} from './battle/modals/HandActivatedModal';
import {TrashActivatedModal} from './battle/modals/TrashActivatedModal';
import {GuardBarrierActModal} from './battle/modals/GuardBarrierActModal';
import {NegateEscapeModal} from './battle/modals/NegateEscapeModal';
import {AttackFieldTrashCostModal} from './battle/modals/AttackFieldTrashCostModal';
import {AttackHandDiscardCostModal} from './battle/modals/AttackHandDiscardCostModal';
import {SpellCutinOverlays} from './battle/modals/SpellCutinOverlays';
import {EndConfirmModal} from './battle/modals/EndConfirmModal';
import {FinishedPopup} from './battle/modals/FinishedPopup';
import {SystemOverlays} from './battle/modals/SystemOverlays';
import {useGrowModal} from './battle/hooks/useGrowModal';
import {useArtsModal} from './battle/hooks/useArtsModal';
import {useSpellCast} from './battle/hooks/useSpellCast';
import {useKeyModals} from './battle/hooks/useKeyModals';
import {useAssistModals} from './battle/hooks/useAssistModals';
import {usePhaseConfirms} from './battle/hooks/usePhaseConfirms';
import {useSigniOnPlayCost} from './battle/hooks/useSigniOnPlayCost';
import {useSigniActivated} from './battle/hooks/useSigniActivated';
import {useActivatedModals} from './battle/hooks/useActivatedModals';
import {useCutin} from './battle/hooks/useCutin';
import {useEffectInteraction} from './battle/hooks/useEffectInteraction';
import {useRemoveZone, useGuardResponses, useEndDiscard, useZoomOverlays} from './battle/hooks/useMiscBattleUI';
import {useBattleSession, DECK_DATA_COLUMNS} from './battle/hooks/useBattleSession';
import {useBattleLog} from './battle/hooks/useBattleLog';
import {useGameStartSetup, useSigniSummonFlow} from './battle/hooks/useSetupFlow';
import {useBattlePersist} from './battle/controller/persist';
import {makeBoardDiffCollector, type BoardDiffCollector} from './battle/controller/boardDiffTriggers';
// 🆕§5.7 `S-5d` 第3段（2026-09-19）＝盤面の材料（カード表・効果表・有効パワー）の本体。
import {buildBattleCardMap, buildBaseEffectsMap, buildAugmentedEffectsMap, buildEffectivePowers} from './battle/controller/battleMaterials';
// 🆕§5.7 `S-5d` 第3段（2026-09-19）＝ルール処理8本の本体（画面の `useEffect` から回る受け皿）。
import {makeRuleChecks, createRuleCheckMemo} from './battle/controller/ruleChecks';
import {makeTrigCtx} from './battle/controller/execCtxDeps';
import {performAssistGrow as performAssistGrowImpl} from './battle/controller/performAssistGrow';
import {performLrigAttack as performLrigAttackImpl} from './battle/controller/performLrigAttack';
import {performLrigActivated as performLrigActivatedImpl} from './battle/controller/performLrigActivated';
import {performSigniActivated as performSigniActivatedImpl} from './battle/controller/performSigniActivated';
import {performSummonSigni as performSummonSigniImpl} from './battle/controller/performSummonSigni';
import {performGuardResponse as performGuardResponseImpl} from './battle/controller/performGuardResponse';
import {performArts as performArtsImpl} from './battle/controller/performArts';
import {performKeyPiece as performKeyPieceImpl} from './battle/controller/performKeyPiece';
import {executeHandActivated as executeHandActivatedImpl, executeTrashActivated as executeTrashActivatedImpl, type OffFieldActor} from './battle/controller/offFieldActivateExec';
import {performSigniAttack as performSigniAttackImpl} from './battle/controller/performSigniAttack';
import {doPhaseAdvance as doPhaseAdvanceImpl} from './battle/controller/phaseAdvance';
import {confirmEndDiscard as confirmEndDiscardImpl} from './battle/controller/endDiscard';
import {handleCutinPass as handleCutinPassImpl} from './battle/controller/cutinPass';
import {cpuTurnAction as cpuTurnActionImpl} from './battle/controller/cpuTurn';
import {resolvePendingSigniBattleFor as resolvePendingSigniBattleImpl} from './battle/controller/resolveSigniBattle';
import {performLifeBurstResponse as performLifeBurstResponseImpl} from './battle/controller/performLifeBurstResponse';
import {performGrow as performGrowImpl} from './battle/controller/performGrow';
import {performSpell as performSpellImpl} from './battle/controller/performSpell';
import {queueCardEffects as queueCardEffectsImpl} from './battle/controller/queueCardEffects';
import {resolvePendingPiece as resolvePendingPieceImpl} from './battle/controller/resolvePendingPiece';
import type {PerformCtx} from './battle/controller/performCtx';
import type {BattleIo} from './battle/controller/battleIo';
import { resolveStackStep, type StackResolveDeps} from './battle/controller/stackResolve';
// 🆕§5.7 `S-5d` 第1段（2026-09-19）＝対話の解決7本（566行）の本体。
import {makeEffectInteractionHandlers} from './battle/controller/effectInteraction';
import {reduceBattle, type PlayerStateKey} from './battle/controller/battleController';
import {canCardGuard, guardAlternativeClassCandidates} from './battle/guard';
import {removeKeyToLrigTrash} from './battle/keyZone';
import {clearZoneOnSigniLeave} from './battle/leaveFieldZone';
import {planLimitExcess} from './battle/limitExcess';
import {LimitExcessModal} from './battle/modals/LimitExcessModal';
import {cpuBattleKey, lastCommitArrived, updatedAtKey, cpuShouldAct, cpuWaitingForHuman, cpuWatchdogShouldCheck, sameBattleForCpu} from './battle/cpuDriver';
import {normalizeCpuDeckPlan} from './battle/cpuDeckPlan';
// 🆕§5.7 `S-5d` 第2段（2026-09-19）＝CPU の対話応答の振り分け（純関数）。
import {decideCpuInteractionResponse} from './battle/cpuInteractionRespond';
import {applyMulligan} from './battle/mulligan';
import {performCpuMulligan} from './battle/controller/performMulligan';
import {buildLrigSetupState} from './battle/lrigSetup';
import {resolveDeckLrigSetup, lrigRolesOfRow, deckLrigSetupProblem, DECK_LRIG_SETUP_PROBLEM_JA} from '../utils/deckLrigSetup';
import {listAssistGrowCandidates} from './battle/assistGrow';
import {clearEndOfAttackEffects} from './battle/attackDuration';
import {reserveGrantedAutoUsage} from './battle/grantedAuto';
import {getResonaSummonCandidate, resonaCombinedOptions, resonaPaymentOptions, type ResonaPaymentItem, type ResonaPaymentSelection, type ResonaSummonCandidate} from './battle/resonaSummon';
import {pendingEffectCardNums} from './battle/pendingEffectCards';
import {planRiseSummon, type RiseSelection} from './battle/riseSummon';
import {attackFieldTrashCost, canPayAttackFieldTrashCost, canPayLrigAttackFieldTrashCost} from './battle/attackFieldTrashCost';
import {canSigniAttack, collectForcedAttackZones, signiAttackColorlessCost} from './battle/signiAttackGate';
import {listActivatableSigniEffects, listActivatableSeedEffects} from './battle/signiActivateGate';
import {collectGrantedLrigEffects, listActivatableLrigEffects, listActivatableGrantedLrigEffects, listActivatableInheritedLrigEffects} from './battle/lrigActivateGate';
import {type ArtsPayerCtx, buildArtsPayerCtx, checkArtsUse, collectEnaAllMulti, collectEnergyExtraColors, hasIgnoreLrigRestriction} from './battle/artsUseGate';
import {checkKeyPieceUse, keyPieceCostOf} from './battle/keyPieceUseGate';
import {checkSpellUse, isSpellUseBlockedFor} from './battle/spellUseGate';
import {signiAttackBanHandDiscardCost, lrigAttackBanCost} from './battle/signiAttackBan';
import {assistLrigAttackableSlots, lrigSlotTop, type LrigAttackSlot} from './battle/assistLrigAttack';
import {centerLrigAttackBlock} from './battle/lrigAttackGate';
import {sideAttackEmptyZoneDealsDamage} from './battle/sideAttackDamage';
// 「このターン手札から捨てた」台帳の唯一の入口（`V-101`②）。支払い地点ごとに書くと必ずどれかが落ちる。
import {handDiscardHistoryRecord} from './battle/costs';
import {crashSourceSuppressesLifeBurst} from './battle/lifeBurstSuppress';
import {grantedStoreWatchers} from '../engine/grantedStore';
import {isHandSigniPlayBlockedByPower} from '../engine/blockAction';

/**
 * 🔴**DB から来た行の `signi_acce` 旧形式（素の string）をここで一度だけ配列へ正す**（タスク12(cxxxiv)）。
 * `setBs` は「外部（fetch / Realtime）から状態が入ってくる唯一の入口」なので、ここを通せば
 * 以降の全消費地点（`acceCardsAt` を通らない生アクセスも含む）が配列だけを見る。
 * ⚠正規化が不要な行は**同一参照のまま返す**（毎 UPDATE で新オブジェクトを作ると再描画が増えるため）。
 */
function normalizeBattleRow(row: BattleStateRow): BattleStateRow {
  let changed = false;
  const fix = (s: PlayerState): PlayerState => {
    const slots = s?.field?.signi_acce;
    if (!slots) return s;
    const next = normalizeAcceSlots(slots);
    if (next === slots) return s;
    changed = true;
    return { ...s, field: { ...s.field, signi_acce: next } };
  };
  const host = fix(row.host_state), guest = fix(row.guest_state);
  return changed ? { ...row, host_state: host, guest_state: guest } : row;
}

// ─── メインコンポーネント ────────────────────────────────────────────
export default function BattleScreen({ user, roomId, myDeckId, cards, onBack }: Props) {
  const [bs, setBsRaw] = useState<BattleStateRow | null>(null);
  const setBs = useCallback(
    (row: BattleStateRow | null) => setBsRaw(row ? normalizeBattleRow(row) : row), []);
  // 試合セッション/構成レベル（読み込み・自/CPU デッキ・CPU 戦フラグ）
  const {
    loading, setLoading, myDeckData, setMyDeckData,
    isCpuBattle, setIsCpuBattle, cpuDeckData, setCpuDeckData,
  } = useBattleSession();
  const cpuTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Stage3 seam：battle_states 永続化チョークポイント（純粋 reduceBattle の出力を commit で書き込む）
  const persistRaw = useBattlePersist(roomId);
  // 🆕§5.1 `V-247`＝**処理中の書き込み数と、最後に書き込んだ行の `updated_at`**（CPU の二重実行を防ぐ＝`runCpuTurn` が見る）。
  //   ⚠書き込みはすべてここを通る＝人間の操作も含めて記録する（CPU の判定が人間の書き込みの通知も待つのは正しい）。
  const pendingCommitsRef = useRef(0);
  const lastCommitUpdatedAtRef = useRef('');
  const persist = useMemo(() => ({
    ...persistRaw,
    commit: async (patch: Parameters<typeof persistRaw.commit>[0]) => {
      pendingCommitsRef.current += 1;
      try {
        const res = await persistRaw.commit(patch);
        const ua = res.data?.[0]?.updated_at;
        if (ua && updatedAtKey(ua) > updatedAtKey(lastCommitUpdatedAtRef.current)) lastCommitUpdatedAtRef.current = ua;
        return res;
      } finally {
        pendingCommitsRef.current -= 1;
      }
    },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [persistRaw.commit, persistRaw.fetchState, persistRaw.remove]);
  /** 自分の書き込みが全部終わり、最後に書いた行の通知が手元の `bs` に届いているか（`cpuDriver.ts` `lastCommitArrived`）。 */
  const ownCommitsArrived = (row: BattleStateRow | null | undefined) => lastCommitArrived({
    pendingCommits: pendingCommitsRef.current, localUpdatedAt: row?.updated_at, lastCommitUpdatedAt: lastCommitUpdatedAtRef.current,
  });
  // ゲーム開始時セットアップ（マリガン選択＋アシストルリグ配置の中間状態）
  const { mulliganSelected, setMulliganSelected } = useGameStartSetup();
  // シグニ召喚ゾーン選択フロー
  const {
    pendingSigniSummon, setPendingSigniSummon, closeZoneSignal, setCloseZoneSignal,
  } = useSigniSummonFlow();
  const [pendingResonaSummon, setPendingResonaSummon] = useState<ResonaSummonCandidate | null>(null);
  const [selectedResonaPayment, setSelectedResonaPayment] = useState<ResonaPaymentItem[]>([]);
  const {
    showEndConfirm, setShowEndConfirm, showSetupLeaveConfirm, setShowSetupLeaveConfirm,
    showEnergySkipConfirm, setShowEnergySkipConfirm, showGrowSkipConfirm, setShowGrowSkipConfirm,
    showSigniAttackSkipConfirm, setShowSigniAttackSkipConfirm, showMustAttackWarning, setShowMustAttackWarning,
    showLrigAttackSkipConfirm, setShowLrigAttackSkipConfirm, showUpkeepPayConfirm, setShowUpkeepPayConfirm,
    showRemoveBlockedWarn, setShowRemoveBlockedWarn,
  } = usePhaseConfirms();
  const {
    showGrowModal, setShowGrowModal, freeGrowFilter, setFreeGrowFilter,
    pendingGrowCard, setPendingGrowCard, selectedGrowCost, setSelectedGrowCost,
    openFreeGrow, closeGrowModal, toggleGrowCost,
    growPayDiscard, toggleGrowPayDiscard, growRestrictNames,
  } = useGrowModal();
  const {
    showArtsModal, setShowArtsModal, pendingArtsCard, setPendingArtsCard,
    pendingArtsEffectiveCost, setPendingArtsEffectiveCost, selectedArtsCost, setSelectedArtsCost,
    selectedArtsDiscard, setSelectedArtsDiscard, selectedArtsUseCostPay, setSelectedArtsUseCostPay,
    declaredArtsChooseCount, setDeclaredArtsChooseCount, betAmount, setBetAmount, isEncore, setIsEncore,
    isBoosting, setIsBoosting, openArtsModal, closeArtsModal, toggleArtsCost,
  } = useArtsModal();
  const { showRemoveModal, setShowRemoveModal, selectedRemoveZones, setSelectedRemoveZones, openRemoveZone } = useRemoveZone();
  const {
    pendingSpellCast, setPendingSpellCast, selectedSpellCost, setSelectedSpellCost, selectedSpellDiscard, setSelectedSpellDiscard, selectedSpellUseCostPay, setSelectedSpellUseCostPay,
    openSpellCast, closeSpellCast, toggleSpellCost,
  } = useSpellCast();
  // 手札【起】／トラッシュ自己起動／エナACTIVATED／ルリグ付与【起】
  const {
    pendingHandActivated, setPendingHandActivated, selectedHandActivatedCost, setSelectedHandActivatedCost,
    pendingTrashActivated, setPendingTrashActivated, selectedTrashActivatedCost, setSelectedTrashActivatedCost,
    selectedTrashActivatedDiscard, setSelectedTrashActivatedDiscard,
    selectedTrashActivatedExceed, setSelectedTrashActivatedExceed,
    selectedTrashActivatedTrashExile, setSelectedTrashActivatedTrashExile,
    pendingEnergyActivated, setPendingEnergyActivated, selectedEnergyActivatedCost, setSelectedEnergyActivatedCost,
    pendingLrigGranted, setPendingLrigGranted, selectedLrigGrantedCost, setSelectedLrigGrantedCost,
    selectedLrigGrantedFieldBanish, setSelectedLrigGrantedFieldBanish,
    selectedLrigGrantedHandDiscard, setSelectedLrigGrantedHandDiscard,
    selectedLrigGrantedEnergyTrash, setSelectedLrigGrantedEnergyTrash,
    selectedLrigGrantedTrashExile, setSelectedLrigGrantedTrashExile,
    openHandActivated, closeHandActivated, openTrashActivated, closeTrashActivated,
    openEnergyActivated, closeEnergyActivated, openLrigGranted, closeLrigGranted,
  } = useActivatedModals();
  // ガード応答（バリア【起】／G154 BURST 回避）
  const {
    pendingGuardBarrierAct, setPendingGuardBarrierAct, selectedBarrierGuardCard, setSelectedBarrierGuardCard,
    negateEscape, selectedNegateEscape, setSelectedNegateEscape,
    attackFieldTrashPayment, selectedAttackFieldTrashZones, setSelectedAttackFieldTrashZones,
    attackHandDiscardPayment, selectedAttackHandDiscard, setSelectedAttackHandDiscard,
    openGuardBarrierAct, closeGuardBarrierAct, openNegateEscape, closeNegateEscape,
    openAttackFieldTrashPayment, closeAttackFieldTrashPayment,
    openAttackHandDiscardPayment, closeAttackHandDiscardPayment,
  } = useGuardResponses();
  const {
    pendingCutinCard, setPendingCutinCard, selectedCutinCost, setSelectedCutinCost,
    selectedCutinExceed, setSelectedCutinExceed, closeCutin, toggleCutinCost,
    selectedCutinUnderTrash, setSelectedCutinUnderTrash,
    cutinBetAmount, setCutinBetAmount,
  } = useCutin();
  // シグニ起動効果
  const {
    pendingSigniActivated, setPendingSigniActivated, selectedSigniActivatedCost, setSelectedSigniActivatedCost,
    selectedSigniActivatedDiscard, setSelectedSigniActivatedDiscard,
    selectedSigniActivatedDiscardVar, setSelectedSigniActivatedDiscardVar,
    selectedSigniActivatedFieldTrash, setSelectedSigniActivatedFieldTrash,
    selectedSigniActivatedUnderTrash, setSelectedSigniActivatedUnderTrash,
    selectedSigniActivatedEnergyTrash, setSelectedSigniActivatedEnergyTrash,
    selectedSigniActivatedTrashExile, setSelectedSigniActivatedTrashExile,
    selectedSigniActivatedBeat, setSelectedSigniActivatedBeat,
    signiActCharmTrashVar, setSigniActCharmTrashVar,
    openSigniActivated, closeSigniActivated,
  } = useSigniActivated();
  // シグニ出現時コスト付き任意【出】効果（＋OPTIONAL_COST エナ選択）
  const {
    pendingSigniOnPlayCost, setPendingSigniOnPlayCost, selectedSigniOnPlayCost, setSelectedSigniOnPlayCost,
    selectedSigniOnPlayDiscard, setSelectedSigniOnPlayDiscard,
    selectedSigniOnPlayEnergyTrash, setSelectedSigniOnPlayEnergyTrash,
    selectedSigniOnPlayFieldTrash, setSelectedSigniOnPlayFieldTrash,
    selectedSigniOnPlayExceed, setSelectedSigniOnPlayExceed,
    selectedSigniOnPlayBeat, setSelectedSigniOnPlayBeat,
    selectedSigniOnPlayArtsTrash, setSelectedSigniOnPlayArtsTrash,
    selectedSigniOnPlayTrashToDeck, setSelectedSigniOnPlayTrashToDeck,
    selectedSigniOnPlayUnderTrash, setSelectedSigniOnPlayUnderTrash,
    signiOnPlayCharmTrashVar, setSigniOnPlayCharmTrashVar,
    selectedOptCost, setSelectedOptCost, closeSigniOnPlayCost,
  } = useSigniOnPlayCost();
  // キーピース
  const {
    showKeyModal, setShowKeyModal, pendingKeyCard, setPendingKeyCard, selectedKeyCost, setSelectedKeyCost,
    pendingKeyActivated, setPendingKeyActivated, selectedKeyActivatedCost, setSelectedKeyActivatedCost,
    selectedKeyActivatedDiscard, setSelectedKeyActivatedDiscard, keySubstituteEnabled, setKeySubstituteEnabled,
    openKeyModal, closeKeyModal, openKeyActivated, closeKeyActivated,
  } = useKeyModals();
  // アシストルリグ
  const {
    showAssistGrowModal, setShowAssistGrowModal, pendingAssistGrowCard, setPendingAssistGrowCard,
    pendingAssistSide, setPendingAssistSide, selectedAssistGrowCost, setSelectedAssistGrowCost,
    pendingAssistActivated, setPendingAssistActivated, selectedAssistActivatedCost, setSelectedAssistActivatedCost,
    selectedAssistActivatedDiscard, setSelectedAssistActivatedDiscard,
    openAssistGrow, closeAssistGrow, openAssistActivated, closeAssistActivated,
  } = useAssistModals();
  // ライフクロスクラッシュ時のカード拡大
  // エンドフェイズ手札捨て選択UI
  // エンドフェイズ手札捨て／カード拡大表示
  const {
    pendingEndDiscard, selectedEndDiscard, setSelectedEndDiscard,
    openEndDiscard, closeEndDiscard,
  } = useEndDiscard();
  const {
    burstCardZoomed, setBurstCardZoomed, opCheckCardZoomed, setOpCheckCardZoomed,
    cutinSpellZoomed, setCutinSpellZoomed,
  } = useZoomOverlays();
  // 効果インタラクション：SELECT_TARGET / SEARCH / CHOOSE / LOOK_AND_REORDER / スタック整列
  const {
    effectSelectedNums, setEffectSelectedNums, rearrangeSlots, setRearrangeSlots,
    expandedPickImgUrl, setExpandedPickImgUrl, stackOrderIds, setStackOrderIds,
    lookReorderOrder, setLookReorderOrder, lookReorderTrash, setLookReorderTrash,
    lookReorderBottom, setLookReorderBottom, selectedMultiChoiceIds, setSelectedMultiChoiceIds,
  } = useEffectInteraction();
  const pickLongPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // バトルログUI（展開トグル・ログ配列・自動スクロール ref）
  const { logExpanded, setLogExpanded, battleLogs, setBattleLogs, logScrollRef } = useBattleLog();
  const prevPhaseRef = useRef<string | null>(null);
  const prevTurnRef  = useRef<number | null>(null);
  // ON_ENERGY_CHARGE / ON_POWER_THRESHOLD 検知用スナップショット（前回観測時のエナ・パワー）
  const prevEnergyRef = useRef<{ host: string[]; guest: string[] } | null>(null);
  const prevPowersRef = useRef<Map<string, number> | null>(null);
  // Realtime で受け取った game_logs をローカル state に同期
  const prevGameLogsLenRef = useRef<number>(0);
  // defer: true のログを main update 後に一括 flush するバッファ
  const pendingLogsRef = useRef<import('../types').GameLog[]>([]);
  useEffect(() => {
    const remote = bs?.game_logs ?? [];
    if (remote.length > prevGameLogsLenRef.current) {
      setBattleLogs(remote.slice(-200));
      prevGameLogsLenRef.current = remote.length;
    }
  }, [bs?.game_logs]);

  const appendBattleLogs = useCallback((entries: string[], opts?: { defer?: boolean }) => {
    if (entries.length === 0 || !user) return;
    const now = new Date().toISOString();
    const newLogs = entries.map(action => ({ timestamp: now, user_id: user.id, action }));
    // ローカルに即時反映
    setBattleLogs(prev => {
      const next = [...prev, ...newLogs].slice(-200);
      prevGameLogsLenRef.current = next.length;
      return next;
    });
    if (opts?.defer) {
      // DB 書き込みを pendingLogsRef にバッファ（main update 後に一括 flush）
      pendingLogsRef.current.push(...newLogs);
    } else {
      // DB に即時書き込んで相手に同期
      supabase.rpc('append_battle_logs', { p_room_id: roomId, p_logs: newLogs })
        .then(({ error }) => { if (error) console.error('[battle_log]', error.message); });
    }
  }, [roomId, user]);

  const flushBattleLogs = useCallback(async () => {
    if (pendingLogsRef.current.length === 0) return;
    const toFlush = [...pendingLogsRef.current];
    pendingLogsRef.current = [];
    const { error } = await supabase.rpc('append_battle_logs', { p_room_id: roomId, p_logs: toFlush });
    if (error) console.error('[battle_log]', error.message);
  }, [roomId]);

  const transitioningRef = useRef(false);
  /** 🆕§5.1 `V-284`＝じゃんけんの解決を予約した「手の組」（再レンダーで張り直さないための鍵）。 */
  const jankenResolveRef = useRef<string | null>(null);
  const leavingRef = useRef(false);
  const stackProcessingRef        = useRef(false);  // resolveStackNext の多重実行防止
  const lastResolvedEntryIdRef    = useRef<string | null>(null); // 直前に処理したキュー先頭のID（DB伝播前の二重処理防止）
  const doPhaseAdvanceRef                = useRef<(() => Promise<void>) | null>(null);
  const triggerPendingCrashRef           = useRef<(() => Promise<void>) | null>(null);
  const resolveStackNextRef              = useRef<(() => Promise<void>) | null>(null);
  const handleCutinPassRef               = useRef<(() => Promise<void>) | null>(null);
  const checkPowerZeroBanishRef          = useRef<(() => Promise<void>) | null>(null);
  const checkContMutationsRef            = useRef<(() => Promise<void>) | null>(null);
  const checkRefreshTurnEndRef            = useRef<(() => Promise<void>) | null>(null);   // §5.6 `C-9` `R-28`
  const checkLimitExcessRef              = useRef<(() => Promise<void>) | null>(null);   // §5.3 `O-532`（`R-44`/`R-48`）
  const checkDeferredRefreshRef          = useRef<(() => Promise<void>) | null>(null);   // 2026-09-18 リフレッシュはすべての処理の後

  const resolvePendingSigniBattleRef     = useRef<(() => Promise<void>) | null>(null);
  const resolvePendingLrigAttackRef      = useRef<(() => Promise<void>) | null>(null);
  // 🆕§5.7 `S-5d` 第3段（2026-09-19）＝ルール処理の二重処理防止の指紋（旧 `last*KeyRef` 5本）は
  //   `controller/ruleChecks.ts` の `RuleCheckMemo` に束ねた。🔴**毎回作り直さない**（指紋が消えると同じ処理を何度も書く）。
  const ruleMemoRef = useRef(createRuleCheckMemo());
  const cpuTurnRef                = useRef<(() => Promise<void>) | null>(null); // CPU自動行動
  const cpuSetupRef               = useRef<(() => Promise<void>) | null>(null); // CPUセットアップ自動行動

  // フェーズ変化をバトルログに記録（アクティブプレイヤーのみDB書き込み）
  useEffect(() => {
    if (!bs) return;
    const phase = bs.turn_phase;
    const turn  = bs.turn_count;
    if (prevPhaseRef.current === phase && prevTurnRef.current === turn) return;
    if (prevPhaseRef.current !== null) {
      if (bs.active_user_id === user.id) {
        const msg = phase === 'UP'
          ? `── T${turn} あなたのターン開始 ──`
          : `[あなた] ${PHASE_LABEL[phase] ?? phase}フェイズ`;
        appendBattleLogs([msg]);
      } else if (bs.active_user_id === CPU_PLAYER_ID) {
        const msg = phase === 'UP'
          ? `── T${turn} CPUのターン開始 ──`
          : `[CPU] ${PHASE_LABEL[phase] ?? phase}フェイズ`;
        appendBattleLogs([msg]);
      }
    }
    prevPhaseRef.current = phase;
    prevTurnRef.current  = turn;
  }, [bs?.turn_phase, bs?.turn_count, bs?.active_user_id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    persist.fetchState()
      .then(({ data, error }) => {
        if (error) console.error('battle_states 取得エラー:', error.message);
        if (data) {
          setBs(data as BattleStateRow);
          if ((data as BattleStateRow).guest_id === CPU_PLAYER_ID) {
            setIsCpuBattle(true);
            supabase.from('rooms').select('guest_deck_id').eq('id', roomId).single()
              .then(async ({ data: rd }) => {
                if (!rd?.guest_deck_id) return;
                const { data: dd } = await supabase.from('decks')
                  .select(DECK_DATA_COLUMNS).eq('id', rd.guest_deck_id).single();
                if (dd) setCpuDeckData(dd as unknown as NonNullable<typeof cpuDeckData>);
              });
          }
        }
      });

    supabase.from('decks').select(DECK_DATA_COLUMNS).eq('id', myDeckId).single()
      .then(({ data }) => {
        if (data) setMyDeckData(data as unknown as NonNullable<typeof myDeckData>);
      });

    const channel = supabase
      .channel(`battle-${roomId}`)
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'battle_states', filter: `room_id=eq.${roomId}`,
      }, (payload) => { setBs(payload.new as BattleStateRow); })
      .on('postgres_changes', {
        event: 'DELETE', schema: 'public', table: 'rooms', filter: `id=eq.${roomId}`,
      }, () => {
        if (!leavingRef.current) { leavingRef.current = true; onBack(); }
      })
      .subscribe((status) => {
        // 接続後に最新データを再取得（リロード時に Realtime が間に合わない場合の対策）
        if (status === 'SUBSCRIBED') {
          persist.fetchState()
            .then(({ data }) => { if (data) setBs(data as BattleStateRow); });
        }
      });

    return () => { supabase.removeChannel(channel); };
  }, [roomId, myDeckId]);

  useEffect(() => {
    if (!bs) return;
    const isHost = user.id === bs.host_id;

    // じゃんけん結果処理（両プレイヤー共通：どちらか一方が実行）
    // 🔴🆕**2026-09-22（§5.1 `V-284`）＝再レンダーのたびに解決を作り直さない。**
    //   旧実装は `setTimeout(1800ms)` を cleanup で**毎回取り消して張り直して**いた＝
    //   1.8秒より短い間隔で `bs` が更新され続けると（realtime のエコー等）**解決が永久に先送りされ**、
    //   画面が「あいこ！ もう一度選んでください…」のまま固まる。
    //   📏実測＝実機の通し対戦（`verifyFullMatch.mjs cpu`）が**3回中3回、初回だけ**この形で止まった
    //   （再実行では通るので「たまの flake」に見えていた）。
    //   🔑**直し方＝同じ手の組に対する予約は1つだけ**（`jankenResolveRef` に組を覚える）＝
    //     再レンダーでは何もせず、走っているタイマーをそのまま完走させる。
    //   ⚠**cleanup でタイマーを消さない**（消すと元の症状に戻る）。⚠失敗時は予約を解放して再試行できるようにする。
    if (bs.setup_phase === 'JAN_KEN' && bs.host_janken && bs.guest_janken) {
      const pairKey = `${bs.host_janken}/${bs.guest_janken}`;
      if (jankenResolveRef.current === pairKey) return;
      jankenResolveRef.current = pairKey;
      const winner = jankenWinner(bs.host_janken, bs.guest_janken, bs.host_id, bs.guest_id);
      const update = reduceBattle(bs, { type: 'RESOLVE_JANKEN', winnerId: winner });
      setTimeout(() => {
        persist.commit(update)
          .then(() => { jankenResolveRef.current = null; })
          .catch(() => { jankenResolveRef.current = null; });
      }, 1800);
      return;
    }

    // 以下はホストのみが担当するフェーズ遷移
    if (!isHost || transitioningRef.current) return;

    if (bs.setup_phase === 'LRIG_SELECT' && bs.host_lrig_selected && bs.guest_lrig_selected) {
      transitioningRef.current = true;
      persist.commit(reduceBattle(bs, { type: 'SET_SETUP_PHASE', phase: 'MULLIGAN' }))
        .then(() => { transitioningRef.current = false; });
      return () => { transitioningRef.current = false; };
    }
  }, [
    bs?.setup_phase,
    bs?.host_lrig_selected, bs?.guest_lrig_selected,
    bs?.host_janken, bs?.guest_janken,
  ]);

  // PLAYING 移行時に loading をリセット（マリガン確定後の loading=true をクリア）
  useEffect(() => {
    if (bs?.global_phase === 'PLAYING') setLoading(false);
  }, [bs?.global_phase]);

  // ── CPU 対戦：セットアップ自動行動 ──────────────────────────
  useEffect(() => {
    if (!bs || !isCpuBattle || bs.global_phase !== 'SETUP') return;
    if (bs.setup_phase === 'JAN_KEN'     && bs.guest_janken)        return;
    if (bs.setup_phase === 'LRIG_SELECT' && bs.guest_lrig_selected) return;
    if (bs.setup_phase === 'MULLIGAN'    && bs.guest_mulligan_done) return;
    if (bs.setup_phase === 'LRIG_SELECT' && !cpuDeckData)           return;
    if (cpuTimerRef.current) clearTimeout(cpuTimerRef.current);
    cpuTimerRef.current = setTimeout(() => { cpuSetupRef.current?.(); }, CPU_ACTION_DELAY);
    return () => { if (cpuTimerRef.current) clearTimeout(cpuTimerRef.current); };
  }, [isCpuBattle, bs?.setup_phase, bs?.guest_janken, bs?.guest_lrig_selected, bs?.guest_mulligan_done, cpuDeckData]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── CPU 対戦：ターン自動行動 ──────────────────────────────────
  // 🔴🆕§5.1 `V-247`（2026-09-17）＝**CPU の起動を3点で守る**（判定は `cpuDriver.ts`）。
  //   ①**依存は盤面の更新そのもの（`bs`）**＝旧実装は依存を手で選んでいた（ルリグのトップ・行動履歴の長さ …）。
  //     選ばれていない値だけを動かす行動（CPU のライズ＝手札と場／アシストグロウ＝アシストの枠／`cpu_used_card_nums_this_turn`）の後は
  //     **依存が動かず二度と起動しない**＝永久停止（過去にも `v78CpuGrowsButSkipsOnPlayWithoutCoin` で同じ形を1本ずつ足していた）。
  //   ②**実行中は重ねない**＝ENERGY のように「書く → 900ms 待つ → 次を書く」行動は、待っている間に1段目の通知で再起動し、
  //     **古い盤面で同じ分岐をもう1回**走らせうる（GROW への遷移・開始時トリガーの二重収集）。
  //   ③**止まったら DB を読み直す**（見張り）＝Realtime の取りこぼし／行動中に届いた通知の破棄で止まった盤面を、
  //     ローカルと DB が違えば反映・同じなら再実行で再開する。⚠**読み直さずに再実行しない**（古い盤面で二重に動く）。
  const bsRef = useRef(bs);
  bsRef.current = bs;
  const cpuRunningRef = useRef(false);
  const cpuDroppedRef = useRef(false);
  /** 通知待ちで起動を捨てた＝**盤面の中身が変わらない更新**が届いたときにも起動し直す（鍵が動かないので通常の起動が来ない）。 */
  const cpuWaitingEchoRef = useRef(false);
  const cpuLastBsChangeAtRef = useRef(Date.now());
  const cpuLastRunEndAtRef = useRef(0);
  const cpuResyncRef = useRef<((reason: string) => Promise<void>) | null>(null);
  // ⚠依存は**ログを除いた盤面の中身**（`cpuBattleKey`）＝ログの追記だけでタイマーをリセットしない。
  const cpuKey = useMemo(() => cpuBattleKey(bs), [bs]);
  useEffect(() => { cpuLastBsChangeAtRef.current = Date.now(); }, [cpuKey]);
  const runCpuTurn = useCallback(async (force = false) => {
    if (cpuRunningRef.current) { cpuDroppedRef.current = true; return; }
    // 🔴**最後の書き込みの通知がまだ届いていない盤面では走らない**（`force`＝見張りが DB と照合済みのときだけ免除）。
    //   1回の実行が「シグニ配置を書く → 待つ → 使用済みの印を書く → アシストグロウを書く」と続くと、
    //   先の書き込みの通知で次の実行が始まり、**後の書き込みが届いていない盤面で同じアシストグロウをもう一度選んでいた**
    //   （機構デッキの通し対戦で3戦とも再現＝「[CPU] アシストグロウ」のログが2行続いた）。
    //   届けば盤面の鍵が変わって起動が積まれ直すので、ここで捨ててよい（届かなければ見張りが読み直す）。
    if (!force && !lastCommitArrived({
      pendingCommits: pendingCommitsRef.current, localUpdatedAt: bsRef.current?.updated_at, lastCommitUpdatedAt: lastCommitUpdatedAtRef.current,
    })) { cpuWaitingEchoRef.current = true; return; }
    cpuRunningRef.current = true;
    cpuDroppedRef.current = false;
    try {
      await cpuTurnRef.current?.();
    } catch (e) {
      console.error('[CPU] 行動中に例外', e);
    } finally {
      cpuRunningRef.current = false;
      cpuLastRunEndAtRef.current = Date.now();
      // 実行中に届いた起動を捨てた＝その通知が「最後の書き込みの通知」だと、もう起動が来ない。読み直して確かめる。
      if (cpuDroppedRef.current) {
        cpuDroppedRef.current = false;
        setTimeout(() => { void cpuResyncRef.current?.('実行中の起動を破棄'); }, CPU_ACTION_DELAY * 2);
      }
    }
  }, []);
  // 通知待ちで起動を捨てた後、盤面の中身が変わらない更新（ログ追記など）で届いた場合も起動し直す。
  useEffect(() => {
    if (!cpuWaitingEchoRef.current || !isCpuBattle || !cpuShouldAct(bs)) return;
    if (!lastCommitArrived({ pendingCommits: pendingCommitsRef.current, localUpdatedAt: bs?.updated_at, lastCommitUpdatedAt: lastCommitUpdatedAtRef.current })) return;
    cpuWaitingEchoRef.current = false;
    if (cpuTimerRef.current) clearTimeout(cpuTimerRef.current);
    cpuTimerRef.current = setTimeout(() => { void runCpuTurn(); }, CPU_ACTION_DELAY);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bs, isCpuBattle, runCpuTurn]);
  cpuResyncRef.current = async (reason: string) => {
    if (cpuRunningRef.current) return;
    const { data } = await persist.fetchState();
    const local = bsRef.current;
    if (!data || !local) return;
    const fresh = normalizeBattleRow(data as BattleStateRow);
    if (!sameBattleForCpu(local, fresh)) {
      console.warn(`[CPU watchdog] ${reason}: 盤面を DB から読み直して反映（phase=${fresh.turn_phase}）`);
      setBs(fresh);
      return;
    }
    if (!cpuShouldAct(fresh) || cpuWaitingForHuman(fresh)) return;
    console.warn(`[CPU watchdog] ${reason}: 盤面が動かないので CPU を再実行（phase=${fresh.turn_phase} turn=${fresh.turn_count}）`);
    void runCpuTurn(true);
  };
  useEffect(() => {
    if (!isCpuBattle || !cpuShouldAct(bs)) return;
    if (cpuTimerRef.current) clearTimeout(cpuTimerRef.current);
    cpuTimerRef.current = setTimeout(() => { void runCpuTurn(); }, CPU_ACTION_DELAY);
    return () => { if (cpuTimerRef.current) clearTimeout(cpuTimerRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCpuBattle, cpuKey, runCpuTurn]);
  // 見張り（2秒ごと）。⚠人間の応答待ち（`cpuWaitingForHuman`）では**再実行しない**（`cpuResyncRef` が DB の行で判定する）。
  // 🔴🆕2026-09-20＝**応答待ちでも読み直しだけはする**。旧＝応答待ちの盤面では見張りそのものを止めていた＝
  //   人間が【ガードしない】を押した後の通知（クラッシュ→チェックゾーン）を取りこぼすと、画面は「ルリグに攻撃された！」のまま
  //   **ライフバースト確認を覆い続け、二度と DB を読まない**（実機 `verifyFullMatch.mjs cpu` の T2 で手詰まり＝DB はライフ5・画面は6）。
  useEffect(() => {
    if (!isCpuBattle) return;
    const id = setInterval(() => {
      const cur = bsRef.current;
      if (!cpuWatchdogShouldCheck({
        shouldAct: cpuShouldAct(cur),
        running: cpuRunningRef.current, now: Date.now(),
        lastBsChangeAt: cpuLastBsChangeAtRef.current, lastRunEndAt: cpuLastRunEndAtRef.current,
      })) return;
      cpuLastBsChangeAtRef.current = Date.now();   // 読み直しの連打を防ぐ
      void cpuResyncRef.current?.('盤面が一定時間動かない');
    }, 2000);
    return () => clearInterval(id);
  }, [isCpuBattle]);


  // CPU対戦：effectスタック整列をCPUが自動確定
  useEffect(() => {
    if (!isCpuBattle || !bs?.effect_stack || loading) return;
    const stack = bs.effect_stack;
    const cpuIsTurnPlayer = bs.active_user_id === CPU_PLAYER_ID;
    const cpuNeedsOrder = cpuIsTurnPlayer
      ? (!stack.orderTurnDone && stack.pendingTurn.length > 1)
      : (!stack.orderOppDone && stack.pendingOpp.length > 1);
    if (!cpuNeedsOrder) return;
    const cpuPending = cpuIsTurnPlayer ? stack.pendingTurn : stack.pendingOpp;
    const timer = setTimeout(async () => {
      const orderedIds = cpuPending.map(e => e.id);
      const newStack = cpuIsTurnPlayer
        ? confirmTurnOrder(stack, orderedIds)
        : confirmOppOrder(stack, orderedIds);
      await persist.commit(reduceBattle(bs, { type: 'SET_STACK', stack: newStack, settle: true }));
    }, CPU_ACTION_DELAY);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCpuBattle, bs?.effect_stack]);

  // ── バトルに必要なカードだけを抽出（全1万枚+ を毎回スキャンしない） ────────────
  // 自分のデッキ + bs の全ゾーンにある CardNum を収集し、大本の cards から Map を作る。
  // 大本の cards 配列は一切変更しない。
  const battleCardNums = useMemo(() => {
    const nums = new Set<string>();
    // インスタンスID（CardNum#N）からCardNumを取り出して登録
    const addAll = (arr?: string[]) => arr?.forEach(n => nums.add(getCardNum(n)));
    const addState = (s: PlayerState) => {
      addAll(s.deck); addAll(s.lrig_deck); addAll(s.hand);
      addAll(s.life_cloth); addAll(s.trash); addAll(s.lrig_trash);
      addAll(s.energy); addAll(s.field.lrig);
      // ※ battleCardMap は base CardNum でフィルタするため、instanceId（CardNum#N）ではなく
      //    getCardNum で base 化して登録する（通常は deck/hand 経由で既に載るが、盤面直接注入や
      //    効果生成シグニも確実にロードするため）。
      s.field.signi.forEach(stack => stack?.forEach(n => nums.add(getCardNum(n))));
      if (s.field.check) nums.add(getCardNum(s.field.check));
      // 🆕チェックゾーンに留まっているカード（§5.3 `O-143`）＝どのゾーンにも居ないのでここで拾う。
      (s.field.check_rest ?? []).forEach(n => nums.add(getCardNum(n)));
      if (s.field.key_piece) nums.add(getCardNum(s.field.key_piece));
      (s.field.key_piece_extra ?? []).forEach(n => nums.add(getCardNum(n)));
      addAll(s.field.assist_lrig_l); addAll(s.field.assist_lrig_r);
      (s.field.signi_charms ?? []).forEach(n => n && nums.add(getCardNum(n)));
      // 🆕🔴**§5.3 `O-263`（2026-09-06・実機 `V-169` で発見）＝【トラップ】として設置したカード。**
      //   🔴**ここを抜くと、設置した瞬間にそのカードの CardData が `battleCardMap` から落ちる**
      //   （手札／デッキからは外れ、他のどのゾーンにも居ない）＝`trapIconEffectOf` が
      //   `cardMap.get(...) === undefined` で **null を返し、【トラップ】は場を離れるのに
      //   《トラップアイコン》が1度も解決しない無言の no-op** になる。
      //   ⚠**`pending_effect` が候補として抱えている間だけ「たまたま動く」**（下の O-142 の枝で載るため）＝
      //     対話を伴う入口（`explicit`）では緑、伴わない入口（`source_zone`）だけが黙って死ぬ、という
      //     切り分けにくい形で出ていた。
      //   🔑`signi_facedown_attached` / `signi_soul` / `signi_seeds` と**同じ穴**（上の注記と同根）。
      (s.field.signi_traps ?? []).forEach(n => n && nums.add(getCardNum(n)));
      // 🆕**【マジックボックス】も同じ形**（`INTERNAL_SET_MAGIC_BOX` が deck/hand から抜いて
      //   `signi_magic_boxes` へ置く＝どのゾーンにも居なくなる）。上と同じ理由でここに載せる。
      (s.field.signi_magic_boxes ?? []).forEach(n => n && nums.add(getCardNum(n)));
      // §5.3 `O-81`＝**裏向きで付けられたカード**（`signi_facedown_attached`）。⚠**ここを抜くと
      //   付けた瞬間にそのカードの CardData が battleCardMap から落ちる**（手札からは外れ、他のどのゾーンにも居ない）。
      //   実測（2026-08-26 実機）＝`WX16-003-E3` の `FACEDOWN_REVEALED_JUST{cardType:'シグニ'}` が
      //   `cardMap.get(...)===undefined` で常に false になり、離脱時のバニッシュが**一度も発火しなかった**。
      (s.field.signi_facedown_attached ?? []).forEach(arr => arr?.forEach(n => nums.add(getCardNum(n))));
      (s.field.signi_soul   ?? []).forEach(n => n && nums.add(getCardNum(n)));
      (s.field.signi_seeds  ?? []).forEach(n => n && nums.add(getCardNum(n)));
      (s.field.facedown_signi ?? []).forEach(n => n && nums.add(getCardNum(n))); // 裏向きシグニ（WXDi-P10-034）のカードデータをロード
      // signi_acce: 手札/エナから装着されたアクセカード自身のロードに必須（装着でhand/energyから外れるため
      //   これを走査しないと自身のON_ACCE_ATTACH能力等がeffectsMapから脱落する。WXK05-041デコレ）。
      allAcceCards(s.field).forEach(n => nums.add(getCardNum(n)));
      addAll(s.field.free_zone);
      // beat_zone: シグニが【ビート】になると field.signi から外れ beat_zone に移るため、これを走査しないと
      //   なったカード自身の ON_BECOME_BEAT（self）が effectsMap から脱落し collectBeatBecameTriggers の
      //   self ループ（effectsMap.get(becameNum)）が空を引く（続き121・WDK14-017 で確認）。any_ally 側は
      //   場に残る発火元シグニ（WDK14-014）から拾えるため非対称に self だけ欠落していた。
      addAll(s.field.beat_zone);
    };
    if (myDeckData) { addAll(myDeckData.main_deck); addAll(myDeckData.lrig_deck); }
    // 🔴CPU のデッキも載せる＝載せないと、人間と別のデッキを持たせた CPU は対戦開始時にルリグの種別・レベルを
    //   引けず（`cardMap.get(...)===undefined`）、**ルリグを置けないままセットアップが止まっていた**
    //   （検証は人間と同じデッキで回していたので出なかった）。
    if (cpuDeckData) { addAll(cpuDeckData.main_deck); addAll(cpuDeckData.lrig_deck); }
    if (bs) { addState(bs.host_state); addState(bs.guest_state); }
    // 🔴🆕**解決待ちの `pending_effect` が抱えているカードも載せる**（§5.3 `O-142`・2026-08-29 実機で発見）。
    //   `LOOK_AND_REORDER` は見たカードを**デッキから抜いて `interaction.cards` に持つ**ので、その間だけ
    //   どのゾーンにも居らず `battleCardMap` から落ちる。⇒ resume の continuation で走る後続ステップが
    //   `cardMap.get(...)===undefined` を引き、**そのカードの属性を読む判定が全部 false / 0 に倒れる**。
    //   実測（実機 `o142LevelSame`）＝「この方法で公開されたシグニの**レベルと同じだけ**－」が
    //   Lv3 のカードでも **0**（＝レベル修整なし）になった。デッキに同名カードが他にも残っていると
    //   **たまたま正しく動く**ため、`WD01-013`（複数枚）では気づけなかった。
    //   ⚠`signi_facedown_attached` を足したとき（`WX16-003-E3`）と**同じクラスの穴**＝
    //   「どのゾーンにも居ない一時的な保持場所」は全部ここへ足す。
    //   ⚠**深さ優先で全文字列を拾う**＝`cards` / `candidates` / `cardNum` / `revealed` … と
    //   `PendingInteractionDef` の形ごとにキー名が違い、増えるたびに漏れるため。
    //   カード番号でない文字列（effectId 等）が混ざっても `cards.filter` で落ちるので無害。
    if (bs?.pending_effect) {
      const addFromPending = (v: unknown): void => {
        if (typeof v === 'string') { nums.add(getCardNum(v)); return; }
        if (Array.isArray(v)) { v.forEach(addFromPending); return; }
        if (v && typeof v === 'object') Object.values(v).forEach(addFromPending);
      };
      addFromPending(bs.pending_effect);
    }
    nums.add('WXDi-P07-TK01-A'); // サーバントZEROトークン（常時ロード）
    nums.add('WX24-D1-TK1');     // 【リミットアッパー】トークン（ルリグゾーン左に表示・常時ロード）
    // クラフトカード（ADD_CRAFT_TO_LRIG_DECKでゲーム外から生成・cardMapに必要）
    nums.add('WXK01-TK-01A');   // 棘々迷路
    nums.add('WXK03-TK-01B');   // 落華流粋
    nums.add('WXK09-TK-01A');   // 改造素材
    nums.add('WX25-P1-TK1');   // ダーク・バウンダリー（ヤミノアーツ①）
    nums.add('WX25-P1-TK2');   // 背闇之陣（ヤミノアーツ②）
    nums.add('WX25-P1-TK3');   // ダーク・アナライズ（ヤミノアーツ③）
    nums.add('WX25-P1-TK4');   // 闇気揚々（ヤミノアーツ④）
    nums.add('WX25-P1-TK5');   // ダーク・アウト（ヤミノアーツ⑤）
    // シグニトークン（ADD_TO_FIELD cardName指定で生成されるゲーム外カード）
    nums.add('WX25-CP1-TK1A');   // 雷ちゃん
    nums.add('WX24-P3-TK1A');    // ママ勇者
    nums.add('WXDi-CP02-TK01A'); // ペロロ人形
    nums.add('WXDi-CP02-TK02A'); // 雨雲号
    nums.add('WXDi-CP02-TK03B'); // クルセイダーちゃん
    nums.add('WX25-P1-TK6');     // 幻怪 ヤミノザンシ（ON_LEAVE_FIELD で怪異シグニ離脱時に生成）
    nums.add('WX25-P3-TK03');    // 【みこみこ親衛隊】キーワードトークン（ON_TURN_END trigger用）
    // レゾナクラフト（ADD_CARD_TO_LRIG_DECK_HIDDEN でゲーム外から生成・ルリグデッキへ。G039）
    nums.add('WXDi-P11-TK01');   // 白羅星姫 サタン
    nums.add('WXDi-P11-TK02');   // 白羅星姫 フルムーン
    nums.add('WXDi-P11-TK03');   // 緑参ノ遊姫 メリゴラン
    nums.add('WXDi-P11-TK04');   // 緑参ノ遊姫 アスレ【HARD】
    nums.add('WXDi-P11-TK05');   // 黒大幻蟲 アラクネ・パイダ
    nums.add('WXDi-P11-TK06');   // 黒大幻蟲 オウグソク【FA】
    nums.add('WX25-P2-TK03');    // コードヒート ウィクロンジャービークル
    nums.add('WX25-P2-TK04');    // コードヒート ウィクロンジャーロボ
    nums.add('WX25-P2-TK05');    // 蒼穹将姫 ニヴルヘイム
    nums.add('WX25-P2-TK06');    // 蒼穹将姫 ユミル
    // アクセクラフト（signi_acce はaddStateが走査しない＝反応的ロード不可のため必須。WXDi-P09-007）
    nums.add('WXDi-P09-TK01A');  // コードイート ケチャチャ
    nums.add('WXDi-P09-TK02A');  // コードイート セアブラマシマシ
    nums.add('WXDi-P09-TK03A');  // コードイート オンタマ
    // ハスターリク（hastarliq_zones はaddStateが走査しない＝反応的ロード不可のため必須。WXDi-P05-016）
    nums.add('WXDi-P05-TK01A');  // 【ハスターリク】
    // ピース/クラフト（ADD_CRAFT_TO_LRIG_DECK でルリグデッキへ。WXDi-P16-009/010/011）
    nums.add('WXDi-P16-TK01');   // インビンシブル・ストーリー
    // フェゾーネマジック（スペル/クラフト。WXDi-P14-006/007/008/009/071）
    nums.add('WXDi-P14-TK01');   // フェゾーネマジック・ホワイト
    nums.add('WXDi-P14-TK02');   // フェゾーネマジック・レッド
    nums.add('WXDi-P14-TK03');   // フェゾーネマジック・BLUE
    nums.add('WXDi-P14-TK04');   // フェゾーネマジック・グリーン
    nums.add('WXDi-P14-TK05');   // フェゾーネマジック・ブラック
    // 下に置くクラフト（PLACE_CARD_UNDER_SIGNI。WX25-CP1-083 / WXDi-CP02-061）
    nums.add('WX25-CP1-TK2A');   // 給食推進車両
    nums.add('WXDi-CP02-TK03A'); // 虎丸
    // バリアトークン（free_zoneは反応的ロード可だが初回描画安定化のため明示）
    nums.add('WX24-P1-TK2A');    // 【ルリグバリア】
    nums.add('WX26-CP1-TK01');   // 【シグニバリア】
    // 変身/REV先（field.signi等へ配置され反応的ロードされるが、確実性のため明示）
    nums.add('WXDi-P13-003B');   // 未知の巫女 マユ
    nums.add('WXDi-P13-004B');   // UNKNOWN-CODE-RU-
    nums.add('WXDi-P16-001B');   // 扉の俯瞰者 ウトゥルス
    nums.add('WXDi-P11-010B');   // 夢限 -A-
    // 🔴🆕**裏返し先は「反応的ロード」では間に合わない**（§5.3 `O-226`・2026-09-06・実機で発覚）＝
    //   `card_identity_overrides` を書く engine は `ctx.cardMap.has(flipTo)` を fail-closed で見るので、
    //   ここに無いカードへは**そもそも裏返らない**（＝どのゾーンにも居ないので反応的には載らない）。
    //   golden では全カードの cardMap を渡すため**この穴は再現しない**＝実機でしか出ない。
    //   ⚠この表は静かな上限＝新しい両面ルリグを足したらここにも足す。
    //   守りは `goldenTest.ts` の「§5.3 O-226 裏面ロード」＝live の全 `flipTo` がここに在ることを assert する。
    nums.add('WXK03-003B');      // 夢限 -Ｅ-
    nums.add('PR-Di017B');       // REV:アンコーリング
    // 解決待ちのスペル/効果は一時的にどのゾーンにも属さない（pending_spell は hand から除かれ pending に保持）。
    // この瞬間に effectsMap から脱落すると handleCutinPass で spellEff=undefined となり効果が no-op 化するため、
    // pending_spell.card_num と pending_effect.sourceCardNum も明示的にロード対象へ含める。
    if (bs?.pending_spell?.card_num) nums.add(getCardNum(bs.pending_spell.card_num));
    if (bs?.pending_effect?.sourceCardNum) nums.add(getCardNum(bs.pending_effect.sourceCardNum));
    for (const n of pendingEffectCardNums(bs?.pending_effect)) nums.add(n);
    return nums;
  }, [myDeckData, cpuDeckData, bs]);

  const battleCardMap = useMemo(() => {
    // namePool の候補検索と resume 時の妥当性検証に限り、全カードデータを同じ ctx 経路へ載せる。
    // pending 自体には候補を積まないため、永続化サイズは増えない。
    const needsAllCardNames = bs?.pending_effect?.interaction.type === 'CHOOSE'
      && bs.pending_effect.interaction.namePool?.source === 'all_cards';
    const baseCards = needsAllCardNames ? cards : cards.filter(c => battleCardNums.has(c.CardNum));
    // 🆕§5.7 `S-5d` 第3段（2026-09-19）＝本体は `controller/battleMaterials.ts`（ヘッドレスは同じ関数で材料を作る）。
    return buildBattleCardMap({ bs, baseCards, userId: user.id });
  }, [cards, battleCardNums, bs, user.id]);

  // ── 対戦開始：ルリグの自動配置（デッキ編成の指定どおり） ──────────────
  // 🆕2026-09-17（ユーザー決定）＝対戦開始時のルリグ選択画面を廃止し、**デッキで指定したセンター／アシスト左右をそのまま置く**。
  //   どれを置くかは CPU と同じ `resolveDeckLrigSetup`、盤面は同じ `buildLrigSetupState`。
  //   ⚠二重配置の防止＝書き込み中は ref で止め、失敗したら外す（成功すれば `*_lrig_selected` が立って入口で止まる）。
  const lrigAutoPlaceRef = useRef(false);
  useEffect(() => {
    if (!bs || bs.global_phase !== 'SETUP' || bs.setup_phase !== 'LRIG_SELECT' || !myDeckData) return;
    const localIsHost = user.id === bs.host_id;
    if (localIsHost ? bs.host_lrig_selected : bs.guest_lrig_selected) return;
    if (lrigAutoPlaceRef.current) return;
    const pick = resolveDeckLrigSetup(myDeckData.lrig_deck, lrigRolesOfRow(myDeckData), battleCardMap);
    if (!pick) return; // 指定が対戦に出せない形＝画面が理由を出す
    lrigAutoPlaceRef.current = true;
    // ゲストはホストとinstance IDが衝突しないよう #g プレフィックスを使う
    const assignFn = localIsHost ? assignInstanceIds : assignGuestInstanceIds;
    const mainWithIds = assignFn(shuffle(myDeckData.main_deck));
    const lrigWithIds = assignFn(myDeckData.lrig_deck);
    const myState: PlayerState = buildLrigSetupState({
      lrigWithIds, mainWithIds, centerId: lrigWithIds[pick.centerIdx],
      assistLId: pick.assistIdx ? lrigWithIds[pick.assistIdx[0]] : null,
      assistRId: pick.assistIdx ? lrigWithIds[pick.assistIdx[1]] : null,
      cardMap: battleCardMap,
    });
    persist.commit(reduceBattle(bs, {
      type: 'SELECT_LRIG', isHost: localIsHost, selectedCardNum: myDeckData.lrig_deck[pick.centerIdx], state: myState,
    })).then(res => { if (res.error) lrigAutoPlaceRef.current = false; }, () => { lrigAutoPlaceRef.current = false; });
  }, [bs?.global_phase, bs?.setup_phase, bs?.host_lrig_selected, bs?.guest_lrig_selected, myDeckData, battleCardMap]); // eslint-disable-line react-hooks/exhaustive-deps


  // サブコンポーネントや既存ヘルパーに渡す配列（最大〜100枚）。宣言UI用に全カードを載せた間も
  // effectsMap の構築対象は従来どおり対戦に関係するカードだけに保つ。
  const battleCards = useMemo(() => [...battleCardMap.entries()]
    .filter(([key]) => battleCardNums.has(getCardNum(key)))
    .map(([, card]) => card), [battleCardMap, battleCardNums]);

  // CONTINUOUS 効果マップ（ベース: カードデータのみ、静的）
  const baseEffectsMap = useMemo(
    () => buildBaseEffectsMap(battleCards),
    [battleCards],
  );

  // granted_effects + under-signi付与 + card_identity_overrides を加味した augmented 効果マップ
  const effectsMap = useMemo(() => {
    // 🆕§5.7 `S-5d` 第3段（2026-09-19）＝本体は `controller/battleMaterials.ts`（ヘッドレスは同じ関数で材料を作る）。
    return buildAugmentedEffectsMap({ bs, baseEffectsMap, cardMap: battleCardMap, userId: user.id });
  }, [bs, baseEffectsMap, user.id, battleCardMap]);

  // §5.7 `S-2`＝CPU デッキの作戦データ（キーカード・優先して出す札・コンボ）。CPU の選択で強さに足し引きする。
  const cpuPlan = useMemo(() => normalizeCpuDeckPlan(cpuDeckData?.cpu_plan), [cpuDeckData]);

  // §5.7 `S-1`＝`effectsMap`（強さの採点に使う）を参照するので、その定義より後ろに置く（前に置くと React Compiler がメモ化を保てず lint error）。
  // CPU対戦：CPU が respondPlayer として応答すべき pending_effect を自動解決
  // 「対戦相手は手札を捨てる」等、効果の解決をCPUが行う必要がある場合
  useEffect(() => {
    if (!isCpuBattle || !bs?.pending_effect) return;
    // 🆕§5.7 `S-5d` 第2段（2026-09-19）＝**「どのハンドラへ渡すか」の振り分けも純関数へ**（`cpuInteractionRespond.ts`）。
    //   画面に残るのは「人が見て分かる速さで遅らせて、**人間と同じハンドラ**を呼ぶ」だけ＝
    //   ヘッドレス（`S-5`）は待たずに同じ戻り値を使う。
    // ⚠**決めるのは遅延の前**（従来も REARRANGE/ALLOCATE/ゾーンはそうだった）。
    //   `SELECT_TARGET`/`CHOOSE` は従来 `setTimeout` の中で決めていたが、`cpuDriver` は
    //   `pending_effect` がある間は走らない（`cpuDriver.ts:20`）ので、**待っている間に盤面も乱数も動かない**＝同値。
    const res = decideCpuInteractionResponse(bs.pending_effect, {
      cpuPlayerId: CPU_PLAYER_ID, hostId: bs.host_id,
      hostState: bs.host_state, guestState: bs.guest_state,
      cards, cardMap: battleCardMap, effectsMap, cpuPlan,
    });
    if (!res) return;
    const timer = setTimeout(() => {
      switch (res.kind) {
        case 'rearrange': handleRearrangeSigniConfirm(res.arrangement); break;
        case 'allocate': handleAllocatePowerConfirm(res.alloc); break;
        case 'virusZone': handleSelectVirusZoneForEffect(res.zone); break;
        case 'signiZone': handleSelectSigniZoneForEffect(res.zone); break;
        case 'zone': handleSelectZoneForEffect(res.zone); break;
        default:
          if (res.logs.length > 0) appendBattleLogs(res.logs);
          handleEffectInteraction(res.selected);
      }
    }, CPU_ACTION_DELAY);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCpuBattle, bs?.pending_effect?.respondPlayerId, bs?.pending_effect]);

  // フィールドシグニの有効パワー（CONTINUOUS 効果適用済み）
  const effectivePowers = useMemo(() => {
    // 🆕§5.7 `S-5d` 第3段（2026-09-19）＝本体は `controller/battleMaterials.ts`（ヘッドレスは同じ関数で材料を作る）。
    return buildEffectivePowers({ bs, effectsMap, cardMap: battleCardMap, userId: user.id });
  }, [bs, effectsMap, battleCardMap, user.id]);

  // CONTINUOUS GRANT_KEYWORD（activeCondition 達成）で動的に付与中のキーワード（バッジ表示用）。
  // WD04-010「パワー10000以上でランサー」等、毎フレーム条件評価で変動する付与を keyword_grants とは別に算出する。
  const dynamicKeywords = useMemo(() => {
    const empty = {} as Record<string, string[]>;
    if (!bs) return { my: empty, op: empty };
    const localIsHost = user.id === bs.host_id;
    const myS = localIsHost ? bs.host_state : bs.guest_state;
    const opS = localIsHost ? bs.guest_state : bs.host_state;
    const myTurn = bs.active_user_id === user.id;
    return {
      my: collectContinuousGrantedKeywords(myS, opS, myTurn, effectsMap, battleCardMap, effectivePowers),
      op: collectContinuousGrantedKeywords(opS, myS, !myTurn, effectsMap, battleCardMap, effectivePowers),
    };
  }, [bs, effectsMap, battleCardMap, user.id, effectivePowers]);

  // CONTINUOUS コスト修正（CostIncreaseAction 効果を集計）＋ 遅延コスト増加（NEXT_OPP_TURN）
  const activeCostMods = useMemo(() => {
    if (!bs) return { forMy: [], forOp: [] };
    const localIsHost = user.id === bs.host_id;
    const myS  = localIsHost ? bs.host_state  : bs.guest_state;
    const opS  = localIsHost ? bs.guest_state : bs.host_state;
    const myTurn = bs.active_user_id === user.id;
    const mods = calcActiveCostMods(myS, opS, myTurn, effectsMap, battleCardMap);
    // COST_INCREASE(NEXT_OPP_TURN): 対戦相手(opS)が保持する「相手ターンの相手コスト増加」は
    // 自分(myS)のコストへ加算（forMy）。逆に自分が保持するものは相手のコスト表示用（forOp）。
    const toMods = (arr?: Array<{ targetCardType: string; amount: { color: string; count: number }[] }>): import('../engine/effectEngine').ActiveCostMod[] =>
      (arr ?? []).map(e => ({ direction: 'increase' as const, targetCardType: e.targetCardType, amount: e.amount as import('../engine/effectEngine').ActiveCostMod['amount'] }));
    return {
      forMy: [...mods.forMy, ...toMods(opS.opp_cost_up_until_opp_turn)],
      forOp: [...mods.forOp, ...toMods(myS.opp_cost_up_until_opp_turn)],
    };
  }, [bs, effectsMap, battleCardMap, user.id]);

  // SPECIFIC_CARD_COST_REDUCE: 特定カード名のコスト軽減（《無×N》）を収集
  const specificCardCostReductions = useMemo(() => {
    if (!bs) return [];
    const localIsHost = user.id === bs.host_id;
    const myS = localIsHost ? bs.host_state : bs.guest_state;
    return collectSpecificCardCostReductions(myS, battleCardMap, effectsMap);
  }, [bs, effectsMap, battleCardMap, user.id]);

  // フィールドのシグニ・キーピース GRANT_LRIG_ABILITY + lrig_granted_auto_effects でルリグに付与された能力
  const grantedMyLrigEffects = useMemo(() => {
    if (!bs) return [];
    const localIsHost = user.id === bs.host_id;
    const myS  = localIsHost ? bs.host_state  : bs.guest_state;
    const opS  = localIsHost ? bs.guest_state : bs.host_state;
    const myTurn = bs.active_user_id === user.id;
    // ⚠収集は `lrigActivateGate.collectGrantedLrigEffects` 1本（CPU も同じ関数を呼ぶ＝§6.4 O-1 (f)）。
    return collectGrantedLrigEffects(myS, opS, myTurn, effectsMap, battleCardMap);
  }, [bs, effectsMap, battleCardMap, user.id]);

  // フィールド（シグニ＋センタールリグ）にCONTINUOUS GRANT_KEYWORD マルチエナ（count:ALL）効果があるか
  // WX01-027（シグニ）・WX05-006（ルリグLv5）のような「全エナにマルチエナ付与」効果を検出
  // ⚠**実装は `artsUseGate.ts` の pure 関数1本**（CPU の候補フィルタも同じ関数を呼ぶ＝§8 `O-1`）。
  //   ここに式を写経すると「人間には剥がれているのに CPU では効かない」型の無言のズレになる。
  const myEnaAllMulti = useMemo(() => {
    if (!bs) return false;
    const localIsHost = user.id === bs.host_id;
    return collectEnaAllMulti(
      localIsHost ? bs.host_state : bs.guest_state,
      localIsHost ? bs.guest_state : bs.host_state,
      bs.active_user_id === user.id, effectsMap, battleCardMap);
  }, [bs, effectsMap, user.id, battleCardMap]);

  // 相手フィールドの WXK11-020 により、自分のエナは印字・付与を問わずマルチエナを失う。
  const myEnaMultiStripped = useMemo(() => {
    if (!bs) return false;
    const localIsHost = user.id === bs.host_id;
    return isEnaMultiStripped(
      localIsHost ? bs.host_state : bs.guest_state,
      localIsHost ? bs.guest_state : bs.host_state,
      bs.active_user_id !== user.id, effectsMap, battleCardMap);
  }, [bs, effectsMap, user.id, battleCardMap]);

  // ── Rules of Hooks 対策：PLAYING セクション由来の hooks を if(!bs)/SETUP return より前に置く ──

  // CPU対戦: ゲーム終了時にCPUのACKを自動設定
  useEffect(() => {
    if (!bs || !isCpuBattle || bs.global_phase !== 'FINISHED' || bs.guest_end_ack) return;
    persist.commit(reduceBattle(bs, { type: 'ACK_END', isHost: false }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCpuBattle, bs?.global_phase, bs?.guest_end_ack, roomId]);

  // CPU対戦: 両者ACK揃い次第ルームを自動削除
  useEffect(() => {
    if (!isCpuBattle || !bs?.host_end_ack || !bs?.guest_end_ack) return;
    leavingRef.current = true;
    persist.remove().then(() => {
      supabase.from('rooms').delete().eq('id', roomId).then(() => onBack());
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCpuBattle, bs?.host_end_ack, bs?.guest_end_ack, roomId, onBack]);

  // 🆕2026-09-17＝**自分が「対戦終了」を押した後は DB を2秒ごとに読み直す**（対人戦も含む）。
  //   🔴相手の確認やルーム削除の通知（Realtime）を1件取りこぼすと、画面は「終了待機中」のまま二度と動かなかった
  //   （押した瞬間に1回読むだけで、その後は通知頼みだった）。両者が押していれば後始末して戻る／行が消えていれば戻る。
  useEffect(() => {
    if (!bs || bs.global_phase !== 'FINISHED') return;
    const myAck = user.id === bs.host_id ? bs.host_end_ack : bs.guest_end_ack;
    if (!myAck) return;
    const id = setInterval(async () => {
      if (leavingRef.current) return;
      const { data, error } = await supabase
        .from('battle_states').select('host_end_ack, guest_end_ack').eq('room_id', roomId).maybeSingle();
      if (error || leavingRef.current) return;
      if (!data) { leavingRef.current = true; onBack(); return; }
      if (data.host_end_ack && data.guest_end_ack) {
        leavingRef.current = true;
        await persist.remove();
        await supabase.from('rooms').delete().eq('id', roomId);
        onBack();
      }
    }, 2000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bs?.global_phase, bs?.host_end_ack, bs?.guest_end_ack, roomId]);

  // CONTINUOUS BLOCK_ACTION 効果によるアクション禁止（フィールド常駐効果）
  const contBlocked = useMemo(() => {
    if (!bs || bs.global_phase !== 'PLAYING') return { forSelf: new Set<string>(), forOther: new Set<string>(), cannotAttackSigni: new Set<string>(), cannotAttackSigniUnlessPayColorless: new Map<string, number>() };
    const localIsHost = user.id === bs.host_id;
    const myS = localIsHost ? bs.host_state : bs.guest_state;
    const opS = localIsHost ? bs.guest_state : bs.host_state;
    const myTurn = bs.active_user_id === user.id;
    // ⚠実効パワーを渡す（§6.4 O-10）＝`ATTACK_COUNT_BY_POWER`（「自身のパワー10000につき一度まで」）が
    //   印刷パワーで数えると、バフを受けても回数が増えない。gate 側も同じ値を見る。
    return calcContinuousBlockedActions(myS, opS, myTurn, effectsMap, battleCardMap, effectivePowers);

  }, [bs, effectsMap, battleCardMap, user.id, effectivePowers]);

  // DEPLOY_RESTRICT（CONTINUOUS 版・WX07-006 レゾナ等）の配置数上限を ExecCtx へ載せる。
  // ⚠**ExecCtx を作るところでは必ずこれを呼ぶこと**＝`ctx.effectsMap` はスタック解決の1経路でしか
  //   代入されないため、engine 側の配置制限を effectsMap 依存にすると「engine は正しいのに実UIでは
  //   丸ごと効かない」dead flag になる（続き296 と同じ罠）。AUTO フラグ版は PlayerState に載るので不要。
  // 🆕**§5.3 O-66（2026-08-25）＝ライフクラッシュ防止の宣言も同じ理由でここへ載せる。**
  //   `LIFE_CRASH`（効果によるクラッシュ）は engine 側で解決されるので、盤面走査を engine に置くと
  //   同じ dead flag を踏む。**「ダメージ以外によってはクラッシュされない」が効くのは効果経路だけ**
  //   なので、ここを埋め忘れると `WX19-046-E2` / `WD13-010-E1`① が丸ごと無効になる。
  // 🆕§5.7（2026-09-18）＝中身は `controller/execCtxDeps.ts`（ヘッドレスからも同じ関数を作れる）。

  // LOSE_COLOR_ALL_ZONES: チームルリグ3体未満→全ゾーン色喪失カードのリスト
  const myColorlessOverrides = useMemo(() => {
    if (!bs || bs.global_phase !== 'PLAYING') return [] as string[];
    const localIsHost = user.id === bs.host_id;
    const myS = localIsHost ? bs.host_state : bs.guest_state;
    const opS = localIsHost ? bs.guest_state : bs.host_state;
    // 🆕§5.3 `O-344`＝宣言（`STUB{LOSE_COLOR_ALL_ZONES}`）と条件（`activeCondition`）を live JSON から読む。
    // ⚠`isMyTurn` はこの hook より後で宣言されるのでここで組む（式は 2699 行と同じ）。
    return collectColorlessOverrides(myS, opS, battleCardMap, effectsMap, bs.active_user_id === user.id).ownerColorless;
  }, [bs, battleCardMap, effectsMap, user.id]);

  // PREVENT_ZONE_MOVE_BY_OPP はresolveStackNext内でotherProtectedZonesとして動的計算

  // 英知CONTINUOUS STUB効果: SUPPRESS_LIFE_BURST_ON_CRASH など（動的チェック）
  // 「このシグニによってクラッシュされた（対戦相手の）カードのライフバーストは発動しない」の CONTINUOUS 用法
  // （§6.4 UNKNOWN 消化・`WXEX1-32`＝【レイヤー】で＜怪異＞へ付与される）。⚠既存の3軸では拾えない
  //   （ターンフラグは実行時のみ／英知軸は EICHI_LEVEL_SUM 限定／game_suppress_lb はプレイヤー付与）。
  const crashSourceSuppressActive = useMemo(() => {
    if (!bs || bs.global_phase !== 'PLAYING') return false;
    const localIsHost = user.id === bs.host_id;
    const myS = localIsHost ? bs.host_state : bs.guest_state;
    const opS = localIsHost ? bs.guest_state : bs.host_state;
    // クラッシュ元は「クラッシュされた側（＝自分）」の state に記録され、カード自体は相手の場にある。
    return crashSourceSuppressesLifeBurst(
      opS, myS, myS.crash_source_card_num, effectsMap, battleCardMap,
      bs.active_user_id !== user.id,
    );
   
  }, [bs, battleCardMap, effectsMap, user.id]);

  const eichiSuppressActive = useMemo(() => {
    if (!bs || bs.global_phase !== 'PLAYING') return false;
    const localIsHost = user.id === bs.host_id;
    const opS = localIsHost ? bs.guest_state : bs.host_state;
    const myS = localIsHost ? bs.host_state : bs.guest_state;
    const myTurn = bs.active_user_id === user.id;
    // 相手（op）のフィールドで英知条件を満たす SUPPRESS_LIFE_BURST_ON_CRASH があるか
    return collectEichiStubEffects(opS, battleCardMap, effectsMap, myS, !myTurn)
      .includes('SUPPRESS_LIFE_BURST_ON_CRASH');
   
  }, [bs, battleCardMap, effectsMap, user.id]);

  // ENERGY_COLOR_SUBSTITUTE: 色代替ルール（動的計算）
  const myColorSubs = useMemo(() => {
    if (!bs || bs.global_phase !== 'PLAYING') return [] as { from: string[]; to: string }[];
    const localIsHost = user.id === bs.host_id;
    const myS = localIsHost ? bs.host_state : bs.guest_state;
    return collectEnergyColorSubs(myS, battleCardMap, effectsMap);
   
  }, [bs, battleCardMap, effectsMap, user.id]);

  // エナ代替トラッシュ系CONTINUOUS効果（ENERGY_*_TRASH_*）情報
  const myEnergyTrashSubInfo = useMemo(() => {
    const empty = { wildcardInstIds: new Set<string>(), colorOverrideMap: new Map<string, string>(), keySubInstId: null as string | null };
    if (!bs || bs.global_phase !== 'PLAYING') return empty;
    const localIsHost = user.id === bs.host_id;
    const myS = localIsHost ? bs.host_state : bs.guest_state;
    return collectEnergyTrashSubstituteInfo(myS, battleCardMap, effectsMap);
  }, [bs, battleCardMap, effectsMap, user.id]);

  // 指定色N個をエナの指定名カード1枚でまとめて置換する常在宣言（§5.3 `O-338`）。
  const myWholeEnergySubstitutes = useMemo(() => {
    if (!bs || bs.global_phase !== 'PLAYING') return [];
    const localIsHost = user.id === bs.host_id;
    const myS = localIsHost ? bs.host_state : bs.guest_state;
    return collectEnergyCostSubstitutes(myS, battleCardMap, effectsMap);
  }, [bs, battleCardMap, effectsMap, user.id]);

  // FIELD_ENERGY_SIGNI_GAIN_COLOR: エナゾーンの追加色マップ（instId -> 追加色）
  // ALL_ZONE_BLACK / ALL_CARDS_COLOR_CHANGE_BLACK も考慮
  const myEnergyExtraColors = useMemo((): Map<string, string> => {
    if (!bs || bs.global_phase !== 'PLAYING') return new Map<string, string>();
    const localIsHost = user.id === bs.host_id;
    return collectEnergyExtraColors(
      localIsHost ? bs.host_state : bs.guest_state,
      localIsHost ? bs.guest_state : bs.host_state,
      bs.active_user_id === user.id, effectsMap, battleCardMap);
  }, [bs, battleCardMap, effectsMap, user.id]);

  // エナコストの支払い元プール（§6.4「エナ支払い元の一本化」＝`screens/battle/energyPaySource.ts`）。
  // 先頭 my.energy.length 件はエナゾーンそのもの＝既存の costIndices（エナ index）がそのまま通る。
  // 追加元（`UNDER_CARD_AS_ENERGY_COST`＝シグニの下）が無ければ my.energy と完全に等価。
  const energyPayCtx = useMemo(() => ({
    turnPhase: bs?.turn_phase ?? 'MAIN',
    isMyTurn: bs?.active_user_id === user.id,
    effectsMap,
  }), [bs?.turn_phase, bs?.active_user_id, effectsMap, user.id]);
  const myEnergyPayPool = useMemo((): EnergyPayEntry[] => {
    if (!bs || bs.global_phase !== 'PLAYING') return [];
    const myS = user.id === bs.host_id ? bs.host_state : bs.guest_state;
    return buildEnergyPayPool(myS, energyPayCtx);
  }, [bs, energyPayCtx, user.id]);

  // COPY_LRIG_NAME_ABILITY (CONT): センタールリグの名前エイリアスリスト
  const myLrigNameAliases = useMemo((): string[] => {
    if (!bs || bs.global_phase !== 'PLAYING') return [];
    const localIsHost = user.id === bs.host_id;
    const myS = localIsHost ? bs.host_state : bs.guest_state;
    const opS = localIsHost ? bs.guest_state : bs.host_state;
    return collectLrigNameAliases(myS, battleCardMap, effectsMap, opS);
  }, [bs, battleCardMap, effectsMap, user.id]);

  // ARTS_COST_REDUCTION_BY_COST_THRESHOLD: コスト閾値によるアーツコスト軽減
  const myArtsThresholdReductions = useMemo(() => {
    if (!bs || bs.global_phase !== 'PLAYING') return [] as { minTotalCost: number; color: string; reduction: number }[];
    const localIsHost = user.id === bs.host_id;
    const myS = localIsHost ? bs.host_state : bs.guest_state;
    const opS = localIsHost ? bs.guest_state : bs.host_state;
    const myTurn = bs.active_user_id === user.id;
    // §6.4 O-10（続き510）＝「対戦相手のターンにアーツを使用する場合、使用コストは《無×N》減る」
    // （`WXK03-071-E1`）も**同じ funnel**（`computeArtsEffectiveCost` の `artsThresholdReductions`）へ合流させる。
    // `minTotalCost:0`＝コスト合計の閾値なし。⚠1回使うと「この能力を失う」ので、消費は
    // アーツ使用の確定地点（`lost_ability_effect_ids_this_turn` へ刻む）で行う。
    return [
      ...collectArtsThresholdCostReductions(myS, battleCardMap, effectsMap),
      ...collectOppTurnArtsCostReductions(myS, opS, myTurn, battleCardMap, effectsMap)
        .map(r => ({ minTotalCost: 0, color: r.color, reduction: r.reduction })),
    ];
  }, [bs, battleCardMap, effectsMap, user.id]);

  /**
   * アーツの使用可否・実効コストを判定するための「支払う側の常在効果」一式（§8 `O-1`）。
   *
   * ⚠**CPU の応答アーツも同じ `buildArtsPayerCtx` から作る**＝人間UIだけ別の式で組み立てると
   * 「人間には使えるのに CPU には使えない」型の無言のズレになる（PLAN §4 教訓 (d)）。
   */
  const myArtsPayerCtx = useMemo((): ArtsPayerCtx | null => {
    if (!bs || bs.global_phase !== 'PLAYING') return null;
    const localIsHost = user.id === bs.host_id;
    return buildArtsPayerCtx({
      actor: localIsHost ? bs.host_state : bs.guest_state,
      opponent: localIsHost ? bs.guest_state : bs.host_state,
      isActorTurn: bs.active_user_id === user.id,
      turnPhase: bs.turn_phase, cardMap: battleCardMap, effectsMap, effectivePowers,
    });
  }, [bs, battleCardMap, effectsMap, user.id, effectivePowers]);


  // HAND_SIGNI_HAS_GUARD_ICON: 手札の特定クラスのシグニがガード可能
  const myHandGuardClasses = useMemo((): string[] => {
    if (!bs || bs.global_phase !== 'PLAYING') return [];
    const localIsHost = user.id === bs.host_id;
    const myS = localIsHost ? bs.host_state : bs.guest_state;
    const opS = localIsHost ? bs.guest_state : bs.host_state;
    const myTurn = bs.active_user_id === user.id;
    return collectHandGuardIconClasses(myS, battleCardMap, effectsMap, opS, myTurn);
  }, [bs, battleCardMap, effectsMap, user.id]);

  // pending_effect の**中身**の同一性キー。
  // 🔴**オブジェクト同一性（`bs?.pending_effect`）を deps にしてはいけない**（Opusタスク12 (cxlvi)）＝
  //   realtime は `battle_states` の行が更新されるたびに `setBs(payload.new)` で**新しいオブジェクト**を渡すので、
  //   pending が1ビットも変わっていなくても下の useEffect が再実行され、
  //   **プレイヤーが選択中の複数枚（`effectSelectedNums`）が黙って全部消える**。
  //   実害＝「２枚まで選ぶ」で選択途中に無関係な行更新（相手の操作・CPU タイマー・realtime 再購読）が届くと
  //   選択が 0 に戻り、`upTo` の効果は 0/1 枚でも「決定」できてしまうため**過少実行のまま完了する**
  //   （`WX16-Re18-E1`＝「2枚選んだのに1枚しか場に出ない」の正体。実機プローブ
  //    `v44SelectionSurvivesUnrelatedStateUpdate` で「決定(1/2)→決定(0/2)」を決定論的に再現した）。
  //   ⚠deps は `bs` 丸ごとにする（`bs?.pending_effect` だと React Compiler が
  //     「推論した依存（bs）より狭い」と判定して最適化をスキップし lint error になる）。
  //     毎更新で再計算されるが、**返る文字列が同じなら下の useEffect は再実行されない**＝目的は達する。
  const pendingEffectKey = useMemo(
    () => (bs?.pending_effect ? JSON.stringify(bs.pending_effect) : null),
    [bs],
  );

  // pending_effectが変わったらカード選択をリセット（別効果の選択状態が残らないように）
  useEffect(() => {
    setEffectSelectedNums([]);
    if (!bs?.pending_effect) return;
    const inter = bs.pending_effect.interaction;
    if (inter.type === 'LOOK_AND_REORDER') {
      setLookReorderOrder(prev => {
        const same = prev.length === inter.cards.length && prev.every((n, i) => n === inter.cards[i]);
        return same ? prev : [...inter.cards];
      });
      setLookReorderTrash(prev => (prev.size === 0 ? prev : new Set()));
      setLookReorderBottom(prev => (prev.size === 0 ? prev : new Set()));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingEffectKey]);

  // 効果スタック整列UI の更新
  useEffect(() => {
    if (!bs?.effect_stack || !user) { setStackOrderIds([]); return; }
    const stack = bs.effect_stack;
    const isTurnPlayer = bs.active_user_id === user.id;
    const myPending = isTurnPlayer ? stack.pendingTurn : stack.pendingOpp;
    const needOrder = isTurnPlayer ? !stack.orderTurnDone : !stack.orderOppDone;
    if (needOrder && myPending.length > 1) {
      setStackOrderIds(prev => {
        const prevSet = new Set(prev);
        const same = myPending.length === prev.length && myPending.every(e => prevSet.has(e.id));
        return same ? prev : myPending.map(e => e.id);
      });
    } else {
      setStackOrderIds([]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bs?.effect_stack]);

  // キューが解決可能になったらターンプレイヤーが自動解決
  useEffect(() => {
    if (!bs || !user) return;
    const stack = bs.effect_stack;
    if (!stack) return;
    if (!isReadyToResolve(stack)) return;
    if (stack.queue.length === 0) return;
    if (bs.pending_effect) return;
    if (loading) return;
    // ターンプレイヤーが自分か、キュー先頭のエフェクト所有者が自分の場合に解決する
    // （相手ターン中の自分のライフバーストなど、非ターンプレイヤーのエフェクトにも対応）
    // CPU戦はクライアントが人間側のみのため、CPUターン中のCPU所有エントリも人間クライアントが解決する
    const firstEntry = stack.queue[0];
    if (!isCpuBattle && bs.active_user_id !== user.id && firstEntry?.playerId !== user.id) return;
    // 相手のチェックゾーンにカードがある（バースト処理待ち）間はスタック解決を停止
    // ※ CPUバトルでは相手（CPU）はスタック解決後に自動処理するためブロックしない
    const isLocalHost = user.id === bs.host_id;
    const opStateForCheck = isLocalHost ? bs.guest_state : bs.host_state;
    if (!isCpuBattle && opStateForCheck.field?.check) return;
    resolveStackNextRef.current?.();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bs?.effect_stack, bs?.pending_effect, bs?.host_state, bs?.guest_state]); // eslint-disable-line react-hooks/exhaustive-deps

  // 「このメインフェイズを終了する」（`SKIP_MAIN_PHASE`＝`WXK06-078-E1`・§6.4 O-3 続き491）。
  // ⚠🔴従来は**ログを1行出すだけのハンドラ**で、`census:stubs` は「ハンドラがある＝実装済み」と
  //   判定するため計器にも映らない無言 no-op だった（続き459 の教訓の実例）。
  // 🔑消費は「メインフェイズを封じる」1点（`MAIN_PHASE`＝`PHASE_SKIP_BLOCK_IDS` と同じ語彙）＝
  //   ①CPU 側は召喚ループが止まり ②人間側はここで**自動でアタックフェイズへ送る**。
  //   確認ダイアログ（`handlePhaseAdvance`）は通さない＝ルール上の強制終了なので選択肢が無い。
  useEffect(() => {
    if (!bs || bs.global_phase !== 'PLAYING' || bs.turn_phase !== 'MAIN') return;
    if (bs.active_user_id !== user.id) return;         // ターンプレイヤーだけが進める
    if (bs.effect_stack || bs.pending_effect || bs.pending_spell) return;
    const meState = user.id === bs.host_id ? bs.host_state : bs.guest_state;
    const foeState = user.id === bs.host_id ? bs.guest_state : bs.host_state;
    if (meState.field?.check || foeState.field?.check) return;
    if (!(meState.blocked_actions ?? []).includes('MAIN_PHASE')) return;
    doPhaseAdvanceRef.current?.();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bs?.turn_phase, bs?.effect_stack, bs?.pending_effect, bs?.pending_spell, bs?.host_state, bs?.guest_state]); // eslint-disable-line react-hooks/exhaustive-deps

  // SPELL_CUTINレゾナの支払い・配置・ON_PLAYスタックが完了したら、同じ応答者が元スペルを継続する。
  useEffect(() => {
    if (!bs?.pending_spell?.cutin_response_complete || !user) return;
    if (bs.pending_spell.caster_id === user.id) return;
    if (bs.effect_stack || bs.pending_effect || loading) return;
    handleCutinPassRef.current?.();
  }, [bs?.pending_spell, bs?.effect_stack, bs?.pending_effect, loading, user]);

  // pending_life_crashes の自動消化
  useEffect(() => {
    if (!bs || !user) return;
    if (bs.global_phase !== 'PLAYING') return;
    if (bs.effect_stack || bs.pending_effect) return;
    if (loading) return;
    const localIsHost = user.id === bs.host_id;
    const localMy = localIsHost ? bs.host_state : bs.guest_state;
    if (localMy.field?.check) return;
    if (!(localMy.pending_crashed_cards?.length ?? 0)) return;
    triggerPendingCrashRef.current?.();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bs?.effect_stack, bs?.pending_effect, bs?.host_state, bs?.guest_state, bs?.global_phase]); // eslint-disable-line react-hooks/exhaustive-deps

  // パワー0以下シグニの自動バニッシュ
  useEffect(() => {
    if (!bs || !user) return;
    if (bs.global_phase !== 'PLAYING') return;
    if (bs.effect_stack || bs.pending_effect) return;
    if (loading) return;
    if (bs.active_user_id !== user.id) return;
    checkPowerZeroBanishRef.current?.();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bs?.effect_stack, bs?.pending_effect, bs?.host_state, bs?.guest_state, bs?.global_phase, bs?.active_user_id]); // eslint-disable-line react-hooks/exhaustive-deps

  // 🆕**保留になっていたリフレッシュの受け皿**（2026-09-18・公式ルール）。
  //   通常のリフレッシュは効果1つの解決直後（`applyRefreshOnDone`＝誘発した効果より先）とドローフェイズで行う。
  //   ここは「デッキ0枚でもトラッシュが空で保留→あとからトラッシュにカードが置かれた」等、その2か所を通らなかった残り。
  //   ⚠CPU 戦は人間のクライアントが CPU 側も処理する（PvP はターンプレイヤーのクライアントだけ）。
  useEffect(() => {
    if (!bs || !user) return;
    if (bs.global_phase !== 'PLAYING') return;
    if (bs.turn_phase === 'UP') return;
    if (bs.effect_stack || bs.pending_effect || bs.pending_spell) return;
    if (loading) return;
    if (bs.active_user_id !== user.id && !isCpuBattle) return;
    checkDeferredRefreshRef.current?.();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bs?.effect_stack, bs?.pending_effect, bs?.pending_spell, bs?.host_state, bs?.guest_state, bs?.global_phase, bs?.active_user_id, bs?.turn_phase]); // eslint-disable-line react-hooks/exhaustive-deps

  // 🆕§5.6 `C-9` `R-28`＝**ターンプレイヤーのこのターン2回目のリフレッシュ → ターンを終了**（ルール処理）。
  //   🔴規則が効果スタックの解決経路1本にしか無かったので、盤面が動くたび見る funnel を受け皿にする
  //     （スペル解決・選択の再開・ドローフェイズからのリフレッシュも通る）。
  //   ⚠`turn_phase === 'UP'` を除く理由は `refreshTurnEnd.ts` に書いた（台帳が前ターンの値のまま）。
  useEffect(() => {
    if (!bs || !user) return;
    if (bs.global_phase !== 'PLAYING') return;
    if (bs.turn_phase === 'UP') return;
    if (bs.effect_stack || bs.pending_effect || bs.pending_spell) return;
    if (loading) return;
    if (bs.active_user_id !== user.id) return;
    checkRefreshTurnEndRef.current?.();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bs?.effect_stack, bs?.pending_effect, bs?.pending_spell, bs?.host_state, bs?.guest_state, bs?.global_phase, bs?.active_user_id, bs?.turn_phase]); // eslint-disable-line react-hooks/exhaustive-deps

  // 🆕§5.3 `O-532`＝**レベル超過／リミット超過のルール処理**（RULES.md `R-44`/`R-48`）。
  //   ⚠**自分の盤面は A（レベル超過＝選択の余地なし）だけ自動**＝B/C は `LimitExcessModal` が持ち主に問う。
  //   ⚠**CPU の盤面は問えない**ので A も B/C も自動（`pickLimitExcessZone`）。
  useEffect(() => {
    if (!bs || !user) return;
    if (bs.global_phase !== 'PLAYING') return;
    if (bs.effect_stack || bs.pending_effect || bs.pending_spell) return;
    if (loading) return;
    checkLimitExcessRef.current?.();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bs?.effect_stack, bs?.pending_effect, bs?.pending_spell, bs?.host_state, bs?.guest_state, bs?.global_phase]); // eslint-disable-line react-hooks/exhaustive-deps

  // CONTINUOUS BANISH / FREEZE / DOWN の自動適用（mandatory 効果：WX16-045 等）
  useEffect(() => {
    if (!bs || !user) return;
    if (bs.global_phase !== 'PLAYING') return;
    if (bs.effect_stack || bs.pending_effect) return;
    if (loading) return;
    if (bs.active_user_id !== user.id) return;
    checkContMutationsRef.current?.();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bs?.effect_stack, bs?.pending_effect, bs?.host_state, bs?.guest_state, bs?.global_phase, bs?.active_user_id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ON_ATTACK_SIGNI処理完了後のバトル解決（pending_signi_battleが設定されスタックが空になったとき）
  useEffect(() => {
    if (!bs || !user) return;
    if (bs.global_phase !== 'PLAYING') return;
    if (bs.effect_stack || bs.pending_effect) return;
    if (loading) return;
    const localIsHost = user.id === bs.host_id;
    const localMy = localIsHost ? bs.host_state : bs.guest_state;
    if (!localMy.pending_signi_battle) return;
    // 🆕🔴バグ報告 `4b765502`（2026-09-18）＝**自分の最後の書き込みが手元に届くまで解決しない**（CPU 側 `V-247` と同じ型）。
    //   Realtime は**ログ追記（`append_battle_logs`）の通知でも行を丸ごと差し替える**ので、解決の途中で書いたログの通知が
    //   最終 commit の後に届くと、手元は「まだ `pending_signi_battle` が立っている古い盤面」に戻って**同じアタックを2回解決**していた
    //   （実測＝「〜がライフをクラッシュ」が2行・実際に割れたのは1枚）。届けば `host_state` が変わってここが再発火する。
    if (!ownCommitsArrived(bs)) return;
    resolvePendingSigniBattleRef.current?.();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bs?.effect_stack, bs?.pending_effect, bs?.host_state, bs?.guest_state, bs?.global_phase]); // eslint-disable-line react-hooks/exhaustive-deps

  // ON_ATTACK_LRIG処理完了後のガード応答セット（pending_lrig_attackが設定されスタックが空になったとき）
  useEffect(() => {
    if (!bs || !user) return;
    if (bs.global_phase !== 'PLAYING') return;
    if (bs.effect_stack || bs.pending_effect) return;
    if (loading) return;
    const localIsHost = user.id === bs.host_id;
    const localMy = localIsHost ? bs.host_state : bs.guest_state;
    if (!localMy.pending_lrig_attack) return;
    if (!ownCommitsArrived(bs)) return;   // ↑シグニアタックと同じ（バグ報告 `4b765502`）
    resolvePendingLrigAttackRef.current?.();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bs?.effect_stack, bs?.pending_effect, bs?.host_state, bs?.guest_state, bs?.global_phase]); // eslint-disable-line react-hooks/exhaustive-deps

  // ATTACH_ACCE完了後にacce_just_doneフラグを検出してON_ACCEトリガーを発火
  // my は後で定義されるため bs から直接参照（isHost も後定義のため bs から計算）
  const acceJustDoneRef = (user && bs)
    ? (user.id === bs.host_id ? bs.host_state?.acce_just_done : bs.guest_state?.acce_just_done)
    : undefined;
  useEffect(() => {
    if (!bs || !user || !acceJustDoneRef || loading) return;
    if (bs.active_user_id !== user.id) return;
    if (bs.effect_stack || bs.pending_effect) return;
    const hostCardNum = acceJustDoneRef;
    const localIsHost = user.id === bs.host_id;
    const localMy: PlayerState = localIsHost ? bs.host_state : bs.guest_state;
    const stateKey = localIsHost ? 'host_state' : 'guest_state';
    const cleared: PlayerState = { ...localMy, acce_just_done: null };
    (async () => {
      setLoading(true);
      try {
        await persist.commit(reduceBattle(bs, { type: 'WRITE_STATE', myKey: stateKey, myState: cleared }));
        await checkAndFireOnAcceTriggersForOwner(cleared, hostCardNum);
      } finally {
        setLoading(false);
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [acceJustDoneRef, bs?.effect_stack, bs?.pending_effect]); // eslint-disable-line react-hooks/exhaustive-deps

  // 手札公開（hand_revealed_just）/効果による手札捨て（hand_discarded_just）フラグを検出してトリガーを発火
  // フラグはトリガーの有無に関わらず必ずクリアする（残存すると後で誤発火するため）
  const handRevealedJustRef = (user && bs)
    ? (user.id === bs.host_id ? bs.host_state?.hand_revealed_just : bs.guest_state?.hand_revealed_just)
    : undefined;
  const handDiscardedJustRef = (user && bs)
    ? (user.id === bs.host_id ? bs.host_state?.hand_discarded_just : bs.guest_state?.hand_discarded_just)
    : undefined;
  // CPU戦: CPU(=guest)が効果で捨てた手札のフラグも人間(host)クライアントが処理する（ON_HAND_DISCARDED 'any' 等）
  const cpuHandDiscardedRef = (user && bs && isCpuBattle && user.id === bs.host_id)
    ? bs.guest_state?.hand_discarded_just : undefined;
  useEffect(() => {
    if (!bs || !user || loading) return;
    const revealedHJ = handRevealedJustRef ?? [];
    const discardedHJ = handDiscardedJustRef ?? [];
    const cpuDiscardedHJ = cpuHandDiscardedRef ?? [];
    if (revealedHJ.length === 0 && discardedHJ.length === 0 && cpuDiscardedHJ.length === 0) return;
    if (bs.effect_stack || bs.pending_effect) return;
    const localIsHost = user.id === bs.host_id;
    const localMy: PlayerState = localIsHost ? bs.host_state : bs.guest_state;
    const stateKey = localIsHost ? 'host_state' : 'guest_state';
    (async () => {
      setLoading(true);
      try {
        const entries: StackEntry[] = [];
        // ON_REVEALED_FROM_HAND: 公開されたカード自身のAUTO効果（まだ手札にあるもののみ）
        entries.push(...pureCollectRevealedFromHandTriggers(
          mkTrigCtx(), revealedHJ, localMy, user.id,
          localMy.hand_revealed_just_source_card_num ?? undefined,
        ));
        // ON_SELF_REVEAL_FROM_HAND: あなたが自分の効果で手札からカードを公開したとき、場のシグニ自身のAUTO効果が反応（G198）
        // （hand_revealed_just は1回の公開処理ごとに立つので「同時に複数公開でも一度しか発動しない」が自然に満たされる）
        if (revealedHJ.length > 0) {
          for (const stack of localMy.field.signi) {
            if (!stack?.length) continue;
            const topNum = stack[stack.length - 1];
            for (const eff of (effectsMap.get(topNum) ?? [])) {
              if (eff.effectType !== 'AUTO' || !eff.timing?.includes('ON_SELF_REVEAL_FROM_HAND')) continue;
              entries.push({
                id: generateUUID(),
                playerId: user.id,
                cardNum: topNum,
                effectId: eff.effectId,
                label: `${battleCardMap.get(topNum)?.CardName ?? topNum}【自】手札公開時`,
                effect: eff,
              });
            }
          }
        }
        // ON_HAND_DISCARDED: 効果による手札捨て（コスト捨てはコスト支払い側で別途収集）
        const { entries: hdEntries, usedLimitIds } = collectHandDiscardTriggers(
          discardedHJ, localMy, user.id, false,
          localIsHost ? bs.guest_state : bs.host_state, localIsHost ? bs.guest_id : bs.host_id,
          // byOppEffect＝この手札捨てが「対戦相手の効果によるもの」か（triggerCondition.byOwnEffect の判定材料）。
          // executor が捨てた側の state に立てる（自分の効果なら立たない）。
          undefined, !!localMy.hand_discarded_just_by_opp, localMy.hand_discarded_just_cause_owner_id ?? undefined,
          localMy.hand_discarded_just_cause_card_num ?? undefined);
        entries.push(...hdEntries);
        const cleared: PlayerState = {
          ...localMy,
          hand_revealed_just: null,
          hand_revealed_just_source_card_num: null,
          hand_discarded_just: null,
          hand_discarded_just_by_opp: null,
          hand_discarded_just_cause_owner_id: null,
          hand_discarded_just_cause_card_num: null,
          actions_done: usedLimitIds.length > 0 ? [...(localMy.actions_done ?? []), ...usedLimitIds] : localMy.actions_done,
        };
        const states: Partial<Record<PlayerStateKey, PlayerState>> = { [stateKey]: cleared };
        // CPU戦: CPU(guest)が捨てた手札 → CPU自身の self/any 効果 + 人間(host)の 'any' 効果を収集し、guest フラグをクリア
        if (cpuDiscardedHJ.length > 0) {
          const { entries: cpuHd, usedLimitIds: cpuUsed } = collectHandDiscardTriggers(
            cpuDiscardedHJ, bs.guest_state, CPU_PLAYER_ID, false, bs.host_state, bs.host_id,
            undefined, !!bs.guest_state.hand_discarded_just_by_opp, bs.guest_state.hand_discarded_just_cause_owner_id ?? undefined,
            bs.guest_state.hand_discarded_just_cause_card_num ?? undefined);
          entries.push(...cpuHd);
          states.guest_state = {
            ...bs.guest_state,
            hand_discarded_just: null,
            hand_discarded_just_by_opp: null,
            hand_discarded_just_cause_owner_id: null,
            hand_discarded_just_cause_card_num: null,
            actions_done: cpuUsed.length > 0 ? [...(bs.guest_state.actions_done ?? []), ...cpuUsed] : bs.guest_state.actions_done,
          };
        }
        let newStack: EffectStack | undefined;
        if (entries.length > 0) {
          const existingStack = bs.effect_stack ?? null;
          newStack = existingStack
            ? pushToStack(existingStack, entries)
            : initStack(bs.active_user_id ?? user.id, entries);
        }
        await persist.commit(reduceBattle(bs, { type: 'WRITE_STATES', states, effectStack: newStack }));
      } finally {
        setLoading(false);
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handRevealedJustRef, handDiscardedJustRef, cpuHandDiscardedRef, bs?.effect_stack, bs?.pending_effect]); // eslint-disable-line react-hooks/exhaustive-deps

  // 対戦相手の場のウィルス増減フラグ（opp_virus_placed_just / opp_virus_removed_just）を検出して
  // ON_OPP_VIRUS_REMOVED / ON_OPP_VIRUS_CHANGED トリガーを発火（WD19-009 / WX21-030）
  // フラグはトリガーの有無に関わらず必ずクリアする。CPU戦ではCPU側のフラグも人間クライアントが処理する
  const myVirusPlacedRef = (user && bs)
    ? (user.id === bs.host_id ? bs.host_state?.opp_virus_placed_just : bs.guest_state?.opp_virus_placed_just)
    : undefined;
  const myVirusRemovedRef = (user && bs)
    ? (user.id === bs.host_id ? bs.host_state?.opp_virus_removed_just : bs.guest_state?.opp_virus_removed_just)
    : undefined;
  const cpuVirusPlacedRef = isCpuBattle ? bs?.guest_state?.opp_virus_placed_just : undefined;
  const cpuVirusRemovedRef = isCpuBattle ? bs?.guest_state?.opp_virus_removed_just : undefined;
  useEffect(() => {
    if (!bs || !user || loading) return;
    if (bs.effect_stack || bs.pending_effect) return;
    const localIsHost = user.id === bs.host_id;
    const processOwn = !!(myVirusPlacedRef || myVirusRemovedRef);
    // CPU戦ではCPU=guest固定。人間がguestになることはないが、自分側と二重処理しないようガード
    const processCpu = isCpuBattle && localIsHost && !!(cpuVirusPlacedRef || cpuVirusRemovedRef);
    if (!processOwn && !processCpu) return;
    (async () => {
      setLoading(true);
      try {
        const entries: StackEntry[] = [];
        const states: Partial<Record<PlayerStateKey, PlayerState>> = {};
        const handleVirusFlagsFor = (
          state: PlayerState, opState: PlayerState, stateKey: PlayerStateKey, ownerId: string,
          placed: boolean, removed: boolean,
        ) => {
          let usedIds: string[] = [];
          if (placed) {
            const rp = collectSelfEventTriggers('ON_OPP_VIRUS_PLACED', state, opState, 'ウィルス配置時', ownerId);
            entries.push(...rp.entries);
            usedIds = [...usedIds, ...rp.usedOncePerTurnIds];
          }
          if (removed) {
            const r = collectSelfEventTriggers('ON_OPP_VIRUS_REMOVED', state, opState, 'ウィルス除去時', ownerId);
            entries.push(...r.entries);
            usedIds = [...usedIds, ...r.usedOncePerTurnIds];
          }
          if (placed || removed) {
            const r2 = collectSelfEventTriggers('ON_OPP_VIRUS_CHANGED', state, opState, 'ウィルス増減時', ownerId);
            entries.push(...r2.entries);
            usedIds = [...usedIds, ...r2.usedOncePerTurnIds];
          }
          states[stateKey] = {
            ...state,
            opp_virus_placed_just: null,
            opp_virus_removed_just: null,
            actions_done: usedIds.length > 0 ? [...(state.actions_done ?? []), ...usedIds] : state.actions_done,
          };
        };
        const hostS = bs.host_state;
        const guestS = bs.guest_state;
        if (processOwn) {
          handleVirusFlagsFor(
            localIsHost ? hostS : guestS, localIsHost ? guestS : hostS,
            localIsHost ? 'host_state' : 'guest_state', user.id,
            !!myVirusPlacedRef, !!myVirusRemovedRef,
          );
        }
        if (processCpu) {
          handleVirusFlagsFor(guestS, hostS, 'guest_state', CPU_PLAYER_ID,
            !!cpuVirusPlacedRef, !!cpuVirusRemovedRef);
        }
        let newStack: EffectStack | undefined;
        if (entries.length > 0) {
          const existingStack = bs.effect_stack ?? null;
          newStack = existingStack
            ? pushToStack(existingStack, entries)
            : initStack(bs.active_user_id ?? user.id, entries);
        }
        await persist.commit(reduceBattle(bs, { type: 'WRITE_STATES', states, effectStack: newStack }));
      } finally {
        setLoading(false);
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myVirusPlacedRef, myVirusRemovedRef, cpuVirusPlacedRef, cpuVirusRemovedRef, bs?.effect_stack, bs?.pending_effect]); // eslint-disable-line react-hooks/exhaustive-deps

  // 🆕🔴§5.3 `O-376`（2026-09-15）＝「あなたが**対戦相手の**スペルを使用したとき」（`opp_spell_used_just`）。
  // 🔑通常のスペル使用 funnel（下の `useSpell`）は**自分の手札のスペルしか通らない**ので、
  //    持ち主が相手のスペル（`CAST_FROM_OPP_TRASH`）を使った瞬間はそこに現れない。engine が積んだ
  //    フラグをここで拾う。⚠フラグは**使用した側**の state に積まれる（`zone_moved_just` と同型）。
  const myOppSpellUsedRef = (user && bs)
    ? (user.id === bs.host_id ? bs.host_state?.opp_spell_used_just : bs.guest_state?.opp_spell_used_just)
    : undefined;
  const cpuOppSpellUsedRef = isCpuBattle ? bs?.guest_state?.opp_spell_used_just : undefined;
  useEffect(() => {
    if (!bs || !user || loading) return;
    if (bs.effect_stack || bs.pending_effect) return;
    const localIsHost = user.id === bs.host_id;
    const processOwn = !!(myOppSpellUsedRef && myOppSpellUsedRef.length > 0);
    const processCpu = isCpuBattle && localIsHost && !!(cpuOppSpellUsedRef && cpuOppSpellUsedRef.length > 0);
    if (!processOwn && !processCpu) return;
    (async () => {
      setLoading(true);
      try {
        const entries: StackEntry[] = [];
        const states: Partial<Record<PlayerStateKey, PlayerState>> = {};
        const usedByKey: Partial<Record<PlayerStateKey, string[]>> = {};
        const handleFor = (
          casterState: PlayerState, otherState: PlayerState, casterKey: PlayerStateKey, casterId: string,
        ) => {
          for (const spellNum of casterState.opp_spell_used_just ?? []) {
            const r = pureCollectOppOwnedSpellUseTriggers(mkTrigCtx(), spellNum, casterState, otherState, casterId);
            entries.push(...r.entries);
            if (r.usedIds.length) usedByKey[casterKey] = [...(usedByKey[casterKey] ?? []), ...r.usedIds];
          }
        };
        const hostS = bs.host_state, guestS = bs.guest_state;
        if (processOwn) {
          if (localIsHost) handleFor(hostS, guestS, 'host_state', bs.host_id);
          else handleFor(guestS, hostS, 'guest_state', bs.guest_id);
        }
        if (processCpu) handleFor(guestS, hostS, 'guest_state', CPU_PLAYER_ID);
        const applyState = (key: PlayerStateKey, base: PlayerState, clearFlag: boolean) => {
          const used = usedByKey[key];
          if (!used && !clearFlag) return;
          states[key] = {
            ...(states[key] ?? base),
            ...(clearFlag ? { opp_spell_used_just: null } : {}),
            ...(used ? { actions_done: [...(base.actions_done ?? []), ...used] } : {}),
          };
        };
        applyState('host_state', hostS, !!(processOwn && localIsHost));
        applyState('guest_state', guestS, !!((processOwn && !localIsHost) || processCpu));
        let newStack: EffectStack | undefined;
        if (entries.length > 0) {
          const existingStack = bs.effect_stack ?? null;
          newStack = existingStack
            ? pushToStack(existingStack, entries)
            : initStack(bs.active_user_id ?? user.id, entries);
        }
        if (Object.keys(states).length > 0 || newStack !== undefined) {
          await persist.commit(reduceBattle(bs, { type: 'WRITE_STATES', states, effectStack: newStack }));
        }
      } finally {
        setLoading(false);
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myOppSpellUsedRef, cpuOppSpellUsedRef, bs?.effect_stack, bs?.pending_effect]); // eslint-disable-line react-hooks/exhaustive-deps

  // シグニが効果によって他のシグニゾーンに移動した直後フラグ（zone_moved_just）を検出して ON_ZONE_MOVED を発火（G073 等）。
  // フラグは移動シグニの所有者(=mover)の state に積まれる。mover のクライアントが処理し、mover 側(self/any_ally/any)と
  // 対戦相手側(any_opp/any)の両トリガーを収集する。CPU(=guest)のフラグはホスト(人間)が代行処理する。
  const myZoneMovedRef = (user && bs)
    ? (user.id === bs.host_id ? bs.host_state?.zone_moved_just : bs.guest_state?.zone_moved_just)
    : undefined;
  const cpuZoneMovedRef = isCpuBattle ? bs?.guest_state?.zone_moved_just : undefined;
  useEffect(() => {
    if (!bs || !user || loading) return;
    if (bs.effect_stack || bs.pending_effect) return;
    const localIsHost = user.id === bs.host_id;
    const processOwn = !!(myZoneMovedRef && myZoneMovedRef.length > 0);
    const processCpu = isCpuBattle && localIsHost && !!(cpuZoneMovedRef && cpuZoneMovedRef.length > 0);
    if (!processOwn && !processCpu) return;
    (async () => {
      setLoading(true);
      try {
        const entries: StackEntry[] = [];
        const states: Partial<Record<PlayerStateKey, PlayerState>> = {};
        const usedByKey: Partial<Record<PlayerStateKey, string[]>> = {};
        const handleMovedFor = (
          moverState: PlayerState, otherState: PlayerState,
          moverKey: PlayerStateKey, otherKey: PlayerStateKey, moverId: string, otherId: string,
        ) => {
          for (const movedNum of moverState.zone_moved_just ?? []) {
            const r = collectZoneMovedTriggers(movedNum, moverState, otherState, moverId, otherId);
            entries.push(...r.entries);
            if (r.moverUsedIds.length) usedByKey[moverKey] = [...(usedByKey[moverKey] ?? []), ...r.moverUsedIds];
            if (r.otherUsedIds.length) usedByKey[otherKey] = [...(usedByKey[otherKey] ?? []), ...r.otherUsedIds];
          }
        };
        const hostS = bs.host_state, guestS = bs.guest_state;
        if (processOwn) {
          if (localIsHost) handleMovedFor(hostS, guestS, 'host_state', 'guest_state', bs.host_id, bs.guest_id);
          else handleMovedFor(guestS, hostS, 'guest_state', 'host_state', bs.guest_id, bs.host_id);
        }
        if (processCpu) handleMovedFor(guestS, hostS, 'guest_state', 'host_state', CPU_PLAYER_ID, bs.host_id);
        // フラグクリア＋usageLimit永続化（mover 側のフラグのみクリア）
        const applyState = (key: PlayerStateKey, base: PlayerState, clearFlag: boolean) => {
          const used = usedByKey[key];
          if (!used && !clearFlag) return;
          states[key] = {
            ...(states[key] ?? base),
            ...(clearFlag ? { zone_moved_just: null } : {}),
            ...(used ? { actions_done: [...(base.actions_done ?? []), ...used] } : {}),
          };
        };
        applyState('host_state', hostS, !!(processOwn && localIsHost));
        applyState('guest_state', guestS, !!((processOwn && !localIsHost) || processCpu));
        let newStack: EffectStack | undefined;
        if (entries.length > 0) {
          const existingStack = bs.effect_stack ?? null;
          newStack = existingStack
            ? pushToStack(existingStack, entries)
            : initStack(bs.active_user_id ?? user.id, entries);
        }
        if (Object.keys(states).length > 0 || newStack !== undefined) {
          await persist.commit(reduceBattle(bs, { type: 'WRITE_STATES', states, effectStack: newStack }));
        }
      } finally {
        setLoading(false);
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myZoneMovedRef, cpuZoneMovedRef, bs?.effect_stack, bs?.pending_effect]); // eslint-disable-line react-hooks/exhaustive-deps

  // シグニがドライブ状態になった直後フラグ（drive_became_just）を検出して ON_SIGNI_BECOMES_DRIVE を発火（G184/G218）。
  // フラグはドライブ化したシグニの所有者(=driver)の state に積まれる。driver のクライアントが処理し、driver 側(self/any_ally/any)と
  // 対戦相手側(any_opp/any)の両トリガーを収集する。CPU(=guest)のフラグはホスト(人間)が代行処理する。zone_moved_just と同型。
  const myDriveBecameRef = (user && bs)
    ? (user.id === bs.host_id ? bs.host_state?.drive_became_just : bs.guest_state?.drive_became_just)
    : undefined;
  const cpuDriveBecameRef = isCpuBattle ? bs?.guest_state?.drive_became_just : undefined;
  useEffect(() => {
    if (!bs || !user || loading) return;
    if (bs.effect_stack || bs.pending_effect) return;
    const localIsHost = user.id === bs.host_id;
    const processOwn = !!(myDriveBecameRef && myDriveBecameRef.length > 0);
    const processCpu = isCpuBattle && localIsHost && !!(cpuDriveBecameRef && cpuDriveBecameRef.length > 0);
    if (!processOwn && !processCpu) return;
    (async () => {
      setLoading(true);
      try {
        const entries: StackEntry[] = [];
        const states: Partial<Record<PlayerStateKey, PlayerState>> = {};
        const usedByKey: Partial<Record<PlayerStateKey, string[]>> = {};
        const handleDriveFor = (
          driverState: PlayerState, otherState: PlayerState,
          driverKey: PlayerStateKey, otherKey: PlayerStateKey, driverId: string, otherId: string,
        ) => {
          for (const becameNum of driverState.drive_became_just ?? []) {
            const r = collectDriveBecameTriggers(becameNum, driverState, otherState, driverId, otherId);
            entries.push(...r.entries);
            if (r.driverUsedIds.length) usedByKey[driverKey] = [...(usedByKey[driverKey] ?? []), ...r.driverUsedIds];
            if (r.otherUsedIds.length) usedByKey[otherKey] = [...(usedByKey[otherKey] ?? []), ...r.otherUsedIds];
          }
        };
        const hostS = bs.host_state, guestS = bs.guest_state;
        if (processOwn) {
          if (localIsHost) handleDriveFor(hostS, guestS, 'host_state', 'guest_state', bs.host_id, bs.guest_id);
          else handleDriveFor(guestS, hostS, 'guest_state', 'host_state', bs.guest_id, bs.host_id);
        }
        if (processCpu) handleDriveFor(guestS, hostS, 'guest_state', 'host_state', CPU_PLAYER_ID, bs.host_id);
        // フラグクリア＋usageLimit永続化（driver 側のフラグのみクリア）
        const applyState = (key: PlayerStateKey, base: PlayerState, clearFlag: boolean) => {
          const used = usedByKey[key];
          if (!used && !clearFlag) return;
          states[key] = {
            ...(states[key] ?? base),
            ...(clearFlag ? { drive_became_just: null } : {}),
            ...(used ? { actions_done: [...(base.actions_done ?? []), ...used] } : {}),
          };
        };
        applyState('host_state', hostS, !!(processOwn && localIsHost));
        applyState('guest_state', guestS, !!((processOwn && !localIsHost) || processCpu));
        let newStack: EffectStack | undefined;
        if (entries.length > 0) {
          const existingStack = bs.effect_stack ?? null;
          newStack = existingStack
            ? pushToStack(existingStack, entries)
            : initStack(bs.active_user_id ?? user.id, entries);
        }
        if (Object.keys(states).length > 0 || newStack !== undefined) {
          await persist.commit(reduceBattle(bs, { type: 'WRITE_STATES', states, effectStack: newStack }));
        }
      } finally {
        setLoading(false);
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myDriveBecameRef, cpuDriveBecameRef, bs?.effect_stack, bs?.pending_effect]); // eslint-disable-line react-hooks/exhaustive-deps

  // カードが【ビート】になった直後フラグ（beat_became_just）を検出して ON_BECOME_BEAT を発火。
  // フラグは【ビート】になったカードの所有者の state に積まれる（drive_became_just と同型）。
  const myBeatBecameRef = (user && bs)
    ? (user.id === bs.host_id ? bs.host_state?.beat_became_just : bs.guest_state?.beat_became_just)
    : undefined;
  const cpuBeatBecameRef = isCpuBattle ? bs?.guest_state?.beat_became_just : undefined;
  useEffect(() => {
    if (!bs || !user || loading) return;
    if (bs.effect_stack || bs.pending_effect) return;
    const localIsHost = user.id === bs.host_id;
    const processOwn = !!(myBeatBecameRef && myBeatBecameRef.length > 0);
    const processCpu = isCpuBattle && localIsHost && !!(cpuBeatBecameRef && cpuBeatBecameRef.length > 0);
    if (!processOwn && !processCpu) return;
    (async () => {
      setLoading(true);
      try {
        const entries: StackEntry[] = [];
        const states: Partial<Record<PlayerStateKey, PlayerState>> = {};
        const usedByKey: Partial<Record<PlayerStateKey, string[]>> = {};
        const handleBeatFor = (ownerState: PlayerState, ownerKey: PlayerStateKey, ownerId: string) => {
          for (const becameNum of ownerState.beat_became_just ?? []) {
            const r = collectBeatBecameTriggers(becameNum, ownerState, ownerId);
            entries.push(...r.entries);
            if (r.usedIds.length) usedByKey[ownerKey] = [...(usedByKey[ownerKey] ?? []), ...r.usedIds];
          }
        };
        const hostS = bs.host_state, guestS = bs.guest_state;
        if (processOwn) {
          if (localIsHost) handleBeatFor(hostS, 'host_state', bs.host_id);
          else handleBeatFor(guestS, 'guest_state', bs.guest_id);
        }
        if (processCpu) handleBeatFor(guestS, 'guest_state', CPU_PLAYER_ID);
        const applyState = (key: PlayerStateKey, base: PlayerState, clearFlag: boolean) => {
          const used = usedByKey[key];
          if (!used && !clearFlag) return;
          states[key] = {
            ...(states[key] ?? base),
            ...(clearFlag ? { beat_became_just: null } : {}),
            ...(used ? { actions_done: [...(base.actions_done ?? []), ...used] } : {}),
          };
        };
        applyState('host_state', hostS, !!(processOwn && localIsHost));
        applyState('guest_state', guestS, !!((processOwn && !localIsHost) || processCpu));
        let newStack: EffectStack | undefined;
        if (entries.length > 0) {
          const existingStack = bs.effect_stack ?? null;
          newStack = existingStack
            ? pushToStack(existingStack, entries)
            : initStack(bs.active_user_id ?? user.id, entries);
        }
        if (Object.keys(states).length > 0 || newStack !== undefined) {
          await persist.commit(reduceBattle(bs, { type: 'WRITE_STATES', states, effectStack: newStack }));
        }
      } finally {
        setLoading(false);
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myBeatBecameRef, cpuBeatBecameRef, bs?.effect_stack, bs?.pending_effect]); // eslint-disable-line react-hooks/exhaustive-deps

  // ON_ENERGY_CHARGE / ON_POWER_THRESHOLD の検知ウォッチャー（WX03-032）。
  // 状態変化のたびに、前回スナップショット（prevEnergyRef/prevPowersRef）と比較して
  //  - エナゾーンにカードがちょうど1枚増えた → ON_ENERGY_CHARGE（2枚同時=エナチャージ2等は不発）
  //  - シグニのパワーが閾値（SELF_POWER_GTE.value）を下から跨いで到達 → ON_POWER_THRESHOLD
  // を検知してスタックに積む。二重pushを避けるため push はホスト側クライアントのみ行う。
  useEffect(() => {
    if (!bs || !user || loading) return;
    if (bs.effect_stack || bs.pending_effect) return;
    if (bs.global_phase !== 'PLAYING') return;
    const hostState = bs.host_state, guestState = bs.guest_state;
    const hostIsActive = bs.active_user_id === bs.host_id;
    // 各シグニを「その持ち主視点」で計算したパワー（ターン依存修正を正しく反映）
    const hostPowers  = calcFieldPowers(hostState, guestState, hostIsActive,  effectsMap, battleCardMap, bs.turn_phase);
    const guestPowers = calcFieldPowers(guestState, hostState, !hostIsActive, effectsMap, battleCardMap, bs.turn_phase);
    const curPowers = new Map<string, number>([...hostPowers, ...guestPowers]);
    const prevEnergy = prevEnergyRef.current;
    const prevPowers = prevPowersRef.current;
    const snapshot = () => {
      prevEnergyRef.current = { host: [...hostState.energy], guest: [...guestState.energy] };
      prevPowersRef.current = curPowers;
    };
    // 初回観測 or push権を持たない（非ホスト）クライアントはスナップショット更新のみ
    if (!prevEnergy || !prevPowers || user.id !== bs.host_id) { snapshot(); return; }

    const sides: Array<{ key: 'host' | 'guest'; st: PlayerState; op: PlayerState; ownerId: string; prevE: string[] }> = [
      { key: 'host',  st: hostState,  op: guestState, ownerId: bs.host_id,  prevE: prevEnergy.host },
      { key: 'guest', st: guestState, op: hostState,  ownerId: bs.guest_id, prevE: prevEnergy.guest },
    ];
    const entries: StackEntry[] = [];
    const autoUsedByKey: Record<'host' | 'guest', string[]> = { host: [], guest: [] };
    for (const { key, st, op, ownerId, prevE } of sides) {
      const isOwnerActiveTurn = ownerId === bs.active_user_id;
      // ON_ENERGY_CHARGE: エナがちょうど1枚増えたとき（差分の新規カードが1枚）
      const addedToEnergy = st.energy.filter(n => !prevE.includes(n));
      // センタールリグの付与ストア（effectsMap 非搭載）の ON_ENERGY_CHARGE watcher（SPDi43-13-E2＝
      // 「ターン終了時まで、このルリグは『【自】あなたのエナゾーンにカードが置かれたとき…』を得る」）。
      // 下の走査は場のシグニしか見ないため、ルリグ host の付与能力は付与ストアから別途収集する。
      // 🔴《ターン1回/2回》の予約は**付与 watcher と印刷シグニの両方**で行う（タスク12(cxx)）。
      //   ⚠この useEffect は entries を積むだけで `actions_done` へ書き戻していなかったため、
      //     印刷シグニ側は**エナチャージのたびに撃てた**（ON_ENERGY_CHARGE 6効果／ON_POWER_THRESHOLD 3効果）。
      //     予約 ID は下の commit で `actions_done` へ書き戻す＝他コレクタと同じ規約。
      const ecLrigTop = st.field.lrig.at(-1);
      if (ecLrigTop && addedToEnergy.length === 1) {
        for (const w of grantedStoreWatchers(st, 'ON_ENERGY_CHARGE', ['self', 'any_ally', 'any'])) {
          const eff = w.effect;
          if (eff.triggerCondition?.movedSelf) continue;
          if (eff.triggerCondition?.byOwnEffect || eff.triggerCondition?.byOpponentEffect || eff.triggerCondition?.byEffect) continue;
          // 🆕`O-64`：「〈あなた〉のメインフェイズの間／以外で」＝この watcher は collector ではないので
          //   `mainPhaseGateOk` を通らない。**フェイズ語彙を1つも見ていなかった**ので素の版を直接呼ぶ。
          if (!mainPhaseGateOkFor(eff, bs.turn_phase, bs.active_user_id ?? undefined, ownerId)) continue;
          if (eff.condition?.type === 'IS_MY_TURN' && !isOwnerActiveTurn) continue;
          if (eff.condition && eff.condition.type !== 'IS_MY_TURN'
              && !evalUseCondition(eff.condition, st, op, battleCardMap, ecLrigTop, bs.turn_phase, curPowers)) continue;
          if (!reserveGrantedAutoUsage(st, eff, autoUsedByKey[key])) continue;
          entries.push({ id: generateUUID(), playerId: ownerId, cardNum: ecLrigTop, effectId: eff.effectId,
            label: `${battleCardMap.get(ecLrigTop)?.CardName ?? ecLrigTop} の【自】効果（エナチャージ時・付与能力）`, effect: eff });
        }
      }
      // ON_POWER_THRESHOLD / ON_ENERGY_CHARGE は場のシグニを走査
      for (let zi = 0; zi < st.field.signi.length; zi++) {
        const topNum = st.field.signi[zi]?.at(-1);
        if (!topNum) continue;
        for (const eff of effectsMap.get(topNum) ?? []) {
          if (eff.effectType !== 'AUTO') continue;
          if (eff.timing?.includes('ON_ENERGY_CHARGE') && addedToEnergy.length === 1) {
            if (eff.triggerCondition?.movedSelf) continue;
            if (eff.triggerCondition?.byOwnEffect || eff.triggerCondition?.byOpponentEffect || eff.triggerCondition?.byEffect) continue;
            if (!mainPhaseGateOkFor(eff, bs.turn_phase, bs.active_user_id ?? undefined, ownerId)) continue;   // `O-64`
            // 「あなたのターンの間」= IS_MY_TURN（evalでは常にtrueのため、ここで自ターン判定）
            if (eff.condition?.type === 'IS_MY_TURN' && !isOwnerActiveTurn) continue;
            if (eff.condition && eff.condition.type !== 'IS_MY_TURN'
                && !evalUseCondition(eff.condition, st, op, battleCardMap, topNum, bs.turn_phase, curPowers)) continue;
            if (!reserveGrantedAutoUsage(st, eff, autoUsedByKey[key])) continue;   // タスク12(cxx)
            entries.push({ id: generateUUID(), playerId: ownerId, cardNum: topNum, effectId: eff.effectId,
              label: `${battleCardMap.get(topNum)?.CardName ?? topNum} の【自】効果（エナチャージ時）`, effect: eff });
          }
          if (eff.timing?.includes('ON_POWER_THRESHOLD')) {
            // 🆕`O-64`：「あなたのメインフェイズの間、このシグニのパワーがN以上になったとき」
            //   （`WX18-077-E1`／`WX18-078-E1`）。この枝は `triggerCondition` を1つも見ていなかった＝
            //   相手ターン・相手メインフェイズでも発火していた。
            if (!mainPhaseGateOkFor(eff, bs.turn_phase, bs.active_user_id ?? undefined, ownerId)) continue;
            const threshold = eff.condition?.type === 'SELF_POWER_GTE' ? eff.condition.value : Infinity;
            const curP  = curPowers.get(topNum) ?? 0;
            const prevP = prevPowers.get(topNum);
            const wasBelow = prevP === undefined || prevP < threshold;
            if (curP >= threshold && wasBelow) {
              if (!reserveGrantedAutoUsage(st, eff, autoUsedByKey[key])) continue;   // タスク12(cxx)
              entries.push({ id: generateUUID(), playerId: ownerId, cardNum: topNum, effectId: eff.effectId,
                label: `${battleCardMap.get(topNum)?.CardName ?? topNum} の【自】効果（パワー${threshold}到達時）`, effect: eff });
            }
          }
        }
      }
    }
    if (entries.length === 0) { snapshot(); return; }
    (async () => {
      setLoading(true);
      try {
        const existingStack = bs.effect_stack ?? null;
        const newStack = existingStack ? pushToStack(existingStack, entries) : initStack(bs.active_user_id ?? user.id, entries);
        const states: Partial<Record<PlayerStateKey, PlayerState>> = {};
        if (autoUsedByKey.host.length > 0) {
          states.host_state = { ...hostState, actions_done: [...(hostState.actions_done ?? []), ...autoUsedByKey.host] };
        }
        if (autoUsedByKey.guest.length > 0) {
          states.guest_state = { ...guestState, actions_done: [...(guestState.actions_done ?? []), ...autoUsedByKey.guest] };
        }
        await persist.commit(reduceBattle(bs, { type: 'WRITE_STATES', states, effectStack: newStack }));
        snapshot();
      } finally {
        setLoading(false);
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bs, loading]); // eslint-disable-line react-hooks/exhaustive-deps

  // ON_TURN_END 解決後の自動フェーズ進行
  useEffect(() => {
    if (!bs || !user) return;
    if (bs.global_phase !== 'PLAYING') return;
    if (bs.turn_phase !== 'END') return;
    const localIsMyTurn = bs.active_user_id === user.id;
    if (!localIsMyTurn || loading) return;
    if (bs.effect_stack || bs.pending_effect) return;
    const localIsHost = user.id === bs.host_id;
    const localMy = localIsHost ? bs.host_state : bs.guest_state;
    if (!(localMy.actions_done?.includes('__TURN_END__'))) return;
    doPhaseAdvanceRef.current?.();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bs?.turn_phase, bs?.effect_stack, bs?.pending_effect, bs?.global_phase, bs?.active_user_id, bs?.host_state, bs?.guest_state]); // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * §6.4 O-10（続き515）＝`CHECK_ZONE_FLIP_FREE_GROW` の予約（`pending_flip_grow_card`）を消費して
   * **正規のグロウ経路**（`executeGrow`）でグロウする。
   *
   * 🔑engine 側で `field.lrig` へ直接 push すると、グロウ時トリガー（【出】）・リミット再計算・
   * コイン獲得が**丸ごと落ちる**（`GROW_FREE` が「BattleScreen 処理」なのと同じ理由）。
   * ⚠**多重発火ガード**＝予約は commit が返るまで state に残るので、同じ対象で2回走らないよう ref で締める。
   * ⚠`freeCost:true`／`consumeGrowAction:false`＝「グロウコストを支払わずに」かつ通常グロウ枠を消費しない。
   *
   * ⚠🔴**この2つの hook は必ず `if (!bs) return` より前に置くこと**（2026-08-18 続き554・実機で発見）＝
   *   後ろに置くと **bs 到着後の再レンダーで hook 数が増え**、React #310
   *   "Rendered more hooks than during the previous render." で **BattleScreen が丸ごと落ちて画面が真っ黒**になる。
   *   ⚠**typecheck も lint も golden も踏めない層**（`react-hooks/rules-of-hooks` は「早期 return の後ろの hook」を
   *   検出しない）＝**実機で初めて出る**。この節の他の hook と同じく、必要な値は `bs` から**その場で導出**する
   *   （`my`／`isMyTurn` は下の PLAYING セクションで定義されるので、**依存配列からは参照できない**）。
   * ⚠effect の**本体**は render 後に走るので、後方で定義される `executeGrow` を参照してよい（TDZ に掛からない）。
   *   掛かるのは**依存配列**（hook 呼び出し時に評価される）だけ。
   */
  const flipGrowRef = useRef<string | null>(null);
  useEffect(() => {
    if (!bs || bs.global_phase !== 'PLAYING') return;
    const localIsHost = user.id === bs.host_id;
    const localMy = localIsHost ? bs.host_state : bs.guest_state;
    const target = localMy?.pending_flip_grow_card;
    if (!target) { flipGrowRef.current = null; return; }
    if (bs.active_user_id !== user.id || loading) return;
    if (flipGrowRef.current === target) return;
    const card = battleCardMap.get(target);
    if (!card) return;                 // カードデータが無ければ何もしない（壊れたルリグを作らない）
    flipGrowRef.current = target;
    void executeGrow(card, new Set(), {
      baseState: { ...localMy, pending_flip_grow_card: undefined },
      freeCost: true,
      consumeGrowAction: false,
      instanceId: target,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bs?.host_state?.pending_flip_grow_card, bs?.guest_state?.pending_flip_grow_card,
      bs?.active_user_id, loading, bs?.global_phase]);

  /**
   * §5.3 `O-83`（`SP38-001-E1`）＝`STUB{GROW_BY_EFFECT}` の予約（`pending_effect_grow`）を消費して
   * **グロウ先選択モーダル**を開く。実際のグロウは `executeGrow`（正規経路）が行う。
   *
   * 🔴**`GROW_FREE` と違い `freeCost` は false**＝原文が「コストを支払わずに」と書いていないので
   *   通常のグロウコストを払う（`freeGrowFilter:'plus1_paid'`）。ここを `'plus1'` にするとコスト踏み倒し。
   * ⚠原文は「グロウしても**よい**」＝任意なので、モーダルを閉じれば何も起きない（予約はここで消す）。
   * ⚠`suppressOnPlay`＝「この方法でグロウしたルリグの【出】能力は発動しない」を**そのグロウ1回だけ**へ効かせる。
   * ⚠🔴**この hook も `if (!bs) return` より前**（上の `flipGrowRef` と同じ理由＝後ろに置くと React #310）。
   */
  const effectGrowRef = useRef(false);
  /** 直後の1回のグロウだけ【出】を抑制するか（`pending_effect_grow.suppressOnPlay` の持ち越し）。 */
  const effectGrowSuppressRef = useRef(false);
  useEffect(() => {
    if (!bs || bs.global_phase !== 'PLAYING') return;
    const localIsHost = user.id === bs.host_id;
    const localMy = localIsHost ? bs.host_state : bs.guest_state;
    const req = localMy?.pending_effect_grow;
    if (!req) { effectGrowRef.current = false; return; }
    if (bs.active_user_id !== user.id || loading) return;
    if (effectGrowRef.current) return;
    effectGrowRef.current = true;
    // 予約は「開いた時点で」消す＝モーダルを閉じた（＝グロウしない）場合に再度開き直さないため。
    // ⚠【出】抑制は state ではなく ref で1回だけ持ち越す（`executeGrow` の `suppressOnPlayOnce`）。
    const cleared: PlayerState = { ...localMy, pending_effect_grow: undefined };
    void persist.commit(reduceBattle(bs, {
      type: 'WRITE_STATE', myKey: localIsHost ? 'host_state' : 'guest_state', myState: cleared,
    }));
    effectGrowSuppressRef.current = req.suppressOnPlay === true;
    // 🆕§5.3 `O-345`＝原文に「グロウコストを支払わずに」がある形だけ `'plus1'`（無償）。
    //   🔴既定は `'plus1_paid'` のまま＝ここを取り違えるとコスト踏み倒しになる（`O-83` の注意書き）。
    //   `cardNames` はグロウ先の名前限定（`WX19-007-E2`）。
    openFreeGrow(req.free ? 'plus1' : 'plus1_paid', req.cardNames?.length ? req.cardNames : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bs?.host_state?.pending_effect_grow, bs?.guest_state?.pending_effect_grow,
      bs?.active_user_id, loading, bs?.global_phase]);

  if (!bs) return (
    <div style={{ height: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'center', backgroundColor: C.bgSetup, color: C.text }}>
      読み込み中...
    </div>
  );

  const isHost = user.id === bs.host_id;

  // CPU セットアップ自動行動（SETUPブロックより前に定義・代入が必要）
  const cpuSetupAction = async () => {
    if (!bs) return;
    const phase = bs.setup_phase;

    if (phase === 'JAN_KEN') {
      const choices = ['GU', 'CHOKI', 'PA'];
      const pick = choices[randomInt(choices.length)];
      await persist.commit(reduceBattle(bs, { type: 'SUBMIT_JANKEN', isHost: false, pick }));
      return;
    }

    if (phase === 'LRIG_SELECT' && cpuDeckData) {
      const lrigWithIds = assignGuestInstanceIds(cpuDeckData.lrig_deck);
      const mainWithIds = assignGuestInstanceIds(shuffle(cpuDeckData.main_deck));
      // 🆕2026-09-17＝**どれを置くかはデッキ編成の指定**（人間と同じ `resolveDeckLrigSetup`）。
      //   盤面の組み立ても人間と同じ `buildLrigSetupState`（§5.6 `C-5` 追補＝旧実装はセンターしか置かなかった）。
      const cpuSetupPick = resolveDeckLrigSetup(cpuDeckData.lrig_deck, lrigRolesOfRow(cpuDeckData), battleCardMap);
      if (!cpuSetupPick) return;
      const lv0Idx = cpuSetupPick.centerIdx;
      const cpuState: PlayerState = buildLrigSetupState({
        lrigWithIds, mainWithIds, centerId: lrigWithIds[lv0Idx],
        assistLId: cpuSetupPick.assistIdx ? lrigWithIds[cpuSetupPick.assistIdx[0]] : null,
        assistRId: cpuSetupPick.assistIdx ? lrigWithIds[cpuSetupPick.assistIdx[1]] : null,
        cardMap: battleCardMap,
      });
      if (cpuSetupPick.assistIdx) {
        appendBattleLogs([`[CPU] アシストルリグを配置: ${cpuSetupPick.assistIdx.map(i => battleCardMap.get(cpuDeckData.lrig_deck[i])?.CardName ?? cpuDeckData.lrig_deck[i]).join('・')}`]);
      }
      await persist.commit(reduceBattle(bs, {
        type: 'SELECT_LRIG', isHost: false,
        selectedCardNum: cpuDeckData.lrig_deck[lv0Idx], state: cpuState,
      }));
      return;
    }

    if (phase === 'MULLIGAN') {
      const cpuSt = bs.guest_state;
      // 🆕§5.6 `C-4`＝**CPU も引き直す**。戻す札は `pickCpuMulliganIndices`、処理は人間と同じ `applyMulligan`
      //   （旧実装は引き直さずライフを置くだけの別実装だった）。
      // 🆕§5.7 `S-24`（2026-09-21）＝**判断と実行を繋ぐ段も `controller/performMulligan.ts` の1本**にした
      //   ＝自己対戦（`headlessSelfPlay.ts`）が同じ関数を通る（旧＝ここにしか無く、ハーネスはマリガンを踏めなかった）。
      const cpuMull = performCpuMulligan({ state: cpuSt, cardMap: battleCardMap, plan: cpuPlan });
      appendBattleLogs(cpuMull.logs);
      const newCpuSt: PlayerState = cpuMull.state;
      await persist.commit(reduceBattle(bs, { type: 'COMPLETE_MULLIGAN', isHost: false, state: newCpuSt }));
      const { data: fresh } = await supabase
        .from('battle_states').select('host_mulligan_done, guest_mulligan_done, first_player_id')
        .eq('room_id', roomId).single();
      if (fresh?.host_mulligan_done && fresh?.guest_mulligan_done) {
        await persist.commit(reduceBattle(bs, { type: 'START_PLAYING', activeUserId: fresh.first_player_id as string }));
      }
    }
  };
  cpuSetupRef.current = cpuSetupAction;

  // ══════════════════════════════════════════
  // SETUP フェイズ
  // ══════════════════════════════════════════

  const handleSetupLeave = async () => {
    setShowSetupLeaveConfirm(false);
    leavingRef.current = true;
    await persist.remove();
    await supabase.from('rooms').delete().eq('id', roomId);
    onBack();
  };

  const setupLeaveBtn = (
    <div style={{ position: 'absolute', top: 14, right: 14, display: 'flex', gap: 6 }}>
      <button
        onClick={() => window.location.reload()}
        style={{
          padding: '5px 12px', borderRadius: 6, border: '1px solid #444',
          backgroundColor: 'transparent', color: '#888', fontSize: 13, cursor: 'pointer',
        }}
      >
        ↺
      </button>
      <button
        onClick={() => setShowSetupLeaveConfirm(true)}
        style={{
          padding: '5px 12px', borderRadius: 6, border: '1px solid #444',
          backgroundColor: 'transparent', color: '#888', fontSize: 13, cursor: 'pointer',
        }}
      >
        終了
      </button>
    </div>
  );

  const setupLeaveConfirmModal = showSetupLeaveConfirm && (
    <div style={{
      position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.7)',
      display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 9999,
    }}>
      <div style={{
        backgroundColor: '#1a1a2e', border: '1px solid #444', borderRadius: 10,
        padding: '28px 32px', textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 16,
      }}>
        <p style={{ color: '#ccc', margin: 0, fontSize: 15 }}>ルームを削除して終了しますか？</p>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
          <button onClick={handleSetupLeave}
            style={{ padding: '8px 28px', borderRadius: 6, border: 'none', backgroundColor: '#c0392b', color: '#fff', fontSize: 14, cursor: 'pointer', fontWeight: 'bold' }}>
            終了する
          </button>
          <button onClick={() => setShowSetupLeaveConfirm(false)}
            style={{ padding: '8px 28px', borderRadius: 6, border: '1px solid #444', backgroundColor: 'transparent', color: '#aaa', fontSize: 14, cursor: 'pointer' }}>
            キャンセル
          </button>
        </div>
      </div>
    </div>
  );

  if (bs.global_phase === 'SETUP') {

    // ① じゃんけん
    if (bs.setup_phase === 'JAN_KEN') {
      const myJanken = isHost ? bs.host_janken : bs.guest_janken;
      const opJanken = isHost ? bs.guest_janken : bs.host_janken;

      const handleJanken = async (choice: string) => {
        if (loading || myJanken) return;
        setLoading(true);
        try {
          await persist.commit(reduceBattle(bs, { type: 'SUBMIT_JANKEN', isHost, pick: choice }));

          const { data: fresh } = await supabase
            .from('battle_states').select('host_janken, guest_janken')
            .eq('room_id', roomId).single();

          // ⚠🆕§5.1 `V-284`＝**上の effect が同じ解決を予約していたら二重に commit しない**
          //   （あいこの直後に CPU が選び直した手を、古いパッチで消してしまう）。
          if (fresh?.host_janken && fresh?.guest_janken && !transitioningRef.current && !jankenResolveRef.current) {
            transitioningRef.current = true;
            const winner = jankenWinner(fresh.host_janken, fresh.guest_janken, bs.host_id, bs.guest_id);
            const transUpdate = reduceBattle(bs, { type: 'RESOLVE_JANKEN', winnerId: winner });
            await new Promise(resolve => setTimeout(resolve, 1800));
            await persist.commit(transUpdate);
            transitioningRef.current = false;
          }
        } finally {
          setLoading(false);
        }
      };

      if (myJanken && opJanken) {
        const hostChoice = isHost ? myJanken : opJanken;
        const guestChoice = isHost ? opJanken : myJanken;
        const winner = jankenWinner(hostChoice, guestChoice, bs.host_id, bs.guest_id);
        const iWon = winner === user.id;
        return (
          <>{setupLeaveConfirmModal}<div style={setupWrap}>
            <h2 style={{ color: C.text, margin: 0 }}>じゃんけん結果</h2>
            <p style={{ margin: 0 }}>あなた: {JANKEN_LABEL[myJanken]}   相手: {JANKEN_LABEL[opJanken]}</p>
            {winner ? (
              <>
                <p style={{ color: iWon ? C.success : C.danger, fontSize: 24, fontWeight: 'bold', margin: 0 }}>
                  {iWon ? '勝ち！先攻です' : '負け…後攻です'}
                </p>
                <p style={{ color: C.textFaint, fontSize: 13, margin: '8px 0 0' }}>次のフェイズへ移行中...</p>
              </>
            ) : (
              <>
                <p style={{ color: C.aiko, fontSize: 28, fontWeight: 'bold', margin: 0 }}>あいこ！</p>
                <p style={{ color: C.textDim, fontSize: 14, margin: '8px 0 0' }}>もう一度選んでください...</p>
              </>
            )}
            {setupLeaveBtn}
          </div></>
        );
      }

      if (myJanken) return (
        <>{setupLeaveConfirmModal}<div style={setupWrap}>
          <h2 style={{ color: C.text, margin: 0 }}>じゃんけん</h2>
          <p style={{ color: C.success }}>あなた: {JANKEN_LABEL[myJanken]}</p>
          <p style={{ color: C.textFaint }}>相手の選択を待っています...</p>
          {setupLeaveBtn}
        </div></>
      );

      return (
        <>{setupLeaveConfirmModal}<div style={setupWrap}>
          <h2 style={{ color: C.text, margin: 0 }}>じゃんけんで先攻後攻を決めます</h2>
          <p style={{ color: C.textDim, margin: 0, fontSize: 13 }}>出す手を選んでください</p>
          <div style={{ display: 'flex', gap: 16 }}>
            {(['GU', 'CHOKI', 'PA'] as const).map(c => (
              <button key={c} onClick={() => handleJanken(c)} disabled={loading}
                style={{ ...primaryBtn, fontSize: 20, padding: '20px 28px' }}>
                {JANKEN_LABEL[c]}
              </button>
            ))}
          </div>
          {setupLeaveBtn}
        </div></>
      );
    }

    // ② ルリグ選択
    if (bs.setup_phase === 'LRIG_SELECT') {
      const mySelected = isHost ? bs.host_lrig_selected : bs.guest_lrig_selected;

      if (mySelected) return (
        <>{setupLeaveConfirmModal}<div style={setupWrap}>
          <h2 style={{ color: C.text, margin: 0 }}>ルリグ配置完了</h2>
          <p style={{ color: C.success }}>相手の準備を待っています...</p>
          <p style={{ color: C.textDim, fontSize: 13 }}>配置: {battleCardMap.get(mySelected)?.CardName ?? mySelected}</p>
          {setupLeaveBtn}
        </div></>
      );

      if (!myDeckData) return <div style={setupWrap}><p>デッキ読み込み中...</p></div>;

      // 🆕2026-09-17＝**選択画面は廃止**＝デッキ編成の指定どおりに自動で置く（`lrigAutoPlace` の effect）。
      //   ここに来るのは「置いている最中」か「デッキの指定が対戦に出せない形」だけ。
      const setupProblem = deckLrigSetupProblem({ ...lrigRolesOfRow(myDeckData), lrigDeck: myDeckData.lrig_deck }, battleCardMap);
      return (
        <>{setupLeaveConfirmModal}<div style={setupWrap}>
          {setupProblem ? (
            <>
              <h2 style={{ color: C.text, margin: 0 }}>ルリグを配置できません</h2>
              <p style={{ color: '#f44', margin: 0 }}>{DECK_LRIG_SETUP_PROBLEM_JA[setupProblem]}。デッキ編成の「ルリグ」タブで指定してください。</p>
            </>
          ) : (
            <h2 style={{ color: C.text, margin: 0 }}>ルリグを配置しています...</h2>
          )}
          {setupLeaveBtn}
        </div></>
      );
    }

    // ③ マリガン（カード画像で選択）
    if (bs.setup_phase === 'MULLIGAN') {
      const myState: PlayerState = isHost ? bs.host_state : bs.guest_state;
      const myDone = isHost ? bs.host_mulligan_done : bs.guest_mulligan_done;
      const iAmFirst = bs.first_player_id === user.id;

      if (myDone) return (
        <>{setupLeaveConfirmModal}<div style={setupWrap}>
          <h2 style={{ color: C.text, margin: 0 }}>マリガン完了</h2>
          <p style={{ color: iAmFirst ? C.accent : C.textAlt, fontWeight: 'bold', fontSize: 18, margin: 0 }}>
            {iAmFirst ? '先攻です' : '後攻です'}
          </p>
          <p style={{ color: C.textFaint }}>相手の確認を待っています...</p>
          {setupLeaveBtn}
        </div></>
      );

      const toggleCard = (i: number) => setMulliganSelected(prev => {
        const next = new Set(prev);
        if (next.has(i)) next.delete(i); else next.add(i);
        return next;
      });

      const handleConfirm = async () => {
        if (loading) return;
        setLoading(true);
        try {
          // §5.6 `C-4`＝引き直しとライフ設置は `applyMulligan` の1本（CPU も同じ関数を通る）。
          const newState: PlayerState = applyMulligan(myState, mulliganSelected);
          await persist.commit(reduceBattle(bs, { type: 'COMPLETE_MULLIGAN', isHost, state: newState }));

          // 最新状態を取得して両者が完了しているか確認
          const { data: fresh } = await supabase
            .from('battle_states')
            .select('host_mulligan_done, guest_mulligan_done, first_player_id')
            .eq('room_id', roomId)
            .single();

          if (fresh?.host_mulligan_done && fresh?.guest_mulligan_done) {
            // 両者完了 → 自分が直接 PLAYING へ遷移させる（両プレイヤーとも送信して確実に反映）
            await persist.commit(reduceBattle(bs, { type: 'START_PLAYING', activeUserId: fresh.first_player_id as string }));
          }
        } finally {
          setLoading(false);
        }
      };

      return (
        <>{setupLeaveConfirmModal}<div style={{ ...setupWrap, justifyContent: 'flex-start', paddingTop: 32, overflowY: 'auto' }}>
          <h2 style={{ color: C.text, margin: 0, flexShrink: 0 }}>マリガン</h2>
          <p style={{ color: iAmFirst ? C.accent : C.textAlt, fontWeight: 'bold', margin: 0, flexShrink: 0 }}>
            {iAmFirst ? '先攻' : '後攻'}
          </p>
          <p style={{ color: C.textDim, margin: 0, fontSize: 12, textAlign: 'center', flexShrink: 0 }}>
            タップで選択（戻す）/ 長押しで拡大
          </p>
          {/* カード画像グリッド */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center', flexShrink: 0 }}>
            {myState.hand.map((cardNum, i) => (
              <MulliganCard
                key={i}
                cardNum={cardNum}
                cards={battleCards}
                selected={mulliganSelected.has(i)}
                onToggle={() => toggleCard(i)}
              />
            ))}
          </div>
          {mulliganSelected.size > 0 && (
            <p style={{ color: '#f44', fontSize: 12, margin: 0, flexShrink: 0 }}>
              {mulliganSelected.size}枚を戻して引き直します
            </p>
          )}
          <div style={{ display: 'flex', gap: 12, flexShrink: 0 }}>
            {mulliganSelected.size > 0 ? (
              <button onClick={handleConfirm} disabled={loading}
                style={{ ...primaryBtn, backgroundColor: C.dangerDark }}>
                {mulliganSelected.size}枚引き直す
              </button>
            ) : (
              <button onClick={handleConfirm} disabled={loading} style={primaryBtn}>
                このままでOK
              </button>
            )}
          </div>
          {setupLeaveBtn}
        </div></>
      );
    }
  }

  // ══════════════════════════════════════════
  // PLAYING フェイズ
  // ══════════════════════════════════════════
  const my = isHost ? bs.host_state : bs.guest_state;
  const op = isHost ? bs.guest_state : bs.host_state;
  const isMyTurn = bs.active_user_id === user.id;
  // LIMIT_ALL_FIELD_N: すべてのプレイヤーのシグニ場出し数の上限（WX04-005-E3）。無ければ3。
  const fieldSigniCountLimit: number = computeFieldSigniLimit(my, op, effectsMap, getCardNum);
  // このフェイズの進行ボタンを自分が持つか
  const iControlThisPhase = NON_TURN_PLAYER_PHASES.includes(bs.turn_phase) ? !isMyTurn : isMyTurn;

  // blocked_actions（一時的封じ）＋ CONTINUOUS 効果の両方を考慮した禁止チェック
  const isActionBlocked = (actionId: string) =>
    (my.blocked_actions?.some(a => a === actionId) ?? false) || contBlocked.forSelf.has(actionId);

  // 「対戦相手はルリグの【起】能力を使用できない」（`USE_LRIG_ACT`・§6.4 O-3 続き487）＝**ルリグ／アシストルリグ
  // の【起】だけ**を封じる。⚠既存の `USE_ACT` はシグニ・キー・付与も含む全【起】を止めるので流用できない。
  /**
   * ルリグデッキ除外コスト（`exileLrigFromLrigDeck`）を払えるか（§6.4 O-11・`PR-469`）。
   * ⚠**提示側にこのゲートが無いと、除外できないのに撃てて実質コスト0**になる。
   */
  const canPayExileLrigFromLrigDeck = (eff: CardEffect): boolean => {
    const c = eff.cost?.exileLrigFromLrigDeck;
    if (!c) return true;
    const n = my.lrig_deck.filter(num => {
      const card = battleCardMap.get(getCardNum(num));
      if (!card) return false;
      if (!c.story) return true;
      return (card.CardClass ?? '').split(/[/／]/).map(x => x.trim()).includes(c.story);
    }).length;
    return n >= c.count;
  };
  /**
   * 🆕§5.3 `O-68`②（2026-09-02）＝「ルリグデッキからアーツN枚をルリグトラッシュに置く」を払えるか。
   * ⚠これが無いと**在庫が無くても【起】が提示され**、支払いをすり抜けて撃てる（`canPayExileLrigFromLrigDeck` と同型）。
   */
  const canPayTrashArtsFromLrigDeck = (eff: CardEffect): boolean => {
    const c = eff.cost?.trashArtsFromLrigDeck;
    if (!c) return true;
    return my.lrig_deck.filter(num => matchesTrashArtsFromLrigDeckCost(battleCardMap.get(getCardNum(num)), c)).length >= c.count;
  };
  const isLrigActBlocked = () => isActionBlocked('USE_ACT') || isActionBlocked('USE_LRIG_ACT');

  /**
   * スペル（手札／スペル・クラフト）を使用できないか（§6.4 O-18・続き513）。
   *
   * 🔴**封じの軸は3つある**のに、ボタン生成側は `USE_SPELL` しか見ていなかった＝
   * `PLAY_COLORLESS`（無色のスペル封じ）と `BLOCK_NON_WHITE_SPELL`（白以外のスペル封じ）は
   * 実行入口 `castSpell` にしかガードが無く、**押しても無反応**の無言 no-op になっていた
   * （続き460 で `USE_SPELL` だけ同じ穴を塞いだときの残り2軸）。
   * ⚠**判定はこの1関数に集約する**＝ボタン生成／実行入口が別々に軸を持つと必ずズレる。
   * ⚠実装は `spellUseGate.isSpellUseBlockedFor`（CPU の候補フィルタも同じ関数を呼ぶ・§8 `O-1` (b)）。
   */
  const isSpellUseBlocked = (card: { Color?: string } | undefined) =>
    isSpellUseBlockedFor(my, contBlocked.forSelf, card);

  /**
   * アーツを使用できないか（§6.4 O-10・続き512）。
   *
   * 🔴`ARTS_LIMIT_1`（「対戦相手は各ターンに一度しかアーツを使用できない」＝`WX13-007-E1`）は
   * **parser が生成するのに engine/UI の誰も読んでいなかった**＝恒久 no-op だった
   * （memory「未消費の `BLOCK_ACTION` id」クラス）。
   * ⚠**回数は `actions_done` の 'USE_ARTS' で数える**＝このターンぶんだけ（自分のターン開始と自分のターン終了で
   *   クリアされるので、相手ターン中に使った分もその1ターン内で正しく数えられる）。
   * ⚠**表示ゲートと実行ゲートの両方で呼ぶ**（片方だけだと「押せるのに無反応」か「UI を迂回して使える」になる）。
   */


  // ─── バニッシュ・ターントリガー ヘルパー ─────────────────────────────
  // detect*/count*（盤面差分の検出/計数）は Stage2 で pure 化＝src/engine/boardDiff.ts に集約（上部 import）。



  const collectTrashTriggers = (
    trashedCardNum: string,
    trashedPlayerId: string,
    afterHostState: PlayerState,
    afterGuestState: PlayerState,
    causeByOpponent = false,
    byCostOrEffect = true,
    byEffectCause = true,
    resonaConditionCardNum?: string,
  ): { entries: StackEntry[]; usedHostIds: string[]; usedGuestIds: string[] } =>
    pureCollectTrashTriggers(mkTrigCtx(), trashedCardNum, trashedPlayerId, afterHostState, afterGuestState, causeByOpponent, byCostOrEffect, byEffectCause, resonaConditionCardNum);
  // 🆕§5.7 `S-5d` 第3段（2026-09-19）＝ON_BANISH／ON_SIGNI_POWER_ZERO_OR_LESS の薄いラッパも `controller/ruleChecks.ts` へ（同上）。
  /**
   * ON_TARGETED（「このシグニが対戦相手の能力か効果の対象になったとき」）のトリガーを収集する（C1 配線）。
   * targetedNums=対象に取られたシグニのカード番号群／targetedOwnerId=その所有者（＝効果発生源の対戦相手）。
   * 両プレイヤーの場シグニから ON_TARGETED AUTO を triggerScope で絞って収集する。
   *   self（既定）: 対象に取られたシグニ自身が ON_TARGETED を持つ場合（WXDi-P11-040/WX25-P2-055 等）
   *   any_ally: watcher 自分側のシグニが対象に取られ triggerFilter（色等）に一致する場合（発火元は能力保持シグニ・WXDi-D09-H14 等）
   *   any_opp/any: 対戦相手側 / いずれか
   * triggerCondition.turnOwner（「対戦相手のターンの間」WXDi-P11-040 等）・condition（WX25-CP1-060）・usageLimit（《ターン1回》）も評価。
   */
  // C1 トリガー収集の依存 ctx（pure 関数 triggerCollect.ts へ注入）。ロジックは同モジュールに集約し、
  // ここは bs/effectsMap/battleCardMap 等を束ねて渡すだけ（golden/fuzz から pure 関数を直接検証可能にするため）。
  const mkTrigCtx = (): TrigCtx =>
    makeTrigCtx({ bs, effectsMap, cardMap: battleCardMap, effectivePowers, userId: user.id });

  /**
   * 🆕§5.7 `S-5c` 第2段（2026-09-18）＝**実行関数の I/O 口**（`controller/battleIo.ts`）。
   * ⚠画面側はこの3つだけを渡す＝ヘッドレスは `createHeadlessIo(memoryPersist)` を渡して**同じ実行関数**を回す。
   */
  const screenIo: BattleIo = {
    commit: persist.commit,
    appendLogs: (lines, opts) => appendBattleLogs(lines, opts),
    flushLogs: flushBattleLogs,
    setLoading,
  };

  /** 🆕§5.7 `S-5c` 第2段＝`perform*` へ渡す共通の材料（`controller/performCtx.ts`）。 */
  const performCtx = (): PerformCtx => ({
    bs, cardMap: battleCardMap, effectsMap, baseEffectsMap, cards: battleCards, userId: user.id, isHost, effectivePowers,
    trigCtx: mkTrigCtx, collectBoardDiff: collectBoardDiffTriggers, io: screenIo,
  });

  /**
   * 🆕**フェイズ遷移先を基準にした `TrigCtx`**（2026-09-02・§5.3 `O-72`）。
   *
   * 🔴**症状**＝`WXK08-048-E1`「【常】：**あなたのアタックフェイズの間**、このシグニはこのカードの下にある
   *   …シグニの**【自】能力**を得る」で得た `ON_ATTACK_PHASE_START` の【自】が**永久に発火しない**。
   * 🔑**真因**＝`effectsMap`（memo）は **`bs.turn_phase`＝遷移「前」**（MAIN）で組まれるので、
   *   `collectGrantedFromUnderSigni` の `activeCondition:{DURING_ATTACK_PHASE}` がまだ false ＝
   *   **付与された【自】が augmented map に載る前に `ON_ATTACK_PHASE_START` を収集していた**。
   *   `checkActiveCondition` の評価タイミングと収集タイミングのズレ（登録票の「当て」どおり）。
   * ⚠**遷移先フェイズで組み直すのは下カード付与だけ**＝ここは `DURING_*` 限定の付与が実在する唯一の経路。
   *   全部を組み直すと memo を捨てることになるうえ、**フェイズ以外の条件は遷移で変わらない**。
   * ⚠**effectId で重複を弾く**（遷移前から載っていた分を二度足さない＝同じ【自】が2回発火する）。
   */
  const collectCoinPaidTriggers = (payerId: string, afterPayerState: PlayerState, afterOpState: PlayerState): { entries: StackEntry[]; usedIds: string[] } =>
    pureCollectCoinPaidTriggers(mkTrigCtx(), payerId, afterPayerState, afterOpState);
  // ON_COIN_PAID の usedIds（《ターン1回/2回》消化）を payer 状態の actions_done へ書き戻すヘルパー（続き106）。
  const applyCoinPaidUsed = (st: PlayerState, coin: { usedIds: string[] }): PlayerState =>
    coin.usedIds.length > 0 ? { ...st, actions_done: [...(st.actions_done ?? []), ...coin.usedIds] } : st;







  /**
   * 🆕§5.7 `S-5b`（2026-09-18）＝**盤面差分トリガーの収集本体（579行＋ラッパ26本）は
   *   `controller/boardDiffTriggers.ts` へ移した**。ここは材料（before 盤面・ID・フェイズ）を束ねるだけ。
   * 🔴**ここに収集を書き戻さない**＝ヘッドレス（`S-5`）は同じ factory を自前で作って回す。golden `§5.7 S-5b` が見張る。
   */
  const collectBoardDiffTriggers: BoardDiffCollector = (afterHost, afterGuest, meta) =>
    makeBoardDiffCollector({
      bs, cardMap: battleCardMap, effectsMap, isHost, userId: user.id, trigCtx: mkTrigCtx,
    })(afterHost, afterGuest, meta);





  // ON_REFRESH トリガー収集（Stage2 で pure 化＝triggerCollect.ts。ここは薄いラッパ）。
  // 🆕§5.7 `S-5d` 第3段（2026-09-19）＝ON_REFRESH の薄いラッパは `controller/ruleChecks.ts` へ（呼び出しはルール処理の中だけ）。







  // フェイズ進行（実処理）。upkeepPay: UPKEEP_OR_NO_UPのコストを支払ってアップする場合に指定
  // 🆕§5.7 `S-5c` 第3段（2026-09-18）＝本体（683行）は `controller/phaseAdvance.ts` へ逐語で移設。画面は材料と UI（捨て札モーダル）を渡すだけ。
  const doPhaseAdvance = async (upkeepPay?: 'energy' | 'discard') =>
    doPhaseAdvanceImpl(upkeepPay, performCtx(), { openEndDiscard });

  // エンドフェイズ手札捨て選択の確定処理
  // 🆕§5.7 `S-5c` 第3段（2026-09-18）＝本体（234行）は `controller/endDiscard.ts` へ逐語で移設。画面は材料とモーダルの状態を渡すだけ。
  const confirmEndDiscard = async () =>
    confirmEndDiscardImpl(performCtx(), { pendingEndDiscard, selectedEndDiscard, closeEndDiscard, loading });

  // UPKEEP_OR_NO_UP: アップ条件のコストを支払ってセンタールリグをアップする
  const handleUpkeepPay = (mode: 'energy' | 'discard') => {
    setShowUpkeepPayConfirm(false);
    doPhaseAdvance(mode);
  };
  // UPKEEP_OR_NO_UP: コストを支払わずセンタールリグをダウンのままにする
  const handleUpkeepDecline = () => {
    setShowUpkeepPayConfirm(false);
    doPhaseAdvance();
  };

  // 全体強制（ターン限定フラグ＋印字/付与の【常】）は resolveForcedSigniAttack に一本化する。
  // ⚠`my.must_attack_signi` を直接読むと【常】（WD07-004/WX14-018/WX20-Re07〜09/WX12-010）が恒久 no-op に戻る。
  const myForcedAttack = resolveForcedSigniAttack(my, op, isMyTurn, effectsMap, battleCardMap);
  const opForcedAttack = resolveForcedSigniAttack(op, my, !isMyTurn, effectsMap, battleCardMap);

  // 強制攻撃: まだアタック（ダウン）しておらず、アタック可能な「強制対象」シグニのゾーン一覧。
  // 🆕§6.4 O-8(a)＝**判定は `collectForcedAttackZones`（signiAttackGate）に一本化**した。
  //   同じ関数がアタックボタン側の順序規則（`FORCED_ATTACK_ORDER`）も決めるので、
  //   「ボタンは消えるのにフェイズは進める」型の軸ズレが構造的に起きない。
  //   ⚠ここに条件を写経し直さないこと（旧実装は `getMySigniZoneActions` のラベル照合で判定していた）。
  const mustAttackRemainingZones = (): number[] => collectForcedAttackZones({
    attacker: my, defender: op, effectsMap, cardMap: battleCardMap,
    contBlocked, effectivePowers, turnPhase: bs.turn_phase,
  });

  // フェイズ進行（エナフェイズ・グロウフェイズ未使用時は確認ポップアップ）
  const handlePhaseAdvance = () => {
    if (!iControlThisPhase || loading) return;
    if (my.pending_signi_battle) return; // シグニアタック解決中はフェイズ移行不可
    if (my.field.check || op.field.check) return; // チェックゾーンにカードがある間はブロック
    // UPKEEP_OR_NO_UP: センタールリグのアップ条件未払いなら確認を挟む
    if (bs.turn_phase === 'UP' && my.lrig_upkeep_condition) {
      setShowUpkeepPayConfirm(true);
      return;
    }
    if (bs.turn_phase === 'ENERGY') {
      const used    = my.actions_done?.includes('ENERGY') ?? false;
      const blocked = my.blocked_actions?.includes('ENERGY') ?? false;
      if (!used && !blocked) {
        setShowEnergySkipConfirm(true);
        return;
      }
    }
    if (bs.turn_phase === 'GROW') {
      const grew    = my.actions_done?.includes('GROW') ?? false;
      // 静的封じ + CONTINUOUS（グロウフェイズスキップ常在）+ no_grow を考慮
      const blocked = isActionBlocked('GROW') || (my.no_grow ?? false);
      if (!grew && !blocked) {
        const hasAffordable = growCandidates.some(card => {
          // 🆕**§5.3 `O-219`**＝グロウ先カード自身の軽減（「このカードにグロウするためのコストは〜」）は
          //   **候補ごとに違う**ので、ループの外で1回だけ計算しない。
          const growRed = collectGrowCostReductions(my, op, isMyTurn, effectsMap, battleCardMap, card.CardNum);
          const gCoin = parseCoinCost(card.GrowCost);
          return (gCoin === 0 || my.coins >= gCoin) &&
            // エナ代替トラッシュ（COST_SUBSTITUTE / ENERGY_SUBSTITUTE_TRASH_SIGNI 等）はグロウ支払いにも効く
            // ＝原文「あなたが《X》を支払う際」はグロウコストを含む（タスク12(xxxvi)・続き206）。
            canAffordEnergyCostWithSubstitutes({
              poolNums: energyPoolCardNums(myEnergyPayPool), cards: battleCards,
              baseCost: applyGrowCostReduction(card.GrowCost, growRed), keywordGrants: my.keyword_grants,
              allMulti: myEnaAllMulti, stripped: myEnaMultiStripped,
              colorlessOverrides: myColorlessOverrides, colorSubs: myColorSubs,
              trashSubWilds: myEnergyTrashSubInfo.wildcardInstIds,
              trashSubColors: myEnergyTrashSubInfo.colorOverrideMap,
              banColorlessPay: my.cannot_pay_colorless_this_attack_phase,
              wholeSubstitutes: myWholeEnergySubstitutes,
            });
        });
        if (hasAffordable) {
          setShowGrowSkipConfirm(true);
          return;
        }
      }
    }
    if (bs.turn_phase === 'ATTACK_SIGNI') {
      const signiDown   = my.field.signi_down   ?? [false, false, false];
      // 強制攻撃: アタック（ダウン）していない「可能ならばアタックしなければならない」対象シグニが
      // 残っている間は次フェイズへ進めない（感染状態限定の場合は感染シグニのみ対象）
      if (mustAttackRemainingZones().length > 0) {
        setShowMustAttackWarning(true);
        return;
      }
      const hasUpSigni  = my.field.signi.some((stack, i) =>
        (stack?.length ?? 0) > 0 && !signiDown[i],
      );
      if (hasUpSigni) {
        setShowSigniAttackSkipConfirm(true);
        return;
      }
    }
    if (bs.turn_phase === 'ATTACK_LRIG') {
      const hasLrig  = (my.field.lrig?.length ?? 0) > 0;
      const lrigUp   = !(my.field.lrig_down ?? false);
      // ⚠アシストルリグがアタックできるターン（`ASSIST_LRIG_ATTACK_THIS_TURN`）は**未アタックのアシスト**も
      //   スキップ確認の対象にする（確認せずに進めると 1回きりのピースの効果を黙って捨てることになる）。
      //   強制ではない（原文は「アタックできる」）ので、警告ではなく確認ダイアログ止まり。
      const assistCanAttack = assistLrigAttackableSlots(my, battleCardMap).length > 0;
      if ((hasLrig && lrigUp) || assistCanAttack) {
        setShowLrigAttackSkipConfirm(true);
        return;
      }
    }
    doPhaseAdvance();
  };

  /**
   * エナチャージ（手札／場のシグニ）。
   * 🆕🔴§5.7 `S-28`（2026-09-21）＝**実行は `controller/performEnergyCharge` の1本**＝
   *   旧はここに**ほぼ同じ手順が2本**あり、さらに **CPU が第3の写経**で**色制限を無視していた**。
   */
  const handleEnergyCharge = async (source: EnergyChargeSource) => {
    if (!isMyTurn || loading) return;
    setLoading(true);
    try {
      const r = performEnergyCharge(my, op, source, battleCardMap, effectsMap);
      if (!r.charged) return;
      appendBattleLogs(r.logs);
      const stateKey = isHost ? 'host_state' : 'guest_state';
      await persist.commit(reduceBattle(bs, { type: 'WRITE_STATE', myKey: stateKey, myState: r.state }));
    } finally {
      setLoading(false);
    }
  };
  const handleEnergyChargeFromHand = (handIndex: number) => handleEnergyCharge({ from: 'hand', handIndex });
  const handleEnergyChargeFromSigni = (zoneIndex: number) => handleEnergyCharge({ from: 'field', zone: zoneIndex });

  // ===== 効果エンジン統合 =====

  // 効果タイプの表示ラベル
   const queueCardEffects = (
    a0: Parameters<typeof queueCardEffectsImpl>[0], a1: Parameters<typeof queueCardEffectsImpl>[1],
    a2: Parameters<typeof queueCardEffectsImpl>[2], a3: Parameters<typeof queueCardEffectsImpl>[3],
    a4: Parameters<typeof queueCardEffectsImpl>[4], a5?: Parameters<typeof queueCardEffectsImpl>[5],
    a6?: Parameters<typeof queueCardEffectsImpl>[6], a7?: Parameters<typeof queueCardEffectsImpl>[7],
    a8?: Parameters<typeof queueCardEffectsImpl>[8],
  ) => queueCardEffectsImpl(a0, a1, a2, a3, a4, a5 ?? undefined, a6 ?? 1, a7 ?? [], a8, performCtx());

  // --- スタック解決 ---

  /**
   * キューの先頭エントリを取り出して effectExecutor で実行し DB に保存する。
   * ターンプレイヤーが呼び出す（useEffect で監視）。
   */
  /**
   * 🆕§5.7 `S-5a`（2026-09-18）＝スタック解決の**材料**。
   * 🆕**データだけになった**（同日の `S-5c` 下ごしらえ）＝誘発の収集・`TrigCtx`・配置数制限は
   *   `resolveStackStep` が中で組み立てる。⚠ここにクロージャを足さない（足すとヘッドレスから遠ざかる）。
   */
  const stackResolveDeps = (): StackResolveDeps => ({
    cardMap: battleCardMap, effectsMap, userId: user.id, isHost, effectivePowers,
  });

  /**
   * スタックの先頭1件を解決する（画面側のシェル）。
   * 🆕§5.7 `S-5a`＝**本体385行は `stackResolve.ts` の `resolveStackStep`（純関数）へ移した**。
   *   ここに残すのは React/DB の都合だけ＝`loading`・多重実行の防止・ログの flush・`persist.commit`。
   * 🔴**ここに解決の中身を書き戻さない**（写経すると人間経路とヘッドレスで挙動が割れる）＝golden `§5.7 S-5a` が見張る。
   */
  const resolveStackNext = async () => {
    if (!bs?.effect_stack || loading) return;
    const stack = bs.effect_stack;
    if (!isReadyToResolve(stack) || stack.queue.length === 0) return;
    if (stackProcessingRef.current) return;  // stale closure による多重実行を防ぐ
    // DB伝播前に setLoading(false) で useEffect が再発火しても同一エントリを二重処理しない
    if (stack.queue[0].id === lastResolvedEntryIdRef.current) return;
    stackProcessingRef.current = true;

    setLoading(true);
    try {
      const step = resolveStackStep(bs, stackResolveDeps());
      if (!step) return;
      if (step.entryId) lastResolvedEntryIdRef.current = step.entryId;
      if (step.logs.length > 0) appendBattleLogs(step.logs, { defer: true });
      await persist.commit(reduceBattle(bs, step.action));
      // main update が確定してから flush（先に RPC が届いて stale な effect_stack で再実行されるのを防ぐ）
      await flushBattleLogs();
    } finally {
      stackProcessingRef.current = false;
      setLoading(false);
    }
  };


  // --- 整列UI用ハンドラ ---

  /**
   * 🆕§5.7 `S-5d` 第1段（2026-09-19）＝**対話の解決 7本（566行）は `controller/effectInteraction.ts` へ逐語で移設**。
   * 画面は材料（`performCtx()`）とモーダルの状態を渡すだけ。
   * 🔑**ヘッドレス（`S-5`）は `loading:false` だけ渡して同じ7本を呼ぶ**＝「誰が答えたか」の経路を1本に保つ。
   */
  const effectInteractionHandlers = () => makeEffectInteractionHandlers(performCtx(), {
    loading, lookReorderTrash, lookReorderBottom, setEffectSelectedNums, setRearrangeSlots,
  });
  const handleConfirmStackOrder = (orderedIds: string[]) =>
    effectInteractionHandlers().handleConfirmStackOrder(orderedIds);
  const handleEffectInteraction = (selectedOrChoiceId: string[]) =>
    effectInteractionHandlers().handleEffectInteraction(selectedOrChoiceId);
  const handleSelectZoneForEffect = (zoneIndex: number) =>
    effectInteractionHandlers().handleSelectZoneForEffect(zoneIndex);
  const handleSelectSigniZoneForEffect = (zoneIndex: number) =>
    effectInteractionHandlers().handleSelectSigniZoneForEffect(zoneIndex);
  const handleAllocatePowerConfirm = (alloc: Record<string, number>) =>
    effectInteractionHandlers().handleAllocatePowerConfirm(alloc);
  const handleRearrangeSigniConfirm = (newArrangement: string[] | null) =>
    effectInteractionHandlers().handleRearrangeSigniConfirm(newArrangement);
  const handleSelectVirusZoneForEffect = (zoneIndex: number | null) =>
    effectInteractionHandlers().handleSelectVirusZoneForEffect(zoneIndex);



  /**
   * 自分側イベント（ON_LIFE_CRASHED / ON_GUARD）に反応する自フィールドシグニの AUTO 効果を収集する。
   * usageLimit 'once_per_turn' は actions_done（effectId）で管理する。発火させた effectId を
   * usedOncePerTurnIds として返すので、呼び出し側で actions_done に追加して保存すること。
   */
  // ON_LIFE_CRASHED/ON_GUARD/ウィルス系 自イベント収集（Stage2 で pure 化＝triggerCollect.ts。ここは薄いラッパ）。
  const collectSelfEventTriggers = (
    timing: 'ON_LIFE_CRASHED' | 'ON_GUARD' | 'ON_OPP_SIGNI_ATTACK_NEGATED_BY_EFFECT' | 'ON_OPP_VIRUS_PLACED' | 'ON_OPP_VIRUS_REMOVED' | 'ON_OPP_VIRUS_CHANGED',
    myState: PlayerState,
    opState: PlayerState,
    labelSuffix: string,
    ownerId: string = user.id, // myState の持ち主（CPU効果収集時はCPU_PLAYER_ID）
  ): { entries: StackEntry[]; usedOncePerTurnIds: string[] } =>
    pureCollectSelfEventTriggers(mkTrigCtx(), timing, myState, opState, labelSuffix, ownerId);

  const collectLrigAttackGuardedTriggers = (
    attackerId: string,
    attackerState: PlayerState,
    defenderState: PlayerState,
    defenderId?: string,
  ): { entries: StackEntry[]; usedOncePerTurnIds: string[]; usedDefenderIds: string[] } =>
    pureCollectLrigAttackGuardedTriggers(mkTrigCtx(), attackerId, attackerState, defenderState, defenderId);

  /**
   * シグニが効果によって他のシグニゾーンに移動したとき（ON_ZONE_MOVED）のトリガーを収集する。
   * - 移動シグニの所有者(moverState)側: scope self(=移動シグニ自身) / any_ally / any を収集
   * - 対戦相手(otherState)側: scope any_opp / any を収集（相手シグニの移動を観測）
   * triggeringCardNum=移動シグニ（「このシグニ」「それ」参照／targetsTriggerSourceで自動対象化）。
   * usageLimit は actions_done(effectId) の出現回数で制御。usedIds を呼び出し側で各 actions_done に追加して保存する。
   */
  // ON_ZONE_MOVED 収集（Stage2 で pure 化＝triggerCollect.ts。ここは薄いラッパ）。
  const collectZoneMovedTriggers = (
    movedNum: string,
    moverState: PlayerState,
    otherState: PlayerState,
    moverId: string,
    otherId: string,
  ): { entries: StackEntry[]; moverUsedIds: string[]; otherUsedIds: string[] } =>
    pureCollectZoneMovedTriggers(mkTrigCtx(), movedNum, moverState, otherState, moverId, otherId);

  // シグニがドライブ状態になったとき（ルリグがライドした瞬間）の ON_SIGNI_BECOMES_DRIVE を収集（G184/G218）。
  // フラグ drive_became_just はドライブ化したシグニの所有者(=driver)の state に積まれる。collectZoneMovedTriggers と同型：
  // driver 側=self(=そのシグニ自身)/any_ally/any、対戦相手側=any_opp/any。triggeringCardNum=ドライブ化したシグニ。
  // ON_SIGNI_BECOMES_DRIVE 収集（Stage2 で pure 化＝triggerCollect.ts。ここは薄いラッパ）。
  const collectDriveBecameTriggers = (
    becameNum: string,
    driverState: PlayerState,
    otherState: PlayerState,
    driverId: string,
    otherId: string,
  ): { entries: StackEntry[]; driverUsedIds: string[]; otherUsedIds: string[] } =>
    pureCollectDriveBecameTriggers(mkTrigCtx(), becameNum, driverState, otherState, driverId, otherId);

  // カードが【ビート】になったとき（beat_zone へ入った瞬間）の ON_BECOME_BEAT を収集。
  // becameNum は beat_zone に在中（＝場にいない）。self=なったカード自身の効果／any_ally・any=オーナーの場のシグニの効果（「他のカードが【ビート】になったとき」WDK14-014）。
  // ON_BECOME_BEAT 収集（Stage2 で pure 化＝triggerCollect.ts。ここは薄いラッパ）。
  const collectBeatBecameTriggers = (
    becameNum: string,
    ownerState: PlayerState,
    ownerId: string,
  ): { entries: StackEntry[]; usedIds: string[] } =>
    pureCollectBeatBecameTriggers(mkTrigCtx(), becameNum, ownerState, ownerId);

  /**
   * 手札が捨てられたときのトリガーを収集する。discarder=手札を捨てたプレイヤー（=このクライアントの user）。
   * - ON_DISCARDED_AS_COST（asCost=true時のみ）: 捨てられたカード自身のAUTO効果（WX25-P3-085 ユーグレナ）
   * - ON_HAND_DISCARDED: フィールドシグニのAUTO効果。triggerFilterで捨てカードを照合（WXDi-CP02-077 花岡ユズ）。
   *   - triggerScope 未指定/'self'/'any_ally'（「あなたが手札を捨てたとき」）: discarder の自フィールド・自ターンのみ。
   *   - triggerScope 'any'（「いずれかのプレイヤーが手札を捨てたとき」WXK09-038）: discarder の自フィールドは
   *     ターン問わず発火。さらに opState が渡されていれば discarder の相手フィールドの 'any' 効果も
   *     その相手をコントローラーとして収集する（相手が捨てた＝対戦相手から見て「いずれか」が捨てた）。
   *   ガードによる手札捨ては hand_discarded_just / asCost いずれも立たない（performGuardResponse 参照）ため、
   *   「ガードステップ以外で」は構造的に担保される。
   * usageLimitは actions_done(effectId) の出現回数で制御（once_per_turn=1回 / twice_per_turn=2回）。
   * usedLimitIds（discarder側のみ）を呼び出し側で actions_done に追加して保存すること。
   */
  // ON_HAND_DISCARDED/ON_DISCARDED_AS_COST 収集（Stage2 で pure 化＝triggerCollect.ts。ここは薄いラッパ）。
  const collectHandDiscardTriggers = (
    discardedNums: string[],
    myState: PlayerState,
    discarderId: string,
    asCost: boolean,
    opState?: PlayerState,
    opId?: string,
    costSourceNum?: string,
    byOppEffect?: boolean,
    causeOwnerId?: string,
    causeCardNum?: string,
  ): { entries: StackEntry[]; usedLimitIds: string[] } =>
    pureCollectHandDiscardTriggers(mkTrigCtx(), discardedNums, myState, discarderId, asCost, opState, opId, costSourceNum, byOppEffect, causeOwnerId, causeCardNum);

  // シグニ召喚（ゾーン選択後に実行）
  // 🆕§5.7 `S-5c` 第2段＝本体は `controller/performSummonSigni.ts`（I/O 注入）。ここは材料を渡すだけ。
  const performSummonSigni = (
    a0: Parameters<typeof performSummonSigniImpl>[0], a1: Parameters<typeof performSummonSigniImpl>[1],
    a2: Parameters<typeof performSummonSigniImpl>[2], a3: Parameters<typeof performSummonSigniImpl>[3],
    a4: Parameters<typeof performSummonSigniImpl>[4],
  ) => performSummonSigniImpl(a0, a1, a2, a3, {
    ...a4,
    // 🔴**渡し忘れ厳禁**（2026-09-18 のバグ報告＝召喚後もゾーン選択モーダルが開いたままになり、
    //   手札から追加で召喚できてしまった）。移設前はこの2つが `performSummonSigni` の本体にあった。
    closeSummonModals: () => { setPendingSigniSummon(null); setPendingResonaSummon(null); },
    openOnPlayCost: setPendingSigniOnPlayCost,
  }, performCtx());


  const handleSummonSigni = async (
    handIndex: number,
    zoneIndex: number,
    resona?: { candidate: ResonaSummonCandidate; selection: ResonaPaymentSelection },
    riseSelection?: RiseSelection,
  ) => {
    if (loading) return;
    await performSummonSigni(handIndex, zoneIndex, resona, riseSelection, {
      actor: my, opponent: op, actorId: user.id, actorKey: isHost ? 'host_state' : 'guest_state',
      isActorTurn: isMyTurn, lrigLevel: currentLrigLevel, lrigLimit, fieldSigniTotal,
      playColorlessBlocked: isActionBlocked('PLAY_COLORLESS'), costOnPlay: 'modal',
    });
  };

  // グロウ
  const myLrig = my.field.lrig ?? [];
  const currentLrigNum = myLrig[myLrig.length - 1] ?? null;
  const currentLrig = currentLrigNum ? battleCardMap.get(currentLrigNum) ?? null : null;
  const currentLrigLevel = currentLrig ? parseInt(currentLrig.Level) || 0 : 0;

  // グロウ候補＝**判定は `growLogic.listGrowCandidates` 1本**（§8 `O-1` (d)）＝
  // レベル・クラス互換・【グロウ】条件・色制限。CPU の候補フィルタも同じ関数を呼ぶ。
  // ⚠ここにコストの支払い可否は含めない（人間UIは払えない候補もグレーで出す）。
  // 🆕`growRestrictNames`（§5.3 `O-345`）＝効果が「《A》か《B》に」と名前で限定したときだけ重なる追加の絞り。
  const growCandidates: CardData[] = listGrowCandidates({ my, cardMap: battleCardMap, effectsMap, freeGrowFilter, restrictNames: growRestrictNames });

  // ルリグのクラス（制限チェック共通）
  // ⚠「〇〇限定」の使用制限も**実効クラス**で見る（追加で得たルリグタイプを含む・§6.4 O-3）。
  const lrigClass = effectiveLrigClass(my, currentLrig?.CardClass);
  // シグニ召喚・表示と効果条件で共有する実効リミット。
  const lrigLimit = computeEffectiveLrigLimit(my, op, battleCardMap, effectsMap, isMyTurn);
  const fieldSigniTopLevels: number[] = my.field.signi.map(stack => {
    if (!stack || stack.length === 0) return 0;
    const top = battleCardMap.get(stack[stack.length - 1]);
    // 🆕§5.3 `O-226`（2026-09-04）＝「**場にある**宣言したシグニの基本レベルは0になる」＝
    //   リミット計算にも効く（原文が「メインデッキと手札と場」と書いている側）。
    if (declaredSigniOverride(my, top?.CardName).levelZero) return 0;
    return parseInt(top?.Level ?? '0') || 0;
  });
  const fieldSigniTotal = fieldSigniTopLevels.reduce((s, l) => s + l, 0);
  // 🆕§5.3 `O-532`＝リミット超過のルール処理の**表示側**（判定は `planLimitExcess` の1本）。
  const limitExcessPlan = planLimitExcess({ owner: my, opponent: op, cardMap: battleCardMap, effectsMap, isOwnerTurn: isMyTurn });
  const limitExcessAsk = bs.global_phase === 'PLAYING' && !bs.effect_stack && !bs.pending_effect && !bs.pending_spell
    && !my.field.check && !op.field.check
    // ⚠**レベル超過（自動）が残っているあいだは問わない**＝先に funnel が片付けてから測り直す。
    && limitExcessPlan.levelOverZones.length === 0 && limitExcessPlan.excess > 0
    ? limitExcessPlan : null;


  // アシストグロウ候補（各ゾーンごとに、lrig_deck からアシストルリグを検索）
  // 🆕§5.6 `C-5`＝判定は `listAssistGrowCandidates`（`assistGrow.ts`）の1本＝CPU も同じ関数を見る。
  const getAssistGrowCandidates = (side: 'l' | 'r'): CardData[] => {
    if (!bs) return [];
    return listAssistGrowCandidates({ state: my, side, phase: bs.turn_phase, isOwnerTurn: isMyTurn, cardMap: battleCardMap });
  };

  // スペルカットイン候補（lrig_deck + field lrig + signi_field + hand）
  // 🆕§5.6 `C-10`（2026-09-22）＝**候補の列挙は `cutinCandidates.ts` の1本**（149行を逐語で移設し応答者をパラメータ化）。
  //   🔴**旧はこの式が画面の「自分」専用**だったので、**CPU はカットイン窓で常にパスするしかなかった**。
  const cutinCandidates: CutinCandidate[] = collectCutinCandidates({
    my, op, responderId: user.id, pendingSpell: bs.pending_spell,
    hostState: bs.host_state, guestState: bs.guest_state, hostId: bs.host_id,
    turnPhase: bs.turn_phase, isMyTurn, cardMap: battleCardMap, effectsMap,
    effectivePowers, lrigClass,
  });

  // 🆕§5.7 `S-5c` 第2段＝本体は `controller/performGrow.ts`（I/O 注入）。ここは材料を渡すだけ。
  const performGrow = (
    a0: Parameters<typeof performGrowImpl>[0], a1: Parameters<typeof performGrowImpl>[1],
    a2: Parameters<typeof performGrowImpl>[2], a3: Parameters<typeof performGrowImpl>[3],
  ) => performGrowImpl(a0, a1, a2, { ...a3, openOnPlayCost: setPendingSigniOnPlayCost }, performCtx());


  /** 人間UI（`GrowModal` ほか）から呼ぶ薄いラッパー。本体は `performGrow`。 */
  const executeGrow = async (
    card: CardData,
    costIndices: Set<number>,
    options: {
      instanceId?: string;
      baseState?: PlayerState;
      freeCost?: boolean;
      consumeGrowAction?: boolean;
      extraEntries?: StackEntry[];
      opponentState?: PlayerState;
      /**
       * 🆕§5.3 `O-83`＝**このグロウ1回だけ**、グロウ先ルリグの【出】能力を発動させない
       * （`SP38-001-E1`「この方法でグロウしたルリグの【出】能力は発動しない」）。
       * ⚠`PlayerState.suppress_center_on_play`（ターン全体）とは別軸＝state に焼き付けない。
       */
      suppressOnPlayOnce?: boolean;
      /** 🆕**§5.3 `O-248`**＝グロウ先の「捨ててもよい」任意コストで捨てる手札の index。 */
      growPayDiscardHandIdx?: number[];
    } = {},
  ) => {
    if (loading) return;
    closeGrowModal();
    await performGrow(card, costIndices, options, {
      actor: my, opponent: op,
      actorId: user.id, opponentId: isHost ? bs.guest_id : bs.host_id,
      actorKey: isHost ? 'host_state' : 'guest_state',
      isActorTurn: isMyTurn,
      energyPayPool: myEnergyPayPool,
      onCostOnPlay: 'prompt',
      // 🆕§5.3 `O-83`＝`'plus1_paid'`（効果によるグロウ）は**通常のグロウコストを払う**。
      defaultFreeCost: freeGrowFilter !== null && freeGrowFilter !== 'plus1_paid',
    });
  };

  const toggleRemoveZone = (zi: number) => {
    setSelectedRemoveZones(prev => {
      const next = new Set(prev);
      if (next.has(zi)) next.delete(zi); else next.add(zi);
      return next;
    });
  };

  const handleRemove = async () => {
    if (!isMyTurn || loading || selectedRemoveZones.size === 0) return;
    // SELF_SIGNI_TRASH 封じ（WX04-046-E1等）: リムーブ不可（保険のガード）
    if (isActionBlocked('SELF_SIGNI_TRASH')) { setShowRemoveModal(false); setShowRemoveBlockedWarn(true); return; }
    setLoading(true);
    setShowRemoveModal(false);
    try {
      const newSigni = [...my.field.signi] as (string[] | null)[];
      let newTrash = [...my.trash];
      let newLrigTrash = [...my.lrig_trash];
      // 🔴**§5.6 `C-9` `R-41`（2026-09-17）＝リムーブだけがゾーンの後始末を1つもしていなかった。**
      //   【チャーム】【アクセ】【ソウル】が浮いたまま残り（カードが消える）、`signi_down` / `signi_frozen` が
      //   立ったままになって**次にそのゾーンへ置いたシグニがいきなりダウン／凍結**していた。
      let removeField = my.field;
      const removedSigniNums: string[] = [];
      for (const zi of selectedRemoveZones) {
        const stack = my.field.signi[zi] ?? [];
        const top = stack.at(-1);
        if (top) removedSigniNums.push(top);
        newTrash = [...newTrash, ...stack];
        newSigni[zi] = null;
        const cleaned = clearZoneOnSigniLeave(removeField, zi);
        removeField = cleaned.field;
        newTrash = [...newTrash, ...cleaned.trash];
        newLrigTrash = [...newLrigTrash, ...cleaned.lrigTrash];
      }
      const newMyState: PlayerState = clearEndOfAttackEffects({
        ...my,
        field: { ...removeField, signi: newSigni },
        trash: newTrash,
        lrig_trash: newLrigTrash,
        actions_done: [...(my.actions_done ?? []), 'REMOVE'],
      });
      const stateKey = isHost ? 'host_state' : 'guest_state';
      // ON_TRASH トリガー（フィールドから直接トラッシュ）
      // リムーブはルール処理でコスト/効果起因ではない（fromFieldByCostOrEffect/byEffect は発火しない。G204）
      const removeTrashEntries: StackEntry[] = [];
      // ⚠ 引数は host/guest 順（my/op 順ではない）。ゲスト側で my/op を渡すと watcher の場走査が
      //    相手側にすり替わる（any_ally パスが死んでいた続き181 以前は無害だったが (xxxii) で顕在化）。
      let myAfterTrash = newMyState;
      let opAfterTrash = op;
      for (const cn of removedSigniNums) {
        const tt = collectTrashTriggers(cn, user.id, isHost ? myAfterTrash : opAfterTrash, isHost ? opAfterTrash : myAfterTrash, false, false, false);
        removeTrashEntries.push(...tt.entries);
        // self/any_ally は自分側、any_opp は相手側の watcher。両側の usageLimit をそれぞれ永続化する。
        const usedMine = isHost ? tt.usedHostIds : tt.usedGuestIds;
        const usedOpp = isHost ? tt.usedGuestIds : tt.usedHostIds;
        if (usedMine.length > 0) myAfterTrash = { ...myAfterTrash, actions_done: [...(myAfterTrash.actions_done ?? []), ...usedMine] };
        if (usedOpp.length > 0) opAfterTrash = { ...opAfterTrash, actions_done: [...(opAfterTrash.actions_done ?? []), ...usedOpp] };
      }
      const oppUsage = opAfterTrash !== op
        ? { key: isHost ? ('guest_state' as const) : ('host_state' as const), state: opAfterTrash }
        : undefined;
      if (removeTrashEntries.length > 0) {
        const existing = bs?.effect_stack ?? null;
        const stack = existing ? pushToStack(existing, removeTrashEntries) : initStack(user.id, removeTrashEntries);
        await persist.commit(reduceBattle(bs, { type: 'WRITE_STATE', myKey: stateKey, myState: myAfterTrash, opp: oppUsage, effectStack: stack }));
      } else {
        await persist.commit(reduceBattle(bs, { type: 'WRITE_STATE', myKey: stateKey, myState: myAfterTrash, opp: oppUsage }));
      }
    } finally {
      setLoading(false);
      setSelectedRemoveZones(new Set());
    }
  };

  // 🆕§5.7 `S-5c` 第2段＝本体は `controller/performArts.ts`（I/O 注入）。ここは材料を渡すだけ。
  const performArts = (
    a0: Parameters<typeof performArtsImpl>[0], a1: Parameters<typeof performArtsImpl>[1],
    a2: Parameters<typeof performArtsImpl>[2],
  ) => performArtsImpl(a0, a1, { ...a2, closeZoneModal: () => setCloseZoneSignal(s => s + 1) }, performCtx());


  /** 人間UI（`ArtsModal` / ルリグデッキのカード詳細）から呼ぶ薄いラッパー。本体は `performArts`。 */
  const executeArts = async (card: CardData, costIndices: Set<number>, betCoins: number = 0, encore: boolean = false, discardIndices: Set<number> = new Set(), useKeySub = false, boosting = false, useCostPayKeys: Set<string> = new Set(), declaredChooseCount?: number) => {
    if (loading) return;
    closeArtsModal();
    setKeySubstituteEnabled(false);
    await performArts(card, { costIndices, betCoins, encore, discardIndices, useKeySub, boosting, useCostPayKeys, declaredChooseCount }, {
      actor: my, opponent: op,
      actorId: user.id, actorKey: isHost ? 'host_state' : 'guest_state',
      isActorTurn: isMyTurn,
      energyPayPool: myEnergyPayPool,
      energyTrashSubInfo: myEnergyTrashSubInfo,
      blockedSelf: contBlocked.forSelf,
      enaAllMulti: myEnaAllMulti,
      enaMultiStripped: myEnaMultiStripped,
      effectivePowers,
    });
  };

  // 🆕§5.7 `S-5c` 第2段＝本体は `controller/performKeyPiece.ts`（I/O 注入）。ここは材料を渡すだけ。
  const performKeyPiece = (
    a0: Parameters<typeof performKeyPieceImpl>[0], a1: Parameters<typeof performKeyPieceImpl>[1],
    a2: Parameters<typeof performKeyPieceImpl>[2],
  ) => performKeyPieceImpl(a0, a1,
    { ...a2, closeZoneModal: () => setCloseZoneSignal(s => s + 1), closeKeyModal, growForMayu: executeGrow }, performCtx());


  /** 人間UI（`KeyUseModal`）から呼ぶ薄いラッパー。本体は `performKeyPiece`。 */
  const executeKeyPiece = async (card: CardData, costIndices: Set<number>) => {
    if (loading || !myArtsPayerCtx) return;
    if (card.CardNum !== MAYU_ENCOUNTER_A) closeKeyModal();
    await performKeyPiece(card, costIndices, {
      actor: my, opponent: op,
      actorId: user.id, actorKey: isHost ? 'host_state' : 'guest_state',
      isActorTurn: isMyTurn,
      energyPayPool: myEnergyPayPool,
      coinNeeded: keyPieceCostOf({ card, my, op, cardMap: battleCardMap, effectsMap, payer: myArtsPayerCtx }).coinNeeded,
      effectivePowers,
    });
  };

  /**
   * §6.4 O-10（続き515）＝`CHECK_ZONE_FLIP_FREE_GROW` の予約（`pending_flip_grow_card`）を消費して
   * **正規のグロウ経路**（`executeGrow`）でグロウする。
   *
   * 🔑engine 側で `field.lrig` へ直接 push すると、グロウ時トリガー（【出】）・リミット再計算・
   * コイン獲得が**丸ごと落ちる**（`GROW_FREE` が「BattleScreen 処理」なのと同じ理由）。
   * ⚠**多重発火ガード**＝予約は commit が返るまで state に残るので、同じ対象で2回走らないよう ref で締める。
   * ⚠`freeCost:true`／`consumeGrowAction:false`＝「グロウコストを支払わずに」かつ通常グロウ枠を消費しない。
   */
  // ⚠**実体は上の「Rules of Hooks 対策」ブロック**（`if (!bs) return` より前）へ移した（2026-08-18 続き554）。

  // ── キーピース起動効果 ──
  const executeKeyActivated = async (cardNum: string, effect: import('../types/effects').CardEffect, costIndices: Set<number>, discardIndices: Set<number> = new Set(), artsNums: string[] = []) => {
    if (loading) return;
    setLoading(true);
    closeKeyActivated();
    try {
      const keyActPay = planEnergyPayment(my, myEnergyPayPool, costIndices);
      const paidNums = keyActPay.paidNums;
      const discardNums = [...discardIndices].map(i => my.hand[i]);
      // 🆕**キー【起】の全捨てコスト**（§5.3 `O-46`）。⚠ここが無いと `WXK04-025-CB-E2`
      //   「このキーを場からルリグトラッシュに置き、エナゾーンにあるすべてのカードをトラッシュに置く：」の
      //   **エナ全損を提示だけして踏み倒せる**（キー経路はエナ／手札捨て／`trash_key` しか払っていなかった＝
      //   `O-67` で見つけた「ルリグ【起】に場シグニ系コストの支払いが1行も無い」と同型）。
      // ⚠`energyTrashAll` は**エナ支払い（`costIndices`）の控除後**を対象にする＝`keyActPay.energyAfter`
      //   （シグニ【起】の `performSigniActivated` と同じ funnel の読み方）。
      const keyEnergyTrashAllCards = effect.cost?.energyTrashAll ? [...keyActPay.energyAfter] : [];
      const keyDiscardAllCards = effect.cost?.discardAll ? my.hand.filter((_, i) => !discardIndices.has(i)) : [];
      const newHand = effect.cost?.discardAll ? [] : my.hand.filter((_, i) => !discardIndices.has(i));
      // trash_key: このキーをルリグトラッシュに置く（コスト）
      let newField = my.field;
      let newLrigTrashKey = my.lrig_trash;
      if (effect.cost?.trash_key) {
        // §5.6 `C-9` `R-46`＝枠の見分けは `keyZone.ts` の1本（ここが唯一正しかった実装＝これを出した）。
        const keyCostRemoval = removeKeyToLrigTrash(my.field, my.lrig_trash, cardNum);
        if (keyCostRemoval.removed) {
          newField = keyCostRemoval.field;
          newLrigTrashKey = keyCostRemoval.lrigTrash;
        }
      }
      // 🆕**キー【起】の「ルリグデッキからアーツN枚をルリグトラッシュに置く」**（§5.3 `O-68`②・`WXK10-006-E3`）。
      //   🔴ここが無いあいだ、キー経路の支払いは**エナ／手札捨て／`trash_key`／全捨て**しか無く、
      //   アーツ1枚というコストを**提示だけして踏み倒せた**（`O-46` の `energyTrashAll` と同型の穴）。
      //   ⚠クラフトのアーツは `Type:'アーツ/クラフト'` なので `matchesTrashArtsFromLrigDeckCost` が
      //   既に弾いている（原文「クラフトではないアーツ」＝追加の除外実装は不要）。
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
      });
      // energyTrashAll: エナゾーンを空にする（funnel の index 控除のあとに当てる＝`performSigniActivated` と同じ順）
      if (effect.cost?.energyTrashAll) paid = { ...paid, energy: [] };
      const cardName = battleCardMap.get(cardNum)?.CardName ?? cardNum;
      const entry: StackEntry = {
        id: generateUUID(),
        playerId: user.id,
        cardNum,
        effectId: effect.effectId,
        label: `${cardName} の【起】効果`,
        effect,
      };
      const turnPlayerId = bs.active_user_id ?? user.id;
      const existingStack = bs?.effect_stack ?? null;
      const newStack = existingStack ? pushToStack(existingStack, [entry]) : initStack(turnPlayerId, [entry]);
      const stateKey = isHost ? 'host_state' : 'guest_state';
      await persist.commit(reduceBattle(bs, { type: 'WRITE_STATE', myKey: stateKey, myState: paid, effectStack: newStack, clearPending: true }));
    } finally {
      setLoading(false);
    }
  };

  // ── アシストルリグ グロウ ──
  // 🆕§5.7 `S-5c` 第2段＝本体は `controller/performAssistGrow.ts`（I/O 注入）。ここは材料を渡すだけ。
  const performAssistGrow = (card: CardData, side: 'l' | 'r', costIndices: Set<number>, p: Parameters<typeof performAssistGrowImpl>[3]) =>
    performAssistGrowImpl(card, side, costIndices, p, { bs, trigCtx: mkTrigCtx, io: screenIo });


  const executeAssistGrow = async (card: CardData, side: 'l' | 'r', costIndices: Set<number>) => {
    // 🔴§5.6 `C-5`＝旧実装はここで `!isMyTurn` を弾いていた＝候補は「相手のアタックフェイズ」（`ATTACK_ARTS_OP`）でも出るのに、
    //   **押しても何も起きなかった**。フェイズの可否は候補（`listAssistGrowCandidates`）が決める。
    if (loading) return;
    closeAssistGrow();
    await performAssistGrow(card, side, costIndices, {
      owner: my, other: op, ownerId: user.id, ownerKey: isHost ? 'host_state' : 'guest_state', energyPayPool: myEnergyPayPool,
    });
  };

  // ── アシストルリグ 起動効果 ──
  const executeAssistActivated = async (cardNum: string, effect: import('../types/effects').CardEffect, costIndices: Set<number>, discardIndices: Set<number> = new Set()) => {
    if (loading) return;
    setLoading(true);
    closeAssistActivated();
    try {
      const assistActPay = planEnergyPayment(my, myEnergyPayPool, costIndices);
      const paidNums = assistActPay.paidNums;
      const discardNums = [...discardIndices].map(i => my.hand[i]);
      const newHand = my.hand.filter((_, i) => !discardIndices.has(i));
      let paid: PlayerState = assistActPay.applyTo({
        ...my,
        hand: newHand,
        trash: [...my.trash, ...paidNums, ...discardNums],
        ...handDiscardHistoryRecord(my, discardNums),
        actions_done: (effect.usageLimit === 'once_per_turn' || effect.usageLimit === 'twice_per_turn')
          ? [...(my.actions_done ?? []), effect.effectId] : (my.actions_done ?? []),
      });
      // removeOppVirus: 相手の場のウィルスN個を取り除く
      const removeVirusNAssist = effect.cost?.removeOppVirus ?? 0;
      let newOpVirusStateAssist: typeof op | null = null;
      if (removeVirusNAssist > 0) {
        const newOppVirus = [...(op.field.signi_virus ?? [0, 0, 0])];
        let removedV = 0;
        for (let zi = 0; zi < newOppVirus.length && removedV < removeVirusNAssist; zi++) {
          while (newOppVirus[zi] > 0 && removedV < removeVirusNAssist) { newOppVirus[zi]--; removedV++; }
        }
        if (removedV < removeVirusNAssist) return;
        newOpVirusStateAssist = { ...op, field: { ...op.field, signi_virus: newOppVirus } };
        paid = { ...paid, opp_virus_removed_just: true };
      }
      const cardName = battleCardMap.get(cardNum)?.CardName ?? cardNum;
      const entry: StackEntry = {
        id: generateUUID(),
        playerId: user.id,
        cardNum,
        effectId: effect.effectId,
        label: `${cardName} の【起】効果`,
        effect,
      };
      const turnPlayerId = bs.active_user_id ?? user.id;
      const existingStack = bs?.effect_stack ?? null;
      const newStack = existingStack ? pushToStack(existingStack, [entry]) : initStack(turnPlayerId, [entry]);
      const stateKey = isHost ? 'host_state' : 'guest_state';
      const oppStateKeyAssist = isHost ? 'guest_state' : 'host_state';
      await persist.commit(reduceBattle(bs, {
        type: 'WRITE_STATE', myKey: stateKey, myState: paid, effectStack: newStack, clearPending: true,
        opp: newOpVirusStateAssist ? { key: oppStateKeyAssist, state: newOpVirusStateAssist } : undefined,
      }));
    } finally {
      setLoading(false);
    }
  };

  // スペル使用の実行（人間・CPU 共通）。
  // 🆕§5.7 `S-5c` 第2段＝本体は `controller/performSpell.ts`（I/O 注入）。ここは材料を渡すだけ。
  const performSpell = (
    card: Parameters<typeof performSpellImpl>[0],
    sel: Parameters<typeof performSpellImpl>[1],
    p: Parameters<typeof performSpellImpl>[2],
  ) => performSpellImpl(card, sel, p, performCtx());


  /** 人間UI（`SpellCastModal`）から呼ぶ薄いラッパー。本体は `performSpell`。 */
  const castSpell = async (card: CardData, costIndices: Set<number>, handIdx: number, fromLrigDeck?: boolean, betCoins: number = 0, virusRemovalByZone?: number[], discardIndices: Set<number> = new Set(), useCostPayKeys: Set<string> = new Set()) => {
    if (loading) return;
    closeSpellCast();
    setBetAmount(0);
    await performSpell(card, { costIndices, handIdx, fromLrigDeck, betCoins, virusRemovalByZone, discardIndices, useCostPayKeys }, {
      actor: my, opponent: op,
      actorId: user.id, actorKey: isHost ? 'host_state' : 'guest_state',
      isActorTurn: isMyTurn,
      energyPayPool: myEnergyPayPool,
      blockedSelf: contBlocked.forSelf,
      enaAllMulti: myEnaAllMulti,
      enaMultiStripped: myEnaMultiStripped,
    });
  };

  // スペルカットインをパス → スペル解決（スペル効果を発火）
  // 🆕§5.6 `C-12`（2026-09-22）＝**本体は `controller/resolvePendingPiece.ts`**（41行を逐語で移設）。
  //   🔴**なぜ出したか**＝この窓は**応答側のクライアント**が閉じるので、画面の中に閉じていると
  //   **CPU が応答したときに閉じる者がいない**（ヘッドレスでも no-op だった）。
  const resolvePendingPiece = async () => resolvePendingPieceImpl(performCtx());

  // 🆕§5.7 `S-5c` 第3段（2026-09-18）＝本体（194行）は `controller/cutinPass.ts` へ逐語で移設。画面は材料と UI を渡すだけ。
  const handleCutinPass = async () =>
    handleCutinPassImpl(performCtx(), { closeCutin, openFreeGrow, resolvePendingPiece, loading });
  handleCutinPassRef.current = handleCutinPass;

  // カットイン使用 → カットイン効果発火・スペルをトラッシュ（打ち消し）
  // 🆕§5.6 `C-10` 第2段（2026-09-22）＝**本体は `controller/performCutinUse.ts`**（242行を逐語で移設し
  //   応答者をパラメータ化）。🔴**旧はこの式が画面の「自分」で閉じており、CPU はカットイン窓で常にパスするしかなかった。**
  //   ここは材料（応答者・エナ支払い元・画面だけが持つ口）を渡すだけ。
  const handleCutinUse = async (candidate: CutinCandidate, costIndices: Set<number>, underTrashKeys: Set<string> = new Set(), betCoins = 0) =>
    performCutinUse(candidate, costIndices, underTrashKeys, betCoins, selectedCutinExceed, {
      actor: my, opponent: op, actorId: user.id, actorIsHost: isHost, isActorTurn: isMyTurn,
      energyPayPool: myEnergyPayPool, enaAllMulti: myEnaAllMulti, enaMultiStripped: myEnaMultiStripped,
    }, performCtx(), {
      closeCutin, loading,
      queueCardEffects: async (cardNum, types, timings, myState, opState) => {
        await queueCardEffects(cardNum, types as never, timings as never, myState, opState);
      },
      fetchLatest: async () => {
        const { data, error } = await persist.fetchState();
        return { data: data ?? null, error: error ? { message: error.message } : null };
      },
    });

  // フェイズ別・手札カードアクションを返す
  const getMyHandCardActions = (cardNum: string, handIndex: number): CardAction[] => {
    if (loading) return [];
    // 非自分ターンでも ATTACK_ARTS_OP は手札起動効果を許可
    if (!isMyTurn && bs.turn_phase !== 'ATTACK_ARTS_OP') return [];
    const actionList: CardAction[] = [];

    if (bs.turn_phase === 'ENERGY') {
      const used    = my.actions_done?.includes('ENERGY') ?? false;
      const blocked = my.blocked_actions?.includes('ENERGY') ?? false;
      if (!used && !blocked) {
        actionList.push({
          label: 'エナチャージ',
          color: C.accent,
          onClick: () => handleEnergyChargeFromHand(handIndex),
        });
      }
    }

    if (bs.turn_phase === 'MAIN') {
      const cardData = battleCardMap.get(cardNum);
      if (cardData?.Type === 'シグニ') {
        // 🆕§5.3 `O-226`（2026-09-04）＝「宣言したシグニの基本レベルは0になり、限定条件を無視して場に出せる」
        //   （`WXK09-001-E3`）。⚠**名前が一致したときだけ**効く（フラグだけ見ると全シグニが対象＝過剰実行）。
        const declaredOverride = declaredSigniOverride(my, cardData.CardName);
        const signiLevel = declaredOverride.levelZero ? 0 : (parseInt(cardData.Level) || 0);
        // レベル制限: シグニLv ≤ ルリグLv
        const levelOk = signiLevel <= currentLrigLevel;
        // リミット制限: 空きゾーンに召喚後の合計レベルがリミット以内であること
        // ＋ LIMIT_ALL_FIELD_N: 場のシグニ体数が上限未満であること（WX04-005-E3「1体しか場に出せない」）
        const myCurrentSigniCount = my.field.signi.filter(stk => (stk ?? []).length > 0).length;
        // 🆕🔴**§5.3 `O-147`（2026-09-05）＝【ライズ】はこのゲートを通れないことがあった。**
        //   旧実装は**空きゾーンがあること**と `fieldSigniTotal + Lv <= リミット` しか見ておらず、
        //   ライズ（＝場のシグニ1体の上に置く＝下敷きのレベルと入れ替わる）では
        //   **「盤面が埋まっている」「合計レベルが足りない」だけで「召喚」ボタンが消えていた**＝
        //   合法なライズが打てない（過少実行）。⇒ 配置先の種類ごとに判定を分ける。
        //   ⚠**モーダル（`SigniSummonZoneModal`）と同じ規則を使う**（片方だけ直すと
        //     「押せるのに置けない／置けるのに押せない」になる）。
        const handRiseReq = getRiseRequirement(cardData.EffectText ?? '');
        // 🆕§5.6 `C-6`＝【ライズ】の置き方の可否は `planRiseSummon`（`riseSummon.ts`）の1本＝CPU も同じ関数で置き方を決める。
        const canFitSomewhere = handRiseReq
          ? planRiseSummon({
            my, req: handRiseReq, signiLevel, fieldSigniTotal, lrigLimit, fieldSigniCountLimit, cardMap: battleCardMap,
          }) !== null
          : myCurrentSigniCount < fieldSigniCountLimit && [0, 1, 2].some(zi => {
            const isEmpty = (my.field.signi[zi] ?? []).length === 0;
            return isEmpty && (fieldSigniTotal + signiLevel) <= lrigLimit;
          });
        // Restriction チェック
        const restrictionOk = meetsRestriction(cardData.Restriction, lrigClass,
          hasIgnoreLrigRestriction(my, effectsMap, 'signi', cardData) || declaredOverride.ignoreRestriction);
        const printedPower = cardData.Power === '∞' ? Infinity : parseInt(cardData.Power ?? '', 10);
        const powerBlockOk = !isHandSigniPlayBlockedByPower(my, printedPower);
        if (levelOk && canFitSomewhere && restrictionOk && powerBlockOk) {
          actionList.push({
            label: '召喚',
            color: C.success,
            onClick: () => setPendingSigniSummon({ cardNum, handIndex }),
          });
        }
      }
      // ⚠スペル使用の封じは**3軸**（`USE_SPELL` ／ `PLAY_COLORLESS` ／ `BLOCK_NON_WHITE_SPELL`）＝
      //   `spellUseGate.isSpellUseBlockedFor` の1関数に集約（§6.4 O-18 続き513）。
      //   🔴続き460 では `USE_SPELL` だけを塞いだので、残り2軸は**押しても無反応**のまま残っていた。
      // ⚠**判定は `spellUseGate.checkSpellUse` 1本**（§8 `O-1` (b)）＝封じ3軸・限定・カード名封じ・
      //   ディソナ制限・低コスト封じ・使用条件をそこで見る。CPU の候補フィルタも同じ関数を呼ぶ。
      // ⚠**ここでは `affordable` を見ない**（従来どおり）＝スペルのコストは支払いUI の任意支払い
      //   （手札を捨てての置換・使用時の任意支払い）で下がるので、基本コストで切ると**払える札を隠す**。
      if (cardData?.Type === 'スペル' && myArtsPayerCtx && checkSpellUse({
        card: cardData, my, op, isMyTurn, turnPhase: bs.turn_phase,
        pendingSpell: !!bs.pending_spell, cards: battleCards, cardMap: battleCardMap, effectsMap,
        payer: myArtsPayerCtx, effectivePowers,
      }).usable) {
        actionList.push({
          label: '発動',
          color: C.accent,
          onClick: () => { openSpellCast({ cardNum, handIndex }); setBetAmount(0); },
        });
      }
    }

    // v0.277: 手札から発動できる【起】（MAIN / ATTACK_ARTS / ATTACK_ARTS_OP フェイズ）
    {
      // 🆕§5.7 `S-7`＝提示の判定は CPU と同じ `listOffFieldActivatableEffects` 1本（窓・回数・条件・払えるコストの形）。
      for (const eff of listOffFieldActivatableEffects({
        zone: 'hand', cardNum, my, op, turnPhase: bs.turn_phase, isMyTurn,
        cardMap: battleCardMap, effectsMap, effectivePowers,
      })) {
        actionList.push({
          label: `【起】${handActivateCostLabel(eff)}`,
          color: '#ff6b35',
          onClick: () => { openHandActivated({ cardNum, handIndex, effect: eff }); },
        });
      }
    }

    return actionList;
  };

  // トラッシュ自己起動【起】（「このシグニをトラッシュから場に出す」等）。トラッシュゾーンUIから発動。
  // エナ以外のコスト（手札捨て/コイン/【ウィルス】除去/【チャーム】/ルリグダウン/エクシード）と
  // 《アタックフェイズアイコン》起動に対応（PLAN §6.4）。支払い可否は `canOfferTrashActivate` 一本。
  /**
   * 🆕**§5.3 `O-185`（2026-09-04）＝「このターン、あなたはそれらを使用してもよい」で許可されたスペルを使う。**
   * 🔴**許可は「カードを動かさない」**（トラッシュに置いたまま）ので、**使用の入口はトラッシュのカードアクション**。
   * ⚠**印刷コストはここで請求しない**＝`USE_SPELL_FROM_TRASH_PAYING_COST`（`value:'picked'`）が
   *   色を展開して「支払う／使用しない」の CHOOSE を出す（自分のトラッシュ側と同じ関数を通す）。
   * ⚠**許可は1回使ったら消す**＝原文は「使用してもよい」で、使ったカードはトラッシュから出ていく。
   */
  const useGrantedTrashSpell = async (cardNum: string, from: 'self' | 'opponent') => {
    if (loading) return;
    setLoading(true);
    try {
      const entry = {
        id: generateUUID(), playerId: user.id, cardNum, effectId: `O185-USE-${cardNum}`,
        label: `${battleCardMap.get(getCardNum(cardNum))?.CardName ?? cardNum} を使用（コストを支払う）`,
        effect: {
          effectId: `O185-USE-${cardNum}`, effectType: 'ACTIVATED' as const, duration: 'INSTANT' as const,
          mandatory: true, parseStatus: 'MANUAL' as const,
          action: { type: 'STUB', id: 'USE_SPELL_FROM_TRASH_PAYING_COST', value: 'picked',
            carriedCardNum: cardNum, ...(from === 'opponent' ? { value2: 'opp_trash' } : {}) },
        } as unknown as import('../types/effects').CardEffect,
      };
      const stateKey = isHost ? 'host_state' : 'guest_state';
      const nextMy: PlayerState = {
        ...my,
        trash_spells_usable_this_turn: (my.trash_spells_usable_this_turn ?? [])
          .filter(e => !(e.cardNum === cardNum && e.from === from)),
      };
      const existing = bs.effect_stack ?? null;
      const stack = existing ? pushToStack(existing, [entry]) : initStack(bs.active_user_id ?? user.id, [entry]);
      await persist.commit(reduceBattle(bs, { type: 'WRITE_STATE', myKey: stateKey, myState: nextMy, effectStack: stack }));
    } finally {
      setLoading(false);
    }
  };

  /** 🆕`O-185`＝**相手のトラッシュ**のカードアクション（許可されたスペルの「使用」だけを出す）。 */
  const getOpTrashCardActions = (cardNum: string): CardAction[] => {
    if (loading || !isMyTurn) return [];
    const phase = bs.turn_phase;
    if (phase !== 'MAIN' && phase !== 'ATTACK_ARTS') return [];
    const granted = (my.trash_spells_usable_this_turn ?? [])
      .some(e => e.cardNum === cardNum && e.from === 'opponent');
    if (!granted) return [];
    return [{
      label: '【使用】このターン使用できる（コストを支払う）',
      color: '#ff6b35',
      onClick: () => { void useGrantedTrashSpell(cardNum, 'opponent'); },
    }];
  };

  const getMyTrashCardActions = (cardNum: string): CardAction[] => {
    if (loading) return [];
    const actions: CardAction[] = [];
    // 《メインフェイズアイコン》＝自分の MAIN／《アタックフェイズアイコン》＝アーツステップ。
    // ATTACK_ARTS_OP（相手ターンのアーツステップ）は自分のトラッシュ起動の窓ではない。
    const phase = bs.turn_phase;
    const trashTiming: import('../types/effects').EffectTiming | null =
      phase === 'MAIN' ? 'MAIN' : phase === 'ATTACK_ARTS' ? 'ATTACK_ARTS' : null;
    if (!isMyTurn || !trashTiming) return actions;
    // §6.4 O-17:「対戦相手の（すべての領域／手札と場とエナゾーンとトラッシュに）あるシグニは能力を失う」は
    // トラッシュのカードにも `abilities_removed` を積む。⚠ここで見ないと**トラッシュ起動だけが素通り**して、
    // 領域を跨いだ能力喪失が「候補を広げただけの見せかけ」になる。
    if (my.abilities_removed?.includes(cardNum)) return actions;
    // §6.4 O-10（続き514）＝「対戦相手のトラッシュ…にあるカードは能力を失い」（`WX12-023`）＝
    // 相手の場に宣言があれば**自分のトラッシュ起動は丸ごと使えない**。
    if (isTrashImmuneByOpponent(op, battleCardMap, effectsMap)) return actions;
    // 🆕**§5.3 `O-185`＝「このターン使用してもよい」で許可されたスペル**（【起】ではない別入口）。
    if ((my.trash_spells_usable_this_turn ?? []).some(e => e.cardNum === cardNum && e.from === 'self')) {
      actions.push({
        label: '【使用】このターン使用できる（コストを支払う）',
        color: '#ff6b35',
        onClick: () => { void useGrantedTrashSpell(cardNum, 'self'); },
      });
    }
    // 🆕§5.7 `S-7`＝提示の判定は CPU と同じ `listOffFieldActivatableEffects` 1本。
    for (const eff of listOffFieldActivatableEffects({
      zone: 'trash', cardNum, my, op, turnPhase: phase, isMyTurn,
      cardMap: battleCardMap, effectsMap, effectivePowers, energyPool: myEnergyPayPool,
    })) {
      const costLabel = trashActivateCostLabels(eff, my, op).join('・');
      // 🆕**ラベルは本体アクションから決める**（§5.3 `O-114`）＝「トラッシュから出す」固定だと
      //   自己回収（`TRANSFER_TO_HAND`）の【起】が「場に出す」と嘘をつく。
      const verb = trashActivateVerbLabel(eff);
      actions.push({
        label: costLabel ? `【起】${verb}（${costLabel}）` : `【起】${verb}`,
        color: '#ff6b35',
        onClick: () => { openTrashActivated({ cardNum, effect: eff }); },
      });
    }
    return actions;
  };

  /**
   * 🆕**エナゾーン自己起動【起】**（§5.3 `O-114`・`WXDi-P06-077-E2`
   * 「【起】《緑×0》：あなたのエナゾーンからこのカードを手札に加える。」）。
   * ⚠**トラッシュ側と同じ関数を通す**（`canOfferTrashActivate` / `trashActivateCostLabels` /
   *   `executeTrashActivated`）＝入口だけが違う。写経すると片方だけ穴が空く。
   * ⚠**カード自身をエナから抜くのは resolver の役目**（`TRANSFER_TO_HAND{ENERGY_CARD, thisCardOnly}`）＝
   *   ここでは他のコストしか払わない（トラッシュ側の規約と同じ）。
   */
  const getMyEnergyCardActions = (cardNum: string): CardAction[] => {
    if (loading) return [];
    const actions: CardAction[] = [];
    const phase = bs.turn_phase;
    const energyTiming: import('../types/effects').EffectTiming | null =
      phase === 'MAIN' ? 'MAIN' : phase === 'ATTACK_ARTS' ? 'ATTACK_ARTS' : null;
    if (!isMyTurn || !energyTiming) return actions;
    if (my.abilities_removed?.includes(cardNum)) return actions;
    // 🆕§5.7 `S-7`＝提示の判定は CPU と同じ `listOffFieldActivatableEffects` 1本。
    for (const eff of listOffFieldActivatableEffects({
      zone: 'energy', cardNum, my, op, turnPhase: phase, isMyTurn,
      cardMap: battleCardMap, effectsMap, effectivePowers, energyPool: myEnergyPayPool,
    })) {
      const costLabel = trashActivateCostLabels(eff, my, op).join('・');
      actions.push({
        label: costLabel ? `【起】エナゾーンから手札に加える（${costLabel}）` : '【起】エナゾーンから手札に加える',
        color: '#4caf50',
        onClick: () => { openTrashActivated({ cardNum, effect: eff }); },
      });
    }
    return actions;
  };

  // ルリグデッキのカードアクション（アーツ / キーピース / アシストルリグ）
  const getMyLrigDeckCardActions = (cardNum: string): CardAction[] => {
    if (loading) return [];
    const cardData = battleCardMap.get(cardNum);
    if (!cardData) return [];
    const ignoreCardRestriction = cardData.Type === 'アーツ'
      && hasIgnoreLrigRestriction(my, effectsMap, 'arts', cardData);
    if (!meetsRestriction(cardData.Restriction, lrigClass, ignoreCardRestriction)) return [];

    const phase = bs.turn_phase;
    const actions: CardAction[] = [];

    // ── レゾナ【出現条件】── MAIN と ATTACK_ARTS の共通支払いフロー。
    if (cardData.Type === 'レゾナ') {
      const appearanceTiming = phase === 'MAIN' ? 'MAIN'
        : (phase === 'ATTACK_ARTS' || phase === 'ATTACK_ARTS_OP') ? 'ATTACK' : null;
      const canUseWindow = (phase === 'MAIN' && isMyTurn) ||
        (phase === 'ATTACK_ARTS' && isMyTurn) ||
        (phase === 'ATTACK_ARTS_OP' && !isMyTurn);
      if (!canUseWindow || !appearanceTiming || bs.pending_spell) return actions;
      const candidate = getResonaSummonCandidate(cardNum, my, battleCardMap, effectsMap, appearanceTiming);
      const resonaLevel = parseInt(cardData.Level ?? '0', 10) || 0;
      const fieldItems = candidate
        ? (candidate.payment.combined
          ? resonaCombinedOptions(my, candidate.payment, battleCardMap).filter(i => i.zone === 'field')
          : candidate.payment.groups.flatMap(g => g.zone === 'field'
            ? resonaPaymentOptions(my, g, battleCardMap).map(index => ({ zone: 'field' as const, index }))
            : []))
        : [];
      const fieldPayCount = candidate?.payment.combined?.count
        ?? candidate?.payment.groups.filter(g => g.zone === 'field').reduce((n, g) => n + g.count, 0)
        ?? 0;
      const maxPaidFieldLevels = fieldItems
          .map(i => parseInt((battleCardMap.get(my.field.signi[i.index]?.at(-1) ?? '') ?? battleCardMap.get(getCardNum(my.field.signi[i.index]?.at(-1) ?? '')))?.Level ?? '0', 10) || 0)
          .sort((a, b) => b - a)
          .slice(0, fieldPayCount)
          .reduce((sum, lv) => sum + lv, 0)
        ;
      const canFitLimit = fieldSigniTotal - maxPaidFieldLevels + resonaLevel <= lrigLimit;
      if (candidate && resonaLevel <= currentLrigLevel && canFitLimit) {
        actions.push({
          label: '【出現条件】で召喚',
          color: C.accent,
          onClick: () => {
            setSelectedResonaPayment([]);
            setPendingResonaSummon(candidate);
          },
        });
      }
      return actions;
    }

    // ── スペル/クラフト（フェゾーネマジック）── メインフェイズに手札スペルと同様に使用可能
    if (cardData.Type === 'スペル/クラフト') {
      if (cardNameUseBlocked(my, cardData.CardName, cardData.Type)) return actions;
      // pending_spell がある間は新たにスペルを発動できない
      const spellBlocked = !!bs.pending_spell;
      const canUse = !isSpellUseBlocked(cardData) && phase === 'MAIN' && isMyTurn && !spellBlocked;
      // スペル使用条件（手札スペルと同様にACTIVATED効果の condition を評価）
      const spellEff = (effectsMap.get(cardNum) ?? []).find(e => e.effectType === 'ACTIVATED');
      const condOk = !spellEff?.condition || evalUseCondition(spellEff.condition, my, op, battleCardMap, cardNum, bs.turn_phase, effectivePowers);
      // コスト支払い可能か（簡易チェック：エナで賄えるか）
      const costOk = canAffordEnergyCostWithSubstitutes({
        poolNums: energyPoolCardNums(myEnergyPayPool), cards: battleCards, baseCost: cardData.Cost,
        extraCosts: [], keywordGrants: my.keyword_grants, allMulti: myEnaAllMulti,
        stripped: myEnaMultiStripped, colorlessOverrides: myColorlessOverrides,
        colorSubs: myColorSubs, extraColorMap: myEnergyExtraColors,
        banColorlessPay: my.cannot_pay_colorless_this_attack_phase,
        wholeSubstitutes: myWholeEnergySubstitutes,
      });
      if (canUse && condOk && costOk) {
        actions.push({
          label: '使用',
          color: C.accent,
          onClick: () => { openSpellCast({ cardNum, handIndex: -1, fromLrigDeck: true }); setBetAmount(0); },
        });
      }
      return actions;
    }

    // ── アーツ（'アーツ/クラフト'＝改造素材等8枚も同経路で使用可能）──
    if (cardData.Type === 'アーツ' || cardData.Type === 'アーツ/クラフト') {
      // ⚠**判定は `artsUseGate.checkArtsUse` 1本**（§8 `O-1`）＝カード名封じ・限定・フェイズ/Timing・
      //   `ARTS_LIMIT_1`・使用条件・実効コスト・支払い可否をすべてそこで見る。CPU の応答アーツも
      //   同じ関数を呼ぶので、ここに条件を足すときは gate 側へ足すこと（写経すると人間と CPU がズレる）。
      if (!myArtsPayerCtx) return actions;
      const artsCheck = checkArtsUse({
        card: cardData, my, op, isMyTurn, turnPhase: bs.turn_phase,
        cards: battleCards, cardMap: battleCardMap, effectsMap,
        payer: myArtsPayerCtx, effectivePowers,
      });
      if (artsCheck.usable) {
        actions.push({
          label: '使用',
          color: C.coin,
          onClick: () => {
            // 印刷コストから動いたときだけ実効コストを持ち込む（null＝Phase2 が印刷コストを使う）。
            openArtsModal(cardData, artsCheck.effectiveCostForModal);
          },
        });
      }
    }

    // ── キーピース ──
    // 🆕§5.6 `C-7`＝判定は `keyPieceUseGate.checkKeyPieceUse` の1本（枠の空き・Timing・`SELF_PLAY_RESTRICT`・
    //   実効コスト・コインの使用制限・使用条件）。CPU も同じ関数を見る＝**ここに条件を足さない**（写経すると人間と CPU がズレる）。
    if ((cardData.Type === 'キー' || isPieceCardType(cardData.Type)) && myArtsPayerCtx) {
      const keyCheck = checkKeyPieceUse({
        card: cardData, my, op, isMyTurn, turnPhase: bs.turn_phase ?? '',
        cards: battleCards, cardMap: battleCardMap, effectsMap, selfPlayEffectsMap: baseEffectsMap,
        payer: myArtsPayerCtx, effectivePowers,
      });
      if (keyCheck.usable) {
        actions.push({
          // ピースは「セット」ではなく**使用**（1回払って即解決→ルリグトラッシュ）。
          label: keyCheck.isPiece ? 'ピースを使用' : 'キーにセット',
          color: '#cc8800',
          onClick: () => { openKeyModal(cardData); },
        });
      }
    }

    return actions;
  };

  // `crashOneLife`（シグニアタックのライフクラッシュ）は `controller/resolveSigniBattle.ts` へ移設（2026-09-18・呼び出し元がそこだけ）。

  // WXDi-P05-069: フリップアタック（ロビンフッドが自シグニを裏向きにしてアタック）
  const handleFlipAttack = async (attackZone: number, flipZones: number[]) => {
    if (!isMyTurn || loading || bs.turn_phase !== 'ATTACK_SIGNI') return;
    const attackerNum = my.field.signi[attackZone]?.at(-1);
    // 解除コストは「他のシグニ2体をトラッシュ」。3面制限下では支払い後にフリップ対象が残らないため、
    // この代替アタックは成立しない。UIでも非表示にし、直呼びもここで止める。
    if (attackerNum && attackFieldTrashCost(my, attackerNum) > 0) return;
    setLoading(true);
    try {
      const stateKey = isHost ? 'host_state' : 'guest_state';
      // 🆕**§5.3 `O-238`（2026-09-05）＝「裏向き」をダウンで近似するのをやめた。**
      //   🔴旧実装は `signi_down` を立てるだけだった＝**裏向きのカードは場のシグニのまま**なので、
      //     付与元《翠将姫　ロビンフッド》自身の「あなたの場に**他にシグニがない**かぎり」が永久に成立せず、
      //     このアタック置換を使う意味（相手の全シグニをエナへ送る【自】を開く）が丸ごと消えていた。
      //   ⇒ 既存の裏向き機構（`facedownSigni.ts`＝`field.facedown_signi` へ移して**場のシグニとして扱わない**）に載せる。
      //     復帰も専用フィールドをやめて `turn_end_facedown_signi_returns`（trashIfOccupied=false＝
      //     「同じ場所にシグニがない場合だけ表向き」）へ寄せた＝**ターン終了の3経路すべてで解決される**
      //     （旧 `flip_attack_signi_zones` は CPU 側のターン終了経路に復帰処理が無かった）。
      let flippedState: PlayerState = my;
      const flippedNums: string[] = [];
      const flippedCards: string[] = [];
      for (const zi of flipZones) {
        const top = flippedState.field.signi[zi]?.at(-1);
        if (!top) continue;
        const moved = moveFieldSigniFacedown(flippedState, top);
        if (!moved.target) continue;
        flippedState = moved.state;
        flippedNums.push(top);
        flippedCards.push(battleCardMap.get(top)?.CardName ?? top);
      }
      flippedState = scheduleTurnEndFacedownReturns(flippedState, flippedNums);
      const attackerName = battleCardMap.get(attackerNum ?? '')?.CardName ?? '';
      // ⚠**`attacked_signi_ids` の追記は経路で分ける**＝`performSigniAttack` は自分で追記するので、
      //   委譲する側（`flippedAttacker`）へ先に足すと同じ id が2回入る。
      const flippedAttacker: PlayerState = clearEndOfAttackEffects(flippedState);
      const newMyState: PlayerState = {
        ...flippedAttacker,
        attacked_signi_ids: [...(flippedAttacker.attacked_signi_ids ?? []), attackerNum ?? ''],
      };
      appendBattleLogs([`フリップアタック：${attackerName}がアタック（${flippedCards.join('・')}を裏向き）`]);
      // 正面の相手シグニとバトル（通常アタックと同じ処理だがアサシン的に直接ダメージ）
      const opZone = 2 - attackZone;
      if (!(op.field.signi[opZone]?.length)) {
        // 正面空き → ダメージ
        const newOtherState: PlayerState = { ...op, field: { ...op.field, lrig_attacked: false } };
        if (op.life_cloth.length > 0) {
          const crashed = op.life_cloth[op.life_cloth.length - 1];
          const opKey = isHost ? 'guest_state' : 'host_state';
          await persist.commit(reduceBattle(bs, {
            type: 'WRITE_STATE', myKey: stateKey, myState: newMyState,
            opp: { key: opKey, state: { ...op, life_cloth: op.life_cloth.slice(0, -1),
              crash_source_card_num: my.field.signi[attackZone]?.at(-1), crash_cause: undefined, field: { ...op.field, check: crashed } } },
          }));
          appendBattleLogs([`シグニアタック：ライフクロスをクラッシュ`]);
        } else {
          const opKey = isHost ? 'guest_state' : 'host_state';
          await persist.commit(reduceBattle(bs, { type: 'WRITE_STATE', myKey: stateKey, myState: newMyState, opp: { key: opKey, state: newOtherState } }));
        }
      } else {
        // 正面にシグニ → バトル（通常アタックの解決器へ**裏向きにした状態を渡して**委譲する）。
        // 🔴🆕**§5.3 `O-238`（2026-09-05・実機でしか出なかった真バグ）＝ここは `handleSigniAttack` を
        //   呼んではいけない。** あれは `attacker: my`＝**React state の（＝裏向きにする前の）盤面**を
        //   渡すので、直前に commit した裏向きが**次の commit で丸ごと上書きされて消える**
        //   （実機では「フリップアタックを押すと普通のアタックになる」＝裏向きが1体も起きない）。
        //   `persist.commit` と React 反映のタイミング差は golden/smoke/fuzz のどれにも映らない。
        // 🔑**直前に自分で作った盤面があるなら、それを引数で渡す**（クロージャの state を読み直さない）。
        await performSigniAttack(attackZone, {
          attacker: flippedAttacker, defender: op,
          attackerId: user.id,
          defenderId: isHost ? bs.guest_id : bs.host_id,
          attackerKey: stateKey,
          // 🔴**裏向きにした直後の盤面で【常】付与を組み直す**＝これが無いと
          //   《翠将姫　ロビンフッド》の「あなたの場に他にシグニがないかぎり」で開く引用【自】が
          //   1度も発火しない（＝フリップアタックを使う意味が消える）。
          regrantLayerAbilities: true,
        });
      }
    } finally { setLoading(false); }
  };

  // 🆕§5.7 `S-5c` 第2段＝本体は `controller/performSigniAttack.ts`（I/O 注入）。ここは材料を渡すだけ。
  const performSigniAttack = (
    a0: Parameters<typeof performSigniAttackImpl>[0], a1: Parameters<typeof performSigniAttackImpl>[1],
  ) => performSigniAttackImpl(a0, { ...a1, openNegateEscape }, performCtx());



  // シグニアタック バトル解決（ON_ATTACK_SIGNI処理後に呼ばれるPhase 2）
  // 🆕§5.7 `S-5c` 第3段（2026-09-18）＝本体（1,588行）は `controller/resolveSigniBattle.ts` へ逐語で移設した。
  //   ここは画面の操作ロック（`loading`）を確かめて材料（`performCtx()`）を渡すだけ。人間・CPU 共用。
  const resolvePendingSigniBattleFor = async (
    myS: PlayerState,
    opS: PlayerState,
    myKey: 'host_state' | 'guest_state',
    attackerId: string,
    defenderId: string,
  ) => {
    if (!myS.pending_signi_battle) return;
    if (loading) return;
    await resolvePendingSigniBattleImpl(myS, opS, myKey, attackerId, defenderId, performCtx());
  };

  // resolvePendingSigniBattleFor の人間プレイヤー向けラッパー（useEffectから呼ばれる）
  const resolvePendingSigniBattle = async () => {
    if (!my.pending_signi_battle || loading) return;
    await resolvePendingSigniBattleFor(
      my, op,
      isHost ? 'host_state' : 'guest_state',
      user.id,
      isHost ? bs.guest_id : bs.host_id,
    );
  };

  // ON_ATTACK_LRIG解決後にガード応答をセット（pending_lrig_attackフラグをクリアしてlrig_attackedをセット）
  // 🆕§5.7 `S-5d` 第3段＝本体は `controller/ruleChecks.ts`（ヘッドレスも同じ1本を回す）。
  const resolvePendingLrigAttack = async () => { await ruleChecks().resolvePendingLrigAttack(); };

  // シグニアタック処理（人間プレイヤー用エントリポイント）
  const handleSigniAttack = async (zoneIndex: number) => {
    if (!isMyTurn || loading || bs.turn_phase !== 'ATTACK_SIGNI') return;
    if (op.field.check) return; // 相手のライフバースト処理待ち中はアタック不可
    const cardNum = my.field.signi[zoneIndex]?.at(-1);
    const fieldTrashCount = cardNum ? attackFieldTrashCost(my, cardNum) : 0;
    if (cardNum && fieldTrashCount > 0) {
      if (!canPayAttackFieldTrashCost(my, cardNum, battleCardMap)) return;
      openAttackFieldTrashPayment({ zoneIndex, cardNum, count: fieldTrashCount });
      return;
    }
    // 「手札をN枚捨てないかぎりアタックできない」（§6.4 O-3）＝どの手札を捨てるかを選ばせる。
    const handTaxCount = cardNum ? signiAttackBanHandDiscardCost(my, cardNum, battleCardMap) : 0;
    if (cardNum && handTaxCount > 0) {
      if (my.hand.length < handTaxCount) return;
      openAttackHandDiscardPayment({ zoneIndex, cardNum, count: handTaxCount });
      return;
    }
    await performSigniAttack(zoneIndex, {
      attacker: my,
      defender: op,
      attackerId: user.id,
      defenderId: isHost ? bs.guest_id : bs.host_id,
      attackerKey: isHost ? 'host_state' : 'guest_state',
    });
  };

  // 【側面アタック】（G077等）: 正面ではなく指定した相手シグニゾーン（正面の1つ隣）を攻撃する。
  const handleSigniSideAttack = async (zoneIndex: number, targetOpZone: number) => {
    if (!isMyTurn || loading || bs.turn_phase !== 'ATTACK_SIGNI') return;
    if (op.field.check) return;
    const cardNum = my.field.signi[zoneIndex]?.at(-1);
    const fieldTrashCount = cardNum ? attackFieldTrashCost(my, cardNum) : 0;
    if (cardNum && fieldTrashCount > 0) {
      if (!canPayAttackFieldTrashCost(my, cardNum, battleCardMap)) return;
      openAttackFieldTrashPayment({ zoneIndex, targetOpZone, cardNum, count: fieldTrashCount });
      return;
    }
    const handTaxCountSide = cardNum ? signiAttackBanHandDiscardCost(my, cardNum, battleCardMap) : 0;
    if (cardNum && handTaxCountSide > 0) {
      if (my.hand.length < handTaxCountSide) return;
      openAttackHandDiscardPayment({ zoneIndex, targetOpZone, cardNum, count: handTaxCountSide });
      return;
    }
    await performSigniAttack(zoneIndex, {
      attacker: my,
      defender: op,
      attackerId: user.id,
      defenderId: isHost ? bs.guest_id : bs.host_id,
      attackerKey: isHost ? 'host_state' : 'guest_state',
      targetOpZone,
    });
  };

  const resolveAttackFieldTrashPayment = async () => {
    if (!attackFieldTrashPayment || loading) return;
    if (selectedAttackFieldTrashZones.size !== attackFieldTrashPayment.count) return;
    const pending = attackFieldTrashPayment;
    const zones = [...selectedAttackFieldTrashZones].sort((a, b) => a - b);
    closeAttackFieldTrashPayment();
    // 🆕**ルリグアタックの解除コスト**（§5.3 `O-222`）＝同じモーダルを共有し、行き先だけ分ける。
    if (pending.forLrig) {
      await performLrigAttack({
        attacker: my,
        defender: op,
        attackerId: user.id,
        attackerKey: isHost ? 'host_state' : 'guest_state',
        slot: pending.lrigSlot ?? 'center',
        attackFieldTrashZones: zones,
      });
      return;
    }
    await performSigniAttack(pending.zoneIndex, {
      attacker: my,
      defender: op,
      attackerId: user.id,
      defenderId: isHost ? bs.guest_id : bs.host_id,
      attackerKey: isHost ? 'host_state' : 'guest_state',
      targetOpZone: pending.targetOpZone,
      attackFieldTrashZones: zones,
    });
  };

  /** 「手札をN枚捨てないかぎりアタックできない」の支払いを確定してアタックする（§6.4 O-3）。 */
  const resolveAttackHandDiscardPayment = async () => {
    if (!attackHandDiscardPayment || loading) return;
    if (selectedAttackHandDiscard.size !== attackHandDiscardPayment.count) return;
    const pending = attackHandDiscardPayment;
    const indices = [...selectedAttackHandDiscard].sort((a, b) => a - b);
    closeAttackHandDiscardPayment();
    await performSigniAttack(pending.zoneIndex, {
      attacker: my,
      defender: op,
      attackerId: user.id,
      defenderId: isHost ? bs.guest_id : bs.host_id,
      attackerKey: isHost ? 'host_state' : 'guest_state',
      targetOpZone: pending.targetOpZone,
      attackHandDiscardIndices: indices,
    });
  };

  // G154 BURST: アタック無効化を「手札N枚捨て」で回避してアタックを通す
  const resolveNegateEscapeDiscard = async () => {
    if (!negateEscape || selectedNegateEscape.size !== negateEscape.count || loading) return;
    const { zoneIndex, targetOpZone, cardNum, attackFieldTrashAlreadyPaid, attackHandDiscardAlreadyPaid } = negateEscape;
    const escaped = resolveNegateEscapeChoice(my, op, 'discard', cardNum, zoneIndex, selectedNegateEscape);
    appendBattleLogs([`手札${negateEscape.count}枚を捨ててアタックを通した`]);
    closeNegateEscape();
    // 無効化を解除した状態でアタックを再実行。zoneIndex=-1 はルリグアタック。
    if (zoneIndex < 0) {
      await performLrigAttack({
        attacker: escaped.attacker, defender: escaped.defender,
        attackerId: user.id, attackerKey: isHost ? 'host_state' : 'guest_state',
      });
    } else {
      await performSigniAttack(zoneIndex, {
        attacker: escaped.attacker, defender: escaped.defender,
        attackerId: user.id, defenderId: isHost ? bs.guest_id : bs.host_id,
        attackerKey: isHost ? 'host_state' : 'guest_state', targetOpZone,
        attackFieldTrashAlreadyPaid, attackHandDiscardAlreadyPaid,
      });
    }
  };

  // G154 BURST: 手札を捨てず、アタック無効化を受け入れる
  const resolveNegateEscapeAccept = async () => {
    if (!negateEscape || loading) return;
    setLoading(true);
    try {
      const { zoneIndex, cardNum } = negateEscape;
      const accepted = resolveNegateEscapeChoice(my, op, 'accept', cardNum, zoneIndex);
      const negatedTriggers = zoneIndex < 0
        ? { entries: [], usedOncePerTurnIds: [] }
        : collectSelfEventTriggers('ON_OPP_SIGNI_ATTACK_NEGATED_BY_EFFECT', accepted.defender, accepted.attacker, 'シグニアタック無効時', isHost ? bs.guest_id : bs.host_id);
      const defenderAfterTrigger: PlayerState = negatedTriggers.usedOncePerTurnIds.length > 0
        ? { ...accepted.defender, actions_done: [...(accepted.defender.actions_done ?? []), ...negatedTriggers.usedOncePerTurnIds] }
        : accepted.defender;
      const stack = negatedTriggers.entries.length > 0
        ? (bs.effect_stack ? pushToStack(bs.effect_stack, negatedTriggers.entries) : initStack(bs.active_user_id ?? user.id, negatedTriggers.entries))
        : undefined;
      appendBattleLogs([`${battleCardMap.get(cardNum)?.CardName ?? cardNum}のアタックは無効化された`]);
      closeNegateEscape();
      const myKey = isHost ? 'host_state' : 'guest_state';
      const opKey = isHost ? 'guest_state' : 'host_state';
      await persist.commit(reduceBattle(bs, { type: 'WRITE_STATE', myKey: myKey, myState: accepted.attacker, opp: { key: opKey, state: defenderAfterTrigger }, ...(stack ? { effectStack: stack } : {}) }));
      await flushBattleLogs();
    } finally {
      setLoading(false);
    }
  };

  /**
   * ルリグアタックの《無》前払いコストと可否を**1か所で**返す（§6.4 O-28）。
   *
   * ⚠**コスト軸をまとめる**＝`OPP_LRIG_ATTACK_COST`（相手フィールドの【常】）と
   *   `signi_attack_bans_this_turn` の `appliesTo:'LRIG'`（付与された「《無》×Nを支払わないかぎり
   *   アタックできない」）はどちらも同じ前払いなので、判定地点（ボタン生成）と引き落とし地点
   *   （`performLrigAttack`）が**同じ数**を見る。軸ごとに関数を分けると片方だけ見る gate ができる。
   * 🔴従来は引き落としだけがあり、**払えないときは黙って0枚払いでアタックできていた**
   *   （`my.energy.length >= cost` の else が素通り）。
   */
  const lrigAttackCostInfo = (
    my: PlayerState, op: PlayerState, lrigNum: string | null | undefined,
  ): { blocked: boolean; colorless: number; fieldTrash: number } => {
    const banCost = lrigAttackBanCost(my, lrigNum, battleCardMap);
    // 解除できない ban（「アタックできない」だけ）が掛かっている＝どれだけ払っても不可。
    if (banCost === null) return { blocked: true, colorless: 0, fieldTrash: 0 };
    const colorless = collectOppLrigAttackExtraCost(op, my, battleCardMap, effectsMap, false) + banCost.colorless;
    // 🆕**「あなたのシグニN体を場からトラッシュに置かないかぎり」**（§5.3 `O-222`・`WX24-P3-049-E1`）。
    // ⚠**払えるかどうかも同じ関数で見る**＝盤面にシグニが足りなければアタック不可
    //   （押せるのに無反応＝§6.4 `O-18` にしない）。
    const fieldTrash = banCost.fieldTrash;
    // 「手札をN枚捨てないかぎり」のルリグ版は**母集団0**（原文はいずれもシグニ）。
    // 万一生えたら支払いUIが無いので過少側（アタック不可）に倒す＝無言で無視しない。
    // §5.3 `O-371`＝《無》の前払いは `buildEnergyPayPool` を通らない＝「1以上のエナコストを支払えない」はここで見る。
    const blocked = banCost.handDiscard > 0
      || my.energy.length < colorless
      || (colorless > 0 && isEnergyPayBlocked(my, bs?.turn_phase ?? 'ATTACK_LRIG'))
      || !canPayLrigAttackFieldTrashCost(my, fieldTrash, battleCardMap);
    return { blocked, colorless, fieldTrash };
  };

  // ルリグアタックの実行（人間・CPU共通）。
  // 🆕§5.7 `S-5c` 第2段＝本体は `controller/performLrigAttack.ts`（I/O 注入）。ここは材料を渡すだけ。
  const performLrigAttack = (p: Parameters<typeof performLrigAttackImpl>[0]) =>
    performLrigAttackImpl({ ...p, openNegateEscape }, performCtx());


  // ルリグアタック（人間プレイヤー用エントリポイント）
  const handleLrigAttack = async (slot: LrigAttackSlot = 'center') => {
    if (!isMyTurn || loading || bs.turn_phase !== 'ATTACK_LRIG') return;
    // 🆕**「シグニN体を場からトラッシュに置かないかぎりアタックできない」はどれを置くか選ばせる**
    //   （§5.3 `O-222`）＝シグニ側の `handleSigniAttack` と同じ作法で、支払いUI を先に開く。
    const lrigNumHL = lrigSlotTop(my, slot);
    const costHL = lrigAttackCostInfo(my, op, lrigNumHL);
    if (!costHL.blocked && costHL.fieldTrash > 0) {
      openAttackFieldTrashPayment({
        zoneIndex: -1, cardNum: lrigNumHL ?? '', count: costHL.fieldTrash, forLrig: true, lrigSlot: slot,
      });
      return;
    }
    await performLrigAttack({
      attacker: my,
      defender: op,
      attackerId: user.id,
      attackerKey: isHost ? 'host_state' : 'guest_state',
      slot,
    });
  };

  // 🆕§5.7 `S-5d` 第3段（2026-09-19）＝ルール処理8本の本体は `controller/ruleChecks.ts` へ逐語で移設した。
  //   🔴ここに書き戻さない＝ヘッドレスの対戦ループ（`headlessMatch.ts`）が同じ8本を回す＝二重になると片方だけ直る。
  const ruleChecks = () => makeRuleChecks(performCtx(), { loading, isCpuBattle, memo: ruleMemoRef.current });
  const triggerPendingCrash = async () => { await ruleChecks().triggerPendingCrash(); };
  const checkAndBanishPowerZero = async () => { await ruleChecks().checkAndBanishPowerZero(); };
  const checkAndApplyContMutations = async () => { await ruleChecks().checkAndApplyContMutations(); };
  const checkDeferredRefreshRule = async () => { await ruleChecks().checkDeferredRefreshRule(); };
  const checkRefreshForcedTurnEnd = async () => { await ruleChecks().checkRefreshForcedTurnEnd(); };
  const applyLimitExcessRule = async (
    owner: PlayerState, ownerKey: PlayerStateKey, ownerId: string, zones: number[], reason: string,
  ) => { await ruleChecks().applyLimitExcessRule(owner, ownerKey, ownerId, zones, reason); };
  const checkLimitExcessRule = async () => { await ruleChecks().checkLimitExcessRule(); };

  /** `LimitExcessModal` で持ち主が選んだ1体を落とす（B/C＝1体ずつ・落としたら funnel が測り直す）。 */
  const handleLimitExcessPick = async (zoneIndex: number) => {
    if (loading) return;
    await applyLimitExcessRule(my, isHost ? 'host_state' : 'guest_state', user.id, [zoneIndex], 'リミット超過');
  };

  // refs を常に最新の関数インスタンスに同期（Rules of Hooks 対応）
  doPhaseAdvanceRef.current                = doPhaseAdvance;
  checkLimitExcessRef.current              = checkLimitExcessRule;
  checkRefreshTurnEndRef.current            = checkRefreshForcedTurnEnd;
  checkDeferredRefreshRef.current           = checkDeferredRefreshRule;
  triggerPendingCrashRef.current           = triggerPendingCrash;
  resolveStackNextRef.current              = resolveStackNext;
  checkPowerZeroBanishRef.current          = checkAndBanishPowerZero;
  checkContMutationsRef.current            = checkAndApplyContMutations;
  resolvePendingSigniBattleRef.current     = resolvePendingSigniBattle;
  resolvePendingLrigAttackRef.current      = resolvePendingLrigAttack;

  // ══════════════════════════════════════════
  // CPU AI ロジック（ターン行動）
  // ══════════════════════════════════════════

  // CPU ターン自動行動
  // 🆕§5.7 `S-5c` 第3段（2026-09-18）＝本体（1,362行）は `controller/cpuTurn.ts` へ逐語で移設。
  //   画面は材料（`performCtx()`）と、画面だけが持つもの（実行関数のラッパ＝UI コールバック込み・全カード・作戦データ・パワー0の即時処理）を渡すだけ。
  const cpuTurnAction = async () => cpuTurnActionImpl(performCtx(), {
    actions: {
      performSummonSigni, performGrow, performArts, performKeyPiece, performAssistGrow, performSpell,
      performSigniAttack, performLrigAttack, performGuardResponse, performLifeBurstResponse,
      performSigniActivated, performLrigActivated, resolvePendingSigniBattleFor, handleCutinPass,
    },
    allCards: cards,
    cpuPlan,
    checkPowerZeroBanish: () => checkPowerZeroBanishRef.current?.(),
    // 🆕§5.6 `C-12`＝ピース応答窓の「最新盤面の読み直し」（CPU が応答したときに窓を閉じるのに要る）。
    fetchLatest: async () => (await persist.fetchState()).data ?? null,
  });
  cpuTurnRef.current = cpuTurnAction;

  // GUARD_ALTERNATIVE_COST: エナゾーンから指定クラスのシグニをトラッシュしてガード
  const handleGuardWithEnergyAlternative = async () => {
    if (!my.field.lrig_attacked || loading) return;
    const altCost = collectGuardAlternativeCost(my, battleCardMap, effectsMap);
    if (altCost?.spec.kind !== 'energy_trash_class' && altCost?.spec.kind !== 'hand_or_energy_trash_class') return;
    const altClass = altCost.spec.signiClass;
    const energySigni = guardAlternativeClassCandidates(my, altClass, battleCardMap).energyNums;
    if (energySigni.length === 0) return;
    setLoading(true);
    try {
      const stateKey = isHost ? 'host_state' : 'guest_state';
      const trashTarget = energySigni[0]; // 最初の該当シグニをトラッシュ
      // ON_GUARD: 代替コストによるガードも【ガード】したときに含まれる
      const { entries: guardTriggers, usedOncePerTurnIds: guardUsedIds } =
        collectSelfEventTriggers('ON_GUARD', my, op, 'ガード時');
      const attackerId = isHost ? bs.guest_id : bs.host_id;
      const attackGuard = collectLrigAttackGuardedTriggers(attackerId, op, my, user.id);
      guardTriggers.push(...attackGuard.entries);
      const newMyState: PlayerState = {
        ...my,
        energy: my.energy.filter(cn => cn !== trashTarget),
        trash: [...my.trash, trashTarget],
        field: { ...my.field, lrig_attacked: false },
        // ⚠§5.3 `O-458`：**防御側**の「センタールリグ１体がアタックしたとき」の《ターン1回》もここで消費する
        //   （攻撃側の `actions_done` へ入れると別人の台帳に付いて制限が効かない）。
        actions_done: guardUsedIds.length > 0 || attackGuard.usedDefenderIds.length > 0
          ? [...(my.actions_done ?? []), ...guardUsedIds, ...attackGuard.usedDefenderIds]
          : my.actions_done,
      };
      appendBattleLogs([`ガード代替コスト：エナ＜${altClass}＞（${battleCardMap.get(trashTarget)?.CardName ?? trashTarget}）をトラッシュ`]);
      const opKey = isHost ? 'guest_state' : 'host_state';
      const newOpState = attackGuard.usedOncePerTurnIds.length > 0
        ? { ...clearEndOfAttackEffects(op), actions_done: [...(op.actions_done ?? []), ...attackGuard.usedOncePerTurnIds] }
        : clearEndOfAttackEffects(op);
      const existingStackEG = bs.effect_stack ?? null;
      await persist.commit(reduceBattle(bs, {
        type: 'WRITE_STATE', myKey: stateKey, myState: newMyState, opp: { key: opKey, state: newOpState },
        effectStack: guardTriggers.length > 0
          ? (existingStackEG ? pushToStack(existingStackEG, guardTriggers) : initStack(bs.active_user_id ?? user.id, guardTriggers))
          : undefined,
      }));
    } finally { setLoading(false); }
  };

  // GUARD_ALTERNATIVE_COST: 手札から指定クラスのシグニを1枚捨ててガード（エナとの2択の手札側）。
  const handleGuardWithClassHandAlternative = async () => {
    if (!my.field.lrig_attacked || loading) return;
    const altCost = collectGuardAlternativeCost(my, battleCardMap, effectsMap);
    if (altCost?.spec.kind !== 'hand_or_energy_trash_class') return;
    const candidates = guardAlternativeClassCandidates(my, altCost.spec.signiClass, battleCardMap);
    const handIndex = candidates.handIndices[0];
    if (handIndex === undefined) return;
    setLoading(true);
    try {
      const stateKey = isHost ? 'host_state' : 'guest_state';
      const discarded = my.hand[handIndex];
      const { entries: guardTriggers, usedOncePerTurnIds: guardUsedIds } =
        collectSelfEventTriggers('ON_GUARD', my, op, 'ガード時');
      const attackerId = isHost ? bs.guest_id : bs.host_id;
      const attackGuard = collectLrigAttackGuardedTriggers(attackerId, op, my, user.id);
      guardTriggers.push(...attackGuard.entries);
      const newMyState: PlayerState = {
        ...my,
        hand: my.hand.filter((_, i) => i !== handIndex),
        trash: [...my.trash, discarded],
        ...handDiscardHistoryRecord(my, [discarded]),
        field: { ...my.field, lrig_attacked: false },
        // ⚠§5.3 `O-458`：**防御側**の「センタールリグ１体がアタックしたとき」の《ターン1回》もここで消費する
        //   （攻撃側の `actions_done` へ入れると別人の台帳に付いて制限が効かない）。
        actions_done: guardUsedIds.length > 0 || attackGuard.usedDefenderIds.length > 0
          ? [...(my.actions_done ?? []), ...guardUsedIds, ...attackGuard.usedDefenderIds]
          : my.actions_done,
      };
      appendBattleLogs([`ガード代替コスト：手札の＜${altCost.spec.signiClass}＞（${battleCardMap.get(discarded)?.CardName ?? discarded}）を捨てる`]);
      const opKey = isHost ? 'guest_state' : 'host_state';
      const newOpState = attackGuard.usedOncePerTurnIds.length > 0
        ? { ...clearEndOfAttackEffects(op), actions_done: [...(op.actions_done ?? []), ...attackGuard.usedOncePerTurnIds] }
        : clearEndOfAttackEffects(op);
      const existingStackHG = bs.effect_stack ?? null;
      await persist.commit(reduceBattle(bs, {
        type: 'WRITE_STATE', myKey: stateKey, myState: newMyState, opp: { key: opKey, state: newOpState },
        effectStack: guardTriggers.length > 0
          ? (existingStackHG ? pushToStack(existingStackHG, guardTriggers) : initStack(bs.active_user_id ?? user.id, guardTriggers))
          : undefined,
      }));
    } finally { setLoading(false); }
  };

  // game_guard_alt_hand: 手札N枚を捨ててガード（ガードアイコン不要の代替）
  /**
   * 🆕**§5.3 `O-230`（2026-09-04）＝【ガード】の代替コストとしての「コラボする」。**
   * `WXDi-CP01-005-E1`「あなたが【ガード】する際、《ガードアイコン》を持つカードを1枚捨てる代わりに
   *   《無》を支払い**コラボライバー1人とコラボしてもよい**。」
   * 🔴旧は `STUB{COLLAB}` の「コラボしてもよい」枝へ落ちて**原文と無関係にアシストルリグを場へ出す対話**が開いていた。
   * 🔑**コラボの実行部（`INTERNAL_DO_COLLAB`）は既にある**＝ここは「ガードの代わりに払う」入口と支払いだけ。
   * ⚠**エナの支払いは《無》＝色を問わない**ので先頭から N 枚取る（他の《無》コストと同じ規約）。
   */
  const handleGuardWithCollabAlternative = async (colorless: number, collab: number) => {
    if (!my.field.lrig_attacked || loading) return;
    if (my.energy.length < colorless) return;
    // 🆕§5.3 `O-292`＝コラボ＝ライバートークンを取り除く（提示側 `GuardResponseDialog` と同じ検算）。
    if ((my.liver_tokens ?? 0) < collab) return;
    setLoading(true);
    try {
      const stateKey = isHost ? 'host_state' : 'guest_state';
      const paid = my.energy.slice(0, colorless);
      const { entries: guardTriggers, usedOncePerTurnIds: guardUsedIds } =
        collectSelfEventTriggers('ON_GUARD', my, op, 'ガード時');
      const attackerId = isHost ? bs.guest_id : bs.host_id;
      const attackGuard = collectLrigAttackGuardedTriggers(attackerId, op, my, user.id);
      guardTriggers.push(...attackGuard.entries);
      // 🔴§5.3 `O-292`＝旧はここで `STUB{INTERNAL_DO_COLLAB}` をスタックへ積み、**アシストルリグを場へ出していた**。
      //   コラボはコストの支払い＝**支払いの場でトークンを減らす**（効果の解決を待たない）。
      const newMyState: PlayerState = {
        ...my,
        liver_tokens: (my.liver_tokens ?? 0) - collab,
        energy: my.energy.slice(colorless),
        trash: [...my.trash, ...paid],
        field: { ...my.field, lrig_attacked: false },
        // ⚠§5.3 `O-458`：**防御側**の「センタールリグ１体がアタックしたとき」の《ターン1回》もここで消費する
        //   （攻撃側の `actions_done` へ入れると別人の台帳に付いて制限が効かない）。
        actions_done: guardUsedIds.length > 0 || attackGuard.usedDefenderIds.length > 0
          ? [...(my.actions_done ?? []), ...guardUsedIds, ...attackGuard.usedDefenderIds]
          : my.actions_done,
      };
      appendBattleLogs([`ガード代替：《無》×${colorless}を支払いコラボライバー${collab}人とコラボ`]);
      const opKey = isHost ? 'guest_state' : 'host_state';
      const newOpState = attackGuard.usedOncePerTurnIds.length > 0
        ? { ...clearEndOfAttackEffects(op), actions_done: [...(op.actions_done ?? []), ...attackGuard.usedOncePerTurnIds] }
        : clearEndOfAttackEffects(op);
      const existingStackCG = bs.effect_stack ?? null;
      await persist.commit(reduceBattle(bs, {
        type: 'WRITE_STATE', myKey: stateKey, myState: newMyState, opp: { key: opKey, state: newOpState },
        effectStack: existingStackCG ? pushToStack(existingStackCG, guardTriggers) : initStack(bs.active_user_id ?? user.id, guardTriggers),
      }));
    } finally { setLoading(false); }
  };

  /**
   * 🆕**§5.3 `O-266`（2026-09-06）＝【ガード】の代替コスト「エナN枚＋《ガードアイコン》M枚をトラッシュ」。**
   * `WX25-P2-007-E1`「あなたが【ガード】する際、《ガードアイコン》を持つカードを1枚捨てる代わりに
   *   あなたのエナゾーンからカード1枚と《ガードアイコン》を持つカード1枚をトラッシュに置いてもよい。」
   * 🔑**`handleGuardWithHandAlternative` と払う場所が違う**＝あちらは手札だけ。ここは**エナと手札の2箇所**。
   * ⚠エナ側は**色もクラスも問わない**（原文が「カード1枚」）＝先頭から N 枚取る（他の《無》コストと同じ規約）。
   * ⚠**捨てる手札は《ガードアイコン》を持つカードに限る**（`canCardGuard`）＝ここを緩めると
   *   「どの手札でもガードできる」別カードの効果に化ける。
   */
  const handleGuardWithEnergyAndGuardCard = async () => {
    const spec = my.game_guard_alt_energy_and_guard_card;
    if (!spec || !my.field.lrig_attacked || loading) return;
    const guardIdx: number[] = [];
    my.hand.forEach((cn, i) => {
      if (guardIdx.length < spec.guardCardCount && canCardGuard(cn, my, battleCardMap, effectsMap)) guardIdx.push(i);
    });
    if (my.energy.length < spec.energyCount || guardIdx.length < spec.guardCardCount) return;
    setLoading(true);
    try {
      const stateKey = isHost ? 'host_state' : 'guest_state';
      const paidEnergy = my.energy.slice(0, spec.energyCount);
      const idxSet = new Set(guardIdx);
      const discarded = my.hand.filter((_, i) => idxSet.has(i));
      const { entries: guardTriggers, usedOncePerTurnIds: guardUsedIds } =
        collectSelfEventTriggers('ON_GUARD', my, op, 'ガード時');
      const attackerId = isHost ? bs.guest_id : bs.host_id;
      const attackGuard = collectLrigAttackGuardedTriggers(attackerId, op, my, user.id);
      guardTriggers.push(...attackGuard.entries);
      const newMyState: PlayerState = {
        ...my,
        energy: my.energy.slice(spec.energyCount),
        hand: my.hand.filter((_, i) => !idxSet.has(i)),
        trash: [...my.trash, ...paidEnergy, ...discarded],
        field: { ...my.field, lrig_attacked: false },
        // ⚠§5.3 `O-458`：**防御側**の「センタールリグ１体がアタックしたとき」の《ターン1回》もここで消費する
        //   （攻撃側の `actions_done` へ入れると別人の台帳に付いて制限が効かない）。
        actions_done: guardUsedIds.length > 0 || attackGuard.usedDefenderIds.length > 0
          ? [...(my.actions_done ?? []), ...guardUsedIds, ...attackGuard.usedDefenderIds]
          : my.actions_done,
      };
      appendBattleLogs([`ガード代替：エナ${spec.energyCount}枚と《ガードアイコン》${spec.guardCardCount}枚（${discarded.map(cn => battleCardMap.get(cn)?.CardName ?? cn).join('、')}）をトラッシュ`]);
      const opKey = isHost ? 'guest_state' : 'host_state';
      const newOpState = attackGuard.usedOncePerTurnIds.length > 0
        ? { ...clearEndOfAttackEffects(op), actions_done: [...(op.actions_done ?? []), ...attackGuard.usedOncePerTurnIds] }
        : clearEndOfAttackEffects(op);
      const existingStackEG = bs.effect_stack ?? null;
      await persist.commit(reduceBattle(bs, {
        type: 'WRITE_STATE', myKey: stateKey, myState: newMyState, opp: { key: opKey, state: newOpState },
        effectStack: guardTriggers.length > 0
          ? (existingStackEG ? pushToStack(existingStackEG, guardTriggers) : initStack(bs.active_user_id ?? user.id, guardTriggers))
          : undefined,
      }));
    } finally { setLoading(false); }
  };

  const handleGuardWithHandAlternative = async () => {
    if (!my.field.lrig_attacked || loading) return;
    const altN = Math.max(my.game_guard_alt_hand ?? 0, my.guard_alt_hand_until_opp_turn ?? 0);
    if (altN <= 0 || my.hand.length < altN) return;
    setLoading(true);
    try {
      const stateKey = isHost ? 'host_state' : 'guest_state';
      // 手札の末尾N枚を捨てる
      const discarded = my.hand.slice(-altN);
      // ON_GUARD: 代替コストによるガードも【ガード】したときに含まれる
      const { entries: guardTriggers, usedOncePerTurnIds: guardUsedIds } =
        collectSelfEventTriggers('ON_GUARD', my, op, 'ガード時');
      const attackerId = isHost ? bs.guest_id : bs.host_id;
      const attackGuard = collectLrigAttackGuardedTriggers(attackerId, op, my, user.id);
      guardTriggers.push(...attackGuard.entries);
      const newMyState: PlayerState = {
        ...my,
        hand: my.hand.slice(0, -altN),
        trash: [...my.trash, ...discarded],
        field: { ...my.field, lrig_attacked: false },
        // ⚠§5.3 `O-458`：**防御側**の「センタールリグ１体がアタックしたとき」の《ターン1回》もここで消費する
        //   （攻撃側の `actions_done` へ入れると別人の台帳に付いて制限が効かない）。
        actions_done: guardUsedIds.length > 0 || attackGuard.usedDefenderIds.length > 0
          ? [...(my.actions_done ?? []), ...guardUsedIds, ...attackGuard.usedDefenderIds]
          : my.actions_done,
      };
      appendBattleLogs([`ガード代替：手札${altN}枚を捨てる（${discarded.map(cn => battleCardMap.get(cn)?.CardName ?? cn).join('、')}）`]);
      const opKey = isHost ? 'guest_state' : 'host_state';
      const newOpState = attackGuard.usedOncePerTurnIds.length > 0
        ? { ...clearEndOfAttackEffects(op), actions_done: [...(op.actions_done ?? []), ...attackGuard.usedOncePerTurnIds] }
        : clearEndOfAttackEffects(op);
      const existingStackHG = bs.effect_stack ?? null;
      await persist.commit(reduceBattle(bs, {
        type: 'WRITE_STATE', myKey: stateKey, myState: newMyState, opp: { key: opKey, state: newOpState },
        effectStack: guardTriggers.length > 0
          ? (existingStackHG ? pushToStack(existingStackHG, guardTriggers) : initStack(bs.active_user_id ?? user.id, guardTriggers))
          : undefined,
      }));
    } finally { setLoading(false); }
  };

  // 🆕§5.7 `S-5c` 第2段＝本体は `controller/performGuardResponse.ts`（I/O 注入）。ここは材料を渡すだけ。
  const performGuardResponse = (a0: Parameters<typeof performGuardResponseImpl>[0], a1: Parameters<typeof performGuardResponseImpl>[1]) => performGuardResponseImpl(a0, a1, performCtx());


  // ガード応答（人間プレイヤー用エントリポイント）
  const handleGuardResponse = async (handIndex: number | null) => {
    if (loading) return;
    // 🆕🔴2026-09-18＝**自分の最後の書き込みが手元に届くまで受け付けない**（バグ報告 `4b765502` と同じ型）。
    //   `loading` は画面の状態＝1回目の commit が届く前の二度押し（ハーネスの周回・人間の素早い連打）を止められず、
    //   **古い盤面からルリグアタックのダメージをもう一度計算していた**（実測＝「ルリグアタック：ライフクロスをクラッシュ」が2行・
    //   CPU 系シナリオ `v78`／`v82` がバッチ中だけ「ターンが終わらない」）。
    if (!ownCommitsArrived(bs)) return;
    await performGuardResponse(handIndex, {
      responder: my,
      attacker: op,
      responderId: user.id,
      attackerId: isHost ? bs.guest_id : bs.host_id,
      responderKey: isHost ? 'host_state' : 'guest_state',
    });
  };

  // クラッシュされたカードが付与ライフバーストの対象か（burstFilter があればクラッシュカードが一致する必要がある）
  const matchesAllZoneBurstGrant = (
    cardNum: string,
    ownerState: PlayerState,
    includeTemporary = bs.active_user_id !== user.id,
  ): boolean => {
    return allZoneBurstGrantMatches(cardNum, ownerState, battleCardMap, effectsMap, includeTemporary);
  };
  // 🆕§5.7 `S-5c` 第2段＝本体は `controller/performLifeBurstResponse.ts`（I/O 注入）。ここは材料を渡すだけ。
  const performLifeBurstResponse = (a0: Parameters<typeof performLifeBurstResponseImpl>[0], a1: Parameters<typeof performLifeBurstResponseImpl>[1], a2: Parameters<typeof performLifeBurstResponseImpl>[2]) => performLifeBurstResponseImpl(a0, a1, a2, performCtx());


  // ライフバースト確認（人間プレイヤー用エントリポイント）
  const handleLifeBurstResponse = async (activate: boolean, targetCardNum?: string) => {
    // ⚠解決中の効果があるうちは処理しない（`LifeBurstCheckModal` と同じ条件）＝`clearPending` が対象選択を捨てる。
    if (loading || bs?.pending_effect) return;
    await performLifeBurstResponse(activate, targetCardNum, {
      owner: my,
      opponent: op,
      ownerId: user.id,
      ownerKey: isHost ? 'host_state' : 'guest_state',
    });
  };

  // F-3 BANISH_SUBSTITUTE: 防御側（人間）が身代わりの選択肢を選ぶ。
  // optionIndex=null で「身代わりしない（通常バニッシュ）」。決定後、攻撃側のバトル解決が再入で再開する。
  const handleBanishSubstituteChoice = async (optionIndex: number | null) => {
    if (loading) return;
    const pend = my.pending_banish_substitute;
    if (!pend) return;
    const option = optionIndex != null ? (pend.options[optionIndex] ?? null) : null;
    const myKey = isHost ? 'host_state' : 'guest_state';
    const newMyState: PlayerState = {
      ...my,
      pending_banish_substitute: undefined,
      banish_substitute_choice: { victimNum: pend.victimNum, option },
    };
    await persist.commit(reduceBattle(bs, { type: 'WRITE_STATE', myKey: myKey, myState: newMyState }));
  };

  /**
   * 🆕§5.3 `O-414`：ダメージ置換（「代わりに〜して**もよい**」）を被害側が選ぶ。
   * `optionIndex=null` で「置換しない（ダメージをそのまま受ける）」。
   *
   * 🔑**ルリグアタックの枝はその場で再入する**＝【ガードしない】はこのクライアント自身の操作なので、
   *   state 経由の再入を待たずに `performGuardResponse` を呼び直せる（`GuardResponseDialog` は
   *   `pending_life_crash_replace` が立つ間は隠れている＝二重に【ガードしない】を押させない）。
   * ⚠**シグニアタックの枝は commit するだけ**＝解決しているのは**攻撃側のクライアント**で、
   *   `resolvePendingSigniBattle` の useEffect が state 変化で再入する（F-3 と同じ）。
   */
  const handleLifeCrashReplaceChoice = async (optionIndex: number | null) => {
    if (loading) return;
    const pend = my.pending_life_crash_replace;
    if (!pend) return;
    const option = optionIndex != null ? (pend.options[optionIndex] ?? null) : null;
    const myKey = isHost ? 'host_state' : 'guest_state';
    // ⚠リセットは funnel（`turnScopedState`）経由＝手書きの `: undefined` は golden `turn-scoped T2` が止める。
    const newMyState: PlayerState = { ...consumeLifeCrashReplaceDecision(my), life_crash_replace_choice: { option } };
    if (my.field.lrig_attacked) {
      // ⚠**`handleGuardResponse` と同じ引数**で呼び直す（【ガードしない】の続きだから）。
      await performGuardResponse(null, {
        responder: newMyState, attacker: op,
        responderId: user.id, attackerId: isHost ? bs.guest_id : bs.host_id,
        responderKey: myKey,
      });
      return;
    }
    await persist.commit(reduceBattle(bs, { type: 'WRITE_STATE', myKey, myState: newMyState }));
  };

  // 🆕§5.7 `S-5c` 第2段＝本体は `controller/performSigniActivated.ts`（I/O 注入）。ここは材料を渡すだけ。
  const performSigniActivated = (a0: Parameters<typeof performSigniActivatedImpl>[0], a1: Parameters<typeof performSigniActivatedImpl>[1], a2: Parameters<typeof performSigniActivatedImpl>[2], a3: Parameters<typeof performSigniActivatedImpl>[3]) => performSigniActivatedImpl(a0, a1, a2, a3, performCtx());


  /** 人間UI（`SigniActivatedModal`）から呼ぶ薄いラッパー。判定・実行の本体は `performSigniActivated`。 */
  const executeSigniActivated = async (cardNum: string, effect: import('../types/effects').CardEffect, costIndices: Set<number>, discardCostIndices: Set<number>, useKeySub = false, discardVarIndices?: Set<number>, energyTrashIndices: Set<number> = new Set(), trashExileIndices: Set<number> = new Set(), fieldTrashZones: Set<number> = new Set(), beatZones: Set<number> = new Set(), underTrashKeys: Set<string> = new Set()) => {
    if (loading) return;
    closeSigniActivated();
    setKeySubstituteEnabled(false);
    await performSigniActivated(cardNum, effect, {
      costIndices, discardCostIndices, useKeySub, discardVarIndices, energyTrashIndices,
      trashExileIndices, fieldTrashZones, beatZones, underTrashKeys,
      charmTrashVarCount: signiActCharmTrashVar,
    }, {
      actor: my, opponent: op,
      actorId: user.id, opponentId: isHost ? bs.guest_id : bs.host_id,
      actorKey: isHost ? 'host_state' : 'guest_state',
      energyPayPool: myEnergyPayPool,
      energyTrashSubInfo: myEnergyTrashSubInfo,
    });
  };

  // エナゾーンのACTIVATED能力（アクセカード）を発動
  const executeEnergyActivated = async (
    cardNum: string,
    effect: import('../types/effects').CardEffect,
    costIndices: Set<number>,
  ) => {
    if (loading) return;
    setLoading(true);
    closeEnergyActivated();
    try {
      // アクセカードがエナから取り除かれるのはATTACH_ACCE実行時（effectExecutor側）
      // コストのみ先払い（緑×0の場合は何も消費しない）
      const enaActPay = planEnergyPayment(my, myEnergyPayPool, costIndices);
      const paidNums = enaActPay.paidNums;
      const paid: PlayerState = enaActPay.applyTo({
        ...my,
        trash: [...my.trash, ...paidNums],
        actions_done: [...(my.actions_done ?? []), effect.effectId],
      });
      const cardName = battleCardMap.get(cardNum)?.CardName ?? cardNum;
      const entry: StackEntry = {
        id: generateUUID(),
        playerId: user.id,
        cardNum,
        effectId: effect.effectId,
        label: `${cardName}【起】アクセ`,
        effect,
      };
      const turnPlayerId = bs.active_user_id ?? user.id;
      const existingStack = bs?.effect_stack ?? null;
      const newStack = existingStack
        ? pushToStack(existingStack, [entry])
        : initStack(turnPlayerId, [entry]);
      const stateKey = isHost ? 'host_state' : 'guest_state';
      await persist.commit(reduceBattle(bs, { type: 'WRITE_STATE', myKey: stateKey, myState: paid, effectStack: newStack, clearPending: true }));
    } finally {
      setLoading(false);
    }
  };

  // v0.277: 手札から自身を捨てて発動する【起】効果を実行
  /**
   * 🆕§5.7 `S-7`＝場以外の【起】の**行為者**（CPU も人間と同じ実行関数で撃つ）。省略時は人間（自分）＝従来と同一。
   * ⚠`performSigniActivated` の `p` と同じ形（行為者・相手・ID・state キー・エナ支払い元）。
   */
  const humanOffFieldActor = (): OffFieldActor => ({
    actor: my, opponent: op, actorId: user.id, opponentId: (isHost ? bs.guest_id : bs.host_id) ?? '',
    actorKey: isHost ? 'host_state' : 'guest_state', energyPayPool: myEnergyPayPool,
  });
  // 🆕§5.7 `S-5c` 第3段＝本体は `controller/offFieldActivateExec.ts`（I/O 注入）。ここは行為者と UI を渡すだけ。
  const executeHandActivated = async (
    cardNum: string, handIndex: number, effect: import('../types/effects').CardEffect,
    selections: HandActivateSelections, actorCtx?: OffFieldActor,
  ) => {
    if (!actorCtx && loading) return;
    await executeHandActivatedImpl(cardNum, handIndex, effect, selections,
      actorCtx ?? humanOffFieldActor(), performCtx(), actorCtx ? undefined : { close: closeHandActivated });
  };


  // 🆕§5.7 `S-5c` 第3段＝本体は `controller/offFieldActivateExec.ts`（I/O 注入）。
  const executeTrashActivated = async (
    cardNum: string, effect: import('../types/effects').CardEffect, costIndices: Set<number>,
    discardIndices: Set<number> = new Set(), exceedIndices: Set<number> = new Set(),
    trashExileIndices: Set<number> = new Set(), actorCtx?: OffFieldActor,
  ) => {
    if (!actorCtx && loading) return;
    await executeTrashActivatedImpl(cardNum, effect, costIndices, discardIndices, exceedIndices, trashExileIndices,
      actorCtx ?? humanOffFieldActor(), performCtx(), actorCtx ? undefined : { close: closeTrashActivated });
  };


  // v0.278: WX25-P2-001 付与【起】 ガードシグニ捨て→ルリグバリア
  const executeGuardBarrierAct = async (handIndex: number) => {
    if (loading) return;
    setLoading(true);
    closeGuardBarrierAct();
    try {
      const cardNum = my.hand[handIndex];
      const newHand = my.hand.filter((_, i) => i !== handIndex);
      const fzGBA = addBarrierTokens(my.field.free_zone, LRIG_BARRIER_CARD, 1);
      const paid: PlayerState = {
        ...my,
        hand: newHand,
        trash: [...my.trash, cardNum],
        ...handDiscardHistoryRecord(my, [cardNum]),
        field: { ...my.field, free_zone: fzGBA },
        actions_done: [...(my.actions_done ?? []), 'GUARD_BARRIER_ACT'],
      };
      const cardName = battleCardMap.get(cardNum)?.CardName ?? cardNum;
      appendBattleLogs([`【起】ガードシグニ（${cardName}）を捨て→ルリグバリア+1（計${countBarrierTokens(fzGBA, LRIG_BARRIER_CARD)}）`]);
      const stateKey = isHost ? 'host_state' : 'guest_state';
      await persist.commit(reduceBattle(bs, { type: 'WRITE_STATE', myKey: stateKey, myState: paid }));
    } finally {
      setLoading(false);
    }
  };

  // ON_ACCE トリガー: ATTACH_ACCE 完了後に自フィールドのシグニの ON_ACCE AUTO効果を発火
  // ⚠triggerScope で主語を絞る（既定 self）＝「**この**シグニに【アクセ】が付いたとき」（WXK05-066/067 等）は
  //   アクセが付いた当のシグニ（acceHostCardNum）でのみ発火する。従来は場の全シグニを無条件に走査していたため、
  //   別のシグニにアクセを付けただけで発火する過剰発火だった。'any_ally'/'any'＝「**あなたの**シグニ1体に
  //   【アクセ】が付いたとき」（WXK04-051/WXK05-064）は従来どおり自フィールド全体が反応する。
  const checkAndFireOnAcceTriggersForOwner = async (state: PlayerState, acceHostCardNum: string) => {
    const triggerEntries: StackEntry[] = [];
    // 🆕2026-08-31 続き748＝**いま付いた【アクセ】カード**（スタック末尾）。原文「**それが**レベル２以下の
    //   【アクセ】の場合」（`WXK05-065-E1`）を `TRIGGER_SOURCE_MATCHES` が読むためにトリガー元として運ぶ。
    const acceHostZoneIdx = state.field.signi.findIndex(sg => sg?.at(-1) === acceHostCardNum);
    const acceCardNum = acceHostZoneIdx >= 0 ? acceCardsAt(state.field, acceHostZoneIdx).at(-1) : undefined;
    const usedOncePerTurnIdsAcce: string[] = [];
    // 《ターン1回》《ターン2回》の使用制限（actions_done ＋ 本収集内で積んだ分の両方を数える）。
    const acceLimitOk = (eff: import('../types/effects').CardEffect): boolean => {
      const max = eff.usageLimit === 'once_per_turn' ? 1 : eff.usageLimit === 'twice_per_turn' ? 2 : Infinity;
      if (max === Infinity) return true;
      const used = (state.actions_done ?? []).filter(id => id === eff.effectId).length
        + usedOncePerTurnIdsAcce.filter(id => id === eff.effectId).length;
      if (used >= max) return false;
      usedOncePerTurnIdsAcce.push(eff.effectId);
      return true;
    };
    for (const stack of state.field.signi) {
      if (!stack?.length) continue;
      const topNum = stack[stack.length - 1];
      for (const eff of (effectsMap.get(topNum) ?? [])) {
        if (eff.effectType !== 'AUTO') continue;
        if (!eff.timing?.includes('ON_ACCE')) continue;
        const acceScope = eff.triggerScope ?? 'self';
        if (acceScope === 'self' && topNum !== acceHostCardNum) continue;
        if (eff.condition && !evalUseCondition(eff.condition, state, op, battleCardMap, topNum, bs.turn_phase, effectivePowers)) continue;
        if (!acceLimitOk(eff)) continue;
        const card = battleCardMap.get(topNum);
        triggerEntries.push({
          id: generateUUID(),
          playerId: user.id,
          cardNum: topNum,
          effectId: eff.effectId,
          label: `${card?.CardName ?? topNum}【自】${eff.timing?.[0] ?? 'ON_ACCE'}`,
          effect: eff,
          // 🆕2026-08-31 続き748＝**付いた【アクセ】そのもの**をトリガー元として運ぶ。
          //   原文「**それが**レベル２以下の【アクセ】の場合」（`WXK05-065-E1`）は `TRIGGER_SOURCE_MATCHES` が読む。
          triggeringCardNum: acceCardNum,
        });
      }
    }
    // ホストシグニ自体のON_ACCE効果は上記でキャッチされる
    // また「あなたのシグニ１体がアクセされたとき」系のWX15-059等

    // ON_ACCE_ATTACH（ルリグ）: 「あなたのシグニ１体に【アクセ】が付いたとき」（WXK04-003 オーバークロック）
    const myLrigAcce = state.field.lrig.at(-1);
    if (myLrigAcce) {
      for (const eff of (effectsMap.get(myLrigAcce) ?? [])) {
        if (eff.effectType !== 'AUTO' || !eff.timing?.includes('ON_ACCE_ATTACH')) continue;
        if (eff.usageLimit === 'once_per_turn' &&
            ((state.actions_done?.includes(eff.effectId)) || usedOncePerTurnIdsAcce.includes(eff.effectId))) continue;
        if (eff.usageLimit === 'once_per_turn') usedOncePerTurnIdsAcce.push(eff.effectId);
        triggerEntries.push({
          id: generateUUID(),
          playerId: user.id,
          cardNum: myLrigAcce,
          effectId: eff.effectId,
          label: `${battleCardMap.get(myLrigAcce)?.CardName ?? myLrigAcce}【自】アクセ装着時`,
          effect: eff,
        });
      }
    }
    // ON_ACCE_ATTACH（アクセカード自身）: 「このカードが【アクセ】としてシグニに付いたとき」（SPK01-11 ラズベリー）
    const hostZoneAcce = state.field.signi.findIndex(s => s?.at(-1) === acceHostCardNum);
    const attachedAcceNum = hostZoneAcce >= 0 ? acceCardsAt(state.field, hostZoneAcce).at(-1) : null;
    if (attachedAcceNum) {
      for (const eff of (effectsMap.get(attachedAcceNum) ?? [])) {
        if (eff.effectType !== 'AUTO' || !eff.timing?.includes('ON_ACCE_ATTACH')) continue;
        // host シグニのレベル/クラス条件（WXK05-041=Lv4以上／WX17-076-E2=Lv2以下／WX17-033-E4=＜調理＞）
        const acceTc = eff.triggerCondition;
        if (acceTc?.accedHostMinLevel || acceTc?.accedHostMaxLevel) {
          const hostLv = parseInt((battleCardMap.get(acceHostCardNum) ?? battleCardMap.get(getCardNum(acceHostCardNum)))?.Level ?? '0', 10);
          if (isNaN(hostLv)) continue;
          if (acceTc.accedHostMinLevel && hostLv < acceTc.accedHostMinLevel) continue;
          if (acceTc.accedHostMaxLevel && hostLv > acceTc.accedHostMaxLevel) continue;
        }
        if (acceTc?.accedHostStory) {
          const hostCls = battleCardMap.get(getCardNum(acceHostCardNum))?.CardClass ?? '';
          if (!hostCls.includes(acceTc.accedHostStory)) continue;
        }
        if (eff.usageLimit === 'once_per_turn' &&
            ((state.actions_done?.includes(eff.effectId)) || usedOncePerTurnIdsAcce.includes(eff.effectId))) continue;
        if (eff.usageLimit === 'once_per_turn') usedOncePerTurnIdsAcce.push(eff.effectId);
        triggerEntries.push({
          id: generateUUID(),
          playerId: user.id,
          cardNum: attachedAcceNum,
          effectId: eff.effectId,
          label: `${battleCardMap.get(attachedAcceNum)?.CardName ?? attachedAcceNum}【自】アクセ装着時`,
          effect: eff,
        });
      }
    }

    if (triggerEntries.length === 0) return;
    const stateToWrite = usedOncePerTurnIdsAcce.length > 0
      ? { ...state, actions_done: [...(state.actions_done ?? []), ...usedOncePerTurnIdsAcce] }
      : state;
    const stateKey = isHost ? 'host_state' : 'guest_state';
    const curStack = bs?.effect_stack ?? null;
    const turnPlayerId = bs.active_user_id ?? user.id;
    const newStack = curStack
      ? pushToStack(curStack, triggerEntries)
      : initStack(turnPlayerId, triggerEntries);
    await persist.commit(reduceBattle(bs, { type: 'WRITE_STATE', myKey: stateKey, myState: stateToWrite, effectStack: newStack }));
  };

  // シグニ出現時コスト付き【出】効果：発動
  // コスト付き任意【出】の連鎖: 残り効果があれば次のモーダルへ、なければDBに確定書き込み
  const finishOrChainSigniOnPlayCost = async (
    cardNum: string,
    placedState: PlayerState,
    entries: StackEntry[],
    remaining: import('../types/effects').CardEffect[] | undefined,
    placedZone?: number,
  ) => {
    if (remaining && remaining.length > 0) {
      setPendingSigniOnPlayCost({
        cardNum,
        costEffect: remaining[0],
        placedState,
        mandatoryEntries: entries,
        remainingCostEffects: remaining.slice(1),
        placedZone,
      });
      return;
    }
    const stateKey = isHost ? 'host_state' : 'guest_state';
    if (entries.length === 0) {
      await persist.commit(reduceBattle(bs, { type: 'WRITE_STATE', myKey: stateKey, myState: placedState }));
      return;
    }
    const turnPlayerId = bs.active_user_id ?? user.id;
    const existingStack = bs?.effect_stack ?? null;
    const newStack = existingStack
      ? pushToStack(existingStack, entries)
      : initStack(turnPlayerId, entries);
    await persist.commit(reduceBattle(bs, { type: 'WRITE_STATE', myKey: stateKey, myState: placedState, effectStack: newStack, clearPending: true }));
  };

  const executeSigniOnPlayCost = async (
    cardNum: string,
    costEffect: import('../types/effects').CardEffect,
    costIndices: Set<number>,
    discardIndices: Set<number>,
    placedState: PlayerState,
    mandatoryEntries: StackEntry[],
    energyTrashIndices: Set<number> = new Set(),
    remainingCostEffects?: import('../types/effects').CardEffect[],
    fieldTrashZones: Set<number> = new Set(),
    placedZone?: number,
    beatZones: Set<number> = new Set(),
    exceedIndices: Set<number> = new Set(),
    underTrashKeys: Set<string> = new Set(),
  ) => {
    if (loading) return;
    setLoading(true);
    closeSigniOnPlayCost();
    try {
      const cost = costEffect.cost;
      const selectedDiscardCards = [...discardIndices].map(i => battleCardMap.get(getCardNum(placedState.hand[i])));
      if (cost?.discardGroups && !canSatisfyDiscardGroups(selectedDiscardCards, cost.discardGroups)) return;
      // エナ消費はplacedState基準（チェーン2回目以降は前回の支払い結果を引き継ぐ）＝支払い元は funnel 1本（§6.4）
      const opcPool = placedState === my ? myEnergyPayPool : buildEnergyPayPool(placedState, energyPayCtx);
      const opcPay = planEnergyPayment(placedState, opcPool, costIndices, energyTrashIndices);
      const paidNums = [...opcPay.paidNums, ...opcPay.extraEnergyNums];
      // 手札コスト: discard（トラッシュ）/ handToEnergy（エナへ）/ handToUnderSelf（このシグニの下へ）で行き先が異なる
      const handPickedNums = [...discardIndices].map(i => placedState.hand[i]);
      const newHand = placedState.hand.filter((_, i) => !discardIndices.has(i));
      const isHandToEnergy = (cost?.handToEnergy?.count ?? 0) > 0;
      const isHandToUnder  = (cost?.handToUnderSelf?.count ?? 0) > 0;
      const discardNums = (isHandToEnergy || isHandToUnder) ? [] : handPickedNums;
      // 《コインアイコン》コスト（【出】《コイン》等）
      const coinCostOPC = cost?.coin ?? 0;
      if (coinCostOPC > 0 && (placedState.coins ?? 0) < coinCostOPC) return; // 支払い不能（UI側でも無効化済み）
      let paid: PlayerState = opcPay.applyTo({
        ...placedState,
        hand: newHand,
        // 🆕§5.3 `O-245`（2026-09-04）＝「**次に**【出】能力を発動する場合」の軽減は**1回で消費する**
        //   （`reduce_next_on_play_cost`・`WXK04-075-E1`）。⚠ここで消さないと**このターン中ずっと**
        //   軽減され続ける（原文より安い＝過剰実行）。減額そのものは `SigniOnPlayCostModal` が
        //   `applyNextOnPlayCostReduction` で行っている。
        reduce_next_on_play_cost: undefined,
        coins: Math.max(0, (placedState.coins ?? 0) - coinCostOPC),
        coins_paid_this_turn: (placedState.coins_paid_this_turn ?? 0) + coinCostOPC, // COINS_PAID_THIS_TURN
        // 🆕§5.3 `O-317`/`O-333`＝コイン技の発動台帳（【出】コストの《コイン》も能力の発動）。
        coin_abilities_used_this_turn: coinCostOPC > 0
          ? [...(placedState.coin_abilities_used_this_turn ?? []), ...coinLedger(costEffect)]
          : placedState.coin_abilities_used_this_turn,
        trash: [...placedState.trash, ...paidNums, ...discardNums],
        // 🔴**旧実装はこの経路だけ台帳を1つも書いていなかった**（`V-101`②で実機再現）＝
        //   `WXDi-CP02-055` は同じカードの【出】コストで＜ブルアカ＞を捨てて【自】が読むのに、
        //   `HAND_DISCARDED_THIS_TURN` が永久に false で無言 no-op だった。
        //   ⚠`discardNums` は `handToEnergy`/`handToUnder` のとき `[]` になる（＝捨てていない）ので、そのまま渡してよい。
        ...handDiscardHistoryRecord(placedState, discardNums),
        // handDiscardSigni コストで捨てたシグニのレベルを記録（COST_DISCARDED_SIGNI_LEVEL。WX25-P2-101「レベル１→代わりに－5000」）
        last_discarded_signi_level: discardNums.length > 0
          ? (() => { const lv = parseInt(battleCardMap.get(getCardNum(discardNums[0]))?.Level ?? '', 10); return isNaN(lv) ? placedState.last_discarded_signi_level : lv; })()
          : placedState.last_discarded_signi_level,
        // 🆕🔴**§5.3 `O-328`（2026-09-11）＝ここが `last_discarded_signi_class` を一度も書いていなかった。**
        //   `classMatchesDiscardSigni`（「この方法で捨てたシグニと共通するクラスを持つ」）を持つ live 5効果は
        //   **全部が【出】＝この支払い地点だけを通る**（`WXK10-023-E1`/`-029-E2`/`-033-E2`/`-038-E1`/`-056-E2`）。
        //   書かれないまま `resolveDiscardLevelFilter` が「参照不能＝制限なし」へ倒れていたので、
        //   **クラス制限が黙って消えた候補集合**（原文より広い＝過剰実行）になっていた。JSON も逆翻訳も正しく見える。
        //   ⚠レベル側と同じ規約＝**この支払いで捨てていれば1枚目で上書き、捨てていなければ据置**。
        last_discarded_signi_class: discardNums.length > 0
          ? (battleCardMap.get(getCardNum(discardNums[0]))?.CardClass ?? placedState.last_discarded_signi_class)
          : placedState.last_discarded_signi_class,
        // 「直前の能力コスト」の記録なので**この支払い分で上書き**する（ACTIVATED 経路 9626 と同じ規約）。
        // 従来は支払い前 state へ追記していたため前の能力のコストが残り、COST_TRASHED_MATCHES／
        // colorMatchesCostTrashed が古い支払いで誤成立しうる状態だった（§3タスク6 C で顕在化）。
        last_cost_trashed_cards: [...paidNums, ...discardNums],
        // 本体が「この方法で〜したカード」を参照する任意【出】（levelEqualsVar）の記録。
        // engine 経路（効果配置＝OPTIONAL_COST 支払い）は execEnergyCharge / execTrash が同じ値を書くが、
        // **通常召喚はここが唯一の支払い地点**なので同じ契約をこちらにも置く。書かないと本体の
        // 動的 filter が noMatch へ倒れて**効果が丸ごと no-op になる**（タスク12(xxix)(1) 第12波の検証で実測）。
        // 上と同じく**この支払い分で上書き**する（前の召喚の値を持ち越さない）。
        last_cost_hand_to_energy_level: isHandToEnergy && handPickedNums.length > 0
          ? (() => { const lv = parseInt(battleCardMap.get(getCardNum(handPickedNums.at(-1)!))?.Level ?? '', 10); return Number.isFinite(lv) ? lv : undefined; })()
          : undefined,
        // 色コスト（costIndices）は「トラッシュに置いたシグニ」ではないので energyTrashIndices だけを数える
        last_cost_energy_trash_level_sum: energyTrashIndices.size > 0
          ? [...energyTrashIndices].reduce((sum, i) => {
              const lv = parseInt(battleCardMap.get(getCardNum(placedState.energy[i]))?.Level ?? '', 10);
              return sum + (Number.isFinite(lv) ? lv : 0);
            }, 0)
          : undefined,
      });
      // handToEnergy コスト（手札→エナ）は funnel の控除**後**のエナに積む
      // 🆕§5.3 `O-321` 第275＝**コストとして**置かれた分（`cause:'cost'`）＝原文「コストか効果によって」の「コスト」側。
      if (isHandToEnergy) paid = recordEnergyPlacements({ ...paid, energy: [...paid.energy, ...handPickedNums] }, handPickedNums, 'cost');
      const payLogs: string[] = [];
      const underAnyCost = cost?.underAnySigniTrash;
      if (underAnyCost) {
        const underPaid = payUnderAnySigniTrash(paid, underTrashKeys, underAnyCost.count);
        if (!underPaid) return;
        paid = underPaid.state;
        paid = { ...paid, last_cost_trashed_cards: [...(paid.last_cost_trashed_cards ?? []), ...underPaid.moved] };
        payLogs.push(`シグニの下から${underPaid.moved.length}枚をコストでトラッシュ`);
      }
      const exceedCostOP = cost?.exceed ?? 0;
      if (exceedCostOP > 0) {
        const exceedPaid = paySelectedExceed(paid, exceedCostOP, exceedIndices);
        if (!exceedPaid) return;
        paid = exceedPaid;
        payLogs.push(`エクシード${exceedCostOP}を支払った`);
      }
      // handToUnderSelf: 出たシグニの下に置く
      if (isHandToUnder && handPickedNums.length > 0) {
        const selfZone = placedZone ?? paid.field.signi.findIndex(s => s?.at(-1) === cardNum);
        if (selfZone >= 0 && paid.field.signi[selfZone]) {
          const newSigniU = [...paid.field.signi] as (string[] | null)[];
          newSigniU[selfZone] = [...handPickedNums, ...(newSigniU[selfZone] ?? [])];
          paid = { ...paid, field: { ...paid.field, signi: newSigniU } };
          payLogs.push(`手札${handPickedNums.length}枚をシグニの下に置いた`);
        } else {
          // 行き先が見つからない場合はトラッシュへ（消失防止）
          paid = { ...paid, trash: [...paid.trash, ...handPickedNums] };
        }
      }
      // 🆕fieldToDeckTop: 場のシグニをコストで**デッキの一番上**へ（§5.3 `O-256`・`WDK05-T12-E1`）。
      // 🔴行き先が違うので下の `fieldTrash` ブロックへ落とさない（あちらはトラッシュ送り＝資源を失う）。
      const fieldToDeckTopCost = cost?.fieldToDeckTop;
      if (fieldToDeckTopCost) {
        const ftdPaid = payFieldToDeckTopCost({
          my: paid, zones: fieldTrashZones, cost: fieldToDeckTopCost, cardMap: battleCardMap,
        });
        if (!ftdPaid) { setLoading(false); return; } // 支払い不能（UI側でも無効化済み）
        paid = ftdPaid.state;
        payLogs.push(...ftdPaid.logs);
      }
      // fieldTrash / fieldToLrigTrash: 場のシグニを指定先へ（付属カードはルールどおりトラッシュへ）
      // ⚠支払いは `payFieldTrashCost` 1本（§5.3 `O-271` で funnel 化）。
      if (!fieldToDeckTopCost && fieldTrashZones.size > 0) {
        const ftPay = payFieldTrashCost({ state: paid, zones: fieldTrashZones, cost, cardMap: battleCardMap });
        paid = ftPay.state;
        if (ftPay.log) payLogs.push(ftPay.log);
      }
      // beat_signi: シグニを【ビート】にするコスト（beatZones=プレイヤー選択。空なら自動近似）
      if (beatSigniCostCount(cost?.beat_signi) > 0) {
        const beatPay = payBeatSigniCost(paid, cardNum, battleCardMap, cost!.beat_signi!, [...beatZones]);
        if (!beatPay.ok) { setLoading(false); return; } // 支払い不能（対象不足）
        paid = beatPay.state;
        payLogs.push(beatPay.log);
      }
      // 🆕`multiZoneExile`（意味照合 段2・`WXDi-P13-089-E3`）＝「手札とエナゾーンとトラッシュにある
      //   《X》を1枚**ずつ**ゲームから除外する」。⚠**自動支払い**（`filter` が `cardName` で一意なので
      //   どれを除外しても等価）＝選択UIは作らない。可否は `signiActivateGate` と**同じ関数**。
      if (cost?.multiZoneExile) {
        const mzPay = payMultiZoneExileCost(paid, cost.multiZoneExile, battleCardMap);
        if (!mzPay) { setLoading(false); return; } // 支払い不能（UI側でも非提示）
        paid = mzPay.state;
        payLogs.push(`${cost.multiZoneExile.zones.map(z => (z === 'hand' ? '手札' : z === 'energy' ? 'エナゾーン' : 'トラッシュ')).join('と')}から${mzPay.exiled.length}枚をゲームから除外（コスト）`);
      }
      // beat_signi_from_trash: トラッシュからシグニを【ビート】にするコスト（WDK14-013・自動選択近似）
      if ((cost?.beat_signi_from_trash?.count ?? 0) > 0) {
        const btPay = payBeatSigniFromTrashCost(
          paid, battleCardMap, cost!.beat_signi_from_trash!.count,
          cost!.beat_signi_from_trash!.filter, [...beatZones],
        );
        if (!btPay.ok) { setLoading(false); return; } // 支払い不能（トラッシュにシグニ不足）
        paid = btPay.state;
        payLogs.push(btPay.log);
      }
      // lrigDown: アップ状態のルリグをダウン（センター→アシストL→Rの順で自動支払い）
      const lrigDownCost = cost?.lrigDown;
      if (lrigDownCost) {
        const lrigPaid = payLrigDownCost(paid, lrigDownCost, battleCardMap);
        if (!lrigPaid) return; // 支払い不能（UI側でも無効化済み）
        paid = lrigPaid.state;
        payLogs.push(`ルリグ${lrigDownCost.count}体をコストでダウン`);
      }
      // lrigDownVariable: モーダルで選んだ0..N体を既存の共通支払い関数でダウンし、レベル合計を記録。
      const lrigDownVariable = cost?.lrigDownVariable;
      if (lrigDownVariable) {
        const count = signiOnPlayCharmTrashVar;
        if (count < lrigDownVariable.min) return;
        const lrigPaid = payLrigDownCost(paid, { count }, battleCardMap);
        if (!lrigPaid) return;
        // レベル合計・ダウンしたルリグの記録は payLrigDownCost が state に書く（呼び出し側で再計算しない
        // ＝支払い経路ごとに式がずれる事故を無くす。タスク12(cix)）。
        paid = lrigPaid.state;
        payLogs.push(`ルリグ${count}体（レベル合計${lrigPaid.levelSum}）をコストでダウン`);
      }
      // ライフコスト: クラッシュだけは check/pending に載せ、既存ライフバースト処理へ接続する。
      if ((cost?.lifeTrash ?? 0) + (cost?.life_crash ?? 0) + (cost?.lifeToHand ?? 0) > 0) {
        const lifePaid = payLifeOnPlayCost(paid, cost!);
        if (!lifePaid) return;
        paid = lifePaid.state;
        payLogs.push(...lifePaid.logs);
      }
      // deckTrash: デッキ上からN枚トラッシュ
      const deckTrashN = cost?.deckTrash ?? 0;
      if (deckTrashN > 0) {
        const movedD = paid.deck.slice(0, deckTrashN);
        paid = { ...paid, deck: paid.deck.slice(movedD.length), trash: [...paid.trash, ...movedD] };
        payLogs.push(`デッキ上${movedD.length}枚をコストでトラッシュ`);
      }
      // charmTrash: 自分の場のチャームN枚をトラッシュ（固定枚数・自動選択）
      const charmTrashN = cost?.charmTrash ?? 0;
      if (charmTrashN > 0) {
        const newCharmsC = [...(paid.field.signi_charms ?? [null, null, null])];
        const movedC: string[] = [];
        for (let zi = 0; zi < newCharmsC.length && movedC.length < charmTrashN; zi++) {
          if (newCharmsC[zi]) { movedC.push(newCharmsC[zi]!); newCharmsC[zi] = null; }
        }
        if (movedC.length < charmTrashN) return;
        paid = { ...paid, field: { ...paid.field, signi_charms: newCharmsC }, trash: [...paid.trash, ...movedC] };
        payLogs.push(`チャーム${movedC.length}枚をコストでトラッシュ`);
      }
      // charmTrashVariable: チャームを可変枚数トラッシュ（プレイヤーが選択した枚数）
      const charmVarOPCost = cost?.charmTrashVariable;
      if (charmVarOPCost) {
        const n = signiOnPlayCharmTrashVar;
        if (n < charmVarOPCost.min) return;
        if (n > 0) {
          const newCharmsOPV = [...(paid.field.signi_charms ?? [null, null, null])];
          const movedOPV: string[] = [];
          for (let zi = 0; zi < newCharmsOPV.length && movedOPV.length < n; zi++) {
            if (newCharmsOPV[zi]) { movedOPV.push(newCharmsOPV[zi]!); newCharmsOPV[zi] = null; }
          }
          if (movedOPV.length < n) return;
          paid = { ...paid, field: { ...paid.field, signi_charms: newCharmsOPV }, trash: [...paid.trash, ...movedOPV], last_charm_trash_count: n };
          payLogs.push(`チャーム${n}枚をコストでトラッシュ`);
        } else {
          paid = { ...paid, last_charm_trash_count: 0 };
        }
      }
      // trashArtsFromLrigDeck: ルリグデッキからアーツをトラッシュ
      // 🆕trashToDeckBottom: トラッシュから条件一致カードをデッキの一番下へ（§5.3 `O-201`・`WXDi-CP02-100-E1`）。
      // ⚠**除外（`trashExile`）ではない**＝デッキへ戻るので後で引ける。行き先を間違えると別のカードになる。
      const t2dCostPay = cost?.trashToDeckBottom;
      if (t2dCostPay) {
        if (selectedSigniOnPlayTrashToDeck.size !== t2dCostPay.count) return;
        const movedT2D = [...selectedSigniOnPlayTrashToDeck].map(i => placedState.trash[i]).filter(Boolean);
        if (movedT2D.length !== t2dCostPay.count) return;
        paid = {
          ...paid,
          trash: paid.trash.filter(n => !movedT2D.includes(n)),
          deck: [...paid.deck, ...movedT2D],
        };
        payLogs.push(`トラッシュから${movedT2D.length}枚をデッキの一番下に置いた`);
      }
      const artsTrashOPCost = cost?.trashArtsFromLrigDeck;
      if (artsTrashOPCost) {
        if (!selectedSigniOnPlayArtsTrash) return;
        paid = {
          ...paid,
          lrig_deck: paid.lrig_deck.filter(c => c !== selectedSigniOnPlayArtsTrash),
          lrig_trash: [...paid.lrig_trash, selectedSigniOnPlayArtsTrash],
        };
        payLogs.push(`ルリグデッキからアーツをトラッシュ`);
      }
      // removeOppVirus: 相手の場のウィルスN個を取り除く（左のゾーンから自動選択）
      const removeVirusN = cost?.removeOppVirus ?? 0;
      if (removeVirusN > 0) {
        const newOppVirus = [...(op.field.signi_virus ?? [0, 0, 0])];
        let removedV = 0;
        for (let zi = 0; zi < newOppVirus.length && removedV < removeVirusN; zi++) {
          while (newOppVirus[zi] > 0 && removedV < removeVirusN) { newOppVirus[zi]--; removedV++; }
        }
        if (removedV < removeVirusN) return;
        const oppKey = isHost ? 'guest_state' : 'host_state';
        const newOpState: PlayerState = { ...op, field: { ...op.field, signi_virus: newOppVirus } };
        await persist.commit(reduceBattle(bs, { type: 'WRITE_STATE', myKey: oppKey, myState: newOpState }));
        // ON_OPP_VIRUS_REMOVED/CHANGED検出用フラグ（コストによる除去も発火対象）
        paid = { ...paid, opp_virus_removed_just: true };
        payLogs.push(`相手の【ウィルス】${removedV}個をコストで取り除いた`);
      }
      if (payLogs.length > 0) appendBattleLogs(payLogs);
      const cName = battleCardMap.get(cardNum)?.CardName ?? cardNum;
      const costEntry: StackEntry = {
        id: generateUUID(),
        playerId: user.id,
        cardNum,
        effectId: costEffect.effectId,
        label: `${cName} の【出】効果`,
        effect: costEffect,
      };
      const allEntries = [...mandatoryEntries, costEntry];
      // ON_DISCARDED_AS_COST / ON_HAND_DISCARDED: 【出】コストで手札を捨てた場合のトリガー
      if (discardNums.length > 0) {
        const { entries: hdEntries, usedLimitIds } = collectHandDiscardTriggers(
          discardNums, paid, user.id, true,
          user.id === bs.host_id ? bs.guest_state : bs.host_state, user.id === bs.host_id ? bs.guest_id : bs.host_id, cardNum, undefined, undefined);
        allEntries.push(...hdEntries);
        if (usedLimitIds.length > 0) {
          paid = { ...paid, actions_done: [...(paid.actions_done ?? []), ...usedLimitIds] };
        }
      }
      // ON_COIN_PAID（C1 配線・シグニ【出】《コイン》）: コインを支払った場合に反応【自】を積む。
      if (coinCostOPC > 0) {
        const opcCoin = collectCoinPaidTriggers(user.id, paid, user.id === bs.host_id ? bs.guest_state : bs.host_state);
        allEntries.push(...opcCoin.entries);
        paid = applyCoinPaidUsed(paid, opcCoin); // 《ターン1回/2回》消化を永続化（続き106）
      }
      await finishOrChainSigniOnPlayCost(cardNum, paid, allEntries, remainingCostEffects, placedZone);
    } finally {
      setLoading(false);
    }
  };

  // シグニ出現時コスト付き【出】効果：スキップ（召喚はコミット）
  const skipSigniOnPlayCost = async (
    cardNum: string,
    placedState: PlayerState,
    mandatoryEntries: StackEntry[],
    remainingCostEffects?: import('../types/effects').CardEffect[],
    placedZone?: number,
  ) => {
    if (loading) return;
    setLoading(true);
    closeSigniOnPlayCost();
    try {
      await finishOrChainSigniOnPlayCost(cardNum, placedState, mandatoryEntries, remainingCostEffects, placedZone);
    } finally {
      setLoading(false);
    }
  };

  // 🆕§5.7 `S-5c` 第2段＝本体は `controller/performLrigActivated.ts`（I/O 注入）。ここは材料を渡すだけ。
  const performLrigActivated = (a0: Parameters<typeof performLrigActivatedImpl>[0], a1: Parameters<typeof performLrigActivatedImpl>[1], a2: Parameters<typeof performLrigActivatedImpl>[2]) => performLrigActivatedImpl(a0, a1, a2, performCtx());


  /** 人間UI（`LrigGrantedModal`）から呼ぶ薄いラッパー。本体は `performLrigActivated`。 */
  const executeLrigGranted = async (effect: import('../types/effects').CardEffect, costIndices: Set<number>, handDiscardIndices: Set<number> = new Set(), energyTrashIndices: Set<number> = new Set(), trashExileIndices: Set<number> = new Set(), fieldBanishZones: Set<number> = new Set(), exceedIndices: Set<number> = new Set(), trashArtsNums: string[] = []) => {
    if (loading) return;
    closeLrigGranted();
    // 🆕§5.7 `S-31` ② 第4段＝`trashArtsNums`（ルリグデッキから徴収するアーツ）も実行へ渡す。
    await performLrigActivated(effect, { costIndices, handDiscardIndices, energyTrashIndices, trashExileIndices, fieldBanishZones, exceedIndices, trashArtsNums }, {
      actor: my, opponent: op,
      actorId: user.id, actorKey: isHost ? 'host_state' : 'guest_state',
      energyPayPool: myEnergyPayPool,
    });
  };

  // シグニゾーンのカードアクション（エナチャージ / 起動 / アタック）
  const getMySigniZoneActions = (rawZoneIdx: number): CardAction[] => {
    if (!isMyTurn || loading) return [];
    const stack = my.field.signi[rawZoneIdx];

    if (bs.turn_phase === 'ENERGY') {
      const used    = my.actions_done?.includes('ENERGY') ?? false;
      const blocked = my.blocked_actions?.includes('ENERGY') ?? false;
      if (used || blocked) return [];
      if (!stack || stack.length === 0) return [];
      return [{ label: 'エナチャージ', color: C.accent, onClick: () => handleEnergyChargeFromSigni(rawZoneIdx) }];
    }

    // MAIN（メインフェイズ）と ATTACK_ARTS（自分のアタックフェイズ＝アーツステップ）の場シグニ【起】発動。
    // 《アタックフェイズアイコン》付き【起】（timing:['ATTACK_ARTS']）はアタックフェイズのみ、無印【起】（timing未指定/['MAIN']）はメインのみ。
    if (bs.turn_phase === 'MAIN' || bs.turn_phase === 'ATTACK_ARTS') {
      // 🆕**§5.3 `O-218`（2026-09-04）＝【シード】として置いたカードの【起】を提示する。**
      //   🔴engine（`SEED_BLOOM{seedTargetSelf}`）は完成済みで、欠けていたのは**入口だけ**だった
      //     ＝`field.signi_seeds` を読むのは cardMap のロード1箇所で、能力を surface するコードが無かった。
      //   ⚠**シグニの有無と独立**＝シードはシグニが居ないゾーンにも置ける（先に返さない）。
      const seedActions: CardAction[] = [];
      const seedNum = my.field.signi_seeds?.[rawZoneIdx] ?? null;
      if (seedNum) {
        for (const seedEff of listActivatableSeedEffects({
          my, op, zoneIndex: rawZoneIdx, phase: bs.turn_phase, isMyTurn,
          effectsMap, cardMap: battleCardMap, energyPool: myEnergyPayPool,
          effectivePowers, contBlockedSelf: contBlocked.forSelf,
        })) {
          const seedCostLabel = trashActivateCostLabels(seedEff, my, op).join('・');
          seedActions.push({
            label: `【起】この【シード】${seedCostLabel ? `（${seedCostLabel}）` : ''}`,
            color: '#44ff88',
            onClick: () => { openSigniActivated({ cardNum: seedNum, effect: seedEff }); },
          });
        }
      }
      if (!stack || stack.length === 0) return seedActions;
      const topNum = stack[stack.length - 1];
      // GATE: 【起】の発動可否は `signiActivateGate` に一本化（人間ボタン／CPU の候補フィルタと同じ関数）。
      const activatable = listActivatableSigniEffects({
        my, op, zoneIndex: rawZoneIdx, phase: bs.turn_phase, isMyTurn,
        effectsMap, cardMap: battleCardMap, effectivePowers, contBlockedSelf: contBlocked.forSelf,
      });
      if (activatable.length === 0) return seedActions;
      return [...seedActions, ...activatable.map(eff => {
        const energyTotal = (eff.cost?.energy ?? []).reduce((s, c) => s + c.count, 0);
        const costLabel = eff.cost
          ? [
              energyTotal > 0 ? `エナ${energyTotal}` : null,
              eff.cost.coin ? `コイン${eff.cost.coin}` : null,
              eff.cost.discard ? `手札${eff.cost.discard}枚トラッシュ` : null,
              // 🆕**`handDiscardSigni`（条件つき手札捨て）と `energyTrash`（エナ指定枚数）をラベルに出す**（§5.3 `O-46`）。
              //   ⚠出さないと ①プレイヤーにコストが見えない ②同名の【起】を撃ち分けられない（§4.4 罠8m）。
              eff.cost.handDiscardSigni ? `手札の${fmtHandDiscardSigniLabel(eff.cost.handDiscardSigni)}シグニ${eff.cost.handDiscardSigni.count}枚捨て` : null,
              eff.cost.energyTrash ? `エナ${eff.cost.energyTrash.count}枚トラッシュ` : null,
              eff.cost.discardAll ? '手札すべて捨て' : null,
              eff.cost.energyTrashAll ? 'エナすべトラッシュ' : null,
              eff.cost.discardVariable ? `手札${eff.cost.discardVariable.min}枚以上捨て` : null,
              eff.cost.down_self ? 'ダウン' : null,
              eff.cost.underSelfTrash ? `このシグニの下${eff.cost.underSelfTrash.count}枚トラッシュ` : null,
              // 🆕§5.3 `O-313`（2026-09-12）＝「付いているカードか下にあるカード」。
              //   🔴**ラベルに出さないと「コストなし」と表示される**＝プレイヤーに踏み倒しに見える（§4.4-8m）。
              eff.cost.attachedOrUnderTrash ? `付いているカード/下のカード${eff.cost.attachedOrUnderTrash.count}枚トラッシュ` : null,
              eff.cost.removeOppVirus ? `ウィルス${eff.cost.removeOppVirus}除去` : null,
              eff.cost.trash_self ? 'このシグニをトラッシュ' : null,
              eff.cost.bounceSelf ? 'このシグニを手札に戻す' : null,
              eff.cost.fieldExileSelf ? 'このシグニをゲームから除外' : null,
              eff.cost.trash_key ? 'このキーをルリグトラッシュ' : null,
              eff.cost.charmTrash ? `チャーム${eff.cost.charmTrash}枚トラッシュ` : null,
              eff.cost.acceTrash ? `アクセ${eff.cost.acceTrash}枚トラッシュ` : null,
              eff.cost.fieldTrash ? `場の${eff.cost.fieldTrash.excludeSelf ? '他の' : ''}シグニ${eff.cost.fieldTrash.count}体トラッシュ` : null,
              // ⚠**行き先はエナゾーン**なので「トラッシュ」と書き分ける（§5.3 `O-67`）。ラベルに出さないと
              //   ①プレイヤーにコストが見えない ②同名の【起】を2つ持つカードで撃ち分けられない（§4.4 罠8m）。
              eff.cost.fieldBanish ? `場の${eff.cost.fieldBanish.excludeSelf ? '他の' : ''}シグニ${eff.cost.fieldBanish.count}体バニッシュ` : null,
              // ⚠`excludeSelf`（「**他の**シグニ」）をラベルに出す＝`fieldTrash`／`fieldBanish` と同じ書き分け。
              //   出さないと ①プレイヤーに「自分は払わない」ことが見えない ②同名の【起】を撃ち分けられない（§4.4-8m）。
              eff.cost.fieldDown ? `場の${eff.cost.fieldDown.excludeSelf ? '他の' : ''}シグニ${eff.cost.fieldDown.count}体ダウン` : null,
              eff.cost.lrigDown ? fmtLrigDownCostLabel(eff.cost.lrigDown) : null,
            ].filter(Boolean).join('・') || 'コストなし'
          : 'コストなし';
        return {
          label: `【起】${costLabel}`,
          color: C.coin,
          onClick: () => { openSigniActivated({ cardNum: topNum, effect: eff }); },
        };
      })];
    }

    if (bs.turn_phase === 'ATTACK_SIGNI') {
      if (!stack || stack.length === 0) return []; // シグニなし
      // ⚠「すでにダウン」は **gate（`ALREADY_DOWN`）** が見る（§6.4 O-10）＝ここに写経すると
      //   【常】「このシグニはダウン状態でもアタックできる」の例外が人間側にだけ効かない。
      if (op.field.check) return []; // 相手のライフバースト処理待ち
      if (my.pending_signi_battle) return []; // 別シグニのアタック解決中は操作不可
      if (loading) return []; // 処理中は操作不可
      const topNum = stack[stack.length - 1];
      // GATE: アタック可否のルール判定は signiAttackGate に一本化する（人間ボタン／共通実行経路
      // performSigniAttack／CPU のアタック候補フィルタの3箇所が同じ関数を呼ぶ）。ここに条件を写経すると
      // 「人間には出ないが CPU は撃てる」型の軸ズレが必ず出る（続き404 で `cannotAttackSigni` がまさにそれだった）。
      if (!canSigniAttack({
        attacker: my, defender: op, attackerNum: topNum,
        effectsMap, cardMap: battleCardMap,
        contBlocked, effectivePowers, turnPhase: bs.turn_phase,
      })) return [];
      const signiAtkCost = (my.signi_attack_cost ?? 0)
        + (signiAttackColorlessCost({
            attacker: my, defender: op, attackerNum: topNum, effectsMap, cardMap: battleCardMap,
            contBlocked, effectivePowers,
          }) ?? 0);
      const fieldTrashAtkCost = attackFieldTrashCost(my, topNum);
      // 「手札をN枚捨てないかぎりアタックできない」（§6.4 O-3）＝ボタンにも解除コストを出す
      // （出さないと「押したら知らないモーダルが開く」になる）。
      const handTaxAtkCost = signiAttackBanHandDiscardCost(my, topNum, battleCardMap, effectivePowers.get(topNum));
      const atkCosts = [
        ...(signiAtkCost > 0 ? [`《無》×${signiAtkCost}`] : []),
        ...(fieldTrashAtkCost > 0 ? [`他のシグニ${fieldTrashAtkCost}体トラッシュ`] : []),
        ...(handTaxAtkCost > 0 ? [`手札${handTaxAtkCost}枚捨て`] : []),
      ];
      const atkLabel = atkCosts.length > 0 ? `アタック（${atkCosts.join('・')}）` : 'アタック';
      const actions: CardAction[] = [{ label: atkLabel, color: C.danger, onClick: () => handleSigniAttack(rawZoneIdx) }];
      // 【側面アタック】（G077等）: 正面の1つ隣の相手シグニゾーンにアタックできる。
      // 攻撃先は正面か側面を「選ぶ」（同時攻撃ではない）。空ゾーンは何も起きないため占有ゾーンのみ提示。
      const hasSideAttack = (dynamicKeywords.my[topNum] ?? []).includes('側面アタック')
        || (my.keyword_grants?.[topNum] ?? []).includes('側面アタック');
      if (hasSideAttack) {
        const frontOpZone = 2 - rawZoneIdx;
        // WX16-021: このターン、空ゾーンへの側面アタックが「正面扱い」でダメージになるなら空ゾーンも提示する。
        // ⚠解決側（resolvePendingSigniBattleFor）と**同じ関数**で判定すること。
        const emptyZoneDamages = sideAttackEmptyZoneDealsDamage(my, topNum, battleCardMap);
        for (const adj of [frontOpZone - 1, frontOpZone + 1]) {
          if (adj < 0 || adj > 2) continue;
          const adjTop = op.field.signi[adj]?.at(-1);
          if (!adjTop && !emptyZoneDamages) continue; // 空ゾーンは提示しない（アタックしても何も起こらない）
          const targetName = adjTop ? (battleCardMap.get(adjTop)?.CardName ?? adjTop) : '空きゾーン（ダメージ）';
          actions.push({ label: `側面アタック→${targetName}`, color: '#b5651d', onClick: () => handleSigniSideAttack(rawZoneIdx, adj) });
        }
      }
      // WXDi-P05-069: フリップアタック（ロビンフッド対象）
      const altFlip = collectAltAttackFlipSigni(my, effectsMap);
      if (altFlip && fieldTrashAtkCost === 0 && (battleCardMap.get(topNum)?.CardName ?? '').includes(altFlip.targetSigniName)) {
        const flipCandidates = [0, 1, 2].filter(zi => zi !== rawZoneIdx && (my.field.signi[zi]?.length ?? 0) > 0);
        if (flipCandidates.length > 0) {
          const flipZones = flipCandidates.slice(0, altFlip.maxFlip);
          actions.push({ label: `フリップアタック（${flipZones.length}体裏向き）`, color: '#7c9e30', onClick: () => handleFlipAttack(rawZoneIdx, flipZones) });
        }
      }
      return actions;
    }

    return [];
  };

  // ルリグゾーンのカードアクション（ルリグアタック）
  const getMyLrigFieldActions = (): CardAction[] => {
    if (!isMyTurn || loading) return [];
    if (my.field.lrig.length === 0) return [];

    // MAINフェイズ：センタールリグのACTIVATED能力 + 付与されたACTIVATED能力を表示
    if (bs.turn_phase === 'MAIN') {
      const lrigTopMA = my.field.lrig.at(-1) ?? '';
      const lrigActionsMA: CardAction[] = [];

      // センタールリグ本来のACTIVATED効果（SONG_FRAGMENT等）
      // ⚠**判定は `lrigActivateGate.listActivatableLrigEffects` 1本**（§8 `O-1` (c)）＝
      //   封じ／【絆起】／`costUnparsed`／ルリグデッキ除外／usageLimit／コイン／エクシード／
      //   `lrigDown`／《ダウン》／【歌のカケラ】／使用条件をそこで見る。CPU も同じ関数を呼ぶ。
      if (lrigTopMA) {
        for (const eff of listActivatableLrigEffects({
          my, op, phase: 'MAIN', effectsMap, cardMap: battleCardMap,
          blockedSelf: contBlocked.forSelf, effectivePowers,
        })) {
          const actMA = eff.action as import('../types/effects').StubAction;
          const isSongFrag = actMA?.type === 'STUB' && actMA.id === 'SONG_FRAGMENT';
          const energyTotalMA = (eff.cost?.energy ?? []).reduce((s, c) => s + c.count, 0);
          const exceedCostMA = eff.cost?.exceed ?? 0;
          const hdSigniMA = eff.cost?.handDiscardSigni;
          const dgMA = eff.cost?.discardGroups;
          const costPartsMA: string[] = [];
          if (exceedCostMA > 0) costPartsMA.push(`エクシード${exceedCostMA}${eff.cost?.exceedColors?.length ? `（${eff.cost.exceedColors.join('と')}のカード）` : ''}`);
          if (energyTotalMA > 0) costPartsMA.push(`エナ${energyTotalMA}`);
          if (eff.cost?.coin) costPartsMA.push(`コイン${eff.cost.coin}`);
          // §5.3 `O-292`＝コラボ（ライバートークン）。⚠同じルリグに【起】が並ぶので撃ち分けのためにラベルへ出す。
          if (eff.cost?.collab) costPartsMA.push(`コラボ${eff.cost.collab}`);
          if (hdSigniMA) costPartsMA.push(`手札${fmtHandDiscardSigniLabel(hdSigniMA)}シグニ×${hdSigniMA.count}`);
          if (dgMA) costPartsMA.push(`手札${dgMA.map(g => `${fmtDiscardFilterLabel(g.filter) || 'カード'}${g.count}枚`).join('と')}`);
          if (eff.cost?.discardAll) costPartsMA.push('手札すべて捨て');
          if (eff.cost?.energyTrashAll) costPartsMA.push('エナすべトラッシュ');
          if (eff.cost?.lrigDown) costPartsMA.push(fmtLrigDownCostLabel(eff.cost.lrigDown));
          if (eff.cost?.down_self) costPartsMA.push('このルリグをダウン');   // タスク12(cxxxi)
          // §5.3 `O-67`＝行き先はエナゾーン。⚠同名の【起】を2つ持つルリグ（`WX25-P1-022`）を撃ち分けるため
          //   ラベルに出す（出さないと両方「コストなし」に見える＝§4.4 罠8m）。
          if (eff.cost?.fieldBanish) costPartsMA.push(`場のシグニ${eff.cost.fieldBanish.count}体バニッシュ`);
          const lrigActLabel = isSongFrag ? '歌のカケラ' : (costPartsMA.join('・') || 'コストなし');
          lrigActionsMA.push({
            label: `【起】${lrigActLabel}`,
            color: isSongFrag ? '#cc66ff' : C.coin,
            onClick: () => {
              openLrigGranted({ sourceCardNum: lrigTopMA, effect: eff });
            },
          });
        }
      }

      // INHERIT_LRIG_TRASH_ABILITIES: ルリグトラッシュにあるルリグの起動能力を継承
      // ⚠**判定は `lrigActivateGate.listActivatableInheritedLrigEffects` 1本**（§6.4 O-1 (f)）＝
      //   継承元の能力喪失（§6.4 O-10・`WX12-023`）・継承済み印・コスト踏み倒しの全軸をそこで見る。
      //   🔴従来ここは手書きで、**継承済み印以外は何も見ていなかった**＝`costUnparsed`／コイン／
      //   エクシード／`lrigDown`／《ダウン》／使用条件を素通りして撃てた（センター本来の【起】との軸ズレ）。
      for (const eff of listActivatableInheritedLrigEffects({
        my, op, phase: 'MAIN', effectsMap, cardMap: battleCardMap,
        blockedSelf: contBlocked.forSelf, effectivePowers,
      })) {
        const energyCostILT = (eff.cost?.energy ?? []).reduce((s, c) => s + c.count, 0);
        const exceedILT = eff.cost?.exceed ?? 0;
        const costPartsILT: string[] = [];
        if (exceedILT > 0) costPartsILT.push(`エクシード${exceedILT}`);
        if (energyCostILT > 0) costPartsILT.push(`エナ${energyCostILT}`);
        if (eff.cost?.coin) costPartsILT.push(`コイン${eff.cost.coin}`);
        const costLabelILT = costPartsILT.join('・') || 'コストなし';
        // 継承元カード番号は id（`inherited_<番号>_<元 id>`）から復元する＝gate と綴りを二重に持たない。
        const srcTrashCn = eff.effectId.split('_')[1] ?? '';
        const trashLrigName = battleCardMap.get(srcTrashCn)?.CardName ?? srcTrashCn;
        lrigActionsMA.push({
          label: `【継承起】${costLabelILT}（${trashLrigName.slice(0, 6)}）`,
          color: '#9966cc',
          onClick: () => { openLrigGranted({ sourceCardNum: lrigTopMA, effect: eff }); },
        });
      }

      // 付与された ACTIVATED 能力
      // ⚠timing↔phase 照合と使用条件・once_per_game は**キー【起】経路と同じゲート**を通す（タスク12(l)）。
      //   従来ここは timing も condition も見ておらず、《アタックフェイズアイコン》専用の付与【起】が
      //   メインでも撃て、使用条件つき付与【起】が条件を無視して撃てた（付与スコープを構造化して
      //   キーの【起】群を GRANT_LRIG_ABILITY.abilities へ入れ子にした結果、この緩さが36枚に効くようになる）。
      const grantedActionsMA = listActivatableGrantedLrigEffects({
        my, op, phase: 'MAIN', effectsMap, cardMap: battleCardMap,
        blockedSelf: contBlocked.forSelf, effectivePowers,
      }, grantedMyLrigEffects)
        .map(eff => {
          const energyTotal = (eff.cost?.energy ?? []).reduce((s, c) => s + c.count, 0);
          const exceedCost = eff.cost?.exceed ?? 0;
          const costParts: string[] = [];
          // 🆕色指定を出す（§4.2「ラベルに出ないコストはプレイヤーにも見えない」）。
          if (exceedCost > 0) costParts.push(`エクシード${exceedCost}${eff.cost?.exceedColors?.length ? `（${eff.cost.exceedColors.join('と')}のカード）` : ''}`);
          if (energyTotal > 0) costParts.push(`エナ${energyTotal}`);
          if (eff.cost?.coin) costParts.push(`コイン${eff.cost.coin}`);
          if (eff.cost?.down_self) costParts.push('このルリグをダウン');   // タスク12(cxxxi)
          if (eff.cost?.fieldBanish) costParts.push(`場のシグニ${eff.cost.fieldBanish.count}体バニッシュ`); // §5.3 `O-67`
          const costLabel = costParts.join('・') || 'コストなし';
          return {
            label: `【起】${costLabel}`,
            color: C.coin,
            onClick: () => {
              openLrigGranted({ sourceCardNum: lrigTopMA, effect: eff });
            },
          };
        });

      // v0.278: WX25-P2-001 付与【起】（手札ガードシグニを捨てる→ルリグバリア）
      if (my.game_guard_barrier_act && !my.actions_done?.includes('GUARD_BARRIER_ACT') && !isActionBlocked('USE_ACT')) {
        const guardSigniInHand = my.hand.some(cn => canCardGuard(cn, my, battleCardMap, effectsMap));
        if (guardSigniInHand) {
          lrigActionsMA.push({
            label: '【起】ガードシグニ捨て→ルリグバリア',
            color: '#4db6e0',
            onClick: () => { openGuardBarrierAct(); },
          });
        }
      }

      return [...lrigActionsMA, ...grantedActionsMA];
    }

    // ATTACK_ARTSフェイズ（自分のアタックフェイズ）：《アタックフェイズアイコン》付きルリグ【起】（timing:['ATTACK_ARTS']）を表示。
    // MAIN分岐のSONG_FRAGMENT/継承/ガードバリア等のMAIN固有処理は対象外（timingがATTACK_ARTSの能力のみ）。
    if (bs.turn_phase === 'ATTACK_ARTS') {
      const lrigTopAA = my.field.lrig.at(-1) ?? '';
      const lrigActionsAA: CardAction[] = [];
      const buildCostLabelAA = (eff: import('../types/effects').CardEffect): string => {
        const energyTotal = (eff.cost?.energy ?? []).reduce((s, c) => s + c.count, 0);
        const exceedCost = eff.cost?.exceed ?? 0;
        const parts: string[] = [];
        if (exceedCost > 0) parts.push(`エクシード${exceedCost}${eff.cost?.exceedColors?.length ? `（${eff.cost.exceedColors.join('と')}のカード）` : ''}`);
        if (energyTotal > 0) parts.push(`エナ${energyTotal}`);
        if (eff.cost?.discardAll) parts.push('手札すべて捨て');
        if (eff.cost?.energyTrashAll) parts.push('エナすべトラッシュ');
        if (eff.cost?.down_self) parts.push('このルリグをダウン');   // タスク12(cxxxi)
        return parts.join('・') || 'コストなし';
      };
      // センタールリグ本来のACTIVATED効果（timing ATTACK_ARTS）
      // ⚠MAIN 窓と**同じ1本**を通す（§8 `O-1` (c)）＝従来この窓は【絆起】・【歌のカケラ】・
      //   `lrigDown`・使用条件を見ておらず、軸が食い違っていた。
      if (lrigTopAA) {
        for (const eff of listActivatableLrigEffects({
          my, op, phase: 'ATTACK_ARTS', effectsMap, cardMap: battleCardMap,
          blockedSelf: contBlocked.forSelf, effectivePowers,
        })) {
          lrigActionsAA.push({
            label: `【起】${buildCostLabelAA(eff)}`,
            color: C.coin,
            onClick: () => {
              openLrigGranted({ sourceCardNum: lrigTopAA, effect: eff });
            },
          });
        }
      }
      // 付与された ACTIVATED 能力（timing ATTACK_ARTS）
      // ⚠使用条件・once_per_game はキー【起】経路と同じゲートを通す（タスク12(l)。MAIN 分岐と同趣旨）。
      const grantedActionsAA = listActivatableGrantedLrigEffects({
        my, op, phase: 'ATTACK_ARTS', effectsMap, cardMap: battleCardMap,
        blockedSelf: contBlocked.forSelf, effectivePowers,
      }, grantedMyLrigEffects)
        .map(eff => ({
          label: `【起】${buildCostLabelAA(eff)}`,
          color: C.coin,
          onClick: () => {
            openLrigGranted({ sourceCardNum: lrigTopAA, effect: eff });
          },
        }));
      return [...lrigActionsAA, ...grantedActionsAA];
    }

    // ATTACK_LRIGフェイズ：ルリグアタック
    if (bs.turn_phase === 'ATTACK_LRIG') {
      // 🆕**§5.3 `O-236`（2026-09-04）＝門は2箇所ある。**
      //   🔴`performLrigAttack`（実行）だけ直しても**ここ（アクション一覧）が塞いだままだと
      //     「アタック」ボタンが1つも出ない**＝実機で0回になる（実測で踏んだ）。
      //   ⚠**同じ式を2箇所に書いたときの典型**（§5.1 の教訓「片方だけ直すと全ゲート緑のまま
      //     実際に使われる経路にだけ実装が無い」）。
      //   🆕**§5.3 `O-366`（2026-09-14）＝その2箇所を `centerLrigAttackBlock` の1本に統合した。**
      if (centerLrigAttackBlock(my) !== null) return []; // ダウン中／付与された上限に達した
      if (op.field.lrig_attacked) return []; // ガード応答待ち
      const lrigTopALK = my.field.lrig.at(-1);
      const driveCanAttack = !!(lrigTopALK && (effectsMap.get(lrigTopALK) ?? []).some(e =>
        e.effectType === 'CONTINUOUS' &&
        (e.action as import('../types/effects').StubAction).type === 'STUB' &&
        (e.action as import('../types/effects').StubAction).id === 'ALLOW_ATTACK_WHILE_DRIVE',
      ));
      if ((my.lrig_riding_signi?.length ?? 0) > 0 && !driveCanAttack) return [{ label: 'ドライブ中（攻撃不可）', color: C.textDim, onClick: () => {} }];
      // 《無》の前払い（§6.4 O-28）＝`performLrigAttack` と**同じ関数**で判定する。
      // ⚠押せるのに無反応（O-18）にしない＝払えないことをボタンに出す。
      const lrigCostALK = lrigAttackCostInfo(my, op, lrigTopALK);
      // 🆕解除コストの表示は軸ごとに出す（§5.3 `O-222` で「シグニN体」を追加）。
      const lrigCostLabelALK = [
        lrigCostALK.colorless > 0 ? `《無》×${lrigCostALK.colorless}` : '',
        lrigCostALK.fieldTrash > 0 ? `シグニ${lrigCostALK.fieldTrash}体` : '',
      ].filter(Boolean).join('＋');
      if (lrigCostALK.blocked) {
        return [{ label: lrigCostLabelALK ? `アタック不可（${lrigCostLabelALK}）` : 'アタック不可', color: C.textDim, onClick: () => {} }];
      }
      return [{
        label: lrigCostLabelALK ? `アタック（${lrigCostLabelALK}）` : 'アタック',
        color: C.danger, onClick: () => { void handleLrigAttack('center'); },
      }];
    }

    return [];
  };

  // ── キーピース フィールドアクション ──
  const getKeyPieceActions = (): CardAction[] => {
    if (!isMyTurn || loading || !my.field.key_piece) return [];
    const phase = bs.turn_phase;
    const allKeyNums = [my.field.key_piece, ...(my.field.key_piece_extra ?? [])];
    const result: CardAction[] = [];
    for (const keyNum of allKeyNums) {
      const effects = effectsMap.get(keyNum) ?? [];
      const activatable = effects.filter(e =>
        e.effectType === 'ACTIVATED' &&
        // 🔴`costUnparsed`＝**原文のコストを表現できなかった**印（§6.4 O-11・続き532）。
        //   提示すると**コストを踏み倒して撃てる**ので、トリガー収集（`triggerCollect`）と同じく提示しない。
        !e.costUnparsed &&
        canPayExileLrigFromLrigDeck(e) &&
        canPayTrashArtsFromLrigDeck(e) &&
        !(e.usageLimit === 'once_per_turn' && (my.actions_done ?? []).includes(e.effectId)) &&
        !(e.usageLimit === 'twice_per_turn' && (my.actions_done ?? []).filter(id => id === e.effectId).length >= 2) &&
        !(my.blocked_actions?.includes(e.effectId)) &&
        !isActionBlocked('USE_ACT') &&
        (phase === 'MAIN' || phase === 'ATTACK_ARTS' || phase === 'ATTACK_ARTS_OP' || phase === 'ATTACK_SIGNI' || phase === 'ATTACK_LRIG') &&
        // timing↔phase 照合（(li)）＝MAIN専用はメインのみ／《アタックフェイズアイコン》専用はアタックフェイズのみ surface する
        keyActivatedTimingMatchesPhase(e.timing, phase) &&
        (!e.condition || evalUseCondition(e.condition, my, op, battleCardMap, keyNum, phase, effectivePowers)),
      );
      for (const eff of activatable) {
        const energyTotal = (eff.cost?.energy ?? []).reduce((s, c) => s + c.count, 0);
        const costLabel = eff.cost
          ? [
              energyTotal > 0 ? `エナ${energyTotal}` : null,
              eff.cost.discard ? `手札${eff.cost.discard}枚` : null,
              eff.cost.coin ? `《コイン》×${eff.cost.coin}` : null,
              eff.cost.trash_key ? 'このキーをルリグトラッシュ' : null,
              // 🆕全捨てコスト（§5.3 `O-46`＝`WXK04-025-CB-E2`）。支払いは `executeKeyActivated`。
              eff.cost.energyTrashAll ? 'エナすべてトラッシュ' : null,
              eff.cost.discardAll ? '手札すべて捨て' : null,
              // 🆕§5.3 `O-68`②＝ルリグデッキのアーツ徴収（支払いは `executeKeyActivated`＋`KeyActivatedModal`）。
              eff.cost.trashArtsFromLrigDeck ? `アーツ${eff.cost.trashArtsFromLrigDeck.count}枚をルリグトラッシュ` : null,
            ].filter(Boolean).join('・') || 'コストなし'
          : 'コストなし';
        const cardName = battleCardMap.get(keyNum)?.CardName ?? keyNum;
        result.push({
          label: `【起】${costLabel}（${cardName}）`,
          color: C.coin,
          onClick: () => { openKeyActivated({ cardNum: keyNum, effect: eff }); },
        });
      }
    }
    return result;
  };

  // ── アシストルリグ フィールドアクション ──
  const getAssistActions = (side: 'l' | 'r'): CardAction[] => {
    const stack = (side === 'l' ? my.field.assist_lrig_l : my.field.assist_lrig_r) ?? [];
    if (stack.length === 0) return [];
    const topNum = stack[stack.length - 1];
    const phase = bs.turn_phase;
    const actions: CardAction[] = [];

    // グロウ（自ターン or 相手アタックフェイズ）
    const growCands = getAssistGrowCandidates(side);
    if (!loading && growCands.length > 0) {
      actions.push({
        label: 'グロウ',
        color: '#6644aa',
        onClick: () => {
          openAssistGrow(side);
        },
      });
    }

    // アシストルリグのアタック（`ASSIST_LRIG_ATTACK_THIS_TURN` が立っているターンだけ・§6.4 A群/続き427）。
    // ⚠可否判定は `assistLrigAttackableSlots` の1本に寄せる（CPU・フェイズ進行と同じ軸）。
    if (isMyTurn && !loading && phase === 'ATTACK_LRIG' && !my.pending_lrig_attack && !op.field.lrig_attacked
        && assistLrigAttackableSlots(my, battleCardMap).includes(side === 'l' ? 'assist_l' : 'assist_r')) {
      actions.push({
        label: 'アタック',
        color: C.danger,
        // 🆕**解除コストの支払いUI を通す**（§5.3 `O-222`）＝センターと同じ入口へ寄せる
        //   （直接 `performLrigAttack` を呼ぶと、どのシグニを置くか選べないまま自動選択になる）。
        onClick: () => { void handleLrigAttack(side === 'l' ? 'assist_l' : 'assist_r'); },
      });
    }

    // 起動効果（自ターンのみ）
    if (isMyTurn && !loading) {
      const effects = effectsMap.get(topNum) ?? [];
      const activatable = effects.filter(e =>
        e.effectType === 'ACTIVATED' &&
        // 🔴`costUnparsed`＝**原文のコストを表現できなかった**印（§6.4 O-11・続き532）。
        //   提示すると**コストを踏み倒して撃てる**ので、トリガー収集（`triggerCollect`）と同じく提示しない。
        !e.costUnparsed &&
        canPayExileLrigFromLrigDeck(e) &&
        !(e.usageLimit === 'once_per_turn' && (my.actions_done ?? []).includes(e.effectId)) &&
        !(e.usageLimit === 'twice_per_turn' && (my.actions_done ?? []).filter(id => id === e.effectId).length >= 2) &&
        !(my.blocked_actions?.includes(e.effectId)) &&
        !isLrigActBlocked() &&
        (phase === 'MAIN' || phase === 'ATTACK_ARTS' || phase === 'ATTACK_ARTS_OP') &&
        (!e.condition || evalUseCondition(e.condition, my, op, battleCardMap, topNum, phase, effectivePowers)),
      );
      activatable.forEach(eff => {
        const energyTotal = (eff.cost?.energy ?? []).reduce((s, c) => s + c.count, 0);
        const costLabel = eff.cost
          ? [energyTotal > 0 ? `エナ${energyTotal}` : null, eff.cost.down_self ? 'ダウン' : null]
              .filter(Boolean).join('・') || 'コストなし'
          : 'コストなし';
        actions.push({
          label: `【起】${costLabel}`,
          color: C.coin,
          onClick: () => { openAssistActivated({ cardNum: topNum, effect: eff }); },
        });
      });
    }

    return actions;
  };

  // フリーゾーンのカードアクション
  const getMyFreeZoneActions = (cardNum: string): CardAction[] => {
    if (!isMyTurn || loading) return [];
    const actions: CardAction[] = [];
    actions.push({
      label: '手札に戻す',
      color: C.textSub,
      onClick: async () => {
        const newFreeZone = (my.field.free_zone ?? []).filter(n => n !== cardNum);
        const newGrants = { ...(my.keyword_grants ?? {}) };
        delete newGrants[cardNum];
        const newMy: typeof my = {
          ...my,
          hand: [...my.hand, cardNum],
          keyword_grants: newGrants,
          field: { ...my.field, free_zone: newFreeZone },
        };
        const stateKey = isHost ? 'host_state' : 'guest_state';
        await persist.commit(reduceBattle(bs, { type: 'WRITE_STATE', myKey: stateKey, myState: newMy }));
        setCloseZoneSignal(s => s + 1);
      },
    });
    actions.push({
      label: 'トラッシュへ',
      color: C.danger,
      onClick: async () => {
        const newFreeZone = (my.field.free_zone ?? []).filter(n => n !== cardNum);
        const newGrants = { ...(my.keyword_grants ?? {}) };
        delete newGrants[cardNum];
        const newMy: typeof my = {
          ...my,
          trash: [...my.trash, cardNum],
          keyword_grants: newGrants,
          field: { ...my.field, free_zone: newFreeZone },
        };
        const stateKey = isHost ? 'host_state' : 'guest_state';
        await persist.commit(reduceBattle(bs, { type: 'WRITE_STATE', myKey: stateKey, myState: newMy }));
        setCloseZoneSignal(s => s + 1);
      },
    });
    return actions;
  };

  // 勝敗確定後の終了確認（両者が押したらルーム削除）
  const handleEndAck = async () => {
    if (loading || !bs) return;
    setLoading(true);
    // 🔴CPU 戦は **CPU の分も同時に押す**（2026-09-17・ユーザー報告「CPU が対戦終了を押さず、ずっと終了待機中」）。
    //   CPU の確認は決着の瞬間に1回だけ書かれる＝その書き込みが失敗すると再試行されず、人間は永久に待っていた
    //   （実機 `cpuAckWriteLostStillEnds` で再現＝書き込みを1回落とすだけで止まる）。CPU の確認を待つ意味は無い。
    await persist.commit(reduceBattle(bs, { type: 'ACK_END', isHost, cpuBattle: isCpuBattle }));
    // 最新状態を取得して両者が押したか確認
    const { data } = await supabase
      .from('battle_states')
      .select('host_end_ack, guest_end_ack')
      .eq('room_id', roomId)
      .single();
    if (data?.host_end_ack && data?.guest_end_ack) {
      leavingRef.current = true;
      await persist.remove();
      await supabase.from('rooms').delete().eq('id', roomId);
      onBack();
      return;
    }
    setLoading(false);
  };

  // 対戦終了（ルーム削除）
  const handleEnd = async () => {
    leavingRef.current = true;
    setLoading(true);
    await persist.remove();
    await supabase.from('rooms').delete().eq('id', roomId);
    setLoading(false);
    setShowEndConfirm(false);
    onBack();
  };

  const modalCtx: BattleModalCtx = { bs, user, my, op, isMyTurn, loading, battleCards, battleCardMap, effectsMap, myEnaAllMulti, myEnaMultiStripped, myColorlessOverrides, myColorSubs, pickLongPressTimer, setExpandedPickImgUrl, activeCostMods, myEnergyExtraColors, myEnergyPayPool, myEnergyTrashSubInfo, myWholeEnergySubstitutes, myLrigNameAliases, myArtsThresholdReductions, isActionBlocked, specificCardCostReductions, myArtsPayerCtx };

  return (
    <div style={{ height: '100vh', backgroundColor: C.bgApp, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {/* 勝敗確定ポップアップ */}
      <FinishedPopup ctx={modalCtx} isHost={isHost} handleEndAck={handleEndAck} />

      {/* 終了確認モーダル */}
      <EndConfirmModal ctx={modalCtx} showEndConfirm={showEndConfirm} setShowEndConfirm={setShowEndConfirm} handleEnd={handleEnd} />

      {/* グロウ選択モーダル */}
      <GrowModal ctx={modalCtx} showGrowModal={showGrowModal} setShowGrowModal={setShowGrowModal} pendingGrowCard={pendingGrowCard} setPendingGrowCard={setPendingGrowCard} selectedGrowCost={selectedGrowCost} setSelectedGrowCost={setSelectedGrowCost} freeGrowFilter={freeGrowFilter} setFreeGrowFilter={setFreeGrowFilter} growCandidates={growCandidates} currentLrigLevel={currentLrigLevel} executeGrow={executeGrow} toggleGrowCostCard={toggleGrowCost} growPayDiscard={growPayDiscard} toggleGrowPayDiscard={toggleGrowPayDiscard} />

      {/* アーツ使用モーダル */}
      <ArtsModal ctx={modalCtx} showArtsModal={showArtsModal} setShowArtsModal={setShowArtsModal} pendingArtsCard={pendingArtsCard} setPendingArtsCard={setPendingArtsCard} pendingArtsEffectiveCost={pendingArtsEffectiveCost} setPendingArtsEffectiveCost={setPendingArtsEffectiveCost} selectedArtsCost={selectedArtsCost} setSelectedArtsCost={setSelectedArtsCost} selectedArtsDiscard={selectedArtsDiscard} setSelectedArtsDiscard={setSelectedArtsDiscard} selectedArtsUseCostPay={selectedArtsUseCostPay} setSelectedArtsUseCostPay={setSelectedArtsUseCostPay} declaredArtsChooseCount={declaredArtsChooseCount} setDeclaredArtsChooseCount={setDeclaredArtsChooseCount} betAmount={betAmount} setBetAmount={setBetAmount} isBoosting={isBoosting} setIsBoosting={setIsBoosting} isEncore={isEncore} setIsEncore={setIsEncore} keySubstituteEnabled={keySubstituteEnabled} setKeySubstituteEnabled={setKeySubstituteEnabled} executeArts={executeArts} toggleArtsCostCard={toggleArtsCost} />

      {/* スペル発動コスト選択 */}
      <SpellCastModal ctx={modalCtx} pendingSpellCast={pendingSpellCast} setPendingSpellCast={setPendingSpellCast} selectedSpellCost={selectedSpellCost} setSelectedSpellCost={setSelectedSpellCost} selectedSpellDiscard={selectedSpellDiscard} setSelectedSpellDiscard={setSelectedSpellDiscard} selectedSpellUseCostPay={selectedSpellUseCostPay} setSelectedSpellUseCostPay={setSelectedSpellUseCostPay} betAmount={betAmount} setBetAmount={setBetAmount} toggleSpellCostCard={toggleSpellCost} castSpell={castSpell} />

      {/* v0.277: 手札から発動する【起】コスト選択 */}
      <HandActivatedModal ctx={modalCtx} pendingHandActivated={pendingHandActivated} setPendingHandActivated={setPendingHandActivated} selectedHandActivatedCost={selectedHandActivatedCost} setSelectedHandActivatedCost={setSelectedHandActivatedCost} executeHandActivated={executeHandActivated} />

      {/* トラッシュ自己起動【起】（「このシグニをトラッシュから場に出す」等）のエナコスト支払い */}
      <TrashActivatedModal ctx={modalCtx} pendingTrashActivated={pendingTrashActivated} setPendingTrashActivated={setPendingTrashActivated} selectedTrashActivatedCost={selectedTrashActivatedCost} setSelectedTrashActivatedCost={setSelectedTrashActivatedCost} selectedTrashActivatedDiscard={selectedTrashActivatedDiscard} setSelectedTrashActivatedDiscard={setSelectedTrashActivatedDiscard} selectedTrashActivatedExceed={selectedTrashActivatedExceed} setSelectedTrashActivatedExceed={setSelectedTrashActivatedExceed} selectedTrashActivatedTrashExile={selectedTrashActivatedTrashExile} setSelectedTrashActivatedTrashExile={setSelectedTrashActivatedTrashExile} executeTrashActivated={executeTrashActivated} />

      {/* v0.278: WX25-P2-001 付与【起】 ガードシグニ捨て→ルリグバリア */}
      <GuardBarrierActModal ctx={modalCtx} pendingGuardBarrierAct={pendingGuardBarrierAct} setPendingGuardBarrierAct={setPendingGuardBarrierAct} selectedBarrierGuardCard={selectedBarrierGuardCard} setSelectedBarrierGuardCard={setSelectedBarrierGuardCard} executeGuardBarrierAct={executeGuardBarrierAct} />

      {/* G154 BURST: アタック無効化の「手札N枚捨て」回避モーダル */}
      <NegateEscapeModal ctx={modalCtx} negateEscape={negateEscape} selectedNegateEscape={selectedNegateEscape} setSelectedNegateEscape={setSelectedNegateEscape} resolveNegateEscapeDiscard={resolveNegateEscapeDiscard} resolveNegateEscapeAccept={resolveNegateEscapeAccept} />

      {/* 解除コストつきアタック制限：「他のシグニ」を選んで場からトラッシュ */}
      <AttackFieldTrashCostModal ctx={modalCtx} payment={attackFieldTrashPayment}
        selectedZones={selectedAttackFieldTrashZones} setSelectedZones={setSelectedAttackFieldTrashZones}
        onPay={resolveAttackFieldTrashPayment} onCancel={closeAttackFieldTrashPayment} />

      {/* 解除コストつきアタック制限（手札版・§6.4 O-3）：「手札をN枚捨てないかぎりアタックできない」 */}
      <AttackHandDiscardCostModal ctx={modalCtx} payment={attackHandDiscardPayment}
        selected={selectedAttackHandDiscard} setSelected={setSelectedAttackHandDiscard}
        onPay={resolveAttackHandDiscardPayment} onCancel={closeAttackHandDiscardPayment} />

      {/* スペルカットイン カード拡大＋スペル発動待機中（発動側） */}
      <SpellCutinOverlays ctx={modalCtx} cutinSpellZoomed={cutinSpellZoomed} setCutinSpellZoomed={setCutinSpellZoomed} />

      {/* スペルカットインポップアップ（相手のスペル発動中に表示） */}
      <CutinModal ctx={modalCtx} pendingCutinCard={pendingCutinCard} setPendingCutinCard={setPendingCutinCard} selectedCutinCost={selectedCutinCost} setSelectedCutinCost={setSelectedCutinCost} selectedCutinExceed={selectedCutinExceed} setSelectedCutinExceed={setSelectedCutinExceed} selectedCutinUnderTrash={selectedCutinUnderTrash} setSelectedCutinUnderTrash={setSelectedCutinUnderTrash} cutinBetAmount={cutinBetAmount} setCutinBetAmount={setCutinBetAmount} setCutinSpellZoomed={setCutinSpellZoomed} cutinCandidates={cutinCandidates} handleCutinPass={handleCutinPass} handleCutinUse={handleCutinUse} handleResonaCutinSelect={candidate => {
        if (candidate.kind !== 'resona') return;
        setPendingCutinCard(null);
        setSelectedResonaPayment([]);
        setPendingResonaSummon(candidate.resona);
      }} toggleCutinCostCard={toggleCutinCost} />

      {/* フェイズ進行の小型確認ダイアログ群（エナチャージ/グロウ/UPKEEP/シグニアタック/強制攻撃警告/リムーブ封じ/ルリグアタック） */}
      <PhaseConfirmDialogs ctx={modalCtx} showEnergySkipConfirm={showEnergySkipConfirm} setShowEnergySkipConfirm={setShowEnergySkipConfirm} showGrowSkipConfirm={showGrowSkipConfirm} setShowGrowSkipConfirm={setShowGrowSkipConfirm} showUpkeepPayConfirm={showUpkeepPayConfirm} showSigniAttackSkipConfirm={showSigniAttackSkipConfirm} setShowSigniAttackSkipConfirm={setShowSigniAttackSkipConfirm} showMustAttackWarning={showMustAttackWarning} setShowMustAttackWarning={setShowMustAttackWarning} showRemoveBlockedWarn={showRemoveBlockedWarn} setShowRemoveBlockedWarn={setShowRemoveBlockedWarn} showLrigAttackSkipConfirm={showLrigAttackSkipConfirm} setShowLrigAttackSkipConfirm={setShowLrigAttackSkipConfirm} growCandidates={growCandidates} doPhaseAdvance={doPhaseAdvance} handleUpkeepPay={handleUpkeepPay} handleUpkeepDecline={handleUpkeepDecline} />

      {/* エンドフェイズ：手札上限超過時の捨て選択 */}
      <EndDiscardModal ctx={modalCtx} pendingEndDiscard={pendingEndDiscard} selectedEndDiscard={selectedEndDiscard} setSelectedEndDiscard={setSelectedEndDiscard} confirmEndDiscard={confirmEndDiscard} />

      {/* F-3 身代わりバニッシュ選択（防御側＝自分のシグニがバニッシュされる場合の任意置換） */}
      <BanishSubstituteModal ctx={modalCtx} handleBanishSubstituteChoice={handleBanishSubstituteChoice} />
      <LifeCrashReplaceModal ctx={modalCtx} handleLifeCrashReplaceChoice={handleLifeCrashReplaceChoice} />

      {/* ライフバースト確認＋カード拡大＋相手クラッシュ確認 */}
      <LifeBurstCheckModal ctx={modalCtx} eichiSuppressActive={eichiSuppressActive} crashSourceSuppressActive={crashSourceSuppressActive} matchesAllZoneBurstGrant={matchesAllZoneBurstGrant} burstCardZoomed={burstCardZoomed} setBurstCardZoomed={setBurstCardZoomed} opCheckCardZoomed={opCheckCardZoomed} setOpCheckCardZoomed={setOpCheckCardZoomed} handleLifeBurstResponse={handleLifeBurstResponse} />

      {/* ガード応答ダイアログ（自分が攻撃されたとき・バースト処理中は非表示） */}
      <GuardResponseDialog ctx={modalCtx} contBlocked={contBlocked} myHandGuardClasses={myHandGuardClasses} isHost={isHost} performGuardResponse={performGuardResponse} handleGuardResponse={handleGuardResponse} handleGuardWithEnergyAlternative={handleGuardWithEnergyAlternative} handleGuardWithClassHandAlternative={handleGuardWithClassHandAlternative} handleGuardWithHandAlternative={handleGuardWithHandAlternative} handleGuardWithCollabAlternative={handleGuardWithCollabAlternative} handleGuardWithEnergyAndGuardCard={handleGuardWithEnergyAndGuardCard} />

      {/* リムーブ選択モーダル */}
      <LimitExcessModal ctx={modalCtx} plan={limitExcessAsk} onPick={handleLimitExcessPick} />
      <RemoveZoneModal ctx={modalCtx} showRemoveModal={showRemoveModal} setShowRemoveModal={setShowRemoveModal} selectedRemoveZones={selectedRemoveZones} toggleRemoveZone={toggleRemoveZone} handleRemove={handleRemove} />

      {/* シグニ召喚ゾーン選択 */}
      <SigniSummonZoneModal ctx={modalCtx} pendingSigniSummon={pendingSigniSummon} setPendingSigniSummon={setPendingSigniSummon} fieldSigniTotal={fieldSigniTotal} lrigLimit={lrigLimit} handleSummonSigni={handleSummonSigni} />
      <ResonaSummonModal
        ctx={modalCtx}
        pending={pendingResonaSummon}
        selected={selectedResonaPayment}
        setSelected={setSelectedResonaPayment}
        close={() => { setPendingResonaSummon(null); setSelectedResonaPayment([]); }}
        fieldSigniTotal={fieldSigniTotal}
        lrigLimit={lrigLimit}
        zIndex={bs.pending_spell && bs.pending_spell.caster_id !== user.id ? 4100 : undefined}
        execute={zoneIndex => {
          if (!pendingResonaSummon) return;
          void handleSummonSigni(-1, zoneIndex, {
            candidate: pendingResonaSummon,
            selection: { items: selectedResonaPayment },
          });
        }}
      />

      {/* 強制攻撃バナー */}
      {isMyTurn && myForcedAttack.forced && bs.turn_phase === 'ATTACK_SIGNI' && (
        <div style={{ flexShrink: 0, backgroundColor: '#7a1a1a', padding: '4px 12px',
          fontSize: 11, color: '#ffaaaa', textAlign: 'center' }}>
          ⚠ あなたのシグニは可能ならばアタックしなければなりません
        </div>
      )}
      {!isMyTurn && opForcedAttack.forced && bs.turn_phase === 'ATTACK_SIGNI' && (
        <div style={{ flexShrink: 0, backgroundColor: '#1a3a1a', padding: '4px 12px',
          fontSize: 11, color: '#aaffaa', textAlign: 'center' }}>
          対戦相手のシグニは可能ならばアタックしなければなりません
        </div>
      )}

      {/* ステータスバー */}
      <div style={{
        flexShrink: 0, backgroundColor: C.bgBar, borderBottom: C.borderBar,
        padding: '6px 12px', display: 'flex', gap: 8, alignItems: 'center',
      }}>
        <span style={{ color: C.textMuted, fontWeight: 'bold', fontSize: 13 }}>T{bs.turn_count}</span>
        <span style={{ color: isMyTurn ? C.accent : C.textDim, fontSize: 12, fontWeight: 'bold' }}>
          {PHASE_LABEL[bs.turn_phase] ?? bs.turn_phase}
        </span>

        {/* GROWフェイズのグロウボタン */}
        {isMyTurn && bs.turn_phase === 'GROW' && (() => {
          const used    = my.actions_done?.includes('GROW') ?? false;
          const blocked = isActionBlocked('GROW') || (my.no_grow ?? false);
          if (used || blocked || growCandidates.length === 0) return null;
          return (
            <button onClick={() => setShowGrowModal(true)} disabled={loading}
              style={{ padding: '4px 10px', borderRadius: 4, border: 'none', fontSize: 11, fontWeight: 'bold',
                backgroundColor: C.success, color: C.text, cursor: loading ? 'default' : 'pointer' }}>
              グロウ
            </button>
          );
        })()}

        {iControlThisPhase ? (
          bs.turn_phase === 'ATTACK_LRIG' && op.field.lrig_attacked ? (
            <span style={{ fontSize: 11, color: C.textDim }}>ガード応答待ち...</span>
          ) : (
          <button
            onClick={handlePhaseAdvance}
            disabled={!!(bs.effect_stack || bs.pending_effect || loading || my.pending_signi_battle)}
            style={{
              padding: '5px 16px', borderRadius: 5, border: 'none',
              backgroundColor: bs.turn_phase === 'END' ? C.dangerDark : C.accent,
              color: C.text, fontSize: 12, fontWeight: 'bold',
              cursor: 'pointer',
              visibility: (bs.effect_stack || bs.pending_effect || loading || my.pending_signi_battle) ? 'hidden' : 'visible',
            }}
          >
            {PHASE_BTN[bs.turn_phase]}
          </button>
          )
        ) : (
          <span style={{ fontSize: 11, color: C.textDim }}>
            {WAITING_MSG[bs.turn_phase] ?? '相手のターン中...'}
          </span>
        )}

        {/* MAINフェイズのリムーブボタン */}
        {isMyTurn && bs.turn_phase === 'MAIN' && !(my.actions_done?.includes('REMOVE') ?? false) && (
          <button onClick={() => {
              // SELF_SIGNI_TRASH 封じ（WX04-046-E1等）: リムーブ不可。警告を表示
              if (isActionBlocked('SELF_SIGNI_TRASH')) { setShowRemoveBlockedWarn(true); return; }
              openRemoveZone();
            }}
            disabled={loading}
            style={{ padding: '4px 10px', borderRadius: 4, border: 'none', fontSize: 11, fontWeight: 'bold',
              backgroundColor: '#8b4513', color: C.text, cursor: loading ? 'default' : 'pointer' }}>
            リムーブ
          </button>
        )}

        {/* MAINフェイズ: エナゾーンのアクセカード発動ボタン */}
        {isMyTurn && bs.turn_phase === 'MAIN' && !loading && (() => {
          const acceEffects: { cardNum: string; effect: import('../types/effects').CardEffect; alreadyDone: boolean }[] = [];
          for (const energyCardNum of my.energy) {
            for (const eff of (effectsMap.get(energyCardNum) ?? [])) {
              if (eff.effectType !== 'ACTIVATED') continue;
              if (!eff.timing?.includes('MAIN')) continue;
              if (eff.action.type !== 'ATTACH_ACCE') continue;
              const alreadyDone = my.actions_done?.includes(eff.effectId) ?? false;
              acceEffects.push({ cardNum: energyCardNum, effect: eff, alreadyDone });
            }
          }
          if (acceEffects.length === 0) return null;
          return (
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {acceEffects.map(({ cardNum, effect, alreadyDone }) => {
                const card = battleCardMap.get(cardNum);
                // MULTI_ACCE_LIMIT: 多アクセ可能シグニ（max2個）を考慮したターゲット判定
                const multiAcceLimits = collectMultiAcceLimits(my, effectsMap, battleCardMap, op, true);
                const hasTarget = my.field.signi.some((s, i) => {
                  if (!s?.length) return false;
                  const topCn = s.at(-1)!;
                  const limit = multiAcceLimits.get(topCn) ?? 1;
                  return acceCardsAt(my.field, i).length < limit;
                });
                return (
                  <button key={cardNum + effect.effectId}
                    onClick={() => { openEnergyActivated({ cardNum, effect }); }}
                    disabled={alreadyDone || !hasTarget || loading}
                    style={{ padding: '4px 8px', borderRadius: 4, border: 'none', fontSize: 10, fontWeight: 'bold',
                      backgroundColor: (alreadyDone || !hasTarget) ? C.disabled : '#4caf50',
                      color: C.text, cursor: (alreadyDone || !hasTarget || loading) ? 'default' : 'pointer',
                      maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {card?.CardName ?? cardNum}【アクセ】
                  </button>
                );
              })}
            </div>
          );
        })()}

      </div>

      {/* 盤面エリア */}
      <div style={{ flex: 1, overflow: 'hidden', padding: 4, display: 'flex', flexDirection: 'column', gap: 3, boxSizing: 'border-box' }}>

        {/* バトルログ */}
        {battleLogs.length > 0 && (
          <div
            ref={logScrollRef}
            onClick={() => setLogExpanded(v => !v)}
            style={{
              flexShrink: 0,
              backgroundColor: 'rgba(0,0,0,0.6)',
              borderRadius: 5,
              padding: '3px 8px',
              cursor: 'pointer',
              overflow: 'hidden',
              maxHeight: logExpanded ? 200 : 38,
              overflowY: logExpanded ? 'auto' : 'hidden',
              border: '1px solid rgba(255,255,255,0.09)',
              transition: 'max-height 0.2s ease',
              position: 'relative',
            }}
          >
            {[...battleLogs].reverse().slice(0, logExpanded ? 60 : 2).map((log, i) => {
              const text = log.user_id !== user.id
                ? log.action.replace(/あなた/g, '\x00').replace(/相手/g, 'あなた').replace(/\x00/g, '相手')
                : log.action;
              return (
                <div key={i} style={{ fontSize: 10, color: i === 0 ? '#b8d4d4' : '#7a9a9a', lineHeight: '1.6', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {text}
                </div>
              );
            })}
            <div style={{
              position: 'absolute', right: 6, top: '50%', transform: logExpanded ? 'translateY(-50%) rotate(180deg)' : 'translateY(-50%)',
              fontSize: 8, color: 'rgba(255,255,255,0.3)', pointerEvents: 'none', transition: 'transform 0.2s',
            }}>▼</div>
          </div>
        )}

        {/* 相手盤面 */}
        <div style={{ border: C.borderPanel, borderRadius: 6, padding: '4px 6px', backgroundColor: C.bgOpponent }}>
          <HandCards cardNums={op.hand} cards={battleCards} faceDown />
          <PlayerField state={op} cards={battleCards} isMe={false} getTrashCardActions={getOpTrashCardActions} effectivePowers={effectivePowers} dynamicKeywords={dynamicKeywords.op} />
        </div>

        {/* 中央区切り */}
        <div style={{ height: 2, flexShrink: 0, background: 'linear-gradient(to right, transparent, #007bff33, transparent)' }} />

        {/* 自分の盤面 */}
        <div style={{ border: C.borderSelf, borderRadius: 6, padding: '4px 6px', backgroundColor: C.bgSelf }}>
          <PlayerField state={my} cards={battleCards} isMe={true} getSigniZoneActions={getMySigniZoneActions} getLrigDeckCardActions={getMyLrigDeckCardActions} getLrigFieldActions={getMyLrigFieldActions} getKeyPieceActions={getKeyPieceActions} getAssistLActions={() => getAssistActions('l')} getAssistRActions={() => getAssistActions('r')} getFreeZoneActions={getMyFreeZoneActions} getTrashCardActions={getMyTrashCardActions} getEnergyCardActions={getMyEnergyCardActions} closeZoneSignal={closeZoneSignal} effectivePowers={effectivePowers} dynamicKeywords={dynamicKeywords.my} />
          <HandCards cardNums={my.hand} cards={battleCards} getCardActions={getMyHandCardActions} />
        </div>
      </div>

      {/* ===== キーピース 使用モーダル ===== */}
      <KeyUseModal ctx={modalCtx} showKeyModal={showKeyModal} setShowKeyModal={setShowKeyModal} pendingKeyCard={pendingKeyCard} setPendingKeyCard={setPendingKeyCard} selectedKeyCost={selectedKeyCost} setSelectedKeyCost={setSelectedKeyCost} executeKeyPiece={executeKeyPiece} />

      {/* ===== キーピース 起動効果モーダル ===== */}
      <KeyActivatedModal ctx={modalCtx} pendingKeyActivated={pendingKeyActivated} setPendingKeyActivated={setPendingKeyActivated} selectedKeyActivatedCost={selectedKeyActivatedCost} setSelectedKeyActivatedCost={setSelectedKeyActivatedCost} selectedKeyActivatedDiscard={selectedKeyActivatedDiscard} setSelectedKeyActivatedDiscard={setSelectedKeyActivatedDiscard} executeKeyActivated={executeKeyActivated} />

      {/* ===== アシストルリグ グロウモーダル ===== */}
      <AssistGrowModal ctx={modalCtx} showAssistGrowModal={showAssistGrowModal} setShowAssistGrowModal={setShowAssistGrowModal} pendingAssistGrowCard={pendingAssistGrowCard} setPendingAssistGrowCard={setPendingAssistGrowCard} pendingAssistSide={pendingAssistSide} setPendingAssistSide={setPendingAssistSide} selectedAssistGrowCost={selectedAssistGrowCost} setSelectedAssistGrowCost={setSelectedAssistGrowCost} getAssistGrowCandidates={getAssistGrowCandidates} executeAssistGrow={executeAssistGrow} />

      {/* ===== アシストルリグ 起動効果モーダル ===== */}
      <AssistActivatedModal ctx={modalCtx} pendingAssistActivated={pendingAssistActivated} setPendingAssistActivated={setPendingAssistActivated} selectedAssistActivatedCost={selectedAssistActivatedCost} setSelectedAssistActivatedCost={setSelectedAssistActivatedCost} selectedAssistActivatedDiscard={selectedAssistActivatedDiscard} setSelectedAssistActivatedDiscard={setSelectedAssistActivatedDiscard} executeAssistActivated={executeAssistActivated} />

      {/* ===== シグニ起動効果 コスト支払いモーダル ===== */}
      <SigniActivatedModal ctx={modalCtx} pendingSigniActivated={pendingSigniActivated} setPendingSigniActivated={setPendingSigniActivated} selectedSigniActivatedCost={selectedSigniActivatedCost} setSelectedSigniActivatedCost={setSelectedSigniActivatedCost} selectedSigniActivatedDiscard={selectedSigniActivatedDiscard} setSelectedSigniActivatedDiscard={setSelectedSigniActivatedDiscard} selectedSigniActivatedDiscardVar={selectedSigniActivatedDiscardVar} setSelectedSigniActivatedDiscardVar={setSelectedSigniActivatedDiscardVar} selectedSigniActivatedFieldTrash={selectedSigniActivatedFieldTrash} setSelectedSigniActivatedFieldTrash={setSelectedSigniActivatedFieldTrash} selectedSigniActivatedUnderTrash={selectedSigniActivatedUnderTrash} setSelectedSigniActivatedUnderTrash={setSelectedSigniActivatedUnderTrash} selectedSigniActivatedEnergyTrash={selectedSigniActivatedEnergyTrash} setSelectedSigniActivatedEnergyTrash={setSelectedSigniActivatedEnergyTrash} selectedSigniActivatedTrashExile={selectedSigniActivatedTrashExile} setSelectedSigniActivatedTrashExile={setSelectedSigniActivatedTrashExile} selectedSigniActivatedBeat={selectedSigniActivatedBeat} setSelectedSigniActivatedBeat={setSelectedSigniActivatedBeat} signiActCharmTrashVar={signiActCharmTrashVar} setSigniActCharmTrashVar={setSigniActCharmTrashVar} keySubstituteEnabled={keySubstituteEnabled} setKeySubstituteEnabled={setKeySubstituteEnabled} executeSigniActivated={executeSigniActivated} />

      {/* ===== エナゾーンACTIVATED（アクセカード）モーダル ===== */}
      <EnergyActivatedModal ctx={modalCtx} pendingEnergyActivated={pendingEnergyActivated} setPendingEnergyActivated={setPendingEnergyActivated} selectedEnergyActivatedCost={selectedEnergyActivatedCost} setSelectedEnergyActivatedCost={setSelectedEnergyActivatedCost} executeEnergyActivated={executeEnergyActivated} />

      {/* ===== シグニ出現時コスト付き【出】効果 モーダル ===== */}
      <SigniOnPlayCostModal ctx={modalCtx} pendingSigniOnPlayCost={pendingSigniOnPlayCost} selectedSigniOnPlayCost={selectedSigniOnPlayCost} setSelectedSigniOnPlayCost={setSelectedSigniOnPlayCost} selectedSigniOnPlayDiscard={selectedSigniOnPlayDiscard} setSelectedSigniOnPlayDiscard={setSelectedSigniOnPlayDiscard} selectedSigniOnPlayEnergyTrash={selectedSigniOnPlayEnergyTrash} setSelectedSigniOnPlayEnergyTrash={setSelectedSigniOnPlayEnergyTrash} selectedSigniOnPlayFieldTrash={selectedSigniOnPlayFieldTrash} setSelectedSigniOnPlayFieldTrash={setSelectedSigniOnPlayFieldTrash} selectedSigniOnPlayExceed={selectedSigniOnPlayExceed} setSelectedSigniOnPlayExceed={setSelectedSigniOnPlayExceed} selectedSigniOnPlayBeat={selectedSigniOnPlayBeat} setSelectedSigniOnPlayBeat={setSelectedSigniOnPlayBeat} selectedSigniOnPlayArtsTrash={selectedSigniOnPlayArtsTrash} setSelectedSigniOnPlayArtsTrash={setSelectedSigniOnPlayArtsTrash} selectedSigniOnPlayUnderTrash={selectedSigniOnPlayUnderTrash} setSelectedSigniOnPlayUnderTrash={setSelectedSigniOnPlayUnderTrash} selectedSigniOnPlayTrashToDeck={selectedSigniOnPlayTrashToDeck} setSelectedSigniOnPlayTrashToDeck={setSelectedSigniOnPlayTrashToDeck} signiOnPlayCharmTrashVar={signiOnPlayCharmTrashVar} setSigniOnPlayCharmTrashVar={setSigniOnPlayCharmTrashVar} executeSigniOnPlayCost={executeSigniOnPlayCost} skipSigniOnPlayCost={skipSigniOnPlayCost} />

      {/* ===== ルリグ付与能力（GRANT_LRIG_ABILITY）発動モーダル ===== */}
      <LrigGrantedModal ctx={modalCtx} pendingLrigGranted={pendingLrigGranted} setPendingLrigGranted={setPendingLrigGranted} selectedLrigGrantedCost={selectedLrigGrantedCost} setSelectedLrigGrantedCost={setSelectedLrigGrantedCost} selectedLrigGrantedHandDiscard={selectedLrigGrantedHandDiscard} setSelectedLrigGrantedHandDiscard={setSelectedLrigGrantedHandDiscard} selectedLrigGrantedEnergyTrash={selectedLrigGrantedEnergyTrash} setSelectedLrigGrantedEnergyTrash={setSelectedLrigGrantedEnergyTrash} selectedLrigGrantedTrashExile={selectedLrigGrantedTrashExile} setSelectedLrigGrantedTrashExile={setSelectedLrigGrantedTrashExile} selectedLrigGrantedFieldBanish={selectedLrigGrantedFieldBanish} setSelectedLrigGrantedFieldBanish={setSelectedLrigGrantedFieldBanish} executeLrigGranted={executeLrigGranted} />
      {/* ===== 効果スタック 整列モーダル ===== */}
      <StackOrderModal ctx={modalCtx} stackOrderIds={stackOrderIds} setStackOrderIds={setStackOrderIds} handleConfirmStackOrder={handleConfirmStackOrder} />

      {/* ===== 効果インタラクション モーダル ===== */}
      <EffectInteractionModal ctx={modalCtx} effectSelectedNums={effectSelectedNums} setEffectSelectedNums={setEffectSelectedNums} selectedOptCost={selectedOptCost} setSelectedOptCost={setSelectedOptCost} selectedMultiChoiceIds={selectedMultiChoiceIds} setSelectedMultiChoiceIds={setSelectedMultiChoiceIds} lookReorderOrder={lookReorderOrder} setLookReorderOrder={setLookReorderOrder} lookReorderTrash={lookReorderTrash} setLookReorderTrash={setLookReorderTrash} lookReorderBottom={lookReorderBottom} setLookReorderBottom={setLookReorderBottom} rearrangeSlots={rearrangeSlots} setRearrangeSlots={setRearrangeSlots} handleEffectInteraction={handleEffectInteraction} handleSelectZoneForEffect={handleSelectZoneForEffect} handleSelectSigniZoneForEffect={handleSelectSigniZoneForEffect} handleSelectVirusZoneForEffect={handleSelectVirusZoneForEffect} handleRearrangeSigniConfirm={handleRearrangeSigniConfirm} handleAllocatePowerConfirm={handleAllocatePowerConfirm} />

      {/* ===== 観戦表示＋長押し拡大＋終了ボタン ===== */}
      <SystemOverlays ctx={modalCtx} expandedPickImgUrl={expandedPickImgUrl} setShowEndConfirm={setShowEndConfirm} />

    </div>
  );
}
