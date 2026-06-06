/**
 * WX01-059 動作確認テスト
 * 実行: npx tsx scripts/testWX01059.ts
 */

import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import Papa from 'papaparse';
import {
  executeEffect,
  resumeChoose,
  resumeLookAndReorder,
  resumeSelectZone,
} from '../src/engine/effectExecutor';
import type { ExecCtx, ExecResult } from '../src/engine/execUtils';
import type { CardData, PlayerState, PendingInteractionDef } from '../src/types';
import type { CardEffect } from '../src/types/effects';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

function loadCsv(path: string): Record<string, string>[] {
  if (!existsSync(path)) return [];
  const text = readFileSync(path, 'utf-8').replace(/^﻿/, '');
  const { data } = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: true });
  return data;
}

const allRows: Record<string, string>[] = [];
for (let i = 1; i <= 10; i++) allRows.push(...loadCsv(join(root, `public/data/CardData_Sheet${i}.csv`)));
allRows.push(...loadCsv(join(root, 'public/data/CardData_TK.csv')));
const cardMap = new Map<string, CardData>();
for (const row of allRows) if (row['CardNum']) cardMap.set(row['CardNum'], row as unknown as CardData);

const effectsJson = JSON.parse(readFileSync(join(root, 'public/data/effects.json'), 'utf-8')) as Record<string, CardEffect[]>;
const e1 = effectsJson['WX01-059']?.find(e => e.effectId === 'WX01-059-E1');
if (!e1) { console.error('WX01-059-E1 not found'); process.exit(1); }

const lv1Signi = [...cardMap.entries()].filter(([, c]) => c.Type === 'シグニ' && c.Level === '1').map(([k]) => k);
const signiNums = [...cardMap.entries()].filter(([, c]) => c.Type === 'シグニ').map(([k]) => k).slice(0, 20);
const spells = [...cardMap.entries()].filter(([, c]) => c.Type === 'スペル').map(([k]) => k);

console.log(`Lv1シグニ ${lv1Signi.length}枚, スペル ${spells.length}枚`);

function autoResolve(result: ExecResult, ctx: ExecCtx, choiceId = 'place', depth = 0): ExecResult {
  if (!result || result.done || depth >= 10) return result;
  const p = result.pending as PendingInteractionDef;
  const cur: ExecCtx = { ...ctx, ownerState: result.ownerState, otherState: result.otherState, logs: result.logs };
  let next: ExecResult;
  if (p.type === 'LOOK_AND_REORDER') {
    next = resumeLookAndReorder(p.cards, [], p as any, cur);
  } else if (p.type === 'SELECT_ZONE') {
    const emptyIdx = cur.ownerState.field.signi.findIndex(z => !z || z.length === 0);
    next = resumeSelectZone(emptyIdx >= 0 ? emptyIdx : 0, p as any, cur);
  } else if (p.type === 'CHOOSE') {
    const opt = p.options.find(o => o.id === choiceId) ?? p.options[0];
    next = resumeChoose(opt.id, p as any, cur);
  } else return result;
  return autoResolve(next, cur, choiceId, depth + 1);
}

function makeCtx(deck: string[], fieldSelf: (string[] | null)[]): ExecCtx {
  return {
    ownerState: {
      deck, hand: signiNums.slice(0, 3), energy: [],
      trash: [], lrig_trash: [], life_cloth: signiNums.slice(0, 5), coins: 3,
      field: { lrig: ['WD01-001'], signi: fieldSelf as any },
    },
    otherState: {
      deck: signiNums.slice(5, 15), hand: [], energy: [],
      trash: [], lrig_trash: [], life_cloth: signiNums.slice(0, 5), coins: 3,
      field: { lrig: ['WD01-002'], signi: [['WD01-009'], null, null] as any },
    },
    cardMap, logs: [], effectivePowers: new Map(), sourceCardNum: 'WX01-059',
    allColorSigniNums: new Set(), fieldSigniExtraColors: new Map(),
  };
}

let pass = 0;
let fail = 0;

function assert(label: string, condition: boolean) {
  if (condition) { console.log(`  ✅ ${label}`); pass++; }
  else           { console.log(`  ❌ ${label}`); fail++; }
}

// シナリオ1: Lv1シグニがデッキ上、フィールドにWX01-059のみ → 条件TRUE → 場に出す選択
{
  const topCard = lv1Signi[0];
  const lv1CardName = cardMap.get(topCard)?.CardName ?? '?';
  const deck = [topCard, ...signiNums.slice(0, 10)];
  const ctx = makeCtx(deck, [['WX01-059'], null, null]);
  const r = autoResolve(executeEffect(e1, ctx), ctx, 'place');

  console.log(`\n[Scenario1] Lv1シグニ(${lv1CardName})がデッキ上 / WX01-059のみ`);
  assert('done=true', r.done === true);
  const occupied = r.ownerState.field.signi.filter(z => z && z.length > 0).length;
  assert('フィールドに2体になる（WX01-059 + Lv1シグニ）', occupied === 2);
  assert('デッキから1枚減る', r.ownerState.deck.length === deck.length - 1);
}

// シナリオ2: Lv1シグニがデッキ上、フィールドにWX01-059のみ → スキップ選択
{
  const topCard = lv1Signi[0];
  const deck = [topCard, ...signiNums.slice(0, 10)];
  const ctx = makeCtx(deck, [['WX01-059'], null, null]);
  const r = autoResolve(executeEffect(e1, ctx), ctx, 'skip');

  console.log(`\n[Scenario2] Lv1シグニがデッキ上 / スキップ選択`);
  assert('done=true', r.done === true);
  const occupied = r.ownerState.field.signi.filter(z => z && z.length > 0).length;
  assert('フィールドが変化しない（1体のまま）', occupied === 1);
  assert('デッキが変化しない', r.ownerState.deck.length === deck.length);
}

// シナリオ3: スペルがデッキ上 → 条件FALSE → 何もしない
{
  const topCard = spells[0];
  const spellName = cardMap.get(topCard)?.CardName ?? '?';
  const deck = [topCard, ...signiNums.slice(0, 10)];
  const ctx = makeCtx(deck, [['WX01-059'], null, null]);
  const r = autoResolve(executeEffect(e1, ctx), ctx, 'place');

  console.log(`\n[Scenario3] スペル(${spellName})がデッキ上 / WX01-059のみ`);
  assert('done=true', r.done === true);
  const occupied = r.ownerState.field.signi.filter(z => z && z.length > 0).length;
  assert('フィールドが変化しない（スペルは場に出ない）', occupied === 1);
  assert('デッキが変化しない', r.ownerState.deck.length === deck.length);
}

// シナリオ4: Lv1シグニがデッキ上、他のシグニもいる → 条件FALSE → 何もしない
{
  const topCard = lv1Signi[0];
  const deck = [topCard, ...signiNums.slice(0, 10)];
  const ctx = makeCtx(deck, [['WX01-059'], [signiNums[5]], [signiNums[6]]]);
  const r = autoResolve(executeEffect(e1, ctx), ctx, 'place');

  console.log(`\n[Scenario4] Lv1シグニがデッキ上 / 他のシグニあり`);
  assert('done=true', r.done === true);
  const occupied = r.ownerState.field.signi.filter(z => z && z.length > 0).length;
  assert('フィールドが変化しない（他シグニあり条件で弾かれる）', occupied === 3);
  assert('デッキが変化しない', r.ownerState.deck.length === deck.length);
}

// シナリオ5: Lv2シグニがデッキ上 → 条件FALSE（Lv1でない）
{
  const lv2Signi = [...cardMap.entries()].filter(([, c]) => c.Type === 'シグニ' && c.Level === '2').map(([k]) => k);
  const topCard = lv2Signi[0] ?? signiNums[0];
  const lv2Name = cardMap.get(topCard)?.CardName ?? '?';
  const deck = [topCard, ...signiNums.slice(0, 10)];
  const ctx = makeCtx(deck, [['WX01-059'], null, null]);
  const r = autoResolve(executeEffect(e1, ctx), ctx, 'place');

  console.log(`\n[Scenario5] Lv2シグニ(${lv2Name})がデッキ上 / WX01-059のみ`);
  assert('done=true', r.done === true);
  const occupied = r.ownerState.field.signi.filter(z => z && z.length > 0).length;
  assert('フィールドが変化しない（Lv2は対象外）', occupied === 1);
  assert('デッキが変化しない', r.ownerState.deck.length === deck.length);
}

console.log(`\n結果: ${pass}件成功 / ${fail}件失敗`);
if (fail > 0) process.exit(1);
