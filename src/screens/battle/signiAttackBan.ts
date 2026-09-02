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
  attacker: PlayerState,
  attackerNum: string,
  cardMap: Map<string, CardData>,
  effectivePower: number | undefined,
): boolean {
  // ゾーン限定（「**中央の**シグニゾーンにあるシグニでアタックできない」＝§6.4 O-33）。
  // 🔑**ゾーン添字は判定地点で引く**＝ban に焼き込むと、掛けたあとにシグニが移動／入れ替わったとき
  //   「いま中央にいるシグニ」ではなく「掛けた時点の1枚」に化ける（原文はゾーンに掛かる制限）。
  // ⚠ゾーンが取れない（＝場のシグニでない＝ルリグ判定経路）ときは掛けない＝過少側に倒す。
  // 「【ゲート】があるシグニゾーンにあるシグニ」＝**動的**ゾーン（§6.4 O-33 据置分・続き508）。
  // 🔑ゾーン集合も判定地点で引く＝ban を張ったあとに【ゲート】が置かれ／消えても追随する
  //   （原文は「【ゲート】がある」という現在形の条件で、掛けた時点の写しではない）。
  const banZones = ban.zoneSource === 'gate' ? (attacker.signi_gate_zones ?? []) : ban.zones;
  if (banZones) {
    const zi = attacker.field.signi.findIndex(stack => stack?.at(-1) === attackerNum);
    if (zi < 0 || !banZones.includes(zi)) return false;
  }
  if (ban.cardNums && !ban.cardNums.includes(attackerNum)) return false;
  // 「選んだシグニ**以外**でアタックできない」＝除外リストに載っていないものだけ止める（§6.4 O-3）。
  if (ban.exceptCardNums && ban.exceptCardNums.includes(attackerNum)) return false;
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
    .filter(ban => ban.appliesTo !== 'LRIG' && banMatches(ban, attacker, attackerNum, cardMap, effectivePower));
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
  /**
   * 🆕**場のシグニを場からトラッシュに置く体数**（§5.3 `O-222`・`WX24-P3-049-E1`）。
   * ⚠**支払いUI があるのはルリグアタック経路だけ**＝シグニ側は
   *   `signi_attack_field_trash_costs`（`BLOCK_ACTION.attackCost.fieldTrash`）という別 store を通る。
   *   シグニ ban にこの軸が載ったら `signiAttackBanCost` は `null`（アタック不可）へ倒す。
   */
  fieldTrash: number;
}

/** 支払いで解除できる軸を1つでも持っているか（持たない ban＝「アタックできない」だけ）。 */
const hasUnlockAxis = (ban: { unlessPayColorless?: number; unlessPayHandDiscard?: number; unlessPayFieldTrash?: number }): boolean =>
  !!ban.unlessPayColorless || !!ban.unlessPayHandDiscard || !!ban.unlessPayFieldTrash;

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
  if (bans.length === 0) return { colorless: 0, handDiscard: 0, fieldTrash: 0 };
  if (bans.some(ban => !hasUnlockAxis(ban))) return null;
  // 🔴**シグニ側に `unlessPayFieldTrash` の支払いUI は無い**（あちらは `signi_attack_field_trash_costs`
  //   という別 store を `handleSigniAttack` が読む）＝**過少側（アタック不可）へ倒す**。
  //   ⚠live 母集団は0（parser はルリグ対象のときだけこの軸を出す）＝**無言で無視しない**ためのガード。
  if (bans.some(ban => ban.unlessPayFieldTrash)) return null;
  return {
    colorless: bans.reduce((sum, ban) => sum + (ban.unlessPayColorless ?? 0), 0),
    handDiscard: bans.reduce((sum, ban) => sum + (ban.unlessPayHandDiscard ?? 0), 0),
    fieldTrash: 0,
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

/**
 * ルリグのアタックに掛かっている ban の解除コスト（§6.4 O-28）。
 * 戻り値の意味はシグニ版と同じ＝`null` なら**どれだけ払ってもアタック不可**。
 *
 * ⚠**同じ `signi_attack_bans_this_turn` を読む**（ban の置き場を増やすと turn-end 失効の登録も
 *   `turnScopedState` へ二重に要る＝続き487/489 で3回再発した「失効地点が無い」クラスを招く）。
 *   軸の分離は `appliesTo:'LRIG'` の1キーだけで行う。
 * ⚠ルリグは `cardNums` で名指しされた ban だけが掛かる（レベル／パワー条件はシグニ専用の語彙）。
 */
export function lrigAttackBanCost(
  attacker: PlayerState,
  lrigNum: string | null | undefined,
  cardMap: Map<string, CardData>,
): SigniAttackBanCost | null {
  if (!lrigNum) return { colorless: 0, handDiscard: 0, fieldTrash: 0 };
  const bans = (attacker.signi_attack_bans_this_turn ?? [])
    .filter(ban => ban.appliesTo === 'LRIG' && banMatches(ban, attacker, lrigNum, cardMap, undefined));
  if (bans.length === 0) return { colorless: 0, handDiscard: 0, fieldTrash: 0 };
  if (bans.some(ban => !hasUnlockAxis(ban))) return null;
  return {
    colorless: bans.reduce((sum, ban) => sum + (ban.unlessPayColorless ?? 0), 0),
    handDiscard: bans.reduce((sum, ban) => sum + (ban.unlessPayHandDiscard ?? 0), 0),
    // 🆕§5.3 `O-222`（2026-09-02）＝「あなたのシグニN体を場からトラッシュに置かないかぎり」。
    fieldTrash: bans.reduce((sum, ban) => sum + (ban.unlessPayFieldTrash ?? 0), 0),
  };
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
