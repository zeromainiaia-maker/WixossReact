import { collectBlockLowCostSpellCount } from '../../../engine/effectEngine';
import { initStack, pushToStack } from '../../../engine/effectStack';
import { collectCoinPaidTriggers as pureCollectCoinPaidTriggers } from '../../../engine/triggerCollect';
import { type CardData, type EffectStack, type PendingSpell, type PlayerState, type StackEntry } from '../../../types';
import { reduceBattle } from '../controller/battleController';
import { paidEnergyColorsOf, parseGrowCost, handDiscardHistoryRecord } from '../costs';
import { type EnergyPayEntry, planEnergyPayment } from '../energyPaySource';
import { isSpellUseBlockedFor } from '../spellUseGate';
import { payUseTimeCost, resolveUseTimeCost } from '../useTimeCost';
import type { PerformCtx } from './performCtx';

/**
 * スペル使用の実行（人間・CPU 共通）。
 * 🆕§5.7 `S-5c` 第2段（2026-09-18）＝`BattleScreen` から**逐語で移設**し、I/O と材料（`PerformCtx`）を注入にした。
 */
/** ON_COIN_PAID の usedIds（《ターン1回/2回》消化）を payer 状態の actions_done へ書き戻す（旧 `BattleScreen` の1行ヘルパ）。 */
const applyCoinPaidUsed = (st: PlayerState, coin: { usedIds: string[] }): PlayerState =>
  coin.usedIds.length > 0 ? { ...st, actions_done: [...(st.actions_done ?? []), ...coin.usedIds] } : st;

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
export const performSpell = async (
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
  ctx: PerformCtx,
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
    ctx.io.appendLogs(['ディソナ制限：《ディソナアイコン》ではないスペルは使用不可']);
    return;
  }
  // BLOCK_LOW_COST_SPELL_BY_CHARM_COUNT: 相手フィールドのチャーム数以下コストのスペルは使用不可
  const spellBlockThreshold = collectBlockLowCostSpellCount(op, ctx.cardMap, ctx.effectsMap);
  if (spellBlockThreshold > 0) {
    const spellTotalCost = parseGrowCost(card.Cost ?? '').reduce((s, c) => s + c.count, 0);
    if (spellTotalCost <= spellBlockThreshold) {
      ctx.io.appendLogs([`スペル使用不可: コスト${spellTotalCost}≤相手チャーム数${spellBlockThreshold}`]);
      return;
    }
  }
  ctx.io.setLoading(true);
  try {
    const spellPay = planEnergyPayment(my, p.energyPayPool, costIndices);
    const paidNums = spellPay.paidNums;
    // 支払ったエナ1枚ごとの色配列（`WX04-063`「支払われたエナの色」＋ §5.3 `O-117` の
    // `PAID_COLORS_INCLUDE_ALL` が参照）。⚠**式は `paidEnergyColorsOf` の1本**＝アーツ経路と割らない。
    const paidEnergyColors = paidEnergyColorsOf(
      paidNums, ctx.cards, my.keyword_grants, p.enaAllMulti, p.enaMultiStripped);
    // 使用時の任意支払いで捨てる手札（コスト置換の対価）。使用したスペル自身の index は含めない。
    // タスク12(lxxxv) の「軽減」も支払い元が手札なら**同じ index 空間**で消す（別々に消すと index がずれる）。
    const useCostSpec = resolveUseTimeCost(card.CardNum, ctx.effectsMap);
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
        ...handDiscardHistoryRecord(my, discardNums),
        // 🆕**色マーカー**（§5.3 `O-269`・2026-09-06）＝「このターンにあなたが〈色〉のスペルを使用していた場合」。
        //   🔑**判定源を `SPELL_USED_THIS_TURN` と同じ `actions_done` に置く**＝専用キー（アーツ側の
        //   `turn_arts_used_colors`）を作るとリセット地点が別々になり、片方だけ残る事故になる。
        //   ⚠`actions_done.includes('USE_SPELL')` は要素の完全一致なので既存判定には影響しない。
        //   ⚠**多色スペルは色ぶん積む**（原文「赤のスペル」は赤を含めば成立）。「無色」は色ではないので積まない。
        actions_done: [...(my.actions_done ?? []), 'USE_SPELL',
          ...((card.Color || '').match(/白|赤|青|緑|黒/g) ?? []).map(c => `USE_SPELL_COLOR:${c}`),
          ...(betCost > 0 ? ['COIN_SPENT'] : [])],
        next_spell_cost_reduction: undefined, // 次スペルコスト軽減を消費（WX04-008）
        // 🆕§5.3 `O-259` 第8バッチ＝「エナコスト1つを《無》として払える」も1回で消費する。
        next_spell_wild_cost_slot: undefined,
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
        // 🔴**旧実装はここだけ枚数しか書いていなかった**（上のルリグデッキ枝は両方書いていた）＝
        //   手札からスペルを使って払った捨ては `HAND_DISCARDED_THIS_TURN{filter}` から見えなかった。
        ...handDiscardHistoryRecord(my, discardNums),
        // 🆕**色マーカー**（§5.3 `O-269`・2026-09-06）＝「このターンにあなたが〈色〉のスペルを使用していた場合」。
        //   🔑**判定源を `SPELL_USED_THIS_TURN` と同じ `actions_done` に置く**＝専用キー（アーツ側の
        //   `turn_arts_used_colors`）を作るとリセット地点が別々になり、片方だけ残る事故になる。
        //   ⚠`actions_done.includes('USE_SPELL')` は要素の完全一致なので既存判定には影響しない。
        //   ⚠**多色スペルは色ぶん積む**（原文「赤のスペル」は赤を含めば成立）。「無色」は色ではないので積まない。
        actions_done: [...(my.actions_done ?? []), 'USE_SPELL',
          ...((card.Color || '').match(/白|赤|青|緑|黒/g) ?? []).map(c => `USE_SPELL_COLOR:${c}`),
          ...(betCost > 0 ? ['COIN_SPENT'] : [])],
        next_spell_cost_reduction: undefined, // 次スペルコスト軽減を消費（WX04-008）
        // 🆕§5.3 `O-259` 第8バッチ＝「エナコスト1つを《無》として払える」も1回で消費する。
        next_spell_wild_cost_slot: undefined,
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
      const paidUse = payUseTimeCost(newMyState, useCostSpec, useCostPayKeys, ctx.cardMap);
      newMyState = paidUse.state;
      if (paidUse.label) ctx.io.appendLogs([paidUse.label]);
    } else if (useCostSpec && useCostHandIdx.length > 0) {
      ctx.io.appendLogs([`使用時の任意支払い：手札${useCostHandIdx.length}枚を捨てて使用コストを軽減`]);
    }
    if (betCost > 0) ctx.io.appendLogs([`ベット：コイン${betCost}枚消費`]);
    if (discardNums.length > 0) {
      ctx.io.appendLogs([`使用時の任意支払い：${discardNums.map(n => ctx.cardMap.get(n)?.CardName ?? n).join('・')}を捨てて使用コストを置換`]);
    }
    // ON_COIN_PAID（C1 配線・**スペル本体のベット**＝タスク12(lxxxvi)）。
    // 他のコイン支払いサイト（グロウ人間/CPU・シグニ【起】【出】・キープレイ・アーツ ベット/アンコール・
    // カットインのベット）は収集済みで、ここだけが「コインは払うのに反応【自】を積まない」穴だった。
    // 対象＝ベット持ちスペル7枚（`WXDi-P07-059` ほか）。
    const spellCoin = betCost > 0
      ? pureCollectCoinPaidTriggers(ctx.trigCtx(), p.actorId, newMyState, newOpState)
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
    //   `if (ctx.bs.effect_stack …) return;` で待つので「支払い→トリガー解決→カットイン→スペル解決」の順になる。
    const spellUseCostEntries: StackEntry[] = [...spellCoin.entries];
    if (useCostTrashedSigni.length > 0) {
      const afterHostSp = actorIsHost ? newMyState : newOpState;
      const afterGuestSp = actorIsHost ? newOpState : newMyState;
      const bdSp = ctx.collectBoardDiff(afterHostSp, afterGuestSp, {
        causeOwnerId: p.actorId, causeSourceCardNum: spellInstanceId,
        fieldTrashCostCards: useCostTrashedSigni,
      });
      newMyState = actorIsHost ? bdSp.hostState : bdSp.guestState;
      spellUseCostEntries.push(...bdSp.entries);
    }
    const spellUseCostStack: EffectStack | undefined = spellUseCostEntries.length > 0
      ? (ctx.bs.effect_stack
        ? pushToStack(ctx.bs.effect_stack, spellUseCostEntries)
        : initStack(ctx.bs.active_user_id ?? p.actorId, spellUseCostEntries))
      : undefined;
    await ctx.io.commit(reduceBattle(ctx.bs, {
      type: 'QUEUE_SPELL',
      casterKey: stateKey,
      casterState: newMyState,
      spell,
      ...(removedVirusCount > 0 ? { other: { key: actorIsHost ? 'guest_state' : 'host_state', state: newOpState } } : {}),
      ...(spellUseCostStack ? { effectStack: spellUseCostStack } : {}),
    }));
  } finally {
    ctx.io.setLoading(false);
  }
};
