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
import type { CardEffect, EffectAction } from '../src/types/effects';
import { initStack, confirmTurnOrder, pushToStack, shiftQueue, isStackDone } from '../src/engine/effectStack';
import { mergeManualEffects } from '../src/data/manualEffects';
import { collectGrowCostReductions, calcFieldPowers } from '../src/engine/effectEngine';
import {
  executeEffect,
  resumeSelectTarget, resumeSearch, resumeChoose,
  resumeLookAndReorder, resumeSelectZone, resumeSelectVirusZone, resumeSelectSigniZone,
  type ExecCtx, type ExecResult,
} from '../src/engine/effectExecutor';
import { collectTargetedTriggers, collectLrigGrowTriggers, collectCoinPaidTriggers, collectPowerZeroTriggers, collectArmorTriggers, collectDeckTrashSelfTriggers, collectAnyZoneTrashSelfTriggers, collectTrashTriggers, collectBanishTriggers, collectLeaveFieldTriggers, collectDrawTriggers, collectOppDrawTriggers, collectMillTriggers, collectCharmToTrashTriggers, collectEnergyToTrashTriggers, collectRefreshTriggers, collectPowerDecreaseTriggers, collectMoveToDeckTriggers, collectFreezeTriggers, collectSelfEventTriggers, collectZoneMovedTriggers, collectDriveBecameTriggers, collectBeatBecameTriggers, collectHandDiscardTriggers, collectOppArtsUseTriggers, collectArtsUseTriggers, collectFieldTriggers, collectBloomTriggers, collectTurnTriggers, collectAllyPlayOrOppDiscardTriggers, collectMaterialUsedByPlayerTriggers, collectMaterialUsedOnSigniTriggers, collectBanishOppByEffectTriggers, collectLrigUnderMovedTriggers, collectDeckShuffledTriggers, collectKeywordGainedTriggers, type TrigCtx } from '../src/engine/triggerCollect';
import { countLrigUnderMoved, detectDeckShuffled, detectKeywordGained } from '../src/engine/boardDiff';
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
test('collectGrowCostReductions: 場のCONT GROW_COST_REDUCTIONを色別集計', () => {
  // WX10-010-E1 = CONTINUOUS GROW_COST_REDUCTION reduction:[赤1,白1]
  const st = mkState({ signi: ['WX10-010', null, null] });
  const red = collectGrowCostReductions(st, mkState({}), true, effectsMap, cardMap as Map<string, CardData>);
  const byColor = Object.fromEntries(red.map(r => [r.color, r.count]));
  eq(byColor['赤'], 1, '赤-1');
  eq(byColor['白'], 1, '白-1');
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

test('C1 ON_TARGETED: self-scope 対象シグニ自身が発火（相手ターン）', () => {
  const host = mkState({}); const guest = mkState({ signi: ['WXDi-P11-040', null, null] });
  // host のターン中に guest のシグニが対象に取られた＝guest 視点で相手ターン（turnOwner:opponent 成立）
  const e = collectTargetedTriggers(trigCtx(HOST), ['WXDi-P11-040'], GUEST, host, guest);
  eq(e.length, 1, 'entries'); eq(e[0].effectId, 'WXDi-P11-040-E2', 'effectId'); eq(e[0].playerId, GUEST, 'player');
});
test('C1 ON_TARGETED: turnOwner:opponent ゲート（自ターンは非発火）', () => {
  const host = mkState({}); const guest = mkState({ signi: ['WXDi-P11-040', null, null] });
  // guest 自身のターンでは turnOwner:opponent を満たさず非発火
  eq(collectTargetedTriggers(trigCtx(GUEST), ['WXDi-P11-040'], GUEST, host, guest).length, 0, '自ターン非発火');
});
test('C1 ON_TARGETED: 対象でないシグニは非発火', () => {
  const host = mkState({}); const guest = mkState({ signi: ['WXDi-P11-040', null, null] });
  eq(collectTargetedTriggers(trigCtx(HOST), [SIGNI], GUEST, host, guest).length, 0, '別カード対象');
});
test('C1 ON_LRIG_GROW: any_opp 相手グロウで発火', () => {
  const host = mkState({}); const guest = mkState({ signi: ['WXDi-P13-047', null, null] });
  // grownOwner=HOST（host がグロウ）→ guest の any_opp が反応
  const e = collectLrigGrowTriggers(trigCtx(HOST), HOST, host, guest);
  eq(e.length, 1, 'entries'); eq(e[0].effectId, 'WXDi-P13-047-E2', 'effectId'); eq(e[0].playerId, GUEST, 'player');
});
test('C1 ON_LRIG_GROW: any_opp は自分グロウでは非発火', () => {
  const host = mkState({}); const guest = mkState({ signi: ['WXDi-P13-047', null, null] });
  // grownOwner=GUEST（guest 自身がグロウ）→ any_opp は反応しない
  eq(collectLrigGrowTriggers(trigCtx(GUEST), GUEST, guest, host).length, 0, '自グロウ非発火');
});
test('C1 ON_COIN_PAID: self 支払者の場シグニが発火', () => {
  const host = mkState({ signi: ['WXDi-P15-055', null, null] }); const guest = mkState({});
  const e = collectCoinPaidTriggers(trigCtx(HOST), HOST, host, guest);
  eq(e.length, 1, 'entries'); eq(e[0].effectId, 'WXDi-P15-055-E1', 'effectId'); eq(e[0].playerId, HOST, 'player');
});
test('C1 ON_COIN_PAID: usageLimit once_per_turn（消化済みは非発火）', () => {
  const host = mkState({ signi: ['WXDi-P15-055', null, null] }); const guest = mkState({});
  host.actions_done = ['WXDi-P15-055-E1']; // このターン既に発動済み
  eq(collectCoinPaidTriggers(trigCtx(HOST), HOST, host, guest).length, 0, 'once_per_turn');
});

// Stage2②: ON_SIGNI_POWER_ZERO_OR_LESS（既存配線・R37・C2リスト5枚）の collectPowerZeroTriggers を pure 化→自動検証。
test('Stage2 ON_SIGNI_POWER_ZERO_OR_LESS: any_opp 相手0化で発火', () => {
  const host = mkState({ signi: ['WX20-Re03', null, null] }); const guest = mkState({ signi: [SIGNI, null, null] });
  const e = collectPowerZeroTriggers(trigCtx(HOST), SIGNI, GUEST, host, guest); // guest のシグニが0化
  eq(e.length, 1, 'entries'); eq(e[0].effectId, 'WX20-Re03-E1', 'effectId'); eq(e[0].playerId, HOST, 'player');
});
test('Stage2 ON_SIGNI_POWER_ZERO_OR_LESS: any_opp は自分0化で非発火', () => {
  const host = mkState({ signi: ['WX20-Re03', null, null] }); const guest = mkState({});
  eq(collectPowerZeroTriggers(trigCtx(HOST), SIGNI, HOST, host, guest).length, 0, '自0化非発火');
});
test('Stage2 ON_SIGNI_POWER_ZERO_OR_LESS: once_per_turn 消化済み非発火', () => {
  const host = mkState({ signi: ['WX20-Re03', null, null] }); host.actions_done = ['WX20-Re03-E1'];
  const guest = mkState({ signi: [SIGNI, null, null] });
  eq(collectPowerZeroTriggers(trigCtx(HOST), SIGNI, GUEST, host, guest).length, 0, 'once_per_turn');
});

// Stage2③: ON_BLOOD_CRYSTAL_ARMOR（血晶武装したとき・自分の場のみ走査）の collectArmorTriggers を pure 化→自動検証。
test('Stage2 ON_BLOOD_CRYSTAL_ARMOR: self-scope 武装シグニ自身が発火', () => {
  const host = mkState({ signi: ['WXK05-023', null, null] }); const guest = mkState({});
  const e = collectArmorTriggers(trigCtx(HOST), 'WXK05-023', HOST, host, guest);
  eq(e.length, 1, 'entries'); eq(e[0].effectId, 'WXK05-023-E1', 'effectId'); eq(e[0].playerId, HOST, 'player');
});
test('Stage2 ON_BLOOD_CRYSTAL_ARMOR: armor 無しカードは非発火', () => {
  const host = mkState({ signi: [SIGNI, null, null] }); const guest = mkState({});
  eq(collectArmorTriggers(trigCtx(HOST), SIGNI, HOST, host, guest).length, 0, 'non-armor');
});

// Stage2④: ON_TRASH ファミリ（collectTrashTriggers/collectDeckTrashSelfTriggers/collectAnyZoneTrashSelfTriggers）を pure 化→自動検証。
const has = (e: { effectId: string }[], id: string) => e.some(x => x.effectId === id);
test('Stage2 ON_TRASH: 場からトラッシュで self トリガー発火（WXDi-P09-043-E2）', () => {
  const host = mkState({}); const guest = mkState({});
  const e = collectTrashTriggers(trigCtx(HOST), 'WXDi-P09-043', HOST, host, guest);
  eq(has(e, 'WXDi-P09-043-E2'), true, 'self発火');
});
test('Stage2 ON_TRASH: any_opp + IS_MY_TURN ゲート（WX04-037-E2）', () => {
  // 相手(GUEST)のシグニがトラッシュ→watcher=HOST の WX04-037 が「自分のターンの間」のみ発火
  const host = mkState({ signi: ['WX04-037', null, null] }); const guest = mkState({});
  eq(has(collectTrashTriggers(trigCtx(HOST), SIGNI, GUEST, host, guest), 'WX04-037-E2'), true, '自ターン発火');
  eq(has(collectTrashTriggers(trigCtx(GUEST), SIGNI, GUEST, host, guest), 'WX04-037-E2'), false, '相手ターン非発火');
});
test('Stage2 ON_TRASH: fromZones=[deck] は場からでは非発火・デッキからのみ発火（WX02-073-E1）', () => {
  const host = mkState({}); const guest = mkState({});
  eq(has(collectTrashTriggers(trigCtx(HOST), 'WX02-073', HOST, host, guest), 'WX02-073-E1'), false, '場からは非発火');
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
  eq(has(collectBanishTriggers(trigCtx(HOST, HOST), 'WX02-025', HOST, host, guest), 'WX02-025-E2'), true, 'self発火');
});
test('Stage2 ON_BANISH: any_opp 相手バニッシュで発火・自バニッシュで非発火（WX13-085-E1）', () => {
  const host = mkState({ signi: ['WX13-085', null, null] }); const guest = mkState({});
  eq(has(collectBanishTriggers(trigCtx(HOST, HOST), SIGNI, GUEST, host, guest), 'WX13-085-E1'), true, '相手バニッシュ発火');
  eq(has(collectBanishTriggers(trigCtx(HOST, HOST), SIGNI, HOST, host, guest), 'WX13-085-E1'), false, '自バニッシュ非発火');
});
test('Stage2 ON_BANISH: meId 視点に依らず対称（GUEST 視点でも同結果・playerId は能力保持者）', () => {
  const host = mkState({ signi: ['WX13-085', null, null] }); const guest = mkState({});
  // meId=GUEST 視点でも、相手(GUEST)のシグニがバニッシュ→host の any_opp が発火（playerId=HOST）
  const e = collectBanishTriggers(trigCtx(HOST, GUEST), SIGNI, GUEST, host, guest);
  eq(e.find(x => x.effectId === 'WX13-085-E1')?.playerId, HOST, 'playerId=能力保持者HOST');
});

// Stage2⑥: ON_LEAVE_FIELD（collectLeaveFieldTriggers）を pure 化→自動検証。triggerFilter/leftToZone ゲートを検証。
const ARM_SIGNI = findCard(c => isSigni(c) && (c.CardClass ?? '').includes('アーム'));
const NONARM_SIGNI = findCard(c => isSigni(c) && !!c.CardClass && !(c.CardClass ?? '').includes('アーム'));
test('Stage2 ON_LEAVE_FIELD: self 離脱で自身発火（WX06-016-E2）', () => {
  const host = mkState({}); const guest = mkState({});
  eq(has(collectLeaveFieldTriggers(trigCtx(HOST), 'WX06-016', [], HOST, host, guest), 'WX06-016-E2'), true, 'self発火');
});
test('Stage2 ON_LEAVE_FIELD: any_ally triggerFilter(story:アーム) 一致時のみ発火（WX11-035-E1）', () => {
  const host = mkState({ signi: ['WX11-035', null, null] }); const guest = mkState({});
  eq(has(collectLeaveFieldTriggers(trigCtx(HOST), ARM_SIGNI, [], HOST, host, guest), 'WX11-035-E1'), true, 'アーム離脱で発火');
  eq(has(collectLeaveFieldTriggers(trigCtx(HOST), NONARM_SIGNI, [], HOST, host, guest), 'WX11-035-E1'), false, '非アーム離脱は非発火');
});
test('Stage2 ON_LEAVE_FIELD: leftToZone=hand は手札在中時のみ発火（WXK02-041-E2）', () => {
  const guest = mkState({});
  const host = mkState({ signi: ['WXK02-041', null, null] }); host.hand.push(SIGNI); // 離れたカードが手札に在る
  eq(has(collectLeaveFieldTriggers(trigCtx(HOST), SIGNI, [], HOST, host, guest), 'WXK02-041-E2'), true, '手札在中で発火');
  const host2 = mkState({ signi: ['WXK02-041', null, null] }); // SIGNI を手札に入れない
  eq(has(collectLeaveFieldTriggers(trigCtx(HOST), SIGNI, [], HOST, host2, guest), 'WXK02-041-E2'), false, '手札不在で非発火');
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
test('Stage2 ON_CARD_MILLED_FROM_DECK: milledMinCount 未満は非発火（WXDi-P08-079-E1 min=2）', () => {
  const host = mkState({ signi: ['WXDi-P08-079', null, null] }); const guest = mkState({});
  eq(has(collectMillTriggers(trigCtx(HOST), HOST, host, guest, 2, 0).entries, 'WXDi-P08-079-E1'), true, '2枚で発火');
  eq(has(collectMillTriggers(trigCtx(HOST), HOST, host, guest, 1, 0).entries, 'WXDi-P08-079-E1'), false, '1枚は非発火');
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
test('Stage2 ON_REFRESH: refreshedOwner=any はどちらのリフレッシュでも発火（WXDi-P04-043-E1）', () => {
  const host = mkState({ signi: ['WXDi-P04-043', null, null] }); const guest = mkState({});
  eq(has(collectRefreshTriggers(trigCtx(HOST), HOST, host, guest, 1, 0).entries, 'WXDi-P04-043-E1'), true, '自リフレッシュで発火');
  eq(has(collectRefreshTriggers(trigCtx(HOST), HOST, host, guest, 0, 0).entries, 'WXDi-P04-043-E1'), false, '0回は非発火');
});
test('Stage2 ON_OPP_POWER_DECREASED: decreaseOnOpp>0 で発火＋delta動的注入（WX13-036-E1）', () => {
  const host = mkState({ signi: ['WX13-036', null, null] }); const guest = mkState({});
  const e = collectPowerDecreaseTriggers(trigCtx(HOST), HOST, host, guest, 3000);
  const entry = e.entries.find(x => x.effectId === 'WX13-036-E1');
  eq(!!entry, true, '発火');
  eq((entry?.effect.action as { delta?: number }).delta, 3000, 'delta=減少量');
  eq(has(collectPowerDecreaseTriggers(trigCtx(HOST), HOST, host, guest, 0).entries, 'WX13-036-E1'), false, '0は非発火');
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
test('Stage2 ON_DISCARDED_AS_COST: asCost=true のみ発火（WX25-P3-071-E2）', () => {
  const host = mkState({});
  eq(has(collectHandDiscardTriggers(trigCtx(HOST), ['WX25-P3-071'], host, HOST, true).entries, 'WX25-P3-071-E2'), true, 'コスト捨てで発火');
  eq(has(collectHandDiscardTriggers(trigCtx(HOST), ['WX25-P3-071'], host, HOST, false).entries, 'WX25-P3-071-E2'), false, 'asCost=falseは非発火');
});
test('Stage2 ON_OPP_ARTS_USE/ON_ARTS_USE: 自シグニが発火（WXK11-019-E2 / WXK01-059-E2）', () => {
  const host1 = mkState({ signi: ['WXK11-019', null, null] }); const guest1 = mkState({});
  eq(has(collectOppArtsUseTriggers(trigCtx(HOST, HOST), host1, guest1, true), 'WXK11-019-E2'), true, '相手アーツ使用で発火');
  const host2 = mkState({ signi: ['WXK01-059', null, null] }); const guest2 = mkState({});
  eq(has(collectArtsUseTriggers(trigCtx(HOST), HOST, host2, guest2, true).entries, 'WXK01-059-E2'), true, '自アーツ使用で発火');
});

// Stage2⑩: 大物 collectFieldTriggers（ON_PLAY 等）/ collectBloomTriggers を pure 化→自動検証。
const DOKUGA = findCard(c => isSigni(c) && (c.CardClass ?? '').includes('毒牙') && c.CardNum !== 'WX06-021');
test('Stage2 ON_PLAY field: any_opp 相手シグニが召喚に反応（WXK10-022-E1）', () => {
  const host = mkState({}); const guest = mkState({ signi: ['WXK10-022', null, null] });
  const e = collectFieldTriggers(trigCtx(HOST), 'ON_PLAY', SIGNI, host, guest, HOST);
  eq(has(e, 'WXK10-022-E1'), true, 'any_opp発火');
  eq(e.find(x => x.effectId === 'WXK10-022-E1')?.playerId, GUEST, 'playerId=相手');
});
test('Stage2 ON_PLAY field: any_ally triggerFilter(story:毒牙) 一致時のみ発火（WX06-021-E1）', () => {
  const guest = mkState({});
  const host = mkState({ signi: ['WX06-021', DOKUGA, null] });
  eq(has(collectFieldTriggers(trigCtx(HOST), 'ON_PLAY', DOKUGA, host, guest, HOST), 'WX06-021-E1'), true, '毒牙召喚で発火');
  const host2 = mkState({ signi: ['WX06-021', SIGNI, null] });
  eq(has(collectFieldTriggers(trigCtx(HOST), 'ON_PLAY', SIGNI, host2, guest, HOST), 'WX06-021-E1'), false, '非毒牙召喚は非発火');
});
test('Stage2 ON_BLOOM: self 開花シグニ自身＋場の any_ally が発火（WXK04-026-E2 / WXK05-021-E1）', () => {
  const guest = mkState({});
  const host1 = mkState({}); // self bloom（開花カード自身）
  eq(has(collectBloomTriggers(trigCtx(HOST), 'WXK04-026', host1, guest, HOST), 'WXK04-026-E2'), true, 'self開花で発火');
  const host2 = mkState({ signi: ['WXK05-021', null, null] }); // 場の any_ally が他カードの開花に反応
  eq(has(collectBloomTriggers(trigCtx(HOST), SIGNI, host2, guest, HOST), 'WXK05-021-E1'), true, 'any_ally開花で発火');
});

// Stage2⑪: 最後の collect = collectTurnTriggers（ターン/フェイズ境界）を pure 化→自動検証。
test('Stage2 ON_TURN_END: self シグニが発火・timing 不一致は非発火（WX05-021-E2）', () => {
  const host = mkState({ signi: ['WX05-021', null, null] }); const guest = mkState({});
  const e = collectTurnTriggers(trigCtx(HOST, HOST), 'ON_TURN_END', host, guest);
  eq(has(e, 'WX05-021-E2'), true, 'ターン終了で発火');
  eq(e.find(x => x.effectId === 'WX05-021-E2')?.playerId, HOST, 'playerId=自分');
  eq(has(collectTurnTriggers(trigCtx(HOST, HOST), 'ON_TURN_START', host, guest), 'WX05-021-E2'), false, 'timing不一致は非発火');
});
test('ARTS_USED_THIS_TURN 条件: turn_arts_used で発火ゲート（WX25-P3-112-E1）', () => {
  // 「あなたのアタックフェイズ開始時、このターンにあなたがアーツを使用していた場合、…」＝ turn_arts_used が無ければ非発火
  const host = mkState({ signi: ['WX25-P3-112', null, null] }); const guest = mkState({});
  eq(has(collectTurnTriggers(trigCtx(HOST, HOST), 'ON_ATTACK_PHASE_START', host, guest), 'WX25-P3-112-E1'), false, 'アーツ未使用は非発火');
  const hostUsed = { ...host, turn_arts_used: true };
  eq(has(collectTurnTriggers(trigCtx(HOST, HOST), 'ON_ATTACK_PHASE_START', hostUsed, guest), 'WX25-P3-112-E1'), true, 'アーツ使用済みで発火');
});
test('Stage2 ON_TURN_START: self シグニが発火（WXDi-P05-039-E1）', () => {
  const host = mkState({ signi: ['WXDi-P05-039', null, null] }); const guest = mkState({});
  eq(has(collectTurnTriggers(trigCtx(HOST, HOST), 'ON_TURN_START', host, guest), 'WXDi-P05-039-E1'), true, 'ターン開始で発火');
});
test('Stage2 ON_TURN_START: ルリグの自イベントが発火（WX20-001-E1）', () => {
  const host = mkState({}); host.field.lrig = ['WX20-001']; const guest = mkState({});
  eq(has(collectTurnTriggers(trigCtx(HOST, HOST), 'ON_TURN_START', host, guest), 'WX20-001-E1'), true, 'ルリグ発火');
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

// ── レポート ──
console.log('\n===== goldenTest 結果 =====');
console.log(`PASS ${pass} / FAIL ${fails.length}  (計 ${pass + fails.length})`);
if (fails.length) { console.log('\n--- FAIL ---'); fails.forEach(f => console.log('  ✗ ' + f)); process.exit(1); }
else console.log('✓ 全構文ゴールデン通過');
