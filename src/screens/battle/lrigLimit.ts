import type { CardData, PlayerState } from '../../types';
import type { CardEffect } from '../../types/effects';
import { checkActiveCondition, collectLrigColorAndLimitMods } from '../../engine/effectEngine';

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
  // 「次のあなたのメインフェイズまで、このルリグの基本リミットは N になる」（`WXK01-002-E2`・§6.4 O-3 続き492）。
  // ⚠**加算（`lrig_limit_mod`）ではなく置換**なので `basicOverride` と同じ層に置く。相手からの
  //   `OPP_CENTER_LRIG_LIMIT_SET_5` より自分の宣言を優先する（原文は「このルリグの基本リミットは12になる」）。
  const selfBaseOverride = state.lrig_base_limit_override;
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

  return (selfBaseOverride ?? basicOverride ?? copiedLimit ?? parseLimit(center?.Limit))
    + ((state.field.assist_lrig_l ?? []).length > 0 ? 1 : 0)
    + ((state.field.assist_lrig_r ?? []).length > 0 ? 1 : 0)
    + (state.lrig_limit_mod ?? 0)
    + (state.game_lrig_limit_bonus ?? 0)
    + limitUpperBonus
    + continuousDelta
    + oppDeclaredDelta;
}

/**
 * 相手（declarerState）の場が CONTINUOUS `LRIG_LIMIT_MODIFY{owner:'opponent'}` で宣言する、
 * **こちら（victimState）のリミット増減**を集める。`collectLrigColorAndLimitMods` は
 * 「自分の場が宣言する owner:'self'」しか見ないため、対面からの宣言はこの関数でしか拾えない。
 * `activeCondition`（例: `TURN_OWNER opponent`＝「対戦相手のターンの間」）は宣言側視点で評価する。
 */
export function collectOppDeclaredLrigLimitDelta(
  declarerState: PlayerState,
  victimState: PlayerState,
  cardMap: Map<string, CardData>,
  effectsMap: Map<string, CardEffect[]>,
  isDeclarerTurn: boolean,
): number {
  let delta = 0;
  const sources = [
    ...declarerState.field.signi.flatMap(stack => stack?.at(-1) ? [stack.at(-1)!] : []),
    ...(declarerState.field.lrig.at(-1) ? [declarerState.field.lrig.at(-1)!] : []),
    ...(declarerState.field.assist_lrig_l?.at(-1) ? [declarerState.field.assist_lrig_l.at(-1)!] : []),
    ...(declarerState.field.assist_lrig_r?.at(-1) ? [declarerState.field.assist_lrig_r.at(-1)!] : []),
    ...(declarerState.field.key_piece ? [declarerState.field.key_piece] : []),
  ];
  for (const num of sources) {
    for (const eff of (effectsMap.get(num) ?? effectsMap.get(baseCardNum(num)) ?? [])) {
      if (eff.effectType !== 'CONTINUOUS' || eff.action.type !== 'LRIG_LIMIT_MODIFY') continue;
      const act = eff.action as import('../../types/effects').LrigLimitModifyAction;
      // 🆕`'any'`＝「（お互いのセンタールリグに影響する）」＝宣言側の場から相手側にも掛かる。
      if (act.owner !== 'opponent' && act.owner !== 'any') continue;
      if (!checkActiveCondition(eff.activeCondition, declarerState, victimState, isDeclarerTurn, cardMap, num)) continue;
      delta += act.delta;
    }
  }
  return delta;
}
