import { getCardNum } from '../../engine/effectExecutor';
import { matchesFilter } from '../../engine/execUtils';
import type { CardData, PlayerState } from '../../types';
import type { AppearanceCondition, AppearanceSourceZone, EffectCost, TargetFilter } from '../../types/effects';

export type ResonaPaymentZone = AppearanceSourceZone;

export interface ResonaPaymentSpec {
  zone: ResonaPaymentZone;
  count: number;
  filter?: TargetFilter;
  label?: string;
  destination?: 'trash' | 'lrig_trash';
}

export interface ResonaPaymentPlan {
  groups: ResonaPaymentSpec[];
  chooseGroups?: number;
  combined?: {
    zones: ResonaPaymentZone[];
    count?: number;
    variable?: boolean;
    filter?: TargetFilter;
    totalLevelMin?: number;
    totalPowerMin?: number;
  };
}

export interface ResonaPaymentItem {
  zone: ResonaPaymentZone;
  index: number;
  group?: number;
}

export interface ResonaPaymentSelection {
  /** 段階2との後方互換。単一グループだけで使用する。 */
  zone?: ResonaPaymentZone;
  indices?: number[];
  items?: ResonaPaymentItem[];
}

export interface ResonaSummonCandidate {
  cardNum: string;
  appearance: AppearanceCondition;
  payment: ResonaPaymentPlan;
}

function groupsFromCost(cost: EffectCost): ResonaPaymentSpec[] | null {
  if (cost.fieldToLrigTrash && cost.fieldTrash) return [
    { zone: 'field', count: cost.fieldToLrigTrash.count, filter: cost.fieldToLrigTrash.filter, destination: 'lrig_trash', label: 'ルリグトラッシュへ置くカード' },
    { zone: 'field', count: cost.fieldTrash.count, filter: cost.fieldTrash.filter, destination: 'trash', label: 'トラッシュへ置くカード' },
  ];
  if (cost.discard !== undefined) return [{ zone: 'hand', count: cost.discard, filter: cost.discardFilter }];
  if (cost.energyTrash) return [{ zone: 'energy', count: cost.energyTrash.count, filter: cost.energyTrash.filter }];
  if (cost.fieldTrash) return [{ zone: 'field', count: cost.fieldTrash.count, filter: cost.fieldTrash.filter }];
  if (cost.discardGroups?.length) return cost.discardGroups.map((g, i) => ({ zone: 'hand', ...g, label: `グループ${i + 1}` }));
  if (cost.energyTrashGroups?.length) return cost.energyTrashGroups.map((g, i) => ({ zone: 'energy', ...g, label: `グループ${i + 1}` }));
  if (cost.fieldTrashGroups?.length) return cost.fieldTrashGroups.map((g, i) => ({ zone: 'field', ...g, label: `グループ${i + 1}` }));
  return null;
}

export function appearancePayment(appearance?: AppearanceCondition): ResonaPaymentPlan | null {
  if (!appearance) return null;
  if (appearance.choice) {
    const groups = appearance.choice.options.flatMap((cost, i) =>
      (groupsFromCost(cost) ?? []).map(g => ({ ...g, label: `選択肢${i + 1}` })));
    return groups.length === appearance.choice.options.length
      ? { groups, chooseGroups: appearance.choice.choose }
      : null;
  }
  if (appearance.combinedTrash) {
    const c = appearance.combinedTrash;
    return { groups: [], combined: {
      zones: c.zones, count: c.count, variable: c.variable, filter: c.filter,
      totalLevelMin: c.totalLevelMin, totalPowerMin: c.totalPowerMin,
    } };
  }
  const groups = groupsFromCost(appearance.cost);
  return groups ? { groups } : null;
}

export function singleZonePayment(appearance?: AppearanceCondition): ResonaPaymentSpec | null {
  if (!appearance || appearance.paymentShape !== 'SINGLE_ZONE' || !appearance.timings.includes('MAIN')) return null;
  return appearancePayment(appearance)?.groups[0] ?? null;
}

export function resonaPaymentOptions(
  state: PlayerState,
  payment: ResonaPaymentSpec,
  cardMap: Map<string, CardData>,
): number[] {
  if (payment.zone === 'field') {
    return state.field.signi.flatMap((stack, zoneIndex) => {
      const top = stack?.at(-1);
      return top && matchesFilter(cardMap.get(getCardNum(top)), payment.filter) ? [zoneIndex] : [];
    });
  }
  const cards = payment.zone === 'hand' ? state.hand : state.energy;
  return cards.flatMap((id, index) =>
    matchesFilter(cardMap.get(getCardNum(id)), payment.filter) ? [index] : []);
}

export function resonaCombinedOptions(
  state: PlayerState,
  plan: ResonaPaymentPlan,
  cardMap: Map<string, CardData>,
): ResonaPaymentItem[] {
  const c = plan.combined;
  if (!c) return [];
  return c.zones.flatMap(zone =>
    resonaPaymentOptions(state, { zone, count: 0, filter: c.filter }, cardMap)
      .map(index => ({ zone, index })));
}

function cardForItem(state: PlayerState, item: ResonaPaymentItem): string | undefined {
  if (item.zone === 'field') return state.field.signi[item.index]?.at(-1);
  return (item.zone === 'hand' ? state.hand : state.energy)[item.index];
}

function normalizedItems(selection: ResonaPaymentSelection): ResonaPaymentItem[] {
  if (selection.items) return selection.items;
  return selection.zone && selection.indices
    ? selection.indices.map(index => ({ zone: selection.zone!, index, group: 0 }))
    : [];
}

export function validateResonaSelection(
  state: PlayerState,
  plan: ResonaPaymentPlan,
  selection: ResonaPaymentSelection,
  cardMap: Map<string, CardData>,
): boolean {
  const items = normalizedItems(selection);
  const unique = new Set(items.map(i => `${i.zone}:${i.index}`));
  if (unique.size !== items.length) return false;
  if (plan.combined) {
    const c = plan.combined;
    const valid = new Set(resonaCombinedOptions(state, plan, cardMap).map(i => `${i.zone}:${i.index}`));
    if (items.some(i => !valid.has(`${i.zone}:${i.index}`))) return false;
    if (c.count !== undefined && items.length !== c.count) return false;
    if (c.variable && items.length < 1) return false;
    const cards = items.map(i => cardMap.get(getCardNum(cardForItem(state, i) ?? '')));
    const level = cards.reduce((n, card) => n + (parseInt(card?.Level ?? '0', 10) || 0), 0);
    const power = cards.reduce((n, card) => n + (parseInt(card?.Power ?? '0', 10) || 0), 0);
    return level >= (c.totalLevelMin ?? 0) && power >= (c.totalPowerMin ?? 0);
  }
  if (plan.chooseGroups !== undefined) {
    const selectedGroups = new Set(items.map(i => i.group ?? 0));
    if (selectedGroups.size !== plan.chooseGroups) return false;
    return plan.groups.every((g, group) => {
      const selected = items.filter(i => (i.group ?? 0) === group);
      if (selected.length === 0) return true;
      if (selected.length !== g.count || selected.some(i => i.zone !== g.zone)) return false;
      const valid = new Set(resonaPaymentOptions(state, g, cardMap));
      return selected.every(i => valid.has(i.index));
    });
  }
  if (items.length !== plan.groups.reduce((n, g) => n + g.count, 0)) return false;
  return plan.groups.every((g, group) => {
    const selected = items.filter(i => (i.group ?? 0) === group);
    if (selected.length !== g.count || selected.some(i => i.zone !== g.zone)) return false;
    const valid = new Set(resonaPaymentOptions(state, g, cardMap));
    return selected.every(i => valid.has(i.index));
  });
}

export function canPayResonaAppearance(
  state: PlayerState,
  appearance: AppearanceCondition | undefined,
  cardMap: Map<string, CardData>,
): boolean {
  const plan = appearancePayment(appearance);
  if (!plan) return false;
  if (plan.combined) {
    const opts = resonaCombinedOptions(state, plan, cardMap);
    const count = plan.combined.count ?? 1;
    if (opts.length < count) return false;
    // 合計制約は最大値側から選んでも届かないなら候補に出さない。
    const cards = opts.map(i => cardMap.get(getCardNum(cardForItem(state, i) ?? '')));
    const maxLevel = cards.map(c => parseInt(c?.Level ?? '0', 10) || 0).sort((a, b) => b - a).slice(0, count).reduce((a, b) => a + b, 0);
    const powers = cards.map(c => parseInt(c?.Power ?? '0', 10) || 0).sort((a, b) => b - a);
    const maxPower = (plan.combined.variable ? powers : powers.slice(0, count)).reduce((a, b) => a + b, 0);
    return maxLevel >= (plan.combined.totalLevelMin ?? 0) && maxPower >= (plan.combined.totalPowerMin ?? 0);
  }
  const canAssign = (groups: number[], pos = 0, used = new Set<string>()): boolean => {
    if (pos >= groups.length) return true;
    const group = groups[pos];
    const spec = plan.groups[group];
    const options = resonaPaymentOptions(state, spec, cardMap);
    const choose = (start: number, left: number): boolean => {
      if (left === 0) return canAssign(groups, pos + 1, used);
      for (let i = start; i < options.length; i++) {
        const k = `${spec.zone}:${options[i]}`;
        if (used.has(k)) continue;
        used.add(k);
        if (choose(i + 1, left - 1)) return true;
        used.delete(k);
      }
      return false;
    };
    return choose(0, spec.count);
  };
  if (plan.chooseGroups !== undefined) {
    const chooseGroupSet = (start: number, picked: number[]): boolean => {
      if (picked.length === plan.chooseGroups) return canAssign(picked);
      for (let i = start; i < plan.groups.length; i++) {
        if (chooseGroupSet(i + 1, [...picked, i])) return true;
      }
      return false;
    };
    return chooseGroupSet(0, []);
  }
  return canAssign(plan.groups.map((_, i) => i));
}

export function getResonaSummonCandidate(
  cardNum: string,
  state: PlayerState,
  cardMap: Map<string, CardData>,
  effectsMap: Map<string, import('../../types/effects').CardEffect[]>,
  timing: AppearanceCondition['timings'][number],
): ResonaSummonCandidate | null {
  const card = cardMap.get(getCardNum(cardNum));
  if (card?.Type !== 'レゾナ') return null;
  const appearance = effectsMap.get(card.CardNum)?.find(e => e.appearanceCondition)?.appearanceCondition;
  const payment = appearancePayment(appearance);
  if (!appearance || !appearance.timings.includes(timing) || !payment || !canPayResonaAppearance(state, appearance, cardMap)) return null;
  return { cardNum, appearance, payment };
}

/** Payable Resona summons that exist only in the opponent's pending-spell response window. */
export function getSpellCutinResonaCandidates(
  state: PlayerState,
  cardMap: Map<string, CardData>,
  effectsMap: Map<string, import('../../types/effects').CardEffect[]>,
): ResonaSummonCandidate[] {
  return state.lrig_deck.flatMap(instanceId => {
    const candidate = getResonaSummonCandidate(instanceId, state, cardMap, effectsMap, 'SPELL_CUTIN');
    return candidate ? [candidate] : [];
  });
}

export function getMainSingleZoneResonaCandidate(
  cardNum: string, state: PlayerState, cardMap: Map<string, CardData>,
  effectsMap: Map<string, import('../../types/effects').CardEffect[]>,
): ResonaSummonCandidate | null {
  return getResonaSummonCandidate(cardNum, state, cardMap, effectsMap, 'MAIN');
}

export interface ResonaPaymentResult {
  state: PlayerState;
  fieldTrashCostCards: string[];
  discardedCostCards: string[];
}

export function payResonaAppearanceAndPlace(
  state: PlayerState, cardNum: string, payment: ResonaPaymentPlan | ResonaPaymentSpec,
  selection: ResonaPaymentSelection, zoneIndex: number, cardMap: Map<string, CardData>,
): ResonaPaymentResult | null {
  const plan: ResonaPaymentPlan = 'groups' in payment ? payment : { groups: [payment] };
  if (!validateResonaSelection(state, plan, selection, cardMap)) return null;
  if (zoneIndex < 0 || zoneIndex > 2) return null;
  const lrigIndex = state.lrig_deck.findIndex(id => id === cardNum);
  if (lrigIndex < 0) return null;
  const items = normalizedItems(selection);
  if ((state.field.signi[zoneIndex]?.length ?? 0) > 0 &&
      !items.some(i => i.zone === 'field' && i.index === zoneIndex)) return null;
  const byZone = (zone: ResonaPaymentZone) => new Set(items.filter(i => i.zone === zone).map(i => i.index));
  const handSet = byZone('hand'), energySet = byZone('energy'), fieldSet = byZone('field');
  const fieldLrigTrashSet = new Set(items.filter(i =>
    i.zone === 'field' && plan.groups[i.group ?? 0]?.destination === 'lrig_trash').map(i => i.index));
  const discardedCostCards = state.hand.filter((_, i) => handSet.has(i));
  const energyTrashed = state.energy.filter((_, i) => energySet.has(i));
  const nextSigni = [...state.field.signi] as (string[] | null)[];
  const nextDown = [...(state.field.signi_down ?? [false, false, false])];
  const nextFrozen = [...(state.field.signi_frozen ?? [false, false, false])];
  const nextCharms = [...(state.field.signi_charms ?? [null, null, null])];
  const nextAcce = [...(state.field.signi_acce ?? [null, null, null])];
  const nextSoul = [...(state.field.signi_soul ?? [null, null, null])];
  const fieldTrashed: string[] = [], extras: string[] = [], lrigTrashed: string[] = [];
  for (const zi of fieldSet) {
    const stack = nextSigni[zi];
    if (!stack?.length) return null;
    const topNum = getCardNum(stack.at(-1)!);
    if (fieldLrigTrashSet.has(zi)) lrigTrashed.push(topNum);
    else fieldTrashed.push(topNum);
    extras.push(...stack.slice(0, -1).map(getCardNum));
    if (nextCharms[zi]) extras.push(nextCharms[zi]!);
    if (nextAcce[zi]) extras.push(...nextAcce[zi]!);
    if (nextSoul[zi]) lrigTrashed.push(nextSoul[zi]!);
    nextSigni[zi] = null; nextDown[zi] = false; nextFrozen[zi] = false;
    nextCharms[zi] = null; nextAcce[zi] = null; nextSoul[zi] = null;
  }
  nextSigni[zoneIndex] = [cardNum]; nextDown[zoneIndex] = false; nextFrozen[zoneIndex] = false;
  const next: PlayerState = {
    ...state,
    lrig_deck: state.lrig_deck.filter((_, i) => i !== lrigIndex),
    hand: state.hand.filter((_, i) => !handSet.has(i)),
    energy: state.energy.filter((_, i) => !energySet.has(i)),
    trash: [...state.trash, ...discardedCostCards, ...energyTrashed, ...fieldTrashed, ...extras],
    lrig_trash: [...state.lrig_trash, ...lrigTrashed],
    // §5.3 O-122: 「このレゾナの**出現条件で**〜していた場合」が読む支払い内容。
    //   ⚠**この関数が支払いの唯一の funnel**なので、ここで刻めば全経路（メイン／スペルカットイン等）を覆える。
    //   ⚠`extras`（下のカード・チャーム・アクセ）は**支払いとして選んだカードではない**ので含めない。
    last_appearance_cost_cards: [...discardedCostCards, ...energyTrashed, ...fieldTrashed, ...lrigTrashed],
    field: {
      ...state.field, signi: nextSigni, signi_down: nextDown, signi_frozen: nextFrozen,
      signi_charms: nextCharms, signi_acce: nextAcce, signi_soul: nextSoul,
      puppet_signi: (state.field.puppet_signi ?? []).filter(id => !fieldTrashed.includes(getCardNum(id))),
    },
  };
  return { state: next, fieldTrashCostCards: fieldTrashed, discardedCostCards };
}
