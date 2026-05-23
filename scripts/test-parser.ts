import { buildEffectsMap } from '../src/data/effectParser.ts';

const result = buildEffectsMap([{
  CardNum: 'WX01-028',
  CardName: 'アーク・オーラ',
  ImgURL: '',
  Type: 'スペル',
  CardClass: '-',
  Color: '白',
  Level: '-',
  GrowCost: '-',
  Cost: '《白》×５',
  Limit: '-',
  Power: '-',
  Restriction: 'タマ限定',
  Team: '-',
  Timing: '-',
  Guard: '0',
  Coin: '-',
  Story: '-',
  LifeBurst: '1',
  EffectText: '-',
  BurstText: '：対戦相手のセンタールリグとすべてのシグニをダウンする。',
}]);

const entries = Array.from(result.entries());
console.log(JSON.stringify(entries, null, 2));
