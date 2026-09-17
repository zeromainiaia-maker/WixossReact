import type { CardData, PlayerState } from '../../types';
import type { CardEffect, EffectCost } from '../../types/effects';
import { planEnergyPayment, type EnergyPayEntry } from './energyPaySource';
import { fieldTrashCostCountOk, payFieldTrashCost } from './fieldTrashCost';
import { fieldTrashSelectableZones } from './fieldLimit';

/**
 * **手札の【起】のコスト**（提示の可否・支払い）の1本。
 *
 * 🆕§5.3 `O-533`（2026-09-18）で `BattleScreen.executeHandActivated` の手書き支払いから切り出した。
 * 人間の実行（`executeHandActivated`）・CPU の先読み（`cpuOffFieldActivate.ts`）・提示判定（`offFieldActivateGate.ts`）が同じ関数を呼ぶ。
 *
 * 🔴旧実装は**コストに `discardSelfFromHand` が無くても常にこのカードを捨てていた**。
 *   `WX18-036-E3`「このカードを手札から**公開し**、あなたの＜悪魔＞のシグニ２体を場からトラッシュに置く：このシグニをあなたの手札から場に出す」は
 *   公開（宣言）であって捨てるコストではない＝捨てると `ADD_TO_FIELD{HAND_CARD}` の出す札が手札に無く、何も出なかった。
 *   ⚠手札の【起】の live 10効果のうち、自分を捨てる9効果はすべて `discardSelfFromHand:true` を明示している（2026-09-18 実測）。
 */

/** 手札の【起】で払えるコストキー。**ここに無いキーが付いた効果は提示しない**。 */
const HAND_SUPPORTED_COST_KEYS: ReadonlySet<string> = new Set(['energy', 'discardSelfFromHand', 'removeOppVirus', 'fieldTrash']);

/** 手札の【起】で払えないコストキー（空なら払える形）。 */
export function unsupportedHandActivateCostKeys(cost: EffectCost | undefined): string[] {
  if (!cost) return [];
  return Object.entries(cost)
    .filter(([k, v]) => (Array.isArray(v) ? v.length > 0 : Boolean(v)) && !HAND_SUPPORTED_COST_KEYS.has(k))
    .map(([k]) => k);
}

export interface HandActivateSelections {
  /** エナ支払い元プールのインデックス。 */
  energy: Set<number>;
  /** `fieldTrash` で場からトラッシュに置くシグニゾーン。 */
  fieldTrash: Set<number>;
}

export const emptyHandActivateSelections = (): HandActivateSelections => ({ energy: new Set(), fieldTrash: new Set() });

/** `fieldTrash` の候補ゾーン（効果元は手札にいるので自分を除く規則は無い）。 */
export function handActivateFieldTrashZones(effect: CardEffect, my: PlayerState, cardMap: Map<string, CardData>): number[] {
  const ft = effect.cost?.fieldTrash;
  return ft ? fieldTrashSelectableZones({ count: ft.count, filter: ft.filter }, my, cardMap) : [];
}

const oppVirusTotal = (op: PlayerState) => (op.field.signi_virus ?? []).reduce((s, v) => s + v, 0);

/** エナ以外の自動判定できるコスト（ウィルス・場のシグニの体数）が足りているか。エナは支払いモーダル／CPU が権威関数で決める。 */
export function canOfferHandActivate(effect: CardEffect, my: PlayerState, op: PlayerState, cardMap: Map<string, CardData>): boolean {
  if (unsupportedHandActivateCostKeys(effect.cost).length > 0) return false;
  const virus = effect.cost?.removeOppVirus ?? 0;
  if (virus > 0 && oppVirusTotal(op) < virus) return false;
  const ft = effect.cost?.fieldTrash;
  if (ft && !ft.upToCount && handActivateFieldTrashZones(effect, my, cardMap).length < ft.count) return false;
  return true;
}

/** `fieldTrash` の選択が支払いとして成立しているか（候補外の混入も弾く）。 */
export function handActivateFieldTrashOk(effect: CardEffect, my: PlayerState, zones: ReadonlySet<number>, cardMap: Map<string, CardData>): boolean {
  const ft = effect.cost?.fieldTrash;
  if (!ft) return zones.size === 0;
  const selectable = new Set(handActivateFieldTrashZones(effect, my, cardMap));
  return fieldTrashCostCountOk(ft, zones.size) && [...zones].every(zi => selectable.has(zi));
}

export interface HandActivatePayment {
  my: PlayerState;
  /** ウィルスを取り除いたときだけ（相手の state）。 */
  op: PlayerState | null;
  /** コストで手札から捨てたカード（`discardSelfFromHand` のときだけ自分）。 */
  discardedCards: string[];
  logs: string[];
}

/**
 * 手札の【起】のコストを払う（払えなければ null）。回数制限の記録（`actions_done`）は呼び出し側。
 * ⚠`fieldTrash` は `payFieldTrashCost`（場のシグニ【起】と同じ funnel）＝`last_cost_trashed_cards` に載るので、
 *   中央 diff でコストによる離場（`byEffectCause=false`）として扱われる。
 */
export function payHandActivateCost(p: {
  effect: CardEffect;
  my: PlayerState;
  op: PlayerState;
  cardNum: string;
  handIndex: number;
  selections: HandActivateSelections;
  cardMap: Map<string, CardData>;
  energyPool: readonly EnergyPayEntry[];
}): HandActivatePayment | null {
  const { effect, my, op, cardNum } = p;
  const cost = effect.cost;
  if (unsupportedHandActivateCostKeys(cost).length > 0) return null;
  if (my.hand[p.handIndex] !== cardNum) return null;
  if (!handActivateFieldTrashOk(effect, my, p.selections.fieldTrash, p.cardMap)) return null;
  const logs: string[] = [];
  // removeOppVirus（WX21-030）＝左のシグニゾーンから順に取り除く（【起】/【出】経路と同じ決定論）。
  let newOp: PlayerState | null = null;
  const virusNeeded = cost?.removeOppVirus ?? 0;
  if (virusNeeded > 0) {
    const v = [...(op.field.signi_virus ?? [0, 0, 0])];
    let removed = 0;
    for (let zi = 0; zi < v.length && removed < virusNeeded; zi++) {
      while (v[zi] > 0 && removed < virusNeeded) { v[zi]--; removed++; }
    }
    if (removed < virusNeeded) return null;
    newOp = { ...op, field: { ...op.field, signi_virus: v } };
  }
  const plan = planEnergyPayment(my, p.energyPool, p.selections.energy);
  const discardSelf = cost?.discardSelfFromHand === true;
  let next: PlayerState = plan.applyTo({
    ...my,
    hand: discardSelf ? my.hand.filter((_, i) => i !== p.handIndex) : my.hand,
    trash: [...my.trash, ...plan.paidNums, ...(discardSelf ? [cardNum] : [])],
  });
  if (cost?.fieldTrash) {
    const ft = payFieldTrashCost({ state: { ...next, last_cost_trashed_cards: [] }, zones: p.selections.fieldTrash, cost, cardMap: p.cardMap });
    next = ft.state;
    if (ft.log) logs.push(ft.log);
  }
  return { my: next, op: newOp, discardedCards: discardSelf ? [cardNum] : [], logs };
}

/**
 * 手札のカードアクションのボタン文言（`【起】` の後ろ）。捨てる9効果は従来の文言のまま
 * （`エナN・手から捨て`／`ウィルスN除去・手から捨て`／`手から捨て`）。
 */
export function handActivateCostLabel(effect: CardEffect): string {
  const cost = effect.cost;
  const energyTotal = (cost?.energy ?? []).reduce((s, c) => s + c.count, 0);
  const virus = cost?.removeOppVirus ?? 0;
  const ft = cost?.fieldTrash;
  const story = ft?.filter?.story;
  return [
    ...(energyTotal > 0 ? [`エナ${energyTotal}`] : virus > 0 ? [`ウィルス${virus}除去`] : []),
    ...(ft ? [`場の${story ? (Array.isArray(story) ? story : [story]).map(x => `＜${x}＞`).join('か') : 'シグニ'}${ft.count}体トラッシュ`] : []),
    cost?.discardSelfFromHand ? '手から捨て' : '手札から公開',
  ].join('・');
}

/** スタックのラベル（「手から捨て」は捨てるときだけ）。 */
export function handActivateVerbLabel(effect: CardEffect): string {
  return effect.cost?.discardSelfFromHand ? '手から捨て' : '手札から公開';
}
