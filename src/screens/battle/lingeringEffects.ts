/**
 * **発動中の効果欄**（2026-10-23 ユーザー要望）＝「付与効果など、パワー増減と異なり盤面に残らないので確認しづらい
 *   （『アタックできない』など）。何のカードがどんな効果でどの対象に発動して効果が残っているのかを確認できるようにしたい。
 *   ターン終了時までなどで効果が消えたらそこから消える」。
 *
 * ■ 仕組み＝**記録は「解決の前後で増えた状態」、消えたかどうかは「その状態がまだ残っているか」**。
 *   - 盤面の書き込みは全部 `reduceBattle` を通る＝そこで前後の `PlayerState` を比べ、
 *     **効果が残す種類のキー**（`isLingeringKey`）に増えた値（葉＝`leavesOf`）を、いま解決中の効果に結びつけて
 *     その側の `lingering_notes` に積む（`annotateLingeringNotes`）。
 *   - 🔑**失効の判定を自前で持たない**＝ターン終了・次のターン・場を離れた…の消え方は engine の規則が既に持っている。
 *     ここは「記録した葉がまだその状態に残っているか」だけを見る（`isNoteAlive`）ので、**engine の失効と必ず一致する**。
 * ■ 解決中の効果＝action が明示した `source` ＞ `pending_effect`（対話の再開）＞ スタックの先頭 ＞ `pending_spell`。
 *   ⚠どれも無い書き込み（フェイズ進行のターン開始時の予約の昇格など）は、**同じ葉を持っていた記録が消えた**ときだけ
 *     その発動元を引き継ぐ（`field_grants_next_turn` → `field_grants_active`）。引き継げなければ記録しない
 *     （発動元の分からない行を出さない）。
 * ■ 席は相対で持つ（`sourceIsSelf`）＝席を入れ替えて突き合わせる自己対戦（`MIRROR`）で割れない。
 * ⚠パワーの増減は盤面に出るので数えない（ユーザー指示）。
 */
import type { BattleStateRow, PlayerState } from '../../types';

/** 発動中の効果の1件。 */
export interface LingeringNote {
  /** 状態のキー（例 `signi_attack_bans_this_turn`）。 */
  key: string;
  /** そのキーに増えた葉（`leavesOf` の文字列）。1つでも残っていれば効果は残っている。 */
  leaves: string[];
  /** 発動元のカード（個体番号つき）。 */
  sourceCardNum: string;
  sourceEffectId?: string;
  /** 発動元の持ち主がこの状態の持ち主か。 */
  sourceIsSelf: boolean;
  /** 記録した時点での期限の目安（キーの名前から）。予約の昇格で引き継いだら「ターン終了時まで」。 */
  expiry?: string;
  /** 予約（次のターン）から昇格した記録か＝効果の `duration` より `expiry` を優先する。 */
  promoted?: boolean;
}

/** action が明示する発動元（スタック解決・カットインなど、盤面から読めない経路）。 */
export interface LingeringSource {
  playerId: string;
  cardNum: string;
  effectId?: string;
}

/** 1つの状態に積む上限（古いものから捨てる）。 */
const NOTE_CAP = 40;

/**
 * 効果が残すキーか。🔑**名前の規約で決める**＝新しいキーを足しても自動で入る。
 * ⚠除くもの＝置き場・数・履歴・処理中の一時値・パワー（盤面に出る）・この欄自身。
 */
const LINGERING_PATTERN = /grant|ban(s)?_|_bans?$|block|whitelist|removed|prevent|redirect|override|modifier|cost_(up|plus|reduction|replacement)|immun|lock_|restrict|limit|must_attack|negate|suppress|double|replace|alias|disabled|gate|cap$|delayed_triggers|pending_next_|pending_own_turn_end|turn_end_(return|field_trash|energy_trash|draw|mill|facedown)|windows|_until_|free_grow|extra_turn|skip_next_turn|no_grow|level_mods|level_override|extra_colors|gained_types|cannot_|declared_|identity|treated_as|uncounterable|wild_cost|dissona_only|usable|substitutes|guard_extra|guard_alt|guard_restrict|hand_signi_guard|optional_discard_guard|lrig_attack_while_down|attack_not_negated|ability_gain_blocked|effects_lost|all_cont_effects_negated|negate_opp_attacks|prevent_defeat|player_keywords|zone_blocks|crash_to_trash|life_burst_double|refresh_replaced|draw_phase_replacement|damage_replace|life_crash_(replacements|preventions)|story_overrides|card_class_overrides|power0_banish|banish_to_trash_by_self|lrig_opp_act_cost|attack_phase_power_down|lrig_limit_mod|key_place_limit|multi_acce_limit|signi_attack_once_limit|deck_signi_level_override|power_minus_multipliers|activate_cost_zero/;
const NOT_LINGERING_PATTERN = /^last_|_count|count_|_just|^pending_(crash|lrig_attack|signi_battle|effect|flip|banish_sub|life_crash|facedown|second_main|opponent_attack|prioke|pridi|exile)|^cpu_|^turn_(arts|pieces|hand|signi|plant|trigger)|actions_done|_used|_paid|^signi_attack_cost|field_trash_costs|^crash_|_cause|deck_to_trash|energy_placed|upped_from|_this_game$|^lingering_notes$|power_mods|^field_power_mods$|^temp_power_mods$|choice$|_choices$|^taken_choice_keys$|_remaining$|^lrig_has_attacked$|_left_field|_banished_this_turn$|_downed_this_turn$|_returned_to_hand|_moved_to_deck|_to_energy_this_turn$|_trashed_by_opp|_drawn_|_crashed_|checked_life_order|_played_|_placed_|replayed|^attacked_signi_ids$|^lrig_grew_this_turn$|^material_used_targets$|^end_turn_effects_resolved$|^spell_negated_this_turn$|^non_dissona_spell_played_this_turn$|^is_|^bet_coins|^cancel_current|^coin_abilities_used|_source$|_source_card_num$|^lrig_activation_count$|^subscriber_count$/;

/** 規約から外れる名前（目で仕分けた・2026-10-23）。 */
const EXTRA_LINGERING = new Set([
  'crash_to_trash_instead', 'crash_to_trash_ends_this_attack', 'crash_to_trash_next_crash_only',
  'energy_colorless_ability_loss_this_turn', 'assist_lrig_attack_min_level', 'side_attack_empty_zone_damage_class',
  'awakened_signi', 'next_assist_grow_mods', 'signi_deploy_count_limit', 'signi_deploy_count_limit_next_turn',
  'reveal_count_plus_one_this_turn', 'reduce_next_on_play_cost', 'lost_ability_effect_ids_this_turn',
  'game_main_draw', 'game_grow_draw', 'game_first_grow_energy_charge', 'game_hand_size_bonus', 'game_energy_phase_draw',
  'game_energy_phase_charge', 'game_no_coin_gain', 'game_opp_extra_guard_hand_or_colorless', 'game_turn_end_trash_to_hand',
  'game_guard_barrier_act', 'coin_ability_extra_game_uses', 'extra_attack_phases_this_turn',
  'pending_extra_attack_phase_start_effects', 'turn_end_mill_count', 'turn_end_draw_count',
  'pending_opponent_attack_facedown_returns', 'pending_second_main_facedown_returns', 'opp_signi_energy_to_deck_bottom',
  'lrig_upkeep_condition',
]);
const EXTRA_NOT_LINGERING = new Set([
  'declared_number', 'declared_card_name', 'declared_class', 'declared_colors', 'declared_color',
  'pending_lrig_limit_mod', 'trap_removed_zones', 'negated_attacks', 'negated_attacks_escape',
]);

export function isLingeringKey(key: string): boolean {
  if (EXTRA_LINGERING.has(key)) return true;
  if (EXTRA_NOT_LINGERING.has(key)) return false;
  return LINGERING_PATTERN.test(key) && !NOT_LINGERING_PATTERN.test(key);
}

/**
 * 値を「葉」の文字列の集合にする。配列は集合として見る（添字を経路に入れない）。
 * ⚠オブジェクトの配列は要素丸ごとを1つの葉にする（中を割ると、別の要素と同じ値の葉が「増えていない」に見える）。
 * ⚠偽の値（`false`・`0`・空）は葉にしない＝「無い」と同じ。
 */
export function leavesOf(value: unknown, path = ''): string[] {
  if (value === undefined || value === null || value === false || value === 0 || value === '') return [];
  if (Array.isArray(value)) {
    return value.flatMap(el => (el !== null && typeof el === 'object' && !Array.isArray(el))
      ? [`${path}[]=${JSON.stringify(el)}`]
      // ⚠配列の中の数は 0 も値（ゾーン番号の 0＝`signi_gate_zones: [0]`）。偽として捨てるのは要素の外側だけ。
      : (el === 0 ? [`${path}[]=0`] : leavesOf(el, `${path}[]`)));
  }
  if (typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>).flatMap(([k, v]) => leavesOf(v, `${path}.${k}`));
  }
  return [`${path}=${JSON.stringify(value)}`];
}

const keyLeaves = (state: PlayerState | undefined, key: string): Set<string> =>
  new Set(leavesOf((state as unknown as Record<string, unknown> | undefined)?.[key]));

/** 記録した効果がまだ残っているか（葉が1つでもその状態に残っていれば残っている）。 */
export function isNoteAlive(state: PlayerState, note: LingeringNote): boolean {
  const now = keyLeaves(state, note.key);
  return note.leaves.some(l => now.has(l));
}

/** いま残っている記録（表示用）。 */
export function liveLingeringNotes(state: PlayerState | undefined): LingeringNote[] {
  if (!state) return [];
  return (state.lingering_notes ?? []).filter(n => isNoteAlive(state, n));
}

/** 盤面から読める「いま解決中の効果」。 */
export function currentLingeringSource(bs: BattleStateRow): LingeringSource | undefined {
  const pe = bs.pending_effect;
  if (pe?.sourceCardNum) return { playerId: pe.sourcePlayerId, cardNum: pe.sourceCardNum, effectId: pe.effectId };
  const head = bs.effect_stack?.queue?.[0];
  if (head?.cardNum) return { playerId: head.playerId, cardNum: head.cardNum, effectId: head.effectId };
  const ps = bs.pending_spell;
  if (ps?.card_num) return { playerId: ps.caster_id, cardNum: ps.card_num };
  return undefined;
}

/** 1つの状態の前後を比べて記録を更新する（純関数）。 */
export function updateLingeringNotes(
  before: PlayerState | undefined, after: PlayerState, ownerId: string, source: LingeringSource | undefined,
  /** もう一方の状態で今回消えた記録（予約の昇格で発動元を引き継ぐ先）。 */
  inheritFrom: LingeringNote[] = [],
): { state: PlayerState; dropped: LingeringNote[] } {
  const prevNotes = after.lingering_notes ?? before?.lingering_notes ?? [];
  const kept: LingeringNote[] = [];
  const dropped: LingeringNote[] = [];
  for (const n of prevNotes) (isNoteAlive(after, n) ? kept : dropped).push(n);
  const added: LingeringNote[] = [];
  const keys = new Set([...Object.keys(after), ...Object.keys(before ?? {})].filter(isLingeringKey));
  for (const key of keys) {
    const was = keyLeaves(before, key);
    const fresh = [...keyLeaves(after, key)].filter(l => !was.has(l));
    if (fresh.length === 0) continue;
    // 既に記録済みの葉（同じ効果の続きの書き込み）は数えない。
    const recorded = new Set(kept.filter(n => n.key === key).flatMap(n => n.leaves));
    const leaves = fresh.filter(l => !recorded.has(l));
    if (leaves.length === 0) continue;
    if (source) {
      const expiry = keyExpiryLabel(key);
      added.push({ key, leaves, sourceCardNum: source.cardNum, ...(source.effectId ? { sourceEffectId: source.effectId } : {}), sourceIsSelf: source.playerId === ownerId, ...(expiry ? { expiry } : {}) });
      continue;
    }
    // 発動元が無い＝予約の昇格など。同じ葉を持っていた記録が消えていれば引き継ぐ。
    const set = new Set(leaves);
    const heir = [...dropped, ...inheritFrom].find(n => n.leaves.some(l => set.has(l)));
    // ⚠「次のターン」の予約が昇格した＝そのターンの間だけ効く。
    if (heir) added.push({ ...heir, key, leaves, ...(/_next_(opp_)?turn$/.test(heir.key) ? { expiry: 'ターン終了時まで', promoted: true } : {}) });
  }
  if (added.length === 0 && dropped.length === 0) return { state: after, dropped };
  const notes = [...kept, ...added].slice(-NOTE_CAP);
  return { state: { ...after, lingering_notes: notes.length > 0 ? notes : undefined }, dropped };
}

/**
 * `reduceBattle` のパッチに記録を書き足す。⚠状態を書かないパッチは素通し。
 */
export function annotateLingeringNotes(
  bs: BattleStateRow, patch: Partial<BattleStateRow>, explicit?: LingeringSource,
): Partial<BattleStateRow> {
  if (!patch.host_state && !patch.guest_state) return patch;
  const source = explicit ?? currentLingeringSource(bs);
  const out = { ...patch };
  let droppedHost: LingeringNote[] = [];
  if (patch.host_state) {
    const r = updateLingeringNotes(bs.host_state, patch.host_state, bs.host_id, source);
    out.host_state = r.state; droppedHost = r.dropped;
  }
  if (patch.guest_state) {
    const r = updateLingeringNotes(bs.guest_state, patch.guest_state, bs.guest_id, source, droppedHost);
    out.guest_state = r.state;
  }
  return out;
}

/**
 * 葉に出てくるシグニゾーンの添字（`{"zone":1}` の要素・`*_zones` の数の配列）。
 * ⚠「カードの対象」が無い効果（配置禁止・ゲート…）で、どのゾーンかを出すため。
 */
export function noteZoneIndexes(note: LingeringNote): number[] {
  const zones = new Set<number>();
  for (const l of note.leaves) {
    const obj = /"zone":([0-2])/.exec(l);
    if (obj) zones.add(Number(obj[1]));
    else if (/_zones$/.test(note.key)) { const m = /^\[\]=([0-2])$/.exec(l); if (m) zones.add(Number(m[1])); }
  }
  return [...zones].sort();
}

/** 葉に出てくるカードの個体番号（対象）。⚠カードかどうかは呼び出し側がカード表で確かめる。 */
export function noteTargetCandidates(note: LingeringNote): string[] {
  const ids = new Set<string>();
  for (const l of note.leaves) for (const m of l.matchAll(/[A-Za-z0-9]+(?:-[A-Za-z0-9]+)+(?:#\d+)?/g)) ids.add(m[0]);
  return [...ids];
}

/** 期限の目安（キーの名前から）。⚠効果の `duration` が読めればそちらを優先する（`durationLabel`）。 */
export function keyExpiryLabel(key: string): string | null {
  if (/_until_next_own_turn/.test(key)) return '次の自分のターン終了時まで';
  if (/_until_opp_turn|_next_opp_turn/.test(key)) return '次の相手のターン終了時まで';
  if (/_until_attack_phase/.test(key)) return 'アタックフェイズまで';
  if (/_this_attack(_phase)?$/.test(key)) return 'このアタックフェイズの間';
  if (/_next_turn$|_next_main_phase$/.test(key)) return '次のターン';
  if (/_this_turn$|^temp_/.test(key)) return 'ターン終了時まで';
  if (/^game_|_game$/.test(key)) return 'このゲームの間';
  return null;
}

const DURATION_LABEL: Record<string, string> = {
  UNTIL_END_OF_TURN: 'ターン終了時まで',
  THIS_TURN: 'ターン終了時まで',
  UNTIL_OPP_TURN_END: '次の相手のターン終了時まで',
  NEXT_OPP_TURN: '次の相手のターン',
  UNTIL_NEXT_OWN_TURN_END: '次の自分のターン終了時まで',
  UNTIL_OWN_ENERGY_PHASE_END: '次の自分のエナフェイズ終了時まで',
  NEXT_TURN: '次のターン',
  THIS_ATTACK_PHASE: 'このアタックフェイズの間',
  END_OF_ATTACK: 'このアタックの間',
  GAME: 'このゲームの間',
  PERMANENT: '場にいる間',
};

/** 効果の中で最初に見つかった期限（`INSTANT` 以外）。 */
export function durationLabel(action: unknown): string | null {
  const seen = new Set<unknown>();
  const walk = (v: unknown): string | null => {
    if (!v || typeof v !== 'object' || seen.has(v)) return null;
    seen.add(v);
    const d = (v as { duration?: unknown }).duration;
    if (typeof d === 'string' && DURATION_LABEL[d]) return DURATION_LABEL[d];
    for (const x of Object.values(v as Record<string, unknown>)) { const r = walk(x); if (r) return r; }
    return null;
  };
  return walk(action);
}
