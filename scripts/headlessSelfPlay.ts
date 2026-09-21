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
 *
 * 使い方（④ 本物のデッキで測る＝§5.7 `S-23`／`S-20` ①③・2026-09-20）＝
 *   `node scripts/listDecks.mjs --export scratchpad-decks`（1回だけ・DB から書き出す）のあと
 *   - `npx tsx scripts/headlessSelfPlay.ts --deck "ケトッシー軸" --games 1`         # 両席とも同じ山
 *   - `npm run selfplay:ab -- --deck-a "WD13" --deck-b "天使軸1" --games 20`        # **山の A/B**（席入れ替えつき）
 *   - `npm run selfplay:ab -- --decks "WD13,天使軸1,ケトッシー軸" --games 6`        # **総当たり**（全ての組）
 *   - `--logs-out <dir>` を足すと1戦ごとにログ JSON を書く ⇒ `npm run census:play -- --dir <dir> [--grep <山の名前>]` で機構踏破を合算できる。
 *   🔴**既定の山は変えていない**（`--deck*` を渡さなければ `VERIFY_DECK_MECH`）＝過去の勝率と比べられなくなるため。
 *   🔑**出力に「その山が踏みうる型の数」を必ず出す**（`S-20` ③）＝**勝率 50% を「安全」と誤読しない**ための計器。
 *     実測（2026-09-20）＝既定の山 **23種** ／ ユーザー作26デッキの和集合 **85種**（**64種は既定の山に出てこない**・
 *     `POWER_MODIFY` は既定の山に **0枚**／26デッキ中 **23デッキ**が持つ）。
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
import { patchCpuPolicy, resolveCpuPolicy, type CpuPolicy } from '../src/screens/battle/cpuPolicy';
import { buildLrigSetupState } from '../src/screens/battle/lrigSetup';
import { performCpuMulligan } from '../src/screens/battle/controller/performMulligan';
import type { CpuTurnDeps } from '../src/screens/battle/controller/cpuTurn';
import { applyCpuMoveSim, describeCpuMove, type CpuMove, type CpuMoveCtx } from '../src/screens/battle/cpuMoves';
import { searchCpuMove, describeCpuLine, listSearchableCpuMoves } from '../src/screens/battle/cpuSearch';
import { formatAbReport, meanInterval, splitSeeds, summarizeAb, wilsonInterval, type AbGameResult } from './selfPlayStats';
import { formatDeckCoverage, MECH_DECK, resolveSelfPlayDeck, type SelfPlayDeck } from './selfPlayDecks';
import { buildScanSpecs, formatDivergeReport, screenSpeedup, summarizeDiverge, type DivergeRun } from './cpuWeightScan';

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
/**
 * 🆕§5.7 `S-25` ①／`S-6`＝**重みをその場で差し替える**（`--a-set "fieldPowerScale=1,openLane=1500"`）。
 * 🔑**プリセットを足さずに仮説を試せる**＝重みの調整が「コードを変えないと測れない」状態を抜ける。
 */
const A_SET = strArg('--a-set', '');
const B_SET = strArg('--b-set', '');
/** 名前 → プリセット → 差分（`--a-set`）。⚠差分は名前に残る（どの数値で回したか勝率表に出す）。 */
const policyOf = (name: string, set: string): CpuPolicy => patchCpuPolicy(resolveCpuPolicy(name), set);
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
/**
 * 🆕§5.7 `S-23`／`S-20` ①＝**山の差し替え**（`--deck` 両席／`--deck-a`・`--deck-b` 席ごと／`--decks` 総当たり）。
 * 🔴**既定は空＝合成の `VERIFY_DECK_MECH`**（過去の勝率と比較できるように既定は変えない）。
 * ⚠**山は A/B のラベルに付いて回る**＝`--deck-a` は「A のポリシー」と一緒に席を入れ替える（`playPair`）。
 */
const DECK_BOTH = strArg('--deck', '');
const DECK_A_NAME = strArg('--deck-a', DECK_BOTH);
const DECK_B_NAME = strArg('--deck-b', DECK_BOTH);
/** 総当たり（`--decks "A,B,C"`）＝全ての組（順不同）を `--games` シードずつ回す。 */
const ROUND_ROBIN = strArg('--decks', '').split(',').map(s => s.trim()).filter(Boolean);
/** 🆕1戦ごとの対戦ログを書き出す先（`npm run census:play -- --file …` の入力）。 */
const LOGS_OUT = strArg('--logs-out', '');
/**
 * 🆕§5.7 `S-6` 第1段（2026-09-21）＝**分岐スクリーニング**（`--diverge`）。
 * 候補のポリシーを**両席**に置いて1戦回し、**打った手の並び**を基準（`--a`・既定 `default`）の並びと突き合わせる。
 * 🔑**1候補 1戦（35秒）で「この数値は判断を変えるか」が分かる**＝本番の A/B（96戦＝8分）の**96分の1**。
 * 🔴**分岐0 の候補を A/B に掛けるのは確実な無駄**（同じ試合が2回走るだけ）＝`S-25` はそれに8分×4本を払った。
 */
const DIVERGE = argv.includes('--diverge');
/** 走査する候補（`--cand "key=値,…"` を何度でも書ける）。`--scan` は `SCAN_KNOBS` の全部。 */
const CAND_SPECS = argv.flatMap((a, i) => (a === '--cand' && argv[i + 1] ? [String(argv[i + 1])] : []));
const SCAN = argv.includes('--scan');
/** 子プロセスへ仕事を渡すファイル（⚠日本語のデッキ名をコマンドラインに載せない＝Windows の引用符事故を避ける）。 */
const TASKS_FILE = strArg('--tasks-file', '');
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

// ⚠**カードの絞りは山が決まってから**（下の `selectDecks`）＝全カード（約7,000枚）を渡すと材料の組み立てが1手ごとに重くなる
//   （画面の `battleCardNums` と同じ絞り）。
const allCardMap = new Map(allCards.map(c => [c.CardNum, c]));
/**
 * 🆕§5.7 `S-23`＝**この対戦で使う山**（既定＝合成の `VERIFY_DECK_MECH`）。
 * ⚠`resolveSelfPlayDeck` は**書き出した JSON だけ**を読む（対戦中に DB は引かない）。
 */
let deckA: SelfPlayDeck = resolveSelfPlayDeck(DECK_A_NAME, allCardMap);
let deckB: SelfPlayDeck = resolveSelfPlayDeck(DECK_B_NAME, allCardMap);
let cards: CardData[] = [];
let cardMap = new Map<string, CardData>();
/**
 * 山を差し替える（総当たりは組ごとに呼ぶ）。
 * 🔴**トークン（`CardData_TK.csv`）は常に全部載せる**＝実機の `battleCardNums` が常時ロードしている分＝
 *   載せ忘れると**効果で生成したカードの `CardData` が引けず、無言の no-op になる**（`O-263` と同じ形）。
 */
function selectDecks(a: SelfPlayDeck, b: SelfPlayDeck): void {
  deckA = a; deckB = b;
  const used = new Set([...a.mainDeck, ...a.lrigDeck, ...b.mainDeck, ...b.lrigDeck].map(n => String(n).split('#')[0]));
  cards = allCards.filter(c => used.has(c.CardNum) || /-TK/.test(c.CardNum));
  cardMap = new Map(cards.map(c => [c.CardNum, c]));
}
selectDecks(deckA, deckB);

const HOST_ID = 'headless-host';
/** 先攻の席（`--first`）。⚠ターン1のドローが1枚になるのは `first_player_id` の側（`cpuTurn.ts` の `drawCount`）。 */
const firstId = () => (FIRST === 'HOST' ? HOST_ID : CPU_PLAYER_ID);

/**
 * 対戦開始時の1人ぶんの盤面（ルリグ配置 → **マリガン** → ライフクロス7枚）。
 * 🆕🔴§5.7 `S-24`（2026-09-21）＝**旧は `applyMulligan(state, [])` 固定＝マリガンを一度も踏んでいなかった**
 *   （実測＝`census:play` で4デッキ × 48戦すべて「マリガン 0回」＝**自己対戦の台が構造的に踏めない唯一の機構**）。
 *   いまは**画面と同じ `performCpuMulligan`**（`controller/`）を通る＝`S-2` の作戦データも効く。
 * ⚠**乱数を消費する**＝この修正で同じシードでも別の試合になる（過去の勝率とは比較できない＝ベースラインを撮り直した）。
 */
function buildSide(guest: boolean, deck: SelfPlayDeck, policy?: CpuPolicy): { state: PlayerState; logs: string[] } {
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
 * ⚠**席ごとに山が違う**＝`host`／`guest` の順で組む（シャッフルの乱数の消費順もこの順）。
 * 🆕§5.7 `S-24`＝**マリガンのログも一緒に返す**（`createHeadlessMatch` の `initialLogs` へ渡す）＝
 *   `npm run census:play` の規則 `mulligan` が自己対戦のログでも数えられる。
 */
function buildRow(
  seats: { host: SelfPlayDeck; guest: SelfPlayDeck }, policy?: { host: CpuPolicy; guest: CpuPolicy },
): { row: BattleStateRow; logs: string[] } {
  const host = buildSide(false, seats.host, policy?.host);
  const guest = buildSide(true, seats.guest, policy?.guest);
  const row = {
    room_id: 'headless', host_id: HOST_ID, guest_id: CPU_PLAYER_ID,
    global_phase: 'PLAYING', setup_phase: null, turn_phase: 'UP', active_user_id: firstId(), turn_count: 1,
    host_state: host.state, guest_state: guest.state,
    game_logs: [], updated_at: new Date().toISOString(),
    host_lrig_selected: seats.host.roles.centerLrig, guest_lrig_selected: seats.guest.roles.centerLrig,
    host_janken: null, guest_janken: null, host_mulligan_done: true, guest_mulligan_done: true,
    first_player_id: firstId(), pending_spell: null, pending_effect: null, effect_stack: null,
    winner_id: null, host_end_ack: false, guest_end_ack: false,
  } as unknown as BattleStateRow;
  return { row, logs: [...host.logs, ...guest.logs] };
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
async function playOne(seed: number, policy?: { host: CpuPolicy; guest: CpuPolicy }, swapped = false): Promise<GameOutcome> {
  setRngSeed(seed);
  // 🆕§5.7 `S-23`＝**山もポリシーと一緒に席を入れ替える**（A の山は A のポリシーに付いて回る）。
  const seats = swapped ? { host: deckB, guest: deckA } : { host: deckA, guest: deckB };
  const setup = buildRow(seats, policy);
  const m = createHeadlessMatch(setup.row, {
    cards, policy, observeMoves, observeChoice,
    // 🆕§5.7 `S-24`＝**マリガンのログ**（対戦開始の段はここで組むので、ログもここから渡す）。
    initialLogs: setup.logs,
    // 🆕§5.7 `S-23`＝**作戦データ（`S-2`）も席ごと**＝デッキごとに違うので1つに畳めない。
    cpuPlans: { host: seats.host.plan, guest: seats.guest.plan },
  });
  const t0 = Date.now();
  const res = await m.run(MAX_STEPS);
  const r = m.row();
  const winner = r.winner_id === CPU_PLAYER_ID ? 'guest' : r.winner_id === HOST_ID ? 'host' : '-';
  if (VERBOSE) console.log(m.logs.join('\n'));
  // 🆕`--logs-out`＝機構踏破（`npm run census:play`）の入力。⚠部屋を閉じるとログが消える実機と違い、ここは決定論で撮り直せる。
  if (LOGS_OUT) {
    fs.mkdirSync(LOGS_OUT, { recursive: true });
    // ⚠**日本語のデッキ名を潰さない**（`\w` で削ると「天使軸1」が `___1` になり、`census:play --grep` で山を絞れない）＝
    //   Windows/POSIX の両方でファイル名に使えない文字だけを置き換える。
    const tag = `${deckA.name}_vs_${deckB.name}_s${seed}${swapped ? '_b' : '_a'}`.replace(/[<>:"/|?*\s]/g, '_');
    fs.writeFileSync(join(LOGS_OUT, `${tag}.json`),
      JSON.stringify({ logs: m.logs, turnCount: r.turn_count, globalPhase: r.global_phase }, null, 1), 'utf-8');
  }
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
    const g = await playOne(seed, swapped ? { host: b, guest: a } : { host: a, guest: b }, swapped);
    const aSeat = swapped ? 'guest' : 'host';
    out.push({
      seed, swapped, reason: g.reason, steps: g.steps, turns: g.turns, ms: g.ms,
      winner: g.winner === '-' ? null : g.winner === aSeat ? 'A' : 'B',
      // 🆕§5.7 `S-27`＝**A 視点の残ライフ差**。🔴**席を取り違えると符号が反転する**（A は swapped のとき guest 席）＝
      //   `winner` と同じ `aSeat` から導く（別々に書くと片方だけ直して静かに嘘をつく）。
      margin: aSeat === 'host' ? g.hostLife - g.guestLife : g.guestLife - g.hostLife,
    });
  }
  return out;
}

/** 子プロセスを1本起こして、そのシード群の結果を受け取る。 */
function runWorker(seeds: number[]): Promise<AbGameResult[]> {
  const self = fileURLToPath(import.meta.url);
  const args = ['--import', 'tsx', self, '--worker', '--a', A_NAME, '--b', B_NAME,
    '--steps', String(MAX_STEPS), '--first', FIRST === 'HOST' ? 'host' : 'guest', '--seeds', seeds.join(','),
    // 🆕§5.7 `S-23`＝**山も子へ渡す**（渡し忘れると子だけ既定の合成デッキで回り、親の表題と中身が食い違う）。
    ...(deckA.name === MECH_DECK.name ? [] : ['--deck-a', deckA.name]),
    ...(deckB.name === MECH_DECK.name ? [] : ['--deck-b', deckB.name]),
    ...(A_SET ? ['--a-set', A_SET] : []), ...(B_SET ? ['--b-set', B_SET] : []),
    ...(LOGS_OUT ? ['--logs-out', LOGS_OUT] : [])];
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

/**
 * ══ ⓪ 分岐スクリーニング（§5.7 `S-6` 第1段・2026-09-21）══
 *
 * 使い方＝`npm run selfplay:scan -- --decks "ケトッシー軸,WD13,…" --games 2`（`--scan`＝20個のつまみを全部）
 *        ／`npm run selfplay:scan -- --cand "life=3500,hand=3000" --cand "openLane=6000"`（狙い撃ち）
 * 🔴**これは強さの判定ではない**＝「A/B に掛ける価値があるか」の篩（詳細は `scripts/cpuWeightScan.ts` の冒頭）。
 */
interface DivergeTask { deck: string; seed: number; cand: string }

/** 1戦して**打った手の並び**を取る（両席とも同じポリシー＝測るのは「基準と違う手を打ったか」だけ）。 */
async function playTraced(seed: number, p: CpuPolicy): Promise<{ moves: string[]; reason: string }> {
  const moves: string[] = [];
  // ⚠`observeMoves` は付けない＝列挙のコスト（1盤面 約2ms）を払う理由が無い。
  observeMoves = undefined;
  observeChoice = mv => { moves.push(describeCpuMove(mv)); };
  const o = await playOne(seed, { host: p, guest: p });
  observeChoice = undefined;
  return { moves, reason: o.reason };
}

/** 子プロセスを1本起こして、その仕事群の結果を受け取る。 */
function runDivergeWorker(tasks: DivergeTask[], idx: number): Promise<DivergeRun[]> {
  const self = fileURLToPath(import.meta.url);
  const dir = join(process.cwd(), 'node_modules/.tmp');
  fs.mkdirSync(dir, { recursive: true });
  const file = join(dir, `diverge_tasks_${process.pid}_${idx}.json`);
  fs.writeFileSync(file, JSON.stringify(tasks), 'utf-8');
  const args = ['--import', 'tsx', self, '--diverge', '--worker', '--a', A_NAME,
    '--steps', String(MAX_STEPS), '--first', FIRST === 'HOST' ? 'host' : 'guest', '--tasks-file', file];
  return new Promise((resolve, reject) => {
    const ch = spawn(process.execPath, args, { cwd: process.cwd(), stdio: ['ignore', 'pipe', 'inherit'] });
    let buf = '';
    ch.stdout.on('data', d => { buf += String(d); });
    ch.on('error', reject);
    ch.on('close', code => {
      try { fs.unlinkSync(file); } catch { /* 消せなくても害は無い */ }
      const rows = buf.split(/\r?\n/).filter(l => l.startsWith('##V ')).map(l => JSON.parse(l.slice(4)) as DivergeRun);
      if (code !== 0 && rows.length === 0) return reject(new Error(`diverge worker exit ${code}: ${buf.slice(-500)}`));
      resolve(rows);
    });
  });
}

if (IS_WORKER && DIVERGE) {
  const champion = policyOf(A_NAME, '');
  const tasks = JSON.parse(fs.readFileSync(TASKS_FILE, 'utf-8')) as DivergeTask[];
  for (const t of tasks) {
    // ⚠**山は仕事ごとに引き直す**（子は親の `--decks` を知らない）。合成デッキは名前で引けないので空文字で。
    const d = resolveSelfPlayDeck(t.deck === MECH_DECK.name ? '' : t.deck, allCardMap);
    selectDecks(d, d);
    const r = await playTraced(t.seed, t.cand ? patchCpuPolicy(champion, t.cand) : champion);
    console.log(`##V ${JSON.stringify({ cand: t.cand, deck: t.deck, seed: t.seed, moves: r.moves, reason: r.reason })}`);
  }
  process.exit(0);
}

if (DIVERGE) {
  const champion = policyOf(A_NAME, '');
  const specs = SCAN ? buildScanSpecs() : CAND_SPECS;
  if (specs.length === 0) {
    console.log('🔴候補がありません＝`--scan`（20個のつまみを全部）か `--cand "key=値,…"` を渡してください。');
    process.exit(1);
  }
  // ⚠**打ち間違いはここで落とす**＝1時間回したあとに「知らないキーだった」では遅い（`patchCpuPolicy` は例外を投げる）。
  for (const s of specs) patchCpuPolicy(champion, s);
  const decks = ROUND_ROBIN.length > 0 ? ROUND_ROBIN.map(n => resolveSelfPlayDeck(n, allCardMap)) : [deckA];
  const seeds = Array.from({ length: GAMES }, (_, i) => SEED0 + i);
  const tasks: DivergeTask[] = [];
  for (const d of decks) for (const seed of seeds) for (const cand of ['', ...specs]) tasks.push({ deck: d.name, seed, cand });
  console.log(`分岐スクリーニング｜基準=${champion.name}｜候補 ${specs.length}件｜山 ${decks.length}種 × ${seeds.length} シード`
    + `＝${tasks.length} 対戦（基準を含む）｜並列 ${Math.max(1, JOBS)}`);
  console.log(`🔑本番の A/B なら 1候補 96戦＝この篩は **約${screenSpeedup(decks.length, seeds.length).toFixed(0)}倍安い**`
    + `（ただし答えるのは「判断を変えるか」だけ）`);
  console.log(formatDeckCoverage(decks));
  const t0 = Date.now();
  let runs: DivergeRun[];
  if (JOBS > 1 && tasks.length > 1) {
    // ⚠**塊で割らない**＝対戦の長さは山とシードで倍近く違う（`splitSeeds` と同じ理由）。
    const jobs = Math.max(1, Math.min(JOBS, tasks.length));
    const chunks = Array.from({ length: jobs }, (_, j) => tasks.filter((_, i) => i % jobs === j));
    runs = (await Promise.all(chunks.map((c, j) => runDivergeWorker(c, j)))).flat();
  } else {
    runs = [];
    for (const t of tasks) {
      const d = decks.find(x => x.name === t.deck)!;
      selectDecks(d, d);
      const r = await playTraced(t.seed, t.cand ? patchCpuPolicy(champion, t.cand) : champion);
      runs.push({ cand: t.cand, deck: t.deck, seed: t.seed, moves: r.moves, reason: r.reason });
    }
  }
  const rows = summarizeDiverge(runs);
  console.log(formatDivergeReport(rows, { champion: champion.name, decks: decks.length, seeds: seeds.length }));
  console.log(`壁時計 ${((Date.now() - t0) / 1000).toFixed(0)}秒｜対戦 ${runs.length}`);
  const stalled = runs.filter(r => r.reason !== 'finished').length;
  if (stalled > 0) {
    console.log(`🔴止まった対戦が ${stalled} 件ある＝その分の分岐は判断できない`);
    if (!ALLOW_STALL) process.exit(1);
  }
  process.exit(0);
}

// ══ ① 子プロセス（結果を1行 JSON で返すだけ）══
if (IS_WORKER) {
  const a = policyOf(A_NAME, A_SET), b = policyOf(B_NAME, B_SET);
  for (const seed of WORKER_SEEDS) {
    for (const r of await playPair(seed, a, b)) console.log(`##R ${JSON.stringify(r)}`);
  }
  process.exit(0);
}

/**
 * A/B を1組ぶん回す（ポリシーの A/B も、山の A/B（`S-23`）も同じ口）。
 * ⚠**山は呼ぶ前に `selectDecks` で決めておく**（子プロセスへも `deckA`/`deckB` から渡る）。
 */
async function runAb(a: CpuPolicy, b: CpuPolicy, quiet = false) {
  const seeds = Array.from({ length: GAMES }, (_, i) => SEED0 + i);
  let ab: AbGameResult[];
  if (JOBS > 1 && seeds.length > 1) {
    ab = (await Promise.all(splitSeeds(seeds, JOBS).map(runWorker))).flat();
  } else {
    ab = [];
    for (const seed of seeds) {
      const rs = await playPair(seed, a, b);
      ab.push(...rs);
      if (!quiet) console.log(`  seed=${seed} A(先攻)=${rs[0].winner ?? rs[0].reason} / A(後攻)=${rs[1].winner ?? rs[1].reason}`);
    }
  }
  ab.sort((x, y) => (x.seed - y.seed) || (Number(x.swapped) - Number(y.swapped)));
  return summarizeAb(ab, FIRST === 'HOST' ? 'host' : 'guest');
}

/**
 * ══ ②'' ポリシー × 山（§5.7 `S-25`・2026-09-20）══
 * 🔴**なぜ要るか（実測）**＝`search` vs `default` を**1つの山（WD13）で測って「探索は弱い」と登録した**が、
 *   山を変えて測り直すと**4デッキ中3つで探索のほうが強かった**（ケトッシー軸 8-0-0／天使軸1 6-2-0／WD06 6-2-0）。
 *   ⇒ **ポリシーの良し悪しは「山ごとの表」で見る**（1つの山の勝率で一般化しない＝`S-20`／`S-23` と同じ教訓）。
 * 使い方＝`npm run selfplay:ab -- --a search --b default --decks "A,B,C" --games 8`
 */
if (AB_MODE && ROUND_ROBIN.length >= 1) {
  const a = policyOf(A_NAME, A_SET), b = policyOf(B_NAME, B_SET);
  const list = ROUND_ROBIN.map(n => resolveSelfPlayDeck(n, allCardMap));
  console.log(`A=${a.name} vs B=${b.name}｜山 ${list.length}種 × ${GAMES} シード × 2戦（席入れ替え）`);
  console.log(formatDeckCoverage(list));
  const t0 = Date.now();
  const rows: { deck: string; sum: Awaited<ReturnType<typeof runAb>> }[] = [];
  for (const deck of list) {
    // ⚠**両席とも同じ山**＝測るのはポリシーの差（山の差は `--decks` だけを渡す総当たりモード）。
    selectDecks(deck, deck);
    const sum = await runAb(a, b, true);
    rows.push({ deck: deck.name, sum });
    const verdict = sum.pairDecided === 0 ? 'ほぼ同じ打ち方'
      : sum.pairSignificant ? (sum.pairRate > 0.5 ? '🔎A が強い' : '🔎A が弱い') : '差があるとは言えない';
    console.log(`  ${deck.name.padEnd(14)} 組 ${sum.pairs.aSweep}-${sum.pairs.split}-${sum.pairs.bSweep}`
      + `｜組で見た勝率 ${sum.pairDecided === 0 ? '—' : `${(sum.pairRate * 100).toFixed(1)}%`}`
      + ` [${(sum.pairLo * 100).toFixed(1)}, ${(sum.pairHi * 100).toFixed(1)}]｜${verdict}`
      // 🆕§5.7 `S-27`＝**連続量（補助）**＝1勝1敗の組も標本になるので、山ごとの表でも感度が上がる。
      + `｜ライフ差 ${sum.marginMean === null ? '—' : `${sum.marginMean >= 0 ? '+' : ''}${sum.marginMean.toFixed(2)}`}`
      + ` [${Number.isFinite(sum.marginLo) ? sum.marginLo.toFixed(2) : '—'}, ${Number.isFinite(sum.marginHi) ? sum.marginHi.toFixed(2) : '—'}]`
      + `${sum.marginSignificant ? '🔎' : ''}`
      + `｜止まった ${sum.stalled}`);
  }
  const sig = rows.filter(r => r.sum.pairSignificant);
  console.log(`
=== まとめ（${a.name} 目線）===`);
  console.log(`  A が強い山 ${sig.filter(r => r.sum.pairRate > 0.5).map(r => r.deck).join('／') || 'なし'}`);
  console.log(`  A が弱い山 ${sig.filter(r => r.sum.pairRate <= 0.5).map(r => r.deck).join('／') || 'なし'}`);
  console.log(`  差が出なかった山 ${rows.filter(r => !r.sum.pairSignificant).map(r => r.deck).join('／') || 'なし'}`);
  console.log('🔴**1つの山の勝率でポリシーを一般化しない**＝この表が「山によって逆になる」ことを示すためにある。');
  // 🆕§5.7 `S-27`＝**勝率では出ないが連続量では出た山**＝**戦数を積む価値がある**ことの安い合図。
  //   🔴**採否の根拠にしない**（目的関数は勝率）＝「どこを深掘りするか」を決めるためだけに読む。
  const marginOnly = rows.filter(r => !r.sum.pairSignificant && r.sum.marginSignificant);
  console.log(`  連続量（ライフ差）だけで差が出た山 ${marginOnly.map(r => r.deck).join('／') || 'なし'}`
    + `＝**勝率の判定ではない**＝その山で戦数を積むと差が出るかもしれない、という合図`);
  // 🔴**多重比較**＝山の数だけ検定しているので、**何も差が無くても 5% は光る**。
  //   実測（2026-09-21・4束 × 6山＝24セル）＝有意は3セル＝**偶然の期待値 1.2 と同じ桁**＝**1山の🔎で結論を書かない**。
  console.log(`  ⚠**${rows.length}山ぶん検定している**＝差が無くても偶然 ${(rows.length * 0.05).toFixed(1)}山は光る`
    + `（${marginOnly.length}山が光った）⇒ **1山の🔎だけで結論を書かない**`);
  const allMargins = rows.flatMap(r => r.sum.pairMargins);
  const agg = meanInterval(allMargins);
  const tied = rows.reduce((a2, r) => a2 + r.sum.marginTied, 0);
  const dec = rows.reduce((a2, r) => a2 + r.sum.decided, 0);
  console.log(`  全山の合算＝ライフ差 平均 ${agg.mean >= 0 ? '+' : ''}${agg.mean.toFixed(2)}`
    + ` [${Number.isFinite(agg.lo) ? agg.lo.toFixed(2) : '—'}, ${Number.isFinite(agg.hi) ? agg.hi.toFixed(2) : '—'}]（${agg.n}組）`
    + `｜組の勝率で決着した組 ${rows.reduce((a2, r) => a2 + r.sum.pairDecided, 0)}／1勝1敗 ${rows.reduce((a2, r) => a2 + r.sum.pairs.split, 0)}`);
  // 🔴**この指標の感度の上限**＝両者ライフ0での決着（ライフ0 はまだ敗北ではない）ではライフ差が 0＝勝敗と同じ情報しか無い。
  console.log(`  ⚠両者ライフ0での決着 ${tied}/${dec}（${dec > 0 ? Math.round((tied / dec) * 100) : 0}%）`
    + `＝そこではライフ差は勝敗と同じ情報しか持たない（この指標の感度の上限）`);
  console.log(`壁時計 ${((Date.now() - t0) / 1000).toFixed(0)}秒`);
  if (rows.some(r => r.sum.stalled > 0) && !ALLOW_STALL) process.exit(1);
  process.exit(0);
}

// ══ ②' 総当たり（§5.7 `S-23` ①＝**本物のデッキで測る**）══
// 🔑**ポリシーは両席とも同じ**（`--a` で指定・既定 `default`）＝ここで測るのは**山の差**。
if (ROUND_ROBIN.length >= 2) {
  const policy = policyOf(A_NAME, A_SET);
  const list = ROUND_ROBIN.map(n => resolveSelfPlayDeck(n, allCardMap));
  console.log(`総当たり ${list.length}デッキ（ポリシーは両席とも ${policy.name}）｜1組 ${GAMES} シード × 2戦（席入れ替え）`);
  console.log(formatDeckCoverage(list));
  const t0 = Date.now();
  type Cell = { a: string; b: string; rate: number; lo: number; hi: number; decided: number; stalled: number; pairs: string };
  const cells: Cell[] = [];
  const score = new Map<string, { w: number; n: number }>();
  /** 🆕§5.7 `S-19`＝先攻の勝率（全組の合算）。 */
  const first = { wins: 0, n: 0 };
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      selectDecks(list[i], list[j]);
      const sum = await runAb(policy, policy, true);
      cells.push({
        a: list[i].name, b: list[j].name, rate: sum.rate, lo: sum.lo, hi: sum.hi,
        decided: sum.decided, stalled: sum.stalled,
        pairs: `${sum.pairs.aSweep}-${sum.pairs.split}-${sum.pairs.bSweep}`,
      });
      // 🆕§5.7 `S-19`＝**先攻の勝率は組ごとではなく全体で読む**（1組16戦では区間が広すぎる）。
      first.wins += Math.round(sum.firstPlayerRate * sum.decided); first.n += sum.decided;
      for (const [name, w, n] of [[list[i].name, sum.aWins, sum.decided], [list[j].name, sum.decided - sum.aWins, sum.decided]] as const) {
        const cur = score.get(name) ?? { w: 0, n: 0 };
        score.set(name, { w: cur.w + w, n: cur.n + n });
      }
      console.log(`  ${list[i].name} vs ${list[j].name}：${(sum.rate * 100).toFixed(1)}% [${(sum.lo * 100).toFixed(1)}, ${(sum.hi * 100).toFixed(1)}]`
        + `｜決着 ${sum.decided}/${sum.games}｜組（A連勝-1勝1敗-B連勝）${cells[cells.length - 1].pairs}`
        + `｜先攻 ${(sum.firstPlayerRate * 100).toFixed(1)}%`);
    }
  }
  console.log(`\n=== デッキ別の勝率（総当たり・席入れ替え込み）===`);
  for (const [name, s] of [...score].sort((x, y) => (y[1].w / Math.max(1, y[1].n)) - (x[1].w / Math.max(1, x[1].n)))) {
    console.log(`  ${name.padEnd(14)} ${((s.w / Math.max(1, s.n)) * 100).toFixed(1)}%（${s.w}/${s.n}）`);
  }
  // 🆕§5.7 `S-19`＝**先攻の勝率（全組の合算）**＝`--first` を反転しなくても「手番の偏り」がここに出る。
  const fw = wilsonInterval(first.wins, first.n);
  console.log(`先攻（${FIRST === 'HOST' ? 'host' : 'guest'}席）の勝率 ${((first.wins / Math.max(1, first.n)) * 100).toFixed(1)}%`
    + `（${first.wins}/${first.n}）  95%CI [${(fw.lo * 100).toFixed(1)}, ${(fw.hi * 100).toFixed(1)}]`);
  const stalled = cells.reduce((a2, c) => a2 + c.stalled, 0);
  console.log(`壁時計 ${((Date.now() - t0) / 1000).toFixed(0)}秒｜止まった対戦 ${stalled}`);
  console.log('⚠**勝率はデッキの強さと CPU の打ち方の合成**＝デッキが弱いのか CPU が使えていないのかはここでは分からない（`census:play` の踏破と併せて読む）。');
  if (stalled > 0 && !ALLOW_STALL) process.exit(1);
  process.exit(0);
}

// ══ ② A/B モード ══
if (AB_MODE) {
  const a = policyOf(A_NAME, A_SET), b = policyOf(B_NAME, B_SET);
  const deckLabel = deckA.name === deckB.name ? `山＝${deckA.name}` : `山 A=${deckA.name} / B=${deckB.name}`;
  console.log(`A=${a.name} vs B=${b.name}｜${GAMES} シード × 2戦（席入れ替え）＝ ${GAMES * 2} 戦｜並列 ${Math.max(1, Math.min(JOBS, GAMES))}｜${deckLabel}`);
  // 🔑§5.7 `S-20` ③＝**その山が踏みうる型の数を必ず出す**（勝率 50% を「安全」と誤読しないため）。
  console.log(formatDeckCoverage(deckA.name === deckB.name ? [deckA] : [deckA, deckB]));
  const t0 = Date.now();
  const sum = await runAb(a, b);
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
  const none = { noCand: 0, noApply: 0, rejected: 0, loss: [] as number[], byKind: {} as Record<string, number>, byKindNoApply: {} as Record<string, number>,
    // 🆕§5.7 `S-17` 第2段＝**フェイズ別の「打たない」**＝アタックの却下は「ほぼ起きない」のが正（アタックは基本タダ）。
    byPhase: {} as Record<string, number> };
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
      none.byPhase[phase] = (none.byPhase[phase] ?? 0) + 1;
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
    // 🆕§5.7 `S-17` 第2段（2026-09-20）＝**アタックのフェイズでも探索を回して「いまの選択」と比べる**。
    if (SEARCH_W > 0 && (phase === 'MAIN' || phase === 'ENERGY' || phase === 'GROW' || phase === 'ATTACK_ARTS'
      || phase === 'ATTACK_SIGNI' || phase === 'ATTACK_LRIG')) {
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
  // 🆕§5.7 `S-17` 第1段（2026-09-20）＝**アタックの2フェイズも表に出す**（候補＝アタックできるシグニ／ルリグ）。
  for (const ph of ['ENERGY', 'GROW', 'MAIN', 'ATTACK_ARTS', 'ATTACK_SIGNI', 'ATTACK_LRIG']) {
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
      // 🆕§5.7 `S-17` 第2段＝**フェイズ別**（アタックの却下が多いなら近似か重みが壊れている）。
      console.log(`    却下のフェイズ別＝${Object.entries(none.byPhase).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}=${v}`).join(' ')}`);
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
if (deckA.name !== MECH_DECK.name || deckB.name !== MECH_DECK.name) {
  console.log(`山＝${deckA.name === deckB.name ? deckA.name : `host ${deckA.name} / guest ${deckB.name}`}`);
  console.log(formatDeckCoverage(deckA.name === deckB.name ? [deckA] : [deckA, deckB]));
}
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
