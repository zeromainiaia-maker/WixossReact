import type { CardData } from '../../types';
import { getCardNum } from '../../engine/execUtils';
import type { CardEffect } from '../../types/effects';
import { cardStrength } from './cpuCardStrength';
import { DEFAULT_CPU_POLICY, type CpuPolicy } from './cpuPolicy';

/**
 * CPU の**マリガンで戻す札**と**手札上限で捨てる札**（§5.6 `C-4`・2026-09-17）。
 *
 * ■ 規律（§5.6.3）＝ここは「どれを選ぶか」だけ。実行は人間と同じ `applyMulligan`（`mulligan.ts`）／
 *   エンドフェイズの手札上限は人間の `confirmEndDiscard` と同じ規則（捨てた札の「手札からトラッシュに置かれたとき」を収集）。
 *
 * ■ なぜ要るか＝旧実装は CPU が**引き直さず**、**手札上限の処理自体が無かった**（§5.6.1）＝
 *   CPU の手札は無限に増え、エンドフェイズの捨て札で誘発する能力が CPU 側で一度も踏まれていなかった。
 *
 * ■ 方針（決定論・強さではなく経路を踏むための最小線）
 *   - 【ガード】を持つ札は残す（C-2 で CPU がガードするようになったので、手放すと守れない）。
 *   - それ以外は**レベルの高い札から**手放す（序盤に出せない札）。同レベルは手札の後ろから。
 */
const levelOf = (num: string, cardMap: Map<string, CardData>): number => {
  const lv = parseInt(cardMap.get(getCardNum(num))?.Level ?? '');
  return Number.isFinite(lv) ? lv : -1;
};
const isGuard = (num: string, cardMap: Map<string, CardData>): boolean => cardMap.get(getCardNum(num))?.Guard === '1';

/**
 * 手放す優先順（先頭ほど手放す）の添字列。
 * 🆕§5.7 `S-1`＝効果の一覧（`effectsOf`）があれば**強さ（パワー＋効果の点数）の低い札から**手放す。無ければ旧挙動（レベルの高い札から）。
 * 【ガード】は常に最後まで残す。
 */
function discardOrder(
  hand: string[], cardMap: Map<string, CardData>, effectsOf?: (id: string) => readonly CardEffect[], keepBonus?: (id: string) => number,
  policy?: CpuPolicy,
): number[] {
  const strength = (num: string) => cardStrength(cardMap.get(getCardNum(num)), effectsOf?.(num) ?? [], 'deploy', undefined, policy) + (keepBonus?.(num) ?? 0);
  return hand.map((_, i) => i).sort((a, b) =>
    Number(isGuard(hand[a], cardMap)) - Number(isGuard(hand[b], cardMap))
    || (effectsOf ? strength(hand[a]) - strength(hand[b]) : levelOf(hand[b], cardMap) - levelOf(hand[a], cardMap))
    || b - a);
}

/**
 * マリガンで戻す手札の添字。
 *
 * 🆕🔴**規則（2026-09-21 ユーザー決定・§5.7 `S-24`）＝「レベル1を優先して持っておきたい」**
 *   - **レベル3以上のシグニ**は常に戻す（【ガード】持ちは除く＝サーバントは Lv3 でも残す）。
 *   - 🆕**手札のレベル1シグニが `mulliganLv1Target` 枚に満たなければ、レベル2のシグニも戻して掘りに行く。**
 *   - **レベル1のシグニ・シグニ以外（スペル等）は戻さない。**
 * 📏**実測（本物のデッキ6つ × 400手札）**＝引き直す 87%→90%／平均の戻し 1.83→2.42枚／
 *   手札のレベル1 1.95→2.10枚／**レベル1が0枚の手札 6.1%→4.1%**。
 *   ⚠**レベル1は山に12枚しかない**ので、全部掘っても平均2.2枚が上限（`mulliganLv1Target` を上げても届かない）。
 * ⚠「戻さない」も正しい選択なので、該当が無ければ空配列（引き直さない）。
 * 🔴旧規則（レベル2を戻さない）は `CPU_POLICIES['legacy-mulligan']`（`mulliganLv1Target: 0`）。
 */
export function pickCpuMulliganIndices(
  hand: string[], cardMap: Map<string, CardData>, keeps?: (id: string) => boolean, policy?: CpuPolicy,
): number[] {
  const isSigni = (num: string) => cardMap.get(getCardNum(num))?.Type === 'シグニ';
  const target = policy?.mulliganLv1Target ?? DEFAULT_CPU_POLICY.mulliganLv1Target;
  // 🔑**「足りているか」は引き直す前の手札で測る**（引いた後は分からない＝掘る判断が消える）。
  const lv1InHand = hand.filter(num => isSigni(num) && levelOf(num, cardMap) === 1).length;
  const minLevel = lv1InHand < target ? 2 : 3;
  return hand.map((num, i) => ({ num, i }))
    // §5.7 `S-2`＝作戦データのキーカード・コンボのパーツは戻さない。
    .filter(({ num }) => isSigni(num) && levelOf(num, cardMap) >= minLevel && !isGuard(num, cardMap) && !keeps?.(num))
    .map(({ i }) => i);
}

/** 手札上限で捨てる手札の添字（ちょうど `count` 枚。`count` が手札を超えるなら全部）。 */
export function pickCpuHandLimitDiscards(
  hand: string[], count: number, cardMap: Map<string, CardData>, effectsOf?: (id: string) => readonly CardEffect[],
  keepBonus?: (id: string) => number, policy?: CpuPolicy,
): number[] {
  if (count <= 0) return [];
  return discardOrder(hand, cardMap, effectsOf, keepBonus, policy).slice(0, count).sort((a, b) => a - b);
}

/**
 * 🆕§5.7 `S-26`＝エナチャージの「どれを置くか」に要る**ターンをまたいだ情報**。
 * ⚠**省略できる**＝渡さなければ `S-1` のときの挙動（強さだけ）に戻る。
 */
export interface CpuChargeCtx {
  /**
   * 🔴**次のグロウでまだ足りない色**（`cpuGrowReserve.growShortColors`）＝**この色の札はエナへ置きに行く**。
   * 実測（2026-09-21）＝グロウ機会 214 のうち 15（7%）が払えず、**うち7件は色の問題**。
   */
  needColors?: readonly string[];
  /**
   * 🔴**空いているシグニゾーンの数**＝**いま出せる札が足りているか**を測るのに要る。
   * 実測＝ターン1（ルリグ Lv0〜1）でレベル1のシグニをエナへ置いた結果、
   * **MAIN で空きゾーンがあるのに出せる札が手札に無い盤面が 22/98（22%）**（ケトッシー軸）。
   */
  emptyZones?: number;
}

/**
 * 🆕§5.7 `S-1`／`S-26`＝**エナチャージする手札**の添字（【ガード】は最後）。
 *
 * ■ キープ値＝**強さ（パワー＋効果の点数）**に、**ターンをまたいだ3つの補正**を足したもの。低いものからエナへ置く。
 *   ① **当分出せない**（レベル ≧ ルリグレベル＋2）＝`chargeFarLevelScale` 倍に割り引く（旧実装の 0.6）。
 *   ② 🆕**いま出せる札が足りない**（レベル ≦ ルリグレベルのシグニが空きゾーン数以下）＝`chargeKeepPlayable` を加点して温存する。
 *      🔑**終盤にレベル1を置くのは正しい**（実測＝`Lv1-ルリグLv4` は5回＝ただ弱い札）＝**ルリグレベル相対**で決める。
 *   ③ 🆕**次のグロウに要る色**を持つ札＝`chargeGrowColor` を減点して**エナへ置きに行く**。
 * ■ 🔑**②と③は逆を向くことがある**（要る色の札が、いま出せる唯一の札）＝**数値の大小で決める**（既定は同額＝引き分けなら①の割引と強さで決まる）。
 * @returns 手札が空なら -1
 */
export function pickCpuEnergyChargeIndex(
  hand: string[], cardMap: Map<string, CardData>, effectsOf: (id: string) => readonly CardEffect[], lrigLevel: number,
  keepBonus?: (id: string) => number, policy?: CpuPolicy, charge?: CpuChargeCtx,
): number {
  if (hand.length === 0) return -1;
  const W = policy ?? DEFAULT_CPU_POLICY;
  const isSigni = (num: string) => cardMap.get(getCardNum(num))?.Type === 'シグニ';
  /** いま出せるシグニ（レベル ≦ ルリグレベル）。⚠**リミットは見ない**（見るならコストの判定ごと要る＝ここでは枚数の目安）。 */
  const playableNow = (num: string) => isSigni(num) && levelOf(num, cardMap) <= lrigLevel;
  const playableCount = hand.filter(playableNow).length;
  // 🔴**「足りない」の定義**＝空きゾーンを埋めるぶんに余りが無い（1枚も余らない）。
  //   ⚠`emptyZones` を渡さなければこの補正は効かない（旧挙動）。
  const scarce = charge?.emptyZones !== undefined && playableCount <= charge.emptyZones;
  const needColors = new Set(charge?.needColors ?? []);
  const keepValue = (num: string) => {
    const card = cardMap.get(getCardNum(num));
    const base = cardStrength(card, effectsOf(num), 'deploy', undefined, policy);
    // ① 当分出せない札は割り引く（エナへ回しやすくする）。
    let v = isSigni(num) && levelOf(num, cardMap) >= lrigLevel + 2 ? base * W.chargeFarLevelScale : base;
    // ② いま出せる札が足りないなら温存する。
    if (scarce && playableNow(num)) v += W.chargeKeepPlayable;
    // ③ 次のグロウに要る色なら置きに行く。⚠シグニ以外（スペル等）も色を持つので対象にする。
    if (card?.Color && needColors.has(card.Color)) v -= W.chargeGrowColor;
    // §5.7 `S-2`＝作戦データのキーカード・コンボのパーツは残す（加点）。
    return v + (keepBonus?.(num) ?? 0);
  };
  return hand.map((_, i) => i).sort((a, b) =>
    Number(isGuard(hand[a], cardMap)) - Number(isGuard(hand[b], cardMap))
    || keepValue(hand[a]) - keepValue(hand[b])
    || a - b)[0];
}
