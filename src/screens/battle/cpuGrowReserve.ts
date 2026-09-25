import type { CardData, PlayerState } from '../../types';
import type { CardEffect } from '../../types/effects';
import { collectGrowCostReductions } from '../../engine/effectEngine';
import { collectEnergyCostSubstitutes } from '../../engine/effectEngine';
import { applyGrowCostReduction, isEnaMultiStripped, isEnergyPaymentSelectionValid, parseGrowCost } from './costs';
import { listGrowCandidates } from './growLogic';
import { selectEnergyIndicesForCost, type CpuEnergyReserve } from './cpuActivate';
import { applyCpuMoveSim, listCpuGrows, type CpuMoveCtx } from './cpuMoves';
import { planEnaPayRank, planHasEnaUse, type CpuDeckPlan } from './cpuDeckPlan';

/**
 * 🆕**グロウ用エナの予約**（2026-09-17・ユーザー指示）＝「アーツなどエナコストが必要な行動で、グロウ用のエナが無くなって
 * グロウできなくなることは**必ず**避ける」。アシストグロウもアーツと同じ扱い（ユーザー指示）。
 *
 * ■ 中身＝**次のグロウ先の候補**（人間と同じ `listGrowCandidates`・軽減も人間と同じ `collectGrowCostReductions`）のうち、
 *   **どれか1枚を、払ったあとの残りのエナで払えるか**。候補が無い（最大レベル・グロウ先が無い）なら予約しない。
 * ■ 🔴**「必ず」なので次のターンのエナチャージ（＋1枚）は当てにしない**（エナフェイズがスキップされる効果もある）。
 *   ⇒ いまのエナでグロウできない量なら、グロウ以外の支払いは**しない**（貯める）。
 * ■ 対象外＝グロウそのもの・ガード（負けを防ぐ行動を優先）。
 *
 * 支払いの可否は CPU の GROW フェイズと同じ `isEnergyPaymentSelectionValid`（マルチエナの剥奪・一括代替を含む）。
 */
export function buildCpuGrowReserve(p: {
  actor: PlayerState;
  opponent: PlayerState;
  cardMap: Map<string, CardData>;
  effectsMap: Map<string, CardEffect[]>;
  cards: CardData[];
}): CpuEnergyReserve | undefined {
  const costs = listGrowCandidates({ my: p.actor, cardMap: p.cardMap, effectsMap: p.effectsMap })
    .map(card => applyGrowCostReduction(card.GrowCost, collectGrowCostReductions(p.actor, p.opponent, true, p.effectsMap, p.cardMap, card.CardNum)));
  if (costs.length === 0) return undefined;
  const avoidColors = [...new Set(costs.flatMap(cs => parseGrowCost(cs).map(item => item.color)).filter(c => c !== '無'))];
  const stripped = isEnaMultiStripped(p.actor, p.opponent, false, p.effectsMap, p.cardMap);
  const wholeSubstitutes = collectEnergyCostSubstitutes(p.actor, p.cardMap, p.effectsMap);
  const isAffordable = (selectedNums: string[], costStr: string) => isEnergyPaymentSelectionValid({
    selectedEnergyNums: selectedNums, cards: p.cards, baseCost: costStr,
    keywordGrants: p.actor.keyword_grants, stripped, wholeSubstitutes,
  });
  return {
    avoidColors,
    keepsAfter: remainingNums => costs.some(costStr =>
      selectEnergyIndicesForCost({ poolNums: remainingNums, cards: p.cards, costStr, isAffordable, wholeSubstitutes }) !== null),
  };
}

/**
 * 🆕§5.7 `S-26`＝**次のグロウでまだ足りない色**（エナチャージで優先して置く色）。
 *
 * 🔴**なぜ要るか（2026-09-21 実測）**＝CPU は**グロウ機会 214 のうち 15（7%）でエナを払えずグロウできていない**。
 *   そのうち**7件は色の問題**＝**天使軸1 はエナが無色しか無いのに《白》が要る**状態が繰り返し出た。
 *   原因＝`pickCpuEnergyChargeIndex` は**強さ（パワー＋効果の点数）だけ**で選び、**色を1度も見ていない**。
 * 🔑**「グロウしないことがかなりの悪手」**（2026-09-21 ユーザー）＝だから**予約（使わない）だけでなく、確保（置きに行く）**が要る。
 *
 * ■ 返すもの＝**いまのエナに足りない色**＝グロウ先の候補のうち**一番安く済むもの**を基準にする
 *   （どれか1つ払えればよい＝`buildCpuGrowReserve` と同じ考え方）。
 * ⚠**《無》は数えない**（どの色でも払えるので、色を選ぶ理由にならない）。
 * ⚠**候補が無い／もう払えるなら空**（置きに行く理由が無い）。
 */
export function growShortColors(p: {
  actor: PlayerState;
  opponent: PlayerState;
  cardMap: Map<string, CardData>;
  effectsMap: Map<string, CardEffect[]>;
  cards: CardData[];
}): string[] {
  const reserve = buildCpuGrowReserve(p);
  // 🔴**いま払えるなら置きに行かない**（`keepsAfter` は「この残りで払えるか」＝いまのエナ全部で判定する）。
  if (!reserve || reserve.keepsAfter(p.actor.energy.map(id => id.split('#')[0]))) return [];
  const colorOf = (id: string) => p.cardMap.get(id.split('#')[0])?.Color ?? '';
  const have = new Map<string, number>();
  for (const id of p.actor.energy) have.set(colorOf(id), (have.get(colorOf(id)) ?? 0) + 1);
  const costs = listGrowCandidates({ my: p.actor, cardMap: p.cardMap, effectsMap: p.effectsMap })
    .map(card => parseGrowCost(applyGrowCostReduction(card.GrowCost, collectGrowCostReductions(p.actor, p.opponent, true, p.effectsMap, p.cardMap, card.CardNum))));
  // 候補ごとに「足りない色」を出し、**不足の合計が一番小さい候補**（＝一番近いグロウ先）を採る。
  let best: { short: string[]; miss: number } | null = null;
  for (const items of costs) {
    const short: string[] = [];
    let miss = 0;
    for (const { color, count } of items) {
      if (color === '無') continue;
      const lack = count - (have.get(color) ?? 0);
      if (lack > 0) { short.push(color); miss += lack; }
    }
    if (short.length === 0) return [];   // 色は足りている＝枚数の問題（色で選ぶ理由が無い）
    if (!best || miss < best.miss) best = { short, miss };
  }
  return best ? [...new Set(best.short)] : [];
}

/**
 * 🆕🔴§5.7 `S-26`＝**エナチャージで確保しに行く色**（`pickCpuEnergyChargeIndex` の `needColors`）。
 *
 * 🔴🔑**「このターンのグロウ」を見ても遅い**（2026-09-21 実測）＝払えなかった3件は**全部**
 *   「**今回は無料／払える** ⇒ 要る色は空 ⇒ 無色をチャージ ⇒ **次のターン**に《白》が要って払えない」だった。
 *   ⇒ **1回グロウしたあとの盤面**で足りない色を見る（＝ユーザーの言う「**ターンをまたいだ考え**」）。
 * ⚠**いまのグロウが払えないなら、そちらが先**（2手先より目先）。
 *
 * 🔑**ここに置く理由**＝`cpuTurn.ts` は**本番の実行**しか書かない場所で、
 *   探索用の近似適用（`applyCpuMoveSim`）を持ち込まない（golden `§5.7 S-16` ②のガードレール）。
 *   **判断のための近似はこの純関数に閉じる。**
 */
export function chargeNeedColors(ctx: CpuMoveCtx, cards: CardData[]): string[] {
  const base = { opponent: ctx.opponent, cardMap: ctx.cardMap, effectsMap: ctx.effectsMap, cards };
  const now = growShortColors({ actor: ctx.actor, ...base });
  if (now.length > 0) return now;
  const growNow = listCpuGrows(ctx)[0];
  if (!growNow) return [];
  const after = applyCpuMoveSim(ctx, growNow)?.cpu;
  return after ? growShortColors({ actor: after, ...base }) : [];
}

/**
 * 🆕2026-09-26＝**作戦データの「エナゾーンにある札の扱い」を支払いの予約に載せる**（`CpuEnergyReserve.payRank`）。
 * 🔑**予約に載せる理由**＝エナを払う選び手（アーツ・スペル・【起】・キー／ピース・カットイン・アシストグロウ・効果の任意コスト）は
 *   **全部この予約を受け取っている**＝1か所で全部の窓に届く（窓ごとに引数を足すと、足し忘れた窓だけ効かない）。
 * ⚠**グロウ先が無い（予約が `undefined`）ときも順位だけの予約を返す**（`keepsAfter` は常に真＝何も縛らない）。
 * ⚠**指定が無ければ元の予約をそのまま返す**＝挙動は1ビットも変わらない。
 * 🔴**「次のグロウが払えるか」の判定（`canPayNextGrow`・`growShortColors`）にはこれを通さない**＝`undefined` が「グロウ先が無い」の意味を持つ。
 */
export function withEnaPayRank(reserve: CpuEnergyReserve | undefined, plan: CpuDeckPlan | undefined): CpuEnergyReserve | undefined {
  if (!planHasEnaUse(plan)) return reserve;
  const payRank = (num: string) => planEnaPayRank(plan, num);
  return reserve ? { ...reserve, payRank } : { keepsAfter: () => true, avoidColors: [], payRank };
}

/** 払う予定のエナ（instance ID）を除いた残りで予約を満たせるか（手で選ぶ支払い＝召喚コスト・効果の任意コスト用）。 */
export function reserveKeptAfterPaying(reserve: CpuEnergyReserve | undefined, energy: readonly string[], paid: readonly string[]): boolean {
  if (!reserve) return true;
  const paidSet = new Set(paid);
  return reserve.keepsAfter(energy.filter(id => !paidSet.has(id)));
}
