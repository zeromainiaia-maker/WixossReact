// FUTURE SESSION ②（WX26-CP1-001-E1 c1）2段階リビールピックの検証ハーネス（tsx 実行）。
// デッキ上5枚 → 2枚まで手札 → ＜プリオケ＞1枚までエナ → 残りをデッキ下、を確認する。
import { executeAction, resumeSearch } from '../src/engine/effectExecutor';
import type { ExecCtx, ExecResult } from '../src/engine/execUtils';
import type { PlayerState, CardData } from '../src/types';
import type { EffectAction, PendingInteractionDef } from '../src/types';

let pass = 0, fail = 0;
function check(name: string, cond: boolean, extra = '') {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}  ${extra}`); }
}

function blankState(over: Partial<PlayerState> = {}): PlayerState {
  return {
    deck: [], hand: [], energy: [], trash: [], lrig_trash: [], lrig_deck: [], life_cloth: [],
    field: { lrig: [], signi: [null, null, null], assist_lrig_l: [], assist_lrig_r: [], check: null, key_piece: null, free_zone: [] },
    coins: 0,
    ...over,
  } as unknown as PlayerState;
}
function ctxOf(own: PlayerState, cardMap: Map<string, CardData>): ExecCtx {
  return { ownerState: own, otherState: blankState(), cardMap, logs: [] } as unknown as ExecCtx;
}
const card = (num: string, cls = ''): CardData => ({ CardNum: num, CardName: num, Color: '', Level: '', CardClass: cls, Type: 'シグニ' } as CardData);

const cardMap = new Map<string, CardData>([
  ['A', card('A')], ['B', card('B')], ['C', card('C')], ['D', card('D')],
  ['E', card('E')], ['F', card('F')],
  ['PRI', card('PRI', '奏像：プリオケ')], ['PRI2', card('PRI2', '奏像：プリオケ')],
]);

const stub = {
  type: 'STUB', id: 'REVEAL_PICK_HAND_SHUFFLE_BOTTOM',
  revealPickParams: { pickCount: 2, restDest: 'deck_bottom', then: 'hand', secondPick: { classContains: 'プリオケ', toMax: 1, restDest: 'deck_bottom' } },
} as unknown as EffectAction;

function pendingOf(r: ExecResult): PendingInteractionDef & { type: 'SEARCH' } {
  return (r as unknown as { pending: PendingInteractionDef & { type: 'SEARCH' } }).pending;
}

// ── 1. 標準ケース: 上5=[A,B,PRI,C,D]、A,B手札 / PRIエナ / C,Dデッキ下 ──
console.log('\n[1] 標準ケース（手札2 + プリオケ1エナ + 残2デッキ下）');
{
  const own = blankState({ deck: ['A', 'B', 'PRI', 'C', 'D', 'E', 'F'] });
  const r1 = executeAction(stub, ctxOf(own, cardMap));
  check('1段目で SEARCH 発行', !r1.done && pendingOf(r1)?.type === 'SEARCH', JSON.stringify(r1).slice(0, 120));
  check('1段目 visibleCards=上5', JSON.stringify(pendingOf(r1).visibleCards) === JSON.stringify(['A', 'B', 'PRI', 'C', 'D']));
  check('1段目 maxPick=2', pendingOf(r1).maxPick === 2);

  const ctx1 = { ...ctxOf(own, cardMap), ownerState: r1.ownerState, otherState: r1.otherState };
  const r2 = resumeSearch(['A', 'B'], pendingOf(r1), ctx1 as ExecCtx);
  check('A,B が手札に', r2.ownerState.hand.includes('A') && r2.ownerState.hand.includes('B'));
  check('2段目 SEARCH 発行（プリオケ選択）', !r2.done && pendingOf(r2)?.type === 'SEARCH', JSON.stringify(pendingOf(r2)).slice(0, 120));
  check('2段目 visibleCards=[PRI]', JSON.stringify(pendingOf(r2).visibleCards) === JSON.stringify(['PRI']));
  check('非対象C,Dは既にデッキ下へ（デッキ末尾）', r2.ownerState.deck.slice(-2).sort().join() === 'C,D', JSON.stringify(r2.ownerState.deck));

  const ctx2 = { ...ctx1, ownerState: r2.ownerState, otherState: r2.otherState } as ExecCtx;
  const r3 = resumeSearch(['PRI'], pendingOf(r2), ctx2);
  check('完了', r3.done);
  check('PRI がエナへ', r3.ownerState.energy.includes('PRI'));
  check('PRI はデッキにない', !r3.ownerState.deck.includes('PRI'));
  check('最終手札=A,B', r3.ownerState.hand.slice().sort().join() === 'A,B');
  check('デッキ先頭は E,F（公開外）', r3.ownerState.deck.slice(0, 2).join() === 'E,F', JSON.stringify(r3.ownerState.deck));
  check('C,D がデッキ末尾に残る', r3.ownerState.deck.slice(-2).sort().join() === 'C,D');
}

// ── 2. プリオケ不在: 残り全てデッキ下、エナ送りなし ──
console.log('\n[2] プリオケ不在（2段目はSEARCHなしで残りデッキ下）');
{
  const own = blankState({ deck: ['A', 'B', 'C', 'D', 'E', 'F'] });
  const r1 = executeAction(stub, ctxOf(own, cardMap));
  const ctx1 = { ...ctxOf(own, cardMap), ownerState: r1.ownerState, otherState: r1.otherState } as ExecCtx;
  const r2 = resumeSearch(['A', 'B'], pendingOf(r1), ctx1);
  check('2段目で完了（プリオケなし）', r2.done, JSON.stringify(r2).slice(0, 120));
  check('A,B 手札', r2.ownerState.hand.slice().sort().join() === 'A,B');
  check('C,D,E がデッキ下へ（末尾3枚）', r2.ownerState.deck.slice(-3).sort().join() === 'C,D,E', JSON.stringify(r2.ownerState.deck));
  check('エナは空', r2.ownerState.energy.length === 0);
}

// ── 3. 手札0枚（up to なので可）+ プリオケ複数のうち1枚 ──
console.log('\n[3] 手札0枚 + プリオケ2枚中1枚をエナ');
{
  const own = blankState({ deck: ['PRI', 'PRI2', 'C', 'D', 'E', 'F'] });
  const r1 = executeAction(stub, ctxOf(own, cardMap));
  const ctx1 = { ...ctxOf(own, cardMap), ownerState: r1.ownerState, otherState: r1.otherState } as ExecCtx;
  const r2 = resumeSearch([], pendingOf(r1), ctx1); // 手札0
  check('手札0でも2段目SEARCH', !r2.done && pendingOf(r2)?.type === 'SEARCH');
  check('2段目候補=[PRI,PRI2]', JSON.stringify(pendingOf(r2).visibleCards) === JSON.stringify(['PRI', 'PRI2']));
  const ctx2 = { ...ctx1, ownerState: r2.ownerState, otherState: r2.otherState } as ExecCtx;
  const r3 = resumeSearch(['PRI'], pendingOf(r2), ctx2);
  check('完了', r3.done);
  check('PRI エナ・PRI2 はデッキ下', r3.ownerState.energy.includes('PRI') && r3.ownerState.deck.includes('PRI2') && !r3.ownerState.deck.includes('PRI'));
  check('手札は空', r3.ownerState.hand.length === 0);
}

console.log(`\n結果: ${pass} pass / ${fail} fail`);
process.exit(fail > 0 ? 1 : 0);
