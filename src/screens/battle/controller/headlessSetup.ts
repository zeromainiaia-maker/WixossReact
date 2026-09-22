import { shuffle } from '../../../engine/rng';
import type { BattleStateRow, CardData, PlayerState } from '../../../types';
import type { DeckLrigRoles } from '../../../utils/deckLrigSetup';
import { CPU_PLAYER_ID, assignGuestInstanceIds, assignInstanceIds } from '../battleUtils';
import type { CpuDeckPlan } from '../cpuDeckPlan';
import type { CpuPolicy } from '../cpuPolicy';
import { buildLrigSetupState } from '../lrigSetup';
import { performCpuMulligan } from './performMulligan';

/**
 * 🆕**ヘッドレス対戦の開始盤面**（2026-09-22・CPU 観戦画面のために `scripts/headlessSelfPlay.ts` から移設）。
 *
 * ■ なぜ `src/` に置くか＝自己対戦（node）と**観戦画面（ブラウザ）が同じ組み立てを通る**ため。
 *   2つ目を画面側に書くと、観戦で見える対戦と自己対戦で測った対戦がズレる。
 * ⚠**中身は逐語移設**＝乱数の消費順（host → guest、各席はルリグ配置 → 山のシャッフル → マリガン）を変えない。
 *   変えると同じシードでも別の試合になり、過去の自己対戦の数字と比較できなくなる。
 * ⚠じゃんけん・ルリグ選択の段は踏まない（`global_phase: 'PLAYING'` から始める）＝`createHeadlessMatch` の前提。
 */

/** 開始盤面を組むのに要る「1つの山」。 */
export interface HeadlessDeck {
  lrigDeck: string[];
  mainDeck: string[];
  roles: DeckLrigRoles;
  plan: CpuDeckPlan;
}

/** 対戦開始時の1人ぶんの盤面（ルリグ配置 → マリガン）。マリガンのログも返す。 */
export function buildHeadlessSide(
  guest: boolean, deck: HeadlessDeck, cardMap: Map<string, CardData>, policy?: CpuPolicy,
): { state: PlayerState; logs: string[] } {
  const assign = guest ? assignGuestInstanceIds : assignInstanceIds;
  const lrigWithIds = assign(deck.lrigDeck);
  const mainWithIds = assign(shuffle([...deck.mainDeck]));
  const at = (n: string | null | undefined) => (n ? lrigWithIds[deck.lrigDeck.indexOf(n)] : null);
  return performCpuMulligan({
    state: buildLrigSetupState({
      lrigWithIds, mainWithIds, centerId: at(deck.roles.centerLrig)!,
      assistLId: at(deck.roles.assistLrigL), assistRId: at(deck.roles.assistLrigR), cardMap,
    }),
    cardMap, plan: deck.plan, policy,
  });
}

/**
 * 対戦開始の1行（`createHeadlessMatch` にそのまま渡せる形）。
 * ⚠**席ごとに山が違う**＝`host`／`guest` の順で組む（シャッフルの乱数の消費順もこの順）。
 * 🔴guest 席は必ず `CPU_PLAYER_ID`（`createHeadlessMatch` の前提）。
 */
export function buildHeadlessRow(p: {
  seats: { host: HeadlessDeck; guest: HeadlessDeck };
  hostId: string;
  /** 先攻の席。 */
  firstPlayerId: string;
  cardMap: Map<string, CardData>;
  policy?: { host: CpuPolicy; guest: CpuPolicy };
  roomId?: string;
}): { row: BattleStateRow; logs: string[] } {
  const { seats, hostId, firstPlayerId, cardMap, policy } = p;
  const host = buildHeadlessSide(false, seats.host, cardMap, policy?.host);
  const guest = buildHeadlessSide(true, seats.guest, cardMap, policy?.guest);
  const row = {
    room_id: p.roomId ?? 'headless', host_id: hostId, guest_id: CPU_PLAYER_ID,
    global_phase: 'PLAYING', setup_phase: null, turn_phase: 'UP', active_user_id: firstPlayerId, turn_count: 1,
    host_state: host.state, guest_state: guest.state,
    game_logs: [], updated_at: new Date().toISOString(),
    host_lrig_selected: seats.host.roles.centerLrig, guest_lrig_selected: seats.guest.roles.centerLrig,
    host_janken: null, guest_janken: null, host_mulligan_done: true, guest_mulligan_done: true,
    first_player_id: firstPlayerId, pending_spell: null, pending_effect: null, effect_stack: null,
    winner_id: null, host_end_ack: false, guest_end_ack: false,
  } as unknown as BattleStateRow;
  return { row, logs: [...host.logs, ...guest.logs] };
}
