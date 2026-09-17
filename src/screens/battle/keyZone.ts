import type { PlayerState } from '../../types';

/** 場のキー枠（`key_piece` ＝メイン枠／`key_piece_extra` ＝増設枠）から1枚を指すハンドル。 */
export type KeySlotRef = { slot: 'main' } | { slot: 'extra'; index: number } | null;

/** `idOrCardNum` が指す場のキー枠を探す。インスタンス id の完全一致と、カード番号での前方一致の両方を見る。 */
export function findKeySlot(field: PlayerState['field'], idOrCardNum: string): KeySlotRef {
  const hit = (slot: string | null | undefined): boolean =>
    !!slot && (slot === idOrCardNum || slot.startsWith(`${idOrCardNum}_`));
  if (hit(field.key_piece)) return { slot: 'main' };
  const extra = field.key_piece_extra ?? [];
  const index = extra.findIndex(hit);
  return index >= 0 ? { slot: 'extra', index } : null;
}

/**
 * **キー1枚が場を離れたらルリグトラッシュへ**（§5.6 `C-9`・台帳 [RULES.md](../../../docs/RULES.md) `R-46`・JP-094）。
 *
 * 🔴**2026-09-17 の棚卸しで見つけた不一致**＝同じ処理が4箇所に写経され、**3箇所が枠を取り違えていた**。
 *   - アーツのキー代替（`ENERGY_SUBSTITUTE_TRASH_KEY`）と【起】のキー代替は **`key_piece` を無条件に `null`** にしていた＝
 *     代替に使ったのが**増設枠のキー**だと、**メイン枠のキーが消滅**し、増設枠のキーは**場とルリグトラッシュの両方に居る**（複製）。
 *   - 【起】側はさらに **`key_piece_extra: []`** と全消ししており、増設枠のキーが**どこにも行かずに消えた**。
 *   - アンコールのキー1枚支払いも `field.key_piece` 決め打ち＝増設枠しか無い盤面では**場にキーが無い扱い**で止まる。
 *   ⇒ 正しい1本（キー【起】コストの経路）だけが枠を見分けていたので、その判定をここへ出して4箇所で共有する。
 *
 * ⚠**見つからなければ何もしない**（fail-closed）＝「場に無いカードをルリグトラッシュに積む」＝複製になるため。
 * ⚠**メイン枠が空いても増設枠は繰り上げない**＝枠の識別（`key_place_limit` の数え方）を変えないため。
 */
export function removeKeyToLrigTrash(
  field: PlayerState['field'],
  lrigTrash: string[],
  idOrCardNum: string,
): { field: PlayerState['field']; lrigTrash: string[]; removed: string | null } {
  const ref = findKeySlot(field, idOrCardNum);
  if (!ref) return { field, lrigTrash, removed: null };
  if (ref.slot === 'main') {
    const removed = field.key_piece!;
    return { field: { ...field, key_piece: null }, lrigTrash: [...lrigTrash, removed], removed };
  }
  const extra = field.key_piece_extra ?? [];
  const removed = extra[ref.index];
  return {
    field: { ...field, key_piece_extra: extra.filter((_, i) => i !== ref.index) },
    lrigTrash: [...lrigTrash, removed],
    removed,
  };
}
