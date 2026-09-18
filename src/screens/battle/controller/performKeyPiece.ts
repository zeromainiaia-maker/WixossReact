import { getCardNum } from '../../../engine/effectExecutor';
import { initStack, pushToStack } from '../../../engine/effectStack';
import { collectCoinPaidTriggers as pureCollectCoinPaidTriggers, collectHandDiscardTriggers as pureCollectHandDiscardTriggers } from '../../../engine/triggerCollect';
import { type CardData, type PlayerState, type StackEntry } from '../../../types';
import { canUseArtsCondition, isPieceCardType } from '../battleUtils';
import { reduceBattle } from '../controller/battleController';
import { queueCardEffects as queueCardEffectsImpl } from '../controller/queueCardEffects';
import { type EnergyPayEntry, planEnergyPayment } from '../energyPaySource';
import { keyCapacityOf, keysOnFieldOf } from '../keyPieceUseGate';
import { MAYU_ENCOUNTER_A, MAYU_ENCOUNTER_B, prepareMayuEncounter } from '../mayuEncounter';
import { collectPieceCutinCandidates } from '../pieceCutin';
import type { PerformCtx } from './performCtx';

/**
 * 🆕§5.7 `S-5c` 第2段（2026-09-18）＝`BattleScreen` から**逐語で移設**し、I/O と材料（`PerformCtx`）を注入にした。
 * ⚠可否の判定はここに書かない（`*Gate.ts`）。
 */
/** ON_COIN_PAID の usedIds（《ターン1回/2回》消化）を payer 状態の actions_done へ書き戻す（旧 `BattleScreen` の1行ヘルパ）。 */
const applyCoinPaidUsed = (st: PlayerState, coin: { usedIds: string[] }): PlayerState =>
  coin.usedIds.length > 0 ? { ...st, actions_done: [...(st.actions_done ?? []), ...coin.usedIds] } : st;

// ── キーピース使用 ──
/**
 * キーを場に出す／ピースを使う実行（人間・CPU 共通・§5.6 `C-7`）。`performArts` と同じく **使う側をパラメータ化**し、
 * 人間用 `executeKeyPiece` は薄いラッパーにする。
 * ⚠**「いま使えるか」の判定は `keyPieceUseGate.checkKeyPieceUse`**。ここに残す使用条件は**実行入口の再検算**。
 * ⚠**マユのエンカウント（`WXDi-P13-003A`）は人間だけ**＝グロウ経路（`executeGrow`）が人間の盤面を前提にしている
 *   （CPU の候補からは `cpuKeyPiece.ts` が外す）。
 */
export const performKeyPiece = async (
  card: CardData,
  costIndices: Set<number>,
  p: {
    actor: PlayerState; opponent: PlayerState;
    actorId: string;
    actorKey: 'host_state' | 'guest_state';
    isActorTurn: boolean;
    /** `buildEnergyPayPool(actor, ...)` の結果（`costIndices` はこの pool の index）。 */
    energyPayPool: EnergyPayEntry[];
    /** 🆕§5.7 `S-5c` 第2段＝ゾーンモーダルを閉じる合図（画面のみ）。 */
    closeZoneModal?: () => void;
    /** 🆕キー/ピースのモーダルを閉じる（画面のみ）。 */
    closeKeyModal?: () => void;
    /**
     * 🆕**《MAYU》のピースによるグロウ**（画面は `executeGrow`＝モーダルを閉じて人間の文脈で `performGrow` を呼ぶ）。
     * ⚠**画面だけが渡す**＝渡さなければグロウしない（CPU のキー/ピース経路はこの札を選ばない）。
     */
    growForMayu?: (
      card: CardData, costIndices: Set<number>,
      options: { instanceId?: string; baseState?: PlayerState; freeCost?: boolean; consumeGrowAction?: boolean;
        extraEntries?: StackEntry[]; opponentState?: PlayerState; suppressOnPlayOnce?: boolean;
        growPayDiscardHandIdx?: number[] },
    ) => Promise<void>;
    /** 請求するコイン（`keyPieceCostOf`＝提示・モーダルと同じ式）。 */
    coinNeeded: number;
    effectivePowers?: Map<string, number>;
  },
  ctx: PerformCtx,
) => {
  const my = p.actor;
  const op = p.opponent;
  const actorIsHost = p.actorKey === 'host_state';
  if (!canUseArtsCondition(
    ctx.effectsMap.get(card.CardNum) ?? [], my, op, ctx.cardMap, card.CardNum, ctx.bs.turn_phase, p.isActorTurn, p.effectivePowers,
  )) return;

  // WXDi-P13-003A is a piece whose resolution turns the same physical instance into
  // a LRIG. Build the entire payment/flip state first, then let executeGrow perform
  // the single commit and the normal ON_PLAY/ON_LRIG_GROW collection.
  if (card.CardNum === MAYU_ENCOUNTER_A) {
    if (p.actorId !== ctx.userId) return;
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
    p.closeKeyModal?.();

    const afterHost = ctx.isHost ? prep.state : ctx.bs.host_state;
    const afterGuest = ctx.isHost ? ctx.bs.guest_state : prep.state;
    const bd = ctx.collectBoardDiff(afterHost, afterGuest, {
      causeOwnerId: ctx.userId,
      causeSourceCardNum: instanceId,
    });
    let preparedMine = ctx.isHost ? bd.hostState : bd.guestState;
    const preparedOpp = ctx.isHost ? bd.guestState : bd.hostState;
    const handDiscard = prep.movedFromHand.length > 0
      ? pureCollectHandDiscardTriggers(ctx.trigCtx(), 
          prep.movedFromHand.map(getCardNum), preparedMine, ctx.userId, false,
          preparedOpp, ctx.isHost ? ctx.bs.guest_id : ctx.bs.host_id,
          undefined, undefined, ctx.userId,
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
      ctx.io.setLoading(true);
      try {
        const stateKey = ctx.isHost ? 'host_state' : 'guest_state';
        const opKey = ctx.isHost ? 'guest_state' : 'host_state';
        const stack = movementEntries.length > 0
          ? (ctx.bs.effect_stack
              ? pushToStack(ctx.bs.effect_stack, movementEntries)
              : initStack(ctx.bs.active_user_id ?? ctx.userId, movementEntries))
          : undefined;
        await ctx.io.commit(reduceBattle(ctx.bs, {
          type: 'WRITE_STATE',
          myKey: stateKey,
          myState: preparedMine,
          opp: preparedOpp !== op ? { key: opKey, state: preparedOpp } : undefined,
          ...(stack ? { effectStack: stack } : {}),
        }));
      } finally {
        ctx.io.setLoading(false);
      }
      return;
    }

    const mayu = ctx.cardMap.get(MAYU_ENCOUNTER_B);
    if (!mayu) return;
    await p.growForMayu?.(mayu, new Set(), {
      instanceId: prep.instanceId,
      baseState: preparedMine,
      opponentState: preparedOpp,
      freeCost: true,
      consumeGrowAction: true,
      extraEntries: movementEntries,
    });
    return;
  }

  ctx.io.setLoading(true);
  try {
    const cardNum = card.CardNum;
    const idx = my.lrig_deck.findIndex(id => getCardNum(id) === cardNum);
    const instanceId = idx >= 0 ? my.lrig_deck[idx] : cardNum;
    const newLrigDeck = idx === -1 ? my.lrig_deck
      : [...my.lrig_deck.slice(0, idx), ...my.lrig_deck.slice(idx + 1)];
    const keyPay = planEnergyPayment(my, p.energyPayPool, costIndices);
    const paidNums = keyPay.paidNums;
    // 🆕§5.6 `C-7`＝**請求するコインは提示・モーダルと同じ `keyPlaceCoinCostOf`**（呼び出し側が `keyPieceCostOf` で渡す）。
    //   旧実装は印刷コインを直読みしており、「センタールリグが＜にじさんじ＞なら《コイン×0》」のキーで手持ちのコインを取っていた。
    const coinCost = p.coinNeeded;
    // 🔴**ピースはキーではない**（§3 (cxxiii)・続き475g）。
    //   ルール上ピースは「**使用**＝コストを1回払って効果を解決し、ルリグトラッシュへ置く」もので、
    //   キーゾーンを占有しない。従来は キー と同じ経路で **①印刷 Cost を徴収 ②`key_piece` へ置き
    //   ③`AUTO`/`ON_PLAY` しか積まない** だったため、**118枚（Type='ピース' 119枚中）が
    //   `ACTIVATED`＋印刷 Cost 同額の `cost.energy` を持つのに効果が一切走らず**、
    //   KEY スロットの【起】から起動して**同額をもう一度**払う羽目になっていた（＝二重請求）。
    //   ⚠**分岐はピース判定だけ**＝キー側は1行も変えない（共通経路の事故を構造的に避ける）。
    //   ⚠**`isPieceCardType`（派生3値）で判定する**＝完全一致だと `'ピース/クラフト'` が
    //     キー扱いになり、キーゾーンを占有したうえ `ACTIVATED` が積まれない（`V-158`）。
    const isPiece = isPieceCardType(card.Type);
    // 🆕枠に余りがあれば `key_piece_extra` へ積む＝`UNLIMITED_KEYS`（無制限）と `key_place_limit`（「N枚まで」＝§5.3 `O-200`）。
    const keyCapEKP = keyCapacityOf(my, ctx.effectsMap);
    const keysOnFieldEKP = keysOnFieldOf(my);
    const newField = isPiece
      ? my.field                                     // ピースはキーゾーンを占有しない
      : (my.field.key_piece && keysOnFieldEKP < keyCapEKP)
        ? { ...my.field, key_piece_extra: [...(my.field.key_piece_extra ?? []), instanceId] }
        : { ...my.field, key_piece: instanceId };
    // 「このゲームの間、あなたのセンタールリグは『…』を得る」型（`WXDi-P15-003-E2`＝CONTINUOUS
    // `GRANT_LRIG_ABILITY`）は、**カードがキーゾーンに居ることで読まれていた**。ルリグトラッシュへ送ると
    // 失効するので、**解決時に付与ストアへ載せ替える**（engine の `GRANT_LRIG_ABILITY` 実行と同じ形）。
    // ⚠`duration:'PERMANENT'` のときだけ `permanentGrant` を刻む＝ターン境界リセットで残す条件。
    const pieceContGrants = isPiece
      ? (ctx.effectsMap.get(instanceId) ?? []).filter(e =>
          e.effectType === 'CONTINUOUS'
          && (e.action as { type?: string })?.type === 'GRANT_LRIG_ABILITY')
      : [];
    const pieceGrantedAbilities = pieceContGrants.flatMap(e => {
      const abilities = (e.action as unknown as import('../../../types/effects').GrantLrigAbilityAction).abilities ?? [];
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
      // 🆕🔴**§5.3 `O-321`①（2026-09-11 第276）＝ピースの使用履歴を残す。**
      //   旧＝`executeArts` だけが `turn_arts_used_names` を積んでおり、**ピースはどこにも記録されなかった**＝
      //   `WXDi-P11-046-E2`（「このターンにあなたがピースを使用していた場合」）は**恒久 no-op** だった
      //   （条件型も filter も live に在るのに、読む先が永久に空）。
      //   ⚠**`turn_arts_used*` へは混ぜない**＝アーツとピースは別のカード種別（`types/index.ts` の項）。
      ...(isPiece ? { turn_pieces_used_names: [...(my.turn_pieces_used_names ?? []), card.CardName] } : {}),
    });
    // ON_COIN_PAID（C1 配線・キープレイのコイン支払）: extraEntries 経由で反応【自】を積む。
    const keyCoin = coinCost > 0 ? pureCollectCoinPaidTriggers(ctx.trigCtx(), p.actorId, paid, op) : { entries: [] as StackEntry[], usedIds: [] as string[] };
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
          cardMap: ctx.cardMap, effectsMap: ctx.effectsMap, turnPhase: ctx.bs.turn_phase ?? undefined,
        })
      : [];
    if (isPiece && pieceCutins.length > 0) {
      const stateKeyPC = p.actorKey;
      const oppKeyPC = actorIsHost ? 'guest_state' : 'host_state';
      ctx.io.appendLogs([`${card.CardName}の使用にカットインできる（相手の応答待ち）`]);
      await ctx.io.commit(reduceBattle(ctx.bs, {
        type: 'QUEUE_SPELL',
        casterKey: stateKeyPC,
        casterState: paidWithCoin,
        other: { key: oppKeyPC, state: { ...op, team_piece_cutin_window: true } },
        spell: { caster_id: p.actorId, card_num: instanceId, kind: 'piece' },
      }));
      p.closeZoneModal?.();
      return;
    }
    const fired = isPiece
      ? await queueCardEffectsImpl(instanceId, ['AUTO', 'ACTIVATED'],
          ['ON_PLAY', 'MAIN', 'ATTACK', 'SPELL_CUTIN'], paidWithCoin, op, undefined, 1, keyCoinPaidEntries, { id: p.actorId, key: p.actorKey }, ctx)
      : await queueCardEffectsImpl(instanceId, ['AUTO'], ['ON_PLAY'], paidWithCoin, op, undefined, 1, keyCoinPaidEntries, { id: p.actorId, key: p.actorKey }, ctx);
    if (!fired) {
      await ctx.io.commit(reduceBattle(ctx.bs, { type: 'WRITE_STATE', myKey: p.actorKey, myState: paidWithCoin }));
    }
    p.closeZoneModal?.();
  } finally {
    ctx.io.setLoading(false);
  }
};
