// 落華流粋(WXK03-TK-01B) / カーニバル†MAIS†(WXK03-002) 修正の検証ハーネス（tsx 実行）。
// ① CONDITIONAL_MULTI_CHOOSE_BY_CENTER: センター条件で最大選択数が 1/2 に切り替わる
// ② DECLARED_NAME_TO_SERVANT_ZERO value:'field': 相手の「場」のカードのみ ZERO 化
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
    coins: 0,
    ...over,
  } as unknown as PlayerState;
}
function ctxOf(own: PlayerState, oth: PlayerState, cardMap: Map<string, CardData>, sourceCardNum?: string): ExecCtx {
  return { ownerState: own, otherState: oth, cardMap, logs: [], sourceCardNum } as unknown as ExecCtx;
}
const card = (over: Partial<CardData>): CardData => ({ CardNum: '', CardName: '', Color: '', Level: '', CardClass: '', Type: 'シグニ', ...over } as CardData);
const dummyExec = (() => ({ done: true })) as unknown as Parameters<typeof execStub>[2];

const RAKKA_TEXT = '以下の４つから１つを選ぶ。あなたのセンタールリグが＜リル＞か＜メル＞の場合、代わりに２つまで選ぶ。①対戦相手のパワー12000以下のシグニ１体を対象とし、それをバニッシュする。②対戦相手のパワー12000以上のシグニ１体を対象とし、それをバニッシュする。③あなたのシグニ１体を対象とし、ターン終了時まで、それは【ダブルクラッシュ】を得る。④あなたのデッキの一番上のカードをライフクロスに加える。手札を２枚捨てる。';

console.log('\n[1] CONDITIONAL_MULTI_CHOOSE_BY_CENTER（最大選択数の切替）');
{
  const cardMap = new Map<string, CardData>([
    ['WXK03-TK-01B', card({ CardNum: 'WXK03-TK-01B', CardName: '落華流粋', Type: 'アーツ/クラフト', EffectText: RAKKA_TEXT })],
    ['MEL', card({ CardNum: 'MEL', CardName: 'メル', Type: 'ルリグ' })],
    ['OTHER', card({ CardNum: 'OTHER', CardName: 'タマ', Type: 'ルリグ' })],
  ]);
  // センター=タマ → ベース1択
  const own1 = blankState({ field: { lrig: ['OTHER'], signi: [null, null, null], assist_lrig_l: [], assist_lrig_r: [], check: null, key_piece: null, free_zone: [] } as PlayerState['field'] });
  const r1 = execStub({ type: 'STUB', id: 'CONDITIONAL_MULTI_CHOOSE_BY_CENTER' } as never, ctxOf(own1, blankState(), cardMap, 'WXK03-TK-01B'), dummyExec);
  const pend1 = (r1 as unknown as { pending?: { type: string; options?: unknown[]; count?: number } }).pending;
  check('CHOOSE発行', !!pend1 && pend1.type === 'CHOOSE');
  check('4選択肢', pend1?.options?.length === 4, JSON.stringify(pend1?.options?.length));
  check('タマ=ベース1択', pend1?.count === 1, `count=${pend1?.count}`);
  // センター=メル → 2択
  const own2 = blankState({ field: { lrig: ['MEL'], signi: [null, null, null], assist_lrig_l: [], assist_lrig_r: [], check: null, key_piece: null, free_zone: [] } as PlayerState['field'] });
  const r2 = execStub({ type: 'STUB', id: 'CONDITIONAL_MULTI_CHOOSE_BY_CENTER' } as never, ctxOf(own2, blankState(), cardMap, 'WXK03-TK-01B'), dummyExec);
  const pend2 = (r2 as unknown as { pending?: { count?: number } }).pending;
  check('メル=2択', pend2?.count === 2, `count=${pend2?.count}`);
}

console.log('\n[2] DECLARED_NAME_TO_SERVANT_ZERO value:field（場のみ）');
{
  const cardMap = new Map<string, CardData>([
    ['TGT#1', card({ CardNum: 'TGT', CardName: '謎のシグニ' })],
    ['TGT#2', card({ CardNum: 'TGT', CardName: '謎のシグニ' })],
    ['WXDi-P07-TK01-A', card({ CardNum: 'WXDi-P07-TK01-A', CardName: 'サーバント　ZERO' })],
  ]);
  const own = blankState({ declared_card_name: '謎のシグニ' } as Partial<PlayerState>);
  // 相手: 場に TGT#1、手札に TGT#2
  const oth = blankState({
    hand: ['TGT#2'],
    field: { lrig: [], signi: [['TGT#1'], null, null], assist_lrig_l: [], assist_lrig_r: [], check: null, key_piece: null, free_zone: [] } as PlayerState['field'],
  });
  const r = execStub({ type: 'STUB', id: 'DECLARED_NAME_TO_SERVANT_ZERO', value: 'field' } as never, ctxOf(own, oth, cardMap, 'WXK03-002'), dummyExec);
  const ov = (r as unknown as { otherState: PlayerState }).otherState.card_identity_overrides ?? {};
  check('場のTGT#1がZERO化', ov['TGT#1'] === 'WXDi-P07-TK01-A', JSON.stringify(ov));
  check('手札のTGT#2は非対象', ov['TGT#2'] === undefined, JSON.stringify(ov));

  // value未指定（全領域）では手札も対象
  const r2 = execStub({ type: 'STUB', id: 'DECLARED_NAME_TO_SERVANT_ZERO' } as never, ctxOf(own, oth, cardMap, 'WXEX2-10'), dummyExec);
  const ov2 = (r2 as unknown as { otherState: PlayerState }).otherState.card_identity_overrides ?? {};
  check('全領域モードでは手札TGT#2もZERO化', ov2['TGT#2'] === 'WXDi-P07-TK01-A', JSON.stringify(ov2));
}

console.log(`\n結果: ${pass} pass / ${fail} fail`);
process.exit(fail > 0 ? 1 : 0);
