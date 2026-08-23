import type { CardData } from '../../types';
import type { CardEffect } from '../../types/effects';
import { oppLifeCrashSourceMatches } from '../../engine/triggerCollect';

/** BattleScreen の相手ライフクラッシュ実機経路で使う発火源判定。 */
export function battleOppLifeCrashSourceMatches(
  effect: CardEffect,
  watcherNum: string,
  crashSourceCardNum: string | undefined,
  cardMap: Map<string, CardData>,
): boolean {
  return oppLifeCrashSourceMatches(effect, watcherNum, crashSourceCardNum, cardMap);
}
