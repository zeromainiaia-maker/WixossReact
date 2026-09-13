import type { CardData } from '../../types';
import type { TargetFilter } from '../../types/effects';
import { matchesFilter } from '../../engine/execUtils';

/**
 * `DECLARE_CARD_NAME` の検索候補を組み立てる React 非依存の純関数。
 * pending には候補を積まず、表示時だけ全カードデータから決定論的に生成する。
 */
export function declareNameCandidates(
  cardMap: Map<string, CardData>,
  pool: { source: 'all_cards'; filter?: TargetFilter },
  query: string,
  limit: number,
): string[] {
  if (pool.source !== 'all_cards' || limit <= 0) return [];
  const names = new Set<string>();
  for (const card of cardMap.values()) {
    if (!card.CardName || !matchesFilter(card, pool.filter)) continue;
    if (query && !card.CardName.includes(query)) continue;
    names.add(card.CardName);
  }
  return [...names]
    .sort((a, b) => a < b ? -1 : a > b ? 1 : 0)
    .slice(0, limit);
}
