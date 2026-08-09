import type { PlayerState } from '../types';
import { removeFromField } from './execUtils';

export interface FacedownSigniTarget {
  cardNum: string;
  zoneIndex: number;
}

export interface TurnEndFacedownResolution {
  state: PlayerState;
  flipped: string[];
  trashed: string[];
  facedown: string[];
}

/** 場のシグニを同じゾーンの裏向きカードへ移す。裏向き中はシグニとして扱わない。 */
export function moveFieldSigniFacedown(
  state: PlayerState,
  cardNum: string,
): { state: PlayerState; target?: FacedownSigniTarget } {
  const zoneIndex = state.field.signi.findIndex(stack => stack?.at(-1) === cardNum);
  if (zoneIndex < 0) return { state };

  const facedown = [...(state.field.facedown_signi ?? [null, null, null])] as (string | null)[];
  // 1ゾーンに保持できる裏向きカードは1枚。既存の裏向きカードを失わないよう空振りにする。
  if (facedown[zoneIndex]) return { state };

  const removed = removeFromField(cardNum, state);
  facedown[zoneIndex] = cardNum;
  return {
    state: { ...removed, field: { ...removed.field, facedown_signi: facedown } },
    target: { cardNum, zoneIndex },
  };
}

/** 「この方法で裏向きにした」対象だけを現在ターン終了時の復帰対象へ登録する。 */
export function scheduleTurnEndFacedownReturns(
  state: PlayerState,
  cardNums: readonly string[],
): PlayerState {
  const pending = [...(state.turn_end_facedown_signi_returns ?? [])];
  for (const cardNum of cardNums) {
    const zoneIndex = (state.field.facedown_signi ?? []).findIndex(n => n === cardNum);
    if (zoneIndex < 0 || pending.some(p => p.cardNum === cardNum && p.zoneIndex === zoneIndex)) continue;
    pending.push({ cardNum, zoneIndex, trashIfOccupied: false });
  }
  return pending.length === (state.turn_end_facedown_signi_returns ?? []).length
    ? state
    : { ...state, turn_end_facedown_signi_returns: pending };
}

/** 直前に登録した対象へ「同じ場所が埋まっていればトラッシュ」の後段を付ける。 */
export function markTurnEndFacedownTrashIfOccupied(
  state: PlayerState,
  cardNums: readonly string[],
): PlayerState {
  const targets = new Set(cardNums);
  let changed = false;
  const pending = (state.turn_end_facedown_signi_returns ?? []).map(p => {
    if (!targets.has(p.cardNum) || p.trashIfOccupied) return p;
    changed = true;
    return { ...p, trashIfOccupied: true };
  });
  return changed ? { ...state, turn_end_facedown_signi_returns: pending } : state;
}

/** ターン終了時、元ゾーンが空なら表向きにし、指定された効果だけは埋まっていればトラッシュへ置く。 */
export function resolveTurnEndFacedownReturns(state: PlayerState): TurnEndFacedownResolution {
  const pending = state.turn_end_facedown_signi_returns ?? [];
  const flipAll = state.turn_end_facedown_all ?? [];
  if (pending.length === 0 && flipAll.length === 0) return { state, flipped: [], trashed: [], facedown: [] };

  const signi = [...state.field.signi] as (string[] | null)[];
  const facedown = [...(state.field.facedown_signi ?? [null, null, null])] as (string | null)[];
  const trash = [...state.trash];
  const flipped: string[] = [];
  const trashed: string[] = [];
  const newlyFacedown: string[] = [];

  for (const target of pending) {
    if (facedown[target.zoneIndex] !== target.cardNum) continue;
    const occupied = !!signi[target.zoneIndex]?.length;
    if (!occupied) {
      signi[target.zoneIndex] = [target.cardNum];
      facedown[target.zoneIndex] = null;
      flipped.push(target.cardNum);
    } else if (target.trashIfOccupied) {
      facedown[target.zoneIndex] = null;
      trash.push(target.cardNum);
      trashed.push(target.cardNum);
    }
  }

  let nextState: PlayerState = {
      ...state,
      trash,
      field: { ...state.field, signi, facedown_signi: facedown },
      turn_end_facedown_signi_returns: undefined,
  };

  // 二重遅延の1段目：このターン終了時点で実在する自シグニをすべて裏向きにする。
  // 複数の同予約があっても、最初の予約が移した後は field.signi が空になるため同じカードを重複登録しない。
  const opponentAttackPending = [...(nextState.pending_opponent_attack_facedown_returns ?? [])];
  for (const request of flipAll) {
    const current = nextState.field.signi.map(stack => stack?.at(-1)).filter((cn): cn is string => !!cn);
    for (const cardNum of current) {
      const moved = moveFieldSigniFacedown(nextState, cardNum);
      nextState = moved.state;
      if (!moved.target) continue;
      newlyFacedown.push(cardNum);
      if (request.returnTiming === 'NEXT_OPP_ATTACK_PHASE_START') {
        opponentAttackPending.push({ ...moved.target, sourceCardNum: request.sourceCardNum });
      }
    }
  }
  nextState = {
    ...nextState,
    turn_end_facedown_all: undefined,
    pending_opponent_attack_facedown_returns: opponentAttackPending.length > 0 ? opponentAttackPending : undefined,
  };

  return {
    state: nextState,
    flipped,
    trashed,
    facedown: newlyFacedown,
  };
}

/** 次の対戦相手アタックフェイズ開始時、元ゾーンが空の予約対象だけを表向きにする。 */
export function resolveOpponentAttackFacedownReturns(state: PlayerState): TurnEndFacedownResolution {
  const pending = state.pending_opponent_attack_facedown_returns ?? [];
  if (pending.length === 0) return { state, flipped: [], trashed: [], facedown: [] };
  const signi = [...state.field.signi] as (string[] | null)[];
  const facedown = [...(state.field.facedown_signi ?? [null, null, null])] as (string | null)[];
  const flipped: string[] = [];
  for (const target of pending) {
    if (facedown[target.zoneIndex] !== target.cardNum || signi[target.zoneIndex]?.length) continue;
    signi[target.zoneIndex] = [target.cardNum];
    facedown[target.zoneIndex] = null;
    flipped.push(target.cardNum);
  }
  return {
    state: {
      ...state,
      field: { ...state.field, signi, facedown_signi: facedown },
      pending_opponent_attack_facedown_returns: undefined,
    },
    flipped,
    trashed: [],
    facedown: [],
  };
}
