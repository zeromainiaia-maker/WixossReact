/**
 * energyPlacement.ts — 「このターンにエナゾーンへ置かれたカード」の台帳（pure 関数）
 *
 * 🔴**なぜ台帳が要るか**（§5.3 `O-321`/`O-315`/`O-308`③・2026-09-11 第275バッチ）＝
 *   原文「このターンに（コストか効果によって）あなたのエナゾーンに〈条件〉のカードがN枚以上置かれていた場合」は
 *   **「いまエナに何があるか」では答えられない**（置いたあと同じターンに支払えば消える）。
 *   既存の `self_deck_to_energy_this_turn` は**デッキ由来の枚数だけ**で、由来もカードも分からない。
 *
 * 🔑**エントリは `"<instanceId>:<cause>"`**（`signi_placed_origin_this_turn` の `"<id>:<zone>"` と同じ綴り）。
 *   `cause` は原文の「コストか効果によって」を表せるようにするための軸＝
 *   - `effect`＝効果の解決で置かれた（engine の `executeAction` funnel が1箇所で拾う）
 *   - `cost`  ＝コストの支払いとして置かれた（`src/screens/` の支払い地点）
 *   - `rule`  ＝ルール処理（エナフェイズのチャージ／「エナに送る」／バトルバニッシュ）
 *   ⚠**「コストか効果によって」の原文は `rule` を含まない**＝`causes` を省略した条件は**全部**を数える
 *     （無条件の「エナゾーンに置かれていた」はルール処理も含むのが原文どおり）。
 *
 * ⚠**既知の近似**＝**同じ instance が同一ターンに2度置かれても1件**（エントリで重複除去する）。
 *   `executeAction` は入れ子で呼ばれる（`SEQUENCE` の各ステップ）ので、重複除去しないと
 *   **外側の呼び出しが内側の追加をもう一度数える**（同じ1枚が段数ぶん増える）。
 *   ⇒ 「置く→払う→また置く」を2枚と数えたい要求が出たら、ここに連番を足す。
 */
import type { CardData, PlayerState } from '../types';
import type { TargetFilter } from '../types/effects';

export type EnergyPlacementCause = 'effect' | 'cost' | 'rule';

/** `before.energy` に無く `after.energy` に在る instanceId（＝このステップで置かれた札）。 */
export function diffEnergyPlacements(before: PlayerState, after: PlayerState): string[] {
  if (before.energy === after.energy) return [];
  const had = new Set(before.energy);
  return after.energy.filter(num => !had.has(num));
}

/**
 * 置かれた札を台帳へ足した新しい state を返す（変化が無ければ**同じ参照**を返す）。
 * ⚠**同じ参照を返すこと**が呼び出し側の `if (next !== state)` を成立させる＝無駄な再レンダリングを避ける。
 */
export function recordEnergyPlacements(
  state: PlayerState, placed: readonly string[], cause: EnergyPlacementCause,
): PlayerState {
  if (placed.length === 0) return state;
  const ledger = state.energy_placed_this_turn ?? [];
  const known = new Set(ledger);
  const added = placed.map(num => `${num}:${cause}`).filter(e => !known.has(e));
  if (added.length === 0) return state;
  return { ...state, energy_placed_this_turn: [...ledger, ...added] };
}

/** 台帳のエントリを `{ cardNum, cause }` に割る。 */
export function parseEnergyPlacementEntry(entry: string): { cardNum: string; cause: EnergyPlacementCause } {
  const idx = entry.lastIndexOf(':');
  const cause = (idx >= 0 ? entry.slice(idx + 1) : 'effect') as EnergyPlacementCause;
  return { cardNum: idx >= 0 ? entry.slice(0, idx) : entry, cause };
}

/**
 * 台帳から条件に合う札を数える。
 * ⚠**`causes` を省略したら全部**（原文が由来を書いていないときは、ルール処理で置かれた分も数える）。
 * ⚠**`filter` を渡すのに `cardMap`/`matchesFilter` を渡さないと絞れない**ので、判定関数は引数で受ける
 *   （`execUtils` と `effectEngine` のどちらからでも使えるようにするため＝循環 import を作らない）。
 */
export function countEnergyPlacedThisTurn(
  state: PlayerState,
  opts: {
    causes?: readonly EnergyPlacementCause[];
    filter?: TargetFilter;
    cardMap?: Map<string, CardData>;
    matches?: (card: CardData | undefined, filter: TargetFilter) => boolean;
    getCardNum?: (instanceId: string) => string;
  } = {},
): number {
  const entries = state.energy_placed_this_turn ?? [];
  let n = 0;
  for (const entry of entries) {
    const { cardNum, cause } = parseEnergyPlacementEntry(entry);
    if (opts.causes && !opts.causes.includes(cause)) continue;
    if (opts.filter) {
      // 🔴**絞り込みを求められたのに判定材料が無いときは数えない**（fail-closed）＝
      //   ここを素通りさせると「＜植物＞が置かれていた場合」が**何を置いても成立**する条件に化ける。
      if (!opts.cardMap || !opts.matches) continue;
      const base = opts.getCardNum ? opts.getCardNum(cardNum) : cardNum;
      if (!opts.matches(opts.cardMap.get(base), opts.filter)) continue;
    }
    n++;
  }
  return n;
}
