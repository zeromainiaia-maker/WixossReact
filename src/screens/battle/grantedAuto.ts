import type { PlayerState, StackEntry } from '../../types';
import type { CardEffect } from '../../types/effects';

/** 攻撃側ルリグに実行時付与された ON_ATTACK_LRIG AUTO を収集し、usageLimit の消費IDを返す。 */
export function collectAttackingLrigGrantedAutos(
  state: PlayerState,
  playerId: string,
  lrigCardNum: string,
  genId: () => string,
): { entries: StackEntry[]; triggered: CardEffect[]; usedIds: string[] } {
  const entries: StackEntry[] = [];
  const triggered: CardEffect[] = [];
  const usedIds: string[] = [];
  if (state.lrig_abilities_disabled) return { entries, triggered, usedIds };

  for (const effect of state.lrig_granted_auto_effects ?? []) {
    if (effect.effectType !== 'AUTO' || !effect.timing?.includes('ON_ATTACK_LRIG')) continue;
    if (effect.usageLimit === 'once_per_turn' || effect.usageLimit === 'twice_per_turn') {
      const max = effect.usageLimit === 'once_per_turn' ? 1 : 2;
      const consumed = (state.actions_done ?? []).filter(id => id === effect.effectId).length
        + usedIds.filter(id => id === effect.effectId).length;
      if (consumed >= max) continue;
      usedIds.push(effect.effectId);
    }
    triggered.push(effect);
    entries.push({
      id: genId(), playerId, cardNum: lrigCardNum, effectId: effect.effectId,
      label: 'ルリグ付与効果（ルリグアタック時）', effect,
    });
  }
  return { entries, triggered, usedIds };
}

/** 「次に」だけ発火する一時付与AUTOを、最初の該当イベント収集時に消費する。 */
export function consumeTriggeredGrantedAutos(state: PlayerState, triggered: CardEffect[]): PlayerState {
  const ids = new Set(triggered.filter(e => e.consumeOnTrigger).map(e => e.effectId));
  if (ids.size === 0) return state;
  return {
    ...state,
    lrig_granted_auto_effects: (state.lrig_granted_auto_effects ?? []).filter(e => !ids.has(e.effectId)),
  };
}
