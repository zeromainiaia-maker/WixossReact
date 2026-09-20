import type { PlayerState } from '../../types';
import type { AddToFieldAction, CardEffect, EffectCost } from '../../types/effects';

/**
 * 🆕**「場に出す」だけの【起】は、空きシグニゾーンが無ければ撃たせない**（§5.6 `C-0`・2026-09-20・
 * バグ報告 `c32a37ce`）。
 *
 * 🔴**何が起きていたか**＝`混沌の鍵主　ウムル＝フィーラ` の【起】《ダウン》
 * 「あなたのトラッシュからシグニ１枚を対象とし、それを場に出す」を、**場が満杯でも発動できた**。
 * `execAddToField` は空きゾーンが無いと `空きシグニゾーンなし（…配置不可）` とログを出して
 * 何もしないので、**ルリグをダウンさせただけで盤面が1つも動かない**（CPU は毎ターンこれを撃って
 * 自分の《ダウン》を捨てていた）。
 *
 * 🔑**提示ゲート1本で塞ぐ**＝`canActivateLrigEffect` / `listActivatableSigniEffects` の両方から呼ぶ
 * （人間のボタン生成と CPU の候補フィルタが同じ関数を通る＝`lrigActivateGate.ts` 冒頭の規律）。
 *
 * ⚠**狭く取る**＝止めるのは **トップレベルのアクションが `ADD_TO_FIELD` そのもの**の効果だけ。
 *   `SEQUENCE` の1ステップに混ざっている場合は**他のステップが動く**ので止めない
 *   （止めると原文より狭い＝過小実行になる）。
 */

/**
 * このコストを払うと**自分の場のシグニゾーンが空きうる**か。
 *
 * 🔴**これを見ないと「場から1体どけて、その空きに出す」型を誤って塞ぐ**＝過小実行になる。
 * ⚠**片側に倒すなら「塞がない」側**＝ここに載せ漏らしたキーは従来どおり提示されるだけで、
 *   踏み倒しにはならない。
 */
export function costCanFreeSigniZone(cost: EffectCost | undefined): boolean {
  if (!cost) return false;
  const keys: (keyof EffectCost)[] = [
    'fieldTrash', 'fieldTrashGroups', 'fieldBanish', 'fieldToDeckTop',
    'trash_self', 'banish_self', 'beat_signi',
  ];
  return keys.some(k => cost[k] !== undefined);
}

/** `state` に空きシグニゾーンがあるか（`gateZoneOnly` なら【ゲート】のある空きに限る）。 */
export function hasEmptySigniZone(state: PlayerState, gateZoneOnly?: boolean): boolean {
  const empties = [0, 1, 2].filter(i => {
    const z = state.field.signi[i];
    return !z || z.length === 0;
  });
  if (!gateZoneOnly) return empties.length > 0;
  const gates = state.own_gate_zones ?? [];
  return empties.some(i => gates.includes(i));
}

/**
 * この【起】は**「場に出す」だけの効果なのに置き場が無い**か（＝提示してはいけない）。
 *
 * `my` は撃つ側、`op` はその対戦相手（`ADD_TO_FIELD.owner === 'opponent'` の置き場はそちら）。
 */
export function blockedByNoEmptySigniZone(eff: CardEffect, my: PlayerState, op: PlayerState): boolean {
  const a = eff.action as AddToFieldAction | undefined;
  if (!a || a.type !== 'ADD_TO_FIELD') return false;
  // ゲーム外トークン生成（`cardName` 指定）も置き場は要る＝同じ軸で見る。
  if (costCanFreeSigniZone(eff.cost)) return false;
  const target = a.owner === 'opponent' ? op : my;
  return !hasEmptySigniZone(target, a.gateZoneOnly);
}
