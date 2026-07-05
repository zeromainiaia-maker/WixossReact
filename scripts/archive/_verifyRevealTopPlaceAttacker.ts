// G186（WXK02-071 / WXK10-057 / WDK05-T15）の STUB ハンドラ検証ハーネス。
// REVEAL_TOP_PLACE_AS_ATTACKER_IF_SIGNI: 「このシグニを手札に戻した場合のみ」
//  - デッキの一番上を公開し、
//  - シグニなら手札に戻ったアタッカーの元ゾーン（pending_signi_battle.zoneIndex）へダウン状態で出す
//    → バトル解決(Phase2)は同ゾーンのシグニをアタッカーとして処理するため、アタックがそのまま継続する。
//  - シグニでなければ場に出さない（デッキトップに残す）
//  - バウンスを選ばなかった（アタッカーが場に残っている）場合は不発。
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
function ctxOf(own: PlayerState, oth: PlayerState, cardMap: Map<string, CardData>, sourceCardNum?: string): ExecCtx {
  return { ownerState: own, otherState: oth, cardMap, logs: [], sourceCardNum } as unknown as ExecCtx;
}
const card = (over: Partial<CardData>): CardData => ({ CardNum: '', CardName: '', Color: '', Level: '', CardClass: '', Type: 'シグニ', Power: '', ...over } as CardData);
const dummyExec = (() => ({ done: true })) as unknown as Parameters<typeof execStub>[2];
const ownerOf = (r: unknown): PlayerState => (r as { ownerState: PlayerState }).ownerState;

const cardMap = new Map<string, CardData>([
  ['SIGNI-TOP', card({ CardNum: 'SIGNI-TOP', CardName: 'デッキトップのシグニ', Type: 'シグニ', Power: '3000' })],
  ['SPELL-TOP', card({ CardNum: 'SPELL-TOP', CardName: 'デッキトップのスペル', Type: 'スペル' })],
  ['SANPOKE', card({ CardNum: 'SANPOKE', CardName: '偉智の遊　サンポケ', Type: 'シグニ', Power: '5000' })],
]);
const STUB = { type: 'STUB', id: 'REVEAL_TOP_PLACE_AS_ATTACKER_IF_SIGNI' } as never;

console.log('\n[1] バウンス済み・デッキトップがシグニ → アタッカーの元ゾーン(zone1)へダウン状態で出す（アタック継続）');
{
  // アタッカー SANPOKE は zone1 にいたが手札に戻り、zone1 が空。pending_signi_battle.zoneIndex=1。
  const own = blankState({
    deck: ['SIGNI-TOP', 'X1', 'X2'], hand: ['SANPOKE'],
    field: { ...blankState().field, signi: [['ALLY0'], null, ['ALLY2']] },
    pending_signi_battle: { zoneIndex: 1 },
  });
  const o = ownerOf(execStub(STUB, ctxOf(own, blankState(), cardMap, 'SANPOKE'), dummyExec));
  check('アタッカーの元ゾーン(zone1)に配置＝アタック継続', o.field.signi[1]?.at(-1) === 'SIGNI-TOP', JSON.stringify(o.field.signi));
  check('zone1 がダウン状態', (o.field.signi_down ?? [])[1] === true, JSON.stringify(o.field.signi_down));
  check('他ゾーンは不変', o.field.signi[0]?.at(-1) === 'ALLY0' && o.field.signi[2]?.at(-1) === 'ALLY2', JSON.stringify(o.field.signi));
  check('デッキトップから除去', o.deck[0] === 'X1' && !o.deck.includes('SIGNI-TOP'), JSON.stringify(o.deck));
}

console.log('\n[2] バウンス済み・デッキトップがシグニでない（スペル）→ 場に出さない・デッキトップに残す');
{
  const own = blankState({
    deck: ['SPELL-TOP', 'X1'], hand: ['SANPOKE'],
    field: { ...blankState().field, signi: [null, null, null] },
    pending_signi_battle: { zoneIndex: 1 },
  });
  const o = ownerOf(execStub(STUB, ctxOf(own, blankState(), cardMap, 'SANPOKE'), dummyExec));
  check('場に出していない（全ゾーン空）', o.field.signi.every(z => !z || z.length === 0), JSON.stringify(o.field.signi));
  check('デッキトップに残る', o.deck[0] === 'SPELL-TOP', JSON.stringify(o.deck));
}

console.log('\n[3] バウンスを選ばなかった（アタッカーが zone1 に残存）→ 不発（公開も配置もしない）');
{
  const own = blankState({
    deck: ['SIGNI-TOP', 'X1'],
    field: { ...blankState().field, signi: [null, ['SANPOKE'], null] },
    pending_signi_battle: { zoneIndex: 1 },
  });
  const o = ownerOf(execStub(STUB, ctxOf(own, blankState(), cardMap, 'SANPOKE'), dummyExec));
  check('アタッカーはそのまま zone1 に残る', o.field.signi[1]?.at(-1) === 'SANPOKE', JSON.stringify(o.field.signi));
  check('デッキは不変（公開・ドローなし）', o.deck[0] === 'SIGNI-TOP' && o.deck.length === 2, JSON.stringify(o.deck));
}

console.log('\n[4] 元ゾーン情報なし(防御的フォールバック)・空きあり → 先頭の空きゾーンへ配置');
{
  const own = blankState({
    deck: ['SIGNI-TOP'], hand: ['SANPOKE'],
    field: { ...blankState().field, signi: [null, ['B'], ['C']] },
    // pending_signi_battle 無し
  });
  const o = ownerOf(execStub(STUB, ctxOf(own, blankState(), cardMap, 'SANPOKE'), dummyExec));
  check('先頭の空き zone0 へ配置', o.field.signi[0]?.at(-1) === 'SIGNI-TOP', JSON.stringify(o.field.signi));
}

console.log('\n[5] バウンス済みだが空きシグニゾーンなし → 場に出せない（デッキトップ温存）');
{
  const own = blankState({
    deck: ['SIGNI-TOP'], hand: ['SANPOKE'],
    field: { ...blankState().field, signi: [['A'], ['B'], ['C']] },
    pending_signi_battle: { zoneIndex: 1 }, // ただし zone1 は埋まっている異常系
  });
  const o = ownerOf(execStub(STUB, ctxOf(own, blankState(), cardMap, 'SANPOKE'), dummyExec));
  check('デッキトップに残る', o.deck[0] === 'SIGNI-TOP', JSON.stringify(o.deck));
}

console.log(`\n結果: ${pass} pass / ${fail} fail`);
process.exit(fail > 0 ? 1 : 0);
