import type { CardData, PlayerState } from '../../../types';
import { getCardNum } from '../../../engine/execUtils';
import { pickCpuMulliganIndices } from '../cpuHandLimit';
import { planKeepsInMulligan, type CpuDeckPlan } from '../cpuDeckPlan';
import type { CpuPolicy } from '../cpuPolicy';
import { applyMulligan } from '../mulligan';

/**
 * 🆕**CPU のマリガン（引き直し＋ライフクロス設置）**（§5.7 `S-24`・2026-09-21）。
 *
 * ■ 🔴**なぜ切り出したか**＝**自己対戦（`headlessSelfPlay.ts`）は「戻す札は空」固定**で、
 *   **マリガンを一度も踏んでいなかった**（実測＝`census:play` で4デッキ × 48戦すべて「マリガン 0回」）。
 *   判断（`pickCpuMulliganIndices`）と実行（`applyMulligan`）は既に純関数だったが、
 *   **その2つを繋いでログを出す段が `BattleScreen` の `cpuSetupAction` にしか無かった**
 *   ＝**ハーネスからは呼べない**＝`S-2`（作戦データのキーカードを戻さない判断）が A/B に一度も乗っていなかった。
 * 🔑**対戦開始（じゃんけん・マリガン・ルリグ配置）は画面の SETUP 経路にある**（`S-5` の但し書き）＝
 *   ここはその最初の1本。**画面も自己対戦もこの関数を通る。**
 *
 * 🔴**ログの文言は `census:play` の規則 `mulligan` の契約**（`playCensus.ts`）＝
 *   **接頭辞を引数にせず literal で書く**（`${'${prefix}'}引き直し` と合成するとソースに literal が残らず、
 *   golden `§5.6 C-3` が落ちる＝§5.7 `S-28` で実際に踏んだ罠）。
 *   ⚠「引き直さない」は `^\[CPU\] 引き直し` に当たらない（`し` と `さ`）＝**踏破に数えないのが正**。
 * ⚠**`cardMap` は素の `Map`（カード番号キー）でも `InstanceMap` でもよい**＝`getCardNum` で剥がしてから引く。
 */
export function performCpuMulligan(p: {
  state: PlayerState;
  cardMap: Map<string, CardData>;
  /** §5.7 `S-2`＝キーカード・コンボのパーツは戻さない。 */
  plan: CpuDeckPlan;
  /** §5.7 `S-24`＝`mulliganLv1Target`（席ごとに違うものが来る＝A/B の口）。 */
  policy?: CpuPolicy;
}): { state: PlayerState; logs: string[] } {
  const { state, cardMap } = p;
  const idx = pickCpuMulliganIndices(state.hand, cardMap, id => planKeepsInMulligan(p.plan, id), p.policy);
  const name = (i: number) => cardMap.get(getCardNum(state.hand[i]))?.CardName ?? state.hand[i];
  return {
    state: applyMulligan(state, idx),
    logs: [idx.length > 0
      ? `[CPU] 引き直し: ${idx.length}枚（${idx.map(name).join('・')}）`
      : '[CPU] 引き直さない'],
  };
}
