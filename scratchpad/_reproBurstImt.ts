// BURST内 CONDITIONAL(IS_MY_TURN)＝「そうした場合」の実挙動再現
// WX03-034-BURST 形: SEQUENCE [TRASH(hand,古代兵器), CONDITIONAL(IS_MY_TURN) then DRAW2]
// ケースA: 手札に古代兵器あり → 捨てて2ドロー（正）
// ケースB: 手札に古代兵器なし → 正しくはドローなし／過剰なら2ドロー
import fs from 'fs';
import { join } from 'path';
import Papa from 'papaparse';
import type { CardData, PlayerState } from '../src/types';
import type { EffectAction, CardEffect } from '../src/types/effects';
import {
  executeEffect, resumeSelectTarget, resumeSearch, resumeChoose,
  type ExecCtx, type ExecResult,
} from '../src/engine/effectExecutor';

const root = '.';
const cardMap = new Map<string, CardData>();
for (const f of [...Array.from({ length: 11 }, (_, i) => `CardData_Sheet${i + 1}.csv`), 'CardData_TK.csv']) {
  const p = join(root, 'public/data', f);
  if (!fs.existsSync(p)) continue;
  const { data } = Papa.parse<Record<string, string>>(fs.readFileSync(p, 'utf-8').replace(/^﻿/, ''), { header: true, skipEmptyLines: true });
  for (const r of data) { const id = r.CardNum?.trim(); if (id && !cardMap.has(id)) cardMap.set(id, r as unknown as CardData); }
}
const kobushi = [...cardMap.values()].find(c => c.Type === 'シグニ' && (c.CardClass ?? '').includes('古代兵器'))!;
const other = [...cardMap.values()].find(c => c.Type === 'シグニ' && !(c.CardClass ?? '').includes('古代兵器'))!;
const pool = [...cardMap.values()].filter(c => c.Type === 'シグニ').map(c => c.CardNum);
let cur = 100;
const fill = (n: number) => Array.from({ length: n }, () => pool[cur++ % pool.length]);

function mkState(hand: string[]): PlayerState {
  return {
    deck: fill(20), lrig_deck: [], hand, life_cloth: fill(7),
    trash: fill(3), lrig_trash: [], energy: fill(5), coins: 3, bonds: [],
    field: { lrig: [], signi: [null, null, null], signi_down: [false, false, false], signi_frozen: [false, false, false],
      assist_lrig_l: [], assist_lrig_r: [], check: null, key_piece: null, free_zone: [], signi_traps: [null, null, null] },
  } as unknown as PlayerState;
}
function run(eff: EffectAction, hand: string[]): ExecResult {
  const ctx = { ownerState: mkState(hand), otherState: mkState(fill(5)), cardMap, logs: [], currentPhase: 'MAIN' } as unknown as ExecCtx;
  let result = executeEffect({ effectId: 't', effectType: 'LIFE_BURST', action: eff, duration: 'INSTANT', mandatory: false } as CardEffect, ctx);
  let steps = 0;
  while (!result.done) {
    if (++steps > 40) throw new Error('hang');
    const p = (result as { pending: Record<string, unknown> & { type: string } }).pending;
    const c: ExecCtx = { ...ctx, ownerState: result.ownerState, otherState: result.otherState, logs: result.logs };
    if (p.type === 'SELECT_TARGET') { const cands = (p.candidates as string[]) ?? []; result = resumeSelectTarget(cands.slice(0, Math.min((p.count as number) ?? 1, cands.length)), p as never, c); }
    else if (p.type === 'SEARCH') { const vis = (p.visibleCards as string[]) ?? []; result = resumeSearch(vis.slice(0, Math.min((p.maxPick as number) ?? 0, vis.length)), p as never, c); }
    else if (p.type === 'CHOOSE') { const opts = (p.options as { id: string; available?: boolean }[]) ?? []; result = resumeChoose((opts.find(o => o.available !== false) ?? opts[0]).id, p as never, c); }
    else throw new Error('unhandled ' + p.type);
  }
  return result;
}

const burst: EffectAction = {
  type: 'SEQUENCE', steps: [
    { type: 'TRASH', target: { type: 'HAND_CARD', owner: 'self', count: 1, filter: { cardType: 'シグニ', story: '古代兵器' } } },
    { type: 'CONDITIONAL', condition: { type: 'IS_MY_TURN' }, then: { type: 'DRAW', owner: 'self', count: 2 } },
  ],
} as unknown as EffectAction;

console.log('使用カード: 古代兵器=', kobushi.CardNum, '/ 非該当=', other.CardNum);
{
  const r = run(burst, [kobushi.CardNum, other.CardNum, other.CardNum]);
  console.log('A(古代兵器あり): hand', r.ownerState.hand.length, '(期待: 3-1捨て+2=4) / trash', r.ownerState.trash.length);
  console.log('  logs:', r.logs.slice(-4).join(' | '));
}
{
  const r = run(burst, [other.CardNum, other.CardNum, other.CardNum]);
  console.log('B(古代兵器なし): hand', r.ownerState.hand.length, '(正しい挙動: 3 / 過剰なら 5)');
  console.log('  logs:', r.logs.slice(-4).join(' | '));
}
