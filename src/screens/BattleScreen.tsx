import { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import { supabase } from '../supabaseClient';
import type { User } from '@supabase/supabase-js';
import type { BattleStateRow, PlayerState, CardData, PendingSpell, PendingEffect, StackEntry, EffectStack } from '../types';
import { buildEffectsMap } from '../data/effectParser';
import { calcFieldPowers, calcActiveCostMods, calcContinuousBlockedActions, calcContinuousSigniMutations, checkActiveCondition, collectLrigGrantedEffects, collectGrantedFromUnderSigni, collectGrantedFromLayer, collectGrantedFromAcce, collectGrantedFromSoul, collectColorlessOverrides, collectForcedTargets, collectProtectedZones, collectEnergyColorSubs, collectEnergyTrashSubstituteInfo, collectEichiStubEffects, collectOppGuardExtraColorlessCost, collectHandLimits, collectAbilityProtectedSigni, collectSpecificCardCostReductions, collectCrossStates, isCrossZoneActive, filterKizunaGated, isKizunaActive, cardHasCrossIcon, collectLrigNameAliases, collectFieldEnergySigniColorGains, collectDownProtectedSigni, collectArtsThresholdCostReductions, collectOppLrigAttackExtraCost, collectHandGuardIconClasses, collectLrigColorAndLimitMods, collectBounceProtectedSigni, collectCopiedLrigAutoEffects, collectCopiedLrigContinuousEffects, collectAttackPhaseLevelOverrides, collectDrawLimits, collectAllZoneBlackCardNums, hasAllCardsColorBlack, collectOppEnergyColorRestriction, collectOppExtraGuardFromHand, collectBlockLowCostSpellCount, collectCenterZoneDeployRestrict, collectDeployCountLimit, collectForcePlaceFrontZones, collectFrozenBanishOverrides, collectTrashFieldProtectedSigni, collectSelfTrashPreventNums, collectAbilityGainProtectedSigni, collectInfectedActivateBlockedSigni, collectMultiAcceSigni, collectRiseBanishSubstituteSigni, collectAllColorSigniForField, collectFieldSigniExtraColors, collectGrowCostSubstitute, collectGuardAlternativeCost, collectAltAttackFlipSigni, collectOppTrashLoseColorClass, collectTreatAsClassAllZones, collectDeckTrashLevel1Nums, applyDeclaredZoneClassOverride,
applyContinuousBaseLevelOverride, banishRedirectAppliesFrom, collectBanishEffectProtectedSigni, collectBanishBySourceProtectedSigni,
collectCharmShieldSigni,
collectEffectImmuneSigni, collectContinuousGrantedKeywords, collectBanishSubstitutes, collectForcedFrontAttackZones, collectGrowCostReductions, matchesStateFilter} from '../engine/effectEngine';
import { executeEffect, applyRefreshOnDone, resumeSelectTarget, resumeSearch, resumeChoose, resumeOptionalCost, resumeOpponentPayOptional, resumeLookAndReorder, resumeSelectZone, resumeSelectSigniZone, resumeSelectVirusZone, resumeRevealCards, resumeRearrangeSigni, removeFromField, getCardNum, evalUseCondition, matchesFilter, payBeatSigniCost, payBeatSigniFromTrashCost, type ExecCtx, type ExecResult } from '../engine/effectExecutor';
import { getRiseFilter, matchesRiseFilter, splitColors, LRIG_BARRIER_CARD, SIGNI_BARRIER_CARD, countBarrierTokens, addBarrierTokens, removeOneBarrierToken, sweepPuppets } from '../engine/execUtils';
import { initStack, pushToStack, confirmTurnOrder, confirmOppOrder, shiftQueue, isReadyToResolve, isStackDone } from '../engine/effectStack';
import { collectTargetedTriggers as pureCollectTargetedTriggers, collectLrigGrowTriggers as pureCollectLrigGrowTriggers, collectCoinPaidTriggers as pureCollectCoinPaidTriggers, collectPowerZeroTriggers as pureCollectPowerZeroTriggers, collectArmorTriggers as pureCollectArmorTriggers, collectDeckTrashSelfTriggers as pureCollectDeckTrashSelfTriggers, collectAnyZoneTrashSelfTriggers as pureCollectAnyZoneTrashSelfTriggers, collectTrashTriggers as pureCollectTrashTriggers, collectBanishTriggers as pureCollectBanishTriggers, collectLeaveFieldTriggers as pureCollectLeaveFieldTriggers, collectDrawTriggers as pureCollectDrawTriggers, collectOppDrawTriggers as pureCollectOppDrawTriggers, collectMillTriggers as pureCollectMillTriggers, collectCharmToTrashTriggers as pureCollectCharmToTrashTriggers, collectEnergyToTrashTriggers as pureCollectEnergyToTrashTriggers, collectRefreshTriggers as pureCollectRefreshTriggers, collectPowerDecreaseTriggers as pureCollectPowerDecreaseTriggers, collectMoveToDeckTriggers as pureCollectMoveToDeckTriggers, collectFreezeTriggers as pureCollectFreezeTriggers, collectSelfEventTriggers as pureCollectSelfEventTriggers, collectZoneMovedTriggers as pureCollectZoneMovedTriggers, collectDriveBecameTriggers as pureCollectDriveBecameTriggers, collectBeatBecameTriggers as pureCollectBeatBecameTriggers, collectHandDiscardTriggers as pureCollectHandDiscardTriggers, collectOppArtsUseTriggers as pureCollectOppArtsUseTriggers, collectArtsUseTriggers as pureCollectArtsUseTriggers, collectFieldTriggers as pureCollectFieldTriggers, collectBloomTriggers as pureCollectBloomTriggers, collectTurnTriggers as pureCollectTurnTriggers, collectAllyPlayOrOppDiscardTriggers as pureCollectAllyPlayOrOppDiscardTriggers, collectMaterialUsedByPlayerTriggers as pureCollectMaterialUsedByPlayerTriggers, collectMaterialUsedOnSigniTriggers as pureCollectMaterialUsedOnSigniTriggers, collectBanishOppByEffectTriggers as pureCollectBanishOppByEffectTriggers, collectLrigUnderMovedTriggers as pureCollectLrigUnderMovedTriggers, collectDeckShuffledTriggers as pureCollectDeckShuffledTriggers, collectKeywordGainedTriggers as pureCollectKeywordGainedTriggers, collectSigniDownUpTriggers as pureCollectSigniDownUpTriggers, collectHandAddedTriggers as pureCollectHandAddedTriggers, collectEnergyToFieldTriggers as pureCollectEnergyToFieldTriggers, collectLifeClothAddedTriggers as pureCollectLifeClothAddedTriggers, collectOppEnergyAddedTriggers as pureCollectOppEnergyAddedTriggers, collectLrigAttackDefenderTriggers as pureCollectLrigAttackDefenderTriggers, type TrigCtx } from '../engine/triggerCollect';
import { collectTrapActivateTriggers as pureCollectTrapActivateTriggers, collectLrigAttackGuardedTriggers as pureCollectLrigAttackGuardedTriggers } from '../engine/triggerCollect';
import { detectBanishedSigni, detectPlacedSigni, detectBloomedSigni, detectFacedownFlipped, detectEnergyFromTrash, detectNewlyArmored, detectLeftFieldSigni, detectTrashedSigni, detectDeckTrashed, detectHandTrashed, detectEnergyTrashed, countCharmsToTrash, countEnergyToTrash, countRefresh, detectPowerDecrease, detectPowerDecreaseSources, countMilledFromDeck, countMovedToDeck, countLrigUnderMoved, detectDeckShuffled, detectKeywordGained, detectNewlyFrozen, detectNewlyDowned, detectNewlyUpped, detectHandAdded, detectPlacedFromEnergy, detectLifeClothAdded, detectEnergyAdded } from '../engine/boardDiff';
import { hasKeyword, hasBanishResist } from '../utils/keywords';
import { C, HandCards, PlayerField } from '../components/BoardComponents';
import type { CardAction } from '../components/BoardComponents';

interface Props {
  user: User;
  roomId: string;
  myDeckId: string;
  cards: CardData[];
  onBack: () => void;
}

import { CPU_PLAYER_ID, CPU_ACTION_DELAY, generateUUID, shuffle, InstanceMap, parsePowerVal, assignInstanceIds, assignGuestInstanceIds, drawCards, jankenWinner, advancePreventDamageWindows, keyActivatedTimingMatchesPhase } from './battle/battleUtils';
import { fmtHandDiscardSigniLabel, fmtDiscardFilterLabel, parseGrowCost, removeNColorFromCost, applyGrowCostReduction, isMultiEna, canAffordGrowCost, parseCoinCost, parseEncoreCost, canAffordWithExtraCost, energyCostToString, findCounterSpellMaxCost } from './battle/costs';
import { findGrowFreeAction, extractGrowCondition, checkGrowCondition, applyGrowEffect, lrigClassesCompatible, meetsRestriction } from './battle/growLogic';
import { computeFieldSigniLimit, fieldTrashGroupsAffordable, reduceFieldSigniToLimit } from './battle/fieldLimit';
import { JANKEN_LABEL, PHASE_LABEL, PHASE_BTN, PHASE_NEXT, NON_TURN_PLAYER_PHASES, WAITING_MSG, setupWrap, primaryBtn } from './battle/uiConstants';
import { MulliganCard } from './battle/MulliganCard';
import type { BattleModalCtx, CutinCandidate } from './battle/modals/types';
import { GrowModal } from './battle/modals/GrowModal';
import { ArtsModal } from './battle/modals/ArtsModal';
import { CutinModal } from './battle/modals/CutinModal';
import { SigniActivatedModal } from './battle/modals/SigniActivatedModal';
import { SigniOnPlayCostModal } from './battle/modals/SigniOnPlayCostModal';
import { LrigGrantedModal } from './battle/modals/LrigGrantedModal';
import { EffectInteractionModal } from './battle/modals/EffectInteractionModal';
import { KeyUseModal } from './battle/modals/KeyUseModal';
import { KeyActivatedModal } from './battle/modals/KeyActivatedModal';
import { AssistGrowModal } from './battle/modals/AssistGrowModal';
import { AssistActivatedModal } from './battle/modals/AssistActivatedModal';
import { EnergyActivatedModal } from './battle/modals/EnergyActivatedModal';
import { GuardResponseDialog } from './battle/modals/GuardResponseDialog';
import { StackOrderModal } from './battle/modals/StackOrderModal';
import { SigniSummonZoneModal } from './battle/modals/SigniSummonZoneModal';
import { RemoveZoneModal } from './battle/modals/RemoveZoneModal';
import { LifeBurstCheckModal } from './battle/modals/LifeBurstCheckModal';
import { EndDiscardModal } from './battle/modals/EndDiscardModal';
import { BanishSubstituteModal } from './battle/modals/BanishSubstituteModal';
import { PhaseConfirmDialogs } from './battle/modals/PhaseConfirmDialogs';
import { SpellCastModal } from './battle/modals/SpellCastModal';
import { HandActivatedModal } from './battle/modals/HandActivatedModal';
import { TrashActivatedModal } from './battle/modals/TrashActivatedModal';
import { GuardBarrierActModal } from './battle/modals/GuardBarrierActModal';
import { NegateEscapeModal } from './battle/modals/NegateEscapeModal';
import { SpellCutinOverlays } from './battle/modals/SpellCutinOverlays';
import { EndConfirmModal } from './battle/modals/EndConfirmModal';
import { FinishedPopup } from './battle/modals/FinishedPopup';
import { SystemOverlays } from './battle/modals/SystemOverlays';
import { useGrowModal } from './battle/hooks/useGrowModal';
import { useArtsModal } from './battle/hooks/useArtsModal';
import { useSpellCast } from './battle/hooks/useSpellCast';
import { useKeyModals } from './battle/hooks/useKeyModals';
import { useAssistModals } from './battle/hooks/useAssistModals';
import { usePhaseConfirms } from './battle/hooks/usePhaseConfirms';
import { useSigniOnPlayCost } from './battle/hooks/useSigniOnPlayCost';
import { useSigniActivated } from './battle/hooks/useSigniActivated';
import { useActivatedModals } from './battle/hooks/useActivatedModals';
import { useCutin } from './battle/hooks/useCutin';
import { useEffectInteraction } from './battle/hooks/useEffectInteraction';
import { useRemoveZone, useGuardResponses, useEndDiscard, useZoomOverlays } from './battle/hooks/useMiscBattleUI';


// ─── メインコンポーネント ────────────────────────────────────────────
export default function BattleScreen({ user, roomId, myDeckId, cards, onBack }: Props) {
  const [bs, setBs] = useState<BattleStateRow | null>(null);
  const [myDeckData, setMyDeckData] = useState<{ main_deck: string[]; lrig_deck: string[] } | null>(null);
  // CPU対戦用
  const [isCpuBattle, setIsCpuBattle] = useState(false);
  const [cpuDeckData, setCpuDeckData] = useState<{ main_deck: string[]; lrig_deck: string[] } | null>(null);
  const cpuTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [loading, setLoading] = useState(false);
  const [mulliganSelected, setMulliganSelected] = useState<Set<number>>(new Set());
  const [pendingSigniSummon, setPendingSigniSummon] = useState<{ cardNum: string; handIndex: number } | null>(null);
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
  } = useGrowModal();
  const {
    showArtsModal, setShowArtsModal, pendingArtsCard, setPendingArtsCard,
    pendingArtsEffectiveCost, setPendingArtsEffectiveCost, selectedArtsCost, setSelectedArtsCost,
    selectedArtsDiscard, setSelectedArtsDiscard, betAmount, setBetAmount, isEncore, setIsEncore,
    openArtsModal, closeArtsModal, toggleArtsCost,
  } = useArtsModal();
  const [closeZoneSignal, setCloseZoneSignal] = useState(0);
  const { showRemoveModal, setShowRemoveModal, selectedRemoveZones, setSelectedRemoveZones, openRemoveZone } = useRemoveZone();
  const {
    pendingSpellCast, setPendingSpellCast, selectedSpellCost, setSelectedSpellCost,
    openSpellCast, closeSpellCast, toggleSpellCost,
  } = useSpellCast();
  // 手札【起】／トラッシュ自己起動／エナACTIVATED／ルリグ付与【起】
  const {
    pendingHandActivated, setPendingHandActivated, selectedHandActivatedCost, setSelectedHandActivatedCost,
    pendingTrashActivated, setPendingTrashActivated, selectedTrashActivatedCost, setSelectedTrashActivatedCost,
    pendingEnergyActivated, setPendingEnergyActivated, selectedEnergyActivatedCost, setSelectedEnergyActivatedCost,
    pendingLrigGranted, setPendingLrigGranted, selectedLrigGrantedCost, setSelectedLrigGrantedCost,
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
    openGuardBarrierAct, closeGuardBarrierAct, openNegateEscape, closeNegateEscape,
  } = useGuardResponses();
  const {
    pendingCutinCard, setPendingCutinCard, selectedCutinCost, setSelectedCutinCost,
    selectedCutinExceed, setSelectedCutinExceed, closeCutin, toggleCutinCost,
  } = useCutin();
  // シグニ起動効果
  const {
    pendingSigniActivated, setPendingSigniActivated, selectedSigniActivatedCost, setSelectedSigniActivatedCost,
    selectedSigniActivatedDiscard, setSelectedSigniActivatedDiscard,
    selectedSigniActivatedDiscardVar, setSelectedSigniActivatedDiscardVar,
    selectedSigniActivatedFieldTrash, setSelectedSigniActivatedFieldTrash,
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
    selectedSigniOnPlayBeat, setSelectedSigniOnPlayBeat,
    selectedSigniOnPlayArtsTrash, setSelectedSigniOnPlayArtsTrash,
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
  // アシストルリグセットアップ（センタールリグ選択後の中間状態）
  const [pendingLrigSetup, setPendingLrigSetup] = useState<{
    centerCardNum: string;
    centerInstanceId: string;
    lrigWithIds: string[];
    mainWithIds: string[];
    remainingLv0: Array<{ cardNum: string; instanceId: string; origIdx: number }>;
    assistStep: 'confirm' | 'select_l' | 'select_r';
    assistLInstanceId: string | null;
    assistLCardNum: string | null;
  } | null>(null);
  const [logExpanded, setLogExpanded] = useState(false);
  const [battleLogs, setBattleLogs] = useState<import('../types').GameLog[]>([]);
  const logScrollRef = useRef<HTMLDivElement>(null);
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
  const leavingRef = useRef(false);
  const stackProcessingRef        = useRef(false);  // resolveStackNext の多重実行防止
  const lastResolvedEntryIdRef    = useRef<string | null>(null); // 直前に処理したキュー先頭のID（DB伝播前の二重処理防止）
  const doPhaseAdvanceRef                = useRef<(() => Promise<void>) | null>(null);
  const triggerPendingCrashRef           = useRef<(() => Promise<void>) | null>(null);
  const resolveStackNextRef              = useRef<(() => Promise<void>) | null>(null);
  const checkPowerZeroBanishRef          = useRef<(() => Promise<void>) | null>(null);
  const checkContMutationsRef            = useRef<(() => Promise<void>) | null>(null);
  const resolvePendingSigniBattleRef     = useRef<(() => Promise<void>) | null>(null);
  const resolvePendingLrigAttackRef      = useRef<(() => Promise<void>) | null>(null);
  const lastBanishedKeyRef        = useRef<string>(''); // 直前に処理したバニッシュ候補のフィンガープリント（二重処理防止）
  const lastContMutationKeyRef    = useRef<string>(''); // CONTINUOUS BANISH/FREEZE/DOWN 二重処理防止
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
    supabase.from('battle_states').select('*').eq('room_id', roomId).single()
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
                  .select('main_deck, lrig_deck').eq('id', rd.guest_deck_id).single();
                if (dd) setCpuDeckData(dd as { main_deck: string[]; lrig_deck: string[] });
              });
          }
        }
      });

    supabase.from('decks').select('main_deck, lrig_deck').eq('id', myDeckId).single()
      .then(({ data }) => {
        if (data) setMyDeckData(data as { main_deck: string[]; lrig_deck: string[] });
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
          supabase.from('battle_states').select('*').eq('room_id', roomId).single()
            .then(({ data }) => { if (data) setBs(data as BattleStateRow); });
        }
      });

    return () => { supabase.removeChannel(channel); };
  }, [roomId, myDeckId]);

  useEffect(() => {
    if (!bs) return;
    const isHost = user.id === bs.host_id;

    // じゃんけん結果処理（両プレイヤー共通：どちらか一方が実行）
    if (!transitioningRef.current && bs.setup_phase === 'JAN_KEN' && bs.host_janken && bs.guest_janken) {
      transitioningRef.current = true;
      const winner = jankenWinner(bs.host_janken, bs.guest_janken, bs.host_id, bs.guest_id);
      const update = winner
        ? { first_player_id: winner, setup_phase: 'LRIG_SELECT', host_janken: null as null, guest_janken: null as null }
        : { host_janken: null as null, guest_janken: null as null };
      const t = setTimeout(() => {
        supabase.from('battle_states').update(update).eq('room_id', roomId)
          .then(() => { transitioningRef.current = false; });
      }, 1800);
      return () => { clearTimeout(t); transitioningRef.current = false; };
    }

    // 以下はホストのみが担当するフェーズ遷移
    if (!isHost || transitioningRef.current) return;

    if (bs.setup_phase === 'LRIG_SELECT' && bs.host_lrig_selected && bs.guest_lrig_selected) {
      transitioningRef.current = true;
      supabase.from('battle_states').update({ setup_phase: 'MULLIGAN' }).eq('room_id', roomId)
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
  useEffect(() => {
    if (!bs || !isCpuBattle || bs.global_phase !== 'PLAYING') return;
    // CPUのチェックゾーン処理（バースト確認）はeffect_stackがあっても行う
    // （攻撃時トリガーとバースト確認を並行させないとCPUが止まる）
    if (bs.pending_effect || (bs.effect_stack && !bs.guest_state?.field?.check)) return;
    // プレイヤー（人間）がライフバースト処理中はCPU停止
    if (bs.host_state?.field?.check) return;
    const cpuSt = bs.guest_state;
    const isCpuTurn = bs.active_user_id === CPU_PLAYER_ID;
    // ATTACK_ARTS_OPはCPUがターンプレイヤーのとき人間が担当→CPU動かない
    // CPUが非ターンプレイヤーのときはCPUが担当→動く
    if (bs.turn_phase === 'ATTACK_ARTS_OP' && isCpuTurn) return;
    if (!isCpuTurn && bs.turn_phase !== 'ATTACK_ARTS_OP' && !cpuSt.field?.check && !cpuSt.field?.lrig_attacked && !bs.pending_spell && !(cpuSt.pending_crashed_cards?.length)) return;
    if (cpuTimerRef.current) clearTimeout(cpuTimerRef.current);
    cpuTimerRef.current = setTimeout(() => { cpuTurnRef.current?.(); }, CPU_ACTION_DELAY);
    return () => { if (cpuTimerRef.current) clearTimeout(cpuTimerRef.current); };
  }, [
    isCpuBattle, bs?.global_phase, bs?.active_user_id, bs?.turn_phase,
    bs?.guest_state?.field?.check, bs?.guest_state?.field?.lrig_attacked,
    bs?.host_state?.field?.check, bs?.host_state?.field?.lrig_attacked,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    JSON.stringify(bs?.guest_state?.field?.signi_down),
    bs?.guest_state?.pending_crashed_cards?.length,
    !!bs?.guest_state?.pending_signi_battle, // バトル解決待ちクリア時に再実行（トリガーなし時の停止防止）
    !!bs?.guest_state?.pending_lrig_attack,  // ルリグアタック解決待ちクリア時に再実行
    // F-3: CPU攻撃・人間防御の身代わり決定後にCPUバトル解決を再開（host=人間の決定を監視）
    !!bs?.host_state?.banish_substitute_choice,
    bs?.pending_effect, !!bs?.effect_stack, !!bs?.pending_spell,
  ]);

  // CPU対戦：CPU が respondPlayer として応答すべき pending_effect を自動解決
  // 「対戦相手は手札を捨てる」等、効果の解決をCPUが行う必要がある場合
  useEffect(() => {
    if (!isCpuBattle || !bs?.pending_effect) return;
    const pe = bs.pending_effect;
    const inter = pe.interaction;
    // REARRANGE_SIGNI は効果オーナーが応答（CPUの効果なら現状維持で自動確定）
    if (inter.type === 'REARRANGE_SIGNI') {
      if ((pe.respondPlayerId ?? pe.sourcePlayerId) !== CPU_PLAYER_ID) return;
      const timerRS = setTimeout(() => { handleRearrangeSigniConfirm(null); }, CPU_ACTION_DELAY);
      return () => clearTimeout(timerRS);
    }
    // SELECT_VIRUS_ZONE / SELECT_ZONE / SELECT_SIGNI_ZONE は効果オーナーが応答する（CPUの効果ならCPUがゾーンを自動選択）
    if (inter.type === 'SELECT_VIRUS_ZONE' || inter.type === 'SELECT_ZONE' || inter.type === 'SELECT_SIGNI_ZONE') {
      if ((pe.respondPlayerId ?? pe.sourcePlayerId) !== CPU_PLAYER_ID) return;
      const ownerIsHost = pe.sourcePlayerId === bs.host_id;
      const tgtIsHost = inter.owner === 'self' ? ownerIsHost : !ownerIsHost;
      const tgtState = tgtIsHost ? bs.host_state : bs.guest_state;
      if (inter.type === 'SELECT_VIRUS_ZONE') {
        const tgtVirus = tgtState.field.signi_virus ?? [0, 0, 0];
        // powerDeltaOnZone時はシグニのいるゾーン優先（パワー修正を有効活用）、なければ空きゾーン
        const zone = inter.powerDeltaOnZone !== undefined
          ? ([0, 1, 2].find(zi => (tgtState.field.signi[zi]?.length ?? 0) > 0 && (tgtVirus[zi] ?? 0) === 0)
             ?? [0, 1, 2].find(zi => (tgtState.field.signi[zi]?.length ?? 0) > 0)
             ?? 0)
          : [0, 1, 2].find(zi => (tgtVirus[zi] ?? 0) === 0);
        const timerVZ = setTimeout(() => {
          handleSelectVirusZoneForEffect(zone ?? null);
        }, CPU_ACTION_DELAY);
        return () => clearTimeout(timerVZ);
      }
      if (inter.type === 'SELECT_SIGNI_ZONE') {
        const emptyZoneSZ = [0, 1, 2].find(zi => !(tgtState.field.signi[zi]?.length));
        if (emptyZoneSZ === undefined) return;
        const timerSSZ = setTimeout(() => {
          handleSelectSigniZoneForEffect(emptyZoneSZ);
        }, CPU_ACTION_DELAY);
        return () => clearTimeout(timerSSZ);
      }
      const emptyZone = [0, 1, 2].find(zi => !(tgtState.field.signi[zi]?.length));
      if (emptyZone === undefined) return;
      const timerSZ = setTimeout(() => {
        handleSelectZoneForEffect(emptyZone);
      }, CPU_ACTION_DELAY);
      return () => clearTimeout(timerSZ);
    }
    // 応答者がCPUの場合（respondPlayerId指定、または無指定で効果オーナーがCPU）は自動応答する
    // （CPU所有効果のSELECT_TARGET等はUIに表示されないため、ここで応答しないと固まる）
    if ((pe.respondPlayerId ?? pe.sourcePlayerId) !== CPU_PLAYER_ID) return;
    const timer = setTimeout(() => {
      let selected: string[] = [];
      if (inter.type === 'SELECT_TARGET') {
        if (inter.totalPowerMax !== undefined) {
          // パワー合計上限つき：パワーの小さい順に上限まで貪欲に選ぶ（できるだけ多くバニッシュ）
          const powers = inter.candidatePowers ?? {};
          const sorted = [...inter.candidates].sort((a, b) => (powers[a] ?? 0) - (powers[b] ?? 0));
          let sum = 0;
          for (const n of sorted) {
            const p = powers[n] ?? 0;
            if (sum + p > inter.totalPowerMax) continue;
            sum += p;
            selected.push(n);
          }
        } else {
          const count = typeof inter.count === 'number' ? inter.count : 1;
          const shuffled = [...inter.candidates].sort(() => Math.random() - 0.5);
          selected = shuffled.slice(0, Math.min(count, shuffled.length));
        }
      } else if (inter.type === 'CHOOSE') {
        if (inter.multiSelect) {
          // 複数選択: 利用可能な選択肢からcount個（upToならcount個まで）選択
          const avail = inter.options.filter(o => o.available);
          selected = avail.slice(0, inter.count).map(o => o.id);
        } else {
          const firstAvail = inter.options.find(o => o.available) ?? inter.options[0];
          selected = firstAvail ? [firstAvail.id] : [];
        }
      } else if (inter.type === 'SEARCH') {
        const count = inter.maxPick ?? 0;
        selected = inter.visibleCards.slice(0, count);
      } else if (inter.type === 'LOOK_AND_REORDER') {
        selected = [...inter.cards];
      }
      handleEffectInteraction(selected);
    }, CPU_ACTION_DELAY);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCpuBattle, bs?.pending_effect?.respondPlayerId, bs?.pending_effect]);

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
      await supabase.from('battle_states')
        .update({ effect_stack: isStackDone(newStack) ? null : newStack })
        .eq('room_id', roomId);
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
      if (s.field.key_piece) nums.add(getCardNum(s.field.key_piece));
      (s.field.key_piece_extra ?? []).forEach(n => nums.add(getCardNum(n)));
      addAll(s.field.assist_lrig_l); addAll(s.field.assist_lrig_r);
      (s.field.signi_charms ?? []).forEach(n => n && nums.add(getCardNum(n)));
      (s.field.signi_soul   ?? []).forEach(n => n && nums.add(getCardNum(n)));
      (s.field.signi_seeds  ?? []).forEach(n => n && nums.add(getCardNum(n)));
      (s.field.facedown_signi ?? []).forEach(n => n && nums.add(getCardNum(n))); // 裏向きシグニ（WXDi-P10-034）のカードデータをロード
      // signi_acce: 手札/エナから装着されたアクセカード自身のロードに必須（装着でhand/energyから外れるため
      //   これを走査しないと自身のON_ACCE_ATTACH能力等がeffectsMapから脱落する。WXK05-041デコレ）。
      (s.field.signi_acce   ?? []).forEach(n => n && nums.add(getCardNum(n)));
      addAll(s.field.free_zone);
      // beat_zone: シグニが【ビート】になると field.signi から外れ beat_zone に移るため、これを走査しないと
      //   なったカード自身の ON_BECOME_BEAT（self）が effectsMap から脱落し collectBeatBecameTriggers の
      //   self ループ（effectsMap.get(becameNum)）が空を引く（続き121・WDK14-017 で確認）。any_ally 側は
      //   場に残る発火元シグニ（WDK14-014）から拾えるため非対称に self だけ欠落していた。
      addAll(s.field.beat_zone);
    };
    if (myDeckData) { addAll(myDeckData.main_deck); addAll(myDeckData.lrig_deck); }
    if (bs) { addState(bs.host_state); addState(bs.guest_state); }
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
    nums.add('PR-Di017B');       // REV:アンコーリング
    // 解決待ちのスペル/効果は一時的にどのゾーンにも属さない（pending_spell は hand から除かれ pending に保持）。
    // この瞬間に effectsMap から脱落すると handleCutinPass で spellEff=undefined となり効果が no-op 化するため、
    // pending_spell.card_num と pending_effect.sourceCardNum も明示的にロード対象へ含める。
    if (bs?.pending_spell?.card_num) nums.add(getCardNum(bs.pending_spell.card_num));
    if (bs?.pending_effect?.sourceCardNum) nums.add(getCardNum(bs.pending_effect.sourceCardNum));
    return nums;
  }, [myDeckData, bs]);

  const battleCardMap = useMemo(() => {
    const base = new InstanceMap(cards.filter(c => battleCardNums.has(c.CardNum)).map(c => [c.CardNum, c] as [string, CardData]));
    if (!bs) return base;
    const localIsHost = user.id === bs.host_id;
    const myState = localIsHost ? bs.host_state : bs.guest_state;
    const opState = localIsHost ? bs.guest_state : bs.host_state;
    const allOverrides = { ...(myState.card_identity_overrides ?? {}), ...(opState.card_identity_overrides ?? {}) };
    if (Object.keys(allOverrides).length === 0) return base;
    // card_identity_overrides: instanceId → 差し替えCardNumのカードデータに解決
    const resolved = new Map<string, CardData>(base as Map<string, CardData>);
    for (const [instanceId, overrideNum] of Object.entries(allOverrides)) {
      const overrideCard = base.get(overrideNum);
      if (overrideCard) resolved.set(instanceId, overrideCard);
    }
    return new InstanceMap(resolved);
  }, [cards, battleCardNums, bs, user.id]);

  // サブコンポーネントや既存ヘルパーに渡す配列（最大〜100枚）
  const battleCards = useMemo(() => [...battleCardMap.values()], [battleCardMap]);

  // CONTINUOUS 効果マップ（ベース: カードデータのみ、静的）
  const baseEffectsMap = useMemo(
    () => new InstanceMap(buildEffectsMap(battleCards)),
    [battleCards],
  );

  // granted_effects + under-signi付与 + card_identity_overrides を加味した augmented 効果マップ
  const effectsMap = useMemo(() => {
    if (!bs) return baseEffectsMap;
    const localIsHost = user.id === bs.host_id;
    const myS  = localIsHost ? bs.host_state  : bs.guest_state;
    const opS  = localIsHost ? bs.guest_state : bs.host_state;
    const myTurn = bs.active_user_id === user.id;

    // granted_effects（ターン終了まで）と granted_effects_until_opp_turn（次の相手ターン終了まで）を
    // instanceId 単位で配列結合してマージ（同一キーで一方が欠落しないように）。
    const mergeGranted = (
      a: Record<string, import('../types/effects').CardEffect[]>,
      b: Record<string, import('../types/effects').CardEffect[]>,
    ): Record<string, import('../types/effects').CardEffect[]> => {
      const out: Record<string, import('../types/effects').CardEffect[]> = { ...a };
      for (const [k, v] of Object.entries(b)) out[k] = [...(out[k] ?? []), ...v];
      return out;
    };
    const myGranted = mergeGranted(myS.granted_effects ?? {}, myS.granted_effects_until_opp_turn ?? {});
    const opGranted = mergeGranted(opS.granted_effects ?? {}, opS.granted_effects_until_opp_turn ?? {});
    const hasGranted = Object.keys(myGranted).length > 0 || Object.keys(opGranted).length > 0;

    // スタックあり（ライズ）ゾーンの有無チェック
    const hasStack = [...myS.field.signi, ...opS.field.signi].some(s => s && s.length >= 2);

    // card_identity_overrides（サーバントZERO等）
    const myOverrides = myS.card_identity_overrides ?? {};
    const opOverrides = opS.card_identity_overrides ?? {};
    const hasOverrides = Object.keys(myOverrides).length > 0 || Object.keys(opOverrides).length > 0;

    // レイヤー等のフィールド付与（GRANT_FIELD_SIGNI_ABILITY）持ちシグニの有無チェック
    const hasFieldGrant = [...myS.field.signi, ...opS.field.signi].some(s => {
      const top = s?.at(-1);
      if (!top) return false;
      return (baseEffectsMap.get(top) ?? []).some(e =>
        e.effectType === 'CONTINUOUS' && e.action.type === 'GRANT_FIELD_SIGNI_ABILITY');
    });

    // アクセ付与（GRANT_ACCE_HOST_ABILITY）持ちアクセカードの有無チェック
    const hasAcceGrant = [...(myS.field.signi_acce ?? []), ...(opS.field.signi_acce ?? [])].some(acceNum => {
      if (!acceNum) return false;
      return (baseEffectsMap.get(acceNum) ?? []).some(e =>
        e.effectType === 'CONTINUOUS' && e.action.type === 'GRANT_ACCE_HOST_ABILITY');
    });

    // ソウル付与（GRANT_SOUL_HOST_ABILITY）持ちソウルカードの有無チェック
    const hasSoulGrant = [...(myS.field.signi_soul ?? []), ...(opS.field.signi_soul ?? [])].some(soulNum => {
      if (!soulNum) return false;
      return (baseEffectsMap.get(soulNum) ?? []).some(e =>
        e.effectType === 'CONTINUOUS' && e.action.type === 'GRANT_SOUL_HOST_ABILITY');
    });

    // COPY_LRIG_NAME_ABILITY で「そのルリグの【常】能力を得る」センタールリグの有無チェック
    const hasCopyLrigCont = [myS, opS].some(st => {
      const top = st.field.lrig.at(-1);
      if (!top) return false;
      const txt = battleCardMap.get(top)?.EffectText ?? '';
      if (!/そのルリグの【常】能力を得る/.test(txt)) return false;
      return (baseEffectsMap.get(top) ?? []).some(e =>
        e.effectType === 'CONTINUOUS' && e.action.type === 'STUB' &&
        (e.action as import('../types/effects').StubAction).id === 'COPY_LRIG_NAME_ABILITY');
    });

    if (!hasGranted && !hasStack && !hasOverrides && !hasFieldGrant && !hasAcceGrant && !hasSoulGrant && !hasCopyLrigCont) return baseEffectsMap;

    const augMap = new Map<string, import('../types/effects').CardEffect[]>(baseEffectsMap);

    // COPY_LRIG_NAME_ABILITY 【常】能力コピー：ルリグトラッシュの該当ルリグの CONTINUOUS 効果を
    // センタールリグ（instanceId）に注入する。これにより各 CONTINUOUS 収集関数が自動的に拾う。
    if (hasCopyLrigCont) {
      for (const [st, otherSt, isTurn] of [[myS, opS, myTurn], [opS, myS, !myTurn]] as const) {
        const copiedCont = collectCopiedLrigContinuousEffects(st, battleCardMap, baseEffectsMap, otherSt, isTurn);
        if (copiedCont.length === 0) continue;
        const top = st.field.lrig.at(-1)!;
        const base = augMap.get(top) ?? baseEffectsMap.get(top) ?? [];
        augMap.set(top, [...base, ...copiedCont]);
      }
    }

    // card_identity_overrides: ZERO化されたシグニの効果を差し替えカードの効果に設定（通常は空）
    for (const [instanceId, overrideNum] of [...Object.entries(myOverrides), ...Object.entries(opOverrides)]) {
      const overrideEffects = baseEffectsMap.get(overrideNum) ?? [];
      augMap.set(instanceId, overrideEffects);
    }

    // granted_effects の適用
    for (const [instanceId, granted] of [...Object.entries(myGranted), ...Object.entries(opGranted)]) {
      const base = augMap.get(getCardNum(instanceId)) ?? [];
      augMap.set(instanceId, [...base, ...granted]);
    }

    // under-signi → top-signi 効果付与（collectGrantedFromUnderSigni）
    if (hasStack) {
      const myUnder = collectGrantedFromUnderSigni(myS, opS, myTurn, augMap, battleCardMap);
      const opUnder = collectGrantedFromUnderSigni(opS, myS, !myTurn, augMap, battleCardMap);
      for (const [num, extra] of [...myUnder, ...opUnder]) {
        const base = augMap.get(num) ?? augMap.get(getCardNum(num)) ?? [];
        augMap.set(num, [...base, ...extra]);
      }
    }

    // レイヤー等のフィールド付与（collectGrantedFromLayer）
    if (hasFieldGrant) {
      const myLayer = collectGrantedFromLayer(myS, opS, myTurn, augMap, battleCardMap);
      const opLayer = collectGrantedFromLayer(opS, myS, !myTurn, augMap, battleCardMap);
      for (const [num, extra] of [...myLayer, ...opLayer]) {
        const base = augMap.get(num) ?? augMap.get(getCardNum(num)) ?? [];
        augMap.set(num, [...base, ...extra]);
      }
    }

    // アクセ→ホストシグニ付与（collectGrantedFromAcce）
    if (hasAcceGrant) {
      const myAcce = collectGrantedFromAcce(myS, opS, myTurn, augMap, battleCardMap);
      const opAcce = collectGrantedFromAcce(opS, myS, !myTurn, augMap, battleCardMap);
      for (const [num, extra] of [...myAcce, ...opAcce]) {
        const base = augMap.get(num) ?? augMap.get(getCardNum(num)) ?? [];
        augMap.set(num, [...base, ...extra]);
      }
    }

    // ソウル→ホストシグニ付与（collectGrantedFromSoul）
    if (hasSoulGrant) {
      const mySoul = collectGrantedFromSoul(myS, opS, myTurn, augMap, battleCardMap);
      const opSoul = collectGrantedFromSoul(opS, myS, !myTurn, augMap, battleCardMap);
      for (const [num, extra] of [...mySoul, ...opSoul]) {
        const base = augMap.get(num) ?? augMap.get(getCardNum(num)) ?? [];
        augMap.set(num, [...base, ...extra]);
      }
    }

    return new InstanceMap(augMap);
  }, [bs, baseEffectsMap, user.id, battleCardMap]);

  // フィールドシグニの有効パワー（CONTINUOUS 効果適用済み）
  const effectivePowers = useMemo(() => {
    if (!bs) return new Map<string, number>();
    const localIsHost = user.id === bs.host_id;
    const myS  = localIsHost ? bs.host_state  : bs.guest_state;
    const opS  = localIsHost ? bs.guest_state : bs.host_state;
    const myTurn = bs.active_user_id === user.id;
    const base = calcFieldPowers(myS, opS, myTurn, effectsMap, battleCardMap, bs.turn_phase);
    // lrig_attack_phase_power_down_per_signi: アタックフェイズ中に相手シグニのパワーを自シグニ数×N下げる
    const isAttackPhase = ['ATTACK_ARTS', 'ATTACK_ARTS_OP', 'ATTACK_SIGNI', 'ATTACK_LRIG'].includes(bs.turn_phase);
    if (isAttackPhase && (myS.lrig_attack_phase_power_down_per_signi ?? 0) > 0) {
      const friendlyCount = myS.field.signi.filter(s => s?.length).length;
      const penalty = -(myS.lrig_attack_phase_power_down_per_signi! * friendlyCount);
      const result = new Map(base);
      for (const stack of opS.field.signi) {
        const top = stack?.at(-1);
        if (top) result.set(top, (result.get(top) ?? 0) + penalty);
      }
      return result;
    }
    return base;
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
    return [
      ...collectLrigGrantedEffects(myS, opS, myTurn, effectsMap, battleCardMap),
      ...(myS.lrig_granted_auto_effects ?? []),
    ];
  }, [bs, effectsMap, battleCardMap, user.id]);

  // フィールド（シグニ＋センタールリグ）にCONTINUOUS GRANT_KEYWORD マルチエナ（count:ALL）効果があるか
  // WX01-027（シグニ）・WX05-006（ルリグLv5）のような「全エナにマルチエナ付与」効果を検出
  const myEnaAllMulti = useMemo(() => {
    if (!bs) return false;
    const localIsHost = user.id === bs.host_id;
    const myS = localIsHost ? bs.host_state : bs.guest_state;
    const opS = localIsHost ? bs.guest_state : bs.host_state;
    const isMyTurnNow = bs.active_user_id === user.id;
    const hasAllMultiEffect = (cardNum: string) =>
      (effectsMap.get(cardNum) ?? []).some(e =>
        e.effectType === 'CONTINUOUS' &&
        e.action?.type === 'GRANT_KEYWORD' &&
        (e.action as { keyword: string }).keyword === 'マルチエナ' &&
        (e.action as { target: { count: unknown } }).target?.count === 'ALL' &&
        // グロウ条件等の activeCondition（WX05-006「エナの色が3種類以上」）を尊重
        (!e.activeCondition || checkActiveCondition(e.activeCondition, myS, opS, isMyTurnNow, battleCardMap, cardNum))
      );
    // シグニゾーン
    if (myS.field.signi.some(stack => { const top = stack?.at(-1); return !!top && hasAllMultiEffect(top); })) return true;
    // センタールリグ
    const lrigTop = myS.field.lrig.at(-1);
    if (lrigTop && hasAllMultiEffect(lrigTop)) return true;
    return false;
  }, [bs, effectsMap, user.id, battleCardMap]);

  // ── Rules of Hooks 対策：PLAYING セクション由来の hooks を if(!bs)/SETUP return より前に置く ──

  // CPU対戦: ゲーム終了時にCPUのACKを自動設定
  useEffect(() => {
    if (!isCpuBattle || bs?.global_phase !== 'FINISHED' || bs?.guest_end_ack) return;
    supabase.from('battle_states').update({ guest_end_ack: true }).eq('room_id', roomId);
  }, [isCpuBattle, bs?.global_phase, bs?.guest_end_ack, roomId]);

  // CPU対戦: 両者ACK揃い次第ルームを自動削除
  useEffect(() => {
    if (!isCpuBattle || !bs?.host_end_ack || !bs?.guest_end_ack) return;
    leavingRef.current = true;
    supabase.from('battle_states').delete().eq('room_id', roomId).then(() => {
      supabase.from('rooms').delete().eq('id', roomId).then(() => onBack());
    });
  }, [isCpuBattle, bs?.host_end_ack, bs?.guest_end_ack, roomId, onBack]);

  // CONTINUOUS BLOCK_ACTION 効果によるアクション禁止（フィールド常駐効果）
  const contBlocked = useMemo(() => {
    if (!bs || bs.global_phase !== 'PLAYING') return { forSelf: new Set<string>(), forOther: new Set<string>(), cannotAttackSigni: new Set<string>() };
    const localIsHost = user.id === bs.host_id;
    const myS = localIsHost ? bs.host_state : bs.guest_state;
    const opS = localIsHost ? bs.guest_state : bs.host_state;
    const myTurn = bs.active_user_id === user.id;
    return calcContinuousBlockedActions(myS, opS, myTurn, effectsMap, battleCardMap);
   
  }, [bs, effectsMap, battleCardMap, user.id]);

  // LOSE_COLOR_ALL_ZONES: チームルリグ3体未満→全ゾーン色喪失カードのリスト
  const myColorlessOverrides = useMemo(() => {
    if (!bs || bs.global_phase !== 'PLAYING') return [] as string[];
    const localIsHost = user.id === bs.host_id;
    const myS = localIsHost ? bs.host_state : bs.guest_state;
    const opS = localIsHost ? bs.guest_state : bs.host_state;
    return collectColorlessOverrides(myS, opS, battleCardMap).ownerColorless;
   
  }, [bs, battleCardMap, user.id]);

  // PREVENT_ZONE_MOVE_BY_OPP はresolveStackNext内でotherProtectedZonesとして動的計算

  // 英知CONTINUOUS STUB効果: SUPPRESS_LIFE_BURST_ON_CRASH など（動的チェック）
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

  // FIELD_ENERGY_SIGNI_GAIN_COLOR: エナゾーンの追加色マップ（instId -> 追加色）
  // ALL_ZONE_BLACK / ALL_CARDS_COLOR_CHANGE_BLACK も考慮
  const myEnergyExtraColors = useMemo((): Map<string, string> => {
    const map = new Map<string, string>();
    if (!bs || bs.global_phase !== 'PLAYING') return map;
    const localIsHost = user.id === bs.host_id;
    const myS = localIsHost ? bs.host_state : bs.guest_state;
    const opS = localIsHost ? bs.guest_state : bs.host_state;
    const myTurn = bs.active_user_id === user.id;
    for (const { gainColor, instIds } of collectFieldEnergySigniColorGains(myS, battleCardMap, effectsMap)) {
      for (const id of instIds) map.set(id, gainColor);
    }
    // ALL_ZONE_BLACK: 全ゾーンで黒でもあるカードをエナ内で黒追加
    const allZoneBlackNums = collectAllZoneBlackCardNums(effectsMap);
    const allMyCardsBlack = hasAllCardsColorBlack(myS, opS, myTurn, effectsMap, battleCardMap);
    if (allZoneBlackNums.size > 0 || allMyCardsBlack) {
      for (const instId of myS.energy) {
        const baseNum = getCardNum(instId);
        const card = battleCardMap.get(baseNum);
        const currentColor = card?.Color ?? '無';
        if (!currentColor.includes('黒') && !map.has(instId)) {
          if (allMyCardsBlack || allZoneBlackNums.has(baseNum)) map.set(instId, '黒');
        }
      }
    }
    return map;
  }, [bs, battleCardMap, effectsMap, user.id]);

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
    return collectArtsThresholdCostReductions(myS, battleCardMap, effectsMap);
  }, [bs, battleCardMap, effectsMap, user.id]);

  // HAND_SIZE_INCREASE / REDUCE_OPP_HAND_LIMIT: 実効手札上限（自分のターン終了時に適用）
  const myEffectiveHandLimit = useMemo(() => {
    if (!bs || bs.global_phase !== 'PLAYING') return 6;
    const localIsHost = user.id === bs.host_id;
    const myS = localIsHost ? bs.host_state : bs.guest_state;
    const opS = localIsHost ? bs.guest_state : bs.host_state;
    return collectHandLimits(myS, opS, battleCardMap, effectsMap);
   
  }, [bs, battleCardMap, effectsMap, user.id]);

  // HAND_SIGNI_HAS_GUARD_ICON: 手札の特定クラスのシグニがガード可能
  const myHandGuardClasses = useMemo((): string[] => {
    if (!bs || bs.global_phase !== 'PLAYING') return [];
    const localIsHost = user.id === bs.host_id;
    const myS = localIsHost ? bs.host_state : bs.guest_state;
    const opS = localIsHost ? bs.guest_state : bs.host_state;
    const myTurn = bs.active_user_id === user.id;
    return collectHandGuardIconClasses(myS, battleCardMap, effectsMap, opS, myTurn);
  }, [bs, battleCardMap, effectsMap, user.id]);

  // CENTER_LRIG_COLOR_CHANGE_BLACK / LRIG_LIMIT_UP_AND_COLOR_GAIN: ルリグの色・リミット変更
  const myLrigColorAndLimitMods = useMemo(() => {
    if (!bs || bs.global_phase !== 'PLAYING') return { extraColors: [] as string[], limitDelta: 0 };
    const localIsHost = user.id === bs.host_id;
    const myS = localIsHost ? bs.host_state : bs.guest_state;
    const opS = localIsHost ? bs.guest_state : bs.host_state;
    const myTurn = bs.active_user_id === user.id;
    return collectLrigColorAndLimitMods(myS, battleCardMap, effectsMap, opS, myTurn);
  }, [bs, battleCardMap, effectsMap, user.id]);

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

  }, [bs?.pending_effect]);

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
        await supabase.from('battle_states').update({ [stateKey]: cleared }).eq('room_id', roomId);
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
        for (const cn of revealedHJ) {
          if (!localMy.hand.includes(cn)) continue;
          for (const eff of (effectsMap.get(cn) ?? [])) {
            if (eff.effectType !== 'AUTO' || !eff.timing?.includes('ON_REVEALED_FROM_HAND')) continue;
            entries.push({
              id: generateUUID(),
              playerId: user.id,
              cardNum: cn,
              effectId: eff.effectId,
              label: `${battleCardMap.get(cn)?.CardName ?? cn}【自】手札公開時`,
              effect: eff,
            });
          }
        }
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
          localIsHost ? bs.guest_state : bs.host_state, localIsHost ? bs.guest_id : bs.host_id);
        entries.push(...hdEntries);
        const cleared: PlayerState = {
          ...localMy,
          hand_revealed_just: null,
          hand_discarded_just: null,
          actions_done: usedLimitIds.length > 0 ? [...(localMy.actions_done ?? []), ...usedLimitIds] : localMy.actions_done,
        };
        const update: Record<string, unknown> = { [stateKey]: cleared };
        // CPU戦: CPU(guest)が捨てた手札 → CPU自身の self/any 効果 + 人間(host)の 'any' 効果を収集し、guest フラグをクリア
        if (cpuDiscardedHJ.length > 0) {
          const { entries: cpuHd, usedLimitIds: cpuUsed } = collectHandDiscardTriggers(
            cpuDiscardedHJ, bs.guest_state, CPU_PLAYER_ID, false, bs.host_state, bs.host_id);
          entries.push(...cpuHd);
          update.guest_state = {
            ...bs.guest_state,
            hand_discarded_just: null,
            actions_done: cpuUsed.length > 0 ? [...(bs.guest_state.actions_done ?? []), ...cpuUsed] : bs.guest_state.actions_done,
          };
        }
        if (entries.length > 0) {
          const existingStack = bs.effect_stack ?? null;
          update.effect_stack = existingStack
            ? pushToStack(existingStack, entries)
            : initStack(bs.active_user_id ?? user.id, entries);
        }
        await supabase.from('battle_states').update(update).eq('room_id', roomId);
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
        const update: Record<string, unknown> = {};
        const handleVirusFlagsFor = (
          state: PlayerState, opState: PlayerState, stateKey: string, ownerId: string,
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
          update[stateKey] = {
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
        if (entries.length > 0) {
          const existingStack = bs.effect_stack ?? null;
          update.effect_stack = existingStack
            ? pushToStack(existingStack, entries)
            : initStack(bs.active_user_id ?? user.id, entries);
        }
        await supabase.from('battle_states').update(update).eq('room_id', roomId);
      } finally {
        setLoading(false);
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myVirusPlacedRef, myVirusRemovedRef, cpuVirusPlacedRef, cpuVirusRemovedRef, bs?.effect_stack, bs?.pending_effect]); // eslint-disable-line react-hooks/exhaustive-deps

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
        const update: Record<string, unknown> = {};
        const usedByKey: Record<string, string[]> = {};
        const handleMovedFor = (
          moverState: PlayerState, otherState: PlayerState,
          moverKey: string, otherKey: string, moverId: string, otherId: string,
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
        const applyState = (key: string, base: PlayerState, clearFlag: boolean) => {
          const used = usedByKey[key];
          if (!used && !clearFlag) return;
          update[key] = {
            ...(update[key] as PlayerState ?? base),
            ...(clearFlag ? { zone_moved_just: null } : {}),
            ...(used ? { actions_done: [...(base.actions_done ?? []), ...used] } : {}),
          };
        };
        applyState('host_state', hostS, !!(processOwn && localIsHost));
        applyState('guest_state', guestS, !!((processOwn && !localIsHost) || processCpu));
        if (entries.length > 0) {
          const existingStack = bs.effect_stack ?? null;
          update.effect_stack = existingStack
            ? pushToStack(existingStack, entries)
            : initStack(bs.active_user_id ?? user.id, entries);
        }
        if (Object.keys(update).length > 0) {
          await supabase.from('battle_states').update(update).eq('room_id', roomId);
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
        const update: Record<string, unknown> = {};
        const usedByKey: Record<string, string[]> = {};
        const handleDriveFor = (
          driverState: PlayerState, otherState: PlayerState,
          driverKey: string, otherKey: string, driverId: string, otherId: string,
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
        const applyState = (key: string, base: PlayerState, clearFlag: boolean) => {
          const used = usedByKey[key];
          if (!used && !clearFlag) return;
          update[key] = {
            ...(update[key] as PlayerState ?? base),
            ...(clearFlag ? { drive_became_just: null } : {}),
            ...(used ? { actions_done: [...(base.actions_done ?? []), ...used] } : {}),
          };
        };
        applyState('host_state', hostS, !!(processOwn && localIsHost));
        applyState('guest_state', guestS, !!((processOwn && !localIsHost) || processCpu));
        if (entries.length > 0) {
          const existingStack = bs.effect_stack ?? null;
          update.effect_stack = existingStack
            ? pushToStack(existingStack, entries)
            : initStack(bs.active_user_id ?? user.id, entries);
        }
        if (Object.keys(update).length > 0) {
          await supabase.from('battle_states').update(update).eq('room_id', roomId);
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
        const update: Record<string, unknown> = {};
        const usedByKey: Record<string, string[]> = {};
        const handleBeatFor = (ownerState: PlayerState, ownerKey: string, ownerId: string) => {
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
        const applyState = (key: string, base: PlayerState, clearFlag: boolean) => {
          const used = usedByKey[key];
          if (!used && !clearFlag) return;
          update[key] = {
            ...(update[key] as PlayerState ?? base),
            ...(clearFlag ? { beat_became_just: null } : {}),
            ...(used ? { actions_done: [...(base.actions_done ?? []), ...used] } : {}),
          };
        };
        applyState('host_state', hostS, !!(processOwn && localIsHost));
        applyState('guest_state', guestS, !!((processOwn && !localIsHost) || processCpu));
        if (entries.length > 0) {
          const existingStack = bs.effect_stack ?? null;
          update.effect_stack = existingStack
            ? pushToStack(existingStack, entries)
            : initStack(bs.active_user_id ?? user.id, entries);
        }
        if (Object.keys(update).length > 0) {
          await supabase.from('battle_states').update(update).eq('room_id', roomId);
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
    for (const { st, op, ownerId, prevE } of sides) {
      const isOwnerActiveTurn = ownerId === bs.active_user_id;
      // ON_ENERGY_CHARGE: エナがちょうど1枚増えたとき（差分の新規カードが1枚）
      const addedToEnergy = st.energy.filter(n => !prevE.includes(n));
      // ON_POWER_THRESHOLD / ON_ENERGY_CHARGE は場のシグニを走査
      for (let zi = 0; zi < st.field.signi.length; zi++) {
        const topNum = st.field.signi[zi]?.at(-1);
        if (!topNum) continue;
        for (const eff of effectsMap.get(topNum) ?? []) {
          if (eff.effectType !== 'AUTO') continue;
          if (eff.timing?.includes('ON_ENERGY_CHARGE') && addedToEnergy.length === 1) {
            // 「あなたのターンの間」= IS_MY_TURN（evalでは常にtrueのため、ここで自ターン判定）
            if (eff.condition?.type === 'IS_MY_TURN' && !isOwnerActiveTurn) continue;
            if (eff.condition && eff.condition.type !== 'IS_MY_TURN'
                && !evalUseCondition(eff.condition, st, op, battleCardMap, topNum, bs.turn_phase, curPowers)) continue;
            entries.push({ id: generateUUID(), playerId: ownerId, cardNum: topNum, effectId: eff.effectId,
              label: `${battleCardMap.get(topNum)?.CardName ?? topNum} の【自】効果（エナチャージ時）`, effect: eff });
          }
          if (eff.timing?.includes('ON_POWER_THRESHOLD')) {
            const threshold = eff.condition?.type === 'SELF_POWER_GTE' ? eff.condition.value : Infinity;
            const curP  = curPowers.get(topNum) ?? 0;
            const prevP = prevPowers.get(topNum);
            const wasBelow = prevP === undefined || prevP < threshold;
            if (curP >= threshold && wasBelow) {
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
        await supabase.from('battle_states').update({ effect_stack: newStack }).eq('room_id', roomId);
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
      const pick = choices[Math.floor(Math.random() * 3)];
      await supabase.from('battle_states').update({ guest_janken: pick }).eq('room_id', roomId);
      return;
    }

    if (phase === 'LRIG_SELECT' && cpuDeckData) {
      const lrigWithIds = assignGuestInstanceIds(cpuDeckData.lrig_deck);
      const mainWithIds = assignGuestInstanceIds(shuffle(cpuDeckData.main_deck));
      const lv0Idx = cpuDeckData.lrig_deck.findIndex(num => {
        const c = cards.find(card => card.CardNum === num);
        return c?.Type === 'ルリグ' && c.Level === '0';
      });
      if (lv0Idx < 0) return;
      const selectedId = lrigWithIds[lv0Idx];
      const lrigDeckIds = lrigWithIds.filter((_, i) => i !== lv0Idx);
      // ゲーム開始時、センタールリグのコイン欄（ナナシ其ノ零ノ禍等）分のコインを得る
      const cpuStartCoins = Math.min(5, parseInt(cards.find(card => card.CardNum === cpuDeckData.lrig_deck[lv0Idx])?.Coin ?? '0') || 0);
      const cpuState: PlayerState = {
        life_cloth: [], hand: mainWithIds.slice(0, 5), deck: mainWithIds.slice(5),
        lrig_deck: lrigDeckIds, trash: [], lrig_trash: [], energy: [], coins: cpuStartCoins,
        field: { lrig: [selectedId], signi: [null, null, null], assist_lrig_l: [], assist_lrig_r: [], check: null, key_piece: null, free_zone: [] },
      };
      await supabase.from('battle_states').update({
        guest_lrig_selected: cpuDeckData.lrig_deck[lv0Idx],
        guest_state: cpuState,
      }).eq('room_id', roomId);
      return;
    }

    if (phase === 'MULLIGAN') {
      const cpuSt = bs.guest_state;
      const newLifeCloth = cpuSt.deck.slice(0, 7);
      const newDeck = cpuSt.deck.slice(7);
      const newCpuSt: PlayerState = { ...cpuSt, deck: newDeck, life_cloth: newLifeCloth };
      await supabase.from('battle_states').update({
        guest_state: newCpuSt,
        guest_mulligan_done: true,
      }).eq('room_id', roomId);
      const { data: fresh } = await supabase
        .from('battle_states').select('host_mulligan_done, guest_mulligan_done, first_player_id')
        .eq('room_id', roomId).single();
      if (fresh?.host_mulligan_done && fresh?.guest_mulligan_done) {
        await supabase.from('battle_states').update({
          global_phase: 'PLAYING',
          setup_phase: null,
          active_user_id: fresh.first_player_id as string,
        }).eq('room_id', roomId);
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
    await supabase.from('battle_states').delete().eq('room_id', roomId);
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
          const myUpdate = isHost ? { host_janken: choice } : { guest_janken: choice };
          await supabase.from('battle_states').update(myUpdate).eq('room_id', roomId);

          const { data: fresh } = await supabase
            .from('battle_states').select('host_janken, guest_janken')
            .eq('room_id', roomId).single();

          if (fresh?.host_janken && fresh?.guest_janken && !transitioningRef.current) {
            transitioningRef.current = true;
            const winner = jankenWinner(fresh.host_janken, fresh.guest_janken, bs.host_id, bs.guest_id);
            const transUpdate: Partial<BattleStateRow> = winner
              ? { first_player_id: winner, setup_phase: 'LRIG_SELECT', host_janken: null, guest_janken: null }
              : { host_janken: null, guest_janken: null };
            await new Promise(resolve => setTimeout(resolve, 1800));
            await supabase.from('battle_states').update(transUpdate).eq('room_id', roomId);
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

      const lv0Lrigs = myDeckData.lrig_deck
        .filter((num, i, arr) => arr.indexOf(num) === i)
        .map(num => battleCardMap.get(num))
        .filter((c): c is CardData => !!c && c.Type === 'ルリグ' && c.Level === '0');

      const handleSelectLrig = async (cardNum: string) => {
        if (loading) return;
        setLoading(true);
        // ゲストはホストとinstance IDが衝突しないよう #g プレフィックスを使う
        const assignFn = isHost ? assignInstanceIds : assignGuestInstanceIds;
        // インスタンスIDを付与（シャッフル後のmainDeckとlrigDeck全体に連番を振る）
        const mainWithIds  = assignFn(shuffle(myDeckData.main_deck));
        const lrigWithIds  = assignFn(myDeckData.lrig_deck);
        // 選択されたルリグのインスタンスIDを取得
        const selOrigIdx   = myDeckData.lrig_deck.indexOf(cardNum);
        const selectedId   = selOrigIdx >= 0 ? lrigWithIds[selOrigIdx] : `${cardNum}#1`;

        // Lv0ルリグが3枚以上ならアシスト配置フローへ（アシストゾーンの基底は通常ルリグ）
        const allLv0Indices = myDeckData.lrig_deck
          .map((num, i) => {
            const c = battleCardMap.get(num);
            return c && c.Type === 'ルリグ' && c.Level === '0' ? i : -1;
          })
          .filter(i => i >= 0);

        if (allLv0Indices.length >= 3) {
          const remainingLv0 = allLv0Indices
            .filter(i => i !== selOrigIdx)
            .map(i => ({ cardNum: myDeckData.lrig_deck[i], instanceId: lrigWithIds[i], origIdx: i }));
          setPendingLrigSetup({
            centerCardNum: cardNum,
            centerInstanceId: selectedId,
            lrigWithIds,
            mainWithIds,
            remainingLv0,
            assistStep: 'confirm',
            assistLInstanceId: null,
            assistLCardNum: null,
          });
          setLoading(false);
          return;
        }

        // Lv0ルリグ1〜2枚：アシストなしで通常セットアップ
        // ゲーム開始時、センタールリグのコイン欄（ナナシ其ノ零ノ禍等）分のコインを得る
        const startCoins = Math.min(5, parseInt(battleCardMap.get(cardNum)?.Coin ?? '0') || 0);
        const lrigDeckIds  = lrigWithIds.filter((_, i) => i !== selOrigIdx);
        const myState: PlayerState = {
          life_cloth: [], hand: mainWithIds.slice(0, 5), deck: mainWithIds.slice(5),
          lrig_deck: lrigDeckIds,
          trash: [], lrig_trash: [], energy: [], coins: startCoins,
          field: { lrig: [selectedId], signi: [null, null, null], assist_lrig_l: [], assist_lrig_r: [], check: null, key_piece: null, free_zone: [] },
        };
        const update = isHost
          ? { host_lrig_selected: cardNum, host_state: myState }
          : { guest_lrig_selected: cardNum, guest_state: myState };
        await supabase.from('battle_states').update(update).eq('room_id', roomId);
        setLoading(false);
      };

      // アシストルリグセットアップフロー
      if (pendingLrigSetup) {
        const setup = pendingLrigSetup;
        const centerCard = battleCardMap.get(setup.centerCardNum);

        const confirmNoAssist = async () => {
          setLoading(true);
          const startCoinsNA = Math.min(5, parseInt(centerCard?.Coin ?? '0') || 0);
          const lrigDeckIds = setup.lrigWithIds.filter(id => id !== setup.centerInstanceId);
          const myState: PlayerState = {
            life_cloth: [], hand: setup.mainWithIds.slice(0, 5), deck: setup.mainWithIds.slice(5),
            lrig_deck: lrigDeckIds,
            trash: [], lrig_trash: [], energy: [], coins: startCoinsNA,
            field: { lrig: [setup.centerInstanceId], signi: [null, null, null], assist_lrig_l: [], assist_lrig_r: [], check: null, key_piece: null, free_zone: [] },
          };
          const update = isHost
            ? { host_lrig_selected: setup.centerCardNum, host_state: myState }
            : { guest_lrig_selected: setup.centerCardNum, guest_state: myState };
          await supabase.from('battle_states').update(update).eq('room_id', roomId);
          setPendingLrigSetup(null);
          setLoading(false);
        };

        const selectAssistL = (instanceId: string, cardNum: string) => {
          setPendingLrigSetup({ ...setup, assistStep: 'select_r', assistLInstanceId: instanceId, assistLCardNum: cardNum });
        };

        const selectAssistR = async (instanceId: string) => {
          if (!setup.assistLInstanceId) return;
          setLoading(true);
          const startCoinsAR = Math.min(5, parseInt(centerCard?.Coin ?? '0') || 0);
          const usedIds = new Set([setup.centerInstanceId, setup.assistLInstanceId, instanceId]);
          const lrigDeckIds = setup.lrigWithIds.filter(id => !usedIds.has(id));
          const myState: PlayerState = {
            life_cloth: [], hand: setup.mainWithIds.slice(0, 5), deck: setup.mainWithIds.slice(5),
            lrig_deck: lrigDeckIds,
            trash: [], lrig_trash: [], energy: [], coins: startCoinsAR,
            field: {
              lrig: [setup.centerInstanceId],
              signi: [null, null, null],
              assist_lrig_l: [setup.assistLInstanceId],
              assist_lrig_r: [instanceId],
              check: null, key_piece: null, free_zone: [],
            },
          };
          const update = isHost
            ? { host_lrig_selected: setup.centerCardNum, host_state: myState }
            : { guest_lrig_selected: setup.centerCardNum, guest_state: myState };
          await supabase.from('battle_states').update(update).eq('room_id', roomId);
          setPendingLrigSetup(null);
          setLoading(false);
        };

        const btnStyle = { padding: '12px 20px', borderRadius: 8, cursor: 'pointer', border: C.borderUIMid, backgroundColor: C.bgButton, color: C.text, fontSize: 14, textAlign: 'left' as const };

        if (setup.assistStep === 'confirm') {
          return (
            <div style={setupWrap}>
              <h2 style={{ color: C.text, margin: 0 }}>アシストルリグを配置しますか？</h2>
              <p style={{ color: C.textDim, margin: 0, fontSize: 13 }}>
                センター: {centerCard?.CardName ?? setup.centerCardNum}
              </p>
              <p style={{ color: C.textFaint, fontSize: 12, margin: 0 }}>
                ルリグを配置する枚数は1枚（センターのみ）か3枚（センター＋アシスト左右）です
              </p>
              <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
                <button onClick={() => setPendingLrigSetup({ ...setup, assistStep: 'select_l' })} disabled={loading}
                  style={{ ...btnStyle, backgroundColor: C.accent, fontWeight: 'bold' }}>
                  配置する（3枚）
                </button>
                <button onClick={confirmNoAssist} disabled={loading} style={btnStyle}>
                  配置しない（1枚）
                </button>
              </div>
            </div>
          );
        }

        if (setup.assistStep === 'select_l') {
          return (
            <div style={setupWrap}>
              <h2 style={{ color: C.text, margin: 0 }}>アシストルリグ（左）を選択</h2>
              <p style={{ color: C.textDim, margin: 0, fontSize: 13 }}>
                センター: {centerCard?.CardName ?? setup.centerCardNum}
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 320, overflowY: 'auto', width: 300 }}>
                {setup.remainingLv0.map(({ cardNum, instanceId }) => {
                  const c = battleCardMap.get(cardNum);
                  return (
                    <button key={instanceId} onClick={() => selectAssistL(instanceId, cardNum)} disabled={loading}
                      style={btnStyle}>
                      {c?.CardName ?? cardNum}
                      <span style={{ color: C.textFaint, fontSize: 11, marginLeft: 8 }}>{cardNum}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        }

        if (setup.assistStep === 'select_r') {
          const assistLCard = battleCardMap.get(setup.assistLCardNum ?? '');
          const remainingForR = setup.remainingLv0.filter(({ instanceId }) => instanceId !== setup.assistLInstanceId);
          return (
            <div style={setupWrap}>
              <h2 style={{ color: C.text, margin: 0 }}>アシストルリグ（右）を選択</h2>
              <p style={{ color: C.textDim, margin: 0, fontSize: 13 }}>
                センター: {centerCard?.CardName ?? setup.centerCardNum}
                　左: {assistLCard?.CardName ?? setup.assistLCardNum}
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 320, overflowY: 'auto', width: 300 }}>
                {remainingForR.map(({ cardNum, instanceId }) => {
                  const c = battleCardMap.get(cardNum);
                  return (
                    <button key={instanceId} onClick={() => selectAssistR(instanceId)} disabled={loading}
                      style={btnStyle}>
                      {c?.CardName ?? cardNum}
                      <span style={{ color: C.textFaint, fontSize: 11, marginLeft: 8 }}>{cardNum}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        }
      }

      return (
        <>{setupLeaveConfirmModal}<div style={setupWrap}>
          <h2 style={{ color: C.text, margin: 0 }}>センタールリグを配置</h2>
          <p style={{ color: C.textDim, margin: 0, fontSize: 13 }}>Lv0ルリグを選ぶとデッキをシャッフルして手札5枚を引きます</p>
          {lv0Lrigs.length === 0 ? (
            <p style={{ color: '#f44' }}>Lv0ルリグが見つかりません。デッキを確認してください。</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 320, overflowY: 'auto', width: 300 }}>
              {lv0Lrigs.map(card => (
                <button key={card.CardNum} onClick={() => handleSelectLrig(card.CardNum)} disabled={loading}
                  style={{ padding: '12px 20px', borderRadius: 8, cursor: 'pointer', border: C.borderUIMid, backgroundColor: C.bgButton, color: C.text, fontSize: 14, textAlign: 'left' }}>
                  {card.CardName}
                  <span style={{ color: C.textFaint, fontSize: 11, marginLeft: 8 }}>{card.CardNum}</span>
                </button>
              ))}
            </div>
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
          let newHand = [...myState.hand];
          let newDeck = [...myState.deck];

          if (mulliganSelected.size > 0) {
            const returning = [...mulliganSelected].map(i => myState.hand[i]);
            const keeping = myState.hand.filter((_, i) => !mulliganSelected.has(i));
            newDeck = shuffle([...newDeck, ...returning]);
            newHand = [...keeping, ...newDeck.slice(0, returning.length)];
            newDeck = newDeck.slice(returning.length);
          }

          const newLifeCloth = newDeck.slice(0, 7);
          newDeck = newDeck.slice(7);

          const newState: PlayerState = { ...myState, hand: newHand, deck: newDeck, life_cloth: newLifeCloth };
          const update = isHost
            ? { host_state: newState, host_mulligan_done: true }
            : { guest_state: newState, guest_mulligan_done: true };
          await supabase.from('battle_states').update(update).eq('room_id', roomId);

          // 最新状態を取得して両者が完了しているか確認
          const { data: fresh } = await supabase
            .from('battle_states')
            .select('host_mulligan_done, guest_mulligan_done, first_player_id')
            .eq('room_id', roomId)
            .single();

          if (fresh?.host_mulligan_done && fresh?.guest_mulligan_done) {
            // 両者完了 → 自分が直接 PLAYING へ遷移させる（両プレイヤーとも送信して確実に反映）
            const playingUpdate = {
              global_phase: 'PLAYING' as const,
              setup_phase: null as null,
              active_user_id: fresh.first_player_id as string,
            };
            await supabase.from('battle_states').update(playingUpdate).eq('room_id', roomId);
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

  // ドロー枚数（先攻1ターン目=1枚、それ以外=2枚）
  const drawCount = bs.turn_count === 1 && bs.active_user_id === bs.first_player_id ? 1 : 2;

  // ─── バニッシュ・ターントリガー ヘルパー ─────────────────────────────
  // detect*/count*（盤面差分の検出/計数）は Stage2 で pure 化＝src/engine/boardDiff.ts に集約（上部 import）。

  // ON_BLOOD_CRYSTAL_ARMOR トリガー収集（Stage2 で pure 化＝triggerCollect.ts。ここは薄いラッパ）。
  // usageLimit（《ターン1回/2回》）消費 effectId を usedHostIds/usedGuestIds で返す（呼び出し元が actions_done へ
  // 書き戻す＝ON_BANISH と同型。Opusタスク12(xxxii)で any_ally が発火するようになり書き戻しが必要になった）。
  const collectArmorTriggers = (
    armoredCardNum: string,
    armoredPlayerId: string,
    afterHostState: PlayerState,
    afterGuestState: PlayerState,
  ): { entries: StackEntry[]; usedHostIds: string[]; usedGuestIds: string[] } =>
    pureCollectArmorTriggers(mkTrigCtx(), armoredCardNum, armoredPlayerId, afterHostState, afterGuestState);

  // ON_LEAVE_FIELD トリガー収集（Stage2 で pure 化＝triggerCollect.ts。ここは薄いラッパ）。
  // causeOwnerId＝離脱を引き起こした効果のオーナー（バトル/ルール処理＝undefined）。
  const collectLeaveFieldTriggers = (
    leftCardNum: string,
    leftUnder: string[],
    leftPlayerId: string,
    afterHostState: PlayerState,
    afterGuestState: PlayerState,
    causeOwnerId?: string,
    leftBeforeState?: PlayerState,
    leftZoneIdx?: number,
  ): { entries: StackEntry[]; usedHostIds: string[]; usedGuestIds: string[] } =>
    pureCollectLeaveFieldTriggers(mkTrigCtx(), leftCardNum, leftUnder, leftPlayerId, afterHostState, afterGuestState, causeOwnerId, leftBeforeState, leftZoneIdx);

  // ON_TRASH ファミリ（Stage2 で pure 化＝triggerCollect.ts。ここは薄いラッパ）。
  const collectDeckTrashSelfTriggers = (trashedCardNum: string, trashedPlayerId: string, causeByOpponent = false): StackEntry[] =>
    pureCollectDeckTrashSelfTriggers(mkTrigCtx(), trashedCardNum, trashedPlayerId, causeByOpponent);
  const collectAnyZoneTrashSelfTriggers = (trashedCardNum: string, trashedPlayerId: string, causeByOpponent = false, origin: 'hand' | 'energy' = 'hand', causeSourceCardNum?: string): StackEntry[] =>
    pureCollectAnyZoneTrashSelfTriggers(mkTrigCtx(), trashedCardNum, trashedPlayerId, causeByOpponent, origin, causeSourceCardNum);
  const collectTrashTriggers = (
    trashedCardNum: string,
    trashedPlayerId: string,
    afterHostState: PlayerState,
    afterGuestState: PlayerState,
    causeByOpponent = false,
    byCostOrEffect = true,
    byEffectCause = true,
  ): { entries: StackEntry[]; usedHostIds: string[]; usedGuestIds: string[] } =>
    pureCollectTrashTriggers(mkTrigCtx(), trashedCardNum, trashedPlayerId, afterHostState, afterGuestState, causeByOpponent, byCostOrEffect, byEffectCause);

  /**
   * バニッシュされたシグニの ON_BANISH 効果 + フィールド上の全シグニのトリガーを収集する。
   * banishedPlayerId: バニッシュされたシグニのオーナーの userId (host_id or guest_id)。
   */
  // ON_BANISH トリガー収集（Stage2 で pure 化＝triggerCollect.ts。ここは薄いラッパ）。
  // usageLimit（《ターン1回/2回》）消費 effectId を usedHostIds/usedGuestIds で返す（呼び出し元が actions_done へ
  // 書き戻す＝他コレクタと同型。続き100で発見した「読むだけで書き戻さない」ノーガード状態を続き135で解消）。
  const collectBanishTriggers = (
    banishedCardNum: string,
    banishedPlayerId: string,
    afterHostState: PlayerState,
    afterGuestState: PlayerState,
    prevOwnerState?: PlayerState, // バニッシュされたカードのオーナーのバニッシュ前状態（アクセ付与ON_BANISH復元用）
  ): { entries: StackEntry[]; usedHostIds: string[]; usedGuestIds: string[] } =>
    pureCollectBanishTriggers(mkTrigCtx(), banishedCardNum, banishedPlayerId, afterHostState, afterGuestState, prevOwnerState);

  // ON_SIGNI_POWER_ZERO_OR_LESS トリガー収集（pure: triggerCollect.ts）。checkAndBanishPowerZero から呼ぶ。
  const collectPowerZeroTriggers = (zeroedCardNum: string, zeroedOwnerId: string, afterHostState: PlayerState, afterGuestState: PlayerState): { entries: StackEntry[]; usedHostIds: string[]; usedGuestIds: string[] } =>
    pureCollectPowerZeroTriggers(mkTrigCtx(), zeroedCardNum, zeroedOwnerId, afterHostState, afterGuestState);

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
  const mkTrigCtx = (): TrigCtx => ({
    hostId: bs.host_id, guestId: bs.guest_id, meId: user.id, activeUserId: bs.active_user_id ?? null,
    turnPhase: bs.turn_phase, effectsMap, cardMap: battleCardMap, effectivePowers, genId: generateUUID,
  });
  const collectTargetedTriggers = (targetedNums: string[], targetedOwnerId: string, afterHostState: PlayerState, afterGuestState: PlayerState): { entries: StackEntry[]; usedHostIds: string[]; usedGuestIds: string[] } =>
    pureCollectTargetedTriggers(mkTrigCtx(), targetedNums, targetedOwnerId, afterHostState, afterGuestState);
  const collectLrigGrowTriggers = (grownOwnerId: string, afterGrowerState: PlayerState, afterOpState: PlayerState): { entries: StackEntry[]; usedHostIds: string[]; usedGuestIds: string[] } =>
    pureCollectLrigGrowTriggers(mkTrigCtx(), grownOwnerId, afterGrowerState, afterOpState);
  const collectCoinPaidTriggers = (payerId: string, afterPayerState: PlayerState, afterOpState: PlayerState): { entries: StackEntry[]; usedIds: string[] } =>
    pureCollectCoinPaidTriggers(mkTrigCtx(), payerId, afterPayerState, afterOpState);
  // 「対戦相手のルリグがアタックしたとき」＝**防御側**の付与AUTO（any_opp/any scope）を収集（タスク12(xlvii)）。
  // 従来この経路が無く、防御側の付与能力が ON_ATTACK_LRIG で一切拾われなかった。
  const collectLrigAttackDefenderTriggers = (defenderState: PlayerState, defenderId: string): { entries: StackEntry[]; usedIds: string[] } =>
    pureCollectLrigAttackDefenderTriggers(mkTrigCtx(), defenderState, defenderId);
  // ON_COIN_PAID の usedIds（《ターン1回/2回》消化）を payer 状態の actions_done へ書き戻すヘルパー（続き106）。
  const applyCoinPaidUsed = (st: PlayerState, coin: { usedIds: string[] }): PlayerState =>
    coin.usedIds.length > 0 ? { ...st, actions_done: [...(st.actions_done ?? []), ...coin.usedIds] } : st;

  /**
   * ターン開始時・終了時・アタックフェイズ開始時の AUTO 効果を収集する。
   * 自分のフィールドシグニ（'self' スコープ）+ ルリグ + 相手の any_opp/any も対象。
   * ※ ON_ATTACK_PHASE_START はターンプレイヤー側のみ発火（「各アタックフェイズ開始時」の
   *    WXEX2-03 も相手アタックフェイズでは発火しない近似）
   */
  // ターン/フェイズ境界トリガー収集（Stage2 で pure 化＝triggerCollect.ts。ここは薄いラッパ）。
  // usageLimit（《ターン1回/2回》）消費 effectId を myState/opState 基準の usedMyIds/usedOpIds で返す
  // （呼び出し元が actions_done へ書き戻す＝他コレクターと同型。続き119でusageLimit配線）。
  // ⚠myState はターンプレイヤー（=user.id=meId）、opState は非ターンプレイヤーである前提（doPhaseAdvance）。
  const collectTurnTriggers = (
    timing: 'ON_TURN_START' | 'ON_TURN_END' | 'ON_ATTACK_PHASE_START' | 'ON_GROW_PHASE_START' | 'ON_MAIN_PHASE_START' | 'ON_LRIG_ATTACK_STEP_START',
    myState: PlayerState,
    opState: PlayerState,
  ): { entries: StackEntry[]; usedMyIds: string[]; usedOpIds: string[] } => {
    const r = pureCollectTurnTriggers(mkTrigCtx(), timing, myState, opState);
    return { entries: r.entries, usedMyIds: isHost ? r.usedHostIds : r.usedGuestIds, usedOpIds: isHost ? r.usedGuestIds : r.usedHostIds };
  };

  // ON_ALLY_PLAY_OR_OPP_HAND_DISCARD 収集（C1・triggerCollect.ts。ここは薄いラッパ）。
  const collectAllyPlayOrOppDiscardTriggers = (
    controllerId: string,
    controllerState: PlayerState,
    allyPlacedNums: string[],
    oppDiscardCount: number,
  ): { entries: StackEntry[]; usedOncePerTurnIds: string[] } =>
    pureCollectAllyPlayOrOppDiscardTriggers(mkTrigCtx(), controllerId, controllerState, allyPlacedNums, oppDiscardCount);

  // ON_MATERIAL_USED（materialUsedByPlayer 変種）収集（改造素材機構 Step3a・triggerCollect.ts。ここは薄いラッパ）。
  const collectMaterialUsedByPlayerTriggers = (
    userId: string,
    userState: PlayerState,
  ): { entries: StackEntry[]; usedOncePerTurnIds: string[] } =>
    pureCollectMaterialUsedByPlayerTriggers(mkTrigCtx(), userId, userState);

  // ON_MATERIAL_USED（self/any_ally 変種）収集（改造素材機構 Step3b・triggerCollect.ts。ここは薄いラッパ）。
  const collectMaterialUsedOnSigniTriggers = (
    targetNums: string[],
    ownerId: string,
    ownerState: PlayerState,
  ): { entries: StackEntry[]; usedOncePerTurnIds: string[] } =>
    pureCollectMaterialUsedOnSigniTriggers(mkTrigCtx(), targetNums, ownerId, ownerState);

  // ON_SIGNI_BANISH_OPPONENT_BY_EFFECT 収集（C1・triggerCollect.ts。ここは薄いラッパ）。
  const collectBanishOppByEffectTriggers = (
    banisherCardNum: string,
    banisherOwnerId: string,
    banisherOwnerState: PlayerState,
  ): { entries: StackEntry[]; usedOncePerTurnIds: string[] } =>
    pureCollectBanishOppByEffectTriggers(mkTrigCtx(), banisherCardNum, banisherOwnerId, banisherOwnerState);

  // ON_LRIG_UNDER_MOVED 収集（C1・triggerCollect.ts。ここは薄いラッパ）。
  const collectLrigUnderMovedTriggers = (
    controllerId: string,
    controllerState: PlayerState,
  ): { entries: StackEntry[]; usedOncePerTurnIds: string[] } =>
    pureCollectLrigUnderMovedTriggers(mkTrigCtx(), controllerId, controllerState);

  // ON_DECK_SHUFFLED 収集（C1・triggerCollect.ts。ここは薄いラッパ）。
  const collectDeckShuffledTriggers = (
    shufflerId: string,
    shufflerState: PlayerState,
  ): { entries: StackEntry[]; usedOncePerTurnIds: string[] } =>
    pureCollectDeckShuffledTriggers(mkTrigCtx(), shufflerId, shufflerState);

  // ON_KEYWORD_GAINED 収集（C1・WXDi-P04-035。ここは薄いラッパ）。
  const collectKeywordGainedTriggers = (
    gains: { cardNum: string; keyword: string }[],
    gainOwnerId: string,
    ownerState: PlayerState,
  ): { entries: StackEntry[]; usedOncePerTurnIds: string[] } =>
    pureCollectKeywordGainedTriggers(mkTrigCtx(), gains, gainOwnerId, ownerState);

  // ON_KEYWORD_GAINED をスタック解決(resolveStackNext)/resume(handleEffectInteraction) 双方で拾う共有ヘルパー。
  // キーワード付与（GRANT_KEYWORD）は対象選択を伴い resume 経路で完了することが多いため、両経路で検出する。
  const collectKeywordGainedInline = (
    afterHost: PlayerState,
    afterGuest: PlayerState,
  ): { entries: StackEntry[]; hostState: PlayerState; guestState: PlayerState } => {
    const entries: StackEntry[] = [];
    let h = afterHost, g = afterGuest;
    for (const kgIsHost of [true, false]) {
      const ownerId = kgIsHost ? bs.host_id : bs.guest_id;
      const before = kgIsHost ? bs.host_state : bs.guest_state;
      const after = kgIsHost ? afterHost : afterGuest;
      const gains = detectKeywordGained(before, after);
      if (gains.length === 0) continue;
      const kg = collectKeywordGainedTriggers(gains, ownerId, after);
      entries.push(...kg.entries);
      if (kg.usedOncePerTurnIds.length > 0) {
        if (kgIsHost) h = { ...h, actions_done: [...(h.actions_done ?? []), ...kg.usedOncePerTurnIds] };
        else g = { ...g, actions_done: [...(g.actions_done ?? []), ...kg.usedOncePerTurnIds] };
      }
    }
    return { entries, hostState: h, guestState: g };
  };

  // ON_DECK_SHUFFLED をスタックを経由しないインライン解決（スペル＝handleCutinPass／pending効果 resume＝
  // handleEffectInteraction）で検出する共有ヘルパー。resolveStackNext の中央 diff（deck_shuffled_count
  // before/after）はスタック解決のみを通るため、スペル/resume はこれを呼んで ON_DECK_SHUFFLED を拾う。
  // before は bs.host_state/guest_state。entries（スタックへ積む）と once_per_turn の actions_done を反映した
  // host/guest を返す（呼び出し側で update.host_state/guest_state に反映する）。
  const collectDeckShuffleInline = (
    afterHost: PlayerState,
    afterGuest: PlayerState,
  ): { entries: StackEntry[]; hostState: PlayerState; guestState: PlayerState } => {
    const entries: StackEntry[] = [];
    let h = afterHost, g = afterGuest;
    for (const dsIsHost of [true, false]) {
      const dsOwnerId = dsIsHost ? bs.host_id : bs.guest_id;
      const before = dsIsHost ? bs.host_state : bs.guest_state;
      const after = dsIsHost ? afterHost : afterGuest;
      if (!detectDeckShuffled(before, after)) continue;
      const ds = collectDeckShuffledTriggers(dsOwnerId, after);
      entries.push(...ds.entries);
      if (ds.usedOncePerTurnIds.length > 0) {
        if (dsIsHost) h = { ...h, actions_done: [...(h.actions_done ?? []), ...ds.usedOncePerTurnIds] };
        else g = { ...g, actions_done: [...(g.actions_done ?? []), ...ds.usedOncePerTurnIds] };
      }
    }
    return { entries, hostState: h, guestState: g };
  };

  // ON_SIGNI_BANISH_OPPONENT_BY_EFFECT をスタックを経由しないインライン解決（pending効果 resume＝handleEffectInteraction）
  // で検出する共有ヘルパー。resolveStackNext の中央 diff（4760）はスタック解決のみを通るため、対象選択を伴う効果が
  // resume 経路で解決される場合（[出]バニッシュ等）はこれを呼んで発火させる。source=効果発生源（pe.sourceCardNum）。
  const collectBanishOppByEffectInline = (
    sourceCardNum: string,
    sourcePlayerId: string,
    afterHost: PlayerState,
    afterGuest: PlayerState,
  ): { entries: StackEntry[]; hostState: PlayerState; guestState: PlayerState } => {
    let h = afterHost, g = afterGuest;
    const sourceIsHost = sourcePlayerId === bs.host_id;
    const sourceState = sourceIsHost ? afterHost : afterGuest;
    const oppBefore = sourceIsHost ? bs.guest_state : bs.host_state;
    const oppAfter = sourceIsHost ? afterGuest : afterHost;
    const banisherOnField = sourceState.field.signi.some(s => s?.at(-1) === sourceCardNum);
    if (detectBanishedSigni(oppBefore, oppAfter).length === 0 || !banisherOnField) return { entries: [], hostState: h, guestState: g };
    const bn = collectBanishOppByEffectTriggers(sourceCardNum, sourcePlayerId, sourceState);
    if (bn.usedOncePerTurnIds.length > 0) {
      if (sourceIsHost) h = { ...h, actions_done: [...(h.actions_done ?? []), ...bn.usedOncePerTurnIds] };
      else g = { ...g, actions_done: [...(g.actions_done ?? []), ...bn.usedOncePerTurnIds] };
    }
    return { entries: bn.entries, hostState: h, guestState: g };
  };

  // ON_LRIG_UNDER_MOVED をスタックを経由しないインライン解決（resume＝handleEffectInteraction）で検出する共有ヘルパー。
  // resolveStackNext の中央 diff（4782）はスタック解決のみを通るため、対象選択を伴う効果がここを通る場合に発火させる。
  const collectLrigUnderMovedInline = (
    afterHost: PlayerState,
    afterGuest: PlayerState,
  ): { entries: StackEntry[]; hostState: PlayerState; guestState: PlayerState } => {
    const entries: StackEntry[] = [];
    let h = afterHost, g = afterGuest;
    for (const luIsHost of [true, false]) {
      const luOwnerId = luIsHost ? bs.host_id : bs.guest_id;
      const before = luIsHost ? bs.host_state : bs.guest_state;
      const after = luIsHost ? afterHost : afterGuest;
      if (countLrigUnderMoved(before, after) <= 0) continue;
      const lu = collectLrigUnderMovedTriggers(luOwnerId, after);
      entries.push(...lu.entries);
      if (lu.usedOncePerTurnIds.length > 0) {
        if (luIsHost) h = { ...h, actions_done: [...(h.actions_done ?? []), ...lu.usedOncePerTurnIds] };
        else g = { ...g, actions_done: [...(g.actions_done ?? []), ...lu.usedOncePerTurnIds] };
      }
    }
    return { entries, hostState: h, guestState: g };
  };

  // ドロー時（ON_DRAW）トリガー収集。引いたプレイヤー（drawerId）の場のシグニ/ルリグの ON_DRAW【自】を集める（G089）。
  // ターンドロー・効果ドローの双方から呼ばれるため playerId を引数で受け取る。
  // usageLimit（《ターン1回》《ターン2回》）は actions_done(effectId) の出現回数で制御。
  // usedOncePerTurnIds を呼び出し側で drawer の actions_done に追加して永続化すること。
  // ON_DRAW / 対戦相手ドロー / ミル トリガー収集（Stage2 で pure 化＝triggerCollect.ts。ここは薄いラッパ）。
  const collectDrawTriggers = (
    drawerId: string,
    drawerState: PlayerState,
    otherState: PlayerState,
    isDrawPhaseDraw = false,
  ): { entries: StackEntry[]; usedOncePerTurnIds: string[] } =>
    pureCollectDrawTriggers(mkTrigCtx(), drawerId, drawerState, otherState, isDrawPhaseDraw);
  const collectOppDrawTriggers = (
    reactorId: string,
    reactorState: PlayerState,
    drawerState: PlayerState,
  ): { entries: StackEntry[]; usedOncePerTurnIds: string[] } =>
    pureCollectOppDrawTriggers(mkTrigCtx(), reactorId, reactorState, drawerState);
  const collectMillTriggers = (
    controllerId: string,
    controllerState: PlayerState,
    otherState: PlayerState,
    milledFromControllerDeck: number,
    milledFromOppDeck: number,
  ): { entries: StackEntry[]; usedOncePerTurnIds: string[] } =>
    pureCollectMillTriggers(mkTrigCtx(), controllerId, controllerState, otherState, milledFromControllerDeck, milledFromOppDeck);

  // ON_CHARM_TO_TRASH トリガー収集（Stage2 で pure 化＝triggerCollect.ts。ここは薄いラッパ）。
  const collectCharmToTrashTriggers = (
    controllerId: string,
    controllerState: PlayerState,
    otherState: PlayerState,
    charmsFromControllerField: number,
    charmsFromOppField: number,
  ): { entries: StackEntry[]; usedOncePerTurnIds: string[] } =>
    pureCollectCharmToTrashTriggers(mkTrigCtx(), controllerId, controllerState, otherState, charmsFromControllerField, charmsFromOppField);

  // ON_ENERGY_TO_TRASH トリガー収集（Stage2 で pure 化＝triggerCollect.ts。ここは薄いラッパ）。
  const collectEnergyToTrashTriggers = (
    controllerId: string,
    controllerState: PlayerState,
    otherState: PlayerState,
    fromControllerEnergy: number,
    fromOppEnergy: number,
  ): { entries: StackEntry[]; usedOncePerTurnIds: string[] } =>
    pureCollectEnergyToTrashTriggers(mkTrigCtx(), controllerId, controllerState, otherState, fromControllerEnergy, fromOppEnergy);

  // ON_REFRESH トリガー収集（Stage2 で pure 化＝triggerCollect.ts。ここは薄いラッパ）。
  const collectRefreshTriggers = (
    controllerId: string,
    controllerState: PlayerState,
    otherState: PlayerState,
    refreshedByController: number,
    refreshedByOpp: number,
  ): { entries: StackEntry[]; usedOncePerTurnIds: string[] } =>
    pureCollectRefreshTriggers(mkTrigCtx(), controllerId, controllerState, otherState, refreshedByController, refreshedByOpp);

  // ON_OPP_POWER_DECREASED トリガー収集（Stage2 で pure 化＝triggerCollect.ts。ここは薄いラッパ）。
  const collectPowerDecreaseTriggers = (
    controllerId: string,
    controllerState: PlayerState,
    otherState: PlayerState,
    decreaseOnOpp: number,
    decreaseSources: string[] = [],
  ): { entries: StackEntry[]; usedOncePerTurnIds: string[] } =>
    pureCollectPowerDecreaseTriggers(mkTrigCtx(), controllerId, controllerState, otherState, decreaseOnOpp, decreaseSources);

  // ON_CARD_MOVED_TO_DECK トリガー収集（Stage2 で pure 化＝triggerCollect.ts。ここは薄いラッパ）。
  const collectMoveToDeckTriggers = (
    controllerId: string,
    controllerState: PlayerState,
    otherState: PlayerState,
    movedToControllerDeck: number,
    movedToControllerDeckFromTrash: number,
    movedToOppDeck: number,
  ): { entries: StackEntry[]; usedOncePerTurnIds: string[] } =>
    pureCollectMoveToDeckTriggers(mkTrigCtx(), controllerId, controllerState, otherState, movedToControllerDeck, movedToControllerDeckFromTrash, movedToOppDeck);

  // ON_SIGNI_FROZEN トリガー収集（Stage2 で pure 化＝triggerCollect.ts。ここは薄いラッパ）。
  const collectFreezeTriggers = (
    frozenByOwner: { ownerId: string; nums: string[] }[],
    hostState: PlayerState,
    guestState: PlayerState,
  ): { entries: StackEntry[]; usedHostIds: string[]; usedGuestIds: string[] } =>
    pureCollectFreezeTriggers(mkTrigCtx(), frozenByOwner, hostState, guestState);

  // ON_SIGNI_FROZEN をスタックを経由しないインライン解決（対象選択を伴う効果が resume 経路＝handleEffectInteraction
  // で完結する場合）で検出する共有ヘルパー。resolveStackNext の中央 diff（3798）はスタック解決のみを通るため、
  // FREEZE 付与の大半（SELECT_TARGET で単体対象を凍結）はここを呼んで ON_SIGNI_FROZEN を拾う（続き40 R38 実機FAIL修正）。
  // before は bs.host_state/guest_state。entries と once_per_turn の actions_done を反映した host/guest を返す。
  const collectFreezeInline = (
    afterHost: PlayerState,
    afterGuest: PlayerState,
  ): { entries: StackEntry[]; hostState: PlayerState; guestState: PlayerState } => {
    let h = afterHost, g = afterGuest;
    const frozenHost = detectNewlyFrozen(bs.host_state, afterHost);
    const frozenGuest = detectNewlyFrozen(bs.guest_state, afterGuest);
    if (frozenHost.length === 0 && frozenGuest.length === 0) return { entries: [], hostState: h, guestState: g };
    const fz = collectFreezeTriggers(
      [{ ownerId: bs.host_id, nums: frozenHost }, { ownerId: bs.guest_id, nums: frozenGuest }],
      afterHost, afterGuest,
    );
    if (fz.usedHostIds.length > 0) h = { ...h, actions_done: [...(h.actions_done ?? []), ...fz.usedHostIds] };
    if (fz.usedGuestIds.length > 0) g = { ...g, actions_done: [...(g.actions_done ?? []), ...fz.usedGuestIds] };
    return { entries: fz.entries, hostState: h, guestState: g };
  };

  // ON_SIGNI_DOWN / ON_SIGNI_BECOMES_UP のインライン収集（タスク16[C]機構①・collectFreezeInline と同型）。
  // before は bs.host_state/guest_state。byEffect＝効果起因か（中央diff＝true／アタックダウンは
  // performSigniAttack 側で byEffect:false のまま直接 pure collector を呼ぶ）。
  const collectSigniDownUpInline = (
    afterHost: PlayerState,
    afterGuest: PlayerState,
  ): { entries: StackEntry[]; hostState: PlayerState; guestState: PlayerState } => {
    let h = afterHost, g = afterGuest;
    const entries: StackEntry[] = [];
    const downHost = detectNewlyDowned(bs.host_state, afterHost);
    const downGuest = detectNewlyDowned(bs.guest_state, afterGuest);
    if (downHost.length > 0 || downGuest.length > 0) {
      const dn = pureCollectSigniDownUpTriggers(mkTrigCtx(), 'ON_SIGNI_DOWN',
        [{ ownerId: bs.host_id, nums: downHost, byEffect: true }, { ownerId: bs.guest_id, nums: downGuest, byEffect: true }], h, g);
      entries.push(...dn.entries);
      if (dn.usedHostIds.length > 0) h = { ...h, actions_done: [...(h.actions_done ?? []), ...dn.usedHostIds] };
      if (dn.usedGuestIds.length > 0) g = { ...g, actions_done: [...(g.actions_done ?? []), ...dn.usedGuestIds] };
    }
    const upHost = detectNewlyUpped(bs.host_state, afterHost);
    const upGuest = detectNewlyUpped(bs.guest_state, afterGuest);
    if (upHost.nums.length > 0 || upGuest.nums.length > 0 || upHost.lrigUpNum || upGuest.lrigUpNum) {
      const up = pureCollectSigniDownUpTriggers(mkTrigCtx(), 'ON_SIGNI_BECOMES_UP',
        [{ ownerId: bs.host_id, nums: upHost.nums, lrigNum: upHost.lrigUpNum, byEffect: true },
         { ownerId: bs.guest_id, nums: upGuest.nums, lrigNum: upGuest.lrigUpNum, byEffect: true }], h, g);
      entries.push(...up.entries);
      if (up.usedHostIds.length > 0) h = { ...h, actions_done: [...(h.actions_done ?? []), ...up.usedHostIds] };
      if (up.usedGuestIds.length > 0) g = { ...g, actions_done: [...(g.actions_done ?? []), ...up.usedGuestIds] };
    }
    return { entries, hostState: h, guestState: g };
  };

  // === 盤面差分トリガーの統合収集（続き61・Opus）===
  // resolveStackNext の中央 diff（result.done===true 分岐）と handleEffectInteraction の resume 完了分岐の
  // 双方から呼べる「盤面 before/after を比べてトリガーを収集する」共通関数。
  // 【背景】従来、この収集は resolveStackNext の else 節（result.done===true）にのみ全種そろっており、
  // 対象選択(SELECT_TARGET/CHOOSE)を挟んで resume 経路で完了する効果では大半のトリガーが取りこぼされていた
  // （§6.3・続き58/60 で ON_OPP_POWER_DECREASED/ON_ENERGY_TO_TRASH/ON_DRAW〔SEQUENCE内対話〕/ON_TRASH self を実機FAILで確認）。
  // resume 側には collectFreezeInline 等 5 種の場当たり的 inline 版しかなく、SEQUENCE 構造次第で同 collector が
  // 再度 FAIL する対症療法だった。本関数に全 collector を集約し両経路から呼ぶことで解決経路に依らず一貫させる。
  // before は bs.host_state/guest_state。afterHost/afterGuest（result 状態）を受け取り、entries（積むトリガー）と
  // once_per_turn の actions_done を反映した host/guest を返す（呼び出し側で update.host_state/guest_state と effect_stack へ反映）。
  // meta.causeOwnerId＝この効果のオーナー（entry.playerId/pe.sourcePlayerId・「対戦相手の効果によって」判定と
  // ON_SIGNI_BANISH_OPPONENT_BY_EFFECT の発生源側判定に使用）。meta.causeSourceCardNum＝発生源カード
  // （entry.cardNum/pe.sourceCardNum・banisher 照合と ON_PLAY の placeSourceIsSigni 判定に使用）。
  // ⚠この関数は「盤面差分だけで判定できる」トリガーのみを含む。action 型固有のもの（COLLAB/REVEAL_UNTIL_TO_FIELD の
  // 【出】積み・ON_ARTS_USE/ON_OPP_ARTS_USE・FORCE_END_TURN）は entry.effect / entryCardType に依存するため
  // resolveStackNext 側に inline 据置（resume 経路では pending_effect に元 action 型が無いため再現不能・従来同様）。
  const collectBoardDiffTriggers = (
    afterHost: PlayerState,
    afterGuest: PlayerState,
    meta: { causeOwnerId: string; causeSourceCardNum: string; fieldTrashCostCards?: string[] },
  ): { entries: StackEntry[]; hostState: PlayerState; guestState: PlayerState } => {
    const { causeOwnerId, causeSourceCardNum } = meta;
    const fieldTrashCostCards = new Set(meta.fieldTrashCostCards ?? []);
    const beforeHost = bs.host_state, beforeGuest = bs.guest_state;
    let h = afterHost, g = afterGuest;
    const entries: StackEntry[] = [];
    const useHost  = (used: string[]) => { if (used.length > 0) h = { ...h, actions_done: [...(h.actions_done ?? []), ...used] }; };
    const useGuest = (used: string[]) => { if (used.length > 0) g = { ...g, actions_done: [...(g.actions_done ?? []), ...used] }; };

    // ON_BANISH: バニッシュされたシグニ（usageLimit 消費は useHost/useGuest で actions_done へ永続化）
    for (const cardNum of detectBanishedSigni(beforeHost, h)) {
      const bt = collectBanishTriggers(cardNum, bs.host_id, h, g, beforeHost);
      entries.push(...bt.entries); useHost(bt.usedHostIds); useGuest(bt.usedGuestIds);
    }
    for (const cardNum of detectBanishedSigni(beforeGuest, g)) {
      const bt = collectBanishTriggers(cardNum, bs.guest_id, h, g, beforeGuest);
      entries.push(...bt.entries); useHost(bt.usedHostIds); useGuest(bt.usedGuestIds);
    }

    // ON_TRASH: スタック/pending 解決内でも fieldTrashCostCards に記録された支払いは byEffectCause=false、
    // それ以外の場→トラッシュは effect 起因。原因owner と所有者が異なれば「対戦相手の効果によって」。
    const hostTrashedByOpp  = causeOwnerId === bs.guest_id;
    const guestTrashedByOpp = causeOwnerId === bs.host_id;
    for (const cardNum of detectTrashedSigni(beforeHost, h)) {
      const tt = collectTrashTriggers(cardNum, bs.host_id, h, g, hostTrashedByOpp, true, !fieldTrashCostCards.has(cardNum));
      entries.push(...tt.entries); useHost(tt.usedHostIds); useGuest(tt.usedGuestIds);
    }
    for (const cardNum of detectTrashedSigni(beforeGuest, g)) {
      const tt = collectTrashTriggers(cardNum, bs.guest_id, h, g, guestTrashedByOpp, true, !fieldTrashCostCards.has(cardNum));
      entries.push(...tt.entries); useHost(tt.usedHostIds); useGuest(tt.usedGuestIds);
    }
    // デッキ→トラッシュ（ミル）の ON_TRASH（カード自身・triggerScope:self）
    for (const cardNum of detectDeckTrashed(beforeHost, h)) {
      entries.push(...collectDeckTrashSelfTriggers(cardNum, bs.host_id, hostTrashedByOpp));
    }
    for (const cardNum of detectDeckTrashed(beforeGuest, g)) {
      entries.push(...collectDeckTrashSelfTriggers(cardNum, bs.guest_id, guestTrashedByOpp));
    }
    // 手札→トラッシュ／エナ→トラッシュの ON_TRASH（self・fromZones 指定）。
    // causeSourceCardNum＝原因効果の発生源カード（「あなたの＜X＞のシグニの効果によって捨てられたとき」の判定用）。
    for (const cardNum of detectHandTrashed(beforeHost, h)) {
      entries.push(...collectAnyZoneTrashSelfTriggers(cardNum, bs.host_id, hostTrashedByOpp, 'hand', causeSourceCardNum));
    }
    for (const cardNum of detectHandTrashed(beforeGuest, g)) {
      entries.push(...collectAnyZoneTrashSelfTriggers(cardNum, bs.guest_id, guestTrashedByOpp, 'hand', causeSourceCardNum));
    }
    for (const cardNum of detectEnergyTrashed(beforeHost, h)) {
      entries.push(...collectAnyZoneTrashSelfTriggers(cardNum, bs.host_id, hostTrashedByOpp, 'energy'));
    }
    for (const cardNum of detectEnergyTrashed(beforeGuest, g)) {
      entries.push(...collectAnyZoneTrashSelfTriggers(cardNum, bs.guest_id, guestTrashedByOpp, 'energy'));
    }

    // ON_LEAVE_FIELD: 場を離れたシグニ（行き先を問わない）。causeOwnerId＝この効果のオーナー
    // （「あなたの効果によって対戦相手の…」any_opp／「対戦相手の効果によって」byOpponentEffect の判定に使用）。
    for (const { cardNum, under, zoneIdx } of detectLeftFieldSigni(beforeHost, h)) {
      const lf = collectLeaveFieldTriggers(cardNum, under, bs.host_id, h, g, causeOwnerId, beforeHost, zoneIdx);
      entries.push(...lf.entries); useHost(lf.usedHostIds); useGuest(lf.usedGuestIds);
    }
    for (const { cardNum, under, zoneIdx } of detectLeftFieldSigni(beforeGuest, g)) {
      const lf = collectLeaveFieldTriggers(cardNum, under, bs.guest_id, h, g, causeOwnerId, beforeGuest, zoneIdx);
      entries.push(...lf.entries); useHost(lf.usedHostIds); useGuest(lf.usedGuestIds);
    }

    // ON_DRAW: 効果でカードを引いた場合（cards_drawn_by_effect_this_turn 増加を検出）
    if ((h.cards_drawn_by_effect_this_turn ?? 0) > (beforeHost.cards_drawn_by_effect_this_turn ?? 0)) {
      const dt = collectDrawTriggers(bs.host_id, h, g);
      entries.push(...dt.entries); useHost(dt.usedOncePerTurnIds);
      const odt = collectOppDrawTriggers(bs.guest_id, g, h);
      entries.push(...odt.entries); useGuest(odt.usedOncePerTurnIds);
    }
    if ((g.cards_drawn_by_effect_this_turn ?? 0) > (beforeGuest.cards_drawn_by_effect_this_turn ?? 0)) {
      const dt = collectDrawTriggers(bs.guest_id, g, h);
      entries.push(...dt.entries); useGuest(dt.usedOncePerTurnIds);
      const odt = collectOppDrawTriggers(bs.host_id, h, g);
      entries.push(...odt.entries); useHost(odt.usedOncePerTurnIds);
    }

    // ON_CARD_MILLED_FROM_DECK: デッキ→トラッシュ（ミル）が起きた場合
    const milledHost  = countMilledFromDeck(beforeHost, h);
    const milledGuest = countMilledFromDeck(beforeGuest, g);
    if (milledHost > 0 || milledGuest > 0) {
      const mtH = collectMillTriggers(bs.host_id, h, g, milledHost, milledGuest);
      entries.push(...mtH.entries); useHost(mtH.usedOncePerTurnIds);
      const mtG = collectMillTriggers(bs.guest_id, g, h, milledGuest, milledHost);
      entries.push(...mtG.entries); useGuest(mtG.usedOncePerTurnIds);
    }

    // ON_CHARM_TO_TRASH: 【チャーム】が場→トラッシュに置かれた場合
    const charmHost  = countCharmsToTrash(beforeHost, h);
    const charmGuest = countCharmsToTrash(beforeGuest, g);
    if (charmHost > 0 || charmGuest > 0) {
      const chH = collectCharmToTrashTriggers(bs.host_id, h, g, charmHost, charmGuest);
      entries.push(...chH.entries); useHost(chH.usedOncePerTurnIds);
      const chG = collectCharmToTrashTriggers(bs.guest_id, g, h, charmGuest, charmHost);
      entries.push(...chG.entries); useGuest(chG.usedOncePerTurnIds);
    }

    // ON_ENERGY_TO_TRASH: エナゾーン→トラッシュが起きた場合
    const energyTrashHost  = countEnergyToTrash(beforeHost, h);
    const energyTrashGuest = countEnergyToTrash(beforeGuest, g);
    if (energyTrashHost > 0 || energyTrashGuest > 0) {
      const etH = collectEnergyToTrashTriggers(bs.host_id, h, g, energyTrashHost, energyTrashGuest);
      entries.push(...etH.entries); useHost(etH.usedOncePerTurnIds);
      const etG = collectEnergyToTrashTriggers(bs.guest_id, g, h, energyTrashGuest, energyTrashHost);
      entries.push(...etG.entries); useGuest(etG.usedOncePerTurnIds);
    }

    // ON_REFRESH: いずれかのプレイヤーがリフレッシュした場合
    const refreshHost  = countRefresh(beforeHost, h);
    const refreshGuest = countRefresh(beforeGuest, g);
    if (refreshHost > 0 || refreshGuest > 0) {
      const rfH = collectRefreshTriggers(bs.host_id, h, g, refreshHost, refreshGuest);
      entries.push(...rfH.entries); useHost(rfH.usedOncePerTurnIds);
      const rfG = collectRefreshTriggers(bs.guest_id, g, h, refreshGuest, refreshHost);
      entries.push(...rfG.entries); useGuest(rfG.usedOncePerTurnIds);
    }

    // ON_OPP_POWER_DECREASED（毒牙）: シグニのパワーが減った場合、減らした側（controller）が反応
    const decOnHost  = detectPowerDecrease(beforeHost, h);
    const decOnGuest = detectPowerDecrease(beforeGuest, g);
    if (decOnHost > 0 || decOnGuest > 0) {
      // 発生源限定（「あなたの＜X＞のシグニの効果によって」）判定用に、減少を起こした効果元カードも渡す。
      // 空配列＝発生源不明＝コレクタ側で従来どおり発火（過剰側に倒す）。
      const decSrcOnHost  = detectPowerDecreaseSources(beforeHost, h);
      const decSrcOnGuest = detectPowerDecreaseSources(beforeGuest, g);
      const dpH = collectPowerDecreaseTriggers(bs.host_id, h, g, decOnGuest, decSrcOnGuest);
      entries.push(...dpH.entries); useHost(dpH.usedOncePerTurnIds);
      const dpG = collectPowerDecreaseTriggers(bs.guest_id, g, h, decOnHost, decSrcOnHost);
      entries.push(...dpG.entries); useGuest(dpG.usedOncePerTurnIds);
    }

    // ON_CARD_MOVED_TO_DECK: 他領域→デッキ移動が起きた場合
    const movedHost = countMovedToDeck(beforeHost, h, false);
    const movedGuest = countMovedToDeck(beforeGuest, g, false);
    const movedHostFromTrash = countMovedToDeck(beforeHost, h, true);
    const movedGuestFromTrash = countMovedToDeck(beforeGuest, g, true);
    if (movedHost > 0 || movedGuest > 0) {
      const mvH = collectMoveToDeckTriggers(bs.host_id, h, g, movedHost, movedHostFromTrash, movedGuest);
      entries.push(...mvH.entries); useHost(mvH.usedOncePerTurnIds);
      const mvG = collectMoveToDeckTriggers(bs.guest_id, g, h, movedGuest, movedGuestFromTrash, movedHost);
      entries.push(...mvG.entries); useGuest(mvG.usedOncePerTurnIds);
    }

    // ON_HAND_ADDED: 効果によってカードが手札に移動した場合（続き207・WX25-P2-063/WXDi-P11-007/WX14-029/WD12-009）
    const handAddedHost = detectHandAdded(beforeHost, h);
    const handAddedGuest = detectHandAdded(beforeGuest, g);
    if (handAddedHost.length > 0 || handAddedGuest.length > 0) {
      const ha = pureCollectHandAddedTriggers(mkTrigCtx(), [
        { ownerId: bs.host_id, moved: handAddedHost },
        { ownerId: bs.guest_id, moved: handAddedGuest },
      ], causeOwnerId, h, g);
      entries.push(...ha.entries); useHost(ha.usedHostIds); useGuest(ha.usedGuestIds);
    }
    // ON_ENERGY_TO_FIELD: エナゾーンからシグニが場に出た場合（続き207・WXDi-P11-007-E1「か場に出たとき」枝。
    // 手札枝と同一効果の usageLimit を共有するため ON_HAND_ADDED の usedIds 反映（useHost/useGuest）後に呼ぶ）
    const evfHost = detectPlacedFromEnergy(beforeHost, h);
    const evfGuest = detectPlacedFromEnergy(beforeGuest, g);
    if (evfHost.length > 0 || evfGuest.length > 0) {
      const ev = pureCollectEnergyToFieldTriggers(mkTrigCtx(), [
        { ownerId: bs.host_id, nums: evfHost },
        { ownerId: bs.guest_id, nums: evfGuest },
      ], h, g);
      entries.push(...ev.entries); useHost(ev.usedHostIds); useGuest(ev.usedGuestIds);
    }

    // ON_LIFE_CLOTH_ADDED: ライフクロスの増加分だけを検出（減少側の ON_LIFE_CRASHED と混線しない）。
    const lifeAddedHost = detectLifeClothAdded(beforeHost, h);
    const lifeAddedGuest = detectLifeClothAdded(beforeGuest, g);
    if (lifeAddedHost.length > 0 || lifeAddedGuest.length > 0) {
      const la = pureCollectLifeClothAddedTriggers(mkTrigCtx(), [
        { ownerId: bs.host_id, nums: lifeAddedHost },
        { ownerId: bs.guest_id, nums: lifeAddedGuest },
      ], h, g);
      entries.push(...la.entries); useHost(la.usedHostIds); useGuest(la.usedGuestIds);
    }

    // ON_OPP_ENERGY_ADDED: 相手エナの増加を逆 scope で監視し、置かれたカード自身を triggeringCardNum に渡す。
    const energyAddedHost = detectEnergyAdded(beforeHost, h);
    const energyAddedGuest = detectEnergyAdded(beforeGuest, g);
    if (energyAddedHost.length > 0 || energyAddedGuest.length > 0) {
      const ea = pureCollectOppEnergyAddedTriggers(mkTrigCtx(), [
        { ownerId: bs.host_id, nums: energyAddedHost },
        { ownerId: bs.guest_id, nums: energyAddedGuest },
      ], h, g);
      entries.push(...ea.entries); useHost(ea.usedHostIds); useGuest(ea.usedGuestIds);
    }

    // ON_SIGNI_FROZEN: 新たに凍結状態になったシグニ
    { const fz = collectFreezeInline(h, g); entries.push(...fz.entries); h = fz.hostState; g = fz.guestState; }

    // ON_SIGNI_DOWN / ON_SIGNI_BECOMES_UP: 効果でダウン/アップ状態が変わったシグニ（タスク16[C]機構①・byEffect=true）
    { const du = collectSigniDownUpInline(h, g); entries.push(...du.entries); h = du.hostState; g = du.guestState; }

    // ON_ALLY_PLAY_OR_OPP_HAND_DISCARD（OR複合・WXDi-P11-064）: 「あなたのターンの間」＝ターンプレイヤーを controller として、
    // 味方シグニが場に出た（play枝）か相手手札がトラッシュに置かれた（discard枝・⚠自効果限定は近似）場合に発火。
    {
      const turnIsHost = (bs.active_user_id ?? bs.host_id) === bs.host_id;
      const apTurnBefore = turnIsHost ? beforeHost : beforeGuest;
      const apTurnAfter = turnIsHost ? h : g;
      const apOppBefore = turnIsHost ? beforeGuest : beforeHost;
      const apOppAfter = turnIsHost ? g : h;
      // 裏向き→表向き（WXDi-P10-034）は「場に出た」扱いではないため「あなたのシグニが場に出たとき」から除外。
      const facedownFlippedAP = new Set<string>(detectFacedownFlipped(apTurnBefore, apTurnAfter));
      const allyPlaced = detectPlacedSigni(apTurnBefore, apTurnAfter).filter(n => !facedownFlippedAP.has(n));
      const oppDiscarded = detectHandTrashed(apOppBefore, apOppAfter).length;
      if (allyPlaced.length > 0 || oppDiscarded > 0) {
        const turnPlayerId = turnIsHost ? bs.host_id : bs.guest_id;
        const ap = collectAllyPlayOrOppDiscardTriggers(turnPlayerId, apTurnAfter, allyPlaced, oppDiscarded);
        entries.push(...ap.entries);
        if (turnIsHost) useHost(ap.usedOncePerTurnIds); else useGuest(ap.usedOncePerTurnIds);
      }
    }

    // ON_MATERIAL_USED（self/any_ally・改造素材機構）: MARK_MATERIAL_TARGET が material_used_targets を積んだ場合、
    // 対象シグニ所有者の「このシグニに/他の味方に使用されたとき」を発火し、処理後に material_used_targets をクリア。
    for (const muIsHost of [true, false]) {
      const muOwnerId = muIsHost ? bs.host_id : bs.guest_id;
      const muBefore = (muIsHost ? beforeHost : beforeGuest)?.material_used_targets ?? [];
      const muAfterState = muIsHost ? h : g;
      const muAfter = muAfterState.material_used_targets ?? [];
      const beforeSetMU = new Set(muBefore);
      const newTargets = muAfter.filter(n => !beforeSetMU.has(n));
      if (newTargets.length > 0) {
        const mu = collectMaterialUsedOnSigniTriggers(newTargets, muOwnerId, muAfterState);
        const cleared = { ...muAfterState, material_used_targets: [],
          actions_done: [...(muAfterState.actions_done ?? []), ...mu.usedOncePerTurnIds] };
        if (muIsHost) h = cleared; else g = cleared;
        entries.push(...mu.entries);
      }
    }

    // ON_SIGNI_BANISH_OPPONENT_BY_EFFECT（C1・WX07-036）: 対戦相手シグニがバニッシュされ、かつ発生源
    // （causeSourceCardNum）が発生源側プレイヤーの場シグニの場合、その側の any_ally【自】を発火。
    { const bn = collectBanishOppByEffectInline(causeSourceCardNum, causeOwnerId, h, g); entries.push(...bn.entries); h = bn.hostState; g = bn.guestState; }

    // ON_LRIG_UNDER_MOVED（C1・WXDi-P04-042）
    { const lu = collectLrigUnderMovedInline(h, g); entries.push(...lu.entries); h = lu.hostState; g = lu.guestState; }

    // ON_DECK_SHUFFLED（C1・PR-470A）
    { const ds = collectDeckShuffleInline(h, g); entries.push(...ds.entries); h = ds.hostState; g = ds.guestState; }

    // ON_KEYWORD_GAINED（C1・WXDi-P04-035）
    { const kg = collectKeywordGainedInline(h, g); entries.push(...kg.entries); h = kg.hostState; g = kg.guestState; }

    // ON_PLAY（any_ally/any・効果配置）＋ON_BLOOM: 効果で新たに場に出たシグニに対する場の他シグニの反応（G144/G145/WX11-054）と、
    // 開花したシグニ自身＋場の他シグニの開花監視。出たシグニ自身の ON_PLAY は各配置経路が個別収集済み。
    // 場出しした効果元（causeSourceCardNum）がシグニかで bySigniEffect 発火可否を判定。開花は「場に出た」扱いでないため ON_PLAY 除外。
    const placeSourceIsSigni = battleCardMap.get(causeSourceCardNum)?.Type === 'シグニ';
    const hostBloomedSE  = detectBloomedSigni(beforeHost, h);
    const guestBloomedSE = detectBloomedSigni(beforeGuest, g);
    // 裏向き→表向き（WXDi-P10-034）も開花と同じく「場に出た」扱いではないため ON_PLAY から除外する。
    const bloomedSetSE = new Set<string>([...hostBloomedSE, ...guestBloomedSE,
      ...detectFacedownFlipped(beforeHost, h), ...detectFacedownFlipped(beforeGuest, g)]);
    const hostTrashBefore = new Set(beforeHost?.trash ?? []);
    const guestTrashBefore = new Set(beforeGuest?.trash ?? []);
    for (const placedNum of detectPlacedSigni(beforeHost, h)) {
      if (bloomedSetSE.has(placedNum)) continue;
      const ft = collectFieldTriggers('ON_PLAY', placedNum, h, g, bs.host_id, { placedByEffect: true, placeSourceIsSigni, placedFromTrash: hostTrashBefore.has(placedNum) });
      entries.push(...ft.entries); useHost(ft.usedHostIds); useGuest(ft.usedGuestIds);
    }
    for (const placedNum of detectPlacedSigni(beforeGuest, g)) {
      if (bloomedSetSE.has(placedNum)) continue;
      const ft = collectFieldTriggers('ON_PLAY', placedNum, g, h, bs.guest_id, { placedByEffect: true, placeSourceIsSigni, placedFromTrash: guestTrashBefore.has(placedNum) });
      entries.push(...ft.entries); useHost(ft.usedHostIds); useGuest(ft.usedGuestIds);
    }
    for (const bloomedNum of hostBloomedSE) {
      const bl = collectBloomTriggers(bloomedNum, h, g, bs.host_id);
      entries.push(...bl.entries); useHost(bl.usedHostIds); useGuest(bl.usedGuestIds);
    }
    for (const bloomedNum of guestBloomedSE) {
      const bl = collectBloomTriggers(bloomedNum, g, h, bs.guest_id);
      entries.push(...bl.entries); useHost(bl.usedHostIds); useGuest(bl.usedGuestIds);
    }

    // ON_ENERGY_FROM_TRASH: トラッシュからエナゾーンに移動したカード
    for (const [ownerId, before, after] of [[bs.host_id, beforeHost, h], [bs.guest_id, beforeGuest, g]] as const) {
      for (const cardNum of detectEnergyFromTrash(before, after)) {
        for (const eff of (effectsMap.get(cardNum) ?? [])) {
          if (eff.effectType !== 'AUTO' || !eff.timing?.includes('ON_ENERGY_FROM_TRASH')) continue;
          entries.push({
            id: generateUUID(),
            playerId: ownerId,
            cardNum,
            effectId: eff.effectId,
            label: `${battleCardMap.get(cardNum)?.CardName ?? cardNum} の【自】効果（トラッシュからエナ時）`,
            effect: eff,
          });
        }
      }
    }

    // ON_BLOOD_CRYSTAL_ARMOR: 血晶武装状態になったシグニ
    for (const cardNum of detectNewlyArmored(beforeHost, h)) {
      const at = collectArmorTriggers(cardNum, bs.host_id, h, g);
      entries.push(...at.entries); useHost(at.usedHostIds); useGuest(at.usedGuestIds);
    }
    for (const cardNum of detectNewlyArmored(beforeGuest, g)) {
      const at = collectArmorTriggers(cardNum, bs.guest_id, h, g);
      entries.push(...at.entries); useHost(at.usedHostIds); useGuest(at.usedGuestIds);
    }

    return { entries, hostState: h, guestState: g };
  };

  // フェイズ進行（実処理）。upkeepPay: UPKEEP_OR_NO_UPのコストを支払ってアップする場合に指定
  const doPhaseAdvance = async (upkeepPay?: 'energy' | 'discard') => {
    // いずれかのチェックゾーンにカードがある間はフェーズ移動不可
    if (my.field.check || op.field.check) return;
    setLoading(true);
    try {
      const phase = bs.turn_phase;
      const stateKey = isHost ? 'host_state' : 'guest_state';
      let newMyState = my;
      const update: Partial<BattleStateRow> = {};

      if (phase === 'UP') {
        // アップフェイズ開始時にすでにアップ済み（ENDフェイズで処理）。ドローして次へ。
        const drawBlocked = my.blocked_actions?.includes('DRAW') ?? false;
        // draw_limit: ターン内フラグ or 相手CONT LIMIT_OPP_DRAW_COUNT 効果の小さい方
        const contDrawLimit = collectDrawLimits(op, effectsMap, battleCardMap, true, my);
        const effectiveDrawLimit = contDrawLimit !== undefined
          ? (my.draw_limit !== undefined ? Math.min(my.draw_limit, contDrawLimit) : contDrawLimit)
          : my.draw_limit;
        const effectiveDrawCount = effectiveDrawLimit !== undefined ? Math.min(drawCount, effectiveDrawLimit) : drawCount;
        const preventRefreshTrash = my.field.signi.some(s => {
          const top = s?.at(-1);
          return top && (effectsMap.get(top) ?? []).some(e =>
            e.effectType === 'CONTINUOUS' &&
            (e.action as import('../types/effects').StubAction).type === 'STUB' &&
            (e.action as import('../types/effects').StubAction).id === 'PREVENT_LIFE_REFRESH_TRASH',
          );
        });
        // ターン開始時にリフレッシュ回数をリセット（ドローによるリフレッシュはこのターン分としてカウント）
        newMyState = drawBlocked
          ? { ...my, refresh_count_this_turn: 0, actions_done: [], draw_limit: undefined }
          // ドローフェイズの通常ドローは「効果ドロー」ではないため last_effect_draw_source をクリアし、
          // 直後の collectDrawTriggers で drawBySourceStory トリガー（WX20-026-E3）が前ターンの残値で誤発火しないようにする。
          : { ...drawCards({ ...my, refresh_count_this_turn: 0 }, effectiveDrawCount, preventRefreshTrash), actions_done: ['DRAW'], draw_limit: undefined, last_effect_draw_source: undefined };
        // UPKEEP_OR_NO_UP: コストを支払ったらアップ、そうでなければダウンのままクリア
        if (newMyState.lrig_upkeep_condition) {
          if (upkeepPay) {
            const payCount = newMyState.lrig_upkeep_condition === 'pay_colorless3' ? 3 : 1;
            if (upkeepPay === 'energy') {
              const paid = newMyState.energy.slice(-payCount);
              newMyState = { ...newMyState, energy: newMyState.energy.slice(0, -payCount), trash: [...newMyState.trash, ...paid],
                lrig_upkeep_condition: undefined, field: { ...newMyState.field, lrig_down: false } };
              appendBattleLogs([`センタールリグのアップ条件：《無》×${payCount}を支払いアップ`]);
            } else {
              const discarded = newMyState.hand.slice(0, 1);
              newMyState = { ...newMyState, hand: newMyState.hand.slice(1), trash: [...newMyState.trash, ...discarded],
                lrig_upkeep_condition: undefined, field: { ...newMyState.field, lrig_down: false } };
              appendBattleLogs(['センタールリグのアップ条件：手札を1枚捨ててアップ']);
            }
          } else {
            newMyState = { ...newMyState, lrig_upkeep_condition: undefined };
            appendBattleLogs(['センタールリグのアップ条件（未払い）→ルリグはダウン状態でターン開始']);
          }
        }
        update.turn_phase = 'DRAW';

        // ON_TURN_START トリガー収集（ドローと同時にスタック積み）。
        // ドローした場合は ON_DRAW（G089「カードを引いたとき」）も併せて収集する。
        const startRes = collectTurnTriggers('ON_TURN_START', newMyState, op);
        const startEntries = startRes.entries;
        if (startRes.usedMyIds.length > 0) {
          newMyState = { ...newMyState, actions_done: [...(newMyState.actions_done ?? []), ...startRes.usedMyIds] };
        }
        if (startRes.usedOpIds.length > 0) {
          const opKey = isHost ? 'guest_state' : 'host_state';
          update[opKey] = { ...(update[opKey] as PlayerState ?? op), actions_done: [...(((update[opKey] as PlayerState) ?? op).actions_done ?? []), ...startRes.usedOpIds] };
        }
        if (!drawBlocked) {
          const dt = collectDrawTriggers(bs.active_user_id ?? user.id, newMyState, op, true);
          startEntries.push(...dt.entries);
          if (dt.usedOncePerTurnIds.length > 0) {
            newMyState = { ...newMyState, actions_done: [...(newMyState.actions_done ?? []), ...dt.usedOncePerTurnIds] };
          }
        }
        if (startEntries.length > 0) {
          const turnPlayerId = bs.active_user_id ?? user.id;
          const existingStack = bs.effect_stack ?? null;
          update.effect_stack = existingStack
            ? pushToStack(existingStack, startEntries)
            : initStack(turnPlayerId, startEntries);
        }
      } else if (phase === 'MAIN' && bs.turn_count === 1) {
        update.turn_phase = 'END';
      } else if (phase === 'END') {
        // ON_TURN_END トリガーをまだ収集していなければ先に解決する
        const turnEndMarked = my.actions_done?.includes('__TURN_END__');
        if (!turnEndMarked) {
          const endRes = collectTurnTriggers('ON_TURN_END', my, op);
          const endEntries = endRes.entries;
          if (endEntries.length > 0) {
            const markedMyState: PlayerState = {
              ...my,
              actions_done: [...(my.actions_done ?? []), '__TURN_END__', ...endRes.usedMyIds],
            };
            const opUpdate = endRes.usedOpIds.length > 0
              ? { [isHost ? 'guest_state' : 'host_state']: { ...op, actions_done: [...(op.actions_done ?? []), ...endRes.usedOpIds] } }
              : {};
            const turnPlayerId = bs.active_user_id ?? user.id;
            const existingStack = bs.effect_stack ?? null;
            const stack = existingStack
              ? pushToStack(existingStack, endEntries)
              : initStack(turnPlayerId, endEntries);
            await supabase.from('battle_states')
              .update({ [stateKey]: markedMyState, effect_stack: stack, ...opUpdate })
              .eq('room_id', roomId);
            return; // エフェクト解決後に自動で再度ターン終了処理を行う
          }
        }

        // ENDフェーズ：ビートゾーン全カードをトラッシュへ（手札上限処理と同タイミング）
        let myBeatEND = my.field.beat_zone ?? [];
        let myTrashBeat = my.trash;
        if (myBeatEND.length > 0) {
          myTrashBeat = [...my.trash, ...myBeatEND];
          appendBattleLogs([`ビートゾーン（${myBeatEND.length}枚）をトラッシュへ`]);
          myBeatEND = [];
        }

        // ENDフェーズ①：「ターン終了時に」と書かれた効果をすべて解決する。
        // 公式ルール：エンドフェイズは ①「ターン終了時に」効果 → ②手札上限調整(6枚) → ③ターン終了 の順。
        // 手札を増やす効果（ドロー／トラッシュ→手札）も②より前に解決する必要があるため、ここで一括処理する。
        // ※標準の timing:ON_TURN_END 効果は上の collectTurnTriggers でスタック解決済み（同じく②より前）。
        let myHandEND = my.hand;
        let myDeckPreLimit = my.deck;
        let myFieldAfterCoinCheck = { ...my.field, beat_zone: myBeatEND };
        let myTrashAfterCoinCheck = myTrashBeat;
        // DRAW_AT_TURN_END: このターン終了時に引く（このシグニが場を離れていても引く）
        if ((my.turn_end_draw_count ?? 0) > 0) {
          const nDrawEND = my.turn_end_draw_count!;
          const drawnEND = myDeckPreLimit.slice(0, nDrawEND);
          myDeckPreLimit = myDeckPreLimit.slice(nDrawEND);
          myHandEND = [...myHandEND, ...drawnEND];
          appendBattleLogs([`ターン終了時：カードを${drawnEND.length}枚引く`]);
        }
        // COIN_SPEND_CONDITION: ターン終了時にコイン消費チェック
        if ((my.coin_condition_signi_instances ?? []).length > 0) {
          const coinSpent = (my.actions_done ?? []).includes('COIN_SPENT');
          if (!coinSpent) {
            // コイン未消費 → coin_condition_signi_instances のシグニをトラッシュ
            const newSigniField = [...myFieldAfterCoinCheck.signi] as (string[] | null)[];
            for (const instId of my.coin_condition_signi_instances ?? []) {
              for (let zi = 0; zi < 3; zi++) {
                if (newSigniField[zi]?.includes(instId)) {
                  myTrashAfterCoinCheck = [...myTrashAfterCoinCheck, ...newSigniField[zi]!];
                  newSigniField[zi] = null;
                  appendBattleLogs([`コイン消費なし → ${battleCardMap.get(instId)?.CardName ?? instId}をトラッシュ`]);
                }
              }
            }
            myFieldAfterCoinCheck = { ...myFieldAfterCoinCheck, signi: newSigniField };
          }
        }
        // turn_end_field_trash_targets: ターン終了時にフィールドのシグニをトラッシュへ（TRASH_AT_TURN_END）
        if ((my.turn_end_field_trash_targets ?? []).length > 0) {
          const newFieldSigniTEFT = [...myFieldAfterCoinCheck.signi] as (string[] | null)[];
          const trashedTEFT: string[] = [];
          for (const targetId of my.turn_end_field_trash_targets!) {
            const zi = newFieldSigniTEFT.findIndex(stack => stack?.at(-1) === targetId);
            if (zi < 0) continue;
            newFieldSigniTEFT[zi] = null;
            trashedTEFT.push(targetId);
          }
          if (trashedTEFT.length > 0) {
            myTrashAfterCoinCheck = [...myTrashAfterCoinCheck, ...trashedTEFT];
            myFieldAfterCoinCheck = { ...myFieldAfterCoinCheck, signi: newFieldSigniTEFT };
            appendBattleLogs([`ターン終了時：${trashedTEFT.map(n => battleCardMap.get(n)?.CardName ?? n).join('・')}をトラッシュへ`]);
          }
        }
        // game_turn_end_trash_to_hand: ターン終了時、トラッシュから特定クラスシグニを手札へ（GAIN_ABILITY_THIS_GAME）
        if (my.game_turn_end_trash_to_hand) {
          const { class: ttCls, count: ttCnt } = my.game_turn_end_trash_to_hand;
          const ttMatches = myTrashAfterCoinCheck.filter(cn => {
            const c = battleCardMap.get(cn);
            return c?.Type === 'シグニ' && (c.CardClass ?? '').includes(ttCls);
          });
          const ttToHand = ttMatches.slice(0, ttCnt);
          if (ttToHand.length > 0) {
            myTrashAfterCoinCheck = myTrashAfterCoinCheck.filter(cn => !ttToHand.includes(cn));
            myHandEND = [...myHandEND, ...ttToHand];
            appendBattleLogs([`ターン終了時：トラッシュ＜${ttCls}＞シグニ${ttToHand.length}枚を手札へ（このゲーム）`]);
          }
        }
        // flip_attack_signi_zones: フリップアタックで裏向きにしたシグニをターン終了時に表向きに戻す
        if ((my.flip_attack_signi_zones ?? []).length > 0) {
          const newSigniDownFA = [...(myFieldAfterCoinCheck.signi_down ?? [false, false, false])] as [boolean, boolean, boolean];
          const unflipped: string[] = [];
          for (const zi of my.flip_attack_signi_zones!) {
            if (my.field.signi[zi]?.length) { // ゾーンにシグニが残っていれば表向きに戻す
              newSigniDownFA[zi] = false;
              const topName = battleCardMap.get(my.field.signi[zi]?.at(-1) ?? '')?.CardName;
              if (topName) unflipped.push(topName);
            }
          }
          myFieldAfterCoinCheck = { ...myFieldAfterCoinCheck, signi_down: newSigniDownFA };
          if (unflipped.length > 0) appendBattleLogs([`フリップアタック復元：${unflipped.join('・')}を表向きに`]);
        }

        // ENDフェーズ②：手札上限チェック（①の「ターン終了時に」効果をすべて適用した後の手札で判定）
        const handLimitEND = myEffectiveHandLimit;
        if (myHandEND.length > handLimitEND) {
          // ①の解決結果を先に永続化してから捨て札選択へ。confirmEndDiscard は解決済み状態を参照し、
          // end_turn_effects_resolved マーカーで効果の二重適用を防ぐ
          // （特に game_turn_end_trash_to_hand は「このゲーム」持続でフラグを消せないため、マーカーで抑止）。
          await supabase.from('battle_states')
            .update({ [stateKey]: {
              ...my,
              hand: myHandEND, deck: myDeckPreLimit,
              trash: myTrashAfterCoinCheck, field: myFieldAfterCoinCheck,
              turn_end_draw_count: undefined,
              coin_condition_signi_instances: undefined,
              turn_end_field_trash_targets: undefined,
              flip_attack_signi_zones: undefined,
              end_turn_effects_resolved: true,
            } })
            .eq('room_id', roomId);
          openEndDiscard(myHandEND.length - handLimitEND);
          return; // ユーザー選択後に confirmEndDiscard で処理
        }

        // 自分（ターン終了プレイヤー）のターン内一時状態をクリア
        // （ターン終了時に効果＝ドロー/コイン/場トラッシュ/トラッシュ→手札/フリップ復元 は上で解決済み）
        newMyState = {
          ...my,
          hand: myHandEND,
          deck: myDeckPreLimit,
          trash: myTrashAfterCoinCheck,
          field: myFieldAfterCoinCheck,
          turn_end_draw_count: undefined,
          temp_power_mods:    [],   // UNTIL_END_OF_TURN パワー修正をリセット
          temp_level_mods:    [],   // UNTIL_END_OF_TURN レベル修正をリセット
          keyword_grants:     {},   // ターン内付与キーワードをリセット
          field_keyword_grants_active: undefined, // NEXT_TURN場全体付与：自ターン終了時にクリア
          granted_effects:    {},   // ターン内付与能力をリセット
          blocked_actions:    [],   // ターン内封じ行動をリセット
          blocked_card_names: [],   // ターン内使用禁止カードをリセット
          signi_deploy_count_limit: undefined, // 配置数制限（このターン）をリセット
          actions_done:       [],   // ターン内行動履歴をリセット
          cards_drawn_by_effect_this_turn: 0, // 効果ドロー累計をリセット
          hand_trashed_by_opp_this_turn: 0,   // 相手効果による手札→トラッシュ累計をリセット（HAND_TRASHED_BY_OPP）
          energy_trashed_by_opp_this_turn: 0, // 相手効果によるエナ→トラッシュ累計をリセット（ENERGY_TRASHED_BY_OPP）
          last_effect_draw_source: undefined, // 効果ドローの原因カードをリセット（drawBySourceStory）
          life_crashed_this_turn: undefined,  // このターンのライフクラッシュ枚数をリセット（LIFE_CRASHED_THIS_TURN）
          delayed_triggers: undefined,  // INSTALL_DELAYED_TRIGGER（B3）「このターン」設置の遅延トリガーをクリア
          pending_crashed_cards: [],  // ダブルクラッシュ残数をリセット
          must_attack_signi:  undefined,  // 強制攻撃フラグをリセット
          must_attack_infected_only: undefined,
          cost_modifiers: (my.cost_modifiers ?? []).filter(m => m.until !== 'END_OF_TURN'),
          prevent_next_damage: undefined,  // ターン内ダメージ無効をリセット
          prevent_damage_windows: advancePreventDamageWindows(my.prevent_damage_windows), // PREVENT_DAMAGE：このターン分は消滅・「次のターンの間」は1回だけ持ち越し
          damage_replace_mill: undefined,  // ターン内ダメージ置換（REPLACE_NEXT_DAMAGE_WITH_MILL）をリセット
          life_burst_double_next: undefined, // ライフバースト2回発動フラグをリセット
          lrig_granted_auto_effects: my.lrig_granted_auto_effects?.filter(e => e.permanentGrant), // ターン終了時まで付与されたルリグ能力をクリア（「このゲームの間」付与は残す）
          banish_redirect: undefined,           // バニッシュ先変更フラグをクリア
          banish_redirect_by_source_nums: undefined, // 限定付きバニッシュ先変更（このシグニとのバトル）をクリア
          banish_redirect_to_hand: undefined,   // バニッシュ先→手札フラグをクリア
          banish_redirect_to_exile: undefined,  // バニッシュ先→ゲーム除外フラグをクリア
          power0_banish_to_trash: undefined,    // パワー0以下→トラッシュ（このターン）フラグをクリア
          power0_banish_to_trash_opp_only: undefined, // 同・対戦相手限定版（whenPowerZero）をクリア
          double_power_minus_this_turn: undefined, // パワーマイナス2倍（このターン）フラグをクリア
          no_grow: undefined,                   // グロウ禁止フラグをリセット
          suppress_life_burst: undefined,       // ライフバースト抑制フラグをリセット
          prevent_lrig_damage: undefined,       // ルリグダメージ無効フラグをリセット
          prevent_defeat: undefined,            // 敗北無効フラグをリセット
          declared_guard_restrict_level: undefined, // 宣言数字をリセット
          declared_class: undefined,               // 宣言クラスをリセット
          hand_signi_guard_enabled: undefined,     // 手札シグニガードフラグをリセット
          lrig_limit_mod: undefined,               // ルリグリミット修正をリセット
          prevent_opp_guard: undefined,            // 相手ガード禁止フラグをリセット
          draw_limit: undefined,                   // ドロー上限リセット（次ターン開始時にも解除）
          card_class_overrides: undefined,         // クラスオーバーライドリセット
          signi_color_overrides: undefined,        // シグニ色オーバーライドリセット
          disabled_signi_zones: undefined,         // ゾーン無効化リセット
          attacked_signi_ids: undefined,            // アタック済みシグニIDリセット
          signi_attack_once_limit: undefined,       // シグニ1回アタック制限リセット
          signi_attack_cost: undefined,             // シグニアタックコストリセット
          lrig_riding_signi: undefined,             // ドライブ状態（ライド）をリセット
          lrig_attack_remaining: undefined,         // マルチダメージ残数リセット
          lrig_has_attacked: undefined,             // ルリグアタック済みフラグをリセット
          pending_signi_battle: undefined,          // シグニバトル解決待ちフラグをリセット
          pending_lrig_attack: undefined,           // ルリグアタック解決待ちフラグをリセット
          pending_banish_substitute: undefined,     // F-3 身代わりバニッシュ待ちフラグをリセット
          banish_substitute_choice: undefined,      // F-3 身代わりバニッシュ決定をリセット
          suppress_center_on_play: undefined,       // センタールリグ【出】抑制フラグをリセット
          crash_to_trash_instead: undefined,        // クラッシュ先トラッシュフラグをリセット
          life_crash_counter: undefined,            // カウンタークラッシュ（このターン）をリセット
          negate_opp_signi_attacks_until: undefined, // N回目シグニアタック自動無効化フラグをリセット
          all_cont_effects_negated: undefined,       // CONTINUOUS効果無効化フラグをリセット
          lrig_abilities_disabled: undefined,        // ルリグ能力消去フラグをリセット
          turn_hand_discarded_count: undefined,      // このターンの手札捨て枚数をリセット
          turn_signi_returned_to_hand: undefined,    // このターンのシグニ手札戻りフラグをリセット（G087）
          turn_arts_used: undefined, turn_arts_used_colors: undefined,                 // このターンのアーツ使用フラグをリセット（ARTS_USED_THIS_TURN）
          banish_to_trash_by_self: undefined,        // バニッシュ→トラッシュ誘導フラグをリセット
          negate_coin_abilities: undefined,          // コイン能力無効化フラグをリセット
          coin_condition_signi_instances: undefined,  // コイン消費条件シグニをリセット
          grid_reveal_plus_one_this_turn: undefined,  // グリッド公開+1フラグをリセット
          deck_signi_level_override: undefined,       // デッキシグニレベルオーバーライドをリセット
          reduce_next_on_play_cost: undefined,        // 【出】コスト軽減フラグをリセット
          optional_discard_guard_enabled: undefined,  // 任意捨てガードフラグをリセット
          flip_attack_signi_zones: undefined,         // フリップアタックゾーンをリセット
          turn_end_field_trash_targets: undefined,    // ターン終了時トラッシュ対象をリセット
          spell_negated_this_turn: undefined,         // スペル打ち消しフラグをリセット
          next_spell_uncounterable: undefined,        // WX04-008: 次スペル打ち消し不可フラグをリセット
          next_spell_cost_reduction: undefined,       // WX04-008: 次スペルコスト軽減をリセット
          non_dissona_spell_played_this_turn: undefined, // DISONA_RESTRICTION: 非ディソナスペル使用フラグをリセット
          dissona_only_spells_this_turn: undefined,   // DISONA_RESTRICTION: ディソナ制限フラグをリセット
          turn_trigger_3rd_plant_down: undefined,     // 植物3回目ダウントリガーをリセット
          turn_plant_down_count: undefined,           // 植物ダウン回数をリセット
          // WX25-CP1-003「次の対戦相手のターン終了時まで」: フラグ保持者(=相手の効果を受けた側)が
          // 自分のターンを終了するタイミングがちょうど期限にあたる
          opp_signi_energy_to_deck_bottom: undefined,
          is_betting_this_effect: undefined,          // BET_CONDITION: ターン終了時にクリア
          last_discarded_signi_power: undefined,      // DISCARD_BY_POWER_MATCH: ターン終了時にクリア
          last_discarded_signi_level: undefined,      // levelLteDiscardSigni: ターン終了時にクリア
          cancel_current_signi_attack: undefined,     // NEGATE_ATTACK_ON_TRIGGER: ターン終了時にクリア
        };
        // 次のターンプレイヤー（相手）のカードをアップフェイズ開始時点でアップ処理する。
        // 凍結中はアップせず凍結を解除。それ以外のダウンカードはアップ。
        const opKey = isHost ? 'guest_state' : 'host_state';
        const opState = isHost ? bs.guest_state : bs.host_state;
        const curSigniDown   = opState.field.signi_down   ?? [false, false, false];
        const curSigniFrozen = opState.field.signi_frozen  ?? [false, false, false];
        const curLrigFrozen  = opState.field.lrig_frozen   ?? false;
        const newSigniDown = curSigniDown.map((down, i) => down && curSigniFrozen[i]) as boolean[];
        // ':NEXT_TURN' サフィックスのブロックを次のターン用に変換（サフィックス除去して残す）
        const convertedOpBlocked = (opState.blocked_actions ?? [])
          .filter(a => a.endsWith(':NEXT_TURN'))
          .map(a => a.replace(':NEXT_TURN', ''));
        // UPKEEP_OR_NO_UP: 条件あり→次ターンのUPフェーズで条件未達としてルリグをアップしない
        const upkeepLrigDown = ((opState.field.lrig_down ?? false) && curLrigFrozen)
          || (opState.lrig_upkeep_condition !== undefined);
        if (opState.lrig_upkeep_condition) appendBattleLogs([`相手のセンタールリグはアップ条件あり（${opState.lrig_upkeep_condition}）`]);
        update[opKey] = {
          ...opState,
          blocked_actions: convertedOpBlocked,
          // NEXT_TURN場全体付与：予約（next_turn）を次の自分ターン開始時に active へ移動
          field_keyword_grants_active: opState.field_keyword_grants_next_turn,
          field_keyword_grants_next_turn: undefined,
          // FREE_GROW_NEXT_TURN: 次ターングロウ無料の予約→active（WX03-024-BURST）
          free_grow_this_turn: opState.free_grow_next_turn ? true : opState.free_grow_this_turn,
          free_grow_next_turn: undefined,
          signi_played_from_trash: undefined, // トラッシュ出自マーカーをターン開始時にクリア
          negate_coin_abilities: undefined, // NEGATE_COIN_ABILITY: このターン限定→ターン終了時にクリア
          life_crash_counter: undefined, // カウンタークラッシュ（防御側がセット）をターン終了時にクリア
          keyword_grants_until_opp_turn: undefined, // UNTIL_OPP_TURN_END: 次の相手ターン終了時（=自分のターン再開時）にクリア
          granted_effects_until_opp_turn: undefined, // UNTIL_OPP_TURN_END: 付与効果を次の相手ターン終了時にクリア
          power_mods_until_opp_turn: undefined,      // UNTIL_OPP_TURN_END: 長期パワー修正を次の相手ターン終了時にクリア
          opp_cost_up_until_opp_turn: undefined,     // COST_INCREASE(NEXT_OPP_TURN): 相手コスト増加を次の相手ターン終了時にクリア
          life_crashed_this_turn: undefined,         // このターンのライフクラッシュ枚数をリセット（次ターン開始＝相手分）
          turn_arts_used: undefined, turn_arts_used_colors: undefined,                 // このターンのアーツ使用フラグをリセット（相手ターン中のガード使用分。ARTS_USED_THIS_TURN）
          signi_deploy_count_limit: undefined,       // 配置数制限（このターン・相手にかけられた分）を自分のターン開始時にリセット
          field: {
            ...opState.field,
            signi_down:   newSigniDown,
            signi_frozen: [false, false, false],
            lrig_down:    upkeepLrigDown,
            lrig_frozen:  false,
            assist_lrig_l_down: false,
            assist_lrig_r_down: false,
          },
        };
        // GAIN_EXTRA_TURN: 追加ターン取得済みの場合は同プレイヤーの追加ターン
        if (my.extra_turn) {
          newMyState = { ...newMyState, extra_turn: undefined };
          update.turn_phase = 'UP';
          update.turn_count = bs.turn_count + 1;
          appendBattleLogs(['追加ターン取得！']);
        } else {
          update.turn_phase = 'UP';
          update.active_user_id = (isHost ? bs.guest_id : bs.host_id) as string;
          update.turn_count = bs.turn_count + 1;
        }
      } else {
        update.turn_phase = PHASE_NEXT[phase];
        // ENERGY→GROW（グロウフェイズ開始時）: game_grow_phase_limit_plus で game_lrig_limit_bonus を累積
        if (phase === 'ENERGY' && (newMyState.game_grow_phase_limit_plus ?? 0) > 0) {
          const glp = newMyState.game_grow_phase_limit_plus!;
          newMyState = { ...newMyState, game_lrig_limit_bonus: (newMyState.game_lrig_limit_bonus ?? 0) + glp };
          appendBattleLogs([`グロウフェイズ開始：リミット+${glp}（このゲーム・累積${newMyState.game_lrig_limit_bonus}）`]);
        }
        // GROW→MAIN移行時: pending_lrig_limit_modをlrig_limit_modに適用（OPP_MAIN_PHASE_LIMIT_DOWN）
        if (phase === 'GROW' && my.pending_lrig_limit_mod !== undefined) {
          newMyState = {
            ...newMyState,
            lrig_limit_mod: (newMyState.lrig_limit_mod ?? 0) + my.pending_lrig_limit_mod,
            pending_lrig_limit_mod: undefined,
          };
        }
        // GROW→MAIN（メインフェイズ開始時）: game_main_draw（手札5枚以下ならドロー）
        if (phase === 'GROW' && newMyState.game_main_draw && newMyState.hand.length <= 5 && newMyState.deck.length > 0) {
          const drawCard = newMyState.deck[0];
          newMyState = { ...newMyState, deck: newMyState.deck.slice(1), hand: [...newMyState.hand, drawCard] };
          appendBattleLogs(['メインフェイズ開始ドロー（このゲーム）']);
        }
        // DRAW→ENERGY（エナフェイズ開始時）: game_energy_phase_draw
        if (phase === 'DRAW' && newMyState.game_energy_phase_draw && newMyState.deck.length > 0) {
          const drawCard = newMyState.deck[0];
          newMyState = { ...newMyState, deck: newMyState.deck.slice(1), hand: [...newMyState.hand, drawCard] };
          appendBattleLogs(['エナフェイズ開始ドロー（このゲーム）']);
        }
        // HASTARLIQ: MAIN→ATTACK_ARTS移行時、相手の hastarliq_zones があれば発動
        if (phase === 'MAIN' && (op.hastarliq_zones ?? []).length > 0) {
          const opKey = isHost ? 'guest_state' : 'host_state';
          const turnPlayerId = bs.active_user_id ?? user.id;
          const hlEntries: StackEntry[] = (op.hastarliq_zones ?? []).map(zi => ({
            id: generateUUID(),
            playerId: turnPlayerId,
            cardNum: 'WXDi-P05-TK01A',
            effectId: `HASTARLIQ_TRIGGER_Z${zi}_${Date.now()}`,
            label: `【ハスターリク】ゾーン${zi + 1}発動`,
            effect: {
              effectId: `HASTARLIQ_TRIGGER_Z${zi}`,
              effectType: 'AUTO' as const,
              action: { type: 'STUB', id: 'HASTARLIQ_TRIGGER', value: zi } as import('../types/effects').StubAction,
              duration: 'INSTANT' as const,
              mandatory: true,
              parseStatus: 'AUTO' as const,
            },
          }));
          update[opKey] = { ...op, hastarliq_zones: undefined };
          const existingStackHL = bs.effect_stack ?? null;
          update.effect_stack = existingStackHL
            ? pushToStack(existingStackHL, hlEntries)
            : initStack(turnPlayerId, hlEntries);
        }
        // usageLimit 消費（《ターン1回/2回》）を actions_done へ書き戻す＝再フェイズ境界で再発火させない（続き119）。
        const foldTurnUsed = (res: { usedMyIds: string[]; usedOpIds: string[] }) => {
          if (res.usedMyIds.length > 0) newMyState = { ...newMyState, actions_done: [...(newMyState.actions_done ?? []), ...res.usedMyIds] };
          if (res.usedOpIds.length > 0) {
            const opKeyT = isHost ? 'guest_state' : 'host_state';
            const opBase = (update[opKeyT] as PlayerState) ?? op;
            update[opKeyT] = { ...opBase, actions_done: [...(opBase.actions_done ?? []), ...res.usedOpIds] };
          }
        };
        // ON_GROW_PHASE_START: ENERGY→GROW移行時（グロウフェイズ開始時）トリガー。
        if (phase === 'ENERGY') {
          const gpsRes = collectTurnTriggers('ON_GROW_PHASE_START', newMyState, op);
          foldTurnUsed(gpsRes);
          if (gpsRes.entries.length > 0) {
            const baseStackGPS = (update.effect_stack as typeof bs.effect_stack) ?? bs.effect_stack ?? null;
            update.effect_stack = baseStackGPS
              ? pushToStack(baseStackGPS, gpsRes.entries)
              : initStack(bs.active_user_id ?? user.id, gpsRes.entries);
          }
        }
        // ON_ATTACK_PHASE_START: MAIN→ATTACK_ARTS移行時（アタックフェイズ開始時）トリガー
        if (phase === 'MAIN') {
          const apsRes = collectTurnTriggers('ON_ATTACK_PHASE_START', newMyState, op);
          foldTurnUsed(apsRes);
          const apsEntries = apsRes.entries;
          if (apsEntries.length > 0) {
            const baseStackAPS = (update.effect_stack as typeof bs.effect_stack) ?? bs.effect_stack ?? null;
            update.effect_stack = baseStackAPS
              ? pushToStack(baseStackAPS, apsEntries)
              : initStack(bs.active_user_id ?? user.id, apsEntries);
          }
        }
        // ON_LRIG_ATTACK_STEP_START（C1 配線）: ATTACK_SIGNI→ATTACK_LRIG移行時（ルリグアタックステップ開始時）トリガー。
        // ターンプレイヤー（newMyState）の self【自】を発火（WX25-CP1-042-E2 等）。
        if (phase === 'ATTACK_SIGNI') {
          const lasRes = collectTurnTriggers('ON_LRIG_ATTACK_STEP_START', newMyState, op);
          foldTurnUsed(lasRes);
          const lasEntries = lasRes.entries;
          if (lasEntries.length > 0) {
            const baseStackLAS = (update.effect_stack as typeof bs.effect_stack) ?? bs.effect_stack ?? null;
            update.effect_stack = baseStackLAS
              ? pushToStack(baseStackLAS, lasEntries)
              : initStack(bs.active_user_id ?? user.id, lasEntries);
          }
        }
        // ON_MAIN_PHASE_START: GROW→MAIN移行時（メインフェイズ開始時）トリガー。
        // newMyState=ターンプレイヤー／op=非ターンプレイヤー。triggerScope:any_opp（「対戦相手のメインフェイズ開始時」
        // WXDi-P00-034）は op の場シグニで発火＝collectTurnTriggers の相手フィールド分岐が拾う。
        if (phase === 'GROW') {
          const mpsRes = collectTurnTriggers('ON_MAIN_PHASE_START', newMyState, op);
          foldTurnUsed(mpsRes);
          const mpsEntries = mpsRes.entries;
          if (mpsEntries.length > 0) {
            const baseStackMPS = (update.effect_stack as typeof bs.effect_stack) ?? bs.effect_stack ?? null;
            update.effect_stack = baseStackMPS
              ? pushToStack(baseStackMPS, mpsEntries)
              : initStack(bs.active_user_id ?? user.id, mpsEntries);
          }
        }
      }

      await supabase.from('battle_states')
        .update({ [stateKey]: newMyState, ...update })
        .eq('room_id', roomId);
    } finally {
      setLoading(false);
    }
  };

  // エンドフェイズ手札捨て選択の確定処理
  const confirmEndDiscard = async () => {
    if (pendingEndDiscard === null || !bs || loading) return;
    if (selectedEndDiscard.size !== pendingEndDiscard) return;
    setLoading(true);
    try {
      const stateKey = isHost ? 'host_state' : 'guest_state';
      const update: Partial<BattleStateRow> = {};

      // ビートゾーンをトラッシュへ（doPhaseAdvance と同じ処理）
      const myBeatEND = my.field.beat_zone ?? [];
      let myTrashBeat = my.trash;
      if (myBeatEND.length > 0) {
        myTrashBeat = [...my.trash, ...myBeatEND];
        appendBattleLogs([`ビートゾーン（${myBeatEND.length}枚）をトラッシュへ`]);
      }

      // 選択されたカードを捨てる
      const discardNums = [...selectedEndDiscard].map(i => my.hand[i]);
      let myHandEND = my.hand.filter((_, i) => !selectedEndDiscard.has(i));
      const myTrashEND = [...myTrashBeat, ...discardNums];
      appendBattleLogs([`手札上限超過（${my.hand.length}枚→${myHandEND.length}枚）：${discardNums.map(n => battleCardMap.get(n)?.CardName ?? n).join('・')}を捨て`]);

      // ターン終了時に効果（コイン/場トラッシュ/トラッシュ→手札/フリップ復元）。
      // doPhaseAdvance（ENDフェーズ①）で解決済み（end_turn_effects_resolved）の場合は再実行しない
      // ＝手札上限超過でここに来たケースは常に解決済み。未解決の防御として個別ガードを付ける。
      let myFieldAfterCoinCheck = { ...my.field, beat_zone: [] as string[] };
      let myTrashAfterCoinCheck = myTrashEND;
      // COIN_SPEND_CONDITION: ターン終了時にコイン消費チェック
      if (!my.end_turn_effects_resolved && (my.coin_condition_signi_instances ?? []).length > 0) {
        const coinSpent = (my.actions_done ?? []).includes('COIN_SPENT');
        if (!coinSpent) {
          const newSigniField = [...myFieldAfterCoinCheck.signi] as (string[] | null)[];
          for (const instId of my.coin_condition_signi_instances ?? []) {
            for (let zi = 0; zi < 3; zi++) {
              if (newSigniField[zi]?.includes(instId)) {
                myTrashAfterCoinCheck = [...myTrashAfterCoinCheck, ...newSigniField[zi]!];
                newSigniField[zi] = null;
                appendBattleLogs([`コイン消費なし → ${battleCardMap.get(instId)?.CardName ?? instId}をトラッシュ`]);
              }
            }
          }
          myFieldAfterCoinCheck = { ...myFieldAfterCoinCheck, signi: newSigniField };
        }
      }
      // turn_end_field_trash_targets
      if (!my.end_turn_effects_resolved && (my.turn_end_field_trash_targets ?? []).length > 0) {
        const newFieldSigniTEFT = [...myFieldAfterCoinCheck.signi] as (string[] | null)[];
        const trashedTEFT: string[] = [];
        for (const targetId of my.turn_end_field_trash_targets!) {
          const zi = newFieldSigniTEFT.findIndex(stack => stack?.at(-1) === targetId);
          if (zi < 0) continue;
          newFieldSigniTEFT[zi] = null;
          trashedTEFT.push(targetId);
        }
        if (trashedTEFT.length > 0) {
          myTrashAfterCoinCheck = [...myTrashAfterCoinCheck, ...trashedTEFT];
          myFieldAfterCoinCheck = { ...myFieldAfterCoinCheck, signi: newFieldSigniTEFT };
          appendBattleLogs([`ターン終了時：${trashedTEFT.map(n => battleCardMap.get(n)?.CardName ?? n).join('・')}をトラッシュへ`]);
        }
      }
      // game_turn_end_trash_to_hand（「このゲーム」持続なのでフラグは消さない。マーカーで二重適用を防ぐ）
      if (!my.end_turn_effects_resolved && my.game_turn_end_trash_to_hand) {
        const { class: ttCls, count: ttCnt } = my.game_turn_end_trash_to_hand;
        const ttMatches = myTrashAfterCoinCheck.filter(cn => {
          const c = battleCardMap.get(cn);
          return c?.Type === 'シグニ' && (c.CardClass ?? '').includes(ttCls);
        });
        const ttToHand = ttMatches.slice(0, ttCnt);
        if (ttToHand.length > 0) {
          myTrashAfterCoinCheck = myTrashAfterCoinCheck.filter(cn => !ttToHand.includes(cn));
          myHandEND = [...myHandEND, ...ttToHand];
          appendBattleLogs([`ターン終了時：トラッシュ＜${ttCls}＞シグニ${ttToHand.length}枚を手札へ（このゲーム）`]);
        }
      }
      // flip_attack_signi_zones
      if (!my.end_turn_effects_resolved && (my.flip_attack_signi_zones ?? []).length > 0) {
        const newSigniDownFA = [...(myFieldAfterCoinCheck.signi_down ?? [false, false, false])] as [boolean, boolean, boolean];
        const unflipped: string[] = [];
        for (const zi of my.flip_attack_signi_zones!) {
          if (my.field.signi[zi]?.length) { // ゾーンにシグニが残っていれば表向きに戻す
            newSigniDownFA[zi] = false;
            const topName = battleCardMap.get(my.field.signi[zi]?.at(-1) ?? '')?.CardName;
            if (topName) unflipped.push(topName);
          }
        }
        myFieldAfterCoinCheck = { ...myFieldAfterCoinCheck, signi_down: newSigniDownFA };
        if (unflipped.length > 0) appendBattleLogs([`フリップアタック復元：${unflipped.join('・')}を表向きに`]);
      }
      // ターン終了時に効果（ドロー等）は doPhaseAdvance（ENDフェーズ①）で解決・永続化済み。
      // ここではフラグのクリアと最終クリーンアップのみ行う。
      // ターン内一時状態をクリアして newMyState を確定
      let newMyState: typeof my = {
        ...my,
        hand: myHandEND,
        trash: myTrashAfterCoinCheck,
        field: myFieldAfterCoinCheck,
        turn_end_draw_count: undefined,
        end_turn_effects_resolved: undefined, // マーカーをクリア（次ターンの解決に持ち越さない）
        temp_power_mods: [], temp_level_mods: [], keyword_grants: {}, granted_effects: {},
        abilities_removed: [], // REMOVE_ABILITIES「ターン終了時まで」を自ターン終了時にクリア
        field_keyword_grants_active: undefined, // NEXT_TURN場全体付与：自ターン終了時にクリア
        blocked_actions: [], blocked_card_names: [], actions_done: [],
        cards_drawn_by_effect_this_turn: 0,
        hand_trashed_by_opp_this_turn: 0,   // HAND_TRASHED_BY_OPP
        energy_trashed_by_opp_this_turn: 0, // ENERGY_TRASHED_BY_OPP
        last_effect_draw_source: undefined, // 効果ドローの原因カードをリセット（drawBySourceStory）
        life_crashed_this_turn: undefined,
        delayed_triggers: undefined,  // INSTALL_DELAYED_TRIGGER（B3）「このターン」設置の遅延トリガーをクリア
        keys_abilities_disabled: undefined, // CONDITIONAL_GROW_AND_KEY_DISABLE「このターン」キー能力喪失をクリア
        pending_crashed_cards: [], must_attack_signi: undefined, must_attack_infected_only: undefined,
        cost_modifiers: (my.cost_modifiers ?? []).filter(m => m.until !== 'END_OF_TURN'),
        prevent_next_damage: undefined, damage_replace_mill: undefined, life_burst_double_next: undefined,
        prevent_damage_windows: advancePreventDamageWindows(my.prevent_damage_windows), // PREVENT_DAMAGE：「次のターンの間」は1回だけ持ち越し
        lrig_granted_auto_effects: my.lrig_granted_auto_effects?.filter(e => e.permanentGrant), banish_redirect: undefined,
        banish_redirect_to_hand: undefined, banish_redirect_to_exile: undefined, power0_banish_to_trash: undefined, power0_banish_to_trash_opp_only: undefined,
        banish_redirect_by_source_nums: undefined,
        double_power_minus_this_turn: undefined, no_grow: undefined,
        suppress_life_burst: undefined, prevent_lrig_damage: undefined,
        prevent_defeat: undefined, declared_guard_restrict_level: undefined,
        declared_class: undefined, hand_signi_guard_enabled: undefined,
        lrig_limit_mod: undefined, prevent_opp_guard: undefined,
        draw_limit: undefined, card_class_overrides: undefined,
        signi_color_overrides: undefined, disabled_signi_zones: undefined,
        attacked_signi_ids: undefined, signi_attack_once_limit: undefined,
        signi_attack_cost: undefined, lrig_riding_signi: undefined,
        lrig_attack_remaining: undefined, suppress_center_on_play: undefined,
        crash_to_trash_instead: undefined, negate_opp_signi_attacks_until: undefined,
        all_cont_effects_negated: undefined, banish_to_trash_by_self: undefined,
        negate_coin_abilities: undefined, coin_condition_signi_instances: undefined,
        grid_reveal_plus_one_this_turn: undefined, deck_signi_level_override: undefined,
        reduce_next_on_play_cost: undefined, optional_discard_guard_enabled: undefined,
        flip_attack_signi_zones: undefined, turn_end_field_trash_targets: undefined,
        spell_negated_this_turn: undefined, turn_trigger_3rd_plant_down: undefined,
        turn_plant_down_count: undefined, lrig_abilities_disabled: undefined,
        turn_hand_discarded_count: undefined, turn_signi_returned_to_hand: undefined, turn_arts_used: undefined, turn_arts_used_colors: undefined,
        is_betting_this_effect: undefined, last_discarded_signi_power: undefined, last_discarded_signi_level: undefined,
        non_dissona_spell_played_this_turn: undefined, dissona_only_spells_this_turn: undefined,
        cancel_current_signi_attack: undefined,
      };
      // 相手のアップ処理
      const opKey = isHost ? 'guest_state' : 'host_state';
      const opState = isHost ? bs.guest_state : bs.host_state;
      const curSigniDown   = opState.field.signi_down   ?? [false, false, false];
      const curSigniFrozen = opState.field.signi_frozen  ?? [false, false, false];
      const curLrigFrozen  = opState.field.lrig_frozen   ?? false;
      const newSigniDown = curSigniDown.map((down, i) => down && curSigniFrozen[i]) as boolean[];
      const convertedOpBlocked = (opState.blocked_actions ?? [])
        .filter(a => a.endsWith(':NEXT_TURN'))
        .map(a => a.replace(':NEXT_TURN', ''));
      const upkeepLrigDown2 = ((opState.field.lrig_down ?? false) && curLrigFrozen)
        || (opState.lrig_upkeep_condition !== undefined);
      if (opState.lrig_upkeep_condition) appendBattleLogs([`相手のセンタールリグはアップ条件あり（${opState.lrig_upkeep_condition}）`]);
      update[opKey] = {
        ...opState,
        blocked_actions: convertedOpBlocked,
        abilities_removed: [], // 相手に付与された REMOVE_ABILITIES「ターン終了時まで」を自ターン終了時にクリア（WX05-001-E2 等）
        field_keyword_grants_active: opState.field_keyword_grants_next_turn, // NEXT_TURN場全体付与：予約→active
        field_keyword_grants_next_turn: undefined,
        // FREE_GROW_NEXT_TURN: 次ターングロウ無料の予約→active（WX03-024-BURST）
        free_grow_this_turn: opState.free_grow_next_turn ? true : opState.free_grow_this_turn,
        free_grow_next_turn: undefined,
        signi_played_from_trash: undefined, // トラッシュ出自マーカーをターン開始時にクリア
        negate_coin_abilities: undefined,
        keyword_grants_until_opp_turn: undefined,
        granted_effects_until_opp_turn: undefined, // UNTIL_OPP_TURN_END
        power_mods_until_opp_turn: undefined,      // UNTIL_OPP_TURN_END
        opp_cost_up_until_opp_turn: undefined,     // COST_INCREASE(NEXT_OPP_TURN)
        turn_arts_used: undefined, turn_arts_used_colors: undefined,                 // このターンのアーツ使用フラグをリセット（相手ターン中のガード使用分。ARTS_USED_THIS_TURN）
        signi_deploy_count_limit: undefined,       // 配置数制限（このターン・相手にかけられた分）を自分のターン開始時にリセット
        field: {
          ...opState.field,
          signi_down:   newSigniDown,
          signi_frozen: [false, false, false],
          lrig_down:    upkeepLrigDown2,
          lrig_frozen:  false,
          assist_lrig_l_down: false,
          assist_lrig_r_down: false,
        },
      };
      // 追加ターン / ターンプレイヤー交代
      if (my.extra_turn) {
        newMyState = { ...newMyState, extra_turn: undefined };
        update.turn_phase = 'UP';
        update.turn_count = bs.turn_count + 1;
        appendBattleLogs(['追加ターン取得！']);
      } else {
        update.turn_phase = 'UP';
        update.active_user_id = (isHost ? bs.guest_id : bs.host_id) as string;
        update.turn_count = bs.turn_count + 1;
      }

      await supabase.from('battle_states')
        .update({ [stateKey]: newMyState, ...update })
        .eq('room_id', roomId);

      closeEndDiscard();
    } finally {
      setLoading(false);
    }
  };

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

  // 強制攻撃: まだアタック（ダウン）しておらず、アタック可能な「強制対象」シグニのゾーン一覧を返す。
  // must_attack_infected_only の場合は感染状態（ウィルスが乗っている）シグニのみが対象。
  // 「アタック可能か」は実際にアタックボタンが出る条件（getMySigniZoneActions）で判定するため、
  // パワー上限・コスト不足・アタック禁止など「可能ならば」の対象外ケースは自動的に除外され、
  // アタックできないシグニだけが残ってフェイズを進められなくなるソフトロックを防ぐ。
  // FORCE_FRONT_SIGNI_ATTACK（WX20-045 マロンクリーム「この正面のシグニは可能ならばアタックしなければならない」）:
  // 相手の場のこの効果を読み、自分の該当（正面）ゾーンを個別強制対象にする。
  const forcedFrontAttackZones = (): Set<number> =>
    collectForcedFrontAttackZones(my, op, isMyTurn, effectsMap, battleCardMap);

  const mustAttackRemainingZones = (): number[] => {
    const forcedFront = forcedFrontAttackZones();
    if (!my.must_attack_signi && forcedFront.size === 0) return [];
    const signiDown = my.field.signi_down  ?? [false, false, false];
    const virus     = my.field.signi_virus ?? [0, 0, 0];
    const zones: number[] = [];
    for (let i = 0; i < my.field.signi.length; i++) {
      const top = my.field.signi[i]?.at(-1);
      if (!top) continue;
      if (signiDown[i]) continue;                                   // 既にアタック済み（ダウン）
      // 全体強制でない（個別の正面強制のみの）ゾーンは forcedFront に含まれるゾーンに限定
      const isForcedByFront = forcedFront.has(i);
      if (!my.must_attack_signi && !isForcedByFront) continue;
      if (my.must_attack_signi && my.must_attack_infected_only && (virus[i] ?? 0) === 0 && !isForcedByFront) continue; // 非感染は対象外
      const acts = getMySigniZoneActions(i);                        // アタックボタンが出る＝アタック可能
      if (!acts.some(a => a.label.includes('アタック'))) continue;
      zones.push(i);
    }
    return zones;
  };

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
        const growRed = collectGrowCostReductions(my, op, isMyTurn, effectsMap, battleCardMap);
        const hasAffordable = growCandidates.some(card => {
          const gCoin = parseCoinCost(card.GrowCost);
          return (gCoin === 0 || my.coins >= gCoin) &&
            // エナ代替トラッシュ（COST_SUBSTITUTE / ENERGY_SUBSTITUTE_TRASH_SIGNI 等）はグロウ支払いにも効く
            // ＝原文「あなたが《X》を支払う際」はグロウコストを含む（タスク12(xxxvi)・続き206）。
            canAffordGrowCost(my.energy, battleCards, applyGrowCostReduction(card.GrowCost, growRed), my.keyword_grants, myEnaAllMulti, myColorlessOverrides, myColorSubs,
              undefined, myEnergyTrashSubInfo.wildcardInstIds, myEnergyTrashSubInfo.colorOverrideMap);
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
      if (hasLrig && lrigUp) {
        setShowLrigAttackSkipConfirm(true);
        return;
      }
    }
    doPhaseAdvance();
  };

  // エナチャージ（手札のカードをエナゾーンへ）
  const handleEnergyChargeFromHand = async (handIndex: number) => {
    if (!isMyTurn || loading) return;
    setLoading(true);
    try {
      const cardNum = my.hand[handIndex];
      const name = battleCardMap.get(cardNum)?.CardName ?? cardNum;
      const colorRestrict = collectOppEnergyColorRestriction(op, battleCardMap, effectsMap);
      const handWithout = my.hand.filter((_, i) => i !== handIndex);
      let newMyState: PlayerState;
      if (colorRestrict && !(battleCardMap.get(cardNum)?.Color ?? '').includes(colorRestrict)) {
        newMyState = { ...my, hand: handWithout, trash: [...my.trash, cardNum], actions_done: [...(my.actions_done ?? []), 'ENERGY'] };
        appendBattleLogs([`エナチャージ→トラッシュ（${name}、${colorRestrict}色制限）`]);
      } else {
        newMyState = { ...my, hand: handWithout, energy: [...my.energy, cardNum], actions_done: [...(my.actions_done ?? []), 'ENERGY'] };
        appendBattleLogs([`エナチャージ（${name}）`]);
      }
      const stateKey = isHost ? 'host_state' : 'guest_state';
      await supabase.from('battle_states').update({ [stateKey]: newMyState }).eq('room_id', roomId);
    } finally {
      setLoading(false);
    }
  };

  // エナチャージ（シグニゾーンの最上層カードをエナゾーンへ）
  const handleEnergyChargeFromSigni = async (zoneIndex: number) => {
    if (!isMyTurn || loading) return;
    setLoading(true);
    try {
      const signiStack = my.field.signi[zoneIndex];
      if (!signiStack || signiStack.length === 0) return;
      const cardNum = signiStack[signiStack.length - 1];
      const name = battleCardMap.get(cardNum)?.CardName ?? cardNum;
      const newStack = signiStack.slice(0, -1);
      const newSigni = [...my.field.signi] as (string[] | null)[];
      newSigni[zoneIndex] = newStack.length > 0 ? newStack : null;
      const colorRestrict = collectOppEnergyColorRestriction(op, battleCardMap, effectsMap);
      let newMyState: PlayerState;
      if (colorRestrict && !(battleCardMap.get(cardNum)?.Color ?? '').includes(colorRestrict)) {
        newMyState = { ...my, field: { ...my.field, signi: newSigni }, trash: [...my.trash, cardNum], actions_done: [...(my.actions_done ?? []), 'ENERGY'] };
        appendBattleLogs([`エナチャージ→トラッシュ（${name}、${colorRestrict}色制限）`]);
      } else {
        newMyState = { ...my, field: { ...my.field, signi: newSigni }, energy: [...my.energy, cardNum], actions_done: [...(my.actions_done ?? []), 'ENERGY'] };
        appendBattleLogs([`エナチャージ（${name}）`]);
      }
      const stateKey = isHost ? 'host_state' : 'guest_state';
      await supabase.from('battle_states').update({ [stateKey]: newMyState }).eq('room_id', roomId);
    } finally {
      setLoading(false);
    }
  };

  // ===== 効果エンジン統合 =====

  // 効果タイプの表示ラベル
  const effectTypeLabel = (t: string) => {
    if (t === 'AUTO') return '【自】';
    if (t === 'ACTIVATED') return '【起】';
    if (t === 'LIFE_BURST') return '【ライフバースト】';
    return `【${t}】`;
  };

  // --- スタック操作 ---

  /**
   * カードの効果をスタックに積む。
   * effectTypes/timings でフィルタし、該当効果を StackEntry として追加。
   * extraUpdate でフィールド状態（召喚後など）を同時に保存できる。
   */
  const queueCardEffects = async (
    cardNum: string,
    effectTypes: ('AUTO' | 'ACTIVATED' | 'LIFE_BURST')[],
    timings: string[],
    startMyState: PlayerState,
    _startOpState: PlayerState,
    extraUpdate: Record<string, unknown> = {},
    repeatCount = 1,
    extraEntries: StackEntry[] = [],
    owner?: { id: string; key: 'host_state' | 'guest_state' }, // 省略時は自分（CPU効果は明示指定）
  ): Promise<boolean> => {
    const ownerId = owner?.id ?? user.id;
    const effects = effectsMap.get(cardNum) ?? [];
    let targets = effects.filter(e =>
      (effectTypes as string[]).includes(e.effectType) &&
      (timings.length === 0 || e.timing?.some(t => timings.includes(t)))
    );
    // crossOnly（【クロス出】【クロス起】等）: 発生源シグニのゾーンがクロス状態でなければ発動しない。
    // トリガー時（収集時）の状態 startMyState で判定する（解決時ではなく発動時のクロス状態が正）。
    if (targets.some(e => e.crossOnly)) {
      const crossOk = isCrossZoneActive(startMyState, cardNum, battleCardMap);
      targets = targets.filter(e => !e.crossOnly || crossOk);
    }
    // kizunaIcon（【絆出】【絆自】）: 発生源カード名との絆を獲得していなければ発動しない。
    // crossOnly と同じくトリガー時（収集時）の状態 startMyState で判定する。
    targets = filterKizunaGated(targets, startMyState, cardNum, battleCardMap);
    // placedDown（G144「このシグニがダウン状態で場に出たとき」self経路）: 自身がダウン状態で出ていなければ発動しない。
    // 手札からの通常召喚はダウンにならないため自然に除外される（ダウン配置は効果経由のみ）。
    if (timings.includes('ON_PLAY') && targets.some(e => e.triggerCondition?.placedDown)) {
      const zi = startMyState.field.signi.findIndex(s => s?.at(-1) === cardNum);
      const isDown = zi >= 0 && (startMyState.field.signi_down?.[zi] ?? false);
      targets = targets.filter(e => !e.triggerCondition?.placedDown || isDown);
    }
    if (targets.length === 0 && extraEntries.length === 0) return false;

    const cardName = battleCardMap.get(cardNum)?.CardName ?? cardNum;
    const turnPlayerId = bs?.active_user_id ?? ownerId;

    const makeEntries = (): StackEntry[] => targets.map(eff => ({
      id: generateUUID(),
      playerId: ownerId,
      cardNum,
      effectId: eff.effectId,
      label: `${cardName} の${effectTypeLabel(eff.effectType)}効果`,
      effect: eff,
    }));
    const allEntries: StackEntry[] = [];
    for (let r = 0; r < repeatCount; r++) allEntries.push(...makeEntries());
    allEntries.push(...extraEntries);
    const entries = allEntries;

    const existing = bs?.effect_stack ?? null;
    const stack: EffectStack = existing
      ? pushToStack(existing, entries)
      : initStack(turnPlayerId, entries);

    const myKey = owner?.key ?? (isHost ? 'host_state' : 'guest_state');
    const { error } = await supabase.from('battle_states')
      .update({
        [myKey]: startMyState,
        effect_stack: stack,
        pending_effect: null,
        ...extraUpdate,
      })
      .eq('room_id', roomId);
    if (error) console.error('[queueCardEffects] DB error:', error);
    return true;
  };

  // --- スタック解決 ---

  /**
   * キューの先頭エントリを取り出して effectExecutor で実行し DB に保存する。
   * ターンプレイヤーが呼び出す（useEffect で監視）。
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
      const { entry, newStack } = shiftQueue(stack);
      if (!entry) {
        await supabase.from('battle_states')
          .update({ effect_stack: null })
          .eq('room_id', roomId);
        return;
      }

      lastResolvedEntryIdRef.current = entry.id;
      const ownerIsHost = entry.playerId === bs.host_id;
      const ownerState  = ownerIsHost ? bs.host_state : bs.guest_state;
      const otherState  = ownerIsHost ? bs.guest_state : bs.host_state;
      const isOwnerTurn = bs.active_user_id === entry.playerId;
      const who = entry.playerId === user.id ? '自分' : '相手';
      appendBattleLogs([`[${who}] ${entry.label}`], { defer: true });
      // ATTACK_PHASE_LEVEL_OVERRIDE: アタックフェイズ中は英知レベルオーバーライドを計算
      const isAttackPhaseBS = ['ATTACK_ARTS', 'ATTACK_ARTS_OP', 'ATTACK_SIGNI', 'ATTACK_LRIG'].includes(bs.turn_phase ?? '');
      const ownerLevelOverrides = isAttackPhaseBS ? collectAttackPhaseLevelOverrides(ownerState, effectsMap, battleCardMap) : {};
      const ownerStateForCtx = Object.keys(ownerLevelOverrides).length > 0
        ? { ...ownerState, attack_phase_level_overrides: ownerLevelOverrides } : ownerState;
      const ctxPowers = calcFieldPowers(ownerStateForCtx, otherState, isOwnerTurn, effectsMap, battleCardMap, bs.turn_phase);
      // PREVENT_ZONE_MOVE_BY_OPP: 相手（otherState）の保護ゾーンを動的計算してctxに渡す
      const otherProtectedZones = collectProtectedZones(otherState, battleCardMap, effectsMap);
      // PREVENT_SIGNI_ABILITY_LOSS_BY_OPP: 相手フィールドの能力保護シグニを動的計算してctxに渡す
      const otherProtectedSigniNums = collectAbilityProtectedSigni(otherState, ownerStateForCtx, battleCardMap, effectsMap, !isOwnerTurn);
      // PREVENT_SELF_DOWN_BY_OPP / PREVENT_SIGNI_DOWN_BY_OPP_ALL: 相手フィールドのダウン保護シグニ
      // !isOwnerTurn: 相手(otherState)視点での isOwnerTurn を渡す（collectAbilityProtectedSigni と同じ慣例）
      const otherDownProtectedNums = collectDownProtectedSigni(otherState, battleCardMap, effectsMap, ownerStateForCtx, !isOwnerTurn);
      // SIGNI_CANT_BOUNCE_FROM_FIELD: 相手フィールドのバウンス保護シグニ
      const otherBounceProtectedNums = collectBounceProtectedSigni(otherState, battleCardMap, effectsMap, ownerStateForCtx, !isOwnerTurn);
      // GRANT_PROTECTION from=['BANISH'/'any']: 相手フィールドのバニッシュ保護シグニ
      const otherBanishProtectedNums = collectBanishEffectProtectedSigni(otherState, ownerStateForCtx, !isOwnerTurn, effectsMap, battleCardMap);
      // PREVENT_SIGNI_MOVE_BY_OPP_EXCEPT_BANISH / PREVENT_NON_FIELD_MOVE_BY_OPP / SIGNI_PROTECT_MOVE_EXCEPT_ENERGY: 相手フィールドのトラッシュ保護シグニ
      const otherTrashFieldProtectedNums = collectTrashFieldProtectedSigni(otherState, battleCardMap, effectsMap, ownerStateForCtx, !isOwnerTurn);
      // SELF_TRASH_PREVENT（WX07-033）: 効果オーナー自身が自シグニをトラッシュに置けない制限（§6.1）
      const ownSelfTrashPreventNums = collectSelfTrashPreventNums(ownerStateForCtx, otherState, isOwnerTurn, effectsMap, battleCardMap);
      // PREVENT_OPP_SIGNI_ABILITY_GAIN / PREVENT_ABILITY_CHANGE_BY_OPP: 能力付与保護シグニ
      // !isOwnerTurn: 第1引数 otherState（相手）視点でのisOwnerTurnを渡す
      const otherAbilityGainProtectedNums0 = collectAbilityGainProtectedSigni(otherState, ownerStateForCtx, battleCardMap, effectsMap, !isOwnerTurn);
      // GRANT_PROTECTION from=['ルリグ'/'シグニ'…] 完全効果耐性（「対戦相手の、ルリグとシグニの効果を受けない」WX04-035-E1等）:
      // 解決中効果のソースカード種別が耐性対象に該当する場合、その美巧シグニを全保護パスへ反映する。
      const immuneSourceType = battleCardMap.get(entry.cardNum)?.Type ?? '';
      const otherEffectImmuneNums = collectEffectImmuneSigni(otherState, ownerStateForCtx, battleCardMap, effectsMap, !isOwnerTurn, immuneSourceType, entry.cardNum);
      // 「対戦相手の【シグニ】の効果によってバニッシュされない」: ソース種別一致時のみバニッシュ保護（バニッシュ軸限定）
      const otherBanishBySourceNums = collectBanishBySourceProtectedSigni(otherState, ownerStateForCtx, !isOwnerTurn, effectsMap, battleCardMap, immuneSourceType);
      const otherDownProtectedNumsM   = [...otherDownProtectedNums, ...otherEffectImmuneNums];
      const otherBounceProtectedNumsM = [...otherBounceProtectedNums, ...otherEffectImmuneNums];
      const otherBanishProtectedNumsM = new Set<string>([...otherBanishProtectedNums, ...otherEffectImmuneNums, ...otherBanishBySourceNums]);
      const otherTrashFieldProtectedNumsM = [...otherTrashFieldProtectedNums, ...otherEffectImmuneNums];
      const otherProtectedSigniNumsM  = [...otherProtectedSigniNums, ...otherEffectImmuneNums];
      const otherAbilityGainProtectedNums = [...otherAbilityGainProtectedNums0, ...otherEffectImmuneNums];
      // BLOCK_OPP_DECK_TO_ENERGY / BLOCK_OPP_SIGNI_FIELD_PLACE_BY_SIGNI_EFFECT
      const contBlockedCtx = calcContinuousBlockedActions(ownerStateForCtx, otherState, isOwnerTurn, effectsMap, battleCardMap);
      const allColorSigniNums = new Set([...collectAllColorSigniForField(ownerStateForCtx, battleCardMap, effectsMap, otherState, isOwnerTurn), ...collectAllColorSigniForField(otherState, battleCardMap, effectsMap, ownerStateForCtx, !isOwnerTurn)]);
      const fieldSigniExtraColors = new Map([...collectFieldSigniExtraColors(ownerStateForCtx, battleCardMap, effectsMap, otherState, isOwnerTurn), ...collectFieldSigniExtraColors(otherState, battleCardMap, effectsMap, ownerStateForCtx, !isOwnerTurn)]);
      // OPP_TRASH_LOSE_COLOR_AND_CLASS: otherState が自ターン中にこの効果を持つとき ownerState のトラッシュが色/クラスを失う
      const oppTrashColorLoss = collectOppTrashLoseColorClass(otherState, ownerStateForCtx, effectsMap, battleCardMap, !isOwnerTurn);
      const treatAsClassAllZones = collectTreatAsClassAllZones(ownerStateForCtx, otherState, effectsMap, battleCardMap);
      const deckTrashLevel1Nums = collectDeckTrashLevel1Nums(ownerStateForCtx, otherState, effectsMap);
      const declaredCardMap1 = applyContinuousBaseLevelOverride(applyDeclaredZoneClassOverride(battleCardMap, ownerStateForCtx, otherState), ownerStateForCtx, otherState, effectsMap, isOwnerTurn);
      // CHARM_PROTECTION（WX04-052-E1）: 両プレイヤーのチャーム盾シグニ
      const charmShieldNums = new Set<string>([
        ...collectCharmShieldSigni(ownerStateForCtx, otherState, isOwnerTurn, effectsMap, battleCardMap),
        ...collectCharmShieldSigni(otherState, ownerStateForCtx, !isOwnerTurn, effectsMap, battleCardMap),
      ]);
      const ctx: ExecCtx = { ownerState: ownerStateForCtx, otherState, cardMap: declaredCardMap1, logs: [], effectivePowers: ctxPowers, sourceCardNum: entry.cardNum, triggeringCardNum: entry.triggeringCardNum, triggeringKeyword: entry.triggeringKeyword, battleAttackerCardNum: entry.battleAttackerCardNum, otherProtectedZones, otherProtectedSigniNums: otherProtectedSigniNumsM, otherDownProtectedNums: otherDownProtectedNumsM, otherBounceProtectedNums: otherBounceProtectedNumsM, otherBanishProtectedNums: otherBanishProtectedNumsM, otherTrashFieldProtectedNums: otherTrashFieldProtectedNumsM, ownSelfTrashPreventNums, otherAbilityGainProtectedNums, otherEffectImmuneNums: otherEffectImmuneNums, charmShieldNums, deckToEnergyBlocked: contBlockedCtx.forSelf.has('DECK_TO_ENERGY'), signiFieldPlaceByEffectBlocked: contBlockedCtx.forSelf.has('SIGNI_FIELD_PLACE_BY_EFFECT'), allColorSigniNums, fieldSigniExtraColors, oppTrashColorLoss, treatAsClassAllZones, deckTrashLevel1Nums };
      let result = executeEffect(entry.effect, ctx);
      // デッキ0枚→リフレッシュ（効果解決後）。ターンプレイヤーの2回目リフレッシュならその後ターン終了。
      {
        const refreshed = applyRefreshOnDone(result, battleCardMap);
        if (refreshed !== result) {
          const turnPlayerIsOwner = entry.playerId === bs.active_user_id;
          const turnPlayerRefreshed = turnPlayerIsOwner ? refreshed.ownerRefreshed : refreshed.otherRefreshed;
          const turnPlayerCount = (turnPlayerIsOwner ? refreshed.ownerState : refreshed.otherState).refresh_count_this_turn ?? 0;
          result = (turnPlayerRefreshed && turnPlayerCount >= 2 && refreshed.done)
            ? { ...refreshed, forceEndTurn: true }
            : refreshed;
        }
      }
      if (result.logs.length > 0) appendBattleLogs(result.logs, { defer: true });

      // FORCE_TARGET_SELF: opp_field SELECT_TARGETで強制対象シグニが候補にある場合、候補を絞る
      if (!result.done && result.pending.type === 'SELECT_TARGET' && result.pending.targetScope === 'opp_field') {
        const forcedNums = collectForcedTargets(otherState, ownerStateForCtx, battleCardMap, effectsMap, !isOwnerTurn);
        const forcedInCands = forcedNums.filter(n => result.done === false && result.pending.type === 'SELECT_TARGET' && result.pending.candidates.includes(n));
        if (forcedInCands.length > 0 && result.done === false && result.pending.type === 'SELECT_TARGET' && forcedInCands.length < result.pending.candidates.length) {
          const pend = result.pending;
          result = { ...result, pending: { ...pend, candidates: forcedInCands } } as typeof result;
          appendBattleLogs([`[FORCE_TARGET_SELF] 対象が${forcedInCands.length}体に強制`], { defer: true });
        }
      }

      const hostState  = ownerIsHost ? result.ownerState : result.otherState;
      const guestState = ownerIsHost ? result.otherState : result.ownerState;

      const stackAfter = isStackDone(newStack) ? null : newStack;
      const update: Record<string, unknown> = {
        host_state: hostState,
        guest_state: guestState,
        effect_stack: stackAfter,
      };
      if (!result.done) {
        // opponentResponds=true の場合、相手プレイヤーがUIを操作する
        const oppId = ownerIsHost ? bs.guest_id : bs.host_id;
        const respondPlayerId = (
          (result.pending?.type === 'SELECT_TARGET' && result.pending.opponentResponds) ||
          (result.pending?.type === 'CHOOSE' && result.pending.opponentResponds)
        ) ? oppId : undefined;
        update.pending_effect = {
          sourcePlayerId: entry.playerId,
          ...(respondPlayerId ? { respondPlayerId } : {}),
          sourceCardNum: entry.cardNum,
          effectId: entry.effectId,
          interaction: result.pending,
          ...(entry.triggeringCardNum ? { triggeringCardNum: entry.triggeringCardNum } : {}),
          ...(entry.triggeringKeyword ? { triggeringKeyword: entry.triggeringKeyword } : {}),
          ...(result.trapActivated ? { trapActivated: true } : {}),
        } satisfies PendingEffect;
        // インタラクション中はスタック（残キュー）を保持
        update.effect_stack = newStack;
      } else {
        update.pending_effect = null;

        // === 盤面差分トリガーの統合収集（続き61・Opus）===
        // 従来ここに全 collector が並んでいたが、resume 経路（handleEffectInteraction）と共通化するため
        // collectBoardDiffTriggers に集約した。action 型固有のもの（COLLAB/REVEAL_UNTIL_TO_FIELD/arts）は下に inline 据置。
        {
          const bd = collectBoardDiffTriggers(hostState, guestState, {
            causeOwnerId: entry.playerId,
            causeSourceCardNum: entry.cardNum,
            fieldTrashCostCards: result.fieldTrashCostCards,
          });
          update.host_state = bd.hostState;
          update.guest_state = bd.guestState;
          if (bd.entries.length > 0) {
            const baseStackBD = (update.effect_stack as typeof stackAfter) ?? null;
            update.effect_stack = baseStackBD
              ? pushToStack(baseStackBD, bd.entries)
              : initStack(stack.turnPlayerId, bd.entries);
          }
        }

        // 《トラップアイコン》発動は signi_traps の減少だけでは「破棄」と区別できないため、
        // executor が発動枝で立てた明示イベントを、現在の効果解決完了後に収集する。
        if (result.trapActivated) {
          const ta = collectTrapActivateTriggers(entry.playerId, hostState, guestState);
          if (ta.entries.length > 0) {
            const baseStackTA = (update.effect_stack as typeof stackAfter) ?? null;
            update.effect_stack = baseStackTA
              ? pushToStack(baseStackTA, ta.entries)
              : initStack(stack.turnPlayerId, ta.entries);
          }
          if (ta.usedHostIds.length > 0) {
            const hs = (('host_state' in update ? update.host_state : hostState)) as PlayerState;
            update.host_state = { ...hs, actions_done: [...(hs.actions_done ?? []), ...ta.usedHostIds] };
          }
          if (ta.usedGuestIds.length > 0) {
            const gs = (('guest_state' in update ? update.guest_state : guestState)) as PlayerState;
            update.guest_state = { ...gs, actions_done: [...(gs.actions_done ?? []), ...ta.usedGuestIds] };
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
            const tt = collectTargetedTriggers(autoTargetedOpp, oppOfSourceId, hostState, guestState);
            if (tt.entries.length > 0) {
              const baseStackT = (update.effect_stack as typeof stackAfter) ?? null;
              update.effect_stack = baseStackT
                ? pushToStack(baseStackT, tt.entries)
                : initStack(stack.turnPlayerId, tt.entries);
            }
            if (tt.usedHostIds.length > 0) {
              const hs = (('host_state' in update ? update.host_state : hostState)) as PlayerState;
              update.host_state = { ...hs, actions_done: [...(hs.actions_done ?? []), ...tt.usedHostIds] };
            }
            if (tt.usedGuestIds.length > 0) {
              const gs = (('guest_state' in update ? update.guest_state : guestState)) as PlayerState;
              update.guest_state = { ...gs, actions_done: [...(gs.actions_done ?? []), ...tt.usedGuestIds] };
            }
          }
        }

        // COLLAB: コラボライバー呼び出しで配置されたアシストルリグのON_PLAY効果を積む
        if ((entry.effect.action as import('../types/effects').StubAction)?.type === 'STUB' &&
            (entry.effect.action as import('../types/effects').StubAction)?.id === 'COLLAB') {
          const collabOnPlayEntries: StackEntry[] = [];
          for (const instanceId of result.lastProcessedCards ?? []) {
            const cn = getCardNum(instanceId);
            for (const eff of (effectsMap.get(cn) ?? [])) {
              if (eff.effectType !== 'AUTO' || !eff.timing?.includes('ON_PLAY')) continue;
              collabOnPlayEntries.push({
                id: generateUUID(),
                playerId: entry.playerId,
                cardNum: instanceId,
                effectId: eff.effectId,
                label: `${battleCardMap.get(cn)?.CardName ?? cn} の【出】効果`,
                effect: eff,
              });
            }
          }
          if (collabOnPlayEntries.length > 0) {
            const baseStackC = (update.effect_stack as typeof stackAfter) ?? null;
            update.effect_stack = baseStackC
              ? pushToStack(baseStackC, collabOnPlayEntries)
              : initStack(stack.turnPlayerId, collabOnPlayEntries);
          }
        }

        // 開花（ON_BLOOM）トリガーは上の detectBloomedSigni / collectBloomTriggers で収集済み。
        // ルール上「開花」は「場に出た」扱いではないため、ここで ON_PLAY（出現時）は発火させない。

        // REVEAL_UNTIL_TO_FIELD（WX04-093「惰眠」等）: 効果で場に出したシグニの【出】(ON_PLAY) を積む。
        // lastProcessedCards に場へ出した instanceId が全て入る（トラッシュ送りのシグニは含まれない）。
        // 原文「【出】能力はこのスペルを処理したあとに好きな順番で発動する」→ 複数エントリを積めば整列UIで順番を選べる。
        if ((entry.effect.action as import('../types/effects').RevealUntilToFieldAction)?.type === 'REVEAL_UNTIL_TO_FIELD') {
          // bySigniEffect 限定の【出】はソース（場出しした効果元）がシグニの場合のみ発火（G079）。
          const sourceIsSigni = battleCardMap.get(entry.cardNum)?.Type === 'シグニ';
          // suppressOnPlay:「その（それらの）シグニの【出】能力は発動しない」＝出したシグニ自身の ON_PLAY を積まない（タスク12(xxix)）
          const suppressOnPlay = !!(entry.effect.action as import('../types/effects').RevealUntilToFieldAction)?.suppressOnPlay;
          const rutfOnPlayEntries: StackEntry[] = [];
          for (const instanceId of suppressOnPlay ? [] : (result.lastProcessedCards ?? [])) {
            const cn = getCardNum(instanceId);
            for (const eff of (effectsMap.get(cn) ?? [])) {
              if (eff.effectType !== 'AUTO' || !eff.timing?.includes('ON_PLAY')) continue;
              if (eff.triggerCondition?.bySigniEffect && !sourceIsSigni) continue;
              rutfOnPlayEntries.push({
                id: generateUUID(),
                playerId: entry.playerId,
                cardNum: instanceId,
                effectId: eff.effectId,
                label: `${battleCardMap.get(cn)?.CardName ?? cn} の【出】効果`,
                effect: eff,
              });
            }
          }
          if (rutfOnPlayEntries.length > 0) {
            const baseStackR = (update.effect_stack as typeof stackAfter) ?? null;
            update.effect_stack = baseStackR
              ? pushToStack(baseStackR, rutfOnPlayEntries)
              : initStack(stack.turnPlayerId, rutfOnPlayEntries);
          }
        }

        // ON_OPP_ARTS_USE: 相手がアーツを使用した場合、自分側の ON_OPP_ARTS_USE トリガーを収集
        const entryCardType = battleCardMap.get(entry.cardNum)?.Type;
        if (entryCardType === 'アーツ' && entry.playerId !== user.id) {
          // 自分（user.id）の myState を決定
          const myStateForTrigger = ownerIsHost ? (isHost ? hostState : guestState) : (isHost ? guestState : hostState);
          const opStateForTrigger = ownerIsHost ? (isHost ? guestState : hostState) : (isHost ? hostState : guestState);
          const iAmHost = isHost;
          const myIsActive = bs.active_user_id === user.id;
          const artsTriggers = collectOppArtsUseTriggers(myStateForTrigger, opStateForTrigger, myIsActive);
          if (artsTriggers.length > 0) {
            const baseStack2 = (update.effect_stack as typeof stackAfter) ?? null;
            update.effect_stack = baseStack2
              ? pushToStack(baseStack2, artsTriggers)
              : initStack(iAmHost ? bs.host_id : bs.guest_id, artsTriggers);
          }
        }

        // ON_ARTS_USE: 自分がアーツを使用した場合、使用者自身の ON_ARTS_USE トリガーを収集（ON_SPELL_USE のアーツ版）。
        // caster の client のみが収集する（entry.playerId === user.id）＝ON_OPP_ARTS_USE と裏表で二重押しを防ぐ。
        if (entryCardType === 'アーツ' && entry.playerId === user.id) {
          const casterState = isHost ? hostState : guestState;
          const casterOpState = isHost ? guestState : hostState;
          const casterIsActive = bs.active_user_id === user.id;
          const au = collectArtsUseTriggers(user.id, casterState, casterOpState, casterIsActive, entry.cardNum);
          if (au.entries.length > 0) {
            const baseStackAU = (update.effect_stack as typeof stackAfter) ?? null;
            update.effect_stack = baseStackAU
              ? pushToStack(baseStackAU, au.entries)
              : initStack(user.id, au.entries);
            // usageLimit（《ターン1回/2回》）を caster の actions_done に永続化
            if (au.usedIds.length > 0) {
              const keyAU = isHost ? 'host_state' : 'guest_state';
              const baseStAU = (update[keyAU] as PlayerState) ?? (isHost ? hostState : guestState);
              update[keyAU] = { ...baseStAU, actions_done: [...(baseStAU.actions_done ?? []), ...au.usedIds] };
            }
          }
        }

        // FORCE_END_TURN: スタック・エフェクト解決後にターンを即座に終了する
        if (result.forceEndTurn) {
          const activeIsHost = bs.active_user_id === bs.host_id;
          const activeKey  = activeIsHost ? 'host_state'  : 'guest_state';
          const nextKey    = activeIsHost ? 'guest_state' : 'host_state';
          const activeState = activeIsHost ? hostState  : guestState;
          const nextState   = activeIsHost ? guestState : hostState;

          // アクティブプレイヤーの一時状態をクリア
          const clearedActive: typeof activeState = {
            ...activeState,
            temp_power_mods:    [],
            temp_level_mods:    [],
            keyword_grants:     {},
            field_keyword_grants_active: undefined, // NEXT_TURN場全体付与：自ターン終了時にクリア
            granted_effects:    {},
            blocked_actions:    [],
            actions_done:       [],

            cost_modifiers: (activeState.cost_modifiers ?? []).filter((m: {until?: string}) => m.until !== 'END_OF_TURN'),
          };

          // 次のターンプレイヤー（相手）のシグニをアップ（凍結中はアップせず凍結解除）
          const signiDown   = nextState.field.signi_down   ?? [false, false, false];
          const sIgniFrozen = nextState.field.signi_frozen  ?? [false, false, false];
          const newSigniDown = signiDown.map((d: boolean, i: number) => d && sIgniFrozen[i]) as boolean[];
          const convertedBlocked = (nextState.blocked_actions ?? [])
            .filter((a: string) => a.endsWith(':NEXT_TURN'))
            .map((a: string) => a.replace(':NEXT_TURN', ''));
          const nextStateUpd = {
            ...nextState,
            blocked_actions: convertedBlocked,
            field_keyword_grants_active: nextState.field_keyword_grants_next_turn, // NEXT_TURN場全体付与：予約→active
            field_keyword_grants_next_turn: undefined,
            // FREE_GROW_NEXT_TURN: 次ターングロウ無料の予約→active（WX03-024-BURST）
            free_grow_this_turn: nextState.free_grow_next_turn ? true : nextState.free_grow_this_turn,
            free_grow_next_turn: undefined,
            signi_played_from_trash: undefined, // トラッシュ出自マーカーをターン開始時にクリア
            signi_deploy_count_limit: undefined, // 配置数制限（このターン・相手にかけられた分）を自分のターン開始時にリセット
            field: {
              ...nextState.field,
              signi_down:   newSigniDown,
              signi_frozen: [false, false, false] as [boolean, boolean, boolean],
              lrig_down:    (nextState.field.lrig_down ?? false) && (nextState.field.lrig_frozen ?? false),
              lrig_frozen:  false,
              assist_lrig_l_down: false,
              assist_lrig_r_down: false,
            },
          };

          Object.assign(update, {
            [activeKey]:     clearedActive,
            [nextKey]:       nextStateUpd,
            turn_phase:      'UP',
            active_user_id:  activeIsHost ? bs.guest_id : bs.host_id,
            turn_count:      bs.turn_count + 1,
            effect_stack:    null,
          });
          appendBattleLogs(['ターンが強制終了されました'], { defer: true });
        }
      }
      await supabase.from('battle_states').update(update).eq('room_id', roomId);
      // main update が確定してから flush（先に RPC が届いて stale な effect_stack で再実行されるのを防ぐ）
      await flushBattleLogs();
    } finally {
      stackProcessingRef.current = false;
      setLoading(false);
    }
  };


  // --- 整列UI用ハンドラ ---

  /** 自分の未整列効果のID配列を引数として順序を確定する */
  const handleConfirmStackOrder = async (orderedIds: string[]) => {
    if (!bs?.effect_stack || loading) return;
    setLoading(true);
    try {
      const isTurnPlayer = bs.active_user_id === user.id;
      const stack = isTurnPlayer
        ? confirmTurnOrder(bs.effect_stack, orderedIds)
        : confirmOppOrder(bs.effect_stack, orderedIds);
      await supabase.from('battle_states')
        .update({ effect_stack: isStackDone(stack) ? null : stack })
        .eq('room_id', roomId);
    } finally {
      setLoading(false);
    }
  };

  // --- pending_effect インタラクション解決 ---

  const handleEffectInteraction = async (selectedOrChoiceId: string[]) => {
    if (!bs?.pending_effect || loading) return;
    setLoading(true);
    try {
      const pe = bs.pending_effect;
      const ownerIsHost = pe.sourcePlayerId === bs.host_id;
      const ownerState = ownerIsHost ? bs.host_state : bs.guest_state;
      const otherState = ownerIsHost ? bs.guest_state : bs.host_state;
      const isOwnerTurn = bs.active_user_id === pe.sourcePlayerId;
      const ctxPowers = calcFieldPowers(ownerState, otherState, isOwnerTurn, effectsMap, battleCardMap, bs.turn_phase);
      const allColorSigniNums = new Set([...collectAllColorSigniForField(ownerState, battleCardMap, effectsMap, otherState, isOwnerTurn), ...collectAllColorSigniForField(otherState, battleCardMap, effectsMap, ownerState, !isOwnerTurn)]);
      const fieldSigniExtraColors = new Map([...collectFieldSigniExtraColors(ownerState, battleCardMap, effectsMap, otherState, isOwnerTurn), ...collectFieldSigniExtraColors(otherState, battleCardMap, effectsMap, ownerState, !isOwnerTurn)]);
      const treatAsClassAllZones = collectTreatAsClassAllZones(ownerState, otherState, effectsMap, battleCardMap);
      const deckTrashLevel1Nums = collectDeckTrashLevel1Nums(ownerState, otherState, effectsMap);
      const declaredCardMap2 = applyContinuousBaseLevelOverride(applyDeclaredZoneClassOverride(battleCardMap, ownerState, otherState), ownerState, otherState, effectsMap, isOwnerTurn);
      const ctx: ExecCtx = { ownerState, otherState, cardMap: declaredCardMap2, logs: [], effectivePowers: ctxPowers, sourceCardNum: pe.sourceCardNum, triggeringCardNum: pe.triggeringCardNum, triggeringKeyword: pe.triggeringKeyword, trapActivated: pe.trapActivated, allColorSigniNums, fieldSigniExtraColors, treatAsClassAllZones, deckTrashLevel1Nums };
      const inter = pe.interaction;

      let result: ExecResult;
      if (inter.type === 'SELECT_TARGET') {
        result = resumeSelectTarget(selectedOrChoiceId, inter, ctx);
      } else if (inter.type === 'SEARCH') {
        result = resumeSearch(selectedOrChoiceId, inter, ctx);
      } else if (inter.type === 'CHOOSE') {
        const choiceId = selectedOrChoiceId[0] ?? '';
        const opt = inter.options.find(o => o.id === choiceId);
        if (inter.opponentResponds) {
          // 対戦相手払い選択: resumeOpponentPayOptional で otherState のエナを消費
          const energyNums = selectedOrChoiceId.slice(1);
          result = resumeOpponentPayOptional(choiceId, energyNums, inter, ctx);
        } else if (opt?.costColors?.length || opt?.coinCost) {
          // 任意コスト付き選択: resumeOptionalCost でエナ／コイン消費処理
          const energyNums = selectedOrChoiceId.slice(1);
          result = resumeOptionalCost(choiceId, energyNums, inter, ctx);
        } else if (inter.multiSelect) {
          // 複数選択UI: selectedOrChoiceId が選択された全choiceId配列
          result = resumeChoose(selectedOrChoiceId, inter, ctx);
        } else {
          result = resumeChoose(choiceId, inter, ctx);
        }
      } else if (inter.type === 'LOOK_AND_REORDER') {
        const trashList = inter.canTrash ? selectedOrChoiceId.filter(n => lookReorderTrash.has(n)) : [];
        const bottomList = inter.destPosition === 'split_top_bottom'
          ? selectedOrChoiceId.filter(n => lookReorderBottom.has(n)) : [];
        result = resumeLookAndReorder(selectedOrChoiceId, trashList, inter, ctx, bottomList);
      } else if (inter.type === 'REVEAL_CARDS') {
        // 閲覧専用モーダルの確認（OK）→ continuation を実行
        result = resumeRevealCards(inter, ctx);
      } else {
        return;
      }
      // デッキ0枚→リフレッシュ（インタラクション解決後）。
      result = applyRefreshOnDone(result, battleCardMap);
      if (result.logs.length > 0) appendBattleLogs(result.logs, { defer: true });

      const hostState  = ownerIsHost ? result.ownerState : result.otherState;
      const guestState = ownerIsHost ? result.otherState : result.ownerState;
      const update: Record<string, unknown> = { host_state: hostState, guest_state: guestState };

      // ON_TARGETED（C1 配線）: SELECT_TARGET で「対戦相手のシグニ」を対象に取った瞬間に発火する。
      // 対象＝効果発生源の対戦相手側に置かれていたシグニ（対象選択前の盤面で所有者を判定）。
      // CPU所有効果のSELECT_TARGETも本関数を通る（自動応答経由）ため、人間/CPU双方をここでカバー。
      let targetedEntries: StackEntry[] = [];
      let targetedUsedHostIds: string[] = [];
      let targetedUsedGuestIds: string[] = [];
      if (inter.type === 'SELECT_TARGET') {
        const sourceIsHost = pe.sourcePlayerId === bs.host_id;
        const oppOfSourceId = sourceIsHost ? bs.guest_id : bs.host_id;
        const beforeOppOfSource = sourceIsHost ? bs.guest_state : bs.host_state;
        const targetedNums = selectedOrChoiceId.filter(n =>
          beforeOppOfSource.field.signi.some(s => s?.at(-1) === n));
        if (targetedNums.length > 0) {
          const tt = collectTargetedTriggers(targetedNums, oppOfSourceId, hostState, guestState);
          targetedEntries = tt.entries;
          targetedUsedHostIds = tt.usedHostIds;
          targetedUsedGuestIds = tt.usedGuestIds;
        }
      }

      if (!result.done) {
        // continuationが発生した場合、次のインタラクションは効果オーナーが応答する（respondPlayerIdをリセット）
        const nextOpponentResponds = (result.pending?.type === 'SELECT_TARGET' || result.pending?.type === 'CHOOSE') && result.pending.opponentResponds;
        const nextRespondPlayerId = nextOpponentResponds ? pe.respondPlayerId : undefined;
        const { respondPlayerId: _drop, ...peBase } = pe;
        update.pending_effect = {
          ...peBase,
          ...(nextRespondPlayerId ? { respondPlayerId: nextRespondPlayerId } : {}),
          interaction: result.pending,
        } satisfies PendingEffect;
        // === 途中ラウンドの盤面差分トリガー（続き75・Opus）===
        // 複数ラウンドのインタラクションを要する SEQUENCE（例 WXEX2-50＝①相手トラッシュ→相手の場に出す→
        // ②自トラッシュ→自分の場に出す）では、step1 で確定した盤面変化がここ（!result.done）で DB へコミットされる。
        // 従来はこの分岐で ON_BANISH だけを特例収集しており、それ以外のトリガー（ON_PLAY any_opp 等）は
        // 一度も diff 評価されないまま bs.host_state/bs.guest_state に取り込まれ、次ラウンドが done で完了した時点の
        // collectBoardDiffTriggers では before に step1 の変化が既に含まれる＝**差分ゼロで永久に見逃されていた**
        // （続き70で R30/WXK10-022-E1 が実機FAIL）。done 分岐と同じ統合収集をここでも行う。
        // ⚠ pending_effect が残ったままスタックに積むが、これは従来の ON_BANISH 特例と同じ扱い（pending 解決後に
        //    スタックが処理される）＝新しい実行順序を持ち込むものではない。
        const midBd = collectBoardDiffTriggers(hostState, guestState, {
          causeOwnerId: pe.sourcePlayerId,
          causeSourceCardNum: pe.sourceCardNum,
          fieldTrashCostCards: result.fieldTrashCostCards,
        });
        update.host_state = midBd.hostState;
        update.guest_state = midBd.guestState;
        if (midBd.entries.length > 0) {
          const existingMidStack = bs.effect_stack ?? null;
          update.effect_stack = existingMidStack
            ? pushToStack(existingMidStack, midBd.entries)
            : initStack(bs.active_user_id ?? user.id, midBd.entries);
        }
      } else {
        update.pending_effect = null;

        // === 盤面差分トリガーの統合収集（続き61・Opus）===
        // resolveStackNext の中央 diff と同一の collectBoardDiffTriggers を呼び、resume 経路（対象選択/CHOOSE を挟んで
        // 完了した効果）でも全トリガー種別を取りこぼさず収集する（従来は banish/bloom/armor/leave/ds/bn/lu/kg/fz の 9 種のみで、
        // ON_OPP_POWER_DECREASED/ON_ENERGY_TO_TRASH/ON_DRAW〔SEQUENCE内対話〕/ON_TRASH self 等を取りこぼしていた・§6.3 続き58/60）。
        const bd = collectBoardDiffTriggers(hostState, guestState, {
          causeOwnerId: pe.sourcePlayerId,
          causeSourceCardNum: pe.sourceCardNum,
          fieldTrashCostCards: result.fieldTrashCostCards,
        });
        update.host_state = bd.hostState;
        update.guest_state = bd.guestState;
        const pendingEntries = bd.entries;
        if (pendingEntries.length > 0) {
          const turnPlayerId = bs.active_user_id ?? user.id;
          const existingStack = bs.effect_stack ?? null;
          update.effect_stack = existingStack
            ? pushToStack(existingStack, pendingEntries)
            : initStack(turnPlayerId, pendingEntries);
        } else {
          // インタラクション解決後にキューが空になったスタックをクリア
          const existingStack = bs.effect_stack ?? null;
          if (existingStack && isStackDone(existingStack)) {
            update.effect_stack = null;
          }
        }

        if (result.trapActivated) {
          const ta = collectTrapActivateTriggers(pe.sourcePlayerId, hostState, guestState);
          if (ta.entries.length > 0) {
            const turnPlayerId = bs.active_user_id ?? user.id;
            const baseStackTA = (('effect_stack' in update ? update.effect_stack : bs.effect_stack) ?? null) as EffectStack | null;
            update.effect_stack = baseStackTA
              ? pushToStack(baseStackTA, ta.entries)
              : initStack(turnPlayerId, ta.entries);
          }
          if (ta.usedHostIds.length > 0) {
            const hs = (('host_state' in update ? update.host_state : hostState)) as PlayerState;
            update.host_state = { ...hs, actions_done: [...(hs.actions_done ?? []), ...ta.usedHostIds] };
          }
          if (ta.usedGuestIds.length > 0) {
            const gs = (('guest_state' in update ? update.guest_state : guestState)) as PlayerState;
            update.guest_state = { ...gs, actions_done: [...(gs.actions_done ?? []), ...ta.usedGuestIds] };
          }
        }
      }

      // ON_TARGETED トリガーを（done/not-done どちらの分岐で確定したスタックにも）後乗せで積む。
      if (targetedEntries.length > 0) {
        const turnPlayerId = bs.active_user_id ?? user.id;
        const baseStack = (('effect_stack' in update ? update.effect_stack : bs.effect_stack) ?? null) as EffectStack | null;
        update.effect_stack = baseStack
          ? pushToStack(baseStack, targetedEntries)
          : initStack(turnPlayerId, targetedEntries);
      }
      // 《ターン1回》の消費を watcher 側の actions_done へ書き戻す（他コレクターと同型・続き75）。
      // done 分岐では collectBoardDiffTriggers が update.host_state/guest_state を差し替えているため、
      // update 側の最新 state（無ければ collect 時の state）に対して後乗せする。
      if (targetedUsedHostIds.length > 0) {
        const hs = (('host_state' in update ? update.host_state : hostState)) as PlayerState;
        update.host_state = { ...hs, actions_done: [...(hs.actions_done ?? []), ...targetedUsedHostIds] };
      }
      if (targetedUsedGuestIds.length > 0) {
        const gs = (('guest_state' in update ? update.guest_state : guestState)) as PlayerState;
        update.guest_state = { ...gs, actions_done: [...(gs.actions_done ?? []), ...targetedUsedGuestIds] };
      }

      await supabase.from('battle_states').update(update).eq('room_id', roomId);
      await flushBattleLogs();
      setEffectSelectedNums([]);
    } finally {
      setLoading(false);
    }
  };

  // SELECT_ZONE: 効果でデッキトップを場に出す際のゾーン選択
  const handleSelectZoneForEffect = async (zoneIndex: number) => {
    if (!bs?.pending_effect || loading) return;
    setLoading(true);
    try {
      const pe = bs.pending_effect;
      const inter = pe.interaction;
      if (inter.type !== 'SELECT_ZONE') return;
      const ownerIsHost = pe.sourcePlayerId === bs.host_id;
      const ownerState  = ownerIsHost ? bs.host_state : bs.guest_state;
      const otherState  = ownerIsHost ? bs.guest_state : bs.host_state;
      const isOwnerTurn = bs.active_user_id === pe.sourcePlayerId;
      const ctxPowers = calcFieldPowers(ownerState, otherState, isOwnerTurn, effectsMap, battleCardMap, bs.turn_phase);
      const allColorSigniNums = new Set([...collectAllColorSigniForField(ownerState, battleCardMap, effectsMap, otherState, isOwnerTurn), ...collectAllColorSigniForField(otherState, battleCardMap, effectsMap, ownerState, !isOwnerTurn)]);
      const fieldSigniExtraColors = new Map([...collectFieldSigniExtraColors(ownerState, battleCardMap, effectsMap, otherState, isOwnerTurn), ...collectFieldSigniExtraColors(otherState, battleCardMap, effectsMap, ownerState, !isOwnerTurn)]);
      const treatAsClassAllZones = collectTreatAsClassAllZones(ownerState, otherState, effectsMap, battleCardMap);
      const deckTrashLevel1Nums = collectDeckTrashLevel1Nums(ownerState, otherState, effectsMap);
      const declaredCardMap3 = applyContinuousBaseLevelOverride(applyDeclaredZoneClassOverride(battleCardMap, ownerState, otherState), ownerState, otherState, effectsMap, isOwnerTurn);
      const ctx: ExecCtx = { ownerState, otherState, cardMap: declaredCardMap3, logs: [], effectivePowers: ctxPowers, sourceCardNum: pe.sourceCardNum, trapActivated: pe.trapActivated, allColorSigniNums, fieldSigniExtraColors, treatAsClassAllZones, deckTrashLevel1Nums };

      let result = resumeSelectZone(zoneIndex, inter, ctx);
      result = applyRefreshOnDone(result, battleCardMap); // デッキ0枚→リフレッシュ
      if (result.logs.length > 0) appendBattleLogs(result.logs, { defer: true });

      const hostState  = ownerIsHost ? result.ownerState : result.otherState;
      const guestState = ownerIsHost ? result.otherState : result.ownerState;
      const update: Record<string, unknown> = { host_state: hostState, guest_state: guestState };
      if (!result.done) {
        const { respondPlayerId: _drop, ...peBase } = pe;
        update.pending_effect = { ...peBase, interaction: result.pending } satisfies PendingEffect;
      } else {
        update.pending_effect = null;
        const existingStack = bs.effect_stack ?? null;
        if (existingStack && isStackDone(existingStack)) update.effect_stack = null;
      }
      await supabase.from('battle_states').update(update).eq('room_id', roomId);
      await flushBattleLogs();
    } finally {
      setLoading(false);
    }
  };

  // SELECT_SIGNI_ZONE: トラッシュ/エナ/手札などから場に出す際のゾーン選択
  const handleSelectSigniZoneForEffect = async (zoneIndex: number) => {
    if (!bs?.pending_effect || loading) return;
    setLoading(true);
    try {
      const pe = bs.pending_effect;
      const inter = pe.interaction;
      if (inter.type !== 'SELECT_SIGNI_ZONE') return;
      const ownerIsHost = pe.sourcePlayerId === bs.host_id;
      const ownerState  = ownerIsHost ? bs.host_state : bs.guest_state;
      const otherState  = ownerIsHost ? bs.guest_state : bs.host_state;
      const isOwnerTurn = bs.active_user_id === pe.sourcePlayerId;
      const ctxPowers = calcFieldPowers(ownerState, otherState, isOwnerTurn, effectsMap, battleCardMap, bs.turn_phase);
      const allColorSigniNums = new Set([...collectAllColorSigniForField(ownerState, battleCardMap, effectsMap, otherState, isOwnerTurn), ...collectAllColorSigniForField(otherState, battleCardMap, effectsMap, ownerState, !isOwnerTurn)]);
      const fieldSigniExtraColors = new Map([...collectFieldSigniExtraColors(ownerState, battleCardMap, effectsMap, otherState, isOwnerTurn), ...collectFieldSigniExtraColors(otherState, battleCardMap, effectsMap, ownerState, !isOwnerTurn)]);
      const treatAsClassAllZones = collectTreatAsClassAllZones(ownerState, otherState, effectsMap, battleCardMap);
      const deckTrashLevel1Nums = collectDeckTrashLevel1Nums(ownerState, otherState, effectsMap);
      const declaredCardMap5 = applyContinuousBaseLevelOverride(applyDeclaredZoneClassOverride(battleCardMap, ownerState, otherState), ownerState, otherState, effectsMap, isOwnerTurn);
      const ctx: ExecCtx = { ownerState, otherState, cardMap: declaredCardMap5, logs: [], effectivePowers: ctxPowers, sourceCardNum: pe.sourceCardNum, trapActivated: pe.trapActivated, allColorSigniNums, fieldSigniExtraColors, treatAsClassAllZones, deckTrashLevel1Nums };

      let result = resumeSelectSigniZone(zoneIndex, inter, ctx);
      result = applyRefreshOnDone(result, battleCardMap); // デッキ0枚→リフレッシュ
      if (result.logs.length > 0) appendBattleLogs(result.logs, { defer: true });

      const hostState  = ownerIsHost ? result.ownerState : result.otherState;
      const guestState = ownerIsHost ? result.otherState : result.ownerState;
      const update: Record<string, unknown> = { host_state: hostState, guest_state: guestState };
      if (!result.done) {
        const { respondPlayerId: _drop, ...peBase } = pe;
        update.pending_effect = { ...peBase, interaction: result.pending } satisfies PendingEffect;
      } else {
        update.pending_effect = null;
        const existingStack = bs.effect_stack ?? null;
        if (existingStack && isStackDone(existingStack)) update.effect_stack = null;

        // REVEAL_UNTIL_TO_FIELD（WX04-093「惰眠」等）でゾーン選択を挟んだ場合、最終解決はこの resume パスに来る。
        // 場に出した全シグニ（lastProcessedCards：placedSoFar 連鎖で中断跨ぎ維持）の【出】(ON_PLAY) をここで積む。
        const srcEffects = effectsMap.get(pe.sourceCardNum) ?? effectsMap.get(getCardNum(pe.sourceCardNum)) ?? [];
        const srcEff = srcEffects.find(e => e.effectId === pe.effectId);
        if ((srcEff?.action as import('../types/effects').RevealUntilToFieldAction)?.type === 'REVEAL_UNTIL_TO_FIELD') {
          // bySigniEffect 限定の【出】はソース（場出しした効果元）がシグニの場合のみ発火（G079）。
          const sourceIsSigni = battleCardMap.get(getCardNum(pe.sourceCardNum))?.Type === 'シグニ';
          const suppressOnPlay = !!(srcEff?.action as import('../types/effects').RevealUntilToFieldAction)?.suppressOnPlay; // タスク12(xxix)
          const rutfOnPlayEntries: StackEntry[] = [];
          for (const instanceId of suppressOnPlay ? [] : (result.lastProcessedCards ?? [])) {
            const cn = getCardNum(instanceId);
            for (const eff of (effectsMap.get(cn) ?? [])) {
              if (eff.effectType !== 'AUTO' || !eff.timing?.includes('ON_PLAY')) continue;
              if (eff.triggerCondition?.bySigniEffect && !sourceIsSigni) continue;
              rutfOnPlayEntries.push({
                id: generateUUID(),
                playerId: pe.sourcePlayerId,
                cardNum: instanceId,
                effectId: eff.effectId,
                label: `${battleCardMap.get(cn)?.CardName ?? cn} の【出】効果`,
                effect: eff,
              });
            }
          }
          if (rutfOnPlayEntries.length > 0) {
            const canReuse = existingStack && !isStackDone(existingStack);
            update.effect_stack = canReuse
              ? pushToStack(existingStack, rutfOnPlayEntries)
              : initStack(bs.active_user_id ?? user.id, rutfOnPlayEntries);
          }
        }

        // ON_PLAY（any_ally/any・効果配置）: 効果で新たに場に出たシグニへの他シグニの反応（G144/G145/WX11-054）。
        // 開花（【シード】→シグニ）は「場に出た」扱いではないため ON_PLAY から除外し、ON_BLOOM として別収集する。
        const resumePlaceSourceIsSigni = battleCardMap.get(getCardNum(pe.sourceCardNum))?.Type === 'シグニ';
        const hostBloomedRSZ  = detectBloomedSigni(bs.host_state, hostState);
        const guestBloomedRSZ = detectBloomedSigni(bs.guest_state, guestState);
        const bloomedSetRSZ = new Set<string>([...hostBloomedRSZ, ...guestBloomedRSZ,
          ...detectFacedownFlipped(bs.host_state, hostState), ...detectFacedownFlipped(bs.guest_state, guestState)]);
        const resumePlaceEntries: StackEntry[] = [];
        const hostTrashBeforeRSZ = new Set(bs.host_state?.trash ?? []);
        const guestTrashBeforeRSZ = new Set(bs.guest_state?.trash ?? []);
        // 各収集が返す usageLimit 消費 effectId は、収集の合間に actions_done へ畳み込む（次の収集がそれを見て
        // 再発火を止める＝同一 resume 内で複数体が場に出た場合の《ターン1回》多重発火防止）。
        let hostStateRP = hostState, guestStateRP = guestState;
        const useRP = (r: { usedHostIds: string[]; usedGuestIds: string[] }) => {
          if (r.usedHostIds.length > 0) hostStateRP = { ...hostStateRP, actions_done: [...(hostStateRP.actions_done ?? []), ...r.usedHostIds] };
          if (r.usedGuestIds.length > 0) guestStateRP = { ...guestStateRP, actions_done: [...(guestStateRP.actions_done ?? []), ...r.usedGuestIds] };
        };
        for (const placedNum of detectPlacedSigni(bs.host_state, hostStateRP)) {
          if (bloomedSetRSZ.has(placedNum)) continue;
          const ft = collectFieldTriggers('ON_PLAY', placedNum, hostStateRP, guestStateRP, bs.host_id, { placedByEffect: true, placeSourceIsSigni: resumePlaceSourceIsSigni, placedFromTrash: hostTrashBeforeRSZ.has(placedNum) });
          resumePlaceEntries.push(...ft.entries); useRP(ft);
        }
        for (const placedNum of detectPlacedSigni(bs.guest_state, guestStateRP)) {
          if (bloomedSetRSZ.has(placedNum)) continue;
          const ft = collectFieldTriggers('ON_PLAY', placedNum, guestStateRP, hostStateRP, bs.guest_id, { placedByEffect: true, placeSourceIsSigni: resumePlaceSourceIsSigni, placedFromTrash: guestTrashBeforeRSZ.has(placedNum) });
          resumePlaceEntries.push(...ft.entries); useRP(ft);
        }
        for (const bloomedNum of hostBloomedRSZ) {
          const bl = collectBloomTriggers(bloomedNum, hostStateRP, guestStateRP, bs.host_id);
          resumePlaceEntries.push(...bl.entries); useRP(bl);
        }
        for (const bloomedNum of guestBloomedRSZ) {
          const bl = collectBloomTriggers(bloomedNum, guestStateRP, hostStateRP, bs.guest_id);
          resumePlaceEntries.push(...bl.entries); useRP(bl);
        }
        if (hostStateRP !== hostState) update.host_state = hostStateRP;
        if (guestStateRP !== guestState) update.guest_state = guestStateRP;
        if (resumePlaceEntries.length > 0) {
          const baseRP = (update.effect_stack as ReturnType<typeof initStack> | null) ?? (existingStack && !isStackDone(existingStack) ? existingStack : null);
          update.effect_stack = baseRP
            ? pushToStack(baseRP, resumePlaceEntries)
            : initStack(bs.active_user_id ?? user.id, resumePlaceEntries);
        }
      }
      await supabase.from('battle_states').update(update).eq('room_id', roomId);
      await flushBattleLogs();
    } finally {
      setLoading(false);
    }
  };

  // REARRANGE_SIGNI: シグニ配置し直しの確定。newArrangement[newZone]=instance id / ''=空き。
  // skip=null のときは現状維持（恒等配置）で解決し、continuation があれば実行する。
  const handleRearrangeSigniConfirm = async (newArrangement: string[] | null) => {
    if (!bs?.pending_effect || loading) return;
    setLoading(true);
    try {
      const pe = bs.pending_effect;
      const inter = pe.interaction;
      if (inter.type !== 'REARRANGE_SIGNI') return;
      const ownerIsHost = pe.sourcePlayerId === bs.host_id;
      const ownerState  = ownerIsHost ? bs.host_state : bs.guest_state;
      const otherState  = ownerIsHost ? bs.guest_state : bs.host_state;
      const declaredCardMapR = applyContinuousBaseLevelOverride(applyDeclaredZoneClassOverride(battleCardMap, ownerState, otherState), ownerState, otherState, effectsMap, bs.active_user_id === pe.sourcePlayerId);
      const ctx: ExecCtx = { ownerState, otherState, cardMap: declaredCardMapR, logs: [], sourceCardNum: pe.sourceCardNum, trapActivated: pe.trapActivated };
      const targetState = inter.owner === 'opponent' ? otherState : ownerState;
      // skip（null）= 現状の配置をそのまま渡す（恒等変換。continuation はそのまま実行される）
      const arrangement = newArrangement ?? [0, 1, 2].map(zi => targetState.field.signi[zi]?.at(-1) ?? '');
      let result: ExecResult = resumeRearrangeSigni(arrangement, inter, ctx);
      result = applyRefreshOnDone(result, battleCardMap);
      if (result.logs.length > 0) appendBattleLogs(result.logs, { defer: true });
      const hostState  = ownerIsHost ? result.ownerState : result.otherState;
      const guestState = ownerIsHost ? result.otherState : result.ownerState;
      const update: Record<string, unknown> = { host_state: hostState, guest_state: guestState };
      if (!result.done) {
        const { respondPlayerId: _drop, ...peBase } = pe;
        update.pending_effect = { ...peBase, interaction: result.pending } satisfies PendingEffect;
      } else {
        update.pending_effect = null;
        const existingStack = bs.effect_stack ?? null;
        if (existingStack && isStackDone(existingStack)) update.effect_stack = null;
      }
      setRearrangeSlots([null, null, null]);
      await supabase.from('battle_states').update(update).eq('room_id', roomId);
      await flushBattleLogs();
    } finally {
      setLoading(false);
    }
  };

  // SELECT_VIRUS_ZONE: 【ウィルス】を置くシグニゾーンの選択（zoneIndex=nullで配置打ち切り）
  const handleSelectVirusZoneForEffect = async (zoneIndex: number | null) => {
    if (!bs?.pending_effect || loading) return;
    setLoading(true);
    try {
      const pe = bs.pending_effect;
      const inter = pe.interaction;
      if (inter.type !== 'SELECT_VIRUS_ZONE') return;
      const ownerIsHost = pe.sourcePlayerId === bs.host_id;
      const ownerState  = ownerIsHost ? bs.host_state : bs.guest_state;
      const otherState  = ownerIsHost ? bs.guest_state : bs.host_state;
      const isOwnerTurn = bs.active_user_id === pe.sourcePlayerId;
      const ctxPowers = calcFieldPowers(ownerState, otherState, isOwnerTurn, effectsMap, battleCardMap, bs.turn_phase);
      const allColorSigniNums = new Set([...collectAllColorSigniForField(ownerState, battleCardMap, effectsMap, otherState, isOwnerTurn), ...collectAllColorSigniForField(otherState, battleCardMap, effectsMap, ownerState, !isOwnerTurn)]);
      const fieldSigniExtraColors = new Map([...collectFieldSigniExtraColors(ownerState, battleCardMap, effectsMap, otherState, isOwnerTurn), ...collectFieldSigniExtraColors(otherState, battleCardMap, effectsMap, ownerState, !isOwnerTurn)]);
      const treatAsClassAllZones = collectTreatAsClassAllZones(ownerState, otherState, effectsMap, battleCardMap);
      const deckTrashLevel1Nums = collectDeckTrashLevel1Nums(ownerState, otherState, effectsMap);
      const declaredCardMap4 = applyContinuousBaseLevelOverride(applyDeclaredZoneClassOverride(battleCardMap, ownerState, otherState), ownerState, otherState, effectsMap, isOwnerTurn);
      const ctx: ExecCtx = { ownerState, otherState, cardMap: declaredCardMap4, logs: [], effectivePowers: ctxPowers, sourceCardNum: pe.sourceCardNum, trapActivated: pe.trapActivated, allColorSigniNums, fieldSigniExtraColors, treatAsClassAllZones, deckTrashLevel1Nums };

      let result = resumeSelectVirusZone(zoneIndex, inter, ctx);
      result = applyRefreshOnDone(result, battleCardMap); // デッキ0枚→リフレッシュ
      if (result.logs.length > 0) appendBattleLogs(result.logs, { defer: true });

      const hostState  = ownerIsHost ? result.ownerState : result.otherState;
      const guestState = ownerIsHost ? result.otherState : result.ownerState;
      const update: Record<string, unknown> = { host_state: hostState, guest_state: guestState };
      if (!result.done) {
        const { respondPlayerId: _drop, ...peBase } = pe;
        update.pending_effect = { ...peBase, interaction: result.pending } satisfies PendingEffect;
      } else {
        update.pending_effect = null;
        const existingStack = bs.effect_stack ?? null;
        if (existingStack && isStackDone(existingStack)) update.effect_stack = null;
      }
      await supabase.from('battle_states').update(update).eq('room_id', roomId);
      await flushBattleLogs();
    } finally {
      setLoading(false);
    }
  };

  /**
   * フィールド上の全シグニから、指定イベントに反応する AUTO 効果を収集して StackEntry[] を返す。
   * 召喚されたカード自身（triggerScope='self'）はここでは除き、queueCardEffects で別途処理する。
   */
  // ON_PLAY/ON_BANISH/ON_ATTACK_SIGNI/ON_BLOOM の場トリガー収集（Stage2 で pure 化＝triggerCollect.ts。ここは薄いラッパ）。
  // usageLimit（《ターン1回/2回》）消費 effectId を usedHostIds/usedGuestIds で返す（呼び出し元が actions_done へ
  // 書き戻す）。従来この関数にはガード自体が無く「味方のシグニが場に出るたびに◯◯（ターンに1回）」型が
  // 同一ターンの複数召喚で毎回発火していた（続き104・実カード32枚・続き135で解消）。
  const collectFieldTriggers = (
    event: 'ON_PLAY' | 'ON_BANISH' | 'ON_ATTACK_SIGNI' | 'ON_BLOOM',
    triggeringCardNum: string,
    myState: PlayerState,
    opState: PlayerState,
    ownerId: string = user.id, // myState の持ち主（CPU効果収集時はCPU_PLAYER_ID）
    opts?: { placedByEffect?: boolean; placeSourceIsSigni?: boolean; placedFromTrash?: boolean },
  ): { entries: StackEntry[]; usedHostIds: string[]; usedGuestIds: string[] } =>
    pureCollectFieldTriggers(mkTrigCtx(), event, triggeringCardNum, myState, opState, ownerId, opts);

  // 【シード】が開花したときの ON_BLOOM トリガーを収集する。
  //  ・開花したシグニ自身の「このシグニが開花したとき」（triggerScope: self）
  //  ・場の他シグニの「あなたの他のシグニが開花したとき」（triggerScope: any_ally/any）
  // 開花は「場に出た」扱いではないため、ON_PLAY（出現時）は発火させない（公式ルール）。
  // ON_BLOOM 収集（Stage2 で pure 化＝triggerCollect.ts。ここは薄いラッパ）。
  const collectBloomTriggers = (
    bloomedInstanceId: string,
    myState: PlayerState,
    opState: PlayerState,
    ownerId: string,
  ): { entries: StackEntry[]; usedHostIds: string[]; usedGuestIds: string[] } =>
    pureCollectBloomTriggers(mkTrigCtx(), bloomedInstanceId, myState, opState, ownerId);

  /**
   * 自分側イベント（ON_LIFE_CRASHED / ON_GUARD）に反応する自フィールドシグニの AUTO 効果を収集する。
   * usageLimit 'once_per_turn' は actions_done（effectId）で管理する。発火させた effectId を
   * usedOncePerTurnIds として返すので、呼び出し側で actions_done に追加して保存すること。
   */
  // ON_LIFE_CRASHED/ON_GUARD/ウィルス系 自イベント収集（Stage2 で pure 化＝triggerCollect.ts。ここは薄いラッパ）。
  const collectSelfEventTriggers = (
    timing: 'ON_LIFE_CRASHED' | 'ON_GUARD' | 'ON_OPP_VIRUS_PLACED' | 'ON_OPP_VIRUS_REMOVED' | 'ON_OPP_VIRUS_CHANGED',
    myState: PlayerState,
    opState: PlayerState,
    labelSuffix: string,
    ownerId: string = user.id, // myState の持ち主（CPU効果収集時はCPU_PLAYER_ID）
  ): { entries: StackEntry[]; usedOncePerTurnIds: string[] } =>
    pureCollectSelfEventTriggers(mkTrigCtx(), timing, myState, opState, labelSuffix, ownerId);

  const collectTrapActivateTriggers = (
    ownerId: string,
    hostState: PlayerState,
    guestState: PlayerState,
  ): { entries: StackEntry[]; usedHostIds: string[]; usedGuestIds: string[] } => {
    const ownerState = ownerId === bs.host_id ? hostState : guestState;
    const otherState = ownerId === bs.host_id ? guestState : hostState;
    return pureCollectTrapActivateTriggers(mkTrigCtx(), ownerId, ownerState, otherState);
  };

  const collectLrigAttackGuardedTriggers = (
    attackerId: string,
    attackerState: PlayerState,
    defenderState: PlayerState,
  ): { entries: StackEntry[]; usedOncePerTurnIds: string[] } =>
    pureCollectLrigAttackGuardedTriggers(mkTrigCtx(), attackerId, attackerState, defenderState);

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
  ): { entries: StackEntry[]; usedLimitIds: string[] } =>
    pureCollectHandDiscardTriggers(mkTrigCtx(), discardedNums, myState, discarderId, asCost, opState, opId, costSourceNum);

  /**
   * 相手がアーツを使用したとき、ON_OPP_ARTS_USE トリガーを持つ自分のシグニを収集する。
   * activeCondition（HAS_CARD_IN_FIELD 等）を満たす場合のみスタックに追加する。
   */
  // ON_OPP_ARTS_USE 収集（Stage2 で pure 化＝triggerCollect.ts。ここは薄いラッパ）。
  const collectOppArtsUseTriggers = (
    myState: PlayerState,
    opState: PlayerState,
    isMyTurnNow: boolean,
  ): StackEntry[] =>
    pureCollectOppArtsUseTriggers(mkTrigCtx(), myState, opState, isMyTurnNow);

  /**
   * あなたがアーツを使用したとき（ON_ARTS_USE）、使用者自身のルリグ/シグニのトリガーを収集する。
   * ON_SPELL_USE の自分版（BattleScreen:7237）と同型：caster のセンタールリグ＋場のシグニを走査。
   * usageLimit（《ターン1回》《ターン2回》）は actions_done(effectId) 出現回数で制御し、
   * 呼び出し側で usedIds を caster の actions_done に永続化する。
   */
  // ON_ARTS_USE 収集（Stage2 で pure 化＝triggerCollect.ts。ここは薄いラッパ）。
  const collectArtsUseTriggers = (
    casterId: string,
    casterState: PlayerState,
    opState: PlayerState,
    isCasterTurn: boolean,
    usedArtsNum?: string,
  ): { entries: StackEntry[]; usedIds: string[] } =>
    pureCollectArtsUseTriggers(mkTrigCtx(), casterId, casterState, opState, isCasterTurn, usedArtsNum);

  // シグニ召喚（ゾーン選択後に実行）
  const handleSummonSigni = async (handIndex: number, zoneIndex: number) => {
    console.log('[handleSummonSigni] called', { handIndex, zoneIndex, isMyTurn, loading });
    if (!isMyTurn || loading) return;
    const summonCardNum = my.hand[handIndex];
    const summonCardData = battleCardMap.get(summonCardNum);
    const riseFilter = summonCardData ? getRiseFilter(summonCardData.EffectText ?? '') : null;
    const existingZoneStack = my.field.signi[zoneIndex] ?? [];
    // ライズ条件チェック
    if (riseFilter) {
      // ライズシグニ: 空きゾーンには出せない、条件不一致ゾーンにも出せない
      const existingTop = existingZoneStack.at(-1);
      if (!existingTop) return; // 空きゾーン不可
      const existingTopNum = getCardNum(existingTop);
      if (!matchesRiseFilter(existingTopNum, riseFilter, battleCardMap)) return;
    } else {
      // 通常シグニ: 空きゾーンにしか召喚できない
      if (existingZoneStack.length > 0) return;
    }
    if (isActionBlocked('PLAY_COLORLESS') && battleCardMap.get(my.hand[handIndex])?.Color === '無') return;
    // OPP_ZONE_PLACEMENT_RESTRICT: 相手が中央ゾーン(index=1)にLv3+配置不可
    const czRestrict = collectCenterZoneDeployRestrict(op, my, battleCardMap, effectsMap, !isMyTurn);
    if (czRestrict !== undefined && zoneIndex === 1) {
      const cardLvCZ = parseInt(battleCardMap.get(my.hand[handIndex])?.Level ?? '0') || 0;
      if (cardLvCZ >= czRestrict) return;
    }
    // DEPLOY_RESTRICT: signi_deploy_power_limit が設定されている場合、パワー上限以上のシグニ配置不可
    if (my.signi_deploy_power_limit !== undefined) {
      const cardPwr = parsePowerVal(battleCardMap.get(my.hand[handIndex])?.Power);
      if (cardPwr >= my.signi_deploy_power_limit) return;
    }
    // DEPLOY_RESTRICT（配置数制限）: 「シグニをN体までしか場に出せない」→ 場のシグニ数が上限以上なら新規配置不可。
    // フラグ（AUTO・自ターン）と相手場の CONT レゾナ（WX07-006）の小さい方を採用。ライズ（上乗せ）は新規配置でないため対象外。
    if (!riseFilter) {
      const contCountCap = collectDeployCountLimit(op, my, battleCardMap, effectsMap, !isMyTurn);
      const countCap = my.signi_deploy_count_limit !== undefined
        ? (contCountCap !== undefined ? Math.min(my.signi_deploy_count_limit, contCountCap) : my.signi_deploy_count_limit)
        : contCountCap;
      if (countCap !== undefined) {
        const fieldSigniCount = my.field.signi.filter(s => s && s.length > 0).length;
        if (existingZoneStack.length === 0 && fieldSigniCount >= countCap) return;
      }
    }
    // FORCE_PLACE_FRONT: 相手の該当シグニの正面に配置を強制（正面が空いている場合のみ）。ライズは上乗せのため対象外。
    if (!riseFilter) {
      const forcedFront = collectForcePlaceFrontZones(op, my, battleCardMap, effectsMap, !isMyTurn);
      if (forcedFront.size > 0 && !forcedFront.has(zoneIndex)) return;
    }
    setLoading(true);
    setPendingSigniSummon(null);
    try {
      const cardNum = my.hand[handIndex];
      const newSigni = [...my.field.signi] as (string[] | null)[];
      const isRise = !!riseFilter;
      if (isRise) {
        // ライズ: 既存スタックの上に積む（下カードはそのまま）
        newSigni[zoneIndex] = [...(existingZoneStack), cardNum];
      } else {
        newSigni[zoneIndex] = [cardNum];
      }
      // ライズ配置: ダウン・凍結状態は引き継がない（ルール：新たに場に出たシグニ）
      // 通常配置: ゾーンのダウン・凍結をリセット
      const newSigniDown   = [...(my.field.signi_down   ?? [false, false, false])];
      const newSigniFrozen = [...(my.field.signi_frozen  ?? [false, false, false])];
      const newCharms      = [...(my.field.signi_charms  ?? [null, null, null])];
      const newAcce        = [...(my.field.signi_acce    ?? [null, null, null])];
      const newSoul        = [...(my.field.signi_soul    ?? [null, null, null])];
      newSigniDown[zoneIndex]   = false;
      newSigniFrozen[zoneIndex] = false;
      const zoneExtraTrash: string[] = [];
      const zoneExtraLrigTrash: string[] = [];
      // ライズ時: チャームはルール処理でトラッシュへ（アクセもリセット）
      if (newCharms[zoneIndex]) { zoneExtraTrash.push(newCharms[zoneIndex]!); newCharms[zoneIndex] = null; }
      if (newAcce[zoneIndex])   { zoneExtraTrash.push(newAcce[zoneIndex]!);   newAcce[zoneIndex]   = null; }
      // ライズで元のトップシグニが下に置かれるカードになると、付いていた【ソウル】はルリグトラッシュへ（ルール処理）
      if (newSoul[zoneIndex])   { zoneExtraLrigTrash.push(newSoul[zoneIndex]!); newSoul[zoneIndex] = null; }
      let placed: PlayerState = {
        ...my,
        hand: my.hand.filter((_, i) => i !== handIndex),
        field: {
          ...my.field,
          signi: newSigni,
          signi_down:   newSigniDown,
          signi_frozen: newSigniFrozen,
          signi_charms: newCharms,
          signi_acce:   newAcce,
          signi_soul:   newSoul,
        },
        trash: [...my.trash, ...zoneExtraTrash],
        lrig_trash: zoneExtraLrigTrash.length > 0 ? [...my.lrig_trash, ...zoneExtraLrigTrash] : my.lrig_trash,
      };

      // フィールド上の他のシグニの「他のシグニが出たとき」トリガーを収集
      const fieldRes = collectFieldTriggers('ON_PLAY', cardNum, placed, op);
      const fieldEntries = fieldRes.entries;
      // usageLimit（《ターン1回/2回》）消費を actions_done へ永続化（自分側＝placed／相手側＝opAfterPlay。続き135）
      const summonUsedMine = isHost ? fieldRes.usedHostIds : fieldRes.usedGuestIds;
      const summonUsedOpp  = isHost ? fieldRes.usedGuestIds : fieldRes.usedHostIds;
      if (summonUsedMine.length > 0) placed = { ...placed, actions_done: [...(placed.actions_done ?? []), ...summonUsedMine] };
      const opAfterPlay: PlayerState | null = summonUsedOpp.length > 0
        ? { ...op, actions_done: [...(op.actions_done ?? []), ...summonUsedOpp] }
        : null;
      const opKeySummon = isHost ? 'guest_state' : 'host_state';

      // 召喚したカード自身の ON_PLAY 効果
      const ownEffects = effectsMap.get(cardNum) ?? [];
      // 手札からの召喚は「トラッシュから場に出た」に該当しないため、THIS_CARD_FROM_TRASH 条件付き【出】は発火させない（WX03-034-E1）
      const involvesFromTrash = (c?: import('../types/effects').Condition): boolean =>
        !!c && (c.type === 'THIS_CARD_FROM_TRASH' || (c.type === 'AND' && c.conditions.some(involvesFromTrash)));
      const ownOnPlay = ownEffects.filter(e =>
        e.effectType === 'AUTO' &&
        e.timing?.includes('ON_PLAY') &&
        // self/未指定に加え、'any'（「シグニが場に出たとき」=自身も含む。G085）も自身召喚時に発火させる
        (e.triggerScope === undefined || e.triggerScope === 'self' || e.triggerScope === 'any') &&
        e.mandatory !== false &&
        // byEffect/bySigniEffect:「（シグニの）効果によって場に出たとき」限定（WX11-054/G079）は手札からの通常召喚では発火しない
        !e.triggerCondition?.byEffect && !e.triggerCondition?.bySigniEffect &&
        // activeCondition（英知=N等）を満たさない【出】は発火しない
        (!e.activeCondition || checkActiveCondition(e.activeCondition, placed, op, true, battleCardMap, cardNum)) &&
        // THIS_CARD_FROM_TRASH 条件のみ収集時に評価（手札召喚では false）
        (!involvesFromTrash(e.condition) || evalUseCondition(e.condition!, placed, op, battleCardMap, cardNum, bs.turn_phase, effectivePowers)),
      );
      // コスト付き任意【出】効果（mandatory: false + cost あり）
      const ownCostOnPlay = ownEffects.filter(e =>
        e.effectType === 'AUTO' &&
        e.timing?.includes('ON_PLAY') &&
        (e.triggerScope === undefined || e.triggerScope === 'self') &&
        e.mandatory === false &&
        e.cost &&
        // 使用条件（《ビートアイコン》[N枚以下]ゲート＝BEAT_CONDITION や「〜の場合にしか使用できない」）を満たさない【出】コスト効果は提示しない
        (!e.condition || evalUseCondition(e.condition, placed, op, battleCardMap, cardNum, bs.turn_phase, effectivePowers)),
      );
      // 収集漏れ検出: mandatory:false+costなしはどちらの収集にも入らず無発火（v0.261コインバグと同型。JSON側のcost表現が必要）
      const droppedOnPlay = ownEffects.filter(e =>
        e.effectType === 'AUTO' && e.timing?.includes('ON_PLAY') &&
        (e.triggerScope === undefined || e.triggerScope === 'self') &&
        e.mandatory === false && !e.cost,
      );
      if (droppedOnPlay.length > 0) console.warn(`[handleSummonSigni] mandatory:false+costなしのON_PLAY効果は発火しません: ${droppedOnPlay.map(e => e.effectId).join(', ')}`);

      const cardName = battleCardMap.get(cardNum)?.CardName ?? cardNum;
      appendBattleLogs([`${cardName}を召喚`]);

      // 自身の mandatory ON_PLAY エントリ
      const ownEntries: StackEntry[] = ownOnPlay.map(eff => ({
        id: generateUUID(),
        playerId: user.id,
        cardNum,
        effectId: eff.effectId,
        label: `${cardName} の【出】/【自】効果`,
        effect: eff,
      }));

      // ON_RISE: ライズ配置時、ライズされたシグニ自身の「このシグニがライズされたとき」を収集（self）。
      // risedOntoNameContains: ライズで下に置かれた元シグニ（existingTopNum）の名前で限定（WX20-056-E2《オダノブ》）。
      if (isRise) {
        // ライズで下に置かれた元トップシグニ（risedOntoNameContains 判定用）
        const underTop = existingZoneStack.at(-1);
        const underNum = underTop ? getCardNum(underTop) : undefined;
        for (const eff of ownEffects) {
          if (eff.effectType !== 'AUTO' || !eff.timing?.includes('ON_RISE')) continue;
          if ((eff.triggerScope ?? 'self') !== 'self') continue;
          const needName = eff.triggerCondition?.risedOntoNameContains;
          if (needName) {
            const underName = underNum ? (battleCardMap.get(underNum)?.CardName ?? '') : '';
            if (!underName.includes(needName)) continue;
          }
          if (eff.activeCondition && !checkActiveCondition(eff.activeCondition, placed, op, true, battleCardMap, cardNum)) continue;
          ownEntries.push({
            id: generateUUID(),
            playerId: user.id,
            cardNum,
            effectId: eff.effectId,
            label: `${cardName} の【自】効果（ライズ時）`,
            effect: eff,
          });
        }
      }

      // コスト付き【出】効果があればモーダルで確認（DBはモーダル確定後に保存。複数あれば1効果ずつ連鎖）
      if (ownCostOnPlay.length > 0) {
        setPendingSigniOnPlayCost({
          cardNum,
          costEffect: ownCostOnPlay[0],
          placedState: placed,
          mandatoryEntries: [...ownEntries, ...fieldEntries],
          remainingCostEffects: ownCostOnPlay.slice(1),
          placedZone: zoneIndex,
        });
        return;
      }

      if (ownEntries.length === 0 && fieldEntries.length === 0) {
        // 効果なし：そのまま保存
        const stateKey = isHost ? 'host_state' : 'guest_state';
        await supabase.from('battle_states')
          .update({ [stateKey]: placed, ...(opAfterPlay ? { [opKeySummon]: opAfterPlay } : {}) })
          .eq('room_id', roomId);
        return;
      }

      // すべてをスタックに積む
      const allEntries = [...ownEntries, ...fieldEntries];
      const turnPlayerId = bs.active_user_id ?? user.id;
      const existing = bs?.effect_stack ?? null;
      const stack = existing
        ? pushToStack(existing, allEntries)
        : initStack(turnPlayerId, allEntries);

      const stateKey = isHost ? 'host_state' : 'guest_state';
      const { error: summonErr } = await supabase.from('battle_states')
        .update({ [stateKey]: placed, effect_stack: stack, pending_effect: null, ...(opAfterPlay ? { [opKeySummon]: opAfterPlay } : {}) })
        .eq('room_id', roomId);
      if (summonErr) console.error('[handleSummonSigni] DB error:', summonErr);
    } finally {
      setLoading(false);
    }
  };

  // グロウ
  const myLrig = my.field.lrig ?? [];
  const currentLrigNum = myLrig[myLrig.length - 1] ?? null;
  const currentLrig = currentLrigNum ? battleCardMap.get(currentLrigNum) ?? null : null;
  const currentLrigLevel = currentLrig ? parseInt(currentLrig.Level) || 0 : 0;

  // 現在のルリグにグロウ色制限があるか確認（「このルリグは〜のルリグにしかグロウできない」）
  const growColorRestrictText = currentLrig?.EffectText?.match(/このルリグは(.+)のルリグにしかグロウできない/)?.[1] ?? null;
  const growCandidates = my.lrig_deck
    .filter((num, i, arr) => arr.indexOf(num) === i)
    .map(num => battleCardMap.get(num))
    .filter((c): c is CardData =>
      !!c &&
      c.Type === 'ルリグ' &&
      // freeGrowFilter==='same': ゲット・グロウ等で現センターと同レベルへ横グロウ
      (freeGrowFilter === 'same'
        ? parseInt(c.Level) === currentLrigLevel
        : parseInt(c.Level) === currentLrigLevel + 1 ||
        // GROW_FROM_LEVEL0: このルリグはレベル0からグロウできる
        (currentLrigLevel === 0 && (effectsMap.get(c.CardNum) ?? []).some(e =>
          e.effectType === 'CONTINUOUS' &&
          (e.action as import('../types/effects').StubAction).type === 'STUB' &&
          (e.action as import('../types/effects').StubAction).id === 'GROW_FROM_LEVEL0',
        ))) &&
      // CardClass 互換チェック
      (!currentLrig || lrigClassesCompatible(currentLrig.CardClass, c.CardClass)) &&
      // 【グロウ】条件チェック（ライフクロス枚数・カード名・トラッシュ色数・エナ色種数・複数色制限）
      checkGrowCondition(extractGrowCondition(c.EffectText), my, currentLrig ?? undefined, battleCardMap) &&
      // グロウ色制限チェック（「青かつ黒のルリグにしかグロウできない」等）
      (!growColorRestrictText || (() => {
        const colors = growColorRestrictText.split(/かつ|と/).map(s => s.trim());
        const cColors = (c.Color ?? '').split(/[・,、]/).map(s => s.trim());
        return colors.every(col => cColors.includes(col));
      })())
    );

  // ルリグのクラス（制限チェック共通）
  const lrigClass = currentLrig?.CardClass ?? '';
  const ignoreRestriction = (my.lrig_gained_types?.includes('__ignore_lrig_restriction__') ?? false) ||
    [my.field.lrig.at(-1), my.field.key_piece].filter(Boolean).some(cn =>
      (effectsMap.get(cn!) ?? []).some(e =>
        e.effectType === 'CONTINUOUS' &&
        (e.action as import('../types/effects').StubAction).type === 'STUB' &&
        (e.action as import('../types/effects').StubAction).id === 'IGNORE_LRIG_RESTRICTION_ARTS'
      )
    );

  // シグニ召喚: リミット計算（アシストルリグ+1ずつ、lrig_limit_mod加算、LRIG_LIMIT_UP_AND_COLOR_GAIN加算）
  // OPP_CENTER_LRIG_LIMIT_SET_5: 相手フィールドにあれば基本リミットを5に上書き
  const oppBasicLimitOverride = op.field.signi.some(stack => {
    const top = stack?.at(-1);
    return top && (effectsMap.get(top) ?? []).some(eff =>
      eff.effectType === 'CONTINUOUS' &&
      (eff.action as import('../types/effects').StubAction).type === 'STUB' &&
      (eff.action as import('../types/effects').StubAction).id === 'OPP_CENTER_LRIG_LIMIT_SET_5'
    );
  }) ? 5 : undefined;
  // lrig_copy_opp_level_limit: WXK03-003A ルリグのリミットを相手センタールリグからコピー
  const oppCenterLrig = battleCardMap.get(op.field.lrig.at(-1) ?? '');
  // Limit「∞」はInfinity扱い（parseIntだとNaN→0になりシグニを出せなくなる）
  const parseLimitVal = (s?: string) => s === '∞' ? Infinity : (parseInt(s ?? '0') || 0);
  const copyBaseLimitFromOpp = my.lrig_copy_opp_level_limit
    ? parseLimitVal(oppCenterLrig?.Limit)
    : undefined;
  // 【リミットアッパー】トークン: 場のルリグが1体（アシストなし）かつレベル3以上のかぎりリミット+2
  const limitUpperBonus = my.limit_upper_token
    && (my.field.assist_lrig_l ?? []).length === 0
    && (my.field.assist_lrig_r ?? []).length === 0
    && currentLrigLevel >= 3 ? 2 : 0;
  const lrigLimit = (oppBasicLimitOverride ?? copyBaseLimitFromOpp ?? parseLimitVal(currentLrig?.Limit))
    + ((my.field.assist_lrig_l ?? []).length > 0 ? 1 : 0)
    + ((my.field.assist_lrig_r ?? []).length > 0 ? 1 : 0)
    + (my.lrig_limit_mod ?? 0)
    + (my.game_lrig_limit_bonus ?? 0)
    + limitUpperBonus
    + myLrigColorAndLimitMods.limitDelta;
  const fieldSigniTopLevels: number[] = my.field.signi.map(stack => {
    if (!stack || stack.length === 0) return 0;
    const top = battleCardMap.get(stack[stack.length - 1]);
    return parseInt(top?.Level ?? '0') || 0;
  });
  const fieldSigniTotal = fieldSigniTopLevels.reduce((s, l) => s + l, 0);


  // アーツ候補（自分の lrig_deck からアーツカード）
  // 'アーツ' と 'アーツ/クラフト'（改造素材 WXK09-TK-01A 等8枚）は同じプレイ経路で使用できる。
  const artsCandidates: CardData[] = my.lrig_deck
    .filter((num, i, arr) => arr.indexOf(num) === i)
    .map(num => battleCardMap.get(num))
    .filter((c): c is CardData => !!c && (c.Type === 'アーツ' || c.Type === 'アーツ/クラフト'));

  // アシストグロウ候補（各ゾーンごとに、lrig_deck からアシストルリグを検索）
  const getAssistGrowCandidates = (side: 'l' | 'r'): CardData[] => {
    if (!bs) return [];
    const phase = bs.turn_phase;
    const stack = (side === 'l' ? my.field.assist_lrig_l : my.field.assist_lrig_r) ?? [];
    const topInstanceId = stack.length > 0 ? stack[stack.length - 1] : null;
    const topCard = topInstanceId ? battleCardMap.get(topInstanceId) : null;
    const topLevel = topCard !== undefined ? (parseInt(topCard?.Level ?? '-1') || 0) : -1;
    const topClass = topCard?.CardClass ?? '';
    const canGrowPhase =
      (phase === 'MAIN'           && isMyTurn) ||
      (phase === 'ATTACK_ARTS'    && isMyTurn) ||
      (phase === 'ATTACK_ARTS_OP' && !isMyTurn);
    if (!canGrowPhase) return [];
    return my.lrig_deck
      .map(num => battleCardMap.get(num))
      .filter((c): c is CardData => {
        if (!c || c.Type !== 'アシストルリグ') return false;
        const level = parseInt(c.Level) || 0;
        if (level !== topLevel + 1) return false;
        if (level > currentLrigLevel) return false;
        if (topClass && !lrigClassesCompatible(topClass, c.CardClass)) return false;
        const timingOk =
          (phase === 'MAIN' && c.Timing.includes('メインフェイズ')) ||
          ((phase === 'ATTACK_ARTS' || phase === 'ATTACK_ARTS_OP') && c.Timing.includes('アタックフェイズ'));
        return timingOk;
      });
  };

  // スペルカットイン候補（lrig_deck + field lrig + signi_field + hand）
  const cutinCandidates: CutinCandidate[] = (() => {
    if (!bs.pending_spell || bs.pending_spell.caster_id === user.id) return [];
    // GRANT_NEXT_SPELL_UNCOUNTERABLE（WX04-008）: 使用者のスペルが対戦相手の効果で打ち消されない場合、
    // カットイン（このエンジンでは常にスペルを打ち消す）を提示しない。
    const cutinCasterState = bs.pending_spell.caster_id === bs.host_id ? bs.host_state : bs.guest_state;
    if (cutinCasterState.next_spell_uncounterable) return [];
    const pendingSpellCard = battleCardMap.get(bs.pending_spell.card_num);
    const pendingSpellCostTotal = pendingSpellCard
      ? parseGrowCost(pendingSpellCard.Cost).reduce((s, c) => s + c.count, 0)
      : 0;
    const result: CutinCandidate[] = [];

    // 1. lrig_deck: CSV Timing列に「スペルカットイン」を含むカード
    my.lrig_deck
      .filter((id, i, arr) => arr.indexOf(id) === i)
      .forEach(instanceId => {
        const cardNum = getCardNum(instanceId);
        const card = battleCardMap.get(cardNum);
        if (!card || !card.Timing.includes('スペルカットイン')) return;
        if (!meetsRestriction(card.Restriction, lrigClass, ignoreRestriction)) return;
        const effs = effectsMap.get(instanceId) ?? effectsMap.get(cardNum) ?? [];
        const eff = effs.find(e => e.effectType === 'ACTIVATED');
        const maxCost = eff ? findCounterSpellMaxCost(eff.action) : undefined;
        if (maxCost !== undefined && pendingSpellCostTotal > maxCost) return;
        const dummyEff: import('../types/effects').CardEffect = eff ?? {
          effectId: cardNum + '-cutin-dummy',
          effectType: 'ACTIVATED',
          timing: ['SPELL_CUTIN'],
          action: { type: 'COUNTER_SPELL' },
          duration: 'INSTANT',
          mandatory: false,
          parseStatus: 'MANUAL',
        };
        result.push({ card, instanceId, source: 'lrig_deck', effect: dummyEff });
      });

    // 2. lrig_field + key_piece: ACTIVATED効果にSPELL_CUTINタイミングを持つルリグ/キー
    const lrigAndKeyIds = [
      ...new Set(my.field.lrig.filter(Boolean)),
      ...(my.field.key_piece ? [my.field.key_piece] : []),
      ...(my.field.key_piece_extra ?? []),
    ];
    lrigAndKeyIds.forEach(instanceId => {
      const cardNum = getCardNum(instanceId);
      const card = battleCardMap.get(cardNum);
      if (!card) return;
      const effs = effectsMap.get(instanceId) ?? effectsMap.get(cardNum) ?? [];
      const eff = effs.find(e => e.effectType === 'ACTIVATED' && e.timing?.includes('SPELL_CUTIN'));
      if (!eff) return;
      if (eff.cost?.underSelfTrash) return;
      if (eff.cost?.coin) return;
      const maxCost = findCounterSpellMaxCost(eff.action);
      if (maxCost !== undefined && pendingSpellCostTotal > maxCost) return;
      // 使用条件（「あなたの場に＜凶蟲＞のシグニがある場合」等）を満たさないカットインは候補から除外
      if (eff.condition && !evalUseCondition(eff.condition, my, op, battleCardMap, instanceId, bs.turn_phase, effectivePowers)) return;
      result.push({ card, instanceId, source: 'lrig_field', effect: eff });
    });

    // 3. signi_field: ACTIVATED効果にSPELL_CUTINタイミングを持つシグニ
    my.field.signi.forEach((zone, zoneIdx) => {
      const topId = zone?.at(-1);
      if (!topId) return;
      const cardNum = getCardNum(topId);
      const card = battleCardMap.get(cardNum);
      if (!card) return;
      const effs = effectsMap.get(topId) ?? effectsMap.get(cardNum) ?? [];
      const eff = effs.find(e => e.effectType === 'ACTIVATED' && e.timing?.includes('SPELL_CUTIN'));
      if (!eff) return;
      const maxCost = findCounterSpellMaxCost(eff.action);
      if (maxCost !== undefined && pendingSpellCostTotal > maxCost) return;
      if (eff.condition && !evalUseCondition(eff.condition, my, op, battleCardMap, topId, bs.turn_phase, effectivePowers)) return;
      result.push({ card, instanceId: topId, source: 'signi_field', effect: eff, zoneIdx });
    });

    // 4. hand: ACTIVATED効果にSPELL_CUTINタイミングを持つ手札カード
    my.hand.forEach((cardNum, handIdx) => {
      const card = battleCardMap.get(cardNum);
      if (!card) return;
      const effs = effectsMap.get(cardNum) ?? [];
      const eff = effs.find(e => e.effectType === 'ACTIVATED' && e.timing?.includes('SPELL_CUTIN'));
      if (!eff) return;
      const maxCost = findCounterSpellMaxCost(eff.action);
      if (maxCost !== undefined && pendingSpellCostTotal > maxCost) return;
      if (eff.condition && !evalUseCondition(eff.condition, my, op, battleCardMap, cardNum, bs.turn_phase, effectivePowers)) return;
      result.push({ card, instanceId: cardNum, source: 'hand', effect: eff, handIdx });
    });

    return result;
  })();

  const executeGrow = async (card: CardData, costIndices: Set<number>) => {
    if (!isMyTurn || loading) return;
    setLoading(true);
    const wasFreeGrow = freeGrowFilter !== null;
    closeGrowModal();
    try {
      const cardNum = card.CardNum;
      const idx = my.lrig_deck.findIndex(id => getCardNum(id) === cardNum);
      const instanceId = idx >= 0 ? my.lrig_deck[idx] : cardNum;
      const newLrigDeck = idx === -1 ? my.lrig_deck
        : [...my.lrig_deck.slice(0, idx), ...my.lrig_deck.slice(idx + 1)];
      const paidNums = [...costIndices].map(i => my.energy[i]);
      let newEnergy = my.energy.filter((_, i) => !costIndices.has(i));
      // GROW_COST_SUBSTITUTE_TRASH_SIGNI: 選択枚数が totalReq-1 なら代替シグニをトラッシュ
      const growSubInfoExec = collectGrowCostSubstitute(my, battleCardMap, effectsMap);
      const costItemsExec = parseGrowCost(applyGrowCostReduction(card.GrowCost, collectGrowCostReductions(my, op, isMyTurn, effectsMap, battleCardMap)));
      const totalReqExec = costItemsExec.reduce((s, c) => s + c.count, 0);
      if (growSubInfoExec && costIndices.size === totalReqExec - 1) {
        const subSigni = newEnergy.find(cn => {
          const c = battleCardMap.get(cn);
          return c?.Type === 'シグニ' && (c.CardClass ?? '').includes(growSubInfoExec.signiClass);
        });
        if (subSigni) {
          newEnergy = newEnergy.filter(cn => cn !== subSigni);
          paidNums.push(subSigni);
        }
      }
      const coinGain = parseInt(card.Coin) || 0;
      // フリーグロウ（ゲット・グロウ等）はグロウコストのコインを支払わず、通常グロウ枠も消費しない（横グロウ）
      const growCoinCost = wasFreeGrow ? 0 : parseCoinCost(card.GrowCost);
      let newMyState: PlayerState = {
        ...my,
        lrig_deck: newLrigDeck,
        field: { ...my.field, lrig: [...my.field.lrig, instanceId] },
        energy: newEnergy,
        trash: [...my.trash, ...paidNums],
        actions_done: wasFreeGrow ? (my.actions_done ?? []) : [...(my.actions_done ?? []), 'GROW'],
        coins: Math.min(5, Math.max(0, my.coins - growCoinCost) + coinGain),
        free_grow_this_turn: undefined,
      };
      // グロウ条件の追加効果（ルリグをデッキから下に置く・除外する等）
      const growCond = extractGrowCondition(card.EffectText);
      const { state: afterGrowEffect, log: growEffectLog } = applyGrowEffect(growCond, newMyState, battleCardMap);
      newMyState = afterGrowEffect;
      const stateKey = isHost ? 'host_state' : 'guest_state';
      // LIMIT_ALL_FIELD_N（WX04-005-E3 補足）: グロウ先がこの継続効果を持つなら、各プレイヤーが
      //「自分のシグニを超過分だけ選んでトラッシュに置く」（残り上限体）。スタックに積んで選択させる。
      const grownFieldLimit = computeFieldSigniLimit(newMyState, op, effectsMap, getCardNum);
      const opponentId = isHost ? bs.guest_id : bs.host_id;
      const fieldLimitEntries: StackEntry[] = [];
      if (grownFieldLimit < 3) {
        const mkLimitEntry = (pid: string, count: number): void => {
          const excess = count - grownFieldLimit;
          if (excess <= 0) return;
          fieldLimitEntries.push({
            id: generateUUID(), playerId: pid, cardNum: '',
            effectId: '__field_limit_trash__',
            label: `場出し数制限：シグニ${excess}体を選んでトラッシュに置く（残り${grownFieldLimit}体）`,
            effect: {
              effectId: '__field_limit_trash__', effectType: 'AUTO', timing: [],
              action: { type: 'TRASH', target: { type: 'SIGNI', owner: 'self', count: excess } },
              duration: 'INSTANT', mandatory: true,
            } as import('../types/effects').CardEffect,
          });
        };
        mkLimitEntry(user.id, newMyState.field.signi.filter(s => (s ?? []).length > 0).length);
        mkLimitEntry(opponentId, op.field.signi.filter(s => (s ?? []).length > 0).length);
      }
      const cardName = card.CardName;
      const coinLog = coinGain > 0 ? `（コイン+${coinGain}）` : '';
      const logs = [`${cardName}にグロウ${coinLog}`];
      if (growEffectLog) logs.push(growEffectLog);
      // game_grow_draw: グロウ時ドロー（GAIN_ABILITY_THIS_GAME）
      if (newMyState.game_grow_draw && newMyState.deck.length > 0) {
        const drawCard = newMyState.deck[0];
        newMyState = { ...newMyState, deck: newMyState.deck.slice(1), hand: [...newMyState.hand, drawCard] };
        logs.push('グロウ時ドロー（このゲーム）');
      }
      appendBattleLogs(logs);

      // ルリグの ON_PLAY 効果を確認（COPY_LRIG_NAME_ABILITYコピー効果も含む）
      const ownEffects = effectsMap.get(cardNum) ?? [];
      // SUPPRESS_CENTER_ON_PLAY: このターンセンタールリグの【出】能力を抑制
      const suppressLrigPlay = newMyState.suppress_center_on_play === true;
      const copiedOnPlayEffects = suppressLrigPlay ? [] : collectCopiedLrigAutoEffects(newMyState, battleCardMap, effectsMap, op, isMyTurn)
        .filter(e => e.timing?.includes('ON_PLAY'));
      const allOnPlayEffects = suppressLrigPlay ? [] : [...ownEffects, ...copiedOnPlayEffects];
      const mandatoryOnPlay = allOnPlayEffects.filter(e =>
        e.effectType === 'AUTO' &&
        e.timing?.includes('ON_PLAY') &&
        e.mandatory !== false &&
        // activeCondition（英知=N等）を満たさない【出】は発火しない
        (!e.activeCondition || checkActiveCondition(e.activeCondition, newMyState, op, true, battleCardMap, cardNum)),
      );
      const costOnPlay = allOnPlayEffects.filter(e =>
        e.effectType === 'AUTO' &&
        e.timing?.includes('ON_PLAY') &&
        e.mandatory === false &&
        e.cost,
      );
      // 収集漏れ検出: mandatory:false+costなしはどちらの収集にも入らず無発火（v0.261コインバグと同型）
      const droppedGrowOnPlay = allOnPlayEffects.filter(e =>
        e.effectType === 'AUTO' && e.timing?.includes('ON_PLAY') &&
        e.mandatory === false && !e.cost,
      );
      if (droppedGrowOnPlay.length > 0) console.warn(`[executeGrow] mandatory:false+costなしのON_PLAY効果は発火しません: ${droppedGrowOnPlay.map(e => e.effectId).join(', ')}`);
      if (suppressLrigPlay) appendBattleLogs(['センタールリグの【出】能力は抑制されました']);

      // ON_LRIG_GROW（C1 配線）: センターグロウ実行者＝user.id のグロウに反応する【自】を収集。
      // any_opp（対戦相手のルリグがグロウ）は非ターンプレイヤー側＝effect_stack の opp 側は
      // buildQueue（effectStack.ts）で `[...turn, ...opp]` の順に並ぶため、グロウ先ルリグ自身の
      // 【出】（ON_PLAY・ターンプレイヤー側）が先に解決され any_opp watcher は後で処理される
      // （2026-07-12・PLAN §7 ON_LRIG_GROW③検証で訂正＝旧コメントは順序を逆に記載していた誤り。
      // golden「Stage2 effectStack initStack: ターンプレイヤー→相手の順でキュー構築」参照）。
      const growTrig = collectLrigGrowTriggers(user.id, newMyState, op);
      const growTriggerEntries = growTrig.entries;
      // usageLimit（《ターン1回》）消費を actions_done へ永続化（従来は「読むだけ」で書き戻しが無く実質ノーガードだった。続き135）
      const growUsedMine = isHost ? growTrig.usedHostIds : growTrig.usedGuestIds;
      const growUsedOpp  = isHost ? growTrig.usedGuestIds : growTrig.usedHostIds;
      if (growUsedMine.length > 0) newMyState = { ...newMyState, actions_done: [...(newMyState.actions_done ?? []), ...growUsedMine] };
      const opAfterGrow: PlayerState | null = growUsedOpp.length > 0
        ? { ...op, actions_done: [...(op.actions_done ?? []), ...growUsedOpp] }
        : null;
      const opKeyGrow = isHost ? 'guest_state' : 'host_state';
      // ON_COIN_PAID（C1 配線・グロウコストのコイン支払）: グロウコストでコインを支払った場合に反応【自】を積む。
      const growCoin = growCoinCost > 0 ? collectCoinPaidTriggers(user.id, newMyState, op) : { entries: [] as StackEntry[], usedIds: [] as string[] };
      const growCoinPaidEntries = growCoin.entries;
      newMyState = applyCoinPaidUsed(newMyState, growCoin); // 《ターン1回/2回》消化を actions_done に永続化


      // コスト付き任意【出】効果があればモーダルで確認（複数あれば1効果ずつ連鎖）
      if (costOnPlay.length > 0) {
        const mandatoryEntries: StackEntry[] = [
          ...fieldLimitEntries,
          ...growTriggerEntries,
          ...growCoinPaidEntries,
          ...mandatoryOnPlay.map(eff => ({
            id: generateUUID(), playerId: user.id, cardNum,
            effectId: eff.effectId, label: `${cardName} の【出】効果`, effect: eff,
          })),
        ];
        setPendingSigniOnPlayCost({
          cardNum, costEffect: costOnPlay[0],
          placedState: newMyState, mandatoryEntries,
          remainingCostEffects: costOnPlay.slice(1),
        });
        return;
      }

      // mandatory ON_PLAY 効果＋場出し数制限の選択トラッシュ＋グロウ反応＋コイン支払反応をスタックに積む
      const entries: StackEntry[] = [
        ...fieldLimitEntries,
        ...growTriggerEntries,
        ...growCoinPaidEntries,
        ...mandatoryOnPlay.map(eff => ({
          id: generateUUID(), playerId: user.id, cardNum,
          effectId: eff.effectId, label: `${cardName} の【出】効果`, effect: eff,
        })),
      ];
      if (entries.length === 0) {
        await supabase.from('battle_states')
          .update({ [stateKey]: newMyState, ...(opAfterGrow ? { [opKeyGrow]: opAfterGrow } : {}) })
          .eq('room_id', roomId);
        return;
      }
      const turnPlayerId = bs.active_user_id ?? user.id;
      const existing = bs?.effect_stack ?? null;
      const stack = existing ? pushToStack(existing, entries) : initStack(turnPlayerId, entries);
      await supabase.from('battle_states')
        .update({ [stateKey]: newMyState, effect_stack: stack, pending_effect: null, ...(opAfterGrow ? { [opKeyGrow]: opAfterGrow } : {}) })
        .eq('room_id', roomId);
    } finally {
      setLoading(false);
    }
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
      const removedSigniNums: string[] = [];
      for (const zi of selectedRemoveZones) {
        const stack = my.field.signi[zi] ?? [];
        const top = stack.at(-1);
        if (top) removedSigniNums.push(top);
        newTrash = [...newTrash, ...stack];
        newSigni[zi] = null;
      }
      const newMyState: PlayerState = {
        ...my,
        field: { ...my.field, signi: newSigni },
        trash: newTrash,
        actions_done: [...(my.actions_done ?? []), 'REMOVE'],
      };
      const stateKey = isHost ? 'host_state' : 'guest_state';
      const opStateKey = isHost ? 'guest_state' : 'host_state';
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
      const opUsageUpdate = opAfterTrash !== op ? { [opStateKey]: opAfterTrash } : {};
      if (removeTrashEntries.length > 0) {
        const existing = bs?.effect_stack ?? null;
        const stack = existing ? pushToStack(existing, removeTrashEntries) : initStack(user.id, removeTrashEntries);
        await supabase.from('battle_states').update({ [stateKey]: myAfterTrash, ...opUsageUpdate, effect_stack: stack }).eq('room_id', roomId);
      } else {
        await supabase.from('battle_states').update({ [stateKey]: myAfterTrash, ...opUsageUpdate }).eq('room_id', roomId);
      }
    } finally {
      setLoading(false);
      setSelectedRemoveZones(new Set());
    }
  };

  const executeArts = async (card: CardData, costIndices: Set<number>, betCoins: number = 0, encore: boolean = false, discardIndices: Set<number> = new Set(), useKeySub = false) => {
    if (loading) return;
    if (isActionBlocked('USE_ARTS')) return;
    setLoading(true);
    closeArtsModal();
    setKeySubstituteEnabled(false);
    try {
      const cardNum = card.CardNum;
      const idx = my.lrig_deck.findIndex(id => getCardNum(id) === cardNum);
      const instanceId = idx >= 0 ? my.lrig_deck[idx] : cardNum;
      const newLrigDeck = idx === -1 ? my.lrig_deck
        : [...my.lrig_deck.slice(0, idx), ...my.lrig_deck.slice(idx + 1)];
      const paidNums = [...costIndices].map(i => my.energy[i]);
      const newEnergy = my.energy.filter((_, i) => !costIndices.has(i));
      const discardNums = [...discardIndices].map(i => my.hand[i]);
      const newHand = my.hand.filter((_, i) => !discardIndices.has(i));
      // ベット消費コインは UI で選んだ枚数（betCoins）。アンコールとの合算可否は UI でガード済み
      const betCost = Math.max(0, betCoins);
      const encoreCoinCost = encore ? (parseEncoreCost(card.EffectText ?? '')?.coins ?? 0) : 0;
      // キーピース代替（ENERGY_SUBSTITUTE_TRASH_KEY）
      const keySub = useKeySub && myEnergyTrashSubInfo.keySubInstId;
      const lrigTrashBase = encore ? my.lrig_trash : [...my.lrig_trash, instanceId];
      const paid: PlayerState = {
        ...my,
        lrig_deck: encore
          ? [instanceId, ...newLrigDeck]    // アンコール：ルリグデッキ先頭に戻す
          : newLrigDeck,
        energy: newEnergy,
        hand: newHand,
        lrig_trash: keySub ? [...lrigTrashBase, myEnergyTrashSubInfo.keySubInstId!] : lrigTrashBase,
        trash: [...my.trash, ...paidNums, ...discardNums],
        coins: Math.max(0, my.coins - betCost - encoreCoinCost),
        field: keySub ? { ...my.field, key_piece: null } : my.field,
        turn_hand_discarded_count: discardNums.length > 0
          ? (my.turn_hand_discarded_count ?? 0) + discardNums.length : my.turn_hand_discarded_count,
        actions_done: [...(my.actions_done ?? []), 'USE_ARTS', ...((betCost > 0 || encoreCoinCost > 0) ? ['COIN_SPENT'] : [])],
        // このターンにアーツを使用したフラグ（ARTS_USED_THIS_TURN 条件。WX25-P1-106。ターン境界でリセット）
        turn_arts_used: true,
        // 使用したアーツの色（色別 ARTS_USED_THIS_TURN。WX24-D1-11〜D4-11。ターン境界でリセット）
        turn_arts_used_colors: [...(my.turn_arts_used_colors ?? []), ...((card.Color || '').match(/白|赤|青|緑|黒|無色/g) ?? [])],
        // BET_CONDITION: ベット宣言フラグ（execStub内でBET_CONDITIONが参照）
        is_betting_this_effect: betCost > 0 ? true : undefined,
        bet_coins_paid: betCost > 0 ? betCost : undefined,
      };
      if (betCost > 0) appendBattleLogs([`ベット：コイン${betCost}枚消費`]);
      if (encore) appendBattleLogs([`アンコール：${card.CardName}をルリグデッキに戻す`]);
      // ON_COIN_PAID（C1 配線・アーツのベット/アンコールのコイン支払）: extraEntries 経由で反応【自】を積む。
      const artsCoin = (betCost + encoreCoinCost) > 0 ? collectCoinPaidTriggers(user.id, paid, op) : { entries: [] as StackEntry[], usedIds: [] as string[] };
      const artsCoinPaidEntries = artsCoin.entries;
      // ON_MATERIAL_USED（改造素材機構 Step3a）: 《改造素材》使用時に「あなたが使用したとき」(materialUsedByPlayer)変種を発火。
      // ⚠「このシグニに/他の味方に使用されたとき」(self/any_ally・対象シグニ依存)は Step2（トークン3択の対象捕捉）が前提＝別途。
      let materialUsedEntries: StackEntry[] = [];
      let paidAfterMaterial = applyCoinPaidUsed(paid, artsCoin); // ON_COIN_PAID の《ターン1回/2回》消化を永続化（続き106）
      if (card.CardName === '改造素材') {
        const mu = collectMaterialUsedByPlayerTriggers(user.id, paidAfterMaterial);
        materialUsedEntries = mu.entries;
        if (mu.usedOncePerTurnIds.length > 0) {
          paidAfterMaterial = { ...paidAfterMaterial, actions_done: [...(paidAfterMaterial.actions_done ?? []), ...mu.usedOncePerTurnIds] };
        }
      }
      // アーツ効果を発火
      const fired = await queueCardEffects(instanceId, ['ACTIVATED'], [], paidAfterMaterial, op, {}, 1, [...artsCoinPaidEntries, ...materialUsedEntries]);
      if (!fired) {
        const stateKey = isHost ? 'host_state' : 'guest_state';
        await supabase.from('battle_states').update({ [stateKey]: paidAfterMaterial }).eq('room_id', roomId);
      }
      setCloseZoneSignal(s => s + 1);
    } finally {
      setLoading(false);
    }
  };

  // ── キーピース使用 ──
  const executeKeyPiece = async (card: CardData, costIndices: Set<number>) => {
    if (loading) return;
    setLoading(true);
    closeKeyModal();
    try {
      const cardNum = card.CardNum;
      const idx = my.lrig_deck.findIndex(id => getCardNum(id) === cardNum);
      const instanceId = idx >= 0 ? my.lrig_deck[idx] : cardNum;
      const newLrigDeck = idx === -1 ? my.lrig_deck
        : [...my.lrig_deck.slice(0, idx), ...my.lrig_deck.slice(idx + 1)];
      const paidNums = [...costIndices].map(i => my.energy[i]);
      const newEnergy = my.energy.filter((_, i) => !costIndices.has(i));
      const coinCost = parseCoinCost(card.Cost) + parseCoinCost(card.GrowCost);
      const hasUnlimitedKeysEKP = my.field.lrig.some(ln =>
        (effectsMap.get(ln) ?? []).some(e =>
          e.effectType === 'CONTINUOUS' &&
          (e.action as import('../types/effects').StubAction)?.type === 'STUB' &&
          (e.action as import('../types/effects').StubAction)?.id === 'UNLIMITED_KEYS',
        )
      );
      const newField = (hasUnlimitedKeysEKP && my.field.key_piece)
        ? { ...my.field, key_piece_extra: [...(my.field.key_piece_extra ?? []), instanceId] }
        : { ...my.field, key_piece: instanceId };
      const paid: PlayerState = {
        ...my,
        lrig_deck: newLrigDeck,
        field: newField,
        energy: newEnergy,
        trash: [...my.trash, ...paidNums],
        coins: Math.max(0, my.coins - coinCost),
      };
      // ON_COIN_PAID（C1 配線・キープレイのコイン支払）: extraEntries 経由で反応【自】を積む。
      const keyCoin = coinCost > 0 ? collectCoinPaidTriggers(user.id, paid, op) : { entries: [] as StackEntry[], usedIds: [] as string[] };
      const keyCoinPaidEntries = keyCoin.entries;
      const paidWithCoin = applyCoinPaidUsed(paid, keyCoin); // 《ターン1回/2回》消化を永続化（続き106）
      const fired = await queueCardEffects(instanceId, ['AUTO'], ['ON_PLAY'], paidWithCoin, op, {}, 1, keyCoinPaidEntries);
      if (!fired) {
        const stateKey = isHost ? 'host_state' : 'guest_state';
        await supabase.from('battle_states').update({ [stateKey]: paidWithCoin }).eq('room_id', roomId);
      }
      setCloseZoneSignal(s => s + 1);
    } finally {
      setLoading(false);
    }
  };

  // ── キーピース起動効果 ──
  const executeKeyActivated = async (cardNum: string, effect: import('../types/effects').CardEffect, costIndices: Set<number>, discardIndices: Set<number> = new Set()) => {
    if (loading) return;
    setLoading(true);
    closeKeyActivated();
    try {
      const paidNums = [...costIndices].map(i => my.energy[i]);
      const newEnergy = my.energy.filter((_, i) => !costIndices.has(i));
      const discardNums = [...discardIndices].map(i => my.hand[i]);
      const newHand = my.hand.filter((_, i) => !discardIndices.has(i));
      // trash_key: このキーをルリグトラッシュに置く（コスト）
      let newField = my.field;
      let newLrigTrashKey = my.lrig_trash;
      if (effect.cost?.trash_key) {
        const keyInstId = my.field.key_piece;
        const extraKeys = my.field.key_piece_extra ?? [];
        const isMainKey = keyInstId != null && (keyInstId === cardNum || keyInstId.startsWith(cardNum + '_'));
        const extraIdx = !isMainKey ? extraKeys.findIndex(k => k === cardNum || k.startsWith(cardNum + '_')) : -1;
        if (isMainKey && keyInstId) {
          newField = { ...my.field, key_piece: null, key_piece_extra: extraKeys };
          newLrigTrashKey = [...my.lrig_trash, keyInstId];
        } else if (extraIdx >= 0) {
          const newExtra = extraKeys.filter((_, i) => i !== extraIdx);
          newField = { ...my.field, key_piece_extra: newExtra };
          newLrigTrashKey = [...my.lrig_trash, extraKeys[extraIdx]];
        }
      }
      const paid: PlayerState = {
        ...my,
        energy: newEnergy,
        hand: newHand,
        field: newField,
        lrig_trash: newLrigTrashKey,
        trash: [...my.trash, ...paidNums, ...discardNums],
        actions_done: (effect.usageLimit === 'once_per_turn' || effect.usageLimit === 'twice_per_turn')
          ? [...(my.actions_done ?? []), effect.effectId] : (my.actions_done ?? []),
      };
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
      await supabase.from('battle_states')
        .update({ [stateKey]: paid, effect_stack: newStack, pending_effect: null })
        .eq('room_id', roomId);
    } finally {
      setLoading(false);
    }
  };

  // ── アシストルリグ グロウ ──
  const executeAssistGrow = async (card: CardData, side: 'l' | 'r', costIndices: Set<number>) => {
    if (!isMyTurn || loading) return;
    setLoading(true);
    closeAssistGrow();
    try {
      const cardNum = card.CardNum;
      const idx = my.lrig_deck.findIndex(id => getCardNum(id) === cardNum);
      const instanceId = idx >= 0 ? my.lrig_deck[idx] : cardNum;
      const newLrigDeck = idx === -1 ? my.lrig_deck
        : [...my.lrig_deck.slice(0, idx), ...my.lrig_deck.slice(idx + 1)];
      const paidNums = [...costIndices].map(i => my.energy[i]);
      const newEnergy = my.energy.filter((_, i) => !costIndices.has(i));
      const sideKey = side === 'l' ? 'assist_lrig_l' : 'assist_lrig_r';
      const currentStack = (side === 'l' ? my.field.assist_lrig_l : my.field.assist_lrig_r) ?? [];
      const assistCoinGain = parseInt(card.Coin) || 0;
      const newMyState: PlayerState = {
        ...my,
        lrig_deck: newLrigDeck,
        field: { ...my.field, [sideKey]: [...currentStack, instanceId] },
        energy: newEnergy,
        trash: [...my.trash, ...paidNums],
        coins: Math.min(5, my.coins + assistCoinGain),
      };
      const stateKey = isHost ? 'host_state' : 'guest_state';
      // アシストルリグの ON_PLAY 効果をスタックに積む
      const assistOnPlay = (effectsMap.get(cardNum) ?? []).filter(e =>
        e.effectType === 'AUTO' && e.timing?.includes('ON_PLAY') && e.mandatory !== false
      );
      if (assistOnPlay.length > 0) {
        const entries: StackEntry[] = assistOnPlay.map(eff => ({
          id: generateUUID(), playerId: user.id, cardNum,
          effectId: eff.effectId,
          label: `${card.CardName} の【出】効果`,
          effect: eff,
        }));
        const existing = bs?.effect_stack ?? null;
        const stack = existing ? pushToStack(existing, entries) : initStack(bs?.active_user_id ?? user.id, entries);
        await supabase.from('battle_states').update({ [stateKey]: newMyState, effect_stack: stack }).eq('room_id', roomId);
      } else {
        await supabase.from('battle_states').update({ [stateKey]: newMyState }).eq('room_id', roomId);
      }
    } finally {
      setLoading(false);
    }
  };

  // ── アシストルリグ 起動効果 ──
  const executeAssistActivated = async (cardNum: string, effect: import('../types/effects').CardEffect, costIndices: Set<number>, discardIndices: Set<number> = new Set()) => {
    if (loading) return;
    setLoading(true);
    closeAssistActivated();
    try {
      const paidNums = [...costIndices].map(i => my.energy[i]);
      const newEnergy = my.energy.filter((_, i) => !costIndices.has(i));
      const discardNums = [...discardIndices].map(i => my.hand[i]);
      const newHand = my.hand.filter((_, i) => !discardIndices.has(i));
      let paid: PlayerState = {
        ...my,
        energy: newEnergy,
        hand: newHand,
        trash: [...my.trash, ...paidNums, ...discardNums],
        actions_done: (effect.usageLimit === 'once_per_turn' || effect.usageLimit === 'twice_per_turn')
          ? [...(my.actions_done ?? []), effect.effectId] : (my.actions_done ?? []),
      };
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
      const updatePayloadAssist: Record<string, unknown> = { [stateKey]: paid, effect_stack: newStack, pending_effect: null };
      if (newOpVirusStateAssist) updatePayloadAssist[oppStateKeyAssist] = newOpVirusStateAssist;
      await supabase.from('battle_states')
        .update(updatePayloadAssist)
        .eq('room_id', roomId);
    } finally {
      setLoading(false);
    }
  };

  // スペル発動: 手札から除いてコスト支払い → pending_spell をセット（カットイン待ち）
  // fromLrigDeck=true のとき: ルリグデッキから除いてpending_spell.from_lrig_deck=trueをセット（フェゾーネマジック）
  const castSpell = async (card: CardData, costIndices: Set<number>, handIdx: number, fromLrigDeck?: boolean, betCoins: number = 0) => {
    if (!isMyTurn || loading) return;
    if (isActionBlocked('USE_SPELL')) return;
    if (isActionBlocked('PLAY_COLORLESS') && card.Color === '無') return;
    if (isActionBlocked('BLOCK_NON_WHITE_SPELL') && !card.Color?.includes('白')) return;
    // DISONA_RESTRICTION: このターン《ディソナアイコン》ではないスペルを使用できない
    if (my.dissona_only_spells_this_turn && card.Story !== 'Dissona') {
      appendBattleLogs(['ディソナ制限：《ディソナアイコン》ではないスペルは使用不可']);
      return;
    }
    // BLOCK_LOW_COST_SPELL_BY_CHARM_COUNT: 相手フィールドのチャーム数以下コストのスペルは使用不可
    const spellBlockThreshold = collectBlockLowCostSpellCount(op, battleCardMap, effectsMap);
    if (spellBlockThreshold > 0) {
      const spellTotalCost = parseGrowCost(card.Cost ?? '').reduce((s, c) => s + c.count, 0);
      if (spellTotalCost <= spellBlockThreshold) {
        appendBattleLogs([`スペル使用不可: コスト${spellTotalCost}≤相手チャーム数${spellBlockThreshold}`]);
        return;
      }
    }
    setLoading(true);
    closeSpellCast();
    setBetAmount(0);
    try {
      const paidNums = [...costIndices].map(i => my.energy[i]);
      // 支払ったエナ1枚ごとの色配列（WX04-063「支払われたエナの色」参照用）。
      // マルチエナは全5色、無色エナは空配列として記録する。
      const paidEnergyColors = paidNums.map(num =>
        isMultiEna(num, battleCards, my.keyword_grants, myEnaAllMulti)
          ? ['白', '赤', '青', '緑', '黒']
          : splitColors(battleCardMap.get(getCardNum(num))?.Color));
      const newEnergy = my.energy.filter((_, i) => !costIndices.has(i));
      // ベット：UIで選んだコイン枚数を支払う（所持を超えない）。is_betting_this_effect は handleCutinPass の効果解決まで持続
      const betCost = Math.min(Math.max(0, betCoins), my.coins);
      let spellInstanceId: string;
      let newMyState: PlayerState;
      if (fromLrigDeck) {
        // フェゾーネマジック: lrig_deckから除いてゲームから除外先へ（使用後はlrig_trashへ近似）
        spellInstanceId = my.lrig_deck.find(id => {
          const base = id.indexOf('#') > 0 ? id.slice(0, id.indexOf('#')) : id;
          return base === card.CardNum;
        }) ?? card.CardNum;
        newMyState = {
          ...my,
          lrig_deck: my.lrig_deck.filter(id => id !== spellInstanceId),
          energy: newEnergy,
          trash: [...my.trash, ...paidNums],
          actions_done: [...(my.actions_done ?? []), 'USE_SPELL', ...(betCost > 0 ? ['COIN_SPENT'] : [])],
          next_spell_cost_reduction: undefined, // 次スペルコスト軽減を消費（WX04-008）
          ...(card.Story !== 'Dissona' ? { non_dissona_spell_played_this_turn: true } : {}),
          coins: Math.max(0, my.coins - betCost),
          is_betting_this_effect: betCost > 0 ? true : undefined, // 非ベット時は明示的にクリア（前回ベットの持ち越し防止）
          bet_coins_paid: betCost > 0 ? betCost : undefined,
        };
      } else {
        spellInstanceId = my.hand[handIdx] ?? card.CardNum;
        newMyState = {
          ...my,
          hand: my.hand.filter((_, i) => i !== handIdx),
          energy: newEnergy,
          trash: [...my.trash, ...paidNums],
          actions_done: [...(my.actions_done ?? []), 'USE_SPELL', ...(betCost > 0 ? ['COIN_SPENT'] : [])],
          next_spell_cost_reduction: undefined, // 次スペルコスト軽減を消費（WX04-008）
          ...(card.Story !== 'Dissona' ? { non_dissona_spell_played_this_turn: true } : {}),
          coins: Math.max(0, my.coins - betCost),
          is_betting_this_effect: betCost > 0 ? true : undefined, // 非ベット時は明示的にクリア（前回ベットの持ち越し防止）
          bet_coins_paid: betCost > 0 ? betCost : undefined,
        };
      }
      if (betCost > 0) appendBattleLogs([`ベット：コイン${betCost}枚消費`]);
      const stateKey = isHost ? 'host_state' : 'guest_state';
      const spell: PendingSpell = { caster_id: user.id, card_num: spellInstanceId, paid_energy_colors: paidEnergyColors, ...(fromLrigDeck ? { from_lrig_deck: true } : {}) };
      await supabase.from('battle_states')
        .update({ [stateKey]: newMyState, pending_spell: spell })
        .eq('room_id', roomId);
    } finally {
      setLoading(false);
    }
  };

  // スペルカットインをパス → スペル解決（スペル効果を発火）
  const handleCutinPass = async () => {
    if (!bs.pending_spell || loading) return;
    setLoading(true);
    closeCutin();
    try {
      const { caster_id, card_num, from_lrig_deck } = bs.pending_spell;
      const casterIsHost = caster_id === bs.host_id;
      const casterState = casterIsHost ? bs.host_state : bs.guest_state;
      const nonCasterState = casterIsHost ? bs.guest_state : bs.host_state;
      // 使用後の置き場所: フェゾーネマジック等（ルリグデッキ由来）はゲームから除外＝lrig_trashへ近似、通常スペルはトラッシュへ
      const placeUsedSpell = (s: PlayerState): PlayerState => from_lrig_deck
        ? { ...s, lrig_trash: [...s.lrig_trash, card_num] }
        : { ...s, trash: [...s.trash, card_num] };
      // NEGATE_SPELL: casterStateにspell_negated_this_turnがあればコスト合計5以下のスペルを打ち消す
      // ただし next_spell_uncounterable（WX04-008）があれば打ち消されない
      if (casterState.spell_negated_this_turn && !casterState.next_spell_uncounterable) {
        const spellCard = battleCardMap.get(card_num);
        const spellTotalCostNS = parseGrowCost(spellCard?.Cost ?? '').reduce((s, c) => s + c.count, 0);
        if (spellTotalCostNS <= 5) {
          const spellNameNS = spellCard?.CardName ?? card_num;
          const negatedCasterState: PlayerState = {
            ...placeUsedSpell(casterState),
            spell_negated_this_turn: undefined,
          };
          const hostStateNS  = casterIsHost ? negatedCasterState : nonCasterState;
          const guestStateNS = casterIsHost ? nonCasterState : negatedCasterState;
          appendBattleLogs([`[スペル打ち消し] ${spellNameNS}（コスト${spellTotalCostNS}）が打ち消された`]);
          await supabase.from('battle_states')
            .update({ host_state: hostStateNS, guest_state: guestStateNS, pending_spell: null, pending_effect: null })
            .eq('room_id', roomId);
          return;
        }
      }

      // 保護スペル（next_spell_uncounterable）はこの解決で消費＝フラグをクリア
      const resolved: PlayerState = { ...placeUsedSpell(casterState), next_spell_uncounterable: undefined };

      // スペル効果を発火（casterがowner）
      const effects = effectsMap.get(card_num) ?? [];
      const spellEff = effects.find(e => e.effectType === 'ACTIVATED');
      if (!spellEff) {
        await supabase.from('battle_states')
          .update({
            [casterIsHost ? 'host_state' : 'guest_state']: resolved,
            pending_spell: null, pending_effect: null,
          })
          .eq('room_id', roomId);
        return;
      }

      const spellWho = caster_id === user.id ? '自分' : '相手';
      const spellName = battleCardMap.get(card_num)?.CardName ?? card_num;
      appendBattleLogs([`[${spellWho}] ${spellName}を使用`]);
      const spellPowers = calcFieldPowers(resolved, nonCasterState, bs.active_user_id === caster_id, effectsMap, battleCardMap, bs.turn_phase);
      const spellIsOwnerTurn = bs.active_user_id === caster_id;
      const spellAllColorSigniNums = new Set([...collectAllColorSigniForField(resolved, battleCardMap, effectsMap, nonCasterState, spellIsOwnerTurn), ...collectAllColorSigniForField(nonCasterState, battleCardMap, effectsMap, resolved, !spellIsOwnerTurn)]);
      const spellExtraColors = new Map([...collectFieldSigniExtraColors(resolved, battleCardMap, effectsMap, nonCasterState, spellIsOwnerTurn), ...collectFieldSigniExtraColors(nonCasterState, battleCardMap, effectsMap, resolved, !spellIsOwnerTurn)]);
      const spellDeckTrashLevel1Nums = collectDeckTrashLevel1Nums(resolved, nonCasterState, effectsMap);
      const spellDeclaredCardMap = applyContinuousBaseLevelOverride(applyDeclaredZoneClassOverride(battleCardMap, resolved, nonCasterState), resolved, nonCasterState, effectsMap, spellIsOwnerTurn);
      const ctx: ExecCtx = { ownerState: resolved, otherState: nonCasterState, cardMap: spellDeclaredCardMap, logs: [], effectivePowers: spellPowers, sourceCardNum: card_num, allColorSigniNums: spellAllColorSigniNums, fieldSigniExtraColors: spellExtraColors, deckTrashLevel1Nums: spellDeckTrashLevel1Nums, paidEnergyColorSets: bs.pending_spell.paid_energy_colors };
      let result = executeEffect(spellEff, ctx);
      result = applyRefreshOnDone(result, battleCardMap); // デッキ0枚→リフレッシュ（スペル解決後）
      if (result.logs.length > 0) appendBattleLogs(result.logs);
      // ON_SPELL_USE: スペル使用時トリガー（自分ターンのみ）。
      // ルリグ（WX25-P2-034 APEX2「あなたがスペルを使用したとき」）に加え、場のシグニ（WX01-033 幻獣神オサキ
      // 「あなたが緑のスペルを使用したとき」）も走査する。triggerFilter.color があれば使用スペルの色で絞る。
      let casterAfter = result.ownerState;
      const spellUseEntries: StackEntry[] = [];
      if (spellIsOwnerTurn) {
        const usedSpellColor = battleCardMap.get(card_num)?.Color ?? '';
        // 収集元: センタールリグ + 場のシグニ各ゾーンのトップ
        const spellUseSources = [
          casterAfter.field.lrig.at(-1),
          ...casterAfter.field.signi.map(stack => stack?.at(-1)),
        ].filter((n): n is string => !!n);
        const usedIdsSU: string[] = [];
        for (const srcNum of spellUseSources) {
          for (const eff of (effectsMap.get(srcNum) ?? [])) {
            if (eff.effectType !== 'AUTO' || !eff.timing?.includes('ON_SPELL_USE')) continue;
            // スペル色フィルタ（「緑のスペルを使用したとき」等。color は単色 or 配列）
            if (eff.triggerFilter?.color) {
              const wantColors = Array.isArray(eff.triggerFilter.color) ? eff.triggerFilter.color : [eff.triggerFilter.color];
              if (!wantColors.some(c => usedSpellColor.includes(c))) continue;
            }
            if (eff.usageLimit === 'once_per_turn' &&
                ((casterAfter.actions_done?.includes(eff.effectId)) || usedIdsSU.includes(eff.effectId))) continue;
            if (eff.condition && !evalUseCondition(eff.condition, casterAfter, result.otherState, battleCardMap, srcNum, bs.turn_phase, spellPowers)) continue;
            if (eff.usageLimit === 'once_per_turn') usedIdsSU.push(eff.effectId);
            spellUseEntries.push({
              id: generateUUID(),
              playerId: caster_id,
              cardNum: srcNum,
              effectId: eff.effectId,
              label: `${battleCardMap.get(srcNum)?.CardName ?? srcNum}【自】スペル使用時`,
              effect: eff,
            });
          }
        }
        if (usedIdsSU.length > 0) casterAfter = { ...casterAfter, actions_done: [...(casterAfter.actions_done ?? []), ...usedIdsSU] };
      }
      // ON_SPELL_USE（相手側 watcher）＝「対戦相手がスペルを使用したとき」（triggerScope:any_opp）／
      // 「いずれかのプレイヤーがスペルを使用したとき」（any）。従来は使用者(caster)の場しか走査しておらず、
      // **使用者の対戦相手の場にある watcher が一度も発火しなかった**（続き75で parser が語彙を出すのに合わせて配線）。
      {
        const oppOfCasterId = caster_id === bs.host_id ? bs.guest_id : bs.host_id;
        const usedSpellColorOpp = battleCardMap.get(card_num)?.Color ?? '';
        const oppWatchSources = [
          result.otherState.field.lrig.at(-1),
          ...result.otherState.field.signi.map(stack => stack?.at(-1)),
        ].filter((n): n is string => !!n);
        const usedIdsSUOpp: string[] = [];
        for (const srcNum of oppWatchSources) {
          for (const eff of (effectsMap.get(srcNum) ?? [])) {
            if (eff.effectType !== 'AUTO' || !eff.timing?.includes('ON_SPELL_USE')) continue;
            const scopeSU = eff.triggerScope ?? 'self';
            if (scopeSU !== 'any_opp' && scopeSU !== 'any') continue; // self は使用者側でのみ発火（上のブロック）
            if (eff.triggerFilter?.color) {
              const wantColors = Array.isArray(eff.triggerFilter.color) ? eff.triggerFilter.color : [eff.triggerFilter.color];
              if (!wantColors.some(c => usedSpellColorOpp.includes(c))) continue;
            }
            if (eff.usageLimit === 'once_per_turn' &&
                ((result.otherState.actions_done?.includes(eff.effectId)) || usedIdsSUOpp.includes(eff.effectId))) continue;
            if (eff.condition && !evalUseCondition(eff.condition, result.otherState, casterAfter, battleCardMap, srcNum, bs.turn_phase, spellPowers)) continue;
            if (eff.usageLimit === 'once_per_turn') usedIdsSUOpp.push(eff.effectId);
            spellUseEntries.push({
              id: generateUUID(),
              playerId: oppOfCasterId,
              cardNum: srcNum,
              effectId: eff.effectId,
              label: `${battleCardMap.get(srcNum)?.CardName ?? srcNum}【自】スペル使用時（対戦相手の使用）`,
              effect: eff,
            });
          }
        }
        if (usedIdsSUOpp.length > 0) {
          result = { ...result, otherState: { ...result.otherState, actions_done: [...(result.otherState.actions_done ?? []), ...usedIdsSUOpp] } };
        }
      }
      // REVEAL_UNTIL_TO_FIELD（WX04-093「惰眠」等）: スペル効果で場に出したシグニの【出】(ON_PLAY) を積む。
      // 原文「【出】能力はこのスペルを処理したあとに好きな順番で発動する」→ スペル解決後にスタックへ積み、整列UIで順番を選べる。
      if (result.done && (spellEff.action as import('../types/effects').RevealUntilToFieldAction)?.type === 'REVEAL_UNTIL_TO_FIELD'
          && !(spellEff.action as import('../types/effects').RevealUntilToFieldAction)?.suppressOnPlay) { // suppressOnPlay: 自身 ON_PLAY を積まない（タスク12(xxix)）
        for (const instanceId of result.lastProcessedCards ?? []) {
          const cn = getCardNum(instanceId);
          for (const eff of (effectsMap.get(cn) ?? [])) {
            if (eff.effectType !== 'AUTO' || !eff.timing?.includes('ON_PLAY')) continue;
            // bySigniEffect 限定の【出】はスペルの効果による場出しでは発火しない（G079）
            if (eff.triggerCondition?.bySigniEffect) continue;
            spellUseEntries.push({
              id: generateUUID(),
              playerId: caster_id,
              cardNum: instanceId,
              effectId: eff.effectId,
              label: `${battleCardMap.get(cn)?.CardName ?? cn} の【出】効果`,
              effect: eff,
            });
          }
        }
      }
      let hostState  = casterIsHost ? casterAfter : result.otherState;
      let guestState = casterIsHost ? result.otherState : casterAfter;
      // ON_PLAY（any_ally/any・効果配置）: スペル効果で新たに場に出たシグニへの他シグニの反応（G145「他のシグニが効果で場に出たとき」等）。
      // ソースはスペルのため placeSourceIsSigni=false（bySigniEffect は非発火、byEffect は発火）。
      if (result.done) {
        const spellPlaceSourceIsSigni = battleCardMap.get(card_num)?.Type === 'シグニ';
        // 開花（【シード】→シグニ）は「場に出た」扱いではないため ON_PLAY から除外し、ON_BLOOM として別収集する。
        const hostBloomedSU  = detectBloomedSigni(bs.host_state, hostState);
        const guestBloomedSU = detectBloomedSigni(bs.guest_state, guestState);
        const bloomedSetSU = new Set<string>([...hostBloomedSU, ...guestBloomedSU,
          ...detectFacedownFlipped(bs.host_state, hostState), ...detectFacedownFlipped(bs.guest_state, guestState)]);
        // usageLimit 消費は収集の合間に actions_done へ畳み込む（次の収集が見て再発火を止める）。
        const useSU = (r: { usedHostIds: string[]; usedGuestIds: string[] }) => {
          if (r.usedHostIds.length > 0) hostState = { ...hostState, actions_done: [...(hostState.actions_done ?? []), ...r.usedHostIds] };
          if (r.usedGuestIds.length > 0) guestState = { ...guestState, actions_done: [...(guestState.actions_done ?? []), ...r.usedGuestIds] };
        };
        for (const placedNum of detectPlacedSigni(bs.host_state, hostState)) {
          if (bloomedSetSU.has(placedNum)) continue;
          const ft = collectFieldTriggers('ON_PLAY', placedNum, hostState, guestState, bs.host_id, { placedByEffect: true, placeSourceIsSigni: spellPlaceSourceIsSigni });
          spellUseEntries.push(...ft.entries); useSU(ft);
        }
        for (const placedNum of detectPlacedSigni(bs.guest_state, guestState)) {
          if (bloomedSetSU.has(placedNum)) continue;
          const ft = collectFieldTriggers('ON_PLAY', placedNum, guestState, hostState, bs.guest_id, { placedByEffect: true, placeSourceIsSigni: spellPlaceSourceIsSigni });
          spellUseEntries.push(...ft.entries); useSU(ft);
        }
        for (const bloomedNum of hostBloomedSU) {
          const bl = collectBloomTriggers(bloomedNum, hostState, guestState, bs.host_id);
          spellUseEntries.push(...bl.entries); useSU(bl);
        }
        for (const bloomedNum of guestBloomedSU) {
          const bl = collectBloomTriggers(bloomedNum, guestState, hostState, bs.guest_id);
          spellUseEntries.push(...bl.entries); useSU(bl);
        }
        // ON_DECK_SHUFFLED: スペル効果がインラインで完了し（SEARCH の afterSearch 等）デッキがシャッフルされた場合。
        // スタック解決（resolveStackNext）を経由しないスペル解決経路は中央 diff を通らないためここで拾う。
        const dsInlineSU = collectDeckShuffleInline(hostState, guestState);
        if (dsInlineSU.entries.length > 0) { spellUseEntries.push(...dsInlineSU.entries); hostState = dsInlineSU.hostState; guestState = dsInlineSU.guestState; }
      }
      const update: Record<string, unknown> = { host_state: hostState, guest_state: guestState, pending_spell: null };
      if (spellUseEntries.length > 0) {
        const existingStackSU = bs.effect_stack ?? null;
        update.effect_stack = existingStackSU
          ? pushToStack(existingStackSU, spellUseEntries)
          : initStack(bs.active_user_id ?? user.id, spellUseEntries);
      }
      if (!result.done) {
        update.pending_effect = { sourcePlayerId: caster_id, sourceCardNum: card_num, effectId: spellEff.effectId, interaction: result.pending } satisfies PendingEffect;
      } else {
        update.pending_effect = null;
      }
      await supabase.from('battle_states').update(update).eq('room_id', roomId);
      // GROW_FREE（ゲット・グロウ等）: スペル解決後、グロウ先選択モーダルを開いて実際にグロウまで行う
      if (result.done && spellIsOwnerTurn) {
        const growFree = findGrowFreeAction(spellEff.action);
        if (growFree) {
          openFreeGrow(growFree.levelFilter === 'same' ? 'same' : 'plus1');
        }
      }
    } finally {
      setLoading(false);
    }
  };

  // カットイン使用 → カットイン効果発火・スペルをトラッシュ（打ち消し）
  const handleCutinUse = async (candidate: CutinCandidate, costIndices: Set<number>) => {
    if (!bs.pending_spell || loading) return;
    setLoading(true);
    closeCutin();
    try {
      const { card: cutinCard, instanceId: cutinInstanceId, source, handIdx } = candidate;
      const { caster_id, card_num, from_lrig_deck } = bs.pending_spell;
      const casterIsHost = caster_id === bs.host_id;
      const casterState = casterIsHost ? bs.host_state : bs.guest_state;
      // スペルを処理（打ち消し）: フェゾーネマジック等はゲームから除外＝lrig_trashへ近似、通常スペルはトラッシュへ
      const newCasterState: PlayerState = from_lrig_deck
        ? { ...casterState, lrig_trash: [...casterState.lrig_trash, card_num] }
        : { ...casterState, trash: [...casterState.trash, card_num] };
      // コスト支払い
      const paidNums = [...costIndices].map(i => my.energy[i]);
      const newEnergy = my.energy.filter((_, i) => !costIndices.has(i));
      let cutinPaid: PlayerState;
      if (source === 'lrig_deck') {
        // ルリグデッキから使用: デッキから取り出してルリグトラッシュへ
        const lrigIdx = my.lrig_deck.findIndex(id => getCardNum(id) === cutinCard.CardNum);
        const actualId = lrigIdx >= 0 ? my.lrig_deck[lrigIdx] : cutinCard.CardNum;
        const newLrigDeck = lrigIdx === -1 ? my.lrig_deck
          : [...my.lrig_deck.slice(0, lrigIdx), ...my.lrig_deck.slice(lrigIdx + 1)];
        cutinPaid = {
          ...my,
          lrig_deck: newLrigDeck,
          energy: newEnergy,
          lrig_trash: [...my.lrig_trash, actualId],
          trash: [...my.trash, ...paidNums],
        };
      } else if (source === 'hand') {
        // 手札から自分を捨てる（discardSelfFromHand）
        const idx = handIdx ?? my.hand.indexOf(cutinCard.CardNum);
        const newHand = idx >= 0
          ? [...my.hand.slice(0, idx), ...my.hand.slice(idx + 1)]
          : my.hand;
        cutinPaid = {
          ...my,
          hand: newHand,
          energy: newEnergy,
          trash: [...my.trash, cutinCard.CardNum, ...paidNums],
        };
      } else {
        // lrig_field / signi_field: エナコスト + エクシードコスト（選択カードをlrig_trashへ）
        const exceedCostH = candidate.effect.cost?.exceed ?? 0;
        const exceedPoolH = [
          ...my.field.lrig.slice(0, -1),
          ...(my.field.assist_lrig_l?.slice(0, -1) ?? []),
          ...(my.field.assist_lrig_r?.slice(0, -1) ?? []),
        ];
        const exceedCards = exceedCostH > 0
          ? new Set([...selectedCutinExceed].map(i => exceedPoolH[i]).filter(Boolean))
          : new Set<string>();
        cutinPaid = {
          ...my,
          energy: newEnergy,
          trash: [...my.trash, ...paidNums],
          lrig_trash: [...my.lrig_trash, ...exceedCards],
          field: {
            ...my.field,
            lrig: my.field.lrig.filter(id => !exceedCards.has(id)),
            assist_lrig_l: my.field.assist_lrig_l?.filter(id => !exceedCards.has(id)),
            assist_lrig_r: my.field.assist_lrig_r?.filter(id => !exceedCards.has(id)),
          },
        };
      }
      // カットイン使用・スペル打ち消しログ（カットインは常にスペルを打ち消す）
      const counterSpellName = battleCardMap.get(card_num)?.CardName ?? card_num;
      appendBattleLogs([`[自分] ${cutinCard.CardName}を使用（カットイン）`]);
      appendBattleLogs([`${cutinCard.CardName}：「${counterSpellName}」を打ち消した`]);
      // カットイン効果発火: lrig_deckはACTIVATED、field/handはSPELL_CUTINタイミングのACTIVATEDを優先
      const effects = effectsMap.get(cutinInstanceId) ?? effectsMap.get(getCardNum(cutinInstanceId)) ?? [];
      const cutinEff = source === 'lrig_deck'
        ? effects.find(e => e.effectType === 'ACTIVATED')
        : effects.find(e => e.effectType === 'ACTIVATED' && e.timing?.includes('SPELL_CUTIN'));
      if (!cutinEff) {
        const myKey = isHost ? 'host_state' : 'guest_state';
        const casterKey = casterIsHost ? 'host_state' : 'guest_state';
        if (myKey === casterKey) {
          await supabase.from('battle_states')
            .update({ [myKey]: cutinPaid, pending_spell: null })
            .eq('room_id', roomId);
        } else {
          await supabase.from('battle_states')
            .update({ [myKey]: cutinPaid, [casterKey]: newCasterState, pending_spell: null })
            .eq('room_id', roomId);
        }
        return;
      }
      // ownerState=cutinPaid(me), otherState=newCasterState
      const cutinPowers = calcFieldPowers(cutinPaid, newCasterState, bs.active_user_id === user.id, effectsMap, battleCardMap, bs.turn_phase);
      const cutinIsOwnerTurn = bs.active_user_id === user.id;
      const cutinAllColorSigniNums = new Set([...collectAllColorSigniForField(cutinPaid, battleCardMap, effectsMap, newCasterState, cutinIsOwnerTurn), ...collectAllColorSigniForField(newCasterState, battleCardMap, effectsMap, cutinPaid, !cutinIsOwnerTurn)]);
      const cutinExtraColors = new Map([...collectFieldSigniExtraColors(cutinPaid, battleCardMap, effectsMap, newCasterState, cutinIsOwnerTurn), ...collectFieldSigniExtraColors(newCasterState, battleCardMap, effectsMap, cutinPaid, !cutinIsOwnerTurn)]);
      const cutinDeckTrashLevel1Nums = collectDeckTrashLevel1Nums(cutinPaid, newCasterState, effectsMap);
      const cutinDeclaredCardMap = applyContinuousBaseLevelOverride(applyDeclaredZoneClassOverride(battleCardMap, cutinPaid, newCasterState), cutinPaid, newCasterState, effectsMap, cutinIsOwnerTurn);
      const ctx: ExecCtx = { ownerState: cutinPaid, otherState: newCasterState, cardMap: cutinDeclaredCardMap, logs: [], effectivePowers: cutinPowers, sourceCardNum: cutinInstanceId, allColorSigniNums: cutinAllColorSigniNums, fieldSigniExtraColors: cutinExtraColors, deckTrashLevel1Nums: cutinDeckTrashLevel1Nums };
      let result = executeEffect(cutinEff, ctx);
      result = applyRefreshOnDone(result, battleCardMap); // デッキ0枚→リフレッシュ（スペルカットイン解決後）
      if (result.logs.length > 0) appendBattleLogs(result.logs);
      // myがhost/guestに応じてマッピング
      const hostState  = isHost ? result.ownerState : result.otherState;
      const guestState = isHost ? result.otherState : result.ownerState;
      const update: Record<string, unknown> = { host_state: hostState, guest_state: guestState, pending_spell: null };
      if (!result.done) {
        update.pending_effect = { sourcePlayerId: user.id, sourceCardNum: cutinCard.CardNum, effectId: cutinEff.effectId, interaction: result.pending } satisfies PendingEffect;
      } else {
        update.pending_effect = null;
      }
      await supabase.from('battle_states').update(update).eq('room_id', roomId);
    } finally {
      setLoading(false);
    }
  };

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
        const signiLevel = parseInt(cardData.Level) || 0;
        // レベル制限: シグニLv ≤ ルリグLv
        const levelOk = signiLevel <= currentLrigLevel;
        // リミット制限: 空きゾーンに召喚後の合計レベルがリミット以内であること
        // ＋ LIMIT_ALL_FIELD_N: 場のシグニ体数が上限未満であること（WX04-005-E3「1体しか場に出せない」）
        const myCurrentSigniCount = my.field.signi.filter(stk => (stk ?? []).length > 0).length;
        const canFitSomewhere = myCurrentSigniCount < fieldSigniCountLimit && [0, 1, 2].some(zi => {
          const isEmpty = (my.field.signi[zi] ?? []).length === 0;
          return isEmpty && (fieldSigniTotal + signiLevel) <= lrigLimit;
        });
        // Restriction チェック
        const restrictionOk = meetsRestriction(cardData.Restriction, lrigClass, ignoreRestriction);
        if (levelOk && canFitSomewhere && restrictionOk) {
          actionList.push({
            label: '召喚',
            color: C.success,
            onClick: () => setPendingSigniSummon({ cardNum, handIndex }),
          });
        }
      }
      if (cardData?.Type === 'スペル' && meetsRestriction(cardData.Restriction, lrigClass, ignoreRestriction) &&
          !my.blocked_card_names?.includes(cardData.CardName) &&
          !my.blocked_card_names_game?.includes(cardData.CardName)) {
        // pending_spell がある間は新たにスペルを発動できない
        const spellBlocked = !!bs.pending_spell;
        const spellEff = effectsMap.get(cardNum)?.find(e => e.effectType === 'ACTIVATED');
        const condOk = !spellEff?.condition || evalUseCondition(spellEff.condition, my, op, battleCardMap, cardNum, bs.turn_phase, effectivePowers);
        if (!spellBlocked && condOk) {
          actionList.push({
            label: '発動',
            color: C.accent,
            onClick: () => { openSpellCast({ cardNum, handIndex }); setBetAmount(0); },
          });
        }
      }
    }

    // v0.277: 手札から発動できる【起】（MAIN / ATTACK_ARTS / ATTACK_ARTS_OP フェイズ）
    if (bs.turn_phase === 'MAIN' || bs.turn_phase === 'ATTACK_ARTS' || bs.turn_phase === 'ATTACK_ARTS_OP') {
      const handEffects = effectsMap.get(cardNum) ?? [];
      const phase = bs.turn_phase as string;
      // ATTACK_ARTS_OP（相手ターンのアーツステップ）はタイミング照合で ATTACK_ARTS として扱う
      const timingPhase = (phase === 'ATTACK_ARTS_OP' ? 'ATTACK_ARTS' : phase) as import('../types/effects').EffectTiming;
      for (const eff of handEffects) {
        if (eff.effectType !== 'ACTIVATED') continue;
        if (!eff.handActivated) continue;
        if (!eff.timing?.includes(timingPhase)) continue;
        if (my.actions_done?.includes(eff.effectId)) continue;
        if (eff.usageLimit === 'once_per_game' && my.game_actions_done?.includes(eff.effectId)) continue;
        if (eff.condition && !evalUseCondition(eff.condition, my, op, battleCardMap, cardNum, bs.turn_phase, effectivePowers)) continue;
        // removeOppVirus コスト（WX21-030）: 相手の場のウィルス総数が足りなければ発動不可
        const removeVirusReq = eff.cost?.removeOppVirus ?? 0;
        if (removeVirusReq > 0 && (op.field.signi_virus ?? []).reduce((s, v) => s + v, 0) < removeVirusReq) continue;
        const energyTotal = (eff.cost?.energy ?? []).reduce((s, c) => s + c.count, 0);
        const costLabel = energyTotal > 0 ? `エナ${energyTotal}・手から捨て` : (removeVirusReq > 0 ? `ウィルス${removeVirusReq}除去・手から捨て` : '手から捨て');
        actionList.push({
          label: `【起】${costLabel}`,
          color: '#ff6b35',
          onClick: () => { openHandActivated({ cardNum, handIndex, effect: eff }); },
        });
      }
    }

    return actionList;
  };

  // トラッシュ自己起動【起】（「このシグニをトラッシュから場に出す」等）。トラッシュゾーンUIから発動。
  // 現状はエナコストのみ対応（手札捨て/コイン/エクシード等の複合コストは未対応）。
  const getMyTrashCardActions = (cardNum: string): CardAction[] => {
    if (loading) return [];
    const actions: CardAction[] = [];
    if (!isMyTurn || bs.turn_phase !== 'MAIN') return actions;
    const effs = effectsMap.get(cardNum) ?? [];
    for (const eff of effs) {
      if (!eff.trashActivated || eff.effectType !== 'ACTIVATED') continue;
      if (!eff.timing?.includes('MAIN')) continue;
      if (my.actions_done?.includes(eff.effectId)) continue;
      if (eff.usageLimit === 'once_per_game' && my.game_actions_done?.includes(eff.effectId)) continue;
      if (eff.condition && !evalUseCondition(eff.condition, my, op, battleCardMap, cardNum, bs.turn_phase, effectivePowers)) continue;
      // エナ以外のコストキーがあれば未対応としてスキップ
      const c = eff.cost;
      const hasUnsupportedCost = !!c && Object.entries(c).some(([k, v]) => k !== 'energy' && v);
      if (hasUnsupportedCost) continue;
      const energyTotal = (c?.energy ?? []).reduce((s, e) => s + e.count, 0);
      if (my.energy.length < energyTotal) continue;
      actions.push({
        label: energyTotal > 0 ? `【起】トラッシュから出す（エナ${energyTotal}）` : '【起】トラッシュから出す',
        color: '#ff6b35',
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
    if (!meetsRestriction(cardData.Restriction, lrigClass, ignoreRestriction)) return [];

    const phase = bs.turn_phase;
    const actions: CardAction[] = [];

    // ── スペル/クラフト（フェゾーネマジック）── メインフェイズに手札スペルと同様に使用可能
    if (cardData.Type === 'スペル/クラフト') {
      if (my.blocked_card_names?.includes(cardData.CardName) || my.blocked_card_names_game?.includes(cardData.CardName)) return actions;
      // pending_spell がある間は新たにスペルを発動できない
      const spellBlocked = !!bs.pending_spell;
      const canUse = !isActionBlocked('USE_SPELL') && phase === 'MAIN' && isMyTurn && !spellBlocked;
      // スペル使用条件（手札スペルと同様にACTIVATED効果の condition を評価）
      const spellEff = (effectsMap.get(cardNum) ?? []).find(e => e.effectType === 'ACTIVATED');
      const condOk = !spellEff?.condition || evalUseCondition(spellEff.condition, my, op, battleCardMap, cardNum, bs.turn_phase, effectivePowers);
      // コスト支払い可能か（簡易チェック：エナで賄えるか）
      const costOk = canAffordWithExtraCost(my.energy, battleCards, cardData.Cost, [], my.keyword_grants, myEnaAllMulti, myColorlessOverrides, myColorSubs, myEnergyExtraColors);
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
      // blocked_card_names チェック（ターン内＋ゲーム内 NAME_BAN）
      if (my.blocked_card_names?.includes(cardData.CardName) || my.blocked_card_names_game?.includes(cardData.CardName)) return actions;
      const canUse =
        !isActionBlocked('USE_ARTS') && (
          (phase === 'MAIN'           && isMyTurn  && cardData.Timing.includes('メインフェイズ'))  ||
          (phase === 'ATTACK_ARTS'    && isMyTurn  && cardData.Timing.includes('アタックフェイズ')) ||
          (phase === 'ATTACK_ARTS_OP' && !isMyTurn && cardData.Timing.includes('アタックフェイズ'))
        );
      const extraArtsCosts = activeCostMods.forMy
        .filter(m => m.direction === 'increase' && m.targetCardType === 'アーツ')
        .flatMap(m => m.amount);
      // SPECIFIC_CARD_COST_REDUCE: 特定カード名の無色コスト軽減を適用
      const specificReduction = specificCardCostReductions.find(r => r.targetCardName === cardData.CardName);
      const reducedArtsCost = specificReduction
        ? removeNColorFromCost(cardData.Cost, '無', specificReduction.colorlessReduction)
        : cardData.Cost;
      // 対戦相手ターン中の代替コストがあればそちらを使う
      const artsAltCost = !isMyTurn ? (effectsMap.get(cardNum)?.[0]?.altCostOppTurn) : undefined;
      const effectiveCostStr = artsAltCost ? energyCostToString(artsAltCost) : null;
      const costOk = effectiveCostStr
        ? canAffordGrowCost(my.energy, battleCards, effectiveCostStr, my.keyword_grants, myEnaAllMulti, myColorlessOverrides, myColorSubs, myEnergyExtraColors)
        : canAffordWithExtraCost(my.energy, battleCards, reducedArtsCost, extraArtsCosts, my.keyword_grants, myEnaAllMulti, myColorlessOverrides, myColorSubs, myEnergyExtraColors);
      if (canUse && costOk) {
        actions.push({
          label: '使用',
          color: C.coin,
          onClick: () => {
            openArtsModal(cardData, effectiveCostStr ?? (specificReduction ? reducedArtsCost : null));
          },
        });
      }
    }

    // ── キーピース ──
    // UNLIMITED_KEYS: ルリグにCONT「UNLIMITED_KEYS」があれば何枚でもキーを出せる
    const hasUnlimitedKeys = my.field.lrig.some(ln =>
      (effectsMap.get(ln) ?? []).some(e =>
        e.effectType === 'CONTINUOUS' &&
        (e.action as import('../types/effects').StubAction)?.type === 'STUB' &&
        (e.action as import('../types/effects').StubAction)?.id === 'UNLIMITED_KEYS',
      )
    );
    if ((cardData.Type === 'キー' || cardData.Type === 'ピース') && (!my.field.key_piece || hasUnlimitedKeys)) {
      const timing = cardData.Timing ?? '';
      const canUse =
        (phase === 'MAIN' && isMyTurn && (timing.includes('メインフェイズ') || !timing)) ||
        (phase === 'GROW' && isMyTurn && timing.includes('グロウフェイズ'));
      const coinNeeded = parseCoinCost(cardData.Cost) + parseCoinCost(cardData.GrowCost);
      const canAfford = my.coins >= coinNeeded && canAffordGrowCost(my.energy, battleCards, cardData.Cost, my.keyword_grants, myEnaAllMulti, myColorlessOverrides, myColorSubs);
      if (canUse && canAfford) {
        actions.push({
          label: 'キーにセット',
          color: '#cc8800',
          onClick: () => { openKeyModal(cardData); },
        });
      }
    }

    return actions;
  };

  // ライフクロスを1枚クラッシュし、チェック状態にする
  // returns: crashed=null + prevented=true → ダメージ無効、crashed=null + !prevented → ライフなし（即勝利判定）
  const crashOneLife = (state: PlayerState): { newState: PlayerState; crashed: string | null; prevented?: boolean } => {
    // PREVENT_DAMAGE の scope='ALL' ウィンドウ（「このターン、あなたはダメージを受けない」）＝期間内は回数無制限。
    // バリアトークンや prevent_next_damage を無駄に消費させないため、消費型の無効化より先に判定する。
    if ((state.prevent_damage_windows ?? []).some(w => w.scope === 'ALL')) {
      appendBattleLogs([`ダメージ無効（このターンダメージを受けない）`]);
      return { newState: state, crashed: null, prevented: true };
    }
    if (countBarrierTokens(state.field.free_zone, SIGNI_BARRIER_CARD) > 0) {
      const fz = removeOneBarrierToken(state.field.free_zone, SIGNI_BARRIER_CARD);
      appendBattleLogs([`シグニバリア発動（残${countBarrierTokens(fz, SIGNI_BARRIER_CARD)}）ダメージ無効`]);
      return {
        newState: { ...state, field: { ...state.field, free_zone: fz } },
        crashed: null,
        prevented: true,
      };
    }
    if ((state.prevent_next_damage ?? 0) > 0) {
      return {
        newState: { ...state, prevent_next_damage: (state.prevent_next_damage ?? 0) - 1 },
        crashed: null,
        prevented: true,
      };
    }
    // REPLACE_NEXT_DAMAGE_WITH_MILL: ダメージを「デッキ上N枚トラッシュ」で置き換え（WXDi-P15-041 等）。
    // デッキがN枚未満のエントリは置き換え不可（原文注記「デッキが2枚以下の場合は置き換えられない」）＝スキップ。
    {
      const drm = state.damage_replace_mill ?? [];
      const di = drm.findIndex(n => state.deck.length >= n);
      if (di >= 0) {
        const n = drm[di];
        const milled = state.deck.slice(0, n);
        appendBattleLogs([`ダメージ置換：代わりにデッキの上から${n}枚をトラッシュに置く`]);
        return {
          newState: {
            ...state,
            deck: state.deck.slice(n),
            trash: [...state.trash, ...milled],
            damage_replace_mill: drm.filter((_, i) => i !== di),
          },
          crashed: null,
          prevented: true,
        };
      }
    }
    if (state.life_cloth.length === 0) return { newState: state, crashed: null };
    const crashed = state.life_cloth[state.life_cloth.length - 1];
    return {
      newState: {
        ...state,
        life_cloth: state.life_cloth.slice(0, -1),
        life_crashed_this_turn: (state.life_crashed_this_turn ?? 0) + 1, // LIFE_CRASHED_THIS_TURN 用
        field: { ...state.field, check: crashed },
      },
      crashed,
    };
  };

  // WXDi-P05-069: フリップアタック（ロビンフッドが自シグニを裏向きにしてアタック）
  const handleFlipAttack = async (attackZone: number, flipZones: number[]) => {
    if (!isMyTurn || loading || bs.turn_phase !== 'ATTACK_SIGNI') return;
    setLoading(true);
    try {
      const stateKey = isHost ? 'host_state' : 'guest_state';
      const newSigniDown = [...(my.field.signi_down ?? [false, false, false])];
      const flippedCards: string[] = [];
      for (const zi of flipZones) {
        const top = my.field.signi[zi]?.at(-1);
        if (top && !my.field.signi_down?.[zi]) {
          newSigniDown[zi] = true; // 裏向き = ダウン状態で表現
          flippedCards.push(battleCardMap.get(top)?.CardName ?? top);
        }
      }
      const attackerName = battleCardMap.get(my.field.signi[attackZone]?.at(-1) ?? '')?.CardName ?? '';
      const newMyState: PlayerState = {
        ...my,
        field: { ...my.field, signi_down: newSigniDown as [boolean, boolean, boolean] },
        flip_attack_signi_zones: flipZones,
        attacked_signi_ids: [...(my.attacked_signi_ids ?? []), my.field.signi[attackZone]?.at(-1) ?? ''],
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
          await supabase.from('battle_states')
            .update({ [stateKey]: newMyState, [opKey]: { ...op, life_cloth: op.life_cloth.slice(0, -1), field: { ...op.field, check: crashed } } })
            .eq('room_id', roomId);
          appendBattleLogs([`シグニアタック：ライフクロスをクラッシュ`]);
        } else {
          const opKey = isHost ? 'guest_state' : 'host_state';
          await supabase.from('battle_states').update({ [stateKey]: newMyState, [opKey]: newOtherState }).eq('room_id', roomId);
        }
      } else {
        // 正面にシグニ → バトル（通常アタックへ委譲）
        await supabase.from('battle_states').update({ [stateKey]: newMyState }).eq('room_id', roomId);
        await handleSigniAttack(attackZone);
      }
    } finally { setLoading(false); }
  };

  // シグニアタックのバトル解決（人間・CPU共通）
  // attacker視点で全処理（無効化・キーワード能力・バニッシュ代替/リダイレクト・各種トリガー収集）を行う。
  // 呼び出し元はフェイズ・check待ち・blocked_actionsのガードを行うこと（blockedはここでも弾くが、
  // CPU側はアタッカーがダウンしないと無限ループするため事前に除外が必要）
  const performSigniAttack = async (zoneIndex: number, p: {
    attacker: PlayerState; defender: PlayerState;
    attackerId: string; defenderId: string;
    attackerKey: 'host_state' | 'guest_state';
    targetOpZone?: number; // 【側面アタック】: 正面(2-zoneIndex)ではなく指定した相手シグニゾーンを攻撃。シグニ無ければ何も起きない・ライフダメージなし
  }) => {
    const { attacker: my, defender: op, attackerId, defenderId } = p;
    const attackerIsHost = p.attackerKey === 'host_state';
    setLoading(true);
    try {
      const myTopNum = (my.field.signi[zoneIndex] ?? []).at(-1);
      if (!myTopNum) return;
      // GATE: blocked_actions に 'ATTACK:cardId' があればアタック不可
      if (my.blocked_actions?.includes(`ATTACK:${myTopNum}`)) return;

      const myCardName = battleCardMap.get(myTopNum)?.CardName ?? myTopNum;
      const isSideAttack = p.targetOpZone !== undefined; // 【側面アタック】
      let opZoneIndex = p.targetOpZone ?? (2 - zoneIndex); // 正面ゾーン（表示反転を考慮）／側面アタックは指定ゾーン
      let opStack = op.field.signi[opZoneIndex] ?? [];
      let opTopCardNum: string | null = opStack.length > 0 ? opStack[opStack.length - 1] : null;

      // REDIRECT_ATTACK_TO_SELF_ZONE: 正面が空の場合、このSTUBを持つ相手シグニのゾーンへリダイレクト（側面アタックは対象固定のため対象外）
      if (!opTopCardNum && !isSideAttack) {
        for (let zi = 0; zi < op.field.signi.length; zi++) {
          const top = op.field.signi[zi]?.at(-1);
          if (!top) continue;
          const hasRedir = (effectsMap.get(top) ?? []).some(eff =>
            eff.effectType === 'CONTINUOUS' &&
            (eff.action as import('../types/effects').StubAction).type === 'STUB' &&
            (eff.action as import('../types/effects').StubAction).id === 'REDIRECT_ATTACK_TO_SELF_ZONE',
          );
          if (hasRedir) {
            opZoneIndex = zi;
            opStack = op.field.signi[zi]!;
            opTopCardNum = top;
            appendBattleLogs([`${battleCardMap.get(top)?.CardName ?? top}がアタックをこのゾーンへリダイレクト`]);
            break;
          }
        }
      }

      const myKey = p.attackerKey;
      const opKey = attackerIsHost ? 'guest_state' : 'host_state';

      // 自分のシグニをダウン
      const newSigniDown = [...(my.field.signi_down ?? [false, false, false])];
      newSigniDown[zoneIndex] = true;
      const newAttackedIds = [...(my.attacked_signi_ids ?? []), myTopNum];
      // OPP_SIGNI_ATTACK_COST: アタックにエナコストが必要な場合、エナを消費
      const signiAtkCostSA = my.signi_attack_cost ?? 0;
      const newEnergySA = signiAtkCostSA > 0 ? my.energy.slice(0, -signiAtkCostSA) : my.energy;
      const newMyState: PlayerState = { ...my, field: { ...my.field, signi_down: newSigniDown }, attacked_signi_ids: newAttackedIds, energy: newEnergySA };
      const newOpState = op;

      // NEGATE_NTH_ATTACK: 相手（防御側）がN回目まで自動無効化フラグを持つ場合
      if ((op.negate_opp_signi_attacks_until ?? 0) > 0) {
        const remaining = (op.negate_opp_signi_attacks_until ?? 1) - 1;
        const newOpForNegate: PlayerState = { ...op, negate_opp_signi_attacks_until: remaining > 0 ? remaining : undefined };
        appendBattleLogs([`${myCardName}のアタックは無効化された（残り${remaining}回）`]);
        await supabase.from('battle_states')
          .update({ [myKey]: newMyState, [opKey]: newOpForNegate })
          .eq('room_id', roomId);
        return;
      }
      // NEGATE_THAT_ATTACK: 相手がop.negated_attacksにmyTopNumを登録していた場合、このアタックを無効化
      if ((op.negated_attacks ?? []).includes(myTopNum)) {
        // escapeDiscard（G154 BURST）: アタック側が手札をN枚捨てれば無効化を回避できる。手札が足りればモーダルで選択させる。
        const escapeCount = op.negated_attacks_escape?.[myTopNum];
        if (escapeCount && my.hand.length >= escapeCount) {
          openNegateEscape({ zoneIndex, targetOpZone: p.targetOpZone, cardNum: myTopNum, count: escapeCount });
          setLoading(false);
          return; // アタックを保留してプレイヤーの選択を待つ
        }
        const clearedNA = (op.negated_attacks ?? []).filter(id => id !== myTopNum);
        const escMap0 = { ...(op.negated_attacks_escape ?? {}) }; delete escMap0[myTopNum];
        const newOpNA: PlayerState = { ...op, negated_attacks: clearedNA.length ? clearedNA : undefined, negated_attacks_escape: Object.keys(escMap0).length ? escMap0 : undefined };
        appendBattleLogs([`${myCardName}のアタックは無効化された`]);
        await supabase.from('battle_states')
          .update({ [myKey]: newMyState, [opKey]: newOpNA })
          .eq('room_id', roomId);
        return;
      }

      // ON_ATTACK_SIGNIトリガー収集（Phase 1：バトル前に処理するトリガー）
      // condition を持つ AUTO は発動条件を満たす場合のみ収集（「〜であるかぎり『【自】アタック時…』を得る」系）
      const atkSelfPowers = calcFieldPowers(newMyState, newOpState, true, effectsMap, battleCardMap, bs.turn_phase);
      const attackerCrossOk = isCrossZoneActive(newMyState, myTopNum, battleCardMap);
      const attackEntries: StackEntry[] = (effectsMap.get(myTopNum) ?? [])
        .filter(e => e.effectType === 'AUTO' && e.timing?.includes('ON_ATTACK_SIGNI'))
        .filter(e => !e.crossOnly || attackerCrossOk) // 【クロス自】はアタッカーがクロス状態のときのみ
        .filter(e => !e.kizunaIcon || isKizunaActive(newMyState, myTopNum, battleCardMap)) // 【絆自】は絆獲得時のみ
        .filter(e => !e.condition || evalUseCondition(e.condition, newMyState, newOpState, battleCardMap, myTopNum, bs.turn_phase, atkSelfPowers))
        .map(e => ({
          id: generateUUID(),
          playerId: attackerId,
          cardNum: myTopNum,
          effectId: e.effectId,
          label: `${battleCardMap.get(myTopNum)?.CardName ?? myTopNum} の【自】効果（シグニアタック時）`,
          effect: e,
          triggeringCardNum: myTopNum, // 「それ」= 自身
        } satisfies StackEntry));

      // any_ally scope: 味方フィールドの他シグニが持つON_ATTACK_SIGNIへの応答（例: WX01-029）
      const allyAttackRes = collectFieldTriggers('ON_ATTACK_SIGNI', myTopNum, newMyState, newOpState, attackerId);
      const allyAttackEntries = allyAttackRes.entries;
      // usageLimit（《ターン1回/2回》）消費を actions_done へ永続化（attacker=myState / defender=opState）
      const atkUsedMine = attackerIsHost ? allyAttackRes.usedHostIds : allyAttackRes.usedGuestIds;
      const atkUsedOpp  = attackerIsHost ? allyAttackRes.usedGuestIds : allyAttackRes.usedHostIds;
      const newOpStateAtk: PlayerState = atkUsedOpp.length > 0
        ? { ...newOpState, actions_done: [...(newOpState.actions_done ?? []), ...atkUsedOpp] }
        : newOpState;

      // ON_ATTACK_SIGNIトリガー（防御側：相手シグニがアタックしたとき発動するAUTO効果）
      const opFrontZoneIdx = p.targetOpZone ?? (2 - zoneIndex); // 側面アタックは攻撃先＝指定ゾーン
      const opAtkedEntries: StackEntry[] = [];
      const opPlayerId = defenderId;
      newOpState.field.signi.forEach((opSigniStack, ozi) => {
        const opTopNum = opSigniStack?.at(-1);
        if (!opTopNum) return;
        for (const oe of (effectsMap.get(opTopNum) ?? [])) {
          if (oe.effectType !== 'AUTO') continue;
          // ON_FRONT_SIGNI_ATTACK: 「このシグニの正面のシグニがアタックしたとき」。
          //   正面（opFrontZoneIdx＝アタッカーと向かい合うゾーン）の守備側シグニのみ発火。triggeringCardNum=アタッカー。
          if (oe.timing?.includes('ON_FRONT_SIGNI_ATTACK')) {
            if (ozi !== opFrontZoneIdx) continue;
            if (oe.activeCondition && !checkActiveCondition(oe.activeCondition, newOpState, newMyState, false, battleCardMap, opTopNum)) continue;
            opAtkedEntries.push({
              id: generateUUID(),
              playerId: opPlayerId,
              cardNum: opTopNum,
              effectId: oe.effectId,
              label: `${battleCardMap.get(opTopNum)?.CardName ?? opTopNum} の【自】効果（正面シグニアタック時）`,
              effect: oe,
              triggeringCardNum: myTopNum, // 「それ」= アタッカー（正面のシグニ）
            } satisfies StackEntry);
            continue;
          }
          if (!oe.timing?.includes('ON_ATTACK_SIGNI')) continue;
          const oeAct = oe.action as import('../types/effects').StubAction;
          if (oeAct.type !== 'STUB') continue;
          if (oeAct.id === 'MOVE_TO_OTHER_SIGNI_ZONE') {
            opAtkedEntries.push({
              id: generateUUID(),
              playerId: opPlayerId,
              cardNum: opTopNum,
              effectId: oe.effectId,
              label: `${battleCardMap.get(opTopNum)?.CardName ?? opTopNum} の【自】効果（相手シグニアタック時）`,
              effect: oe,
            } satisfies StackEntry);
          } else if (oeAct.id === 'MOVE_TO_ATTACKER_FRONT') {
            opAtkedEntries.push({
              id: generateUUID(),
              playerId: opPlayerId,
              cardNum: opTopNum,
              effectId: oe.effectId,
              label: `${battleCardMap.get(opTopNum)?.CardName ?? opTopNum} の【自】効果（アタッカー正面移動）`,
              effect: { ...oe, action: { ...oeAct, value: opFrontZoneIdx } },
            } satisfies StackEntry);
          }
        }
      });

      // ON_OPP_SIGNI_ATTACK_DIRECT: 正面が空（=守備側ルリグへの直接アタック）のとき、
      // 守備側ルリグの「コストを払ってアタックを無効にしてもよい」能力をスタックに積んで提示する（WX04-004-E2）。
      // STUB(OPP_DIRECT_ATTACK_NEGATE)が支払い可否判定・選択・アタッカーのキャンセルフラグ設定までを担う。
      // 側面アタックはシグニゾーンへの攻撃で直接アタックではないため対象外。
      if (!opTopCardNum && !isSideAttack) {
        const defLrigTop = newOpState.field.lrig.at(-1);
        if (defLrigTop) {
          for (const de of (effectsMap.get(defLrigTop) ?? effectsMap.get(getCardNum(defLrigTop)) ?? [])) {
            if ((de.effectType !== 'AUTO' && de.effectType !== 'ACTIVATED') || !de.timing?.includes('ON_OPP_SIGNI_ATTACK_DIRECT')) continue;
            opAtkedEntries.push({
              id: generateUUID(),
              playerId: defenderId,
              cardNum: defLrigTop,
              effectId: de.effectId,
              label: `${battleCardMap.get(getCardNum(defLrigTop))?.CardName ?? defLrigTop} の【自】効果（正面が空のアタックを無効化）`,
              effect: de,
            } satisfies StackEntry);
          }
        }
      }

      // ON_SIGNI_DOWN（アタックダウン・タスク16[C]機構①）: アタック宣言でアタッカーがダウンした（byEffect:false＝
      // 「効果によってダウン」限定の watcher は発火しない）。中央 diff はスタック解決のみを通るためここで収集する。
      const downHostSt  = attackerIsHost ? newMyState : newOpStateAtk;
      const downGuestSt = attackerIsHost ? newOpStateAtk : newMyState;
      const atkDownRes = pureCollectSigniDownUpTriggers(mkTrigCtx(), 'ON_SIGNI_DOWN',
        [{ ownerId: attackerId, nums: [myTopNum], byEffect: false }], downHostSt, downGuestSt);
      const atkDownUsedMine = attackerIsHost ? atkDownRes.usedHostIds : atkDownRes.usedGuestIds;
      const atkDownUsedOpp  = attackerIsHost ? atkDownRes.usedGuestIds : atkDownRes.usedHostIds;
      const newOpStateAtkDown: PlayerState = atkDownUsedOpp.length > 0
        ? { ...newOpStateAtk, actions_done: [...(newOpStateAtk.actions_done ?? []), ...atkDownUsedOpp] }
        : newOpStateAtk;

      // バトル解決前にON_ATTACK_SIGNIを処理するため pending_signi_battle をセット（側面アタックは攻撃先ゾーンを保持）
      const newMyStateWithPending: PlayerState = {
        ...newMyState,
        ...(atkUsedMine.length > 0 || atkDownUsedMine.length > 0
          ? { actions_done: [...(newMyState.actions_done ?? []), ...atkUsedMine, ...atkDownUsedMine] } : {}),
        pending_signi_battle: { zoneIndex, ...(isSideAttack ? { targetOpZone: p.targetOpZone } : {}) },
      };

      const allAttackTriggers = [...attackEntries, ...allyAttackEntries, ...opAtkedEntries, ...atkDownRes.entries];
      if (allAttackTriggers.length > 0) {
        const turnPlayerId = bs.active_user_id ?? attackerId;
        const existingStack = bs.effect_stack ?? null;
        const stack = existingStack
          ? pushToStack(existingStack, allAttackTriggers)
          : initStack(turnPlayerId, allAttackTriggers);
        await supabase.from('battle_states')
          .update({ [myKey]: newMyStateWithPending, [opKey]: newOpStateAtkDown, effect_stack: stack })
          .eq('room_id', roomId);
      } else {
        await supabase.from('battle_states')
          .update({ [myKey]: newMyStateWithPending, [opKey]: newOpStateAtkDown })
          .eq('room_id', roomId);
      }
    } finally {
      setLoading(false);
    }
  };

  // パワー0以下でバニッシュされるべきシグニ（候補）を収集する。
  // checkAndBanishPowerZero と同じ判定ロジックを共有し、バトル解決を遅延させる判定に使う。
  const collectPowerZeroBanishCandidates = (hostState: PlayerState, guestState: PlayerState): string[] => {
    const isMyTurnLocal = bs?.active_user_id === bs?.host_id;
    const powers = calcFieldPowers(hostState, guestState, isMyTurnLocal, effectsMap, battleCardMap, bs.turn_phase);
    const candidates: string[] = [];
    for (const ownerIsHost of [true, false]) {
      const ownerState = ownerIsHost ? hostState : guestState;
      const opStateP0 = ownerIsHost ? guestState : hostState;
      const isOwnerTurnP0 = ownerIsHost ? isMyTurnLocal : !isMyTurnLocal;
      const grants = ownerState.keyword_grants;
      const grantsOppTurn = ownerState.keyword_grants_until_opp_turn;
      const banishProtected = collectBanishEffectProtectedSigni(ownerState, opStateP0, isOwnerTurnP0, effectsMap, battleCardMap);
      for (const stack of ownerState.field.signi) {
        if (!stack?.length) continue;
        const topNum = stack[stack.length - 1];
        const rawPower = battleCardMap.get(topNum)?.Power;
        const power = powers.get(topNum) ?? (rawPower === '∞' ? Infinity : parseInt(rawPower ?? '0', 10));
        if (isNaN(power) || power > 0) continue;
        if (banishProtected.has(topNum)) continue;
        if (hasBanishResist(topNum, battleCardMap, grants, grantsOppTurn)) continue;
        candidates.push(topNum);
      }
    }
    return candidates;
  };

  // シグニアタック バトル解決（ON_ATTACK_SIGNI処理後に呼ばれるPhase 2）
  // 汎用版（myS/opSをパラメータとして受け取り、人間・CPU両方に対応）
  const resolvePendingSigniBattleFor = async (
    myS: PlayerState,
    opS: PlayerState,
    myKey: 'host_state' | 'guest_state',
    attackerId: string,
    defenderId: string,
  ) => {
    if (!myS.pending_signi_battle) return;
    if (loading) return;
    const { zoneIndex, targetOpZone } = myS.pending_signi_battle;
    const isSideAttack = targetOpZone !== undefined; // 【側面アタック】: 指定ゾーンを攻撃・ライフダメージなし
    const opKey = myKey === 'host_state' ? 'guest_state' : 'host_state';
    const attackerIsHost = myKey === 'host_state';
    setLoading(true);
    try {
      const myTopNum = (myS.field.signi[zoneIndex] ?? []).at(-1);
      if (!myTopNum) {
        await supabase.from('battle_states')
          .update({ [myKey]: { ...myS, pending_signi_battle: undefined } })
          .eq('room_id', roomId);
        return;
      }
      const myCardName = battleCardMap.get(myTopNum)?.CardName ?? myTopNum;

      // NEGATE_ATTACK_ON_TRIGGER: アタックキャンセルフラグがあればバトル/ダメージを全てスキップ
      if (myS.cancel_current_signi_attack) {
        const clearedState: PlayerState = { ...myS, pending_signi_battle: undefined, cancel_current_signi_attack: undefined };
        await supabase.from('battle_states').update({ [myKey]: clearedState }).eq('room_id', roomId);
        appendBattleLogs([`${myCardName}のアタックが無効になった`]);
        return;
      }

      // バトルはすべての処理（パワー0以下バニッシュ等のルール処理）が完了してから行う。
      // ON_ATTACK_SIGNIでパワーを0にされたシグニ等が場に残っている場合は、先に
      // checkAndBanishPowerZero にバニッシュさせるため、ここでは解決を遅延する。
      // pending_signi_battle は保持されたままなので、バニッシュ完了後に本関数が再度呼ばれる。
      {
        const hostStateForP0 = attackerIsHost ? myS : opS;
        const guestStateForP0 = attackerIsHost ? opS : myS;
        if (collectPowerZeroBanishCandidates(hostStateForP0, guestStateForP0).length > 0) {
          return;
        }
      }

      let opZoneIndex = targetOpZone ?? (2 - zoneIndex); // 側面アタックは指定ゾーン
      let opStack = opS.field.signi[opZoneIndex] ?? [];
      let opTopCardNum: string | null = opStack.length > 0 ? opStack[opStack.length - 1] : null;
      let opTopCard = opTopCardNum ? battleCardMap.get(opTopCardNum) : null;

      // REDIRECT_ATTACK_TO_SELF_ZONE（側面アタックは対象固定のため対象外）
      if (!opTopCardNum && !isSideAttack) {
        for (let zi = 0; zi < opS.field.signi.length; zi++) {
          const top = opS.field.signi[zi]?.at(-1);
          if (!top) continue;
          const hasRedir = (effectsMap.get(top) ?? []).some(eff =>
            eff.effectType === 'CONTINUOUS' &&
            (eff.action as import('../types/effects').StubAction).type === 'STUB' &&
            (eff.action as import('../types/effects').StubAction).id === 'REDIRECT_ATTACK_TO_SELF_ZONE',
          );
          if (hasRedir) {
            opZoneIndex = zi;
            opStack = opS.field.signi[zi]!;
            opTopCardNum = top;
            opTopCard = battleCardMap.get(top) ?? null;
            appendBattleLogs([`${battleCardMap.get(top)?.CardName ?? top}がアタックをこのゾーンへリダイレクト`]);
            break;
          }
        }
      }

      // pending_signi_battle をクリアしたmyStateを基点とする
      const newMyState: PlayerState = { ...myS, pending_signi_battle: undefined };
      let newOpState: PlayerState = opS;
      // ON_SIGNI_DAMAGE: このアタックで実際に相手ライフをクラッシュ（ダメージを与えた）か
      let dealtSigniDamage = false;
      let banishedOpCardNum: string | null = null;
      let banishedOpUnderCards: string[] = [];

      // タスク12(xliv)(a)：BANISH_REDIRECT の target.filter（レベル/凍結/感染/チャーム限定）を評価するため、
      // 被バニッシュシグニの属性を除去前の opS 盤面から取る（凍結/チャーム/感染はゾーン添字状態＝バニッシュ後は消える）。
      const banishedOpAttrsOf = (cardNum: string | null) => {
        if (!cardNum) return undefined;
        const zi = opS.field.signi.findIndex(s => s?.at(-1) === cardNum);
        if (zi < 0) return undefined;
        const base = parseInt(battleCardMap.get(cardNum)?.Level ?? '', 10);
        const level = isNaN(base) ? undefined
          : base + (opS.temp_level_mods ?? []).filter(m => m.cardNum === cardNum).reduce((s, m) => s + m.delta, 0);
        return {
          level,
          frozen: (opS.field.signi_frozen?.[zi] ?? false),
          hasCharm: (opS.field.signi_charms?.[zi] ?? null) !== null,
          infected: (opS.field.signi_virus?.[zi] ?? 0) > 0,
        };
      };

      // キーワード能力確認
      const myGrants = myS.keyword_grants;
      const myArmoredNums = new Set(
        myS.field.signi.flatMap((stack, i) =>
          (myS.field.signi_armor?.[i] && stack?.at(-1)) ? [stack.at(-1)!] : [],
        ),
      );
      const contGrantedKeywords = new Set<string>();
      for (const stack of myS.field.signi) {
        if (!stack?.length) continue;
        const sourceNum = stack[stack.length - 1];
        for (const eff of (effectsMap.get(sourceNum) ?? [])) {
          if (eff.effectType !== 'CONTINUOUS') continue;
          const gkAction = eff.action.type === 'GRANT_KEYWORD' ? eff.action : null;
          if (!gkAction || (gkAction as import('../types/effects').GrantKeywordAction).target.count !== 'ALL') continue;
          const gkA = gkAction as import('../types/effects').GrantKeywordAction;
          if (gkA.target.filter?.isArmored && !myArmoredNums.has(myTopNum)) continue;
          if (gkA.target.filter?.isArmored === false && myArmoredNums.has(myTopNum)) continue;
          contGrantedKeywords.add(gkA.keyword);
        }
      }
      if (myS.lrig_riding_signi?.includes(myTopNum)) {
        const myLrigTopForDrive = myS.field.lrig.at(-1);
        if (myLrigTopForDrive) {
          const hasDriveDoubleCrash = (effectsMap.get(myLrigTopForDrive) ?? []).some(eff =>
            eff.effectType === 'CONTINUOUS' &&
            (eff.action as import('../types/effects').StubAction).type === 'STUB' &&
            (eff.action as import('../types/effects').StubAction).id === 'DRIVE_SIGNI_POWER_DOUBLE_CRASH',
          );
          if (hasDriveDoubleCrash) contGrantedKeywords.add('ダブルクラッシュ');
        }
      }
      for (const eff of (effectsMap.get(myTopNum) ?? [])) {
        if (eff.effectType !== 'CONTINUOUS' || !eff.activeCondition) continue;
        if (eff.action.type !== 'GRANT_KEYWORD') continue;
        if (checkActiveCondition(eff.activeCondition, myS, opS, true, battleCardMap, myTopNum, effectivePowers)) {
          contGrantedKeywords.add((eff.action as import('../types/effects').GrantKeywordAction).keyword);
        }
      }
      const myZoneIdx = myS.field.signi.findIndex(s => s?.at(-1) === myTopNum);
      if (myZoneIdx >= 0) {
        const acceNum = myS.field.signi_acce?.[myZoneIdx] ?? null;
        if (acceNum) {
          for (const eff of (effectsMap.get(acceNum) ?? [])) {
            if (eff.effectType !== 'CONTINUOUS') continue;
            if (eff.activeCondition && eff.activeCondition.type !== 'IS_SELF_ACCE_CARD') continue;
            const gkA = eff.action.type === 'GRANT_KEYWORD'
              ? eff.action as import('../types/effects').GrantKeywordAction
              : null;
            if (!gkA) continue;
            if (gkA.target.owner === 'any' || gkA.target.owner === 'opponent') {
              const hostCard = battleCardMap.get(myTopNum);
              if (!hostCard) continue;
              if (gkA.target.filter?.story) {
                const stories = Array.isArray(gkA.target.filter.story)
                  ? gkA.target.filter.story
                  : [gkA.target.filter.story];
                if (!stories.some(s => hostCard.CardClass?.includes(s))) continue;
              }
              if (gkA.target.filter?.cardType && hostCard.Type !== gkA.target.filter.cardType) continue;
              contGrantedKeywords.add(gkA.keyword);
            }
          }
        }
      }
      const hasGrantedKeyword = (kw: string) =>
        // REMOVE_ABILITIES で能力を失っているシグニは印字・付与いずれのキーワードも持たない（G085 等）
        !myS.abilities_removed?.includes(myTopNum) &&
        (hasKeyword(myTopNum, kw, battleCardMap, myGrants, undefined, myS.keyword_grants_until_opp_turn, myS.field_keyword_grants_active, myS.abilities_removed) || contGrantedKeywords.has(kw));
      const isAssassin    = hasGrantedKeyword('アサシン');
      const isLancer      = hasGrantedKeyword('ランサー');
      const isSLancer     = hasGrantedKeyword('Sランサー');
      const isDoubleCrush = hasGrantedKeyword('ダブルクラッシュ');
      const isShoot       = hasGrantedKeyword('シュート');

      // アサシン：正面シグニを無視してライフへ直接アタック
      // NO_BATTLE_DEFENDER: 防御シグニが「バトルしない」CONTINUOUS効果を持つ場合もライフへ直接アタック
      const hasNoBattleDefender = opTopCardNum !== null && (effectsMap.get(opTopCardNum) ?? []).some(eff =>
        eff.effectType === 'CONTINUOUS' &&
        eff.action.type === 'STUB' &&
        (eff.action as import('../types/effects').StubAction).id === 'NO_BATTLE_DEFENDER',
      );
      if (hasNoBattleDefender && opTopCardNum) {
        appendBattleLogs([`${battleCardMap.get(opTopCardNum)?.CardName ?? opTopCardNum}はバトルしない（ダメージは受ける）`]);
      }
      // 側面アタック: シグニゾーンへの攻撃。アサシン等の直接アタック化は無視し、シグニがいればバトル・いなければ何もしない。
      const effectivelyEmpty = isSideAttack ? !opTopCardNum : (!opTopCardNum || isAssassin || hasNoBattleDefender);

      if (!effectivelyEmpty && opTopCardNum && opTopCard) {
        // ─── 通常バトル（正面シグニあり・アサシンなし）───
        const opCardName = opTopCard.CardName ?? opTopCardNum;
        const myPower = effectivePowers.get(myTopNum)
          ?? parsePowerVal(battleCardMap.get(myTopNum)?.Power);
        const opPower = effectivePowers.get(opTopCardNum)
          ?? parsePowerVal(opTopCard.Power);
        appendBattleLogs([`${myCardName}（${myPower}）vs ${opCardName}（${opPower}）`]);

        if (myPower >= opPower) {
          // バトル勝利：相手シグニをバニッシュ（チャームがあればトラッシュへ）
          const newOpDown   = [...(opS.field.signi_down   ?? [false, false, false])];
          const newOpFrozen = [...(opS.field.signi_frozen  ?? [false, false, false])];
          const newOpCharms = [...(opS.field.signi_charms  ?? [null, null, null])];
          const newOpAcce   = [...(opS.field.signi_acce    ?? [null, null, null])];
          const wasOpFrozen = newOpFrozen[opZoneIndex] ?? false;

          // ─── F-3 BANISH_SUBSTITUTE: バトルバニッシュの任意身代わり置換 ───
          // victim = opTopCardNum（バトル防御シグニ）。防御側に身代わりがあれば対話（人間）/ヒューリスティック（CPU）で適用。
          // option=sacrifice: 別シグニを代わりにバニッシュ / option=pay_cost: コストを払って victim を残す。
          let f3SacrificeNum: string | null = null;
          let f3PayCost: { sourceNum: string; costType: 'discardSpell' | 'trashStackSpell'; amount: number } | null = null;
          {
            const f3Decision = opS.banish_substitute_choice;
            const f3DecidedForVictim = !!f3Decision && f3Decision.victimNum === opTopCardNum;
            const applyOption = (o: import('../types').BanishSubstituteOptionState) => {
              if (o.kind === 'sacrifice') f3SacrificeNum = o.sacrificeNum;
              else f3PayCost = { sourceNum: o.sourceNum, costType: o.costType, amount: o.amount };
            };
            if (!f3DecidedForVictim) {
              if (opS.pending_banish_substitute) {
                // 防御側の決定待ち中。再入してもここで停止（決定で再開）。
                return;
              }
              const f3Opts = opTopCardNum
                ? collectBanishSubstitutes(opS, myS, false, battleCardMap, effectsMap, opTopCardNum)
                : [];
              if (f3Opts.length > 0) {
                if (defenderId === CPU_PLAYER_ID) {
                  // CPU ヒューリスティック: コスト払い型を優先（victim を残せて損失が小さい）。
                  // 犠牲型は「犠牲シグニのパワー <= victim」のときだけ使う（弱いものを守る自己犠牲は見送り）。
                  const f3PowerOf = (n: string) => effectivePowers.get(n) ?? parsePowerVal(battleCardMap.get(n)?.Power);
                  const pay = f3Opts.find(o => o.kind === 'pay_cost');
                  const sac = f3Opts.filter(o => o.kind === 'sacrifice')
                    .sort((a, b) => f3PowerOf((a as { sacrificeNum: string }).sacrificeNum) - f3PowerOf((b as { sacrificeNum: string }).sacrificeNum))[0];
                  if (pay) applyOption(pay);
                  else if (sac && opTopCardNum && f3PowerOf((sac as { sacrificeNum: string }).sacrificeNum) <= f3PowerOf(opTopCardNum)) applyOption(sac);
                } else {
                  // 人間防御側に対話プロンプトを提示（中断）。攻撃側 myS.pending_signi_battle は保持して再入で再開。
                  await supabase.from('battle_states')
                    .update({ [opKey]: { ...opS, pending_banish_substitute: { victimNum: opTopCardNum!, options: f3Opts } } })
                    .eq('room_id', roomId);
                  appendBattleLogs([`${opCardName}のバニッシュに身代わりの選択を待っています`]);
                  return;
                }
              }
            } else if (f3Decision?.option) {
              applyOption(f3Decision.option);
            }
          }
          const f3SubstituteApplied = f3SacrificeNum != null || f3PayCost != null;

          // BATTLE_LEAVE_REPLACE_WITH_DOWN: アップ状態のシグニはバニッシュ代わりにダウン（任意→自動適用）
          const opSigniWasUp = !(opS.field.signi_down?.[opZoneIndex] === true);
          const leaveReplaceDown = opSigniWasUp && (effectsMap.get(opTopCardNum ?? '') ?? []).some(eff =>
            eff.effectType === 'CONTINUOUS' &&
            (eff.action as import('../types/effects').StubAction).type === 'STUB' &&
            (eff.action as import('../types/effects').StubAction).id === 'BATTLE_LEAVE_REPLACE_WITH_DOWN',
          );
          // BATTLE_LEAVE_REPLACE_DOWN_TRASH_UNDER_ENERGY (WXDi-P06-034): バニッシュ代わりに
          // アップ状態のこのシグニをダウンし、下から1枚＋エナから1枚をトラッシュして場に残る（払えるなら自動適用）。
          const leaveReplaceDownTUE = opSigniWasUp &&
            (opS.field.signi[opZoneIndex]?.length ?? 0) >= 2 &&   // 下にカードが1枚以上
            opS.energy.length >= 1 &&
            (effectsMap.get(opTopCardNum ?? '') ?? []).some(eff =>
              eff.effectType === 'CONTINUOUS' &&
              (eff.action as import('../types/effects').StubAction).type === 'STUB' &&
              (eff.action as import('../types/effects').StubAction).id === 'BATTLE_LEAVE_REPLACE_DOWN_TRASH_UNDER_ENERGY' &&
              checkActiveCondition(eff.activeCondition, opS, myS, false, battleCardMap, opTopCardNum ?? ''),
            );
          if (f3SubstituteApplied && f3SacrificeNum) {
            // 身代わり置換: victim は場に残り、代わりに f3SacrificeNum をバニッシュ（通常どおりエナへ／チャーム・アクセはトラッシュ）
            const sacZone = opS.field.signi.findIndex(s => s?.at(-1) === f3SacrificeNum);
            const sacStack = sacZone >= 0 ? (opS.field.signi[sacZone] ?? []) : [];
            banishedOpCardNum = f3SacrificeNum;
            banishedOpUnderCards = sacStack.slice(0, -1);
            const f3Signi = [...opS.field.signi] as (string[] | null)[];
            const f3Extra: string[] = [];
            if (sacZone >= 0) {
              f3Signi[sacZone] = null;
              newOpDown[sacZone] = false;
              newOpFrozen[sacZone] = false;
              if (newOpCharms[sacZone]) { f3Extra.push(newOpCharms[sacZone]!); newOpCharms[sacZone] = null; }
              if (newOpAcce[sacZone])   { f3Extra.push(newOpAcce[sacZone]!);   newOpAcce[sacZone]   = null; }
            }
            newOpState = {
              ...opS,
              energy: [...opS.energy, ...sacStack],
              trash: f3Extra.length > 0 ? [...opS.trash, ...f3Extra] : opS.trash,
              field: { ...opS.field, signi: f3Signi, signi_down: newOpDown, signi_frozen: newOpFrozen, signi_charms: newOpCharms, signi_acce: newOpAcce },
              banish_substitute_choice: undefined, pending_banish_substitute: undefined,
            };
            appendBattleLogs([`身代わり：${opCardName}の代わりに${battleCardMap.get(f3SacrificeNum)?.CardName ?? f3SacrificeNum}をバニッシュ`]);
          } else if (f3SubstituteApplied && f3PayCost) {
            // コスト払い型: victim は場に残り、誰もバニッシュされない（コストを支払う）
            const pc = f3PayCost as { sourceNum: string; costType: 'discardSpell' | 'trashStackSpell'; amount: number };
            const isSpellCard = (n: string) => battleCardMap.get(getCardNum(n))?.Type === 'スペル';
            if (pc.costType === 'discardSpell') {
              // 手札からスペルを amount 枚（先頭から）トラッシュへ
              const picked: string[] = [];
              const restHand: string[] = [];
              for (const h of opS.hand) { if (picked.length < pc.amount && isSpellCard(h)) picked.push(h); else restHand.push(h); }
              newOpState = { ...opS, hand: restHand, trash: [...opS.trash, ...picked], banish_substitute_choice: undefined, pending_banish_substitute: undefined };
              appendBattleLogs([`身代わり：手札からスペル${picked.length}枚を捨てて${opCardName}のバニッシュを回避`]);
            } else {
              // このシグニ（sourceNum）の下からスペルを amount 枚トラッシュへ。トップと残りは維持。
              const srcZone = opS.field.signi.findIndex(s => s?.at(-1) === pc.sourceNum);
              const stack = srcZone >= 0 ? (opS.field.signi[srcZone] ?? []) : [];
              const top = stack.at(-1);
              const under = stack.slice(0, -1);
              const trashed: string[] = [];
              const keptUnder: string[] = [];
              for (const u of under) { if (trashed.length < pc.amount && isSpellCard(u)) trashed.push(u); else keptUnder.push(u); }
              const f3Signi = [...opS.field.signi] as (string[] | null)[];
              if (srcZone >= 0 && top) f3Signi[srcZone] = [...keptUnder, top];
              newOpState = { ...opS, trash: [...opS.trash, ...trashed], field: { ...opS.field, signi: f3Signi }, banish_substitute_choice: undefined, pending_banish_substitute: undefined };
              appendBattleLogs([`身代わり：${battleCardMap.get(pc.sourceNum)?.CardName ?? pc.sourceNum}の下からスペル${trashed.length}枚をトラッシュして${opCardName}のバニッシュを回避`]);
            }
          } else if (leaveReplaceDown) {
            newOpDown[opZoneIndex] = true;
            newOpFrozen[opZoneIndex] = false;
            const newOpSigniLRD = [...opS.field.signi] as (string[] | null)[];
            newOpState = { ...opS, field: { ...opS.field, signi: newOpSigniLRD, signi_down: newOpDown, signi_frozen: newOpFrozen, signi_charms: newOpCharms, signi_acce: newOpAcce } };
            appendBattleLogs([`${opCardName}（場離れ→ダウン代替）バニッシュ回避してダウン`]);
          } else if (leaveReplaceDownTUE) {
            newOpDown[opZoneIndex] = true;
            newOpFrozen[opZoneIndex] = false;
            const stackTUE = opS.field.signi[opZoneIndex] ?? [];
            const trashedUnderTUE = stackTUE[0];          // 下から1枚（最下のカード）
            const remainingStackTUE = stackTUE.slice(1);  // 残り（トップシグニを含む）
            const trashedEnergyTUE = opS.energy[0];       // エナから1枚（自動・先頭）
            const newOpSigniTUE = [...opS.field.signi] as (string[] | null)[];
            newOpSigniTUE[opZoneIndex] = remainingStackTUE;
            newOpState = {
              ...opS,
              energy: opS.energy.slice(1),
              trash: [...opS.trash, trashedUnderTUE, trashedEnergyTUE],
              field: { ...opS.field, signi: newOpSigniTUE, signi_down: newOpDown, signi_frozen: newOpFrozen, signi_charms: newOpCharms, signi_acce: newOpAcce },
            };
            appendBattleLogs([`${opCardName}（バニッシュ代替）ダウン＋下1枚＋エナ1枚をトラッシュしてバニッシュ回避`]);
          } else {
          // COOKING_BANISH_SUBSTITUTE: 調理シグニにアクセがある場合、アクセをトラッシュしてバニッシュ回避
          // （防御側から見て相手ターンのみ＝アタックは常にアタッカーのターンなので常に該当）
          const opTopCardClass = opTopCardNum ? (battleCardMap.get(opTopCardNum)?.CardClass ?? '') : '';
          const cookingBanishSub = opTopCardClass.includes('調理') &&
            (opS.field.signi_acce?.[opZoneIndex] ?? null) !== null &&
            opS.field.signi.some(stack => {
              const top = stack?.at(-1);
              return top && (effectsMap.get(top) ?? []).some(eff =>
                eff.effectType === 'CONTINUOUS' &&
                (eff.action as import('../types/effects').StubAction).type === 'STUB' &&
                (eff.action as import('../types/effects').StubAction).id === 'COOKING_BANISH_SUBSTITUTE' &&
                checkActiveCondition(eff.activeCondition, opS, myS, false, battleCardMap, top),
              );
            });
          // CHARM_PROTECTION（WX04-052-E1）: ＜悪魔＞のシグニにチャームがある場合、チャーム1枚をトラッシュしてバニッシュ回避
          const charmShieldBattle = opTopCardNum != null &&
            (opS.field.signi_charms?.[opZoneIndex] ?? null) !== null &&
            collectCharmShieldSigni(opS, myS, false, effectsMap, battleCardMap).has(opTopCardNum);
          if (charmShieldBattle) {
            const charmTrashCS = newOpCharms[opZoneIndex]!;
            newOpCharms[opZoneIndex] = null;
            newOpFrozen[opZoneIndex] = false;
            const newOpSigniCS = [...opS.field.signi] as (string[] | null)[];
            newOpState = { ...opS, trash: [...opS.trash, charmTrashCS], field: { ...opS.field, signi: newOpSigniCS, signi_down: newOpDown, signi_frozen: newOpFrozen, signi_charms: newOpCharms, signi_acce: newOpAcce } };
            appendBattleLogs([`${opCardName}（チャーム盾）【チャーム】をトラッシュしてバニッシュ回避`]);
          } else if (cookingBanishSub) {
            const acceTrash = newOpAcce[opZoneIndex]!;
            newOpAcce[opZoneIndex] = null;
            newOpFrozen[opZoneIndex] = false;
            const newOpSigniCBS = [...opS.field.signi] as (string[] | null)[];
            newOpState = { ...opS, trash: [...opS.trash, acceTrash], field: { ...opS.field, signi: newOpSigniCBS, signi_down: newOpDown, signi_frozen: newOpFrozen, signi_charms: newOpCharms, signi_acce: newOpAcce } };
            appendBattleLogs([`${opCardName}（調理バニッシュ代替）アクセをトラッシュしてバニッシュ回避`]);
          } else if (newOpAcce[opZoneIndex] && (effectsMap.get(newOpAcce[opZoneIndex]!) ?? []).some(eff =>
            eff.effectType === 'CONTINUOUS' &&
            (eff.action as import('../types/effects').StubAction).type === 'STUB' &&
            (eff.action as import('../types/effects').StubAction).id === 'ACCE_BANISH_SUBSTITUTE')) {
            // ACCE_BANISH_SUBSTITUTE: アクセをゲームから除外してシグニをダウン（バニッシュ回避）
            const exiledAcce = newOpAcce[opZoneIndex]!;
            newOpAcce[opZoneIndex] = null;
            newOpDown[opZoneIndex] = true;
            newOpFrozen[opZoneIndex] = false;
            const newOpSigniABS = [...opS.field.signi] as (string[] | null)[];
            newOpState = { ...opS, trash: [...opS.trash, exiledAcce], field: { ...opS.field, signi: newOpSigniABS, signi_down: newOpDown, signi_frozen: newOpFrozen, signi_charms: newOpCharms, signi_acce: newOpAcce } };
            appendBattleLogs([`${opCardName}（アクセ代替バニッシュ）アクセをゲームから除外してダウン`]);
          } else if (newOpAcce[opZoneIndex] && (effectsMap.get(newOpAcce[opZoneIndex]!) ?? []).some(eff =>
            eff.effectType === 'CONTINUOUS' &&
            (eff.action as import('../types/effects').StubAction).type === 'STUB' &&
            (eff.action as import('../types/effects').StubAction).id === 'ACCE_BANISH_SELF_TRASH')) {
            // ACCE_BANISH_SELF_TRASH（WXK04-031 メレドール）: 代わりにアクセ（このカード）をトラッシュに置きバニッシュ回避。
            // シグニはダウンせずそのまま場に残る（バニッシュを丸ごとアクセの離脱で置換）。
            const trashedAcce = newOpAcce[opZoneIndex]!;
            newOpAcce[opZoneIndex] = null;
            newOpFrozen[opZoneIndex] = false;
            const newOpSigniABT = [...opS.field.signi] as (string[] | null)[];
            newOpState = { ...opS, trash: [...opS.trash, trashedAcce], field: { ...opS.field, signi: newOpSigniABT, signi_down: newOpDown, signi_frozen: newOpFrozen, signi_charms: newOpCharms, signi_acce: newOpAcce } };
            appendBattleLogs([`${opCardName}（アクセ代替バニッシュ）アクセをトラッシュしてバニッシュ回避`]);
          } else {
            // RESONANCE_LEAVE_SELF_TRASH_SUBSTITUTE: 宇宙レゾナ場離れを代替シグニのトラッシュで回避
            const opTopCardData = opTopCardNum ? battleCardMap.get(opTopCardNum) : null;
            const resonaSubCardNum = (opTopCardData?.Type === 'レゾナ' && (opTopCardData?.CardClass ?? '').includes('宇宙'))
              ? (() => {
                  for (const stack of opS.field.signi) {
                    const top = stack?.at(-1);
                    if (!top || top === opTopCardNum) continue;
                    const hasRLSSS = (effectsMap.get(top) ?? []).some(eff =>
                      eff.effectType === 'CONTINUOUS' &&
                      (eff.action as import('../types/effects').StubAction).type === 'STUB' &&
                      (eff.action as import('../types/effects').StubAction).id === 'RESONANCE_LEAVE_SELF_TRASH_SUBSTITUTE' &&
                      checkActiveCondition(eff.activeCondition, opS, myS, false, battleCardMap, top),
                    );
                    if (hasRLSSS) return top;
                  }
                  return null;
                })()
              : null;
            if (resonaSubCardNum) {
              // 代替シグニをトラッシュ、レゾナを場に残す
              const subRemoved = removeFromField(resonaSubCardNum, { ...opS, field: { ...opS.field, signi_down: newOpDown, signi_frozen: newOpFrozen, signi_charms: newOpCharms, signi_acce: newOpAcce } });
              newOpState = { ...subRemoved, trash: [...subRemoved.trash, resonaSubCardNum] };
              appendBattleLogs([`${opCardName}（レゾナ離脱代替）${battleCardMap.get(resonaSubCardNum)?.CardName ?? resonaSubCardNum}をトラッシュしてレゾナをフィールドに残す`]);
            } else {
          banishedOpCardNum = opTopCardNum;
          banishedOpUnderCards = (opS.field.signi[opZoneIndex] ?? []).slice(0, -1);
          const newOpSigni = [...opS.field.signi] as (string[] | null)[];
          newOpSigni[opZoneIndex] = null;
          newOpDown[opZoneIndex]   = false;
          newOpFrozen[opZoneIndex] = false;
          const banishExtraTrash: string[] = [];
          if (newOpCharms[opZoneIndex]) { banishExtraTrash.push(newOpCharms[opZoneIndex]!); newOpCharms[opZoneIndex] = null; }
          if (newOpAcce[opZoneIndex])   { banishExtraTrash.push(newOpAcce[opZoneIndex]!);   newOpAcce[opZoneIndex]   = null; }
          // ウィルスはゾーンに属するため、シグニがバニッシュされても除去しない
          // 状態フラグ（ACTIVATEDで設定済み）またはCONTINUOUS BANISH_REDIRECT効果（activeCondition評価込み）
          const redirectBanish =
            isShoot ||
            myS.banish_redirect === true ||
            // bySource 付き（このシグニとの/による）＝そのシグニ自身がバトル当事者のときだけ（続き217）
            (myS.banish_redirect_by_source_nums ?? []).includes(myTopNum) ||
            myS.field.signi.some(s => {
              const n = s?.at(-1);
              // bySource（「このシグニとのバトルによって」等）付きは、バトル当事者＝myTopNum のときだけ適用
              // 被バニッシュシグニ＝opTopCardNum。target.filter（レベル/凍結/感染/チャーム）で絞る（タスク12(xliv)(a)）。
              return n && (effectsMap.get(n) ?? []).some(e =>
                e.effectType === 'CONTINUOUS' &&
                banishRedirectAppliesFrom(e.action, n, myTopNum, banishedOpAttrsOf(opTopCardNum)) &&
                checkActiveCondition(e.activeCondition, myS, opS, true, battleCardMap, n, effectivePowers),
              );
            });
          const redirectBanishToHand = myS.banish_redirect_to_hand === true;
          // BANISH_REDIRECT redirectTo:'exile'（SPDi47-05）: エナの代わりにゲームから除外（どのゾーンにも置かない）
          const redirectBanishToExile = !redirectBanish && !redirectBanishToHand && myS.banish_redirect_to_exile === true;
          // BANISH_BY_SELF_GOES_TO_TRASH: この攻撃シグニが banish_to_trash_by_self を持つ場合、バニッシュ先はトラッシュ
          // 状態フラグ（ACTIVATEDで設定済み）またはCONTINUOUS STUB効果（activeCondition評価込み）
          const banishBySelftToTrash =
            (myS.banish_to_trash_by_self ?? []).includes(myTopNum) ||
            (effectsMap.get(myTopNum) ?? []).some(eff =>
              eff.effectType === 'CONTINUOUS' &&
              (eff.action as import('../types/effects').StubAction).type === 'STUB' &&
              (eff.action as import('../types/effects').StubAction).id === 'BANISH_BY_SELF_GOES_TO_TRASH' &&
              checkActiveCondition(eff.activeCondition, myS, opS, true, battleCardMap, myTopNum, effectivePowers),
            );
          // FROZEN_SIGNI_BANISH_TO_DECK_BOTTOM: 防御側CONTが有効なら凍結シグニはデッキ下へ
          // FROZEN_SIGNI_TO_TRASH_ON_LEAVE: 攻撃側CONTが有効なら相手凍結シグニはトラッシュへ
          const opFrozenOvr = wasOpFrozen ? collectFrozenBanishOverrides(opS, battleCardMap, effectsMap) : { frozenBanishToDeckBottom: false, frozenLeaveToTrash: false };
          const myFrozenOvr = wasOpFrozen ? collectFrozenBanishOverrides(myS, battleCardMap, effectsMap) : { frozenBanishToDeckBottom: false, frozenLeaveToTrash: false };
          const frozenToDeckBottom = opFrozenOvr.frozenBanishToDeckBottom;
          const frozenToTrash = !frozenToDeckBottom && myFrozenOvr.frozenLeaveToTrash;
          // RISE_BANISH_SUBSTITUTE / BANISH_SUBSTITUTE_RISE_STACK:
          // ライズスタック（複数枚）のシグニがバニッシュされる場合、スタック下のカードをトラッシュに置いてバニッシュを回避
          const riseBanishSubSigni = collectRiseBanishSubstituteSigni(opS, battleCardMap, effectsMap, myS, false);
          const opTopHasRiseSub = riseBanishSubSigni.includes(opTopCardNum ?? '');
          const riseSubStack = opTopHasRiseSub ? (opS.field.signi[opZoneIndex] ?? []) : [];
          const riseSubApplied = opTopHasRiseSub && riseSubStack.length >= 2;
          if (riseSubApplied) {
            // バニッシュ代替: スタック下2枚をトラッシュ、トップカードは残る
            const bottomCards = riseSubStack.slice(0, -1);
            const topCard = riseSubStack.at(-1)!;
            const newOpSigniRiseSub = [...newOpSigni] as (string[] | null)[];
            newOpSigniRiseSub[opZoneIndex] = [topCard]; // トップカードのみ残す
            newOpState = {
              ...opS,
              trash: [...opS.trash, ...bottomCards, ...banishExtraTrash],
              field: { ...opS.field, signi: newOpSigniRiseSub, signi_down: newOpDown, signi_frozen: newOpFrozen, signi_charms: newOpCharms, signi_acce: newOpAcce },
            };
            appendBattleLogs([`${opCardName}（ライズ代替）スタック下${bottomCards.length}枚をトラッシュしてバニッシュ回避`]);
          } else {
          // BANISH_TO_LRIG_TRASH_INSTEAD: レゾナシグニはエナ代わりにlrig_trashへ（ルリグデッキ返却の近似）
          const banishToLrigTrash = !redirectBanish && !redirectBanishToHand && !frozenToDeckBottom && !frozenToTrash && !banishBySelftToTrash &&
            (effectsMap.get(opTopCardNum ?? '') ?? []).some(eff =>
              eff.effectType === 'CONTINUOUS' &&
              (eff.action as import('../types/effects').StubAction).type === 'STUB' &&
              (eff.action as import('../types/effects').StubAction).id === 'BANISH_TO_LRIG_TRASH_INSTEAD',
            );
          // OPP_SIGNI_ENERGY_TO_DECK_BOTTOM (WX25-CP1-003): エナゾーンに置かれる代わりにデッキの一番下へ
          const energyToDeckBottom = !redirectBanish && !redirectBanishToHand && !frozenToDeckBottom && !frozenToTrash && !banishBySelftToTrash && !banishToLrigTrash &&
            (opS.opp_signi_energy_to_deck_bottom === true);
          // BATTLE_LEAVE_REPLACE_WITH_EXILE (WXK05-024): 場を離れる代わりにゲームから除外（本実装はトラッシュで近似）。
          // エナに置かれる代わりにトラッシュへ送る。
          const defenderLeaveExile = (effectsMap.get(opTopCardNum ?? '') ?? []).some(eff =>
            eff.effectType === 'CONTINUOUS' &&
            (eff.action as import('../types/effects').StubAction).type === 'STUB' &&
            (eff.action as import('../types/effects').StubAction).id === 'BATTLE_LEAVE_REPLACE_WITH_EXILE' &&
            checkActiveCondition(eff.activeCondition, opS, myS, false, battleCardMap, opTopCardNum ?? ''),
          );
          const anyRedirect = redirectBanish || redirectBanishToHand || redirectBanishToExile || frozenToDeckBottom || frozenToTrash || banishBySelftToTrash || banishToLrigTrash || energyToDeckBottom || defenderLeaveExile;
          newOpState = {
            ...opS,
            hand: redirectBanishToHand ? [...opS.hand, ...opStack] : opS.hand,
            deck: (frozenToDeckBottom || energyToDeckBottom) ? [...opS.deck, ...opStack] : opS.deck,
            energy: anyRedirect ? opS.energy : [...opS.energy, ...opStack],
            lrig_trash: banishToLrigTrash ? [...opS.lrig_trash, ...opStack] : opS.lrig_trash,
            trash: (redirectBanish || frozenToTrash || banishBySelftToTrash || defenderLeaveExile)
              ? [...opS.trash, ...opStack, ...banishExtraTrash]
              : (banishExtraTrash.length > 0 ? [...opS.trash, ...banishExtraTrash] : opS.trash),
            field: {
              ...opS.field,
              signi: newOpSigni,
              signi_down:   newOpDown,
              signi_frozen: newOpFrozen,
              signi_charms: newOpCharms,
              signi_acce:   newOpAcce,
            },
          };
          appendBattleLogs([`${myCardName}が${opCardName}をバニッシュ${redirectBanish ? '（トラッシュへ）' : redirectBanishToHand ? '（手札へ）' : redirectBanishToExile ? '（ゲームから除外）' : frozenToDeckBottom ? '（凍結→デッキ下）' : frozenToTrash ? '（凍結→トラッシュ）' : banishToLrigTrash ? '（ルリグトラッシュへ）' : energyToDeckBottom ? '（エナ代替→デッキ下）' : defenderLeaveExile ? '（除外＝トラッシュへ）' : ''}`]);
          }
          } // end resonaSubCardNum else
          } // end cookingBanishSub/acceBanishSub/resonaSub else
          } // end leaveReplaceDown else

          // F-3: 消費済みの身代わり決定フラグをクリア（見送り時は通常チェーンが opS から引き継ぐため）
          if (opS.banish_substitute_choice || opS.pending_banish_substitute) {
            newOpState = { ...newOpState, banish_substitute_choice: undefined, pending_banish_substitute: undefined };
          }

          // ランサー/Sランサー：バトル勝利後に追加でライフを1枚クラッシュ
          if (isLancer || isSLancer) {
            const label = isSLancer ? 'Sランサー' : 'ランサー';
            const { newState: afterCrash, crashed, prevented } = crashOneLife(newOpState);
            if (prevented) {
              appendBattleLogs([`${label}：ダメージ無効`]);
              newOpState = afterCrash;
            } else if (!crashed) {
              if (isSLancer) {
              if (newOpState.prevent_defeat) {
                appendBattleLogs([`Sランサー：ライフなし → 敗北無効`]);
                newOpState = { ...newOpState, prevent_defeat: undefined };
              } else {
                // Sランサー：ライフなし → ダメージ → 相手の敗北
                appendBattleLogs([`Sランサー：ライフなし → ダメージ → 相手の敗北`]);
                await supabase.from('battle_states')
                  .update({ [myKey]: newMyState, [opKey]: newOpState, global_phase: 'FINISHED', winner_id: attackerId })
                  .eq('room_id', roomId);
                return;
              }
              }
              // ランサー：ライフなし → 効果消滅（ダメージは与えない）
              appendBattleLogs([`ランサー：ライフなし（効果消滅）`]);
            } else {
              appendBattleLogs([`${label}：ライフクロスをクラッシュ`]);
              newOpState = afterCrash;
            }
          }
        } else {
          appendBattleLogs([`${myCardName}はバトルに敗北`]);
        }
      } else if (isSideAttack) {
        // ─── 側面アタックで対象シグニゾーンが空 → 何も起こらない（バトルもダメージもなし）───
        appendBattleLogs([`${myCardName}の側面アタック：対象のシグニゾーンにシグニがいないため何も起こらない`]);
      } else {
        // ─── ライフへのアタック（正面空 or アサシン）───
        const crashCount = isDoubleCrush ? 2 : 1;
        const attackLabel = isAssassin && opTopCardNum
          ? `${myCardName}（アサシン）がライフをクラッシュ`
          : `${myCardName}がライフをクラッシュ`;

        // 1枚目クラッシュ
        const { newState: afterFirst, crashed: firstCrashed, prevented: firstPrevented } = crashOneLife(newOpState);
        if (firstPrevented) {
          appendBattleLogs([`${myCardName}がアタック：ダメージ無効`]);
          newOpState = afterFirst;
        } else if (!firstCrashed) {
          if (newOpState.prevent_defeat) {
            appendBattleLogs([`${myCardName}がアタック：ライフなし → 敗北無効`]);
            newOpState = { ...newOpState, prevent_defeat: undefined };
          } else {
            // ライフなし → 相手の敗北
            appendBattleLogs([`${myCardName}がアタック：相手のライフなし → 相手の敗北`]);
            await supabase.from('battle_states')
              .update({ [myKey]: newMyState, global_phase: 'FINISHED', winner_id: attackerId })
              .eq('room_id', roomId);
            return;
          }
        } else {
          appendBattleLogs([attackLabel]);
          newOpState = afterFirst;
          dealtSigniDamage = true;
        }

        if (crashCount > 1 && newOpState.life_cloth.length > 0) {
          // 公式ルール「同時クラッシュ」: 2枚目もライフから先に取り出す
          const secondCard = newOpState.life_cloth[newOpState.life_cloth.length - 1];
          newOpState = {
            ...newOpState,
            life_cloth: newOpState.life_cloth.slice(0, -1),
            pending_crashed_cards: [...(newOpState.pending_crashed_cards ?? []), secondCard],
          };
          appendBattleLogs([`ダブルクラッシュ：2枚目（${battleCardMap.get(secondCard)?.CardName ?? secondCard}）を同時クラッシュ予約`]);
        }
      }

      // MULTI_ZONE_ATTACK: 正面以外のゾーンにも追加バトル
      // 「アタックする」（強制）か「アタックできる」（任意）かをテキストで判定
      const mzaEffect = (effectsMap.get(myTopNum) ?? []).find(e =>
        e.effectType === 'CONTINUOUS' && e.action.type === 'STUB' && (e.action as import('../types/effects').StubAction).id === 'MULTI_ZONE_ATTACK'
        // activeCondition（例: 血晶武装状態であるかぎり）を満たす場合のみ有効
        && (!e.activeCondition || checkActiveCondition(e.activeCondition, newMyState, newOpState, true, battleCardMap, myTopNum))
      );
      if (mzaEffect) {
        const myCardDataMZA = battleCardMap.get(myTopNum);
        const myTxtMZA = (myCardDataMZA?.EffectText ?? '') + ' ' + (myCardDataMZA?.BurstText ?? '');
        // 「アタックする」= 強制、「アタックできる」= 任意（デフォルト任意）
        const isForcedMZA = myTxtMZA.includes('シグニゾーンにもアタックする') && !myTxtMZA.includes('アタックできる');
        const myPowerMZA = effectivePowers.get(myTopNum) ?? parsePowerVal(myCardDataMZA?.Power);
        for (let zi = 0; zi < 3; zi++) {
          if (zi === zoneIndex) continue; // 正面は既に処理済み
          const oppZiMZA = 2 - zi;
          const oppStackMZA = newOpState.field.signi[oppZiMZA] ?? [];
          const oppTopMZA = oppStackMZA.at(-1);
          if (!oppTopMZA) continue; // 相手シグニなし（空ゾーン）はダメージなしスキップ
          const oppPowerMZA = effectivePowers.get(oppTopMZA) ?? parsePowerVal(battleCardMap.get(oppTopMZA)?.Power);
          // 「アタックできる」（任意）の場合: バトル判定はするが自動的に負けもあり得る
          // ゲーム上は「アタックを宣言するかどうか」を選択すべきだが、現状は自動適用
          // 「アタックする」（強制）の場合 or 自動でバトル判定
          if (isForcedMZA || myPowerMZA >= oppPowerMZA) {
            if (myPowerMZA >= oppPowerMZA) {
              // バニッシュ（追加ゾーンなのでダメージなし）
              const oppSigniMZA = [...newOpState.field.signi] as (string[] | null)[];
              oppSigniMZA[oppZiMZA] = null;
              const oppDownMZA = [...(newOpState.field.signi_down ?? [false, false, false])];
              oppDownMZA[oppZiMZA] = false;
              newOpState = {
                ...newOpState,
                energy: [...newOpState.energy, ...oppStackMZA],
                field: { ...newOpState.field, signi: oppSigniMZA, signi_down: oppDownMZA },
              };
              appendBattleLogs([`${myCardName}が${battleCardMap.get(oppTopMZA)?.CardName ?? oppTopMZA}をバニッシュ（追加ゾーン・ダメージなし）`]);
            } else {
              appendBattleLogs([`${myCardName}（${myPowerMZA}）vs ${battleCardMap.get(oppTopMZA)?.CardName ?? oppTopMZA}（${oppPowerMZA}）：追加ゾーンバトル負け`]);
            }
          }
        }
      }

      // ADJACENT_ZONE_ATTACK: 英知=10条件で隣ゾーン1つにも追加バトル（WD20-009等）
      const azaEffect = (effectsMap.get(myTopNum) ?? []).find(e =>
        e.effectType === 'CONTINUOUS' && e.action.type === 'STUB' &&
        (e.action as import('../types/effects').StubAction).id === 'ADJACENT_ZONE_ATTACK' &&
        checkActiveCondition(e.activeCondition, myS, newOpState, true, battleCardMap, myTopNum),
      );
      if (azaEffect) {
        const myPowerAZA = effectivePowers.get(myTopNum) ?? (parseInt(battleCardMap.get(myTopNum)?.Power ?? '0') || 0);
        const adjZones = [zoneIndex - 1, zoneIndex + 1].filter(zi => zi >= 0 && zi < 3);
        let bestAZAZi = -1;
        let bestAZAPower = Infinity;
        for (const zi of adjZones) {
          const oppZiAdj = 2 - zi;
          const oppTopAdj = newOpState.field.signi[oppZiAdj]?.at(-1);
          if (!oppTopAdj) continue;
          const oppPowerAdj = effectivePowers.get(oppTopAdj) ?? (parseInt(battleCardMap.get(oppTopAdj)?.Power ?? '0') || 0);
          if (oppPowerAdj < bestAZAPower) { bestAZAPower = oppPowerAdj; bestAZAZi = zi; }
        }
        if (bestAZAZi >= 0 && myPowerAZA >= bestAZAPower) {
          const oppZiAZA = 2 - bestAZAZi;
          const oppStackAZA = [...(newOpState.field.signi[oppZiAZA] ?? [])];
          const oppTopAZA = oppStackAZA.at(-1)!;
          const oppSigniAZA = [...newOpState.field.signi] as (string[] | null)[];
          oppSigniAZA[oppZiAZA] = null;
          const oppDownAZA = [...(newOpState.field.signi_down ?? [false, false, false])];
          oppDownAZA[oppZiAZA] = false;
          newOpState = {
            ...newOpState,
            energy: [...newOpState.energy, ...oppStackAZA],
            field: { ...newOpState.field, signi: oppSigniAZA, signi_down: oppDownAZA },
          };
          appendBattleLogs([`${myCardName}が${battleCardMap.get(oppTopAZA)?.CardName ?? oppTopAZA}をバニッシュ（英知=10隣ゾーン追加バトル）`]);
        }
      }

      // ヘブンヘブン判定: アタッカーダウン後に全クロスシグニがダウン状態か確認
      // Phase 2では my はすでにシグニダウン済みのため my をそのまま使用
      const heavenEntries: StackEntry[] = [];
      const attackerCard = battleCardMap.get(myTopNum);
      if (cardHasCrossIcon(attackerCard)) {
        const stateAfterDown: PlayerState = myS;
        const crossStates = collectCrossStates(stateAfterDown, battleCardMap);
        if (crossStates[zoneIndex]) {
          const crossZones = ([0, 1, 2] as const).filter(z => crossStates[z]);
          const allDowned = crossZones.every(z => myS.field.signi_down?.[z] ?? false);
          if (allDowned && crossZones.length >= 2) {
            // ヘブンヘブン成立: 各クロスシグニのON_HEAVENトリガーを収集
            const heavenZoneNums = crossZones
              .map(z => (stateAfterDown.field.signi[z] ?? []).at(-1))
              .filter((n): n is string => !!n);
            for (const cardNum of heavenZoneNums) {
              for (const e of (effectsMap.get(cardNum) ?? [])) {
                if (e.effectType !== 'AUTO' || !e.timing?.includes('ON_HEAVEN')) continue;
                heavenEntries.push({
                  id: generateUUID(),
                  playerId: attackerId,
                  cardNum,
                  effectId: e.effectId,
                  label: `${battleCardMap.get(cardNum)?.CardName ?? cardNum} の【クロス自】効果（ヘブンヘブン）`,
                  effect: e,
                } satisfies StackEntry);
              }
            }
            if (heavenEntries.length > 0 || crossZones.length >= 2) {
              appendBattleLogs([`ヘブンヘブン！ ${heavenZoneNums.map(n => battleCardMap.get(n)?.CardName ?? n).join(' & ')}`]);
              // heaven_state を更新
              const newHeavenState = [...(myS.field.heaven_state ?? [false, false, false])];
              crossZones.forEach(z => { newHeavenState[z] = true; });
              newMyState.field = { ...newMyState.field, heaven_state: newHeavenState };
            }
          }
        }
      }

      // ON_BANISH トリガー（バニッシュされた相手シグニ + フィールドトリガー）
      const newHostState  = attackerIsHost ? newMyState : newOpState;
      const newGuestState = attackerIsHost ? newOpState : newMyState;
      const banishRes = banishedOpCardNum
        ? collectBanishTriggers(
            banishedOpCardNum,
            defenderId,
            newHostState,
            newGuestState,
            op, // 防御側のバトル前状態（アクセ付与ON_BANISH復元用）
          )
        : { entries: [] as StackEntry[], usedHostIds: [] as string[], usedGuestIds: [] as string[] };
      const banishEntries = banishRes.entries;
      // usageLimit（《ターン1回/2回》）消費を actions_done へ永続化（attacker=newMyState / defender=newOpState）
      {
        const usedMine = attackerIsHost ? banishRes.usedHostIds : banishRes.usedGuestIds;
        const usedOpp  = attackerIsHost ? banishRes.usedGuestIds : banishRes.usedHostIds;
        if (usedMine.length > 0) newMyState.actions_done = [...(newMyState.actions_done ?? []), ...usedMine];
        if (usedOpp.length > 0)  newOpState = { ...newOpState, actions_done: [...(newOpState.actions_done ?? []), ...usedOpp] };
      }

      // ON_SIGNI_BANISH_BATTLE / ON_SIGNI_BANISH_OPPONENT: （バトルで）相手シグニをバニッシュしたとき
      // scope 'self'（デフォルト）はバニッシュしたアタッカー自身のみ、'any_ally'/'any' は自フィールド全シグニ。
      // ON_SIGNI_BANISH_OPPONENT（「対戦相手のシグニをバニッシュしたとき」）は現状バトルバニッシュ経路のみ配線（WD12-012/013/014/015）。
      const battleBanishEntries: StackEntry[] = [];
      if (banishedOpCardNum) {
        const usedIdsBB: string[] = [];
        // banishedFilter（被バニッシュシグニの限定・タスク16[B]）: 「感染状態の/凍結状態の/【チャーム】が付いている
        // シグニをバニッシュしたとき」（WX16-079/WXK02-054/WXEX2-76 等）。チャーム/ウィルス/凍結はバニッシュで
        // 場から消えるゾーン状態のため、防御側の**バトル前状態（opS）**の被バニッシュゾーンで判定する（pre-banish スナップ）。
        // 犠牲（BanishSubstitute）経路では正面以外のゾーンが落ちるので findIndex で引く。
        const banishedZoneIdxBB = opS.field.signi.findIndex(s => s?.at(-1) === banishedOpCardNum);
        for (const stackBB of newMyState.field.signi) {
          const topNumBB = stackBB?.at(-1);
          if (!topNumBB) continue;
          for (const eff of (effectsMap.get(topNumBB) ?? [])) {
            if (eff.effectType !== 'AUTO' ||
                !(eff.timing?.includes('ON_SIGNI_BANISH_BATTLE') || eff.timing?.includes('ON_SIGNI_BANISH_OPPONENT'))) continue;
            const scopeBB = eff.triggerScope ?? 'self';
            if (scopeBB === 'self' && topNumBB !== myTopNum) continue;
            // any_ally の triggerFilter（「あなたの＜水獣＞のシグニが…」WXEX2-40）＝バニッシュを行ったシグニ
            // （＝アタッカー myTopNum）がフィルタに一致するか。excludeSelf は「あなたの他の…」＝能力保持シグニ自身が
            // バニッシュした場合は発火しない（続き75で parser が triggerScope/triggerFilter を出すようになったのに合わせて配線）。
            if (scopeBB !== 'self') {
              if (eff.triggerFilter?.excludeSelf && topNumBB === myTopNum) continue;
              if (eff.triggerFilter && !matchesFilter(battleCardMap.get(getCardNum(myTopNum)), eff.triggerFilter)) continue;
            }
            // banishedFilter: 被バニッシュシグニがカード条件（matchesFilter）＋バニッシュ直前のゾーン状態
            // （matchesStateFilter＝infected/isFrozen/hasCharm）を満たす場合のみ発火。
            if (eff.triggerCondition?.banishedFilter) {
              const bfBB = eff.triggerCondition.banishedFilter;
              if (!matchesFilter(battleCardMap.get(getCardNum(banishedOpCardNum)), bfBB)) continue;
              if (banishedZoneIdxBB < 0 || !matchesStateFilter(opS, banishedZoneIdxBB, bfBB)) continue;
            }
            // banishedNotFront: 被バニッシュシグニがアタッカーの正面ゾーン（opZoneIndex＝本バトルの対象ゾーン。
            // 犠牲/リダイレクトで実際の対象ゾーンが変わった場合も同じ opZoneIndex を正面として扱う）と
            // 一致する場合は発火しない（WX17-032「正面以外のシグニをバニッシュしたとき」）。
            if (eff.triggerCondition?.banishedNotFront && banishedZoneIdxBB === opZoneIndex) continue;
            // condition を持つAUTOは条件を満たす場合のみ収集（例: WXK04-044 血晶武装中のみアップ）
            if (eff.condition && !evalUseCondition(eff.condition, newMyState, newOpState, battleCardMap, topNumBB, bs.turn_phase, effectivePowers)) continue;
            if (eff.usageLimit === 'once_per_turn' &&
                ((myS.actions_done?.includes(eff.effectId)) || usedIdsBB.includes(eff.effectId))) continue;
            if (eff.usageLimit === 'once_per_turn') usedIdsBB.push(eff.effectId);
            battleBanishEntries.push({
              id: generateUUID(),
              playerId: attackerId,
              cardNum: topNumBB,
              effectId: eff.effectId,
              label: `${battleCardMap.get(topNumBB)?.CardName ?? topNumBB} の【自】効果（バトルバニッシュ時）`,
              effect: eff,
              triggeringCardNum: banishedOpCardNum, // 「そのシグニのレベル以下」等の被バニッシュ参照用
              battleAttackerCardNum: myTopNum, // 「そのアタックしているシグニ」参照用（any_ally scope で能力ホスト≠アタッカーになりうるため別軸）
            } satisfies StackEntry);
          }
        }
        if (usedIdsBB.length > 0) {
          newMyState.actions_done = [...(newMyState.actions_done ?? []), ...usedIdsBB];
        }
      }

      // ON_TRASH: banish_redirect=true の場合、バニッシュされたシグニがトラッシュへ
      const trashEntriesSA: StackEntry[] = [];
      const redirectBanishForTrigger =
        myS.banish_redirect === true ||
        (myS.banish_redirect_by_source_nums ?? []).includes(myTopNum) ||
        myS.field.signi.some(s => {
          const n = s?.at(-1);
          // 上の redirectBanish（実際の行き先判定）と同じ条件にする＝bySource 付きはバトル当事者のみ・
          // target.filter も同じ被バニッシュシグニ属性で評価する（トリガー発火可否を実際の行き先と一致させる）。
          return n && (effectsMap.get(n) ?? []).some(e =>
            e.effectType === 'CONTINUOUS' &&
            banishRedirectAppliesFrom(e.action, n, myTopNum, banishedOpAttrsOf(banishedOpCardNum)) &&
            checkActiveCondition(e.activeCondition, myS, opS, true, battleCardMap, n, effectivePowers),
          );
        });
      if (banishedOpCardNum && redirectBanishForTrigger) {
        // バトルでのバニッシュ→トラッシュはコスト/効果起因ではない（fromFieldByCostOrEffect/byEffect は発火しない。G204）
        const ttSA = collectTrashTriggers(banishedOpCardNum, defenderId, newHostState, newGuestState, false, false, false);
        trashEntriesSA.push(...ttSA.entries);
        // usageLimit 消費を actions_done へ永続化（直下の ON_LEAVE_FIELD と同型）
        const ttUsedMine = attackerIsHost ? ttSA.usedHostIds : ttSA.usedGuestIds;
        const ttUsedOpp  = attackerIsHost ? ttSA.usedGuestIds : ttSA.usedHostIds;
        if (ttUsedMine.length > 0) newMyState.actions_done = [...(newMyState.actions_done ?? []), ...ttUsedMine];
        if (ttUsedOpp.length > 0)  newOpState = { ...newOpState, actions_done: [...(newOpState.actions_done ?? []), ...ttUsedOpp] };
      }

      // ON_LEAVE_FIELD: バトルでバニッシュされたシグニは場を離れている（バトル起因＝causeOwnerId なし）
      const leaveEntriesSA: StackEntry[] = [];
      if (banishedOpCardNum) {
        const lfSA = collectLeaveFieldTriggers(banishedOpCardNum, banishedOpUnderCards, defenderId, newHostState, newGuestState);
        leaveEntriesSA.push(...lfSA.entries);
        // usageLimit（《ターン1回/2回》）消費を actions_done へ永続化（banishRes と同型＝attacker=newMyState / defender=newOpState）
        const lfUsedMine = attackerIsHost ? lfSA.usedHostIds : lfSA.usedGuestIds;
        const lfUsedOpp  = attackerIsHost ? lfSA.usedGuestIds : lfSA.usedHostIds;
        if (lfUsedMine.length > 0) newMyState.actions_done = [...(newMyState.actions_done ?? []), ...lfUsedMine];
        if (lfUsedOpp.length > 0)  newOpState = { ...newOpState, actions_done: [...(newOpState.actions_done ?? []), ...lfUsedOpp] };
      }

      // ON_SIGNI_BATTLE: 実際にバトルが行われた場合、参加した両シグニ（攻撃側=myTopNum / 防御側=opTopCardNum）で発火。
      // 「このシグニがシグニ1体とバトルしたとき」（WX25-CP1-075の付与能力等）。triggerScope 'self' 想定で各シグニ自身の能力のみ収集。
      const signiBattleEntries: StackEntry[] = [];
      if (!effectivelyEmpty && opTopCardNum) {
        const myBattleUsed: string[] = [];
        const opBattleUsed: string[] = [];
        // 条件ツリーに IS_MY_TURN / IS_OPPONENT_TURN を含むか（evalCondition では両者 true のため、ターン判定はここで行う）
        const condHasBattle = (c: import('../types/effects').Condition | undefined, t: string): boolean =>
          !!c && (c.type === t || (c.type === 'AND' && (c.conditions ?? []).some(cc => condHasBattle(cc, t))));
        // battleOpponentNum: このシグニのバトル相手（「その対戦相手のシグニ」= triggeringCardNum。WX04-099）。
        const collectBattleTrig = (cardNum: string, playerId: string, doneIds: string[] | undefined, used: string[], ownerSt: PlayerState, otherSt: PlayerState, battleOpponentNum: string) => {
          const isControllerTurnPlayer = playerId === bs.active_user_id;
          for (const eff of (effectsMap.get(cardNum) ?? [])) {
            if (eff.effectType !== 'AUTO' || !eff.timing?.includes('ON_SIGNI_BATTLE')) continue;
            // triggerFilter: バトル相手のシグニのレベル/パワー条件（WX04-099=レベル2以下／WX05-047=レベル4／WXDi-P14-062=パワー10000以上）
            if (eff.triggerFilter && !matchesFilter(battleCardMap.get(battleOpponentNum), eff.triggerFilter, effectivePowers.get(battleOpponentNum))) continue;
            // 「あなたのターンの間」(IS_MY_TURN) / 「対戦相手のターンの間」(IS_OPPONENT_TURN) のターン判定
            if (condHasBattle(eff.condition, 'IS_MY_TURN') && !isControllerTurnPlayer) continue;
            if (condHasBattle(eff.condition, 'IS_OPPONENT_TURN') && isControllerTurnPlayer) continue;
            // condition を持つAUTOは発動条件を満たす場合のみ収集（「このターンに手札を2枚以上捨てていたかぎり…を得る」等の付与AUTO）
            if (eff.condition && !evalUseCondition(eff.condition, ownerSt, otherSt, battleCardMap, cardNum, bs.turn_phase, effectivePowers)) continue;
            if (eff.usageLimit === 'once_per_turn' && (doneIds?.includes(eff.effectId) || used.includes(eff.effectId))) continue;
            if (eff.usageLimit === 'once_per_turn') used.push(eff.effectId);
            signiBattleEntries.push({
              id: generateUUID(),
              playerId,
              cardNum,
              effectId: eff.effectId,
              label: `${battleCardMap.get(cardNum)?.CardName ?? cardNum} の【自】効果（バトル時）`,
              effect: eff,
              triggeringCardNum: battleOpponentNum,
            } satisfies StackEntry);
          }
        };
        collectBattleTrig(myTopNum, attackerId, newMyState.actions_done, myBattleUsed, newMyState, newOpState, opTopCardNum);
        collectBattleTrig(opTopCardNum, defenderId, newOpState.actions_done, opBattleUsed, newOpState, newMyState, myTopNum);
        if (myBattleUsed.length > 0) newMyState.actions_done = [...(newMyState.actions_done ?? []), ...myBattleUsed];
        if (opBattleUsed.length > 0) newOpState.actions_done = [...(newOpState.actions_done ?? []), ...opBattleUsed];
      }

      // ON_SIGNI_DAMAGE: このアタックで相手ライフをクラッシュ（ダメージを与えた）場合、攻撃側シグニ自身の
      // 「【自】このシグニが対戦相手にダメージを与えたとき…」を収集（WX21-054 等）。condition も評価する。
      const damageEntries: StackEntry[] = [];
      if (dealtSigniDamage) {
        for (const eff of (effectsMap.get(myTopNum) ?? [])) {
          if (eff.effectType !== 'AUTO' || !eff.timing?.includes('ON_SIGNI_DAMAGE')) continue;
          if ((eff.triggerScope ?? 'self') !== 'self') continue;
          if (eff.condition && !evalUseCondition(eff.condition, newMyState, newOpState, battleCardMap, myTopNum, bs.turn_phase, effectivePowers)) continue;
          damageEntries.push({
            id: generateUUID(),
            playerId: attackerId,
            cardNum: myTopNum,
            effectId: eff.effectId,
            label: `${myCardName} の【自】効果（ダメージ時）`,
            effect: eff,
            triggeringCardNum: myTopNum,
          } satisfies StackEntry);
        }
      }

      // 傀儡の離場回収（バトルでバニッシュ等で場を離れた傀儡を持ち主のトラッシュへ。WDK17-007）
      const sweptBattle = sweepPuppets(newMyState, newOpState);
      let finalMyState = sweptBattle.a;
      let finalOpState = sweptBattle.b;

      // ON_CHARM_TO_TRASH（続き74発見・続き75修正）: バトルバニッシュでチャーム持ちシグニが場を離れると
      // チャームがトラッシュに置かれるが、本経路は効果解決の中央 diff（collectBoardDiffTriggers）を通らないため
      // 従来はここでのみ発生する「戦闘によるチャーム喪失」が一度も収集されなかった（実戦で最頻の経路）。
      // 効果banish経路と同型の収集を、バトル前後（myS/opS → final*State）の diff に対して行う。
      const charmEntries: StackEntry[] = [];
      const charmsFromMy = countCharmsToTrash(myS, finalMyState);
      const charmsFromOp = countCharmsToTrash(opS, finalOpState);
      if (charmsFromMy > 0 || charmsFromOp > 0) {
        const chMy = collectCharmToTrashTriggers(attackerId, finalMyState, finalOpState, charmsFromMy, charmsFromOp);
        charmEntries.push(...chMy.entries);
        if (chMy.usedOncePerTurnIds.length > 0) {
          finalMyState = { ...finalMyState, actions_done: [...(finalMyState.actions_done ?? []), ...chMy.usedOncePerTurnIds] };
        }
        const chOp = collectCharmToTrashTriggers(defenderId, finalOpState, finalMyState, charmsFromOp, charmsFromMy);
        charmEntries.push(...chOp.entries);
        if (chOp.usedOncePerTurnIds.length > 0) {
          finalOpState = { ...finalOpState, actions_done: [...(finalOpState.actions_done ?? []), ...chOp.usedOncePerTurnIds] };
        }
      }

      // Phase 2のトリガー（ON_BANISHなど。ON_ATTACK_SIGNIはPhase 1で処理済み）
      const allTriggers = [...banishEntries, ...battleBanishEntries, ...trashEntriesSA, ...leaveEntriesSA, ...heavenEntries, ...signiBattleEntries, ...damageEntries, ...charmEntries];
      if (allTriggers.length > 0) {
        const turnPlayerId = bs.active_user_id ?? attackerId;
        const existingStack = bs.effect_stack ?? null;
        const stack = existingStack
          ? pushToStack(existingStack, allTriggers)
          : initStack(turnPlayerId, allTriggers);
        await supabase.from('battle_states')
          .update({ [myKey]: finalMyState, [opKey]: finalOpState, effect_stack: stack })
          .eq('room_id', roomId);
      } else {
        await supabase.from('battle_states')
          .update({ [myKey]: finalMyState, [opKey]: finalOpState })
          .eq('room_id', roomId);
      }
    } finally {
      setLoading(false);
    }
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
  const resolvePendingLrigAttack = async () => {
    if (!my.pending_lrig_attack) return;
    if (loading) return;
    const myKey = isHost ? 'host_state' : 'guest_state';
    const opKey = isHost ? 'guest_state' : 'host_state';
    setLoading(true);
    try {
      const newMyState: PlayerState = { ...my, pending_lrig_attack: undefined };
      const newOpState: PlayerState = { ...op, field: { ...op.field, lrig_attacked: true } };
      await supabase.from('battle_states')
        .update({ [myKey]: newMyState, [opKey]: newOpState })
        .eq('room_id', roomId);
    } finally {
      setLoading(false);
    }
  };

  // シグニアタック処理（人間プレイヤー用エントリポイント）
  const handleSigniAttack = async (zoneIndex: number) => {
    if (!isMyTurn || loading || bs.turn_phase !== 'ATTACK_SIGNI') return;
    if (op.field.check) return; // 相手のライフバースト処理待ち中はアタック不可
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
    await performSigniAttack(zoneIndex, {
      attacker: my,
      defender: op,
      attackerId: user.id,
      defenderId: isHost ? bs.guest_id : bs.host_id,
      attackerKey: isHost ? 'host_state' : 'guest_state',
      targetOpZone,
    });
  };

  // G154 BURST: アタック無効化を「手札N枚捨て」で回避してアタックを通す
  const resolveNegateEscapeDiscard = async () => {
    if (!negateEscape || selectedNegateEscape.size !== negateEscape.count || loading) return;
    const { zoneIndex, targetOpZone, cardNum } = negateEscape;
    const discardNums = [...selectedNegateEscape].map(i => my.hand[i]).filter((n): n is string => !!n);
    const newMy: PlayerState = { ...my, hand: my.hand.filter((_, i) => !selectedNegateEscape.has(i)), trash: [...my.trash, ...discardNums] };
    const escMap = { ...(op.negated_attacks_escape ?? {}) }; delete escMap[cardNum];
    const newOp: PlayerState = { ...op, negated_attacks: (op.negated_attacks ?? []).filter(n => n !== cardNum), negated_attacks_escape: Object.keys(escMap).length ? escMap : undefined };
    appendBattleLogs([`手札${negateEscape.count}枚を捨ててアタックを通した`]);
    closeNegateEscape();
    // 無効化を解除した状態でアタックを再実行（performSigniAttack 冒頭の negated_attacks 判定を通過する）
    await performSigniAttack(zoneIndex, {
      attacker: newMy, defender: newOp,
      attackerId: user.id, defenderId: isHost ? bs.guest_id : bs.host_id,
      attackerKey: isHost ? 'host_state' : 'guest_state', targetOpZone,
    });
  };

  // G154 BURST: 手札を捨てず、アタック無効化を受け入れる
  const resolveNegateEscapeAccept = async () => {
    if (!negateEscape || loading) return;
    setLoading(true);
    try {
      const { zoneIndex, cardNum } = negateEscape;
      const newSigniDown = [...(my.field.signi_down ?? [false, false, false])] as boolean[];
      newSigniDown[zoneIndex] = true;
      const newMy: PlayerState = { ...my, field: { ...my.field, signi_down: newSigniDown }, attacked_signi_ids: [...(my.attacked_signi_ids ?? []), cardNum] };
      const escMap = { ...(op.negated_attacks_escape ?? {}) }; delete escMap[cardNum];
      const newOp: PlayerState = { ...op, negated_attacks: (op.negated_attacks ?? []).filter(n => n !== cardNum), negated_attacks_escape: Object.keys(escMap).length ? escMap : undefined };
      appendBattleLogs([`${battleCardMap.get(cardNum)?.CardName ?? cardNum}のアタックは無効化された`]);
      closeNegateEscape();
      const myKey = isHost ? 'host_state' : 'guest_state';
      const opKey = isHost ? 'guest_state' : 'host_state';
      await supabase.from('battle_states').update({ [myKey]: newMy, [opKey]: newOp }).eq('room_id', roomId);
      await flushBattleLogs();
    } finally {
      setLoading(false);
    }
  };

  // ルリグアタックの実行（人間・CPU共通）: アタッカーのルリグをダウンし防御側にガード応答を要求。
  // アタック不可（ドライブ状態・無効化等）の場合は状態を変えずに false を返す
  const performLrigAttack = async (p: {
    attacker: PlayerState; defender: PlayerState;
    attackerId: string;
    attackerKey: 'host_state' | 'guest_state';
  }): Promise<boolean> => {
    const { attacker: my, defender: op, attackerId } = p;
    if (my.lrig_has_attacked) return false; // このターン既に攻撃済み（ON_ATTACK_LRIGでアップされても再攻撃不可）
    if (my.field.lrig_down) return false; // すでに攻撃済み
    if (op.field.lrig_attacked) return false; // ガード応答待ち中
    const myLrigNumLA = my.field.lrig.at(-1);
    const allowDriveAttack = !!(myLrigNumLA && (effectsMap.get(myLrigNumLA) ?? []).some(e =>
      e.effectType === 'CONTINUOUS' &&
      (e.action as import('../types/effects').StubAction).type === 'STUB' &&
      (e.action as import('../types/effects').StubAction).id === 'ALLOW_ATTACK_WHILE_DRIVE',
    ));
    if ((my.lrig_riding_signi?.length ?? 0) > 0 && !allowDriveAttack) return false; // ドライブ状態：ルリグはアタックできない
    // PREVENT_TARGET_LRIG_ATTACK_THIS_TURN: negated_attacks にルリグIDがある場合アタック不可
    if (myLrigNumLA && (my.negated_attacks ?? []).includes(myLrigNumLA)) return false;
    // keyword_grants で「アタックできない」が付与されている場合アタック不可
    if (myLrigNumLA && (my.keyword_grants?.[myLrigNumLA] ?? []).includes('アタックできない')) return false;
    setLoading(true);
    try {
      const myKey = p.attackerKey;
      const lrigNum = my.field.lrig.at(-1) ?? '';
      const lrigName = battleCardMap.get(lrigNum)?.CardName ?? 'ルリグ';
      // OPP_LRIG_ATTACK_COST: 相手フィールドの効果による追加コスト支払い（アタッカーは常にターンプレイヤー）
      const lrigAttackExtraCost = collectOppLrigAttackExtraCost(op, my, battleCardMap, effectsMap, false);
      let myEnergyAfterAttack = my.energy;
      if (lrigAttackExtraCost > 0 && my.energy.length >= lrigAttackExtraCost) {
        const removed = myEnergyAfterAttack.slice(-lrigAttackExtraCost);
        myEnergyAfterAttack = myEnergyAfterAttack.slice(0, -lrigAttackExtraCost);
        appendBattleLogs([`ルリグアタック追加コスト（《無》×${lrigAttackExtraCost}）消費：${removed.map(n=>battleCardMap.get(n)?.CardName??n).join('、')}`]);
      }
      appendBattleLogs([`${lrigName}がアタック`]);
      // pending_lrig_attack: true でON_ATTACK_LRIG解決後にガード応答（lrig_attacked）をセット
      const newMyState: PlayerState = { ...my, energy: myEnergyAfterAttack, lrig_has_attacked: true, pending_lrig_attack: true, field: { ...my.field, lrig_down: true } };
      // lrig_attacked は ON_ATTACK_LRIG 解決後にセット（スタック解決後の useEffect で対応）

      // ON_ATTACK_LRIG AUTO トリガー収集（ルリグカード自身の効果 + スペル付与の能力 + COPY_LRIG_NAME_ABILITYコピー効果）
      const lrigCardEffects = (effectsMap.get(lrigNum) ?? [])
        .filter(e => e.effectType === 'AUTO' && e.timing?.includes('ON_ATTACK_LRIG'));
      const grantedAttackEffects = (my.lrig_granted_auto_effects ?? [])
        .filter(e => e.effectType === 'AUTO' && e.timing?.includes('ON_ATTACK_LRIG'));
      const copiedAutoEffects = collectCopiedLrigAutoEffects(my, battleCardMap, effectsMap, op, true)
        .filter(e => e.timing?.includes('ON_ATTACK_LRIG'));
      // CONTINUOUS GRANT_LRIG_ABILITY（場のシグニ/キーが「あなたのセンタールリグは『【自】…』を得る」を宣言）由来の
      // ON_ATTACK_LRIG 付与能力（WXDi-P05-032 等）。lrig_granted_auto_effects（実行時付与）とは別ソース。
      const contGrantedLrigEffects = collectLrigGrantedEffects(my, op, true, effectsMap, battleCardMap)
        .filter(e => e.effectType === 'AUTO' && e.timing?.includes('ON_ATTACK_LRIG'));
      const onAttackEffects = [...lrigCardEffects, ...grantedAttackEffects, ...copiedAutoEffects, ...contGrantedLrigEffects];
      const update: Partial<BattleStateRow> = { [myKey]: newMyState };
      // 防御側の付与AUTO（「対戦相手のルリグがアタックしたとき」＝any_opp/any scope・タスク12(xlvii)）。
      // アタック側とは playerId も usageLimit の書き戻し先も異なるため、別の entries として結合する。
      const defenderKey: 'host_state' | 'guest_state' = myKey === 'host_state' ? 'guest_state' : 'host_state';
      const defenderId = attackerId === bs.host_id ? bs.guest_id : bs.host_id;
      const defRes = collectLrigAttackDefenderTriggers(op, defenderId);
      if (defRes.usedIds.length > 0) {
        update[defenderKey] = { ...op, actions_done: [...(op.actions_done ?? []), ...defRes.usedIds] };
      }
      const attackerEntries: StackEntry[] = onAttackEffects.map(e => ({
        id: generateUUID(),
        playerId: attackerId,
        cardNum: lrigNum,
        effectId: e.effectId,
        label: `${lrigName} の【自】効果（アタック時）`,
        effect: e,
      }));
      const entries: StackEntry[] = [...attackerEntries, ...defRes.entries];
      if (entries.length > 0) {
        const existing = bs.effect_stack ?? null;
        update.effect_stack = existing ? pushToStack(existing, entries) : initStack(bs.active_user_id ?? attackerId, entries);
      }
      await supabase.from('battle_states').update(update).eq('room_id', roomId);
      return true;
    } finally {
      setLoading(false);
    }
  };

  // ルリグアタック（人間プレイヤー用エントリポイント）
  const handleLrigAttack = async () => {
    if (!isMyTurn || loading || bs.turn_phase !== 'ATTACK_LRIG') return;
    await performLrigAttack({
      attacker: my,
      defender: op,
      attackerId: user.id,
      attackerKey: isHost ? 'host_state' : 'guest_state',
    });
  };

  // ダブルクラッシュ等による追加ライフクラッシュ（バースト後に自動発動）
  // 同時クラッシュで先にライフから取り出したカードを check にセットして処理する
  const triggerPendingCrash = async () => {
    const pendingCards = my.pending_crashed_cards ?? [];
    if (!pendingCards.length || my.field.check || loading) return;
    setLoading(true);
    try {
      const stateKey = isHost ? 'host_state' : 'guest_state';
      const [nextCard, ...remaining] = pendingCards;
      const newMyState: PlayerState = {
        ...my,
        pending_crashed_cards: remaining,
        field: { ...my.field, check: nextCard },
      };
      const crashedName = battleCardMap.get(nextCard)?.CardName ?? nextCard;
      appendBattleLogs([`ダブルクラッシュ：ライフクロスをクラッシュ（${crashedName}）`]);
      await supabase.from('battle_states').update({ [stateKey]: newMyState }).eq('room_id', roomId);
    } finally {
      setLoading(false);
    }
  };

  // パワー0以下シグニの自動バニッシュ処理
  const checkAndBanishPowerZero = async () => {
    if (!bs || loading || bs.global_phase !== 'PLAYING') return;
    // カードマスタ（cards）が未ロードだと battleCardMap が空になり、全シグニのパワーが
    // 取得できず parseInt('0')=0 と誤判定され、盤面全体を誤バニッシュしてDBに書き込んでしまう。
    // リロード直後にカードデータfetchが未完了のまま battle_state を購読すると発生するため、
    // カードデータが揃うまでルール処理（破壊的書き込み）を一切行わない。
    if (battleCardMap.size === 0) return;
    if (bs.effect_stack || bs.pending_effect) return;

    const isMyTurnLocal = bs.active_user_id === bs.host_id;
    const powers = calcFieldPowers(bs.host_state, bs.guest_state, isMyTurnLocal, effectsMap, battleCardMap, bs.turn_phase);

    // バニッシュ候補を先に収集してフィンガープリントで二重処理を防ぐ
    const candidates: string[] = [];
    for (const ownerIsHost of [true, false]) {
      const ownerState = ownerIsHost ? bs.host_state : bs.guest_state;
      const opStateP0 = ownerIsHost ? bs.guest_state : bs.host_state;
      const isOwnerTurnP0 = ownerIsHost ? isMyTurnLocal : !isMyTurnLocal;
      const grants = ownerState.keyword_grants;
      const grantsOppTurn = ownerState.keyword_grants_until_opp_turn;
      // CONTINUOUS GRANT_PROTECTION from=['BANISH'] による保護（activeCondition 評価込み）
      const banishProtected = collectBanishEffectProtectedSigni(ownerState, opStateP0, isOwnerTurnP0, effectsMap, battleCardMap);
      for (const stack of ownerState.field.signi) {
        if (!stack?.length) continue;
        const topNum = stack[stack.length - 1];
        const rawPower = battleCardMap.get(topNum)?.Power;
        const power = powers.get(topNum) ?? (rawPower === '∞' ? Infinity : parseInt(rawPower ?? '0', 10));
        // NaN（Power「-」等の非数値）はバニッシュ対象にしない
        if (isNaN(power) || power > 0) continue;
        if (banishProtected.has(topNum)) continue;
        if (hasBanishResist(topNum, battleCardMap, grants, grantsOppTurn)) continue;
        candidates.push(topNum);
      }
    }
    if (candidates.length === 0) return;

    const candidateKey = [...candidates].sort().join(',');
    if (candidateKey === lastBanishedKeyRef.current) return; // DB伝播待ち中の二重処理をスキップ
    lastBanishedKeyRef.current = candidateKey;

    let hostState  = bs.host_state;
    let guestState = bs.guest_state;
    const allTriggers: StackEntry[] = [];

    for (const ownerIsHost of [true, false]) {
      const ownerId = ownerIsHost ? bs.host_id : bs.guest_id;
      const ownerState = ownerIsHost ? hostState : guestState;
      const opStateP02 = ownerIsHost ? guestState : hostState;
      const isOwnerTurnP02 = ownerIsHost ? isMyTurnLocal : !isMyTurnLocal;
      const grants = ownerState.keyword_grants;
      const grantsOppTurn2 = ownerState.keyword_grants_until_opp_turn;
      const banishProtected2 = collectBanishEffectProtectedSigni(ownerState, opStateP02, isOwnerTurnP02, effectsMap, battleCardMap);

      for (const stack of ownerState.field.signi) {
        if (!stack?.length) continue;
        const topNum = stack[stack.length - 1];
        const rawPower = battleCardMap.get(topNum)?.Power;
        const power = powers.get(topNum) ?? (rawPower === '∞' ? Infinity : parseInt(rawPower ?? '0', 10));
        // NaN（Power「-」等の非数値）はバニッシュ対象にしない
        if (isNaN(power) || power > 0) continue;
        if (banishProtected2.has(topNum)) continue;
        if (hasBanishResist(topNum, battleCardMap, grants, grantsOppTurn2)) continue;

        const currentOwner = ownerIsHost ? hostState : guestState;
        const removed = removeFromField(topNum, currentOwner);
        const opState = ownerIsHost ? guestState : hostState;
        const opIsOwnerTurnP0 = ownerIsHost ? !isMyTurnLocal : isMyTurnLocal;
        // パワー0バニッシュ: 相手の同ゾーンシグニがシュートを持つ場合もトラッシュへ
        const dieZoneP0 = currentOwner.field.signi.findIndex(s => s?.at(-1) === topNum);
        const opZoneSigniP0 = dieZoneP0 >= 0 ? opState.field.signi[dieZoneP0]?.at(-1) ?? null : null;
        const opShootP0 = opZoneSigniP0 != null &&
          hasKeyword(opZoneSigniP0, 'シュート', battleCardMap, opState.keyword_grants, undefined, opState.keyword_grants_until_opp_turn, undefined, opState.abilities_removed);
        const redirectBanishP0 =
          opShootP0 ||
          opState.banish_redirect === true ||
          // パワー0以下のシグニ→トラッシュ（所有者問わず。WX04-038-E1。どちらかのプレイヤーが設定）
          hostState.power0_banish_to_trash === true ||
          guestState.power0_banish_to_trash === true ||
          // 「対戦相手の」限定版（BANISH_REDIRECT whenPowerZero・続き218）＝設定した側の対戦相手のシグニだけ。
          // opState は消滅するシグニの持ち主から見た対戦相手＝そこに立っていれば消滅側が「対戦相手」に当たる。
          opState.power0_banish_to_trash_opp_only === true ||
          opState.field.signi.some(s => {
            const n = s?.at(-1);
            // パワー0以下による消滅はバトル経路ではない＝bySource 付き（このシグニとの/による）は適用しない。
            // 被バニッシュ＝topNum（currentOwner の dieZoneP0）。target.filter で絞る（タスク12(xliv)(a)）。
            const base = parseInt(battleCardMap.get(topNum)?.Level ?? '', 10);
            const p0Attrs = {
              level: isNaN(base) ? undefined
                : base + (currentOwner.temp_level_mods ?? []).filter(m => m.cardNum === topNum).reduce((sum, m) => sum + m.delta, 0),
              frozen: (currentOwner.field.signi_frozen?.[dieZoneP0] ?? false),
              hasCharm: (currentOwner.field.signi_charms?.[dieZoneP0] ?? null) !== null,
              infected: (currentOwner.field.signi_virus?.[dieZoneP0] ?? 0) > 0,
            };
            return n && (effectsMap.get(n) ?? []).some(e =>
              e.effectType === 'CONTINUOUS' &&
              banishRedirectAppliesFrom(e.action, n, null, p0Attrs) &&
              checkActiveCondition(e.activeCondition, opState, currentOwner, opIsOwnerTurnP0, battleCardMap, n),
            );
          });
        const redirectBanishToHandP0 = opState.banish_redirect_to_hand === true;
        // BANISH_REDIRECT redirectTo:'exile'（SPDi47-05）: エナの代わりにゲームから除外（どのゾーンにも置かない）
        const redirectBanishToExileP0 = !redirectBanishP0 && !redirectBanishToHandP0 && opState.banish_redirect_to_exile === true;
        // OPP_SIGNI_ENERGY_TO_DECK_BOTTOM (WX25-CP1-003): エナの代わりにデッキの一番下へ
        const energyToBottomP0 = !redirectBanishP0 && !redirectBanishToHandP0 && !redirectBanishToExileP0 && removed.opp_signi_energy_to_deck_bottom === true;
        const withBanished: PlayerState = redirectBanishP0
          ? { ...removed, trash: [...removed.trash, topNum] }
          : redirectBanishToHandP0
            ? { ...removed, hand: [...removed.hand, topNum] }
            : redirectBanishToExileP0
              ? removed
              : energyToBottomP0
                ? { ...removed, deck: [...removed.deck, topNum] }
                : { ...removed, energy: [...removed.energy, topNum] };
        if (ownerIsHost) hostState = withBanished; else guestState = withBanished;
        const banishedName = battleCardMap.get(topNum)?.CardName ?? topNum;
        appendBattleLogs([`${banishedName}はパワー0以下のためバニッシュ${redirectBanishP0 ? '（トラッシュへ）' : redirectBanishToHandP0 ? '（手札へ）' : redirectBanishToExileP0 ? '（ゲームから除外）' : energyToBottomP0 ? '（エナ代替→デッキ下）' : ''}`]);

        // usageLimit 消費は収集ごとに actions_done へ畳み込む（同一パスで複数シグニが0化しても《ターン1回》は1度だけ）。
        const usePZ = (r: { usedHostIds: string[]; usedGuestIds: string[] }) => {
          if (r.usedHostIds.length > 0) hostState = { ...hostState, actions_done: [...(hostState.actions_done ?? []), ...r.usedHostIds] };
          if (r.usedGuestIds.length > 0) guestState = { ...guestState, actions_done: [...(guestState.actions_done ?? []), ...r.usedGuestIds] };
        };
        const bt = collectBanishTriggers(topNum, ownerId, hostState, guestState);
        allTriggers.push(...bt.entries); usePZ(bt);
        // パワー0以下になったとき（ON_SIGNI_POWER_ZERO_OR_LESS）を監視するシグニのトリガーも収集。
        // 同パスで複数シグニが同時に0化した場合の once_per_turn 重複発火を避けるため effectId で dedup。
        const pz = collectPowerZeroTriggers(topNum, ownerId, hostState, guestState);
        allTriggers.push(...pz.entries.filter(e => !allTriggers.some(a => a.effectId === e.effectId))); usePZ(pz);
      }
    }

    const changed = candidates.length > 0;
    if (!changed) return;
    setLoading(true);
    try {
      let newStack = bs.effect_stack as EffectStack | null;
      if (allTriggers.length > 0) {
        newStack = initStack(bs.active_user_id!, allTriggers);
      }
      await supabase.from('battle_states').update({
        host_state: hostState,
        guest_state: guestState,
        ...(newStack !== bs.effect_stack ? { effect_stack: newStack } : {}),
      }).eq('room_id', roomId);
    } finally {
      setLoading(false);
    }
  };

  // CONTINUOUS BANISH / FREEZE / DOWN の自動適用（mandatory 効果のみ）
  const checkAndApplyContMutations = async () => {
    if (!bs || loading || bs.global_phase !== 'PLAYING') return;
    if (bs.effect_stack || bs.pending_effect) return;
    const hostIsActive = bs.active_user_id === bs.host_id;
    const mutations = calcContinuousSigniMutations(
      bs.host_state, bs.guest_state, hostIsActive, effectsMap, battleCardMap,
    );
    if (mutations.length === 0) return;
    const mutKey = mutations.map(m => `${m.effectId}:${m.targetNums.sort().join(',')}`).sort().join('|');
    if (mutKey === lastContMutationKeyRef.current) return;
    lastContMutationKeyRef.current = mutKey;

    let hostState  = bs.host_state;
    let guestState = bs.guest_state;
    const allTriggers: import('../types').StackEntry[] = [];

    for (const mut of mutations) {
      for (const num of mut.targetNums) {
        const targetState = mut.targetIsHost ? hostState : guestState;
        const cardName = battleCardMap.get(num)?.CardName ?? num;

        if (mut.type === 'BANISH') {
          const removed = removeFromField(num, targetState);
          // OPP_SIGNI_ENERGY_TO_DECK_BOTTOM (WX25-CP1-003): エナの代わりにデッキの一番下へ
          const withBanished: import('../types').PlayerState = removed.opp_signi_energy_to_deck_bottom === true
            ? { ...removed, deck: [...removed.deck, num] }
            : { ...removed, energy: [...removed.energy, num] };
          if (mut.targetIsHost) hostState = withBanished; else guestState = withBanished;
          appendBattleLogs([`${cardName}をバニッシュ（常時効果）`]);
          const ownerId = mut.targetIsHost ? bs.host_id : bs.guest_id;
          const bt = collectBanishTriggers(num, ownerId, hostState, guestState);
          allTriggers.push(...bt.entries);
          // usageLimit 消費を actions_done へ畳み込む（同一パスで複数体バニッシュしても《ターン1回》は1度だけ）
          if (bt.usedHostIds.length > 0) hostState = { ...hostState, actions_done: [...(hostState.actions_done ?? []), ...bt.usedHostIds] };
          if (bt.usedGuestIds.length > 0) guestState = { ...guestState, actions_done: [...(guestState.actions_done ?? []), ...bt.usedGuestIds] };
        } else if (mut.type === 'FREEZE') {
          const zoneIdx = targetState.field.signi.findIndex(s => s?.at(-1) === num);
          if (zoneIdx < 0) continue;
          const newFrozen = [...(targetState.field.signi_frozen ?? [false, false, false])] as boolean[];
          const newDown   = [...(targetState.field.signi_down   ?? [false, false, false])] as boolean[];
          newFrozen[zoneIdx] = true;
          newDown[zoneIdx]   = true;
          const updated: import('../types').PlayerState = { ...targetState, field: { ...targetState.field, signi_frozen: newFrozen, signi_down: newDown } };
          if (mut.targetIsHost) hostState = updated; else guestState = updated;
          appendBattleLogs([`${cardName}をフリーズ（常時効果）`]);
        } else if (mut.type === 'DOWN') {
          const zoneIdx = targetState.field.signi.findIndex(s => s?.at(-1) === num);
          if (zoneIdx < 0) continue;
          const newDown = [...(targetState.field.signi_down ?? [false, false, false])] as boolean[];
          newDown[zoneIdx] = true;
          const updated: import('../types').PlayerState = { ...targetState, field: { ...targetState.field, signi_down: newDown } };
          if (mut.targetIsHost) hostState = updated; else guestState = updated;
          appendBattleLogs([`${cardName}をダウン（常時効果）`]);
        }
      }
    }

    // ON_SIGNI_DOWN（常時効果によるダウン/フリーズ＝byEffect:true・タスク16[C]機構①）
    {
      const downHost  = detectNewlyDowned(bs.host_state, hostState);
      const downGuest = detectNewlyDowned(bs.guest_state, guestState);
      if (downHost.length > 0 || downGuest.length > 0) {
        const dn = pureCollectSigniDownUpTriggers(mkTrigCtx(), 'ON_SIGNI_DOWN',
          [{ ownerId: bs.host_id, nums: downHost, byEffect: true }, { ownerId: bs.guest_id, nums: downGuest, byEffect: true }], hostState, guestState);
        allTriggers.push(...dn.entries);
        if (dn.usedHostIds.length > 0) hostState = { ...hostState, actions_done: [...(hostState.actions_done ?? []), ...dn.usedHostIds] };
        if (dn.usedGuestIds.length > 0) guestState = { ...guestState, actions_done: [...(guestState.actions_done ?? []), ...dn.usedGuestIds] };
      }
    }

    setLoading(true);
    try {
      let newStack = bs.effect_stack as import('../types').EffectStack | null;
      if (allTriggers.length > 0) {
        newStack = initStack(bs.active_user_id!, allTriggers);
      }
      await supabase.from('battle_states').update({
        host_state: hostState,
        guest_state: guestState,
        ...(newStack !== bs.effect_stack ? { effect_stack: newStack } : {}),
      }).eq('room_id', roomId);
    } finally {
      setLoading(false);
    }
  };

  // refs を常に最新の関数インスタンスに同期（Rules of Hooks 対応）
  doPhaseAdvanceRef.current                = doPhaseAdvance;
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
  const cpuTurnAction = async () => {
    if (!bs || bs.global_phase !== 'PLAYING') return;
    const cpuSt = bs.guest_state;   // CPUは常にguest
    const huSt  = bs.host_state;    // 人間は常にhost
    const isCpuTurnNow = bs.active_user_id === CPU_PLAYER_ID;

    // 人間がライフバースト処理中（チェックゾーンにカードあり）はCPU行動しない
    if (huSt.field?.check) return;

    // ─── ライフバースト確認（チェックゾーンのカードを処理）───
    if (cpuSt.field?.check) {
      const cardNum = cpuSt.field.check;
      const burstCard = battleCardMap.get(cardNum);
      // LIFE_BURST効果があれば発動する（対人戦と同じ共通処理：ON_LIFE_CRASHED・CRASH_TO_TRASH_INSTEADを含む）
      // WD14-001: 付与された【ライフバースト】も含めて判定
      const hasBurst = effectiveHasBurst(cardNum, cpuSt);
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
      appendBattleLogs([`[CPU] 同時クラッシュ：ライフクロスをクラッシュ（${battleCardMap.get(nextCard)?.CardName ?? nextCard}）`]);
      await supabase.from('battle_states').update({
        guest_state: { ...cpuSt, pending_crashed_cards: remaining, field: { ...cpuSt.field, check: nextCard } },
      }).eq('room_id', roomId);
      return;
    }

    // ─── CPUのON_ATTACK_LRIG処理完了後のガード応答セット（pending_lrig_attack）───
    if (cpuSt.pending_lrig_attack && !bs.effect_stack && !bs.pending_effect) {
      const cleanCpuSt: PlayerState = { ...cpuSt, pending_lrig_attack: undefined };
      const huStWithLrigAttacked: PlayerState = { ...huSt, field: { ...huSt.field, lrig_attacked: true } };
      await supabase.from('battle_states')
        .update({ guest_state: cleanCpuSt, host_state: huStWithLrigAttacked })
        .eq('room_id', roomId);
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
      // CPUはガードしない。対人戦と同じ共通処理でダメージ解決
      // （各種ダメージ無効・ダブルクラッシュ・敗北無効・MULTI_DAMAGE再アタックを含む）
      appendBattleLogs([`[CPU] ガードしない`]);
      await performGuardResponse(null, {
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

    // ─── ATTACK_ARTS_OPフェイズ：CPUが非ターンプレイヤーの場合はアーツ不使用でスキップ ───
    // ※ このチェックは !isCpuTurnNow の早期リターンより前に置く必要がある
    if (bs.turn_phase === 'ATTACK_ARTS_OP' && !isCpuTurnNow) {
      await supabase.from('battle_states').update({ turn_phase: 'ATTACK_SIGNI' }).eq('room_id', roomId);
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

    // ─── UPフェイズ（ドロー）───
    if (phase === 'UP') {
      appendBattleLogs([`[CPU] ${drawCount}枚ドロー`]);
      const cpuPreventRefresh = cpuSt.field.signi.some(s => {
        const top = s?.at(-1);
        return top && (effectsMap.get(top) ?? []).some(e =>
          e.effectType === 'CONTINUOUS' &&
          (e.action as import('../types/effects').StubAction).type === 'STUB' &&
          (e.action as import('../types/effects').StubAction).id === 'PREVENT_LIFE_REFRESH_TRASH',
        );
      });
      let newCpuSt: PlayerState = { ...drawCards(cpuSt, drawCount, cpuPreventRefresh), actions_done: ['DRAW'] };
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
      await supabase.from('battle_states').update({
        guest_state: newCpuSt,
        turn_phase: 'DRAW',
      }).eq('room_id', roomId);
      return;
    }

    // ─── DRAWフェイズ → ENERGYへ ───
    if (phase === 'DRAW') {
      await supabase.from('battle_states').update({ turn_phase: 'ENERGY' }).eq('room_id', roomId);
      return;
    }

    // ─── ENERGYフェイズ：手札の先頭1枚をエナチャージ ───
    if (phase === 'ENERGY') {
      let cpuAtGrowStart = cpuSt;
      const used    = cpuSt.actions_done?.includes('ENERGY') ?? false;
      const blocked = cpuSt.blocked_actions?.includes('ENERGY') ?? false;
      if (!used && !blocked && cpuSt.hand.length > 0) {
        const charged = cpuSt.hand[0];
        const chargedCard = battleCardMap.get(charged);
        appendBattleLogs([`[CPU] エナチャージ: ${chargedCard?.CardName ?? charged}`]);
        const newCpuSt: PlayerState = {
          ...cpuSt,
          hand: cpuSt.hand.slice(1),
          energy: [...cpuSt.energy, charged],
          actions_done: [...(cpuSt.actions_done ?? []), 'ENERGY'],
        };
        cpuAtGrowStart = newCpuSt;
        await supabase.from('battle_states').update({ guest_state: newCpuSt }).eq('room_id', roomId);
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
      await supabase.from('battle_states').update({
        turn_phase: 'GROW', guest_state: cpuAfterGps,
        ...(humanAfterGps ? { host_state: humanAfterGps } : {}),
        ...(gpsStack ? { effect_stack: gpsStack } : {}),
      }).eq('room_id', roomId);
      return;
    }

    // ─── GROWフェイズ：グロウ可能なら最初の候補でグロウ ───
    if (phase === 'GROW') {
      const grew    = cpuSt.actions_done?.includes('GROW') ?? false;
      // 静的封じ + CONTINUOUS（グロウフェイズスキップ常在）+ no_grow を考慮
      const cpuContBlockedGrow = calcContinuousBlockedActions(cpuSt, huSt, true, effectsMap, battleCardMap).forSelf.has('GROW');
      const blocked = (cpuSt.blocked_actions?.includes('GROW') ?? false) || cpuContBlockedGrow || (cpuSt.no_grow ?? false);
      if (!grew && !blocked) {
        const currentLrigId = cpuSt.field.lrig.at(-1) ?? null;
        const currentLrigNum = currentLrigId ? getCardNum(currentLrigId) : null;
        const currentLrigCard = currentLrigNum ? cards.find(c => c.CardNum === currentLrigNum) : null;
        const currentLevel = currentLrigCard ? parseInt(currentLrigCard.Level) || 0 : 0;

        // GROW_COST_REDUCTION（グロウコスト軽減・CONTINUOUS）を人間グロウと同様にCPUグロウにも適用。
        // CPUのGROWフェイズは常にCPU自身のターン（isCpuTurnNow）なのでisOwnerTurn=true。
        const cpuGrowRed = collectGrowCostReductions(cpuSt, huSt, isCpuTurnNow, effectsMap, battleCardMap);

        // lrig_deckはinstance IDを持つのでgetCardNum()でCardNumに変換して照合
        const growTargetId = cpuSt.lrig_deck.find(instanceId => {
          const cardNum = getCardNum(instanceId);
          const c = cards.find(card => card.CardNum === cardNum);
          if (!c || c.Type !== 'ルリグ') return false;
          if (parseInt(c.Level) !== currentLevel + 1) return false;
          // CardClass 互換チェック（人間グロウ候補フィルタと同じ）: グロウ元と共通クラスが無ければ不可
          if (currentLrigCard && !lrigClassesCompatible(currentLrigCard.CardClass, c.CardClass)) return false;
          // 【グロウ】条件チェック（人間グロウと同じ）: ライフ枚数・カード名・トラッシュ色数・エナ色種数・複数色制限
          if (!checkGrowCondition(extractGrowCondition(c.EffectText), cpuSt, currentLrigCard ?? undefined, battleCardMap)) return false;
          return canAffordGrowCost(cpuSt.energy, cards, applyGrowCostReduction(c.GrowCost, cpuGrowRed));
        });

        if (growTargetId) {
          const growCardNum = getCardNum(growTargetId);
          const growCard = cards.find(c => c.CardNum === growCardNum)!;
          appendBattleLogs([`[CPU] グロウ: ${growCard.CardName}（Lv.${growCard.Level}）`]);
          const costs = parseGrowCost(applyGrowCostReduction(growCard.GrowCost, cpuGrowRed));
          // エナから支払い
          let newEnergy = [...cpuSt.energy];
          for (const { color, count } of costs) {
            let paid = 0;
            newEnergy = newEnergy.filter(eNum => {
              if (paid >= count) return true;
              const eCard = cards.find(c => c.CardNum === getCardNum(eNum));
              const eColor = eCard?.Color ?? '';
              if (color === '無' || eColor.includes(color)) { paid++; return false; }
              return true;
            });
          }
          // lrig_deckはinstance IDなのでgrowTargetIdをそのまま除外・フィールドに積む
          const newLrigDeck = cpuSt.lrig_deck.filter(id => id !== growTargetId);
          // コイン獲得/グロウコイン消費（対人戦executeGrowと同じ）
          const coinGainCpu = parseInt(growCard.Coin) || 0;
          const growCoinCostCpu = parseCoinCost(growCard.GrowCost);
          let newCpuSt: PlayerState = {
            ...cpuSt,
            energy: newEnergy,
            lrig_deck: newLrigDeck,
            field: { ...cpuSt.field, lrig: [...cpuSt.field.lrig, growTargetId] },
            actions_done: [...(cpuSt.actions_done ?? []), 'GROW'],
            coins: Math.min(5, Math.max(0, (cpuSt.coins ?? 0) - growCoinCostCpu) + coinGainCpu),
          };
          // 【グロウ】条件の追加効果（人間executeGrowと同じ）: ルリグデッキから下に置く・除外する等。
          const cpuGrowCond = extractGrowCondition(growCard.EffectText);
          const { state: cpuAfterGrowEffect, log: cpuGrowEffectLog } = applyGrowEffect(cpuGrowCond, newCpuSt, battleCardMap);
          newCpuSt = cpuAfterGrowEffect;
          if (cpuGrowEffectLog) appendBattleLogs([`[CPU] ${cpuGrowEffectLog}`]);
          // game_grow_draw: グロウ時ドロー（GAIN_ABILITY_THIS_GAME・人間executeGrowと同じ）
          if (newCpuSt.game_grow_draw && newCpuSt.deck.length > 0) {
            newCpuSt = { ...newCpuSt, deck: newCpuSt.deck.slice(1), hand: [...newCpuSt.hand, newCpuSt.deck[0]] };
            appendBattleLogs(['[CPU] グロウ時ドロー（このゲーム）']);
          }
          // LIMIT_ALL_FIELD_N（WX04-005-E3 補足）: CPUがこの継続効果を持つルリグにグロウした場合、
          // CPU自身は自動削減（レベル高優先）、人間（host）は選択トラッシュをスタックに積む。
          const cpuGrownFieldLimit = computeFieldSigniLimit(newCpuSt, bs.host_state, effectsMap, getCardNum);
          const cpuLimitEntries: StackEntry[] = [];
          if (cpuGrownFieldLimit < 3) {
            const cRed = reduceFieldSigniToLimit(newCpuSt, cpuGrownFieldLimit, battleCardMap);
            newCpuSt = cRed.state;
            if (cRed.trashed.length > 0) {
              appendBattleLogs([`[CPU] 場出し数制限（上限${cpuGrownFieldLimit}体）で超過シグニをトラッシュに置いた`]);
            }
            const hostExcess = bs.host_state.field.signi.filter(s => (s ?? []).length > 0).length - cpuGrownFieldLimit;
            if (hostExcess > 0) {
              cpuLimitEntries.push({
                id: generateUUID(), playerId: bs.host_id, cardNum: '',
                effectId: '__field_limit_trash__',
                label: `場出し数制限：シグニ${hostExcess}体を選んでトラッシュに置く（残り${cpuGrownFieldLimit}体）`,
                effect: {
                  effectId: '__field_limit_trash__', effectType: 'AUTO', timing: [],
                  action: { type: 'TRASH', target: { type: 'SIGNI', owner: 'self', count: hostExcess } },
                  duration: 'INSTANT', mandatory: true,
                } as import('../types/effects').CardEffect,
              });
            }
          }
          // ルリグ【出】効果（対人戦executeGrowと同じ収集）:
          // mandatoryは発火、コインのみのコスト付き任意【出】は支払えるなら支払って発動
          const cpuGrowEntries: StackEntry[] = [];
          for (const eff of (effectsMap.get(growTargetId) ?? [])) {
            if (eff.effectType !== 'AUTO' || !eff.timing?.includes('ON_PLAY')) continue;
            let fire = eff.mandatory !== false;
            if (!fire && eff.cost?.coin && !eff.cost.energy && !eff.cost.discard) {
              if ((newCpuSt.coins ?? 0) >= eff.cost.coin) {
                newCpuSt = { ...newCpuSt, coins: (newCpuSt.coins ?? 0) - eff.cost.coin };
                appendBattleLogs([`[CPU] 《コイン》×${eff.cost.coin}を支払って【出】効果を発動`]);
                fire = true;
              }
            }
            if (!fire) continue;
            cpuGrowEntries.push({
              id: generateUUID(),
              playerId: CPU_PLAYER_ID,
              cardNum: growTargetId,
              effectId: eff.effectId,
              label: `${growCard.CardName} の【出】効果`,
              effect: eff,
            });
          }
          // ON_LRIG_GROW（C1 配線・CPUセンターグロウ）: CPU=guest のグロウに反応する【自】を収集。
          const cpuGrowReact = collectLrigGrowTriggers(CPU_PLAYER_ID, newCpuSt, bs.host_state);
          const cpuGrowReactEntries = cpuGrowReact.entries;
          // usageLimit（《ターン1回》）消費を actions_done へ永続化（CPU=guest／人間=host。続き135）
          if (cpuGrowReact.usedGuestIds.length > 0) {
            newCpuSt = { ...newCpuSt, actions_done: [...(newCpuSt.actions_done ?? []), ...cpuGrowReact.usedGuestIds] };
          }
          const humanStateAfterGrowReact: PlayerState | null = cpuGrowReact.usedHostIds.length > 0
            ? { ...bs.host_state, actions_done: [...(bs.host_state.actions_done ?? []), ...cpuGrowReact.usedHostIds] }
            : null;
          // ON_COIN_PAID（C1 配線・CPUグロウコストのコイン支払）
          const cpuGrowCoin = growCoinCostCpu > 0 ? collectCoinPaidTriggers(CPU_PLAYER_ID, newCpuSt, bs.host_state) : { entries: [] as StackEntry[], usedIds: [] as string[] };
          const cpuGrowCoinEntries = cpuGrowCoin.entries;
          const cpuStAfterCoin = applyCoinPaidUsed(newCpuSt, cpuGrowCoin); // 《ターン1回/2回》消化を永続化（続き106）
          // 場出し数制限の選択トラッシュ（人間相手）＋グロウ反応＋コイン支払反応＋ルリグ【出】効果をスタックに積む
          const cpuAllGrowEntries = [...cpuLimitEntries, ...cpuGrowReactEntries, ...cpuGrowCoinEntries, ...cpuGrowEntries];
          if (cpuAllGrowEntries.length > 0) {
            // スタックに積んで解決を待つ（GROWに留まり、解決後の再実行でMAINへ進む）
            const existingStackGR = bs.effect_stack ?? null;
            const newStackGR = existingStackGR
              ? pushToStack(existingStackGR, cpuAllGrowEntries)
              : initStack(bs.active_user_id ?? CPU_PLAYER_ID, cpuAllGrowEntries);
            await supabase.from('battle_states')
              .update({ guest_state: cpuStAfterCoin, effect_stack: newStackGR, ...(humanStateAfterGrowReact ? { host_state: humanStateAfterGrowReact } : {}) })
              .eq('room_id', roomId);
            return;
          }
          await supabase.from('battle_states')
            .update({ guest_state: cpuStAfterCoin, ...(humanStateAfterGrowReact ? { host_state: humanStateAfterGrowReact } : {}) })
            .eq('room_id', roomId);
          await new Promise(r => setTimeout(r, CPU_ACTION_DELAY));
        }
      }
      await supabase.from('battle_states').update({ turn_phase: 'MAIN' }).eq('room_id', roomId);
      return;
    }

    // ─── MAINフェイズ：シグニを手札から召喚（空きゾーンに1枚ずつ）───
    if (phase === 'MAIN') {
      if (bs.turn_count === 1) {
        // 先攻1ターン目はMAINからENDへ
        await supabase.from('battle_states').update({ turn_phase: 'END' }).eq('room_id', roomId);
        return;
      }
      const cpuLrigId = cpuSt.field.lrig.at(-1) ?? null;
      const cpuLrigNum = cpuLrigId ? getCardNum(cpuLrigId) : null;
      const cpuLrigCard = cpuLrigNum ? cards.find(c => c.CardNum === cpuLrigNum) : null;
      const cpuLimit     = cpuLrigCard?.Limit === '∞' ? Infinity : (parseInt(cpuLrigCard?.Limit ?? '0') || 0);
      const cpuLrigLevel = parseInt(cpuLrigCard?.Level ?? '0') || 0;

      // 現在のフィールドのシグニの合計レベル
      let fieldTotal = 0;
      for (const stack of cpuSt.field.signi) {
        if (!stack?.length) continue;
        const topNum = getCardNum(stack[stack.length - 1]);
        const topCard = cards.find(c => c.CardNum === topNum);
        fieldTotal += parseInt(topCard?.Level ?? '0') || 0;
      }

      // 手札のシグニをコストの低い順（レベル低い順）でフィルタ
      const handSignis = cpuSt.hand
        .map((id, idx) => ({ id, idx, card: cards.find(c => c.CardNum === getCardNum(id)) }))
        .filter(({ card }) => card && card.Type === 'シグニ')
        .sort((a, b) => (parseInt(a.card!.Level) || 0) - (parseInt(b.card!.Level) || 0));

      let newCpuSt = { ...cpuSt };
      // 配置したシグニの【出】/ON_PLAYトリガー（対人戦handleSummonSigniと同じ収集）
      const cpuOnPlayEntries: StackEntry[] = [];
      // 人間（host）側 watcher の usageLimit 消費を畳み込む作業用（huSt と異なれば host_state も併せて保存する）
      let cpuHuSt: PlayerState = huSt;
      // LIMIT_ALL_FIELD_N: シグニ場出し数の上限（WX04-005-E3）。CPU=guest, 人間=host。
      const cpuFieldSigniLimitBase = computeFieldSigniLimit(newCpuSt, bs.host_state, effectsMap, getCardNum);
      // DEPLOY_RESTRICT（配置数制限）: 相手（host）の CONT レゾナ＋自フラグ（このターン）の小さい方を上限に反映。
      const cpuDeployCap = (() => {
        const cont = collectDeployCountLimit(bs.host_state, newCpuSt, battleCardMap, effectsMap, false);
        const flag = newCpuSt.signi_deploy_count_limit;
        return flag !== undefined ? (cont !== undefined ? Math.min(flag, cont) : flag) : cont;
      })();
      const cpuFieldSigniLimit = cpuDeployCap !== undefined ? Math.min(cpuFieldSigniLimitBase, cpuDeployCap) : cpuFieldSigniLimitBase;

      for (let zone = 0; zone < 3; zone++) {
        if ((newCpuSt.field.signi[zone] ?? []).length > 0) continue; // ゾーン埋まってる
        if (handSignis.length === 0) break;
        // 場出し数上限に達していたら召喚しない
        if (newCpuSt.field.signi.filter(stk => (stk ?? []).length > 0).length >= cpuFieldSigniLimit) break;
        // FORCE_PLACE_FRONT: 人間（host）の該当シグニの正面ゾーンが空いている場合、そのゾーンにしか配置できない
        const cpuForcedFront = collectForcePlaceFrontZones(bs.host_state, newCpuSt, battleCardMap, effectsMap, false);
        if (cpuForcedFront.size > 0 && !cpuForcedFront.has(zone)) continue;

        // 召喚できるシグニを探す（リミット内 かつ シグニLv ≤ ルリグLv）
        const candidate = handSignis.find(({ card }) => {
          const lv = parseInt(card!.Level) || 0;
          return lv <= cpuLrigLevel && fieldTotal + lv <= cpuLimit;
        });
        if (!candidate) break;

        // エナ支払い（シグニのコスト）
        const signiCosts = parseGrowCost(candidate.card!.Cost);
        if (signiCosts.length > 0) {
          let canPay = true;
          let newEnergy = [...newCpuSt.energy];
          for (const { color, count } of signiCosts) {
            let paid = 0;
            const after = newEnergy.filter(eNum => {
              if (paid >= count) return true;
              const eCard = cards.find(c => c.CardNum === getCardNum(eNum));
              const eColor = eCard?.Color ?? '';
              if (color === '無' || eColor.includes(color)) { paid++; return false; }
              return true;
            });
            if (paid < count) { canPay = false; break; }
            newEnergy = after;
          }
          if (!canPay) {
            handSignis.splice(handSignis.indexOf(candidate), 1);
            continue;
          }
          newCpuSt = { ...newCpuSt, energy: newEnergy };
        }

        appendBattleLogs([`[CPU] シグニ配置: ${candidate.card!.CardName}（ゾーン${zone + 1}）`]);
        const newSigni = [...newCpuSt.field.signi] as (string[] | null)[];
        newSigni[zone] = [candidate.id];
        newCpuSt = {
          ...newCpuSt,
          hand: newCpuSt.hand.filter(id => id !== candidate.id),
          field: { ...newCpuSt.field, signi: newSigni },
        };
        const lv = parseInt(candidate.card!.Level) || 0;
        fieldTotal += lv;
        handSignis.splice(handSignis.indexOf(candidate), 1);

        // 【出】/ON_PLAYトリガー収集（コスト付き任意【出】はCPUは発動しない＝mandatory:falseを除外）
        const ownOnPlayCpu = (effectsMap.get(candidate.id) ?? []).filter(e =>
          e.effectType === 'AUTO' &&
          e.timing?.includes('ON_PLAY') &&
          // self/未指定に加え、'any'（「シグニが場に出たとき」=自身も含む。G085）も自身召喚時に発火
          (e.triggerScope === undefined || e.triggerScope === 'self' || e.triggerScope === 'any') &&
          e.mandatory !== false &&
          // byEffect/bySigniEffect:「（シグニの）効果によって場に出たとき」限定は通常召喚では発火しない
          !e.triggerCondition?.byEffect && !e.triggerCondition?.bySigniEffect &&
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
        const cpuFt = collectFieldTriggers('ON_PLAY', candidate.id, newCpuSt, cpuHuSt, CPU_PLAYER_ID);
        cpuOnPlayEntries.push(...cpuFt.entries);
        // usageLimit（《ターン1回/2回》）消費を actions_done へ永続化（CPU=guest／人間=host）。
        // 畳み込んだ状態を次ループの収集に渡すことで、同一ターンに複数体召喚しても《ターン1回》は1度だけ発火する（続き135）。
        if (cpuFt.usedGuestIds.length > 0) newCpuSt = { ...newCpuSt, actions_done: [...(newCpuSt.actions_done ?? []), ...cpuFt.usedGuestIds] };
        if (cpuFt.usedHostIds.length > 0) cpuHuSt = { ...cpuHuSt, actions_done: [...(cpuHuSt.actions_done ?? []), ...cpuFt.usedHostIds] };

        // 1枚ずつSupabaseを更新して画面に反映させてから次へ
        await supabase.from('battle_states')
          .update({ guest_state: newCpuSt, ...(cpuHuSt !== huSt ? { host_state: cpuHuSt } : {}) })
          .eq('room_id', roomId);
        await new Promise(r => setTimeout(r, CPU_ACTION_DELAY));
      }

      // 配置で【出】トリガーが発生した場合はスタックに積んで解決を待つ（MAINに留まり、解決後の再実行で先へ進む）
      if (cpuOnPlayEntries.length > 0) {
        const existingStackOP = bs.effect_stack ?? null;
        const newStackOP = existingStackOP
          ? pushToStack(existingStackOP, cpuOnPlayEntries)
          : initStack(bs.active_user_id ?? CPU_PLAYER_ID, cpuOnPlayEntries);
        await supabase.from('battle_states').update({ effect_stack: newStackOP }).eq('room_id', roomId);
        return;
      }

      // ── MAIN→ATTACK_ARTS 移行（アタックフェイズ開始時）。以下のトリガーを1つのスタックに集約し、
      //    フェイズを ATTACK_ARTS へ進めながら積む（MAIN に留まると再実行で無限収集になるため）。
      const cpuTurnPlayerId = bs.active_user_id ?? CPU_PLAYER_ID;
      const apsStackEntries: StackEntry[] = [];

      // ON_ATTACK_PHASE_START: CPU自身のアタックフェイズ開始時トリガー（self scope）。
      // 人間ターンは doPhaseAdvance の collectTurnTriggers が担うが、CPUターンはここで収集しないと発火しない。
      // 付与能力（WXDi-P10-072 が相手＝CPUシグニへ与える自己ミル等）も effectsMap が付与合成済みのためここで拾う。
      for (const stack of newCpuSt.field.signi) {
        if (!stack?.length) continue;
        const topNum = stack[stack.length - 1];
        for (const eff of (effectsMap.get(topNum) ?? [])) {
          if (eff.effectType !== 'AUTO' || !eff.timing?.includes('ON_ATTACK_PHASE_START')) continue;
          if ((eff.triggerScope ?? 'self') !== 'self') continue;
          if (eff.condition && !evalUseCondition(eff.condition, newCpuSt, huSt, battleCardMap, topNum, bs.turn_phase, effectivePowers)) continue;
          const cardName = battleCardMap.get(topNum)?.CardName ?? topNum;
          apsStackEntries.push({
            id: generateUUID(),
            playerId: CPU_PLAYER_ID,
            cardNum: topNum,
            effectId: eff.effectId,
            label: `${cardName} の【自】効果（アタックフェイズ開始時）`,
            effect: eff,
          });
        }
      }

      // HASTARLIQ: CPUのMAIN→ATTACK_ARTS移行時、相手(人間)の hastarliq_zones があれば発動
      const huStForHL = isHost ? bs.guest_state : bs.host_state;
      const huKeyForHL = isHost ? 'guest_state' : 'host_state';
      const hlZonesCpu = huStForHL.hastarliq_zones ?? [];
      const huUpdate: Partial<BattleStateRow> = {};
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
            action: { type: 'STUB', id: 'HASTARLIQ_TRIGGER', value: zi } as import('../types/effects').StubAction,
            duration: 'INSTANT' as const,
            mandatory: true,
            parseStatus: 'AUTO' as const,
          },
        } satisfies StackEntry)));
        huUpdate[huKeyForHL] = { ...huStForHL, hastarliq_zones: undefined };
      }

      const apsUpdate: Partial<BattleStateRow> = { turn_phase: 'ATTACK_ARTS', ...huUpdate };
      if (apsStackEntries.length > 0) {
        const existingStackAPS = bs.effect_stack ?? null;
        apsUpdate.effect_stack = existingStackAPS
          ? pushToStack(existingStackAPS, apsStackEntries)
          : initStack(cpuTurnPlayerId, apsStackEntries);
      }
      await supabase.from('battle_states').update(apsUpdate).eq('room_id', roomId);
      return;
    }

    // ─── ATTACK_ARTSフェイズ：アーツ不使用でスキップ ───
    if (phase === 'ATTACK_ARTS') {
      await supabase.from('battle_states').update({ turn_phase: 'ATTACK_ARTS_OP' }).eq('room_id', roomId);
      return;
    }

    // ─── ATTACK_SIGNIフェイズ：全シグニでアタック ───
    if (phase === 'ATTACK_SIGNI') {
      // まだダウンしていない（かつアタック可能な）シグニを1枚ずつアタック
      const signiDown = cpuSt.field.signi_down ?? [false, false, false];
      const firstUp = cpuSt.field.signi.findIndex((stack, i) => {
        const top = (stack ?? []).at(-1);
        if (!top || signiDown[i]) return false;
        // アタック不可のシグニはダウンされず performSigniAttack が早期returnして
        // 無限ループするため、ここで候補から除外する
        if (cpuSt.blocked_actions?.includes(`ATTACK:${top}`)) return false;
        return true;
      });

      if (firstUp >= 0) {
        const myTopNum = (cpuSt.field.signi[firstUp] ?? []).at(-1)!;
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
      await supabase.from('battle_states').update({ turn_phase: 'ATTACK_LRIG' }).eq('room_id', roomId);
      return;
    }

    // ─── ATTACK_LRIGフェイズ：ルリグアタック ───
    if (phase === 'ATTACK_LRIG') {
      if (!cpuSt.field.lrig_down) {
        // 対人戦と同じ共通処理（追加コスト・ON_ATTACK_LRIGトリガー収集を含む）
        const attacked = await performLrigAttack({
          attacker: cpuSt, defender: huSt,
          attackerId: CPU_PLAYER_ID, attackerKey: 'guest_state',
        });
        if (attacked) return;
        // アタック不可（ドライブ状態・無効化等）→ そのままENDへ進む
      }
      // ガード応答待ち・ライフバースト処理中はENDへ進まない
      if (huSt.field.lrig_attacked || huSt.field.check) return;
      // ルリグアタック済み → ENDへ
      await supabase.from('battle_states').update({ turn_phase: 'END' }).eq('room_id', roomId);
      return;
    }

    // ─── ENDフェイズ：ターン終了処理 ───
    if (phase === 'END') {
      const curHuDown   = huSt.field.signi_down   ?? [false, false, false];
      const curHuFrozen = huSt.field.signi_frozen  ?? [false, false, false];
      const curHuLrigFrozen = huSt.field.lrig_frozen ?? false;
      const nextHuSt = { ...huSt,
        turn_arts_used: undefined, turn_arts_used_colors: undefined, // CPUターン中のガード使用分をリセット（ARTS_USED_THIS_TURN）
        signi_deploy_count_limit: undefined, // 配置数制限（このターン・CPUにかけられた分）を人間のターン開始時にリセット
        field: {
        ...huSt.field,
        // 凍結中のシグニはアップしない（frozen=true かつ down=true はそのまま残す）
        signi_down:   curHuDown.map((d, i) => d && curHuFrozen[i]) as boolean[],
        signi_frozen: [false, false, false] as boolean[],
        lrig_down:    (huSt.field.lrig_down ?? false) && curHuLrigFrozen,
        lrig_frozen:  false,
        assist_lrig_l_down: false,
        assist_lrig_r_down: false,
      }};
      // turn_end_draw_count: このターン終了時、カードをN枚引く（DRAW_AT_TURN_END。場を離れても引く）
      let cpuHandEND = cpuSt.hand;
      let cpuDeckEND = cpuSt.deck;
      if ((cpuSt.turn_end_draw_count ?? 0) > 0) {
        const drawnCPU = cpuDeckEND.slice(0, cpuSt.turn_end_draw_count);
        cpuDeckEND = cpuDeckEND.slice(cpuSt.turn_end_draw_count);
        cpuHandEND = [...cpuHandEND, ...drawnCPU];
        appendBattleLogs([`ターン終了時：CPUがカードを${drawnCPU.length}枚引く`]);
      }
      const cleanCpuSt: PlayerState = {
        ...cpuSt,
        hand: cpuHandEND, deck: cpuDeckEND, turn_end_draw_count: undefined,
        temp_power_mods: [], temp_level_mods: [], keyword_grants: {}, granted_effects: {}, blocked_actions: [], actions_done: [],
        life_crashed_this_turn: undefined,
        delayed_triggers: undefined,  // INSTALL_DELAYED_TRIGGER（B3）「このターン」設置の遅延トリガーをクリア
        keys_abilities_disabled: undefined, // CONDITIONAL_GROW_AND_KEY_DISABLE「このターン」キー能力喪失をクリア
        pending_crashed_cards: [], must_attack_signi: undefined, must_attack_infected_only: undefined, prevent_next_damage: undefined,
        damage_replace_mill: undefined, // ターン内ダメージ置換（REPLACE_NEXT_DAMAGE_WITH_MILL）をリセット
        prevent_damage_windows: advancePreventDamageWindows(cpuSt.prevent_damage_windows), // PREVENT_DAMAGE：「次のターンの間」は1回だけ持ち越し
        attacked_signi_ids: undefined, // 共通アタック処理（performSigniAttack）が記録するためリセット
        cost_modifiers: (cpuSt.cost_modifiers ?? []).filter(m => m.until !== 'END_OF_TURN'),
        lrig_granted_auto_effects: cpuSt.lrig_granted_auto_effects?.filter(e => e.permanentGrant),
        banish_redirect: undefined, banish_redirect_to_hand: undefined, banish_redirect_to_exile: undefined,
        power0_banish_to_trash: undefined, power0_banish_to_trash_opp_only: undefined, double_power_minus_this_turn: undefined,
        lrig_has_attacked: undefined, // ルリグアタック済みフラグをリセット
        pending_signi_battle: undefined, // シグニバトル解決待ちフラグをリセット
        pending_lrig_attack: undefined,  // ルリグアタック解決待ちフラグをリセット
        turn_arts_used: undefined, turn_arts_used_colors: undefined,       // このターンのアーツ使用フラグをリセット（ARTS_USED_THIS_TURN）
      };
      await supabase.from('battle_states').update({
        guest_state: cleanCpuSt,
        host_state: nextHuSt,
        turn_phase: 'UP',
        active_user_id: user.id,
        turn_count: bs.turn_count + 1,
      }).eq('room_id', roomId);
    }
  };
  cpuTurnRef.current = cpuTurnAction;

  // GUARD_ALTERNATIVE_COST: エナゾーンから指定クラスのシグニをトラッシュしてガード
  const handleGuardWithEnergyAlternative = async () => {
    if (!my.field.lrig_attacked || loading) return;
    const altCost = collectGuardAlternativeCost(my, battleCardMap, effectsMap);
    if (!altCost) return;
    const energySigni = my.energy.filter(cn => {
      const c = battleCardMap.get(cn);
      return c?.Type === 'シグニ' && (c.CardClass ?? '').includes(altCost.signiClass);
    });
    if (energySigni.length === 0) return;
    setLoading(true);
    try {
      const stateKey = isHost ? 'host_state' : 'guest_state';
      const trashTarget = energySigni[0]; // 最初の該当シグニをトラッシュ
      // ON_GUARD: 代替コストによるガードも【ガード】したときに含まれる
      const { entries: guardTriggers, usedOncePerTurnIds: guardUsedIds } =
        collectSelfEventTriggers('ON_GUARD', my, op, 'ガード時');
      const attackerId = isHost ? bs.guest_id : bs.host_id;
      const attackGuard = collectLrigAttackGuardedTriggers(attackerId, op, my);
      guardTriggers.push(...attackGuard.entries);
      const newMyState: PlayerState = {
        ...my,
        energy: my.energy.filter(cn => cn !== trashTarget),
        trash: [...my.trash, trashTarget],
        field: { ...my.field, lrig_attacked: false },
        actions_done: guardUsedIds.length > 0 ? [...(my.actions_done ?? []), ...guardUsedIds] : my.actions_done,
      };
      appendBattleLogs([`ガード代替コスト：エナ＜${altCost.signiClass}＞（${battleCardMap.get(trashTarget)?.CardName ?? trashTarget}）をトラッシュ`]);
      const opKey = isHost ? 'guest_state' : 'host_state';
      const newOpState = attackGuard.usedOncePerTurnIds.length > 0
        ? { ...op, actions_done: [...(op.actions_done ?? []), ...attackGuard.usedOncePerTurnIds] }
        : op;
      const update: Record<string, unknown> = { [stateKey]: newMyState, [opKey]: newOpState };
      if (guardTriggers.length > 0) {
        const existingStack = bs.effect_stack ?? null;
        update.effect_stack = existingStack
          ? pushToStack(existingStack, guardTriggers)
          : initStack(bs.active_user_id ?? user.id, guardTriggers);
      }
      await supabase.from('battle_states').update(update).eq('room_id', roomId);
    } finally { setLoading(false); }
  };

  // game_guard_alt_hand: 手札N枚を捨ててガード（ガードアイコン不要の代替）
  const handleGuardWithHandAlternative = async () => {
    if (!my.field.lrig_attacked || loading) return;
    const altN = my.game_guard_alt_hand ?? 0;
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
      const attackGuard = collectLrigAttackGuardedTriggers(attackerId, op, my);
      guardTriggers.push(...attackGuard.entries);
      const newMyState: PlayerState = {
        ...my,
        hand: my.hand.slice(0, -altN),
        trash: [...my.trash, ...discarded],
        field: { ...my.field, lrig_attacked: false },
        actions_done: guardUsedIds.length > 0 ? [...(my.actions_done ?? []), ...guardUsedIds] : my.actions_done,
      };
      appendBattleLogs([`ガード代替：手札${altN}枚を捨てる（${discarded.map(cn => battleCardMap.get(cn)?.CardName ?? cn).join('、')}）`]);
      const opKey = isHost ? 'guest_state' : 'host_state';
      const newOpState = attackGuard.usedOncePerTurnIds.length > 0
        ? { ...op, actions_done: [...(op.actions_done ?? []), ...attackGuard.usedOncePerTurnIds] }
        : op;
      const update: Record<string, unknown> = { [stateKey]: newMyState, [opKey]: newOpState };
      if (guardTriggers.length > 0) {
        const existingStack = bs.effect_stack ?? null;
        update.effect_stack = existingStack
          ? pushToStack(existingStack, guardTriggers)
          : initStack(bs.active_user_id ?? user.id, guardTriggers);
      }
      await supabase.from('battle_states').update(update).eq('room_id', roomId);
    } finally { setLoading(false); }
  };

  // ガード応答: handIndex=ガードカードのインデックス、null=ガードしない
  // ルリグアタックへのガード応答（人間・CPU共通）。handIndex=null は「ガードしない」（ダメージ解決）
  const performGuardResponse = async (handIndex: number | null, p: {
    responder: PlayerState; attacker: PlayerState;
    responderId: string; attackerId: string;
    responderKey: 'host_state' | 'guest_state';
  }) => {
    const { responder: my, attacker: op, responderId, attackerId } = p;
    if (!my.field.lrig_attacked) return;
    setLoading(true);
    try {
      const stateKey = p.responderKey;
      let newMyState: PlayerState;
      let guardTriggers: StackEntry[] = [];
      let attackGuardUsedIds: string[] = [];
      if (handIndex !== null) {
        // ガードカードをトラッシュへ
        const cardNum = my.hand[handIndex];
        const guardCardName = battleCardMap.get(cardNum)?.CardName ?? cardNum;
        // OPP_GUARD_COST_COLORLESS: 相手フィールドにアクティブな場合、追加で無色エナを1枚消費
        // （ガードは常に相手ターン中＝防御側は非ターンプレイヤー）
        const needsExtraEnergy = collectOppGuardExtraColorlessCost(op, my, battleCardMap, effectsMap, true);
        // EXTRA_GUARD_COST_FROM_HAND: 相手フィールドにアクティブな場合、手札から追加でガードカードを1枚捨てる
        const needsExtraGuardCard = collectOppExtraGuardFromHand(op, battleCardMap, effectsMap);
        // game_opp_extra_guard_hand_or_colorless: 相手が能力付与→ガード時に追加でエナか手札捨て
        const needsOppHandOrColorless = (op.game_opp_extra_guard_hand_or_colorless ?? 0) > 0;
        let energyAfterGuard = my.energy;
        const extraTrash: string[] = [];
        if (needsExtraEnergy && my.energy.length > 0) {
          const removedEnergy = my.energy[my.energy.length - 1];
          energyAfterGuard = my.energy.slice(0, -1);
          extraTrash.push(removedEnergy);
        }
        if (needsOppHandOrColorless) {
          // エナがあれば消費、なければ手札を1枚捨てる
          if (energyAfterGuard.length > 0) {
            const removedEnHOC = energyAfterGuard[energyAfterGuard.length - 1];
            energyAfterGuard = energyAfterGuard.slice(0, -1);
            extraTrash.push(removedEnHOC);
          } else {
            const extraHandIdx = my.hand.findIndex((_, i) => i !== handIndex);
            if (extraHandIdx >= 0) extraTrash.push(my.hand[extraHandIdx]);
          }
        }
        if (needsExtraGuardCard) {
          const extraGuardIdx = my.hand.findIndex((cn, i) => i !== handIndex && (battleCardMap.get(cn)?.Guard === '1'));
          if (extraGuardIdx >= 0) {
            const extraGuardNum = my.hand[extraGuardIdx];
            extraTrash.push(extraGuardNum);
            appendBattleLogs([`ガード（${guardCardName}）＋追加コスト：手札ガードカード（${battleCardMap.get(extraGuardNum)?.CardName ?? extraGuardNum}）を捨てる`]);
          } else {
            appendBattleLogs([`ガード（${guardCardName}）（追加ガードカードなし）`]);
          }
        } else if (needsOppHandOrColorless) {
          appendBattleLogs([`ガード（${guardCardName}）＋追加コスト（手札か《無》）消費`]);
        } else if (needsExtraEnergy && energyAfterGuard.length < my.energy.length) {
          appendBattleLogs([`ガード（${guardCardName}）＋追加コスト《無》消費`]);
        } else {
          appendBattleLogs([`ガード（${guardCardName}）`]);
        }
        // 手札から除外: ガードカード本体 + extraTrash に含まれる手札カード
        const handExtraTrashNums = new Set(extraTrash.filter(cn => my.hand.includes(cn)));
        const handAfterExtraGuard = my.hand.filter((cn, i) => i !== handIndex && !handExtraTrashNums.has(cn));
        newMyState = {
          ...my,
          hand: handAfterExtraGuard,
          trash: [...my.trash, cardNum, ...extraTrash],
          energy: energyAfterGuard,
          field: { ...my.field, lrig_attacked: false },
        };
        // ON_GUARD: 自フィールドシグニの「あなたが【ガード】したとき」トリガーを収集
        const { entries: guardEntries, usedOncePerTurnIds: guardUsedIds } =
          collectSelfEventTriggers('ON_GUARD', my, op, 'ガード時', responderId);
        const attackGuard = collectLrigAttackGuardedTriggers(attackerId, op, my);
        guardTriggers = [...guardEntries, ...attackGuard.entries];
        attackGuardUsedIds = attackGuard.usedOncePerTurnIds;
        if (guardUsedIds.length > 0) {
          newMyState = { ...newMyState, actions_done: [...(newMyState.actions_done ?? []), ...guardUsedIds] };
        }
      } else {
        // ガードしない → ライフクロスをクラッシュ
        // 攻撃側ルリグのダブルクラッシュ確認
        const opLrigNum = op.field.lrig.at(-1);
        const opLrigHasDoubleCrush = !!(opLrigNum && (op.keyword_grants?.[opLrigNum] ?? []).includes('ダブルクラッシュ'));
        // PREVENT_DAMAGE ウィンドウ（scope='ALL' も 'LRIG' もルリグアタックのダメージを無効）＝期間内は回数無制限。
        // 消費型（バリア／prevent_next_damage／置換ミル）を無駄遣いさせないため最初に判定する。
        if ((my.prevent_damage_windows ?? []).length > 0) {
          appendBattleLogs([`ルリグアタック：ダメージ無効（ダメージを受けない効果）`]);
          newMyState = { ...my, field: { ...my.field, lrig_attacked: false } };
        } else if (countBarrierTokens(my.field.free_zone, LRIG_BARRIER_CARD) > 0) {
          const fzLB = removeOneBarrierToken(my.field.free_zone, LRIG_BARRIER_CARD);
          appendBattleLogs([`ルリグアタック：ルリグバリア発動（残${countBarrierTokens(fzLB, LRIG_BARRIER_CARD)}）`]);
          newMyState = { ...my, field: { ...my.field, free_zone: fzLB, lrig_attacked: false } };
        } else if ((my.prevent_next_damage ?? 0) > 0) {
          appendBattleLogs([`ルリグアタック：ダメージ無効`]);
          newMyState = { ...my, prevent_next_damage: (my.prevent_next_damage ?? 0) - 1, field: { ...my.field, lrig_attacked: false } };
        } else if ((my.damage_replace_mill ?? []).some(n => my.deck.length >= n)) {
          // REPLACE_NEXT_DAMAGE_WITH_MILL: ルリグアタックのダメージを「デッキ上N枚トラッシュ」で置き換え（crashOneLife と同仕様）
          const drmL = my.damage_replace_mill ?? [];
          const diL = drmL.findIndex(n => my.deck.length >= n);
          const nL = drmL[diL];
          appendBattleLogs([`ルリグアタック：ダメージ置換＝代わりにデッキの上から${nL}枚をトラッシュに置く`]);
          newMyState = {
            ...my,
            deck: my.deck.slice(nL),
            trash: [...my.trash, ...my.deck.slice(0, nL)],
            damage_replace_mill: drmL.filter((_, i) => i !== diL),
            field: { ...my.field, lrig_attacked: false },
          };
        } else if (my.prevent_lrig_damage || (() => {
          // PREVENT_LRIG_DAMAGE (条件付き): activeCondition を正確に評価
          return my.field.signi.some((stack) => {
            const top = stack?.at(-1); if (!top) return false;
            return (effectsMap.get(top) ?? []).some(eff =>
              eff.effectType === 'CONTINUOUS' &&
              (eff.action as import('../types/effects').StubAction).type === 'STUB' &&
              (eff.action as import('../types/effects').StubAction).id === 'PREVENT_LRIG_DAMAGE' &&
              checkActiveCondition(eff.activeCondition, my, op, false, battleCardMap, top),
            );
          });
        })()) {
          appendBattleLogs([`ルリグアタック：ルリグダメージ無効`]);
          newMyState = { ...my, prevent_lrig_damage: undefined, field: { ...my.field, lrig_attacked: false } };
        } else if (my.life_cloth.length > 0) {
          const crashed = my.life_cloth[my.life_cloth.length - 1];
          const crashedName = battleCardMap.get(crashed)?.CardName ?? crashed;
          let lifeAfterCrash = my.life_cloth.slice(0, -1);
          let pendingAfterCrash = my.pending_crashed_cards ?? [];
          if (opLrigHasDoubleCrush && lifeAfterCrash.length > 0) {
            const secondCard = lifeAfterCrash[lifeAfterCrash.length - 1];
            lifeAfterCrash = lifeAfterCrash.slice(0, -1);
            pendingAfterCrash = [...pendingAfterCrash, secondCard];
            appendBattleLogs([`ルリグアタック：ダブルクラッシュ（${crashedName}、${battleCardMap.get(secondCard)?.CardName ?? secondCard}）`]);
          } else {
            appendBattleLogs([`ルリグアタック：ライフクロスをクラッシュ（${crashedName}）`]);
          }
          newMyState = {
            ...my,
            life_cloth: lifeAfterCrash,
            pending_crashed_cards: pendingAfterCrash,
            field: { ...my.field, lrig_attacked: false, check: crashed },
          };
        } else if (my.prevent_defeat) {
          appendBattleLogs([`ルリグアタック：ライフなし → 敗北無効`]);
          newMyState = { ...my, prevent_defeat: undefined, field: { ...my.field, lrig_attacked: false } };
        } else {
          // ライフクロス0枚 → 自分の敗北
          appendBattleLogs([`ルリグアタック：ライフなし → 敗北`]);
          const winnerId = attackerId;
          const clearedMyState: PlayerState = { ...my, field: { ...my.field, lrig_attacked: false } };
          await supabase.from('battle_states')
            .update({ [stateKey]: clearedMyState, global_phase: 'FINISHED', winner_id: winnerId })
            .eq('room_id', roomId);
          return;
        }
      }
      // MULTI_DAMAGE_ON_LRIG_ATTACK: 攻撃側に残りアタック回数があれば再トリガー
      const oppStateKey = stateKey === 'host_state' ? 'guest_state' : 'host_state';
      let newOpState = op;
      if (op.lrig_attack_remaining && op.lrig_attack_remaining > 0) {
        const rem = op.lrig_attack_remaining - 1;
        newOpState = { ...op, lrig_attack_remaining: rem > 0 ? rem : undefined };
        // バースト処理中でない場合は即座に再アタック、バースト中はcheck解消後に再表示
        newMyState = { ...newMyState, field: { ...newMyState.field, lrig_attacked: true } };
        appendBattleLogs([`ルリグアタック継続（残り${rem}回）`]);
      }
      if (attackGuardUsedIds.length > 0) {
        newOpState = { ...newOpState, actions_done: [...(newOpState.actions_done ?? []), ...attackGuardUsedIds] };
      }
      const guardUpdate: Record<string, unknown> = { [stateKey]: newMyState, [oppStateKey]: newOpState };
      if (guardTriggers.length > 0) {
        const existingStack = bs.effect_stack ?? null;
        guardUpdate.effect_stack = existingStack
          ? pushToStack(existingStack, guardTriggers)
          : initStack(bs.active_user_id ?? attackerId, guardTriggers);
      }
      await supabase.from('battle_states').update(guardUpdate).eq('room_id', roomId);
    } finally {
      setLoading(false);
    }
  };

  // ガード応答（人間プレイヤー用エントリポイント）
  const handleGuardResponse = async (handIndex: number | null) => {
    if (loading) return;
    await performGuardResponse(handIndex, {
      responder: my,
      attacker: op,
      responderId: user.id,
      attackerId: isHost ? bs.guest_id : bs.host_id,
      responderKey: isHost ? 'host_state' : 'guest_state',
    });
  };

  // GRANT_ALL_ZONE_LIFEBURST: このプレイヤーの場に「全領域の【ライフバースト】を持たないカードへ
  // 【ライフバースト】を付与」する CONTINUOUS 効果がある場合、その STUB を返す（無ければ null）。
  // WD14-001＝フィルタなし（全カード）・BANISH（既定）。WX17-036＝＜怪異＞シグニ限定・TRASH（burstFilter/burstAction 指定）。
  const getAllZoneBurstGrant = (state: PlayerState): import('../types/effects').StubAction | null => {
    const cards: string[] = [];
    for (const s of state.field.signi) { const t = s?.at(-1); if (t) cards.push(t); }
    const lt = state.field.lrig.at(-1); if (lt) cards.push(lt);
    const al = (state.field.assist_lrig_l ?? []).at(-1); if (al) cards.push(al);
    const ar = (state.field.assist_lrig_r ?? []).at(-1); if (ar) cards.push(ar);
    for (const n of cards) {
      for (const e of (effectsMap.get(n) ?? [])) {
        if (e.effectType !== 'CONTINUOUS') continue;
        const act = e.action as import('../types/effects').StubAction;
        if (act.type === 'STUB' && act.id === 'GRANT_ALL_ZONE_LIFEBURST') return act;
      }
    }
    return null;
  };
  // クラッシュされたカードが付与ライフバーストの対象か（burstFilter があればクラッシュカードが一致する必要がある）
  const matchesAllZoneBurstGrant = (cardNum: string, ownerState: PlayerState): boolean => {
    const grant = getAllZoneBurstGrant(ownerState);
    if (!grant) return false;
    if (grant.burstFilter && !matchesFilter(battleCardMap.get(cardNum), grant.burstFilter)) return false;
    return true;
  };
  // クラッシュされたカードの実効ライフバースト有無（ネイティブ or 付与）
  const effectiveHasBurst = (cardNum: string, ownerState: PlayerState): boolean => {
    const card = battleCardMap.get(cardNum);
    if (card?.LifeBurst === '1') return true;
    if ((effectsMap.get(cardNum) ?? []).some(e => e.effectType === 'LIFE_BURST')) return true;
    return matchesAllZoneBurstGrant(cardNum, ownerState);
  };
  // 付与の合成ライフバースト（既定＝相手シグニ1体バニッシュ／burstAction 指定時はそれを使用）
  const grantedBurstEntry = (cardNum: string, ownerId: string, grant: import('../types/effects').StubAction | null): StackEntry => ({
    id: generateUUID(),
    playerId: ownerId,
    cardNum,
    effectId: 'GRANTED_ALLZONE_BURST',
    label: `${battleCardMap.get(cardNum)?.CardName ?? cardNum} の【ライフバースト】（付与）`,
    effect: {
      effectId: 'GRANTED_ALLZONE_BURST', effectType: 'LIFE_BURST', timing: ['ON_LIFE_BURST'],
      action: grant?.burstAction
        ?? { type: 'BANISH', target: { type: 'SIGNI', owner: 'opponent', count: 1, filter: { cardType: 'シグニ' }, upToCount: false } },
      duration: 'INSTANT', mandatory: false, parseStatus: 'MANUAL',
    },
  });

  // ライフバースト確認後の処理（人間・CPU共通）
  // targetCardNum: 同時クラッシュ時に処理するカードを指定（省略時はfield.check）
  const performLifeBurstResponse = async (activate: boolean, targetCardNum: string | undefined, p: {
    owner: PlayerState; opponent: PlayerState;
    ownerId: string;
    ownerKey: 'host_state' | 'guest_state';
  }) => {
    const { owner: my, opponent: op, ownerId } = p;
    if (!my.field.check) return;
    setLoading(true);
    try {
      const cardNum = targetCardNum ?? my.field.check;
      let remainingPending: string[];
      if (!targetCardNum || targetCardNum === my.field.check) {
        // check のカードを処理: pending はそのまま残す
        remainingPending = my.pending_crashed_cards ?? [];
      } else {
        // pending のカードを先に処理: indexOf で最初の一致のみ除き、check を pending 先頭に回す
        const pendingList = my.pending_crashed_cards ?? [];
        const targetIdx = pendingList.indexOf(targetCardNum);
        const afterRemoval = targetIdx >= 0
          ? [...pendingList.slice(0, targetIdx), ...pendingList.slice(targetIdx + 1)]
          : pendingList;
        remainingPending = [my.field.check!, ...afterRemoval];
      }
      // CRASH_TO_TRASH_INSTEAD: 相手（攻撃側）がフラグを持つ場合エナではなくトラッシュへ
      const crashToTrash = op.crash_to_trash_instead === true;
      // ON_LIFE_CRASHED: 自フィールドシグニの「ライフクロスがクラッシュされたとき」トリガーを収集
      // （アタック・効果問わず全クラッシュ経路がチェックゾーン経由でここに集約される）
      const { entries: crashTriggers, usedOncePerTurnIds: crashTriggerUsedIds } =
        collectSelfEventTriggers('ON_LIFE_CRASHED', my, op, 'ライフクラッシュ時', ownerId);
      // ON_OPP_LIFE_CRASHED: クラッシュした側（op＝ターンプレイヤー）のフィールドの
      // 「対戦相手のライフクロスがクラッシュされたとき」トリガーを収集する。
      // ダブルクラッシュ判定（同時N枚以上）は OPP_LIFE_CRASH_EVENT_GTE 条件で評価。
      const crasherId = p.ownerKey === 'host_state' ? bs.guest_id : bs.host_id;
      const opKey = p.ownerKey === 'host_state' ? 'guest_state' : 'host_state';
      const oppCrashEventSize = 1 + (my.pending_crashed_cards?.length ?? 0);
      const oppCrashTriggers: StackEntry[] = [];
      const oppUsedIds: string[] = [];
      // usageLimit を op.actions_done の出現回数で制御（once=1 / twice=2）。
      const oppLimitOk = (eff: import('../types/effects').CardEffect): boolean => {
        if (eff.usageLimit !== 'once_per_turn' && eff.usageLimit !== 'twice_per_turn') return true;
        const max = eff.usageLimit === 'once_per_turn' ? 1 : 2;
        const used = (op.actions_done ?? []).filter(id => id === eff.effectId).length
          + oppUsedIds.filter(id => id === eff.effectId).length;
        if (used >= max) return false;
        oppUsedIds.push(eff.effectId);
        return true;
      };
      // シグニ＋ルリグ／アシストルリグ／キー（付与能力含む。WXDi-P16-039 のアシストルリグ自己付与等）を走査
      const oppCrashSources = [
        ...op.field.signi.map(s => s?.at(-1)),
        op.field.lrig.at(-1),
        op.field.assist_lrig_l?.at(-1),
        op.field.assist_lrig_r?.at(-1),
        op.field.key_piece,
        ...(op.field.key_piece_extra ?? []),
      ].filter((n): n is string => !!n);
      for (const topNum of oppCrashSources) {
        for (const eff of effectsMap.get(topNum) ?? []) {
          if (eff.effectType !== 'AUTO' || !eff.timing?.includes('ON_OPP_LIFE_CRASHED')) continue;
          if (eff.kizunaIcon && !isKizunaActive(op, topNum, battleCardMap)) continue; // 【絆自】は絆獲得時のみ
          if (eff.condition?.type === 'OPP_LIFE_CRASH_EVENT_GTE' && oppCrashEventSize < eff.condition.value) continue;
          if (!oppLimitOk(eff)) continue;
          const cardName = battleCardMap.get(topNum)?.CardName ?? topNum;
          oppCrashTriggers.push({
            id: generateUUID(),
            playerId: crasherId,
            cardNum: topNum,
            effectId: eff.effectId,
            label: `${cardName} の【自】効果（相手ライフクラッシュ時）`,
            effect: eff,
          });
        }
      }
      // INSTALL_DELAYED_TRIGGER（B3）: op（クラッシュした側＝ターンプレイヤー）に設置された
      // 「このターン、…がクラッシュしたとき、…」遅延トリガーを収集する。crasherFilter があれば
      // op の場に該当シグニがいるかで近似判定（実際のクラッシュ源シグニは未追跡＝要実機検証）。
      for (const dt of op.delayed_triggers ?? []) {
        if (dt.trigger?.timing !== 'ON_OPP_LIFE_CRASHED') continue;
        if (dt.trigger.crasherFilter) {
          const ok = op.field.signi.some(stack => {
            const num = stack?.at(-1);
            const card = num ? battleCardMap.get(num) : undefined;
            return card ? matchesFilter(card, dt.trigger.crasherFilter!) : false;
          });
          if (!ok) continue;
        }
        oppCrashTriggers.push({
          id: generateUUID(),
          playerId: crasherId,
          cardNum,
          effectId: 'DELAYED_TRIGGER',
          label: 'このターンの遅延トリガー（相手ライフクラッシュ時）',
          effect: {
            effectId: 'DELAYED_TRIGGER', effectType: 'AUTO', timing: ['ON_OPP_LIFE_CRASHED'],
            action: dt.effect, duration: 'INSTANT', mandatory: true, parseStatus: 'MANUAL',
          },
        });
      }
      const opStateForUsed: PlayerState | null = oppUsedIds.length > 0
        ? { ...op, actions_done: [...(op.actions_done ?? []), ...oppUsedIds] }
        : null;
      // SET_NEXT_LIFE_CRASH_COUNTER: 自分（my=クラッシュされた側）に設定されたカウンタークラッシュを消費し、
      // 対戦相手（op）のライフクロスを perTrigger 枚クラッシュし返すトリガーを積む（WX25-P1-004 / WXDi-P12-030）。
      const counterCrashTriggers: StackEntry[] = [];
      let myCounterAfter = my.life_crash_counter;
      if (my.life_crash_counter && my.life_crash_counter.remaining > 0) {
        const per = my.life_crash_counter.perTrigger;
        counterCrashTriggers.push({
          id: generateUUID(),
          playerId: ownerId,
          cardNum,
          effectId: 'LIFE_CRASH_COUNTER',
          label: `カウンタークラッシュ（対戦相手のライフクロスを${per}枚クラッシュ）`,
          effect: {
            effectId: 'LIFE_CRASH_COUNTER', effectType: 'AUTO', timing: ['ON_LIFE_CRASHED'],
            action: { type: 'LIFE_CRASH', owner: 'opponent', count: per, triggerBurst: true },
            duration: 'INSTANT', mandatory: true, parseStatus: 'MANUAL',
          },
        });
        const remaining = my.life_crash_counter.remaining - 1;
        myCounterAfter = remaining > 0 ? { ...my.life_crash_counter, remaining } : undefined;
      }
      // チェックゾーンをクリアしてエナ（またはトラッシュ）へ移動した状態を基点にする
      const baseState: PlayerState = {
        ...my,
        energy: crashToTrash ? my.energy : [...my.energy, cardNum],
        trash: crashToTrash ? [...my.trash, cardNum] : my.trash,
        field: { ...my.field, check: null },
        pending_crashed_cards: remainingPending,
        life_crash_counter: myCounterAfter,
        actions_done: crashTriggerUsedIds.length > 0
          ? [...(my.actions_done ?? []), ...crashTriggerUsedIds]
          : my.actions_done,
      };
      if (crashToTrash) appendBattleLogs([`${battleCardMap.get(cardNum)?.CardName ?? cardNum}はトラッシュに置かれた（CRASH_TO_TRASH_INSTEAD）`]);
      if (!activate) {
        const stateKey = p.ownerKey;
        const update: Record<string, unknown> = { [stateKey]: baseState, pending_effect: null };
        if (opStateForUsed) update[opKey] = opStateForUsed;
        const combinedTriggers = [...crashTriggers, ...oppCrashTriggers, ...counterCrashTriggers];
        if (combinedTriggers.length > 0) {
          const existingStack = bs.effect_stack ?? null;
          update.effect_stack = existingStack
            ? pushToStack(existingStack, combinedTriggers)
            : initStack(bs.active_user_id ?? ownerId, combinedTriggers);
        }
        await supabase.from('battle_states').update(update).eq('room_id', roomId);
        return;
      }
      // LIFE_BURST効果を発火（LIFE_BURST_DOUBLEフラグがある場合は2回分キュー）
      const doubleBurst = baseState.life_burst_double_next === true;
      const baseStateForBurst = doubleBurst
        ? { ...baseState, life_burst_double_next: undefined }
        : baseState;
      // lrig_trash: ARTS_SELF_RECYCLE_ON_TRIGGER with ON_LIFE_BURST timing
      const lrigTrashBurstEntries: StackEntry[] = [];
      for (const artsNum of (baseState.lrig_trash ?? [])) {
        for (const eff of (effectsMap.get(artsNum) ?? [])) {
          if (eff.effectType !== 'AUTO' || !eff.timing?.includes('ON_LIFE_BURST')) continue;
          const act = eff.action as import('../types/effects').StubAction;
          if (act.type !== 'STUB' || act.id !== 'ARTS_SELF_RECYCLE_ON_TRIGGER') continue;
          const cardName = battleCardMap.get(artsNum)?.CardName ?? artsNum;
          lrigTrashBurstEntries.push({
            id: generateUUID(),
            playerId: ownerId,
            cardNum: artsNum,
            effectId: eff.effectId,
            label: `${cardName} の【自】効果（ライフバースト時）`,
            effect: eff,
          });
        }
      }
      // WD14-001 / WX17-036: ネイティブ【ライフバースト】を持たないカードに付与された合成バーストを追加
      // （burstFilter があればクラッシュカードが一致した場合のみ）
      const cardHasNativeBurst = battleCardMap.get(cardNum)?.LifeBurst === '1'
        || (effectsMap.get(cardNum) ?? []).some(e => e.effectType === 'LIFE_BURST');
      const allZoneBurstGrant = getAllZoneBurstGrant(my);
      // 既定はネイティブ【ライフバースト】が無いカードのみに付与。burstAdditive=true（WX02-002）は
      // ネイティブを持つカードにも追加し、両方を好きな順で使用できる。
      const grantedBurstApplies = matchesAllZoneBurstGrant(cardNum, my)
        && (allZoneBurstGrant?.burstAdditive || !cardHasNativeBurst);
      const grantedBurstExtras = grantedBurstApplies
        ? [grantedBurstEntry(cardNum, ownerId, allZoneBurstGrant)] : [];
      const allBurstExtras = [...crashTriggers, ...oppCrashTriggers, ...counterCrashTriggers, ...lrigTrashBurstEntries, ...grantedBurstExtras];
      const burstExtraUpdate = opStateForUsed ? { [opKey]: opStateForUsed } : {};
      const fired = await queueCardEffects(cardNum, ['LIFE_BURST'], ['ON_LIFE_BURST'], baseStateForBurst, op, burstExtraUpdate, doubleBurst ? 2 : 1, allBurstExtras, { id: ownerId, key: p.ownerKey });
      if (!fired) {
        const stateKey = p.ownerKey;
        await supabase.from('battle_states')
          .update({ [stateKey]: baseState, pending_effect: null })
          .eq('room_id', roomId);
      }
    } finally {
      setLoading(false);
    }
  };

  // ライフバースト確認（人間プレイヤー用エントリポイント）
  const handleLifeBurstResponse = async (activate: boolean, targetCardNum?: string) => {
    if (loading) return;
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
    await supabase.from('battle_states').update({ [myKey]: newMyState }).eq('room_id', roomId);
  };

  // シグニ起動効果を実行（コスト支払い後）
  const executeSigniActivated = async (cardNum: string, effect: import('../types/effects').CardEffect, costIndices: Set<number>, discardCostIndices: Set<number>, useKeySub = false, discardVarIndices?: Set<number>, energyTrashIndices: Set<number> = new Set(), trashExileIndices: Set<number> = new Set(), fieldTrashZones: Set<number> = new Set(), beatZones: Set<number> = new Set()) => {
    if (loading) return;
    // down_self コストは、対象シグニが既にダウンしていると支払えない（多重発動防止）
    if (effect.cost?.down_self) {
      const dzi = my.field.signi.findIndex(s => s?.at(-1) === cardNum);
      if (dzi >= 0 && (my.field.signi_down?.[dzi] ?? false)) return;
    }
    setLoading(true);
    closeSigniActivated();
    setKeySubstituteEnabled(false);
    try {
      // エナコストを支払う（色コスト + energyTrash指定コスト）
      const allEnergyRemovedIdx = new Set([...costIndices, ...energyTrashIndices]);
      const paidNums = [...costIndices].map(i => my.energy[i]);
      const energyTrashCards = [...energyTrashIndices].map(i => my.energy[i]);
      const baseNewEnergy = my.energy.filter((_, i) => !allEnergyRemovedIdx.has(i));
      // energyTrashAll: エナゾーンのカードをすべてトラッシュ（選択不要、自動）
      const energyTrashAllCards = effect.cost?.energyTrashAll ? [...baseNewEnergy] : [];
      const newEnergy = effect.cost?.energyTrashAll ? [] : baseNewEnergy;
      // 手札捨てコストを支払う
      const discardedCards = [...discardCostIndices].map(i => my.hand[i]);
      const discardVarCards = discardVarIndices ? [...discardVarIndices].map(i => my.hand[i]) : [];
      const discardVarLevelSum = discardVarCards.reduce((s, cn) => {
        const lv = parseInt(battleCardMap.get(cn)?.Level ?? '0', 10) || 0;
        return s + lv;
      }, 0);
      const baseNewHand = my.hand.filter((_, i) => !discardCostIndices.has(i) && !(discardVarIndices?.has(i)));
      // discardAll: 手札をすべて捨てる（選択不要、自動）
      const discardAllCards = effect.cost?.discardAll ? [...baseNewHand] : [];
      const newHand = effect.cost?.discardAll ? [] : baseNewHand;
      // down_self コストの場合はそのゾーンをダウン
      const newSigniDown = [...(my.field.signi_down ?? [false, false, false])];
      if (effect.cost?.down_self) {
        const zoneIdx = my.field.signi.findIndex(s => s?.at(-1) === cardNum);
        if (zoneIdx >= 0) newSigniDown[zoneIdx] = true;
      }
      // fieldDown コスト: アップ状態の該当シグニN体をダウン（自動支払い：該当ゾーンを順にダウン）
      if (effect.cost?.fieldDown) {
        const { isUp: _iuFD, isDown: _idFD, ...fdCardFilter } = effect.cost.fieldDown.filter ?? {};
        let remainingFD = effect.cost.fieldDown.count;
        for (let zi = 0; zi < my.field.signi.length && remainingFD > 0; zi++) {
          const fdTop = my.field.signi[zi]?.at(-1);
          if (!fdTop || newSigniDown[zi]) continue;
          if (!matchesFilter(battleCardMap.get(getCardNum(fdTop)), fdCardFilter)) continue;
          newSigniDown[zi] = true;
          remainingFD--;
        }
      }
      // キーピース代替（ENERGY_SUBSTITUTE_TRASH_KEY）: キーをルリグトラッシュへ
      const keySub = useKeySub && myEnergyTrashSubInfo.keySubInstId;
      const newField = keySub
        ? { ...my.field, signi_down: newSigniDown, key_piece: null, key_piece_extra: [] }
        : { ...my.field, signi_down: newSigniDown };
      const newLrigTrash = keySub ? [...my.lrig_trash, myEnergyTrashSubInfo.keySubInstId!] : my.lrig_trash;
      // 《コインアイコン》コスト（【起】コイン。activate_cost_zero時は免除）
      const coinCostAct = my.activate_cost_zero_signi === cardNum ? 0 : (effect.cost?.coin ?? 0);
      if (coinCostAct > 0 && (my.coins ?? 0) < coinCostAct) return; // 支払い不能（UI側でも無効化済み）
      // removeOppVirus: 相手の場のウィルスN個を取り除く
      const removeVirusNAct = effect.cost?.removeOppVirus ?? 0;
      let newOpVirusState: typeof op | null = null;
      if (removeVirusNAct > 0) {
        const newOppVirus = [...(op.field.signi_virus ?? [0, 0, 0])];
        let removedV = 0;
        for (let zi = 0; zi < newOppVirus.length && removedV < removeVirusNAct; zi++) {
          while (newOppVirus[zi] > 0 && removedV < removeVirusNAct) { newOppVirus[zi]--; removedV++; }
        }
        if (removedV < removeVirusNAct) return; // 支払い不能
        newOpVirusState = { ...op, field: { ...op.field, signi_virus: newOppVirus } };
      }
      // 捨てた合計枚数（ACTIVATED_DISCARD_COUNT_GTE条件用）
      const totalDiscardedCount = discardedCards.length + discardAllCards.length + energyTrashAllCards.length;
      const isGameOnceAct = effect.usageLimit === 'once_per_game';
      let paid: PlayerState = {
        ...my,
        hand: newHand,
        energy: newEnergy,
        coins: coinCostAct > 0 ? Math.max(0, (my.coins ?? 0) - coinCostAct) : my.coins,
        activate_cost_zero_signi: my.activate_cost_zero_signi === cardNum ? undefined : my.activate_cost_zero_signi,
        trash: [...my.trash, ...paidNums, ...energyTrashCards, ...discardedCards, ...discardAllCards, ...energyTrashAllCards, ...discardVarCards],
        lrig_trash: newLrigTrash,
        field: newField,
        actions_done: (effect.usageLimit === 'once_per_turn' || effect.usageLimit === 'twice_per_turn')
          ? [...(my.actions_done ?? []), effect.effectId] : (my.actions_done ?? []),
        game_actions_done: isGameOnceAct ? [...(my.game_actions_done ?? []), effect.effectId] : my.game_actions_done,
        last_activated_discard_count: totalDiscardedCount,
        last_activated_discard_level_sum: discardVarCards.length > 0 ? discardVarLevelSum : my.last_activated_discard_level_sum,
        // DISCARD_BY_POWER_MATCH: handDiscardSigniコストで捨てたシグニのパワーを記録
        last_discarded_signi_power: discardedCards.length > 0
          ? (parseInt(battleCardMap.get(discardedCards[0])?.Power ?? '0', 10) || undefined)
          : my.last_discarded_signi_power,
        // levelLteDiscardSigni: handDiscardSigniコストで捨てたシグニのレベルを記録
        last_discarded_signi_level: discardedCards.length > 0
          ? (() => { const lv = parseInt(battleCardMap.get(discardedCards[0])?.Level ?? '', 10); return isNaN(lv) ? my.last_discarded_signi_level : lv; })()
          : my.last_discarded_signi_level,
        // classMatchesDiscardSigni: 捨てたシグニのCardClassを記録（「それと共通するクラスを持つ」WXK10-033）
        last_discarded_signi_class: discardedCards.length > 0
          ? (battleCardMap.get(discardedCards[0])?.CardClass ?? my.last_discarded_signi_class)
          : my.last_discarded_signi_class,
      };
      // trashExile: トラッシュからカードをゲームから除外（lrig_trashへ）
      if (effect.cost?.trashExile?.self) {
        paid = { ...paid, trash: paid.trash.filter(cn => cn !== cardNum), lrig_trash: [...paid.lrig_trash, cardNum] };
      } else if (trashExileIndices.size > 0) {
        const exiledNums = [...trashExileIndices].map(i => my.trash[i]);
        paid = { ...paid, trash: paid.trash.filter((_, i) => !trashExileIndices.has(i)), lrig_trash: [...paid.lrig_trash, ...exiledNums] };
      }
      // trash_self: このシグニを場からトラッシュに置く（起動コスト）
      if (effect.cost?.trash_self) {
        const afterRemove = removeFromField(cardNum, paid);
        paid = { ...afterRemove, trash: [...afterRemove.trash, cardNum] };
      }
      // charmTrash: 自分の場のチャームN枚をトラッシュ（固定枚数・自動選択）
      const charmTrashNAct2 = effect.cost?.charmTrash ?? 0;
      if (charmTrashNAct2 > 0) {
        const newCharmsAct = [...(paid.field.signi_charms ?? [null, null, null])];
        const movedCA: string[] = [];
        for (let zi = 0; zi < newCharmsAct.length && movedCA.length < charmTrashNAct2; zi++) {
          if (newCharmsAct[zi]) { movedCA.push(newCharmsAct[zi]!); newCharmsAct[zi] = null; }
        }
        if (movedCA.length < charmTrashNAct2) return; // 支払い不能
        paid = { ...paid, field: { ...paid.field, signi_charms: newCharmsAct }, trash: [...paid.trash, ...movedCA] };
      }
      // charmTrashVariable: チャームを可変枚数トラッシュ（プレイヤーが選択した枚数）
      const charmVarActCost = effect.cost?.charmTrashVariable;
      if (charmVarActCost) {
        const n = signiActCharmTrashVar;
        if (n < charmVarActCost.min) return;
        if (n > 0) {
          const newCharmsActV = [...(paid.field.signi_charms ?? [null, null, null])];
          const movedActV: string[] = [];
          for (let zi = 0; zi < newCharmsActV.length && movedActV.length < n; zi++) {
            if (newCharmsActV[zi]) { movedActV.push(newCharmsActV[zi]!); newCharmsActV[zi] = null; }
          }
          if (movedActV.length < n) return;
          paid = { ...paid, field: { ...paid.field, signi_charms: newCharmsActV }, trash: [...paid.trash, ...movedActV], last_charm_trash_count: n };
        } else {
          paid = { ...paid, last_charm_trash_count: 0 };
        }
      }
      // acceTrash: あなたの【アクセ】N枚をトラッシュ（自動選択。先頭のゾーンから）
      const acceTrashNAct = effect.cost?.acceTrash ?? 0;
      if (acceTrashNAct > 0) {
        const newAcceAct = [...(paid.field.signi_acce ?? [null, null, null])];
        const movedAcceAct: string[] = [];
        for (let zi = 0; zi < newAcceAct.length && movedAcceAct.length < acceTrashNAct; zi++) {
          if (newAcceAct[zi]) { movedAcceAct.push(newAcceAct[zi]!); newAcceAct[zi] = null; }
        }
        if (movedAcceAct.length < acceTrashNAct) return; // 支払い不能
        paid = { ...paid, field: { ...paid.field, signi_acce: newAcceAct as (string | null)[] }, trash: [...paid.trash, ...movedAcceAct] };
      }
      // fieldTrash: 場のシグニをコストでトラッシュ（チャーム/アクセも一緒に。WX03-035「他の＜古代兵器＞のシグニ1体を場からトラッシュ」等）
      if (fieldTrashZones.size > 0) {
        const newSigniFA  = [...paid.field.signi] as (string[] | null)[];
        const newDownFA   = [...(paid.field.signi_down   ?? [false, false, false])];
        const newFrozenFA = [...(paid.field.signi_frozen ?? [false, false, false])];
        const newCharmsFA = [...(paid.field.signi_charms ?? [null, null, null])];
        const newAcceFA   = [...(paid.field.signi_acce   ?? [null, null, null])];
        const toTrashFA: string[] = [];
        let trashedSigniLevelFA: number | undefined;
        for (const zi of fieldTrashZones) {
          const stack = newSigniFA[zi];
          if (!stack || stack.length === 0) continue;
          const topSigniFA = battleCardMap.get(getCardNum(stack.at(-1)!));
          if (topSigniFA) trashedSigniLevelFA = parseInt(topSigniFA.Level ?? '0', 10) || 0;
          toTrashFA.push(...stack.map(getCardNum));
          if (newCharmsFA[zi]) { toTrashFA.push(newCharmsFA[zi]!); newCharmsFA[zi] = null; }
          if (newAcceFA[zi])   { toTrashFA.push(newAcceFA[zi]!);   newAcceFA[zi]   = null; }
          newSigniFA[zi] = null;
          newDownFA[zi] = false;
          newFrozenFA[zi] = false;
        }
        paid = {
          ...paid,
          field: { ...paid.field, signi: newSigniFA, signi_down: newDownFA, signi_frozen: newFrozenFA, signi_charms: newCharmsFA, signi_acce: newAcceFA },
          trash: [...paid.trash, ...toTrashFA],
          last_field_trash_level: trashedSigniLevelFA,
        };
      }
      // beat_signi: シグニを【ビート】にするコスト（自動選択・近似。beat_zone へ移し ON_BECOME_BEAT 用フラグを積む）
      if ((effect.cost?.beat_signi ?? 0) > 0) {
        const beatPayA = payBeatSigniCost(paid, cardNum, battleCardMap, effect.cost!.beat_signi!, [...beatZones]);
        if (!beatPayA.ok) { setLoading(false); return; } // 支払い不能（対象不足）
        paid = beatPayA.state;
      }
      // GRANT_TURN_TRIGGER_3RD_DOWN: 植物シグニがdown_selfコストでダウンした回数を追跡
      let plant3rdDownTriggerEntry: StackEntry | null = null;
      if (effect.cost?.down_self && my.turn_trigger_3rd_plant_down) {
        const signiCard3D = battleCardMap.get(cardNum);
        if (signiCard3D?.CardClass?.includes('植物')) {
          const newPlantDownCount = (my.turn_plant_down_count ?? 0) + 1;
          paid = { ...paid, turn_plant_down_count: newPlantDownCount };
          if (newPlantDownCount === 3) {
            const banishEff3D: import('../types/effects').CardEffect = {
              effectId: `plant_3rd_down_${generateUUID()}`,
              effectType: 'ACTIVATED',
              duration: 'INSTANT',
              action: {
                type: 'SEQUENCE',
                steps: [
                  { type: 'BANISH', target: { type: 'SIGNI', owner: 'opponent', count: 1 } } as import('../types/effects').BanishAction,
                  { type: 'TRANSFER_TO_HAND', source: { type: 'ENERGY_CARD', owner: 'self', count: 1 } } as import('../types/effects').TransferToHandAction,
                  { type: 'DRAW', owner: 'self', count: 1 } as import('../types/effects').DrawAction,
                ],
              } as import('../types/effects').SequenceAction,
            };
            plant3rdDownTriggerEntry = {
              id: generateUUID(),
              playerId: user.id,
              cardNum,
              effectId: banishEff3D.effectId,
              label: `${battleCardMap.get(cardNum)?.CardName ?? cardNum} 植物3回目ダウン：相手シグニ1体バニッシュ`,
              effect: banishEff3D,
            };
          }
        }
      }
      // 効果をスタックに積む
      const cardName = battleCardMap.get(cardNum)?.CardName ?? cardNum;
      const entry: StackEntry = {
        id: generateUUID(),
        playerId: user.id,
        cardNum,
        effectId: effect.effectId,
        label: `${cardName} の【起】効果`,
        effect,
      };
      const stackEntries: StackEntry[] = plant3rdDownTriggerEntry
        ? [entry, plant3rdDownTriggerEntry]
        : [entry];
      // ON_DISCARDED_AS_COST / ON_HAND_DISCARDED: 【起】コストで手札を捨てた場合のトリガー
      const allDiscardedForTrigger = [...discardedCards, ...discardAllCards, ...discardVarCards];
      if (allDiscardedForTrigger.length > 0) {
        const { entries: hdEntries, usedLimitIds } = collectHandDiscardTriggers(
          allDiscardedForTrigger, paid, user.id, true,
          isHost ? bs.guest_state : bs.host_state, isHost ? bs.guest_id : bs.host_id, cardNum);
        stackEntries.push(...hdEntries);
        if (usedLimitIds.length > 0) {
          paid = { ...paid, actions_done: [...(paid.actions_done ?? []), ...usedLimitIds] };
        }
      }
      // ON_COIN_PAID（C1 配線・シグニ【起】《コイン》）: コインを支払った場合に反応【自】を積む。
      if (coinCostAct > 0) {
        const actCoin = collectCoinPaidTriggers(user.id, paid, isHost ? bs.guest_state : bs.host_state);
        stackEntries.push(...actCoin.entries);
        paid = applyCoinPaidUsed(paid, actCoin); // 《ターン1回/2回》消化を永続化（続き106）
      }
      const turnPlayerId = bs.active_user_id ?? user.id;
      const existingStack = bs?.effect_stack ?? null;
      const newStack = existingStack
        ? pushToStack(existingStack, stackEntries)
        : initStack(turnPlayerId, stackEntries);
      const stateKey = isHost ? 'host_state' : 'guest_state';
      const oppStateKey = isHost ? 'guest_state' : 'host_state';
      const updatePayload: Record<string, unknown> = { [stateKey]: paid, effect_stack: newStack, pending_effect: null };
      if (newOpVirusState) {
        updatePayload[oppStateKey] = newOpVirusState;
        paid = { ...paid, opp_virus_removed_just: true };
        updatePayload[stateKey] = paid;
      }
      await supabase.from('battle_states')
        .update(updatePayload)
        .eq('room_id', roomId);
    } finally {
      setLoading(false);
    }
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
      const paidNums = [...costIndices].map(i => my.energy[i]);
      // アクセカードがエナから取り除かれるのはATTACH_ACCE実行時（effectExecutor側）
      // コストのみ先払い（緑×0の場合は何も消費しない）
      const newEnergy = my.energy.filter((_, i) => !costIndices.has(i));
      const paid: PlayerState = {
        ...my,
        energy: newEnergy,
        trash: [...my.trash, ...paidNums],
        actions_done: [...(my.actions_done ?? []), effect.effectId],
      };
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
      await supabase.from('battle_states')
        .update({ [stateKey]: paid, effect_stack: newStack, pending_effect: null })
        .eq('room_id', roomId);
    } finally {
      setLoading(false);
    }
  };

  // v0.277: 手札から自身を捨てて発動する【起】効果を実行
  const executeHandActivated = async (cardNum: string, handIndex: number, effect: import('../types/effects').CardEffect, costIndices: Set<number>) => {
    if (loading) return;
    setLoading(true);
    closeHandActivated();
    try {
      // エナコスト支払い
      const paidNums = [...costIndices].map(i => my.energy[i]);
      const newEnergy = my.energy.filter((_, i) => !costIndices.has(i));
      // 手札からこのカード自身を捨てる（self-discard from hand）
      const newHand = my.hand.filter((_, i) => i !== handIndex);
      const isGameOnce = effect.usageLimit === 'once_per_game';
      // removeOppVirus: 相手の場の【ウィルス】N個を取り除くコスト（WX21-030「手札からこのカードを捨て、ウィルス3つを取り除く」）
      const removeVirusN = effect.cost?.removeOppVirus ?? 0;
      let newOpVirusState: PlayerState | null = null;
      if (removeVirusN > 0) {
        const newOppVirus = [...(op.field.signi_virus ?? [0, 0, 0])];
        let removedV = 0;
        for (let zi = 0; zi < newOppVirus.length && removedV < removeVirusN; zi++) {
          while (newOppVirus[zi] > 0 && removedV < removeVirusN) { newOppVirus[zi]--; removedV++; }
        }
        if (removedV < removeVirusN) { setLoading(false); return; } // 支払い不能（ウィルス不足）
        newOpVirusState = { ...op, field: { ...op.field, signi_virus: newOppVirus } };
      }
      let paid: PlayerState = {
        ...my,
        hand: newHand,
        energy: newEnergy,
        trash: [...my.trash, ...paidNums, cardNum],
        actions_done: [...(my.actions_done ?? []), effect.effectId],
        game_actions_done: isGameOnce ? [...(my.game_actions_done ?? []), effect.effectId] : my.game_actions_done,
      };
      const cardName = battleCardMap.get(cardNum)?.CardName ?? cardNum;
      const entry: StackEntry = {
        id: generateUUID(),
        playerId: user.id,
        cardNum,
        effectId: effect.effectId,
        label: `${cardName}【起】（手から捨て）`,
        effect,
      };
      const stackEntries: StackEntry[] = [entry];
      // ON_DISCARDED_AS_COST / ON_HAND_DISCARDED: 自身をコストとして捨てた場合のトリガー
      const { entries: hdEntries, usedLimitIds } = collectHandDiscardTriggers(
        [cardNum], paid, user.id, true,
        isHost ? bs.guest_state : bs.host_state, isHost ? bs.guest_id : bs.host_id, cardNum);
      stackEntries.push(...hdEntries);
      if (usedLimitIds.length > 0) {
        paid = { ...paid, actions_done: [...(paid.actions_done ?? []), ...usedLimitIds] };
      }
      const turnPlayerId = bs.active_user_id ?? user.id;
      const existingStack = bs?.effect_stack ?? null;
      const newStack = existingStack
        ? pushToStack(existingStack, stackEntries)
        : initStack(turnPlayerId, stackEntries);
      const stateKey = isHost ? 'host_state' : 'guest_state';
      const opKey = isHost ? 'guest_state' : 'host_state';
      const updatePayload: Record<string, unknown> = { [stateKey]: paid, effect_stack: newStack, pending_effect: null };
      if (newOpVirusState) updatePayload[opKey] = newOpVirusState;
      await supabase.from('battle_states')
        .update(updatePayload)
        .eq('room_id', roomId);
    } finally {
      setLoading(false);
    }
  };

  // トラッシュ自己起動【起】を実行（エナコスト支払い → このカードをトラッシュから場に出す）。
  // カードはトラッシュに残したまま effect_stack に積み、resolver の execAddToField が
  // thisCardOnly source（トラッシュの効果元自身）を場へ移す。
  const executeTrashActivated = async (cardNum: string, effect: import('../types/effects').CardEffect, costIndices: Set<number>) => {
    if (loading) return;
    setLoading(true);
    closeTrashActivated();
    try {
      const paidNums = [...costIndices].map(i => my.energy[i]);
      const newEnergy = my.energy.filter((_, i) => !costIndices.has(i));
      const isGameOnce = effect.usageLimit === 'once_per_game';
      // 支払ったエナはトラッシュへ。効果元カード自身はトラッシュに残し、ADD_TO_FIELD 解決時に場へ移す。
      const paid: PlayerState = {
        ...my,
        energy: newEnergy,
        trash: [...my.trash, ...paidNums],
        actions_done: [...(my.actions_done ?? []), effect.effectId],
        game_actions_done: isGameOnce ? [...(my.game_actions_done ?? []), effect.effectId] : my.game_actions_done,
      };
      const cardName = battleCardMap.get(cardNum)?.CardName ?? cardNum;
      const entry: StackEntry = {
        id: generateUUID(),
        playerId: user.id,
        cardNum,
        effectId: effect.effectId,
        label: `${cardName}【起】（トラッシュから場に出す）`,
        effect,
      };
      const turnPlayerId = bs.active_user_id ?? user.id;
      const existingStack = bs?.effect_stack ?? null;
      const newStack = existingStack
        ? pushToStack(existingStack, [entry])
        : initStack(turnPlayerId, [entry]);
      const stateKey = isHost ? 'host_state' : 'guest_state';
      await supabase.from('battle_states')
        .update({ [stateKey]: paid, effect_stack: newStack, pending_effect: null })
        .eq('room_id', roomId);
    } finally {
      setLoading(false);
    }
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
        field: { ...my.field, free_zone: fzGBA },
        actions_done: [...(my.actions_done ?? []), 'GUARD_BARRIER_ACT'],
      };
      const cardName = battleCardMap.get(cardNum)?.CardName ?? cardNum;
      appendBattleLogs([`【起】ガードシグニ（${cardName}）を捨て→ルリグバリア+1（計${countBarrierTokens(fzGBA, LRIG_BARRIER_CARD)}）`]);
      const stateKey = isHost ? 'host_state' : 'guest_state';
      await supabase.from('battle_states').update({ [stateKey]: paid }).eq('room_id', roomId);
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
    const attachedAcceNum = hostZoneAcce >= 0 ? (state.field.signi_acce?.[hostZoneAcce] ?? null) : null;
    if (attachedAcceNum) {
      for (const eff of (effectsMap.get(attachedAcceNum) ?? [])) {
        if (eff.effectType !== 'AUTO' || !eff.timing?.includes('ON_ACCE_ATTACH')) continue;
        // host シグニのレベル/クラス条件（WXK05-041=Lv4以上／WX17-076-E2=Lv2以下／WX17-033-E4=＜調理＞）
        const acceTc = eff.triggerCondition;
        if (acceTc?.accedHostMinLevel || acceTc?.accedHostMaxLevel) {
          const hostLv = parseInt(battleCardMap.get(getCardNum(acceHostCardNum))?.Level ?? '0', 10);
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
    await supabase.from('battle_states')
      .update({ [stateKey]: stateToWrite, effect_stack: newStack })
      .eq('room_id', roomId);
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
      await supabase.from('battle_states').update({ [stateKey]: placedState }).eq('room_id', roomId);
      return;
    }
    const turnPlayerId = bs.active_user_id ?? user.id;
    const existingStack = bs?.effect_stack ?? null;
    const newStack = existingStack
      ? pushToStack(existingStack, entries)
      : initStack(turnPlayerId, entries);
    await supabase.from('battle_states')
      .update({ [stateKey]: placedState, effect_stack: newStack, pending_effect: null })
      .eq('room_id', roomId);
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
  ) => {
    if (loading) return;
    setLoading(true);
    closeSigniOnPlayCost();
    try {
      const cost = costEffect.cost;
      // エナ消費はplacedState基準（チェーン2回目以降は前回の支払い結果を引き継ぐ）
      const energyRemovedIdx = new Set([...costIndices, ...energyTrashIndices]);
      const paidNums = [...energyRemovedIdx].map(i => placedState.energy[i]);
      const newEnergy = placedState.energy.filter((_, i) => !energyRemovedIdx.has(i));
      // 手札コスト: discard（トラッシュ）/ handToEnergy（エナへ）/ handToUnderSelf（このシグニの下へ）で行き先が異なる
      const handPickedNums = [...discardIndices].map(i => placedState.hand[i]);
      const newHand = placedState.hand.filter((_, i) => !discardIndices.has(i));
      const isHandToEnergy = (cost?.handToEnergy?.count ?? 0) > 0;
      const isHandToUnder  = (cost?.handToUnderSelf?.count ?? 0) > 0;
      const discardNums = (isHandToEnergy || isHandToUnder) ? [] : handPickedNums;
      // 《コインアイコン》コスト（【出】《コイン》等）
      const coinCostOPC = cost?.coin ?? 0;
      if (coinCostOPC > 0 && (placedState.coins ?? 0) < coinCostOPC) return; // 支払い不能（UI側でも無効化済み）
      let paid: PlayerState = {
        ...placedState,
        energy: isHandToEnergy ? [...newEnergy, ...handPickedNums] : newEnergy,
        hand: newHand,
        coins: Math.max(0, (placedState.coins ?? 0) - coinCostOPC),
        trash: [...placedState.trash, ...paidNums, ...discardNums],
      };
      const payLogs: string[] = [];
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
      // fieldTrash: 場のシグニをトラッシュ（チャーム/アクセも一緒にトラッシュへ）
      if (fieldTrashZones.size > 0) {
        const newSigniF  = [...paid.field.signi] as (string[] | null)[];
        const newDownF   = [...(paid.field.signi_down   ?? [false, false, false])];
        const newFrozenF = [...(paid.field.signi_frozen ?? [false, false, false])];
        const newCharmsF = [...(paid.field.signi_charms ?? [null, null, null])];
        const newAcceF   = [...(paid.field.signi_acce   ?? [null, null, null])];
        const toTrashF: string[] = [];
        let trashedSigniLevel: number | undefined;
        for (const zi of fieldTrashZones) {
          const stack = newSigniF[zi];
          if (!stack || stack.length === 0) continue;
          // この方法でトラッシュに置いたシグニ（スタック最上段）のレベルを記録（WX03-001: 同じレベルのシグニを対象）
          const topSigni = battleCardMap.get(getCardNum(stack.at(-1)!));
          if (topSigni) trashedSigniLevel = parseInt(topSigni.Level ?? '0', 10) || 0;
          toTrashF.push(...stack.map(getCardNum));
          if (newCharmsF[zi]) { toTrashF.push(newCharmsF[zi]!); newCharmsF[zi] = null; }
          if (newAcceF[zi])   { toTrashF.push(newAcceF[zi]!);   newAcceF[zi]   = null; }
          newSigniF[zi] = null;
          newDownF[zi] = false;
          newFrozenF[zi] = false;
        }
        paid = {
          ...paid,
          field: { ...paid.field, signi: newSigniF, signi_down: newDownF, signi_frozen: newFrozenF, signi_charms: newCharmsF, signi_acce: newAcceF },
          trash: [...paid.trash, ...toTrashF],
          last_field_trash_level: trashedSigniLevel,
        };
        if (toTrashF.length > 0) payLogs.push(`場のシグニ${fieldTrashZones.size}体をコストでトラッシュ`);
      }
      // beat_signi: シグニを【ビート】にするコスト（beatZones=プレイヤー選択。空なら自動近似）
      if ((cost?.beat_signi ?? 0) > 0) {
        const beatPay = payBeatSigniCost(paid, cardNum, battleCardMap, cost!.beat_signi!, [...beatZones]);
        if (!beatPay.ok) { setLoading(false); return; } // 支払い不能（対象不足）
        paid = beatPay.state;
        payLogs.push(beatPay.log);
      }
      // beat_signi_from_trash: トラッシュからシグニを【ビート】にするコスト（WDK14-013・自動選択近似）
      if ((cost?.beat_signi_from_trash?.count ?? 0) > 0) {
        const btPay = payBeatSigniFromTrashCost(paid, battleCardMap, cost!.beat_signi_from_trash!.count, cost!.beat_signi_from_trash!.filter);
        if (!btPay.ok) { setLoading(false); return; } // 支払い不能（トラッシュにシグニ不足）
        paid = btPay.state;
        payLogs.push(btPay.log);
      }
      // lrigDown: アップ状態のルリグをダウン（センター→アシストL→Rの順で自動支払い）
      const lrigDownCost = cost?.lrigDown;
      if (lrigDownCost) {
        let remainingLD = lrigDownCost.count;
        const f = { ...paid.field };
        // level 指定時は該当レベルのルリグゾーンだけが支払い候補（「アップ状態のレベル２のルリグ２体をダウンする」）
        const ldLevelOk = (stack?: string[]) => lrigDownCost.level === undefined
          || Number(battleCardMap.get(getCardNum(stack?.[stack.length - 1] ?? ''))?.Level) === lrigDownCost.level;
        if (remainingLD > 0 && f.lrig.length > 0 && !f.lrig_down && ldLevelOk(f.lrig)) { f.lrig_down = true; remainingLD--; }
        if (!lrigDownCost.centerOnly) {
          if (remainingLD > 0 && (f.assist_lrig_l?.length ?? 0) > 0 && !f.assist_lrig_l_down && ldLevelOk(f.assist_lrig_l)) { f.assist_lrig_l_down = true; remainingLD--; }
          if (remainingLD > 0 && (f.assist_lrig_r?.length ?? 0) > 0 && !f.assist_lrig_r_down && ldLevelOk(f.assist_lrig_r)) { f.assist_lrig_r_down = true; remainingLD--; }
        }
        if (remainingLD > 0) return; // 支払い不能（UI側でも無効化済み）
        paid = { ...paid, field: f };
        payLogs.push(`ルリグ${lrigDownCost.count}体をコストでダウン`);
      }
      // ライフコスト: lifeTrash（トラッシュへ）/ life_crash（クラッシュ＝バースト不発の近似でトラッシュへ）/ lifeToHand（手札へ）
      const lifeTrashN = (cost?.lifeTrash ?? 0) + (cost?.life_crash ?? 0);
      if (lifeTrashN > 0) {
        if (paid.life_cloth.length < lifeTrashN) return;
        const movedL = paid.life_cloth.slice(-lifeTrashN);
        paid = { ...paid, life_cloth: paid.life_cloth.slice(0, -lifeTrashN), trash: [...paid.trash, ...movedL] };
        payLogs.push(`ライフクロス${lifeTrashN}枚をコストでトラッシュ${(cost?.life_crash ?? 0) > 0 ? '（クラッシュ近似・バースト不発）' : ''}`);
      }
      const lifeToHandN = cost?.lifeToHand ?? 0;
      if (lifeToHandN > 0) {
        if (paid.life_cloth.length < lifeToHandN) return;
        const movedLH = paid.life_cloth.slice(-lifeToHandN);
        paid = { ...paid, life_cloth: paid.life_cloth.slice(0, -lifeToHandN), hand: [...paid.hand, ...movedLH] };
        payLogs.push(`ライフクロス${lifeToHandN}枚を手札に加えた（コスト）`);
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
        await supabase.from('battle_states').update({ [oppKey]: newOpState }).eq('room_id', roomId);
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
          user.id === bs.host_id ? bs.guest_state : bs.host_state, user.id === bs.host_id ? bs.guest_id : bs.host_id, cardNum);
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

  // ルリグ付与能力（GRANT_LRIG_ABILITY）の発動：エクシードコスト＋エナコスト支払い
  const executeLrigGranted = async (effect: import('../types/effects').CardEffect, costIndices: Set<number>, handDiscardIndices: Set<number> = new Set(), energyTrashIndices: Set<number> = new Set(), trashExileIndices: Set<number> = new Set()) => {
    if (loading) return;
    setLoading(true);
    closeLrigGranted();
    try {
      // エクシードコスト：センター → 左アシスト → 右アシストの順で下からN枚をルリグトラッシュへ
      const exceedCost = effect.cost?.exceed ?? 0;
      const newLrig     = [...my.field.lrig];
      const newAssistL  = [...(my.field.assist_lrig_l ?? [])];
      const newAssistR  = [...(my.field.assist_lrig_r ?? [])];
      let newLrigTrash = [...my.lrig_trash];
      const exceedPaidCards: string[] = []; // ON_EXCEED_COSTトリガー用（ルリグトラッシュに置かれたカード）
      if (exceedCost > 0) {
        let remaining = exceedCost;
        const fromCenter = Math.min(remaining, newLrig.length - 1);
        if (fromCenter > 0) { const movedC = newLrig.splice(0, fromCenter); exceedPaidCards.push(...movedC); newLrigTrash = [...newLrigTrash, ...movedC]; remaining -= fromCenter; }
        if (remaining > 0 && newAssistL.length > 1) {
          const fromL = Math.min(remaining, newAssistL.length - 1);
          const movedL = newAssistL.splice(0, fromL); exceedPaidCards.push(...movedL);
          newLrigTrash = [...newLrigTrash, ...movedL]; remaining -= fromL;
        }
        if (remaining > 0 && newAssistR.length > 1) {
          const fromR = Math.min(remaining, newAssistR.length - 1);
          const movedR = newAssistR.splice(0, fromR); exceedPaidCards.push(...movedR);
          newLrigTrash = [...newLrigTrash, ...movedR];
        }
      }
      // エナコスト支払い（色コスト + energyTrash指定コスト）
      const lgAllEnergyRemovedIdx = new Set([...costIndices, ...energyTrashIndices]);
      const paidNums = [...costIndices].map(i => my.energy[i]);
      const lgEnergyTrashCards = [...energyTrashIndices].map(i => my.energy[i]);
      const baseLGEnergy = my.energy.filter((_, i) => !lgAllEnergyRemovedIdx.has(i));
      // energyTrashAll: エナゾーンのカードをすべてトラッシュ（自動）
      const lgEnergyTrashAllCards = effect.cost?.energyTrashAll ? [...baseLGEnergy] : [];
      const afterAllLGEnergy = effect.cost?.energyTrashAll ? [] : baseLGEnergy;
      // energyTrashColorAll: エナゾーンからすべての[色]のカードをトラッシュ（自動）。トラッシュした枚数を記録（WX04-002-E2）
      const lgEnergyTrashColor = effect.cost?.energyTrashColorAll;
      const lgEnergyTrashColorCards = lgEnergyTrashColor
        ? afterAllLGEnergy.filter(cn => battleCardMap.get(cn)?.Color?.includes(lgEnergyTrashColor))
        : [];
      const newEnergy = lgEnergyTrashColor
        ? afterAllLGEnergy.filter(cn => !lgEnergyTrashColorCards.includes(cn))
        : afterAllLGEnergy;
      // 手札シグニ捨てコスト支払い
      const discardedHandNums = [...handDiscardIndices].map(i => my.hand[i]);
      const baseLGHand = my.hand.filter((_, i) => !handDiscardIndices.has(i));
      // discardAll: 手札をすべて捨てる（自動）
      const lgDiscardAllCards = effect.cost?.discardAll ? [...baseLGHand] : [];
      const newHand = effect.cost?.discardAll ? [] : baseLGHand;
      const lgTotalDiscarded = discardedHandNums.length + lgDiscardAllCards.length + lgEnergyTrashAllCards.length;
      const lgIsGameOnce = effect.usageLimit === 'once_per_game';
      let paid: import('../types').PlayerState = {
        ...my,
        hand: newHand,
        energy: newEnergy,
        trash: [...my.trash, ...paidNums, ...lgEnergyTrashCards, ...discardedHandNums, ...lgDiscardAllCards, ...lgEnergyTrashAllCards, ...lgEnergyTrashColorCards],
        field: { ...my.field, lrig: newLrig, assist_lrig_l: newAssistL, assist_lrig_r: newAssistR },
        lrig_trash: newLrigTrash,
        actions_done: [...(my.actions_done ?? []), effect.effectId],
        game_actions_done: lgIsGameOnce ? [...(my.game_actions_done ?? []), effect.effectId] : my.game_actions_done,
        last_activated_discard_count: lgTotalDiscarded,
        last_energy_trash_color_count: lgEnergyTrashColor ? lgEnergyTrashColorCards.length : my.last_energy_trash_color_count,
      };
      // trashExile: トラッシュからカードをゲームから除外（lrig_trashへ）
      if (trashExileIndices.size > 0) {
        const lgExiledNums = [...trashExileIndices].map(i => my.trash[i]);
        paid = { ...paid, trash: paid.trash.filter((_, i) => !trashExileIndices.has(i)), lrig_trash: [...paid.lrig_trash, ...lgExiledNums] };
      }
      // charmTrash: 自分の場のチャームN枚をトラッシュ（ルリグ起動コスト）
      const charmTrashNLrig = effect.cost?.charmTrash ?? 0;
      if (charmTrashNLrig > 0) {
        const newCharmsLrig = [...(paid.field.signi_charms ?? [null, null, null])];
        const movedCL: string[] = [];
        for (let zi = 0; zi < newCharmsLrig.length && movedCL.length < charmTrashNLrig; zi++) {
          if (newCharmsLrig[zi]) { movedCL.push(newCharmsLrig[zi]!); newCharmsLrig[zi] = null; }
        }
        if (movedCL.length < charmTrashNLrig) { setLoading(false); return; }
        paid = { ...paid, field: { ...paid.field, signi_charms: newCharmsLrig }, trash: [...paid.trash, ...movedCL] };
      }
      // removeOppVirus: 相手の場のウィルスN個を取り除く（ルリグ起動コスト）
      const removeVirusNLrig = effect.cost?.removeOppVirus ?? 0;
      let newOpVirusStateLrig: typeof op | null = null;
      if (removeVirusNLrig > 0) {
        const newOppVirusLrig = [...(op.field.signi_virus ?? [0, 0, 0])];
        let removedVL = 0;
        for (let zi = 0; zi < newOppVirusLrig.length && removedVL < removeVirusNLrig; zi++) {
          while (newOppVirusLrig[zi] > 0 && removedVL < removeVirusNLrig) { newOppVirusLrig[zi]--; removedVL++; }
        }
        if (removedVL < removeVirusNLrig) { setLoading(false); return; }
        newOpVirusStateLrig = { ...op, field: { ...op.field, signi_virus: newOppVirusLrig } };
        paid = { ...paid, opp_virus_removed_just: true };
      }
      const lrigTop = my.field.lrig.at(-1);
      const cardName = battleCardMap.get(lrigTop ?? '')?.CardName ?? 'ルリグ';
      // ルリグ自身の【起】効果か、付与/継承された【起】効果かでラベルを分ける
      const isOwnLrigEffect = (effectsMap.get(lrigTop ?? '') ?? []).some(e => e.effectId === effect.effectId);
      const entry: import('../types').StackEntry = {
        id: generateUUID(),
        playerId: user.id,
        cardNum: lrigTop ?? '',
        effectId: effect.effectId,
        label: isOwnLrigEffect ? `${cardName} の【起】効果` : `${cardName} の【起】付与効果`,
        effect,
      };
      // ON_EXCEED_COST: エクシードのコストとしてルリグトラッシュに置かれたカードのトリガー（WXK03-005）
      const entriesLG: import('../types').StackEntry[] = [entry];
      for (const cn of exceedPaidCards) {
        for (const eff of (effectsMap.get(cn) ?? [])) {
          if (eff.effectType !== 'AUTO' || !eff.timing?.includes('ON_EXCEED_COST')) continue;
          if (eff.triggerCondition?.exceedCostPaidByPlayer) continue; // 「あなたが支払ったとき」変種は下の場シグニ走査で処理
          entriesLG.push({
            id: generateUUID(),
            playerId: user.id,
            cardNum: cn,
            effectId: eff.effectId,
            label: `${battleCardMap.get(cn)?.CardName ?? cn}【自】エクシードコスト時`,
            effect: eff,
          });
        }
      }
      // ON_EXCEED_COST（場のシグニ）: 「あなたがエクシードのコストを支払ったとき」変種（exceedCostPaidByPlayer）。
      // エクシードコストを支払った場合のみ、自分の場のシグニ/ルリグの該当【自】を発火（WXDi-P06-078）。
      if (exceedCost > 0) {
        const myTurnEC = user.id === bs.active_user_id;
        const exceedUsedIds: string[] = [];
        const ecSources: string[] = [
          ...paid.field.signi.flatMap(s => (s?.at(-1) ? [s.at(-1)!] : [])),
          ...(paid.field.lrig.at(-1) ? [paid.field.lrig.at(-1)!] : []),
        ];
        for (const topEC of ecSources) {
          for (const eff of (effectsMap.get(topEC) ?? [])) {
            if (eff.effectType !== 'AUTO' || !eff.timing?.includes('ON_EXCEED_COST')) continue;
            if (!eff.triggerCondition?.exceedCostPaidByPlayer) continue;
            const toEC = eff.triggerCondition?.turnOwner;
            if (toEC === 'self' && !myTurnEC) continue;
            if (toEC === 'opponent' && myTurnEC) continue;
            if (eff.usageLimit === 'once_per_turn' &&
                ((paid.actions_done?.includes(eff.effectId)) || exceedUsedIds.includes(eff.effectId))) continue;
            if (eff.usageLimit === 'once_per_turn') exceedUsedIds.push(eff.effectId);
            entriesLG.push({
              id: generateUUID(),
              playerId: user.id,
              cardNum: topEC,
              effectId: eff.effectId,
              label: `${battleCardMap.get(topEC)?.CardName ?? topEC}【自】エクシードコスト支払い時`,
              effect: eff,
            });
          }
        }
        if (exceedUsedIds.length > 0) paid = { ...paid, actions_done: [...(paid.actions_done ?? []), ...exceedUsedIds] };
      }
      const turnPlayerId = bs.active_user_id ?? user.id;
      const existingStack = bs?.effect_stack ?? null;
      const newStack = existingStack
        ? pushToStack(existingStack, entriesLG)
        : initStack(turnPlayerId, entriesLG);
      const stateKey = isHost ? 'host_state' : 'guest_state';
      const oppStateKeyLrig = isHost ? 'guest_state' : 'host_state';
      const updatePayloadLrig: Record<string, unknown> = { [stateKey]: paid, effect_stack: newStack, pending_effect: null };
      if (newOpVirusStateLrig) updatePayloadLrig[oppStateKeyLrig] = newOpVirusStateLrig;
      await supabase.from('battle_states')
        .update(updatePayloadLrig)
        .eq('room_id', roomId);
    } finally {
      setLoading(false);
    }
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
      if (!stack || stack.length === 0) return [];
      const actPhase = bs.turn_phase; // 'MAIN' | 'ATTACK_ARTS'
      const topNum = stack[stack.length - 1];
      // REMOVE_ABILITIES で能力を失っているシグニは【起】を発動できない（G085-E2 等）
      if (my.abilities_removed?.includes(topNum)) return [];
      const effects = effectsMap.get(topNum) ?? [];
      // PREVENT_INFECTED_SIGNI_ACTIVATE: 感染状態のシグニの起動能力をブロック
      const infectedBlocked = collectInfectedActivateBlockedSigni(my, op, battleCardMap, effectsMap, true);
      const isInfectedBlocked = infectedBlocked.includes(topNum);
      // RESTRICT_CHARMED_SIGNI_ACTIVATED: 相手フィールドにあれば、チャーム付きシグニの【起】能力を封じる
      const hasCharmInZone = (my.field.signi_charms?.[rawZoneIdx] ?? null) !== null;
      const isCharmActivateBlocked = hasCharmInZone && op.field.signi.some(stack => {
        const top = stack?.at(-1);
        return top && (effectsMap.get(top) ?? []).some(eff =>
          eff.effectType === 'CONTINUOUS' &&
          (eff.action as import('../types/effects').StubAction).type === 'STUB' &&
          (eff.action as import('../types/effects').StubAction).id === 'RESTRICT_CHARMED_SIGNI_ACTIVATED'
        );
      });
      // down_self コストは、このシグニが既にダウンしていると支払えない
      const isAlreadyDown = my.field.signi_down?.[rawZoneIdx] ?? false;
      // discard コストは手札の枚数が足りないと支払えない
      const handCount = my.hand.length;
      // acceTrash コストは【アクセ】枚数が足りないと支払えない
      const acceCount = (my.field.signi_acce ?? []).filter(a => a !== null).length;
      // 【絆起】は発生源カード名との絆を獲得していなければ発動できない
      const kizunaOkHere = isKizunaActive(my, topNum, battleCardMap);
      const activatable = effects.filter(e =>
        e.effectType === 'ACTIVATED' &&
        (!e.kizunaIcon || kizunaOkHere) &&
        // メイン: timing未指定 or MAIN を含む。アタックフェイズ: ATTACK_ARTS を含む（《アタックフェイズアイコン》）。
        (actPhase === 'MAIN'
          ? (e.timing === undefined || e.timing.includes('MAIN'))
          : !!e.timing?.includes('ATTACK_ARTS')) &&
        !(e.cost?.acceTrash && acceCount < e.cost.acceTrash) &&
        !(e.usageLimit === 'once_per_turn' && (my.actions_done ?? []).includes(e.effectId)) &&
        !(e.usageLimit === 'twice_per_turn' && (my.actions_done ?? []).filter(id => id === e.effectId).length >= 2) &&
        !(my.blocked_actions?.includes(e.effectId)) &&
        !(e.usageLimit === 'once_per_game' && my.game_actions_done?.includes(e.effectId)) &&
        !isActionBlocked('USE_ACT') &&
        !isInfectedBlocked &&
        !isCharmActivateBlocked &&
        !(e.cost?.down_self && isAlreadyDown) &&
        !(e.cost?.discard && handCount < e.cost.discard) &&
        // fieldTrash: 場からトラッシュ可能なシグニ（excludeSelf=自身を除く）が必要数いないと支払えない
        !(e.cost?.fieldTrash && [0, 1, 2].filter(zi => {
          const ftTop = my.field.signi[zi]?.at(-1);
          if (!ftTop) return false;
          if (e.cost!.fieldTrash!.excludeSelf && zi === rawZoneIdx) return false;
          return !e.cost!.fieldTrash!.filter || matchesFilter(battleCardMap.get(getCardNum(ftTop)), e.cost!.fieldTrash!.filter);
        }).length < e.cost.fieldTrash.count) &&
        // fieldTrashGroups: 各グループ（異クラス）を満たすシグニ構成が場にないと支払えない
        !(e.cost?.fieldTrashGroups && !fieldTrashGroupsAffordable(e.cost.fieldTrashGroups, my.field.signi, battleCardMap)) &&
        // beat_signi: 場にシグニがいないと【ビート】にできない（精密な不足は支払い時に判定）
        !(e.cost?.beat_signi && my.field.signi.filter(s => (s?.length ?? 0) > 0).length < 1) &&
        // fieldDown: アップ状態の該当シグニが必要数いないと支払えない
        !(e.cost?.fieldDown && [0, 1, 2].filter(zi => {
          const fdTop = my.field.signi[zi]?.at(-1);
          if (!fdTop) return false;
          if (my.field.signi_down?.[zi]) return false; // アップ状態のみ
          const { isUp: _iu, isDown: _id, ...fdCardFilter } = e.cost!.fieldDown!.filter ?? {};
          return matchesFilter(battleCardMap.get(getCardNum(fdTop)), fdCardFilter);
        }).length < e.cost.fieldDown.count) &&
        (!e.condition || evalUseCondition(e.condition, my, op, battleCardMap, topNum, bs.turn_phase, effectivePowers)),
      );
      if (activatable.length === 0) return [];
      return activatable.map(eff => {
        const energyTotal = (eff.cost?.energy ?? []).reduce((s, c) => s + c.count, 0);
        const costLabel = eff.cost
          ? [
              energyTotal > 0 ? `エナ${energyTotal}` : null,
              eff.cost.coin ? `コイン${eff.cost.coin}` : null,
              eff.cost.discard ? `手札${eff.cost.discard}枚トラッシュ` : null,
              eff.cost.discardAll ? '手札すべて捨て' : null,
              eff.cost.energyTrashAll ? 'エナすべトラッシュ' : null,
              eff.cost.discardVariable ? `手札${eff.cost.discardVariable.min}枚以上捨て` : null,
              eff.cost.down_self ? 'ダウン' : null,
              eff.cost.removeOppVirus ? `ウィルス${eff.cost.removeOppVirus}除去` : null,
              eff.cost.trash_self ? 'このシグニをトラッシュ' : null,
              eff.cost.trash_key ? 'このキーをルリグトラッシュ' : null,
              eff.cost.charmTrash ? `チャーム${eff.cost.charmTrash}枚トラッシュ` : null,
              eff.cost.acceTrash ? `アクセ${eff.cost.acceTrash}枚トラッシュ` : null,
              eff.cost.fieldTrash ? `場の${eff.cost.fieldTrash.excludeSelf ? '他の' : ''}シグニ${eff.cost.fieldTrash.count}体トラッシュ` : null,
              eff.cost.fieldDown ? `場のシグニ${eff.cost.fieldDown.count}体ダウン` : null,
            ].filter(Boolean).join('・') || 'コストなし'
          : 'コストなし';
        return {
          label: `【起】${costLabel}`,
          color: C.coin,
          onClick: () => { openSigniActivated({ cardNum: topNum, effect: eff }); },
        };
      });
    }

    if (bs.turn_phase === 'ATTACK_SIGNI') {
      if (!stack || stack.length === 0) return []; // シグニなし
      if (my.field.signi_down?.[rawZoneIdx]) return []; // すでにダウン
      if (op.field.check) return []; // 相手のライフバースト処理待ち
      if (my.pending_signi_battle) return []; // 別シグニのアタック解決中は操作不可
      if (loading) return []; // 処理中は操作不可
      const topNum = stack[stack.length - 1];
      if (contBlocked.cannotAttackSigni.has(topNum)) return []; // アタック不可シグニ
      // GATE: blocked_actions に 'ATTACK:cardId' があればアタックボタンを非表示
      if (my.blocked_actions?.includes(`ATTACK:${topNum}`)) return [];
      // OPP_SIGNI_ATTACK_POWER_RESTRICT: 相手側が設定したパワー上限でアタック制限
      const oppPowerCap = op.opp_signi_attack_power_cap;
      if (oppPowerCap !== undefined) {
        const signiPower = effectivePowers.get(topNum) ?? parsePowerVal(battleCardMap.get(topNum)?.Power);
        if (signiPower <= oppPowerCap) return [];
      }
      // シグニ合計1回アタック制限チェック
      if (my.signi_attack_once_limit && (my.attacked_signi_ids?.length ?? 0) > 0) return [];
      // OPP_SIGNI_ATTACK_COST: アタックにエナコストが必要
      const signiAtkCost = my.signi_attack_cost ?? 0;
      if (signiAtkCost > 0 && my.energy.length < signiAtkCost) return []; // エナ不足でアタック不可
      const atkLabel = signiAtkCost > 0 ? `アタック（《無》×${signiAtkCost}）` : 'アタック';
      const actions: CardAction[] = [{ label: atkLabel, color: C.danger, onClick: () => handleSigniAttack(rawZoneIdx) }];
      // 【側面アタック】（G077等）: 正面の1つ隣の相手シグニゾーンにアタックできる。
      // 攻撃先は正面か側面を「選ぶ」（同時攻撃ではない）。空ゾーンは何も起きないため占有ゾーンのみ提示。
      const hasSideAttack = (dynamicKeywords.my[topNum] ?? []).includes('側面アタック')
        || (my.keyword_grants?.[topNum] ?? []).includes('側面アタック');
      if (hasSideAttack) {
        const frontOpZone = 2 - rawZoneIdx;
        for (const adj of [frontOpZone - 1, frontOpZone + 1]) {
          if (adj < 0 || adj > 2) continue;
          const adjTop = op.field.signi[adj]?.at(-1);
          if (!adjTop) continue; // 空ゾーンは提示しない（アタックしても何も起こらない）
          const targetName = battleCardMap.get(adjTop)?.CardName ?? adjTop;
          actions.push({ label: `側面アタック→${targetName}`, color: '#b5651d', onClick: () => handleSigniSideAttack(rawZoneIdx, adj) });
        }
      }
      // WXDi-P05-069: フリップアタック（ロビンフッド対象）
      const altFlip = collectAltAttackFlipSigni(my, battleCardMap, effectsMap);
      if (altFlip && (battleCardMap.get(topNum)?.CardName ?? '').includes(altFlip.targetSigniName)) {
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
      if (lrigTopMA && !isActionBlocked('USE_ACT')) {
        const lrigEffsMA = effectsMap.get(lrigTopMA) ?? [];
        for (const eff of lrigEffsMA) {
          if (eff.effectType !== 'ACTIVATED') continue;
          if (!eff.timing?.includes('MAIN')) continue;
          // 【絆起】は発生源カード名との絆を獲得していなければ発動できない
          if (eff.kizunaIcon && !isKizunaActive(my, lrigTopMA, battleCardMap)) continue;
          // ルリグの【起】効果は基本何度でも使用可（ターン1回アイコンを持つ場合のみ usageLimit で制限）。
          // 他パス（シグニ/付与/キー）と同様に usageLimit 基準で判定する。
          if (eff.usageLimit === 'once_per_turn' && (my.actions_done ?? []).includes(eff.effectId)) continue;
          if (eff.usageLimit === 'twice_per_turn' && (my.actions_done ?? []).filter(id => id === eff.effectId).length >= 2) continue;
          if (eff.usageLimit === 'once_per_game' && my.game_actions_done?.includes(eff.effectId)) continue;
          if (my.blocked_actions?.includes(eff.effectId)) continue;
          // SONG_FRAGMENT: エナゾーンに歌のカケラがある場合のみ表示
          const actMA = eff.action as import('../types/effects').StubAction;
          if (actMA?.type === 'STUB' && actMA.id === 'SONG_FRAGMENT') {
            const hasSongCardMA = my.energy.some(cn => battleCardMap.get(cn)?.EffectText?.includes('【歌のカケラ】'));
            if (!hasSongCardMA) continue;
          }
          const isSongFrag = actMA?.type === 'STUB' && actMA.id === 'SONG_FRAGMENT';
          const energyTotalMA = (eff.cost?.energy ?? []).reduce((s, c) => s + c.count, 0);
          const exceedCostMA = eff.cost?.exceed ?? 0;
          const hdSigniMA = eff.cost?.handDiscardSigni;
          const dgMA = eff.cost?.discardGroups;
          const costPartsMA: string[] = [];
          if (exceedCostMA > 0) costPartsMA.push(`エクシード${exceedCostMA}`);
          if (energyTotalMA > 0) costPartsMA.push(`エナ${energyTotalMA}`);
          if (eff.cost?.coin) costPartsMA.push(`コイン${eff.cost.coin}`);
          if (hdSigniMA) costPartsMA.push(`手札${fmtHandDiscardSigniLabel(hdSigniMA)}シグニ×${hdSigniMA.count}`);
          if (dgMA) costPartsMA.push(`手札${dgMA.map(g => `${fmtDiscardFilterLabel(g.filter) || 'カード'}${g.count}枚`).join('と')}`);
          if (eff.cost?.discardAll) costPartsMA.push('手札すべて捨て');
          if (eff.cost?.energyTrashAll) costPartsMA.push('エナすべトラッシュ');
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
      const hasInheritLrigTrash = (effectsMap.get(lrigTopMA) ?? []).some(eff =>
        eff.effectType === 'CONTINUOUS' &&
        ((eff.action as import('../types/effects').StubAction)?.id === 'INHERIT_LRIG_TRASH_ABILITIES' ||
         (eff.action as import('../types/effects').StubAction)?.id === 'COPY_LRIG_TRASH_ACTIVATED'),
      );
      if (hasInheritLrigTrash) {
        for (const trashLrigCn of my.lrig_trash) {
          if ((battleCardMap.get(trashLrigCn)?.Type ?? '') !== 'ルリグ') continue;
          for (const eff of (effectsMap.get(trashLrigCn) ?? [])) {
            if (eff.effectType !== 'ACTIVATED') continue;
            if (!eff.timing?.includes('MAIN')) continue;
            const inheritedId = `inherited_${trashLrigCn}_${eff.effectId}`;
            if (my.actions_done?.includes(inheritedId)) continue;
            const energyCostILT = (eff.cost?.energy ?? []).reduce((s, c) => s + c.count, 0);
            const exceedILT = eff.cost?.exceed ?? 0;
            const costPartsILT: string[] = [];
            if (exceedILT > 0) costPartsILT.push(`エクシード${exceedILT}`);
            if (energyCostILT > 0) costPartsILT.push(`エナ${energyCostILT}`);
            if (eff.cost?.coin) costPartsILT.push(`コイン${eff.cost.coin}`);
            const costLabelILT = costPartsILT.join('・') || 'コストなし';
            const trashLrigName = battleCardMap.get(trashLrigCn)?.CardName ?? trashLrigCn;
            lrigActionsMA.push({
              label: `【継承起】${costLabelILT}（${trashLrigName.slice(0, 6)}）`,
              color: '#9966cc',
              onClick: () => {
                const inheritedEff = { ...eff, effectId: inheritedId, sourceCardNum: lrigTopMA };
                openLrigGranted({ sourceCardNum: lrigTopMA, effect: inheritedEff });
              },
            });
          }
        }
      }

      // 付与された ACTIVATED 能力
      const grantedActionsMA = grantedMyLrigEffects
        .filter(e =>
          e.effectType === 'ACTIVATED' &&
          !(e.usageLimit === 'once_per_turn' && (my.actions_done ?? []).includes(e.effectId)) &&
          !(e.usageLimit === 'twice_per_turn' && (my.actions_done ?? []).filter(id => id === e.effectId).length >= 2) &&
          !(my.blocked_actions?.includes(e.effectId)) &&
          !isActionBlocked('USE_ACT'),
        )
        .map(eff => {
          const energyTotal = (eff.cost?.energy ?? []).reduce((s, c) => s + c.count, 0);
          const exceedCost = eff.cost?.exceed ?? 0;
          const costParts: string[] = [];
          if (exceedCost > 0) costParts.push(`エクシード${exceedCost}`);
          if (energyTotal > 0) costParts.push(`エナ${energyTotal}`);
          if (eff.cost?.coin) costParts.push(`コイン${eff.cost.coin}`);
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
        const guardSigniInHand = my.hand.some(cn => battleCardMap.get(cn)?.Guard === '1');
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
        if (exceedCost > 0) parts.push(`エクシード${exceedCost}`);
        if (energyTotal > 0) parts.push(`エナ${energyTotal}`);
        if (eff.cost?.discardAll) parts.push('手札すべて捨て');
        if (eff.cost?.energyTrashAll) parts.push('エナすべトラッシュ');
        return parts.join('・') || 'コストなし';
      };
      // センタールリグ本来のACTIVATED効果（timing ATTACK_ARTS）
      if (lrigTopAA && !isActionBlocked('USE_ACT')) {
        for (const eff of (effectsMap.get(lrigTopAA) ?? [])) {
          if (eff.effectType !== 'ACTIVATED') continue;
          if (!eff.timing?.includes('ATTACK_ARTS')) continue;
          if (eff.usageLimit === 'once_per_turn' && (my.actions_done ?? []).includes(eff.effectId)) continue;
          if (eff.usageLimit === 'twice_per_turn' && (my.actions_done ?? []).filter(id => id === eff.effectId).length >= 2) continue;
          if (eff.usageLimit === 'once_per_game' && my.game_actions_done?.includes(eff.effectId)) continue;
          if (my.blocked_actions?.includes(eff.effectId)) continue;
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
      const grantedActionsAA = grantedMyLrigEffects
        .filter(e =>
          e.effectType === 'ACTIVATED' &&
          !!e.timing?.includes('ATTACK_ARTS') &&
          !(e.usageLimit === 'once_per_turn' && (my.actions_done ?? []).includes(e.effectId)) &&
          !(e.usageLimit === 'twice_per_turn' && (my.actions_done ?? []).filter(id => id === e.effectId).length >= 2) &&
          !(my.blocked_actions?.includes(e.effectId)) &&
          !isActionBlocked('USE_ACT'),
        )
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
      if (my.field.lrig_down) return []; // 攻撃済み
      if (op.field.lrig_attacked) return []; // ガード応答待ち
      const lrigTopALK = my.field.lrig.at(-1);
      const driveCanAttack = !!(lrigTopALK && (effectsMap.get(lrigTopALK) ?? []).some(e =>
        e.effectType === 'CONTINUOUS' &&
        (e.action as import('../types/effects').StubAction).type === 'STUB' &&
        (e.action as import('../types/effects').StubAction).id === 'ALLOW_ATTACK_WHILE_DRIVE',
      ));
      if ((my.lrig_riding_signi?.length ?? 0) > 0 && !driveCanAttack) return [{ label: 'ドライブ中（攻撃不可）', color: C.textDim, onClick: () => {} }];
      return [{ label: 'アタック', color: C.danger, onClick: handleLrigAttack }];
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

    // 起動効果（自ターンのみ）
    if (isMyTurn && !loading) {
      const effects = effectsMap.get(topNum) ?? [];
      const activatable = effects.filter(e =>
        e.effectType === 'ACTIVATED' &&
        !(e.usageLimit === 'once_per_turn' && (my.actions_done ?? []).includes(e.effectId)) &&
        !(e.usageLimit === 'twice_per_turn' && (my.actions_done ?? []).filter(id => id === e.effectId).length >= 2) &&
        !(my.blocked_actions?.includes(e.effectId)) &&
        !isActionBlocked('USE_ACT') &&
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
        await supabase.from('battle_states').update({ [stateKey]: newMy }).eq('room_id', roomId);
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
        await supabase.from('battle_states').update({ [stateKey]: newMy }).eq('room_id', roomId);
        setCloseZoneSignal(s => s + 1);
      },
    });
    return actions;
  };

  // 勝敗確定後の終了確認（両者が押したらルーム削除）
  const handleEndAck = async () => {
    if (loading) return;
    setLoading(true);
    const ackKey = isHost ? 'host_end_ack' : 'guest_end_ack';
    await supabase.from('battle_states').update({ [ackKey]: true }).eq('room_id', roomId);
    // 最新状態を取得して両者が押したか確認
    const { data } = await supabase
      .from('battle_states')
      .select('host_end_ack, guest_end_ack')
      .eq('room_id', roomId)
      .single();
    if (data?.host_end_ack && data?.guest_end_ack) {
      leavingRef.current = true;
      await supabase.from('battle_states').delete().eq('room_id', roomId);
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
    await supabase.from('battle_states').delete().eq('room_id', roomId);
    await supabase.from('rooms').delete().eq('id', roomId);
    setLoading(false);
    setShowEndConfirm(false);
    onBack();
  };

  const modalCtx: BattleModalCtx = { bs, user, my, op, isMyTurn, loading, battleCards, battleCardMap, effectsMap, myEnaAllMulti, myColorlessOverrides, myColorSubs, pickLongPressTimer, setExpandedPickImgUrl, activeCostMods, myEnergyExtraColors, myEnergyTrashSubInfo, myLrigNameAliases, myArtsThresholdReductions, isActionBlocked, specificCardCostReductions };

  return (
    <div style={{ height: '100vh', backgroundColor: C.bgApp, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {/* 勝敗確定ポップアップ */}
      <FinishedPopup ctx={modalCtx} isHost={isHost} handleEndAck={handleEndAck} />

      {/* 終了確認モーダル */}
      <EndConfirmModal ctx={modalCtx} showEndConfirm={showEndConfirm} setShowEndConfirm={setShowEndConfirm} handleEnd={handleEnd} />

      {/* グロウ選択モーダル */}
      <GrowModal ctx={modalCtx} showGrowModal={showGrowModal} setShowGrowModal={setShowGrowModal} pendingGrowCard={pendingGrowCard} setPendingGrowCard={setPendingGrowCard} selectedGrowCost={selectedGrowCost} setSelectedGrowCost={setSelectedGrowCost} freeGrowFilter={freeGrowFilter} setFreeGrowFilter={setFreeGrowFilter} growCandidates={growCandidates} currentLrigLevel={currentLrigLevel} executeGrow={executeGrow} toggleGrowCostCard={toggleGrowCost} />

      {/* アーツ使用モーダル */}
      <ArtsModal ctx={modalCtx} showArtsModal={showArtsModal} setShowArtsModal={setShowArtsModal} pendingArtsCard={pendingArtsCard} setPendingArtsCard={setPendingArtsCard} pendingArtsEffectiveCost={pendingArtsEffectiveCost} setPendingArtsEffectiveCost={setPendingArtsEffectiveCost} selectedArtsCost={selectedArtsCost} setSelectedArtsCost={setSelectedArtsCost} selectedArtsDiscard={selectedArtsDiscard} setSelectedArtsDiscard={setSelectedArtsDiscard} betAmount={betAmount} setBetAmount={setBetAmount} isEncore={isEncore} setIsEncore={setIsEncore} keySubstituteEnabled={keySubstituteEnabled} setKeySubstituteEnabled={setKeySubstituteEnabled} artsCandidates={artsCandidates} executeArts={executeArts} toggleArtsCostCard={toggleArtsCost} />

      {/* スペル発動コスト選択 */}
      <SpellCastModal ctx={modalCtx} pendingSpellCast={pendingSpellCast} setPendingSpellCast={setPendingSpellCast} selectedSpellCost={selectedSpellCost} setSelectedSpellCost={setSelectedSpellCost} betAmount={betAmount} setBetAmount={setBetAmount} toggleSpellCostCard={toggleSpellCost} castSpell={castSpell} />

      {/* v0.277: 手札から発動する【起】コスト選択 */}
      <HandActivatedModal ctx={modalCtx} pendingHandActivated={pendingHandActivated} setPendingHandActivated={setPendingHandActivated} selectedHandActivatedCost={selectedHandActivatedCost} setSelectedHandActivatedCost={setSelectedHandActivatedCost} executeHandActivated={executeHandActivated} />

      {/* トラッシュ自己起動【起】（「このシグニをトラッシュから場に出す」等）のエナコスト支払い */}
      <TrashActivatedModal ctx={modalCtx} pendingTrashActivated={pendingTrashActivated} setPendingTrashActivated={setPendingTrashActivated} selectedTrashActivatedCost={selectedTrashActivatedCost} setSelectedTrashActivatedCost={setSelectedTrashActivatedCost} executeTrashActivated={executeTrashActivated} />

      {/* v0.278: WX25-P2-001 付与【起】 ガードシグニ捨て→ルリグバリア */}
      <GuardBarrierActModal ctx={modalCtx} pendingGuardBarrierAct={pendingGuardBarrierAct} setPendingGuardBarrierAct={setPendingGuardBarrierAct} selectedBarrierGuardCard={selectedBarrierGuardCard} setSelectedBarrierGuardCard={setSelectedBarrierGuardCard} executeGuardBarrierAct={executeGuardBarrierAct} />

      {/* G154 BURST: アタック無効化の「手札N枚捨て」回避モーダル */}
      <NegateEscapeModal ctx={modalCtx} negateEscape={negateEscape} selectedNegateEscape={selectedNegateEscape} setSelectedNegateEscape={setSelectedNegateEscape} resolveNegateEscapeDiscard={resolveNegateEscapeDiscard} resolveNegateEscapeAccept={resolveNegateEscapeAccept} />

      {/* スペルカットイン カード拡大＋スペル発動待機中（発動側） */}
      <SpellCutinOverlays ctx={modalCtx} cutinSpellZoomed={cutinSpellZoomed} setCutinSpellZoomed={setCutinSpellZoomed} />

      {/* スペルカットインポップアップ（相手のスペル発動中に表示） */}
      <CutinModal ctx={modalCtx} pendingCutinCard={pendingCutinCard} setPendingCutinCard={setPendingCutinCard} selectedCutinCost={selectedCutinCost} setSelectedCutinCost={setSelectedCutinCost} selectedCutinExceed={selectedCutinExceed} setSelectedCutinExceed={setSelectedCutinExceed} setCutinSpellZoomed={setCutinSpellZoomed} cutinCandidates={cutinCandidates} handleCutinPass={handleCutinPass} handleCutinUse={handleCutinUse} toggleCutinCostCard={toggleCutinCost} />

      {/* フェイズ進行の小型確認ダイアログ群（エナチャージ/グロウ/UPKEEP/シグニアタック/強制攻撃警告/リムーブ封じ/ルリグアタック） */}
      <PhaseConfirmDialogs ctx={modalCtx} showEnergySkipConfirm={showEnergySkipConfirm} setShowEnergySkipConfirm={setShowEnergySkipConfirm} showGrowSkipConfirm={showGrowSkipConfirm} setShowGrowSkipConfirm={setShowGrowSkipConfirm} showUpkeepPayConfirm={showUpkeepPayConfirm} showSigniAttackSkipConfirm={showSigniAttackSkipConfirm} setShowSigniAttackSkipConfirm={setShowSigniAttackSkipConfirm} showMustAttackWarning={showMustAttackWarning} setShowMustAttackWarning={setShowMustAttackWarning} showRemoveBlockedWarn={showRemoveBlockedWarn} setShowRemoveBlockedWarn={setShowRemoveBlockedWarn} showLrigAttackSkipConfirm={showLrigAttackSkipConfirm} setShowLrigAttackSkipConfirm={setShowLrigAttackSkipConfirm} growCandidates={growCandidates} doPhaseAdvance={doPhaseAdvance} handleUpkeepPay={handleUpkeepPay} handleUpkeepDecline={handleUpkeepDecline} />

      {/* エンドフェイズ：手札上限超過時の捨て選択 */}
      <EndDiscardModal ctx={modalCtx} pendingEndDiscard={pendingEndDiscard} selectedEndDiscard={selectedEndDiscard} setSelectedEndDiscard={setSelectedEndDiscard} confirmEndDiscard={confirmEndDiscard} />

      {/* F-3 身代わりバニッシュ選択（防御側＝自分のシグニがバニッシュされる場合の任意置換） */}
      <BanishSubstituteModal ctx={modalCtx} handleBanishSubstituteChoice={handleBanishSubstituteChoice} />

      {/* ライフバースト確認＋カード拡大＋相手クラッシュ確認 */}
      <LifeBurstCheckModal ctx={modalCtx} eichiSuppressActive={eichiSuppressActive} matchesAllZoneBurstGrant={matchesAllZoneBurstGrant} burstCardZoomed={burstCardZoomed} setBurstCardZoomed={setBurstCardZoomed} opCheckCardZoomed={opCheckCardZoomed} setOpCheckCardZoomed={setOpCheckCardZoomed} handleLifeBurstResponse={handleLifeBurstResponse} />

      {/* ガード応答ダイアログ（自分が攻撃されたとき・バースト処理中は非表示） */}
      <GuardResponseDialog ctx={modalCtx} contBlocked={contBlocked} myHandGuardClasses={myHandGuardClasses} isHost={isHost} performGuardResponse={performGuardResponse} handleGuardResponse={handleGuardResponse} handleGuardWithEnergyAlternative={handleGuardWithEnergyAlternative} handleGuardWithHandAlternative={handleGuardWithHandAlternative} />

      {/* リムーブ選択モーダル */}
      <RemoveZoneModal ctx={modalCtx} showRemoveModal={showRemoveModal} setShowRemoveModal={setShowRemoveModal} selectedRemoveZones={selectedRemoveZones} toggleRemoveZone={toggleRemoveZone} handleRemove={handleRemove} />

      {/* シグニ召喚ゾーン選択 */}
      <SigniSummonZoneModal ctx={modalCtx} pendingSigniSummon={pendingSigniSummon} setPendingSigniSummon={setPendingSigniSummon} fieldSigniTotal={fieldSigniTotal} lrigLimit={lrigLimit} handleSummonSigni={handleSummonSigni} />

      {/* 強制攻撃バナー */}
      {isMyTurn && my.must_attack_signi && bs.turn_phase === 'ATTACK_SIGNI' && (
        <div style={{ flexShrink: 0, backgroundColor: '#7a1a1a', padding: '4px 12px',
          fontSize: 11, color: '#ffaaaa', textAlign: 'center' }}>
          ⚠ あなたのシグニは可能ならばアタックしなければなりません
        </div>
      )}
      {!isMyTurn && op.must_attack_signi && bs.turn_phase === 'ATTACK_SIGNI' && (
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
                const multiAcceSigni = collectMultiAcceSigni(my, effectsMap, battleCardMap, op, true);
                const hasTarget = my.field.signi.some((s, i) => {
                  if (!s?.length) return false;
                  const topCn = s.at(-1)!;
                  const currentAcce = my.field.signi_acce?.[i];
                  if (!currentAcce) return true; // 空きスロット
                  // MULTI_ACCE_LIMIT: このシグニが多アクセ可で既に1個ついている場合は追加可
                  return multiAcceSigni.includes(topCn);
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
          <PlayerField state={op} cards={battleCards} isMe={false} effectivePowers={effectivePowers} dynamicKeywords={dynamicKeywords.op} />
        </div>

        {/* 中央区切り */}
        <div style={{ height: 2, flexShrink: 0, background: 'linear-gradient(to right, transparent, #007bff33, transparent)' }} />

        {/* 自分の盤面 */}
        <div style={{ border: C.borderSelf, borderRadius: 6, padding: '4px 6px', backgroundColor: C.bgSelf }}>
          <PlayerField state={my} cards={battleCards} isMe={true} getSigniZoneActions={getMySigniZoneActions} getLrigDeckCardActions={getMyLrigDeckCardActions} getLrigFieldActions={getMyLrigFieldActions} getKeyPieceActions={getKeyPieceActions} getAssistLActions={() => getAssistActions('l')} getAssistRActions={() => getAssistActions('r')} getFreeZoneActions={getMyFreeZoneActions} getTrashCardActions={getMyTrashCardActions} closeZoneSignal={closeZoneSignal} effectivePowers={effectivePowers} dynamicKeywords={dynamicKeywords.my} />
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
      <SigniActivatedModal ctx={modalCtx} pendingSigniActivated={pendingSigniActivated} setPendingSigniActivated={setPendingSigniActivated} selectedSigniActivatedCost={selectedSigniActivatedCost} setSelectedSigniActivatedCost={setSelectedSigniActivatedCost} selectedSigniActivatedDiscard={selectedSigniActivatedDiscard} setSelectedSigniActivatedDiscard={setSelectedSigniActivatedDiscard} selectedSigniActivatedDiscardVar={selectedSigniActivatedDiscardVar} setSelectedSigniActivatedDiscardVar={setSelectedSigniActivatedDiscardVar} selectedSigniActivatedFieldTrash={selectedSigniActivatedFieldTrash} setSelectedSigniActivatedFieldTrash={setSelectedSigniActivatedFieldTrash} selectedSigniActivatedEnergyTrash={selectedSigniActivatedEnergyTrash} setSelectedSigniActivatedEnergyTrash={setSelectedSigniActivatedEnergyTrash} selectedSigniActivatedTrashExile={selectedSigniActivatedTrashExile} setSelectedSigniActivatedTrashExile={setSelectedSigniActivatedTrashExile} selectedSigniActivatedBeat={selectedSigniActivatedBeat} setSelectedSigniActivatedBeat={setSelectedSigniActivatedBeat} signiActCharmTrashVar={signiActCharmTrashVar} setSigniActCharmTrashVar={setSigniActCharmTrashVar} keySubstituteEnabled={keySubstituteEnabled} setKeySubstituteEnabled={setKeySubstituteEnabled} executeSigniActivated={executeSigniActivated} />

      {/* ===== エナゾーンACTIVATED（アクセカード）モーダル ===== */}
      <EnergyActivatedModal ctx={modalCtx} pendingEnergyActivated={pendingEnergyActivated} setPendingEnergyActivated={setPendingEnergyActivated} selectedEnergyActivatedCost={selectedEnergyActivatedCost} setSelectedEnergyActivatedCost={setSelectedEnergyActivatedCost} executeEnergyActivated={executeEnergyActivated} />

      {/* ===== シグニ出現時コスト付き【出】効果 モーダル ===== */}
      <SigniOnPlayCostModal ctx={modalCtx} pendingSigniOnPlayCost={pendingSigniOnPlayCost} selectedSigniOnPlayCost={selectedSigniOnPlayCost} setSelectedSigniOnPlayCost={setSelectedSigniOnPlayCost} selectedSigniOnPlayDiscard={selectedSigniOnPlayDiscard} setSelectedSigniOnPlayDiscard={setSelectedSigniOnPlayDiscard} selectedSigniOnPlayEnergyTrash={selectedSigniOnPlayEnergyTrash} setSelectedSigniOnPlayEnergyTrash={setSelectedSigniOnPlayEnergyTrash} selectedSigniOnPlayFieldTrash={selectedSigniOnPlayFieldTrash} setSelectedSigniOnPlayFieldTrash={setSelectedSigniOnPlayFieldTrash} selectedSigniOnPlayBeat={selectedSigniOnPlayBeat} setSelectedSigniOnPlayBeat={setSelectedSigniOnPlayBeat} selectedSigniOnPlayArtsTrash={selectedSigniOnPlayArtsTrash} setSelectedSigniOnPlayArtsTrash={setSelectedSigniOnPlayArtsTrash} signiOnPlayCharmTrashVar={signiOnPlayCharmTrashVar} setSigniOnPlayCharmTrashVar={setSigniOnPlayCharmTrashVar} executeSigniOnPlayCost={executeSigniOnPlayCost} skipSigniOnPlayCost={skipSigniOnPlayCost} />

      {/* ===== ルリグ付与能力（GRANT_LRIG_ABILITY）発動モーダル ===== */}
      <LrigGrantedModal ctx={modalCtx} pendingLrigGranted={pendingLrigGranted} setPendingLrigGranted={setPendingLrigGranted} selectedLrigGrantedCost={selectedLrigGrantedCost} setSelectedLrigGrantedCost={setSelectedLrigGrantedCost} selectedLrigGrantedHandDiscard={selectedLrigGrantedHandDiscard} setSelectedLrigGrantedHandDiscard={setSelectedLrigGrantedHandDiscard} selectedLrigGrantedEnergyTrash={selectedLrigGrantedEnergyTrash} setSelectedLrigGrantedEnergyTrash={setSelectedLrigGrantedEnergyTrash} selectedLrigGrantedTrashExile={selectedLrigGrantedTrashExile} setSelectedLrigGrantedTrashExile={setSelectedLrigGrantedTrashExile} executeLrigGranted={executeLrigGranted} />
      {/* ===== 効果スタック 整列モーダル ===== */}
      <StackOrderModal ctx={modalCtx} stackOrderIds={stackOrderIds} setStackOrderIds={setStackOrderIds} handleConfirmStackOrder={handleConfirmStackOrder} />

      {/* ===== 効果インタラクション モーダル ===== */}
      <EffectInteractionModal ctx={modalCtx} effectSelectedNums={effectSelectedNums} setEffectSelectedNums={setEffectSelectedNums} selectedOptCost={selectedOptCost} setSelectedOptCost={setSelectedOptCost} selectedMultiChoiceIds={selectedMultiChoiceIds} setSelectedMultiChoiceIds={setSelectedMultiChoiceIds} lookReorderOrder={lookReorderOrder} setLookReorderOrder={setLookReorderOrder} lookReorderTrash={lookReorderTrash} setLookReorderTrash={setLookReorderTrash} lookReorderBottom={lookReorderBottom} setLookReorderBottom={setLookReorderBottom} rearrangeSlots={rearrangeSlots} setRearrangeSlots={setRearrangeSlots} handleEffectInteraction={handleEffectInteraction} handleSelectZoneForEffect={handleSelectZoneForEffect} handleSelectSigniZoneForEffect={handleSelectSigniZoneForEffect} handleSelectVirusZoneForEffect={handleSelectVirusZoneForEffect} handleRearrangeSigniConfirm={handleRearrangeSigniConfirm} />

      {/* ===== 観戦表示＋長押し拡大＋終了ボタン ===== */}
      <SystemOverlays ctx={modalCtx} expandedPickImgUrl={expandedPickImgUrl} setShowEndConfirm={setShowEndConfirm} />

    </div>
  );
}

