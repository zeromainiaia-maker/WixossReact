// 《ビートアイコン》[N枚以下]使用ゲート（コスト型【出】/【起】）の検証。
// JSON 配線（condition: BEAT_CONDITION[４枚以下]）が evalUseCondition で正しく開閉するかを確認。
// 実際の収集ゲート（BattleScreen ownCostOnPlay / activatable）はこの evalUseCondition を呼ぶため、ここが真であることが前提。
import { evalUseCondition } from '../src/engine/effectExecutor';
import type { PlayerState, CardData, Condition } from '../src/types';

let pass = 0, fail = 0;
function check(name: string, cond: boolean, extra = '') {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}  ${extra}`); }
}
const card = (n: string): CardData => ({ CardNum: n, CardName: n, Color: '赤', Level: '2', CardClass: '悪魔', Type: 'シグニ', Power: '5000' } as CardData);
function stateWithBeats(n: number): PlayerState {
  const beats = Array.from({ length: n }, (_, i) => `B${i}`);
  return { field: { lrig: [], signi: [null, null, null], assist_lrig_l: [], assist_lrig_r: [], check: null, key_piece: null, free_zone: [], beat_zone: beats } } as unknown as PlayerState;
}
const cardMap = new Map<string, CardData>(Array.from({ length: 8 }, (_, i) => [`B${i}`, card(`B${i}`)]));
const empty = stateWithBeats(0);
const gate: Condition = { type: 'BEAT_CONDITION', condText: '４枚以下' } as Condition;
const call = (n: number) => evalUseCondition(gate, stateWithBeats(n), empty, cardMap, 'SRC', 'MAIN');

console.log('\n[1] 《ビート》[４枚以下]ゲート：0〜4枚は使用可、5枚以上は使用不可');
check('0枚→可', call(0));
check('4枚→可（境界）', call(4));
check('5枚→不可（境界）', !call(5), 'beat5 should fail');
check('6枚→不可', !call(6));

console.log('\n[2] 反対の [５枚以上]（自【自】側で使うゲート）も整合');
const gate5: Condition = { type: 'BEAT_CONDITION', condText: '５枚以上' } as Condition;
check('5枚→可', evalUseCondition(gate5, stateWithBeats(5), empty, cardMap, 'SRC', 'MAIN'));
check('4枚→不可', !evalUseCondition(gate5, stateWithBeats(4), empty, cardMap, 'SRC', 'MAIN'));

console.log(`\n結果: ${pass} pass / ${fail} fail`);
process.exit(fail > 0 ? 1 : 0);
