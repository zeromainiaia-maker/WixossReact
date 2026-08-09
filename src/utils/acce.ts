import type { PlayerState } from '../types';

type Field = PlayerState['field'];

/** A zone's complete, ordered 【アクセ】 list. Empty and missing slots are both no attachments. */
export function acceCardsAt(field: Field, zoneIdx: number): string[] {
  return field.signi_acce?.[zoneIdx] ?? [];
}

export function hasAcceAt(field: Field, zoneIdx: number): boolean {
  return acceCardsAt(field, zoneIdx).length > 0;
}

export function allAcceCards(field: Field): string[] {
  return (field.signi_acce ?? []).flatMap(cards => cards ?? []);
}

export function countAcce(field: Field): number {
  return allAcceCards(field).length;
}

export function findAcceZone(field: Field, cardNum: string | undefined): number {
  return cardNum ? (field.signi_acce ?? []).findIndex(cards => cards?.includes(cardNum)) : -1;
}

export function cloneAcceSlots(field: Field): (string[] | null)[] {
  return (field.signi_acce ?? [null, null, null]).map(cards => cards ? [...cards] : null);
}
