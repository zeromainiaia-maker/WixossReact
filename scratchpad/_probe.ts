/** STUB no-op 仮説の実測: 各効果を実行し、素の[STUB:]フォールバック件数と「状態無変化」件数を数える */
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
const STEP_CAP = 200;

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
const lrigCard = [...cardMap.values()].find(c => c.Type === 'ルリグ')?.CardNum;
let cursor = 0;
const fill = (n: number) => Array.from({ length: n }, () => signiPool[cursor++ % signiPool.length]);
function mkState(sourceNum: string | null): PlayerState {
  return {
    deck: fill(20), lrig_deck: [], hand: fill(5), life_cloth: fill(7),
    trash: fill(3), lrig_trash: [], energy: fill(5), coins: 3, bonds: [],
    field: { lrig: lrigCard ? [lrigCard] : [], signi: [sourceNum ? [sourceNum] : null, null, null],
      assist_lrig_l: [], assist_lrig_r: [], check: null, key_piece: null, free_zone: [], signi_traps: [null, null, null] },
  } as unknown as PlayerState;
}
function mkCtx(sourceNum: string): ExecCtx {
  return { ownerState: mkState(sourceNum), otherState: mkState(signiPool[(cursor++) % signiPool.length]),
    cardMap, logs: [], sourceCardNum: sourceNum, triggeringCardNum: sourceNum, currentPhase: 'MAIN' } as unknown as ExecCtx;
}
// 状態指紋: 両者の全ゾーンのカード列＋coins
function fingerprint(st: PlayerState): string {
  const f = st.field;
  return JSON.stringify([st.deck, st.hand, st.life_cloth, st.trash, st.energy, st.coins,
    f.signi, f.lrig, f.assist_lrig_l, f.assist_lrig_r, f.check, f.key_piece, f.free_zone, f.signi_traps]);
}
function autopilot(first: ExecResult, baseCtx: ExecCtx): { status: string; logs: string[]; end?: ExecResult } {
  let result = first; let steps = 0; let lastSig = ''; let sameN = 0;
  while (!result.done) {
    if (++steps > STEP_CAP) return { status: 'HANG', logs: result.logs };
    const pending = (result as { pending: { type: string;[k: string]: unknown } }).pending;
    const p = pending as Record<string, unknown>;
    const sig = `${pending.type}:${JSON.stringify(p.candidates ?? (p.options as { id: string }[] | undefined)?.map(o => o.id) ?? p.cards ?? '')}`;
    if (sig === lastSig) { if (++sameN > 4) return { status: 'SKIP', logs: result.logs }; } else { lastSig = sig; sameN = 0; }
    const ctx: ExecCtx = { ...baseCtx, ownerState: result.ownerState, otherState: result.otherState, logs: result.logs };
    const zone = steps % 3;
    try {
      switch (pending.type) {
        case 'SELECT_TARGET': { const c = (p.candidates as string[]) ?? []; result = resumeSelectTarget(c.slice(0, Math.min((p.count as number) ?? 1, c.length)), pending as never, ctx); break; }
        case 'SEARCH': { const v = (p.visibleCards as string[]) ?? []; result = resumeSearch(v.slice(0, Math.min((p.maxPick as number) ?? 0, v.length)), pending as never, ctx); break; }
        case 'CHOOSE': { const opts = (p.options as { id: string; label?: string; available?: boolean }[]) ?? []; const skip = opts.find(o => /skip|スキップ|しない|代わりに/i.test(o.label ?? '') || o.id === 'skip'); const pick = skip ?? opts.find(o => o.available !== false) ?? opts[0]; if (!pick) return { status: 'SKIP', logs: result.logs }; result = resumeChoose(pick.id, pending as never, ctx); break; }
        case 'LOOK_AND_REORDER': { const c = (p.cards as string[]) ?? []; result = resumeLookAndReorder(c, [], pending as never, ctx); break; }
        case 'SELECT_ZONE': result = resumeSelectZone(zone, pending as never, ctx); break;
        case 'SELECT_SIGNI_ZONE': result = resumeSelectSigniZone(zone, pending as never, ctx); break;
        case 'SELECT_VIRUS_ZONE': result = resumeSelectVirusZone(sameN >= 3 ? null : zone, pending as never, ctx); break;
        case 'REARRANGE_SIGNI': { const arr = (p.signi as string[]) ?? (p.cards as string[]) ?? []; result = resumeRearrangeSigni(arr, pending as never, ctx); break; }
        default: return { status: 'SKIP', logs: result.logs };
      }
    } catch { return { status: 'CRASH', logs: result.logs }; }
  }
  return { status: 'OK', logs: result.logs, end: result };
}

let total = 0, rawStub = 0, noChange = 0, noChangeOK = 0, rawStubAndNoChange = 0;
const rawStubIds = new Map<string, number>();
for (const [num, effs] of effectsMap) {
  for (const eff of effs) {
    total++;
    try {
      const ctx = mkCtx(num);
      const before = fingerprint(ctx.ownerState) + '|' + fingerprint(ctx.otherState);
      const r = autopilot(executeEffect(eff, ctx), ctx);
      const hasRaw = r.logs.some(l => /^\[STUB: /.test(l));
      if (hasRaw) { rawStub++; for (const l of r.logs) { const m = l.match(/^\[STUB: ([^\]]+)\]/); if (m) rawStubIds.set(m[1], (rawStubIds.get(m[1]) ?? 0) + 1); } }
      if (r.status === 'OK' && r.end) {
        const after = fingerprint(r.end.ownerState) + '|' + fingerprint(r.end.otherState);
        if (after === before) { noChange++; noChangeOK++; if (hasRaw) rawStubAndNoChange++; }
      }
    } catch { /* ignore */ }
  }
}
console.log('効果総数:', total);
console.log('素の[STUB:]フォールバックに落ちた効果:', rawStub, `(${(100 * rawStub / total).toFixed(1)}%)`);
console.log('  └ そのうち状態が一切変化しなかった:', rawStubAndNoChange);
console.log('OK完走したが状態が一切変化しなかった効果:', noChangeOK, `(${(100 * noChangeOK / total).toFixed(1)}%)`);
console.log('\n素[STUB:]フォールバックのid別 上位20:');
[...rawStubIds.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20).forEach(([id, n]) => console.log(`  ${String(n).padStart(4)}  ${id}`));
