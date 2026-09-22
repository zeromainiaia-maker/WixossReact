/**
 * 🆕§5.7 `S-35`（2026-09-22）＝**重みの「効き」センサス**の純関数部分。
 *
 * 🔴**なぜ要るか**＝`S-6` は重みを1本ずつ A/B（1候補 96戦＝8分）に掛けて全部「差があるとは言えない」で終わり、
 *   第3段の ablation でようやく**`lrigLevel` は 48組すべてで1手も変えない**＝**argmax を動かしようがない**と分かった。
 *   🔑**理由は値の大小ではなく「探索が比べている候補の間でその量が変わらないこと」**＝
 *   グロウは `GROW`（探索の外＝候補は実測で**最大1**）、ライフが減るのはアタックの解決。
 *   ⇒ **その判定は対戦を回さなくても、1回の探索を重みを0にしてやり直すだけで分かる。**
 *
 * 🔑**`selfplay:scan`（第1段）より2桁安い**＝あちらは**1候補につき1戦（35秒）**で「打った手の並びが基準と違うか」を見る。
 *   こちらは**1戦の中の全判断**（実測＝1戦あたり探索は数百回）で「その重みを0にすると選ぶ手が変わるか」を数える。
 *
 * ⚠🔴**「変えた回数 0」＝「その重みは無意味」ではない**＝ここが見ているのは**探索の argmax だけ**。
 *   同じ重みを読む別の経路（アーツ／スペル／ベットの先読み・`pickCpuEnergyCharge` のヒューリスティック）は含まない。
 *   ⇒ **0 なら「探索では効かない」までしか言えない**（そこを直したいなら判断の場所ごと変える＝`S-35` の結論）。
 * ⚠**変えた回数 > 0 は「強くなる」ではない**＝手が変わることと勝率が上がることは別（`S-6` 第2段の実測＝
 *   `actionBias` は 12/12 分岐して勝率 42.9%）。**強さの判定は `selfplay:ab` だけ。**
 */
import type { CpuPolicy } from '../src/screens/battle/cpuPolicy';

/**
 * 「この重みを 0 にする」`--a-set` 仕様を**盤面の重みの全キーから機械で作る**。
 * 🔴**手で列挙しない**＝`BoardWeights` に足した重みが**1つだけ走査から漏れる**と、
 *   「効かない重み」を見つける計器に**その重みだけ映らない**（`no-board-eval` と同じ罠）。
 */
export function weightZeroSpecs(policy: CpuPolicy): string[] {
  // ⚠**既定が 0 の重みは走査しない**＝0 にしても盤面の点が1点も動かない＝
  //   「効かなかった」ではなく「**測っていない**」なのに 0 の行として並ぶと読み違える（`turnDamage` がこれ）。
  return Object.entries(policy.boardWeights)
    .filter(([, v]) => v !== 0)
    .map(([k]) => k).sort().map(k => `${k}=0`);
}

/** 1つの重みについての観測。 */
export interface WeightEffectRow {
  /** `--a-set` 仕様（`life=0` など）。 */
  spec: string;
  /** 探索が走った判断の回数（全キーで同じ）。 */
  decisions: number;
  /** そのうち**選ぶ手が変わった**回数。 */
  changed: number;
  /**
   * 🔴**実機の CPU が実際に探索するフェイズ**だけに絞った回数（`MAIN`／`searchAttacks` のとき `ATTACK_SIGNI`）。
   * 🔑**この計器は計測のために全フェイズで探索を回す**ので、絞らないと
   *   「`GROW` の探索では効く」＝**実機では一度も起きない効き**まで数えてしまう。
   */
  liveDecisions: number;
  liveChanged: number;
}

/**
 * そのフェイズで**実機の CPU が探索するか**。
 * 🔴**`BattleScreen` の `cpuSearchOn`（`MAIN`）と `S-17` のアタック探索（`searchAttacks`）と同じ条件**＝
 *   ここを実機とズラすと、計器が「実機では起きない効き」を報告する。
 */
export function isLiveSearchPhase(phase: string, searchAttacks: boolean): boolean {
  if (phase === 'MAIN') return true;
  return phase === 'ATTACK_SIGNI' && searchAttacks;
}

/**
 * 表にする。🔑**0 の行を必ず最後にまとめて名指しする**＝
 * 「この重みは探索の argmax を1度も動かしていない」が計器の主産物だから。
 */
export function formatWeightEffect(rows: readonly WeightEffectRow[], decks: string): string {
  const sorted = [...rows].sort((a, b) => b.liveChanged - a.liveChanged || b.changed - a.changed || a.spec.localeCompare(b.spec));
  const dead = sorted.filter(r => r.liveChanged === 0).map(r => r.spec.replace('=0', ''));
  const out: string[] = [];
  const liveN = sorted[0]?.liveDecisions ?? 0;
  out.push(`=== 重みの効き（探索の argmax を変えた回数）｜山 ${decks} ===`);
  out.push(`  重み                 実機が探索する判断 ${liveN}回 ｜ 参考: 全フェイズ ${sorted[0]?.decisions ?? 0}回`);
  for (const r of sorted) {
    const lp = r.liveDecisions === 0 ? '—' : `${((r.liveChanged / r.liveDecisions) * 100).toFixed(1)}%`;
    const ap = r.decisions === 0 ? '—' : `${((r.changed / r.decisions) * 100).toFixed(1)}%`;
    out.push(`  ${r.spec.replace('=0', '').padEnd(18)} ${String(r.liveChanged).padStart(5)} / ${r.liveDecisions} (${lp})`
      + ` ｜ 全 ${String(r.changed).padStart(5)} / ${r.decisions} (${ap})`);
  }
  out.push(dead.length === 0
    ? '  🔎0 の重みは無い＝どれも実機の探索の選択を動かしている'
    : `  🔴**実機の探索の選択を1度も動かさなかった重み**＝${dead.join(' / ')}`);
  if (dead.length > 0) {
    // 🔴**0 の理由は3つに割れる**（`S-6` 第1段の分岐0の読み方と同じ）＝**1つに決めつけない**。
    out.push('    0 の読み方＝(a) **その山にその札が無い**（凍結・アーツ等）／(b) **探索が比べる候補の間で値が変わらない**'
      + '（グロウは探索の外・ライフが減るのはアタックの解決＝`S-6` 第3段）／(c) 既定が 0（走査から除外済み）');
  }
  out.push('⚠これは**探索の argmax だけ**を見ている＝アーツ/スペル/ベットの先読み・エナチャージのヒューリスティックは含まない。');
  out.push('⚠**手が変わる ≠ 強くなる**＝強さの判定は `npm run selfplay:ab` だけ（`S-6` 第2段＝分岐しても勝率は動かなかった）。');
  return out.join('\n');
}
