import type { CardData, PlayerState, StackEntry } from '../../../types';
import type { CardEffect } from '../../../types/effects';
import {
  collectRevealedFromHandTriggers, collectHandDiscardTriggers, collectZoneMovedTriggers, collectDriveBecameTriggers,
  collectBeatBecameTriggers, collectSelfEventTriggers, collectSelfRevealFromHandTriggers, collectOppOwnedSpellUseTriggers, type TrigCtx,
} from '../../../engine/triggerCollect';

/** 「〜した直後」の印（その印を持つ席の state に engine が積む）。 */
export const JUST_FLAG_KEYS = [
  'hand_revealed_just', 'hand_discarded_just', 'zone_moved_just', 'drive_became_just', 'beat_became_just',
  'opp_virus_placed_just', 'opp_virus_removed_just', 'opp_spell_used_just',
] as const;

export function hasJustFlags(st: PlayerState): boolean {
  return JUST_FLAG_KEYS.some(k => { const v = st[k] as unknown; return Array.isArray(v) ? v.length > 0 : !!v; });
}

/**
 * 🆕2026-10-21＝**1つの席の「〜した直後」の印をすべて処理する**（手札の公開・効果による手札捨て・ゾーン移動・ドライブ・【ビート】・
 * 相手の場のウィルスの増減・相手のスペルの使用）。収集は画面（`BattleScreen` の各 useEffect）と同じ engine の純関数。
 * 🔴なぜ要るか＝ヘッドレス（自己対戦・CPU観戦）には画面の見張りが無く、これらの【自】が一度も発動しなかった。
 * @returns 積む項目・その席の新しい state（印を消し《ターン1回》を記録）・相手の席に記録する《ターン1回》
 */
export function processSeatJustFlags(p: {
  trig: TrigCtx; st: PlayerState; op: PlayerState; id: string; opId: string;
  effectsMap: Map<string, CardEffect[]>; cardMap: Map<string, CardData>;
}): { entries: StackEntry[]; st: PlayerState; opUsedIds: string[] } {
  const { trig, st, op, id, opId } = p;
  const entries: StackEntry[] = [];
  const used: string[] = [];
  const opUsed: string[] = [];
  const revealed = st.hand_revealed_just ?? [];
  if (revealed.length > 0) {
    entries.push(...collectRevealedFromHandTriggers(trig, revealed, st, id, st.hand_revealed_just_source_card_num ?? undefined));
    // ON_SELF_REVEAL_FROM_HAND＝自分の効果で手札から公開したとき、場のシグニ自身の【自】（画面の見張りと同じ）
    const sr = collectSelfRevealFromHandTriggers(trig, st, id);
    entries.push(...sr.entries); used.push(...sr.usedOncePerTurnIds);
  }
  const discarded = st.hand_discarded_just ?? [];
  if (discarded.length > 0) {
    const r = collectHandDiscardTriggers(trig, discarded, st, id, false, op, opId, undefined,
      !!st.hand_discarded_just_by_opp, st.hand_discarded_just_cause_owner_id ?? undefined, st.hand_discarded_just_cause_card_num ?? undefined);
    entries.push(...r.entries); used.push(...r.usedLimitIds);
  }
  for (const n of st.zone_moved_just ?? []) {
    const r = collectZoneMovedTriggers(trig, n, st, op, id, opId);
    entries.push(...r.entries); used.push(...r.moverUsedIds); opUsed.push(...r.otherUsedIds);
  }
  for (const n of st.drive_became_just ?? []) {
    const r = collectDriveBecameTriggers(trig, n, st, op, id, opId);
    entries.push(...r.entries); used.push(...r.driverUsedIds); opUsed.push(...r.otherUsedIds);
  }
  for (const n of st.beat_became_just ?? []) {
    const r = collectBeatBecameTriggers(trig, n, st, id);
    entries.push(...r.entries); used.push(...r.usedIds);
  }
  const placed = !!st.opp_virus_placed_just, removed = !!st.opp_virus_removed_just;
  if (placed) { const r = collectSelfEventTriggers(trig, 'ON_OPP_VIRUS_PLACED', st, op, 'ウィルス配置時', id); entries.push(...r.entries); used.push(...r.usedOncePerTurnIds); }
  if (removed) { const r = collectSelfEventTriggers(trig, 'ON_OPP_VIRUS_REMOVED', st, op, 'ウィルス除去時', id); entries.push(...r.entries); used.push(...r.usedOncePerTurnIds); }
  if (placed || removed) { const r = collectSelfEventTriggers(trig, 'ON_OPP_VIRUS_CHANGED', st, op, 'ウィルス増減時', id); entries.push(...r.entries); used.push(...r.usedOncePerTurnIds); }
  for (const n of st.opp_spell_used_just ?? []) {
    const r = collectOppOwnedSpellUseTriggers(trig, n, st, op, id);
    entries.push(...r.entries); used.push(...r.usedIds);
  }
  const next: PlayerState = {
    ...st,
    hand_revealed_just: null, hand_revealed_just_source_card_num: null,
    hand_discarded_just: null, hand_discarded_just_by_opp: null,
    hand_discarded_just_cause_owner_id: null, hand_discarded_just_cause_card_num: null,
    zone_moved_just: null, drive_became_just: null, beat_became_just: null,
    opp_virus_placed_just: null, opp_virus_removed_just: null, opp_spell_used_just: null,
    ...(used.length > 0 ? { actions_done: [...(st.actions_done ?? []), ...used] } : {}),
  };
  return { entries, st: next, opUsedIds: opUsed };
}
