/**
 * 🆕**ヘッドレス自己対戦**（§5.7 `S-5d` 第3段・2026-09-19）＝**画面も DB も無しで CPU 同士を対戦させる**。
 *
 * 使い方＝`npx tsx scripts/headlessSelfPlay.ts [--games N] [--seed S] [--steps N] [--verbose]`
 *   （既定＝1戦・seed 1・1手の上限 4000。1戦 ≒ 300〜450手 ≒ 30〜40秒）。
 *
 * 🔑**なぜ要るか**＝`S-5` の目的は「**勝率で強さを測る**」こと（§5.7.2）。`S-6`（重みの自己調整）は
 *   この口が無いと1歩も進まない。⚠**強さの比較はまだしない**＝いまは「決着まで止まらずに回る」ことの確認器。
 *
 * ⚠**`idle` / `cap` は異常**＝どちらの席も動けない（対話に答えられない・待ち合わせが噛み合っていない）か、
 *   無限ループ。**既定では exit 1** で止める（`--allow-stall` で許す）。
 * ⚠**山は `VERIFY_DECK_MECH` と同じ構成**（`scripts/verifySetupDeck.mjs`）＝機構を広く踏む山。
 *   ⚠ここを変えると勝率の比較ができなくなるので、**山を変えるときは理由を BUGFIXES に書く**。
 */
import fs from 'fs';
import { join } from 'path';
import Papa from 'papaparse';
import type { BattleStateRow, CardData, PlayerState } from '../src/types';
import { setRngSeed, shuffle } from '../src/engine/rng';
import { CPU_PLAYER_ID, assignGuestInstanceIds, assignInstanceIds } from '../src/screens/battle/battleUtils';
import { createHeadlessMatch } from '../src/screens/battle/controller/headlessMatch';
import { buildLrigSetupState } from '../src/screens/battle/lrigSetup';
import { applyMulligan } from '../src/screens/battle/mulligan';

const argv = process.argv.slice(2);
const numArg = (name: string, dflt: number) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? Number(argv[i + 1]) : dflt;
};
const GAMES = numArg('--games', 1);
const SEED0 = numArg('--seed', 1);
const MAX_STEPS = numArg('--steps', 4000);
const VERBOSE = argv.includes('--verbose');
const ALLOW_STALL = argv.includes('--allow-stall');

// ── カードデータ（`goldenTest.ts` と同じ読み方）──
const root = process.cwd();
const allCards: CardData[] = [];
for (const f of [...Array.from({ length: 11 }, (_, i) => `CardData_Sheet${i + 1}.csv`), 'CardData_TK.csv']) {
  const p = join(root, 'public/data', f);
  if (!fs.existsSync(p)) continue;
  const { data } = Papa.parse<Record<string, string>>(fs.readFileSync(p, 'utf-8').replace(/^﻿/, ''), { header: true, skipEmptyLines: true });
  for (const r of data) if (r.CardNum?.trim()) allCards.push(r as unknown as CardData);
}

/** `VERIFY_DECK_MECH`（`scripts/verifySetupDeck.mjs`）と同じ山＝ガード・スペル・アーツ・アシスト・レゾナ・ライズが入る。 */
const DECK = {
  lrig_deck: ['WD03-005', 'WD03-004', 'WD03-003', 'WD03-002', 'WDK09-005', 'WXDi-D01-009', 'WDK14-005', 'WXDi-D01-006', 'WX21-011', 'WX12-017',
    'WDK02-001', 'WXK02-020', 'WXDi-P00-006'],
  main_deck: [
    ...Array(4).fill('WD01-017'),
    ...Array(2).fill('WX03-043'), ...Array(2).fill('WX01-085'),
    ...Array(2).fill('WX01-083'), ...Array(2).fill('WX02-036'),
    ...Array(2).fill('WXDi-P05-038'),
    ...Array(3).fill('WX05-062'), ...Array(2).fill('WX05-060'),
    ...Array(4).fill('WD03-013'), ...Array(4).fill('WD03-012'), ...Array(3).fill('WD03-010'),
    ...Array(4).fill('WX12-055'), ...Array(2).fill('WX12-054'),
    ...Array(2).fill('WX04-080'), ...Array(2).fill('WX04-077'),
  ],
};
const ROLES = { center: 'WD03-005', assistL: 'WDK09-005', assistR: 'WDK14-005' };
// ⚠**対戦に出るカードだけを渡す**＝全カード（約7,000枚）を渡すと材料の組み立てが1手ごとに重くなる（画面の `battleCardNums` と同じ絞り）。
const used = new Set([...DECK.main_deck, ...DECK.lrig_deck]);
const cards = allCards.filter(c => used.has(c.CardNum));
const cardMap = new Map(cards.map(c => [c.CardNum, c]));

const HOST_ID = 'headless-host';

/** 対戦開始時の1人ぶんの盤面（ルリグ配置 → マリガン無し → ライフクロス7枚）。 */
function buildSide(guest: boolean): PlayerState {
  const assign = guest ? assignGuestInstanceIds : assignInstanceIds;
  const lrigWithIds = assign(DECK.lrig_deck);
  const mainWithIds = assign(shuffle([...DECK.main_deck]));
  const at = (n: string) => lrigWithIds[DECK.lrig_deck.indexOf(n)];
  return applyMulligan(buildLrigSetupState({
    lrigWithIds, mainWithIds, centerId: at(ROLES.center),
    assistLId: at(ROLES.assistL), assistRId: at(ROLES.assistR), cardMap,
  }), []);
}

function buildRow(): BattleStateRow {
  return {
    room_id: 'headless', host_id: HOST_ID, guest_id: CPU_PLAYER_ID,
    global_phase: 'PLAYING', setup_phase: null, turn_phase: 'UP', active_user_id: HOST_ID, turn_count: 1,
    host_state: buildSide(false), guest_state: buildSide(true),
    game_logs: [], updated_at: new Date().toISOString(),
    host_lrig_selected: ROLES.center, guest_lrig_selected: ROLES.center,
    host_janken: null, guest_janken: null, host_mulligan_done: true, guest_mulligan_done: true,
    first_player_id: HOST_ID, pending_spell: null, pending_effect: null, effect_stack: null,
    winner_id: null, host_end_ack: false, guest_end_ack: false,
  } as unknown as BattleStateRow;
}

const results: { seed: number; reason: string; steps: number; turns: number; winner: string; ms: number }[] = [];
for (let g = 0; g < GAMES; g++) {
  const seed = SEED0 + g;
  setRngSeed(seed);
  const m = createHeadlessMatch(buildRow(), { cards });
  const t0 = Date.now();
  const res = await m.run(MAX_STEPS);
  const r = m.row();
  const winner = r.winner_id === CPU_PLAYER_ID ? 'guest' : r.winner_id === HOST_ID ? 'host' : '-';
  results.push({ seed, reason: res.reason, steps: res.steps, turns: r.turn_count, winner, ms: Date.now() - t0 });
  if (VERBOSE) console.log(m.logs.join('\n'));
  console.log(`seed=${seed} ${res.reason} 手数=${res.steps} ターン=${r.turn_count} 勝者=${winner} ライフ=${r.host_state.life_cloth.length}/${r.guest_state.life_cloth.length} ${Date.now() - t0}ms`);
}

const stalled = results.filter(r => r.reason !== 'finished');
const wins = { host: results.filter(r => r.winner === 'host').length, guest: results.filter(r => r.winner === 'guest').length };
console.log(`\n${GAMES}戦＝決着 ${results.length - stalled.length} / 止まった ${stalled.length}｜勝敗 host ${wins.host} - ${wins.guest} guest｜平均ターン ${(results.reduce((a, r) => a + r.turns, 0) / results.length).toFixed(1)}`);
if (stalled.length > 0 && !ALLOW_STALL) {
  console.log(`🔴止まった対戦がある（${stalled.map(r => `seed=${r.seed} ${r.reason} T${r.turns}`).join(' / ')}）＝どちらの席も動けないか無限ループ`);
  process.exit(1);
}
