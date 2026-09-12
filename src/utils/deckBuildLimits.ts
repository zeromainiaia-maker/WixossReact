import type { CardData } from '../types';
import { isLrigCard } from '../types';
import type { StubAction } from '../types/effects';

/** 構築ルールの枚数上限（表示にも使うので `DeckEditorScreen` から import する）。 */
export const MAIN_MAX = 40;
export const LB_MAX = 20;
export const LRIG_MAX = 10;
export const LRIG_EXTRA_MAX = 2;
export const COPY_MAX = 4;
export const LRIG_COPY_MAX = 1;
export const TEAM_PIECE_MAX = 1;

/** ルリグデッキの「＋2枠」に入る札（ピース／リレーピース＋個別指定の裏面カード）。 */
const SPECIAL_EXTRA_CARD_NUMS = ['PR-470B', 'WX13-005B', 'WX13-006B', 'WX14-006B'];

export const isExtraLrigCard = (card: CardData) =>
  card.Type === 'ピース' || card.Type === 'リレーピース' || SPECIAL_EXTRA_CARD_NUMS.includes(card.CardNum);

export const isTeamPieceCard = (card: CardData) =>
  /^【使用条件】【(ドリーム)?チーム】/.test(card.EffectText ?? '');

/**
 * 🆕**カードが課す「構築時」の制限**（2026-09-12・§5.3 `O-317`・`WXK03-003A`
 * 「このカードをルリグデッキに入れる場合、あなたのルリグデッキにはアーツを**３枚まで**しか入れられない」）。
 *
 * 🔴**これは実行時の制限ではない**＝engine のどの funnel にも乗らず、デッキ編集の枚数判定でしか効かない。
 *   旧 live はこの第1文を効果として1つも出していなかった＝**デッキに何枚でもアーツを入れられた**。
 * 🔑**原文 regex をここで書かない**＝判定は JSON の宣言（`STUB{LRIG_DECK_ARTS_LIMIT}` の `value`）だけを読む
 *   （`census:costtext` の「UI 層で原文を読む」型を増やさないため）。
 * ⚠**母集団は実測1カード**（`grep "ルリグデッキに入れる場合" public/data/CardData_*.csv`・2026-09-12）。
 *   他2枚の「しか入れられない」は【チーム】ピースのルール文で、既存の `TEAM_PIECE_MAX` が担当する。
 */
export function lrigDeckArtsCap(
  lrigDeck: string[],
  cardMap: Map<string, CardData>,
): number | undefined {
  let cap: number | undefined;
  for (const num of lrigDeck) {
    for (const eff of cardMap.get(num)?.effects ?? []) {
      if (eff.action?.type !== 'STUB') continue;
      const stub = eff.action as StubAction;
      if (stub.id !== 'LRIG_DECK_ARTS_LIMIT') continue;
      const max = typeof stub.value === 'number' ? stub.value : Number.parseInt(String(stub.value ?? ''), 10);
      if (!Number.isFinite(max)) continue;
      cap = cap === undefined ? max : Math.min(cap, max);
    }
  }
  return cap;
}

/** ルリグデッキ内のアーツ枚数（`lrigDeckArtsCap` と同じ数え方＝`Type` が「アーツ」の札だけ）。 */
export function lrigDeckArtsCount(lrigDeck: string[], cardMap: Map<string, CardData>): number {
  return lrigDeck.filter(num => cardMap.get(num)?.Type === 'アーツ').length;
}

/** `deckAddBlockReason` が返す「入れられない理由」。`null` なら入れられる。 */
export type DeckAddBlockReason =
  | 'COPY_MAX'            // 同名の上限（メイン4枚／ルリグ1枚）
  | 'LRIG_ARTS_CAP'       // `LRIG_DECK_ARTS_LIMIT` の上限にアーツが達している
  | 'LRIG_ARTS_OVER_CAP'  // 上限を課す札を後から入れようとしたが、既にアーツが超過している
  | 'TEAM_PIECE_MAX'      // 【チーム】ピースは1枚まで
  | 'LRIG_EXTRA_MAX'      // ＋2枠が満杯
  | 'LRIG_MAX'            // ルリグデッキ10枠が満杯
  | 'MAIN_MAX'            // メインデッキ40枚
  | 'LB_MAX';             // ライフバースト20枚

/**
 * 🆕**「このカードをいま1枚足せるか」の唯一の判定**（2026-09-12・§5.1 `V-204`）。
 *
 * 🔴**なぜ1本にまとめたか**＝以前は同じ規則が**3箇所**に写経されていた
 * （`addCard` の早期 return／検索行の `canAdd`／デッキ行の `canAdd`）。
 * `O-317` のアーツ上限は `addCard` にしか足されておらず、**＋ボタンは押せるのに何も起きない**
 * （`addCard` は無言 `return`）＝理由も出ない無反応になっていた。デッキ行の `canAdd` は
 * **【チーム】ピースの上限も見ていなかった**。⇒ **`V-205` の `SigniSummonZoneModal` と同じ契約**
 * （「null でなければ置けない」）に揃え、**列挙式のコピーに戻さない**。
 *
 * ⚠**判定は JSON の宣言と CSV の列だけを読む**（原文 regex を増やさない）。
 */
export function deckAddBlockReason(
  card: CardData,
  deck: { mainDeck: string[]; lrigDeck: string[] },
  cardMap: Map<string, CardData>,
): DeckAddBlockReason | null {
  const countByName = (list: string[]) =>
    list.filter(n => cardMap.get(n)?.CardName === card.CardName).length;

  if (isLrigCard(card)) {
    if (countByName(deck.lrigDeck) >= LRIG_COPY_MAX) return 'COPY_MAX';
    // §5.3 `O-317`＝カードが課す構築時のアーツ上限。
    if (card.Type === 'アーツ') {
      const cap = lrigDeckArtsCap(deck.lrigDeck, cardMap);
      if (cap !== undefined && lrigDeckArtsCount(deck.lrigDeck, cardMap) >= cap) return 'LRIG_ARTS_CAP';
    } else {
      // 上限を課す札を**後から**入れる場合も、既に上限を超えていたら入れられない。
      const capAfter = lrigDeckArtsCap([...deck.lrigDeck, card.CardNum], cardMap);
      if (capAfter !== undefined && lrigDeckArtsCount(deck.lrigDeck, cardMap) > capAfter) return 'LRIG_ARTS_OVER_CAP';
    }
    if (isTeamPieceCard(card) && deck.lrigDeck.filter(n => { const c = cardMap.get(n); return c && isTeamPieceCard(c); }).length >= TEAM_PIECE_MAX) {
      return 'TEAM_PIECE_MAX';
    }
    const extraCount = deck.lrigDeck.filter(n => { const c = cardMap.get(n); return c && isExtraLrigCard(c); }).length;
    if (isExtraLrigCard(card)) {
      if (extraCount >= LRIG_EXTRA_MAX) return 'LRIG_EXTRA_MAX';
    } else if (deck.lrigDeck.length - extraCount >= LRIG_MAX) {
      return 'LRIG_MAX';
    }
    return null;
  }

  if (deck.mainDeck.length >= MAIN_MAX) return 'MAIN_MAX';
  if (countByName(deck.mainDeck) >= COPY_MAX) return 'COPY_MAX';
  if (card.LifeBurst === '1'
      && deck.mainDeck.filter(n => cardMap.get(n)?.LifeBurst === '1').length >= LB_MAX) return 'LB_MAX';
  return null;
}
