import type { CardData, PlayerState } from '../../types';

/**
 * CPU の**選択の精緻化**（§8／§6.4 `O-1` (g)）＝「どれを出すか／どれで殴るか」を盤面から決める純関数。
 *
 * ■ 立ち位置（ここに書かないもの）
 *   - **可否の判定は書かない**＝置けるか（`deployLimitBlockReason` 等）／アタックできるか（`signiAttackGate`）は
 *     人間と共有する既存の gate が唯一の権威。ここは**通った候補の中から1つ選ぶ**だけを担う。
 *     ⚠可否をここへ写経すると「人間には出せないのに CPU は出せる」型の無言のズレになる。
 *   - **実行も書かない**＝配置は CPU メインフェイズのループ、アタックは `performSigniAttack`（人間と同じ）。
 *
 * ■ (a)〜(f) までの CPU は**定義順／ゾーン順の決定論**で、盤面をまったく見ていなかった：
 *   - 召喚＝手札を**レベル昇順**に並べて「入る最初の1枚」＝**わざと弱い順に出す**形になっていた。
 *   - アタック＝**ゾーン0→1→2 の順に全部**＝正面に格上がいても突っ込んで自分だけ落ちる。
 *   本モジュールはその2点を盤面評価に置き換える。**評価は決定論**（同点は必ずゾーン／候補順で解決）＝
 *   実機シナリオが再現可能であることを優先する（乱択は入れない）。
 */

/** `pickCpuDeployCard` に渡す候補（**すでに「置ける」ことが確定した札だけ**を入れる）。 */
export interface CpuDeployCandidate {
  /** 手札のインスタンスID（`performGrow` 等と同じ綴り）。 */
  id: string;
  /** シグニのレベル（リミット消費量）。 */
  level: number;
  /** 実効パワー（`calcFieldPowers` の値。無ければ印刷パワー）。`∞` は `Infinity`。 */
  power: number;
}

/**
 * いまのゾーンに置く1枚を選ぶ＝**「残りゾーンを埋められる範囲でいちばん強い札」**。
 *
 * 🔴**旧実装は「レベル昇順の最初の1枚」**だった＝リミットが余っていても弱い札から出すので、
 * 「Lv1×3体（合計パワー小）」に固定され、**強い札は一生手札で腐る**（実測＝Lv4のP12000を持っていても
 * Lv1のP3000から出す）。かといって単純に「パワー最大」にすると**リミットを1枚で食い潰して場が埋まらない**。
 *
 * そこで **「置ける体数」を落とさない範囲で最強**を選ぶ＝
 *   ① まずリミット内で**最大何体置けるか**（`bestCount`）を出す（レベル昇順の貪欲＝最大体数はこれで最適）
 *   ② その体数を維持できる札（＝`1 + 残りで置ける体数 >= bestCount`）だけに絞り
 *   ③ その中で**パワー最大**（同点はレベル大 → 候補配列の順＝決定論）
 *
 * ⚠**「体数」は残りゾーン数で頭打ちにする**（`zonesRemaining`）＝空きゾーンより多く数えると
 * 取り置きが過剰になり、いつまでも弱い札しか出せなくなる。
 * ⚠**取り置きは「他の候補の実レベル」で計算する**（`1` 固定にしない）＝手札が Lv3 ばかりのときに
 * 「Lv1が来る前提」で取り置くと、結局2体目が置けずリミットだけ余る。
 * 🔑体数が同じなら強い方が良い＝リミット5・Lv1(P3000)/Lv1(P2000)/Lv4(P12000) なら
 * **Lv4＋Lv1（2体・合計15000）**を選ぶ（Lv1×2体＝2体・5000 と体数は同じ）。
 *
 * @param zonesRemaining このゾーンを**含む**、これから埋められる残ゾーン数（1以上）。
 * @returns 選んだ候補の `id`。置ける札が無ければ `null`。
 */
export function pickCpuDeployCard(p: {
  candidates: readonly CpuDeployCandidate[];
  /** 残りリミット（`cpuLimit - fieldTotal`）。 */
  remainingLimit: number;
  zonesRemaining: number;
}): string | null {
  const { candidates, remainingLimit, zonesRemaining } = p;
  const fits = candidates.filter(c => c.level <= remainingLimit);
  if (fits.length === 0) return null;
  /** レベル昇順の貪欲＝この予算・枠数で置ける**最大体数**（最大体数問題は昇順貪欲が最適）。 */
  const maxCount = (levels: readonly number[], budget: number, slots: number): number => {
    let used = 0, n = 0;
    for (const lv of [...levels].sort((a, b) => a - b)) {
      if (n >= slots || used + lv > budget) break;
      used += lv; n++;
    }
    return n;
  };
  const bestCount = maxCount(candidates.map(c => c.level), remainingLimit, zonesRemaining);
  const better = (a: CpuDeployCandidate, b: CpuDeployCandidate) =>
    (b.power - a.power) || (b.level - a.level) || (candidates.indexOf(a) - candidates.indexOf(b));
  // ①「置ける体数」を落とさない札の中で最強。
  const keepsBoardWide = fits.filter(c => {
    const others = candidates.filter(o => o !== c).map(o => o.level);
    return 1 + maxCount(others, remainingLimit - c.level, zonesRemaining - 1) >= bestCount;
  });
  if (keepsBoardWide.length > 0) return [...keepsBoardWide].sort(better)[0].id;
  // ②理屈上ここには来ない（体数最大を達成する札は必ず1枚はある）が、保険として最強を出す。
  return [...fits].sort(better)[0].id;
}

/**
 * アタック1回ぶんの見積り（`pickCpuAttackZone` の内部表現・golden から読めるよう export）。
 *
 * 🔑**バトルの公式ルール**（[タカラトミー ルール解説「バトル」](https://www.takaratomy.co.jp/products/wixoss/library/rule/word_051/)）＝
 * 「アタックしているシグニのパワーが**相手のシグニのパワー以上**の場合…相手のシグニをバニッシュします。
 * **未満**の場合…**両方のシグニが残ります**」。
 * ⚠つまり **同値はアタック側の勝ち**／**格下で殴っても自分は落ちない**（＝突っ込んでも損はしない）。
 * engine の `myPower >= opPower` はこの規則どおりで、**ここは engine に合わせてある**。
 * ⚠「相打ち」「自爆」という直感でこの表を書き換えないこと（実装も規則もそうなっていない）。
 */
export type CpuAttackValue =
  /** 正面が空＝ライフクロスに通る（最優先）。 */
  | 'life'
  /** 正面にいて**こちらのパワーが以上**＝相手シグニをバニッシュできる（同値も勝ち）。 */
  | 'winBattle'
  /** 正面が**格上**＝両方残る＝**何も起こらない**（損もしないので最後に撃つ）。 */
  | 'noEffect';

/** ゾーン1つのアタック価値。`facingPower` が `null` なら正面が空。 */
export function cpuAttackValueOf(attackerPower: number, facingPower: number | null): CpuAttackValue {
  if (facingPower === null) return 'life';
  return attackerPower >= facingPower ? 'winBattle' : 'noEffect';
}

const VALUE_ORDER: Record<CpuAttackValue, number> = { life: 0, winBattle: 1, noEffect: 2 };

/**
 * CPU が**次にアタックさせるシグニのゾーン**を選ぶ（アタックできる札が無ければ `null`）。
 *
 * 🔴**旧実装は `findIndex`＝ゾーン0から順**＝盤面をまったく見ずに並び順で殴っていた。
 *
 * v1 は **価値の高い順に並べ替えるだけ**＝ `life`（ライフに通る）→ `winBattle`（相手を退けられる）→ `noEffect`。
 * ⚠**「撃たない」判断は入れない**＝上記のとおり格下で殴っても**自分は落ちない**（両方残る）ので、
 * 撃たない理由が無い（むしろ【自】「アタックしたとき」の誘発を捨てるぶん損）。**順序だけが利く**：
 *   - ライフを先に削ると、**その後の盤面変動（ライフバーストで自分のシグニが退かされる等）に左右されない**。
 *   - 勝てるバトルを先に済ませると、相手の壁が減った状態で残りの処理に入れる。
 *
 * ⚠**強制アタック（「可能ならばアタックしなければならない」）は無条件で最優先**＝ルール由来の義務。
 * ⚠**同点は必ずゾーン番号昇順**で解決する（実機シナリオの再現性）。
 */
export function pickCpuAttackZone(p: {
  /** `canSigniAttack` を通ったゾーン（**可否はここで再判定しない**）。 */
  attackable: readonly number[];
  /** `collectForcedAttackZones` の結果。 */
  forced?: readonly number[];
  /** ゾーンのアタッカーの実効パワー。 */
  attackerPower: (zone: number) => number;
  /** 正面（`2 - zone`）の実効パワー。**正面が空なら `null`**。 */
  facingPower: (zone: number) => number | null;
}): number | null {
  const attackable = [...p.attackable].sort((a, b) => a - b);
  if (attackable.length === 0) return null;
  const forced = attackable.filter(z => (p.forced ?? []).includes(z));
  if (forced.length > 0) return forced[0];
  const scored = attackable
    .map(z => ({ z, v: cpuAttackValueOf(p.attackerPower(z), p.facingPower(z)) }))
    .sort((a, b) => (VALUE_ORDER[a.v] - VALUE_ORDER[b.v]) || (a.z - b.z));
  return scored[0].z;
}

/**
 * 盤面のゾーン `zi` の正面（`2 - zi`）にいる相手シグニの実効パワー（空なら `null`）。
 *
 * ⚠**盤面は左右反転する**＝facing は `2 - zi`（engine 共通規約）。ここを `zi` にすると
 * 「正面が空だと思って突っ込む」形の静かな誤判定になる（`hasIncomingThreat` と同じ罠）。
 */
export function facingSigniPower(
  defender: PlayerState,
  zone: number,
  powers: Map<string, number>,
  cardMap: Map<string, CardData>,
): number | null {
  const facing = defender.field.signi[2 - zone]?.at(-1);
  if (!facing) return null;
  return effectivePowerOf(facing, powers, cardMap);
}

/** 実効パワー（`calcFieldPowers` にあればそれ／無ければ印刷パワー。`∞` は `Infinity`）。 */
export function effectivePowerOf(
  instId: string,
  powers: Map<string, number>,
  cardMap: Map<string, CardData>,
): number {
  const fromMap = powers.get(instId);
  if (fromMap !== undefined) return fromMap;
  const raw = cardMap.get(instId)?.Power ?? '';
  if (raw === '∞') return Infinity;
  return parseInt(raw, 10) || 0;
}
