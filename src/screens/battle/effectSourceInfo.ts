/**
 * **効果の選択肢に「どのカードの・どの能力か」を添える**（2026-10-01 ユーザー要望
 * ＝「相手の発動した効果など、急に選択肢が出て意味が分からない（WD20-008 など）。
 *   どのカードの効果中か、なんの効果が発動中なのかがわかるように」「全部の効果の選択肢で欲しい」）。
 *
 * 🔴**旧表示は「〇〇の効果」だけ**だった＝①自分の札か相手の札か ②その札のどの能力か
 *   ③なぜ自分が選ぶのか、が1つも出ていなかった（WD20-008《母性本能》を相手が使うと、
 *   こちらには「0枚置く／1枚置く…」だけが出る）。
 * 🔑**判定はここに1本化**＝`EffectInteractionModal` の見出しは全部 `EffectSourceHeader` を通す
 *   （直書きが戻ると golden が落ちる）。React 非依存なので golden から直接呼べる。
 */
import type { CardData, PendingEffect } from '../../types';
import { abilityBlockTextOf } from '../../data/effectParser';
import { getCardNum } from '../../engine/effectExecutor';

export interface EffectSourceInfo {
  /** 効果の持ち主（この画面の閲覧者から見て）。 */
  owner: 'あなた' | '相手';
  /** 例「相手のアーツ《母性本能》の効果」。 */
  heading: string;
  /** 発動中の能力の文面（能力ブロックが特定できなければカード全文）。空文字なら出さない。 */
  abilityText: string;
  /** 効果の持ち主と選ぶ人が違うときの一文（例「相手の効果で、あなたが選びます」）。 */
  respondNote: string | null;
  imgUrl?: string;
}

type PendingSource = Pick<PendingEffect, 'sourcePlayerId' | 'respondPlayerId' | 'sourceCardNum' | 'effectId'>;

/** アイコン画像のファイル名（`icon_txt_turn_02` 等）が CSV に残っているので落とす。 */
function cleanText(s: string): string {
  return s.replace(/icon_[a-z0-9_]+(\.(png|jpg|webp))?/gi, '').replace(/\s+/g, ' ').trim();
}

export function effectSourceInfo(
  pe: PendingSource,
  viewerId: string,
  cardMap: Map<string, CardData>,
): EffectSourceInfo {
  const cardNum = getCardNum(pe.sourceCardNum);
  const card = cardMap.get(cardNum);
  const owner: EffectSourceInfo['owner'] = pe.sourcePlayerId === viewerId ? 'あなた' : '相手';
  const type = card?.Type && card.Type !== '-' ? card.Type : '';
  const name = card?.CardName ?? cardNum;
  const heading = `${owner}の${type}《${name}》の効果`;
  const abilityText = cleanText(abilityBlockTextOf(card, pe.effectId));
  const responder = pe.respondPlayerId ?? pe.sourcePlayerId;
  const respondNote = responder === pe.sourcePlayerId
    ? null
    : responder === viewerId
      ? `${owner}の効果で、あなたが選びます`
      : `${owner}の効果で、相手が選んでいます`;
  return { owner, heading, abilityText, respondNote, imgUrl: card?.ImgURL };
}

/** 選ぶ側でない閲覧者に出す待機中の一文（例「相手が《母性本能》の効果で選択中…」）。 */
export function effectWaitingLine(pe: PendingSource, viewerId: string, cardMap: Map<string, CardData>): string {
  const card = cardMap.get(getCardNum(pe.sourceCardNum));
  const responder = pe.respondPlayerId ?? pe.sourcePlayerId;
  const who = responder === viewerId ? 'あなた' : '相手';
  const owner = pe.sourcePlayerId === viewerId ? 'あなたの' : '相手の';
  return `${who}が${owner}《${card?.CardName ?? getCardNum(pe.sourceCardNum)}》の効果で選択中…`;
}

/**
 * 選択肢1つぶんの出所（例「《ガードアイコン》の効果」）。身代わりバニッシュ・ダメージ置換のように
 * **選択肢ごとに別のカードから来る**確認画面で、ボタンに添える。カードが引けなければ null。
 */
export function sourceCardCaption(cardNum: string | undefined, cardMap: Map<string, CardData>): string | null {
  if (!cardNum) return null;
  const card = cardMap.get(getCardNum(cardNum));
  return card ? `《${card.CardName}》の効果` : null;
}
