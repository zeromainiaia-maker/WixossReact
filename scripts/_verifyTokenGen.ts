// トークン生成ロジックの検証ハーネス。
// ① ADD_CARD_TO_LRIG_DECK: アクセクラフト3種をゲーム外生成しルリグデッキへ（WXDi-P09-007）
// ② ADD_CRAFT_TO_LRIG_DECK: クラフトをゲーム外生成しルリグデッキへ（WXK01-042 / WXDi-P16-009）
// ③ PLACE_CARD_UNDER_SIGNI: クラフトをゲーム外生成しシグニの下へ（WX25-CP1-083）
// ④ CRAFT_TO_LRIG_DECK(フェゾーネ): 5種から2種を選びルリグデッキへ（WXDi-P14-006）
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
class InstanceMap<V> extends Map<string, V> {
  override get(id: string): V | undefined {
    if (super.has(id)) return super.get(id);
    const h = id.indexOf('#'); return super.get(h > 0 ? id.slice(0, h) : id);
  }
  override has(id: string): boolean {
    const h = id.indexOf('#'); return super.has(id) || super.has(h > 0 ? id.slice(0, h) : id);
  }
}
function ctxOf(own: PlayerState, cardMap: Map<string, CardData>, sourceCardNum?: string): ExecCtx {
  return { ownerState: own, otherState: blankState(), cardMap, logs: [], sourceCardNum } as unknown as ExecCtx;
}
const card = (over: Partial<CardData>): CardData => ({ CardNum: '', CardName: '', Color: '', Level: '', CardClass: '', Type: 'シグニ', ...over } as CardData);
const dummyExec = (() => ({ done: true })) as unknown as Parameters<typeof execStub>[2];

console.log('\n[1] ADD_CARD_TO_LRIG_DECK: アクセクラフト3種生成（WXDi-P09-007）');
{
  const cardMap = new InstanceMap<CardData>([
    ['WXDi-P09-007', card({ CardNum: 'WXDi-P09-007', CardName: 'メル＝チアーズ', Type: 'ルリグ',
      EffectText: 'あなたのルリグデッキに《コードイート　ケチャチャ》1枚と《コードイート　セアブラマシマシ》1枚と《コードイート　オンタマ》1枚を加える。' })],
    ['WXDi-P09-TK01A', card({ CardNum: 'WXDi-P09-TK01A', CardName: 'コードイート　ケチャチャ', Type: 'シグニ/クラフト' })],
    ['WXDi-P09-TK02A', card({ CardNum: 'WXDi-P09-TK02A', CardName: 'コードイート　セアブラマシマシ', Type: 'シグニ/クラフト' })],
    ['WXDi-P09-TK03A', card({ CardNum: 'WXDi-P09-TK03A', CardName: 'コードイート　オンタマ', Type: 'シグニ/クラフト' })],
  ]);
  const own = blankState();
  const r = execStub({ type: 'STUB', id: 'ADD_CARD_TO_LRIG_DECK' } as never, ctxOf(own, cardMap, 'WXDi-P09-007'), dummyExec);
  const ld = (r as unknown as { ownerState: PlayerState }).ownerState.lrig_deck;
  check('3枚追加', ld.length === 3, JSON.stringify(ld));
  check('ケチャチャ生成', ld.some(n => n.startsWith('WXDi-P09-TK01A#')), JSON.stringify(ld));
  check('オンタマ生成', ld.some(n => n.startsWith('WXDi-P09-TK03A#')), JSON.stringify(ld));
}

console.log('\n[2] ADD_CRAFT_TO_LRIG_DECK: クラフト生成（WXK01-042）');
{
  const cardMap = new InstanceMap<CardData>([
    ['WXK01-042', card({ CardNum: 'WXK01-042', CardName: '幻怪姫 イバラヒメ', Type: 'ルリグ',
      EffectText: 'あなたのルリグデッキに《棘々迷路》1枚を加える。' })],
    ['WXK01-TK-01A', card({ CardNum: 'WXK01-TK-01A', CardName: '棘々迷路', Type: 'アーツ/クラフト' })],
  ]);
  const own = blankState();
  const r = execStub({ type: 'STUB', id: 'ADD_CRAFT_TO_LRIG_DECK' } as never, ctxOf(own, cardMap, 'WXK01-042'), dummyExec);
  const ld = (r as unknown as { ownerState: PlayerState }).ownerState.lrig_deck;
  check('クラフト1枚追加', ld.length === 1 && ld[0].startsWith('WXK01-TK-01A#'), JSON.stringify(ld));
  check('本体カードは追加されない', !ld.some(n => n.startsWith('WXK01-042')), JSON.stringify(ld));
}

console.log('\n[3] PLACE_CARD_UNDER_SIGNI: クラフトをシグニの下へ（WX25-CP1-083）');
{
  const cardMap = new InstanceMap<CardData>([
    ['WX25-CP1-083', card({ CardNum: 'WX25-CP1-083', CardName: '鰐渕アカリ(正月)', Type: 'シグニ',
      EffectText: 'このシグニの下に《給食推進車両》がない場合、クラフトの《給食推進車両》1枚をこのシグニの下に置く。' })],
    ['WX25-CP1-TK2A', card({ CardNum: 'WX25-CP1-TK2A', CardName: '給食推進車両', Type: 'シグニ/クラフト' })],
  ]);
  const own = blankState({ field: { lrig: [], signi: [['WX25-CP1-083#1'], null, null], assist_lrig_l: [], assist_lrig_r: [], check: null, key_piece: null, free_zone: [] } as PlayerState['field'] });
  const r = execStub({ type: 'STUB', id: 'PLACE_CARD_UNDER_SIGNI' } as never, ctxOf(own, cardMap, 'WX25-CP1-083#1'), dummyExec);
  const stack = (r as unknown as { ownerState: PlayerState }).ownerState.field.signi[0]!;
  check('スタック2枚（下にクラフト）', stack.length === 2, JSON.stringify(stack));
  check('下=給食推進車両', stack[0].startsWith('WX25-CP1-TK2A#'), JSON.stringify(stack));
  check('上=本体シグニ', stack[1] === 'WX25-CP1-083#1', JSON.stringify(stack));
}

console.log('\n[4] CRAFT_TO_LRIG_DECK フェゾーネ: 5種→2種選択（WXDi-P14-006）');
{
  const cardMap = new InstanceMap<CardData>([
    ['WXDi-P14-006', card({ CardNum: 'WXDi-P14-006', CardName: '遊月・燦', Type: 'ルリグ',
      EffectText: 'フェゾーネマジックのクラフトから2種類を1枚ずつ公開しルリグデッキに加える。(フェゾーネマジックは5種類から)' })],
    ...(['WXDi-P14-TK01', 'WXDi-P14-TK02', 'WXDi-P14-TK03', 'WXDi-P14-TK04', 'WXDi-P14-TK05']
      .map((n, i) => [n, card({ CardNum: n, CardName: `フェゾーネマジック${i}`, Type: 'スペル/クラフト' })] as [string, CardData])),
  ]);
  const own = blankState();
  const r = execStub({ type: 'STUB', id: 'CRAFT_TO_LRIG_DECK' } as never, ctxOf(own, cardMap, 'WXDi-P14-006'), dummyExec);
  const pend = (r as unknown as { pending?: { type: string; options?: unknown[]; count?: number; multiSelect?: boolean } }).pending;
  check('CHOOSE発行', !!pend && pend.type === 'CHOOSE', JSON.stringify(pend));
  check('5択', pend?.options?.length === 5, `len=${pend?.options?.length}`);
  check('2種選択', pend?.count === 2 && pend?.multiSelect === true, `count=${pend?.count}`);
}

console.log(`\n結果: ${pass} pass / ${fail} fail`);
process.exit(fail > 0 ? 1 : 0);
