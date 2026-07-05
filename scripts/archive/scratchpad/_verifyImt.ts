import fs from 'fs';
import { join } from 'path';
import Papa from 'papaparse';
import { executeEffect, resumeSelectTarget, resumeSearch, resumeChoose, type ExecCtx, type ExecResult } from '../src/engine/effectExecutor';
import type { CardData } from '../src/types';
import type { CardEffect, EffectAction } from '../src/types/effects';

const root = process.cwd();
const cardMap = new Map<string, CardData>();
for (let i = 1; i <= 11; i++) {
  const p = join(root, 'public/data', `CardData_Sheet${i}.csv`);
  if (!fs.existsSync(p)) continue;
  const { data } = Papa.parse<Record<string, string>>(fs.readFileSync(p, 'utf-8').replace(/^﻿/, ''), { header: true, skipEmptyLines: true });
  for (const r of data) { const id = r.CardNum?.trim(); if (id && !cardMap.has(id)) cardMap.set(id, r as unknown as CardData); }
}
const POOL = [...cardMap.values()].filter(c => c.Type === 'シグニ').map(c => c.CardNum);
let cursor = 0; const fresh = () => POOL[cursor++ % POOL.length];
const fill = (n: number) => Array.from({ length: n }, fresh);
function mkState(deckTop: string[]) {
  return { deck: [...deckTop, ...fill(20)], lrig_deck: [], hand: fill(5), life_cloth: fill(7), trash: fill(3), lrig_trash: [], energy: fill(5), coins: 3, bonds: [],
    field: { lrig: [], signi: [null, null, null], signi_down: [false,false,false], signi_frozen: [false,false,false], assist_lrig_l: [], assist_lrig_r: [], check: null, key_piece: null, free_zone: [], signi_traps: [null,null,null] } } as never;
}
function mkCtx(deckTop: string[]): ExecCtx {
  return { ownerState: mkState(deckTop), otherState: mkState([]), cardMap, logs: [], currentPhase: 'MAIN' } as unknown as ExecCtx;
}
function run(eff: EffectAction, ctx: ExecCtx): ExecResult {
  let result = executeEffect({ effectId: 't', effectType: 'AUTO', action: eff, duration: 'INSTANT', mandatory: true } as CardEffect, ctx);
  let steps = 0;
  while (!result.done) {
    if (++steps > 40) throw new Error('hang');
    const p = (result as { pending: Record<string, unknown> }).pending;
    const c: ExecCtx = { ...ctx, ownerState: result.ownerState, otherState: result.otherState, logs: result.logs };
    switch (p.type) {
      case 'SELECT_TARGET': { const cands = (p.candidates as string[]) ?? []; result = resumeSelectTarget(cands.slice(0, (p.count as number) ?? 1), p as never, c); break; }
      case 'SEARCH': { const vis = (p.visibleCards as string[]) ?? []; result = resumeSearch(vis.slice(0, (p.maxPick as number) ?? 0), p as never, c); break; }
      case 'CHOOSE': { const opts = (p.options as { id: string; available?: boolean }[]) ?? []; const pick = opts.find(o => o.available !== false) ?? opts[0]; result = resumeChoose(pick.id, p as never, c); break; }
      default: throw new Error('unhandled ' + p.type);
    }
  }
  return result;
}

const DEMON = 'WD05-009';
const NON = 'WD01-009';
const eff = (cond: unknown): EffectAction => ({ type: 'SEQUENCE', steps: [
  { type: 'TRASH', target: { type: 'DECK_CARD', owner: 'self', count: 3 } },
  { type: 'CONDITIONAL', condition: cond, then: { type: 'DRAW', owner: 'self', count: 1 } },
] } as never);

const cond = { type: 'TRASHED_STORY_COUNT_GTE', story: '悪魔', count: 3 };
// case1: 3 demons on top → draw fires
let ctx = mkCtx([DEMON, DEMON, DEMON]);
let h0 = ctx.ownerState.hand.length;
let r = run(eff(cond), ctx);
console.log('3 demons: hand', h0, '->', r.ownerState.hand.length, r.ownerState.hand.length === h0 + 1 ? 'PASS(draw fired)' : 'FAIL');
// case2: 0 demons → no draw
ctx = mkCtx([NON, NON, NON]);
h0 = ctx.ownerState.hand.length;
r = run(eff(cond), ctx);
console.log('0 demons: hand', h0, '->', r.ownerState.hand.length, r.ownerState.hand.length === h0 ? 'PASS(no draw)' : 'FAIL');
// baseline: IS_MY_TURN always fires (the bug)
ctx = mkCtx([NON, NON, NON]);
h0 = ctx.ownerState.hand.length;
r = run(eff({ type: 'IS_MY_TURN' }), ctx);
console.log('IS_MY_TURN 0 demons: hand', h0, '->', r.ownerState.hand.length, r.ownerState.hand.length === h0 + 1 ? '(bug reproduced: draws unconditionally)' : '?');
