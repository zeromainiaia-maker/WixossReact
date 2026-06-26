// 【ビート】条件評価（checkBeatCondition）と activeCondition 経路（checkActiveCondition）の検証ハーネス。
import { checkBeatCondition, checkActiveCondition } from '../src/engine/effectEngine';
import type { PlayerState, CardData } from '../src/types';

let pass = 0, fail = 0;
function check(name: string, cond: boolean, extra = '') {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}  ${extra}`); }
}
const card = (num: string, lv: string): CardData => ({ CardNum: num, CardName: num, Color: '赤', Level: lv, CardClass: '悪魔', Type: 'シグニ', Power: '5000' } as CardData);
const cardMap = new Map<string, CardData>([
  ['L1a', card('L1a', '1')], ['L1b', card('L1b', '1')],
  ['L2a', card('L2a', '2')], ['L2b', card('L2b', '2')],
  ['L3a', card('L3a', '3')], ['L3b', card('L3b', '3')], ['L3c', card('L3c', '3')], ['L3d', card('L3d', '3')],
  ['L4a', card('L4a', '4')],
]);

console.log('\n[1] 枚数条件');
check('1枚以上：1枚→true', checkBeatCondition(['L1a'], '１枚以上', cardMap));
check('1枚以上：0枚→false', !checkBeatCondition([], '１枚以上', cardMap));
check('4枚以下：4枚→true', checkBeatCondition(['L1a', 'L1b', 'L2a', 'L2b'], '４枚以下', cardMap));
check('4枚以下：5枚→false', !checkBeatCondition(['L1a', 'L1b', 'L2a', 'L2b', 'L3a'], '４枚以下', cardMap));
check('7枚以上：6枚→false', !checkBeatCondition(['L1a', 'L1b', 'L2a', 'L2b', 'L3a', 'L3b'], '７枚以上', cardMap));

console.log('\n[2] レベル条件');
check('レベル3以上が4枚以上：L3×4→true', checkBeatCondition(['L3a', 'L3b', 'L3c', 'L3d'], 'レベル３以上が４枚以上', cardMap));
check('レベル3以上が4枚以上：L3×3+L1→false', !checkBeatCondition(['L3a', 'L3b', 'L3c', 'L1a'], 'レベル３以上が４枚以上', cardMap));
check('レベル1～4が各1枚以上：L1L2L3L4→true', checkBeatCondition(['L1a', 'L2a', 'L3a', 'L4a'], 'レベル１～４が各１枚以上', cardMap));
check('レベル1～4が各1枚以上：L3欠け→false', !checkBeatCondition(['L1a', 'L2a', 'L4a'], 'レベル１～４が各１枚以上', cardMap));
check('レベル1、2が各1枚以上：L1L2→true', checkBeatCondition(['L1a', 'L2a'], 'レベル１、２が各１枚以上', cardMap));
check('レベル1、2が各1枚以上：L1のみ→false', !checkBeatCondition(['L1a', 'L1b'], 'レベル１、２が各１枚以上', cardMap));

console.log('\n[3] 新パターン：同じレベルがN枚以上');
check('同じレベルが4枚以上：L3×4→true', checkBeatCondition(['L3a', 'L3b', 'L3c', 'L3d'], '同じレベルが４枚以上', cardMap));
check('同じレベルが4枚以上：L3×3+L1→false', !checkBeatCondition(['L3a', 'L3b', 'L3c', 'L1a'], '同じレベルが４枚以上', cardMap));
check('同じレベルが4枚以上：L1L1L2L2→false', !checkBeatCondition(['L1a', 'L1b', 'L2a', 'L2b'], '同じレベルが４枚以上', cardMap));

console.log('\n[4] activeCondition 経路（CONTINUOUS 常《ビート》）');
const mkState = (beat: string[]): PlayerState => ({ field: { signi: [null, null, null], lrig: [], assist_lrig_l: [], assist_lrig_r: [], check: null, key_piece: null, free_zone: [], beat_zone: beat } } as unknown as PlayerState);
const empty = mkState([]);
check('BEAT_CONDITION activeCond：1枚以上で beat1→true',
  checkActiveCondition({ type: 'BEAT_CONDITION', condText: '１枚以上' } as never, mkState(['L1a']), empty, true, cardMap));
check('BEAT_CONDITION activeCond：1枚以上で beat0→false',
  !checkActiveCondition({ type: 'BEAT_CONDITION', condText: '１枚以上' } as never, mkState([]), empty, true, cardMap));

console.log(`\n結果: ${pass} pass / ${fail} fail`);
process.exit(fail > 0 ? 1 : 0);
