import type { CardData, PlayerState, TurnPhase } from '../../types';
import type { CardEffect, EffectTiming } from '../../types/effects';
import { evalUseCondition } from '../../engine/effectExecutor';
import { isTrashImmuneByOpponent } from '../../engine/execUtils';
import type { EnergyPayEntry } from './energyPaySource';
import { canOfferHandActivate } from './handActivateCost';
import { canOfferTrashActivate } from './trashActivateCost';

/**
 * 🆕**場以外の【起】の提示判定**（§5.7 `S-7`・2026-09-17）＝トラッシュ／エナゾーン／手札にあるカードの【起】を
 * **いま使えるか**を決める1本。人間のカードアクション（`getMyTrashCardActions`／`getMyEnergyCardActions`／
 * `getMyHandCardActions`）と CPU（`cpuOffFieldActivate.ts`）が**同じ関数**を呼ぶ（§5.6.3＝可否の判定を写経しない）。
 *
 * ■ 窓（人間の旧実装と同じ）
 *   - トラッシュ／エナ＝**自分のターン**の MAIN（《メインフェイズアイコン》）と ATTACK_ARTS（《アタックフェイズアイコン》）。
 *   - 手札＝MAIN／ATTACK_ARTS／ATTACK_ARTS_OP（相手ターンのアーツステップ＝タイミング照合は ATTACK_ARTS）。
 */
export type OffFieldZone = 'trash' | 'energy' | 'hand';

/** そのゾーンの【起】を使う窓のタイミング（窓でなければ null）。 */
export function offFieldActivateTiming(zone: OffFieldZone, turnPhase: TurnPhase | string | null | undefined, isMyTurn: boolean): EffectTiming | null {
  if (zone === 'hand') {
    if (turnPhase === 'MAIN' || turnPhase === 'ATTACK_ARTS') return isMyTurn ? turnPhase : null;
    return turnPhase === 'ATTACK_ARTS_OP' && !isMyTurn ? 'ATTACK_ARTS' : null;
  }
  if (!isMyTurn) return null;
  return turnPhase === 'MAIN' ? 'MAIN' : turnPhase === 'ATTACK_ARTS' ? 'ATTACK_ARTS' : null;
}

/**
 * `cardNum`（そのゾーンにある instance ID）の【起】のうち、**いま使えるもの**。
 * ⚠エナの色充足は見ない（枚数まで）＝色は支払いモーダル／CPU の `selectEnergyIndicesForCost` が権威関数で決める。
 */
export function listOffFieldActivatableEffects(p: {
  zone: OffFieldZone;
  cardNum: string;
  my: PlayerState;
  op: PlayerState;
  turnPhase: TurnPhase | string | null | undefined;
  isMyTurn: boolean;
  cardMap: Map<string, CardData>;
  effectsMap: Map<string, CardEffect[]>;
  effectivePowers?: Map<string, number>;
  /** `buildEnergyPayPool(my, ...)`（トラッシュ／エナの在庫判定）。省略時はエナゾーンだけ。 */
  energyPool?: readonly EnergyPayEntry[];
}): CardEffect[] {
  const { zone, cardNum, my, op, cardMap, effectsMap } = p;
  const timing = offFieldActivateTiming(zone, p.turnPhase, p.isMyTurn);
  if (!timing) return [];
  if (zone !== 'hand') {
    // §6.4 O-17＝領域を跨いだ能力喪失はトラッシュ／エナのカードにも `abilities_removed` を積む。
    if (my.abilities_removed?.includes(cardNum)) return [];
    // §6.4 O-10＝「対戦相手のトラッシュ…にあるカードは能力を失い」（`WX12-023`）。
    if (zone === 'trash' && isTrashImmuneByOpponent(op, cardMap, effectsMap)) return [];
  }
  const out: CardEffect[] = [];
  for (const eff of effectsMap.get(cardNum) ?? []) {
    if (eff.effectType !== 'ACTIVATED') continue;
    if (zone === 'trash' ? !eff.trashActivated : zone === 'energy' ? !eff.energyActivated : !eff.handActivated) continue;
    // `costUnparsed`＝原文のコストを表現できなかった印。提示すると踏み倒しになる（§6.4 O-11）。
    if (eff.costUnparsed) continue;
    if (!eff.timing?.includes(timing)) continue;
    // 回数制限は場のシグニ【起】（`signiActivateGate`）と同じ形で見る。
    // 🔴2026-09-17 までは `actions_done` に effectId があるだけで弾いていた＝**回数制限の無い【起】も1ターン1回**になり、
    //   トラッシュに同名が2枚あっても2枚目を使えなかった（`WX22-Re17-E2` ほか。場以外の【起】49効果の原文に《ターン１回》は無い）。
    if (eff.usageLimit === 'once_per_turn' && my.actions_done?.includes(eff.effectId)) continue;
    if (eff.usageLimit === 'twice_per_turn' && (my.actions_done ?? []).filter(id => id === eff.effectId).length >= 2) continue;
    if (eff.usageLimit === 'once_per_game' && my.game_actions_done?.includes(eff.effectId)) continue;
    if (eff.condition && !evalUseCondition(eff.condition, my, op, cardMap, cardNum, p.turnPhase as TurnPhase, p.effectivePowers)) continue;
    if (zone === 'hand') {
      // 払えるコストの形（エナ・自分を捨てる・相手のウィルス・場のシグニのトラッシュ）と、ウィルス／場のシグニの在庫。
      // 🔴2026-09-17 まで判定が無く `WX18-036-E3` が場のシグニを払わず撃てた（§5.3 `O-533` で支払いを実装）。
      if (!canOfferHandActivate(eff, my, op, cardMap)) continue;
    } else if (!canOfferTrashActivate(eff, my, op, cardMap, p.energyPool)) continue;
    out.push(eff);
  }
  return out;
}
