/**
 * selfPlayFuzz.ts — 乱択 自己対戦ファズ（②実行レベル検証の最終形・ヘッドレス）
 *
 * smokeTest.ts が「全効果を 1 回ずつ・新品盤面で」実行するのに対し、本ファズは
 *   ・ランダムな初期盤面（両者の場・手札・エナ・トラッシュ・コイン・ライフをランダム生成）
 *   ・その盤面上で効果を次々に発動 → 結果状態を持ち越し → 別の効果を発動…と「連鎖」させる
 * ことで、smoke が拾えない「効果同士の相互作用」「進化した盤面でのクラッシュ」「ループ」を機械検出する。
 *
 * 検出: 例外（CRASH）／無限ループ（HANG）／構造不変条件違反（INVARIANT）／カード爆発（EXPLOSION・複製バグ）。
 * 実機（ブラウザ対戦）不要。シード固定で完全再現可能（失敗はシード＋手番で再現）。
 *
 * ⚠限界: engine（executeEffect/resume*）の堅牢性を盤面遷移つきで検証する。
 *   BattleScreen.tsx 側のオーケストレーション（フェイズ進行・トリガー収集 collect*Triggers・effect_stack 整列）は
 *   React/supabase 結合のため本ファズの対象外＝それらは引き続き実機(C2)か Stage2（collect*Triggers のpure抽出）が要る。
 *
 * 使い方: npx tsx scripts/selfPlayFuzz.ts [--games N] [--moves M] [--seed S] [--verbose]   （npm run fuzz）
 */
import fs from 'fs';
import { join } from 'path';
import Papa from 'papaparse';
import type { CardData, PlayerState } from '../src/types';
import type { CardEffect } from '../src/types/effects';
import { mergeManualEffects } from '../src/data/manualEffects';
import {
  executeEffect,
  resumeSelectTarget, resumeSearch, resumeChoose,
  resumeLookAndReorder, resumeSelectZone, resumeSelectVirusZone,
  resumeSelectSigniZone, resumeRearrangeSigni,
  type ExecCtx, type ExecResult,
} from '../src/engine/effectExecutor';

const root = process.cwd();
const args = process.argv.slice(2);
const argVal = (k: string) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined; };
const GAMES = argVal('--games') ? parseInt(argVal('--games')!) : 200;
const MOVES = argVal('--moves') ? parseInt(argVal('--moves')!) : 40;
const SEED0 = argVal('--seed') ? parseInt(argVal('--seed')!) : 0xC0FFEE;
const VERBOSE = args.includes('--verbose');
const STEP_CAP = 200;
const EXPLOSION_DELTA = 120; // 1ゲーム内でカード総数が基準＋これを超えたら複製疑い（トークン生成を考慮した余裕値）

// ── 乱数（mulberry32・シード固定で再現可能）──
function mulberry32(a: number) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── データ読み込み（smokeTest と同じ）──
const cardMap = new Map<string, CardData>();
for (const f of [...Array.from({ length: 11 }, (_, i) => `CardData_Sheet${i + 1}.csv`), 'CardData_TK.csv']) {
  const p = join(root, 'public/data', f);
  if (!fs.existsSync(p)) continue;
  const text = fs.readFileSync(p, 'utf-8').replace(/^﻿/, '');
  const { data } = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: true });
  for (const r of data) { const id = r.CardNum?.trim(); if (id && !cardMap.has(id)) cardMap.set(id, r as unknown as CardData); }
}
const effectsMap = new Map<string, CardEffect[]>();
for (const f of ['effects_WX.json', 'effects_WXDi.json', 'effects_WX24_26.json', 'effects_WXK.json', 'effects_misc.json']) {
  const j = JSON.parse(fs.readFileSync(join(root, 'public/data', f), 'utf-8'));
  for (const [id, effs] of Object.entries(j)) effectsMap.set(id, effs as CardEffect[]);
}
for (const [id, card] of cardMap) {
  const merged = mergeManualEffects(id, (effectsMap.get(id) ?? []) as never[]);
  if (merged.length > 0) { effectsMap.set(id, merged as CardEffect[]); (card as { effects?: CardEffect[] }).effects = merged as CardEffect[]; }
}

const signiPool = [...cardMap.values()].filter(c => c.Type === 'シグニ' && +(c.Power || '0') > 0).map(c => c.CardNum);
const lrigPool = [...cardMap.values()].filter(c => c.Type === 'ルリグ').map(c => c.CardNum);
// 効果を持つシグニ（発火対象に偏らせて空振りを減らす）
const effectSigniPool = signiPool.filter(n => (effectsMap.get(n) ?? []).length > 0);

// ── ランダム盤面生成 ──
function pick<T>(rng: () => number, arr: T[]): T { return arr[Math.floor(rng() * arr.length) % arr.length]; }
function fill(rng: () => number, n: number, pool: string[]): string[] {
  return Array.from({ length: n }, () => pick(rng, pool));
}
// signi ゾーン: 各ゾーン 60% でシグニ（効果持ちに偏らせる）、残りは null
function randSigni(rng: () => number): (string[] | null)[] {
  return Array.from({ length: 3 }, () => rng() < 0.6 ? [pick(rng, effectSigniPool)] : null);
}
function mkState(rng: () => number): PlayerState {
  return {
    deck: fill(rng, 20, signiPool), lrig_deck: [], hand: fill(rng, 4 + Math.floor(rng() * 3), signiPool),
    life_cloth: fill(rng, 3 + Math.floor(rng() * 5), signiPool),
    trash: fill(rng, 2 + Math.floor(rng() * 6), signiPool), lrig_trash: [],
    energy: fill(rng, 3 + Math.floor(rng() * 5), signiPool), coins: Math.floor(rng() * 6), bonds: [],
    field: {
      lrig: [pick(rng, lrigPool)],
      signi: randSigni(rng),
      assist_lrig_l: [], assist_lrig_r: [], check: null, key_piece: null, free_zone: [],
      signi_traps: [null, null, null],
      signi_down: [false, false, false], signi_frozen: [false, false, false],
    },
    actions_done: [],
  } as unknown as PlayerState;
}

// 場の総カード数（複製/消失の粗検出用）。signiスタックは全段を数える。
function totalCards(st: PlayerState): number {
  let n = (st.deck?.length ?? 0) + (st.hand?.length ?? 0) + (st.life_cloth?.length ?? 0)
    + (st.trash?.length ?? 0) + (st.lrig_trash?.length ?? 0) + (st.energy?.length ?? 0)
    + (st.field?.lrig?.length ?? 0);
  for (const stack of (st.field?.signi ?? [])) n += (stack?.length ?? 0);
  return n;
}

// 構造不変条件チェック。違反メッセージを返す（OK なら null）。
function checkInvariant(st: PlayerState, who: string): string | null {
  const sig = st?.field?.signi;
  if (!Array.isArray(sig) || sig.length !== 3) return `${who}.field.signi 長さ=${sig?.length}`;
  for (let i = 0; i < 3; i++) {
    const stack = sig[i];
    if (stack !== null && !Array.isArray(stack)) return `${who}.field.signi[${i}] が配列でもnullでもない`;
    if (Array.isArray(stack) && stack.some(c => typeof c !== 'string')) return `${who}.field.signi[${i}] に非文字列`;
  }
  for (const z of ['deck', 'hand', 'trash', 'energy', 'life_cloth'] as const) {
    const arr = (st as unknown as Record<string, unknown>)[z];
    if (!Array.isArray(arr)) return `${who}.${z} が配列でない`;
    if ((arr as unknown[]).some(c => typeof c !== 'string')) return `${who}.${z} に非文字列`;
  }
  return null;
}

// オートパイロット（smokeTest と同一ロジック）: pending を最小入力で done まで進める。
function autopilot(first: ExecResult, baseCtx: ExecCtx): { status: string; detail?: string; result?: ExecResult } {
  let result = first;
  let steps = 0;
  let lastSig = ''; let sameN = 0;
  while (!result.done) {
    if (++steps > STEP_CAP) return { status: 'HANG', detail: `step>${STEP_CAP}` };
    const pending = (result as { pending: { type: string; [k: string]: unknown } }).pending;
    const p = pending as Record<string, unknown>;
    const sig = `${pending.type}:${JSON.stringify(p.candidates ?? (p.options as { id: string }[] | undefined)?.map(o => o.id) ?? p.cards ?? '')}`;
    if (sig === lastSig) { if (++sameN > 4) return { status: 'SKIP', detail: `autopilot loop: ${pending.type}` }; }
    else { lastSig = sig; sameN = 0; }
    const ctx: ExecCtx = { ...baseCtx, ownerState: result.ownerState, otherState: result.otherState, logs: result.logs };
    const zone = steps % 3;
    try {
      switch (pending.type) {
        case 'SELECT_TARGET': {
          const cands = (p.candidates as string[]) ?? [];
          const cnt = Math.min((p.count as number) ?? 1, cands.length);
          result = resumeSelectTarget(cands.slice(0, cnt), pending as never, ctx);
          break;
        }
        case 'SEARCH': {
          const vis = (p.visibleCards as string[]) ?? [];
          const cnt = Math.min((p.maxPick as number) ?? 0, vis.length);
          result = resumeSearch(vis.slice(0, cnt), pending as never, ctx);
          break;
        }
        case 'CHOOSE': {
          const opts = (p.options as { id: string; label?: string; available?: boolean }[]) ?? [];
          const skip = opts.find(o => /skip|スキップ|しない|代わりに/i.test(o.label ?? '') || o.id === 'skip');
          const pick2 = skip ?? opts.find(o => o.available !== false) ?? opts[0];
          if (!pick2) return { status: 'SKIP', detail: 'CHOOSE no options' };
          result = resumeChoose(pick2.id, pending as never, ctx);
          break;
        }
        case 'LOOK_AND_REORDER': {
          const cards = (p.cards as string[]) ?? [];
          result = resumeLookAndReorder(cards, [], pending as never, ctx);
          break;
        }
        case 'SELECT_ZONE': result = resumeSelectZone(zone, pending as never, ctx); break;
        case 'SELECT_SIGNI_ZONE': result = resumeSelectSigniZone(zone, pending as never, ctx); break;
        case 'SELECT_VIRUS_ZONE': result = resumeSelectVirusZone(sameN >= 3 ? null : zone, pending as never, ctx); break;
        case 'REARRANGE_SIGNI': {
          const arr = (p.signi as string[]) ?? (p.cards as string[]) ?? [];
          result = resumeRearrangeSigni(arr, pending as never, ctx);
          break;
        }
        default:
          return { status: 'SKIP', detail: `unhandled pending: ${pending.type}` };
      }
    } catch (e) {
      return { status: 'CRASH', detail: `[resume ${pending.type}] ${(e as Error).message}` };
    }
  }
  return { status: 'OK', result };
}

// ── カバレッジ統計（空振りでないことの担保）──
const cov = { executed: 0, skipped: 0, firedEffects: new Set<string>() };

// ── 1 ゲーム ──
type MoveFail = { game: number; move: number; card: string; eff: string; status: string; detail: string };
function playGame(gameSeed: number, fails: MoveFail[], gameIdx: number): void {
  const rng = mulberry32(gameSeed);
  let P = mkState(rng);
  let O = mkState(rng);
  const baseTotal = totalCards(P) + totalCards(O);

  for (let m = 0; m < MOVES; m++) {
    // owner をランダムに選ぶ（両プレイヤーの場が owner/other 両方で回るように）
    const pIsOwner = rng() < 0.5;
    const ownerState = pIsOwner ? P : O;
    const otherState = pIsOwner ? O : P;

    // 発動候補を集める: owner の場シグニ＋ルリグ＋手札（ON_PLAY 想定）の効果
    const candidates: { card: string; eff: CardEffect }[] = [];
    const addEffs = (card: string) => {
      for (const eff of (effectsMap.get(card) ?? [])) {
        if (eff.effectType === 'AUTO' || eff.effectType === 'ACTIVATED' || eff.effectType === 'LIFE_BURST') {
          candidates.push({ card, eff });
        }
      }
    };
    for (const stack of ownerState.field.signi) { const t = stack?.at(-1); if (t) addEffs(t); }
    const lrigTop = ownerState.field.lrig?.at(-1); if (lrigTop) addEffs(lrigTop);
    for (const h of ownerState.hand.slice(0, 4)) addEffs(h);
    if (candidates.length === 0) continue;

    const chosen = pick(rng, candidates);
    const ctx: ExecCtx = {
      ownerState, otherState,
      cardMap: cardMap as Map<string, CardData>,
      logs: [],
      sourceCardNum: chosen.card,
      triggeringCardNum: chosen.card,
      currentPhase: pick(rng, ['MAIN', 'ATTACK_SIGNI', 'ATTACK_LRIG']),
    } as unknown as ExecCtx;

    let res: { status: string; detail?: string; result?: ExecResult };
    try {
      const first = executeEffect(chosen.eff, ctx);
      res = autopilot(first, ctx);
    } catch (e) {
      res = { status: 'CRASH', detail: `[executeEffect] ${(e as Error).message}` };
    }

    if (res.status === 'CRASH' || res.status === 'HANG') {
      fails.push({ game: gameIdx, move: m, card: chosen.card, eff: chosen.eff.effectId ?? '?', status: res.status, detail: res.detail ?? '' });
      if (VERBOSE) console.log(`  [${res.status}] game#${gameIdx} move${m} ${chosen.card} ${chosen.eff.effectId}: ${res.detail}`);
      continue; // この手はスキップして続行（状態は持ち越さない）
    }
    if (res.status !== 'OK' || !res.result) { cov.skipped++; continue; } // SKIP 等は状態を進めない
    cov.executed++; cov.firedEffects.add(chosen.eff.effectId ?? chosen.card);

    // 結果状態を持ち越す（次の手は進化した盤面で発動）
    const newOwner = res.result.ownerState as PlayerState;
    const newOther = res.result.otherState as PlayerState;
    // 不変条件チェック
    const inv = checkInvariant(newOwner, 'owner') ?? checkInvariant(newOther, 'other');
    if (inv) {
      fails.push({ game: gameIdx, move: m, card: chosen.card, eff: chosen.eff.effectId ?? '?', status: 'INVARIANT', detail: inv });
      if (VERBOSE) console.log(`  [INVARIANT] game#${gameIdx} move${m} ${chosen.card}: ${inv}`);
      continue;
    }
    if (pIsOwner) { P = newOwner; O = newOther; } else { O = newOwner; P = newOther; }

    // カード爆発（複製バグ）検出
    const tot = totalCards(P) + totalCards(O);
    if (tot > baseTotal + EXPLOSION_DELTA) {
      fails.push({ game: gameIdx, move: m, card: chosen.card, eff: chosen.eff.effectId ?? '?', status: 'EXPLOSION', detail: `total ${baseTotal}→${tot}` });
      if (VERBOSE) console.log(`  [EXPLOSION] game#${gameIdx} move${m} ${chosen.card}: ${baseTotal}→${tot}`);
      return; // 爆発したゲームは打ち切り
    }
  }
}

// ── 実行 ──
const counts: Record<string, number> = { CRASH: 0, HANG: 0, INVARIANT: 0, EXPLOSION: 0 };
const fails: MoveFail[] = [];
const t0 = Date.now();
for (let g = 0; g < GAMES; g++) {
  playGame((SEED0 ^ (g * 0x9E3779B1)) >>> 0, fails, g);
}
for (const f of fails) counts[f.status] = (counts[f.status] ?? 0) + 1;

console.log('\n===== selfPlayFuzz 結果 =====');
console.log(`シード ${SEED0} / ${GAMES}ゲーム × 最大${MOVES}手 / ${(Date.now() - t0)}ms`);
console.log(`不具合: CRASH ${counts.CRASH} / HANG ${counts.HANG} / INVARIANT ${counts.INVARIANT} / EXPLOSION ${counts.EXPLOSION}`);
if (fails.length === 0) {
  console.log('✓ 全ゲーム 不具合なし（engine は乱択連鎖でも堅牢）');
} else {
  // detail 別に集計
  const byDetail = new Map<string, { n: number; ex: string }>();
  for (const f of fails) {
    const key = `${f.status}: ${f.detail.replace(/\d+/g, 'N').slice(0, 70)}`;
    const cur = byDetail.get(key) ?? { n: 0, ex: `${f.card} ${f.eff} (g${f.game}m${f.move})` };
    cur.n++; byDetail.set(key, cur);
  }
  console.log('\n--- 不具合 内訳（detail 正規化・上位30）---');
  [...byDetail.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, 30)
    .forEach(([k, v]) => console.log(`  ${String(v.n).padStart(4)}件  ${k}   例:${v.ex}`));
  console.log(`\n再現: npx tsx scripts/selfPlayFuzz.ts --seed ${SEED0} --verbose`);
  process.exitCode = 1;
}
