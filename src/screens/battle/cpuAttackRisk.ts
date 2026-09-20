import type { CardData, PlayerState } from '../../types';
import { getCardNum } from '../../engine/execUtils';
import { LB_MAX, MAIN_MAX } from '../../utils/deckBuildLimits';
import type { BoardWeights, CpuPolicy } from './cpuPolicy';

/**
 * 🆕§5.7 `S-17` 第3段＝**アタックの「損」を確率で見る**（2026-09-21）。
 *
 * ■ なぜ要るか（第2段の結論そのもの）＝`cpuMoves.ts` の `simCrushLife` / `simLrigAttack` は
 *   **ライフバーストもガードも解かない**＝アタックの点数が**常に上振れ**して出る。
 *   ⇒ 探索は「撃つ／撃たない」を判断できず、**第2段は「順番だけ」に限定して配線した**
 *   （[LESSONS.md](../../../docs/LESSONS.md) §4.3「同点なら何もしない、は損の無い行動を捨てる」）。
 *   **人間が撃たない理由（割るとバーストで損をする／ガードで無駄になる）が近似に1ビットも映っていない。**
 *
 * ■ 🔴**カンニングの線引き（§5.7.0）**＝ここが読んでよいのは**公開ゾーンだけ**＝
 *   相手の**エナ・トラッシュ・場**（中身）と**手札の枚数**。
 *   🔴**`opp.deck` / `opp.life_cloth` / `opp.hand` の中身は読まない**（golden `§5.7 S-17 第3段` がソースを検査する）。
 *   ⇒ **「次に割るライフクロスがバーストを持つか」は原理的に分からない＝確率で扱う。**
 *
 * ■ 🔑**向きが直感と逆**＝これは**壺から戻さずに引く**問題（構築時に枚数が決まっている）なので、
 *   **相手のバースト持ちを見た枚数が増えるほど、残りのバースト率は下がる**。
 *   ⇒ ベータ分布の素朴な混合（見た率へ寄せる）は**符号が逆**になる。ここは**超幾何の平均**で書く：
 *     `p = (デッキのバースト総数 − 公開ゾーンで見えたバースト) / (まだ見えていない枚数)`。
 *   **`LB_MAX`（メインデッキ40枚中20枚）は構築ルールの定数**（`deckBuildLimits.ts`）＝手で決めた値ではない。
 *
 * ■ 母集団の実測（2026-09-21・ユーザー作26デッキ＋`VERIFY_DECK_MECH`・主デッキ 1,080枚）
 *   | 軸 | 全カード（6,713枚） | **実デッキ（27デッキ）** |
 *   |---|---|---|
 *   | 【ライフバースト】 | 1,751（26.1%） | **528（48.9%）＝ほぼ全デッキが上限 20/40** |
 *   | 【ガード】 | 23（0.3%） | **204（18.9%）＝中央 8/40** |
 *   🔴**登録票の「LB 持ち 1,751 / 6,666枚」をそのまま事前確率にすると約半分に外す**＝
 *     **全カードの比率は実デッキの比率ではない**（登録票の警告どおりだった）。
 *   📏**バーストが解決したときの損**＝`effectValueOf` で測ると **平均 2,960 / 中央 2,500 / p90 6,000**
 *     （`LIFE_BURST` の 0.25 掛けを割り戻した値＝「解決したときの価値」）。
 *
 * ■ ⚠**既定は 0＝この項は無い**（`CpuPolicy.lifeBurstCost` / `guardDeckCount`）＝**挙動不変**。
 *   値は A/B（`S-9`）で決める＝**手で決めない**（登録票）。プリセットは `cpuPolicy.ts` の `search-attack-*`。
 */

/** 公開ゾーンのカード＝**相手のエナ・トラッシュ・場のシグニ**（メインデッキ由来のものだけ）。 */
function publicMainDeckCards(opp: PlayerState, cardMap: Map<string, CardData>): CardData[] {
  const ids = [...opp.energy, ...opp.trash, ...opp.field.signi.flatMap(z => z ?? [])];
  const out: CardData[] = [];
  for (const id of ids) {
    const num = getCardNum(id);
    // ⚠トークンはメインデッキの札ではない（数えると母数が水増しされて確率が下がる）。
    if (/-TK/.test(num)) continue;
    const c = cardMap.get(num);
    if (c) out.push(c);
  }
  return out;
}

/** まだ見えていない枚数（＝山＋手札＋ライフクロス）。⚠**中身は読まない＝枚数だけ**。 */
function unseenCount(seen: number): number {
  return Math.max(1, MAIN_MAX - seen);
}

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

/**
 * **次に割るライフクロスが【ライフバースト】を持つ確率**（超幾何の平均）。
 * ⚠**読むのは公開ゾーンだけ**＝`opp.life_cloth` の中身は見ない。
 * 🔑**見えたバーストが増えるほど下がる**＝「もう全部出た」を正しく 0 にできるのがこの形の値打ち。
 */
export function lifeBurstProbability(opp: PlayerState, cardMap: Map<string, CardData>): number {
  const seen = publicMainDeckCards(opp, cardMap);
  const seenLb = seen.filter(c => c.LifeBurst === '1').length;
  return clamp01((LB_MAX - seenLb) / unseenCount(seen.length));
}

/**
 * **相手が【ガード】を持っている確率**（＝ルリグアタックが防がれる確率の近似）。
 * `r`＝まだ見えていない1枚が【ガード】である率（超幾何の平均）→ `1 − (1 − r)^手札枚数`。
 * ⚠**手札は枚数しか見ない**（中身を見たらカンニング）。
 * ⚠**近似**＝レベル限定のガード制限（`guardableHandIndices` の `GUARD_MAX_LV*`）・追加コスト・
 *   「【ガード】できない」の付与は見ない＝**楽観側ではなく悲観側に振れる**（防がれる確率を高めに見る）。
 * @param guardDeckCount デッキに入っている【ガード】の想定枚数（**0 ならこの項は無い**）。実測の中央は 8。
 */
export function guardProbability(
  opp: PlayerState, cardMap: Map<string, CardData>, guardDeckCount: number,
): number {
  if (guardDeckCount <= 0 || opp.hand.length === 0) return 0;
  const seen = publicMainDeckCards(opp, cardMap);
  const seenGuards = seen.filter(c => c.Guard === '1').length;
  const r = clamp01((guardDeckCount - seenGuards) / unseenCount(seen.length));
  return clamp01(1 - (1 - r) ** opp.hand.length);
}

/**
 * **ライフクロスを1枚割ることの期待損**（パワー換算・`evaluateBoard` と同じ尺度）。
 * ＝`P(バースト) × lifeBurstCost`。⚠**どのバーストかは見ない**（伏せ札＝見たらカンニング）。
 */
export function lifeCrushRisk(
  opp: PlayerState, cardMap: Map<string, CardData>, policy: CpuPolicy,
): number {
  if (policy.lifeBurstCost <= 0) return 0;
  return lifeBurstProbability(opp, cardMap) * policy.lifeBurstCost;
}

/**
 * **センタールリグのアタックの期待損**（パワー換算）。
 *
 * 近似適用（`simLrigAttack`）は**必ず通った**ことにしてライフを1枚割るので、その**上振れ分**を引く：
 * - ガードされた場合に失うもの＝ライフを割れない（`life` − `energy`）／
 *   ただし相手は手札を1枚捨てる（＝こちらの得＝`hand`）。
 * - 通った場合の損＝ライフクロスのバースト（`lifeCrushRisk`）。
 * 🔑**「ガードされるから撃たない」にはならない**＝ガードされても相手の手札は1枚減る＝**撃つのは基本的に得**。
 *   この項は**順番**と「ライフを割る他の手との比較」に効く。
 */
export function lrigAttackRisk(
  opp: PlayerState, cardMap: Map<string, CardData>, policy: CpuPolicy, weights: BoardWeights,
): number {
  const pGuard = guardProbability(opp, cardMap, policy.guardDeckCount);
  const crushValue = weights.life - weights.energy;
  const guarded = pGuard * (crushValue - weights.hand);
  return guarded + (1 - pGuard) * lifeCrushRisk(opp, cardMap, policy);
}
