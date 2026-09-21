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
  /**
   * 🆕§5.7 `S-21`＝**根の盤面で探索が扱える候補の数**（`CPU_SIM_APPLICABLE_KINDS` で絞った後）。
   * 🔑**`move === null` の意味を2つに割るための計器**＝
   *   `candidates === 0`＝**探索の外の手しか無かった**（アシストグロウ・レゾナ・ライズ・ピース）＝**判断ではない**／
   *   `candidates > 0`＝**候補はあったが baseline を超えなかった**＝**目的関数の問題**（これが `S-21` の本体）。
   * ⚠**この2つを混ぜて「探索は打たないを選ぶ」と読まない**（2026-09-20 実測＝58 のうち 12 が前者、残り 46 のうち 34 は本番で探索を呼ばない ENERGY フェイズだった）。
   */
  candidates: number;
  /**
   * 🆕§5.7 `S-21`＝**根の候補のうち `applyCpuMoveSim` が実際に盤面を返した数**。
   * 🔑**`candidates > 0` なのに `applied === 0`** は**目的関数の問題ではない**＝
   *   `simulateEffect` が解けなかった（未対応の対話・例外・手数超過）＝**先読みの穴**。
   *   ⚠これを「探索が打たないを選んだ」と読むと、重みをいじっても永久に直らない。
   */
  applied: number;
  /**
   * 🆕§5.7 `S-21`＝**「何もしない」を除いた最善**（1手以上打つ手順の終端の点数）。
   * 候補が1つも適用できなかったときは `baseline` と同じ値（＝比べるものが無い）。
   */
  actionScore: number;
  /**
   * 🆕§5.7 `S-17` 第3段＝**その最善手順が背負った期待損の累計**（パワー換算・既定 0）。
   * 🔴🔑**「撃たない」の誤帰属を防ぐための計器**（2026-09-21 実測）＝
   *   `actionScore < baseline` だけを条件にすると、**期待損とは無関係に点数が下がる手**
   *   （バトルで相手をバニッシュしてエナを与える等）まで「損だから撃たない」と読んでしまう。
   *   実測＝96戦で出た「撃たない」**3件は全部 `risk === 0`**＝**第3段は1件も関与していなかった。**
   *   ⇒ **判断を第3段のせいにしてよいのは `actionRisk > 0` のときだけ。**
   */
  actionRisk: number;
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
  /**
   * 🆕§5.7 `S-21`＝**「行動する」側への下駄**（パワー換算・既定 0＝従来どおり）。
   * 🔑**なぜ要るか**＝`evaluateBoard` は**盤面のスナップショットの差**でしかなく、
   *   手札・エナは枚数で満額数えるのに、**それを使って盤面へ変えた価値は割いて数える**
   *   （生パワー×`fieldPowerScale`）＝**何もしないという選択が構造的に有利**になっている。
   *   実測（2026-09-20）＝探索は 111手中 58手で「打たない」を選んだ。
   * 🔑**値は A/B で決める**（`CPU_POLICIES` の `search-act` / `search-act-mild` ほか）。`Infinity` なら
   *   **「何もしない」を選ばせない**（登録票の案③）。
   */
  actionBias?: number;
  /**
   * 🆕🔴§5.7 `S-14`（2026-09-21）＝**1手ごとの加点**（`S-2` の作戦データ）。
   * 🔴**なぜ要るか（実測）**＝`S-25` で既定を「探索あり」へ上げた瞬間、**召喚を決めるのが
   *   `pickCpuDeployCard`（`planDeployBonus` を足す）から探索（`evaluateBoard` だけ）へ移った**＝
   *   **作戦データの `priorityCards` と `combos` が黙って効かなくなっていた**（6デッキの A/B で
   *   3デッキが**完全に同じ試合**＝加点が1度も判断を変えていない）。
   * 🔑**手を打つ前の盤面で測り、手順に沿って累積する**（`risk` と同じ扱い）＝
   *   「A を出してから B を出す」という**順序**に点が付く（`comboThenReady`）。
   * ⚠**盤面の採点（`evaluateBoard`）には足さない**＝あれは左右対称の「有利さ」で、
   *   作戦データは**自分の手の選び方**の話（相手側に同じ点を与えると意味が壊れる）。
   */
  moveBonus?: (move: CpuMove, board: CpuSimBoard) => number;
}

/**
 * 🆕§5.7 `S-17` 第3段＝`risk`＝**この手順で背負った期待損の累積**（パワー換算）。
 * 🔑**点数（`score`）はすでに `risk` を引いた後の値**＝ビームの並べ替えも「何もしない」との比較も
 *   全部この1つの数で行う（引く場所を2か所に書かない）。
 */
interface Node { board: CpuSimBoard; line: CpuMove[]; score: number; risk: number; bonus: number }

/**
 * この盤面で**いま打つ1手**を探索で決める。
 * ⚠**本番の盤面は触らない**（`applyCpuMoveSim` はコピーの上で進める）。
 * ⚠**決定論**＝`listCpuMoves` の順・`applyCpuMoveSim`（固定 seed）・同点は**先に出た手**を採る。
 */
export function searchCpuMove(ctx: CpuMoveCtx, phase: TurnPhase, opts: CpuSearchOpts): CpuSearchResult {
  const baseline = evaluateBoard(ctx.actor, ctx.opponent, ctx.lookahead);
  const empty: CpuSearchResult = { move: null, line: [], score: baseline, baseline, nodes: 0, candidates: 0, applied: 0, actionScore: baseline, actionRisk: 0 };
  if (opts.width <= 0 || opts.depth <= 0) return empty;
  const nodeCap = opts.nodeCap ?? 400;
  let nodes = 0;
  let beam: Node[] = [{ board: { cpu: ctx.actor, opp: ctx.opponent }, line: [], score: baseline, risk: 0, bonus: 0 }];
  // 🆕§5.7 `S-21`＝**「何もしない」を除いた最善**を別に持つ（`best` は baseline と競合したあとの最善）。
  let bestAction: Node | null = null;
  // 🆕§5.7 `S-21`＝**根の盤面で探索が扱える候補の数**（`move === null` の意味を割る計器）。
  let rootCandidates = 0;
  let rootApplied = 0;
  for (let d = 0; d < opts.depth; d++) {
    const next: Node[] = [];
    for (const node of beam) {
      const nodeCtx: CpuMoveCtx = { ...ctx, actor: node.board.cpu, opponent: node.board.opp };
      for (const move of listCpuMoves(nodeCtx, phase, { pendingSpell: opts.pendingSpell })) {
        if (!CPU_SIM_APPLICABLE_KINDS.has(move.kind)) continue;
        if (d === 0) rootCandidates++;
        if (nodes >= nodeCap) break;
        const after = applyCpuMoveSim(nodeCtx, move);
        nodes++;
        if (!after) continue;
        if (d === 0) rootApplied++;
        // 🆕§5.7 `S-17` 第3段＝**期待損は手順に沿って累積する**（2回ライフを割れば2回ぶん背負う）。
        const risk = node.risk + (after.risk ?? 0);
        // 🆕§5.7 `S-14`＝作戦データの加点は**打つ前の盤面**（`node.board`）で測る（手札・場の条件を見るため）。
        const bonus = node.bonus + (opts.moveBonus?.(move, node.board) ?? 0);
        const score = evaluateBoard(after.cpu, after.opp, ctx.lookahead) - risk + bonus;
        const child: Node = { board: after, line: [...node.line, move], score, risk, bonus };
        next.push(child);
        // ⚠**深いほうが良いとは限らない**＝途中の盤面も含めて最善を採る。
        if (!bestAction || score > bestAction.score) bestAction = child;
      }
      if (nodes >= nodeCap) break;
    }
    if (next.length === 0) break;
    // 同点は**先に出た手**（`listCpuMoves` の順＝いまの優先順）＝決定論。
    next.sort((a, b) => b.score - a.score);
    beam = next.slice(0, opts.width);
  }
  const actionScore = bestAction ? bestAction.score : baseline;
  const stats = { baseline, nodes, candidates: rootCandidates, applied: rootApplied, actionScore, actionRisk: bestAction?.risk ?? 0 };
  // 🆕§5.7 `S-21`＝**行動する側に下駄を足してから**「何もしない」と比べる（既定 0＝従来どおり）。
  if (!bestAction || bestAction.score + (opts.actionBias ?? 0) <= baseline) return { ...empty, ...stats };
  return { move: bestAction.line[0], line: bestAction.line, score: bestAction.score, ...stats };
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
