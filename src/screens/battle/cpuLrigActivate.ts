import type { CardData, PlayerState } from '../../types';
import type { CardEffect, EffectCost } from '../../types/effects';
import { activatedEnergyCostStr, selectEnergyIndicesForCost } from './cpuActivate';
import {
  collectGrantedLrigEffects, listActivatableGrantedLrigEffects,
  listActivatableInheritedLrigEffects, listActivatableLrigEffects,
} from './lrigActivateGate';

/**
 * CPU がセンタールリグの【起】を能動使用するための選択ロジック（§8／§6.4 `O-1` (c)）。
 *
 * ■ 設計（`cpuActivate.ts` と同じ規律）
 *   - **「撃てるか」の判定は `lrigActivateGate`（人間のボタン生成と同じ関数）**。ここは
 *     「撃てるもののうち **CPU が支払い内訳を自動で決められる**ものを1つ選ぶ」だけを担う。
 *   - 実行は `performLrigActivated`（人間の【起】実行と同じ関数）。**CPU 専用の実行経路は作らない**。
 *
 * ■ 収集源は3つ（🆕2026-08-18・§6.4 O-1 (f) で②③を追加）
 *   ①センタールリグ本来の【起】 ②付与された【起】（`GRANT_LRIG_ABILITY` ほか）
 *   ③ルリグトラッシュからの継承（`INHERIT_LRIG_TRASH_ABILITIES`）。
 *   **どれも `lrigActivateGate` の list 関数を通す**＝可否判定は人間のボタン生成と同じ1本。
 *   ⚠優先度は①→②→③の固定順（盤面評価はしない）。
 *
 * ■ v1 の意図的な限界（honest defer）
 *   - **支払い内訳を人間が選ぶコストは撃たない**（下の allowlist）。
 *   - **同じ効果はCPUターンに1回まで**（`cpu_activated_effect_ids_this_turn`＝シグニ【起】と共通の台帳）。
 *   - 優先度は**効果定義順の決定論**（盤面評価はしない）。
 */

/**
 * CPU が**支払い内訳を自動で決められる**ルリグ【起】のコストキー。
 *
 * ⚠**allowlist（載っていないキーがあれば撃たない）**にすること。
 * ⚠ここに載せてよいのは **`performLrigActivated` が実際に払うキーだけ**＝
 *   宣言だけして踏み倒す側へ倒さない（`performArts` の allowlist と同じ理由）。
 *   `handDiscardSigni`／`discardGroups`／`trashExile` は**人間がモーダルで index を選ぶ**ので載せない。
 */
export const CPU_LRIG_AUTO_PAYABLE_COST_KEYS: ReadonlySet<keyof EffectCost> = new Set<keyof EffectCost>([
  'energy',              // selectEnergyIndicesForCost が index を決める
  'none',                // コストなしの任意効果
  'exceed',              // センター→アシストの順で自動（gate が枚数を検算している）
  'coin',                // 所持枚数の比較だけ（gate が検算・実行側が deduct）
  'down_self',           // このルリグをダウン（自動）
  'lrigDown',            // payLrigDownCost（自動）
  'discardAll',          // 手札をすべて（選択不要）
  'energyTrashAll',      // エナをすべて（選択不要）
  'energyTrashColorAll', // 指定色をすべて（選択不要）
  'charmTrash',          // 自分の場のチャームを先頭から自動
  'exileLrigFromLrigDeck', // ルリグデッキから自動（gate が枚数を検算している）
]);

/** この【起】のコストを CPU が自動で払いきれるか（払えないキーが1つでもあれば false）。 */
export function cpuCanAutoPayLrigCost(effect: CardEffect): boolean {
  const cost = effect.cost;
  if (!cost) return true;
  for (const key of Object.keys(cost) as (keyof EffectCost)[]) {
    if (cost[key] === undefined) continue;
    // `discardFilter` は `discard` の付随情報＝`discard` 側で弾かれる。
    if (key === 'discardFilter' && cost.discard === undefined) continue;
    if (!CPU_LRIG_AUTO_PAYABLE_COST_KEYS.has(key)) return false;
  }
  return true;
}

export interface CpuLrigActivatedChoice {
  effect: CardEffect;
  /** `performLrigActivated` に渡すエナ pool index。 */
  costIndices: Set<number>;
}

/**
 * CPU がいま撃つルリグ【起】を1つ選ぶ（無ければ `null`）。**1回の呼び出しで1つだけ**＝
 * 実行後はスタック解決を待って CPU ループが再入する。
 */
export function pickCpuLrigActivated(p: {
  actor: PlayerState;
  opponent: PlayerState;
  effectsMap: Map<string, CardEffect[]>;
  cardMap: Map<string, CardData>;
  cards: CardData[];
  phase: 'MAIN' | 'ATTACK_ARTS';
  /** `buildEnergyPayPool(actor, ...)` の各エントリの cardNum（pool index 順）。 */
  energyPoolNums: string[];
  /** `calcContinuousBlockedActions(actor, ...).forSelf`。 */
  blockedSelf: Set<string>;
  /** このターン CPU が既に撃った effectId（シグニ【起】と共通の台帳）。 */
  alreadyActivated: readonly string[];
  isAffordable: (selectedNums: string[], costStr: string) => boolean;
  effectivePowers?: Map<string, number>;
}): CpuLrigActivatedChoice | null {
  const gateInput = {
    my: p.actor, op: p.opponent, phase: p.phase,
    effectsMap: p.effectsMap, cardMap: p.cardMap,
    blockedSelf: p.blockedSelf, effectivePowers: p.effectivePowers,
  };
  // ⚠CPU の【起】は**自分のターン**でしか撃たない（呼び出し元が MAIN/ATTACK_ARTS 窓でだけ呼ぶ）＝
  //   付与の収集に渡す `isMyTurn` は常に true。
  const granted = collectGrantedLrigEffects(p.actor, p.opponent, true, p.effectsMap, p.cardMap);
  const usable = [
    ...listActivatableLrigEffects(gateInput),
    ...listActivatableGrantedLrigEffects(gateInput, granted),
    ...listActivatableInheritedLrigEffects(gateInput),
  ];
  for (const effect of usable) {
    if (p.alreadyActivated.includes(effect.effectId)) continue;
    if (!cpuCanAutoPayLrigCost(effect)) continue;
    const costIndices = selectEnergyIndicesForCost({
      poolNums: p.energyPoolNums, cards: p.cards, costStr: activatedEnergyCostStr(effect),
      isAffordable: p.isAffordable,
    });
    if (!costIndices) continue;
    return { effect, costIndices };
  }
  return null;
}
