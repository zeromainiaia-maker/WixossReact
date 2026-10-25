/**
 * 🆕2026-10-25＝**1ターン差し替えで CPU ポリシーの強さを測る**（ユーザー指示「測り方を作り直してから調整する」）。
 *
 * ■ なぜ要るか（実測・第586バッチ）
 *   `selfplay:ab`（同じ山どうし・席入れ替え）は、ポリシーを変えても**ほとんどの対戦で同じ手順になり**、
 *   「1組2戦が1勝1敗」に吸い込まれる（グロウ用エナの予約 96組中93組・幅8深さ6 64組中58組）＝**試合単位では差が見えない**。
 *
 * ■ 測り方
 *   1. **本線**＝両席とも A（既定）で通しの対戦を回し、**各ターンの頭**で盤面・ルール処理の指紋・乱数の位置を保存する。
 *   2. **分岐**＝保存した盤面から、**手番の側だけ B** にして2ターン進める（自分のターン＋相手のターン＝守りの判断も入る）。
 *   3. 2ターン後の盤面が本線と同じ＝**この場面では判断が変わらない**＝捨てる（安い）。
 *   4. 違ったら、分岐を両席 A で最後まで打ち切り、**本線の結果（＝A で打った場合）と比べる**（勝ち +1／負け −1・ライフ差）。
 *   ⇒ **判断が分かれた場面だけが標本**になる＝試合単位の A/B より桁で多くの標本が取れる。
 *
 * ■ 自己検査（必ず回す）
 *   - `--b default`＝**分岐は0件**になるのが正（盤面から作り直した試合が本線と一致する＝`selfplay:inv --resume-every` と同じ前提）。
 *   - `--b no-spell` などの**弱くなるはずの対照**＝負けが増える（計器に感度がある）。
 *
 * 使い方＝`npx tsx scripts/cpuTurnEval.ts --b <ポリシー> [--b-set "k=v,…"] [--a default] [--grep レガシー] [--seeds 1,2] [--jobs 12]`
 *   山は `SELFPLAY_DECK_DIR`（既定 `scratchpad-decks`）の書き出し。対は i 番目 vs (7i+3) 番目（違う山どうし）。
 *   `--out <f.jsonl>` で標本を書く。
 * ⚠**見ているのは「その2ターンの判断だけを替えたときの差」**＝ポリシーを丸ごと替えた試合の勝率ではない（1手ずつの改善の和）。
 */
import { spawn } from 'child_process';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { join } from 'path';
import Papa from 'papaparse';
import type { BattleStateRow, CardData } from '../src/types';
import { setRng } from '../src/engine/rng';
import { createRuleCheckMemo, type RuleCheckMemo } from '../src/screens/battle/controller/ruleChecks';
import { CPU_PLAYER_ID } from '../src/screens/battle/battleUtils';
import { resolveCpuPolicy, patchCpuPolicy, type CpuPolicy } from '../src/screens/battle/cpuPolicy';
import { createHeadlessMatch } from '../src/screens/battle/controller/headlessMatch';
import { buildHeadlessRow } from '../src/screens/battle/controller/headlessSetup';
import { resolveSelfPlayDeck, listPlayableDeckNames, type SelfPlayDeck } from './selfPlayDecks';
import { cardCsvRelPaths } from './cardDataFiles.mjs';
import { cardsForMatch } from '../src/screens/battle/matchCards';
import { tCritical95 } from './selfPlayStats';

const argv = process.argv.slice(2);
const arg = (n: string, d: string) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : d; };
const SEEDS = arg('--seeds', '1').split(',').map(Number);
const A_NAME = arg('--a', 'default'), A_SET = arg('--a-set', '');
const B_NAME = arg('--b', 'default'), B_SET = arg('--b-set', '');
const policyOf = (n: string, s: string): CpuPolicy => s ? patchCpuPolicy(resolveCpuPolicy(n), s) : resolveCpuPolicy(n);
const POL_A = policyOf(A_NAME, A_SET), POL_B = policyOf(B_NAME, B_SET);
const GREP = arg('--grep', '');
const JOBS = Number(arg('--jobs', '1'));
const MAX_STEPS = Number(arg('--steps', '4000'));
const OUT = arg('--out', '');
const ROLLOUTS = Math.max(1, Number(arg('--rollouts', '1')));
const HOST_ID = 'headless-host';

const allCards: CardData[] = [];
for (const f of cardCsvRelPaths()) {
  const p = join(process.cwd(), 'public/data', f);
  if (!fs.existsSync(p)) continue;
  const { data } = Papa.parse<Record<string, string>>(fs.readFileSync(p, 'utf-8').replace(/^﻿/, ''), { header: true, skipEmptyLines: true });
  for (const r of data) if (r.CardNum?.trim()) allCards.push(r as unknown as CardData);
}
const allCardMap = new Map(allCards.map(c => [c.CardNum, c]));
const names = listPlayableDeckNames(allCardMap, false).filter(n => !GREP || n.includes(GREP));
const pairs: [string, string][] = names.map((n, k) => [n, names[(k * 7 + 3) % names.length]] as [string, string]).filter(([a, b]) => a !== b);
const tasks = pairs.flatMap((_, i) => SEEDS.map(s => [i, s] as [number, number]));

/** 乱数（mulberry32）の状態を外から読み書きできる形＝分岐に本線と同じ乱数位置を渡す。 */
const rngState = { a: 0 };
const rngNext = () => {
  rngState.a = (rngState.a + 0x6D2B79F5) | 0;
  let t = Math.imul(rngState.a ^ (rngState.a >>> 15), 1 | rngState.a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const cloneMemo = (m: RuleCheckMemo): RuleCheckMemo => ({
  lastBanishedKeyRef: { current: m.lastBanishedKeyRef.current }, lastContMutationKeyRef: { current: m.lastContMutationKeyRef.current },
  lastRefreshTurnEndKeyRef: { current: m.lastRefreshTurnEndKeyRef.current }, lastDeferredRefreshKeyRef: { current: m.lastDeferredRefreshKeyRef.current },
  lastLimitExcessKeyRef: { current: m.lastLimitExcessKeyRef.current },
  restrictionMatchedRef: { current: Object.fromEntries(Object.entries(m.restrictionMatchedRef.current).map(([k, v]) => [k, new Map(v)])) },
});
/** 識別子の揺れ（UUID・時刻）を潰した盤面の指紋（ログは比べない）。 */
const normIds = (s: string) => s.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, '<uuid>').replace(/\d{13}/g, '<now>');
/** キーの並び順に依らない JSON（盤面から作り直した試合はオブジェクトのキーの順番が変わる＝値は同じ）。 */
const stable = (v: unknown): string => v === null || typeof v !== 'object' ? JSON.stringify(v) ?? 'null'
  : Array.isArray(v) ? '[' + v.map(stable).join(',') + ']'
  : '{' + Object.keys(v as object).filter(k => (v as Record<string, unknown>)[k] !== undefined).sort().map(k => JSON.stringify(k) + ':' + stable((v as Record<string, unknown>)[k])).join(',') + '}';
const boardKey = (r: BattleStateRow) => normIds(stable([r.host_state, r.guest_state, r.turn_count, r.turn_phase, r.active_user_id, r.winner_id, r.effect_stack ?? null]));

interface Sample { game: string; turn: number; side: 'host' | 'guest'; deck: string; a: number; b: number; lifeA: number; lifeB: number }
/** その席から見た結果（勝ち +1／負け −1／未決着 0）とライフ差。 */
const outcome = (r: BattleStateRow, side: 'host' | 'guest') => {
  const me = side === 'host' ? HOST_ID : CPU_PLAYER_ID;
  const res = !r.winner_id ? 0 : r.winner_id === me ? 1 : -1;
  const mine = (side === 'host' ? r.host_state : r.guest_state).life_cloth.length;
  const theirs = (side === 'host' ? r.guest_state : r.host_state).life_cloth.length;
  return { res, life: mine - theirs };
};

/** 山札とライフクロスの並びだけを入れ替えた盤面（見えない情報の入れ替え＝打ち切りの当たり外れを均す）。 */
function shuffleHidden(row: BattleStateRow, seed: number): BattleStateRow {
  let a = seed | 0;
  const rnd = () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const sh = (xs: string[]) => { const o = xs.slice(); for (let i = o.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [o[i], o[j]] = [o[j], o[i]]; } return o; };
  const ps = (p: BattleStateRow['host_state']) => ({ ...p, deck: sh(p.deck ?? []), life_cloth: sh(p.life_cloth ?? []) });
  return { ...row, host_state: ps(row.host_state), guest_state: ps(row.guest_state) };
}

async function runTo(m: ReturnType<typeof createHeadlessMatch>, until: (r: BattleStateRow) => boolean) {
  for (let i = 0; i < MAX_STEPS; i++) {
    const r = m.row();
    if (r.winner_id || until(r)) return;
    const k = await m.step();
    if (k === 'idle' || k === 'finished') return;
  }
}

async function play(a0: SelfPlayDeck, b0: SelfPlayDeck, seed: number): Promise<{ samples: Sample[]; turns: number }> {
  const used = new Set([...a0.mainDeck, ...a0.lrigDeck, ...b0.mainDeck, ...b0.lrigDeck].map(n => String(n).split('#')[0]));
  const cards = cardsForMatch(allCards, used);
  const cardMap = new Map(cards.map(c => [c.CardNum, c]));
  rngState.a = seed | 0; setRng(rngNext);
  const setup = buildHeadlessRow({ seats: { host: a0, guest: b0 }, hostId: HOST_ID, firstPlayerId: seed % 2 ? HOST_ID : CPU_PLAYER_ID, cardMap, policy: { host: POL_A, guest: POL_A } });
  const base = { cards, cpuPlans: { host: a0.plan, guest: b0.plan } };
  const memo = createRuleCheckMemo();
  const main = createHeadlessMatch(setup.row, { ...base, policy: { host: POL_A, guest: POL_A }, initialLogs: setup.logs, memo });
  // ── 本線＝各ターンの頭を保存 ──
  const snaps: { turn: number; json: string; memo: RuleCheckMemo; rng: number; key: string }[] = [];
  let lastTurn = -1;
  for (let i = 0; i < MAX_STEPS; i++) {
    const r = main.row();
    if (r.turn_count !== lastTurn && !r.winner_id) {
      lastTurn = r.turn_count;
      snaps.push({ turn: r.turn_count, json: JSON.stringify(r), memo: cloneMemo(memo), rng: rngState.a, key: boardKey(r) });
    }
    if (r.winner_id) break;
    const k = await main.step();
    if (k === 'idle' || k === 'finished') break;
  }
  const final = main.row();
  const tag = `${a0.name} vs ${b0.name} s${seed}`;
  const samples: Sample[] = [];
  if (!final.winner_id) return { samples, turns: lastTurn };
  const keyAt = new Map(snaps.map(s => [s.turn, s.key]));
  // ── 分岐＝手番の側だけ B で2ターン ──
  for (const s of snaps) {
    const row0 = JSON.parse(s.json) as BattleStateRow;
    const side: 'host' | 'guest' = row0.active_user_id === HOST_ID ? 'host' : 'guest';
    const fm = cloneMemo(s.memo);
    rngState.a = s.rng;
    const f = createHeadlessMatch(row0, { ...base, policy: side === 'host' ? { host: POL_B, guest: POL_A } : { host: POL_A, guest: POL_B }, memo: fm });
    try { await runTo(f, r => r.turn_count >= s.turn + 2); } catch { continue; }
    const fr = f.row();
    const mainKey = keyAt.get(s.turn + 2) ?? boardKey(final);
    if (boardKey(fr) === mainKey) continue;   // 判断が変わらなかった
    if (process.env.EVAL_DEBUG) { const snapNext = snaps.find(x => x.turn === s.turn + 2); const mr = snapNext ? JSON.parse(snapNext.json) : final; const diff: string[] = []; const walk = (x: any, y: any, path: string) => { if (diff.length > 8) return; if (JSON.stringify(x) === JSON.stringify(y)) return; if (x && y && typeof x === 'object' && typeof y === 'object' && !Array.isArray(x)) { for (const k of new Set([...Object.keys(x), ...Object.keys(y)])) walk(x[k], y[k], path + '.' + k); return; } diff.push(path + ' main=' + normIds(JSON.stringify(y)).slice(0, 120) + ' fork=' + normIds(JSON.stringify(x)).slice(0, 120)); }; walk({ h: fr.host_state, g: fr.guest_state, t: fr.turn_count, p: fr.turn_phase, a: fr.active_user_id, st: fr.effect_stack }, { h: mr.host_state, g: mr.guest_state, t: mr.turn_count, p: mr.turn_phase, a: mr.active_user_id, st: mr.effect_stack }, ''); console.error('DIFF T' + s.turn, diff.join(' || ')); }
    // 分岐した＝両席 A で最後まで。🆕`--rollouts R`（R≥2）＝**山札とライフクロスの並びを入れ替えて R 回**打ち切り、平均を取る
    //   （どちらのプレイヤーにも見えない情報だけを入れ替える＝判断の良し悪しは変えずに展開の当たり外れを均す）。
    //   🔑A と B に**同じ入れ替え**を使う（共通乱数）＝乱数の当たり外れが差から打ち消し合う。
    const snapNext = snaps.find(x => x.turn === s.turn + 2);
    const startA = snapNext ? { row: JSON.parse(snapNext.json) as BattleStateRow, memo: snapNext.memo } : { row: final, memo: memo };
    const startB = { row: fr, memo: fm };
    const roll = async (st: { row: BattleStateRow; memo: RuleCheckMemo }, r: number) => {
      if (st.row.winner_id) return st.row;
      const row = ROLLOUTS > 1 ? shuffleHidden(st.row, (seed * 1000003 + s.turn * 101 + r) | 0) : st.row;
      rngState.a = (seed * 7919 + s.turn * 31 + r) | 0;
      const g = createHeadlessMatch(row, { ...base, policy: { host: POL_A, guest: POL_A }, memo: cloneMemo(st.memo) });
      await runTo(g, () => false);
      return g.row();
    };
    let sa = 0, sb = 0, la = 0, lb = 0, n = 0;
    try {
      for (let r = 0; r < ROLLOUTS; r++) {
        // R=1 は従来どおり（A＝本線の結果をそのまま使う）。
        const ea = ROLLOUTS > 1 ? await roll(startA, r) : final;
        const eb = await roll(startB, r);
        if (!ea.winner_id || !eb.winner_id) continue;
        const oa = outcome(ea, side), ob = outcome(eb, side);
        sa += oa.res; sb += ob.res; la += oa.life; lb += ob.life; n++;
      }
    } catch { continue; }
    if (n === 0) continue;
    samples.push({ game: tag, turn: s.turn, side, deck: side === 'host' ? a0.name : b0.name, a: sa / n, b: sb / n, lifeA: la / n, lifeB: lb / n });
  }
  return { samples, turns: lastTurn };
}

function summarize(samples: Sample[], turns: number, games: number) {
  const n = samples.length;
  const better = samples.filter(s => s.b > s.a).length, worse = samples.filter(s => s.b < s.a).length;
  const d = samples.map(s => (s.b - s.a) / 2);
  const mean = n ? d.reduce((x, y) => x + y, 0) / n : 0;
  const sd = n > 1 ? Math.sqrt(d.reduce((x, y) => x + (y - mean) ** 2, 0) / (n - 1)) : 0;
  const half = n > 1 ? tCritical95(n - 1) * sd / Math.sqrt(n) : NaN;
  const ld = samples.map(s => s.lifeB - s.lifeA);
  const lm = n ? ld.reduce((x, y) => x + y, 0) / n : 0;
  console.log(`A=${POL_A.name}${A_SET ? `(${A_SET})` : ''} B=${POL_B.name}${B_SET ? `(${B_SET})` : ''}｜${games}戦・ターン ${turns}｜判断が分かれた場面 ${n}`);
  console.log(`  B で勝敗が良くなった ${better}／悪くなった ${worse}／変わらず ${n - better - worse}`);
  console.log(`  勝敗の差（B−A・1場面あたり・勝ち=+1）平均 ${mean >= 0 ? '+' : ''}${mean.toFixed(3)} [${(mean - half).toFixed(3)}, ${(mean + half).toFixed(3)}]`
    + `${n > 1 && (mean - half > 0 || mean + half < 0) ? (mean > 0 ? '｜🔎B が強い' : '｜🔎B が弱い') : '｜差があるとは言えない'}`);
  console.log(`  終局のライフ差の差 平均 ${lm >= 0 ? '+' : ''}${lm.toFixed(2)}`);
  if (better + worse > 0) {
    // 符号検定（両側・正規近似）＝勝敗が動いた場面だけで B の勝ち越しを見る。
    const z = (better - worse) / Math.sqrt(better + worse);
    console.log(`  符号検定 z=${z.toFixed(2)}${Math.abs(z) >= 1.96 ? '（5%で有意）' : ''}`);
  }
}

(async () => {
  if (JOBS <= 1 || argv.includes('--worker')) {
    const [t0, t1] = arg('--tasks', `0-${tasks.length - 1}`).split('-').map(Number);
    const all: Sample[] = []; let turns = 0, games = 0;
    for (let i = t0; i <= t1 && i < tasks.length; i++) {
      const [pi, seed] = tasks[i];
      const [an, bn] = pairs[pi];
      const r = await play(resolveSelfPlayDeck(an, allCardMap), resolveSelfPlayDeck(bn, allCardMap), seed);
      games++; turns += r.turns; all.push(...r.samples);
      if (argv.includes('--worker')) console.log(`GAME ${JSON.stringify({ turns: r.turns, samples: r.samples })}`);
    }
    if (!argv.includes('--worker')) { summarize(all, turns, games); if (OUT) fs.writeFileSync(OUT, all.map(s => JSON.stringify(s)).join('\n') + '\n'); }
    return;
  }
  const t0 = Date.now();
  const self = fileURLToPath(import.meta.url);
  const jobs = Math.min(JOBS, tasks.length);
  console.log(`山 ${names.length}・対 ${pairs.length}・シード ${SEEDS.length}＝${tasks.length}戦｜並列 ${jobs}`);
  const outs = await Promise.all(Array.from({ length: jobs }, (_, j) => new Promise<string>(res => {
    // ⚠塊で割らない（試合の長さがばらつく）＝ j, j+jobs, … を1本ずつ渡す。
    const mine = tasks.map((_, i) => i).filter(i => i % jobs === j);
    let buf = '';
    const runOne = (k: number) => {
      if (k >= mine.length) return res(buf);
      const ch = spawn(process.execPath, ['--import', 'tsx', self, '--worker', '--tasks', `${mine[k]}-${mine[k]}`, ...argv.filter(a => a !== '--worker')],
        { stdio: ['ignore', 'pipe', 'inherit'], env: process.env });
      ch.stdout.on('data', d => { buf += d; });
      ch.on('close', () => runOne(k + 1));
    };
    runOne(0);
  })));
  const all: Sample[] = []; let turns = 0, games = 0;
  for (const l of outs.join('').split(/\r?\n/)) if (l.startsWith('GAME ')) { const g = JSON.parse(l.slice(5)); games++; turns += g.turns; all.push(...g.samples); }
  summarize(all, turns, games);
  if (OUT) fs.writeFileSync(OUT, all.map(s => JSON.stringify(s)).join('\n') + '\n');
  console.log(`壁時計 ${((Date.now() - t0) / 1000).toFixed(0)}秒`);
})();
