import type { CardData, PlayerState, TurnPhase } from '../../types';
import type { CardEffect } from '../../types/effects';
import {
  calcContinuousBlockedActions, calcFieldPowers, collectEnergyCostSubstitutes, collectForcePlaceFrontZones,
  collectGrowCostReductions,
} from '../../engine/effectEngine';
import { banishDestination, getCardNum, getRiseRequirement, removeFromField } from '../../engine/execUtils';
import { deployLimitBlockReason, deployCountCap } from '../../engine/deployLimit';
import { isHandSigniPlayBlockedByPower } from '../../engine/blockAction';
import { buildArtsPayerCtx, hasIgnoreLrigRestriction, type ArtsPayerCtx } from './artsUseGate';
import { listAssistGrowCandidates } from './assistGrow';
import { isPhaseSkipped } from './attackStepPhase';
import { canSigniAttack, collectForcedAttackZones } from './signiAttackGate';
import { centerLrigAttackBlock } from './lrigAttackGate';
import { battleOutcome } from './battleOutcome';
import { payDeckTrashCost } from './deckTrashCost';
import { payUnderSelfTrash } from './underAnySigniCost';
import {
  applyGrowCostReduction, colorlessPayableColorsOf, isEnaMultiStripped, isEnergyPaymentSelectionValid,
  parseCoinCost, parseGrowCost,
} from './costs';
import { listCpuSigniActivated, selectEnergyIndicesForCost, type CpuActivatedChoice, type CpuEnergyReserve, type CpuSigniActivatedPickInput } from './cpuActivate';
import { listCpuArts, type CpuArtsCandidate, type CpuArtsPickInput } from './cpuArts';
import { listCpuKeyPieces, type CpuKeyPieceChoice, type CpuKeyPiecePickInput } from './cpuKeyPiece';
import { lifeCrushRisk, lrigAttackRisk } from './cpuAttackRisk';
import { cpuAttackTriggerEffectsOf, cpuOnPlayEffectsOf, simulateEffect, type LookaheadCtx } from './cpuLookahead';
import { DEFAULT_CPU_POLICY, type CpuPolicy } from './cpuPolicy';
import type { CpuComboUse, CpuDeckPlan } from './cpuDeckPlan';
import { listCpuLrigActivated, type CpuLrigActivatedChoice, type CpuLrigActivatedPickInput } from './cpuLrigActivate';
import { cpuOffFieldLedgerKey, listCpuOffFieldActivated, paidBoard, type CpuOffFieldChoice, type CpuOffFieldPickInput } from './cpuOffFieldActivate';
import { listCpuMainSpells, type CpuMainSpellPickInput, type CpuSpellChoice } from './cpuSpell';
import { paidFieldLevels, pickCpuResonaSelection, pickCpuResonaZone } from './cpuSummon';
import { buildEnergyPayPool, energyPoolCardNums, planEnergyPayment, type EnergyPayEntry } from './energyPaySource';
import { computeFieldSigniLimit } from './fieldLimit';
import { payLrigDownCost, payLrigDownSelfCost } from './lrigDownCost';
import { removeKeyToLrigTrash } from './keyZone';
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
  /**
   * 🆕§5.7 `S-31` ②＝**手札を捨てるコストで「どれを捨てるか」**に効く作戦データの加点（`planKeepBonus`）。
   * ⚠**省略できる**（渡さなければ強さだけで決める＝従来の順）。
   */
  planKeepBonus?: (id: string) => number;
  /** 🆕§5.7 `S-31` ②＝捨てる順の重み（席ごとのポリシー）。省略時は既定。 */
  policy?: CpuPolicy;
  /**
   * 🆕§5.7 `S-31` ③＝デッキの作戦データ（**札ごとの使いどころ**）。
   * 🔑**入力を組む場所（この下の `cpu*Input`）が唯一の配り口**＝探索（`listCpuMoves`）と
   *   本番の貪欲な経路（`cpuTurn.ts` が `pickCpu*` を直接呼ぶ側）の**両方が同じ入力を通る**。
   */
  plan?: CpuDeckPlan;
}

/** CPU の1手。探索（`S-16`）はこれを適用して次の盤面を作る。 */
export type CpuMove =
  /**
   * エナチャージ。🆕§5.7 `S-28`（2026-09-21）＝**場のシグニからも置ける**（人間は前から出来た）。
   * ⚠`handIndex` は `from:'hand'` のときだけ意味を持つ（`from:'field'` は `zone`）。
   */
  | { kind: 'energy'; from: 'hand'; handIndex: number; id: string }
  | { kind: 'energy'; from: 'field'; zone: number; id: string }
  | { kind: 'grow'; card: CardData; costIndices: Set<number>; pool: EnergyPayEntry[] }
  | { kind: 'deploy'; handIndex: number; id: string; zone: number }
  | { kind: 'assistGrow'; card: CardData; side: 'l' | 'r'; costIndices: Set<number>; pool: EnergyPayEntry[] }
  | { kind: 'resona'; card: CardData; candidate: ResonaSummonCandidate; selection: ResonaPaymentSelection; zone: number }
  | { kind: 'rise'; card: CardData; handIndex: number; zone: number; selection: NonNullable<ReturnType<typeof planRiseSummon>>['selection'] }
  | { kind: 'piece'; choice: CpuKeyPieceChoice; pool: EnergyPayEntry[] }
  // ⚠`pool` は支払いの内訳（`costIndices`）を実際のエナへ写すのに要る（`S-16` の `applyCpuMoveSim`）＝
  //   手が自分で持つ＝適用側が入力を組み直さない（組み直すと「列挙したときと違う pool で払う」ズレが出る）。
  | { kind: 'activate'; choice: CpuActivatedChoice; pool: EnergyPayEntry[]; phase: 'MAIN' | 'ATTACK_ARTS' }
  | { kind: 'lrigActivate'; choice: CpuLrigActivatedChoice; pool: EnergyPayEntry[]; phase: 'MAIN' | 'ATTACK_ARTS' }
  | { kind: 'offFieldActivate'; choice: CpuOffFieldChoice; pool: EnergyPayEntry[]; phase: 'MAIN' | 'ATTACK_ARTS' }
  | { kind: 'arts'; choice: CpuArtsCandidate; pool: EnergyPayEntry[]; turnPhase: TurnPhase }
  | { kind: 'spell'; choice: CpuSpellChoice; pool: EnergyPayEntry[] }
  // 🆕§5.7 `S-17` 第1段＝**アタックも1手として並べる**（順序と「撃たない」を探索で決めるための前提）。
  //   ⚠可否は `signiAttackGate` / `lrigAttackGate`（列挙はゲートを呼ぶだけ＝§5.6.3）。
  //   `forced`＝「可能ならばアタックしなければならない」対象（§6.4 `O-8`(a)）＝**選ぶ側はこれを最優先にする**。
  | { kind: 'signiAttack'; zone: number; id: string; forced: boolean }
  | { kind: 'lrigAttack' };

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

/**
 * エナフェイズに置けるもの（**手札の全部 ＋ 場のシグニの最上層の全部**）。
 * 🆕🔴§5.7 `S-28`（2026-09-21・ユーザー指摘）＝**人間は場のシグニもエナへ置けるのに、CPU は手札しか見ていなかった**
 *   （一度も踏んだことが無い機構）。🔑**良い手になる場面**＝**正面に格上がいて場に残しても邪魔なシグニ**を置けば、
 *   **手札を減らさずにレーンを空けられる**（ENERGY → MAIN の順なので同じターンに強い札で埋め直せる）。
 * ⚠**ここは絞らない**（`cpuMoves.ts` の規律＝分類・閾値・盤面評価は「選ぶ側」の仕事＝`cpuEnergyCharge.ts`）。
 * ⚠1ターン1回・封じ／スキップは `listCpuMoves` 側で見る。
 */
export function listCpuEnergyCharges(s: PlayerState): CpuMove[] {
  return [
    ...s.hand.map((id, handIndex) => ({ kind: 'energy' as const, from: 'hand' as const, handIndex, id })),
    ...s.field.signi.flatMap((stack, zone) => {
      const top = (stack ?? []).at(-1);
      return top ? [{ kind: 'energy' as const, from: 'field' as const, zone, id: top }] : [];
    }),
  ];
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
    // 🆕§5.7 `S-31` ②＝手札を捨てるコストの「どれを捨てるか」に効く（弱い札から・【ガード】と作戦の札は最後）。
    planKeepBonus: ctx.planKeepBonus, policy: ctx.policy,
    // 🆕§5.7 `S-31` ③＝「使わない」の指定。
    plan: ctx.plan,
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
    // 🆕§5.7 `S-31` ② 第2段＝手札を捨てる／エナから落とすコストの選び方に効く。
    planKeepBonus: ctx.planKeepBonus, policy: ctx.policy,
    // 🆕§5.7 `S-31` ③＝「使わない」の指定。
    plan: ctx.plan,
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
    // 🆕§5.7 `S-31` ③＝「使わない」の指定。
    plan: ctx.plan,
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
    // 🆕§5.7 `S-31` ③＝「使わない」の指定。
    plan: ctx.plan,
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
    // 🆕§5.7 `S-31` ③＝**札ごとの使いどころ**（守り／攻め／使わない）。⚠アーツだけが窓を2つ持つ。
    plan: ctx.plan,
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
    // 🆕§5.7 `S-31` ③＝「使わない」の指定。
    plan: ctx.plan,
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

/** 【起】3種（場のシグニ／センタールリグ／場以外）をまとめて列挙する（窓は `MAIN` と `ATTACK_ARTS`）。 */
export function listCpuActivateMoves(ctx: CpuMoveCtx, phase: 'MAIN' | 'ATTACK_ARTS'): CpuMove[] {
  const signiIn = cpuSigniActivatedInput(ctx, phase);
  const lrigIn = cpuLrigActivatedInput(ctx, phase);
  const offIn = cpuOffFieldInput(ctx, phase);
  return [
    ...listCpuSigniActivated(signiIn).map(choice => ({ kind: 'activate' as const, choice, pool: signiIn.pool, phase })),
    ...listCpuLrigActivated(lrigIn).map(choice => ({ kind: 'lrigActivate' as const, choice, pool: lrigIn.pool, phase })),
    ...listCpuOffFieldActivated(offIn).map(choice => ({ kind: 'offFieldActivate' as const, choice, pool: offIn.pool, phase })),
  ];
}

// ─── 全体 ─────────────────────────────────────────────────────

/**
 * **その盤面・そのフェイズで CPU が取れる手を全部**並べる（CPU 自身のターンの `ENERGY`／`GROW`／`MAIN`／`ATTACK_ARTS`）。
 *
 * 並びは `cpuTurnAction` の優先順（`CPU_MOVE_PRIORITY`）＝種類の中は各列挙の順。
 * ⚠**アタック（`ATTACK_SIGNI`／`ATTACK_LRIG`）は含めない**＝`S-17` の範囲。
 * ⚠`MAIN` は `cpuTurnAction` と同じく、スペル解決待ち（`pendingSpell`）の間はレゾナ・ピース・スペルを出さない。
 */
/**
 * 🆕§5.7 `S-17` 第1段＝**この盤面でアタックできるシグニ**（ゾーン昇順）。
 *
 * 🔴**可否は `canSigniAttack` の1本だけ**＝アタック禁止・コスト不足・パワー上限・ダウン・
 *   **強制アタックの順序規則**（`FORCED_ATTACK_ORDER`）が全部ここで効く。**列挙側で足さない。**
 * ⚠**「撃たない」は列挙では表さない**（手が無い＝空配列）＝撃つ／撃たないの判断は「選ぶ」側（`S-17` 第2段）。
 */
function listCpuSigniAttacks(ctx: CpuMoveCtx, turnPhase: TurnPhase): CpuMove[] {
  const gateBase = {
    attacker: ctx.actor, defender: ctx.opponent,
    effectsMap: ctx.effectsMap, cardMap: ctx.cardMap, turnPhase,
  };
  const forced = collectForcedAttackZones(gateBase);
  return ctx.actor.field.signi.flatMap((stack, zone) => {
    const id = (stack ?? []).at(-1);
    if (!id) return [];
    if (!canSigniAttack({ ...gateBase, attackerNum: id })) return [];
    return [{ kind: 'signiAttack' as const, zone, id, forced: forced.includes(zone) }];
  });
}

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
    const spellIn = cpuSpellInput(ctx, opts.pendingSpell);
    const artsIn = cpuArtsInput(ctx, 'MAIN');
    const pieceIn = cpuKeyPieceInput(ctx, 'MAIN');
    return [
      ...listCpuDeploys(ctx),
      ...listCpuAssistGrows(ctx),
      ...(opts.pendingSpell ? [] : listCpuResonas(ctx)),
      ...listCpuRises(ctx),
      ...(opts.pendingSpell ? [] : listCpuKeyPieces(pieceIn).map(choice => ({ kind: 'piece' as const, choice, pool: pieceIn.payer.energyPayPool }))),
      ...listCpuActivateMoves(ctx, 'MAIN'),
      ...listCpuArts(artsIn, true).map(choice => ({ kind: 'arts' as const, choice, pool: artsIn.payer.energyPayPool, turnPhase: 'MAIN' as TurnPhase })),
      ...listCpuMainSpells(spellIn).map(choice => ({ kind: 'spell' as const, choice, pool: spellIn.payer.energyPayPool })),
    ];
  }
  // 🆕§5.7 `S-17` 第1段＝**アタックの列挙**。
  //   ⚠`ATTACK_SIGNI` の順序規則（強制対象が先）は **`canSigniAttack` の中**で効く（ここに写経しない）＝
  //     強制対象が残っている間、他のゾーンは `FORCED_ATTACK_ORDER` で**そもそも候補に出ない**。
  if (phase === 'ATTACK_SIGNI') return listCpuSigniAttacks(ctx, phase);
  if (phase === 'ATTACK_LRIG') return centerLrigAttackBlock(s) === null ? [{ kind: 'lrigAttack' }] : [];
  if (phase === 'ATTACK_ARTS') {
    const artsIn = cpuArtsInput(ctx, 'ATTACK_ARTS');
    const pieceIn = cpuKeyPieceInput(ctx, 'ATTACK_ARTS');
    return [
      ...listCpuArts(artsIn, true).map(choice => ({ kind: 'arts' as const, choice, pool: artsIn.payer.energyPayPool, turnPhase: 'ATTACK_ARTS' as TurnPhase })),
      ...(opts.pendingSpell ? [] : listCpuKeyPieces(pieceIn).map(choice => ({ kind: 'piece' as const, choice, pool: pieceIn.payer.energyPayPool }))),
      ...listCpuActivateMoves(ctx, 'ATTACK_ARTS'),
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
  ATTACK_SIGNI: ['signiAttack'],
  ATTACK_LRIG: ['lrigAttack'],
};

// ─── 探索用の1手適用（§5.7 `S-16`）────────────────────────────────

/** 1手を適用した結果の盤面（探索用＝**engine だけ**・本番の `perform*` は通らない）。 */
export interface CpuSimBoard {
  cpu: PlayerState;
  opp: PlayerState;
  /**
   * 🆕§5.7 `S-17` 第3段＝**この1手で背負った期待損**（パワー換算・省略＝0）。
   *
   * 🔑**なぜ盤面ではなく別の口なのか**＝ライフバースト・ガードは**確率**で効くので、
   *   盤面（ライフ何枚・手札何枚）という**離散の形では表せない**（「0.49枚割れた」は書けない）。
   *   ⇒ **点数から引く期待値のチャンネル**を1本だけ足した（`cpuSearch` が `evaluateBoard` から差し引く）。
   * ⚠**増分**＝手順に沿って累積するのは `cpuSearch` 側（ここは「その1手ぶん」だけ返す）。
   * ⚠**`evaluateBoard` と同じ尺度**（パワー換算）＝別の単位を混ぜない。
   */
  risk?: number;
}

/**
 * 🆕§5.7 `S-16`＝**探索用の1手適用**（`applyCpuMove` の探索側の実装）。
 *
 * 🔴**本番用（`cpuTurnAction` の `perform*`）とは別実装**＝**列挙は1本のまま**（`listCpuMoves`）で、
 *   ここは「engine だけで**近似的に**進めて、次の候補を出し直せる盤面を作る」ことだけを担う。
 * ■ できること＝支払い（エナ・シグニのコスト）を写し、**使用済みの印**（`cpu_used_card_nums_this_turn` /
 *   `cpu_activated_effect_ids_this_turn`）を刻み、効果を `simulateEffect` で解決する。
 *   ⇒ **同じ手を2回選ばない**・**ドローで増えた選択肢が次の列挙に入る**（`S-16` のビーム探索の前提）。
 * ■ 🔴**近似（`S-4` から引き継ぐ限界）**＝誘発の連鎖・スタック・相手の応答は解かない。
 *   ⇒ 探索の評価は**近似**で、実際に打つのは本番の `perform*`（そちらが正）。
 * ■ 🔴**まだ適用できない手は `null` を返す**（`assistGrow` / `resona` / `rise` / `piece`）＝
 *   engine だけで置き換えるには実行関数（`performAssistGrow`／`performSummonSigni`／`performKeyPiece`）の
 *   盤面操作を写す必要があり、**写経すると本番とズレる**（§5.6.3）。**探索はこれらを候補から外し、従来の優先順に委ねる。**
 *   ⚠**「適用できない」を「弱い手」と混同しない**＝点数0で並べるのではなく、探索の外に置く。
 */
/**
 * 🆕§5.7 `S-21`＝**探索用の「エナ以外の宣言コスト」の支払い**（2026-09-20）。
 *
 * 🔴**何が壊れていたか**＝`applyCpuMoveSim` の【起】は**エナしか払っていなかった**。
 *   実測（live JSON 全数）＝`ACTIVATED` 2,632効果のうち **569効果がエナ以外のコストを持つ**
 *   （`down_self` 284 / `coin` 130 / `trash_self` 74 / `trash_key` 46 / `fieldDown` 15 / `lrigDown` 13 /
 *     `discardAll` 6 / `energyTrashAll` 5 / `acceTrash` 3 / `bounceSelf` 1 / `fieldExileSelf` 1）。
 *   ⇒ **探索はそれらを「タダ」と見ていた**＝`trash_self` なら**シグニを残したまま効果だけ得る**、
 *   `discardAll` なら**手札を捨てずに効果だけ得る**と採点していた。
 * 🔑**これが `S-21`（行動する／しない）の半分**＝**コストを数えない目的関数は「行動は安い」と言い続ける**。
 * 🔴**実行関数の写経ではない**（§5.6.3）＝ルリグのダウンは既存の純関数
 *   （`payLrigDownCost` / `payLrigDownSelfCost`＝人間の支払いと同じ本体）を呼ぶ。
 * ⚠**allowlist＝払い方を知らないキーが1つでもあれば `null`**（＝探索の外へ出す）。
 *   **denylist にしない**＝してしまうと新しいコスト語彙が増えたときに**黙って踏み倒す**側へ倒れる。
 * ⚠ここは**探索の近似のみ**＝本番の支払いは `perform*`（そちらが正）。離場の誘発は解かない。
 */
const CPU_SIM_PAYABLE_COST_KEYS: ReadonlySet<string> = new Set([
  // エナ側＝呼び出し元が `payEnergy` で既に払っている（ここでは何もしない）。
  'energy', 'none', 'costScaling', 'costReplacement',
  // 盤面側＝下の `payCpuSelfCostSim` が写す。
  'coin', 'down_self', 'lrigDown', 'fieldDown', 'trash_self', 'trash_key', 'discardAll', 'energyTrashAll',
  // 🆕§5.7 `S-31` ②＝手札を捨てるコスト。🔴**探索にも同じ札を払わせる**
  //   （払わないと探索には「タダで撃てる【起】」に見えて過大評価になる＝`S-21` で踏んだ穴と同型）。
  'discard', 'discardFilter', 'handDiscardSigni',
  // 🆕§5.7 `S-31` ② 第2段＝エナ・場から払うコスト（🔴払わせないと探索には「タダ」に見える）。
  'energyTrash', 'fieldTrash',
  // 🆕§5.7 `S-31` ② 第3段＝自分の盤面・デッキから払うコスト。
  //   ⚠**`removeOppVirus`／`exceedColors`／`fieldBanish`／`fieldToDeckTop` は載せない**＝
  //     相手の盤面・ルリグの下・エナ／デッキの上への行き先をこの近似は持っていない。
  //     載せないと `payCpuSelfCostSim` が `null` を返す＝**その手は探索の外**（＝従来の優先順で撃つ）。
  //     🔑「払い方を知らないなら探索に入れない」＝タダで撃てると誤って採点するより安全側。
  'underSelfTrash', 'charmTrash', 'selfPowerDown', 'deckTrash',
  // 🆕§5.7 `S-31` ② 第4段＝この回に支払いを新設したキー（下の `payCpuSelfCostSim` が写す）。
  //   ⚠**`fieldToLrigTrash` は載せない**＝行き先（ルリグトラッシュ）をこの近似が持っていない
  //     ＝`null` を返して**その手は探索の外**（従来の優先順で撃つ）。
  'selfToDeckBottom', 'chargeCounterRemove', 'trashArtsFromLrigDeck',
  // 🆕§5.7 `S-31` ② 第5段＝`fieldDown` は既に写している（上の行）。
  //   ⚠**`exceed`／`underAnySigniTrash`／`multiZoneExile`／`life_crash`／`costSubstitute` は載せない**＝
  //     ルリグの下・下敷き・複数ゾーン・ライフの近似をこの盤面模型が持っていない ⇒ `null`＝その手は探索の外。
]);

/**
 * 【起】の「エナ以外」を探索用の盤面へ写す（払えなければ `null`）。
 * @param zoneIndex 場のシグニの【起】ならそのゾーン、ルリグの【起】なら `null`。
 */
function payCpuSelfCostSim(
  cost: CardEffect['cost'], s: PlayerState, zoneIndex: number | null, cardMap: Map<string, CardData>,
  sourceCardNum: string,
  /** 🆕§5.7 `S-31` ②＝手札を捨てるコストで実際に払う index（本番と同じ選択を渡す）。 */
  handDiscardIndices?: Set<number>,
  /** 🆕§5.7 `S-31` ② 第2段＝エナから落とす index／場からトラッシュするゾーン（本番と同じ選択）。 */
  energyTrashIndices?: Set<number>,
  fieldTrashZones?: Set<number>,
  /** 🆕§5.7 `S-31` ② 第3段＝効果元の下から落とすカード（本番と同じ選択）。 */
  underTrashKeys?: Set<string>,
  /** 🆕§5.7 `S-31` ② 第4段＝ルリグデッキから徴収するアーツ（本番と同じ選択）。 */
  trashArtsNums?: string[],
): PlayerState | null {
  if (!cost) return s;
  for (const k of Object.keys(cost)) {
    if ((cost as Record<string, unknown>)[k] === undefined) continue;
    if (!CPU_SIM_PAYABLE_COST_KEYS.has(k)) return null;   // ⚠allowlist＝知らないコストは探索の外へ
  }
  let out = s;
  // 🆕§5.7 `S-31` ②＝手札を捨てるコスト（**本番が選んだ index をそのまま払う**）。
  if (cost.discard !== undefined || cost.handDiscardSigni !== undefined) {
    const need = (cost.discard ?? 0) + (cost.handDiscardSigni?.count ?? 0);
    const idx = [...(handDiscardIndices ?? [])];
    if (idx.length < need) return null;   // ⚠選べていないなら探索の外（タダで撃たせない）
    const drop = new Set(idx);
    out = {
      ...out,
      hand: out.hand.filter((_, i) => !drop.has(i)),
      trash: [...out.trash, ...idx.map(i => out.hand[i]).filter((n): n is string => !!n)],
    };
  }
  // 🆕§5.7 `S-31` ② 第2段＝エナから落とすコスト（**本番が選んだ index をそのまま払う**）。
  if (cost.energyTrash !== undefined) {
    const idx = [...(energyTrashIndices ?? [])];
    if (idx.length < (cost.energyTrash.count ?? 0)) return null;
    const drop = new Set(idx);
    out = {
      ...out,
      energy: out.energy.filter((_, i) => !drop.has(i)),
      trash: [...out.trash, ...idx.map(i => out.energy[i]).filter((n): n is string => !!n)],
    };
  }
  // 🆕§5.7 `S-31` ② 第2段＝場からトラッシュするコスト。
  if (cost.fieldTrash !== undefined) {
    const zones = [...(fieldTrashZones ?? [])];
    if (zones.length < (cost.fieldTrash.upToCount ? 0 : (cost.fieldTrash.count ?? 0))) return null;
    let cur = out;
    for (const zi of zones) {
      const top = cur.field.signi[zi]?.at(-1);
      if (!top) return null;
      cur = removeFromField(top, cur);
      cur = { ...cur, trash: [...cur.trash, top] };
    }
    out = cur;
  }
  // 🆕§5.7 `S-31` ② 第3段＝効果元の下から落とすコスト（**本番が選んだキーをそのまま払う**）。
  //   ⚠支払いは人間・CPU と同じ `payUnderSelfTrash`（写経しない）＝ゾーンは効果元のスタック。
  if (cost.underSelfTrash !== undefined) {
    if (zoneIndex === null) return null;
    const paidUnder = payUnderSelfTrash(
      out, zoneIndex, underTrashKeys ?? new Set(), cost.underSelfTrash.count, cardMap,
      cost.underSelfTrash.filter, cost.underSelfTrash.selectionConstraint);
    if (!paidUnder) return null;
    out = paidUnder.state;
  }
  // 🆕§5.7 `S-31` ② 第3段＝チャームをトラッシュするコスト（**支払い側と同じ軸**＝先頭ゾーンから自動）。
  if (cost.charmTrash !== undefined && cost.charmTrash > 0) {
    const charms = [...(out.field.signi_charms ?? [null, null, null])];
    const moved: string[] = [];
    for (let zi = 0; zi < charms.length && moved.length < cost.charmTrash; zi++) {
      if (charms[zi]) { moved.push(charms[zi]!); charms[zi] = null; }
    }
    if (moved.length < cost.charmTrash) return null;
    out = { ...out, field: { ...out.field, signi_charms: charms }, trash: [...out.trash, ...moved] };
  }
  // 🆕§5.7 `S-31` ② 第3段＝効果元のパワーを下げる自傷コスト（ターン終了時まで）。
  if (cost.selfPowerDown !== undefined) {
    out = { ...out, temp_power_mods: [...(out.temp_power_mods ?? []),
      { cardNum: sourceCardNum, delta: -cost.selfPowerDown, srcCardNum: sourceCardNum }] };
  }
  // 🆕§5.7 `S-31` ② 第3段＝デッキの上から落とすコスト（**支払いは本番と同じ funnel**）。
  if (cost.deckTrash !== undefined) {
    out = payDeckTrashCost(out, cost.deckTrash).state;
  }
  // 🆕§5.7 `S-31` ② 第4段＝効果元を場からデッキの一番下へ（`trash_self` と行き先だけが違う）。
  if (cost.selfToDeckBottom) {
    if (!out.field.signi.some(stack => stack?.at(-1) === sourceCardNum)) return null;
    const afterD = removeFromField(sourceCardNum, out);
    out = { ...afterD, deck: [...afterD.deck, sourceCardNum] };
  }
  // 🆕§5.7 `S-31` ② 第4段＝効果元の上のカウンター（【貯菌】）をN個取り除く。
  if (cost.chargeCounterRemove !== undefined) {
    if (zoneIndex === null) return null;
    const chokkinSim = [...(out.field.signi_chokkin ?? [0, 0, 0])];
    if ((chokkinSim[zoneIndex] ?? 0) < cost.chargeCounterRemove) return null;
    chokkinSim[zoneIndex] -= cost.chargeCounterRemove;
    out = { ...out, field: { ...out.field, signi_chokkin: chokkinSim } };
  }
  // 🆕§5.7 `S-31` ② 第4段＝ルリグデッキのアーツ徴収（**本番が選んだ札をそのまま払う**）。
  if (cost.trashArtsFromLrigDeck !== undefined) {
    const nums = (trashArtsNums ?? []).filter(n => out.lrig_deck.includes(n));
    if (nums.length < cost.trashArtsFromLrigDeck.count) return null;
    out = {
      ...out,
      lrig_deck: out.lrig_deck.filter(n => !nums.includes(n)),
      lrig_trash: [...out.lrig_trash, ...nums],
    };
  }
  if (cost.coin !== undefined) {
    if ((out.coins ?? 0) < cost.coin) return null;
    // ⚠**`coins_paid_this_turn` も必ず加算する**＝`COINS_PAID_THIS_TURN` 条件がこれを読む
    //   （golden `task12(cxvi)` が「払ったのに累計へ加算しない経路」を全数で見張っている）。
    out = { ...out, coins: (out.coins ?? 0) - cost.coin, coins_paid_this_turn: (out.coins_paid_this_turn ?? 0) + cost.coin };
  }
  if (cost.down_self) {
    if (zoneIndex === null) {
      const paid = payLrigDownSelfCost(out);
      if (!paid) return null;
      out = paid;
    } else {
      // ⚠既にダウンしていれば払えない（`performSigniActivated` と同じ多重発動防止）。
      if (out.field.signi_down?.[zoneIndex]) return null;
      const down = [...(out.field.signi_down ?? [false, false, false])];
      down[zoneIndex] = true;
      out = { ...out, field: { ...out.field, signi_down: down } };
    }
  }
  if (cost.lrigDown) {
    const paid = payLrigDownCost(out, cost.lrigDown, cardMap);
    if (!paid) return null;
    out = paid.state;
  }
  if (cost.fieldDown) {
    // ⚠**近似**＝ゾーン番号の順にアップのシグニをダウンする（`filter` は見ない＝
    //   見ない分だけ**払える側に償いすぎる**ので、本番で払えなければそこで止まる）。
    const down = [...(s.field.signi_down ?? [false, false, false])];
    let remaining = cost.fieldDown.count;
    for (let zi = 0; zi < 3 && remaining > 0; zi++) {
      if ((out.field.signi[zi] ?? []).length === 0 || down[zi]) continue;
      if (cost.fieldDown.excludeSelf && zi === zoneIndex) continue;
      down[zi] = true;
      remaining--;
    }
    if (remaining > 0) return null;
    out = { ...out, field: { ...out.field, signi_down: down } };
  }
  if (cost.trash_self) {
    if (zoneIndex === null) return null;
    const stack = out.field.signi[zoneIndex] ?? [];
    if (stack.length === 0) return null;
    const signi = [...out.field.signi] as (string[] | null)[];
    signi[zoneIndex] = null;
    const down = [...(out.field.signi_down ?? [false, false, false])];
    down[zoneIndex] = false;
    out = { ...out, trash: [...out.trash, ...stack], field: { ...out.field, signi, signi_down: down } };
  }
  if (cost.trash_key) {
    // 🔴**果を見分けるのは共有の純関数**（`removeKeyToLrigTrash`）＝`key_piece` を無条件に `null` にすると
    //   増設枠のキーを払ったときに**メイン枠のキーが消滅**する（§5.6 `C-9` `R-46` の旧実装の穴）。
    const k = removeKeyToLrigTrash(out.field, [...out.lrig_trash], sourceCardNum);
    if (!k.removed) return null;   // ⚠見つからなければ探索の外へ（fail-closed）
    out = { ...out, field: k.field, lrig_trash: k.lrigTrash };
  }
  if (cost.discardAll) out = { ...out, hand: [], trash: [...out.trash, ...out.hand] };
  if (cost.energyTrashAll) out = { ...out, energy: [], trash: [...out.trash, ...out.energy] };
  return out;
}

/**
 * 🆕§5.7 `S-17` 第2段＝**ライフクロスを1枚クラッシュした盤面**（近似）。
 *
 * 🔴**近似（正直に）**＝本番（`resolveSigniBattle`）はチェックゾーンへ置き → **ライフバースト**の応答 →
 *   エナゾーンへ、と進む。ここは**バーストを解かず**にエナへ直行する（＝**盤面としては常に「無い」と読む**）。
 * 🆕§5.7 `S-17` 第3段（2026-09-21）＝**上振れ分は `risk`（期待損）で引く**（`cpuAttackRisk.lifeCrushRisk`）＝
 *   盤面は楽観のまま・点数だけ確率で割り引く。⚠**既定は `lifeBurstCost: 0`＝第2段と同じ楽観**。
 *   🔴**どのライフクロスが来るかは見ない**（伏せ札＝カンニング）＝公開ゾーンから出した事前確率だけを使う。
 * ⚠ライフが0枚なら何も起きない（本番はここで勝敗判定＝探索では見ない）。
 */
/** 探索が使うポリシー（席ごとに違う＝`DEFAULT_CPU_POLICY` を直接読まない＝A/B が効かなくなる）。 */
const policyOf = (ctx: CpuMoveCtx): CpuPolicy => ctx.lookahead.policy ?? DEFAULT_CPU_POLICY;

function simCrushLife(defender: PlayerState): PlayerState {
  const crashed = defender.life_cloth.at(-1);
  if (!crashed) return defender;
  return {
    ...defender,
    life_cloth: defender.life_cloth.slice(0, -1),
    energy: [...defender.energy, crashed],
    life_crashed_this_turn: (defender.life_crashed_this_turn ?? 0) + 1,
  };
}

/** アタックしたシグニをダウンさせる（本番の `performSigniAttack` と同じ印＝同じ手を2回選ばない）。 */
function simDownAttacker(attacker: PlayerState, zone: number, id: string): PlayerState {
  const down = [...(attacker.field.signi_down ?? [false, false, false])];
  down[zone] = true;
  return {
    ...attacker,
    field: { ...attacker.field, signi_down: down },
    attacked_signi_ids: [...(attacker.attacked_signi_ids ?? []), id],
  };
}

/**
 * 🆕§5.7 `S-17` 第2段＝**シグニ1体のアタックを近似で適用する**。
 *
 * ■ 進める順（本番と同じ並び）＝①アタック宣言でダウン ②**`ON_ATTACK_SIGNI` の【自】**（順序が意味を持つ本体）
 *   ③正面が居ればバトル（`battleOutcome`＝**規則は純関数1本**）→ バニッシュの行き先は engine の `banishDestination`
 *   ④正面が空ならライフクラッシュ（`simCrushLife`）。
 * ■ 🔴**解かないもの**＝ライフバースト・ガード・防御アーツ・バニッシュ時の誘発（`ON_BANISH`／`ON_LEAVE_FIELD`）・
 *   アタック時のコスト（《無》の前払い・場のシグニをトラッシュする条件）。**本番の `perform*` が正**。
 * ■ ⚠**アタックのコストを払っていない**＝`signiAttackGate` は「払えるか」を見て候補に出すので、
 *   **探索の中ではコスト分だけ得に見える**（第1段の実測＝その形の札は live で少数）。第3段で詰める。
 */
function simAttack(ctx: CpuMoveCtx, zone: number, id: string): CpuSimBoard | null {
  let cpu = simDownAttacker(ctx.actor, zone, id);
  let opp = ctx.opponent;
  const lctx: LookaheadCtx = { ...ctx.lookahead, turnPhase: 'ATTACK_SIGNI' };
  for (const e of cpuAttackTriggerEffectsOf(id, 'ON_ATTACK_SIGNI', cpu, opp, lctx)) {
    const after = simulateEffect(e, id, cpu, opp, lctx);
    // ⚠解けない【自】は**飛ばす**（`scoreDeploy` と同じ扱い＝効果の分は見ないが盤面は進める）。
    if (!after) continue;
    cpu = after.cpu; opp = after.opp;
  }
  // ⚠**誘発で盤面が動いたあとの正面**を見る（先に決め打つと「自分で退けた相手」と殴り合う）。
  const facing = opp.field.signi[2 - zone]?.at(-1);
  // 🆕§5.7 `S-17` 第3段＝ライフを割るなら**バーストの期待損**を背負う（既定 0＝見ない）。
  // 🔴**割るライフが無ければ期待損も無い**＝`simCrushLife` は何もしない（得も損も出ない）＝
  //   ここを分けないと**盤面は動かないのに点数だけ下がる**＝探索が「撃たない」へ倒れる。
  if (!facing) {
    const crushes = opp.life_cloth.length > 0;
    return { cpu, opp: simCrushLife(opp), risk: crushes ? lifeCrushRisk(opp, ctx.cardMap, policyOf(ctx)) : 0 };
  }
  const myPowers = calcFieldPowers(cpu, opp, true, ctx.effectsMap, ctx.cardMap, 'ATTACK_SIGNI');
  const opPowers = calcFieldPowers(opp, cpu, false, ctx.effectsMap, ctx.cardMap, 'ATTACK_SIGNI');
  // ⚠**実効パワー（`calcFieldPowers`）が無い札は CSV の素のパワー**（`∞` は engine 側が数値化済み）。
  const powerOf = (num: string, powers: Map<string, number>): number =>
    powers.get(num) ?? (parseInt(ctx.cardMap.get(getCardNum(num))?.Power ?? '0', 10) || 0);
  const outcome = battleOutcome(powerOf(id, myPowers), powerOf(facing, opPowers));
  if (!outcome.banishDefender) return { cpu, opp };
  // バニッシュ＝**行き先は engine の1本**（レゾナ・クラフト・置換で変わる）。⚠誘発（`ON_BANISH`）は解かない。
  const removed = removeFromField(facing, opp);
  return { cpu, opp: banishDestination(removed, cpu, facing, { cardMap: ctx.cardMap }).state };
}

/**
 * 🆕§5.7 `S-17` 第2段＝**センタールリグのアタック**（近似）。
 * 🔴**ガードを解かない**＝相手の手札の【ガード】は非公開（枚数だけが公開情報）＝盤面は「通る」前提＝**楽観**。
 * 🆕§5.7 `S-17` 第3段（2026-09-21）＝**その上振れ分を `risk` で引く**（`cpuAttackRisk.lrigAttackRisk`）＝
 *   **ガードされる確率は相手の手札の「枚数」だけ**から出す（中身は読まない）。⚠既定 `guardDeckCount: 0` ＝見ない。
 */
function simLrigAttack(ctx: CpuMoveCtx): CpuSimBoard | null {
  let cpu: PlayerState = { ...ctx.actor, field: { ...ctx.actor.field, lrig_down: true } };
  let opp = ctx.opponent;
  const lrig = ctx.actor.field.lrig.at(-1);
  if (lrig) {
    const lctx: LookaheadCtx = { ...ctx.lookahead, turnPhase: 'ATTACK_LRIG' };
    for (const e of cpuAttackTriggerEffectsOf(lrig, 'ON_ATTACK_LRIG', cpu, opp, lctx)) {
      const after = simulateEffect(e, lrig, cpu, opp, lctx);
      if (!after) continue;
      cpu = after.cpu; opp = after.opp;
    }
  }
  const policy = policyOf(ctx);
  // ⚠**誘発で盤面が動いたあと**の相手を見る（`simAttack` と同じ＝先に決め打つと自分で減らした手札を数える）。
  // 🔴**割るライフが無ければ期待損も無い**（`simAttack` と同じ理由）。
  const risk = opp.life_cloth.length > 0 ? lrigAttackRisk(opp, ctx.cardMap, policy, policy.boardWeights) : 0;
  return { cpu, opp: simCrushLife(opp), risk };
}

export function applyCpuMoveSim(ctx: CpuMoveCtx, move: CpuMove): CpuSimBoard | null {
  const { actor, opponent } = ctx;
  /** エナの支払いを写す（人間の支払いと同じ `planEnergyPayment`＝下敷き払いも含む）。 */
  const payEnergy = (s: PlayerState, pool: readonly EnergyPayEntry[], costIndices: ReadonlySet<number>): PlayerState =>
    planEnergyPayment(s, pool, costIndices).applyTo(s);
  const markUsed = (s: PlayerState, cardNum: string): PlayerState =>
    ({ ...s, cpu_used_card_nums_this_turn: [...(s.cpu_used_card_nums_this_turn ?? []), cardNum] });
  const markActivated = (s: PlayerState, key: string): PlayerState =>
    ({ ...s, cpu_activated_effect_ids_this_turn: [...(s.cpu_activated_effect_ids_this_turn ?? []), key] });
  const lctxOf = (turnPhase: TurnPhase): LookaheadCtx => ({ ...ctx.lookahead, turnPhase });
  /** カードの `ACTIVATED` を順に解決する（1つでも解けなければ null＝先読みで判断しない）。 */
  const resolveActivated = (id: string, cpu: PlayerState, opp: PlayerState, turnPhase: TurnPhase): CpuSimBoard | null => {
    const acts = ctx.lookahead.effectsOf(id).filter(e => e.effectType === 'ACTIVATED');
    if (acts.length === 0) return null;
    let a = cpu, b = opp;
    for (const e of acts) {
      const after = simulateEffect(e, id, a, b, lctxOf(turnPhase));
      if (!after) return null;
      a = after.cpu; b = after.opp;
    }
    return { cpu: a, opp: b };
  };

  switch (move.kind) {
    case 'energy': {
      // ⚠1ターン1回＝`actions_done` に刻む（刻まないと探索が何枚でもエナに置ける）。
      // 🆕§5.7 `S-28`＝場から置く場合はそのゾーンの最上層を外す。
      // ⚠**近似**＝相手の「エナチャージの色制限」（トラッシュ送り）は解かない（本番は `performEnergyCharge` が正）。
      const base: PlayerState = move.from === 'hand'
        ? { ...actor, hand: actor.hand.filter((_, i) => i !== move.handIndex) }
        : (() => {
          const signi = [...actor.field.signi] as (string[] | null)[];
          const rest = (signi[move.zone] ?? []).slice(0, -1);
          signi[move.zone] = rest.length > 0 ? rest : null;
          return { ...actor, field: { ...actor.field, signi } };
        })();
      const cpu: PlayerState = {
        ...base,
        energy: [...base.energy, move.id],
        actions_done: [...(base.actions_done ?? []), 'ENERGY'],
      };
      return { cpu, opp: opponent };
    }
    case 'grow': {
      const inst = actor.lrig_deck.find(id => getCardNum(id) === move.card.CardNum);
      if (!inst) return null;
      const paid = payEnergy(actor, move.pool, move.costIndices);
      // ⚠近似＝グロウ時の誘発（`ON_GROW`）・コイン・アシストの起き直しは解かない（本番の `performGrow` が正）。
      // ⚠**`actions_done` に `'GROW'` を刻む**（`performGrow` と同じ）＝刻まないと探索が同じターンに何回でもグロウする。
      return {
        cpu: {
          ...paid,
          actions_done: [...(paid.actions_done ?? []), 'GROW'],
          field: { ...paid.field, lrig: [...paid.field.lrig, inst] },
          lrig_deck: paid.lrig_deck.filter(id => id !== inst),
        },
        opp: opponent,
      };
    }
    case 'deploy': {
      const card = ctx.cardMap.get(getCardNum(move.id));
      if (!card) return null;
      const energy = cpuPaySigniCostEnergy(ctx, actor, card);
      if (!energy) return null;
      const signi = [...actor.field.signi] as (string[] | null)[];
      signi[move.zone] = [move.id];
      let cpu: PlayerState = {
        ...actor, energy,
        hand: actor.hand.filter(h => h !== move.id),
        field: { ...actor.field, signi },
      };
      let opp = opponent;
      // 【出】＝CPU の通常召喚と同じ絞り込み（`cpuOnPlayEffectsOf`）。解けないものは飛ばす（`scoreDeploy` と同じ扱い）。
      for (const e of cpuOnPlayEffectsOf(move.id, cpu, opp, ctx.lookahead)) {
        const after = simulateEffect(e, move.id, cpu, opp, lctxOf('MAIN'));
        if (!after) continue;
        cpu = after.cpu; opp = after.opp;
      }
      return { cpu, opp };
    }
    case 'activate': {
      // 🆕§5.7 `S-21`＝**エナ以外の宣言コストも払う**（【起】の 569効果）。
      //   🔴旧はエナしか払わず、**《ダウン》も「自分をトラッシュ」もタダに見えていた**。
      const selfPaid = payCpuSelfCostSim(move.choice.effect.cost, actor, move.choice.zoneIndex, ctx.cardMap, move.choice.cardNum, move.choice.discardIndices, move.choice.energyTrashIndices, move.choice.fieldTrashZones, move.choice.underTrashKeys);
      if (!selfPaid) return null;
      const paid = markActivated(payEnergy(selfPaid, move.pool, move.choice.costIndices), move.choice.effect.effectId);
      return simulateEffect(move.choice.effect, move.choice.cardNum, paid, opponent, lctxOf(move.phase));
    }
    case 'lrigActivate': {
      const src = actor.field.lrig.at(-1);
      if (!src) return null;
      // 🆕§5.7 `S-21`＝ルリグの【起】は `zoneIndex: null`（`down_self` は**ルリグ自身**をダウン）。
      const selfPaid = payCpuSelfCostSim(move.choice.effect.cost, actor, null, ctx.cardMap, getCardNum(src), move.choice.handDiscardIndices, move.choice.energyTrashIndices, move.choice.fieldBanishZones, undefined, move.choice.trashArtsNums);
      if (!selfPaid) return null;
      const paid = markActivated(payEnergy(selfPaid, move.pool, move.choice.costIndices), move.choice.effect.effectId);
      return simulateEffect(move.choice.effect, src, paid, opponent, lctxOf(move.phase));
    }
    case 'offFieldActivate': {
      // 支払いは `cpuOffFieldActivate` の `paidBoard`（トラッシュ／手札それぞれ本番と同じ支払い関数）。
      const paid = paidBoard(move.choice, actor, opponent, ctx.cardMap, move.pool);
      if (!paid) return null;
      const marked = markActivated(paid.cpu, cpuOffFieldLedgerKey(move.choice.effect.effectId, move.choice.cardNum));
      return simulateEffect(move.choice.effect, move.choice.cardNum, marked, paid.opp, lctxOf(move.phase));
    }
    case 'arts': {
      const inst = actor.lrig_deck.find(id => getCardNum(id) === move.choice.card.CardNum) ?? move.choice.card.CardNum;
      const paid = markUsed(payEnergy(actor, move.pool, move.choice.costIndices), move.choice.card.CardNum);
      const used: PlayerState = { ...paid, lrig_deck: paid.lrig_deck.filter(id => id !== inst) };
      return resolveActivated(inst, used, opponent, move.turnPhase);
    }
    case 'spell': {
      const inst = actor.hand[move.choice.handIndex];
      if (!inst) return null;
      const paid = markUsed(payEnergy(actor, move.pool, move.choice.costIndices), move.choice.card.CardNum);
      // ⚠近似＝スペルは解決後にトラッシュへ置かれる（カットイン窓・置換は解かない）。
      const used: PlayerState = {
        ...paid,
        hand: paid.hand.filter((_, i) => i !== move.choice.handIndex),
        trash: [...paid.trash, inst],
      };
      return resolveActivated(inst, used, opponent, 'MAIN');
    }
    // 🔴engine だけでは写せない（実行関数の盤面操作を写経しない＝§5.6.3）。探索はこの手を扱わない。
    case 'assistGrow': case 'resona': case 'rise': case 'piece': return null;
    // 🆕§5.7 `S-17` 第2段＝**アタックの近似適用**（下の `simAttack` が本体・限界もそこに書いてある）。
    case 'signiAttack': return simAttack(ctx, move.zone, move.id);
    case 'lrigAttack': return simLrigAttack(ctx);
  }
}

/** 探索用の適用ができる手の種類（できないものは従来の優先順に委ねる＝上の `applyCpuMoveSim`）。 */
export const CPU_SIM_APPLICABLE_KINDS: ReadonlySet<CpuMoveKind> =
  new Set<CpuMoveKind>(['energy', 'grow', 'deploy', 'activate', 'lrigActivate', 'offFieldActivate', 'arts', 'spell', 'signiAttack', 'lrigAttack']);

/**
 * 🆕**その手が作戦データ（`S-2`）のどの「手」に当たるか**（§5.7 `S-14`・2026-09-21）。
 * 🔑**コンボの「使い方」と突き合わせる唯一の場所**＝`planUseBonus` はここが返した `{num, use}` だけを見る。
 * ⚠**ルリグの【起】は `choice` に札を持たない**＝センタールリグの一番上で代用する
 *   （付与・継承された【起】は当たらない＝**加点0**＝安全側に外す）。
 *   🔴**`effectId` からカード番号を正規表現で削り出さない**（接尾辞が開いた集合＝実測で95件外れる）。
 * ⚠`resona`／`rise` は**まだ探索に入らない**（`CPU_SIM_APPLICABLE_KINDS` の外）＝いまは加点が届かないが、
 *   入ったときに黙って落ちないよう対応づけだけ書いてある。
 */
export function cpuPlanMoveStep(m: CpuMove, st: PlayerState): { num: string; use: CpuComboUse } | null {
  switch (m.kind) {
    case 'deploy': return { num: getCardNum(m.id), use: 'deploy' };
    case 'resona': case 'rise': return { num: m.card.CardNum, use: 'deploy' };
    case 'activate': case 'offFieldActivate': return { num: getCardNum(m.choice.cardNum), use: 'activate' };
    case 'lrigActivate': {
      const top = st.field.lrig.at(-1);
      return top ? { num: getCardNum(top), use: 'activate' } : null;
    }
    case 'arts': return { num: m.choice.card.CardNum, use: 'arts' };
    case 'spell': return { num: m.choice.card.CardNum, use: 'spell' };
    default: return null;
  }
}

/** 手の短い表示（ログ・計測用）。 */
export function describeCpuMove(m: CpuMove): string {
  switch (m.kind) {
    // ⚠**手札側の文言は据え置き**（`S-15` の照合と `S-6` の分岐スクリーニングの基準を動かさない）。
    case 'energy': return m.from === 'field' ? `energy:field:${m.id}@${m.zone}` : `energy:${m.id}`;
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
    case 'signiAttack': return `signiAttack:${m.id}@${m.zone}${m.forced ? '!' : ''}`;
    case 'lrigAttack': return 'lrigAttack';
  }
}
