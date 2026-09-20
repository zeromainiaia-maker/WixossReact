/* eslint-disable @typescript-eslint/no-explicit-any */
import { isReadyToResolve, confirmTurnOrder, confirmOppOrder } from '../../../engine/effectStack';
import type { BattleStateRow, CardData, PendingEffect } from '../../../types';
import { CPU_PLAYER_ID } from '../battleUtils';
import { normalizeCpuDeckPlan, type CpuDeckPlan } from '../cpuDeckPlan';
import { DEFAULT_CPU_POLICY, type CpuPolicy } from '../cpuPolicy';
import { cpuShouldAct, cpuWaitingForHuman } from '../cpuDriver';
import { decideCpuInteractionResponse } from '../cpuInteractionRespond';
import { createHeadlessIo } from './battleIo';
import { reduceBattle } from './battleController';
import { buildBaseEffectsMap, buildBattleMaterials } from './battleMaterials';
import { makeBoardDiffCollector } from './boardDiffTriggers';
import { cpuTurnAction, type CpuTurnActions, type CpuTurnDeps } from './cpuTurn';
import { handleCutinPass as handleCutinPassImpl } from './cutinPass';
import { makeEffectInteractionHandlers } from './effectInteraction';
import { makeTrigCtx } from './execCtxDeps';
import { createMemoryPersist, type MemoryBattlePersist } from './memoryPersist';
import { performArts as performArtsImpl } from './performArts';
import { performAssistGrow as performAssistGrowImpl } from './performAssistGrow';
import type { PerformCtx } from './performCtx';
import { performGrow as performGrowImpl } from './performGrow';
import { performGuardResponse as performGuardResponseImpl } from './performGuardResponse';
import { performKeyPiece as performKeyPieceImpl } from './performKeyPiece';
import { performLifeBurstResponse as performLifeBurstResponseImpl } from './performLifeBurstResponse';
import { performLrigActivated as performLrigActivatedImpl } from './performLrigActivated';
import { performLrigAttack as performLrigAttackImpl } from './performLrigAttack';
import { performSigniActivated as performSigniActivatedImpl } from './performSigniActivated';
import { performSigniAttack as performSigniAttackImpl } from './performSigniAttack';
import { performSpell as performSpellImpl } from './performSpell';
import { performSummonSigni as performSummonSigniImpl } from './performSummonSigni';
import { resolvePendingSigniBattleFor as resolvePendingSigniBattleForImpl } from './resolveSigniBattle';
import { makeRuleChecks, createRuleCheckMemo, type RuleCheckMemo } from './ruleChecks';
import { resolveStackStep } from './stackResolve';

/**
 * 🆕**ヘッドレスの対戦ループ**（§5.7 `S-5d` 第3段・2026-09-19）＝**画面なしで CPU 同士を回す**。
 *
 * ■ **何が揃ったか**＝`S-5a`〜`S-5c` で engine 側（スタック解決・盤面差分・実行関数・`cpuTurnAction`）、
 *   第1段で**対話の解決**、第2段で**CPU の対話応答の振り分け**、この段で**材料**（`battleMaterials.ts`）と
 *   **ルール処理8本**（`ruleChecks.ts`）が `controller/` に出そろった。ここはそれらを**画面の `useEffect` と同じ順で回す**だけ。
 * ■ **画面との対応**＝1回の `step()` が、画面の「盤面が変わる → どれかの `useEffect` が1つ動く」1手に相当する。
 *   🔑**順番は画面の `useEffect` の並びと同じ**（対話 → 整列 → スタック → ルール処理 → CPU の1手）＝
 *   ここを並べ替えると人間の対戦と挙動が割れる。
 *
 * 🔴**席の鏡（`mirrorSeats`）が「人間側ターンの駆動」**＝`cpuTurnAction` は
 *   **`guest_state` ＝ `CPU_PLAYER_ID` を前提に書かれている**（40箇所）ので、host 席を CPU に指させるには
 *   **盤面を鏡にして渡し、書き戻しを鏡で戻す**。⚠鏡は**入れ替えを2回すると元に戻る**（involution）＝
 *   パッチ側も同じ関数で戻せる。ここに「host 用の CPU」を別に書かない（２つ目の CPU は必ずズレる）。
 *
 * ⚠**クライアントは常に host 席**＝実機の CPU 戦（人間＝host のクライアントが CPU 側も処理する）と同じ。
 *   ルール処理・対話の解決はこの視点で回す（鏡を使うのは `cpuTurnAction` の1本だけ）。
 * ⚠**待ち時間は持ち込まない**＝`setTimeout`／`CPU_ACTION_DELAY` はここには無い（自己対戦が実時間に縛られる）。
 */

/** `step()` が「何をしたか」。`idle` は**誰も動かなかった**＝呼び出し側が止め時を決める。 */
export type HeadlessStepKind = 'interaction' | 'order' | 'stack' | 'rule' | 'cpu' | 'idle' | 'finished';

export interface HeadlessMatch {
  persist: MemoryBattlePersist;
  row: () => BattleStateRow;
  /** これまでに積まれた対戦ログ（画面の `appendBattleLogs` に相当）。 */
  logs: string[];
  /** 1手だけ進める。 */
  step: () => Promise<HeadlessStepKind>;
  /**
   * 決着（`winner_id`）か手詰まり（`idle`）まで回す。
   * ⚠`cap` は**安全弁**＝自己対戦では必ず異常（無限ループの疑い）。
   */
  run: (maxSteps?: number) => Promise<{ steps: number; reason: 'finished' | 'idle' | 'cap' }>;
}

export interface HeadlessMatchDeps {
  /** 全カード（画面の props の `cards` に相当）。 */
  cards: CardData[];
  /** CPU デッキの作戦データ（§5.7 `S-2`）。省略時は既定。 */
  cpuPlan?: CpuDeckPlan;
  /**
   * 🆕§5.7 `S-23`＝**席ごとの作戦データ**（省略時は `cpuPlan`）。
   *
   * 🔴**これが無いと「本物のデッキ同士」を測れない**＝作戦データ（キーカード・優先札・コンボ）は
   *   **デッキごとに違う**ので、両席で1つを共有すると**相手のデッキのキーカードを自分の判断に使う**。
   * ⚠`policy` と同じ形（席のキー）で持つ＝A/B の席入れ替えは呼び出し側（`scripts/headlessSelfPlay.ts`）の仕事。
   */
  cpuPlans?: { host: CpuDeckPlan; guest: CpuDeckPlan };
  /** ルール処理の二重処理防止の指紋（省略時は新規）。 */
  memo?: RuleCheckMemo;
  /**
   * 🆕§5.7 `S-9`＝**席ごとの CPU ポリシー**（省略時は両席とも既定）。
   *
   * 🔴**これが無いと勝率は「先攻有利と乱数」しか映さない**＝両席が同じ関数・同じ定数で打つので対称。
   * ⚠**席を入れ替えてもう1戦する**のは呼び出し側（`scripts/headlessSelfPlay.ts` の A/B モード）の仕事＝
   *   ここは「どちらの席にどのポリシーを当てるか」だけを受ける。
   */
  policy?: { host: CpuPolicy; guest: CpuPolicy };
  /** 🆕§5.7 `S-15`＝候補列挙の観測フック（両席とも・計測専用＝`scripts/headlessSelfPlay.ts --census-moves`）。 */
  observeMoves?: CpuTurnDeps['observeMoves'];
  observeChoice?: CpuTurnDeps['observeChoice'];
}

/**
 * **席の鏡**＝host 席と guest 席を入れ替えた見え方を作る（`cpuTurnAction` に host 席を指させるため）。
 *
 * 🔑**2回かけると元に戻る**（involution）ので、`cpuTurnAction` が書いたパッチも同じ関数で実座標へ戻せる。
 * ⚠**ID は「完全一致する文字列」だけ入れ替える**＝部分一致で置換すると `#g` 付きの instance ID や
 *   ログの文面まで巻き込む。⚠盤面のキー（`granted_effects` の instance ID）は入れ替えない。
 */
export function mirrorSeats<T extends Record<string, any>>(obj: T, hostId: string, guestId: string): T {
  const swapStr = (v: string) => (v === hostId ? guestId : v === guestId ? hostId : v);
  const deep = (v: any): any => {
    if (typeof v === 'string') return swapStr(v);
    if (Array.isArray(v)) return v.map(deep);
    if (v && typeof v === 'object') {
      const out: Record<string, any> = {};
      for (const [k, val] of Object.entries(v)) out[k] = deep(val);
      return out;
    }
    return v;
  };
  const swapped = deep(obj) as Record<string, any>;
  // ⚠**対になっている列だけを入れ替える**（`host_*` ↔ `guest_*`）。片方しか無いパッチでも成立させる。
  const PAIRS: [string, string][] = [
    ['host_id', 'guest_id'], ['host_state', 'guest_state'],
    ['host_lrig_selected', 'guest_lrig_selected'], ['host_janken', 'guest_janken'],
    ['host_mulligan_done', 'guest_mulligan_done'], ['host_end_ack', 'guest_end_ack'],
  ];
  const out: Record<string, any> = { ...swapped };
  for (const [a, b] of PAIRS) {
    const hasA = a in swapped, hasB = b in swapped;
    if (!hasA && !hasB) continue;
    if (hasB) out[a] = swapped[b]; else delete out[a];
    if (hasA) out[b] = swapped[a]; else delete out[b];
  }
  return out as T;
}

export function createHeadlessMatch(initial: BattleStateRow, d: HeadlessMatchDeps): HeadlessMatch {
  // 🔴**guest 席は必ず `CPU_PLAYER_ID`**＝`cpuTurnAction` も `cpuDriver` もこの定数で「CPU の席」を見分ける
  //   （違う ID だと**どちらの席も動かず `idle` で止まる**＝黙って1手も進まないので、ここで落とす）。
  if (initial.guest_id !== CPU_PLAYER_ID) {
    throw new Error(`createHeadlessMatch: guest_id は CPU_PLAYER_ID である必要がある（${initial.guest_id}）`);
  }
  const persist = createMemoryPersist(initial);
  const { io, logs } = createHeadlessIo(persist);
  const row = () => persist.current()!;
  const cpuPlan = d.cpuPlan ?? normalizeCpuDeckPlan(undefined);
  /** 🆕§5.7 `S-23`＝その席の作戦データ（`cpuPlans` が無ければ従来どおり1つを共有）。 */
  const planFor = (seat: 'host' | 'guest') => d.cpuPlans?.[seat] ?? cpuPlan;
  const memo = d.memo ?? createRuleCheckMemo();
  // 🔑**静的な効果表は1回だけ組む**＝これを毎回作ると全カードの parse を1手に何度も払う（試運転で 120秒/1手）。
  const uniqCards = [...new Map(d.cards.map(c => [c.CardNum, c] as const)).values()];
  let baseEffectsMapCache: ReturnType<typeof buildBaseEffectsMap> | null = null;
  // 盤面（オブジェクト同一）と視点ごとの材料の使い回し＝1手の中で ctx を何度作っても組み直さない。
  const matCache = new WeakMap<BattleStateRow, Map<string, ReturnType<typeof buildBattleMaterials>>>();

  /** 1つの盤面から `PerformCtx` を作る（画面の `performCtx()` と同じ形）。 */
  const ctxOf = (bs: BattleStateRow, userId: string, writeIo = io): PerformCtx => {
    baseEffectsMapCache ??= buildBaseEffectsMap(uniqCards);
    let perSeat = matCache.get(bs);
    if (!perSeat) { perSeat = new Map(); matCache.set(bs, perSeat); }
    let m = perSeat.get(userId);
    if (!m) {
      m = buildBattleMaterials({ bs, cards: uniqCards, userId, baseEffectsMap: baseEffectsMapCache });
      perSeat.set(userId, m);
    }
    const isHost = userId === bs.host_id;
    const trigCtx = () => makeTrigCtx({
      bs, effectsMap: m.effectsMap, cardMap: m.cardMap, effectivePowers: m.effectivePowers, userId,
    });
    return {
      bs, cardMap: m.cardMap, effectsMap: m.effectsMap, baseEffectsMap: m.baseEffectsMap,
      cards: d.cards, userId, isHost, effectivePowers: m.effectivePowers, trigCtx,
      collectBoardDiff: (afterHost, afterGuest, meta) => makeBoardDiffCollector({
        bs, cardMap: m.cardMap, effectsMap: m.effectsMap, isHost, userId, trigCtx,
      })(afterHost, afterGuest, meta),
      io: writeIo,
    };
  };
  /** クライアント視点（実機の CPU 戦と同じ＝host 席のクライアントが両側を処理する）。 */
  const clientCtx = () => ctxOf(row(), row().host_id);

  /** CPU の「行動の口」＝人間と同じ実行関数に材料を足すだけ（画面のラッパと同じ形・UI コールバックは無い）。 */
  const actionsFor = (ctx: () => PerformCtx): CpuTurnActions => {
    const wrap = <F extends (...a: any[]) => any>(fn: F) =>
      ((...args: any[]) => fn(...args, ctx())) as any;
    return {
      performSummonSigni: wrap(performSummonSigniImpl),
      performGrow: wrap(performGrowImpl),
      performArts: wrap(performArtsImpl),
      performKeyPiece: wrap(performKeyPieceImpl),
      performAssistGrow: wrap(performAssistGrowImpl),
      performSpell: wrap(performSpellImpl),
      performSigniAttack: wrap(performSigniAttackImpl),
      performLrigAttack: wrap(performLrigAttackImpl),
      performGuardResponse: wrap(performGuardResponseImpl),
      performLifeBurstResponse: wrap(performLifeBurstResponseImpl),
      performSigniActivated: wrap(performSigniActivatedImpl),
      performLrigActivated: wrap(performLrigActivatedImpl),
      resolvePendingSigniBattleFor: wrap(resolvePendingSigniBattleForImpl),
      // ⚠ピースのカットイン解決（画面の `resolvePendingPiece`）は画面の口＝ヘッドレスでは見送りだけを行う。
      handleCutinPass: () => handleCutinPassImpl(ctx(), {
        closeCutin: () => {}, openFreeGrow: () => {}, resolvePendingPiece: async () => {}, loading: false,
      }),
    };
  };

  /** CPU の対話応答（どちらの席の CPU でも、その席の ID で決める）。 */
  const answerInteraction = async (bs: BattleStateRow, pe: PendingEffect): Promise<boolean> => {
    const ctx = clientCtx();
    const responderId = pe.respondPlayerId ?? pe.sourcePlayerId;
    const res = decideCpuInteractionResponse(pe, {
      cpuPlayerId: responderId, hostId: bs.host_id,
      hostState: bs.host_state, guestState: bs.guest_state,
      cards: d.cards, cardMap: ctx.cardMap, effectsMap: ctx.effectsMap,
      // 🆕§5.7 `S-23`＝**答える席の作戦データ**で答える（対話は両席の CPU が答えるため）。
      cpuPlan: planFor(responderId === bs.host_id ? 'host' : 'guest'),
    });
    if (!res) return false;
    const h = makeEffectInteractionHandlers(ctx, { loading: false });
    if (res.kind === 'rearrange') await h.handleRearrangeSigniConfirm(res.arrangement);
    else if (res.kind === 'allocate') await h.handleAllocatePowerConfirm(res.alloc);
    else if (res.kind === 'virusZone') await h.handleSelectVirusZoneForEffect(res.zone);
    else if (res.kind === 'signiZone') await h.handleSelectSigniZoneForEffect(res.zone);
    else if (res.kind === 'zone') await h.handleSelectZoneForEffect(res.zone);
    else {
      if (res.logs.length > 0) io.appendLogs(res.logs);
      await h.handleEffectInteraction(res.selected);
    }
    return true;
  };

  /** 効果スタックの整列（画面では CPU が自動確定・人間はモーダル）。ヘッドレスは**両席ともキュー順で確定**する。 */
  const confirmOrderIfNeeded = async (bs: BattleStateRow): Promise<boolean> => {
    const stack = bs.effect_stack;
    if (!stack) return false;
    const turnNeeds = !stack.orderTurnDone && stack.pendingTurn.length > 1;
    const oppNeeds = !stack.orderOppDone && stack.pendingOpp.length > 1;
    if (!turnNeeds && !oppNeeds) return false;
    const pending = turnNeeds ? stack.pendingTurn : stack.pendingOpp;
    const orderedIds = pending.map(e => e.id);
    const newStack = turnNeeds ? confirmTurnOrder(stack, orderedIds) : confirmOppOrder(stack, orderedIds);
    await persist.commit(reduceBattle(bs, { type: 'SET_STACK', stack: newStack, settle: true }));
    return true;
  };

  /** スタックの先頭1件を解決する（画面の `resolveStackNext` と同じ形＝本体は `resolveStackStep`）。 */
  const resolveStackOnce = async (bs: BattleStateRow): Promise<boolean> => {
    const stack = bs.effect_stack;
    if (!stack || !isReadyToResolve(stack) || stack.queue.length === 0) return false;
    const ctx = clientCtx();
    const step = resolveStackStep(bs, {
      cardMap: ctx.cardMap, effectsMap: ctx.effectsMap, userId: ctx.userId,
      isHost: ctx.isHost, effectivePowers: ctx.effectivePowers,
    });
    if (!step) return false;
    if (step.logs.length > 0) io.appendLogs(step.logs);
    await persist.commit(reduceBattle(bs, step.action));
    return true;
  };

  /**
   * ルール処理8本（画面の `useEffect` の並び・**同じ発火条件**で回す）。
   * 🔑**条件も画面から写す**＝`active_user_id === user.id` 等を落とすと、実機では回らない場面で回って挙動が割れる。
   */
  const runRuleChecks = async (bs: BattleStateRow): Promise<boolean> => {
    const before = persist.commitCount();
    const rc = () => makeRuleChecks(clientCtx(), { loading: false, isCpuBattle: true, memo });
    const meIsHost = true;                                   // クライアントは host 席
    const me = meIsHost ? bs.host_state : bs.guest_state;
    const isMyTurn = bs.active_user_id === bs.host_id;
    const stackBusy = !!bs.effect_stack || !!bs.pending_effect;
    if (bs.global_phase !== 'PLAYING') return false;
    if (!stackBusy && !me.field?.check && (me.pending_crashed_cards?.length ?? 0) > 0) await rc().triggerPendingCrash();
    if (!stackBusy && isMyTurn) await rc().checkAndBanishPowerZero();
    if (!stackBusy && !bs.pending_spell && bs.turn_phase !== 'UP') await rc().checkDeferredRefreshRule();
    if (!stackBusy && !bs.pending_spell && bs.turn_phase !== 'UP' && isMyTurn) await rc().checkRefreshForcedTurnEnd();
    if (!stackBusy && !bs.pending_spell) await rc().checkLimitExcessRule();
    if (!stackBusy && isMyTurn) await rc().checkAndApplyContMutations();
    // ⚠バトル解決は画面も「薄いラッパ」しか持っていない（本体は `resolveSigniBattle.ts`）＝同じ1本を直接呼ぶ。
    if (!stackBusy && me.pending_signi_battle) await resolvePendingSigniBattleForImpl(
      me, bs.guest_state, 'host_state', bs.host_id, bs.guest_id, clientCtx());
    if (!stackBusy && me.pending_lrig_attack) await rc().resolvePendingLrigAttack();
    return persist.commitCount() > before;
  };

  /**
   * CPU の1手（guest 席はそのまま／host 席は**席の鏡**を通して同じ関数に指させる）。
   *
   * 🔴**`PerformCtx.userId` は「CPU ではなく相手（クライアント）」**＝実機は人間の client が CPU を動かすので、
   *   `cpuTurnAction` の中の `user.id` は**相手の席**を指す（ターンの引き渡し先＝`cpuTurn.ts:1559`）。
   *   ⚠ここに `CPU_PLAYER_ID` を渡すと**CPU が自分自身にターンを渡し続ける**（試運転で実測＝
   *   host 席だけが T1・T2・T3 … と連続で打ち、相手は一度も動かなかった）。
   */
  const runCpuTurn = async (bs: BattleStateRow): Promise<boolean> => {
    // 🔴**相手の応答待ちなら、その席へ譲る**（`cpuWaitingForHuman`＝ガード応答・カットイン・身代わり・ダメージ置換）＝
    //   実機ではここで人間が答える。譲らないと**攻撃側の CPU を呼び続けて盤面が1歩も動かない**
    //   （試運転で実測＝T2 の `ATTACK_LRIG` で無限に空回りした）。
    if (cpuShouldAct(bs) && !cpuWaitingForHuman(bs)) {
      await cpuTurnAction(ctxOf(bs, bs.host_id), {
        actions: actionsFor(() => ctxOf(row(), row().host_id)),
        allCards: d.cards, cpuPlan: planFor('guest'),
        // 🆕§5.7 `S-9`＝この枝は **guest 席**の CPU（鏡を通していない）。
        policy: d.policy?.guest ?? DEFAULT_CPU_POLICY,
        observeMoves: d.observeMoves, observeChoice: d.observeChoice,
        checkPowerZeroBanish: () => makeRuleChecks(clientCtx(), { loading: false, isCpuBattle: true, memo }).checkAndBanishPowerZero(),
      });
      return true;
    }
    // ── host 席（実機では人間）＝鏡に映してから同じ `cpuTurnAction` に指させる ──
    const hostId = bs.host_id, guestId = bs.guest_id;
    const mirrored = () => mirrorSeats(row(), hostId, guestId);
    const m0 = mirrored();
    if (!cpuShouldAct(m0) || cpuWaitingForHuman(m0)) return false;
    // 🔴書き戻しは鏡で戻す（`reduceBattle` が作るパッチは鏡座標なので、そのまま書くと席が入れ替わる）。
    const mirrorIo = {
      ...io,
      commit: (patch: Partial<BattleStateRow>) => persist.commit(mirrorSeats(patch, hostId, guestId)),
    };
    const mirroredCtx = () => ctxOf(mirrored(), hostId, mirrorIo);
    await cpuTurnAction(mirroredCtx(), {
      actions: actionsFor(mirroredCtx),
      allCards: d.cards, cpuPlan: planFor('host'),
      // 🆕§5.7 `S-9`＝この枝は **host 席**の CPU（鏡を通して同じ関数に指させている）。
      policy: d.policy?.host ?? DEFAULT_CPU_POLICY,
      observeMoves: d.observeMoves, observeChoice: d.observeChoice,
      checkPowerZeroBanish: () => makeRuleChecks(clientCtx(), { loading: false, isCpuBattle: true, memo }).checkAndBanishPowerZero(),
    });
    return true;
  };

  const step = async (): Promise<HeadlessStepKind> => {
    const bs = row();
    if (bs.winner_id || bs.global_phase === 'FINISHED') return 'finished';
    if (bs.pending_effect) return (await answerInteraction(bs, bs.pending_effect)) ? 'interaction' : 'idle';
    if (await confirmOrderIfNeeded(bs)) return 'order';
    if (await resolveStackOnce(bs)) return 'stack';
    if (await runRuleChecks(bs)) return 'rule';
    if (await runCpuTurn(bs)) return 'cpu';
    return 'idle';
  };

  const run = async (maxSteps = 4000): Promise<{ steps: number; reason: 'finished' | 'idle' | 'cap' }> => {
    for (let i = 0; i < maxSteps; i++) {
      const kind = await step();
      if (kind === 'finished') return { steps: i, reason: 'finished' };
      if (kind === 'idle') return { steps: i, reason: 'idle' };
    }
    return { steps: maxSteps, reason: 'cap' };
  };

  return { persist, row, logs, step, run };
}
