import type { PlayerState, TurnPhase } from '../../types';
import { evaluateBoard } from './cpuLookahead';
import {
  applyCpuMoveSim, listCpuMoves, CPU_SIM_APPLICABLE_KINDS, describeCpuMove,
  type CpuMove, type CpuMoveCtx, type CpuSimBoard,
} from './cpuMoves';

/**
 * 🆕§5.7 `S-16`＝**前半ブロックの探索**（`ENERGY`〜`ATTACK_ARTS`）。
 *
 * ■ なぜ要るか＝いまの CPU は**種類ごとに別の通貨で貪欲に選ぶ**（召喚＝`value` 最大／スペル＝利得 `SPELL_GAIN_MIN` 以上／
 *   アーツ＝除去分類だけ／【起】＝ゾーン順）。**エナ・リミット・《ターン1回》は共有資源**なので、
 *   先に来た決定が後の決定の選択肢を潰す＝**貪欲の総和はターンの最善にならない**。
 *   ⇒ **1手適用するたびに候補を出し直すビーム探索**にして、**手順そのもの**を比べる。
 *
 * ■ 形＝`listCpuMoves`（`S-15`・列挙は本番と同じ1本）→ `applyCpuMoveSim`（`S-16` 第2段・engine だけの近似）→
 *   `evaluateBoard`（`S-4`／`S-10` の盤面の採点）。**目的関数は「この先の盤面の点数」**で、
 *   深さは「打つ手が無くなるまで」ではなく `depth` で頭打ちにする（1ターンの手数は実測で中央2・最大18＝`--census-moves`）。
 *
 * ■ 🔴**限界（正直に）**
 *   - **適用できない種類は探索に入らない**（`assistGrow` / `resona` / `rise` / `piece`）＝従来の優先順が扱う。
 *   - **誘発の連鎖・相手の応答は解かない**（`S-4` から引き継ぐ近似）。**相手の返しを見るのは `S-17`**。
 *   - **山の順序は見ない**（`hideDeckOrder`＝ドローの結果は伏せた山から）。
 *
 * ■ ⚠**既定では動かない**＝`CpuPolicy.searchWidth` が 0 なら探索そのものを呼ばない（`cpuTurnAction` 側）。
 *   幅・深さは**数値のポリシー**で、A/B（`S-9`）で決める（手で決めない）。
 */

/** 探索の結果＝**最初の1手**（その手を打ったら盤面が動くので、次はまた探索し直す）。 */
export interface CpuSearchResult {
  /** 打つべき手（`null`＝何もしないほうが良い／候補が無い）。 */
  move: CpuMove | null;
  /** その手から始まる最善の手順（表示・golden 用）。 */
  line: CpuMove[];
  /** 最善手順の終端の点数。 */
  score: number;
  /** 何もしない場合の点数（＝いまの盤面）。 */
  baseline: number;
  /** 展開した局面の数（コストの計器）。 */
  nodes: number;
}

export interface CpuSearchOpts {
  /** ビーム幅（各深さで残す局面の数）。0 なら探索しない。 */
  width: number;
  /** 最大の深さ（1ターンに続けて打つ手の数の上限）。 */
  depth: number;
  /** スペル解決待ちか（`listCpuMoves` へ渡す）。 */
  pendingSpell: boolean;
  /** 展開の上限（安全弁＝盤面あたり）。省略時 400。 */
  nodeCap?: number;
}

interface Node { board: CpuSimBoard; line: CpuMove[]; score: number }

/**
 * この盤面で**いま打つ1手**を探索で決める。
 * ⚠**本番の盤面は触らない**（`applyCpuMoveSim` はコピーの上で進める）。
 * ⚠**決定論**＝`listCpuMoves` の順・`applyCpuMoveSim`（固定 seed）・同点は**先に出た手**を採る。
 */
export function searchCpuMove(ctx: CpuMoveCtx, phase: TurnPhase, opts: CpuSearchOpts): CpuSearchResult {
  const baseline = evaluateBoard(ctx.actor, ctx.opponent, ctx.lookahead);
  const empty: CpuSearchResult = { move: null, line: [], score: baseline, baseline, nodes: 0 };
  if (opts.width <= 0 || opts.depth <= 0) return empty;
  const nodeCap = opts.nodeCap ?? 400;
  let nodes = 0;
  let beam: Node[] = [{ board: { cpu: ctx.actor, opp: ctx.opponent }, line: [], score: baseline }];
  let best: Node = beam[0];
  for (let d = 0; d < opts.depth; d++) {
    const next: Node[] = [];
    for (const node of beam) {
      const nodeCtx: CpuMoveCtx = { ...ctx, actor: node.board.cpu, opponent: node.board.opp };
      for (const move of listCpuMoves(nodeCtx, phase, { pendingSpell: opts.pendingSpell })) {
        if (!CPU_SIM_APPLICABLE_KINDS.has(move.kind)) continue;
        if (nodes >= nodeCap) break;
        const after = applyCpuMoveSim(nodeCtx, move);
        nodes++;
        if (!after) continue;
        const score = evaluateBoard(after.cpu, after.opp, ctx.lookahead);
        const child: Node = { board: after, line: [...node.line, move], score };
        next.push(child);
        // ⚠**深いほうが良いとは限らない**＝途中の盤面も含めて最善を採る（手を打たない選択も `baseline` として入っている）。
        if (score > best.score) best = child;
      }
      if (nodes >= nodeCap) break;
    }
    if (next.length === 0) break;
    // 同点は**先に出た手**（`listCpuMoves` の順＝いまの優先順）＝決定論。
    next.sort((a, b) => b.score - a.score);
    beam = next.slice(0, opts.width);
  }
  if (best.line.length === 0) return { ...empty, nodes };
  return { move: best.line[0], line: best.line, score: best.score, baseline, nodes };
}

/** 探索が選んだ手順の表示（ログ・golden 用）。 */
export function describeCpuLine(line: readonly CpuMove[]): string {
  return line.map(describeCpuMove).join(' → ');
}

/** 探索が扱える手だけに絞った候補（`listCpuMoves` のうち `applyCpuMoveSim` が適用できるもの）。 */
export function listSearchableCpuMoves(ctx: CpuMoveCtx, phase: TurnPhase, pendingSpell: boolean): CpuMove[] {
  return listCpuMoves(ctx, phase, { pendingSpell }).filter(m => CPU_SIM_APPLICABLE_KINDS.has(m.kind));
}

/** 探索の文脈を、ある盤面へ差し替える（`cpuTurnAction` から使う小道具）。 */
export function withBoard(ctx: CpuMoveCtx, cpu: PlayerState, opp: PlayerState): CpuMoveCtx {
  return { ...ctx, actor: cpu, opponent: opp };
}
