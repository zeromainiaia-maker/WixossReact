import type { CardData, PlayerState } from '../../types';
import type { CardEffect } from '../../types/effects';
import { evalUseCondition } from '../../engine/execUtils';
import { isPieceCardType } from './battleUtils';

const baseCardNum = (id: string): string => id.split('#')[0];

/**
 * ピース使用への**カットイン応答窓**（§6.4 O-10・続き518・`WXDi-P05-006`）の純関数部分。
 *
 * 原文「このピースは、対戦相手が【使用条件】【チーム】を持つピースを使用する際、カットインして使用できる。」
 *
 * 🔑**窓は「応答側に使える打ち消しピースが実在するときだけ」開く**＝候補0なら呼び出し側は
 * 従来どおり即時解決する。ピースを使うたびに待ち状態が挟まると、応答が来ない経路（切断・CPU の
 * 取りこぼし）が**そのままデッドロック**になるので、新しい待ち状態の面は最小に閉じる。
 */

/** 「【使用条件】【チーム】を持つピース」か（＝この窓の対象になる使用）。 */
export function isTeamConditionPiece(card: CardData | undefined): boolean {
  if (!card || !isPieceCardType(card.Type)) return false;
  return (card.EffectText ?? '').includes('【使用条件】【チーム】');
}

export interface PieceCutinCandidate {
  /** ルリグデッキ内の実体 ID（instanceId またはカード番号）。 */
  instanceId: string;
  card: CardData;
  effect: CardEffect;
}

/**
 * `responder` のルリグデッキから、いま使われたピースにカットインできるピースを列挙する。
 *
 * ⚠**判定は `OPP_USING_TEAM_PIECE` を含む `condition` を丸ごと評価する**（チーム3体などの
 *   同居条件を落とさない）＝評価時だけ窓フラグを立てた state で評価する。
 * ⚠使われた側が【使用条件】【チーム】を持たないピースなら候補は空（原文の限定）。
 */
export function collectPieceCutinCandidates(args: {
  responder: PlayerState;
  caster: PlayerState;
  usedPieceCard: CardData | undefined;
  cardMap: Map<string, CardData>;
  effectsMap: Map<string, CardEffect[]>;
  turnPhase?: string;
}): PieceCutinCandidate[] {
  const { responder, caster, usedPieceCard, cardMap, effectsMap } = args;
  if (!isTeamConditionPiece(usedPieceCard)) return [];
  // 条件評価のあいだだけ窓を開けた state（実 state はフロー側が立てる）。
  const responderInWindow: PlayerState = { ...responder, team_piece_cutin_window: true };
  const out: PieceCutinCandidate[] = [];
  for (const id of responder.lrig_deck) {
    const card = cardMap.get(baseCardNum(id));
    if (!card || !isPieceCardType(card.Type)) continue;
    for (const eff of (effectsMap.get(id) ?? effectsMap.get(baseCardNum(id)) ?? [])) {
      if (eff.effectType !== 'ACTIVATED' || !eff.condition) continue;
      // この窓でしか使えない宣言を持つものだけ（＝通常タイミングの札を混ぜない）。
      if (!JSON.stringify(eff.condition).includes('OPP_USING_TEAM_PIECE')) continue;
      if (!evalUseCondition(eff.condition, responderInWindow, caster, cardMap, id, (args.turnPhase ?? 'MAIN') as never)) continue;
      out.push({ instanceId: id, card, effect: eff });
      break;
    }
  }
  return out;
}
