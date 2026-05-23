import { executeEffect } from '../src/engine/effectExecutor.ts';
import type { CardData, PlayerState } from '../src/types/index.ts';
import type { CardEffect } from '../src/types/effects.ts';

const burstEffect: CardEffect = {
  effectId: 'WX01-028-BURST',
  effectType: 'LIFE_BURST',
  timing: ['ON_LIFE_BURST'],
  action: {
    type: 'SEQUENCE',
    steps: [
      { type: 'DOWN', target: { type: 'LRIG', owner: 'opponent', count: 1 } },
      { type: 'DOWN', target: { type: 'SIGNI', owner: 'opponent', count: 'ALL', filter: { cardType: 'シグニ' }, upToCount: false } },
    ],
  },
  duration: 'INSTANT',
  mandatory: false,
};

const makePlayer = (signiNums: string[]): PlayerState => ({
  deck: [], hand: [], energy: [], trash: [], life_cloth: [], lrig_trash: [], pending_crashed_cards: [],
  field: {
    lrig: ['WD01-001#1'],
    lrig_down: false,
    signi: signiNums.map(n => [n]),
    signi_down: [false, false, false],
    signi_frozen: [false, false, false],
  },
  temp_power_mods: [], keyword_grants: {}, blocked_actions: [], actions_done: [],
});

const oppSigni = ['WX01-010#1', 'WX01-020#1', 'WX01-030#1'];
const cardMap = new Map<string, CardData>([
  ['WD01-001', { CardNum: 'WD01-001', CardName: 'テストルリグ', ImgURL: '', Type: 'ルリグ', CardClass: '', Color: '白', Level: '4', GrowCost: '', Cost: '', Limit: '', Power: '', Restriction: '', Team: '', Timing: '', Guard: '0', Coin: '0', Story: '', LifeBurst: '0', EffectText: '-', BurstText: '-' }],
  ['WX01-010', { CardNum: 'WX01-010', CardName: 'シグニA', ImgURL: '', Type: 'シグニ', CardClass: '精械：電機', Color: '白', Level: '3', GrowCost: '', Cost: '', Limit: '', Power: '10000', Restriction: '', Team: '', Timing: '', Guard: '0', Coin: '0', Story: '', LifeBurst: '0', EffectText: '-', BurstText: '-' }],
  ['WX01-020', { CardNum: 'WX01-020', CardName: 'シグニB', ImgURL: '', Type: 'シグニ', CardClass: '精械：電機', Color: '白', Level: '2', GrowCost: '', Cost: '', Limit: '', Power: '5000', Restriction: '', Team: '', Timing: '', Guard: '0', Coin: '0', Story: '', LifeBurst: '0', EffectText: '-', BurstText: '-' }],
  ['WX01-030', { CardNum: 'WX01-030', CardName: 'シグニC', ImgURL: '', Type: 'シグニ', CardClass: '精械：電機', Color: '白', Level: '1', GrowCost: '', Cost: '', Limit: '', Power: '3000', Restriction: '', Team: '', Timing: '', Guard: '0', Coin: '0', Story: '', LifeBurst: '0', EffectText: '-', BurstText: '-' }],
]);

// InstanceMapの代わりにget時にCardNumを抽出するMapを作成
class InstanceMap<V> extends Map<string, V> {
  override get(id: string): V | undefined {
    const h = id.indexOf('#');
    const key = h > 0 ? id.slice(0, h) : id;
    return super.get(key);
  }
}
const instanceCardMap = new InstanceMap(cardMap);

const ownerState = makePlayer([]);
const otherState = makePlayer(oppSigni);

const ctx = {
  ownerState,
  otherState,
  cardMap: instanceCardMap,
  logs: [],
  effectivePowers: new Map<string, number>(),
  sourceCardNum: 'WX01-028#1',
};

const result = executeEffect(burstEffect, ctx);

console.log('done:', result.done);
console.log('logs:', result.logs);
console.log('opponent lrig_down:', result.otherState.field.lrig_down);
console.log('opponent signi_down:', result.otherState.field.signi_down);
