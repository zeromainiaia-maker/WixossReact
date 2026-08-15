import type { CardData, PlayerState, SigniAttackBan } from '../../types';
import { parsePowerVal } from './battleUtils';

/**
 * 「このターン、対戦相手は〈条件〉のシグニでアタックできない」の判定（§6.4 O-3）。
 *
 * ⚠**禁止条件はアタッカー側の state に載る**（`signi_attack_bans_this_turn`）。
 *   課した側に載せると `signiAttackGate` が defender を引き回す羽目になり、
 *   さらに `_this_turn` の turn-end 失効レジストリ（`turnScopedState.ts`）にも乗らない。
 */

/** ban 1件が、いまアタックしようとしているシグニに掛かるか。 */
function banMatches(
  ban: SigniAttackBan,
  attackerNum: string,
  cardMap: Map<string, CardData>,
  effectivePower: number | undefined,
): boolean {
  if (ban.cardNums && !ban.cardNums.includes(attackerNum)) return false;
  if (ban.level !== undefined) {
    const lv = parseInt(cardMap.get(attackerNum)?.Level ?? '', 10);
    if (!Number.isFinite(lv) || lv !== ban.level) return false;
  }
  if (ban.powerDiffersFromPrinted) {
    const printed = parsePowerVal(cardMap.get(attackerNum)?.Power);
    // 実効パワーが取れない走査（引き落とし地点など）では表記パワーへフォールバックする＝一致扱い＝掛からない。
    if ((effectivePower ?? printed) === printed) return false;
  }
  return true;
}

/** いまアタックしようとしているシグニに掛かっている ban をすべて返す。 */
export function matchedSigniAttackBans(
  attacker: PlayerState,
  attackerNum: string,
  cardMap: Map<string, CardData>,
  effectivePower: number | undefined,
): SigniAttackBan[] {
  return (attacker.signi_attack_bans_this_turn ?? [])
    .filter(ban => banMatches(ban, attackerNum, cardMap, effectivePower));
}

/** ban の判定に実効パワーが要るか（要らないなら gate はパワー計算を省ける）。 */
export function signiAttackBansNeedPower(attacker: PlayerState): boolean {
  return (attacker.signi_attack_bans_this_turn ?? []).some(ban => ban.powerDiffersFromPrinted);
}

/** ban 由来のアタック解除コスト。軸ごとに**合算**する（複数 ban が重なれば全部払う）。 */
export interface SigniAttackBanCost {
  /** エナ（《無》×N）。 */
  colorless: number;
  /** 手札を捨てる枚数（「手札をN枚捨てないかぎり」＝**アタックするごとに**払う）。 */
  handDiscard: number;
}

/**
 * 掛かっている ban の解除コスト。
 * 支払いで解除できない ban が1つでも掛かっていれば `null`（＝どれだけ払ってもアタック不可）。
 *
 * ⚠**支払い軸が増えたらここに足す**＝呼び出し元（gate／引き落とし）は戻り値の形だけを見る。
 *   軸ごとに別関数を生やすと「片方の軸だけ見る gate」が生まれて無言ですり抜ける。
 */
export function signiAttackBanCost(
  attacker: PlayerState,
  attackerNum: string,
  cardMap: Map<string, CardData>,
  effectivePower?: number,
): SigniAttackBanCost | null {
  const bans = matchedSigniAttackBans(attacker, attackerNum, cardMap, effectivePower);
  if (bans.length === 0) return { colorless: 0, handDiscard: 0 };
  if (bans.some(ban => !ban.unlessPayColorless && !ban.unlessPayHandDiscard)) return null;
  return {
    colorless: bans.reduce((sum, ban) => sum + (ban.unlessPayColorless ?? 0), 0),
    handDiscard: bans.reduce((sum, ban) => sum + (ban.unlessPayHandDiscard ?? 0), 0),
  };
}

/** ban 由来のエナコスト（《無》×N）だけを取り出す薄いラッパ（引き落とし地点用）。 */
export function signiAttackBanColorlessCost(
  attacker: PlayerState,
  attackerNum: string,
  cardMap: Map<string, CardData>,
  effectivePower?: number,
): number | null {
  const cost = signiAttackBanCost(attacker, attackerNum, cardMap, effectivePower);
  return cost === null ? null : cost.colorless;
}

/** ban 由来の手札捨てコスト（掛かっていない／解除不能なら 0）。 */
export function signiAttackBanHandDiscardCost(
  attacker: PlayerState,
  attackerNum: string,
  cardMap: Map<string, CardData>,
  effectivePower?: number,
): number {
  return signiAttackBanCost(attacker, attackerNum, cardMap, effectivePower)?.handDiscard ?? 0;
}

/** 掛かっている ban の表示ラベル（アタックボタンの注記用）。 */
export function signiAttackBanLabels(
  attacker: PlayerState,
  attackerNum: string,
  cardMap: Map<string, CardData>,
  effectivePower?: number,
): string[] {
  return matchedSigniAttackBans(attacker, attackerNum, cardMap, effectivePower)
    .map(ban => ban.label)
    .filter((label): label is string => !!label);
}
