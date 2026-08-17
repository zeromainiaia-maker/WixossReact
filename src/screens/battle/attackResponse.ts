// 対戦相手のシグニのアタック宣言に応答して使える【起】（timing:'ON_OPP_SIGNI_ATTACK'）の収集。
//
// 原文「この能力は対戦相手のシグニ１体がアタックしたときにしか使用できない」（WX05-013-E2＝実データ1枚）は
// **使用条件ではなく使用タイミング**。旧実装は `condition:{DURING_PHASE, phases:['ATTACK_SIGNI_OP']}` だったが
// `ATTACK_SIGNI_OP` は `TurnPhase` に存在しない値＝条件が常に false で、【起】が一度もボタンに出なかった
// （Opusタスク12(cx)）。フェイズを増やす代わりに、**アタック宣言→バトル解決の間**（`pending_signi_battle` が
// 立っている区間）に守備側のスタックへ「支払って発動するか」の CHOOSE を積む＝`ON_OPP_SIGNI_ATTACK_DIRECT`
// （WX04-004-E2）と同じ作法に揃える。UI 部品も新しい窓も要らない。
import type { PlayerState, CardData } from '../../types';
import type { CardEffect } from '../../types/effects';
import { wrapOptionalOnPlay } from '../../engine/triggerCollect';
import { evalUseCondition } from '../../engine/execUtils';

/** コストが「そもそも払えない」場合は選択肢に出さない（払えない CHOOSE を毎アタック出さないため）。 */
function canAffordActivationCost(eff: CardEffect, state: PlayerState): boolean {
  const cost = eff.cost;
  if (!cost) return true;
  const exceedPool = state.field.lrig.slice(0, -1).length
    + (state.field.assist_lrig_l?.slice(0, -1).length ?? 0)
    + (state.field.assist_lrig_r?.slice(0, -1).length ?? 0);
  if ((cost.exceed ?? 0) > exceedPool) return false;
  if ((cost.coin ?? 0) > (state.coins ?? 0)) return false;
  if ((cost.discard ?? 0) > state.hand.length) return false;
  const energyTotal = (cost.energy ?? []).reduce((s, e) => s + e.count, 0);
  if (energyTotal > state.energy.length) return false;
  return true;
}

/**
 * 守備側（＝アタックされている側）が、宣言されたシグニアタックに応答して使える【起】を集める。
 * 走査元はセンタールリグ・アシストルリグ・場のシグニの各頂点。
 * ⚠コストは `wrapOptionalOnPlay` で `SEQUENCE[OPTIONAL_COST, 本体]` に包む＝**踏み倒しを作らない**。
 *   包めないコスト（`OptionalCostSpec` 非対応・`costUnparsed`）は **収集しない**（従来どおり不発のまま）。
 */
export function collectOppSigniAttackResponses(
  defender: PlayerState,
  attacker: PlayerState,
  effectsMap: Map<string, CardEffect[]>,
  cardMap: Map<string, CardData>,
  turnPhase: string,
): Array<{ cardNum: string; effect: CardEffect }> {
  const sources: string[] = [
    ...(defender.field.lrig.at(-1) ? [defender.field.lrig.at(-1)!] : []),
    ...(defender.field.assist_lrig_l?.at(-1) ? [defender.field.assist_lrig_l.at(-1)!] : []),
    ...(defender.field.assist_lrig_r?.at(-1) ? [defender.field.assist_lrig_r.at(-1)!] : []),
    ...defender.field.signi.flatMap(stack => (stack?.at(-1) ? [stack.at(-1)!] : [])),
  ];
  const out: Array<{ cardNum: string; effect: CardEffect }> = [];
  for (const cardNum of sources) {
    // REMOVE_ABILITIES で能力を失っているシグニは【起】を使えない
    if (defender.abilities_removed?.includes(cardNum)) continue;
    for (const eff of (effectsMap.get(cardNum) ?? [])) {
      if (eff.effectType !== 'ACTIVATED') continue;
      if (!eff.timing?.includes('ON_OPP_SIGNI_ATTACK')) continue;
      if (defender.blocked_actions?.includes(eff.effectId)) continue;
      if (eff.usageLimit === 'once_per_turn' && (defender.actions_done ?? []).includes(eff.effectId)) continue;
      if (eff.usageLimit === 'twice_per_turn'
        && (defender.actions_done ?? []).filter(id => id === eff.effectId).length >= 2) continue;
      if (eff.usageLimit === 'once_per_game' && (defender.game_actions_done ?? []).includes(eff.effectId)) continue;
      if (eff.condition && !evalUseCondition(eff.condition, defender, attacker, cardMap, cardNum, turnPhase)) continue;
      if (!canAffordActivationCost(eff, defender)) continue;
      // 「〈盤面条件〉の場合、この能力の発動コストは《X×N》減る」も同じ包みの中で焼き込む（§6.4 O-35）。
      const wrapped = wrapOptionalOnPlay(eff, {
        my: defender, op: attacker, cardMap, sourceCardNum: cardNum, turnPhase,
      });
      if (!wrapped) continue; // コストを包めない＝踏み倒しになるので出さない
      out.push({ cardNum, effect: wrapped });
    }
  }
  return out;
}
