import type { CardData, PlayerState } from '../../types';
import type { CardEffect } from '../../types/effects';
import { collectGrowCostReductions } from '../../engine/effectEngine';
import { collectEnergyCostSubstitutes } from '../../engine/effectEngine';
import { applyGrowCostReduction, isEnaMultiStripped, isEnergyPaymentSelectionValid, parseGrowCost } from './costs';
import { listGrowCandidates } from './growLogic';
import { selectEnergyIndicesForCost, type CpuEnergyReserve } from './cpuActivate';

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

/** 払う予定のエナ（instance ID）を除いた残りで予約を満たせるか（手で選ぶ支払い＝召喚コスト・効果の任意コスト用）。 */
export function reserveKeptAfterPaying(reserve: CpuEnergyReserve | undefined, energy: readonly string[], paid: readonly string[]): boolean {
  if (!reserve) return true;
  const paidSet = new Set(paid);
  return reserve.keepsAfter(energy.filter(id => !paidSet.has(id)));
}
