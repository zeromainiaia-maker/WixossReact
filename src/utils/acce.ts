import type { PlayerState } from '../types';

type Field = PlayerState['field'];

/**
 * 🔴**旧形式（配列化する前の素の string）を配列へ正規化する**（タスク12(cxxxiv)）。
 * 途中局面ロードなどで `signi_acce[zone]` に `'WD18-013#8202'` がそのまま残っていると、
 * ①`.length` で数える側が**文字列長**を見て「13枚付いている」と誤判定し（`THIS_CARD_IS_ACCED`）、
 * ②`[...cards]` で複製する側が**1文字ずつの配列**へ展開して**ゾーンのデータを破壊する**
 * （実機で `hTrash=["W","D","1","8",…]` を観測）。⇒ 読み出しの入口で必ずここを通す。
 */
export function normalizeAcceSlot(cards: string[] | string | null | undefined): string[] | null {
  if (cards == null) return null;
  return typeof cards === 'string' ? [cards] : cards;
}

/** `signi_acce` 配列そのものの正規化（未設定は undefined のまま返す＝呼び出し側の既定値を壊さない）。 */
export function normalizeAcceSlots(slots: Field['signi_acce']): Field['signi_acce'] {
  if (!slots) return slots;
  return slots.some(cards => typeof cards === 'string') ? slots.map(normalizeAcceSlot) : slots;
}

/** A zone's complete, ordered 【アクセ】 list. Empty and missing slots are both no attachments. */
export function acceCardsAt(field: Field, zoneIdx: number): string[] {
  return normalizeAcceSlot(field.signi_acce?.[zoneIdx]) ?? [];
}

export function hasAcceAt(field: Field, zoneIdx: number): boolean {
  return acceCardsAt(field, zoneIdx).length > 0;
}

export function allAcceCards(field: Field): string[] {
  return (field.signi_acce ?? []).flatMap(cards => normalizeAcceSlot(cards) ?? []);
}

export function countAcce(field: Field): number {
  return allAcceCards(field).length;
}

export function findAcceZone(field: Field, cardNum: string | undefined): number {
  return cardNum ? (field.signi_acce ?? []).findIndex(cards => normalizeAcceSlot(cards)?.includes(cardNum)) : -1;
}

export function cloneAcceSlots(field: Field): (string[] | null)[] {
  return (field.signi_acce ?? [null, null, null]).map(cards => {
    const list = normalizeAcceSlot(cards);
    return list ? [...list] : null;
  });
}
