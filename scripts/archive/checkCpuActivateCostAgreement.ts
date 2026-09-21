// 実カードで「提示ゲート → CPU の選択 → 支払いの検算」が通るか（第3段で載せたキーだけ）
import fs from 'fs';
import { join } from 'path';
import Papa from 'papaparse';
import type { CardData, PlayerState } from './src/types';
import type { CardEffect } from './src/types/effects';
import { mergeManualEffects } from './src/data/manualEffects';
import { listActivatableSigniEffects } from './src/screens/battle/signiActivateGate';
import { listActivatableLrigEffects } from './src/screens/battle/lrigActivateGate';
import { cpuCanAutoPayActivatedCost, pickCpuUnderSelfTrashKeys, pickCpuFieldTrashZones } from './src/screens/battle/cpuActivate';
import { cpuCanAutoPayLrigCost } from './src/screens/battle/cpuLrigActivate';
import { payUnderSelfTrash } from './src/screens/battle/underAnySigniCost';
import { payDeckTrashCost } from './src/screens/battle/deckTrashCost';

const root = import.meta.dirname;
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
for (const [id] of cardMap) {
  const m = mergeManualEffects(id, (effectsMap.get(id) ?? []) as never[]);
  if (m.length > 0) effectsMap.set(id, m as CardEffect[]);
}

const fill = (n: number, tag: string) => Array.from({ length: n }, (_, i) => `WD01-010#${tag}${i}`);
const mk = (o: Partial<{ signi: (string[] | null)[]; lrig: string[]; charms: (string | null)[]; virus: number[] }> = {}): PlayerState => ({
  deck: fill(20, 'd'), lrig_deck: [], hand: fill(5, 'h'), life_cloth: fill(7, 'l'),
  trash: fill(3, 't'), lrig_trash: [], energy: fill(8, 'e'), coins: 3, bonds: [],
  field: {
    lrig: o.lrig ?? [], signi: o.signi ?? [null, null, null],
    signi_down: [false, false, false], signi_frozen: [false, false, false],
    signi_charms: o.charms ?? [null, null, null], signi_virus: o.virus ?? [0, 0, 0],
    assist_lrig_l: [], assist_lrig_r: [], check: null, key_piece: null, free_zone: [], signi_traps: [null, null, null],
  },
} as unknown as PlayerState);

const KEYS = ['underSelfTrash', 'charmTrash', 'removeOppVirus', 'selfPowerDown', 'deckTrash', 'fieldBanish', 'fieldToDeckTop'] as const;
let okCount = 0, ngCount = 0;
for (const [num, effs] of effectsMap) {
  const card = cardMap.get(num);
  if (!card || (card.Type !== 'シグニ' && card.Type !== 'レゾナ')) continue;
  for (const e of effs) {
    if (e.effectType !== 'ACTIVATED' || !e.cost) continue;
    const keys = KEYS.filter(k => (e.cost as Record<string, unknown>)[k] !== undefined);
    if (keys.length === 0) continue;
    // 十分に緩い盤面（下敷き2枚・チャーム3・相手ウィルス3・仲間2体）
    const my = mk({
      signi: [[`${num}#u0`, `${num}#u1`, num], [`WD01-010#z1`], [`WD01-010#z2`]],
      charms: [`WD01-010#c0`, `WD01-010#c1`, `WD01-010#c2`], lrig: ['WD01-001'],
    });
    const op = mk({ signi: [[`${num}#o0`], null, null], virus: [3, 0, 0] });
    const shown = listActivatableSigniEffects({ my, op, zoneIndex: 0, phase: 'MAIN', isMyTurn: true, effectsMap, cardMap })
      .some(x => x.effectId === e.effectId);
    const auto = cpuCanAutoPayActivatedCost(e, my, num);
    if (!auto) continue;
    const under = pickCpuUnderSelfTrashKeys({ effect: e, actor: my, sourceZone: 0, cardMap });
    const zones = pickCpuFieldTrashZones({ effect: e, actor: my, sourceZone: 0, cardMap });
    const payable = !!under && !!zones
      && (!e.cost.underSelfTrash || !!payUnderSelfTrash(my, 0, under, e.cost.underSelfTrash.count, cardMap, e.cost.underSelfTrash.filter, e.cost.underSelfTrash.selectionConstraint))
      && (!e.cost.deckTrash || payDeckTrashCost(my, e.cost.deckTrash).state.deck.length === my.deck.length - e.cost.deckTrash);
    if (shown && !payable) { ngCount++; console.log(`🔴 提示は通るのに払えない ${num} ${e.effectId} ${keys.join('/')}`); }
    else if (shown && payable) okCount++;
  }
}
// ルリグ側
let lok = 0, lng = 0;
for (const [num, effs] of effectsMap) {
  const card = cardMap.get(num);
  if (!card || card.Type !== 'ルリグ') continue;
  for (const e of effs) {
    if (e.effectType !== 'ACTIVATED' || !e.cost) continue;
    const keys = (['fieldTrash', 'fieldBanish', 'removeOppVirus', 'exceedColors', 'deckTrash'] as const).filter(k => (e.cost as Record<string, unknown>)[k] !== undefined);
    if (keys.length === 0) continue;
    const my = mk({ signi: [['WD01-010#f0'], ['WD01-010#f1'], ['WD01-010#f2']], lrig: [num], charms: ['WD01-010#c0', null, null] });
    const op = mk({ virus: [3, 0, 0] });
    const shown = listActivatableLrigEffects({ my, op, phase: 'MAIN', effectsMap, cardMap, blockedSelf: new Set<string>() })
      .some(x => x.effectId === e.effectId);
    if (!cpuCanAutoPayLrigCost(e)) continue;
    const zones = pickCpuFieldTrashZones({ effect: e, actor: my, sourceZone: null, cardMap });
    if (shown && !zones) { lng++; console.log(`🔴 ルリグ：提示は通るのに払えない ${num} ${e.effectId} ${keys.join('/')}`); }
    else if (shown && zones) lok++;
  }
}
console.log(`場のシグニ：提示も支払いも通った ${okCount} / 食い違い ${ngCount}`);
console.log(`ルリグ　　：提示も支払いも通った ${lok} / 食い違い ${lng}`);
