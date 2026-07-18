/**
 * goldenTest.ts — 構文ゴールデンテスト（②実行の「正しさ」を DSL アクション型ごとに担保）
 *
 * smokeTest.ts が「壊れないか」を全カードで見るのに対し、本テストは主要アクション型ごとに
 * 制御盤面で合成効果を実行し「結果がこうなる」を assert する。型単位で正しさを担保すれば
 * 全カード（型の組み合わせ）を帰納的に信頼できる＝実機検証(③)の人手を型の代表に圧縮する。
 *
 * 使い方: npx tsx scripts/goldenTest.ts   （npm run golden）
 * テストの足し方: test('名前', () => { ... assert ... }) を追加するだけ。
 */
import fs from 'fs';
import { join } from 'path';
import Papa from 'papaparse';
import type { CardData, PlayerState, StackEntry } from '../src/types';
import type { CardEffect, EffectAction, SequenceAction, AddToFieldAction } from '../src/types/effects';
import { initStack, confirmTurnOrder, pushToStack, shiftQueue, isStackDone } from '../src/engine/effectStack';
import { mergeManualEffects } from '../src/data/manualEffects';
import { parseCardEffects } from '../src/data/effectParser';
import { collectGrowCostReductions, calcFieldPowers, collectGrantedFromLayer, checkActiveCondition, calcActiveCostMods, collectCharmShieldSigni, applyContinuousBaseLevelOverride, calcContinuousBlockedActions, collectBanishSubstitutes, collectFieldSigniExtraColors, collectSelfTrashPreventNums } from '../src/engine/effectEngine';
import { evalCondition, evalUseCondition, banishDestination } from '../src/engine/execUtils';
import {
  executeEffect, getCardNum as getCardNumG,
  resumeSelectTarget, resumeSearch, resumeChoose,
  resumeLookAndReorder, resumeSelectZone, resumeSelectVirusZone, resumeSelectSigniZone, resumeRearrangeSigni,
  type ExecCtx, type ExecResult,
} from '../src/engine/effectExecutor';
import { collectTargetedTriggers, collectLrigGrowTriggers, collectCoinPaidTriggers, collectPowerZeroTriggers, collectArmorTriggers, collectDeckTrashSelfTriggers, collectAnyZoneTrashSelfTriggers, collectTrashTriggers, collectBanishTriggers, collectLeaveFieldTriggers, collectDrawTriggers, collectOppDrawTriggers, collectMillTriggers, collectCharmToTrashTriggers, collectEnergyToTrashTriggers, collectRefreshTriggers, collectPowerDecreaseTriggers, collectMoveToDeckTriggers, collectFreezeTriggers, collectSelfEventTriggers, collectZoneMovedTriggers, collectDriveBecameTriggers, collectBeatBecameTriggers, collectHandDiscardTriggers, collectOppArtsUseTriggers, collectArtsUseTriggers, collectFieldTriggers, collectBloomTriggers, collectTurnTriggers, collectAllyPlayOrOppDiscardTriggers, collectMaterialUsedByPlayerTriggers, collectMaterialUsedOnSigniTriggers, collectBanishOppByEffectTriggers, collectLrigUnderMovedTriggers, collectDeckShuffledTriggers, collectKeywordGainedTriggers, collectSigniDownUpTriggers, type TrigCtx } from '../src/engine/triggerCollect';
import { countLrigUnderMoved, detectDeckShuffled, detectKeywordGained, detectNewlyDowned, detectNewlyUpped } from '../src/engine/boardDiff';
import { computeFieldSigniLimit, reduceFieldSigniToLimit } from '../src/screens/battle/fieldLimit';
import { detectBanishedSigni, detectTrashedSigni, detectDeckTrashed, countRefresh, detectPowerDecrease, detectNewlyFrozen, countMovedToDeck, countCharmsToTrash } from '../src/engine/boardDiff';

// ── データ読み込み ──
const root = process.cwd();
const cardMap = new Map<string, CardData>();
for (const f of [...Array.from({ length: 11 }, (_, i) => `CardData_Sheet${i + 1}.csv`), 'CardData_TK.csv']) {
  const p = join(root, 'public/data', f);
  if (!fs.existsSync(p)) continue;
  const { data } = Papa.parse<Record<string, string>>(fs.readFileSync(p, 'utf-8').replace(/^﻿/, ''), { header: true, skipEmptyLines: true });
  for (const r of data) { const id = r.CardNum?.trim(); if (id && !cardMap.has(id)) cardMap.set(id, r as unknown as CardData); }
}
const effectsMap = new Map<string, CardEffect[]>();
for (const f of ['effects_WX.json', 'effects_WXDi.json', 'effects_WX24_26.json', 'effects_WXK.json', 'effects_misc.json']) {
  const j = JSON.parse(fs.readFileSync(join(root, 'public/data', f), 'utf-8'));
  for (const [id, effs] of Object.entries(j)) effectsMap.set(id, effs as CardEffect[]);
}
for (const [id, card] of cardMap) {
  const merged = mergeManualEffects(id, (effectsMap.get(id) ?? []) as never[]);
  if (merged.length > 0) (card as { effects?: CardEffect[] }).effects = merged as CardEffect[];
}

// ── カード選定ヘルパー（属性の決まった実カードを使う）──
const findCard = (pred: (c: CardData) => boolean): string => {
  for (const c of cardMap.values()) if (pred(c)) return c.CardNum;
  throw new Error('該当カードなし');
};
const isSigni = (c: CardData) => c.Type === 'シグニ';
const SIGNI = findCard(c => isSigni(c) && parseInt(c.Power || '0') > 0);
const SIGNI_P3000 = findCard(c => isSigni(c) && c.Power === '3000');
const SIGNI_P12000 = findCard(c => isSigni(c) && c.Power === '12000');
const SIGNI_L1 = findCard(c => isSigni(c) && c.Level === '1');
const SIGNI_L2 = findCard(c => isSigni(c) && c.Level === '2');
const SIGNI_L3 = findCard(c => isSigni(c) && c.Level === '3');
const SIGNI_L4 = findCard(c => isSigni(c) && c.Level === '4');
// engine は cardMap.get(インスタンスID) で照合するため、インスタンスID＝素のCardNum（#suffixなし）を使う。
// 重複でゾーン間が混ざらないよう、全シグニから distinct に払い出すカーソル方式。
const POOL = [...cardMap.values()].filter(isSigni).map(c => c.CardNum);
let cursor = 0;
const fresh = () => { const v = POOL[cursor % POOL.length]; cursor++; return v; };
const fill = (n: number) => Array.from({ length: n }, () => fresh());

// ── 盤面ビルダー ──
interface StateOpts { signi?: (string | null)[]; deckTop?: string[]; hand?: number; trash?: number; energy?: number; life?: number; coins?: number; down?: boolean[]; }
function mkState(o: StateOpts = {}): PlayerState {
  return {
    deck: [...(o.deckTop ?? []), ...fill(20)],
    lrig_deck: [], hand: fill(o.hand ?? 5), life_cloth: fill(o.life ?? 7),
    trash: fill(o.trash ?? 3), lrig_trash: [], energy: fill(o.energy ?? 5), coins: o.coins ?? 3, bonds: [],
    field: {
      lrig: [], signi: o.signi ? o.signi.map(s => (s ? [s] : null)) : [null, null, null],
      signi_down: o.down ?? [false, false, false], signi_frozen: [false, false, false],
      assist_lrig_l: [], assist_lrig_r: [], check: null, key_piece: null, free_zone: [], signi_traps: [null, null, null],
    },
  } as unknown as PlayerState;
}
function mkCtx(owner: StateOpts, other: StateOpts, sourceInst?: string): ExecCtx {
  return {
    ownerState: mkState(owner), otherState: mkState(other),
    cardMap: cardMap as Map<string, CardData>, logs: [],
    sourceCardNum: sourceInst, triggeringCardNum: sourceInst, currentPhase: 'MAIN',
  } as unknown as ExecCtx;
}

// ── オートパイロット（最終 ExecResult を返す）──
function run(eff: EffectAction, ctx: ExecCtx): ExecResult {
  let result = executeEffect({ effectId: 't', effectType: 'AUTO', action: eff, duration: 'INSTANT', mandatory: true } as CardEffect, ctx);
  let steps = 0;
  while (!result.done) {
    if (++steps > 40) throw new Error('autopilot hang');
    const pending = (result as { pending: { type: string; [k: string]: unknown } }).pending;
    const p = pending as Record<string, unknown>;
    const c: ExecCtx = { ...ctx, ownerState: result.ownerState, otherState: result.otherState, logs: result.logs };
    switch (pending.type) {
      case 'SELECT_TARGET': { const cands = (p.candidates as string[]) ?? []; result = resumeSelectTarget(cands.slice(0, Math.min((p.count as number) ?? 1, cands.length)), pending as never, c); break; }
      case 'SEARCH': { const vis = (p.visibleCards as string[]) ?? []; result = resumeSearch(vis.slice(0, Math.min((p.maxPick as number) ?? 0, vis.length)), pending as never, c); break; }
      case 'CHOOSE': { const opts = (p.options as { id: string; available?: boolean }[]) ?? []; const pick = opts.find(o => o.available !== false) ?? opts[0]; result = resumeChoose(pick.id, pending as never, c); break; }
      case 'LOOK_AND_REORDER': result = resumeLookAndReorder((p.cards as string[]) ?? [], [], pending as never, c); break;
      case 'SELECT_ZONE': result = resumeSelectZone(steps % 3, pending as never, c); break;
      case 'SELECT_SIGNI_ZONE': result = resumeSelectSigniZone(steps % 3, pending as never, c); break;
      case 'SELECT_VIRUS_ZONE': result = resumeSelectVirusZone(steps % 3, pending as never, c); break;
      default: throw new Error(`unhandled pending ${pending.type}`);
    }
  }
  return result;
}

// ── テストフレームワーク ──
let pass = 0; const fails: string[] = [];
function test(name: string, fn: () => void) { try { fn(); pass++; } catch (e) { fails.push(`${name}: ${(e as Error).message}`); } }
function eq(a: unknown, b: unknown, m = '') { if (a !== b) throw new Error(`${m} expected=${b} got=${a}`); }
function ok(c: boolean, m = '') { if (!c) throw new Error(m || 'assert false'); }
const tops = (st: PlayerState) => st.field.signi.map(s => s?.at(-1) ?? null);

// ══════════════ テスト ══════════════
test('DRAW: 手札+2 デッキ-2', () => {
  const ctx = mkCtx({ hand: 5 }, {});
  const d0 = ctx.ownerState.deck.length;
  const r = run({ type: 'DRAW', owner: 'self', count: 2 } as EffectAction, ctx);
  eq(r.ownerState.hand.length, 7, 'hand'); eq(r.ownerState.deck.length, d0 - 2, 'deck');
});
test('LAST_PROCESSED_LEVEL_SUM: 合計レベルを operator で判定（eq/gte/lte・続き160）', () => {
  const lv = (n: number) => findCard(c => isSigni(c) && parseInt(c.Level ?? '', 10) === n);
  const a = lv(2), b = lv(3); // レベル合計 5
  const ctx = { ...mkCtx({}, {}), lastProcessedCards: [a, b] } as unknown as ExecCtx;
  const ev = (operator: string, value: number) => evalCondition({ type: 'LAST_PROCESSED_LEVEL_SUM', operator, value } as never, ctx);
  ok(ev('eq', 5) && !ev('eq', 4), 'eq: 合計5のみ真');
  ok(ev('gte', 5) && ev('gte', 4) && !ev('gte', 6), 'gte: 5以下の閾値で真');
  ok(ev('lte', 5) && ev('lte', 6) && !ev('lte', 4), 'lte: 5以上の閾値で真');
});
test('VARIABLE_DISCARD_AND_DRAW: 手札5全捨て→捨てた5+bonus1=6枚ドロー（WX09-Re15）', () => {
  const ctx = mkCtx({ hand: 5, trash: 3 }, {});
  const d0 = ctx.ownerState.deck.length;
  // autopilot は SELECT_TARGET を count 上限まで選択＝手札5枚全捨て
  const r = run({ type: 'VARIABLE_DISCARD_AND_DRAW', owner: 'self', drawBonus: 1 } as EffectAction, ctx);
  eq(r.ownerState.trash.length, 3 + 5, '5枚捨ててトラッシュ+5');
  eq(r.ownerState.deck.length, d0 - 6, '捨てた5+bonus1=6枚ドロー');
  eq(r.ownerState.hand.length, 6, '手札=引いた6枚（5捨て後）');
});
test('VARIABLE_DISCARD_AND_DRAW: 手札0なら捨てずbonus分のみドロー', () => {
  const ctx = mkCtx({ hand: 0 }, {});
  const d0 = ctx.ownerState.deck.length;
  const r = run({ type: 'VARIABLE_DISCARD_AND_DRAW', owner: 'self', drawBonus: 1 } as EffectAction, ctx);
  eq(r.ownerState.hand.length, 1, 'bonus1枚のみ'); eq(r.ownerState.deck.length, d0 - 1, 'デッキ-1');
});
test('TRASH 手札1: 手札-1 トラッシュ+1', () => {
  const ctx = mkCtx({ hand: 5, trash: 3 }, {});
  const r = run({ type: 'TRASH', target: { type: 'HAND_CARD', owner: 'self', count: 1 } } as EffectAction, ctx);
  eq(r.ownerState.hand.length, 4, 'hand'); eq(r.ownerState.trash.length, 4, 'trash');
});
test('TRASH 相手エナ1(選択): エナ-1 トラッシュ+1', () => {
  const ctx = mkCtx({}, { energy: 5, trash: 3 });
  const r = run({ type: 'TRASH', target: { type: 'ENERGY_CARD', owner: 'opponent', count: 1 } } as EffectAction, ctx);
  eq(r.otherState.energy.length, 4, 'エナ-1');
  eq(r.otherState.trash.length, 4, 'トラッシュ+1');
});
test('collectBanishSubstitutes: F-3犠牲型 self_sacrifice_other（WX12-024）＝他の＜電機＞を身代わり候補に挙げる（タスク12(xv)）', () => {
  // WX12-024-E1 = STUB BANISH_SUBSTITUTE{pattern:self_sacrifice_other,sacrificeClass:電機}
  const st = mkState({ signi: ['WX12-024', 'WD03-009', null] }); // victim=WX12-024 / 犠牲候補=WD03-009(＜電機＞)
  const opts = collectBanishSubstitutes(st, mkState({}), false, cardMap as Map<string, CardData>, effectsMap, 'WX12-024');
  ok(opts.some(o => o.kind === 'sacrifice' && o.sacrificeNum === 'WD03-009'), `身代わり候補にWD03-009 (${JSON.stringify(opts)})`);
});
test('collectBanishSubstitutes: F-3保護型 protect_other_sacrifice_self（WXDi-CP01-032）＝他の味方の被バニッシュ時に自己犠牲を提示（タスク12(xv)）', () => {
  // WXDi-CP01-032-E1 = STUB BANISH_SUBSTITUTE{pattern:protect_other_sacrifice_self,victimFilter:otherAny}+activeCondition TURN_OWNER相手
  const st = mkState({ signi: ['WXDi-CP01-032', 'WD03-009', null] }); // source=CP01-032(保護者) / victim=WD03-009(他の味方)
  const opts = collectBanishSubstitutes(st, mkState({}), false, cardMap as Map<string, CardData>, effectsMap, 'WD03-009');
  ok(opts.some(o => o.kind === 'sacrifice' && o.sacrificeNum === 'WXDi-CP01-032'), `自己犠牲(CP01-032)を提示 (${JSON.stringify(opts)})`);
});
test('SELF_TRASH_PREVENT: 自分の効果で自シグニをトラッシュに置けない（WX07-033・§6.1・タスク7）', () => {
  // collector が場の WX07-033（CONTINUOUS SELF_TRASH_PREVENT）を検出。
  const st = mkState({ signi: ['WX07-033', null, null] });
  ok(collectSelfTrashPreventNums(st, mkState({}), true, effectsMap, cardMap as Map<string, CardData>).has('WX07-033'), 'collectorがWX07-033を検出');
  // ownSelfTrashPreventNums に入っていれば自己トラッシュ候補から除外＝トラッシュされず場に残る。
  const ctx = mkCtx({ signi: ['WX07-033', null, null] }, {});
  ctx.ownSelfTrashPreventNums = new Set(['WX07-033']);
  const r = run({ type: 'TRASH', target: { type: 'SIGNI', owner: 'self', count: 1 } } as EffectAction, ctx);
  ok(tops(r.ownerState).includes('WX07-033'), 'WX07-033は自己トラッシュされず場に残る');
  // 制限なし（対照）＝通常どおりトラッシュされる。
  const ctx2 = mkCtx({ signi: ['WX07-033', null, null] }, {});
  const r2 = run({ type: 'TRASH', target: { type: 'SIGNI', owner: 'self', count: 1 } } as EffectAction, ctx2);
  ok(!tops(r2.ownerState).includes('WX07-033'), '制限なしならトラッシュされる（対照）');
});
test('STACK_SPELL: トラッシュのスペルをこのカードの下に置く（WX11-029・§6.1・タスク7）', () => {
  // WX11-029-E1 = ON_PLAY STACK_SPELL{from:trash,filter:スペル,maxCount:3}。トラッシュの2スペルを WX11-029 の下へ。
  const s1 = findCard(c => c.CardNum === 'WD01-015'), s2 = findCard(c => c.CardNum === 'WD01-018');
  const ctx = mkCtx({ signi: ['WX11-029', null, null] }, {}, 'WX11-029');
  ctx.ownerState.trash = [s1, s2];
  const r = run({ type: 'STACK_SPELL', from: 'trash', filter: { cardType: 'スペル' }, maxCount: 3 } as EffectAction, ctx);
  const zone = r.ownerState.field.signi.find(st => st?.at(-1) === 'WX11-029');
  ok(!!zone && zone.length === 3, `WX11-029の下に2スペル (${JSON.stringify(zone)})`);
  ok(!r.ownerState.trash.includes(s1) && !r.ownerState.trash.includes(s2), 'スペルはトラッシュから除かれた');
});
test('collectFieldSigniExtraColors COLOR_INHERIT: WX11-032はエナゾーンのカードの色を追加で持つ（§6.1・タスク7）', () => {
  // WX11-032-E1 = CONTINUOUS COLOR_INHERIT{source:energy}。エナに赤・青を置くと WX11-032 が赤青を追加取得。
  const redCard = findCard(c => c.Type === 'シグニ' && c.Color === '赤');
  const blueCard = findCard(c => c.Type === 'シグニ' && c.Color === '青');
  const st = mkState({ signi: ['WX11-032', null, null] });
  st.energy = [redCard, blueCard];
  const m = collectFieldSigniExtraColors(st, cardMap as Map<string, CardData>, effectsMap, mkState({}), true);
  const colors = m.get('WX11-032') ?? [];
  ok(colors.includes('赤') && colors.includes('青'), `エナの赤青を得る (${JSON.stringify(colors)})`);
  // エナが空なら追加色なし
  const st0 = mkState({ signi: ['WX11-032', null, null] }); st0.energy = [];
  ok(!(collectFieldSigniExtraColors(st0, cardMap as Map<string, CardData>, effectsMap, mkState({}), true).get('WX11-032')?.length), 'エナ空なら追加色なし');
});
test('collectGrowCostReductions: 場のCONT GROW_COST_REDUCTIONを色別集計', () => {
  // WX10-010-E1 = CONTINUOUS GROW_COST_REDUCTION reduction:[赤1,白1]
  const st = mkState({ signi: ['WX10-010', null, null] });
  const red = collectGrowCostReductions(st, mkState({}), true, effectsMap, cardMap as Map<string, CardData>);
  const byColor = Object.fromEntries(red.map(r => [r.color, r.count]));
  eq(byColor['赤'], 1, '赤-1');
  eq(byColor['白'], 1, '白-1');
});
test('collectGrowCostReductions per-count: WX14-009 トラッシュの《フレイスロ》N枚で赤floor(N/7)（タスク12(xviii)）', () => {
  // 従来は枚数無視で常時-赤1の過大軽減バグ。修正後は floor(match/7) 倍（7未満は0）。
  const flCard = findCard(c => (c.CardName ?? '').includes('フレイスロ'));
  const mk = (n: number) => { const st = mkState({}); st.field.lrig = ['WX14-009']; st.trash = Array.from({ length: n }, () => flCard); return st; };
  const red = (n: number) => Object.fromEntries(collectGrowCostReductions(mk(n), mkState({}), true, effectsMap, cardMap as Map<string, CardData>).map(r => [r.color, r.count]));
  eq(red(6)['赤'] ?? 0, 0, '6枚（7未満）は減額0');
  eq(red(7)['赤'], 1, '7枚で赤1');
  eq(red(14)['赤'], 2, '14枚で赤2');
});
test('collectGrowCostReductions per-count: WD14-001 トラッシュの＜悪魔＞シグニN枚で黒floor(N/6)（タスク12(xviii)）', () => {
  const akuma = findCard(c => c.Type === 'シグニ' && (c.CardClass ?? '').includes('悪魔'));
  const mk = (n: number) => { const st = mkState({}); st.field.lrig = ['WD14-001']; st.trash = Array.from({ length: n }, () => akuma); return st; };
  const red = (n: number) => Object.fromEntries(collectGrowCostReductions(mk(n), mkState({}), true, effectsMap, cardMap as Map<string, CardData>).map(r => [r.color, r.count]));
  eq(red(5)['黒'] ?? 0, 0, '5枚（6未満）は減額0');
  eq(red(6)['黒'], 1, '6枚で黒1');
  eq(red(12)['黒'], 2, '12枚で黒2');
});
test('POWER_MODIFY_PER_ENERGY: エナ枚数×deltaでCONTパワー加算（WX09-019）', () => {
  // WX09-019-E1 = CONTINUOUS POWER_MODIFY_PER_ENERGY deltaPerCard:2000 energyOwner:self target:自身
  const base = parseInt(cardMap.get('WX09-019')?.Power || '0'); // WX09-019はベースパワー0（エナ依存）
  const p4 = calcFieldPowers(mkState({ signi: ['WX09-019', null, null], energy: 4 }), mkState({}), true, effectsMap, cardMap as Map<string, CardData>);
  eq(p4.get('WX09-019'), base + 8000, 'エナ4枚で+8000');
  const p0 = calcFieldPowers(mkState({ signi: ['WX09-019', null, null], energy: 0 }), mkState({}), true, effectsMap, cardMap as Map<string, CardData>);
  eq(p0.get('WX09-019'), base, 'エナ0枚で加算なし');
});
test('LOOK_AT_DECK_AND_LIFE: 情報開示のみ（盤面不変）', () => {
  const ctx = mkCtx({}, { deckTop: [SIGNI], life: 7 });
  const beforeDeck = ctx.otherState.deck.length, beforeLife = ctx.otherState.life_cloth.length;
  const r = run({ type: 'LOOK_AT_DECK_AND_LIFE', targetOwner: 'opponent', mode: 'both' } as EffectAction, ctx);
  eq(r.otherState.deck.length, beforeDeck, 'デッキ不変');
  eq(r.otherState.life_cloth.length, beforeLife, 'ライフ不変');
  ok(r.logs.some(l => l.includes('見る')), '見るログ');
});
test('EQUALIZE_ENERGY 4: 各プレイヤーのエナを4枚に調整', () => {
  const ctx = mkCtx({ energy: 6 }, { energy: 5 });
  const r = run({ type: 'EQUALIZE_ENERGY', targetCount: 4 } as EffectAction, ctx);
  eq(r.ownerState.energy.length, 4, '自エナ4');
  eq(r.otherState.energy.length, 4, '相エナ4');
});
test('EQUALIZE_ENERGY owner:opponent: 相手のみ調整（自分は不変）', () => {
  const ctx = mkCtx({ energy: 6 }, { energy: 6 });
  const r = run({ type: 'EQUALIZE_ENERGY', targetCount: 4, owner: 'opponent' } as EffectAction, ctx);
  eq(r.ownerState.energy.length, 6, '自エナ不変(6)');
  eq(r.otherState.energy.length, 4, '相エナ4');
});
test('ENERGY_CHARGE_FROM_DECK: エナ+2 デッキ-2', () => {
  const ctx = mkCtx({ energy: 5 }, {}); const d0 = ctx.ownerState.deck.length;
  const r = run({ type: 'ENERGY_CHARGE_FROM_DECK', owner: 'self', count: 2 } as EffectAction, ctx);
  eq(r.ownerState.energy.length, 7, 'energy'); eq(r.ownerState.deck.length, d0 - 2, 'deck');
});
test('MILL 自分3: デッキ-3 トラッシュ+3', () => {
  const ctx = mkCtx({ trash: 3 }, {}); const d0 = ctx.ownerState.deck.length;
  const r = run({ type: 'MILL', owner: 'self', count: 3 } as EffectAction, ctx);
  eq(r.ownerState.deck.length, d0 - 3, 'deck'); eq(r.ownerState.trash.length, 6, 'trash');
});
test('SHUFFLE_DECK: 枚数不変', () => {
  const ctx = mkCtx({}, {}); const d0 = ctx.ownerState.deck.length;
  const r = run({ type: 'SHUFFLE_DECK', owner: 'self' } as EffectAction, ctx);
  eq(r.ownerState.deck.length, d0, 'deck len');
});
test('BANISH 相手シグニ1: 場から除去', () => {
  const ctx = mkCtx({}, { signi: [SIGNI, null, null] });
  const r = run({ type: 'BANISH', target: { type: 'SIGNI', owner: 'opponent', count: 1, upToCount: false, filter: { cardType: 'シグニ' } } } as EffectAction, ctx);
  eq(tops(r.otherState)[0], null, 'signi[0] 除去');
  ok(r.otherState.energy.length + r.otherState.trash.length >= 9, '場外へ移動');
});
test('BOUNCE 相手シグニ1: 手札へ', () => {
  const ctx = mkCtx({}, { signi: [SIGNI, null, null], hand: 5 });
  const r = run({ type: 'BOUNCE', target: { type: 'SIGNI', owner: 'opponent', count: 1, upToCount: false, filter: { cardType: 'シグニ' } } } as EffectAction, ctx);
  eq(tops(r.otherState)[0], null, '除去'); eq(r.otherState.hand.length, 6, '手札+1');
});
test('SEND_TO_ENERGY 相手シグニ1: エナへ', () => {
  const ctx = mkCtx({}, { signi: [SIGNI, null, null], energy: 5 });
  const r = run({ type: 'SEND_TO_ENERGY', target: { type: 'SIGNI', owner: 'opponent', count: 1, upToCount: false, filter: { cardType: 'シグニ' } } } as EffectAction, ctx);
  eq(tops(r.otherState)[0], null, '除去'); eq(r.otherState.energy.length, 6, 'エナ+1');
});
test('DEPLOY_RESTRICT 配置数制限: 相手3体→超過1体トラッシュ＋配置数上限フラグ=2（WXK11-074）', () => {
  // 「このターン、対戦相手はシグニを2体までしか場に出せない（すでに3体以上→2体になるようにトラッシュ）」
  const ctx = mkCtx({}, { signi: [fresh(), fresh(), fresh()], trash: 0 }, 'WXK11-074');
  const r = run({ type: 'STUB', id: 'DEPLOY_RESTRICT' } as unknown as EffectAction, ctx);
  const cnt = r.otherState.field.signi.filter(s => s && s.length > 0).length;
  eq(cnt, 2, '相手シグニが2体になる');
  eq(r.otherState.signi_deploy_count_limit, 2, '配置数上限フラグ=2');
  eq(r.otherState.trash.length, 1, '超過1体をトラッシュ');
});
test('LEVEL_MODIFY 相手シグニ-1: temp_level_mods に記録＆レベルフィルタに反映', () => {
  // レベル2のシグニに -1 → レベル1扱いになり「レベル1以下」フィルタで対象化される
  const ctx = mkCtx({}, { signi: [SIGNI_L2, null, null] });
  const r = run({ type: 'LEVEL_MODIFY', target: { type: 'SIGNI', owner: 'opponent', count: 1 }, delta: -1, until: 'UNTIL_END_OF_TURN' } as EffectAction, ctx);
  const mods = r.otherState.temp_level_mods ?? [];
  eq(mods.length, 1, 'temp_level_mods +1');
  eq(mods[0].delta, -1, 'delta=-1');
  // 実効レベル1 → level:{max:1} フィルタで fieldCandidates が拾う（BANISH で確認）
  const r2 = run({ type: 'BANISH', target: { type: 'SIGNI', owner: 'opponent', count: 1, filter: { cardType: 'シグニ', level: { max: 1 } } } } as EffectAction, { ...ctx, otherState: r.otherState });
  eq(tops(r2.otherState)[0], null, 'レベル-1でレベル1以下フィルタの対象になり除去された');
});
test('superlative power max: 最大パワーのみ対象（P12000除去・P3000残存）', () => {
  const ctx = mkCtx({}, { signi: [SIGNI_P3000, SIGNI_P12000, null] });
  const r = run({ type: 'BANISH', target: { type: 'SIGNI', owner: 'opponent', count: 1, filter: { cardType: 'シグニ', superlative: { key: 'power', dir: 'max' } } } } as EffectAction, ctx);
  eq(tops(r.otherState)[1], null, 'P12000（最大）が除去される');
  ok(tops(r.otherState)[0] !== null, 'P3000 は残る');
});
test('superlative power min: 最小パワーのみ対象（P3000除去・P12000残存）', () => {
  const ctx = mkCtx({}, { signi: [SIGNI_P3000, SIGNI_P12000, null] });
  const r = run({ type: 'BANISH', target: { type: 'SIGNI', owner: 'opponent', count: 1, filter: { cardType: 'シグニ', superlative: { key: 'power', dir: 'min' } } } } as EffectAction, ctx);
  eq(tops(r.otherState)[0], null, 'P3000（最小）が除去される');
  ok(tops(r.otherState)[1] !== null, 'P12000 は残る');
});
test('powerLtSelf: 効果元パワー未満のみ対象（source P12000→P3000除去・P12000残存）', () => {
  const ctx = mkCtx({}, { signi: [SIGNI_P3000, SIGNI_P12000, null] }, SIGNI_P12000);
  const r = run({ type: 'BANISH', target: { type: 'SIGNI', owner: 'opponent', count: 1, filter: { cardType: 'シグニ', powerLtSelf: true } } } as EffectAction, ctx);
  eq(tops(r.otherState)[0], null, 'P3000（<12000）が除去される');
  ok(tops(r.otherState)[1] !== null, '同値 P12000 は残る（より低い＝strict）');
});
test('powerGtSelf: 効果元パワー超過のみ対象（source P3000→P12000除去・P3000残存）', () => {
  const ctx = mkCtx({}, { signi: [SIGNI_P3000, SIGNI_P12000, null] }, SIGNI_P3000);
  const r = run({ type: 'BANISH', target: { type: 'SIGNI', owner: 'opponent', count: 1, filter: { cardType: 'シグニ', powerGtSelf: true } } } as EffectAction, ctx);
  eq(tops(r.otherState)[1], null, 'P12000（>3000）が除去される');
  ok(tops(r.otherState)[0] !== null, '同値 P3000 は残る');
});
test('levelLtSelf: 効果元レベル未満のみ対象（source L2→L1除去・L2残存）', () => {
  const ctx = mkCtx({}, { signi: [SIGNI_L1, SIGNI_L2, null] }, SIGNI_L2);
  const r = run({ type: 'BANISH', target: { type: 'SIGNI', owner: 'opponent', count: 1, filter: { cardType: 'シグニ', levelLtSelf: true } } } as EffectAction, ctx);
  eq(tops(r.otherState)[0], null, 'L1（<2）が除去される');
  ok(tops(r.otherState)[1] !== null, '同値 L2 は残る');
});
test('powerLtTrigger: トリガー元パワー未満のみ対象（trigger P12000→P3000除去・P12000残存・WXK11-020）', () => {
  const ctx = mkCtx({}, { signi: [SIGNI_P3000, SIGNI_P12000, null] }, SIGNI_P12000);
  const r = run({ type: 'BANISH', target: { type: 'SIGNI', owner: 'opponent', count: 1, filter: { cardType: 'シグニ', powerLtTrigger: true } } } as EffectAction, ctx);
  eq(tops(r.otherState)[0], null, 'P3000（<12000）が除去される');
  ok(tops(r.otherState)[1] !== null, '同値 P12000 は残る');
});
test('levelLtTrigger: トリガー元レベル未満のみ対象（trigger L2→L1除去・L2残存・WX09-014）', () => {
  const ctx = mkCtx({}, { signi: [SIGNI_L1, SIGNI_L2, null] }, SIGNI_L2);
  const r = run({ type: 'BANISH', target: { type: 'SIGNI', owner: 'opponent', count: 1, filter: { cardType: 'シグニ', levelLtTrigger: true } } } as EffectAction, ctx);
  eq(tops(r.otherState)[0], null, 'L1（<2）が除去される');
  ok(tops(r.otherState)[1] !== null, '同値 L2 は残る');
});
// ── 続き48: 「このシグニが覚醒状態の場合」CONDITIONAL 持ち上げ（THIS_CARD_IS_AWAKENED）＝アタックフェイズ
// 開始時の効果を覚醒状態でゲート（PR-Di038/039・WXDi-P14-045/047/049・WX25-P2-072/075）。覚醒＝発火／非覚醒＝no-op。
test('THIS_CARD_IS_AWAKENED: 覚醒中のみ then 発火（覚醒→敵バニッシュ／非覚醒→不変・PR-Di039）', () => {
  const SRC = 'AWAKEN-SRC';
  const cond = { type: 'CONDITIONAL', condition: { type: 'THIS_CARD_IS_AWAKENED' },
    then: { type: 'BANISH', target: { type: 'SIGNI', owner: 'opponent', count: 1, filter: { cardType: 'シグニ' } } } } as EffectAction;
  // 覚醒状態: awakened_signi に source を含む → then が発火
  {
    const base = mkCtx({ signi: [SRC, null, null] }, { signi: [SIGNI_P3000, null, null] }, SRC);
    const ctx = { ...base, ownerState: { ...base.ownerState, awakened_signi: [SRC] } } as ExecCtx;
    const r = run(cond, ctx);
    eq(tops(r.otherState)[0], null, '覚醒中→敵シグニがバニッシュされる');
  }
  // 非覚醒: awakened_signi 空 → then スキップ（過剰効果の回帰ガード）
  {
    const base = mkCtx({ signi: [SRC, null, null] }, { signi: [SIGNI_P3000, null, null] }, SRC);
    const ctx = { ...base, ownerState: { ...base.ownerState, awakened_signi: [] } } as ExecCtx;
    const r = run(cond, ctx);
    ok(tops(r.otherState)[0] !== null, '非覚醒→敵シグニは残る（無条件発火しない）');
  }
});
// ── 続き50: 「このシグニが〔アップ/ダウン〕状態の場合」CONDITIONAL 持ち上げ（THIS_CARD_IS_UP/DOWN）＝
// 効果元シグニの向き状態でゲート（WXDi-P02-038/P04-036 等）。アップ札はダウン時 no-op／ダウン札はアップ時 no-op。
test('THIS_CARD_IS_UP/DOWN: 効果元の向き状態でゲート（アップ札はアップ中のみ・ダウン札はダウン中のみ発火）', () => {
  const SRC = 'DIR-SRC';
  const mkCond = (t: string) => ({ type: 'CONDITIONAL', condition: { type: t },
    then: { type: 'BANISH', target: { type: 'SIGNI', owner: 'opponent', count: 1, filter: { cardType: 'シグニ' } } } } as EffectAction);
  // signi_down[0]=false（アップ）: UP札→発火／DOWN札→no-op
  {
    const base = mkCtx({ signi: [SRC, null, null] }, { signi: [SIGNI_P3000, null, null] }, SRC);
    const up = { ...base, ownerState: { ...base.ownerState, field: { ...base.ownerState.field, signi_down: [false, false, false] } } } as ExecCtx;
    eq(tops(run(mkCond('THIS_CARD_IS_UP'), up).otherState)[0], null, 'アップ中→UP札が発火（敵バニッシュ）');
    ok(tops(run(mkCond('THIS_CARD_IS_DOWN'), up).otherState)[0] !== null, 'アップ中→DOWN札は no-op');
  }
  // signi_down[0]=true（ダウン）: DOWN札→発火／UP札→no-op
  {
    const base = mkCtx({ signi: [SRC, null, null] }, { signi: [SIGNI_P3000, null, null] }, SRC);
    const dn = { ...base, ownerState: { ...base.ownerState, field: { ...base.ownerState.field, signi_down: [true, false, false] } } } as ExecCtx;
    eq(tops(run(mkCond('THIS_CARD_IS_DOWN'), dn).otherState)[0], null, 'ダウン中→DOWN札が発火（敵バニッシュ）');
    ok(tops(run(mkCond('THIS_CARD_IS_UP'), dn).otherState)[0] !== null, 'ダウン中→UP札は no-op（無条件発火しない）');
  }
});
// ── 続き51: 「(その後、)それが〔色/＜C＞〕のシグニの場合、追加で〜」CONDITIONAL 持ち上げ（LAST_PROCESSED_MATCHES）＝
// 直前に処理した対象カードの属性で追加効果をゲート（WX21-011/014）。SEQUENCE step 間で lastProcessedCards が伝播する
// ことの回帰ガード（DOWN した敵シグニの色を後続 CONDITIONAL が読む）。
test('LAST_PROCESSED_MATCHES 伝播: DOWN した敵シグニの色で追加効果をゲート（白/青→ドロー／赤→スキップ・WX21-011）', () => {
  const WHITE = findCard(c => isSigni(c) && (c.Color ?? '').includes('白'));
  const RED = findCard(c => isSigni(c) && (c.Color ?? '').includes('赤') && !(c.Color ?? '').includes('白') && !(c.Color ?? '').includes('青'));
  const eff = { type: 'SEQUENCE', steps: [
    { type: 'DOWN', target: { type: 'SIGNI', owner: 'opponent', count: 1, filter: { cardType: 'シグニ' } } },
    { type: 'CONDITIONAL', condition: { type: 'LAST_PROCESSED_MATCHES', filter: { cardType: 'シグニ', color: ['白', '青'] } }, then: { type: 'DRAW', owner: 'self', count: 2 } },
  ] } as EffectAction;
  // 敵に白シグニ1体 → DOWN後 lastProcessed=白 → 白/青一致で2ドロー
  {
    const r = run(eff, mkCtx({ hand: 3 }, { signi: [WHITE, null, null] }));
    eq(r.ownerState.hand.length, 5, '白シグニをダウン→2ドロー（3→5）');
  }
  // 敵に赤シグニ1体 → DOWN後 lastProcessed=赤 → 非一致でドローなし（過剰効果の回帰ガード）
  {
    const r = run(eff, mkCtx({ hand: 3 }, { signi: [RED, null, null] }));
    eq(r.ownerState.hand.length, 3, '赤シグニをダウン→ドローなし（無条件発火しない）');
  }
});
// ── 続き143: 「この方法で〔フィルタ〕がN枚以上〜した場合」CONDITIONAL 持ち上げ（LAST_PROCESSED_MATCHES minCount）＝
// 結果カウント閾値（Cluster B）。ミル結果の一致枚数が閾値未満なら発火しない回帰ガード（過剰実行にならない）。
test('LAST_PROCESSED_MATCHES minCount 閾値: この方法で黒N枚以上トラッシュ→ゲート（2枚→発火／1枚→不発・続き143）', () => {
  const BLACK = findCard(c => isSigni(c) && (c.Color ?? '') === '黒');
  const WHITE = findCard(c => isSigni(c) && (c.Color ?? '') === '白');
  // デッキ上2枚をトラッシュ（MILL）→ lastProcessed=その2枚 → 黒2枚以上なら1ドロー
  const eff = { type: 'SEQUENCE', steps: [
    { type: 'TRASH', target: { type: 'DECK_CARD', owner: 'self', count: 2 } },
    { type: 'CONDITIONAL', condition: { type: 'LAST_PROCESSED_MATCHES', filter: { color: '黒' }, minCount: 2 }, then: { type: 'DRAW', owner: 'self', count: 1 } },
  ] } as EffectAction;
  { // 黒2枚 → 発火（3→4）
    const r = run(eff, mkCtx({ hand: 3, deckTop: [BLACK, BLACK] }, {}));
    eq(r.ownerState.hand.length, 4, '黒2枚トラッシュ→minCount2一致→1ドロー');
  }
  { // 黒1枚+白1枚 → 不発（3→3）
    const r = run(eff, mkCtx({ hand: 3, deckTop: [BLACK, WHITE] }, {}));
    eq(r.ownerState.hand.length, 3, '黒1枚のみ→minCount2未満→ドローなし（無条件発火しない）');
  }
});
test('多分岐の後続枝が LAST_PROCESSED_MATCHES 化（bare step の無条件発火を防ぐ・続き143）', () => {
  // WXDi-P13-049: ミル→「レベル1→引く。レベル2→捨てさせる。レベル3以上→バニッシュ。スペル→…」。
  // 従来は第1枝のみ条件付きで第2枝以降が bare step（無条件発火＝過剰実行）だった。
  const e = (effectsMap.get('WXDi-P13-049') ?? []).find(x => x.effectId === 'WXDi-P13-049-E1');
  const steps = (e?.action as { steps?: Array<{ type?: string; condition?: { type?: string; filter?: Record<string, unknown> } }> })?.steps ?? [];
  const conds = steps.filter(s => s.type === 'CONDITIONAL' && s.condition?.type === 'LAST_PROCESSED_MATCHES');
  ok(conds.length === 4, `4枝すべて LAST_PROCESSED_MATCHES 化のはず（実際 ${conds.length}枝・${JSON.stringify(steps.map(s => s.type))}）`);
  const s = JSON.stringify(conds.map(c => c.condition?.filter));
  ok(s.includes('"level":1') && s.includes('"level":2') && s.includes('"min":3') && s.includes('"cardType":"スペル"'),
     `レベル1/2/3以上/スペルの4条件のはず（実際 ${s}）`);
});
test('結果カウント閾値の parser 構造固定（Cluster B・続き143）', () => {
  // WDK06-C07: 黒5枚トラッシュ→{color:黒}minCount5
  const s1 = JSON.stringify(effectsMap.get('WDK06-C07') ?? []);
  ok(s1.includes('"LAST_PROCESSED_MATCHES"') && s1.includes('"color":"黒"') && s1.includes('"minCount":5'),
     `WDK06-C07: 黒minCount5のはず（実際 ${s1.slice(0, 200)}）`);
  // WXK06-030: 龍獣8枚トラッシュ→{story:龍獣}minCount8
  const s2 = JSON.stringify(effectsMap.get('WXK06-030') ?? []);
  ok(s2.includes('"LAST_PROCESSED_MATCHES"') && s2.includes('"story":"龍獣"') && s2.includes('"minCount":8'),
     `WXK06-030: 龍獣minCount8のはず（実際 ${s2.slice(0, 200)}）`);
  // WXDi-P03-083: スペル1枚以上トラッシュ→{cardType:スペル}minCount1
  const s3 = JSON.stringify(effectsMap.get('WXDi-P03-083') ?? []);
  ok(s3.includes('"LAST_PROCESSED_MATCHES"') && s3.includes('"cardType":"スペル"'),
     `WXDi-P03-083: スペルのはず（実際 ${s3.slice(0, 200)}）`);
});
test('「それをエナゾーンに置く」＝対象化した相手シグニのエナ送り（ENERGY_CHARGE誤マップ回帰・§3タスク12(xxviii)・続き147）', () => {
  // 原文「対戦相手のシグニ1体を対象とし、コストを支払ってもよい。そうした場合、それをエナゾーンに置く。」
  // 「それ」＝対象化した相手シグニ＝SEND_TO_ENERGY（エナ送り除去）。従来は REVEAL 文脈用の
  // ENERGY_CHARGE{DECK_CARD,self}（自分デッキからのチャージ）へ誤マップされ、除去が丸ごと自分エナ増加に化けていた。
  for (const id of ['WXDi-P05-073-BURST', 'WX25-P2-026-E1', 'WX26-CP1-086-BURST', 'WXK05-027-E2', 'WXK05-070-E1', 'WXK10-048-BURST', 'WDK08-Y11-BURST']) {
    const card = id.replace(/-(BURST|E\d+|SONG)$/, '');
    const e = (effectsMap.get(card) ?? []).find(x => x.effectId === id);
    const steps = (e?.action as { steps?: Array<{ type?: string; condition?: { type?: string }; then?: { type?: string; target?: { owner?: string } } }> })?.steps ?? [];
    const cond = steps.find(s => s.type === 'CONDITIONAL' && s.condition?.type === 'IS_MY_TURN');
    ok(cond?.then?.type === 'SEND_TO_ENERGY', `${id}: then が SEND_TO_ENERGY のはず（実際 ${cond?.then?.type}）`);
    ok(cond?.then?.target?.owner === 'opponent', `${id}: 対象が相手シグニのはず（実際 owner=${cond?.then?.target?.owner}）`);
    const s = JSON.stringify(e?.action ?? {});
    ok(!s.includes('ENERGY_CHARGE'), `${id}: ENERGY_CHARGE（自分デッキチャージ）へ退化していないこと`);
  }
});
// ── 続き49: 「あなたの場にあるすべてのシグニが＜C＞の場合」CONDITIONAL 持ち上げ（ALL_FIELD_SIGNI_MATCH）＝
// 場の全シグニ同クラスでゲート（WX25-CP1-042 等）。全一致＝発火／1体でも非一致＝no-op／空盤面＝no-op。
test('ALL_FIELD_SIGNI_MATCH: 場の全シグニが同クラスのときのみ then 発火（全一致→発火／混在→不変／空→不変）', () => {
  const GEM = findCard(c => isSigni(c) && (c.CardClass ?? '').includes('宝石'));
  const NONGEM = findCard(c => isSigni(c) && !(c.CardClass ?? '').includes('宝石'));
  const cond = { type: 'CONDITIONAL', condition: { type: 'ALL_FIELD_SIGNI_MATCH', owner: 'self', filter: { cardType: 'シグニ', story: '宝石' } },
    then: { type: 'BANISH', target: { type: 'SIGNI', owner: 'opponent', count: 1, filter: { cardType: 'シグニ' } } } } as EffectAction;
  // 全シグニが＜宝石＞ → 発火
  {
    const r = run(cond, mkCtx({ signi: [GEM, GEM, null] }, { signi: [SIGNI_P3000, null, null] }));
    eq(tops(r.otherState)[0], null, '全＜宝石＞→敵シグニがバニッシュされる');
  }
  // 1体が非＜宝石＞ → no-op（過剰効果の回帰ガード）
  {
    const r = run(cond, mkCtx({ signi: [GEM, NONGEM, null] }, { signi: [SIGNI_P3000, null, null] }));
    ok(tops(r.otherState)[0] !== null, '混在→敵シグニは残る（無条件発火しない）');
  }
  // 空盤面 → no-op（1体以上必須＝空振り発火しない）
  {
    const r = run(cond, mkCtx({ signi: [null, null, null] }, { signi: [SIGNI_P3000, null, null] }));
    ok(tops(r.otherState)[0] !== null, '空盤面→敵シグニは残る（vacuous true にしない）');
  }
});
// ── 続き53: 「あなたの場にレベルNの覚醒状態のシグニがある場合」CONDITIONAL 持ち上げ（HAS_CARD_IN_FIELD の
// isAwakened 状態フィルタ）＝場に該当レベルの覚醒シグニが居るときのみ then 発火（WXDi-P14-054/058/066）。
// 覚醒あり→発火／覚醒なし→no-op／レベル不一致→no-op（無条件発火の過剰効果の回帰ガード）。
test('HAS_CARD_IN_FIELD isAwakened: レベル3の覚醒シグニが居るときのみ then 発火（覚醒→発火／非覚醒→不変／Lv不一致→不変）', () => {
  const cond = { type: 'CONDITIONAL', condition: { type: 'HAS_CARD_IN_FIELD', owner: 'self', filter: { cardType: 'シグニ', level: 3, isAwakened: true } },
    then: { type: 'BANISH', target: { type: 'SIGNI', owner: 'opponent', count: 1, filter: { cardType: 'シグニ' } } } } as EffectAction;
  // Lv3 シグニが覚醒状態 → 発火
  {
    const ctx = mkCtx({ signi: [SIGNI_L3, null, null] }, { signi: [SIGNI_P3000, null, null] });
    ctx.ownerState.awakened_signi = [SIGNI_L3];
    const r = run(cond, ctx);
    eq(tops(r.otherState)[0], null, 'Lv3覚醒シグニ有→敵シグニがバニッシュされる');
  }
  // Lv3 シグニは居るが非覚醒 → no-op（過剰効果の回帰ガード）
  {
    const ctx = mkCtx({ signi: [SIGNI_L3, null, null] }, { signi: [SIGNI_P3000, null, null] });
    ctx.ownerState.awakened_signi = [];
    const r = run(cond, ctx);
    ok(tops(r.otherState)[0] !== null, 'Lv3居るが非覚醒→敵シグニは残る（無条件発火しない）');
  }
  // 覚醒だがレベル不一致（Lv2）→ no-op
  {
    const ctx = mkCtx({ signi: [SIGNI_L2, null, null] }, { signi: [SIGNI_P3000, null, null] });
    ctx.ownerState.awakened_signi = [SIGNI_L2];
    const r = run(cond, ctx);
    ok(tops(r.otherState)[0] !== null, 'Lv2覚醒→レベル不一致で敵シグニは残る');
  }
});
// ── 続き55: 「あなたのセンタールリグのレベルが対戦相手のセンタールリグ〔以下/より低い〕の場合」＝LRIG_LEVEL_CMP_OPP ──
// 自/相手中央ルリグのレベル比較 condition（WXK07-025-E1 lte／WXK10-068-E2 lte）＝従来ドロップし無条件発火の回帰ガード。
test('LRIG_LEVEL_CMP_OPP: 自中央ルリグ vs 相手中央ルリグのレベル比較（lte:自≤相手→発火/自>相手→no-op・WXK07-025）', () => {
  const L2 = findCard(c => c.Type === 'ルリグ' && c.Level === '2');
  const L4 = findCard(c => c.Type === 'ルリグ' && c.Level === '4');
  const cond = { type: 'CONDITIONAL', condition: { type: 'LRIG_LEVEL_CMP_OPP', operator: 'lte' },
    then: { type: 'BANISH', target: { type: 'SIGNI', owner: 'opponent', count: 1, filter: { cardType: 'シグニ' } } } } as EffectAction;
  // 自Lv2 ≤ 相手Lv4 → 発火
  {
    const ctx = mkCtx({ signi: [SIGNI_P3000, null, null] }, { signi: [SIGNI_P3000, null, null] });
    ctx.ownerState.field.lrig = [L2]; ctx.otherState.field.lrig = [L4];
    const r = run(cond, ctx);
    eq(tops(r.otherState)[0], null, '自Lv2≤相手Lv4→敵シグニがバニッシュされる');
  }
  // 自Lv4 > 相手Lv2 → no-op（過剰効果の回帰ガード）
  {
    const ctx = mkCtx({ signi: [SIGNI_P3000, null, null] }, { signi: [SIGNI_P3000, null, null] });
    ctx.ownerState.field.lrig = [L4]; ctx.otherState.field.lrig = [L2];
    const r = run(cond, ctx);
    ok(tops(r.otherState)[0] !== null, '自Lv4>相手Lv2→敵シグニは残る（無条件発火しない）');
  }
});
// ── 続き54: 「対戦相手のセンタールリグより低いレベルを持つ、あなたの＜X＞のシグニ」＝levelLtOppLrig ──
// resolveDynamicFilter が opp 中央ルリグのレベル-1 を level.max へ解決＝相手ルリグ未満の自シグニのみ付与対象
// （WX19-042＝従来 target が LRIG に誤パースし ランサー が自ルリグに誤付与されていた mis-parse の回帰ガード）。
test('levelLtOppLrig: 相手中央ルリグ(Lv3)未満の自シグニのみ付与（自Lv2→付与/自Lv4→非付与・WX19-042）', () => {
  const OPPL = findCard(c => c.Type === 'ルリグ' && c.Level === '3');
  const ctx = mkCtx({ signi: [SIGNI_L2, SIGNI_L4, null] }, {});
  ctx.otherState.field.lrig = [OPPL];
  const r = run({ type: 'GRANT_KEYWORD', target: { type: 'SIGNI', owner: 'self', count: 'ALL', filter: { cardType: 'シグニ', levelLtOppLrig: true } }, keyword: 'ランサー', duration: 'UNTIL_END_OF_TURN' } as EffectAction, ctx);
  const g = r.ownerState.keyword_grants ?? {};
  ok((g[SIGNI_L2] ?? []).includes('ランサー'), `Lv2(<opp3)にランサー付与 got=${JSON.stringify(g[SIGNI_L2])}`);
  ok(!(g[SIGNI_L4] ?? []).includes('ランサー'), `Lv4(≥opp3)には付与しない got=${JSON.stringify(g[SIGNI_L4])}`);
});
// GRANT_KEYWORD の excludeSelf＝「あなたの他のシグニ1体を対象とし…を得る」（WXDi-P11-040）。
// 従来は engine が excludeSelf を見ておらず、他に味方シグニが居ないと効果元自身に付与されていた（続き72の実機観測・続き75で修正）。
test('GRANT_KEYWORD excludeSelf: 効果元自身は対象外・他の味方のみに付与（WXDi-P11-040）', () => {
  const ctx = mkCtx({ signi: [SIGNI_P3000, SIGNI_P12000, null] }, {});
  ctx.sourceCardNum = SIGNI_P3000; // 効果元＝zone0 のシグニ
  const r = run({ type: 'GRANT_KEYWORD', target: { type: 'SIGNI', owner: 'self', count: 'ALL', filter: { excludeSelf: true } }, keyword: 'シャドウ', duration: 'UNTIL_END_OF_TURN' } as EffectAction, ctx);
  const g = r.ownerState.keyword_grants ?? {};
  ok(!(g[SIGNI_P3000] ?? []).includes('シャドウ'), `効果元自身には付与しない got=${JSON.stringify(g[SIGNI_P3000])}`);
  ok((g[SIGNI_P12000] ?? []).includes('シャドウ'), `他の味方には付与 got=${JSON.stringify(g[SIGNI_P12000])}`);
});
test('powerLtAnyAlly: 自分の最大パワー未満のみ対象（ally max P12000→敵P3000除去・P12000残存・WXDi-P01-020）', () => {
  const ctx = mkCtx({ signi: [SIGNI_P3000, SIGNI_P12000, null] }, { signi: [SIGNI_P3000, SIGNI_P12000, null] });
  const r = run({ type: 'BANISH', target: { type: 'SIGNI', owner: 'opponent', count: 1, filter: { cardType: 'シグニ', powerLtAnyAlly: true } } } as EffectAction, ctx);
  eq(tops(r.otherState)[0], null, '敵P3000（<自最大12000）が除去される');
  ok(tops(r.otherState)[1] !== null, '敵P12000（=最大・より低くない）は残る');
});
// ── 続き46: 表記パワー比較（per-candidate）＝「表記されているパワーよりパワーの低い/高い」= 実効 vs 自身の表記 ──
test('powerLtPrinted/powerGtPrinted: 実効パワーと表記パワーの per-candidate 比較（WX25-CP1-093/WXK10-027）', () => {
  // 低い＝低下中のみ対象：P3000を実効1000に低下→対象／P12000は実効=表記→非対象
  {
    const ep = new Map<string, number>([[SIGNI_P3000, 1000], [SIGNI_P12000, 12000]]);
    const ctx = { ...mkCtx({}, { signi: [SIGNI_P3000, SIGNI_P12000, null] }), effectivePowers: ep } as ExecCtx;
    const r = run({ type: 'BANISH', target: { type: 'SIGNI', owner: 'opponent', count: 1, filter: { cardType: 'シグニ', powerLtPrinted: true } } } as EffectAction, ctx);
    eq(tops(r.otherState)[0], null, 'P3000（実効1000<表記3000）が除去される');
    ok(tops(r.otherState)[1] !== null, 'P12000（実効=表記・低下していない）は残る');
  }
  // 高い＝増強中のみ対象：P3000を実効8000に増強→対象／P12000は実効=表記→非対象
  {
    const ep = new Map<string, number>([[SIGNI_P3000, 8000], [SIGNI_P12000, 12000]]);
    const ctx = { ...mkCtx({}, { signi: [SIGNI_P3000, SIGNI_P12000, null] }), effectivePowers: ep } as ExecCtx;
    const r = run({ type: 'BANISH', target: { type: 'SIGNI', owner: 'opponent', count: 1, filter: { cardType: 'シグニ', powerGtPrinted: true } } } as EffectAction, ctx);
    eq(tops(r.otherState)[0], null, 'P3000（実効8000>表記3000）が除去される');
    ok(tops(r.otherState)[1] !== null, 'P12000（実効=表記・増強していない）は残る');
  }
});
// ── 個別機構: 「その後、そのシグニより〔パワー/レベル〕の低い」= 直前に処理したシグニ(lastProcessedCards[0])基準 ──
// WXDi-P08-031（手札からシグニを場に出す→そのシグニよりパワーの低い敵をバニッシュ）/ WXK10-031（デッキ公開シグニ→より低いレベルの敵を手札へ）。
test('powerLtLastProcessed: 直前処理シグニ(P12000)未満のみ対象（敵P3000除去・P12000残存）', () => {
  const ctx = { ...mkCtx({}, { signi: [SIGNI_P3000, SIGNI_P12000, null] }), lastProcessedCards: [SIGNI_P12000] } as ExecCtx;
  const r = run({ type: 'BANISH', target: { type: 'SIGNI', owner: 'opponent', count: 1, filter: { cardType: 'シグニ', powerLtLastProcessed: true } } } as EffectAction, ctx);
  eq(tops(r.otherState)[0], null, 'P3000（<12000）が除去される');
  ok(tops(r.otherState)[1] !== null, '同値 P12000 は残る（より低い＝strict）');
});
test('powerLtLastProcessed: 参照不能（lastProcessed空）なら対象なし＝何も除去されない', () => {
  const ctx = { ...mkCtx({}, { signi: [SIGNI_P3000, SIGNI_P12000, null] }), lastProcessedCards: [] } as ExecCtx;
  const r = run({ type: 'BANISH', target: { type: 'SIGNI', owner: 'opponent', count: 1, filter: { cardType: 'シグニ', powerLtLastProcessed: true } } } as EffectAction, ctx);
  ok(tops(r.otherState)[0] !== null && tops(r.otherState)[1] !== null, '「そのシグニ」不在→到達不能 range で空ヒット（Lte の制限なしフォールバックと異なる）');
});
test('levelLtLastProcessed: 直前処理シグニ(L2)未満のみ対象（敵L1除去・L2残存）', () => {
  const ctx = { ...mkCtx({}, { signi: [SIGNI_L1, SIGNI_L2, null] }), lastProcessedCards: [SIGNI_L2] } as ExecCtx;
  const r = run({ type: 'BOUNCE', target: { type: 'SIGNI', owner: 'opponent', count: 1, filter: { cardType: 'シグニ', levelLtLastProcessed: true } } } as EffectAction, ctx);
  eq(tops(r.otherState)[0], null, 'L1（<2）が除去される');
  ok(tops(r.otherState)[1] !== null, '同値 L2 は残る');
});
// タスク12(xx)（続き137）: targetsTriggerSource の自動対象化は選択UIを経ないため、
// executeEffect が autoTargetedCards として対象シグニを surface し BattleScreen が ON_TARGETED を収集する。
test('targetsTriggerSource: 自動対象化した相手シグニを autoTargetedCards に surface（ON_TARGETED 収集用）', () => {
  const attacker = SIGNI_P3000; // 相手フィールドの「それ」
  const ctx = { ...mkCtx({}, { signi: [attacker, SIGNI_P12000, null] }), triggeringCardNum: attacker } as ExecCtx;
  const r = run({ type: 'POWER_MODIFY', target: { type: 'SIGNI', owner: 'opponent', count: 1 }, targetsTriggerSource: true, delta: -2000 } as EffectAction, ctx);
  ok((r.autoTargetedCards ?? []).includes(attacker), '自動対象化した attacker が autoTargetedCards に載る');
  ok(!(r.autoTargetedCards ?? []).includes(SIGNI_P12000), '対象化していない別シグニは載らない');
});
test('targetsLastProcessed: 自動対象化した相手シグニを autoTargetedCards に surface', () => {
  const tgt = SIGNI_P3000;
  const ctx = { ...mkCtx({}, { signi: [tgt, null, null] }), lastProcessedCards: [tgt] } as ExecCtx;
  const r = run({ type: 'POWER_MODIFY', target: { type: 'SIGNI', owner: 'opponent', count: 1 }, targetsLastProcessed: true, delta: 2000 } as EffectAction, ctx);
  ok((r.autoTargetedCards ?? []).includes(tgt), 'lastProcessed 由来の自動対象も surface される');
});
// タスク12(xix)（続き137）: LIMIT_ALL_FIELD_N（WX04-005-E3「すべてのプレイヤーはシグニを１体しか場に出せない」）は
// STUB executor の case ではなく継続効果として src/screens/battle/fieldLimit.ts に実装済み（続き126 Sonnet の「完全未実装」は
// STUB executor だけを見た誤診断）。挙動を golden で固定する。
test('LIMIT_ALL_FIELD: WX04-005（LIMIT_ALL_FIELD_1）を持つルリグで上限1・無ければ既定3', () => {
  const withLrig = { ...mkState({}), field: { ...mkState({}).field, lrig: ['WX04-005'] } } as PlayerState;
  const plain = mkState({});
  eq(computeFieldSigniLimit(withLrig, plain, effectsMap, getCardNumG), 1, '自ルリグが LIMIT_ALL_FIELD_1 → 上限1');
  eq(computeFieldSigniLimit(plain, withLrig, effectsMap, getCardNumG), 1, '相手ルリグが持っていても両者に適用（min）');
  eq(computeFieldSigniLimit(plain, plain, effectsMap, getCardNumG), 3, '誰も持たなければ既定3');
});
test('LIMIT_ALL_FIELD: reduceFieldSigniToLimit は上限超過分をレベル高い順に残しトラッシュへ', () => {
  const st = mkState({ signi: [SIGNI_L1, SIGNI_L2, SIGNI_L3] }); // L1/L2/L3 が3体
  const { state: after, trashed } = reduceFieldSigniToLimit(st, 1, cardMap as Map<string, CardData>);
  eq(tops(after)[2], SIGNI_L3, '最高レベル(L3)が残る');
  eq(tops(after)[0], null, 'L1 は除去'); eq(tops(after)[1], null, 'L2 は除去');
  eq(trashed.length, 2, '2体トラッシュ'); ok(after.trash.includes(SIGNI_L1) && after.trash.includes(SIGNI_L2), '除去分がトラッシュへ');
});
test('LIMIT_ALL_FIELD: 上限以内なら reduce は無変化', () => {
  const st = mkState({ signi: [SIGNI_L1, null, null] });
  const { state: after, trashed } = reduceFieldSigniToLimit(st, 1, cardMap as Map<string, CardData>);
  eq(trashed.length, 0, '超過なし＝トラッシュ0'); eq(tops(after)[0], SIGNI_L1, 'そのまま残る');
});
// タスク12(viii)（続き137・WX17-028-E1）: TRANSFER_TO_DECK{TRASH_CARD, optional} を強制せず選択/スキップ可能にし、
// スキップ（0体選択）時は後続「そうした場合」(CONDITIONAL IS_MY_TURN→GRANT) を stripDidItConditional で無効化する。
test('TRANSFER_TO_DECK optional: 選択UIを出す（強制しない）／スキップで「そうした場合」を無効化／選択で転送＋付与', () => {
  const src = SIGNI_L3;
  const trashSigni = [SIGNI_L1, SIGNI_L2];
  const base = mkCtx({ signi: [src, null, null] }, {}, src);
  const ctx = { ...base, ownerState: { ...base.ownerState, trash: [...trashSigni] } } as ExecCtx;
  const action = { type: 'SEQUENCE', steps: [
    { type: 'TRANSFER_TO_DECK', source: { type: 'TRASH_CARD', owner: 'self', count: 2, filter: { cardType: 'シグニ' } }, shuffle: true, optional: true },
    { type: 'CONDITIONAL', condition: { type: 'IS_MY_TURN' }, then: { type: 'GRANT_KEYWORD', target: { type: 'SIGNI', owner: 'self', count: 1, filter: { thisCardOnly: true } }, keyword: 'ダブルクラッシュ', duration: 'UNTIL_END_OF_TURN' } },
  ] } as EffectAction;
  const eff = { effectId: 't', effectType: 'AUTO', action, duration: 'INSTANT', mandatory: true } as CardEffect;
  const r0 = executeEffect(eff, ctx);
  ok(!r0.done, '強制せず中断（インタラクション）');
  const p0 = (r0 as { pending: { type: string; optional?: boolean } }).pending;
  ok(p0.type === 'SELECT_TARGET' && p0.optional === true, 'optional な SELECT_TARGET を出す');
  const rctx = { ...ctx, ownerState: r0.ownerState, otherState: r0.otherState, logs: r0.logs } as ExecCtx;
  // スキップ（0体）
  const rSkip = resumeSelectTarget([], p0 as never, rctx);
  ok(rSkip.done, 'skip 完了');
  eq((rSkip.ownerState.keyword_grants ?? {})[src]?.includes('ダブルクラッシュ') ?? false, false, 'skip 時はダブルクラッシュ非付与');
  ok(rSkip.ownerState.trash.includes(SIGNI_L1) && rSkip.ownerState.trash.includes(SIGNI_L2), 'skip 時は転送されずトラッシュに残る');
  // 選択（2体）
  const rDo = resumeSelectTarget(trashSigni, p0 as never, rctx);
  ok((rDo.ownerState.keyword_grants ?? {})[src]?.includes('ダブルクラッシュ'), 'do 時はダブルクラッシュ付与');
  ok(!rDo.ownerState.trash.includes(SIGNI_L1) && !rDo.ownerState.trash.includes(SIGNI_L2), 'do 時はトラッシュから抜ける');
  ok(rDo.ownerState.deck.includes(SIGNI_L1) && rDo.ownerState.deck.includes(SIGNI_L2), 'do 時はデッキへ');
});
// タスク12(viii)（続き137・WX16-070-E1）: LEVEL_MODIFY の thisCardOnly（効果元シグニ自身へ選択UIなしで適用）＋
// 「レベルを＋1か＋2してもよい」＝CHOOSE(choose_count:1/from_count:2/upTo:true) で値の選択＆スキップを表現。
test('LEVEL_MODIFY thisCardOnly: 効果元シグニ自身にのみレベル修正（他の味方には付与しない）', () => {
  const src = SIGNI_L1;
  const ctx = mkCtx({ signi: [src, SIGNI_L2, null] }, {}, src);
  const r = run({ type: 'LEVEL_MODIFY', target: { type: 'SIGNI', owner: 'self', count: 1, filter: { thisCardOnly: true } }, delta: 2, until: 'UNTIL_END_OF_TURN' } as EffectAction, ctx);
  const mods = r.ownerState.temp_level_mods ?? [];
  ok(mods.some(m => m.cardNum === src && m.delta === 2), 'source に +2');
  ok(!mods.some(m => m.cardNum === SIGNI_L2), '他の味方シグニには付与しない');
});
test('WX16-070-E1: レベル＋1か＋2の CHOOSE（plus2 で +2／upTo でスキップ可）', () => {
  const src = SIGNI_L1;
  const ctx = mkCtx({ signi: [src, null, null] }, {}, src);
  const action = { type: 'CHOOSE', choose_count: 1, from_count: 2, upTo: true, choices: [
    { choiceId: 'plus1', label: 'レベルを＋1する', action: { type: 'LEVEL_MODIFY', target: { type: 'SIGNI', owner: 'self', count: 1, filter: { thisCardOnly: true } }, delta: 1, until: 'UNTIL_END_OF_TURN' } },
    { choiceId: 'plus2', label: 'レベルを＋2する', action: { type: 'LEVEL_MODIFY', target: { type: 'SIGNI', owner: 'self', count: 1, filter: { thisCardOnly: true } }, delta: 2, until: 'UNTIL_END_OF_TURN' } },
  ] } as EffectAction;
  const eff = { effectId: 't', effectType: 'AUTO', action, duration: 'UNTIL_END_OF_TURN', mandatory: true } as CardEffect;
  const r0 = executeEffect(eff, ctx);
  ok(!r0.done && (r0 as { pending: { type: string } }).pending.type === 'CHOOSE', 'CHOOSE を出す');
  const p = (r0 as { pending: unknown }).pending;
  const rctx = { ...ctx, logs: r0.logs } as ExecCtx;
  const rDo = resumeChoose('plus2', p as never, rctx);
  ok((rDo.ownerState.temp_level_mods ?? []).some(m => m.cardNum === src && m.delta === 2), 'plus2 で source に +2');
  const rSkip = resumeChoose([], p as never, rctx);
  eq((rSkip.ownerState.temp_level_mods ?? []).length, 0, 'skip（0選択）でレベル修正なし');
});
// WXK10-031 E1 統合: デッキ公開(シグニがめくれるまで)→ 公開シグニ(L3)=lastProcessed・公開カードをトラッシュ → BOUNCE{levelLtLastProcessed}（敵L1手札へ・L4残存）
test('WXK10-031機構: DECK_REVEAL_UNTIL→公開カードトラッシュ→そのシグニ未満レベルの敵を手札へ', () => {
  const ctx = { ...mkCtx({ deckTop: [SIGNI_L3] }, { signi: [SIGNI_L4, SIGNI_L1, null] }), sourceCardNum: 'WXK10-031', triggeringCardNum: 'WXK10-031' } as ExecCtx;
  const oppHand0 = ctx.otherState.hand.length;
  const action = { type: 'SEQUENCE', steps: [
    { type: 'STUB', id: 'DECK_REVEAL_UNTIL' },
    { type: 'BOUNCE', target: { type: 'SIGNI', owner: 'opponent', count: 1, filter: { cardType: 'シグニ', levelLtLastProcessed: true }, upToCount: false } },
  ] } as unknown as EffectAction;
  const r = run(action, ctx);
  ok(r.ownerState.trash.includes(SIGNI_L3), '公開したシグニ(L3)がトラッシュに置かれる');
  ok(!r.ownerState.deck.includes(SIGNI_L3), '公開シグニはデッキから抜ける（消失しない）');
  eq(tops(r.otherState)[1], null, '敵L1（<L3）が手札に戻る（除去される）');
  ok(tops(r.otherState)[0] !== null, '敵L4（>L3・低くない）は残る');
  eq(r.otherState.hand.length, oppHand0 + 1, 'バウンスした敵シグニが相手の手札に加わる');
});
// WXK10-031-E1 実効果定義を任意コスト（OPTIONAL_COST→pay）経由で駆動＝resumeOptionalCost/resumeChoose が lastProcessedCards を継承することの回帰ガード
test('WXK10-031-E1（実定義・任意コスト経由）: pay→公開→BOUNCE で敵L1が手札へ', () => {
  const eff = (cardMap.get('WXK10-031') as unknown as { effects: CardEffect[] }).effects.find(e => e.effectId === 'WXK10-031-E1')!;
  ok(eff.parseStatus === 'MANUAL' && eff.action.type === 'SEQUENCE', 'MANUAL SEQUENCE 定義であること');
  const ctx = { ...mkCtx({ deckTop: [SIGNI_L3], energy: 3 }, { signi: [SIGNI_L4, SIGNI_L1, null] }), sourceCardNum: 'WXK10-031', triggeringCardNum: 'WXK10-031' } as ExecCtx;
  const r = run(eff.action as EffectAction, ctx);
  ok(r.ownerState.trash.includes(SIGNI_L3), '公開シグニ(L3)がトラッシュへ');
  eq(tops(r.otherState)[1], null, '敵L1（<L3）が手札に戻る');
  ok(tops(r.otherState)[0] !== null, '敵L4は残る');
});
// ── 続き44: 先頭「（この/その）シグニより…対象とし、…それを〈除去〉」designation の動的比較を後続ターゲットへ引き継ぐ ──
// 対象選択が STUB（TARGET_OPP_SIGNI_OPTIONAL_COLOR_COST 等）や別文（cost/条件）に分かれ、除去アクション文（「それを
// バニッシュする」等）に比較語が残らず全数脱落していた過剰効果群。基準を厳密に切る（この=自身/その=トリガー主語/その後=lastProcessed据置）。
test('designation 動的比較: この→powerLtSelf / その→powerLtTrigger / その後→据置（applyLeadingSelfComparison）', () => {
  const KEYS = ['powerLtSelf', 'powerGtSelf', 'levelLtSelf', 'levelGtSelf', 'powerLtTrigger', 'levelLtTrigger', 'levelGtTrigger'];
  const dynKeys = (id: string): string => {
    const found = new Set<string>();
    const walk = (a: unknown): void => {
      if (!a || typeof a !== 'object') return;
      const o = a as Record<string, unknown>;
      const tgt = o.target as { filter?: Record<string, unknown> } | undefined;
      if (tgt?.filter) for (const k of KEYS) if (k in tgt.filter) found.add(k);
      for (const v of Object.values(o)) { if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v === 'object') walk(v); }
    };
    (effectsMap.get(id) ?? []).forEach(e => walk(e));
    return [...found].sort().join(',');
  };
  eq(dynKeys('WXK05-059'), 'powerLtSelf', 'WXK05-059 この→powerLtSelf（BANISH・STUBコスト後）');
  eq(dynKeys('WXK09-052'), 'powerLtSelf', 'WXK09-052 この→powerLtSelf（SEND_TO_ENERGY 単文）');
  eq(dynKeys('WXK10-040'), 'powerLtSelf', 'WXK10-040 この→powerLtSelf（MANUAL保護カードの手パッチ）');
  eq(dynKeys('WXK07-030'), 'powerLtTrigger', 'WXK07-030 その＝アタッカー→powerLtTrigger');
  eq(dynKeys('WXK11-041'), 'powerLtTrigger', 'WXK11-041 その＝被バニッシュ→powerLtTrigger');
  eq(dynKeys('WXK10-031'), '', 'WXK10-031 その後＝公開カード(lastProcessed)は据置（別機構）');
  eq(dynKeys('WXDi-P08-031'), '', 'WXDi-P08-031 その後＝場に出したシグニ(lastProcessed)は据置（別機構）');
});
test('designation owner継承: 「対戦相手の…を対象とし…そうした場合、それを〈除去〉」の最終ターゲットが opponent＋フィルタ継承（applyLeadingOpponentDesignation・続き111）', () => {
  // 末尾（「それを…」）アクションの target/source を辿る（CONDITIONAL.then / SEQUENCE 末尾を降下）。
  const findFinal = (a: unknown): Record<string, unknown> | null => {
    if (!a || typeof a !== 'object') return null;
    const o = a as Record<string, unknown>;
    if (o.type === 'CONDITIONAL') return findFinal(o.then) ?? (o.then as Record<string, unknown>);
    if (o.type === 'SEQUENCE') { const st = o.steps as unknown[]; for (let i = st.length - 1; i >= 0; i--) { const f = findFinal(st[i]); if (f) return f; } return null; }
    return o;
  };
  const finalTgt = (id: string): { owner?: string; filter?: Record<string, unknown> } => {
    const fin = findFinal((effectsMap.get(id) ?? []).map(e => (e as { action: unknown }).action).find(a => a));
    return (fin?.target ?? fin?.source ?? {}) as { owner?: string; filter?: Record<string, unknown> };
  };
  // plain BOUNCE（旧: owner:self → opponent）
  eq(finalTgt('WX07-001').owner, 'opponent', 'WX07-001 それを手札に戻す＝対戦相手のシグニ（旧 self 誤り）');
  // TRANSFER_TO_DECK＋レベルフィルタ継承
  const k = finalTgt('PR-K043');
  eq(k.owner, 'opponent', 'PR-K043 それをデッキ下＝opponent');
  eq(JSON.stringify(k.filter?.level), JSON.stringify({ max: 3 }), 'PR-K043 レベル3以下フィルタ継承');
  // BOUNCE＋パワーフィルタ継承
  const p = finalTgt('WX24-P2-060');
  eq(p.owner, 'opponent', 'WX24-P2-060 それを手札に戻す＝opponent');
  eq(JSON.stringify(p.filter?.powerRange), JSON.stringify({ max: 5000 }), 'WX24-P2-060 パワー5000以下フィルタ継承');
  // TRASH（旧: owner:any → opponent）＝自シグニに当たらないこと
  eq(finalTgt('PR-322').owner, 'opponent', 'PR-322 それをトラッシュ＝any→opponent（自シグニを対象化しない）');
  // CHOOSE 内分岐でも owner:self/any が残らない（WXDi-P13-045・WX24-P2-048）
  const selfInCard = (id: string): number => {
    let n = 0; const walk = (a: unknown): void => { if (!a || typeof a !== 'object') return; const o = a as Record<string, unknown>;
      const t = (o.target ?? o.source) as { type?: string; owner?: string } | undefined;
      if (t?.type === 'SIGNI' && (t.owner === 'self' || t.owner === 'any')) n++;
      for (const v of Object.values(o)) { if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v === 'object') walk(v); } };
    (effectsMap.get(id) ?? []).forEach(e => walk((e as { action: unknown }).action)); return n; };
  eq(selfInCard('WXDi-P13-045'), 0, 'WXDi-P13-045 CHOOSE両分岐とも opponent（self/any 残存なし）');
  eq(selfInCard('WX24-P2-048'), 0, 'WX24-P2-048 CHOOSE分岐 opponent（self/any 残存なし）');
});
test('levelGtTrigger: トリガー元レベル超過のみ対象（trigger L1→L2除去・L1残存・WX24-P1-015）', () => {
  const ctx = mkCtx({}, { signi: [SIGNI_L1, SIGNI_L2, null] }, SIGNI_L1);
  const r = run({ type: 'BANISH', target: { type: 'SIGNI', owner: 'opponent', count: 1, filter: { cardType: 'シグニ', levelGtTrigger: true } } } as EffectAction, ctx);
  eq(tops(r.otherState)[1], null, 'L2（>1）が除去される');
  ok(tops(r.otherState)[0] !== null, '同値 L1 は残る');
});
test('REVEAL_AND_PICK remainder: 公開カードが消失しない（続き36 修正・deck+hand 保存）', () => {
  const ctx = mkCtx({ deckTop: [SIGNI, SIGNI_L2, SIGNI_P3000] }, {});
  const before = ctx.ownerState.deck.length + ctx.ownerState.hand.length;
  const r = run({ type: 'REVEAL_AND_PICK', owner: 'self', revealCount: 3, filter: { cardType: 'シグニ' }, pickCount: 1, then: { type: 'ADD_TO_HAND', owner: 'self' }, remainder: { location: 'deck', position: 'bottom' } } as unknown as EffectAction, ctx);
  eq(r.ownerState.deck.length + r.ownerState.hand.length, before, '公開カードの消失なし（旧実装は2枚ロスト）');
  eq(r.ownerState.hand.length, ctx.ownerState.hand.length + 1, 'ピック1枚が手札へ');
});
test('REVEAL_AND_PICK handOrField: 手札/場の選択肢を提示し消失なし', () => {
  const ctx = mkCtx({ deckTop: [SIGNI, SIGNI_L2, SIGNI_P3000] }, {});
  const before = ctx.ownerState.deck.length + ctx.ownerState.hand.length;
  // autopilot は最初の available 選択肢（手札に加える）を選ぶ。
  const r = run({ type: 'REVEAL_AND_PICK', owner: 'self', revealCount: 3, filter: { cardType: 'シグニ' }, pickCount: 1, handOrField: true, then: { type: 'ADD_TO_HAND', owner: 'self' }, remainder: { location: 'deck', position: 'bottom' } } as unknown as EffectAction, ctx);
  eq(r.ownerState.deck.length + r.ownerState.hand.length, before, 'handOrField でも消失なし');
  eq(r.ownerState.hand.length, ctx.ownerState.hand.length + 1, '手札選択でピック1枚が手札へ');
});
test('LOOK_PICK_CHAIN dual-pick: hand+field ステージで手札1・場1・消失なし（続き36）', () => {
  const ctx = mkCtx({ deckTop: [SIGNI, SIGNI_L2, SIGNI_P3000] }, {});
  const before = ctx.ownerState.deck.length + ctx.ownerState.hand.length;
  const r = run({ type: 'LOOK_PICK_CHAIN', owner: 'self', revealCount: 3, stages: [
    { filter: { cardType: 'シグニ' }, pickCount: 1, then: 'hand' },
    { filter: { cardType: 'シグニ' }, pickCount: 1, then: 'field' },
  ], remainder: { location: 'deck', position: 'bottom' } } as unknown as EffectAction, ctx);
  eq(r.ownerState.hand.length, ctx.ownerState.hand.length + 1, '1枚が手札へ');
  eq(r.ownerState.field.signi.filter(Boolean).length, 1, '1枚が場へ');
  eq(r.ownerState.deck.length + r.ownerState.hand.length + r.ownerState.field.signi.filter(Boolean).length, before, '公開カード消失なし（deck+hand+field 保存）');
});
test('dual-pick 構造固定（WX24-P1-017/WX25-P3-038 が LOOK_PICK_CHAIN[hand,field]・bare LOOK_AND_REORDER に戻っていない）', () => {
  for (const num of ['WX24-P1-017', 'WX25-P3-038']) {
    const s = JSON.stringify(effectsMap.get(num) ?? []);
    ok(s.includes('LOOK_PICK_CHAIN') && s.includes('"then":"hand"') && s.includes('"then":"field"'), `${num}: dual-pick LOOK_PICK_CHAIN[hand,field] のはず`);
  }
});
// look-pick（別文＋公開し＋filter）構造固定：「デッキの上からN枚見る。その中から＜C＞のシグニM枚を公開し
// 手札に加え、残りを好きな順番でデッキの一番下に置く」が、汎用 LOOK_AND_REORDER に pick（手札加え）を丸ごと
// 食われて単なるデッキ並べ替えに退化していた回帰ガード（40枚一括是正・census クラス指定/色/レベル look-pick）。
test('look-pick 構造固定（＜C＞のシグニ手札加えが bare LOOK_AND_REORDER に戻っていない＝REVEAL_AND_PICK+filter）', () => {
  // ＜C＞クラス filter（WX16-043=英知・WXDi-P01-047=悪魔・WXDi-P06-044=宇宙）
  for (const num of ['WX16-043', 'WXDi-P01-047', 'WXDi-P06-044']) {
    const s = JSON.stringify((effectsMap.get(num) ?? [])[0] ?? {});
    ok(s.includes('"REVEAL_AND_PICK"') && s.includes('"story"') && s.includes('"ADD_TO_HAND"') && !s.includes('"LOOK_AND_REORDER"'),
      `${num}-E1: REVEAL_AND_PICK{filter.story}+ADD_TO_HAND のはず（実際 ${s.slice(0, 140)}）`);
  }
  // 「N枚まで」上限＋色/レベル filter＋remainder bottom（WX26-CP1-100=プリオケupTo・WXDi-P02-051=level1）
  const s100 = JSON.stringify((effectsMap.get('WX26-CP1-100') ?? [])[0] ?? {});
  ok(s100.includes('"REVEAL_AND_PICK"') && s100.includes('"pickUpTo":true') && s100.includes('"position":"bottom"'), `WX26-CP1-100-E1: REVEAL_AND_PICK pickUpTo bottom のはず（実際 ${s100.slice(0, 140)}）`);
});
test('look-pick 名前filter（カード名に《盾》を含むシグニ1枚を手札・残りデッキ上）', () => {
  const parsed = parseCardEffects(cardMap.get('WX19-049')!);
  const act = parsed.find(e => e.effectId === 'WX19-049-E1')?.action as import('../src/types/effects').RevealAndPickAction;
  eq(act?.type, 'REVEAL_AND_PICK', 'pick が LOOK_AND_REORDER に縮退');
  eq(`${act?.revealCount}/${act?.pickCount}/${act?.filter?.cardType}/${act?.filter?.cardName}/${act?.remainder?.position}`,
    '2/1/シグニ/盾/top', '公開2枚・カード名に《盾》を含むシグニ1枚・残りデッキ上');
});
test('look-pick 名前filter・読点連結（PR-370-E2: 《槍》シグニ1枚を手札・残りシャッフルしてデッキ下）', () => {
  const parsed = parseCardEffects(cardMap.get('PR-370')!);
  const act = parsed.find(e => e.effectId === 'PR-370-E2')?.action as import('../src/types/effects').RevealAndPickAction;
  eq(act?.type, 'REVEAL_AND_PICK', '公開し、その中から…の pick が LOOK_AND_REORDER に縮退');
  eq(`${act?.revealCount}/${act?.pickCount}/${act?.filter?.cardType}/${act?.filter?.cardName}/${act?.remainder?.location}/${act?.remainder?.position}`,
    '4/1/シグニ/槍/deck/bottom', '公開4枚・カード名に《槍》を含むシグニ1枚・残りデッキ下');
});
test('look-pick 名前filter・全件カード（WX12-019-E1: 《フレイスロ》を含むすべてのカードを手札・残りトラッシュ）', () => {
  const parsed = parseCardEffects(cardMap.get('WX12-019')!);
  const act = parsed.find(e => e.effectId === 'WX12-019-E1')?.action as import('../src/types/effects').RevealAndPickAction;
  eq(act?.type, 'REVEAL_AND_PICK', '名前 filter の全件 pick');
  eq(`${act?.revealCount}/${act?.pickCount}/${act?.pickNoun}/${act?.filter?.cardType ?? 'ANY'}/${act?.filter?.cardName}/${act?.remainder?.location}/${act?.remainder?.position}`,
    '2/ALL/カード/ANY/フレイスロ/trash/any', '公開2枚・カード種別無限定・該当全件・残りトラッシュ');
});
// GRANT_TO_PLACED_SIGNI（続き41）：「この方法で場に出たシグニは【K】を得る/のパワーを＋N」を targetsLastProcessed で
// 場出しシグニ(lastProcessedCards)へ付与する。engine 機構は既存だが本ラウンドで parser を実装して STUB を実アクション化。
test('GRANT_TO_PLACED_SIGNI(A): GRANT_KEYWORD targetsLastProcessed が場出しシグニ(lastProcessed)へ アサシン付与（WX25-P1-044/P2-039）', () => {
  const placed = SIGNI;
  const ctx = { ...mkCtx({ signi: [placed, null, null] }, {}, placed), lastProcessedCards: [placed] } as ExecCtx;
  const r = run({ type: 'GRANT_KEYWORD', target: { type: 'SIGNI', owner: 'self', count: 'ALL' }, keyword: 'アサシン', duration: 'UNTIL_END_OF_TURN', targetsLastProcessed: true } as EffectAction, ctx);
  const g = (r.ownerState.keyword_grants ?? {})[placed] ?? [];
  ok(g.includes('アサシン'), `keyword_grants[placed]=${JSON.stringify(g)}`);
});
test('GRANT_TO_PLACED_SIGNI(B): POWER_MODIFY targetsLastProcessed が場出しシグニへ +3000（次相手ターン終了時まで＝power_mods_until_opp_turn・WX24-P3-037）', () => {
  const placed = SIGNI;
  const ctx = { ...mkCtx({ signi: [placed, null, null] }, {}, placed), lastProcessedCards: [placed] } as ExecCtx;
  const r = run({ type: 'POWER_MODIFY', target: { type: 'SIGNI', owner: 'self', count: 'ALL', filter: { cardType: 'シグニ' } }, delta: 3000, duration: 'UNTIL_OPP_TURN_END', targetsLastProcessed: true } as EffectAction, ctx);
  const mods = r.ownerState.power_mods_until_opp_turn ?? [];
  ok(mods.some(m => m.cardNum === placed && m.delta === 3000), `power_mods_until_opp_turn=${JSON.stringify(mods)}`);
  eq((r.ownerState.temp_power_mods ?? []).length, 0, 'UNTIL_OPP_TURN_END は temp_power_mods に入れない');
});
test('GRANT_TO_PLACED_SIGNI 構造固定（P1-044/P2-039=GRANT_KEYWORD アサシン・P3-037=POWER_MODIFY・いずれも targetsLastProcessed で STUB に戻っていない）', () => {
  for (const num of ['WX25-P1-044', 'WX25-P2-039']) {
    const s = JSON.stringify(effectsMap.get(num) ?? []);
    ok(s.includes('"GRANT_KEYWORD"') && s.includes('"targetsLastProcessed":true') && s.includes('アサシン') && !s.includes('GRANT_TO_PLACED_SIGNI'), `${num}: GRANT_KEYWORD targetsLastProcessed アサシン のはず`);
  }
  const s2 = JSON.stringify(effectsMap.get('WX24-P3-037') ?? []);
  ok(s2.includes('"POWER_MODIFY"') && s2.includes('"targetsLastProcessed":true') && s2.includes('"UNTIL_OPP_TURN_END"') && !s2.includes('GRANT_TO_PLACED_SIGNI'), 'WX24-P3-037: POWER_MODIFY targetsLastProcessed UNTIL_OPP_TURN_END のはず');
  const s3 = JSON.stringify(effectsMap.get('WX24-P3-039') ?? []);
  ok(s3.includes('"MILL"') && s3.includes('"countIsLastProcessedLevelSum":true') && !s3.includes('GRANT_TO_PLACED_SIGNI'), 'WX24-P3-039: MILL countIsLastProcessedLevelSum のはず');
});
// アップ状態フィルタ（続き110）：「対戦相手のアップ状態のシグニ１体を対象とし、ターン終了時まで、それのパワーを－15000する」
// （BURST 21枚）が parseSentencePart1 のパワー修整対象分岐で「アップ状態の」接頭辞を許容せず
// default {owner:'any', filter無し} に落ちていた＝owner脱落＋isUp脱落の過剰効果の回帰ガード。
// WX24-D5-25＝fresh採用17枚の代表・WXDi-D06-021＝手修正温存カードへの effectId 外科パッチ4枚の代表。
test('アップ状態フィルタ 構造固定（対戦相手のアップ状態のシグニ−15000 BURST が owner:any/フィルタ無しに戻っていない）', () => {
  for (const num of ['WX24-D5-25', 'WXDi-D06-021']) {
    const effs = (effectsMap.get(num) ?? []) as { effectId?: string }[];
    const b = effs.find(e => String(e.effectId).endsWith('-BURST'));
    const s = JSON.stringify(b ?? {});
    ok(s.includes('"isUp":true') && s.includes('"owner":"opponent"'), `${num}-BURST: owner:opponent + isUp:true のはず（実際 ${s.slice(0, 160)}）`);
  }
});
// ON_SIGNI_BANISH_OPPONENT（「…がバトルによって…をバニッシュしたとき」＝バトル勝利トリガー・続き75）。
// engine（BattleScreen の battleBanishEntries）は元から配線済みだったが parser がこの語彙を持たず、
// 31枚が ON_PLAY（「場に出たとき」）へ誤フォールバックしていた＝実質「召喚しただけで発火する」幻覚の回帰ガード。
test('ON_SIGNI_BANISH_OPPONENT 構造固定（バトル勝利トリガーが ON_PLAY に化けていない・scope も原文どおり）', () => {
  // 「このシグニがバトルによって対戦相手のシグニ1体をバニッシュしたとき、【エナチャージ1】」＝self
  const e1 = (effectsMap.get('WXDi-P05-070') ?? []).find(e => e.timing?.includes('ON_SIGNI_BANISH_OPPONENT'));
  ok(!!e1, 'WXDi-P05-070: ON_SIGNI_BANISH_OPPONENT のはず（ON_PLAY ではない）');
  eq(e1?.triggerScope ?? 'self', 'self', 'WXDi-P05-070: scope=self（このシグニが）');
  ok(!JSON.stringify(e1).includes('ON_PLAY'), 'WXDi-P05-070: ON_PLAY へ戻っていない');
  // 「あなたの＜水獣＞のシグニがバトルによって…バニッシュしたとき」＝any_ally + triggerFilter{story:水獣}
  const e2 = (effectsMap.get('WXEX2-40') ?? []).find(e => e.timing?.includes('ON_SIGNI_BANISH_OPPONENT'));
  ok(!!e2, 'WXEX2-40: ON_SIGNI_BANISH_OPPONENT のはず');
  eq(e2?.triggerScope, 'any_ally', 'WXEX2-40: scope=any_ally（あなたの＜水獣＞のシグニが）');
  eq(e2?.triggerFilter?.story, '水獣', 'WXEX2-40: triggerFilter.story=水獣');
  // 「バトルによって」が明記されない表記も同じ timing（効果バニッシュは必ず「効果によって」と明記されるため）。
  const e3 = (effectsMap.get('WX10-048') ?? []).find(e => e.timing?.includes('ON_SIGNI_BANISH_OPPONENT'));
  ok(!!e3, 'WX10-048（「このシグニが対戦相手のシグニ1体をバニッシュしたとき」）: ON_SIGNI_BANISH_OPPONENT のはず');
  eq(e3?.triggerScope ?? 'self', 'self', 'WX10-048: scope=self');
});
// ON_MAIN_PHASE_START（「あなた/対戦相手のメインフェイズ開始時」・§3 Opusタスク16 の最大クラスタ29件）。
// engine（collectTurnTriggers・GROW→MAIN 移行）は元から配線済みで parser に語彙が無いだけだった＝
// ON_PLAY（「場に出たとき」）へ誤フォールバックしていた回帰ガード。
test('ON_MAIN_PHASE_START 構造固定（メインフェイズ開始時が ON_PLAY に化けていない・scope も原文どおり）', () => {
  const e1 = (effectsMap.get('WX12-031') ?? []).find(e => e.timing?.includes('ON_MAIN_PHASE_START'));
  ok(!!e1, 'WX12-031（「あなたのメインフェイズ開始時」）: ON_MAIN_PHASE_START のはず（ON_PLAY ではない）');
  eq(e1?.triggerScope ?? 'self', 'self', 'WX12-031: scope=self（あなたの）');
});
// ON_SPELL_USE（「（あなた/対戦相手）が[色の]スペルを使用したとき」・§3 Opusタスク16）。engine はスペル解決時に
// 使用者の場を走査（色フィルタ・usageLimit 対応）＝配線済みで、parser に語彙が無く ON_PLAY へ化けていた回帰ガード。
test('ON_SPELL_USE 構造固定（スペル使用時が ON_PLAY に化けていない・色フィルタも原文どおり）', () => {
  const e1 = (effectsMap.get('WX10-030') ?? []).find(e => e.timing?.includes('ON_SPELL_USE'));
  ok(!!e1, 'WX10-030: ON_SPELL_USE のはず（ON_PLAY ではない）');
  // 「あなたが緑のスペルを使用したとき」＝triggerFilter.color で使用スペルの色を絞る（WXK11-024＝緑）
  const e2 = (effectsMap.get('WXK11-024') ?? []).find(e => e.timing?.includes('ON_SPELL_USE'));
  eq(e2?.triggerFilter?.color, '緑', 'WXK11-024: triggerFilter.color=緑');
});
// ON_EXCEED_COST / ON_RISE（§3 Opusタスク16）。どちらも engine 配線済みで parser に語彙が無く ON_PLAY へ化けていた。
test('ON_EXCEED_COST / ON_RISE 構造固定（ON_PLAY に化けていない）', () => {
  const ec = (effectsMap.get('WXK03-005') ?? []).find(e => e.timing?.includes('ON_EXCEED_COST'));
  ok(!!ec, 'WXK03-005（「エクシードのコストとしてルリグトラッシュに置かれたとき」）: ON_EXCEED_COST のはず');
  const ri = (effectsMap.get('WX15-043') ?? []).find(e => e.timing?.includes('ON_RISE'));
  ok(!!ri, 'WX15-043（「このシグニがライズされたとき」）: ON_RISE のはず');
});
// ON_SIGNI_BECOMES_DRIVE / ON_BECOME_BEAT / ON_ARTS_USE（§3 Opusタスク16）。3つとも engine 配線済みで
// parser に語彙が無く ON_PLAY へ化けていた回帰ガード。⚠ON_ARTS_USE は engine が使用者(self)側しか収集しない。
test('ON_SIGNI_BECOMES_DRIVE / ON_BECOME_BEAT / ON_ARTS_USE 構造固定（ON_PLAY に化けていない）', () => {
  const dr = (effectsMap.get('WX22-020') ?? []).find(e => e.timing?.includes('ON_SIGNI_BECOMES_DRIVE'));
  ok(!!dr, 'WX22-020（「ドライブ状態になったとき」）: ON_SIGNI_BECOMES_DRIVE のはず');
  const ar = (effectsMap.get('WXK03-042') ?? []).find(e => e.timing?.includes('ON_ARTS_USE'));
  ok(!!ar, 'WXK03-042（「あなたがアーツを使用したとき」）: ON_ARTS_USE のはず');
  // ON_BECOME_BEAT の該当カードは全て MANUAL（curated が既に正しい timing を保持）＝parser 追加分の採用は無いが、
  // 語彙が消えていない（＝MANUAL が巻き戻っていない）ことを固定する。
  const bt = (effectsMap.get('WXK08-045') ?? []).find(e => e.timing?.includes('ON_BECOME_BEAT'));
  ok(!!bt, 'WXK08-045（「このカードが【ビート】になったとき」）: ON_BECOME_BEAT のはず');
});
// ON_TRASH の「手札から」単独（11件）。既存 regex は「手札か**デッキ**から」しか拾えず ON_PLAY へ化けていた。
// engine は triggerCondition.fromZones で領域を判定する（collectAnyZoneTrashSelfTriggers）＝fromZones もセットで固定。
test('ON_TRASH「手札から」単独 構造固定（ON_PLAY に化けていない・fromZones=hand）', () => {
  const e = (effectsMap.get('WX15-036') ?? []).find(x => x.timing?.includes('ON_TRASH'));
  ok(!!e, 'WX15-036（「このカードが手札からトラッシュに置かれたとき」）: ON_TRASH のはず');
  eq(JSON.stringify(e?.triggerCondition?.fromZones), '["hand"]', 'WX15-036: fromZones=["hand"]');
});
// ON_HAND_DISCARDED（「（ガードステップ以外で）あなたが手札を捨てたとき」）。engine 配線済みで、
// 「ガードステップ以外で」は engine 側が構造的に担保する（ガードの手札捨てでは hand_discarded_just が立たない）。
test('ON_HAND_DISCARDED 構造固定（手札捨て時が ON_PLAY に化けていない）', () => {
  const e = (effectsMap.get('WXK09-069') ?? []).find(x => x.timing?.includes('ON_HAND_DISCARDED'));
  ok(!!e, 'WXK09-069（「あなたが手札を捨てたとき」）: ON_HAND_DISCARDED のはず');
});
// 引用付与の内側 parse（§3 Opusタスク1・続き75）：「この方法で場に出たシグニは「【自】…」を得る」＝
// GRANT_EFFECT{targetsLastProcessed} の rawText を parseBlock が内側 CardEffect へ展開する。
// 内側の timing／自己参照／「アップし、」複合文が正しく解けていることを固定する（従来は STUB で engine no-op）。
test('引用付与の内側 parse（WX24-P1-017）：GRANT_EFFECT targetsLastProcessed＋内側 AUTO が原文どおり', () => {
  const effs = effectsMap.get('WX24-P1-017') ?? [];
  const s = JSON.stringify(effs);
  ok(!s.includes('GRANT_TO_PLACED_SIGNI'), 'STUB GRANT_TO_PLACED_SIGNI に戻っていない');
  const seq = effs[0]?.action as { steps?: EffectAction[] };
  const ge = (seq.steps ?? []).find(x => x.type === 'GRANT_EFFECT') as { effect?: CardEffect; targetsLastProcessed?: boolean } | undefined;
  ok(!!ge, 'GRANT_EFFECT ステップがある');
  eq(ge?.targetsLastProcessed, true, 'targetsLastProcessed（この方法で場に出たシグニ）');
  const inner = ge?.effect;
  ok(!!inner, '内側 ability が展開されている（rawText のままではない）');
  ok(!!inner?.timing?.includes('ON_SIGNI_BANISH_OPPONENT'), `内側 timing=ON_SIGNI_BANISH_OPPONENT got=${JSON.stringify(inner?.timing)}`);
  const ia = JSON.stringify(inner?.action);
  ok(ia.includes('"UP"'), `内側に UP（このシグニをアップし）が含まれる got=${ia}`);
  ok(ia.includes('"REMOVE_ABILITIES"') && ia.includes('"UNTIL_END_OF_TURN"'), `内側 REMOVE_ABILITIES は UNTIL_END_OF_TURN got=${ia}`);
});
test('GRANT_TO_PLACED_SIGNI(C): MILL countIsLastProcessedLevelSum が場出しシグニのレベル合計だけ相手デッキをミル（WX24-P3-039）', () => {
  const ctx = { ...mkCtx({}, { deckTop: [SIGNI, SIGNI, SIGNI, SIGNI] }), lastProcessedCards: [SIGNI_L2] } as ExecCtx; // レベル2
  const beforeDeck = ctx.otherState.deck.length, beforeTrash = ctx.otherState.trash.length;
  const r = run({ type: 'MILL', owner: 'opponent', count: 0, countIsLastProcessedLevelSum: true } as EffectAction, ctx);
  eq(r.otherState.deck.length, beforeDeck - 2, 'レベル2分=2枚デッキ減');
  eq(r.otherState.trash.length, beforeTrash + 2, '相手トラッシュ+2');
});
test('EXILE 相手シグニ1: 場から消去(トラッシュ/エナに行かない=ゲーム除外)', () => {
  const ctx = mkCtx({}, { signi: [SIGNI, null, null] });
  const before = ctx.otherState.trash.length + ctx.otherState.energy.length;
  const r = run({ type: 'EXILE', target: { type: 'SIGNI', owner: 'opponent', count: 1, filter: { cardType: 'シグニ' } } } as EffectAction, ctx);
  eq(tops(r.otherState)[0], null, 'signi[0] 除去');
  eq(r.otherState.trash.length + r.otherState.energy.length, before, 'トラッシュ/エナに行かない');
});
test('EXILE 自シグニ thisCardOnly: 自場から消去', () => {
  const ctx = mkCtx({ signi: [SIGNI, null, null] }, {}, SIGNI);
  const r = run({ type: 'EXILE', target: { type: 'SIGNI', owner: 'self', count: 1, filter: { thisCardOnly: true } } } as EffectAction, ctx);
  eq(tops(r.ownerState)[0], null, '自signi[0] 除去');
});
test('DOWN 相手シグニ: ダウン状態', () => {
  const ctx = mkCtx({}, { signi: [SIGNI, null, null] });
  const r = run({ type: 'DOWN', target: { type: 'SIGNI', owner: 'opponent', count: 1, filter: { cardType: 'シグニ' } } } as EffectAction, ctx);
  eq(r.otherState.field.signi_down?.[0], true, 'down[0]');
});
test('UP 自シグニ: ダウン解除', () => {
  const ctx = mkCtx({ signi: [SIGNI, null, null], down: [true, false, false] }, {});
  const r = run({ type: 'UP', target: { type: 'SIGNI', owner: 'self', count: 1 } } as EffectAction, ctx);
  eq(r.ownerState.field.signi_down?.[0], false, 'up[0]');
});
test('FREEZE 相手シグニ: 凍結', () => {
  const ctx = mkCtx({}, { signi: [SIGNI_P3000, null, null] });
  const r = run({ type: 'FREEZE', target: { type: 'SIGNI', owner: 'opponent', count: 1, upToCount: false, filter: { cardType: 'シグニ' } } } as EffectAction, ctx);
  eq(r.otherState.field.signi_frozen?.[0], true, 'frozen[0]');
});
test('POWER_MODIFY 相手-3000: temp_power_mods に記録', () => {
  const ctx = mkCtx({}, { signi: [SIGNI, null, null] });
  const r = run({ type: 'POWER_MODIFY', target: { type: 'SIGNI', owner: 'opponent', count: 1, upToCount: false, filter: { cardType: 'シグニ' } }, delta: -3000 } as EffectAction, ctx);
  const mods = (r.otherState as PlayerState).temp_power_mods ?? [];
  ok(mods.some(m => m.delta === -3000), `temp_power_mods に-3000 (${JSON.stringify(mods)})`);
});
test('LIFE_CRASH 相手1: ライフ-1', () => {
  const ctx = mkCtx({}, { life: 7 });
  const r = run({ type: 'LIFE_CRASH', owner: 'opponent', count: 1 } as EffectAction, ctx);
  eq(r.otherState.life_cloth.length, 6, 'life-1');
});
test('GAIN_COIN 自分1: coins+1', () => {
  const ctx = mkCtx({ coins: 3 }, {});
  const r = run({ type: 'GAIN_COIN', owner: 'self', count: 1 } as EffectAction, ctx);
  eq(r.ownerState.coins, 4, 'coins');
});
test('GRANT_KEYWORD 自シグニ アサシン: keyword_grants', () => {
  const src = SIGNI;
  const ctx = mkCtx({ signi: [src, null, null] }, {}, src);
  const r = run({ type: 'GRANT_KEYWORD', target: { type: 'SIGNI', owner: 'self', count: 1, filter: { thisCardOnly: true } }, keyword: 'アサシン', duration: 'UNTIL_END_OF_TURN' } as EffectAction, ctx);
  const g = (r.ownerState.keyword_grants ?? {})[src] ?? [];
  ok(g.includes('アサシン'), `keyword_grants[src]=${JSON.stringify(g)}`);
});
test('TRANSFER_TO_HAND トラッシュから1: トラッシュ-1 手札+1', () => {
  const ctx = mkCtx({ trash: 3, hand: 5 }, {});
  const r = run({ type: 'TRANSFER_TO_HAND', source: { type: 'TRASH_CARD', owner: 'self', count: 1, filter: { cardType: 'シグニ' } } } as EffectAction, ctx);
  eq(r.ownerState.hand.length, 6, '手札+1'); eq(r.ownerState.trash.length, 2, 'トラッシュ-1');
});
test('SEARCH デッキからシグニ1→手札', () => {
  const ctx = mkCtx({ hand: 5 }, {});
  const r = run({ type: 'SEARCH', from: { location: 'deck', owner: 'self' }, filter: { cardType: 'シグニ' }, maxCount: 1, then: { type: 'ADD_TO_HAND', owner: 'self' }, afterAction: { type: 'SHUFFLE_DECK', owner: 'self' } } as unknown as EffectAction, ctx);
  eq(r.ownerState.hand.length, 6, '手札+1');
});

// ── 新機構（B2/B3）＝実機検証できないものを自動で正しさ確認 ──
test('B2 REVEAL_DECK_TOP: レベル合計と公開枚数を記録', () => {
  const ctx = mkCtx({ deckTop: [SIGNI_L1, SIGNI_L2] }, {});
  const r = run({ type: 'REVEAL_DECK_TOP', owner: 'self', count: 2 } as EffectAction, ctx);
  eq(r.ownerState.last_revealed_deck_cards?.length, 2, '公開2枚');
  eq(r.ownerState.last_revealed_signi_level_sum, 3, 'Lv合計=1+2');
});
test('B2 TRASH_REVEALED: 公開カードをデッキ→トラッシュ', () => {
  const ctx = mkCtx({ deckTop: [SIGNI_L1, SIGNI_L2], trash: 3 }, {});
  let r = run({ type: 'REVEAL_DECK_TOP', owner: 'self', count: 2 } as EffectAction, { ...ctx });
  const ctx2 = { ...ctx, ownerState: r.ownerState, otherState: r.otherState } as ExecCtx;
  r = run({ type: 'TRASH_REVEALED', owner: 'self' } as EffectAction, ctx2);
  eq(r.ownerState.trash.length, 5, 'トラッシュ+2'); ok(!r.ownerState.last_revealed_deck_cards, 'クリア');
});
test('B2 動的閾値: 公開Lv合計×1000以下のみ対象', () => {
  // deckTop Lv1+Lv2=3 → 閾値3000。相手にP3000とP12000 → P3000のみバニッシュ可
  const ctx = mkCtx({ deckTop: [SIGNI_L1, SIGNI_L2] }, { signi: [SIGNI_P3000, SIGNI_P12000, null] });
  let r = run({ type: 'REVEAL_DECK_TOP', owner: 'self', count: 2 } as EffectAction, ctx);
  const ctx2 = { ...ctx, ownerState: r.ownerState, otherState: r.otherState } as ExecCtx;
  r = run({ type: 'BANISH', target: { type: 'SIGNI', owner: 'opponent', count: 1, upToCount: false, filter: { cardType: 'シグニ', powerLteRevealedSigniLevelSum: 1000 } } } as EffectAction, ctx2);
  eq(tops(r.otherState)[0], null, 'P3000除去'); eq(tops(r.otherState)[1], SIGNI_P12000, 'P12000残存');
});
test('B3 INSTALL_DELAYED_TRIGGER: delayed_triggers に追加', () => {
  const ctx = mkCtx({}, {});
  const r = run({ type: 'INSTALL_DELAYED_TRIGGER', duration: 'THIS_TURN', trigger: { timing: 'ON_OPP_LIFE_CRASHED', crasherFilter: { cardType: 'シグニ', color: '青' } }, effect: { type: 'TRASH', target: { type: 'HAND_CARD', owner: 'opponent', count: 1 } } } as EffectAction, ctx);
  eq(r.ownerState.delayed_triggers?.length, 1, 'delayed_triggers+1');
});

// ══════════════ C1 トリガー収集（BattleScreen 配線の pure 抽出・triggerCollect.ts）══════════════
// Stage2: collect*Triggers を pure 化したことで、従来「実機未検証(C2)」だった C1 発火条件を
// ヘッドレスで自動検証できる。HOST/GUEST の2プレイヤー＋場にカードを置いて発火有無を assert する。
const HOST = 'H', GUEST = 'G';
const trigCtx = (activeUserId: string | null, meId?: string): TrigCtx => ({
  hostId: HOST, guestId: GUEST, meId, activeUserId, turnPhase: 'MAIN',
  effectsMap, cardMap: cardMap as Map<string, CardData>, genId: () => 'tid',
});
// collectTurnTriggers は {entries, usedHostIds, usedGuestIds} を返す（続き119でusageLimit配線）。
// 既存テストは entries だけ見るのでこのヘルパーで .entries を取り出す。
const cttEntries = (
  ctx: TrigCtx,
  timing: 'ON_TURN_START' | 'ON_TURN_END' | 'ON_ATTACK_PHASE_START' | 'ON_MAIN_PHASE_START' | 'ON_LRIG_ATTACK_STEP_START',
  my: PlayerState, op: PlayerState,
) => collectTurnTriggers(ctx, timing, my, op).entries;
// 続き135（Opusタスク12(x)/(vi-5)）で collectFieldTriggers/collectBloomTriggers/collectBanishTriggers/
// collectPowerZeroTriggers/collectLrigGrowTriggers も {entries, usedHostIds, usedGuestIds} を返すよう統一した
// （usageLimit の消費を呼び出し元が actions_done へ書き戻す）。既存テストは entries だけ見るのでここで剥がす。
const cftEntries = (...a: Parameters<typeof collectFieldTriggers>) => collectFieldTriggers(...a).entries;
const cblEntries = (...a: Parameters<typeof collectBloomTriggers>) => collectBloomTriggers(...a).entries;
const cbtEntries = (...a: Parameters<typeof collectBanishTriggers>) => collectBanishTriggers(...a).entries;
const cpzEntries = (...a: Parameters<typeof collectPowerZeroTriggers>) => collectPowerZeroTriggers(...a).entries;
const clgEntries = (...a: Parameters<typeof collectLrigGrowTriggers>) => collectLrigGrowTriggers(...a).entries;

test('C1 ON_TARGETED: self-scope 対象シグニ自身が発火（相手ターン）', () => {
  const host = mkState({}); const guest = mkState({ signi: ['WXDi-P11-040', null, null] });
  // host のターン中に guest のシグニが対象に取られた＝guest 視点で相手ターン（turnOwner:opponent 成立）
  const e = collectTargetedTriggers(trigCtx(HOST), ['WXDi-P11-040'], GUEST, host, guest).entries;
  eq(e.length, 1, 'entries'); eq(e[0].effectId, 'WXDi-P11-040-E2', 'effectId'); eq(e[0].playerId, GUEST, 'player');
});
test('C1 ON_TARGETED: turnOwner:opponent ゲート（自ターンは非発火）', () => {
  const host = mkState({}); const guest = mkState({ signi: ['WXDi-P11-040', null, null] });
  // guest 自身のターンでは turnOwner:opponent を満たさず非発火
  eq(collectTargetedTriggers(trigCtx(GUEST), ['WXDi-P11-040'], GUEST, host, guest).entries.length, 0, '自ターン非発火');
});
test('C1 ON_TARGETED: 対象でないシグニは非発火', () => {
  const host = mkState({}); const guest = mkState({ signi: ['WXDi-P11-040', null, null] });
  eq(collectTargetedTriggers(trigCtx(HOST), [SIGNI], GUEST, host, guest).entries.length, 0, '別カード対象');
});
test('C1 ON_TARGETED: usageLimit《ターン1回》は消費IDを返し2回目は非発火（続き74発見・続き75修正）', () => {
  const host = mkState({}); const guest = mkState({ signi: ['WXDi-P11-040', null, null] });
  // 1回目＝発火し、消費した effectId を usedGuestIds で返す（呼び出し元が actions_done へ書き戻す）
  const r1 = collectTargetedTriggers(trigCtx(HOST), ['WXDi-P11-040'], GUEST, host, guest);
  eq(r1.entries.length, 1, '1回目発火');
  eq(r1.usedGuestIds.includes('WXDi-P11-040-E2'), true, '消費IDを返す');
  eq(r1.usedHostIds.length, 0, 'host側は消費なし');
  // 2回目＝actions_done に書き戻された後は同一ターン内で再発火しない
  const guest2 = { ...mkState({ signi: ['WXDi-P11-040', null, null] }), actions_done: r1.usedGuestIds };
  eq(collectTargetedTriggers(trigCtx(HOST), ['WXDi-P11-040'], GUEST, host, guest2).entries.length, 0, '2回目非発火');
});
test('C1 ON_LRIG_GROW: any_opp 相手グロウで発火（watcher のターン中＝turnOwner:self 成立）', () => {
  const host = mkState({}); const guest = mkState({ signi: ['WXDi-P13-047', null, null] });
  // WXDi-P13-047-E2 は「あなたのターンの間、対戦相手のルリグがグロウしたとき」＝watcher(GUEST) のターン中に
  // 相手(HOST)がグロウしたときのみ成立する。activeUser=GUEST・grownOwner=HOST。
  const e = clgEntries(trigCtx(GUEST), HOST, host, guest);
  eq(e.length, 1, 'entries'); eq(e[0].effectId, 'WXDi-P13-047-E2', 'effectId'); eq(e[0].playerId, GUEST, 'player');
});
test('C1 ON_LRIG_GROW: turnOwner:self ゲート（相手ターン中の相手グロウでは非発火）＝続き73発見・続き75修正', () => {
  const host = mkState({}); const guest = mkState({ signi: ['WXDi-P13-047', null, null] });
  // HOST のターン中に HOST がグロウ＝watcher(GUEST) 視点で「あなたのターン」ではない → 原文どおり非発火。
  // 従来は triggerCondition.turnOwner が JSON に無く、相手が自分のターンに通常グロウするだけで毎回誤発火していた。
  eq(clgEntries(trigCtx(HOST), HOST, host, guest).length, 0, 'turnOwner:self ゲート');
});
test('C1 ON_LRIG_GROW: any_opp は自分グロウでは非発火', () => {
  const host = mkState({}); const guest = mkState({ signi: ['WXDi-P13-047', null, null] });
  // grownOwner=GUEST（guest 自身がグロウ）→ any_opp は反応しない
  eq(clgEntries(trigCtx(GUEST), GUEST, guest, host).length, 0, '自グロウ非発火');
});
test('C1 ON_COIN_PAID: self 支払者の場シグニが発火', () => {
  const host = mkState({ signi: ['WXDi-P15-055', null, null] }); const guest = mkState({});
  const r = collectCoinPaidTriggers(trigCtx(HOST), HOST, host, guest);
  eq(r.entries.length, 1, 'entries'); eq(r.entries[0].effectId, 'WXDi-P15-055-E1', 'effectId'); eq(r.entries[0].playerId, HOST, 'player');
  eq(r.usedIds.includes('WXDi-P15-055-E1'), true, 'usedIdsに消費effectIdを返す');
});
test('C1 ON_COIN_PAID: usageLimit once_per_turn（消化済みは非発火）', () => {
  const host = mkState({ signi: ['WXDi-P15-055', null, null] }); const guest = mkState({});
  host.actions_done = ['WXDi-P15-055-E1']; // このターン既に発動済み
  eq(collectCoinPaidTriggers(trigCtx(HOST), HOST, host, guest).entries.length, 0, 'once_per_turn');
});
test('C1 ON_COIN_PAID: twice_per_turn は usedIds 書き戻しで3回目に非発火（続き99発見・続き106修正）', () => {
  // 従来 collectCoinPaidTriggers は StackEntry[] のみ返し usedIds 書き戻しが無く、《ターン2回》WXDi-P15-069 が
  // 3回目のコイン支払いでも発火していた（実機 coinPaidTwice で確認）。usedIds を返し呼び出し側が actions_done へ永続化。
  const mk = () => { const h = mkState({ signi: ['WXDi-P15-069', null, null] }); return h; };
  const host = mk(); const guest = mkState({});
  const r1 = collectCoinPaidTriggers(trigCtx(HOST), HOST, host, guest);
  eq(r1.entries.length, 1, '1回目発火'); eq(r1.usedIds.includes('WXDi-P15-069-E1'), true, '1回目usedId');
  // 呼び出し側が書き戻した後の2回目＝まだ発火可（twice）
  const host2 = { ...mk(), actions_done: ['WXDi-P15-069-E1'] };
  const r2 = collectCoinPaidTriggers(trigCtx(HOST), HOST, host2, guest);
  eq(r2.entries.length, 1, '2回目も発火（twice）');
  // 2回消化後の3回目＝非発火
  const host3 = { ...mk(), actions_done: ['WXDi-P15-069-E1', 'WXDi-P15-069-E1'] };
  eq(collectCoinPaidTriggers(trigCtx(HOST), HOST, host3, guest).entries.length, 0, '3回目は非発火');
});
test('色別ARTS_USED_THIS_TURN: 白のアーツを使用していた場合のみ発火（続き106・WX24-D1-11）', () => {
  const fires = (colors?: string[]) => {
    const host = { ...mkState({ signi: ['WX24-D1-11', null, null] }), ...(colors ? { turn_arts_used_colors: colors } : {}) };
    return cttEntries(trigCtx(HOST, HOST), 'ON_TURN_END', host, mkState({})).some(e => e.effectId === 'WX24-D1-11-E1');
  };
  eq(fires(undefined), false, 'アーツ未使用は非発火（従来は条件脱落で無条件発火していた）');
  eq(fires(['白']), true, '白アーツ使用で発火');
  eq(fires(['赤']), false, '別色（赤）アーツでは非発火');
  eq(fires(['赤', '白']), true, '複数色のうち白を含めば発火');
});

// Stage2②: ON_SIGNI_POWER_ZERO_OR_LESS（既存配線・R37・C2リスト5枚）の collectPowerZeroTriggers を pure 化→自動検証。
test('Stage2 ON_SIGNI_POWER_ZERO_OR_LESS: any_opp 相手0化で発火', () => {
  const host = mkState({ signi: ['WX20-Re03', null, null] }); const guest = mkState({ signi: [SIGNI, null, null] });
  const e = cpzEntries(trigCtx(HOST), SIGNI, GUEST, host, guest); // guest のシグニが0化
  eq(e.length, 1, 'entries'); eq(e[0].effectId, 'WX20-Re03-E1', 'effectId'); eq(e[0].playerId, HOST, 'player');
});
test('Stage2 ON_SIGNI_POWER_ZERO_OR_LESS: any_opp は自分0化で非発火', () => {
  const host = mkState({ signi: ['WX20-Re03', null, null] }); const guest = mkState({});
  eq(cpzEntries(trigCtx(HOST), SIGNI, HOST, host, guest).length, 0, '自0化非発火');
});
test('Stage2 ON_SIGNI_POWER_ZERO_OR_LESS: once_per_turn 消化済み非発火', () => {
  const host = mkState({ signi: ['WX20-Re03', null, null] }); host.actions_done = ['WX20-Re03-E1'];
  const guest = mkState({ signi: [SIGNI, null, null] });
  eq(cpzEntries(trigCtx(HOST), SIGNI, GUEST, host, guest).length, 0, 'once_per_turn');
});

// ── Opusタスク12(vi-3)(vi-4)：triggerCollect の LRIGゾーン走査漏れ回帰（続き95/96 で発見・続き106 Opus で修正）──
// 各コレクタが field.signi のみ走査し field.lrig を欠いていたため、LRIG が watcher の該当timingが構造的に絶対発火しなかった。
// ownFieldSources 置き換え／専用 lrig ブロック追加で解消。以下は「LRIG に載せると発火する」ことの回帰固定。
const fired = (e: { effectId: string }[], id: string) => e.some(x => x.effectId === id);
test('LRIG走査漏れ collectPowerZeroTriggers: LRIG watcher（WX22-013 any_opp）が相手0化で発火', () => {
  const host = mkState({}); host.field.lrig = ['WX22-013']; const guest = mkState({ signi: [SIGNI, null, null] });
  eq(fired(cpzEntries(trigCtx(HOST), SIGNI, GUEST, host, guest), 'WX22-013-E2'), true, 'LRIG watcher 発火');
});
test('LRIG走査漏れ collectFieldTriggers: 相手LRIG watcher（WX12-001 ON_ATTACK_SIGNI any_opp）が発火', () => {
  const host = mkState({ signi: [SIGNI, null, null] }); const guest = mkState({}); guest.field.lrig = ['WX12-001'];
  eq(fired(cftEntries(trigCtx(HOST), 'ON_ATTACK_SIGNI', SIGNI, host, guest, HOST), 'WX12-001-E2'), true, '相手LRIG watcher 発火');
});
test('タスク17 「アタックフェイズ開始時」の timing 是正: 23効果が ON_ATTACK_PHASE_START で発火する（続き136）', () => {
  // parser の timing 判定が actionText 全体を見ていたため、トリガー句より後ろの本文（「…このターン、…がアタックしたとき」
  // 「…ライフクロス…クラッシュしたとき」）や引用付与の内側を先に拾い、外側 timing が ON_ATTACK_SIGNI /
  // ON_OPP_LIFE_CRASHED / ON_ATTACK_LRIG に化けていた＝該当効果は一度も発火しなかった。判定を先頭のトリガー句に
  // 限定し、JSON 側 23効果も是正。ここでは代表3枚が実際に ON_ATTACK_PHASE_START で収集されることを固定する。
  const timingOf = (id: string) => (effectsMap.get(id.replace(/-E\d+$/, ''))?.find(e => e.effectId === id)?.timing ?? []).join('/');
  eq(timingOf('WX24-P2-018-E1'), 'ON_ATTACK_PHASE_START', 'WX24-P2-018-E1（旧 ON_ATTACK_SIGNI＝§7 B4 のブロッカー）');
  eq(timingOf('WX25-CP1-085-E1'), 'ON_ATTACK_PHASE_START', 'WX25-CP1-085-E1（旧 ON_ATTACK_SIGNI）');
  eq(timingOf('WXDi-CP02-090-E1'), 'ON_ATTACK_PHASE_START', 'WXDi-CP02-090-E1（旧 ON_OPP_LIFE_CRASHED）');
  // シグニに載せると自分の APS で実際に収集される（self scope）
  const host = mkState({ signi: ['WX24-P2-018', null, null] });
  eq(fired(cttEntries(trigCtx(HOST, HOST), 'ON_ATTACK_PHASE_START', host, mkState({})), 'WX24-P2-018-E1'), true, 'APS で収集される');
  // 「対戦相手のアタックフェイズ開始時」は any_opp＝相手ターンに非ターンプレイヤー側の watcher として収集される
  const guestWatch = mkState({ signi: ['WXDi-P08-058', null, null] });
  eq(fired(cttEntries(trigCtx(HOST, HOST), 'ON_ATTACK_PHASE_START', mkState({}), guestWatch), 'WXDi-P08-058-E1'), true, 'any_opp watcher が相手APSで収集される');
});
test('LRIG走査漏れ collectTurnTriggers: 相手LRIG watcher（WX12-002 ON_ATTACK_PHASE_START any_opp）が発火', () => {
  const host = mkState({}); const guest = mkState({}); guest.field.lrig = ['WX12-002'];
  eq(fired(cttEntries(trigCtx(HOST, HOST), 'ON_ATTACK_PHASE_START', host, guest), 'WX12-002-E1'), true, '相手LRIG watcher 発火');
});
test('LRIG走査漏れ collectOppArtsUseTriggers: 自LRIG watcher（WX16-003 ON_OPP_ARTS_USE）が発火', () => {
  const host = mkState({}); host.field.lrig = ['WX16-003']; const guest = mkState({});
  eq(fired(collectOppArtsUseTriggers(trigCtx(HOST, HOST), host, guest, true), 'WX16-003-E1'), true, '自LRIG watcher 発火');
});
test('LRIG走査漏れ collectHandDiscardTriggers: 自LRIG watcher（WXEX2-12 ON_HAND_DISCARDED）が発火', () => {
  const host = mkState({}); host.field.lrig = ['WXEX2-12'];
  eq(fired(collectHandDiscardTriggers(trigCtx(HOST), [SIGNI], host, HOST, false).entries, 'WXEX2-12-E2'), true, '自LRIG watcher 発火');
});
// 続き175（Opusタスク16）: any_opp「（あなたの効果によって）対戦相手が手札を捨てたとき」＝相手フィールド watcher が
// 相手（discarder）の手札捨てで発火し、自分の手札捨てでは発火しない（自分の捨てで発火する 'any' との差）。
test('collectHandDiscardTriggers any_opp: 相手(discarder)の手札捨てで反応側シグニが発火（WXDi-P04-063）', () => {
  const discarder = mkState({}); const reactor = mkState({ signi: ['WXDi-P04-063', null, null] });
  const e = collectHandDiscardTriggers(trigCtx(GUEST), [SIGNI], discarder, GUEST, false, reactor, HOST).entries;
  eq(fired(e, 'WXDi-P04-063-E1'), true, '相手捨てで発火');
  eq(e.find(x => x.effectId === 'WXDi-P04-063-E1')?.playerId, HOST, 'playerId=反応側(HOST)');
});
test('collectHandDiscardTriggers any_opp: 自分の手札捨てでは発火しない（過剰効果防止）', () => {
  const reactor = mkState({ signi: ['WXDi-P04-063', null, null] });
  const e = collectHandDiscardTriggers(trigCtx(HOST), [SIGNI], reactor, HOST, false, mkState({}), GUEST).entries;
  eq(fired(e, 'WXDi-P04-063-E1'), false, '自分の捨てでは非発火');
});
test('collectHandDiscardTriggers any_opp: 反応側センタールリグ watcher も発火（WXDi-P04-009 LRIG）', () => {
  const discarder = mkState({}); const reactor = mkState({}); reactor.field.lrig = ['WXDi-P04-009'];
  const e = collectHandDiscardTriggers(trigCtx(GUEST), [SIGNI], discarder, GUEST, false, reactor, HOST).entries;
  eq(fired(e, 'WXDi-P04-009-E2'), true, '相手捨てで LRIG watcher 発火');
});

// Stage2③: ON_BLOOD_CRYSTAL_ARMOR（血晶武装したとき・自分の場のみ走査）の collectArmorTriggers を pure 化→自動検証。
test('Stage2 ON_BLOOD_CRYSTAL_ARMOR: self-scope 武装シグニ自身が発火', () => {
  const host = mkState({ signi: ['WXK05-023', null, null] }); const guest = mkState({});
  const e = collectArmorTriggers(trigCtx(HOST), 'WXK05-023', HOST, host, guest).entries;
  eq(e.length, 1, 'entries'); eq(e[0].effectId, 'WXK05-023-E1', 'effectId'); eq(e[0].playerId, HOST, 'player');
});
test('Stage2 ON_BLOOD_CRYSTAL_ARMOR: armor 無しカードは非発火', () => {
  const host = mkState({ signi: [SIGNI, null, null] }); const guest = mkState({});
  eq(collectArmorTriggers(trigCtx(HOST), SIGNI, HOST, host, guest).entries.length, 0, 'non-armor');
});

// Stage2④: ON_TRASH ファミリ（collectTrashTriggers/collectDeckTrashSelfTriggers/collectAnyZoneTrashSelfTriggers）を pure 化→自動検証。
const has = (e: { effectId: string }[], id: string) => e.some(x => x.effectId === id);
test('Stage2 ON_TRASH: 場からトラッシュで self トリガー発火（WXDi-P09-043-E2）', () => {
  const host = mkState({}); const guest = mkState({});
  const e = collectTrashTriggers(trigCtx(HOST), 'WXDi-P09-043', HOST, host, guest).entries;
  eq(has(e, 'WXDi-P09-043-E2'), true, 'self発火');
});
test('Stage2 ON_TRASH: any_opp + IS_MY_TURN ゲート（WX04-037-E2）', () => {
  // 相手(GUEST)のシグニがトラッシュ→watcher=HOST の WX04-037 が「自分のターンの間」のみ発火
  const host = mkState({ signi: ['WX04-037', null, null] }); const guest = mkState({});
  eq(has(collectTrashTriggers(trigCtx(HOST), SIGNI, GUEST, host, guest).entries, 'WX04-037-E2'), true, '自ターン発火');
  eq(has(collectTrashTriggers(trigCtx(GUEST), SIGNI, GUEST, host, guest).entries, 'WX04-037-E2'), false, '相手ターン非発火');
});
test('Stage2 ON_TRASH: fromZones=[deck] は場からでは非発火・デッキからのみ発火（WX02-073-E1）', () => {
  const host = mkState({}); const guest = mkState({});
  eq(has(collectTrashTriggers(trigCtx(HOST), 'WX02-073', HOST, host, guest).entries, 'WX02-073-E1'), false, '場からは非発火');
  eq(has(collectDeckTrashSelfTriggers(trigCtx(HOST), 'WX02-073', HOST), 'WX02-073-E1'), true, 'デッキから発火');
});
test('Stage2 ON_TRASH: fromAnyZone + byOpponentEffect ゲート（WX04-035-E2）', () => {
  const c = collectAnyZoneTrashSelfTriggers;
  eq(has(c(trigCtx(HOST), 'WX04-035', HOST, true, 'hand'), 'WX04-035-E2'), true, '相手効果起因で発火');
  eq(has(c(trigCtx(HOST), 'WX04-035', HOST, false, 'hand'), 'WX04-035-E2'), false, '自起因では非発火');
});

// Stage2⑤: ON_BANISH（collectBanishTriggers）を pure 化→自動検証。meId 視点での my/op 分岐も検証。
test('Stage2 ON_BANISH: self バニッシュで自身が発火（WX02-025-E2）', () => {
  const host = mkState({}); const guest = mkState({});
  eq(has(cbtEntries(trigCtx(HOST, HOST), 'WX02-025', HOST, host, guest), 'WX02-025-E2'), true, 'self発火');
});
// Opusタスク12(vi-4)＋any_ally scope 脱落（続き181）：「あなたの＜X＞のシグニ1体がバニッシュされたとき」は
// ①味方＜X＞のバニッシュで発火 ②自身が＜X＞なら自分のバニッシュでも発火 ③＜X＞以外では非発火 ④ルリグ watcher でも発火。
const NON_AKUMA = findCard(c => isSigni(c) && !(c.CardClass ?? '').includes('悪魔') && !(c.CardClass ?? '').includes('美巧'));
test('Stage2 ON_BANISH any_ally: 味方＜悪魔＞のバニッシュで発火・＜悪魔＞以外では非発火（WX02-025-E2）', () => {
  const host = mkState({ signi: ['WX02-025', null, null] }); const guest = mkState({});
  // WD14-011 も精像：悪魔＝triggerFilter{story:悪魔} に一致
  eq(has(cbtEntries(trigCtx(HOST, HOST), 'WD14-011', HOST, host, guest), 'WX02-025-E2'), true, '味方悪魔のバニッシュで発火');
  eq(has(cbtEntries(trigCtx(HOST, HOST), NON_AKUMA, HOST, host, guest), 'WX02-025-E2'), false, '悪魔以外は非発火');
  // 相手のシグニがバニッシュされても any_ally は非発火
  eq(has(cbtEntries(trigCtx(HOST, HOST), 'WD14-011', GUEST, host, guest), 'WX02-025-E2'), false, '相手側バニッシュは非発火');
  // 自身（＝精像：悪魔）のバニッシュでも発火する＝block1 の any_ally 拡張（場から離れるため field 走査では拾えない）
  eq(has(cbtEntries(trigCtx(HOST, HOST), 'WX02-025', HOST, host, guest), 'WX02-025-E2'), true, '自身のバニッシュでも発火');
});
test('Stage2 ON_BANISH any_ally: excludeSelf（「あなたの他のシグニ」）は自分のバニッシュで非発火（WXDi-P03-042-E2）', () => {
  const host = mkState({ signi: ['WXDi-P03-042', null, null] }); const guest = mkState({});
  eq(has(cbtEntries(trigCtx(HOST, HOST), 'WXDi-P03-042', HOST, host, guest), 'WXDi-P03-042-E2'), false, '自身のバニッシュでは非発火');
  eq(has(cbtEntries(trigCtx(HOST, HOST), NON_AKUMA, HOST, host, guest), 'WXDi-P03-042-E2'), true, '他の味方バニッシュで発火');
});
test('Stage2 ON_BANISH any_ally: ルリグ watcher が発火（WX22-011-E2・(vi-4) の LRIGゾーン走査漏れ）', () => {
  // 修正前は collectBanishTriggers が field.signi のみ走査＝ルリグの watcher は構造的に絶対発火しなかった
  const host = mkState({}); host.field.lrig = ['WX22-011']; const guest = mkState({});
  const bikou = findCard(c => isSigni(c) && (c.CardClass ?? '').includes('美巧'));
  eq(has(cbtEntries(trigCtx(HOST, HOST), bikou, HOST, host, guest), 'WX22-011-E2'), true, 'ルリグ watcher が味方＜美巧＞バニッシュで発火');
  eq(has(cbtEntries(trigCtx(HOST, HOST), NON_AKUMA, HOST, host, guest), 'WX22-011-E2'), false, '美巧以外は非発火');
});
test('Stage2 ON_BANISH: any_opp 相手バニッシュで発火・自バニッシュで非発火（WX13-085-E1）', () => {
  const host = mkState({ signi: ['WX13-085', null, null] }); const guest = mkState({});
  eq(has(cbtEntries(trigCtx(HOST, HOST), SIGNI, GUEST, host, guest), 'WX13-085-E1'), true, '相手バニッシュ発火');
  eq(has(cbtEntries(trigCtx(HOST, HOST), SIGNI, HOST, host, guest), 'WX13-085-E1'), false, '自バニッシュ非発火');
});
test('Stage2 ON_BANISH: meId 視点に依らず対称（GUEST 視点でも同結果・playerId は能力保持者）', () => {
  const host = mkState({ signi: ['WX13-085', null, null] }); const guest = mkState({});
  // meId=GUEST 視点でも、相手(GUEST)のシグニがバニッシュ→host の any_opp が発火（playerId=HOST）
  const e = cbtEntries(trigCtx(HOST, GUEST), SIGNI, GUEST, host, guest);
  eq(e.find(x => x.effectId === 'WX13-085-E1')?.playerId, HOST, 'playerId=能力保持者HOST');
});
// Opusタスク12 ON_BANISH据置(アタックフェイズ前置き)：「（対戦相手の）アタックフェイズの間、あなたの＜X＞のシグニが
// バニッシュされたとき」＝any_ally + triggerCondition.duringAttackPhase(+turnOwner)。修正前は scope 既定 self に潰れ
// ルリグ watcher は構造的に絶対発火しなかった（WX18-002/WXEX1-18）。
const YUGU = findCard(c => isSigni(c) && (c.CardClass ?? '').includes('遊具'));
const EICHI = findCard(c => isSigni(c) && (c.CardClass ?? '').includes('英知'));
test('Stage2 ON_BANISH any_ally duringAttackPhase: アタックフェイズ中のみ発火（WXEX1-18-E1・ルリグwatcher）', () => {
  const host = mkState({}); host.field.lrig = ['WXEX1-18']; const guest = mkState({});
  const atk = (au: string) => ({ ...trigCtx(HOST, HOST), turnPhase: 'ATTACK_SIGNI', activeUserId: au });
  const main = { ...trigCtx(HOST, HOST), turnPhase: 'MAIN', activeUserId: GUEST };
  // 英知のバニッシュ×アタックフェイズ→発火（自ターン/相手ターン問わず）
  eq(has(collectBanishTriggers(atk(HOST), EICHI, HOST, host, guest).entries, 'WXEX1-18-E1'), true, '自ターンアタックで発火');
  eq(has(collectBanishTriggers(atk(GUEST), EICHI, HOST, host, guest).entries, 'WXEX1-18-E1'), true, '相手ターンアタックで発火');
  // メインフェイズでは非発火
  eq(has(collectBanishTriggers(main, EICHI, HOST, host, guest).entries, 'WXEX1-18-E1'), false, 'メインでは非発火');
  // 英知以外は非発火（triggerFilter story:英知）
  eq(has(collectBanishTriggers(atk(GUEST), NON_AKUMA, HOST, host, guest).entries, 'WXEX1-18-E1'), false, '英知以外は非発火');
});
test('Stage2 ON_BANISH any_ally duringAttackPhase+turnOwner:opponent: 相手のアタックフェイズのみ発火（WX18-002-E1・ルリグwatcher）', () => {
  const host = mkState({}); host.field.lrig = ['WX18-002']; const guest = mkState({});
  const ctxAt = (au: string) => ({ ...trigCtx(HOST, HOST), turnPhase: 'ATTACK_SIGNI', activeUserId: au });
  // 遊具のバニッシュ×相手ターン(activeUserId=GUEST)のアタックフェイズ→発火
  eq(has(collectBanishTriggers(ctxAt(GUEST), YUGU, HOST, host, guest).entries, 'WX18-002-E1'), true, '相手ターンアタックで発火');
  // 自ターン(activeUserId=HOST)のアタックフェイズ→turnOwner:opponent 不成立で非発火
  eq(has(collectBanishTriggers(ctxAt(HOST), YUGU, HOST, host, guest).entries, 'WX18-002-E1'), false, '自ターンアタックは非発火');
  // 相手ターンのメインフェイズ→duringAttackPhase 不成立で非発火
  eq(has(collectBanishTriggers({ ...trigCtx(HOST, HOST), turnPhase: 'MAIN', activeUserId: GUEST }, YUGU, HOST, host, guest).entries, 'WX18-002-E1'), false, '相手メインは非発火');
  // 遊具以外は非発火
  eq(has(collectBanishTriggers(ctxAt(GUEST), NON_AKUMA, HOST, host, guest).entries, 'WX18-002-E1'), false, '遊具以外は非発火');
});

// Stage2⑥: ON_LEAVE_FIELD（collectLeaveFieldTriggers）を pure 化→自動検証。triggerFilter/leftToZone ゲートを検証。
const ARM_SIGNI = findCard(c => isSigni(c) && (c.CardClass ?? '').includes('アーム'));
const NONARM_SIGNI = findCard(c => isSigni(c) && !!c.CardClass && !(c.CardClass ?? '').includes('アーム'));
test('Stage2 ON_LEAVE_FIELD: self 離脱で自身発火（WX06-016-E2）', () => {
  const host = mkState({}); const guest = mkState({});
  eq(has(collectLeaveFieldTriggers(trigCtx(HOST), 'WX06-016', [], HOST, host, guest).entries, 'WX06-016-E2'), true, 'self発火');
});
test('Stage2 ON_LEAVE_FIELD: any_ally triggerFilter(story:アーム) 一致時のみ発火（WX11-035-E1）', () => {
  const host = mkState({ signi: ['WX11-035', null, null] }); const guest = mkState({});
  eq(has(collectLeaveFieldTriggers(trigCtx(HOST), ARM_SIGNI, [], HOST, host, guest).entries, 'WX11-035-E1'), true, 'アーム離脱で発火');
  eq(has(collectLeaveFieldTriggers(trigCtx(HOST), NONARM_SIGNI, [], HOST, host, guest).entries, 'WX11-035-E1'), false, '非アーム離脱は非発火');
});
test('Stage2 ON_LEAVE_FIELD: leftToZone=hand は手札在中時のみ発火（WXK02-041-E2）', () => {
  const guest = mkState({});
  const host = mkState({ signi: ['WXK02-041', null, null] }); host.hand.push(SIGNI); // 離れたカードが手札に在る
  eq(has(collectLeaveFieldTriggers(trigCtx(HOST), SIGNI, [], HOST, host, guest).entries, 'WXK02-041-E2'), true, '手札在中で発火');
  const host2 = mkState({ signi: ['WXK02-041', null, null] }); // SIGNI を手札に入れない
  eq(has(collectLeaveFieldTriggers(trigCtx(HOST), SIGNI, [], HOST, host2, guest).entries, 'WXK02-041-E2'), false, '手札不在で非発火');
});

// Stage2⑦: ON_DRAW / 対戦相手ドロー / ミル（collectDraw/OppDraw/MillTriggers）を pure 化→自動検証。
test('Stage2 ON_DRAW: self ドローで発火・once_per_turn 消化済み非発火（WXK02-090-E1）', () => {
  const host = mkState({ signi: ['WXK02-090', null, null] }); const guest = mkState({});
  eq(has(collectDrawTriggers(trigCtx(HOST), HOST, host, guest).entries, 'WXK02-090-E1'), true, 'ドロー発火');
  host.actions_done = ['WXK02-090-E1'];
  eq(has(collectDrawTriggers(trigCtx(HOST), HOST, host, guest).entries, 'WXK02-090-E1'), false, 'once_per_turn');
});
test('Stage2 ON_DRAW: outsideDrawPhase はドローフェイズ通常ドローで非発火（WXDi-D09-P19-E1）', () => {
  const host = mkState({ signi: ['WXDi-D09-P19', null, null] }); const guest = mkState({});
  eq(has(collectDrawTriggers(trigCtx(HOST), HOST, host, guest, false).entries, 'WXDi-D09-P19-E1'), true, '効果ドロー発火');
  eq(has(collectDrawTriggers(trigCtx(HOST), HOST, host, guest, true).entries, 'WXDi-D09-P19-E1'), false, 'ドローフェイズ非発火');
});
test('Stage2 ON_DRAW any_opp: 相手ドローで反応側が発火（WXDi-P15-091-E1）', () => {
  const host = mkState({ signi: ['WXDi-P15-091', null, null] }); const guest = mkState({});
  eq(has(collectOppDrawTriggers(trigCtx(HOST), HOST, host, guest).entries, 'WXDi-P15-091-E1'), true, '相手ドロー発火');
});
test('Stage2 ON_DRAW any_opp: drawByDrawerOwnEffect＝相手が自分の効果で引いたときのみ発火（PR-423・続き162・タスク12(xxi)）', () => {
  const host = mkState({ signi: ['PR-423', null, null] });
  const guestOwn = mkState({}); (guestOwn as unknown as { last_draw_by_own_effect: boolean }).last_draw_by_own_effect = true;
  const guestForced = mkState({}); (guestForced as unknown as { last_draw_by_own_effect: boolean }).last_draw_by_own_effect = false;
  eq(has(collectOppDrawTriggers(trigCtx(HOST), HOST, host, guestOwn).entries, 'PR-423-E1'), true, '相手自身の効果で引いた→発火');
  eq(has(collectOppDrawTriggers(trigCtx(HOST), HOST, host, guestForced).entries, 'PR-423-E1'), false, 'reactor の効果で引かせた→非発火');
});
test('Stage2 ON_DISCARDED_AS_COST: discardCostSourceStory＝＜微菌＞の能力コストで捨てたときのみ発火（WX25-P3-071-E2・続き162・タスク12(xxiv)）', () => {
  const me = mkState({});
  const bikin = findCard(c => (c.CardClass ?? '').includes('微菌'));            // 微菌 シグニ（発生源＝発火）
  const nonBikin = findCard(c => isSigni(c) && !(c.CardClass ?? '').includes('微菌')); // 非微菌（発生源不一致＝非発火）
  const fires = (src: string) => has(collectHandDiscardTriggers(trigCtx(HOST), ['WX25-P3-071'], me, HOST, true, undefined, undefined, src).entries, 'WX25-P3-071-E2');
  eq(fires(bikin), true, '微菌の能力コストで捨てた→発火');
  eq(fires(nonBikin), false, '非微菌の能力コストで捨てた→非発火');
});
test('Stage2 ON_CARD_MILLED_FROM_DECK: milledMinCount 未満は非発火（WXDi-P08-079-E1 min=2）', () => {
  const host = mkState({ signi: ['WXDi-P08-079', null, null] }); const guest = mkState({});
  eq(has(collectMillTriggers(trigCtx(HOST), HOST, host, guest, 2, 0).entries, 'WXDi-P08-079-E1'), true, '2枚で発火');
  eq(has(collectMillTriggers(trigCtx(HOST), HOST, host, guest, 1, 0).entries, 'WXDi-P08-079-E1'), false, '1枚は非発火');
});
// Stage2⑨: ON_SIGNI_DOWN / ON_SIGNI_BECOMES_UP（collectSigniDownUpTriggers・タスク16[C]続き180）を pure 化→自動検証。
test('Stage2 ON_SIGNI_DOWN: byEffect ゲート＝効果ダウンのみ発火・アタックダウンは非発火（WX05-040-E2 any_ally）', () => {
  const host = mkState({ signi: ['WX05-040', null, null] }); const guest = mkState({});
  const grp = (byEffect: boolean) => [{ ownerId: HOST, nums: ['WX05-040'], byEffect }];
  eq(has(collectSigniDownUpTriggers(trigCtx(HOST), 'ON_SIGNI_DOWN', grp(true), host, guest).entries, 'WX05-040-E2'), true, '効果ダウンで発火');
  eq(has(collectSigniDownUpTriggers(trigCtx(HOST), 'ON_SIGNI_DOWN', grp(false), host, guest).entries, 'WX05-040-E2'), false, 'アタックダウン(byEffect:false)は非発火');
});
test('Stage2 ON_SIGNI_DOWN: any_ally scope＝相手側シグニのダウンでは非発火（WX05-040-E2）', () => {
  const host = mkState({ signi: ['WX05-040', null, null] }); const guest = mkState({ signi: ['WX05-040-opp', null, null] });
  const grpOpp = [{ ownerId: GUEST, nums: ['WX05-040-opp'], byEffect: true }];
  eq(has(collectSigniDownUpTriggers(trigCtx(HOST), 'ON_SIGNI_DOWN', grpOpp, host, guest).entries, 'WX05-040-E2'), false, 'any_ally は相手側ダウンで非発火');
});
test('Stage2 ON_SIGNI_BECOMES_UP: キー watcher＝キー上の【自】を収集（WXK11-015-E3 isTriggerSource freeze・MANUAL）', () => {
  const host = mkState({ signi: [null, null, null] }); const guest = mkState({ signi: ['GG', null, null] });
  host.field.key_piece = 'WXK11-015'; // キーに載っている
  const grp = [{ ownerId: GUEST, nums: ['GG'], byEffect: false }]; // 相手シグニがダウン（scope:any）
  eq(has(collectSigniDownUpTriggers(trigCtx(HOST), 'ON_SIGNI_DOWN', grp, host, guest).entries, 'WXK11-015-E3'), true, 'キー上の ON_SIGNI_DOWN を収集');
});
test('Stage2 detectNewlyDowned/Upped: signi_down 遷移を同一在中のみ検出（別カードに入れ替わったゾーンは誤検出しない）', () => {
  const before = mkState({ signi: ['AAA', 'BBB', null], down: [false, false, false] });
  const afterDown = mkState({ signi: ['AAA', 'BBB', null], down: [true, false, false] });
  eq(JSON.stringify(detectNewlyDowned(before, afterDown)), JSON.stringify(['AAA']), 'zone0 が false→true・同一在中→検出');
  const afterSwap = mkState({ signi: ['CCC', 'BBB', null], down: [true, false, false] });
  eq(detectNewlyDowned(before, afterSwap).length, 0, '別カードに入れ替わったゾーンは非検出');
  const beforeUp = mkState({ signi: ['AAA', 'BBB', null], down: [true, false, false] });
  const afterUp = mkState({ signi: ['AAA', 'BBB', null], down: [false, false, false] });
  eq(JSON.stringify(detectNewlyUpped(beforeUp, afterUp).nums), JSON.stringify(['AAA']), 'zone0 が true→false・同一在中→検出');
});
test('Stage2 ON_LEAVE_FIELD any_opp: 自効果で相手シグニが手札へ離脱→反応側(host)が発火（WXK11-049-E1 跨サイド・byOwnEffect）', () => {
  const host = mkState({ signi: ['WXK11-049', null, null] });
  const guest = mkState({}); guest.hand.push('GG-opp'); // 離脱した相手シグニが相手手札に在中（leftToZone:hand）
  // leftPlayerId=GUEST・activeUserId=HOST（turnOwner:self）。causeOwnerId=HOST＝host 自身の効果が原因→発火
  eq(has(collectLeaveFieldTriggers(trigCtx(HOST), 'GG-opp', [], GUEST, host, guest, HOST).entries, 'WXK11-049-E1'), true, 'byOwnEffect＝自効果で相手離脱→発火');
  eq(has(collectLeaveFieldTriggers(trigCtx(HOST), 'GG-opp', [], GUEST, host, guest, GUEST).entries, 'WXK11-049-E1'), false, 'causeOwnerId が相手側なら byOwnEffect 非成立で非発火');
});

// Stage2⑧: set-diff 系 6ファミリ（charm/energy/refresh/powerDecrease/moveToDeck/freeze）を pure 化→自動検証。
test('Stage2 ON_CHARM_TO_TRASH: チャーム枚数>0 で発火・0で非発火（WX16-Re05-E1 any）', () => {
  const host = mkState({ signi: ['WX16-Re05', null, null] }); const guest = mkState({});
  eq(has(collectCharmToTrashTriggers(trigCtx(HOST), HOST, host, guest, 1, 0).entries, 'WX16-Re05-E1'), true, '1枚で発火');
  eq(has(collectCharmToTrashTriggers(trigCtx(HOST), HOST, host, guest, 0, 0).entries, 'WX16-Re05-E1'), false, '0枚は非発火');
});
test('Stage2 ON_ENERGY_TO_TRASH: energyTrashedOwner=opponent は相手エナ消費でのみ発火（WD15-015-E1）', () => {
  const host = mkState({ signi: ['WD15-015', null, null] }); const guest = mkState({});
  eq(has(collectEnergyToTrashTriggers(trigCtx(HOST), HOST, host, guest, 0, 1).entries, 'WD15-015-E1'), true, '相手エナで発火');
  eq(has(collectEnergyToTrashTriggers(trigCtx(HOST), HOST, host, guest, 1, 0).entries, 'WD15-015-E1'), false, '自エナは非発火');
});
test('Cluster D ON_ENERGY_TO_TRASH: ルリグ付与能力の内側 timing を収集（SPDi43-12-sub-E1）', () => {
  const parsed = parseCardEffects(cardMap.get('SPDi43-12')!);
  const grant = parsed.find(e => e.effectId === 'SPDi43-12-E2')?.action as { abilities?: CardEffect[] };
  const inner = grant.abilities?.find(e => e.effectId === 'SPDi43-12-sub-E1');
  eq(inner?.timing?.[0], 'ON_ENERGY_TO_TRASH', '内側 timing');
  eq(inner?.triggerCondition?.energyTrashedOwner, 'opponent', '対戦相手のエナ限定');
  const host = mkState({}); host.field.lrig = ['SPDi43-12']; host.lrig_granted_auto_effects = [inner!];
  const guest = mkState({});
  eq(has(collectEnergyToTrashTriggers(trigCtx(HOST), HOST, host, guest, 0, 1).entries, 'SPDi43-12-sub-E1'), true, '相手エナ→トラッシュで発火');
  eq(has(collectEnergyToTrashTriggers(trigCtx(HOST), HOST, host, guest, 1, 0).entries, 'SPDi43-12-sub-E1'), false, '自エナ→トラッシュでは非発火');
});
test('Stage2 ON_REFRESH: refreshedOwner=any はどちらのリフレッシュでも発火（WXDi-P04-043-E1）', () => {
  const host = mkState({ signi: ['WXDi-P04-043', null, null] }); const guest = mkState({});
  eq(has(collectRefreshTriggers(trigCtx(HOST), HOST, host, guest, 1, 0).entries, 'WXDi-P04-043-E1'), true, '自リフレッシュで発火');
  eq(has(collectRefreshTriggers(trigCtx(HOST), HOST, host, guest, 0, 0).entries, 'WXDi-P04-043-E1'), false, '0回は非発火');
});
test('B3 遅延トリガー ON_REFRESH: 相手リフレッシュで発火・自リフレッシュ/未設置は非発火（WX11-024）', () => {
  const dt = { type: 'INSTALL_DELAYED_TRIGGER', duration: 'THIS_TURN', trigger: { timing: 'ON_REFRESH', refreshedOwner: 'opponent' }, effect: { type: 'FORCE_END_TURN' } } as import('../src/types/effects').InstallDelayedTriggerAction;
  const host: PlayerState = { ...mkState({}), delayed_triggers: [dt] };
  const guest = mkState({});
  const fired = collectRefreshTriggers(trigCtx(HOST), HOST, host, guest, 0, 1).entries;
  eq(fired.some(e => e.effectId === 'DELAYED_TRIGGER' && (e.effect.action as { type?: string }).type === 'FORCE_END_TURN'), true, '相手リフレッシュで発火');
  eq(collectRefreshTriggers(trigCtx(HOST), HOST, host, guest, 1, 0).entries.some(e => e.effectId === 'DELAYED_TRIGGER'), false, '自リフレッシュは非発火');
  eq(collectRefreshTriggers(trigCtx(HOST), HOST, mkState({}), guest, 0, 1).entries.some(e => e.effectId === 'DELAYED_TRIGGER'), false, '未設置は非発火');
});
test('Stage2 ON_OPP_POWER_DECREASED: decreaseOnOpp>0 で発火＋delta動的注入（WX13-036-E1）', () => {
  const host = mkState({ signi: ['WX13-036', null, null] }); const guest = mkState({});
  const e = collectPowerDecreaseTriggers(trigCtx(HOST), HOST, host, guest, 3000);
  const entry = e.entries.find(x => x.effectId === 'WX13-036-E1');
  eq(!!entry, true, '発火');
  eq((entry?.effect.action as { delta?: number }).delta, 3000, 'delta=減少量');
  eq(has(collectPowerDecreaseTriggers(trigCtx(HOST), HOST, host, guest, 0).entries, 'WX13-036-E1'), false, '0は非発火');
});
test('Stage2 boardDiff detectPowerDecrease: 複数シグニが同時に減少した場合は合算される（PLAN §7 R46②検証）', () => {
  // 1回の解決で2体のシグニへ POWER_MODIFY(負delta) が同時適用された想定＝temp_power_mods に2件の新規負deltaが追加される。
  const before = mkState({}); before.temp_power_mods = [];
  const after = mkState({}); after.temp_power_mods = [{ delta: -2000 }, { delta: -3000 }] as never;
  eq(detectPowerDecrease(before, after), 5000, '2体分の減少量が合算される（2000+3000=5000）');
});
test('Stage2 ON_OPP_POWER_DECREASED: 複数同時減少の合算値がそのままdeltaへ注入される（WX13-036-E1・PLAN §7 R46②検証）', () => {
  const host = mkState({ signi: ['WX13-036', null, null] }); const guest = mkState({});
  // detectPowerDecreaseが返す合算値5000をそのまま渡す＝boardDiff集計とcollector注入が一貫していることを確認
  const before = mkState({}); before.temp_power_mods = [];
  const after = mkState({}); after.temp_power_mods = [{ delta: -2000 }, { delta: -3000 }] as never;
  const summed = detectPowerDecrease(before, after);
  const entry = collectPowerDecreaseTriggers(trigCtx(HOST), HOST, host, guest, summed).entries.find(x => x.effectId === 'WX13-036-E1');
  eq((entry?.effect.action as { delta?: number }).delta, 5000, '2体同時減少の合算値5000がそのままdeltaに反映される');
});
test('Stage2 ON_OPP_POWER_DECREASED: 既知の近似＝「誰の効果で減ったか」は追跡しないため相手の自己弱体でも発火する（WX13-036-E1・PLAN §7 R46③・未修正のまま記録）', () => {
  // collectPowerDecreaseTriggers の decreaseOnOpp は「相手側の総パワー減少量」のみを見て、
  // それが watcher 側の効果によるものか相手自身の効果（自己弱体）によるものかを区別しない設計（BattleScreen.tsx:2670-2678）。
  // 原文は「対戦相手のシグニのパワーを減少させたとき」＝あなたの効果で減らした場合のみのはずだが、
  // 相手が相手自身の効果で自分のシグニを弱体化しても同じ decreaseOnOpp>0 として渡され発火してしまう。
  // このテストは既知の近似（未修正）の現状挙動を固定するもの＝修正時（発生源追跡の実装）にはこのテストの期待値を更新すること。
  const host = mkState({ signi: ['WX13-036', null, null] }); const guest = mkState({});
  const firedRegardlessOfCause = has(collectPowerDecreaseTriggers(trigCtx(HOST), HOST, host, guest, 4000).entries, 'WX13-036-E1');
  eq(firedRegardlessOfCause, true, '⚠既知の近似＝相手の自己弱体でも区別なく発火する（Opusタスク12/§6.3の発生源追跡機構待ち）');
});
test('Stage2 ON_CARD_MOVED_TO_DECK: movedToDeckFromTrash はトラッシュ起源のみ計上（WX09-020-E1）', () => {
  const host = mkState({ signi: ['WX09-020', null, null] }); const guest = mkState({});
  eq(has(collectMoveToDeckTriggers(trigCtx(HOST), HOST, host, guest, 0, 1, 0).entries, 'WX09-020-E1'), true, 'トラッシュ起源で発火');
  eq(has(collectMoveToDeckTriggers(trigCtx(HOST), HOST, host, guest, 5, 0, 0).entries, 'WX09-020-E1'), false, '非トラッシュ起源は非発火');
});
test('Stage2 ON_SIGNI_FROZEN: any_opp は相手シグニ凍結で発火・自シグニ凍結で非発火（WX08-039-E1）', () => {
  const host = mkState({ signi: ['WX08-039', null, null] }); const guest = mkState({});
  eq(has(collectFreezeTriggers(trigCtx(HOST), [{ ownerId: GUEST, nums: [SIGNI] }], host, guest).entries, 'WX08-039-E1'), true, '相手凍結で発火');
  eq(has(collectFreezeTriggers(trigCtx(HOST), [{ ownerId: HOST, nums: [SIGNI] }], host, guest).entries, 'WX08-039-E1'), false, '自凍結は非発火');
});
test('Stage2 ON_SIGNI_FROZEN: 複数同時凍結は凍結カード数だけ候補が積まれ、usageLimit once_per_turnが合算を1件に抑える（WX08-039-E1・PLAN §7 R38③検証）', () => {
  const host = mkState({ signi: ['WX08-039', null, null] }); const guest = mkState({});
  // 同一ターン内に相手シグニ2体が同時凍結＝nums に2件。usageLimitが無ければ2エントリ積まれるはずの合算ロジックを、
  // once_per_turn の actions_done 反映後は1件しか積めないことで確認する（呼び出し側の実際の書き戻しと同じ2段階呼び出し）。
  const r1 = collectFreezeTriggers(trigCtx(HOST), [{ ownerId: GUEST, nums: [SIGNI, SIGNI_P3000] }], host, guest);
  eq(r1.entries.filter(e => e.effectId === 'WX08-039-E1').length, 1, '2体同時凍結でもusageLimitで1件のみ（合算は正しく抑制される）');
  eq(r1.usedHostIds.includes('WX08-039-E1'), true, '消費IDを返す');
  // usageLimit を外した場合（比較対象）は2体分＝2エントリ積まれることを確認＝合算ロジック自体は正しく複数候補を数えている
  const effNoLimit = effectsMap.get('WX08-039')!.map(e => e.effectId === 'WX08-039-E1' ? { ...e, usageLimit: undefined } : e);
  const effectsMapNoLimit = new Map(effectsMap); effectsMapNoLimit.set('WX08-039', effNoLimit);
  const ctxNoLimit = { ...trigCtx(HOST), effectsMap: effectsMapNoLimit };
  const r2 = collectFreezeTriggers(ctxNoLimit, [{ ownerId: GUEST, nums: [SIGNI, SIGNI_P3000] }], host, guest);
  eq(r2.entries.filter(e => e.effectId === 'WX08-039-E1').length, 2, 'usageLimitを外すと2体分=2エントリ（合算ロジック自体は正しい）');
});

// Stage2⑨: クリーン系7ファミリ（selfEvent/zoneMoved/driveBecame/beatBecame/handDiscard/oppArtsUse/artsUse）を pure 化→自動検証。
const PURIPARA = findCard(c => isSigni(c) && (c.CardClass ?? '').includes('プリパラ'));
test('Stage2 ON_LIFE_CRASHED: ルリグの自イベントが発火（WX02-003-E1）', () => {
  const host = mkState({}); host.field.lrig = ['WX02-003']; const guest = mkState({});
  eq(has(collectSelfEventTriggers(trigCtx(HOST), 'ON_LIFE_CRASHED', host, guest, 'ライフクラッシュ時', HOST).entries, 'WX02-003-E1'), true, 'ルリグ発火');
});
test('Stage2 ON_ZONE_MOVED: self は移動シグニ自身で発火（WX11-036-E2）', () => {
  const host = mkState({ signi: ['WX11-036', null, null] }); const guest = mkState({});
  eq(has(collectZoneMovedTriggers(trigCtx(HOST), 'WX11-036', host, guest, HOST, GUEST).entries, 'WX11-036-E2'), true, '移動で発火');
});
test('Stage2 ON_SIGNI_BECOMES_DRIVE: any_ally は味方ドライブ化で発火（WXK01-047-E2）', () => {
  const host = mkState({ signi: ['WXK01-047', null, null] }); const guest = mkState({});
  eq(has(collectDriveBecameTriggers(trigCtx(HOST), SIGNI, host, guest, HOST, GUEST).entries, 'WXK01-047-E2'), true, 'ドライブで発火');
});
test('Stage2 ON_BECOME_BEAT: self はビート化したカード自身で発火（WXK08-045-E1）', () => {
  const host = mkState({});
  eq(has(collectBeatBecameTriggers(trigCtx(HOST), 'WXK08-045', host, HOST).entries, 'WXK08-045-E1'), true, 'ビート化で発火');
});
test('Stage2 ON_HAND_DISCARDED: triggerFilter(story:プリパラ) 一致時のみ発火（WXDi-P10-058-E1）', () => {
  const host = mkState({ signi: ['WXDi-P10-058', null, null] });
  eq(has(collectHandDiscardTriggers(trigCtx(HOST), [PURIPARA], host, HOST, false).entries, 'WXDi-P10-058-E1'), true, 'プリパラ捨てで発火');
  eq(has(collectHandDiscardTriggers(trigCtx(HOST), [SIGNI], host, HOST, false).entries, 'WXDi-P10-058-E1'), false, '非プリパラ捨ては非発火');
});
test('Stage2 ON_HAND_DISCARDED: turnOwner:self/opponent 分岐（WXDi-CP02-082・PLAN §7 R36②検証）', () => {
  const host = mkState({ signi: ['WXDi-CP02-082', null, null] });
  // 自ターン中の手札捨て→E1(turnOwner:self)のみ発火
  const selfTurn = collectHandDiscardTriggers(trigCtx(HOST), ['WXDi-CP02-082'], host, HOST, false);
  eq(has(selfTurn.entries, 'WXDi-CP02-082-E1'), true, '自ターンE1発火');
  eq(has(selfTurn.entries, 'WXDi-CP02-082-E2'), false, '自ターンE2非発火');
  // discarder(HOST)のターンでない＝相手ターン中の手札捨て→E2(turnOwner:opponent)のみ発火
  const oppTurn = collectHandDiscardTriggers(trigCtx(GUEST), ['WXDi-CP02-082'], host, HOST, false);
  eq(has(oppTurn.entries, 'WXDi-CP02-082-E2'), true, '相手ターンE2発火');
  eq(has(oppTurn.entries, 'WXDi-CP02-082-E1'), false, '相手ターンE1非発火');
});
test('Stage2 ON_DISCARDED_AS_COST: asCost=true のみ発火（WX25-P3-071-E2）', () => {
  const host = mkState({});
  const bikin = findCard(c => (c.CardClass ?? '').includes('微菌')); // discardCostSourceStory:微菌 を満たす発生源（続き162）
  eq(has(collectHandDiscardTriggers(trigCtx(HOST), ['WX25-P3-071'], host, HOST, true, undefined, undefined, bikin).entries, 'WX25-P3-071-E2'), true, 'コスト捨てで発火');
  eq(has(collectHandDiscardTriggers(trigCtx(HOST), ['WX25-P3-071'], host, HOST, false, undefined, undefined, bikin).entries, 'WX25-P3-071-E2'), false, 'asCost=falseは非発火');
});
test('Stage2 ON_OPP_ARTS_USE/ON_ARTS_USE: 自シグニが発火（WXK11-019-E2 / WXK01-059-E2）', () => {
  const host1 = mkState({ signi: ['WXK11-019', null, null] }); const guest1 = mkState({});
  eq(has(collectOppArtsUseTriggers(trigCtx(HOST, HOST), host1, guest1, true), 'WXK11-019-E2'), true, '相手アーツ使用で発火');
  const host2 = mkState({ signi: ['WXK01-059', null, null] }); const guest2 = mkState({});
  eq(has(collectArtsUseTriggers(trigCtx(HOST), HOST, host2, guest2, true).entries, 'WXK01-059-E2'), true, '自アーツ使用で発火');
});
// タスク16[B]第2弾: ON_ARTS_USE の色 filter＝使用したアーツカードを matchesFilter で評価（WXK01-043「あなたが緑の
// アーツを使用したとき」）。filter 付きなのにアーツが特定できない呼び出しでは発火しない（過剰発火抑止）。
test('collectArtsUseTriggers 色filter: 緑アーツで発火・非緑/不明では非発火（WXK01-043）', () => {
  const host = mkState({ signi: ['WXK01-043', null, null] }); const guest = mkState({});
  eq(has(collectArtsUseTriggers(trigCtx(HOST), HOST, host, guest, true, 'WD04-006').entries, 'WXK01-043-E1'), true, '緑アーツ（WD04-006）で発火');
  eq(has(collectArtsUseTriggers(trigCtx(HOST), HOST, host, guest, true, 'WD02-006').entries, 'WXK01-043-E1'), false, '赤アーツ（WD02-006）では非発火');
  eq(has(collectArtsUseTriggers(trigCtx(HOST), HOST, host, guest, true).entries, 'WXK01-043-E1'), false, 'アーツ不明（filter付き）では非発火');
});

// Stage2⑩: 大物 collectFieldTriggers（ON_PLAY 等）/ collectBloomTriggers を pure 化→自動検証。
const DOKUGA = findCard(c => isSigni(c) && (c.CardClass ?? '').includes('毒牙') && c.CardNum !== 'WX06-021');
test('Stage2 ON_PLAY field: any_opp 相手シグニが召喚に反応（WXK10-022-E1）', () => {
  const host = mkState({}); const guest = mkState({ signi: ['WXK10-022', null, null] });
  const e = cftEntries(trigCtx(HOST), 'ON_PLAY', SIGNI, host, guest, HOST);
  eq(has(e, 'WXK10-022-E1'), true, 'any_opp発火');
  eq(e.find(x => x.effectId === 'WXK10-022-E1')?.playerId, GUEST, 'playerId=相手');
});
test('Stage2 ON_PLAY field: WXK10-022-E1のturnOwner:selfは収集後段のturnGateOk（effectStack.initStack）で正しくゲートされる（PLAN §7 R30②検証）', () => {
  // collectFieldTriggers 自体はturnOwnerを見ない設計（WXK10-022-E1のエントリは常にplayerId=GUESTで積まれる）が、
  // それを initStack に渡す際、effectStack.ts の turnGateOk が entry.effect.triggerCondition.turnOwner と
  // entry.playerId(=GUEST) vs turnPlayerId を比較して中央集権的にゲートする設計（R36等と同型の二段構え）。
  const host = mkState({}); const guest = mkState({ signi: ['WXK10-022', null, null] });
  const e = cftEntries(trigCtx(HOST), 'ON_PLAY', SIGNI, host, guest, HOST);
  // ケース1＝HOSTのターン中にHOSTがシグニを召喚（通常の対戦相手召喚）＝GUEST視点では「相手(HOST)のターン」＝
  //   turnOwner:'self' を満たさない→turnGateOk で除外されるはず。
  const stackDuringHostTurn = initStack(HOST, e);
  const allEntriesHostTurn = [...stackDuringHostTurn.pendingTurn, ...stackDuringHostTurn.pendingOpp];
  eq(has(allEntriesHostTurn, 'WXK10-022-E1'), false, '通常の相手ターン召喚では turnOwner:self ゲートで除外される（過剰発火なし）');
  // ケース2＝GUESTのターン中にHOSTのシグニが場に出た（WXEX2-50【起】のような相手ターン中の特殊召喚）＝
  //   GUEST視点で「あなたのターン」＝turnOwner:'self' を満たす→通過するはず。
  const stackDuringGuestTurn = initStack(GUEST, e);
  const allEntriesGuestTurn = [...stackDuringGuestTurn.pendingTurn, ...stackDuringGuestTurn.pendingOpp];
  eq(has(allEntriesGuestTurn, 'WXK10-022-E1'), true, '相手ターン中の特殊召喚では turnOwner:self ゲートを通過する（原文どおり発火）');
});
test('Stage2 ON_PLAY field: any_ally triggerFilter(story:毒牙) 一致時のみ発火（WX06-021-E1）', () => {
  const guest = mkState({});
  const host = mkState({ signi: ['WX06-021', DOKUGA, null] });
  eq(has(cftEntries(trigCtx(HOST), 'ON_PLAY', DOKUGA, host, guest, HOST), 'WX06-021-E1'), true, '毒牙召喚で発火');
  const host2 = mkState({ signi: ['WX06-021', SIGNI, null] });
  eq(has(cftEntries(trigCtx(HOST), 'ON_PLAY', SIGNI, host2, guest, HOST), 'WX06-021-E1'), false, '非毒牙召喚は非発火');
});
test('Stage2 ON_BLOOM: self 開花シグニ自身＋場の any_ally が発火（WXK04-026-E2 / WXK05-021-E1）', () => {
  const guest = mkState({});
  const host1 = mkState({}); // self bloom（開花カード自身）
  eq(has(cblEntries(trigCtx(HOST), 'WXK04-026', host1, guest, HOST), 'WXK04-026-E2'), true, 'self開花で発火');
  const host2 = mkState({ signi: ['WXK05-021', null, null] }); // 場の any_ally が他カードの開花に反応
  eq(has(cblEntries(trigCtx(HOST), SIGNI, host2, guest, HOST), 'WXK05-021-E1'), true, 'any_ally開花で発火');
});

// ── Opusタスク12(x)/(vi-5)：usageLimit ガード欠落の回帰（続き104/99/100 で発見・続き135 Opus で修正）──
// 5コレクタ（Field/Bloom/Banish/PowerZero/LrigGrow）は《ターン1回/2回》の消費 effectId を返さず、呼び出し元も
// actions_done へ書き戻していなかった＝ガードが実質ノーガード（Field に至っては判定コードすら無かった）。
// 「消費IDを返すこと」＋「actions_done 済みなら再発火しないこと」の両方を固定する（修正前はいずれもFAIL）。
test('usageLimit collectFieldTriggers: any_ally《ターン1回》が消費IDを返し2体目の召喚では非発火（WX11-054・続き104）', () => {
  const guest = mkState({});
  // WX11-054-E1＝ON_PLAY any_ally / usageLimit once_per_turn。同一ターンに味方が2体出ても1回しか発火しない。
  const host = mkState({ signi: ['WX11-054', SIGNI, null] });
  const r1 = collectFieldTriggers(trigCtx(HOST), 'ON_PLAY', SIGNI, host, guest, HOST, { placedByEffect: true, placeSourceIsSigni: true });
  eq(has(r1.entries, 'WX11-054-E1'), true, '1体目で発火');
  eq(r1.usedHostIds.includes('WX11-054-E1'), true, '消費IDを usedHostIds で返す');
  eq(r1.usedGuestIds.length, 0, 'guest側は消費なし');
  // 呼び出し元が actions_done へ書き戻した後＝同一ターン内の2体目では非発火（従来は毎回発火＝過剰効果）
  const host2 = { ...mkState({ signi: ['WX11-054', SIGNI, null] }), actions_done: r1.usedHostIds };
  const r2 = collectFieldTriggers(trigCtx(HOST), 'ON_PLAY', SIGNI, host2, guest, HOST, { placedByEffect: true, placeSourceIsSigni: true });
  eq(has(r2.entries, 'WX11-054-E1'), false, '2体目は非発火');
});
test('usageLimit collectBanishTriggers: any_opp《ターン1回》が消費IDを返し2体目のバニッシュでは非発火（WXK03-027・続き100）', () => {
  // WXK03-027-E?＝ON_BANISH any_opp / usageLimit once_per_turn（host の watcher が相手シグニのバニッシュに反応）。
  const mk = (done: string[] = []) => ({ ...mkState({ signi: ['WXK03-027', null, null] }), actions_done: done });
  const guest = mkState({ signi: [SIGNI, null, null] });
  const r1 = collectBanishTriggers(trigCtx(HOST, HOST), SIGNI, GUEST, mk(), guest);
  const fid = r1.entries.find(e => e.cardNum === 'WXK03-027')?.effectId;
  eq(!!fid, true, '1体目で発火');
  eq(r1.usedHostIds.includes(fid!), true, '消費IDを usedHostIds で返す');
  const r2 = collectBanishTriggers(trigCtx(HOST, HOST), SIGNI, GUEST, mk(r1.usedHostIds), guest);
  eq(has(r2.entries, fid!), false, '書き戻し後の2体目は非発火');
});
test('usageLimit collectPowerZeroTriggers: 《ターン1回》の消費IDを返す（WX20-Re03・続き100）', () => {
  const host = mkState({ signi: ['WX20-Re03', null, null] }); const guest = mkState({ signi: [SIGNI, null, null] });
  const r = collectPowerZeroTriggers(trigCtx(HOST), SIGNI, GUEST, host, guest);
  eq(has(r.entries, 'WX20-Re03-E1'), true, '発火');
  eq(r.usedHostIds.includes('WX20-Re03-E1'), true, '消費IDを usedHostIds で返す（従来は返さず＝ノーガード）');
});
test('usageLimit collectLrigGrowTriggers: 《ターン1回》の消費IDを返し2回目のグロウでは非発火（WXDi-P05-010・続き132）', () => {
  // WXDi-P05-010＝ON_LRIG_GROW any_ally / usageLimit once_per_turn。ゲット・グロウ等で同一ターンに2回グロウしても1回だけ。
  const mk = (done: string[] = []) => ({ ...mkState({ signi: ['WXDi-P05-010', null, null] }), actions_done: done });
  const guest = mkState({});
  const r1 = collectLrigGrowTriggers(trigCtx(HOST, HOST), HOST, mk(), guest);
  const fid = r1.entries.find(e => e.cardNum === 'WXDi-P05-010')?.effectId;
  eq(!!fid, true, '1回目のグロウで発火');
  eq(r1.usedHostIds.includes(fid!), true, '消費IDを usedHostIds で返す');
  const r2 = collectLrigGrowTriggers(trigCtx(HOST, HOST), HOST, mk(r1.usedHostIds), guest);
  eq(has(r2.entries, fid!), false, '書き戻し後の2回目は非発火');
});

// Stage2⑪: 最後の collect = collectTurnTriggers（ターン/フェイズ境界）を pure 化→自動検証。
// ⚠元は WX05-021-E2 を正例にしていたが、そのカードの原文は「あなたの効果によって対戦相手のエナゾーンから
//   カード1枚がトラッシュに置かれたとき」＝ON_ENERGY_TO_TRASH であり、ON_TURN_END は parser の timing 語彙欠落に
//   よる誤フォールバックだった（続き76で是正）。テストが**バグのある encoding を正例にしていた**ので、原文が本当に
//   「あなたのターン終了時」の WX10-030-E1（羅石　イリスアゲート）へ差し替える。
test('Stage2 ON_TURN_END: self シグニが発火・timing 不一致は非発火（WX10-030-E1）', () => {
  const host = mkState({ signi: ['WX10-030', null, null] }); const guest = mkState({});
  const e = cttEntries(trigCtx(HOST, HOST), 'ON_TURN_END', host, guest);
  eq(has(e, 'WX10-030-E1'), true, 'ターン終了で発火');
  eq(e.find(x => x.effectId === 'WX10-030-E1')?.playerId, HOST, 'playerId=自分');
  eq(has(cttEntries(trigCtx(HOST, HOST), 'ON_TURN_START', host, guest), 'WX10-030-E1'), false, 'timing不一致は非発火');
});
test('ARTS_USED_THIS_TURN 条件: turn_arts_used で発火ゲート（WX25-P3-112-E1）', () => {
  // 「あなたのアタックフェイズ開始時、このターンにあなたがアーツを使用していた場合、…」＝ turn_arts_used が無ければ非発火
  const host = mkState({ signi: ['WX25-P3-112', null, null] }); const guest = mkState({});
  eq(has(cttEntries(trigCtx(HOST, HOST), 'ON_ATTACK_PHASE_START', host, guest), 'WX25-P3-112-E1'), false, 'アーツ未使用は非発火');
  const hostUsed = { ...host, turn_arts_used: true };
  eq(has(cttEntries(trigCtx(HOST, HOST), 'ON_ATTACK_PHASE_START', hostUsed, guest), 'WX25-P3-112-E1'), true, 'アーツ使用済みで発火');
});
test('SPELL_USED_THIS_TURN 条件: actions_done の USE_SPELL で発火ゲート（WX24-P2-053-E1・続き110）', () => {
  // 「あなたのアタックフェイズ開始時、このターンにあなたがスペルを使用していた場合、…」＝従来は条件が
  // 丸ごと脱落し無条件発火の過剰効果だった。判定源は handleUseSpell が積む actions_done の 'USE_SPELL'。
  const host = mkState({ signi: ['WX24-P2-053', null, null] }); const guest = mkState({});
  eq(has(cttEntries(trigCtx(HOST, HOST), 'ON_ATTACK_PHASE_START', host, guest), 'WX24-P2-053-E1'), false, 'スペル未使用は非発火');
  const hostUsed = { ...host, actions_done: ['USE_SPELL'] };
  eq(has(cttEntries(trigCtx(HOST, HOST), 'ON_ATTACK_PHASE_START', hostUsed, guest), 'WX24-P2-053-E1'), true, 'スペル使用済みで発火');
});
test('SPELL_USED_THIS_TURN 構造固定（WX25-P2-108=「代わりに」置換のCONDITIONAL化・WX25-P2-086=選択肢別条件・続き110）', () => {
  // WX25-P2-108: SEQUENCE両実行（-3000&-5000・2つ目owner:any）→ CONDITIONAL{then:-5000, else:-3000} 置換
  const s = JSON.stringify(effectsMap.get('WX25-P2-108') ?? []);
  ok(s.includes('"SPELL_USED_THIS_TURN"') && s.includes('"else"') && !s.includes('"owner":"any"'), `WX25-P2-108: CONDITIONAL置換のはず（実際 ${s.slice(0, 160)}）`);
  // WX25-P2-086: 選択肢①に黒＜電機＞条件・②にスペル使用条件（従来は両条件とも丸ごと脱落）
  const s2 = JSON.stringify(effectsMap.get('WX25-P2-086') ?? []);
  ok(s2.includes('"SPELL_USED_THIS_TURN"') && s2.includes('"story":"電機"'), `WX25-P2-086: 選択肢別条件のはず（実際 ${s2.slice(0, 160)}）`);
});
test('IS_MY_TURN化修正: 「そのカードが…の場合」→LAST_PROCESSED_MATCHES／盤面状態条件持ち上げ（続き143・タスク12(xxii)）', () => {
  // 「そのカードがレベル１のシグニの場合」＝直前に公開したデッキトップの参照（従来は IS_MY_TURN で常時真＝過剰実行）。
  const s1 = JSON.stringify(effectsMap.get('WXDi-P01-059') ?? []);
  ok(s1.includes('"LAST_PROCESSED_MATCHES"') && s1.includes('"level":1'),
     `WXDi-P01-059: LAST_PROCESSED_MATCHES(level1)のはず（実際 ${s1.slice(0, 200)}）`);
  // 「そのカードが＜宇宙＞のシグニの場合」＝story フィルタ。
  const s2 = JSON.stringify(effectsMap.get('WX24-P3-047') ?? []);
  ok(s2.includes('"LAST_PROCESSED_MATCHES"') && s2.includes('"story":"宇宙"'),
     `WX24-P3-047: LAST_PROCESSED_MATCHES(宇宙)のはず（実際 ${s2.slice(0, 200)}）`);
  // 「あなたのセンタールリグが＜エルドラ＞の場合」＝前段の記録に依存しない盤面状態条件（LRIG_STORY 持ち上げ）。
  const s3 = JSON.stringify(effectsMap.get('WX12-014') ?? []);
  ok(s3.includes('"LRIG_STORY"') && s3.includes('"story":"エルドラ"'),
     `WX12-014: LRIG_STORY(エルドラ)のはず（実際 ${s3.slice(0, 200)}）`);
  // 「このシグニのパワーが15000以上の場合」＝SELF_POWER_GTE 持ち上げ。
  const s4 = JSON.stringify(effectsMap.get('WX26-CP1-066') ?? []);
  ok(s4.includes('"SELF_POWER_GTE"') && s4.includes('15000'),
     `WX26-CP1-066: SELF_POWER_GTE(15000)のはず（実際 ${s4.slice(0, 200)}）`);
});
test('Stage2 ON_TURN_START: any_opp シグニが対戦相手のターン開始時に発火（WXDi-P05-039-E1）', () => {
  // 原文「対戦相手のターン開始時、…」＝triggerScope:any_opp。ホストのターン開始＝WXDi-P05-039 を持つ
  // ゲスト視点では「対戦相手のターン開始時」＝相手フィールド any_opp 分岐が発火。
  const host = mkState({}); const guest = mkState({ signi: ['WXDi-P05-039', null, null] });
  const e = cttEntries(trigCtx(HOST, HOST), 'ON_TURN_START', host, guest);
  eq(has(e, 'WXDi-P05-039-E1'), true, '対戦相手のターン開始時に発火');
  // ゲスト自身のターン開始（自ターン）では any_opp ゲートで非発火。
  eq(has(cttEntries(trigCtx(GUEST, GUEST), 'ON_TURN_START', guest, host), 'WXDi-P05-039-E1'), false, '自ターンは非発火');
});
test('Stage2 ON_TURN_START: ルリグの自イベントが発火（WX20-001-E1）', () => {
  const host = mkState({}); host.field.lrig = ['WX20-001']; const guest = mkState({});
  eq(has(cttEntries(trigCtx(HOST, HOST), 'ON_TURN_START', host, guest), 'WX20-001-E1'), true, 'ルリグ発火');
});
test('collectTurnTriggers usageLimit: WX25-CP1-042-E2《ターン1回》は同一ターン2回目を発火しない（タスク12(xvii)）', () => {
  // ON_LRIG_ATTACK_STEP_START once_per_turn の LRIG 効果。1回目は発火＋usedHostIdsに消費記録、
  // actions_done 記録済みの2回目は非発火（フェイズ境界を跨いだ再発火を防ぐ）。
  const host = mkState({}); host.field.lrig = ['WX25-CP1-042']; const guest = mkState({});
  const r1 = collectTurnTriggers(trigCtx(HOST, HOST), 'ON_LRIG_ATTACK_STEP_START', host, guest);
  ok(r1.entries.some(e => e.effectId === 'WX25-CP1-042-E2'), '1回目は発火');
  ok(r1.usedHostIds.includes('WX25-CP1-042-E2'), 'usedHostIdsに消費記録');
  const host2: PlayerState = { ...host, actions_done: [...(host.actions_done ?? []), 'WX25-CP1-042-E2'] };
  const r2 = collectTurnTriggers(trigCtx(HOST, HOST), 'ON_LRIG_ATTACK_STEP_START', host2, guest);
  ok(!r2.entries.some(e => e.effectId === 'WX25-CP1-042-E2'), '2回目（actions_done記録済み）は非発火');
});

// Stage2⑫: 盤面差分 detect*/count*（boardDiff.ts）を pure 化→自動検証。
test('Stage2 boardDiff detectBanishedSigni: 場→エナ移動を検出', () => {
  const before = mkState({ signi: ['cardA', null, null] });
  const after = mkState({}); after.energy = [...after.energy, 'cardA'];
  eq(detectBanishedSigni(before, after).includes('cardA'), true, 'banish検出');
});
test('Stage2 boardDiff detectTrashedSigni: 場→トラッシュ移動を検出（エナ送りは除外）', () => {
  const before = mkState({ signi: ['cardB', null, null] });
  const after = mkState({}); after.trash = [...after.trash, 'cardB'];
  eq(detectTrashedSigni(before, after).includes('cardB'), true, 'trash検出');
  const after2 = mkState({}); after2.energy = [...after2.energy, 'cardB'];
  eq(detectTrashedSigni(before, after2).includes('cardB'), false, 'エナ送りは非検出');
});
test('Stage2 boardDiff detectDeckTrashed: デッキ→トラッシュ移動を検出', () => {
  const before = mkState({}); before.deck = ['cardC', 'd1', 'd2']; before.trash = [];
  const after = mkState({}); after.deck = ['d1', 'd2']; after.trash = ['cardC'];
  eq(detectDeckTrashed(before, after).includes('cardC'), true, 'デッキミル検出');
});
test('Stage2 boardDiff countRefresh: refresh_count_this_turn の delta', () => {
  const before = mkState({}); before.refresh_count_this_turn = 0;
  const after = mkState({}); after.refresh_count_this_turn = 2;
  eq(countRefresh(before, after), 2, 'refresh差');
});
test('Stage2 boardDiff detectPowerDecrease: 新規負 delta の絶対値合計', () => {
  const before = mkState({}); before.temp_power_mods = [];
  const after = mkState({}); after.temp_power_mods = [{ delta: -3000 }, { delta: 1000 }] as never;
  eq(detectPowerDecrease(before, after), 3000, '減少量3000');
});
test('Stage2 boardDiff detectNewlyFrozen: signi_frozen false→true を検出', () => {
  const before = mkState({ signi: ['cardF', null, null] }); before.field.signi_frozen = [false, false, false];
  const after = mkState({ signi: ['cardF', null, null] }); after.field.signi_frozen = [true, false, false];
  eq(detectNewlyFrozen(before, after).includes('cardF'), true, '凍結検出');
});
test('Stage2 boardDiff countMovedToDeck: fromTrashOnly はトラッシュ起源のみ計上', () => {
  const before = mkState({}); before.trash = ['cardG']; before.deck = ['d1'];
  const after = mkState({}); after.deck = ['cardG', 'd1']; after.trash = [];
  eq(countMovedToDeck(before, after, true), 1, 'トラッシュ起源で1');
  const before2 = mkState({}); before2.trash = []; before2.deck = ['d1'];
  const after2 = mkState({}); after2.deck = ['cardH', 'd1'];
  eq(countMovedToDeck(before2, after2, true), 0, '非トラッシュ起源は0');
  eq(countMovedToDeck(before2, after2, false), 1, 'fromTrashOnly=falseなら1');
});
test('Stage2 boardDiff countCharmsToTrash: チャームのトラッシュ送りを計数', () => {
  const before = mkState({}); before.field.signi_charms = ['charmA', null, null];
  const after = mkState({}); after.field.signi_charms = [null, null, null]; after.trash = ['charmA'];
  eq(countCharmsToTrash(before, after), 1, 'チャーム1枚');
});

// Stage2⑬: effect_stack 整列（effectStack.ts・既存 pure モジュール）の golden 自動検証。
const mkEntry = (effectId: string, playerId: string, turnOwner?: 'self' | 'opponent'): StackEntry => ({
  id: effectId, playerId, cardNum: effectId, effectId, label: effectId,
  effect: {
    effectId, effectType: 'AUTO', action: { type: 'STUB', id: 'x' }, duration: 'INSTANT', mandatory: true,
    ...(turnOwner ? { triggerCondition: { turnOwner } } : {}),
  } as CardEffect,
}) as StackEntry;
test('Stage2 effectStack initStack: ターンプレイヤー→相手の順でキュー構築', () => {
  const s = initStack(HOST, [mkEntry('o1', GUEST), mkEntry('t1', HOST)]); // 相手を先に渡しても
  eq(s.queue.map(x => x.effectId).join(','), 't1,o1', 'ターン→相手順');
});
test('Stage2 effectStack turnGate: self/opponent ゲートで投入前に弾く', () => {
  // turnOwner:self の GUEST 効果は HOST ターンでは弾かれる／opponent は通る
  eq(initStack(HOST, [mkEntry('g1', GUEST, 'self')]).queue.length, 0, 'self gateで除外');
  eq(initStack(HOST, [mkEntry('g2', GUEST, 'opponent')]).queue.map(x => x.effectId).join(','), 'g2', 'opponent gateで通過');
});
test('Stage2 effectStack confirmTurnOrder: 複数自効果は確定まで保留→希望順で確定', () => {
  const s = initStack(HOST, [mkEntry('a', HOST), mkEntry('b', HOST)]);
  eq(s.orderTurnDone, false, '2件は未確定');
  eq(s.queue.length, 0, '確定までキュー空');
  eq(confirmTurnOrder(s, ['b', 'a']).queue.map(x => x.effectId).join(','), 'b,a', '希望順で確定');
});
test('Stage2 effectStack pushToStack: 解決中の追加はキュー末尾に追記', () => {
  const s = initStack(HOST, [mkEntry('x', HOST)]); // 確定済み・queue=[x]
  eq(pushToStack(s, [mkEntry('y', HOST)]).queue.map(e => e.effectId).join(','), 'x,y', 'キュー末尾追記');
});
test('Stage2 effectStack shiftQueue/isStackDone: 先頭取り出しと完了判定', () => {
  const { entry, newStack } = shiftQueue(initStack(HOST, [mkEntry('z', HOST)]));
  eq(entry?.effectId, 'z', '先頭取り出し');
  eq(isStackDone(newStack), true, '取り出し後は完了');
});

// C1: ON_ALLY_PLAY_OR_OPP_HAND_DISCARD（OR複合・WXDi-P11-064）配線の発火条件を自動検証。
const TENSHI = findCard(c => isSigni(c) && (c.CardClass ?? '').includes('天使') && c.CardNum !== 'WXDi-P11-064');
test('C1 ON_ALLY_PLAY_OR_OPP_HAND_DISCARD: play枝 他の天使場出しで発火（WXDi-P11-064-E1）', () => {
  const host = mkState({ signi: ['WXDi-P11-064', null, null] });
  eq(has(collectAllyPlayOrOppDiscardTriggers(trigCtx(HOST), HOST, host, [TENSHI], 0).entries, 'WXDi-P11-064-E1'), true, '天使場出しで発火');
  eq(has(collectAllyPlayOrOppDiscardTriggers(trigCtx(HOST), HOST, host, [SIGNI], 0).entries, 'WXDi-P11-064-E1'), false, '非天使場出しは非発火');
});
test('C1 ON_ALLY_PLAY_OR_OPP_HAND_DISCARD: discard枝・自ターン限定・once_per_turn（WXDi-P11-064-E1）', () => {
  const host = mkState({ signi: ['WXDi-P11-064', null, null] });
  eq(has(collectAllyPlayOrOppDiscardTriggers(trigCtx(HOST), HOST, host, [], 1).entries, 'WXDi-P11-064-E1'), true, '相手手札捨てで発火');
  eq(has(collectAllyPlayOrOppDiscardTriggers(trigCtx(GUEST), HOST, host, [], 1).entries, 'WXDi-P11-064-E1'), false, '相手ターンは非発火');
  host.actions_done = ['WXDi-P11-064-E1'];
  eq(has(collectAllyPlayOrOppDiscardTriggers(trigCtx(HOST), HOST, host, [], 1).entries, 'WXDi-P11-064-E1'), false, 'once_per_turn');
});

// 改造素材 foundation Step1: 'アーツ/クラフト'8枚がプレイ可能化＝ACTIVATED効果がクラッシュ/ハングせず解決するか検証。
test("'アーツ/クラフト'8枚: ACTIVATED効果が解決（クラッシュ/ハングなし）", () => {
  const craftIds = ['WXK01-TK-01A', 'WXK03-TK-01B', 'WXK09-TK-01A', 'WX25-P1-TK1', 'WX25-P1-TK2', 'WX25-P1-TK3', 'WX25-P1-TK4', 'WX25-P1-TK5'];
  for (const id of craftIds) {
    eq(cardMap.get(id)?.Type, 'アーツ/クラフト', `${id} は アーツ/クラフト`);
    const act = (effectsMap.get(id) ?? []).find(e => e.effectType === 'ACTIVATED');
    eq(!!act, true, `${id} に ACTIVATED効果あり`);
    if (!act) continue;
    let ok = true;
    try { run(act.action as EffectAction, mkCtx({ signi: [SIGNI, null, null] }, { signi: [SIGNI, null, null] }, id)); }
    catch { ok = false; }
    eq(ok, true, `${id} 解決でクラッシュ/ハングしない`);
  }
});

// 改造素材機構 Step3a: ON_MATERIAL_USED の materialUsedByPlayer 変種（あなたが改造素材を使用したとき）発火を検証。
test('改造素材 Step3a ON_MATERIAL_USED(materialUsedByPlayer): 使用者の場シグニが発火（WXK09-047-E2/049-E1）', () => {
  const host = mkState({ signi: ['WXK09-047', 'WXK09-049', null] });
  const e = collectMaterialUsedByPlayerTriggers(trigCtx(HOST, HOST), HOST, host).entries;
  eq(has(e, 'WXK09-047-E2'), true, '047-E2 発火');
  eq(has(e, 'WXK09-049-E1'), true, '049-E1 発火');
  // self/any_ally（materialUsedByPlayer でない）変種は対象シグニ依存＝この経路では発火しない
  eq(has(e, 'WXK09-047-E1'), false, '047-E1（self・対象依存）は非発火');
});

// 改造素材機構 Step3b: ON_MATERIAL_USED の self/any_ally 変種＋MARK_MATERIAL_TARGET を検証。
test('改造素材 Step3b collectMaterialUsedOnSigniTriggers: self/any_ally 変種', () => {
  const host = mkState({ signi: ['WXK09-047', null, null] });
  eq(has(collectMaterialUsedOnSigniTriggers(trigCtx(HOST), ['WXK09-047'], HOST, host).entries, 'WXK09-047-E1'), true, 'self発火（対象が自身）');
  eq(has(collectMaterialUsedOnSigniTriggers(trigCtx(HOST), [SIGNI], HOST, host).entries, 'WXK09-047-E1'), false, 'self非対象は非発火');
  const host2 = mkState({ signi: ['WXK09-084', null, null] });
  eq(has(collectMaterialUsedOnSigniTriggers(trigCtx(HOST), [SIGNI], HOST, host2).entries, 'WXK09-084-E1'), true, 'any_ally発火（他の味方に使用）');
});
test('改造素材 Step2 MARK_MATERIAL_TARGET: lastProcessed を material_used_targets に記録', () => {
  const ctx = { ...mkCtx({ signi: [SIGNI, null, null] }, {}, SIGNI), lastProcessedCards: [SIGNI] } as ExecCtx;
  const r = run({ type: 'STUB', id: 'MARK_MATERIAL_TARGET' } as EffectAction, ctx);
  eq((r.ownerState.material_used_targets ?? []).includes(SIGNI), true, 'MARK が対象を記録');
});

// C1: ON_SIGNI_BANISH_OPPONENT_BY_EFFECT（WX07-036）配線の発火条件を検証。
test('C1 ON_SIGNI_BANISH_OPPONENT_BY_EFFECT: ウェポン発生源で発火・非ウェポンは非発火（WX07-036-E1）', () => {
  const host = mkState({ signi: ['WX07-036', null, null] });
  // banisher が ＜ウェポン＞シグニ（WX01-039）→ triggerFilter(story:ウェポン) 一致で発火
  eq(has(collectBanishOppByEffectTriggers(trigCtx(HOST), 'WX01-039', HOST, host).entries, 'WX07-036-E1'), true, 'ウェポン発生源で発火');
  // banisher が 非ウェポン（SIGNI）→ 非発火
  eq(has(collectBanishOppByEffectTriggers(trigCtx(HOST), SIGNI, HOST, host).entries, 'WX07-036-E1'), false, '非ウェポン発生源は非発火');
});

// C1: ON_LRIG_UNDER_MOVED（WXDi-P04-042）配線を検証＝detector＋collector（自ターン限定）。
test('C1 ON_LRIG_UNDER_MOVED: ルリグ下からの移動を検出＋自ターン限定で発火（WXDi-P04-042-E1）', () => {
  // detector: lrig=[under, top]→[top] で under が離脱＝1
  const before = mkState({}); before.field.lrig = ['lrUnder', 'lrTop'];
  const after = mkState({}); after.field.lrig = ['lrTop'];
  eq(countLrigUnderMoved(before, after), 1, 'under移動を検出');
  eq(countLrigUnderMoved(after, after), 0, '変化なしは0');
  // collector: WXDi-P04-042 を場に、自ターンで発火・相手ターンは非発火
  const host = mkState({ signi: ['WXDi-P04-042', null, null] });
  eq(has(collectLrigUnderMovedTriggers(trigCtx(HOST, HOST), HOST, host).entries, 'WXDi-P04-042-E1'), true, '自ターンで発火');
  eq(has(collectLrigUnderMovedTriggers(trigCtx(GUEST, HOST), HOST, host).entries, 'WXDi-P04-042-E1'), false, '相手ターンは非発火');
});

// C1: ON_DECK_SHUFFLED（PR-470A）配線を検証＝detector（deck_shuffled_count delta）＋collector。
test('C1 ON_DECK_SHUFFLED: シャッフル検出＋self 発火（PR-470A-E1）', () => {
  const before = mkState({}); before.deck_shuffled_count = 0;
  const after = mkState({}); after.deck_shuffled_count = 1;
  eq(detectDeckShuffled(before, after), true, 'シャッフル検出');
  eq(detectDeckShuffled(after, after), false, '変化なしは非検出');
  const host = mkState({ signi: ['PR-470A', null, null] });
  eq(has(collectDeckShuffledTriggers(trigCtx(HOST), HOST, host).entries, 'PR-470A-E1'), true, 'self発火');
});

// C1: ON_KEYWORD_GAINED（WXDi-P04-035）配線を検証＝detector（keyword_grants 差分・対象3種に限定）＋collector（他シグニ限定）。
test('C1 ON_KEYWORD_GAINED: 対象キーワード付与検出＋他シグニで発火・自己付与は非発火（WXDi-P04-035-E1）', () => {
  // detector: 別シグニにダブルクラッシュが新規付与
  const before = mkState({ signi: ['WXDi-P04-035', 'WX07-036', null] });
  const after = mkState({ signi: ['WXDi-P04-035', 'WX07-036', null] });
  after.keyword_grants = { 'WX07-036': ['ダブルクラッシュ'] };
  const gains = detectKeywordGained(before, after);
  eq(gains.some(g => g.cardNum === 'WX07-036' && g.keyword === 'ダブルクラッシュ'), true, '新規付与を検出');
  eq(detectKeywordGained(after, after).length, 0, '変化なしは0');
  // 対象外キーワード（例: シャドウ）は検出しない
  const afterShadow = mkState({ signi: ['WXDi-P04-035', 'WX07-036', null] });
  afterShadow.keyword_grants = { 'WX07-036': ['シャドウ'] };
  eq(detectKeywordGained(before, afterShadow).length, 0, '対象外キーワードは非検出');
  // collector: watcher 以外のシグニが得たら発火（triggeringKeyword を積む）。自身が得た場合は非発火（「他のシグニ」）。
  const host = mkState({ signi: ['WXDi-P04-035', 'WX07-036', null] });
  const fired = collectKeywordGainedTriggers(trigCtx(HOST), gains, HOST, host).entries;
  eq(has(fired, 'WXDi-P04-035-E1'), true, '他シグニ付与で発火');
  eq(fired.find(e => e.effectId === 'WXDi-P04-035-E1')?.triggeringKeyword, 'ダブルクラッシュ', '得たキーワードを triggeringKeyword に保持');
  const selfGain = [{ cardNum: 'WXDi-P04-035', keyword: 'ダブルクラッシュ' }];
  eq(has(collectKeywordGainedTriggers(trigCtx(HOST), selfGain, HOST, host).entries, 'WXDi-P04-035-E1'), false, '自己付与は非発火');
});

// OPTIONAL_TRASH_ENERGY_CLASS: 「エナゾーンから＜X＞のカードN枚をトラッシュ」句の N 枚を支払う（multi-card 札）。
// 旧実装は枚数を「N枚を対象」から取り 1枚しか払わなかった（zerom 2026-06-29 修正）。source の EffectText から
// クラス（ブルアカ）と枚数（3）を解釈するため、実カード WXDi-CP02-051（「＜ブルアカ＞のカード３枚をトラッシュ」）を source にする。
test('OPTIONAL_TRASH_ENERGY_CLASS: トラッシュ句のN枚を支払う(カード3枚)', () => {
  const blues = [...cardMap.values()].filter(c => isSigni(c) && (c.CardClass ?? '').includes('ブルアカ')).map(c => c.CardNum);
  ok(blues.length >= 3, `ブルアカ3種以上(${blues.length})`);
  const SOURCE = 'WXDi-CP02-051';
  ok((cardMap.get(SOURCE)?.EffectText ?? '').includes('ブルアカ'), 'source原文にブルアカ');
  const oppSigni = fresh();
  const ctx = mkCtx({}, { signi: [oppSigni, null, null] }, SOURCE);
  ctx.ownerState.energy = [blues[0], blues[1], blues[2]];
  const eff = { type: 'SEQUENCE', steps: [
    { type: 'STUB', id: 'OPTIONAL_TRASH_ENERGY_CLASS' },
    { type: 'CONDITIONAL', condition: { type: 'IS_MY_TURN' },
      then: { type: 'BANISH', target: { type: 'SIGNI', owner: 'opponent', count: 1, filter: { cardType: 'シグニ' } } } },
  ] } as unknown as EffectAction;
  const r = run(eff, ctx);
  eq(r.ownerState.energy.length, 0, 'エナ3枚全部がトラッシュへ');
  eq(r.otherState.field.signi[0], null, '相手シグニがバニッシュ');
});

// SIGNI_GRANT_CHOSEN_ABILITY: WXK09-050【出】。「表記されているパワーよりパワーの高いあなたの＜電機＞のシグニ1体を
// 対象とし、ターン終了時まで、それは選んだ能力を得る（①ダウンしない/②手札に戻らない）」。CHOOSE(2)→対象選択→GRANT_PROTECTION 付与。
test('SIGNI_GRANT_CHOSEN_ABILITY: 電機(現在>表記)にダウン保護を付与', () => {
  const DENKI = findCard(c => isSigni(c) && (c.CardClass ?? '').includes('電機') && parseInt(c.Power || '0', 10) > 0);
  const printed = parseInt(cardMap.get(DENKI)!.Power || '0', 10);
  const ctx = mkCtx({ signi: [DENKI, null, null] }, {});
  (ctx as { effectivePowers?: Map<string, number> }).effectivePowers = new Map([[DENKI, printed + 2000]]);
  const r = run({ type: 'STUB', id: 'SIGNI_GRANT_CHOSEN_ABILITY' } as unknown as EffectAction, ctx);
  const granted = (r.ownerState as { granted_effects?: Record<string, CardEffect[]> }).granted_effects?.[DENKI] ?? [];
  ok(granted.length >= 1, '保護が付与されていない');
  const gp = granted[0].action as { type: string; from?: string[] };
  eq(gp.type, 'GRANT_PROTECTION', 'action型');
  ok(Array.isArray(gp.from) && gp.from.includes('DOWN'), 'DOWN保護でない');
});
// 同上・対象不適格（表記=現在パワー＝バフ無し）なら付与なし
test('SIGNI_GRANT_CHOSEN_ABILITY: 表記=現在なら対象外＝付与なし', () => {
  const DENKI = findCard(c => isSigni(c) && (c.CardClass ?? '').includes('電機') && parseInt(c.Power || '0', 10) > 0);
  const printed = parseInt(cardMap.get(DENKI)!.Power || '0', 10);
  const ctx = mkCtx({ signi: [DENKI, null, null] }, {});
  (ctx as { effectivePowers?: Map<string, number> }).effectivePowers = new Map([[DENKI, printed]]);
  const r = run({ type: 'STUB', id: 'SIGNI_GRANT_CHOSEN_ABILITY' } as unknown as EffectAction, ctx);
  const granted = (r.ownerState as { granted_effects?: Record<string, CardEffect[]> }).granted_effects?.[DENKI] ?? [];
  eq(granted.length, 0, '対象外なのに付与された');
});

// BANISH_ATTACKER_IF_WEAKER_THAN_FRONT: WD07-012【自】。「対戦相手のシグニがアタックしたとき、そのシグニのパワーが
// その正面のシグニのパワーより低い場合、アタックしたそのシグニをバニッシュする」。triggeringCardNum＝アタッカー。
test('BANISH_ATTACKER_IF_WEAKER_THAN_FRONT: 正面より低パワー→バニッシュ', () => {
  const ATK = SIGNI_P3000, FRONT = SIGNI_P12000;
  const ctx = mkCtx({ signi: [null, null, FRONT] }, { signi: [ATK, null, null] }, 'WD07-012');
  (ctx as { triggeringCardNum?: string }).triggeringCardNum = ATK;
  const r = run({ type: 'STUB', id: 'BANISH_ATTACKER_IF_WEAKER_THAN_FRONT' } as unknown as EffectAction, ctx);
  eq(r.otherState.field.signi[0], null, 'アタッカーがバニッシュされていない');
});
test('BANISH_ATTACKER_IF_WEAKER_THAN_FRONT: 正面以上なら残る', () => {
  const ATK = SIGNI_P12000, FRONT = SIGNI_P3000;
  const ctx = mkCtx({ signi: [null, null, FRONT] }, { signi: [ATK, null, null] }, 'WD07-012');
  (ctx as { triggeringCardNum?: string }).triggeringCardNum = ATK;
  const r = run({ type: 'STUB', id: 'BANISH_ATTACKER_IF_WEAKER_THAN_FRONT' } as unknown as EffectAction, ctx);
  ok(r.otherState.field.signi[0]?.at(-1) === ATK, 'アタッカーが残っていない');
});

// CONDITIONAL_GROW_AND_KEY_DISABLE: WXK02-029 ビカム・ユー①。「自センターが相手センターのレベル以下なら
// グロウ（コスト支払い）。ターン終了時まで、あなたのすべてのキーは能力を失う。」条件付きグロウ＋keys_abilities_disabled。
const LRIG_BY_LV = (lv: string) => findCard(c => c.Type === 'ルリグ' && c.Level === lv);
test('CONDITIONAL_GROW_AND_KEY_DISABLE: 自Lv≤相手→グロウ＋キー能力喪失', () => {
  const MYL = LRIG_BY_LV('1'), OPPL = LRIG_BY_LV('3'), NEXT = LRIG_BY_LV('2');
  const ctx = mkCtx({}, {});
  ctx.ownerState.field.lrig = [MYL];
  (ctx.ownerState as { lrig_deck: string[] }).lrig_deck = [NEXT];
  ctx.otherState.field.lrig = [OPPL];
  const r = run({ type: 'STUB', id: 'CONDITIONAL_GROW_AND_KEY_DISABLE' } as unknown as EffectAction, ctx);
  eq(r.ownerState.field.lrig.length, 2, 'グロウしていない');
  eq(r.ownerState.field.lrig.at(-1), NEXT, '次ルリグへグロウしていない');
  eq((r.ownerState as { keys_abilities_disabled?: boolean }).keys_abilities_disabled, true, 'キー能力喪失フラグ');
});
test('CONDITIONAL_GROW_AND_KEY_DISABLE: 自Lv>相手→グロウせずキー能力喪失のみ', () => {
  const MYL = LRIG_BY_LV('3'), OPPL = LRIG_BY_LV('1'), NEXT = LRIG_BY_LV('4');
  const ctx = mkCtx({}, {});
  ctx.ownerState.field.lrig = [MYL];
  (ctx.ownerState as { lrig_deck: string[] }).lrig_deck = [NEXT];
  ctx.otherState.field.lrig = [OPPL];
  const r = run({ type: 'STUB', id: 'CONDITIONAL_GROW_AND_KEY_DISABLE' } as unknown as EffectAction, ctx);
  eq(r.ownerState.field.lrig.length, 1, '条件不成立なのにグロウした');
  eq((r.ownerState as { keys_abilities_disabled?: boolean }).keys_abilities_disabled, true, 'キー能力喪失フラグ');
});

// この方法で＜X＞のシグニがN枚トラッシュに置かれた場合＝MILL(DECK_CARD)→lastProcessedCards→TRASHED_STORY_COUNT_GTE。
// IS_MY_TURN 誤変換系統（WX20-075 等）の回帰資産。デッキトップ3枚をトラッシュし、悪魔3枚のときだけ then が発火する。
{
  const DEMON = findCard(c => isSigni(c) && (c.CardClass ?? '').includes('悪魔'));
  const NONDEMON = findCard(c => isSigni(c) && !!c.CardClass && !(c.CardClass ?? '').includes('悪魔'));
  const millThenDraw = { type: 'SEQUENCE', steps: [
    { type: 'TRASH', target: { type: 'DECK_CARD', owner: 'self', count: 3 } },
    { type: 'CONDITIONAL', condition: { type: 'TRASHED_STORY_COUNT_GTE', story: '悪魔', count: 3 }, then: { type: 'DRAW', owner: 'self', count: 1 } },
  ] } as unknown as EffectAction;
  test('TRASHED_STORY_COUNT_GTE: MILL3で悪魔3枚→then発火（WX20-075）', () => {
    const ctx = mkCtx({ deckTop: [DEMON, DEMON, DEMON], hand: 5 }, {});
    const r = run(millThenDraw, ctx);
    eq(r.ownerState.hand.length, 6, '悪魔3枚→ドロー発火');
  });
  test('TRASHED_STORY_COUNT_GTE: MILL3で悪魔0枚→then不発（無条件発火バグの回帰）', () => {
    const ctx = mkCtx({ deckTop: [NONDEMON, NONDEMON, NONDEMON], hand: 5 }, {});
    const r = run(millThenDraw, ctx);
    eq(r.ownerState.hand.length, 5, '悪魔0枚→ドローしない');
  });
  // LAST_PROCESSED_ALL_MATCH: この方法で処理したカードが**すべて**フィルタ一致（WXDi-P05-042/WXK09-097）。
  // ≥N一致（TRASHED_STORY_COUNT_GTE/LAST_PROCESSED_MATCHES）と異なり、1枚でも外れると不発。空集合も不発。
  const millThenDrawAll = { type: 'SEQUENCE', steps: [
    { type: 'TRASH', target: { type: 'DECK_CARD', owner: 'self', count: 3 } },
    { type: 'CONDITIONAL', condition: { type: 'LAST_PROCESSED_ALL_MATCH', filter: { cardType: 'シグニ', story: '悪魔' } }, then: { type: 'DRAW', owner: 'self', count: 1 } },
  ] } as unknown as EffectAction;
  test('LAST_PROCESSED_ALL_MATCH: MILL3で全て悪魔→then発火', () => {
    const ctx = mkCtx({ deckTop: [DEMON, DEMON, DEMON], hand: 5 }, {});
    eq(run(millThenDrawAll, ctx).ownerState.hand.length, 6, '全て悪魔→ドロー発火');
  });
  test('LAST_PROCESSED_ALL_MATCH: MILL3で1枚だけ非悪魔→then不発（全一致でないと発火しない）', () => {
    const ctx = mkCtx({ deckTop: [DEMON, DEMON, NONDEMON], hand: 5 }, {});
    eq(run(millThenDrawAll, ctx).ownerState.hand.length, 5, '1枚外れ→ドローしない');
  });
  // LOOK_AND_REORDER（公開）も閲覧カードを lastProcessedCards に記録する（resumeLookAndReorder）。
  // 「この方法で公開されたN枚/すべて〜の場合」（WX12-Re10/WXDi-P07-064）が参照する。
  const lookThenAll = { type: 'SEQUENCE', steps: [
    { type: 'LOOK_AND_REORDER', source: { location: 'deck', owner: 'self' }, count: 3, private: false, reorder: false, canTrash: false, destination: { location: 'deck', owner: 'self', position: 'top' } },
    { type: 'CONDITIONAL', condition: { type: 'LAST_PROCESSED_ALL_MATCH', filter: { cardType: 'シグニ', story: '悪魔' } }, then: { type: 'DRAW', owner: 'self', count: 1 } },
  ] } as unknown as EffectAction;
  test('LOOK_AND_REORDER 記録: 公開3枚が全て悪魔→ALL_MATCH発火', () => {
    const ctx = mkCtx({ deckTop: [DEMON, DEMON, DEMON], hand: 5 }, {});
    eq(run(lookThenAll, ctx).ownerState.hand.length, 6, '全て悪魔→ドロー発火');
  });
  test('LOOK_AND_REORDER 記録: 公開3枚に非悪魔混在→ALL_MATCH不発', () => {
    const ctx = mkCtx({ deckTop: [DEMON, NONDEMON, DEMON], hand: 5 }, {});
    eq(run(lookThenAll, ctx).ownerState.hand.length, 5, '1枚外れ→ドローしない');
  });
}

// GRANT_LRIG_ABILITY: abilities を lrig_granted_auto_effects へ追加。permanent（「このゲームの間」＝WXDi-P06-004等）は
// 各能力に permanentGrant が刻まれ、ターン境界リセット（filter e.permanentGrant）で生き残る。
test('GRANT_LRIG_ABILITY: 付与能力が登録され permanent は permanentGrant を刻む', () => {
  const subEff = {
    effectId: 'TEST-sub-E1', effectType: 'ACTIVATED', timing: ['MAIN'], cost: { exceed: 4 },
    action: { type: 'DRAW', owner: 'self', count: 1 }, duration: 'INSTANT', mandatory: false,
  } as unknown as CardEffect;
  // ターン終了時まで型（permanent なし）
  const ctx1 = mkCtx({}, {});
  const r1 = run({ type: 'GRANT_LRIG_ABILITY', abilities: [subEff], rawText: '【起】…' } as unknown as EffectAction, ctx1);
  const g1 = (r1.ownerState as { lrig_granted_auto_effects?: CardEffect[] }).lrig_granted_auto_effects ?? [];
  eq(g1.length, 1, '付与能力が登録されていない');
  eq((g1[0] as { permanentGrant?: boolean }).permanentGrant, undefined, '非permanentにpermanentGrantが付いた');
  // このゲームの間型（permanent:true）
  const ctx2 = mkCtx({}, {});
  const r2 = run({ type: 'GRANT_LRIG_ABILITY', abilities: [subEff], rawText: '【起】…', permanent: true } as unknown as EffectAction, ctx2);
  const g2 = (r2.ownerState as { lrig_granted_auto_effects?: CardEffect[] }).lrig_granted_auto_effects ?? [];
  eq(g2.length, 1, 'permanent付与能力が登録されていない');
  eq((g2[0] as { permanentGrant?: boolean }).permanentGrant, true, 'permanentGrantが刻まれていない');
  // ターン境界リセット相当の filter で permanent だけ残ることを確認
  const after = g2.concat(g1).filter(e => (e as { permanentGrant?: boolean }).permanentGrant);
  eq(after.length, 1, 'ターン境界フィルタでpermanentのみ残っていない');
});

// タスク12(xxiii): 「センタールリグ１体を対象とし、ターン終了時まで、それは以下の能力を得る。『【起】エクシード…』」
// （WX25-P1-001/003/005/007/009）。従来は付与構造が丸ごと欠落し、3能力をコストゲートも選択も無く
// 即時連続実行する過剰実行バグだった＝GRANT_LRIG_ABILITY（targetedCenter）＋ACTIVATED×3（exceedコスト）へ固定。
test('引用付与（対象形式）: WX25-P1-001 が RECOLLECT_GATE + GRANT_LRIG_ABILITY(【起】×3・エクシード1/1/2) にパースされる', () => {
  const parsed = parseCardEffects(cardMap.get('WX25-P1-001')!);
  const act = parsed.find(e => e.effectId === 'WX25-P1-001-E1')?.action as import('../src/types/effects').SequenceAction;
  eq(act?.type, 'SEQUENCE', '外形');
  eq(act?.steps?.[0]?.type, 'RECOLLECT_GATE', 'リコレクトゲート');
  const gla = act?.steps?.[1] as import('../src/types/effects').GrantLrigAbilityAction;
  eq(gla?.type, 'GRANT_LRIG_ABILITY', '付与アクション');
  eq(gla?.targetedCenter, true, 'targetedCenter 刻印');
  eq(gla?.abilities?.length, 3, '付与能力3本');
  eq(gla?.abilities?.every(a => a.effectType === 'ACTIVATED' && a.timing?.[0] === 'MAIN'), true, '全て【起】MAIN');
  eq(gla?.abilities?.map(a => a.cost?.exceed).join(','), '1,1,2', 'エクシードコスト1/1/2');
  // 内側1本目は「5枚見て2枚まで手札・残りをデッキ下」＝REVEAL_AND_PICK（LOOK_AND_REORDER 縮退＝pick脱落の回帰防止）
  const sub1 = gla?.abilities?.[0]?.action as import('../src/types/effects').RevealAndPickAction;
  eq(sub1?.type, 'REVEAL_AND_PICK', '内側1本目の型');
  eq(`${sub1?.revealCount}/${sub1?.pickCount}/${sub1?.pickUpTo}`, '5/2/true', '5枚見て2枚まで');
});

// タスク12(xxiii)残・SPDi47-03: 「手札を好きな枚数捨てる」＝TRASH{HAND_CARD, count:'ALL', upToCount}の対話分岐
// （SIGNI分岐と同形の移植）＋捨て枚数を LAST_PROCESSED_COUNT_GTE の2段閾値（8→ライフ→デッキ下／1→シグニ→デッキ下）
// が連鎖で読めること。⚠LIFE_CLOTH_CARD 転送は lastProcessedCards を上書きしない設計（GTE8発火後も GTE1 が捨て枚数を見る）。
{
  const spdi47Chain = (): EffectAction => ({ type: 'SEQUENCE', steps: [
    { type: 'TRASH', target: { type: 'HAND_CARD', owner: 'self', count: 'ALL', upToCount: true } },
    { type: 'CONDITIONAL', condition: { type: 'LAST_PROCESSED_COUNT_GTE', value: 8 },
      then: { type: 'TRANSFER_TO_DECK', source: { type: 'LIFE_CLOTH_CARD', owner: 'opponent', count: 1 }, shuffle: false, position: 'bottom' } },
    { type: 'CONDITIONAL', condition: { type: 'LAST_PROCESSED_COUNT_GTE', value: 1 },
      then: { type: 'TRANSFER_TO_DECK', source: { type: 'SIGNI', owner: 'opponent', count: 1, filter: { cardType: 'シグニ' } }, shuffle: false, position: 'bottom' } },
  ] }) as unknown as EffectAction;
  test('TRASH 手札好きな枚数（ALL+upTo）: 5枚捨て→GTE8不発・GTE1発火（相手シグニ→デッキ下）', () => {
    const ctx = mkCtx({ hand: 5 }, { signi: [SIGNI, null, null] });
    const r = run(spdi47Chain(), ctx);
    eq(r.ownerState.hand.length, 0, '手札が全部捨てられていない');
    eq(r.otherState.life_cloth.length, 7, 'GTE8が誤発火（ライフが減った）');
    eq(r.otherState.field.signi.filter(s => (s?.length ?? 0) > 0).length, 0, 'GTE1不発（シグニが場に残った）');
    eq(r.otherState.deck.at(-1), SIGNI, 'シグニがデッキ下に置かれていない');
  });
  test('TRASH 手札好きな枚数（ALL+upTo）: 8枚捨て→GTE8発火（ライフ→デッキ下）かつGTE1も発火（非上書き）', () => {
    const ctx = mkCtx({ hand: 8 }, { signi: [SIGNI_P3000, null, null] });
    const r = run(spdi47Chain(), ctx);
    eq(r.ownerState.hand.length, 0, '手札が全部捨てられていない');
    eq(r.otherState.life_cloth.length, 6, 'GTE8不発（ライフが減っていない）');
    eq(r.otherState.field.signi.filter(s => (s?.length ?? 0) > 0).length, 0, 'GTE1不発＝LIFE転送がlastProcessedCardsを上書きした');
  });
}

// タスク12(xxiii)残・SPDi47-05: BANISH_REDIRECT{redirectTo:'exile'}＝「エナゾーンに置かれる代わりにゲームから除外」。
// フラグ設定（executor）と行き先解決（banishDestination＝どのゾーンにも置かない）の両方を固定。
test('BANISH_REDIRECT exile: フラグ設定＋バニッシュ先がどのゾーンにも置かれない', () => {
  const ctx = mkCtx({}, {});
  const r = run({ type: 'BANISH_REDIRECT', target: { type: 'SIGNI', owner: 'opponent', count: 'ALL' }, redirectTo: 'exile', until: 'END_OF_TURN' } as unknown as EffectAction, ctx);
  eq((r.ownerState as PlayerState).banish_redirect_to_exile, true, 'フラグ未設定');
  const banished = mkState({});
  const { state: after } = banishDestination(banished, r.ownerState as PlayerState, 'TEST-CARD');
  eq(after.energy.length, banished.energy.length, 'エナに置かれた');
  eq(after.trash.length, banished.trash.length, 'トラッシュに置かれた');
  eq(after.hand.length, banished.hand.length, '手札に置かれた');
});

// タスク12(xxiii)副産物: 「その中からカードをN枚まで手札に加え、残りを好きな順番でデッキの一番上/下に置く」が
// 汎用デッキ/トラッシュ規則（LOOK_AND_REORDER）に先に飲まれて pick（手札加え）が丸ごと脱落する規則順序バグの回帰防止。
test('pick復元: 「5枚見る→2枚まで手札・残り好きな順でデッキ下」が REVEAL_AND_PICK{pickUpTo} にパースされる（WXDi-P16-034）', () => {
  const parsed = parseCardEffects(cardMap.get('WXDi-P16-034')!);
  const act = parsed.find(e => e.effectId === 'WXDi-P16-034-E1')?.action as import('../src/types/effects').RevealAndPickAction;
  eq(act?.type, 'REVEAL_AND_PICK', 'pick が LOOK_AND_REORDER に縮退');
  eq(`${act?.revealCount}/${act?.pickCount}/${act?.pickUpTo}/${act?.remainder?.position}`, '5/2/true/bottom', '値');
});

// UP{LRIG}: 「このルリグをアップする」（WX10-009/WX19-014等）。lrig_down を解除する
test('UP LRIG: ダウン状態のルリグをアップ（lrig_down解除）', () => {
  const ctx = mkCtx({}, {});
  ctx.ownerState.field.lrig_down = true;
  const r = run({ type: 'UP', target: { type: 'LRIG', owner: 'self', count: 1 } } as unknown as EffectAction, ctx);
  eq(r.ownerState.field.lrig_down, false, 'ルリグがアップしていない');
});

// HAND_COUNT 条件ゲート: 「カードを1枚引く。その後、あなたの手札が4枚以下の場合、追加でカードを1枚引く」
// （WX12-020/WX21-026-BURST。旧JSONは IS_MY_TURN＝常時真に誤フォールバック＝無条件2枚ドローの過剰効果）
test('HAND_COUNT条件: 手札4枚以下なら追加ドロー・5枚以上なら1枚のみ', () => {
  const act = { type: 'SEQUENCE', steps: [
    { type: 'DRAW', owner: 'self', count: 1 },
    { type: 'CONDITIONAL', condition: { type: 'HAND_COUNT', owner: 'self', operator: 'lte', value: 4 },
      then: { type: 'DRAW', owner: 'self', count: 1 } },
  ] } as unknown as EffectAction;
  const ctx1 = mkCtx({ hand: 3 }, {});   // 3+1=4 ≤4 → 追加ドロー
  const d1 = ctx1.ownerState.deck.length;
  const r1 = run(act, ctx1);
  eq(r1.ownerState.hand.length, 5, '手札3開始: 1+条件成立の追加1で5になるはず');
  eq(r1.ownerState.deck.length, d1 - 2, 'デッキ-2');
  const ctx2 = mkCtx({ hand: 6 }, {});   // 6+1=7 >4 → 追加なし
  const d2 = ctx2.ownerState.deck.length;
  const r2 = run(act, ctx2);
  eq(r2.ownerState.hand.length, 7, '手札6開始: 追加ドローは発生しないはず');
  eq(r2.ownerState.deck.length, d2 - 1, 'デッキ-1');
});

// ENERGY_COUNT 条件ゲート: 「エナチャージ1。その後、エナ4枚以下なら追加でエナチャージ1」（WX05-042-BURST）
test('ENERGY_COUNT条件: エナ4枚以下なら追加チャージ・5枚以上ならなし', () => {
  const act = { type: 'SEQUENCE', steps: [
    { type: 'ENERGY_CHARGE_FROM_DECK', owner: 'self', count: 1 },
    { type: 'CONDITIONAL', condition: { type: 'ENERGY_COUNT', owner: 'self', operator: 'lte', value: 4 },
      then: { type: 'ENERGY_CHARGE_FROM_DECK', owner: 'self', count: 1 } },
  ] } as unknown as EffectAction;
  const ctx1 = mkCtx({ energy: 2 }, {}); // 2+1=3 ≤4 → 追加
  const r1 = run(act, ctx1);
  eq(r1.ownerState.energy.length, 4, 'エナ2開始: 1+追加1で4になるはず');
  const ctx2 = mkCtx({ energy: 5 }, {}); // 5+1=6 >4 → 追加なし
  const r2 = run(act, ctx2);
  eq(r2.ownerState.energy.length, 6, 'エナ5開始: 追加チャージは発生しないはず');
});

// BURST「そうした場合」: TRASH前段が対象なしのとき残りSEQUENCEがスキップされる（engine既存ガードの固定。WX03-034-BURST型）
test('そうした場合ガード: 手札に該当カードなし→TRASH不成立→後続CONDITIONALスキップ', () => {
  const act = { type: 'SEQUENCE', steps: [
    { type: 'TRASH', target: { type: 'HAND_CARD', owner: 'self', count: 1, filter: { cardType: 'シグニ', story: '存在しないクラス名' } } },
    { type: 'CONDITIONAL', condition: { type: 'IS_MY_TURN' }, then: { type: 'DRAW', owner: 'self', count: 2 } },
  ] } as unknown as EffectAction;
  const ctx = mkCtx({ hand: 3 }, {});
  const r = run(act, ctx);
  eq(r.ownerState.hand.length, 3, '捨てられない場合はドローも発生しないはず');
});

// CENTER_LRIG_IS_UP: 「あなたのセンタールリグがアップ状態の場合、カードを2枚引く」（WX25-P2-048）
test('CENTER_LRIG_IS_UP: アップ状態なら引く・ダウン状態なら引かない', () => {
  const act = { type: 'CONDITIONAL', condition: { type: 'CENTER_LRIG_IS_UP' },
    then: { type: 'DRAW', owner: 'self', count: 2 } } as unknown as EffectAction;
  const ctx1 = mkCtx({}, {});
  ctx1.ownerState.field.lrig_down = false;
  const h1 = ctx1.ownerState.hand.length;
  const r1 = run(act, ctx1);
  eq(r1.ownerState.hand.length, h1 + 2, 'アップ状態なのに引けていない');
  const ctx2 = mkCtx({}, {});
  ctx2.ownerState.field.lrig_down = true;
  const h2 = ctx2.ownerState.hand.length;
  const r2 = run(act, ctx2);
  eq(r2.ownerState.hand.length, h2, 'ダウン状態なのに引いた');
});

// ── census文型バッチ①（2026-07-04 続き23）: 状態条件節のCONDITIONAL持ち上げ ──
// parser規則（effectParser「状態条件節の CONDITIONAL 持ち上げ」）＋heldReview採用で入った
// JSON構造と、新たにJSONで使われ始めた条件型のengine評価を固定する。

// LIFE_COUNT条件: 「あなたのライフクロスが2枚以下の場合、〜」（WX06-002系・SP26-008）
test('LIFE_COUNT条件: ライフ2枚以下なら発火・3枚以上なら不発', () => {
  const act = { type: 'CONDITIONAL', condition: { type: 'LIFE_COUNT', owner: 'self', operator: 'lte', value: 2 },
    then: { type: 'DRAW', owner: 'self', count: 2 } } as unknown as EffectAction;
  const ctx1 = mkCtx({ life: 2 }, {});
  const h1 = ctx1.ownerState.hand.length;
  eq(run(act, ctx1).ownerState.hand.length, h1 + 2, 'ライフ2で発火するはず');
  const ctx2 = mkCtx({ life: 5 }, {});
  const h2 = ctx2.ownerState.hand.length;
  eq(run(act, ctx2).ownerState.hand.length, h2, 'ライフ5で不発のはず');
});

// HAS_CARD_IN_FIELD crossState: 「あなたの場にクロス状態のシグニがある場合」（WX07-066系）
test('HAS_CARD_IN_FIELDクロス状態条件: cross_stateありなら発火・なしなら不発', () => {
  const act = { type: 'CONDITIONAL', condition: { type: 'HAS_CARD_IN_FIELD', owner: 'self', filter: { cardType: 'シグニ', crossState: true } },
    then: { type: 'DRAW', owner: 'self', count: 1 } } as unknown as EffectAction;
  const ctx1 = mkCtx({ signi: [fresh(), null, null] }, {});
  (ctx1.ownerState.field as unknown as { cross_state?: boolean[] }).cross_state = [true, false, false];
  const h1 = ctx1.ownerState.hand.length;
  eq(run(act, ctx1).ownerState.hand.length, h1 + 1, 'クロス状態ありで発火するはず');
  const ctx2 = mkCtx({ signi: [fresh(), null, null] }, {});
  const h2 = ctx2.ownerState.hand.length;
  eq(run(act, ctx2).ownerState.hand.length, h2, 'クロス状態なしで不発のはず');
});

// CONDITIONAL else 昇格置換: 「＜base＞。＜cond＞の場合、代わりに＜enhanced＞」（続き28・代わりにB系統）
// 条件成立→enhanced（then）、不成立→base（else）。二重適用ではなくどちらか一方のみ実行される。
test('CONDITIONAL else: 条件成立でthen・不成立でelseの一方のみ実行', () => {
  const act = { type: 'CONDITIONAL', condition: { type: 'LIFE_COUNT', owner: 'self', operator: 'lte', value: 2 },
    then: { type: 'DRAW', owner: 'self', count: 3 }, else: { type: 'DRAW', owner: 'self', count: 1 } } as unknown as EffectAction;
  const c1 = mkCtx({ life: 2 }, {}); const h1 = c1.ownerState.hand.length;
  eq(run(act, c1).ownerState.hand.length, h1 + 3, 'ライフ2ならthen(3枚)のみ');
  const c2 = mkCtx({ life: 5 }, {}); const h2 = c2.ownerState.hand.length;
  eq(run(act, c2).ownerState.hand.length, h2 + 1, 'ライフ5ならelse(1枚)のみ');
});

// 多段閾値の入れ子else（続き29・代わりにB系統残）: 「N枚以上ある場合、〜する。M枚以上ある場合、代わりに〜」
// ＝CONDITIONAL{高閾値, then:強, else: CONDITIONAL{低閾値, then:弱}}。LRIG_TRASH_COUNT の executor 評価も兼ねる。
test('多段閾値入れ子else: ルリグトラッシュ8枚でthen・4枚で内側then・3枚で不発', () => {
  const anyCards = [...cardMap.keys()].slice(0, 8);
  const act = { type: 'CONDITIONAL', condition: { type: 'LRIG_TRASH_COUNT', operator: 'gte', value: 8 },
    then: { type: 'DRAW', owner: 'self', count: 3 },
    else: { type: 'CONDITIONAL', condition: { type: 'LRIG_TRASH_COUNT', operator: 'gte', value: 4 },
      then: { type: 'DRAW', owner: 'self', count: 1 } } } as unknown as EffectAction;
  const c1 = mkCtx({}, {}); c1.ownerState.lrig_trash = anyCards.slice(0, 8);
  const h1 = c1.ownerState.hand.length;
  eq(run(act, c1).ownerState.hand.length, h1 + 3, 'ルリグトラッシュ8枚なら外側then(3枚)');
  const c2 = mkCtx({}, {}); c2.ownerState.lrig_trash = anyCards.slice(0, 4);
  const h2 = c2.ownerState.hand.length;
  eq(run(act, c2).ownerState.hand.length, h2 + 1, '4枚なら内側then(1枚)');
  const c3 = mkCtx({}, {}); c3.ownerState.lrig_trash = anyCards.slice(0, 3);
  const h3 = c3.ownerState.hand.length;
  eq(run(act, c3).ownerState.hand.length, h3, '3枚なら不発');
});

// census「代わりに」B系統残バッチの採用JSON構造ガード（続き29）: per-target値すり替え・多段閾値・CHOOSE復元
test('census代わりにB系統残: 採用JSONの構造（値すり替え・多段閾値・CHOOSE復元）', () => {
  // per-target 値すり替え（WXDi-CP01-047: バーチャル10枚→同一対象−5000/else−3000）
  const s1 = JSON.stringify(effectsMap.get('WXDi-CP01-047') ?? []);
  ok(s1.includes('"minCount":10') && s1.includes('"delta":-5000') && s1.includes('"delta":-3000') && s1.includes('"else"'),
    'WXDi-CP01-047: 10枚条件のthen/else値すり替えのはず');
  // 多段閾値の入れ子（WD08-006: トラッシュ20枚→−8000/else 10枚→−5000・CHOOSE 3択も復元）
  const s2 = JSON.stringify(effectsMap.get('WD08-006') ?? []);
  ok(s2.includes('"CHOOSE"') && s2.includes('"from_count":3'), 'WD08-006: 3択CHOOSEが復元されているはず');
  ok(s2.includes('"value":20') && s2.includes('"value":10') && s2.includes('"delta":-8000') && s2.includes('"delta":-5000'),
    'WD08-006: 20枚/10枚の入れ子閾値のはず');
  // ルリグトラッシュ多段閾値（WXK11-075: 8枚→−12000/else 4枚→−7000）
  const s3 = JSON.stringify(effectsMap.get('WXK11-075') ?? []);
  ok(s3.includes('"LRIG_TRASH_COUNT"') && s3.includes('"value":8') && s3.includes('"delta":-12000'),
    'WXK11-075: ルリグトラッシュ8枚閾値のはず');
  // THIS_CARD_FROM_TRASH のelse分岐（WXK02-037: トラッシュから出たら−4000/else−2000・手パッチMANUAL）
  const s4 = JSON.stringify(effectsMap.get('WXK02-037') ?? []);
  ok(s4.includes('"THIS_CARD_FROM_TRASH"') && s4.includes('"delta":-4000') && s4.includes('"delta":-2000') && s4.includes('"else"'),
    'WXK02-037: トラッシュ出のthen/else値すり替えのはず');
  // CHOOSE 平坦化復元（WDK03-020: ①コスト付き効果＋②エナチャージの2択が構造ごと消えていた）
  const s5 = JSON.stringify(effectsMap.get('WDK03-020') ?? []);
  ok(s5.includes('"CHOOSE"') && s5.includes('"from_count":2') && s5.includes('"ENERGY_CHARGE_FROM_DECK"'),
    'WDK03-020: 2択CHOOSE（エナチャージ択を含む）が復元されているはず');
});

// IS_BETTING条件: 「あなたがベットしていた場合、追加で〜」（続き27・ベット追加ボーナス9枚バッチ）
// ベット宣言（is_betting_this_effect）時のみ追加効果が発火する。BattleScreen が raw text からベットを提示。
test('IS_BETTING条件: ベット宣言時に発火・非ベット時は不発', () => {
  const act = { type: 'CONDITIONAL', condition: { type: 'IS_BETTING' },
    then: { type: 'DRAW', owner: 'self', count: 1 } } as unknown as EffectAction;
  const ctx1 = mkCtx({}, {});
  (ctx1.ownerState as unknown as { is_betting_this_effect?: boolean }).is_betting_this_effect = true;
  const h1 = ctx1.ownerState.hand.length;
  eq(run(act, ctx1).ownerState.hand.length, h1 + 1, 'ベット宣言時は発火するはず');
  const ctx2 = mkCtx({}, {}); // is_betting_this_effect 未設定
  const h2 = ctx2.ownerState.hand.length;
  eq(run(act, ctx2).ownerState.hand.length, h2, '非ベット時は不発のはず');
});

// betChoose（続き107）: 「以下のN個からMつ選ぶ。ベットしていた場合、代わりにKつ選ぶ」＝ベット宣言時に
// CHOOSE の choose_count/upTo を上書き（recollectArts と同型・engine effectExecutor）。
test('betChoose: ベット宣言時に選択数が上書きされる', () => {
  const act = { type: 'CHOOSE', choose_count: 1, from_count: 2,
    choices: [
      { choiceId: 'c0', label: '選択肢1', action: { type: 'DRAW', owner: 'self', count: 1 } },
      { choiceId: 'c1', label: '選択肢2', action: { type: 'DRAW', owner: 'self', count: 1 } },
    ],
    betChoose: { thenChooseCount: 2, thenUpTo: true } } as unknown as EffectAction;
  const ctxBet = mkCtx({}, {});
  (ctxBet.ownerState as unknown as { is_betting_this_effect?: boolean }).is_betting_this_effect = true;
  const rBet = executeEffect({ effectId: 't', effectType: 'AUTO', action: act, duration: 'INSTANT', mandatory: true } as CardEffect, ctxBet);
  eq((rBet as { pending?: { count?: number } }).pending?.count, 2, 'ベット時は代わりの選択数(2)になるはず');
  const ctxNo = mkCtx({}, {}); // 非ベット
  const rNo = executeEffect({ effectId: 't', effectType: 'AUTO', action: act, duration: 'INSTANT', mandatory: true } as CardEffect, ctxNo);
  eq((rNo as { pending?: { count?: number } }).pending?.count, 1, '非ベット時は基本の選択数(1)のはず');
});

// HAS_CARD_IN_FIELD cardName（ルリグゾーン走査）: 「あなたの場に《X》がいる場合」（続き26・場に《X》13枚バッチ）
// X はルリグ名のことが多く、従来 HAS_CARD_IN_FIELD はシグニゾーンしか見ず偽陰性だった＝ルリグゾーンも走査する。
test('HAS_CARD_IN_FIELD cardName: 場にそのルリグがいれば発火・いなければ不発', () => {
  const lrig = findCard(c => c.Type === 'ルリグ' && !!c.CardName);
  const act = { type: 'CONDITIONAL', condition: { type: 'HAS_CARD_IN_FIELD', owner: 'self', filter: { cardName: cardMap.get(lrig)!.CardName } },
    then: { type: 'DRAW', owner: 'self', count: 1 } } as unknown as EffectAction;
  const ctx1 = mkCtx({}, {});
  ctx1.ownerState.field.lrig = [lrig];
  const h1 = ctx1.ownerState.hand.length;
  eq(run(act, ctx1).ownerState.hand.length, h1 + 1, '場にそのルリグがいれば発火するはず');
  const ctx2 = mkCtx({}, {}); // ルリグゾーン空
  const h2 = ctx2.ownerState.hand.length;
  eq(run(act, ctx2).ownerState.hand.length, h2, 'そのルリグがいなければ不発のはず');
});

// TRASH_HAS_CARD minCount条件: 「あなたのトラッシュに＜武勇＞のシグニが10枚以上ある場合」（WDK06-C01）
test('TRASH_HAS_CARD minCount条件: トラッシュ武勇10枚で発火・9枚なら不発', () => {
  const buyu = [...cardMap.values()].filter(c => isSigni(c) && (c.CardClass ?? '').includes('武勇')).map(c => c.CardNum);
  ok(buyu.length >= 10, `武勇10種以上(${buyu.length})`);
  const act = { type: 'CONDITIONAL',
    condition: { type: 'TRASH_HAS_CARD', owner: 'self', filter: { cardType: 'シグニ', story: '武勇' }, minCount: 10 },
    then: { type: 'DRAW', owner: 'self', count: 1 } } as unknown as EffectAction;
  const ctx1 = mkCtx({}, {});
  ctx1.ownerState.trash = buyu.slice(0, 10);
  const h1 = ctx1.ownerState.hand.length;
  eq(run(act, ctx1).ownerState.hand.length, h1 + 1, '武勇10枚で発火するはず');
  const ctx2 = mkCtx({}, {});
  ctx2.ownerState.trash = buyu.slice(0, 9);
  const h2 = ctx2.ownerState.hand.length;
  eq(run(act, ctx2).ownerState.hand.length, h2, '武勇9枚で不発のはず');
});

// 採用JSONの構造ガード: 条件がtargetフィルタへ漏れていた既存バグの是正形を固定
// （再harvestや手パッチで昔の「無条件＋誤フィルタ」形に戻ったら即FAILさせる）
test('census条件節バッチ①: 採用JSONの構造（条件持ち上げ＋フィルタ漏れ除去）', () => {
  const s1 = JSON.stringify(effectsMap.get('WX09-035') ?? []);
  ok(s1.includes('"HAS_CARD_IN_FIELD"') && s1.includes('"minCount":3'), 'WX09-035: 毒牙3体条件がCONDITIONALに居るはず');
  ok(!/"target":\{[^}]*"story":"毒牙"/.test(s1), 'WX09-035: target側の毒牙フィルタ（条件の漏れ）は除去済みのはず');
  const s2 = JSON.stringify(effectsMap.get('SP26-008') ?? []);
  ok(s2.includes('"LIFE_COUNT"') && s2.includes('ダブルクラッシュ'), 'SP26-008: ライフ2以下→ダブルクラッシュ付与のはず');
  ok(!s2.includes('"LIFE_CRASH"'), 'SP26-008: 自傷LIFE_CRASH幻覚は消えているはず');
  const s3 = JSON.stringify(effectsMap.get('WXK07-032') ?? []);
  ok(s3.includes('"LRIG_STORY"') && s3.includes('"story":"ミュウ"'), 'WXK07-032: センタールリグ＜ミュウ＞条件が居るはず');
});

// ── LAST_PROCESSED_MATCHES（2026-07-04 続き24）: 「それが＜X＞のシグニの場合」条件型 ──
// ミル/公開/エナチャージ/対象選択が lastProcessedCards に残したカードを filter 照合する。

// ミル前段（WXK06-079「デッキ一番上をトラッシュ。それが＜龍獣＞なら相手手札1枚破壊」型）
test('LAST_PROCESSED_MATCHES: ミル結果が＜龍獣＞なら発火・違えば不発', () => {
  const ryu = [...cardMap.values()].find(c => isSigni(c) && (c.CardClass ?? '').includes('龍獣'))?.CardNum;
  const non = [...cardMap.values()].find(c => isSigni(c) && !(c.CardClass ?? '').includes('龍獣'))?.CardNum;
  ok(!!ryu && !!non, '龍獣/非龍獣シグニが見つかるはず');
  const act = { type: 'SEQUENCE', steps: [
    { type: 'TRASH', target: { type: 'DECK_CARD', owner: 'self', count: 1 } },
    { type: 'CONDITIONAL', condition: { type: 'LAST_PROCESSED_MATCHES', filter: { cardType: 'シグニ', story: '龍獣' } },
      then: { type: 'TRASH', target: { type: 'HAND_CARD', owner: 'opponent', count: 1, blind: true } } },
  ] } as unknown as EffectAction;
  const ctx1 = mkCtx({}, { hand: 3 });
  ctx1.ownerState.deck = [ryu!, ...ctx1.ownerState.deck];
  eq(run(act, ctx1).otherState.hand.length, 2, '龍獣ミルで相手手札-1のはず');
  const ctx2 = mkCtx({}, { hand: 3 });
  ctx2.ownerState.deck = [non!, ...ctx2.ownerState.deck];
  eq(run(act, ctx2).otherState.hand.length, 3, '非龍獣ミルなら不発のはず');
});

// エナチャージ前段（WX14-029-BURST「デッキ一番上をエナへ。それが＜遊具＞なら追加で1枚引く」型）
// ＝ execEnergyChargeFromDeck が lastProcessedCards を記録するようになった回帰テスト
test('LAST_PROCESSED_MATCHES: エナに置いたカードが＜遊具＞なら追加ドロー', () => {
  const toy = [...cardMap.values()].find(c => isSigni(c) && (c.CardClass ?? '').includes('遊具'))?.CardNum;
  const non = [...cardMap.values()].find(c => isSigni(c) && !(c.CardClass ?? '').includes('遊具'))?.CardNum;
  ok(!!toy && !!non, '遊具/非遊具シグニが見つかるはず');
  const act = { type: 'SEQUENCE', steps: [
    { type: 'ENERGY_CHARGE_FROM_DECK', owner: 'self', count: 1 },
    { type: 'CONDITIONAL', condition: { type: 'LAST_PROCESSED_MATCHES', filter: { cardType: 'シグニ', story: '遊具' } },
      then: { type: 'DRAW', owner: 'self', count: 1 } },
  ] } as unknown as EffectAction;
  const ctx1 = mkCtx({}, {});
  ctx1.ownerState.deck = [toy!, ...ctx1.ownerState.deck];
  const h1 = ctx1.ownerState.hand.length;
  const e1 = ctx1.ownerState.energy.length;
  const r1 = run(act, ctx1);
  eq(r1.ownerState.energy.length, e1 + 1, 'エナ+1のはず');
  eq(r1.ownerState.hand.length, h1 + 1, '遊具チャージで追加ドローのはず');
  const ctx2 = mkCtx({}, {});
  ctx2.ownerState.deck = [non!, ...ctx2.ownerState.deck];
  const h2 = ctx2.ownerState.hand.length;
  eq(run(act, ctx2).ownerState.hand.length, h2, '非遊具チャージなら不発のはず');
});

// targetsLastProcessed（WXDi-P07-079「+5000。それが＜毒牙＞なら代わりに+10000」＝+5000+条件時追加+5000）
test('POWER_MODIFY targetsLastProcessed: 選択した＜毒牙＞に合計+10000・非毒牙は+5000のみ', () => {
  const doku = [...cardMap.values()].find(c => isSigni(c) && (c.CardClass ?? '').includes('毒牙'))?.CardNum;
  const non = [...cardMap.values()].find(c => isSigni(c) && !(c.CardClass ?? '').includes('毒牙'))?.CardNum;
  ok(!!doku && !!non, '毒牙/非毒牙シグニが見つかるはず');
  const act = { type: 'SEQUENCE', steps: [
    { type: 'POWER_MODIFY', target: { type: 'SIGNI', owner: 'self', count: 1, filter: { cardType: 'シグニ' }, upToCount: false }, delta: 5000 },
    { type: 'CONDITIONAL', condition: { type: 'LAST_PROCESSED_MATCHES', filter: { cardType: 'シグニ', story: '毒牙' } },
      then: { type: 'POWER_MODIFY', target: { type: 'SIGNI', owner: 'self', count: 1, filter: { cardType: 'シグニ' } }, delta: 5000, targetsLastProcessed: true } },
  ] } as unknown as EffectAction;
  const sum = (r: ExecResult, cn: string) =>
    ((r as { ownerState: PlayerState }).ownerState.temp_power_mods ?? []).filter(m => m.cardNum === cn).reduce((s, m) => s + m.delta, 0);
  const ctx1 = mkCtx({}, {});
  ctx1.ownerState.field.signi = [[doku!], null, null];
  eq(sum(run(act, ctx1), doku!), 10000, '毒牙は合計+10000のはず');
  const ctx2 = mkCtx({}, {});
  ctx2.ownerState.field.signi = [[non!], null, null];
  eq(sum(run(act, ctx2), non!), 5000, '非毒牙は+5000のみのはず');
});

// ── REPLACE_NEXT_DAMAGE_WITH_MILL（2026-07-04 続き25）: ダメージ置換ミルの予約 ──
// 「次にあなたがダメージを受ける場合、代わりにデッキ上N枚トラッシュ」（WXDi-P15-041 等・黒ハナレ系）。
// 消費側（crashOneLife/ルリグアタック応答）は BattleScreen 層＝実機検証対象。ここでは予約の積み上げを固定。
test('REPLACE_NEXT_DAMAGE_WITH_MILL: 予約が damage_replace_mill キューに積まれる', () => {
  const act = { type: 'SEQUENCE', steps: [
    { type: 'REPLACE_NEXT_DAMAGE_WITH_MILL', millCount: 3 },
    { type: 'REPLACE_NEXT_DAMAGE_WITH_MILL', millCount: 3, damageSource: 'signi' },
  ] } as unknown as EffectAction;
  const ctx = mkCtx({}, {});
  const r = run(act, ctx);
  const q = (r.ownerState as PlayerState & { damage_replace_mill?: number[] }).damage_replace_mill ?? [];
  eq(q.length, 2, '2件予約されるはず');
  eq(q[0], 3, 'ミル枚数3のはず');
});

// ダメージ置換/軽減系の採用JSON構造ガード（旧形＝即時自ミル・source欠落に戻ったら即FAIL）
test('ダメージ置換バッチ: 採用JSONの構造固定（WXDi-P15-041/WXDi-D07-007/WX25-P1-008）', () => {
  const s1 = JSON.stringify(effectsMap.get('WXDi-P15-041') ?? []);
  ok((s1.match(/"REPLACE_NEXT_DAMAGE_WITH_MILL"/g) ?? []).length === 3, 'WXDi-P15-041: 置換ミル予約×3のはず');
  ok(!s1.includes('"DECK_CARD"'), 'WXDi-P15-041: 即時自ミル（TRASH DECK_CARD）は消えているはず');
  const s2 = JSON.stringify(effectsMap.get('WXDi-D07-007') ?? []);
  ok(s2.includes('"PREVENT_NEXT_DAMAGE"') && s2.includes('"count":2'), 'WXDi-D07-007: 2回シールドのはず');
  ok(!s2.includes('"DECK_CARD"'), 'WXDi-D07-007: 即時自ミル5は消えているはず');
  const s3 = JSON.stringify(effectsMap.get('WX25-P1-008') ?? []);
  ok(s3.includes('"damageSource":"lrig"') && s3.includes('"damageSource":"signi"'), 'WX25-P1-008: ルリグ/シグニ両方の source 保持のはず');
});

// 採用/手パッチJSONの構造ガード（再harvestで旧形＝無条件過剰発火に戻ったら即FAIL）
test('LPMバッチ: 採用JSONの構造固定（WXK06-079/WXEX1-43/SP26-007/WXDi-P07-079）', () => {
  const s1 = JSON.stringify(effectsMap.get('WXK06-079') ?? []);
  ok(s1.includes('"LAST_PROCESSED_MATCHES"') && s1.includes('"story":"龍獣"'), 'WXK06-079: 龍獣条件がCONDITIONALに居るはず');
  const burst43 = (effectsMap.get('WXEX1-43') ?? []).find(e => e.effectType === 'LIFE_BURST');
  const s2 = JSON.stringify(burst43 ?? {});
  ok(s2.includes('"LAST_PROCESSED_MATCHES"') && s2.includes('"story":"美巧"') && !s2.includes('IS_MY_TURN'),
    'WXEX1-43-BURST: 美巧エナ置き条件（IS_MY_TURN化け解消）のはず');
  const s3 = JSON.stringify(effectsMap.get('SP26-007') ?? []);
  ok(s3.includes('INTERNAL_ARTS_RECYCLE_EXECUTE') && !s3.includes('TRANSFER_TO_DECK'), 'SP26-007: 宇宙条件→自己ルリグデッキ回収のはず');
  const s4 = JSON.stringify(effectsMap.get('WXDi-P07-079') ?? []);
  ok(s4.includes('"targetsLastProcessed":true') && !s4.includes('10000'), 'WXDi-P07-079: 同一対象への条件時+5000追加形のはず');
});

// POWER_MODIFY_PER_TRASH_COUNT 選択経路: applyDirectAction に PER_* case が無く選択後 no-op だった回帰テスト
// （WXK02-061「トラッシュの＜武勇＞5枚につき-1000」等。thenAction を POWER_MODIFY に変換して修正）
test('POWER_MODIFY_PER_TRASH_COUNT: 選択対象にトラッシュ枚数比例の修正が適用される', () => {
  const buyu = [...cardMap.values()].filter(c => isSigni(c) && (c.CardClass ?? '').includes('武勇')).map(c => c.CardNum);
  ok(buyu.length >= 5, `武勇5種以上(${buyu.length})`);
  const oppSigni = fresh();
  const ctx = mkCtx({}, { signi: [oppSigni, null, null] });
  ctx.ownerState.trash = buyu.slice(0, 5);
  const r = run({ type: 'POWER_MODIFY_PER_TRASH_COUNT', deltaPerUnit: -1000, unitSize: 5, trashOwner: 'self',
    countFilter: { cardType: 'シグニ', cardClass: '武勇' },
    target: { type: 'SIGNI', owner: 'opponent', count: 1, filter: { cardType: 'シグニ' } } } as unknown as EffectAction, ctx);
  const mod = (r.otherState.temp_power_mods ?? []).find(m => m.cardNum === oppSigni);
  eq(mod?.delta, -1000, `選択後の修正が適用されていない（mods=${JSON.stringify(r.otherState.temp_power_mods)}）`);
});

// EXILE{TRASH_CARD}＋NAME_BAN: 「相手トラッシュのスペルを除外し、このゲームの間対戦相手は同名カードを使用できない」
// （WXDi-P13-040-E2/WX10-023。旧 curated は TRASH{TRASH_CARD}＝トラッシュ→トラッシュの完全no-op＋targetSelf反転だった）
test('EXILE trash→NAME_BAN: 相手トラッシュから除外し相手に同名使用禁止が付く', () => {
  const spell = findCard(c => c.Type === 'スペル');
  const ctx = mkCtx({}, {});
  ctx.otherState.trash = [spell];
  const act = { type: 'SEQUENCE', steps: [
    { type: 'EXILE', target: { type: 'TRASH_CARD', owner: 'opponent', count: 1, filter: { cardType: 'スペル' }, upToCount: true } },
    { type: 'NAME_BAN', targetSelf: false, duration: 'GAME' },
  ] } as unknown as EffectAction;
  const r = run(act, ctx);
  eq(r.otherState.trash.length, 0, 'トラッシュから除外されていない');
  const banned = (r.otherState as { blocked_card_names_game?: string[] }).blocked_card_names_game ?? [];
  eq(banned[0], cardMap.get(spell)?.CardName, '相手に同名禁止が付いていない');
  const selfBanned = (r.ownerState as { blocked_card_names_game?: string[] }).blocked_card_names_game ?? [];
  eq(selfBanned.length, 0, '自分側に誤って禁止が付いた');
});

// ── §5c 続き30: 引用能力付与の平坦化是正（GRANT_EFFECT / rawText 展開）──
// 「＜対象＞を対象とし、ターン終了時まで、それは「【自】…」を得る」が即時実行に平坦化していた系統（68枚採用）。
test('GRANT_EFFECT: 対象シグニへ引用能力が granted_effects に積まれる', () => {
  const S = fresh();
  const ctx = mkCtx({ signi: [S, null, null] }, {});
  const sub = { effectId: 't-sub', effectType: 'AUTO', timing: ['ON_ATTACK_SIGNI'], triggerScope: 'self',
    action: { type: 'DRAW', owner: 'self', count: 1 }, duration: 'INSTANT', mandatory: true, parseStatus: 'AUTO' };
  const r = run({ type: 'GRANT_EFFECT', target: { type: 'SIGNI', owner: 'self', count: 1, filter: { cardType: 'シグニ' } },
    duration: 'UNTIL_END_OF_TURN', effect: sub } as unknown as EffectAction, ctx);
  const granted = (r.ownerState as { granted_effects?: Record<string, CardEffect[]> }).granted_effects?.[S] ?? [];
  eq(granted.length, 1, '付与されていない');
  eq((granted[0].action as { type?: string }).type, 'DRAW', '付与能力のactionがDRAWでない');
});
// LRIG対象（WXK10-014型）: fieldCandidates はシグニ限定のため専用分岐でセンタールリグトップへ自動付与（engine拡張）
test('GRANT_EFFECT: LRIG対象はセンタールリグトップへ選択UIなしで付与', () => {
  const ctx = mkCtx({}, {});
  ctx.ownerState.field.lrig = ['WX02-003'];
  const sub = { effectId: 't-sub', effectType: 'ACTIVATED', timing: ['ATTACK_ARTS'], cost: { exceed: 1 },
    action: { type: 'DRAW', owner: 'self', count: 1 }, duration: 'INSTANT', mandatory: false, parseStatus: 'AUTO' };
  const r = run({ type: 'GRANT_EFFECT', target: { type: 'LRIG', owner: 'self', count: 1 },
    duration: 'UNTIL_END_OF_TURN', effect: sub } as unknown as EffectAction, ctx);
  const granted = (r.ownerState as { granted_effects?: Record<string, CardEffect[]> }).granted_effects?.['WX02-003'] ?? [];
  eq(granted.length, 1, 'ルリグへ付与されていない');
});
// rawText 未展開（PARTIAL温存）ガード: effect 無しの GRANT_EFFECT は no-op（クラッシュ/誤付与しない）
test('GRANT_EFFECT: effect未展開（rawText温存）は no-op', () => {
  const S = fresh();
  const ctx = mkCtx({ signi: [S, null, null] }, {});
  const r = run({ type: 'GRANT_EFFECT', target: { type: 'SIGNI', owner: 'self', count: 1, filter: { cardType: 'シグニ' } },
    duration: 'UNTIL_END_OF_TURN', rawText: '【自】：未展開' } as unknown as EffectAction, ctx);
  const granted = (r.ownerState as { granted_effects?: Record<string, CardEffect[]> }).granted_effects ?? {};
  eq(Object.keys(granted).length, 0, '未展開なのに付与された');
});
// 採用JSONの構造ガード（再harvestで旧形＝即時実行の平坦化に戻ったら即FAIL）
test('引用付与バッチ: 採用JSONの構造固定（WX24-P1-057/WD18-006/WXK10-014）', () => {
  const e1 = (effectsMap.get('WX24-P1-057') ?? []).find(e => e.effectId === 'WX24-P1-057-E1');
  const s1 = JSON.stringify(e1 ?? {});
  ok(s1.includes('"GRANT_EFFECT"') && s1.includes('"story":"アーム"') && s1.includes('ON_ATTACK_SIGNI'),
    'WX24-P1-057-E1: アーム対象のアタック時能力付与のはず');
  const s2 = JSON.stringify(effectsMap.get('WD18-006') ?? []);
  ok(s2.includes('"GRANT_EFFECT"') && s2.includes('"count":"ALL"') && s2.includes('"story":"調理"'),
    'WD18-006: 調理全体への付与のはず');
  const s3 = JSON.stringify(effectsMap.get('WXK10-014') ?? []);
  ok(s3.includes('"GRANT_EFFECT"') && s3.includes('"type":"LRIG"'), 'WXK10-014: ルリグ対象付与のはず');
});

// CONTINUOUS 引用能力付与（GRANT_FIELD_SIGNI_ABILITY thisCardOnly・§5c 続き34）
test('GRANT_FIELD_SIGNI_ABILITY thisCardOnly: 付与元自身のみへ付与（他シグニは付与されない）', () => {
  const srcInst = fresh(), otherInst = fresh();
  const granted = { effectId: 'g', effectType: 'AUTO', timing: ['ON_ATTACK_SIGNI'],
    action: { type: 'DRAW', owner: 'self', count: 1 }, duration: 'INSTANT', mandatory: true } as unknown as CardEffect;
  const contEff = { effectId: 'c', effectType: 'CONTINUOUS',
    action: { type: 'GRANT_FIELD_SIGNI_ABILITY', thisCardOnly: true, abilities: [granted] },
    duration: 'PERMANENT', mandatory: true } as unknown as CardEffect;
  const localMap = new Map<string, CardEffect[]>([[srcInst, [contEff]]]);
  const st = mkState({ signi: [srcInst, otherInst, null] });
  const res = collectGrantedFromLayer(st, mkState({}), true, localMap, cardMap as Map<string, CardData>);
  ok(res.has(srcInst), 'thisCardOnly は付与元自身に付与されるべき');
  ok(!res.has(otherInst), 'thisCardOnly は他のシグニには付与されないべき');
});
test('GRANT_FIELD_SIGNI_ABILITY: activeCondition が偽なら付与されない', () => {
  const srcInst = fresh();
  const granted = { effectId: 'g', effectType: 'AUTO', timing: ['ON_ATTACK_SIGNI'],
    action: { type: 'DRAW', owner: 'self', count: 1 }, duration: 'INSTANT', mandatory: true } as unknown as CardEffect;
  const contEff = { effectId: 'c', effectType: 'CONTINUOUS',
    activeCondition: { type: 'COUNT_THRESHOLD', location: 'hand', owner: 'self', operator: 'gte', value: 99 },
    action: { type: 'GRANT_FIELD_SIGNI_ABILITY', thisCardOnly: true, abilities: [granted] },
    duration: 'PERMANENT', mandatory: true } as unknown as CardEffect;
  const localMap = new Map<string, CardEffect[]>([[srcInst, [contEff]]]);
  const st = mkState({ signi: [srcInst, null, null], hand: 3 });
  const res = collectGrantedFromLayer(st, mkState({}), true, localMap, cardMap as Map<string, CardData>);
  ok(!res.has(srcInst), '条件不成立なら付与されないべき');
});
// 採用JSONの構造ガード（再harvestで旧形＝有害な無条件CONTINUOUSの平坦化に戻ったら即FAIL・§5c 続き34）
test('引用付与バッチ2: CONTINUOUS自己付与の構造固定（WX12-028/WX13-057/WXDi-P05-047/WXDi-P09-073）', () => {
  const s1 = JSON.stringify(effectsMap.get('WX12-028') ?? []);
  ok(s1.includes('"GRANT_FIELD_SIGNI_ABILITY"') && s1.includes('"thisCardOnly":true') && s1.includes('ON_OPP_LIFE_CRASHED') && s1.includes('HAS_CARD_IN_FIELD'),
    'WX12-028: 龍獣条件つきクラッシュ時トラッシュ付与のはず');
  const s2 = JSON.stringify(effectsMap.get('WX13-057') ?? []);
  ok(s2.includes('"GRANT_FIELD_SIGNI_ABILITY"') && s2.includes('IS_SELF_IN_CENTER_ZONE') && s2.includes('ON_ATTACK_SIGNI'),
    'WX13-057: 中央ゾーン条件つきアタック時-5000付与のはず');
  const s3 = JSON.stringify(effectsMap.get('WXDi-P05-047') ?? []);
  ok(s3.includes('"GRANT_FIELD_SIGNI_ABILITY"') && s3.includes('"minCount":10') && s3.includes('ON_ATTACK_SIGNI'),
    'WXDi-P05-047: トラッシュ天使10枚条件つきアタック時ドロー付与のはず');
  const s4 = JSON.stringify(effectsMap.get('WXDi-P09-073') ?? []);
  ok(s4.includes('"GRANT_FIELD_SIGNI_ABILITY"') && s4.includes('IS_SELF_AWAKENED') && s4.includes('ON_TURN_END'),
    'WXDi-P09-073: 覚醒条件つきターン終了時エナチャージ付与のはず');
});
// 複合活性条件（センタールリグ色 AND 中央ゾーン）つき引用付与の構造固定（続き36・無条件平坦化への退化を防ぐ）
test('引用付与: 複合条件 AND[LRIG_COLOR, IS_SELF_IN_CENTER_ZONE]（WX06-032/035/WX10-068/WX15-054）', () => {
  for (const [num, color] of [['WX06-032', '緑'], ['WX06-035', '黒'], ['WX10-068', '青'], ['WX15-054', '緑']] as const) {
    const s = JSON.stringify(effectsMap.get(num) ?? []);
    ok(s.includes('"GRANT_FIELD_SIGNI_ABILITY"') && s.includes('"type":"AND"') && s.includes('"LRIG_COLOR"') && s.includes(`"color":"${color}"`) && s.includes('IS_SELF_IN_CENTER_ZONE'),
      `${num}: センタールリグ${color} AND 中央ゾーン条件つき付与のはず（無条件平坦化に戻っていない）`);
  }
});
// OPTIONAL_TRASH_SELF（自己犠牲コスト）の構造固定＋pay挙動（続き36・OPTIONAL_TRASH_ENERGY_CLASS 誤マップからの是正）
test('OPTIONAL_TRASH_SELF: 構造固定（WX06-CB03/WX21-056/061 が誤エナSTUBに戻っていない）', () => {
  for (const num of ['WX06-CB03', 'WX21-056', 'WX21-061']) {
    const s = JSON.stringify(effectsMap.get(num) ?? []);
    ok(s.includes('OPTIONAL_TRASH_SELF'), `${num}: 自トラッシュ任意コストのはず`);
    ok(!s.includes('OPTIONAL_TRASH_ENERGY_CLASS'), `${num}: エナトラッシュ誤STUBが無いこと`);
  }
});
test('OPTIONAL_TRASH_SELF: pay で自シグニがトラッシュされ then(draw2) が走る', () => {
  const src = 'WD01-009'; // 実在シグニ（execTrash の cardType:シグニ フィルタを通す）
  const ctx = mkCtx({ signi: [src, null, null], hand: 2 }, {}, src);
  const h0 = ctx.ownerState.hand.length;
  const eff = { type: 'SEQUENCE', steps: [
    { type: 'STUB', id: 'OPTIONAL_TRASH_SELF' },
    { type: 'CONDITIONAL', condition: { type: 'IS_MY_TURN' }, then: { type: 'DRAW', owner: 'self', count: 2 } },
  ] } as unknown as EffectAction;
  const r = run(eff, ctx);
  eq(tops(r.ownerState)[0], null, '自シグニが場から除かれる');
  ok(r.ownerState.trash.includes(src), '自シグニがトラッシュにある');
  eq(r.ownerState.hand.length, h0 + 2, 'そうした場合 draw 2 が走る');
});
// checkActiveCondition の AND: 両条件成立でのみ true（LRIG_COLOR＋中央ゾーン）
test('checkActiveCondition AND[LRIG_COLOR,IS_SELF_IN_CENTER_ZONE]: 両成立でのみ true', () => {
  const cond = { type: 'AND', conditions: [{ type: 'LRIG_COLOR', owner: 'self', color: '緑' }, { type: 'IS_SELF_IN_CENTER_ZONE' }] } as unknown as import('../src/types/effects').ActiveCondition;
  const srcInst = fresh();
  const me = mkState({ signi: [null, srcInst, null] }); me.field.lrig = ['WD04-001']; // 緑ルリグ（中央ゾーン=index1）
  const op = mkState({});
  // 中央ゾーン(index1)に居て緑ルリグ → true
  eq(checkActiveCondition(cond, me, op, true, cardMap as Map<string, CardData>, srcInst), true, '緑ルリグ＋中央ゾーンで true');
  // 端ゾーンに移すと中央ゾーン条件が偽 → false
  const me2 = mkState({ signi: [srcInst, null, null] }); me2.field.lrig = ['WD04-001'];
  eq(checkActiveCondition(cond, me2, op, true, cardMap as Map<string, CardData>, srcInst), false, '端ゾーンなら false');
});

// ATTACH_ACCE fromHand（デコレ）: 手札のアクセカードを2段階選択（step1=手札から／step2=ホストシグニ）して装着（続き65）
test('ATTACH_ACCE fromHand: 手札シグニを場のホストシグニにアクセ（signi_acce設定・手札-1）', () => {
  const HOST = SIGNI_P12000;
  const ACCE = SIGNI_L1;
  const base = mkCtx({ signi: [HOST, null, null] }, {});
  const ctx = { ...base, ownerState: { ...base.ownerState, hand: [ACCE, ...base.ownerState.hand] } } as ExecCtx;
  const h0 = ctx.ownerState.hand.length;
  const r = run({ type: 'ATTACH_ACCE', targetSigniOwner: 'self', sourceOwner: 'self', fromHand: true } as EffectAction, ctx);
  eq(r.ownerState.field.signi_acce?.[0], ACCE, 'ゾーン0のホストにアクセカード装着');
  eq(r.ownerState.hand.includes(ACCE), false, 'アクセカードが手札から除去');
  eq(r.ownerState.hand.length, h0 - 1, '手札-1');
  eq(r.ownerState.acce_just_done, HOST, 'acce_just_doneにホストシグニ（ON_ACCE検出用）');
});

// ADD_TO_FIELD owner:opponent from opp trash: 相手トラッシュのシグニを相手の場に出す（WXEX2-50-E3 step1・owner誤パース是正 続き66）
test('ADD_TO_FIELD owner:opponent: 相手トラッシュのシグニを相手の場に出す（相手フィールドへ配置）', () => {
  const SIG = SIGNI_P3000;
  const base = mkCtx({}, {});
  const ctx = { ...base, otherState: { ...base.otherState, trash: [SIG, ...base.otherState.trash] } } as ExecCtx;
  const t0 = ctx.otherState.trash.length;
  const r = run({ type: 'ADD_TO_FIELD', owner: 'opponent', source: { type: 'TRASH_CARD', owner: 'opponent', count: 1, upToCount: false, filter: { cardType: 'シグニ' } } } as EffectAction, ctx);
  ok(r.otherState.field.signi.some(s => s?.at(-1) === SIG), '相手の場にSIGが配置');
  eq(r.otherState.trash.includes(SIG), false, '相手トラッシュからSIG除去');
  eq(r.otherState.trash.length, t0 - 1, '相手トラッシュ-1');
  ok(!r.ownerState.field.signi.some(s => s?.at(-1) === SIG), '自分の場には配置されない');
});

// GRANT_EFFECT→相手LRIGへCONT POWER_MODIFY(levelLtSelf)付与＝lrig相対の動的比較（WXEX2-25-E3・続き67）
// resolveContSelfLevel が host=付与先LRIG のレベル基準で「このルリグより低いレベル」を解決することを検証。
test('lrig相対 CONT POWER_MODIFY: 相手LRIG(Lv4)付与の levelLtSelf が Lv未満シグニのみ-8000（WXEX2-25-E3）', () => {
  const LRIG4 = findCard(c => c.Type === 'ルリグ' && c.Level === '4');
  const me = mkState({});
  const op = mkState({ signi: [SIGNI_L3, SIGNI_L4, null] }); op.field.lrig = [LRIG4];
  const grantEff = { effectId: 'g', effectType: 'CONTINUOUS',
    action: { type: 'POWER_MODIFY', target: { type: 'SIGNI', owner: 'self', count: 'ALL', filter: { cardType: 'シグニ', levelLtSelf: true } }, delta: -8000 },
    duration: 'PERMANENT', mandatory: true } as unknown as CardEffect;
  const cm = cardMap as Map<string, CardData>;
  const p0 = calcFieldPowers(me, op, true, effectsMap, cm);
  const em = new Map(effectsMap); em.set(LRIG4, [...(effectsMap.get(LRIG4) ?? []), grantEff]);
  const p1 = calcFieldPowers(me, op, true, em, cm);
  eq((p1.get(SIGNI_L3) ?? 0) - (p0.get(SIGNI_L3) ?? 0), -8000, 'Lv3(<Lv4)に-8000');
  eq((p1.get(SIGNI_L4) ?? 0) - (p0.get(SIGNI_L4) ?? 0), 0, 'Lv4(≥Lv4)は不変');
});

// §3 Opusタスク12(xxvii/Cluster C)＝CONTINUOUS「あなたの[他の]レベルNのシグニのパワーを＋M」の group-buff が
// parser でレベル filter を認識できず owner:any/count:1 に潰れ「このシグニ自身のみ」へ縮退していた（WX10-061）。
// レベル filter を対象名詞句内から抽出して owner:self/count:ALL/level/excludeSelf を復元。
test('parse 「あなたの他のレベル３のシグニのパワーを＋3000」→ self/ALL/level3/excludeSelf（WX10-061）', () => {
  const e = parseCardEffects({ CardNum: 'TEST-LVBUF', Type: 'シグニ', EffectText: '【常】：あなたの他のレベル３のシグニのパワーを＋3000する。' } as unknown as CardData)[0];
  const a = e.action as unknown as { type: string; target: { owner: string; count: string; filter: { level: number } }; excludeSelf: boolean };
  eq(a.type, 'POWER_MODIFY', 'POWER_MODIFY');
  eq(a.target.owner, 'self', 'owner:self（従来は any に潰れ）');
  eq(a.target.count, 'ALL', 'count:ALL（従来は 1 に潰れ＝このシグニ自身のみ）');
  eq(a.target.filter.level, 3, 'level:3 フィルタ復元');
  eq(a.excludeSelf, true, '他の＝excludeSelf');
});
// タスク12(iii): WXK09-050【出】「表記されているパワーよりパワーの高いあなたの＜電機＞のシグニ…選んだ能力を得る」は
// power比較フィルタ＋DOWN/BOUNCE保護を扱うカード固有ハンドラ SIGNI_GRANT_CHOSEN_ABILITY（execStubPart1）へ委譲する。
// generic GRANT_CHOSEN_ABILITY（keyword_grantsベース・power比較/保護を扱えない）へ退化させない＝held ドリフト解消の固定。
test('parse WXK09-050【出】→ SIGNI_GRANT_CHOSEN_ABILITY（generic へ退化させない）', () => {
  const effs = parseCardEffects(cardMap.get('WXK09-050')!);
  const a = effs.find(e => e.effectId === 'WXK09-050-E2')?.action as unknown as { type: string; id: string };
  eq(a?.type, 'STUB', 'STUB');
  eq(a?.id, 'SIGNI_GRANT_CHOSEN_ABILITY', '表記パワー比較の能力付与はカード固有ハンドラへ委譲');
});
test('parse 「あなたの他の《ディソナアイコン》のシグニのパワーを＋3000」→ self/ALL/isDisona/excludeSelf（WXDi-P13-047）', () => {
  const e = parseCardEffects({ CardNum: 'TEST-DIS', Type: 'シグニ', EffectText: '【常】：あなたのターンの間、あなたの他の《ディソナアイコン》のシグニのパワーを＋3000する。' } as unknown as CardData)[0];
  const a = e.action as unknown as { target: { owner: string; count: string; filter: { isDisona?: boolean } }; excludeSelf: boolean };
  eq(a.target.owner, 'self', 'owner:self（従来は any/1 に潰れ＝自身のみ）');
  eq(a.target.count, 'ALL', 'count:ALL');
  eq(a.target.filter.isDisona, true, 'isDisona フィルタ復元');
  eq(a.excludeSelf, true, '他の＝excludeSelf');
});
// §3 Opusタスク12(xxvii)＝「あなたのすべての＜X＞のシグニをアップする」の group-up が UP{owner:self, count:1, filter無}
// に潰れ「1体だけアップ」へ縮退していた（WX11-038/WX05-036 等）。すべて＜X＞ の語順（すべてが種族の前）を拾えず
// フォールバックしていた。count:ALL＋種族/色 filter を復元（engine execUp は count:ALL+filter を完全対応）。
test('parse 「あなたのすべての＜迷宮＞のシグニをアップする」→ UP self/ALL/story迷宮（WX11-038）', () => {
  const e = parseCardEffects({ CardNum: 'TEST-UPG', Type: 'シグニ', EffectText: '【自】：あなたのターン終了時、あなたのすべての＜迷宮＞のシグニをアップする。' } as unknown as CardData)[0];
  const up = (function f(a: unknown): { target?: { owner: string; count: string; filter?: { story?: string } } } | null {
    let o: { target?: { owner: string; count: string; filter?: { story?: string } } } | null = null;
    (function w(x: unknown){ if(!x||typeof x!=='object')return; const r=x as Record<string, unknown>; if(r.type==='UP') o=r as { target?: { owner: string; count: string; filter?: { story?: string } } };
      for(const k of Object.keys(r)){ const v=r[k]; if(Array.isArray(v))v.forEach(w); else if(v&&typeof v==='object')w(v); } })(a); return o;
  })(e.action);
  ok(up !== null, 'UP がある');
  eq(up?.target?.owner, 'self', 'owner:self');
  eq(up?.target?.count, 'ALL', 'count:ALL（従来は 1 に潰れ＝1体だけアップ）');
  eq(up?.target?.filter?.story, '迷宮', 'story:迷宮 フィルタ復元（従来は filter 無し＝全シグニ対象化）');
});
test('parse 「あなたのすべての緑のシグニをアップし…」→ UP self/ALL/color緑（WXEX2-16・SEQUENCE先頭）', () => {
  const e = parseCardEffects({ CardNum: 'TEST-UPC', Type: 'シグニ', EffectText: '【自】：あなたのアタックフェイズ開始時、あなたのすべての緑のシグニをアップする。' } as unknown as CardData)[0];
  const a = e.action as unknown as { type: string; target?: { count: string; filter?: { color?: string } } };
  const up = a.type === 'UP' ? a : (a as unknown as { steps?: { type: string; target?: { count: string; filter?: { color?: string } } }[] }).steps?.find(s => s.type === 'UP');
  eq(up?.target?.count, 'ALL', 'count:ALL');
  eq(up?.target?.filter?.color, '緑', 'color:緑 フィルタ復元');
});
test('parse 「あなたの覚醒状態のシグニのパワーを＋3000」→ self/ALL/isAwakened（WXDi-P08-076）', () => {
  const e = parseCardEffects({ CardNum: 'TEST-AWK', Type: 'シグニ', EffectText: '【常】：あなたの覚醒状態のシグニのパワーを＋3000する。' } as unknown as CardData)[0];
  const a = e.action as unknown as { target: { owner: string; count: string; filter: { isAwakened?: boolean } } };
  eq(a.target.owner, 'self', 'owner:self');
  eq(a.target.count, 'ALL', 'count:ALL');
  eq(a.target.filter.isAwakened, true, 'isAwakened フィルタ復元');
});
// §3 Opusタスク12(xxvii)＝「あなたの中央のシグニゾーンにある[＜X＞]のシグニのパワーを＋N」の group-buff が
// owner:any/count:1 に潰れ「このシグニ自身のみ」へ縮退（WXDi-D02-24/WXK01-003 等）。centerZoneOnly filter を復元。
test('parse 「あなたの中央のシグニゾーンにある＜バーチャル＞のシグニのパワーを＋3000」→ self/ALL/centerZoneOnly+story（WXDi-D02-24）', () => {
  const e = parseCardEffects({ CardNum: 'TEST-CZ', Type: 'シグニ', EffectText: '【常】：あなたの中央のシグニゾーンにある＜バーチャル＞のシグニのパワーを＋3000する。' } as unknown as CardData)[0];
  const a = e.action as unknown as { target: { owner: string; count: string; filter: { centerZoneOnly?: boolean; story?: string } } };
  eq(a.target.owner, 'self', 'owner:self（従来は any/1 に潰れ）');
  eq(a.target.count, 'ALL', 'count:ALL');
  eq(a.target.filter.centerZoneOnly, true, 'centerZoneOnly フィルタ復元');
  eq(a.target.filter.story, 'バーチャル', 'story も併せて復元');
});
test('CONT POWER_MODIFY centerZoneOnly: 中央ゾーン(index1)のシグニのみ+3000（左右は不変）', () => {
  const me = mkState({ signi: [SIGNI_L1, SIGNI_L2, SIGNI_L3] }); // index0=左, 1=中央, 2=右
  const op = mkState({});
  const buffEff = { effectId: 'cz', effectType: 'CONTINUOUS',
    action: { type: 'POWER_MODIFY', target: { type: 'SIGNI', owner: 'self', count: 'ALL', filter: { cardType: 'シグニ', centerZoneOnly: true } }, delta: 3000 },
    duration: 'PERMANENT', mandatory: true } as unknown as CardEffect;
  const cm = cardMap as Map<string, CardData>;
  const p0 = calcFieldPowers(me, op, true, effectsMap, cm);
  const em = new Map(effectsMap); em.set(SIGNI_L1, [...(effectsMap.get(SIGNI_L1) ?? []), buffEff]);
  const p1 = calcFieldPowers(me, op, true, em, cm);
  eq((p1.get(SIGNI_L2) ?? 0) - (p0.get(SIGNI_L2) ?? 0), 3000, '中央ゾーン(index1)のシグニに+3000');
  eq((p1.get(SIGNI_L1) ?? 0) - (p0.get(SIGNI_L1) ?? 0), 0, '左ゾーン(index0)は不変');
  eq((p1.get(SIGNI_L3) ?? 0) - (p0.get(SIGNI_L3) ?? 0), 0, '右ゾーン(index2)は不変');
});
test('parse 条件節の level を対象へ誤付与しない（「レベル３の場合、…すべてのシグニ＋N」＝SPDi43-31/WX05-073 型）', () => {
  const e = parseCardEffects({ CardNum: 'TEST-LVCOND', Type: 'スペル', EffectText: 'あなたのセンタールリグがレベル４以上の場合、ターン終了時まで、あなたのすべてのシグニのパワーを＋5000する。' } as unknown as CardData)[0];
  // 対象は全シグニ（level フィルタ無し）。条件節の level4 を target.filter へ混入させない。
  const findPM = (a: unknown): { target?: { filter?: { level?: unknown } } } | null => {
    let out: { target?: { filter?: { level?: unknown } } } | null = null;
    (function w(x: unknown){ if(!x || typeof x !== 'object') return; const o = x as Record<string, unknown>;
      if (o.type === 'POWER_MODIFY') out = o as { target?: { filter?: { level?: unknown } } };
      for (const k of Object.keys(o)) { const v = o[k]; if (Array.isArray(v)) v.forEach(w); else if (v && typeof v === 'object') w(v); } })(a);
    return out;
  };
  const pm = findPM(e.action);
  ok(pm !== null, 'POWER_MODIFY がある');
  ok(pm?.target?.filter?.level === undefined, '全シグニ対象＝level フィルタは付かない（条件節 level の誤混入なし）');
});
// 続き155＝トリガー句除去後の条件節を second pass で拾う（「ある場合」許容込み）。回帰ガード。
test('条件節 second pass: 「ターン終了時、手札がN枚以上ある場合、」→ HAND_COUNT で action を CONDITIONAL 化（WX12-046 系）', () => {
  const e = parseCardEffects({ CardNum: 'TEST-CLQ1', Type: 'シグニ', EffectText: '【自】：あなたのターン終了時、あなたの手札が７枚以上ある場合、このシグニを場からトラッシュに置く。' } as unknown as CardData)[0];
  const a = e.action as { type?: string; condition?: { type?: string; operator?: string; value?: number } };
  eq(a.type, 'CONDITIONAL', 'ON_TURN_END 直後の条件節が CONDITIONAL に持ち上がる');
  eq(a.condition?.type, 'HAND_COUNT', 'HAND_COUNT 条件');
  eq(a.condition?.value, 7, '閾値7'); eq(a.condition?.operator, 'gte', 'gte');
});
test('条件節: 「このターンにあなたが手札をN枚以上捨てていた場合、」→ TURN_HAND_DISCARD_GTE（WX25-P3-090 系）', () => {
  const e = parseCardEffects({ CardNum: 'TEST-CLQ2', Type: 'シグニ', EffectText: '【自】：このシグニがアタックしたとき、このターンにあなたが手札を２枚以上捨てていた場合、カードを１枚引く。' } as unknown as CardData)[0];
  const a = e.action as { type?: string; condition?: { type?: string; value?: number } };
  eq(a.type, 'CONDITIONAL', 'TURN_HAND_DISCARD 条件が持ち上がる');
  eq(a.condition?.type, 'TURN_HAND_DISCARD_GTE', 'TURN_HAND_DISCARD_GTE'); eq(a.condition?.value, 2, '閾値2');
});
test('Cluster A 条件節: 同じ＜毒牙＞シグニに power>=20000 を要求（WXEX1-50-E1）', () => {
  const e = parseCardEffects({ CardNum: 'TEST-CLA-POWER-STORY', Type: 'シグニ', EffectText: '【自】：あなたのアタックフェイズ開始時、あなたの場にパワー20000以上の＜毒牙＞のシグニがある場合、カードを１枚引く。' } as unknown as CardData)[0];
  const a = e.action as { type?: string; condition?: { type?: string; filter?: { story?: string; powerRange?: { min?: number } } } };
  eq(a.type, 'CONDITIONAL', '条件節を CONDITIONAL に持ち上げる');
  eq(a.condition?.type, 'HAS_CARD_IN_FIELD', '同一カードへの積条件');
  eq(a.condition?.filter?.story, '毒牙', 'story:毒牙');
  eq(a.condition?.filter?.powerRange?.min, 20000, 'powerRange.min:20000');
  const cond = a.condition as never;
  const base = cardMap.get(SIGNI)!;
  const localMap = new Map(cardMap);
  localMap.set('TEST-POISON-20K', { ...base, CardNum: 'TEST-POISON-20K', Type: 'シグニ', CardClass: '毒牙', Power: '20000' });
  localMap.set('TEST-POISON-LOW', { ...base, CardNum: 'TEST-POISON-LOW', Type: 'シグニ', CardClass: '毒牙', Power: '12000' });
  localMap.set('TEST-NONPOISON-20K', { ...base, CardNum: 'TEST-NONPOISON-20K', Type: 'シグニ', CardClass: '精像', Power: '20000' });
  const yes = mkCtx({ signi: ['TEST-POISON-20K', null, null] }, {}); yes.cardMap = localMap;
  const no = mkCtx({ signi: ['TEST-POISON-LOW', 'TEST-NONPOISON-20K', null] }, {}); no.cardMap = localMap;
  ok(evalCondition(cond, yes), 'power>=20000 の＜毒牙＞なら成立');
  ok(!evalCondition(cond, no), '低power毒牙と高power非毒牙の別カードでは不成立');
});
// PLAN §3 Opusタスク12(xxvii) Cluster C: トラッシュ全回収の対象色脱落を回帰防止。
test('Cluster C parser: 「トラッシュからすべての黒のカード」→ self/ALL/color黒（WXK06-031-E2）', () => {
  const e = parseCardEffects({ CardNum: 'TEST-CLC-TRASH-COLOR', Type: 'シグニ', EffectText: '【起】《黒》：あなたのトラッシュからすべての黒のカードをデッキに加えてシャッフルする。' } as unknown as CardData)[0];
  const a = e.action as { type?: string; source?: { type?: string; owner?: string; count?: string; filter?: { color?: string } }; shuffle?: boolean };
  eq(a.type, 'TRANSFER_TO_DECK', 'TRANSFER_TO_DECK');
  eq(a.source?.type, 'TRASH_CARD', 'source はトラッシュ');
  eq(a.source?.owner, 'self', 'owner:self を維持');
  eq(a.source?.count, 'ALL', 'count:ALL を維持');
  eq(a.source?.filter?.color, '黒', '原文の黒 filter を復元');
  eq(a.shuffle, true, 'シャッフルを維持');
});
// PLAN §3 Opusタスク12(xxii) IS_MY_TURN化残: トラッシュ→デッキ全回収の count/story filter 脱落を回帰防止。
// 従来は非すべてを count:1 固定＋単色のみ抽出で「＜水獣＞のシグニ５枚を対象とし」が count:1/filter無しに潰れ、
// 後続の LAST_PROCESSED_COUNT_GTE 5 を常に偽にしていた（WX19-040）。
test('TRANSFER_TO_DECK parser: 「＜水獣＞のシグニ５枚を対象とし」→ count5+story水獣（WX19-040）', () => {
  const e = parseCardEffects({ CardNum: 'TEST-T2D-COUNT', Type: 'スペル', EffectText: 'あなたのトラッシュから＜水獣＞のシグニ５枚を対象とし、それらをデッキに加えてシャッフルする。この方法でカードを５枚デッキに加えた場合、カードを２枚引く。' } as unknown as CardData)[0];
  const a = e.action as { type?: string; steps?: Array<{ type?: string; source?: { count?: number; filter?: { cardType?: string; story?: string } }; condition?: { type?: string; value?: number } }> };
  eq(a.type, 'SEQUENCE', 'SEQUENCE');
  eq(a.steps?.[0].type, 'TRANSFER_TO_DECK', '前段 TRANSFER_TO_DECK');
  eq(a.steps?.[0].source?.count, 5, 'count:5 を原文から復元');
  eq(a.steps?.[0].source?.filter?.story, '水獣', 'story:水獣 を復元');
  eq(a.steps?.[1].condition?.type, 'LAST_PROCESSED_COUNT_GTE', '結果カウント条件を捕捉（IS_MY_TURN化しない）');
  eq(a.steps?.[1].condition?.value, 5, 'COUNT_GTE 5');
});
// 否定「＜X＞ではない」を positive filter に混ぜない回帰防止（WX22-006「＜精元＞ではない…７枚」）。
test('TRANSFER_TO_DECK parser: 「＜精元＞ではない…シグニ７枚」→ story:精元 を付けない（WX22-006）', () => {
  const e = parseCardEffects({ CardNum: 'TEST-T2D-NEG', Type: 'スペル', EffectText: 'あなたのトラッシュから＜精元＞ではないそれぞれ名前の異なるシグニ７枚をデッキに加えてシャッフルする。' } as unknown as CardData)[0];
  const a = e.action as { type?: string; source?: { count?: number; filter?: { story?: string; cardType?: string } } };
  eq(a.type, 'TRANSFER_TO_DECK', 'TRANSFER_TO_DECK');
  eq(a.source?.count, 7, 'count:7 を復元');
  ok(a.source?.filter?.story === undefined, '否定 story（精元）を positive filter にしない');
});
// PLAN §3 Opusタスク12(xxii): 語順「トラッシュに＜X＞のシグニがN枚以上置かれた」＝MILL 結果カウントを捕捉。
// 従来は parseThisWayTrashCondition/GenericCount が「トラッシュに置」連続一致を要求し、フィルタ名詞句が
// 「トラッシュに」と「置」の間に入る語順を取りこぼしていた（WXEX1-47）。
test('MILL 結果カウント: 語順「トラッシュに＜古代兵器＞のシグニが５枚以上置かれた」→TRASHED_STORY_COUNT_GTE（WXEX1-47）', () => {
  const e = parseCardEffects({ CardNum: 'TEST-MILL-WORDORDER', Type: 'シグニ', EffectText: '【自】：このシグニがアタックしたとき、あなたのデッキの上からカードを７枚トラッシュに置く。その後、この方法でトラッシュに＜古代兵器＞のシグニが５枚以上置かれた場合、カードを１枚引く。' } as unknown as CardData)[0];
  const a = e.action as { type?: string; steps?: Array<{ type?: string; condition?: { type?: string; story?: string; count?: number } }> };
  eq(a.type, 'SEQUENCE', 'SEQUENCE');
  eq(a.steps?.[1].condition?.type, 'TRASHED_STORY_COUNT_GTE', '語順違いでも結果カウント条件を捕捉');
  eq(a.steps?.[1].condition?.story, '古代兵器', 'story:古代兵器');
  eq(a.steps?.[1].condition?.count, 5, 'count:5');
});
// PLAN §3 Opusタスク12(xxii): BANISH/ミル結果の色（OR）判定を LAST_PROCESSED_MATCHES で捕捉。
// 「その後、それが青か緑のシグニの場合」（WX21-016）・「それらに白か黒のシグニが１体以上含まれる場合」（WX21-010）。
test('LAST_PROCESSED_MATCHES color OR: 「それが青か緑のシグニの場合」（WX21-016）', () => {
  const e = parseCardEffects({ CardNum: 'TEST-LPM-COLOR', Type: 'スペル', EffectText: '対戦相手のシグニ１体を対象とし、それをバニッシュする。その後、それが青か緑のシグニの場合、カードを１枚引く。' } as unknown as CardData)[0];
  const a = e.action as { steps?: Array<{ condition?: { type?: string; filter?: { color?: string[]; cardType?: string } } }> };
  eq(a.steps?.[1].condition?.type, 'LAST_PROCESSED_MATCHES', 'BANISH 結果の色判定を捕捉（IS_MY_TURN化しない）');
  eq(JSON.stringify(a.steps?.[1].condition?.filter?.color), JSON.stringify(['青', '緑']), '青または緑の OR');
});
test('LAST_PROCESSED_MATCHES color OR: 「それらに白か黒のシグニが１体以上含まれる場合」（WX21-010）', () => {
  const e = parseCardEffects({ CardNum: 'TEST-LPM-INCL', Type: 'スペル', EffectText: '対戦相手のシグニ２体を対象とし、それらをバニッシュする。その後、それらに白か黒のシグニが１体以上含まれる場合、カードを１枚引く。' } as unknown as CardData)[0];
  const a = e.action as { steps?: Array<{ condition?: { type?: string; minCount?: number; filter?: { color?: string[] } } }> };
  eq(a.steps?.[1].condition?.type, 'LAST_PROCESSED_MATCHES', '含まれる形も捕捉');
  eq(JSON.stringify(a.steps?.[1].condition?.filter?.color), JSON.stringify(['白', '黒']), '白または黒の OR');
  eq(a.steps?.[1].condition?.minCount, 1, '１体以上');
});
// 複色 REVEAL は当該カード固有の MANUAL。白・黒の OR と既存 owner/count/zone を固定する。
test('Cluster C MANUAL: REVEAL 白か黒の＜天使＞→ color OR（WXEX1-57-E1）', () => {
  const card = cardMap.get('WXEX1-57');
  ok(!!card, 'WXEX1-57 カードデータがある');
  const e = mergeManualEffects('WXEX1-57', parseCardEffects(card!))[0];
  const a = e.action as { type?: string; owner?: string; revealCount?: number; pickCount?: number; filter?: { cardType?: string; story?: string; color?: string[] }; then?: { type?: string; source?: { type?: string; owner?: string; count?: number } } };
  eq(e.parseStatus, 'MANUAL', 'カード固有 MANUAL 上書き');
  eq(a.type, 'REVEAL_AND_PICK', 'REVEAL_AND_PICK');
  eq(a.owner, 'self', 'owner:self を維持');
  eq(a.revealCount, 1, 'デッキトップ1枚');
  eq(a.pickCount, 1, '該当カード1枚');
  eq(a.filter?.cardType, 'シグニ', 'シグニ限定');
  eq(a.filter?.story, '天使', '＜天使＞限定');
  eq(JSON.stringify(a.filter?.color), JSON.stringify(['白', '黒']), '白または黒の OR');
  eq(a.then?.type, 'TRANSFER_TO_HAND', '該当カードを手札へ');
  eq(a.then?.source?.owner, 'self', '自分のデッキカード');
});
test('CONT POWER_MODIFY level+excludeSelf: 他のLv3自シグニのみ+3000（自身/Lv2/相手Lv3は不変）（WX10-061）', () => {
  const L3a = findCard(c => isSigni(c) && c.Level === '3');
  const L3b = findCard(c => isSigni(c) && c.Level === '3' && c.CardNum !== L3a);
  const me = mkState({ signi: [L3a, L3b, SIGNI_L2] });
  const op = mkState({ signi: [findCard(c => isSigni(c) && c.Level === '3' && c.CardNum !== L3a && c.CardNum !== L3b), null, null] });
  const buffEff = { effectId: 'b', effectType: 'CONTINUOUS',
    action: { type: 'POWER_MODIFY', target: { type: 'SIGNI', owner: 'self', count: 'ALL', filter: { cardType: 'シグニ', level: 3 } }, delta: 3000, excludeSelf: true },
    duration: 'PERMANENT', mandatory: true } as unknown as CardEffect;
  const cm = cardMap as Map<string, CardData>;
  const p0 = calcFieldPowers(me, op, true, effectsMap, cm);
  const em = new Map(effectsMap); em.set(L3a, [...(effectsMap.get(L3a) ?? []), buffEff]);
  const p1 = calcFieldPowers(me, op, true, em, cm);
  eq((p1.get(L3b) ?? 0) - (p0.get(L3b) ?? 0), 3000, '他のLv3自シグニに+3000');
  eq((p1.get(L3a) ?? 0) - (p0.get(L3a) ?? 0), 0, '効果元自身は excludeSelf で不変');
  eq((p1.get(SIGNI_L2) ?? 0) - (p0.get(SIGNI_L2) ?? 0), 0, 'Lv2 は level:3 フィルタ外で不変');
  const oppL3 = op.field.signi[0]![0];
  eq((p1.get(oppL3) ?? 0) - (p0.get(oppL3) ?? 0), 0, '相手Lv3は owner:self で不変');
});

// GRANT_EFFECT を相手センタールリグへ＝granted_effects に格納される（WXEX2-25-E3 実アクション・続き67）
test('GRANT_EFFECT→相手LRIG: 相手のgranted_effectsに付与格納（WXEX2-25-E3）', () => {
  const LRIG4 = findCard(c => c.Type === 'ルリグ' && c.Level === '4');
  const base = mkCtx({}, {});
  const ctx = { ...base, otherState: { ...base.otherState, field: { ...base.otherState.field, lrig: [LRIG4] } } } as ExecCtx;
  const action = { type: 'GRANT_EFFECT', target: { type: 'LRIG', owner: 'opponent', count: 1 }, duration: 'UNTIL_END_OF_TURN',
    effect: { effectId: 'WXEX2-25-E3-GRANT', effectType: 'CONTINUOUS', action: { type: 'POWER_MODIFY', target: { type: 'SIGNI', owner: 'self', count: 'ALL', filter: { cardType: 'シグニ', levelLtSelf: true } }, delta: -8000 }, duration: 'PERMANENT', mandatory: true } };
  const r = run(action as unknown as EffectAction, ctx);
  const granted = (r.otherState.granted_effects as Record<string, CardEffect[]> | undefined)?.[LRIG4] ?? [];
  ok(granted.some(e => e.effectId === 'WXEX2-25-E3-GRANT'), '相手LRIGのgranted_effectsに付与格納');
});

// デッキ相対SEARCH: 捨てたシグニ基準のレベルフィルタ（§3タスク3 動的比較・続き68）
const searchAct = (filter: object, maxCount = 1) => ({ type: 'SEARCH', from: { location: 'deck', owner: 'self' }, filter, maxCount,
  then: { type: 'SEQUENCE', steps: [{ type: 'REVEAL' }, { type: 'ADD_TO_HAND', owner: 'self' }] }, afterSearch: { type: 'SHUFFLE_DECK', owner: 'self' } });
test('SEARCH levelEqDiscardSigniOffset:1: 捨てレベル2→レベル3のみサーチ対象（WDK13-013）', () => {
  const base = mkCtx({}, {});
  const ctx = { ...base, ownerState: { ...base.ownerState, deck: [SIGNI_L2, SIGNI_L3, SIGNI_L4], last_discarded_signi_level: 2 } } as ExecCtx;
  const r = run(searchAct({ cardType: 'シグニ', levelEqDiscardSigniOffset: 1 }) as unknown as EffectAction, ctx);
  ok(r.ownerState.hand.includes(SIGNI_L3), 'レベル3(=2+1)を手札に');
  ok(!r.ownerState.deck.includes(SIGNI_L3), 'レベル3がデッキから抜けた');
  ok(r.ownerState.deck.includes(SIGNI_L2) && r.ownerState.deck.includes(SIGNI_L4), 'レベル2/4はサーチ対象外で残る');
});
test('SEARCH levelLtDiscardSigni: 捨てレベル3→レベル<3(=1,2)のみサーチ対象（WXEX2-37）', () => {
  const base = mkCtx({}, {});
  const ctx = { ...base, ownerState: { ...base.ownerState, deck: [SIGNI_L4, SIGNI_L2, SIGNI_L1], last_discarded_signi_level: 3 } } as ExecCtx;
  const r = run(searchAct({ cardType: 'シグニ', levelLtDiscardSigni: true }, 2) as unknown as EffectAction, ctx);
  ok(!r.ownerState.deck.includes(SIGNI_L2) && !r.ownerState.deck.includes(SIGNI_L1), 'レベル1/2(<3)はサーチ対象で抜ける');
  ok(r.ownerState.deck.includes(SIGNI_L4), 'レベル4(≥3)はサーチ対象外で残る');
});

// §3 Opusタスク10 パターンF-2＝「代わりに」の条件語彙が無く、置換ゲートが立たずに **SEQUENCE で両方実行**されていた。
test('parse 「対戦相手の効果で手札がトラッシュに移動していた場合、代わりに…」→ CONDITIONAL 置換（F-2）', () => {
  const e = parseCardEffects({ CardNum: 'TEST-REPL', Type: 'ピース', EffectText: 'カードを１枚引く。このターンに対戦相手の効果によってあなたの手札からカードが１枚以上トラッシュに移動していた場合、代わりにカードを３枚引く。' } as unknown as CardData)[0];
  const a = e.action as unknown as { type: string; condition: { type: string; value: number }; then: { count: number }; else: { count: number } };
  eq(a.type, 'CONDITIONAL', '置換（従来は SEQUENCE で 1枚→3枚＝計4枚引く過剰効果）');
  eq(a.condition.type, 'HAND_TRASHED_BY_OPP', '新設した条件語彙');
  eq(a.then.count, 3, '条件成立なら3枚');
  eq(a.else.count, 1, '不成立なら1枚');
});
test('HAND_TRASHED_BY_OPP: 相手効果で手札が捨てられた場合だけ then が走る（engine・F-2）', () => {
  const repl = { type: 'CONDITIONAL',
    condition: { type: 'HAND_TRASHED_BY_OPP', owner: 'self', operator: 'gte', value: 1 },
    then: { type: 'DRAW', owner: 'self', count: 3 },
    else: { type: 'DRAW', owner: 'self', count: 1 } } as unknown as EffectAction;
  const base = mkCtx({}, {});
  const n0 = base.ownerState.hand.length;
  eq(run(repl, base).ownerState.hand.length, n0 + 1, '未発生なら else（1枚）');
  const hit = { ...base, ownerState: { ...base.ownerState, hand_trashed_by_opp_this_turn: 2 } };
  eq(run(repl, hit).ownerState.hand.length, n0 + 3, '発生していれば then（3枚）＝置換であって加算ではない');
  // エナ側は独立したカウンタ（手札が捨てられてもエナ条件は立たない）
  const enRepl = { ...(repl as unknown as { condition: { type: string } }), condition: { type: 'ENERGY_TRASHED_BY_OPP', owner: 'self', operator: 'gte', value: 1 } } as unknown as EffectAction;
  eq(run(enRepl, hit).ownerState.hand.length, n0 + 1, 'エナ側は別カウンタ');
});
test('execTrash: 相手の手札をトラッシュすると相手側のカウンタが増える（engine・F-2）', () => {
  const ctx = mkCtx({}, {});
  const r = run({ type: 'TRASH', target: { type: 'HAND_CARD', owner: 'opponent', count: 'ALL' } } as unknown as EffectAction, ctx);
  eq((r.otherState.hand_trashed_by_opp_this_turn ?? 0) >= 1, true, '捨てさせた側（相手）のカウンタが増える');
  eq(r.ownerState.hand_trashed_by_opp_this_turn ?? 0, 0, '自分側は増えない');
});

// §3 Opusタスク10 パターンF-4＝「**次の**あなたのアタックフェイズ開始時、…」の遅延句が落ちて**即時実行**されていた。
test('parse 「次のあなたのアタックフェイズ開始時、…」→ INSTALL_DELAYED_TRIGGER（F-4）', () => {
  const e = parseCardEffects({ CardNum: 'TEST-DLY', Type: 'アーツ', EffectText: '次のあなたのアタックフェイズ開始時、カードを２枚引く。' } as unknown as CardData)[0];
  const a = e.action as unknown as { type: string; duration: string; trigger: { timing: string }; effect: { type: string; count: number } };
  eq(a.type, 'INSTALL_DELAYED_TRIGGER', '遅延トリガーとして設置（従来はその場で引いていた）');
  eq(a.trigger.timing, 'ON_ATTACK_PHASE_START', 'アタックフェイズ開始時に発火');
  eq(a.effect.type, 'DRAW', '内側は元の効果');
  eq(a.effect.count, 2, '2枚');
});
test('Stage2 collectTurnTriggers: 設置した遅延トリガーがアタックフェイズ開始時に発火（F-4・engine）', () => {
  const dt = { type: 'INSTALL_DELAYED_TRIGGER', duration: 'THIS_TURN', trigger: { timing: 'ON_ATTACK_PHASE_START' }, effect: { type: 'DRAW', owner: 'self', count: 2 } } as unknown as import('../src/types/effects').InstallDelayedTriggerAction;
  const host: PlayerState = { ...mkState({}), delayed_triggers: [dt] };
  const guest = mkState({});
  const fired = cttEntries(trigCtx(HOST, HOST), 'ON_ATTACK_PHASE_START', host, guest);
  eq(fired.some(e => e.effectId === 'DELAYED_TRIGGER'), true, 'アタックフェイズ開始時に発火');
  eq(cttEntries(trigCtx(HOST, HOST), 'ON_TURN_START', host, guest).some(e => e.effectId === 'DELAYED_TRIGGER'), false, '別 timing では非発火');
  eq(cttEntries(trigCtx(HOST, HOST), 'ON_ATTACK_PHASE_START', mkState({}), guest).some(e => e.effectId === 'DELAYED_TRIGGER'), false, '未設置は非発火');
});

// §3 Opusタスク10 パターンF-3＝スペルの「【自】：」ブロックが本体から分離されず、**後続の独立した【自】能力が
// スペル本体（最後の選択肢）に流入**していた（アーツには分離処理があったがスペルには無かった）。
test('parse スペルの【自】ブロックは独立した効果に分離される（F-3）', () => {
  const card = { CardNum: 'TEST-SPAUTO', Type: 'スペル', EffectText: '以下の２つから１つを選ぶ。①カードを１枚引く。②対戦相手のすべてのシグニを凍結する。【自】：対戦相手のターン終了時、このカードをトラッシュから手札に加える。' } as unknown as CardData;
  const eff = parseCardEffects(card);
  eq(eff.length, 2, '本体＋【自】の2効果に分かれる');
  eq(eff[0].effectType, 'ACTIVATED', '本体はスペル');
  eq(eff[1].effectType, 'AUTO', '【自】は独立した AUTO 効果');
  const ch = eff[0].action as unknown as { type: string; choices: { action: { type: string } }[] };
  eq(ch.type, 'CHOOSE', 'CHOOSE');
  eq(ch.choices[1].action.type, 'FREEZE', '最後の選択肢に【自】が流入しない（従来は SEQUENCE に連結されていた）');
});

// §3 Opusタスク10 パターンF-1＝連用中止形の並列動作「Aし、Bする」で **先頭の動作が無言脱落**していた。
test('parse 連用中止形「Aし、Bする」→ SEQUENCE（先頭の動作を落とさない・F-1）', () => {
  const mk = (t: string) => parseCardEffects({ CardNum: 'TEST-CONJ', Type: 'アーツ', EffectText: t } as unknown as CardData)[0];
  const a1 = mk('対象の対戦相手のシグニ１体をバニッシュし、対象の対戦相手のシグニ１体をダウンする。').action as unknown as { type: string; steps: { type: string }[] };
  eq(a1.type, 'SEQUENCE', 'SEQUENCE化');
  eq(a1.steps.map(s => s.type).join(','), 'BANISH,DOWN', 'バニッシュが消えない（従来は DOWN だけ）');
  const a2 = mk('手札をすべて捨て、カードを４枚引く。').action as unknown as { type: string; steps: { type: string }[] };
  eq(a2.steps.map(s => s.type).join(','), 'TRASH,DRAW', '手札全捨てが消えない（従来は DRAW だけ）');
  // ⚠「〜を対象とし、」は対象指定の節＝分割しない
  const t1 = mk('あなたのシグニ１体を対象とし、それをバニッシュする。').action as unknown as { type: string };
  eq(t1.type, 'BANISH', '対象節は分割しない');
  // ⚠SEARCH 文（「探して場に出し、デッキをシャッフルする」）は1つの SEARCH＝分割しない
  const s1 = mk('あなたのデッキからシグニ１枚を探して場に出し、デッキをシャッフルする。').action as unknown as { type: string };
  ok(JSON.stringify(s1).includes('SEARCH'), 'SEARCH が壊れない');
});

// §3 Opusタスク10 パターンE＝主語「対戦相手は…」を見ずに owner:'self' に固定していた（相手を利する
// デメリットが自分の利益に化ける）＋手札の EXILE が TRASH に潰れていた。
test('parse 「対戦相手はカードを引く／エナゾーンに置く」の owner が opponent（パターンE）', () => {
  const mk = (t: string) => parseCardEffects({ CardNum: 'TEST-OPPGAIN', Type: 'アーツ', EffectText: t } as unknown as CardData)[0];
  const d = mk('対戦相手はカードを１枚引く。');
  eq((d.action as unknown as { type: string; owner: string }).owner, 'opponent', '相手がドロー（従来は自分が引く）');
  const e = mk('対戦相手はデッキの一番上のカードをエナゾーンに置く。');
  eq((e.action as unknown as { type: string; owner: string }).owner, 'opponent', '相手がエナチャージ');
  // 自分主語は従来どおり
  eq((mk('カードを１枚引く。').action as unknown as { owner: string }).owner, 'self', '主語なし＝自分');
});
test('parse 「対戦相手はあなたの手札をN枚見ないで選び、ゲームから除外する」→ EXILE(HAND_CARD, blind)', () => {
  const e = parseCardEffects({ CardNum: 'TEST-BEX', Type: 'アーツ', EffectText: '対戦相手はあなたの手札を２枚見ないで選び、あなたはそれらをゲームから除外する。' } as unknown as CardData)[0];
  const a = e.action as unknown as { type: string; blind: boolean; target: { type: string; owner: string; count: number } };
  eq(a.type, 'EXILE', 'EXILE（従来は TRASH＝トラッシュ行きに潰れていた）');
  eq(a.target.type, 'HAND_CARD', '手札から');
  eq(a.target.count, 2, '2枚（従来は1枚に潰れていた）');
  eq(a.blind, true, '見ないで選ぶ');
});
test('EXILE(HAND_CARD) 実行: 手札がゲームから除外される（トラッシュには行かない）', () => {
  const ctx = mkCtx({}, {});
  const before = ctx.ownerState.hand.length;
  const trashBefore = ctx.ownerState.trash.length;
  const r = run({ type: 'EXILE', target: { type: 'HAND_CARD', owner: 'self', count: 2 }, blind: true } as unknown as EffectAction, ctx);
  eq(r.ownerState.hand.length, before - 2, '手札が2枚減る');
  eq(r.ownerState.trash.length, trashBefore, 'トラッシュには増えない（＝ゲーム除外）');
});

// §3 Opusタスク12(xxii) 捨てカウントバッチ＝「手札を捨てる。この方法でカードをN枚(以上)捨てた場合、X」の
// 後置カウント条件を parser が抽出できず IS_MY_TURN 化（常時true）していた過剰実行バグ。前段 TRASH{HAND_CARD} が
// lastProcessedCards を記録することを engine で確認済み → LAST_PROCESSED_COUNT_GTE へ抽出。
test('parse 「手札をすべて捨てる。この方法でカードをN枚以上捨てた場合、X」→ LAST_PROCESSED_COUNT_GTE', () => {
  const e = parseCardEffects({ CardNum: 'TEST-DISC', Type: 'スペル', EffectText: '手札をすべて捨てる。この方法でカードを２枚以上捨てた場合、カードを１枚引く。' } as unknown as CardData)[0];
  const seq = e.action as unknown as { type: string; steps: { type: string; condition?: { type: string; value: number } }[] };
  eq(seq.type, 'SEQUENCE', 'SEQUENCE（捨て→条件付きドロー）');
  eq(seq.steps[0].type, 'TRASH', '第1ステップ＝手札を捨てる');
  eq(seq.steps[1].type, 'CONDITIONAL', '第2ステップ＝条件付き（従来は IS_MY_TURN 常時true）');
  eq(seq.steps[1].condition?.type, 'LAST_PROCESSED_COUNT_GTE', '捨てた枚数のカウント閾値');
  eq(seq.steps[1].condition?.value, 2, '2枚以上');
});
test('parse 否定「この方法で手札をN枚捨てなかった場合」は COUNT_GTE 化しない（Cluster C 据置）', () => {
  const e = parseCardEffects({ CardNum: 'TEST-DISCNEG', Type: 'スペル', EffectText: '手札を１枚捨てる。この方法で手札を１枚捨てなかった場合、カードを１枚引く。' } as unknown as CardData)[0];
  const seq = e.action as unknown as { steps: { type: string; condition?: { type: string } }[] };
  const cond = seq.steps.find(s => s.type === 'CONDITIONAL')?.condition;
  ok(cond?.type !== 'LAST_PROCESSED_COUNT_GTE', '否定条件は COUNT_GTE に誤変換しない（据置）');
});
test('engine 実行: TRASH{HAND ALL}→CONDITIONAL{COUNT_GTE:2} は捨てた枚数でゲートされる', () => {
  const seq = { type: 'SEQUENCE', steps: [
    { type: 'TRASH', target: { type: 'HAND_CARD', owner: 'self', count: 'ALL' } },
    { type: 'CONDITIONAL', condition: { type: 'LAST_PROCESSED_COUNT_GTE', value: 2 }, then: { type: 'DRAW', owner: 'self', count: 1 } },
  ] } as unknown as EffectAction;
  // 手札3枚→全捨て（3枚）→COUNT_GTE:2 true→ドロー
  const c3 = mkCtx({ hand: 3 }, {});
  const d3Before = c3.ownerState.deck.length;
  const r3 = run(seq, c3);
  eq(r3.ownerState.hand.length, 1, '全捨て後ドロー1枚で手札1枚（3捨て→0→+1）');
  eq(r3.ownerState.deck.length, d3Before - 1, '2枚以上捨てたのでドロー発火');
  // 手札1枚→全捨て（1枚）→COUNT_GTE:2 false→ドローなし
  const c1 = mkCtx({ hand: 1 }, {});
  const d1Before = c1.ownerState.deck.length;
  const r1 = run(seq, c1);
  eq(r1.ownerState.hand.length, 0, '1枚捨てて手札0（ドロー未発火）');
  eq(r1.ownerState.deck.length, d1Before, '1枚しか捨てていないのでドロー未発火（過剰実行しない）');
});

// §3 Opusタスク12(xxix)②＝「（対象を）手札に加えるか場に出す」の行き先二択が「手札に加える」だけに
// 縮退し「場に出す」選択肢を無言脱落させていた系統バグ（LIFE_BURST 中心 85効果）。CHOOSE(手札/場) へ
// 包み直し、source を両枝で共有する（wrapHandOrField）。
test('parse 「トラッシュから…を手札に加えるか場に出す」→ CHOOSE(手札/場) で行き先二択（縮退防止）', () => {
  const e = parseCardEffects({ CardNum: 'TEST-HOF', Type: 'スペル', EffectText: '：あなたのトラッシュから＜悪魔＞のシグニ１枚を対象とし、それを手札に加えるか場に出す。' } as unknown as CardData)[0];
  const a = e.action as unknown as { type: string; from_count: number; choices: { choiceId: string; action: { type: string; source?: { type: string }; owner?: string } }[] };
  eq(a.type, 'CHOOSE', 'CHOOSE（従来は TRANSFER_TO_HAND に縮退＝場に出す選択肢が脱落）');
  eq(a.from_count, 2, '2択');
  eq(a.choices[0].choiceId, 'hand', '第1枝＝手札');
  eq(a.choices[0].action.type, 'TRANSFER_TO_HAND', '手札枝は TRANSFER_TO_HAND');
  eq(a.choices[1].choiceId, 'field', '第2枝＝場');
  eq(a.choices[1].action.type, 'ADD_TO_FIELD', '場枝は ADD_TO_FIELD');
  eq(a.choices[1].action.owner, 'self', '場に出すのは自分');
  eq(a.choices[0].action.source?.type, 'TRASH_CARD', '両枝で同じ出処（トラッシュ）を共有');
  eq(a.choices[1].action.source?.type, 'TRASH_CARD', '場枝も同じトラッシュ source');
});
test('parse 「手札に加える」だけ（場に出す なし）は包まない＝TRANSFER_TO_HAND のまま（誤爆防止）', () => {
  const e = parseCardEffects({ CardNum: 'TEST-HONLY', Type: 'スペル', EffectText: '：あなたのトラッシュからシグニ１枚を対象とし、それを手札に加える。' } as unknown as CardData)[0];
  eq((e.action as unknown as { type: string }).type, 'TRANSFER_TO_HAND', '行き先二択でない単純回収は包まない');
});

// §3 Opusタスク10 パターンD＝条件ゲートの脱落。「ライフクロスがN枚**以上/以下**の場合」しか規則が無く、
// 「**ちょうどN枚**の場合」が丸ごと落ちて**無条件発火**の過剰効果になっていた（WD20-018②＝自分の全シグニをトラッシュ）。
test('parse 「ライフクロスがN枚の場合」（以上/以下なし）→ LIFE_COUNT eq でゲートされる（パターンD）', () => {
  const e = parseCardEffects({ CardNum: 'TEST-LC0', Type: 'スペル', EffectText: 'あなたのライフクロスが０枚の場合、あなたのすべてのシグニを場からトラッシュに置いてもよい。' } as unknown as CardData)[0];
  const a = e.action as unknown as { type: string; condition: { type: string; operator: string; value: number } };
  eq(a.type, 'CONDITIONAL', '条件ゲートが立つ（従来は無条件に全シグニをトラッシュ）');
  eq(a.condition.type, 'LIFE_COUNT', 'LIFE_COUNT');
  eq(a.condition.operator, 'eq', 'ちょうどN枚＝eq');
  eq(a.condition.value, 0, '0枚');
  // 既存の「以上/以下」も従来どおり
  const lte = parseCardEffects({ CardNum: 'TEST-LC2', Type: 'スペル', EffectText: 'あなたのライフクロスが２枚以下の場合、カードを１枚引く。' } as unknown as CardData)[0];
  eq((lte.action as unknown as { condition: { operator: string } }).condition.operator, 'lte', '以下＝lte');
});

// §3 Opusタスク10 パターンC＝選択肢が原文と無関係の STUB／アクションへ誤マッチしていた。
test('parse 「選んだ能力を得る」①②は能力名＝素のCHOOSEに組まない（GRANT_CHOSEN_ABILITY へ委譲・パターンC）', () => {
  const tgt = parseCardEffects({ CardNum: 'TEST-GCA', Type: 'キー', EffectText: '【出】：以下の２つから１つを選ぶ。あなたのシグニ１体を対象とし、ターン終了時まで、それは選んだ能力を得る。①【アサシン】②【ランサー】' } as unknown as CardData)[0];
  eq((tgt.action as unknown as { id?: string }).id, 'GRANT_CHOSEN_ABILITY', '対象シグニへの付与（従来は②【ランサー】が DRAW に化けていた）');
  const slf = parseCardEffects({ CardNum: 'TEST-GCAS', Type: 'シグニ', EffectText: '【起】：以下の２つから１つを選ぶ。ターン終了時まで、このシグニは選んだ能力を得る。①【アサシン】②【ダブルクラッシュ】' } as unknown as CardData)[0];
  eq((slf.action as unknown as { id?: string }).id, 'GRANT_CHOSEN_ABILITY_SELF', '「このシグニは」＝自身への付与');
});
test('parse 「対戦相手は自分の効果で引いたり手札に加えたりできない」→ BLOCK_ACTION（パターンC）', () => {
  const e = parseCardEffects({ CardNum: 'TEST-BLKDRAW', Type: 'アーツ', EffectText: 'このターン、対戦相手は自分の効果によって、カードを引いたりカードを手札に加えることができない。' } as unknown as CardData)[0];
  const a = e.action as unknown as { type: string; actionId: string; until: string; target: { owner: string } };
  eq(a.type, 'BLOCK_ACTION', 'BLOCK_ACTION（従来は STUB LRIG_GROW_RESTRICT＝ルリグ成長制限に誤マッチ）');
  eq(a.actionId, 'DRAW_OR_ADD_TO_HAND_BY_EFFECT', 'ドロー/手札加え禁止');
  eq(a.target.owner, 'opponent', '対戦相手');
  eq(a.until, 'END_OF_TURN', 'このターン');
});
test('BLOCK_ACTION DRAW_OR_ADD_TO_HAND_BY_EFFECT 実行: 効果ドローが止まる', () => {
  const base = mkCtx({}, {});
  const blocked = { ...base, ownerState: { ...base.ownerState, blocked_actions: ['DRAW_OR_ADD_TO_HAND_BY_EFFECT'] } };
  const before = blocked.ownerState.hand.length;
  const r = run({ type: 'DRAW', owner: 'self', count: 2 } as unknown as EffectAction, blocked);
  eq(r.ownerState.hand.length, before, '封じられている間は引けない');
  const r2 = run({ type: 'DRAW', owner: 'self', count: 2 } as unknown as EffectAction, base);
  eq(r2.ownerState.hand.length, before + 2, '通常は引ける');
});

// §3 Opusタスク10 パターンB＝ルリグ対象がシグニ対象に誤解決していた（FREEZE / NEGATE_ATTACK）。
test('parse センタールリグ対象: 凍結／アタック無効が LRIG に解決される（パターンB）', () => {
  const frz = parseCardEffects({ CardNum: 'TEST-LFRZ', Type: 'アーツ', EffectText: '対戦相手のセンタールリグ１体を対象とし、それを凍結する。' } as unknown as CardData)[0];
  const fa = frz.action as unknown as { type: string; target: { type: string; owner: string } };
  eq(fa.type, 'FREEZE', 'FREEZE');
  eq(fa.target.type, 'LRIG', 'ルリグ対象（従来はシグニ対象に化けていた）');
  const neg = parseCardEffects({ CardNum: 'TEST-LNEG', Type: 'アーツ', EffectText: 'このターン、対戦相手のセンタールリグがアタックしたとき、そのアタックを無効にする。' } as unknown as CardData)[0];
  eq((neg.action as unknown as { target: { type: string } }).target.type, 'LRIG', 'アタック無効もルリグ対象');
  // 「センタールリグ**ではない**対戦相手のルリグ」＝アシストルリグ＝engine に受け皿が無いので LRIG にしない
  const asst = parseCardEffects({ CardNum: 'TEST-LASST', Type: 'アーツ', EffectText: 'センタールリグではない対戦相手のルリグ１体を対象とし、それを凍結する。' } as unknown as CardData)[0];
  ok((asst.action as unknown as { target?: { type: string } }).target?.type !== 'LRIG', 'アシストルリグはセンター扱いにしない');
});
test('parse 「ルリグかシグニ」（センター表記なし）も CENTER_LRIG_OR_SIGNI（パターンB 同根）', () => {
  const d1 = parseCardEffects({ CardNum: 'TEST-LS1', Type: 'アーツ', EffectText: '対戦相手のルリグかシグニ１体を対象とし、それをダウンする。' } as unknown as CardData)[0];
  eq((d1.action as unknown as { target: { type: string } }).target.type, 'CENTER_LRIG_OR_SIGNI', '「ルリグかシグニ」（従来はシグニ限定に潰れていた）');
  const d2 = parseCardEffects({ CardNum: 'TEST-LS2', Type: 'アーツ', EffectText: '対戦相手のルリグとシグニを合計２体まで対象とし、それらをダウンする。' } as unknown as CardData)[0];
  const t2 = (d2.action as unknown as { target: { type: string; count: number; upToCount?: boolean } }).target;
  eq(t2.type, 'CENTER_LRIG_OR_SIGNI', '「ルリグとシグニを合計N体まで」');
  eq(t2.count, 2, '2体');
  eq(t2.upToCount, true, 'まで＝upToCount');
});
test('FREEZE(LRIG) 実行: 相手センタールリグが lrig_frozen になる', () => {
  const ctx = mkCtx({}, {});
  const r = run({ type: 'FREEZE', target: { type: 'LRIG', owner: 'opponent', count: 1 } } as unknown as EffectAction, ctx);
  eq(r.otherState.field.lrig_frozen, true, '相手ルリグが凍結');
  eq(r.otherState.field.lrig_down ?? false, false, 'down:false ならダウンはしない');
});

// 5択CHOOSE（§3 Opusタスク10 パターンA）＝選択肢の丸数字クラスが ④ 止まりで **⑤が④に吸収され1つ消えていた**。
test('parse 5択CHOOSE: ⑤まで正しく分割される（PR-K056 系・パターンA）', () => {
  const card = { CardNum: 'TEST-CH5', Type: 'アーツ', EffectText: '以下の５つから５つまで選ぶ。①対戦相手のレベル３以下のシグニ１体を対象とし、それをダウンする。②対戦相手のレベル４以上のシグニ１体を対象とし、それをダウンする。③対戦相手のすべてのシグニを凍結する。④対戦相手は手札を１枚捨てる。⑤カードを１枚引く。' } as unknown as CardData;
  const a = parseCardEffects(card)[0].action as unknown as { type: string; from_count: number; choices: { action: { type: string } }[] };
  eq(a.type, 'CHOOSE', 'CHOOSE化');
  eq(a.from_count, 5, '5択（従来は⑤が④に吸収され4択）');
  eq(a.choices.map(c => c.action.type).join(','), 'DOWN,DOWN,FREEZE,TRASH,DRAW', '各選択肢が原文どおり');
});
test('parse 「このターン、対戦相手はスペルを使用できない」は END_OF_TURN（恒久ロックにしない）', () => {
  const card = { CardNum: 'TEST-BLK', Type: 'アーツ', EffectText: 'このターン、対戦相手はスペルを使用できない。' } as unknown as CardData;
  const a = parseCardEffects(card)[0].action as unknown as { type: string; until: string };
  eq(a.type, 'BLOCK_ACTION', 'BLOCK_ACTION');
  eq(a.until, 'END_OF_TURN', '「このターン」＝ターン終了まで（従来は PERMANENT＝恒久ロックの幻覚）');
});

// timing 語彙センサス（§3 Opusタスク16）で見つかった「engine 配線済みなのに parser に語彙が無い」穴の回帰ガード。
// これらは語彙が無いと **ON_PLAY（＝場に出たとき）へ黙って誤フォールバック**し、召喚しただけで発火する幻覚になる。
test('parse timing 語彙: 【アクセ】が付いたとき→ON_ACCE（主語で scope 分岐）', () => {
  const self = parseCardEffects({ CardNum: 'TEST-ACCE1', Type: 'シグニ', EffectText: '【自】：このシグニに【アクセ】が付いたとき、【エナチャージ１】をする。' } as unknown as CardData)[0];
  eq(self.timing?.[0], 'ON_ACCE', 'このシグニに＝ON_ACCE');
  eq(self.triggerScope, undefined, 'scope 既定 self（アクセが付いた当のシグニのみ）');
  const ally = parseCardEffects({ CardNum: 'TEST-ACCE2', Type: 'シグニ', EffectText: '【自】：あなたのシグニ１体に【アクセ】が付いたとき、カードを１枚引く。' } as unknown as CardData)[0];
  eq(ally.timing?.[0], 'ON_ACCE', 'あなたのシグニ1体に＝ON_ACCE');
  eq(ally.triggerScope, 'any_ally', '自フィールド全体が反応');
  const lrig = parseCardEffects({ CardNum: 'TEST-ACCE3', Type: 'ルリグ', EffectText: '【自】：あなたのシグニ１体に【アクセ】が付いたとき、カードを１枚引く。' } as unknown as CardData)[0];
  eq(lrig.timing?.[0], 'ON_ACCE_ATTACH', 'ルリグは別の受け皿（ルリグ監視ループ）');
});
test('parse timing 語彙: このカードが【アクセ】として…シグニに付いたとき→ON_ACCE_ATTACH（アクセカード自身・host条件抽出）', () => {
  // アクセカード自身の反応（WXK05-040/SPK01-11/WX17-033/WXK05-041/WX17-076）。engine 受け皿は checkAndFireOnAcceTriggersForOwner の attachedAcce ループ。
  const bare = parseCardEffects({ CardNum: 'TEST-ACCESELF1', Type: 'シグニ', EffectText: '【自】：このカードが【アクセ】としてシグニに付いたとき、カードを１枚引く。' } as unknown as CardData)[0];
  eq(bare.timing?.[0], 'ON_ACCE_ATTACH', 'アクセカード自身＝ON_ACCE_ATTACH');
  eq(bare.triggerCondition?.accedSelf, true, 'accedSelf でルリグ監視版と弁別');
  const min = parseCardEffects({ CardNum: 'TEST-ACCESELF2', Type: 'シグニ', EffectText: '【自】：このカードが【アクセ】としてレベル４以上のシグニに付いたとき、カードを１枚引く。' } as unknown as CardData)[0];
  eq(min.triggerCondition?.accedHostMinLevel, 4, 'レベルN以上→accedHostMinLevel');
  const maxStory = parseCardEffects({ CardNum: 'TEST-ACCESELF3', Type: 'シグニ', EffectText: '【自】：このカードが【アクセ】としてレベル２以下の＜調理＞のシグニに付いたとき、カードを１枚引く。' } as unknown as CardData)[0];
  eq(maxStory.triggerCondition?.accedHostMaxLevel, 2, 'レベルN以下→accedHostMaxLevel');
  eq(maxStory.triggerCondition?.accedHostStory, '調理', '＜X＞→accedHostStory');
});
test('parse timing 語彙: バトル/ダメージ/ライズ/チャーム/デッキ移動/離場/ウィルス/エクシード（タスク16[A] 一括）', () => {
  const mk = (t: string, type = 'シグニ') => parseCardEffects({ CardNum: 'TEST-T16', Type: type, EffectText: `【自】：${t}` } as unknown as CardData)[0];
  // ON_SIGNI_BATTLE 基本形（レベル/パワー filter 付きは engine 未対応で拾わない）
  eq(mk('このシグニが対戦相手のシグニとバトルしたとき、カードを１枚引く。').timing?.[0], 'ON_SIGNI_BATTLE', '対戦相手のシグニとバトル→ON_SIGNI_BATTLE');
  eq(mk('このシグニがバトルしたとき、カードを１枚引く。').timing?.[0], 'ON_SIGNI_BATTLE', 'バトルしたとき→ON_SIGNI_BATTLE');
  eq(mk('このシグニが対戦相手のレベル２以下のシグニとバトルしたとき、カードを１枚引く。').timing?.[0], 'ON_SIGNI_BATTLE', 'レベル filter 付きも [B]（続き178）で ON_SIGNI_BATTLE＋triggerFilter に');
  // ON_SIGNI_DAMAGE
  eq(mk('このシグニが対戦相手にダメージを与えたとき、カードを１枚引く。').timing?.[0], 'ON_SIGNI_DAMAGE', 'ダメージを与えた→ON_SIGNI_DAMAGE');
  eq(mk('対戦相手がダメージを受けたとき、カードを１枚引く。').timing?.[0], 'ON_SIGNI_DAMAGE', 'ダメージを受けた→ON_SIGNI_DAMAGE');
  // ON_RISE risedOntoNameContains
  const rise = mk('このシグニがカード名に《オダノブ》を含むシグニにライズされたとき、カードを１枚引く。');
  eq(rise.timing?.[0], 'ON_RISE', '《X》にライズ→ON_RISE');
  eq(rise.triggerCondition?.risedOntoNameContains, 'オダノブ', '下敷き名 risedOntoNameContains');
  // ON_CHARM_TO_TRASH（scope）
  eq(mk('【チャーム】１枚が場からいずれかのトラッシュに置かれたとき、カードを１枚引く。').timing?.[0], 'ON_CHARM_TO_TRASH', 'チャーム→ON_CHARM_TO_TRASH');
  eq(mk('対戦相手の場にある【チャーム】１枚がトラッシュに置かれたとき、カードを１枚引く。').triggerScope, 'any_opp', '対戦相手の場→any_opp');
  // ON_CARD_MOVED_TO_DECK（単数移動・owner はトリガー句限定）
  const mv = mk('対戦相手のシグニ１体が場からデッキに移動したとき、対戦相手のシグニ１体を対象とし、それをダウンする。');
  eq(mv.timing?.[0], 'ON_CARD_MOVED_TO_DECK', '単数デッキ移動→ON_CARD_MOVED_TO_DECK');
  eq(mv.triggerCondition?.movedToDeckOwner, 'opponent', 'owner はトリガー句の「対戦相手のシグニ」で判定（action の対象語に誤反応しない）');
  eq(mk('あなたのトラッシュから効果によってカード１枚がデッキに移動したとき、カードを１枚引く。').triggerCondition?.movedToDeckFromTrash, true, 'トラッシュから→fromTrash');
  // ON_LEAVE_FIELD（場から離れた）
  eq(mk('このシグニが場から離れたとき、カードを１枚引く。').timing?.[0], 'ON_LEAVE_FIELD', '場から離れた→ON_LEAVE_FIELD');
  // ON_OPP_VIRUS_CHANGED / REMOVED
  eq(mk('【ウィルス】１つが対戦相手の場に置かれるか対戦相手の場から取り除かれたとき、カードを１枚引く。').timing?.[0], 'ON_OPP_VIRUS_CHANGED', '置かれるか取り除かれた→CHANGED');
  eq(mk('対戦相手の場から【ウィルス】１つが取り除かれたとき、カードを１枚引く。').timing?.[0], 'ON_OPP_VIRUS_REMOVED', '取り除かれた→REMOVED');
  // ON_EXCEED_COST exceedCostPaidByPlayer
  const ex = mk('あなたがエクシードのコストを支払ったとき、カードを１枚引く。');
  eq(ex.timing?.[0], 'ON_EXCEED_COST', 'エクシード支払い→ON_EXCEED_COST');
  eq(ex.triggerCondition?.exceedCostPaidByPlayer, true, 'exceedCostPaidByPlayer');
});
test('parse timing 語彙: ON_SIGNI_BATTLE の level/power filter＋basic/front banish（タスク16[B]）', () => {
  const mk = (t: string) => parseCardEffects({ CardNum: 'TEST-T16B', Type: 'シグニ', EffectText: `【自】：${t}` } as unknown as CardData)[0];
  // ON_SIGNI_BATTLE のバトル相手 level/power → triggerFilter（engine collectBattleTrig が matchesFilter で評価）
  const bMax = mk('このシグニが対戦相手のレベル２以下のシグニとバトルしたとき、そのシグニをバニッシュする。');
  eq(bMax.timing?.[0], 'ON_SIGNI_BATTLE', 'レベル以下バトル→ON_SIGNI_BATTLE');
  eq(bMax.triggerFilter?.levelRange?.max, 2, 'レベルN以下→levelRange.max');
  eq(mk('このシグニが対戦相手のレベル４のシグニとバトルしたとき、そのシグニをバニッシュする。').triggerFilter?.level, 4, 'レベルN（厳密）→level');
  eq(mk('このシグニがパワー10000以上のシグニとバトルしたとき、そのシグニをトラッシュに置く。').triggerFilter?.powerRange?.min, 10000, 'パワーN以上→powerRange.min（対戦相手の省略可）');
  // basic/front banish（「対戦相手の」明記なし・正面）→ ON_SIGNI_BANISH_OPPONENT（battle・filter不要）
  eq(mk('このシグニがシグニ１体をバニッシュしたとき、カードを１枚引く。').timing?.[0], 'ON_SIGNI_BANISH_OPPONENT', 'シグニをバニッシュ（owner無）→OPPONENT');
  eq(mk('このシグニが正面のシグニ１体をバニッシュしたとき、このシグニをアップする。').timing?.[0], 'ON_SIGNI_BANISH_OPPONENT', '正面のシグニをバニッシュ→OPPONENT');
});
test('parse timing 語彙: 被バニッシュ状態 filter＋placedFront レベル＋ARTS 色（タスク16[B]第2弾）', () => {
  const mk = (t: string) => parseCardEffects({ CardNum: 'TEST-T16B2', Type: 'シグニ', EffectText: `【自】：${t}` } as unknown as CardData)[0];
  // banishedFilter（被バニッシュシグニの状態限定＝engine battleBanishEntries がバトル前状態で matchesStateFilter 評価）
  const fz = mk('このシグニがバトルによって対戦相手の凍結状態のシグニをバニッシュしたとき、対戦相手のライフクロス１枚をクラッシュする。');
  eq(fz.timing?.[0], 'ON_SIGNI_BANISH_OPPONENT', '凍結バニッシュ→OPPONENT');
  eq(fz.triggerCondition?.banishedFilter?.isFrozen, true, '凍結→banishedFilter.isFrozen');
  eq(mk('このシグニが感染状態のシグニ１体をバニッシュしたとき、カードを１枚引く。').triggerCondition?.banishedFilter?.infected, true, '感染→banishedFilter.infected（バトルによって明記なし形）');
  eq(mk('このシグニがバトルによって【チャーム】が付いている対戦相手のシグニをバニッシュしたとき、対戦相手のライフクロス１枚をクラッシュする。').triggerCondition?.banishedFilter?.hasCharm, true, 'チャーム付き→banishedFilter.hasCharm');
  eq(mk('このシグニがバトルによって対戦相手のシグニをバニッシュしたとき、カードを１枚引く。').triggerCondition?.banishedFilter, undefined, '基本形は banishedFilter を刻まない（過剰限定しない）');
  // placedFront＋levelRange（engine collectFieldTriggers が placedFront 判定の前に triggerFilter を matchesFilter 評価）
  const pf = mk('このシグニの正面にレベル２以下のシグニ１体が出たとき、あなたはそのシグニをバニッシュしてもよい。');
  eq(pf.timing?.[0], 'ON_PLAY', '正面出現→ON_PLAY（placedFront 慣例）');
  eq(pf.triggerScope, 'any_opp', 'any_opp');
  eq(pf.triggerCondition?.placedFront, true, 'placedFront');
  eq(pf.triggerFilter?.levelRange?.max, 2, 'レベル2以下→levelRange.max');
  const pf2 = mk('対戦相手のレベル２以下のシグニ１体がこのシグニの正面のシグニゾーンに出たとき、カードを１枚引く。');
  eq(pf2.triggerCondition?.placedFront, true, '「正面のシグニゾーンに出た」語順→placedFront');
  eq(pf2.triggerFilter?.levelRange?.max, 2, 'levelRange.max=2');
  eq(mk('このシグニの正面にこのシグニより低いレベルを持つシグニが出たとき、あなたはそれをバニッシュしてもよい。').triggerCondition?.frontLowerLevelThanSource, true, 'より低いレベル→frontLowerLevelThanSource');
  // ON_ARTS_USE の色 filter（engine collectArtsUseTriggers が使用アーツを matchesFilter 評価）
  const ar = mk('あなたが緑のアーツを使用したとき、【エナチャージ１】をする。');
  eq(ar.timing?.[0], 'ON_ARTS_USE', '色付きアーツ使用→ON_ARTS_USE');
  eq(ar.triggerFilter?.color, '緑', '緑→triggerFilter.color');
});
test('parse timing 語彙: ダウン/アップ状態になったとき→ON_SIGNI_DOWN/UP＋mill合計（タスク16[C]続き180）', () => {
  const mk = (t: string) => parseCardEffects({ CardNum: 'TEST-T16C', Type: 'シグニ', EffectText: `【自】：${t}` } as unknown as CardData)[0];
  // ON_SIGNI_DOWN＋byEffect（「効果によって」）
  const dn = mk('あなたのシグニ１体が効果によってダウン状態になったとき、【エナチャージ１】をする。');
  eq(dn.timing?.[0], 'ON_SIGNI_DOWN', 'ダウン状態になった→ON_SIGNI_DOWN');
  eq(dn.triggerScope, 'any_ally', 'あなたのシグニ→any_ally');
  eq(dn.triggerCondition?.byEffect, true, '効果によって→byEffect');
  // ON_SIGNI_DOWN＋excludeSelf＋story filter（「あなたの他の＜植物＞のシグニ」）
  const dn2 = mk('あなたの他の＜植物＞のシグニ１体がダウン状態になったとき、カードを１枚引く。');
  eq(dn2.triggerFilter?.excludeSelf, true, '他の→excludeSelf');
  eq(dn2.triggerFilter?.story, '植物', '＜植物＞→triggerFilter.story');
  // ON_SIGNI_BECOMES_UP＋duringAttackPhase＋upIncludesLrig（「アタックフェイズの間、センタールリグかシグニ…アップ状態になった」）
  const up = mk('アタックフェイズの間、あなたのセンタールリグかシグニ１体がアップ状態になったとき、あなたのシグニ１体を対象とし、それをアップする。');
  eq(up.timing?.[0], 'ON_SIGNI_BECOMES_UP', 'アップ状態になった→ON_SIGNI_BECOMES_UP');
  eq(up.triggerCondition?.duringAttackPhase, true, 'アタックフェイズの間→duringAttackPhase');
  eq(up.triggerCondition?.upIncludesLrig, true, 'センタールリグか→upIncludesLrig');
  // mill「合計N枚以上」（タスク16[C]④ mill regex 拡張）
  const ml = mk('あなたのターンの間、効果１つによってあなたのデッキからカードが合計２枚以上トラッシュに置かれたとき、カードを１枚引く。');
  eq(ml.timing?.[0], 'ON_CARD_MILLED_FROM_DECK', '合計N枚以上トラッシュ→ON_CARD_MILLED_FROM_DECK');
  eq(ml.triggerCondition?.milledMinCount, 2, '合計２枚以上→milledMinCount=2');
  eq(ml.triggerCondition?.milledDeckOwner, 'self', 'あなたのデッキ→milledDeckOwner=self');
});
test('parse timing 語彙: リフレッシュしたとき→ON_REFRESH（refreshedOwner を主語から抽出）', () => {
  const mk = (t: string) => parseCardEffects({ CardNum: 'TEST-REF', Type: 'シグニ', EffectText: `【自】：${t}、【エナチャージ１】をする。` } as unknown as CardData)[0];
  eq(mk('あなたがリフレッシュしたとき').triggerCondition?.refreshedOwner, 'self', 'あなた＝self');
  eq(mk('対戦相手がリフレッシュしたとき').triggerCondition?.refreshedOwner, 'opponent', '対戦相手＝opponent');
  eq(mk('いずれかのプレイヤーがリフレッシュしたとき').triggerCondition?.refreshedOwner, 'any', 'いずれか＝any');
  eq(mk('あなたがリフレッシュしたとき').timing?.[0], 'ON_REFRESH', 'timing');
});
test('parse timing 語彙: エナ→トラッシュ/凍結/ガード/相手アーツ使用/コスト捨て', () => {
  const mk = (t: string, type = 'シグニ') => parseCardEffects({ CardNum: 'TEST-T', Type: type, EffectText: `【自】：${t}、カードを１枚引く。` } as unknown as CardData)[0];
  const ene = mk('あなたの効果によって対戦相手のエナゾーンからカード１枚がトラッシュに置かれたとき');
  eq(ene.timing?.[0], 'ON_ENERGY_TO_TRASH', 'エナ→トラッシュ');
  eq(ene.triggerCondition?.energyTrashedOwner, 'opponent', '相手エナ限定');
  eq(mk('対戦相手のシグニ１体が凍結状態になったとき').timing?.[0], 'ON_SIGNI_FROZEN', '凍結');
  eq(mk('あなたが【ガード】したとき').timing?.[0], 'ON_GUARD', 'ガード');
  const opp = mk('対戦相手がアーツを使用したとき');
  eq(opp.timing?.[0], 'ON_OPP_ARTS_USE', '相手アーツ使用');
  eq(opp.triggerScope, 'any_opp', '主語＝相手（逆翻訳の描画用。engine は scope を見ない）');
  // 「あなたか対戦相手が」＝どちらの使用でも発火＝両方の受け皿を持つ（WX16-003）
  eq(mk('あなたか対戦相手がアーツを使用したとき').timing?.join(','), 'ON_ARTS_USE,ON_OPP_ARTS_USE', '両方の使用に反応');
  eq(mk('あなたの＜微菌＞のシグニの【出】【起】能力のコストとしてこのカードが捨てられたとき').timing?.[0], 'ON_DISCARDED_AS_COST', 'コスト捨て');
});
test('parse timing 語彙: デッキmill／手札公開／正面配置／場→手札／手札捨てフィルタ（続き76 第2弾）', () => {
  const mk = (t: string, type = 'シグニ') => parseCardEffects({ CardNum: 'TEST-T2', Type: type, EffectText: `【自】：${t}、カードを１枚引く。` } as unknown as CardData)[0];
  // ON_CARD_MILLED_FROM_DECK: デッキの持ち主と枚数閾値
  const m5 = mk('効果１つによってあなたのデッキからカードが５枚以上トラッシュに置かれたとき');
  eq(m5.timing?.[0], 'ON_CARD_MILLED_FROM_DECK', 'mill');
  eq(m5.triggerCondition?.milledDeckOwner, 'self', '自デッキ');
  eq(m5.triggerCondition?.milledMinCount, 5, '5枚以上');
  eq(mk('あなたの効果によっていずれかのプレイヤーのデッキからカード１枚がトラッシュに置かれたとき').triggerCondition?.milledDeckOwner, 'any', 'いずれかのプレイヤー＝any');
  eq(mk('あなたのデッキからカードがトラッシュに置かれたとき').triggerCondition?.milledMinCount, 1, '枚数指定なし＝1');
  // ON_SELF_REVEAL_FROM_HAND
  eq(mk('あなたが自分の効果によって手札からカードを１枚以上公開したとき').timing?.[0], 'ON_SELF_REVEAL_FROM_HAND', '手札公開');
  // ON_PLAY + placedFront（正面配置＝ON_PLAY のまま triggerCondition で表現）
  const pf = mk('対戦相手のシグニ１体がこのシグニの正面に配置されたとき');
  eq(pf.timing?.[0], 'ON_PLAY', '正面配置は ON_PLAY');
  eq(pf.triggerCondition?.placedFront, true, 'placedFront');
  eq(pf.triggerScope, 'any_opp', '相手の配置に反応');
  // ON_LEAVE_FIELD + leftToZone:'hand'（主語で scope が変わる）
  const lf = mk('あなたのシグニ１体が場から手札に戻ったとき');
  eq(lf.timing?.[0], 'ON_LEAVE_FIELD', '場→手札');
  eq(lf.triggerCondition?.leftToZone, 'hand', 'leftToZone');
  eq(lf.triggerScope, 'any_ally', 'あなたのシグニ＝any_ally');
  eq(mk('シグニ１体が場から手札に戻ったとき').triggerScope, 'any', '主語なし＝any（どちらの場でも）');
  // ON_HAND_DISCARDED の triggerFilter（捨てたカードの種別限定）
  eq(mk('あなたが手札から＜アーム＞のシグニを１枚捨てたとき').triggerFilter?.story, 'アーム', '＜X＞のシグニ');
  eq(mk('あなたが《ディソナアイコン》のカードを１枚捨てたとき').triggerFilter?.isDisona, true, '《ディソナアイコン》');
});

// 続き78＝Opusタスク12（Sonnet観測8件の修正）の回帰ガード。
test('parse 「シグニ１体を対象とし、それをゲームから除外する」→ EXILE{SIGNI}（TRASH{TRASH_CARD} no-op 化の再発防止）', () => {
  const e1 = parseCardEffects({ CardNum: 'TEST-EX1', Type: 'シグニ', EffectText: '【出】：対戦相手のシグニ１体を対象とし、それをゲームから除外する。' } as unknown as CardData)[0];
  const a1 = e1.action as unknown as { type: string; target: { type: string; owner: string } };
  eq(a1.type, 'EXILE', '場シグニの除外は EXILE（従来はトラッシュ→トラッシュの完全no-op TRASH{TRASH_CARD}）');
  eq(a1.target.type, 'SIGNI', '対象は場のシグニ');
  eq(a1.target.owner, 'opponent', 'owner は対象節から取る');
  // 複合形「このシグニとそれを」＝対象→自身の順で両方除外
  const e2 = parseCardEffects({ CardNum: 'TEST-EX2', Type: 'シグニ', EffectText: '【自】：このシグニがアタックしたとき、対戦相手のシグニ１体を対象とし、このシグニとそれをゲームから除外する。' } as unknown as CardData)[0];
  const a2 = e2.action as unknown as { type: string; steps: Array<{ type: string; target: { owner: string; filter?: { thisCardOnly?: boolean } } }> };
  eq(a2.type, 'SEQUENCE', '複合形は SEQUENCE');
  eq(a2.steps[0].type + ':' + a2.steps[0].target.owner, 'EXILE:opponent', '対象の除外');
  eq(a2.steps[1].type + ':' + (a2.steps[1].target.filter?.thisCardOnly === true), 'EXILE:true', '自身の除外');
  // 自己単独形（クラフトトークンの「対戦相手のターン終了時、」）。owner は self（従来は別節の「対戦相手」を拾って誤反転）
  const e3 = parseCardEffects({ CardNum: 'TEST-EX3', Type: 'シグニ', EffectText: '【自】：対戦相手のターン終了時、このシグニをゲームから除外する。' } as unknown as CardData)[0];
  const a3 = e3.action as unknown as { type: string; target: { owner: string } };
  eq(a3.type + ':' + a3.target.owner, 'EXILE:self', '自己除外＝EXILE self');
  // 遅延形（「ターン終了時に、または…場から離れる場合に」）は機構待ち＝EXILE化しない（過剰即時除外の防止）
  const e4 = parseCardEffects({ CardNum: 'TEST-EX4', Type: 'シグニ', EffectText: '【出】：ターン終了時に、またはこのシグニが場から離れる場合に、このシグニをゲームから除外する。' } as unknown as CardData)[0];
  eq((e4.action as unknown as { type: string }).type !== 'EXILE', true, '遅延自己除外は従来近似のまま（即時EXILEにしない）');
});
test('parse 条件節＋「そのピースの使用コストは…減る」→ CONDITIONAL 持ち上げ（ガードCの例外）', () => {
  const e = parseCardEffects({ CardNum: 'TEST-CRED', Type: 'ルリグ', EffectText: '【起】《ゲーム１回》《白×0》：クラフトの《インビンシブル・ストーリー》１枚をルリグデッキに加える。あなたのライフクロスが２枚以下の場合、このターン、そのピースの使用コストは《無×1》減る。' } as unknown as CardData)[0];
  const seq = e.action as unknown as { type: string; steps: Array<{ type: string; condition?: { type: string; value: number }; then?: { type: string; id: string } }> };
  eq(seq.steps[1].type, 'CONDITIONAL', '条件が CONDITIONAL に持ち上がる（従来は条件ごと脱落）');
  eq(seq.steps[1].condition?.type + ':' + seq.steps[1].condition?.value, 'LIFE_COUNT:2', 'ライフ2枚以下');
  eq(seq.steps[1].then?.id, 'ARTS_COST_REDUCTION_BY_EFFECT', '実行時マーカーSTUBは包んでよい');
});
test('parse 先頭「ターン終了時まで、」の action 内 duration 復元（PERMANENT 化の防止）', () => {
  const e = parseCardEffects({ CardNum: 'TEST-DUR', Type: 'シグニ', EffectText: '【自】：あなたのアタックフェイズ開始時、このターンにあなたがアーツを使用していた場合、ターン終了時まで、このシグニは【アサシン】を得る。' } as unknown as CardData)[0];
  const a = e.action as unknown as { type: string; duration: string };
  eq(a.type, 'GRANT_KEYWORD', 'キーワード付与');
  eq(a.duration, 'UNTIL_END_OF_TURN', 'action 内 duration が原文どおり（従来は先頭句 strip で PERMANENT 化）');
});
test('parse 多段「下にレベルNのシグニがあるかぎり、「Q」を得る。」→ 3段構造化（WX24-P1-043）', () => {
  const e = parseCardEffects({ CardNum: 'TEST-STAGE', Type: 'シグニ', EffectText: '【常】：このシグニは下にレベル１のシグニがあるかぎり、「【常】：対戦相手の効果によってダウンしない。」を得る。レベル２のシグニがあるかぎり、「【常】：対戦相手の効果によって新たに能力を得られない。」を得る。' } as unknown as CardData)[0];
  const g = e.action as unknown as { type: string; thisCardOnly: boolean; abilities: Array<{ activeCondition?: { type: string; filter?: { level?: number } }; action: { type: string } }> };
  eq(g.type, 'GRANT_FIELD_SIGNI_ABILITY', '構造化付与（従来は qfSelf の丸呑みで2段目以降が消失）');
  eq(g.abilities.length, 2, '2段とも残る');
  eq(g.abilities[0].activeCondition?.type + ':' + g.abilities[0].activeCondition?.filter?.level, 'THIS_CARD_HAS_UNDER:1', '1段目条件');
  eq(g.abilities[1].activeCondition?.type + ':' + g.abilities[1].activeCondition?.filter?.level, 'THIS_CARD_HAS_UNDER:2', '2段目条件');
  eq(g.abilities[0].action.type, 'GRANT_PROTECTION', '主語省略形も既存規則に届く（このシグニは 補完）');
});
test('parse 連用中止「このシグニのパワーは＋Nされ、…を得る」→ SEQUENCE で両方残る（WXDi-P11-046 系）', () => {
  const e = parseCardEffects({ CardNum: 'TEST-RENYO', Type: 'シグニ', EffectText: '【常】：このシグニが中央のシグニゾーンにあるかぎり、このシグニのパワーは＋3000され、このシグニは【ランサー】を得る。' } as unknown as CardData)[0];
  eq(e.activeCondition?.type, 'IS_SELF_IN_CENTER_ZONE', '外側条件');
  const seq = e.action as unknown as { type: string; steps: Array<{ type: string; delta?: number; keyword?: string }> };
  eq(seq.type, 'SEQUENCE', '連用中止は SEQUENCE（従来は＋3000 か付与のどちらかが無言脱落）');
  eq(seq.steps[0].type + ':' + seq.steps[0].delta, 'POWER_MODIFY:3000', '前半＝パワー修正');
  eq(seq.steps[1].type + ':' + seq.steps[1].keyword, 'GRANT_KEYWORD:ランサー', '後半＝付与');
});
test('THIS_CARD_HAS_UNDER filter: 下カードのレベル条件を評価（engine）', () => {
  // 自分フィールドに [下:SIGNI_L2, 上:SIGNI_L4] の2枚スタックを作り、下カードのレベルで条件が分岐することを見る
  const base = mkCtx({ signi: [SIGNI_L4, null, null] }, {}, SIGNI_L4);
  const stacked = { ...base, ownerState: { ...base.ownerState, field: { ...base.ownerState.field, signi: [[SIGNI_L2, SIGNI_L4], null, null] } } };
  const mkCond = (level: number) => ({ type: 'CONDITIONAL', condition: { type: 'THIS_CARD_HAS_UNDER', filter: { cardType: 'シグニ', level } }, then: { type: 'DRAW', owner: 'self', count: 1 } }) as unknown as EffectAction;
  const n0 = stacked.ownerState.hand.length;
  eq(run(mkCond(2), stacked).ownerState.hand.length, n0 + 1, '下にレベル2シグニがあれば真');
  eq(run(mkCond(1), stacked).ownerState.hand.length, n0, 'レベル不一致なら偽');
  eq(run(mkCond(2), base).ownerState.hand.length, base.ownerState.hand.length, '下にカードが無ければ偽');
});
test('LOSE_SIGNI_BARRIER: 相手フリーゾーンのバリアトークンを取り除く（engine）', () => {
  const base = mkCtx({}, {});
  const withBarrier = { ...base, otherState: { ...base.otherState, field: { ...base.otherState.field, free_zone: [...(base.otherState.field.free_zone ?? []), 'WX26-CP1-TK01#b1'] } } };
  const r = run({ type: 'STUB', id: 'LOSE_SIGNI_BARRIER' } as unknown as EffectAction, withBarrier);
  eq((r.otherState.field.free_zone ?? []).some(c => c.startsWith('WX26-CP1-TK01')), false, 'バリアが取り除かれる');
  const r2 = run({ type: 'STUB', id: 'LOSE_SIGNI_BARRIER' } as unknown as EffectAction, base);
  eq((r2.otherState.field.free_zone ?? []).length, (base.otherState.field.free_zone ?? []).length, 'バリアが無ければ何も起きない');
});
test('parse timing 語彙: ウィルス配置／エナチャージ／デッキ移動／対象化（続き76 第3弾）', () => {
  const mk = (t: string) => parseCardEffects({ CardNum: 'TEST-T3', Type: 'シグニ', EffectText: `【自】：${t}、カードを１枚引く。` } as unknown as CardData)[0];
  eq(mk('対戦相手の場に【ウィルス】１つが置かれたとき').timing?.[0], 'ON_OPP_VIRUS_PLACED', 'ウィルス配置');
  eq(mk('あなたが【エナチャージ】をしたとき').timing?.[0], 'ON_ENERGY_CHARGE', 'エナチャージ');
  const md = mk('あなたの効果１つによって対戦相手のカードが１枚以上デッキに移動したとき');
  eq(md.timing?.[0], 'ON_CARD_MOVED_TO_DECK', 'デッキ移動');
  eq(md.triggerCondition?.movedToDeckOwner, 'opponent', '相手のカード');
  // 「あなたのトラッシュから」＝engine が別カウンタで数える fromTrash 限定（WX22-014）
  const mt = mk('あなたの効果１つによってあなたのトラッシュからカードが４枚以上デッキに移動したとき');
  eq(mt.triggerCondition?.movedToDeckFromTrash, true, 'トラッシュ起源限定');
  eq(mt.triggerCondition?.movedToDeckMinCount, 4, '4枚以上');
  // 「対戦相手の**シグニの**、能力か効果の対象になったとき」も ON_TARGETED（WXDi-P03-056）
  eq(mk('このシグニが対戦相手のシグニの、能力か効果の対象になったとき').timing?.[0], 'ON_TARGETED', 'シグニの能力で対象化');
  // 「対戦相手のシグニのパワーが0以下になったとき」＝engine 配線済み（collectPowerZeroTriggers）。
  // ⚠engine は「0以下」専用で閾値付きの「N以下」は受け皿が無い＝0 に限定してマッチすること。
  const pz = mk('対戦相手のシグニのパワーが０以下になったとき');
  eq(pz.timing?.[0], 'ON_SIGNI_POWER_ZERO_OR_LESS', 'パワー0以下');
  eq(pz.triggerScope, 'any_opp', '相手シグニの0以下に反応');
  ok(mk('対戦相手のシグニのパワーが3000以下になったとき').timing?.[0] !== 'ON_SIGNI_POWER_ZERO_OR_LESS', 'N以下（0以外）は拾わない＝engine 未対応');
});
test('parse timing 語彙: 「減った値と同じだけ＋」は REACTIVE_POWER_UP（ダウン系 STUB へ誤ルーティングしない）', () => {
  // 従来は「対戦相手のシグニ**1体**の」＝体数表記があると part2 の規則を外れ、意味の違う POWER_COPY_FROM_DOWNED
  //（＝「この方法でダウンしたシグニのパワーと同じだけ＋」WXDi-P16-052 の実装）へ落ちていた。
  const e = parseCardEffects({ CardNum: 'TEST-PD', Type: 'シグニ', EffectText: '【自】：あなたの他の＜毒牙＞のシグニの効果によって対戦相手のシグニ１体のパワーが減ったとき、ターン終了時まで、このシグニのパワーを減った値と同じだけ＋（プラス）する。' } as unknown as CardData)[0];
  eq(e.timing?.[0], 'ON_OPP_POWER_DECREASED', 'timing');
  eq((e.action as unknown as { id?: string }).id, 'REACTIVE_POWER_UP', '減少量コピー（ダウン系ではない）');
});

// トップレベル動作選択「（カードをN枚）引くか<B>」→ CHOOSE(2択)（§4タスク4 引用内CHOOSE・続き69）
// パーサ回帰ガード＝従来は先頭動詞だけ拾い片方を無言脱落させていた（WXDi-D09-P20/WXDi-P02-011 等）。
test('parse 引くか【エナチャージ】→ CHOOSE[DRAW,ENERGY]（WXDi-P02-011 系）', () => {
  const card = { CardNum: 'TEST-DRAWOR', Type: 'アシストルリグ', EffectText: '【出】：カードを１枚引くか【エナチャージ１】をする。' } as unknown as CardData;
  const eff = parseCardEffects(card)[0];
  eq(eff.action.type, 'CHOOSE', 'CHOOSE化');
  const ch = eff.action as unknown as { choices: { action: { type: string } }[] };
  eq(ch.choices.length, 2, '2択');
  eq(ch.choices[0].action.type, 'DRAW', '選択肢1=DRAW');
  eq(ch.choices[1].action.type, 'ENERGY_CHARGE_FROM_DECK', '選択肢2=エナチャージ');
});
test('parse 引くか対戦相手は手札を捨てる→ CHOOSE[DRAW, 相手ディスカード]（WXDi-D09-P20 内側系）', () => {
  const card = { CardNum: 'TEST-DRAWDISC', Type: 'シグニ', EffectText: '【自】：このシグニがアタックしたとき、カードを１枚引くか対戦相手は手札を１枚捨てる。' } as unknown as CardData;
  const eff = parseCardEffects(card)[0];
  eq(eff.action.type, 'CHOOSE', 'CHOOSE化');
  const ch = eff.action as unknown as { choices: { action: { type: string; target?: { owner: string } } }[] };
  eq(ch.choices[0].action.type, 'DRAW', '選択肢1=DRAW');
  eq(ch.choices[1].action.type, 'TRASH', '選択肢2=ディスカード');
  eq(ch.choices[1].action.target?.owner, 'opponent', 'ディスカードは相手手札');
});
test('parse トリガー主語「あなたが引くか…とき」は CHOOSE 化しない（WX24-P4-017 誤検出防止）', () => {
  const card = { CardNum: 'TEST-TRIGOR', Type: 'ルリグ', EffectText: '【起】：このターン、あなたがカードを１枚引くか、対戦相手が手札を１枚捨てたとき、対戦相手のシグニ１体を対象とし、ターン終了時まで、それのパワーを－4000する。' } as unknown as CardData;
  const eff = parseCardEffects(card)[0];
  ok(eff.action.type !== 'CHOOSE', 'トリガー条件の「か」は選択に化けない');
});
test('CHOOSE[DRAW,ENERGY] 各選択肢が正しく実行（選択肢2=エナ+1）', () => {
  const action = { type: 'CHOOSE', choose_count: 1, from_count: 2, choices: [
    { choiceId: 'c0', label: 'a', action: { type: 'DRAW', owner: 'self', count: 1 } },
    { choiceId: 'c1', label: 'b', action: { type: 'ENERGY_CHARGE_FROM_DECK', owner: 'self', count: 1 } },
  ] };
  const ctx = mkCtx({}, {});
  const e0 = ctx.ownerState.energy.length;
  const r = executeEffect({ effectId: 't', effectType: 'AUTO', action: action as unknown as EffectAction, duration: 'INSTANT', mandatory: true } as CardEffect, ctx);
  ok(!r.done, 'CHOOSE で対話待ち');
  const pending = (r as { pending: unknown }).pending;
  const c: ExecCtx = { ...ctx, ownerState: r.ownerState, otherState: r.otherState, logs: r.logs };
  const r2 = resumeChoose('c1', pending as never, c);
  eq(r2.ownerState.energy.length - e0, 1, 'エナ+1（選択肢2）');
});
test('CHOOSE choice.condition: 選択肢②「あなたの場に赤の＜龍獣＞のシグニがある場合」が場の状態でavailableを正しく切替（WX25-P3-092・続き105単点修正の回帰ガード）', () => {
  const eff = effectsMap.get('WX25-P3-092')!.find(e => e.effectId === 'WX25-P3-092-E1')!;
  const ctxNo = mkCtx({ signi: [null, null, null] }, {}, 'WX25-P3-092');
  const rNo = executeEffect(eff, ctxNo);
  const pendingNo = (rNo as { pending: { options: { id: string; available?: boolean }[] } }).pending;
  eq(pendingNo.options.find(o => o.id === 'c1')?.available, false, '赤の＜龍獣＞シグニが場に無ければ選択肢②は選択不可');
  const ctxYes = mkCtx({ signi: ['WX04-031', null, null] }, {}, 'WX25-P3-092'); // WX04-031=赤の＜龍獣＞シグニ
  const rYes = executeEffect(eff, ctxYes);
  const pendingYes = (rYes as { pending: { options: { id: string; available?: boolean }[] } }).pending;
  eq(pendingYes.options.find(o => o.id === 'c1')?.available, true, '赤の＜龍獣＞シグニ(WX04-031)が場にあれば選択肢②は選択可');
});
test('TRASH.optional→CONDITIONAL(IS_MY_TURN)→BANISHのパワー閾値: 対象はpowerRange以下のみ・辞退時はバニッシュされない（WX24-P4-050・続き105単点修正の回帰ガード）', () => {
  const eff = effectsMap.get('WX24-P4-050')!.find(e => e.effectId === 'WX24-P4-050-E1')!;
  // 相手の場はパワー12000のシグニ1体のみ＝閾値8000を超えるためBANISHの対象になってはいけない
  const highPowerOpp = [...cardMap.values()].find(c => isSigni(c) && parseInt(c.Power || '0', 10) > 8000)!.CardNum;
  const ctxAccept = mkCtx({ hand: 3 }, { signi: [highPowerOpp, null, null] }, 'WX24-P4-050');
  const rTrashPending = executeEffect(eff, ctxAccept);
  ok(!rTrashPending.done, 'TRASH(optional)で対話待ち');
  const trashPending = (rTrashPending as { pending: { candidates: string[] } }).pending;
  const c1: ExecCtx = { ...ctxAccept, ownerState: rTrashPending.ownerState, otherState: rTrashPending.otherState, logs: rTrashPending.logs };
  const rAccept = resumeSelectTarget(trashPending.candidates.slice(0, 1), trashPending as never, c1);
  eq(rAccept.done, true, '対象パワーが閾値超のみなのでBANISH候補0件のままdone（過剰効果なら対話待ちのまま残る）');
  eq(rAccept.otherState.field.signi[0]?.at(-1), highPowerOpp, '閾値超のシグニはバニッシュされず場に残る');

  // 辞退（0枚選択）した場合: 後続のCONDITIONAL(IS_MY_TURN)=「そうした場合」は実行されない
  const ctxDecline = mkCtx({ hand: 3 }, {}, 'WX24-P4-050');
  const rTrashPending2 = executeEffect(eff, ctxDecline);
  const trashPending2 = (rTrashPending2 as { pending: { candidates: string[] } }).pending;
  const c2: ExecCtx = { ...ctxDecline, ownerState: rTrashPending2.ownerState, otherState: rTrashPending2.otherState, logs: rTrashPending2.logs };
  const rDecline = resumeSelectTarget([], trashPending2 as never, c2);
  eq(rDecline.done, true, '辞退時は即done（BANISHへ進まない）');
  eq(rDecline.ownerState.hand.length, ctxDecline.ownerState.hand.length, '辞退時は手札を捨てない');
});
test('TRASH{HAND_CARD,count:1} の SELECT_TARGET 再開経路が手札カウンタ3種を更新する（続き81発見・続き135修正・タスク12(iv)）', () => {
  // 即時適用パス（count:'ALL'＝applyTrashHand）は hand_discarded_just / turn_hand_discarded_count /
  // hand_trashed_by_opp_this_turn を更新するのに、count:1 で SELECT_TARGET を挟む resumeSelectTarget→applyDirectAction
  // 経路だけがこの更新を丸ごと欠いていた＝ON_HAND_DISCARDED 不発火・「この方法で捨てた場合」条件の不成立を併発。
  const mkEff = (owner: 'self' | 'opponent') => ({
    effectId: `T-TRASH-HAND-${owner}`, effectType: 'ACTIVATED' as const, timing: [],
    action: { type: 'TRASH', target: { type: 'HAND_CARD', owner, count: 1 } } as EffectAction,
    duration: 'INSTANT' as const, mandatory: true,
  });
  // 自分の手札を1枚捨てる → turn_hand_discarded_count +1・hand_discarded_just に記録
  const ctxSelf = mkCtx({ hand: 3 }, {});
  const pSelf = executeEffect(mkEff('self'), ctxSelf);
  ok(!pSelf.done, 'SELECT_TARGET で対話待ち');
  const pendSelf = (pSelf as { pending: { candidates: string[] } }).pending;
  const rSelf = resumeSelectTarget(pendSelf.candidates.slice(0, 1), pendSelf as never, { ...ctxSelf, ownerState: pSelf.ownerState, otherState: pSelf.otherState, logs: pSelf.logs });
  eq(rSelf.ownerState.hand.length, 2, '手札が1枚減る');
  eq((rSelf.ownerState.hand_discarded_just ?? []).length, 1, 'hand_discarded_just に記録（ON_HAND_DISCARDED 検出用）');
  eq(rSelf.ownerState.turn_hand_discarded_count ?? 0, 1, 'turn_hand_discarded_count が+1');
  eq(rSelf.ownerState.hand_trashed_by_opp_this_turn ?? 0, 0, '自分で捨てた分は「相手の効果で」に数えない');
  // 相手の手札を1枚捨てさせる → 相手側の hand_trashed_by_opp_this_turn +1（「代わりに」置換の起点条件）
  const ctxOpp = mkCtx({}, { hand: 3 });
  const pOpp = executeEffect(mkEff('opponent'), ctxOpp);
  const pendOpp = (pOpp as { pending: { candidates: string[] } }).pending;
  const rOpp = resumeSelectTarget(pendOpp.candidates.slice(0, 1), pendOpp as never, { ...ctxOpp, ownerState: pOpp.ownerState, otherState: pOpp.otherState, logs: pOpp.logs });
  eq(rOpp.otherState.hand.length, 2, '相手の手札が1枚減る');
  eq(rOpp.otherState.hand_trashed_by_opp_this_turn ?? 0, 1, '相手側の hand_trashed_by_opp_this_turn が+1');
  eq(rOpp.otherState.turn_hand_discarded_count ?? 0, 0, '相手が自ら捨てたわけではないので turn_hand_discarded_count は増えない');
});
test('CONDITIONAL(AND[HAS_CARD_IN_FIELD×2]): 「あなたの場に(色)と(色)のシグニがある場合」＝両方の色が揃わないと発動しない（WX14-010・続き105単点修正の回帰ガード）', () => {
  const eff = effectsMap.get('WX14-010')!.find(e => e.effectId === 'WX14-010-E1')!;
  // 赤のみ: 条件不成立でdone・手札/デッキ不変
  const ctxRedOnly = mkCtx({ hand: 3, signi: ['WX04-031', null, null] }, {}, 'WX14-010'); // WX04-031=赤
  const rRedOnly = executeEffect(eff, ctxRedOnly);
  eq(rRedOnly.done, true, '赤のみでは条件不成立のままdone');
  eq(rRedOnly.ownerState.hand.length, ctxRedOnly.ownerState.hand.length, '赤のみでは手札不変（ドロー・ディスカードなし）');
  // 赤+緑が揃うとDRAW+TRASHが発動
  const ctxBoth = mkCtx({ hand: 3, signi: ['WX04-031', 'WX01-033', null] }, {}, 'WX14-010'); // WX01-033=緑
  const h0 = ctxBoth.ownerState.hand.length;
  const rBoth = run(eff.action, ctxBoth);
  eq(rBoth.ownerState.hand.length, h0, '赤緑が揃うとドロー+1・ディスカード-1で手札枚数は差し引き±0');
});

// ── §3 Sonnetタスク5: golden型網羅の追加（続き82・未カバーだった12型に1テストずつ）──
test('POWER_SET: CONTINUOUS TURN_OWNER:opponentで自身のパワーを固定値に変更（実カード母集団217件はすべてこの形＝self,count:1・WX01-054）', () => {
  const base = parseInt(cardMap.get('WX01-054')?.Power || '0');
  const pOppTurn = calcFieldPowers(mkState({ signi: ['WX01-054', null, null] }), mkState({}), false, effectsMap, cardMap as Map<string, CardData>);
  eq(pOppTurn.get('WX01-054'), 18000, '相手ターン中はパワー18000に固定');
  const pSelfTurn = calcFieldPowers(mkState({ signi: ['WX01-054', null, null] }), mkState({}), true, effectsMap, cardMap as Map<string, CardData>);
  eq(pSelfTurn.get('WX01-054'), base, '自ターン中はactiveCondition不成立で表記パワーのまま');
});
test('ENERGY_CHARGE 手札シグニ全て(count:ALL): 手札-1 エナ+1', () => {
  // ⚠count:1等の外部SELECT_TARGET経路は applyDirectAction に ENERGY_CHARGE のケースが無く
  // 選択後に selectOrInteract を無限に再入するバグを続き82で発見（Opusタスク12へ登録・PLAN §3参照）。
  // count:'ALL' はそのバグ経路（selectOrInteract）を通らず直接 applyCharge するため実装済みロジックの検証になる。
  const ctx = mkCtx({ hand: 1 }, {});
  const h0 = ctx.ownerState.hand.length; const e0 = ctx.ownerState.energy.length;
  const r = run({ type: 'ENERGY_CHARGE', target: { type: 'HAND_CARD', owner: 'self', count: 'ALL', filter: { cardType: 'シグニ' } } } as EffectAction, ctx);
  eq(r.ownerState.hand.length, h0 - 1, '手札-1'); eq(r.ownerState.energy.length, e0 + 1, 'エナ+1');
});
test('ADD_TO_ENERGY: SEARCHで選んだシグニをエナゾーンへ（手札を経由しない）', () => {
  const ctx = mkCtx({}, {});
  const e0 = ctx.ownerState.energy.length;
  const r = run({ type: 'SEARCH', from: { location: 'deck', owner: 'self' }, filter: { cardType: 'シグニ' }, maxCount: 1, then: { type: 'ADD_TO_ENERGY', owner: 'self' }, afterAction: { type: 'SHUFFLE_DECK', owner: 'self' } } as unknown as EffectAction, ctx);
  eq(r.ownerState.energy.length, e0 + 1, 'エナ+1');
});
test('ADD_TO_BEAT: SEARCHで選んだカードを【ビート】ゾーンへ（WDK14-008系）', () => {
  const ctx = mkCtx({}, {});
  const r = run({ type: 'SEARCH', from: { location: 'deck', owner: 'self' }, filter: { cardType: 'シグニ' }, maxCount: 1, then: { type: 'ADD_TO_BEAT', owner: 'self' }, afterAction: { type: 'SHUFFLE_DECK', owner: 'self' } } as unknown as EffectAction, ctx);
  const beat = r.ownerState.field.beat_zone ?? [];
  ok(beat.length >= 1, `beat_zone (${JSON.stringify(beat)})`);
});
test('ADD_TO_LIFE fromTop: デッキトップ2枚をライフクロスに追加', () => {
  const ctx = mkCtx({}, {});
  const d0 = ctx.ownerState.deck.length; const l0 = ctx.ownerState.life_cloth.length;
  const r = run({ type: 'ADD_TO_LIFE', owner: 'self', count: 2, fromTop: true } as EffectAction, ctx);
  eq(r.ownerState.life_cloth.length, l0 + 2, 'ライフ+2'); eq(r.ownerState.deck.length, d0 - 2, 'デッキ-2');
});
// Opusタスク12: デッキトップ private look 条件付き配置（「一番上を見る。それが〜のシグニの場合、それを場に出す」）が
// sentence 分割で LOOK + bare ADD_TO_FIELD になり filter/optional が脱落していた回帰（WX16-038/WX15-001）。
test('デッキトップ private look 条件付き配置: filter＋optional を保持（WX16-038/WX15-001・タスク12）', () => {
  const addStep = (txt: string) => {
    const seq = parseCardEffects({ CardNum: 'TEST-LOOK', Type: 'シグニ', EffectText: txt } as unknown as CardData)[0].action as SequenceAction;
    return seq.steps.find(s => s.type === 'ADD_TO_FIELD') as AddToFieldAction;
  };
  const e1 = addStep('【出】：あなたのデッキの一番上を見る。それが《ライズアイコン》を持つ＜武勇＞のシグニの場合、それを場に出してもよい。');
  const s1 = e1.source as { type: string; fromTop?: boolean; filter?: Record<string, unknown> } | undefined;
  eq(e1.optional, true, 'E1 optional（もよい）');
  eq(s1?.type, 'DECK_CARD', 'E1 source=DECK_CARD'); eq(s1?.fromTop, true, 'E1 fromTop');
  eq(s1?.filter?.story, '武勇', 'E1 story=武勇'); eq(s1?.filter?.hasRiseIcon, true, 'E1 hasRiseIcon');
  const e2 = addStep('【自】：このシグニがライズされたとき、あなたのデッキの一番上を見る。それが《ライズアイコン》を持たない＜武勇＞のシグニの場合、それを場に出してもよい。');
  const s2 = e2.source as { filter?: Record<string, unknown> } | undefined;
  eq(s2?.filter?.noRiseIcon, true, 'E2 noRiseIcon（持たない）');
  const e3 = addStep('【自】：あなたのメインフェイズ開始時、あなたのデッキの一番上を見る。それが赤のシグニの場合、それを場に出してもよい。');
  eq((e3.source as { filter?: Record<string, unknown> } | undefined)?.filter?.color, '赤', 'E3 color=赤');
});
test('ADD_TO_FIELD DECK_CARD filter gating: トップが filter 一致で場に出す/不一致で出さない（hasRiseIcon/noRiseIcon）', () => {
  const rise = findCard(c => isSigni(c) && (c.EffectText ?? '').includes('【ライズ】'));
  const plain = findCard(c => isSigni(c) && !(c.EffectText ?? '').includes('【ライズ】'));
  const play = (top: string, filter: Record<string, unknown>) => {
    const ctx = mkCtx({ signi: [null, null, null], deckTop: [top] }, {});
    const r = run({ type: 'ADD_TO_FIELD', owner: 'self', optional: true, source: { type: 'DECK_CARD', owner: 'self', count: 1, fromTop: true, filter } } as unknown as EffectAction, ctx);
    return tops(r.ownerState as PlayerState).includes(top);
  };
  ok(play(rise, { cardType: 'シグニ', hasRiseIcon: true }), 'ライズ持ちトップは hasRiseIcon で場に出る');
  ok(!play(plain, { cardType: 'シグニ', hasRiseIcon: true }), 'ライズ非持ちトップは hasRiseIcon で出ない');
  ok(play(plain, { cardType: 'シグニ', noRiseIcon: true }), 'ライズ非持ちトップは noRiseIcon で場に出る');
  ok(!play(rise, { cardType: 'シグニ', noRiseIcon: true }), 'ライズ持ちトップは noRiseIcon で出ない');
});
test('NEGATE_ATTACK 相手シグニ1: negated_attacks に記録', () => {
  const ctx = mkCtx({}, { signi: [SIGNI, null, null] });
  const r = run({ type: 'NEGATE_ATTACK', target: { type: 'SIGNI', owner: 'opponent', count: 1, filter: { cardType: 'シグニ' } } } as EffectAction, ctx);
  const neg = (r.otherState as PlayerState).negated_attacks ?? [];
  ok(neg.includes(SIGNI), `negated_attacks (${JSON.stringify(neg)})`);
});
// Opusタスク12(ix)：execBlockAction SIGNI/ATTACK が count/filter を無視し全ブロックしていた回帰（続き103・続き106修正）。
const blockedCount = (st: PlayerState) => Object.keys(st.keyword_grants ?? {}).filter(k => (st.keyword_grants?.[k] ?? []).includes('アタックできない')).length;
test('BLOCK_ACTION SIGNI/ATTACK count:2（選択）: 相手シグニ2体のみアタック不可（従来は全ブロック・WX18-009系）', () => {
  const ctx = mkCtx({}, { signi: [SIGNI, SIGNI_P3000, SIGNI_P12000] });
  const r = run({ type: 'BLOCK_ACTION', target: { type: 'SIGNI', owner: 'opponent', count: 2, upToCount: true, filter: { cardType: 'シグニ' } }, actionId: 'ATTACK', until: 'END_OF_TURN' } as EffectAction, ctx);
  eq(blockedCount(r.ownerState as PlayerState), 2, '3体中2体のみブロック（全ブロックしない）');
});
test('BLOCK_ACTION SIGNI/ATTACK count:1（選択）: 相手シグニ1体のみアタック不可', () => {
  const ctx = mkCtx({}, { signi: [SIGNI, SIGNI_P3000, null] });
  const r = run({ type: 'BLOCK_ACTION', target: { type: 'SIGNI', owner: 'opponent', count: 1, filter: { cardType: 'シグニ' } }, actionId: 'ATTACK', until: 'END_OF_TURN' } as EffectAction, ctx);
  eq(blockedCount(r.ownerState as PlayerState), 1, '2体中1体のみブロック');
});
test('BLOCK_ACTION SIGNI/ATTACK count:ALL: 相手全シグニがアタック不可', () => {
  const ctx = mkCtx({}, { signi: [SIGNI, SIGNI_P3000, null] });
  const r = run({ type: 'BLOCK_ACTION', target: { type: 'SIGNI', owner: 'opponent', count: 'ALL', filter: { cardType: 'シグニ' } }, actionId: 'ATTACK', until: 'END_OF_TURN' } as EffectAction, ctx);
  eq(blockedCount(r.ownerState as PlayerState), 2, '全2体ブロック');
});
test('代わりに置換(五面): 条件未成立は基本のみ・成立で強化のみ（従来はSEQUENCE両実行の過剰効果・WX06-006系）', () => {
  const eff = { type: 'CONDITIONAL', condition: { type: 'AND', conditions: [{ type: 'LRIG_COLOR', owner: 'self', color: '黒' }, { type: 'LIFE_COUNT', owner: 'self', operator: 'lte', value: 2 }] },
    then: { type: 'POWER_MODIFY', target: { type: 'SIGNI', owner: 'opponent', count: 2, upToCount: true, filter: { cardType: 'シグニ' } }, delta: -15000 },
    else: { type: 'POWER_MODIFY', target: { type: 'SIGNI', owner: 'opponent', count: 1, filter: { cardType: 'シグニ' } }, delta: -12000 } } as unknown as EffectAction;
  // 条件未成立（ルリグなし・ライフ7）→ else の基本 -12000 のみ
  const m1 = (run(eff, mkCtx({}, { signi: [SIGNI, SIGNI_P3000, null] })).otherState as PlayerState).temp_power_mods ?? [];
  ok(m1.some(m => m.delta === -12000) && !m1.some(m => m.delta === -15000), `未成立=基本のみ (${JSON.stringify(m1)})`);
  // 条件成立（黒ルリグ WD05-001・ライフ2）→ then の強化 -15000 のみ
  const ctx2 = mkCtx({ life: 2 }, { signi: [SIGNI, SIGNI_P3000, null] });
  ctx2.ownerState.field.lrig = ['WD05-001'];
  const m2 = (run(eff, ctx2).otherState as PlayerState).temp_power_mods ?? [];
  ok(m2.some(m => m.delta === -15000) && !m2.some(m => m.delta === -12000), `成立=強化のみ (${JSON.stringify(m2)})`);
});
test('CONTINUOUS BLOCK_ACTION「このシグニはアタックできない」: 能力保持シグニが cannotAttackSigni に入る（続き106・WX05-023）', () => {
  // parser が ATTACK(SIGNI,owner:self) 形を出すのを calcContinuousBlockedActions が拾わず無効化されていた回帰。
  const host = mkState({ signi: ['WX05-023', SIGNI, null] });
  const r = calcContinuousBlockedActions(host, mkState({}), true, effectsMap, cardMap as Map<string, CardData>);
  eq(r.cannotAttackSigni.has('WX05-023'), true, '自己アタック封じが有効');
  eq(r.cannotAttackSigni.has(SIGNI), false, '他のシグニは制限されない');
});
test('AWAKEN_SIGNI: 効果元シグニが覚醒状態になる（awakened_signi）', () => {
  const src = SIGNI;
  const ctx = mkCtx({ signi: [src, null, null] }, {}, src);
  const r = run({ type: 'AWAKEN_SIGNI' } as EffectAction, ctx);
  const awakened = (r.ownerState as PlayerState).awakened_signi ?? [];
  ok(awakened.includes(src), `awakened_signi (${JSON.stringify(awakened)})`);
});
test('PLACE_UNDER_SIGNI deck_top: デッキトップ2枚を効果元シグニの下に置く', () => {
  const src = SIGNI;
  const ctx = mkCtx({ signi: [src, null, null] }, {}, src);
  const d0 = ctx.ownerState.deck.length;
  const r = run({ type: 'PLACE_UNDER_SIGNI', source: 'deck_top', count: 2 } as EffectAction, ctx);
  eq(r.ownerState.deck.length, d0 - 2, 'デッキ-2');
  eq(r.ownerState.field.signi[0]?.length, 3, 'signi[0]スタック=元本体1+下2枚=3');
});
test('STORY_CHANGE(count:ALL): 対象シグニの story_overrides を書き換え（実カード母集団0件＝現状未使用の型）', () => {
  const ctx = mkCtx({}, { signi: [SIGNI, null, null] });
  const r = run({ type: 'STORY_CHANGE', target: { type: 'SIGNI', owner: 'opponent', count: 'ALL', filter: { cardType: 'シグニ' } }, newStory: 'テストストーリー' } as EffectAction, ctx);
  const overrides = (r.otherState as PlayerState).story_overrides ?? {};
  eq(overrides[SIGNI], 'テストストーリー', 'story_overrides');
});
test('GAIN_BOND source:last_found: 直前選択カードとの絆を bonds へ記録', () => {
  const ctx = { ...mkCtx({}, {}), lastProcessedCards: [SIGNI] } as ExecCtx;
  const name = ctx.cardMap.get(SIGNI)?.CardName;
  const r = run({ type: 'GAIN_BOND', source: 'last_found' } as EffectAction, ctx);
  ok((r.ownerState.bonds ?? []).includes(name!), `bonds (${JSON.stringify(r.ownerState.bonds)})`);
});
test('REMOVE_CHARM 相手シグニのチャーム1枚: signi_charms を除去しトラッシュへ', () => {
  const ctx = mkCtx({}, { signi: [SIGNI, null, null] });
  ctx.otherState.field.signi_charms = ['CHARM-X', null, null];
  const t0 = ctx.otherState.trash.length;
  const r = run({ type: 'REMOVE_CHARM', targetOwner: 'opponent', count: 1 } as EffectAction, ctx);
  eq(r.otherState.field.signi_charms?.[0] ?? null, null, 'charm除去');
  eq(r.otherState.trash.length, t0 + 1, 'トラッシュ+1');
});
// 続き188: ATTACH_CHARM の to.filter.isTriggerSource＝「そのシグニの【チャーム】にする」を場に出たトリガー元
// シグニ（triggeringCardNum）に解決する（WXEX2-76/WX08-006＝対戦相手のシグニが場に出たとき any_opp）。
// 従来 to が任意対象になり「対戦相手のシグニ1体」に化けていた回帰ガード。
test('ATTACH_CHARM isTriggerSource: 場に出たトリガー元シグニに相手デッキトップをチャーム（WXEX2-76）', () => {
  const trigSigni = fresh();
  const oppDeckTop = fresh();
  const ctx = mkCtx({}, { signi: [trigSigni, null, null], deckTop: [oppDeckTop] });
  (ctx as { triggeringCardNum?: string }).triggeringCardNum = trigSigni;
  const action = { type: 'ATTACH_CHARM',
    charm: { type: 'DECK_CARD', owner: 'opponent', count: 1 },
    to: { type: 'SIGNI', owner: 'opponent', count: 1, filter: { isTriggerSource: true } },
  } as unknown as EffectAction;
  const r = run(action, ctx);
  eq(r.otherState.field.signi_charms?.[0], oppDeckTop, 'トリガー元シグニ(zone0)に相手デッキトップがチャームされる');
  ok(!r.otherState.deck.includes(oppDeckTop), 'チャームカードは相手デッキから抜ける');
});
test('DISCARD_BOTH 各1枚: 両プレイヤーの手札-1・トラッシュ+1', () => {
  const ctx = mkCtx({ hand: 5 }, { hand: 5 });
  const hs0 = ctx.ownerState.hand.length; const ho0 = ctx.otherState.hand.length;
  const r = run({ type: 'DISCARD_BOTH', count: 1 } as EffectAction, ctx);
  eq(r.ownerState.hand.length, hs0 - 1, '自手札-1'); eq(r.otherState.hand.length, ho0 - 1, '相手手札-1');
});

// ── Opusタスク12：applyDirectAction の型対応漏れ回帰（続き93 で発見・smoke SKIP 258/実UIフリーズの真因）──
// count:1 の外部SELECT_TARGET経路。修正前は default→元アクション再実行で同一SELECT_TARGET無限再発行（autopilot hang）
// または選んだカードを無視して別対象へすり替わっていた。各型に applyDirectAction の case を新設して解消。
test('ENERGY_CHARGE(count:1・選択): 手札シグニ1枚を選んでエナへ 手札-1 エナ+1', () => {
  const ctx = mkCtx({ hand: 3 }, {});
  const h0 = ctx.ownerState.hand.length; const e0 = ctx.ownerState.energy.length;
  const r = run({ type: 'ENERGY_CHARGE', target: { type: 'HAND_CARD', owner: 'self', count: 1, filter: { cardType: 'シグニ' } } } as EffectAction, ctx);
  eq(r.ownerState.hand.length, h0 - 1, '手札-1'); eq(r.ownerState.energy.length, e0 + 1, 'エナ+1');
});
test('ENERGY_CHARGE(SEARCH→then:DECK_CARD): デッキから探して見つけた札をエナへ（実カード81件の主形・WX07-017等）', () => {
  const ctx = mkCtx({}, {});
  const e0 = ctx.ownerState.energy.length; const d0 = ctx.ownerState.deck.length;
  const r = run({ type: 'SEARCH', from: { location: 'deck', owner: 'self' }, filter: { cardType: 'シグニ' }, maxCount: 1,
    then: { type: 'ENERGY_CHARGE', target: { type: 'DECK_CARD', owner: 'self' } }, afterAction: { type: 'SHUFFLE_DECK', owner: 'self' } } as unknown as EffectAction, ctx);
  eq(r.ownerState.energy.length, e0 + 1, 'エナ+1'); eq(r.ownerState.deck.length, d0 - 1, 'デッキ-1（場のシグニ選択へすり替わらない）');
});
test('TRANSFER_TO_DECK(SIGNI count:1・選択): 相手シグニ1体をデッキ下へ 場から除去', () => {
  const ctx = mkCtx({}, { signi: [SIGNI, null, null] });
  const d0 = ctx.otherState.deck.length;
  const r = run({ type: 'TRANSFER_TO_DECK', source: { type: 'SIGNI', owner: 'opponent', count: 1, filter: { cardType: 'シグニ' } }, position: 'bottom' } as EffectAction, ctx);
  eq(tops(r.otherState as PlayerState)[0], null, '場から除去'); eq((r.otherState as PlayerState).deck.length, d0 + 1, 'デッキ+1');
});
test('GRANT_PROTECTION(SIGNI count:1・選択): 自シグニ1体に効果耐性キーワード付与', () => {
  const ctx = mkCtx({ signi: [SIGNI, null, null] }, {});
  const r = run({ type: 'GRANT_PROTECTION', target: { type: 'SIGNI', owner: 'self', count: 1, filter: { cardType: 'シグニ' } }, from: ['banish'], duration: 'THIS_TURN' } as EffectAction, ctx);
  const grants = (r.ownerState as PlayerState).keyword_grants ?? {};
  ok((grants[SIGNI] ?? []).some(k => k.startsWith('PROTECTION:')), `keyword_grants (${JSON.stringify(grants)})`);
});
test('POWER_SET(SIGNI count:1・選択): 相手シグニ1体のパワーを0に固定（delta=0-base）', () => {
  const ctx = mkCtx({}, { signi: [SIGNI, null, null] });
  const base = parseInt(cardMap.get(SIGNI)?.Power || '0');
  const r = run({ type: 'POWER_SET', target: { type: 'SIGNI', owner: 'opponent', count: 1, filter: { cardType: 'シグニ' } }, value: 0 } as EffectAction, ctx);
  const mods = (r.otherState as PlayerState).temp_power_mods ?? [];
  ok(mods.some(m => m.cardNum === SIGNI && m.delta === -base), `temp_power_mods (${JSON.stringify(mods)})`);
});
test('POWER_MODIFY_PER_FIELD(count:1・選択): 自場の＜毒牙＞数×deltaを選んだ相手シグニに適用（WX04-037）', () => {
  const ctx = mkCtx({ signi: ['WX04-037', 'WX04-053', null] }, { signi: [SIGNI, null, null] });
  const r = run({ type: 'POWER_MODIFY_PER_FIELD', target: { type: 'SIGNI', owner: 'opponent', count: 1, filter: { cardType: 'シグニ' } }, deltaPerUnit: -1000, countFilter: { cardType: 'シグニ', story: '毒牙' }, countOwner: 'self' } as EffectAction, ctx);
  const mods = (r.otherState as PlayerState).temp_power_mods ?? [];
  ok(mods.some(m => m.cardNum === SIGNI && m.delta === -2000), `temp_power_mods (${JSON.stringify(mods)})`);
});
test('STORY_CHANGE(count:1・選択): 選んだ相手シグニ1体だけの story_overrides を書き換え（修正前は default→execStoryChange 再実行で同一SELECT_TARGET無限再発行）', () => {
  const ctx = mkCtx({}, { signi: [SIGNI, 'WX04-053', null] });
  const r = run({ type: 'STORY_CHANGE', target: { type: 'SIGNI', owner: 'opponent', count: 1, filter: { cardType: 'シグニ' } }, newStory: 'テストストーリー' } as EffectAction, ctx);
  const overrides = (r.otherState as PlayerState).story_overrides ?? {};
  eq(overrides[SIGNI], 'テストストーリー', '選んだ1体に付与');
  eq(overrides['WX04-053'] ?? null, null, '非選択シグニは書き換えない');
});
test('POWER_MODIFY_PER_LRIG_LEVEL(count:1・選択): 自ルリグLv×deltaを選んだ相手シグニに適用（WX04-101系）', () => {
  const ctx = mkCtx({}, { signi: [SIGNI, null, null] });
  ctx.ownerState.field.lrig = ['WD03-002']; // Lv3
  const r = run({ type: 'POWER_MODIFY_PER_LRIG_LEVEL', target: { type: 'SIGNI', owner: 'opponent', count: 1, filter: { cardType: 'シグニ' } }, deltaPerLevel: -1000, lrigOwner: 'self' } as EffectAction, ctx);
  const mods = (r.otherState as PlayerState).temp_power_mods ?? [];
  ok(mods.some(m => m.cardNum === SIGNI && m.delta === -3000), `temp_power_mods (${JSON.stringify(mods)})`);
});

// ── §3 Sonnetタスク5続き（続き83・POWER_MODIFY_PER_*/BY_* 系13型）──
// ⚠一部の型（LRIG_LEVEL/FIELD等）は target.count が非'ALL'だとselectOrInteract→applyDirectActionの
// 欠落caseに落ちる続き82発見バグ（Opusタスク12(v)）を踏むため、実カードにない構成のみ count:'ALL' に迂回。
// POWER_MODIFY/POWER_MODIFY_BY_TARGET_LEVEL等へ委譲する型（BY_SOURCE/PER_TRASHED_LEVEL/PER_HAND_COUNT/
// PER_CHARM(trashed_this_effect)/MULTIPLY）は委譲先が対応済みのためcount:1のSELECT_TARGET経路でも安全。
test('POWER_MODIFY_PER_STACK: CONTINUOUS＝下段カード枚数×deltaPerCard（WX05-023）', () => {
  const base = parseInt(cardMap.get('WX05-023')?.Power || '0');
  const st = mkState({});
  st.field.signi[0] = ['UNDER1', 'UNDER2', 'WX05-023'];
  const p = calcFieldPowers(st, mkState({}), true, effectsMap, cardMap as Map<string, CardData>);
  eq(p.get('WX05-023'), base + 4000, '下2枚×2000');
});
test('POWER_MODIFY_PER_LEVEL_SUM: CONTINUOUS＝場の他＜龍獣＞のレベル合計×deltaPerLevel（WX05-058・excludeSelf）', () => {
  const base = parseInt(cardMap.get('WX05-058')?.Power || '0');
  const st = mkState({ signi: ['WX05-058', 'WX04-068', 'WX04-072'] }); // 龍獣 Lv2+Lv1=3
  const p = calcFieldPowers(st, mkState({}), true, effectsMap, cardMap as Map<string, CardData>);
  eq(p.get('WX05-058'), base + 3000, '他＜龍獣＞レベル合計3×1000');
});
test('POWER_MODIFY_PER_LRIG_LEVEL(count:ALL): 自センタールリグLv×deltaPerLevelを相手全シグニに適用（WX04-101系）', () => {
  const ctx = mkCtx({}, { signi: [SIGNI, SIGNI_P3000, null] });
  ctx.ownerState.field.lrig = ['WD03-002']; // Lv3
  const r = run({ type: 'POWER_MODIFY_PER_LRIG_LEVEL', target: { type: 'SIGNI', owner: 'opponent', count: 'ALL', filter: { cardType: 'シグニ' } }, deltaPerLevel: -1000, lrigOwner: 'self' } as EffectAction, ctx);
  const mods = (r.otherState as PlayerState).temp_power_mods ?? [];
  eq(mods.filter(m => m.delta === -3000).length, 2, `temp_power_mods (${JSON.stringify(mods)})`);
});
test('POWER_MODIFY_PER_LIFE_COUNT: CONTINUOUS＝自ライフクロス枚数×deltaPerLife（WX24-P3-052）', () => {
  const base = parseInt(cardMap.get('WX24-P3-052')?.Power || '0');
  const p = calcFieldPowers(mkState({ signi: ['WX24-P3-052', null, null], life: 3 }), mkState({}), true, effectsMap, cardMap as Map<string, CardData>);
  eq(p.get('WX24-P3-052'), base - 6000, 'ライフ3枚×-2000');
});
test('POWER_MODIFY_PER_DECK_COUNT: CONTINUOUS＝自デッキ枚数÷unitSize×deltaPerUnit（PR-442・続き135で新規実装）', () => {
  // PR-442「【常】：このシグニのパワーはあなたのデッキの枚数10枚につき＋4000される」。この型だけ CONTINUOUS
  // 計算層に実装が無く、常に無効化されていた（続き84・タスク12(vi)）。端数は切り捨て（25枚→2単位＝+8000）。
  const base = parseInt(cardMap.get('PR-442')?.Power || '0');
  const host = mkState({ signi: ['PR-442', null, null] });
  host.deck = Array.from({ length: 25 }, (_, i) => `D${i}`);
  eq(calcFieldPowers(host, mkState({}), true, effectsMap, cardMap as Map<string, CardData>).get('PR-442'), base + 8000, 'デッキ25枚→floor(25/10)=2単位×+4000');
  const host2 = mkState({ signi: ['PR-442', null, null] });
  host2.deck = Array.from({ length: 9 }, (_, i) => `D${i}`);
  eq(calcFieldPowers(host2, mkState({}), true, effectsMap, cardMap as Map<string, CardData>).get('PR-442'), base, 'デッキ9枚→0単位＝増減なし');
});
test('POWER_MODIFY_PER_VIRUS_COUNT: CONTINUOUS＝相手場のウィルス数×deltaPerVirus（WX16-032）', () => {
  const base = parseInt(cardMap.get('WX16-032')?.Power || '0');
  const other = mkState({});
  other.field.signi_virus = [1, 1, 0];
  const p = calcFieldPowers(mkState({ signi: ['WX16-032', null, null] }), other, true, effectsMap, cardMap as Map<string, CardData>);
  eq(p.get('WX16-032'), base + 2000, '相手ウィルス2×1000');
});
test('POWER_MODIFY_PER_ENERGY_COLOR: CONTINUOUS＝自エナの色種類数×deltaPerColor（WX14-063）', () => {
  const base = parseInt(cardMap.get('WX14-063')?.Power || '0');
  const oneColor = (col: string) => [...cardMap.values()].find(c => c.Type === 'シグニ' && (c.Color || '').includes(col))!.CardNum;
  const st = mkState({ signi: ['WX14-063', null, null] });
  st.energy = [oneColor('白'), oneColor('赤'), oneColor('青')];
  const p = calcFieldPowers(st, mkState({}), true, effectsMap, cardMap as Map<string, CardData>);
  eq(p.get('WX14-063'), base + 3000, 'エナ3色×1000');
});
test('POWER_MODIFY_PER_CHARM(trashed_this_effect): 自チャームをトラッシュしその枚数×deltaPerCharmをPOWER_MODIFYへ委譲（WX07-045）', () => {
  const ctx = mkCtx({}, { signi: [SIGNI, null, null] });
  ctx.ownerState.field.signi_charms = ['CHARM-A', null, null];
  const t0 = ctx.ownerState.trash.length;
  const r = run({ type: 'POWER_MODIFY_PER_CHARM', target: { type: 'SIGNI', owner: 'opponent', count: 1, filter: { cardType: 'シグニ' } }, deltaPerCharm: -7000, sourceOwner: 'self', sourceLocation: 'trashed_this_effect' } as EffectAction, ctx);
  eq(r.ownerState.trash.length, t0 + 1, '自チャーム1枚をトラッシュ');
  const mods = (r.otherState as PlayerState).temp_power_mods ?? [];
  ok(mods.some(m => m.delta === -7000), `temp_power_mods (${JSON.stringify(mods)})`);
});
test('POWER_MODIFY_PER_FIELD(count:ALL): 自場の＜毒牙＞数×deltaPerUnitを相手全シグニに適用（WX04-037）', () => {
  const ctx = mkCtx({ signi: ['WX04-037', 'WX04-053', null] }, { signi: [SIGNI, SIGNI_P3000, null] });
  const r = run({ type: 'POWER_MODIFY_PER_FIELD', target: { type: 'SIGNI', owner: 'opponent', count: 'ALL', filter: { cardType: 'シグニ' } }, deltaPerUnit: -1000, countFilter: { cardType: 'シグニ', story: '毒牙' }, countOwner: 'self' } as EffectAction, ctx);
  const mods = (r.otherState as PlayerState).temp_power_mods ?? [];
  eq(mods.filter(m => m.delta === -2000).length, 2, `temp_power_mods (${JSON.stringify(mods)})`);
});
test('POWER_MODIFY_BY_TARGET_LEVEL: 対象自身のレベル×deltaPerLevel（WX06-021 BURST）', () => {
  const ctx = mkCtx({}, { signi: [SIGNI_L3, null, null] });
  const r = run({ type: 'POWER_MODIFY_BY_TARGET_LEVEL', target: { type: 'SIGNI', owner: 'opponent', count: 1, filter: { cardType: 'シグニ' } }, deltaPerLevel: -3000 } as EffectAction, ctx);
  const mods = (r.otherState as PlayerState).temp_power_mods ?? [];
  ok(mods.some(m => m.cardNum === SIGNI_L3 && m.delta === -9000), `temp_power_mods (${JSON.stringify(mods)})`);
});
test('POWER_MODIFY_BY_SOURCE: 効果元のパワー×multiplierをPOWER_MODIFYへ委譲（WXK10-075）', () => {
  const src = SIGNI_P12000;
  const ctx = mkCtx({ signi: [src, null, null] }, { signi: [SIGNI_P3000, null, null] }, src);
  const r = run({ type: 'POWER_MODIFY_BY_SOURCE', target: { type: 'SIGNI', owner: 'opponent', count: 1, filter: { cardType: 'シグニ' } }, basis: 'power', multiplier: -1 } as EffectAction, ctx);
  const mods = (r.otherState as PlayerState).temp_power_mods ?? [];
  ok(mods.some(m => m.cardNum === SIGNI_P3000 && m.delta === -12000), `temp_power_mods (${JSON.stringify(mods)})`);
});
test('POWER_MODIFY_PER_TRASHED_LEVEL: 直前トラッシュ札のレベル合計×deltaPerLevelをPOWER_MODIFYへ委譲（WX09-021）', () => {
  const ctx = { ...mkCtx({}, { signi: [SIGNI_P3000, null, null] }), lastProcessedCards: [SIGNI_L2] } as ExecCtx;
  const r = run({ type: 'POWER_MODIFY_PER_TRASHED_LEVEL', target: { type: 'SIGNI', owner: 'opponent', count: 1, filter: { cardType: 'シグニ' } }, deltaPerLevel: -2000 } as EffectAction, ctx);
  const mods = (r.otherState as PlayerState).temp_power_mods ?? [];
  ok(mods.some(m => m.cardNum === SIGNI_P3000 && m.delta === -4000), `temp_power_mods (${JSON.stringify(mods)})`);
});
test('POWER_MODIFY_PER_HAND_COUNT: 自手札枚数×deltaPerCardをPOWER_MODIFYへ委譲（WXDi-P16-070）', () => {
  const ctx = mkCtx({ signi: [SIGNI, null, null], hand: 3 }, {});
  const r = run({ type: 'POWER_MODIFY_PER_HAND_COUNT', target: { type: 'SIGNI', owner: 'self', count: 1, filter: { cardType: 'シグニ' } }, deltaPerCard: 1000, handOwner: 'self' } as EffectAction, ctx);
  const mods = (r.ownerState as PlayerState).temp_power_mods ?? [];
  ok(mods.some(m => m.cardNum === SIGNI && m.delta === 3000), `temp_power_mods (${JSON.stringify(mods)})`);
});
test('POWER_MULTIPLY: パワーを2倍に（delta=現在パワー×(multiplier-1)・WX10-077）', () => {
  const src = SIGNI_P3000;
  const ctx = mkCtx({ signi: [src, null, null] }, {}, src);
  const r = run({ type: 'POWER_MULTIPLY', target: { type: 'SIGNI', owner: 'self', count: 1, filter: { cardType: 'シグニ' } }, multiplier: 2 } as EffectAction, ctx);
  const mods = (r.ownerState as PlayerState).temp_power_mods ?? [];
  ok(mods.some(m => m.cardNum === src && m.delta === 3000), `temp_power_mods (${JSON.stringify(mods)})`);
});

// ── §3 Sonnetタスク5続き（続き84・9型）──
// ⚠POWER_MODIFY_PER_DECK_COUNT（実カード1件＝PR-442・CONTINUOUS）はeffectEngine.ts側にcalc実装が
// 一切無く、executorのcaseも「effectEngine処理」とコメントするだけの無言no-opと確認＝テストせずOpusタスク12へ登録。
// BLOOD_CRYSTAL_ARMORは「同名カードの別コピー」判定がこのテストハーネス（suffix無しのCardNum直値）では
// 表現できず（本物のengineは instance ID に#suffixがある）、見送り。
test('DRAW_PER_FIELD_COUNT: 自場の該当シグニ数×drawPerUnit枚ドロー（WX02-061）', () => {
  const ctx = mkCtx({ signi: ['WD03-009', 'WD03-010', null], hand: 5 }, {});
  const h0 = ctx.ownerState.hand.length; const d0 = ctx.ownerState.deck.length;
  const r = run({ type: 'DRAW_PER_FIELD_COUNT', drawPerUnit: 1, countFilter: { cardType: 'シグニ', story: ['電機', '水獣'] }, countOwner: 'self' } as EffectAction, ctx);
  eq(r.ownerState.hand.length, h0 + 2, '手札+2'); eq(r.ownerState.deck.length, d0 - 2, 'デッキ-2');
});
// 続き184: DRAW_PER_LRIG_LEVEL＝「あなたのセンタールリグのレベル1につきカードを1枚引く」（WX12-013/WDK07-E09）。
// 従来 DRAW count:1 に潰れていたのを、自センタールリグのレベル×drawPerLevel 枚に是正した回帰ガード。
test('DRAW_PER_LRIG_LEVEL: 自センタールリグのレベル×drawPerLevel枚ドロー（WX12-013）', () => {
  const L4 = findCard(c => c.Type === 'ルリグ' && c.Level === '4');
  const ctx = mkCtx({ hand: 5 }, {});
  ctx.ownerState.field.lrig = [L4];
  const h0 = ctx.ownerState.hand.length; const d0 = ctx.ownerState.deck.length;
  const r = run({ type: 'DRAW_PER_LRIG_LEVEL', drawPerLevel: 1, lrigOwner: 'self', owner: 'self' } as EffectAction, ctx);
  eq(r.ownerState.hand.length, h0 + 4, '手札+4（Lv4×1）'); eq(r.ownerState.deck.length, d0 - 4, 'デッキ-4');
});
// 続き187: ENERGY_CHARGE_PER_LRIG_LEVEL＝「あなたのセンタールリグのレベル1につき【エナチャージ1】をする」（WXK10-004/WX26-CP1-003①）。
// 「引くか…エナチャージ」の二択で、従来は【エナチャージ】ショートハンドに先取りされ count:1 に潰れていた回帰ガード。
test('ENERGY_CHARGE_PER_LRIG_LEVEL: 自センタールリグのレベル×chargePerLevel枚をデッキからエナへ（WXK10-004）', () => {
  const L4 = findCard(c => c.Type === 'ルリグ' && c.Level === '4');
  const ctx = mkCtx({}, {});
  ctx.ownerState.field.lrig = [L4];
  const e0 = ctx.ownerState.energy.length; const d0 = ctx.ownerState.deck.length;
  const r = run({ type: 'ENERGY_CHARGE_PER_LRIG_LEVEL', chargePerLevel: 1, lrigOwner: 'self', owner: 'self' } as EffectAction, ctx);
  eq(r.ownerState.energy.length, e0 + 4, 'エナ+4（Lv4×1）'); eq(r.ownerState.deck.length, d0 - 4, 'デッキ-4');
});
// 続き190: DRAW{perLastProcessedLevel}＝「（公開した）そのシグニのレベル1につきカードを1枚引く」（WD21-001-E2）。
// REVEAL_AND_PICK の then で公開シグニ（lastProcessedCards）のレベル合計×count 枚に是正した回帰ガード。
// 従来は DRAW count:1 に潰れ「レベル1につき」を無視して常に1枚だった。
test('DRAW{perLastProcessedLevel}: 直前公開シグニのレベル×count枚ドロー（WD21-001-E2）', () => {
  const ctx = { ...mkCtx({}, {}), lastProcessedCards: [SIGNI_L3] } as ExecCtx; // レベル3
  const h0 = ctx.ownerState.hand.length; const d0 = ctx.ownerState.deck.length;
  const r = run({ type: 'DRAW', owner: 'self', count: 1, perLastProcessedLevel: true } as EffectAction, ctx);
  eq(r.ownerState.hand.length, h0 + 3, '手札+3（Lv3×1）'); eq(r.ownerState.deck.length, d0 - 3, 'デッキ-3');
});
test('ENERGY_CHARGE_FROM_DECK_PER_FIELD_COUNT: 自場の該当シグニ数×chargePerUnit枚をデッキからエナへ（WX02-066）', () => {
  const ctx = mkCtx({ signi: ['WD04-009', 'WD04-010', null] }, {});
  const e0 = ctx.ownerState.energy.length; const d0 = ctx.ownerState.deck.length;
  const r = run({ type: 'ENERGY_CHARGE_FROM_DECK_PER_FIELD_COUNT', chargePerUnit: 1, countFilter: { cardType: 'シグニ', story: ['空獣', '地獣', '植物'] }, countOwner: 'self', owner: 'self' } as EffectAction, ctx);
  eq(r.ownerState.energy.length, e0 + 2, 'エナ+2'); eq(r.ownerState.deck.length, d0 - 2, 'デッキ-2');
});
test('PLACE_UNDER_SIGNI source:hand→PLACE_UNDER_SOURCE_SIGNI: 手札から選んで効果元シグニの下に置く', () => {
  const src = SIGNI;
  const ctx = mkCtx({ signi: [src, null, null], hand: 3 }, {}, src);
  const h0 = ctx.ownerState.hand.length;
  const r = run({ type: 'PLACE_UNDER_SIGNI', source: 'hand', count: 1 } as EffectAction, ctx);
  eq(r.ownerState.hand.length, h0 - 1, '手札-1');
  eq(r.ownerState.field.signi[0]?.length, 2, 'signi[0]スタック=元本体1+下1枚=2');
});
test('FORCE_SIGNI_ATTACK: 対象プレイヤーの場シグニは可能ならアタックしなければならない（WX14-018）', () => {
  const ctx = mkCtx({}, {});
  const r = run({ type: 'FORCE_SIGNI_ATTACK', targetOwner: 'opponent' } as EffectAction, ctx);
  eq((r.otherState as PlayerState).must_attack_signi, true, 'must_attack_signi');
});
test('TAKE_FROM_UNDER_SIGNI fromThis: 効果元シグニの下から1枚を手札へ（WX05-023）', () => {
  const src = 'WX05-023';
  const ctx = mkCtx({}, {}, src);
  ctx.ownerState.field.signi[0] = ['UNDER1', src];
  const h0 = ctx.ownerState.hand.length;
  const r = run({ type: 'TAKE_FROM_UNDER_SIGNI', destination: 'hand', count: 1, upToCount: false, fromThis: true } as EffectAction, ctx);
  eq(r.ownerState.hand.length, h0 + 1, '手札+1');
  eq(r.ownerState.field.signi[0]?.length, 1, '下1枚が取られてスタック=1');
});
test('BLOCK_CARD_USE: 指定カード名を blocked_card_names へ登録（WX26-CP1-101）', () => {
  const ctx = mkCtx({}, {});
  const r = run({ type: 'BLOCK_CARD_USE', cardName: '力を貸して！' } as EffectAction, ctx);
  ok((r.ownerState.blocked_card_names ?? []).includes('力を貸して！'), `blocked_card_names (${JSON.stringify(r.ownerState.blocked_card_names)})`);
});
test('ADD_CRAFT_TO_LRIG_DECK: 名前一致するクラフトカードを lrig_deck 先頭へ count 枚追加（WXK09-016系）', () => {
  const ctx = mkCtx({}, {});
  const d0 = ctx.ownerState.lrig_deck.length;
  const r = run({ type: 'ADD_CRAFT_TO_LRIG_DECK', owner: 'self', cardName: '改造素材', count: 1 } as EffectAction, ctx);
  eq(r.ownerState.lrig_deck.length, d0 + 1, 'lrig_deck+1');
  eq(r.ownerState.lrig_deck[0], 'WXK09-TK-01A', '追加したクラフトのCardNum');
});
test('ENERGY_CHARGE_BY_FIELD_COUNT: 自場シグニ数+bonus枚をデッキからエナへ（WX10-035 BURST）', () => {
  const ctx = mkCtx({ signi: [SIGNI, SIGNI_P3000, null] }, {});
  const e0 = ctx.ownerState.energy.length; const d0 = ctx.ownerState.deck.length;
  const r = run({ type: 'ENERGY_CHARGE_BY_FIELD_COUNT', owner: 'self', bonus: 1 } as EffectAction, ctx);
  eq(r.ownerState.energy.length, e0 + 3, 'エナ+3（場2体+bonus1）'); eq(r.ownerState.deck.length, d0 - 3, 'デッキ-3');
});
test('PLACE_VIRUS: 相手の空きゾーンにウィルスを配置（WX15-004）', () => {
  const ctx = mkCtx({}, {});
  ctx.otherState.field.signi_virus = [1, 1, 0];
  const r = run({ type: 'PLACE_VIRUS', targetOwner: 'opponent', zoneCount: 1, virusCount: 1 } as EffectAction, ctx);
  eq(r.otherState.field.signi_virus?.[2], 1, 'zone2にウィルス配置');
});

// ── §3 Sonnetタスク5続き（続き85・golden型網羅の残り・機構待ち15型/no-opプレースホルダ5型を除いた実質最終バッチ）──
test('PLACE_SIGNI_ON_FIELD: 複数カードを1枚ずつ場に配置（SEARCH→ADD_TO_FIELD経路の内部機構）', () => {
  const ctx = mkCtx({}, {});
  const cardA = SIGNI, cardB = SIGNI_P3000;
  const r = run({ type: 'PLACE_SIGNI_ON_FIELD', owner: 'self', cardNums: [cardA, cardB] } as EffectAction, ctx);
  const t = tops(r.ownerState);
  ok(t.includes(cardA) && t.includes(cardB), `field tops (${JSON.stringify(t)})`);
});
test('ADD_TO_FIELD(SELECT_TARGET経由)＋後続ステップ: 空きゾーン2以上でも外側SEQUENCEのcontinuationが実行される（Opusタスク12(xiv) 回帰）', () => {
  // execAddToField(source:ENERGY_CARD,count:1) → SELECT_TARGET → thenAction=ADD_TO_FIELD →
  // applyDirectAction が空きゾーン3つで SELECT_SIGNI_ZONE を要求。旧実装は resumeSelectTarget の
  // `if(!result.done) return result;` が外側 pending.continuation（後続 DRAW）を握り潰し無言no-op化していた。
  const ctx = mkCtx({ energy: 3, hand: 5, signi: [null, null, null] }, {});
  const e0 = ctx.ownerState.energy.length, h0 = ctx.ownerState.hand.length;
  const seq: EffectAction = { type: 'SEQUENCE', steps: [
    { type: 'ADD_TO_FIELD', owner: 'self', source: { type: 'ENERGY_CARD', count: 1 } },
    { type: 'DRAW', owner: 'self', count: 1 },
  ] } as EffectAction;
  const r = run(seq, ctx);
  eq(tops(r.ownerState).filter(x => x !== null).length, 1, 'エナから1体が場に出た');
  eq(r.ownerState.energy.length, e0 - 1, 'エナ-1');
  eq(r.ownerState.hand.length, h0 + 1, '後続DRAWが実行され手札+1（continuation非握り潰し）');
});
test('REVEAL_UNTIL_BANISH_SAME_LEVEL: デッキから＜宇宙＞が出るまで公開→そのレベルの相手シグニをバニッシュ（WX17-038）', () => {
  const ctx = mkCtx({ deckTop: ['WX07-034'] }, { signi: [SIGNI_L3, null, null] }); // 宇宙Lv3
  const r = run({ type: 'REVEAL_UNTIL_BANISH_SAME_LEVEL', revealClass: '宇宙', banishOwner: 'opponent' } as EffectAction, ctx);
  eq(tops(r.otherState)[0], null, 'Lv3の相手シグニがバニッシュされた');
});
test('REVEAL_UNTIL_TO_HAND: デッキから＜美巧＞が出るまで公開→手札へ・残りはシャッフルしてデッキ下（WX04-050）', () => {
  const ctx = mkCtx({ deckTop: [SIGNI, SIGNI_P3000, 'WX04-035'] }, {}); // WX04-035=美巧
  const h0 = ctx.ownerState.hand.length;
  const r = run({ type: 'REVEAL_UNTIL_TO_HAND', owner: 'self', revealClass: '美巧', restDest: 'deck_bottom_shuffled' } as EffectAction, ctx);
  eq(r.ownerState.hand.length, h0 + 1, '手札+1');
  ok(r.ownerState.hand.includes('WX04-035'), '見つけた美巧が手札に');
});
test('REVEAL_UNTIL_TO_FIELD repeat:3: デッキから見つけたシグニを繰り返し場に出す（WX04-093）', () => {
  const ctx = mkCtx({ deckTop: [SIGNI, SIGNI_P3000, SIGNI_L2] }, {});
  const r = run({ type: 'REVEAL_UNTIL_TO_FIELD', owner: 'self', repeat: 3 } as EffectAction, ctx);
  const t = tops(r.ownerState);
  eq(t.filter(x => x !== null).length, 3, `場に3体配置 (${JSON.stringify(t)})`);
});
test('PLACE_LRIGS_UNDER_CENTER: ルリグトラッシュのルリグをセンタールリグの下へ（WX05-001系）', () => {
  const ctx = mkCtx({}, {});
  ctx.ownerState.lrig_trash = ['WD03-002'];
  ctx.ownerState.field.lrig = ['WD03-003'];
  const r = run({ type: 'PLACE_LRIGS_UNDER_CENTER', owner: 'self' } as EffectAction, ctx);
  eq(r.ownerState.lrig_trash.length, 0, 'lrig_trash空');
  eq(JSON.stringify(r.ownerState.field.lrig), JSON.stringify(['WD03-002', 'WD03-003']), 'センタールリグの下に追加');
});
test('calcActiveCostMods: CONTINUOUS COST_REDUCTION/COST_INCREASEを収集（WX01-031/WX04-033）', () => {
  const my = mkState({ signi: ['WX01-031', 'WX04-033', null] });
  const op = mkState({});
  const { forMy, forOp } = calcActiveCostMods(my, op, true, effectsMap, cardMap as Map<string, CardData>);
  ok(forMy.some(m => m.direction === 'decrease' && m.targetCardType === 'スペル' && m.cardColor === '青'), `forMy decrease (${JSON.stringify(forMy)})`);
  ok(forOp.some(m => m.direction === 'increase' && m.targetCardType === 'スペル'), `forOp increase (${JSON.stringify(forOp)})`);
});
test('ATTACH_CHARM optional: デッキトップをこのシグニのチャームにする（WX04-052-E2）', () => {
  const src = 'WX04-052';
  const ctx = mkCtx({ signi: [src, null, null] }, {}, src);
  const deckTop = ctx.ownerState.deck[0];
  const r = run({ type: 'ATTACH_CHARM', optional: true, charm: { type: 'DECK_CARD', owner: 'self', count: 1 }, to: { type: 'SIGNI', owner: 'self', count: 1, filter: { thisCardOnly: true } } } as EffectAction, ctx);
  eq(r.ownerState.field.signi_charms?.[0], deckTop, 'デッキトップがチャームとして付与');
});
test('collectCharmShieldSigni: CONTINUOUS CHARM_PROTECTIONでチャーム付き＜悪魔＞シグニがチャーム盾対象になる（WX04-052-E1）', () => {
  const st = mkState({ signi: ['WX04-052', 'WD05-009', null] }); // WD05-009=悪魔
  st.field.signi_charms = [null, 'CHARM-A', null];
  const shielded = collectCharmShieldSigni(st, mkState({}), true, effectsMap, cardMap as Map<string, CardData>);
  ok(shielded.has('WD05-009'), `shielded (${JSON.stringify([...shielded])})`);
});
test('collectCharmShieldSigni: チャーム無しは盾対象外', () => {
  const st = mkState({ signi: ['WX04-052', 'WD05-009', null] });
  const shielded = collectCharmShieldSigni(st, mkState({}), true, effectsMap, cardMap as Map<string, CardData>);
  eq(shielded.size, 0, 'no charm=no shield');
});
test('MUTUAL_DISCARD_AND_DRAW drawMax: 両者手札全捨て→多い方の枚数だけ両者ドロー（WX03-030）', () => {
  const ctx = mkCtx({ hand: 3 }, { hand: 5 });
  const r = run({ type: 'MUTUAL_DISCARD_AND_DRAW', drawMax: true } as EffectAction, ctx);
  eq(r.ownerState.hand.length, 5, '自分も相手の多い方=5枚ドロー');
  eq(r.otherState.hand.length, 5, '相手も5枚ドロー');
});
test('BANISH_REDIRECT: banish_redirect フラグを立てる（WX01-027）', () => {
  const ctx = mkCtx({}, {});
  const r = run({ type: 'BANISH_REDIRECT', target: { type: 'SIGNI', owner: 'opponent', count: 'ALL', filter: { cardType: 'シグニ' } }, redirectTo: 'trash', until: 'END_OF_TURN' } as EffectAction, ctx);
  eq((r.ownerState as PlayerState).banish_redirect, true, 'banish_redirect');
});
test('REARRANGE_SIGNI count:ALL: 並び替え要求→resumeRearrangeSigniで新配置に反映（WX04-041-E2）', () => {
  const ctx = mkCtx({}, { signi: [SIGNI, SIGNI_P3000, SIGNI_L2] });
  const result = executeEffect({ effectId: 't', effectType: 'AUTO', action: { type: 'REARRANGE_SIGNI', target: { type: 'SIGNI', owner: 'opponent', count: 'ALL' }, optional: true } as EffectAction, duration: 'INSTANT', mandatory: true } as CardEffect, ctx);
  ok(!result.done, 'REARRANGE_SIGNI で対話待ち');
  const pending = (result as { pending: { owner: string; signiNums: string[] } }).pending;
  eq(pending.owner, 'opponent', '相手場が対象');
  const reversed = [...pending.signiNums].reverse();
  const c: ExecCtx = { ...ctx, ownerState: result.ownerState, otherState: result.otherState, logs: result.logs };
  const r2 = resumeRearrangeSigni(reversed, pending as never, c);
  eq(JSON.stringify(tops(r2.otherState)), JSON.stringify(reversed), '新しい並び順が反映される');
});
test('applyContinuousBaseLevelOverride: CONTINUOUS SET_BASE_LEVELでcardMapのLevelを上書き（WX04-049・条件成立時のみ）', () => {
  const st = mkState({ signi: ['WX04-049', 'WD04-009', null] }); // WD04-009=空獣/地獣
  const overridden = applyContinuousBaseLevelOverride(cardMap as Map<string, CardData>, st, mkState({}), effectsMap, true);
  eq(overridden.get('WX04-049')?.Level, '2', '基本レベルが2に上書き');
  const noCond = mkState({ signi: ['WX04-049', null, null] });
  const notOverridden = applyContinuousBaseLevelOverride(cardMap as Map<string, CardData>, noCond, mkState({}), effectsMap, true);
  eq(notOverridden.get('WX04-049')?.Level, cardMap.get('WX04-049')?.Level, '条件不成立なら元のまま');
});
test('duration「次の対戦相手のターン終了時まで」= UNTIL_OPP_TURN_END（substring先取りバグの回帰ガード・続き148・タスク12(xxix)）', () => {
  // 「次の対戦相手のターン終了時まで」は「ターン終了時まで」を内包するため、汎用パーサの substring 一致が
  // 先に UNTIL_END_OF_TURN を返して潰していた。per-sentence 正規化（upgradeToOppTurnEnd）で昇格する。
  // 代表: POWER_MODIFY（duration未設定→付与）と GRANT_KEYWORD（値flip）。
  const findDur = (a: unknown, want: (x: { type?: string; duration?: string }) => boolean): boolean => {
    const n = a as { type?: string; duration?: string; steps?: unknown[]; then?: unknown; else?: unknown; choices?: { action?: unknown }[] };
    if (!n || typeof n !== 'object') return false;
    if (want(n)) return true;
    if (Array.isArray(n.steps) && n.steps.some(s => findDur(s, want))) return true;
    if (n.then && findDur(n.then, want)) return true;
    if (n.else && findDur(n.else, want)) return true;
    if (Array.isArray(n.choices) && n.choices.some(c => c.action && findDur(c.action, want))) return true;
    return false;
  };
  const pm = effectsMap.get('WX24-P2-060')!.find(e => e.effectId === 'WX24-P2-060-E2')!; // 【起】《ダウン》：次の対戦相手のターン終了時まで、パワー+4000
  ok(findDur(pm.action, n => n.type === 'POWER_MODIFY' && n.duration === 'UNTIL_OPP_TURN_END'), 'POWER_MODIFY に UNTIL_OPP_TURN_END が付く');
  const gk = effectsMap.get('WX24-P1-040')!.find(e => e.effectId === 'WX24-P1-040-E2')!; // 次の対戦相手のターン終了時まで、【シャドウ】を得る
  ok(findDur(gk.action, n => n.type === 'GRANT_KEYWORD' && n.duration === 'UNTIL_OPP_TURN_END'), 'GRANT_KEYWORD が UNTIL_OPP_TURN_END へ昇格');
  // 対称ガード：素の「ターン終了時まで」は UNTIL_END_OF_TURN のままで昇格しない（WXDi-CP02-051-E2 の REMOVE_ABILITIES）
  const mixed = effectsMap.get('WXDi-CP02-051')!.find(e => e.effectId === 'WXDi-CP02-051-E2')!;
  ok(findDur(mixed.action, n => n.type === 'POWER_MODIFY' && n.duration === 'UNTIL_OPP_TURN_END'), '同カードの opp文 POWER_MODIFY は昇格');
  const ra = (mixed.action as unknown as { steps: { type: string; then?: { type: string; until?: string } }[] }).steps
    .map(s => s.then).find(t => t?.type === 'REMOVE_ABILITIES');
  eq(ra?.until, 'UNTIL_END_OF_TURN', '素の「ターン終了時まで」由来 REMOVE_ABILITIES は昇格しない');
});

// §3 Opusタスク1＝引用付与の対象-コスト分離2文型（「<対象>を対象とし、<任意コスト>てもよい。そうした場合、
// (期間、)それは「【自】…」を得る」）。従来は S1 の対象節が脱落し S2 は引用内側が漏れ出して即時実行に平坦化
// （WX24-P2-018＝ルリグ自身へ即アサシン・WX25-P3-089＝内側 CHOOSE の即時実行）。GRANT_EFFECT.target へ対象を運ぶ。
test('parse 2文型引用付与（支払いコスト形・WX24-P2-018）→ OPTIONAL_COST + GRANT_EFFECT(龍獣) + 内側 OPPONENT_PAY_OPTIONAL', () => {
  const e = parseCardEffects({ CardNum: 'TEST-QG2A', Type: 'ルリグ', EffectText: '【自】：あなたのアタックフェイズ開始時、あなたの＜龍獣＞のシグニ１体を対象とし、《赤》を支払ってもよい。そうした場合、ターン終了時まで、それは「【自】：このシグニがアタックしたとき、対戦相手が《無》《無》《無》を支払わないかぎり、ターン終了時まで、このシグニは【アサシン】を得る。」を得る。' } as unknown as CardData)[0];
  const seq = e.action as unknown as { type: string; steps: { type: string; id?: string; then?: { type: string; target?: { owner: string; filter?: { story?: string } }; effect?: CardEffect } }[] };
  eq(seq.type, 'SEQUENCE', 'SEQUENCE');
  eq(seq.steps[0]?.id, 'OPTIONAL_COST', 'S1=OPTIONAL_COST（コスト温存）');
  const ge = seq.steps[1]?.then as { type: string; target?: { owner: string; filter?: { story?: string } }; effect?: CardEffect };
  eq(ge?.type, 'GRANT_EFFECT', 'S2=GRANT_EFFECT（従来は STUB GRANT_QUOTED_AUTO_ABILITY でルリグ自身へ即付与）');
  eq(ge?.target?.filter?.story, '龍獣', '対象節（S1）の＜龍獣＞filter が target へ運ばれる');
  eq(ge?.effect?.timing?.[0], 'ON_ATTACK_SIGNI', '内側【自】が CardEffect へ展開される');
  const inner = ge?.effect?.action as unknown as { type: string; steps: { type: string; id?: string; costColors?: string[] }[] };
  eq(inner?.steps?.[0]?.id, 'OPPONENT_PAY_OPTIONAL', '内側「支払わないかぎり」が OPPONENT_PAY_OPTIONAL ゲート化（従来は無言消費で無条件アサシン）');
  eq(inner?.steps?.[0]?.costColors?.length, 3, '《無》×3');
  eq(e.parseStatus, 'AUTO', 'AUTO のまま');
});
test('parse 2文型引用付与（ダウンコスト形・WX25-P3-089）→ 正準 DOWN self + GRANT_EFFECT(迷宮/excludeSelf)', () => {
  const e = parseCardEffects({ CardNum: 'TEST-QG2B', Type: 'シグニ', EffectText: '【自】：あなたのアタックフェイズ開始時、あなたの他の＜迷宮＞のシグニ１体を対象とし、アップ状態のこのシグニをダウンしてもよい。そうした場合、ターン終了時まで、それは「【自】：このシグニがアタックしたとき、カードを１枚引くか、対戦相手は手札を１枚捨てる。」を得る。' } as unknown as CardData)[0];
  const seq = e.action as unknown as { steps: { type: string; optional?: boolean; target?: { filter?: { thisCardOnly?: boolean; isUp?: boolean } }; then?: { type: string; target?: { filter?: { story?: string; excludeSelf?: boolean } }; effect?: CardEffect } }[] };
  eq(seq.steps[0]?.type, 'DOWN', 'S1=DOWN');
  eq(seq.steps[0]?.optional, true, 'DOWN は任意（コスト）');
  eq(seq.steps[0]?.target?.filter?.thisCardOnly, true, 'DOWN は自身（従来は対象＜迷宮＞シグニをダウンさせる誤コスト）');
  const ge = seq.steps[1]?.then as { type: string; target?: { filter?: { story?: string; excludeSelf?: boolean } }; effect?: CardEffect };
  eq(ge?.type, 'GRANT_EFFECT', 'S2=GRANT_EFFECT（従来は内側 DRAW の即時実行に平坦化）');
  eq(ge?.target?.filter?.story, '迷宮', '対象 filter 復元');
  eq(ge?.target?.filter?.excludeSelf, true, '「他の」＝excludeSelf');
  eq(ge?.effect?.action?.type, 'CHOOSE', '内側の CHOOSE（引くか捨てさせる）が展開される');
});
test('parse 2文型引用付与ガード＝内側が AUTO 展開不能（【常】アタックできない）は従来規則へ据置（WXDi-P06-047）', () => {
  const e = parseCardEffects({ CardNum: 'TEST-QG2C', Type: 'シグニ', EffectText: '【自】：対戦相手のアタックフェイズ開始時、対戦相手のシグニ１体を対象とし、このシグニを場からトラッシュに置いてもよい。そうした場合、ターン終了時まで、それは「【常】：アタックできない。」を得る。' } as unknown as CardData)[0];
  const s = JSON.stringify(e.action);
  ok(!s.includes('GRANT_EFFECT'), 'rawText 温存の no-op GRANT_EFFECT を作らない（従来の粗い即時 BLOCK_ACTION＝動く近似を維持）');
  eq(e.parseStatus, 'AUTO', 'AUTO のまま（PARTIAL 降格しない）');
});
// 「対戦相手が《…》を支払わないかぎり、X」単文ゲート（P1規則）
test('parse 「対戦相手が《無》《無》を支払わないかぎり、対戦相手は手札を２枚捨てる」→ OPPONENT_PAY_OPTIONAL ゲート（WX25-P1-057）', () => {
  const e = parseCardEffects({ CardNum: 'TEST-UNP', Type: 'シグニ', EffectText: '【自】：このシグニがアタックしたとき、対戦相手が《無》《無》を支払わないかぎり、対戦相手は手札を２枚捨てる。' } as unknown as CardData)[0];
  const seq = e.action as unknown as { type: string; steps: { type: string; id?: string; costColors?: string[]; then?: { type: string; target?: { owner: string; count: number } } }[] };
  eq(seq.type, 'SEQUENCE', 'SEQUENCE');
  eq(seq.steps[0]?.id, 'OPPONENT_PAY_OPTIONAL', 'ゲート化（従来は節が無言消費され無条件2枚捨て）');
  eq(seq.steps[0]?.costColors?.length, 2, '《無》×2');
  const then = seq.steps[1]?.then as { type: string; target?: { owner: string; count: number } };
  eq(then?.type, 'TRASH', 'then=TRASH');
  eq(then?.target?.owner, 'opponent', '捨てるのは対戦相手（主語温存）');
});
test('parse 「対戦相手は《無》を支払わないかぎり、手札を１枚捨てる」（は形＝主語分配）は既存専用規則へ据置（WXDi-P16-091）', () => {
  const e = parseCardEffects({ CardNum: 'TEST-UNP2', Type: 'シグニ', EffectText: '【出】：対戦相手は《無》を支払わないかぎり、手札を１枚捨てる。' } as unknown as CardData)[0];
  const s = JSON.stringify(e.action);
  ok(!s.includes('"owner":"self"') || !s.includes('HAND_CARD') || !s.includes('OPPONENT_PAY_OPTIONAL'), '「は」形で自分の手札捨てへ owner 反転しない');
});

// §3 Opusタスク12(xxvii) Cluster F＝回収対象の単点 filter 脱落。
test('parse トラッシュ回収の level 範囲は対象名詞句から復元（WD19-008 / WX18-082）', () => {
  const below = parseCardEffects({ CardNum: 'TEST-F-TRASH-LTE', Type: 'アーツ', EffectText: 'あなたのトラッシュからレベル３以下の黒のシグニ１枚を対象とし、それを手札に加える。' } as unknown as CardData)[0];
  const above = parseCardEffects({ CardNum: 'TEST-F-TRASH-GTE', Type: 'シグニ', EffectText: '【出】《黒》：あなたのトラッシュからレベル４以上の＜遊具＞のシグニ１枚を対象とし、それを手札に加える。' } as unknown as CardData)[0];
  const belowFilter = (below.action as unknown as { source: { filter?: { level?: { max?: number } } } }).source.filter;
  const aboveFilter = (above.action as unknown as { source: { filter?: { level?: { min?: number } } } }).source.filter;
  eq(belowFilter?.level?.max, 3, 'レベル3以下');
  eq(aboveFilter?.level?.min, 4, 'レベル4以上');
});
test('parse エナ回収の class filter は対象名詞句から復元（WXEX2-45-E2）', () => {
  const e = parseCardEffects({ CardNum: 'TEST-F-ENERGY-STORY', Type: 'シグニ', EffectText: '【自】《ターン１回》：このシグニがアタックしたとき、あなたのエナゾーンから＜遊具＞のシグニを２枚まで対象とし、それらを手札に加える。' } as unknown as CardData)[0];
  const source = (e.action as unknown as { source: { count: number; upToCount?: boolean; filter?: { cardType?: string; story?: string } } }).source;
  eq(source.count, 2, '2枚まで');
  eq(source.upToCount, true, '任意上限');
  eq(source.filter?.cardType, 'シグニ', 'シグニ限定');
  eq(source.filter?.story, '遊具', '＜遊具＞限定');
});

// ── Opusタスク12(xxxii)：味方シグニのトラッシュ／血晶武装を監視するルリグ watcher の scope/filter 脱落 ──
// ⚠ parser 規則の回帰を検出するため **parseCardEffects を直接叩く**（effectsMap＝JSON+MANUAL のスナップショットを
//   読むと、手修正テーブルで同じ値を書けばテストが通ってしまい parser 退行を見逃す）。
test('parse 味方シグニのトラッシュは any_ally＋filter＋fromZones＋自分メイン限定（Opusタスク12(xxxii)）', () => {
  const e = parseCardEffects(cardMap.get('WX24-P1-015')!).find(x => x.effectId === 'WX24-P1-015-E1')!;
  eq(e.timing?.[0], 'ON_TRASH', 'timing');
  eq(e.triggerScope, 'any_ally', 'scope＝あなたのシグニが対象（self に潰れるとルリグ watcher は絶対発火しない）');
  eq(e.triggerFilter?.levelRange?.max, 2, 'レベル2以下');
  eq(e.triggerFilter?.story, '悪魔', '＜悪魔＞限定');
  // 「場から」の出自限定を前置き剥がしで落とさない（落とすと手札/デッキからのトラッシュでも発火する）
  eq(e.triggerCondition?.fromZones?.includes('field'), true, 'fromZones=field を維持');
  // 「あなたのメインフェイズの間」＝DURING_PHASE 単独では相手のメインフェイズでも真になるため IS_MY_TURN と AND
  eq(e.condition?.type, 'AND', 'condition は AND');
  eq(e.condition?.conditions?.some(c => c.type === 'DURING_PHASE' && c.phases?.includes('MAIN')), true, 'DURING_PHASE:MAIN');
  eq(e.condition?.conditions?.some(c => c.type === 'IS_MY_TURN'), true, 'IS_MY_TURN（ターン所有者限定）');
});

test('parse 味方シグニの血晶武装は any_ally＋story filter（Opusタスク12(xxxii)）', () => {
  const e = parseCardEffects(cardMap.get('WDK08-L01')!).find(x => x.effectId === 'WDK08-L01-E1')!;
  eq(e.timing?.[0], 'ON_BLOOD_CRYSTAL_ARMOR', 'timing');
  eq(e.triggerScope, 'any_ally', 'scope');
  eq(e.triggerFilter?.story, '紅蓮', '＜紅蓮＞限定');
});

test('collectTrashTriggers: any_ally watcher は filter/ターン所有者/《ターン1回》を評価（Opusタスク12(xxxii)）', () => {
  // ルリグ watcher（「あなたのメインフェイズの間、あなたのレベル2以下の＜悪魔＞のシグニ1体が…トラッシュに置かれたとき」）。
  // ルリグはシグニとしてトラッシュされないため、scope が self に潰れていた間は**構造的に絶対発火しなかった**。
  const DEMON_L2 = findCard(c => isSigni(c) && (c.CardClass ?? '').includes('悪魔') && c.Level === '2');
  const DEMON_L4 = findCard(c => isSigni(c) && (c.CardClass ?? '').includes('悪魔') && c.Level === '4');
  const base = mkState({});
  const host = { ...base, field: { ...base.field, lrig: ['WX24-P1-015'] } } as PlayerState;
  const guest = mkState({});
  const fired = (r: { entries: { effectId: string }[] }) => r.entries.some(x => x.effectId === 'WX24-P1-015-E1');
  // 自分のメインフェイズに自分のレベル2＜悪魔＞がトラッシュ → 発火
  eq(fired(collectTrashTriggers(trigCtx(HOST), DEMON_L2, HOST, host, guest)), true, 'レベル2＜悪魔＞で発火');
  // triggerFilter＝レベル2以下。engine が filter 未評価だとレベル4でも過剰発火する
  eq(fired(collectTrashTriggers(trigCtx(HOST), DEMON_L4, HOST, host, guest)), false, 'レベル4は非発火');
  // 「あなたのメインフェイズの間」＝ターン所有者限定。DURING_PHASE 単独だと相手メインでも発火してしまう
  eq(fired(collectTrashTriggers(trigCtx(GUEST), DEMON_L2, HOST, host, guest)), false, '相手ターンは非発火');
  // 《ターン1回》＝actions_done に消費済みなら再収集しない
  const hostUsed = { ...host, actions_done: ['WX24-P1-015-E1'] } as PlayerState;
  eq(fired(collectTrashTriggers(trigCtx(HOST), DEMON_L2, HOST, hostUsed, guest)), false, '《ターン1回》消費済みは非発火');
  // 消費 effectId を返す（呼び出し元が actions_done へ書き戻す＝ON_BANISH と同型）
  eq(collectTrashTriggers(trigCtx(HOST), DEMON_L2, HOST, host, guest).usedHostIds.includes('WX24-P1-015-E1'), true, 'usedHostIds に消費を返す');
});

test('collectTrashTriggers: any_opp watcher の usageLimit は watcher 側 usedIds を消費する（Opusタスク12(xxxiii)）', () => {
  // 実在する ON_TRASH any_opp＋IS_MY_TURN（WX04-037-E2）に usageLimit だけを合成する。
  // watcher=guest／トラッシュされた側=host と反転させ、owner 側 usedIds へ誤記録する実装を検出する。
  const base = effectsMap.get('WX04-037')!.find(e => e.effectId === 'WX04-037-E2')!;
  const effectId = 'TEST-ON-TRASH-ANY-OPP-LIMIT';
  const synthetic = { ...base, effectId, usageLimit: 'once_per_turn' } as CardEffect;
  const syntheticEffects = new Map(effectsMap);
  syntheticEffects.set('WX04-037', [synthetic]);
  const ctx = { ...trigCtx(GUEST), effectsMap: syntheticEffects };
  const host = mkState({});
  const guest = mkState({ signi: ['WX04-037', null, null] });

  const r1 = collectTrashTriggers(ctx, SIGNI, HOST, host, guest);
  eq(has(r1.entries, effectId), true, 'watcher 自身のターンなら1回目は発火');
  eq(r1.usedHostIds.length, 0, 'トラッシュされた host 側は消費しない');
  eq(r1.usedGuestIds.includes(effectId), true, 'watcher の guest 側へ消費IDを返す');

  const guestUsed = { ...guest, actions_done: r1.usedGuestIds } as PlayerState;
  const r2 = collectTrashTriggers(ctx, SIGNI, HOST, host, guestUsed);
  eq(has(r2.entries, effectId), false, 'watcher 側 actions_done への書き戻し後は非発火');
});

test('parse ON_TRASH: exact phrase 15枚すべてに fromFieldByCostOrEffect を emit（Opusタスク12(xxxiv)）', () => {
  const cardNums = [
    'WXK07-039', 'WXK07-060', 'WXK07-061', 'WXK07-066', 'WXK07-067', 'WXK07-068',
    'WXDi-P01-071', 'WXDi-P01-087', 'WXDi-P03-055', 'WXDi-P06-052', 'WXDi-P08-078',
    'WX24-P1-015', 'WX24-P1-067', 'WX24-P1-079', 'WX24-P1-080',
  ];
  for (const cardNum of cardNums) {
    const e = parseCardEffects(cardMap.get(cardNum)!).find(x => x.timing?.includes('ON_TRASH'))!;
    eq(e.triggerCondition?.fromFieldByCostOrEffect, true, `${cardNum} の exact phrase 限定`);
  }
  // 「コストかあなたの効果によって」は相手効果を除く別条件。広いフラグへ誤って丸めない。
  const narrower = parseCardEffects(cardMap.get('WXDi-P02-037')!).find(x => x.effectId === 'WXDi-P02-037-E2')!;
  eq(narrower.triggerCondition?.fromFieldByCostOrEffect, undefined, 'より狭い別文型は対象外');
  eq(narrower.triggerCondition?.fromFieldByCostOrOwnEffect, true, 'コストか自分の効果の専用ゲート');
  eq(narrower.triggerScope, 'any_ally', 'あなたのシグニ1体を監視');
});

test('collectTrashTriggers: fromFieldByCostOrEffect は self と any_ally watcher の両経路をゲート（Opusタスク12(xxxiv)）', () => {
  const host = mkState({ signi: ['WXK07-066', null, null] });
  const guest = mkState({});
  const selfId = 'WX24-P1-067-E1';
  const allyId = 'WXK07-066-E1';

  eq(has(collectTrashTriggers(trigCtx(HOST), 'WX24-P1-067', HOST, host, guest, false, true).entries, selfId), true, 'self はコスト/効果起因で発火');
  eq(has(collectTrashTriggers(trigCtx(HOST), 'WX24-P1-067', HOST, host, guest, false, false).entries, selfId), false, 'self はルール処理起因で非発火');
  eq(has(collectTrashTriggers(trigCtx(HOST), 'WXK07-039', HOST, host, guest, false, true).entries, allyId), true, 'any_ally はコスト/効果起因で発火');
  eq(has(collectTrashTriggers(trigCtx(HOST), 'WXK07-039', HOST, host, guest, false, false).entries, allyId), false, 'any_ally はルール処理起因で非発火');
});

test('parse ON_TRASH: 「効果によって」4枚=byEffect／「あなたの効果によって」6枚=byOwnEffect（Opusタスク12(xxxv-a)）', () => {
  // 「効果によって」＝任意の効果起因（自他問わず）。相手効果でも発火する。
  const anyEffect = ['WX18-086', 'WX18-089', 'WX19-029', 'WD14-015'];
  // 「あなたの効果によって」＝自分の効果起因のみ（相手効果は除外）。
  const ownEffect = ['WX18-081', 'WX18-082', 'WX19-044', 'WX19-073', 'WXEX2-80', 'SP27-003'];
  for (const cardNum of anyEffect) {
    const e = parseCardEffects(cardMap.get(cardNum)!).find(x => x.timing?.includes('ON_TRASH'))!;
    eq(e.triggerCondition?.byEffect, true, `${cardNum} は任意効果起因`);
    eq(e.triggerCondition?.byOwnEffect, undefined, `${cardNum} を own-effect へ狭めない`);
    eq(e.triggerCondition?.fromFieldByCostOrEffect, undefined, `${cardNum} をコスト込みへ丸めない`);
  }
  for (const cardNum of ownEffect) {
    const e = parseCardEffects(cardMap.get(cardNum)!).find(x => x.timing?.includes('ON_TRASH'))!;
    eq(e.triggerCondition?.byOwnEffect, true, `${cardNum} は自分の効果限定`);
    eq(e.triggerCondition?.byEffect, undefined, `${cardNum} を任意効果へ広げない`);
    eq(e.triggerCondition?.fromFieldByCostOrEffect, undefined, `${cardNum} をコスト込みへ丸めない`);
  }
  // 語順違い「あなたの効果によってこのシグニが場から」も own-effect 限定（WX19-073）。
  const reordered = parseCardEffects(cardMap.get('WX19-073')!).find(x => x.effectId === 'WX19-073-E1')!;
  eq(reordered.triggerCondition?.byOwnEffect, true, '語順違いも own-effect で捕捉');
});

test('collectTrashTriggers: byEffect は self/any_ally ともルール処理を除外（Opusタスク12(xxxv-a)）', () => {
  const selfBase = effectsMap.get('WX24-P1-067')!.find(e => e.effectId === 'WX24-P1-067-E1')!;
  const allyBase = effectsMap.get('WXK07-066')!.find(e => e.effectId === 'WXK07-066-E1')!;
  const selfId = 'TEST-ON-TRASH-BY-EFFECT-SELF';
  const allyId = 'TEST-ON-TRASH-BY-EFFECT-ALLY';
  const syntheticEffects = new Map(effectsMap);
  syntheticEffects.set('WX24-P1-067', [{
    ...selfBase,
    effectId: selfId,
    triggerScope: 'self',
    triggerCondition: { fromZones: ['field'], byEffect: true },
  }]);
  syntheticEffects.set('WXK07-066', [{
    ...allyBase,
    effectId: allyId,
    triggerScope: 'any_ally',
    triggerCondition: { fromZones: ['field'], byEffect: true },
  }]);
  const ctx = { ...trigCtx(HOST), effectsMap: syntheticEffects };
  const host = mkState({ signi: ['WXK07-066', null, null] });
  const guest = mkState({});

  eq(has(collectTrashTriggers(ctx, 'WX24-P1-067', HOST, host, guest, false, true, true).entries, selfId), true, 'self は効果起因で発火');
  eq(has(collectTrashTriggers(ctx, 'WX24-P1-067', HOST, host, guest, false, true, false).entries, selfId), false, 'self はコスト起因で非発火');
  eq(has(collectTrashTriggers(ctx, 'WX24-P1-067', HOST, host, guest, false, false, false).entries, selfId), false, 'self はバトル/ルール処理で非発火');
  eq(has(collectTrashTriggers(ctx, 'WXK07-039', HOST, host, guest, false, true, true).entries, allyId), true, 'any_ally は効果起因で発火');
  eq(has(collectTrashTriggers(ctx, 'WXK07-039', HOST, host, guest, false, true, false).entries, allyId), false, 'any_ally はコスト起因で非発火');
  eq(has(collectTrashTriggers(ctx, 'WXK07-039', HOST, host, guest, false, false, false).entries, allyId), false, 'any_ally はバトル/ルール処理で非発火');
});

test('collectTrashTriggers: byOwnEffect は自分の効果のみ（相手効果/コスト/ルール処理を除外）（Opusタスク12(xxxv-a)）', () => {
  const selfBase = effectsMap.get('WX24-P1-067')!.find(e => e.effectId === 'WX24-P1-067-E1')!;
  const allyBase = effectsMap.get('WXK07-066')!.find(e => e.effectId === 'WXK07-066-E1')!;
  const selfId = 'TEST-ON-TRASH-BY-OWN-EFFECT-SELF';
  const allyId = 'TEST-ON-TRASH-BY-OWN-EFFECT-ALLY';
  const syntheticEffects = new Map(effectsMap);
  syntheticEffects.set('WX24-P1-067', [{
    ...selfBase, effectId: selfId, triggerScope: 'self',
    triggerCondition: { fromZones: ['field'], byOwnEffect: true },
  }]);
  syntheticEffects.set('WXK07-066', [{
    ...allyBase, effectId: allyId, triggerScope: 'any_ally',
    triggerCondition: { fromZones: ['field'], byOwnEffect: true },
  }]);
  const ctx = { ...trigCtx(HOST), effectsMap: syntheticEffects };
  const host = mkState({ signi: ['WXK07-066', null, null] });
  const guest = mkState({});
  // 引数: (…, causeByOpponent, byCostOrEffect, byEffectCause)
  eq(has(collectTrashTriggers(ctx, 'WX24-P1-067', HOST, host, guest, false, true, true).entries, selfId), true, 'self は自分の効果起因で発火');
  eq(has(collectTrashTriggers(ctx, 'WX24-P1-067', HOST, host, guest, true, true, true).entries, selfId), false, 'self は相手効果起因で非発火');
  eq(has(collectTrashTriggers(ctx, 'WX24-P1-067', HOST, host, guest, false, true, false).entries, selfId), false, 'self はコスト起因で非発火');
  eq(has(collectTrashTriggers(ctx, 'WX24-P1-067', HOST, host, guest, false, false, false).entries, selfId), false, 'self はバトル/ルール処理で非発火');
  eq(has(collectTrashTriggers(ctx, 'WXK07-039', HOST, host, guest, false, true, true).entries, allyId), true, 'any_ally は自分の効果起因で発火');
  eq(has(collectTrashTriggers(ctx, 'WXK07-039', HOST, host, guest, true, true, true).entries, allyId), false, 'any_ally は相手効果起因で非発火');
});

test('effectExecutor: field→trash のコストだけを原因シグナルへ記録（Opusタスク12(xxxv-a)）', () => {
  const owner = mkState({ signi: [SIGNI, null, null] });
  const other = mkState({});
  const makeEffect = (asCost: boolean): CardEffect => ({
    effectId: `TEST-FIELD-TRASH-${asCost ? 'COST' : 'EFFECT'}`,
    effectType: 'AUTO',
    timing: ['ON_PLAY'],
    mandatory: true,
    action: {
      type: 'SEQUENCE',
      steps: [{
        type: 'TRASH',
        target: { type: 'SIGNI', owner: 'self', count: 'ALL' },
        ...(asCost ? { asCost: true } : {}),
      }],
    },
    parseStatus: 'AUTO',
  });
  const exec = (asCost: boolean) => executeEffect(makeEffect(asCost), {
    ownerState: owner, otherState: other, cardMap, logs: [], sourceCardNum: SIGNI,
  });
  const costResult = exec(true);
  const effectResult = exec(false);
  eq(costResult.done, true, 'コストTRASH完了');
  eq(effectResult.done, true, '効果TRASH完了');
  if (!costResult.done || !effectResult.done) throw new Error('unexpected pending');
  eq(costResult.fieldTrashCostCards?.includes(SIGNI), true, 'コストだけinstanceIdを記録');
  eq(effectResult.fieldTrashCostCards, undefined, '通常効果はコスト扱いしない');
});

test('collectTrashTriggers: コストか自分の効果限定は相手効果/ルール処理を除外（Opusタスク12(xxxv-b)）', () => {
  const base = effectsMap.get('WXDi-P02-037')!.find(e => e.effectId === 'WXDi-P02-037-E2')!;
  const effectId = 'TEST-ON-TRASH-COST-OR-OWN-EFFECT';
  const synthetic = {
    ...base,
    effectId,
    triggerScope: 'any_ally',
    triggerCondition: { fromZones: ['field'], fromFieldByCostOrOwnEffect: true },
  } as CardEffect;
  const syntheticEffects = new Map(effectsMap);
  syntheticEffects.set('WXDi-P02-037', [synthetic]);
  const ctx = { ...trigCtx(HOST), effectsMap: syntheticEffects };
  const host = mkState({ signi: ['WXDi-P02-037', null, null] });
  const guest = mkState({});

  eq(has(collectTrashTriggers(ctx, SIGNI, HOST, host, guest, false, true, false).entries, effectId), true, 'コスト起因で発火');
  eq(has(collectTrashTriggers(ctx, SIGNI, HOST, host, guest, false, true, true).entries, effectId), true, '自分の効果起因で発火');
  eq(has(collectTrashTriggers(ctx, SIGNI, HOST, host, guest, true, true, true).entries, effectId), false, '相手効果起因で非発火');
  eq(has(collectTrashTriggers(ctx, SIGNI, HOST, host, guest, false, false, false).entries, effectId), false, 'バトル/ルール処理で非発火');
});

test('collectTrashTriggers: any_opp watcher は triggerFilter/excludeSelf を評価（Opusタスク12(xxxv-d)）', () => {
  const base = effectsMap.get('WX04-037')!.find(e => e.effectId === 'WX04-037-E2')!;
  const filterId = 'TEST-ON-TRASH-ANY-OPP-FILTER';
  const excludeId = 'TEST-ON-TRASH-ANY-OPP-EXCLUDE-SELF';
  const AKUMA = findCard(c => isSigni(c) && (c.CardClass ?? '').includes('悪魔'));
  const NON_AKUMA_TRASH = findCard(c => isSigni(c) && !(c.CardClass ?? '').includes('悪魔'));
  const host = mkState({});
  const guest = mkState({ signi: ['WX04-037', null, null] });

  const filterEffects = new Map(effectsMap);
  filterEffects.set('WX04-037', [{ ...base, effectId: filterId, triggerFilter: { story: '悪魔' } }]);
  const filterCtx = { ...trigCtx(GUEST), effectsMap: filterEffects };
  eq(has(collectTrashTriggers(filterCtx, AKUMA, HOST, host, guest).entries, filterId), true, '一致filterは発火');
  eq(has(collectTrashTriggers(filterCtx, NON_AKUMA_TRASH, HOST, host, guest).entries, filterId), false, '不一致filterは非発火');

  const excludeEffects = new Map(effectsMap);
  excludeEffects.set('WX04-037', [{ ...base, effectId: excludeId, triggerFilter: { excludeSelf: true } }]);
  const excludeCtx = { ...trigCtx(GUEST), effectsMap: excludeEffects };
  eq(has(collectTrashTriggers(excludeCtx, 'WX04-037', HOST, host, guest).entries, excludeId), false, 'excludeSelfは同一instanceを除外');
});

test('collectArmorTriggers: any_ally watcher は story filter を評価（Opusタスク12(xxxii)）', () => {
  const GUREN = findCard(c => isSigni(c) && (c.CardClass ?? '').includes('紅蓮'));
  const OTHER = findCard(c => isSigni(c) && !(c.CardClass ?? '').includes('紅蓮'));
  const base = mkState({});
  const host = { ...base, field: { ...base.field, lrig: ['WDK08-L01'] } } as PlayerState;
  const guest = mkState({});
  const fired = (n: string) => collectArmorTriggers(trigCtx(HOST), n, HOST, host, guest).entries.some(x => x.effectId === 'WDK08-L01-E1');
  eq(fired(GUREN), true, '＜紅蓮＞の血晶武装で発火（従来は self に潰れてルリグでは絶対発火しなかった）');
  eq(fired(OTHER), false, '＜紅蓮＞以外は非発火（engine が filter 未評価だと過剰発火する）');
});

// ── semantic audit Tier 1（続き168）：条件ゲート4件 ──
test('PR-K073-E1: レベル2/3/4の場条件がCHOOSE全体をANDゲートし、検索は同名以外', () => {
  const e = parseCardEffects(cardMap.get('PR-K073')!)[0];
  const condition = e.condition as unknown as { type: string; conditions: { type: string; filter?: { level?: number } }[] };
  const choose = e.action as unknown as { type: string; choices: { action: { filter?: { cardName?: string; excludeCardName?: string } } }[] };
  eq(condition.type, 'AND', '3条件はAND');
  eq(JSON.stringify(condition.conditions.map(c => c.filter?.level)), JSON.stringify([2, 3, 4]), 'level 2/3/4');
  eq(choose.type, 'CHOOSE', 'conditionがCHOOSE全体をゲート');
  const searchFilter = choose.choices[1]?.action.filter;
  eq(searchFilter?.excludeCardName, 'コードＶＬ　花畑チャイカ', '同名カードを除外');
  eq(searchFilter?.cardName, undefined, '包含filterへ反転しない');
});

test('WXDi-P03-001-E1: 青LRIG使用条件をparserがemitし、evalUseConditionがプレイ可否をゲート', () => {
  const e = parseCardEffects(cardMap.get('WXDi-P03-001')!)[0];
  eq(e.condition?.type, 'LRIG_COLOR', 'condition=LRIG_COLOR');
  const condition = e.condition!;
  const blueLrig = findCard(c => c.Type === 'ルリグ' && c.Color?.includes('青'));
  const redLrig = findCard(c => c.Type === 'ルリグ' && c.Color?.includes('赤') && !c.Color?.includes('青'));
  const blue = mkState({}); blue.field.lrig = [blueLrig];
  const red = mkState({}); red.field.lrig = [redLrig];
  ok(evalUseCondition(condition, blue, mkState({}), cardMap, 'WXDi-P03-001', 'MAIN'), '青LRIGなら使用可');
  ok(!evalUseCondition(condition, red, mkState({}), cardMap, 'WXDi-P03-001', 'MAIN'), '青でなければ使用不可');
  ok(JSON.stringify(e.action).includes('次のあなたのターン終了時、手札を２枚捨てる'), '遅延効果UNKNOWNは温存');
});

test('WDK13-008-E1: 選択肢2だけが相手key_piece条件付きで、HAS_CARD_IN_FIELDがキーを走査', () => {
  const e = parseCardEffects(cardMap.get('WDK13-008')!)[0];
  const choose = e.action as unknown as { choices: { action: EffectAction }[] };
  eq(choose.choices[0]?.action.type, 'TRANSFER_TO_HAND', '選択肢1は無条件のまま');
  const gated = choose.choices[1]?.action as unknown as { type: string; condition: import('../src/types/effects').Condition; then: EffectAction };
  eq(gated.type, 'CONDITIONAL', '選択肢2のみ条件付き');
  eq(gated.condition.type, 'HAS_CARD_IN_FIELD', 'HAS_CARD_IN_FIELD');
  const key = findCard(c => c.Type === 'キー');
  const ctx = mkCtx({}, {});
  ok(!evalCondition(gated.condition, ctx), 'キーなしはfalse');
  ctx.otherState.field.key_piece = key;
  ok(evalCondition(gated.condition, ctx), '相手key_pieceにキーがあればtrue');
});

test('WXEX1-35-E1: ライズアイコン持ち3体条件を外側activeConditionへ付与し、内側countは維持', () => {
  const e = parseCardEffects(cardMap.get('WXEX1-35')!)[0];
  const cond = e.activeCondition!;
  eq(cond.type, 'HAS_CARD_IN_FIELD', '外側activeCondition');
  const rise = [...cardMap.values()].filter(c => c.Type === 'シグニ' && c.EffectText?.includes('【ライズ】')).slice(0, 3).map(c => c.CardNum);
  eq(rise.length, 3, 'テスト用ライズ3体');
  const two = mkState({ signi: [rise[0], rise[1], null] });
  const three = mkState({ signi: [rise[0], rise[1], rise[2]] });
  ok(!checkActiveCondition(cond, two, mkState({}), true, cardMap, 'WXEX1-35'), 'ライズ2体では無効');
  ok(checkActiveCondition(cond, three, mkState({}), true, cardMap, 'WXEX1-35'), 'ライズ3体で有効');
  const innerCount = (e.action as unknown as { abilities: { action: { target: { count: number | string } } }[] }).abilities[0]?.action.target.count;
  eq(innerCount, 'ALL', '既存の内側count:ALLは変更しない');
});

// タスク12(viii): WDK16-13/WXK08-033 のデッキトップ公開→2分岐条件配置。第2分岐が登録者数条件で正しくゲートされること。
test('parse WDK16-13【出】→ 第2分岐 AND[SUBSCRIBER_COUNT, LAST_PROCESSED_MATCHES]・両分岐 optional（タスク12(viii)）', () => {
  const effs = parseCardEffects(cardMap.get('WDK16-13')!);
  const seq = effs.find(e => e.effectId === 'WDK16-13-E1')?.action as unknown as { type: string; steps: Array<{ type: string; condition?: { type: string; conditions?: { type: string }[] }; then?: { optional?: boolean } }> };
  eq(seq.type, 'SEQUENCE', 'SEQUENCE');
  eq(seq.steps[1].condition?.type, 'LAST_PROCESSED_MATCHES', '第1分岐=LAST_PROCESSED_MATCHES（level≤2＜電機＞）');
  eq(seq.steps[1].then?.optional, true, '第1分岐 ADD_TO_FIELD optional（場に出してもよい）');
  eq(seq.steps[2].condition?.type, 'AND', '第2分岐=AND');
  eq(seq.steps[2].condition?.conditions?.[0].type, 'SUBSCRIBER_COUNT', 'AND[0]=SUBSCRIBER_COUNT（登録者数100万）');
  eq(seq.steps[2].condition?.conditions?.[1].type, 'LAST_PROCESSED_MATCHES', 'AND[1]=LAST_PROCESSED_MATCHES（公開シグニ）');
  eq(seq.steps[2].then?.optional, true, '第2分岐 ADD_TO_FIELD optional');
});
test('evalCondition AND[SUBSCRIBER_COUNT≥100, LAST_PROCESSED_MATCHES{シグニ}]: 両成立でのみ true（タスク12(viii)）', () => {
  const signiCard = findCard(c => isSigni(c));
  const cond = { type: 'AND', conditions: [
    { type: 'SUBSCRIBER_COUNT', operator: 'gte', value: 100 },
    { type: 'LAST_PROCESSED_MATCHES', filter: { cardType: 'シグニ' } },
  ] };
  const mk = (sub: number, lp: string[]) => {
    const c = { ...mkCtx({}, {}), lastProcessedCards: lp } as unknown as ExecCtx;
    (c.ownerState as unknown as { subscriber_count?: number }).subscriber_count = sub;
    return c;
  };
  ok(evalCondition(cond as never, mk(100, [signiCard])), '登録者数100万+シグニ公開で true');
  ok(!evalCondition(cond as never, mk(50, [signiCard])), '登録者数不足で false');
  ok(!evalCondition(cond as never, mk(100, [])), '公開カードなしで false');
});

// タスク12(viii) end-to-end: WDK16-13【出】を実盤面で駆動（run は CHOOSE で place を選ぶ＝置ける限り置く）。
// 第1分岐（level≤2＜電機＞）・第2分岐（登録者数100万+シグニ）の条件で置く/置かないが分岐すること。
test('e2e WDK16-13: level2＜電機＞は第1分岐で場に出る（登録者数0でも）', () => {
  const eff = parseCardEffects(cardMap.get('WDK16-13')!).find(e => e.effectId === 'WDK16-13-E1')!;
  const ctx = mkCtx({ signi: [null, null, null], deckTop: ['WD03-012'] }, {}); // WD03-012=level2 電機
  const r = run(eff.action as EffectAction, ctx);
  ok(tops(r.ownerState).includes('WD03-012'), 'level2＜電機＞シグニが場に出る');
});
test('e2e WDK16-13: level3非電機は登録者数100万達成時のみ第2分岐で場に出る', () => {
  const eff = parseCardEffects(cardMap.get('WDK16-13')!).find(e => e.effectId === 'WDK16-13-E1')!;
  const mkTop = (sub: number) => {
    const c = mkCtx({ signi: [null, null, null], deckTop: ['WD01-010'] }, {}); // WD01-010=level3 非電機シグニ
    (c.ownerState as unknown as { subscriber_count?: number }).subscriber_count = sub;
    return c;
  };
  ok(tops(run(eff.action as EffectAction, mkTop(100)).ownerState).includes('WD01-010'), '登録者数100万で場に出る（第2分岐）');
  ok(!tops(run(eff.action as EffectAction, mkTop(50)).ownerState).includes('WD01-010'), '登録者数不足なら場に出ない（両分岐false）');
});

// タスク12(viii)残 WX26-CP1-048: 出自条件機構（＜プリオケ＞のシグニの効果で場に出た場合）。
test('e2e WX26-CP1-048: 効果配置の出自記録＋THIS_CARD_PLACED_BY_CLASS 判定', () => {
  const prioke = 'WX26-CP1-045'; // 奏像：プリオケ（シグニ）
  const placed = 'WD01-009';     // 非プリオケのシグニ（配置される側）
  const ctx = mkCtx({ signi: [null, null, null], deckTop: [placed] }, {}, prioke); // sourceCardNum=プリオケ
  const r = run({ type: 'ADD_TO_FIELD', owner: 'self' } as EffectAction, ctx);
  eq(r.ownerState.signi_placed_by_source?.[placed], prioke, '配置元プリオケを signi_placed_by_source に記録');
  const evalCtx = { ...ctx, ownerState: r.ownerState, sourceCardNum: placed } as ExecCtx;
  ok(evalCondition({ type: 'THIS_CARD_PLACED_BY_CLASS', cardClass: 'プリオケ' } as never, evalCtx), 'プリオケの効果で場に出たので true');
  ok(!evalCondition({ type: 'THIS_CARD_PLACED_BY_CLASS', cardClass: '電機' } as never, evalCtx), '別クラス（電機）では false');
  // 通常召喚（sourceCardNum 無し）は記録しない＝出自条件は false
  const r2 = run({ type: 'ADD_TO_FIELD', owner: 'self' } as EffectAction, mkCtx({ signi: [null, null, null], deckTop: [placed] }, {}));
  ok(!r2.ownerState.signi_placed_by_source?.[placed], '通常召喚（source無し）は記録しない');
});
test('LAST_PROCESSED_SHARES_COLOR_WITH_LRIG: lastProcessed が指定 owner のセンタールリグと共通色でのみ true', () => {
  const redCard = 'WD02-009'; // 赤シグニ
  const redLrig = 'WD02-001'; // 赤ルリグ
  const whiteLrig = findCard(c => c.Type === 'ルリグ' && (cardMap.get(c.CardNum)?.Color ?? '') === '白');
  const mk = (lrig: string) => {
    const c = { ...mkCtx({}, {}), lastProcessedCards: [redCard] } as ExecCtx;
    (c.otherState.field as { lrig: string[] }).lrig = [lrig];
    return c;
  };
  ok(evalCondition({ type: 'LAST_PROCESSED_SHARES_COLOR_WITH_LRIG', owner: 'opponent' } as never, mk(redLrig)), '赤カード×赤ルリグで共通色 true');
  ok(!evalCondition({ type: 'LAST_PROCESSED_SHARES_COLOR_WITH_LRIG', owner: 'opponent' } as never, mk(whiteLrig)), '赤カード×白ルリグで共通色なし false');
});

// checkActiveCondition の FRONT_SIGNI_POWER: 効果元シグニの正面（相手ゾーン 2-zi）のシグニの実効パワーで判定（SP27-002-E3・タスク12(i)）
// ※ fresh() でカーソルを進めると後続テストの払い出しがずれるため、必ずファイル末尾に置く。
test('checkActiveCondition FRONT_SIGNI_POWER: 正面パワー閾値以上でのみ true（正面空は false）', () => {
  const cond = { type: 'FRONT_SIGNI_POWER', operator: 'gte', value: 15000 } as unknown as import('../src/types/effects').ActiveCondition;
  const src = fresh();
  const front = fresh();
  const me = mkState({ signi: [null, src, null] });  // 効果元は index1
  const op = mkState({ signi: [null, front, null] }); // 正面 = 相手 index 2-1 = 1
  const powHi = new Map<string, number>([[front, 15000]]);
  const powLo = new Map<string, number>([[front, 12000]]);
  eq(checkActiveCondition(cond, me, op, true, cardMap as Map<string, CardData>, src, powHi), true, '正面15000で true');
  eq(checkActiveCondition(cond, me, op, true, cardMap as Map<string, CardData>, src, powLo), false, '正面12000で false');
  const opEmpty = mkState({ signi: [null, null, null] });
  eq(checkActiveCondition(cond, me, opEmpty, true, cardMap as Map<string, CardData>, src, powHi), false, '正面が空なら false');
});

// ── レポート ──
console.log('\n===== goldenTest 結果 =====');
console.log(`PASS ${pass} / FAIL ${fails.length}  (計 ${pass + fails.length})`);
if (fails.length) { console.log('\n--- FAIL ---'); fails.forEach(f => console.log('  ✗ ' + f)); process.exit(1); }
else console.log('✓ 全構文ゴールデン通過');
