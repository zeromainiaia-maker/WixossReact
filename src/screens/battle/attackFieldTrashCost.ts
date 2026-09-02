import type { CardData, PlayerState } from '../../types';
import { fieldTrashSelectableZones, fieldTrashSelectionSatisfied } from './fieldLimit';

export interface AttackFieldTrashPayment {
  state: PlayerState;
  trashedSigniNums: string[];
  movedCards: string[];
}

/** 対象シグニに予約された「他のシグニを場からトラッシュ」アタックコスト。 */
export function attackFieldTrashCost(state: PlayerState, attackerNum: string): number {
  return state.signi_attack_field_trash_costs?.[attackerNum] ?? 0;
}

/** 支払い候補ゾーン。「他の」なのでアタッカー自身のゾーンは常に除外する。 */
export function attackFieldTrashSelectableZones(
  state: PlayerState,
  attackerNum: string,
  cardMap: Map<string, CardData>,
): number[] {
  const count = attackFieldTrashCost(state, attackerNum);
  if (count <= 0) return [];
  const sourceZone = state.field.signi.findIndex(stack => stack?.at(-1) === attackerNum);
  if (sourceZone < 0) return [];
  return fieldTrashSelectableZones({ count, excludeSelf: true }, state, cardMap, sourceZone);
}

export function canPayAttackFieldTrashCost(
  state: PlayerState,
  attackerNum: string,
  cardMap: Map<string, CardData>,
): boolean {
  const count = attackFieldTrashCost(state, attackerNum);
  return count <= 0 || attackFieldTrashSelectableZones(state, attackerNum, cardMap).length >= count;
}

/** CPU用の決定論的支払い。盤面左から必要数を選ぶ。 */
export function deterministicAttackFieldTrashZones(
  state: PlayerState,
  attackerNum: string,
  cardMap: Map<string, CardData>,
): number[] {
  return attackFieldTrashSelectableZones(state, attackerNum, cardMap)
    .slice(0, attackFieldTrashCost(state, attackerNum));
}

/**
 * アタック制限の解除コストを支払う。
 * シグニのスタック全体と付属するチャーム／アクセをトラッシュへ移し、状態フラグも空にする。
 */
export function payAttackFieldTrashCost(
  state: PlayerState,
  attackerNum: string,
  selectedZones: number[],
  cardMap: Map<string, CardData>,
): AttackFieldTrashPayment | null {
  const count = attackFieldTrashCost(state, attackerNum);
  if (count <= 0) return { state, trashedSigniNums: [], movedCards: [] };
  const sourceZone = state.field.signi.findIndex(stack => stack?.at(-1) === attackerNum);
  if (sourceZone < 0) return null;
  if (!fieldTrashSelectionSatisfied(
    { count, excludeSelf: true }, undefined, selectedZones, state, cardMap, sourceZone,
  )) return null;

  return trashSelectedZones(state, selectedZones);
}

/**
 * 選んだゾーンのシグニをスタックごとトラッシュへ移す（シグニ版／ルリグ版で共有）。
 * ⚠**チャーム／アクセも一緒に落とす**＝ゾーンを空にする以上、付随カードが宙に浮くと
 *   「場に無いのに付いている」状態が残る。
 */
function trashSelectedZones(state: PlayerState, selectedZones: number[]): AttackFieldTrashPayment | null {
  const signi = [...state.field.signi] as (string[] | null)[];
  const down = [...(state.field.signi_down ?? [false, false, false])];
  const frozen = [...(state.field.signi_frozen ?? [false, false, false])];
  const charms = [...(state.field.signi_charms ?? [null, null, null])];
  const acce = [...(state.field.signi_acce ?? [null, null, null])];
  const movedCards: string[] = [];
  const trashedSigniNums: string[] = [];

  for (const zone of selectedZones) {
    const stack = signi[zone];
    if (!stack?.length) return null;
    const top = stack.at(-1)!;
    trashedSigniNums.push(top);
    movedCards.push(...stack);
    if (charms[zone]) movedCards.push(charms[zone]!);
    if (acce[zone]) movedCards.push(...acce[zone]!);
    signi[zone] = null;
    down[zone] = false;
    frozen[zone] = false;
    charms[zone] = null;
    acce[zone] = null;
  }

  return {
    state: {
      ...state,
      field: {
        ...state.field,
        signi,
        signi_down: down,
        signi_frozen: frozen,
        signi_charms: charms,
        signi_acce: acce,
      },
      trash: [...state.trash, ...movedCards],
      last_cost_trashed_cards: [...(state.last_cost_trashed_cards ?? []), ...movedCards],
    },
    trashedSigniNums,
    movedCards,
  };
}

/**
 * 🆕**ルリグアタックの「シグニN体を場からトラッシュに置く」解除コスト**（§5.3 `O-222`・`WX24-P3-049-E1`）。
 *
 * 🔴**シグニ版と store が違う**＝シグニ側は `signi_attack_field_trash_costs[attackerNum]`（`BLOCK_ACTION` の
 *   `attackCost.fieldTrash` が積む）だが、ルリグ側は `signi_attack_bans_this_turn` の
 *   `unlessPayFieldTrash`（`SIGNI_ATTACK_BAN`）に載る。⇒ **体数は呼び出し側が渡す**。
 * ⚠**自己除外はしない**＝原文は「あなたのシグニ１体」で「他の」が無く、ルリグにはシグニゾーンも無い
 *   （シグニ版の `excludeSelf` はアタッカー自身のゾーンを外すためのもの）。
 * ⚠**支払いは `payLrigAttackFieldTrashCost` の1本**＝シグニ版と同じ移動処理を共有する
 *   （スタック全体＋チャーム／アクセをトラッシュへ、状態フラグも空にする）。
 */
export function lrigAttackFieldTrashSelectableZones(
  state: PlayerState,
  count: number,
  cardMap: Map<string, CardData>,
): number[] {
  if (count <= 0) return [];
  return fieldTrashSelectableZones({ count, excludeSelf: false }, state, cardMap, undefined);
}

export function canPayLrigAttackFieldTrashCost(
  state: PlayerState,
  count: number,
  cardMap: Map<string, CardData>,
): boolean {
  return count <= 0 || lrigAttackFieldTrashSelectableZones(state, count, cardMap).length >= count;
}

/** CPU用の決定論的支払い。盤面左から必要数を選ぶ（シグニ版と同じ規約）。 */
export function deterministicLrigAttackFieldTrashZones(
  state: PlayerState,
  count: number,
  cardMap: Map<string, CardData>,
): number[] {
  return lrigAttackFieldTrashSelectableZones(state, count, cardMap).slice(0, count);
}

/**
 * ルリグアタックの解除コストを支払う。`payAttackFieldTrashCost` と**同じ移動処理**を通す。
 * ⚠体数が足りない／ゾーンが空なら `null`（呼び出し側はアタックを成立させない＝fail-closed）。
 */
export function payLrigAttackFieldTrashCost(
  state: PlayerState,
  count: number,
  selectedZones: number[],
  cardMap: Map<string, CardData>,
): AttackFieldTrashPayment | null {
  if (count <= 0) return { state, trashedSigniNums: [], movedCards: [] };
  if (selectedZones.length !== count) return null;
  if (!fieldTrashSelectionSatisfied(
    { count, excludeSelf: false }, undefined, selectedZones, state, cardMap, undefined,
  )) return null;
  return trashSelectedZones(state, selectedZones);
}

export function clearAttackFieldTrashCosts(state: PlayerState): PlayerState {
  return { ...state, signi_attack_field_trash_costs: undefined };
}
