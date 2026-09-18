// 🆕§5.7 `S-5c` 第3段（2026-09-18）＝シグニアタックのバトル解決（`resolvePendingSigniBattleFor`・1,588行）を
//   `BattleScreen` から**逐語で移設**し、材料と I/O を `PerformCtx` で注入にした（人間・CPU 共用）。
// ⚠可否の判定はここに書かない。⚠`loading` の確認は画面のラッパ。
import type {BattleStateRow, PlayerState, CardData, StackEntry} from '../../../types';
import type {CardEffect} from '../../../types/effects';
import {leaveToTrashWindowApplies, calcFieldPowers, checkActiveCondition, collectCrossStates, cardHasCrossIcon, collectFrozenBanishOverrides, collectRiseBanishSubstitutes, banishRedirectAppliesFrom, banishRedirectFrontMatches, collectBanishEffectProtectedSigni, collectContinuousGrantedKeywords, collectBanishSubstitutes, collectBanishPreventLoseAbility, matchesStateFilter} from '../../../engine/effectEngine';
import {removeFromField, getCardNum, evalUseCondition, matchesFilter} from '../../../engine/effectExecutor';
import {SIGNI_BARRIER_CARD, countBarrierTokens, removeOneBarrierToken, sweepPuppets, sweepFacedownAttached} from '../../../engine/execUtils';
import {initStack, pushToStack} from '../../../engine/effectStack';
import {collectAnyZoneTrashSelfTriggers as pureCollectAnyZoneTrashSelfTriggers, collectTrashTriggers as pureCollectTrashTriggers, collectBanishTriggers as pureCollectBanishTriggers, collectLeaveFieldTriggers as pureCollectLeaveFieldTriggers, collectCharmToTrashTriggers as pureCollectCharmToTrashTriggers, collectAcceToTrashTriggers as pureCollectAcceToTrashTriggers, collectAttackEndTriggers as pureCollectAttackEndTriggers, collectSelfEventTriggers as pureCollectSelfEventTriggers, collectSigniCrashTotalTriggers as pureCollectSigniCrashTotalTriggers, battleBanisherMatchesTrigger} from '../../../engine/triggerCollect';
import {detectLeftFieldSigni, detectLeftFieldSigniToTrash, countCharmsToTrash} from '../../../engine/boardDiff';
import {hasApplicableLancer, hasBanishResist} from '../../../utils/keywords';
import {acceCardsAt, cloneAcceSlots, hasAcceAt} from '../../../utils/acce';
import {consumeNextDamagePrevention, type DamageSourceContext} from '../damagePrevention';
import {pickLifeCrashReplacement, applyMillReplacement, applyPayCostReplacement, consumeLifeCrashReplacement, consumeLifeCrashReplaceDecision, lifeCrashReplaceAskOptions, lifeCrashReplaceLog} from '../lifeCrashReplace';
import {selectMandatoryAttackerBanishSubstitute} from '../attackerBanishSubstitute';


import {battleOutcome, battleOutcomeLabel, lancerCrushTriggers, type DefenderBattleResolution} from '../battleOutcome';
import {CPU_PLAYER_ID, generateUUID, parsePowerVal, isSelectedBanishRedirect, isSelectedBattleBanishRedirect, hasActivePreventDamageWindow} from '../battleUtils';
import {recordEnergyPlacements} from '../../../engine/energyPlacement';
import {consumeBattleBanishDelayedTriggers} from '../delayedTrigger';
import type {PerformCtx} from './performCtx';
import {reduceBattle} from './battleController';
import {resonaLeaveDestination} from '../../../engine/resonaZone';
import {getSigniAttackKeywordState} from '../signiAttackKeywords';
import {signiCannotDealDamageToOpponent} from '../signiDamageGate';
import {sideAttackEmptyZoneDealsDamage} from '../sideAttackDamage';
import {grantedStoreWatchers} from '../../../engine/grantedStore';
import {collectBattleBanishDelayedTriggers as pureCollectBattleBanishDelayedTriggers, collectAttackEndDelayedTriggers as pureCollectAttackEndDelayedTriggers} from '../../../engine/triggerCollect';
// 「このターン手札から捨てた」台帳の唯一の入口（`V-101`②）。支払い地点ごとに書くと必ずどれかが落ちる。
import {allowedLifeCrashCount, collectLifeCrashPreventions} from '../../../engine/lifeCrashGate';

export async function resolvePendingSigniBattleFor(
    myS: PlayerState,
    opS: PlayerState,
    myKey: 'host_state' | 'guest_state',
    attackerId: string,
    defenderId: string,
    c: PerformCtx,
  ): Promise<void> {
  // ── 注入された材料を**画面と同じ名前**で取り出す（下の本体は画面から逐語で移設＝名前を変えない）──
  const { bs, cardMap: battleCardMap, effectsMap, effectivePowers } = c;
  const user = { id: c.userId };
  const persist = { commit: c.io.commit };
  const appendBattleLogs = c.io.appendLogs;
  const setLoading = c.io.setLoading;
  const mkTrigCtx = c.trigCtx;
  // 🔴**付与キーワードは「アタックしている側」の盤面から引く**（2026-09-18・移設時に修正）。
  //   画面の `dynamicKeywords.my` は**画面を見ている人**の側で計算されている＝CPU がアタックすると
  //   CPU のシグニの付与（正面以外追加アタック／正面隣追加アタック）が引けなかった。
  const attackerIsActive = bs.active_user_id === attackerId;
  const dynamicKeywords = {
    my: collectContinuousGrantedKeywords(myS, opS, attackerIsActive, effectsMap, battleCardMap, effectivePowers),
  };
  const collectPowerZeroBanishCandidates = (hostState: PlayerState, guestState: PlayerState): string[] =>
    powerZeroBanishCandidates(bs, hostState, guestState, effectsMap, battleCardMap);

  // ── 画面にあった薄いラッパと `crashOneLife`（この関数からしか呼ばれない）を逐語で写す ──
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

  const collectCharmToTrashTriggers = (
    controllerId: string,
    controllerState: PlayerState,
    otherState: PlayerState,
    charmsFromControllerField: number,
    charmsFromOppField: number,
  ): { entries: StackEntry[]; usedOncePerTurnIds: string[] } =>
    pureCollectCharmToTrashTriggers(mkTrigCtx(), controllerId, controllerState, otherState, charmsFromControllerField, charmsFromOppField);

  const collectAcceToTrashTriggers = (
    controllerId: string,
    controllerState: PlayerState,
    otherState: PlayerState,
    acceFromControllerField: number,
    acceFromOppField: number,
  ): { entries: StackEntry[]; usedOncePerTurnIds: string[] } =>
    pureCollectAcceToTrashTriggers(mkTrigCtx(), controllerId, controllerState, otherState, acceFromControllerField, acceFromOppField);

  const collectSigniCrashTotalTriggers = (
    controllerId: string,
    controllerState: PlayerState,
    otherState: PlayerState,
    signiNum: string,
    total: number,
  ): { entries: StackEntry[]; usedOncePerTurnIds: string[] } =>
    pureCollectSigniCrashTotalTriggers(mkTrigCtx(), controllerId, controllerState, otherState, signiNum, total);

  const collectSelfEventTriggers = (
    timing: 'ON_LIFE_CRASHED' | 'ON_GUARD' | 'ON_OPP_SIGNI_ATTACK_NEGATED_BY_EFFECT' | 'ON_OPP_VIRUS_PLACED' | 'ON_OPP_VIRUS_REMOVED' | 'ON_OPP_VIRUS_CHANGED',
    myState: PlayerState,
    opState: PlayerState,
    labelSuffix: string,
    ownerId: string = user.id, // myState の持ち主（CPU効果収集時はCPU_PLAYER_ID）
  ): { entries: StackEntry[]; usedOncePerTurnIds: string[] } =>
    pureCollectSelfEventTriggers(mkTrigCtx(), timing, myState, opState, labelSuffix, ownerId);

  const crashOneLife = (
    stateIn: PlayerState,
    victim: { opponent: PlayerState; isTurnPlayer: boolean },
    damageSource?: DamageSourceContext,
    crashSourceCardNum?: string,
    /**
     * §5.3 `O-120`：このクラッシュの**原因キーワード**（`'ランサー'` / `'Ｓランサー'`）。
     * ⚠**省略＝原因不明**であり「通常のバトルダメージ」を意味しない。`crashedByKeywords` を持つ効果は
     *   fail-closed で発火しないので、**ランサー経路では必ず渡すこと**（渡し忘れると恒久 no-op になる）。
     */
    crashCause?: string,
    /**
     * 🆕§5.3 `O-414`：被害側が下したダメージ置換の決定（「代わりに〜してもよい」）。
     * ⚠**省略時は `state` から読む**＝呼び出し側が先に基点から落としている場合はここへ明示的に渡す
     *   （落とさないと**ダメージが起きなかった経路**に残骸が残り、次のアタックまで効いてしまう）。
     */
    replaceDecisionArg?: { option: import('../../../types').LifeCrashReplaceOptionState | null },
  ): { newState: PlayerState; crashed: string | null; prevented?: boolean; crashOpponentInstead?: number } => {
    // 🆕§5.3 `O-414`（2026-09-16）＝被害側の決定は**このクラッシュ1回ぶん**。
    //   🔴**読んだら即消す**＝置換が成立しなかった経路（防止・バリア・ライフ0）でも消える形にしておかないと、
    //     次のアタックのダメージまで同じ決定で置換される。以降の `state` は決定を落とした後のもの。
    const replaceDecision = replaceDecisionArg ?? stateIn.life_crash_replace_choice;
    const state = consumeLifeCrashReplaceDecision(stateIn);
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
    // 🆕§5.3 `O-317`＝`sourcePowerGte` を持つ window は**ダメージ源のパワー**を見る（`WX25-P2-008-E1`）。
    // 🆕§5.3 `O-383`＝レベル上限の window（`WXDi-P03-077-BURST`）も同じ地点でダメージ源のレベルを見る。
    if (hasActivePreventDamageWindow(state, 'ALL', damageSource?.power, damageSource?.level)) {
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
      const picked = pickLifeCrashReplacement(state, {
        damageSource: damageSource?.type, cardMap: battleCardMap,
        // 🆕§5.3 `O-414`＝被害側の決定があればそれを採る（無ければ従来の自動 policy）。
        ...(replaceDecision !== undefined ? { decision: replaceDecision } : {}),
      });
      if (picked && picked.repl.kind === 'pay_cost') {
        // §6.4 O-37(a)「代わりに〈コスト〉を支払ってもよい」＝払えるときだけ選ばれている（funnel 側で確認済み）。
        const paid = applyPayCostReplacement(state, picked.index, picked.repl, battleCardMap, picked.payIndex);
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
        // 🆕**§5.3 `O-239`**＝チェックゾーンへ置かれた順を記録する。
        checked_life_order_this_turn: [...(state.checked_life_order_this_turn ?? []), crashed],
        field: { ...state.field, check: crashed },
        crash_source_card_num: crashSourceCardNum,
        // §5.3 O-120: 原因は**発生源と必ず同じ地点で**書く（片方だけだと前のクラッシュの原因が残る）。
        crash_cause: crashCause,
        // 🆕§5.3 `O-160`（2026-09-02）＝**ここはアタックのダメージ経路**なので発生印を立てる。
        //   🔴効果によるライフクラッシュ（`execLifeCrash`）では立てない＝あれはダメージではない。
        //   読み手はクラッシュ解決 funnel 1箇所（読んだら消す）。
        damaged_just: true,
      },
      crashed,
    };
  };

    if (!myS.pending_signi_battle) return;
    // ⚠`loading`（画面の操作ロック）の確認は画面側のラッパが行う。
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
            (eff.action as import('../../../types/effects').StubAction).type === 'STUB' &&
            (eff.action as import('../../../types/effects').StubAction).id === 'REDIRECT_ATTACK_TO_SELF_ZONE',
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
      // O-58: アタッカー自身のバニッシュを置換してトラッシュへ移ったカード。
      // victim の ON_BANISH / ON_LEAVE_FIELD funnel とは分離し、代替カード側のトリガーだけを後段で収集する。
      const attackerSubstituteTrashedAcce: string[] = [];
      const attackerSubstituteTrashedUnder: string[] = [];

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
          if (!gkAction || (gkAction as import('../../../types/effects').GrantKeywordAction).target.count !== 'ALL') continue;
          const gkA = gkAction as import('../../../types/effects').GrantKeywordAction;
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
            (eff.action as import('../../../types/effects').StubAction).type === 'STUB' &&
            (eff.action as import('../../../types/effects').StubAction).id === 'DRIVE_SIGNI_POWER_DOUBLE_CRASH',
          );
          if (hasDriveDoubleCrash) contGrantedKeywords.add('ダブルクラッシュ');
        }
      }
      for (const eff of (effectsMap.get(myTopNum) ?? [])) {
        if (eff.effectType !== 'CONTINUOUS' || !eff.activeCondition) continue;
        if (eff.action.type !== 'GRANT_KEYWORD') continue;
        if (checkActiveCondition(eff.activeCondition, myS, opS, true, battleCardMap, myTopNum, effectivePowers)) {
          contGrantedKeywords.add((eff.action as import('../../../types/effects').GrantKeywordAction).keyword);
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
              ? eff.action as import('../../../types/effects').GrantKeywordAction
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
        (eff.action as import('../../../types/effects').StubAction).id === 'NO_BATTLE_DEFENDER',
      );
      if (hasNoBattleDefender && opTopCardNum) {
        appendBattleLogs([`${battleCardMap.get(opTopCardNum)?.CardName ?? opTopCardNum}はバトルしない（ダメージは受ける）`]);
      }
      // 側面アタック: シグニゾーンへの攻撃。アサシン等の直接アタック化は無視し、シグニがいればバトル・いなければ何もしない。
      const effectivelyEmpty = isSideAttack ? !opTopCardNum : (!opTopCardNum || isAssassin || hasNoBattleDefender);

      // ─── 🆕§5.3 `O-414`：ダメージ置換（「代わりに〜して**もよい**」）を被害側に問う ───
      // 🔑**ライフを1枚も割る前に問う**＝離場置換の `hoistLeaveSubstituteAsks` と同じ設計。
      //   バトル解決の途中で中断すると、再入時に**同じログをもう一度出す**（ここまでログは1本も出していない）。
      // ⚠**ダメージが発生しうるアタックのときだけ問う**＝正面が空／アサシン／バトルしない（ライフへ直接）か、
      //   【ランサー】【Sランサー】でバトル勝利後に割る形。それ以外は問い自体が出ない。
      // ⚠**CPU 防御側は従来どおり自動適用**（funnel の `decision` 未指定 policy）＝対話窓を出せないため。
      const lifeCrashDamagePossible = !cannotDealDamageToOpp && (effectivelyEmpty
        ? (!isSideAttack || sideAttackEmptyZoneDealsDamage(myS, myTopNum, battleCardMap))
        : (isSLancer || isLancer));
      if (lifeCrashDamagePossible && defenderId !== CPU_PLAYER_ID && opS.life_crash_replace_choice === undefined) {
        // 🔴**問い合わせ中の再入はここで止める**（F-3 と同じ）＝止めないと同じ `pending_*` を書き直し続け、
        //   その commit が useEffect の依存（state オブジェクト）を動かして**無限ループ**になる。
        if (opS.pending_life_crash_replace) return;
        const askOptions = lifeCrashReplaceAskOptions(opS, { damageSource: 'signi', cardMap: battleCardMap });
        if (askOptions.length > 0) {
          await persist.commit(reduceBattle(bs, {
            type: 'WRITE_STATE', myKey: opKey,
            myState: { ...opS, pending_life_crash_replace: { options: askOptions } },
          }));
          appendBattleLogs([`ダメージ置換の選択を待っています`]);
          return;
        }
      }
      // 🔴決定は下の `crashOneLife` に**引数で**渡し、基点からはここで落とす＝
      //   バトルに負けた／防止で止まった等で**クラッシュ地点に到達しなかった回**に残骸を残さない。
      const lifeCrashDecision = opS.life_crash_replace_choice;
      newOpState = consumeLifeCrashReplaceDecision(newOpState);

      if (!effectivelyEmpty && opTopCardNum && opTopCard) {
        // ─── 通常バトル（正面シグニあり・アサシンなし）───
        const opCardName = opTopCard.CardName ?? opTopCardNum;
        const myPower = effectivePowers.get(myTopNum)
          ?? parsePowerVal(battleCardMap.get(myTopNum)?.Power);
        const opPower = effectivePowers.get(opTopCardNum)
          ?? parsePowerVal(opTopCard.Power);
        appendBattleLogs([`${myCardName}（${myPower}）vs ${opCardName}（${opPower}）`]);

        // 🔑**勝敗は `battleOutcome`（純関数・golden で固定）だけが決める**（§5.6・2026-09-17）。
        //   ここに `>=` を直書きしない＝規則が React の中に散ると、どの計器も届かないまま壊れる
        //   （`O-47` がそれで3週間気づかれなかった）。
        const outcome = battleOutcome(myPower, opPower);
        if (outcome.banishDefender) {
          // バトル勝利：相手シグニをバニッシュ（チャームがあればトラッシュへ）
          const newOpDown   = [...(opS.field.signi_down   ?? [false, false, false])];
          const newOpFrozen = [...(opS.field.signi_frozen  ?? [false, false, false])];
          const newOpCharms = [...(opS.field.signi_charms  ?? [null, null, null])];
          const newOpAcce   = cloneAcceSlots(opS.field);
          const wasOpFrozen = newOpFrozen[opZoneIndex] ?? false;
          // 🔑§5.6 `C-9`＝防御側に実際に何が起きたか。**下の置換 ladder で本当にバニッシュした1分岐だけが `'banished'` にする**
          //   （既定は `'replaced'`＝置換分岐を足したときに書き忘れても、ランサーが「割らない」側へ倒れる）。
          let defenderResolution: DefenderBattleResolution = 'replaced';

          // ─── F-3 BANISH_SUBSTITUTE: バトルバニッシュの任意身代わり置換 ───
          // victim = opTopCardNum（バトル防御シグニ）。防御側に身代わりがあれば対話（人間）/ヒューリスティック（CPU）で適用。
          // option=sacrifice: 別シグニを代わりにバニッシュ / option=pay_cost: コストを払って victim を残す。
          let f3SacrificeNum: string | null = null;
          let f3PayCost: { sourceNum: string; costType: 'discardSpell' | 'trashStackSpell' | 'lifeCrash'; amount: number } | null = null;
          // 🆕§5.3 `O-58` 段2（2026-09-02）＝victim に付いている札を対価にする任意置換（選択されたときだけ立つ）。
          const f3Attached: { charm: { charmNum: string; zoneIndex: number } | null;
            acce: { acceNum: string; zoneIndex: number } | null } = { charm: null, acce: null };
          // 🆕§5.3 `O-531`＝下からカードN枚をトラッシュして回避（任意版の決定。適用は下の `riseSub` 分岐が1本で行う）。
          //   ⚠`f3Attached` と同じく**オブジェクト**で持つ＝`let x = null` だと閉包内の代入を TS が追えず
          //     後段で `never` に狭まる（実際にコンパイルエラーになった）。
          const f3Under: { pick: { zoneIndex: number; count: number } | null } = { pick: null };
          {
            const f3Decision = opS.banish_substitute_choice;
            const f3DecidedForVictim = !!f3Decision && f3Decision.victimNum === opTopCardNum;
            const applyOption = (o: import('../../../types').BanishSubstituteOptionState) => {
              if (o.kind === 'sacrifice') f3SacrificeNum = o.sacrificeNum;
              else if (o.kind === 'trash_charm') f3Attached.charm = { charmNum: o.charmNum, zoneIndex: o.zoneIndex };
              else if (o.kind === 'exile_acce') f3Attached.acce = { acceNum: o.acceNum, zoneIndex: o.zoneIndex };
              else if (o.kind === 'trash_under') f3Under.pick = { zoneIndex: o.zoneIndex, count: o.count };
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
                  // 🆕§5.3 `O-58` 段2＝**付いている札で払える枝を最優先**（victim も他のシグニも失わない）。
                  //   ⚠アクセ除外は victim がダウンするので、チャームより後ろに置く。
                  // 🆕§5.3 `O-531`＝下のカードN枚で回避できるなら最優先（victim も他のシグニも失わない）。
                  const attached = f3Opts.find(o => o.kind === 'trash_under')
                    ?? f3Opts.find(o => o.kind === 'trash_charm') ?? f3Opts.find(o => o.kind === 'exile_acce');
                  const pay = attached
                    ?? f3Opts.find(o => o.kind === 'pay_cost' && o.costType !== 'lifeCrash')
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
          // ⚠`f3TrashUnder` も「置換が成立した」側に数える＝バニッシュ防止（`banishPreventLoseAbility`）を
          //   二重に消費させないため。**適用そのものは下の `riseSub` 分岐**（強制版と同じ1本）。
          const f3SubstituteApplied = f3SacrificeNum != null || f3PayCost != null
            || f3Attached.charm != null || f3Attached.acce != null || f3Under.pick != null;

          // BATTLE_LEAVE_REPLACE_WITH_DOWN: アップ状態のシグニはバニッシュ代わりにダウン（任意→自動適用）
          const opSigniWasUp = !(opS.field.signi_down?.[opZoneIndex] === true);
          const leaveReplaceDown = opSigniWasUp && (effectsMap.get(opTopCardNum ?? '') ?? []).some(eff =>
            eff.effectType === 'CONTINUOUS' &&
            (eff.action as import('../../../types/effects').StubAction).type === 'STUB' &&
            (eff.action as import('../../../types/effects').StubAction).id === 'BATTLE_LEAVE_REPLACE_WITH_DOWN',
          );
          // BATTLE_LEAVE_REPLACE_DOWN_TRASH_UNDER_ENERGY (WXDi-P06-034): バニッシュ代わりに
          // アップ状態のこのシグニをダウンし、下から1枚＋エナから1枚をトラッシュして場に残る（払えるなら自動適用）。
          const leaveReplaceDownTUE = opSigniWasUp &&
            (opS.field.signi[opZoneIndex]?.length ?? 0) >= 2 &&   // 下にカードが1枚以上
            opS.energy.length >= 1 &&
            (effectsMap.get(opTopCardNum ?? '') ?? []).some(eff =>
              eff.effectType === 'CONTINUOUS' &&
              (eff.action as import('../../../types/effects').StubAction).type === 'STUB' &&
              (eff.action as import('../../../types/effects').StubAction).id === 'BATTLE_LEAVE_REPLACE_DOWN_TRASH_UNDER_ENERGY' &&
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
            // 🆕§5.3 `O-321` 第275＝身代わりバニッシュもエナへ置かれる（`cause:'rule'`＝バトル由来）。
            newOpState = recordEnergyPlacements({
              ...opS,
              energy: [...opS.energy, ...sacStack],
              trash: f3Extra.length > 0 ? [...opS.trash, ...f3Extra] : opS.trash,
              field: { ...opS.field, signi: f3Signi, signi_down: newOpDown, signi_frozen: newOpFrozen, signi_charms: newOpCharms, signi_acce: newOpAcce },
              banish_substitute_choice: undefined, pending_banish_substitute: undefined,
            }, sacStack, 'rule');
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
                (eff.action as import('../../../types/effects').StubAction).type === 'STUB' &&
                (eff.action as import('../../../types/effects').StubAction).id === 'COOKING_BANISH_SUBSTITUTE' &&
                checkActiveCondition(eff.activeCondition, opS, myS, false, battleCardMap, top),
              );
            });
          // 🆕§5.3 `O-58` 段2（2026-09-02）＝CHARM_PROTECTION は**任意**（原文「〜置いてもよい」）なので
          //   `collectBanishSubstitutes` の選択肢へ移した。ここは**選ばれたときだけ**適用する。
          //   🔴旧はこの ladder が無条件で自動適用しており、「チャームを残してバニッシュを受ける」という
          //   原文どおりの選択が player から奪われていた（しかもアタッカー側には1本も無かった）。
          const charmShieldBattle = f3Attached.charm != null;
          if (charmShieldBattle) {
            const charmTrashCS = f3Attached.charm!.charmNum;
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
          } else if (f3Attached.acce != null) {
            // 🆕§5.3 `O-58` 段2＝ACCE_BANISH_SUBSTITUTE も**任意**（原文「〜除外してもよい」）なので選択肢へ移した。
            const exiledAcce = f3Attached.acce.acceNum;
            const remaining = (newOpAcce[opZoneIndex] ?? []).filter(cn => cn !== exiledAcce);
            newOpAcce[opZoneIndex] = remaining.length > 0 ? remaining : null;
            newOpDown[opZoneIndex] = true;
            newOpFrozen[opZoneIndex] = false;
            const newOpSigniABS = [...opS.field.signi] as (string[] | null)[];
            // 🔴**2026-09-02（索引B 第1巡・§5.3 `O-58` 障害③）＝ここは `trash` へ置いていた。**
            //   原文（`WXDi-P09-TK03A`）は「代わりにこれを**ゲームから除外**してもよい」で、
            //   ログだけが「ゲームから除外」と言い、実装は**トラッシュへ置いていた**（＝回収できてしまう）。
            //   ⚠アタッカー側へミラーする前にここを直す（不整合を複製しないため＝登録票の障害③）。
            newOpState = { ...opS, excluded: [...(opS.excluded ?? []), exiledAcce], field: { ...opS.field, signi: newOpSigniABS, signi_down: newOpDown, signi_frozen: newOpFrozen, signi_charms: newOpCharms, signi_acce: newOpAcce } };
            appendBattleLogs([`${opCardName}（アクセ代替バニッシュ）アクセをゲームから除外してダウン`]);
          } else if ((newOpAcce[opZoneIndex] ?? []).some(acceNum => (effectsMap.get(acceNum) ?? []).some(eff =>
            eff.effectType === 'CONTINUOUS' &&
            (eff.action as import('../../../types/effects').StubAction).type === 'STUB' &&
            (eff.action as import('../../../types/effects').StubAction).id === 'ACCE_BANISH_SELF_TRASH'))) {
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
                      (eff.action as import('../../../types/effects').StubAction).type === 'STUB' &&
                      (eff.action as import('../../../types/effects').StubAction).id === 'RESONANCE_LEAVE_SELF_TRASH_SUBSTITUTE' &&
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
            // 🆕§5.3 `O-299` 第262バッチ（2026-09-11）＝**期間＋フィルタつきの行き先変更**（`WX24-P4-002-E1`③）。
            //   🔑**述語は engine と共有する唯一の1本**（`leaveToTrashWindowApplies`）＝効果経路
            //   （`banishDestination` / `collectLeaveSubstituteOptions`）と同じ判定を通す。
            //   ⚠`banish_redirect`（無期限・無フィルタ）とは別物なので**両方を並べる**。
            leaveToTrashWindowApplies(myS, opS, opTopCardNum, battleCardMap) ||
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
              (eff.action as import('../../../types/effects').StubAction).type === 'STUB' &&
              (eff.action as import('../../../types/effects').StubAction).id === 'BANISH_BY_SELF_GOES_TO_TRASH' &&
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
          // 🆕§5.3 `O-531`（2026-09-17）＝**枚数と任意性を原文どおりに**（判定は `collectRiseBanishSubstitutes` 1本）。
          //   🔴旧は「下を**全部**・**強制**・**被バニッシュシグニ自身の宣言だけ**」で、
          //     ルリグが宣言する `WX16-002-E1` は一度も発火しない恒久 no-op だった。
          const riseSubs = collectRiseBanishSubstitutes(opS, battleCardMap, effectsMap, myS, false);
          const mandatoryRiseSub = riseSubs.find(r =>
            !r.optional && r.zoneIndex === opZoneIndex && r.cardNum === opTopCardNum);
          //   任意版は上の身代わり funnel（`f3TrashUnder`）で選ばれたときだけ適用する。
          const riseSubCount = (f3Under.pick && f3Under.pick.zoneIndex === opZoneIndex)
            ? f3Under.pick.count : (mandatoryRiseSub?.count ?? 0);
          const riseSubStack = riseSubCount > 0 ? (opS.field.signi[opZoneIndex] ?? []) : [];
          const riseSubApplied = riseSubCount > 0 && riseSubStack.length - 1 >= riseSubCount;
          if (riseSubApplied) {
            // バニッシュ代替: スタックの下から `riseSubCount` 枚だけトラッシュし、シグニは場に残る。
            // ⚠**残りの下のカードは動かさない**（旧はトップ1枚だけ残して中間のカードを消していた）。
            const bottomCards = riseSubStack.slice(0, riseSubCount);
            const newOpSigniRiseSub = [...newOpSigni] as (string[] | null)[];
            newOpSigniRiseSub[opZoneIndex] = riseSubStack.slice(riseSubCount);
            // 🔴§5.6 `C-9`＝**置換＝シグニは場を離れていない**。上で「バニッシュした」前提で書き換えた4点を元へ戻す
            //   （公式ルール word_094：付いている【チャーム】【アクセ】がトラッシュに置かれるのは**場を離れた場合**）。
            //   旧実装は ①ON_BANISH／場を離れたときのトリガーを発火させ ②チャーム・アクセをトラッシュし
            //   ③ダウン状態をアップへ・凍結を解除していた（どれも「残ったシグニ」に起きてはならない）。
            banishedOpCardNum = null;
            banishedOpUnderCards = [];
            newOpDown[opZoneIndex] = opS.field.signi_down?.[opZoneIndex] ?? false;
            newOpFrozen[opZoneIndex] = wasOpFrozen;
            newOpCharms[opZoneIndex] = opS.field.signi_charms?.[opZoneIndex] ?? null;
            newOpAcce[opZoneIndex] = cloneAcceSlots(opS.field)[opZoneIndex] ?? null;
            newOpState = {
              ...opS,
              trash: [...opS.trash, ...bottomCards],
              field: { ...opS.field, signi: newOpSigniRiseSub, signi_down: newOpDown, signi_frozen: newOpFrozen, signi_charms: newOpCharms, signi_acce: newOpAcce },
            };
            appendBattleLogs([`${opCardName}（ライズ代替）スタック下${bottomCards.length}枚をトラッシュしてバニッシュ回避`]);
          } else {
          defenderResolution = 'banished';
          // 🔴**§5.6 `C-9` `R-45`（2026-09-17）＝レゾナの行き先はルール処理**（`resonaZone.ts` が唯一の権威）。
          //   ルリグデッキ・ルリグトラッシュ・シグニゾーン以外へ行くなら代わりに**ルリグデッキ**へ戻る＝
          //   **他のどの置換（トラッシュ／手札／デッキ下／除外）よりも優先する**。
          //   ⚠旧実装は「代わりにルリグトラッシュ」と印刷された5枚しか見ておらず、
          //     **残り41枚のレゾナはエナゾーンへ行っていた**（＝相手にエナを献上し、二度と出せなくなる）。
          const resonaDest = resonaLeaveDestination(opTopCardNum ?? '', battleCardMap, effectsMap);
          const banishToLrigTrash = resonaDest === 'lrig_trash';
          const banishToLrigDeck = resonaDest === 'lrig_deck';
          // 🆕`R-45b`＝**クラフトは場を離れるとゲームから取り除かれる**（2026-09-17 ユーザー裁定）。
          const banishToExileCraft = resonaDest === 'exile';
          // OPP_SIGNI_ENERGY_TO_DECK_BOTTOM (WX25-CP1-003): エナゾーンに置かれる代わりにデッキの一番下へ
          const energyToDeckBottom = !resonaDest && !redirectBanish && !redirectBanishToHand && !frozenToDeckBottom && !frozenToTrash && !banishBySelftToTrash &&
            (opS.opp_signi_energy_to_deck_bottom === true);
          // BATTLE_LEAVE_REPLACE_WITH_EXILE (WXK05-024): 場を離れる代わりにゲームから除外（本実装はトラッシュで近似）。
          // エナに置かれる代わりにトラッシュへ送る。
          const defenderLeaveExile = (effectsMap.get(opTopCardNum ?? '') ?? []).some(eff =>
            eff.effectType === 'CONTINUOUS' &&
            (eff.action as import('../../../types/effects').StubAction).type === 'STUB' &&
            (eff.action as import('../../../types/effects').StubAction).id === 'BATTLE_LEAVE_REPLACE_WITH_EXILE' &&
            checkActiveCondition(eff.activeCondition, opS, myS, false, battleCardMap, opTopCardNum ?? ''),
          );
          const anyRedirect = redirectBanish || redirectBanishToHand || redirectBanishToExile || frozenToDeckBottom || frozenToTrash || banishBySelftToTrash || banishToLrigTrash || banishToLrigDeck || banishToExileCraft || energyToDeckBottom || defenderLeaveExile;
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
            hand: (redirectBanishToHand && !resonaDest) ? [...opS.hand, ...opTopOnly] : opS.hand,
            deck: ((frozenToDeckBottom || energyToDeckBottom) && !resonaDest) ? [...opS.deck, ...opTopOnly] : opS.deck,
            energy: anyRedirect ? opS.energy : [...opS.energy, ...opTopOnly],
            // 🔴`R-45`＝規則は他の置換に**勝つ**ので、ここだけは `resonaDest` を見て排他にする。
            lrig_deck: banishToLrigDeck ? [...opS.lrig_deck, ...opTopOnly] : opS.lrig_deck,
            excluded: banishToExileCraft ? [...(opS.excluded ?? []), ...opTopOnly] : opS.excluded,
            lrig_trash: banishToLrigTrash ? [...opS.lrig_trash, ...opTopOnly] : opS.lrig_trash,
            trash: [
              ...opS.trash,
              ...((redirectBanish || frozenToTrash || banishBySelftToTrash || defenderLeaveExile) && !resonaDest ? opTopOnly : []),
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
          appendBattleLogs([`${myCardName}が${opCardName}をバニッシュ${banishToLrigDeck ? '（レゾナ→ルリグデッキへ）' : banishToExileCraft ? '（クラフト→ゲームから除外）' : banishToLrigTrash ? '（ルリグトラッシュへ）' : redirectBanish ? '（トラッシュへ）' : redirectBanishToHand ? '（手札へ）' : redirectBanishToExile ? '（ゲームから除外）' : frozenToDeckBottom ? '（凍結→デッキ下）' : frozenToTrash ? '（凍結→トラッシュ）' : energyToDeckBottom ? '（エナ代替→デッキ下）' : defenderLeaveExile ? '（除外＝トラッシュへ）' : ''}`]);
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
          // 🔴§5.6 `C-9`＝**バニッシュが置換されたら割らない**（公式ルール＝`lancerCrushTriggers` に引用）。
          //   旧実装は置換 ladder のどの分岐を通っても割っていた＝シグニが場に残ったのにライフが割れた。
          const lancerApplies = lancerCrushTriggers(
            isSLancer || (isLancer && hasApplicableLancer(lancerKeywords, opPower)), defenderResolution);
          if (lancerApplies && cannotDealDamageToOpp) {
            appendBattleLogs([`${myCardName}は対戦相手にダメージを与えない（${isSLancer ? 'Sランサー' : 'ランサー'}のクラッシュなし）`]);
          } else if (lancerApplies) {
            const label = isSLancer ? 'Sランサー' : 'ランサー';
            const { newState: afterCrash, crashed, prevented, crashOpponentInstead } = crashOneLife(newOpState, { opponent: newMyState, isTurnPlayer: bs.active_user_id !== user.id }, { type: 'signi', level: parseInt(battleCardMap.get(myTopNum)?.Level ?? '', 10) || undefined, power: effectivePowers.get(myTopNum) }, myTopNum, isSLancer ? 'Sランサー' : 'ランサー', lifeCrashDecision);
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
          // 🔴**「敗北」ではない**＝公式ルールは「未満の場合…**両方のシグニが残ります**」＝**何も起こらない**。
          appendBattleLogs([`${myCardName}は${battleOutcomeLabel(myPower, opPower)}`]);
        }

        // 🔴🔑**§5.6（2026-09-17）＝`O-47` を撤回した。バトルでアタッカーはバニッシュされない。**
        //   公式ルール（`battleOutcome.ts` に引用）＝「パワーが**以上**なら相手をバニッシュ／**未満**なら**両方残る**」。
        //   `O-47`（2026-08-24）は「パワーが同じ場合は両方」という**誤ったルール注記**でアタッカーのバニッシュを足し、
        //   実機で**同値の相打ち**が起きていた（ユーザーの報告 `bug_reports` b1039d73＝
        //   `羅菌ナットー(3000) vs 画一の条件オリガミ(3000)` で両方がエナゾーンへ行った）。
        //   ⚠`O-47` が根拠にした実測（`シヴァ(10000) vs ゴッドイーター(15000)` でシヴァが場に残る）は
        //     **正しい挙動**だった＝「格下で殴っても自分は落ちない」。
        //   ⚠**この if は規則上いま常に false**（`banishAttacker` は常に `false`）。下の約200行は
        //     `O-58` の置換機構なので消さずに残してある＝撤去の可否は §5.6 の項目として別に判断する。
        // ⚠**行き先変更はトップ1枚にだけ適用**。下にあったカードは O-48 どおり常にトラッシュへ。
        if (outcome.banishAttacker && (newMyState.field.signi[zoneIndex] ?? []).at(-1) === myTopNum) {
          const myStackAB = newMyState.field.signi[zoneIndex] ?? [];
          // O-58 段1: アタッカー側の必須バニッシュ置換。
          // 判定はバトル前の myS（アタッカー＝victim オーナーのターン）で行い、
          // 「対戦相手のターンの間」限定の防御能力を自分のアタックへ広げない。
          const mandatoryMySubstitute = selectMandatoryAttackerBanishSubstitute({
            state: myS,
            otherState: opS,
            victimNum: myTopNum,
            zoneIndex,
            cardMap: battleCardMap,
            effectsMap,
          });
          // 🆕§5.3 `O-58` 段2（2026-09-02）＝**アタッカー側の任意置換**（victim に付いている札を対価にする）。
          // 🔑防御側と同じ `pending_banish_substitute` / `banish_substitute_choice` の器を**自分の state で**使う。
          //   アタッカーはターンプレイヤー＝この解決を回している本人なので、同じモーダル・同じハンドラで済む。
          // ⚠**必須置換（段1）を先に見る**＝あちらは選択の余地が無いので、任意の問いを出す前に確定させる。
          // ⚠再入で同じ問いを二度出さないよう、決定済みなら pending を立てずに適用する。
          let attackerOptChoice: import('../../../types').BanishSubstituteOptionState | null = null;
          if (!mandatoryMySubstitute) {
            const myDecision = myS.banish_substitute_choice;
            const decidedForMine = !!myDecision && myDecision.victimNum === myTopNum;
            if (decidedForMine) {
              attackerOptChoice = myDecision!.option;
            } else if (myS.pending_banish_substitute) {
              return; // 自分の決定待ち（モーダルの確定で再入して再開する）
            } else {
              // ⚠`isOwnerTurn=true` で評価する＝「対戦相手のターンの間」限定の防御能力を自分のアタックへ広げない
              //   （段1 と同じ規約）。
              const myOpts = collectBanishSubstitutes(myS, opS, true, battleCardMap, effectsMap, myTopNum)
                .filter(o => o.kind === 'trash_charm' || o.kind === 'exile_acce');
              if (myOpts.length > 0) {
                if (attackerId === CPU_PLAYER_ID) {
                  // CPU＝チャーム優先（ダウンしない）。防御側ヒューリスティックと同じ向き。
                  attackerOptChoice = (myOpts.find(o => o.kind === 'trash_charm') ?? myOpts[0]) as never;
                } else {
                  await persist.commit(reduceBattle(bs, {
                    type: 'WRITE_STATE', myKey,
                    myState: { ...newMyState, pending_banish_substitute: { victimNum: myTopNum, options: myOpts as never[] } },
                  }));
                  appendBattleLogs([`${myCardName}のバニッシュに身代わりの選択を待っています`]);
                  return;
                }
              }
            }
          }
          if (attackerOptChoice?.kind === 'trash_charm') {
            const newMyCharmsOpt = [...(newMyState.field.signi_charms ?? [null, null, null])] as (string | null)[];
            newMyCharmsOpt[zoneIndex] = null;
            newMyState = {
              ...newMyState,
              trash: [...newMyState.trash, attackerOptChoice.charmNum],
              field: { ...newMyState.field, signi_charms: newMyCharmsOpt },
              banish_substitute_choice: undefined, pending_banish_substitute: undefined,
            };
            appendBattleLogs([`${myCardName}（チャーム盾）【チャーム】をトラッシュしてバニッシュ回避`]);
          } else if (attackerOptChoice?.kind === 'exile_acce') {
            // 🔴行き先は**ゲーム外**（障害③＝防御側の trash 実装をここへ複製しない）。
            const newMyAcceOpt = cloneAcceSlots(newMyState.field);
            const restOpt = (newMyAcceOpt[zoneIndex] ?? []).filter(cn => cn !== attackerOptChoice!.acceNum);
            newMyAcceOpt[zoneIndex] = restOpt.length > 0 ? restOpt : null;
            const newMyDownOpt = [...(newMyState.field.signi_down ?? [false, false, false])];
            newMyDownOpt[zoneIndex] = true; // 「そうした場合、そのシグニをダウンする」
            newMyState = {
              ...newMyState,
              excluded: [...(newMyState.excluded ?? []), attackerOptChoice.acceNum],
              field: { ...newMyState.field, signi_acce: newMyAcceOpt, signi_down: newMyDownOpt },
              banish_substitute_choice: undefined, pending_banish_substitute: undefined,
            };
            appendBattleLogs([`${myCardName}（アクセ代替バニッシュ）${battleCardMap.get(attackerOptChoice.acceNum)?.CardName ?? attackerOptChoice.acceNum}をゲームから除外してダウン`]);
          } else if (mandatoryMySubstitute?.kind === 'prevent_lose_ability') {
            // WX13-031 / WX15-010: victim は場に残し、同じ abilities_removed で同ターンの再適用を止める。
            newMyState = {
              ...newMyState,
              abilities_removed: [...new Set([
                ...(newMyState.abilities_removed ?? []), mandatoryMySubstitute.sourceNum,
              ])],
            };
            appendBattleLogs([`${myCardName}（バニッシュ置換）バニッシュされず、${battleCardMap.get(mandatoryMySubstitute.sourceNum)?.CardName ?? mandatoryMySubstitute.sourceNum}はターン終了時までこの能力を失う`]);
          } else if (mandatoryMySubstitute?.kind === 'trash_acce') {
            // WXK04-031: アタッカーにアクセされているメレドールだけをトラッシュへ。
            const newMyAcceSub = cloneAcceSlots(newMyState.field);
            const slot = newMyAcceSub[zoneIndex] ?? [];
            const removeIndex = slot.indexOf(mandatoryMySubstitute.cardNum);
            const remaining = removeIndex >= 0
              ? [...slot.slice(0, removeIndex), ...slot.slice(removeIndex + 1)]
              : slot;
            newMyAcceSub[zoneIndex] = remaining.length > 0 ? remaining : null;
            attackerSubstituteTrashedAcce.push(mandatoryMySubstitute.cardNum);
            newMyState = {
              ...newMyState,
              trash: [...newMyState.trash, mandatoryMySubstitute.cardNum],
              field: { ...newMyState.field, signi_acce: newMyAcceSub },
            };
            appendBattleLogs([`${myCardName}（アクセ代替バニッシュ）${battleCardMap.get(mandatoryMySubstitute.cardNum)?.CardName ?? mandatoryMySubstitute.cardNum}をトラッシュしてバニッシュ回避`]);
          } else if (mandatoryMySubstitute?.kind === 'trash_rise_under') {
            // 🆕§5.3 `O-531`＝**原文の枚数ぶん**を下からトラッシュへ（トップは場に残る）。旧は1枚固定だった。
            const trashedUnder = mandatoryMySubstitute.cardNums;
            const trashedSet = new Set(trashedUnder);
            const newMySigniRiseSub = [...newMyState.field.signi] as (string[] | null)[];
            newMySigniRiseSub[zoneIndex] = myStackAB.filter((n, i) =>
              i === myStackAB.length - 1 || !trashedSet.has(n));
            attackerSubstituteTrashedUnder.push(...trashedUnder);
            newMyState = {
              ...newMyState,
              trash: [...newMyState.trash, ...trashedUnder],
              field: { ...newMyState.field, signi: newMySigniRiseSub },
            };
            appendBattleLogs([`${myCardName}（ライズ代替）下のカード${trashedUnder.length}枚をトラッシュしてバニッシュ回避`]);
          } else {
          // 🆕§5.3 `O-58` 段2＝「身代わりしない」を選んだ回も決定フラグを消す（再入で問い直さない）。
          if (newMyState.banish_substitute_choice || newMyState.pending_banish_substitute) {
            newMyState = { ...newMyState, banish_substitute_choice: undefined, pending_banish_substitute: undefined };
          }
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
            // 🆕§5.3 `O-299` 第262バッチ＝上の `redirectBanish` の myS↔opS ミラー（O-49 の規約どおり対で書く）。
            leaveToTrashWindowApplies(opS, myS, myTopNum, battleCardMap) ||
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
              (eff.action as import('../../../types/effects').StubAction).type === 'STUB' &&
              (eff.action as import('../../../types/effects').StubAction).id === 'BANISH_BY_SELF_GOES_TO_TRASH' &&
              checkActiveCondition(eff.activeCondition, opS, myS, false, battleCardMap, opTopCardNum ?? '', effectivePowers),
            );
          // 凍結シグニは通常アタックできないため実戦ではほぼ立たないが、行き先規約を対称に保つ。
          const opFrozenOvr = wasMyFrozen
            ? collectFrozenBanishOverrides(opS, myS, false, battleCardMap, effectsMap, opTopCardNum, effectivePowers)
            : { frozenBanishToDeckBottom: false, frozenLeaveToTrash: false };
          const frozenMyToDeckBottom = opFrozenOvr.frozenBanishToDeckBottom;
          const frozenMyToTrash = !frozenMyToDeckBottom && opFrozenOvr.frozenLeaveToTrash;
          // 🔴**§5.6 `C-9` `R-45`＝アタック側も同じ規則**（防御側と写経にならないよう `resonaZone.ts` の1本を共有）。
          const resonaMyDest = resonaLeaveDestination(myTopNum, battleCardMap, effectsMap);
          const banishMyToLrigTrash = resonaMyDest === 'lrig_trash';
          const banishMyToLrigDeck = resonaMyDest === 'lrig_deck';
          const banishMyToExileCraft = resonaMyDest === 'exile';   // `R-45b`
          const attackerLeaveExile = (effectsMap.get(myTopNum) ?? []).some(eff =>
            eff.effectType === 'CONTINUOUS' &&
            (eff.action as import('../../../types/effects').StubAction).type === 'STUB' &&
            (eff.action as import('../../../types/effects').StubAction).id === 'BATTLE_LEAVE_REPLACE_WITH_EXILE' &&
            checkActiveCondition(eff.activeCondition, myS, opS, true, battleCardMap, myTopNum),
          );
          const anyMyRedirect = redirectMyBanish || redirectMyBanishToHand || redirectMyBanishToExile ||
            frozenMyToDeckBottom || frozenMyToTrash || banishMyByOpponentToTrash || banishMyToLrigTrash || banishMyToLrigDeck || banishMyToExileCraft || attackerLeaveExile;
          banishedMyWentToTrash = !resonaMyDest
            && (redirectMyBanish || frozenMyToTrash || banishMyByOpponentToTrash || attackerLeaveExile);
          newMyState = {
            ...newMyState,
            hand: (redirectMyBanishToHand && !resonaMyDest) ? [...newMyState.hand, myTopNum] : newMyState.hand,
            deck: (frozenMyToDeckBottom && !resonaMyDest) ? [...newMyState.deck, myTopNum] : newMyState.deck,
            energy: anyMyRedirect ? newMyState.energy : [...newMyState.energy, myTopNum],
            lrig_deck: banishMyToLrigDeck ? [...newMyState.lrig_deck, myTopNum] : newMyState.lrig_deck,
            excluded: banishMyToExileCraft ? [...(newMyState.excluded ?? []), myTopNum] : newMyState.excluded,
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
          // ⚠**「相打ち」はルールに無い**（`O-47` の撤回で到達しなくなった）＝文言も残さない。
          appendBattleLogs([`${myCardName}がバニッシュされた${banishMyToLrigDeck ? '（レゾナ→ルリグデッキへ）' : banishMyToExileCraft ? '（クラフト→ゲームから除外）' : banishMyToLrigTrash ? '（ルリグトラッシュへ）' : redirectMyBanish ? '（トラッシュへ）' : redirectMyBanishToHand ? '（手札へ）' : redirectMyBanishToExile ? '（ゲームから除外）' : frozenMyToDeckBottom ? '（凍結→デッキ下）' : frozenMyToTrash ? '（凍結→トラッシュ）' : attackerLeaveExile ? '（除外＝トラッシュへ）' : ''}`]);
          }
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

        // 🆕§5.3 `O-390`（2026-09-16）＝**クラッシュの原因キーワードを刻む**。
        //   原文「【ダブルクラッシュ】**によって**対戦相手のライフクロスが２枚以上クラッシュされたとき」
        //   （`WX16-Re07-E1`）の発生原因の限定に使う（読み手は `crashCauseMatches`）。
        //   🔴旧実装はここで `null`（原因不明）を積んでいたので、`crashedByKeywords` を足しても
        //     fail-closed で**永久に発火しない**＝限定を入れるには先にここを刻む必要があった。
        //   ⚠**トリプルクラッシュは別の原因**＝原文が【ダブルクラッシュ】と書く札はそちらでは発火しない。
        //   ⚠**1枚目と２枚目の両方に同じ原因を入れる**（片方だけだと同時クラッシュの添字がずれる）。
        const crushCauseSA = isTripleCrush ? 'トリプルクラッシュ' : isDoubleCrush ? 'ダブルクラッシュ' : undefined;
        // 1枚目クラッシュ
        const { newState: afterFirst, crashed: firstCrashed, prevented: firstPrevented, crashOpponentInstead: firstCrashOpp } = crashOneLife(newOpState, { opponent: newMyState, isTurnPlayer: bs.active_user_id !== user.id }, { type: 'signi', level: parseInt(battleCardMap.get(myTopNum)?.Level ?? '', 10) || undefined, power: effectivePowers.get(myTopNum) }, myTopNum, crushCauseSA, lifeCrashDecision);
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

        // 🆕🔴§5.1 `V-232`（2026-09-16）＝**【トリプルクラッシュ】は3枚目も取る**。
        //   🔴旧実装は `crashCount` を見て分岐しておきながら**追加を1枚に焼き込んで**おり、
        //     シグニの【トリプルクラッシュ】が**常に2枚しか割らなかった**（実測 live 4効果＝
        //     `WDK01-007-E1` / `WX15-032-E1` / `WX18-006-E1` / `WXEX1-33-E2b`）。
        //   ⚠**ルリグアタック側は元から正しかった**（`Math.min(opLrigHasTripleCrush ? 2 : 1, …)`）＝
        //     **同じ規則を2箇所に書いた**典型（§4.4 冒頭の「片方だけ機能を足す」）。
        //   ⚠ライフが足りなければあるだけ（枚数は実減少数で数える）。
        const extraCrashCount = Math.min(crashCount - 1, newOpState.life_cloth.length);
        if (extraCrashCount > 0) {
          // 公式ルール「同時クラッシュ」: 2枚目以降もライフから先に取り出す
          const extraCards = newOpState.life_cloth.slice(-extraCrashCount);
          newOpState = {
            ...newOpState,
            life_cloth: newOpState.life_cloth.slice(0, -extraCrashCount),
            pending_crashed_cards: [...(newOpState.pending_crashed_cards ?? []), ...extraCards],
            pending_crash_source_card_nums: [...(newOpState.pending_crash_source_card_nums ?? []),
              ...extraCards.map(() => myTopNum)],
            // §5.3 O-120: 原因列も**同じ長さで**伸ばす（伸ばさないと添字がずれて別のクラッシュの原因を読む）。
            // 🆕§5.3 `O-390`（2026-09-16）＝この2枚目以降は**【ダブル／トリプルクラッシュ】由来**なので原因を刻む。
            //   🔴旧実装は `null`（原因不明）だった＝`crashedByKeywords` は fail-closed なので
            //     ここを刻まないと発生原因の限定を書いた瞬間に**恒久 no-op** になる。
            pending_crash_causes: [...(newOpState.pending_crash_causes ?? []),
              ...extraCards.map(() => crushCauseSA ?? null)],
          };
          appendBattleLogs([`${crushCauseSA ?? 'ダブルクラッシュ'}：追加${extraCards.length}枚（${extraCards.map(n => battleCardMap.get(n)?.CardName ?? n).join('、')}）を同時クラッシュ予約`]);
        }
      }

      // MULTI_ZONE_ATTACK: 正面以外のゾーンにも追加バトル
      // 「アタックする」（強制）か「アタックできる」（任意）かをテキストで判定
      const mzaEffect = (effectsMap.get(myTopNum) ?? []).find(e =>
        e.effectType === 'CONTINUOUS' && e.action.type === 'STUB' && (e.action as import('../../../types/effects').StubAction).id === 'MULTI_ZONE_ATTACK'
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
              // 🆕§5.3 `O-321` 第275＝バトルバニッシュ（追加ゾーン）＝`cause:'rule'`。
              newOpState = recordEnergyPlacements({
                ...newOpState,
                energy: [...newOpState.energy, ...oppStackMZA],
                field: { ...newOpState.field, signi: oppSigniMZA, signi_down: oppDownMZA },
              }, oppStackMZA, 'rule');
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
        (e.action as import('../../../types/effects').StubAction).id === 'ADJACENT_ZONE_ATTACK' &&
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
          // 🆕§5.3 `O-321` 第275＝バトルバニッシュ（隣ゾーン追加バトル）＝`cause:'rule'`。
          newOpState = recordEnergyPlacements({
            ...newOpState,
            energy: [...newOpState.energy, ...oppStackAZA],
            field: { ...newOpState.field, signi: oppSigniAZA, signi_down: oppDownAZA },
          }, oppStackAZA, 'rule');
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
            // 🔴防御側のバトル前状態（アクセ付与 ON_BANISH 復元・離場ゾーン添字 `sourceLeftZoneIdx`）。
            //   2026-09-18 まで**画面の持ち主から見た相手 `op`** を渡していた＝**CPU がアタックすると防御側は人間なのに
            //   CPU の盤面から探して見つからず**、「このシグニの正面にあった」（`WX07-039-E1`）が「対象を取れない」で不発していた
            //   （実機 `V-181` を撤回済みの相打ち前提から防御側経路へ組み直して判明）。この関数は人間・CPU 共用＝`opS` を使う。
            opS,
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
        const bbWatchers: { num: string; effs: import('../../../types/effects').CardEffect[] }[] = [];
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
      // O-58: victim のバニッシュを回避した場合は victim funnel へ入れず、代わりにトラッシュへ
      // 移ったアクセ／下のカード側だけを、それぞれの正しい origin で収集する。
      for (const trashedAcce of attackerSubstituteTrashedAcce) {
        const ttAcce = collectTrashTriggers(trashedAcce, attackerId, newHostState, newGuestState, false, true, true);
        trashEntriesSA.push(...ttAcce.entries);
        const usedMineAcce = attackerIsHost ? ttAcce.usedHostIds : ttAcce.usedGuestIds;
        const usedOppAcce = attackerIsHost ? ttAcce.usedGuestIds : ttAcce.usedHostIds;
        if (usedMineAcce.length > 0) newMyState.actions_done = [...(newMyState.actions_done ?? []), ...usedMineAcce];
        if (usedOppAcce.length > 0) newOpState = { ...newOpState, actions_done: [...(newOpState.actions_done ?? []), ...usedOppAcce] };
      }
      if (attackerSubstituteTrashedAcce.length > 0) {
        const mineAcceTriggers = collectAcceToTrashTriggers(
          attackerId, newMyState, newOpState, attackerSubstituteTrashedAcce.length, 0,
        );
        const oppAcceTriggers = collectAcceToTrashTriggers(
          defenderId, newOpState, newMyState, 0, attackerSubstituteTrashedAcce.length,
        );
        trashEntriesSA.push(...mineAcceTriggers.entries, ...oppAcceTriggers.entries);
        if (mineAcceTriggers.usedOncePerTurnIds.length > 0) {
          newMyState.actions_done = [...(newMyState.actions_done ?? []), ...mineAcceTriggers.usedOncePerTurnIds];
        }
        if (oppAcceTriggers.usedOncePerTurnIds.length > 0) {
          newOpState = { ...newOpState, actions_done: [...(newOpState.actions_done ?? []), ...oppAcceTriggers.usedOncePerTurnIds] };
        }
      }
      for (const trashedUnder of attackerSubstituteTrashedUnder) {
        trashEntriesSA.push(...collectAnyZoneTrashSelfTriggers(
          trashedUnder, attackerId, false, 'under_signi', undefined, true, newMyState, newOpState,
        ));
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
        const condHasBattle = (c: import('../../../types/effects').Condition | undefined, t: string): boolean =>
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
        // 🆕行き先つきの射影（§5.4 (b)・第189バッチ）。⚠**上の無印版と必ず同じ位置で書く**。
        //   🔑バトルによるバニッシュはこの経路を通る＝`WX18-056-E1` の本命はここ。
        const leftMineTr = detectLeftFieldSigniToTrash(myS, finalMyState);
        const leftOppTr  = detectLeftFieldSigniToTrash(opS, finalOpState);
        if (leftMineTr.length > 0) finalMyState = { ...finalMyState, signi_left_field_to_trash_this_attack_phase: [...(finalMyState.signi_left_field_to_trash_this_attack_phase ?? []), ...leftMineTr] };
        if (leftOppTr.length > 0)  finalOpState = { ...finalOpState, signi_left_field_to_trash_this_attack_phase: [...(finalOpState.signi_left_field_to_trash_this_attack_phase ?? []), ...leftOppTr] };
      }

      // ON_ATTACK_END（§6.3 J-4・WXK11-018-E2）＝**このアタックの終了時**。バトル・バニッシュ・ライフクラッシュを
      // 解決し終えたここが終了点で、`dealtSigniDamage` が確定しているので「ダメージが与えられていない場合」を判定できる。
      // ⚠アタッカーが場を離れている場合は collector 側の effectsMap 走査に載らない＝自然に発火しない。
      const attackEndEntries: StackEntry[] = [];
      {
        // 🆕§5.3 `O-181` 軸(b)＝「アタックによってライフクロスを1枚以上クラッシュしたとき」の判定材料。
        //   ⚠**この差分は「このアタックで実際に減った枚数」**（上の `crashTotalEntries` と同じ数え方）。
        const crashedLifeThisAttack = opS.life_cloth.length > finalOpState.life_cloth.length;
        const ae = pureCollectAttackEndTriggers(
          mkTrigCtx(), attackerId, myTopNum, finalMyState, finalOpState, dealtSigniDamage,
          { attackerKind: 'signi', crashedLife: crashedLifeThisAttack },
        );
        attackEndEntries.push(...ae.entries);
        if (ae.usedOncePerTurnIds.length > 0) {
          finalMyState = { ...finalMyState, actions_done: [...(finalMyState.actions_done ?? []), ...ae.usedOncePerTurnIds] };
        }
        // 🆕§5.3 `O-181`＝「そのアタック終了時に」の遅延トリガー（`WX14-018-E4`）。
        //   🔴宣言時に発火させると**そのアタック自体が起きない**ので、必ずここで拾う。
        //   ⚠**両側を見る**＝設置者は防御側（`attackerOwner:'opponent'`）にも攻撃側にもなりうる。
        attackEndEntries.push(...pureCollectAttackEndDelayedTriggers(
          mkTrigCtx(), defenderId, finalOpState, myTopNum, false));
        attackEndEntries.push(...pureCollectAttackEndDelayedTriggers(
          mkTrigCtx(), attackerId, finalMyState, myTopNum, true));
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
}

/**
 * パワー0以下でルールによりバニッシュされる場のシグニ（両プレイヤー分）。
 * 🆕§5.7 `S-5c` 第3段（2026-09-18）＝画面の `collectPowerZeroBanishCandidates` を純関数にした（画面の CPU 側もこれを呼ぶ）。
 */
export function powerZeroBanishCandidates(
  bs: BattleStateRow,
  hostState: PlayerState,
  guestState: PlayerState,
  effectsMap: Map<string, CardEffect[]>,
  battleCardMap: Map<string, CardData>,
): string[] {
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
}
