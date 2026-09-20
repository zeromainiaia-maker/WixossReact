/**
 * 🆕**重み候補の「分岐スクリーニング」**（§5.7 `S-6` 第1段・2026-09-21）＝**純関数だけ**（対戦もファイル I/O もしない）。
 *
 * ■ なぜ要るか（`S-25` の実測が突きつけたこと）
 *   `S-25` は重みを1本ずつ動かして A/B に掛けたが、**4本とも「差があるとは言えない」**で終わった。
 *   そのうち `hand=800` は **0-8-0＝1組も動かなかった**＝**2つのポリシーが最初から最後まで同じ手を打った**。
 *   🔴**つまり 8分（96戦）を払って得た情報は「この数値は判断を1度も変えなかった」だけ**だった。
 *   ⇒ **それは1戦（35秒）で分かる。**
 *
 * ■ 測るもの＝**分岐（divergence）**＝候補のポリシーを両席に置いて同じシード・同じ山で1戦回し、
 *   **CPU が打った手の並び**（`describeCpuMove`）を基準（champion 同士）の並びと突き合わせて
 *   **最初に食い違った位置**を取る。並びが完全に同じ＝**その候補はこの対戦で1つも判断を変えていない**。
 *
 * ■ 🔴**分岐は「勝率が動く」ための必要条件であって十分条件ではない**
 *   - **分岐0 ⇒ A/B は必ず全組1勝1敗**（同じ試合が2回走るだけ）＝**掛けるだけ無駄**。ここだけが確実に言える。
 *   - **分岐あり ⇒ 勝率が動くとは限らない**（違う手を打っても勝敗が変わらない盤面は多い）。
 *   ⇒ **この計器は「A/B に掛ける候補を絞る篩」であって、強さの判定ではない。** 判定は `selfplay:ab`（`S-9`）。
 *
 * ■ ⚠**山ごとに測る**（`S-23`／`S-25` の教訓＝1つの山で一般化しない）＝
 *   ある山では1度も分岐しない数値が、別の山では毎ターン分岐する（`POWER_MODIFY` が既定の山に0枚だったのと同じ形）。
 *
 * ■ ⚠**基準側の軌道しか見ていない**のではない＝**候補を両席に置いて丸ごと1戦回す**ので、
 *   探索（`searchCpuMove`）だけでなく**貪欲な経路（召喚・エナチャージ・スペル・アーツ・【起】・手札上限）も全部通る**。
 *   🔑これが「探索の出力だけを突き合わせる」（`--census-moves --search-policy`）との違い＝
 *   あちらは **MAIN と ATTACK_SIGNI しか映らない**（本番が探索を呼ぶのはその2つだけ＝`cpuTurn.ts`）。
 */

/** 走査する1つのつまみ（`patchCpuPolicy` のキー）と、試す値。 */
export interface ScanKnob {
  /** `patchCpuPolicy` が受けるキー（`boardWeights` のキーが先）。 */
  key: string;
  /** いまの既定値（表に出すだけ＝候補の生成には使わない）。 */
  base: number;
  /** 試す値。⚠**手で「良さそうな値」を選ばない**＝既定の半分／倍、既定 0 なら過去のプリセットの実績値。 */
  values: number[];
  /**
   * 🔴**その数値が効くために一緒に立てないといけないつまみ**（例＝`lifeBurstCost` は
   * `searchAttacks` が立っていないと**アタック探索そのものが走らない**ので、単体で振ると必ず分岐0 になる）。
   * ⚠**これを書き忘れると「効かない数値」という嘘の結論が出る。**
   */
  with?: string;
}

/**
 * 🔴**走査する49個＝`patchCpuPolicy` が受け取れる全部**（`boardWeights` 12 ＋ `CpuPolicy` 8 ＋ `strength.` 14 ＋ `keyword.` 8 ＋ `plan.` 6 ＋ `guardKeepValue` 1）。
 *
 * 🆕**2026-09-21（第2段）＝残り29個も `CpuPolicy` へ載せた**（第1段の実測＝振れるのは49個中20個だけだった）＝`strength.`（14）／`keyword.`（8）／`plan.`（6）／`guardKeepValue`（1）。
 * ⚠**接頭辞が要るのは名前が衝突するから**＝`energy`／`search` は `BoardWeights` にも同名のキーがある。
 * 🔴**走査表に入れ忘れた数値は調整対象から静かに消える**＝golden `§5.7 S-6` が全キーの網羅を検査する。
 */
export const SCAN_KNOBS: readonly ScanKnob[] = [
  // ── 盤面の採点（`BoardWeights`）＝既定の半分／倍 ──
  { key: 'life', base: 7000, values: [3500, 14000] },
  { key: 'hand', base: 1500, values: [750, 3000] },
  { key: 'energy', base: 1000, values: [500, 2000] },
  { key: 'openLane', base: 3000, values: [1500, 6000] },
  { key: 'oppFrozen', base: 2500, values: [1250, 5000] },
  { key: 'fieldPowerScale', base: 0.25, values: [0.125, 0.5] },
  { key: 'laneWin', base: 1500, values: [750, 3000] },
  { key: 'growReady', base: 2500, values: [1250, 5000] },
  { key: 'handEmpty', base: -2000, values: [-1000, -4000] },
  { key: 'guardKept', base: 800, values: [400, 1600] },
  { key: 'lrigLevel', base: 2500, values: [1250, 5000] },
  // 既定 0 のつまみ＝「入れるとどうなるか」。値は**過去のプリセットの実績値**（`search-damage` ほか）。
  { key: 'turnDamage', base: 0, values: [3000] },
  // ── ポリシー（`CpuPolicy`）──
  { key: 'spellGainMin', base: 1000, values: [0, 3000] },
  { key: 'keepGuards', base: 1, values: [0, 2] },
  { key: 'searchWidth', base: 4, values: [2, 8] },
  { key: 'searchDepth', base: 4, values: [2, 6] },
  { key: 'actionBias', base: 0, values: [1500] },
  { key: 'searchAttacks', base: 0, values: [1] },
  // 🔴**`searchAttacks` を一緒に立てる**＝立てないとアタック探索が走らず、期待損を計算する場所が無い（`S-17` 第3段）。
  { key: 'lifeBurstCost', base: 0, values: [2500], with: 'searchAttacks=1' },
  { key: 'guardDeckCount', base: 0, values: [8], with: 'searchAttacks=1' },
  // ── 🆕§5.7 `S-6` 第2段＝**カードの強さ表**（`strength.`）＝既定の半分／倍 ──
  // ⚠`energy`／`search` は `BoardWeights` と同名なので**接頭辞が要る**（無いと盤面の重みのほうが当たる）。
  { key: 'strength.removal', base: 6000, values: [3000, 12000] },
  { key: 'strength.powerDown', base: 0.5, values: [0.25, 1] },
  { key: 'strength.powerUp', base: 0.25, values: [0.125, 0.5] },
  { key: 'strength.draw', base: 2500, values: [1250, 5000] },
  { key: 'strength.energy', base: 1500, values: [750, 3000] },
  { key: 'strength.search', base: 2500, values: [1250, 5000] },
  { key: 'strength.summon', base: 3500, values: [1750, 7000] },
  { key: 'strength.disrupt', base: 2500, values: [1250, 5000] },
  { key: 'strength.handDisrupt', base: 2500, values: [1250, 5000] },
  { key: 'strength.protection', base: 2000, values: [1000, 4000] },
  { key: 'strength.lifeCrash', base: 5000, values: [2500, 10000] },
  { key: 'strength.coin', base: 1000, values: [500, 2000] },
  { key: 'strength.keyword', base: 1, values: [0.5, 2] },
  { key: 'strength.misc', base: 500, values: [250, 1000] },
  // ── 🆕キーワード1つの点数（`keyword.`）──
  { key: 'keyword.ランサー', base: 3000, values: [1500, 6000] },
  { key: 'keyword.Sランサー', base: 4000, values: [2000, 8000] },
  { key: 'keyword.ダブルクラッシュ', base: 4000, values: [2000, 8000] },
  { key: 'keyword.トリプルクラッシュ', base: 6000, values: [3000, 12000] },
  { key: 'keyword.アサシン', base: 3500, values: [1750, 7000] },
  { key: 'keyword.シャドウ', base: 2500, values: [1250, 5000] },
  { key: 'keyword.バニッシュされない', base: 3000, values: [1500, 6000] },
  { key: 'keyword.シュート', base: 2000, values: [1000, 4000] },
  // ── 🆕作戦データの足し引き（`plan.`）⚠**作戦データを持つ山でしか効かない**（`cpu_plan` つきは実測5デッキ）──
  { key: 'plan.keyKeep', base: 20000, values: [10000, 40000] },
  { key: 'plan.comboKeep', base: 4000, values: [2000, 8000] },
  { key: 'plan.priorityDeploy', base: 4000, values: [2000, 8000] },
  { key: 'plan.comboFirst', base: 5000, values: [2500, 10000] },
  { key: 'plan.comboThenReady', base: 8000, values: [4000, 16000] },
  { key: 'plan.comboThenHold', base: -8000, values: [-4000, -16000] },
  // ── 🆕手札の【ガード】を手元に置く価値（効果で手札を捨てるときの並び）──
  { key: 'guardKeepValue', base: 8000, values: [4000, 16000] },
];

/**
 * つまみの表から候補の spec 列（`patchCpuPolicy` に渡す文字列）を作る。
 * ⚠**`with` は前に置く**＝`patchCpuPolicy` は後勝ちなので、後ろに置くと本命の値を踏み潰す事故が起きうる。
 */
export function buildScanSpecs(knobs: readonly ScanKnob[] = SCAN_KNOBS): string[] {
  const out: string[] = [];
  for (const k of knobs) {
    for (const v of k.values) out.push(`${k.with ? `${k.with},` : ''}${k.key}=${v}`);
  }
  return out;
}

/** 1戦の結果（打った手の並び）。 */
export interface DivergeRun {
  /** 候補の spec。**`''`＝基準**（champion を両席に置いた対戦）。 */
  cand: string;
  deck: string;
  seed: number;
  /** その対戦で CPU が打った手の並び（`describeCpuMove`）。 */
  moves: readonly string[];
  /** `finished`／`idle`／`cap`。 */
  reason: string;
}

/** 候補1つぶんの集計。 */
export interface DivergeRow {
  cand: string;
  /** 基準と突き合わせられた対戦の数。 */
  runs: number;
  /** そのうち1手でも違った数。 */
  diverged: number;
  /** 最初に分岐した手の位置（0 始まり・分岐した対戦だけ・昇順）。 */
  firstDiff: number[];
  /** 対応する基準の総手数（昇順）。 */
  baseMoves: number[];
  /** 基準が見つからず比べられなかった対戦（＝基準の対戦が止まった等）。 */
  unpaired: number;
  /** 止まった対戦（`reason !== 'finished'`）＝候補側・基準側のどちらか。 */
  stalled: number;
}

const keyOf = (r: { deck: string; seed: number }) => `${r.deck}\u0000${r.seed}`;

/**
 * 最初に食い違った位置。**完全に同じなら `null`**。
 * ⚠**長さだけが違う場合**（片方が途中で終わった）＝短いほうの末尾の位置を返す（そこから先が違う）。
 */
export function firstDivergence(a: readonly string[], b: readonly string[]): number | null {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) if (a[i] !== b[i]) return i;
  return a.length === b.length ? null : n;
}

/**
 * 候補ごとにまとめる。⚠**基準（`cand === ''`）は行に出さない**（自分自身との比較は常に分岐0）。
 * 並びは**分岐した対戦の多い順**＝そのまま「A/B に掛ける順」。
 */
export function summarizeDiverge(runs: readonly DivergeRun[]): DivergeRow[] {
  const base = new Map<string, DivergeRun>();
  for (const r of runs) if (r.cand === '') base.set(keyOf(r), r);
  const rows = new Map<string, DivergeRow>();
  for (const r of runs) {
    if (r.cand === '') continue;
    const row = rows.get(r.cand)
      ?? (rows.set(r.cand, { cand: r.cand, runs: 0, diverged: 0, firstDiff: [], baseMoves: [], unpaired: 0, stalled: 0 }),
        rows.get(r.cand)!);
    const b = base.get(keyOf(r));
    if (r.reason !== 'finished' || (b && b.reason !== 'finished')) row.stalled++;
    if (!b) { row.unpaired++; continue; }
    row.runs++;
    row.baseMoves.push(b.moves.length);
    const at = firstDivergence(b.moves, r.moves);
    if (at !== null) { row.diverged++; row.firstDiff.push(at); }
  }
  for (const row of rows.values()) { row.firstDiff.sort((x, y) => x - y); row.baseMoves.sort((x, y) => x - y); }
  return [...rows.values()].sort((a, b) => (b.diverged - a.diverged) || a.cand.localeCompare(b.cand));
}

const median = (xs: readonly number[]): number | null =>
  xs.length === 0 ? null : xs[Math.floor((xs.length - 1) / 2)];

/** 分岐の表（人が読む出力）。 */
export function formatDivergeReport(rows: readonly DivergeRow[], opts: { champion: string; decks: number; seeds: number }): string {
  const L: string[] = [];
  const perCand = opts.decks * opts.seeds;
  L.push('');
  L.push(`===== 分岐スクリーニング（§5.7 S-6 第1段）  基準=${opts.champion} =====`);
  L.push(`候補 ${rows.length}件｜1候補あたり ${perCand} 対戦（山 ${opts.decks}種 × ${opts.seeds} シード）`);
  L.push(`${'候補'.padEnd(34)} 分岐した対戦   最初の分岐(中央)  基準の手数(中央)`);
  for (const r of rows) {
    const fd = median(r.firstDiff);
    const bm = median(r.baseMoves);
    L.push(`${r.cand.padEnd(34)} ${String(`${r.diverged}/${r.runs}`).padStart(9)}`
      + `${String(fd === null ? '—' : fd).padStart(15)}`
      + `${String(bm === null ? '—' : bm).padStart(18)}`
      + (r.stalled > 0 ? `  ⚠止まった ${r.stalled}` : '')
      + (r.unpaired > 0 ? `  ⚠基準なし ${r.unpaired}` : ''));
  }
  const dead = rows.filter(r => r.runs > 0 && r.diverged === 0);
  L.push('');
  L.push(dead.length === 0
    ? '🔎**分岐0 の候補は無い**＝どの数値も少なくとも1つの山で判断を変えている。'
    : `🔴**分岐0 の候補 ${dead.length}件＝A/B に掛けるだけ無駄**（同じ試合が2回走るだけ＝必ず全組1勝1敗になる）＝`
      + `${dead.map(r => r.cand).join('／')}`);
  L.push('⚠**分岐したからといって勝率が動くとは限らない**＝分岐は必要条件であって十分条件ではない。'
    + '**強さの判定は `npm run selfplay:ab`（`S-9`）だけ。**');
  L.push(`⚠**分岐0 は「この ${perCand} 対戦で判断を変えなかった」であって「無効な数値」ではない**`
    + '＝山とシードを増やせば出うる（`S-23`／`S-25` の教訓＝1つの山で一般化しない）。'
    + '**言えるのは「この母集団では A/B に掛ける価値が無い」までで、そこで止める。**');
  return L.join('\n');
}

/**
 * 1候補あたりのコスト比（この計器 vs 本番の A/B）。**表に出すためだけの計算**。
 * 🔑`S-25` の実績＝1候補の A/B は **6デッキ × 8シード × 2戦＝96戦**。分岐スクリーニングは **6デッキ × Nシード × 1戦**。
 */
export function screenSpeedup(decks: number, seeds: number, abGamesPerCand = 96): number {
  return abGamesPerCand / Math.max(1, decks * seeds);
}
