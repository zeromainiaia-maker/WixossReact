// G186（WXK02-071 / WXK10-057 / WDK05-T15）の STUB ハンドラ検証ハーネス。
// REVEAL_TOP_PLACE_AS_ATTACKER_IF_SIGNI: デッキの一番上を公開し、
//  - シグニなら空きゾーンへダウン状態で場に出す（アタック継続はダウン配置で近似）
//  - シグニでなければ場に出さない（デッキトップに残す）
import { execStub } from '../src/engine/execStub';
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
    coins: 0, ...over,
  } as unknown as PlayerState;
}
function ctxOf(own: PlayerState, oth: PlayerState, cardMap: Map<string, CardData>): ExecCtx {
  return { ownerState: own, otherState: oth, cardMap, logs: [] } as unknown as ExecCtx;
}
const card = (over: Partial<CardData>): CardData => ({ CardNum: '', CardName: '', Color: '', Level: '', CardClass: '', Type: 'シグニ', Power: '', ...over } as CardData);
const dummyExec = (() => ({ done: true })) as unknown as Parameters<typeof execStub>[2];
const ownerOf = (r: unknown): PlayerState => (r as { ownerState: PlayerState }).ownerState;

const cardMap = new Map<string, CardData>([
  ['SIGNI-TOP', card({ CardNum: 'SIGNI-TOP', CardName: 'デッキトップのシグニ', Type: 'シグニ', Power: '3000' })],
  ['SPELL-TOP', card({ CardNum: 'SPELL-TOP', CardName: 'デッキトップのスペル', Type: 'スペル' })],
]);
const STUB = { type: 'STUB', id: 'REVEAL_TOP_PLACE_AS_ATTACKER_IF_SIGNI' } as never;

console.log('\n[1] デッキトップがシグニ → 空きゾーンにダウン状態で場に出す（デッキから除去）');
{
  // 攻撃シグニが手札に戻った後＝1ゾーンだけ空き、を想定（zone0空き）
  const own = blankState({ deck: ['SIGNI-TOP', 'X1', 'X2'], field: { ...blankState().field, signi: [null, ['ALLY'], null] } });
  const o = ownerOf(execStub(STUB, ctxOf(own, blankState(), cardMap), dummyExec));
  check('zone0 にデッキトップを配置', o.field.signi[0]?.at(-1) === 'SIGNI-TOP', JSON.stringify(o.field.signi));
  check('zone0 がダウン状態', (o.field.signi_down ?? [])[0] === true, JSON.stringify(o.field.signi_down));
  check('デッキトップから除去', o.deck[0] === 'X1' && !o.deck.includes('SIGNI-TOP'), JSON.stringify(o.deck));
}

console.log('\n[2] デッキトップがシグニでない（スペル）→ 場に出さない・デッキトップに残す');
{
  const own = blankState({ deck: ['SPELL-TOP', 'X1'], field: { ...blankState().field, signi: [null, null, null] } });
  const o = ownerOf(execStub(STUB, ctxOf(own, blankState(), cardMap), dummyExec));
  check('場に出していない（全ゾーン空）', o.field.signi.every(z => !z || z.length === 0), JSON.stringify(o.field.signi));
  check('デッキトップに残る', o.deck[0] === 'SPELL-TOP', JSON.stringify(o.deck));
}

console.log('\n[3] 空きシグニゾーンなし → 場に出せない（デッキトップ温存）');
{
  const own = blankState({ deck: ['SIGNI-TOP'], field: { ...blankState().field, signi: [['A'], ['B'], ['C']] } });
  const o = ownerOf(execStub(STUB, ctxOf(own, blankState(), cardMap), dummyExec));
  check('デッキトップに残る', o.deck[0] === 'SIGNI-TOP', JSON.stringify(o.deck));
}

console.log(`\n結果: ${pass} pass / ${fail} fail`);
process.exit(fail > 0 ? 1 : 0);
