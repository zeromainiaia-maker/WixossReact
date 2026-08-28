import { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import { supabase } from '../supabaseClient';
import type { User } from '@supabase/supabase-js';
import type { BattleStateRow, PlayerState, CardData, PendingSpell, PendingEffect, PendingInteractionDef, StackEntry, EffectStack, TurnPhase } from '../types';
import type { CardEffect, TriggerOriginZone } from '../types/effects';
import { buildEffectsMap } from '../data/effectParser';
import { applyLrigDrawPhaseReplacement, calcFieldPowers, calcActiveCostMods, calcContinuousBlockedActions, calcContinuousSigniMutations, checkActiveCondition, collectLrigGrantedEffects, collectGrantedFromUnderSigni, collectGrantedFromLayer, collectGrantedFromAcce, collectGrantedFromSoul, collectColorlessOverrides, collectForcedTargets, collectProtectedZones, collectEnergyColorSubs, collectEnergyTrashSubstituteInfo, collectEichiStubEffects, collectOppGuardExtraColorlessCost, collectHandLimits, collectAbilityProtectedSigni, collectSpecificCardCostReductions, collectCrossStates, isCrossZoneActive, filterKizunaGated, isKizunaActive, cardHasCrossIcon, collectLrigNameAliases, collectDownProtectedSigni, collectArtsThresholdCostReductions, collectOppTurnArtsCostReductions, collectOppLrigAttackExtraCost, collectHandGuardIconClasses, collectBounceProtectedSigni, collectCopiedLrigAutoEffects, collectCopiedLrigContinuousEffects, collectAttackPhaseLevelOverrides, collectDrawLimits, drawPhaseLimitFromBlocked, collectOppEnergyColorRestriction, collectOppExtraGuardFromHand, collectBlockLowCostSpellCount, collectCenterZoneDeployRestrict, collectForcePlaceFrontZones, collectFrozenBanishOverrides, collectTrashFieldProtectedSigni, collectSelfTrashPreventNums, collectAbilityGainProtectedSigni, collectMultiAcceLimits, collectRiseBanishSubstituteSigni, collectAllColorSigniForField, collectFieldSigniExtraColors, collectGrowCostSubstitute, collectGuardAlternativeCost, collectAltAttackFlipSigni, collectOppTrashLoseColorClass, collectTreatAsClassAllZones, collectDeckTrashLevel1Nums, applyDeclaredZoneClassOverride,
applyContinuousBaseLevelOverride, banishRedirectAppliesFrom, banishRedirectFrontMatches, collectBanishEffectProtectedSigni, collectBanishBySourceProtectedSigni,
collectCharmShieldSigni,
collectEffectImmuneSigni, collectContinuousGrantedKeywords, collectContinuousAbilitiesRemovedSigni, collectBanishSubstitutes, collectBanishPreventLoseAbility, resolveForcedSigniAttack, collectGrowCostReductions, matchesStateFilter, canSelfPlay} from '../engine/effectEngine';
import { executeEffect, applyRefreshOnDone, resumeSelectTarget, resumeSearch, resumeChoose, resumeOptionalCost, resumeOpponentPayOptional, resumeLookAndReorder, resumeSelectZone, resumeSelectSigniZone, resumeSelectVirusZone, resumeRevealCards, resumeRearrangeSigni, removeFromField, getCardNum, evalUseCondition, matchesFilter, payBeatSigniCost, payBeatSigniFromTrashCost, type ExecCtx, type ExecResult } from '../engine/effectExecutor';
import { getRiseFilter, matchesRiseFilter, LRIG_BARRIER_CARD, SIGNI_BARRIER_CARD, countBarrierTokens, addBarrierTokens, removeOneBarrierToken, sweepPuppets, sweepFacedownAttached, resolvePendingExiles, canAddToSelection, findValidConstrainedSelection, canSatisfyDiscardGroups, selectOptionalCostEnergy, pendingRespondsOpponent } from '../engine/execUtils';
import { initStack, pushToStack, confirmTurnOrder, confirmOppOrder, shiftQueue, isReadyToResolve, isStackDone } from '../engine/effectStack';
import { collectTargetedTriggers as pureCollectTargetedTriggers, collectLrigGrowTriggers as pureCollectLrigGrowTriggers, collectLrigFlipTriggers as pureCollectLrigFlipTriggers, collectCoinPaidTriggers as pureCollectCoinPaidTriggers, collectPowerZeroTriggers as pureCollectPowerZeroTriggers, collectArmorTriggers as pureCollectArmorTriggers, collectDeckTrashSelfTriggers as pureCollectDeckTrashSelfTriggers, collectAnyZoneTrashSelfTriggers as pureCollectAnyZoneTrashSelfTriggers, collectTrashTriggers as pureCollectTrashTriggers, collectBanishTriggers as pureCollectBanishTriggers, collectLeaveFieldTriggers as pureCollectLeaveFieldTriggers, collectDrawTriggers as pureCollectDrawTriggers, collectOppDrawTriggers as pureCollectOppDrawTriggers, collectMillTriggers as pureCollectMillTriggers, collectCharmToTrashTriggers as pureCollectCharmToTrashTriggers, collectMagicBoxFlippedTriggers as pureCollectMagicBoxFlippedTriggers, collectAcceToTrashTriggers as pureCollectAcceToTrashTriggers, collectCoinGainedTriggers as pureCollectCoinGainedTriggers, collectAbilityActivatedTriggers as pureCollectAbilityActivatedTriggers, collectAttackEndTriggers as pureCollectAttackEndTriggers, collectAttachedTriggers as pureCollectAttachedTriggers, collectEnergyToTrashTriggers as pureCollectEnergyToTrashTriggers, collectRefreshTriggers as pureCollectRefreshTriggers, collectPowerDecreaseTriggers as pureCollectPowerDecreaseTriggers, collectMoveToDeckTriggers as pureCollectMoveToDeckTriggers, collectFreezeTriggers as pureCollectFreezeTriggers, collectSelfEventTriggers as pureCollectSelfEventTriggers, collectZoneMovedTriggers as pureCollectZoneMovedTriggers, collectDriveBecameTriggers as pureCollectDriveBecameTriggers, collectBeatBecameTriggers as pureCollectBeatBecameTriggers, collectHandDiscardTriggers as pureCollectHandDiscardTriggers, collectOppArtsUseTriggers as pureCollectOppArtsUseTriggers, collectOppArtsAffectedOwnSigni, collectArtsUseTriggers as pureCollectArtsUseTriggers, collectFieldTriggers as pureCollectFieldTriggers, collectPlacedSelfOnPlayTriggers as pureCollectPlacedSelfOnPlayTriggers, collectAssistOnPlayTriggers as pureCollectAssistOnPlayTriggers, collectOptionalNoCostOnPlayForGrow, collectBloomTriggers as pureCollectBloomTriggers, collectTurnTriggers as pureCollectTurnTriggers, collectAllyPlayOrOppDiscardTriggers as pureCollectAllyPlayOrOppDiscardTriggers, collectMaterialUsedByPlayerTriggers as pureCollectMaterialUsedByPlayerTriggers, collectMaterialUsedOnSigniTriggers as pureCollectMaterialUsedOnSigniTriggers, collectBanishOppByEffectTriggers as pureCollectBanishOppByEffectTriggers, collectLrigUnderMovedTriggers as pureCollectLrigUnderMovedTriggers, collectDeckShuffledTriggers as pureCollectDeckShuffledTriggers, collectKeywordGainedTriggers as pureCollectKeywordGainedTriggers, collectSigniDownUpTriggers as pureCollectSigniDownUpTriggers, recordSigniDownedThisTurn, collectHandAddedTriggers as pureCollectHandAddedTriggers, collectTrashAddedTriggers as pureCollectTrashAddedTriggers, collectEnergyToFieldTriggers as pureCollectEnergyToFieldTriggers, collectLifeClothAddedTriggers as pureCollectLifeClothAddedTriggers, collectLifeClothMovedTriggers as pureCollectLifeClothMovedTriggers, collectOppEnergyAddedTriggers as pureCollectOppEnergyAddedTriggers, collectLrigAttackDefenderTriggers as pureCollectLrigAttackDefenderTriggers, collectAllyLrigAttackTriggers as pureCollectAllyLrigAttackTriggers, collectSigniCrashTotalTriggers as pureCollectSigniCrashTotalTriggers, collectOppResourceLossTriggers as pureCollectOppResourceLossTriggers, collectBattleBanishDelayedTriggers as pureCollectBattleBanishDelayedTriggers, collectSigniAttackDelayedTriggers as pureCollectSigniAttackDelayedTriggers, collectAttackerSelfDelayedTriggers as pureCollectAttackerSelfDelayedTriggers, battleBanisherMatchesTrigger, isMandatoryOwnOnPlayForNormalSummon, isOptionalOwnOnPlayForNormalSummon, isSigniOwnOnPlaySuppressed, onPlayOriginMatches, wrapOptionalOnPlay, type TrigCtx, type TargetedOrigin } from '../engine/triggerCollect';
import { collectTrapActivateTriggers as pureCollectTrapActivateTriggers, collectTrapSetTriggers as pureCollectTrapSetTriggers, collectLrigAttackGuardedTriggers as pureCollectLrigAttackGuardedTriggers, collectEnergyAddedSelfTriggers as pureCollectEnergyAddedSelfTriggers, collectAttackerSelfTriggers as pureCollectAttackerSelfTriggers, collectRevealedFromHandTriggers as pureCollectRevealedFromHandTriggers } from '../engine/triggerCollect';
import { detectBanishedSigni, detectPlacedSigni, detectBloomedSigni, detectFacedownFlipped, detectEnergyFromTrash, detectNewlyArmored, detectLeftFieldSigni, detectTrashedSigni, detectDeckTrashed, detectHandTrashed, detectEnergyTrashed, detectUnderSigniTrashed, countCharmsToTrash, countMagicBoxesFlipped, countAcceToTrash, countCoinsGained, detectSoulAttached, detectCardAttached, countEnergyToTrash, countEnergyLeftZone, countRefresh, detectPowerDecrease, detectPowerDecreaseSources, countMilledFromDeck, detectMilledFromDeck, countMovedToDeck, countMovedToDeckFromField, countLrigUnderMoved, detectDeckShuffled, detectKeywordGained, detectNewlyFrozen, detectNewlyDowned, detectNewlyUpped, detectHandAdded, detectPlacedFromEnergy, detectLifeClothAdded, detectLifeClothMoved, detectEnergyAdded } from '../engine/boardDiff';
import { detectEnergyAddedWithSource, detectTrashAdded, detectPlacedFromZone } from '../engine/boardDiff';
import { hasApplicableLancer, hasKeyword, hasBanishResist } from '../utils/keywords';
import { acceCardsAt, allAcceCards, cloneAcceSlots, hasAcceAt, normalizeAcceSlots } from '../utils/acce';
import { C, HandCards, PlayerField } from '../components/BoardComponents';
import type { CardAction } from '../components/BoardComponents';
import { consumeNextDamagePrevention, resolveTurnEndPreventionMill, type DamageSourceContext } from './battle/damagePrevention';
import { resolveTurnEndLrigDeckReturn } from './battle/turnEndLrigDeckReturn';
import { resolveTurnEndHandReturn } from './battle/turnEndHandReturn';
import { resolveTurnEndEnergyTrash } from './battle/turnEndEnergyTrash';
import { pickLifeCrashReplacement, applyMillReplacement, applyPayCostReplacement, consumeLifeCrashReplacement, lifeCrashReplaceLog } from './battle/lifeCrashReplace';
import { buildRearrangeSigniArrangement } from './battle/rearrangeSigniUi';
import { payLifeOnPlayCost } from './battle/lifeCost';
import { payLrigDownCost, payLrigDownSelfCost, fmtLrigDownCostLabel } from './battle/lrigDownCost';
import { payFieldBanishCost } from './battle/fieldBanishCost';
import { canOfferTrashActivate, payTrashActivateCost, trashActivateCostLabels } from './battle/trashActivateCost';
import { isTrashImmuneByOpponent } from '../engine/execUtils';
import { resolveTargetDodgeFlip } from './battle/targetDodgeFlip';
import { collectPieceCutinCandidates } from './battle/pieceCutin';
import { completePieceCutinResponseAfterEffects } from './battle/pieceCutinCommit';
import { canPayUnderSelfTrash, payUnderAnySigniTrash, payUnderSelfTrash } from './battle/underAnySigniCost';
import { buildEnergyPayPool, energyPoolCardNums, planEnergyPayment, type EnergyPayEntry } from './battle/energyPaySource';

interface Props {
  user: User;
  roomId: string;
  myDeckId: string;
  cards: CardData[];
  onBack: () => void;
}

import { CPU_PLAYER_ID, CPU_ACTION_DELAY, generateUUID, shuffle, InstanceMap, parsePowerVal, assignInstanceIds, assignGuestInstanceIds, drawCards, jankenWinner, isSelectedBanishRedirect, isSelectedBattleBanishRedirect, isSelectedPowerZeroBanishRedirect, keyActivatedTimingMatchesPhase, canUseArtsCondition, hasActivePreventDamageWindow } from './battle/battleUtils';
import { applyAbilityCostReduction, mainPhaseGateOkFor } from '../engine/triggerCollect';
import { battleOppLifeCrashSourceMatches } from './battle/lifeCrashTriggers';
import { crashCauseMatches } from '../engine/triggerCollect';
import { isEnaMultiStripped, activatedDiscardCostRecord, activatedEnergyTrashPaidCount, fmtHandDiscardSigniLabel, fmtDiscardFilterLabel, parseGrowCost, applyGrowCostReduction, paidEnergyColorsOf, canAffordGrowCost, parseCoinCost, parseEncoreCost, computeArtsEffectiveCost, costScalingOf, canAffordWithExtraCost, findCounterSpellMaxCost, paySelectedExceed } from './battle/costs';
import { findGrowFreeAction, extractGrowCondition, applyGrowEffect, lrigClassesCompatible, meetsRestriction, effectiveLrigClass, listGrowCandidates, canGrowNow } from './battle/growLogic';
import { cardNameUseBlocked } from './battle/cardNameUseBlock';
import { computeFieldSigniLimit } from './battle/fieldLimit';
import { MAYU_ENCOUNTER_A, MAYU_ENCOUNTER_B, prepareMayuEncounter } from './battle/mayuEncounter';
import { computeEffectiveLrigLimit } from './battle/lrigLimit';
import { consumeNthAttackNegation, getTargetedAttackNegation, resolveNegateEscapeChoice } from './battle/attackNegation';
import { collectOppSigniAttackResponses } from './battle/attackResponse';
import { clearEndOfTurnDelayedTriggers, consumeBattleBanishDelayedTriggers, consumeOnceDelayedTriggers } from './battle/delayedTrigger';
import { resolveTurnEndFacedownReturns } from '../engine/facedownSigni';
import { JANKEN_LABEL, PHASE_LABEL, PHASE_BTN, PHASE_NEXT, NON_TURN_PLAYER_PHASES, WAITING_MSG, setupWrap, primaryBtn } from './battle/uiConstants';
import { resolveNextPhaseWithSkips, resolveNextPhaseAfterAttack, isPhaseSkipped } from './battle/attackStepPhase';
import { resolveTurnHandover } from './battle/turnHandover';
import { resolveLrigDamageShield } from './battle/lrigDamageShield';
import { MulliganCard } from './battle/MulliganCard';
import type { BattleModalCtx, CutinCandidate } from './battle/modals/types';
import { GrowModal } from './battle/modals/GrowModal';
import { ArtsModal } from './battle/modals/ArtsModal';
import { CutinModal } from './battle/modals/CutinModal';
import { parseUseTimeCostReduction, payUseTimeCost } from './battle/useTimeCost';
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
import { ResonaSummonModal } from './battle/modals/ResonaSummonModal';
import { RemoveZoneModal } from './battle/modals/RemoveZoneModal';
import { LifeBurstCheckModal } from './battle/modals/LifeBurstCheckModal';
import { allZoneBurstGrantMatches, clearAllZoneBurstGrantUntilOppTurn, grantedAllZoneBurstAction, hasNativeLifeBurst, resolveAllZoneBurstGrant, shouldAddGrantedAllZoneBurst } from './battle/allZoneBurst';
import { EndDiscardModal } from './battle/modals/EndDiscardModal';
import { BanishSubstituteModal } from './battle/modals/BanishSubstituteModal';
import { PhaseConfirmDialogs } from './battle/modals/PhaseConfirmDialogs';
import { SpellCastModal } from './battle/modals/SpellCastModal';
import { HandActivatedModal } from './battle/modals/HandActivatedModal';
import { TrashActivatedModal } from './battle/modals/TrashActivatedModal';
import { GuardBarrierActModal } from './battle/modals/GuardBarrierActModal';
import { NegateEscapeModal } from './battle/modals/NegateEscapeModal';
import { AttackFieldTrashCostModal } from './battle/modals/AttackFieldTrashCostModal';
import { AttackHandDiscardCostModal } from './battle/modals/AttackHandDiscardCostModal';
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
import { useBattleSession } from './battle/hooks/useBattleSession';
import { useBattleLog } from './battle/hooks/useBattleLog';
import { useGameStartSetup, useSigniSummonFlow } from './battle/hooks/useSetupFlow';
import { useBattlePersist } from './battle/controller/persist';
import { reduceBattle, type PlayerStateKey } from './battle/controller/battleController';
import { canCardGuard } from './battle/guard';
import { getSigniAttackKeywordState } from './battle/signiAttackKeywords';
import { clearEndOfAttackEffects, clearEndOfAttackPhaseDelayedTriggers } from './battle/attackDuration';
import { clearTurnGrantedLrigAbilities, collectAttackingLrigGrantedAutos, consumeTriggeredGrantedAutos, reserveGrantedAutoUsage } from './battle/grantedAuto';
import { getResonaSummonCandidate, getSpellCutinResonaCandidates, payResonaAppearanceAndPlace, resonaCombinedOptions, resonaPaymentOptions, type ResonaPaymentItem, type ResonaPaymentSelection, type ResonaSummonCandidate } from './battle/resonaSummon';
import { finalizeUsedCardPlacement, type UsedCardPlacement } from './battle/spellPlacement';
import { pendingEffectCardNums } from './battle/pendingEffectCards';
import { activateNextTurnDeployCountLimit } from './battle/deployCountLimit';
import { resolveSigniZonePlacement, activateNextTurnSigniZoneBlocks } from './battle/signiZoneBlock';
import { clearUntilOppTurnEffects } from './battle/untilOppTurn';
import { attackFieldTrashCost, canPayAttackFieldTrashCost, clearAttackFieldTrashCosts, deterministicAttackFieldTrashZones, payAttackFieldTrashCost } from './battle/attackFieldTrashCost';
import { canSigniAttack, collectForcedAttackZones, signiAttackColorlessCost } from './battle/signiAttackGate';
import { effectivePowerOf, facingSigniPower, pickCpuAttackZone, pickCpuDeployCard } from './battle/cpuBoardEval';
import { listActivatableSigniEffects } from './battle/signiActivateGate';
import { pickCpuSigniActivated, selectEnergyIndicesForCost } from './battle/cpuActivate';
import { collectGrantedLrigEffects, listActivatableLrigEffects, listActivatableGrantedLrigEffects, listActivatableInheritedLrigEffects } from './battle/lrigActivateGate';
import { pickCpuLrigActivated } from './battle/cpuLrigActivate';
import { type ArtsPayerCtx, buildArtsPayerCtx, checkArtsUse, collectEnaAllMulti, collectEnergyExtraColors, isArtsUseBlockedFor } from './battle/artsUseGate';
import { type CpuArtsChoice, type CpuArtsPickInput, pickCpuOffensiveArts, pickCpuResponseArts } from './battle/cpuArts';
import { checkSpellUse, isSpellUseBlockedFor } from './battle/spellUseGate';
import { pickCpuMainSpell } from './battle/cpuSpell';
import { signiAttackBanHandDiscardCost, lrigAttackBanCost } from './battle/signiAttackBan';
import { assistLrigAttackableSlots, lrigSlotTop, markLrigSlotDown, type LrigAttackSlot } from './battle/assistLrigAttack';
import { signiCannotDealDamageToOpponent } from './battle/signiDamageGate';
import { sideAttackEmptyZoneDealsDamage } from './battle/sideAttackDamage';
import { crashSourceSuppressesLifeBurst } from './battle/lifeBurstSuppress';
import { activateTurnStartScopedState, applyForcedTurnEnd, clearAttackPhaseScopedState, clearMainPhaseScopedState, clearTurnEndScopedState, closeTeamPieceCutinWindow, consumeFreeGrowThisTurn, consumeSpellNegationThisTurn } from './battle/turnScopedState';
import { grantedStoreWatchers } from '../engine/grantedStore';
import { deployCountCap, deployLimitBlockReason } from '../engine/deployLimit';
import { allowedLifeCrashCount, collectLifeCrashPreventions } from '../engine/lifeCrashGate';
import { isHandSigniPlayBlockedByPower, isSigniAutoAbility, findSigniAutoPayGate, wrapSigniAutoPayGate } from '../engine/blockAction';

function finalizePendingSpellPlacement(result: ExecResult, pe: PendingEffect): ExecResult {
  if (!result.done || !pe.spellPlacement) return result;
  return {
    ...result,
    ownerState: finalizeUsedCardPlacement(result.ownerState, pe.sourceCardNum, pe.spellPlacement),
  };
}

/**
 * 次の pending の応答者パッチ（§6.4 O-2）。
 *
 * ⚠resume 系ハンドラは一律に `respondPlayerId` を捨てて次の pending を作る（＝効果オーナーへ戻す）。
 *   これは「相手が1回だけ応答する」型には正しいが、**次の pending 自身が相手応答型**のときは
 *   相手が選ぶべき対話を効果オーナーが代わりに操作してしまう。1枚ずつゾーンを選ぶ配置チェーン
 *   （「対戦相手はその中からシグニをN枚まで場に出し」）は2枚目以降がこれに当たる。
 *   `pendingRespondsOpponent` が false のときは空オブジェクト＝**従来挙動と厳密に同じ**。
 */
function nextRespondPatch(
  pending: PendingInteractionDef, sourcePlayerId: string, hostId: string, guestId: string,
): { respondPlayerId?: string } {
  return pendingRespondsOpponent(pending)
    ? { respondPlayerId: sourcePlayerId === hostId ? guestId : hostId }
    : {};
}

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
  const persist = useBattlePersist(roomId);
  // ゲーム開始時セットアップ（マリガン選択＋アシストルリグ配置の中間状態）
  const { mulliganSelected, setMulliganSelected, pendingLrigSetup, setPendingLrigSetup } = useGameStartSetup();
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
  } = useGrowModal();
  const {
    showArtsModal, setShowArtsModal, pendingArtsCard, setPendingArtsCard,
    pendingArtsEffectiveCost, setPendingArtsEffectiveCost, selectedArtsCost, setSelectedArtsCost,
    selectedArtsDiscard, setSelectedArtsDiscard, selectedArtsUseCostPay, setSelectedArtsUseCostPay, betAmount, setBetAmount, isEncore, setIsEncore,
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
  const leavingRef = useRef(false);
  const stackProcessingRef        = useRef(false);  // resolveStackNext の多重実行防止
  const lastResolvedEntryIdRef    = useRef<string | null>(null); // 直前に処理したキュー先頭のID（DB伝播前の二重処理防止）
  const doPhaseAdvanceRef                = useRef<(() => Promise<void>) | null>(null);
  const triggerPendingCrashRef           = useRef<(() => Promise<void>) | null>(null);
  const resolveStackNextRef              = useRef<(() => Promise<void>) | null>(null);
  const handleCutinPassRef               = useRef<(() => Promise<void>) | null>(null);
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
    if (!transitioningRef.current && bs.setup_phase === 'JAN_KEN' && bs.host_janken && bs.guest_janken) {
      transitioningRef.current = true;
      const winner = jankenWinner(bs.host_janken, bs.guest_janken, bs.host_id, bs.guest_id);
      const update = reduceBattle(bs, { type: 'RESOLVE_JANKEN', winnerId: winner });
      const t = setTimeout(() => {
        persist.commit(update)
          .then(() => { transitioningRef.current = false; });
      }, 1800);
      return () => { clearTimeout(t); transitioningRef.current = false; };
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
    // 🔴**「効果解決なしで state だけ変わる」CPU 行動でも再スケジュールする**（2026-08-19 続き567・§3 (cxxxvi)）＝
    //   `performGrow` は ON_PLAY 系エントリが1件も無いと `effect_stack` を積まずに `WRITE_STATE` だけ commit する
    //   （グロウ先に【出】が無い／コスト付き任意【出】がコイン不足で発火しない）。上の依存はどれも動かないので
    //   **タイマーが二度と積まれず GROW フェイズで永久凍結**していた（`v78CpuGrowsButSkipsOnPlayWithoutCoin` で発見）。
    //   ⚠**グロウで動く値を明示的に並べる**＝ルリグのトップ／段数／ルリグデッキ枚数／コイン／行動履歴。
    //   再スケジュールは「clearTimeout してから setTimeout」なので、余計に発火しても実行は1回に畳まれる。
    bs?.guest_state?.field?.lrig?.length,
    bs?.guest_state?.field?.lrig?.at(-1),
    bs?.guest_state?.lrig_deck?.length,
    bs?.guest_state?.coins,
    bs?.guest_state?.actions_done?.length,
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
      const requiredChoice = inter.mode === 'swap_pair' && !inter.optional
        ? inter.signiNums.slice(0, 2)
        : inter.mode === 'swap' && !inter.optional
          && (inter.swapSourceLocation === 'energy' || inter.swapSourceLocation === 'trash')
          ? inter.signiNums.slice(0, 1)
          : null;
      const timerRS = setTimeout(() => { handleRearrangeSigniConfirm(requiredChoice); }, CPU_ACTION_DELAY);
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
          const cpuMap = new Map(cards.map(c => [c.CardNum, c] as const));
          const exactPick = inter.selectionConstraint?.totalLevelExact !== undefined
            ? findValidConstrainedSelection(shuffled, inter.optional ? 0 : count, count, inter.selectionConstraint, cpuMap)
            : null;
          if (exactPick) selected = exactPick;
          else for (const n of shuffled) {
              if (selected.length >= count) break;
              if (canAddToSelection(selected, n, inter.selectionConstraint, cpuMap)) selected.push(n);
            }
        }
      } else if (inter.type === 'CHOOSE') {
        if (inter.multiSelect) {
          // 複数選択: 利用可能な選択肢からcount個（upToならcount個まで）選択
          const avail = inter.options.filter(o => o.available);
          // 「同じ選択肢を２回以上選んでもよい」（§6.4 O-29）＝**選択肢の数より多く選べる**ので、
          // 足りないぶんは先頭から巡回して埋める。⚠これが無いと選択肢2つ・count4 のとき CPU は2つしか
          // 選ばず、ベットしたコインぶんの選択が**黙って目減りする**（過少）。
          selected = inter.allowRepeat && avail.length > 0
            ? Array.from({ length: inter.count }, (_, i) => avail[i % avail.length].id)
            : avail.slice(0, inter.count).map(o => o.id);
        } else {
          const firstAvail = inter.options.find(o => o.available) ?? inter.options[0];
          selected = firstAvail ? [firstAvail.id] : [];
          // ⚠costColors 付きの選択肢は**選択肢IDだけでは支払えない**（タスク12(cii)）。
          //   `handleEffectInteraction` は `selectedOrChoiceId.slice(1)` を支払いエナの instanceId として
          //   読み、`resumeOpponentPayOptional`／`resumeOptionalCost` はそれが空なら
          //   「コスト支払いエラー: エナ不足」で**即終了**する（cost 未消費・then も未実行＝黙って空振り）。
          //   人間側UI（optcost-energy-N）が人力でやっているエナ選出を CPU 版として行う。
          //   支払い主体は CPU 自身＝`opponentResponds`（応答者＝CPU）でも通常の任意コスト（効果オーナー＝CPU）でも同じ。
          if (firstAvail?.costColors?.length) {
            const cpuState = bs.host_id === CPU_PLAYER_ID ? bs.host_state : bs.guest_state;
            const cpuCardMap = new InstanceMap(cards.map(c => [c.CardNum, c] as [string, CardData]));
            const paidEnergy = selectOptionalCostEnergy(firstAvail.costColors, cpuState, cpuCardMap);
            // 選出できないのに available だったら支払い枝は選ばず「支払わない」へ倒す（黙って空振りさせない）。
            if (paidEnergy) selected = [firstAvail.id, ...paidEnergy];
            else selected = [(inter.options.find(o => o.id !== firstAvail.id && o.available) ?? firstAvail).id];
          }
        }
      } else if (inter.type === 'SEARCH') {
        const count = inter.maxPick ?? 0;
        const cpuMap = new Map(cards.map(c => [c.CardNum, c] as const));
        const exactPick = inter.selectionConstraint?.totalLevelExact !== undefined
          ? findValidConstrainedSelection(inter.visibleCards, inter.optional ? 0 : count, count, inter.selectionConstraint, cpuMap)
          : null;
        if (exactPick) selected = exactPick;
        else for (const n of inter.visibleCards) {
            if (selected.length >= count) break;
            if (canAddToSelection(selected, n, inter.selectionConstraint, cpuMap)) selected.push(n);
          }
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
      if (s.field.key_piece) nums.add(getCardNum(s.field.key_piece));
      (s.field.key_piece_extra ?? []).forEach(n => nums.add(getCardNum(n)));
      addAll(s.field.assist_lrig_l); addAll(s.field.assist_lrig_r);
      (s.field.signi_charms ?? []).forEach(n => n && nums.add(getCardNum(n)));
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
    for (const n of pendingEffectCardNums(bs?.pending_effect)) nums.add(n);
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
        // 🔴**SEQUENCE の中も見る**（2026-08-28・Sheet1 残8枚バッチ・実機で発見）＝
        //   「このシグニのパワーは＋Nされ／基本パワーはNになり、このシグニは「【自】…」を得る」の連用中止形は
        //   `SEQUENCE[POWER_MODIFY|POWER_SET, GRANT_FIELD_SIGNI_ABILITY]` になる。
        //   `collectContinuousGrantedAbilities`（`effectEngine.ts:6535`）は**この形を明示的に走査している**のに、
        //   ここのゲートが action 直下しか見ていなかったので **effectsMap が付与つきで組み直されず、
        //   付与された【自】が1度も収集されなかった**（実測 live 11効果）。
        //   ⚠すぐ下の `hasPlayerFieldGrant`（プレイヤー付与）は最初から SEQUENCE を見ており、**片側だけの穴**だった。
        e.effectType === 'CONTINUOUS' && (e.action.type === 'GRANT_FIELD_SIGNI_ABILITY'
          || (e.action.type === 'SEQUENCE' && e.action.steps.some(a => a.type === 'GRANT_FIELD_SIGNI_ABILITY'))));
    });
    const hasPlayerFieldGrant = [myS, opS].some(st => (st.game_granted_effects ?? []).some(e =>
      e.effectType === 'CONTINUOUS' && (e.action.type === 'GRANT_FIELD_SIGNI_ABILITY'
        || (e.action.type === 'SEQUENCE' && e.action.steps.some(a => a.type === 'GRANT_FIELD_SIGNI_ABILITY'))),
    ));

    // アクセ付与（GRANT_ACCE_HOST_ABILITY）持ちアクセカードの有無チェック
    const hasAcceGrant = [...allAcceCards(myS.field), ...allAcceCards(opS.field)].some(acceNum => {
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

    if (!hasGranted && !hasStack && !hasOverrides && !hasFieldGrant && !hasPlayerFieldGrant && !hasAcceGrant && !hasSoulGrant && !hasCopyLrigCont) return baseEffectsMap;

    // 🔴**`InstanceMap` で組む**（2026-08-28・Sheet1 残8枚バッチ・実機で発見）＝
    //   下の付与コレクタ（`collectGrantedFromLayer` / `…FromAcce` / `…FromSoul` / `…FromUnderSigni`）へ
    //   **この map をそのまま渡している**のに、素の `Map` は `'WX11-053#1'` のような **instanceId を解決できない**
    //   （`new Map(baseEffectsMap)` は InstanceMap の**実エントリ＝CardNum キー**だけを複製する）。
    //   コレクタは場のシグニを `field.signi[zi].at(-1)`＝**instanceId** で引くので、
    //   `effectsMap.get(top)` が常に `undefined` になり **付与宣言が1件も収集されなかった**
    //   （実機で `myLayer=[]` を実測。live で `GRANT_FIELD_SIGNI_ABILITY` を持つ 71 効果が該当）。
    //   ⚠`return new InstanceMap(augMap)` は最後に包み直しているので**外から見た型は変わらない**＝
    //     ここを InstanceMap にしても呼び出し側の挙動は変わらず、内部の付与収集だけが直る。
    const augMap = new InstanceMap<import('../types/effects').CardEffect[]>(baseEffectsMap);

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
      const myUnder = collectGrantedFromUnderSigni(myS, opS, myTurn, augMap, battleCardMap, bs.turn_phase);
      const opUnder = collectGrantedFromUnderSigni(opS, myS, !myTurn, augMap, battleCardMap, bs.turn_phase);
      for (const [num, extra] of [...myUnder, ...opUnder]) {
        const base = augMap.get(num) ?? augMap.get(getCardNum(num)) ?? [];
        augMap.set(num, [...base, ...extra]);
      }
    }

    // レイヤー等のフィールド付与（collectGrantedFromLayer）
    if (hasFieldGrant || hasPlayerFieldGrant) {
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
  const fillDeployCaps = (c: ExecCtx): ExecCtx => {
    c.deployCountCapSelf = deployCountCap({
      placingState: c.ownerState, opponentState: c.otherState,
      cardMap: battleCardMap, effectsMap, isPlacingOwnerTurn: c.isOwnerTurn,
    });
    c.deployCountCapOpponent = deployCountCap({
      placingState: c.otherState, opponentState: c.ownerState,
      cardMap: battleCardMap, effectsMap,
      isPlacingOwnerTurn: c.isOwnerTurn === undefined ? undefined : !c.isOwnerTurn,
    });
    c.lifeCrashPreventionsSelf = collectLifeCrashPreventions(
      c.ownerState, c.otherState, c.isOwnerTurn ?? false, battleCardMap, effectsMap);
    c.lifeCrashPreventionsOpponent = collectLifeCrashPreventions(
      c.otherState, c.ownerState, c.isOwnerTurn === undefined ? false : !c.isOwnerTurn, battleCardMap, effectsMap);
    return c;
  };

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
          undefined, !!localMy.hand_discarded_just_by_opp, localMy.hand_discarded_just_cause_owner_id ?? undefined);
        entries.push(...hdEntries);
        const cleared: PlayerState = {
          ...localMy,
          hand_revealed_just: null,
          hand_revealed_just_source_card_num: null,
          hand_discarded_just: null,
          hand_discarded_just_by_opp: null,
          hand_discarded_just_cause_owner_id: null,
          actions_done: usedLimitIds.length > 0 ? [...(localMy.actions_done ?? []), ...usedLimitIds] : localMy.actions_done,
        };
        const states: Partial<Record<PlayerStateKey, PlayerState>> = { [stateKey]: cleared };
        // CPU戦: CPU(guest)が捨てた手札 → CPU自身の self/any 効果 + 人間(host)の 'any' 効果を収集し、guest フラグをクリア
        if (cpuDiscardedHJ.length > 0) {
          const { entries: cpuHd, usedLimitIds: cpuUsed } = collectHandDiscardTriggers(
            cpuDiscardedHJ, bs.guest_state, CPU_PLAYER_ID, false, bs.host_state, bs.host_id,
            undefined, !!bs.guest_state.hand_discarded_just_by_opp, bs.guest_state.hand_discarded_just_cause_owner_id ?? undefined);
          entries.push(...cpuHd);
          states.guest_state = {
            ...bs.guest_state,
            hand_discarded_just: null,
            hand_discarded_just_by_opp: null,
            hand_discarded_just_cause_owner_id: null,
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
      await persist.commit(reduceBattle(bs, { type: 'SUBMIT_JANKEN', isHost: false, pick }));
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
      await persist.commit(reduceBattle(bs, {
        type: 'SELECT_LRIG', isHost: false,
        selectedCardNum: cpuDeckData.lrig_deck[lv0Idx], state: cpuState,
      }));
      return;
    }

    if (phase === 'MULLIGAN') {
      const cpuSt = bs.guest_state;
      const newLifeCloth = cpuSt.deck.slice(0, 7);
      const newDeck = cpuSt.deck.slice(7);
      const newCpuSt: PlayerState = { ...cpuSt, deck: newDeck, life_cloth: newLifeCloth };
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

          if (fresh?.host_janken && fresh?.guest_janken && !transitioningRef.current) {
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
        await persist.commit(reduceBattle(bs, { type: 'SELECT_LRIG', isHost, selectedCardNum: cardNum, state: myState }));
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
          await persist.commit(reduceBattle(bs, { type: 'SELECT_LRIG', isHost, selectedCardNum: setup.centerCardNum, state: myState }));
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
          await persist.commit(reduceBattle(bs, { type: 'SELECT_LRIG', isHost, selectedCardNum: setup.centerCardNum, state: myState }));
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
  const collectDeckTrashSelfTriggers = (trashedCardNum: string, trashedPlayerId: string, causeByOpponent = false, causeSourceCardNum?: string, byEffectCause = true): StackEntry[] =>
    pureCollectDeckTrashSelfTriggers(mkTrigCtx(), trashedCardNum, trashedPlayerId, causeByOpponent, causeSourceCardNum, byEffectCause);
  const collectAnyZoneTrashSelfTriggers = (trashedCardNum: string, trashedPlayerId: string, causeByOpponent = false, origin: 'hand' | 'energy' | 'under_signi' = 'hand', causeSourceCardNum?: string, byEffectCause = true, ownerState?: PlayerState, otherState?: PlayerState): StackEntry[] =>
    pureCollectAnyZoneTrashSelfTriggers(mkTrigCtx(), trashedCardNum, trashedPlayerId, causeByOpponent, origin, causeSourceCardNum, byEffectCause, ownerState, otherState);
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
    cause?: { ownerId: string; sourceCardNum?: string },
    battleAttackerNum?: string,
  ): { entries: StackEntry[]; usedHostIds: string[]; usedGuestIds: string[] } =>
    pureCollectBanishTriggers(mkTrigCtx(), banishedCardNum, banishedPlayerId, afterHostState, afterGuestState, prevOwnerState, cause, battleAttackerNum);

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
  const collectTargetedTriggers = (targetedNums: string[], targetedOwnerId: string, afterHostState: PlayerState, afterGuestState: PlayerState, origin?: TargetedOrigin, beforeHostState: PlayerState = afterHostState, beforeGuestState: PlayerState = afterGuestState): { entries: StackEntry[]; usedHostIds: string[]; usedGuestIds: string[] } =>
    pureCollectTargetedTriggers(mkTrigCtx(), targetedNums, targetedOwnerId, afterHostState, afterGuestState, origin, beforeHostState, beforeGuestState);
  const collectLrigGrowTriggers = (grownOwnerId: string, afterGrowerState: PlayerState, afterOpState: PlayerState): { entries: StackEntry[]; usedHostIds: string[]; usedGuestIds: string[] } =>
    pureCollectLrigGrowTriggers(mkTrigCtx(), grownOwnerId, afterGrowerState, afterOpState);
  const collectCoinPaidTriggers = (payerId: string, afterPayerState: PlayerState, afterOpState: PlayerState): { entries: StackEntry[]; usedIds: string[] } =>
    pureCollectCoinPaidTriggers(mkTrigCtx(), payerId, afterPayerState, afterOpState);
  // 「対戦相手のルリグがアタックしたとき」＝**防御側**の付与AUTO（any_opp/any scope）を収集（タスク12(xlvii)）。
  // 従来この経路が無く、防御側の付与能力が ON_ATTACK_LRIG で一切拾われなかった。
  // 場のシグニ/キーの CONTINUOUS GRANT_LRIG_ABILITY 由来（アタック側は下の contGrantedLrigEffects で合流済み）も渡す。
  const collectLrigAttackDefenderTriggers = (defenderState: PlayerState, attackerState: PlayerState, defenderId: string): { entries: StackEntry[]; usedIds: string[] } =>
    pureCollectLrigAttackDefenderTriggers(mkTrigCtx(), defenderState, defenderId,
      collectLrigGrantedEffects(defenderState, attackerState, false, effectsMap, battleCardMap));
  // 「**あなたの**ルリグがアタックしたとき」＝**アタック側の味方カード**（場のシグニ／アシストルリグ）の
  // AUTO を収集（§3 (cxxviii)・続き475d）。上の防御側コレクタとは主語も playerId も違う。
  const collectAllyLrigAttackTriggers = (attackerState: PlayerState, attackerId: string, attackingLrigNum: string): { entries: StackEntry[]; usedIds: string[] } =>
    pureCollectAllyLrigAttackTriggers(mkTrigCtx(), attackerState, attackerId, attackingLrigNum);
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
    timing: 'ON_TURN_START' | 'ON_TURN_END' | 'ON_ATTACK_PHASE_START' | 'ON_ATTACK_PHASE_END' | 'ON_GROW_PHASE_START' | 'ON_MAIN_PHASE_START' | 'ON_LRIG_ATTACK_STEP_START',
    myState: PlayerState,
    opState: PlayerState,
  ): { entries: StackEntry[]; usedMyIds: string[]; usedOpIds: string[] } => {
    const r = pureCollectTurnTriggers(mkTrigCtx(), timing, myState, opState);
    return { entries: r.entries, usedMyIds: isHost ? r.usedHostIds : r.usedGuestIds, usedOpIds: isHost ? r.usedGuestIds : r.usedHostIds };
  };

  /**
   * CPU ターンのフェイズ/ターン境界トリガー収集（タスク12(lxvii)）＝上の `collectTurnTriggers` の CPU 版。
   *
   * ⚠🔴**人間ターンは `doPhaseAdvance` が6 timing すべてを収集するのに対し、CPU 経路は
   *   `ON_GROW_PHASE_START` だけが配線されていた**。`ON_ATTACK_PHASE_START` は
   *   **self scope しか見ない手書きの部分再実装**、残り4 timing は**収集そのものが存在しなかった**。
   *   実測＝CPU のターンで一切発火しなかった効果は **計282件**（`ON_TURN_END` 190／
   *   `ON_ATTACK_PHASE_START` の非 self スコープ 57／`ON_MAIN_PHASE_START` 31／`ON_TURN_START` 3／
   *   `ON_LRIG_ATTACK_STEP_START` 1）。**BattleScreen は golden から叩けない＝計器に一切映らない**穴だった。
   * ⚠CPU は常に guest（`cpuTurnAction` 全体が `guest_state` 前提）。
   * ⚠戻り値の `humanState` は **once_per_turn を消費したときだけ** 値が入る（＝不要な書き込みをしない）。
   */
  const collectCpuTurnTriggers = (
    timing: 'ON_TURN_START' | 'ON_TURN_END' | 'ON_ATTACK_PHASE_START' | 'ON_ATTACK_PHASE_END' | 'ON_GROW_PHASE_START' | 'ON_MAIN_PHASE_START' | 'ON_LRIG_ATTACK_STEP_START',
    cpuState: PlayerState,
    humanState: PlayerState,
  ): { entries: StackEntry[]; cpuState: PlayerState; humanState?: PlayerState } => {
    const r = pureCollectTurnTriggers({ ...mkTrigCtx(), meId: CPU_PLAYER_ID }, timing, cpuState, humanState);
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

  /**
   * ON_REFRESH をスタックを経由しないスペル解決経路でインライン収集する（§5.1 `V-91`・2026-08-28）。
   *
   * 🔴**スペル解決経路は中央 diff（`collectBoardDiffTriggers`）を1度も通らない。**
   *   隣の `collectDeckShuffleInline` が「スタック解決を経由しないスペル解決経路は中央 diff を
   *   通らないためここで拾う」と書いているとおりで、**同じ穴が ON_REFRESH にも空いていた**
   *   （§5-15＝「同型の配線が複数箇所に要るとき1箇所で満足する」の再発）。
   *   実機で `WX09-Re06`（このターン最初のリフレッシュで相手ライフをクラッシュ）を撃つと、
   *   **リフレッシュは起きる（deck 1→4・trash 4→2）のに設置が消費されず何も起きなかった**。
   * ⚠`once`（「このターン**最初の**リフレッシュ」）の消費まで含めて中央 diff と同じ規約に揃える。
   * ⚠**残りのトリガー族（バニッシュ／トラッシュ／ミル等）は依然このスペル経路を通らない**＝
   *   全面配線は §5.3 `O-135` へ登録した（回帰が広いので専用の巡が要る）。
   */
  const collectRefreshInline = (
    afterHost: PlayerState,
    afterGuest: PlayerState,
  ): { entries: StackEntry[]; hostState: PlayerState; guestState: PlayerState } => {
    const refreshHost = countRefresh(bs.host_state, afterHost);
    const refreshGuest = countRefresh(bs.guest_state, afterGuest);
    if (refreshHost <= 0 && refreshGuest <= 0) return { entries: [], hostState: afterHost, guestState: afterGuest };
    let h = afterHost, g = afterGuest;
    const entries: StackEntry[] = [];
    const rfH = collectRefreshTriggers(bs.host_id, h, g, refreshHost, refreshGuest);
    entries.push(...rfH.entries);
    if (rfH.usedOncePerTurnIds.length > 0) h = { ...h, actions_done: [...(h.actions_done ?? []), ...rfH.usedOncePerTurnIds] };
    const rfG = collectRefreshTriggers(bs.guest_id, g, h, refreshGuest, refreshHost);
    entries.push(...rfG.entries);
    if (rfG.usedOncePerTurnIds.length > 0) g = { ...g, actions_done: [...(g.actions_done ?? []), ...rfG.usedOncePerTurnIds] };
    // `once` 遅延 watcher は発火した側だけ設置を消費する（中央 diff と同じ規約）。
    if (rfH.firedOnceDelayed) h = consumeOnceDelayedTriggers(h, 'ON_REFRESH');
    if (rfG.firedOnceDelayed) g = consumeOnceDelayedTriggers(g, 'ON_REFRESH');
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
    milledControllerCards?: string[],
    milledOppCards?: string[],
    causeOwnerId?: string,
  ): { entries: StackEntry[]; usedOncePerTurnIds: string[] } =>
    pureCollectMillTriggers(mkTrigCtx(), controllerId, controllerState, otherState, milledFromControllerDeck, milledFromOppDeck, milledControllerCards, milledOppCards, causeOwnerId);

  // ON_CHARM_TO_TRASH トリガー収集（Stage2 で pure 化＝triggerCollect.ts。ここは薄いラッパ）。
  const collectCharmToTrashTriggers = (
    controllerId: string,
    controllerState: PlayerState,
    otherState: PlayerState,
    charmsFromControllerField: number,
    charmsFromOppField: number,
  ): { entries: StackEntry[]; usedOncePerTurnIds: string[] } =>
    pureCollectCharmToTrashTriggers(mkTrigCtx(), controllerId, controllerState, otherState, charmsFromControllerField, charmsFromOppField);

  // ON_MAGIC_BOX_FLIPPED トリガー収集（§6.4 A群・WX24-P4-016。triggerCollect.ts の薄いラッパ）。
  // ⚠実カードの watcher は**付与ストア**から来る＝pure 側が印字＋付与の両方を走査している。
  const collectMagicBoxFlippedTriggers = (
    controllerId: string,
    controllerState: PlayerState,
    otherState: PlayerState,
    flippedOnControllerField: number,
    flippedOnOppField: number,
  ): { entries: StackEntry[]; usedOncePerTurnIds: string[] } =>
    pureCollectMagicBoxFlippedTriggers(mkTrigCtx(), controllerId, controllerState, otherState, flippedOnControllerField, flippedOnOppField);

  // ON_COIN_GAINED トリガー収集（§6.3 J-5。triggerCollect.ts の薄いラッパ）。
  // ⚠獲得枚数は**呼び出し側が実増加を渡す**（グロウは支払いと獲得が同じ差分に同居するため before/after 差では取りこぼす）。
  const collectCoinGainedTriggers = (
    watcherId: string,
    watcherState: PlayerState,
    otherState: PlayerState,
    gainedBySelf: number,
    gainedByOpp: number,
  ): { entries: StackEntry[]; usedOncePerTurnIds: string[] } =>
    pureCollectCoinGainedTriggers(mkTrigCtx(), watcherId, watcherState, otherState, gainedBySelf, gainedByOpp);

  // ON_ACCE_TO_TRASH トリガー収集（§6.3 J-2。triggerCollect.ts の薄いラッパ）。
  const collectAcceToTrashTriggers = (
    controllerId: string,
    controllerState: PlayerState,
    otherState: PlayerState,
    acceFromControllerField: number,
    acceFromOppField: number,
  ): { entries: StackEntry[]; usedOncePerTurnIds: string[] } =>
    pureCollectAcceToTrashTriggers(mkTrigCtx(), controllerId, controllerState, otherState, acceFromControllerField, acceFromOppField);

  // ON_SOUL_ATTACHED / ON_CARD_ATTACHED トリガー収集（§6.3 J-2。triggerCollect.ts の薄いラッパ）。
  const collectAttachedTriggers = (
    controllerId: string,
    controllerState: PlayerState,
    otherState: PlayerState,
    timing: 'ON_SOUL_ATTACHED' | 'ON_CARD_ATTACHED',
    attachedHosts: { hostNum: string; count: number }[],
  ): { entries: StackEntry[]; usedOncePerTurnIds: string[] } =>
    pureCollectAttachedTriggers(mkTrigCtx(), controllerId, controllerState, otherState, timing, attachedHosts);

  // ON_ENERGY_TO_TRASH トリガー収集（Stage2 で pure 化＝triggerCollect.ts。ここは薄いラッパ）。
  const collectEnergyToTrashTriggers = (
    controllerId: string,
    controllerState: PlayerState,
    otherState: PlayerState,
    fromControllerEnergy: number,
    fromOppEnergy: number,
    fromControllerEnergyAny?: number,
    fromOppEnergyAny?: number,
    causeOwnerId?: string,
  ): { entries: StackEntry[]; usedOncePerTurnIds: string[] } =>
    pureCollectEnergyToTrashTriggers(mkTrigCtx(), controllerId, controllerState, otherState, fromControllerEnergy, fromOppEnergy, fromControllerEnergyAny, fromOppEnergyAny, causeOwnerId);

  // ON_SIGNI_CRASHED_LIFE_TOTAL トリガー収集（「このシグニが1ターンに合計N枚以上クラッシュしたとき」）。
  const collectSigniCrashTotalTriggers = (
    controllerId: string,
    controllerState: PlayerState,
    otherState: PlayerState,
    signiNum: string,
    total: number,
  ): { entries: StackEntry[]; usedOncePerTurnIds: string[] } =>
    pureCollectSigniCrashTotalTriggers(mkTrigCtx(), controllerId, controllerState, otherState, signiNum, total);

  // ON_REFRESH トリガー収集（Stage2 で pure 化＝triggerCollect.ts。ここは薄いラッパ）。
  const collectRefreshTriggers = (
    controllerId: string,
    controllerState: PlayerState,
    otherState: PlayerState,
    refreshedByController: number,
    refreshedByOpp: number,
  ): { entries: StackEntry[]; usedOncePerTurnIds: string[]; firedOnceDelayed: boolean } =>
    pureCollectRefreshTriggers(mkTrigCtx(), controllerId, controllerState, otherState, refreshedByController, refreshedByOpp);

  // ON_OPP_POWER_DECREASED トリガー収集（Stage2 で pure 化＝triggerCollect.ts。ここは薄いラッパ）。
  const collectPowerDecreaseTriggers = (
    controllerId: string,
    controllerState: PlayerState,
    otherState: PlayerState,
    decreaseOnOpp: number,
    decreaseSources: string[] = [],
    causeOwnerId?: string,
  ): { entries: StackEntry[]; usedOncePerTurnIds: string[] } =>
    pureCollectPowerDecreaseTriggers(mkTrigCtx(), controllerId, controllerState, otherState, decreaseOnOpp, decreaseSources, causeOwnerId);

  // ON_CARD_MOVED_TO_DECK トリガー収集（Stage2 で pure 化＝triggerCollect.ts。ここは薄いラッパ）。
  const collectMoveToDeckTriggers = (
    controllerId: string,
    controllerState: PlayerState,
    otherState: PlayerState,
    movedToControllerDeck: number,
    movedToControllerDeckFromTrash: number,
    movedToOppDeck: number,
    causeOwnerId?: string,
    movedToControllerDeckFromField = 0,
    movedToOppDeckFromField = 0,
  ): { entries: StackEntry[]; usedOncePerTurnIds: string[] } =>
    pureCollectMoveToDeckTriggers(mkTrigCtx(), controllerId, controllerState, otherState, movedToControllerDeck, movedToControllerDeckFromTrash, movedToOppDeck, causeOwnerId, movedToControllerDeckFromField, movedToOppDeckFromField);

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
      // 🔴「このターンでN回目」台帳（§6.4 O-11）は**収集の前に**積む＝
      //   `fireCondition` は収集時に評価されるので、今回のダウンを含めないと「3回目」が永久に来ない。
      h = recordSigniDownedThisTurn(h, downHost);
      g = recordSigniDownedThisTurn(g, downGuest);
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

  const fieldPlacementOnPlayOpts = (effect?: CardEffect): {
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
    meta: {
      causeOwnerId: string;
      causeSourceCardNum: string;
      fieldTrashCostCards?: string[];
      resonaConditionCardNum?: string;
      collectPlacedSelfOnPlay?: boolean;
      suppressOnPlay?: boolean;
    },
  ): { entries: StackEntry[]; hostState: PlayerState; guestState: PlayerState } => {
    const { causeOwnerId, causeSourceCardNum } = meta;
    const fieldTrashCostCards = new Set(meta.fieldTrashCostCards ?? []);
    const beforeHost = bs.host_state, beforeGuest = bs.guest_state;
    let h = afterHost, g = afterGuest;
    const entries: StackEntry[] = [];
    const useHost  = (used: string[]) => { if (used.length > 0) h = { ...h, actions_done: [...(h.actions_done ?? []), ...used] }; };
    const useGuest = (used: string[]) => { if (used.length > 0) g = { ...g, actions_done: [...(g.actions_done ?? []), ...used] }; };

    // 効果解決で生じた手札捨ての原因 owner を React watcher まで運ぶ。
    // executor は userId を持たないため、entry/pending 由来の causeOwnerId を知る中央 diff で刻む。
    if (detectHandTrashed(beforeHost, h).length > 0 && h.hand_discarded_just?.length) {
      h = { ...h, hand_discarded_just_cause_owner_id: causeOwnerId };
    }
    if (detectHandTrashed(beforeGuest, g).length > 0 && g.hand_discarded_just?.length) {
      g = { ...g, hand_discarded_just_cause_owner_id: causeOwnerId };
    }

    entries.push(...pureCollectLrigFlipTriggers(mkTrigCtx(), beforeHost, h, bs.host_id));
    entries.push(...pureCollectLrigFlipTriggers(mkTrigCtx(), beforeGuest, g, bs.guest_id));

    // ON_BANISH: バニッシュされたシグニ（usageLimit 消費は useHost/useGuest で actions_done へ永続化）
    // ⚠ここは**盤面差分でバニッシュを認識する唯一の funnel**なので、「このターンにシグニがバニッシュ
    //   されている」の履歴（タスク12(xciv) の `WX13-026`＝コスト軽減の条件）も同じ場所で記録する。
    //   ⚠**バニッシュされた側**の state に積む（アーツ使用側から見た「対戦相手のシグニが…」は
    //   相手 state を読む）。同じ差分が複数回評価されても条件は `>= 1` でしか使わないので二重計上は無害。
    const hostBanished = detectBanishedSigni(beforeHost, h);
    for (const cardNum of hostBanished) {
      const bt = collectBanishTriggers(cardNum, bs.host_id, h, g, beforeHost, { ownerId: causeOwnerId, sourceCardNum: causeSourceCardNum });
      entries.push(...bt.entries); useHost(bt.usedHostIds); useGuest(bt.usedGuestIds);
    }
    if (hostBanished.length > 0) h = { ...h, signi_banished_this_turn: (h.signi_banished_this_turn ?? 0) + hostBanished.length };
    // §5.3 O-121: 「このターンに**あなたが**対戦相手のシグニをバニッシュしていた場合」の台帳。
    //   ⚠**バニッシュした側**（causeOwnerId）の state へ積む＝上の `signi_banished_this_turn`（被バニッシュ側の件数）とは別軸。
    //   この funnel は効果解決経路なので `byEffect: true`。バトルバニッシュは別地点（アタック解決）で積む。
    if (hostBanished.length > 0 && causeOwnerId === bs.guest_id) {
      g = { ...g, opp_signi_banished_this_turn: [
        ...(g.opp_signi_banished_this_turn ?? []),
        ...hostBanished.map(() => ({ by: causeSourceCardNum ?? null, byEffect: true })),
      ] };
    }
    const guestBanished = detectBanishedSigni(beforeGuest, g);
    for (const cardNum of guestBanished) {
      const bt = collectBanishTriggers(cardNum, bs.guest_id, h, g, beforeGuest, { ownerId: causeOwnerId, sourceCardNum: causeSourceCardNum });
      entries.push(...bt.entries); useHost(bt.usedHostIds); useGuest(bt.usedGuestIds);
    }
    if (guestBanished.length > 0) g = { ...g, signi_banished_this_turn: (g.signi_banished_this_turn ?? 0) + guestBanished.length };
    // §5.3 O-121: host 側が原因のときは host の台帳へ（上と対称）。
    if (guestBanished.length > 0 && causeOwnerId === bs.host_id) {
      h = { ...h, opp_signi_banished_this_turn: [
        ...(h.opp_signi_banished_this_turn ?? []),
        ...guestBanished.map(() => ({ by: causeSourceCardNum ?? null, byEffect: true })),
      ] };
    }

    // ON_TRASH: スタック/pending 解決内でも fieldTrashCostCards に記録された支払いは byEffectCause=false、
    // それ以外の場→トラッシュは effect 起因。原因owner と所有者が異なれば「対戦相手の効果によって」。
    const hostTrashedByOpp  = causeOwnerId === bs.guest_id;
    const guestTrashedByOpp = causeOwnerId === bs.host_id;
    for (const cardNum of detectTrashedSigni(beforeHost, h)) {
      const tt = collectTrashTriggers(cardNum, bs.host_id, h, g, hostTrashedByOpp, true, !fieldTrashCostCards.has(cardNum), meta.resonaConditionCardNum);
      entries.push(...tt.entries); useHost(tt.usedHostIds); useGuest(tt.usedGuestIds);
    }
    for (const cardNum of detectTrashedSigni(beforeGuest, g)) {
      const tt = collectTrashTriggers(cardNum, bs.guest_id, h, g, guestTrashedByOpp, true, !fieldTrashCostCards.has(cardNum), meta.resonaConditionCardNum);
      entries.push(...tt.entries); useHost(tt.usedHostIds); useGuest(tt.usedGuestIds);
    }
    // デッキ→トラッシュ（ミル）の ON_TRASH（カード自身・triggerScope:self）
    for (const cardNum of detectDeckTrashed(beforeHost, h)) {
      entries.push(...collectDeckTrashSelfTriggers(cardNum, bs.host_id, hostTrashedByOpp, causeSourceCardNum, !!causeOwnerId));
    }
    for (const cardNum of detectDeckTrashed(beforeGuest, g)) {
      entries.push(...collectDeckTrashSelfTriggers(cardNum, bs.guest_id, guestTrashedByOpp, causeSourceCardNum, !!causeOwnerId));
    }
    // 手札→トラッシュ／エナ→トラッシュの ON_TRASH（self・fromZones 指定）。
    // causeSourceCardNum＝原因効果の発生源カード（「あなたの＜X＞のシグニの効果によって捨てられたとき」の判定用）。
    for (const cardNum of detectHandTrashed(beforeHost, h)) {
      entries.push(...collectAnyZoneTrashSelfTriggers(cardNum, bs.host_id, hostTrashedByOpp, 'hand', causeSourceCardNum, !!causeOwnerId, h, g));
    }
    for (const cardNum of detectHandTrashed(beforeGuest, g)) {
      entries.push(...collectAnyZoneTrashSelfTriggers(cardNum, bs.guest_id, guestTrashedByOpp, 'hand', causeSourceCardNum, !!causeOwnerId, g, h));
    }
    for (const cardNum of detectEnergyTrashed(beforeHost, h)) {
      entries.push(...collectAnyZoneTrashSelfTriggers(cardNum, bs.host_id, hostTrashedByOpp, 'energy', causeSourceCardNum, !!causeOwnerId, h, g));
    }
    for (const cardNum of detectEnergyTrashed(beforeGuest, g)) {
      entries.push(...collectAnyZoneTrashSelfTriggers(cardNum, bs.guest_id, guestTrashedByOpp, 'energy', causeSourceCardNum, !!causeOwnerId, g, h));
    }
    for (const cardNum of detectUnderSigniTrashed(beforeHost, h)) {
      entries.push(...collectAnyZoneTrashSelfTriggers(cardNum, bs.host_id, hostTrashedByOpp, 'under_signi', causeSourceCardNum, !!causeOwnerId, h, g));
    }
    for (const cardNum of detectUnderSigniTrashed(beforeGuest, g)) {
      entries.push(...collectAnyZoneTrashSelfTriggers(cardNum, bs.guest_id, guestTrashedByOpp, 'under_signi', causeSourceCardNum, !!causeOwnerId, g, h));
    }

    // §5.3 `O-81`＝裏向きで付けられたカードの回収（公開して持ち主の手札へ）。
    // ⚠**ON_LEAVE_FIELD 収集より前**＝`FACEDOWN_REVEALED_JUST`／`levelEqFacedownRevealed` は収集時に読む。
    // `removeFromField` を通らずに `field` を組み直す経路（コスト支払い等）の取りこぼしをここで拾う。
    h = sweepFacedownAttached(h);
    g = sweepFacedownAttached(g);

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
    // §6.3 J-4: アタックフェイズ中に場を離れたシグニを記録する（`SIGNI_LEFT_FIELD_THIS_ATTACK_PHASE`・WX24-P2-075-E1）。
    // ⚠アタックフェイズ以外では記録しない（フェイズ開始時のリセットと合わせて「そのアタックフェイズの間」を表す）。
    if (['ATTACK_ARTS', 'ATTACK_ARTS_OP', 'ATTACK_SIGNI', 'ATTACK_LRIG'].includes(bs.turn_phase)) {
      const leftHost  = detectLeftFieldSigni(beforeHost, h).map(x => x.cardNum);
      const leftGuest = detectLeftFieldSigni(beforeGuest, g).map(x => x.cardNum);
      if (leftHost.length > 0)  h = { ...h, signi_left_field_this_attack_phase: [...(h.signi_left_field_this_attack_phase ?? []), ...leftHost] };
      if (leftGuest.length > 0) g = { ...g, signi_left_field_this_attack_phase: [...(g.signi_left_field_this_attack_phase ?? []), ...leftGuest] };
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
    const milledHostCards = detectMilledFromDeck(beforeHost, h);
    const milledGuestCards = detectMilledFromDeck(beforeGuest, g);
    if (milledHost > 0 || milledGuest > 0) {
      const mtH = collectMillTriggers(bs.host_id, h, g, milledHost, milledGuest, milledHostCards, milledGuestCards, causeOwnerId);
      entries.push(...mtH.entries); useHost(mtH.usedOncePerTurnIds);
      const mtG = collectMillTriggers(bs.guest_id, g, h, milledGuest, milledHost, milledGuestCards, milledHostCards, causeOwnerId);
      entries.push(...mtG.entries); useGuest(mtG.usedOncePerTurnIds);
      // SELF_DECK_TO_TRASH_THIS_TURN（「このターンにあなたのデッキからカードがN枚以上トラッシュに置かれていた場合」
      // WXDi-P03-065）用のターン累計。⚠**持ち主基準**＝自分のデッキから落ちた枚数を自分の state へ積む
      // （相手効果で落とされた場合も自分のデッキが減っているので数える＝原文に原因限定が無い）。
      if (milledHost > 0)  h = { ...h, deck_to_trash_count_this_turn: (h.deck_to_trash_count_this_turn ?? 0) + milledHost };
      if (milledGuest > 0) g = { ...g, deck_to_trash_count_this_turn: (g.deck_to_trash_count_this_turn ?? 0) + milledGuest };
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

    // ON_MAGIC_BOX_FLIPPED: 効果で【マジックボックス】が表向きになった場合（§6.4 A群・WX24-P4-016-E3）
    const mbFlipHost  = countMagicBoxesFlipped(beforeHost, h);
    const mbFlipGuest = countMagicBoxesFlipped(beforeGuest, g);
    if (mbFlipHost > 0 || mbFlipGuest > 0) {
      const mbH = collectMagicBoxFlippedTriggers(bs.host_id, h, g, mbFlipHost, mbFlipGuest);
      entries.push(...mbH.entries); useHost(mbH.usedOncePerTurnIds);
      const mbG = collectMagicBoxFlippedTriggers(bs.guest_id, g, h, mbFlipGuest, mbFlipHost);
      entries.push(...mbG.entries); useGuest(mbG.usedOncePerTurnIds);
    }

    // ON_COIN_GAINED: 効果解決で《コインアイコン》が増えた場合（§6.3 J-5・SP27-007-E1）。
    // ⚠グロウ／アシストグロウ／CPU グロウの獲得はこの funnel を通らないので各サイトで別途収集する
    //   （既存 ON_COIN_PAID がコスト支払いの全サイトを個別に押さえているのと同じ形）。
    const coinGainHost  = countCoinsGained(beforeHost, h);
    const coinGainGuest = countCoinsGained(beforeGuest, g);
    if (coinGainHost > 0 || coinGainGuest > 0) {
      const cgH = collectCoinGainedTriggers(bs.host_id, h, g, coinGainHost, coinGainGuest);
      entries.push(...cgH.entries); useHost(cgH.usedOncePerTurnIds);
      const cgG = collectCoinGainedTriggers(bs.guest_id, g, h, coinGainGuest, coinGainHost);
      entries.push(...cgG.entries); useGuest(cgG.usedOncePerTurnIds);
    }

    // ON_ACCE_TO_TRASH: 【アクセ】が場→トラッシュに置かれた場合（§6.3 J-2・WXEX2-19-E1）
    const acceHost  = countAcceToTrash(beforeHost, h);
    const acceGuest = countAcceToTrash(beforeGuest, g);
    if (acceHost > 0 || acceGuest > 0) {
      const acH = collectAcceToTrashTriggers(bs.host_id, h, g, acceHost, acceGuest);
      entries.push(...acH.entries); useHost(acH.usedOncePerTurnIds);
      const acG = collectAcceToTrashTriggers(bs.guest_id, g, h, acceGuest, acceHost);
      entries.push(...acG.entries); useGuest(acG.usedOncePerTurnIds);
    }

    // ON_SOUL_ATTACHED / ON_CARD_ATTACHED: 自分の場のシグニに【ソウル】/カードが付いた場合（§6.3 J-2）。
    // 付与先ホストは各プレイヤーの盤面ごとに検出する＝そのプレイヤーの場の【自】だけが反応する。
    for (const [pid, before, after, otherAfter] of [
      [bs.host_id, beforeHost, h, g] as const,
      [bs.guest_id, beforeGuest, g, h] as const,
    ]) {
      const use = pid === bs.host_id ? useHost : useGuest;
      const souls = detectSoulAttached(before, after).map(x => ({ hostNum: x.hostNum, count: 1 }));
      if (souls.length > 0) {
        const r = collectAttachedTriggers(pid, after, otherAfter, 'ON_SOUL_ATTACHED', souls);
        entries.push(...r.entries); use(r.usedOncePerTurnIds);
      }
      const attached = detectCardAttached(before, after).map(x => ({ hostNum: x.hostNum, count: x.count }));
      if (attached.length > 0) {
        const r = collectAttachedTriggers(pid, after, otherAfter, 'ON_CARD_ATTACHED', attached);
        entries.push(...r.entries); use(r.usedOncePerTurnIds);
      }
    }

    // ON_ENERGY_TO_TRASH: エナゾーン→トラッシュが起きた場合。
    // ⚠あわせて「エナゾーンから出て行った枚数（行き先を問わない）」も渡す＝`energyLeftToAnyZone` を持つ効果
    //   （WXDi-P06-038-E1「他の領域に移動したとき」）は手札/場/デッキ行きでも発火する。ここは効果解決の
    //   中央 diff なので「効果によって」の限定は構造的に満たされる（コスト支払いはこの関数を通らない）。
    const energyTrashHost  = countEnergyToTrash(beforeHost, h);
    const energyTrashGuest = countEnergyToTrash(beforeGuest, g);
    const energyLeftHost   = countEnergyLeftZone(beforeHost, h);
    const energyLeftGuest  = countEnergyLeftZone(beforeGuest, g);
    if (energyTrashHost > 0 || energyTrashGuest > 0 || energyLeftHost > 0 || energyLeftGuest > 0) {
      const etH = collectEnergyToTrashTriggers(bs.host_id, h, g, energyTrashHost, energyTrashGuest, energyLeftHost, energyLeftGuest, causeOwnerId);
      entries.push(...etH.entries); useHost(etH.usedOncePerTurnIds);
      const etG = collectEnergyToTrashTriggers(bs.guest_id, g, h, energyTrashGuest, energyTrashHost, energyLeftGuest, energyLeftHost, causeOwnerId);
      entries.push(...etG.entries); useGuest(etG.usedOncePerTurnIds);
    }

    // ON_HAND_OR_ENERGY_LOST_BY_OPP: 「対戦相手の効果1つによって、あなたの手札が捨てられるか
    // あなたのエナゾーンからカードがトラッシュに置かれたとき」（WXDi-P13-051-E3）。
    // ⚠**2経路を1回の走査でまとめて見る**のが要点＝原文の「効果1つによって」は、1解決で両方起きても
    //   発火は1度だけ、という意味。手札捨てだけ React watcher（ON_HAND_DISCARDED）に任せると、
    //   同じ解決で2回積まれる（両方やる相手効果は実在＝WXK02-004／WXDi-P10-003／WXDi-P13-003A）。
    // 原因（対戦相手の効果か）は causeOwnerId で判定する。コスト支払いはこの関数を通らない。
    {
      const handLostHost = detectHandTrashed(beforeHost, h).length;
      const handLostGuest = detectHandTrashed(beforeGuest, g).length;
      if (handLostHost > 0 || handLostGuest > 0 || energyTrashHost > 0 || energyTrashGuest > 0) {
        const rlH = pureCollectOppResourceLossTriggers(
          mkTrigCtx(), bs.host_id, h, g, handLostHost, energyTrashHost, causeOwnerId === bs.guest_id);
        entries.push(...rlH.entries); useHost(rlH.usedOncePerTurnIds);
        const rlG = pureCollectOppResourceLossTriggers(
          mkTrigCtx(), bs.guest_id, g, h, handLostGuest, energyTrashGuest, causeOwnerId === bs.host_id);
        entries.push(...rlG.entries); useGuest(rlG.usedOncePerTurnIds);
      }
    }

    // ON_SIGNI_CRASHED_LIFE_TOTAL: 効果によるライフクラッシュ（execLifeCrash が主体別カウンタへ加算）で
    // 合計が閾値に達したシグニを収集する。攻撃によるクラッシュは攻撃解決側で同じ collector を呼ぶ
    // （経路が別＝アタックはこの中央 diff を通らない）。増えたキーだけを見るので既存効果に波及しない。
    for (const side of ['host', 'guest'] as const) {
      const isHostSide = side === 'host';
      const before = isHostSide ? beforeHost : beforeGuest;
      const beforeMap = before.life_crashed_by_signi_this_turn ?? {};
      // 走査のたびに最新の h/g を読む（useHost/useGuest が actions_done を積むため）。
      for (const [signiNum, total] of Object.entries((isHostSide ? h : g).life_crashed_by_signi_this_turn ?? {})) {
        if (total <= (beforeMap[signiNum] ?? 0)) continue;
        const ct = pureCollectSigniCrashTotalTriggers(
          mkTrigCtx(), isHostSide ? bs.host_id : bs.guest_id,
          isHostSide ? h : g, isHostSide ? g : h, signiNum, total,
        );
        entries.push(...ct.entries);
        if (isHostSide) useHost(ct.usedOncePerTurnIds); else useGuest(ct.usedOncePerTurnIds);
      }
    }

    // ON_REFRESH: いずれかのプレイヤーがリフレッシュした場合
    const refreshHost  = countRefresh(beforeHost, h);
    const refreshGuest = countRefresh(beforeGuest, g);
    if (refreshHost > 0 || refreshGuest > 0) {
      const rfH = collectRefreshTriggers(bs.host_id, h, g, refreshHost, refreshGuest);
      entries.push(...rfH.entries); useHost(rfH.usedOncePerTurnIds);
      const rfG = collectRefreshTriggers(bs.guest_id, g, h, refreshGuest, refreshHost);
      entries.push(...rfG.entries); useGuest(rfG.usedOncePerTurnIds);
      // 🆕`once` 遅延 watcher（「このターン**最初の**リフレッシュ」）は発火した側だけ設置を消費する
      //   （§5.3 2026-08-27 Sheet1 B11・`WX09-Re06`）。消費しないと同ターン2回目以降も発火する。
      if (rfH.firedOnceDelayed) h = consumeOnceDelayedTriggers(h, 'ON_REFRESH');
      if (rfG.firedOnceDelayed) g = consumeOnceDelayedTriggers(g, 'ON_REFRESH');
    }

    // ON_OPP_POWER_DECREASED（毒牙）: シグニのパワーが減った場合、減らした側（controller）が反応
    const decOnHost  = detectPowerDecrease(beforeHost, h);
    const decOnGuest = detectPowerDecrease(beforeGuest, g);
    if (decOnHost > 0 || decOnGuest > 0) {
      // 発生源限定（「あなたの＜X＞のシグニの効果によって」）判定用に、減少を起こした効果元カードも渡す。
      // 🆕§6.4 O-44＝**srcCardNum が刻まれない経路（POWER_MODIFY_PER_* / STUB 系）は
      //   `causeSourceCardNum`（いま解決中の効果の発生源カード）へ寄せる**。減少はその効果の解決中に
      //   起きているので発生源はそのカード。コレクタ側は fail-closed（不明なら発火しない）。
      const decSrcOnHost  = detectPowerDecreaseSources(beforeHost, h, causeSourceCardNum);
      const decSrcOnGuest = detectPowerDecreaseSources(beforeGuest, g, causeSourceCardNum);
      const dpH = collectPowerDecreaseTriggers(bs.host_id, h, g, decOnGuest, decSrcOnGuest, causeOwnerId);
      entries.push(...dpH.entries); useHost(dpH.usedOncePerTurnIds);
      const dpG = collectPowerDecreaseTriggers(bs.guest_id, g, h, decOnHost, decSrcOnHost, causeOwnerId);
      entries.push(...dpG.entries); useGuest(dpG.usedOncePerTurnIds);
    }

    // ON_CARD_MOVED_TO_DECK: 他領域→デッキ移動が起きた場合
    const movedHost = countMovedToDeck(beforeHost, h, false);
    const movedGuest = countMovedToDeck(beforeGuest, g, false);
    const movedHostFromTrash = countMovedToDeck(beforeHost, h, true);
    const movedGuestFromTrash = countMovedToDeck(beforeGuest, g, true);
    // §5.3 `O-116`＝**場から**デッキへ戻った枚数（`WX05-019-E3` の由来限定）。
    const movedHostFromField = countMovedToDeckFromField(beforeHost, h);
    const movedGuestFromField = countMovedToDeckFromField(beforeGuest, g);
    if (movedHost > 0 || movedGuest > 0) {
      const mvH = collectMoveToDeckTriggers(bs.host_id, h, g, movedHost, movedHostFromTrash, movedGuest, causeOwnerId, movedHostFromField, movedGuestFromField);
      entries.push(...mvH.entries); useHost(mvH.usedOncePerTurnIds);
      const mvG = collectMoveToDeckTriggers(bs.guest_id, g, h, movedGuest, movedGuestFromTrash, movedHost, causeOwnerId, movedGuestFromField, movedHostFromField);
      entries.push(...mvG.entries); useGuest(mvG.usedOncePerTurnIds);
      // OPP_CARDS_MOVED_TO_DECK_THIS_TURN: 「対戦相手のカードがあなたの効果によってデッキに移動」の累計（WXK06-071）。
      // 効果オーナー（causeOwnerId）＝アクティブプレイヤーの counter に、相手のカードが移動した枚数を積む。
      // ルール処理/バトル（causeOwnerId=undefined）は「あなたの効果」ではないので数えない。
      if (causeOwnerId === bs.host_id && movedGuest > 0) {
        h = { ...h, opp_cards_moved_to_deck_this_turn: (h.opp_cards_moved_to_deck_this_turn ?? 0) + movedGuest };
      } else if (causeOwnerId === bs.guest_id && movedHost > 0) {
        g = { ...g, opp_cards_moved_to_deck_this_turn: (g.opp_cards_moved_to_deck_this_turn ?? 0) + movedHost };
      }
    }

    // ON_ZONE_MOVED の原因主体限定付き watcher は、この解決の causeOwnerId が残っている中央 diff で収集する。
    // 後段の zone_moved_just watcher は原因限定なしだけを処理してフラグをクリアする。
    for (const movedNum of (h.zone_moved_just ?? []).filter(n => !(beforeHost.zone_moved_just ?? []).includes(n))) {
      const zm = pureCollectZoneMovedTriggers(mkTrigCtx(), movedNum, h, g, bs.host_id, bs.guest_id, causeOwnerId, true);
      entries.push(...zm.entries);
      if (zm.moverUsedIds.length > 0) h = { ...h, actions_done: [...(h.actions_done ?? []), ...zm.moverUsedIds] };
      if (zm.otherUsedIds.length > 0) g = { ...g, actions_done: [...(g.actions_done ?? []), ...zm.otherUsedIds] };
    }
    for (const movedNum of (g.zone_moved_just ?? []).filter(n => !(beforeGuest.zone_moved_just ?? []).includes(n))) {
      const zm = pureCollectZoneMovedTriggers(mkTrigCtx(), movedNum, g, h, bs.guest_id, bs.host_id, causeOwnerId, true);
      entries.push(...zm.entries);
      if (zm.moverUsedIds.length > 0) g = { ...g, actions_done: [...(g.actions_done ?? []), ...zm.moverUsedIds] };
      if (zm.otherUsedIds.length > 0) h = { ...h, actions_done: [...(h.actions_done ?? []), ...zm.otherUsedIds] };
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
    // ON_TRASH_CARD_ADDED: 効果によってトラッシュにカードが置かれた場合（§6.4 O-37(c)・WX24-P3-007 の付与【自】）。
    // ⚠**移動元を問わない**＝ON_CARD_MILLED_FROM_DECK（デッキ限定）とは別軸で、同じ解決で両方発火しうる。
    //   「対戦相手の効果1つによって」は causeOwnerId で判定する（コスト支払いはこの中央 diff を通らない）。
    const trashAddedHost = detectTrashAdded(beforeHost, h);
    const trashAddedGuest = detectTrashAdded(beforeGuest, g);
    if (trashAddedHost.length > 0 || trashAddedGuest.length > 0) {
      const ta = pureCollectTrashAddedTriggers(mkTrigCtx(), [
        { ownerId: bs.host_id, nums: trashAddedHost },
        { ownerId: bs.guest_id, nums: trashAddedGuest },
      ], causeOwnerId, h, g);
      entries.push(...ta.entries); useHost(ta.usedHostIds); useGuest(ta.usedGuestIds);
    }
    // ON_ENERGY_CHARGE movedSelf: エナへ移動したカード自身の AUTO。場 watcher とは movedSelf で排他的。
    const energyAddedSelfHost = detectEnergyAddedWithSource(beforeHost, h);
    const energyAddedSelfGuest = detectEnergyAddedWithSource(beforeGuest, g);
    if (energyAddedSelfHost.length > 0 || energyAddedSelfGuest.length > 0) {
      const eaSelf = pureCollectEnergyAddedSelfTriggers(mkTrigCtx(), [
        { ownerId: bs.host_id, moved: energyAddedSelfHost },
        { ownerId: bs.guest_id, moved: energyAddedSelfGuest },
      ], causeOwnerId, causeSourceCardNum, h, g);
      entries.push(...eaSelf.entries); useHost(eaSelf.usedHostIds); useGuest(eaSelf.usedGuestIds);
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

    // ON_LIFE_CLOTH_MOVED: 宛先付き離脱。クラッシュ直後は life→field.check のため to:'other'。
    // check→energy/trash の解決時は life 差分が無く、クラッシュ専用枝は ON_LIFE_CRASHED が収集する。
    const lifeMovedHost = detectLifeClothMoved(beforeHost, h);
    const lifeMovedGuest = detectLifeClothMoved(beforeGuest, g);
    if (lifeMovedHost.length > 0 || lifeMovedGuest.length > 0) {
      const lm = pureCollectLifeClothMovedTriggers(mkTrigCtx(), [
        { ownerId: bs.host_id, moved: lifeMovedHost, beforeCount: beforeHost.life_cloth.length, afterCount: h.life_cloth.length },
        { ownerId: bs.guest_id, moved: lifeMovedGuest, beforeCount: beforeGuest.life_cloth.length, afterCount: g.life_cloth.length },
      ], h, g);
      entries.push(...lm.entries); useHost(lm.usedHostIds); useGuest(lm.usedGuestIds);
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

    // ON_PLAY（自身＋any_ally/any・効果配置）＋ON_BLOOM。自身【出】は呼び出し側の明示 opt-in 時だけ収集するため、
    // 同じ diff を通る通常召喚の支払い差分では二重発火しない。
    // 場出しした効果元（causeSourceCardNum）がシグニかで bySigniEffect 発火可否を判定。開花は「場に出た」扱いでないため ON_PLAY 除外。
    const placeSourceIsSigni = battleCardMap.get(causeSourceCardNum)?.Type === 'シグニ';
    const hostBloomedSE  = detectBloomedSigni(beforeHost, h);
    const guestBloomedSE = detectBloomedSigni(beforeGuest, g);
    // 裏向き→表向き（WXDi-P10-034）も開花と同じく「場に出た」扱いではないため ON_PLAY から除外する。
    const bloomedSetSE = new Set<string>([...hostBloomedSE, ...guestBloomedSE,
      ...detectFacedownFlipped(beforeHost, h), ...detectFacedownFlipped(beforeGuest, g)]);
    for (const placedNum of detectPlacedSigni(beforeHost, h)) {
      if (bloomedSetSE.has(placedNum)) continue;
      const placedFromZone = detectPlacedFromZone(beforeHost, placedNum, h);
      if (meta.collectPlacedSelfOnPlay) {
        const self = pureCollectPlacedSelfOnPlayTriggers(mkTrigCtx(), placedNum, h, g, bs.host_id, {
          placedByEffect: true,
          sourceIsSigni: placeSourceIsSigni,
          suppressOnPlay: meta.suppressOnPlay,
          placedFromZone,
        });
        entries.push(...self.entries); useHost(self.usedHostIds); useGuest(self.usedGuestIds);
      }
      const ft = collectFieldTriggers('ON_PLAY', placedNum, h, g, bs.host_id, { placedByEffect: true, placeSourceIsSigni, placedFromZone });
      entries.push(...ft.entries); useHost(ft.usedHostIds); useGuest(ft.usedGuestIds);
    }
    for (const placedNum of detectPlacedSigni(beforeGuest, g)) {
      if (bloomedSetSE.has(placedNum)) continue;
      const placedFromZone = detectPlacedFromZone(beforeGuest, placedNum, g);
      if (meta.collectPlacedSelfOnPlay) {
        const self = pureCollectPlacedSelfOnPlayTriggers(mkTrigCtx(), placedNum, g, h, bs.guest_id, {
          placedByEffect: true,
          sourceIsSigni: placeSourceIsSigni,
          suppressOnPlay: meta.suppressOnPlay,
          placedFromZone,
        });
        entries.push(...self.entries); useHost(self.usedHostIds); useGuest(self.usedGuestIds);
      }
      const ft = collectFieldTriggers('ON_PLAY', placedNum, g, h, bs.guest_id, { placedByEffect: true, placeSourceIsSigni, placedFromZone });
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
      // パッチは型付きローカルへ積み、最後に `ADVANCE_TURN_WITH_STATE`（END フェイズ＝次ターン開始は
      // `BEGIN_NEXT_TURN`）の payload として渡す。旧実装は `update: Partial<BattleStateRow>` を
      // 直接積み増し、`update[opKey]` を読み戻し・`update.effect_stack` を土台に push・
      // `update.turn_phase` を読んで分岐していた（＝パッチが可変アキュムレータだった）。
      /** 遷移先フェイズ。END 分岐以外は必ず設定される（END 分岐は自前で commit して return する）。 */
      let nextPhase: BattleStateRow['turn_phase'] | undefined;
      /** 併記する相手状態（未書き込み＝undefined）。書き込み先キーは常に `isHost ? 'guest_state' : 'host_state'`。 */
      let oppWrite: { key: PlayerStateKey; state: PlayerState } | undefined;
      /** 併記する effect_stack（未書き込み＝undefined＝触らない）。 */
      let phaseStack: EffectStack | undefined;

      if (phase === 'UP') {
        // アップフェイズ開始時にすでにアップ済み（ENDフェイズで処理）。ドローして次へ。
        const drawBlocked = my.blocked_actions?.includes('DRAW') ?? false;
        // draw_limit: ターン内フラグ or 相手CONT LIMIT_OPP_DRAW_COUNT 効果の小さい方
        const contDrawLimit = collectDrawLimits(op, effectsMap, battleCardMap, true, my);
        // 🔴CONTINUOUS `BLOCK_ACTION{DRAW_LIMIT_<n>}`（`WX04-005-E2`）も上限として合流させる
        //   （2026-08-19 続き567・§3 (cxxxv) と同じ「生成されるのに誰も読んでいない id」クラスだった）。
        const blockDrawLimit = drawPhaseLimitFromBlocked(contBlocked.forSelf);
        const effectiveDrawLimit = [my.draw_limit, contDrawLimit, blockDrawLimit]
          .filter((n): n is number => n !== undefined)
          .reduce<number | undefined>((min, n) => (min === undefined ? n : Math.min(min, n)), undefined);
        const replacedDrawCount = applyLrigDrawPhaseReplacement(my, drawCount);
        const effectiveDrawCount = effectiveDrawLimit !== undefined ? Math.min(replacedDrawCount, effectiveDrawLimit) : replacedDrawCount;
        const preventRefreshTrash = my.field.signi.some(s => {
          const top = s?.at(-1);
          return top && (effectsMap.get(top) ?? []).some(e =>
            e.effectType === 'CONTINUOUS' &&
            (e.action as import('../types/effects').StubAction).type === 'STUB' &&
            (e.action as import('../types/effects').StubAction).id === 'PREVENT_LIFE_REFRESH_TRASH',
          );
        });
        // ターン開始時スコープを一括切替（リフレッシュ回数・出自履歴・次ターン無料グロウ予約）。
        const turnStartState = activateTurnStartScopedState(my);
        newMyState = drawBlocked
          ? { ...turnStartState, actions_done: [], draw_limit: undefined }
          // ドローフェイズの通常ドローは「効果ドロー」ではないため last_effect_draw_source をクリアし、
          // 直後の collectDrawTriggers で drawBySourceStory トリガー（WX20-026-E3）が前ターンの残値で誤発火しないようにする。
          : { ...drawCards(turnStartState, effectiveDrawCount, preventRefreshTrash), actions_done: ['DRAW'], draw_limit: undefined, last_effect_draw_source: undefined };
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
        nextPhase = 'DRAW';

        // ON_TURN_START トリガー収集（ドローと同時にスタック積み）。
        // ドローした場合は ON_DRAW（G089「カードを引いたとき」）も併せて収集する。
        const startRes = collectTurnTriggers('ON_TURN_START', newMyState, op);
        const startEntries = startRes.entries;
        if (startRes.usedMyIds.length > 0) {
          newMyState = { ...newMyState, actions_done: [...(newMyState.actions_done ?? []), ...startRes.usedMyIds] };
        }
        if (startRes.usedOpIds.length > 0) {
          const opKey = isHost ? 'guest_state' : 'host_state';
          const opBase = oppWrite?.state ?? op;
          oppWrite = { key: opKey, state: { ...opBase, actions_done: [...(opBase.actions_done ?? []), ...startRes.usedOpIds] } };
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
          phaseStack = existingStack
            ? pushToStack(existingStack, startEntries)
            : initStack(turnPlayerId, startEntries);
        }
      } else if (phase === 'MAIN' && bs.turn_count === 1) {
        nextPhase = 'END';
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
            const oppUsedEnd = endRes.usedOpIds.length > 0
              ? {
                  key: isHost ? ('guest_state' as const) : ('host_state' as const),
                  state: { ...op, actions_done: [...(op.actions_done ?? []), ...endRes.usedOpIds] },
                }
              : undefined;
            const turnPlayerId = bs.active_user_id ?? user.id;
            const existingStack = bs.effect_stack ?? null;
            const stack = existingStack
              ? pushToStack(existingStack, endEntries)
              : initStack(turnPlayerId, endEntries);
            await persist.commit(reduceBattle(bs, {
              type: 'WRITE_STATE', myKey: stateKey, myState: markedMyState, effectStack: stack, opp: oppUsedEnd,
            }));
            return; // エフェクト解決後に自動で再度ターン終了処理を行う
          }
        }

        // 「この方法で裏向きにしたシグニ」のターン終了時復帰は、ターンプレイヤー／非ターンプレイヤーの
        // 両方を解決する。相手シグニを裏向きにする効果では予約が op 側に載るため、my 側だけでは永久に残る。
        const facedownMyEND = resolveTurnEndFacedownReturns(my);
        const facedownOpEND = resolveTurnEndFacedownReturns(op);
        const myEndState = facedownMyEND.state;
        const opEndState = facedownOpEND.state;
        // 手札上限調整で発火した ON_TRASH を解決して END に戻った場合、①の予約型効果は適用済み。
        // 既存マーカーを読み、永続フラグ（game_turn_end_trash_to_hand 等）の二重適用を防ぐ。
        const turnEndEffectsAlreadyResolved = !!my.end_turn_effects_resolved;
        const logFacedownEND = (who: string, flipped: string[], trashed: string[]) => {
          if (flipped.length > 0) appendBattleLogs([`ターン終了時：${who}${flipped.map(n => battleCardMap.get(getCardNum(n))?.CardName ?? n).join('・')}を表向きにする`]);
          if (trashed.length > 0) appendBattleLogs([`ターン終了時：${who}${trashed.map(n => battleCardMap.get(getCardNum(n))?.CardName ?? n).join('・')}をトラッシュへ`]);
        };
        logFacedownEND('', facedownMyEND.flipped, facedownMyEND.trashed);
        logFacedownEND('相手の', facedownOpEND.flipped, facedownOpEND.trashed);

        // ENDフェーズ：ビートゾーン全カードをトラッシュへ（手札上限処理と同タイミング）
        let myBeatEND = myEndState.field.beat_zone ?? [];
        let myTrashBeat = myEndState.trash;
        if (myBeatEND.length > 0) {
          myTrashBeat = [...myEndState.trash, ...myBeatEND];
          appendBattleLogs([`ビートゾーン（${myBeatEND.length}枚）をトラッシュへ`]);
          myBeatEND = [];
        }

        // ENDフェーズ①：「ターン終了時に」と書かれた効果をすべて解決する。
        // 公式ルール：エンドフェイズは ①「ターン終了時に」効果 → ②手札上限調整(6枚) → ③ターン終了 の順。
        // 手札を増やす効果（ドロー／トラッシュ→手札）も②より前に解決する必要があるため、ここで一括処理する。
        // ※標準の timing:ON_TURN_END 効果は上の collectTurnTriggers でスタック解決済み（同じく②より前）。
        let myHandEND = myEndState.hand;
        let myDeckPreLimit = myEndState.deck;
        let myFieldAfterCoinCheck = { ...myEndState.field, beat_zone: myBeatEND };
        let myTrashAfterCoinCheck = myTrashBeat;
        let myExcludedEND = myEndState.excluded;
        let myEnergyEND = myEndState.energy;
        if (!turnEndEffectsAlreadyResolved && (my.turn_end_mill_count ?? 0) > 0) {
          const resolved = resolveTurnEndPreventionMill({ ...my, deck: myDeckPreLimit, trash: myTrashAfterCoinCheck });
          myDeckPreLimit = resolved.state.deck;
          myTrashAfterCoinCheck = resolved.state.trash;
          appendBattleLogs([`ターン終了時：デウスシールドの能力でデッキの上から${resolved.milled.length}枚をトラッシュへ`]);
        }
        // DRAW_AT_TURN_END: このターン終了時に引く（このシグニが場を離れていても引く）
        if (!turnEndEffectsAlreadyResolved && (my.turn_end_draw_count ?? 0) > 0) {
          const nDrawEND = my.turn_end_draw_count!;
          const drawnEND = myDeckPreLimit.slice(0, nDrawEND);
          myDeckPreLimit = myDeckPreLimit.slice(nDrawEND);
          myHandEND = [...myHandEND, ...drawnEND];
          appendBattleLogs([`ターン終了時：カードを${drawnEND.length}枚引く`]);
        }
        // COIN_SPEND_CONDITION: ターン終了時にコイン消費チェック
        if (!turnEndEffectsAlreadyResolved && (my.coin_condition_signi_instances ?? []).length > 0) {
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
        let myLrigDeckReturned: string[] = [];
        // turn_end_field_trash_targets: ターン終了時にフィールドのシグニをトラッシュへ（TRASH_AT_TURN_END）
        if (!turnEndEffectsAlreadyResolved && (my.turn_end_field_trash_targets ?? []).length > 0) {
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
        // turn_end_energy_trash_targets: ターン終了時にエナゾーンからトラッシュへ（TRASH_ENERGY_AT_TURN_END）
        if (!turnEndEffectsAlreadyResolved) {
          const et = resolveTurnEndEnergyTrash({ ...my, energy: myEnergyEND, trash: myTrashAfterCoinCheck });
          if (et.trashed.length > 0) {
            myEnergyEND = et.state.energy;
            myTrashAfterCoinCheck = et.state.trash;
            appendBattleLogs([`ターン終了時：${et.trashed.map(n => battleCardMap.get(getCardNum(n))?.CardName ?? n).join('・')}をエナゾーンからトラッシュへ`]);
          }
        }
        // turn_end_return_to_lrig_deck: 一時レゾナをルリグデッキへ戻す（§6.4 funnel＝2経路で同じ関数を通す）
        if (!turnEndEffectsAlreadyResolved) {
          const ret = resolveTurnEndLrigDeckReturn({ ...my, field: myFieldAfterCoinCheck });
          if (ret.returned.length > 0) {
            myFieldAfterCoinCheck = { ...myFieldAfterCoinCheck, signi: ret.state.field.signi };
            myLrigDeckReturned = ret.returned;
            appendBattleLogs([`ターン終了時：${ret.returned.map(n => battleCardMap.get(getCardNum(n))?.CardName ?? n).join('・')}をルリグデッキへ戻す`]);
          }
        }
        // turn_end_return_to_hand: 「ターン終了時、それを場から手札に戻す」（§6.4 O-10 続き509・funnel＝2経路）
        if (!turnEndEffectsAlreadyResolved) {
          const rh = resolveTurnEndHandReturn({ ...my, field: myFieldAfterCoinCheck });
          if (rh.returned.length > 0) {
            myFieldAfterCoinCheck = { ...myFieldAfterCoinCheck, signi: rh.state.field.signi };
            // 🔑**手札上限チェックより前に手札へ入れる**（memory: エンドフェイズは①ターン終了時効果→②手札上限）。
            //   後から足すと上限超過分が捨てられずに残る。
            myHandEND = [...myHandEND, ...rh.returned];
            appendBattleLogs([`ターン終了時：${rh.returned.map(n => battleCardMap.get(getCardNum(n))?.CardName ?? n).join('・')}を手札に戻す`]);
          }
        }
        // game_turn_end_trash_to_hand: ターン終了時、トラッシュから特定クラスシグニを手札へ（GAIN_ABILITY_THIS_GAME）
        if (!turnEndEffectsAlreadyResolved && my.game_turn_end_trash_to_hand) {
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
        if (!turnEndEffectsAlreadyResolved && (my.flip_attack_signi_zones ?? []).length > 0) {
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

        // 遅延自己除外：場に残っていてもターン終了時には除外する。
        const exileAtEnd = resolvePendingExiles({
          ...my, hand: myHandEND, deck: myDeckPreLimit,
          trash: myTrashAfterCoinCheck, field: myFieldAfterCoinCheck,
        }, true);
        myHandEND = exileAtEnd.hand;
        myDeckPreLimit = exileAtEnd.deck;
        myTrashAfterCoinCheck = exileAtEnd.trash;
        myFieldAfterCoinCheck = { ...exileAtEnd.field, beat_zone: exileAtEnd.field.beat_zone ?? [] };
        myExcludedEND = exileAtEnd.excluded;

        // ENDフェーズ②：手札上限チェック（①の「ターン終了時に」効果をすべて適用した後の手札で判定）
        const handLimitEND = myEffectiveHandLimit;
        if (myHandEND.length > handLimitEND) {
          // ①の解決結果を先に永続化してから捨て札選択へ。confirmEndDiscard は解決済み状態を参照し、
          // end_turn_effects_resolved マーカーで効果の二重適用を防ぐ
          // （特に game_turn_end_trash_to_hand は「このゲーム」持続でフラグを消せないため、マーカーで抑止）。
          await persist.commit(reduceBattle(bs, {
            type: 'WRITE_STATE', myKey: stateKey,
            myState: {
              ...myEndState,
              hand: myHandEND, deck: myDeckPreLimit,
              trash: myTrashAfterCoinCheck, field: myFieldAfterCoinCheck,
              ...(myLrigDeckReturned.length > 0
                ? { lrig_deck: [...myEndState.lrig_deck, ...myLrigDeckReturned], turn_end_return_to_lrig_deck: undefined, last_summoned_resonas: undefined }
                : {}),
              excluded: myExcludedEND, pending_exile_nums: undefined,
              energy: myEnergyEND,
              turn_end_draw_count: undefined,
              turn_end_mill_count: undefined,
              coin_condition_signi_instances: undefined,
              turn_end_field_trash_targets: undefined,
              turn_end_energy_trash_targets: undefined,
              flip_attack_signi_zones: undefined,
              end_turn_effects_resolved: true,
            },
            opp: { key: isHost ? 'guest_state' : 'host_state', state: opEndState },
          }));
          openEndDiscard(myHandEND.length - handLimitEND);
          return; // ユーザー選択後に confirmEndDiscard で処理
        }

        // 自分（ターン終了プレイヤー）のターン内一時状態をクリア
        // （ターン終了時に効果＝ドロー/コイン/場トラッシュ/トラッシュ→手札/フリップ復元 は上で解決済み）
        newMyState = clearTurnEndScopedState(clearAttackFieldTrashCosts(clearEndOfTurnDelayedTriggers({
          ...myEndState,
          hand: myHandEND,
          deck: myDeckPreLimit,
          trash: myTrashAfterCoinCheck,
          field: myFieldAfterCoinCheck,
          excluded: myExcludedEND,
          energy: myEnergyEND,
          turn_end_energy_trash_targets: undefined,
          pending_exile_nums: undefined,
          turn_end_draw_count: undefined,
          temp_power_mods:    [],   // UNTIL_END_OF_TURN パワー修正をリセット
          temp_level_mods:    [],   // UNTIL_END_OF_TURN レベル修正をリセット
          keyword_grants:     {},   // ターン内付与キーワードをリセット
          granted_effects:    {},   // ターン内付与能力をリセット
          // blocked_card_names のリセットは clearTurnEndScopedState のレジストリへ集約した（§6.4 O-3 続き498）。
          //   ⚠ここで個別に空へ倒すと `blocked_card_names_next_turn` の昇格結果まで握り潰しうる。
          signi_deploy_count_limit: undefined, // 配置数制限（このターン）をリセット
          actions_done:       [],   // ターン内行動履歴をリセット
          last_effect_draw_source: undefined, // 効果ドローの原因カードをリセット（drawBySourceStory）
          pending_crashed_cards: [],  // ダブルクラッシュ残数をリセット
          pending_crash_source_card_nums: [], crash_source_card_num: undefined, pending_crash_causes: [], crash_cause: undefined,
          prevent_next_damage: undefined,  // ターン内ダメージ無効をリセット
          prevent_next_damage_reservations: undefined,
          turn_end_mill_count: undefined,
          damage_replace_mill: undefined,  // ターン内ダメージ置換（REPLACE_NEXT_DAMAGE_WITH_MILL）をリセット
          life_crash_replacements: undefined, // §6.4 ライフクラッシュ置換の宣言をリセット（このターン限定）
          // 🔴**V-19（2026-08-24）＝ここに `lrig_deck` の戻し入れが無く、一時レゾナが「場から消えるが
          //   ルリグデッキにも戻らない」＝カードが消失していた**（実機で再現）。`myFieldAfterCoinCheck` は
          //   上の `resolveTurnEndLrigDeckReturn` で**レゾナを除いた場**になっているのに、`...myEndState` の
          //   `lrig_deck` は元のまま＝戻り先がどこにも無い状態で永続化されていた。
          //   ⚠**手札上限**超過側（`openEndDiscard` 直前）と `confirmEndDiscard` 側には既に同じ加算がある
          //   ＝**3経路のうちこの1本だけが抜けていた**（「手札が少ないターンだけ消える」型の無言の不整合）。
          ...(myLrigDeckReturned.length > 0 ? { lrig_deck: [...myEndState.lrig_deck, ...myLrigDeckReturned] } : {}),
          turn_end_return_to_lrig_deck: undefined, last_summoned_resonas: undefined, // 一時レゾナ返却の残骸をリセット
          life_burst_double_next: undefined, // ライフバースト2回発動フラグをリセット
          lrig_granted_auto_effects: clearTurnGrantedLrigAbilities(my).lrig_granted_auto_effects, // ターン終了時まで付与されたルリグ能力をクリア（「このゲームの間」付与は残す）
          banish_redirect: undefined,           // バニッシュ先変更フラグをクリア
          banish_redirect_target_nums: undefined, // 選択対象限定のバニッシュ先変更をクリア
          banish_redirect_battle_target_nums: undefined, // 選択対象＋バトル限定のバニッシュ先変更をクリア
          banish_redirect_power0_target_nums: undefined, // 選択対象＋パワー0限定のバニッシュ先変更をクリア
          banish_redirect_by_source_nums: undefined, // 限定付きバニッシュ先変更（このシグニとのバトル）をクリア
          banish_redirect_to_hand: undefined,   // バニッシュ先→手札フラグをクリア
          banish_redirect_to_exile: undefined,  // バニッシュ先→ゲーム除外フラグをクリア
          power0_banish_to_trash: undefined,    // パワー0以下→トラッシュ（このターン）フラグをクリア
          power0_banish_to_trash_opp_only: undefined, // 同・対戦相手限定版（whenPowerZero）をクリア
          double_power_minus_sources: undefined, // パワーマイナス2倍の発生源をクリア（本体フラグは funnel）
          no_grow: undefined,                   // グロウ禁止フラグをリセット
          suppress_life_burst: undefined,       // ライフバースト抑制フラグをリセット
          prevent_lrig_damage: undefined,       // ルリグダメージ無効フラグをリセット
          prevent_defeat: undefined,            // 敗北無効フラグをリセット
          // 宣言数字のリセットは clearTurnEndScopedState のレジストリへ集約（§6.4 O-10 続き512）。
          declared_number: undefined,              // 宣言数字（ガード制限なし版）をリセット
          declared_class: undefined,               // 宣言クラスをリセット
          hand_signi_guard_enabled: undefined,     // 手札シグニガードフラグをリセット
          lrig_limit_mod: undefined,               // ルリグリミット修正をリセット
          prevent_opp_guard: undefined,            // 相手ガード禁止フラグをリセット
          draw_limit: undefined,                   // ドロー上限リセット（次ターン開始時にも解除）
          card_class_overrides: undefined,         // クラスオーバーライドリセット
          signi_color_overrides: undefined,        // シグニ色オーバーライドリセット
          signi_zone_blocks: undefined, // ゾーン配置禁止をリセット。トラッシュ移動ロックは funnel（予約は別フィールド）
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
          negate_opp_attacks: undefined,              // N回目アタック共有カウンタをリセット
          all_cont_effects_negated: undefined,       // CONTINUOUS効果無効化フラグをリセット
          // lrig_abilities_disabled のリセットは clearTurnEndScopedState のレジストリへ集約（§6.4 O-10 続き509）。
          turn_hand_discarded_count: undefined,      // このターンの手札捨て枚数をリセット
          turn_signi_returned_to_hand: undefined,    // このターンのシグニ手札戻りフラグをリセット（G087）
          turn_arts_used: undefined, turn_arts_used_names: undefined, turn_arts_used_colors: undefined, // アーツ使用履歴をリセット
          banish_to_trash_by_self: undefined,        // バニッシュ→トラッシュ誘導フラグをリセット
          negate_coin_abilities: undefined,          // コイン能力無効化フラグをリセット
          coin_condition_signi_instances: undefined,  // コイン消費条件シグニをリセット
          deck_signi_level_override: undefined,       // デッキシグニレベルオーバーライドをリセット
          reduce_next_on_play_cost: undefined,        // 【出】コスト軽減フラグをリセット
          optional_discard_guard_enabled: undefined,  // 任意捨てガードフラグをリセット
          flip_attack_signi_zones: undefined,         // フリップアタックゾーンをリセット
          turn_end_field_trash_targets: undefined,    // ターン終了時トラッシュ対象をリセット
          next_spell_uncounterable: undefined,        // WX04-008: 次スペル打ち消し不可フラグをリセット
          next_spell_cost_reduction: undefined,       // WX04-008: 次スペルコスト軽減をリセット
          next_arts_cost_reduction: undefined,        // タスク12(xciii): 【チェイン】の次アーツコスト軽減をリセット
          turn_trigger_3rd_plant_down: undefined,     // 植物3回目ダウントリガーをリセット
          turn_plant_down_count: undefined,           // 植物ダウン回数をリセット
          // WX25-CP1-003「次の対戦相手のターン終了時まで」: フラグ保持者(=相手の効果を受けた側)が
          // 自分のターンを終了するタイミングがちょうど期限にあたる
          opp_signi_energy_to_deck_bottom: undefined,
          is_betting_this_effect: undefined,          // BET_CONDITION: ターン終了時にクリア
          is_boosting_this_effect: undefined,         // BOOST: ターン終了時の安全クリア
          last_discarded_signi_power: undefined,      // DISCARD_BY_POWER_MATCH: ターン終了時にクリア
          last_discarded_signi_level: undefined,      // levelLteDiscardSigni: ターン終了時にクリア
          cancel_current_signi_attack: undefined,     // NEGATE_ATTACK_ON_TRIGGER: ターン終了時にクリア
        })));
        // 次のターンプレイヤー（相手）のカードをアップフェイズ開始時点でアップ処理する。
        // 凍結中はアップせず凍結を解除。それ以外のダウンカードはアップ。
        const opKey = isHost ? 'guest_state' : 'host_state';
        // 遅延自己除外は非ターンプレイヤー側にも適用（WX16-040/WD22-035-G 等は相手ターン中に蘇生
        // →そのターン終了時に除外、が主用途。ターンプレイヤー側だけだと1ターン生き延びる）。
        const opState = resolvePendingExiles(opEndState, true);
        const curSigniDown   = opState.field.signi_down   ?? [false, false, false];
        const curSigniFrozen = opState.field.signi_frozen  ?? [false, false, false];
        const curLrigFrozen  = opState.field.lrig_frozen   ?? false;
        const curAssistLFrozen = opState.field.assist_lrig_l_frozen ?? false;
        const curAssistRFrozen = opState.field.assist_lrig_r_frozen ?? false;
        const newSigniDown = curSigniDown.map((down, i) => down && curSigniFrozen[i]) as boolean[];
        // ':NEXT_TURN' サフィックスのブロックを次のターン用に変換（サフィックス除去して残す）
        // UPKEEP_OR_NO_UP: 条件あり→次ターンのUPフェーズで条件未達としてルリグをアップしない
        const upkeepLrigDown = ((opState.field.lrig_down ?? false) && curLrigFrozen)
          || (opState.lrig_upkeep_condition !== undefined);
        if (opState.lrig_upkeep_condition) appendBattleLogs([`相手のセンタールリグはアップ条件あり（${opState.lrig_upkeep_condition}）`]);
        // §6.4 O-3: 「ターンプレイヤーを交代するか」は `resolveTurnHandover` 1点で決める
        // （追加ターン＝`extra_turn` と 次ターンスキップ＝`skip_next_turn` の両方をここで見る）。
        const handover = resolveTurnHandover(my, opState);
        const opNextTurnState = handover.consumeOpponent(clearEndOfTurnDelayedTriggers(activateNextTurnSigniZoneBlocks(activateNextTurnDeployCountLimit(clearTurnEndScopedState({
          ...clearUntilOppTurnEffects(clearAllZoneBurstGrantUntilOppTurn(opState)),
          signi_played_from_trash: undefined, signi_played_from_deck: undefined, signi_placed_by_source: undefined, // 出自マーカー本体はUP開始時の funnel でクリア
          negate_coin_abilities: undefined, // NEGATE_COIN_ABILITY: このターン限定→ターン終了時にクリア
          life_crash_counter: undefined, // カウンタークラッシュ（防御側がセット）をターン終了時にクリア
          turn_arts_used: undefined, turn_arts_used_names: undefined, turn_arts_used_colors: undefined, // アーツ使用履歴をリセット
          signi_deploy_count_limit: undefined,       // 配置数制限（このターン・相手にかけられた分）を自分のターン開始時にリセット
          banish_redirect_power0_target_nums: undefined, // 非ターンプレイヤーがこのターン中に設定した単体power0置換もクリア
          banish_redirect_battle_target_nums: undefined,
          field: {
            ...opState.field,
            signi_down:   newSigniDown,
            signi_frozen: [false, false, false],
            lrig_down:    upkeepLrigDown,
            lrig_frozen:  false,
            assist_lrig_l_down: (opState.field.assist_lrig_l_down ?? false) && curAssistLFrozen,
            assist_lrig_r_down: (opState.field.assist_lrig_r_down ?? false) && curAssistRFrozen,
            assist_lrig_l_frozen: false,
            assist_lrig_r_frozen: false,
          },
        }), !handover.keepTurn).state, !handover.keepTurn)));
        // ターンプレイヤーを交代しない場合（追加ターン／相手のターンスキップ）は
        // `activeUserId` を渡さず `active_user_id` キー自体を書かない。
        if (handover.keepTurn) {
          newMyState = activateNextTurnSigniZoneBlocks(
            activateNextTurnDeployCountLimit(handover.consumeTurnEnder(newMyState)).state);
          if (handover.log) appendBattleLogs([handover.log]);
        }
        await persist.commit(reduceBattle(bs, {
          type: 'BEGIN_NEXT_TURN',
          activeUserId: handover.keepTurn ? undefined : ((isHost ? bs.guest_id : bs.host_id) as string),
          myKey: stateKey, myState: newMyState,
          opp: { key: opKey, state: opNextTurnState },
        }));
        return;
      } else {
        // §6.4 O-3: ATTACK_LRIG の次は通常 END だが、「追加のアタックフェイズ」の予約があれば
        // ATTACK_ARTS へ戻す（消化＝キューの減算と開始時本文の移送も同じ1点で行う）。
        // ⚠**`contBlocked.forSelf` を渡す**＝「【常】：対戦相手は自分のエナフェイズをスキップする」
        //   （`WX05-018-E1`）のような CONTINUOUS 由来の封じは `blocked_actions` に載らないので、
        //   渡さないとフェイズスキップが丸ごと無言 no-op になる。
        // ⚠🔴`ATTACK_ARTS_OP` だけは**進行ボタンを持つのが非ターンプレイヤー**（`NON_TURN_PLAYER_PHASES`）＝
        //   `my` はターンプレイヤーではない。スキップ判定は必ず**ターンプレイヤー側の state**で見る
        //   （従来ここは `my` を見ており、PvP では「相手のシグニアタックステップを飛ばす」札
        //   〔`WX09-Re02-E1` 等4枚〕が**自分に掛かっているかで判定**されて無言ですり抜けていた）。
        {
          const nextRes = NON_TURN_PLAYER_PHASES.includes(phase)
            ? { next: resolveNextPhaseWithSkips(phase, op, contBlocked.forOther), state: newMyState, addedExtraPhase: false }
            : resolveNextPhaseAfterAttack(phase, newMyState, contBlocked.forSelf);
          nextPhase = nextRes.next;
          newMyState = nextRes.state;
          if (nextRes.addedExtraPhase) appendBattleLogs(['追加のアタックフェイズを開始する']);
          if (nextPhase !== PHASE_NEXT[phase] && !nextRes.addedExtraPhase) {
            appendBattleLogs([`${PHASE_LABEL[PHASE_NEXT[phase]] ?? PHASE_NEXT[phase]}フェイズをスキップする`]);
          }
        }
        // 「このアタックフェイズの間」の遅延 watcher は ATTACK_LRIG→END で両者から消滅。
        // collector 側にもフェイズ判定を持たせ、stale state が残ってもフェイズ外発火しない。
        if (phase === 'ATTACK_LRIG') {
          newMyState = clearEndOfAttackPhaseDelayedTriggers(newMyState);
          const opKey = isHost ? 'guest_state' : 'host_state';
          oppWrite = { key: opKey, state: clearEndOfAttackPhaseDelayedTriggers(op) };
        }
        // ⚠**以下の「◯◯フェイズ開始時」フックは遷移元（`phase`）ではなく遷移先（`nextPhase`）で判定する**
        //   （§6.4 O-3・フェイズスキップ機構）＝エナ/メインフェイズが飛ばされたとき、
        //   ①**飛ばされたフェイズ**の開始時処理は走らず ②**その次に実際に入るフェイズ**の
        //   開始時処理はちゃんと走る、の両方をこの1つの書き換えで満たす。
        //   スキップが無い通常進行では `nextPhase === PHASE_NEXT[phase]` なので挙動は従来と同じ。
        // →GROW（グロウフェイズ開始時）: game_grow_phase_limit_plus で game_lrig_limit_bonus を累積
        if (nextPhase === 'GROW' && (newMyState.game_grow_phase_limit_plus ?? 0) > 0) {
          const glp = newMyState.game_grow_phase_limit_plus!;
          newMyState = { ...newMyState, game_lrig_limit_bonus: (newMyState.game_lrig_limit_bonus ?? 0) + glp };
          appendBattleLogs([`グロウフェイズ開始：リミット+${glp}（このゲーム・累積${newMyState.game_lrig_limit_bonus}）`]);
        }
        // →MAIN 移行時: pending_lrig_limit_modをlrig_limit_modに適用（OPP_MAIN_PHASE_LIMIT_DOWN）
        if (nextPhase === 'MAIN' && my.pending_lrig_limit_mod !== undefined) {
          newMyState = {
            ...newMyState,
            lrig_limit_mod: (newMyState.lrig_limit_mod ?? 0) + my.pending_lrig_limit_mod,
            pending_lrig_limit_mod: undefined,
          };
        }
        // →MAIN（メインフェイズ開始時）: game_main_draw（手札5枚以下ならドロー）
        if (nextPhase === 'MAIN' && newMyState.game_main_draw && newMyState.hand.length <= 5 && newMyState.deck.length > 0) {
          const drawCard = newMyState.deck[0];
          newMyState = { ...newMyState, deck: newMyState.deck.slice(1), hand: [...newMyState.hand, drawCard] };
          appendBattleLogs(['メインフェイズ開始ドロー（このゲーム）']);
        }
        // →ENERGY（エナフェイズ開始時）: game_energy_phase_draw
        if (nextPhase === 'ENERGY' && newMyState.game_energy_phase_draw && newMyState.deck.length > 0) {
          const drawCard = newMyState.deck[0];
          newMyState = { ...newMyState, deck: newMyState.deck.slice(1), hand: [...newMyState.hand, drawCard] };
          appendBattleLogs(['エナフェイズ開始ドロー（このゲーム）']);
        }
        // HASTARLIQ: →ATTACK_ARTS移行時、相手の hastarliq_zones があれば発動
        // ⚠`phase !== 'ATTACK_LRIG'` で「追加のアタックフェイズ」の2周目を除外する
        //   （従来の `phase === 'MAIN'` 判定と等価。メインフェイズがスキップされた場合だけ挙動が変わる）。
        if (nextPhase === 'ATTACK_ARTS' && phase !== 'ATTACK_LRIG' && (op.hastarliq_zones ?? []).length > 0) {
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
          oppWrite = { key: opKey, state: { ...op, hastarliq_zones: undefined } };
          const existingStackHL = bs.effect_stack ?? null;
          phaseStack = existingStackHL
            ? pushToStack(existingStackHL, hlEntries)
            : initStack(turnPlayerId, hlEntries);
        }
        // usageLimit 消費（《ターン1回/2回》）を actions_done へ書き戻す＝再フェイズ境界で再発火させない（続き119）。
        const foldTurnUsed = (res: { usedMyIds: string[]; usedOpIds: string[] }) => {
          if (res.usedMyIds.length > 0) newMyState = { ...newMyState, actions_done: [...(newMyState.actions_done ?? []), ...res.usedMyIds] };
          if (res.usedOpIds.length > 0) {
            const opKeyT = isHost ? 'guest_state' : 'host_state';
            const opBase = oppWrite?.state ?? op;
            oppWrite = { key: opKeyT, state: { ...opBase, actions_done: [...(opBase.actions_done ?? []), ...res.usedOpIds] } };
          }
        };
        // ON_ATTACK_PHASE_END（§6.3 J-4）: ATTACK_LRIG→END 移行時（アタックフェイズ終了時）トリガー。
        // ⚠`signi_left_field_this_attack_phase` はアタックフェイズ**開始時**にクリアするので、ここではまだ
        //   このアタックフェイズぶんの離場履歴が残っている＝`SIGNI_LEFT_FIELD_THIS_ATTACK_PHASE` 条件が読める。
        // ⚠追加のアタックフェイズ（§6.4 O-3）へ入る場合も**そのアタックフェイズは終了している**ので、
        //   遷移先ではなく `phase === 'ATTACK_LRIG'` で判定する（`PHASE_NEXT` 上の次は常に END）。
        // 🆕**「終了時」は「（追加フェイズの）開始時」より前に置く**（2026-08-18・§6.4 O-1 (e)）＝
        //   従来この収集は `ON_ATTACK_PHASE_START` ブロックの**後**にあり、追加のアタックフェイズへ入るときだけ
        //   ①スタックの解決順が「2周目の開始時 → 1周目の終了時」と逆転し
        //   ②直前の `clearAttackPhaseScopedState` で離場履歴が消えた state を読んでいた
        //   （＝上の⚠が成り立たない）。フェイズ境界の自然な順（終了→開始）へ揃える。
        if (phase === 'ATTACK_LRIG') {
          const apeRes = collectTurnTriggers('ON_ATTACK_PHASE_END', newMyState, op);
          foldTurnUsed(apeRes);
          if (apeRes.entries.length > 0) {
            const baseStackAPE = phaseStack ?? bs.effect_stack ?? null;
            phaseStack = baseStackAPE
              ? pushToStack(baseStackAPE, apeRes.entries)
              : initStack(bs.active_user_id ?? user.id, apeRes.entries);
          }
        }
        // ON_GROW_PHASE_START: →GROW移行時（グロウフェイズ開始時）トリガー。
        if (nextPhase === 'GROW') {
          const gpsRes = collectTurnTriggers('ON_GROW_PHASE_START', newMyState, op);
          foldTurnUsed(gpsRes);
          if (gpsRes.entries.length > 0) {
            const baseStackGPS = phaseStack ?? bs.effect_stack ?? null;
            phaseStack = baseStackGPS
              ? pushToStack(baseStackGPS, gpsRes.entries)
              : initStack(bs.active_user_id ?? user.id, gpsRes.entries);
          }
        }
        // ON_ATTACK_PHASE_START: →ATTACK_ARTS 移行時（アタックフェイズ開始時）トリガー。
        // ⚠従来は `phase === 'MAIN'` で判定していたが、§6.4 O-3 の「追加のアタックフェイズ」は
        //   ATTACK_LRIG→ATTACK_ARTS で入る＝**遷移先**で判定しないと2周目の開始時トリガーが1つも走らない。
        if (nextPhase === 'ATTACK_ARTS') {
          // §6.3 J-4: アタックフェイズ開始時に離場履歴をリセットする（`SIGNI_LEFT_FIELD_THIS_ATTACK_PHASE` の母集団）。
          newMyState = clearAttackPhaseScopedState(newMyState);
          const apsRes = collectTurnTriggers('ON_ATTACK_PHASE_START', newMyState, op);
          foldTurnUsed(apsRes);
          const apsEntries = apsRes.entries;
          if (apsEntries.length > 0) {
            const baseStackAPS = phaseStack ?? bs.effect_stack ?? null;
            phaseStack = baseStackAPS
              ? pushToStack(baseStackAPS, apsEntries)
              : initStack(bs.active_user_id ?? user.id, apsEntries);
          }
        }
        // ON_LRIG_ATTACK_STEP_START（C1 配線）: ATTACK_SIGNI→ATTACK_LRIG移行時（ルリグアタックステップ開始時）トリガー。
        // ターンプレイヤー（newMyState）の self【自】を発火（WX25-CP1-042-E2 等）。
        if (phase === 'ATTACK_SIGNI' && nextPhase === 'ATTACK_LRIG') {
          const lasRes = collectTurnTriggers('ON_LRIG_ATTACK_STEP_START', newMyState, op);
          foldTurnUsed(lasRes);
          const lasEntries = lasRes.entries;
          if (lasEntries.length > 0) {
            const baseStackLAS = phaseStack ?? bs.effect_stack ?? null;
            phaseStack = baseStackLAS
              ? pushToStack(baseStackLAS, lasEntries)
              : initStack(bs.active_user_id ?? user.id, lasEntries);
          }
        }
        // ON_MAIN_PHASE_START: →MAIN移行時（メインフェイズ開始時）トリガー。
        // newMyState=ターンプレイヤー／op=非ターンプレイヤー。triggerScope:any_opp（「対戦相手のメインフェイズ開始時」
        // WXDi-P00-034）は op の場シグニで発火＝collectTurnTriggers の相手フィールド分岐が拾う。
        // ⚠メインフェイズがスキップされたら**開始時トリガーごと外れる**（`WXEX2-19-E3`）。
        if (nextPhase === 'MAIN') {
          // §6.4 O-3: 「次のあなたのメインフェイズまで」の予約はここで失効させる（唯一の失効地点）。
          newMyState = clearMainPhaseScopedState(newMyState);
          const mpsRes = collectTurnTriggers('ON_MAIN_PHASE_START', newMyState, op);
          foldTurnUsed(mpsRes);
          const mpsEntries = mpsRes.entries;
          if (mpsEntries.length > 0) {
            const baseStackMPS = phaseStack ?? bs.effect_stack ?? null;
            phaseStack = baseStackMPS
              ? pushToStack(baseStackMPS, mpsEntries)
              : initStack(bs.active_user_id ?? user.id, mpsEntries);
          }
        }
      }

      // END 分岐（次ターン開始）は上で BEGIN_NEXT_TURN を commit して return 済み＝ここに来る全分岐が
      // nextPhase を必ず設定している。
      await persist.commit(reduceBattle(bs, {
        type: 'ADVANCE_TURN_WITH_STATE', playerKey: stateKey, playerState: newMyState,
        phase: nextPhase!, opp: oppWrite, effectStack: phaseStack,
      }));
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
      // 通常は doPhaseAdvance が先に消費済み。直接この経路へ来ても両者の予約を落とさないため冪等に再適用する。
      const facedownMyEND = resolveTurnEndFacedownReturns(my);
      const facedownOpEND = resolveTurnEndFacedownReturns(op);
      const myEndState = facedownMyEND.state;
      const opEndState = facedownOpEND.state;

      // ビートゾーンをトラッシュへ（doPhaseAdvance と同じ処理）
      const myBeatEND = myEndState.field.beat_zone ?? [];
      let myTrashBeat = myEndState.trash;
      if (myBeatEND.length > 0) {
        myTrashBeat = [...myEndState.trash, ...myBeatEND];
        appendBattleLogs([`ビートゾーン（${myBeatEND.length}枚）をトラッシュへ`]);
      }

      // 選択されたカードを捨てる
      const discardNums = [...selectedEndDiscard].map(i => myEndState.hand[i]);
      let myHandEND = myEndState.hand.filter((_, i) => !selectedEndDiscard.has(i));
      const myTrashEND = [...myTrashBeat, ...discardNums];
      appendBattleLogs([`手札上限超過（${myEndState.hand.length}枚→${myHandEND.length}枚）：${discardNums.map(n => battleCardMap.get(n)?.CardName ?? n).join('・')}を捨て`]);

      // 手札上限調整は「手札→トラッシュ」のルール処理。場起点専用の collectTrashTriggers ではなく、
      // fromZones:['hand'] を評価する既存 funnel を通す（効果／コスト起因ではないので byEffectCause=false）。
      const ruleDiscardEntries = discardNums.flatMap(cn =>
        collectAnyZoneTrashSelfTriggers(cn, user.id, false, 'hand', undefined, false));
      if (ruleDiscardEntries.length > 0) {
        const myAfterRuleDiscard: PlayerState = {
          ...myEndState,
          hand: myHandEND,
          trash: myTrashEND,
          field: { ...myEndState.field, beat_zone: [] },
        };
        const ruleDiscardStack = bs.effect_stack
          ? pushToStack(bs.effect_stack, ruleDiscardEntries)
          : initStack(bs.active_user_id ?? user.id, ruleDiscardEntries);
        // BEGIN_NEXT_TURN より前に解決する。解決完了後は既存の END 自動進行が再開し、
        // end_turn_effects_resolved マーカーにより予約型効果を二重適用せずターン境界へ進む。
        await persist.commit(reduceBattle(bs, {
          type: 'WRITE_STATE', myKey: stateKey, myState: myAfterRuleDiscard,
          opp: { key: isHost ? 'guest_state' : 'host_state', state: opEndState },
          effectStack: ruleDiscardStack,
        }));
        closeEndDiscard();
        return;
      }

      // ターン終了時に効果（コイン/場トラッシュ/トラッシュ→手札/フリップ復元）。
      // doPhaseAdvance（ENDフェーズ①）で解決済み（end_turn_effects_resolved）の場合は再実行しない
      // ＝手札上限超過でここに来たケースは常に解決済み。未解決の防御として個別ガードを付ける。
      let myFieldAfterCoinCheck = { ...myEndState.field, beat_zone: [] as string[] };
      let myTrashAfterCoinCheck = myTrashEND;
      let myEnergyEND2 = myEndState.energy;
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
      let myLrigDeckReturned2: string[] = [];
      let myHandReturnedEND2: string[] = [];
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
      // turn_end_energy_trash_targets: ターン終了時にエナゾーンからトラッシュへ（§6.4 funnel・上と同じ関数）
      if (!my.end_turn_effects_resolved) {
        const et = resolveTurnEndEnergyTrash({ ...my, energy: myEnergyEND2, trash: myTrashAfterCoinCheck });
        if (et.trashed.length > 0) {
          myEnergyEND2 = et.state.energy;
          myTrashAfterCoinCheck = et.state.trash;
          appendBattleLogs([`ターン終了時：${et.trashed.map(n => battleCardMap.get(getCardNum(n))?.CardName ?? n).join('・')}をエナゾーンからトラッシュへ`]);
        }
      }
      // turn_end_return_to_lrig_deck: 一時レゾナをルリグデッキへ戻す（§6.4 funnel・上と同じ関数）
      if (!my.end_turn_effects_resolved) {
        const ret = resolveTurnEndLrigDeckReturn({ ...my, field: myFieldAfterCoinCheck });
        if (ret.returned.length > 0) {
          myFieldAfterCoinCheck = { ...myFieldAfterCoinCheck, signi: ret.state.field.signi };
          myLrigDeckReturned2 = ret.returned;
          appendBattleLogs([`ターン終了時：${ret.returned.map(n => battleCardMap.get(getCardNum(n))?.CardName ?? n).join('・')}をルリグデッキへ戻す`]);
        }
      }
      // turn_end_return_to_hand: 「ターン終了時、それを場から手札に戻す」（§6.4 O-10 続き509・上と同じ関数）
      if (!my.end_turn_effects_resolved) {
        const rh = resolveTurnEndHandReturn({ ...my, field: myFieldAfterCoinCheck });
        if (rh.returned.length > 0) {
          myFieldAfterCoinCheck = { ...myFieldAfterCoinCheck, signi: rh.state.field.signi };
          myHandReturnedEND2 = rh.returned;
          appendBattleLogs([`ターン終了時：${rh.returned.map(n => battleCardMap.get(getCardNum(n))?.CardName ?? n).join('・')}を手札に戻す`]);
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
      let newMyState: typeof my = clearTurnEndScopedState(clearAttackFieldTrashCosts(clearEndOfTurnDelayedTriggers({
        ...myEndState,
        hand: myHandEND,
        trash: myTrashAfterCoinCheck,
        field: myFieldAfterCoinCheck,
        energy: myEnergyEND2,
        turn_end_energy_trash_targets: undefined,
        ...(myLrigDeckReturned2.length > 0
          ? { lrig_deck: [...myEndState.lrig_deck, ...myLrigDeckReturned2] } : {}),
        // §6.4 O-10（続き509）＝手札へ戻す分は `myHandEND` の**後**に足す（上限チェックは既に済んでいる）。
        ...(myHandReturnedEND2.length > 0 ? { hand: [...myHandEND, ...myHandReturnedEND2] } : {}),
        turn_end_draw_count: undefined,
        end_turn_effects_resolved: undefined, // マーカーをクリア（次ターンの解決に持ち越さない）
        temp_power_mods: [], temp_level_mods: [], keyword_grants: {}, granted_effects: {},
        // abilities_removed / keyword_abilities_removed のクリアと「次のターン」予約の昇格は
        // clearTurnEndScopedState に集約した（§6.4 O-3）。ここで個別に空へ倒すと予約を握り潰す。
        actions_done: [],
        last_effect_draw_source: undefined, // 効果ドローの原因カードをリセット（drawBySourceStory）
        pending_crashed_cards: [], pending_crash_source_card_nums: [], crash_source_card_num: undefined, pending_crash_causes: [], crash_cause: undefined,
        prevent_next_damage: undefined, prevent_next_damage_reservations: undefined, turn_end_mill_count: undefined, damage_replace_mill: undefined, life_crash_replacements: undefined, life_burst_double_next: undefined,
        lrig_granted_auto_effects: clearTurnGrantedLrigAbilities(my).lrig_granted_auto_effects, banish_redirect: undefined,
        banish_redirect_target_nums: undefined,
        banish_redirect_battle_target_nums: undefined,
        banish_redirect_power0_target_nums: undefined,
        banish_redirect_to_hand: undefined, banish_redirect_to_exile: undefined, power0_banish_to_trash: undefined, power0_banish_to_trash_opp_only: undefined,
        banish_redirect_by_source_nums: undefined,
        double_power_minus_sources: undefined, no_grow: undefined,
        suppress_life_burst: undefined, prevent_lrig_damage: undefined,
        prevent_defeat: undefined,
        declared_number: undefined,
        declared_class: undefined, hand_signi_guard_enabled: undefined,
        lrig_limit_mod: undefined, prevent_opp_guard: undefined,
        draw_limit: undefined, card_class_overrides: undefined,
        signi_color_overrides: undefined, signi_zone_blocks: undefined,
        attacked_signi_ids: undefined, signi_attack_once_limit: undefined,
        signi_attack_cost: undefined, lrig_riding_signi: undefined,
        lrig_attack_remaining: undefined, suppress_center_on_play: undefined,
        crash_to_trash_instead: undefined, negate_opp_attacks: undefined,
        all_cont_effects_negated: undefined, banish_to_trash_by_self: undefined,
        negate_coin_abilities: undefined, coin_condition_signi_instances: undefined,
        deck_signi_level_override: undefined,
        reduce_next_on_play_cost: undefined, optional_discard_guard_enabled: undefined,
        flip_attack_signi_zones: undefined, turn_end_field_trash_targets: undefined,
        turn_trigger_3rd_plant_down: undefined,
        turn_plant_down_count: undefined,
        turn_hand_discarded_count: undefined, turn_signi_returned_to_hand: undefined, turn_arts_used: undefined, turn_arts_used_names: undefined, turn_arts_used_colors: undefined,
        is_betting_this_effect: undefined, is_boosting_this_effect: undefined, last_discarded_signi_power: undefined, last_discarded_signi_level: undefined,
        cancel_current_signi_attack: undefined,
      })));
      // 相手のアップ処理
      const opKey = isHost ? 'guest_state' : 'host_state';
      // 遅延自己除外は非ターンプレイヤー側にも適用（doPhaseAdvance 側と同じ。手札上限超過経由でも落とさない）
      const opState = resolvePendingExiles(opEndState, true);
      const curSigniDown   = opState.field.signi_down   ?? [false, false, false];
      const curSigniFrozen = opState.field.signi_frozen  ?? [false, false, false];
      const curLrigFrozen  = opState.field.lrig_frozen   ?? false;
      const curAssistLFrozen = opState.field.assist_lrig_l_frozen ?? false;
      const curAssistRFrozen = opState.field.assist_lrig_r_frozen ?? false;
      const newSigniDown = curSigniDown.map((down, i) => down && curSigniFrozen[i]) as boolean[];
      const upkeepLrigDown2 = ((opState.field.lrig_down ?? false) && curLrigFrozen)
        || (opState.lrig_upkeep_condition !== undefined);
      if (opState.lrig_upkeep_condition) appendBattleLogs([`相手のセンタールリグはアップ条件あり（${opState.lrig_upkeep_condition}）`]);
      // §6.4 O-3: 交代判定は `doPhaseAdvance` 側と**同じ1関数**（軸を足すときもここではなく関数へ）。
      const handoverED = resolveTurnHandover(my, opState);
      const opFinalState = handoverED.consumeOpponent(clearEndOfTurnDelayedTriggers(activateNextTurnSigniZoneBlocks(activateNextTurnDeployCountLimit(clearTurnEndScopedState({
        ...clearUntilOppTurnEffects(clearAllZoneBurstGrantUntilOppTurn(opState)),
        // 相手側も同じく clearTurnEndScopedState に集約（§6.4 O-3）。
        signi_played_from_trash: undefined, signi_played_from_deck: undefined, signi_placed_by_source: undefined, // 出自マーカー本体はUP開始時の funnel でクリア
        negate_coin_abilities: undefined,
        turn_arts_used: undefined, turn_arts_used_names: undefined, turn_arts_used_colors: undefined, // アーツ使用履歴をリセット
        signi_deploy_count_limit: undefined,       // 配置数制限（このターン・相手にかけられた分）を自分のターン開始時にリセット
        banish_redirect_power0_target_nums: undefined, // 非ターンプレイヤーがこのターン中に設定した単体power0置換もクリア
        banish_redirect_battle_target_nums: undefined,
        field: {
          ...opState.field,
          signi_down:   newSigniDown,
          signi_frozen: [false, false, false],
          lrig_down:    upkeepLrigDown2,
          lrig_frozen:  false,
          assist_lrig_l_down: (opState.field.assist_lrig_l_down ?? false) && curAssistLFrozen,
          assist_lrig_r_down: (opState.field.assist_lrig_r_down ?? false) && curAssistRFrozen,
          assist_lrig_l_frozen: false,
          assist_lrig_r_frozen: false,
        },
      }), !handoverED.keepTurn).state, !handoverED.keepTurn)));
      // 追加ターン / 相手のターンスキップ / ターンプレイヤー交代
      // ⚠ 交代しない場合は active_user_id を書かず据え置く（＝BEGIN_NEXT_TURN の activeUserId 省略）。
      let nextActiveUserId: string | undefined;
      if (handoverED.keepTurn) {
        newMyState = activateNextTurnSigniZoneBlocks(
          activateNextTurnDeployCountLimit(handoverED.consumeTurnEnder(newMyState)).state);
        if (handoverED.log) appendBattleLogs([handoverED.log]);
      } else {
        nextActiveUserId = (isHost ? bs.guest_id : bs.host_id) as string;
      }

      await persist.commit(reduceBattle(bs, {
        type: 'BEGIN_NEXT_TURN', activeUserId: nextActiveUserId,
        myKey: stateKey, myState: newMyState,
        opp: { key: opKey, state: opFinalState },
      }));

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
        const growRed = collectGrowCostReductions(my, op, isMyTurn, effectsMap, battleCardMap);
        const hasAffordable = growCandidates.some(card => {
          const gCoin = parseCoinCost(card.GrowCost);
          return (gCoin === 0 || my.coins >= gCoin) &&
            // エナ代替トラッシュ（COST_SUBSTITUTE / ENERGY_SUBSTITUTE_TRASH_SIGNI 等）はグロウ支払いにも効く
            // ＝原文「あなたが《X》を支払う際」はグロウコストを含む（タスク12(xxxvi)・続き206）。
            canAffordGrowCost(energyPoolCardNums(myEnergyPayPool), battleCards, applyGrowCostReduction(card.GrowCost, growRed), my.keyword_grants, myEnaAllMulti, myEnaMultiStripped, myColorlessOverrides, myColorSubs,
              undefined, myEnergyTrashSubInfo.wildcardInstIds, myEnergyTrashSubInfo.colorOverrideMap, undefined, my.cannot_pay_colorless_this_attack_phase);
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
      await persist.commit(reduceBattle(bs, { type: 'WRITE_STATE', myKey: stateKey, myState: newMyState }));
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
      await persist.commit(reduceBattle(bs, { type: 'WRITE_STATE', myKey: stateKey, myState: newMyState }));
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
   * extraState で相手側プレイヤー状態（【ライフバースト】の usage 消費など）を同時に保存できる。
   */
  const queueCardEffects = async (
    cardNum: string,
    effectTypes: ('AUTO' | 'ACTIVATED' | 'LIFE_BURST')[],
    timings: string[],
    startMyState: PlayerState,
    _startOpState: PlayerState,
    extraState: { key: PlayerStateKey; state: PlayerState } | undefined = undefined,
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
    const { error } = await persist.commit(reduceBattle(bs, {
      type: 'WRITE_STATE', myKey, myState: startMyState, effectStack: stack, clearPending: true,
      opp: extraState,
    }));
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
      const { entry, newStack: shiftedStack } = shiftQueue(stack);
      if (!entry) {
        await persist.commit(reduceBattle(bs, { type: 'SET_STACK', stack: null }));
        return;
      }

      lastResolvedEntryIdRef.current = entry.id;
      const ownerIsHost = entry.playerId === bs.host_id;
      const ownerState  = ownerIsHost ? bs.host_state : bs.guest_state;
      const otherState  = ownerIsHost ? bs.guest_state : bs.host_state;
      const isOwnerTurn = bs.active_user_id === entry.playerId;
      // ON_ABILITY_ACTIVATED（§6.3 J-1「他能力の発動監視」）＝**ここが「能力が発動した」瞬間**。
      // `shiftQueue` の呼び出し元はこの1箇所だけなので、全経路（人間/CPU・【出】/【自】/LB）をここで押さえられる。
      // 監視側の【自】を同じスタックへ積み、発動した能力の直後に解決させる。
      // ⚠監視エントリ自身は ON_ABILITY_ACTIVATED なので collector 側で除外され、連鎖にはならない。
      const abilityActivated = { ownerId: entry.playerId, effect: entry.effect, cardNum: entry.cardNum, ownerState };
      const aaHost  = pureCollectAbilityActivatedTriggers(mkTrigCtx(), bs.host_id, bs.host_state, bs.guest_state, abilityActivated);
      const aaGuest = pureCollectAbilityActivatedTriggers(mkTrigCtx(), bs.guest_id, bs.guest_state, bs.host_state, abilityActivated);
      const abilityWatchEntries = [...aaHost.entries, ...aaGuest.entries];
      const newStack = abilityWatchEntries.length > 0 ? pushToStack(shiftedStack, abilityWatchEntries) : shiftedStack;
      const who = entry.playerId === user.id ? '自分' : '相手';
      appendBattleLogs([`[${who}] ${entry.label}`], { defer: true });
      // 【英知】条件のレベル読み替えを収集（位相限定かどうかは収集側が原文から判定する）。
      // 値は**取りうるレベル群**なので `eichi_level_options` に入れる（単一値の
      // `attack_phase_level_overrides` は SET_BASE_LEVEL 等が使う別物）。
      const ownerLevelOverrides = collectAttackPhaseLevelOverrides(ownerState, effectsMap, battleCardMap, bs.turn_phase ?? undefined);
      const ownerStateForCtx = Object.keys(ownerLevelOverrides).length > 0
        ? { ...ownerState, eichi_level_options: ownerLevelOverrides } : ownerState;
      const ctxPowers = calcFieldPowers(ownerStateForCtx, otherState, isOwnerTurn, effectsMap, battleCardMap, bs.turn_phase);
      // PREVENT_ZONE_MOVE_BY_OPP: 相手（otherState）の保護ゾーンを動的計算してctxに渡す
      const otherProtectedZones = collectProtectedZones(otherState, battleCardMap, effectsMap);
      // PREVENT_SIGNI_ABILITY_LOSS_BY_OPP: 相手フィールドの能力保護シグニを動的計算してctxに渡す
      const otherProtectedSigniNums = collectAbilityProtectedSigni(otherState, ownerStateForCtx, battleCardMap, effectsMap, !isOwnerTurn);
      // PREVENT_SELF_DOWN_BY_OPP / PREVENT_SIGNI_DOWN_BY_OPP_ALL: 相手フィールドのダウン保護シグニ
      // !isOwnerTurn: 相手(otherState)視点での isOwnerTurn を渡す（collectAbilityProtectedSigni と同じ慣例）
      const otherDownProtectedNums = collectDownProtectedSigni(otherState, battleCardMap, effectsMap, ownerStateForCtx, !isOwnerTurn);
      // SIGNI_CANT_BOUNCE_FROM_FIELD: 相手フィールドのバウンス保護シグニ
      const otherBounceProtectedNums = collectBounceProtectedSigni(otherState, battleCardMap, effectsMap, ownerStateForCtx, !isOwnerTurn, bs.turn_phase);
      // GRANT_PROTECTION from=['BANISH'/'any']: 相手フィールドのバニッシュ保護シグニ
      const otherBanishProtectedNums = collectBanishEffectProtectedSigni(otherState, ownerStateForCtx, !isOwnerTurn, effectsMap, battleCardMap, undefined, 'opponent', bs.turn_phase);
      // 発生源無限定（sourceOwner:any）の耐性は、自分の効果で自場をバニッシュする場合にも有効。
      // opponent 指定はこの集合へ入らないため、既存の相手限定耐性は広がらない。
      const ownBanishProtectedNums = collectBanishEffectProtectedSigni(ownerStateForCtx, otherState, isOwnerTurn, effectsMap, battleCardMap, ctxPowers, 'self', bs.turn_phase);
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
      const otherEffectImmuneNums = collectEffectImmuneSigni(otherState, ownerStateForCtx, battleCardMap, effectsMap, !isOwnerTurn, immuneSourceType, entry.cardNum, entry.effect.effectType);
      // 「対戦相手の【シグニ】の効果によってバニッシュされない」: ソース種別一致時のみバニッシュ保護（バニッシュ軸限定）
      const otherBanishBySourceNums = collectBanishBySourceProtectedSigni(
        otherState, ownerStateForCtx, !isOwnerTurn, effectsMap, battleCardMap, immuneSourceType, entry.cardNum,
      );
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
      // ⚠ `currentPhase` は**この8箇所すべてに渡すこと**（タスク12(cvii)）。engine 側にはフェイズを見る
      //   機構が4本あるが（`isOwnTrashMoveLocked`／`DURING_PHASE` 条件／`applyEffectLeaveNoAbilityDeck
      //   BottomSubstitute`／`banishRedirectOpts.turnPhase`）、いずれも**フェイズ不明なら成立させない側へ
      //   倒す**設計なので、渡し忘れると「engine は正しいのに実UIでは丸ごと不発」になり計器にも映らない。
      //   golden ハーネス（`src/verify/main.ts`）は `currentPhase:'MAIN'` を手で埋めるため緑のまま通る。
      const ctx: ExecCtx = { ownerState: ownerStateForCtx, otherState, cardMap: declaredCardMap1, logs: [], currentPhase: bs.turn_phase ?? undefined, effectivePowers: ctxPowers, sourceCardNum: entry.cardNum, sourceEffectId: entry.effectId, triggeringCardNum: entry.triggeringCardNum, leftFieldUnderCards: entry.leftFieldUnderCards, triggeringKeyword: entry.triggeringKeyword, battleAttackerCardNum: entry.battleAttackerCardNum, banishedSigniPower: entry.banishedSigniPower, otherProtectedZones, otherProtectedSigniNums: otherProtectedSigniNumsM, otherDownProtectedNums: otherDownProtectedNumsM, otherBounceProtectedNums: otherBounceProtectedNumsM, otherBanishProtectedNums: otherBanishProtectedNumsM, ownBanishProtectedNums, otherTrashFieldProtectedNums: otherTrashFieldProtectedNumsM, ownSelfTrashPreventNums, otherAbilityGainProtectedNums, otherEffectImmuneNums: otherEffectImmuneNums, charmShieldNums, deckToEnergyBlocked: contBlockedCtx.forSelf.has('DECK_TO_ENERGY'), signiFieldPlaceByEffectBlocked: contBlockedCtx.forSelf.has('SIGNI_FIELD_PLACE_BY_EFFECT'), allColorSigniNums, fieldSigniExtraColors, oppTrashColorLoss, treatAsClassAllZones, deckTrashLevel1Nums };
      ctx.isOwnerTurn = isOwnerTurn;
      // EFFECTIVE_LRIG_LIMIT_GTE（WXDi-P11-010A）は実効リミット計算に effectsMap を要る。
      // ⚠ ExecCtx.effectsMap は省略可＝渡さないと当該条件が**常に false** になる dead flag だった（続き296 検証で発見）。
      ctx.effectsMap = effectsMap;
      fillDeployCaps(ctx); // 配置数制限（CONT版）をctxへ（isOwnerTurn 確定後に呼ぶ）
      // §6.4 O-38（続き544）＝「対戦相手のシグニの【自】能力が発動する場合、対戦相手が〈コスト〉を
      // 支払わないかぎり、その能力は何もしない」（`SPDi43-01-E2`）。
      // 🔑**ここが唯一の choke point**＝`shiftQueue` の呼び出し元は上の1箇所だけなので、
      //   全経路（人間/CPU・シグニの【自】）をここで包める。収集側（`triggerCollect` の42箇所に散った
      //   `BLOCK_OWN_SIGNI_AUTO` フィルタ）に支払い分岐は差し込めない。
      const autoPayGate = isSigniAutoAbility(entry.effect, entry.cardNum, battleCardMap)
        ? findSigniAutoPayGate(ownerState, otherState) : null;
      const effectToRun = autoPayGate ? wrapSigniAutoPayGate(entry.effect, autoPayGate) : entry.effect;
      let result = executeEffect(effectToRun, ctx);
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
        const midBd = collectBoardDiffTriggers(hostAcc, guestAcc, {
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
          const bd = collectBoardDiffTriggers(hostAcc, guestAcc, {
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
          const ta = collectTrapActivateTriggers(entry.playerId, hostState, guestState);
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
          const ts = pureCollectTrapSetTriggers(mkTrigCtx(), entry.playerId, result.trapSetOwners!, hostState, guestState);
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
            const tt = collectTargetedTriggers(
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

        // COLLAB: コラボライバー呼び出しで配置されたアシストルリグ自身の【出】を、
        // 効果配置シグニと同じ共通 collector に載せる。任意コスト/任意発動・条件・使用制限・
        // 【出】封じをここで統一し、raw effect の直積みによるコスト踏み倒しを防ぐ。
        if ((entry.effect.action as import('../types/effects').StubAction)?.type === 'STUB' &&
            (entry.effect.action as import('../types/effects').StubAction)?.id === 'COLLAB') {
          const collabOnPlayEntries: StackEntry[] = [];
          for (const instanceId of result.lastProcessedCards ?? []) {
            const controllerState = entry.playerId === bs.host_id ? hostState : guestState;
            const otherState = entry.playerId === bs.host_id ? guestState : hostState;
            const controllerBefore = entry.playerId === bs.host_id ? bs.host_state : bs.guest_state;
            const collected = pureCollectPlacedSelfOnPlayTriggers(
              mkTrigCtx(), instanceId, controllerState, otherState, entry.playerId,
              { placedByEffect: true, sourceIsSigni: false, placedFromZone: detectPlacedFromZone(controllerBefore, instanceId, controllerState) },
            );
            collabOnPlayEntries.push(...collected.entries);
            if (collected.usedHostIds.length > 0) {
              hostAcc = { ...hostAcc, actions_done: [...(hostAcc.actions_done ?? []), ...collected.usedHostIds] };
            }
            if (collected.usedGuestIds.length > 0) {
              guestAcc = { ...guestAcc, actions_done: [...(guestAcc.actions_done ?? []), ...collected.usedGuestIds] };
            }
          }
          if (collabOnPlayEntries.length > 0) {
            const baseStackC = stackAcc ?? null;
            stackAcc = baseStackC
              ? pushToStack(baseStackC, collabOnPlayEntries)
              : initStack(stack.turnPlayerId, collabOnPlayEntries);
          }
        }

        // 開花（ON_BLOOM）トリガーは上の detectBloomedSigni / collectBloomTriggers で収集済み。
        // ルール上「開花」は「場に出た」扱いではないため、ここで ON_PLAY（出現時）は発火させない。

        // REVEAL_UNTIL_TO_FIELD の自身【出】も上の opt-in 中央 diff に統合済み。

        // ON_OPP_ARTS_USE: 相手がアーツを使用した場合、自分側の ON_OPP_ARTS_USE トリガーを収集
        // ⚠遅延トリガー（INSTALL_DELAYED_TRIGGER の発火）は除く＝アーツを「使用した」のは設置した時点であって
        //   発火時点ではない。タスク12(lxi) 第6波で entry.cardNum に設置元カード番号を復元した副作用で、
        //   アーツ由来の遅延トリガー6枚（WX11-024／WX24-P1-007／WX25-P3-003／WX26-CP1-003／-005／-009）が
        //   発火のたびに「アーツ使用」を再発火させる二重発火になるため、effectId で弁別して抑止する。
        // §5.3 `O-131`＝収集は `collectOppArtsUseForResolution` の1本（resume 経路と同じ関数を見る）。
        const artsTriggers = collectOppArtsUseForResolution({
          artsOwnerId: entry.playerId, artsCardNum: entry.cardNum, effectId: entry.effectId,
          beforeMine: isHost ? bs.host_state : bs.guest_state,
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
        // caster の client のみが収集する（entry.playerId === user.id）＝ON_OPP_ARTS_USE と裏表で二重押しを防ぐ。
        // §5.3 `O-131`＝収集は `collectArtsUseForResolution` の1本（resume 経路と同じ関数を見る）。
        const au = collectArtsUseForResolution({
          artsOwnerId: entry.playerId, artsCardNum: entry.cardNum, effectId: entry.effectId,
          afterHost: hostState, afterGuest: guestState,
        });
        if (au) {
          if (au.entries.length > 0) {
            const baseStackAU = stackAcc ?? null;
            stackAcc = baseStackAU
              ? pushToStack(baseStackAU, au.entries)
              : initStack(user.id, au.entries);
            // usageLimit（《ターン1回/2回》）を caster の actions_done に永続化
            if (au.usedIds.length > 0) {
              const baseStAU = isHost ? hostAcc : guestAcc;
              const withUsed = { ...baseStAU, actions_done: [...(baseStAU.actions_done ?? []), ...au.usedIds] };
              if (isHost) hostAcc = withUsed; else guestAcc = withUsed;
            }
          }
        }

        // FORCE_END_TURN: スタック・エフェクト解決後にターンを即座に終了する
        if (result.forceEndTurn) {
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
          forceEndNextTurn = { activeUserId: (activeIsHost ? bs.guest_id : bs.host_id) as string };
          appendBattleLogs(['ターンが強制終了されました'], { defer: true });
        }
      }
      await persist.commit(reduceBattle(bs, {
        type: 'RESOLVE_EFFECT_STEP', hostState: hostAcc, guestState: guestAcc,
        pending: pendingAcc, effectStack: stackAcc, beginNextTurn: forceEndNextTurn,
      }));
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
      await persist.commit(reduceBattle(bs, { type: 'SET_STACK', stack: stack, settle: true }));
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
      const ctx: ExecCtx = { ownerState, otherState, cardMap: declaredCardMap2, logs: [], currentPhase: bs.turn_phase ?? undefined, effectivePowers: ctxPowers, sourceCardNum: pe.sourceCardNum, sourceEffectId: pe.effectId, sourcePlacementPending: !!pe.spellPlacement, triggeringCardNum: pe.triggeringCardNum, leftFieldUnderCards: pe.leftFieldUnderCards, triggeringKeyword: pe.triggeringKeyword, trapActivated: pe.trapActivated, trapSetOwners: pe.trapSetOwners, storedTargetCards: pe.storedTargetCards, allColorSigniNums, fieldSigniExtraColors, treatAsClassAllZones, deckTrashLevel1Nums };
      fillDeployCaps(ctx); // 配置数制限（CONT版）をctxへ
      ctx.isOwnerTurn = bs.active_user_id === pe.sourcePlayerId;
      const inter = pe.interaction;

      let result: ExecResult;
      // §6.4 O-10（続き516）＝「このシグニが対戦相手の、能力か効果の対象になったとき、このシグニを
      // 裏向きにし、表向きにする」（`WX25-CP1-060-E2`）＝**新しいオブジェクトになってその効果の対象から外れる**。
      // 🔑`ON_TARGETED` トリガーは `resumeSelectTarget` が効果を適用し**終えた後**に積まれる（下の収集）ので、
      //   トリガーとしては表現できない＝**対象宣言の直後・適用の前**であるこの1点でしか解決できない。
      // ⚠該当宣言が対象に1体も居なければ `dodged` は空＝**従来とまったく同じ経路**を通る（ホットパスの安全条件）。
      let selectedForResume = selectedOrChoiceId;
      if (inter.type === 'SELECT_TARGET') {
        const dodgeOwnerIsHost = pe.sourcePlayerId !== bs.host_id;   // 対象の持ち主＝効果主の対戦相手
        const dodgeOwnerState = dodgeOwnerIsHost ? bs.host_state : bs.guest_state;
        const flip = resolveTargetDodgeFlip({
          targeted: selectedOrChoiceId,
          targetOwnerState: dodgeOwnerState,
          sourceState: dodgeOwnerIsHost ? bs.guest_state : bs.host_state,
          isTargetOwnerTurn: bs.active_user_id === (dodgeOwnerIsHost ? bs.host_id : bs.guest_id),
          cardMap: battleCardMap, effectsMap, turnPhase: bs.turn_phase ?? undefined,
        });
        if (flip.dodged.length > 0) {
          selectedForResume = selectedOrChoiceId.filter(n => !flip.dodged.includes(n));
          // ⚠ctx 側にも反映しないと、以降の解決が**失効前の state** を見てもう一度回避できてしまう。
          if (dodgeOwnerIsHost === ownerIsHost) ctx.ownerState = flip.state; else ctx.otherState = flip.state;
          appendBattleLogs([`${flip.dodged.map(n => battleCardMap.get(getCardNum(n))?.CardName ?? n).join('・')}は裏向きになり表向きになった（対象から外れる）`], { defer: true });
        }
      }
      if (inter.type === 'SELECT_TARGET') {
        result = resumeSelectTarget(selectedForResume, inter, ctx);
      } else if (inter.type === 'SEARCH') {
        result = resumeSearch(selectedOrChoiceId, inter, ctx);
      } else if (inter.type === 'CHOOSE') {
        const choiceId = selectedOrChoiceId[0] ?? '';
        const opt = inter.options.find(o => o.id === choiceId);
        if (inter.leaveSubstituteAsk || inter.costlessOpponentChoice) {
          // §6.4 離場置換の可否／カード名の宣言（どちらもコスト無し）＝素の resumeChoose。
          //   ⚠下の opponentResponds 分岐へ落とすと `resumeOpponentPayOptional` が「エナ不足」で
          //   即終了し**無言で潰れる**。
          result = resumeChoose(choiceId, inter, ctx);
        } else if (inter.opponentResponds) {
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
      if (result.done && (pe.effectId === 'WX15-002-sub-E1' || pe.effectId === 'WXEX2-15-E2')) {
        result = { ...result, ownerState: { ...result.ownerState, is_holograph_this_effect: undefined } };
      }
      // デッキ0枚→リフレッシュ（インタラクション解決後）。
      result = applyRefreshOnDone(result, battleCardMap);
      result = finalizePendingSpellPlacement(result, pe);
      if (result.logs.length > 0) appendBattleLogs(result.logs, { defer: true });

      const hostState  = resolvePendingExiles(ownerIsHost ? result.ownerState : result.otherState);
      const guestState = resolvePendingExiles(ownerIsHost ? result.otherState : result.ownerState);
      // パッチ（両者の盤面／pending_effect／effect_stack）は**型付きローカルへ**積み、commit 直前に
      // `RESOLVE_EFFECT_STEP` の payload として1回だけ渡す。旧実装は `Record<string, unknown>` の
      // `update` を直接積み増し、`'host_state' in update ? … : hostState` で読み戻していた
      // （`host_state`/`guest_state` は初期化済みなので **`in` は常に true**＝読み戻し先は常に累積値）。
      // ⚠ `effect_stack` だけは初期化されない＝**未書き込み（undefined）なら土台は `bs.effect_stack`**。
      let hostAcc = hostState;
      let guestAcc = guestState;
      let stackAcc: EffectStack | null | undefined;
      let pendingAcc: PendingEffect | null;

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
          const originEffect = (effectsMap.get(pe.sourceCardNum) ?? effectsMap.get(getCardNum(pe.sourceCardNum)) ?? [])
            .find(e => e.effectId === pe.effectId);
          const tt = collectTargetedTriggers(
            targetedNums, oppOfSourceId, hostState, guestState,
            originEffect ? { cardNum: pe.sourceCardNum, effect: originEffect } : undefined,
            bs.host_state, bs.guest_state,
          );
          targetedEntries = tt.entries;
          targetedUsedHostIds = tt.usedHostIds;
          targetedUsedGuestIds = tt.usedGuestIds;
        }
      }

      if (!result.done) {
        // continuationが発生した場合、次のインタラクションは効果オーナーが応答する（respondPlayerIdをリセット）。
        // ⚠次の pending 自身が「相手が応答する」型なら、**効果オーナーの対戦相手**を再計算して割り当てる。
        //   `pe.respondPlayerId` の引き継ぎでは、相手応答でない対話（例 SEARCH）から相手応答の対話へ
        //   移った1手目で undefined のままになり、効果オーナーが相手の代わりに選んでしまう（§6.4 O-2）。
        const nextRespondPlayerId = pendingRespondsOpponent(result.pending)
          ? (ownerIsHost ? bs.guest_id : bs.host_id)
          : undefined;
        const { respondPlayerId: _drop, ...peBase } = pe;
        pendingAcc = {
          ...peBase,
          ...(nextRespondPlayerId ? { respondPlayerId: nextRespondPlayerId } : {}),
          interaction: result.pending,
          ...(result.trapSetOwners ? { trapSetOwners: result.trapSetOwners } : {}),
          ...(result.storedTargetCards ? { storedTargetCards: result.storedTargetCards } : {}),
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
          ...fieldPlacementOnPlayOpts(
            (effectsMap.get(pe.sourceCardNum) ?? effectsMap.get(getCardNum(pe.sourceCardNum)) ?? [])
              .find(e => e.effectId === pe.effectId),
          ),
        });
        hostAcc = midBd.hostState;
        guestAcc = midBd.guestState;
        if (midBd.entries.length > 0) {
          const existingMidStack = bs.effect_stack ?? null;
          stackAcc = existingMidStack
            ? pushToStack(existingMidStack, midBd.entries)
            : initStack(bs.active_user_id ?? user.id, midBd.entries);
        }
      } else {
        pendingAcc = null;

        // === 盤面差分トリガーの統合収集（続き61・Opus）===
        // resolveStackNext の中央 diff と同一の collectBoardDiffTriggers を呼び、resume 経路（対象選択/CHOOSE を挟んで
        // 完了した効果）でも全トリガー種別を取りこぼさず収集する（従来は banish/bloom/armor/leave/ds/bn/lu/kg/fz の 9 種のみで、
        // ON_OPP_POWER_DECREASED/ON_ENERGY_TO_TRASH/ON_DRAW〔SEQUENCE内対話〕/ON_TRASH self 等を取りこぼしていた・§6.3 続き58/60）。
        const bd = collectBoardDiffTriggers(hostState, guestState, {
          causeOwnerId: pe.sourcePlayerId,
          causeSourceCardNum: pe.sourceCardNum,
          fieldTrashCostCards: result.fieldTrashCostCards,
          ...fieldPlacementOnPlayOpts(
            (effectsMap.get(pe.sourceCardNum) ?? effectsMap.get(getCardNum(pe.sourceCardNum)) ?? [])
              .find(e => e.effectId === pe.effectId),
          ),
        });
        hostAcc = bd.hostState;
        guestAcc = bd.guestState;
        const pendingEntries = bd.entries;
        // 🔴§5.3 `O-131`＝**この経路にも `ON_OPP_ARTS_USE` の収集が要る**。
        //   `selectOrInteract` は**候補が1件でも必ず中断する**ので、対象を取る相手のアーツは
        //   `resolveStackNext` ではなく**ここで完了する**。抽出前は収集が向こうにしか無く、
        //   `ON_OPP_ARTS_USE` を持つ live 6効果は**実機で一度も発火していなかった**。
        // ⚠差分の基準（`beforeMine`）は**この resume 段の直前**＝中断より前に確定した影響は数えない
        //   （過小side。`O-113` の「盤面に出る影響だけを見る」方針と同じ向き）。
        const artsTrigRe = collectOppArtsUseForResolution({
          artsOwnerId: pe.sourcePlayerId, artsCardNum: pe.sourceCardNum, effectId: pe.effectId,
          beforeMine: isHost ? bs.host_state : bs.guest_state,
          afterHost: hostAcc, afterGuest: guestAcc,
          autoTargetedCards: result.autoTargetedCards,
        });
        if (artsTrigRe) {
          if (artsTrigRe.entries.length > 0) pendingEntries.push(...artsTrigRe.entries);
          if (artsTrigRe.usedIds.length > 0) {
            const baseRe = artsTrigRe.iAmHost ? hostAcc : guestAcc;
            const withUsedRe = { ...baseRe, actions_done: [...(baseRe.actions_done ?? []), ...artsTrigRe.usedIds] };
            if (artsTrigRe.iAmHost) hostAcc = withUsedRe; else guestAcc = withUsedRe;
          }
        }
        // §5.3 `O-131`＝裏返し（自分がアーツを使用したとき）も同じ理由でこちらに要る。
        const auRe = collectArtsUseForResolution({
          artsOwnerId: pe.sourcePlayerId, artsCardNum: pe.sourceCardNum, effectId: pe.effectId,
          afterHost: hostAcc, afterGuest: guestAcc,
        });
        if (auRe) {
          if (auRe.entries.length > 0) pendingEntries.push(...auRe.entries);
          if (auRe.usedIds.length > 0) {
            const baseAuRe = isHost ? hostAcc : guestAcc;
            const withUsedAu = { ...baseAuRe, actions_done: [...(baseAuRe.actions_done ?? []), ...auRe.usedIds] };
            if (isHost) hostAcc = withUsedAu; else guestAcc = withUsedAu;
          }
        }
        if (pendingEntries.length > 0) {
          const turnPlayerId = bs.active_user_id ?? user.id;
          const existingStack = bs.effect_stack ?? null;
          stackAcc = existingStack
            ? pushToStack(existingStack, pendingEntries)
            : initStack(turnPlayerId, pendingEntries);
        } else {
          // インタラクション解決後にキューが空になったスタックをクリア
          const existingStack = bs.effect_stack ?? null;
          if (existingStack && isStackDone(existingStack)) {
            stackAcc = null;
          }
        }

        // 任意COLLABは CHOOSE→INTERNAL_DO_COLLAB の resume でここへ完了するため、
        // resolveStackNext 側の COLLAB 専用ブロックには戻らない。配置札を同じ共通 collector へ載せる。
        const sourceEffect = (effectsMap.get(pe.sourceCardNum) ?? effectsMap.get(getCardNum(pe.sourceCardNum)) ?? [])
          .find(e => e.effectId === pe.effectId);
        if ((sourceEffect?.action as import('../types/effects').StubAction | undefined)?.type === 'STUB'
            && (sourceEffect?.action as import('../types/effects').StubAction).id === 'COLLAB') {
          const collabOnPlayEntries: StackEntry[] = [];
          for (const instanceId of result.lastProcessedCards ?? []) {
            const latestHost = hostAcc;
            const latestGuest = guestAcc;
            const controllerState = pe.sourcePlayerId === bs.host_id ? latestHost : latestGuest;
            const otherState = pe.sourcePlayerId === bs.host_id ? latestGuest : latestHost;
            const controllerBefore = pe.sourcePlayerId === bs.host_id ? bs.host_state : bs.guest_state;
            const collected = pureCollectPlacedSelfOnPlayTriggers(
              mkTrigCtx(), instanceId, controllerState, otherState, pe.sourcePlayerId,
              { placedByEffect: true, sourceIsSigni: false, placedFromZone: detectPlacedFromZone(controllerBefore, instanceId, controllerState) },
            );
            collabOnPlayEntries.push(...collected.entries);
            if (collected.usedHostIds.length > 0) {
              hostAcc = { ...latestHost, actions_done: [...(latestHost.actions_done ?? []), ...collected.usedHostIds] };
            }
            if (collected.usedGuestIds.length > 0) {
              guestAcc = { ...latestGuest, actions_done: [...(latestGuest.actions_done ?? []), ...collected.usedGuestIds] };
            }
          }
          if (collabOnPlayEntries.length > 0) {
            const turnPlayerId = bs.active_user_id ?? user.id;
            const baseStackC = (stackAcc !== undefined ? stackAcc : bs.effect_stack) ?? null;
            stackAcc = baseStackC
              ? pushToStack(baseStackC, collabOnPlayEntries)
              : initStack(turnPlayerId, collabOnPlayEntries);
          }
        }

        if (result.trapActivated) {
          const ta = collectTrapActivateTriggers(pe.sourcePlayerId, hostState, guestState);
          if (ta.entries.length > 0) {
            const turnPlayerId = bs.active_user_id ?? user.id;
            const baseStackTA = (stackAcc !== undefined ? stackAcc : bs.effect_stack) ?? null;
            stackAcc = baseStackTA
              ? pushToStack(baseStackTA, ta.entries)
              : initStack(turnPlayerId, ta.entries);
          }
          if (ta.usedHostIds.length > 0) {
            hostAcc = { ...hostAcc, actions_done: [...(hostAcc.actions_done ?? []), ...ta.usedHostIds] };
          }
          if (ta.usedGuestIds.length > 0) {
            guestAcc = { ...guestAcc, actions_done: [...(guestAcc.actions_done ?? []), ...ta.usedGuestIds] };
          }
        }
        if ((result.trapSetOwners?.length ?? 0) > 0) {
          const ts = pureCollectTrapSetTriggers(mkTrigCtx(), pe.sourcePlayerId, result.trapSetOwners!, hostState, guestState);
          if (ts.entries.length > 0) {
            const turnPlayerId = bs.active_user_id ?? user.id;
            const baseStackTS = (stackAcc !== undefined ? stackAcc : bs.effect_stack) ?? null;
            stackAcc = baseStackTS
              ? pushToStack(baseStackTS, ts.entries)
              : initStack(turnPlayerId, ts.entries);
          }
          if (ts.usedHostIds.length > 0) {
            hostAcc = { ...hostAcc, actions_done: [...(hostAcc.actions_done ?? []), ...ts.usedHostIds] };
          }
          if (ts.usedGuestIds.length > 0) {
            guestAcc = { ...guestAcc, actions_done: [...(guestAcc.actions_done ?? []), ...ts.usedGuestIds] };
          }
        }
      }

      // ON_TARGETED トリガーを（done/not-done どちらの分岐で確定したスタックにも）後乗せで積む。
      if (targetedEntries.length > 0) {
        const turnPlayerId = bs.active_user_id ?? user.id;
        const baseStack = (stackAcc !== undefined ? stackAcc : bs.effect_stack) ?? null;
        stackAcc = baseStack
          ? pushToStack(baseStack, targetedEntries)
          : initStack(turnPlayerId, targetedEntries);
      }
      // 《ターン1回》の消費を watcher 側の actions_done へ書き戻す（他コレクターと同型・続き75）。
      // done 分岐では collectBoardDiffTriggers が両盤面を差し替えているため、累積側の最新 state に後乗せする。
      if (targetedUsedHostIds.length > 0) {
        hostAcc = { ...hostAcc, actions_done: [...(hostAcc.actions_done ?? []), ...targetedUsedHostIds] };
      }
      if (targetedUsedGuestIds.length > 0) {
        guestAcc = { ...guestAcc, actions_done: [...(guestAcc.actions_done ?? []), ...targetedUsedGuestIds] };
      }

      await persist.commit(reduceBattle(bs, {
        type: 'RESOLVE_EFFECT_STEP', hostState: hostAcc, guestState: guestAcc,
        pending: pendingAcc, effectStack: stackAcc,
      }));
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
      const ctx: ExecCtx = { ownerState, otherState, cardMap: declaredCardMap3, logs: [], currentPhase: bs.turn_phase ?? undefined, effectivePowers: ctxPowers, sourceCardNum: pe.sourceCardNum, sourcePlacementPending: !!pe.spellPlacement, trapActivated: pe.trapActivated, trapSetOwners: pe.trapSetOwners, allColorSigniNums, fieldSigniExtraColors, treatAsClassAllZones, deckTrashLevel1Nums };
      fillDeployCaps(ctx); // 配置数制限（CONT版）をctxへ

      ctx.isOwnerTurn = bs.active_user_id === pe.sourcePlayerId;
      let result = resumeSelectZone(zoneIndex, inter, ctx);
      result = applyRefreshOnDone(result, battleCardMap); // デッキ0枚→リフレッシュ
      result = finalizePendingSpellPlacement(result, pe);
      if (result.logs.length > 0) appendBattleLogs(result.logs, { defer: true });

      const hostState  = ownerIsHost ? result.ownerState : result.otherState;
      const guestState = ownerIsHost ? result.otherState : result.ownerState;
      const existingStack = bs.effect_stack ?? null;
      const { respondPlayerId: _dropZ, ...peBaseZ } = pe;
      const srcEff = (effectsMap.get(pe.sourceCardNum) ?? effectsMap.get(getCardNum(pe.sourceCardNum)) ?? [])
        .find(e => e.effectId === pe.effectId);
      // 盤面差分トリガーを先に確定させてから1回書く（旧：update に書いてから host/guest を差し替えていた）
      const bd = collectBoardDiffTriggers(hostState, guestState, {
        causeOwnerId: pe.sourcePlayerId,
        causeSourceCardNum: pe.sourceCardNum,
        fieldTrashCostCards: result.fieldTrashCostCards,
        ...fieldPlacementOnPlayOpts(srcEff),
      });
      await persist.commit(reduceBattle(bs, {
        type: 'RESOLVE_EFFECT_STEP', hostState: bd.hostState, guestState: bd.guestState, settleStackOnDone: true,
        pending: result.done ? null : ({ ...peBaseZ, interaction: result.pending, ...nextRespondPatch(result.pending, pe.sourcePlayerId, bs.host_id, bs.guest_id), ...(result.storedTargetCards ? { storedTargetCards: result.storedTargetCards } : {}) } satisfies PendingEffect),
        effectStack: bd.entries.length > 0
          ? (existingStack && !isStackDone(existingStack)
              ? pushToStack(existingStack, bd.entries)
              : initStack(bs.active_user_id ?? user.id, bd.entries))
          : undefined,
      }));
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
      const ctx: ExecCtx = { ownerState, otherState, cardMap: declaredCardMap5, logs: [], currentPhase: bs.turn_phase ?? undefined, effectivePowers: ctxPowers, sourceCardNum: pe.sourceCardNum, sourcePlacementPending: !!pe.spellPlacement, trapActivated: pe.trapActivated, trapSetOwners: pe.trapSetOwners, allColorSigniNums, fieldSigniExtraColors, treatAsClassAllZones, deckTrashLevel1Nums };
      fillDeployCaps(ctx); // 配置数制限（CONT版）をctxへ

      ctx.isOwnerTurn = bs.active_user_id === pe.sourcePlayerId;
      let result = resumeSelectSigniZone(zoneIndex, inter, ctx);
      result = applyRefreshOnDone(result, battleCardMap); // デッキ0枚→リフレッシュ
      result = finalizePendingSpellPlacement(result, pe);
      if (result.logs.length > 0) appendBattleLogs(result.logs, { defer: true });

      const hostState  = ownerIsHost ? result.ownerState : result.otherState;
      const guestState = ownerIsHost ? result.otherState : result.ownerState;
      const existingStack = bs.effect_stack ?? null;
      const { respondPlayerId: _dropS, ...peBaseS } = pe;
      const srcEff = (effectsMap.get(pe.sourceCardNum) ?? effectsMap.get(getCardNum(pe.sourceCardNum)) ?? [])
        .find(e => e.effectId === pe.effectId);
      // 盤面差分トリガーを先に確定させてから1回書く（旧：update に書いてから host/guest を差し替えていた）
      const bd = collectBoardDiffTriggers(hostState, guestState, {
        causeOwnerId: pe.sourcePlayerId,
        causeSourceCardNum: pe.sourceCardNum,
        fieldTrashCostCards: result.fieldTrashCostCards,
        ...fieldPlacementOnPlayOpts(srcEff),
      });
      await persist.commit(reduceBattle(bs, {
        type: 'RESOLVE_EFFECT_STEP', hostState: bd.hostState, guestState: bd.guestState, settleStackOnDone: true,
        pending: result.done ? null : ({ ...peBaseS, interaction: result.pending, ...nextRespondPatch(result.pending, pe.sourcePlayerId, bs.host_id, bs.guest_id), ...(result.storedTargetCards ? { storedTargetCards: result.storedTargetCards } : {}) } satisfies PendingEffect),
        effectStack: bd.entries.length > 0
          ? (existingStack && !isStackDone(existingStack)
              ? pushToStack(existingStack, bd.entries)
              : initStack(bs.active_user_id ?? user.id, bd.entries))
          : undefined,
      }));
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
      const ctx: ExecCtx = { ownerState, otherState, cardMap: declaredCardMapR, logs: [], currentPhase: bs.turn_phase ?? undefined, sourceCardNum: pe.sourceCardNum, sourcePlacementPending: !!pe.spellPlacement, trapActivated: pe.trapActivated, trapSetOwners: pe.trapSetOwners };
      fillDeployCaps(ctx); // 配置数制限（CONT版）をctxへ
      const targetState = inter.owner === 'opponent' ? otherState : ownerState;
      // rearrange の skip は恒等配置、swap の skip は候補なし（空配列）として解決する。
      const arrangement = buildRearrangeSigniArrangement(newArrangement, inter.mode, targetState.field.signi);
      ctx.isOwnerTurn = bs.active_user_id === pe.sourcePlayerId;
      let result: ExecResult = resumeRearrangeSigni(arrangement, inter, ctx);
      result = applyRefreshOnDone(result, battleCardMap);
      result = finalizePendingSpellPlacement(result, pe);
      if (result.logs.length > 0) appendBattleLogs(result.logs, { defer: true });
      let hostState  = ownerIsHost ? result.ownerState : result.otherState;
      let guestState = ownerIsHost ? result.otherState : result.ownerState;
      const { respondPlayerId: _dropR, ...peBaseR } = pe;
      const existingStack = bs.effect_stack ?? null;
      let rearrangeEntries: StackEntry[] = [];
      // エナ／トラッシュとの交換は「場外から場へ出る」実配置。配置制限は executor、
      // 【出】と盤面差分トリガーは他の効果配置と同じ中央 funnel を通す。
      if (inter.swapSourceLocation === 'energy' || inter.swapSourceLocation === 'trash') {
        const bd = collectBoardDiffTriggers(hostState, guestState, {
          causeOwnerId: pe.sourcePlayerId,
          causeSourceCardNum: pe.sourceCardNum,
          collectPlacedSelfOnPlay: true,
          suppressOnPlay: inter.suppressOnPlay ?? false,
        });
        hostState = bd.hostState;
        guestState = bd.guestState;
        rearrangeEntries = bd.entries;
      }
      setRearrangeSlots([null, null, null]);
      await persist.commit(reduceBattle(bs, {
        type: 'RESOLVE_EFFECT_STEP', hostState, guestState, settleStackOnDone: true,
        pending: result.done ? null : ({ ...peBaseR, interaction: result.pending, ...nextRespondPatch(result.pending, pe.sourcePlayerId, bs.host_id, bs.guest_id), ...(result.storedTargetCards ? { storedTargetCards: result.storedTargetCards } : {}) } satisfies PendingEffect),
        effectStack: rearrangeEntries.length > 0
          ? (existingStack && !isStackDone(existingStack)
              ? pushToStack(existingStack, rearrangeEntries)
              : initStack(bs.active_user_id ?? user.id, rearrangeEntries))
          : undefined,
      }));
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
      const ctx: ExecCtx = { ownerState, otherState, cardMap: declaredCardMap4, logs: [], currentPhase: bs.turn_phase ?? undefined, effectivePowers: ctxPowers, sourceCardNum: pe.sourceCardNum, sourcePlacementPending: !!pe.spellPlacement, trapActivated: pe.trapActivated, trapSetOwners: pe.trapSetOwners, allColorSigniNums, fieldSigniExtraColors, treatAsClassAllZones, deckTrashLevel1Nums };
      fillDeployCaps(ctx); // 配置数制限（CONT版）をctxへ

      ctx.isOwnerTurn = bs.active_user_id === pe.sourcePlayerId;
      let result = resumeSelectVirusZone(zoneIndex, inter, ctx);
      result = applyRefreshOnDone(result, battleCardMap); // デッキ0枚→リフレッシュ
      result = finalizePendingSpellPlacement(result, pe);
      if (result.logs.length > 0) appendBattleLogs(result.logs, { defer: true });

      const hostState  = ownerIsHost ? result.ownerState : result.otherState;
      const guestState = ownerIsHost ? result.otherState : result.ownerState;
      const { respondPlayerId: _dropV, ...peBaseV } = pe;
      await persist.commit(reduceBattle(bs, {
        type: 'RESOLVE_EFFECT_STEP', hostState, guestState, settleStackOnDone: true,
        pending: result.done ? null : ({ ...peBaseV, interaction: result.pending, ...nextRespondPatch(result.pending, pe.sourcePlayerId, bs.host_id, bs.guest_id), ...(result.storedTargetCards ? { storedTargetCards: result.storedTargetCards } : {}) } satisfies PendingEffect),
      }));
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
    opts?: { placedByEffect?: boolean; placeSourceIsSigni?: boolean; placedFromZone?: TriggerOriginZone; placedFromTrash?: boolean },
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
    timing: 'ON_LIFE_CRASHED' | 'ON_GUARD' | 'ON_OPP_SIGNI_ATTACK_NEGATED_BY_EFFECT' | 'ON_OPP_VIRUS_PLACED' | 'ON_OPP_VIRUS_REMOVED' | 'ON_OPP_VIRUS_CHANGED',
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
    byOppEffect?: boolean,
    causeOwnerId?: string,
  ): { entries: StackEntry[]; usedLimitIds: string[] } =>
    pureCollectHandDiscardTriggers(mkTrigCtx(), discardedNums, myState, discarderId, asCost, opState, opId, costSourceNum, byOppEffect, causeOwnerId);

  /**
   * 相手がアーツを使用したとき、ON_OPP_ARTS_USE トリガーを持つ自分のシグニを収集する。
   * activeCondition（HAS_CARD_IN_FIELD 等）を満たす場合のみスタックに追加する。
   */
  // ON_OPP_ARTS_USE 収集（Stage2 で pure 化＝triggerCollect.ts。ここは薄いラッパ）。
  const collectOppArtsUseTriggers = (
    myState: PlayerState,
    opState: PlayerState,
    isMyTurnNow: boolean,
    /** §5.3 `O-113`＝そのアーツの効果を受けた自分のシグニ（未提供＝判定不能で fail-closed）。 */
    affectedOwnSigni?: string[],
  ): { entries: StackEntry[]; usedIds: string[] } =>
    pureCollectOppArtsUseTriggers(mkTrigCtx(), myState, opState, isMyTurnNow, affectedOwnSigni);

  /**
   * 「**あなたが**アーツを使用したとき」（`ON_ARTS_USE`）の収集を**両方の完了地点**から呼ぶための1本
   * （§5.3 `O-131`・`collectOppArtsUseForResolution` の裏返し）。
   * 🔴同じ理由で `resolveStackNext` にしか無く、**対象を取るアーツでは発火しなかった**
   *   （live 9効果＝`WX16-003` / `WXK01-042` / `WXK01-043` / `WXK01-059` / `WXK03-042` /
   *    `WXK05-042` / `WXK10-046` / `WDK03-011` / `WDK03-017`）。
   * ⚠**使用者の client だけが収集する**（`ON_OPP_ARTS_USE` と裏表＝二重押しを防ぐ）。
   */
  const collectArtsUseForResolution = (p: {
    artsOwnerId: string; artsCardNum: string; effectId: string;
    afterHost: PlayerState; afterGuest: PlayerState;
  }): { entries: StackEntry[]; usedIds: string[] } | null => {
    const cardType = battleCardMap.get(p.artsCardNum)?.Type
      ?? battleCardMap.get(getCardNum(p.artsCardNum))?.Type;
    if (cardType !== 'アーツ' || p.effectId === 'DELAYED_TRIGGER' || p.artsOwnerId !== user.id) return null;
    const casterState = isHost ? p.afterHost : p.afterGuest;
    const casterOpState = isHost ? p.afterGuest : p.afterHost;
    return collectArtsUseTriggers(
      user.id, casterState, casterOpState, bs.active_user_id === user.id, p.artsCardNum);
  };

  /**
   * 「対戦相手がアーツを使用したとき」（`ON_OPP_ARTS_USE`）の収集を**両方の完了地点**から呼ぶための1本
   * （§5.3 `O-131`）。
   *
   * 🔴**抽出前は `resolveStackNext` の `result.done` 分岐にしか無かった。**
   *   `selectOrInteract` は**候補が1件でも必ず中断する**（自動適用しない）ので、
   *   **対象を取るアーツは `handleEffectInteraction` 側で完了する**＝そちらには収集が無く、
   *   `ON_OPP_ARTS_USE` を持つ live 6効果（`WX05-020` / `WX13-044` / `WX16-003` /
   *   `WX18-035` / `WXK03-071` / `WXK11-019`）は**実機で一度も発火していなかった**。
   *
   * @param artsOwnerId そのアーツ（スタックエントリ／pending）の持ち主
   * @param artsCardNum 同じくカード番号（`Type === 'アーツ'` の判定に使う。⚠**素の CardNum**）
   * @param effectId    `DELAYED_TRIGGER`（設置型の発火）を除くための id
   * @param beforeMine  アーツ解決**前**の自分の状態（「効果を受けたか」の差分の基準）
   * @param afterHost/afterGuest 解決後の両状態
   */
  const collectOppArtsUseForResolution = (p: {
    artsOwnerId: string; artsCardNum: string; effectId: string;
    beforeMine: PlayerState; afterHost: PlayerState; afterGuest: PlayerState;
    autoTargetedCards?: string[];
  }): { entries: StackEntry[]; usedIds: string[]; iAmHost: boolean } | null => {
    const cardType = battleCardMap.get(p.artsCardNum)?.Type
      ?? battleCardMap.get(getCardNum(p.artsCardNum))?.Type;
    // ⚠遅延トリガー（`INSTALL_DELAYED_TRIGGER` の発火）は「使用した」瞬間ではないので除く。
    if (cardType !== 'アーツ' || p.effectId === 'DELAYED_TRIGGER' || p.artsOwnerId === user.id) return null;
    const iAmHost = isHost;
    const myStateForTrigger = iAmHost ? p.afterHost : p.afterGuest;
    const opStateForTrigger = iAmHost ? p.afterGuest : p.afterHost;
    const affectedOwnSigni = collectOppArtsAffectedOwnSigni(
      p.beforeMine, myStateForTrigger, p.autoTargetedCards ?? []);
    const collected = collectOppArtsUseTriggers(
      myStateForTrigger, opStateForTrigger, bs.active_user_id === user.id, affectedOwnSigni);
    return { ...collected, iAmHost };
  };

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
  const handleSummonSigni = async (
    handIndex: number,
    zoneIndex: number,
    resona?: { candidate: ResonaSummonCandidate; selection: ResonaPaymentSelection },
  ) => {
    console.log('[handleSummonSigni] called', { handIndex, zoneIndex, isMyTurn, loading });
    const resonaAttackResponse = !!resona && bs.turn_phase === 'ATTACK_ARTS_OP' && !isMyTurn;
    const resonaSpellCutin = !!resona && !!bs.pending_spell
      && bs.pending_spell.caster_id !== user.id
      && resona.candidate.appearance.timings.includes('SPELL_CUTIN');
    if ((!isMyTurn && !resonaAttackResponse && !resonaSpellCutin) || loading) return;
    const summonCardNum = resona?.candidate.cardNum ?? my.hand[handIndex];
    if (!summonCardNum) return;
    const summonPlacedFromZone: TriggerOriginZone = resona ? 'lrig_deck' : 'hand';
    const summonCardData = battleCardMap.get(summonCardNum);
    const riseFilter = resona ? null : (summonCardData ? getRiseFilter(summonCardData.EffectText ?? '') : null);
    const existingZoneStack = my.field.signi[zoneIndex] ?? [];
    // ライズ条件チェック
    if (riseFilter) {
      // ライズシグニ: 空きゾーンには出せない、条件不一致ゾーンにも出せない
      const existingTop = existingZoneStack.at(-1);
      if (!existingTop) return; // 空きゾーン不可
      const existingTopNum = getCardNum(existingTop);
      if (!matchesRiseFilter(existingTopNum, riseFilter, battleCardMap)) return;
    } else {
      // 通常シグニは空きゾーンへ。レゾナだけは、出現条件で同時にトラッシュへ置くゾーンを召喚先にできる。
      const paidDestination = resona?.selection.items?.some(i => i.zone === 'field' && i.index === zoneIndex);
      if (existingZoneStack.length > 0 && !paidDestination) return;
    }
    if (isActionBlocked('PLAY_COLORLESS') && summonCardData?.Color === '無') return;
    // OPP_ZONE_PLACEMENT_RESTRICT: 相手が中央ゾーン(index=1)にLv3+配置不可
    const czRestrict = collectCenterZoneDeployRestrict(op, my, battleCardMap, effectsMap, !isMyTurn);
    if (czRestrict !== undefined && zoneIndex === 1) {
      const cardLvCZ = parseInt(summonCardData?.Level ?? '0') || 0;
      if (cardLvCZ >= czRestrict) return;
    }
    // DEPLOY_RESTRICT（配置パワー制限／配置数制限）は `engine/deployLimit.ts` に一本化する
    // （通常召喚UI・召喚ゾーンモーダル・CPU召喚・engine の効果配置が同じ関数を呼ぶ。
    //  旧実装は engine 側だけ判定が無く、効果配置がすべてすり抜けていた＝続き405）。
    // ライズ（既存シグニへの上乗せ）は「新たに場に出す」ではないので対象外。
    {
      const paidFieldCount = resona
        ? (resona.selection.items ?? []).filter(i => i.zone === 'field').length
        : 0;
      const blockedDeploy = deployLimitBlockReason({
        placingState: my, opponentState: op, cardNum: summonCardNum,
        cardMap: battleCardMap, effectsMap, isPlacingOwnerTurn: isMyTurn,
        onExistingStack: !!riseFilter || existingZoneStack.length > 0,
        fieldCountAdjust: paidFieldCount,
        placementSource: 'normal_summon',
      });
      if (blockedDeploy) return;
    }
    // FORCE_PLACE_FRONT: 相手の該当シグニの正面に配置を強制（正面が空いている場合のみ）。ライズは上乗せのため対象外。
    if (!riseFilter) {
      const forcedFront = collectForcePlaceFrontZones(op, my, battleCardMap, effectsMap, !isMyTurn);
      if (forcedFront.size > 0 && !forcedFront.has(zoneIndex)) return;
    }
    // BLOCK_OPP_ZONE_PLACEMENT / REMOVE_SIGNI_ZONE（タスク12(lxi) 第10波）: 「新たに配置できない」ゾーン。
    // 《無》×N の支払い回避つきならエナから徴収して通す（不足なら不成立＝ガード追加《無》と同じ作法）。
    // ライズは既存シグニへの上乗せ＝「新たに配置」ではないので対象外。
    const zoneBlockPay = riseFilter ? null : resolveSigniZonePlacement(my, zoneIndex);
    if (zoneBlockPay && !zoneBlockPay.allowed) return;
    // SELF_PLAY_RESTRICT（自身出撃制限・Opusタスク12(xlix)）: このカード自身の【常】出撃条件を満たさなければ通常召喚不可。
    // never（効果でのみ配置可）＝常に不可。condition あり＝盤面で評価（未満たしなら不可）。未対応語彙は permissive（従来同値）。
    // この時点で summonCardNum はまだ手札にあり my.field に含まれないため「あなたの場に…」は当該カードを除いて評価される（正）。
    if (!canSelfPlay(baseEffectsMap.get(summonCardNum), my, op, battleCardMap)) return;
    // レゾナは表示後にも盤面が変わり得るため、確定時に条件・支払い・ルリグデッキ在籍を再検証する。
    if (resona) {
      const timing = resonaSpellCutin ? 'SPELL_CUTIN' : bs.turn_phase === 'MAIN' ? 'MAIN' : 'ATTACK';
      const current = getResonaSummonCandidate(summonCardNum, my, battleCardMap, effectsMap, timing);
      if (!current) return;
      const paidFieldLevels = (resona.selection.items ?? [])
        .filter(i => i.zone === 'field')
        .reduce((sum, item) => {
          const paidNum = getCardNum(my.field.signi[item.index]?.at(-1) ?? '');
          return sum + (parseInt(battleCardMap.get(paidNum)?.Level ?? '0', 10) || 0);
        }, 0);
      const resonaLevel = parseInt(summonCardData?.Level ?? '0', 10) || 0;
      if (resonaLevel > currentLrigLevel) return;
      if (fieldSigniTotal - paidFieldLevels + resonaLevel > lrigLimit) return;
    }
    setLoading(true);
    setPendingSigniSummon(null);
    setPendingResonaSummon(null);
    try {
      const cardNum = summonCardNum;
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
      const newAcce        = cloneAcceSlots(my.field);
      const newSoul        = [...(my.field.signi_soul    ?? [null, null, null])];
      newSigniDown[zoneIndex]   = false;
      newSigniFrozen[zoneIndex] = false;
      const zoneExtraTrash: string[] = [];
      const zoneExtraLrigTrash: string[] = [];
      // ライズ時: チャームはルール処理でトラッシュへ（アクセもリセット）
      if (newCharms[zoneIndex]) { zoneExtraTrash.push(newCharms[zoneIndex]!); newCharms[zoneIndex] = null; }
      if (newAcce[zoneIndex])   { zoneExtraTrash.push(...newAcce[zoneIndex]!); newAcce[zoneIndex] = null; }
      // ライズで元のトップシグニが下に置かれるカードになると、付いていた【ソウル】はルリグトラッシュへ（ルール処理）
      if (newSoul[zoneIndex])   { zoneExtraLrigTrash.push(newSoul[zoneIndex]!); newSoul[zoneIndex] = null; }
      let placed: PlayerState;
      let summonOpp = op;
      let resonaPaymentMeta: { fieldTrashCostCards: string[]; discardedCostCards: string[] } | null = null;
      if (resona) {
        const paidAndPlaced = payResonaAppearanceAndPlace(
          my, cardNum, resona.candidate.payment, resona.selection, zoneIndex, battleCardMap,
        );
        if (!paidAndPlaced) return;
        placed = paidAndPlaced.state;
        placed = {
          ...placed,
          signi_played_from_non_hand_this_turn: [
            ...(placed.signi_played_from_non_hand_this_turn ?? []).filter(n => n !== cardNum),
            cardNum,
          ],
        };
        resonaPaymentMeta = paidAndPlaced;
      } else {
        placed = {
          ...my,
          signi_played_from_non_hand_this_turn: (my.signi_played_from_non_hand_this_turn ?? []).filter(n => n !== cardNum),
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
      }
      // ゾーン配置禁止の《無》回避コストを徴収する（WXDi-P11-009-E3）。可否は上で確定済みなので
      // ここでは支払いだけを placed へ適用する（レゾナ出現条件の支払い後のエナから取る）。
      if ((zoneBlockPay?.paidColorless ?? 0) > 0) {
        const zbCost = zoneBlockPay!.paidColorless;
        // レゾナ出現条件でエナを使った後は my 時点の残量より減りうるため、支払い直前に再検証する。
        if (placed.energy.length < zbCost) return;
        const zbPaid = placed.energy.slice(-zbCost);
        placed = { ...placed, energy: placed.energy.slice(0, -zbCost), trash: [...placed.trash, ...zbPaid] };
        appendBattleLogs([`シグニゾーン${zoneIndex + 1}への配置コスト《無》×${zbCost}を支払う`]);
      }

      // フィールド上の他のシグニの「他のシグニが出たとき」トリガーを収集
      // 出現条件の支払いも通常の盤面差分収集へ載せる。場コストは fieldTrashCostCards により
      // ON_TRASH の byEffectCause=false を維持し、ON_LEAVE_FIELD も同じ共通経路で収集する。
      const paymentDiff = resonaPaymentMeta
        ? collectBoardDiffTriggers(
          isHost ? placed : bs.host_state,
          isHost ? bs.guest_state : placed,
          {
            causeOwnerId: user.id,
            causeSourceCardNum: cardNum,
            fieldTrashCostCards: resonaPaymentMeta.fieldTrashCostCards,
            resonaConditionCardNum: cardNum,
          },
        )
        : null;
      if (paymentDiff) {
        placed = isHost ? paymentDiff.hostState : paymentDiff.guestState;
        summonOpp = isHost ? paymentDiff.guestState : paymentDiff.hostState;
      }
      const paymentEntries = paymentDiff?.entries ?? [];
      // 手札支払いは中央差分の ON_TRASH に加え、既存の「手札を捨てたとき」経路にも載せる。
      // 出現条件は【出】【起】能力の使用コストではないため asCost=false（ON_DISCARDED_AS_COST は発火させない）。
      const discardRes = resonaPaymentMeta?.discardedCostCards.length
        ? collectHandDiscardTriggers(resonaPaymentMeta.discardedCostCards.map(getCardNum), placed, user.id, false, summonOpp, isHost ? bs.guest_id : bs.host_id, undefined, undefined, undefined)
        : null;
      if (discardRes?.usedLimitIds.length) placed = { ...placed, actions_done: [...(placed.actions_done ?? []), ...discardRes.usedLimitIds] };
      paymentEntries.push(...(discardRes?.entries ?? []));
      const fieldRes = collectFieldTriggers('ON_PLAY', cardNum, placed, summonOpp, user.id, { placedFromZone: summonPlacedFromZone });
      const fieldEntries = fieldRes.entries;
      // usageLimit（《ターン1回/2回》）消費を actions_done へ永続化（自分側＝placed／相手側＝opAfterPlay。続き135）
      const summonUsedMine = isHost ? fieldRes.usedHostIds : fieldRes.usedGuestIds;
      const summonUsedOpp  = isHost ? fieldRes.usedGuestIds : fieldRes.usedHostIds;
      if (summonUsedMine.length > 0) placed = { ...placed, actions_done: [...(placed.actions_done ?? []), ...summonUsedMine] };
      const opAfterPlay: PlayerState | null = summonUsedOpp.length > 0
        ? { ...summonOpp, actions_done: [...(summonOpp.actions_done ?? []), ...summonUsedOpp] }
        : paymentDiff ? summonOpp : null;
      const opKeySummon = isHost ? 'guest_state' : 'host_state';

      // 召喚したカード自身の ON_PLAY 効果
      const ownEffects = effectsMap.get(cardNum) ?? [];
      // §6.3「正面」サブ機構(b): 相手の CONT「このシグニの正面のシグニの【出】能力は発動しない」（WXK11-029-E1）で
      // 【出】を封じられている場合、召喚したシグニ自身の ON_PLAY を一切積まない（正面は engine 共通規約の 2-zi）。
      const frontOnPlayBlocked = collectContinuousAbilitiesRemovedSigni(placed, op, true, effectsMap, battleCardMap, '出').has(cardNum);
      const familyOnPlayBlocked = isSigniOwnOnPlaySuppressed(
        cardNum, placed, summonOpp, isMyTurn, effectsMap, battleCardMap,
      );
      const onPlayBlocked = frontOnPlayBlocked || familyOnPlayBlocked;
      if (onPlayBlocked) appendBattleLogs([`${battleCardMap.get(cardNum)?.CardName ?? cardNum}の【出】能力は発動しない（抑止効果）`]);
      // 手札／ルリグデッキからの召喚は「トラッシュから場に出た」に該当しない。
      const involvesFromTrash = (c?: import('../types/effects').Condition): boolean =>
        !!c && (c.type === 'THIS_CARD_FROM_TRASH' || (c.type === 'AND' && c.conditions.some(involvesFromTrash)));
      const ownOnPlay = (onPlayBlocked ? [] : ownEffects).filter(e =>
        isMandatoryOwnOnPlayForNormalSummon(e, summonPlacedFromZone) &&
        // activeCondition（英知=N等）を満たさない【出】は発火しない
        (!e.activeCondition || checkActiveCondition(e.activeCondition, placed, op, isMyTurn, battleCardMap, cardNum)) &&
        // THIS_CARD_FROM_TRASH 条件のみ収集時に評価（手札召喚では false）
        (!involvesFromTrash(e.condition) || evalUseCondition(e.condition!, placed, op, battleCardMap, cardNum, bs.turn_phase, effectivePowers)),
      );
      // コスト付き任意【出】効果（mandatory: false + cost あり）
      const ownCostOnPlay = (onPlayBlocked ? [] : ownEffects).filter(e =>
        e.effectType === 'AUTO' &&
        e.timing?.includes('ON_PLAY') &&
        (e.triggerScope === undefined || e.triggerScope === 'self') &&
        e.mandatory === false &&
        e.cost &&
        onPlayOriginMatches(e, summonPlacedFromZone) &&
        // 使用条件（《ビートアイコン》[N枚以下]ゲート＝BEAT_CONDITION や「〜の場合にしか使用できない」）を満たさない【出】コスト効果は提示しない
        (!e.condition || evalUseCondition(e.condition, placed, op, battleCardMap, cardNum, bs.turn_phase, effectivePowers)),
      // 「〈盤面条件〉の場合、この能力の発動コストは《X×N》減る」を**提示前に**焼き込む（§6.4 O-35・続き530）。
      ).map(e => applyAbilityCostReduction(e, placed, op, battleCardMap, cardNum, bs.turn_phase, effectivePowers));
      // mandatory:false + cost なしの自身【出】（「〜してもよい」／【出】英知＝N）＝タスク12(xxix)(2)。
      // `ownOnPlay`（mandatory のみ）にも `ownCostOnPlay`（cost ありのみ）にも入らず**丸ごと無発火**だった
      // （旧実装はここで console.warn するだけ）。engine の OPTIONAL_ACTIVATE 包み（「発動しますか？」）へ
      // 変換してスタックへ積む＝支払いモーダルは要らない。
      const optionalNoCostOnPlay = (onPlayBlocked ? [] : ownEffects).filter(e =>
        isOptionalOwnOnPlayForNormalSummon(e, summonPlacedFromZone) && !e.cost &&
        (!e.activeCondition || checkActiveCondition(e.activeCondition, placed, op, isMyTurn, battleCardMap, cardNum)) &&
        (!e.condition || evalUseCondition(e.condition, placed, op, battleCardMap, cardNum, bs.turn_phase, effectivePowers)),
      );

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
      for (const eff of optionalNoCostOnPlay) {
        const wrappedOpt = wrapOptionalOnPlay(eff);
        if (!wrappedOpt) continue;
        ownEntries.push({
          id: generateUUID(),
          playerId: user.id,
          cardNum,
          effectId: eff.effectId,
          label: `${cardName} の【出】効果（任意）`,
          effect: wrappedOpt,
        });
      }

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
          mandatoryEntries: [...ownEntries, ...fieldEntries, ...paymentEntries],
          remainingCostEffects: ownCostOnPlay.slice(1),
          placedZone: zoneIndex,
        });
        return;
      }

      if (ownEntries.length === 0 && fieldEntries.length === 0 && paymentEntries.length === 0) {
        // 効果なし：そのまま保存
        const stateKey = isHost ? 'host_state' : 'guest_state';
        await persist.commit(reduceBattle(bs, {
          type: 'WRITE_STATE', myKey: stateKey, myState: placed,
          opp: opAfterPlay ? { key: opKeySummon, state: opAfterPlay } : undefined,
          markCutinResponseComplete: resonaSpellCutin,
        }));
        return;
      }

      // すべてをスタックに積む
      const allEntries = [...ownEntries, ...fieldEntries, ...paymentEntries];
      const turnPlayerId = bs.active_user_id ?? user.id;
      const existing = bs?.effect_stack ?? null;
      const stack = existing
        ? pushToStack(existing, allEntries)
        : initStack(turnPlayerId, allEntries);

      const stateKey = isHost ? 'host_state' : 'guest_state';
      const summonUpdate = reduceBattle(bs, {
        type: 'WRITE_STATE', myKey: stateKey, myState: placed, effectStack: stack, clearPending: true,
        opp: opAfterPlay ? { key: opKeySummon, state: opAfterPlay } : undefined,
        markCutinResponseComplete: resonaSpellCutin,
      });
      const { error: summonErr } = await persist.commit(summonUpdate);
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

  // グロウ候補＝**判定は `growLogic.listGrowCandidates` 1本**（§8 `O-1` (d)）＝
  // レベル・クラス互換・【グロウ】条件・色制限。CPU の候補フィルタも同じ関数を呼ぶ。
  // ⚠ここにコストの支払い可否は含めない（人間UIは払えない候補もグレーで出す）。
  const growCandidates: CardData[] = listGrowCandidates({ my, cardMap: battleCardMap, effectsMap, freeGrowFilter });

  // ルリグのクラス（制限チェック共通）
  // ⚠「〇〇限定」の使用制限も**実効クラス**で見る（追加で得たルリグタイプを含む・§6.4 O-3）。
  const lrigClass = effectiveLrigClass(my, currentLrig?.CardClass);
  const ignoreRestriction = (my.lrig_gained_types?.includes('__ignore_lrig_restriction__') ?? false) ||
    [my.field.lrig.at(-1), my.field.key_piece].filter(Boolean).some(cn =>
      (effectsMap.get(cn!) ?? []).some(e =>
        e.effectType === 'CONTINUOUS' &&
        (e.action as import('../types/effects').StubAction).type === 'STUB' &&
        (e.action as import('../types/effects').StubAction).id === 'IGNORE_LRIG_RESTRICTION_ARTS'
      )
    );

  // シグニ召喚・表示と効果条件で共有する実効リミット。
  const lrigLimit = computeEffectiveLrigLimit(my, op, battleCardMap, effectsMap, isMyTurn);
  const fieldSigniTopLevels: number[] = my.field.signi.map(stack => {
    if (!stack || stack.length === 0) return 0;
    const top = battleCardMap.get(stack[stack.length - 1]);
    return parseInt(top?.Level ?? '0') || 0;
  });
  const fieldSigniTotal = fieldSigniTopLevels.reduce((s, l) => s + l, 0);


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
    // §6.4 O-10（続き518）＝ピース応答窓。スペル窓とは**候補の出所も打ち消しの意味も違う**ので早期に分岐する。
    if (bs.pending_spell.kind === 'piece') {
      const usedPieceCard = battleCardMap.get(getCardNum(bs.pending_spell.card_num));
      return collectPieceCutinCandidates({
        responder: my, caster: op, usedPieceCard,
        cardMap: battleCardMap, effectsMap, turnPhase: bs.turn_phase ?? undefined,
      }).map(c => ({
        kind: 'effect' as const, card: c.card, instanceId: c.instanceId,
        source: 'lrig_deck' as const, effect: c.effect,
        // ⚠打ち消しは**選択肢①を選んだときだけ**なので、窓を閉じる既定挙動としては打ち消さない。
        countersSpell: false,
      }));
    }
    // GRANT_NEXT_SPELL_UNCOUNTERABLE（WX04-008）は打ち消す従来候補だけを抑止する。
    // SPELL_CUTINレゾナはスペルを打ち消さず先にON_PLAYを解決するため、この窓自体は残す。
    const cutinCasterState = bs.pending_spell.caster_id === bs.host_id ? bs.host_state : bs.guest_state;
    const spellUncounterable = !!cutinCasterState.next_spell_uncounterable;
    const pendingSpellCard = battleCardMap.get(bs.pending_spell.card_num);
    const pendingSpellCostTotal = pendingSpellCard
      ? parseGrowCost(pendingSpellCard.Cost).reduce((s, c) => s + c.count, 0)
      : 0;
    const result: CutinCandidate[] = [];

    // 1. lrig_deck: CSV Timing列に「スペルカットイン」を含むカード
    if (!spellUncounterable) my.lrig_deck
      .filter((id, i, arr) => arr.indexOf(id) === i)
      .forEach(instanceId => {
        const cardNum = getCardNum(instanceId);
        const card = battleCardMap.get(cardNum);
        if (!card || !card.Timing.includes('スペルカットイン')) return;
        if (!meetsRestriction(card.Restriction, lrigClass, ignoreRestriction)) return;
        const effs = effectsMap.get(instanceId) ?? effectsMap.get(cardNum) ?? [];
        const eff = effs.find(e => e.effectType === 'ACTIVATED');
        if (!canUseArtsCondition(effs, my, op, battleCardMap, instanceId, bs.turn_phase, effectivePowers)) return;
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
        // アンチ・スペル・バツの②は、任意支払いを「このカットインを使う」
        // 選択そのものとして扱う。通常のアーツ使用時は manualEffects の CHOOSE を使う。
        if (cardNum === 'WX24-P3-036' && eff?.action.type === 'CHOOSE') {
          const counterChoice = eff.action.choices.find(c => c.action.type === 'SEQUENCE'
            && c.action.steps.some(s => s.type === 'COUNTER_SPELL'));
          if (counterChoice) {
            result.push({
              kind: 'effect',
              card, instanceId, source: 'lrig_deck',
              effect: { ...eff, effectId: `${eff.effectId}-cutin-counter`, action: counterChoice.action },
              additionalColorlessCost: pendingSpellCostTotal,
              countersSpell: true,
            });
          }
          return;
        }
        result.push({ kind: 'effect', card, instanceId, source: 'lrig_deck', effect: dummyEff });
      });

    // 2. lrig_field + key_piece: ACTIVATED効果にSPELL_CUTINタイミングを持つルリグ/キー
    const lrigAndKeyIds = [
      ...new Set(my.field.lrig.filter(Boolean)),
      ...(my.field.key_piece ? [my.field.key_piece] : []),
      ...(my.field.key_piece_extra ?? []),
    ];
    if (!spellUncounterable) lrigAndKeyIds.forEach(instanceId => {
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
      result.push({ kind: 'effect', card, instanceId, source: 'lrig_field', effect: eff });
    });

    // 2b. センタールリグへ**付与**された SPELL_CUTIN の【起】（タスク12(l)）。
    // キーの「あなたのセンタールリグは以下の能力を得る。【起】《スペルカットインアイコン》エクシード１：…」を
    // GRANT_LRIG_ABILITY.abilities へ入れ子にしたため、キーカード自身の effects を走査する 2. では拾えない。
    // 2. と同じガード（uncounterable / underSelfTrash / coin / maxCost / condition）を通す。
    if (!spellUncounterable) {
      const cutinLrigId = my.field.lrig.at(-1);
      const cutinLrigCard = cutinLrigId ? battleCardMap.get(getCardNum(cutinLrigId)) : undefined;
      if (cutinLrigId && cutinLrigCard) {
        for (const eff of grantedMyLrigEffects) {
          if (eff.effectType !== 'ACTIVATED' || !eff.timing?.includes('SPELL_CUTIN')) continue;
          if (eff.cost?.underSelfTrash) continue;
          if (eff.cost?.coin) continue;
          const maxCost = findCounterSpellMaxCost(eff.action);
          if (maxCost !== undefined && pendingSpellCostTotal > maxCost) continue;
          if (eff.condition && !evalUseCondition(eff.condition, my, op, battleCardMap, cutinLrigId, bs.turn_phase, effectivePowers)) continue;
          result.push({ kind: 'effect', card: cutinLrigCard, instanceId: cutinLrigId, source: 'lrig_field', effect: eff });
        }
      }
    }

    // 3. signi_field: ACTIVATED効果にSPELL_CUTINタイミングを持つシグニ
    if (!spellUncounterable) my.field.signi.forEach((zone, zoneIdx) => {
      const topId = zone?.at(-1);
      if (!topId) return;
      const cardNum = getCardNum(topId);
      const card = battleCardMap.get(cardNum);
      if (!card) return;
      const effs = effectsMap.get(topId) ?? effectsMap.get(cardNum) ?? [];
      const eff = effs.find(e => e.effectType === 'ACTIVATED' && e.timing?.includes('SPELL_CUTIN'));
      if (!eff) return;
      if (eff.cost?.underSelfTrash && !canPayUnderSelfTrash(
        my, zoneIdx, eff.cost.underSelfTrash.count, battleCardMap,
        eff.cost.underSelfTrash.filter, eff.cost.underSelfTrash.selectionConstraint,
      )) return;
      const maxCost = findCounterSpellMaxCost(eff.action);
      if (maxCost !== undefined && pendingSpellCostTotal > maxCost) return;
      if (eff.condition && !evalUseCondition(eff.condition, my, op, battleCardMap, topId, bs.turn_phase, effectivePowers)) return;
      result.push({ kind: 'effect', card, instanceId: topId, source: 'signi_field', effect: eff, zoneIdx });
    });

    // 4. hand: ACTIVATED効果にSPELL_CUTINタイミングを持つ手札カード
    if (!spellUncounterable) my.hand.forEach((cardNum, handIdx) => {
      const card = battleCardMap.get(cardNum);
      if (!card) return;
      const effs = effectsMap.get(cardNum) ?? [];
      const eff = effs.find(e => e.effectType === 'ACTIVATED' && e.timing?.includes('SPELL_CUTIN'));
      if (!eff) return;
      const maxCost = findCounterSpellMaxCost(eff.action);
      if (maxCost !== undefined && pendingSpellCostTotal > maxCost) return;
      if (eff.condition && !evalUseCondition(eff.condition, my, op, battleCardMap, cardNum, bs.turn_phase, effectivePowers)) return;
      result.push({ kind: 'effect', card, instanceId: cardNum, source: 'hand', effect: eff, handIdx });
    });

    for (const resona of getSpellCutinResonaCandidates(my, battleCardMap, effectsMap)) {
      const card = battleCardMap.get(getCardNum(resona.cardNum));
      if (card) result.push({ kind: 'resona', card, instanceId: resona.cardNum, source: 'lrig_deck', resona });
    }

    return result;
  })();

  /**
   * センターグロウの実行（人間・CPU 共通）。DESIGN §4「CPU は対人戦と同じ処理を使う」の抽出形＝
   * `performArts` / `performSpell` / `performLrigActivated` と同じく **owner をパラメータ化**し、
   * 人間用 `executeGrow` は薄いラッパーにする（§8 `O-1` (d)）。
   *
   * ⚠**「どのルリグへグロウできるか」の判定はここではなく `growLogic.listGrowCandidates`**。
   * ⚠`onCostOnPlay`＝コスト付き任意【出】の扱い。`'prompt'`（人間）は支払いモーダルを開き、
   *   `'auto'`（CPU）は**コインだけで払えるものを自動で払い、それ以外は発動しない**
   *   （CPU にモーダルは出せない＝出すと**人間の画面に相手のモーダルが出る**）。
   */
  const performGrow = async (
    card: CardData,
    costIndices: Set<number>,
    options: {
      instanceId?: string;
      baseState?: PlayerState;
      freeCost?: boolean;
      consumeGrowAction?: boolean;
      extraEntries?: StackEntry[];
      opponentState?: PlayerState;
    } = {},
    p: {
      actor: PlayerState; opponent: PlayerState;
      actorId: string; opponentId: string;
      actorKey: 'host_state' | 'guest_state';
      /** `actor` がターンプレイヤーか（グロウは必ず自分のターン）。 */
      isActorTurn: boolean;
      /** `buildEnergyPayPool(actor, ...)` の結果（エナ支払い元 funnel）。 */
      energyPayPool: EnergyPayEntry[];
      /** コスト付き任意【出】の扱い（既定＝人間の支払いモーダル）。 */
      onCostOnPlay?: 'prompt' | 'auto';
      /** 既定の `freeCost` 判定（人間UIの `freeGrowFilter`）。CPU は渡さない＝常に通常グロウ。 */
      defaultFreeCost?: boolean;
    },
  ) => {
    const my = p.actor;
    const op = p.opponent;
    const actorIsHost = p.actorKey === 'host_state';
    if (!p.isActorTurn) return;
    setLoading(true);
    const growBase = options.baseState ?? my;
    const growOp = options.opponentState ?? op;
    const wasFreeGrow = options.freeCost ?? (p.defaultFreeCost ?? false);
    const consumeGrowAction = options.consumeGrowAction ?? !wasFreeGrow;
    try {
      const cardNum = card.CardNum;
      const idx = options.instanceId === undefined
        ? growBase.lrig_deck.findIndex(id => getCardNum(id) === cardNum)
        : -1;
      const instanceId = options.instanceId ?? (idx >= 0 ? growBase.lrig_deck[idx] : cardNum);
      const newLrigDeck = idx === -1 ? growBase.lrig_deck
        : [...growBase.lrig_deck.slice(0, idx), ...growBase.lrig_deck.slice(idx + 1)];
      // エナ支払いは funnel 1本（§6.4）。`baseState` 指定時はその state のプールを組む。
      const growPool = growBase === my ? p.energyPayPool : buildEnergyPayPool(growBase, { turnPhase: bs.turn_phase, isMyTurn: p.isActorTurn, effectsMap });
      const growPay = planEnergyPayment(growBase, growPool, costIndices);
      const paidNums = [...growPay.paidNums];
      // GROW_COST_SUBSTITUTE_TRASH_SIGNI: 選択枚数が totalReq-1 なら代替シグニをトラッシュ
      const growSubInfoExec = wasFreeGrow ? null : collectGrowCostSubstitute(growBase, battleCardMap, effectsMap);
      const costItemsExec = parseGrowCost(applyGrowCostReduction(card.GrowCost, collectGrowCostReductions(growBase, growOp, p.isActorTurn, effectsMap, battleCardMap)));
      const totalReqExec = costItemsExec.reduce((s, c) => s + c.count, 0);
      let growSubSigniPaid: string | null = null;
      if (growSubInfoExec && costIndices.size === totalReqExec - 1) {
        const subSigni = growPay.energyAfter.find(cn => {
          const c = battleCardMap.get(cn);
          return c?.Type === 'シグニ' && (c.CardClass ?? '').includes(growSubInfoExec.signiClass);
        });
        if (subSigni) {
          growSubSigniPaid = subSigni;
          paidNums.push(subSigni);
        }
      }
      const coinGain = parseInt(card.Coin) || 0;
      // フリーグロウ（ゲット・グロウ等）はグロウコストのコインを支払わず、通常グロウ枠も消費しない（横グロウ）
      const growCoinCost = wasFreeGrow ? 0 : parseCoinCost(card.GrowCost);
      let newMyState: PlayerState = consumeFreeGrowThisTurn(growPay.applyTo({
        ...growBase,
        lrig_deck: newLrigDeck,
        field: { ...growBase.field, lrig: [...growBase.field.lrig, instanceId] },
        // §6.4 O-10（続き515）＝「このターンにあなたのセンタールリグがグロウしていない場合」の判定材料。
        lrig_grew_this_turn: true,
        trash: [...growBase.trash, ...paidNums],
        actions_done: consumeGrowAction ? [...(growBase.actions_done ?? []), 'GROW'] : (growBase.actions_done ?? []),
        coins: Math.min(5, Math.max(0, growBase.coins - growCoinCost) + coinGain),
        coins_paid_this_turn: (growBase.coins_paid_this_turn ?? 0) + growCoinCost, // COINS_PAID_THIS_TURN（支払いのみ・coinGain は数えない）
      }));
      // 代替シグニ（GROW_COST_SUBSTITUTE_TRASH_SIGNI）はカード番号で除く＝funnel の index 控除のあとに当てる
      if (growSubSigniPaid) {
        newMyState = { ...newMyState, energy: newMyState.energy.filter(cn => cn !== growSubSigniPaid) };
      }
      // グロウ条件の追加効果（ルリグをデッキから下に置く・除外する等）
      const growCond = extractGrowCondition(card.EffectText);
      const { state: afterGrowEffect, log: growEffectLog } = applyGrowEffect(growCond, newMyState, battleCardMap);
      newMyState = afterGrowEffect;
      const stateKey = p.actorKey;
      // LIMIT_ALL_FIELD_N（WX04-005-E3 補足）: グロウ先がこの継続効果を持つなら、各プレイヤーが
      //「自分のシグニを超過分だけ選んでトラッシュに置く」（残り上限体）。スタックに積んで選択させる。
      const grownFieldLimit = computeFieldSigniLimit(newMyState, growOp, effectsMap, getCardNum);
      const opponentId = p.opponentId;
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
        mkLimitEntry(p.actorId, newMyState.field.signi.filter(s => (s ?? []).length > 0).length);
        mkLimitEntry(opponentId, growOp.field.signi.filter(s => (s ?? []).length > 0).length);
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
      const copiedOnPlayEffects = suppressLrigPlay ? [] : collectCopiedLrigAutoEffects(newMyState, battleCardMap, effectsMap, growOp, p.isActorTurn)
        .filter(e => e.timing?.includes('ON_PLAY'));
      const allOnPlayEffects = suppressLrigPlay ? [] : [...ownEffects, ...copiedOnPlayEffects];
      const mandatoryOnPlay = allOnPlayEffects.filter(e =>
        e.effectType === 'AUTO' &&
        e.timing?.includes('ON_PLAY') &&
        e.mandatory !== false &&
        // activeCondition（英知=N等）を満たさない【出】は発火しない
        (!e.activeCondition || checkActiveCondition(e.activeCondition, newMyState, growOp, true, battleCardMap, cardNum)),
      );
      const costOnPlay = allOnPlayEffects.filter(e =>
        e.effectType === 'AUTO' &&
        e.timing?.includes('ON_PLAY') &&
        e.mandatory === false &&
        e.cost,
      // 「〈盤面条件〉の場合、この能力の発動コストは《X×N》減る」を**提示前に**焼き込む（§6.4 O-35・続き530）。
      // ここ1点で削るので、モーダル表示・支払い・可否判定がすべて同じ削減後コストを見る。
      ).map(e => applyAbilityCostReduction(e, newMyState, growOp, battleCardMap, cardNum, bs.turn_phase, effectivePowers));
      const optionalNoCostGrow = collectOptionalNoCostOnPlayForGrow(
        allOnPlayEffects, newMyState, growOp, true, battleCardMap, cardNum, bs.turn_phase, effectivePowers,
      );
      // costUnparsed など、包むとコスト踏み倒しになるものだけは発火させず警告する。
      if (optionalNoCostGrow.deferred.length > 0) {
        console.warn(`[executeGrow] 表現不能コストの任意ON_PLAY効果は発火しません: ${optionalNoCostGrow.deferred.map(e => e.effectId).join(', ')}`);
      }
      if (suppressLrigPlay) appendBattleLogs(['センタールリグの【出】能力は抑制されました']);

      // ON_LRIG_GROW（C1 配線）: センターグロウ実行者（`p.actorId`）のグロウに反応する【自】を収集。
      // any_opp（対戦相手のルリグがグロウ）は非ターンプレイヤー側＝effect_stack の opp 側は
      // buildQueue（effectStack.ts）で `[...turn, ...opp]` の順に並ぶため、グロウ先ルリグ自身の
      // 【出】（ON_PLAY・ターンプレイヤー側）が先に解決され any_opp watcher は後で処理される
      // （2026-07-12・PLAN §7 ON_LRIG_GROW③検証で訂正＝旧コメントは順序を逆に記載していた誤り。
      // golden「Stage2 effectStack initStack: ターンプレイヤー→相手の順でキュー構築」参照）。
      const growTrig = collectLrigGrowTriggers(p.actorId, newMyState, growOp);
      const growTriggerEntries = growTrig.entries;
      // usageLimit（《ターン1回》）消費を actions_done へ永続化（従来は「読むだけ」で書き戻しが無く実質ノーガードだった。続き135）
      const growUsedMine = actorIsHost ? growTrig.usedHostIds : growTrig.usedGuestIds;
      const growUsedOpp  = actorIsHost ? growTrig.usedGuestIds : growTrig.usedHostIds;
      // ON_COIN_GAINED（§6.3 J-5）: グロウでルリグの Coin 欄ぶんコインを得た場合。**この経路は効果解決の
      // 中央 diff を通らない**ので、既存 ON_COIN_PAID がここでコスト支払いを拾っているのと同じ場所で獲得も拾う。
      // ⚠実増加は上限5のクランプ後（「5枚持ちでグロウしても得ていない」が正しい）。支払いはこの差から除く。
      const coinsAfterGrowPay = Math.max(0, growBase.coins - growCoinCost);
      const growCoinGainActual = Math.min(5, coinsAfterGrowPay + coinGain) - coinsAfterGrowPay;
      const growCoinGainMine = growCoinGainActual > 0
        ? collectCoinGainedTriggers(p.actorId, newMyState, growOp, growCoinGainActual, 0)
        : { entries: [] as StackEntry[], usedOncePerTurnIds: [] as string[] };
      const growCoinGainOpp = growCoinGainActual > 0
        ? collectCoinGainedTriggers(p.opponentId, growOp, newMyState, 0, growCoinGainActual)
        : { entries: [] as StackEntry[], usedOncePerTurnIds: [] as string[] };
      const growCoinGainedEntries = [...growCoinGainMine.entries, ...growCoinGainOpp.entries];
      if (growUsedMine.length > 0 || growCoinGainMine.usedOncePerTurnIds.length > 0) {
        newMyState = { ...newMyState, actions_done: [...(newMyState.actions_done ?? []), ...growUsedMine, ...growCoinGainMine.usedOncePerTurnIds] };
      }
      const growOppUsedAll = [...growUsedOpp, ...growCoinGainOpp.usedOncePerTurnIds];
      const opAfterGrow: PlayerState | null = growOppUsedAll.length > 0
        ? { ...growOp, actions_done: [...(growOp.actions_done ?? []), ...growOppUsedAll] }
        : (growOp !== op ? growOp : null);
      const opKeyGrow: PlayerStateKey = actorIsHost ? 'guest_state' : 'host_state';
      // ON_COIN_PAID（C1 配線・グロウコストのコイン支払）: グロウコストでコインを支払った場合に反応【自】を積む。
      const growCoin = growCoinCost > 0 ? collectCoinPaidTriggers(p.actorId, newMyState, growOp) : { entries: [] as StackEntry[], usedIds: [] as string[] };
      const growCoinPaidEntries = growCoin.entries;
      newMyState = applyCoinPaidUsed(newMyState, growCoin); // 《ターン1回/2回》消化を actions_done に永続化


      // ⚠CPU（`onCostOnPlay:'auto'`）は**モーダルを出せない**（出すと人間の画面に相手のモーダルが出る）＝
      //   **コインだけで払えるものは自動で払って発動し、それ以外は発動しない**。
      //   これは CPU 手書きグロウ（続き552d で削除）の挙動をそのまま移したもの。
      const autoPaidOnPlay: import('../types/effects').CardEffect[] = [];
      if (p.onCostOnPlay === 'auto') {
        for (const eff of costOnPlay) {
          const coinOnly = !!eff.cost?.coin && !eff.cost.energy && !eff.cost.discard;
          if (!coinOnly || (newMyState.coins ?? 0) < eff.cost!.coin!) continue;
          newMyState = {
            ...newMyState,
            coins: (newMyState.coins ?? 0) - eff.cost!.coin!,
            coins_paid_this_turn: (newMyState.coins_paid_this_turn ?? 0) + eff.cost!.coin!,
          };
          appendBattleLogs([`《コイン》×${eff.cost!.coin}を支払って【出】効果を発動`]);
          autoPaidOnPlay.push(eff);
        }
        costOnPlay.length = 0;
      }

      // コスト付き任意【出】効果があればモーダルで確認（複数あれば1効果ずつ連鎖）
      if (costOnPlay.length > 0) {
        const mandatoryEntries: StackEntry[] = [
          ...(options.extraEntries ?? []),
          ...fieldLimitEntries,
          ...growTriggerEntries,
          ...growCoinPaidEntries,
          ...growCoinGainedEntries,
          ...mandatoryOnPlay.map(eff => ({
            id: generateUUID(), playerId: p.actorId, cardNum,
            effectId: eff.effectId, label: `${cardName} の【出】効果`, effect: eff,
          })),
          ...optionalNoCostGrow.effects.map(eff => ({
            id: generateUUID(), playerId: p.actorId, cardNum,
            effectId: eff.effectId, label: `${cardName} の【出】効果（任意）`, effect: eff,
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
        ...(options.extraEntries ?? []),
        ...fieldLimitEntries,
        ...growTriggerEntries,
        ...growCoinPaidEntries,
        ...growCoinGainedEntries,
        ...autoPaidOnPlay.map(eff => ({
          id: generateUUID(), playerId: p.actorId, cardNum,
          effectId: eff.effectId, label: `${cardName} の【出】効果`, effect: eff,
        })),
        ...mandatoryOnPlay.map(eff => ({
          id: generateUUID(), playerId: p.actorId, cardNum,
          effectId: eff.effectId, label: `${cardName} の【出】効果`, effect: eff,
        })),
        ...optionalNoCostGrow.effects.map(eff => ({
          id: generateUUID(), playerId: p.actorId, cardNum,
          effectId: eff.effectId, label: `${cardName} の【出】効果（任意）`, effect: eff,
        })),
      ];
      if (entries.length === 0) {
        await persist.commit(reduceBattle(bs, { type: 'WRITE_STATE', myKey: stateKey, myState: newMyState, opp: opAfterGrow ? { key: opKeyGrow, state: opAfterGrow } : undefined }));
        return;
      }
      const turnPlayerId = bs.active_user_id ?? p.actorId;
      const existing = bs?.effect_stack ?? null;
      const stack = existing ? pushToStack(existing, entries) : initStack(turnPlayerId, entries);
      await persist.commit(reduceBattle(bs, { type: 'WRITE_STATE', myKey: stateKey, myState: newMyState, effectStack: stack, clearPending: true, opp: opAfterGrow ? { key: opKeyGrow, state: opAfterGrow } : undefined }));
    } finally {
      setLoading(false);
    }
  };

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
      defaultFreeCost: freeGrowFilter !== null,
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
      const removedSigniNums: string[] = [];
      for (const zi of selectedRemoveZones) {
        const stack = my.field.signi[zi] ?? [];
        const top = stack.at(-1);
        if (top) removedSigniNums.push(top);
        newTrash = [...newTrash, ...stack];
        newSigni[zi] = null;
      }
      const newMyState: PlayerState = clearEndOfAttackEffects({
        ...my,
        field: { ...my.field, signi: newSigni },
        trash: newTrash,
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

  /**
   * アーツ使用の実行（人間・CPU 共通）。DESIGN §4「CPU は対人戦と同じ処理を使う」の抽出形＝
   * `performSigniActivated` / `performSigniAttack` と同じく **owner をパラメータ化**し、
   * 人間用 `executeArts` は薄いラッパーにする（§8 `O-1`）。
   *
   * ⚠**「いま使えるか」の判定はここではなく `artsUseGate.checkArtsUse`**（提示と支払いは別の地点）。
   * ここに残す3ゲートは**実行入口の再検算**＝UI を迂回する経路（カットイン等）から素通りさせないため。
   */
  const performArts = async (
    card: CardData,
    sel: {
      costIndices: Set<number>;
      betCoins?: number;
      encore?: boolean;
      discardIndices?: Set<number>;
      useKeySub?: boolean;
      boosting?: boolean;
      useCostPayKeys?: Set<string>;
    },
    p: {
      actor: PlayerState; opponent: PlayerState;
      actorId: string;
      actorKey: 'host_state' | 'guest_state';
      /** `actor` がターンプレイヤーか（相手ターンのアーツ軽減の消費判定に要る）。 */
      isActorTurn: boolean;
      /** `buildEnergyPayPool(actor, ...)` の結果（エナ支払い元 funnel）。 */
      energyPayPool: EnergyPayEntry[];
      /** `collectEnergyTrashSubstituteInfo(actor, ...)` の結果（キー代替払い）。 */
      energyTrashSubInfo: { wildcardInstIds: Set<string>; colorOverrideMap: Map<string, string>; keySubInstId: string | null };
      /** `calcContinuousBlockedActions(actor, ...).forSelf`。 */
      blockedSelf: Set<string>;
      /** §5.3 `O-117`＝支払ったエナの色記録（`paidEnergyColorsOf`）に要る。スペル経路の `p` と同じ2値。 */
      enaAllMulti: boolean;
      enaMultiStripped: boolean;
      effectivePowers?: Map<string, number>;
    },
  ) => {
    const my = p.actor;
    const op = p.opponent;
    const actorIsHost = p.actorKey === 'host_state';
    const costIndices = sel.costIndices;
    const betCoins = sel.betCoins ?? 0;
    const encore = sel.encore ?? false;
    const discardIndices = sel.discardIndices ?? new Set<number>();
    const useKeySub = sel.useKeySub ?? false;
    const boosting = sel.boosting ?? false;
    const useCostPayKeys = sel.useCostPayKeys ?? new Set<string>();
    if (isArtsUseBlockedFor(my, p.blockedSelf)) return;
    // ⚠実行入口にも同じゲートを置く（UI 側だけだと別経路＝カットイン等から素通りする・§6.4 O-3）
    if (cardNameUseBlocked(my, card.CardName, card.Type)) return;
    if (!canUseArtsCondition(
      effectsMap.get(card.CardNum) ?? [], my, op, battleCardMap, card.CardNum, bs.turn_phase, p.effectivePowers)) return;
    setLoading(true);
    try {
      const cardNum = card.CardNum;
      const idx = my.lrig_deck.findIndex(id => getCardNum(id) === cardNum);
      const instanceId = idx >= 0 ? my.lrig_deck[idx] : cardNum;
      const newLrigDeck = idx === -1 ? my.lrig_deck
        : [...my.lrig_deck.slice(0, idx), ...my.lrig_deck.slice(idx + 1)];
      const artsPay = planEnergyPayment(my, p.energyPayPool, costIndices);
      const paidNums = artsPay.paidNums;
      // §5.3 `O-117`＝**アーツ経路は支払ったエナの色を1つも記録していなかった**（スペル経路だけが
      // 記録していた）＝`WX05-016`「このアーツの使用コストで《白》《赤》《青》《緑》《黒》すべてが
      // 支払われている場合」の**判定材料そのものが存在しなかった**。
      // ⚠式は `paidEnergyColorsOf` の1本（スペル側と同じ関数）。
      const artsPaidEnergyColors = paidEnergyColorsOf(
        paidNums, battleCards, my.keyword_grants, p.enaAllMulti, p.enaMultiStripped);
      // §6.4 O-10（続き510）＝いま軽減に使った「1回きり」の宣言（`WXK03-071-E1`）を後で失効させる。
      // ⚠**コスト計算と同じ収集関数**を使う（別の条件で数え直すと「軽減はされたのに能力は残る」ズレになる）。
      const oppTurnArtsReductionIds = collectOppTurnArtsCostReductions(
        my, op, p.isActorTurn, battleCardMap, effectsMap).map(r => r.effectId);
      // 使用時の任意支払いによるコスト軽減（タスク12(lxxxv)）＝支払い元が手札なら
      // 既存の discard と**同じ index 空間**でまとめて消す（別々に消すと index がずれる）。
      const useCostSpec = parseUseTimeCostReduction(card.EffectText ?? '');
      const useCostHandIdx = useCostSpec?.source === 'hand'
        ? [...useCostPayKeys].filter(k => k.startsWith('h:')).map(k => parseInt(k.slice(2))) : [];
      const discardIdxAll = new Set([...discardIndices, ...useCostHandIdx]);
      const discardNums = [...discardIdxAll].map(i => my.hand[i]).filter(Boolean);
      const newHand = my.hand.filter((_, i) => !discardIdxAll.has(i));
      // ベット消費コインは UI で選んだ枚数（betCoins）。アンコールとの合算可否は UI でガード済み
      const betCost = Math.max(0, betCoins);
      const encoreCoinCost = encore ? (parseEncoreCost(card.EffectText ?? '')?.coins ?? 0) : 0;
      // キーピース代替（ENERGY_SUBSTITUTE_TRASH_KEY）
      const keySub = useKeySub && p.energyTrashSubInfo.keySubInstId;
      const lrigTrashBase = encore ? my.lrig_trash : [...my.lrig_trash, instanceId];
      const paid: PlayerState = artsPay.applyTo({
        ...my,
        lrig_deck: encore
          ? [instanceId, ...newLrigDeck]    // アンコール：ルリグデッキ先頭に戻す
          : newLrigDeck,
        hand: newHand,
        lrig_trash: keySub ? [...lrigTrashBase, p.energyTrashSubInfo.keySubInstId!] : lrigTrashBase,
        trash: [...my.trash, ...paidNums, ...discardNums],
        coins: Math.max(0, my.coins - betCost - encoreCoinCost),
        coins_paid_this_turn: (my.coins_paid_this_turn ?? 0) + betCost + encoreCoinCost, // COINS_PAID_THIS_TURN
        field: keySub ? { ...my.field, key_piece: null } : my.field,
        turn_hand_discarded_count: discardNums.length > 0
          ? (my.turn_hand_discarded_count ?? 0) + discardNums.length : my.turn_hand_discarded_count,
        actions_done: [...(my.actions_done ?? []), 'USE_ARTS', ...((betCost > 0 || encoreCoinCost > 0) ? ['COIN_SPENT'] : [])],
        // 【チェイン】の「次に使用するアーツ」軽減を消費（タスク12(xciii)。スペル版と同型）。
        // ⚠このアーツ自身が新しい【チェイン】を宣言する場合は効果解決（COST_REDUCTION）が
        //   このあと走って積み直すので、ここで消しても次の1枚ぶんは残る。
        next_arts_cost_reduction: undefined,
        // §6.4 O-10（続き510）＝「対戦相手のターンにアーツを使用する場合…減り、ターン終了時まで、この能力を失う」
        // （`WXK03-071-E1`）の消費。⚠刻まないと**同じターンに何度でも軽減される**（軽減は回数無制限になる）。
        ...(oppTurnArtsReductionIds.length > 0
          ? { lost_ability_effect_ids_this_turn: [...(my.lost_ability_effect_ids_this_turn ?? []), ...oppTurnArtsReductionIds] }
          : {}),
        // このターンにアーツを使用したフラグ（ARTS_USED_THIS_TURN 条件。WX25-P1-106。ターン境界でリセット）
        turn_arts_used: true,
        turn_arts_used_names: [...(my.turn_arts_used_names ?? []), card.CardName],
        // 使用したアーツの色（色別 ARTS_USED_THIS_TURN。WX24-D1-11〜D4-11。ターン境界でリセット）
        turn_arts_used_colors: [...(my.turn_arts_used_colors ?? []), ...((card.Color || '').match(/白|赤|青|緑|黒|無色/g) ?? [])],
        // §5.3 `O-117`＝この使用で支払ったエナの色（`PAID_COLORS_INCLUDE_ALL` が読む）。
        // ⚠支払いのたびに**上書き**する（前の使用の色を持ち越さない＝`last_cost_trashed_cards` と同じ規約）。
        last_paid_energy_colors: artsPaidEnergyColors,
        // BET_CONDITION: ベット宣言フラグ（execStub内でBET_CONDITIONが参照）
        is_betting_this_effect: betCost > 0 ? true : undefined,
        is_boosting_this_effect: boosting ? true : undefined,
        bet_coins_paid: betCost > 0 ? betCost : undefined,
      });
      if (betCost > 0) appendBattleLogs([`ベット：コイン${betCost}枚消費`]);
      if (boosting) appendBattleLogs([`ブースト：追加エナコストを支払い`]);
      if (useCostHandIdx.length > 0) {
        appendBattleLogs([`使用時の任意支払い：手札${useCostHandIdx.length}枚を捨てて使用コストを軽減`]);
      }
      // 手札以外の支払い元（場のシグニをダウン/トラッシュ／ルリグデッキのアーツ／ライフクロス／キー）は
      // 手札 index と衝突しないので支払い済み状態へ重ねる。
      let paidWithUseCost = paid;
      let useCostTrashedSigni: string[] = [];
      if (useCostSpec && useCostSpec.source !== 'hand' && useCostPayKeys.size > 0) {
        if (useCostSpec.source === 'signi_trash') {
          useCostTrashedSigni = [...useCostPayKeys].filter(k => k.startsWith('z:'))
            .map(k => paid.field.signi[parseInt(k.slice(2))]?.at(-1))
            .filter((v): v is string => !!v);
        }
        const up = payUseTimeCost(paid, useCostSpec, useCostPayKeys, battleCardMap);
        paidWithUseCost = up.state;
        if (up.label) appendBattleLogs([up.label]);
      }
      // ON_LEAVE_FIELD / ON_TRASH（タスク12(lxxxix)）＝支払いで自分のシグニが場を離れた場合。
      // `fieldTrashCostCards` に載せる＝コスト支払いなので byEffectCause=false。
      // 収集したエントリはアーツ効果と同じスタックへ（queueCardEffects の extraEntries）。
      let useCostLeaveEntries: StackEntry[] = [];
      if (useCostTrashedSigni.length > 0) {
        const afterHostAr = actorIsHost ? paidWithUseCost : op;
        const afterGuestAr = actorIsHost ? op : paidWithUseCost;
        const bdAr = collectBoardDiffTriggers(afterHostAr, afterGuestAr, {
          causeOwnerId: p.actorId, causeSourceCardNum: instanceId,
          fieldTrashCostCards: useCostTrashedSigni,
        });
        paidWithUseCost = actorIsHost ? bdAr.hostState : bdAr.guestState;
        useCostLeaveEntries = bdAr.entries;
      }
      if (encore) appendBattleLogs([`アンコール：${card.CardName}をルリグデッキに戻す`]);
      // ON_COIN_PAID（C1 配線・アーツのベット/アンコールのコイン支払）: extraEntries 経由で反応【自】を積む。
      const artsCoin = (betCost + encoreCoinCost) > 0 ? collectCoinPaidTriggers(p.actorId, paidWithUseCost, op) : { entries: [] as StackEntry[], usedIds: [] as string[] };
      const artsCoinPaidEntries = artsCoin.entries;
      // ON_MATERIAL_USED（改造素材機構 Step3a）: 《改造素材》使用時に「あなたが使用したとき」(materialUsedByPlayer)変種を発火。
      // ⚠「このシグニに/他の味方に使用されたとき」(self/any_ally・対象シグニ依存)は Step2（トークン3択の対象捕捉）が前提＝別途。
      let materialUsedEntries: StackEntry[] = [];
      let paidAfterMaterial = applyCoinPaidUsed(paidWithUseCost, artsCoin); // ON_COIN_PAID の《ターン1回/2回》消化を永続化（続き106）
      if (card.CardName === '改造素材') {
        const mu = collectMaterialUsedByPlayerTriggers(p.actorId, paidAfterMaterial);
        materialUsedEntries = mu.entries;
        if (mu.usedOncePerTurnIds.length > 0) {
          paidAfterMaterial = { ...paidAfterMaterial, actions_done: [...(paidAfterMaterial.actions_done ?? []), ...mu.usedOncePerTurnIds] };
        }
      }
      // アーツ効果を発火
      const fired = await queueCardEffects(instanceId, ['ACTIVATED'], [], paidAfterMaterial, op, undefined, 1,
        [...artsCoinPaidEntries, ...materialUsedEntries, ...useCostLeaveEntries],
        { id: p.actorId, key: p.actorKey });
      if (!fired) {
        await persist.commit(reduceBattle(bs, { type: 'WRITE_STATE', myKey: p.actorKey, myState: paidAfterMaterial }));
      }
      setCloseZoneSignal(s => s + 1);
    } finally {
      setLoading(false);
    }
  };

  /** 人間UI（`ArtsModal` / ルリグデッキのカード詳細）から呼ぶ薄いラッパー。本体は `performArts`。 */
  const executeArts = async (card: CardData, costIndices: Set<number>, betCoins: number = 0, encore: boolean = false, discardIndices: Set<number> = new Set(), useKeySub = false, boosting = false, useCostPayKeys: Set<string> = new Set()) => {
    if (loading) return;
    closeArtsModal();
    setKeySubstituteEnabled(false);
    await performArts(card, { costIndices, betCoins, encore, discardIndices, useKeySub, boosting, useCostPayKeys }, {
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

  // ── キーピース使用 ──
  const executeKeyPiece = async (card: CardData, costIndices: Set<number>) => {
    if (loading) return;
    if (!canUseArtsCondition(
      effectsMap.get(card.CardNum) ?? [], my, op, battleCardMap, card.CardNum, bs.turn_phase, effectivePowers,
    )) return;

    // WXDi-P13-003A is a piece whose resolution turns the same physical instance into
    // a LRIG. Build the entire payment/flip state first, then let executeGrow perform
    // the single commit and the normal ON_PLAY/ON_LRIG_GROW collection.
    if (card.CardNum === MAYU_ENCOUNTER_A) {
      const idx = my.lrig_deck.findIndex(id => getCardNum(id) === MAYU_ENCOUNTER_A);
      if (idx < 0) return;
      const instanceId = my.lrig_deck[idx];
      const placed: PlayerState = {
        ...my,
        lrig_deck: [...my.lrig_deck.slice(0, idx), ...my.lrig_deck.slice(idx + 1)],
        field: { ...my.field, key_piece: instanceId },
      };
      const prep = prepareMayuEncounter(placed);
      if (!prep) return;
      closeKeyModal();

      const afterHost = isHost ? prep.state : bs.host_state;
      const afterGuest = isHost ? bs.guest_state : prep.state;
      const bd = collectBoardDiffTriggers(afterHost, afterGuest, {
        causeOwnerId: user.id,
        causeSourceCardNum: instanceId,
      });
      let preparedMine = isHost ? bd.hostState : bd.guestState;
      const preparedOpp = isHost ? bd.guestState : bd.hostState;
      const handDiscard = prep.movedFromHand.length > 0
        ? collectHandDiscardTriggers(
            prep.movedFromHand.map(getCardNum), preparedMine, user.id, false,
            preparedOpp, isHost ? bs.guest_id : bs.host_id,
            undefined, undefined, user.id,
          )
        : { entries: [] as StackEntry[], usedLimitIds: [] as string[] };
      if (handDiscard.usedLimitIds.length > 0) {
        preparedMine = {
          ...preparedMine,
          actions_done: [...(preparedMine.actions_done ?? []), ...handDiscard.usedLimitIds],
        };
      }
      const movementEntries = [...bd.entries, ...handDiscard.entries];

      // Fewer than five cards still pays the stated price, but does not flip/grow.
      if (!prep.canGrow) {
        setLoading(true);
        try {
          const stateKey = isHost ? 'host_state' : 'guest_state';
          const opKey = isHost ? 'guest_state' : 'host_state';
          const stack = movementEntries.length > 0
            ? (bs.effect_stack
                ? pushToStack(bs.effect_stack, movementEntries)
                : initStack(bs.active_user_id ?? user.id, movementEntries))
            : undefined;
          await persist.commit(reduceBattle(bs, {
            type: 'WRITE_STATE',
            myKey: stateKey,
            myState: preparedMine,
            opp: preparedOpp !== op ? { key: opKey, state: preparedOpp } : undefined,
            ...(stack ? { effectStack: stack } : {}),
          }));
        } finally {
          setLoading(false);
        }
        return;
      }

      const mayu = battleCardMap.get(MAYU_ENCOUNTER_B);
      if (!mayu) return;
      await executeGrow(mayu, new Set(), {
        instanceId: prep.instanceId,
        baseState: preparedMine,
        opponentState: preparedOpp,
        freeCost: true,
        consumeGrowAction: true,
        extraEntries: movementEntries,
      });
      return;
    }

    setLoading(true);
    closeKeyModal();
    try {
      const cardNum = card.CardNum;
      const idx = my.lrig_deck.findIndex(id => getCardNum(id) === cardNum);
      const instanceId = idx >= 0 ? my.lrig_deck[idx] : cardNum;
      const newLrigDeck = idx === -1 ? my.lrig_deck
        : [...my.lrig_deck.slice(0, idx), ...my.lrig_deck.slice(idx + 1)];
      const keyPay = planEnergyPayment(my, myEnergyPayPool, costIndices);
      const paidNums = keyPay.paidNums;
      const coinCost = parseCoinCost(card.Cost) + parseCoinCost(card.GrowCost);
      const hasUnlimitedKeysEKP = my.field.lrig.some(ln =>
        (effectsMap.get(ln) ?? []).some(e =>
          e.effectType === 'CONTINUOUS' &&
          (e.action as import('../types/effects').StubAction)?.type === 'STUB' &&
          (e.action as import('../types/effects').StubAction)?.id === 'UNLIMITED_KEYS',
        )
      );
      // 🔴**ピースはキーではない**（§3 (cxxiii)・続き475g）。
      //   ルール上ピースは「**使用**＝コストを1回払って効果を解決し、ルリグトラッシュへ置く」もので、
      //   キーゾーンを占有しない。従来は キー と同じ経路で **①印刷 Cost を徴収 ②`key_piece` へ置き
      //   ③`AUTO`/`ON_PLAY` しか積まない** だったため、**118枚（Type='ピース' 119枚中）が
      //   `ACTIVATED`＋印刷 Cost 同額の `cost.energy` を持つのに効果が一切走らず**、
      //   KEY スロットの【起】から起動して**同額をもう一度**払う羽目になっていた（＝二重請求）。
      //   ⚠**分岐は `card.Type === 'ピース'` だけ**＝キー側は1行も変えない（共通経路の事故を構造的に避ける）。
      const isPiece = card.Type === 'ピース';
      const newField = isPiece
        ? my.field                                     // ピースはキーゾーンを占有しない
        : (hasUnlimitedKeysEKP && my.field.key_piece)
          ? { ...my.field, key_piece_extra: [...(my.field.key_piece_extra ?? []), instanceId] }
          : { ...my.field, key_piece: instanceId };
      // 「このゲームの間、あなたのセンタールリグは『…』を得る」型（`WXDi-P15-003-E2`＝CONTINUOUS
      // `GRANT_LRIG_ABILITY`）は、**カードがキーゾーンに居ることで読まれていた**。ルリグトラッシュへ送ると
      // 失効するので、**解決時に付与ストアへ載せ替える**（engine の `GRANT_LRIG_ABILITY` 実行と同じ形）。
      // ⚠`duration:'PERMANENT'` のときだけ `permanentGrant` を刻む＝ターン境界リセットで残す条件。
      const pieceContGrants = isPiece
        ? (effectsMap.get(instanceId) ?? []).filter(e =>
            e.effectType === 'CONTINUOUS'
            && (e.action as { type?: string })?.type === 'GRANT_LRIG_ABILITY')
        : [];
      const pieceGrantedAbilities = pieceContGrants.flatMap(e => {
        const abilities = (e.action as unknown as import('../types/effects').GrantLrigAbilityAction).abilities ?? [];
        return e.duration === 'PERMANENT' ? abilities.map(ab => ({ ...ab, permanentGrant: true })) : abilities;
      });
      const paid: PlayerState = keyPay.applyTo({
        ...my,
        lrig_deck: newLrigDeck,
        field: newField,
        // ピースは解決後ルリグトラッシュへ（キーは場に残るので触らない）。
        lrig_trash: isPiece ? [...my.lrig_trash, instanceId] : my.lrig_trash,
        ...(pieceGrantedAbilities.length > 0
          ? { lrig_granted_auto_effects: [...(my.lrig_granted_auto_effects ?? []), ...pieceGrantedAbilities] }
          : {}),
        trash: [...my.trash, ...paidNums],
        coins: Math.max(0, my.coins - coinCost),
        coins_paid_this_turn: (my.coins_paid_this_turn ?? 0) + coinCost, // COINS_PAID_THIS_TURN
      });
      // ON_COIN_PAID（C1 配線・キープレイのコイン支払）: extraEntries 経由で反応【自】を積む。
      const keyCoin = coinCost > 0 ? collectCoinPaidTriggers(user.id, paid, op) : { entries: [] as StackEntry[], usedIds: [] as string[] };
      const keyCoinPaidEntries = keyCoin.entries;
      const paidWithCoin = applyCoinPaidUsed(paid, keyCoin); // 《ターン1回/2回》消化を永続化（続き106）
      // ⚠**ピースは `ACTIVATED` も積む**＝118枚の本体がここに入っている。`queueCardEffects` は
      //   `effect.cost` を**徴収しない**（コスト徴収は UI 経路の担当）ので、印刷 Cost の1回払いだけになる。
      // §6.4 O-10（続き518）＝ピース使用への**カットイン応答窓**。
      // 🔑**応答側に使える打ち消しピースが実在するときだけ**窓を開く＝候補0なら以降は従来と同じ即時解決。
      //   （ピースを使うたびに待ち状態を挟むと、応答が来ない経路がそのままデッドロックになる）。
      const pieceCutins = isPiece
        ? collectPieceCutinCandidates({
            responder: op, caster: paidWithCoin, usedPieceCard: card,
            cardMap: battleCardMap, effectsMap, turnPhase: bs.turn_phase ?? undefined,
          })
        : [];
      if (isPiece && pieceCutins.length > 0) {
        const stateKeyPC = isHost ? 'host_state' : 'guest_state';
        const oppKeyPC = isHost ? 'guest_state' : 'host_state';
        appendBattleLogs([`${card.CardName}の使用にカットインできる（相手の応答待ち）`]);
        await persist.commit(reduceBattle(bs, {
          type: 'QUEUE_SPELL',
          casterKey: stateKeyPC,
          casterState: paidWithCoin,
          other: { key: oppKeyPC, state: { ...op, team_piece_cutin_window: true } },
          spell: { caster_id: user.id, card_num: instanceId, kind: 'piece' },
        }));
        setCloseZoneSignal(sig => sig + 1);
        return;
      }
      const fired = isPiece
        ? await queueCardEffects(instanceId, ['AUTO', 'ACTIVATED'],
            ['ON_PLAY', 'MAIN', 'ATTACK', 'SPELL_CUTIN'], paidWithCoin, op, undefined, 1, keyCoinPaidEntries)
        : await queueCardEffects(instanceId, ['AUTO'], ['ON_PLAY'], paidWithCoin, op, undefined, 1, keyCoinPaidEntries);
      if (!fired) {
        const stateKey = isHost ? 'host_state' : 'guest_state';
        await persist.commit(reduceBattle(bs, { type: 'WRITE_STATE', myKey: stateKey, myState: paidWithCoin }));
      }
      setCloseZoneSignal(s => s + 1);
    } finally {
      setLoading(false);
    }
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
  const executeKeyActivated = async (cardNum: string, effect: import('../types/effects').CardEffect, costIndices: Set<number>, discardIndices: Set<number> = new Set()) => {
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
      let paid: PlayerState = keyActPay.applyTo({
        ...my,
        hand: newHand,
        field: newField,
        lrig_trash: newLrigTrashKey,
        trash: [...my.trash, ...paidNums, ...discardNums, ...keyDiscardAllCards, ...keyEnergyTrashAllCards],
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
      const assistGrowPay = planEnergyPayment(my, myEnergyPayPool, costIndices);
      const paidNums = assistGrowPay.paidNums;
      const sideKey = side === 'l' ? 'assist_lrig_l' : 'assist_lrig_r';
      const currentStack = (side === 'l' ? my.field.assist_lrig_l : my.field.assist_lrig_r) ?? [];
      const assistCoinGain = parseInt(card.Coin) || 0;
      const newMyState: PlayerState = assistGrowPay.applyTo({
        ...my,
        lrig_deck: newLrigDeck,
        field: { ...my.field, [sideKey]: [...currentStack, instanceId] },
        trash: [...my.trash, ...paidNums],
        coins: Math.min(5, my.coins + assistCoinGain),
      });
      const stateKey = isHost ? 'host_state' : 'guest_state';
      // 通常手順で配置したアシストルリグの【出】を共通 collector へ載せる。
      // 任意コスト/任意発動・条件・使用制限・【出】封じを効果配置経路と同じ規則で扱う。
      const assistOnPlay = pureCollectAssistOnPlayTriggers(
        mkTrigCtx(), instanceId, newMyState, op, user.id,
      );
      const usedIds = isHost ? assistOnPlay.usedHostIds : assistOnPlay.usedGuestIds;
      // ON_COIN_GAINED（§6.3 J-5）: アシストルリグ配置で Coin 欄ぶんコインを得た場合。中央 diff を通らない獲得サイト。
      // ⚠上限5のクランプ後の実増加で判定する（アシストは支払いにコインを使わないので単純差でよい）。
      const assistCoinGainActual = Math.min(5, my.coins + assistCoinGain) - my.coins;
      const assistCoinMine = assistCoinGainActual > 0
        ? collectCoinGainedTriggers(user.id, newMyState, op, assistCoinGainActual, 0)
        : { entries: [] as StackEntry[], usedOncePerTurnIds: [] as string[] };
      const assistCoinOpp = assistCoinGainActual > 0
        ? collectCoinGainedTriggers(isHost ? bs.guest_id : bs.host_id, op, newMyState, 0, assistCoinGainActual)
        : { entries: [] as StackEntry[], usedOncePerTurnIds: [] as string[] };
      const assistAllEntries = [...assistOnPlay.entries, ...assistCoinMine.entries, ...assistCoinOpp.entries];
      const committedMyState = (usedIds.length > 0 || assistCoinMine.usedOncePerTurnIds.length > 0)
        ? { ...newMyState, actions_done: [...(newMyState.actions_done ?? []), ...usedIds, ...assistCoinMine.usedOncePerTurnIds] }
        : newMyState;
      const assistOppState: PlayerState | null = assistCoinOpp.usedOncePerTurnIds.length > 0
        ? { ...op, actions_done: [...(op.actions_done ?? []), ...assistCoinOpp.usedOncePerTurnIds] }
        : null;
      const assistOppKey = isHost ? 'guest_state' : 'host_state';
      if (assistAllEntries.length > 0) {
        const existing = bs?.effect_stack ?? null;
        const stack = existing ? pushToStack(existing, assistAllEntries) : initStack(bs?.active_user_id ?? user.id, assistAllEntries);
        await persist.commit(reduceBattle(bs, { type: 'WRITE_STATE', myKey: stateKey, myState: committedMyState, effectStack: stack, opp: assistOppState ? { key: assistOppKey, state: assistOppState } : undefined }));
      } else {
        await persist.commit(reduceBattle(bs, { type: 'WRITE_STATE', myKey: stateKey, myState: committedMyState, opp: assistOppState ? { key: assistOppKey, state: assistOppState } : undefined }));
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
      const assistActPay = planEnergyPayment(my, myEnergyPayPool, costIndices);
      const paidNums = assistActPay.paidNums;
      const discardNums = [...discardIndices].map(i => my.hand[i]);
      const newHand = my.hand.filter((_, i) => !discardIndices.has(i));
      let paid: PlayerState = assistActPay.applyTo({
        ...my,
        hand: newHand,
        trash: [...my.trash, ...paidNums, ...discardNums],
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

  // スペル発動: 手札から除いてコスト支払い → pending_spell をセット（カットイン待ち）
  // fromLrigDeck=true のとき: ルリグデッキから除いてpending_spell.from_lrig_deck=trueをセット（フェゾーネマジック）
  // discardIndices＝使用時の任意支払い（「手札から青と黒の＜電機＞を1枚ずつ捨ててもよい」＝WX21-035/WX21-071）で
  // 選んだ手札 index。支払うと使用コストが置換される（検証は SpellCastModal 側＝executeArts と同じ規約）。
  /**
   * スペル使用の実行（人間・CPU 共通）。DESIGN §4「CPU は対人戦と同じ処理を使う」の抽出形＝
   * `performArts` / `performSigniActivated` と同じく **owner をパラメータ化**し、
   * 人間用 `castSpell` は薄いラッパーにする（§8 `O-1` (b)）。
   *
   * ⚠**「いま発動できるか」の判定はここではなく `spellUseGate.checkSpellUse`**。
   * ここに残すゲートは**実行入口の再検算**（UI を迂回する経路から素通りさせないため）。
   */
  const performSpell = async (
    card: CardData,
    sel: {
      costIndices: Set<number>;
      handIdx: number;
      fromLrigDeck?: boolean;
      betCoins?: number;
      virusRemovalByZone?: number[];
      discardIndices?: Set<number>;
      useCostPayKeys?: Set<string>;
    },
    p: {
      actor: PlayerState; opponent: PlayerState;
      actorId: string;
      actorKey: 'host_state' | 'guest_state';
      /** `actor` がターンプレイヤーか。 */
      isActorTurn: boolean;
      /** `buildEnergyPayPool(actor, ...)` の結果（エナ支払い元 funnel）。 */
      energyPayPool: EnergyPayEntry[];
      /** `calcContinuousBlockedActions(actor, ...).forSelf`。 */
      blockedSelf: Set<string>;
      /** 支払ったエナの色記録（`WX04-063`）に要る＝`ArtsPayerCtx` の同名フィールド。 */
      enaAllMulti: boolean;
      enaMultiStripped: boolean;
    },
  ) => {
    const my = p.actor;
    const op = p.opponent;
    const actorIsHost = p.actorKey === 'host_state';
    const { costIndices, handIdx } = sel;
    const fromLrigDeck = sel.fromLrigDeck;
    const betCoins = sel.betCoins ?? 0;
    const virusRemovalByZone = sel.virusRemovalByZone;
    const discardIndices = sel.discardIndices ?? new Set<number>();
    const useCostPayKeys = sel.useCostPayKeys ?? new Set<string>();
    if (!p.isActorTurn) return;
    // §6.4 O-18（続き513）＝3軸を `isSpellUseBlockedFor` に集約（ボタン生成側と同じ関数を見る）。
    if (isSpellUseBlockedFor(my, p.blockedSelf, card)) return;
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
    try {
      const spellPay = planEnergyPayment(my, p.energyPayPool, costIndices);
      const paidNums = spellPay.paidNums;
      // 支払ったエナ1枚ごとの色配列（`WX04-063`「支払われたエナの色」＋ §5.3 `O-117` の
      // `PAID_COLORS_INCLUDE_ALL` が参照）。⚠**式は `paidEnergyColorsOf` の1本**＝アーツ経路と割らない。
      const paidEnergyColors = paidEnergyColorsOf(
        paidNums, battleCards, my.keyword_grants, p.enaAllMulti, p.enaMultiStripped);
      // 使用時の任意支払いで捨てる手札（コスト置換の対価）。使用したスペル自身の index は含めない。
      // タスク12(lxxxv) の「軽減」も支払い元が手札なら**同じ index 空間**で消す（別々に消すと index がずれる）。
      const useCostSpec = parseUseTimeCostReduction(card.EffectText ?? '');
      const useCostHandIdx = useCostSpec?.source === 'hand'
        ? [...useCostPayKeys].filter(k => k.startsWith('h:')).map(k => parseInt(k.slice(2))) : [];
      const discardIdxAll = [...new Set([...discardIndices, ...useCostHandIdx])].filter(i => i !== handIdx);
      const discardNums = discardIdxAll.map(i => my.hand[i]).filter(Boolean);
      const discardSet = new Set(discardIdxAll);
      // ベット：UIで選んだコイン枚数を支払う（所持を超えない）。is_betting_this_effect は handleCutinPass の効果解決まで持続
      const betCost = Math.min(Math.max(0, betCoins), my.coins);
      const isMeltFact = card.CardNum === 'WX15-067';
      const currentOppVirus = op.field.signi_virus ?? [0, 0, 0];
      const requestedVirus = isMeltFact ? (virusRemovalByZone ?? [0, 0, 0]) : [0, 0, 0];
      const validVirusSelection = requestedVirus.every((n, i) =>
        Number.isInteger(n) && n >= 0 && n <= (currentOppVirus[i] ?? 0));
      if (!validVirusSelection) return;
      const removedVirusCount = requestedVirus.reduce((sum, n) => sum + n, 0);
      const newOpState: PlayerState = removedVirusCount > 0 ? {
        ...op,
        field: {
          ...op.field,
          signi_virus: currentOppVirus.map((n, i) => n - (requestedVirus[i] ?? 0)),
        },
      } : op;
      let spellInstanceId: string;
      let newMyState: PlayerState;
      if (fromLrigDeck) {
        // フェゾーネマジック: lrig_deckから除いてゲームから除外先へ（使用後はlrig_trashへ近似）
        spellInstanceId = my.lrig_deck.find(id => {
          const base = id.indexOf('#') > 0 ? id.slice(0, id.indexOf('#')) : id;
          return base === card.CardNum;
        }) ?? card.CardNum;
        newMyState = spellPay.applyTo({
          ...my,
          lrig_deck: my.lrig_deck.filter(id => id !== spellInstanceId),
          hand: my.hand.filter((_, i) => !discardSet.has(i)),
          trash: [...my.trash, ...paidNums, ...discardNums],
          turn_hand_discarded_count: discardNums.length > 0
            ? (my.turn_hand_discarded_count ?? 0) + discardNums.length : my.turn_hand_discarded_count,
          actions_done: [...(my.actions_done ?? []), 'USE_SPELL', ...(betCost > 0 ? ['COIN_SPENT'] : [])],
          next_spell_cost_reduction: undefined, // 次スペルコスト軽減を消費（WX04-008）
          ...(card.Story !== 'Dissona' ? { non_dissona_spell_played_this_turn: true } : {}),
          coins: Math.max(0, my.coins - betCost),
          coins_paid_this_turn: (my.coins_paid_this_turn ?? 0) + betCost, // COINS_PAID_THIS_TURN
          is_betting_this_effect: betCost > 0 ? true : undefined, // 非ベット時は明示的にクリア（前回ベットの持ち越し防止）
          bet_coins_paid: betCost > 0 ? betCost : undefined,
        });
      } else {
        spellInstanceId = my.hand[handIdx] ?? card.CardNum;
        newMyState = spellPay.applyTo({
          ...my,
          hand: my.hand.filter((_, i) => i !== handIdx && !discardSet.has(i)),
          trash: [...my.trash, ...paidNums, ...discardNums],
          turn_hand_discarded_count: discardNums.length > 0
            ? (my.turn_hand_discarded_count ?? 0) + discardNums.length : my.turn_hand_discarded_count,
          actions_done: [...(my.actions_done ?? []), 'USE_SPELL', ...(betCost > 0 ? ['COIN_SPENT'] : [])],
          next_spell_cost_reduction: undefined, // 次スペルコスト軽減を消費（WX04-008）
          ...(card.Story !== 'Dissona' ? { non_dissona_spell_played_this_turn: true } : {}),
          coins: Math.max(0, my.coins - betCost),
          coins_paid_this_turn: (my.coins_paid_this_turn ?? 0) + betCost, // COINS_PAID_THIS_TURN
          is_betting_this_effect: betCost > 0 ? true : undefined, // 非ベット時は明示的にクリア（前回ベットの持ち越し防止）
          bet_coins_paid: betCost > 0 ? betCost : undefined,
        });
      }
      // 相手ウィルスを実際に取り除いたら ON_OPP_VIRUS_REMOVED / ON_OPP_VIRUS_CHANGED の
      // 監視フラグを立てる（既存のウィルス除去サイト＝execStubPart1 の6箇所と同じ規約。
      // 立てないと WD19-009 / WX21-045 / WX21-068 / WX21-030 のトリガーが落ちる）。
      if (removedVirusCount > 0) newMyState = { ...newMyState, opp_virus_removed_just: true };
      // 使用時の任意支払い（軽減）＝手札以外の支払い元は手札 index と衝突しないので最終状態へ重ねる。
      let useCostTrashedSigni: string[] = [];
      if (useCostSpec && useCostSpec.source !== 'hand' && useCostPayKeys.size > 0) {
        // 場のシグニ払い（タスク12(lxxxix)）は、離場トリガーの照合用に**支払い前**の在席カードを控える。
        if (useCostSpec.source === 'signi_trash') {
          useCostTrashedSigni = [...useCostPayKeys].filter(k => k.startsWith('z:'))
            .map(k => newMyState.field.signi[parseInt(k.slice(2))]?.at(-1))
            .filter((v): v is string => !!v);
        }
        const paidUse = payUseTimeCost(newMyState, useCostSpec, useCostPayKeys, battleCardMap);
        newMyState = paidUse.state;
        if (paidUse.label) appendBattleLogs([paidUse.label]);
      } else if (useCostSpec && useCostHandIdx.length > 0) {
        appendBattleLogs([`使用時の任意支払い：手札${useCostHandIdx.length}枚を捨てて使用コストを軽減`]);
      }
      if (betCost > 0) appendBattleLogs([`ベット：コイン${betCost}枚消費`]);
      if (discardNums.length > 0) {
        appendBattleLogs([`使用時の任意支払い：${discardNums.map(n => battleCardMap.get(n)?.CardName ?? n).join('・')}を捨てて使用コストを置換`]);
      }
      // ON_COIN_PAID（C1 配線・**スペル本体のベット**＝タスク12(lxxxvi)）。
      // 他のコイン支払いサイト（グロウ人間/CPU・シグニ【起】【出】・キープレイ・アーツ ベット/アンコール・
      // カットインのベット）は収集済みで、ここだけが「コインは払うのに反応【自】を積まない」穴だった。
      // 対象＝ベット持ちスペル7枚（`WXDi-P07-059` ほか）。
      const spellCoin = betCost > 0
        ? collectCoinPaidTriggers(p.actorId, newMyState, newOpState)
        : { entries: [] as StackEntry[], usedIds: [] as string[] };
      newMyState = applyCoinPaidUsed(newMyState, spellCoin); // 《ターン1回/2回》消化を永続化
      const stateKey = p.actorKey;
      const spell: PendingSpell = {
        caster_id: p.actorId,
        card_num: spellInstanceId,
        paid_energy_colors: paidEnergyColors,
        ...(removedVirusCount > 0 ? { pre_use_virus_removed: removedVirusCount } : {}),
        ...(fromLrigDeck ? { from_lrig_deck: true } : {}),
      };
      // 使用時の支払いで積んだトリガーを1本のスタックにまとめる＝
      //   ①ベットのコイン支払い（`ON_COIN_PAID`・タスク12(lxxxvi)）
      //   ②場のシグニ払いの離場/トラッシュ（`ON_LEAVE_FIELD`/`ON_TRASH`・タスク12(lxxxix)）。
      // ②は中央 diff へ **fieldTrashCostCards** として渡す＝コストによる支払いなので byEffectCause=false
      // （＝「効果によってトラッシュに置かれたとき」には該当しない）。
      // ⚠pending_spell 待ちの間にスタックが載るが、カットイン応答の継続もCPU行動も
      //   `if (bs.effect_stack …) return;` で待つので「支払い→トリガー解決→カットイン→スペル解決」の順になる。
      const spellUseCostEntries: StackEntry[] = [...spellCoin.entries];
      if (useCostTrashedSigni.length > 0) {
        const afterHostSp = actorIsHost ? newMyState : newOpState;
        const afterGuestSp = actorIsHost ? newOpState : newMyState;
        const bdSp = collectBoardDiffTriggers(afterHostSp, afterGuestSp, {
          causeOwnerId: p.actorId, causeSourceCardNum: spellInstanceId,
          fieldTrashCostCards: useCostTrashedSigni,
        });
        newMyState = actorIsHost ? bdSp.hostState : bdSp.guestState;
        spellUseCostEntries.push(...bdSp.entries);
      }
      const spellUseCostStack: EffectStack | undefined = spellUseCostEntries.length > 0
        ? (bs.effect_stack
          ? pushToStack(bs.effect_stack, spellUseCostEntries)
          : initStack(bs.active_user_id ?? p.actorId, spellUseCostEntries))
        : undefined;
      await persist.commit(reduceBattle(bs, {
        type: 'QUEUE_SPELL',
        casterKey: stateKey,
        casterState: newMyState,
        spell,
        ...(removedVirusCount > 0 ? { other: { key: actorIsHost ? 'guest_state' : 'host_state', state: newOpState } } : {}),
        ...(spellUseCostStack ? { effectStack: spellUseCostStack } : {}),
      }));
    } finally {
      setLoading(false);
    }
  };

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
  /**
   * ピース応答窓を閉じて、使われたピースを解決する（§6.4 O-10・続き518）。
   *
   * ⚠**窓フラグは必ずここで落とす**（残すと「カットイン専用ピースが通常タイミングで撃てる」過剰実行に戻る）。
   * ⚠`countered` のときは**解決せずゲームから除外**する（原文「打ち消されたピースはゲームから除外される」）。
   * ⚠使う側の state は既に支払い済みで DB にある＝ここでは**現在の bs から読み直す**（再徴収しない）。
   */
  const resolvePendingPiece = async () => {
    const ps = bs.pending_spell;
    if (!ps || ps.kind !== 'piece') return;
    const casterIsHost = ps.caster_id === bs.host_id;
    const casterKey: PlayerStateKey = casterIsHost ? 'host_state' : 'guest_state';
    const oppKey: PlayerStateKey = casterIsHost ? 'guest_state' : 'host_state';
    const casterState = casterIsHost ? bs.host_state : bs.guest_state;
    const oppState = casterIsHost ? bs.guest_state : bs.host_state;
    const pieceName = battleCardMap.get(getCardNum(ps.card_num))?.CardName ?? ps.card_num;
    // 応答側の窓フラグを落とす（＝この1点が「窓を閉じる」の定義）。
    const oppClosed: PlayerState = closeTeamPieceCutinWindow(oppState);
    // 打ち消されたか＝`COUNTER_TEAM_PIECE_AND_EXILE` が使った側に立てたフラグ（⚠読んだら落とす）。
    if (casterState.piece_use_countered) {
      // 打ち消し＝ルリグトラッシュへ置いた自分自身を**除外**へ移す。
      const casterExiled: PlayerState = {
        ...casterState,
        piece_use_countered: undefined,
        lrig_trash: casterState.lrig_trash.filter(n => n !== ps.card_num),
        excluded: [...(casterState.excluded ?? []), ps.card_num],
      };
      appendBattleLogs([`${pieceName}の効果は打ち消され、ゲームから除外された`]);
      await persist.commit(reduceBattle(bs, {
        type: 'FINISH_SPELL', casterKey, casterState: casterExiled,
        other: { key: oppKey, state: oppClosed },
      }));
      return;
    }
    // パス＝通常どおり解決する（ピースは AUTO/ACTIVATED を積む＝`executeArts` のピース枝と同じ形）。
    await persist.commit(reduceBattle(bs, {
      type: 'FINISH_SPELL', casterKey, casterState,
      other: { key: oppKey, state: oppClosed },
    }));
    // ⚠**効果の持ち主は「ピースを使った側」**＝応答側のクライアントから解決するので `owner` を明示する
    //   （省略すると自分の state へ書いてしまう。スペル側の `handleCutinPass` が caster を跨ぐのと同じ形）。
    await queueCardEffects(ps.card_num, ['AUTO', 'ACTIVATED'],
      ['ON_PLAY', 'MAIN', 'ATTACK', 'SPELL_CUTIN'],
      casterState, oppClosed, { key: oppKey, state: oppClosed }, 1, [],
      { id: ps.caster_id, key: casterKey });
  };

  const handleCutinPass = async () => {
    if (!bs.pending_spell || loading) return;
    setLoading(true);
    closeCutin();
    try {
      // §6.4 O-10（続き518）＝ピース応答窓のパス＝**使われたピースをそのまま解決する**
      // （スペルの解決経路 `executeEffect`＋`FINISH_SPELL` とは別物なので先に分岐する）。
      if (bs.pending_spell.kind === 'piece') { await resolvePendingPiece(); return; }
      const { caster_id, card_num, from_lrig_deck } = bs.pending_spell;
      const casterIsHost = caster_id === bs.host_id;
      const casterState = casterIsHost ? bs.host_state : bs.guest_state;
      const nonCasterState = casterIsHost ? bs.guest_state : bs.host_state;
      // 使用後の置き場所: フェゾーネマジック等（ルリグデッキ由来）はゲームから除外＝lrig_trashへ近似、通常スペルはトラッシュへ
      const placeUsedSpell = (s: PlayerState): PlayerState => from_lrig_deck
        ? { ...s, lrig_trash: [...s.lrig_trash, card_num] }
        : { ...s, trash: [...s.trash, card_num] };
      const spellPlacement: UsedCardPlacement = from_lrig_deck ? 'lrig_trash' : 'trash';
      // NEGATE_SPELL: casterStateにspell_negated_this_turnがあればコスト合計5以下のスペルを打ち消す
      // ただし next_spell_uncounterable（WX04-008）があれば打ち消されない
      if (casterState.spell_negated_this_turn && !casterState.next_spell_uncounterable) {
        const spellCard = battleCardMap.get(card_num);
        const spellTotalCostNS = parseGrowCost(spellCard?.Cost ?? '').reduce((s, c) => s + c.count, 0);
        if (spellTotalCostNS <= 5) {
          const spellNameNS = spellCard?.CardName ?? card_num;
          const negatedCasterState = consumeSpellNegationThisTurn(placeUsedSpell(casterState));
          appendBattleLogs([`[スペル打ち消し] ${spellNameNS}（コスト${spellTotalCostNS}）が打ち消された`]);
          await persist.commit(reduceBattle(bs, {
            type: 'FINISH_SPELL',
            casterKey: casterIsHost ? 'host_state' : 'guest_state',
            casterState: negatedCasterState,
            other: { key: casterIsHost ? 'guest_state' : 'host_state', state: nonCasterState },
          }));
          return;
        }
      }

      // 保護スペル（next_spell_uncounterable）はこの解決で消費＝フラグをクリア
      const resolved: PlayerState = { ...casterState, next_spell_uncounterable: undefined };

      // スペル効果を発火（casterがowner）
      const effects = effectsMap.get(card_num) ?? [];
      const spellEff = effects.find(e => e.effectType === 'ACTIVATED');
      if (!spellEff) {
        await persist.commit(reduceBattle(bs, {
          type: 'FINISH_SPELL',
          casterKey: casterIsHost ? 'host_state' : 'guest_state',
          casterState: finalizeUsedCardPlacement(resolved, card_num, spellPlacement),
        }));
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
      const ctx: ExecCtx = { ownerState: resolved, otherState: nonCasterState, cardMap: spellDeclaredCardMap, logs: [], currentPhase: bs.turn_phase ?? undefined, effectivePowers: spellPowers, sourceCardNum: card_num, sourcePlacementPending: true, allColorSigniNums: spellAllColorSigniNums, fieldSigniExtraColors: spellExtraColors, deckTrashLevel1Nums: spellDeckTrashLevel1Nums, paidEnergyColorSets: bs.pending_spell.paid_energy_colors, preUseVirusRemoved: bs.pending_spell.pre_use_virus_removed };
      fillDeployCaps(ctx); // 配置数制限（CONT版）をctxへ
      ctx.isOwnerTurn = spellIsOwnerTurn;
      let result = executeEffect(spellEff, ctx);
      result = applyRefreshOnDone(result, battleCardMap); // デッキ0枚→リフレッシュ（スペル解決後）
      if (result.logs.length > 0) appendBattleLogs(result.logs);
      // ON_SPELL_USE: スペル使用時トリガー（自分ターンのみ）。
      // ルリグ（WX25-P2-034 APEX2「あなたがスペルを使用したとき」）に加え、場のシグニ（WX01-033 幻獣神オサキ
      // 「あなたが緑のスペルを使用したとき」）も走査する。triggerFilter.color があれば使用スペルの色で絞る。
      let casterAfter = result.ownerState;
      if (result.done) casterAfter = finalizeUsedCardPlacement(casterAfter, card_num, spellPlacement);
      const spellUseEntries: StackEntry[] = [];
      if (spellIsOwnerTurn) {
        const usedSpellColor = battleCardMap.get(card_num)?.Color ?? '';
        // 収集元: センタールリグ + 場のシグニ各ゾーンのトップ
        const spellUseSources = [
          casterAfter.field.lrig.at(-1),
          ...casterAfter.field.signi.map(stack => stack?.at(-1)),
        ].filter((n): n is string => !!n);
        const usedIdsSU: string[] = [];
        const spellUseLrigTop = casterAfter.field.lrig.at(-1);
        for (const srcNum of spellUseSources) {
          // センタールリグには付与ストア（effectsMap 非搭載）を合流させる（WXDi-P13-008-E3＝エクシード4で
          // 「【自】あなたが《ディソナアイコン》のスペルを使用したとき…」を得る）。scope は self（主語＝プレイヤー）。
          const srcEffsSU = srcNum === spellUseLrigTop
            ? [...(effectsMap.get(srcNum) ?? []), ...grantedStoreWatchers(casterAfter, 'ON_SPELL_USE', ['self']).map(w => w.effect)]
            : (effectsMap.get(srcNum) ?? []);
          for (const eff of srcEffsSU) {
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
        const oppWatchLrigTop = result.otherState.field.lrig.at(-1);
        for (const srcNum of oppWatchSources) {
          const srcEffsSUOpp = srcNum === oppWatchLrigTop
            ? [...(effectsMap.get(srcNum) ?? []),
               ...grantedStoreWatchers(result.otherState, 'ON_SPELL_USE', ['any_opp', 'any']).map(w => w.effect)]
            : (effectsMap.get(srcNum) ?? []);
          for (const eff of srcEffsSUOpp) {
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
      let hostState  = casterIsHost ? casterAfter : result.otherState;
      let guestState = casterIsHost ? result.otherState : casterAfter;
      // ON_PLAY（any_ally/any・効果配置）: スペル効果で新たに場に出たシグニへの他シグニの反応（G145「他のシグニが効果で場に出たとき」等）。
      // ソースはスペルのため placeSourceIsSigni=false（bySigniEffect は非発火、byEffect は発火）。
      if (result.done) {
        const spellPlaceSourceIsSigni = battleCardMap.get(card_num)?.Type === 'シグニ';
        const selfOnPlayOpts = fieldPlacementOnPlayOpts(spellEff);
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
          const placedFromZone = detectPlacedFromZone(bs.host_state, placedNum, hostState);
          if (selfOnPlayOpts.collectPlacedSelfOnPlay) {
            const self = pureCollectPlacedSelfOnPlayTriggers(mkTrigCtx(), placedNum, hostState, guestState, bs.host_id, {
              placedByEffect: true,
              sourceIsSigni: spellPlaceSourceIsSigni,
              suppressOnPlay: selfOnPlayOpts.suppressOnPlay,
              placedFromZone,
            });
            spellUseEntries.push(...self.entries); useSU(self);
          }
          const ft = collectFieldTriggers('ON_PLAY', placedNum, hostState, guestState, bs.host_id, { placedByEffect: true, placeSourceIsSigni: spellPlaceSourceIsSigni, placedFromZone });
          spellUseEntries.push(...ft.entries); useSU(ft);
        }
        for (const placedNum of detectPlacedSigni(bs.guest_state, guestState)) {
          if (bloomedSetSU.has(placedNum)) continue;
          const placedFromZone = detectPlacedFromZone(bs.guest_state, placedNum, guestState);
          if (selfOnPlayOpts.collectPlacedSelfOnPlay) {
            const self = pureCollectPlacedSelfOnPlayTriggers(mkTrigCtx(), placedNum, guestState, hostState, bs.guest_id, {
              placedByEffect: true,
              sourceIsSigni: spellPlaceSourceIsSigni,
              suppressOnPlay: selfOnPlayOpts.suppressOnPlay,
              placedFromZone,
            });
            spellUseEntries.push(...self.entries); useSU(self);
          }
          const ft = collectFieldTriggers('ON_PLAY', placedNum, guestState, hostState, bs.guest_id, { placedByEffect: true, placeSourceIsSigni: spellPlaceSourceIsSigni, placedFromZone });
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
        // ON_REFRESH: スペルでデッキが0枚になり `applyRefreshOnDone` がリフレッシュした場合（§5.1 `V-91`）。
        // ⚠`hostState`/`guestState` は上の ON_DECK_SHUFFLED 収集で `actions_done` が伸びうるので、
        //   **その後の値**を渡す（before は両方とも `bs.*_state` なので二重に数えない）。
        const rfInlineSU = collectRefreshInline(hostState, guestState);
        if (rfInlineSU.entries.length > 0 || rfInlineSU.hostState !== hostState || rfInlineSU.guestState !== guestState) {
          spellUseEntries.push(...rfInlineSU.entries); hostState = rfInlineSU.hostState; guestState = rfInlineSU.guestState;
        }
      }
      const existingStackSU = bs.effect_stack ?? null;
      await persist.commit(reduceBattle(bs, {
        type: 'RESOLVE_EFFECT_STEP', hostState, guestState, clearPendingSpell: true,
        effectStack: spellUseEntries.length > 0
          ? (existingStackSU ? pushToStack(existingStackSU, spellUseEntries) : initStack(bs.active_user_id ?? user.id, spellUseEntries))
          : undefined,
        pending: result.done ? null : ({ sourcePlayerId: caster_id, sourceCardNum: card_num, effectId: spellEff.effectId, interaction: result.pending, spellPlacement, ...(result.storedTargetCards ? { storedTargetCards: result.storedTargetCards } : {}) } satisfies PendingEffect),
      }));
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
  handleCutinPassRef.current = handleCutinPass;

  // カットイン使用 → カットイン効果発火・スペルをトラッシュ（打ち消し）
  const handleCutinUse = async (candidate: CutinCandidate, costIndices: Set<number>, underTrashKeys: Set<string> = new Set(), betCoins = 0) => {
    if (!bs.pending_spell || loading) return;
    if (candidate.kind !== 'effect') return;
    if (!canUseArtsCondition(
      [candidate.effect], my, op, battleCardMap, candidate.instanceId, bs.turn_phase, effectivePowers)) return;
    setLoading(true);
    closeCutin();
    try {
      const { card: cutinCard, instanceId: cutinInstanceId, source, handIdx } = candidate;
      // §6.4 O-10（続き518）＝ピース応答窓での使用。スペル打ち消しとは処理が別なので先に分岐する。
      // 🔑**ここでは窓を閉じない**＝カットインしたピースの効果を解決し、`cutin_response_complete` を立てて
      //   既存の「応答完了→元の処理を継続」useEffect に `resolvePendingPiece` を呼ばせる
      //   （選択肢②を選んだときは元のピースがそのまま解決する＝原文どおり）。
      if (bs.pending_spell.kind === 'piece') {
        const piecePay = planEnergyPayment(my, myEnergyPayPool, costIndices);
        const lrigIdxPC = my.lrig_deck.findIndex(id => id === cutinInstanceId);
        const newLrigDeckPC = lrigIdxPC === -1 ? my.lrig_deck
          : [...my.lrig_deck.slice(0, lrigIdxPC), ...my.lrig_deck.slice(lrigIdxPC + 1)];
        const paidPC: PlayerState = piecePay.applyTo({
          ...my,
          lrig_deck: newLrigDeckPC,
          lrig_trash: [...my.lrig_trash, cutinInstanceId],
          trash: [...my.trash, ...piecePay.paidNums],
        });
        appendBattleLogs([`[カットイン] ${cutinCard.CardName}を使用`]);
        const stateKeyPC: PlayerStateKey = isHost ? 'host_state' : 'guest_state';
        const completed = await completePieceCutinResponseAfterEffects<BattleStateRow>({
          // 支払いは先に確定するが、この時点では応答完了を公開しない。
          commitPayment: async () => {
            await persist.commit(reduceBattle(bs, {
              type: 'WRITE_STATE', myKey: stateKeyPC, myState: paidPC,
            }));
          },
          queueEffects: async () => {
            await queueCardEffects(cutinInstanceId, ['ACTIVATED'], ['MAIN', 'ATTACK', 'SPELL_CUTIN'], paidPC, op);
          },
          // commit の完了と Realtime の React state 反映は別タイミングなので、古い closure の bs を使わない。
          fetchLatest: async () => {
            const { data, error } = await persist.fetchState();
            if (error) console.error('[handleCutinUse piece] 最新盤面の取得エラー:', error.message);
            return data;
          },
          markComplete: async latest => {
            const latestMyState = stateKeyPC === 'host_state' ? latest.host_state : latest.guest_state;
            await persist.commit(reduceBattle(latest, {
              type: 'WRITE_STATE', myKey: stateKeyPC, myState: latestMyState,
              markCutinResponseComplete: true,
            }));
          },
        });
        if (!completed) console.error('[handleCutinUse piece] 応答完了フラグを書き込めませんでした');
        return;
      }
      const { caster_id, card_num, from_lrig_deck } = bs.pending_spell;
      const casterIsHost = caster_id === bs.host_id;
      const casterState = casterIsHost ? bs.host_state : bs.guest_state;
      // スペルを処理（打ち消し）: フェゾーネマジック等はゲームから除外＝lrig_trashへ近似、通常スペルはトラッシュへ
      const shouldCounterSpell = candidate.countersSpell ?? true;
      const newCasterState: PlayerState = shouldCounterSpell
        ? (from_lrig_deck
        ? { ...casterState, lrig_trash: [...casterState.lrig_trash, card_num] }
        : { ...casterState, trash: [...casterState.trash, card_num] })
        : casterState;
      // コスト支払い（エナ支払い元は funnel 1本＝§6.4）。
      // ⚠この経路だけ `underSelfTrash`（シグニの下からのコスト）と同居しうる。両者が**同じスタック**を
      //   触ると index がずれるので、`UNDER_CARD_AS_ENERGY_COST` と `underSelfTrash` を同じカードが
      //   持たないことを goldenTest でロックしてある（現状 0件）。
      const cutinPay = planEnergyPayment(my, myEnergyPayPool, costIndices);
      const paidNums = cutinPay.paidNums;
      let cutinPaid: PlayerState;
      if (source === 'lrig_deck') {
        // ルリグデッキから使用: デッキから取り出してルリグトラッシュへ
        const lrigIdx = my.lrig_deck.findIndex(id => getCardNum(id) === cutinCard.CardNum);
        const actualId = lrigIdx >= 0 ? my.lrig_deck[lrigIdx] : cutinCard.CardNum;
        const newLrigDeck = lrigIdx === -1 ? my.lrig_deck
          : [...my.lrig_deck.slice(0, lrigIdx), ...my.lrig_deck.slice(lrigIdx + 1)];
        cutinPaid = cutinPay.applyTo({
          ...my,
          lrig_deck: newLrigDeck,
          lrig_trash: [...my.lrig_trash, actualId],
          trash: [...my.trash, ...paidNums],
          turn_arts_used: true,
          turn_arts_used_names: [...(my.turn_arts_used_names ?? []), cutinCard.CardName],
          turn_arts_used_colors: [...(my.turn_arts_used_colors ?? []), ...((cutinCard.Color || '').match(/白|赤|青|緑|黒|無色/g) ?? [])],
        });
      } else if (source === 'hand') {
        // 手札から自分を捨てる（discardSelfFromHand）
        const idx = handIdx ?? my.hand.indexOf(cutinCard.CardNum);
        const newHand = idx >= 0
          ? [...my.hand.slice(0, idx), ...my.hand.slice(idx + 1)]
          : my.hand;
        cutinPaid = cutinPay.applyTo({
          ...my,
          hand: newHand,
          trash: [...my.trash, cutinCard.CardNum, ...paidNums],
        });
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
        cutinPaid = cutinPay.applyTo({
          ...my,
          trash: [...my.trash, ...paidNums],
          lrig_trash: [...my.lrig_trash, ...exceedCards],
          field: {
            ...my.field,
            lrig: my.field.lrig.filter(id => !exceedCards.has(id)),
            assist_lrig_l: my.field.assist_lrig_l?.filter(id => !exceedCards.has(id)),
            assist_lrig_r: my.field.assist_lrig_r?.filter(id => !exceedCards.has(id)),
          },
        });
        if (source === 'signi_field' && candidate.effect.cost?.underSelfTrash) {
          const zoneIdx = candidate.zoneIdx ?? cutinPaid.field.signi.findIndex(stack => stack?.at(-1) === cutinInstanceId);
          const underPaid = payUnderSelfTrash(
            cutinPaid, zoneIdx, underTrashKeys, candidate.effect.cost.underSelfTrash.count, battleCardMap,
            candidate.effect.cost.underSelfTrash.filter, candidate.effect.cost.underSelfTrash.selectionConstraint,
          );
          if (!underPaid) return;
          cutinPaid = {
            ...underPaid.state,
            last_cost_trashed_cards: [...paidNums, ...underPaid.moved],
          };
        }
      }
      // §5.3 `O-117`＝**カットイン窓の支払いもエナの色を記録する**。
      // 🔴**実機（`b21end5colors`）で捕まえた片肺**＝`performArts`（通常のアーツ使用）にだけ記録を足したところ、
      //   カットイン窓は**別の支払いサイト**なので `WX05-016` が 5色払っても条件不成立のままだった。
      //   `WX05-016` は **Timing がスペルカットインだけ**＝**この経路が本番**である。
      // ⚠3つの source 分岐（lrig_deck / hand / lrig_field・signi_field）の**後**で1回だけ当てる
      //   （分岐ごとに書くと必ずどれかが漏れる）。式は `paidEnergyColorsOf` の1本。
      cutinPaid = {
        ...cutinPaid,
        last_paid_energy_colors: paidEnergyColorsOf(
          paidNums, battleCards, my.keyword_grants, myEnaAllMulti, myEnaMultiStripped),
      };
      // ベット宣言（タスク12(lxxxiv)）: カットイン窓でもアーツ経路と同じくコインを支払える。
      // UI 側でガード済みだが所持枚数を超えないよう丸め、is_betting_this_effect は
      // 非宣言時に明示クリアする（前回ベットの持ち越し防止＝executeArts / castSpell と同型）。
      const betCost = Math.min(Math.max(0, betCoins), my.coins);
      cutinPaid = {
        ...cutinPaid,
        coins: Math.max(0, cutinPaid.coins - betCost),
        coins_paid_this_turn: (cutinPaid.coins_paid_this_turn ?? 0) + betCost, // COINS_PAID_THIS_TURN
        ...(betCost > 0 ? { actions_done: [...(cutinPaid.actions_done ?? []), 'COIN_SPENT'] } : {}),
        is_betting_this_effect: betCost > 0 ? true : undefined,
        bet_coins_paid: betCost > 0 ? betCost : undefined,
      };
      if (betCost > 0) appendBattleLogs([`ベット：コイン${betCost}枚消費`]);
      // ON_COIN_PAID（C1 配線・カットインのベット）: 支払い後の盤面で反応【自】を収集しスタックへ積む。
      const cutinCoin = betCost > 0
        ? collectCoinPaidTriggers(user.id, cutinPaid, newCasterState)
        : { entries: [] as StackEntry[], usedIds: [] as string[] };
      cutinPaid = applyCoinPaidUsed(cutinPaid, cutinCoin); // 《ターン1回/2回》消化を永続化
      // カットイン効果は inline 解決＝スタックを経由しないため、コイン反応は別途スタックへ積む
      // （アーツ経路は queueCardEffects の extraEntries が同じ役割を担う）。
      const cutinCoinStack = cutinCoin.entries.length > 0
        ? (bs.effect_stack ? pushToStack(bs.effect_stack, cutinCoin.entries)
          : initStack(bs.active_user_id ?? user.id, cutinCoin.entries))
        : undefined;
      // カットイン使用・スペル打ち消しログ（カットインは常にスペルを打ち消す）
      const counterSpellName = battleCardMap.get(card_num)?.CardName ?? card_num;
      appendBattleLogs([`[自分] ${cutinCard.CardName}を使用（カットイン）`]);
      if (shouldCounterSpell) appendBattleLogs([`${cutinCard.CardName}：「${counterSpellName}」を打ち消した`]);
      // カットイン効果発火: lrig_deckはACTIVATED、field/handはSPELL_CUTINタイミングのACTIVATEDを優先
      const effects = effectsMap.get(cutinInstanceId) ?? effectsMap.get(getCardNum(cutinInstanceId)) ?? [];
      const cutinEff = candidate.effect ?? (source === 'lrig_deck'
        ? effects.find(e => e.effectType === 'ACTIVATED')
        : effects.find(e => e.effectType === 'ACTIVATED' && e.timing?.includes('SPELL_CUTIN')));
      if (!cutinEff) {
        const myKey = isHost ? 'host_state' : 'guest_state';
        const casterKey = casterIsHost ? 'host_state' : 'guest_state';
        if (myKey === casterKey) {
          await persist.commit(reduceBattle(bs, {
            type: 'FINISH_CUTIN', playerKey: myKey, playerState: cutinPaid,
            ...(cutinCoinStack ? { effectStack: cutinCoinStack } : {}),
          }));
        } else {
          await persist.commit(reduceBattle(bs, {
            type: 'FINISH_CUTIN', playerKey: myKey, playerState: cutinPaid,
            caster: { key: casterKey, state: newCasterState },
            ...(cutinCoinStack ? { effectStack: cutinCoinStack } : {}),
          }));
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
      const ctx: ExecCtx = { ownerState: cutinPaid, otherState: newCasterState, cardMap: cutinDeclaredCardMap, logs: [], currentPhase: bs.turn_phase ?? undefined, effectivePowers: cutinPowers, sourceCardNum: cutinInstanceId, allColorSigniNums: cutinAllColorSigniNums, fieldSigniExtraColors: cutinExtraColors, deckTrashLevel1Nums: cutinDeckTrashLevel1Nums };
      fillDeployCaps(ctx); // 配置数制限（CONT版）をctxへ
      ctx.isOwnerTurn = cutinIsOwnerTurn;
      let result = executeEffect(cutinEff, ctx);
      result = applyRefreshOnDone(result, battleCardMap); // デッキ0枚→リフレッシュ（スペルカットイン解決後）
      if (result.logs.length > 0) appendBattleLogs(result.logs);
      // myがhost/guestに応じてマッピング
      let hostState  = isHost ? result.ownerState : result.otherState;
      let guestState = isHost ? result.otherState : result.ownerState;
      // 🔴§5.3 `O-117`＝**この経路は `result.forceEndTurn` を一度も読んでいなかった**。
      //   `WX05-016`（エンドホール）は Timing が**スペルカットインだけ**＝ここが唯一の実行路なので、
      //   条件を正しくしても**ターンは一度も終わらなかった**（実機 `b21end5colors` で発見）。
      //   盤面処理はスタック解決経路と**同じ `applyForcedTurnEnd`**（判定を割らない）。
      let cutinBeginNextTurn: { activeUserId: string } | undefined;
      if (result.done && result.forceEndTurn) {
        const activeIsHostFE = bs.active_user_id === bs.host_id;
        const forcedFE = applyForcedTurnEnd(
          activeIsHostFE ? hostState : guestState,
          activeIsHostFE ? guestState : hostState,
        );
        if (activeIsHostFE) { hostState = forcedFE.activeAfter; guestState = forcedFE.nextAfter; }
        else { guestState = forcedFE.activeAfter; hostState = forcedFE.nextAfter; }
        cutinBeginNextTurn = { activeUserId: (activeIsHostFE ? bs.guest_id : bs.host_id) as string };
        appendBattleLogs(['ターンが強制終了されました']);
      }
      await persist.commit(reduceBattle(bs, {
        type: 'RESOLVE_EFFECT_STEP', hostState, guestState, clearPendingSpell: true,
        pending: result.done ? null : ({ sourcePlayerId: user.id, sourceCardNum: cutinInstanceId, effectId: cutinEff.effectId, interaction: result.pending, ...(result.storedTargetCards ? { storedTargetCards: result.storedTargetCards } : {}) } satisfies PendingEffect),
        ...(cutinCoinStack ? { effectStack: cutinCoinStack } : {}),
        ...(cutinBeginNextTurn ? { beginNextTurn: cutinBeginNextTurn } : {}),
      }));
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
    if (bs.turn_phase === 'MAIN' || bs.turn_phase === 'ATTACK_ARTS' || bs.turn_phase === 'ATTACK_ARTS_OP') {
      const handEffects = effectsMap.get(cardNum) ?? [];
      const phase = bs.turn_phase as string;
      // ATTACK_ARTS_OP（相手ターンのアーツステップ）はタイミング照合で ATTACK_ARTS として扱う
      const timingPhase = (phase === 'ATTACK_ARTS_OP' ? 'ATTACK_ARTS' : phase) as import('../types/effects').EffectTiming;
      for (const eff of handEffects) {
        if (eff.effectType !== 'ACTIVATED') continue;
        // `costUnparsed`＝原文のコストを表現できなかった印。提示すると踏み倒しになる（§6.4 O-11・続き532）。
        if (eff.costUnparsed) continue;
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
  // エナ以外のコスト（手札捨て/コイン/【ウィルス】除去/【チャーム】/ルリグダウン/エクシード）と
  // 《アタックフェイズアイコン》起動に対応（PLAN §6.4）。支払い可否は `canOfferTrashActivate` 一本。
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
    const effs = effectsMap.get(cardNum) ?? [];
    for (const eff of effs) {
      if (!eff.trashActivated || eff.effectType !== 'ACTIVATED') continue;
      // `costUnparsed`＝原文のコストを表現できなかった印（§6.4 O-11・続き532）。
      if (eff.costUnparsed) continue;
      if (!eff.timing?.includes(trashTiming)) continue;
      if (my.actions_done?.includes(eff.effectId)) continue;
      if (eff.usageLimit === 'once_per_game' && my.game_actions_done?.includes(eff.effectId)) continue;
      if (eff.condition && !evalUseCondition(eff.condition, my, op, battleCardMap, cardNum, bs.turn_phase, effectivePowers)) continue;
      if (!canOfferTrashActivate(eff, my, op, battleCardMap, myEnergyPayPool)) continue;
      const costLabel = trashActivateCostLabels(eff, my, op).join('・');
      actions.push({
        label: costLabel ? `【起】トラッシュから出す（${costLabel}）` : '【起】トラッシュから出す',
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
          .map(i => parseInt(battleCardMap.get(getCardNum(my.field.signi[i.index]?.at(-1) ?? ''))?.Level ?? '0', 10) || 0)
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
      const costOk = canAffordWithExtraCost(energyPoolCardNums(myEnergyPayPool), battleCards, cardData.Cost, [], my.keyword_grants, myEnaAllMulti, myEnaMultiStripped, myColorlessOverrides, myColorSubs, myEnergyExtraColors, undefined, undefined, undefined, my.cannot_pay_colorless_this_attack_phase);
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
    // UNLIMITED_KEYS: ルリグにCONT「UNLIMITED_KEYS」があれば何枚でもキーを出せる
    const hasUnlimitedKeys = my.field.lrig.some(ln =>
      (effectsMap.get(ln) ?? []).some(e =>
        e.effectType === 'CONTINUOUS' &&
        (e.action as import('../types/effects').StubAction)?.type === 'STUB' &&
        (e.action as import('../types/effects').StubAction)?.id === 'UNLIMITED_KEYS',
      )
    );
    // 🔴**ピースはキーゾーンを占有しない**（§3 (cxxiii)・続き475g）＝`!my.field.key_piece` ゲートを掛けない。
    //   従来はここで一緒に絞っていたため、**キーを1枚出しているだけで全ピースが使えなくなって**いた。
    const isPieceCard = cardData.Type === 'ピース';
    if ((cardData.Type === 'キー' || isPieceCard) && (isPieceCard || !my.field.key_piece || hasUnlimitedKeys)) {
      const timing = cardData.Timing ?? '';
      const canUse =
        (phase === 'MAIN' && isMyTurn && (timing.includes('メインフェイズ') || !timing)) ||
        (phase === 'GROW' && isMyTurn && timing.includes('グロウフェイズ')) ||
        // 🔴CSV Timing が「アタックフェイズ」のピース14枚は、従来 MAIN/GROW しか許していないため
        //   **永久に使えなかった**（メイン+アタック11／アタックのみ3）。
        (isPieceCard && isMyTurn && timing.includes('アタックフェイズ')
          && (phase === 'ATTACK_SIGNI' || phase === 'ATTACK_LRIG' || phase === 'ATTACK_ARTS'));
      const coinNeeded = parseCoinCost(cardData.Cost) + parseCoinCost(cardData.GrowCost);
      // ⚠ピースにも EffectText 由来の条件つきコスト軽減がある（`WXDi-P16-003`〜`007`＝「場に〔色〕のルリグが
      //   2体以上いるかぎり、1体につき《色×1》減る」＝タスク12(xciv) α）。ここと `KeyUseModal` の両方で
      //   同じ式を通さないと「一覧では使えるのに払えない／印刷コストで請求される」食い違いになる。
      const myLrigCardPC = battleCardMap.get(my.field.lrig.at(-1) ?? '');
      const pieceEffCostGate = computeArtsEffectiveCost(
        cardData, my, myLrigCardPC?.CardName, battleCardMap.get(op.field.lrig.at(-1) ?? '')?.Color ?? '',
        myLrigCardPC ? parseInt(myLrigCardPC.Level ?? '0') : 0, battleCardMap, myLrigNameAliases, undefined,
        { oppState: op, cardCostReplacements: my.card_cost_replacements }, costScalingOf(cardNum, effectsMap),
      );
      const canAfford = my.coins >= coinNeeded && canAffordGrowCost(energyPoolCardNums(myEnergyPayPool), battleCards, pieceEffCostGate, my.keyword_grants, myEnaAllMulti, myEnaMultiStripped, myColorlessOverrides, myColorSubs);
      const condOk = canUseArtsCondition(
        effectsMap.get(cardNum) ?? [], my, op, battleCardMap, cardNum, bs.turn_phase, effectivePowers,
      );
      if (canUse && canAfford && condOk) {
        actions.push({
          // ピースは「セット」ではなく**使用**（1回払って即解決→ルリグトラッシュ）。
          label: isPieceCard ? 'ピースを使用' : 'キーにセット',
          color: '#cc8800',
          onClick: () => { openKeyModal(cardData); },
        });
      }
    }

    return actions;
  };

  // ライフクロスを1枚クラッシュし、チェック状態にする
  // returns: crashed=null + prevented=true → ダメージ無効、crashed=null + !prevented → ライフなし（即勝利判定）
  // 🆕**§5.3 O-66（2026-08-25）＝`victim` を明示的に受け取る。** クラッシュ防止の判定には
  //   ①**相手側の盤面**（`WXK11-016-E1`「各プレイヤーの」は**相手の場のキー**に載っていても自分を守る）
  //   ②**被害側がターンプレイヤーか**（`WX19-046-E2`「対戦相手のターンの間」）の2つが要る。
  //   この関数は victim 側の state しか受け取っていなかったので、**引数で渡すしかない**
  //   （参照比較で相手を当てにいくと、更新済みコピーが渡る呼び出し側で必ず外れる）。
  const crashOneLife = (
    state: PlayerState,
    victim: { opponent: PlayerState; isTurnPlayer: boolean },
    damageSource?: DamageSourceContext,
    crashSourceCardNum?: string,
    /**
     * §5.3 `O-120`：このクラッシュの**原因キーワード**（`'ランサー'` / `'Ｓランサー'`）。
     * ⚠**省略＝原因不明**であり「通常のバトルダメージ」を意味しない。`crashedByKeywords` を持つ効果は
     *   fail-closed で発火しないので、**ランサー経路では必ず渡すこと**（渡し忘れると恒久 no-op になる）。
     */
    crashCause?: string,
  ): { newState: PlayerState; crashed: string | null; prevented?: boolean; crashOpponentInstead?: number } => {
    // §5.3 O-66: ライフクラッシュ防止／回数制限（**シグニアタックのダメージ**＝cause:'damage'）。
    // ⚠**回数無制限の防御なので、消費型（バリア／prevent_next_damage／置換ミル）より先に判定する**
    //   （`lrigDamageShield` と同じ規約＝後ろに置くと、防げる状況でも限りある資源が先に減る）。
    // ⚠「ダメージ以外によってはクラッシュされない」は**ここでは効かない**（アタックのダメージは通す）。
    {
      const preventions = collectLifeCrashPreventions(
        state, victim.opponent, victim.isTurnPlayer, battleCardMap, effectsMap);
      if (allowedLifeCrashCount(state, victim.opponent, preventions, 'damage', 1) <= 0) {
        appendBattleLogs([`ライフクロスはクラッシュされない（クラッシュ防止）`]);
        return { newState: state, crashed: null, prevented: true };
      }
    }
    // PREVENT_DAMAGE の scope='ALL' ウィンドウ（「このターン、あなたはダメージを受けない」）＝期間内は回数無制限。
    // バリアトークンや prevent_next_damage を無駄に消費させないため、消費型の無効化より先に判定する。
    if (hasActivePreventDamageWindow(state, 'ALL')) {
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
    const preventedState = consumeNextDamagePrevention(state, damageSource);
    if (preventedState) {
      return {
        newState: preventedState,
        crashed: null,
        prevented: true,
      };
    }
    // ライフクラッシュ置換（§6.4 funnel＝`screens/battle/lifeCrashReplace.ts`）。
    // ⚠**限定（誰のどんな攻撃か）はここで見る**＝従来は `damageSource` を宣言していたのに捨てていて、
    //   「シグニによって」限定の札がルリグアタックのダメージまで置換していた。
    {
      const picked = pickLifeCrashReplacement(state, { damageSource: damageSource?.type, cardMap: battleCardMap });
      if (picked && picked.repl.kind === 'pay_cost') {
        // §6.4 O-37(a)「代わりに〈コスト〉を支払ってもよい」＝払えるときだけ選ばれている（funnel 側で確認済み）。
        const paid = applyPayCostReplacement(state, picked.index, picked.repl, battleCardMap);
        if (paid) {
          appendBattleLogs([lifeCrashReplaceLog(picked.repl, paid.paidJa)]);
          return { newState: paid.state, crashed: null, prevented: true };
        }
      }
      if (picked && picked.repl.kind === 'mill') {
        const applied = applyMillReplacement(state, picked.index, picked.repl.count);
        appendBattleLogs([lifeCrashReplaceLog(picked.repl)]);
        return { newState: applied.state, crashed: null, prevented: true };
      }
      if (picked && picked.repl.kind === 'crash_opponent') {
        // 「代わりに**対戦相手の**ライフクロスをクラッシュする」＝相手 state が要るので
        // ここでは消費だけ行い、実際のクラッシュは呼び出し側（両者の state を持つ）が行う。
        appendBattleLogs([lifeCrashReplaceLog(picked.repl)]);
        return {
          newState: consumeLifeCrashReplacement(state, picked.index),
          crashed: null,
          prevented: true,
          crashOpponentInstead: picked.repl.count,
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
        crash_source_card_num: crashSourceCardNum,
        // §5.3 O-120: 原因は**発生源と必ず同じ地点で**書く（片方だけだと前のクラッシュの原因が残る）。
        crash_cause: crashCause,
      },
      crashed,
    };
  };

  /** アタック解除コストによる場→トラッシュを、通常の ON_TRASH / ON_LEAVE_FIELD collector へ通す。 */
  const collectAttackFieldTrashCostTriggers = (
    beforeAttacker: PlayerState,
    paidAttacker: PlayerState,
    defender: PlayerState,
    attackerId: string,
    attackerIsHost: boolean,
    trashedSigniNums: string[],
  ): { attacker: PlayerState; defender: PlayerState; entries: StackEntry[] } => {
    let hostState = attackerIsHost ? paidAttacker : defender;
    let guestState = attackerIsHost ? defender : paidAttacker;
    const entries: StackEntry[] = [];
    const applyUsed = (usedHostIds: string[], usedGuestIds: string[]) => {
      if (usedHostIds.length > 0) hostState = { ...hostState, actions_done: [...(hostState.actions_done ?? []), ...usedHostIds] };
      if (usedGuestIds.length > 0) guestState = { ...guestState, actions_done: [...(guestState.actions_done ?? []), ...usedGuestIds] };
    };
    for (const cardNum of trashedSigniNums) {
      const zoneIdx = beforeAttacker.field.signi.findIndex(stack => stack?.at(-1) === cardNum);
      const under = zoneIdx >= 0 ? (beforeAttacker.field.signi[zoneIdx] ?? []).slice(0, -1) : [];
      const trash = collectTrashTriggers(cardNum, attackerId, hostState, guestState, false, true, false);
      entries.push(...trash.entries);
      applyUsed(trash.usedHostIds, trash.usedGuestIds);
      const leave = collectLeaveFieldTriggers(
        cardNum, under, attackerId, hostState, guestState,
        undefined, beforeAttacker, zoneIdx >= 0 ? zoneIdx : undefined,
      );
      entries.push(...leave.entries);
      applyUsed(leave.usedHostIds, leave.usedGuestIds);
    }
    return {
      attacker: attackerIsHost ? hostState : guestState,
      defender: attackerIsHost ? guestState : hostState,
      entries,
    };
  };

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
      const newMyState: PlayerState = clearEndOfAttackEffects({
        ...my,
        field: { ...my.field, signi_down: newSigniDown as [boolean, boolean, boolean] },
        flip_attack_signi_zones: flipZones,
        attacked_signi_ids: [...(my.attacked_signi_ids ?? []), my.field.signi[attackZone]?.at(-1) ?? ''],
      });
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
        // 正面にシグニ → バトル（通常アタックへ委譲）
        await persist.commit(reduceBattle(bs, { type: 'WRITE_STATE', myKey: stateKey, myState: newMyState }));
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
    attackFieldTrashZones?: number[];
    attackFieldTrashAlreadyPaid?: boolean;
    /** 「手札をN枚捨てないかぎりアタックできない」の支払い（手札 index・§6.4 O-3）。 */
    attackHandDiscardIndices?: number[];
    attackHandDiscardAlreadyPaid?: boolean;
  }) => {
    let my = p.attacker;
    let op = p.defender;
    const { attackerId, defenderId } = p;
    const attackerIsHost = p.attackerKey === 'host_state';
    setLoading(true);
    try {
      const myTopNum = (my.field.signi[zoneIndex] ?? []).at(-1);
      if (!myTopNum) return;
      // GATE: アタック可否は signiAttackGate に一本化（人間ボタン／CPU候補フィルタと同じ関数）。
      // ⚠ここで弾かれるシグニは CPU 候補フィルタ側でも同じ理由で除外されている必要がある
      //   （除外漏れがあるとアタッカーがダウンせず ATTACK_SIGNI で無限ループする）。
      if (!canSigniAttack({
        attacker: my, defender: op, attackerNum: myTopNum,
        effectsMap, cardMap: battleCardMap, turnPhase: bs.turn_phase,
        fieldTrashCostAlreadyPaid: p.attackFieldTrashAlreadyPaid,
      })) return;

      // 解除コストつきアタック制限：人間はモーダルで選んだゾーン、CPUは左から決定論的に選ぶ。
      let attackFieldTrashTriggerEntries: StackEntry[] = [];
      if (!p.attackFieldTrashAlreadyPaid && attackFieldTrashCost(my, myTopNum) > 0) {
        const selectedZones = p.attackFieldTrashZones
          ?? (attackerId === CPU_PLAYER_ID ? deterministicAttackFieldTrashZones(my, myTopNum, battleCardMap) : []);
        const paid = payAttackFieldTrashCost(my, myTopNum, selectedZones, battleCardMap);
        if (!paid) return;
        const collected = collectAttackFieldTrashCostTriggers(
          my, paid.state, op, attackerId, attackerIsHost, paid.trashedSigniNums,
        );
        my = collected.attacker;
        op = collected.defender;
        attackFieldTrashTriggerEntries = collected.entries;
        appendBattleLogs([`${paid.trashedSigniNums.map(n => battleCardMap.get(n)?.CardName ?? n).join('・')}を場からトラッシュに置き、アタック制限を解除`]);
      }

      // 「手札をN枚捨てないかぎりアタックできない」（§6.4 O-3）＝**アタックするごとに**払う。
      // ⚠払えるかどうかの判定は signiAttackGate 側（ATTACK_BAN_HAND_COST）。ここは引き落としだけ。
      // ⚠`newMyState` を組み立てる**前**に `my` を差し替える（後だと手札が減らないまま確定する）。
      if (!p.attackHandDiscardAlreadyPaid) {
        const handTaxSA = signiAttackBanHandDiscardCost(my, myTopNum, battleCardMap);
        if (handTaxSA > 0) {
          const idxSA = p.attackHandDiscardIndices
            ?? (attackerId === CPU_PLAYER_ID ? my.hand.map((_, i) => i).slice(0, handTaxSA) : []);
          if (idxSA.length !== handTaxSA) return;
          const discardSet = new Set(idxSA);
          const discardedSA = my.hand.filter((_, i) => discardSet.has(i));
          my = { ...my, hand: my.hand.filter((_, i) => !discardSet.has(i)), trash: [...my.trash, ...discardedSA] };
          appendBattleLogs([`手札${discardedSA.length}枚を捨ててアタック制限を解除`]);
        }
      }

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
      // ⚠ここは**選択のない自動支払い**（末尾から削る近似）なので §6.4 のエナ支払い元 funnel は通さない
      //   ＝「エナゾーン以外を支払い元にする」語彙の対象外（原文は「支払う際」＝選んで払う場面を指す）。
      // signi_attack_bans_this_turn の「《無》×N を支払わないかぎり」分も同じ自動支払いに乗せる（§6.4 O-3）。
      // ⚠払えるかどうかの判定は signiAttackGate 側（ATTACK_BAN_COST）。ここは引き落としだけ。
      // ⚠**判定と同じ1関数を見る**（§6.4 O-31）＝`signi_attack_bans_this_turn` 由来だけを足すと、
      //   【常】由来の「《無》を支払わないかぎりアタックできない」がタダで通る穴になる。
      const banCostSA = signiAttackColorlessCost({
        attacker: my, defender: op, attackerNum: myTopNum, effectsMap, cardMap: battleCardMap,
      }) ?? 0;
      const signiAtkCostSA = (my.signi_attack_cost ?? 0) + banCostSA;
      const newEnergySA = signiAtkCostSA > 0 ? my.energy.slice(0, -signiAtkCostSA) : my.energy;
      const newMyState: PlayerState = { ...my, field: { ...my.field, signi_down: newSigniDown }, attacked_signi_ids: newAttackedIds, energy: newEnergySA };
      const newOpState = op;

      // NEGATE_NTH_ATTACK: 防御側の共有カウンタがシグニを対象にする場合
      const signiNegation = consumeNthAttackNegation(op, 'signi');
      if (signiNegation.negated) {
        const negatedTriggers = collectSelfEventTriggers('ON_OPP_SIGNI_ATTACK_NEGATED_BY_EFFECT', signiNegation.defender, newMyState, 'シグニアタック無効時', defenderId);
        const defenderAfterTrigger: PlayerState = negatedTriggers.usedOncePerTurnIds.length > 0
          ? { ...signiNegation.defender, actions_done: [...(signiNegation.defender.actions_done ?? []), ...negatedTriggers.usedOncePerTurnIds] }
          : signiNegation.defender;
        const allNegatedEntries = [...attackFieldTrashTriggerEntries, ...negatedTriggers.entries];
        const stack = allNegatedEntries.length > 0
          ? (bs.effect_stack ? pushToStack(bs.effect_stack, allNegatedEntries) : initStack(bs.active_user_id ?? attackerId, allNegatedEntries))
          : undefined;
        appendBattleLogs([`${myCardName}のアタックは無効化された（残り${signiNegation.remaining}回）`]);
        await persist.commit(reduceBattle(bs, { type: 'WRITE_STATE', myKey: myKey, myState: newMyState, opp: { key: opKey, state: defenderAfterTrigger }, ...(stack ? { effectStack: stack } : {}) }));
        return;
      }
      // NEGATE_THAT_ATTACK: 対象側（アタッカー）の state に myTopNum が登録されていた場合、このアタックを無効化
      if ((my.negated_attacks ?? []).includes(myTopNum)) {
        // escapeDiscard（G154 BURST）: アタック側が手札をN枚捨てれば無効化を回避できる。手札が足りればモーダルで選択させる。
        const escapeCount = my.negated_attacks_escape?.[myTopNum];
        if (escapeCount && my.hand.length >= escapeCount) {
          // ⚠解除コストは**この時点で支払い済み**（上のブロック）＝再入時に二重請求しない。
          openNegateEscape({ zoneIndex, targetOpZone: p.targetOpZone, cardNum: myTopNum, count: escapeCount, attackFieldTrashAlreadyPaid: true, attackHandDiscardAlreadyPaid: true });
          const paymentStack = attackFieldTrashTriggerEntries.length > 0
            ? (bs.effect_stack ? pushToStack(bs.effect_stack, attackFieldTrashTriggerEntries) : initStack(bs.active_user_id ?? attackerId, attackFieldTrashTriggerEntries))
            : undefined;
          await persist.commit(reduceBattle(bs, {
            type: 'WRITE_STATE', myKey, myState: my,
            opp: { key: opKey, state: op }, ...(paymentStack ? { effectStack: paymentStack } : {}),
          }));
          setLoading(false);
          return; // アタックを保留してプレイヤーの選択を待つ
        }
        const clearedNA = (my.negated_attacks ?? []).filter(id => id !== myTopNum);
        const escMap0 = { ...(my.negated_attacks_escape ?? {}) }; delete escMap0[myTopNum];
        const newMyNA: PlayerState = {
          ...newMyState,
          negated_attacks: clearedNA.length ? clearedNA : undefined,
          negated_attacks_escape: Object.keys(escMap0).length ? escMap0 : undefined,
        };
        const negatedTriggers = collectSelfEventTriggers('ON_OPP_SIGNI_ATTACK_NEGATED_BY_EFFECT', op, newMyNA, 'シグニアタック無効時', defenderId);
        const defenderAfterTrigger: PlayerState = negatedTriggers.usedOncePerTurnIds.length > 0
          ? { ...op, actions_done: [...(op.actions_done ?? []), ...negatedTriggers.usedOncePerTurnIds] }
          : op;
        const allNegatedEntries = [...attackFieldTrashTriggerEntries, ...negatedTriggers.entries];
        const stack = allNegatedEntries.length > 0
          ? (bs.effect_stack ? pushToStack(bs.effect_stack, allNegatedEntries) : initStack(bs.active_user_id ?? attackerId, allNegatedEntries))
          : undefined;
        appendBattleLogs([`${myCardName}のアタックは無効化された`]);
        await persist.commit(reduceBattle(bs, { type: 'WRITE_STATE', myKey: myKey, myState: newMyNA, opp: { key: opKey, state: defenderAfterTrigger }, ...(stack ? { effectStack: stack } : {}) }));
        return;
      }

      // ON_ATTACK_SIGNIトリガー収集（Phase 1：バトル前に処理するトリガー）
      // condition を持つ AUTO は発動条件を満たす場合のみ収集（「〜であるかぎり『【自】アタック時…』を得る」系）
      const atkSelfPowers = calcFieldPowers(newMyState, newOpState, true, effectsMap, battleCardMap, bs.turn_phase);
      const attackEntries = pureCollectAttackerSelfTriggers(
        mkTrigCtx(), newMyState, newOpState, myTopNum, attackerId, atkSelfPowers,
      );

      // 🆕INSTALL_DELAYED_TRIGGER（§5.3 2026-08-27 Sheet1 B11）＝**攻撃側**に設置された
      //   「このターン、あなたのシグニ１体がアタックしたとき、…」watcher（`WX10-035`）。
      //   防御側の収集（下の `pureCollectSigniAttackDelayedTriggers`）は `attackerOwner:'self'` を
      //   読み飛ばすので、ここを足さないと設置しても永久に発火しない。
      attackEntries.push(...pureCollectAttackerSelfDelayedTriggers(mkTrigCtx(), attackerId, newMyState, myTopNum));

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

      // INSTALL_DELAYED_TRIGGER（B3・タスク12(lxi) 第8波）: 防御側プレイヤーに設置された ON_ATTACK_SIGNI
      // watcher（`WXK05-009-E2`）。上のループは場のシグニ効果しか走査しないため、プレイヤーに設置された
      // 遅延分は拾えず、parser 側は設置を落として**起動した瞬間に相手シグニを1体トラッシュ**する
      // 過剰実行になっていた。triggeringCardNum＝アタッカーで帰結の「そのシグニ」が解ける。
      opAtkedEntries.push(...pureCollectSigniAttackDelayedTriggers(mkTrigCtx(), defenderId, newOpState, myTopNum));

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

      // ON_OPP_SIGNI_ATTACK（タスク12(cx)）: 守備側の「対戦相手のシグニ1体がアタックしたときにしか使用できない」【起】。
      // 使用条件ではなく**使用タイミング**なので、宣言→バトル解決の間にここで守備側のスタックへ積む
      // （`wrapOptionalOnPlay` が「エクシード等を支払って発動するか」の CHOOSE に包む＝踏み倒しなし）。
      // ⚠ここで積まないと相手ターン中にアクセスする経路が構造的に無い（【起】のUIは全て自ターン限定）。
      opAtkedEntries.push(...collectOppSigniAttackResponses(newOpState, newMyState, effectsMap, battleCardMap, bs.turn_phase)
        .map(({ cardNum, effect }) => ({
          id: generateUUID(),
          playerId: defenderId,
          cardNum,
          effectId: effect.effectId,
          label: `${battleCardMap.get(getCardNum(cardNum))?.CardName ?? cardNum} の【起】効果（相手シグニのアタックに応答）`,
          effect,
          triggeringCardNum: myTopNum, // 「アタックしているシグニ」＝アタッカー
        } satisfies StackEntry)));

      // ON_SIGNI_DOWN（アタックダウン・タスク16[C]機構①）: アタック宣言でアタッカーがダウンした（byEffect:false＝
      // 「効果によってダウン」限定の watcher は発火しない）。中央 diff はスタック解決のみを通るためここで収集する。
      // 🔴台帳は**収集の前に**積む（`fireCondition` が今回のダウンを含めて数えるため）。
      //   アタックでダウンするのはアタッカー＝`newMyState` 側。
      const newMyStateDownRec = recordSigniDownedThisTurn(newMyState, [myTopNum]);
      const downHostSt  = attackerIsHost ? newMyStateDownRec : newOpStateAtk;
      const downGuestSt = attackerIsHost ? newOpStateAtk : newMyStateDownRec;
      const atkDownRes = pureCollectSigniDownUpTriggers(mkTrigCtx(), 'ON_SIGNI_DOWN',
        [{ ownerId: attackerId, nums: [myTopNum], byEffect: false }], downHostSt, downGuestSt);
      const atkDownUsedMine = attackerIsHost ? atkDownRes.usedHostIds : atkDownRes.usedGuestIds;
      const atkDownUsedOpp  = attackerIsHost ? atkDownRes.usedGuestIds : atkDownRes.usedHostIds;
      const newOpStateAtkDown: PlayerState = atkDownUsedOpp.length > 0
        ? { ...newOpStateAtk, actions_done: [...(newOpStateAtk.actions_done ?? []), ...atkDownUsedOpp] }
        : newOpStateAtk;

      // バトル解決前にON_ATTACK_SIGNIを処理するため pending_signi_battle をセット（側面アタックは攻撃先ゾーンを保持）
      const newMyStateWithPending: PlayerState = {
        // 「このターンでN回目」台帳（§6.4 O-11）＝上で積んだ `newMyStateDownRec` をそのまま引き継ぐ。
        //   ⚠アタック宣言によるダウンも**同じ台帳へ積む**（原文の「ダウン状態になったとき」は
        //     効果起因に限らない。`byEffect` の絞りは watcher 側の役目）。
        ...newMyStateDownRec,
        ...(atkUsedMine.length > 0 || atkDownUsedMine.length > 0
          ? { actions_done: [...(newMyState.actions_done ?? []), ...atkUsedMine, ...atkDownUsedMine] } : {}),
        pending_signi_battle: { zoneIndex, ...(isSideAttack ? { targetOpZone: p.targetOpZone } : {}) },
      };

      const allAttackTriggers = [...attackFieldTrashTriggerEntries, ...attackEntries, ...allyAttackEntries, ...opAtkedEntries, ...atkDownRes.entries];
      if (allAttackTriggers.length > 0) {
        const turnPlayerId = bs.active_user_id ?? attackerId;
        const existingStack = bs.effect_stack ?? null;
        const stack = existingStack
          ? pushToStack(existingStack, allAttackTriggers)
          : initStack(turnPlayerId, allAttackTriggers);
        await persist.commit(reduceBattle(bs, { type: 'WRITE_STATE', myKey: myKey, myState: newMyStateWithPending, opp: { key: opKey, state: newOpStateAtkDown }, effectStack: stack }));
      } else {
        await persist.commit(reduceBattle(bs, { type: 'WRITE_STATE', myKey: myKey, myState: newMyStateWithPending, opp: { key: opKey, state: newOpStateAtkDown } }));
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
      const banishProtected = collectBanishEffectProtectedSigni(ownerState, opStateP0, isOwnerTurnP0, effectsMap, battleCardMap, undefined, 'rule', bs.turn_phase);
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
        await persist.commit(reduceBattle(bs, {
          type: 'WRITE_STATE', myKey, myState: { ...myS, pending_signi_battle: undefined },
        }));
        return;
      }
      const myCardName = battleCardMap.get(myTopNum)?.CardName ?? myTopNum;

      // NEGATE_ATTACK_ON_TRIGGER: アタックキャンセルフラグがあればバトル/ダメージを全てスキップ
      if (myS.cancel_current_signi_attack) {
        const clearedState: PlayerState = { ...myS, pending_signi_battle: undefined, cancel_current_signi_attack: undefined };
        const negatedTriggers = collectSelfEventTriggers('ON_OPP_SIGNI_ATTACK_NEGATED_BY_EFFECT', opS, clearedState, 'シグニアタック無効時', defenderId);
        const defenderAfterTrigger: PlayerState = negatedTriggers.usedOncePerTurnIds.length > 0
          ? { ...opS, actions_done: [...(opS.actions_done ?? []), ...negatedTriggers.usedOncePerTurnIds] }
          : opS;
        const stack = negatedTriggers.entries.length > 0
          ? (bs.effect_stack ? pushToStack(bs.effect_stack, negatedTriggers.entries) : initStack(bs.active_user_id ?? attackerId, negatedTriggers.entries))
          : undefined;
        await persist.commit(reduceBattle(bs, { type: 'WRITE_STATE', myKey: myKey, myState: clearedState, opp: { key: opKey, state: defenderAfterTrigger }, ...(stack ? { effectStack: stack } : {}) }));
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
      let newMyState: PlayerState = { ...myS, pending_signi_battle: undefined };
      let newOpState: PlayerState = opS;
      // ON_SIGNI_DAMAGE: このアタックで実際に相手ライフをクラッシュ（ダメージを与えた）か
      let dealtSigniDamage = false;
      // 「このシグニは対戦相手にダメージを与えない」（§6.4 A群・WX25-CP1-074-E1 の付与）。
      // 攻撃側の盤面（付与前ではなく解決開始時点）で1度だけ判定し、下の2つのダメージ地点で共有する。
      const cannotDealDamageToOpp = signiCannotDealDamageToOpponent(myS, myTopNum, effectsMap);
      let banishedOpCardNum: string | null = null;
      let banishedOpUnderCards: string[] = [];
      // §5.3 O-47：バトルで負けた／相打ちになったアタッカー自身のバニッシュ（従来は一切消えなかった）。
      let banishedMyCardNum: string | null = null;
      let banishedMyUnderCards: string[] = [];
      // O-49: 実際の行き先計算で一度だけ決め、ON_TRASH も同じ値を読む。
      let banishedMyWentToTrash = false;

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
          zoneIdx: zi,
          level,
          frozen: (opS.field.signi_frozen?.[zi] ?? false),
          hasCharm: (opS.field.signi_charms?.[zi] ?? null) !== null,
          infected: (opS.field.signi_virus?.[zi] ?? 0) > 0,
        };
      };
      // O-49: アタッカー側ミラー。判定は必ずバニッシュ前の myS から取る。
      const banishedMyAttrsOf = (cardNum: string | null) => {
        if (!cardNum) return undefined;
        const zi = myS.field.signi.findIndex(s => s?.at(-1) === cardNum);
        if (zi < 0) return undefined;
        const base = parseInt(battleCardMap.get(cardNum)?.Level ?? '', 10);
        const level = isNaN(base) ? undefined
          : base + (myS.temp_level_mods ?? []).filter(m => m.cardNum === cardNum).reduce((s, m) => s + m.delta, 0);
        return {
          zoneIdx: zi,
          level,
          frozen: (myS.field.signi_frozen?.[zi] ?? false),
          hasCharm: (myS.field.signi_charms?.[zi] ?? null) !== null,
          infected: (myS.field.signi_virus?.[zi] ?? 0) > 0,
        };
      };

      // キーワード能力確認
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
        const acceNums = acceCardsAt(myS.field, myZoneIdx);
        if (acceNums.length > 0) {
          for (const acceNum of acceNums) for (const eff of (effectsMap.get(acceNum) ?? [])) {
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
      const { isAssassin, isLancer, lancerKeywords, isSLancer, isTripleCrush, isDoubleCrush, isShoot } =
        getSigniAttackKeywordState(myTopNum, myS, opS, battleCardMap, effectivePowers, contGrantedKeywords);

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
          const newOpAcce   = cloneAcceSlots(opS.field);
          const wasOpFrozen = newOpFrozen[opZoneIndex] ?? false;

          // ─── F-3 BANISH_SUBSTITUTE: バトルバニッシュの任意身代わり置換 ───
          // victim = opTopCardNum（バトル防御シグニ）。防御側に身代わりがあれば対話（人間）/ヒューリスティック（CPU）で適用。
          // option=sacrifice: 別シグニを代わりにバニッシュ / option=pay_cost: コストを払って victim を残す。
          let f3SacrificeNum: string | null = null;
          let f3PayCost: { sourceNum: string; costType: 'discardSpell' | 'trashStackSpell' | 'lifeCrash'; amount: number } | null = null;
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
                  // ライフクロスを割る代替（§3タスク6 D・WX14-026）は損失が大きいので pay の中でも最後に回す。
                  const pay = f3Opts.find(o => o.kind === 'pay_cost' && o.costType !== 'lifeCrash')
                    ?? f3Opts.find(o => o.kind === 'pay_cost');
                  const sac = f3Opts.filter(o => o.kind === 'sacrifice')
                    .sort((a, b) => f3PowerOf((a as { sacrificeNum: string }).sacrificeNum) - f3PowerOf((b as { sacrificeNum: string }).sacrificeNum))[0];
                  if (pay) applyOption(pay);
                  else if (sac && opTopCardNum && f3PowerOf((sac as { sacrificeNum: string }).sacrificeNum) <= f3PowerOf(opTopCardNum)) applyOption(sac);
                } else {
                  // 人間防御側に対話プロンプトを提示（中断）。攻撃側 myS.pending_signi_battle は保持して再入で再開。
                  await persist.commit(reduceBattle(bs, {
                    type: 'WRITE_STATE', myKey: opKey,
                    myState: { ...opS, pending_banish_substitute: { victimNum: opTopCardNum!, options: f3Opts } },
                  }));
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
          // §3タスク6 D: バニッシュ防止＋能力喪失（WX13-031/WX16-001/WXK04-068）。守れる source instance（無ければ null）。
          const banishPreventLoseAbilitySrc = (!f3SubstituteApplied && opTopCardNum)
            ? collectBanishPreventLoseAbility(opS, myS, false, battleCardMap, effectsMap, opTopCardNum)
            : null;
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
              if (newOpAcce[sacZone])   { f3Extra.push(...newOpAcce[sacZone]!); newOpAcce[sacZone] = null; }
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
            const pc = f3PayCost as { sourceNum: string; costType: 'discardSpell' | 'trashStackSpell' | 'lifeCrash'; amount: number };
            const isSpellCard = (n: string) => battleCardMap.get(getCardNum(n))?.Type === 'スペル';
            if (pc.costType === 'lifeCrash') {
              // §3タスク6 D（WX14-026）: 自分のライフクロスを割ってバニッシュを回避。
              // 置換効果であってコストではないので、クラッシュが別の置換/無効化に阻まれても victim は場に残る。
              // crashOneLife は field.check を立てる＝ライフバースト確認フローへ通常どおり乗る。
              let afterCrash: PlayerState = { ...opS, banish_substitute_choice: undefined, pending_banish_substitute: undefined };
              for (let i = 0; i < pc.amount; i++) {
                afterCrash = crashOneLife(afterCrash,
                  { opponent: newMyState, isTurnPlayer: bs.active_user_id !== user.id }).newState;
              }
              newOpState = afterCrash;
              appendBattleLogs([`身代わり：ライフクロス${pc.amount}枚をクラッシュして${opCardName}のバニッシュを回避`]);
            } else if (pc.costType === 'discardSpell') {
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
          } else if (opTopCardNum && banishPreventLoseAbilitySrc) {
            // §3タスク6 D: BATTLE_BANISH_PREVENT_LOSE_ABILITY（WX13-031/WX16-001/WXK04-068）
            // ＝victim はバニッシュされず場に残り、source（＝守った能力の持ち主）はターン終了時までこの能力を失う。
            //   abilities_removed（instance 単位）で同ターン再発動を封じる（powered by ターン境界の abilities_removed リセット）。
            const newAbilBP = [...new Set([...(opS.abilities_removed ?? []), banishPreventLoseAbilitySrc])];
            newOpFrozen[opZoneIndex] = false;
            const newOpSigniBP = [...opS.field.signi] as (string[] | null)[];
            newOpState = { ...opS, abilities_removed: newAbilBP, field: { ...opS.field, signi: newOpSigniBP, signi_down: newOpDown, signi_frozen: newOpFrozen, signi_charms: newOpCharms, signi_acce: newOpAcce } };
            appendBattleLogs([`${opCardName}（バニッシュ置換）バニッシュされず、${battleCardMap.get(banishPreventLoseAbilitySrc)?.CardName ?? banishPreventLoseAbilitySrc}はターン終了時までこの能力を失う`]);
          } else {
          // COOKING_BANISH_SUBSTITUTE: 調理シグニにアクセがある場合、アクセをトラッシュしてバニッシュ回避
          // （防御側から見て相手ターンのみ＝アタックは常にアタッカーのターンなので常に該当）
          const opTopCardClass = opTopCardNum ? (battleCardMap.get(opTopCardNum)?.CardClass ?? '') : '';
          const cookingBanishSub = opTopCardClass.includes('調理') &&
            hasAcceAt(opS.field, opZoneIndex) &&
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
            const acceTrash = newOpAcce[opZoneIndex]![0];
            const remaining = newOpAcce[opZoneIndex]!.slice(1);
            newOpAcce[opZoneIndex] = remaining.length > 0 ? remaining : null;
            newOpFrozen[opZoneIndex] = false;
            const newOpSigniCBS = [...opS.field.signi] as (string[] | null)[];
            newOpState = { ...opS, trash: [...opS.trash, acceTrash], field: { ...opS.field, signi: newOpSigniCBS, signi_down: newOpDown, signi_frozen: newOpFrozen, signi_charms: newOpCharms, signi_acce: newOpAcce } };
            appendBattleLogs([`${opCardName}（調理バニッシュ代替）アクセをトラッシュしてバニッシュ回避`]);
          } else if ((newOpAcce[opZoneIndex] ?? []).some(acceNum => (effectsMap.get(acceNum) ?? []).some(eff =>
            eff.effectType === 'CONTINUOUS' &&
            (eff.action as import('../types/effects').StubAction).type === 'STUB' &&
            (eff.action as import('../types/effects').StubAction).id === 'ACCE_BANISH_SUBSTITUTE'))) {
            // ACCE_BANISH_SUBSTITUTE: アクセをゲームから除外してシグニをダウン（バニッシュ回避）
            const exiledAcce = newOpAcce[opZoneIndex]!.find(acceNum => (effectsMap.get(acceNum) ?? []).some(eff =>
              eff.effectType === 'CONTINUOUS' && eff.action.type === 'STUB' && eff.action.id === 'ACCE_BANISH_SUBSTITUTE'))!;
            const remaining = newOpAcce[opZoneIndex]!.filter(cn => cn !== exiledAcce);
            newOpAcce[opZoneIndex] = remaining.length > 0 ? remaining : null;
            newOpDown[opZoneIndex] = true;
            newOpFrozen[opZoneIndex] = false;
            const newOpSigniABS = [...opS.field.signi] as (string[] | null)[];
            newOpState = { ...opS, trash: [...opS.trash, exiledAcce], field: { ...opS.field, signi: newOpSigniABS, signi_down: newOpDown, signi_frozen: newOpFrozen, signi_charms: newOpCharms, signi_acce: newOpAcce } };
            appendBattleLogs([`${opCardName}（アクセ代替バニッシュ）アクセをゲームから除外してダウン`]);
          } else if ((newOpAcce[opZoneIndex] ?? []).some(acceNum => (effectsMap.get(acceNum) ?? []).some(eff =>
            eff.effectType === 'CONTINUOUS' &&
            (eff.action as import('../types/effects').StubAction).type === 'STUB' &&
            (eff.action as import('../types/effects').StubAction).id === 'ACCE_BANISH_SELF_TRASH'))) {
            // ACCE_BANISH_SELF_TRASH（WXK04-031 メレドール）: 代わりにアクセ（このカード）をトラッシュに置きバニッシュ回避。
            // シグニはダウンせずそのまま場に残る（バニッシュを丸ごとアクセの離脱で置換）。
            const trashedAcce = newOpAcce[opZoneIndex]!.find(acceNum => (effectsMap.get(acceNum) ?? []).some(eff =>
              eff.effectType === 'CONTINUOUS' && eff.action.type === 'STUB' && eff.action.id === 'ACCE_BANISH_SELF_TRASH'))!;
            const remaining = newOpAcce[opZoneIndex]!.filter(cn => cn !== trashedAcce);
            newOpAcce[opZoneIndex] = remaining.length > 0 ? remaining : null;
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
          if (newOpAcce[opZoneIndex])   { banishExtraTrash.push(...newOpAcce[opZoneIndex]!); newOpAcce[opZoneIndex] = null; }
          // ウィルスはゾーンに属するため、シグニがバニッシュされても除去しない
          // 状態フラグ（ACTIVATEDで設定済み）またはCONTINUOUS BANISH_REDIRECT効果（activeCondition評価込み）
          const redirectBanish =
            isShoot ||
            myS.banish_redirect === true ||
            // ACTIVATED/AUTO で選んだ個体だけに適用する単体置換。
            isSelectedBanishRedirect(myS, opTopCardNum) ||
            isSelectedBattleBanishRedirect(myS, opTopCardNum) ||
            // bySource 付き（このシグニとの/による）＝そのシグニ自身がバトル当事者のときだけ（続き217）
            (myS.banish_redirect_by_source_nums ?? []).includes(myTopNum) ||
            myS.field.signi.some((s, zi) => {
              const n = s?.at(-1);
              // bySource（「このシグニとのバトルによって」等）付きは、バトル当事者＝myTopNum のときだけ適用
              // 被バニッシュシグニ＝opTopCardNum。target.filter（レベル/凍結/感染/チャーム）で絞る（タスク12(xliv)(a)）。
              return n && (effectsMap.get(n) ?? []).some(e =>
                e.effectType === 'CONTINUOUS' &&
                banishRedirectAppliesFrom(e.action, n, myTopNum, banishedOpAttrsOf(opTopCardNum)) &&
                banishRedirectFrontMatches(e.action, zi, banishedOpAttrsOf(opTopCardNum)) &&
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
          // FROZEN_SIGNI_BANISH_TO_DECK_BOTTOM / FROZEN_SIGNI_TO_TRASH_ON_LEAVE:
          // どちらも被バニッシュ側の対戦相手（攻撃側=myS）が holder。
          // FROZEN_SIGNI_TO_TRASH_ON_LEAVE: 攻撃側CONTが有効なら相手凍結シグニはトラッシュへ
          const myFrozenOvr = wasOpFrozen
            ? collectFrozenBanishOverrides(myS, opS, true, battleCardMap, effectsMap, myTopNum, effectivePowers)
            : { frozenBanishToDeckBottom: false, frozenLeaveToTrash: false };
          const frozenToDeckBottom = myFrozenOvr.frozenBanishToDeckBottom;
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
          // 🔴**§5.3 O-48（2026-08-24 V-86(b) で発見・実機で確認）＝バニッシュの行き先はトップ1枚だけ**。
          //   ルール＝「ライズのシグニが場を離れるとき、**下にあったカードはトラッシュ**に置かれる」。
          //   従来は `...opStack`（スタック全部）をエナ／手札／デッキ／ルリグトラッシュへ送っており、
          //   **下のカードがトラッシュに落ちない**＝`fromLeftFieldUnder`（「このシグニの下にあった…」＝live 4効果）が
          //   **バトルで倒された場合に限り候補0件で恒久 no-op** になっていた。
          //   ⚠**engine 側（`effectExecutor` の効果バニッシュ）は元から正しい**＝壊れていたのはこのバトル経路だけ。
          //   ⚠`banishedOpUnderCards` は上で `stack.slice(0,-1)` として既に確定済み（トリガー収集も同じ値を使う）。
          const opTopOnly = opTopCardNum ? [opTopCardNum] : [];
          const opUnderToTrash = banishedOpUnderCards;
          newOpState = {
            ...opS,
            hand: redirectBanishToHand ? [...opS.hand, ...opTopOnly] : opS.hand,
            deck: (frozenToDeckBottom || energyToDeckBottom) ? [...opS.deck, ...opTopOnly] : opS.deck,
            energy: anyRedirect ? opS.energy : [...opS.energy, ...opTopOnly],
            lrig_trash: banishToLrigTrash ? [...opS.lrig_trash, ...opTopOnly] : opS.lrig_trash,
            trash: [
              ...opS.trash,
              ...((redirectBanish || frozenToTrash || banishBySelftToTrash || defenderLeaveExile) ? opTopOnly : []),
              ...opUnderToTrash,
              ...banishExtraTrash,
            ],
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
          // ⚠「このシグニは対戦相手にダメージを与えない」（WX25-CP1-074 が付与）はここも止める
          //   ＝止めないと「バトルに勝ったときだけダメージが通る」半端な近似になる。
          const lancerApplies = isSLancer || (isLancer && hasApplicableLancer(lancerKeywords, opPower));
          if (lancerApplies && cannotDealDamageToOpp) {
            appendBattleLogs([`${myCardName}は対戦相手にダメージを与えない（${isSLancer ? 'Sランサー' : 'ランサー'}のクラッシュなし）`]);
          } else if (lancerApplies) {
            const label = isSLancer ? 'Sランサー' : 'ランサー';
            const { newState: afterCrash, crashed, prevented, crashOpponentInstead } = crashOneLife(newOpState, { opponent: newMyState, isTurnPlayer: bs.active_user_id !== user.id }, { type: 'signi', level: parseInt(battleCardMap.get(myTopNum)?.Level ?? '', 10) || undefined }, myTopNum, isSLancer ? 'Sランサー' : 'ランサー');
            if (crashOpponentInstead) {
              // ライフクラッシュ置換「代わりに対戦相手のライフクロスをクラッシュする」＝
              // 置換した側（防御側）から見た「対戦相手」＝**アタックしている自分**のライフを割る。
              newOpState = afterCrash;
              for (let i = 0; i < crashOpponentInstead; i++) newMyState = crashOneLife(newMyState, { opponent: newOpState, isTurnPlayer: bs.active_user_id === user.id }).newState;
            } else if (prevented) {
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
                await persist.commit(reduceBattle(bs, { type: 'END_GAME', winnerId: attackerId, myKey, myState: newMyState, opp: { key: opKey, state: newOpState } }));
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

        // 🔴**§5.3 O-47（2026-08-24 V-86 の道中で発見・実機ログで確認）＝負けた／相打ちのアタッカーもバニッシュされる。**
        //   ルール＝「バトルではパワーの低いシグニがバニッシュされる。パワーが同じ場合は**両方**」。
        //   従来この関数は `myPower >= opPower` で**防御側だけ**を消し、負けたときは
        //   `「…はバトルに敗北」` とログするだけで**アタッカーが場に残り続けていた**
        //   （実測ログ＝`シヴァ（10000）vs ゴッドイーター（15000）` → 敗北ログ → シヴァは場に残存）。
        //   ⚠**攻撃側・防御側とも人間/CPU が同じ関数を通る**ので、この1点で全対戦に効く。
        // ⚠**行き先変更はトップ1枚にだけ適用**。下にあったカードは O-48 どおり常にトラッシュへ。
        if (myPower <= opPower && (newMyState.field.signi[zoneIndex] ?? []).at(-1) === myTopNum) {
          const myStackAB = newMyState.field.signi[zoneIndex] ?? [];
          banishedMyCardNum = myTopNum;
          banishedMyUnderCards = myStackAB.slice(0, -1);
          const newMySigniAB = [...newMyState.field.signi] as (string[] | null)[];
          newMySigniAB[zoneIndex] = null;
          const newMyDownAB   = [...(newMyState.field.signi_down   ?? [false, false, false])];
          const newMyFrozenAB = [...(newMyState.field.signi_frozen ?? [false, false, false])];
          const newMyCharmsAB = [...(newMyState.field.signi_charms ?? [null, null, null])];
          const newMyAcceAB   = cloneAcceSlots(newMyState.field);
          const wasMyFrozen = myS.field.signi_frozen?.[zoneIndex] ?? false;
          newMyDownAB[zoneIndex] = false;
          newMyFrozenAB[zoneIndex] = false;
          const myExtraTrashAB: string[] = [];
          if (newMyCharmsAB[zoneIndex]) { myExtraTrashAB.push(newMyCharmsAB[zoneIndex]!); newMyCharmsAB[zoneIndex] = null; }
          if (newMyAcceAB[zoneIndex])   { myExtraTrashAB.push(...newMyAcceAB[zoneIndex]!); newMyAcceAB[zoneIndex] = null; }
          // O-49: 防御側パスの「被バニッシュ側の対戦相手が holder」を myS↔opS でミラー。
          // 【シュート】とパワー0専用選択はアタッカー自身のバトル敗北には適用しない。
          const redirectMyBanish =
            opS.banish_redirect === true ||
            isSelectedBanishRedirect(opS, myTopNum) ||
            isSelectedBattleBanishRedirect(opS, myTopNum) ||
            (opS.banish_redirect_by_source_nums ?? []).includes(opTopCardNum) ||
            opS.field.signi.some((s, zi) => {
              const n = s?.at(-1);
              return n && (effectsMap.get(n) ?? []).some(e =>
                e.effectType === 'CONTINUOUS' &&
                banishRedirectAppliesFrom(e.action, n, opTopCardNum, banishedMyAttrsOf(myTopNum)) &&
                banishRedirectFrontMatches(e.action, zi, banishedMyAttrsOf(myTopNum)) &&
                checkActiveCondition(e.activeCondition, opS, myS, false, battleCardMap, n, effectivePowers),
              );
            });
          const redirectMyBanishToHand = opS.banish_redirect_to_hand === true;
          const redirectMyBanishToExile = !redirectMyBanish && !redirectMyBanishToHand && opS.banish_redirect_to_exile === true;
          const banishMyByOpponentToTrash =
            (opS.banish_to_trash_by_self ?? []).includes(opTopCardNum) ||
            (effectsMap.get(opTopCardNum ?? '') ?? []).some(eff =>
              eff.effectType === 'CONTINUOUS' &&
              (eff.action as import('../types/effects').StubAction).type === 'STUB' &&
              (eff.action as import('../types/effects').StubAction).id === 'BANISH_BY_SELF_GOES_TO_TRASH' &&
              checkActiveCondition(eff.activeCondition, opS, myS, false, battleCardMap, opTopCardNum ?? '', effectivePowers),
            );
          // 凍結シグニは通常アタックできないため実戦ではほぼ立たないが、行き先規約を対称に保つ。
          const opFrozenOvr = wasMyFrozen
            ? collectFrozenBanishOverrides(opS, myS, false, battleCardMap, effectsMap, opTopCardNum, effectivePowers)
            : { frozenBanishToDeckBottom: false, frozenLeaveToTrash: false };
          const frozenMyToDeckBottom = opFrozenOvr.frozenBanishToDeckBottom;
          const frozenMyToTrash = !frozenMyToDeckBottom && opFrozenOvr.frozenLeaveToTrash;
          const banishMyToLrigTrash = !redirectMyBanish && !redirectMyBanishToHand && !frozenMyToDeckBottom && !frozenMyToTrash && !banishMyByOpponentToTrash &&
            (effectsMap.get(myTopNum) ?? []).some(eff =>
              eff.effectType === 'CONTINUOUS' &&
              (eff.action as import('../types/effects').StubAction).type === 'STUB' &&
              (eff.action as import('../types/effects').StubAction).id === 'BANISH_TO_LRIG_TRASH_INSTEAD',
            );
          const attackerLeaveExile = (effectsMap.get(myTopNum) ?? []).some(eff =>
            eff.effectType === 'CONTINUOUS' &&
            (eff.action as import('../types/effects').StubAction).type === 'STUB' &&
            (eff.action as import('../types/effects').StubAction).id === 'BATTLE_LEAVE_REPLACE_WITH_EXILE' &&
            checkActiveCondition(eff.activeCondition, myS, opS, true, battleCardMap, myTopNum),
          );
          const anyMyRedirect = redirectMyBanish || redirectMyBanishToHand || redirectMyBanishToExile ||
            frozenMyToDeckBottom || frozenMyToTrash || banishMyByOpponentToTrash || banishMyToLrigTrash || attackerLeaveExile;
          banishedMyWentToTrash = redirectMyBanish || frozenMyToTrash || banishMyByOpponentToTrash || attackerLeaveExile;
          newMyState = {
            ...newMyState,
            hand: redirectMyBanishToHand ? [...newMyState.hand, myTopNum] : newMyState.hand,
            deck: frozenMyToDeckBottom ? [...newMyState.deck, myTopNum] : newMyState.deck,
            energy: anyMyRedirect ? newMyState.energy : [...newMyState.energy, myTopNum],
            lrig_trash: banishMyToLrigTrash ? [...newMyState.lrig_trash, myTopNum] : newMyState.lrig_trash,
            trash: [
              ...newMyState.trash,
              ...(banishedMyWentToTrash ? [myTopNum] : []),
              ...banishedMyUnderCards,
              ...myExtraTrashAB,
            ],
            field: {
              ...newMyState.field,
              signi: newMySigniAB,
              signi_down:   newMyDownAB,
              signi_frozen: newMyFrozenAB,
              signi_charms: newMyCharmsAB,
              signi_acce:   newMyAcceAB,
            },
          };
          appendBattleLogs([`${myCardName}がバニッシュされた（バトル${myPower === opPower ? '相打ち' : '敗北'}）${redirectMyBanish ? '（トラッシュへ）' : redirectMyBanishToHand ? '（手札へ）' : redirectMyBanishToExile ? '（ゲームから除外）' : frozenMyToDeckBottom ? '（凍結→デッキ下）' : frozenMyToTrash ? '（凍結→トラッシュ）' : banishMyToLrigTrash ? '（ルリグトラッシュへ）' : attackerLeaveExile ? '（除外＝トラッシュへ）' : ''}`]);
        }
      } else if (isSideAttack && !sideAttackEmptyZoneDealsDamage(myS, myTopNum, battleCardMap)) {
        // ─── 側面アタックで対象シグニゾーンが空 → 何も起こらない（バトルもダメージもなし）───
        // ⚠ WX16-021（このターン、＜英知＞は空ゾーンへの側面アタックを正面扱いにする）が有効なら
        //   この分岐を飛ばして下のライフアタックへ落とす＝**ボタン生成側と同じ関数で判定する**。
        appendBattleLogs([`${myCardName}の側面アタック：対象のシグニゾーンにシグニがいないため何も起こらない`]);
      } else if (cannotDealDamageToOpp) {
        // ─── 「このシグニは対戦相手にダメージを与えない」（WX25-CP1-074-E1 の付与）───
        appendBattleLogs([`${myCardName}は対戦相手にダメージを与えない`]);
      } else {
        // ─── ライフへのアタック（正面空 or アサシン）───
        const crashCount = isTripleCrush ? 3 : isDoubleCrush ? 2 : 1;
        const attackLabel = isAssassin && opTopCardNum
          ? `${myCardName}（アサシン）がライフをクラッシュ`
          : `${myCardName}がライフをクラッシュ`;

        // 1枚目クラッシュ
        const { newState: afterFirst, crashed: firstCrashed, prevented: firstPrevented, crashOpponentInstead: firstCrashOpp } = crashOneLife(newOpState, { opponent: newMyState, isTurnPlayer: bs.active_user_id !== user.id }, { type: 'signi', level: parseInt(battleCardMap.get(myTopNum)?.Level ?? '', 10) || undefined }, myTopNum);
        if (firstCrashOpp) {
          // ライフクラッシュ置換「代わりに対戦相手のライフクロスをクラッシュする」（WX25-P3-004）。
          // ⚠置換した側から見た「対戦相手」＝**アタックしている自分**なので、割れるのは自分のライフ。
          newOpState = afterFirst;
          for (let i = 0; i < firstCrashOpp; i++) newMyState = crashOneLife(newMyState, { opponent: newOpState, isTurnPlayer: bs.active_user_id === user.id }).newState;
        } else if (firstPrevented) {
          appendBattleLogs([`${myCardName}がアタック：ダメージ無効`]);
          newOpState = afterFirst;
        } else if (!firstCrashed) {
          if (newOpState.prevent_defeat) {
            appendBattleLogs([`${myCardName}がアタック：ライフなし → 敗北無効`]);
            newOpState = { ...newOpState, prevent_defeat: undefined };
          } else {
            // ライフなし → 相手の敗北
            appendBattleLogs([`${myCardName}がアタック：相手のライフなし → 相手の敗北`]);
            await persist.commit(reduceBattle(bs, { type: 'END_GAME', winnerId: attackerId, myKey, myState: newMyState }));
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
            pending_crash_source_card_nums: [...(newOpState.pending_crash_source_card_nums ?? []), myTopNum],
            // §5.3 O-120: 原因列も**同じ長さで**伸ばす（伸ばさないと添字がずれて別のクラッシュの原因を読む）。
            //   ダブル/トリプルクラッシュはバトルダメージなので原因は null（不明）。
            pending_crash_causes: [...(newOpState.pending_crash_causes ?? []), null],
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
      // Quoted abilities granted by an activated effect cannot become entries in
      // effectsMap at runtime. GRANT_KEYWORD stores the equivalent capability here.
      const hasGrantedMZA = (dynamicKeywords.my[myTopNum] ?? []).includes('正面以外追加アタック')
        || (newMyState.keyword_grants?.[myTopNum] ?? []).includes('正面以外追加アタック');
      if (mzaEffect || hasGrantedMZA) {
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

      // ADJACENT_ZONE_ATTACK / 正面隣追加アタック:
      // 条件成立時、正面に加えて隣ゾーン1つにも追加バトル（WD20-009・WX15-094〜096等）
      const azaEffect = (effectsMap.get(myTopNum) ?? []).find(e =>
        e.effectType === 'CONTINUOUS' && e.action.type === 'STUB' &&
        (e.action as import('../types/effects').StubAction).id === 'ADJACENT_ZONE_ATTACK' &&
        checkActiveCondition(e.activeCondition, myS, newOpState, true, battleCardMap, myTopNum),
      );
      const hasGrantedAZA = (dynamicKeywords.my[myTopNum] ?? []).includes('正面隣追加アタック')
        || (newMyState.keyword_grants?.[myTopNum] ?? []).includes('正面隣追加アタック');
      if (azaEffect || hasGrantedAZA) {
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
                // 自己スコープ（「**このシグニ**が《ヘブン》したとき」）だけをここで拾う。
                // 味方監視（`any_ally`）は下の watcher ループが担当＝ここで拾うと二重発火する。
                if ((e.triggerScope ?? 'self') !== 'self') continue;
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
            // 🆕2026-08-28（Sheet1 バッチ）＝**味方監視スコープ（`any_ally`）の ON_HEAVEN**。
            //   原文「あなたの〔色の〕シグニが《ヘブン》したとき」（全 CSV で12効果）は、**ヘブンした
            //   クロスシグニ自身ではないカード**（ルリグ6枚＋非クロスのシグニ）に載る。従来この収集は
            //   `heavenZoneNums`（＝ヘブンしたシグニ）しか見ておらず、**9効果が一度も発火しない死に能力**だった。
            //   ⚠発火は**ヘブン1回につき1度**（ヘブンしたシグニの体数だけ繰り返さない）＝原文は
            //     「あなたのシグニが《ヘブン》したとき」であって「1体につき」ではない。
            //   ⚠`triggerFilter`（「あなたの**赤の**シグニが」＝`WX08-025-E3`）は
            //     **ヘブンしたシグニのいずれかが一致すれば成立**とする（複数体が同時にヘブンするため）。
            {
              const heavenCards = heavenZoneNums.map(n => battleCardMap.get(getCardNum(n)));
              const lrigTopH = stateAfterDown.field.lrig.at(-1);
              const watcherNumsH = [
                ...stateAfterDown.field.signi.flatMap(stack => stack?.at(-1) ? [stack.at(-1)!] : []),
                ...(lrigTopH ? [lrigTopH] : []),
              ];
              for (const watcherNum of watcherNumsH) {
                for (const e of (effectsMap.get(getCardNum(watcherNum)) ?? [])) {
                  if (e.effectType !== 'AUTO' || !e.timing?.includes('ON_HEAVEN')) continue;
                  const scopeH = e.triggerScope ?? 'self';
                  if (scopeH !== 'any_ally' && scopeH !== 'any') continue;
                  if (e.triggerFilter?.excludeSelf && heavenZoneNums.every(n => n === watcherNum)) continue;
                  if (e.triggerFilter) {
                    const { excludeSelf: _exH, ...restFilterH } = e.triggerFilter;
                    if (Object.keys(restFilterH).length > 0
                      && !heavenCards.some(c => matchesFilter(c, restFilterH))) continue;
                  }
                  heavenEntries.push({
                    id: generateUUID(),
                    playerId: attackerId,
                    cardNum: watcherNum,
                    effectId: e.effectId,
                    label: `${battleCardMap.get(getCardNum(watcherNum))?.CardName ?? watcherNum} の【自】効果（味方がヘブンヘブン）`,
                    effect: e,
                  } satisfies StackEntry);
                }
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

      // §5.3 `O-81`＝裏向きで付けられたカードの回収（公開して持ち主の手札へ）。
      // ⚠**トリガー収集より前に置く**＝`WX16-003-E3`（`FACEDOWN_REVEALED_JUST`／`levelEqFacedownRevealed`）は
      //   `facedown_revealed_just` を**収集時に**読むので、後ろに置くと発火しない。
      // ⚠バトル解決は `removeFromField` を通らず `field` を手で組み直す＝ここで拾わないと
      //   付いたカードが場からも手札からも消える（2026-08-26 実機検証で実測）。
      newMyState = sweepFacedownAttached(newMyState);
      newOpState = sweepFacedownAttached(newOpState);

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
            undefined,
            myTopNum,
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
      // §5.3 O-47：**アタッカー自身がバニッシュされた**ぶんの ON_BANISH も同じ funnel で収集する。
      // ⚠盤面だけ直してトリガーを配線しないと、「消えるようになったのに【自】が誰も反応しない」という
      //   別の無言の穴を新しく作ることになる（防御側と同型の2本＝ON_BANISH と ON_LEAVE_FIELD を張る）。
      if (banishedMyCardNum) {
        const banishResMine = collectBanishTriggers(
          banishedMyCardNum,
          attackerId,
          newHostState,
          newGuestState,
          myS, // アタッカーのバトル前状態
          undefined,
          opTopCardNum ?? undefined,
        );
        banishEntries.push(...banishResMine.entries);
        const usedMineAB = attackerIsHost ? banishResMine.usedHostIds : banishResMine.usedGuestIds;
        const usedOppAB  = attackerIsHost ? banishResMine.usedGuestIds : banishResMine.usedHostIds;
        if (usedMineAB.length > 0) newMyState.actions_done = [...(newMyState.actions_done ?? []), ...usedMineAB];
        if (usedOppAB.length > 0)  newOpState = { ...newOpState, actions_done: [...(newOpState.actions_done ?? []), ...usedOppAB] };
      }

      // ON_SIGNI_BANISH_BATTLE / ON_SIGNI_BANISH_OPPONENT: （バトルで）相手シグニをバニッシュしたとき
      // scope 'self'（デフォルト）はバニッシュしたアタッカー自身のみ、'any_ally'/'any' は自フィールド全シグニ。
      // ON_SIGNI_BANISH_OPPONENT（「対戦相手のシグニをバニッシュしたとき」）は現状バトルバニッシュ経路のみ配線（WD12-012/013/014/015）。
      const battleBanishEntries: StackEntry[] = [];
      if (banishedOpCardNum) {
        // §5.3 O-121: **バトルによるバニッシュ**を台帳へ積む（`byEffect:false`）。
        //   🔴ここを落とすと「効果では数えるがバトルでは数えない」半分だけ効く条件になる
        //   （`WX11-031-E1` の発火 timing `ON_SIGNI_BANISH_OPPONENT` は**バトル経路にしか配線されていない**ので、
        //    バトル側を落とすと条件が永久に成立しない＝恒久 no-op）。
        newMyState = { ...newMyState, opp_signi_banished_this_turn: [
          ...(newMyState.opp_signi_banished_this_turn ?? []),
          { by: myTopNum, byEffect: false },
        ] };
        const usedIdsBB: string[] = [];
        // banishedFilter（被バニッシュシグニの限定・タスク16[B]）: 「感染状態の/凍結状態の/【チャーム】が付いている
        // シグニをバニッシュしたとき」（WX16-079/WXK02-054/WXEX2-76 等）。チャーム/ウィルス/凍結はバニッシュで
        // 場から消えるゾーン状態のため、防御側の**バトル前状態（opS）**の被バニッシュゾーンで判定する（pre-banish スナップ）。
        // 犠牲（BanishSubstitute）経路では正面以外のゾーンが落ちるので findIndex で引く。
        const banishedZoneIdxBB = opS.field.signi.findIndex(s => s?.at(-1) === banishedOpCardNum);
        // watcher＝自フィールドのシグニ＋（付与ストア経由でのみ watcher になりうる）センタールリグ。
        // ルリグは印刷能力ではこの timing の watcher にならないが、「ターン終了時まで、このルリグは
        // 『【自】あなたのシグニ1体がバトルによってシグニ1体をバニッシュしたとき…』を得る」（WXDi-P12-041-E1）が
        // effectsMap に載らない付与ストアへ入るため、ここを走査しないと構造どおりでも恒久 no-op になる。
        const bbWatchers: { num: string; effs: import('../types/effects').CardEffect[] }[] = [];
        for (const stackBB of newMyState.field.signi) {
          const topNumBB = stackBB?.at(-1);
          if (topNumBB) bbWatchers.push({ num: topNumBB, effs: effectsMap.get(topNumBB) ?? [] });
        }
        const bbLrigTop = newMyState.field.lrig.at(-1);
        if (bbLrigTop) {
          const grantedBB = [
            ...grantedStoreWatchers(newMyState, 'ON_SIGNI_BANISH_OPPONENT', ['any_ally', 'any']),
            ...grantedStoreWatchers(newMyState, 'ON_SIGNI_BANISH_BATTLE', ['any_ally', 'any']),
          ].map(w => w.effect);
          if (grantedBB.length > 0) bbWatchers.push({ num: bbLrigTop, effs: grantedBB });
        }
        for (const { num: topNumBB, effs: effsBB } of bbWatchers) {
          for (const eff of effsBB) {
            if (eff.effectType !== 'AUTO' ||
                !(eff.timing?.includes('ON_SIGNI_BANISH_BATTLE') || eff.timing?.includes('ON_SIGNI_BANISH_OPPONENT'))) continue;
            // 主体 scope/filter（story・実効パワー等）と《ターン1回》は pure helper と golden で共通検査する。
            // ⚠ 2つの Map はキーの形が違う＝`battleCardMap` は素の cardNum キーなので `getCardNum()` が要るが、
            //   `effectivePowers`（calcFieldPowers）は**場のスタック頂点をそのままキーにする**ため
            //   `#N` 付きインスタンスIDのまま引く。ここで `getCardNum()` を噛ませるとトークン/複製シグニで
            //   lookup が外れ、黙って表記パワーへフォールバックする（＝パワー条件が効かない）。
            //   同ファイルの他の `effectivePowers.get(...)` も全て raw（例: 8205 行の battleOpponentNum）。
            if (!battleBanisherMatchesTrigger(
              eff, topNumBB, myTopNum, battleCardMap.get(getCardNum(myTopNum)),
              effectivePowers.get(myTopNum), myS.actions_done, usedIdsBB,
            )) continue;
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
              banishedSigniPower: effectivePowers.get(banishedOpCardNum)
                ?? (parseInt(battleCardMap.get(getCardNum(banishedOpCardNum))?.Power ?? '0') || 0),
            } satisfies StackEntry);
          }
        }
        if (usedIdsBB.length > 0) {
          newMyState.actions_done = [...(newMyState.actions_done ?? []), ...usedIdsBB];
        }
        // INSTALL_DELAYED_TRIGGER（B3・タスク12(lxi) 第7波）: アタッカー側プレイヤーに設置された
        // ON_SIGNI_BANISH_BATTLE watcher（`WX24-P4-011-E3`）。場のシグニ効果だけを見ていた従来の収集では
        // 「このターン、あなたのシグニがバトルによって…したとき」の遅延分が拾えず、parser 側は設置を
        // 落として**その場で無条件にダメージ**を与える過剰実行になっていた。
        const delayedBattleBanish = consumeBattleBanishDelayedTriggers(newMyState);
        newMyState = delayedBattleBanish.state;
        battleBanishEntries.push(...pureCollectBattleBanishDelayedTriggers(
          mkTrigCtx(), attackerId, newMyState, myTopNum, delayedBattleBanish.fired,
        ));
      }

      // ON_TRASH: banish_redirect=true の場合、バニッシュされたシグニがトラッシュへ
      const trashEntriesSA: StackEntry[] = [];
      const redirectBanishForTrigger =
        myS.banish_redirect === true ||
        (banishedOpCardNum != null && isSelectedBanishRedirect(myS, banishedOpCardNum)) ||
        (banishedOpCardNum != null && isSelectedBattleBanishRedirect(myS, banishedOpCardNum)) ||
        (myS.banish_redirect_by_source_nums ?? []).includes(myTopNum) ||
        myS.field.signi.some((s, zi) => {
          const n = s?.at(-1);
          // 上の redirectBanish（実際の行き先判定）と同じ条件にする＝bySource 付きはバトル当事者のみ・
          // target.filter も同じ被バニッシュシグニ属性で評価する（トリガー発火可否を実際の行き先と一致させる）。
          return n && (effectsMap.get(n) ?? []).some(e =>
            e.effectType === 'CONTINUOUS' &&
            banishRedirectAppliesFrom(e.action, n, myTopNum, banishedOpAttrsOf(banishedOpCardNum)) &&
            banishRedirectFrontMatches(e.action, zi, banishedOpAttrsOf(banishedOpCardNum)) &&
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
      // O-49: アタッカー側のバニッシュが実際にトラッシュへ行ったときの ON_TRASH。
      // 行き先条件はここで再記述せず、盤面書き換えに使った banishedMyWentToTrash を共有する。
      if (banishedMyCardNum && banishedMyWentToTrash) {
        // バトル起因なので fromFieldByCostOrEffect/byEffect はいずれも false。
        const ttMine = collectTrashTriggers(banishedMyCardNum, attackerId, newHostState, newGuestState, false, false, false);
        trashEntriesSA.push(...ttMine.entries);
        const ttmUsedMine = attackerIsHost ? ttMine.usedHostIds : ttMine.usedGuestIds;
        const ttmUsedOpp  = attackerIsHost ? ttMine.usedGuestIds : ttMine.usedHostIds;
        if (ttmUsedMine.length > 0) newMyState.actions_done = [...(newMyState.actions_done ?? []), ...ttmUsedMine];
        if (ttmUsedOpp.length > 0)  newOpState = { ...newOpState, actions_done: [...(newOpState.actions_done ?? []), ...ttmUsedOpp] };
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
      // §5.3 O-47：アタッカー自身の ON_LEAVE_FIELD（防御側と同型）。
      if (banishedMyCardNum) {
        const lfMine = collectLeaveFieldTriggers(banishedMyCardNum, banishedMyUnderCards, attackerId, newHostState, newGuestState);
        leaveEntriesSA.push(...lfMine.entries);
        const lfmUsedMine = attackerIsHost ? lfMine.usedHostIds : lfMine.usedGuestIds;
        const lfmUsedOpp  = attackerIsHost ? lfMine.usedGuestIds : lfMine.usedHostIds;
        if (lfmUsedMine.length > 0) newMyState.actions_done = [...(newMyState.actions_done ?? []), ...lfmUsedMine];
        if (lfmUsedOpp.length > 0)  newOpState = { ...newOpState, actions_done: [...(newOpState.actions_done ?? []), ...lfmUsedOpp] };
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

      // ON_SIGNI_CRASHED_LIFE_TOTAL（WX05-020-E1「このシグニが1ターンにライフクロスを合計2枚以上
      // クラッシュしたとき」）: このアタックで実際に減ったライフ枚数を**アタックしたシグニ別に累計**し、
      // 合計が閾値へ達したらそのシグニ自身の【自】を収集する。枚数は opS→finalOpState の実差分で数えるので
      // ランサー／ダブル・トリプルクラッシュ／ダメージ無効（0枚）も自動的に正しく数えられる。
      // ⚠効果によるクラッシュ（LIFE_CRASH アクション）は execLifeCrash が同じキーへ加算する（経路が別）。
      const crashTotalEntries: StackEntry[] = [];
      {
        const crashedThisAttack = Math.max(0, opS.life_cloth.length - finalOpState.life_cloth.length);
        if (crashedThisAttack > 0) {
          const prevCrashMap = finalMyState.life_crashed_by_signi_this_turn ?? {};
          const crashTotal = (prevCrashMap[myTopNum] ?? 0) + crashedThisAttack;
          finalMyState = {
            ...finalMyState,
            life_crashed_by_signi_this_turn: { ...prevCrashMap, [myTopNum]: crashTotal },
          };
          const ct = collectSigniCrashTotalTriggers(attackerId, finalMyState, finalOpState, myTopNum, crashTotal);
          crashTotalEntries.push(...ct.entries);
          if (ct.usedOncePerTurnIds.length > 0) {
            finalMyState = { ...finalMyState, actions_done: [...(finalMyState.actions_done ?? []), ...ct.usedOncePerTurnIds] };
          }
        }
      }

      // §6.3 J-4: バトルで場を離れたシグニを離場履歴へ記録する（中央 diff を通らない経路＝実戦で最頻）。
      // ⚠アタックフェイズ以外では起きないので位相判定は不要。
      {
        const leftMine = detectLeftFieldSigni(myS, finalMyState).map(x => x.cardNum);
        const leftOpp  = detectLeftFieldSigni(opS, finalOpState).map(x => x.cardNum);
        if (leftMine.length > 0) finalMyState = { ...finalMyState, signi_left_field_this_attack_phase: [...(finalMyState.signi_left_field_this_attack_phase ?? []), ...leftMine] };
        if (leftOpp.length > 0)  finalOpState = { ...finalOpState, signi_left_field_this_attack_phase: [...(finalOpState.signi_left_field_this_attack_phase ?? []), ...leftOpp] };
      }

      // ON_ATTACK_END（§6.3 J-4・WXK11-018-E2）＝**このアタックの終了時**。バトル・バニッシュ・ライフクラッシュを
      // 解決し終えたここが終了点で、`dealtSigniDamage` が確定しているので「ダメージが与えられていない場合」を判定できる。
      // ⚠アタッカーが場を離れている場合は collector 側の effectsMap 走査に載らない＝自然に発火しない。
      const attackEndEntries: StackEntry[] = [];
      {
        const ae = pureCollectAttackEndTriggers(mkTrigCtx(), attackerId, myTopNum, finalMyState, finalOpState, dealtSigniDamage);
        attackEndEntries.push(...ae.entries);
        if (ae.usedOncePerTurnIds.length > 0) {
          finalMyState = { ...finalMyState, actions_done: [...(finalMyState.actions_done ?? []), ...ae.usedOncePerTurnIds] };
        }
      }

      // Phase 2のトリガー（ON_BANISHなど。ON_ATTACK_SIGNIはPhase 1で処理済み）
      const allTriggers = [...banishEntries, ...battleBanishEntries, ...trashEntriesSA, ...leaveEntriesSA, ...heavenEntries, ...signiBattleEntries, ...damageEntries, ...charmEntries, ...crashTotalEntries, ...attackEndEntries];
      if (allTriggers.length > 0) {
        const turnPlayerId = bs.active_user_id ?? attackerId;
        const existingStack = bs.effect_stack ?? null;
        const stack = existingStack
          ? pushToStack(existingStack, allTriggers)
          : initStack(turnPlayerId, allTriggers);
        await persist.commit(reduceBattle(bs, { type: 'WRITE_STATE', myKey: myKey, myState: finalMyState, opp: { key: opKey, state: finalOpState }, effectStack: stack }));
      } else {
        await persist.commit(reduceBattle(bs, { type: 'WRITE_STATE', myKey: myKey, myState: finalMyState, opp: { key: opKey, state: finalOpState } }));
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
      const newMyState: PlayerState = { ...my, pending_lrig_attack: undefined, pending_lrig_attack_num: undefined };
      const newOpState: PlayerState = { ...op, field: { ...op.field, lrig_attacked: true },
        lrig_attacked_by_num: my.pending_lrig_attack_num };
      await persist.commit(reduceBattle(bs, { type: 'WRITE_STATE', myKey: myKey, myState: newMyState, opp: { key: opKey, state: newOpState } }));
    } finally {
      setLoading(false);
    }
  };

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
  ): { blocked: boolean; colorless: number } => {
    const banCost = lrigAttackBanCost(my, lrigNum, battleCardMap);
    // 解除できない ban（「アタックできない」だけ）が掛かっている＝どれだけ払っても不可。
    if (banCost === null) return { blocked: true, colorless: 0 };
    const colorless = collectOppLrigAttackExtraCost(op, my, battleCardMap, effectsMap, false) + banCost.colorless;
    // 「手札をN枚捨てないかぎり」のルリグ版は**母集団0**（原文はいずれもシグニ）。
    // 万一生えたら支払いUIが無いので過少側（アタック不可）に倒す＝無言で無視しない。
    const blocked = banCost.handDiscard > 0 || my.energy.length < colorless;
    return { blocked, colorless };
  };

  // ルリグアタックの実行（人間・CPU共通）: アタッカーのルリグをダウンし防御側にガード応答を要求。
  // アタック不可（ドライブ状態・無効化等）の場合は状態を変えずに false を返す
  const performLrigAttack = async (p: {
    attacker: PlayerState; defender: PlayerState;
    attackerId: string;
    attackerKey: 'host_state' | 'guest_state';
    /**
     * アタック元のルリグ枠（省略＝センター）。`assist_l`/`assist_r` は `ASSIST_LRIG_ATTACK_THIS_TURN`
     * が立っているターンだけ到達する（§6.4 A群・続き427）。
     * ⚠**センター専用の判定・収集はアシストでは飛ばす**＝`lrig_has_attacked`（センターの1回制限）、
     *   ドライブ状態（ルリグに乗っているシグニ）、センタールリグ付与ストア由来の ON_ATTACK_LRIG。
     *   ここを共有すると「アシストがアタックしたらセンターも撃てなくなる」等の別バグになる。
     */
    slot?: LrigAttackSlot;
  }): Promise<boolean> => {
    const { attacker: my, defender: op, attackerId } = p;
    const slot: LrigAttackSlot = p.slot ?? 'center';
    const isCenterAttack = slot === 'center';
    if (isCenterAttack && my.lrig_has_attacked) return false; // このターン既に攻撃済み（ON_ATTACK_LRIGでアップされても再攻撃不可）
    if (isCenterAttack && my.field.lrig_down) return false; // すでに攻撃済み
    if (!isCenterAttack && !assistLrigAttackableSlots(my, battleCardMap).includes(slot)) return false;
    if (op.field.lrig_attacked) return false; // ガード応答待ち中
    const myLrigNumLA = lrigSlotTop(my, slot);
    const allowDriveAttack = !!(myLrigNumLA && (effectsMap.get(myLrigNumLA) ?? []).some(e =>
      e.effectType === 'CONTINUOUS' &&
      (e.action as import('../types/effects').StubAction).type === 'STUB' &&
      (e.action as import('../types/effects').StubAction).id === 'ALLOW_ATTACK_WHILE_DRIVE',
    ));
    if (isCenterAttack && (my.lrig_riding_signi?.length ?? 0) > 0 && !allowDriveAttack) return false; // ドライブ状態：ルリグはアタックできない
    // keyword_grants で「アタックできない」が付与されている場合アタック不可
    if (myLrigNumLA && (my.keyword_grants?.[myLrigNumLA] ?? []).includes('アタックできない')) return false;
    // 《無》×N の前払い（§6.4 O-28）＝払えないならアタックそのものが成立しない。
    const lrigCostLA = lrigAttackCostInfo(my, op, myLrigNumLA);
    if (lrigCostLA.blocked) return false;
    // NEGATE_ATTACK: ルリグもアタック宣言時に無効化。escapeDiscard があり手札を払える場合は既存回避UIへ。
    // （旧 PREVENT_TARGET_LRIG_ATTACK_THIS_TURN の判定を統合＝同じ negated_attacks を見る）
    // ⚠回避モーダルを開けるのは自分のアタックのときだけ。CPU/リモート側のアタックは払わず無効化を受け入れる。
    const targetedLrigNegation = getTargetedAttackNegation(my, myLrigNumLA);
    if (targetedLrigNegation.negated) {
      const escapeCount = targetedLrigNegation.escapeDiscard;
      if (escapeCount && my.hand.length >= escapeCount && attackerId === user.id) {
        openNegateEscape({ zoneIndex: -1, cardNum: myLrigNumLA!, count: escapeCount });
        return false;
      }
      setLoading(true);
      try {
        const accepted = resolveNegateEscapeChoice(my, op, 'accept', myLrigNumLA!, -1);
        const defenderKey: 'host_state' | 'guest_state' = p.attackerKey === 'host_state' ? 'guest_state' : 'host_state';
        appendBattleLogs([`${battleCardMap.get(myLrigNumLA!)?.CardName ?? myLrigNumLA}のアタックは無効化された`]);
        await persist.commit(reduceBattle(bs, {
          type: 'WRITE_STATE',
          myKey: p.attackerKey,
          myState: accepted.attacker,
          opp: { key: defenderKey, state: accepted.defender },
        }));
      } finally {
        setLoading(false);
      }
      return true;
    }
    setLoading(true);
    try {
      const myKey = p.attackerKey;
      const lrigNum = myLrigNumLA ?? '';
      const lrigName = battleCardMap.get(lrigNum)?.CardName ?? 'ルリグ';
      // 《無》の前払い（OPP_LRIG_ATTACK_COST＋付与された ban）＝可否は上の `lrigAttackCostInfo` で判定済み。
      // ⚠ここは引き落としだけ（続き490 の「判定と引き落としを別軸にしない」と同じ規約）。
      const lrigAttackExtraCost = lrigCostLA.colorless;
      let myEnergyAfterAttack = my.energy;
      if (lrigAttackExtraCost > 0) {
        const removed = myEnergyAfterAttack.slice(-lrigAttackExtraCost);
        myEnergyAfterAttack = myEnergyAfterAttack.slice(0, -lrigAttackExtraCost);
        appendBattleLogs([`ルリグアタック追加コスト（《無》×${lrigAttackExtraCost}）消費：${removed.map(n=>battleCardMap.get(n)?.CardName??n).join('、')}`]);
      }
      appendBattleLogs([`${lrigName}がアタック`]);
      const attackedMyState: PlayerState = {
        ...my, energy: myEnergyAfterAttack,
        ...(isCenterAttack ? { lrig_has_attacked: true } : {}),
        field: markLrigSlotDown(my, slot),
      };
      // NEGATE_NTH_ATTACK は「アタックしたとき」に無効化するため、追加コスト支払い・ダウン・攻撃済み化は行う。
      // ただし pending_lrig_attack を立てず、ON_ATTACK_LRIG収集とガード/ダメージ応答へは進めない。
      const lrigNegation = consumeNthAttackNegation(op, 'lrig');
      if (lrigNegation.negated) {
        const defenderKey: 'host_state' | 'guest_state' = myKey === 'host_state' ? 'guest_state' : 'host_state';
        appendBattleLogs([`${lrigName}のアタックは無効化された（残り${lrigNegation.remaining}回）`]);
        await persist.commit(reduceBattle(bs, {
          type: 'WRITE_STATE',
          myKey,
          myState: attackedMyState,
          opp: { key: defenderKey, state: lrigNegation.defender },
        }));
        return true;
      }
      // pending_lrig_attack: true でON_ATTACK_LRIG解決後にガード応答（lrig_attacked）をセット
      // ⚠攻撃元カードも一緒に運ぶ＝ダメージ解決（ダブル/トリプルクラッシュ判定）が
      //   「攻撃側＝センタールリグ」と決め打てなくなったため（アシストのアタック・続き427）。
      let newMyState: PlayerState = { ...attackedMyState, pending_lrig_attack: true, pending_lrig_attack_num: lrigNum };
      // lrig_attacked は ON_ATTACK_LRIG 解決後にセット（スタック解決後の useEffect で対応）

      // ON_ATTACK_LRIG AUTO トリガー収集（ルリグカード自身の効果 + スペル付与の能力 + COPY_LRIG_NAME_ABILITYコピー効果）
      const lrigCardEffects = (effectsMap.get(lrigNum) ?? [])
        .filter(e => e.effectType === 'AUTO' && e.timing?.includes('ON_ATTACK_LRIG'));
      // ⚠**付与ストア／コピー／CONTINUOUS 付与はいずれも「センタールリグの能力」**なので、
      //   アシストルリグのアタックでは収集しない（収集すると同じ能力がアシストのアタックでも
      //   撃てる過剰実行になる）。アシストは**そのカード自身の** ON_ATTACK_LRIG だけが発火する。
      const grantedAttack = isCenterAttack
        ? collectAttackingLrigGrantedAutos(newMyState, attackerId, lrigNum, generateUUID)
        : { entries: [] as StackEntry[], triggered: [], usedIds: [] as string[] };
      newMyState = consumeTriggeredGrantedAutos(newMyState, grantedAttack.triggered);
      if (grantedAttack.usedIds.length > 0) {
        newMyState = { ...newMyState, actions_done: [...(newMyState.actions_done ?? []), ...grantedAttack.usedIds] };
      }
      const copiedAutoEffects = (isCenterAttack ? collectCopiedLrigAutoEffects(my, battleCardMap, effectsMap, op, true) : [])
        .filter(e => e.timing?.includes('ON_ATTACK_LRIG'));
      // CONTINUOUS GRANT_LRIG_ABILITY（場のシグニ/キーが「あなたのセンタールリグは『【自】…』を得る」を宣言）由来の
      // ON_ATTACK_LRIG 付与能力（WXDi-P05-032 等）。lrig_granted_auto_effects（実行時付与）とは別ソース。
      // ⚠triggerScope:'any_opp'（「**対戦相手の**センタールリグがアタックしたとき」）は防御側の能力なので
      //   アタック側では拾わない（下の collectLrigAttackDefenderTriggers が担当。タスク12(l)＝WDK04-006）。
      const contGrantedLrigEffects = (isCenterAttack ? collectLrigGrantedEffects(my, op, true, effectsMap, battleCardMap) : [])
        .filter(e => e.effectType === 'AUTO' && e.timing?.includes('ON_ATTACK_LRIG')
          && (e.triggerScope ?? 'self') !== 'any_opp');
      const otherAttackEffects = [...copiedAutoEffects, ...contGrantedLrigEffects];
      // 防御側の付与AUTO（「対戦相手のルリグがアタックしたとき」＝any_opp/any scope・タスク12(xlvii)）。
      // アタック側とは playerId も usageLimit の書き戻し先も異なるため、別の entries として結合する。
      const defenderKey: 'host_state' | 'guest_state' = myKey === 'host_state' ? 'guest_state' : 'host_state';
      const defenderId = attackerId === bs.host_id ? bs.guest_id : bs.host_id;
      const defRes = collectLrigAttackDefenderTriggers(op, my, defenderId);
      const defenderUsed = defRes.usedIds.length > 0
        ? { key: defenderKey, state: { ...op, actions_done: [...(op.actions_done ?? []), ...defRes.usedIds] } }
        : undefined;
      const attackerEntries: StackEntry[] = [...lrigCardEffects.map(e => ({
        id: generateUUID(),
        playerId: attackerId,
        cardNum: lrigNum,
        effectId: e.effectId,
        label: `${lrigName} の【自】効果（アタック時）`,
        effect: e,
      } satisfies StackEntry)), ...grantedAttack.entries, ...otherAttackEffects.map(e => ({
        id: generateUUID(),
        playerId: attackerId,
        cardNum: lrigNum,
        effectId: e.effectId,
        label: `${lrigName} の【自】効果（アタック時）`,
        effect: e,
      } satisfies StackEntry))];
      // アタック側の**味方カード**（場のシグニ／アシストルリグ）が持つ「あなたのルリグがアタックしたとき」
      // ＝§3 (cxxviii)・続き475d で新設。上の4本はいずれも「ルリグ自身の能力」しか見ないので、
      // この経路が無いと 18効果（17枚がシグニ）が丸ごと拾われない。
      const allyRes = collectAllyLrigAttackTriggers(newMyState, attackerId, lrigNum);
      if (allyRes.usedIds.length > 0) {
        newMyState = { ...newMyState, actions_done: [...(newMyState.actions_done ?? []), ...allyRes.usedIds] };
      }
      const entries: StackEntry[] = [...attackerEntries, ...allyRes.entries, ...defRes.entries];
      const existingStackLA = bs.effect_stack ?? null;
      await persist.commit(reduceBattle(bs, {
        type: 'WRITE_STATE', myKey, myState: newMyState, opp: defenderUsed,
        effectStack: entries.length > 0
          ? (existingStackLA ? pushToStack(existingStackLA, entries) : initStack(bs.active_user_id ?? attackerId, entries))
          : undefined,
      }));
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
      const [nextSource, ...remainingSources] = my.pending_crash_source_card_nums ?? [];
      const newMyState: PlayerState = {
        ...my,
        pending_crashed_cards: remaining,
        pending_crash_source_card_nums: remainingSources,
        crash_source_card_num: nextSource ?? undefined,
        field: { ...my.field, check: nextCard },
      };
      const crashedName = battleCardMap.get(nextCard)?.CardName ?? nextCard;
      appendBattleLogs([`ダブルクラッシュ：ライフクロスをクラッシュ（${crashedName}）`]);
      await persist.commit(reduceBattle(bs, { type: 'WRITE_STATE', myKey: stateKey, myState: newMyState }));
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
      const banishProtected = collectBanishEffectProtectedSigni(ownerState, opStateP0, isOwnerTurnP0, effectsMap, battleCardMap, undefined, 'rule', bs.turn_phase);
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
      const banishProtected2 = collectBanishEffectProtectedSigni(ownerState, opStateP02, isOwnerTurnP02, effectsMap, battleCardMap, undefined, 'rule', bs.turn_phase);

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
          // 単体選択×パワー0限定版（WX25-P3-104-E1）。通常のバトル／効果バニッシュ経路には配線しない。
          isSelectedPowerZeroBanishRedirect(opState, topNum) ||
          opState.field.signi.some((s, zi) => {
            const n = s?.at(-1);
            // パワー0以下による消滅はバトル経路ではない＝bySource 付き（このシグニとの/による）は適用しない。
            // 被バニッシュ＝topNum（currentOwner の dieZoneP0）。target.filter で絞る（タスク12(xliv)(a)）。
            const base = parseInt(battleCardMap.get(topNum)?.Level ?? '', 10);
            const p0Attrs = {
              zoneIdx: dieZoneP0 >= 0 ? dieZoneP0 : undefined,
              level: isNaN(base) ? undefined
                : base + (currentOwner.temp_level_mods ?? []).filter(m => m.cardNum === topNum).reduce((sum, m) => sum + m.delta, 0),
              frozen: (currentOwner.field.signi_frozen?.[dieZoneP0] ?? false),
              hasCharm: (currentOwner.field.signi_charms?.[dieZoneP0] ?? null) !== null,
              infected: (currentOwner.field.signi_virus?.[dieZoneP0] ?? 0) > 0,
            };
            return n && (effectsMap.get(n) ?? []).some(e =>
              e.effectType === 'CONTINUOUS' &&
              banishRedirectAppliesFrom(e.action, n, null, p0Attrs) &&
              banishRedirectFrontMatches(e.action, zi, p0Attrs) &&
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
        const bt = collectBanishTriggers(topNum, ownerId, hostState, guestState, currentOwner);
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
      await persist.commit(reduceBattle(bs, {
        type: 'WRITE_STATE', myKey: 'host_state', myState: hostState,
        opp: { key: 'guest_state', state: guestState },
        // 変化が無ければ effect_stack キー自体を書かない（旧 spread と同一パッチ）
        effectStack: newStack !== bs.effect_stack ? newStack : undefined,
      }));
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
          // cause＝CONT効果の発生源（「あなたの効果によって…バニッシュされたとき」banishedByOwnEffect/banishedSourceStory の CONT 経路。G072群C の保守的非発火を解消）
          const bt = collectBanishTriggers(num, ownerId, hostState, guestState, targetState,
            { ownerId: mut.sourceIsHost ? bs.host_id : bs.guest_id, sourceCardNum: mut.sourceCardNum });
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
        // 🔴台帳は**収集の前に**積む（`fireCondition` が今回のダウンを含めて数えるため）。
        hostState = recordSigniDownedThisTurn(hostState, downHost);
        guestState = recordSigniDownedThisTurn(guestState, downGuest);
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
      await persist.commit(reduceBattle(bs, {
        type: 'WRITE_STATE', myKey: 'host_state', myState: hostState,
        opp: { key: 'guest_state', state: guestState },
        // 変化が無ければ effect_stack キー自体を書かない（旧 spread と同一パッチ）
        effectStack: newStack !== bs.effect_stack ? newStack : undefined,
      }));
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

    /**
     * CPU の場のシグニ【起】を1つぶん試す（撃ったら `true`＝呼び出し元は即 return する）。§8／§6.4 `O-1`。
     *
     * ⚠**窓は2つ（`MAIN` の無印【起】／`ATTACK_ARTS` の《アタックフェイズアイコン》付き【起】）だが
     *   通す道は1本**＝窓ごとに書き分けると、片方だけに条件を足したときに気付けない。
     * ⚠**判定は `signiActivateGate`・実行は `performSigniActivated`＝どちらも人間と同じ関数**
     *   （DESIGN §4）。CPU 専用の判定/実行をここに書かない。
     * ⚠1回の呼び出しで**1つだけ**撃つ＝スタック解決（対象選択の自動応答を含む）を待ってから次を選ぶ。
     */
    const tryCpuSigniActivated = async (
      actorState: PlayerState,
      phase: 'MAIN' | 'ATTACK_ARTS',
    ): Promise<boolean> => {
      const pool = buildEnergyPayPool(actorState, { turnPhase: phase, isMyTurn: true, effectsMap });
      const powers = calcFieldPowers(actorState, huSt, true, effectsMap, battleCardMap, phase);
      const stripped = isEnaMultiStripped(actorState, huSt, false, effectsMap, battleCardMap);
      const choice = pickCpuSigniActivated({
        actor: actorState, opponent: huSt, effectsMap, cardMap: battleCardMap, cards,
        phase, energyPoolNums: energyPoolCardNums(pool),
        alreadyActivated: actorState.cpu_activated_effect_ids_this_turn ?? [],
        effectivePowers: powers,
        // 可否の権威は人間の支払いモーダルと同じ `canAffordGrowCost`。
        isAffordable: (selectedNums, costStr) => canAffordGrowCost(
          selectedNums, cards, costStr, actorState.keyword_grants, undefined, stripped,
        ),
      });
      if (!choice) return false;
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
        costIndices: choice.costIndices, discardCostIndices: new Set(),
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
    ): Promise<boolean> => {
      const pool = buildEnergyPayPool(actorState, { turnPhase: phase, isMyTurn: true, effectsMap });
      const powers = calcFieldPowers(actorState, huSt, true, effectsMap, battleCardMap, phase);
      const stripped = isEnaMultiStripped(actorState, huSt, false, effectsMap, battleCardMap);
      const blockedSelf = calcContinuousBlockedActions(
        actorState, huSt, true, effectsMap, battleCardMap, powers).forSelf;
      const choice = pickCpuLrigActivated({
        actor: actorState, opponent: huSt, effectsMap, cardMap: battleCardMap, cards,
        phase, energyPoolNums: energyPoolCardNums(pool), blockedSelf,
        alreadyActivated: actorState.cpu_activated_effect_ids_this_turn ?? [],
        effectivePowers: powers,
        isAffordable: (selectedNums, costStr) => canAffordGrowCost(
          selectedNums, cards, costStr, actorState.keyword_grants, undefined, stripped,
        ),
      });
      if (!choice) return false;
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
     * CPU のアーツ使用を1枚ぶん試す（使ったら `true`＝呼び出し元は即 return する）。§8／§6.4 `O-1` (a)(b)。
     *
     * ⚠**窓は3つ（相手ターンの応答／自ターンの MAIN／自ターンの ATTACK_ARTS）だが通す道は1本**。
     *   窓ごとに書き分けると、片方だけに条件を足したときに気付けない。
     * ⚠**判定は `artsUseGate`・実行は `performArts`＝どちらも人間と同じ関数**（DESIGN §4）。
     *   CPU 専用の判定/実行をここに書かない＝軸がずれると人間には見えないアーツを CPU だけが
     *   使える（またはその逆）という無言のズレになる。
     * ⚠1回の呼び出しで**1枚だけ**使う＝スタック解決（対象選択の自動応答を含む）を待ってから次を選ぶ。
     */
    const tryCpuUseArts = async (
      actorState: PlayerState,
      turnPhase: TurnPhase,
      pick: (p: CpuArtsPickInput) => CpuArtsChoice | null,
    ): Promise<boolean> => {
      const isActorTurn = turnPhase !== 'ATTACK_ARTS_OP';
      const payer = buildArtsPayerCtx({
        actor: actorState, opponent: huSt, isActorTurn,
        turnPhase, cardMap: battleCardMap, effectsMap,
      });
      const choice = pick({
        actor: actorState, opponent: huSt, cards: battleCards, cardMap: battleCardMap, effectsMap,
        payer, turnPhase, alreadyUsedNums: actorState.cpu_used_card_nums_this_turn ?? [],
        // 可否の権威は人間の支払いUIと同じ `canAffordWithExtraCost`。
        isAffordable: (selectedNums, costStr, extraCosts) => canAffordWithExtraCost(
          selectedNums, battleCards, costStr, extraCosts, actorState.keyword_grants,
          payer.enaAllMulti, payer.enaMultiStripped,
          payer.colorlessOverrides, payer.colorSubs, payer.energyExtraColors,
          undefined, undefined, undefined, actorState.cannot_pay_colorless_this_attack_phase),
      });
      if (!choice) return false;
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
      const cleanCpuSt: PlayerState = { ...cpuSt, pending_lrig_attack: undefined, pending_lrig_attack_num: undefined };
      const huStWithLrigAttacked: PlayerState = { ...huSt, field: { ...huSt.field, lrig_attacked: true },
        lrig_attacked_by_num: cpuSt.pending_lrig_attack_num };
      await persist.commit(reduceBattle(bs, { type: 'WRITE_STATE', myKey: 'guest_state', myState: cleanCpuSt, opp: { key: 'host_state', state: huStWithLrigAttacked } }));
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
    // ─── CPU 自身が使ったスペルの解決待ち（§8／§6.4 O-1 (b)）───
    // ⚠**人間のカットイン応答を待つ**（`CutinModal` は `caster_id !== user.id` のときに出る）。
    //   ここで待たないと CPU が窓を無視してフェイズを進めてしまう＝スペルが宙に浮く。
    if (bs.pending_spell && bs.pending_spell.caster_id === CPU_PLAYER_ID) return;

    // ─── ATTACK_ARTS_OPフェイズ：CPUが非ターンプレイヤー＝応答アーツの窓 ───
    // ※ このチェックは !isCpuTurnNow の早期リターンより前に置く必要がある
    if (bs.turn_phase === 'ATTACK_ARTS_OP' && !isCpuTurnNow) {
      // ── §8／§6.4 O-1 (a): CPU が人間のアタックフェイズに応答アーツで守る ──────────
      if (await tryCpuUseArts(cpuSt, 'ATTACK_ARTS_OP', pickCpuResponseArts)) return;
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
          (e.action as import('../types/effects').StubAction).type === 'STUB' &&
          (e.action as import('../types/effects').StubAction).id === 'PREVENT_LIFE_REFRESH_TRASH',
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
        const cpuGrowRed = collectGrowCostReductions(cpuSt, huSt, true, effectsMap, battleCardMap);
        const cpuEnaMultiStrippedGrow = isEnaMultiStripped(cpuSt, huSt, false, effectsMap, battleCardMap);
        const cpuGrowPool = buildEnergyPayPool(cpuSt, { turnPhase: 'GROW', isMyTurn: true, effectsMap });
        const cpuGrowPoolNums = energyPoolCardNums(cpuGrowPool);
        // 候補は人間と同じ gate。コストは**払える1枚目**を選ぶ（決定論・盤面評価はしない）。
        for (const growCard of listGrowCandidates({ my: cpuSt, cardMap: battleCardMap, effectsMap })) {
          const growCostStr = applyGrowCostReduction(growCard.GrowCost, cpuGrowRed);
          const growCoinNeed = parseCoinCost(growCard.GrowCost);
          if (growCoinNeed > 0 && (cpuSt.coins ?? 0) < growCoinNeed) continue;
          const costIndices = selectEnergyIndicesForCost({
            poolNums: cpuGrowPoolNums, cards, costStr: growCostStr,
            // 可否の権威は人間の支払いモーダルと同じ `canAffordGrowCost`。
            isAffordable: (selectedNums, costStr) => canAffordGrowCost(
              selectedNums, cards, costStr, cpuSt.keyword_grants, undefined, cpuEnaMultiStrippedGrow,
            ),
          });
          if (!costIndices) continue;
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
      if (bs.turn_count === 1) {
        // 先攻1ターン目はMAINからENDへ
        await persist.commit(reduceBattle(bs, { type: 'SET_TURN_PHASE', phase: 'END' }));
        return;
      }
      // §6.4 O-3: メインフェイズがスキップされている（`WXEX2-19-E3`）なら**召喚を1体も行わず**
      // 下の MAIN→アタックフェイズ遷移へ落ちる（`ON_ATTACK_PHASE_START` の収集はそちらが行う）。
      const cpuMainSkipped = isPhaseSkipped('MAIN', cpuSt, cpuContBlockedSelf);
      if (cpuMainSkipped) appendBattleLogs(['[CPU] メインフェイズをスキップする']);
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

      // 手札のシグニ（**順序はここで決めない**）。
      // 🔴**旧実装は「レベル昇順」で並べて「入る最初の1枚」**＝リミットが余っていてもわざと弱い札から出しており、
      //   強い札が一生手札で腐っていた。§8 `O-1` (g) で**盤面評価（`pickCpuDeployCard`）**へ置き換えた＝
      //   「残りゾーンを埋められる範囲でいちばん強い札」を選ぶ。⚠**手札の並び順に依存しない**ように、
      //   ここでのソートは**同点解決のための安定順（手札順）だけ**にする。
      const handSignis = cpuSt.hand
        .map((id, idx) => ({ id, idx, card: cards.find(c => c.CardNum === getCardNum(id)) }))
        .filter(({ card }) => card && card.Type === 'シグニ');

      let newCpuSt = { ...cpuSt };
      // 配置したシグニの【出】/ON_PLAYトリガー（対人戦handleSummonSigniと同じ収集）
      const cpuOnPlayEntries: StackEntry[] = [];
      // 人間（host）側 watcher の usageLimit 消費を畳み込む作業用（huSt と異なれば host_state も併せて保存する）
      let cpuHuSt: PlayerState = huSt;
      // LIMIT_ALL_FIELD_N: シグニ場出し数の上限（WX04-005-E3）。CPU=guest, 人間=host。
      const cpuFieldSigniLimitBase = computeFieldSigniLimit(newCpuSt, bs.host_state, effectsMap, getCardNum);
      // DEPLOY_RESTRICT（配置数制限）: 相手（host）の CONT レゾナ＋自フラグ（このターン）の小さい方を上限に反映。
      // 上限計算は `engine/deployLimit.ts` に一本化（人間UI・engine の効果配置と同じ関数＝続き405）。
      const cpuDeployCap = deployCountCap({
        placingState: newCpuSt, opponentState: bs.host_state,
        cardMap: battleCardMap, effectsMap, isPlacingOwnerTurn: true,
      });
      const cpuFieldSigniLimit = cpuDeployCap !== undefined ? Math.min(cpuFieldSigniLimitBase, cpuDeployCap) : cpuFieldSigniLimitBase;

      for (let zone = 0; !cpuMainSkipped && zone < 3; zone++) {
        if ((newCpuSt.field.signi[zone] ?? []).length > 0) continue; // ゾーン埋まってる
        if (handSignis.length === 0) break;
        // 場出し数上限に達していたら召喚しない
        if (newCpuSt.field.signi.filter(stk => (stk ?? []).length > 0).length >= cpuFieldSigniLimit) break;
        // FORCE_PLACE_FRONT: 人間（host）の該当シグニの正面ゾーンが空いている場合、そのゾーンにしか配置できない
        const cpuForcedFront = collectForcePlaceFrontZones(bs.host_state, newCpuSt, battleCardMap, effectsMap, false);
        if (cpuForcedFront.size > 0 && !cpuForcedFront.has(zone)) continue;
        // BLOCK_OPP_ZONE_PLACEMENT / REMOVE_SIGNI_ZONE（タスク12(lxi) 第10波）: 配置禁止ゾーンは飛ばす。
        // 《無》回避つきは支払えるときだけ配置可（CPU は常に支払う方針）。徴収はシグニコスト確定後。
        if (!resolveSigniZonePlacement(newCpuSt, zone).allowed) continue;

        // 召喚できるシグニを探す（リミット内 かつ シグニLv ≤ ルリグLv かつ 配置制限を満たす）。
        // ⚠パワー上限（`signi_deploy_power_limit`）は従来 CPU が見ておらず、人間だけが縛られていた（続き405）。
        // ⚠**可否（ここ）と選択（`pickCpuDeployCard`）を分ける**＝可否は人間と同じ gate 群が権威。
        const placeable = handSignis.filter(({ id, card }) => {
          const lv = parseInt(card!.Level) || 0;
          if (lv > cpuLrigLevel || fieldTotal + lv > cpuLimit) return false;
          const power = card!.Power === '∞' ? Infinity : parseInt(card!.Power ?? '', 10);
          if (isHandSigniPlayBlockedByPower(newCpuSt, power)) return false;
          return deployLimitBlockReason({
            placingState: newCpuSt, opponentState: bs.host_state, cardNum: id,
            cardMap: battleCardMap, effectsMap, isPlacingOwnerTurn: true,
            placementSource: 'normal_summon',
          }) === null;
        });
        // §8 `O-1` (g)＝盤面評価で1枚選ぶ。**残ゾーン数**は「この先まだ空いていて置けるゾーンの数」＝
        // 上限（`cpuFieldSigniLimit`）で頭打ちにする（取り置きが過剰にならないように）。
        const emptyZonesAhead = newCpuSt.field.signi
          .filter((stk, zi) => zi >= zone && (stk ?? []).length === 0).length;
        const placedCount = newCpuSt.field.signi.filter(stk => (stk ?? []).length > 0).length;
        const pickedId = pickCpuDeployCard({
          candidates: placeable.map(({ id, card }) => ({
            id,
            level: parseInt(card!.Level) || 0,
            power: card!.Power === '∞' ? Infinity : (parseInt(card!.Power ?? '', 10) || 0),
          })),
          remainingLimit: cpuLimit - fieldTotal,
          zonesRemaining: Math.max(1, Math.min(emptyZonesAhead, cpuFieldSigniLimit - placedCount)),
        });
        const candidate = placeable.find(c => c.id === pickedId);
        if (!candidate) break;

        // エナ支払い（シグニのコスト）。ゾーン配置禁止の《無》回避コストと合わせて成立を確かめてから
        // 一括で newCpuSt へ反映する（片方だけ払って置けない＝エナの取りこぼしを作らない）。
        const signiCosts = parseGrowCost(candidate.card!.Cost);
        let cpuStAfterCost = newCpuSt;
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
          cpuStAfterCost = { ...cpuStAfterCost, energy: newEnergy };
        }
        // ゾーン配置禁止の《無》回避コストを徴収する。シグニコスト支払い後のエナで再検証し、
        // 足りなくなっていたらこのゾーンには置かない（エナは減らさない）。
        const cpuZonePay = resolveSigniZonePlacement(cpuStAfterCost, zone);
        if (!cpuZonePay.allowed) continue;
        if (cpuZonePay.paidColorless > 0) {
          appendBattleLogs([`[CPU] シグニゾーン${zone + 1}への配置コスト《無》×${cpuZonePay.paidColorless}を支払う`]);
        }
        newCpuSt = cpuZonePay.state;

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
      }

      // 配置で【出】トリガーが発生した場合はスタックに積んで解決を待つ（MAINに留まり、解決後の再実行で先へ進む）
      if (cpuOnPlayEntries.length > 0) {
        const existingStackOP = bs.effect_stack ?? null;
        const newStackOP = existingStackOP
          ? pushToStack(existingStackOP, cpuOnPlayEntries)
          : initStack(bs.active_user_id ?? CPU_PLAYER_ID, cpuOnPlayEntries);
        await persist.commit(reduceBattle(bs, { type: 'SET_STACK', stack: newStackOP }));
        return;
      }

      // ── §8／§6.4 O-1: CPU がメインフェイズに場のシグニの【起】を能動使用する ──────────
      // ⚠`cpuHuSt` が書き換わっている間は撃たない＝`performSigniActivated` は相手 state を
      //   ウィルス除去時しか書かないので、ここで撃つと配置で積んだ人間側の変更を取りこぼす。
      if (!cpuMainSkipped && cpuHuSt === huSt
        && await tryCpuSigniActivated(newCpuSt, 'MAIN')) return;
      // §8／§6.4 O-1 (c)＝センタールリグの【起】（live 492効果がメイン窓）。
      if (!cpuMainSkipped && cpuHuSt === huSt
        && await tryCpuLrigActivated(newCpuSt, 'MAIN')) return;

      // ── §8／§6.4 O-1 (b): CPU がメインフェイズに攻めのアーツ／スペル（＝除去）を使う ──────────
      // ⚠`cpuHuSt` が書き換わっている間は使わない＝`performArts`／`performSpell` は相手 state を
      //   書かないので、ここで使うと配置で積んだ人間側の変更を取りこぼす（【起】と同じ理由）。
      if (!cpuMainSkipped && cpuHuSt === huSt) {
        if (await tryCpuUseArts(newCpuSt, 'MAIN', pickCpuOffensiveArts)) return;
        // スペルは1枚使うと `pending_spell`（人間のカットイン窓）で止まる＝上の早期 return が受ける。
        const cpuSpellPayer = buildArtsPayerCtx({
          actor: newCpuSt, opponent: huSt, isActorTurn: true,
          turnPhase: 'MAIN', cardMap: battleCardMap, effectsMap,
        });
        const cpuSpellChoice = pickCpuMainSpell({
          actor: newCpuSt, opponent: huSt, cards: battleCards, cardMap: battleCardMap, effectsMap,
          payer: cpuSpellPayer, turnPhase: 'MAIN', pendingSpell: !!bs.pending_spell,
          alreadyUsedNums: newCpuSt.cpu_used_card_nums_this_turn ?? [],
          isAffordable: (selectedNums, costStr, extraCosts) => canAffordWithExtraCost(
            selectedNums, battleCards, costStr, extraCosts, newCpuSt.keyword_grants,
            cpuSpellPayer.enaAllMulti, cpuSpellPayer.enaMultiStripped,
            cpuSpellPayer.colorlessOverrides, cpuSpellPayer.colorSubs, cpuSpellPayer.energyExtraColors,
            undefined, undefined, undefined, newCpuSt.cannot_pay_colorless_this_attack_phase),
        });
        if (cpuSpellChoice) {
          appendBattleLogs([`[CPU] スペルを発動: ${cpuSpellChoice.card.CardName}`]);
          // ⚠アーツと同じ安全弁＝実行より先に「使った」履歴を確定させる（`performSpell` は
          //   使用不能を検出すると何も書かずに return するので、履歴を実行の成否に委ねると
          //   CPU が同じ札を選び直して MAIN から先へ進まなくなる）。
          const cpuSpellActor: PlayerState = {
            ...newCpuSt,
            cpu_used_card_nums_this_turn: [...(newCpuSt.cpu_used_card_nums_this_turn ?? []), cpuSpellChoice.card.CardNum],
          };
          await persist.commit(reduceBattle(bs, { type: 'WRITE_STATE', myKey: 'guest_state', myState: cpuSpellActor }));
          await performSpell(cpuSpellChoice.card, {
            costIndices: cpuSpellChoice.costIndices, handIdx: cpuSpellChoice.handIndex,
          }, {
            actor: cpuSpellActor, opponent: huSt,
            actorId: CPU_PLAYER_ID, actorKey: 'guest_state',
            isActorTurn: true,
            energyPayPool: cpuSpellPayer.energyPayPool,
            blockedSelf: cpuSpellPayer.blockedSelf,
            enaAllMulti: cpuSpellPayer.enaAllMulti,
            enaMultiStripped: cpuSpellPayer.enaMultiStripped,
          });
          return;
        }
      }

      // ── MAIN→ATTACK_ARTS 移行（アタックフェイズ開始時）。以下のトリガーを1つのスタックに集約し、
      //    フェイズを ATTACK_ARTS へ進めながら積む（MAIN に留まると再実行で無限収集になるため）。
      const cpuTurnPlayerId = bs.active_user_id ?? CPU_PLAYER_ID;
      const apsStackEntries: StackEntry[] = [];
      // §6.4 O-3: アタックフェイズ自体がスキップされていれば遷移先は END になる＝
      // **開始時トリガー（`ON_ATTACK_PHASE_START`・【ハスターリク】）も収集しない**。
      const cpuPhaseAfterMain = cpuNextPhase('MAIN');
      const cpuAttackPhaseSkipped = cpuPhaseAfterMain !== 'ATTACK_ARTS';
      if (cpuAttackPhaseSkipped) appendBattleLogs(['[CPU] アタックフェイズをスキップする']);

      // ON_ATTACK_PHASE_START（タスク12(lxvii)）＝人間ターンと**同じ pure collector** に統一する。
      // ⚠🔴従来ここは**手書きの部分再実装**で、CPU 自身の場の `triggerScope:'self'` しか拾っていなかった＝
      //   ①`any`／`any_opp`（「相手のアタックフェイズ開始時」等＝実測 **57効果**）が CPU ターンだけ不発
      //   ②`usageLimit`（《ターン1回》）を `actions_done` に記録しないので同一ターンに再発火しうる
      //   ③人間側の場のシグニを一切見ない、という3点で人間ターンと挙動が食い違っていた。
      const apsCpu = cpuAttackPhaseSkipped
        ? { cpuState: newCpuSt, humanState: undefined as PlayerState | undefined, entries: [] as StackEntry[] }
        : collectCpuTurnTriggers('ON_ATTACK_PHASE_START', newCpuSt, huSt);
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
            action: { type: 'STUB', id: 'HASTARLIQ_TRIGGER', value: zi } as import('../types/effects').StubAction,
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
      // §8／§6.4 O-1 (c)＝《アタックフェイズアイコン》付きシグニ【起】（`timing:['ATTACK_ARTS']`）。
      // ⚠**MAIN 窓では出ない**（`signiActivateGate` が timing で切る）＝この窓を足すまで恒久 no-op だった。
      if (await tryCpuSigniActivated(cpuSt, 'ATTACK_ARTS')) return;
      if (await tryCpuLrigActivated(cpuSt, 'ATTACK_ARTS')) return;
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
      const cpuAttackable = cpuSt.field.signi.flatMap((stack, zi) => {
        const top = (stack ?? []).at(-1);
        if (!top) return [];
        return canSigniAttack({
          attacker: cpuSt, defender: huSt, attackerNum: top,
          effectsMap, cardMap: battleCardMap, turnPhase: bs.turn_phase,
        }) ? [zi] : [];
      });
      // §8 `O-1` (g)＝**どれで殴るかを盤面で選ぶ**（旧実装はゾーン0から順に全部＝格上の正面へ突っ込んで
      // 自分だけ落ちていた）。優先は ライフに通る → 勝てるバトル →（撃たない）。強制アタックは最優先。
      const cpuAttackPowers = calcFieldPowers(cpuSt, huSt, true, effectsMap, battleCardMap, bs.turn_phase);
      const cpuDefenderPowers = calcFieldPowers(huSt, cpuSt, false, effectsMap, battleCardMap, bs.turn_phase);
      const firstUp = pickCpuAttackZone({
        attackable: cpuAttackable,
        forced: collectForcedAttackZones({
          attacker: cpuSt, defender: huSt, effectsMap, cardMap: battleCardMap, turnPhase: bs.turn_phase,
        }),
        attackerPower: zi => effectivePowerOf((cpuSt.field.signi[zi] ?? []).at(-1) ?? '', cpuAttackPowers, battleCardMap),
        facingPower: zi => facingSigniPower(huSt, zi, cpuDefenderPowers, battleCardMap),
      }) ?? -1;

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
      // アシストルリグのアタック（§6.4 A群・続き427）。センターの後に1体ずつ。
      // ⚠人間側のボタン生成と同じ `assistLrigAttackableSlots` を通す（軸ズレ防止）。
      const cpuAssistSlots = assistLrigAttackableSlots(cpuSt, battleCardMap);
      if (cpuAssistSlots.length > 0) {
        const attackedAssist = await performLrigAttack({
          attacker: cpuSt, defender: huSt,
          attackerId: CPU_PLAYER_ID, attackerKey: 'guest_state',
          slot: cpuAssistSlots[0],
        });
        if (attackedAssist) return;   // 次の useEffect で残りのアシストへ
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
          const aps2 = collectCpuTurnTriggers('ON_ATTACK_PHASE_START', nextCpuState, nextHuState);
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
      const curHuDown   = huEndState.field.signi_down   ?? [false, false, false];
      const curHuFrozen = huEndState.field.signi_frozen  ?? [false, false, false];
      const curHuLrigFrozen = huEndState.field.lrig_frozen ?? false;
      const curHuAssistLFrozen = huEndState.field.assist_lrig_l_frozen ?? false;
      const curHuAssistRFrozen = huEndState.field.assist_lrig_r_frozen ?? false;
      // CPUターン終了＝人間側から見た「次の相手ターン終了時」。PvP の doPhaseAdvance / confirmEndDiscard と同じく、
      // 次ターンプレイヤーが保持する UNTIL_OPP_TURN_END 状態をここで失効させる。
      const nextHuSt = clearEndOfTurnDelayedTriggers(activateNextTurnSigniZoneBlocks(activateNextTurnDeployCountLimit(clearTurnEndScopedState({
        ...clearUntilOppTurnEffects(clearAllZoneBurstGrantUntilOppTurn(huEndState)),
        turn_arts_used: undefined, turn_arts_used_names: undefined, turn_arts_used_colors: undefined, // CPUターン中のガード使用分をリセット（ARTS_USED_THIS_TURN）
        signi_deploy_count_limit: undefined, // 配置数制限（このターン・CPUにかけられた分）を人間のターン開始時にリセット
        banish_redirect_power0_target_nums: undefined,
        banish_redirect_battle_target_nums: undefined,
        field: {
        ...huEndState.field,
        // 凍結中のシグニはアップしない（frozen=true かつ down=true はそのまま残す）
        signi_down:   curHuDown.map((d, i) => d && curHuFrozen[i]) as boolean[],
        signi_frozen: [false, false, false] as boolean[],
        lrig_down:    (huEndState.field.lrig_down ?? false) && curHuLrigFrozen,
        lrig_frozen:  false,
        assist_lrig_l_down: (huEndState.field.assist_lrig_l_down ?? false) && curHuAssistLFrozen,
        assist_lrig_r_down: (huEndState.field.assist_lrig_r_down ?? false) && curHuAssistRFrozen,
        assist_lrig_l_frozen: false,
        assist_lrig_r_frozen: false,
      }})).state));
      // turn_end_draw_count: このターン終了時、カードをN枚引く（DRAW_AT_TURN_END。場を離れても引く）
      let cpuHandEND = cpuEndState.hand;
      let cpuDeckEND = cpuEndState.deck;
      if ((cpuEndState.turn_end_draw_count ?? 0) > 0) {
        const drawnCPU = cpuDeckEND.slice(0, cpuEndState.turn_end_draw_count);
        cpuDeckEND = cpuDeckEND.slice(cpuEndState.turn_end_draw_count);
        cpuHandEND = [...cpuHandEND, ...drawnCPU];
        appendBattleLogs([`ターン終了時：CPUがカードを${drawnCPU.length}枚引く`]);
      }
      // turn_end_energy_trash_targets: ターン終了時にエナゾーンからトラッシュへ（人間側と同じ funnel）。
      // CPU も 【出】でこの予約を積む札（`SPK01-10`）を召喚しうるので、人間の2経路と同じ関数を通す。
      const cpuEnergyTrashEND = resolveTurnEndEnergyTrash(cpuEndState);
      if (cpuEnergyTrashEND.trashed.length > 0) {
        appendBattleLogs([`ターン終了時：CPUの${cpuEnergyTrashEND.trashed.map(n => battleCardMap.get(getCardNum(n))?.CardName ?? n).join('・')}をエナゾーンからトラッシュへ`]);
      }
      const cleanCpuSt: PlayerState = clearTurnEndScopedState(resolvePendingExiles(clearAttackFieldTrashCosts(clearEndOfTurnDelayedTriggers({
        ...cpuEndState,
        energy: cpuEnergyTrashEND.state.energy,
        trash: cpuEnergyTrashEND.state.trash,
        turn_end_energy_trash_targets: undefined,
        hand: cpuHandEND, deck: cpuDeckEND, turn_end_draw_count: undefined,
        temp_power_mods: [], temp_level_mods: [], keyword_grants: {}, granted_effects: {}, actions_done: [],
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
        turn_arts_used: undefined, turn_arts_used_names: undefined, turn_arts_used_colors: undefined, // アーツ使用履歴をリセット
      })), true));
      // §6.4 O-3: CPU のターン終了も人間の2経路と**同じ `resolveTurnHandover`** を通す。
      // ⚠🔴従来ここは無条件で `activeUserId: user.id`＝**CPU が取った追加ターンも、人間が予約した
      //   「次の自分のターンをスキップ」（`WD20-006-E1`＝相手ターン中に撃つアーツ）も効かなかった**。
      //   `WD20-006` の母集団はまさに「このターンが対戦相手のターンで」＝この経路が本命。
      const handoverCpu = resolveTurnHandover(cleanCpuSt, nextHuSt);
      if (handoverCpu.log) appendBattleLogs([`[CPU] ${handoverCpu.log}`]);
      await persist.commit(reduceBattle(bs, {
        type: 'BEGIN_NEXT_TURN',
        activeUserId: handoverCpu.keepTurn ? undefined : user.id,
        myKey: 'guest_state', myState: handoverCpu.consumeTurnEnder(cleanCpuSt),
        // 遅延自己除外は非ターンプレイヤー（人間）側にも適用（WX16-040 等はCPUターン中に蘇生→そのターン終了時に除外）
        opp: { key: 'host_state', state: handoverCpu.consumeOpponent(resolvePendingExiles(nextHuSt, true)) },
      }));
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

  // game_guard_alt_hand: 手札N枚を捨ててガード（ガードアイコン不要の代替）
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
        const extraEnergyCount = collectOppGuardExtraColorlessCost(op, my, battleCardMap, effectsMap, true);
        // UIだけに依存せず、CPU/直接呼出でも不足時はガードを成立させない。
        if (my.energy.length < extraEnergyCount) return;
        // EXTRA_GUARD_COST_FROM_HAND: 相手フィールドにアクティブな場合、手札から追加でガードカードを1枚捨てる
        const needsExtraGuardCard = collectOppExtraGuardFromHand(op, battleCardMap, effectsMap);
        // game_opp_extra_guard_hand_or_colorless: 相手が能力付与→ガード時に追加でエナか手札捨て
        const needsOppHandOrColorless = (op.game_opp_extra_guard_hand_or_colorless ?? 0) > 0;
        let energyAfterGuard = my.energy;
        const extraTrash: string[] = [];
        if (extraEnergyCount > 0 && my.energy.length >= extraEnergyCount) {
          const removedEnergy = my.energy.slice(-extraEnergyCount);
          energyAfterGuard = my.energy.slice(0, -extraEnergyCount);
          extraTrash.push(...removedEnergy);
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
          const extraGuardIdx = my.hand.findIndex((cn, i) => i !== handIndex && canCardGuard(cn, my, battleCardMap, effectsMap));
          if (extraGuardIdx >= 0) {
            const extraGuardNum = my.hand[extraGuardIdx];
            extraTrash.push(extraGuardNum);
            appendBattleLogs([`ガード（${guardCardName}）＋追加コスト：手札ガードカード（${battleCardMap.get(extraGuardNum)?.CardName ?? extraGuardNum}）を捨てる`]);
          } else {
            appendBattleLogs([`ガード（${guardCardName}）（追加ガードカードなし）`]);
          }
        } else if (needsOppHandOrColorless) {
          appendBattleLogs([`ガード（${guardCardName}）＋追加コスト（手札か《無》）消費`]);
        } else if (extraEnergyCount > 0 && energyAfterGuard.length < my.energy.length) {
          appendBattleLogs([`ガード（${guardCardName}）＋追加コスト《無》×${extraEnergyCount}消費`]);
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
        // ⚠**攻撃したルリグ**を見る（アシストがアタックしたのにセンターのキーワードで判定すると
        //   ダブルクラッシュが誤って乗る／乗らない。続き427）。未設定＝従来どおりセンター。
        const opLrigNum = my.lrig_attacked_by_num ?? op.field.lrig.at(-1);
        const opDynamicKeywords = collectContinuousGrantedKeywords(op, my, true, effectsMap, battleCardMap);
        const opLrigHasDoubleCrush = !!(opLrigNum && (
          (op.keyword_grants?.[opLrigNum] ?? []).includes('ダブルクラッシュ')
          || (opDynamicKeywords[opLrigNum] ?? []).includes('ダブルクラッシュ')
        ));
        // トリプルクラッシュ（WD21-009 の付与【自】＝ルリグアタックで3枚クラッシュ。検証是正＝シグニアタック側だけでなくルリグアタック経路も消費する）
        const opLrigHasTripleCrush = !!(opLrigNum && (op.keyword_grants?.[opLrigNum] ?? []).includes('トリプルクラッシュ'));
        // 「あなたは対戦相手の（レベルN以下の）ルリグによってダメージを受けない」＝**回数無制限**の防御。
        // 消費型（バリア／prevent_next_damage／置換ミル）を無駄遣いさせないため最初に判定する。
        // §6.4 O-3 続き492: 判定は `resolveLrigDamageShield` 1本（期間ウィンドウ＋【常】宣言をまとめて見る）。
        // ⚠🔴従来ここは期間ウィンドウだけで、【常】版は**消費型のさらに後ろ**かつ**自分のシグニしか
        //   走査しない**インライン判定だった（ルリグ本体・アシスト・キーの宣言が丸ごと無視されていた）。
        // §5.3 O-66: ライフクラッシュ防止／回数制限（**ルリグアタックのダメージ**＝cause:'damage'）。
        // 🔴**この経路は `crashOneLife` を通らない**（インラインでライフを削る）＝ここへ書かないと
        //   「シグニアタックは防げるのにルリグアタックは素通り」という無言の不整合になる。
        // ⚠ルリグアタックは常に相手のターン中＝防御側 `my` は**ターンプレイヤーではない**。
        const lifeCrashPrevented = allowedLifeCrashCount(
          my, op,
          collectLifeCrashPreventions(my, op, false, battleCardMap, effectsMap),
          'damage', 1,
        ) <= 0;
        const lrigShield = resolveLrigDamageShield({
          defender: my, attacker: op, cardMap: battleCardMap, effectsMap,
          attackingLrigNum: opLrigNum ?? undefined,
        });
        if (lifeCrashPrevented) {
          appendBattleLogs([`ルリグアタック：ライフクロスはクラッシュされない（クラッシュ防止）`]);
          newMyState = { ...my, field: { ...my.field, lrig_attacked: false } };
        } else if (lrigShield.prevented) {
          appendBattleLogs([`ルリグアタック：ダメージ無効（ダメージを受けない効果）`]);
          // §6.4 O-10（続き507）＝「代わりにダメージを受けず、ターン終了時まで、この能力を失う」
          // （`WXK01-002-E1`）は**1回だけ**。刻まないと同ターン中の2回目以降も防いで無限バリアになる。
          newMyState = {
            ...my,
            ...(lrigShield.loseEffectId
              ? { lost_ability_effect_ids_this_turn: [...(my.lost_ability_effect_ids_this_turn ?? []), lrigShield.loseEffectId] }
              : {}),
            field: { ...my.field, lrig_attacked: false },
          };
        } else if (countBarrierTokens(my.field.free_zone, LRIG_BARRIER_CARD) > 0) {
          const fzLB = removeOneBarrierToken(my.field.free_zone, LRIG_BARRIER_CARD);
          appendBattleLogs([`ルリグアタック：ルリグバリア発動（残${countBarrierTokens(fzLB, LRIG_BARRIER_CARD)}）`]);
          newMyState = { ...my, field: { ...my.field, free_zone: fzLB, lrig_attacked: false } };
        } else if (consumeNextDamagePrevention(my, { type: 'lrig' })) {
          appendBattleLogs([`ルリグアタック：ダメージ無効`]);
          const consumed = consumeNextDamagePrevention(my, { type: 'lrig' })!;
          newMyState = {
            ...consumed,
            field: { ...my.field, lrig_attacked: false },
          };
        } else if (pickLifeCrashReplacement(my, { damageSource: 'lrig', cardMap: battleCardMap })?.repl.kind === 'pay_cost') {
          // §6.4 O-37(a) ダメージ置換（コスト支払い型）＝ルリグアタック側の消費地点。
          // ⚠**シグニアタック側（crashOneLife）と同じ funnel を通す**＝片方だけだと
          //   「シグニには効くがルリグには効かない」型の無言の不整合になる。
          const pickedC = pickLifeCrashReplacement(my, { damageSource: 'lrig', cardMap: battleCardMap })!;
          const paidC = applyPayCostReplacement(my, pickedC.index, pickedC.repl, battleCardMap);
          appendBattleLogs([`ルリグアタック：${lifeCrashReplaceLog(pickedC.repl, paidC?.paidJa)}`]);
          newMyState = { ...(paidC?.state ?? my), field: { ...my.field, lrig_attacked: false } };
        } else if (pickLifeCrashReplacement(my, { damageSource: 'lrig' })?.repl.kind === 'mill') {
          // ライフクラッシュ置換（ルリグアタック側の消費地点）＝ funnel で crashOneLife と同じ規則を通す。
          // ⚠「シグニによって」限定の宣言はここで**選ばれない**（従来は限定を見ずに消費していた）。
          const pickedL = pickLifeCrashReplacement(my, { damageSource: 'lrig' })!;
          const appliedL = applyMillReplacement(my, pickedL.index, pickedL.repl.count);
          appendBattleLogs([`ルリグアタック：${lifeCrashReplaceLog(pickedL.repl)}`]);
          newMyState = { ...appliedL.state, field: { ...my.field, lrig_attacked: false } };
        } else if (my.prevent_lrig_damage) {
          // 1回消費型の残り（「対戦相手の効果によってダメージを受けない」等・`PREVENT_DAMAGE_FROM_OPP_EFFECTS`）。
          // ⚠期間つきの「ルリグによってダメージを受けない」は上の funnel が先に拾う＝ここには落ちてこない。
          appendBattleLogs([`ルリグアタック：ルリグダメージ無効`]);
          newMyState = { ...my, prevent_lrig_damage: undefined, field: { ...my.field, lrig_attacked: false } };
        } else if (my.life_cloth.length > 0) {
          const crashed = my.life_cloth[my.life_cloth.length - 1];
          const crashedName = battleCardMap.get(crashed)?.CardName ?? crashed;
          let lifeAfterCrash = my.life_cloth.slice(0, -1);
          let pendingAfterCrash = my.pending_crashed_cards ?? [];
          if ((opLrigHasDoubleCrush || opLrigHasTripleCrush) && lifeAfterCrash.length > 0) {
            // ダブル=追加1枚／トリプル=追加2枚（残ライフが足りなければあるだけ）
            const extraCount = Math.min(opLrigHasTripleCrush ? 2 : 1, lifeAfterCrash.length);
            const extraCards = lifeAfterCrash.slice(-extraCount);
            lifeAfterCrash = lifeAfterCrash.slice(0, -extraCount);
            pendingAfterCrash = [...pendingAfterCrash, ...extraCards];
            appendBattleLogs([`ルリグアタック：${opLrigHasTripleCrush ? 'トリプルクラッシュ' : 'ダブルクラッシュ'}（${crashedName}、${extraCards.map(cn => battleCardMap.get(cn)?.CardName ?? cn).join('、')}）`]);
          } else {
            appendBattleLogs([`ルリグアタック：ライフクロスをクラッシュ（${crashedName}）`]);
          }
          newMyState = {
            ...my,
            life_cloth: lifeAfterCrash,
            // 🔴**§5.3 O-66 で発見した既存バグ**＝この経路だけ `life_crashed_this_turn` を加算していなかった
            //   （シグニアタックの `crashOneLife`・効果の `execLifeCrash`・ライフコストの3本は加算済み）。
            //   ⇒ ①既存の `LIFE_CRASHED_THIS_TURN` 条件が**ルリグアタックのダメージを数えていなかった**
            //     ②`O-66` の「1ターンにN枚まで」が**ルリグアタックだけ素通り**する。
            //   ⚠ダブル／トリプルクラッシュの追加分も枚数に含める（`my.life_cloth` からの実減少数を数える）。
            life_crashed_this_turn:
              (my.life_crashed_this_turn ?? 0) + (my.life_cloth.length - lifeAfterCrash.length),
            pending_crashed_cards: pendingAfterCrash,
            crash_source_card_num: op.field.lrig.at(-1),
            pending_crash_source_card_nums: pendingAfterCrash.map(() => op.field.lrig.at(-1) ?? null),
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
          await persist.commit(reduceBattle(bs, { type: 'END_GAME', winnerId, myKey: stateKey, myState: clearedMyState }));
          return;
        }
      }
      // 防御側の「そのアタックで」ダメージ無効も、ガード有無／ダメージ成否を問わずここで失効する。
      newMyState = clearEndOfAttackEffects(newMyState);
      // MULTI_DAMAGE_ON_LRIG_ATTACK: 攻撃側に残りアタック回数があれば再トリガー
      const oppStateKey = stateKey === 'host_state' ? 'guest_state' : 'host_state';
      let newOpState: PlayerState = clearEndOfAttackEffects(op);
      if (op.lrig_attack_remaining && op.lrig_attack_remaining > 0) {
        const rem = op.lrig_attack_remaining - 1;
        newOpState = { ...newOpState, lrig_attack_remaining: rem > 0 ? rem : undefined };
        // バースト処理中でない場合は即座に再アタック、バースト中はcheck解消後に再表示
        newMyState = { ...newMyState, field: { ...newMyState.field, lrig_attacked: true } };
        appendBattleLogs([`ルリグアタック継続（残り${rem}回）`]);
      }
      if (attackGuardUsedIds.length > 0) {
        newOpState = { ...newOpState, actions_done: [...(newOpState.actions_done ?? []), ...attackGuardUsedIds] };
      }
      const existingStackGuard = bs.effect_stack ?? null;
      const guardStack = guardTriggers.length > 0
        ? (existingStackGuard ? pushToStack(existingStackGuard, guardTriggers) : initStack(bs.active_user_id ?? attackerId, guardTriggers))
        : undefined; // トリガー無しなら effect_stack キー自体を書かない
      await persist.commit(reduceBattle(bs, {
        type: 'WRITE_STATE', myKey: stateKey, myState: newMyState,
        opp: { key: oppStateKey, state: newOpState }, effectStack: guardStack,
      }));
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
  // 【ライフバースト】を付与」する CONTINUOUS 効果がある場合、その STUB を返す。
  // 場に無く、かつ付与者の相手ターン中ならプレイヤーへ設定されたディスペア一時付与へfallbackする。
  // WD14-001＝フィルタなし（全カード）・BANISH（既定）。WX17-036＝＜怪異＞シグニ限定・TRASH（burstFilter/burstAction 指定）。
  const getAllZoneBurstGrant = (
    state: PlayerState,
    includeTemporary = false,
  ): import('../types/effects').StubAction | null => {
    return resolveAllZoneBurstGrant(state, effectsMap, includeTemporary);
  };
  // クラッシュされたカードが付与ライフバーストの対象か（burstFilter があればクラッシュカードが一致する必要がある）
  const matchesAllZoneBurstGrant = (
    cardNum: string,
    ownerState: PlayerState,
    includeTemporary = bs.active_user_id !== user.id,
  ): boolean => {
    return allZoneBurstGrantMatches(cardNum, ownerState, battleCardMap, effectsMap, includeTemporary);
  };
  // クラッシュされたカードの実効ライフバースト有無（ネイティブ or 付与）
  const effectiveHasBurst = (cardNum: string, ownerState: PlayerState, ownerId: string): boolean => {
    if (hasNativeLifeBurst(cardNum, battleCardMap, effectsMap)) return true;
    return matchesAllZoneBurstGrant(cardNum, ownerState, bs.active_user_id !== ownerId);
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
      action: grantedAllZoneBurstAction(grant),
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
      let crashSourceCardNum = my.crash_source_card_num;
      // §5.3 O-120: 原因キーワードは**発生源と同じ添字規約**で持つ（別実装にすると片方だけ直る）。
      let crashCause = my.crash_cause;
      let remainingCrashSources: Array<string | null>;
      let remainingCrashCauses: Array<string | null>;
      if (!targetCardNum || targetCardNum === my.field.check) {
        // check のカードを処理: pending はそのまま残す
        remainingPending = my.pending_crashed_cards ?? [];
        remainingCrashSources = my.pending_crash_source_card_nums ?? [];
        remainingCrashCauses = my.pending_crash_causes ?? [];
      } else {
        // pending のカードを先に処理: indexOf で最初の一致のみ除き、check を pending 先頭に回す
        const pendingList = my.pending_crashed_cards ?? [];
        const targetIdx = pendingList.indexOf(targetCardNum);
        const pendingSources = my.pending_crash_source_card_nums ?? [];
        const pendingCauses = my.pending_crash_causes ?? [];
        crashSourceCardNum = targetIdx >= 0 ? pendingSources[targetIdx] ?? undefined : undefined;
        crashCause = targetIdx >= 0 ? pendingCauses[targetIdx] ?? undefined : undefined;
        const afterRemoval = targetIdx >= 0
          ? [...pendingList.slice(0, targetIdx), ...pendingList.slice(targetIdx + 1)]
          : pendingList;
        remainingPending = [my.field.check!, ...afterRemoval];
        remainingCrashSources = [my.crash_source_card_num ?? null,
          ...pendingSources.filter((_, i) => i !== targetIdx)];
        remainingCrashCauses = [my.crash_cause ?? null,
          ...pendingCauses.filter((_, i) => i !== targetIdx)];
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
      const oppGameUsedIds: string[] = [];
      // usageLimit を op.actions_done の出現回数で制御（once=1 / twice=2）。
      const oppLimitOk = (eff: import('../types/effects').CardEffect): boolean => {
        if (eff.usageLimit === 'once_per_game') {
          if ((op.game_actions_done ?? []).includes(eff.effectId) || oppGameUsedIds.includes(eff.effectId)) return false;
          oppGameUsedIds.push(eff.effectId);
          return true;
        }
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
          if (!battleOppLifeCrashSourceMatches(eff, topNum, crashSourceCardNum, battleCardMap)) continue;
          // §5.3 O-120: 「【ランサー】によってクラッシュしたとき」＝原因キーワード限定（fail-closed）。
          if (!crashCauseMatches(eff, crashCause)) continue;
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
      for (const eff of op.game_granted_auto_effects ?? []) {
        if (eff.effectType !== 'AUTO' || !eff.timing?.includes('ON_OPP_LIFE_CRASHED')) continue;
        if (!crashCauseMatches(eff, crashCause)) continue;   // §5.3 O-120（付与された能力にも同じ条件が乗りうる）
        if (eff.condition?.type === 'OPP_LIFE_CRASH_EVENT_GTE' && oppCrashEventSize < eff.condition.value) continue;
        if (!oppLimitOk(eff)) continue;
        oppCrashTriggers.push({
          id: generateUUID(),
          playerId: crasherId,
          cardNum: eff.effectId,
          effectId: eff.effectId,
          label: 'ゲーム中に得た【自】効果（相手ライフクラッシュ時）',
          effect: eff,
        });
      }
      // INSTALL_DELAYED_TRIGGER（B3）: op（クラッシュした側＝ターンプレイヤー）に設置された
      // 「このターン、…がクラッシュしたとき、…」遅延トリガーを収集する。crasherFilter があれば
      // 実際のクラッシュ源で判定する。旧状態など発生源不明時だけ従来の場走査へfallbackする。
      for (const dt of op.delayed_triggers ?? []) {
        if (dt.trigger?.timing !== 'ON_OPP_LIFE_CRASHED') continue;
        if (dt.trigger.crasherFilter) {
          const ok = crashSourceCardNum
            ? matchesFilter(battleCardMap.get(crashSourceCardNum), dt.trigger.crasherFilter)
            : op.field.signi.some(stack => {
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
      const opStateForUsed: PlayerState | null = oppUsedIds.length > 0 || oppGameUsedIds.length > 0
        ? {
            ...op,
            actions_done: [...(op.actions_done ?? []), ...oppUsedIds],
            game_actions_done: [...(op.game_actions_done ?? []), ...oppGameUsedIds],
          }
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
        pending_crash_source_card_nums: remainingCrashSources,
        crash_source_card_num: undefined,
        // §5.3 O-120: 原因列は発生源列と**必ず同時に**更新する（片方だけだと添字がずれる）。
        pending_crash_causes: remainingCrashCauses,
        crash_cause: undefined,
        life_crash_counter: myCounterAfter,
        actions_done: crashTriggerUsedIds.length > 0
          ? [...(my.actions_done ?? []), ...crashTriggerUsedIds]
          : my.actions_done,
      };
      if (crashToTrash) appendBattleLogs([`${battleCardMap.get(cardNum)?.CardName ?? cardNum}はトラッシュに置かれた（CRASH_TO_TRASH_INSTEAD）`]);
      if (!activate) {
        const stateKey = p.ownerKey;
        const combinedTriggers = [...crashTriggers, ...oppCrashTriggers, ...counterCrashTriggers];
        const existingStackCrash = bs.effect_stack ?? null;
        await persist.commit(reduceBattle(bs, {
          type: 'WRITE_STATE', myKey: stateKey, myState: baseState, clearPending: true,
          opp: opStateForUsed ? { key: opKey, state: opStateForUsed } : undefined,
          effectStack: combinedTriggers.length > 0
            ? (existingStackCrash ? pushToStack(existingStackCrash, combinedTriggers) : initStack(bs.active_user_id ?? ownerId, combinedTriggers))
            : undefined,
        }));
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
      const temporaryGrantActive = bs.active_user_id !== ownerId;
      const allZoneBurstGrant = getAllZoneBurstGrant(my, temporaryGrantActive);
      // 既定はネイティブ【ライフバースト】が無いカードのみに付与。burstAdditive=true（WX02-002）は
      // ネイティブを持つカードにも追加し、両方を好きな順で使用できる。
      const grantedBurstApplies = shouldAddGrantedAllZoneBurst(
        cardNum, my, battleCardMap, effectsMap, temporaryGrantActive,
      );
      const grantedBurstExtras = grantedBurstApplies
        ? [grantedBurstEntry(cardNum, ownerId, allZoneBurstGrant)] : [];
      const allBurstExtras = [...crashTriggers, ...oppCrashTriggers, ...counterCrashTriggers, ...lrigTrashBurstEntries, ...grantedBurstExtras];
      const burstExtraState: { key: PlayerStateKey; state: PlayerState } | undefined =
        opStateForUsed ? { key: opKey, state: opStateForUsed } : undefined;
      const fired = await queueCardEffects(cardNum, ['LIFE_BURST'], ['ON_LIFE_BURST'], baseStateForBurst, op, burstExtraState, doubleBurst ? 2 : 1, allBurstExtras, { id: ownerId, key: p.ownerKey });
      if (!fired) {
        const stateKey = p.ownerKey;
        await persist.commit(reduceBattle(bs, {
          type: 'WRITE_STATE', myKey: stateKey, myState: baseState, clearPending: true,
        }));
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
    await persist.commit(reduceBattle(bs, { type: 'WRITE_STATE', myKey: myKey, myState: newMyState }));
  };

  // シグニ起動効果を実行（コスト支払い後）
  /**
   * 場のシグニ【起】の実行（人間・CPU 共通）。DESIGN §4「CPU は対人戦と同じ処理を使う」の抽出形＝
   * `performSigniAttack` / `performGuardResponse` と同じく **owner をパラメータ化**し、
   * 人間用 `executeSigniActivated` は薄いラッパーにする。
   *
   * ⚠**「いま撃てるか」の判定はここではなく `signiActivateGate`**（提示と支払いは別の地点＝続き546 教訓 (d)）。
   * ⚠`sel` は**UIで選んだ支払い内訳**＝CPU から呼ぶときは自動選択した index を入れる（空 Set＝選択なし）。
   */
  const performSigniActivated = async (
    cardNum: string,
    effect: import('../types/effects').CardEffect,
    sel: {
      costIndices: Set<number>;
      discardCostIndices: Set<number>;
      useKeySub?: boolean;
      discardVarIndices?: Set<number>;
      energyTrashIndices?: Set<number>;
      trashExileIndices?: Set<number>;
      fieldTrashZones?: Set<number>;
      beatZones?: Set<number>;
      underTrashKeys?: Set<string>;
      /** `charmTrashVariable` で選んだ枚数（人間はUIの state、CPU は 0）。 */
      charmTrashVarCount?: number;
    },
    p: {
      actor: PlayerState; opponent: PlayerState;
      actorId: string; opponentId: string;
      actorKey: 'host_state' | 'guest_state';
      /** `buildEnergyPayPool(actor, ...)` の結果（エナ支払い元 funnel）。 */
      energyPayPool: EnergyPayEntry[];
      /** `collectEnergyTrashSubstituteInfo(actor, ...)` の結果（キー代替払い）。 */
      energyTrashSubInfo: { wildcardInstIds: Set<string>; colorOverrideMap: Map<string, string>; keySubInstId: string | null };
    },
  ) => {
    const my = p.actor;
    const op = p.opponent;
    const { costIndices, discardCostIndices, discardVarIndices } = sel;
    const underTrashKeys = sel.underTrashKeys ?? new Set<string>();
    const useKeySub = sel.useKeySub ?? false;
    const energyTrashIndices = sel.energyTrashIndices ?? new Set<number>();
    const trashExileIndices = sel.trashExileIndices ?? new Set<number>();
    const fieldTrashZones = sel.fieldTrashZones ?? new Set<number>();
    const beatZones = sel.beatZones ?? new Set<number>();
    const charmTrashVarCount = sel.charmTrashVarCount ?? 0;
    // down_self コストは、対象シグニが既にダウンしていると支払えない（多重発動防止）
    if (effect.cost?.down_self) {
      const dzi = my.field.signi.findIndex(s => s?.at(-1) === cardNum);
      if (dzi >= 0 && (my.field.signi_down?.[dzi] ?? false)) return;
    }
    setLoading(true);
    try {
      // エナコストを支払う（色コスト + energyTrash指定コスト）＝支払い元は funnel 1本（§6.4）。
      // ⚠energyTrash 系は**エナゾーン専用**のコストなので pool ではなく my.energy の index を渡す。
      const signiActPay = planEnergyPayment(my, p.energyPayPool, costIndices, energyTrashIndices);
      const paidNums = signiActPay.paidNums;
      const energyTrashCards = signiActPay.extraEnergyNums;
      // energyTrashAll: エナゾーンのカードをすべてトラッシュ（選択不要、自動）
      const energyTrashAllCards = effect.cost?.energyTrashAll ? [...signiActPay.energyAfter] : [];
      // 手札捨てコストを支払う
      const discardedCards = [...discardCostIndices].map(i => my.hand[i]);
      const discardVarCards = discardVarIndices ? [...discardVarIndices].map(i => my.hand[i]) : [];
      const discardVarLevelSum = discardVarCards.reduce((s, cn) => {
        const lv = parseInt(battleCardMap.get(cn)?.Level ?? '0', 10) || 0;
        return s + lv;
      }, 0);
      const fixedDiscardLevelSum = discardedCards.reduce((s, cn) => {
        const lv = parseInt(battleCardMap.get(getCardNum(cn))?.Level ?? '0', 10) || 0;
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
      const keySub = useKeySub && p.energyTrashSubInfo.keySubInstId;
      const newField = keySub
        ? { ...my.field, signi_down: newSigniDown, key_piece: null, key_piece_extra: [] }
        : { ...my.field, signi_down: newSigniDown };
      const newLrigTrash = keySub ? [...my.lrig_trash, p.energyTrashSubInfo.keySubInstId!] : my.lrig_trash;
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
      const isGameOnceAct = effect.usageLimit === 'once_per_game';
      let paid: PlayerState = signiActPay.applyTo({
        ...my,
        hand: newHand,
        coins: coinCostAct > 0 ? Math.max(0, (my.coins ?? 0) - coinCostAct) : my.coins,
        coins_paid_this_turn: coinCostAct > 0 ? (my.coins_paid_this_turn ?? 0) + coinCostAct : my.coins_paid_this_turn, // COINS_PAID_THIS_TURN
        activate_cost_zero_signi: my.activate_cost_zero_signi === cardNum ? undefined : my.activate_cost_zero_signi,
        trash: [...my.trash, ...paidNums, ...energyTrashCards, ...discardedCards, ...discardAllCards, ...energyTrashAllCards, ...discardVarCards],
        lrig_trash: newLrigTrash,
        field: newField,
        actions_done: (effect.usageLimit === 'once_per_turn' || effect.usageLimit === 'twice_per_turn')
          ? [...(my.actions_done ?? []), effect.effectId] : (my.actions_done ?? []),
        game_actions_done: isGameOnceAct ? [...(my.game_actions_done ?? []), effect.effectId] : my.game_actions_done,
        ...activatedDiscardCostRecord(
          discardedCards.length, discardAllCards.length, energyTrashAllCards.length, discardVarCards.length,
        ),
        last_activated_discard_level_sum: discardVarCards.length > 0
          ? discardVarLevelSum
          : discardedCards.length > 0 ? fixedDiscardLevelSum : my.last_activated_discard_level_sum,
        last_cost_trashed_cards: [
          ...paidNums,
          ...discardedCards, ...discardAllCards, ...discardVarCards,
          ...energyTrashCards, ...energyTrashAllCards,
        ],
        last_cost_energy_trash_count: activatedEnergyTrashPaidCount(energyTrashIndices),
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
      });
      // energyTrashAll: エナゾーンを空にする（funnel の index 控除のあとに当てる）
      if (effect.cost?.energyTrashAll) paid = { ...paid, energy: [] };
      // underSelfTrash: 効果元シグニの下から、UIで選んだカードだけをトラッシュへ置く。
      if (effect.cost?.underSelfTrash) {
        const zoneIdx = paid.field.signi.findIndex(stack => stack?.at(-1) === cardNum);
        if (zoneIdx < 0) return;
        const underPaid = payUnderSelfTrash(
          paid, zoneIdx, underTrashKeys, effect.cost.underSelfTrash.count, battleCardMap,
          effect.cost.underSelfTrash.filter, effect.cost.underSelfTrash.selectionConstraint,
        );
        if (!underPaid) return;
        paid = {
          ...underPaid.state,
          last_cost_trashed_cards: [...(paid.last_cost_trashed_cards ?? []), ...underPaid.moved],
        };
      }
      // trashExile: トラッシュからカードをゲームから除外（lrig_trashへ）
      if (effect.cost?.trashExile?.self) {
        paid = { ...paid, trash: paid.trash.filter(cn => cn !== cardNum), lrig_trash: [...paid.lrig_trash, cardNum] };
      } else if (trashExileIndices.size > 0) {
        const exiledNums = [...trashExileIndices].map(i => my.trash[i]);
        paid = { ...paid, trash: paid.trash.filter((_, i) => !trashExileIndices.has(i)), lrig_trash: [...paid.lrig_trash, ...exiledNums] };
      }
      // trash_self: このシグニを場からトラッシュに置く（起動コスト）
      if (effect.cost?.trash_self) {
        const selfLevel = parseInt(battleCardMap.get(getCardNum(cardNum))?.Level ?? '', 10);
        const afterRemove = removeFromField(cardNum, paid);
        paid = {
          ...afterRemove,
          trash: [...afterRemove.trash, cardNum],
          last_field_trash_level: isNaN(selfLevel) ? paid.last_field_trash_level : selfLevel,
          last_cost_trashed_cards: [...(paid.last_cost_trashed_cards ?? []), cardNum],
        };
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
        const n = charmTrashVarCount;
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
        const newAcceAct = cloneAcceSlots(paid.field);
        const movedAcceAct: string[] = [];
        for (let zi = 0; zi < newAcceAct.length && movedAcceAct.length < acceTrashNAct; zi++) {
          while (newAcceAct[zi]?.length && movedAcceAct.length < acceTrashNAct) {
            movedAcceAct.push(newAcceAct[zi]!.shift()!);
          }
          if (newAcceAct[zi]?.length === 0) newAcceAct[zi] = null;
        }
        if (movedAcceAct.length < acceTrashNAct) return; // 支払い不能
        paid = { ...paid, field: { ...paid.field, signi_acce: newAcceAct }, trash: [...paid.trash, ...movedAcceAct] };
      }
      // fieldBanish: 場のシグニをコストで**バニッシュ**（§5.3 `O-67`・`WX05-044-E1`）。
      // 🔴**行き先はエナゾーン**＝下の `fieldTrash` ブロック（トラッシュ送り）へ落とすと資源を失う。
      // ⚠ゾーン選択 state は `fieldTrashZones` を共用する（parser は両キーを同時に立てない）。
      // ⚠支払ったカードは `last_cost_trashed_cards` に載せない（トラッシュ由来として観測されるため）。
      const fieldBanishCostAct = effect.cost?.fieldBanish;
      if (fieldBanishCostAct) {
        const fbPaidAct = payFieldBanishCost({
          my: paid, op, zones: fieldTrashZones, cost: fieldBanishCostAct,
          cardMap: battleCardMap, turnPhase: bs.turn_phase as import('../types').TurnPhase,
        });
        if (!fbPaidAct) { setLoading(false); return; } // 支払い不能（UI側でも無効化済み）
        paid = fbPaidAct.state;
      }
      // fieldTrash: 場のシグニをコストでトラッシュ（チャーム/アクセも一緒に。WX03-035「他の＜古代兵器＞のシグニ1体を場からトラッシュ」等）
      if (!fieldBanishCostAct && fieldTrashZones.size > 0) {
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
          if (newAcceFA[zi])   { toTrashFA.push(...newAcceFA[zi]!); newAcceFA[zi] = null; }
          newSigniFA[zi] = null;
          newDownFA[zi] = false;
          newFrozenFA[zi] = false;
        }
        paid = {
          ...paid,
          field: { ...paid.field, signi: newSigniFA, signi_down: newDownFA, signi_frozen: newFrozenFA, signi_charms: newCharmsFA, signi_acce: newAcceFA },
          trash: [...paid.trash, ...toTrashFA],
          last_field_trash_level: trashedSigniLevelFA,
          last_cost_trashed_cards: [...(paid.last_cost_trashed_cards ?? []), ...toTrashFA],
        };
      }
      // beat_signi: シグニを【ビート】にするコスト（自動選択・近似。beat_zone へ移し ON_BECOME_BEAT 用フラグを積む）
      if ((effect.cost?.beat_signi ?? 0) > 0) {
        const beatPayA = payBeatSigniCost(paid, cardNum, battleCardMap, effect.cost!.beat_signi!, [...beatZones]);
        if (!beatPayA.ok) { setLoading(false); return; } // 支払い不能（対象不足）
        paid = beatPayA.state;
      }
      // lrigDown: アップ状態のルリグをダウン（センター→アシストL→Rの順で自動支払い）。
      // 【出】経路（executeSigniOnPlayCost:11298）と同型。⚠ここが無いと【起】の
      // 《アップ状態の〜ルリグN体をダウンする》コストが丸ごと素通りする（タスク12(cviii)）。
      const lrigDownCostAct = effect.cost?.lrigDown;
      if (lrigDownCostAct) {
        const lrigPaidAct = payLrigDownCost(paid, lrigDownCostAct, battleCardMap);
        if (!lrigPaidAct) return; // 支払い不能（UI側でも無効化済み）
        paid = lrigPaidAct.state;
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
              playerId: p.actorId,
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
        playerId: p.actorId,
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
          allDiscardedForTrigger, paid, p.actorId, true,
          op, p.opponentId, cardNum, undefined, undefined);
        stackEntries.push(...hdEntries);
        if (usedLimitIds.length > 0) {
          paid = { ...paid, actions_done: [...(paid.actions_done ?? []), ...usedLimitIds] };
        }
      }
      // ON_COIN_PAID（C1 配線・シグニ【起】《コイン》）: コインを支払った場合に反応【自】を積む。
      if (coinCostAct > 0) {
        const actCoin = collectCoinPaidTriggers(p.actorId, paid, op);
        stackEntries.push(...actCoin.entries);
        paid = applyCoinPaidUsed(paid, actCoin); // 《ターン1回/2回》消化を永続化（続き106）
      }
      const turnPlayerId = bs.active_user_id ?? p.actorId;
      const existingStack = bs?.effect_stack ?? null;
      const newStack = existingStack
        ? pushToStack(existingStack, stackEntries)
        : initStack(turnPlayerId, stackEntries);
      const stateKey = p.actorKey;
      const oppStateKey: 'host_state' | 'guest_state' = p.actorKey === 'host_state' ? 'guest_state' : 'host_state';
      // ウィルス除去が起きた場合のみ自状態にマーカーを立てる（旧：payload を後から差し替えていた）
      if (newOpVirusState) paid = { ...paid, opp_virus_removed_just: true };
      await persist.commit(reduceBattle(bs, {
        type: 'WRITE_STATE', myKey: stateKey, myState: paid, effectStack: newStack, clearPending: true,
        opp: newOpVirusState ? { key: oppStateKey, state: newOpVirusState } : undefined,
      }));
    } finally {
      setLoading(false);
    }
  };

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
  const executeHandActivated = async (cardNum: string, handIndex: number, effect: import('../types/effects').CardEffect, costIndices: Set<number>) => {
    if (loading) return;
    setLoading(true);
    closeHandActivated();
    try {
      // エナコスト支払い
      const handActPay = planEnergyPayment(my, myEnergyPayPool, costIndices);
      const paidNums = handActPay.paidNums;
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
      let paid: PlayerState = handActPay.applyTo({
        ...my,
        hand: newHand,
        trash: [...my.trash, ...paidNums, cardNum],
        actions_done: [...(my.actions_done ?? []), effect.effectId],
        game_actions_done: isGameOnce ? [...(my.game_actions_done ?? []), effect.effectId] : my.game_actions_done,
      });
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
        isHost ? bs.guest_state : bs.host_state, isHost ? bs.guest_id : bs.host_id, cardNum, undefined, undefined);
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
      await persist.commit(reduceBattle(bs, {
        type: 'WRITE_STATE', myKey: stateKey, myState: paid, effectStack: newStack, clearPending: true,
        opp: newOpVirusState ? { key: opKey, state: newOpVirusState } : undefined,
      }));
    } finally {
      setLoading(false);
    }
  };

  // トラッシュ自己起動【起】を実行（コスト支払い → このカードをトラッシュから場に出す）。
  // カードはトラッシュに残したまま effect_stack に積み、resolver の execAddToField が
  // thisCardOnly source（トラッシュの効果元自身）を場へ移す。
  // ⚠ コスト支払いは `payTrashActivateCost` 一本（UI の可否判定と同じ関数群を使う）。
  const executeTrashActivated = async (
    cardNum: string,
    effect: import('../types/effects').CardEffect,
    costIndices: Set<number>,
    discardIndices: Set<number> = new Set(),
    exceedIndices: Set<number> = new Set(),
  ) => {
    if (loading) return;
    setLoading(true);
    closeTrashActivated();
    try {
      const payment = payTrashActivateCost(
        effect, my, op,
        { energy: costIndices, handDiscard: discardIndices, exceed: exceedIndices },
        battleCardMap, myEnergyPayPool,
      );
      if (!payment) return; // 支払い不能（UI側でも無効化済み）
      const isGameOnce = effect.usageLimit === 'once_per_game';
      let paid: PlayerState = {
        ...payment.my,
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
      const stackEntries: StackEntry[] = [entry];
      // ON_DISCARDED_AS_COST / ON_HAND_DISCARDED: 【起】コストで手札を捨てた場合のトリガー
      if (payment.discardedCards.length > 0) {
        const { entries: hdEntries, usedLimitIds } = collectHandDiscardTriggers(
          payment.discardedCards, paid, user.id, true,
          isHost ? bs.guest_state : bs.host_state, isHost ? bs.guest_id : bs.host_id, cardNum, undefined, undefined);
        stackEntries.push(...hdEntries);
        if (usedLimitIds.length > 0) paid = { ...paid, actions_done: [...(paid.actions_done ?? []), ...usedLimitIds] };
      }
      // ON_COIN_PAID: 《コイン》を支払った場合に反応する【自】を積む（シグニ【起】経路と同型）
      if (payment.coinPaid > 0) {
        const coinTrig = collectCoinPaidTriggers(user.id, paid, isHost ? bs.guest_state : bs.host_state);
        stackEntries.push(...coinTrig.entries);
        paid = applyCoinPaidUsed(paid, coinTrig);
      }
      const turnPlayerId = bs.active_user_id ?? user.id;
      const existingStack = bs?.effect_stack ?? null;
      const newStack = existingStack
        ? pushToStack(existingStack, stackEntries)
        : initStack(turnPlayerId, stackEntries);
      const stateKey = isHost ? 'host_state' : 'guest_state';
      const oppStateKey = isHost ? 'guest_state' : 'host_state';
      await persist.commit(reduceBattle(bs, {
        type: 'WRITE_STATE', myKey: stateKey, myState: paid, effectStack: newStack, clearPending: true,
        opp: payment.op ? { key: oppStateKey, state: payment.op } : undefined,
      }));
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
    const attachedAcceNum = hostZoneAcce >= 0 ? acceCardsAt(state.field, hostZoneAcce).at(-1) : null;
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
        coins: Math.max(0, (placedState.coins ?? 0) - coinCostOPC),
        coins_paid_this_turn: (placedState.coins_paid_this_turn ?? 0) + coinCostOPC, // COINS_PAID_THIS_TURN
        trash: [...placedState.trash, ...paidNums, ...discardNums],
        // handDiscardSigni コストで捨てたシグニのレベルを記録（COST_DISCARDED_SIGNI_LEVEL。WX25-P2-101「レベル１→代わりに－5000」）
        last_discarded_signi_level: discardNums.length > 0
          ? (() => { const lv = parseInt(battleCardMap.get(getCardNum(discardNums[0]))?.Level ?? '', 10); return isNaN(lv) ? placedState.last_discarded_signi_level : lv; })()
          : placedState.last_discarded_signi_level,
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
      if (isHandToEnergy) paid = { ...paid, energy: [...paid.energy, ...handPickedNums] };
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
      // fieldTrash / fieldToLrigTrash: 場のシグニを指定先へ（付属カードはルールどおりトラッシュへ）
      if (fieldTrashZones.size > 0) {
        const newSigniF  = [...paid.field.signi] as (string[] | null)[];
        const newDownF   = [...(paid.field.signi_down   ?? [false, false, false])];
        const newFrozenF = [...(paid.field.signi_frozen ?? [false, false, false])];
        const newCharmsF = [...(paid.field.signi_charms ?? [null, null, null])];
        const newAcceF   = [...(paid.field.signi_acce   ?? [null, null, null])];
        const toTrashF: string[] = [];
        const toLrigTrashF: string[] = [];
        const removedIidsF: string[] = []; // トラッシュしたシグニの instance ID（puppet_signi クリーンアップ用）
        let trashedSigniLevel: number | undefined;
        let trashedPuppetF = false; // 傀儡状態のシグニをコストでトラッシュしたか（COST_TRASHED_PUPPET。WDK17-014）
        const puppetSetF = new Set(paid.field.puppet_signi ?? []);
        for (const zi of fieldTrashZones) {
          const stack = newSigniF[zi];
          if (!stack || stack.length === 0) continue;
          // この方法でトラッシュに置いたシグニ（スタック最上段）のレベルを記録（WX03-001: 同じレベルのシグニを対象）
          const topSigni = battleCardMap.get(getCardNum(stack.at(-1)!));
          if (topSigni) trashedSigniLevel = parseInt(topSigni.Level ?? '0', 10) || 0;
          if (stack.some(iid => puppetSetF.has(iid))) trashedPuppetF = true;
          removedIidsF.push(...stack);
          if (cost?.fieldToLrigTrash) {
            toLrigTrashF.push(getCardNum(stack.at(-1)!));
            toTrashF.push(...stack.slice(0, -1).map(getCardNum));
          } else {
            toTrashF.push(...stack.map(getCardNum));
          }
          if (newCharmsF[zi]) { toTrashF.push(newCharmsF[zi]!); newCharmsF[zi] = null; }
          if (newAcceF[zi])   { toTrashF.push(...newAcceF[zi]!); newAcceF[zi] = null; }
          newSigniF[zi] = null;
          newDownF[zi] = false;
          newFrozenF[zi] = false;
        }
        const fieldDestination = cost?.fieldToLrigTrash ? 'lrig_trash' : 'trash';
        paid = {
          ...paid,
          field: { ...paid.field, signi: newSigniF, signi_down: newDownF, signi_frozen: newFrozenF, signi_charms: newCharmsF, signi_acce: newAcceF,
            puppet_signi: (paid.field.puppet_signi ?? []).filter(iid => !removedIidsF.includes(iid)) },
          trash: [...paid.trash, ...toTrashF],
          lrig_trash: fieldDestination === 'lrig_trash' ? [...paid.lrig_trash, ...toLrigTrashF] : paid.lrig_trash,
          last_field_trash_level: trashedSigniLevel,
          last_cost_trashed_puppet: trashedPuppetF,
          last_cost_trashed_cards: [...(paid.last_cost_trashed_cards ?? []), ...toTrashF],
        };
        if (toTrashF.length + toLrigTrashF.length > 0) payLogs.push(
          `場のシグニ${fieldTrashZones.size}体をコストで${fieldDestination === 'lrig_trash' ? 'ルリグトラッシュ' : 'トラッシュ'}へ`,
        );
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

  // ルリグ付与能力（GRANT_LRIG_ABILITY）の発動：エクシードコスト＋エナコスト支払い
  /**
   * ルリグの【起】（センタールリグ本来／付与／継承）の実行（人間・CPU 共通）。
   * DESIGN §4「CPU は対人戦と同じ処理を使う」の抽出形＝`performArts` / `performSigniActivated` と
   * 同じく **owner をパラメータ化**し、人間用 `executeLrigGranted` は薄いラッパーにする（§8 `O-1` (c)）。
   *
   * ⚠**「いま撃てるか」の判定はここではなく `lrigActivateGate.listActivatableLrigEffects`**
   * （提示と支払いは別の地点）。
   */
  const performLrigActivated = async (
    effect: import('../types/effects').CardEffect,
    sel: {
      costIndices: Set<number>;
      handDiscardIndices?: Set<number>;
      energyTrashIndices?: Set<number>;
      trashExileIndices?: Set<number>;
      /** `fieldBanish`（コストで自分の場のシグニをバニッシュ）で選んだシグニゾーン（§5.3 `O-67`）。 */
      fieldBanishZones?: Set<number>;
    },
    p: {
      actor: PlayerState; opponent: PlayerState;
      actorId: string;
      actorKey: 'host_state' | 'guest_state';
      /** `buildEnergyPayPool(actor, ...)` の結果（エナ支払い元 funnel）。 */
      energyPayPool: EnergyPayEntry[];
    },
  ) => {
    const my = p.actor;
    const op = p.opponent;
    const costIndices = sel.costIndices;
    const handDiscardIndices = sel.handDiscardIndices ?? new Set<number>();
    const energyTrashIndices = sel.energyTrashIndices ?? new Set<number>();
    const trashExileIndices = sel.trashExileIndices ?? new Set<number>();
    const fieldBanishZones = sel.fieldBanishZones ?? new Set<number>();
    setLoading(true);
    try {
      // エクシードコスト：センター → 左アシスト → 右アシストの順で下からN枚をルリグトラッシュへ
      const exceedCost = effect.cost?.exceed ?? 0;
      const newLrig     = [...my.field.lrig];
      const newAssistL  = [...(my.field.assist_lrig_l ?? [])];
      const newAssistR  = [...(my.field.assist_lrig_r ?? [])];
      let newLrigTrash = [...my.lrig_trash];
      const exceedPaidCards: string[] = []; // ON_EXCEED_COSTトリガー用（ルリグトラッシュに置かれたカード）
      // 🆕**色指定つきエクシード**（`WX10-001`「エクシード１（白のカード）」＝§5.3 2026-08-27 Sheet1 B13）。
      //   この経路は**下から機械的に**払う（選択UIが無い）ので、色指定があるときだけ
      //   「その色を満たすカード」を先に選ぶ。⚠満たせないときは従来どおり下から払う
      //   （ここに来る前に `canActivateLrigEffect` が提示を止めているので通常は到達しない）。
      const exceedColorsLA = effect.cost?.exceedColors;
      if (exceedCost > 0 && exceedColorsLA?.length) {
        const poolLA = [...newLrig.slice(0, -1), ...newAssistL.slice(0, -1), ...newAssistR.slice(0, -1)];
        const pickedLA: string[] = [];
        const usedLA = new Set<number>();
        for (const col of exceedColorsLA) {
          const idx = poolLA.findIndex((cn, i) => !usedLA.has(i) && (battleCardMap.get(cn)?.Color ?? '').includes(col));
          if (idx < 0) break;
          usedLA.add(idx); pickedLA.push(poolLA[idx]);
        }
        // 色指定より枚数が多い場合は残りを下から補う。
        for (let i = 0; i < poolLA.length && pickedLA.length < exceedCost; i++) {
          if (!usedLA.has(i)) { usedLA.add(i); pickedLA.push(poolLA[i]); }
        }
        if (pickedLA.length === exceedCost) {
          const pickedSetLA = new Set(pickedLA);
          exceedPaidCards.push(...pickedLA);
          newLrigTrash = [...newLrigTrash, ...pickedLA];
          for (const arr of [newLrig, newAssistL, newAssistR]) {
            for (let i = arr.length - 1; i >= 0; i--) if (pickedSetLA.has(arr[i])) arr.splice(i, 1);
          }
        }
      }
      if (exceedCost > 0 && exceedPaidCards.length === 0) {
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
      // エナコスト支払い（色コスト + energyTrash指定コスト）＝支払い元は funnel 1本（§6.4）
      const lgPay = planEnergyPayment(my, p.energyPayPool, costIndices, energyTrashIndices);
      const paidNums = lgPay.paidNums;
      const lgEnergyTrashCards = lgPay.extraEnergyNums;
      // energyTrashAll: エナゾーンのカードをすべてトラッシュ（自動）
      const lgEnergyTrashAllCards = effect.cost?.energyTrashAll ? [...lgPay.energyAfter] : [];
      const afterAllLGEnergy = effect.cost?.energyTrashAll ? [] : lgPay.energyAfter;
      // energyTrashColorAll: エナゾーンからすべての[色]のカードをトラッシュ（自動）。トラッシュした枚数を記録（WX04-002-E2）
      const lgEnergyTrashColor = effect.cost?.energyTrashColorAll;
      const lgEnergyTrashColorCards = lgEnergyTrashColor
        ? afterAllLGEnergy.filter(cn => battleCardMap.get(cn)?.Color?.includes(lgEnergyTrashColor))
        : [];
      // funnel の index 控除で作れない「全捨て／色全捨て」は控除後の state に当てる（下の overrideEnergy）
      const lgOverrideEnergy = (effect.cost?.energyTrashAll || lgEnergyTrashColor)
        ? (lgEnergyTrashColor
            ? afterAllLGEnergy.filter(cn => !lgEnergyTrashColorCards.includes(cn))
            : afterAllLGEnergy)
        : null;
      // 手札シグニ捨てコスト支払い
      const discardedHandNums = [...handDiscardIndices].map(i => my.hand[i]);
      const baseLGHand = my.hand.filter((_, i) => !handDiscardIndices.has(i));
      // discardAll: 手札をすべて捨てる（自動）
      const lgDiscardAllCards = effect.cost?.discardAll ? [...baseLGHand] : [];
      const newHand = effect.cost?.discardAll ? [] : baseLGHand;
      const lgIsGameOnce = effect.usageLimit === 'once_per_game';
      // 🔴《コインアイコン》コスト（`cost.coin`・live 82効果）＝**この経路には支払いが1行も無かった**
      //   （§8 `O-1` (c)・続き552c に発見）。シグニ【起】（`performSigniActivated`）は同じキーを
      //   deduct しているのに、ルリグ【起】だけコインが減らず、提示側も所持枚数を見ていなかった＝
      //   **宣言だけして踏み倒す**状態だった。⚠可否判定は `lrigActivateGate` 側と対にすること。
      const coinCostLg = effect.cost?.coin ?? 0;
      if (coinCostLg > 0 && (my.coins ?? 0) < coinCostLg) { setLoading(false); return; }
      let paid: import('../types').PlayerState = lgPay.applyTo({
        ...my,
        hand: newHand,
        coins: coinCostLg > 0 ? Math.max(0, (my.coins ?? 0) - coinCostLg) : my.coins,
        coins_paid_this_turn: coinCostLg > 0 ? (my.coins_paid_this_turn ?? 0) + coinCostLg : my.coins_paid_this_turn,
        trash: [...my.trash, ...paidNums, ...lgEnergyTrashCards, ...discardedHandNums, ...lgDiscardAllCards, ...lgEnergyTrashAllCards, ...lgEnergyTrashColorCards],
        field: { ...my.field, lrig: newLrig, assist_lrig_l: newAssistL, assist_lrig_r: newAssistR },
        lrig_trash: newLrigTrash,
        actions_done: [...(my.actions_done ?? []), effect.effectId, ...(coinCostLg > 0 ? ['COIN_SPENT'] : [])],
        game_actions_done: lgIsGameOnce ? [...(my.game_actions_done ?? []), effect.effectId] : my.game_actions_done,
        ...activatedDiscardCostRecord(
          discardedHandNums.length, lgDiscardAllCards.length, lgEnergyTrashAllCards.length, 0,
        ),
        last_cost_energy_trash_count: activatedEnergyTrashPaidCount(energyTrashIndices),
        last_energy_trash_color_count: lgEnergyTrashColor ? lgEnergyTrashColorCards.length : my.last_energy_trash_color_count,
        // 直前の能力コストでトラッシュへ送ったカード（`COST_TRASHED_MATCHES`）。§6.4 O-35・続き530。
        // 🔴**この経路（ルリグ本来の【起】＋付与/継承の【起】）にだけ記録が無かった**＝
        //   「この方法でカードをN枚以上トラッシュに置いた場合」（`WX25-CP1-020-E2` 3/7枚・
        //   `WXDi-P16-012-E3` 5枚。どちらもルリグ）の条件が恒久 false になる。
        // ⚠**この支払い分で上書き**する（シグニ 11825／召喚 12427 と同じ規約＝前の能力の支払いを持ち越さない）。
        last_cost_trashed_cards: [
          ...paidNums, ...lgEnergyTrashCards, ...discardedHandNums,
          ...lgDiscardAllCards, ...lgEnergyTrashAllCards, ...lgEnergyTrashColorCards,
        ],
      });
      if (lgOverrideEnergy) paid = { ...paid, energy: lgOverrideEnergy };
      // trashExile: トラッシュからカードをゲームから除外（lrig_trashへ）
      if (trashExileIndices.size > 0) {
        const lgExiledNums = [...trashExileIndices].map(i => my.trash[i]);
        paid = { ...paid, trash: paid.trash.filter((_, i) => !trashExileIndices.has(i)), lrig_trash: [...paid.lrig_trash, ...lgExiledNums] };
      }
      // exileLrigFromLrigDeck: ルリグデッキの＜X＞のルリグN枚をゲームから除外（ルリグ起動コスト・PR-469）。
      // ⚠**行先は `excluded`**＝ルリグトラッシュではない（`trashArtsFromLrigDeck` と混ぜない）。
      // ⚠支払えないときは**発動そのものを中止**する（コスト踏み倒しを作らない）。
      const exileLrigCost = effect.cost?.exileLrigFromLrigDeck;
      if (exileLrigCost) {
        const matchExLrig = (n: string): boolean => {
          const c = battleCardMap.get(getCardNum(n));
          if (!c) return false;
          if (!exileLrigCost.story) return true;
          return (c.CardClass ?? '').split(/[/／]/).map(x => x.trim()).includes(exileLrigCost.story);
        };
        const pickedExLrig: string[] = [];
        for (const n of paid.lrig_deck) {
          if (pickedExLrig.length >= exileLrigCost.count) break;
          if (matchExLrig(n)) pickedExLrig.push(n);
        }
        if (pickedExLrig.length < exileLrigCost.count) { setLoading(false); return; }
        const exSet = new Set(pickedExLrig);
        paid = {
          ...paid,
          lrig_deck: paid.lrig_deck.filter(n => !exSet.has(n)),
          excluded: [...(paid.excluded ?? []), ...pickedExLrig],
        };
        appendBattleLogs([`ルリグデッキの${exileLrigCost.story ? `＜${exileLrigCost.story}＞の` : ''}ルリグ${pickedExLrig.length}枚をゲームから除外（コスト）`]);
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
      // lrigDown: アップ状態のルリグをダウン（センター→アシストL→Rの順で自動支払い）。
      // ルリグ本来の【起】もこの経路を通る（WXDi-P02-009-E3／WXDi-P03-009-E3＝レベル2のルリグ2体）。タスク12(cviii)
      const lrigDownCostLg = effect.cost?.lrigDown;
      if (lrigDownCostLg) {
        const lrigPaidLg = payLrigDownCost(paid, lrigDownCostLg, battleCardMap);
        if (!lrigPaidLg) { setLoading(false); return; } // 支払い不能（UI側でも無効化済み）
        paid = lrigPaidLg.state;
      }
      // 🔴down_self（【起】《ダウン》）＝**この能力を使ったカード自身**をダウンする。タスク12(cxxxi)。
      // ⚠従来この経路には支払いが1行も無かった＝`executeSigniActivated` の実装が `field.signi` しか
      //   探さないので、ルリグの【起】では `findIndex` が常に -1 ＝**誰もダウンせず実質無コスト**
      //   （live 27効果。`usageLimit` を持たない効果は同一ターンに何度でも撃てていた）。
      // ⚠可否判定は下の `isLrigDownSelfUnpayable`（UI側ゲート）と対になる＝両方揃えること。
      if (effect.cost?.down_self) {
        const downSelfPaid = payLrigDownSelfCost(paid);
        if (!downSelfPaid) { setLoading(false); return; }   // 既にダウン＝払えない（UI側でも非提示）
        paid = downSelfPaid;
      }
      // 🔴fieldBanish（「レベル２以下の＜原子＞のシグニ１体をバニッシュする：」＝`WX25-P1-022-E1`）。
      //   §5.3 `O-67`。⚠**この経路には場シグニ系コストの支払いが1行も無かった**＝提示だけして踏み倒せた。
      //   ⚠行き先は**エナゾーン**＝`fieldTrash`（トラッシュ）と混ぜない。可否判定は `lrigActivateGate` と対。
      const lgFieldBanishCost = effect.cost?.fieldBanish;
      if (lgFieldBanishCost) {
        const fbPaidLg = payFieldBanishCost({
          my: paid, op, zones: fieldBanishZones, cost: lgFieldBanishCost,
          cardMap: battleCardMap, turnPhase: bs.turn_phase as import('../types').TurnPhase,
        });
        if (!fbPaidLg) { setLoading(false); return; }
        paid = fbPaidLg.state;
      }
      const lrigTop = my.field.lrig.at(-1);
      const cardName = battleCardMap.get(lrigTop ?? '')?.CardName ?? 'ルリグ';
      // ルリグ自身の【起】効果か、付与/継承された【起】効果かでラベルを分ける
      const isOwnLrigEffect = (effectsMap.get(lrigTop ?? '') ?? []).some(e => e.effectId === effect.effectId);
      const entry: import('../types').StackEntry = {
        id: generateUUID(),
        playerId: p.actorId,
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
            playerId: p.actorId,
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
        const myTurnEC = p.actorId === bs.active_user_id;
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
              playerId: p.actorId,
              cardNum: topEC,
              effectId: eff.effectId,
              label: `${battleCardMap.get(topEC)?.CardName ?? topEC}【自】エクシードコスト支払い時`,
              effect: eff,
            });
          }
        }
        if (exceedUsedIds.length > 0) paid = { ...paid, actions_done: [...(paid.actions_done ?? []), ...exceedUsedIds] };
      }
      // ON_COIN_PAID（C1 配線）＝シグニ【起】と同じく、コインを支払ったら反応【自】を積む。
      if (coinCostLg > 0) {
        const lgCoin = collectCoinPaidTriggers(p.actorId, paid, op);
        entriesLG.push(...lgCoin.entries);
        paid = applyCoinPaidUsed(paid, lgCoin); // 《ターン1回/2回》消化を永続化
      }
      const turnPlayerId = bs.active_user_id ?? p.actorId;
      const existingStack = bs?.effect_stack ?? null;
      const newStack = existingStack
        ? pushToStack(existingStack, entriesLG)
        : initStack(turnPlayerId, entriesLG);
      const stateKey = p.actorKey;
      const oppStateKeyLrig: PlayerStateKey = p.actorKey === 'host_state' ? 'guest_state' : 'host_state';
      await persist.commit(reduceBattle(bs, {
        type: 'WRITE_STATE', myKey: stateKey, myState: paid, effectStack: newStack, clearPending: true,
        opp: newOpVirusStateLrig ? { key: oppStateKeyLrig, state: newOpVirusStateLrig } : undefined,
      }));
    } finally {
      setLoading(false);
    }
  };

  /** 人間UI（`LrigGrantedModal`）から呼ぶ薄いラッパー。本体は `performLrigActivated`。 */
  const executeLrigGranted = async (effect: import('../types/effects').CardEffect, costIndices: Set<number>, handDiscardIndices: Set<number> = new Set(), energyTrashIndices: Set<number> = new Set(), trashExileIndices: Set<number> = new Set(), fieldBanishZones: Set<number> = new Set()) => {
    if (loading) return;
    closeLrigGranted();
    await performLrigActivated(effect, { costIndices, handDiscardIndices, energyTrashIndices, trashExileIndices, fieldBanishZones }, {
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
      if (!stack || stack.length === 0) return [];
      const topNum = stack[stack.length - 1];
      // GATE: 【起】の発動可否は `signiActivateGate` に一本化（人間ボタン／CPU の候補フィルタと同じ関数）。
      const activatable = listActivatableSigniEffects({
        my, op, zoneIndex: rawZoneIdx, phase: bs.turn_phase, isMyTurn,
        effectsMap, cardMap: battleCardMap, effectivePowers, contBlockedSelf: contBlocked.forSelf,
      });
      if (activatable.length === 0) return [];
      return activatable.map(eff => {
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
              eff.cost.removeOppVirus ? `ウィルス${eff.cost.removeOppVirus}除去` : null,
              eff.cost.trash_self ? 'このシグニをトラッシュ' : null,
              eff.cost.trash_key ? 'このキーをルリグトラッシュ' : null,
              eff.cost.charmTrash ? `チャーム${eff.cost.charmTrash}枚トラッシュ` : null,
              eff.cost.acceTrash ? `アクセ${eff.cost.acceTrash}枚トラッシュ` : null,
              eff.cost.fieldTrash ? `場の${eff.cost.fieldTrash.excludeSelf ? '他の' : ''}シグニ${eff.cost.fieldTrash.count}体トラッシュ` : null,
              // ⚠**行き先はエナゾーン**なので「トラッシュ」と書き分ける（§5.3 `O-67`）。ラベルに出さないと
              //   ①プレイヤーにコストが見えない ②同名の【起】を2つ持つカードで撃ち分けられない（§4.4 罠8m）。
              eff.cost.fieldBanish ? `場の${eff.cost.fieldBanish.excludeSelf ? '他の' : ''}シグニ${eff.cost.fieldBanish.count}体バニッシュ` : null,
              eff.cost.fieldDown ? `場のシグニ${eff.cost.fieldDown.count}体ダウン` : null,
              eff.cost.lrigDown ? fmtLrigDownCostLabel(eff.cost.lrigDown) : null,
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
      const altFlip = collectAltAttackFlipSigni(my, battleCardMap, effectsMap);
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
      if (my.field.lrig_down) return []; // 攻撃済み
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
      if (lrigCostALK.blocked) {
        return [{ label: lrigCostALK.colorless > 0 ? `アタック不可（《無》×${lrigCostALK.colorless}）` : 'アタック不可', color: C.textDim, onClick: () => {} }];
      }
      return [{
        label: lrigCostALK.colorless > 0 ? `アタック（《無》×${lrigCostALK.colorless}）` : 'アタック',
        color: C.danger, onClick: handleLrigAttack,
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
        onClick: () => {
          void performLrigAttack({
            attacker: my, defender: op, attackerId: user.id,
            attackerKey: isHost ? 'host_state' : 'guest_state',
            slot: side === 'l' ? 'assist_l' : 'assist_r',
          });
        },
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
    await persist.commit(reduceBattle(bs, { type: 'ACK_END', isHost }));
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

  const modalCtx: BattleModalCtx = { bs, user, my, op, isMyTurn, loading, battleCards, battleCardMap, effectsMap, myEnaAllMulti, myEnaMultiStripped, myColorlessOverrides, myColorSubs, pickLongPressTimer, setExpandedPickImgUrl, activeCostMods, myEnergyExtraColors, myEnergyPayPool, myEnergyTrashSubInfo, myLrigNameAliases, myArtsThresholdReductions, isActionBlocked, specificCardCostReductions, myArtsPayerCtx };

  return (
    <div style={{ height: '100vh', backgroundColor: C.bgApp, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {/* 勝敗確定ポップアップ */}
      <FinishedPopup ctx={modalCtx} isHost={isHost} handleEndAck={handleEndAck} />

      {/* 終了確認モーダル */}
      <EndConfirmModal ctx={modalCtx} showEndConfirm={showEndConfirm} setShowEndConfirm={setShowEndConfirm} handleEnd={handleEnd} />

      {/* グロウ選択モーダル */}
      <GrowModal ctx={modalCtx} showGrowModal={showGrowModal} setShowGrowModal={setShowGrowModal} pendingGrowCard={pendingGrowCard} setPendingGrowCard={setPendingGrowCard} selectedGrowCost={selectedGrowCost} setSelectedGrowCost={setSelectedGrowCost} freeGrowFilter={freeGrowFilter} setFreeGrowFilter={setFreeGrowFilter} growCandidates={growCandidates} currentLrigLevel={currentLrigLevel} executeGrow={executeGrow} toggleGrowCostCard={toggleGrowCost} />

      {/* アーツ使用モーダル */}
      <ArtsModal ctx={modalCtx} showArtsModal={showArtsModal} setShowArtsModal={setShowArtsModal} pendingArtsCard={pendingArtsCard} setPendingArtsCard={setPendingArtsCard} pendingArtsEffectiveCost={pendingArtsEffectiveCost} setPendingArtsEffectiveCost={setPendingArtsEffectiveCost} selectedArtsCost={selectedArtsCost} setSelectedArtsCost={setSelectedArtsCost} selectedArtsDiscard={selectedArtsDiscard} setSelectedArtsDiscard={setSelectedArtsDiscard} selectedArtsUseCostPay={selectedArtsUseCostPay} setSelectedArtsUseCostPay={setSelectedArtsUseCostPay} betAmount={betAmount} setBetAmount={setBetAmount} isBoosting={isBoosting} setIsBoosting={setIsBoosting} isEncore={isEncore} setIsEncore={setIsEncore} keySubstituteEnabled={keySubstituteEnabled} setKeySubstituteEnabled={setKeySubstituteEnabled} executeArts={executeArts} toggleArtsCostCard={toggleArtsCost} />

      {/* スペル発動コスト選択 */}
      <SpellCastModal ctx={modalCtx} pendingSpellCast={pendingSpellCast} setPendingSpellCast={setPendingSpellCast} selectedSpellCost={selectedSpellCost} setSelectedSpellCost={setSelectedSpellCost} selectedSpellDiscard={selectedSpellDiscard} setSelectedSpellDiscard={setSelectedSpellDiscard} selectedSpellUseCostPay={selectedSpellUseCostPay} setSelectedSpellUseCostPay={setSelectedSpellUseCostPay} betAmount={betAmount} setBetAmount={setBetAmount} toggleSpellCostCard={toggleSpellCost} castSpell={castSpell} />

      {/* v0.277: 手札から発動する【起】コスト選択 */}
      <HandActivatedModal ctx={modalCtx} pendingHandActivated={pendingHandActivated} setPendingHandActivated={setPendingHandActivated} selectedHandActivatedCost={selectedHandActivatedCost} setSelectedHandActivatedCost={setSelectedHandActivatedCost} executeHandActivated={executeHandActivated} />

      {/* トラッシュ自己起動【起】（「このシグニをトラッシュから場に出す」等）のエナコスト支払い */}
      <TrashActivatedModal ctx={modalCtx} pendingTrashActivated={pendingTrashActivated} setPendingTrashActivated={setPendingTrashActivated} selectedTrashActivatedCost={selectedTrashActivatedCost} setSelectedTrashActivatedCost={setSelectedTrashActivatedCost} selectedTrashActivatedDiscard={selectedTrashActivatedDiscard} setSelectedTrashActivatedDiscard={setSelectedTrashActivatedDiscard} selectedTrashActivatedExceed={selectedTrashActivatedExceed} setSelectedTrashActivatedExceed={setSelectedTrashActivatedExceed} executeTrashActivated={executeTrashActivated} />

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

      {/* ライフバースト確認＋カード拡大＋相手クラッシュ確認 */}
      <LifeBurstCheckModal ctx={modalCtx} eichiSuppressActive={eichiSuppressActive} crashSourceSuppressActive={crashSourceSuppressActive} matchesAllZoneBurstGrant={matchesAllZoneBurstGrant} burstCardZoomed={burstCardZoomed} setBurstCardZoomed={setBurstCardZoomed} opCheckCardZoomed={opCheckCardZoomed} setOpCheckCardZoomed={setOpCheckCardZoomed} handleLifeBurstResponse={handleLifeBurstResponse} />

      {/* ガード応答ダイアログ（自分が攻撃されたとき・バースト処理中は非表示） */}
      <GuardResponseDialog ctx={modalCtx} contBlocked={contBlocked} myHandGuardClasses={myHandGuardClasses} isHost={isHost} performGuardResponse={performGuardResponse} handleGuardResponse={handleGuardResponse} handleGuardWithEnergyAlternative={handleGuardWithEnergyAlternative} handleGuardWithHandAlternative={handleGuardWithHandAlternative} />

      {/* リムーブ選択モーダル */}
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
      <SigniActivatedModal ctx={modalCtx} pendingSigniActivated={pendingSigniActivated} setPendingSigniActivated={setPendingSigniActivated} selectedSigniActivatedCost={selectedSigniActivatedCost} setSelectedSigniActivatedCost={setSelectedSigniActivatedCost} selectedSigniActivatedDiscard={selectedSigniActivatedDiscard} setSelectedSigniActivatedDiscard={setSelectedSigniActivatedDiscard} selectedSigniActivatedDiscardVar={selectedSigniActivatedDiscardVar} setSelectedSigniActivatedDiscardVar={setSelectedSigniActivatedDiscardVar} selectedSigniActivatedFieldTrash={selectedSigniActivatedFieldTrash} setSelectedSigniActivatedFieldTrash={setSelectedSigniActivatedFieldTrash} selectedSigniActivatedUnderTrash={selectedSigniActivatedUnderTrash} setSelectedSigniActivatedUnderTrash={setSelectedSigniActivatedUnderTrash} selectedSigniActivatedEnergyTrash={selectedSigniActivatedEnergyTrash} setSelectedSigniActivatedEnergyTrash={setSelectedSigniActivatedEnergyTrash} selectedSigniActivatedTrashExile={selectedSigniActivatedTrashExile} setSelectedSigniActivatedTrashExile={setSelectedSigniActivatedTrashExile} selectedSigniActivatedBeat={selectedSigniActivatedBeat} setSelectedSigniActivatedBeat={setSelectedSigniActivatedBeat} signiActCharmTrashVar={signiActCharmTrashVar} setSigniActCharmTrashVar={setSigniActCharmTrashVar} keySubstituteEnabled={keySubstituteEnabled} setKeySubstituteEnabled={setKeySubstituteEnabled} executeSigniActivated={executeSigniActivated} />

      {/* ===== エナゾーンACTIVATED（アクセカード）モーダル ===== */}
      <EnergyActivatedModal ctx={modalCtx} pendingEnergyActivated={pendingEnergyActivated} setPendingEnergyActivated={setPendingEnergyActivated} selectedEnergyActivatedCost={selectedEnergyActivatedCost} setSelectedEnergyActivatedCost={setSelectedEnergyActivatedCost} executeEnergyActivated={executeEnergyActivated} />

      {/* ===== シグニ出現時コスト付き【出】効果 モーダル ===== */}
      <SigniOnPlayCostModal ctx={modalCtx} pendingSigniOnPlayCost={pendingSigniOnPlayCost} selectedSigniOnPlayCost={selectedSigniOnPlayCost} setSelectedSigniOnPlayCost={setSelectedSigniOnPlayCost} selectedSigniOnPlayDiscard={selectedSigniOnPlayDiscard} setSelectedSigniOnPlayDiscard={setSelectedSigniOnPlayDiscard} selectedSigniOnPlayEnergyTrash={selectedSigniOnPlayEnergyTrash} setSelectedSigniOnPlayEnergyTrash={setSelectedSigniOnPlayEnergyTrash} selectedSigniOnPlayFieldTrash={selectedSigniOnPlayFieldTrash} setSelectedSigniOnPlayFieldTrash={setSelectedSigniOnPlayFieldTrash} selectedSigniOnPlayExceed={selectedSigniOnPlayExceed} setSelectedSigniOnPlayExceed={setSelectedSigniOnPlayExceed} selectedSigniOnPlayBeat={selectedSigniOnPlayBeat} setSelectedSigniOnPlayBeat={setSelectedSigniOnPlayBeat} selectedSigniOnPlayArtsTrash={selectedSigniOnPlayArtsTrash} setSelectedSigniOnPlayArtsTrash={setSelectedSigniOnPlayArtsTrash} selectedSigniOnPlayUnderTrash={selectedSigniOnPlayUnderTrash} setSelectedSigniOnPlayUnderTrash={setSelectedSigniOnPlayUnderTrash} signiOnPlayCharmTrashVar={signiOnPlayCharmTrashVar} setSigniOnPlayCharmTrashVar={setSigniOnPlayCharmTrashVar} executeSigniOnPlayCost={executeSigniOnPlayCost} skipSigniOnPlayCost={skipSigniOnPlayCost} />

      {/* ===== ルリグ付与能力（GRANT_LRIG_ABILITY）発動モーダル ===== */}
      <LrigGrantedModal ctx={modalCtx} pendingLrigGranted={pendingLrigGranted} setPendingLrigGranted={setPendingLrigGranted} selectedLrigGrantedCost={selectedLrigGrantedCost} setSelectedLrigGrantedCost={setSelectedLrigGrantedCost} selectedLrigGrantedHandDiscard={selectedLrigGrantedHandDiscard} setSelectedLrigGrantedHandDiscard={setSelectedLrigGrantedHandDiscard} selectedLrigGrantedEnergyTrash={selectedLrigGrantedEnergyTrash} setSelectedLrigGrantedEnergyTrash={setSelectedLrigGrantedEnergyTrash} selectedLrigGrantedTrashExile={selectedLrigGrantedTrashExile} setSelectedLrigGrantedTrashExile={setSelectedLrigGrantedTrashExile} selectedLrigGrantedFieldBanish={selectedLrigGrantedFieldBanish} setSelectedLrigGrantedFieldBanish={setSelectedLrigGrantedFieldBanish} executeLrigGranted={executeLrigGranted} />
      {/* ===== 効果スタック 整列モーダル ===== */}
      <StackOrderModal ctx={modalCtx} stackOrderIds={stackOrderIds} setStackOrderIds={setStackOrderIds} handleConfirmStackOrder={handleConfirmStackOrder} />

      {/* ===== 効果インタラクション モーダル ===== */}
      <EffectInteractionModal ctx={modalCtx} effectSelectedNums={effectSelectedNums} setEffectSelectedNums={setEffectSelectedNums} selectedOptCost={selectedOptCost} setSelectedOptCost={setSelectedOptCost} selectedMultiChoiceIds={selectedMultiChoiceIds} setSelectedMultiChoiceIds={setSelectedMultiChoiceIds} lookReorderOrder={lookReorderOrder} setLookReorderOrder={setLookReorderOrder} lookReorderTrash={lookReorderTrash} setLookReorderTrash={setLookReorderTrash} lookReorderBottom={lookReorderBottom} setLookReorderBottom={setLookReorderBottom} rearrangeSlots={rearrangeSlots} setRearrangeSlots={setRearrangeSlots} handleEffectInteraction={handleEffectInteraction} handleSelectZoneForEffect={handleSelectZoneForEffect} handleSelectSigniZoneForEffect={handleSelectSigniZoneForEffect} handleSelectVirusZoneForEffect={handleSelectVirusZoneForEffect} handleRearrangeSigniConfirm={handleRearrangeSigniConfirm} />

      {/* ===== 観戦表示＋長押し拡大＋終了ボタン ===== */}
      <SystemOverlays ctx={modalCtx} expandedPickImgUrl={expandedPickImgUrl} setShowEndConfirm={setShowEndConfirm} />

    </div>
  );
}
