import type { CardData, Deck } from '../types';

// 🆕**デッキフォーマット（カードプール）**（2026-09-20 ユーザー決定）。
//   **なぜ要るか**＝プールごとにカードの強さが違うので、混ぜると対戦が成立しない。
//   CPU デッキにも設定を持たせ、ランダム選出をフォーマットで絞れるようにする。
//
// - **ディーバ**＝`WXDi*` / `PR-Di*` / `SPDi*` と **`WX24` 以降**。🔑**WX は数値で判定する**＝`WX27` 以降が出ても自動で入る。
// - **レガシー**＝ディーバ以外。
// - **オールスター**＝すべて（制限なし）。
//
// 🔴🔑**判定は「本体の番号」だけでは足りない**（2026-09-20 実測）＝再録・別絵柄は
//   `CardData_Variants.csv` へ退避してあり、本体は**最初に収録されたパックの番号しか持たない**。
//   **本体がレガシー番号なのにディーバ期の再録がある札が 91枚**あり（`WD03-005 コード・ピルルク` →
//   `WXDi-D09-P01` など、ディーバのセンタールリグ群がここに入る）、本体だけで判定すると
//   **ディーバのデッキに自分のルリグを入れられなくなる**。⇒ **本体と避難先のどれか1つが
//   その期の番号なら、そのフォーマットで使える**（逆向き＝ディーバ番号にレガシー期の再録は 0枚）。

export type DeckFormat = 'diva' | 'legacy' | 'allstar';

export const DECK_FORMATS: readonly DeckFormat[] = ['diva', 'legacy', 'allstar'] as const;

export const DECK_FORMAT_JA: Record<DeckFormat, string> = {
  diva: 'ディーバ',
  legacy: 'レガシー',
  allstar: 'オールスター',
};

/** ディーバ期に含める `WX` の最小番号。⚠**上限は設けない**＝新しい弾は自動でディーバになる。 */
export const DIVA_WX_FROM = 24;

/** カード番号1つがディーバ期のものか。 */
export function isDivaCardNum(cardNum: string): boolean {
  const n = cardNum.toUpperCase();
  if (n.startsWith('WXDI')) return true;
  if (n.startsWith('PR-DI')) return true;
  if (n.startsWith('SPDI')) return true;
  // ⚠`WXK01` `WXEX1` は `WX` で始まるが直後が数字2桁でない＝ここには入らない。
  const m = /^WX(\d{2})/.exec(n);
  return !!m && Number(m[1]) >= DIVA_WX_FROM;
}

/** そのカードが**どのプールに存在するか**（本体＋避難先の全印刷を見る）。両方 true になる札がある（再録）。 */
export function cardPoolsOf(
  card: Pick<CardData, 'CardNum' | 'CardName'>,
  variantNumIndex: Map<string, string[]>,
): { diva: boolean; legacy: boolean } {
  const nums = [card.CardNum, ...(variantNumIndex.get(card.CardName) ?? [])];
  return { diva: nums.some(isDivaCardNum), legacy: nums.some(n => !isDivaCardNum(n)) };
}

/** このカードをこのフォーマットのデッキに入れられるか。 */
export function cardAllowedInFormat(
  card: Pick<CardData, 'CardNum' | 'CardName'>,
  format: DeckFormat,
  variantNumIndex: Map<string, string[]>,
): boolean {
  if (format === 'allstar') return true;
  const pools = cardPoolsOf(card, variantNumIndex);
  return format === 'diva' ? pools.diva : pools.legacy;
}

/**
 * デッキの中身からフォーマットを推定する（**明示設定が無いデッキの既定値**）。
 * 🔑**「そのプールにしか無い札」で決める**＝両プールに在る再録（サーバント等）だけのデッキは決め手が無いので
 *   `allstar`（＝制限なし）に倒す。両方の専用札が居るデッキも `allstar`（そこでしか組めない）。
 */
export function detectDeckFormat(
  cardNums: string[],
  cardMap: Map<string, CardData>,
  variantNumIndex: Map<string, string[]>,
): DeckFormat {
  let divaOnly = false, legacyOnly = false;
  for (const num of cardNums) {
    const card = cardMap.get(num);
    if (!card) continue;
    const pools = cardPoolsOf(card, variantNumIndex);
    if (pools.diva && !pools.legacy) divaOnly = true;
    else if (pools.legacy && !pools.diva) legacyOnly = true;
    if (divaOnly && legacyOnly) return 'allstar';
  }
  if (divaOnly) return 'diva';
  if (legacyOnly) return 'legacy';
  return 'allstar';
}

/**
 * **実効フォーマット**＝明示設定があればそれ、無ければ中身からの推定。
 * 🔑**`format` が無いのは「このフォーマット機能より前に作られたデッキ」**＝DB を書き戻さずに分類できるようにしてある
 *   （新しく作るデッキには `allstar` を明示で入れる＝空のデッキが推定で勝手に縛られないため）。
 */
export function effectiveDeckFormat(
  deck: Pick<Deck, 'format' | 'mainDeck' | 'lrigDeck'>,
  cardMap: Map<string, CardData>,
  variantNumIndex: Map<string, string[]>,
): DeckFormat {
  return deck.format ?? detectDeckFormat([...deck.lrigDeck, ...deck.mainDeck], cardMap, variantNumIndex);
}

/** デッキに入っている「いまのフォーマットでは使えない」カード番号（重複はそのまま）。 */
export function outOfFormatCardNums(
  deck: Pick<Deck, 'format' | 'mainDeck' | 'lrigDeck'>,
  cardMap: Map<string, CardData>,
  variantNumIndex: Map<string, string[]>,
): string[] {
  const format = effectiveDeckFormat(deck, cardMap, variantNumIndex);
  if (format === 'allstar') return [];
  return [...deck.lrigDeck, ...deck.mainDeck].filter(num => {
    const card = cardMap.get(num);
    return !!card && !cardAllowedInFormat(card, format, variantNumIndex);
  });
}
