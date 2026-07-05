// v0.277: 手札から発動する【起】コスト選択モーダル。BattleScreen.tsx から Stage 1 で抽出。
import type { Dispatch, SetStateAction } from 'react';
import { createPortal } from 'react-dom';
import type { CardEffect } from '../../../types/effects';
import { C } from '../../../components/BoardComponents';
import { energyCostToString, canAffordGrowCost, isMultiEna } from '../costs';
import type { BattleModalCtx } from './types';

interface HandActivatedModalProps {
  ctx: BattleModalCtx;
  pendingHandActivated: { cardNum: string; handIndex: number; effect: CardEffect } | null;
  setPendingHandActivated: Dispatch<SetStateAction<{ cardNum: string; handIndex: number; effect: CardEffect } | null>>;
  selectedHandActivatedCost: Set<number>;
  setSelectedHandActivatedCost: Dispatch<SetStateAction<Set<number>>>;
  executeHandActivated: (cardNum: string, handIndex: number, effect: CardEffect, costIndices: Set<number>) => void;
}

export function HandActivatedModal(p: HandActivatedModalProps) {
  const { my, loading, battleCards, battleCardMap, myEnaAllMulti, myColorlessOverrides, myColorSubs, myEnergyExtraColors, pickLongPressTimer, setExpandedPickImgUrl } = p.ctx;
  const { pendingHandActivated, setPendingHandActivated, selectedHandActivatedCost, setSelectedHandActivatedCost, executeHandActivated } = p;
  return (
    <>
      {pendingHandActivated && createPortal(
        <div onClick={() => { setPendingHandActivated(null); setSelectedHandActivatedCost(new Set()); }}
          style={{ position: 'fixed', inset: 0, zIndex: 3500,
            backgroundColor: 'rgba(0,0,0,0.92)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            padding: 20 }}>
          <div onClick={e => e.stopPropagation()}
            style={{ backgroundColor: C.bgModal, border: C.borderUI, borderRadius: 12,
              padding: '20px 16px', width: 'min(92vw, 360px)', maxHeight: '85vh',
              display: 'flex', flexDirection: 'column', gap: 12 }}>
            {(() => {
              const haCard = battleCardMap.get(pendingHandActivated.cardNum);
              if (!haCard) return null;
              const haEffect = pendingHandActivated.effect;
              const energyCosts = haEffect.cost?.energy ?? [];
              const energyTotal = energyCosts.reduce((s, c) => s + c.count, 0);
              const energyCostStr = energyCostToString(energyCosts);
              const selectedNums = [...selectedHandActivatedCost].map(i => my.energy[i]);
              const isValid = energyTotal === 0 ||
                (selectedHandActivatedCost.size === energyTotal &&
                  canAffordGrowCost(selectedNums, battleCards, energyCostStr, my.keyword_grants, myEnaAllMulti, myColorlessOverrides, myColorSubs, myEnergyExtraColors));
              return (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <button onClick={() => { setPendingHandActivated(null); setSelectedHandActivatedCost(new Set()); }}
                      style={{ padding: '4px 10px', borderRadius: 6, border: C.borderUI,
                        backgroundColor: 'transparent', color: C.textDim, cursor: 'pointer', fontSize: 12 }}>
                      ← キャンセル
                    </button>
                    <p style={{ color: C.textSub, fontSize: 14, fontWeight: 'bold', margin: 0 }}>
                      【起】手発動
                    </p>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <img src={haCard.ImgURL} alt={haCard.CardName}
                      style={{ width: 36, height: 50, objectFit: 'cover', borderRadius: 3, flexShrink: 0 }}
                      onError={e => { const img = e.target as HTMLImageElement; if (!img.src.endsWith('/ErrerCard.webp')) img.src = '/ErrerCard.webp'; }} />
                    <div>
                      <p style={{ color: C.text, fontSize: 12, fontWeight: 'bold', margin: '0 0 2px' }}>{haCard.CardName}</p>
                      <p style={{ color: C.textDim, fontSize: 11, margin: 0 }}>コスト: このカードを手札から捨てる{energyTotal > 0 ? `・エナ${energyTotal}枚` : ''}</p>
                    </div>
                  </div>
                  <p style={{ color: C.textMuted, fontSize: 11, margin: 0, textAlign: 'center' }}>
                    このカードを手札からトラッシュに捨てます
                  </p>
                  {energyTotal > 0 && (
                    <>
                      <p style={{ color: isValid ? C.success : C.textMuted, fontSize: 12, margin: 0, textAlign: 'center' }}>
                        エナから選択: {selectedHandActivatedCost.size} / {energyTotal}枚
                        {energyCosts.map((c, i) => (
                          <span key={i} style={{ marginLeft: 6, color: C.textDim }}>({c.color}×{c.count})</span>
                        ))}
                      </p>
                      <div style={{ overflowY: 'auto', display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center' }}>
                        {my.energy.map((num, i) => {
                          const card = battleCardMap.get(num);
                          const isSel = selectedHandActivatedCost.has(i);
                          const isWild = isMultiEna(num, battleCards, my.keyword_grants, myEnaAllMulti);
                          return (
                            <div key={i}
                              onClick={() => {
                                setSelectedHandActivatedCost(prev => {
                                  const next = new Set(prev);
                                  if (next.has(i)) next.delete(i); else next.add(i);
                                  return next;
                                });
                              }}
                              onPointerDown={() => { pickLongPressTimer.current = setTimeout(() => { setExpandedPickImgUrl(card?.ImgURL ?? null); }, 500); }}
                              onPointerUp={() => { if (pickLongPressTimer.current) { clearTimeout(pickLongPressTimer.current); pickLongPressTimer.current = null; } }}
                              onPointerLeave={() => { if (pickLongPressTimer.current) { clearTimeout(pickLongPressTimer.current); pickLongPressTimer.current = null; } }}
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
                              {isWild && !isSel && (
                                <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0,
                                  backgroundColor: 'rgba(255,204,0,0.85)', textAlign: 'center' }}>
                                  <span style={{ fontSize: 7, fontWeight: 'bold', color: '#000' }}>マルチ</span>
                                </div>
                              )}
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
                  <button
                    onClick={() => executeHandActivated(pendingHandActivated.cardNum, pendingHandActivated.handIndex, haEffect, selectedHandActivatedCost)}
                    disabled={loading || !isValid}
                    style={{ padding: '11px 0', borderRadius: 8, border: 'none',
                      backgroundColor: isValid ? '#ff6b35' : C.disabled,
                      color: C.text, fontSize: 14, fontWeight: 'bold',
                      cursor: (loading || !isValid) ? 'default' : 'pointer' }}>
                    発動する（このカードを捨てる）
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
