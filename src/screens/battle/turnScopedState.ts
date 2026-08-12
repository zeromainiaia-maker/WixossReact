import type { PlayerState } from '../../types';

// 'turn-end'        ＝いま終わるターンの終了時に、**両プレイヤー**の値を失効させる（「このターン」の素直な意味）。
// 'turn-end-active' ＝**ターンが終わる側だけ**失効させ、相手側の値は次の（＝相手の）ターンまで残す。
//   ⚠これは近似の受け皿＝原文「次のターンの間、対戦相手の…」を、相手 state へ即時に書いて
//   「自分のターン終了では消えない」ことで表している効果がある（`WX15-003-E3`／`WXDi-P08-010-E3`）。
//   両プレイヤーを消すと**その2効果が完全な no-op になる**（続き447 の検証で実測）。
//   本来は `*_next_turn` 予約（`free_grow_next_turn` 等と同じ作法）へ移すべきで、それまでの生存期間の固定。
type TurnScopedBoundary = 'turn-end' | 'turn-end-active' | 'turn-start' | 'attack-phase-start' | 'consume';
type TurnScopedResetValue = undefined | 0 | readonly [];
type TurnScopedSpec = {
  readonly boundaries: readonly TurnScopedBoundary[];
  readonly reset: TurnScopedResetValue;
  readonly reason: string;
};

/**
 * 命名規約で型から機械抽出できるターン限定フィールド。
 * 新しい `*_this_turn` / `*_this_attack_phase` を PlayerState に足すと、ここへ登録するまで typecheck が落ちる。
 */
type ConventionTurnScopedField = Extract<
  keyof PlayerState,
  `${string}_this_turn` | `${string}_this_attack_phase`
>;

const CONVENTION_TURN_SCOPED_STATE = {
  // 効果によるドロー累計は、そのターンが終われば条件判定に使わない。
  cards_drawn_by_effect_this_turn: { boundaries: ['turn-end'], reset: 0, reason: 'effect draw total for the current turn' },
  // ディソナ以外のスペル禁止は、付与されたターンだけ有効。
  dissona_only_spells_this_turn: { boundaries: ['turn-end'], reset: undefined, reason: 'spell restriction granted for the current turn' },
  // 相手効果によるエナ廃棄累計は、ターン単位の条件カウンタ。
  energy_trashed_by_opp_this_turn: { boundaries: ['turn-end'], reset: 0, reason: 'opponent-effect energy trash total for the current turn' },
  // グリッドの公開枚数加算は、付与されたターンだけ有効。
  grid_reveal_plus_one_this_turn: { boundaries: ['turn-end'], reset: undefined, reason: 'grid reveal modifier granted for the current turn' },
  // 相手効果による手札廃棄累計は、ターン単位の条件カウンタ。
  hand_trashed_by_opp_this_turn: { boundaries: ['turn-end'], reset: 0, reason: 'opponent-effect hand trash total for the current turn' },
  // 非ディソナスペル使用履歴は、現在ターンの使用条件だけが参照する。
  non_dissona_spell_played_this_turn: { boundaries: ['turn-end'], reset: undefined, reason: 'non-Dissona spell history for the current turn' },
  // 相手カードをデッキへ移した累計は、ターン単位の条件カウンタ。
  opp_cards_moved_to_deck_this_turn: { boundaries: ['turn-end'], reset: 0, reason: 'opponent cards moved to deck during the current turn' },
  // 効果でダウンからアップした履歴は、現在ターンの条件だけが参照する。
  upped_from_down_this_turn: { boundaries: ['turn-end'], reset: undefined, reason: 'signi upped by effects during the current turn' },
  // パワーマイナス倍化は、付与されたターンだけ有効。
  double_power_minus_this_turn: { boundaries: ['turn-end'], reset: undefined, reason: 'power-minus multiplier granted for the current turn' },
  // ホログラフ公開置換は、付与されたターンだけ有効。
  holograph_reveal_replace_this_turn: { boundaries: ['turn-end'], reset: undefined, reason: 'holograph reveal replacement for the current turn' },
  // トラッシュ移動ロックの active 値は現在ターンだけで、次ターン予約は別フィールドに置く。
  lock_trash_move_this_turn: { boundaries: ['turn-end'], reset: undefined, reason: 'active trash-move lock; next-turn reservation is stored separately' },
  // ガード追加無色コストは、付与されたターンだけ有効。
  opp_guard_extra_colorless_this_turn: { boundaries: ['turn-end'], reset: undefined, reason: 'extra guard cost granted for the current turn' },
  // 手札以外から場に出た出自は、次の自ターン開始時に新しいターンの母集団へ切り替える。
  signi_played_from_non_hand_this_turn: { boundaries: ['turn-start'], reset: undefined, reason: 'non-hand play provenance starts fresh at the owner turn start' },
  // スペル打ち消し予約は次の対象スペルで消費し、未消費でも付与ターン終了で失効する。
  spell_negated_this_turn: { boundaries: ['turn-end', 'consume'], reset: undefined, reason: 'next eligible spell negation, expiring at turn end' },
  // 自シグニの【出】抑止は、付与されたターンだけ有効。
  suppress_signi_on_play_this_turn: { boundaries: ['turn-end'], reset: undefined, reason: 'own signi on-play suppression for the current turn' },
  // エナの無色・能力喪失は、付与された現在ターンだけ有効。
  energy_colorless_ability_loss_this_turn: { boundaries: ['turn-end'], reset: undefined, reason: 'energy color/ability override for the current turn' },
  // シグニ別ライフクラッシュ累計は、ターン終了時トリガーまで読んだ後に破棄する。
  life_crashed_by_signi_this_turn: { boundaries: ['turn-end'], reset: undefined, reason: 'per-signi life crash total for the current turn' },
  // ライフクラッシュ累計は終了時に last_turn へ写し、現在ターン分を破棄する。
  life_crashed_this_turn: { boundaries: ['turn-end'], reset: undefined, reason: 'life crash total copied to life_crashed_last_turn at the boundary' },
  // コイン支払い累計は、ターン単位の条件カウンタ。
  coins_paid_this_turn: { boundaries: ['turn-end'], reset: 0, reason: 'coin payments made during the current turn' },
  // アタックフェイズ離場履歴は終了時トリガーまで保持し、次のアタックフェイズ開始時に切り替える。
  signi_left_field_this_attack_phase: { boundaries: ['attack-phase-start'], reset: [], reason: 'signi leave history starts fresh at attack-phase start' },
  // 無料グロウは次のグロウで消費し、使わなくても付与ターン終了で失効する。
  free_grow_this_turn: { boundaries: ['turn-end', 'consume'], reset: undefined, reason: 'free-grow entitlement is consumed by grow or expires at turn end' },
  // リフレッシュ回数は新しいターンの開始時から数え直す。
  refresh_count_this_turn: { boundaries: ['turn-start'], reset: 0, reason: 'refresh count starts fresh at turn start' },
  // バニッシュされた枚数は、ターン単位のコスト軽減条件。
  signi_banished_this_turn: { boundaries: ['turn-end'], reset: undefined, reason: 'banished signi total for the current turn' },
  // 自分のデッキからエナへ置いた累計は、ターン単位の条件カウンタ。
  self_deck_to_energy_this_turn: { boundaries: ['turn-end'], reset: 0, reason: 'own deck-to-energy total for the current turn' },
} as const satisfies Record<ConventionTurnScopedField, TurnScopedSpec>;

/** 命名規約外だがターン限定であることを型コメント・setter・readerから確認したフィールド。 */
const IRREGULAR_TURN_SCOPED_STATE = {
  // 強制アタック本体は、付与されたターンのフェイズ進行だけが参照する。
  must_attack_signi: { boundaries: ['turn-end'], reset: undefined, reason: 'forced signi attack for the current turn' },
  // 感染限定は must_attack_signi の修飾子なので同じ期限で失効する。
  must_attack_infected_only: { boundaries: ['turn-end'], reset: undefined, reason: 'modifier of the current-turn forced attack flag' },
  // アシストルリグの攻撃許可は、付与されたターンだけ通常ルールを上書きする。
  assist_lrig_attack_min_level: { boundaries: ['turn-end'], reset: undefined, reason: 'assist-lrig attack permission for the current turn' },
  // エナゾーン外支払い数は「1ターンに3つまで」の当該ターン累計。
  turn_off_zone_energy_paid_count: { boundaries: ['turn-end'], reset: undefined, reason: 'off-zone energy payments counted per turn' },
  // 空ゾーン側面アタックの正面扱いは、付与されたターンだけ有効。
  side_attack_empty_zone_damage_class: { boundaries: ['turn-end'], reset: undefined, reason: 'side-attack empty-zone override for the current turn' },
  // 離場置換の選択は解決中に消費し、未消費の残骸もターンを跨がせない。
  leave_substitute_choices: { boundaries: ['turn-end'], reset: undefined, reason: 'unconsumed leave-replacement decisions must not cross turns' },
} as const satisfies Partial<Record<keyof PlayerState, TurnScopedSpec>>;

/** ターン限定フィールドの唯一の実行時レジストリ。各フィールドは上のどちらかに1回だけ現れる。 */
export const TURN_SCOPED_STATE_FIELDS = {
  ...CONVENTION_TURN_SCOPED_STATE,
  ...IRREGULAR_TURN_SCOPED_STATE,
} as const;

export type TurnScopedPlayerStateField = keyof typeof TURN_SCOPED_STATE_FIELDS;

function freshResetValue(value: TurnScopedResetValue): TurnScopedResetValue {
  return Array.isArray(value) ? [] : value;
}

function resetBoundary(state: PlayerState, boundary: Exclude<TurnScopedBoundary, 'consume'>): PlayerState {
  const next: PlayerState = { ...state };
  const writable = next as unknown as Record<string, unknown>;
  for (const [field, spec] of Object.entries(TURN_SCOPED_STATE_FIELDS)) {
    if (spec.boundaries.includes(boundary as never)) writable[field] = freshResetValue(spec.reset);
  }
  return next;
}

function consumeField(state: PlayerState, field: TurnScopedPlayerStateField): PlayerState {
  const spec = TURN_SCOPED_STATE_FIELDS[field];
  if (!(spec.boundaries as readonly TurnScopedBoundary[]).includes('consume')) {
    throw new Error(`${field} is not consumption-scoped`);
  }
  return { ...state, [field]: freshResetValue(spec.reset) };
}

/** 現在のグローバルターン終了時に、どちらの PlayerState に載った値でも同じ規約で失効させる。 */
export function clearTurnEndScopedState(state: PlayerState): PlayerState {
  const lifeCrashedLastTurn = state.life_crashed_this_turn ?? 0;
  const reset = resetBoundary(state, 'turn-end');
  // safety は戻り値の最終段に置く。呼び出し側の古い値を spread し直して復活させない。
  return { ...reset, life_crashed_last_turn: lifeCrashedLastTurn };
}

/** 次ターン開始時の履歴切替と、FREE_GROW_NEXT_TURN の予約→active 昇格を一括する。 */
export function activateTurnStartScopedState(state: PlayerState): PlayerState {
  const reset = resetBoundary(state, 'turn-start');
  return {
    ...reset,
    free_grow_this_turn: state.free_grow_next_turn ? true : undefined,
    free_grow_next_turn: undefined,
  };
}

/** ON_ATTACK_PHASE_START の収集より前に、当該フェイズの離場履歴を空にする。 */
export function clearAttackPhaseScopedState(state: PlayerState): PlayerState {
  return resetBoundary(state, 'attack-phase-start');
}

/** 無料グロウを実行した時点で権利を消費する。未消費でも clearTurnEndScopedState が安全に失効させる。 */
export function consumeFreeGrowThisTurn(state: PlayerState): PlayerState {
  return consumeField(state, 'free_grow_this_turn');
}

/** 対象スペルを打ち消した時点で予約を消費する。未消費でも clearTurnEndScopedState が安全に失効させる。 */
export function consumeSpellNegationThisTurn(state: PlayerState): PlayerState {
  return consumeField(state, 'spell_negated_this_turn');
}
