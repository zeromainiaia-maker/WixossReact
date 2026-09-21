import type { CardData } from '../../types';
import type { CardEffect } from '../../types/effects';
import { getCardNum } from '../../engine/execUtils';
import { collectCutinCandidates, type CutinCandidateInput } from './cutinCandidates';
import { selectEnergyIndicesForCost, type CpuEnergyReserve } from './cpuActivate';
import { energyCostToString } from './costs';
import type { CutinCandidate } from './modals/types';

/**
 * 🆕**CPU のスペルカットイン応答**（§5.6 `C-10` 第2段・2026-09-22）。
 *
 * 🔴**旧＝「人間のスペルに対してCPUは常にパス」**（`cpuTurn.ts` にそう書いてあった）＝
 *   **カットイン窓ごと使えていなかった**。📏母集団＝カットインできる札 **61カード**／
 *   **ユーザー作27デッキ中 7デッキ**（A/B に入る `WD13`・`ケトッシー軸` を含む）。
 *
 * ■ 規律（§5.6.3）＝**候補は人間と同じ関数**（`collectCutinCandidates`）／**実行も人間と同じ関数**
 *   （`performCutinUse`）。ここは「通った候補から選ぶ」だけ。
 *
 * ■ 選び方（v1・意図的に単純）
 *   1. **打ち消せる候補を優先**＝スペルを止めるのがこの窓の本来の役割。
 *   2. その中では**エナコストの軽い順**（同じなら候補の並び順＝決定論）。
 *   3. **払えない候補は選ばない**（エナの選び方は人間の支払いと同じ `selectEnergyIndicesForCost`・
 *      グロウの予約 `cpuGrowReserve` も守る）。
 *   ⚠**支払い内訳を人間が選ぶ形（エクシード・下のカード・ベット）は撃たない**＝
 *      `performArts` / `cpuActivate` と同じ allowlist の規律（宣言だけして踏み倒す側へ倒さない）。
 *   ⚠**レゾナのカットインは対象外**（`kind:'resona'`＝出す先の選択が要る）。
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
}

export interface CpuCutinChoice {
  candidate: CutinCandidate;
  /** `performCutinUse` に渡すエナ pool index。 */
  costIndices: Set<number>;
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

/**
 * CPU が**いま使うカットイン**を1つ選ぶ（使わないなら `null`＝呼び出し元はパスする）。
 * ⚠**1回の呼び出しで1つだけ**（窓は1回で閉じる）。
 */
export function pickCpuCutin(p: CpuCutinPickInput): CpuCutinChoice | null {
  const candidates = collectCutinCandidates({ ...p, responderId: p.cpuId })
    // ⚠レゾナは出す先の選択が要る＝この窓では撃たない（honest defer）。
    .filter((c): c is CutinCandidate & { kind: 'effect' } => c.kind === 'effect')
    .filter(c => cpuCanAutoPayCutin(c.effect));
  if (candidates.length === 0) return null;
  // 🔑**打ち消せる候補を先に**（この窓の本来の役割）＝その中はエナの軽い順・同点は候補の並び順。
  const ordered = [...candidates].sort((a, b) =>
    (Number(b.countersSpell ?? true) - Number(a.countersSpell ?? true))
    || (cutinCostTotal(a) - cutinCostTotal(b)));
  for (const candidate of ordered) {
    const costIndices = selectEnergyIndicesForCost({
      poolNums: p.energyPoolNums, cards: p.cards, costStr: cutinCostStr(candidate),
      isAffordable: p.isAffordable, reserve: p.energyReserve,
    });
    if (costIndices) return { candidate, costIndices };
  }
  return null;
}

/** ログ・計器用のカード名（`census:play` の anchor は呼び出し元が持つ）。 */
export const cutinCardName = (c: CutinCandidate, cardMap: Map<string, CardData>): string =>
  cardMap.get(getCardNum(c.instanceId))?.CardName ?? c.card.CardName;
