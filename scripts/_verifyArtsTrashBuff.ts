// G185（WXK01-098 / WDK03-015）の検証ハーネス。
// 「あなたのルリグトラッシュにアーツがあるかぎり、このシグニのパワーは＋5000」を
// activeCondition: LRIG_TRASH_COUNT(アーツ,gte,1) ＋ thisCardOnly self POWER_MODIFY で実装。
// ルリグトラッシュにアーツがある場合のみ +5000 され、無い場合は素のパワーのままであることを確認する。
import { calcFieldPowers } from '../src/engine/effectEngine';
import type { PlayerState, CardData } from '../src/types';
import type { CardEffect } from '../src/types/effects';

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
const card = (over: Partial<CardData>): CardData => ({ CardNum: '', CardName: '', Color: '', Level: '', CardClass: '', Type: 'シグニ', Power: '', ...over } as CardData);

const SIGNI = 'WXK01-098';
const cardMap = new Map<string, CardData>([
  [SIGNI, card({ CardNum: SIGNI, CardName: '幻怪　ドライアド', Type: 'シグニ', Power: '5000' })],
  ['ARTS-X', card({ CardNum: 'ARTS-X', CardName: 'なんらかのアーツ', Type: 'アーツ' })],
  ['SPELL-X', card({ CardNum: 'SPELL-X', CardName: 'なんらかのスペル', Type: 'スペル' })],
]);
// G185 と同型の効果（JSON と一致）
const eff: CardEffect = {
  effectId: 'WXK01-098-E1', effectType: 'CONTINUOUS',
  action: { type: 'POWER_MODIFY', target: { type: 'SIGNI', owner: 'self', count: 1, filter: { thisCardOnly: true } }, delta: 5000 },
  duration: 'PERMANENT', mandatory: true,
  activeCondition: { type: 'LRIG_TRASH_COUNT', cardType: 'アーツ', operator: 'gte', value: 1 },
} as unknown as CardEffect;
const effectsMap = new Map<string, CardEffect[]>([[SIGNI, [eff]]]);

const withField = (lrigTrash: string[]): PlayerState =>
  blankState({ field: { ...blankState().field, signi: [[SIGNI], null, null] }, lrig_trash: lrigTrash });

console.log('\n[1] ルリグトラッシュにアーツあり → パワー +5000（5000→10000）');
{
  const p = calcFieldPowers(withField(['ARTS-X']), blankState(), true, effectsMap, cardMap);
  check('パワー10000', p.get(SIGNI) === 10000, `actual=${p.get(SIGNI)}`);
}

console.log('\n[2] ルリグトラッシュが空 → 素のパワー（5000のまま）');
{
  const p = calcFieldPowers(withField([]), blankState(), true, effectsMap, cardMap);
  check('パワー5000', p.get(SIGNI) === 5000, `actual=${p.get(SIGNI)}`);
}

console.log('\n[3] ルリグトラッシュにアーツ以外（スペル）のみ → 不発（5000のまま）');
{
  const p = calcFieldPowers(withField(['SPELL-X']), blankState(), true, effectsMap, cardMap);
  check('パワー5000', p.get(SIGNI) === 5000, `actual=${p.get(SIGNI)}`);
}

console.log(`\n結果: ${pass} pass / ${fail} fail`);
process.exit(fail > 0 ? 1 : 0);
