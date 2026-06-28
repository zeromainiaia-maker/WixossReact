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
import type { CardData, PlayerState } from '../src/types';
import type { CardEffect, EffectAction } from '../src/types/effects';
import { mergeManualEffects } from '../src/data/manualEffects';
import {
  executeEffect,
  resumeSelectTarget, resumeSearch, resumeChoose,
  resumeLookAndReorder, resumeSelectZone, resumeSelectVirusZone, resumeSelectSigniZone,
  type ExecCtx, type ExecResult,
} from '../src/engine/effectExecutor';

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
test('TRASH 手札1: 手札-1 トラッシュ+1', () => {
  const ctx = mkCtx({ hand: 5, trash: 3 }, {});
  const r = run({ type: 'TRASH', target: { type: 'HAND_CARD', owner: 'self', count: 1 } } as EffectAction, ctx);
  eq(r.ownerState.hand.length, 4, 'hand'); eq(r.ownerState.trash.length, 4, 'trash');
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

// ── レポート ──
console.log('\n===== goldenTest 結果 =====');
console.log(`PASS ${pass} / FAIL ${fails.length}  (計 ${pass + fails.length})`);
if (fails.length) { console.log('\n--- FAIL ---'); fails.forEach(f => console.log('  ✗ ' + f)); process.exit(1); }
else console.log('✓ 全構文ゴールデン通過');
