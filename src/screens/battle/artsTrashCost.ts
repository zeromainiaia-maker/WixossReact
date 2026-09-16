import type { CardData } from '../../types';
import type { EffectCost } from '../../types/effects';

/**
 * 通常召喚UIとengineの双方で使う、ルリグデッキのアーツ徴収候補判定。
 *
 * 🆕🔴**§5.3 `O-521`（2026-09-16）＝`Type` は複合値なので完全一致で見ない。**
 * クラフトのアーツは `Type` が `'アーツ/クラフト'` なので、`=== 'アーツ'` だと
 * **12効果すべてでコスト候補から外れていた**。原文が「クラフトではない」と書くのは
 * `WXK10-006-E3` の**1件だけ**＝残り11効果は engine が原文より狭かった（過少実行）。
 * ⚠「クラフトではない」の限定は **`excludeCraft` payload** で表す（型の完全一致に依存させない）。
 * 🔑同じ罠を `isImmovableArtsFromLrigDeck`（`O-423`）が先に踏んでおり、あちらは向きが逆の
 *   「守っているつもりで一度も守っていない」だった。
 */
export function matchesTrashArtsFromLrigDeckCost(
  card: CardData | undefined,
  cost: NonNullable<EffectCost['trashArtsFromLrigDeck']>,
): boolean {
  if (!card?.Type?.includes('アーツ')) return false;
  if (cost.excludeCraft && card.Type.includes('クラフト')) return false;
  return !cost.color || (card.Color?.includes(cost.color) ?? false);
}
