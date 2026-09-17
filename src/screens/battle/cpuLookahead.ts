import type { CardData, PendingInteractionDef, PlayerState, TurnPhase } from '../../types';
import type { CardEffect } from '../../types/effects';
import {
  executeEffect, resumeAllocatePower, resumeChoose, resumeLookAndReorder, resumeOpponentPayOptional, resumeOptionalCost,
  resumeRearrangeSigni, resumeRevealCards, resumeSearch, resumeSelectSigniZone, resumeSelectTarget, resumeSelectVirusZone,
  resumeSelectZone, type ExecCtx,
} from '../../engine/effectExecutor';
import type { ExecResult } from '../../engine/execUtils';
import { getCardNum } from '../../engine/execUtils';
import { checkActiveCondition } from '../../engine/effectEngine';
import { onPlayOriginMatches } from '../../engine/triggerCollect';
import { currentRng, mulberry32, setRng } from '../../engine/rng';
import { cardStrength } from './cpuCardStrength';
import {
  pickCpuAllocatePower, pickCpuChoice, pickCpuEmptySigniZone, pickCpuRearrange, pickCpuSearch, pickCpuTargets, pickCpuVirusZone,
  type CpuInteractionCtx,
} from './cpuInteraction';

/**
 * 🆕**浅い先読み**（§5.7 `S-4`・案A・2026-09-17）＝盤面をコピーして **engine だけで効果を解決**し、結果の盤面を採点する。
 *
 * ■ なぜ要るか＝`S-1` の強さ表は「除去1体＝パワー6000相当」のような**盤面を見ない静的な点数**。
 *   相手の場が空なのに【出】の除去を高く見る／ドローで手札上限を超えるのを見ない、といった場面で外す。
 *   ⇒ **この盤面で実際に解決した結果**で比べる。
 *
 * ■ 範囲（案A の限界）＝効果1つ（とその途中の選択）だけを解決する。**誘発の連鎖・スタック・相手の応答（ガード・ライフバースト）は見ない**
 *   （それは `S-5` の対戦丸ごとのシミュレータの仕事）。解決できない形（未対応の対話・例外・手数超過）は `null`＝呼び出し側は先読み無しの判断に戻す。
 *
 * ■ 規律（§5.6.3）＝判断の材料を作るだけで、**本番の盤面には書かない**。途中の選択は CPU と同じ `cpuInteraction.ts` で答える
 *   （相手が選ぶ対話は、相手の立場で同じ関数に答えさせる）。
 * ⚠**本番の乱数列を消費しない**＝シミュレーション中だけ固定 seed の列に差し替えて戻す。
 */
export interface LookaheadCtx {
  /** カード番号 → カード（instance ID でも引ける `InstanceMap` を渡す）。 */
  cardMap: Map<string, CardData>;
  /** instance ID → そのカードの効果（付与を含む）。 */
  effectsOf: (id: string) => readonly CardEffect[];
  /** 場のパワーの計算（`calcFieldPowers`）。省略時は印刷パワー。 */
  powersOf?: (cpu: PlayerState, opp: PlayerState) => Map<string, number>;
  /** 作戦データの「手元に置く価値」（`S-2`）。盤面の採点には使わない。 */
  planBonus?: (id: string) => number;
  turnPhase?: TurnPhase;
}

const STEP_CAP = 40;

/** 盤面の採点の重み（パワー換算）。`S-6` の自己対戦で調整する対象。 */
export const BOARD_WEIGHTS = {
  life: 7000,
  hand: 1500,
  energy: 1000,
  /** 正面が空いている（＝ライフへアタックが通る）シグニ1体。除去の大きな価値はここ（弱いシグニを除去しても「正面が空く」ぶん得）。 */
  openLane: 3000,
  /** 相手の凍結しているシグニ1体（次のアップフェイズに起き上がれない＝次のターンにアタックできない）。凍結スペルの価値はここ。 */
  oppFrozen: 2500,
} as const;

const clone = <T>(v: T): T => structuredClone(v);

/**
 * 盤面の採点＝**CPU から見た有利さ**（パワー換算）。
 * 場のシグニの強さ（`field` 文脈＝実効パワー＋【常】【起】などの効果）の差＋ライフ・手札・エナの枚数差
 * ＋**正面が空いているシグニの数の差**（自分のシグニの正面が空いていればライフへアタックが通る）。
 * ⚠盤面は左右反転＝ゾーン `zi` の正面は相手の `2 - zi`（engine 共通規約・`facingSigniPower` と同じ）。
 */
export function evaluateBoard(cpu: PlayerState, opp: PlayerState, ctx: LookaheadCtx): number {
  const powers = ctx.powersOf?.(cpu, opp);
  const fieldValue = (st: PlayerState) => st.field.signi.reduce((sum, stack) => {
    const top = stack?.at(-1);
    if (!top) return sum;
    return sum + cardStrength(ctx.cardMap.get(getCardNum(top)) ?? ctx.cardMap.get(top), ctx.effectsOf(top), 'field', powers?.get(top));
  }, 0);
  const openLanes = (me: PlayerState, them: PlayerState) =>
    [0, 1, 2].filter(zi => (me.field.signi[zi]?.length ?? 0) > 0 && (them.field.signi[2 - zi]?.length ?? 0) === 0).length;
  return fieldValue(cpu) - fieldValue(opp)
    + (openLanes(cpu, opp) - openLanes(opp, cpu)) * BOARD_WEIGHTS.openLane
    + [0, 1, 2].filter(zi => (opp.field.signi[zi]?.length ?? 0) > 0 && opp.field.signi_frozen?.[zi]).length * BOARD_WEIGHTS.oppFrozen
    + (cpu.life_cloth.length - opp.life_cloth.length) * BOARD_WEIGHTS.life
    + (cpu.hand.length - opp.hand.length) * BOARD_WEIGHTS.hand
    + (cpu.energy.length - opp.energy.length) * BOARD_WEIGHTS.energy;
}

/** 対話に答えて resume する（1手）。答えられない形は null。 */
function answer(pending: PendingInteractionDef, ctx: ExecCtx, lctx: LookaheadCtx): ExecResult | null {
  // 相手が選ぶ対話は、相手の立場（cpu と opp を入れ替え）で答える。
  const opponentChooses = 'opponentResponds' in pending && pending.opponentResponds === true;
  const me = opponentChooses ? ctx.otherState : ctx.ownerState;
  const them = opponentChooses ? ctx.ownerState : ctx.otherState;
  const ictx: CpuInteractionCtx = { cpuState: me, oppState: them, cardMap: lctx.cardMap, effectsOf: lctx.effectsOf };
  switch (pending.type) {
    case 'SELECT_TARGET': return resumeSelectTarget(pickCpuTargets(pending, ictx), pending, ctx);
    case 'SEARCH': return resumeSearch(pickCpuSearch(pending, ictx), pending, ctx);
    case 'CHOOSE': {
      const picked = pickCpuChoice(pending, ictx);
      const id = picked[0] ?? '';
      const opt = pending.options.find(o => o.id === id);
      if (pending.leaveSubstituteAsk || pending.costlessOpponentChoice) return resumeChoose(id, pending, ctx);
      if (pending.opponentResponds) return resumeOpponentPayOptional(id, picked.slice(1), pending, ctx);
      if (opt?.costColors?.length || opt?.coinCost) return resumeOptionalCost(id, picked.slice(1), pending, ctx);
      return resumeChoose(pending.multiSelect ? picked : id, pending, ctx);
    }
    case 'LOOK_AND_REORDER': return resumeLookAndReorder([...pending.cards], [], pending, ctx);
    case 'SELECT_ZONE': {
      const z = pickCpuEmptySigniZone(pending.owner === 'self' ? ctx.ownerState : ctx.otherState);
      return z === null ? null : resumeSelectZone(z, pending, ctx);
    }
    case 'SELECT_SIGNI_ZONE': {
      const z = pickCpuEmptySigniZone(pending.owner === 'self' ? ctx.ownerState : ctx.otherState);
      return z === null ? null : resumeSelectSigniZone(z, pending, ctx);
    }
    case 'SELECT_VIRUS_ZONE':
      return resumeSelectVirusZone(pickCpuVirusZone(pending, pending.owner === 'self' ? ctx.ownerState : ctx.otherState), pending, ctx);
    case 'ALLOCATE_POWER': return resumeAllocatePower(pickCpuAllocatePower(pending, ictx), pending, ctx);
    case 'REARRANGE_SIGNI': {
      const choice = pickCpuRearrange(pending);
      return choice ? resumeRearrangeSigni(choice, pending, ctx) : null;
    }
    case 'REVEAL_CARDS': return resumeRevealCards(pending, ctx);
    default: return null;
  }
}

/**
 * 効果を1つ解決した盤面（CPU が効果の持ち主）。解決しきれなければ null。
 * ⚠渡した盤面は書き換えない（コピーで解決する）。
 */
export function simulateEffect(
  effect: CardEffect, sourceId: string, cpu: PlayerState, opp: PlayerState, lctx: LookaheadCtx,
): { cpu: PlayerState; opp: PlayerState } | null {
  const prevRng = currentRng();
  setRng(mulberry32(0x5eed));
  try {
    const base: ExecCtx = {
      ownerState: clone(cpu), otherState: clone(opp), cardMap: lctx.cardMap, logs: [],
      sourceCardNum: sourceId, triggeringCardNum: sourceId, currentPhase: lctx.turnPhase ?? 'MAIN', isOwnerTurn: true,
    } as ExecCtx;
    let result = executeEffect(effect, base);
    for (let step = 0; !result.done; step++) {
      if (step >= STEP_CAP) return null;
      const next = answer(result.pending, { ...base, ownerState: result.ownerState, otherState: result.otherState, logs: result.logs }, lctx);
      if (!next) return null;
      result = next;
    }
    return { cpu: result.ownerState, opp: result.otherState };
  } catch {
    return null;
  } finally {
    setRng(prevRng);
  }
}

/**
 * CPU がシグニを手札から場に出したときに**必ず発動する【出】**（CPU の通常召喚と同じ絞り込み）。
 * コスト付きの任意【出】は CPU が発動しない（`mandatory:false` を除く）。
 */
export function cpuOnPlayEffectsOf(id: string, cpu: PlayerState, opp: PlayerState, lctx: LookaheadCtx): CardEffect[] {
  return lctx.effectsOf(id).filter(e =>
    e.effectType === 'AUTO'
    && (e.timing?.includes('ON_PLAY') ?? false)
    && (e.triggerScope === undefined || e.triggerScope === 'self' || e.triggerScope === 'any')
    && e.mandatory !== false
    && !e.triggerCondition?.byEffect && !e.triggerCondition?.bySigniEffect
    && onPlayOriginMatches(e, 'hand')
    && (!e.activeCondition || checkActiveCondition(e.activeCondition, cpu, opp, true, lctx.cardMap, id)));
}

/**
 * 手札のシグニ `id` をゾーン `zone` に出して【出】を解決した盤面の点数（先読み）。
 * 【出】の途中で解決できなかったら、置いただけの盤面で採点する（効果の分は見ない）。
 */
export function scoreDeploy(id: string, zone: number, cpu: PlayerState, opp: PlayerState, lctx: LookaheadCtx): number {
  const signi = [...cpu.field.signi] as (string[] | null)[];
  signi[zone] = [id];
  let placedCpu: PlayerState = { ...cpu, hand: cpu.hand.filter(h => h !== id), field: { ...cpu.field, signi } };
  let placedOpp = opp;
  for (const e of cpuOnPlayEffectsOf(id, placedCpu, placedOpp, lctx)) {
    const after = simulateEffect(e, id, placedCpu, placedOpp, lctx);
    if (!after) continue;
    placedCpu = after.cpu;
    placedOpp = after.opp;
  }
  return evaluateBoard(placedCpu, placedOpp, lctx);
}

/**
 * 効果（スペル・アーツ・【起】）を使った盤面の点数の**増分**（使う前との差）。解決しきれなければ null。
 * ⚠コスト（エナ）の支払いは呼び出し側が済ませた盤面を渡す（ここはコストを払わない）。
 */
export function scoreEffectGain(effect: CardEffect, sourceId: string, cpu: PlayerState, opp: PlayerState, lctx: LookaheadCtx): number | null {
  const after = simulateEffect(effect, sourceId, cpu, opp, lctx);
  if (!after) return null;
  return evaluateBoard(after.cpu, after.opp, lctx) - evaluateBoard(cpu, opp, lctx);
}

/**
 * 手札・ルリグデッキのカード（スペル・アーツ）を使ったときの点数の増分（§5.7 `S-4c`）。
 * コストのエナ `costCount` 枚を払い、カードを手札から出した盤面から `ACTIVATED` の効果を順に解決して、使う前と比べる。
 * どれか1つでも解決しきれなければ null（＝先読みでは判断しない）。
 */
export function scoreCardUseGain(
  cardId: string, costCount: number, cpu: PlayerState, opp: PlayerState, lctx: LookaheadCtx, from: 'hand' | 'lrig_deck',
): number | null {
  const before = evaluateBoard(cpu, opp, lctx);
  let actor: PlayerState = {
    ...cpu,
    energy: cpu.energy.slice(0, Math.max(0, cpu.energy.length - costCount)),
    ...(from === 'hand' ? { hand: cpu.hand.filter(h => h !== cardId) } : { lrig_deck: cpu.lrig_deck.filter(h => h !== cardId) }),
  };
  let other = opp;
  const acts = lctx.effectsOf(cardId).filter(e => e.effectType === 'ACTIVATED');
  if (acts.length === 0) return null;
  for (const e of acts) {
    const after = simulateEffect(e, cardId, actor, other, lctx);
    if (!after) return null;
    actor = after.cpu;
    other = after.opp;
  }
  return evaluateBoard(actor, other, lctx) - before;
}

/** スペルを使う価値があるとみなす増分の下限（カード1枚＋エナを使うぶんより得か）。 */
export const SPELL_GAIN_MIN = 1000;
