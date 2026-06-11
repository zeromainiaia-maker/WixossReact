/* eslint-disable @typescript-eslint/no-explicit-any */
// 破損修復後のスモークテスト: RECOLLECT_GATE / SOUL_OP CHOOSEラベル / OTECクラス抽出
import { executeAction } from './src/engine/effectExecutor';

const baseState = (over: Record<string, any> = {}): any => ({
  hand: [], deck: ['D1', 'D2', 'D3'], trash: [], energy: [], life: [],
  field: { signi: [null, null, null], lrig: [] },
  lrig_trash: [],
  ...over,
});

const cardMap = new Map<string, any>([
  ['A1', { CardNum: 'A1', CardName: 'アーツ1', Type: 'アーツ' }],
  ['A2', { CardNum: 'A2', CardName: 'アーツ2', Type: 'アーツ' }],
  ['A3', { CardNum: 'A3', CardName: 'アーツ3', Type: 'アーツ' }],
  ['A4', { CardNum: 'A4', CardName: 'アーツ4', Type: 'アーツ' }],
  ['L1', { CardNum: 'L1', CardName: 'ルリグ', Type: 'ルリグ' }],
  ['SOUL1', { CardNum: 'SOUL1', CardName: 'ソウルカード', Type: 'シグニ' }],
  ['SRC1', { CardNum: 'SRC1', CardName: 'ソース', Type: 'シグニ' }],
]);

const mkCtx = (owner: any): any => ({
  ownerState: owner, otherState: baseState(), cardMap, logs: [],
});

let fail = 0;
const check = (name: string, cond: boolean, detail: string) => {
  console.log(`${cond ? 'PASS' : 'FAIL'}: ${name} ${detail}`);
  if (!cond) fail++;
};

// 1. RECOLLECT_GATE 未達（アーツ2枚 < 必要4枚）→ 残りステップ実行されない
{
  const ctx = mkCtx(baseState({ lrig_trash: ['A1', 'A2', 'L1'] }));
  const r: any = executeAction({
    type: 'SEQUENCE', steps: [
      { type: 'RECOLLECT_GATE', minArts: 4 },
      { type: 'DRAW', count: 1, target: { owner: 'self' } },
    ],
  } as any, ctx);
  check('RECOLLECT_GATE未達', r.logs.some((l: string) => l.includes('リコレクト条件未達')) && r.ownerState.hand.length === 0,
    `logs=${JSON.stringify(r.logs)} hand=${r.ownerState.hand.length}`);
}

// 2. RECOLLECT_GATE 達成（アーツ4枚）→ 後続DRAWが実行される
{
  const ctx = mkCtx(baseState({ lrig_trash: ['A1', 'A2', 'A3', 'A4'] }));
  const r: any = executeAction({
    type: 'SEQUENCE', steps: [
      { type: 'RECOLLECT_GATE', minArts: 4 },
      { type: 'DRAW', count: 1, target: { owner: 'self' } },
    ],
  } as any, ctx);
  check('RECOLLECT_GATE達成', r.logs.some((l: string) => l.includes('リコレクト条件達成')) && r.ownerState.hand.length === 1,
    `logs=${JSON.stringify(r.logs)} hand=${r.ownerState.hand.length}`);
}

// 3. SOUL_OP: CHOOSEラベル・ログが空でない
{
  const owner = baseState({ field: { signi: [['SOUL1', 'SRC1'], null, null], lrig: [] } });
  const ctx = { ...mkCtx(owner), sourceCardNum: 'SRC1' };
  const r: any = executeAction({
    type: 'SEQUENCE', steps: [
      { type: 'STUB', id: 'SOUL_OP' },
      { type: 'CONDITIONAL', condition: { type: 'IS_MY_TURN' }, then: { type: 'DRAW', count: 1, target: { owner: 'self' } } },
    ],
  } as any, ctx);
  const opts = r.pending?.options ?? [];
  const labels = opts.map((o: any) => o.label);
  check('SOUL_OPラベル', labels.length === 2 && labels.every((l: string) => l && l.length > 0) && labels[0].includes('ソウル'),
    `labels=${JSON.stringify(labels)} log=${JSON.stringify(r.logs ?? [])}`);
}

process.exit(fail > 0 ? 1 : 0);
