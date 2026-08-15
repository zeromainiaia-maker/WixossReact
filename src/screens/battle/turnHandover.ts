import type { PlayerState } from '../../types';

/**
 * ターン終了時に「ターンプレイヤーを交代するか」を決める **唯一の判定点**（§6.4 O-3 続き491）。
 *
 * 🔑**「ターンが普通に回らない」理由は軸ごとに別分岐を生やさない**＝
 * `extra_turn`（追加ターン＝終了側がもう1ターン取る）と `skip_next_turn`（次のターンプレイヤーが
 * 自分のターンを飛ばす）は**結果が同じ**（＝ターンプレイヤーを交代しない）。軸ごとに if を書くと
 * ターン終了経路（人間の通常／手札上限の捨て札あり／CPU の3本）のどれかで片方だけ実装され、
 * 無言ですり抜ける。**軸を足すときはこの1関数に足す。**
 *
 * ⚠**予約の消費（フラグを落とす）と判定を同じ戻り値で返す**（`resolveNextPhaseAfterAttack` と同じ形）＝
 * 別々の分岐にすると「消さないまま交代しない＝永久ループ」か「消したのに交代する＝不発」になる。
 *
 * ⚠優先順位＝`extra_turn` が先。両方立っている場合、追加ターンを先に取り、
 * スキップ予約は**次の交代機会まで残る**（原文どおりの「次の自分のターン」を飛ばす）。
 */
export type TurnHandover = {
  /** true＝ターンプレイヤーを交代しない（`BEGIN_NEXT_TURN` の `activeUserId` を書かない）。 */
  keepTurn: boolean;
  /** ターンを終える側（現ターンプレイヤー）に適用する予約消費。 */
  consumeTurnEnder: (s: PlayerState) => PlayerState;
  /** 次のターンプレイヤー候補（＝相手）に適用する予約消費。 */
  consumeOpponent: (s: PlayerState) => PlayerState;
  /** 対戦ログに出す1行（交代する場合は undefined）。 */
  log?: string;
};

const identity = (s: PlayerState) => s;

export function resolveTurnHandover(turnEnder: PlayerState, opponent: PlayerState): TurnHandover {
  if (turnEnder.extra_turn) {
    return {
      keepTurn: true,
      consumeTurnEnder: s => ({ ...s, extra_turn: undefined }),
      consumeOpponent: identity,
      log: '追加ターン取得！',
    };
  }
  if (opponent.skip_next_turn) {
    return {
      keepTurn: true,
      consumeTurnEnder: identity,
      consumeOpponent: s => ({ ...s, skip_next_turn: undefined }),
      log: '対戦相手は次のターンをスキップする',
    };
  }
  return { keepTurn: false, consumeTurnEnder: identity, consumeOpponent: identity };
}
