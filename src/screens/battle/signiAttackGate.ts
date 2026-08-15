import type { CardData, PlayerState, TurnPhase } from '../../types';
import type { CardEffect } from '../../types/effects';
import { calcContinuousBlockedActions, calcFieldPowers, type ContinuousBlockResult } from '../../engine/effectEngine';
import { attackFieldTrashCost, canPayAttackFieldTrashCost } from './attackFieldTrashCost';
import { parsePowerVal } from './battleUtils';

/**
 * シグニアタックの可否（ルール由来の軸だけ）を1か所で判定する純関数。
 *
 * ⚠**必ず3箇所（人間のアタックボタン生成 / 共通実行経路 performSigniAttack / CPU のアタック候補フィルタ）
 * から同じ関数を呼ぶこと**。かつて `cannotAttackSigni`（CONTINUOUS 由来・keyword_grants「アタックできない」由来）は
 * 人間のボタン生成でしか読まれておらず、`blocked_actions:'ATTACK:<num>'` だけが3箇所共通という
 * 軸の不一致があった（＝付与された「アタックできない」が CPU に一切効かない）。
 *
 * ⚠**「処理中」「相手のライフバースト待ち」等の一過性UI条件はここに入れない**（呼び出し元の責務）。
 * ここに入れると CPU 側が候補を絞れず無限ループする／実行経路が理由なく早期returnする、の両方に化ける。
 */
export type SigniAttackBlockReason =
  | 'CONTINUOUS_CANNOT_ATTACK' // CONTINUOUS BLOCK_ACTION・ONE_ATTACK_PER_TURN・付与「アタックできない」等
  | 'BLOCKED_ACTION'           // blocked_actions の 'ATTACK:<CardNum>'
  | 'OPP_POWER_CAP'            // OPP_SIGNI_ATTACK_POWER_RESTRICT（相手が課したパワー上限以下はアタック不可）
  | 'ONCE_PER_TURN_LIMIT'      // signi_attack_once_limit（このターンのシグニアタックは合計1回）
  | 'ENERGY_COST'              // OPP_SIGNI_ATTACK_COST のエナが払えない
  | 'FIELD_TRASH_COST'         // 「他のシグニN体をトラッシュしないかぎりアタックできない」が払えない
  | 'ATTACK_BAN'               // signi_attack_bans_this_turn（「〈条件〉のシグニでアタックできない」）
  | 'ATTACK_BAN_COST';         // 同・「《無》×N を支払わないかぎり」の分が払えない

export interface SigniAttackGateInput {
  attacker: PlayerState;
  defender: PlayerState;
  /** アタックするシグニ（フィールド最前面）の CardNum。 */
  attackerNum: string;
  effectsMap: Map<string, CardEffect[]>;
  cardMap: Map<string, CardData>;
  /** 事前計算済みなら渡す（UI のメモ）。無ければアタッカー視点で計算する。 */
  contBlocked?: ContinuousBlockResult;
  /** 事前計算済みなら渡す（UI のメモ）。無ければアタッカー視点で計算する。 */
  effectivePowers?: Map<string, number>;
  turnPhase?: TurnPhase;
  /**
   * 「他のシグニN体トラッシュ」を**支払い済みで再入**した場合に true。
   * ⚠支払い後も `signi_attack_field_trash_costs` の予約は残り、支払いで場が減っているため、
   *   このフラグ無しだと再入時に「もう払えない」と誤判定してアタックが黙って消える
   *   （G154 BURST の無効化回避モーダルからの再実行が該当）。
   */
  fieldTrashCostAlreadyPaid?: boolean;
}

/** アタックできない理由。null ならアタック可能。 */
export function signiAttackBlockReason(p: SigniAttackGateInput): SigniAttackBlockReason | null {
  const { attacker, defender, attackerNum, effectsMap, cardMap } = p;

  if (attacker.blocked_actions?.includes(`ATTACK:${attackerNum}`)) return 'BLOCKED_ACTION';

  // アタックはアタッカーのターンにしか起きないので isOwnerTurn は常に true。
  const contBlocked = p.contBlocked
    ?? calcContinuousBlockedActions(attacker, defender, true, effectsMap, cardMap);
  if (contBlocked.cannotAttackSigni.has(attackerNum)) return 'CONTINUOUS_CANNOT_ATTACK';

  // OPP_SIGNI_ATTACK_POWER_RESTRICT: 相手側が設定したパワー上限「以下」のシグニはアタック不可
  const oppPowerCap = defender.opp_signi_attack_power_cap;
  if (oppPowerCap !== undefined) {
    const powers = p.effectivePowers
      ?? calcFieldPowers(attacker, defender, true, effectsMap, cardMap, p.turnPhase);
    const signiPower = powers.get(attackerNum) ?? parsePowerVal(cardMap.get(attackerNum)?.Power);
    if (signiPower <= oppPowerCap) return 'OPP_POWER_CAP';
  }

  if (attacker.signi_attack_once_limit && (attacker.attacked_signi_ids?.length ?? 0) > 0) {
    return 'ONCE_PER_TURN_LIMIT';
  }

  // OPP_SIGNI_ATTACK_COST: アタック自体にエナコストが必要（performSigniAttack が実際に引き落とす）
  const signiAtkCost = attacker.signi_attack_cost ?? 0;
  if (signiAtkCost > 0 && attacker.energy.length < signiAtkCost) return 'ENERGY_COST';

  if (!p.fieldTrashCostAlreadyPaid
      && attackFieldTrashCost(attacker, attackerNum) > 0
      && !canPayAttackFieldTrashCost(attacker, attackerNum, cardMap)) {
    return 'FIELD_TRASH_COST';
  }

  return null;
}

export function canSigniAttack(p: SigniAttackGateInput): boolean {
  return signiAttackBlockReason(p) === null;
}
