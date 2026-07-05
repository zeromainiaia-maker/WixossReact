// シグニ起動効果【起】コスト支払いモーダル（エナ/手札捨て/チャーム/エナトラッシュ/場トラッシュ/ビート等の複合コスト）。BattleScreen.tsx から Stage 1 で抽出。
import { createPortal } from 'react-dom';
import type { Dispatch, SetStateAction } from 'react';
import type { CardEffect } from '../../../types/effects';
import { getCardNum, matchesFilter, analyzeBeatSigniCost } from '../../../engine/effectExecutor';
import { canSatisfyDiscardGroups } from '../../../engine/execUtils';
import { collectIncreaseActCost } from '../../../engine/effectEngine';
import { C } from '../../../components/BoardComponents';
import { fmtDiscardFilterLabel, canAffordWithExtraCost, canAffordGrowCost, isMultiEna } from '../costs';
import { fieldTrashGroupsSatisfied } from '../fieldLimit';
import type { BattleModalCtx } from './types';

interface SigniActivatedModalProps {
  ctx: BattleModalCtx;
  pendingSigniActivated: { cardNum: string; effect: CardEffect } | null;
  setPendingSigniActivated: Dispatch<SetStateAction<{ cardNum: string; effect: CardEffect } | null>>;
  selectedSigniActivatedCost: Set<number>;
  setSelectedSigniActivatedCost: Dispatch<SetStateAction<Set<number>>>;
  selectedSigniActivatedDiscard: Set<number>;
  setSelectedSigniActivatedDiscard: Dispatch<SetStateAction<Set<number>>>;
  selectedSigniActivatedDiscardVar: Set<number>;
  setSelectedSigniActivatedDiscardVar: Dispatch<SetStateAction<Set<number>>>;
  selectedSigniActivatedFieldTrash: Set<number>;
  setSelectedSigniActivatedFieldTrash: Dispatch<SetStateAction<Set<number>>>;
  selectedSigniActivatedEnergyTrash: Set<number>;
  setSelectedSigniActivatedEnergyTrash: Dispatch<SetStateAction<Set<number>>>;
  selectedSigniActivatedTrashExile: Set<number>;
  setSelectedSigniActivatedTrashExile: Dispatch<SetStateAction<Set<number>>>;
  selectedSigniActivatedBeat: Set<number>;
  setSelectedSigniActivatedBeat: Dispatch<SetStateAction<Set<number>>>;
  signiActCharmTrashVar: number;
  setSigniActCharmTrashVar: Dispatch<SetStateAction<number>>;
  keySubstituteEnabled: boolean;
  setKeySubstituteEnabled: Dispatch<SetStateAction<boolean>>;
  executeSigniActivated: (cardNum: string, effect: CardEffect, costIndices: Set<number>, discardCostIndices: Set<number>, useKeySub?: boolean, discardVarIndices?: Set<number>, energyTrashIndices?: Set<number>, trashExileIndices?: Set<number>, fieldTrashZones?: Set<number>, beatZones?: Set<number>) => void;
}

export function SigniActivatedModal(p: SigniActivatedModalProps) {
  const { my, op, isMyTurn, loading, battleCards, battleCardMap, effectsMap, myEnaAllMulti, myColorlessOverrides, myColorSubs, myEnergyExtraColors, myEnergyTrashSubInfo, pickLongPressTimer, setExpandedPickImgUrl } = p.ctx;
  const { pendingSigniActivated, setPendingSigniActivated, selectedSigniActivatedCost, setSelectedSigniActivatedCost, selectedSigniActivatedDiscard, setSelectedSigniActivatedDiscard, selectedSigniActivatedDiscardVar, setSelectedSigniActivatedDiscardVar, selectedSigniActivatedFieldTrash, setSelectedSigniActivatedFieldTrash, selectedSigniActivatedEnergyTrash, setSelectedSigniActivatedEnergyTrash, selectedSigniActivatedTrashExile, setSelectedSigniActivatedTrashExile, selectedSigniActivatedBeat, setSelectedSigniActivatedBeat, signiActCharmTrashVar, setSigniActCharmTrashVar, keySubstituteEnabled, setKeySubstituteEnabled, executeSigniActivated } = p;
  return (
    <>
      {pendingSigniActivated && createPortal(
        <div
          onClick={() => { setPendingSigniActivated(null); setSelectedSigniActivatedCost(new Set()); setSelectedSigniActivatedDiscard(new Set()); setKeySubstituteEnabled(false); setSelectedSigniActivatedFieldTrash(new Set()); }}
          style={{ position: 'fixed', inset: 0, zIndex: 4000,
            backgroundColor: 'rgba(0,0,0,0.92)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div
            onClick={e => e.stopPropagation()}
            style={{ backgroundColor: C.bgModal, border: C.borderUI, borderRadius: 12,
              padding: '20px 16px', width: 'min(95vw, 400px)', maxHeight: '85vh',
              display: 'flex', flexDirection: 'column', gap: 12 }}>
            {/* カード情報 */}
            {(() => {
              const card = battleCardMap.get(pendingSigniActivated.cardNum);
              const eff  = pendingSigniActivated.effect;
              const isCostZeroByEffect = my.activate_cost_zero_signi === pendingSigniActivated.cardNum;
              const energyTotal = isCostZeroByEffect ? 0 : (eff.cost?.energy ?? []).reduce((s, c) => s + c.count, 0);
              const actDiscardGroups = eff.cost?.discardGroups;
              const discardNeeded = actDiscardGroups
                ? actDiscardGroups.reduce((s, g) => s + g.count, 0)
                : (eff.cost?.discard ?? 0);
              const actDiscardFilter = eff.cost?.discardFilter;
              const actFilterLabel = actDiscardGroups
                ? actDiscardGroups.map(g => `${fmtDiscardFilterLabel(g.filter) || 'カード'}${g.count}枚`).join('と')
                : fmtDiscardFilterLabel(actDiscardFilter);
              const costStr = isCostZeroByEffect ? '' : ((eff.cost?.energy ?? []).map(e => `${e.color}${e.count}`).join('') || '');
              const keySubCount = (!isCostZeroByEffect && keySubstituteEnabled && myEnergyTrashSubInfo.keySubInstId) ? 2 : 0;
              // INCREASE_ACT_ABILITY_COST: 相手フィールドが持つ場合、自分のターン中に起動能力コスト+1
              const actCostExtra = isCostZeroByEffect ? 0 : collectIncreaseActCost(op, isMyTurn, effectsMap);
              const actExtraCosts: { color: string; count: number }[] =
                actCostExtra > 0 ? [{ color: '無', count: actCostExtra }] : [];
              const adjustedTotal = Math.max(0, energyTotal + actCostExtra - keySubCount);
              const selectedNums = [...selectedSigniActivatedCost].map(i => my.energy[i]);
              const energyOk = energyTotal === 0 && actCostExtra === 0
                ? true
                : selectedSigniActivatedCost.size === adjustedTotal &&
                  (actCostExtra > 0
                    ? canAffordWithExtraCost(selectedNums, battleCards, costStr, actExtraCosts, my.keyword_grants, myEnaAllMulti, myColorlessOverrides, myColorSubs, myEnergyExtraColors, myEnergyTrashSubInfo.wildcardInstIds, myEnergyTrashSubInfo.colorOverrideMap, keySubCount)
                    : canAffordGrowCost(selectedNums, battleCards, costStr, my.keyword_grants, myEnaAllMulti, myColorlessOverrides, myColorSubs, myEnergyExtraColors, myEnergyTrashSubInfo.wildcardInstIds, myEnergyTrashSubInfo.colorOverrideMap, keySubCount));
              const actDiscardVar = eff.cost?.discardVariable;
              const discardVarOk = actDiscardVar
                ? (selectedSigniActivatedDiscardVar.size >= actDiscardVar.min)
                : true;
              const discardOk = eff.cost?.discardAll
                ? true // 手札をすべて捨てる：選択不要・常に支払い可能
                : actDiscardVar
                  ? discardVarOk
                  : actDiscardGroups
                    ? (selectedSigniActivatedDiscard.size === discardNeeded &&
                       canSatisfyDiscardGroups([...selectedSigniActivatedDiscard].map(i => battleCardMap.get(my.hand[i])), actDiscardGroups))
                    : selectedSigniActivatedDiscard.size >= discardNeeded;
              // 《コインアイコン》コスト（リル//メモリア等の【起】コイン）
              const coinNeededAct = isCostZeroByEffect ? 0 : (eff.cost?.coin ?? 0);
              const coinOkAct = coinNeededAct === 0 || (my.coins ?? 0) >= coinNeededAct;
              const virusNeededAct = eff.cost?.removeOppVirus ?? 0;
              const virusOkAct = virusNeededAct === 0 || (op.field.signi_virus ?? []).reduce((s, v) => s + v, 0) >= virusNeededAct;
              const charmTrashNActM = eff.cost?.charmTrash ?? 0;
              const charmOkAct = charmTrashNActM === 0 || (my.field.signi_charms ?? []).filter(Boolean).length >= charmTrashNActM;
              const charmVarActCostM = eff.cost?.charmTrashVariable;
              const totalActCharmsM = (my.field.signi_charms ?? []).filter(Boolean).length;
              const charmVarActOk = !charmVarActCostM || signiActCharmTrashVar >= charmVarActCostM.min;
              // energyTrash: エナゾーンから指定カードN枚コスト
              const actEnergyTrashCost = eff.cost?.energyTrash;
              const actEnergyTrashOk = !actEnergyTrashCost || selectedSigniActivatedEnergyTrash.size >= actEnergyTrashCost.count;
              // trashExile: トラッシュからカードをゲーム除外コスト
              const actTrashExileCost = eff.cost?.trashExile;
              const actTrashExileOk = !actTrashExileCost || actTrashExileCost.self
                ? true
                : selectedSigniActivatedTrashExile.size >= (actTrashExileCost?.count ?? 0);
              // fieldTrash: 場のシグニをコストでトラッシュ（excludeSelf=効果元自身を除く。WX03-035等）
              const actFieldTrashCost = eff.cost?.fieldTrash;
              const actFieldTrashGroups = eff.cost?.fieldTrashGroups;
              const actSelfZoneFt = my.field.signi.findIndex(s => s?.at(-1) === pendingSigniActivated.cardNum);
              const actFtNeeded = actFieldTrashGroups
                ? actFieldTrashGroups.reduce((s, g) => s + g.count, 0)
                : (actFieldTrashCost?.count ?? 0);
              const actFtSelectableZones = actFieldTrashGroups
                ? [0, 1, 2].filter(zi => {
                    const top = my.field.signi[zi]?.at(-1);
                    if (!top) return false;
                    const c = battleCardMap.get(getCardNum(top));
                    return actFieldTrashGroups.some(g => !g.filter || matchesFilter(c, g.filter));
                  })
                : actFieldTrashCost ? [0, 1, 2].filter(zi => {
                    const top = my.field.signi[zi]?.at(-1);
                    if (!top) return false;
                    if (actFieldTrashCost.excludeSelf && zi === actSelfZoneFt) return false;
                    return !actFieldTrashCost.filter || matchesFilter(battleCardMap.get(getCardNum(top)), actFieldTrashCost.filter);
                  }) : [];
              const actFieldTrashOk = actFieldTrashGroups
                ? fieldTrashGroupsSatisfied(actFieldTrashGroups, [...selectedSigniActivatedFieldTrash], my.field.signi, battleCardMap)
                : (actFtNeeded === 0 || selectedSigniActivatedFieldTrash.size === actFtNeeded);
              // beat_signi: 「他の/任意」シグニを【ビート】にする対象のゾーン選択（候補が必要数より多いとき）
              const actBeatCost = analyzeBeatSigniCost(my, pendingSigniActivated.cardNum, battleCardMap, eff.cost?.beat_signi ?? 0);
              const actBeatNeedSelect = (eff.cost?.beat_signi ?? 0) > 0 && actBeatCost.otherPart > 0 && actBeatCost.eligibleOtherZones.length > actBeatCost.otherPart;
              const actBeatSelectOk = !actBeatNeedSelect || selectedSigniActivatedBeat.size === actBeatCost.otherPart;
              const canAfford = energyOk && discardOk && coinOkAct && virusOkAct && charmOkAct && charmVarActOk && actEnergyTrashOk && actTrashExileOk && actFieldTrashOk && actBeatSelectOk;

              return (
                <>
                  <p style={{ color: C.textSub, fontSize: 14, fontWeight: 'bold', margin: 0, textAlign: 'center' }}>
                    【起】効果を発動
                  </p>
                  {card && (
                    <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                      <img src={card.ImgURL} alt={card.CardName}
                        style={{ width: 52, height: 72, objectFit: 'cover', borderRadius: 4, flexShrink: 0 }} />
                      <div>
                        <p style={{ color: C.text, fontSize: 13, fontWeight: 'bold', margin: '0 0 4px' }}>{card.CardName}</p>
                        <p style={{ color: C.textFaint, fontSize: 11, margin: 0 }}>
                          コスト: {[
                            energyTotal > 0 ? `エナ${energyTotal}枚` : null,
                            eff.cost?.energyTrashAll ? 'エナをすべてトラッシュ' : null,
                            eff.cost?.discardAll ? `手札をすべて捨てる（${my.hand.length}枚）` :
                              actDiscardVar ? `手札から${fmtDiscardFilterLabel(actDiscardVar.filter) || 'カード'}${actDiscardVar.min}枚以上` :
                              actDiscardGroups ? `手札から${actFilterLabel}` :
                                eff.cost?.discard ? `手札${actDiscardFilter ? `の${actFilterLabel}` : ''}${eff.cost.discard}枚` : null,
                            coinNeededAct > 0 ? `《コイン》×${coinNeededAct}（所持${my.coins ?? 0}）` : null,
                            eff.cost?.down_self ? 'このシグニをダウン' : null,
                            virusNeededAct > 0 ? `相手の【ウィルス】${virusNeededAct}個除去（現在${(op.field.signi_virus ?? []).reduce((s, v) => s + v, 0)}個）` : null,
                            eff.cost?.trash_self ? 'このシグニをトラッシュ' : null,
                            eff.cost?.trash_key ? 'このキーをルリグトラッシュ' : null,
                            charmTrashNActM > 0 ? `チャーム${charmTrashNActM}枚トラッシュ（現在${totalActCharmsM}枚）` : null,
                            charmVarActCostM ? `チャーム${charmVarActCostM.min}枚以上トラッシュ（現在${totalActCharmsM}枚）` : null,
                            actEnergyTrashCost ? `エナ${fmtDiscardFilterLabel(actEnergyTrashCost.filter) || 'シグニ'}${actEnergyTrashCost.count}枚トラッシュ` : null,
                            actTrashExileCost?.self ? 'このカードをゲームから除外' : actTrashExileCost ? `トラッシュから${actTrashExileCost.count ?? 1}枚ゲーム除外` : null,
                          ].filter(Boolean).join('・') || 'なし'}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* キーピース代替トグル */}
                  {myEnergyTrashSubInfo.keySubInstId && energyTotal > 0 && (
                    <button
                      onClick={() => {
                        setKeySubstituteEnabled(v => !v);
                        setSelectedSigniActivatedCost(new Set());
                      }}
                      style={{ padding: '6px 10px', borderRadius: 6, border: keySubstituteEnabled ? '2px solid #ff9800' : C.borderUI,
                        backgroundColor: keySubstituteEnabled ? 'rgba(255,152,0,0.2)' : 'transparent',
                        color: C.text, fontSize: 11, cursor: 'pointer', textAlign: 'left' }}>
                      {keySubstituteEnabled ? '✓ ' : ''}キー代替: {battleCardMap.get(myEnergyTrashSubInfo.keySubInstId)?.CardName ?? 'キー'} をルリグTへ (エナ2任意色分)
                    </button>
                  )}

                  {(energyTotal > 0 || actCostExtra > 0) && (
                    <>
                      <p style={{ color: C.text, fontSize: 12, margin: 0 }}>
                        エナゾーンから選択: {selectedSigniActivatedCost.size} / {adjustedTotal}枚
                        {actCostExtra > 0 && (
                          <span style={{ marginLeft: 6, color: C.warn }}>(+《無》×{actCostExtra})</span>
                        )}
                      </p>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, overflowY: 'auto', maxHeight: 180 }}>
                        {my.energy.map((num, i) => {
                          const c = battleCardMap.get(num);
                          const isSel = selectedSigniActivatedCost.has(i);
                          const isWild = isMultiEna(num, battleCards, my.keyword_grants, myEnaAllMulti);
                          const isTrashWild = myEnergyTrashSubInfo.wildcardInstIds.has(num);
                          const trashColor = myEnergyTrashSubInfo.colorOverrideMap.get(num);
                          const borderColor = isSel ? '#f44336' : isTrashWild ? '#4caf50' : trashColor ? '#9c27b0' : isWild ? '#ffcc00' : undefined;
                          return (
                            <div key={i}
                              onClick={() => setSelectedSigniActivatedCost(prev => {
                                const next = new Set(prev);
                                if (next.has(i)) { next.delete(i); return next; }
                                if (next.size >= adjustedTotal) return prev;
                                next.add(i); return next;
                              })}
                              onPointerDown={() => { pickLongPressTimer.current = setTimeout(() => { setExpandedPickImgUrl(c?.ImgURL ?? null); }, 500); }}
                              onPointerUp={() => { if (pickLongPressTimer.current) { clearTimeout(pickLongPressTimer.current); pickLongPressTimer.current = null; } }}
                              onPointerLeave={() => { if (pickLongPressTimer.current) { clearTimeout(pickLongPressTimer.current); pickLongPressTimer.current = null; } }}
                              onContextMenu={e => e.preventDefault()}
                              style={{ position: 'relative', width: 44, height: 62, borderRadius: 3, flexShrink: 0,
                                border: borderColor ? `${isSel ? '2px' : '1px'} solid ${borderColor}` : C.borderCard,
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
                              {!isSel && (isTrashWild || trashColor || isWild) && (
                                <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0,
                                  backgroundColor: isTrashWild ? 'rgba(76,175,80,0.85)' : trashColor ? 'rgba(156,39,176,0.85)' : 'rgba(255,204,0,0.85)',
                                  textAlign: 'center' }}>
                                  <span style={{ fontSize: 7, fontWeight: 'bold', color: '#fff' }}>
                                    {isTrashWild ? '代替' : trashColor ? trashColor : 'マルチ'}
                                  </span>
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

                  {/* discardAll: 手札をすべて捨てる（選択不要） */}
                  {eff.cost?.discardAll && my.hand.length > 0 && (
                    <p style={{ color: C.warn, fontSize: 12, margin: 0, textAlign: 'center' }}>
                      手札 {my.hand.length} 枚をすべてトラッシュに捨てます
                    </p>
                  )}
                  {eff.cost?.energyTrashAll && my.energy.length > 0 && (
                    <p style={{ color: C.warn, fontSize: 12, margin: 0, textAlign: 'center' }}>
                      エナゾーン {my.energy.length} 枚をすべてトラッシュに置きます
                    </p>
                  )}

                  {/* discardVariable: 可変枚数手札捨て（WDK13-011: ＜宇宙＞シグニを1枚以上） */}
                  {actDiscardVar && (
                    <>
                      <p style={{ color: discardVarOk ? C.success : C.textMuted, fontSize: 12, margin: 0 }}>
                        手札から{fmtDiscardFilterLabel(actDiscardVar.filter) || 'カード'}を選択（{actDiscardVar.min}枚以上）:
                        {' '}{selectedSigniActivatedDiscardVar.size}枚選択中
                      </p>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, overflowY: 'auto', maxHeight: 180 }}>
                        {my.hand.map((num, i) => {
                          const c = battleCardMap.get(num);
                          const matchesVar = !actDiscardVar.filter || matchesFilter(c, actDiscardVar.filter);
                          const isSel = selectedSigniActivatedDiscardVar.has(i);
                          return (
                            <div key={i}
                              onClick={() => matchesVar && setSelectedSigniActivatedDiscardVar(prev => {
                                const next = new Set(prev);
                                if (next.has(i)) { next.delete(i); } else { next.add(i); }
                                return next;
                              })}
                              onPointerDown={() => { pickLongPressTimer.current = setTimeout(() => { setExpandedPickImgUrl(c?.ImgURL ?? null); }, 500); }}
                              onPointerUp={() => { if (pickLongPressTimer.current) { clearTimeout(pickLongPressTimer.current); pickLongPressTimer.current = null; } }}
                              onPointerLeave={() => { if (pickLongPressTimer.current) { clearTimeout(pickLongPressTimer.current); pickLongPressTimer.current = null; } }}
                              onContextMenu={e => e.preventDefault()}
                              style={{ position: 'relative', width: 44, height: 62, borderRadius: 3, flexShrink: 0,
                                border: isSel ? '2px solid #ff9800' : C.borderCard,
                                opacity: matchesVar ? 1 : 0.3,
                                cursor: matchesVar ? 'pointer' : 'default', overflow: 'hidden' }}>
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

                  {!eff.cost?.discardAll && !actDiscardVar && discardNeeded > 0 && (
                    <>
                      <p style={{ color: C.text, fontSize: 12, margin: 0 }}>
                        手札から捨てるカードを選択: {selectedSigniActivatedDiscard.size} / {discardNeeded}枚
                        {actDiscardGroups ? `（${actFilterLabel}）` : actDiscardFilter ? `（${actFilterLabel}のみ）` : ''}
                      </p>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, overflowY: 'auto', maxHeight: 180 }}>
                        {my.hand.map((num, i) => {
                          const c = battleCardMap.get(num);
                          const isSel = selectedSigniActivatedDiscard.has(i);
                          const matchesActDiscard = actDiscardGroups
                            ? actDiscardGroups.some(g => matchesFilter(c, g.filter))
                            : (!actDiscardFilter || matchesFilter(c, actDiscardFilter));
                          return (
                            <div key={i}
                              onClick={() => matchesActDiscard && setSelectedSigniActivatedDiscard(prev => {
                                const next = new Set(prev);
                                if (next.has(i)) { next.delete(i); return next; }
                                if (next.size >= discardNeeded) return prev;
                                next.add(i); return next;
                              })}
                              onPointerDown={() => { pickLongPressTimer.current = setTimeout(() => { setExpandedPickImgUrl(c?.ImgURL ?? null); }, 500); }}
                              onPointerUp={() => { if (pickLongPressTimer.current) { clearTimeout(pickLongPressTimer.current); pickLongPressTimer.current = null; } }}
                              onPointerLeave={() => { if (pickLongPressTimer.current) { clearTimeout(pickLongPressTimer.current); pickLongPressTimer.current = null; } }}
                              onContextMenu={e => e.preventDefault()}
                              style={{ position: 'relative', width: 44, height: 62, borderRadius: 3, flexShrink: 0,
                                border: isSel ? '2px solid #ff9800' : C.borderCard,
                                opacity: matchesActDiscard ? 1 : 0.35,
                                cursor: matchesActDiscard ? 'pointer' : 'default', overflow: 'hidden' }}>
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

                  {/* charmTrashVariable: 可変チャームトラッシュ枚数選択ステッパー */}
                  {charmVarActCostM && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <p style={{ color: charmVarActOk ? C.text : C.warn, fontSize: 12, margin: 0 }}>
                        チャームをトラッシュする枚数を選択（{charmVarActCostM.min}枚以上）: 場のチャーム {totalActCharmsM}枚
                      </p>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <button
                          onClick={() => setSigniActCharmTrashVar(v => Math.max(0, v - 1))}
                          disabled={signiActCharmTrashVar <= 0}
                          style={{ width: 32, height: 32, borderRadius: 6, border: C.borderUI, backgroundColor: C.bgButton,
                            color: C.text, fontSize: 18, cursor: signiActCharmTrashVar <= 0 ? 'default' : 'pointer' }}>
                          −
                        </button>
                        <span style={{ minWidth: 40, textAlign: 'center', color: C.text, fontSize: 16, fontWeight: 'bold' }}>
                          {signiActCharmTrashVar}枚
                        </span>
                        <button
                          onClick={() => setSigniActCharmTrashVar(v => Math.min(totalActCharmsM, v + 1))}
                          disabled={signiActCharmTrashVar >= totalActCharmsM}
                          style={{ width: 32, height: 32, borderRadius: 6, border: C.borderUI, backgroundColor: C.bgButton,
                            color: C.text, fontSize: 18, cursor: signiActCharmTrashVar >= totalActCharmsM ? 'default' : 'pointer' }}>
                          ＋
                        </button>
                      </div>
                    </div>
                  )}

                  {/* energyTrash: エナゾーンから指定シグニをトラッシュするコスト選択 */}
                  {actEnergyTrashCost && (
                    <>
                      <p style={{ color: actEnergyTrashOk ? C.text : C.warn, fontSize: 12, margin: 0 }}>
                        エナから{fmtDiscardFilterLabel(actEnergyTrashCost.filter) || 'シグニ'}をトラッシュに置く:
                        {' '}{selectedSigniActivatedEnergyTrash.size} / {actEnergyTrashCost.count}枚
                      </p>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, overflowY: 'auto', maxHeight: 180 }}>
                        {my.energy.map((num, i) => {
                          const c = battleCardMap.get(num);
                          const matches = !actEnergyTrashCost.filter || matchesFilter(c, actEnergyTrashCost.filter);
                          const isSel = selectedSigniActivatedEnergyTrash.has(i);
                          return (
                            <div key={i}
                              onClick={() => matches && setSelectedSigniActivatedEnergyTrash(prev => {
                                const next = new Set(prev);
                                if (next.has(i)) { next.delete(i); return next; }
                                if (next.size >= actEnergyTrashCost.count) return prev;
                                next.add(i); return next;
                              })}
                              onPointerDown={() => { pickLongPressTimer.current = setTimeout(() => { setExpandedPickImgUrl(c?.ImgURL ?? null); }, 500); }}
                              onPointerUp={() => { if (pickLongPressTimer.current) { clearTimeout(pickLongPressTimer.current); pickLongPressTimer.current = null; } }}
                              onPointerLeave={() => { if (pickLongPressTimer.current) { clearTimeout(pickLongPressTimer.current); pickLongPressTimer.current = null; } }}
                              onContextMenu={e => e.preventDefault()}
                              style={{ position: 'relative', width: 44, height: 62, borderRadius: 3, flexShrink: 0,
                                border: isSel ? '2px solid #4caf50' : C.borderCard,
                                opacity: matches ? 1 : 0.35,
                                cursor: matches ? 'pointer' : 'default', overflow: 'hidden' }}>
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
                                <div style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(76,175,80,0.4)',
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

                  {/* trashExile: トラッシュからカードをゲーム除外するコスト選択 */}
                  {actTrashExileCost && !actTrashExileCost.self && (
                    <>
                      <p style={{ color: actTrashExileOk ? C.text : C.warn, fontSize: 12, margin: 0 }}>
                        トラッシュから{actTrashExileCost.filter?.cardName ? `《${actTrashExileCost.filter.cardName}》` : 'カード'}をゲームから除外:
                        {' '}{selectedSigniActivatedTrashExile.size} / {actTrashExileCost.count ?? 1}枚
                      </p>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, overflowY: 'auto', maxHeight: 180 }}>
                        {my.trash.map((num, i) => {
                          const c = battleCardMap.get(num);
                          const matches = !actTrashExileCost.filter || matchesFilter(c, actTrashExileCost.filter);
                          const isSel = selectedSigniActivatedTrashExile.has(i);
                          const needed = actTrashExileCost.count ?? 1;
                          return (
                            <div key={i}
                              onClick={() => matches && setSelectedSigniActivatedTrashExile(prev => {
                                const next = new Set(prev);
                                if (next.has(i)) { next.delete(i); return next; }
                                if (next.size >= needed) return prev;
                                next.add(i); return next;
                              })}
                              onPointerDown={() => { pickLongPressTimer.current = setTimeout(() => { setExpandedPickImgUrl(c?.ImgURL ?? null); }, 500); }}
                              onPointerUp={() => { if (pickLongPressTimer.current) { clearTimeout(pickLongPressTimer.current); pickLongPressTimer.current = null; } }}
                              onPointerLeave={() => { if (pickLongPressTimer.current) { clearTimeout(pickLongPressTimer.current); pickLongPressTimer.current = null; } }}
                              onContextMenu={e => e.preventDefault()}
                              style={{ position: 'relative', width: 44, height: 62, borderRadius: 3, flexShrink: 0,
                                border: isSel ? '2px solid #9c27b0' : C.borderCard,
                                opacity: matches ? 1 : 0.35,
                                cursor: matches ? 'pointer' : 'default', overflow: 'hidden' }}>
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
                  {actTrashExileCost?.self && (
                    <p style={{ color: C.warn, fontSize: 12, margin: 0, textAlign: 'center' }}>
                      このカードをゲームから除外します
                    </p>
                  )}

                  {/* fieldTrash: 場のシグニを場からトラッシュするコスト選択（excludeSelf=効果元を除く。WX03-035等） */}
                  {(actFieldTrashCost || actFieldTrashGroups) && actFtNeeded > 0 && (
                    <>
                      <p style={{ color: actFieldTrashOk ? C.text : C.warn, fontSize: 12, margin: 0 }}>
                        場から{actFieldTrashGroups
                          ? actFieldTrashGroups.map(g => `${fmtDiscardFilterLabel(g.filter)}シグニ${g.count}体`).join('と')
                          : `${actFieldTrashCost!.excludeSelf ? '他の' : ''}${fmtDiscardFilterLabel(actFieldTrashCost!.filter)}シグニ`}をトラッシュ:
                        {' '}{selectedSigniActivatedFieldTrash.size} / {actFtNeeded}体
                      </p>
                      {actFtSelectableZones.length === 0 ? (
                        <p style={{ color: C.warn, fontSize: 11, margin: 0 }}>対象シグニがいません</p>
                      ) : (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                          {actFtSelectableZones.map(zi => {
                            const top = my.field.signi[zi]?.at(-1);
                            const c = top ? battleCardMap.get(getCardNum(top)) : undefined;
                            const isSel = selectedSigniActivatedFieldTrash.has(zi);
                            return (
                              <div key={zi}
                                onClick={() => setSelectedSigniActivatedFieldTrash(prev => {
                                  const next = new Set(prev);
                                  if (next.has(zi)) { next.delete(zi); return next; }
                                  if (next.size >= actFtNeeded) return prev;
                                  next.add(zi); return next;
                                })}
                                onContextMenu={e => e.preventDefault()}
                                style={{ position: 'relative', width: 52, height: 73, borderRadius: 4, flexShrink: 0,
                                  border: isSel ? '2px solid #4caf50' : C.borderCard,
                                  cursor: 'pointer', overflow: 'hidden' }}>
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
                                  <div style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(76,175,80,0.4)',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <span style={{ color: '#fff', fontSize: 18, fontWeight: 'bold' }}>✓</span>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </>
                  )}
                  {/* beat_signi: 「他の/任意」シグニを【ビート】にする対象のゾーン選択（候補が必要数より多いとき） */}
                  {actBeatNeedSelect && (
                    <>
                      <p style={{ color: actBeatSelectOk ? C.text : C.warn, fontSize: 12, margin: 0 }}>
                        【ビート】にするシグニを選択: {selectedSigniActivatedBeat.size} / {actBeatCost.otherPart}体
                        {actBeatCost.includeSelf ? '（このシグニは自動で【ビート】に）' : '（このシグニ以外）'}
                      </p>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {actBeatCost.eligibleOtherZones.map(zi => {
                          const top = my.field.signi[zi]?.at(-1);
                          const c = top ? battleCardMap.get(getCardNum(top)) : undefined;
                          const isSel = selectedSigniActivatedBeat.has(zi);
                          return (
                            <div key={zi}
                              onClick={() => setSelectedSigniActivatedBeat(prev => {
                                const next = new Set(prev);
                                if (next.has(zi)) { next.delete(zi); return next; }
                                if (next.size >= actBeatCost.otherPart) return prev;
                                next.add(zi); return next;
                              })}
                              onContextMenu={e => e.preventDefault()}
                              style={{ position: 'relative', width: 52, height: 73, borderRadius: 4, flexShrink: 0,
                                border: isSel ? '2px solid #ff9800' : C.borderCard,
                                cursor: 'pointer', overflow: 'hidden' }}>
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

                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      onClick={() => { setPendingSigniActivated(null); setSelectedSigniActivatedCost(new Set()); setSelectedSigniActivatedDiscard(new Set()); setSelectedSigniActivatedDiscardVar(new Set()); setSigniActCharmTrashVar(0); setKeySubstituteEnabled(false); setSelectedSigniActivatedEnergyTrash(new Set()); setSelectedSigniActivatedTrashExile(new Set()); setSelectedSigniActivatedFieldTrash(new Set()); setSelectedSigniActivatedBeat(new Set()); }}
                      disabled={loading}
                      style={{ flex: 1, padding: '10px 0', borderRadius: 8, border: C.borderUI,
                        backgroundColor: 'transparent', color: C.textSub, fontSize: 13, cursor: 'pointer' }}>
                      キャンセル
                    </button>
                    <button
                      onClick={() => executeSigniActivated(pendingSigniActivated.cardNum, eff, selectedSigniActivatedCost, selectedSigniActivatedDiscard, keySubstituteEnabled, selectedSigniActivatedDiscardVar, selectedSigniActivatedEnergyTrash, selectedSigniActivatedTrashExile, selectedSigniActivatedFieldTrash, selectedSigniActivatedBeat)}
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
