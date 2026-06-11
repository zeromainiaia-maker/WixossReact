import { parseCardEffects } from '../src/data/effectParser';
import type { CardData } from '../src/types';
const card: CardData = {
  CardNum: 'WXK01-010', CardName: 'レイラ＝アクセル', ImgURL: '', Type: 'ルリグ',
  CardClass: 'レイラ', Color: '赤', Level: '1', GrowCost: '-', Cost: '-', Limit: '8',
  Power: '-', Restriction: '-', Team: '-', Timing: '-', Guard: '-', Coin: '-',
  Story: '-', LifeBurst: '0',
  EffectText: '【ライド】（ターン終了時まで、このルリグは対象のあなたの＜乗機＞のシグニ１体に乗る。これはコストが《赤×0》の【起】能力で、１ターンに一度、このルリグがドライブ状態でない場合に使用できる）（ルリグがシグニに乗っているかぎり、それらはドライブ状態である。ドライブ状態のルリグはアタックできない）【出】手札を１枚捨てる：カードを１枚引く。',
  BurstText: '-', effects: [],
};
console.log(JSON.stringify(parseCardEffects(card), null, 1));
