import type { BattleStateRow, PendingEffect, PlayerState, StackEntry } from '../../../types';
import { applyContinuousBaseLevelOverride, applyDeclaredZoneClassOverride, calcFieldPowers, collectAllColorSigniForField, collectDeckTrashLevel1Nums, collectFieldSigniExtraColors } from '../../../engine/effectEngine';
import { applyRefreshOnDone, executeEffect, getCardNum, type ExecCtx } from '../../../engine/effectExecutor';
import { initStack, pushToStack } from '../../../engine/effectStack';
import { collectCoinPaidTriggers as pureCollectCoinPaidTriggers } from '../../../engine/triggerCollect';
import { applyForcedTurnEnd } from '../turnScopedState';
import { paidEnergyColorsOf } from '../costs';
import { planEnergyPayment, type EnergyPayEntry } from '../energyPaySource';
import { payUnderSelfTrash } from '../underAnySigniCost';
import { completePieceCutinResponseAfterEffects } from '../pieceCutinCommit';
import { canUseArtsCondition } from '../battleUtils';
import { type PlayerStateKey, reduceBattle } from './battleController';
import { makeFillDeployCaps } from './execCtxDeps';
import type { PerformCtx } from './performCtx';
import type { CutinCandidate } from '../modals/types';

/**
 * 🆕**カットインの使用**（§5.6 `C-10` 第2段・2026-09-22）＝`BattleScreen.handleCutinUse`（242行）を
 * **逐語で移設**し、**応答者（actor）をパラメータ化**した（`performArts` / `performLrigActivated` と同じやり方＝DESIGN §4）。
 *
 * 🔴**なぜ要るか**＝旧は画面の「自分」（＝人間）で閉じており、**CPU はカットイン窓で常にパスするしかなかった**。
 *   📏母集団＝カットインできる札 **61カード**／**ユーザー作27デッキ中 7デッキ**（`WD13`・`ケトッシー軸` を含む）。
 *
 * ⚠**可否の判定はここに書かない**＝候補は `collectCutinCandidates`（人間の画面も CPU も同じ関数）。
 * ⚠**`ui` は画面だけが持つもの**（窓を閉じる・ピース応答の続き・最新行の取得）＝CPU は最小の実装を渡す。
 */
export interface PerformCutinUseUi {
  /** カットイン窓を閉じる（CPU は no-op）。 */
  closeCutin: () => void;
  /** 画面の操作ロック（実行中なら何もしない）。 */
  loading: boolean;
  /** 効果をスタックへ積む（画面の `queueCardEffects`）。 */
  queueCardEffects: (
    cardNum: string, types: readonly string[], timings: readonly string[],
    myState: PlayerState, opState: PlayerState,
  ) => Promise<void>;
  /** 最新の盤面行を取り直す（ピース応答窓だけが使う）。 */
  fetchLatest: () => Promise<{ data: BattleStateRow | null; error: { message: string } | null }>;
}

export interface PerformCutinUseActor {
  /** 応答する側（カットインを使う側）。 */
  actor: PlayerState;
  /** スペル／ピースを使った側。 */
  opponent: PlayerState;
  actorId: string;
  actorIsHost: boolean;
  /** 応答者のターンか（`canUseArtsCondition` に渡す）。 */
  isActorTurn: boolean;
  /** `buildEnergyPayPool(actor, ...)` の結果。 */
  energyPayPool: EnergyPayEntry[];
  enaAllMulti: boolean;
  enaMultiStripped: boolean;
}

/** ON_COIN_PAID の収集（画面の同名クロージャと同じ＝`trigCtx` を通す）。 */
const collectCoinPaidTriggersFor = (
  ctx: PerformCtx, payerId: string, afterPayerState: PlayerState, afterOpState: PlayerState,
): { entries: StackEntry[]; usedIds: string[] } =>
  pureCollectCoinPaidTriggers(ctx.trigCtx(), payerId, afterPayerState, afterOpState);

/** ON_COIN_PAID の usedIds（《ターン1回/2回》消化）を payer 状態の actions_done へ書き戻す。 */
const applyCoinPaidUsed = (st: PlayerState, coin: { usedIds: string[] }): PlayerState =>
  coin.usedIds.length > 0 ? { ...st, actions_done: [...(st.actions_done ?? []), ...coin.usedIds] } : st;

export const performCutinUse = async (
  candidate: CutinCandidate,
  costIndices: Set<number>,
  underTrashKeys: Set<string> = new Set(),
  betCoins = 0,
  /** `exceed` コストで選んだルリグの下のカード（画面の `selectedCutinExceed`）。 */
  exceedIndices: Set<number> = new Set(),
  p: PerformCutinUseActor = null as never,
  ctx: PerformCtx = null as never,
  ui: PerformCutinUseUi = null as never,
) => {
  const fillDeployCaps = makeFillDeployCaps({ cardMap: ctx.cardMap, effectsMap: ctx.effectsMap });
    if (!ctx.bs.pending_spell || ui.loading) return;
    if (candidate.kind !== 'effect') return;
    if (!canUseArtsCondition(
      [candidate.effect], p.actor, p.opponent, ctx.cardMap, candidate.instanceId, ctx.bs.turn_phase, p.isActorTurn, ctx.effectivePowers)) return;
    ctx.io.setLoading(true);
    ui.closeCutin();
    try {
      const { card: cutinCard, instanceId: cutinInstanceId, source, handIdx } = candidate;
      // §6.4 O-10（続き518）＝ピース応答窓での使用。スペル打ち消しとは処理が別なので先に分岐する。
      // 🔑**ここでは窓を閉じない**＝カットインしたピースの効果を解決し、`cutin_response_complete` を立てて
      //   既存の「応答完了→元の処理を継続」useEffect に `resolvePendingPiece` を呼ばせる
      //   （選択肢②を選んだときは元のピースがそのまま解決する＝原文どおり）。
      if (ctx.bs.pending_spell.kind === 'piece') {
        const piecePay = planEnergyPayment(p.actor, p.energyPayPool, costIndices);
        const lrigIdxPC = p.actor.lrig_deck.findIndex(id => id === cutinInstanceId);
        const newLrigDeckPC = lrigIdxPC === -1 ? p.actor.lrig_deck
          : [...p.actor.lrig_deck.slice(0, lrigIdxPC), ...p.actor.lrig_deck.slice(lrigIdxPC + 1)];
        const paidPC: PlayerState = piecePay.applyTo({
          ...p.actor,
          lrig_deck: newLrigDeckPC,
          lrig_trash: [...p.actor.lrig_trash, cutinInstanceId],
          trash: [...p.actor.trash, ...piecePay.paidNums],
        });
        ctx.io.appendLogs([`[カットイン] ${cutinCard.CardName}を使用`]);
        const stateKeyPC: PlayerStateKey = p.actorIsHost ? 'host_state' : 'guest_state';
        const completed = await completePieceCutinResponseAfterEffects<BattleStateRow>({
          // 支払いは先に確定するが、この時点では応答完了を公開しない。
          commitPayment: async () => {
            await ctx.io.commit(reduceBattle(ctx.bs, {
              type: 'WRITE_STATE', myKey: stateKeyPC, myState: paidPC,
            }));
          },
          queueEffects: async () => {
            await ui.queueCardEffects(cutinInstanceId, ['ACTIVATED'], ['MAIN', 'ATTACK', 'SPELL_CUTIN'], paidPC, p.opponent);
          },
          // commit の完了と Realtime の React state 反映は別タイミングなので、古い closure の ctx.bs を使わない。
          fetchLatest: async () => {
            const { data, error } = await ui.fetchLatest();
            if (error) console.error('[handleCutinUse piece] 最新盤面の取得エラー:', error.message);
            return data;
          },
          markComplete: async latest => {
            const latestMyState = stateKeyPC === 'host_state' ? latest.host_state : latest.guest_state;
            await ctx.io.commit(reduceBattle(latest, {
              type: 'WRITE_STATE', myKey: stateKeyPC, myState: latestMyState,
              markCutinResponseComplete: true,
            }));
          },
        });
        if (!completed) console.error('[handleCutinUse piece] 応答完了フラグを書き込めませんでした');
        return;
      }
      const { caster_id, card_num, from_lrig_deck } = ctx.bs.pending_spell;
      const casterIsHost = caster_id === ctx.bs.host_id;
      const casterState = casterIsHost ? ctx.bs.host_state : ctx.bs.guest_state;
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
      const cutinPay = planEnergyPayment(p.actor, p.energyPayPool, costIndices);
      const paidNums = cutinPay.paidNums;
      let cutinPaid: PlayerState;
      if (source === 'lrig_deck') {
        // ルリグデッキから使用: デッキから取り出してルリグトラッシュへ
        const lrigIdx = p.actor.lrig_deck.findIndex(id => getCardNum(id) === cutinCard.CardNum);
        const actualId = lrigIdx >= 0 ? p.actor.lrig_deck[lrigIdx] : cutinCard.CardNum;
        const newLrigDeck = lrigIdx === -1 ? p.actor.lrig_deck
          : [...p.actor.lrig_deck.slice(0, lrigIdx), ...p.actor.lrig_deck.slice(lrigIdx + 1)];
        cutinPaid = cutinPay.applyTo({
          ...p.actor,
          lrig_deck: newLrigDeck,
          lrig_trash: [...p.actor.lrig_trash, actualId],
          trash: [...p.actor.trash, ...paidNums],
          turn_arts_used: true,
          turn_arts_used_names: [...(p.actor.turn_arts_used_names ?? []), cutinCard.CardName],
          turn_arts_used_colors: [...(p.actor.turn_arts_used_colors ?? []), ...((cutinCard.Color || '').match(/白|赤|青|緑|黒|無色/g) ?? [])],
        });
      } else if (source === 'hand') {
        // 手札から自分を捨てる（discardSelfFromHand）
        const idx = handIdx ?? p.actor.hand.indexOf(cutinCard.CardNum);
        const newHand = idx >= 0
          ? [...p.actor.hand.slice(0, idx), ...p.actor.hand.slice(idx + 1)]
          : p.actor.hand;
        cutinPaid = cutinPay.applyTo({
          ...p.actor,
          hand: newHand,
          trash: [...p.actor.trash, cutinCard.CardNum, ...paidNums],
        });
      } else {
        // lrig_field / signi_field: エナコスト + エクシードコスト（選択カードをlrig_trashへ）
        const exceedCostH = candidate.effect.cost?.exceed ?? 0;
        const exceedPoolH = [
          ...p.actor.field.lrig.slice(0, -1),
          ...(p.actor.field.assist_lrig_l?.slice(0, -1) ?? []),
          ...(p.actor.field.assist_lrig_r?.slice(0, -1) ?? []),
        ];
        const exceedCards = exceedCostH > 0
          ? new Set([...exceedIndices].map(i => exceedPoolH[i]).filter(Boolean))
          : new Set<string>();
        cutinPaid = cutinPay.applyTo({
          ...p.actor,
          trash: [...p.actor.trash, ...paidNums],
          lrig_trash: [...p.actor.lrig_trash, ...exceedCards],
          field: {
            ...p.actor.field,
            lrig: p.actor.field.lrig.filter(id => !exceedCards.has(id)),
            assist_lrig_l: p.actor.field.assist_lrig_l?.filter(id => !exceedCards.has(id)),
            assist_lrig_r: p.actor.field.assist_lrig_r?.filter(id => !exceedCards.has(id)),
          },
        });
        if (source === 'signi_field' && candidate.effect.cost?.underSelfTrash) {
          const zoneIdx = candidate.zoneIdx ?? cutinPaid.field.signi.findIndex(stack => stack?.at(-1) === cutinInstanceId);
          const underPaid = payUnderSelfTrash(
            cutinPaid, zoneIdx, underTrashKeys, candidate.effect.cost.underSelfTrash.count, ctx.cardMap,
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
          paidNums, ctx.cards, p.actor.keyword_grants, p.enaAllMulti, p.enaMultiStripped),
      };
      // ベット宣言（タスク12(lxxxiv)）: カットイン窓でもアーツ経路と同じくコインを支払える。
      // UI 側でガード済みだが所持枚数を超えないよう丸め、is_betting_this_effect は
      // 非宣言時に明示クリアする（前回ベットの持ち越し防止＝executeArts / castSpell と同型）。
      const betCost = Math.min(Math.max(0, betCoins), p.actor.coins);
      cutinPaid = {
        ...cutinPaid,
        coins: Math.max(0, cutinPaid.coins - betCost),
        coins_paid_this_turn: (cutinPaid.coins_paid_this_turn ?? 0) + betCost, // COINS_PAID_THIS_TURN
        ...(betCost > 0 ? { actions_done: [...(cutinPaid.actions_done ?? []), 'COIN_SPENT'] } : {}),
        is_betting_this_effect: betCost > 0 ? true : undefined,
        bet_coins_paid: betCost > 0 ? betCost : undefined,
      };
      if (betCost > 0) ctx.io.appendLogs([`ベット：コイン${betCost}枚消費`]);
      // ON_COIN_PAID（C1 配線・カットインのベット）: 支払い後の盤面で反応【自】を収集しスタックへ積む。
      const cutinCoin = betCost > 0
        ? collectCoinPaidTriggersFor(ctx, p.actorId, cutinPaid, newCasterState)
        : { entries: [] as StackEntry[], usedIds: [] as string[] };
      cutinPaid = applyCoinPaidUsed(cutinPaid, cutinCoin); // 《ターン1回/2回》消化を永続化
      // カットイン効果は inline 解決＝スタックを経由しないため、コイン反応は別途スタックへ積む
      // （アーツ経路は ui.queueCardEffects の extraEntries が同じ役割を担う）。
      const cutinCoinStack = cutinCoin.entries.length > 0
        ? (ctx.bs.effect_stack ? pushToStack(ctx.bs.effect_stack, cutinCoin.entries)
          : initStack(ctx.bs.active_user_id ?? p.actorId, cutinCoin.entries))
        : undefined;
      // カットイン使用・スペル打ち消しログ（カットインは常にスペルを打ち消す）
      const counterSpellName = ctx.cardMap.get(card_num)?.CardName ?? card_num;
      ctx.io.appendLogs([`[自分] ${cutinCard.CardName}を使用（カットイン）`]);
      if (shouldCounterSpell) ctx.io.appendLogs([`${cutinCard.CardName}：「${counterSpellName}」を打ち消した`]);
      // カットイン効果発火: lrig_deckはACTIVATED、field/handはSPELL_CUTINタイミングのACTIVATEDを優先
      const effects = ctx.effectsMap.get(cutinInstanceId) ?? ctx.effectsMap.get(getCardNum(cutinInstanceId)) ?? [];
      const cutinEff = candidate.effect ?? (source === 'lrig_deck'
        ? effects.find(e => e.effectType === 'ACTIVATED')
        : effects.find(e => e.effectType === 'ACTIVATED' && e.timing?.includes('SPELL_CUTIN')));
      if (!cutinEff) {
        const myKey = p.actorIsHost ? 'host_state' : 'guest_state';
        const casterKey = casterIsHost ? 'host_state' : 'guest_state';
        if (myKey === casterKey) {
          await ctx.io.commit(reduceBattle(ctx.bs, {
            type: 'FINISH_CUTIN', playerKey: myKey, playerState: cutinPaid,
            ...(cutinCoinStack ? { effectStack: cutinCoinStack } : {}),
          }));
        } else {
          await ctx.io.commit(reduceBattle(ctx.bs, {
            type: 'FINISH_CUTIN', playerKey: myKey, playerState: cutinPaid,
            caster: { key: casterKey, state: newCasterState },
            ...(cutinCoinStack ? { effectStack: cutinCoinStack } : {}),
          }));
        }
        return;
      }
      // ownerState=cutinPaid(me), otherState=newCasterState
      const cutinPowers = calcFieldPowers(cutinPaid, newCasterState, ctx.bs.active_user_id === p.actorId, ctx.effectsMap, ctx.cardMap, ctx.bs.turn_phase);
      const cutinIsOwnerTurn = ctx.bs.active_user_id === p.actorId;
      const cutinAllColorSigniNums = new Set([...collectAllColorSigniForField(cutinPaid, ctx.cardMap, ctx.effectsMap, newCasterState, cutinIsOwnerTurn), ...collectAllColorSigniForField(newCasterState, ctx.cardMap, ctx.effectsMap, cutinPaid, !cutinIsOwnerTurn)]);
      const cutinExtraColors = new Map([...collectFieldSigniExtraColors(cutinPaid, ctx.cardMap, ctx.effectsMap, newCasterState, cutinIsOwnerTurn), ...collectFieldSigniExtraColors(newCasterState, ctx.cardMap, ctx.effectsMap, cutinPaid, !cutinIsOwnerTurn)]);
      const cutinDeckTrashLevel1Nums = collectDeckTrashLevel1Nums(cutinPaid, newCasterState, ctx.effectsMap, ctx.cardMap);
      const cutinDeclaredCardMap = applyContinuousBaseLevelOverride(applyDeclaredZoneClassOverride(ctx.cardMap, cutinPaid, newCasterState), cutinPaid, newCasterState, ctx.effectsMap, cutinIsOwnerTurn);
      // 🆕§5.0 実装キュー「系統」（`WX07-014-E1`）＝「それ（打ち消したスペル）をトラッシュから…使用してもよい」
      //   （`SEQUENCE[COUNTER_SPELL, STUB{PLAY_FREE}]`）が `card_num` を一度も渡していなかった＝
      //   `STUB{PLAY_FREE}` は `ctx.lastProcessedCards?.[0] ?? ctx.sourceCardNum` で「それ」を決めるが
      //   `sourceCardNum` はカットインしたこのカード自身＝**打ち消したはずのスペルではなくカットイン札を
      //   もう一度使おうとする恒久 no-p.opponent**だった。⚠**打ち消しを行ったときだけ**渡す（`countersSpell:false` の
      //   ピース等では「それ」が指すものが無い）。
      const execCtx: ExecCtx = { ownerState: cutinPaid, otherState: newCasterState, cardMap: cutinDeclaredCardMap, logs: [], currentPhase: ctx.bs.turn_phase ?? undefined, effectivePowers: cutinPowers, sourceCardNum: cutinInstanceId, allColorSigniNums: cutinAllColorSigniNums, fieldSigniExtraColors: cutinExtraColors, deckTrashLevel1Nums: cutinDeckTrashLevel1Nums, ...(shouldCounterSpell ? { lastProcessedCards: [card_num] } : {}) };
      fillDeployCaps(execCtx); // 配置数制限（CONT版）をctxへ
      execCtx.isOwnerTurn = cutinIsOwnerTurn;
      let result = executeEffect(cutinEff, execCtx);
      result = applyRefreshOnDone(result, ctx.cardMap); // デッキ0枚→リフレッシュ（効果1つの解決後）
      if (result.logs.length > 0) ctx.io.appendLogs(result.logs);
      // myがhost/guestに応じてマッピング
      let hostState  = p.actorIsHost ? result.ownerState : result.otherState;
      let guestState = p.actorIsHost ? result.otherState : result.ownerState;
      // 🔴§5.3 `O-117`＝**この経路は `result.forceEndTurn` を一度も読んでいなかった**。
      //   `WX05-016`（エンドホール）は Timing が**スペルカットインだけ**＝ここが唯一の実行路なので、
      //   条件を正しくしても**ターンは一度も終わらなかった**（実機 `b21end5colors` で発見）。
      //   盤面処理はスタック解決経路と**同じ `applyForcedTurnEnd`**（判定を割らない）。
      let cutinBeginNextTurn: { activeUserId: string } | undefined;
      if (result.done && result.forceEndTurn) {
        const activeIsHostFE = ctx.bs.active_user_id === ctx.bs.host_id;
        const forcedFE = applyForcedTurnEnd(
          activeIsHostFE ? hostState : guestState,
          activeIsHostFE ? guestState : hostState,
        );
        if (activeIsHostFE) { hostState = forcedFE.activeAfter; guestState = forcedFE.nextAfter; }
        else { guestState = forcedFE.activeAfter; hostState = forcedFE.nextAfter; }
        cutinBeginNextTurn = {
          activeUserId: (forcedFE.keepTurn ? ctx.bs.active_user_id : (activeIsHostFE ? ctx.bs.guest_id : ctx.bs.host_id)) as string,
        };
        ctx.io.appendLogs(['ターンが強制終了されました', ...(forcedFE.log ? [forcedFE.log] : [])]);
      }
      await ctx.io.commit(reduceBattle(ctx.bs, {
        type: 'RESOLVE_EFFECT_STEP', hostState, guestState, clearPendingSpell: true,
        pending: result.done ? null : ({ sourcePlayerId: p.actorId, sourceCardNum: cutinInstanceId, effectId: cutinEff.effectId, interaction: result.pending, ...(result.storedTargetCards ? { storedTargetCards: result.storedTargetCards } : {}) } satisfies PendingEffect),
        ...(cutinCoinStack ? { effectStack: cutinCoinStack } : {}),
        ...(cutinBeginNextTurn ? { beginNextTurn: cutinBeginNextTurn } : {}),
      }));
    } finally {
      ctx.io.setLoading(false);
    }
};
