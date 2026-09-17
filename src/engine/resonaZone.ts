import type { CardData, PlayerState } from '../types';
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
 * 🆕**クラフトは「場を離れる場合ゲームから取り除かれる」**（2026-09-17 ユーザー裁定・RULES.md `R-45b`）＝
 *   `シグニ/レゾナクラフト`（live 10枚）は**ルリグデッキへ戻さず除外**する。⚠戻すとルリグデッキに溜まって
 *   **同じクラフトを何度でも出し直せる**（レゾナ規則をそのまま当てると必ずこちら側に倒れる）。
 *
 * @returns `'lrig_deck'` / `'lrig_trash'` / `'exile'`＝規則がこのカードの行き先を決める
 *          （呼び出し側は他の置換より優先する）。`null`＝レゾナでもクラフトでもない＝通常の行き先（エナ等）。
 */
export function resonaLeaveDestination(
  num: string,
  cardMap: Map<string, CardData>,
  effectsMap?: Map<string, CardEffect[]>,
): 'lrig_deck' | 'lrig_trash' | 'exile' | null {
  if (!num) return null;
  const hash = num.indexOf('#');
  const base = hash > 0 ? num.slice(0, hash) : num;
  const card = cardMap.get(num) ?? cardMap.get(base);
  // ⚠**クラフトを先に見る**＝`シグニ/レゾナクラフト` は「レゾナ」を含むので、後に置くとレゾナ規則に食われる。
  if ((card?.Type ?? '').includes('クラフト')) return 'exile';
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

/**
 * 🆕**レゾナ／クラフトが「居てはいけない領域」に居たら規則の行き先へ戻す**
 * （§5.6 `C-9` `R-45`／`R-45b`・2026-09-17 ユーザー裁定）。
 *
 * 🔑**裁定**＝「**ルリグトラッシュに行くと明示されている場合以外、レゾナが場を離れるときは必ずルリグデッキに戻る。
 *   手札やトラッシュには行かない。**」⇒ レゾナが手札・トラッシュ・デッキ・エナゾーンに居る盤面は**存在しない**。
 *
 * 🔴**なぜ「行き先ごとに直す」ではなく「後から正す」形なのか**＝場を離れる書き込みは
 *   `removeFromField` の呼び出し**約70箇所**に散っており（手札へ／トラッシュへ／デッキへ／エナへ）、
 *   1つずつ直すと**必ず取りこぼす**（バニッシュ経路だけ直した第394バッチの続きがこれ）。
 *   ⇒ **`done()`（engine の全アクションの終端・1箇所）**でまとめて正す＝新しい経路が増えても自動で掛かる。
 *   ⚠SEQUENCE の**途中の done でも掛かる**ので、「手札に戻してから手札を捨てる」型の連鎖でも
 *     レゾナが手札に居る瞬間が生まれない。
 *
 * ⚠**`lrig_deck` / `lrig_trash` は走査しない**＝どちらも正しい置き場（効果が明示して置いた分を戻さない）。
 * ⚠**`excluded`（ゲームから除外）も走査しない**＝除外からカードを引き戻さない（クラフトの行き先でもある）。
 * ⚠**場（`field.signi`）は当然対象外**＝出ているレゾナを回収しない。
 */
const RESONA_ILLEGAL_ZONES = ['hand', 'trash', 'deck', 'energy'] as const;

export function enforceResonaZoneRule(
  state: PlayerState,
  cardMap: Map<string, CardData>,
  effectsMap?: Map<string, CardEffect[]>,
): PlayerState {
  let moved = false;
  const toLrigDeck: string[] = [];
  const toLrigTrash: string[] = [];
  const toExcluded: string[] = [];
  const next: Record<string, string[]> = {};
  for (const zone of RESONA_ILLEGAL_ZONES) {
    const cards = state[zone];
    if (!cards?.length) continue;
    const kept: string[] = [];
    for (const num of cards) {
      const dest = resonaLeaveDestination(num, cardMap, effectsMap);
      if (dest === 'lrig_deck') { toLrigDeck.push(num); moved = true; continue; }
      if (dest === 'lrig_trash') { toLrigTrash.push(num); moved = true; continue; }
      if (dest === 'exile') { toExcluded.push(num); moved = true; continue; }
      kept.push(num);
    }
    if (kept.length !== cards.length) next[zone] = kept;
  }
  if (!moved) return state;
  return {
    ...state,
    ...next,
    lrig_deck: toLrigDeck.length ? [...state.lrig_deck, ...toLrigDeck] : state.lrig_deck,
    lrig_trash: toLrigTrash.length ? [...state.lrig_trash, ...toLrigTrash] : state.lrig_trash,
    excluded: toExcluded.length ? [...(state.excluded ?? []), ...toExcluded] : state.excluded,
  };
}
