// cost.beat_signi の支払い（payBeatSigniCost）検証。テキストから このシグニ/他の/以外/任意/N体 を導出し
// 対象シグニを beat_zone へ移動＋beat_became_just に積む（ON_BECOME_BEAT 用）。
import { payBeatSigniCost } from '../src/engine/effectExecutor';
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
const becameJust = (s: PlayerState) => s.beat_became_just ?? [];
const fieldNums = (s: PlayerState) => s.field.signi.map(z => z?.at(-1) ?? null);

console.log('\n[1] このシグニを【ビート】にする（self のみ）');
{
  const cm = new Map([['SELF', card('SELF', '3', 'このシグニを【ビート】にする：カードを１枚引く。')], ['O1', card('O1', '1')]]);
  const st = blankState({ field: { ...blankState().field, signi: [['SELF'], ['O1'], null] } });
  const r = payBeatSigniCost(st, 'SELF', cm, 1);
  check('ok', r.ok);
  check('SELF が beat_zone へ', beatZone(r.state).includes('SELF') && !beatZone(r.state).includes('O1'), JSON.stringify(beatZone(r.state)));
  check('SELF が場から除去', fieldNums(r.state)[0] === null, JSON.stringify(fieldNums(r.state)));
  check('beat_became_just に SELF', becameJust(r.state).includes('SELF'));
}

console.log('\n[2] 他のシグニ１体を【ビート】にする（excludeSelf・レベル低い順）');
{
  const cm = new Map([['SRC', card('SRC', '4', '他のシグニ１体を【ビート】にする：カードを１枚引く。')], ['LO', card('LO', '1')], ['HI', card('HI', '3')]]);
  const st = blankState({ field: { ...blankState().field, signi: [['SRC'], ['HI'], ['LO']] } });
  const r = payBeatSigniCost(st, 'SRC', cm, 1);
  check('ok', r.ok);
  check('SRC は beat にならない', !beatZone(r.state).includes('SRC'), JSON.stringify(beatZone(r.state)));
  check('レベル低い LO を選ぶ', beatZone(r.state).includes('LO') && !beatZone(r.state).includes('HI'), JSON.stringify(beatZone(r.state)));
}

console.log('\n[3] このシグニと他のシグニ１体を【ビート】にする（self＋他1体＝2体・beat_signi=1でも）');
{
  const cm = new Map([['SRC', card('SRC', '4', 'このシグニと他のシグニ１体を【ビート】にする：対戦相手のシグニ１体をバニッシュする。')], ['Ox', card('Ox', '2')]]);
  const st = blankState({ field: { ...blankState().field, signi: [['SRC'], ['Ox'], null] } });
  const r = payBeatSigniCost(st, 'SRC', cm, 1);
  check('ok', r.ok);
  check('SRC と Ox の両方が beat へ', beatZone(r.state).includes('SRC') && beatZone(r.state).includes('Ox'), JSON.stringify(beatZone(r.state)));
  check('moved 2枚', r.moved.length === 2, JSON.stringify(r.moved));
}

console.log('\n[4] 支払い不能：他のシグニが必要だが自身しかいない');
{
  const cm = new Map([['ONLY', card('ONLY', '2', '他のシグニ１体を【ビート】にする：カードを１枚引く。')]]);
  const st = blankState({ field: { ...blankState().field, signi: [['ONLY'], null, null] } });
  const r = payBeatSigniCost(st, 'ONLY', cm, 1);
  check('ok=false（対象不足）', !r.ok);
  check('状態不変', beatZone(r.state).length === 0);
}

console.log('\n[5] シグニ１体を【ビート】にする（ルリグ起動・任意の場シグニ）');
{
  const cm = new Map([['LRIG', { CardNum: 'LRIG', CardName: 'LRIG', Type: 'ルリグ', Level: '4', Color: '赤', CardClass: '', Power: '', EffectText: 'シグニ１体を【ビート】にする：カードを１枚引く。' } as CardData], ['S', card('S', '1')]]);
  const st = blankState({ field: { ...blankState().field, lrig: ['LRIG'], signi: [['S'], null, null] } });
  const r = payBeatSigniCost(st, 'LRIG', cm, 1);
  check('ok', r.ok);
  check('場のシグニ S が beat へ', beatZone(r.state).includes('S'), JSON.stringify(beatZone(r.state)));
}

console.log(`\n結果: ${pass} pass / ${fail} fail`);
process.exit(fail > 0 ? 1 : 0);
