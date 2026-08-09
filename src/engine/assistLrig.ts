import type { CardData, PlayerState } from '../types';
import type { ReturnAssistLrigToDeckAction } from '../types/effects';

const baseCardNum = (cardNum: string): string => {
  const hash = cardNum.indexOf('#');
  return hash > 0 ? cardNum.slice(0, hash) : cardNum;
};

const isColorlessZeroGrowCost = (growCost: string | undefined): boolean =>
  /^《無》×[0０]$/.test((growCost ?? '').replace(/\s/g, ''));

/** 場の左右アシストスタックの最上段から、原文条件を満たす候補だけを返す純関数。 */
export function collectReturnableAssistLrigTops(
  state: PlayerState,
  action: ReturnAssistLrigToDeckAction,
  cardMap: Map<string, CardData>,
): string[] {
  const tops = [state.field.assist_lrig_l?.at(-1), state.field.assist_lrig_r?.at(-1)]
    .filter((cardNum): cardNum is string => !!cardNum);
  return tops.filter(cardNum => {
    const card = cardMap.get(baseCardNum(cardNum));
    if (!card) return false;
    if (action.team !== undefined && card.Team !== action.team) return false;
    if (action.level !== undefined && parseInt(card.Level ?? '', 10) !== action.level) return false;
    // 現行CSVではルリグの Timing 列は全件「-」。アイコンは EffectText に格納されている。
    if (action.withoutAttackPhaseIcon && (card.EffectText ?? '').includes('アタックフェイズアイコン')) return false;
    if (action.excludeColorlessZeroGrowCost && isColorlessZeroGrowCost(card.GrowCost)) return false;
    return true;
  });
}
