// ON_BECOME_BEAT の engine 側＝【ビート】化時に beat_became_just フラグが立つことの検証。
// （BattleScreen の collectBeatBecameTriggers/watcher は React 側のため実機検証。ここでは発火元フラグを確認）
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
    field: { lrig: [], signi: [null, null, null], assist_lrig_l: [], assist_lrig_r: [], check: null, key_piece: null, free_zone: [], beat_zone: [] },
    coins: 0, ...over,
  } as unknown as PlayerState;
}
function ctxOf(own: PlayerState, oth: PlayerState, cardMap: Map<string, CardData>, over: Partial<ExecCtx> = {}): ExecCtx {
  return { ownerState: own, otherState: oth, cardMap, logs: [], ...over } as unknown as ExecCtx;
}
const card = (n: string): CardData => ({ CardNum: n, CardName: n, Color: '赤', Level: '2', CardClass: '悪魔', Type: 'シグニ', Power: '5000' } as CardData);
const dummyExec = (() => ({ done: true })) as unknown as Parameters<typeof execStub>[2];
const ownerOf = (r: unknown): PlayerState => (r as { ownerState: PlayerState }).ownerState;
const cardMap = new Map<string, CardData>([['S1', card('S1')], ['S2', card('S2')], ['S3', card('S3')]]);

console.log('\n[1] INTERNAL_MOVE_TO_BEAT: 場のシグニをビートゾーンへ → beat_became_just に積まれる');
{
  const own = blankState({ field: { ...blankState().field, signi: [['S1'], null, null] } });
  const stub = { type: 'STUB', id: 'INTERNAL_MOVE_TO_BEAT' } as never;
  const o = ownerOf(execStub(stub, ctxOf(own, blankState(), cardMap, { lastProcessedCards: ['S1'] }), dummyExec));
  check('beat_zone に S1', (o.field.beat_zone ?? []).includes('S1'), JSON.stringify(o.field.beat_zone));
  check('beat_became_just に S1', (o.beat_became_just ?? []).includes('S1'), JSON.stringify(o.beat_became_just));
  check('場から除去', o.field.signi[0] === null, JSON.stringify(o.field.signi));
}

console.log('\n[2] TRASH_SIGNI_TO_BEAT: トラッシュのシグニをビートゾーンへ → beat_became_just に積まれる');
{
  const own = blankState({ trash: ['S2', 'S3'] });
  const stub = { type: 'STUB', id: 'TRASH_SIGNI_TO_BEAT' } as never;
  const o = ownerOf(execStub(stub, ctxOf(own, blankState(), cardMap, { lastProcessedCards: ['S2', 'S3'] }), dummyExec));
  check('beat_zone に S2,S3', (o.field.beat_zone ?? []).includes('S2') && (o.field.beat_zone ?? []).includes('S3'), JSON.stringify(o.field.beat_zone));
  check('beat_became_just に S2,S3', (o.beat_became_just ?? []).includes('S2') && (o.beat_became_just ?? []).includes('S3'), JSON.stringify(o.beat_became_just));
  check('トラッシュから除去', !o.trash.includes('S2') && !o.trash.includes('S3'), JSON.stringify(o.trash));
}

console.log(`\n結果: ${pass} pass / ${fail} fail`);
process.exit(fail > 0 ? 1 : 0);
