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
  /**
   * 🆕§5.7 `S-27`＝**A 視点の残ライフ差**（A のライフクロス枚数 − B のライフクロス枚数）。
   * 🔑**なぜ要るか**＝勝敗は二値なので「**どれだけ余裕で勝ったか**」を捨てている。
   * 🔴⚠**「勝者の残ライフ」ではない**（2026-09-21 に前提が外れた）＝**ライフ0 はまだ敗北ではない**
   *   （0 の状態でさらにクラッシュを受けて初めて負ける）＝**勝者もライフ0で勝てる**。
   *   実測＝WD13 の3戦のうち**2戦が `0/0` で決着**＝そこではこの値が **0＝「本当に僅差だった」**を表す（情報の欠落ではない）。
   *   ⇒ **0 は「引き分けの目」として別に数える**（`AbSummary.marginTied`）。
   * ⚠**符号が勝者と逆**になったら、それはライフ差以外の決着＝`AbSummary.marginDisagree` が数える。
   */
  margin: number;
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
  /**
   * 🆕§5.7 `S-27`＝**対ごとの残ライフ差の合計**（A 視点・席入れ替えの2戦がそろった組だけ）。
   * 🔑🔴**`pairRate` が分母から外す「1勝1敗の組」がそのまま標本になる**＝
   *   実測（`S-6` 第2段・4束 × 96戦）で**192組のうち144組（75%）が1勝1敗**＝**勝敗の二値は情報の4分の3を捨てていた**
   *   （A が5枚残して勝ち、B が1枚残して勝った組は「互角」ではない）。
   */
  pairMargins: number[];
  /** 上の平均（標本が無ければ null）。 */
  marginMean: number | null;
  /** 平均の 95% 信頼区間（**t 分布**＝小標本で狭く出さない）。 */
  marginLo: number;
  marginHi: number;
  /** 区間が 0 を跨がない＝**この指標では差があると言ってよい**。⚠**勝率の代わりではない**（`formatMarginLine` の但し書き）。 */
  marginSignificant: boolean;
  /**
   * 🔴**勝者と残ライフ差の符号が「逆」だった対戦の数**（勝ったのにライフが少ない）＝**ライフ差以外の決着**。
   * 0 でないなら、この指標はそのぶん**嘘をついている**＝別扱いが要る合図。
   */
  marginDisagree: number;
  /**
   * 🔴**残ライフ差が 0 だった対戦の数**＝**両者ライフ0での決着**（ライフ0 はまだ敗北ではないので普通に起きる）。
   * 🔑**この指標の感度の上限がここに出る**＝**tie が多い山ではライフ差は勝敗とほぼ同じ情報しか持たない**。
   *   ⚠**「壊れている」ではない**＝接戦を「互角」と正しく表しているだけ。**割合を必ず読む。**
   */
  marginTied: number;
  totalMs: number;
}

/**
 * 🆕§5.7 `S-27`＝**t 分布の両側95%臨界値**（自由度 `df`）。
 * 🔴**正規近似（1.96）で済ませない**＝**組が10〜48しか取れない**のがこの台の常態で、
 *   そこで z を使うと**区間が実際より狭く出て「差あり」を誤って言う**（戦単位で Wilson を取ったのと同じ型の誤り＝`S-21`）。
 */
export function tCritical95(df: number): number {
  const T: Record<number, number> = {
    1: 12.706, 2: 4.303, 3: 3.182, 4: 2.776, 5: 2.571, 6: 2.447, 7: 2.365, 8: 2.306, 9: 2.262, 10: 2.228,
    11: 2.201, 12: 2.179, 13: 2.160, 14: 2.145, 15: 2.131, 16: 2.120, 17: 2.110, 18: 2.101, 19: 2.093, 20: 2.086,
    21: 2.080, 22: 2.074, 23: 2.069, 24: 2.064, 25: 2.060, 26: 2.056, 27: 2.052, 28: 2.048, 29: 2.045, 30: 2.042,
    40: 2.021, 60: 2.000, 120: 1.980,
  };
  if (df <= 0) return Number.POSITIVE_INFINITY;
  if (T[df] !== undefined) return T[df];
  if (df > 120) return 1.960;
  // ⚠表に無い自由度は**大きいほうの臨界値**を使う（＝区間を狭くしない側へ倒す）。
  const keys = Object.keys(T).map(Number).sort((a, b) => a - b);
  return T[keys.find(k => k > df) ?? 120];
}

/** 標本平均の 95% 信頼区間（t）。⚠**n が 1 以下なら幅は無限**（1件で「差あり」と言わない）。 */
export function meanInterval(xs: readonly number[]): { mean: number; lo: number; hi: number; n: number } {
  const n = xs.length;
  if (n === 0) return { mean: 0, lo: Number.NEGATIVE_INFINITY, hi: Number.POSITIVE_INFINITY, n };
  const mean = xs.reduce((a, b) => a + b, 0) / n;
  if (n === 1) return { mean, lo: Number.NEGATIVE_INFINITY, hi: Number.POSITIVE_INFINITY, n };
  const varS = xs.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1);
  const half = tCritical95(n - 1) * Math.sqrt(varS / n);
  return { mean, lo: mean - half, hi: mean + half, n };
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
  // 🆕§5.7 `S-27`＝**対ごとの残ライフ差の合計**＝**1勝1敗の組も標本にする**（`pairRate` が捨てている4分の3）。
  const pairMargins: number[] = [];
  for (const rs of bySeed.values()) {
    const dec = rs.filter(r => r.winner !== null);
    if (rs.length !== 2 || dec.length !== 2) continue;
    pairMargins.push(dec[0].margin + dec[1].margin);
  }
  const mi = meanInterval(pairMargins);
  // 🔴**符号が「逆」**＝ライフ差以外の決着（この指標が嘘をつく分）。⚠**0 は逆ではない**（両者ライフ0の決着＝接戦）。
  const marginDisagree = decidedGames.filter(r => (r.winner === 'A' ? r.margin < 0 : r.margin > 0)).length;
  const marginTied = decidedGames.filter(r => r.margin === 0).length;
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
    pairMargins,
    marginMean: pairMargins.length > 0 ? mi.mean : null,
    marginLo: mi.lo, marginHi: mi.hi,
    marginSignificant: pairMargins.length > 1 && (mi.lo > 0 || mi.hi < 0),
    marginDisagree,
    marginTied,
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
  // 🆕§5.7 `S-27`＝**連続量**（補助）＝1勝1敗の組も標本になる。⚠**主の判定を置き換えない**。
  L.push(formatMarginLine(s));
  return L.join('\n');
}

/**
 * 🆕§5.7 `S-27`＝**連続量の1行**（対ごとの残ライフ差）。
 *
 * 🔴🔑**これは補助であって主の判定ではない**＝目的関数は勝率。
 *   「ライフを多く残して勝つ」と「勝つ」は別物で、**残ライフを稼ぐだけで勝率が上がらない**ポリシーはありうる。
 *   ⇒ **使い道は「A/B に戦数を積む価値があるか」を安く見ること**（`selfplay:scan` の分岐スクリーニングと同じ立ち位置）。
 * 🔑**なぜ勝率より感度が高いか**＝`pairRate` は**1勝1敗の組を分母から外す**が、
 *   この指標は**その組も「何点差で勝ったか」として拾う**（実測＝192組のうち144組がそれ）。
 */
export function formatMarginLine(s: AbSummary): string {
  const n = s.pairMargins.length;
  if (n === 0) return '🆕連続量（対ごとの残ライフ差）＝標本なし（席入れ替えの2戦がそろった組が無い）';
  const f = (v: number) => (Number.isFinite(v) ? `${v >= 0 ? '+' : ''}${v.toFixed(2)}` : '—');
  return `🆕**連続量（対ごとの残ライフ差・A 視点）＝平均 ${f(s.marginMean ?? 0)} [${f(s.marginLo)}, ${f(s.marginHi)}]（${n}組）**`
    + `｜${s.marginSignificant ? '🔎この指標では差あり' : 'この指標でも差があるとは言えない'}`
    + (s.marginDisagree > 0 ? `｜🔴符号が勝者と逆の対戦 ${s.marginDisagree}（ライフ差以外の決着＝この指標はそのぶん嘘をつく）` : '')
    + (s.decided > 0 ? `｜両者ライフ0での決着 ${s.marginTied}/${s.decided}（${Math.round((s.marginTied / s.decided) * 100)}%＝そこでは勝敗と同じ情報しか無い）` : '')
    + `\n  ⚠**補助の指標**＝1勝1敗の組（${s.pairs.split}）も標本にするので感度は高いが、**目的関数は勝率**`
    + `（残ライフを稼ぐだけで勝率が上がらないポリシーはありうる）。**採否は上の「組で見た勝率」で決める。**`;
}
