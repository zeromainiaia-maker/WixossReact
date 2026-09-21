import type { CardData, PlayerState } from '../../types';
import type { CardEffect } from '../../types/effects';
import { getCardNum } from '../../engine/execUtils';
import { collectCutinCandidates, type CutinCandidateInput } from './cutinCandidates';
import { selectEnergyIndicesForCost, type CpuEnergyReserve } from './cpuActivate';
import { energyCostToString } from './costs';
import { evaluateBoard, simulateEffect, type LookaheadCtx } from './cpuLookahead';
import { DEFAULT_CPU_POLICY, type CpuPolicy } from './cpuPolicy';
import { paidFieldLevels, pickCpuResonaSelection, pickCpuResonaZone } from './cpuSummon';
import type { ResonaPaymentSelection } from './resonaSummon';
import type { CutinCandidate, EffectCutinCandidate, ResonaCutinCandidate } from './modals/types';

/**
 * 🆕**CPU のスペルカットイン応答**（§5.6 `C-10` 第2段・2026-09-22）。
 *
 * 🔴**旧＝「人間のスペルに対してCPUは常にパス」**（`cpuTurn.ts` にそう書いてあった）＝
 *   **カットイン窓ごと使えていなかった**。📏母集団＝カットインできる札 **61カード**／
 *   **ユーザー作27デッキ中 7デッキ**（A/B に入る `WD13`・`ケトッシー軸` を含む）。
 *
 * ■ 規律（§5.6.3）＝**候補は人間と同じ関数**（`collectCutinCandidates`）／**実行も人間と同じ関数**
 *   （`performCutinUse`／レゾナは `performSummonSigni`）。ここは「通った候補から選ぶ」だけ。
 *
 * ■ 選び方
 *   1. 🆕**§5.6 `C-11`（2026-09-22）＝打ち消す価値があるときだけ打ち消す**＝
 *      **打ち消さずに解決させた盤面**と**打ち消してその札を失った盤面**を `evaluateBoard` で採点し、
 *      差が `policy.cutinGainMin` に届かないなら撃たない（`cutinCounterGain`）。
 *      ⚠**先読み（`lookahead`）を渡さない／解けない効果は従来どおり打ち消す**（判断の材料が無い）。
 *   2. 残った候補は**打ち消せるものを優先**→**得の大きい順**→**エナコストの軽い順**（同点は候補の並び順＝決定論）。
 *   3. **払えない候補は選ばない**（エナの選び方は人間の支払いと同じ `selectEnergyIndicesForCost`・
 *      グロウの予約 `cpuGrowReserve` も守る）。
 *   ⚠**支払い内訳を人間が選ぶ形（エクシード・下のカード・ベット）は撃たない**＝
 *      `performArts` / `cpuActivate` と同じ allowlist の規律（宣言だけして踏み倒す側へ倒さない）。
 *   4. 🆕**§5.6 `C-13`（2026-09-22）＝レゾナのカットインも使う**＝出す先は `pickCpuResonaZone`
 *      （人間の `ResonaSummonModal` と同じ `pickCpuResonaSelection` で支払いを組む）。
 *      ⚠**打ち消しではない**（`SPELL_CUTIN` レゾナはスペルを打ち消さず先に【出】を解決する）＝
 *      **効果のカットインが1つでも選ばれたらそちらが優先**。
 */
export interface CpuCutinPickInput extends Omit<CutinCandidateInput, 'responderId'> {
  /** CPU の user id。 */
  cpuId: string;
  /** `buildEnergyPayPool(actor, ...)` の各エントリの cardNum（pool index 順）。 */
  energyPoolNums: string[];
  /** 全カード（エナ支払いの権威関数に渡す）。 */
  cards: CardData[];
  isAffordable: (selectedNums: string[], costStr: string) => boolean;
  /** グロウ用エナの予約（`cpuGrowReserve.ts`）。 */
  energyReserve?: CpuEnergyReserve;
  /**
   * 🆕§5.6 `C-11`＝**打ち消す価値の判断**に使う先読み（`cpuLookahead`）。
   * ⚠**渡さなければ従来どおり**（打ち消せるなら打ち消す）＝判断の材料が無いまま撃たない側へ倒さない。
   */
  lookahead?: LookaheadCtx;
  /** 🆕§5.6 `C-11`＝閾値の在処（省略時は既定＝`DEFAULT_CPU_POLICY`）。 */
  policy?: CpuPolicy;
  /**
   * 🆕🔴§5.6 `C-12`＝**ピース応答窓の候補を出してよいか**（既定 `false`）。
   * 🔴**なぜ既定が false か**＝ピース窓の実行（`performCutinUse` の `kind==='piece'` 枝）は
   *   **支払い→効果→最新盤面の読み直し→応答完了フラグ**の順に進む（`completePieceCutinResponseAfterEffects`）＝
   *   **最新盤面を取り直す口（`fetchLatest`）が無いと窓を閉じられず、盤面がそこで止まる**。
   *   ⇒ **その口を持っている呼び出し元だけが `true` を渡す**（`cpuTurn.ts` の `d.fetchLatest`）。
   */
  allowPieceWindow?: boolean;
  /**
   * 🆕§5.6 `C-13`＝レゾナのカットインを出せるかの枠（`cpuSummonBudget` の結果）。
   * ⚠**渡さなければレゾナは撃たない**（枠を数え直すと人間とズレる＝honest defer）。
   */
  resonaBudget?: CpuResonaBudget;
}

/**
 * 🆕§5.6 `C-13`＝レゾナを出せるかの枠（**実体は `cpuMoves.cpuSummonBudget`**）。
 * ⚠**この3つを自分で数え直さない**＝リミットは付与で動く（`computeEffectiveLrigLimit`）ので、写経すると人間とズレる。
 */
export interface CpuResonaBudget {
  lrigLevel: number;
  lrigLimit: number;
  fieldSigniTotal: number;
}

export interface CpuCutinChoice {
  candidate: CutinCandidate;
  /** `performCutinUse` に渡すエナ pool index（レゾナでは空）。 */
  costIndices: Set<number>;
  /**
   * 🆕§5.6 `C-13`＝レゾナのカットインのときだけ（出現条件の支払いと配置先）。
   * ⚠実行は `performCutinUse` ではなく**人間と同じ `performSummonSigni`**（`tryCpuResona` と同じ形）。
   */
  resona?: { selection: ResonaPaymentSelection; zone: number };
}

/** CPU が**支払い内訳を自動で決められる**カットインのコストキー（⚠allowlist＝載っていないキーがあれば撃たない）。 */
const CPU_CUTIN_AUTO_PAYABLE_COST_KEYS: ReadonlySet<string> = new Set([
  'energy', 'none',
]);

/** このカットインのコストを CPU が自動で払いきれるか。 */
export function cpuCanAutoPayCutin(effect: CardEffect | undefined): boolean {
  const cost = effect?.cost;
  if (!cost) return true;
  return Object.entries(cost).every(([k, v]) =>
    (Array.isArray(v) ? v.length === 0 : !v) || CPU_CUTIN_AUTO_PAYABLE_COST_KEYS.has(k));
}

/** 候補のエナコスト（文字列表現＝支払いモーダルと同じ形）。 */
const cutinCostStr = (c: CutinCandidate): string =>
  c.kind === 'effect' ? energyCostToString(c.effect.cost?.energy ?? []) : '';

/** 候補のエナコストの合計（軽い順に並べるための鍵）。 */
const cutinCostTotal = (c: CutinCandidate): number =>
  c.kind === 'effect' ? (c.effect.cost?.energy ?? []).reduce((sum, e) => sum + e.count, 0) : 0;

/** 🆕§5.6 `C-11`＝打ち消す／打ち消さないの点差（どちらも CPU 視点の盤面の点数）。 */
export interface CutinCounterScore {
  /** 打ち消さずに相手のスペルを解決させた盤面の点数。 */
  resolve: number;
  /** 打ち消した盤面の点数（カットイン札とエナを失い、そのカットインの効果を解決した後）。 */
  counter: number;
  /** `counter - resolve`＝**打ち消して得られる差**（これが閾値に届かないなら撃たない）。 */
  gain: number;
}

/**
 * 相手のカード（いま窓を開けているスペル）が**解決した後**の盤面を CPU 視点で採点する。
 * ⚠**持ち主は相手**＝`simulateEffect` の第1引数（`ownerState`）に相手を渡し、結果を入れ替えて採点する。
 * ⚠使ったスペルは既に相手の手札を離れている（`pending_spell`）＝ここでは手札を触らない。
 */
function scoreAfterOpponentCard(
  spellCardNum: string, cpu: PlayerState, opp: PlayerState, lctx: LookaheadCtx,
): number | null {
  const acts = lctx.effectsOf(spellCardNum).filter(e => e.effectType === 'ACTIVATED');
  if (acts.length === 0) return null;
  let owner = opp, other = cpu;
  for (const e of acts) {
    const after = simulateEffect(e, spellCardNum, owner, other, lctx);
    if (!after) return null;
    owner = after.cpu;
    other = after.opp;
  }
  return evaluateBoard(other, owner, lctx);
}

/**
 * カットインを撃った後の盤面を CPU 視点で採点する（＝スペルは解決しない）。
 * ⚠**コスト（エナ・出どころの札）を先に引いてから**効果を解決する（`scoreCardUseGain` と同じ順）。
 * ⚠効果を解決しきれなくても**コストだけ引いた盤面で採点する**＝打ち消し自体は必ず起きるため。
 */
function scoreAfterCutin(
  candidate: EffectCutinCandidate, costCount: number, cpu: PlayerState, opp: PlayerState, lctx: LookaheadCtx,
): number {
  const handIdx = candidate.source === 'hand'
    ? (candidate.handIdx ?? cpu.hand.indexOf(candidate.instanceId)) : -1;
  let actor: PlayerState = {
    ...cpu,
    energy: cpu.energy.slice(0, Math.max(0, cpu.energy.length - costCount)),
    // ⚠**同名の札を全部消さない**＝手札は index で1枚だけ抜く（`filter` だと複数枚持っていると多く失う）。
    ...(handIdx >= 0 ? { hand: [...cpu.hand.slice(0, handIdx), ...cpu.hand.slice(handIdx + 1)] } : {}),
    ...(candidate.source === 'lrig_deck'
      ? { lrig_deck: cpu.lrig_deck.filter(id => id !== candidate.instanceId) } : {}),
  };
  let other = opp;
  const after = simulateEffect(candidate.effect, candidate.instanceId, actor, other, lctx);
  if (after) { actor = after.cpu; other = after.opp; }
  return evaluateBoard(actor, other, lctx);
}

/**
 * 🆕§5.6 `C-11`＝**その打ち消しに価値があるか**を測る（先読みが解けなければ `null`＝従来どおり打ち消す）。
 * 🔑**呼び出し側の閾値は `policy.cutinGainMin`**＝`evaluateBoard` は `lrig_deck` の札を1点も数えないので、
 *   「使い切りの札1枚ぶん」はこの閾値で表す（盤面の点数には現れない）。
 */
export function cutinCounterGain(p: {
  candidate: EffectCutinCandidate;
  /** 支払うエナの枚数（`selectEnergyIndicesForCost` の結果の枚数）。 */
  costCount: number;
  cpu: PlayerState;
  opp: PlayerState;
  /** いま窓を開けているスペルのカード番号（`pending_spell.card_num`）。 */
  spellCardNum: string;
  lookahead: LookaheadCtx;
}): CutinCounterScore | null {
  const resolve = scoreAfterOpponentCard(p.spellCardNum, p.cpu, p.opp, p.lookahead);
  if (resolve === null) return null;
  const counter = scoreAfterCutin(p.candidate, p.costCount, p.cpu, p.opp, p.lookahead);
  return { resolve, counter, gain: counter - resolve };
}

/**
 * 🆕§5.6 `C-13`＝レゾナのカットイン候補に、支払いと配置先を組んで返す（組めなければ `null`）。
 * ⚠**リミットの式は人間のモーダル（`ResonaSummonModal`）と同じ**＝`fieldSigniTotal - 払って空く枠 + Lv > lrigLimit` なら出せない。
 *   🔑材料（`budget`）は `cpuSummonBudget` の1本＝**ここで写経しない**（`listCpuResonas` と同じ数字を使う）。
 */
function planResonaCutin(
  candidate: ResonaCutinCandidate, cpu: PlayerState, cardMap: Map<string, CardData>, budget: CpuResonaBudget,
): { selection: ResonaPaymentSelection; zone: number } | null {
  const level = parseInt(candidate.card.Level ?? '0', 10) || 0;
  if (level > budget.lrigLevel) return null;
  const selection = pickCpuResonaSelection(cpu, candidate.resona.payment, cardMap);
  if (!selection) return null;
  if (budget.fieldSigniTotal - paidFieldLevels(cpu, selection, cardMap) + level > budget.lrigLimit) return null;
  const zone = pickCpuResonaZone(cpu, selection);
  if (zone === null) return null;
  return { selection, zone };
}

/**
 * CPU が**いま使うカットイン**を1つ選ぶ（使わないなら `null`＝呼び出し元はパスする）。
 * ⚠**1回の呼び出しで1つだけ**（窓は1回で閉じる）。
 */
export function pickCpuCutin(p: CpuCutinPickInput): CpuCutinChoice | null {
  const isPieceWindow = p.pendingSpell?.kind === 'piece';
  // 🔴§5.6 `C-12`＝**窓を閉じる口を持たない呼び出し元ではピース窓に応答しない**（応答したまま止まる）。
  if (isPieceWindow && !p.allowPieceWindow) return null;
  const all = collectCutinCandidates({ ...p, responderId: p.cpuId });
  const candidates = all
    .filter((c): c is EffectCutinCandidate => c.kind === 'effect')
    .filter(c => cpuCanAutoPayCutin(c.effect));
  const gainMin = (p.policy ?? DEFAULT_CPU_POLICY).cutinGainMin;
  const spellCardNum = p.pendingSpell?.card_num;
  /** その候補を撃つと決めたときの手（払えなければ `null`）。 */
  const planEffect = (candidate: EffectCutinCandidate) => {
    const costIndices = selectEnergyIndicesForCost({
      poolNums: p.energyPoolNums, cards: p.cards, costStr: cutinCostStr(candidate),
      isAffordable: p.isAffordable, reserve: p.energyReserve,
    });
    return costIndices ? { candidate, costIndices } : null;
  };
  const planned = candidates.map(planEffect).filter((x): x is { candidate: EffectCutinCandidate; costIndices: Set<number> } => x !== null);
  // ── 🆕§5.6 `C-11`＝**打ち消す価値**で絞る（先読みが無い／解けない候補は従来どおり残す）──
  const scored = planned.map(x => ({
    ...x,
    // ⚠**打ち消さない候補（ピース窓・`SPELL_CUTIN` レゾナ相当）には掛けない**＝
    //   この判定は「スペルを止める価値」の判定であって、効果そのものの価値ではない。
    score: (p.lookahead && spellCardNum && (x.candidate.countersSpell ?? true))
      ? cutinCounterGain({
        candidate: x.candidate, costCount: x.costIndices.size,
        cpu: p.my, opp: p.op, spellCardNum, lookahead: p.lookahead,
      })
      : null,
  })).filter(x => x.score === null || x.score.gain >= gainMin);
  if (scored.length > 0) {
    // 🔑**打ち消せる候補を先に**（この窓の本来の役割）＝次に**得の大きい順**→エナの軽い順→候補の並び順。
    const ordered = [...scored].sort((a, b) =>
      (Number(b.candidate.countersSpell ?? true) - Number(a.candidate.countersSpell ?? true))
      || ((b.score?.gain ?? 0) - (a.score?.gain ?? 0))
      || (cutinCostTotal(a.candidate) - cutinCostTotal(b.candidate)));
    const best = ordered[0];
    return { candidate: best.candidate, costIndices: best.costIndices };
  }
  // ── 🆕§5.6 `C-13`＝レゾナのカットイン（出す先の選択が要るのでここで組む）──
  if (p.resonaBudget) for (const candidate of all) {
    if (candidate.kind !== 'resona') continue;
    const plan = planResonaCutin(candidate, p.my, p.cardMap, p.resonaBudget);
    if (plan) return { candidate, costIndices: new Set<number>(), resona: plan };
  }
  return null;
}

/** ログ・計器用のカード名（`census:play` の anchor は呼び出し元が持つ）。 */
export const cutinCardName = (c: CutinCandidate, cardMap: Map<string, CardData>): string =>
  cardMap.get(getCardNum(c.instanceId))?.CardName ?? c.card.CardName;
