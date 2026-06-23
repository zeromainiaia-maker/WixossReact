import { parseCardEffects } from '../src/data/effectParser';
import type { CardData } from '../src/types';
const card = {
  CardNum:'WXDi-P11-013', CardName:'サシェ・クラフト', Type:'シグニ', CardClass:'', Color:'白', Level:'3', Power:'12000',
  EffectText:'【出】：《白羅星姫 サタン》１枚と《白羅星姫 フルムーン》１枚を公開する。それらのどちらか１枚を対戦相手に見せずに裏向きでルリグデッキに加える。（ゲーム終了時にそのレゾナがルリグデッキにあれば公開する）',
  BurstText:'-', effects:[],
} as unknown as CardData;
console.log(JSON.stringify(parseCardEffects(card), null, 1));
