import Papa from 'papaparse';
import { readFileSync } from 'node:fs';
import { executeEffect, resumeSearch } from './src/engine/effectExecutor';
import { collectDeckShuffledTriggers } from './src/engine/triggerCollect';
import { detectDeckShuffled } from './src/engine/boardDiff';

const cardMap = new Map<string, any>();
for (let i = 1; i <= 10; i++) {
  try {
    const csv = readFileSync(`public/data/CardData_Sheet${i}.csv`, 'utf-8');
    for (const r of Papa.parse<any>(csv, { header: true, skipEmptyLines: true }).data) {
      const id = r.CardNum?.trim(); if (id && !cardMap.has(id)) cardMap.set(id, r);
    }
  } catch {}
}
const eff: Record<string, any[]> = {};
for (const f of ['effects_WX', 'effects_misc', 'effects_WXK', 'effects_WXDi', 'effects_WX24_26']) {
  Object.assign(eff, JSON.parse(readFileSync(`public/data/${f}.json`, 'utf-8')));
}
const effectsMap = new Map<string, any[]>();
for (const [id] of cardMap) effectsMap.set(id, eff[id] ?? []);

const baseField = () => ({ lrig: [], signi: [['PR-470A#1'], null, null] as any, signi_down: [false,false,false], signi_frozen:[false,false,false], assist_lrig_l:[], assist_lrig_r:[], check:null, key_piece:null, free_zone:[], signi_traps:[null,null,null] });
const owner: any = { deck: ['WD03-009','WD03-009','WD03-009'], lrig_deck: [], hand: [], life_cloth: [], trash: [], lrig_trash: [], energy: [], coins: 0, bonds: [], deck_shuffled_count: 0, field: baseField() };
const other: any = { ...JSON.parse(JSON.stringify(owner)), field: { ...baseField(), signi: [null,null,null] } };
const ctx: any = { ownerState: owner, otherState: other, cardMap, logs: [], effectivePowers: new Map(), sourceCardNum: 'WX02-060' };

const searcher = eff['WX02-060'].find((e:any)=>e.effectType==='ACTIVATED');
console.log('SEARCHER action:', JSON.stringify(searcher.action).slice(0,140));
let res: any = executeEffect(searcher, ctx);
console.log('exec done?', res.done, 'pending?', res.pending?.type, 'count:', res.ownerState.deck_shuffled_count);
if (!res.done && res.pending?.type === 'SEARCH') {
  res = resumeSearch([], res.pending, { ...ctx, ownerState: res.ownerState, otherState: res.otherState, logs: res.logs });
  console.log('resumeSearch done?', res.done, 'count:', res.ownerState.deck_shuffled_count);
}
console.log('detectDeckShuffled:', detectDeckShuffled(owner, res.ownerState));
const trigCtx: any = { hostId:'H', guestId:'G', activeUserId:'H', turnPhase:'MAIN', effectsMap, cardMap, genId:(()=>{let n=0;return()=>'e'+n++})() };
const collected = collectDeckShuffledTriggers(trigCtx, 'H', res.ownerState);
console.log('collected entries:', collected.entries.map((e:any)=>e.cardNum), 'logs:', res.logs);
