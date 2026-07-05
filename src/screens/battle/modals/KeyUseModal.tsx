// キーピース 使用モーダル（キーにセット・コイン＋エナコスト支払い）。BattleScreen.tsx から Stage 1 で抽出。
import { createPortal } from 'react-dom';
import type { Dispatch, SetStateAction } from 'react';
import type { CardData } from '../../../types';
import { C } from '../../../components/BoardComponents';
import { parseCoinCost, parseGrowCost, canAffordGrowCost, isMultiEna } from '../costs';
import type { BattleModalCtx } from './types';

interface KeyUseModalProps {
  ctx: BattleModalCtx;
  showKeyModal: boolean;
  setShowKeyModal: Dispatch<SetStateAction<boolean>>;
  pendingKeyCard: CardData | null;
  setPendingKeyCard: Dispatch<SetStateAction<CardData | null>>;
  selectedKeyCost: Set<number>;
  setSelectedKeyCost: Dispatch<SetStateAction<Set<number>>>;
  executeKeyPiece: (card: CardData, costIndices: Set<number>) => void;
}

export function KeyUseModal(p: KeyUseModalProps) {
  const { my, loading, battleCards, battleCardMap, myEnaAllMulti, myColorlessOverrides, myColorSubs, pickLongPressTimer, setExpandedPickImgUrl } = p.ctx;
  const { showKeyModal, setShowKeyModal, pendingKeyCard, setPendingKeyCard, selectedKeyCost, setSelectedKeyCost, executeKeyPiece } = p;
  return (
    <>
      {showKeyModal && pendingKeyCard && createPortal(
        <div onClick={() => { setShowKeyModal(false); setPendingKeyCard(null); setSelectedKeyCost(new Set()); }}
          style={{ position: 'fixed', inset: 0, zIndex: 4000, backgroundColor: 'rgba(0,0,0,0.92)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div onClick={e => e.stopPropagation()}
            style={{ backgroundColor: C.bgModal, border: C.borderUI, borderRadius: 12,
              padding: '20px 16px', width: 'min(95vw, 400px)', maxHeight: '85vh',
              display: 'flex', flexDirection: 'column', gap: 12 }}>
            {(() => {
              const card = pendingKeyCard;
              const coinNeeded = parseCoinCost(card.Cost) + parseCoinCost(card.GrowCost);
              const energyTotal = parseGrowCost(card.Cost).reduce((s, c) => s + c.count, 0);
              const selectedNums = [...selectedKeyCost].map(i => my.energy[i]);
              const energyOk = energyTotal === 0 || (selectedKeyCost.size === energyTotal && canAffordGrowCost(selectedNums, battleCards, card.Cost, my.keyword_grants, myEnaAllMulti, myColorlessOverrides, myColorSubs));
              const canAfford = energyOk && my.coins >= coinNeeded;
              return (
                <>
                  <p style={{ color: C.textSub, fontSize: 14, fontWeight: 'bold', margin: 0, textAlign: 'center' }}>
                    キーにセット
                  </p>
                  <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                    <img src={card.ImgURL} alt={card.CardName}
                      style={{ width: 52, height: 72, objectFit: 'cover', borderRadius: 4, flexShrink: 0 }} />
                    <div>
                      <p style={{ color: C.text, fontSize: 13, fontWeight: 'bold', margin: '0 0 4px' }}>{card.CardName}</p>
                      <p style={{ color: C.textFaint, fontSize: 11, margin: 0 }}>
                        コスト: {[coinNeeded > 0 ? `コイン${coinNeeded}個` : null, energyTotal > 0 ? `エナ${energyTotal}枚` : null].filter(Boolean).join('・') || 'なし'}
                      </p>
                      {coinNeeded > 0 && <p style={{ color: my.coins >= coinNeeded ? C.coin : C.danger, fontSize: 11, margin: '2px 0 0' }}>手持ちコイン: {my.coins}</p>}
                    </div>
                  </div>
                  {energyTotal > 0 && (
                    <>
                      <p style={{ color: C.text, fontSize: 12, margin: 0 }}>エナゾーンから選択: {selectedKeyCost.size} / {energyTotal}枚</p>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, overflowY: 'auto', maxHeight: 180 }}>
                        {my.energy.map((num, i) => {
                          const c = battleCardMap.get(num);
                          const isSel = selectedKeyCost.has(i);
                          const isWild = isMultiEna(num, battleCards, my.keyword_grants, myEnaAllMulti);
                          return (
                            <div key={i} onClick={() => setSelectedKeyCost(prev => { const next = new Set(prev); if (next.has(i)) { next.delete(i); return next; } if (next.size >= energyTotal) return prev; next.add(i); return next; })}
                              onPointerDown={() => { pickLongPressTimer.current = setTimeout(() => { setExpandedPickImgUrl(c?.ImgURL ?? null); }, 500); }}
                              onPointerUp={() => { if (pickLongPressTimer.current) { clearTimeout(pickLongPressTimer.current); pickLongPressTimer.current = null; } }}
                              onPointerLeave={() => { if (pickLongPressTimer.current) { clearTimeout(pickLongPressTimer.current); pickLongPressTimer.current = null; } }}
                              onContextMenu={e => e.preventDefault()}
                              style={{ position: 'relative', width: 44, height: 62, borderRadius: 3, flexShrink: 0,
                                border: isSel ? '2px solid #f44336' : isWild ? '1px solid #ffcc00' : C.borderCard, cursor: 'pointer', overflow: 'hidden' }}>
                              {c ? <img src={c.ImgURL} alt={c.CardName} draggable={false} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                 : <div style={{ width: '100%', height: '100%', backgroundColor: C.bgButton, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><span style={{ fontSize: 7, color: C.textFaint }}>{num}</span></div>}
                              {isWild && !isSel && <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(255,204,0,0.85)', textAlign: 'center' }}><span style={{ fontSize: 7, fontWeight: 'bold', color: '#000' }}>マルチ</span></div>}
                              {isSel && <div style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(244,67,54,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><span style={{ color: '#fff', fontSize: 18, fontWeight: 'bold' }}>✓</span></div>}
                            </div>
                          );
                        })}
                      </div>
                    </>
                  )}
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => { setShowKeyModal(false); setPendingKeyCard(null); setSelectedKeyCost(new Set()); }} disabled={loading}
                      style={{ flex: 1, padding: '10px 0', borderRadius: 8, border: C.borderUI, backgroundColor: 'transparent', color: C.textSub, fontSize: 13, cursor: 'pointer' }}>
                      キャンセル
                    </button>
                    <button onClick={() => executeKeyPiece(card, selectedKeyCost)} disabled={loading || !canAfford}
                      style={{ flex: 2, padding: '10px 0', borderRadius: 8, border: 'none',
                        backgroundColor: (loading || !canAfford) ? C.disabled : '#cc8800',
                        color: C.text, fontSize: 14, fontWeight: 'bold', cursor: (loading || !canAfford) ? 'default' : 'pointer' }}>
                      セット
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
