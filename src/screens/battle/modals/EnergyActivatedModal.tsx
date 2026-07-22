// エナゾーンACTIVATED（アクセカード）モーダル（ACCE_COST_REDUCTION 軽減つきコスト支払い）。BattleScreen.tsx から Stage 1 で抽出。
import { createPortal } from 'react-dom';
import type { Dispatch, SetStateAction } from 'react';
import type { CardEffect } from '../../../types/effects';
import { collectAcceCostReduction } from '../../../engine/effectEngine';
import { C } from '../../../components/BoardComponents';
import { canAffordGrowCost, isMultiEna } from '../costs';
import type { BattleModalCtx } from './types';

interface EnergyActivatedModalProps {
  ctx: BattleModalCtx;
  pendingEnergyActivated: { cardNum: string; effect: CardEffect } | null;
  setPendingEnergyActivated: Dispatch<SetStateAction<{ cardNum: string; effect: CardEffect } | null>>;
  selectedEnergyActivatedCost: Set<number>;
  setSelectedEnergyActivatedCost: Dispatch<SetStateAction<Set<number>>>;
  executeEnergyActivated: (cardNum: string, effect: CardEffect, costIndices: Set<number>) => void;
}

export function EnergyActivatedModal(p: EnergyActivatedModalProps) {
  const { my, loading, battleCards, battleCardMap, effectsMap, myEnaAllMulti, myEnaMultiStripped, myColorlessOverrides, myColorSubs } = p.ctx;
  const { pendingEnergyActivated, setPendingEnergyActivated, selectedEnergyActivatedCost, setSelectedEnergyActivatedCost, executeEnergyActivated } = p;
  return (
    <>
      {pendingEnergyActivated && createPortal(
        <div
          onClick={() => { setPendingEnergyActivated(null); setSelectedEnergyActivatedCost(new Set()); }}
          style={{ position: 'fixed', inset: 0, zIndex: 4000,
            backgroundColor: 'rgba(0,0,0,0.92)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div
            onClick={e => e.stopPropagation()}
            style={{ backgroundColor: C.bgModal, border: C.borderUI, borderRadius: 12,
              padding: '20px 16px', width: 'min(95vw, 400px)', maxHeight: '85vh',
              display: 'flex', flexDirection: 'column', gap: 12 }}>
            {(() => {
              const card = battleCardMap.get(pendingEnergyActivated.cardNum);
              const eff = pendingEnergyActivated.effect;
              // ACCE_COST_REDUCTION: WX16-044等が場にある場合、緑コストを1軽減
              const acceGreenReduction = collectAcceCostReduction(my, effectsMap);
              const baseCostItems = eff.cost?.energy ?? [];
              const reducedCostItems = acceGreenReduction > 0
                ? (() => {
                    let rem = acceGreenReduction;
                    return baseCostItems.map(c => {
                      if (rem > 0 && c.color === '緑' && c.count > 0) {
                        const reduce = Math.min(rem, c.count);
                        rem -= reduce;
                        return { ...c, count: c.count - reduce };
                      }
                      return c;
                    }).filter(c => c.count > 0);
                  })()
                : baseCostItems;
              const energyTotal = reducedCostItems.reduce((s, c) => s + c.count, 0);
              const costStr = reducedCostItems.map(e => `${e.color}${e.count}`).join('') || '';
              const selectedNums = [...selectedEnergyActivatedCost].map(i => my.energy[i]);
              const canAfford = energyTotal === 0
                ? true
                : selectedEnergyActivatedCost.size === energyTotal &&
                  canAffordGrowCost(selectedNums, battleCards, costStr, my.keyword_grants, myEnaAllMulti, myEnaMultiStripped, myColorlessOverrides, myColorSubs);
              return (
                <>
                  <p style={{ color: C.textSub, fontSize: 14, fontWeight: 'bold', margin: 0, textAlign: 'center' }}>
                    【アクセ】発動
                  </p>
                  {card && (
                    <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                      <img src={card.ImgURL} alt={card.CardName}
                        style={{ width: 52, height: 72, objectFit: 'cover', borderRadius: 4, flexShrink: 0 }} />
                      <div>
                        <p style={{ color: C.text, fontSize: 13, fontWeight: 'bold', margin: '0 0 4px' }}>{card.CardName}</p>
                        <p style={{ color: C.textFaint, fontSize: 11, margin: 0 }}>
                          このカードをエナゾーンからシグニのアクセにする
                        </p>
                        <p style={{ color: C.textFaint, fontSize: 11, margin: '2px 0 0' }}>
                          コスト: {energyTotal > 0 ? reducedCostItems.map(e => `《${e.color}》×${e.count}`).join('') : 'なし'}
                          {acceGreenReduction > 0 && (
                            <span style={{ color: C.success, marginLeft: 4 }}>(《緑》×{acceGreenReduction}軽減)</span>
                          )}
                        </p>
                      </div>
                    </div>
                  )}
                  {energyTotal > 0 && (
                    <>
                      <p style={{ color: C.text, fontSize: 12, margin: 0 }}>
                        エナゾーンから選択: {selectedEnergyActivatedCost.size} / {energyTotal}枚
                      </p>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, overflowY: 'auto', maxHeight: 180 }}>
                        {my.energy.map((num, i) => {
                          const c2 = battleCardMap.get(num);
                          // アクセカード自身は選択対象から除外
                          if (num === pendingEnergyActivated.cardNum) return null;
                          const isSel = selectedEnergyActivatedCost.has(i);
                          const isWild = isMultiEna(num, battleCards, my.keyword_grants, myEnaAllMulti, myEnaMultiStripped);
                          return (
                            <div key={i}
                              onClick={() => setSelectedEnergyActivatedCost(prev => {
                                const next = new Set(prev);
                                if (next.has(i)) { next.delete(i); return next; }
                                if (next.size >= energyTotal) return prev;
                                next.add(i); return next;
                              })}
                              style={{ position: 'relative', width: 44, height: 62, borderRadius: 3, flexShrink: 0,
                                border: isSel ? '2px solid #f44336' : isWild ? '1px solid #ffcc00' : C.borderCard,
                                cursor: 'pointer', overflow: 'hidden' }}>
                              {c2 ? (
                                <img src={c2.ImgURL} alt={c2.CardName} draggable={false}
                                  style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                              ) : (
                                <div style={{ width: '100%', height: '100%', backgroundColor: C.bgButton,
                                  display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                  <span style={{ fontSize: 7, color: C.textFaint }}>{num}</span>
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
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      onClick={() => { setPendingEnergyActivated(null); setSelectedEnergyActivatedCost(new Set()); }}
                      disabled={loading}
                      style={{ flex: 1, padding: '10px 0', borderRadius: 8, border: C.borderUI,
                        backgroundColor: 'transparent', color: C.textSub, fontSize: 13, cursor: 'pointer' }}>
                      キャンセル
                    </button>
                    <button
                      onClick={() => executeEnergyActivated(pendingEnergyActivated.cardNum, eff, selectedEnergyActivatedCost)}
                      disabled={loading || !canAfford}
                      style={{ flex: 2, padding: '10px 0', borderRadius: 8, border: 'none',
                        backgroundColor: (loading || !canAfford) ? C.disabled : '#4caf50',
                        color: C.text, fontSize: 14, fontWeight: 'bold',
                        cursor: (loading || !canAfford) ? 'default' : 'pointer' }}>
                      アクセ発動
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
