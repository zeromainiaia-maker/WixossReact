import type { CardData, PlayerState } from '../../types';
import type { CardEffect } from '../../types/effects';
import { getCardNum } from '../../engine/execUtils';
import { activatedEnergyCostStr, selectEnergyIndicesForCost, type CpuEnergyReserve } from './cpuActivate';
import { pickCpuHandLimitDiscards } from './cpuHandLimit';
import { evaluateBoard, simulateEffect, type LookaheadCtx } from './cpuLookahead';
import { canAddTrashExileIndex, exceedPoolOf, type WholeEnergyCostSubstituteOption } from './costs';
import type { EnergyPayEntry } from './energyPaySource';
import { handActivateFieldTrashZones, payHandActivateCost } from './handActivateCost';
import { listOffFieldActivatableEffects, type OffFieldZone } from './offFieldActivateGate';
import {
  emptyTrashActivateSelections, payTrashActivateCost, trashActivateHandDiscard, trashActivateTrashExile,
  type TrashActivateSelections,
} from './trashActivateCost';

/**
 * 🆕**CPU が場以外の【起】を使う**（§5.7 `S-7`・2026-09-17・ユーザー指示「`WD08-009` のようにトラッシュで起動効果を
 * 発動するカードは重要なので CPU にも使えるようにしてほしい」）。
 *
 * ■ 規律（§5.6.3）＝**提示の判定は人間と同じ** `listOffFieldActivatableEffects`／**支払いは人間と同じ** `payTrashActivateCost`
 *   （手札は `executeHandActivated` と同じ形）。ここは「通った候補から選ぶ」だけ。
 * ■ 選び方＝支払ったあとの盤面で効果を先読み（`cpuLookahead.ts`）し、**使う前より良くなる**もののうち一番得なもの。
 *   先読みで解決しきれない形は「得 0」として使ってよい扱い（場のシグニ【起】と同じ＝使える【起】は使う）。
 *   エナはグロウ用の予約（`cpuGrowReserve.ts`）を守る。
 * ■ 1回の呼び出しで1つだけ＝実行後はスタック解決を待って CPU ループが再入する（場の【起】と同じ）。
 */
export interface CpuOffFieldChoice {
  zone: OffFieldZone;
  /** そのゾーンにある instance ID。 */
  cardNum: string;
  /** 手札のときの添字（`executeHandActivated` に渡す）。 */
  handIndex: number;
  effect: CardEffect;
  /** トラッシュ／エナ＝`executeTrashActivated` に渡す選択（`energy` はエナ支払い元 pool の index）。手札は `energy` だけ使う。 */
  selections: TrashActivateSelections;
  /** 🆕§5.3 `O-533`＝手札の【起】の `fieldTrash` で場からトラッシュに置くゾーン（手札以外は空）。 */
  fieldTrash: Set<number>;
  /** 先読みの増分（解決しきれなければ null）。 */
  gain: number | null;
}

/** CPU の同じ効果を1ターンに撃ち直さない台帳のキー（同名の別カードは別に数える）。 */
export const cpuOffFieldLedgerKey = (effectId: string, cardNum: string) => `${effectId}@${cardNum}`;

/** 場以外の【起】の支払いを CPU が選ぶ（払えなければ null）。 */
function selectOffFieldCost(
  zone: OffFieldZone, cardNum: string, effect: CardEffect, actor: PlayerState, opponent: PlayerState,
  p: {
    cardMap: Map<string, CardData>; cards: CardData[]; energyPool: readonly EnergyPayEntry[];
    isAffordable: (selectedNums: string[], costStr: string) => boolean;
    wholeSubstitutes?: readonly WholeEnergyCostSubstituteOption[];
    energyReserve?: CpuEnergyReserve;
    effectsOf?: (id: string) => readonly CardEffect[];
  },
): TrashActivateSelections | null {
  const energy = selectEnergyIndicesForCost({
    poolNums: p.energyPool.map(e => e.cardNum), cards: p.cards, costStr: activatedEnergyCostStr(effect),
    isAffordable: p.isAffordable, wholeSubstitutes: p.wholeSubstitutes, reserve: p.energyReserve,
  });
  if (!energy) return null;
  const sel: TrashActivateSelections = { ...emptyTrashActivateSelections(), energy };
  if (zone === 'hand') return sel;
  // 手札を捨てるコスト＝強さの低い札から（`pickCpuHandLimitDiscards` と同じ並び）。
  const hd = trashActivateHandDiscard(effect.cost);
  if (hd) {
    const matching = actor.hand.map((id, i) => ({ id, i })).filter(({ id }) => hd.matches(p.cardMap.get(id) ?? p.cardMap.get(getCardNum(id))));
    if (matching.length < hd.count) return null;
    const picked = pickCpuHandLimitDiscards(matching.map(m => m.id), hd.count, p.cardMap, p.effectsOf);
    sel.handDiscard = new Set(picked.map(k => matching[k].i));
  }
  // トラッシュの札を除外するコスト＝効果元自身は最後に回す（場に出す【起】が自分を見失わない）。
  const te = trashActivateTrashExile(effect.cost);
  if (te) {
    const order = actor.trash.map((_, i) => i)
      .sort((a, b) => Number(actor.trash[a] === cardNum) - Number(actor.trash[b] === cardNum) || a - b);
    const chosen = new Set<number>();
    for (const i of order) {
      if (chosen.size >= (te.count ?? 0)) break;
      if (canAddTrashExileIndex(actor.trash, chosen, i, te, p.cardMap)) chosen.add(i);
    }
    sel.trashExile = chosen;
  }
  const exceed = effect.cost?.exceed ?? 0;
  if (exceed > 0) sel.exceed = new Set(exceedPoolOf(actor).slice(0, exceed).map((_, i) => i));
  // 支払えるかは人間と同じ支払い関数で検算する。
  return payTrashActivateCost(effect, actor, opponent, sel, p.cardMap, p.energyPool, cardNum) ? sel : null;
}

/**
 * 手札の【起】の `fieldTrash`（場の自分シグニをトラッシュ）＝**強さの低いシグニから**選ぶ（足りなければ null）。
 * 強さ＝レベル→パワー（効果込みが無ければ印刷値）の昇順。
 */
export function pickCpuHandActivateFieldTrash(
  effect: CardEffect, actor: PlayerState, cardMap: Map<string, CardData>, effectivePowers?: Map<string, number>,
): Set<number> | null {
  const ft = effect.cost?.fieldTrash;
  if (!ft) return new Set();
  const strength = (zi: number) => {
    const top = actor.field.signi[zi]!.at(-1)!;
    const c = cardMap.get(getCardNum(top));
    return [parseInt(c?.Level ?? '0', 10) || 0, effectivePowers?.get(top) ?? (parseInt(c?.Power ?? '0', 10) || 0)] as const;
  };
  const zones = handActivateFieldTrashZones(effect, actor, cardMap)
    .sort((a, b) => strength(a)[0] - strength(b)[0] || strength(a)[1] - strength(b)[1] || a - b);
  if (zones.length < ft.count && !ft.upToCount) return null;
  return new Set(zones.slice(0, ft.count));
}

/** 支払ったあとの盤面（先読み用）。払えなければ null。 */
function paidBoard(
  choice: Pick<CpuOffFieldChoice, 'zone' | 'cardNum' | 'handIndex' | 'effect' | 'selections' | 'fieldTrash'>,
  actor: PlayerState, opponent: PlayerState, cardMap: Map<string, CardData>, energyPool: readonly EnergyPayEntry[],
): { cpu: PlayerState; opp: PlayerState } | null {
  if (choice.zone !== 'hand') {
    const pay = payTrashActivateCost(choice.effect, actor, opponent, choice.selections, cardMap, energyPool, choice.cardNum);
    return pay ? { cpu: pay.my, opp: pay.op ?? opponent } : null;
  }
  // 手札＝`executeHandActivated` と同じ支払い関数（エナ・自分を捨てる・相手のウィルス・場のシグニ）。
  const pay = payHandActivateCost({
    effect: choice.effect, my: actor, op: opponent, cardNum: choice.cardNum, handIndex: choice.handIndex,
    selections: { energy: choice.selections.energy, fieldTrash: choice.fieldTrash }, cardMap, energyPool,
  });
  return pay ? { cpu: pay.my, opp: pay.op ?? opponent } : null;
}

export interface CpuOffFieldPickInput {
  actor: PlayerState;
  opponent: PlayerState;
  effectsMap: Map<string, CardEffect[]>;
  cardMap: Map<string, CardData>;
  cards: CardData[];
  /**
   * CPU のターンの窓（`MAIN`／`ATTACK_ARTS`）か、🆕**人間のターンのアーツステップ（`ATTACK_ARTS_OP`）**＝手札の《アタックフェイズアイコン》【起】で応答する窓。
   * ⚠`ATTACK_ARTS_OP` ではトラッシュ・エナの【起】は提示判定が出さない（自分のターンだけの窓）。
   */
  phase: 'MAIN' | 'ATTACK_ARTS' | 'ATTACK_ARTS_OP';
  /** `buildEnergyPayPool(actor, ...)`。 */
  energyPool: readonly EnergyPayEntry[];
  /** このターン CPU が既に撃ったキー（`cpuOffFieldLedgerKey`）。 */
  alreadyActivated: readonly string[];
  isAffordable: (selectedNums: string[], costStr: string) => boolean;
  wholeSubstitutes?: readonly WholeEnergyCostSubstituteOption[];
  effectivePowers?: Map<string, number>;
  energyReserve?: CpuEnergyReserve;
  /** 先読み（省略時は先読みせず、見つけた順の最初の1つ）。 */
  lookahead?: LookaheadCtx;
}

/**
 * 🆕§5.7 `S-15`＝CPU が**いま撃てる**場以外の【起】を全部（トラッシュ→手札→エナ・ゾーン内の順・遅延評価）。
 * 支払いの内訳まで決めた形で出す（`gain` は null）＝列挙に出た候補はそのまま実行できる。
 */
export function* iterCpuOffFieldActivated(p: CpuOffFieldPickInput): Generator<CpuOffFieldChoice> {
  const { actor, opponent, cardMap } = p;
  const isMyTurn = p.phase !== 'ATTACK_ARTS_OP';
  const zones: { zone: OffFieldZone; ids: readonly string[] }[] = [
    { zone: 'trash', ids: actor.trash },
    { zone: 'hand', ids: actor.hand },
    { zone: 'energy', ids: actor.energy },
  ];
  for (const { zone, ids } of zones) {
    const seen = new Set<string>();
    for (let index = 0; index < ids.length; index++) {
      const cardNum = ids[index];
      if (seen.has(cardNum)) continue;
      seen.add(cardNum);
      const effects = listOffFieldActivatableEffects({
        zone, cardNum, my: actor, op: opponent, turnPhase: p.phase, isMyTurn,
        cardMap, effectsMap: p.effectsMap, effectivePowers: p.effectivePowers, energyPool: p.energyPool,
      });
      for (const effect of effects) {
        if (p.alreadyActivated.includes(cpuOffFieldLedgerKey(effect.effectId, cardNum))) continue;
        const selections = selectOffFieldCost(zone, cardNum, effect, actor, opponent, {
          cardMap, cards: p.cards, energyPool: p.energyPool, isAffordable: p.isAffordable,
          wholeSubstitutes: p.wholeSubstitutes, energyReserve: p.energyReserve, effectsOf: p.lookahead?.effectsOf,
        });
        if (!selections) continue;
        const fieldTrash = zone === 'hand' ? pickCpuHandActivateFieldTrash(effect, actor, cardMap, p.effectivePowers) : new Set<number>();
        if (!fieldTrash) continue;
        const choice: CpuOffFieldChoice = { zone, cardNum, handIndex: zone === 'hand' ? index : -1, effect, selections, fieldTrash, gain: null };
        // 手札は選んだ支払いを実行関数と同じ関数で検算する（先読みなしでも払えない形を返さない）。
        if (zone === 'hand' && !paidBoard(choice, actor, opponent, cardMap, p.energyPool)) continue;
        yield choice;
      }
    }
  }
}

export function listCpuOffFieldActivated(p: CpuOffFieldPickInput): CpuOffFieldChoice[] {
  return [...iterCpuOffFieldActivated(p)];
}

export function pickCpuOffFieldActivated(p: CpuOffFieldPickInput): CpuOffFieldChoice | null {
  const { actor, opponent, cardMap } = p;
  if (!p.lookahead) return iterCpuOffFieldActivated(p).next().value ?? null;
  const isMyTurn = p.phase !== 'ATTACK_ARTS_OP';
  const before = evaluateBoard(actor, opponent, p.lookahead);
  let best: CpuOffFieldChoice | null = null;
  for (const choice of iterCpuOffFieldActivated(p)) {
    const paid = paidBoard(choice, actor, opponent, cardMap, p.energyPool);
    if (!paid) continue;
    const after = simulateEffect(choice.effect, choice.cardNum, paid.cpu, paid.opp, { ...p.lookahead, turnPhase: p.phase, isCpuTurn: isMyTurn });
    choice.gain = after ? evaluateBoard(after.cpu, after.opp, p.lookahead) - before : null;
    // 使う前より悪くなるもの（払ったエナ・捨てた札のぶん損）は使わない。
    if (choice.gain !== null && choice.gain <= 0) continue;
    if (!best || (choice.gain ?? 0) > (best.gain ?? 0)) best = choice;
  }
  return best;
}
