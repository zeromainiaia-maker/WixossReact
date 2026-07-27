// Stage3：純粋バトルコントローラ（reduceBattle）。
//
// 目的＝BattleScreen.tsx の各ハンドラにインラインされた「現在の bs から次に DB へ書く
// update（Partial<BattleStateRow>）を組み立てる計算」を、React/supabase から切り離した
// 純粋関数へ寄せていくための seam。
//
//   handler(React) → BattleAction を組む → reduceBattle(bs, action): Partial<BattleStateRow>
//                  → useBattlePersist().commit(patch) → supabase → realtime → setBs
//
// 永続化層（persist）は全行 I/O を集約済み。ここは「パッチ組み立て」を1ケースずつ純粋化していく。
// 複雑な遷移（トリガー収集・スタック整列を伴うもの）は engine 側が既に純粋（triggerCollect /
// boardDiff / effectStack）なので、計算済みの断片を action payload に載せ、パッチ組み立て（どの
// キーへ書くか・opp/スタック/pending を併せるか）を本 reducer に集約する。レシピは
// docs/BATTLE_CONTROLLER.md。
import type { BattleStateRow, PlayerState, EffectStack, PendingSpell } from '../../../types';
import { isStackDone } from '../../../engine/effectStack';

/** プレイヤー状態を書き込む先のカラム。 */
export type PlayerStateKey = 'host_state' | 'guest_state';

/**
 * バトル遷移アクション（discriminated union）。ハンドラを純粋化するたびにここへ追加していく。
 */
export type BattleAction =
  /** セットアップフェイズを進める（例：じゃんけん確定後 → MULLIGAN）。 */
  | { type: 'SET_SETUP_PHASE'; phase: BattleStateRow['setup_phase'] }
  /** ターンフェイズを進める（ENERGY / MAIN / ATTACK_* / END 等）。 */
  | { type: 'SET_TURN_PHASE'; phase: BattleStateRow['turn_phase'] }
  /** 決着確認（終了ダイアログ）を了承する。 */
  | { type: 'ACK_END'; isHost: boolean }
  /** じゃんけんの手を提出する。 */
  | { type: 'SUBMIT_JANKEN'; isHost: boolean; pick: string }
  /** センタールリグを選択し、初期プレイヤー状態を同時に書く。 */
  | {
      type: 'SELECT_LRIG';
      isHost: boolean;
      selectedCardNum: string;
      state: PlayerState;
    }
  /** マリガンを完了し、確定したプレイヤー状態を同時に書く。 */
  | { type: 'COMPLETE_MULLIGAN'; isHost: boolean; state: PlayerState }
  /** 両者のセットアップ完了後、対戦を開始する。 */
  | { type: 'START_PLAYING'; activeUserId: string }
  /**
   * プレイヤー状態を書き込む（＋任意で相手状態・effect_stack・pending_effect クリアを併記）。
   * 単一プレイヤー状態書き込みと、相手状態/スタックを併せる複合書き込みを1つに集約する。
   * 計算済みの PlayerState / EffectStack は payload で受け取り、パッチ組み立てのみ reducer が担う。
   */
  | {
      type: 'WRITE_STATE';
      myKey: PlayerStateKey;
      myState: PlayerState;
      /** 相手状態も同時に書く場合。 */
      opp?: { key: PlayerStateKey; state: PlayerState };
      /** effect_stack を併せて書く場合（null 明示でクリア）。省略時は触らない。 */
      effectStack?: EffectStack | null;
      /** pending_effect を null クリアする場合。 */
      clearPending?: boolean;
    }
  /** スペルのコスト支払い済み状態を書き、カットイン待ちへ進める。 */
  | {
      type: 'QUEUE_SPELL';
      casterKey: PlayerStateKey;
      casterState: PlayerState;
      spell: PendingSpell;
    }
  /**
   * スペル解決を完了し pending_spell / pending_effect をともにクリアする。
   * 打ち消し時は両者、効果なしスペル時は caster のみを書き込む。
   */
  | {
      type: 'FINISH_SPELL';
      casterKey: PlayerStateKey;
      casterState: PlayerState;
      other?: { key: PlayerStateKey; state: PlayerState };
    }
  /** 効果を持たないカットインを完了し pending_spell のみクリアする。 */
  | {
      type: 'FINISH_CUTIN';
      playerKey: PlayerStateKey;
      playerState: PlayerState;
      caster?: { key: PlayerStateKey; state: PlayerState };
    }
  /** プレイヤー状態を書き、指定したターンフェイズへ進める。 */
  | {
      type: 'ADVANCE_TURN_WITH_STATE';
      playerKey: PlayerStateKey;
      playerState: PlayerState;
      phase: BattleStateRow['turn_phase'];
    }
  /**
   * effect_stack のみを書き換える。`settle:true` なら「解決済みなら null にする」
   * （`isStackDone(stack) ? null : stack`）settle イディオムを reducer 側で適用する。
   */
  | { type: 'SET_STACK'; stack: EffectStack | null; settle?: boolean }
  /**
   * 決着：勝者を確定しゲームを終了する（global_phase='FINISHED'＋winner_id）。
   * 最終盤面の書き込み（my／任意で opp）も併せる。
   */
  | {
      type: 'END_GAME';
      winnerId: string;
      myKey: PlayerStateKey;
      myState: PlayerState;
      opp?: { key: PlayerStateKey; state: PlayerState };
    };

/**
 * 純粋遷移：現在の盤面とアクションから、DB へ書き込むパッチ（Partial<BattleStateRow>）を返す。
 * 副作用なし・同入力同出力。永続化は呼び出し側（useBattlePersist）が担う。
 */
export function reduceBattle(_bs: BattleStateRow, action: BattleAction): Partial<BattleStateRow> {
  // _bs は「純粋遷移は現在盤面から次パッチを計算する」契約を表す引数。現状の各ケースは payload
  // 完結で盤面参照が不要なため未使用（`_` 接頭辞）。盤面依存の遷移を移すときに参照する。
  switch (action.type) {
    case 'SET_SETUP_PHASE':
      return { setup_phase: action.phase };
    case 'SET_TURN_PHASE':
      return { turn_phase: action.phase };
    case 'ACK_END':
      return action.isHost ? { host_end_ack: true } : { guest_end_ack: true };
    case 'SUBMIT_JANKEN':
      return action.isHost ? { host_janken: action.pick } : { guest_janken: action.pick };
    case 'SELECT_LRIG':
      return action.isHost
        ? { host_lrig_selected: action.selectedCardNum, host_state: action.state }
        : { guest_lrig_selected: action.selectedCardNum, guest_state: action.state };
    case 'COMPLETE_MULLIGAN':
      return action.isHost
        ? { host_state: action.state, host_mulligan_done: true }
        : { guest_state: action.state, guest_mulligan_done: true };
    case 'START_PLAYING':
      return { global_phase: 'PLAYING', setup_phase: null, active_user_id: action.activeUserId };
    case 'WRITE_STATE': {
      const patch: Partial<BattleStateRow> = { [action.myKey]: action.myState };
      if (action.opp) patch[action.opp.key] = action.opp.state;
      if (action.effectStack !== undefined) patch.effect_stack = action.effectStack;
      if (action.clearPending) patch.pending_effect = null;
      return patch;
    }
    case 'QUEUE_SPELL':
      return { [action.casterKey]: action.casterState, pending_spell: action.spell };
    case 'FINISH_SPELL': {
      const patch: Partial<BattleStateRow> = {
        [action.casterKey]: action.casterState,
        pending_spell: null,
        pending_effect: null,
      };
      if (action.other) patch[action.other.key] = action.other.state;
      return patch;
    }
    case 'FINISH_CUTIN': {
      const patch: Partial<BattleStateRow> = {
        [action.playerKey]: action.playerState,
        pending_spell: null,
      };
      if (action.caster) patch[action.caster.key] = action.caster.state;
      return patch;
    }
    case 'ADVANCE_TURN_WITH_STATE':
      return { [action.playerKey]: action.playerState, turn_phase: action.phase };
    case 'SET_STACK':
      return { effect_stack: action.settle && action.stack ? (isStackDone(action.stack) ? null : action.stack) : action.stack };
    case 'END_GAME': {
      const patch: Partial<BattleStateRow> = {
        [action.myKey]: action.myState,
        global_phase: 'FINISHED',
        winner_id: action.winnerId,
      };
      if (action.opp) patch[action.opp.key] = action.opp.state;
      return patch;
    }
    default: {
      // 網羅性チェック：新しい action を足したら必ず case を追加させる。
      const _exhaustive: never = action;
      return _exhaustive;
    }
  }
}
