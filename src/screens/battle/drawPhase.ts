import type { CardData, PlayerState } from '../../types';
import type { CardEffect } from '../../types/effects';
import { applyLrigDrawPhaseReplacement, collectDrawLimits, drawPhaseLimitFromBlocked } from '../../engine/effectEngine';

/**
 * 🆕2026-10-21＝**ドローフェイズに引く枚数**（人間の `phaseAdvance` と CPU の `cpuTurn` が同じ1本を呼ぶ）。
 *
 * 🔴旧＝CPU 側は【常】の `DRAW_LIMIT_<n>`（`drawPhaseLimitFromBlocked`）しか見ておらず、
 *   **ドロー禁止（`blocked_actions` の `DRAW`）・ドロー上限（`draw_limit`＝「対戦相手の次のドローは〜枚まで」・相手の【常】
 *   `LIMIT_OPP_DRAW_COUNT`）・ドローの置換（「次のドローフェイズに N 枚引く場合、代わりに M 枚」）を全部素通り**していた
 *   （コードのコメントに「別の穴（§7 送り）」と書かれたまま残っていた）。
 */
export function drawPhaseDraw(p: {
  my: PlayerState; op: PlayerState;
  effectsMap: Map<string, CardEffect[]>; cardMap: Map<string, CardData>;
  /** その席の【常】由来の封じ（`calcContinuousBlockedActions(...).forSelf`）。 */
  blockedSelf: Set<string>;
  /** ルール上の枚数（先攻1ターン目は1・それ以外は2）。 */
  baseCount: number;
}): { blocked: boolean; count: number } {
  const blocked = p.my.blocked_actions?.includes('DRAW') ?? false;
  // draw_limit: ターン内フラグ or 相手CONT LIMIT_OPP_DRAW_COUNT 効果の小さい方
  const contDrawLimit = collectDrawLimits(p.op, p.effectsMap, p.cardMap, true, p.my);
  // CONTINUOUS `BLOCK_ACTION{DRAW_LIMIT_<n>}`（`WX04-005-E2`）も上限として合流させる。
  const blockDrawLimit = drawPhaseLimitFromBlocked(p.blockedSelf);
  const limit = [p.my.draw_limit, contDrawLimit, blockDrawLimit]
    .filter((n): n is number => n !== undefined)
    .reduce<number | undefined>((min, n) => (min === undefined ? n : Math.min(min, n)), undefined);
  const replaced = applyLrigDrawPhaseReplacement(p.my, p.baseCount);
  return { blocked, count: limit !== undefined ? Math.min(replaced, limit) : replaced };
}
