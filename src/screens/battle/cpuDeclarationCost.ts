import type { CardData, PlayerState } from '../../types';
import type { CardEffect, EffectAction, StubAction } from '../../types/effects';
import { getCardNum } from '../../engine/execUtils';

/**
 * 🆕**対象宣言の「帰結のコスト」**（§5.7 `S-29`・2026-09-22）。
 *
 * 🔴**何が起きていたか**＝原文「〈シグニ〉１体を**対象とし**、**それのレベル１につき**《無》を支払ってもよい。
 *   そうした場合、それをバニッシュする」の族では、**支払う量が「選んだ対象のレベル」で決まる**。
 *   `S-22` が入れた「相手の一番強い札を選ぶ」は**レベルの高い札を選びやすい**ので、
 *   **払えずに空振る**（宣言だけして何も起きない）ことがある。⚠宣言の時点の対話（`SELECT_TARGET`）には
 *   **後続ステップのコストが1文字も入っていない**ので、対象選択からは見えない。
 *
 * 🔑**やること＝「払える対象だけを候補にする」**（払える対象が1つも無ければ従来どおり＝悪化させない）。
 * 📏**母集団（2026-09-22 実測）**＝この形は **live 14効果 / 14カード**（下の6キーの和集合）。
 *   ⚠**ユーザー作27デッキには0枚**＝A/B でも自己対戦でも測れない（`S-20` と同型）＝
 *   **直接指標は「払える対象を選べたか」**（golden で固定する）。
 *
 * ⚠**engine のコスト計算を写経しない**＝ここは「候補の絞り込み」だけで、
 *   実際の支払い額・支払い可否は engine（`resolveOptionalCostSpec`）と支払いUIが決める。
 *   ⚠**倍率の解釈は engine と同じ規約**＝`costColorsPerTargetLevel` は**選んだ対象のレベルぶん色を繰り返す**。
 */
export interface DeclarationScalingCost {
  /** 「レベル１につき」＝対象のレベルぶん繰り返す色。 */
  colorsPerLevel?: string[];
  /** 「レベルの合計１につき」＝選んだ対象すべてのレベル合計ぶん繰り返す色。 */
  colorsPerLevelSum?: string[];
  /** 「レベル１につき手札を１枚捨てる」。 */
  handDiscardPerLevel?: boolean;
  /** 「レベル１につきエナを１枚トラッシュ」。 */
  energyTrashPerLevel?: boolean;
}

type ScalingNode = StubAction & {
  costColorsPerTargetLevel?: string[];
  costColorsPerTargetLevelSum?: string[];
  handDiscardCountFromTargetLevel?: unknown;
  energyTrashCountFromTargetLevel?: unknown;
};

/** 効果の木を歩いて「選んだ対象のレベルで量が決まる任意コスト」を探す（無ければ `null`）。 */
export function declarationScalingCost(effect: CardEffect | undefined): DeclarationScalingCost | null {
  if (!effect?.action) return null;
  let found: DeclarationScalingCost | null = null;
  const walk = (node: unknown): void => {
    if (found || !node || typeof node !== 'object') return;
    const rec = node as Record<string, unknown>;
    const stub = rec as unknown as ScalingNode;
    if (rec.type === 'STUB' && stub.id === 'OPTIONAL_COST') {
      if (stub.costColorsPerTargetLevel?.length) { found = { colorsPerLevel: stub.costColorsPerTargetLevel }; return; }
      if (stub.costColorsPerTargetLevelSum?.length) { found = { colorsPerLevelSum: stub.costColorsPerTargetLevelSum }; return; }
      if (stub.handDiscardCountFromTargetLevel !== undefined) { found = { handDiscardPerLevel: true }; return; }
      if (stub.energyTrashCountFromTargetLevel !== undefined) { found = { energyTrashPerLevel: true }; return; }
    }
    for (const v of Object.values(rec)) {
      if (Array.isArray(v)) v.forEach(walk);
      else if (v && typeof v === 'object') walk(v);
    }
  };
  walk(effect.action as EffectAction);
  return found;
}

/** 候補1枚のレベル（読めなければ `0`＝コスト0扱い＝除外しない）。 */
function levelOf(id: string, cardMap: Map<string, CardData>): number {
  const lv = Number.parseInt(cardMap.get(getCardNum(id))?.Level ?? '', 10);
  return Number.isFinite(lv) ? lv : 0;
}

/**
 * この候補を選んだときの帰結のコストを**いま払えるか**。
 *
 * ⚠**「払えるか」の権威は呼び出し元が渡す `canPayColors`**（＝CPU の任意コスト支払いと同じ関数＝
 *   `selectOptionalCostEnergy` ＋ グロウ予約）＝ここで2つ目の支払い判定を書かない。
 * ⚠**レベルが読めない／コストが0**なら `true`（除外しない）。
 */
export function canAffordDeclarationCost(p: {
  candidate: string;
  cost: DeclarationScalingCost;
  cardMap: Map<string, CardData>;
  cpuState: PlayerState;
  canPayColors: (colors: string[]) => boolean;
}): boolean {
  const level = levelOf(p.candidate, p.cardMap);
  if (level <= 0) return true;
  const { colorsPerLevel, colorsPerLevelSum, handDiscardPerLevel, energyTrashPerLevel } = p.cost;
  const unit = colorsPerLevel ?? colorsPerLevelSum;
  if (unit?.length) {
    // ⚠**「レベルの合計」形も1体選ぶ形では同じ**（合計＝その1体のレベル）＝同じ数え方でよい。
    return p.canPayColors(Array.from({ length: level }, () => unit).flat());
  }
  if (handDiscardPerLevel) return p.cpuState.hand.length >= level;
  if (energyTrashPerLevel) return p.cpuState.energy.length >= level;
  return true;
}
