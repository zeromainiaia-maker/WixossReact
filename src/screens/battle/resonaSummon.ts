import { getCardNum } from '../../engine/effectExecutor';
import { matchesFilter } from '../../engine/execUtils';
import type { CardData, PlayerState } from '../../types';
import type { AppearanceCondition, TargetFilter } from '../../types/effects';

export type ResonaPaymentZone = 'hand' | 'energy' | 'field';

export interface ResonaPaymentSpec {
  zone: ResonaPaymentZone;
  count: number;
  filter?: TargetFilter;
}

export interface ResonaPaymentSelection {
  zone: ResonaPaymentZone;
  indices: number[];
}

export interface ResonaSummonCandidate {
  cardNum: string;
  appearance: AppearanceCondition;
  payment: ResonaPaymentSpec;
}

export function singleZonePayment(appearance?: AppearanceCondition): ResonaPaymentSpec | null {
  if (!appearance || appearance.paymentShape !== 'SINGLE_ZONE' || !appearance.timings.includes('MAIN')) return null;
  const c = appearance.cost;
  if (c.discard !== undefined) return { zone: 'hand', count: c.discard, filter: c.discardFilter };
  if (c.energyTrash) return { zone: 'energy', count: c.energyTrash.count, filter: c.energyTrash.filter };
  if (c.fieldTrash) return { zone: 'field', count: c.fieldTrash.count, filter: c.fieldTrash.filter };
  return null;
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

export function canPayResonaAppearance(
  state: PlayerState,
  appearance: AppearanceCondition | undefined,
  cardMap: Map<string, CardData>,
): boolean {
  const payment = singleZonePayment(appearance);
  return !!payment && resonaPaymentOptions(state, payment, cardMap).length >= payment.count;
}

export function getMainSingleZoneResonaCandidate(
  cardNum: string,
  state: PlayerState,
  cardMap: Map<string, CardData>,
  effectsMap: Map<string, import('../../types/effects').CardEffect[]>,
): ResonaSummonCandidate | null {
  const card = cardMap.get(getCardNum(cardNum));
  if (card?.Type !== 'レゾナ') return null;
  const appearance = effectsMap.get(card.CardNum)?.find(e => e.appearanceCondition)?.appearanceCondition;
  const payment = singleZonePayment(appearance);
  if (!appearance || !payment || !canPayResonaAppearance(state, appearance, cardMap)) return null;
  return { cardNum, appearance, payment };
}

export function payResonaAppearanceAndPlace(
  state: PlayerState,
  cardNum: string,
  payment: ResonaPaymentSpec,
  selection: ResonaPaymentSelection,
  zoneIndex: number,
  cardMap: Map<string, CardData>,
): PlayerState | null {
  if (selection.zone !== payment.zone || selection.indices.length !== payment.count) return null;
  if (zoneIndex < 0 || zoneIndex > 2 || (state.field.signi[zoneIndex]?.length ?? 0) > 0) return null;
  const unique = new Set(selection.indices);
  if (unique.size !== selection.indices.length) return null;
  const valid = new Set(resonaPaymentOptions(state, payment, cardMap));
  if (selection.indices.some(i => !valid.has(i))) return null;
  const lrigIndex = state.lrig_deck.findIndex(id => id === cardNum);
  if (lrigIndex < 0) return null;

  const nextSigni = [...state.field.signi] as (string[] | null)[];
  const nextDown = [...(state.field.signi_down ?? [false, false, false])];
  const nextFrozen = [...(state.field.signi_frozen ?? [false, false, false])];
  nextSigni[zoneIndex] = [cardNum];
  nextDown[zoneIndex] = false;
  nextFrozen[zoneIndex] = false;
  const lrigDeck = state.lrig_deck.filter((_, i) => i !== lrigIndex);

  if (payment.zone === 'hand') {
    const paid = state.hand.filter((_, i) => !unique.has(i));
    const trashed = state.hand.filter((_, i) => unique.has(i));
    return { ...state, lrig_deck: lrigDeck, hand: paid, trash: [...state.trash, ...trashed],
      field: { ...state.field, signi: nextSigni, signi_down: nextDown, signi_frozen: nextFrozen } };
  }
  if (payment.zone === 'energy') {
    const paid = state.energy.filter((_, i) => !unique.has(i));
    const trashed = state.energy.filter((_, i) => unique.has(i));
    return { ...state, lrig_deck: lrigDeck, energy: paid, trash: [...state.trash, ...trashed],
      field: { ...state.field, signi: nextSigni, signi_down: nextDown, signi_frozen: nextFrozen } };
  }

  const nextCharms = [...(state.field.signi_charms ?? [null, null, null])];
  const nextAcce = [...(state.field.signi_acce ?? [null, null, null])];
  const nextSoul = [...(state.field.signi_soul ?? [null, null, null])];
  const trashed: string[] = [];
  const lrigTrashed: string[] = [];
  for (const zi of selection.indices) {
    const stack = nextSigni[zi];
    if (!stack?.length) return null;
    trashed.push(...stack.map(getCardNum));
    if (nextCharms[zi]) trashed.push(nextCharms[zi]!);
    if (nextAcce[zi]) trashed.push(nextAcce[zi]!);
    if (nextSoul[zi]) lrigTrashed.push(nextSoul[zi]!);
    nextSigni[zi] = null;
    nextDown[zi] = false;
    nextFrozen[zi] = false;
    nextCharms[zi] = null;
    nextAcce[zi] = null;
    nextSoul[zi] = null;
  }
  return {
    ...state, lrig_deck: lrigDeck, trash: [...state.trash, ...trashed],
    lrig_trash: [...state.lrig_trash, ...lrigTrashed],
    field: {
      ...state.field, signi: nextSigni, signi_down: nextDown, signi_frozen: nextFrozen,
      signi_charms: nextCharms, signi_acce: nextAcce, signi_soul: nextSoul,
      puppet_signi: (state.field.puppet_signi ?? []).filter(id =>
        !selection.indices.some(zi => state.field.signi[zi]?.includes(id))),
    },
  };
}
