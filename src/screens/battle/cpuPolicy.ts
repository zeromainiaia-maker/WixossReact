/**
 * 🆕**CPU のポリシー**（§5.7 `S-9`・2026-09-19）＝**CPU の判断に使う数値を1つの束にまとめたもの**。
 *
 * ■ なぜ要るか＝`S-5` で `npm run selfplay` は通ったが、**両席とも同じ `cpuTurnAction` が同じ定数を読む**ので、
 *   勝率に出るのは**先攻有利と乱数だけ**だった。⇒ **席ごとに違う数値を当てられる**ようにして初めて
 *   「A より B のほうが強い」が測れる（§5.7 `S-9`）。以降の `S-10`〜`S-18` は**全部この口を通して A/B する**。
 *
 * ■ 規律（§5.6.3 のまま）＝ここにあるのは**数値だけ**。可否の判定も実行も書かない。
 *   🔴**「どう判断するか」の分岐をここへ足さない**＝足すなら「新しい数値（閾値・重み）」の形にする。
 *   分岐を flag で持つと、**どの組み合わせが実際に走ったか**が勝率表から読めなくなる。
 *
 * ■ 既定値の在処＝**ここが唯一の正**。`cpuLookahead.BOARD_WEIGHTS` / `SPELL_GAIN_MIN` /
 *   `cpuBoardEval.CPU_KEEP_GUARDS` は**ここから導出した別名**（既存の import と golden を壊さないために残してある）。
 *   ⚠**値を2か所に書かない**＝片方だけ直すと「画面と自己対戦で違う CPU が動く」になる。
 *
 * ⚠**ポリシーを渡さなければ既定**＝`BattleScreen` は渡さないので、**実機の挙動は1ビットも変わらない**。
 */

/** 盤面の採点の重み（パワー換算）。`S-6` の自己対戦で調整する対象。 */
export interface BoardWeights {
  /** ライフクロス1枚。 */
  life: number;
  /** 手札1枚。 */
  hand: number;
  /** エナ1枚。 */
  energy: number;
  /** 正面が空いている（＝ライフへアタックが通る）シグニ1体。除去の大きな価値はここ。 */
  openLane: number;
  /** 相手の凍結しているシグニ1体（次のアップフェイズに起き上がれない）。 */
  oppFrozen: number;
}

/** 1つの CPU の「強さの設定」＝これを席ごとに変えて勝率を比べる。 */
export interface CpuPolicy {
  /** 勝率表・ログに出る名前（`--a` / `--b` に書く文字列）。 */
  readonly name: string;
  /** 盤面の採点の重み（`cpuLookahead.evaluateBoard`）。 */
  readonly boardWeights: BoardWeights;
  /** スペルを使う価値があるとみなす増分の下限（`cpuSpell.pickCpuMainSpell`）。 */
  readonly spellGainMin: number;
  /** 手札に残す【ガード】の枚数（`cpuBoardEval.pickCpuDeployCard`）。 */
  readonly keepGuards: number;
}

/**
 * 🔴**既定のポリシー＝いまの CPU そのもの**（2026-09-19 時点の定数をそのまま移しただけ＝挙動は不変）。
 * ⚠**ここの数値を「良くしよう」として触らない**＝触るのは `S-10` 以降の項目で、**必ず A/B（`S-9`）を通してから**。
 */
export const DEFAULT_CPU_POLICY: CpuPolicy = {
  name: 'default',
  boardWeights: { life: 7000, hand: 1500, energy: 1000, openLane: 3000, oppFrozen: 2500 },
  spellGainMin: 1000,
  keepGuards: 1,
};

/** ポリシーを1項目だけ差し替える（プリセットの定義用）。 */
const variant = (name: string, over: Partial<Omit<CpuPolicy, 'name'>>): CpuPolicy =>
  ({ ...DEFAULT_CPU_POLICY, ...over, name });

/**
 * 名前つきプリセット。
 *
 * 🔴**`default` 以外は「測定台そのものが効いているか」を確かめるための自己検査用**であって、
 *   **強い CPU の候補ではない**（どれも既定より弱くなるはずの方向へ振ってある）。
 *   ⇒ **A/B が「差を検出できる」ことを、差が出るはずの組で先に確かめる**（差が出ないなら配線が死んでいる）。
 * 🔑**`S-10` 以降で本物の候補を足すときは、ここに名前つきで足して `--b <名前>` で当てる。**
 */
export const CPU_POLICIES: Record<string, CpuPolicy> = {
  default: DEFAULT_CPU_POLICY,
  /** スペルを一切使わない（増分がこの下限に届かない）＝配線の自己検査用。 */
  'no-spell': variant('no-spell', { spellGainMin: Number.POSITIVE_INFINITY }),
  /** 【ガード】を手札に残さず全部場に出す＝配線の自己検査用。 */
  'no-guard-keep': variant('no-guard-keep', { keepGuards: 0 }),
  /** ライフの価値を見ない（盤面の物量だけで判断する）＝配線の自己検査用。 */
  'ignore-life': variant('ignore-life', { boardWeights: { ...DEFAULT_CPU_POLICY.boardWeights, life: 0 } }),
};

/** 名前からポリシーを引く。⚠**知らない名前は黙って既定に落とさない**（A と B が同じものになって勝率が無意味になる）。 */
export function resolveCpuPolicy(name: string): CpuPolicy {
  const p = CPU_POLICIES[name];
  if (!p) throw new Error(`unknown CPU policy: ${name}（使えるのは ${Object.keys(CPU_POLICIES).join(' / ')}）`);
  return p;
}
