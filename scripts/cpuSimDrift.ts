/**
 * 🆕2026-10-26＝**探索の予想と実際のズレの計器**（ユーザー「１」＝CPU を強くする案の①）。
 *
 * ■ 何を測るか＝CPU の探索（`searchCpuMove`）は、手を打った後の盤面を `applyCpuMoveSim`（効果1つだけ・誘発の連鎖なし・
 *   ライフバーストなし）で**予想**して比べている。その手を実際に打ち、スタック・対話・ルール処理が解決し終わった盤面と
 *   予想を突き合わせ、**採点（`evaluateBoard`）のズレ**と**どこがズレたか**（手札・エナ・トラッシュ・場・ライフ…）を手の種類・カードごとに集計する。
 * 🔑**なぜ要るか**＝探索の読み違いはそのまま悪手になる（予想では得なのに実際は損な手を選ぶ）。ズレの大きいカード・手の種類が
 *   「先読みのどこを直せば強くなるか」の一覧になる。
 * ⚠**予想は山の順序を伏せている**（`hideDeckOrder`）＝ドローの中身は比べない（手札・山・ライフは枚数だけ）。
 * ⚠**実際の盤面には相手の誘発・ルール処理も入る**＝それを予想に入れていないのも「探索の読み違い」として数える。
 *
 * 使い方: `SELFPLAY_DECK_DIR=scratchpad-decks-claude1 npx tsx scripts/cpuSimDrift.ts --grep "レガシー／" --seeds 1 --jobs 12 [--policy default] [--out f.jsonl]`
 */
import { spawn } from 'child_process';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { join } from 'path';
import Papa from 'papaparse';
import type { BattleStateRow, CardData, PlayerState, TurnPhase } from '../src/types';
import { setRng } from '../src/engine/rng';
import { getCardNum } from '../src/engine/execUtils';
import { createRuleCheckMemo } from '../src/screens/battle/controller/ruleChecks';
import { CPU_PLAYER_ID } from '../src/screens/battle/battleUtils';
import { resolveCpuPolicy, patchCpuPolicy } from '../src/screens/battle/cpuPolicy';
import { createHeadlessMatch } from '../src/screens/battle/controller/headlessMatch';
import { buildHeadlessRow } from '../src/screens/battle/controller/headlessSetup';
import { applyCpuMoveSim, describeCpuMove, type CpuMove, type CpuMoveCtx, type CpuSimBoard } from '../src/screens/battle/cpuMoves';
import { evaluateBoard } from '../src/screens/battle/cpuLookahead';
import { resolveSelfPlayDeck, listPlayableDeckNames, type SelfPlayDeck } from './selfPlayDecks';
import { cardCsvRelPaths } from './cardDataFiles.mjs';
import { cardsForMatch } from '../src/screens/battle/matchCards';

const argv = process.argv.slice(2);
const arg = (n: string, d: string) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : d; };
const SEEDS = arg('--seeds', '1').split(',').map(Number);
const POL_NAME = arg('--policy', 'default'), POL_SET = arg('--policy-set', '');
const POL = POL_SET ? patchCpuPolicy(resolveCpuPolicy(POL_NAME), POL_SET) : resolveCpuPolicy(POL_NAME);
const GREP = arg('--grep', '');
const JOBS = Number(arg('--jobs', '1'));
const MAX_STEPS = Number(arg('--steps', '4000'));
const OUT = arg('--out', '');
const TOP = Number(arg('--top', '20'));
/** 🆕`--show <手の名前の一部>`＝当たった手ごとに予想と実際の場・トラッシュとその間のログを出す（中身を調べる口）。 */
const SHOW = arg('--show', '');
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

const rngState = { a: 0 };
const rngNext = () => {
  rngState.a = (rngState.a + 0x6D2B79F5) | 0;
  let t = Math.imul(rngState.a ^ (rngState.a >>> 15), 1 | rngState.a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

/** 1件の突き合わせ。`diffs` は「軸: 予想→実際」。 */
interface Drift { game: string; turn: number; phase: TurnPhase; kind: string; label: string; pred: number; actual: number; diffs: string[]; failed?: boolean; detail?: string }

/** 手のまとめ方＝種類＋カード番号（個体番号 `#…` とゾーン `@n` は落とす）。 */
const labelOf = (m: CpuMove) => describeCpuMove(m).replace(/#[^@\s:]*/g, '').replace(/@\d/g, '').trim();

const stackEmpty = (r: BattleStateRow) => {
  const s = r.effect_stack;
  return !s || (s.queue.length + s.pendingTurn.length + s.pendingOpp.length) === 0;
};
const settled = (r: BattleStateRow) => !r.pending_spell && !r.pending_effect && stackEmpty(r);

/** 予想と実際の軸ごとの違い（場は「生きている」シグニの一番上のカード番号）。 */
function diffBoards(pred: CpuSimBoard, act: { cpu: PlayerState; opp: PlayerState }, ctx: CpuMoveCtx): string[] {
  const out: string[] = [];
  const powPred = ctx.lookahead?.powersOf?.(pred.cpu, pred.opp);
  const powAct = ctx.lookahead?.powersOf?.(act.cpu, act.opp);
  const tops = (st: PlayerState, pw?: ReadonlyMap<string, number>) => st.field.signi
    .map(z => z?.at(-1))
    .filter((id): id is string => !!id && (pw?.get(id) ?? 1) > 0)
    .map(id => getCardNum(id)).sort().join(',');
  const cnt = (axis: string, a: number, b: number) => { if (a !== b) out.push(`${axis} ${a}→${b}`); };
  for (const [side, p, a] of [['自', pred.cpu, act.cpu], ['相手', pred.opp, act.opp]] as const) {
    cnt(`${side}手札`, p.hand.length, a.hand.length);
    cnt(`${side}エナ`, p.energy.length, a.energy.length);
    cnt(`${side}トラッシュ`, p.trash.length, a.trash.length);
    cnt(`${side}ライフ`, p.life_cloth.length, a.life_cloth.length);
    cnt(`${side}ルリグデッキ`, p.lrig_deck.length, a.lrig_deck.length);
    const tp = tops(p, powPred), ta = tops(a, powAct);
    if (tp !== ta) out.push(`${side}場 [${tp}]→[${ta}]`);
    const dp = (p.field.signi_down ?? []).filter(Boolean).length, da = (a.field.signi_down ?? []).filter(Boolean).length;
    cnt(`${side}ダウン`, dp, da);
  }
  return out;
}

async function play(a0: SelfPlayDeck, b0: SelfPlayDeck, seed: number): Promise<{ drifts: Drift[]; turns: number }> {
  const used = new Set([...a0.mainDeck, ...a0.lrigDeck, ...b0.mainDeck, ...b0.lrigDeck].map(n => String(n).split('#')[0]));
  const cards = cardsForMatch(allCards, used);
  const cardMap = new Map(cards.map(c => [c.CardNum, c]));
  rngState.a = seed | 0; setRng(rngNext);
  const setup = buildHeadlessRow({ seats: { host: a0, guest: b0 }, hostId: HOST_ID, firstPlayerId: seed % 2 ? HOST_ID : CPU_PLAYER_ID, cardMap, policy: { host: POL, guest: POL } });
  const tag = `${a0.name} vs ${b0.name} s${seed}`;
  const drifts: Drift[] = [];
  let pending: { phase: TurnPhase; move: CpuMove; ctx: CpuMoveCtx; pred: CpuSimBoard | null; turn: number; seat: 'host' | 'guest' | null; logAt: number } | null = null;
  const m = createHeadlessMatch(setup.row, {
    cards, cpuPlans: { host: a0.plan, guest: b0.plan }, policy: { host: POL, guest: POL }, initialLogs: setup.logs, memo: createRuleCheckMemo(),
    observeSearch: e => {
      // ⚠予想は**探索と同じ関数**で作り直す（決定論＝探索が見た盤面と同じ）。
      let pred: CpuSimBoard | null;
      try { pred = applyCpuMoveSim(e.ctx, e.move); } catch { pred = null; }
      pending = { ...e, pred, turn: m.row().turn_count, seat: null, logAt: m.logs.length };
    },
  });
  const close = (r: BattleStateRow) => {
    const p = pending!;
    pending = null;
    const kind = p.move.kind, label = labelOf(p.move);
    if (!p.pred || !p.seat) { drifts.push({ game: tag, turn: p.turn, phase: p.phase, kind, label, pred: 0, actual: 0, diffs: [], failed: true }); return; }
    const act = p.seat === 'host' ? { cpu: r.host_state, opp: r.guest_state } : { cpu: r.guest_state, opp: r.host_state };
    const lctx = p.ctx.lookahead;
    const pv = evaluateBoard(p.pred.cpu, p.pred.opp, lctx), av = evaluateBoard(act.cpu, act.opp, lctx);
    const diffs = diffBoards(p.pred, act, p.ctx);
    let detail: string | undefined;
    if (SHOW && label.includes(SHOW) && diffs.length > 0) {
      const b = (st: PlayerState) => `場=${JSON.stringify(st.field.signi)} チア=${st.field.cheer ?? '-'} トラッシュ末尾=${st.trash.slice(-4).join(',')} 手札${st.hand.length} エナ${st.energy.length}`;
      detail = [`  予想 自: ${b(p.pred.cpu)}`, `  予想 相: ${b(p.pred.opp)}`, `  実際 自: ${b(act.cpu)}`, `  実際 相: ${b(act.opp)}`,
        ...m.logs.slice(p.logAt).map(l => `  | ${l}`)].join('\n');
    }
    drifts.push({ game: tag, turn: p.turn, phase: p.phase, kind, label, pred: pv, actual: av, diffs, detail });
  };
  for (let i = 0; i < MAX_STEPS; i++) {
    const r0 = m.row();
    if (r0.winner_id) break;
    const k = await m.step();
    if (pending && !(pending as { seat: string | null }).seat) (pending as { seat: 'host' | 'guest' | null }).seat = m.lastActor();
    const r = m.row();
    if (pending && (settled(r) || r.winner_id)) close(r);
    if (k === 'idle' || k === 'finished') break;
  }
  return { drifts, turns: m.row().turn_count };
}

function summarize(all: Drift[], games: number) {
  const ok = all.filter(d => !d.failed);
  const abs = (d: Drift) => Math.abs(d.actual - d.pred);
  const off = ok.filter(d => d.diffs.length > 0);
  console.log(`方針=${POL.name}${POL_SET ? `(${POL_SET})` : ''}｜${games}戦｜探索が選んだ手 ${all.length}（予想できなかった ${all.length - ok.length}）`);
  console.log(`  予想どおりの盤面 ${ok.length - off.length}／ズレあり ${off.length}（${ok.length ? (100 * off.length / ok.length).toFixed(0) : 0}%）｜採点のズレ 平均 ${ok.length ? (ok.reduce((s, d) => s + (d.actual - d.pred), 0) / ok.length).toFixed(0) : 0}（絶対値の平均 ${ok.length ? (ok.reduce((s, d) => s + abs(d), 0) / ok.length).toFixed(0) : 0}）`);
  // 手の種類ごと
  const byKind = new Map<string, Drift[]>();
  for (const d of ok) byKind.set(d.kind, [...(byKind.get(d.kind) ?? []), d]);
  console.log('\n■ 手の種類ごと（件数／ズレあり／採点のズレ 平均・絶対値の平均）');
  for (const [k, ds] of [...byKind].sort((a, b) => b[1].reduce((s, d) => s + abs(d), 0) - a[1].reduce((s, d) => s + abs(d), 0))) {
    const o = ds.filter(d => d.diffs.length > 0).length;
    console.log(`  ${k.padEnd(16)} ${String(ds.length).padStart(5)}  ${String(o).padStart(5)}  ${(ds.reduce((s, d) => s + (d.actual - d.pred), 0) / ds.length).toFixed(0).padStart(7)}  ${(ds.reduce((s, d) => s + abs(d), 0) / ds.length).toFixed(0).padStart(7)}`);
  }
  // 軸ごと
  const byAxis = new Map<string, number>();
  for (const d of off) for (const x of new Set(d.diffs.map(s => s.split(' ')[0]))) byAxis.set(x, (byAxis.get(x) ?? 0) + 1);
  console.log('\n■ ズレた軸（その軸がズレた手の数）');
  for (const [x, n] of [...byAxis].sort((a, b) => b[1] - a[1])) console.log(`  ${x.padEnd(12)} ${n}`);
  // カードごと（採点のズレの絶対値の合計が大きい順）
  const byLabel = new Map<string, Drift[]>();
  for (const d of ok) byLabel.set(d.label, [...(byLabel.get(d.label) ?? []), d]);
  console.log(`\n■ 手ごと（採点のズレの絶対値の合計が大きい順・上位${TOP}）＝件数／ズレあり／平均のズレ｜例`);
  for (const [l, ds] of [...byLabel].sort((a, b) => b[1].reduce((s, d) => s + abs(d), 0) - a[1].reduce((s, d) => s + abs(d), 0)).slice(0, TOP)) {
    const o = ds.filter(d => d.diffs.length > 0);
    const ex = [...o].sort((a, b) => abs(b) - abs(a))[0];
    console.log(`  ${l}｜${ds.length}／${o.length}／${(ds.reduce((s, d) => s + (d.actual - d.pred), 0) / ds.length).toFixed(0)}｜${ex ? `${ex.game} T${ex.turn}: ${ex.diffs.slice(0, 4).join('・')}` : '-'}`);
  }
  const failedBy = new Map<string, number>();
  for (const d of all.filter(x => x.failed)) failedBy.set(d.label, (failedBy.get(d.label) ?? 0) + 1);
  if (failedBy.size) {
    console.log('\n■ 予想できなかった手（探索は選んだのに作り直すと null＝ふつうは0）');
    for (const [l, n] of [...failedBy].sort((a, b) => b[1] - a[1]).slice(0, 10)) console.log(`  ${l} ${n}`);
  }
  if (SHOW) {
    console.log(`
■ 中身（--show ${SHOW}・最大10件）`);
    for (const d of all.filter(x => x.detail).slice(0, 10)) console.log(`${d.game} T${d.turn} ${d.label}（${d.pred.toFixed(0)}→${d.actual.toFixed(0)}）
${d.detail}`);
  }
}

(async () => {
  if (JOBS <= 1 || argv.includes('--worker')) {
    const [t0, t1] = arg('--tasks', `0-${tasks.length - 1}`).split('-').map(Number);
    const all: Drift[] = []; let games = 0;
    for (let i = t0; i <= t1 && i < tasks.length; i++) {
      const [pi, seed] = tasks[i];
      const [an, bn] = pairs[pi];
      const r = await play(resolveSelfPlayDeck(an, allCardMap), resolveSelfPlayDeck(bn, allCardMap), seed);
      games++; all.push(...r.drifts);
      if (argv.includes('--worker')) console.log(`GAME ${JSON.stringify({ drifts: r.drifts })}`);
    }
    if (!argv.includes('--worker')) { summarize(all, games); if (OUT) fs.writeFileSync(OUT, all.map(s => JSON.stringify(s)).join('\n') + '\n'); }
    return;
  }
  const t0 = Date.now();
  const self = fileURLToPath(import.meta.url);
  const jobs = Math.min(JOBS, tasks.length);
  console.log(`山 ${names.length}・対 ${pairs.length}・シード ${SEEDS.length}＝${tasks.length}戦｜並列 ${jobs}`);
  const outs = await Promise.all(Array.from({ length: jobs }, (_, j) => new Promise<string>(res => {
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
  const all: Drift[] = []; let games = 0;
  for (const l of outs.join('').split(/\r?\n/)) if (l.startsWith('GAME ')) { const g = JSON.parse(l.slice(5)); games++; all.push(...g.drifts); }
  summarize(all, games);
  if (OUT) fs.writeFileSync(OUT, all.map(s => JSON.stringify(s)).join('\n') + '\n');
  console.log(`壁時計 ${((Date.now() - t0) / 1000).toFixed(0)}秒`);
})();
