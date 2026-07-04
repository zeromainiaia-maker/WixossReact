import { parseCardEffects } from '../src/data/effectParser';
import type { CardData } from '../src/types';

const card = {
  CardNum: 'TEST-001', CardName: 'テスト', Type: 'シグニ', Color: '白', Level: '1', Power: '1000',
  EffectText: '-', LifeBurst: '1',
  BurstText: '：対戦相手のアップ状態のシグニ１体を対象とし、それをトラッシュに置く。',
} as unknown as CardData;
console.log(JSON.stringify(parseCardEffects(card), null, 1));
