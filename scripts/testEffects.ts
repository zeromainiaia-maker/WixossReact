/**
 * 全カード効果の自動ヘッドレステスト
 * 実行: npx tsx scripts/testEffects.ts
 *
 * effects.json の全エントリを反復し、ACTIVATED/AUTO/LIFE_BURST 効果を
 * executeEffect で実行。インタラクションは自動解決（深さ10まで）。
 * 状態変化の有無で ✅ / ⚠️ / ❌ を報告する。
 */

import { readFileSync, existsSync } from 'fs';
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

// ===== CSV 読み込み =====

function loadCsv(path: string): Record<string, string>[] {
  if (!existsSync(path)) return [];
  const text = readFileSync(path, 'utf-8').replace(/^﻿/, '');
  const { data } = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
  });
  return data;
}

const csvFiles = [
  ...Array.from({ length: 10 }, (_, i) => `CardData_Sheet${i + 1}.csv`),
  'CardData_TK.csv',
  'CardData_Variants.csv',
];

const allRows: Record<string, string>[] = [];
for (const fname of csvFiles) {
  const rows = loadCsv(join(root, 'public/data', fname));
  allRows.push(...rows);
}

// CardNum → CardData マップ
const cardMap = new Map<string, CardData>();
for (const row of allRows) {
  if (!row['CardNum']) continue;
  cardMap.set(row['CardNum'], row as unknown as CardData);
}

// effects.json 読み込み
const effectsJson = JSON.parse(
  readFileSync(join(root, 'public/data/effects.json'), 'utf-8'),
) as Record<string, CardEffect[]>;


// ===== サンプルカード収集 =====

// 各タイプのサンプルカード番号を集める（モック状態構築用）
const signiNums: string[] = [];
const lrigNums: string[] = [];
const artsNums: string[] = [];
const spellNums: string[] = [];

for (const [cardNum, card] of cardMap) {
  const t = (card as CardData).Type;
  if (t === 'シグニ' && signiNums.length < 30) signiNums.push(cardNum);
  else if (t === 'ルリグ' && lrigNums.length < 5) lrigNums.push(cardNum);
  else if (t === 'アーツ' && artsNums.length < 5) artsNums.push(cardNum);
  else if (t === 'スペル' && spellNums.length < 5) spellNums.push(cardNum);
  if (signiNums.length >= 30 && lrigNums.length >= 5) break;
}

// ===== モック PlayerState 生成 =====

function makePlayerState(
  fieldSigni: [string | null, string | null, string | null],
  lrigNum: string,
  deckCards: string[],
  handCards: string[],
  energyCards: string[],
): PlayerState {
  return {
    deck: deckCards,
    lrig_deck: [],
    hand: handCards,
    life_cloth: signiNums.slice(20, 25),
    trash: [],
    lrig_trash: [],
    energy: energyCards,
    coins: 3,
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

// オーナー用サンプル（field.signi[0] は各テストで上書き）
const OWNER_DECK = signiNums.slice(5, 25);
const OWNER_HAND = signiNums.slice(0, 5);
const OWNER_ENERGY = signiNums.slice(0, 5);
const OWNER_LRIG = lrigNums[0] ?? signiNums[0];

// 相手用サンプル（固定）
const OPP_DECK = signiNums.slice(10, 25);
const OPP_HAND = signiNums.slice(5, 10);
const OPP_ENERGY = signiNums.slice(5, 10);
const OPP_LRIG = lrigNums[1] ?? lrigNums[0] ?? signiNums[1];
const OPP_SIGNI_0 = signiNums[0];
const OPP_SIGNI_1 = signiNums[1];
const OPP_SIGNI_2 = signiNums[2];

const baseOtherState = makePlayerState(
  [OPP_SIGNI_0, OPP_SIGNI_1, OPP_SIGNI_2],
  OPP_LRIG,
  OPP_DECK,
  OPP_HAND,
  OPP_ENERGY,
);

// ===== 自動インタラクション解決 =====

const MAX_DEPTH = 10;

const _DEBUG_CARD = ''; // set to a cardNum to debug that card specifically

function autoResolve(result: ExecResult, ctx: ExecCtx, depth: number): ExecResult {
  if (result === undefined || result === null) {
    throw new Error(`autoResolve received undefined/null result at depth ${depth}`);
  }
  if (result.done || depth >= MAX_DEPTH) return result;

  const pending = result.pending as PendingInteractionDef;

  // 継続用 ctx 更新
  const cur: ExecCtx = {
    ...ctx,
    ownerState: result.ownerState,
    otherState: result.otherState,
    logs: result.logs,
  };

  let next: ExecResult;

  if (pending.type === 'SELECT_TARGET') {
    const { candidates, count, optional } = pending;
    let selected: string[];
    if (candidates.length === 0) {
      selected = [];
    } else if (optional) {
      // 任意選択: 候補がいれば最低1枚選ぶ
      selected = candidates.slice(0, Math.min(count, candidates.length));
    } else {
      selected = candidates.slice(0, Math.min(count, candidates.length));
    }
    next = resumeSelectTarget(selected, pending as PendingInteractionDef & { type: 'SELECT_TARGET' }, cur);

  } else if (pending.type === 'SEARCH') {
    const { visibleCards, maxPick } = pending;
    const picked = visibleCards.slice(0, Math.min(maxPick, visibleCards.length));
    next = resumeSearch(picked, pending as PendingInteractionDef & { type: 'SEARCH' }, cur);

  } else if (pending.type === 'CHOOSE') {
    const { options } = pending;
    // 任意コスト（pay/skip パターン）は 'skip' を選択
    const hasPaySkip = options.some(o => o.id === 'pay') && options.some(o => o.id === 'skip');
    if (hasPaySkip) {
      next = resumeOptionalCost('skip', [], pending as PendingInteractionDef & { type: 'CHOOSE' }, cur);
    } else {
      // 利用可能な最初のオプションを選ぶ
      const available = options.find(o => o.available) ?? options[0];
      if (!available) return result;
      next = resumeChoose(available.id, pending as PendingInteractionDef & { type: 'CHOOSE' }, cur);
    }

  } else if (pending.type === 'LOOK_AND_REORDER') {
    // カードをそのままデッキに戻す（トラッシュなし）
    next = resumeLookAndReorder(
      pending.cards,
      [],
      pending as PendingInteractionDef & { type: 'LOOK_AND_REORDER' },
      cur,
    );

  } else if (pending.type === 'SELECT_ZONE') {
    // 空きゾーンを探す
    const ownerSigis = (pending.owner === 'self' ? cur.ownerState : cur.otherState).field.signi;
    const emptyIdx = ownerSigis.findIndex(z => !z || z.length === 0);
    const zoneIndex = emptyIdx >= 0 ? emptyIdx : 0;
    next = resumeSelectZone(zoneIndex, pending as PendingInteractionDef & { type: 'SELECT_ZONE' }, cur);

  } else if (pending.type === 'DECLARE_BOND') {
    // デッキの先頭カードを絆宣言
    const firstCard = pending.deckCards[0] ?? '';
    if (!firstCard) return result;
    next = resumeDeclareBond(firstCard, pending as PendingInteractionDef & { type: 'DECLARE_BOND' }, cur);

  } else {
    // 不明な pending タイプ
    return result;
  }

  if (next === undefined || next === null) {
    throw new Error(`resumeXxx returned undefined at depth ${depth}, pendingType=${pending.type}`);
  }
  return autoResolve(next, cur, depth + 1);
}

// ===== 状態比較（JSON で比較） =====

function stateSnapshot(s: PlayerState): string {
  // Maps/Sets を含まない PlayerState は JSON.stringify で比較可能
  return JSON.stringify({
    deck: s.deck.length,
    hand: s.hand.length,
    energy: s.energy.length,
    trash: s.trash.length,
    lrig_trash: s.lrig_trash.length,
    life_cloth: s.life_cloth.length,
    coins: s.coins,
    fieldLrig: s.field.lrig,
    fieldSigni: s.field.signi,
  });
}

// ===== メインテストループ =====

let total = 0;
let passed = 0;
let noOp = 0;
let errored = 0;
let skipped = 0;

const noOpCards: string[] = [];
const errorCards: { cardNum: string; effectId: string; error: string }[] = [];
const depthCards: string[] = [];

const cardNums = Object.keys(effectsJson);
console.log(`\n=== WixossReactClone Effect Test ===`);
console.log(`テスト対象カード: ${cardNums.length}件\n`);

for (const cardNum of cardNums) {
  const effects = effectsJson[cardNum];
  if (!effects || effects.length === 0) continue;

  // cardMap に存在しない場合は CSV から検索不能 → スキップ
  const cardData = cardMap.get(cardNum);

  for (const effect of effects) {
    if (effect.effectType === 'CONTINUOUS') {
      skipped++;
      continue;
    }
    // UNKNOWN は実行しても意味がないのでスキップ
    if (effect.parseStatus === 'UNKNOWN') {
      skipped++;
      continue;
    }

    total++;

    // オーナー状態構築: テスト対象カードを field.signi[0] に配置
    const isSighi = cardData?.Type === 'シグニ';
    const isLrig = cardData?.Type === 'ルリグ';
    const signi0 = isSighi ? cardNum : (signiNums[3] ?? null);
    const signi1 = signiNums[6] ?? null;
    const signi2 = signiNums[7] ?? null;
    const lrig = isLrig ? cardNum : OWNER_LRIG;

    const ownerState = makePlayerState(
      [signi0, signi1, signi2],
      lrig,
      OWNER_DECK,
      OWNER_HAND,
      OWNER_ENERGY,
    );

    const ctx: ExecCtx = {
      ownerState,
      otherState: { ...baseOtherState },
      cardMap,
      logs: [],
      effectivePowers: new Map(),
      sourceCardNum: cardNum,
      allColorSigniNums: new Set(),
      fieldSigniExtraColors: new Map(),
    };

    const beforeOwner = stateSnapshot(ctx.ownerState);
    const beforeOther = stateSnapshot(ctx.otherState);

    try {
      const initial = executeEffect(effect, ctx);
      if (initial === undefined || initial === null) {
        const actId = (effect.action as any)?.id ?? '';
        // Direct re-test to get inner exception
        try {
          const _inner = executeEffect(effect, { ...ctx });
          throw new Error(`executeEffect returned undefined for action.type=${effect.action?.type} id=${actId} (retry also returned ${typeof _inner})`);
        } catch (inner) {
          if (inner instanceof Error && inner.message.startsWith('executeEffect returned undefined')) throw inner;
          throw new Error(`executeEffect returned undefined for action.type=${effect.action?.type} id=${actId} | innerError: ${inner instanceof Error ? inner.message.slice(0,150) : String(inner)}`, { cause: inner });
        }
      }
      const final = autoResolve(initial, ctx, 0);

      const afterOwner = stateSnapshot(final.ownerState);
      const afterOther = stateSnapshot(final.otherState);
      const stateChanged = afterOwner !== beforeOwner || afterOther !== beforeOther;

      if (!final.done) {
        // 深さ上限に達した
        depthCards.push(`${cardNum}/${effect.effectId}`);
        noOp++;
        noOpCards.push(`${cardNum}/${effect.effectId} [深さ上限]`);
      } else if (stateChanged || (final.logs && final.logs.length > 0)) {
        passed++;
      } else {
        noOp++;
        noOpCards.push(`${cardNum}/${effect.effectId}`);
      }
    } catch (e) {
      errored++;
      const msg = e instanceof Error ? e.message : String(e);
      const stack = e instanceof Error ? (e.stack ?? '').split('\n').slice(1, 4).join(' | ') : '';
      errorCards.push({ cardNum, effectId: effect.effectId, error: msg.slice(0, 200) + (stack ? ' | ' + stack.slice(0, 200) : '') });
    }
  }
}

// ===== レポート =====

console.log(`結果サマリー:`);
console.log(`  ✅ 状態変化あり : ${passed}`);
console.log(`  ⚠️  状態変化なし : ${noOp}`);
console.log(`  ❌ 例外発生     : ${errored}`);
console.log(`  ⏩ スキップ     : ${skipped}`);
console.log(`  合計テスト実行  : ${total}\n`);

if (errorCards.length > 0) {
  console.log(`❌ 例外発生カード一覧 (${errorCards.length}件):`);
  for (const { cardNum, effectId, error } of errorCards) {
    const name = cardMap.get(cardNum)?.CardName ?? cardNum;
    console.log(`  ${cardNum} (${name}) / ${effectId}`);
    console.log(`    エラー: ${error}`);
  }
  console.log('');
}

if (noOpCards.length > 0 && noOpCards.length <= 100) {
  console.log(`⚠️  状態変化なしカード一覧 (${noOpCards.length}件):`);
  for (const id of noOpCards) {
    const cardNum = id.split('/')[0];
    const name = cardMap.get(cardNum)?.CardName ?? cardNum;
    console.log(`  ${id} (${name})`);
  }
} else if (noOpCards.length > 100) {
  console.log(`⚠️  状態変化なし: ${noOpCards.length}件 (多すぎるため省略)`);
}

if (depthCards.length > 0) {
  console.log(`\n深さ上限到達 (${depthCards.length}件): ${depthCards.slice(0, 20).join(', ')}`);
}

console.log('\nDone.');
