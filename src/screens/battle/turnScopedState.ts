import type { PlayerState } from '../../types';
import { advancePreventDamageWindows } from './battleUtils';
import { normalizeFieldGrants, optionalFieldGrants } from '../../utils/fieldGrants';

// 'turn-end' ＝いま終わるグローバルターンの終了時に、**両プレイヤー**の値を失効させる。
type TurnScopedBoundary = 'turn-end' | 'turn-start' | 'attack-phase-start' | 'main-phase-start' | 'consume';
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
  // アタックフェイズごとのドロー累計。追加アタックフェイズでも新しいフェイズ開始時に数え直す。
  cards_drawn_this_attack_phase: { boundaries: ['attack-phase-start'], reset: 0, reason: 'draw total starts fresh at each attack phase' },
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
  // 「代わりに〜、ターン終了時まで、この能力を失う」で自壊した効果（§6.4 O-10）は当該ターンだけ無効。
  lost_ability_effect_ids_this_turn: { boundaries: ['turn-end'], reset: undefined, reason: 'self-disabled replacement abilities, restored at the turn boundary' },
  // 「あなたの効果によってシグニのアタックは無効にならない」（§6.4 O-10 続き510）も当該ターンだけ。
  own_effects_cannot_negate_signi_attack_this_turn: { boundaries: ['turn-end'], reset: undefined, reason: 'self-negation immunity granted for the current turn' },
  // パワー－の倍率（「代わりに３倍－される」§6.4 O-10）も、付与されたターンだけ有効。
  power_minus_multipliers_this_turn: { boundaries: ['turn-end'], reset: undefined, reason: 'power-minus multiplier granted for the current turn' },
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
  // 「このターン、あなたのライフクロスはクラッシュされない」＝アーツ由来のクラッシュ防止宣言（§5.3 O-66）。
  // ⚠**【常】の宣言はここに載らない**（盤面から毎回読む）＝失効させるのはアーツ由来だけでよい。
  life_crash_preventions_this_turn: { boundaries: ['turn-end'], reset: undefined, reason: 'arts-declared life crash prevention lasting for the current turn' },
  // コイン支払い累計は、ターン単位の条件カウンタ。
  coins_paid_this_turn: { boundaries: ['turn-end'], reset: 0, reason: 'coin payments made during the current turn' },
  // 「それがこのターンでN回目である場合」（`WX05-042`・§6.4 O-11）の台帳。**両プレイヤーぶん**を
  // グローバルターン境界で空にする（自分のターンにダウンした数を次のターンへ持ち越さない）。
  signi_downed_this_turn: { boundaries: ['turn-end'], reset: [], reason: 'signi that became down during the current turn (nth-time conditions)' },
  // 「このアタックフェイズの間、無色のカードでエナコストを支払えない」（§6.4 O-10 続き512）。
  // ⚠**境界は `attack-phase-start` ではなく `turn-end`**＝この制限は**相手側の state** に載るのに、
  //   `clearAttackPhaseScopedState` はターンプレイヤー自身にしか適用されない（相手側に残り続ける）。
  //   `turn-end` は両プレイヤーを落とすので安全側。差分は「そのターンのアタックフェイズ後〜ターン終了」だけで、
  //   その間にエナ支払いが起きる経路は無い（アーツは main/attack、【ガード】はアタックフェイズ内）。
  cannot_pay_colorless_this_attack_phase: { boundaries: ['turn-end'], reset: undefined, reason: 'colorless payment ban; cleared for both players at the turn boundary' },
  // アタックフェイズ離場履歴は終了時トリガーまで保持し、次のアタックフェイズ開始時に切り替える。
  signi_left_field_this_attack_phase: { boundaries: ['attack-phase-start'], reset: [], reason: 'signi leave history starts fresh at attack-phase start' },
  // 無料グロウは次のグロウで消費し、使わなくても付与ターン終了で失効する。
  free_grow_this_turn: { boundaries: ['turn-end', 'consume'], reset: undefined, reason: 'free-grow entitlement is consumed by grow or expires at turn end' },
  // このターンにグロウしたか（§6.4 O-10 続き515）＝「このターンにグロウしていない場合」の判定材料。
  lrig_grew_this_turn: { boundaries: ['turn-end'], reset: undefined, reason: 'grow history for the current turn' },
  // CPU が能動使用した【起】の履歴は、そのターンの重複起動を止めるためだけのもの。
  cpu_activated_effect_ids_this_turn: { boundaries: ['turn-end'], reset: undefined, reason: 'CPU activated-ability history that prevents re-firing within the turn' },
  // CPU が使用したアーツ／スペルの履歴も、そのターンの選び直し（＝窓で止まる）を防ぐためだけのもの。
  cpu_used_card_nums_this_turn: { boundaries: ['turn-end'], reset: undefined, reason: 'CPU arts/spell use history that prevents re-selecting the same card within the turn' },
  // リフレッシュ回数は新しいターンの開始時から数え直す。
  refresh_count_this_turn: { boundaries: ['turn-start'], reset: 0, reason: 'refresh count starts fresh at turn start' },
  // バニッシュされた枚数は、ターン単位のコスト軽減条件。
  signi_banished_this_turn: { boundaries: ['turn-end'], reset: undefined, reason: 'banished signi total for the current turn' },
  // シグニが場から手札に戻った体数は、ターン単位の条件カウンタ（WXK02-040/065）。
  signi_returned_to_hand_count_this_turn: { boundaries: ['turn-end'], reset: 0, reason: 'signi returned to hand total for the current turn' },
  // 自デッキ→トラッシュの累計枚数は、ターン単位の条件カウンタ（WXDi-P03-065）。
  deck_to_trash_count_this_turn: { boundaries: ['turn-end'], reset: 0, reason: 'own deck-to-trash total for the current turn' },
  // 自分のデッキからエナへ置いた累計は、ターン単位の条件カウンタ。
  self_deck_to_energy_this_turn: { boundaries: ['turn-end'], reset: 0, reason: 'own deck-to-energy total for the current turn' },
  // 「このターン、対戦相手は〈条件〉のシグニでアタックできない」は、課されたターンだけ有効。
  signi_attack_bans_this_turn: { boundaries: ['turn-end'], reset: undefined, reason: 'attack bans imposed on the attacker for the current turn' },
  // 追加アタックフェイズのキューは、加えたターンの中で消化する（未消化でもターンを跨がせない）。
  extra_attack_phases_this_turn: { boundaries: ['turn-end'], reset: undefined, reason: 'extra attack phases queued for the current turn' },
  // 「宣言したカード名以外のアーツを使用できない」の whitelist は、課されたターンだけ有効（§6.4 O-3）。
  arts_name_whitelist_this_turn: { boundaries: ['turn-end'], reset: undefined, reason: 'declared-arts-name whitelist imposed for the current turn' },
} as const satisfies Record<ConventionTurnScopedField, TurnScopedSpec>;

/** 命名規約外だがターン限定であることを型コメント・setter・readerから確認したフィールド。 */
const IRREGULAR_TURN_SCOPED_STATE = {
  // ピース応答窓のフラグ（§6.4 O-10 続き518）＝窓を閉じる側で落とすのが正だが、
  // **万一の閉じ忘れでターンを跨いで「常時カットイン可」にならない**よう保険で登録する。
  team_piece_cutin_window: { boundaries: ['turn-end', 'consume'], reset: undefined, reason: 'piece cut-in response window; consumed when the window closes, expired here as a safety net' },
  // 強制アタック active は現在ターンだけ。次ターン分は must_attack_signi_next_turn に予約する。
  must_attack_signi: { boundaries: ['turn-end'], reset: undefined, reason: 'active forced-signi-attack flag; next-turn value is reserved separately' },
  // 「このターン使用禁止のカード名」は課されたグローバルターンだけ有効（§6.4 O-3 続き498 で登録）。
  // ⚠登録前は BattleScreen の turn-end で**ターンプレイヤー側だけ**手書きクリアしており、相手に課した分は
  //   「相手の次のターンが終わるまで」＝1ターン長く残っていた。次ターン予約は別フィールド。
  blocked_card_names: { boundaries: ['turn-end'], reset: [], reason: 'card-name use ban for the current turn; next-turn reservation is stored separately' },
  // 感染限定は must_attack_signi の修飾子なので同じ期限で失効する。
  must_attack_infected_only: { boundaries: ['turn-end'], reset: undefined, reason: 'modifier of the active forced-attack flag; same lifetime' },
  // 場全体キーワード active は現在のグローバルターンだけ。自/相手ターン予約は別フィールド。
  field_keyword_grants_active: { boundaries: ['turn-end'], reset: undefined, reason: 'active global-turn field keyword grants; reservations are stored separately' },
  // 統一場レベル grant active は現在のグローバルターンだけ。予約は別フィールド。
  field_grants_active: { boundaries: ['turn-end'], reset: undefined, reason: 'active global-turn field grants; reservations are stored separately' },
  // アシストルリグの攻撃許可は、付与されたターンだけ通常ルールを上書きする。
  assist_lrig_attack_min_level: { boundaries: ['turn-end'], reset: undefined, reason: 'assist-lrig attack permission for the current turn' },
  // エナゾーン外支払い数は「1ターンに3つまで」の当該ターン累計。
  turn_off_zone_energy_paid_count: { boundaries: ['turn-end'], reset: undefined, reason: 'off-zone energy payments counted per turn' },
  // 空ゾーン側面アタックの正面扱いは、付与されたターンだけ有効。
  side_attack_empty_zone_damage_class: { boundaries: ['turn-end'], reset: undefined, reason: 'side-attack empty-zone override for the current turn' },
  // 「ターン終了時、それを場から手札に戻す」の対象（§6.4 O-10 続き509）＝当該ターンで消費し切る。
  //   ⚠解決は `turnEndHandReturn.ts` が行い、**未消費の残骸**をここで落とす（両プレイヤー・全 turn-end 経路）。
  turn_end_return_to_hand: { boundaries: ['turn-end'], reset: undefined, reason: 'end-of-turn hand returns are consumed in the end phase; no carry-over' },
  // 🔴基本レベルの一時上書き（`SET_BASE_LEVEL{until:END_OF_TURN}`／`CHANGE_BASE_LEVEL` 系）も
  //   型コメントは「一時変更」なのに**失効地点が1つも無く永続していた**（§6.4 O-10 続き509 で発見。
  //   `signi_deploy_power_limit`／`negated_attacks` と同じクラス）。
  //   ⚠`CHANGE_BASE_LEVEL_UNTIL_NEXT_TURN` だけは原文が「次の自ターン終了まで」＝ここでは1ターン短くなるが、
  //     **無期限よりは近い**（2ターン軸が要るなら `SigniAttackBan.turnsRemaining` と同じ規約で足す）。
  attack_phase_level_overrides: { boundaries: ['turn-end'], reset: undefined, reason: 'temporary base-level overrides last until the end of the turn' },
  // 🔴宣言数字によるガード制限（`DECLARE_NUMBER`）も手書きクリアが turn-end の一部経路にしか無かった
  //   （§6.4 O-10 続き512 で登録）。⚠宣言するのはターンプレイヤー・読むのは防御側なので、
  //   経路によっては相手側に残り続ける。
  declared_guard_restrict_level: { boundaries: ['turn-end', 'consume'], reset: undefined, reason: 'declared guard-restriction level; consumed by deck-top comparisons or expires at turn end' },
  declared_guard_restrict_levels: { boundaries: ['turn-end'], reset: undefined, reason: 'same as declared_guard_restrict_level (multi-value form)' },
  // 離場置換の選択は解決中に消費し、未消費の残骸もターンを跨がせない。
  leave_substitute_choices: { boundaries: ['turn-end'], reset: undefined, reason: 'unconsumed leave-replacement decisions must not cross turns' },
  // 能力喪失 active は現在のグローバルターンだけ。次ターン分は abilities_removed_next_turn に予約する（§6.4 O-3）。
  // ⚠登録前は turn-end 4経路のうち2経路でしか手書きクリアされておらず、普通にターンを終えると次ターン以降も残っていた。
  abilities_removed: { boundaries: ['turn-end'], reset: [], reason: 'active ability loss for the current turn; next-turn value is reserved separately' },
  // 指定キーワードの喪失／再取得禁止も abilities_removed と同じ期限。
  keyword_abilities_removed: { boundaries: ['turn-end'], reset: undefined, reason: 'keyword-scoped ability loss; same lifetime as abilities_removed' },
  // 🔴「このターン次にアタックしたとき無効にされる」＝型コメントに期間が書いてあるのに**失効地点が1つも
  //   無く永続していた**（§6.4 O-3 続き489 で発見。`signi_deploy_power_limit` と同じクラス）。
  //   消費は「そのカードがアタックしたとき」だけなので、**アタックしなければゲーム終了まで残る**＝
  //   `SPDi43-24-E2` のような防御札（相手は狙われたユニットでアタックしなければよい）で必ず踏む。
  negated_attacks: { boundaries: ['turn-end'], reset: undefined, reason: 'attack negations registered for the current turn; consumed on attack or expired here' },
  // 上の回避コスト（手札N枚捨て）は同じ寿命。
  negated_attacks_escape: { boundaries: ['turn-end'], reset: undefined, reason: 'escape cost of negated_attacks; same lifetime' },
  // 追加アタックフェイズ開始時の本文は、そのフェイズで消化する。未消化の残骸をターンを跨がせない。
  pending_extra_attack_phase_start_effects: { boundaries: ['turn-end'], reset: undefined, reason: 'extra attack phase start effects are consumed in that phase; no carry-over' },
  // 🔴ルリグの能力喪失（`OPP_LRIG_LOSE_ABILITY`／`SELF_LRIG_LOSE_ABILITY`）も型コメントは「このターン」なのに
  //   **失効地点が手書き2箇所しか無かった**（§6.4 O-10 続き509 で発見。`negated_attacks` と同じクラス）。
  //   しかも手書きは**自分側の turn-end 経路だけ**で、`OPP_LRIG_LOSE_ABILITY` が書き込むのは**相手側**＝
  //   相手ターンを跨いだ経路では**ゲーム終了までルリグが能力を失ったまま**になりうる。
  lrig_abilities_disabled: { boundaries: ['turn-end'], reset: undefined, reason: 'lrig ability loss for the current turn; both players expire at the boundary' },
  // キーの能力喪失（§6.4 O-16(b)）も「このターン」限定。⚠登録前は BattleScreen の turn-end 4経路のうち
  //   2経路でしか手書きクリアされておらず、普通にターンを終えるとキー能力が**永久に**戻らなかった。
  keys_abilities_disabled: { boundaries: ['turn-end'], reset: undefined, reason: 'all-keys ability loss for the current turn' },
  // 「次のあなたのメインフェイズまで」の基本リミット上書き（§6.4 O-3 続き492・`WXK01-002-E2`）。
  // ⚠**ターン終了では消えない**＝相手のターンを丸ごと跨ぐのが原文どおり。失効は main-phase-start の1点。
  lrig_base_limit_override: { boundaries: ['main-phase-start'], reset: undefined, reason: 'base lrig limit override lasting until the owner next enters MAIN' },
  // 同じ期間のドローフェイズ置換（次のドローフェイズは次のメインフェイズより前なので必ず1回使える）。
  draw_phase_replacement: { boundaries: ['main-phase-start'], reset: undefined, reason: 'draw-phase replacement lasting until the owner next enters MAIN' },
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

/**
 * 「このターンと次のターンの間」の配置禁止をグローバルターン終了ごとに1つ減らす（§6.4 O-3）。
 * ⚠固定リセット値のレジストリ（`resetBoundary`）では表せない**カウントダウン**なので個別に扱う。
 */
function advanceSigniDeployBans(bans: PlayerState['signi_deploy_bans']): PlayerState['signi_deploy_bans'] {
  const next = (bans ?? [])
    .map(ban => ({ ...ban, turnsRemaining: ban.turnsRemaining - 1 }))
    .filter(ban => ban.turnsRemaining > 0);
  return next.length > 0 ? next : undefined;
}

/**
 * 「このターンと次のターンの間、対戦相手の効果によって〈ゾーン〉のカードは移動しない」を
 * グローバルターン終了ごとに1つ減らす（§6.4 O-3 続き493・`signi_deploy_bans` と同じ形）。
 * ⚠🔴旧 `prevent_opp_trash_from` は**失効地点が1つも無く永続していた**（`WXK10-083-E1`）。
 */
function advanceOppMoveImmunity(entries: PlayerState['opp_move_immunity']): PlayerState['opp_move_immunity'] {
  const next = (entries ?? [])
    .map(entry => ({ ...entry, turnsRemaining: entry.turnsRemaining - 1 }))
    .filter(entry => entry.turnsRemaining > 0);
  return next.length > 0 ? next : undefined;
}

/**
 * 「〈期間〉、あなたのセンタールリグは〈タイプ〉を追加で得る」をグローバルターン終了ごとに1つ減らす
 * （§6.4 O-3 続き498・上2つと同じ形）。⚠恒久版 `lrig_gained_types` はここでは触らない。
 */
function advanceGainedLrigTypes(
  entries: PlayerState['lrig_gained_types_timed'],
): PlayerState['lrig_gained_types_timed'] {
  const next = (entries ?? [])
    .map(entry => ({ ...entry, turnsRemaining: entry.turnsRemaining - 1 }))
    .filter(entry => entry.turnsRemaining > 0);
  return next.length > 0 ? next : undefined;
}

/**
 * 「次の対戦相手のターン（終了時まで）、〜シグニでアタックできない」を1つ減らす（§6.4 O-4 続き499）。
 * ⚠`turnsRemaining` を持たない ban は**そのターンだけ**＝ここで消える（従来どおり）。
 */
function advanceSigniAttackBans(
  bans: PlayerState['signi_attack_bans_this_turn'],
): PlayerState['signi_attack_bans_this_turn'] {
  // ⚠T3 トリップワイヤは全 turn-end フィールドへ**番兵値**（`true` 等）を入れて一括クリアを検査するので、
  //   配列以外が来る前提で守る（守らないと計器のほうが落ちる）。
  if (!Array.isArray(bans)) return undefined;
  const next = bans
    .filter(ban => (ban.turnsRemaining ?? 1) > 1)
    .map(ban => ({ ...ban, turnsRemaining: (ban.turnsRemaining ?? 1) - 1 }));
  return next.length > 0 ? next : undefined;
}

/** 現在のグローバルターン終了時に、どちらの PlayerState に載った値でも同じ規約で失効させる。 */
export function clearTurnEndScopedState(state: PlayerState): PlayerState {
  const lifeCrashedLastTurn = state.life_crashed_this_turn ?? 0;
  const reset = resetBoundary(state, 'turn-end');
  const nextOpponentTurnGrants = normalizeFieldGrants(
    state.field_grants_next_opp_turn,
    state.field_keyword_grants_next_opp_turn,
  );
  // safety は戻り値の最終段に置く。呼び出し側の古い値を spread し直して復活させない。
  return {
    ...reset,
    life_crashed_last_turn: lifeCrashedLastTurn,
    // §6.4 O-3: `abilities_removed`／`keyword_abilities_removed` の失効は上の登録（resetBoundary）が行う。
    // ⚠**旧実装は turn-end 4経路のうち2本（手札上限の捨て札を挟む confirmEndDiscard 側）でしか
    //   手書きクリアしておらず**、最も普通の経路（捨て札なしでターンが終わる）では「ターン終了時まで
    //   能力を失う」が**次のターン以降も残り続けていた**（`temp_power_mods` / `keyword_grants` は同じ
    //   literal で消していたのにこの2つだけ抜けていた）。登録したので T2 トリップワイヤが再発を止める。
    // ⚠`abilities_removed_next_turn`（「次のターンの間」の予約）はここで **`abilities_removed` へ昇格**する。
    //   予約は次のターン中だけ生き、そのターンの終了時に上の登録が空へ戻す＝2スロット式の寿命になる。
    abilities_removed: state.abilities_removed_next_turn ?? [],
    abilities_removed_next_turn: undefined,
    // ⚠ルリグ側の能力喪失も同じ2スロット式（段2 第45バッチ・`RemoveAbilitiesAction.alsoCenterLrig`）。
    //   `lrig_abilities_disabled` 自身の失効は上の turn-end 登録が行う＝ここは予約の昇格だけ。
    lrig_abilities_disabled: state.lrig_abilities_disabled_next_turn ?? undefined,
    lrig_abilities_disabled_next_turn: undefined,
    // unsuffixed entries were active for the turn that just ended. Only explicit
    // NEXT_TURN reservations cross the boundary; turn start removes the suffix.
    blocked_actions: (state.blocked_actions ?? []).filter(actionId => actionId.endsWith(':NEXT_TURN')),
    field_grants_active: optionalFieldGrants(nextOpponentTurnGrants),
    field_grants_next_opp_turn: undefined,
    field_keyword_grants_active: undefined,
    field_keyword_grants_next_opp_turn: undefined,
    prevent_damage_windows: advancePreventDamageWindows(state.prevent_damage_windows),
    // ⚠パワー配置制限（旧 `signi_deploy_power_limit`）もここへ統合した＝原文は「このターンと次のターン」なのに
    //   **どこでもクリアされておらず永続していた**（§6.4 O-3 続き487 で発見）。
    signi_deploy_bans: advanceSigniDeployBans(state.signi_deploy_bans),
    // ⚠**移動不可の期間つき予約もここでしか減らない**（旧 `prevent_opp_trash_from` は永続していた）。
    opp_move_immunity: advanceOppMoveImmunity(state.opp_move_immunity),
    // ⚠**期間つきで得たルリグタイプもここでしか減らない**（§6.4 O-3 続き498＝上2つと同じ規約）。
    lrig_gained_types_timed: advanceGainedLrigTypes(state.lrig_gained_types_timed),
    // ⚠アタック禁止も**期間つきの分だけ**持ち越す（§6.4 O-4 続き499）。
    //   レジストリの一括リセットは「そのターンだけ」の分を消す役割なので、ここで復元する。
    signi_attack_bans_this_turn: advanceSigniAttackBans(state.signi_attack_bans_this_turn),
  };
}

/** 次の自分ターン開始時の履歴切替と、各予約→active 昇格を一括する。 */
export function activateTurnStartScopedState(state: PlayerState): PlayerState {
  const reset = resetBoundary(state, 'turn-start');
  const activeFieldGrants = normalizeFieldGrants(state.field_grants_active, state.field_keyword_grants_active);
  const nextTurnFieldGrants = normalizeFieldGrants(state.field_grants_next_turn, state.field_keyword_grants_next_turn);
  const activatedBlockedActions = (state.blocked_actions ?? []).map(actionId =>
    actionId.endsWith(':NEXT_TURN') ? actionId.slice(0, -':NEXT_TURN'.length) : actionId);
  return {
    ...reset,
    blocked_actions: activatedBlockedActions,
    // 「次の対戦相手のターンの間、〜のスペルを使用できない」の予約→active 昇格（§6.4 O-3・`PR-K046-E1`）。
    blocked_card_names: [...(state.blocked_card_names ?? []), ...(state.blocked_card_names_next_turn ?? [])],
    blocked_card_names_next_turn: undefined,
    // 「次のあなたのターン終了時、〜」の予約→active 昇格（§6.4 O-4）。
    // ⚠ここで昇格させないと `ON_TURN_END` が**予約したそのターン**で拾ってしまう。
    pending_own_turn_end_effects: [
      ...(state.pending_own_turn_end_effects ?? []),
      ...(state.pending_next_own_turn_end_effects ?? []),
    ].length > 0
      ? [...(state.pending_own_turn_end_effects ?? []), ...(state.pending_next_own_turn_end_effects ?? [])]
      : undefined,
    pending_next_own_turn_end_effects: undefined,
    free_grow_this_turn: state.free_grow_next_turn ? true : undefined,
    free_grow_next_turn: undefined,
    must_attack_signi: state.must_attack_signi_next_turn ? true : undefined,
    must_attack_signi_next_turn: undefined,
    must_attack_infected_only: state.must_attack_signi_next_turn
      ? (state.must_attack_infected_only_next_turn ?? false)
      : undefined,
    must_attack_infected_only_next_turn: undefined,
    field_grants_active: optionalFieldGrants([...activeFieldGrants, ...nextTurnFieldGrants]),
    field_grants_next_turn: undefined,
    field_keyword_grants_active: undefined,
    field_keyword_grants_next_turn: undefined,
  };
}

/** ON_ATTACK_PHASE_START の収集より前に、当該フェイズの離場履歴を空にする。 */
export function clearAttackPhaseScopedState(state: PlayerState): PlayerState {
  return resetBoundary(state, 'attack-phase-start');
}

/**
 * 「次のあなたのメインフェイズまで」（§6.4 O-3 続き492）の予約を、**そのプレイヤーがメインフェイズへ
 * 入る1点**で失効させる。`ON_MAIN_PHASE_START` の収集と同じ場所（人間 / CPU の2経路）で呼ぶ。
 *
 * 🔑**ターン境界（`clearTurnEndScopedState`）では消さない**＝原文は相手のターンを丸ごと跨ぐ。
 * 「期間つき」と書いたフィールドは失効地点を1つに固定する（続き487/489 で2回、失効地点が
 * 1つも無いフィールドが永続していた）。
 */
export function clearMainPhaseScopedState(state: PlayerState): PlayerState {
  const reset = resetBoundary(state, 'main-phase-start');
  const windows = (state.prevent_damage_windows ?? []).filter(w => w.expires !== 'MY_NEXT_MAIN_PHASE');
  return { ...reset, prevent_damage_windows: windows.length > 0 ? windows : undefined };
}

/** 無料グロウを実行した時点で権利を消費する。未消費でも clearTurnEndScopedState が安全に失効させる。 */
export function consumeFreeGrowThisTurn(state: PlayerState): PlayerState {
  return consumeField(state, 'free_grow_this_turn');
}

/** 対象スペルを打ち消した時点で予約を消費する。未消費でも clearTurnEndScopedState が安全に失効させる。 */
export function consumeSpellNegationThisTurn(state: PlayerState): PlayerState {
  return consumeField(state, 'spell_negated_this_turn');
}

/**
 * 宣言数字を**消費**する（§6.4 O-10・続き512）。
 * 「数字を宣言してデッキトップと比べる」型の効果は、比較し終えた時点で宣言値を捨てる＝
 * `declared_guard_restrict_level`（＝相手のガード制限）に残すと**原文にないガード制限が漏れる**。
 * ⚠**funnel の外で `declared_guard_restrict_level: undefined` を書かないこと**（T2 が検出する）。
 */
export function consumeDeclaredGuardRestrictLevel(state: PlayerState): PlayerState {
  return consumeField(state, 'declared_guard_restrict_level');
}

/**
 * ピース応答窓を**閉じる**（§6.4 O-10・続き518）。
 * ⚠**funnel の外で `team_piece_cutin_window: undefined` を書かないこと**（T2 が検出する）。
 *   窓の開閉は「開く＝フロー」「閉じる＝この1関数」に固定する＝閉じ忘れが1箇所に集まる。
 */
export function closeTeamPieceCutinWindow(state: PlayerState): PlayerState {
  return consumeField(state, 'team_piece_cutin_window');
}
