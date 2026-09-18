import type {PlayerState, StackEntry} from '../../../types';
import {getCardNum} from '../../../engine/effectExecutor';
import {resolvePendingExiles} from '../../../engine/execUtils';
import {initStack, pushToStack} from '../../../engine/effectStack';
import {collectAnyZoneTrashSelfTriggers as pureCollectAnyZoneTrashSelfTriggers} from '../../../engine/triggerCollect';
import {resolveTurnEndLrigDeckReturn} from '../turnEndLrigDeckReturn';
import {resolveTurnEndHandReturn} from '../turnEndHandReturn';
import {resolveTurnEndEnergyTrash} from '../turnEndEnergyTrash';
import {applyUpPhaseToField, upPhaseRecipient} from '../upPhase';
import {clearEndOfTurnDelayedTriggers} from '../delayedTrigger';
import {resolveTurnEndFacedownReturns} from '../../../engine/facedownSigni';
import {resolveTurnHandover} from '../turnHandover';
import {clearAllZoneBurstGrantUntilOppTurn} from '../allZoneBurst';
import type {PerformCtx} from './performCtx';
import {reduceBattle} from './battleController';
import {clearTurnGrantedLrigAbilities} from '../grantedAuto';
import {activateNextTurnDeployCountLimit} from '../deployCountLimit';
import {activateNextTurnSigniZoneBlocks} from '../signiZoneBlock';
import {clearUntilOppTurnEffects} from '../untilOppTurn';
import {clearAttackFieldTrashCosts} from '../attackFieldTrashCost';
import {clearTurnEndScopedState} from '../turnScopedState';

/** 画面だけが持つ捨て札モーダルの状態。 */
export interface EndDiscardUi {
  /** 捨てる枚数（モーダルが閉じていれば `null`）。 */
  pendingEndDiscard: number | null;
  /** 選んだ手札の添字。 */
  selectedEndDiscard: Set<number>;
  closeEndDiscard: () => void;
  /** 画面の操作ロック。 */
  loading: boolean;
}

// 🆕§5.7 `S-5c` 第3段（2026-09-18）＝エンドフェイズの手札上限の捨て札（`confirmEndDiscard`・234行）を `BattleScreen` から**逐語で移設**。
export async function confirmEndDiscard(c: PerformCtx, ui: EndDiscardUi): Promise<void> {
  // ── 注入された材料を**画面と同じ名前**で取り出す（下の本体は画面から逐語で移設＝名前を変えない）──
  const { bs, cardMap: battleCardMap, isHost } = c;
  const user = { id: c.userId };
  const persist = { commit: c.io.commit };
  const appendBattleLogs = c.io.appendLogs;
  const setLoading = c.io.setLoading;
  const mkTrigCtx = c.trigCtx;
  const { pendingEndDiscard, selectedEndDiscard, closeEndDiscard, loading } = ui;
  const my = isHost ? bs.host_state : bs.guest_state;
  const op = isHost ? bs.guest_state : bs.host_state;
  // ── 画面にあった薄いラッパ（逐語）──
  const collectAnyZoneTrashSelfTriggers = (trashedCardNum: string, trashedPlayerId: string, causeByOpponent = false, origin: 'hand' | 'energy' | 'under_signi' = 'hand', causeSourceCardNum?: string, byEffectCause = true, ownerState?: PlayerState, otherState?: PlayerState): StackEntry[] =>
    pureCollectAnyZoneTrashSelfTriggers(mkTrigCtx(), trashedCardNum, trashedPlayerId, causeByOpponent, origin, causeSourceCardNum, byEffectCause, ownerState, otherState);

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
      // abilities_removed / keyword_abilities_removed のクリアと「次のターン」予約の昇格は
      // clearTurnEndScopedState に集約した（§6.4 O-3）。ここで個別に空へ倒すと予約を握り潰す。
      actions_done: [],
      last_effect_draw_source: undefined, // 効果ドローの原因カードをリセット（drawBySourceStory）
      pending_crashed_cards: [], pending_crash_source_card_nums: [], crash_source_card_num: undefined, pending_crash_causes: [], crash_cause: undefined,
      prevent_next_damage: undefined, prevent_next_damage_reservations: undefined, turn_end_mill_count: undefined, damage_replace_mill: undefined, life_crash_replacements: undefined,
      // LIFE_BURST_DOUBLE の2キーは clearTurnEndScopedState へ集約（CPU／強制終了も同じ funnel）。
      lrig_granted_auto_effects: clearTurnGrantedLrigAbilities(my).lrig_granted_auto_effects, banish_redirect: undefined,
      banish_redirect_target_nums: undefined,
      banish_redirect_battle_target_nums: undefined,
      banish_redirect_power0_target_nums: undefined,
      banish_redirect_to_hand: undefined, banish_redirect_to_exile: undefined, power0_banish_to_trash: undefined, power0_banish_to_trash_opp_only: undefined,
      banish_redirect_by_source_nums: undefined,
      next_assist_grow_mods: undefined,                 // §5.3 `O-180`
      banish_redirect_by_source_effect_nums: undefined, // §5.3 `O-210`
      banish_redirect_once_source_nums: undefined,      // §5.3 `O-210`
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
      crash_to_trash_instead: undefined, crash_to_trash_next_crash_only: undefined, negate_opp_attacks: undefined,
      all_cont_effects_negated: undefined, banish_to_trash_by_self: undefined,
      coin_condition_signi_instances: undefined,
      deck_signi_level_override: undefined,
      reduce_next_on_play_cost: undefined, optional_discard_guard_enabled: undefined,
      turn_end_field_trash_targets: undefined,
      turn_trigger_3rd_plant_down: undefined,
      turn_plant_down_count: undefined,
      turn_hand_discarded_count: undefined, turn_signi_returned_to_hand: undefined, turn_arts_used: undefined, turn_arts_used_names: undefined, turn_arts_used_colors: undefined, turn_pieces_used_names: undefined,
      is_betting_this_effect: undefined, is_boosting_this_effect: undefined, last_discarded_signi_power: undefined, last_discarded_signi_level: undefined,
      last_discarded_signi_class: undefined,      // §5.3 `O-328`: レベルと同じ寿命へ揃える
      cancel_current_signi_attack: undefined, cancel_current_lrig_attack: undefined,
    })));
    // 相手のアップ処理
    const opKey = isHost ? 'guest_state' : 'host_state';
    // 遅延自己除外は非ターンプレイヤー側にも適用（doPhaseAdvance 側と同じ。手札上限超過経由でも落とさない）
    const opState = resolvePendingExiles(opEndState, true);
    // §6.4 O-3: 交代判定は `doPhaseAdvance` 側と**同じ1関数**（軸を足すときもここではなく関数へ）。
    const handoverED = resolveTurnHandover(my, opState);
    // 🔴§5.6 `C-9`＝アップを受けるのは次にターンを行うプレイヤー（`doPhaseAdvance` 側と同じ規則）。
    const upOpponentED = upPhaseRecipient(handoverED.keepTurn) === 'opponent';
    if (upOpponentED && opState.lrig_upkeep_condition) appendBattleLogs([`相手のセンタールリグはアップ条件あり（${opState.lrig_upkeep_condition}）`]);
    const opFinalState = handoverED.consumeOpponent(clearEndOfTurnDelayedTriggers(activateNextTurnSigniZoneBlocks(activateNextTurnDeployCountLimit(clearTurnEndScopedState({
      ...clearUntilOppTurnEffects(clearAllZoneBurstGrantUntilOppTurn(opState)),
      // 相手側も同じく clearTurnEndScopedState に集約（§6.4 O-3）。
      signi_played_from_trash: undefined, signi_played_from_deck: undefined, signi_placed_by_source: undefined, // 出自マーカー本体はUP開始時の funnel でクリア
      turn_arts_used: undefined, turn_arts_used_names: undefined, turn_arts_used_colors: undefined, turn_pieces_used_names: undefined, // アーツ使用履歴をリセット
      signi_deploy_count_limit: undefined,       // 配置数制限（このターン・相手にかけられた分）を自分のターン開始時にリセット
      banish_redirect_power0_target_nums: undefined, // 非ターンプレイヤーがこのターン中に設定した単体power0置換もクリア
      banish_redirect_battle_target_nums: undefined,
      field: upOpponentED
        ? applyUpPhaseToField(opState.field, opState.lrig_upkeep_condition !== undefined)
        : opState.field,
    }), !handoverED.keepTurn).state, !handoverED.keepTurn)));
    // 追加ターン / 相手のターンスキップ / ターンプレイヤー交代
    // ⚠ 交代しない場合は active_user_id を書かず据え置く（＝BEGIN_NEXT_TURN の activeUserId 省略）。
    let nextActiveUserId: string | undefined;
    if (handoverED.keepTurn) {
      newMyState = activateNextTurnSigniZoneBlocks(
        activateNextTurnDeployCountLimit(handoverED.consumeTurnEnder(newMyState)).state);
      // §5.6 `C-9`＝次のターンも自分＝**自分がアップフェイズを迎える**。
      newMyState = { ...newMyState, field: applyUpPhaseToField(newMyState.field, newMyState.lrig_upkeep_condition !== undefined) };
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
}
