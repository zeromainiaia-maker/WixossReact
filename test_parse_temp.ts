import { parseCardEffects } from './src/data/effectParser';
const card: any = {
  CardNum: 'WX15-016', CardName: 'X', ImgURL: '', Type: 'アーツ',
  CardClass: '-', Color: '青', Level: '-', GrowCost: '-', Cost: '《青》×０',
  Limit: '-', Power: '-', Restriction: '', Team: '-', Timing: 'アタックフェイズ',
  Guard: '0', Coin: '-', Story: '-', LifeBurst: '0',
  EffectText: 'ターン終了時まで、あなたのセンタールリグは「【自】：対戦相手のシグニ１体がアタックしたとき、あなたのデッキの一番上のカードをトラッシュに置いてもよい。この方法でトラッシュに置いたカードが《バーストアイコン》を持っていた場合、そのアタックを無効にする。」を得る。',
  BurstText: '-', effects: []
};
const result = parseCardEffects(card);
process.stdout.write(JSON.stringify(result, null, 2) + '\n');
