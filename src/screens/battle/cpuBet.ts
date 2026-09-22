import type { CardData, PlayerState } from '../../types';
import type { CardEffect } from '../../types/effects';
import { coinPayableFor } from './costs';
import { removalTargetExists } from './cpuArts';
import { scoreCardUseGain, type LookaheadCtx } from './cpuLookahead';
import { DEFAULT_CPU_POLICY } from './cpuPolicy';

/**
 * 🆕2026-09-22＝**CPU が【ベット】を宣言するか**（ユーザー要望「ベットも使うか考えるようにして」・バグ報告 `8c59ee3c` の続き）。
 *
 * 🔴**なぜ要るか**＝旧 CPU はベットを**一度も宣言しなかった**（`CPU_ARTS_DECLINABLE_COST_KEYS`）＝
 *   《一騎当閃》（ベットなら20000以下／なしなら7000以下をバニッシュ）は、コインを持っていても常に弱い側で撃っていた。
 *   live のベット持ちは **アーツ61効果・スペル7効果**。
 *
 * ■ 判断（2段）
 *   ①**先読みがあれば比べる**＝「ベットして使った盤面」と「ベットせずに使った盤面」の増分の差が
 *     **コインの値段（`betCoinValue` × 枚数）以上**ならベットする。
 *     🔑コインの値段が要る理由＝`evaluateBoard` はコインを数えない（数えないとベットがタダに見え、差が1点でもベットする）。
 *   ②**先読みが無い／解けない**ときは構造だけで決める＝**ベットしないと除去の対象がいないが、ベットすれば対象がいる**ときだけ。
 *
 * ■ v1 の限界（honest defer）
 *   - **枚数を選べるベット（`variable`・live 1効果）は宣言しない**。固定枚数は選択肢の最小を使う。
 *   - アーツで**ベットによってコストが置き換わる札**（`check.betCost`）は、呼び出し側が置き換え後の額で支払いを組む。
 */

/** ベットの宣言に必要な枚数（宣言できない形なら `null`）。 */
export function cpuBetCoinsNeeded(effects: readonly CardEffect[]): number | null {
  const spec = effects.find(e => e.effectType === 'ACTIVATED' && e.cost?.betOptions)?.cost?.betOptions;
  if (!spec || spec.variable || spec.options.length === 0) return null;
  const n = Math.min(...spec.options);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** いまベットを宣言できるか（人間の支払い UI と同じ3条件＝`BET` 封じ・コインの用途制限・所持枚数）。 */
export function cpuCanDeclareBet(actor: PlayerState, blockedSelf: ReadonlySet<string>, kind: 'arts' | 'spell', coins: number): boolean {
  const blocked = (actor.blocked_actions?.includes('BET') ?? false) || blockedSelf.has('BET');
  return !blocked && coinPayableFor(actor, kind) && (actor.coins ?? 0) >= coins;
}

/**
 * ベットを宣言した直後の盤面（コインを払い、効果の「ベットしていた場合」が読むフラグを立てる）。
 * ⚠`performArts`／`performSpell` が書く3キーと同じ（`is_betting_this_effect`／`bet_coins_paid`／`coins`）。
 */
export function withCpuBet(actor: PlayerState, coins: number): PlayerState {
  if (coins <= 0) return actor;
  return {
    ...actor,
    coins: Math.max(0, (actor.coins ?? 0) - coins),
    coins_paid_this_turn: (actor.coins_paid_this_turn ?? 0) + coins,
    is_betting_this_effect: true,
    bet_coins_paid: coins,
  };
}

export interface CpuBetInput {
  /** 使うカードのインスタンス id（先読み用＝手札／ルリグデッキの中のもの）。 */
  cardId: string;
  effects: readonly CardEffect[];
  actor: PlayerState;
  opponent: PlayerState;
  cardMap: Map<string, CardData>;
  blockedSelf: ReadonlySet<string>;
  kind: 'arts' | 'spell';
  from: 'hand' | 'lrig_deck';
  /** ベットしない場合／する場合に払うエナの枚数（コストが置き換わらなければ同じ）。 */
  costCount: number;
  betCostCount: number;
  effectivePowers?: Map<string, number>;
  lookahead?: LookaheadCtx;
}

/** CPU がこの使用でベットする枚数（しないなら 0）。 */
export function cpuBetCoinsFor(p: CpuBetInput): number {
  const n = cpuBetCoinsNeeded(p.effects);
  if (n === null || !cpuCanDeclareBet(p.actor, p.blockedSelf, p.kind, n)) return 0;
  const acts = p.effects.filter(e => e.effectType === 'ACTIVATED');
  if (p.lookahead) {
    const plain = scoreCardUseGain(p.cardId, p.costCount, p.actor, p.opponent, p.lookahead, p.from);
    const bet = scoreCardUseGain(p.cardId, p.betCostCount, withCpuBet(p.actor, n), p.opponent, p.lookahead, p.from);
    if (plain !== null && bet !== null) {
      const coinValue = p.lookahead.policy?.betCoinValue ?? DEFAULT_CPU_POLICY.betCoinValue;
      return bet - plain >= n * coinValue ? n : 0;
    }
  }
  const hasTarget = (betting: boolean) =>
    acts.some(e => removalTargetExists(e.action, p.opponent, p.cardMap, p.effectivePowers, betting));
  return !hasTarget(false) && hasTarget(true) ? n : 0;
}
