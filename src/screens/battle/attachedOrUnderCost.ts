/**
 * attachedOrUnderCost.ts — 「シグニに**付いている**カード／**下にある**カード」を払う【起】コスト
 * （2026-09-12・§5.3 `O-313`・`WXK10-018-E2`）。
 *
 * 🔴**なぜ `underAnySigniCost.ts` に足さないのか**＝あちらは「下にあるカード」だけを見る。
 *   原文は**付いているカード**（チャーム／アクセ／【トラップ】／マジックボックス／シード／裏向き付け）も
 *   同じ1枚として選べるので、候補集合が別物になる。
 * 🔑候補の定義は engine の `signiZoneNonSigniCards` 1本を共有する（写経しない）。
 *   ⚠【ソウル】は行き先がルリグトラッシュなのであちらが**最初から除外**している。
 * ⚠**提示ゲート（`signiActivateGate`）・支払いUI（`SigniActivatedModal`）・引き落とし（`BattleScreen`）の
 *   3点が同じ関数を通ること**＝どれか1つを写経すると片側だけ穴が空く（§5-8′）。
 */
import type { PlayerState } from '../../types';
import { signiZoneNonSigniCards, pluckSigniZoneNonSigniCard } from '../../engine/execUtils';

/** 自分の場の全シグニゾーンから「シグニではないカード」を左のゾーン順に列挙する。 */
export function attachedOrUnderCostCandidates(state: PlayerState): string[] {
  return [0, 1, 2].flatMap(zone => signiZoneNonSigniCards(state, zone));
}

export function canPayAttachedOrUnderTrash(state: PlayerState, count: number): boolean {
  return attachedOrUnderCostCandidates(state).length >= count;
}

/**
 * UI で選んだカードをトラッシュへ置く。
 * ⚠**選んだ枚数が `count` と一致しないときは `null`**（fail-closed）＝
 *   0枚で成立させると「コスト無しで撃てる」踏み倒しになる。
 */
export function payAttachedOrUnderTrash(
  state: PlayerState,
  selected: ReadonlySet<string>,
  count: number,
): { state: PlayerState; moved: string[] } | null {
  const candidates = attachedOrUnderCostCandidates(state);
  const picked = candidates.filter(cn => selected.has(cn));
  if (picked.length !== count) return null;
  let cur = state;
  const moved: string[] = [];
  for (const cn of picked) {
    const res = pluckSigniZoneNonSigniCard(cur, cn);
    if (!res.ok) return null;
    cur = res.state;
    moved.push(cn);
  }
  return { state: { ...cur, trash: [...cur.trash, ...moved] }, moved };
}
