/**
 * ⚠️ 状態変化なしカードの全件リスト出力
 * 実行: npx tsx scripts/listNoOpFull.ts
 * 出力: scripts/noOpList.txt
 */

import { readFileSync, existsSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import Papa from 'papaparse';
import {
  executeEffect,
  resumeSelectTarget,
  resumeSearch,
  resumeChoose,
  resumeOptionalCost,
  resumeLookAndReorder,
  resumeSelectZone,
  resumeDeclareBond,
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

const csvFiles = [
  ...Array.from({ length: 10 }, (_, i) => `CardData_Sheet${i + 1}.csv`),
  'CardData_TK.csv',
  'CardData_Variants.csv',
];
const allRows: Record<string, string>[] = [];
for (const fname of csvFiles) allRows.push(...loadCsv(join(root, 'public/data', fname)));

const cardMap = new Map<string, CardData>();
for (const row of allRows) if (row['CardNum']) cardMap.set(row['CardNum'], row as unknown as CardData);

const effectsJson = JSON.parse(
  readFileSync(join(root, 'public/data/effects.json'), 'utf-8'),
) as Record<string, CardEffect[]>;

const signiNums: string[] = [];
const lrigNums: string[] = [];
for (const [cardNum, card] of cardMap) {
  const t = (card as CardData).Type;
  if (t === 'シグニ' && signiNums.length < 30) signiNums.push(cardNum);
  else if (t === 'ルリグ' && lrigNums.length < 5) lrigNums.push(cardNum);
  if (signiNums.length >= 30 && lrigNums.length >= 5) break;
}

function makePlayerState(
  fieldSigni: [string | null, string | null, string | null],
  lrigNum: string,
  deckCards: string[],
  handCards: string[],
  energyCards: string[],
): PlayerState {
  return {
    deck: deckCards, lrig_deck: [], hand: handCards,
    life_cloth: signiNums.slice(20, 25),
    trash: [], lrig_trash: [], energy: energyCards, coins: 3,
    field: {
      lrig: [lrigNum],
      signi: [
        fieldSigni[0] ? [fieldSigni[0]] : null,
        fieldSigni[1] ? [fieldSigni[1]] : null,
        fieldSigni[2] ? [fieldSigni[2]] : null,
      ],
    },
  };
}

const OWNER_DECK = signiNums.slice(5, 25);
const OWNER_HAND = signiNums.slice(0, 5);
const OWNER_ENERGY = signiNums.slice(0, 5);
const OWNER_LRIG = lrigNums[0] ?? signiNums[0];

const baseOtherState = makePlayerState(
  [signiNums[0], signiNums[1], signiNums[2]],
  lrigNums[1] ?? lrigNums[0] ?? signiNums[1],
  signiNums.slice(10, 25),
  signiNums.slice(5, 10),
  signiNums.slice(5, 10),
);

const MAX_DEPTH = 10;

function autoResolve(result: ExecResult, ctx: ExecCtx, depth: number): ExecResult {
  if (!result || result.done || depth >= MAX_DEPTH) return result;
  const pending = result.pending as PendingInteractionDef;
  const cur: ExecCtx = { ...ctx, ownerState: result.ownerState, otherState: result.otherState, logs: result.logs };
  let next: ExecResult;
  if (pending.type === 'SELECT_TARGET') {
    const { candidates, count } = pending;
    next = resumeSelectTarget(candidates.slice(0, Math.min(count, candidates.length)), pending as any, cur);
  } else if (pending.type === 'SEARCH') {
    next = resumeSearch(pending.visibleCards.slice(0, Math.min(pending.maxPick, pending.visibleCards.length)), pending as any, cur);
  } else if (pending.type === 'CHOOSE') {
    const hasPaySkip = pending.options.some(o => o.id === 'pay') && pending.options.some(o => o.id === 'skip');
    if (hasPaySkip) next = resumeOptionalCost('skip', [], pending as any, cur);
    else {
      const avail = pending.options.find(o => o.available) ?? pending.options[0];
      if (!avail) return result;
      next = resumeChoose(avail.id, pending as any, cur);
    }
  } else if (pending.type === 'LOOK_AND_REORDER') {
    next = resumeLookAndReorder(pending.cards, [], pending as any, cur);
  } else if (pending.type === 'SELECT_ZONE') {
    const ownerSigis = (pending.owner === 'self' ? cur.ownerState : cur.otherState).field.signi;
    const emptyIdx = ownerSigis.findIndex(z => !z || z.length === 0);
    next = resumeSelectZone(emptyIdx >= 0 ? emptyIdx : 0, pending as any, cur);
  } else if (pending.type === 'DECLARE_BOND') {
    const firstCard = pending.deckCards[0] ?? '';
    if (!firstCard) return result;
    next = resumeDeclareBond(firstCard, pending as any, cur);
  } else return result;
  if (!next) return result;
  return autoResolve(next, cur, depth + 1);
}

function stateSnapshot(s: PlayerState): string {
  return JSON.stringify({
    deck: s.deck.length, hand: s.hand.length, energy: s.energy.length,
    trash: s.trash.length, lrig_trash: s.lrig_trash.length,
    life_cloth: s.life_cloth.length, coins: s.coins,
    fieldLrig: s.field.lrig, fieldSigni: s.field.signi,
  });
}

const lines: string[] = [];

for (const cardNum of Object.keys(effectsJson)) {
  const effects = effectsJson[cardNum];
  if (!effects) continue;
  const cardData = cardMap.get(cardNum);
  const cardName = cardData?.CardName ?? '?';
  const cardType = cardData?.Type ?? '?';

  for (const effect of effects) {
    if (effect.effectType === 'CONTINUOUS' || effect.parseStatus === 'UNKNOWN') continue;

    const isSigni = cardData?.Type === 'シグニ';
    const isLrig = cardData?.Type === 'ルリグ';
    const signi0 = isSigni ? cardNum : (signiNums[3] ?? null);
    const lrig = isLrig ? cardNum : OWNER_LRIG;
    const ownerState = makePlayerState([signi0, signiNums[6] ?? null, signiNums[7] ?? null], lrig, OWNER_DECK, OWNER_HAND, OWNER_ENERGY);
    const ctx: ExecCtx = {
      ownerState, otherState: { ...baseOtherState }, cardMap, logs: [],
      effectivePowers: new Map(), sourceCardNum: cardNum,
      allColorSigniNums: new Set(), fieldSigniExtraColors: new Map(),
    };

    const beforeOwner = stateSnapshot(ctx.ownerState);
    const beforeOther = stateSnapshot(ctx.otherState);

    try {
      const initial = executeEffect(effect, ctx);
      if (!initial) continue;
      const final = autoResolve(initial, ctx, 0);
      const stateChanged = stateSnapshot(final.ownerState) !== beforeOwner || stateSnapshot(final.otherState) !== beforeOther;
      if (final.done && (stateChanged || (final.logs && final.logs.length > 0))) continue;
      // ⚠️ 状態変化なし or 深さ上限
      const lastLog = final.logs?.[final.logs.length - 1] ?? '';
      const depthFlag = !final.done ? '[深さ上限]' : '';
      const reason = depthFlag || (lastLog ? lastLog.slice(0, 80) : '(ログなし)');
      lines.push(`\t${cardNum}\t${cardName}\t${cardType}\t${effect.effectId}\t${effect.effectType}\t${reason}`);
    } catch {
      // エラーは除外
    }
  }
}

const header = 'Status\tCardNum\tCardName\tType\tEffectId\tEffectType\tLastLog';
const output = [header, ...lines].join('\n');
const outPath = join(__dirname, 'noOpList.txt');
writeFileSync(outPath, output, 'utf-8');

console.log(`⚠️ 状態変化なし: ${lines.length}件`);
console.log(`出力先: ${outPath}`);
