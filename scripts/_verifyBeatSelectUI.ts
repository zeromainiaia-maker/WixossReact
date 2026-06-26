// beat対象のプレイヤー選択：analyzeBeatSigniCost（候補解析）と payBeatSigniCost(selectedOtherZones)（明示選択）の検証。
// UI(React)は実機検証だが、エンジン側の「選んだゾーンを beat にする／未指定は自動近似」を確認する。
import { analyzeBeatSigniCost, payBeatSigniCost } from '../src/engine/effectExecutor';
import type { PlayerState, CardData } from '../src/types';

let pass = 0, fail = 0;
function check(name: string, cond: boolean, extra = '') {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}  ${extra}`); }
}
const card = (num: string, lv: string, text = ''): CardData =>
  ({ CardNum: num, CardName: num, Color: '赤', Level: lv, CardClass: '悪魔', Type: 'シグニ', Power: '5000', EffectText: text } as CardData);
function blankState(over: Partial<PlayerState> = {}): PlayerState {
  return {
    deck: [], hand: [], energy: [], trash: [], lrig_trash: [], lrig_deck: [], life_cloth: [],
    field: { lrig: [], signi: [null, null, null], assist_lrig_l: [], assist_lrig_r: [], check: null, key_piece: null, free_zone: [], beat_zone: [] },
    coins: 0, ...over,
  } as unknown as PlayerState;
}
const beatZone = (s: PlayerState) => s.field.beat_zone ?? [];

console.log('\n[1] analyzeBeatSigniCost：「他のシグニ1体」＝includeSelf=false, otherPart=1, 候補は自身以外');
{
  const cm = new Map([
    ['SRC', card('SRC', '4', '他のシグニ１体を【ビート】にする：カードを１枚引く。')],
    ['LO', card('LO', '1')], ['HI', card('HI', '3')],
  ]);
  // zone0=SRC(self), zone1=HI(lv3), zone2=LO(lv1)
  const st = blankState({ field: { ...blankState().field, signi: [['SRC'], ['HI'], ['LO']] } });
  const a = analyzeBeatSigniCost(st, 'SRC', cm, 1);
  check('includeSelf=false', a.includeSelf === false);
  check('otherPart=1', a.otherPart === 1);
  check('selfZone=0', a.selfZone === 0);
  check('eligibleOtherZones=[1,2]（自身zone0を除く）', JSON.stringify(a.eligibleOtherZones) === JSON.stringify([1, 2]), JSON.stringify(a.eligibleOtherZones));
}

console.log('\n[2] payBeatSigniCost(selectedOtherZones=[1])：自動近似(レベル低いLO)ではなくHIを選べる');
{
  const cm = new Map([
    ['SRC', card('SRC', '4', '他のシグニ１体を【ビート】にする：カードを１枚引く。')],
    ['LO', card('LO', '1')], ['HI', card('HI', '3')],
  ]);
  const st = blankState({ field: { ...blankState().field, signi: [['SRC'], ['HI'], ['LO']] } });
  const r = payBeatSigniCost(st, 'SRC', cm, 1, [1]); // zone1=HI を明示選択
  check('ok', r.ok);
  check('HI が beat に（プレイヤー選択尊重）', beatZone(r.state).includes('HI') && !beatZone(r.state).includes('LO'), JSON.stringify(beatZone(r.state)));
}

console.log('\n[3] payBeatSigniCost(未指定)：従来どおりレベル低い順(LO)の自動近似');
{
  const cm = new Map([
    ['SRC', card('SRC', '4', '他のシグニ１体を【ビート】にする：カードを１枚引く。')],
    ['LO', card('LO', '1')], ['HI', card('HI', '3')],
  ]);
  const st = blankState({ field: { ...blankState().field, signi: [['SRC'], ['HI'], ['LO']] } });
  const r = payBeatSigniCost(st, 'SRC', cm, 1); // 未指定
  check('ok', r.ok);
  check('LO(低レベル) が beat に（自動近似）', beatZone(r.state).includes('LO') && !beatZone(r.state).includes('HI'), JSON.stringify(beatZone(r.state)));
}

console.log('\n[4] 「このシグニと他のシグニ1体」：self自動＋選んだ他1体（zone2）');
{
  const cm = new Map([
    ['SRC', card('SRC', '4', 'このシグニと他のシグニ１体を【ビート】にする：対戦相手のシグニ１体をバニッシュする。')],
    ['A', card('A', '1')], ['B', card('B', '2')],
  ]);
  const st = blankState({ field: { ...blankState().field, signi: [['SRC'], ['A'], ['B']] } });
  const a = analyzeBeatSigniCost(st, 'SRC', cm, 1);
  check('includeSelf=true', a.includeSelf === true);
  check('otherPart=1', a.otherPart === 1);
  const r = payBeatSigniCost(st, 'SRC', cm, 1, [2]); // zone2=B を選択
  check('SRC(self)とB(選択)が beat・Aは残る', beatZone(r.state).includes('SRC') && beatZone(r.state).includes('B') && !beatZone(r.state).includes('A'), JSON.stringify(beatZone(r.state)));
}

console.log('\n[5] 候補≤必要数は選択不要（UI非表示の判定材料）：他候補1体・otherPart1');
{
  const cm = new Map([
    ['SRC', card('SRC', '4', '他のシグニ１体を【ビート】にする：カードを１枚引く。')],
    ['ONLY', card('ONLY', '2')],
  ]);
  const st = blankState({ field: { ...blankState().field, signi: [['SRC'], ['ONLY'], null] } });
  const a = analyzeBeatSigniCost(st, 'SRC', cm, 1);
  check('eligibleOtherZones.length(1) == otherPart(1) → 選択不要', a.eligibleOtherZones.length === a.otherPart);
}

console.log(`\n結果: ${pass} pass / ${fail} fail`);
process.exit(fail > 0 ? 1 : 0);
