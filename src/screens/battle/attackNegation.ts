import type { PlayerState } from '../../types';

export type AttackKind = 'signi' | 'lrig';
export type NegateEscapeChoice = 'accept' | 'discard';

/**
 * 指定アタッカーに登録された NEGATE_ATTACK と手札捨て回避枚数を共通取得する。
 * ⚠`negated_attacks` は「アタックできなくなるカードの持ち主の state」に積む規約なので、
 * 渡すのは**アタッカー自身の state**（防御側の state ではない）。
 */
export function getTargetedAttackNegation(
  attackerState: PlayerState,
  attackerCardNum: string | undefined,
): { negated: boolean; escapeDiscard?: number } {
  if (!attackerCardNum || !(attackerState.negated_attacks ?? []).includes(attackerCardNum)) return { negated: false };
  const escapeDiscard = attackerState.negated_attacks_escape?.[attackerCardNum];
  return { negated: true, ...(escapeDiscard ? { escapeDiscard } : {}) };
}

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
  const escMap = { ...(attacker.negated_attacks_escape ?? {}) };
  delete escMap[cardNum];
  const nextAttacker: PlayerState = {
    ...attacker,
    negated_attacks: (attacker.negated_attacks ?? []).filter(n => n !== cardNum),
    negated_attacks_escape: Object.keys(escMap).length ? escMap : undefined,
  };
  if (choice === 'discard') {
    const discarded = attacker.hand.filter((_, i) => selectedHandIndices.has(i));
    return {
      attacker: {
        ...nextAttacker,
        hand: attacker.hand.filter((_, i) => !selectedHandIndices.has(i)),
        trash: [...attacker.trash, ...discarded],
      },
      defender,
      attackNegated: false,
    };
  }
  const isLrigAttack = attacker.field.lrig.at(-1) === cardNum;
  const signiDown = [...(attacker.field.signi_down ?? [false, false, false])] as boolean[];
  if (!isLrigAttack) signiDown[zoneIndex] = true;
  return {
    attacker: {
      ...nextAttacker,
      ...(isLrigAttack ? { lrig_has_attacked: true } : { attacked_signi_ids: [...(attacker.attacked_signi_ids ?? []), cardNum] }),
      field: { ...attacker.field, ...(isLrigAttack ? { lrig_down: true } : { signi_down: signiDown }) },
    },
    defender,
    attackNegated: true,
  };
}

/**
 * 🆕**`ON_ATTACK_LRIG` の解決後にルリグアタックを続けるか／無効化して終わるか**
 * （2026-09-07・意味照合 段2・`WXDi-P09-036-E1`）。
 *
 * 🔴**`negated_attacks`（＝`getTargetedAttackNegation`）では止まらない**＝あちらは**アタック宣言時**に
 *   見る事前登録なので、`ON_ATTACK_LRIG` から無効化しても**もう宣言は済んでいる**。
 *   シグニ側の `cancel_current_signi_attack` と同じ軸で、**アタッカー側**の
 *   `cancel_current_lrig_attack` を見る。
 *
 * ⚠**人間経路（`resolvePendingLrigAttack`）と CPU 経路が同じこの関数を通す**＝
 *   片方だけに足すと「人間だけ無効化される」型の無言のズレになる（§4.2 の3地点セットと同じ規律）。
 * ⚠無効化した場合は**防御側に `lrig_attacked` を立てない**＝ガード応答もダメージも起きない。
 */
export function resolveLrigAttackContinuation(
  attacker: PlayerState,
  defender: PlayerState,
): { cancelled: boolean; attacker: PlayerState; defender: PlayerState } {
  const clearedAttacker: PlayerState = {
    ...attacker,
    pending_lrig_attack: undefined,
    pending_lrig_attack_num: undefined,
    cancel_current_lrig_attack: undefined,
  };
  if (attacker.cancel_current_lrig_attack) {
    return { cancelled: true, attacker: clearedAttacker, defender };
  }
  return {
    cancelled: false,
    attacker: clearedAttacker,
    defender: {
      ...defender,
      field: { ...defender.field, lrig_attacked: true },
      lrig_attacked_by_num: attacker.pending_lrig_attack_num,
    },
  };
}
