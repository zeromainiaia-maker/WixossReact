import type { CardEffect } from '../../types/effects';
import { getCardNum } from '../../engine/execUtils';
import { activatedEnergyCostStr, pickCpuDiscardCostIndices, pickCpuTrashArtsNums, selectEnergyIndicesForCost } from './cpuActivate';
import type { CpuLrigActivatedPickInput } from './cpuLrigActivate';
import { listActivatableKeyEffects } from './keyActivateGate';

/**
 * 🆕2026-10-21＝CPU がキーの【起】を撃つ選択ロジック（`cpuLrigActivate.ts` と同じ規律）。
 *   - **「撃てるか」の判定は `keyActivateGate`（人間のボタン生成と同じ関数）**。ここは支払いの内訳を決めるだけ。
 *   - 実行は `performKeyActivated`（人間と同じ関数）。
 * 🔴旧＝**CPU にはキーの【起】を撃つ経路が無く**、自己対戦の被覆でキーの【起】69効果が1度も発動していなかった。
 * ⚠「このキーを場からルリグトラッシュに置く」をコストにする【起】は、ポリシー `keyTrashAbility` が 0 なら撃たない
 *   （キーを失う判断を CPU はまだ評価できない）。
 * ⚠同じ効果は CPU のターンに1回まで（`cpu_activated_effect_ids_this_turn`＝ルリグ／シグニ【起】と共通の台帳）。
 */
export interface CpuKeyActivatedChoice {
  keyNum: string;
  effect: CardEffect;
  costIndices: Set<number>;
  discardIndices: Set<number>;
  artsNums: string[];
}

/** 入力はルリグ【起】と同じ材料（エナの pool・支払い可否・封じ・予約・ポリシー）＋いまのフェイズ。 */
export function pickCpuKeyActivated(
  p: CpuLrigActivatedPickInput & { turnPhase: 'MAIN' | 'ATTACK_ARTS' | 'ATTACK_ARTS_OP' },
): CpuKeyActivatedChoice | null {
  const cands = listActivatableKeyEffects({
    my: p.actor, op: p.opponent, phase: p.turnPhase,
    effectsMap: p.effectsMap, cardMap: p.cardMap, blockedSelf: p.blockedSelf, effectivePowers: p.effectivePowers,
  });
  const useTrashKey = (p.policy?.keyTrashAbility ?? 0) > 0;
  for (const { keyNum, effect } of cands) {
    if (p.alreadyActivated.includes(effect.effectId)) continue;
    if (effect.cost?.trash_key && !useTrashKey) continue;
    // 全捨て（エナ／手札をすべて）は失うものが大きすぎる＝撃たない（キーを失う【起】と同じ理由）。
    if ((effect.cost?.energyTrashAll || effect.cost?.discardAll) && !useTrashKey) continue;
    const costIndices = selectEnergyIndicesForCost({
      poolNums: p.energyPoolNums, cards: p.cards, costStr: activatedEnergyCostStr(effect),
      isAffordable: p.isAffordable, wholeSubstitutes: p.wholeSubstitutes, reserve: p.energyReserve,
    });
    if (!costIndices) continue;
    const discardIndices = pickCpuDiscardCostIndices({
      hand: p.actor.hand, cost: effect.cost, cardMap: p.cardMap,
      effectsOf: id => p.effectsMap.get(getCardNum(id)) ?? [], policy: p.policy,
    });
    if (!discardIndices) continue;
    const artsNums = pickCpuTrashArtsNums({
      effect, actor: p.actor, cardMap: p.cardMap,
      effectsOf: id => p.effectsMap.get(getCardNum(id)) ?? [], policy: p.policy,
    });
    if (!artsNums) continue;
    return { keyNum, effect, costIndices, discardIndices, artsNums };
  }
  return null;
}
