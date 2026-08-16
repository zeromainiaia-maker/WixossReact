import type { CardData, PlayerState } from '../../types';
import type { CardEffect, StubAction } from '../../types/effects';
import { evalUseCondition } from '../../engine/execUtils';

const baseCardNum = (id: string): string => id.split('#')[0];

/**
 * 「このシグニが対戦相手の、能力か効果の対象になったとき、このシグニを裏向きにし、表向きにする」
 * （`WX25-CP1-060-E2`＝`FLIP_SELF_ON_TARGETED`・§6.4 O-10・続き516）。
 *
 * 🔑**観測できる効果は「新しいオブジェクトになって、その効果の対象から外れる」**こと。
 * engine の `ON_TARGETED` トリガーは **`resumeSelectTarget` が効果を適用し終えた後**に積まれるので、
 * トリガーとしては表現できない（続き511 で特定したブロッカー）。⇒ **対象宣言の直後・適用の前**という
 * 1点（`handleEffectInteraction` の `SELECT_TARGET` 分岐）で、宣言された対象から外す形で解決する。
 *
 * ⚠**該当宣言が対象に1体も居なければ何も返さない**＝呼び出し側のコードパスは従来と 1バイトも変わらない
 *   （ホットパスに新しい分岐を足す以上、無関係な盤面では完全に不活性であることが安全条件）。
 * ⚠「ターン終了時まで【自】能力を失う」＝**同じターンに2回は避けられない**。この効果1つを
 *   `lost_ability_effect_ids_this_turn`（§6.4 O-10 続き507 の機構）で落とす。
 *   ⚠`abilities_removed`（カード単位・全能力）は使わない＝同居する【常】E1／【絆常】E3 まで消える。
 *   このカードの【自】は E2 だけなので、効果単位の失効で原文と一致する。
 */
export function resolveTargetDodgeFlip(args: {
  /** 宣言された対象（＝効果主から見た相手側のシグニ）。 */
  targeted: readonly string[];
  /** 対象の持ち主の state（宣言・条件評価・失効の書き込み先）。 */
  targetOwnerState: PlayerState;
  /** 効果主の state（条件評価の相手側）。 */
  sourceState: PlayerState;
  /** いま対象の持ち主のターンか（`triggerCondition.turnOwner` の判定用）。 */
  isTargetOwnerTurn: boolean;
  cardMap: Map<string, CardData>;
  effectsMap: Map<string, CardEffect[]>;
  turnPhase?: string;
}): { dodged: string[]; state: PlayerState } {
  const { targeted, targetOwnerState, sourceState, isTargetOwnerTurn, cardMap, effectsMap } = args;
  const dodged: string[] = [];
  let state = targetOwnerState;
  for (const num of targeted) {
    const zi = state.field.signi.findIndex(stack => stack?.at(-1) === num);
    if (zi < 0) continue;                       // 場のシグニでなければ対象外
    const effs = effectsMap.get(num) ?? effectsMap.get(baseCardNum(num)) ?? [];
    for (const eff of effs) {
      if (eff.effectType !== 'AUTO' || !eff.timing?.includes('ON_TARGETED')) continue;
      const act = eff.action as StubAction;
      if (act.type !== 'STUB' || act.id !== 'FLIP_SELF_ON_TARGETED') continue;
      if ((state.lost_ability_effect_ids_this_turn ?? []).includes(eff.effectId)) continue;
      // 《相手ターン》＝対象の持ち主から見て「相手のターン」。⚠落とすと自分のターンにも回避する。
      if (eff.triggerCondition?.turnOwner === 'opponent' && isTargetOwnerTurn) continue;
      if (eff.triggerCondition?.turnOwner === 'self' && !isTargetOwnerTurn) continue;
      // 「あなたの場に他の＜ブルアカ＞のシグニがある場合」＝使用条件。⚠落とすと単騎でも回避する。
      if (eff.condition && !evalUseCondition(eff.condition, state, sourceState, cardMap, num, args.turnPhase as never)) continue;
      dodged.push(num);
      state = {
        ...state,
        lost_ability_effect_ids_this_turn: [...(state.lost_ability_effect_ids_this_turn ?? []), eff.effectId],
      };
      break;
    }
  }
  return { dodged, state };
}
