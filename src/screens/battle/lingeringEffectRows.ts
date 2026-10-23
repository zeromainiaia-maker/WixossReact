/**
 * 発動中の効果欄の**1行ずつの中身**（React 非依存＝golden から呼べる）。記録の仕組みは `lingeringEffects.ts`。
 *
 * ■ 1行＝「誰の・どのカードの・どの能力が・何に・いつまで」。同じ能力が複数のキーに残したものは1行にまとめる。
 * ⚠**対象は公開されているカードだけ名前を出す**（場・トラッシュ・エナ・除外）＝手札やデッキにある個体を
 *   名前で出すと非公開の情報が漏れる。
 */
import type { CardData, PlayerState } from '../../types';
import type { CardEffect } from '../../types/effects';
import { abilityBlockTextOf } from '../../data/effectParser';
import { getCardNum } from '../../engine/execUtils';
import { durationLabel, keyExpiryLabel, liveLingeringNotes, noteTargetCandidates, noteZoneIndexes, type LingeringNote } from './lingeringEffects';

export interface LingeringEffectRow {
  key: string;
  /** 効果の持ち主（閲覧者から見て）。 */
  owner: 'あなた' | '相手';
  sourceCardNum: string;
  sourceName: string;
  /** 能力の文面（能力ブロックが特定できなければカード全文）。 */
  abilityText: string;
  /** 対象のカード名（公開されているものだけ）。カードが無ければ、効果を受けているプレイヤー。 */
  targets: { cardNum?: string; name: string }[];
  expiry: string | null;
  /** 記録した値のうち日本語の文字列（宣言したカード名・付与したキーワード等）。⚠内部の英字の値は出さない。 */
  details: string[];
}

/** アイコン画像のファイル名が CSV に残っているので落とす（`effectSourceInfo.ts` と同じ）。 */
const cleanText = (s: string) => s.replace(/icon_[a-z0-9_]+(\.(png|jpg|webp))?/gi, '').replace(/\s+/g, ' ').trim();

/**
 * 文面から読む期限の目安（効果の `duration` もキーの名前も無いときの最後の手段）。⚠目安＝長い言い回しから当てる。
 */
export function textExpiryLabel(text: string): string | null {
  if (/次の対戦相手のターン終了時まで/.test(text)) return '次の相手のターン終了時まで';
  if (/次のあなたのターン終了時まで/.test(text)) return '次の自分のターン終了時まで';
  if (/このゲームの間/.test(text)) return 'このゲームの間';
  if (/このアタックフェイズの間|アタックフェイズ終了時まで/.test(text)) return 'このアタックフェイズの間';
  if (/ターン終了時まで|このターン/.test(text)) return 'ターン終了時まで';
  if (/次のターン|次の対戦相手のターン/.test(text)) return '次のターン';
  return null;
}

/** 公開されている置き場の個体番号。 */
function publicIds(st: PlayerState): Set<string> {
  const f = st.field;
  return new Set([
    ...(f?.signi ?? []).flatMap(z => z ?? []), ...(f?.lrig ?? []), ...(f?.assist_lrig_l ?? []), ...(f?.assist_lrig_r ?? []),
    ...(f?.key_piece ? [f.key_piece].flat() : []), ...(f?.free_zone ?? []),
    ...(st.trash ?? []), ...(st.energy ?? []), ...(st.lrig_trash ?? []), ...(st.excluded ?? []),
  ].filter((x): x is string => typeof x === 'string'));
}

export function lingeringEffectRows(
  my: PlayerState, op: PlayerState, cardMap: Map<string, CardData>, effectsMap: Map<string, CardEffect[]>,
): LingeringEffectRow[] {
  const visibleIds = new Set([...publicIds(my), ...publicIds(op)]);
  // ⚠個体番号ではなくカード番号で記録するキーもある（例 `blocked_card_names` 以外の番号つき）＝番号でも照合する。
  const visible = new Set([...visibleIds, ...[...visibleIds].map(getCardNum)]);
  const rows = new Map<string, LingeringEffectRow>();
  const add = (holderIsMe: boolean, n: LingeringNote) => {
    const owner: LingeringEffectRow['owner'] = (n.sourceIsSelf === holderIsMe) ? 'あなた' : '相手';
    const rowKey = `${owner}|${n.sourceCardNum}|${n.sourceEffectId ?? ''}`;
    const card = cardMap.get(getCardNum(n.sourceCardNum));
    const effect = (effectsMap.get(getCardNum(n.sourceCardNum)) ?? []).find(e => e.effectId === n.sourceEffectId);
    const abilityText = cleanText(abilityBlockTextOf(card, n.sourceEffectId));
    const row = rows.get(rowKey) ?? {
      key: rowKey, owner, sourceCardNum: n.sourceCardNum, sourceName: card?.CardName ?? getCardNum(n.sourceCardNum),
      abilityText,
      targets: [], details: [], expiry: (n.promoted ? n.expiry : null) ?? (effect ? durationLabel(effect.action) : null) ?? n.expiry
        ?? keyExpiryLabel(n.key) ?? textExpiryLabel(abilityText),
    };
    const cardTargets = noteTargetCandidates(n).filter(id => cardMap.has(getCardNum(id)) && visible.has(id));
    // ゾーンは**画面の見た目の位置**で言う＝自分の場は添字0が左、相手の場は左右が反転して並ぶ（`PlayerField` の `displaySigni`）。
    const zoneName = (zi: number) => `${holderIsMe ? 'あなた' : '相手'}の${['左', '中央', '右'][holderIsMe ? zi : 2 - zi]}のシグニゾーン`;
    const zones = noteZoneIndexes(n);
    const targets: { cardNum?: string; name: string }[] = cardTargets.length > 0
      ? cardTargets.map(id => ({ cardNum: id, name: cardMap.get(getCardNum(id))?.CardName ?? id }))
      : zones.length > 0 ? zones.map(zi => ({ name: zoneName(zi) }))
      : [{ name: holderIsMe ? 'あなた' : '相手' }];
    for (const t of targets) {
      if (!row.targets.some(x => x.name === t.name && x.cardNum === t.cardNum)) row.targets.push(t);
    }
    for (const l of n.leaves) {
      const m = /="([^"]{1,24})"$/.exec(l);
      if (m && !m[1].includes(":") && /[\u3000-\u9fff\uff00-\uffef]/.test(m[1]) && !row.details.includes(m[1]) && row.details.length < 4) row.details.push(m[1]);
    }
    rows.set(rowKey, row);
  };
  for (const n of liveLingeringNotes(op)) add(false, n);
  for (const n of liveLingeringNotes(my)) add(true, n);
  return [...rows.values()];
}
