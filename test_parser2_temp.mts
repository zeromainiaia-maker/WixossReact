import { parseCardEffects } from './src/data/effectParser';
import type { CardData } from './src/types';

const card: CardData = {
  CardNum: 'WX07-045',
  CardName: '明滅の罪雅　ダエワ',
  ImgURL: '',
  Type: 'シグニ',
  CardClass: '精像：悪魔',
  Color: '黒',
  Level: '4',
  GrowCost: '',
  Cost: '',
  Limit: '',
  Power: '10000',
  Restriction: '',
  Team: '',
  Timing: '',
  Guard: '0',
  Coin: '',
  Story: '',
  LifeBurst: '0',
  EffectText: '【出】あなたの場にある【チャーム】を好きな数トラッシュに置く：対戦相手のシグニ１体を対象とし、ターン終了時まで、それのパワーをこの方法でトラッシュに置いた【チャーム】１枚につき－7000する。【起】《黒》《ダウン》：あなたのトラッシュから対象のカードを３枚まで対象のあなたの好きな数の＜悪魔＞のシグニの【チャーム】にする。',
  BurstText: '',
  effects: [],
};

const result = parseCardEffects(card);
console.log(JSON.stringify(result, null, 2));
