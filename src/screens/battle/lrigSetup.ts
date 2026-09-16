import type { CardData, PlayerState } from '../../types';
import { getCardNum } from '../../engine/execUtils';
import { lrigClassesCompatible } from './growLogic';

/**
 * ゲーム開始時のルリグ配置（§5.6 `C-5` 追補・§5.1 `V-247`・2026-09-17）。
 *
 * 🔑**公式ルール**（English Rule Guide ver.1.0.0「Assist LRIG」「LRIG Zone」・初心者向けプレイマット ver.DIVA）＝
 *   ルリグデッキからレベル0のルリグ3枚をルリグゾーンに置き、中央がセンタールリグ（「レベル3までルリグデッキに入っているルリグをセンターにする」）。
 *   このアプリは Lv0 が1〜2枚のデッキも「センターのみ」で遊べる（人間のセットアップ画面の既存仕様）。
 *
 * 🔴**なぜ切り出したか**＝人間のセットアップ（JSX の3経路）と CPU のセットアップが**別々に** `PlayerState` を手書きしており、
 *   CPU は**センターしか置かなかった**（Lv0 が3枚以上あってもアシストを置かない）＝**実戦の CPU はアシストグロウも
 *   アシストのアタックも一度もできなかった**（C-5 の実機シナリオはアシストを注入していたので通っていた）。
 *   ⇒ 盤面の組み立ては `buildLrigSetupState` の1本（人間も CPU も通る）、CPU は `pickCpuLrigSetup` で**どれを置くかだけ**決める。
 */
export function buildLrigSetupState(p: {
  lrigWithIds: string[];
  mainWithIds: string[];
  centerId: string;
  assistLId?: string | null;
  assistRId?: string | null;
  cardMap: Map<string, CardData>;
}): PlayerState {
  const used = new Set([p.centerId, p.assistLId, p.assistRId].filter((x): x is string => !!x));
  // ゲーム開始時、センタールリグのコイン欄（ナナシ其ノ零ノ禍等）分のコインを得る
  const startCoins = Math.min(5, parseInt(p.cardMap.get(getCardNum(p.centerId))?.Coin ?? '0') || 0);
  return {
    life_cloth: [], hand: p.mainWithIds.slice(0, 5), deck: p.mainWithIds.slice(5),
    lrig_deck: p.lrigWithIds.filter(id => !used.has(id)),
    trash: [], lrig_trash: [], energy: [], coins: startCoins,
    field: {
      lrig: [p.centerId], signi: [null, null, null],
      assist_lrig_l: p.assistLId ? [p.assistLId] : [],
      assist_lrig_r: p.assistRId ? [p.assistRId] : [],
      check: null, key_piece: null, free_zone: [],
    },
  } as PlayerState;
}

/**
 * CPU のルリグ配置＝**センター**は「そのルリグタイプで上のレベルのルリグが一番多い Lv0」（同数はデッキ順）、
 * **アシスト**は Lv0 が3枚以上あるときだけ、センター以外の Lv0 をデッキ順に2枚。
 * @returns ルリグデッキ内の添字（Lv0 のルリグが無ければ null）
 */
export function pickCpuLrigSetup(
  lrigDeckNums: string[], cardMap: Map<string, CardData>,
): { centerIdx: number; assistIdx: [number, number] | null } | null {
  const cardOf = (i: number) => cardMap.get(getCardNum(lrigDeckNums[i]));
  const lv0 = lrigDeckNums.map((_, i) => i).filter(i => cardOf(i)?.Type === 'ルリグ' && cardOf(i)?.Level === '0');
  if (lv0.length === 0) return null;
  const lineLength = (i: number) => lrigDeckNums.filter((_, j) => {
    const c = cardOf(j);
    return c?.Type === 'ルリグ' && (parseInt(c.Level) || 0) >= 1 && lrigClassesCompatible(cardOf(i)?.CardClass ?? '', c.CardClass ?? '');
  }).length;
  const centerIdx = [...lv0].sort((a, b) => lineLength(b) - lineLength(a) || a - b)[0];
  const others = lv0.filter(i => i !== centerIdx);
  return { centerIdx, assistIdx: lv0.length >= 3 ? [others[0], others[1]] : null };
}
