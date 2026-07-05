// 傀儡場出しの汎用化（STEAL_OPP_TRASH_PUPPET の count/optional/levelLteTrigger 対応）検証ハーネス。
// WXK10-055-E2（バトルバニッシュ時：そのシグニのレベル以下の相手トラッシュシグニを傀儡で出してもよい）/ BURST（必須・1枚）。
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
function ctxOf(own: PlayerState, oth: PlayerState, cardMap: Map<string, CardData>, over: Partial<ExecCtx> = {}): ExecCtx {
  return { ownerState: own, otherState: oth, cardMap, logs: [], ...over } as unknown as ExecCtx;
}
const card = (over: Partial<CardData>): CardData => ({ CardNum: '', CardName: '', Color: '', Level: '', CardClass: '', Type: 'シグニ', Power: '', ...over } as CardData);
const dummyExec = (() => ({ done: true })) as unknown as Parameters<typeof execStub>[2];

const cardMap = new Map<string, CardData>([
  ['LV1', card({ CardNum: 'LV1', CardName: 'レベル1シグニ', Level: '1' })],
  ['LV2', card({ CardNum: 'LV2', CardName: 'レベル2シグニ', Level: '2' })],
  ['LV3', card({ CardNum: 'LV3', CardName: 'レベル3シグニ', Level: '3' })],
  ['LV4', card({ CardNum: 'LV4', CardName: 'レベル4シグニ', Level: '4' })],
  ['BANISHED-LV2', card({ CardNum: 'BANISHED-LV2', CardName: 'バニッシュされたシグニ', Level: '2' })],
  ['SPELL', card({ CardNum: 'SPELL', CardName: 'スペル', Type: 'スペル' })],
]);

type PendRes = { pending?: { type: string; candidates: string[]; count: number; optional?: boolean } };
const pendOf = (r: unknown): PendRes['pending'] => (r as PendRes).pending;

console.log('\n[1] levelLteTrigger: バニッシュしたシグニ(Lv2)以下のみ候補（LV1/LV2/BANISHED-LV2 のみ、LV3/LV4 除外）');
{
  const own = blankState({ field: { ...blankState().field, signi: [null, null, null] } });
  const oth = blankState({ trash: ['LV1', 'LV2', 'LV3', 'LV4', 'SPELL'] });
  const stub = { type: 'STUB', id: 'STEAL_OPP_TRASH_PUPPET', puppetParams: { count: 1, optional: true, levelLteTrigger: true } } as never;
  const p = pendOf(execStub(stub, ctxOf(own, oth, cardMap, { triggeringCardNum: 'BANISHED-LV2' }), dummyExec));
  check('SELECT_TARGET が出る', p?.type === 'SELECT_TARGET', JSON.stringify(p));
  check('候補は Lv2 以下のシグニのみ', JSON.stringify((p?.candidates ?? []).sort()) === JSON.stringify(['LV1', 'LV2'].sort()), JSON.stringify(p?.candidates));
  check('count=1', p?.count === 1, String(p?.count));
  check('optional=true（出してもよい）', p?.optional === true, String(p?.optional));
}

console.log('\n[2] BURST（puppetParams.count:1・optional無し）: 必須・レベル制限なし・全シグニ候補');
{
  const own = blankState({ field: { ...blankState().field, signi: [null, null, null] } });
  const oth = blankState({ trash: ['LV1', 'LV3', 'LV4', 'SPELL'] });
  const stub = { type: 'STUB', id: 'STEAL_OPP_TRASH_PUPPET', puppetParams: { count: 1 } } as never;
  const p = pendOf(execStub(stub, ctxOf(own, oth, cardMap, {}), dummyExec));
  check('候補は相手トラッシュのシグニ全て（スペル除外）', JSON.stringify((p?.candidates ?? []).sort()) === JSON.stringify(['LV1', 'LV3', 'LV4'].sort()), JSON.stringify(p?.candidates));
  check('count=1', p?.count === 1, String(p?.count));
  check('optional=false（必須）', !p?.optional, String(p?.optional));
}

console.log('\n[3] levelLteTrigger で該当なし（バニッシュLv1・相手トラッシュは Lv3/Lv4 のみ）→ 出せない（pending なし）');
{
  const own = blankState({ field: { ...blankState().field, signi: [null, null, null] } });
  const oth = blankState({ trash: ['LV3', 'LV4'] });
  const stub = { type: 'STUB', id: 'STEAL_OPP_TRASH_PUPPET', puppetParams: { count: 1, optional: true, levelLteTrigger: true } } as never;
  const lv1 = card({ CardNum: 'BLV1', Level: '1' });
  cardMap.set('BLV1', lv1);
  const r = execStub(stub, ctxOf(own, oth, cardMap, { triggeringCardNum: 'BLV1' }), dummyExec);
  check('インタラクション不要（候補なしで done）', (r as { done: boolean }).done === true, JSON.stringify(r));
}

console.log(`\n結果: ${pass} pass / ${fail} fail`);
process.exit(fail > 0 ? 1 : 0);
