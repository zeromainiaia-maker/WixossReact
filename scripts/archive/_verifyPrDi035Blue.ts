// PR-Di035 OPEN DREAM LAND! 青分岐の「相手が手札3枚を選んで捨てる」本実装の検証ハーネス（tsx 実行）。
// PRDI035_APPLY_PARADISE が青成立時、自分3ドロー（即時）＋相手手札捨てをインタラクションとして発行することを確認。
import { execStub } from '../src/engine/execStub';
import { executeAction } from '../src/engine/effectExecutor';
import type { ExecCtx } from '../src/engine/execUtils';
import type { PlayerState, CardData } from '../src/types';

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
function ctxOf(own: PlayerState, oth: PlayerState, cardMap: Map<string, CardData>): ExecCtx {
  return { ownerState: own, otherState: oth, cardMap, logs: [] } as unknown as ExecCtx;
}
const para = (num: string, lv: string): CardData => ({ CardNum: num, CardName: num, Color: '青', Level: lv, CardClass: '奏像：プリパラ', Type: 'シグニ' } as CardData);

const cardMap = new Map<string, CardData>([
  ['P1', para('P1', '1')], ['P2', para('P2', '2')], ['P3', para('P3', '3')],
  ['P2b', para('P2b', '2')], // レベル2追加（種類数を増やさない用）
  ...['D1', 'D2', 'D3', 'D4'].map(n => [n, { CardNum: n, CardName: n, Type: 'シグニ' } as CardData] as [string, CardData]),
  ...['H1', 'H2', 'H3', 'H4', 'H5'].map(n => [n, { CardNum: n, CardName: n, Type: 'シグニ' } as CardData] as [string, CardData]),
]);

const field3 = (a: string, b: string, c: string): PlayerState['field'] => ({ lrig: [], signi: [[a], [b], [c]], assist_lrig_l: [], assist_lrig_r: [], check: null, key_piece: null, free_zone: [] } as unknown as PlayerState['field']);

console.log('\n[1] 青成立（プリパラ青3体・レベル3種類）→ ドロー即時＋相手手札捨てインタラクション');
{
  const own = blankState({ deck: ['D1', 'D2', 'D3', 'D4'], field: field3('P1', 'P2', 'P3'), pending_pridi035_paradise: true } as Partial<PlayerState>);
  const oth = blankState({ hand: ['H1', 'H2', 'H3', 'H4', 'H5'] });
  const r = execStub({ type: 'STUB', id: 'PRDI035_APPLY_PARADISE' } as never, ctxOf(own, oth, cardMap), executeAction as never);
  check('自分3ドロー（即時反映）', r.ownerState.hand.slice().sort().join() === 'D1,D2,D3' && r.ownerState.deck.join() === 'D4', JSON.stringify(r.ownerState.hand));
  check('完了せずインタラクション発行', r.done === false, JSON.stringify(r).slice(0, 120));
  const pend = (r as unknown as { pending?: { type?: string; count?: number; targetScope?: string; opponentResponds?: boolean; candidates?: string[] } }).pending;
  check('SELECT_TARGET / opp_hand', pend?.type === 'SELECT_TARGET' && pend?.targetScope === 'opp_hand', JSON.stringify(pend));
  check('count=3', pend?.count === 3, `count=${pend?.count}`);
  check('opponentResponds=true（相手が選ぶ）', pend?.opponentResponds === true);
  check('候補=相手手札5枚', (pend?.candidates?.length ?? 0) === 5, JSON.stringify(pend?.candidates));
  check('この時点では相手手札未変更', r.otherState.hand.length === 5);
}

console.log('\n[2] 相手手札2枚 → count=2 に丸める');
{
  const own = blankState({ deck: ['D1', 'D2', 'D3', 'D4'], field: field3('P1', 'P2', 'P3'), pending_pridi035_paradise: true } as Partial<PlayerState>);
  const oth = blankState({ hand: ['H1', 'H2'] });
  const r = execStub({ type: 'STUB', id: 'PRDI035_APPLY_PARADISE' } as never, ctxOf(own, oth, cardMap), executeAction as never);
  const pend = (r as unknown as { pending?: { count?: number } }).pending;
  check('count=2（手札枚数で頭打ち）', pend?.count === 2, `count=${pend?.count}`);
}

console.log('\n[3] 相手手札0枚 → インタラクションなしで完了');
{
  const own = blankState({ deck: ['D1', 'D2', 'D3', 'D4'], field: field3('P1', 'P2', 'P3'), pending_pridi035_paradise: true } as Partial<PlayerState>);
  const oth = blankState({ hand: [] });
  const r = execStub({ type: 'STUB', id: 'PRDI035_APPLY_PARADISE' } as never, ctxOf(own, oth, cardMap), executeAction as never);
  check('完了（done=true）', r.done === true);
  check('ドローは適用', r.ownerState.hand.slice().sort().join() === 'D1,D2,D3');
}

console.log('\n[4] 青非成立（レベル2種類のみ）→ 効果なし・完了');
{
  const own = blankState({ deck: ['D1', 'D2', 'D3', 'D4'], field: field3('P1', 'P2', 'P2b'), pending_pridi035_paradise: true } as Partial<PlayerState>);
  const oth = blankState({ hand: ['H1', 'H2', 'H3'] });
  const r = execStub({ type: 'STUB', id: 'PRDI035_APPLY_PARADISE' } as never, ctxOf(own, oth, cardMap), executeAction as never);
  check('完了（done=true）', r.done === true);
  check('ドローなし（青非成立）', r.ownerState.hand.length === 0, JSON.stringify(r.ownerState.hand));
  check('相手手札も不変', r.otherState.hand.length === 3);
}

console.log(`\n結果: ${pass} pass / ${fail} fail`);
process.exit(fail > 0 ? 1 : 0);
