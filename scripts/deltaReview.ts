/**
 * エフェクト実行の詳細デルタ表示（レビュー支援）
 * 対象: CardData_Sheet1.csv のカード
 * 実行: npx tsx scripts/deltaReview.ts
 * 出力: scripts/deltaReview_Sheet1.txt
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

// Sheet1のみ対象
const sheet1Rows = loadCsv(join(root, 'public/data/CardData_Sheet1.csv'));
const sheet1CardNums = new Set(sheet1Rows.map(r => r['CardNum']).filter(Boolean));

// cardMap は全シート（フィールドのシグニ名解決に使う）
const allCsvFiles = [
  ...Array.from({ length: 10 }, (_, i) => `CardData_Sheet${i + 1}.csv`),
  'CardData_TK.csv', 'CardData_Variants.csv',
];
const allRows: Record<string, string>[] = [];
for (const fname of allCsvFiles) allRows.push(...loadCsv(join(root, 'public/data', fname)));

const cardMap = new Map<string, CardData>();
for (const row of allRows) if (row['CardNum']) cardMap.set(row['CardNum'], row as unknown as CardData);

const sheet1CardMap = new Map<string, Record<string, string>>();
for (const row of sheet1Rows) if (row['CardNum']) sheet1CardMap.set(row['CardNum'], row);

const effectsJson = JSON.parse(
  readFileSync(join(root, 'public/data/effects.json'), 'utf-8'),
) as Record<string, CardEffect[]>;

// ダミーカード用にシグニ・ルリグを収集
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

type StateSnap = {
  deck: number; hand: number; energy: number;
  trash: number; lrig_trash: number; life: number; coins: number;
  fieldLrig: string[];
  fieldSigni: (string[] | null)[];
};

function snap(s: PlayerState): StateSnap {
  return {
    deck: s.deck.length,
    hand: s.hand.length,
    energy: s.energy.length,
    trash: s.trash.length,
    lrig_trash: s.lrig_trash.length,
    life: s.life_cloth.length,
    coins: s.coins,
    fieldLrig: [...s.field.lrig],
    fieldSigni: s.field.signi.map(z => z ? [...z] : null),
  };
}

function snapStr(s: StateSnap): string {
  const signiStr = s.fieldSigni.map(z => z ? `[${z.join(',')}]` : 'null').join(' ');
  return `deck=${s.deck} hand=${s.hand} energy=${s.energy} trash=${s.trash} lrig_trash=${s.lrig_trash} life=${s.life} coins=${s.coins} lrig=[${s.fieldLrig.join(',')}] signi=${signiStr}`;
}

function calcDelta(before: StateSnap, after: StateSnap): string {
  const parts: string[] = [];
  const numFields: (keyof StateSnap)[] = ['deck', 'hand', 'energy', 'trash', 'lrig_trash', 'life', 'coins'];
  for (const f of numFields) {
    const b = before[f] as number;
    const a = after[f] as number;
    const d = a - b;
    if (d !== 0) parts.push(`${f}${d > 0 ? '+' : ''}${d}`);
  }
  // lrig field
  const lrigBefore = JSON.stringify(before.fieldLrig);
  const lrigAfter = JSON.stringify(after.fieldLrig);
  if (lrigBefore !== lrigAfter) parts.push(`lrig: ${lrigBefore}→${lrigAfter}`);
  // signi field
  const sgniBefore = JSON.stringify(before.fieldSigni);
  const sgniAfter = JSON.stringify(after.fieldSigni);
  if (sgniBefore !== sgniAfter) parts.push(`signi: ${sgniBefore}→${sgniAfter}`);

  return parts.length > 0 ? parts.join(', ') : '(変化なし)';
}

const lines: string[] = [];
lines.push('='.repeat(80));
lines.push('Sheet1 エフェクト実行デルタ詳細レビュー');
lines.push(`生成日時: ${new Date().toLocaleString('ja-JP')}`);
lines.push('='.repeat(80));

// ownerの初期状態（全カード共通のベース）を表示
lines.push('');
lines.push('[テスト時のowner初期状態]');
lines.push(`  deck: ${OWNER_DECK.length}枚 (${OWNER_DECK[0]}〜${OWNER_DECK[OWNER_DECK.length - 1]})`);
lines.push(`  hand: ${OWNER_HAND.length}枚 (${OWNER_HAND[0]}〜${OWNER_HAND[OWNER_HAND.length - 1]})`);
lines.push(`  energy: ${OWNER_ENERGY.length}枚`);
lines.push(`  lrig: ${OWNER_LRIG}`);
lines.push('  ※シグニカードはfield[0]にそのカード自身、[1][2]は別シグニ');
lines.push('');

let countDone = 0;
let countNoOp = 0;
let countDepthLimit = 0;
let countError = 0;
let countSkipped = 0; // CONTINUOUS or UNKNOWN

for (const cardNum of Object.keys(effectsJson)) {
  if (!sheet1CardNums.has(cardNum)) continue;

  const effects = effectsJson[cardNum];
  if (!effects) continue;

  const csvRow = sheet1CardMap.get(cardNum);
  const cardName = csvRow?.['CardName'] ?? '?';
  const cardType = csvRow?.['Type'] ?? '?';
  const effectText = csvRow?.['EffectText'] ?? '';
  const burstText = csvRow?.['BurstText'] ?? '';

  for (const effect of effects) {
    if (effect.effectType === 'CONTINUOUS' || effect.parseStatus === 'UNKNOWN') {
      countSkipped++;
      continue;
    }

    const isSigni = cardType === 'シグニ';
    const isLrig = cardType === 'ルリグ';
    const signi0 = isSigni ? cardNum : (signiNums[3] ?? null);
    const lrig = isLrig ? cardNum : OWNER_LRIG;
    const ownerState = makePlayerState(
      [signi0, signiNums[6] ?? null, signiNums[7] ?? null],
      lrig, OWNER_DECK, OWNER_HAND, OWNER_ENERGY,
    );
    const ctx: ExecCtx = {
      ownerState,
      otherState: { ...baseOtherState,
        deck: [...baseOtherState.deck],
        hand: [...baseOtherState.hand],
        energy: [...baseOtherState.energy],
        trash: [...baseOtherState.trash],
        lrig_trash: [...baseOtherState.lrig_trash],
        life_cloth: [...baseOtherState.life_cloth],
        field: {
          lrig: [...baseOtherState.field.lrig],
          signi: baseOtherState.field.signi.map(z => z ? [...z] : null),
        },
      },
      cardMap, logs: [],
      effectivePowers: new Map(), sourceCardNum: cardNum,
      allColorSigniNums: new Set(), fieldSigniExtraColors: new Map(),
    };

    const beforeOwner = snap(ctx.ownerState);
    const beforeOther = snap(ctx.otherState);

    lines.push('─'.repeat(80));
    lines.push(`[${cardNum}] ${cardName} (${cardType}) / effectId: ${effect.effectId} / ${effect.effectType}`);

    // EffectTextからこのeffectIdに対応するテキスト部分を推定して表示
    const relevantText = effect.effectType === 'BURST' ? (burstText || effectText) : effectText;
    if (relevantText && relevantText !== '-') {
      lines.push(`  テキスト: ${relevantText}`);
    }

    // actionの型を表示（実装の概要）
    const actionType = (effect.action as any)?.type ?? '?';
    lines.push(`  action.type: ${actionType} | parseStatus: ${effect.parseStatus ?? 'ok'}`);

    lines.push(`  BEFORE owner: ${snapStr(beforeOwner)}`);
    lines.push(`  BEFORE other: ${snapStr(beforeOther)}`);

    try {
      const initial = executeEffect(effect, ctx);
      if (!initial) {
        lines.push('  → executeEffect returned null/undefined');
        countError++;
        continue;
      }

      const final = autoResolve(initial, ctx, 0);
      const afterOwner = snap(final.ownerState);
      const afterOther = snap(final.otherState);
      const deltaOwner = calcDelta(beforeOwner, afterOwner);
      const deltaOther = calcDelta(beforeOther, afterOther);

      lines.push(`  AFTER  owner: ${snapStr(afterOwner)}`);
      lines.push(`  AFTER  other: ${snapStr(afterOther)}`);
      lines.push(`  DELTA  owner: ${deltaOwner}`);
      lines.push(`  DELTA  other: ${deltaOther}`);

      const logs = final.logs ?? [];
      if (logs.length > 0) {
        lines.push(`  Logs(${logs.length}): ${logs.slice(0, 5).join(' / ')}${logs.length > 5 ? ` ... (+${logs.length - 5})` : ''}`);
      } else {
        lines.push('  Logs: (なし)');
      }

      const stateChanged = deltaOwner !== '(変化なし)' || deltaOther !== '(変化なし)';
      const hasLogs = logs.length > 0;

      if (!final.done) {
        lines.push('  結果: ⏳ 深さ上限（未完了）');
        countDepthLimit++;
      } else if (!stateChanged && !hasLogs) {
        lines.push('  結果: ⚠️  NoOp（状態変化なし・ログなし）');
        countNoOp++;
      } else {
        lines.push(`  結果: ✅ 完了`);
        countDone++;
      }
    } catch (e) {
      lines.push(`  結果: ❌ エラー: ${(e as Error).message}`);
      countError++;
    }
  }
}

lines.push('');
lines.push('='.repeat(80));
lines.push('集計');
lines.push(`  ✅ 完了（状態変化あり or ログあり）: ${countDone}件`);
lines.push(`  ⚠️  NoOp（状態変化なし・ログなし）: ${countNoOp}件`);
lines.push(`  ⏳ 深さ上限（未完了）: ${countDepthLimit}件`);
lines.push(`  ❌ エラー: ${countError}件`);
lines.push(`  スキップ（CONTINUOUS/UNKNOWN）: ${countSkipped}件`);
lines.push('='.repeat(80));

const outPath = join(__dirname, 'deltaReview_Sheet1.txt');
writeFileSync(outPath, lines.join('\n'), 'utf-8');
console.log(`出力: ${outPath}`);
console.log(`✅ ${countDone}件 / ⚠️  ${countNoOp}件 / ⏳ ${countDepthLimit}件 / ❌ ${countError}件`);
