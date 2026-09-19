import type { CardData, PlayerState, TurnPhase } from '../../types';
import type { CardEffect } from '../../types/effects';
import {
  calcContinuousBlockedActions, calcFieldPowers, collectEnergyCostSubstitutes, collectForcePlaceFrontZones,
  collectGrowCostReductions,
} from '../../engine/effectEngine';
import { getCardNum, getRiseRequirement } from '../../engine/execUtils';
import { deployLimitBlockReason, deployCountCap } from '../../engine/deployLimit';
import { isHandSigniPlayBlockedByPower } from '../../engine/blockAction';
import { buildArtsPayerCtx, hasIgnoreLrigRestriction, type ArtsPayerCtx } from './artsUseGate';
import { listAssistGrowCandidates } from './assistGrow';
import { isPhaseSkipped } from './attackStepPhase';
import {
  applyGrowCostReduction, colorlessPayableColorsOf, isEnaMultiStripped, isEnergyPaymentSelectionValid,
  parseCoinCost, parseGrowCost,
} from './costs';
import { listCpuSigniActivated, selectEnergyIndicesForCost, type CpuActivatedChoice, type CpuEnergyReserve, type CpuSigniActivatedPickInput } from './cpuActivate';
import { listCpuArts, type CpuArtsCandidate, type CpuArtsPickInput } from './cpuArts';
import { listCpuKeyPieces, type CpuKeyPieceChoice, type CpuKeyPiecePickInput } from './cpuKeyPiece';
import type { LookaheadCtx } from './cpuLookahead';
import { listCpuLrigActivated, type CpuLrigActivatedChoice, type CpuLrigActivatedPickInput } from './cpuLrigActivate';
import { listCpuOffFieldActivated, type CpuOffFieldChoice, type CpuOffFieldPickInput } from './cpuOffFieldActivate';
import { listCpuMainSpells, type CpuMainSpellPickInput, type CpuSpellChoice } from './cpuSpell';
import { paidFieldLevels, pickCpuResonaSelection, pickCpuResonaZone } from './cpuSummon';
import { buildEnergyPayPool, energyPoolCardNums, type EnergyPayEntry } from './energyPaySource';
import { computeFieldSigniLimit } from './fieldLimit';
import { canGrowNow, declaredSigniOverride, effectiveLrigClass, listGrowCandidates, meetsRestriction } from './growLogic';
import { computeEffectiveLrigLimit } from './lrigLimit';
import { getResonaSummonCandidate, type ResonaPaymentSelection, type ResonaSummonCandidate } from './resonaSummon';
import { planRiseSummon } from './riseSummon';
import { resolveSigniZonePlacement } from './signiZoneBlock';

/**
 * 🆕§5.7 `S-15`＝**CPU の候補列挙器**（2026-09-20）。
 *
 * ■ なぜ要るか＝探索（`S-16`／`S-17`）は「その盤面で取れる手を全部並べる」関数が無いと書けない。
 *   旧は各 `pickCpu*` が「自分の担当から1つ選ぶ」形で、列挙は各関数の内部に閉じていた。
 *   ⇒ **「列挙」（ここ・各 `listCpu*`）と「選ぶ」（各 `pickCpu*`／`cpuTurnAction` の優先順）を割った。**
 *
 * ■ 規律
 *   - 🔴**可否の判定は書かない**（§5.6.3）＝既存の gate（`listGrowCandidates`／`deployLimitBlockReason`／
 *     `signiActivateGate`／`spellUseGate`／`artsUseGate`／`offFieldActivateGate`／`keyPieceUseGate`）を呼ぶだけ。
 *   - 🔴**列挙の道は1本**＝`cpuTurnAction` の `tryCpu*` も**この関数群が組み立てた入力で**選ぶ
 *     （2本に割ると「探索では出たのに本番では出ない手」が生まれ、どの計器にも映らない）。
 *   - **列挙に出た手はそのまま実行できる**＝支払いの内訳（エナ index など）まで決めた形で出す。
 *     CPU が内訳を決められないコスト（allowlist 外）・未対応アクションの札は出さない（既存の安全弁のまま）。
 *   - **分類・閾値・盤面評価では絞らない**＝除去だけ／利得 `SPELL_GAIN_MIN` 以上／【ガード】の温存などは「選ぶ」側。
 *   - ⚠CPU は常に guest（`cpuTurnAction` と同じ前提）。`actor` は CPU、`opponent` は人間の盤面。
 */

export interface CpuMoveCtx {
  actor: PlayerState;
  opponent: PlayerState;
  /** 全カード（画面の props＝`cpuTurnAction` の `cards`）。エナの色の読み取りに使う。 */
  allCards: CardData[];
  /** 対戦に出ているカード（`PerformCtx.cards`）。アーツ／スペル／ピースの gate に渡す。 */
  battleCards: CardData[];
  cardMap: Map<string, CardData>;
  effectsMap: Map<string, CardEffect[]>;
  /** 盤面の先読み（`S-4`）。選ぶ側だけが使う（列挙は先読みしない）。 */
  lookahead: LookaheadCtx;
  /** グロウ用エナの予約（`cpuGrowReserve.ts`）。 */
  reserveFor: (actor: PlayerState) => CpuEnergyReserve | undefined;
}

/** CPU の1手。探索（`S-16`）はこれを適用して次の盤面を作る。 */
export type CpuMove =
  | { kind: 'energy'; handIndex: number; id: string }
  | { kind: 'grow'; card: CardData; costIndices: Set<number>; pool: EnergyPayEntry[] }
  | { kind: 'deploy'; handIndex: number; id: string; zone: number }
  | { kind: 'assistGrow'; card: CardData; side: 'l' | 'r'; costIndices: Set<number>; pool: EnergyPayEntry[] }
  | { kind: 'resona'; card: CardData; candidate: ResonaSummonCandidate; selection: ResonaPaymentSelection; zone: number }
  | { kind: 'rise'; card: CardData; handIndex: number; zone: number; selection: NonNullable<ReturnType<typeof planRiseSummon>>['selection'] }
  | { kind: 'piece'; choice: CpuKeyPieceChoice }
  | { kind: 'activate'; choice: CpuActivatedChoice }
  | { kind: 'lrigActivate'; choice: CpuLrigActivatedChoice }
  | { kind: 'offFieldActivate'; choice: CpuOffFieldChoice }
  | { kind: 'arts'; choice: CpuArtsCandidate }
  | { kind: 'spell'; choice: CpuSpellChoice };

export type CpuMoveKind = CpuMove['kind'];

const usedThisTurn = (s: PlayerState, cardNum: string) => (s.cpu_used_card_nums_this_turn ?? []).includes(cardNum);
const centerClassOf = (ctx: CpuMoveCtx, s: PlayerState) =>
  effectiveLrigClass(s, ctx.cardMap.get(getCardNum(s.field.lrig.at(-1) ?? ''))?.CardClass);

/** エナ支払いの権威（人間の支払いモーダルと同じ `isEnergyPaymentSelectionValid`）＝グロウ／【起】／アシストグロウの形。 */
function basicAffordable(ctx: CpuMoveCtx, s: PlayerState) {
  const stripped = isEnaMultiStripped(s, ctx.opponent, false, ctx.effectsMap, ctx.cardMap);
  const wholeSubstitutes = collectEnergyCostSubstitutes(s, ctx.cardMap, ctx.effectsMap);
  return {
    wholeSubstitutes,
    isAffordable: (selectedNums: string[], costStr: string) => isEnergyPaymentSelectionValid({
      selectedEnergyNums: selectedNums, cards: ctx.allCards, baseCost: costStr,
      keywordGrants: s.keyword_grants, stripped, wholeSubstitutes,
    }),
  };
}

// ─── エナチャージ ───────────────────────────────────────────────

/** エナフェイズに置ける手札（全部）。⚠1ターン1回・封じ／スキップは `listCpuMoves` 側で見る。 */
export function listCpuEnergyCharges(s: PlayerState): CpuMove[] {
  return s.hand.map((id, handIndex) => ({ kind: 'energy' as const, handIndex, id }));
}

// ─── グロウ ───────────────────────────────────────────────────

/** いま払えるグロウ先を全部（`listGrowCandidates` の順）。⚠`canGrowNow` は `listCpuMoves` 側で見る。 */
export function listCpuGrows(ctx: CpuMoveCtx): Extract<CpuMove, { kind: 'grow' }>[] {
  const s = ctx.actor;
  const pool = buildEnergyPayPool(s, { turnPhase: 'GROW', isMyTurn: true, effectsMap: ctx.effectsMap });
  const poolNums = energyPoolCardNums(pool);
  const { isAffordable, wholeSubstitutes } = basicAffordable(ctx, s);
  const out: Extract<CpuMove, { kind: 'grow' }>[] = [];
  for (const card of listGrowCandidates({ my: s, cardMap: ctx.cardMap, effectsMap: ctx.effectsMap })) {
    // 🆕**§5.3 `O-219`**＝グロウ先ごとに軽減が変わる（人間UIと同じ関数・同じ引数で読む）。
    const red = collectGrowCostReductions(s, ctx.opponent, true, ctx.effectsMap, ctx.cardMap, card.CardNum);
    const costStr = applyGrowCostReduction(card.GrowCost, red);
    const coinNeed = parseCoinCost(card.GrowCost);
    if (coinNeed > 0 && (s.coins ?? 0) < coinNeed) continue;
    const costIndices = selectEnergyIndicesForCost({ poolNums, cards: ctx.allCards, costStr, isAffordable, wholeSubstitutes });
    if (!costIndices) continue;
    out.push({ kind: 'grow', card, costIndices, pool });
  }
  return out;
}

// ─── 召喚（手札から空きゾーンへ） ─────────────────────────────────

export interface CpuHandSigni { id: string; idx: number; card: CardData }

/** 手札のシグニ（手札順）。 */
export function cpuHandSignis(ctx: CpuMoveCtx, s: PlayerState): CpuHandSigni[] {
  return s.hand
    .map((id, idx) => ({ id, idx, card: ctx.allCards.find(c => c.CardNum === getCardNum(id)) }))
    .filter((h): h is CpuHandSigni => !!h.card && h.card.Type === 'シグニ');
}

/** 召喚の枠＝センタールリグのレベル・リミットと、場のシグニの合計レベル（`cpuTurnAction` の MAIN と同じ式）。 */
export function cpuDeployBudget(ctx: CpuMoveCtx, s: PlayerState): { lrigLevel: number; limit: number; fieldTotal: number } {
  const lrigId = s.field.lrig.at(-1) ?? null;
  const lrigCard = lrigId ? ctx.allCards.find(c => c.CardNum === getCardNum(lrigId)) : null;
  const limit = lrigCard?.Limit === '∞' ? Infinity : (parseInt(lrigCard?.Limit ?? '0') || 0);
  const lrigLevel = parseInt(lrigCard?.Level ?? '0') || 0;
  let fieldTotal = 0;
  for (const stack of s.field.signi) {
    if (!stack?.length) continue;
    const topCard = ctx.allCards.find(c => c.CardNum === getCardNum(stack[stack.length - 1]));
    fieldTotal += parseInt(topCard?.Level ?? '0') || 0;
  }
  return { lrigLevel, limit, fieldTotal };
}

/** 場に出せるシグニの体数の上限（`LIMIT_ALL_FIELD_N` と `DEPLOY_RESTRICT` の小さい方）。 */
export function cpuFieldSigniCap(ctx: CpuMoveCtx, s: PlayerState): number {
  const base = computeFieldSigniLimit(s, ctx.opponent, ctx.effectsMap, getCardNum);
  const cap = deployCountCap({
    placingState: s, opponentState: ctx.opponent, cardMap: ctx.cardMap, effectsMap: ctx.effectsMap, isPlacingOwnerTurn: true,
  });
  return cap !== undefined ? Math.min(base, cap) : base;
}

/** このゾーンへいま置けるか（空き・体数上限・正面強制・配置禁止）。 */
export function cpuDeployZoneOpen(ctx: CpuMoveCtx, s: PlayerState, zone: number, fieldSigniCap: number): boolean {
  if ((s.field.signi[zone] ?? []).length > 0) return false;
  if (s.field.signi.filter(stk => (stk ?? []).length > 0).length >= fieldSigniCap) return false;
  // FORCE_PLACE_FRONT: 人間（host）の該当シグニの正面ゾーンが空いている場合、そのゾーンにしか配置できない
  const forced = collectForcePlaceFrontZones(ctx.opponent, s, ctx.cardMap, ctx.effectsMap, false);
  if (forced.size > 0 && !forced.has(zone)) return false;
  // BLOCK_OPP_ZONE_PLACEMENT / REMOVE_SIGNI_ZONE＝配置禁止ゾーンは飛ばす（《無》回避つきは払えるときだけ）。
  return resolveSigniZonePlacement(s, zone).allowed;
}

/**
 * このゾーンに置ける手札のシグニ（リミット内・シグニLv ≤ ルリグLv・配置制限）。
 * ⚠【ライズ】は外す（`listCpuRises` が扱う＝§5.3 `O-147`）。⚠コストの支払いは `cpuPaySigniCostEnergy`。
 */
export function cpuDeployPlaceable(
  ctx: CpuMoveCtx, s: PlayerState, zone: number, handSignis: readonly CpuHandSigni[],
  budget: { lrigLevel: number; limit: number; fieldTotal: number },
): CpuHandSigni[] {
  return handSignis.filter(({ id, card }) => {
    if (getRiseRequirement(card.EffectText ?? '')) return false;
    const lv = parseInt(card.Level) || 0;
    if (lv > budget.lrigLevel || budget.fieldTotal + lv > budget.limit) return false;
    const power = card.Power === '∞' ? Infinity : parseInt(card.Power ?? '', 10);
    if (isHandSigniPlayBlockedByPower(s, power)) return false;
    return deployLimitBlockReason({
      placingState: s, opponentState: ctx.opponent, cardNum: id,
      cardMap: ctx.cardMap, effectsMap: ctx.effectsMap, isPlacingOwnerTurn: true,
      placementSource: 'normal_summon',
      // §5.3 `O-94`②＝CPU 召喚もゾーン制限を見る。
      zoneIndex: zone,
    }) === null;
  });
}

/**
 * シグニのエナコストを払った後のエナ（払えない／払うとグロウ用の予約を割るなら null）。コストが無ければ今のエナ。
 * ⚠`performSummonSigni` はシグニのコストを払わない＝CPU は召喚ループで先に払う（色の一致だけで先頭から）。
 */
export function cpuPaySigniCostEnergy(ctx: CpuMoveCtx, s: PlayerState, card: CardData): string[] | null {
  const signiCosts = parseGrowCost(card.Cost);
  if (signiCosts.length === 0) return s.energy;
  let newEnergy = [...s.energy];
  for (const { color, count } of signiCosts) {
    let paid = 0;
    const after = newEnergy.filter(eNum => {
      if (paid >= count) return true;
      const eColor = ctx.allCards.find(c => c.CardNum === getCardNum(eNum))?.Color ?? '';
      if (color === '無' || eColor.includes(color)) { paid++; return false; }
      return true;
    });
    if (paid < count) return null;
    newEnergy = after;
  }
  // 🆕グロウ用エナの予約＝払った残りで次のグロウが払えないなら、この札は出さない。
  const reserve = ctx.reserveFor(s);
  if (reserve && !reserve.keepsAfter(newEnergy)) return null;
  return newEnergy;
}

/** いま出せる（手札のシグニ × 空きゾーン）を全部＝ゾーン順→手札順。 */
export function listCpuDeploys(ctx: CpuMoveCtx): Extract<CpuMove, { kind: 'deploy' }>[] {
  const s = ctx.actor;
  const handSignis = cpuHandSignis(ctx, s);
  if (handSignis.length === 0) return [];
  const budget = cpuDeployBudget(ctx, s);
  const cap = cpuFieldSigniCap(ctx, s);
  const out: Extract<CpuMove, { kind: 'deploy' }>[] = [];
  for (let zone = 0; zone < 3; zone++) {
    if (!cpuDeployZoneOpen(ctx, s, zone, cap)) continue;
    for (const h of cpuDeployPlaceable(ctx, s, zone, handSignis, budget)) {
      const energy = cpuPaySigniCostEnergy(ctx, s, h.card);
      if (!energy) continue;
      if (!resolveSigniZonePlacement({ ...s, energy }, zone).allowed) continue;
      out.push({ kind: 'deploy', handIndex: h.idx, id: h.id, zone });
    }
  }
  return out;
}

// ─── アシストグロウ・レゾナ・ライズ（§5.6 `C-5`/`C-6`） ─────────────────

/** いまできるアシストグロウを全部（左→右・候補順）。 */
export function listCpuAssistGrows(ctx: CpuMoveCtx): Extract<CpuMove, { kind: 'assistGrow' }>[] {
  const s = ctx.actor;
  const pool = buildEnergyPayPool(s, { turnPhase: 'MAIN', isMyTurn: true, effectsMap: ctx.effectsMap });
  const { isAffordable, wholeSubstitutes } = basicAffordable(ctx, s);
  const out: Extract<CpuMove, { kind: 'assistGrow' }>[] = [];
  for (const side of ['l', 'r'] as const) {
    for (const card of listAssistGrowCandidates({ state: s, side, phase: 'MAIN', isOwnerTurn: true, cardMap: ctx.cardMap })) {
      if (usedThisTurn(s, card.CardNum)) continue;
      // ⚠コインは `performAssistGrow` が払わない＝コインを要する札は選ばない（踏み倒さない）。
      if (parseCoinCost(card.GrowCost) > 0) continue;
      const costStr = applyGrowCostReduction(card.GrowCost,
        collectGrowCostReductions(s, ctx.opponent, true, ctx.effectsMap, ctx.cardMap, card.CardNum));
      const costIndices = selectEnergyIndicesForCost({
        poolNums: energyPoolCardNums(pool), cards: ctx.allCards, costStr, isAffordable, wholeSubstitutes,
        // アシストグロウはアーツと同じ扱い（ユーザー指示）＝センターの次のグロウ用エナを残す。
        reserve: ctx.reserveFor(s),
      });
      if (!costIndices) continue;
      out.push({ kind: 'assistGrow', card, side, costIndices, pool });
    }
  }
  return out;
}

/** CPU の召喚文脈の材料（人間の `handleSummonSigni` が memo 値で渡すものを、CPU の盤面から同じ式で作る）。 */
export function cpuSummonBudget(ctx: CpuMoveCtx, s: PlayerState) {
  const centerCard = ctx.cardMap.get(getCardNum(s.field.lrig.at(-1) ?? ''));
  const fieldTotal = s.field.signi.reduce((sum, stack) => {
    const top = stack?.at(-1);
    if (!top) return sum;
    const c = ctx.cardMap.get(getCardNum(top));
    return sum + (declaredSigniOverride(s, c?.CardName).levelZero ? 0 : (parseInt(c?.Level ?? '0') || 0));
  }, 0);
  const blockedSelf = calcContinuousBlockedActions(s, ctx.opponent, true, ctx.effectsMap, ctx.cardMap).forSelf;
  return {
    lrigLevel: parseInt(centerCard?.Level ?? '0') || 0,
    lrigLimit: computeEffectiveLrigLimit(s, ctx.opponent, ctx.cardMap, ctx.effectsMap, true),
    fieldSigniTotal: fieldTotal,
    playColorlessBlocked: (s.blocked_actions ?? []).includes('PLAY_COLORLESS') || blockedSelf.has('PLAY_COLORLESS'),
  };
}

/** いま出せるレゾナを全部（ルリグデッキ順）。⚠スペル解決待ち（`pending_spell`）は `listCpuMoves` 側で見る。 */
export function listCpuResonas(ctx: CpuMoveCtx): Extract<CpuMove, { kind: 'resona' }>[] {
  const s = ctx.actor;
  const sc = cpuSummonBudget(ctx, s);
  const centerClass = centerClassOf(ctx, s);
  const out: Extract<CpuMove, { kind: 'resona' }>[] = [];
  for (const id of s.lrig_deck) {
    const card = ctx.cardMap.get(getCardNum(id));
    if (card?.Type !== 'レゾナ' || usedThisTurn(s, card.CardNum)) continue;
    // 限定条件＝人間のルリグデッキのカードアクションと同じ（レゾナは無視の宣言を見ない）。
    if (!meetsRestriction(card.Restriction, centerClass, false)) continue;
    const candidate = getResonaSummonCandidate(id, s, ctx.cardMap, ctx.effectsMap, 'MAIN');
    if (!candidate) continue;
    const level = parseInt(card.Level ?? '0', 10) || 0;
    if (level > sc.lrigLevel) continue;
    const selection = pickCpuResonaSelection(s, candidate.payment, ctx.cardMap);
    if (!selection) continue;
    if (sc.fieldSigniTotal - paidFieldLevels(s, selection, ctx.cardMap) + level > sc.lrigLimit) continue;
    const zone = pickCpuResonaZone(s, selection);
    if (zone === null) continue;
    out.push({ kind: 'resona', card, candidate, selection, zone });
  }
  return out;
}

/** いまできるライズを全部（手札順）。 */
export function listCpuRises(ctx: CpuMoveCtx): Extract<CpuMove, { kind: 'rise' }>[] {
  const s = ctx.actor;
  const sc = cpuSummonBudget(ctx, s);
  const centerClass = centerClassOf(ctx, s);
  const countLimit = computeFieldSigniLimit(s, ctx.opponent, ctx.effectsMap, getCardNum);
  const out: Extract<CpuMove, { kind: 'rise' }>[] = [];
  for (let handIndex = 0; handIndex < s.hand.length; handIndex++) {
    const card = ctx.cardMap.get(getCardNum(s.hand[handIndex]));
    if (card?.Type !== 'シグニ' || usedThisTurn(s, card.CardNum)) continue;
    const req = getRiseRequirement(card.EffectText ?? '');
    if (!req) continue;
    // ⚠シグニのエナコストは `performSummonSigni` が払わない（人間 UI も払わない）＝コストのある札は選ばない。
    if (parseGrowCost(card.Cost).length > 0) continue;
    // 手札の「召喚」ボタンと同じ軸（レベル・限定条件・パワー封じ）→ 置き方は `planRiseSummon`。
    const override = declaredSigniOverride(s, card.CardName);
    const level = override.levelZero ? 0 : (parseInt(card.Level) || 0);
    if (level > sc.lrigLevel) continue;
    if (!meetsRestriction(card.Restriction, centerClass,
      hasIgnoreLrigRestriction(s, ctx.effectsMap, 'signi', card) || override.ignoreRestriction)) continue;
    const power = card.Power === '∞' ? Infinity : parseInt(card.Power ?? '', 10);
    if (isHandSigniPlayBlockedByPower(s, power)) continue;
    const plan = planRiseSummon({
      my: s, req, signiLevel: level, fieldSigniTotal: sc.fieldSigniTotal,
      lrigLimit: sc.lrigLimit, fieldSigniCountLimit: countLimit, cardMap: ctx.cardMap,
    });
    if (!plan) continue;
    out.push({ kind: 'rise', card, handIndex, zone: plan.zoneIndex, selection: plan.selection });
  }
  return out;
}

// ─── 【起】・ピース・アーツ・スペル（各 picker の入力を1か所で組む） ───────────────

/** 場のシグニ【起】の入力（`pickCpuSigniActivated`／`listCpuSigniActivated` 共用）。 */
export function cpuSigniActivatedInput(ctx: CpuMoveCtx, phase: 'MAIN' | 'ATTACK_ARTS'): CpuSigniActivatedPickInput & { pool: EnergyPayEntry[] } {
  const s = ctx.actor;
  const pool = buildEnergyPayPool(s, { turnPhase: phase, isMyTurn: true, effectsMap: ctx.effectsMap });
  const { isAffordable, wholeSubstitutes } = basicAffordable(ctx, s);
  return {
    actor: s, opponent: ctx.opponent, effectsMap: ctx.effectsMap, cardMap: ctx.cardMap, cards: ctx.allCards,
    phase, energyPoolNums: energyPoolCardNums(pool),
    energyReserve: ctx.reserveFor(s),
    alreadyActivated: s.cpu_activated_effect_ids_this_turn ?? [],
    effectivePowers: calcFieldPowers(s, ctx.opponent, true, ctx.effectsMap, ctx.cardMap, phase),
    // 可否の権威は人間の支払いモーダルと同じ `canAffordGrowCost`。
    isAffordable, wholeSubstitutes, pool,
  };
}

/** センタールリグ【起】の入力。 */
export function cpuLrigActivatedInput(ctx: CpuMoveCtx, phase: 'MAIN' | 'ATTACK_ARTS'): CpuLrigActivatedPickInput & { pool: EnergyPayEntry[] } {
  const s = ctx.actor;
  const pool = buildEnergyPayPool(s, { turnPhase: phase, isMyTurn: true, effectsMap: ctx.effectsMap });
  const powers = calcFieldPowers(s, ctx.opponent, true, ctx.effectsMap, ctx.cardMap, phase);
  const { isAffordable, wholeSubstitutes } = basicAffordable(ctx, s);
  const blockedSelf = calcContinuousBlockedActions(s, ctx.opponent, true, ctx.effectsMap, ctx.cardMap, powers).forSelf;
  return {
    actor: s, opponent: ctx.opponent, effectsMap: ctx.effectsMap, cardMap: ctx.cardMap, cards: ctx.allCards,
    phase, energyPoolNums: energyPoolCardNums(pool), blockedSelf,
    energyReserve: ctx.reserveFor(s),
    alreadyActivated: s.cpu_activated_effect_ids_this_turn ?? [],
    effectivePowers: powers,
    isAffordable, wholeSubstitutes, pool,
  };
}

/** キー／ピースの入力。 */
export function cpuKeyPieceInput(ctx: CpuMoveCtx, turnPhase: 'MAIN' | 'ATTACK_ARTS'): CpuKeyPiecePickInput {
  const s = ctx.actor;
  const payer = buildArtsPayerCtx({
    actor: s, opponent: ctx.opponent, isActorTurn: true,
    turnPhase, cardMap: ctx.cardMap, effectsMap: ctx.effectsMap,
  });
  return {
    actor: s, opponent: ctx.opponent, cards: ctx.battleCards, cardMap: ctx.cardMap, effectsMap: ctx.effectsMap,
    payer, turnPhase, alreadyUsedNums: s.cpu_used_card_nums_this_turn ?? [],
    energyReserve: ctx.reserveFor(s),
    // 可否の権威は人間の `KeyUseModal` と同じ `isEnergyPaymentSelectionValid`（《無》の許可色を含む）。
    isAffordable: (selectedNums, costStr, card) => isEnergyPaymentSelectionValid({
      selectedEnergyNums: selectedNums, cards: ctx.battleCards, baseCost: costStr,
      keywordGrants: s.keyword_grants, allMulti: payer.enaAllMulti, stripped: payer.enaMultiStripped,
      colorlessOverrides: payer.colorlessOverrides, colorSubs: payer.colorSubs,
      colorlessPayableColors: colorlessPayableColorsOf(card.CardNum, ctx.effectsMap),
      wholeSubstitutes: payer.wholeEnergySubstitutes,
    }),
  };
}

/** 場以外（トラッシュ／手札／エナ）の【起】の入力。`ATTACK_ARTS_OP`＝人間のターンの応答窓。 */
export function cpuOffFieldInput(ctx: CpuMoveCtx, phase: 'MAIN' | 'ATTACK_ARTS' | 'ATTACK_ARTS_OP'): CpuOffFieldPickInput & { pool: EnergyPayEntry[] } {
  const s = ctx.actor;
  const isCpuTurn = phase !== 'ATTACK_ARTS_OP';
  const pool = buildEnergyPayPool(s, { turnPhase: phase, isMyTurn: isCpuTurn, effectsMap: ctx.effectsMap });
  const { isAffordable, wholeSubstitutes } = basicAffordable(ctx, s);
  return {
    actor: s, opponent: ctx.opponent, effectsMap: ctx.effectsMap, cardMap: ctx.cardMap, cards: ctx.allCards,
    phase, energyPool: pool,
    alreadyActivated: s.cpu_activated_effect_ids_this_turn ?? [],
    effectivePowers: calcFieldPowers(s, ctx.opponent, isCpuTurn, ctx.effectsMap, ctx.cardMap, phase),
    energyReserve: ctx.reserveFor(s),
    isAffordable, wholeSubstitutes,
    lookahead: isCpuTurn
      ? { ...ctx.lookahead, turnPhase: phase }
      : { ...ctx.lookahead, turnPhase: phase, isCpuTurn: false,
        powersOf: (c, o) => calcFieldPowers(c, o, false, ctx.effectsMap, ctx.cardMap, phase) },
    pool,
  };
}

/** アーツの入力（応答窓 `ATTACK_ARTS_OP` を含む）。 */
export function cpuArtsInput(ctx: CpuMoveCtx, turnPhase: TurnPhase): CpuArtsPickInput & { payer: ArtsPayerCtx } {
  const s = ctx.actor;
  const isActorTurn = turnPhase !== 'ATTACK_ARTS_OP';
  const payer = buildArtsPayerCtx({
    actor: s, opponent: ctx.opponent, isActorTurn,
    turnPhase, cardMap: ctx.cardMap, effectsMap: ctx.effectsMap,
  });
  return {
    actor: s, opponent: ctx.opponent, cards: ctx.battleCards, cardMap: ctx.cardMap, effectsMap: ctx.effectsMap,
    payer, turnPhase, alreadyUsedNums: s.cpu_used_card_nums_this_turn ?? [],
    lookahead: isActorTurn ? { ...ctx.lookahead, turnPhase } : undefined,
    energyReserve: ctx.reserveFor(s),
    // 可否の権威は人間の支払いUIと同じ `canAffordWithExtraCost`。
    isAffordable: (selectedNums, costStr, extraCosts) => isEnergyPaymentSelectionValid({
      selectedEnergyNums: selectedNums, cards: ctx.battleCards, baseCost: costStr, extraCosts,
      keywordGrants: s.keyword_grants, allMulti: payer.enaAllMulti,
      stripped: payer.enaMultiStripped, colorlessOverrides: payer.colorlessOverrides,
      colorSubs: payer.colorSubs, extraColorMap: payer.energyExtraColors,
      banColorlessPay: s.cannot_pay_colorless_this_attack_phase,
      wholeSubstitutes: payer.wholeEnergySubstitutes,
    }),
  };
}

/** メインフェイズのスペルの入力。 */
export function cpuSpellInput(ctx: CpuMoveCtx, pendingSpell: boolean): CpuMainSpellPickInput & { payer: ArtsPayerCtx } {
  const s = ctx.actor;
  const payer = buildArtsPayerCtx({
    actor: s, opponent: ctx.opponent, isActorTurn: true,
    turnPhase: 'MAIN', cardMap: ctx.cardMap, effectsMap: ctx.effectsMap,
  });
  return {
    actor: s, opponent: ctx.opponent, cards: ctx.battleCards, cardMap: ctx.cardMap, effectsMap: ctx.effectsMap,
    payer, turnPhase: 'MAIN', pendingSpell,
    alreadyUsedNums: s.cpu_used_card_nums_this_turn ?? [],
    lookahead: ctx.lookahead,
    energyReserve: ctx.reserveFor(s),
    isAffordable: (selectedNums, costStr, extraCosts) => isEnergyPaymentSelectionValid({
      selectedEnergyNums: selectedNums, cards: ctx.battleCards, baseCost: costStr, extraCosts,
      keywordGrants: s.keyword_grants, allMulti: payer.enaAllMulti,
      stripped: payer.enaMultiStripped,
      colorlessOverrides: payer.colorlessOverrides,
      colorSubs: payer.colorSubs, extraColorMap: payer.energyExtraColors,
      banColorlessPay: s.cannot_pay_colorless_this_attack_phase,
      wholeSubstitutes: payer.wholeEnergySubstitutes,
    }),
  };
}

// ─── 全体 ─────────────────────────────────────────────────────

/**
 * **その盤面・そのフェイズで CPU が取れる手を全部**並べる（CPU 自身のターンの `ENERGY`／`GROW`／`MAIN`／`ATTACK_ARTS`）。
 *
 * 並びは `cpuTurnAction` の優先順（`CPU_MOVE_PRIORITY`）＝種類の中は各列挙の順。
 * ⚠**アタック（`ATTACK_SIGNI`／`ATTACK_LRIG`）は含めない**＝`S-17` の範囲。
 * ⚠`MAIN` は `cpuTurnAction` と同じく、スペル解決待ち（`pendingSpell`）の間はレゾナ・ピース・スペルを出さない。
 */
export function listCpuMoves(ctx: CpuMoveCtx, phase: TurnPhase, opts: { pendingSpell: boolean }): CpuMove[] {
  const s = ctx.actor;
  const blockedSelf = calcContinuousBlockedActions(s, ctx.opponent, true, ctx.effectsMap, ctx.cardMap).forSelf;
  if (phase === 'ENERGY') {
    const used = s.actions_done?.includes('ENERGY') ?? false;
    const blocked = (s.blocked_actions?.includes('ENERGY') ?? false) || isPhaseSkipped('ENERGY', s, blockedSelf);
    return used || blocked ? [] : listCpuEnergyCharges(s);
  }
  if (phase === 'GROW') return canGrowNow(s, blockedSelf) ? listCpuGrows(ctx) : [];
  if (phase === 'MAIN') {
    if (isPhaseSkipped('MAIN', s, blockedSelf)) return [];
    return [
      ...listCpuDeploys(ctx),
      ...listCpuAssistGrows(ctx),
      ...(opts.pendingSpell ? [] : listCpuResonas(ctx)),
      ...listCpuRises(ctx),
      ...(opts.pendingSpell ? [] : listCpuKeyPieces(cpuKeyPieceInput(ctx, 'MAIN')).map(choice => ({ kind: 'piece' as const, choice }))),
      ...listCpuSigniActivated(cpuSigniActivatedInput(ctx, 'MAIN')).map(choice => ({ kind: 'activate' as const, choice })),
      ...listCpuLrigActivated(cpuLrigActivatedInput(ctx, 'MAIN')).map(choice => ({ kind: 'lrigActivate' as const, choice })),
      ...listCpuOffFieldActivated(cpuOffFieldInput(ctx, 'MAIN')).map(choice => ({ kind: 'offFieldActivate' as const, choice })),
      ...listCpuArts(cpuArtsInput(ctx, 'MAIN'), true).map(choice => ({ kind: 'arts' as const, choice })),
      ...listCpuMainSpells(cpuSpellInput(ctx, opts.pendingSpell)).map(choice => ({ kind: 'spell' as const, choice })),
    ];
  }
  if (phase === 'ATTACK_ARTS') {
    return [
      ...listCpuArts(cpuArtsInput(ctx, 'ATTACK_ARTS'), true).map(choice => ({ kind: 'arts' as const, choice })),
      ...(opts.pendingSpell ? [] : listCpuKeyPieces(cpuKeyPieceInput(ctx, 'ATTACK_ARTS')).map(choice => ({ kind: 'piece' as const, choice }))),
      ...listCpuSigniActivated(cpuSigniActivatedInput(ctx, 'ATTACK_ARTS')).map(choice => ({ kind: 'activate' as const, choice })),
      ...listCpuLrigActivated(cpuLrigActivatedInput(ctx, 'ATTACK_ARTS')).map(choice => ({ kind: 'lrigActivate' as const, choice })),
      ...listCpuOffFieldActivated(cpuOffFieldInput(ctx, 'ATTACK_ARTS')).map(choice => ({ kind: 'offFieldActivate' as const, choice })),
    ];
  }
  return [];
}

/** `cpuTurnAction` の優先順（フェイズごと）。探索が並べ替えを検討する前の「いまの順」。 */
export const CPU_MOVE_PRIORITY: Readonly<Partial<Record<TurnPhase, readonly CpuMoveKind[]>>> = {
  ENERGY: ['energy'],
  GROW: ['grow'],
  MAIN: ['deploy', 'assistGrow', 'resona', 'rise', 'piece', 'activate', 'lrigActivate', 'offFieldActivate', 'arts', 'spell'],
  ATTACK_ARTS: ['arts', 'piece', 'activate', 'lrigActivate', 'offFieldActivate'],
};

/** 手の短い表示（ログ・計測用）。 */
export function describeCpuMove(m: CpuMove): string {
  switch (m.kind) {
    case 'energy': return `energy:${m.id}`;
    case 'grow': return `grow:${m.card.CardNum}`;
    case 'deploy': return `deploy:${m.id}@${m.zone}`;
    case 'assistGrow': return `assistGrow:${m.card.CardNum}@${m.side}`;
    case 'resona': return `resona:${m.card.CardNum}@${m.zone}`;
    case 'rise': return `rise:${m.card.CardNum}@${m.zone}`;
    case 'piece': return `piece:${m.choice.card.CardNum}`;
    case 'activate': return `activate:${m.choice.effect.effectId}@${m.choice.zoneIndex}`;
    case 'lrigActivate': return `lrigActivate:${m.choice.effect.effectId}`;
    case 'offFieldActivate': return `offFieldActivate:${m.choice.effect.effectId}@${m.choice.zone}`;
    case 'arts': return `arts:${m.choice.card.CardNum}`;
    case 'spell': return `spell:${m.choice.card.CardNum}`;
  }
}
