// G039（レゾナクラフトをルリグデッキに加える）の検証ハーネス。
// ADD_CARD_TO_LRIG_DECK_HIDDEN が、デッキに存在しないレゾナクラフトを
// ゲーム外から生成して CHOOSE を出し、選択後にルリグデッキへ加えることを確認する。
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
function ctxOf(own: PlayerState, oth: PlayerState, cardMap: Map<string, CardData>, sourceCardNum?: string): ExecCtx {
  return { ownerState: own, otherState: oth, cardMap, logs: [], sourceCardNum } as unknown as ExecCtx;
}
const card = (over: Partial<CardData>): CardData => ({ CardNum: '', CardName: '', Color: '', Level: '', CardClass: '', Type: 'シグニ', ...over } as CardData);
const dummyExec = (() => ({ done: true })) as unknown as Parameters<typeof execStub>[2];

// InstanceMap 相当（#N サフィックスを基底 CardNum にフォールバック解決）
class InstanceMap<V> extends Map<string, V> {
  override get(id: string): V | undefined {
    if (super.has(id)) return super.get(id);
    const h = id.indexOf('#'); return super.get(h > 0 ? id.slice(0, h) : id);
  }
  override has(id: string): boolean {
    const h = id.indexOf('#'); return super.has(id) || super.has(h > 0 ? id.slice(0, h) : id);
  }
}

const SACHE_TEXT = '【出】：《白羅星姫　サタン》１枚と《白羅星姫　フルムーン》１枚を公開する。それらのどちらか１枚を対戦相手に見せずに裏向きでルリグデッキに加える。（ゲーム終了時にそのレゾナがルリグデッキにあれば公開する）';

console.log('\n[1] ADD_CARD_TO_LRIG_DECK_HIDDEN: ゲーム外レゾナ生成→CHOOSE');
const cardMap = new InstanceMap<CardData>([
  ['WXDi-P11-013', card({ CardNum: 'WXDi-P11-013', CardName: 'サシェ・クラフト', Type: 'シグニ', EffectText: SACHE_TEXT })],
  ['WXDi-P11-TK01', card({ CardNum: 'WXDi-P11-TK01', CardName: '白羅星姫　サタン', Type: 'シグニ/レゾナクラフト' })],
  ['WXDi-P11-TK02', card({ CardNum: 'WXDi-P11-TK02', CardName: '白羅星姫　フルムーン', Type: 'シグニ/レゾナクラフト' })],
]);
const own = blankState();
const r = execStub({ type: 'STUB', id: 'ADD_CARD_TO_LRIG_DECK_HIDDEN' } as never, ctxOf(own, blankState(), cardMap, 'WXDi-P11-013'), dummyExec);
const pend = (r as unknown as { pending?: { type: string; options?: { label: string; action: { value?: string } }[]; count?: number } }).pending;
check('CHOOSE発行', !!pend && pend.type === 'CHOOSE', JSON.stringify(pend));
check('2候補', pend?.options?.length === 2, `len=${pend?.options?.length}`);
check('候補にサタン', !!pend?.options?.some(o => o.label === '白羅星姫　サタン'));
check('候補にフルムーン', !!pend?.options?.some(o => o.label === '白羅星姫　フルムーン'));
const optA = pend?.options?.[0];
check('生成インスタンスID(#付き)', typeof optA?.action.value === 'string' && optA!.action.value!.includes('#'), JSON.stringify(optA?.action.value));

console.log('\n[2] INTERNAL_ACLDH_APPLY: 選択したレゾナがルリグデッキへ');
const chosen = optA!.action.value as string;
const r2 = execStub({ type: 'STUB', id: 'INTERNAL_ACLDH_APPLY', value: chosen } as never, ctxOf(own, blankState(), cardMap, 'WXDi-P11-013'), dummyExec);
const newOwn = (r2 as unknown as { ownerState: PlayerState }).ownerState;
check('ルリグデッキに1枚追加', newOwn.lrig_deck.length === 1, JSON.stringify(newOwn.lrig_deck));
check('追加されたのが選択インスタンス', newOwn.lrig_deck[0] === chosen, JSON.stringify(newOwn.lrig_deck));

console.log(`\n結果: ${pass} pass / ${fail} fail`);
process.exit(fail > 0 ? 1 : 0);
