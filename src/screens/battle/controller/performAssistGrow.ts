import { applyCoinGain } from '../../../engine/coinGain';
import { getCardNum } from '../../../engine/effectExecutor';
import { initStack, pushToStack } from '../../../engine/effectStack';
import { collectAssistOnPlayTriggers as pureCollectAssistOnPlayTriggers, collectCoinGainedTriggers as pureCollectCoinGainedTriggers, type TrigCtx } from '../../../engine/triggerCollect';
import type { BattleStateRow, CardData, PlayerState, StackEntry } from '../../../types';
import { planEnergyPayment, type EnergyPayEntry } from '../energyPaySource';
import type { BattleIo } from './battleIo';
import { reduceBattle } from './battleController';

/**
 * アシストグロウの実行（§5.6 `C-5`＝人間と CPU が同じ関数を通る）。
 * 🆕§5.7 `S-5c` 第2段（2026-09-18）＝`BattleScreen` から**逐語で移設**し、I/O（`commit`／`setLoading`）を注入にした。
 * ⚠**可否はここで判定しない**＝候補は `listAssistGrowCandidates`、支払いは呼び出し側が選んだ `costIndices`。
 */
export const performAssistGrow = async (card: CardData, side: 'l' | 'r', costIndices: Set<number>, p: {
  owner: PlayerState; other: PlayerState; ownerId: string; ownerKey: 'host_state' | 'guest_state';
  energyPayPool: EnergyPayEntry[];
}, ctx: { bs: BattleStateRow; trigCtx: () => TrigCtx; io: BattleIo }) => {
const { bs, io } = ctx;
  io.setLoading(true);
  const my = p.owner; const op = p.other;
  const ownerIsHost = p.ownerKey === 'host_state';
  const otherId = (ownerIsHost ? bs.guest_id : bs.host_id) as string;
  try {
    const cardNum = card.CardNum;
    const idx = my.lrig_deck.findIndex(id => getCardNum(id) === cardNum);
    const instanceId = idx >= 0 ? my.lrig_deck[idx] : cardNum;
    const newLrigDeck = idx === -1 ? my.lrig_deck
      : [...my.lrig_deck.slice(0, idx), ...my.lrig_deck.slice(idx + 1)];
    const assistGrowPay = planEnergyPayment(my, p.energyPayPool, costIndices);
    const paidNums = assistGrowPay.paidNums;
    const sideKey = side === 'l' ? 'assist_lrig_l' : 'assist_lrig_r';
    const currentStack = (side === 'l' ? my.field.assist_lrig_l : my.field.assist_lrig_r) ?? [];
    const assistCoinGain = parseInt(card.Coin) || 0;
    // 🆕**§5.3 `O-318`＝アシストルリグの印刷コインも `applyCoinGain` を通す**（同上）。
    const assistCoinsAfter = applyCoinGain(my, assistCoinGain).state;
    const newMyState: PlayerState = assistGrowPay.applyTo({
      ...my,
      lrig_deck: newLrigDeck,
      field: { ...my.field, [sideKey]: [...currentStack, instanceId] },
      trash: [...my.trash, ...paidNums],
      // ⚠**state 丸ごとを spread しない**（上のキーを巻き戻す）＝2キーだけ取る。
      coins: assistCoinsAfter.coins ?? 0,
      coins_gained_this_game: assistCoinsAfter.coins_gained_this_game,
      // 🆕**「次に」＝1回きり**（§5.3 `O-180`）＝アシストグロウを1回行ったらここで消す。
      //   ⚠落とすと「このターン中は何度でもルリグタイプ無視＋コスト減」に化ける。
      next_assist_grow_mods: undefined,
    });
    const stateKey = p.ownerKey;
    // 通常手順で配置したアシストルリグの【出】を共通 collector へ載せる。
    // 任意コスト/任意発動・条件・使用制限・【出】封じを効果配置経路と同じ規則で扱う。
    const assistOnPlay = pureCollectAssistOnPlayTriggers(
      ctx.trigCtx(), instanceId, newMyState, op, p.ownerId,
    );
    const usedIds = ownerIsHost ? assistOnPlay.usedHostIds : assistOnPlay.usedGuestIds;
    // ON_COIN_GAINED（§6.3 J-5）: アシストルリグ配置で Coin 欄ぶんコインを得た場合。中央 diff を通らない獲得サイト。
    // ⚠上限5のクランプ後の実増加で判定する（アシストは支払いにコインを使わないので単純差でよい）。
    const assistCoinGainActual = Math.min(5, my.coins + assistCoinGain) - my.coins;
    const assistCoinMine = assistCoinGainActual > 0
      ? pureCollectCoinGainedTriggers(ctx.trigCtx(), p.ownerId, newMyState, op, assistCoinGainActual, 0)
      : { entries: [] as StackEntry[], usedOncePerTurnIds: [] as string[] };
    const assistCoinOpp = assistCoinGainActual > 0
      ? pureCollectCoinGainedTriggers(ctx.trigCtx(), otherId, op, newMyState, 0, assistCoinGainActual)
      : { entries: [] as StackEntry[], usedOncePerTurnIds: [] as string[] };
    const assistAllEntries = [...assistOnPlay.entries, ...assistCoinMine.entries, ...assistCoinOpp.entries];
    const committedMyState = (usedIds.length > 0 || assistCoinMine.usedOncePerTurnIds.length > 0)
      ? { ...newMyState, actions_done: [...(newMyState.actions_done ?? []), ...usedIds, ...assistCoinMine.usedOncePerTurnIds] }
      : newMyState;
    const assistOppState: PlayerState | null = assistCoinOpp.usedOncePerTurnIds.length > 0
      ? { ...op, actions_done: [...(op.actions_done ?? []), ...assistCoinOpp.usedOncePerTurnIds] }
      : null;
    const assistOppKey = ownerIsHost ? 'guest_state' : 'host_state';
    if (assistAllEntries.length > 0) {
      const existing = bs?.effect_stack ?? null;
      const stack = existing ? pushToStack(existing, assistAllEntries) : initStack(bs?.active_user_id ?? p.ownerId, assistAllEntries);
      await io.commit(reduceBattle(bs, { type: 'WRITE_STATE', myKey: stateKey, myState: committedMyState, effectStack: stack, opp: assistOppState ? { key: assistOppKey, state: assistOppState } : undefined }));
    } else {
      await io.commit(reduceBattle(bs, { type: 'WRITE_STATE', myKey: stateKey, myState: committedMyState, opp: assistOppState ? { key: assistOppKey, state: assistOppState } : undefined }));
    }
  } finally {
    io.setLoading(false);
  }
};
