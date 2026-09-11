import type { CardData } from '../types';
import type { StubAction } from '../types/effects';

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
