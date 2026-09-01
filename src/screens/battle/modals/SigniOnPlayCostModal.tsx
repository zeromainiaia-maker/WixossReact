// シグニ出現時コスト付き【出】効果モーダル（エナ/手札/ライフ/チャーム/ビート等の複合コスト支払い→発動 or スキップ）。BattleScreen.tsx から Stage 1 で抽出。
import { createPortal } from 'react-dom';
import type { Dispatch, SetStateAction } from 'react';
import type { PlayerState, StackEntry } from '../../../types';
import type { CardEffect } from '../../../types/effects';
import { fieldTrashGroupsSelectableZones, fieldTrashSelectableZones, fieldTrashSelectionSatisfied } from '../fieldLimit';
import { getCardNum, matchesFilter, analyzeBeatSigniCost, beatSigniCostCount } from '../../../engine/effectExecutor';
import { beatSigniFromTrashCandidates, canSatisfyDiscardGroups } from '../../../engine/execUtils';
import { C } from '../../../components/BoardComponents';
import { canAffordGrowCost, canPayExceed, exceedPoolOf, fmtHandDiscardSigniLabel, isMultiEna, energyTrashCostSatisfied, canAddEnergyTrashIndex, energyTrashGroupsSatisfied, canAddEnergyTrashGroupIndex, matchesHandDiscardSigni, handDiscardSigniCostSatisfied } from '../costs';
import { matchesTrashArtsFromLrigDeckCost } from '../artsTrashCost';
import { underAnySigniCostCandidates } from '../underAnySigniCost';
import type { BattleModalCtx } from './types';

export interface PendingSigniOnPlayCost {
  cardNum: string;
  costEffect: CardEffect;
  placedState: PlayerState;
  mandatoryEntries: StackEntry[];
  remainingCostEffects?: CardEffect[];
  placedZone?: number;
}

interface SigniOnPlayCostModalProps {
  ctx: BattleModalCtx;
  pendingSigniOnPlayCost: PendingSigniOnPlayCost | null;
  selectedSigniOnPlayCost: Set<number>;
  setSelectedSigniOnPlayCost: Dispatch<SetStateAction<Set<number>>>;
  selectedSigniOnPlayDiscard: Set<number>;
  setSelectedSigniOnPlayDiscard: Dispatch<SetStateAction<Set<number>>>;
  selectedSigniOnPlayEnergyTrash: Set<number>;
  setSelectedSigniOnPlayEnergyTrash: Dispatch<SetStateAction<Set<number>>>;
  selectedSigniOnPlayFieldTrash: Set<number>;
  setSelectedSigniOnPlayFieldTrash: Dispatch<SetStateAction<Set<number>>>;
  selectedSigniOnPlayExceed: Set<number>;
  setSelectedSigniOnPlayExceed: Dispatch<SetStateAction<Set<number>>>;
  selectedSigniOnPlayBeat: Set<number>;
  setSelectedSigniOnPlayBeat: Dispatch<SetStateAction<Set<number>>>;
  selectedSigniOnPlayArtsTrash: string | null;
  setSelectedSigniOnPlayArtsTrash: Dispatch<SetStateAction<string | null>>;
  selectedSigniOnPlayUnderTrash: Set<string>;
  setSelectedSigniOnPlayUnderTrash: Dispatch<SetStateAction<Set<string>>>;
  signiOnPlayCharmTrashVar: number;
  setSigniOnPlayCharmTrashVar: Dispatch<SetStateAction<number>>;
  executeSigniOnPlayCost: (cardNum: string, costEffect: CardEffect, costIndices: Set<number>, discardIndices: Set<number>, placedState: PlayerState, mandatoryEntries: StackEntry[], energyTrashIndices?: Set<number>, remainingCostEffects?: CardEffect[], fieldTrashZones?: Set<number>, placedZone?: number, beatZones?: Set<number>, exceedIndices?: Set<number>, underTrashKeys?: Set<string>) => void;
  skipSigniOnPlayCost: (cardNum: string, placedState: PlayerState, mandatoryEntries: StackEntry[], remainingCostEffects?: CardEffect[], placedZone?: number) => void;
}

export function SigniOnPlayCostModal(p: SigniOnPlayCostModalProps) {
  const { my, op, loading, battleCards, battleCardMap, myEnaAllMulti, myEnaMultiStripped, myColorlessOverrides, myColorSubs, pickLongPressTimer, setExpandedPickImgUrl } = p.ctx;
  const { pendingSigniOnPlayCost, selectedSigniOnPlayCost, setSelectedSigniOnPlayCost, selectedSigniOnPlayDiscard, setSelectedSigniOnPlayDiscard, selectedSigniOnPlayEnergyTrash, setSelectedSigniOnPlayEnergyTrash, selectedSigniOnPlayFieldTrash, setSelectedSigniOnPlayFieldTrash, selectedSigniOnPlayExceed, setSelectedSigniOnPlayExceed, selectedSigniOnPlayBeat, setSelectedSigniOnPlayBeat, selectedSigniOnPlayArtsTrash, setSelectedSigniOnPlayArtsTrash, selectedSigniOnPlayUnderTrash, setSelectedSigniOnPlayUnderTrash, signiOnPlayCharmTrashVar, setSigniOnPlayCharmTrashVar, executeSigniOnPlayCost, skipSigniOnPlayCost } = p;
  return (
    <>
      {pendingSigniOnPlayCost && createPortal(
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 4000,
            backgroundColor: 'rgba(0,0,0,0.92)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div
            onClick={e => e.stopPropagation()}
            style={{ backgroundColor: C.bgModal, border: C.borderUI, borderRadius: 12,
              padding: '20px 16px', width: 'min(95vw, 400px)', maxHeight: '85vh',
              display: 'flex', flexDirection: 'column', gap: 12 }}>
            {(() => {
              const card = battleCardMap.get(pendingSigniOnPlayCost.cardNum);
              const eff  = pendingSigniOnPlayCost.costEffect;
              // エナ/手札はplacedState基準（グロウ経路はグロウコスト支払い後、チェーン時は前効果の支払い後）
              const pState = pendingSigniOnPlayCost.placedState;
              const pcEnergy = pState.energy;
              const energyTotal = (eff.cost?.energy ?? []).reduce((s, c) => s + c.count, 0);
              // 手札コスト（discard/handDiscardSigni=トラッシュ / handToEnergy=エナへ / handToUnderSelf=シグニの下へ。同時指定はない前提で選択UIを共用）
              const discardGroups = eff.cost?.discardGroups;
              const discardNeeded = discardGroups?.reduce((sum, group) => sum + group.count, 0) ?? eff.cost?.discard ?? 0;
              const handDiscardSigni = eff.cost?.handDiscardSigni;
              const handToEnergyNeeded = eff.cost?.handToEnergy?.count ?? 0;
              const handToUnderNeeded  = eff.cost?.handToUnderSelf?.count ?? 0;
              const handNeeded = discardNeeded + (handDiscardSigni?.count ?? 0) + handToEnergyNeeded + handToUnderNeeded;
              const handFilter = eff.cost?.discardFilter ?? eff.cost?.handToEnergy?.filter ?? eff.cost?.handToUnderSelf?.filter;
              const selectedHandCards = [...selectedSigniOnPlayDiscard].map(i => battleCardMap.get(getCardNum(pState.hand[i])));
              const discardGroupsOk = !discardGroups || canSatisfyDiscardGroups(selectedHandCards, discardGroups);
              // 🆕§5.3 `O-108`＝中身（色/クラス/レベル）に加えて**集合制約**（「それぞれ名前の異なる」）も見る。
              const handDiscardSigniOk = !handDiscardSigni
                || (selectedHandCards.every(c => matchesHandDiscardSigni(c, handDiscardSigni))
                    && handDiscardSigniCostSatisfied(pState.hand, selectedSigniOnPlayDiscard, handDiscardSigni, battleCardMap));
              const handCostLabel = handToEnergyNeeded > 0 ? 'エナゾーンに置く' : handToUnderNeeded > 0 ? 'このシグニの下に置く' : '捨てる';
              const coinNeeded = eff.cost?.coin ?? 0;
              const exceedNeeded = eff.cost?.exceed ?? 0;
              const exceedPool = exceedPoolOf(pState);
              const exceedOk = canPayExceed(pState, exceedNeeded)
                && (exceedNeeded === 0 || selectedSigniOnPlayExceed.size === exceedNeeded);
              // `energyTrashGroups`＝「エナゾーンから《A》1枚と《B》1枚と…をトラッシュに置く」（異なるフィルタの組）。
              // 🔑選択集合は `energyTrash` と同じ「エナ index の集合」なので**支払い側（`executeSigniOnPlayCost`）は共通**＝
              //   ここで分かれるのは**可否判定と選択ガードだけ**。
              const enaTrashGroups = eff.cost?.energyTrashGroups;
              const enaTrashNeeded = enaTrashGroups?.length
                ? enaTrashGroups.reduce((n, g) => n + g.count, 0)
                : (eff.cost?.energyTrash?.count ?? 0);
              const enaTrashFilter = enaTrashGroups?.length ? undefined : eff.cost?.energyTrash?.filter;
              // 場のシグニトラッシュコスト
              const ftCost = eff.cost?.fieldTrash
                ?? (eff.cost?.fieldToLrigTrash ? { ...eff.cost.fieldToLrigTrash, excludeSelf: false } : undefined);
              const ftGroups = eff.cost?.fieldTrashGroups;
              const ftNeeded = ftCost?.count ?? ftGroups?.reduce((n, g) => n + g.count, 0) ?? 0;
              const selfZoneFT = pendingSigniOnPlayCost.placedZone
                ?? pState.field.signi.findIndex(s => s?.at(-1) === pendingSigniOnPlayCost.cardNum);
              // beat_signi: 「他の/任意」beat対象のゾーン選択。候補が必要数より多いときだけプレイヤーに選ばせる（同数以下は自動）。
              const beatCostM = analyzeBeatSigniCost(pState, pendingSigniOnPlayCost.cardNum, battleCardMap, eff.cost?.beat_signi ?? 0);
              const beatNeedSelect = beatSigniCostCount(eff.cost?.beat_signi) > 0 && beatCostM.otherPart > 0 && beatCostM.eligibleOtherZones.length > beatCostM.otherPart;
              const beatTrashCostM = eff.cost?.beat_signi_from_trash;
              const beatTrashCandidates = beatTrashCostM
                ? beatSigniFromTrashCandidates(pState, battleCardMap, beatTrashCostM.filter)
                : [];
              const beatTrashNeedSelect = !!beatTrashCostM && beatTrashCandidates.length > beatTrashCostM.count;
              const beatSelectOk = beatTrashNeedSelect
                ? selectedSigniOnPlayBeat.size === beatTrashCostM!.count
                : (!beatNeedSelect || selectedSigniOnPlayBeat.size === beatCostM.otherPart);
              const ftSelectableZones = ftGroups?.length
                ? fieldTrashGroupsSelectableZones(ftGroups, pState, battleCardMap)
                : fieldTrashSelectableZones(ftCost, pState, battleCardMap, selfZoneFT);
              // 自動支払いコスト（選択不要）
              const lrigDownCost = eff.cost?.lrigDown;
              // level 指定時は該当レベルのルリグゾーンだけを支払い候補に数える（BattleScreen の支払い側と同じ判定）
              const ldLevelOk = (stack?: string[]) => lrigDownCost?.level === undefined
                || Number(battleCardMap.get(getCardNum(stack?.[stack.length - 1] ?? ''))?.Level) === lrigDownCost.level;
              const upLrigCount = (pState.field.lrig.length > 0 && !pState.field.lrig_down && ldLevelOk(pState.field.lrig) ? 1 : 0)
                + (!lrigDownCost?.centerOnly && (pState.field.assist_lrig_l?.length ?? 0) > 0 && !pState.field.assist_lrig_l_down && ldLevelOk(pState.field.assist_lrig_l) ? 1 : 0)
                + (!lrigDownCost?.centerOnly && (pState.field.assist_lrig_r?.length ?? 0) > 0 && !pState.field.assist_lrig_r_down && ldLevelOk(pState.field.assist_lrig_r) ? 1 : 0);
              const lrigDownOk = !lrigDownCost || upLrigCount >= lrigDownCost.count;
              const lrigDownVariableM = eff.cost?.lrigDownVariable;
              const lrigDownVariableOk = !lrigDownVariableM
                || (signiOnPlayCharmTrashVar >= lrigDownVariableM.min && signiOnPlayCharmTrashVar <= upLrigCount);
              const lifeNeeded = (eff.cost?.lifeTrash ?? 0) + (eff.cost?.life_crash ?? 0) + (eff.cost?.lifeToHand ?? 0);
              const lifeOk = lifeNeeded === 0 || pState.life_cloth.length >= lifeNeeded;
              const charmNeeded = eff.cost?.charmTrash ?? 0;
              const charmOk = charmNeeded === 0 || (pState.field.signi_charms ?? []).filter(Boolean).length >= charmNeeded;
              const virusNeeded = eff.cost?.removeOppVirus ?? 0;
              const virusOk = virusNeeded === 0 || (op.field.signi_virus ?? []).reduce((s, v) => s + v, 0) >= virusNeeded;
              const deckTrashNeeded = eff.cost?.deckTrash ?? 0;
              // charmTrashVariable
              const charmVarOPCostM = eff.cost?.charmTrashVariable;
              const totalOPCharmsM = (pState.field.signi_charms ?? []).filter(Boolean).length;
              const charmVarOPOk = !charmVarOPCostM || signiOnPlayCharmTrashVar >= charmVarOPCostM.min;
              // trashArtsFromLrigDeck
              const artsTrashOPCostM = eff.cost?.trashArtsFromLrigDeck;
              const artsFilteredCardsM = artsTrashOPCostM
                ? pState.lrig_deck.filter(cn =>
                    matchesTrashArtsFromLrigDeckCost(battleCardMap.get(getCardNum(cn)), artsTrashOPCostM))
                : [];
              const artsOkM = !artsTrashOPCostM || (artsFilteredCardsM.length >= artsTrashOPCostM.count && selectedSigniOnPlayArtsTrash !== null);
              const underTrashNeeded = eff.cost?.underAnySigniTrash?.count ?? 0;
              const underTrashCandidates = underAnySigniCostCandidates(pState);
              const underTrashOk = underTrashNeeded === 0 || selectedSigniOnPlayUnderTrash.size === underTrashNeeded;
              const costStr = (eff.cost?.energy ?? []).map(e => `《${e.color}》×${e.count}`).join('') || '';
              const selectedNums = [...selectedSigniOnPlayCost].map(i => pcEnergy[i]);
              const energyOk = energyTotal === 0
                ? true
                : selectedSigniOnPlayCost.size === energyTotal &&
                  canAffordGrowCost(selectedNums, battleCards, costStr, my.keyword_grants, myEnaAllMulti, myEnaMultiStripped, myColorlessOverrides, myColorSubs);
              const coinOk = coinNeeded === 0 || (pState.coins ?? 0) >= coinNeeded;
              const filterLabel = (f?: import('../../../types/effects').TargetFilter) => {
                if (!f) return '';
                const parts: string[] = [];
                if (f.story) parts.push((Array.isArray(f.story) ? f.story : [f.story]).map(s => `＜${s}＞`).join('か'));
                if (f.color) parts.push((Array.isArray(f.color) ? f.color : [f.color]).join('か'));
                if (f.level !== undefined && typeof f.level === 'number') parts.push(`レベル${f.level}`);
                if (f.hasIcon) parts.push(`《${f.hasIcon}アイコン》持ち`);
                if (f.hasLifeBurst) parts.push('《ライフバースト》持ち');
                if (f.cardName) parts.push(`《${f.cardName}》`);
                if (f.cardType === 'シグニ' || (Array.isArray(f.cardType) && f.cardType.includes('シグニ'))) parts.push('シグニ');
                return parts.join('の');
              };
              // beat_signi_from_trash: トラッシュに filter 一致シグニが必要数あるか（WDK14-013）
              const beatTrashOkM = !beatTrashCostM || pState.trash.filter(n => {
                const c = battleCardMap.get(getCardNum(n));
                return c && c.Type === 'シグニ' && matchesFilter(c, beatTrashCostM.filter ?? { cardType: 'シグニ' });
              }).length >= beatTrashCostM.count;
              const canAfford = energyOk && coinOk && exceedOk && lrigDownOk && lrigDownVariableOk && lifeOk && charmOk && virusOk && charmVarOPOk && artsOkM && underTrashOk && beatTrashOkM && beatSelectOk
                && selectedSigniOnPlayDiscard.size === handNeeded
                && discardGroupsOk
                && handDiscardSigniOk
                // ⚠枚数だけでなく**集合制約**（「それぞれレベルの異なる」等）も見る＝共有判定は `costs.ts` の1本
                && energyTrashCostSatisfied(pcEnergy, selectedSigniOnPlayEnergyTrash, eff.cost?.energyTrash, battleCardMap)
                && energyTrashGroupsSatisfied(pcEnergy, selectedSigniOnPlayEnergyTrash, enaTrashGroups, battleCardMap)
                && fieldTrashSelectionSatisfied(
                  ftCost, ftGroups, [...selectedSigniOnPlayFieldTrash],
                  pState, battleCardMap, selfZoneFT,
                );
              return (
                <>
                  <p style={{ color: C.textSub, fontSize: 14, fontWeight: 'bold', margin: 0, textAlign: 'center' }}>
                    【出】効果を発動しますか？
                  </p>
                  {card && (
                    <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                      <img src={card.ImgURL} alt={card.CardName}
                        onPointerDown={() => { pickLongPressTimer.current = setTimeout(() => { setExpandedPickImgUrl(card.ImgURL); }, 500); }}
                        onPointerUp={() => { if (pickLongPressTimer.current) { clearTimeout(pickLongPressTimer.current); pickLongPressTimer.current = null; } }}
                        onPointerLeave={() => { if (pickLongPressTimer.current) { clearTimeout(pickLongPressTimer.current); pickLongPressTimer.current = null; } }}
                        onContextMenu={e => e.preventDefault()}
                        draggable={false}
                        style={{ width: 52, height: 72, objectFit: 'cover', borderRadius: 4, flexShrink: 0, cursor: 'pointer' }} />
                      <div>
                        <p style={{ color: C.text, fontSize: 13, fontWeight: 'bold', margin: '0 0 4px' }}>{card.CardName}</p>
                        <p style={{ color: C.textFaint, fontSize: 11, margin: 0 }}>
                          コスト: {[
                            energyTotal > 0 ? costStr : null,
                            exceedNeeded > 0 ? `エクシード${exceedNeeded}` : null,
                            handNeeded > 0 ? discardGroups
                              ? discardGroups.map(g => `${filterLabel(g.filter) || 'カード'}${g.count}枚`).join('と') + `を${handCostLabel}`
                              : handDiscardSigni ? `手札の${fmtHandDiscardSigniLabel(handDiscardSigni)}シグニ${handNeeded}枚を${handCostLabel}`
                              : `手札${handFilter ? `の${filterLabel(handFilter)}` : ''}${handNeeded}枚を${handCostLabel}` : null,
                            enaTrashNeeded > 0 ? `エナの${filterLabel(enaTrashFilter) || 'カード'}${enaTrashNeeded}枚トラッシュ` : null,
                            ftNeeded > 0 ? ftGroups?.length
                              ? `場の${ftGroups.map(g => `${filterLabel(g.filter) || 'シグニ'}${g.count}体`).join('と')}をトラッシュ`
                              : `場の${filterLabel(ftCost?.filter) || 'シグニ'}${ftNeeded}体をトラッシュ` : null,
                            lrigDownCost ? `アップ状態の${lrigDownCost.level !== undefined ? `レベル${lrigDownCost.level}の` : ''}${lrigDownCost.centerOnly ? 'センター' : ''}ルリグ${lrigDownCost.count}体をダウン` : null,
                            (eff.cost?.lifeTrash ?? 0) > 0 ? `ライフクロス${eff.cost!.lifeTrash}枚トラッシュ` : null,
                            (eff.cost?.life_crash ?? 0) > 0 ? `ライフクロス${eff.cost!.life_crash}枚クラッシュ` : null,
                            (eff.cost?.lifeToHand ?? 0) > 0 ? `ライフクロス${eff.cost!.lifeToHand}枚を手札へ` : null,
                            deckTrashNeeded > 0 ? `デッキ上${deckTrashNeeded}枚トラッシュ` : null,
                            charmNeeded > 0 ? `チャーム${charmNeeded}枚トラッシュ` : null,
                            charmVarOPCostM ? `チャーム${charmVarOPCostM.min}枚以上トラッシュ（現在${totalOPCharmsM}枚）` : null,
                            artsTrashOPCostM ? `ルリグデッキから${artsTrashOPCostM.color ? artsTrashOPCostM.color + 'の' : ''}アーツ${artsTrashOPCostM.count}枚をトラッシュ` : null,
                            beatSigniCostCount(eff.cost?.beat_signi) > 0 ? `シグニ${beatSigniCostCount(eff.cost?.beat_signi)}体を【ビート】に` : null,
                            beatTrashCostM ? `トラッシュから${filterLabel(beatTrashCostM.filter) || 'シグニ'}${beatTrashCostM.count}枚を【ビート】に` : null,
                            virusNeeded > 0 ? `相手の【ウィルス】${virusNeeded}個除去` : null,
                            coinNeeded > 0 ? `《コイン》×${coinNeeded}（所持${pState.coins ?? 0}）` : null,
                          ].filter(Boolean).join('・') || 'なし'}
                        </p>
                      </div>
                    </div>
                  )}
                  {energyTotal > 0 && (
                    <>
                      <p style={{ color: C.text, fontSize: 12, margin: 0 }}>
                        エナゾーンから選択: {selectedSigniOnPlayCost.size} / {energyTotal}枚
                      </p>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, overflowY: 'auto', maxHeight: 180 }}>
                        {pcEnergy.map((num, i) => {
                          const c = battleCardMap.get(num);
                          const isSel = selectedSigniOnPlayCost.has(i);
                          const isWild = isMultiEna(num, battleCards, my.keyword_grants, myEnaAllMulti, myEnaMultiStripped);
                          return (
                            <div key={i}
                              data-testid={`onplaycost-energy-${i}`}
                              onClick={() => setSelectedSigniOnPlayCost(prev => {
                                const next = new Set(prev);
                                if (next.has(i)) { next.delete(i); return next; }
                                if (next.size >= energyTotal) return prev;
                                next.add(i); return next;
                              })}
                              onPointerDown={() => { pickLongPressTimer.current = setTimeout(() => { setExpandedPickImgUrl(c?.ImgURL ?? null); }, 500); }}
                              onPointerUp={() => { if (pickLongPressTimer.current) { clearTimeout(pickLongPressTimer.current); pickLongPressTimer.current = null; } }}
                              onPointerLeave={() => { if (pickLongPressTimer.current) { clearTimeout(pickLongPressTimer.current); pickLongPressTimer.current = null; } }}
                              onContextMenu={e => e.preventDefault()}
                              style={{ position: 'relative', width: 44, height: 62, borderRadius: 3, flexShrink: 0,
                                border: isSel ? '2px solid #f44336' : isWild ? '1px solid #ffcc00' : C.borderCard,
                                cursor: 'pointer', overflow: 'hidden' }}>
                              {c ? (
                                <img src={c.ImgURL} alt={c.CardName} draggable={false}
                                  style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                              ) : (
                                <div style={{ width: '100%', height: '100%', backgroundColor: C.bgButton,
                                  display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                  <span style={{ fontSize: 7, color: C.textFaint }}>{num}</span>
                                </div>
                              )}
                              {isWild && !isSel && (
                                <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0,
                                  backgroundColor: 'rgba(255,204,0,0.85)', textAlign: 'center' }}>
                                  <span style={{ fontSize: 7, fontWeight: 'bold', color: '#000' }}>マルチ</span>
                                </div>
                              )}
                              {isSel && (
                                <div style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(244,67,54,0.4)',
                                  display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                  <span style={{ color: '#fff', fontSize: 18, fontWeight: 'bold' }}>✓</span>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </>
                  )}
                  {exceedNeeded > 0 && (
                    <>
                      <p style={{ color: exceedOk ? C.text : C.warn, fontSize: 12, margin: 0 }}>
                        エクシード選択: {selectedSigniOnPlayExceed.size} / {exceedNeeded}枚（ルリグの下から選択）
                      </p>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {exceedPool.map((num, i) => {
                          const c = battleCardMap.get(getCardNum(num));
                          const isSel = selectedSigniOnPlayExceed.has(i);
                          return (
                            <div key={`${num}-${i}`}
                              data-testid={`onplaycost-exceed-${i}`}
                              onClick={() => setSelectedSigniOnPlayExceed(prev => {
                                const next = new Set(prev);
                                if (next.has(i)) next.delete(i);
                                else if (next.size < exceedNeeded) next.add(i);
                                return next;
                              })}
                              style={{ position: 'relative', width: 44, height: 62, borderRadius: 3, flexShrink: 0,
                                border: isSel ? '2px solid #ff9800' : C.borderCard,
                                cursor: 'pointer', overflow: 'hidden' }}>
                              {c ? <img src={c.ImgURL} alt={c.CardName} draggable={false}
                                style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                : <div style={{ fontSize: 7, color: C.textFaint }}>{num}</div>}
                              {isSel && <div style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(255,152,0,0.4)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <span style={{ color: '#fff', fontSize: 18, fontWeight: 'bold' }}>✓</span>
                              </div>}
                            </div>
                          );
                        })}
                      </div>
                    </>
                  )}
                  {handNeeded > 0 && (
                    <>
                      <p style={{ color: C.text, fontSize: 12, margin: 0 }}>
                        手札から{handCostLabel}カードを選択: {selectedSigniOnPlayDiscard.size} / {handNeeded}枚
                        {discardGroups ? `（${discardGroups.map(g => `${filterLabel(g.filter) || 'カード'}${g.count}枚`).join('＋')}）` : handDiscardSigni ? `（${fmtHandDiscardSigniLabel(handDiscardSigni)}シグニのみ）` : handFilter ? `（${filterLabel(handFilter)}のみ）` : ''}
                      </p>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, overflowY: 'auto', maxHeight: 180 }}>
                        {pState.hand.map((num, i) => {
                          const c = battleCardMap.get(num);
                          const isSel = selectedSigniOnPlayDiscard.has(i);
                          const matchesDiscardFilter = discardGroups
                            ? discardGroups.some(g => !g.filter || matchesFilter(c, g.filter))
                            : handDiscardSigni ? matchesHandDiscardSigni(c, handDiscardSigni)
                            : !handFilter || matchesFilter(c, handFilter);
                          return (
                            <div key={i}
                              // 実機ドライバ用の安定セレクタ（`onplaycost-energy-*` の兄弟）。
                              // ⚠これが無いと **手札コストのセルを testid で掴めない**＝【出】手札コストを持つ
                              //   カードの実機検証が組めない（§5.3 `O-66`④ の検証で判明）。表示には影響しない。
                              data-testid={`onplaycost-hand-${i}`}
                              data-card-num={num}
                              onClick={() => matchesDiscardFilter && setSelectedSigniOnPlayDiscard(prev => {
                                const next = new Set(prev);
                                if (next.has(i)) { next.delete(i); return next; }
                                if (next.size >= handNeeded) return prev;
                                next.add(i); return next;
                              })}
                              onPointerDown={() => { pickLongPressTimer.current = setTimeout(() => { setExpandedPickImgUrl(c?.ImgURL ?? null); }, 500); }}
                              onPointerUp={() => { if (pickLongPressTimer.current) { clearTimeout(pickLongPressTimer.current); pickLongPressTimer.current = null; } }}
                              onPointerLeave={() => { if (pickLongPressTimer.current) { clearTimeout(pickLongPressTimer.current); pickLongPressTimer.current = null; } }}
                              onContextMenu={e => e.preventDefault()}
                              style={{ position: 'relative', width: 44, height: 62, borderRadius: 3, flexShrink: 0,
                                border: isSel ? '2px solid #ff9800' : C.borderCard,
                                opacity: matchesDiscardFilter ? 1 : 0.35,
                                cursor: matchesDiscardFilter ? 'pointer' : 'default', overflow: 'hidden' }}>
                              {c ? (
                                <img src={c.ImgURL} alt={c.CardName} draggable={false}
                                  style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                              ) : (
                                <div style={{ width: '100%', height: '100%', backgroundColor: C.bgButton,
                                  display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                  <span style={{ fontSize: 7, color: C.textFaint }}>{num}</span>
                                </div>
                              )}
                              {isSel && (
                                <div style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(255,152,0,0.4)',
                                  display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                  <span style={{ color: '#fff', fontSize: 18, fontWeight: 'bold' }}>✓</span>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </>
                  )}
                  {enaTrashNeeded > 0 && (
                    <>
                      <p style={{ color: C.text, fontSize: 12, margin: 0 }}>
                        エナゾーンからトラッシュするカードを選択: {selectedSigniOnPlayEnergyTrash.size} / {enaTrashNeeded}枚
                        {enaTrashGroups?.length
                          ? `（${enaTrashGroups.map(g => `${filterLabel(g.filter) || 'カード'}×${g.count}`).join(' ＋ ')}）`
                          : enaTrashFilter ? `（${filterLabel(enaTrashFilter)}のみ）` : ''}
                      </p>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, overflowY: 'auto', maxHeight: 180 }}>
                        {pcEnergy.map((num, i) => {
                          const c = battleCardMap.get(num);
                          const isSel = selectedSigniOnPlayEnergyTrash.has(i);
                          const matchesEna = enaTrashGroups?.length
                            ? canAddEnergyTrashGroupIndex(pcEnergy, selectedSigniOnPlayEnergyTrash, i, enaTrashGroups, battleCardMap)
                            : ((!enaTrashFilter || matchesFilter(c, enaTrashFilter))
                              && canAddEnergyTrashIndex(pcEnergy, selectedSigniOnPlayEnergyTrash, i, eff.cost?.energyTrash, battleCardMap));
                          return (
                            <div key={i}
                              // 実機ドライバ（V-105）が「どのエナ札をコストに選んだか」を狙って押すための口。
                              // ⚠エナ**支払い**の `onplaycost-energy-${i}` とは別枠（こちらはトラッシュに置く側の選択）。
                              data-testid={`onplaycost-enatrash-${i}`}
                              onClick={() => matchesEna && setSelectedSigniOnPlayEnergyTrash(prev => {
                                const next = new Set(prev);
                                if (next.has(i)) { next.delete(i); return next; }
                                next.add(i); return next;
                              })}
                              onPointerDown={() => { pickLongPressTimer.current = setTimeout(() => { setExpandedPickImgUrl(c?.ImgURL ?? null); }, 500); }}
                              onPointerUp={() => { if (pickLongPressTimer.current) { clearTimeout(pickLongPressTimer.current); pickLongPressTimer.current = null; } }}
                              onPointerLeave={() => { if (pickLongPressTimer.current) { clearTimeout(pickLongPressTimer.current); pickLongPressTimer.current = null; } }}
                              onContextMenu={e => e.preventDefault()}
                              style={{ position: 'relative', width: 44, height: 62, borderRadius: 3, flexShrink: 0,
                                border: isSel ? '2px solid #9c27b0' : C.borderCard,
                                opacity: matchesEna ? 1 : 0.35,
                                cursor: matchesEna ? 'pointer' : 'default', overflow: 'hidden' }}>
                              {c ? (
                                <img src={c.ImgURL} alt={c.CardName} draggable={false}
                                  style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                              ) : (
                                <div style={{ width: '100%', height: '100%', backgroundColor: C.bgButton,
                                  display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                  <span style={{ fontSize: 7, color: C.textFaint }}>{num}</span>
                                </div>
                              )}
                              {isSel && (
                                <div style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(156,39,176,0.4)',
                                  display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                  <span style={{ color: '#fff', fontSize: 18, fontWeight: 'bold' }}>✓</span>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </>
                  )}
                  {ftNeeded > 0 && (
                    <>
                      <p style={{ color: C.text, fontSize: 12, margin: 0 }}>
                        場からトラッシュするシグニを選択: {selectedSigniOnPlayFieldTrash.size} / {ftNeeded}体
                        {ftGroups?.length ? `（${ftGroups.map(g => `${filterLabel(g.filter) || 'シグニ'}${g.count}体`).join('＋')}）` : ftCost?.filter ? `（${filterLabel(ftCost.filter)}のみ）` : ''}{ftCost?.excludeSelf ? '（このシグニ以外）' : ''}
                      </p>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {[0, 1, 2].map(zi => {
                          const top = pState.field.signi[zi]?.at(-1);
                          if (!top) return null;
                          const c = battleCardMap.get(getCardNum(top));
                          const selectable = ftSelectableZones.includes(zi);
                          const isSel = selectedSigniOnPlayFieldTrash.has(zi);
                          return (
                            <div key={zi}
                              onClick={() => selectable && setSelectedSigniOnPlayFieldTrash(prev => {
                                const next = new Set(prev);
                                if (next.has(zi)) { next.delete(zi); return next; }
                                if (next.size >= ftNeeded) return prev;
                                next.add(zi); return next;
                              })}
                              onPointerDown={() => { pickLongPressTimer.current = setTimeout(() => { setExpandedPickImgUrl(c?.ImgURL ?? null); }, 500); }}
                              onPointerUp={() => { if (pickLongPressTimer.current) { clearTimeout(pickLongPressTimer.current); pickLongPressTimer.current = null; } }}
                              onPointerLeave={() => { if (pickLongPressTimer.current) { clearTimeout(pickLongPressTimer.current); pickLongPressTimer.current = null; } }}
                              onContextMenu={e => e.preventDefault()}
                              style={{ position: 'relative', width: 44, height: 62, borderRadius: 3, flexShrink: 0,
                                border: isSel ? '2px solid #e91e63' : C.borderCard,
                                opacity: selectable ? 1 : 0.35,
                                cursor: selectable ? 'pointer' : 'default', overflow: 'hidden' }}>
                              {c ? (
                                <img src={c.ImgURL} alt={c.CardName} draggable={false}
                                  style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                              ) : (
                                <div style={{ width: '100%', height: '100%', backgroundColor: C.bgButton,
                                  display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                  <span style={{ fontSize: 7, color: C.textFaint }}>{top}</span>
                                </div>
                              )}
                              {isSel && (
                                <div style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(233,30,99,0.4)',
                                  display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                  <span style={{ color: '#fff', fontSize: 18, fontWeight: 'bold' }}>✓</span>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </>
                  )}
                  {/* beat_signi: 「他の/任意」シグニを【ビート】にする対象のゾーン選択（候補が必要数より多いとき） */}
                  {beatNeedSelect && (
                    <>
                      <p style={{ color: beatSelectOk ? C.text : C.warn, fontSize: 12, margin: 0 }}>
                        【ビート】にするシグニを選択: {selectedSigniOnPlayBeat.size} / {beatCostM.otherPart}体
                        {beatCostM.includeSelf ? '（このシグニは自動で【ビート】に）' : '（このシグニ以外）'}
                      </p>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {[0, 1, 2].map(zi => {
                          const top = pState.field.signi[zi]?.at(-1);
                          if (!top) return null;
                          const c = battleCardMap.get(getCardNum(top));
                          const selectable = beatCostM.eligibleOtherZones.includes(zi);
                          const isSel = selectedSigniOnPlayBeat.has(zi);
                          return (
                            <div key={zi}
                              onClick={() => selectable && setSelectedSigniOnPlayBeat(prev => {
                                const next = new Set(prev);
                                if (next.has(zi)) { next.delete(zi); return next; }
                                if (next.size >= beatCostM.otherPart) return prev;
                                next.add(zi); return next;
                              })}
                              onPointerDown={() => { pickLongPressTimer.current = setTimeout(() => { setExpandedPickImgUrl(c?.ImgURL ?? null); }, 500); }}
                              onPointerUp={() => { if (pickLongPressTimer.current) { clearTimeout(pickLongPressTimer.current); pickLongPressTimer.current = null; } }}
                              onPointerLeave={() => { if (pickLongPressTimer.current) { clearTimeout(pickLongPressTimer.current); pickLongPressTimer.current = null; } }}
                              onContextMenu={e => e.preventDefault()}
                              style={{ position: 'relative', width: 44, height: 62, borderRadius: 3, flexShrink: 0,
                                border: isSel ? '2px solid #ff9800' : C.borderCard,
                                opacity: selectable ? 1 : 0.35,
                                cursor: selectable ? 'pointer' : 'default', overflow: 'hidden' }}>
                              {c ? (
                                <img src={c.ImgURL} alt={c.CardName} draggable={false}
                                  style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                              ) : (
                                <div style={{ width: '100%', height: '100%', backgroundColor: C.bgButton,
                                  display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                  <span style={{ fontSize: 7, color: C.textFaint }}>{top}</span>
                                </div>
                              )}
                              {isSel && (
                                <div style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(255,152,0,0.4)',
                                  display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                  <span style={{ color: '#fff', fontSize: 16, fontWeight: 'bold' }}>ビート</span>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </>
                  )}
                  {/* charmTrashVariable: 可変チャームトラッシュ枚数選択ステッパー (ON_PLAY) */}
                  {charmVarOPCostM && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <p style={{ color: charmVarOPOk ? C.text : C.warn, fontSize: 12, margin: 0 }}>
                        チャームをトラッシュする枚数を選択（{charmVarOPCostM.min}枚以上）: 場のチャーム {totalOPCharmsM}枚
                      </p>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <button
                          onClick={() => setSigniOnPlayCharmTrashVar(v => Math.max(0, v - 1))}
                          disabled={signiOnPlayCharmTrashVar <= 0}
                          style={{ width: 32, height: 32, borderRadius: 6, border: C.borderUI, backgroundColor: C.bgButton,
                            color: C.text, fontSize: 18, cursor: signiOnPlayCharmTrashVar <= 0 ? 'default' : 'pointer' }}>
                          −
                        </button>
                        <span style={{ minWidth: 40, textAlign: 'center', color: C.text, fontSize: 16, fontWeight: 'bold' }}>
                          {signiOnPlayCharmTrashVar}枚
                        </span>
                        <button
                          onClick={() => setSigniOnPlayCharmTrashVar(v => Math.min(totalOPCharmsM, v + 1))}
                          disabled={signiOnPlayCharmTrashVar >= totalOPCharmsM}
                          style={{ width: 32, height: 32, borderRadius: 6, border: C.borderUI, backgroundColor: C.bgButton,
                            color: C.text, fontSize: 18, cursor: signiOnPlayCharmTrashVar >= totalOPCharmsM ? 'default' : 'pointer' }}>
                          ＋
                        </button>
                      </div>
                    </div>
                  )}

                  {/* trashArtsFromLrigDeck: ルリグデッキからアーツを選択 (ON_PLAY) */}
                  {artsTrashOPCostM && (
                    <>
                      <p style={{ color: artsOkM ? C.text : C.warn, fontSize: 12, margin: 0 }}>
                        ルリグデッキから{artsTrashOPCostM.color ? artsTrashOPCostM.color + 'の' : ''}アーツを選択:
                        {' '}{selectedSigniOnPlayArtsTrash ? '1枚選択済み' : `未選択（${artsFilteredCardsM.length}枚中）`}
                      </p>
                      {artsFilteredCardsM.length > 0 ? (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, overflowY: 'auto', maxHeight: 180 }}>
                          {artsFilteredCardsM.map((cn, i) => {
                            const c = battleCardMap.get(cn);
                            const isSel = selectedSigniOnPlayArtsTrash === cn;
                            return (
                              <div key={i}
                                onClick={() => setSelectedSigniOnPlayArtsTrash(isSel ? null : cn)}
                                onPointerDown={() => { pickLongPressTimer.current = setTimeout(() => { setExpandedPickImgUrl(c?.ImgURL ?? null); }, 500); }}
                                onPointerUp={() => { if (pickLongPressTimer.current) { clearTimeout(pickLongPressTimer.current); pickLongPressTimer.current = null; } }}
                                onPointerLeave={() => { if (pickLongPressTimer.current) { clearTimeout(pickLongPressTimer.current); pickLongPressTimer.current = null; } }}
                                onContextMenu={e => e.preventDefault()}
                                style={{ position: 'relative', width: 44, height: 62, borderRadius: 3, flexShrink: 0,
                                  border: isSel ? '2px solid #4caf50' : C.borderCard,
                                  cursor: 'pointer', overflow: 'hidden' }}>
                                {c ? (
                                  <img src={c.ImgURL} alt={c.CardName} draggable={false}
                                    style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                ) : (
                                  <div style={{ width: '100%', height: '100%', backgroundColor: C.bgButton,
                                    display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <span style={{ fontSize: 7, color: C.textFaint }}>{cn}</span>
                                  </div>
                                )}
                                {isSel && (
                                  <div style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(76,175,80,0.4)',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <span style={{ color: '#fff', fontSize: 18, fontWeight: 'bold' }}>✓</span>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <p style={{ color: C.warn, fontSize: 11, margin: 0 }}>
                          ルリグデッキに{artsTrashOPCostM.color ? artsTrashOPCostM.color + 'の' : ''}アーツがありません
                        </p>
                      )}
                    </>
                  )}
                  {/* beat_signi_from_trash: 候補超過時だけ、支払いに使うカードをプレイヤーが選ぶ */}
                  {beatTrashNeedSelect && beatTrashCostM && (
                    <>
                      <p style={{ color: beatSelectOk ? C.text : C.warn, fontSize: 12, margin: 0 }}>
                        トラッシュから【ビート】にするシグニを選択: {selectedSigniOnPlayBeat.size} / {beatTrashCostM.count}枚
                      </p>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {beatTrashCandidates.map(ti => {
                          const num = pState.trash[ti];
                          const c = battleCardMap.get(getCardNum(num));
                          const isSel = selectedSigniOnPlayBeat.has(ti);
                          return (
                            <div key={ti}
                              onClick={() => setSelectedSigniOnPlayBeat(prev => {
                                const next = new Set(prev);
                                if (next.has(ti)) { next.delete(ti); return next; }
                                if (next.size >= beatTrashCostM.count) return prev;
                                next.add(ti); return next;
                              })}
                              onPointerDown={() => { pickLongPressTimer.current = setTimeout(() => { setExpandedPickImgUrl(c?.ImgURL ?? null); }, 500); }}
                              onPointerUp={() => { if (pickLongPressTimer.current) { clearTimeout(pickLongPressTimer.current); pickLongPressTimer.current = null; } }}
                              onPointerLeave={() => { if (pickLongPressTimer.current) { clearTimeout(pickLongPressTimer.current); pickLongPressTimer.current = null; } }}
                              onContextMenu={e => e.preventDefault()}
                              style={{ position: 'relative', width: 44, height: 62, borderRadius: 3, flexShrink: 0,
                                border: isSel ? '2px solid #ff9800' : C.borderCard,
                                cursor: 'pointer', overflow: 'hidden' }}>
                              {c ? <img src={c.ImgURL} alt={c.CardName} draggable={false}
                                style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : null}
                              {isSel && <div style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(255,152,0,0.4)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <span style={{ color: '#fff', fontSize: 12, fontWeight: 'bold' }}>ビート</span>
                              </div>}
                            </div>
                          );
                        })}
                      </div>
                    </>
                  )}
                  {lrigDownVariableM && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <p style={{ color: lrigDownVariableOk ? C.text : C.warn, fontSize: 12, margin: 0 }}>
                        ダウンするアップ状態のルリグ数を選択（{lrigDownVariableM.min}体以上）: 候補 {upLrigCount}体
                      </p>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <button onClick={() => setSigniOnPlayCharmTrashVar(v => Math.max(0, v - 1))}
                          disabled={signiOnPlayCharmTrashVar <= 0}
                          style={{ width: 32, height: 32, borderRadius: 6, border: C.borderUI, backgroundColor: C.bgButton, color: C.text, fontSize: 18 }}>−</button>
                        <span style={{ minWidth: 40, textAlign: 'center', color: C.text, fontSize: 16, fontWeight: 'bold' }}>
                          {signiOnPlayCharmTrashVar}体
                        </span>
                        <button onClick={() => setSigniOnPlayCharmTrashVar(v => Math.min(upLrigCount, v + 1))}
                          disabled={signiOnPlayCharmTrashVar >= upLrigCount}
                          style={{ width: 32, height: 32, borderRadius: 6, border: C.borderUI, backgroundColor: C.bgButton, color: C.text, fontSize: 18 }}>＋</button>
                      </div>
                    </div>
                  )}

                  {underTrashNeeded > 0 && (
                    <>
                      <p style={{ color: C.textSub, fontSize: 12, margin: 0 }}>
                        あなたのシグニの下から選択: {selectedSigniOnPlayUnderTrash.size} / {underTrashNeeded}枚
                      </p>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, overflowY: 'auto', maxHeight: 180 }}>
                        {underTrashCandidates.map(candidate => {
                          const key = `${candidate.zone}:${candidate.index}`;
                          const c = battleCardMap.get(getCardNum(candidate.cardNum));
                          const isSel = selectedSigniOnPlayUnderTrash.has(key);
                          return (
                            <div key={key}
                              onClick={() => setSelectedSigniOnPlayUnderTrash(prev => {
                                const next = new Set(prev);
                                if (next.has(key)) next.delete(key);
                                else if (next.size < underTrashNeeded) next.add(key);
                                return next;
                              })}
                              style={{ position: 'relative', width: 44, height: 62, borderRadius: 3,
                                border: isSel ? '2px solid #4caf50' : C.borderCard,
                                cursor: 'pointer', overflow: 'hidden' }}>
                              {c ? <img src={c.ImgURL} alt={c.CardName} draggable={false}
                                style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                : <span style={{ fontSize: 7 }}>{candidate.cardNum}</span>}
                              <span style={{ position: 'absolute', left: 1, bottom: 1, fontSize: 8,
                                color: '#fff', background: 'rgba(0,0,0,.7)' }}>ゾーン{candidate.zone + 1}</span>
                            </div>
                          );
                        })}
                      </div>
                    </>
                  )}

                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      onClick={() => skipSigniOnPlayCost(
                        pendingSigniOnPlayCost.cardNum,
                        pendingSigniOnPlayCost.placedState,
                        pendingSigniOnPlayCost.mandatoryEntries,
                        pendingSigniOnPlayCost.remainingCostEffects,
                        pendingSigniOnPlayCost.placedZone,
                      )}
                      disabled={loading}
                      style={{ flex: 1, padding: '10px 0', borderRadius: 8, border: C.borderUI,
                        backgroundColor: 'transparent', color: C.textSub, fontSize: 13, cursor: 'pointer' }}>
                      スキップ
                    </button>
                    <button
                      onClick={() => executeSigniOnPlayCost(
                        pendingSigniOnPlayCost.cardNum,
                        pendingSigniOnPlayCost.costEffect,
                        selectedSigniOnPlayCost,
                        selectedSigniOnPlayDiscard,
                        pendingSigniOnPlayCost.placedState,
                        pendingSigniOnPlayCost.mandatoryEntries,
                        selectedSigniOnPlayEnergyTrash,
                        pendingSigniOnPlayCost.remainingCostEffects,
                        selectedSigniOnPlayFieldTrash,
                        pendingSigniOnPlayCost.placedZone,
                        selectedSigniOnPlayBeat,
                        selectedSigniOnPlayExceed,
                        selectedSigniOnPlayUnderTrash,
                      )}
                      disabled={loading || !canAfford}
                      style={{ flex: 2, padding: '10px 0', borderRadius: 8, border: 'none',
                        backgroundColor: (loading || !canAfford) ? C.disabled : C.success,
                        color: C.text, fontSize: 14, fontWeight: 'bold',
                        cursor: (loading || !canAfford) ? 'default' : 'pointer' }}>
                      発動
                    </button>
                  </div>
                </>
              );
            })()}
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
