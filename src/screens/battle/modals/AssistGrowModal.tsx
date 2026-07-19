// アシストルリグ グロウモーダル（フェーズ1: カード選択 → フェーズ2: エナコスト選択）。BattleScreen.tsx から Stage 1 で抽出。
import { createPortal } from 'react-dom';
import type { Dispatch, SetStateAction } from 'react';
import type { CardData } from '../../../types';
import { collectGrowCostReductions } from '../../../engine/effectEngine';
import { C } from '../../../components/BoardComponents';
import { applyGrowCostReduction, canAffordGrowCost, parseGrowCost, isMultiEna } from '../costs';
import type { BattleModalCtx } from './types';

interface AssistGrowModalProps {
  ctx: BattleModalCtx;
  showAssistGrowModal: boolean;
  setShowAssistGrowModal: Dispatch<SetStateAction<boolean>>;
  pendingAssistGrowCard: CardData | null;
  setPendingAssistGrowCard: Dispatch<SetStateAction<CardData | null>>;
  pendingAssistSide: 'l' | 'r' | null;
  setPendingAssistSide: Dispatch<SetStateAction<'l' | 'r' | null>>;
  selectedAssistGrowCost: Set<number>;
  setSelectedAssistGrowCost: Dispatch<SetStateAction<Set<number>>>;
  getAssistGrowCandidates: (side: 'l' | 'r') => CardData[];
  executeAssistGrow: (card: CardData, side: 'l' | 'r', costIndices: Set<number>) => void;
}

export function AssistGrowModal(p: AssistGrowModalProps) {
  const { my, op, isMyTurn, loading, battleCards, battleCardMap, effectsMap, myEnaAllMulti, myColorlessOverrides, myColorSubs, myEnergyTrashSubInfo, pickLongPressTimer, setExpandedPickImgUrl } = p.ctx;
  const { showAssistGrowModal, setShowAssistGrowModal, pendingAssistGrowCard, setPendingAssistGrowCard, pendingAssistSide, setPendingAssistSide, selectedAssistGrowCost, setSelectedAssistGrowCost, getAssistGrowCandidates, executeAssistGrow } = p;
  return (
    <>
      {showAssistGrowModal && pendingAssistSide && createPortal(
        <div onClick={() => { setShowAssistGrowModal(false); setPendingAssistGrowCard(null); setPendingAssistSide(null); setSelectedAssistGrowCost(new Set()); }}
          style={{ position: 'fixed', inset: 0, zIndex: 4000, backgroundColor: 'rgba(0,0,0,0.92)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div onClick={e => e.stopPropagation()}
            style={{ backgroundColor: C.bgModal, border: C.borderUI, borderRadius: 12,
              padding: '20px 16px', width: 'min(95vw, 400px)', maxHeight: '85vh',
              display: 'flex', flexDirection: 'column', gap: 12 }}>

            {!pendingAssistGrowCard ? (
              /* フェーズ1: アシストルリグ選択 */
              <>
                <p style={{ color: C.textSub, fontSize: 15, fontWeight: 'bold', margin: 0, textAlign: 'center' }}>
                  アシストグロウ（{pendingAssistSide === 'l' ? '左' : '右'}）― カードを選択
                </p>
                <div style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {getAssistGrowCandidates(pendingAssistSide).map(card => {
                    const growCostRA = applyGrowCostReduction(card.GrowCost, collectGrowCostReductions(my, op, isMyTurn, effectsMap, battleCardMap));
                    const canAfford = canAffordGrowCost(my.energy, battleCards, growCostRA, my.keyword_grants, myEnaAllMulti, myColorlessOverrides, myColorSubs);
                    const energyTotal = parseGrowCost(growCostRA).reduce((s, c) => s + c.count, 0);
                    return (
                      <button key={card.CardNum}
                        onClick={() => {
                          if (!canAfford) return;
                          if (energyTotal === 0) { executeAssistGrow(card, pendingAssistSide, new Set()); }
                          else { setPendingAssistGrowCard(card); setSelectedAssistGrowCost(new Set()); }
                        }}
                        disabled={loading || !canAfford}
                        style={{ display: 'flex', alignItems: 'center', gap: 10,
                          padding: '8px 12px', borderRadius: 8, border: C.borderUI,
                          backgroundColor: canAfford ? C.bgButton : C.bgButtonDark,
                          cursor: (loading || !canAfford) ? 'default' : 'pointer',
                          opacity: canAfford ? 1 : 0.5, textAlign: 'left' }}>
                        <img src={card.ImgURL} alt={card.CardName}
                          style={{ width: 44, height: 62, objectFit: 'cover', borderRadius: 4, flexShrink: 0 }}
                          onError={e => { const img = e.target as HTMLImageElement; if (!img.src.endsWith('/ErrerCard.webp')) img.src = '/ErrerCard.webp'; }} />
                        <div>
                          <p style={{ color: C.text, fontSize: 13, fontWeight: 'bold', margin: '0 0 2px' }}>{card.CardName}</p>
                          <p style={{ color: C.textDim, fontSize: 11, margin: '0 0 2px' }}>Lv.{card.Level} / グロウコスト: {card.GrowCost || 'なし'}</p>
                          <p style={{ color: C.textFaint, fontSize: 10, margin: 0 }}>{card.CardClass} / {card.Timing}</p>
                        </div>
                      </button>
                    );
                  })}
                </div>
                <button onClick={() => { setShowAssistGrowModal(false); setPendingAssistSide(null); }} disabled={loading}
                  style={{ padding: '10px 0', borderRadius: 8, border: C.borderUI, backgroundColor: 'transparent', color: C.textSub, fontSize: 13, cursor: 'pointer' }}>
                  キャンセル
                </button>
              </>
            ) : (
              /* フェーズ2: エナコスト選択 */
              (() => {
                const card = pendingAssistGrowCard;
                const side = pendingAssistSide;
                // GROW_COST_REDUCTION 軽減後コストで支払い必要枚数を算出（フェーズ1候補と一致させる。減額しないと全額要求のままになる）
                const growCost = applyGrowCostReduction(card.GrowCost, collectGrowCostReductions(my, op, isMyTurn, effectsMap, battleCardMap));
                const energyTotal = parseGrowCost(growCost).reduce((s, c) => s + c.count, 0);
                const selectedNums = [...selectedAssistGrowCost].map(i => my.energy[i]);
                const canAfford = energyTotal === 0
                  ? true
                  : selectedAssistGrowCost.size === energyTotal && canAffordGrowCost(selectedNums, battleCards, growCost, my.keyword_grants, myEnaAllMulti, myColorlessOverrides, myColorSubs);
                return (
                  <>
                    <p style={{ color: C.textSub, fontSize: 14, fontWeight: 'bold', margin: 0, textAlign: 'center' }}>
                      アシストグロウ（{side === 'l' ? '左' : '右'}）
                    </p>
                    <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                      <img src={card.ImgURL} alt={card.CardName} style={{ width: 52, height: 72, objectFit: 'cover', borderRadius: 4, flexShrink: 0 }} />
                      <div>
                        <p style={{ color: C.text, fontSize: 13, fontWeight: 'bold', margin: '0 0 4px' }}>{card.CardName}</p>
                        <p style={{ color: C.textFaint, fontSize: 11, margin: 0 }}>Lv.{card.Level} / グロウコスト: {growCost || 'なし'}</p>
                      </div>
                    </div>
                    {energyTotal > 0 && (
                      <>
                        <p style={{ color: C.text, fontSize: 12, margin: 0 }}>エナゾーンから選択: {selectedAssistGrowCost.size} / {energyTotal}枚</p>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, overflowY: 'auto', maxHeight: 180 }}>
                          {my.energy.map((num, i) => {
                            const c = battleCardMap.get(num);
                            const isSel = selectedAssistGrowCost.has(i);
                            const isWild = isMultiEna(num, battleCards, my.keyword_grants, myEnaAllMulti);
                            return (
                              <div key={i} onClick={() => setSelectedAssistGrowCost(prev => { const next = new Set(prev); if (next.has(i)) { next.delete(i); return next; } if (next.size >= energyTotal) return prev; next.add(i); return next; })}
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
                      <button onClick={() => { setPendingAssistGrowCard(null); setSelectedAssistGrowCost(new Set()); }} disabled={loading}
                        style={{ flex: 1, padding: '10px 0', borderRadius: 8, border: C.borderUI, backgroundColor: 'transparent', color: C.textSub, fontSize: 13, cursor: 'pointer' }}>
                        戻る
                      </button>
                      <button onClick={() => executeAssistGrow(card, side, selectedAssistGrowCost)} disabled={loading || !canAfford}
                        style={{ flex: 2, padding: '10px 0', borderRadius: 8, border: 'none',
                          backgroundColor: (loading || !canAfford) ? C.disabled : '#6644aa',
                          color: C.text, fontSize: 14, fontWeight: 'bold', cursor: (loading || !canAfford) ? 'default' : 'pointer' }}>
                        グロウ
                      </button>
                    </div>
                  </>
                );
              })()
            )}
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
