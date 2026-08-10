import type { CardData, PlayerState } from '../../types';
import type { CardEffect } from '../../types/effects';
import { collectLrigColorAndLimitMods } from '../../engine/effectEngine';

const baseCardNum = (id: string): string => id.split('#')[0];

// センタールリグの実効リミット。BattleScreen の表示・配置判定と効果条件で同じ式を使う。
export function computeEffectiveLrigLimit(
  state: PlayerState,
  otherState: PlayerState,
  cardMap: Map<string, CardData>,
  effectsMap: Map<string, CardEffect[]>,
  isOwnerTurn: boolean,
): number {
  const parseLimit = (value?: string) => value === '∞' ? Infinity : (parseInt(value ?? '0', 10) || 0);
  const centerInstance = state.field.lrig.at(-1) ?? '';
  const otherCenterInstance = otherState.field.lrig.at(-1) ?? '';
  const center = cardMap.get(state.card_identity_overrides?.[centerInstance] ?? baseCardNum(centerInstance));
  const otherCenter = cardMap.get(otherState.card_identity_overrides?.[otherCenterInstance] ?? baseCardNum(otherCenterInstance));
  const basicOverride = otherState.field.signi.some(stack => {
    const top = stack?.at(-1);
    return !!top && (effectsMap.get(top) ?? effectsMap.get(baseCardNum(top)) ?? []).some(effect =>
      effect.effectType === 'CONTINUOUS'
      && effect.action.type === 'STUB'
      && effect.action.id === 'OPP_CENTER_LRIG_LIMIT_SET_5');
  }) ? 5 : undefined;
  const copiedLimit = state.lrig_copy_opp_level_limit ? parseLimit(otherCenter?.Limit) : undefined;
  const centerLevel = parseInt(center?.Level ?? '0', 10) || 0;
  const limitUpperBonus = state.limit_upper_token
    && (state.field.assist_lrig_l ?? []).length === 0
    && (state.field.assist_lrig_r ?? []).length === 0
    && centerLevel >= 3 ? 2 : 0;
  const continuousDelta = collectLrigColorAndLimitMods(
    state, cardMap, effectsMap, otherState, isOwnerTurn,
  ).limitDelta;
  // ⚠**相手の場が宣言する `LRIG_LIMIT_MODIFY{owner:'opponent'}` はここでしか拾えない**（続き407）。
  //   `collectLrigColorAndLimitMods` は「その state 自身の場が宣言する owner:'self'」しか集計しないので、
  //   `WX22-002-E1`（「対戦相手のターンの間、対戦相手のセンタールリグのリミットは1減る」）が丸ごと落ちていた。
  const oppDeclaredDelta = collectOppDeclaredLrigLimitDelta(
    otherState, state, cardMap, effectsMap, !isOwnerTurn,
  );

  return (basicOverride ?? copiedLimit ?? parseLimit(center?.Limit))
    + ((state.field.assist_lrig_l ?? []).length > 0 ? 1 : 0)
    + ((state.field.assist_lrig_r ?? []).length > 0 ? 1 : 0)
    + (state.lrig_limit_mod ?? 0)
    + (state.game_lrig_limit_bonus ?? 0)
    + limitUpperBonus
    + continuousDelta;
}
