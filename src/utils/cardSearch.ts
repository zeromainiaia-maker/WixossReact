import type { CardData } from '../types';

// 🆕カード番号検索は「避難先（`CardData_Variants.csv`）の番号」にも当てる（2026-09-20 ユーザー要望）。
//   🔴経緯＝同名の再録・別絵柄はカード番号だけを持つ3列の variant へ退避してあり、
//     アプリが使う本体（Sheet1〜10）は**最初に収録されたパックの番号しか持たない**。
//     そのため「WX01」のようなパック名で引くと、再録側の番号でしか WX01 に属さないカードが**1枚も出ない**。
//   🔑**出すのは本体のカード**（variant のデータではない）＝ヒットの経路が増えるだけで、
//     追加・削除・デッキ保存はすべて従来どおり本体の `CardNum` で動く。
//   ⚠同名グループは実測で**本体側に重複が無い**（2026-09-20＝6,666枚に同名2枚以上のグループ 0、
//     variant 2,572件は全件が本体1枚かトークンへ一意に解決した）ので、名前をキーにして曖昧さが出ない。

/** `CardName` → そのカードの避難先（variant）番号一覧。検索のたびに作り直さないよう呼び出し側で memo する。 */
export function buildVariantNumIndex(variantCards: CardData[]): Map<string, string[]> {
  const index = new Map<string, string[]>();
  for (const v of variantCards) {
    const nums = index.get(v.CardName);
    if (nums) nums.push(v.CardNum);
    else index.set(v.CardName, [v.CardNum]);
  }
  return index;
}

/** 検索語に当たった避難先番号だけを返す（当たらなければ空配列）。検索結果の行に「別番号」として出す。 */
export function matchedVariantNums(card: CardData, search: string, index: Map<string, string[]>): string[] {
  if (!search) return [];
  const q = search.toUpperCase();
  return (index.get(card.CardName) ?? []).filter(n => n.toUpperCase().includes(q));
}

/**
 * 検索語がこのカードに当たるか。
 * - カード名は従来どおり**そのまま**の部分一致（日本語なので大小の概念が無い）。
 * - 番号は本体・避難先とも**大文字小文字を無視**する（`wx01` でも引けるようにする）。
 */
export function cardMatchesSearch(card: CardData, search: string, index: Map<string, string[]>): boolean {
  if (!search) return true;
  if (card.CardName.includes(search)) return true;
  if (card.CardNum.toUpperCase().includes(search.toUpperCase())) return true;
  return matchedVariantNums(card, search, index).length > 0;
}

/** 全角・半角や記号の揺れを吸収した比較用の文字列（「５０００」と「5000」、「（」と「(」を同じに扱う）。 */
function normalizeForSearch(s: string): string {
  return s.normalize('NFKC').toUpperCase();
}

/**
 * 🆕2026-10-01（ユーザー要望）＝**カード効果のテキストで絞り込む**（部分一致）。
 * 対象＝効果テキスト（`EffectText`）とライフバースト（`BurstText`）。全角・半角の違いは無視する。
 * 空白区切りで複数語を入れたら**すべて含む**カードだけ（「エナ 凍結」）。
 */
export function cardMatchesEffectSearch(card: CardData, query: string): boolean {
  const words = normalizeForSearch(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const text = normalizeForSearch(`${card.EffectText ?? ''} ${card.BurstText ?? ''}`);
  return words.every(w => text.includes(w));
}

/** 検索結果のページ分け（1ページ `size` 件）。ページ番号は範囲内へ丸める。 */
export function searchPage(total: number, page: number, size: number): { start: number; end: number; page: number; pageCount: number } {
  const pageCount = Math.max(1, Math.ceil(total / size));
  const p = Math.min(Math.max(0, page), pageCount - 1);
  return { start: p * size, end: Math.min(total, (p + 1) * size), page: p, pageCount };
}
