import type {BattleStateRow, PlayerState, StackEntry, EffectStack, TurnPhase} from '../../../types';
import type {CardEffect} from '../../../types/effects';
import {applyLrigDrawPhaseReplacement, calcContinuousBlockedActions, collectHandLimits, collectDrawLimits, drawPhaseLimitFromBlocked} from '../../../engine/effectEngine';
import {getCardNum} from '../../../engine/effectExecutor';
import {resolvePendingExiles} from '../../../engine/execUtils';
import {initStack, pushToStack} from '../../../engine/effectStack';
import {collectDrawTriggers as pureCollectDrawTriggers, collectTurnTriggers as pureCollectTurnTriggers} from '../../../engine/triggerCollect';
import {resolveTurnEndPreventionMill} from '../damagePrevention';
import {resolveTurnEndLrigDeckReturn} from '../turnEndLrigDeckReturn';
import {resolveTurnEndHandReturn} from '../turnEndHandReturn';
import {resolveTurnEndEnergyTrash} from '../turnEndEnergyTrash';
import {applyUpPhaseToField, upPhaseRecipient} from '../upPhase';
import {generateUUID, drawCards} from '../battleUtils';
import {recordEnergyPlacements} from '../../../engine/energyPlacement';
import {clearEndOfTurnDelayedTriggers} from '../delayedTrigger';
import {resolveTurnEndFacedownReturns, resolveSecondMainFacedownReturns} from '../../../engine/facedownSigni';
import {PHASE_LABEL, PHASE_NEXT, NON_TURN_PLAYER_PHASES} from '../uiConstants';
import {resolveNextPhaseWithSkips, resolveNextPhaseAfterAttack, resolveNextPhaseAfterMain} from '../attackStepPhase';
import {resolveTurnHandover} from '../turnHandover';
import {clearAllZoneBurstGrantUntilOppTurn} from '../allZoneBurst';
import {reduceBattle, type PlayerStateKey} from './battleController';
import {clearEndOfAttackPhaseDelayedTriggers} from '../attackDuration';
import {clearTurnGrantedLrigAbilities} from '../grantedAuto';
import {activateNextTurnDeployCountLimit} from '../deployCountLimit';
import {activateNextTurnSigniZoneBlocks} from '../signiZoneBlock';
import {clearUntilOppTurnEffects} from '../untilOppTurn';
import {clearAttackFieldTrashCosts} from '../attackFieldTrashCost';
import {activateTurnStartScopedState, clearAttackPhaseScopedState, clearMainPhaseScopedState, clearTurnEndScopedState} from '../turnScopedState';
import type { PerformCtx } from './performCtx';
import { makeTrigCtxForPhase } from './execCtxDeps';

/** 画面だけが持つ UI（手札上限を超えたときの捨て札モーダル）。 */
export interface PhaseAdvanceUi {
  openEndDiscard: (count: number) => void;
}

// 🆕§5.7 `S-5c` 第3段（2026-09-18）＝人間のフェイズ進行（`doPhaseAdvance`・683行）を `BattleScreen` から**逐語で移設**。
export async function doPhaseAdvance(upkeepPay: 'energy' | 'discard' | undefined, c: PerformCtx, ui: PhaseAdvanceUi): Promise<void> {
  // ── 注入された材料を**画面と同じ名前**で取り出す（下の本体は画面から逐語で移設＝名前を変えない）──
  const { bs, cardMap: battleCardMap, effectsMap, effectivePowers, isHost } = c;
  const user = { id: c.userId };
  const persist = { commit: c.io.commit };
  const appendBattleLogs = c.io.appendLogs;
  const setLoading = c.io.setLoading;
  const mkTrigCtx = c.trigCtx;
  const mkTrigCtxForPhase = makeTrigCtxForPhase({ bs, effectsMap, cardMap: battleCardMap, trigCtx: c.trigCtx });
  const openEndDiscard = ui.openEndDiscard;
  // 画面の派生値（`const my/op`・`drawCount`・`useMemo` の `contBlocked`／`myEffectiveHandLimit`）を同じ式で作る。
  const my = isHost ? bs.host_state : bs.guest_state;
  const op = isHost ? bs.guest_state : bs.host_state;
  const drawCount = bs.turn_count === 1 && bs.active_user_id === bs.first_player_id ? 1 : 2;
  const contBlocked = calcContinuousBlockedActions(my, op, bs.active_user_id === user.id, effectsMap, battleCardMap, effectivePowers);
  const myEffectiveHandLimit = collectHandLimits(my, op, battleCardMap, effectsMap);

  // ── 画面にあった薄いラッパ（逐語）──
  const collectTurnTriggers = (
    timing: 'ON_TURN_START' | 'ON_TURN_END' | 'ON_ATTACK_PHASE_START' | 'ON_ATTACK_PHASE_END' | 'ON_GROW_PHASE_START' | 'ON_MAIN_PHASE_START' | 'ON_LRIG_ATTACK_STEP_START',
    myState: PlayerState,
    opState: PlayerState,
    /** 🆕**遷移「先」**のフェイズ（§5.3 `O-72`）。開始時トリガーはここを渡さないと
     *  `DURING_*` 限定の【常】が配る【自】を1件も拾えない（遷移前の phase で組んだ map を見るため）。 */
    enteringPhase?: TurnPhase,
  ): { entries: StackEntry[]; usedMyIds: string[]; usedOpIds: string[] } => {
    const ctxTT = enteringPhase ? mkTrigCtxForPhase(enteringPhase, myState, opState, true) : mkTrigCtx();
    const r = pureCollectTurnTriggers(ctxTT, timing, myState, opState);
    return { entries: r.entries, usedMyIds: isHost ? r.usedHostIds : r.usedGuestIds, usedOpIds: isHost ? r.usedGuestIds : r.usedHostIds };
  };
  const collectDrawTriggers = (
    drawerId: string,
    drawerState: PlayerState,
    otherState: PlayerState,
    isDrawPhaseDraw = false,
  ): { entries: StackEntry[]; usedOncePerTurnIds: string[] } =>
    pureCollectDrawTriggers(mkTrigCtx(), drawerId, drawerState, otherState, isDrawPhaseDraw);

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
          (e.action as import('../../../types/effects').StubAction).type === 'STUB' &&
          (e.action as import('../../../types/effects').StubAction).id === 'PREVENT_LIFE_REFRESH_TRASH',
        );
      });
      // ターン開始時スコープを一括切替（リフレッシュ回数・出自履歴・次ターン無料グロウ予約）。
      const turnStartState = activateTurnStartScopedState(my);
      newMyState = drawBlocked
        ? { ...turnStartState, actions_done: [], draw_limit: undefined }
        // ドローフェイズの通常ドローは「効果ドロー」ではないため last_effect_draw_source をクリアし、
        // 直後の collectDrawTriggers で drawBySourceStory トリガー（WX20-026-E3）が前ターンの残値で誤発火しないようにする。
        : { ...drawCards(turnStartState, effectiveDrawCount, preventRefreshTrash), actions_done: ['DRAW'], draw_limit: undefined, last_effect_draw_source: undefined };
      // 🆕ドローフェイズのリフレッシュもログに出す（2026-09-18 バグ報告＝効果解決経路の `applyRefreshOnDone` だけが書いていた）。
      if ((newMyState.refresh_count_this_turn ?? 0) > (turnStartState.refresh_count_this_turn ?? 0)) appendBattleLogs(['リフレッシュ（デッキを再構築）']);
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
      // `R-23` 先攻1ターン目はアタックフェイズをスキップ（判定は CPU と同じ `resolveNextPhaseAfterMain`）。
      nextPhase = resolveNextPhaseAfterMain(bs.turn_count, my);
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
        // temp_power_mods / temp_level_mods / keyword_grants / granted_effects は clearTurnEndScopedState が両プレイヤー分を失効させる。
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
        // LIFE_BURST_DOUBLE の2キーは clearTurnEndScopedState で両プレイヤー・全終了経路を一括失効する。
        lrig_granted_auto_effects: clearTurnGrantedLrigAbilities(my).lrig_granted_auto_effects, // ターン終了時まで付与されたルリグ能力をクリア（「このゲームの間」付与は残す）
        banish_redirect: undefined,           // バニッシュ先変更フラグをクリア
        banish_redirect_target_nums: undefined, // 選択対象限定のバニッシュ先変更をクリア
        banish_redirect_battle_target_nums: undefined, // 選択対象＋バトル限定のバニッシュ先変更をクリア
        banish_redirect_power0_target_nums: undefined, // 選択対象＋パワー0限定のバニッシュ先変更をクリア
        banish_redirect_by_source_nums: undefined, // 限定付きバニッシュ先変更（このシグニとのバトル）をクリア
        next_assist_grow_mods: undefined,     // 次のアシストグロウ修整（§5.3 `O-180`）をクリア
        banish_redirect_by_source_effect_nums: undefined, // 同・効果経路（§5.3 `O-210`）をクリア
        banish_redirect_once_source_nums: undefined,      // 同・「次に1回だけ」の印をクリア
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
        crash_to_trash_next_crash_only: undefined, // 同・「次の1枚だけ」の印（§5.3 `O-522`）をリセット
        life_crash_counters: undefined,           // カウンタークラッシュ（このターン）をリセット
        negate_opp_attacks: undefined,              // N回目アタック共有カウンタをリセット
        all_cont_effects_negated: undefined,       // CONTINUOUS効果無効化フラグをリセット
        // lrig_abilities_disabled のリセットは clearTurnEndScopedState のレジストリへ集約（§6.4 O-10 続き509）。
        turn_hand_discarded_count: undefined,      // このターンの手札捨て枚数をリセット
        turn_signi_returned_to_hand: undefined,    // このターンのシグニ手札戻りフラグをリセット（G087）
        turn_arts_used: undefined, turn_arts_used_names: undefined, turn_arts_used_colors: undefined, turn_pieces_used_names: undefined, // アーツ使用履歴をリセット
        banish_to_trash_by_self: undefined,        // バニッシュ→トラッシュ誘導フラグをリセット
        coin_condition_signi_instances: undefined,  // コイン消費条件シグニをリセット
        deck_signi_level_override: undefined,       // デッキシグニレベルオーバーライドをリセット
        reduce_next_on_play_cost: undefined,        // 【出】コスト軽減フラグをリセット
        optional_discard_guard_enabled: undefined,  // 任意捨てガードフラグをリセット
        turn_end_field_trash_targets: undefined,    // ターン終了時トラッシュ対象をリセット
        next_spell_uncounterable: undefined,        // WX04-008: 次スペル打ち消し不可フラグをリセット
        next_spell_cost_reduction: undefined,       // WX04-008: 次スペルコスト軽減をリセット
        // 🆕§5.3 `O-259` 第8バッチ＝「次のスペルのエナコスト1つを《無》として払える」の予約。
        next_spell_wild_cost_slot: undefined,
        next_arts_cost_reduction: undefined,        // タスク12(xciii): 【チェイン】の次アーツコスト軽減をリセット
        // 🆕§5.3 `O-259` 第7バッチ＝「次に使用するルリグの【起】能力の使用コストは《無》減る」の予約。
        next_lrig_act_cost_reduction: undefined,
        // 🆕§5.3 `O-259` 第2バッチ＝「このターン、そのピースの使用コストは《無×1》減る」の予約。
        //   🔴常設の `SPECIFIC_CARD_COST_REDUCE`（場のカードを走査）とは別枠なので、ここで消さないと永続化する。
        turn_specific_cost_reductions: undefined,
        turn_trigger_3rd_plant_down: undefined,     // 植物3回目ダウントリガーをリセット
        turn_plant_down_count: undefined,           // 植物ダウン回数をリセット
        // WX25-CP1-003「次の対戦相手のターン終了時まで」: フラグ保持者(=相手の効果を受けた側)が
        // 自分のターンを終了するタイミングがちょうど期限にあたる
        opp_signi_energy_to_deck_bottom: undefined,
        is_betting_this_effect: undefined,          // BET_CONDITION: ターン終了時にクリア
        is_boosting_this_effect: undefined,         // BOOST: ターン終了時の安全クリア
        last_discarded_signi_power: undefined,      // DISCARD_BY_POWER_MATCH: ターン終了時にクリア
        last_discarded_signi_level: undefined,      // levelLteDiscardSigni: ターン終了時にクリア
        // 🆕§5.3 `O-328`＝クラス側も**レベルと同じ寿命**にする。旧実装はこのキーだけ
        //   どのターン境界でも消えず、前のターンの支払いで書いたクラスが残って
        //   `classMatchesDiscardSigni` を**別のクラスで**絞り込みうる状態だった。
        last_discarded_signi_class: undefined,
        cancel_current_signi_attack: undefined,     // NEGATE_ATTACK_ON_TRIGGER: ターン終了時にクリア
        cancel_current_lrig_attack: undefined,      // 同上（ルリグアタック版・`WXDi-P09-036-E1`）
      })));
      // 次のターンプレイヤー（相手）のカードをアップフェイズ開始時点でアップ処理する。
      // 凍結中はアップせず凍結を解除。それ以外のダウンカードはアップ。
      const opKey = isHost ? 'guest_state' : 'host_state';
      // 遅延自己除外は非ターンプレイヤー側にも適用（WX16-040/WD22-035-G 等は相手ターン中に蘇生
      // →そのターン終了時に除外、が主用途。ターンプレイヤー側だけだと1ターン生き延びる）。
      const opState = resolvePendingExiles(opEndState, true);
      // §6.4 O-3: 「ターンプレイヤーを交代するか」は `resolveTurnHandover` 1点で決める
      // （追加ターン＝`extra_turn` と 次ターンスキップ＝`skip_next_turn` の両方をここで見る）。
      const handover = resolveTurnHandover(my, opState);
      // 🔴§5.6 `C-9`＝**アップを受けるのは次にターンを行うプレイヤー**（`upPhase.ts` に公式ルールを引用）。
      //   旧実装は交代しない場合（追加ターン／相手のスキップ）も**相手をアップ**していた。
      const upOpponent = upPhaseRecipient(handover.keepTurn) === 'opponent';
      // UPKEEP_OR_NO_UP: 条件あり→次ターンのUPフェーズで条件未達としてルリグをアップしない
      if (upOpponent && opState.lrig_upkeep_condition) appendBattleLogs([`相手のセンタールリグはアップ条件あり（${opState.lrig_upkeep_condition}）`]);
      const opNextTurnState = handover.consumeOpponent(clearEndOfTurnDelayedTriggers(activateNextTurnSigniZoneBlocks(activateNextTurnDeployCountLimit(clearTurnEndScopedState({
        ...clearUntilOppTurnEffects(clearAllZoneBurstGrantUntilOppTurn(opState)),
        signi_played_from_trash: undefined, signi_played_from_deck: undefined, signi_placed_by_source: undefined, // 出自マーカー本体はUP開始時の funnel でクリア
        life_crash_counters: undefined, // カウンタークラッシュ（防御側がセット）をターン終了時にクリア
        turn_arts_used: undefined, turn_arts_used_names: undefined, turn_arts_used_colors: undefined, turn_pieces_used_names: undefined, // アーツ使用履歴をリセット
        signi_deploy_count_limit: undefined,       // 配置数制限（このターン・相手にかけられた分）を自分のターン開始時にリセット
        banish_redirect_power0_target_nums: undefined, // 非ターンプレイヤーがこのターン中に設定した単体power0置換もクリア
        banish_redirect_battle_target_nums: undefined,
        field: upOpponent
          ? applyUpPhaseToField(opState.field, opState.lrig_upkeep_condition !== undefined)
          : opState.field,
      }), !handover.keepTurn).state, !handover.keepTurn)));
      // ターンプレイヤーを交代しない場合（追加ターン／相手のターンスキップ）は
      // `activeUserId` を渡さず `active_user_id` キー自体を書かない。
      if (handover.keepTurn) {
        newMyState = activateNextTurnSigniZoneBlocks(
          activateNextTurnDeployCountLimit(handover.consumeTurnEnder(newMyState)).state);
        // §5.6 `C-9`＝次のターンも自分＝**自分がアップフェイズを迎える**。
        newMyState = { ...newMyState, field: applyUpPhaseToField(newMyState.field, newMyState.lrig_upkeep_condition !== undefined) };
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
      // 🆕§5.3 `O-266`（2026-09-06）＝→ENERGY: game_energy_phase_charge（`WX25-P2-007-E1`）。
      //   🔴**ドロー版とは別処理**＝デッキの上を**エナゾーン**へ置く（手札には入らない）。
      //   ⚠原文の括弧書き「手札か場からエナゾーンにカードを置く**前に**」＝この地点（フェイズ開始時）で正しい。
      const enaChargeN = newMyState.game_energy_phase_charge ?? 0;
      if (nextPhase === 'ENERGY' && enaChargeN > 0 && newMyState.deck.length > 0) {
        const charged = newMyState.deck.slice(0, enaChargeN);
        // 🆕§5.3 `O-321` 第275＝エナゾーンへの配置は必ず台帳へ（`cause:'rule'`＝ルール処理）。
        newMyState = recordEnergyPlacements({ ...newMyState, deck: newMyState.deck.slice(charged.length),
          energy: [...newMyState.energy, ...charged] }, charged, 'rule');
        appendBattleLogs([`エナフェイズ開始【エナチャージ${charged.length}】（このゲーム）`]);
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
            action: { type: 'STUB', id: 'HASTARLIQ_TRIGGER', value: zi } as import('../../../types/effects').StubAction,
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
        const gpsRes = collectTurnTriggers('ON_GROW_PHASE_START', newMyState, op, 'GROW');
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
        // ⚠**遷移先の `ATTACK_ARTS` を渡す**（§5.3 `O-72`）＝`bs.turn_phase` はまだ MAIN なので、
        //   これを渡さないと「あなたのアタックフェイズの間…【自】能力を得る」が発火しない。
        const apsRes = collectTurnTriggers('ON_ATTACK_PHASE_START', newMyState, op, 'ATTACK_ARTS');
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
        // 🆕§5.3 `O-299` 第262バッチ（2026-09-11）＝**「次の次のあなたのメインフェイズ開始時」の裏向き復帰**
        //   （`WXDi-P00-038-E1`）。**自分のメインフェイズ開始を通るたびに1減らす**のがここ＝
        //   既存 `INSTALL_DELAYED_TRIGGER` は「次の1回」までしか表せない（`O-314`）ので予約側で数える。
        // ⚠**表向きになった分だけ**「対戦相手は手札を2枚捨てる」を出す（ゾーンが埋まっていて
        //   表向きにできなかった予約では捨てさせない＝原文の条件）。
        const smFacedown = resolveSecondMainFacedownReturns(newMyState);
        if (smFacedown.flipped.length > 0 || smFacedown.state !== newMyState) {
          newMyState = smFacedown.state;
        }
        if (smFacedown.flipped.length > 0) {
          appendBattleLogs([`裏向きシグニ${smFacedown.flipped.length}体を表向きにした`]);
        }
        if (smFacedown.discard > 0) {
          // 🔑**手札を捨てさせるのは effect_stack へ載せる**＝直接 state を書くと
          //   「どれを捨てるか」の選択（相手の応答）と【自】の誘発を飛ばしてしまう。
          const smEntry: StackEntry = {
            id: crypto.randomUUID(),
            playerId: bs.active_user_id ?? user.id,
            cardNum: smFacedown.flipped[0] ?? 'WXDi-P00-038',
            effectId: 'WXDi-P00-038-E1-FLIP',
            label: '裏向きから戻ったシグニの効果（対戦相手は手札を2枚捨てる）',
            effect: {
              effectId: 'WXDi-P00-038-E1-FLIP', effectType: 'AUTO', timing: ['ON_MAIN_PHASE_START'],
              action: { type: 'TRASH', target: { type: 'HAND_CARD', owner: 'opponent', count: smFacedown.discard } },
              duration: 'INSTANT', mandatory: true, parseStatus: 'MANUAL',
            } as CardEffect,
          };
          const baseStackSM = phaseStack ?? bs.effect_stack ?? null;
          phaseStack = baseStackSM
            ? pushToStack(baseStackSM, [smEntry])
            : initStack(bs.active_user_id ?? user.id, [smEntry]);
        }
        const mpsRes = collectTurnTriggers('ON_MAIN_PHASE_START', newMyState, op, 'MAIN');
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
}
