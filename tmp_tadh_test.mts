/* eslint-disable @typescript-eslint/no-explicit-any */
// TARGET_AND_DISCARD_HAND 二重実行バグ修正の検証
import { executeAction } from './src/engine/effectExecutor';

const baseState = (over: Record<string, any> = {}): any => ({
  hand: ['H1', 'H2'], deck: ['D1', 'D2', 'D3'], trash: [], energy: [], life: [],
  field: { signi: [null, null, null], lrig: [] },
  lrig_trash: [],
  ...over,
});

const cardMap = new Map<string, any>([
  ['MYSIG', { CardNum: 'MYSIG', CardName: '自分シグニ', Type: 'シグニ' }],
  ['OPPSIG', { CardNum: 'OPPSIG', CardName: '相手シグニ', Type: 'シグニ' }],
]);

let fail = 0;
const check = (name: string, cond: boolean, detail: string) => {
  console.log(`${cond ? 'PASS' : 'FAIL'}: ${name} ${detail}`);
  if (!cond) fail++;
};

// 1. TADH + CONDITIONAL(IS_MY_TURN)→BANISH(owner:self):
//    thenAction が owner:opponent に修正され、CONDITIONAL は continuation に素通しされない
{
  const ctx: any = {
    ownerState: baseState({ field: { signi: [['MYSIG'], null, null], lrig: [] } }),
    otherState: baseState({ field: { signi: [['OPPSIG'], null, null], lrig: [] } }),
    cardMap, logs: [],
  };
  const r: any = executeAction({
    type: 'SEQUENCE', steps: [
      { type: 'STUB', id: 'TARGET_AND_DISCARD_HAND' },
      { type: 'CONDITIONAL', condition: { type: 'IS_MY_TURN' }, then: { type: 'BANISH', target: { type: 'SIGNI', owner: 'self', count: 1 } } },
    ],
  } as any, ctx);
  const p = r.pending;
  const contStr = JSON.stringify(p?.continuation ?? null);
  check('TADH owner修正', p?.type === 'SELECT_TARGET' && p?.thenAction?.type === 'BANISH' && p?.thenAction?.target?.owner === 'opponent',
    `thenAction=${JSON.stringify(p?.thenAction)}`);
  check('TADH CONDITIONAL消費', !contStr.includes('CONDITIONAL') && contStr.includes('TRASH'),
    `continuation=${contStr}`);
  check('TADH 候補は相手のみ', JSON.stringify(p?.candidates) === '["OPPSIG"]', `cands=${JSON.stringify(p?.candidates)}`);
}

// 2. TADH + CONDITIONAL→SEQUENCE[DOWN,FREEZE]（WX12-017型）: SEQUENCE内のownerも修正される
{
  const ctx: any = {
    ownerState: baseState({ field: { signi: [['MYSIG'], null, null], lrig: [] } }),
    otherState: baseState({ field: { signi: [['OPPSIG'], null, null], lrig: [] } }),
    cardMap, logs: [],
  };
  const r: any = executeAction({
    type: 'SEQUENCE', steps: [
      { type: 'STUB', id: 'TARGET_AND_DISCARD_HAND' },
      { type: 'CONDITIONAL', condition: { type: 'IS_MY_TURN' }, then: { type: 'SEQUENCE', steps: [
        { type: 'DOWN', target: { type: 'SIGNI', owner: 'self', count: 1 } },
        { type: 'FREEZE', target: { type: 'SIGNI', owner: 'self', count: 1 } },
      ] } },
    ],
  } as any, ctx);
  const p = r.pending;
  const owners = (p?.thenAction?.steps ?? []).map((s: any) => s.target?.owner);
  check('TADH SEQUENCE内owner修正', p?.thenAction?.type === 'SEQUENCE' && JSON.stringify(owners) === '["opponent","opponent"]',
    `thenAction=${JSON.stringify(p?.thenAction)}`);
}

// 3. CONDITIONAL なし（STUB後続等）: 従来どおりBANISHハードコード
{
  const ctx: any = {
    ownerState: baseState(),
    otherState: baseState({ field: { signi: [['OPPSIG'], null, null], lrig: [] } }),
    cardMap, logs: [],
  };
  const r: any = executeAction({
    type: 'SEQUENCE', steps: [
      { type: 'STUB', id: 'TARGET_AND_DISCARD_HAND' },
    ],
  } as any, ctx);
  const p = r.pending;
  check('TADH 単独はBANISH既定', p?.thenAction?.type === 'BANISH' && p?.thenAction?.target?.owner === 'opponent',
    `thenAction=${JSON.stringify(p?.thenAction)}`);
}

process.exit(fail > 0 ? 1 : 0);
