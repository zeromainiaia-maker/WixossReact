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
import type { BattleStateRow, PlayerState, EffectStack, PendingSpell, PendingEffect } from '../../../types';
import { isStackDone } from '../../../engine/effectStack';
import { closeSpellCheckZone, openSpellCheckZone } from '../turnScopedState';

/** プレイヤー状態を書き込む先のカラム。 */
export type PlayerStateKey = 'host_state' | 'guest_state';

/**
 * バトル遷移アクション（discriminated union）。ハンドラを純粋化するたびにここへ追加していく。
 */
export type BattleAction =
  /** セットアップフェイズを進める（例：じゃんけん確定後 → MULLIGAN）。 */
  | { type: 'SET_SETUP_PHASE'; phase: BattleStateRow['setup_phase'] }
  /**
   * ターンフェイズを進める（ENERGY / MAIN / ATTACK_* / END 等）。
   * フェイズ移行と同時に発火するトリガー（ON_ATTACK_PHASE_START 等）を伴う場合は、任意で
   * 1プレイヤー状態（フラグクリア等）と effect_stack を併記できる（undefined＝不干渉・null＝明示クリア）。
   * `ADVANCE_TURN_WITH_STATE` との違い＝**プレイヤー状態の書き込みが任意**（フェイズだけ進める場合がある）。
   */
  | {
      type: 'SET_TURN_PHASE';
      phase: BattleStateRow['turn_phase'];
      /** 併せて書くプレイヤー状態（省略＝書かない）。 */
      state?: { key: PlayerStateKey; state: PlayerState };
      /** effect_stack を併せて書く場合（null 明示でクリア）。省略時は触らない。 */
      effectStack?: EffectStack | null;
    }
  /** 決着確認（終了ダイアログ）を了承する。 */
  | { type: 'ACK_END'; isHost: boolean }
  /** じゃんけんの手を提出する。 */
  | { type: 'SUBMIT_JANKEN'; isHost: boolean; pick: string }
  /**
   * じゃんけんを判定する。勝者が決まれば先攻を確定してルリグ選択へ進み、**あいこ（winnerId=null）は
   * 両者の手だけリセットして再戦**する（`setup_phase` を進めない）。
   */
  | { type: 'RESOLVE_JANKEN'; winnerId: string | null }
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
      /**
       * スペルへのカットイン応答（レゾナ出現）を完了として記録する場合。
       * **現盤面の `pending_spell` に `cutin_response_complete:true` を立てて書き戻す**（盤面依存ケース）。
       * 省略時は `pending_spell` を触らない。
       */
      markCutinResponseComplete?: boolean;
    }
  /**
   * プレイヤー状態を**0〜2件**書き込む（＋任意で effect_stack）。
   * `WRITE_STATE` との違い＝**どちらの状態も任意**。直前フラグ（`hand_discarded_just` /
   * `zone_moved_just` 等）の watcher が「どちら側を書くかが実行時に決まる」形＝
   * 旧コードの `const update: Record<string, unknown> = {}` へ条件付きでキーを足す命令的構築を、
   * キー集合を保ったまま純粋化するための形。
   */
  | {
      type: 'WRITE_STATES';
      /** 書き込む状態（省略キーは書かない）。 */
      states: Partial<Record<PlayerStateKey, PlayerState>>;
      /** effect_stack を併せて書く場合（null 明示でクリア）。省略時は触らない。 */
      effectStack?: EffectStack | null;
    }
  /** スペルのコスト支払い済み状態を書き、カットイン待ちへ進める。 */
  | {
      type: 'QUEUE_SPELL';
      casterKey: PlayerStateKey;
      casterState: PlayerState;
      spell: PendingSpell;
      other?: { key: PlayerStateKey; state: PlayerState };
      /** 使用時の支払い（場のシグニをトラッシュ）で積んだ離場/トラッシュのトリガー（省略＝触らない）。 */
      effectStack?: EffectStack | null;
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
      /** 使用時の支払い（ベットのコイン）で積んだトリガー（省略＝触らない）。 */
      effectStack?: EffectStack | null;
    }
  /**
   * プレイヤー状態を書き、指定したターンフェイズへ進める。
   * フェイズ開始時トリガー（ON_GROW_PHASE_START 等）を伴う場合は相手状態の usage 更新と
   * effect_stack も併せられる（`WRITE_STATE` と同じく undefined＝不干渉・null＝明示クリア）。
   */
  | {
      type: 'ADVANCE_TURN_WITH_STATE';
      playerKey: PlayerStateKey;
      playerState: PlayerState;
      phase: BattleStateRow['turn_phase'];
      opp?: { key: PlayerStateKey; state: PlayerState };
      effectStack?: EffectStack | null;
    }
  /**
   * ターンを終了し次ターンを開始する（`turn_phase:'UP'`＋ターンプレイヤー交代＋`turn_count` 加算）。
   * ターン終了処理を適用した最終盤面（自／任意で相手）も併せて書く。
   * `turn_count` は現在盤面から +1 する＝**盤面を読む初のケース**。
   */
  | {
      type: 'BEGIN_NEXT_TURN';
      /** 次ターンのターンプレイヤー。**省略＝据え置き**（追加ターン＝`active_user_id` を書かない）。 */
      activeUserId?: string;
      myKey: PlayerStateKey;
      myState: PlayerState;
      opp?: { key: PlayerStateKey; state: PlayerState };
    }
  /**
   * effect_stack のみを書き換える。`settle:true` なら「解決済みなら null にする」
   * （`isStackDone(stack) ? null : stack`）settle イディオムを reducer 側で適用する。
   */
  | { type: 'SET_STACK'; stack: EffectStack | null; settle?: boolean }
  /**
   * 効果解決の1ステップ結果を書き込む（対話の継続 or 完了）。
   * engine の `ExecResult` を受けた各 `resume*` ハンドラの共通形＝**両者の盤面＋ `pending_effect` の
   * 継続／完了**。`pending` 非null＝次の interaction を提示して待つ／null＝解決完了。
   */
  | {
      type: 'RESOLVE_EFFECT_STEP';
      hostState: PlayerState;
      guestState: PlayerState;
      /** 次の対話（非null）／解決完了（null）。 */
      pending: PendingEffect | null;
      /** スペル・カットイン解決経路は `pending_spell` も同時にクリアする。 */
      clearPendingSpell?: boolean;
      /** 解決中に積まれたトリガーでスタックを書き換える場合（省略＝触らない）。 */
      effectStack?: EffectStack | null;
      /** 完了時、**現在のスタックが解決済みなら** `effect_stack` も null にする（settle）。 */
      settleStackOnDone?: boolean;
      /**
       * FORCE_END_TURN（2回目のリフレッシュ等）＝解決結果を書くのと同時にターンを終了する場合。
       * `BEGIN_NEXT_TURN` と同じ「`turn_phase:'UP'`＋ターンプレイヤー交代＋`turn_count` 加算」を重ねる
       * （盤面と `pending_effect`/`effect_stack` は本 action 側で確定済みなので action を分けられない）。
       */
      beginNextTurn?: { activeUserId: string };
    }
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
export function reduceBattle(bs: BattleStateRow, action: BattleAction): Partial<BattleStateRow> {
  // bs は「純粋遷移は現在盤面から次パッチを計算する」契約を表す引数。多くのケースは payload 完結で
  // 盤面参照が不要だが、盤面依存の遷移（BEGIN_NEXT_TURN の turn_count 加算など）はここから読む。
  switch (action.type) {
    case 'SET_SETUP_PHASE':
      return { setup_phase: action.phase };
    case 'SET_TURN_PHASE': {
      const patch: Partial<BattleStateRow> = { turn_phase: action.phase };
      if (action.state) patch[action.state.key] = action.state.state;
      if (action.effectStack !== undefined) patch.effect_stack = action.effectStack;
      return patch;
    }
    case 'ACK_END':
      return action.isHost ? { host_end_ack: true } : { guest_end_ack: true };
    case 'SUBMIT_JANKEN':
      return action.isHost ? { host_janken: action.pick } : { guest_janken: action.pick };
    case 'RESOLVE_JANKEN':
      return action.winnerId
        ? { first_player_id: action.winnerId, setup_phase: 'LRIG_SELECT', host_janken: null, guest_janken: null }
        : { host_janken: null, guest_janken: null };
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
      // カットイン応答の完了フラグは現盤面の pending_spell を土台に立てる（他キーは据え置き）。
      if (action.markCutinResponseComplete) {
        patch.pending_spell = { ...bs.pending_spell!, cutin_response_complete: true };
      }
      return patch;
    }
    case 'WRITE_STATES': {
      const patch: Partial<BattleStateRow> = {};
      if (action.states.host_state) patch.host_state = action.states.host_state;
      if (action.states.guest_state) patch.guest_state = action.states.guest_state;
      if (action.effectStack !== undefined) patch.effect_stack = action.effectStack;
      return patch;
    }
    case 'QUEUE_SPELL': {
      // 🆕§5.3 `O-138`（2026-09-02）＝解決待ちのスペルは**使用者のチェックゾーンに置かれている**。
      //   これを書かないと「対戦相手のチェックゾーンにスペルがある場合」が永久に偽になり、
      //   スペルカットインで出るレゾナ3枚の【出】が無言 no-op に化ける（型コメント参照）。
      //   ⚠ピース（`kind:'piece'`）はスペルではないので置かない。
      const patch: Partial<BattleStateRow> = {
        [action.casterKey]: action.spell && action.spell.kind !== 'piece'
          ? openSpellCheckZone(action.casterState, action.spell.card_num)
          : action.casterState,
        ...(action.other ? { [action.other.key]: action.other.state } : {}),
        pending_spell: action.spell,
      };
      if (action.effectStack !== undefined) patch.effect_stack = action.effectStack;
      return patch;
    }
    case 'FINISH_SPELL': {
      const patch: Partial<BattleStateRow> = {
        // 🆕§5.3 `O-138`＝スペルがチェックゾーンを離れる（残すと幽霊のスペルで条件が常時成立する）。
        [action.casterKey]: closeSpellCheckZone(action.casterState),
        pending_spell: null,
        pending_effect: null,
      };
      if (action.other) patch[action.other.key] = action.other.state;
      return patch;
    }
    case 'FINISH_CUTIN': {
      const patch: Partial<BattleStateRow> = {
        [action.playerKey]: closeSpellCheckZone(action.playerState),
        pending_spell: null,
      };
      // 🆕§5.3 `O-138`＝窓が閉じたらチェックゾーンからも降ろす（使用者側／応答者側のどちらに載っていても）。
      if (action.caster) patch[action.caster.key] = closeSpellCheckZone(action.caster.state);
      if (action.effectStack !== undefined) patch.effect_stack = action.effectStack;
      return patch;
    }
    case 'ADVANCE_TURN_WITH_STATE': {
      const patch: Partial<BattleStateRow> = { [action.playerKey]: action.playerState, turn_phase: action.phase };
      if (action.opp) patch[action.opp.key] = action.opp.state;
      if (action.effectStack !== undefined) patch.effect_stack = action.effectStack;
      return patch;
    }
    case 'BEGIN_NEXT_TURN': {
      const patch: Partial<BattleStateRow> = { [action.myKey]: action.myState };
      if (action.opp) patch[action.opp.key] = action.opp.state;
      patch.turn_phase = 'UP';
      // 追加ターン（activeUserId 省略）は active_user_id キー自体を書かず据え置く。
      if (action.activeUserId !== undefined) patch.active_user_id = action.activeUserId;
      patch.turn_count = bs.turn_count + 1;
      return patch;
    }
    case 'SET_STACK':
      return { effect_stack: action.settle && action.stack ? (isStackDone(action.stack) ? null : action.stack) : action.stack };
    case 'RESOLVE_EFFECT_STEP': {
      const patch: Partial<BattleStateRow> = {
        host_state: action.hostState,
        guest_state: action.guestState,
      };
      if (action.clearPendingSpell) patch.pending_spell = null;
      patch.pending_effect = action.pending;
      // 完了時のみ settle：スタックが解決済みなら併せてクリアする（未解決なら次エントリ処理へ残す）。
      if (action.pending === null && action.settleStackOnDone) {
        const stack = bs.effect_stack ?? null;
        if (stack && isStackDone(stack)) patch.effect_stack = null;
      }
      // ⚠ settle より後に適用する＝解決中に積まれたトリガーがあれば「解決済みなのでクリア」に勝つ
      //   （盤面差分で新しく発火した効果は、直前のスタックが解決済みでも新スタックとして残す）。
      if (action.effectStack !== undefined) patch.effect_stack = action.effectStack;
      // FORCE_END_TURN：解決結果の上にターン終了を重ねる（`BEGIN_NEXT_TURN` と同じ3キー）。
      if (action.beginNextTurn) {
        patch.turn_phase = 'UP';
        patch.active_user_id = action.beginNextTurn.activeUserId;
        patch.turn_count = bs.turn_count + 1;
      }
      return patch;
    }
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
