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
 * そこで **「他の残りゾーンぶんのレベルを先に取り置く」** ＝
 * `この札のレベル + （残りゾーン数-1 体ぶんの最小レベル合計） ≤ 残りリミット` を満たす札の中から
 * **パワー最大**を選ぶ（同点はレベル大 → 候補配列の順）。これで「埋まる体数は維持したまま、いちばん強い札」になる。
 *
 * ⚠**取り置きは「他の候補の実レベル」で計算する**（`1` 固定にしない）＝手札が Lv3 ばかりのときに
 * 「Lv1が来る前提」で取り置くと、結局2体目が置けずリミットだけ余る。
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
  /** この札を出したあと、他の残りゾーンを埋めるために取り置くレベル合計。 */
  const reserveFor = (pick: CpuDeployCandidate): number => {
    const others = candidates.filter(c => c !== pick).map(c => c.level).sort((a, b) => a - b);
    const k = Math.max(0, Math.min(zonesRemaining - 1, others.length));
    return others.slice(0, k).reduce((s, lv) => s + lv, 0);
  };
  const better = (a: CpuDeployCandidate, b: CpuDeployCandidate) =>
    (b.power - a.power) || (b.level - a.level) || (candidates.indexOf(a) - candidates.indexOf(b));
  // ①「残りゾーンを埋められる」札の中で最強。
  const keepsBoardWide = fits.filter(c => c.level + reserveFor(c) <= remainingLimit);
  if (keepsBoardWide.length > 0) return [...keepsBoardWide].sort(better)[0].id;
  // ②どう置いても残りゾーンが埋まらないなら、**リミットに入る中で最強**を出す（1体でも強い方がよい）。
  return [...fits].sort(better)[0].id;
}

/** アタック1回ぶんの見積り（`pickCpuAttackZone` の内部表現・golden から読めるよう export）。 */
export type CpuAttackValue =
  /** 正面が空＝ライフクロスに通る（最優先）。 */
  | 'life'
  /** 正面にいるが**こちらのパワーが上**＝相手シグニを退けられる。 */
  | 'winBattle'
  /** 正面と**同値**＝相打ち（v1 は撃たない）。 */
  | 'trade'
  /** 正面が**格上**＝自分だけ落ちる（v1 は撃たない）。 */
  | 'suicide';

/** ゾーン1つのアタック価値。`facingPower` が `null` なら正面が空。 */
export function cpuAttackValueOf(attackerPower: number, facingPower: number | null): CpuAttackValue {
  if (facingPower === null) return 'life';
  if (attackerPower > facingPower) return 'winBattle';
  if (attackerPower === facingPower) return 'trade';
  return 'suicide';
}

const VALUE_ORDER: Record<CpuAttackValue, number> = { life: 0, winBattle: 1, trade: 2, suicide: 3 };

/**
 * CPU が**次にアタックさせるシグニのゾーン**を選ぶ（撃つ価値が無ければ `null`＝アタックステップを終える）。
 *
 * 🔴**旧実装は `findIndex`＝ゾーン0から順に全部アタック**だった＝正面に格上がいても突っ込み、
 * **自分のシグニだけが落ちる**（相手は無傷でこちらの盤面だけ減る）。
 *
 * v1 の順序は **ライフに通る → 勝てるバトル →（撃たない）**：
 *   - `life`＝正面が空＝そのままライフクロスを削れる。**最優先**。
 *   - `winBattle`＝正面より強い＝相手の壁を退けられる。
 *   - `trade`（相打ち）／`suicide`（格上）＝**撃たない**＝盤面を残す。
 *     ⚠これは「打点を捨てる」判断でもある（相打ちで壁を退けたい局面はある）。v1 は**盤面維持に倒す**＝
 *     読みの浅い CPU が毎ターン自分の場を溶かして事故る方が体験として悪い、という判断。広げるなら
 *     「相手のライフが残り1ならトレードしてでも通す」等の条件つきで `trade` を解禁する。
 *
 * ⚠**強制アタック（「可能ならばアタックしなければならない」）は無条件で最優先**＝ルール由来の義務なので
 * 価値評価より先。⚠**同点は必ずゾーン番号昇順**で解決する（実機シナリオの再現性）。
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
    .filter(s => s.v === 'life' || s.v === 'winBattle')
    .sort((a, b) => (VALUE_ORDER[a.v] - VALUE_ORDER[b.v]) || (a.z - b.z));
  return scored.length > 0 ? scored[0].z : null;
}

/**
 * 盤面のゾーン `zi` の正面（`2 - zi`）にいる相手シグニの実効パワー（空なら `null`）。
 *
 * ⚠**盤面は左右反転する**＝facing は `2 - zi`（engine 共通規約）。ここを `zi` にすると
 * 「正面が空だと思って突っ込む」形の静かな誤判定になる（`hasIncomingThreat` と同じ罠）。
 */
export function facingSigniPower(
  attacker: PlayerState,
  defender: PlayerState,
  zone: number,
  powers: Map<string, number>,
  cardMap: Map<string, CardData>,
): number | null {
  void attacker;
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
