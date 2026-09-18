import { getCardNum } from '../../../engine/effectExecutor';
import {
  collectArtsUseTriggers as pureCollectArtsUseTriggers,
  collectOppArtsAffectedOwnSigni,
  collectOppArtsUseTriggers as pureCollectOppArtsUseTriggers,
  type TrigCtx,
} from '../../../engine/triggerCollect';
import type { BattleStateRow, CardData, PlayerState, StackEntry } from '../../../types';

/**
 * 🆕**アーツ使用トリガーの収集（§5.3 `O-131` の2本）を画面から出した**（§5.7 `S-5c` の下ごしらえ・2026-09-18）。
 *
 * ⚠**どちらも「この client が収集するか」を判定して `null` を返す**＝`ON_ARTS_USE` は**使用者の client だけ**、
 *   `ON_OPP_ARTS_USE` は**相手側の client だけ**が集める（裏表で二重押しを防ぐ）。この非対称は仕様なので消さない。
 * ⚠**呼ぶ地点は2つ**＝スタック解決（`stackResolve.ts`）と対話解決（`BattleScreen.handleEffectInteraction`）。
 *   片方だけにすると「対象を取るアーツでは発火しない」に戻る（`O-131` の原因）。golden がその2地点を数えている。
 */
export interface ArtsUseDeps {
  /** 解決中の盤面（`active_user_id` を見る）。 */
  bs: BattleStateRow;
  cardMap: Map<string, CardData>;
  /** この client のプレイヤーID。 */
  userId: string;
  /** この client が host 側か。 */
  isHost: boolean;
  trigCtx: () => TrigCtx;
}

const artsCardType = (deps: ArtsUseDeps, cardNum: string): string | undefined =>
  deps.cardMap.get(cardNum)?.Type ?? deps.cardMap.get(getCardNum(cardNum))?.Type;

/**
 * 「**あなたが**アーツを使用したとき」（`ON_ARTS_USE`）。使用者の client 以外は `null`。
 * ⚠遅延トリガー（`INSTALL_DELAYED_TRIGGER` の発火）は「使用した」瞬間ではないので除く。
 */
export function collectArtsUseForResolution(deps: ArtsUseDeps, p: {
  artsOwnerId: string; artsCardNum: string; effectId: string;
  afterHost: PlayerState; afterGuest: PlayerState;
}): { entries: StackEntry[]; usedIds: string[] } | null {
  const cardType = artsCardType(deps, p.artsCardNum);
  if (cardType !== 'アーツ' || p.effectId === 'DELAYED_TRIGGER' || p.artsOwnerId !== deps.userId) return null;
  const casterState = deps.isHost ? p.afterHost : p.afterGuest;
  const casterOpState = deps.isHost ? p.afterGuest : p.afterHost;
  return pureCollectArtsUseTriggers(
    deps.trigCtx(), deps.userId, casterState, casterOpState, deps.bs.active_user_id === deps.userId, p.artsCardNum);
}

/**
 * 「**対戦相手が**アーツを使用したとき」（`ON_OPP_ARTS_USE`）。使用者の client では `null`。
 * ⚠`affectedOwnSigni`＝そのアーツの効果を受けた自分のシグニ（§5.3 `O-113`＝未提供なら fail-closed）。
 */
export function collectOppArtsUseForResolution(deps: ArtsUseDeps, p: {
  artsOwnerId: string; artsCardNum: string; effectId: string;
  beforeMine: PlayerState; afterHost: PlayerState; afterGuest: PlayerState;
  autoTargetedCards?: string[];
}): { entries: StackEntry[]; usedIds: string[]; iAmHost: boolean } | null {
  const cardType = artsCardType(deps, p.artsCardNum);
  if (cardType !== 'アーツ' || p.effectId === 'DELAYED_TRIGGER' || p.artsOwnerId === deps.userId) return null;
  const iAmHost = deps.isHost;
  const myStateForTrigger = iAmHost ? p.afterHost : p.afterGuest;
  const opStateForTrigger = iAmHost ? p.afterGuest : p.afterHost;
  const affectedOwnSigni = collectOppArtsAffectedOwnSigni(
    p.beforeMine, myStateForTrigger, p.autoTargetedCards ?? []);
  const collected = pureCollectOppArtsUseTriggers(
    deps.trigCtx(), myStateForTrigger, opStateForTrigger, deps.bs.active_user_id === deps.userId, affectedOwnSigni);
  return { ...collected, iAmHost };
}
