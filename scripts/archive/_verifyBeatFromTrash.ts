// cost.beat_signi_from_trash の支払い（payBeatSigniFromTrashCost）検証。
// トラッシュから filter 一致のシグニを beat_zone へ移し、beat_became_just に積む（ON_BECOME_BEAT 連鎖用）。WDK14-013。
import { payBeatSigniFromTrashCost } from '../src/engine/effectExecutor';
import type { PlayerState, CardData, TargetFilter } from '../src/types';

let pass = 0, fail = 0;
function check(name: string, cond: boolean, extra = '') {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}  ${extra}`); }
}
const signi = (num: string, story = '悪魔'): CardData =>
  ({ CardNum: num, CardName: num, Color: '赤', Level: '2', CardClass: `精像：${story}`, Type: 'シグニ', Power: '5000' } as CardData);
const spell = (num: string): CardData =>
  ({ CardNum: num, CardName: num, Color: '赤', Level: '-', CardClass: '', Type: 'スペル', Power: '-' } as CardData);
function blankState(over: Partial<PlayerState> = {}): PlayerState {
  return {
    deck: [], hand: [], energy: [], trash: [], lrig_trash: [], lrig_deck: [], life_cloth: [],
    field: { lrig: [], signi: [null, null, null], assist_lrig_l: [], assist_lrig_r: [], check: null, key_piece: null, free_zone: [], beat_zone: [] },
    coins: 0, ...over,
  } as unknown as PlayerState;
}
const beatZone = (s: PlayerState) => s.field.beat_zone ?? [];
const becameJust = (s: PlayerState) => s.beat_became_just ?? [];
const demonFilter: TargetFilter = { cardType: 'シグニ', story: '悪魔' } as TargetFilter;

const cm = new Map<string, CardData>([
  ['D1', signi('D1', '悪魔')], ['D2', signi('D2', '悪魔')],
  ['A1', signi('A1', '天使')], ['SP', spell('SP')],
]);

console.log('\n[1] トラッシュの＜悪魔＞シグニ1枚を【ビート】に（filter一致のみ移動）');
{
  const st = blankState({ trash: ['A1', 'D1', 'SP', 'D2'] });
  const r = payBeatSigniFromTrashCost(st, cm, 1, demonFilter);
  check('ok', r.ok);
  check('移動1枚', r.moved.length === 1, JSON.stringify(r.moved));
  check('移動先は＜悪魔＞(D1=先頭一致)', r.moved[0] === 'D1', JSON.stringify(r.moved));
  check('beat_zone に D1', beatZone(r.state).includes('D1'));
  check('beat_became_just に D1', becameJust(r.state).includes('D1'));
  check('トラッシュから D1 除去・他は残る', !r.state.trash.includes('D1') && r.state.trash.includes('A1') && r.state.trash.includes('SP') && r.state.trash.includes('D2'), JSON.stringify(r.state.trash));
}

console.log('\n[2] 支払い不能：トラッシュに＜悪魔＞シグニが無い（天使/スペルのみ）');
{
  const st = blankState({ trash: ['A1', 'SP'] });
  const r = payBeatSigniFromTrashCost(st, cm, 1, demonFilter);
  check('ok=false', !r.ok);
  check('状態不変（beat_zone空）', beatZone(r.state).length === 0);
  check('トラッシュ不変', r.state.trash.length === 2);
}

console.log('\n[3] 重複カード番号でも count 枚だけ移動（全消ししない）');
{
  const st = blankState({ trash: ['D1', 'D1', 'D1'] });
  const r = payBeatSigniFromTrashCost(st, cm, 1, demonFilter);
  check('ok', r.ok);
  check('1枚だけ移動', r.moved.length === 1);
  check('トラッシュに D1 が2枚残る', r.state.trash.filter(n => n === 'D1').length === 2, JSON.stringify(r.state.trash));
}

console.log(`\n結果: ${pass} pass / ${fail} fail`);
process.exit(fail > 0 ? 1 : 0);
