import { collectOppTurnArtsCostReductions, keySlotCardNums } from '../../../engine/effectEngine';
import { getCardNum } from '../../../engine/effectExecutor';
import { collectCoinPaidTriggers as pureCollectCoinPaidTriggers, collectMaterialUsedByPlayerTriggers as pureCollectMaterialUsedByPlayerTriggers } from '../../../engine/triggerCollect';
import { type CardData, type PlayerState, type StackEntry } from '../../../types';
import { isArtsUseBlockedFor } from '../artsUseGate';
import { canUseArtsCondition } from '../battleUtils';
import { cardNameUseBlocked } from '../cardNameUseBlock';
import { reduceBattle } from '../controller/battleController';
import { queueCardEffects as queueCardEffectsImpl } from '../controller/queueCardEffects';
import { encoreCostOf, exceedPoolOf, paidEnergyColorsOf, paySelectedExceed, handDiscardHistoryRecord } from '../costs';
import { type EnergyPayEntry, planEnergyPayment } from '../energyPaySource';
import { removeKeyToLrigTrash } from '../keyZone';
import { payUseTimeCost, resolveUseTimeCost } from '../useTimeCost';
import type { PerformCtx } from './performCtx';

/**
 * 🆕§5.7 `S-5c` 第2段（2026-09-18）＝`BattleScreen` から**逐語で移設**し、I/O と材料（`PerformCtx`）を注入にした。
 * ⚠可否の判定はここに書かない（`*Gate.ts`）。
 */
/** ON_COIN_PAID の usedIds（《ターン1回/2回》消化）を payer 状態の actions_done へ書き戻す（旧 `BattleScreen` の1行ヘルパ）。 */
const applyCoinPaidUsed = (st: PlayerState, coin: { usedIds: string[] }): PlayerState =>
  coin.usedIds.length > 0 ? { ...st, actions_done: [...(st.actions_done ?? []), ...coin.usedIds] } : st;

/**
 * アーツ使用の実行（人間・CPU 共通）。DESIGN §4「CPU は対人戦と同じ処理を使う」の抽出形＝
 * `performSigniActivated` / `performSigniAttack` と同じく **owner をパラメータ化**し、
 * 人間用 `executeArts` は薄いラッパーにする（§8 `O-1`）。
 *
 * ⚠**「いま使えるか」の判定はここではなく `artsUseGate.checkArtsUse`**（提示と支払いは別の地点）。
 * ここに残す3ゲートは**実行入口の再検算**＝UI を迂回する経路（カットイン等）から素通りさせないため。
 */
export const performArts = async (
  card: CardData,
  sel: {
    costIndices: Set<number>;
    betCoins?: number;
    encore?: boolean;
    discardIndices?: Set<number>;
    useKeySub?: boolean;
    boosting?: boolean;
    useCostPayKeys?: Set<string>;
    /**
     * 🆕§5.3 `O-251`＝「以下のNつから」いくつ選ぶと**宣言**したか。
     * 🔴コストがこの数に比例して増えるので、支払い state に載せて `CHOOSE` を宣言数に固定する。
     * ⚠**未指定（CPU 経路）は従来どおり**＝増額もせず選択数も固定しない近似。
     */
    declaredChooseCount?: number;
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
    /** 🆕§5.7 `S-5c` 第2段＝ゾーンモーダルを閉じる合図（画面のみ）。 */
    closeZoneModal?: () => void;
    effectivePowers?: Map<string, number>;
  },
  ctx: PerformCtx,
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
  // 🆕`card` を渡す（§5.3 `O-349`）＝色限定つきの使用封じは**そのカードの色**で決まるので、
  //   実行入口でも同じ引数で判定する（UI だけで弾くとカットイン等の別経路から素通りする）。
  if (isArtsUseBlockedFor(my, p.blockedSelf, card)) return;
  // ⚠実行入口にも同じゲートを置く（UI 側だけだと別経路＝カットイン等から素通りする・§6.4 O-3）
  if (cardNameUseBlocked(my, card.CardName, card.Type)) return;
  if (!canUseArtsCondition(
    ctx.effectsMap.get(card.CardNum) ?? [], my, op, ctx.cardMap, card.CardNum, ctx.bs.turn_phase, ctx.bs.active_user_id === ctx.userId, p.effectivePowers)) return;
  ctx.io.setLoading(true);
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
      paidNums, ctx.cards, my.keyword_grants, p.enaAllMulti, p.enaMultiStripped);
    // §6.4 O-10（続き510）＝いま軽減に使った「1回きり」の宣言（`WXK03-071-E1`）を後で失効させる。
    // ⚠**コスト計算と同じ収集関数**を使う（別の条件で数え直すと「軽減はされたのに能力は残る」ズレになる）。
    const oppTurnArtsReductionIds = collectOppTurnArtsCostReductions(
      my, op, p.isActorTurn, ctx.cardMap, ctx.effectsMap).map(r => r.effectId);
    // 使用時の任意支払いによるコスト軽減（タスク12(lxxxv)）＝支払い元が手札なら
    // 既存の discard と**同じ index 空間**でまとめて消す（別々に消すと index がずれる）。
    const useCostSpec = resolveUseTimeCost(card.CardNum, ctx.effectsMap);
    const useCostHandIdx = useCostSpec?.source === 'hand'
      ? [...useCostPayKeys].filter(k => k.startsWith('h:')).map(k => parseInt(k.slice(2))) : [];
    const discardIdxAll = new Set([...discardIndices, ...useCostHandIdx]);
    const discardNums = [...discardIdxAll].map(i => my.hand[i]).filter(Boolean);
    const newHand = my.hand.filter((_, i) => !discardIdxAll.has(i));
    // ベット消費コインは UI で選んだ枚数（betCoins）。アンコールとの合算可否は UI でガード済み
    const betCost = Math.max(0, betCoins);
    const encoreCoinCost = encore ? (encoreCostOf(card.CardNum, ctx.effectsMap)?.coins ?? 0) : 0;
    // キーピース代替（ENERGY_SUBSTITUTE_TRASH_KEY）
    // 🔴§5.6 `C-9` `R-46`＝**どの枠のキーかを見分ける**（`keyZone.ts` の1本）。旧実装は `key_piece` を
    //   無条件に `null` にしており、増設枠のキーを代替に使うとメイン枠のキーが消滅していた。
    const keySub = useKeySub && p.energyTrashSubInfo.keySubInstId;
    const lrigTrashBase = encore ? my.lrig_trash : [...my.lrig_trash, instanceId];
    const keySubRemoval = keySub
      ? removeKeyToLrigTrash(my.field, lrigTrashBase, p.energyTrashSubInfo.keySubInstId!) : null;
    const paid: PlayerState = artsPay.applyTo({
      ...my,
      lrig_deck: encore
        ? [instanceId, ...newLrigDeck]    // アンコール：ルリグデッキ先頭に戻す
        : newLrigDeck,
      hand: newHand,
      lrig_trash: keySubRemoval ? keySubRemoval.lrigTrash : lrigTrashBase,
      trash: [...my.trash, ...paidNums, ...discardNums],
      coins: Math.max(0, my.coins - betCost - encoreCoinCost),
      coins_paid_this_turn: (my.coins_paid_this_turn ?? 0) + betCost + encoreCoinCost, // COINS_PAID_THIS_TURN
      field: keySubRemoval ? keySubRemoval.field : my.field,
      ...handDiscardHistoryRecord(my, discardNums),
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
      // §5.3 `O-251`＝宣言した選択数。`execChoose` が読んで選択数を固定し、読んだら `undefined` へ戻す。
      declared_choose_count: sel.declaredChooseCount,
      is_betting_this_effect: betCost > 0 ? true : undefined,
      is_boosting_this_effect: boosting ? true : undefined,
      bet_coins_paid: betCost > 0 ? betCost : undefined,
    });
    if (betCost > 0) ctx.io.appendLogs([`ベット：コイン${betCost}枚消費`]);
    if (boosting) ctx.io.appendLogs([`ブースト：追加エナコストを支払い`]);
    if (useCostHandIdx.length > 0) {
      ctx.io.appendLogs([`使用時の任意支払い：手札${useCostHandIdx.length}枚を捨てて使用コストを軽減`]);
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
      const up = payUseTimeCost(paid, useCostSpec, useCostPayKeys, ctx.cardMap);
      paidWithUseCost = up.state;
      if (up.label) ctx.io.appendLogs([up.label]);
    }
    // ON_LEAVE_FIELD / ON_TRASH（タスク12(lxxxix)）＝支払いで自分のシグニが場を離れた場合。
    // `fieldTrashCostCards` に載せる＝コスト支払いなので byEffectCause=false。
    // 収集したエントリはアーツ効果と同じスタックへ（queueCardEffects の extraEntries）。
    let useCostLeaveEntries: StackEntry[] = [];
    if (useCostTrashedSigni.length > 0) {
      const afterHostAr = actorIsHost ? paidWithUseCost : op;
      const afterGuestAr = actorIsHost ? op : paidWithUseCost;
      const bdAr = ctx.collectBoardDiff(afterHostAr, afterGuestAr, {
        causeOwnerId: p.actorId, causeSourceCardNum: instanceId,
        fieldTrashCostCards: useCostTrashedSigni,
      });
      paidWithUseCost = actorIsHost ? bdAr.hostState : bdAr.guestState;
      useCostLeaveEntries = bdAr.entries;
    }
    // 🆕§5.3 `O-199`（2026-09-02）＝アンコールの**テキスト形コスト**（アイコンではない支払い）。
    // 🔴これが無いあいだ payload は null になり、5枚は**アンコールの選択肢すら出なかった**。
    // ⚠手札捨て（`handDiscardSigni`）は上の `discardIndices` 経路で既に払われている＝ここでは扱わない。
    if (encore) {
      const encSpec = encoreCostOf(card.CardNum, ctx.effectsMap);
      if (encSpec?.exceed) {
        // ルリグの下から N 枚。⚠**選択UIは出さない近似**＝プールの先頭（グロウ順の古い側）から取る
        //   （`TRASH_UNDER_LRIG_CARD` と同じ規約。下は非公開領域で盤面上の区別が無い）。
        const poolEnc = exceedPoolOf(paidWithUseCost);
        const idxEnc = new Set(Array.from({ length: Math.min(encSpec.exceed, poolEnc.length) }, (_, i) => i));
        const afterEnc = paySelectedExceed(paidWithUseCost, encSpec.exceed, idxEnc);
        if (!afterEnc) return;   // 支払い不能（UI 側でも無効化済み・`finally` が loading を戻す）
        paidWithUseCost = afterEnc;
        ctx.io.appendLogs([`アンコール：ルリグの下から${encSpec.exceed}枚をルリグトラッシュに置いた`]);
      }
      if (encSpec?.trashOwnKey) {
        // 🔴§5.6 `C-9` `R-46`＝増設枠しか無い盤面でも払える（旧はメイン枠決め打ちで「場にキーが無い」と止まっていた）。
        const keyEnc = keySlotCardNums(paidWithUseCost)[0];
        if (!keyEnc) return;     // 場にキーが無い（UI 側でも無効化済み）
        const encRemoval = removeKeyToLrigTrash(paidWithUseCost.field, paidWithUseCost.lrig_trash, keyEnc);
        paidWithUseCost = {
          ...paidWithUseCost,
          lrig_trash: encRemoval.lrigTrash,
          field: encRemoval.field,
        };
        ctx.io.appendLogs(['アンコール：キー1枚を場からルリグトラッシュに置いた']);
      }
    }
    if (encore) ctx.io.appendLogs([`アンコール：${card.CardName}をルリグデッキに戻す`]);
    // ON_COIN_PAID（C1 配線・アーツのベット/アンコールのコイン支払）: extraEntries 経由で反応【自】を積む。
    const artsCoin = (betCost + encoreCoinCost) > 0 ? pureCollectCoinPaidTriggers(ctx.trigCtx(), p.actorId, paidWithUseCost, op) : { entries: [] as StackEntry[], usedIds: [] as string[] };
    const artsCoinPaidEntries = artsCoin.entries;
    // ON_MATERIAL_USED（改造素材機構 Step3a）: 《改造素材》使用時に「あなたが使用したとき」(materialUsedByPlayer)変種を発火。
    // ⚠「このシグニに/他の味方に使用されたとき」(self/any_ally・対象シグニ依存)は Step2（トークン3択の対象捕捉）が前提＝別途。
    let materialUsedEntries: StackEntry[] = [];
    let paidAfterMaterial = applyCoinPaidUsed(paidWithUseCost, artsCoin); // ON_COIN_PAID の《ターン1回/2回》消化を永続化（続き106）
    if (card.CardName === '改造素材') {
      const mu = pureCollectMaterialUsedByPlayerTriggers(ctx.trigCtx(), p.actorId, paidAfterMaterial);
      materialUsedEntries = mu.entries;
      if (mu.usedOncePerTurnIds.length > 0) {
        paidAfterMaterial = { ...paidAfterMaterial, actions_done: [...(paidAfterMaterial.actions_done ?? []), ...mu.usedOncePerTurnIds] };
      }
    }
    // アーツ効果を発火
    const fired = await queueCardEffectsImpl(instanceId, ['ACTIVATED'], [], paidAfterMaterial, op, undefined, 1,
      [...artsCoinPaidEntries, ...materialUsedEntries, ...useCostLeaveEntries],
      { id: p.actorId, key: p.actorKey }, ctx);
    if (!fired) {
      await ctx.io.commit(reduceBattle(ctx.bs, { type: 'WRITE_STATE', myKey: p.actorKey, myState: paidAfterMaterial }));
    }
    p.closeZoneModal?.();
  } finally {
    ctx.io.setLoading(false);
  }
};
