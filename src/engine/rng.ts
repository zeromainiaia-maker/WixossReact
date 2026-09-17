// 乱数の**唯一の seam**（§5.6 `C-1`・2026-09-16）。
//
// 🔑**なぜ要るか**＝ゲームの乱数が `Math.random()` で**11箇所に直書き**されており、
//   **対戦・自己対戦・ファズのどれも再現できなかった**（落ちたケースを golden に落とせない）。
//   ⇒ 乱数をこの1本に集約し、**seed を差し込めるようにする**のが `C-1` の目的。
//
// 🔴**既定は `Math.random`**（挙動据置）＝`setRngSeed` を明示的に呼んだときだけ決定論になる。
//   こうしないと既存の golden/smoke/fuzz の結果が静かに変わる。
//
// ⚠**この seam を迂回して `Math.random()` を新しく書かない**＝書くと再現性がそこだけ欠ける。
//   ラチェットは **golden の `§5.6 C-1`**（`src/` 全体を走査して `Math.random` と
//   `sort(() => random - 0.5)` が増えたら FAIL）。`npm run gates` に同梱。
//
// ⚠**インスタンスID（`crypto.randomUUID`）はここを通さない**＝あれはゲームの結果に影響しない識別子で、
//   決定論にすると同一IDの衝突を招く（別の軸なので混ぜない）。

/**
 * 差し替え可能な乱数源。既定は `Math.random`。
 *
 * 🔴🔑**`Math.random` を値で持たず、呼ぶたびに `Math.random()` を引く thunk にする**（2026-09-16・`C-1` で実測）。
 *   値で捕まえると**読み込み時の `Math.random` が固定される**ので、
 *   `goldenTest.ts` が3箇所でやっている `Math.random = () => 0` の差し替えが**この seam に届かなくなる**。
 *   ⚠実際にこれで golden 2本が落ちた（`wave2 A4 WD21-001-E1` と `段2 第33バッチ LAR shuffle`）＝
 *     **既定の挙動は1バイトも変えない**のが `C-1` の契約なので、thunk が正しい。
 */
let rng: () => number = () => Math.random();

/**
 * mulberry32＝seed 1つから再現可能な一様乱数列を作る（`selfPlayFuzz.ts` と同じ実装）。
 * 🔑**同じ実装を2箇所に持たない**ため、ファズ側もここから import する。
 */
export function mulberry32(seed: number): () => number {
  let a = seed | 0;
  return function () {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 乱数源を seed 固定の列に差し替える（テスト・ファズ・ヘッドレス自己対戦用）。 */
export function setRngSeed(seed: number): void {
  rng = mulberry32(seed);
}

/**
 * 🆕いまの乱数源（§5.7 `S-4`）＝**先読みのシミュレーションが本番の乱数列を消費しない**よう、
 * 一時的に別の列へ差し替えて `setRng(prev)` で戻すために使う。
 */
export function currentRng(): () => number {
  return rng;
}

/** 乱数源を任意の関数へ差し替える（既存の RNG を持つ呼び出し元用）。 */
export function setRng(fn: () => number): void {
  rng = fn;
}

/**
 * 既定（`Math.random`）へ戻す。
 * 🔴**seed を入れたテストは必ずこれで戻す**＝戻さないと後続のテストまで決定論になり、
 *   「たまたま通っている」を「固定されている」と誤読する。
 */
export function resetRng(): void {
  rng = () => Math.random();   // ⚠値で持たない（上の注記）
}

/** `Math.random()` の置き換え（0以上1未満）。 */
export function random(): number {
  return rng();
}

/** `0 <= i < n` の整数を1つ。`n <= 0` なら 0。 */
export function randomInt(n: number): number {
  return n > 0 ? Math.floor(rng() * n) : 0;
}

/**
 * Fisher-Yates シャッフル（元の配列は変更しない）。
 *
 * 🔴**`[...arr].sort(() => Math.random() - 0.5)` を使わない**＝比較関数が非一貫なので
 *   実装依存の**偏った並び**になる（一様シャッフルではない）。`C-1` 時点で engine に4箇所あり、
 *   「デッキをシャッフルする」が実際にはほとんど混ざっていない盤面を作りえた。
 */
export function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
