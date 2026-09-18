import { coinLedger } from '../../../engine/coinAbilityNegation';
import { applyCoinGain } from '../../../engine/coinGain';
import { checkActiveCondition, collectCopiedLrigAutoEffects, collectGrowCostSubstitute, collectGrowPayOptions, growPayCandidateHandIndices, collectGrowCostReductions } from '../../../engine/effectEngine';
import { getCardNum } from '../../../engine/effectExecutor';
import { initStack, pushToStack } from '../../../engine/effectStack';
import { recordEnergyPlacements } from '../../../engine/energyPlacement';
import { applyAbilityCostReduction, collectCoinGainedTriggers as pureCollectCoinGainedTriggers, collectCoinPaidTriggers as pureCollectCoinPaidTriggers, collectLrigGrowTriggers as pureCollectLrigGrowTriggers, collectOptionalNoCostOnPlayForGrow } from '../../../engine/triggerCollect';
import { type CardData, type PlayerState, type StackEntry } from '../../../types';
import { type CardEffect } from '../../../types/effects';
import { buildArtsPayerCtx } from '../artsUseGate';
import { generateUUID } from '../battleUtils';
import { type PlayerStateKey, reduceBattle } from '../controller/battleController';
import { applyGrowCostReduction, isEnergyPaymentSelectionValid, parseCoinCost, parseGrowCost } from '../costs';
import { type EnergyPayEntry, buildEnergyPayPool, planEnergyPayment } from '../energyPaySource';
import { computeFieldSigniLimit } from '../fieldLimit';
import { applyGrowEffect, extractGrowCondition } from '../growLogic';
import { consumeFreeGrowThisTurn } from '../turnScopedState';
import type { PerformCtx } from './performCtx';

/**
 * 🆕§5.7 `S-5c` 第2段（2026-09-18）＝`BattleScreen` から**逐語で移設**し、I/O と材料（`PerformCtx`）を注入にした。
 * ⚠可否の判定はここに書かない（`*Gate.ts`）。
 */
/** ON_COIN_PAID の usedIds（《ターン1回/2回》消化）を payer 状態の actions_done へ書き戻す（旧 `BattleScreen` の1行ヘルパ）。 */
const applyCoinPaidUsed = (st: PlayerState, coin: { usedIds: string[] }): PlayerState =>
  coin.usedIds.length > 0 ? { ...st, actions_done: [...(st.actions_done ?? []), ...coin.usedIds] } : st;

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
export const performGrow = async (
  card: CardData,
  costIndices: Set<number>,
  options: {
    instanceId?: string;
    baseState?: PlayerState;
    freeCost?: boolean;
    consumeGrowAction?: boolean;
    extraEntries?: StackEntry[];
    opponentState?: PlayerState;
    /**
     * 🆕§5.3 `O-83`＝**このグロウ1回だけ**、グロウ先ルリグの【出】能力を発動させない
     * （`SP38-001-E1`「この方法でグロウしたルリグの【出】能力は発動しない」）。
     * ⚠`PlayerState.suppress_center_on_play`（ターン全体）とは別軸＝state に焼き付けない。
     */
    suppressOnPlayOnce?: boolean;
    /**
     * 🆕**§5.3 `O-248`（2026-09-05）＝グロウ先カード自身の「捨ててもよい」任意コストで捨てる手札の index。**
     * （`WX21-017`「手札から＜天使＞のシグニを2枚捨ててもよい。そうした場合、コストは《青×0》になる」）
     * 🔴**軽減の適用とセットでしか渡してはいけない**＝片方だけだと
     *   「捨てたのに安くならない」／「捨てずに安くなる」のどちらかになる。
     */
    growPayDiscardHandIdx?: number[];
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
    /**
     * 🆕§5.7 `S-5c` 第2段＝コスト付き【出】の確認モーダルを開く（画面のみ）。
     * ⚠`onCostOnPlay:'prompt'`（人間）のときだけ呼ばれる＝CPU（`'auto'`）は来ない。
     */
    openOnPlayCost?: (a: {
      cardNum: string; costEffect: CardEffect; placedState: PlayerState;
      mandatoryEntries: StackEntry[]; remainingCostEffects: CardEffect[];
    }) => void;
    /** 既定の `freeCost` 判定（人間UIの `freeGrowFilter`）。CPU は渡さない＝常に通常グロウ。 */
    defaultFreeCost?: boolean;
  },
  ctx: PerformCtx,
) => {
  const my = p.actor;
  const op = p.opponent;
  const actorIsHost = p.actorKey === 'host_state';
  if (!p.isActorTurn) return;
  ctx.io.setLoading(true);
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
    const growPool = growBase === my ? p.energyPayPool : buildEnergyPayPool(growBase, { turnPhase: ctx.bs.turn_phase, isMyTurn: p.isActorTurn, effectsMap: ctx.effectsMap });
    const growPay = planEnergyPayment(growBase, growPool, costIndices);
    const paidNums = [...growPay.paidNums];
    // GROW_COST_SUBSTITUTE_TRASH_SIGNI: 選択枚数が totalReq-1 なら代替シグニをトラッシュ
    const growSubInfoExec = wasFreeGrow ? null : collectGrowCostSubstitute(growBase, ctx.cardMap, ctx.effectsMap);
    // 🆕**§5.3 `O-248`**＝任意コスト（手札を捨てる）を実際に払ったぶんの軽減を足す。
    //   ⚠**払った枚数が足りていなければ足さない**＝UI 側の検証をここでも通す（直呼び対策）。
    const growPayIdxExec = options.growPayDiscardHandIdx ?? [];
    const growPayOptExec = growPayIdxExec.length > 0
      ? collectGrowPayOptions(card.CardNum, ctx.effectsMap, ctx.cardMap)
        .find(o => o.handDiscard.count === growPayIdxExec.length)
      : undefined;
    const growPayNums = growPayOptExec
      ? growPayIdxExec.map(i => growBase.hand[i]).filter((n): n is string => !!n)
      : [];
    const growPayValidExec = !!growPayOptExec && growPayNums.length === growPayOptExec.handDiscard.count
      && growPayIdxExec.every(i => growPayCandidateHandIndices(growBase, growPayOptExec, ctx.cardMap).includes(i));
    const growPayReductions = growPayValidExec && growPayOptExec ? growPayOptExec.reduction : [];
    const growCostStrExec = applyGrowCostReduction(card.GrowCost, [
      ...collectGrowCostReductions(growBase, growOp, p.isActorTurn, ctx.effectsMap, ctx.cardMap, card.CardNum),
      ...growPayReductions,
    ]);
    const costItemsExec = parseGrowCost(growCostStrExec);
    const totalReqExec = costItemsExec.reduce((s, c) => s + c.count, 0);
    // `O-342`＝通常の一括代替とグロウ専用代替が同時に成立する盤面では、選択した《オサキ》を
    // 一括代替として優先する。ここを見ずに下の専用代替も自動適用すると、2枚を二重に支払う。
    const growPayerExec = buildArtsPayerCtx({
      actor: growBase, opponent: growOp, isActorTurn: p.isActorTurn,
      turnPhase: ctx.bs.turn_phase, cardMap: ctx.cardMap, effectsMap: ctx.effectsMap,
    });
    const selectedGrowNumsExec = [...costIndices].map(i => growPool[i]?.cardNum).filter((n): n is string => !!n);
    const usesWholeGrowSubstitute = costIndices.size < totalReqExec && isEnergyPaymentSelectionValid({
      selectedEnergyNums: selectedGrowNumsExec, cards: ctx.cards, baseCost: growCostStrExec,
      keywordGrants: growBase.keyword_grants, allMulti: growPayerExec.enaAllMulti,
      stripped: growPayerExec.enaMultiStripped, colorlessOverrides: growPayerExec.colorlessOverrides,
      colorSubs: growPayerExec.colorSubs, extraColorMap: growPayerExec.energyExtraColors,
      trashSubWilds: growPayerExec.energyTrashSubInfo.wildcardInstIds,
      trashSubColors: growPayerExec.energyTrashSubInfo.colorOverrideMap,
      banColorlessPay: growBase.cannot_pay_colorless_this_attack_phase,
      wholeSubstitutes: growPayerExec.wholeEnergySubstitutes,
      requiredSelectionCount: totalReqExec,
    });
    let growSubSigniPaid: string | null = null;
    if (!usesWholeGrowSubstitute && growSubInfoExec && costIndices.size === totalReqExec - 1) {
      const subSigni = growPay.energyAfter.find(cn => {
        const c = ctx.cardMap.get(cn);
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
    // 🆕**§5.3 `O-318`（2026-09-12）＝グロウで得るコインも `applyCoinGain` を通す。**
    // 🔴旧はここで直に足しており、**「このゲーム、あなたは《コイン》を得られない」が素通り**していた
    //   （禁止は engine の `GAIN_COIN` の1箇所でしか効いていなかった）。⚠支払いを先に引いてから獲得を当てる。
    const growCoinsAfter = applyCoinGain(
      { ...growBase, coins: Math.max(0, growBase.coins - growCoinCost) }, coinGain).state;
    let newMyState: PlayerState = consumeFreeGrowThisTurn(growPay.applyTo({
      ...growBase,
      lrig_deck: newLrigDeck,
      field: { ...growBase.field, lrig: [...growBase.field.lrig, instanceId] },
      // §6.4 O-10（続き515）＝「このターンにあなたのセンタールリグがグロウしていない場合」の判定材料。
      lrig_grew_this_turn: true,
      // 🆕**§5.3 `O-242`（2026-09-04）**＝「それがそのターンであなたの**最初の**グロウである場合」の判定材料。
      //   ⚠bool では足りない（グロウと同時に true になるので、後段からは常に true に見える）。
      lrig_grow_count_this_turn: (growBase.lrig_grow_count_this_turn ?? 0) + 1,
      // 🆕**§5.3 `O-248`**＝任意コストで捨てた手札もトラッシュへ（エナ支払いと同じ行き先）。
      // 🔴**手札から抜く条件とトラッシュへ積む条件は必ず同じ式にする**（2026-09-05・実機が検出）＝
      //   旧版は抜く側だけ `growPayNums.length > 0`、積む側だけ `growPayValidExec` で見ていたので、
      //   検証に落ちた瞬間に**カードが手札からもトラッシュからも消える**（カードがゲームから蒸発する）。
      hand: growPayValidExec
        ? growBase.hand.filter((_, i) => !growPayIdxExec.includes(i))
        : growBase.hand,
      trash: [...growBase.trash, ...paidNums, ...(growPayValidExec ? growPayNums : [])],
      actions_done: consumeGrowAction ? [...(growBase.actions_done ?? []), 'GROW'] : (growBase.actions_done ?? []),
      // ⚠**state 丸ごとを spread しない**（この後ろに書くと上のキーを全部巻き戻す）＝2キーだけ取る。
      coins: growCoinsAfter.coins ?? 0,
      coins_gained_this_game: growCoinsAfter.coins_gained_this_game,
      coins_paid_this_turn: (growBase.coins_paid_this_turn ?? 0) + growCoinCost, // COINS_PAID_THIS_TURN（支払いのみ・coinGain は数えない）
    }));
    // 代替シグニ（GROW_COST_SUBSTITUTE_TRASH_SIGNI）はカード番号で除く＝funnel の index 控除のあとに当てる
    if (growSubSigniPaid) {
      newMyState = { ...newMyState, energy: newMyState.energy.filter(cn => cn !== growSubSigniPaid) };
    }
    // グロウ条件の追加効果（ルリグをデッキから下に置く・除外する等）
    const growCond = extractGrowCondition(card.EffectText);
    const { state: afterGrowEffect, log: growEffectLog } = applyGrowEffect(growCond, newMyState, ctx.cardMap);
    newMyState = afterGrowEffect;
    const stateKey = p.actorKey;
    // LIMIT_ALL_FIELD_N（WX04-005-E3 補足）: グロウ先がこの継続効果を持つなら、各プレイヤーが
    //「自分のシグニを超過分だけ選んでトラッシュに置く」（残り上限体）。スタックに積んで選択させる。
    const grownFieldLimit = computeFieldSigniLimit(newMyState, growOp, ctx.effectsMap, getCardNum);
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
          } as import('../../../types/effects').CardEffect,
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
    // 🆕**§5.3 `O-242`（2026-09-04）**＝「あなたのルリグがグロウしたとき、それが**そのターンで
    //   あなたの最初のグロウである場合**、【エナチャージN】をする」（`WXDi-P03-002-E1`）。
    //   🔴旧実装は `DEFERRED_GAIN_ABILITY_THIS_GAME_QUOTED`＝**無言 no-op** だった。
    //   ⚠**「最初のグロウ」を落とさない**＝落とすとグロウのたびにエナチャージする過大実行になる。
    const firstGrowEnaN = newMyState.game_first_grow_energy_charge ?? 0;
    if (firstGrowEnaN > 0 && (newMyState.lrig_grow_count_this_turn ?? 0) === 1 && newMyState.deck.length > 0) {
      const charged = newMyState.deck.slice(0, firstGrowEnaN);
      // 🆕§5.3 `O-321` 第275＝台帳へ（`cause:'rule'`）。
      newMyState = recordEnergyPlacements({ ...newMyState, deck: newMyState.deck.slice(charged.length), energy: [...newMyState.energy, ...charged] }, charged, 'rule');
      logs.push(`このターン最初のグロウ：【エナチャージ${charged.length}】（このゲーム）`);
    }
    ctx.io.appendLogs(logs);

    // ルリグの ON_PLAY 効果を確認（COPY_LRIG_NAME_ABILITYコピー効果も含む）
    const ownEffects = ctx.effectsMap.get(cardNum) ?? [];
    // SUPPRESS_CENTER_ON_PLAY: このターンセンタールリグの【出】能力を抑制
    const suppressLrigPlay = newMyState.suppress_center_on_play === true || options.suppressOnPlayOnce === true;
    const copiedOnPlayEffects = suppressLrigPlay ? [] : collectCopiedLrigAutoEffects(newMyState, ctx.cardMap, ctx.effectsMap, growOp, p.isActorTurn)
      .filter(e => e.timing?.includes('ON_PLAY'));
    const allOnPlayEffects = suppressLrigPlay ? [] : [...ownEffects, ...copiedOnPlayEffects];
    const mandatoryOnPlay = allOnPlayEffects.filter(e =>
      e.effectType === 'AUTO' &&
      e.timing?.includes('ON_PLAY') &&
      e.mandatory !== false &&
      // activeCondition（英知=N等）を満たさない【出】は発火しない
      (!e.activeCondition || checkActiveCondition(e.activeCondition, newMyState, growOp, true, ctx.cardMap, cardNum)),
    );
    const costOnPlay = allOnPlayEffects.filter(e =>
      e.effectType === 'AUTO' &&
      e.timing?.includes('ON_PLAY') &&
      e.mandatory === false &&
      e.cost,
    // 「〈盤面条件〉の場合、この能力の発動コストは《X×N》減る」を**提示前に**焼き込む（§6.4 O-35・続き530）。
    // ここ1点で削るので、モーダル表示・支払い・可否判定がすべて同じ削減後コストを見る。
    ).map(e => applyAbilityCostReduction(e, newMyState, growOp, ctx.cardMap, cardNum, ctx.bs.turn_phase, ctx.effectivePowers));
    const optionalNoCostGrow = collectOptionalNoCostOnPlayForGrow(
      allOnPlayEffects, newMyState, growOp, true, ctx.cardMap, cardNum, ctx.bs.turn_phase, ctx.effectivePowers,
    );
    // costUnparsed など、包むとコスト踏み倒しになるものだけは発火させず警告する。
    if (optionalNoCostGrow.deferred.length > 0) {
      console.warn(`[executeGrow] 表現不能コストの任意ON_PLAY効果は発火しません: ${optionalNoCostGrow.deferred.map(e => e.effectId).join(', ')}`);
    }
    if (suppressLrigPlay) ctx.io.appendLogs(['センタールリグの【出】能力は抑制されました']);

    // ON_LRIG_GROW（C1 配線）: センターグロウ実行者（`p.actorId`）のグロウに反応する【自】を収集。
    // any_opp（対戦相手のルリグがグロウ）は非ターンプレイヤー側＝effect_stack の opp 側は
    // buildQueue（effectStack.ts）で `[...turn, ...opp]` の順に並ぶため、グロウ先ルリグ自身の
    // 【出】（ON_PLAY・ターンプレイヤー側）が先に解決され any_opp watcher は後で処理される
    // （2026-07-12・PLAN §7 ON_LRIG_GROW③検証で訂正＝旧コメントは順序を逆に記載していた誤り。
    // golden「Stage2 effectStack initStack: ターンプレイヤー→相手の順でキュー構築」参照）。
    const growTrig = pureCollectLrigGrowTriggers(ctx.trigCtx(), p.actorId, newMyState, growOp);
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
      ? pureCollectCoinGainedTriggers(ctx.trigCtx(), p.actorId, newMyState, growOp, growCoinGainActual, 0)
      : { entries: [] as StackEntry[], usedOncePerTurnIds: [] as string[] };
    const growCoinGainOpp = growCoinGainActual > 0
      ? pureCollectCoinGainedTriggers(ctx.trigCtx(), p.opponentId, growOp, newMyState, 0, growCoinGainActual)
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
    const growCoin = growCoinCost > 0 ? pureCollectCoinPaidTriggers(ctx.trigCtx(), p.actorId, newMyState, growOp) : { entries: [] as StackEntry[], usedIds: [] as string[] };
    const growCoinPaidEntries = growCoin.entries;
    newMyState = applyCoinPaidUsed(newMyState, growCoin); // 《ターン1回/2回》消化を actions_done に永続化


    // ⚠CPU（`onCostOnPlay:'auto'`）は**モーダルを出せない**（出すと人間の画面に相手のモーダルが出る）＝
    //   **コインだけで払えるものは自動で払って発動し、それ以外は発動しない**。
    //   これは CPU 手書きグロウ（続き552d で削除）の挙動をそのまま移したもの。
    const autoPaidOnPlay: import('../../../types/effects').CardEffect[] = [];
    if (p.onCostOnPlay === 'auto') {
      for (const eff of costOnPlay) {
        const coinOnly = !!eff.cost?.coin && !eff.cost.energy && !eff.cost.discard;
        if (!coinOnly || (newMyState.coins ?? 0) < eff.cost!.coin!) continue;
        newMyState = {
          ...newMyState,
          coins: (newMyState.coins ?? 0) - eff.cost!.coin!,
          coins_paid_this_turn: (newMyState.coins_paid_this_turn ?? 0) + eff.cost!.coin!,
          // 🆕§5.3 `O-317`/`O-333`＝CPU がコインだけで自動発動した【出】コイン技も同じ台帳へ。
          coin_abilities_used_this_turn: [...(newMyState.coin_abilities_used_this_turn ?? []), ...coinLedger(eff)],
        };
        ctx.io.appendLogs([`《コイン》×${eff.cost!.coin}を支払って【出】効果を発動`]);
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
      p.openOnPlayCost?.({
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
      await ctx.io.commit(reduceBattle(ctx.bs, { type: 'WRITE_STATE', myKey: stateKey, myState: newMyState, opp: opAfterGrow ? { key: opKeyGrow, state: opAfterGrow } : undefined }));
      return;
    }
    const turnPlayerId = ctx.bs.active_user_id ?? p.actorId;
    const existing = ctx.bs?.effect_stack ?? null;
    const stack = existing ? pushToStack(existing, entries) : initStack(turnPlayerId, entries);
    await ctx.io.commit(reduceBattle(ctx.bs, { type: 'WRITE_STATE', myKey: stateKey, myState: newMyState, effectStack: stack, clearPending: true, opp: opAfterGrow ? { key: opKeyGrow, state: opAfterGrow } : undefined }));
  } finally {
    ctx.io.setLoading(false);
  }
};
