// バリア実装のエンジンレベル検証ハーネス（tsx で実行）。
// GAIN_*_BARRIER / EVDIVA_PER_LRIG_COLOR / PRDI035_PARADISE_COLOR stub と
// フリーゾーンのバリアヘルパーが期待どおり動くかを確認する。
import { execStub } from '../src/engine/execStub';
import {
  countBarrierTokens, addBarrierTokens, removeOneBarrierToken,
  LRIG_BARRIER_CARD, SIGNI_BARRIER_CARD,
} from '../src/engine/execUtils';
import type { ExecCtx } from '../src/engine/execUtils';
import type { PlayerState } from '../src/types';
import type { CardData } from '../src/types';

let pass = 0, fail = 0;
function check(name: string, cond: boolean, extra = '') {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}  ${extra}`); }
}

const dummyExec = (() => ({ done: true })) as unknown as Parameters<typeof execStub>[2];

function blankState(over: Partial<PlayerState> = {}): PlayerState {
  return {
    deck: [], hand: [], energy: [], trash: [], lrig_trash: [], lrig_deck: [], life_cloth: [],
    field: { lrig: [], signi: [null, null, null], assist_lrig_l: [], assist_lrig_r: [], check: null, key_piece: null, free_zone: [] },
    coins: 0,
    ...over,
  } as unknown as PlayerState;
}

function ctxOf(own: PlayerState, oth: PlayerState, cardMap: Map<string, CardData>): ExecCtx {
  return { ownerState: own, otherState: oth, cardMap, logs: [] } as unknown as ExecCtx;
}

const card = (over: Partial<CardData>): CardData => ({ CardNum: '', CardName: '', Color: '', Level: '', CardClass: '', Type: 'シグニ', ...over } as CardData);

// ── 1. フリーゾーンのバリアヘルパー ──
console.log('\n[1] バリアトークンヘルパー');
{
  let fz: string[] = [];
  fz = addBarrierTokens(fz, LRIG_BARRIER_CARD, 1);
  fz = addBarrierTokens(fz, SIGNI_BARRIER_CARD, 2);
  check('ルリグ1+シグニ2を設置', countBarrierTokens(fz, LRIG_BARRIER_CARD) === 1 && countBarrierTokens(fz, SIGNI_BARRIER_CARD) === 2, JSON.stringify(fz));
  check('連番がユニーク', new Set(fz).size === fz.length, JSON.stringify(fz));
  const fz2 = removeOneBarrierToken(fz, SIGNI_BARRIER_CARD);
  check('シグニを1枚だけ消費', countBarrierTokens(fz2, SIGNI_BARRIER_CARD) === 1 && countBarrierTokens(fz2, LRIG_BARRIER_CARD) === 1);
  // 消費後の追加で連番衝突しない
  const fz3 = addBarrierTokens(fz2, SIGNI_BARRIER_CARD, 1);
  check('消費後の追加で連番衝突なし', new Set(fz3).size === fz3.length, JSON.stringify(fz3));
}

// ── 2. GAIN_*_BARRIER stub ──
console.log('\n[2] GAIN_*_BARRIER stub');
{
  const own = blankState();
  const r = execStub({ type: 'STUB', id: 'GAIN_LRIG_BARRIER' } as never, ctxOf(own, blankState(), new Map()), dummyExec);
  const fz = (r as { ownerState: PlayerState }).ownerState.field.free_zone ?? [];
  check('GAIN_LRIG_BARRIER でフリーゾーンにルリグバリア', countBarrierTokens(fz, LRIG_BARRIER_CARD) === 1, JSON.stringify(fz));

  const r2 = execStub({ type: 'STUB', id: 'GAIN_LRIG_BARRIER', count: 2 } as never, ctxOf(blankState(), blankState(), new Map()), dummyExec);
  const fz2 = (r2 as { ownerState: PlayerState }).ownerState.field.free_zone ?? [];
  check('count:2 で2枚設置(純白の防壁相当)', countBarrierTokens(fz2, LRIG_BARRIER_CARD) === 2, JSON.stringify(fz2));

  const r3 = execStub({ type: 'STUB', id: 'GAIN_SIGNI_BARRIER' } as never, ctxOf(blankState(), blankState(), new Map()), dummyExec);
  const fz3 = (r3 as { ownerState: PlayerState }).ownerState.field.free_zone ?? [];
  check('GAIN_SIGNI_BARRIER でシグニバリア', countBarrierTokens(fz3, SIGNI_BARRIER_CARD) === 1, JSON.stringify(fz3));
}

// ── 3. EVDIVA_PER_LRIG_COLOR ──
console.log('\n[3] EVDIVA_PER_LRIG_COLOR（色別ルリグ数）');
{
  const cm = new Map<string, CardData>([
    ['LR-W', card({ CardNum: 'LR-W', Color: '白' })],
    ['LR-B', card({ CardNum: 'LR-B', Color: '青' })],
    ['LR-WB', card({ CardNum: 'LR-WB', Color: '白黒' })],
  ]);
  const own = blankState({
    deck: Array.from({ length: 20 }, (_, i) => `D${i}`),
    field: { lrig: ['LR-W'], assist_lrig_l: ['LR-B'], assist_lrig_r: ['LR-WB'], signi: [null, null, null], check: null, key_piece: null, free_zone: [] } as never,
  });
  const oth = blankState({ deck: Array.from({ length: 30 }, (_, i) => `OD${i}`) });
  const r = execStub({ type: 'STUB', id: 'EVDIVA_PER_LRIG_COLOR' } as never, ctxOf(own, oth, cm), dummyExec);
  const ro = (r as { ownerState: PlayerState; otherState: PlayerState });
  // 白2体(LR-W, LR-WB) → ルリグバリア2 / 青1体 → ドロー3 / 黒1体(LR-WB) → 相手ミル10
  check('白2体→ルリグバリア2', countBarrierTokens(ro.ownerState.field.free_zone, LRIG_BARRIER_CARD) === 2);
  check('青1体→3ドロー', ro.ownerState.hand.length === 3, `hand=${ro.ownerState.hand.length}`);
  check('黒1体→相手10ミル', ro.otherState.trash.length === 10, `trash=${ro.otherState.trash.length}`);
}

// ── 4. PRDI035_PARADISE_COLOR ──
console.log('\n[4] PRDI035_PARADISE_COLOR（プリパラ共通色分岐）');
{
  const cm = new Map<string, CardData>([
    ['P1', card({ CardNum: 'P1', Color: '白', Level: '1', CardClass: '奏像：プリパラ' })],
    ['P2', card({ CardNum: 'P2', Color: '白', Level: '2', CardClass: '奏像：プリパラ' })],
    ['P3', card({ CardNum: 'P3', Color: '白', Level: '3', CardClass: '奏像：プリパラ' })],
  ]);
  const own = blankState({
    field: { lrig: [], signi: [['P1'], ['P2'], ['P3']], assist_lrig_l: [], assist_lrig_r: [], check: null, key_piece: null, free_zone: [] } as never,
  });
  const r = execStub({ type: 'STUB', id: 'PRDI035_PARADISE_COLOR' } as never, ctxOf(own, blankState(), cm), dummyExec);
  const fz = (r as { ownerState: PlayerState }).ownerState.field.free_zone ?? [];
  check('白プリパラ3体(Lv1/2/3)→シグニ+ルリグバリア', countBarrierTokens(fz, SIGNI_BARRIER_CARD) === 1 && countBarrierTokens(fz, LRIG_BARRIER_CARD) === 1, JSON.stringify(fz));

  // レベル重複(条件未達)
  const cm2 = new Map<string, CardData>([
    ['Q1', card({ CardNum: 'Q1', Color: '白', Level: '1', CardClass: '奏像：プリパラ' })],
    ['Q2', card({ CardNum: 'Q2', Color: '白', Level: '1', CardClass: '奏像：プリパラ' })],
    ['Q3', card({ CardNum: 'Q3', Color: '白', Level: '2', CardClass: '奏像：プリパラ' })],
  ]);
  const own2 = blankState({ field: { lrig: [], signi: [['Q1'], ['Q2'], ['Q3']], assist_lrig_l: [], assist_lrig_r: [], check: null, key_piece: null, free_zone: [] } as never });
  const r2 = execStub({ type: 'STUB', id: 'PRDI035_PARADISE_COLOR' } as never, ctxOf(own2, blankState(), cm2), dummyExec);
  const fz2 = (r2 as { ownerState: PlayerState }).ownerState.field.free_zone ?? [];
  check('レベル2種類のみ→条件未達でバリアなし', fz2.length === 0, JSON.stringify(fz2));
}

console.log(`\n=== 結果: ${pass} pass / ${fail} fail ===`);
process.exit(fail > 0 ? 1 : 0);
