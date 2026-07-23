import type { PlayerState } from '../../types';

export type AttackKind = 'signi' | 'lrig';

/**
 * NEGATE_NTH_ATTACK の共有カウンタを消費する。
 * 対象外の攻撃種別ではカウンタを減らさず、対象なら残り1回を消費する。
 */
export function consumeNthAttackNegation(
  defender: PlayerState,
  kind: AttackKind,
): { negated: boolean; defender: PlayerState; remaining: number } {
  const window = defender.negate_opp_attacks;
  if (!window || window.remaining <= 0 || !window[kind]) {
    return { negated: false, defender, remaining: window?.remaining ?? 0 };
  }
  const remaining = window.remaining - 1;
  return {
    negated: true,
    defender: {
      ...defender,
      negate_opp_attacks: remaining > 0 ? { ...window, remaining } : undefined,
    },
    remaining,
  };
}
