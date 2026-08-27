// トラッシュ自己起動【起】（「このシグニをトラッシュから場に出す」）のコスト支払い（PLAN §6.4）。
// ⚠ 効果元カード自身はトラッシュに残す＝場へ移すのは resolver の execAddToField。ここで払うのは
//   「それ以外の」コストだけ。カード自身を trash から抜くと ADD_TO_FIELD が source を見失う。
// ⚠ 対象14枚の共通穴なので**支払いはここ1本**。モーダル／アクション出し分け／実行の3箇所が
//   同じ関数を呼ぶ形にしておかないと、「UIでは押せるのに払われない」型のズレが必ず出る。
import type { CardData, PlayerState } from '../../types';
import type { CardEffect, EffectCost } from '../../types/effects';
import { matchesFilter } from '../../engine/effectExecutor';
import { planEnergyPayment, type EnergyPayEntry } from './energyPaySource';
import {
  activatedDiscardCostRecord, canPayExceed, exceedPoolOf, paySelectedExceed,
  fmtDiscardFilterLabel, fmtHandDiscardSigniLabel, matchesHandDiscardSigni,
} from './costs';
import { payLrigDownCost, fmtLrigDownCostLabel } from './lrigDownCost';

/**
 * このモジュールが払えるコストキー。**ここに無いキーが1つでも付いた効果はUIを出さない**
 * （黙って素通りして「コストなしで場に出る」より、発動できない方が安全側）。
 */
const SUPPORTED_COST_KEYS: ReadonlySet<string> = new Set([
  'energy', 'discard', 'discardFilter', 'handDiscardSigni',
  'coin', 'removeOppVirus', 'charmTrash', 'lrigDown', 'exceed',
]);

/** 値が「指定あり」か（`discard: 0` や空配列は未指定と同じ扱い。旧 `&& v` 判定と互換）。 */
const isSpecified = (v: unknown): boolean => (Array.isArray(v) ? v.length > 0 : Boolean(v));

/** 未対応コストキーの一覧（空なら支払える形）。 */
export function unsupportedTrashActivateCostKeys(cost: EffectCost | undefined): string[] {
  if (!cost) return [];
  return Object.entries(cost)
    .filter(([k, v]) => isSpecified(v) && !SUPPORTED_COST_KEYS.has(k))
    .map(([k]) => k);
}

export interface TrashActivateHandDiscard {
  count: number;
  label: string;
  /** 手札のこの1枚をコストとして捨てられるか。 */
  matches: (card: CardData | undefined) => boolean;
}

/**
 * 手札捨てコストの正規化（`discard`(+`discardFilter`) と `handDiscardSigni` を1つの形に畳む）。
 * 両者は排他（同じ効果に両方は付かない）だが、付いていたら handDiscardSigni を優先する。
 */
export function trashActivateHandDiscard(cost: EffectCost | undefined): TrashActivateHandDiscard | null {
  const hds = cost?.handDiscardSigni;
  if (hds && hds.count > 0) {
    return {
      count: hds.count,
      label: `手札から${fmtHandDiscardSigniLabel(hds)}シグニ${hds.count}枚を捨てる`,
      matches: card => matchesHandDiscardSigni(card, hds),
    };
  }
  const n = cost?.discard ?? 0;
  if (n > 0) {
    const filter = cost?.discardFilter;
    const filterLabel = filter ? fmtDiscardFilterLabel(filter) : '';
    return {
      count: n,
      label: `手札${filterLabel ? `から${filterLabel}` : ''}${n}枚を捨てる`,
      matches: card => !filter || matchesFilter(card, filter),
    };
  }
  return null;
}

export function trashActivateEnergyTotal(cost: EffectCost | undefined): number {
  return (cost?.energy ?? []).reduce((sum, e) => sum + e.count, 0);
}

/** 相手の場にある【ウィルス】の総数。 */
function oppVirusTotal(op: PlayerState): number {
  return (op.field.signi_virus ?? []).reduce((sum, n) => sum + n, 0);
}

function charmTotal(my: PlayerState): number {
  return (my.field.signi_charms ?? []).filter(Boolean).length;
}

/**
 * 選択を伴わない（自動支払い／在庫チェックだけの）コストが払えない理由。払えるなら null。
 * ⚠ 支払い可否は**実際の支払い関数**に判定させる（lrigDown の centerOnly / level 条件を写経しない）。
 */
export function trashActivateAutoCostShortfall(
  effect: CardEffect,
  my: PlayerState,
  op: PlayerState,
  cardMap: Map<string, CardData>,
): string | null {
  const cost = effect.cost;
  if (!cost) return null;
  const coin = cost.coin ?? 0;
  if (coin > 0 && (my.coins ?? 0) < coin) return `《コイン》が足りません（所持${my.coins ?? 0}／必要${coin}）`;
  const virus = cost.removeOppVirus ?? 0;
  if (virus > 0 && oppVirusTotal(op) < virus) return `相手の【ウィルス】が足りません（現在${oppVirusTotal(op)}個／必要${virus}個）`;
  const charm = cost.charmTrash ?? 0;
  if (charm > 0 && charmTotal(my) < charm) return `場の【チャーム】が足りません（現在${charmTotal(my)}枚／必要${charm}枚）`;
  if (cost.lrigDown && payLrigDownCost(my, cost.lrigDown, cardMap) === null) return 'ダウンできるルリグが不足しています';
  if (!canPayExceed(my, cost.exceed ?? 0, cost.exceedColors, cardMap)) return 'ルリグスタックが不足しています';
  return null;
}

/**
 * トラッシュゾーンUIにこの【起】を出してよいか（在庫だけの事前判定）。
 * 選択コスト（エナ／手札捨て／エクシード）は「候補が必要数そろっているか」まで見る。
 */
export function canOfferTrashActivate(
  effect: CardEffect,
  my: PlayerState,
  op: PlayerState,
  cardMap: Map<string, CardData>,
  /** 支払い元プール（§6.4）。省略時はエナゾーンだけ＝従来と同一挙動。 */
  energyPool?: readonly EnergyPayEntry[],
): boolean {
  if (unsupportedTrashActivateCostKeys(effect.cost).length > 0) return false;
  if ((energyPool?.length ?? my.energy.length) < trashActivateEnergyTotal(effect.cost)) return false;
  const hd = trashActivateHandDiscard(effect.cost);
  if (hd && my.hand.filter(num => hd.matches(cardMap.get(num))).length < hd.count) return false;
  return trashActivateAutoCostShortfall(effect, my, op, cardMap) === null;
}

/** モーダルのコスト行（「なし」は呼び出し側で補う）。 */
export function trashActivateCostLabels(effect: CardEffect, my: PlayerState, op: PlayerState): string[] {
  const cost = effect.cost;
  if (!cost) return [];
  const energyTotal = trashActivateEnergyTotal(cost);
  const hd = trashActivateHandDiscard(cost);
  return [
    energyTotal > 0 ? `エナ${energyTotal}枚` : null,
    hd?.label ?? null,
    (cost.coin ?? 0) > 0 ? `《コイン》×${cost.coin}（所持${my.coins ?? 0}）` : null,
    (cost.removeOppVirus ?? 0) > 0
      ? `相手の【ウィルス】${cost.removeOppVirus}個除去（現在${oppVirusTotal(op)}個）` : null,
    (cost.charmTrash ?? 0) > 0
      ? `【チャーム】${cost.charmTrash}枚トラッシュ（現在${charmTotal(my)}枚）` : null,
    cost.lrigDown ? fmtLrigDownCostLabel(cost.lrigDown) : null,
    (cost.exceed ?? 0) > 0 ? `エクシード${cost.exceed}${cost.exceedColors?.length ? `（${cost.exceedColors.join('と')}のカード）` : ''}` : null,
  ].filter((s): s is string => s !== null);
}

export interface TrashActivateSelections {
  /**
   * エナ支払い元プールのインデックス（§6.4 funnel）。**先頭 `my.energy.length` 件は
   * エナゾーンそのもの**なので、pool を渡さない呼び出しでは従来どおり `my.energy` の index。
   */
  energy: Set<number>;
  /** `my.hand` のインデックス（discard / handDiscardSigni 共通）。 */
  handDiscard: Set<number>;
  /** `exceedPoolOf(my)` のインデックス。 */
  exceed: Set<number>;
}

export const emptyTrashActivateSelections = (): TrashActivateSelections => ({
  energy: new Set(), handDiscard: new Set(), exceed: new Set(),
});

/**
 * 選択が必要数そろっているか（フィルタ違反の混入も弾く）。エナの色充足は呼び出し側が別途判定する。
 * ⚠`selections.energy` は枚数しか見ないので pool 由来（エナゾーン外）でもそのまま通る。
 */
export function trashActivateSelectionsSatisfied(
  effect: CardEffect,
  my: PlayerState,
  selections: TrashActivateSelections,
  cardMap: Map<string, CardData>,
): boolean {
  if (selections.energy.size !== trashActivateEnergyTotal(effect.cost)) return false;
  const hd = trashActivateHandDiscard(effect.cost);
  if (hd) {
    if (selections.handDiscard.size !== hd.count) return false;
    if ([...selections.handDiscard].some(i => !hd.matches(cardMap.get(my.hand[i])))) return false;
  } else if (selections.handDiscard.size > 0) return false;
  return selections.exceed.size === (effect.cost?.exceed ?? 0);
}

export interface TrashActivatePayment {
  my: PlayerState;
  /** ウィルス除去が起きたときだけ非 null（相手状態も書き戻す必要がある）。 */
  op: PlayerState | null;
  /** 手札からコストで捨てたカード（ON_DISCARDED_AS_COST / ON_HAND_DISCARDED 用）。 */
  discardedCards: string[];
  /** 支払った《コイン》枚数（ON_COIN_PAID 用）。 */
  coinPaid: number;
}

/**
 * トラッシュ自己起動【起】のコストを支払う。支払い不能なら盤面を変えず null。
 * 効果元カード自身は動かさない（`execAddToField` が後で trash → 場へ移す）。
 */
export function payTrashActivateCost(
  effect: CardEffect,
  my: PlayerState,
  op: PlayerState,
  selections: TrashActivateSelections,
  cardMap: Map<string, CardData>,
  /**
   * エナ支払い元プール（§6.4 funnel）。省略時はエナゾーンだけ＝従来と同一挙動。
   * `selections.energy` はこの pool への index（先頭 `my.energy.length` 件がエナゾーンそのもの）。
   */
  energyPool?: readonly EnergyPayEntry[],
): TrashActivatePayment | null {
  const cost = effect.cost;
  if (unsupportedTrashActivateCostKeys(cost).length > 0) return null;
  if (!trashActivateSelectionsSatisfied(effect, my, selections, cardMap)) return null;

  const pool = energyPool ?? my.energy.map((cardNum, energyIndex) => ({ origin: 'energy' as const, cardNum, energyIndex }));
  const energyPlan = planEnergyPayment(my, pool, selections.energy);
  const energyPaid = energyPlan.paidNums;
  if (energyPaid.length !== selections.energy.size) return null;
  const discardedCards = [...selections.handDiscard].map(i => my.hand[i]);
  if (discardedCards.some(num => num === undefined)) return null;

  const coinPaid = cost?.coin ?? 0;
  if (coinPaid > 0 && (my.coins ?? 0) < coinPaid) return null;

  // removeOppVirus: 左のシグニゾーンから順に取り除く（既存の【起】/【出】経路と同じ決定論）。
  let nextOp: PlayerState | null = null;
  const virusNeeded = cost?.removeOppVirus ?? 0;
  if (virusNeeded > 0) {
    const virus = [...(op.field.signi_virus ?? [0, 0, 0])];
    let removed = 0;
    for (let zi = 0; zi < virus.length && removed < virusNeeded; zi++) {
      while (virus[zi] > 0 && removed < virusNeeded) { virus[zi]--; removed++; }
    }
    if (removed < virusNeeded) return null;
    nextOp = { ...op, field: { ...op.field, signi_virus: virus } };
  }

  let paid: PlayerState = energyPlan.applyTo({
    ...my,
    hand: my.hand.filter((_, i) => !selections.handDiscard.has(i)),
    trash: [...my.trash, ...energyPaid, ...discardedCards],
    coins: coinPaid > 0 ? Math.max(0, (my.coins ?? 0) - coinPaid) : my.coins,
    coins_paid_this_turn: coinPaid > 0 ? (my.coins_paid_this_turn ?? 0) + coinPaid : my.coins_paid_this_turn,
    last_cost_trashed_cards: [...energyPaid, ...discardedCards],
    // 「この【起】のコストで捨てた枚数」の集約は他のコスト経路と同じ入口で作る
    ...activatedDiscardCostRecord(discardedCards.length, 0, 0, 0),
    ...(nextOp ? { opp_virus_removed_just: true } : {}),
  });
  // 「この方法で捨てたシグニ」の参照先（他の【起】コスト経路と同じ規約で記録する）。
  if (discardedCards.length > 0) {
    const first = cardMap.get(discardedCards[0]);
    const level = Number(first?.Level);
    const power = parseInt(first?.Power ?? '', 10);
    paid = {
      ...paid,
      last_discarded_signi_power: Number.isNaN(power) ? paid.last_discarded_signi_power : power,
      last_discarded_signi_level: Number.isFinite(level) ? level : paid.last_discarded_signi_level,
      last_discarded_signi_class: first?.CardClass ?? paid.last_discarded_signi_class,
    };
  }

  // charmTrash: 自分の場の【チャーム】を左のゾーンから自動で外す（既存の【起】経路と同型）。
  const charmNeeded = cost?.charmTrash ?? 0;
  if (charmNeeded > 0) {
    const charms = [...(paid.field.signi_charms ?? [null, null, null])];
    const moved: string[] = [];
    for (let zi = 0; zi < charms.length && moved.length < charmNeeded; zi++) {
      if (charms[zi]) { moved.push(charms[zi]!); charms[zi] = null; }
    }
    if (moved.length < charmNeeded) return null;
    paid = {
      ...paid,
      field: { ...paid.field, signi_charms: charms },
      trash: [...paid.trash, ...moved],
      last_cost_trashed_cards: [...(paid.last_cost_trashed_cards ?? []), ...moved],
    };
  }

  if (cost?.lrigDown) {
    const downed = payLrigDownCost(paid, cost.lrigDown, cardMap);
    if (!downed) return null;
    paid = downed.state;
  }

  const exceedNeeded = cost?.exceed ?? 0;
  if (exceedNeeded > 0) {
    const exceeded = paySelectedExceed(paid, exceedNeeded, selections.exceed, cost?.exceedColors, cardMap);
    if (!exceeded) return null;
    paid = exceeded;
  }

  return { my: paid, op: nextOp, discardedCards, coinPaid };
}

/** エクシードで選べるカード（モーダルの選択肢）。 */
export function trashActivateExceedPool(my: PlayerState): string[] {
  return exceedPoolOf(my);
}
