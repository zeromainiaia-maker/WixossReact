/**
 * smokeTest.ts — engine スモーク／不変条件ハーネス（②実行レベルの自動検証・プロトタイプ）
 *
 * 目的: 全カードの全効果を「オートパイロット（pending を自動応答）」でヘッドレス実行し、
 *   ・例外（クラッシュ＝engineバグ）
 *   ・無限ループ（ステップ上限超過）
 *   ・構造不変条件違反（field.signi が3ゾーンでない 等）
 *   を機械的に検出する。実機（ブラウザ対戦）不要。「壊れない」を保証する第一段。
 *   ※「ルール的に正しい結果か」（③）は判定しない。
 *
 * 使い方: npx tsx scripts/smokeTest.ts [--limit N] [--verbose] [--id WX01-001]
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
const LIMIT = argVal('--limit') ? parseInt(argVal('--limit')!) : Infinity;
const VERBOSE = args.includes('--verbose');
const ONLY_ID = argVal('--id');
const STEP_CAP = 60;

// ── データ読み込み（decompileEffects と同じ）──
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

// engine は cardMap.get(インスタンスID) で照合するため、インスタンスID＝素のCardNum（#suffixなし）を使う。
// これを怠ると対象系効果が候補0で静かに no-op し、スモークが空振りする。distinct カーソルで払い出す。
const signiPool = [...cardMap.values()].filter(c => c.Type === 'シグニ' && +(c.Power || '0') > 0).map(c => c.CardNum);
const lrigCard = [...cardMap.values()].find(c => c.Type === 'ルリグ')?.CardNum;
let cursor = 0;
const fill = (n: number) => Array.from({ length: n }, () => signiPool[cursor++ % signiPool.length]);

function mkState(sourceNum: string | null): PlayerState {
  return {
    deck: fill(20), lrig_deck: [], hand: fill(5), life_cloth: fill(7),
    trash: fill(3), lrig_trash: [], energy: fill(5), coins: 3, bonds: [],
    field: {
      lrig: lrigCard ? [lrigCard] : [],
      signi: [sourceNum ? [sourceNum] : null, null, null],
      assist_lrig_l: [], assist_lrig_r: [], check: null, key_piece: null, free_zone: [],
      signi_traps: [null, null, null],
    },
  } as unknown as PlayerState;
}

function mkCtx(sourceNum: string): ExecCtx {
  return {
    ownerState: mkState(sourceNum),
    otherState: mkState(signiPool[(cursor++) % signiPool.length]),
    cardMap: cardMap as Map<string, CardData>,
    logs: [],
    sourceCardNum: sourceNum,
    triggeringCardNum: sourceNum,
    currentPhase: 'MAIN',
  } as unknown as ExecCtx;
}

// オートパイロット: pending を最小入力で自動応答し done まで進める
function autopilot(first: ExecResult, baseCtx: ExecCtx): { status: string; detail?: string } {
  let result = first;
  let steps = 0;
  let lastSig = ''; let sameN = 0; // 同一シグネチャ（候補が同一）の連続＝真のループ。種別違い/候補変化は進行とみなす
  while (!result.done) {
    if (++steps > STEP_CAP) return { status: 'HANG', detail: `step>${STEP_CAP}` };
    const pending = (result as { pending: { type: string; [k: string]: unknown } }).pending;
    const p = pending as Record<string, unknown>;
    const sig = `${pending.type}:${JSON.stringify(p.candidates ?? (p.options as { id: string }[] | undefined)?.map(o => o.id) ?? p.cards ?? '')}`;
    if (sig === lastSig) { if (++sameN > 4) return { status: 'SKIP', detail: `autopilot loop: ${pending.type}` }; }
    else { lastSig = sig; sameN = 0; }
    const ctx: ExecCtx = { ...baseCtx, ownerState: result.ownerState, otherState: result.otherState, logs: result.logs };
    const zone = steps % 3; // ゾーン選択は巡回（占有済み zone0 の再選択ループを避ける）
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
          const pick = skip ?? opts.find(o => o.available !== false) ?? opts[0];
          if (!pick) return { status: 'SKIP', detail: 'CHOOSE no options' };
          result = resumeChoose(pick.id, pending as never, ctx);
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
  // 構造不変条件
  for (const [who, st] of [['owner', result.ownerState], ['other', result.otherState]] as const) {
    const sig = (st as PlayerState)?.field?.signi;
    if (!Array.isArray(sig) || sig.length !== 3) return { status: 'INVARIANT', detail: `${who}.field.signi 長さ=${sig?.length}` };
  }
  return { status: 'OK' };
}

// ── 実行 ──
const counts: Record<string, number> = { OK: 0, CRASH: 0, HANG: 0, INVARIANT: 0, SKIP: 0 };
const crashes: { card: string; eff: string; detail: string }[] = [];
let cardN = 0;
for (const [num, effs] of effectsMap) {
  if (ONLY_ID && num !== ONLY_ID) continue;
  if (cardN++ >= LIMIT) break;
  for (const eff of effs) {
    let res: { status: string; detail?: string };
    try {
      const ctx = mkCtx(num);
      const first = executeEffect(eff, ctx);
      res = autopilot(first, ctx);
    } catch (e) {
      res = { status: 'CRASH', detail: `[executeEffect] ${(e as Error).message}` };
    }
    counts[res.status] = (counts[res.status] ?? 0) + 1;
    if (res.status !== 'OK') {
      if (res.status !== 'SKIP') crashes.push({ card: num, eff: eff.effectId ?? '?', detail: res.detail ?? '' });
      if (VERBOSE) console.log(`  [${res.status}] ${num} ${eff.effectId}: ${res.detail}`);
    }
  }
}

console.log('\n===== smokeTest 結果 =====');
const total = Object.values(counts).reduce((a, b) => a + b, 0);
console.log(`効果総数: ${total}  | OK ${counts.OK} / CRASH ${counts.CRASH} / HANG ${counts.HANG} / INVARIANT ${counts.INVARIANT} / SKIP(対話未対応) ${counts.SKIP}`);
// CRASH の上位を detail 別に集計
const byDetail = new Map<string, { n: number; ex: string }>();
for (const c of crashes) {
  const key = c.detail.replace(/#f\d+|#src|#opp|#lrig/g, '').replace(/\d+/g, 'N').slice(0, 80);
  const cur = byDetail.get(key) ?? { n: 0, ex: `${c.card} ${c.eff}` };
  cur.n++; byDetail.set(key, cur);
}
console.log(`\n--- CRASH/HANG/INVARIANT 内訳（detail 正規化・上位30）---`);
[...byDetail.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, 30)
  .forEach(([k, v]) => console.log(`  ${String(v.n).padStart(4)}件  ${k}   例:${v.ex}`));
