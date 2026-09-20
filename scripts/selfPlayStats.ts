/**
 * 🆕**自己対戦 A/B の集計**（§5.7 `S-9`・2026-09-19）＝**純関数だけ**（対戦もファイル I/O もしない）。
 *
 * 🔑**なぜ別ファイルか**＝`scripts/goldenTest.ts` から import して**数字の出し方そのものを固定する**ため。
 *   ⚠`npm run typecheck` は `scripts/` を見ない（`tsconfig.app.json` の `include:["src"]`＝`O-147`）ので、
 *   **ここが壊れても typecheck は緑**。golden が唯一の安全網。
 *
 * ■ 測り方（`S-9` の3点）
 *   ① **席ごとのポリシー**＝A と B を別の席に置く（`HeadlessMatchDeps.policy`）。
 *   ② 🔴**席を入れ替えて同じシードをもう1戦**＝先攻有利を相殺する。**1シード＝2戦で1組**。
 *      ⚠片側だけで測ると**先攻有利をポリシーの差と読み違える**（実測＝既定同士でも guest 側が連勝する）。
 *   ③ **勝率＋二項の誤差幅**（Wilson）＝「勝ったから強い」と言わないための下限。
 */

/** 1戦の結果（A から見た勝敗）。 */
export interface AbGameResult {
  seed: number;
  /** true＝この戦は **A が guest 席**。false＝A が host 席。⚠**先攻かどうかは席では決まらない**（`--first`＝`summarizeAb` の `firstSeat`）。 */
  swapped: boolean;
  /** 決着しなかった（`idle`／`cap`）なら null。 */
  winner: 'A' | 'B' | null;
  reason: string;
  steps: number;
  turns: number;
  ms: number;
}

export interface AbSummary {
  games: number;
  decided: number;
  stalled: number;
  aWins: number;
  bWins: number;
  /** A の勝率（決着した対戦のうち）。決着0なら null。 */
  rate: number | null;
  /** Wilson 95% 信頼区間。 */
  lo: number;
  hi: number;
  /** 区間が 0.5 を跨がない＝**差があると言ってよい**。 */
  significant: boolean;
  /** 先攻の勝率＝**手番の偏りそのものの実測**（ポリシーとは無関係に出る）。 */
  firstPlayerRate: number | null;
  /** どちらの席が先攻だったか（`--first`）。⚠**表のラベルはこれで決まる**。 */
  firstSeat: 'host' | 'guest';
  /** A が host 席で勝った数 / その席で決着した数。 */
  aAsHost: { wins: number; decided: number };
  /** A が guest 席で勝った数 / その席で決着した数。 */
  aAsGuest: { wins: number; decided: number };
  /** 席を入れ替えた2戦が揃っている組の内訳（A2勝 / 1勝1敗 / A0勝）。 */
  pairs: { aSweep: number; split: number; bSweep: number; incomplete: number };
  /**
   * 🆕🔴§5.7 `S-21`（2026-09-20）＝**組（席入れ替えの2戦）で決着した数**＝`aSweep + bSweep`。
   *
   * 🔴**なぜこちらが主の判定か**＝`rate` の Wilson 区間は**160戦を独立と数えている**が、
   *   席入れ替えの2戦は**同じシードの対**で相関する。**1勝1敗の組は両者に1勝ずつを配るだけで、
   *   ポリシーの差について何も語らない**＝分母に入れると**区間が実際より狭く出る**。
   *   実測（2026-09-20・`--a default --b damage-only`）＝戦単位では 160戦 48.8% [41.1, 56.4] と出たが、
   *   **80組のうち 78組が1勝1敗**＝実質の標本は **2組**しか無かった。
   * 🔑**組で見ると感度が上がる**＝席の偏り（先攻 34〜37%＝`S-19`）が組の中で相殺されるから。
   * ⚠**`split` が多い回は「差が無い」ではなく「2つのポリシーがほぼ同じ打ち方をした」**。
   */
  pairDecided: number;
  /** A が2連勝した組の割合（決着した組のうち）。決着した組が0なら null。 */
  pairRate: number | null;
  /** 組で見た Wilson 95% 信頼区間。 */
  pairLo: number;
  pairHi: number;
  /** 🔑**主の判定**＝組で見た区間が 50% を跨がない。 */
  pairSignificant: boolean;
  totalMs: number;
}

/**
 * 二項比率の **Wilson 信頼区間**（既定 95%＝z=1.96）。
 * 🔑**素朴な `p ± z√(p(1-p)/n)` を使わない**＝n が小さいときや p が 0/1 に寄ったときに
 *   区間が [0,1] をはみ出し、**「勝率100%・誤差±0」**という嘘の自信が出る。
 */
export function wilsonInterval(wins: number, n: number, z = 1.96): { lo: number; hi: number } {
  if (n <= 0) return { lo: 0, hi: 1 };
  const p = wins / n;
  const d = 1 + (z * z) / n;
  const centre = p + (z * z) / (2 * n);
  const half = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));
  return { lo: Math.max(0, (centre - half) / d), hi: Math.min(1, (centre + half) / d) };
}

/**
 * 結果の列を1つの表にまとめる。
 * 🔴**`firstSeat` を省略しない**（既定 host）＝先攻の席を取り違えると**先攻の勝率が反転して出る**
 * （2026-09-19 実測＝`--first guest` を足した直後にこれで 62.5% と 37.5% を取り違えかけた）。
 */
export function summarizeAb(results: readonly AbGameResult[], firstSeat: 'host' | 'guest' = 'host'): AbSummary {
  const decidedGames = results.filter(r => r.winner !== null);
  const aWins = decidedGames.filter(r => r.winner === 'A').length;
  const bWins = decidedGames.length - aWins;
  const { lo, hi } = wilsonInterval(aWins, decidedGames.length);
  // A は swapped=false のとき host 席。**先攻の席に座っていたほうの勝ち**を数える。
  const aIsFirst = (r: AbGameResult) => (r.swapped ? firstSeat === 'guest' : firstSeat === 'host');
  const firstWins = decidedGames.filter(r => (aIsFirst(r) ? r.winner === 'A' : r.winner === 'B')).length;
  const asHost = decidedGames.filter(r => !r.swapped);
  const asGuest = decidedGames.filter(r => r.swapped);
  // 組（同じシードの2戦）。
  const bySeed = new Map<number, AbGameResult[]>();
  for (const r of results) bySeed.set(r.seed, [...(bySeed.get(r.seed) ?? []), r]);
  const pairs = { aSweep: 0, split: 0, bSweep: 0, incomplete: 0 };
  for (const rs of bySeed.values()) {
    const dec = rs.filter(r => r.winner !== null);
    if (rs.length !== 2 || dec.length !== 2) { pairs.incomplete++; continue; }
    const a = dec.filter(r => r.winner === 'A').length;
    if (a === 2) pairs.aSweep++; else if (a === 1) pairs.split++; else pairs.bSweep++;
  }
  // 🆕§5.7 `S-21`＝**組で見た勝率**（主の判定）＝1勝1敗の組は**分母に入れない**。
  const pairDecided = pairs.aSweep + pairs.bSweep;
  const pairCi = wilsonInterval(pairs.aSweep, pairDecided);
  return {
    games: results.length,
    decided: decidedGames.length,
    stalled: results.length - decidedGames.length,
    aWins, bWins,
    rate: decidedGames.length > 0 ? aWins / decidedGames.length : null,
    lo, hi,
    firstSeat,
    significant: decidedGames.length > 0 && (lo > 0.5 || hi < 0.5),
    firstPlayerRate: decidedGames.length > 0 ? firstWins / decidedGames.length : null,
    aAsHost: { wins: asHost.filter(r => r.winner === 'A').length, decided: asHost.length },
    aAsGuest: { wins: asGuest.filter(r => r.winner === 'A').length, decided: asGuest.length },
    pairs,
    pairDecided,
    pairRate: pairDecided > 0 ? pairs.aSweep / pairDecided : null,
    pairLo: pairCi.lo,
    pairHi: pairCi.hi,
    pairSignificant: pairDecided > 0 && (pairCi.lo > 0.5 || pairCi.hi < 0.5),
    totalMs: results.reduce((a, r) => a + r.ms, 0),
  };
}

/**
 * シードを `jobs` 本のワーカーへ**均等に配る**（ラウンドロビン）。
 * ⚠**連続した塊で割らない**＝対戦の長さはシードによって倍近く違う（実測 28〜40秒）ので、
 *   塊で割ると1本だけ遅れて並列の意味が薄れる。
 */
export function splitSeeds(seeds: readonly number[], jobs: number): number[][] {
  const n = Math.max(1, Math.min(jobs, seeds.length));
  const out: number[][] = Array.from({ length: n }, () => []);
  seeds.forEach((s, i) => out[i % n].push(s));
  return out.filter(x => x.length > 0);
}

const pct = (v: number | null) => (v === null ? '—' : `${(v * 100).toFixed(1)}%`);

/** 勝率表（人が読む出力）。 */
export function formatAbReport(s: AbSummary, aName: string, bName: string): string {
  const L: string[] = [];
  L.push('');
  L.push(`===== A/B 結果  A=${aName}  B=${bName} =====`);
  L.push(`対戦 ${s.games}（${s.games / 2} シード × 2＝席入れ替え）｜決着 ${s.decided}｜止まった ${s.stalled}｜実時間 ${(s.totalMs / 1000).toFixed(0)}秒`);
  // 🔑**主の判定は「組」**（§5.7 `S-21`）＝席入れ替えの2戦は相関するので、戦単位の区間は**実際より狭く出る**。
  L.push(`🔑**組で見た勝率（こちらを読む） ${pct(s.pairRate)}**（A が2連勝 ${s.pairs.aSweep} - B が2連勝 ${s.pairs.bSweep}）  95%CI [${pct(s.pairLo)}, ${pct(s.pairHi)}]`);
  L.push(s.pairSignificant
    ? `🔎**差あり**＝組で見た区間が 50% を跨いでいない（A のほうが${(s.pairRate ?? 0) > 0.5 ? '強い' : '弱い'}と言ってよい）`
    : `⚠**差があるとは言えない**＝決着した組 ${s.pairDecided}／${s.pairDecided + s.pairs.split}組。`
      + (s.pairs.split > s.pairDecided
        ? `🔴**1勝1敗が ${s.pairs.split}組＝2つのポリシーはほぼ同じ打ち方をしている**（勝敗を決めたのは席）⇒ 戦数を増やしても効率が悪い。**差が出るところまで振る**か、別の指標（census:play・ログの回数）で見る。`
        : `⇒ **戦数を増やす**（区間幅は概ね 1/√n でしか縮まらない）`));
  L.push(`参考（戦単位＝対を独立と数えるので**区間が狭く出る**）＝A の勝率 ${pct(s.rate)}（${s.aWins} - ${s.bWins}）  95%CI [${pct(s.lo)}, ${pct(s.hi)}]`);
  const hostTurn = s.firstSeat === 'host' ? '先攻' : '後攻';
  const guestTurn = s.firstSeat === 'host' ? '後攻' : '先攻';
  L.push(`内訳＝A が host席（${hostTurn}）${s.aAsHost.wins}/${s.aAsHost.decided}｜A が guest席（${guestTurn}）${s.aAsGuest.wins}/${s.aAsGuest.decided}`);
  L.push(`先攻（${s.firstSeat}席）の勝率 ${pct(s.firstPlayerRate)}（**ポリシーと無関係に出る偏り**＝席入れ替えはこれを相殺するためにある）`);
  L.push(`組の内訳＝A が2連勝 ${s.pairs.aSweep}／1勝1敗 ${s.pairs.split}／B が2連勝 ${s.pairs.bSweep}${s.pairs.incomplete > 0 ? `／不完全 ${s.pairs.incomplete}` : ''}`);
  return L.join('\n');
}
