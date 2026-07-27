import type { PlayerState } from '../../types';

export type AttackKind = 'signi' | 'lrig';
export type NegateEscapeChoice = 'accept' | 'discard';

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

/** escapeDiscard の選択結果を純粋に解決する。 */
export function resolveNegateEscapeChoice(
  attacker: PlayerState,
  defender: PlayerState,
  choice: NegateEscapeChoice,
  cardNum: string,
  zoneIndex: number,
  selectedHandIndices: ReadonlySet<number> = new Set(),
): { attacker: PlayerState; defender: PlayerState; attackNegated: boolean } {
  const escMap = { ...(defender.negated_attacks_escape ?? {}) };
  delete escMap[cardNum];
  const nextDefender: PlayerState = {
    ...defender,
    negated_attacks: (defender.negated_attacks ?? []).filter(n => n !== cardNum),
    negated_attacks_escape: Object.keys(escMap).length ? escMap : undefined,
  };
  if (choice === 'discard') {
    const discarded = attacker.hand.filter((_, i) => selectedHandIndices.has(i));
    return {
      attacker: {
        ...attacker,
        hand: attacker.hand.filter((_, i) => !selectedHandIndices.has(i)),
        trash: [...attacker.trash, ...discarded],
      },
      defender: nextDefender,
      attackNegated: false,
    };
  }
  const signiDown = [...(attacker.field.signi_down ?? [false, false, false])] as boolean[];
  signiDown[zoneIndex] = true;
  return {
    attacker: {
      ...attacker,
      field: { ...attacker.field, signi_down: signiDown },
      attacked_signi_ids: [...(attacker.attacked_signi_ids ?? []), cardNum],
    },
    defender: nextDefender,
    attackNegated: true,
  };
}
