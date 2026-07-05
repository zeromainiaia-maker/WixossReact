// LOOK_PICK_CHAIN の 'beat' 宛先（ADD_TO_BEAT）と levelEqLastProcessed（同じレベル）フィルタの検証。WDK14-008。
// ① resumeSearch + thenAction ADD_TO_BEAT＝公開デッキカードを beat_zone へ（beat_became_just＋lastProcessedCards 記録）
// ② executeAction BANISH(levelEqLastProcessed)＝lastProcessedCards と同じレベルの相手シグニのみバニッシュ
import { resumeSearch, executeAction } from '../src/engine/effectExecutor';
import type { ExecCtx } from '../src/engine/effectExecutor';
import type { PlayerState, CardData } from '../src/types';

let pass = 0, fail = 0;
function check(name: string, cond: boolean, extra = '') {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}  ${extra}`); }
}
const card = (num: string, lv: string): CardData =>
  ({ CardNum: num, CardName: num, Color: '赤', Level: lv, CardClass: '悪魔', Type: 'シグニ', Power: '5000' } as CardData);
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
const cardMap = new Map<string, CardData>([
  ['B2', card('B2', '2')], ['X1', card('X1', '1')],
  ['O2', card('O2', '2')], ['O3', card('O3', '3')],
]);
const beatZone = (s: PlayerState) => s.field.beat_zone ?? [];
const becameJust = (s: PlayerState) => s.beat_became_just ?? [];
const oppFieldNums = (s: PlayerState) => s.field.signi.map(z => z?.at(-1) ?? null);

console.log('\n[1] resumeSearch + ADD_TO_BEAT：公開デッキカードを【ビート】に');
{
  const own = blankState({ deck: ['B2', 'X1', 'O3'] });
  const pending = { type: 'SEARCH', visibleCards: ['B2', 'X1', 'O3'], maxPick: 1, thenAction: { type: 'ADD_TO_BEAT', owner: 'self' } } as never;
  const r = resumeSearch(['B2'], pending, ctxOf(own, blankState(), cardMap));
  const o = r.ownerState as PlayerState;
  check('done', r.done);
  check('B2 が beat_zone へ', beatZone(o).includes('B2'), JSON.stringify(beatZone(o)));
  check('B2 が beat_became_just に', becameJust(o).includes('B2'));
  check('B2 がデッキから除去', !o.deck.includes('B2'), JSON.stringify(o.deck));
  check('lastProcessedCards=[B2]', JSON.stringify(r.lastProcessedCards) === JSON.stringify(['B2']), JSON.stringify(r.lastProcessedCards));
}

console.log('\n[2] BANISH(levelEqLastProcessed)：候補が「同じレベル(Lv2)の相手シグニ」だけに絞られる');
{
  const own = blankState();
  const opp = blankState({ field: { ...blankState().field, signi: [['O2'], ['O3'], null] } });
  const banish = { type: 'BANISH', target: { type: 'SIGNI', owner: 'opponent', count: 1, upToCount: false, filter: { cardType: 'シグニ', levelEqLastProcessed: true } } } as never;
  const r = executeAction(banish, ctxOf(own, opp, cardMap, { lastProcessedCards: ['B2'] }));
  // 相手フィールドへのバニッシュは対象選択（SELECT_TARGET）で一旦止まる。候補が Lv2 のみに絞られていることを確認。
  const pending = (r as { done: boolean; pending?: { candidates?: string[] } }).pending;
  check('SELECT_TARGET で停止', !r.done && !!pending);
  check('候補は O2(Lv2) のみ・O3(Lv3) は除外', JSON.stringify(pending?.candidates) === JSON.stringify(['O2']), JSON.stringify(pending?.candidates));
}

console.log('\n[3] BANISH(levelEqLastProcessed)：同じレベルの相手シグニがいなければ何もしない');
{
  const own = blankState();
  const opp = blankState({ field: { ...blankState().field, signi: [['O3'], null, null] } });
  const banish = { type: 'BANISH', target: { type: 'SIGNI', owner: 'opponent', count: 1, upToCount: false, filter: { cardType: 'シグニ', levelEqLastProcessed: true } } } as never;
  const r = executeAction(banish, ctxOf(own, opp, cardMap, { lastProcessedCards: ['B2'] }));
  check('done', r.done);
  check('O3(Lv3) は残る', oppFieldNums(r.otherState as PlayerState).includes('O3'));
}

console.log(`\n結果: ${pass} pass / ${fail} fail`);
process.exit(fail > 0 ? 1 : 0);
