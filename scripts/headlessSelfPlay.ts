/**
 * 🆕**ヘッドレス自己対戦**（§5.7 `S-5d` 第3段・2026-09-19）＝**画面も DB も無しで CPU 同士を対戦させる**。
 *
 * 使い方（① 疎通確認＝`npm run selfplay`）＝`npx tsx scripts/headlessSelfPlay.ts [--games N] [--seed S] [--steps N] [--verbose]`
 *   （既定＝1戦・seed 1・1手の上限 4000。1戦 ≒ 300〜450手 ≒ 30〜40秒）。**これが `npm run gates` に入っているゲート。**
 *
 * 使い方（② 強さの A/B＝`npm run selfplay:ab`・§5.7 `S-9`・2026-09-19）＝
 *   `npx tsx scripts/headlessSelfPlay.ts --a <ポリシー名> --b <ポリシー名> [--games N] [--seed S] [--jobs N]`
 *   - 🔴**`--games N` は「シードの本数」**＝**1シードにつき2戦回す**（席を入れ替える）＝実際の対戦数は **2N**。
 *   - ポリシー名は `src/screens/battle/cpuPolicy.ts` の `CPU_POLICIES`（`--a` を省くと `default`）。
 *   - **`--jobs N` で子プロセス並列**（既定1）。⚠1戦 ≒ 30〜40秒＝**直列だと 20シード＝40戦で約25分**。
 *   - 出力は勝率＋**Wilson 95% 信頼区間**（集計は `scripts/selfPlayStats.ts`＝golden が固定している）。
 *
 * 🔴**A/B で最初に確かめること**＝`--a default --b default` を回して**勝率がちょうど 50% に出る**こと。
 *   ⚠同じポリシー同士だと**2戦目は1戦目と同じ試合**（同じ山・同じ判断で席だけ反転）なので、
 *   **全組が1勝1敗・勝率ちょうど 50%** になるのが正しい。ここが崩れたら決定論か席入れ替えが壊れている。
 *
 * 🔴**何戦回せば「差あり」と言えるか**（Wilson 95%・2026-09-19 実測／1戦 ≒ 33秒・8並列で約7倍）
 *   | 真の勝率 | 要る対戦数 | シード数 | 直列 | 8並列 |
 *   |---|---|---|---|---|
 *   | 70% | 24 | 12 | 13分 | 2分 |
 *   | 65% | 44 | 22 | 24分 | 3分 |
 *   | 60% | 96 | 48 | 53分 | 8分 |
 *   | 55% | 370 | 185 | 204分 | 29分 |
 *   ⇒ **「ちょっと強くなった」を測るのは桁で高い**。小さい改善は**勝率ではなく別の指標**（`census:play` の踏破・
 *   ログの回数）で見て、勝率は「壊れていないこと」の確認に使うほうが安い。
 *
 * 🔑**なぜ要るか**＝`S-5` の目的は「**勝率で強さを測る**」こと（§5.7.2）。`S-6`（重みの自己調整）は
 *   この口が無いと1歩も進まない。
 *
 * ⚠**`idle` / `cap` は異常**＝どちらの席も動けない（対話に答えられない・待ち合わせが噛み合っていない）か、
 *   無限ループ。**既定では exit 1** で止める（`--allow-stall` で許す）。
 * ⚠**山は `VERIFY_DECK_MECH` と同じ構成**（`scripts/verifySetupDeck.mjs`）＝機構を広く踏む山。
 *   ⚠ここを変えると勝率の比較ができなくなるので、**山を変えるときは理由を BUGFIXES に書く**。
 *
 * 使い方（③ 候補数の実測＝§5.7 `S-15`・2026-09-20）＝`npx tsx scripts/headlessSelfPlay.ts --census-moves [--games N] [--seed S]`
 *   CPU が行動を選ぶ直前の盤面ごとに `listCpuMoves` の候補数・列挙の所要時間・**探索用の1手適用（engine だけの先読み）の所要時間**を集計する。
 *   🔴**同時に「CPU が実際に打った手は、その盤面の `listCpuMoves` に必ず出ている」を全数照合する**（外れが1件でも exit 1）＝
 *   列挙の道が1本であることの検査（golden `§5.7 S-15` がこのモードを短い手数で回す）。
 *   🔑**`S-16` のビーム幅はこの数字で決める**（測らずに幅を決めない＝登録票）。⚠適用時間は先読みの器がある種類
 *   （召喚・【起】・アーツ・スペル）だけ＝エナチャージ・グロウ・アシスト・レゾナ・ライズは engine 側の適用が未実装（`S-16`）。
 */
import { spawn } from 'child_process';
import fs from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import Papa from 'papaparse';
import type { BattleStateRow, CardData, PlayerState, TurnPhase } from '../src/types';
import { setRngSeed, shuffle } from '../src/engine/rng';
import { CPU_PLAYER_ID, assignGuestInstanceIds, assignInstanceIds } from '../src/screens/battle/battleUtils';
import { createHeadlessMatch } from '../src/screens/battle/controller/headlessMatch';
import { resolveCpuPolicy, type CpuPolicy } from '../src/screens/battle/cpuPolicy';
import { buildLrigSetupState } from '../src/screens/battle/lrigSetup';
import { applyMulligan } from '../src/screens/battle/mulligan';
import type { CpuTurnDeps } from '../src/screens/battle/controller/cpuTurn';
import { applyCpuMoveSim, describeCpuMove, type CpuMove, type CpuMoveCtx } from '../src/screens/battle/cpuMoves';
import { searchCpuMove, describeCpuLine, listSearchableCpuMoves } from '../src/screens/battle/cpuSearch';
import { formatAbReport, splitSeeds, summarizeAb, type AbGameResult } from './selfPlayStats';

const argv = process.argv.slice(2);
const numArg = (name: string, dflt: number) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? Number(argv[i + 1]) : dflt;
};
const strArg = (name: string, dflt: string) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? String(argv[i + 1]) : dflt;
};
const GAMES = numArg('--games', 1);
const SEED0 = numArg('--seed', 1);
const MAX_STEPS = numArg('--steps', 4000);
const VERBOSE = argv.includes('--verbose');
const ALLOW_STALL = argv.includes('--allow-stall');
// 🆕§5.7 `S-9`＝A/B モード（`--a` か `--b` があれば）。⚠**無ければ従来どおり**＝`npm run selfplay` のゲートは不変。
const AB_MODE = argv.includes('--a') || argv.includes('--b');
const A_NAME = strArg('--a', 'default');
const B_NAME = strArg('--b', 'default');
const JOBS = numArg('--jobs', 1);
/** 子プロセスとして呼ばれたか（結果を1行 JSON で返すだけ＝人が読む出力は出さない）。 */
const IS_WORKER = argv.includes('--worker');
const WORKER_SEEDS = strArg('--seeds', '').split(',').filter(Boolean).map(Number);
/**
 * 🆕**先攻をどちらの席にするか**（`host`／`guest`・既定 `host`）。
 * 🔑**用途＝「席の偏り」と「手番の偏り」の切り分け**（2026-09-19・`S-9` の初回計測で先攻の勝率 18.8% が出た）＝
 *   これを反転させて**偏りが席について回るのか手番について回るのか**を見る。
 *   ⚠席について回るなら `S-5` の**席の鏡（`mirrorSeats`）が疑わしい**。手番について回るなら単に後攻有利。
 */
const FIRST = strArg('--first', 'host') === 'guest' ? CPU_PLAYER_ID : 'HOST';
const CENSUS_MOVES = argv.includes('--census-moves');
/** 🆕§5.7 `S-16`＝`--census-moves` のときに探索も回して「いまの選択とどれだけ変わるか」を測る（既定 幅4・深さ4）。 */
const SEARCH_W = numArg('--search-width', 4);
const SEARCH_D = numArg('--search-depth', 4);
/**
 * 🆕§5.7 `S-21`＝**計測側の探索だけ別のポリシーで回す**（`--search-policy <名>`・省略時は対戦と同じ）。
 * 🔑**安い調整の口**＝対戦は `default` のままで、目的関数を差し替えたときに
 *   「打たない」がどう動くかを 2戦（約 80秒）で見る。⚠**これは勝率ではない**＝最終的な判断は `selfplay:ab`。
 */
const SEARCH_POLICY = argv.includes('--search-policy') ? resolveCpuPolicy(strArg('--search-policy', 'default')) : null;
/** 🆕`--census-moves` のときだけ両席の CPU に渡す観測フック。 */
let observeMoves: CpuTurnDeps['observeMoves'];
let observeChoice: CpuTurnDeps['observeChoice'];
/** 🆕§5.7 `S-16`＝打った手を計測側へも渡す口（`--census-moves` の探索との突き合わせ）。 */
let onChoice: ((mv: CpuMove, describe: string) => void) | undefined;

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
/** 先攻の席（`--first`）。⚠ターン1のドローが1枚になるのは `first_player_id` の側（`cpuTurn.ts` の `drawCount`）。 */
const firstId = () => (FIRST === 'HOST' ? HOST_ID : CPU_PLAYER_ID);

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
    global_phase: 'PLAYING', setup_phase: null, turn_phase: 'UP', active_user_id: firstId(), turn_count: 1,
    host_state: buildSide(false), guest_state: buildSide(true),
    game_logs: [], updated_at: new Date().toISOString(),
    host_lrig_selected: ROLES.center, guest_lrig_selected: ROLES.center,
    host_janken: null, guest_janken: null, host_mulligan_done: true, guest_mulligan_done: true,
    first_player_id: firstId(), pending_spell: null, pending_effect: null, effect_stack: null,
    winner_id: null, host_end_ack: false, guest_end_ack: false,
  } as unknown as BattleStateRow;
}

interface GameOutcome { seed: number; reason: string; steps: number; turns: number; winner: string; ms: number; hostLife: number; guestLife: number }

/**
 * 🆕§5.7 `S-15`＝**「CPU が実際に打った手は、その盤面の `listCpuMoves` に必ず出ている」の全数照合**。
 * 🔴外れが1件でもあれば失敗＝列挙（探索が使う道）と本番の選択（`cpuTurnAction`）がズレた＝**探索では出ない手を本番が打つ**。
 * ⚠`observeMoves` は選ぶ直前（と、同じ呼び出しで召喚した直後）の盤面で呼ばれ、`observeChoice` はその盤面で選んだ手。
 */
function installMoveCheck() {
  let lastListed: { phase: string; set: Set<string> } | null = null;
  let checked = 0;
  const misses: string[] = [];
  observeChoice = mv => {
    checked++;
    const d = describeCpuMove(mv);
    if (!lastListed?.set.has(d)) misses.push(`${lastListed?.phase ?? '?'}: ${d}（列挙＝${[...(lastListed?.set ?? [])].join(' ') || '空'}）`);
    onChoice?.(mv, d);
  };
  const onMoves: NonNullable<CpuTurnDeps['observeMoves']> = ({ phase, moves }) => {
    lastListed = { phase, set: new Set(moves.map(describeCpuMove)) };
  };
  observeMoves = onMoves;
  return {
    onMoves,
    report: () => {
      // ⚠文言は golden `§5.7 S-5d 第3段` の契約（`打った手の照合 N手｜列挙に無かった手 M`）。
      console.log(`打った手の照合 ${checked}手｜列挙に無かった手 ${misses.length}`);
      for (const x of misses.slice(0, 20)) console.log(`  🔴${x}`);
    },
    failed: () => misses.length > 0 || checked === 0,
  };
}

/**
 * 1戦。⚠**`setRngSeed` → `buildRow()` の順は変えない**＝山のシャッフルはこの乱数列を消費するので、
 * 同じシードなら**必ず同じ山**になる（席を入れ替えた2戦目が同じ山で回るのはこのため）。
 */
async function playOne(seed: number, policy?: { host: CpuPolicy; guest: CpuPolicy }): Promise<GameOutcome> {
  setRngSeed(seed);
  const m = createHeadlessMatch(buildRow(), { cards, policy, observeMoves, observeChoice });
  const t0 = Date.now();
  const res = await m.run(MAX_STEPS);
  const r = m.row();
  const winner = r.winner_id === CPU_PLAYER_ID ? 'guest' : r.winner_id === HOST_ID ? 'host' : '-';
  if (VERBOSE) console.log(m.logs.join('\n'));
  return {
    seed, reason: res.reason, steps: res.steps, turns: r.turn_count, winner,
    ms: Date.now() - t0, hostLife: r.host_state.life_cloth.length, guestLife: r.guest_state.life_cloth.length,
  };
}

/**
 * 1シードぶんの **2戦**（席を入れ替える）。
 * 🔴**ここが `S-9` ②の本体**＝1戦目 A=host（先攻）／2戦目 A=guest（後攻）。**片方だけで測らない。**
 */
async function playPair(seed: number, a: CpuPolicy, b: CpuPolicy): Promise<AbGameResult[]> {
  const out: AbGameResult[] = [];
  for (const swapped of [false, true]) {
    const g = await playOne(seed, swapped ? { host: b, guest: a } : { host: a, guest: b });
    const aSeat = swapped ? 'guest' : 'host';
    out.push({
      seed, swapped, reason: g.reason, steps: g.steps, turns: g.turns, ms: g.ms,
      winner: g.winner === '-' ? null : g.winner === aSeat ? 'A' : 'B',
    });
  }
  return out;
}

/** 子プロセスを1本起こして、そのシード群の結果を受け取る。 */
function runWorker(seeds: number[]): Promise<AbGameResult[]> {
  const self = fileURLToPath(import.meta.url);
  const args = ['--import', 'tsx', self, '--worker', '--a', A_NAME, '--b', B_NAME,
    '--steps', String(MAX_STEPS), '--first', FIRST === 'HOST' ? 'host' : 'guest', '--seeds', seeds.join(',')];
  return new Promise((resolve, reject) => {
    const ch = spawn(process.execPath, args, { cwd: process.cwd(), stdio: ['ignore', 'pipe', 'inherit'] });
    let buf = '';
    ch.stdout.on('data', d => { buf += String(d); });
    ch.on('error', reject);
    ch.on('close', code => {
      // ⚠**行の先頭マーカーで拾う**＝子の stdout に他の出力が混ざっても壊れない。
      const rows = buf.split(/\r?\n/).filter(l => l.startsWith('##R ')).map(l => JSON.parse(l.slice(4)) as AbGameResult);
      if (code !== 0 && rows.length === 0) return reject(new Error(`worker exit ${code}: ${buf.slice(-500)}`));
      resolve(rows);
    });
  });
}

// ══ ① 子プロセス（結果を1行 JSON で返すだけ）══
if (IS_WORKER) {
  const a = resolveCpuPolicy(A_NAME), b = resolveCpuPolicy(B_NAME);
  for (const seed of WORKER_SEEDS) {
    for (const r of await playPair(seed, a, b)) console.log(`##R ${JSON.stringify(r)}`);
  }
  process.exit(0);
}

// ══ ② A/B モード ══
if (AB_MODE) {
  const a = resolveCpuPolicy(A_NAME), b = resolveCpuPolicy(B_NAME);
  const seeds = Array.from({ length: GAMES }, (_, i) => SEED0 + i);
  console.log(`A=${a.name} vs B=${b.name}｜${seeds.length} シード × 2戦（席入れ替え）＝ ${seeds.length * 2} 戦｜並列 ${Math.max(1, Math.min(JOBS, seeds.length))}`);
  const t0 = Date.now();
  let ab: AbGameResult[];
  if (JOBS > 1 && seeds.length > 1) {
    ab = (await Promise.all(splitSeeds(seeds, JOBS).map(runWorker))).flat();
  } else {
    ab = [];
    for (const seed of seeds) {
      const rs = await playPair(seed, a, b);
      ab.push(...rs);
      console.log(`  seed=${seed} A(先攻)=${rs[0].winner ?? rs[0].reason} / A(後攻)=${rs[1].winner ?? rs[1].reason}`);
    }
  }
  ab.sort((x, y) => (x.seed - y.seed) || (Number(x.swapped) - Number(y.swapped)));
  const sum = summarizeAb(ab, FIRST === 'HOST' ? 'host' : 'guest');
  console.log(formatAbReport(sum, a.name, b.name));
  console.log(`壁時計 ${((Date.now() - t0) / 1000).toFixed(0)}秒（対戦の合計は ${(sum.totalMs / 1000).toFixed(0)}秒）`);
  if (sum.stalled > 0) {
    console.log(`🔴止まった対戦が ${sum.stalled} 件ある＝勝率の分母から落ちている（原因を潰すまで数字を信じない）`);
    if (!ALLOW_STALL) process.exit(1);
  }
  process.exit(0);
}

// ══ ③ 候補数の実測（§5.7 `S-15`）══
if (CENSUS_MOVES) {
  type Obs = { phase: string; n: number; listMs: number; kinds: Record<string, number>; applyMs: number[] };
  const obs: Obs[] = [];
  /** 🆕§5.7 `S-16`＝**探索用の1手適用そのもの**を測る（`applyCpuMoveSim`）。`null`＝まだ適用できない手。 */
  const applied: Record<string, { ok: number; ng: number }> = {};
  const applyOnce = (mv: CpuMove, c: CpuMoveCtx): boolean => {
    const r = applyCpuMoveSim(c, mv);
    const cell = applied[mv.kind] ?? (applied[mv.kind] = { ok: 0, ng: 0 });
    if (r) cell.ok++; else cell.ng++;
    return !!r;
  };
  const seenBoards = new Set<string>();
  const chk = installMoveCheck();
  // 🆕§5.7 `S-16`＝探索（幅 `--search-width` / 深さ `--search-depth`）と**いまの選択**を突き合わせる。
  const search = { runs: 0, ms: [] as number[], nodes: [] as number[], moved: 0, same: 0, diff: 0, none: 0, gain: [] as number[] };
  /**
   * 🆕§5.7 `S-21`＝**「探索は打たない」の内訳**。
   * `noCand`＝**探索が扱える候補が0**（アシストグロウ・レゾナ・ライズ・ピースだけ）＝**判断ではない**。
   * `rejected`＝**候補はあったが baseline を超えなかった**＝**目的関数の問題**（`S-21` の本体）。
   */
  const none = { noCand: 0, noApply: 0, rejected: 0, loss: [] as number[], byKind: {} as Record<string, number>, byKindNoApply: {} as Record<string, number> };
  const samples: string[] = [];
  const rejSamples: string[] = [];
  let lastSearch: { phase: string; move: CpuMove | null; line: CpuMove[]; gain: number; r: ReturnType<typeof searchCpuMove>; ctx: CpuMoveCtx } | null = null;
  onChoice = (_mv, d) => {
    if (!lastSearch) return;
    const sd = lastSearch.move ? describeCpuMove(lastSearch.move) : null;
    if (sd === null) {
      search.none++;
      const { r, ctx, phase } = lastSearch;
      if (r.candidates === 0) { none.noCand++; return; }
      const kinds = new Set(listSearchableCpuMoves(ctx, phase as TurnPhase, false).map(m => m.kind));
      // 🔑**候補はあるのに1つも適用できなかった**＝`simulateEffect` が解けない＝**先読みの穴**（目的関数ではない）。
      if (r.applied === 0) {
        none.noApply++;
        for (const k of kinds) none.byKindNoApply[k] = (none.byKindNoApply[k] ?? 0) + 1;
        return;
      }
      none.rejected++;
      none.loss.push(r.actionScore - r.baseline);
      // 🔑**拒んだ候補の種類**＝どの種類の手が「損」に見えているか。
      for (const k of kinds) none.byKind[k] = (none.byKind[k] ?? 0) + 1;
      if (rejSamples.length < 12) {
        rejSamples.push(`[${phase}] いま=${d}／探索の最善行動=${Math.round(r.actionScore - r.baseline)}（候補${r.candidates}）`);
      }
      samples.push(`[${phase}] いま=${d}／探索=打たない`);
      return;
    }
    if (sd === d) { search.same++; return; }
    search.diff++;
    samples.push(`[${lastSearch.phase}] いま=${d}／探索=${describeCpuLine(lastSearch.line)}（+${Math.round(lastSearch.gain)}）`);
  };
  observeMoves = e => {
    chk.onMoves(e);
    const { phase, moves, ms, ctx } = e;
    if (SEARCH_W > 0 && (phase === 'MAIN' || phase === 'ENERGY' || phase === 'GROW' || phase === 'ATTACK_ARTS')) {
      const t0 = performance.now();
      // 🆕§5.7 `S-21`＝計測側だけ別ポリシー（`--search-policy`）。対戦本体は触らない。
      const sctx = SEARCH_POLICY ? { ...ctx, lookahead: { ...ctx.lookahead, policy: SEARCH_POLICY } } : ctx;
      const r = searchCpuMove(sctx, phase, {
        width: SEARCH_W, depth: SEARCH_D, pendingSpell: false, actionBias: SEARCH_POLICY?.actionBias ?? 0,
      });
      search.runs++;
      search.ms.push(performance.now() - t0);
      search.nodes.push(r.nodes);
      search.gain.push(r.score - r.baseline);
      lastSearch = { phase, move: r.move, line: r.line, gain: r.score - r.baseline, r, ctx: sctx };
    }
    // 同じ盤面（応答待ちで再入した回）は1回だけ数える。
    const key = `${phase}|${moves.map(describeCpuMove).join(',')}|${ctx.actor.hand.join(',')}|${ctx.actor.energy.length}`;
    if (seenBoards.has(key)) return;
    seenBoards.add(key);
    const kinds: Record<string, number> = {};
    const applyMs: number[] = [];
    for (const mv of moves) {
      kinds[mv.kind] = (kinds[mv.kind] ?? 0) + 1;
      const t = performance.now();
      const ok = applyOnce(mv, ctx);
      if (ok) applyMs.push(performance.now() - t);
    }
    obs.push({ phase, n: moves.length, listMs: ms, kinds, applyMs });
  };
  for (let g = 0; g < GAMES; g++) {
    const o = await playOne(SEED0 + g);
    console.log(`seed=${o.seed} ${o.reason} 手数=${o.steps} ターン=${o.turns} 勝者=${o.winner} ${o.ms}ms`);
  }
  const pct = (xs: number[], q: number) => { const a = [...xs].sort((x, y) => x - y); return a.length ? a[Math.min(a.length - 1, Math.floor(q * a.length))] : 0; };
  const f1 = (x: number) => x.toFixed(1);
  console.log(`
盤面（重複除く）${obs.length}件`);
  for (const ph of ['ENERGY', 'GROW', 'MAIN', 'ATTACK_ARTS']) {
    const xs = obs.filter(o => o.phase === ph);
    if (!xs.length) continue;
    const ns = xs.map(o => o.n);
    const kinds: Record<string, number> = {};
    for (const o of xs) for (const [k, v] of Object.entries(o.kinds)) kinds[k] = (kinds[k] ?? 0) + v;
    console.log(`${ph.padEnd(11)} 盤面${String(xs.length).padStart(4)}｜候補数 平均${f1(ns.reduce((a, b) => a + b, 0) / ns.length)} 中央${pct(ns, 0.5)} p90 ${pct(ns, 0.9)} 最大${Math.max(...ns)}｜0件 ${ns.filter(n => n === 0).length}｜列挙 平均${f1(xs.reduce((a, o) => a + o.listMs, 0) / xs.length)}ms p90 ${f1(pct(xs.map(o => o.listMs), 0.9))}ms`);
    console.log(`${''.padEnd(11)} 内訳（延べ）${Object.entries(kinds).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}=${v}`).join(' ')}`);
  }
  chk.report();
  if (search.runs > 0) {
    const f2 = (x: number) => x.toFixed(1);
    const pc = (xs: number[], q: number) => { const a = [...xs].sort((x, y) => x - y); return a.length ? a[Math.min(a.length - 1, Math.floor(q * a.length))] : 0; };
    console.log(`探索（幅${SEARCH_W}・深さ${SEARCH_D}）${search.runs}盤面｜1盤面 平均${f2(search.ms.reduce((a, b) => a + b, 0) / search.runs)}ms p90 ${f2(pc(search.ms, 0.9))}ms 最大${f2(Math.max(...search.ms))}ms｜展開 平均${f2(search.nodes.reduce((a, b) => a + b, 0) / search.runs)} 最大${Math.max(...search.nodes)}`);
    console.log(`  いまの選択と比べて＝同じ ${search.same}／違う ${search.diff}／探索は「打たない」 ${search.none}（打った手 ${search.same + search.diff + search.none}）`);
    // 🆕§5.7 `S-21`＝「打たない」を**判断ではない分**と**目的関数の問題**に割る。
    console.log(`  「打たない」の内訳＝候補0 ${none.noCand}（探索の外の手だけ＝判断ではない）／適用0 ${none.noApply}（先読みが解けない）／却下 ${none.rejected}（目的関数）`);
    if (none.noApply > 0) {
      console.log(`    適用0 の盤面に出ていた手の種類＝${Object.entries(none.byKindNoApply).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}=${v}`).join(' ')}`);
    }
    if (none.rejected > 0) {
      const ls = [...none.loss].sort((a, b) => a - b);
      console.log(`    却下された最善行動の得失＝中央 ${Math.round(ls[Math.floor(ls.length / 2)])} 最小 ${Math.round(ls[0])} 最大 ${Math.round(ls[ls.length - 1])}`);
      console.log(`    却下された盤面に出ていた手の種類＝${Object.entries(none.byKind).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}=${v}`).join(' ')}`);
      for (const x of rejSamples) console.log(`    ${x}`);
    }
    for (const x of samples.slice(0, 12)) console.log(`    ${x}`);
  }
  const all = obs.flatMap(o => o.applyMs);
  console.log(`探索用の1手適用（applyCpuMoveSim）${all.length}回｜平均${f1(all.reduce((a, b) => a + b, 0) / Math.max(1, all.length))}ms 中央${f1(pct(all, 0.5))}ms p90 ${f1(pct(all, 0.9))}ms 最大${f1(Math.max(0, ...all))}ms`);
  // 🔑**種類ごとの適用できた／できなかった**＝`null` は「弱い手」ではなく**探索の外に置く手**（実行関数の写経を避けている）。
  console.log(`  適用の可否（種類別）＝${Object.entries(applied).sort((a, b) => (b[1].ok + b[1].ng) - (a[1].ok + a[1].ng))
    .map(([k, v]) => `${k} ${v.ok}/${v.ok + v.ng}`).join(' ｜ ')}`);
  process.exit(chk.failed() ? 1 : 0);
}

// ══ ④ 従来モード（`npm run selfplay`＝ゲート）══
// 🆕§5.7 `S-15`＝ゲートでも打った手の照合を回す（列挙は1盤面 約2ms＝1戦で1秒未満）。
const moveCheck = installMoveCheck();
const results: GameOutcome[] = [];
for (let g = 0; g < GAMES; g++) {
  const o = await playOne(SEED0 + g);
  results.push(o);
  console.log(`seed=${o.seed} ${o.reason} 手数=${o.steps} ターン=${o.turns} 勝者=${o.winner} ライフ=${o.hostLife}/${o.guestLife} ${o.ms}ms`);
}

moveCheck.report();
if (moveCheck.failed()) {
  console.log('🔴CPU が列挙（`listCpuMoves`）に無い手を打った＝探索の道と本番の選択がズレている（§5.7 `S-15`）');
  process.exit(1);
}
const stalled = results.filter(r => r.reason !== 'finished');
const wins = { host: results.filter(r => r.winner === 'host').length, guest: results.filter(r => r.winner === 'guest').length };
console.log(`\n${GAMES}戦＝決着 ${results.length - stalled.length} / 止まった ${stalled.length}｜勝敗 host ${wins.host} - ${wins.guest} guest｜平均ターン ${(results.reduce((a, r) => a + r.turns, 0) / results.length).toFixed(1)}`);
if (stalled.length > 0 && !ALLOW_STALL) {
  console.log(`🔴止まった対戦がある（${stalled.map(r => `seed=${r.seed} ${r.reason} T${r.turns}`).join(' / ')}）＝どちらの席も動けないか無限ループ`);
  process.exit(1);
}
