import type { StackEntry, EffectStack } from '../types';

/**
 * スタックを生成する。
 * 1つ以下の効果しか持たないプレイヤーは自動的に順序確定済みとなる。
 */
export function initStack(turnPlayerId: string, entries: StackEntry[]): EffectStack {
  const pendingTurn = entries.filter(e => e.playerId === turnPlayerId);
  const pendingOpp  = entries.filter(e => e.playerId !== turnPlayerId);
  const orderTurnDone = pendingTurn.length <= 1;
  const orderOppDone  = pendingOpp.length  <= 1;
  const queue = (orderTurnDone && orderOppDone)
    ? buildQueue(pendingTurn, pendingOpp)
    : [];
  return { turnPlayerId, pendingTurn, pendingOpp, orderTurnDone, orderOppDone, queue };
}

/**
 * ターンプレイヤーが自分の効果の順序を確定する。
 * orderedIds: pendingTurn の id を希望する発動順に並べたもの。
 */
export function confirmTurnOrder(stack: EffectStack, orderedIds: string[]): EffectStack {
  const pendingTurn = reorder(stack.pendingTurn, orderedIds);
  const next = { ...stack, pendingTurn, orderTurnDone: true };
  return maybeFinalize(next);
}

/**
 * 相手プレイヤーが自分の効果の順序を確定する。
 */
export function confirmOppOrder(stack: EffectStack, orderedIds: string[]): EffectStack {
  const pendingOpp = reorder(stack.pendingOpp, orderedIds);
  const next = { ...stack, pendingOpp, orderOppDone: true };
  return maybeFinalize(next);
}

/** 両者確定済みならキューを構築（ターンプレイヤーの効果→相手の効果の順） */
function maybeFinalize(stack: EffectStack): EffectStack {
  if (!stack.orderTurnDone || !stack.orderOppDone) return stack;
  return { ...stack, queue: buildQueue(stack.pendingTurn, stack.pendingOpp) };
}

function buildQueue(turn: StackEntry[], opp: StackEntry[]): StackEntry[] {
  return [...turn, ...opp];
}

function reorder(entries: StackEntry[], orderedIds: string[]): StackEntry[] {
  const map = new Map(entries.map(e => [e.id, e]));
  const ordered = orderedIds.map(id => map.get(id)).filter((e): e is StackEntry => !!e);
  // orderedIds に含まれていないものを末尾に追加（安全策）
  const seen = new Set(orderedIds);
  const rest = entries.filter(e => !seen.has(e.id));
  return [...ordered, ...rest];
}

/** キュー先頭を取り出す */
export function shiftQueue(stack: EffectStack): { entry: StackEntry | null; newStack: EffectStack } {
  if (stack.queue.length === 0) return { entry: null, newStack: stack };
  const [entry, ...queue] = stack.queue;
  return { entry, newStack: { ...stack, queue } };
}

/** 整列が完了してキューが準備済みかどうか */
export function isReadyToResolve(stack: EffectStack): boolean {
  return stack.orderTurnDone && stack.orderOppDone;
}

/** スタックが完全に空（解決すべき効果なし）かどうか */
export function isStackDone(stack: EffectStack): boolean {
  return isReadyToResolve(stack) && stack.queue.length === 0;
}

/**
 * 既存スタックに新しいエントリを追加する。
 * 追加後は順序が未確定に戻る（両プレイヤーが再度整列の機会を得る）。
 *
 * 両プレイヤーが既に順序確定済みの場合（解決中に新トリガーが発生した場合）は、
 * 解決済みエントリの二重発動を防ぐためキューに直接追記する。
 */
export function pushToStack(stack: EffectStack, entries: StackEntry[]): EffectStack {
  const addTurn = entries.filter(e => e.playerId === stack.turnPlayerId);
  const addOpp  = entries.filter(e => e.playerId !== stack.turnPlayerId);

  // 両者確定済み（解決中に新トリガー発生）→ キューに直接追加
  if (stack.orderTurnDone && stack.orderOppDone) {
    return {
      ...stack,
      pendingTurn: [...stack.pendingTurn, ...addTurn],
      pendingOpp:  [...stack.pendingOpp,  ...addOpp],
      queue: [...stack.queue, ...entries],
    };
  }

  const pendingTurn = [...stack.pendingTurn, ...addTurn];
  const pendingOpp  = [...stack.pendingOpp,  ...addOpp];
  // 追加があったプレイヤーの確定をリセット
  const orderTurnDone = addTurn.length === 0 ? stack.orderTurnDone : pendingTurn.length <= 1;
  const orderOppDone  = addOpp.length  === 0 ? stack.orderOppDone  : pendingOpp.length  <= 1;
  const next: EffectStack = { ...stack, pendingTurn, pendingOpp, orderTurnDone, orderOppDone, queue: [] };
  return maybeFinalize(next);
}
