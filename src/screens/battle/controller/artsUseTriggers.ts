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
 * 🔴2026-10-22＝**どちら側の【自】かは「誰がアーツを使ったか」で決める（どの client が解決したかではない）**。
 *   旧＝`ON_ARTS_USE` は使用者の client だけ、`ON_OPP_ARTS_USE` は相手側の client だけが集めていたが、
 *   スタックの1項目を解決するのは**片方の client だけ**（自分のターンのアーツは使用者・CPU 戦は常に人間）＝
 *   **解決した側が使用者なら相手の「アーツを使用したとき」が、相手なら使用者の「アーツを使用したとき」が誰にも集められなかった**
 *   （自己対戦の MIRROR＝《幻怪　モモキジ》が席によって発動したりしなかったりした）。
 *   二重押しは「1項目を解決するのは1回」で防がれている（解決した client が両側を集める）。
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
}): { entries: StackEntry[]; usedIds: string[]; casterIsHost: boolean } | null {
  const cardType = artsCardType(deps, p.artsCardNum);
  if (cardType !== 'アーツ' || p.effectId === 'DELAYED_TRIGGER') return null;
  const casterIsHost = p.artsOwnerId === deps.bs.host_id;
  const casterState = casterIsHost ? p.afterHost : p.afterGuest;
  const casterOpState = casterIsHost ? p.afterGuest : p.afterHost;
  return { ...pureCollectArtsUseTriggers(
    deps.trigCtx(), p.artsOwnerId, casterState, casterOpState, deps.bs.active_user_id === p.artsOwnerId, p.artsCardNum), casterIsHost };
}

/**
 * 「**対戦相手が**アーツを使用したとき」（`ON_OPP_ARTS_USE`）。使用者の client では `null`。
 * ⚠`affectedOwnSigni`＝そのアーツの効果を受けた自分のシグニ（§5.3 `O-113`＝未提供なら fail-closed）。
 */
export function collectOppArtsUseForResolution(deps: ArtsUseDeps, p: {
  artsOwnerId: string; artsCardNum: string; effectId: string;
  /** 解決前の盤面（反応する側＝使用者の相手の差分を取る）。 */
  beforeHost: PlayerState; beforeGuest: PlayerState; afterHost: PlayerState; afterGuest: PlayerState;
  autoTargetedCards?: string[];
}): { entries: StackEntry[]; usedIds: string[]; iAmHost: boolean } | null {
  const cardType = artsCardType(deps, p.artsCardNum);
  if (cardType !== 'アーツ' || p.effectId === 'DELAYED_TRIGGER') return null;
  // 反応する側＝使用者の相手（`iAmHost` は「反応する側が host か」の意味で返す＝呼び手の書き方を変えない）
  const iAmHost = p.artsOwnerId !== deps.bs.host_id;
  const reactorId = iAmHost ? deps.bs.host_id : deps.bs.guest_id;
  const myStateForTrigger = iAmHost ? p.afterHost : p.afterGuest;
  const opStateForTrigger = iAmHost ? p.afterGuest : p.afterHost;
  const affectedOwnSigni = collectOppArtsAffectedOwnSigni(
    iAmHost ? p.beforeHost : p.beforeGuest, myStateForTrigger, p.autoTargetedCards ?? []);
  const collected = pureCollectOppArtsUseTriggers(
    { ...deps.trigCtx(), meId: reactorId }, myStateForTrigger, opStateForTrigger, deps.bs.active_user_id === reactorId, affectedOwnSigni);
  return { ...collected, iAmHost };
}
