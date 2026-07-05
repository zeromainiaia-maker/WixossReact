// ON_SIGNI_BECOMES_DRIVE（G184/G218）engine 配線の検証ハーネス。
// ライド実行スタブ（LRIG_RIDE_SIGNI / CENTER_LRIG_RIDES_ON_SIGNI / RIDE_ON）が
// 新たにドライブ状態になったシグニを drive_became_just に積むこと、
// および既にドライブ状態のシグニは再度積まれない（差分のみ）ことを確認する。
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
function ctxOf(own: PlayerState, oth: PlayerState, cardMap: Map<string, CardData>, extra: Partial<ExecCtx> = {}): ExecCtx {
  return { ownerState: own, otherState: oth, cardMap, logs: [], ...extra } as unknown as ExecCtx;
}
const card = (over: Partial<CardData>): CardData => ({ CardNum: '', CardName: '', Color: '', Level: '', CardClass: '', Type: 'シグニ', ...over } as CardData);
const dummyExec = (() => ({ done: true })) as unknown as Parameters<typeof execStub>[2];
const ownerOf = (r: unknown): PlayerState => (r as { ownerState: PlayerState }).ownerState;

const cardMap = new Map<string, CardData>([
  ['WDK01-014', card({ CardNum: 'WDK01-014', CardName: 'コードライド　シンカン', CardClass: '精械：乗機' })],
  ['WDK01-017', card({ CardNum: 'WDK01-017', CardName: 'コードライド　ゴーカート', CardClass: '精械：乗機' })],
  ['WXK01-076', card({ CardNum: 'WXK01-076', CardName: 'コードライド　アシスト', CardClass: '精械：乗機' })],
]);

console.log('\n[1] LRIG_RIDE_SIGNI: 全乗機シグニがドライブ化→drive_became_just に2体積む');
{
  const own = blankState({ field: { ...blankState().field, signi: [['WDK01-014'], ['WDK01-017'], null] } });
  const r = execStub({ type: 'STUB', id: 'LRIG_RIDE_SIGNI' } as never, ctxOf(own, blankState(), cardMap), dummyExec);
  const o = ownerOf(r);
  check('lrig_riding_signi に2体', (o.lrig_riding_signi ?? []).length === 2, JSON.stringify(o.lrig_riding_signi));
  check('drive_became_just に WDK01-014', (o.drive_became_just ?? []).includes('WDK01-014'), JSON.stringify(o.drive_became_just));
  check('drive_became_just に WDK01-017', (o.drive_became_just ?? []).includes('WDK01-017'), JSON.stringify(o.drive_became_just));
}

console.log('\n[2] LRIG_RIDE_SIGNI: 既にドライブ中のシグニは再フラグしない（差分のみ）');
{
  const own = blankState({
    field: { ...blankState().field, signi: [['WDK01-014'], ['WDK01-017'], null] },
    lrig_riding_signi: ['WDK01-014'], // 既にドライブ状態
  });
  const r = execStub({ type: 'STUB', id: 'LRIG_RIDE_SIGNI' } as never, ctxOf(own, blankState(), cardMap), dummyExec);
  const o = ownerOf(r);
  check('drive_became_just は WDK01-017 のみ（新規分）', JSON.stringify(o.drive_became_just) === JSON.stringify(['WDK01-017']), JSON.stringify(o.drive_became_just));
}

console.log('\n[3] CENTER_LRIG_RIDES_ON_SIGNI: 選択済み1体がドライブ化');
{
  const own = blankState({
    field: { ...blankState().field, signi: [['WXK01-076'], null, null] },
  });
  const r = execStub(
    { type: 'STUB', id: 'CENTER_LRIG_RIDES_ON_SIGNI' } as never,
    ctxOf(own, blankState(), cardMap, { lastProcessedCards: ['WXK01-076'] }),
    dummyExec,
  );
  const o = ownerOf(r);
  check('lrig_riding_signi = [WXK01-076]', JSON.stringify(o.lrig_riding_signi) === JSON.stringify(['WXK01-076']), JSON.stringify(o.lrig_riding_signi));
  check('drive_became_just = [WXK01-076]', JSON.stringify(o.drive_became_just) === JSON.stringify(['WXK01-076']), JSON.stringify(o.drive_became_just));
}

console.log('\n[4] RIDE_ON: 選択した乗機シグニがドライブ化');
{
  const own = blankState({
    field: { ...blankState().field, signi: [['WXK01-076'], null, null] },
  });
  const r = execStub(
    { type: 'STUB', id: 'RIDE_ON' } as never,
    ctxOf(own, blankState(), cardMap, { lastProcessedCards: ['WXK01-076'] }),
    dummyExec,
  );
  const o = ownerOf(r);
  check('lrig_riding_signi = [WXK01-076]', JSON.stringify(o.lrig_riding_signi) === JSON.stringify(['WXK01-076']), JSON.stringify(o.lrig_riding_signi));
  check('drive_became_just = [WXK01-076]', JSON.stringify(o.drive_became_just) === JSON.stringify(['WXK01-076']), JSON.stringify(o.drive_became_just));
}

console.log(`\n結果: ${pass} pass / ${fail} fail`);
process.exit(fail > 0 ? 1 : 0);
