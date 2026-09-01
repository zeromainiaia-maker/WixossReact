import type { CardData, PlayerState } from '../../types';
import type { CardEffect, StubAction } from '../../types/effects';
import { checkActiveCondition, collectBanishPreventLoseAbility, collectRiseBanishSubstituteSigni } from '../../engine/effectEngine';
import { acceCardsAt } from '../../utils/acce';

export type MandatoryAttackerBanishSubstitute =
  | { kind: 'prevent_lose_ability'; sourceNum: string }
  | { kind: 'trash_acce'; cardNum: string }
  | { kind: 'trash_rise_under'; cardNum: string };

const baseCardNum = (cardNum: string) => cardNum.includes('#') ? cardNum.slice(0, cardNum.indexOf('#')) : cardNum;

/**
 * O-58 段1: バトルに負けるアタッカー側で必須のバニッシュ置換だけを選ぶ。
 *
 * victim のオーナーはアタッカー＝ターンプレイヤーなので、activeCondition は必ず
 * isOwnerTurn=true で評価する。これにより「対戦相手のターンの間」限定の防御能力を
 * アタッカーへ誤適用しない。
 */
export function selectMandatoryAttackerBanishSubstitute(args: {
  state: PlayerState;
  otherState: PlayerState;
  victimNum: string;
  zoneIndex: number;
  cardMap: Map<string, CardData>;
  effectsMap: Map<string, CardEffect[]>;
}): MandatoryAttackerBanishSubstitute | null {
  const { state, otherState, victimNum, zoneIndex, cardMap, effectsMap } = args;
  const effectsOf = (cardNum: string) => effectsMap.get(cardNum) ?? effectsMap.get(baseCardNum(cardNum)) ?? [];

  // WX13-031 と、WX15-010 が＜武勇＞へ付与した1回防止能力。
  // collectBanishPreventLoseAbility は abilities_removed も見るため、同じターンの2回目は選ばれない。
  const preventSource = collectBanishPreventLoseAbility(
    state, otherState, true, cardMap, effectsMap, victimNum,
  );
  if (preventSource) return { kind: 'prevent_lose_ability', sourceNum: preventSource };

  // WXK04-031（メレドール）: アクセ自身をトラッシュへ置く必須置換。
  const trashAcce = acceCardsAt(state.field, zoneIndex).find(acceNum =>
    effectsOf(acceNum).some(eff => {
      const action = eff.action as StubAction;
      return eff.effectType === 'CONTINUOUS' && action.type === 'STUB' && action.id === 'ACCE_BANISH_SELF_TRASH' &&
        checkActiveCondition(eff.activeCondition, state, otherState, true, cardMap, acceNum);
    }),
  );
  if (trashAcce) return { kind: 'trash_acce', cardNum: trashAcce };

  // WX22-034（アルテミス）だけを許可する。兄弟の RISE_BANISH_SUBSTITUTE は
  // 「対戦相手のターンの間」かつ任意なので、ここへ混ぜない。
  const riseCandidates = collectRiseBanishSubstituteSigni(state, cardMap, effectsMap, otherState, true);
  const stack = state.field.signi[zoneIndex] ?? [];
  const hasArtemisSubstitute = riseCandidates.includes(victimNum) && effectsOf(victimNum).some(eff => {
    const action = eff.action as StubAction;
    return eff.effectType === 'CONTINUOUS' && action.type === 'STUB' && action.id === 'BANISH_SUBSTITUTE_RISE_STACK' &&
      checkActiveCondition(eff.activeCondition, state, otherState, true, cardMap, victimNum);
  });
  if (hasArtemisSubstitute && stack.length >= 2) {
    return { kind: 'trash_rise_under', cardNum: stack[0] };
  }

  return null;
}
