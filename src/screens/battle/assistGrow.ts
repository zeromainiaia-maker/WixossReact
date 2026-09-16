import type { CardData, PlayerState, TurnPhase } from '../../types';
import { getCardNum } from '../../engine/execUtils';
import { lrigClassesCompatible } from './growLogic';

/**
 * アシストルリグのグロウ候補（§5.6 `C-5`・2026-09-17）。
 *
 * 🔑**公式ルール**（English Rule Guide ver.1.0.0「Assist LRIG」）＝
 *   ①センタールリグのレベルを超えてグロウできない ②グロウフェイズではなく**カードの使用タイミング**でグロウする
 *   ③グロウ前後で共通のルリグタイプ ④レベルちょうど+1 ⑤同じターンに何回でもグロウできる。
 *
 * 🔴**なぜ切り出したか**＝この判定は `BattleScreen` の人間専用クロージャ（`getAssistGrowCandidates`）にあり、
 *   **CPU はアシストグロウを一度もしなかった**（§5.6.1）。⇒ **人間のボタンと CPU が同じ関数を見る**（§5.6.3 規律1）。
 *
 * ⚠**コストの支払い可否は含めない**（人間 UI は払えない候補もグレーで出す）＝CPU は支払いを選べた候補だけを使う。
 */
export function listAssistGrowCandidates(p: {
  state: PlayerState;
  side: 'l' | 'r';
  phase: TurnPhase | null | undefined;
  /** グロウする側のターンか。 */
  isOwnerTurn: boolean;
  cardMap: Map<string, CardData>;
}): CardData[] {
  const { state, side, phase, isOwnerTurn, cardMap } = p;
  const stack = (side === 'l' ? state.field.assist_lrig_l : state.field.assist_lrig_r) ?? [];
  const topInstanceId = stack.length > 0 ? stack[stack.length - 1] : null;
  const topCard = topInstanceId ? cardMap.get(getCardNum(topInstanceId)) : null;
  const topLevel = topCard != null ? (parseInt(topCard.Level ?? '-1') || 0) : -1;
  const topClass = topCard?.CardClass ?? '';
  const centerNum = state.field.lrig.at(-1);
  const centerCard = centerNum ? cardMap.get(getCardNum(centerNum)) : null;
  const centerLevel = centerCard ? parseInt(centerCard.Level) || 0 : 0;
  const canGrowPhase =
    (phase === 'MAIN' && isOwnerTurn) ||
    (phase === 'ATTACK_ARTS' && isOwnerTurn) ||
    (phase === 'ATTACK_ARTS_OP' && !isOwnerTurn);
  if (!canGrowPhase) return [];
  return state.lrig_deck
    .map(num => cardMap.get(getCardNum(num)))
    .filter((c): c is CardData => {
      if (!c || c.Type !== 'アシストルリグ') return false;
      const level = parseInt(c.Level) || 0;
      if (level !== topLevel + 1) return false;
      if (level > centerLevel) return false;
      // 🆕**「このターン、次にアシストルリグにグロウする場合、ルリグタイプは無視され」**（§5.3 `O-180`・`WX24-P2-043`）。
      if (topClass && !state.next_assist_grow_mods?.ignoreLrigType
          && !lrigClassesCompatible(topClass, c.CardClass)) return false;
      return (phase === 'MAIN' && c.Timing.includes('メインフェイズ'))
        || ((phase === 'ATTACK_ARTS' || phase === 'ATTACK_ARTS_OP') && c.Timing.includes('アタックフェイズ'));
    });
}
