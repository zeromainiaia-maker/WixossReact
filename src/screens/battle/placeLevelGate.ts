import type { CardData, PlayerState } from '../../types';
import { getCardNum } from '../../engine/effectExecutor';
import { declaredSigniOverride } from './growLogic';

/**
 * **配置レベル制限**（公式ルール Level／[RULES.md](../../../docs/RULES.md) `R-48` の①）＝
 * **シグニのレベルはセンタールリグのレベル以下**でなければ場に出せない。
 *
 * 🔴**2026-09-18 バグ報告＝「場に出す」効果はこのゲートを1つも通っていなかった。**
 *   手札召喚（`BattleScreen` の `levelOk`）とレゾナ出現（`resonaLevel <= currentLrigLevel`）には在るのに、
 *   効果の `ADD_TO_FIELD`（トラッシュ／エナ／手札／デッキから場に出す）には無く、
 *   **ルリグのレベルを超えるシグニが対象に選べて、そのまま場に出せていた。**
 *
 * 🔑**「置いたあと」のルール処理は `limitExcess.ts`（`R-48` の②）**＝あちらは**レベルが変動して**
 *   超過したシグニを落とす。**印字レベルのまま超過している盤面は落とさない**＝そこを止めるのが
 *   ここ（配置制限）の役目なので、**両方が同じ式で数える**必要がある
 *   （ズレると「置けたのにルール処理が落とす」／「落とさないのに置ける」の理不尽になる）。
 *
 * ⚠**fail-open**＝センタールリグが読めない／レベルが数値でない／シグニでないカードは**通す**。
 *   ここは UI の決定ボタンを塞ぐ判定なので、外すと**合法な効果が打てない＝ソフトロック**になる側。
 */

/** 実効レベル（期間つき基本レベル上書きは `battleCardMap` が当て済みの写しで渡ってくる）。 */
function levelOf(card: CardData | undefined): number | null {
  const lv = parseInt(card?.Level ?? '', 10);
  return Number.isFinite(lv) ? lv : null;
}

/** インスタンスID（`CardNum#N`）でも CardNum でも引ける lookup。 */
function cardOf(id: string, cardMap: Map<string, CardData>): CardData | undefined {
  return cardMap.get(id) ?? cardMap.get(getCardNum(id));
}

/** センタールリグのレベル。読めなければ `null`（＝判定しない）。 */
export function centerLrigLevelOf(
  state: Pick<PlayerState, 'field'>,
  cardMap: Map<string, CardData>,
): number | null {
  const center = state.field?.lrig?.at(-1);
  if (!center) return null;
  return levelOf(cardOf(center, cardMap));
}

/**
 * `state` の場に、そのカードを**レベル制限の面で**出せるか。
 *
 * ⚠**シグニ／レゾナ以外は常に `true`**（`Type` は `シグニ/クラフト`・`シグニ/レゾナクラフト` もある）。
 * ⚠宣言によるレベル0上書き（§5.3 `O-226`＝`WXK09-001-E3`）は手札召喚のゲートと同じく先に効かせる。
 */
export function signiPlaceableByLevel(
  cardId: string,
  state: PlayerState,
  cardMap: Map<string, CardData>,
): boolean {
  const card = cardOf(cardId, cardMap);
  const type = card?.Type ?? '';
  if (!card || !(type.includes('シグニ') || type.includes('レゾナ'))) return true;
  const center = centerLrigLevelOf(state, cardMap);
  if (center === null) return true;
  if (declaredSigniOverride(state, card.CardName).levelZero) return true;
  const lv = levelOf(card);
  if (lv === null) return true;
  return lv <= center;
}
