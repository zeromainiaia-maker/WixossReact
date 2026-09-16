import type { CardData, PlayerState } from '../../types';
import { getCardNum } from '../../engine/execUtils';
import {
  resonaCombinedOptions, resonaPaymentOptions, validateResonaSelection,
  type ResonaPaymentItem, type ResonaPaymentPlan, type ResonaPaymentSelection,
} from './resonaSummon';

/**
 * CPU の**レゾナの出現条件の支払い**と**配置先**を選ぶ（§5.6 `C-5`・2026-09-17）。
 *
 * ■ 規律（§5.6.3）
 *   - **どのレゾナを出せるか**は人間と同じ `getResonaSummonCandidate`（`resonaSummon.ts`）。
 *   - **選択が正しいか**は人間と同じ `validateResonaSelection`（ここは組み立てた選択を必ず通してから返す）。
 *   - **実行**は人間と同じ `performSummonSigni`（出現条件の支払い・【出】・場から払ったカードの誘発を含む）。
 *
 * ■ なぜ要るか＝旧実装は CPU が**レゾナを一度も出さなかった**（相手のレゾナを `DEPLOY_RESTRICT` で読むだけ・§5.6.1）。
 *
 * ■ 方針（決定論）＝各支払い枠を**候補の先頭から**埋める（場のシグニは若いゾーン、手札・エナは先頭）。
 *   合計レベル／パワーの下限がある形はレベル＋パワーの大きい順に足していく。
 */
export function pickCpuResonaSelection(
  state: PlayerState, plan: ResonaPaymentPlan, cardMap: Map<string, CardData>,
): ResonaPaymentSelection | null {
  if (plan.combined) {
    const c = plan.combined;
    const cardOf = (i: ResonaPaymentItem) => i.zone === 'field'
      ? state.field.signi[i.index]?.at(-1)
      : (i.zone === 'hand' ? state.hand : state.energy)[i.index];
    const weight = (i: ResonaPaymentItem) => {
      const card = cardMap.get(getCardNum(cardOf(i) ?? ''));
      return (parseInt(card?.Level ?? '0', 10) || 0) * 100000 + (parseInt(card?.Power ?? '0', 10) || 0);
    };
    const opts = resonaCombinedOptions(state, plan, cardMap).sort((a, b) => weight(b) - weight(a));
    const upper = c.variable ? opts.length : (c.count ?? 1);
    for (let n = c.variable ? 1 : upper; n <= upper; n++) {
      const selection = { items: opts.slice(0, n) };
      if (opts.length >= n && validateResonaSelection(state, plan, selection, cardMap)) return selection;
    }
    return null;
  }
  const groupIdx = plan.groups.map((_, i) => i);
  const combos: number[][] = plan.chooseGroups === undefined
    ? [groupIdx]
    : (() => {
      const out: number[][] = [];
      const rec = (start: number, picked: number[]) => {
        if (picked.length === plan.chooseGroups) { out.push(picked); return; }
        for (let i = start; i < groupIdx.length; i++) rec(i + 1, [...picked, i]);
      };
      rec(0, []);
      return out;
    })();
  for (const groups of combos) {
    const items: ResonaPaymentItem[] = [];
    const used = new Set<string>();
    let ok = true;
    for (const group of groups) {
      const spec = plan.groups[group];
      const picked = resonaPaymentOptions(state, spec, cardMap)
        .filter(index => !used.has(`${spec.zone}:${index}`)).slice(0, spec.count);
      if (picked.length < spec.count) { ok = false; break; }
      for (const index of picked) { used.add(`${spec.zone}:${index}`); items.push({ zone: spec.zone, index, group }); }
    }
    if (ok && validateResonaSelection(state, plan, { items }, cardMap)) return { items };
  }
  return null;
}

/** 配置先＝**支払いで空くゾーン**があればそこ（場から払う形）、無ければ最初の空きゾーン。 */
export function pickCpuResonaZone(state: PlayerState, selection: ResonaPaymentSelection): number | null {
  const paidField = (selection.items ?? []).find(i => i.zone === 'field');
  if (paidField) return paidField.index;
  const empty = [0, 1, 2].find(z => (state.field.signi[z] ?? []).length === 0);
  return empty ?? null;
}

/** 支払いで場から離れるシグニのレベル合計（リミットの再計算に使う＝`performSummonSigni` の確定時検証と同じ式）。 */
export function paidFieldLevels(state: PlayerState, selection: ResonaPaymentSelection, cardMap: Map<string, CardData>): number {
  return (selection.items ?? []).filter(i => i.zone === 'field').reduce((sum, item) => {
    const num = getCardNum(state.field.signi[item.index]?.at(-1) ?? '');
    return sum + (parseInt(cardMap.get(num)?.Level ?? '0', 10) || 0);
  }, 0);
}
