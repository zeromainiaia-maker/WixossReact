import type { CardData, PlayerState } from '../../types';
import type { CardEffect } from '../../types/effects';
import { getCardNum } from '../../engine/execUtils';
import { cardStrength } from './cpuCardStrength';
import { DEFAULT_CPU_POLICY, type CpuPolicy } from './cpuPolicy';
import { pickCpuEnergyChargeIndex, spellChargeKeep, type CpuChargeCtx } from './cpuHandLimit';
import type { EnergyChargeSource } from './controller/performEnergyCharge';

/**
 * 🆕**エナチャージで「何を置くか」を選ぶ**（§5.7 `S-28`・2026-09-21）＝**手札 ＋ 場のシグニ**から1つ。
 *
 * ■ 🔴**なぜ場のシグニが要るか（ユーザー指摘 2026-09-21）**＝**人間は前から場のシグニをエナへ置ける**のに、
 *   **CPU は手札しか見ておらず、一度も踏んだことが無かった**。
 *   🔑**良い手になる場面**＝**自分のシグニの正面にそれより大きいシグニがいて、場に残しても邪魔なとき**＝
 *   チャージに回せば**手札を減らさずにレーンを空けられる**。
 *   ⚠**ENERGY → GROW → MAIN の順**なので、**空けたレーンは同じターンに強い札で埋め直せる**（だから損にならない）。
 *
 * ■ 🔴**自分で盤面を薄くしないための門は2つ**（どちらも実測で決めた条件）
 *   ① **正面に格上がいる**（そのシグニはバトルで落ちる＝残しても稼がない）。
 *   ② **手札に「そのゾーンの置き換え」がある**（いま出せる＝レベル ≦ ルリグレベル、かつ**より強い**シグニ）。
 *   ⇒ ②が無いのに置くと**ただレーンが空いてライフに通る**。
 * 📏**母集団の実測（6デッキ・ENERGY の盤面）**＝①が立つのは **WD13 57% / WD06 33% / ケトッシー軸 0%**、
 *   ①∧② は **WD13 56% / WD06 24% / ケトッシー軸 0%**＝**山によるが実在する**（ケトッシー軸は場が埋まらない山）。
 *
 * ■ ⚠**ここは「選ぶ側」**＝列挙（`cpuMoves.listCpuEnergyCharges`）は絞らない。実行は `performEnergyCharge` の1本。
 */
export interface CpuEnergyChargeInput {
  actor: PlayerState;
  opponent: PlayerState;
  cardMap: Map<string, CardData>;
  effectsOf: (id: string) => readonly CardEffect[];
  /**
   * 札の価値を測るルリグレベル＝**このターンのメインでのレベル**（`mainPhaseLrigLevel`＝グロウ後）。
   * ⚠いまのレベルを渡すと、このターンに出す札を「出せない札」と見てエナへ置く（2026-09-22 に直した）。
   */
  lrigLevel: number;
  /** §5.7 `S-2`＝作戦データの「手元に置く価値」。 */
  keepBonus?: (id: string) => number;
  policy?: CpuPolicy;
  /** §5.7 `S-26`＝次のグロウに要る色・空きゾーン数。 */
  charge?: CpuChargeCtx;
  /** 実効パワー（`calcFieldPowers`）。省略時は印刷パワー。 */
  powers?: Record<string, number>;
}

/**
 * 🆕🔴**エナチャージで札の価値を測るときのルリグレベル**（2026-09-22・ユーザー指摘）＝**このターンのメインで立っているはずのレベル**。
 *
 * ■ **なぜ要るか**＝エナフェイズは**グロウより前**なので、いまのレベル（例 Lv0）で「いま出せる札」を判定すると、
 *   **このターンのメインで出すはずの Lv1 シグニが「出せない札」扱い**になり温存の補正（`chargeKeepPlayable`）が効かない
 *   ⇒ パワーの小さい Lv1 がいちばん安い札としてエナへ行く。
 *   📏実測（CPU デッキ6つ × 2戦）＝ルリグ Lv≦1 の手札チャージ 48回のうち **Lv1 シグニが21回**、ほぼ全部が T1・T2（ルリグ Lv0）で、
 *   手札に Lv3・Lv4 やスペルがあるのに Lv1 を置いていた。
 * 🔑**札の価値は自分のルリグレベルで変わる**（ユーザー）＝基準は「グロウ後」のレベル。
 * ⚠**グロウできる見込み**＝ルリグデッキに「いまのレベル＋1」のルリグがいて、グロウを禁じられていないこと
 *   （コストは見ない＝グロウは最優先で払いに行く／払えない色は `chargeNeedColors` が別に確保しに行く）。
 */
export function mainPhaseLrigLevel(actor: PlayerState, cardMap: Map<string, CardData>): number {
  const levelOf = (id: string | undefined) => (id ? parseInt(cardMap.get(getCardNum(id))?.Level ?? '', 10) || 0 : 0);
  const cur = levelOf(actor.field.lrig.at(-1));
  if (actor.blocked_actions?.includes('GROW')) return cur;
  const canGrow = actor.lrig_deck.some(id => cardMap.get(getCardNum(id))?.Type === 'ルリグ' && levelOf(id) === cur + 1);
  return canGrow ? cur + 1 : cur;
}

const powerOf = (id: string | undefined, cardMap: Map<string, CardData>, powers?: Record<string, number>): number => {
  if (!id) return -1;
  if (powers && powers[id] !== undefined) return powers[id];
  const raw = cardMap.get(getCardNum(id))?.Power ?? '';
  return raw === '∞' ? 1e6 : (parseInt(raw, 10) || 0);
};

/**
 * 🔴**そのゾーンのシグニをエナへ回してよいか**（上の門①②）。
 * ⚠**正面は左右が反転する**（自分の 0 は相手の 2）＝ここを間違えると**まったく別のシグニを見て判断する**。
 */
export function fieldChargeAllowed(p: CpuEnergyChargeInput, zone: number): boolean {
  const mine = p.actor.field.signi[zone]?.at(-1);
  if (!mine) return false;
  const theirs = p.opponent.field.signi[2 - zone]?.at(-1);
  const minePower = powerOf(mine, p.cardMap, p.powers);
  // ① 正面に格上がいる（いなければ、そのシグニは仕事をしている）。
  if (!theirs || powerOf(theirs, p.cardMap, p.powers) <= minePower) return false;
  // ② いま出せて、かつ今より強い札が手札にある（無ければレーンが空くだけ）。
  return p.actor.hand.some(id => {
    const c = p.cardMap.get(getCardNum(id));
    if (c?.Type !== 'シグニ') return false;
    const lv = parseInt(c.Level ?? '', 10) || 0;
    return lv <= p.lrigLevel && powerOf(id, p.cardMap) > minePower;
  });
}

/**
 * エナチャージの選択（手札 ＋ 場のシグニ）。**置くものが無ければ null**。
 *
 * 🔑**比べ方**＝手札側は従来どおり `pickCpuEnergyChargeIndex`（`S-1`／`S-26` の補正つき）。
 *   場のシグニは**盤面での価値**（`cardStrength(…, 'field')`）から `chargeFieldBlocked` を引いた値で比べる
 *   ＝**「正面に格上がいて落ちる札」は盤面に残る価値が低い**ぶんだけエナへ回しやすくなる。
 * ⚠**同点なら手札**（従来の挙動を既定に寄せる＝新しい機構を勝手に優先しない）。
 */
export function pickCpuEnergyCharge(p: CpuEnergyChargeInput): EnergyChargeSource | null {
  const W = p.policy ?? DEFAULT_CPU_POLICY;
  const handIndex = pickCpuEnergyChargeIndex(p.actor.hand, p.cardMap, id => p.effectsOf(id), p.lrigLevel, p.keepBonus, p.policy, p.charge);
  const handPick: EnergyChargeSource | null = handIndex >= 0 ? { from: 'hand', handIndex } : null;
  if (W.chargeFieldBlocked <= 0) return handPick;
  const handValue = handIndex >= 0
    ? cardStrength(p.cardMap.get(getCardNum(p.actor.hand[handIndex])), p.effectsOf(p.actor.hand[handIndex]), 'deploy', undefined, p.policy)
      + (p.keepBonus?.(p.actor.hand[handIndex]) ?? 0)
      // 🆕2026-09-26＝スペルは手札に残す（手札どうしの比較と同じ加点）。
      + spellChargeKeep(p.cardMap.get(getCardNum(p.actor.hand[handIndex])), p.policy)
    : Number.POSITIVE_INFINITY;
  let best: { zone: number; value: number } | null = null;
  for (let zone = 0; zone < p.actor.field.signi.length; zone++) {
    if (!fieldChargeAllowed(p, zone)) continue;
    const id = p.actor.field.signi[zone]!.at(-1)!;
    const value = cardStrength(p.cardMap.get(getCardNum(id)), p.effectsOf(id), 'field', powerOf(id, p.cardMap, p.powers), p.policy)
      - W.chargeFieldBlocked;
    if (!best || value < best.value) best = { zone, value };
  }
  // ⚠**厳密に安いときだけ場から置く**（同点は手札＝従来の挙動）。
  return best && best.value < handValue ? { from: 'field', zone: best.zone } : handPick;
}
