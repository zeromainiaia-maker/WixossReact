// トラッシュ自己起動【起】（「このシグニをトラッシュから場に出す」等）のコスト支払いモーダル。
// エナに加えて手札捨て／コイン／【ウィルス】除去／【チャーム】／ルリグダウン／エクシードを払える（PLAN §6.4）。
// ⚠ 支払い可否の判定は `trashActivateCost.ts` の共有関数だけを使う（自前で条件を写経しない）。
import type { Dispatch, SetStateAction } from 'react';
import { createPortal } from 'react-dom';
import type { CardEffect } from '../../../types/effects';
import { C } from '../../../components/BoardComponents';
import { getCardNum } from '../../../engine/effectExecutor';
import { energyCostToString, canAffordGrowCost, isMultiEna } from '../costs';
import {
  trashActivateAutoCostShortfall, trashActivateCostLabels, trashActivateEnergyTotal, trashActivateVerbLabel,
  trashActivateExceedPool, trashActivateHandDiscard, trashActivateSelectionsSatisfied,
} from '../trashActivateCost';
import { energyPayEntryLabel } from '../energyPaySource';
import type { BattleModalCtx } from './types';

interface TrashActivatedModalProps {
  ctx: BattleModalCtx;
  pendingTrashActivated: { cardNum: string; effect: CardEffect } | null;
  setPendingTrashActivated: Dispatch<SetStateAction<{ cardNum: string; effect: CardEffect } | null>>;
  selectedTrashActivatedCost: Set<number>;
  setSelectedTrashActivatedCost: Dispatch<SetStateAction<Set<number>>>;
  selectedTrashActivatedDiscard: Set<number>;
  setSelectedTrashActivatedDiscard: Dispatch<SetStateAction<Set<number>>>;
  selectedTrashActivatedExceed: Set<number>;
  setSelectedTrashActivatedExceed: Dispatch<SetStateAction<Set<number>>>;
  executeTrashActivated: (
    cardNum: string, effect: CardEffect,
    costIndices: Set<number>, discardIndices: Set<number>, exceedIndices: Set<number>,
  ) => void;
}

/** 選択トグル（上限つき）。エナ／手札／エクシードで同じ挙動なので1本にまとめる。 */
function toggleCapped(prev: Set<number>, index: number, cap: number): Set<number> {
  const next = new Set(prev);
  if (next.has(index)) { next.delete(index); return next; }
  if (next.size >= cap) return prev;
  next.add(index);
  return next;
}

export function TrashActivatedModal(p: TrashActivatedModalProps) {
  const { my, op, loading, battleCards, battleCardMap, myEnaAllMulti, myEnaMultiStripped, myColorlessOverrides, myColorSubs, myEnergyExtraColors, pickLongPressTimer, setExpandedPickImgUrl , myEnergyPayPool } = p.ctx;
  const {
    pendingTrashActivated, setPendingTrashActivated,
    selectedTrashActivatedCost, setSelectedTrashActivatedCost,
    selectedTrashActivatedDiscard, setSelectedTrashActivatedDiscard,
    selectedTrashActivatedExceed, setSelectedTrashActivatedExceed,
    executeTrashActivated,
  } = p;
  const closeAll = () => {
    setPendingTrashActivated(null);
    setSelectedTrashActivatedCost(new Set());
    setSelectedTrashActivatedDiscard(new Set());
    setSelectedTrashActivatedExceed(new Set());
  };
  return (
    <>
      {pendingTrashActivated && createPortal(
        <div data-testid="trashact-modal" onClick={closeAll}
          style={{ position: 'fixed', inset: 0, zIndex: 3500,
            backgroundColor: 'rgba(0,0,0,0.92)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div onClick={e => e.stopPropagation()}
            style={{ backgroundColor: C.bgModal, border: C.borderUI, borderRadius: 12,
              padding: '20px 16px', width: 'min(92vw, 400px)', maxHeight: '85vh',
              display: 'flex', flexDirection: 'column', gap: 12 }}>
            {(() => {
              const taCard = battleCardMap.get(pendingTrashActivated.cardNum);
              if (!taCard) return null;
              const taEffect = pendingTrashActivated.effect;
              const energyCosts = taEffect.cost?.energy ?? [];
              const energyTotal = trashActivateEnergyTotal(taEffect.cost);
              const energyCostStr = energyCostToString(energyCosts);
              const selectedNums = [...selectedTrashActivatedCost].map(i => myEnergyPayPool[i].cardNum);
              const energyOk = energyTotal === 0 ||
                canAffordGrowCost(selectedNums, battleCards, energyCostStr, my.keyword_grants, myEnaAllMulti, myEnaMultiStripped, myColorlessOverrides, myColorSubs, myEnergyExtraColors);
              const handDiscard = trashActivateHandDiscard(taEffect.cost);
              const exceedCost = taEffect.cost?.exceed ?? 0;
              const exceedPool = exceedCost > 0 ? trashActivateExceedPool(my) : [];
              const shortfall = trashActivateAutoCostShortfall(taEffect, my, op, battleCardMap);
              const selectionsOk = trashActivateSelectionsSatisfied(
                taEffect, my,
                { energy: selectedTrashActivatedCost, handDiscard: selectedTrashActivatedDiscard, exceed: selectedTrashActivatedExceed },
                battleCardMap,
              );
              const isValid = energyOk && selectionsOk && shortfall === null;
              const costLabels = trashActivateCostLabels(taEffect, my, op);
              return (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <button data-testid="trashact-cancel" onClick={closeAll}
                      style={{ padding: '4px 10px', borderRadius: 6, border: C.borderUI,
                        backgroundColor: 'transparent', color: C.textDim, cursor: 'pointer', fontSize: 12 }}>
                      ← キャンセル
                    </button>
                    <p style={{ color: C.textSub, fontSize: 14, fontWeight: 'bold', margin: 0 }}>
                      【起】トラッシュ発動
                    </p>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <img src={taCard.ImgURL} alt={taCard.CardName}
                      style={{ width: 36, height: 50, objectFit: 'cover', borderRadius: 3, flexShrink: 0 }}
                      onError={e => { const img = e.target as HTMLImageElement; if (!img.src.endsWith('/ErrerCard.webp')) img.src = '/ErrerCard.webp'; }} />
                    <div>
                      <p style={{ color: C.text, fontSize: 12, fontWeight: 'bold', margin: '0 0 2px' }}>{taCard.CardName}</p>
                      <p style={{ color: C.textDim, fontSize: 11, margin: 0 }}>
                        このシグニをトラッシュから場に出す
                      </p>
                      <p data-testid="trashact-cost-summary"
                        data-coin-cost={taEffect.cost?.coin ?? 0}
                        data-lrig-down-count={taEffect.cost?.lrigDown?.count ?? 0}
                        data-lrig-down-level={taEffect.cost?.lrigDown?.level ?? 0}
                        style={{ color: C.textFaint, fontSize: 11, margin: '2px 0 0' }}>
                        コスト: {costLabels.join('・') || 'なし'}
                      </p>
                      {shortfall && (
                        <p style={{ color: C.warn, fontSize: 11, margin: '4px 0 0' }}>{shortfall}</p>
                      )}
                    </div>
                  </div>
                  {energyTotal > 0 && (
                    <>
                      <p style={{ color: energyOk && selectedTrashActivatedCost.size === energyTotal ? C.success : C.textMuted,
                        fontSize: 12, margin: 0, textAlign: 'center' }}>
                        エナから選択: {selectedTrashActivatedCost.size} / {energyTotal}枚
                        {energyCosts.map((c, i) => (
                          <span key={i} style={{ marginLeft: 6, color: C.textDim }}>({c.color}×{c.count})</span>
                        ))}
                      </p>
                      <div style={{ overflowY: 'auto', maxHeight: 160, display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center' }}>
                        {myEnergyPayPool.map((payEntry, i) => {
                          const num = payEntry.cardNum;
                          const card = battleCardMap.get(num);
                          const isSel = selectedTrashActivatedCost.has(i);
                          const isWild = isMultiEna(num, battleCards, my.keyword_grants, myEnaAllMulti, myEnaMultiStripped);
                          return (
                            <div key={i} data-testid={`trashact-energy-${i}`} data-card-num={getCardNum(num)}
                              title={energyPayEntryLabel(payEntry, battleCardMap) ?? undefined}
                              onClick={() => setSelectedTrashActivatedCost(prev => toggleCapped(prev, i, energyTotal))}
                              onContextMenu={e => e.preventDefault()}
                              style={{ position: 'relative', width: 52, height: 73, borderRadius: 4,
                                overflow: 'hidden', cursor: 'pointer', flexShrink: 0,
                                border: isSel ? C.borderMulliganSel : isWild ? '1px solid #ffcc00' : C.borderCard }}>
                              {card
                                ? <img src={card.ImgURL} alt={card.CardName} draggable={false}
                                    style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                                    onError={e => { const img = e.target as HTMLImageElement; if (!img.src.endsWith('/ErrerCard.webp')) img.src = '/ErrerCard.webp'; }} />
                                : <div style={{ width: '100%', height: '100%', backgroundColor: C.bgButton,
                                    display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <span style={{ fontSize: 8, color: C.textFaint }}>{num}</span>
                                  </div>
                              }
                              {isSel && (
                                <div style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(244,67,54,0.45)',
                                  display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                  <span style={{ color: C.text, fontSize: 14, fontWeight: 'bold' }}>✓</span>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </>
                  )}

                  {/* 手札捨てコスト（discard / discardFilter / handDiscardSigni を1つの選択UIに畳んである） */}
                  {handDiscard && (
                    <>
                      <p style={{ color: selectedTrashActivatedDiscard.size === handDiscard.count ? C.success : C.textMuted,
                        fontSize: 12, margin: 0 }}>
                        {handDiscard.label}: {selectedTrashActivatedDiscard.size} / {handDiscard.count}枚
                      </p>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, overflowY: 'auto', maxHeight: 160 }}>
                        {my.hand.map((num, i) => {
                          const card = battleCardMap.get(num);
                          const canPick = handDiscard.matches(card);
                          const isSel = selectedTrashActivatedDiscard.has(i);
                          return (
                            <div key={i} data-testid={`trashact-hand-${i}`} data-card-num={getCardNum(num)} data-selectable={canPick}
                              onClick={() => canPick && setSelectedTrashActivatedDiscard(prev => toggleCapped(prev, i, handDiscard.count))}
                              onPointerDown={() => { pickLongPressTimer.current = setTimeout(() => { setExpandedPickImgUrl(card?.ImgURL ?? null); }, 500); }}
                              onPointerUp={() => { if (pickLongPressTimer.current) { clearTimeout(pickLongPressTimer.current); pickLongPressTimer.current = null; } }}
                              onPointerLeave={() => { if (pickLongPressTimer.current) { clearTimeout(pickLongPressTimer.current); pickLongPressTimer.current = null; } }}
                              onContextMenu={e => e.preventDefault()}
                              style={{ position: 'relative', width: 44, height: 62, borderRadius: 3, flexShrink: 0,
                                border: isSel ? '2px solid #ff9800' : C.borderCard,
                                opacity: canPick ? 1 : 0.35,
                                cursor: canPick ? 'pointer' : 'default', overflow: 'hidden' }}>
                              {card
                                ? <img src={card.ImgURL} alt={card.CardName} draggable={false}
                                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                    onError={e => { const img = e.target as HTMLImageElement; if (!img.src.endsWith('/ErrerCard.webp')) img.src = '/ErrerCard.webp'; }} />
                                : <div style={{ width: '100%', height: '100%', backgroundColor: C.bgButton,
                                    display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <span style={{ fontSize: 7, color: C.textFaint }}>{num}</span>
                                  </div>
                              }
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

                  {/* エクシード: ルリグの下から選んでルリグトラッシュへ */}
                  {exceedCost > 0 && (
                    <>
                      <p style={{ color: selectedTrashActivatedExceed.size === exceedCost ? C.success : C.textMuted,
                        fontSize: 12, margin: 0 }}>
                        エクシード（ルリグの下）から選択: {selectedTrashActivatedExceed.size} / {exceedCost}枚
                      </p>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, overflowY: 'auto', maxHeight: 160 }}>
                        {exceedPool.map((num, i) => {
                          const card = battleCardMap.get(getCardNum(num));
                          const isSel = selectedTrashActivatedExceed.has(i);
                          return (
                            <div key={i} data-testid={`trashact-exceed-${i}`} data-card-num={getCardNum(num)}
                              onClick={() => setSelectedTrashActivatedExceed(prev => toggleCapped(prev, i, exceedCost))}
                              onContextMenu={e => e.preventDefault()}
                              style={{ position: 'relative', width: 44, height: 62, borderRadius: 3, flexShrink: 0,
                                border: isSel ? '2px solid #2196f3' : C.borderCard,
                                cursor: 'pointer', overflow: 'hidden' }}>
                              {card
                                ? <img src={card.ImgURL} alt={card.CardName} draggable={false}
                                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                    onError={e => { const img = e.target as HTMLImageElement; if (!img.src.endsWith('/ErrerCard.webp')) img.src = '/ErrerCard.webp'; }} />
                                : <div style={{ width: '100%', height: '100%', backgroundColor: C.bgButton,
                                    display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <span style={{ fontSize: 7, color: C.textFaint }}>{num}</span>
                                  </div>
                              }
                              {isSel && (
                                <div style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(33,150,243,0.4)',
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

                  <button data-testid="trashact-pay"
                    onClick={() => executeTrashActivated(
                      pendingTrashActivated.cardNum, taEffect,
                      selectedTrashActivatedCost, selectedTrashActivatedDiscard, selectedTrashActivatedExceed,
                    )}
                    disabled={loading || !isValid}
                    style={{ padding: '11px 0', borderRadius: 8, border: 'none',
                      backgroundColor: isValid ? '#ff6b35' : C.disabled,
                      color: C.text, fontSize: 14, fontWeight: 'bold',
                      cursor: (loading || !isValid) ? 'default' : 'pointer' }}>
                    {/* 🆕**文言は本体アクションと入口から決める**（§5.3 `O-114`・実機で発見）＝
                        旧はここが「トラッシュから場に出す」固定だったので、自己回収【起】や
                        エナゾーン起動【起】で**嘘のラベル**を出していた（アクション出し側だけ直しても片肺）。 */}
                    発動する（{taEffect.energyActivated
                      ? 'エナゾーンから手札に加える'
                      : trashActivateVerbLabel(taEffect) === '手札に加える'
                        ? 'トラッシュから手札に加える'
                        : 'トラッシュから場に出す'}）
                  </button>
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
