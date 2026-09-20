import type { PlayerState } from '../../types';
import type { CardEffect } from '../../types/effects';

/**
 * 🆕**`ACTIVATE_COST_ZERO_BLACK`（`WD08-001-E1`＝混沌の鍵主　ウムル＝フィーラの【出】）の funnel**
 * （§5.6 `C-0`・2026-09-20・バグ報告 `c32a37ce` の追跡）。
 *
 * 原文＝「あなたの**トラッシュにあるシグニ**１枚を対象とし、ターン終了時まで、
 * **次にそれの【起】能力を使用する場合、その能力の使用コストは《黒×0》になる**」。
 *
 * 🔴**旧実装が壊れていた3点（実測）**
 *   ① **トラッシュ【起】（`trashActivated`）にまったく効いていなかった**＝`activate_cost_zero_signi` を
 *      読むのは `SigniActivatedModal`（場のシグニ）／`performSigniActivated`／`cpuActivate` の**3箇所だけ**で、
 *      `canOfferTrashActivate`・`TrashActivatedModal`・`payTrashActivateCost`・`cpuOffFieldActivate` は1行も見ていなかった。
 *      **対象は必ずトラッシュの札**なので、これが本来の主用途（`WX22-Re17` ネッシーのトラッシュ【起】を無料にする）＝
 *      **この【出】は本来の使い道で完全な no-op だった**。
 *   ② **CPU は場のシグニ【起】でもエナを満額払っていた**＝人間の `SigniActivatedModal` だけがエナを 0 にしており、
 *      CPU 側（`cpuActivate.ts`）は満額の `activatedEnergyCostStr` を使っていた（コインだけ免除）＝**人間だけ安い片肺**。
 *   ③ **「ターン終了時まで」が効いていなかった**＝`turnScopedState.ts` に未登録で、使わなければ**次のターン以降も残った**。
 *
 * 🔑**以後は「コストを見る地点」すべてがこの `applyActivateCostZero` を通る**
 *   （提示ゲート／支払いUI／支払い実行／CPU の4地点。写経すると必ず片肺になる＝LESSONS §4.2）。
 * ⚠**対象は instance id で持つ**（`activate_cost_zero_signi` は `WX01-100#g1` の形）。
 */

/** この instance にいま《黒×0》が乗っているか。 */
export function activateCostZeroApplies(my: PlayerState, cardNum: string): boolean {
  return !!my.activate_cost_zero_signi && my.activate_cost_zero_signi === cardNum;
}

/**
 * 《黒×0》を**効果に焼き込んで**返す（乗っていなければ元の効果をそのまま返す）。
 *
 * 🔑**コスト機構の手前で `cost.energy` を落とす**のが肝＝`trashActivateEnergyTotal` /
 * `canOfferTrashActivate` / `payTrashActivateCost` / `selectEnergyIndicesForCost` は
 * **どれも `effect.cost` しか見ない**ので、ここ1本で提示・表示・支払い・CPU が同時に揃う。
 * ⚠**エナ以外のコスト（手札を捨てる・自分を除外する等）は落とさない**＝原文が言っているのは
 *   「使用コストは《黒×0》になる」＝**エナ（と《コイン》）の話**。落とすと踏み倒しになる。
 */
export function applyActivateCostZero(effect: CardEffect, my: PlayerState, cardNum: string): CardEffect {
  if (!activateCostZeroApplies(my, cardNum)) return effect;
  if (!effect.cost) return effect;
  return { ...effect, cost: { ...effect.cost, energy: undefined, coin: undefined } };
}

// ⚠**消費（使ったら落とす）は `turnScopedState.ts` の `consumeActivateCostZero`**＝
//   ターン限定フィールドのリセットは funnel の戻り値だけで行う規約（golden `turn-scoped T2` が検出する）。
