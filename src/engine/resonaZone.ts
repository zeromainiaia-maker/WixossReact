import type { CardData } from '../types';
import type { CardEffect, StubAction } from '../types/effects';

/**
 * レゾナが**シグニゾーンを離れるときの行き先**（§5.6 `C-9`・台帳 [RULES.md](../../docs/RULES.md) `R-45`）。
 *
 * 公式ルール（JP-085／JP-094）＝**レゾナがルリグデッキ・ルリグトラッシュ・シグニゾーン以外のゾーンへ
 * 置かれる場合、代わりにルリグデッキに戻る**。⇒ これは**カード効果ではなくルール処理**なので、
 * 「代わりにルリグトラッシュに置かれる」と印刷された5枚（`BANISH_TO_LRIG_TRASH_INSTEAD`）**以外の
 * 全レゾナ**に掛かる。
 *
 * 🔴**2026-09-17 の棚卸しで発見した不一致**＝実装はこの規則をどこにも持っておらず、
 *   **レゾナはバニッシュされるとエナゾーンへ行っていた**（live 実測＝Type が `レゾナ` の46枚のうち
 *   宣言を持つ5枚を除く41枚）。結果は二重に壊れる＝①相手にエナを1枚献上する
 *   ②レゾナが**ルリグデッキへ戻らないので二度と出せない**（`resonaSummon.ts` は `lrig_deck` から出す）。
 *
 * ⚠**`シグニ/レゾナクラフト`（live 10枚）はここでは扱わない**＝クラフトは「場を離れる場合ゲームから
 *   取り除かれる」はずだが、手元の一次資料（EN Rule Guide／JP 用語集）で明文を確認できていない。
 *   **推測で golden を張ると正しい修正を止める側に回る**ので、`Type === 'レゾナ'` の完全一致だけに掛け、
 *   クラフト側は RULES.md `R-45b` へ「要判断」で出す。
 *
 * @returns `'lrig_deck'` / `'lrig_trash'`＝規則がこのカードの行き先を決める（呼び出し側は他の置換より優先する）。
 *          `null`＝レゾナではない＝通常の行き先（エナ等）。
 */
export function resonaLeaveDestination(
  num: string,
  cardMap: Map<string, CardData>,
  effectsMap?: Map<string, CardEffect[]>,
): 'lrig_deck' | 'lrig_trash' | null {
  if (!num) return null;
  const hash = num.indexOf('#');
  const base = hash > 0 ? num.slice(0, hash) : num;
  const card = cardMap.get(num) ?? cardMap.get(base);
  if (card?.Type !== 'レゾナ') return null;
  // ⚠**効果は2経路から来る**＝`cardMap` に畳み込まれた `effects`（engine の走査が使う形）と
  //   `effectsMap`（BattleScreen が別に持つ形）。片方だけ見ると宣言持ちの5枚が経路によって取りこぼれる。
  const effects = [
    ...(card.effects ?? []),
    ...(effectsMap?.get(num) ?? effectsMap?.get(base) ?? []),
  ];
  const toLrigTrash = effects.some(effect =>
    effect.effectType === 'CONTINUOUS'
    && effect.action.type === 'STUB'
    && (effect.action as StubAction).id === 'BANISH_TO_LRIG_TRASH_INSTEAD');
  return toLrigTrash ? 'lrig_trash' : 'lrig_deck';
}
