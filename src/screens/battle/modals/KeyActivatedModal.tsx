// キーピース 起動効果モーダル（【起】コスト＝エナ＋手札捨て支払い）。BattleScreen.tsx から Stage 1 で抽出。
import { createPortal } from 'react-dom';
import { useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { CardEffect } from '../../../types/effects';
import { C } from '../../../components/BoardComponents';
import { canAffordGrowCost, isMultiEna } from '../costs';
import { energyPayEntryLabel } from '../energyPaySource';
import { matchesTrashArtsFromLrigDeckCost } from '../artsTrashCost';
import { getCardNum } from '../../../engine/execUtils';
import type { BattleModalCtx } from './types';

interface KeyActivatedModalProps {
  ctx: BattleModalCtx;
  pendingKeyActivated: { cardNum: string; effect: CardEffect } | null;
  setPendingKeyActivated: Dispatch<SetStateAction<{ cardNum: string; effect: CardEffect } | null>>;
  selectedKeyActivatedCost: Set<number>;
  setSelectedKeyActivatedCost: Dispatch<SetStateAction<Set<number>>>;
  selectedKeyActivatedDiscard: Set<number>;
  setSelectedKeyActivatedDiscard: Dispatch<SetStateAction<Set<number>>>;
  executeKeyActivated: (cardNum: string, effect: CardEffect, costIndices: Set<number>, discardIndices?: Set<number>, artsNums?: string[]) => void;
}

export function KeyActivatedModal(p: KeyActivatedModalProps) {
  const { my, loading, battleCards, battleCardMap, myEnaAllMulti, myEnaMultiStripped, myColorlessOverrides, myColorSubs, pickLongPressTimer, setExpandedPickImgUrl , myEnergyPayPool } = p.ctx;
  const { pendingKeyActivated, setPendingKeyActivated, selectedKeyActivatedCost, setSelectedKeyActivatedCost, selectedKeyActivatedDiscard, setSelectedKeyActivatedDiscard, executeKeyActivated } = p;
  // 🆕§5.3 `O-68`②（2026-09-02）＝「ルリグデッキからクラフトではないアーツN枚をルリグトラッシュに置く」の選択。
  //   ⚠選択 state はここに閉じる（他のキー【起】コストと違って BattleScreen 側で使わないため）。
  //   開き直しで前回の選択が残らないよう**閉じる3経路すべて**でリセットする
  //   （effect 内の setState はカスケード再描画になるので使わない＝`react-hooks/set-state-in-effect`）。
  const [selectedKeyArts, setSelectedKeyArts] = useState<string[]>([]);
  return (
    <>
      {pendingKeyActivated && createPortal(
        <div onClick={() => { setPendingKeyActivated(null); setSelectedKeyActivatedCost(new Set()); setSelectedKeyActivatedDiscard(new Set()); setSelectedKeyArts([]); }}
          style={{ position: 'fixed', inset: 0, zIndex: 4000, backgroundColor: 'rgba(0,0,0,0.92)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div onClick={e => e.stopPropagation()}
            style={{ backgroundColor: C.bgModal, border: C.borderUI, borderRadius: 12,
              padding: '20px 16px', width: 'min(95vw, 400px)', maxHeight: '85vh',
              display: 'flex', flexDirection: 'column', gap: 12 }}>
            {(() => {
              const card = battleCardMap.get(pendingKeyActivated.cardNum);
              const eff = pendingKeyActivated.effect;
              const energyTotal = (eff.cost?.energy ?? []).reduce((s, c) => s + c.count, 0);
              const discardNeeded = eff.cost?.discard ?? 0;
              const costStr = (eff.cost?.energy ?? []).map(e => `《${e.color}》×${e.count}`).join('') || '';
              const selectedNums = [...selectedKeyActivatedCost].map(i => myEnergyPayPool[i].cardNum);
              const energyOk = energyTotal === 0 || (selectedKeyActivatedCost.size === energyTotal && canAffordGrowCost(selectedNums, battleCards, costStr, my.keyword_grants, myEnaAllMulti, myEnaMultiStripped, myColorlessOverrides, myColorSubs));
              // 🆕§5.3 `O-68`②＝ルリグデッキのアーツ徴収。候補は `matchesTrashArtsFromLrigDeckCost` 1本
              //   （engine の支払い可否と同じ関数＝UI と engine で候補がズレない）。
              const artsCost = eff.cost?.trashArtsFromLrigDeck;
              const artsCands = artsCost
                ? my.lrig_deck.filter(num => matchesTrashArtsFromLrigDeckCost(battleCardMap.get(getCardNum(num)), artsCost))
                : [];
              const artsNeeded = artsCost?.count ?? 0;
              const canAfford = energyOk && selectedKeyActivatedDiscard.size >= discardNeeded
                && selectedKeyArts.length === artsNeeded;
              return (
                <>
                  <p style={{ color: C.textSub, fontSize: 14, fontWeight: 'bold', margin: 0, textAlign: 'center' }}>キー【起】効果を発動</p>
                  {card && (
                    <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                      <img src={card.ImgURL} alt={card.CardName} style={{ width: 52, height: 72, objectFit: 'cover', borderRadius: 4, flexShrink: 0 }} />
                      <div>
                        <p style={{ color: C.text, fontSize: 13, fontWeight: 'bold', margin: '0 0 4px' }}>{card.CardName}</p>
                        {/* 🆕全捨てコストは**選択不要**なので枚数を明示する（§5.3 `O-46`＝`WXK04-025-CB-E2`）。
                            ⚠表示だけ足して支払いを書かないと踏み倒しになる＝支払いは `executeKeyActivated`。 */}
                        <p style={{ color: C.textFaint, fontSize: 11, margin: 0 }}>コスト: {[
                          eff.cost?.trash_key ? 'このキーをルリグトラッシュ' : null,
                          energyTotal > 0 ? `エナ${energyTotal}枚` : null,
                          discardNeeded > 0 ? `手札${discardNeeded}枚` : null,
                          eff.cost?.energyTrashAll ? `エナをすべてトラッシュ（${my.energy.length}枚）` : null,
                          eff.cost?.discardAll ? `手札をすべて捨てる（${my.hand.length}枚）` : null,
                          artsCost ? `ルリグデッキからアーツ${artsCost.count}枚をルリグトラッシュ` : null,
                        ].filter(Boolean).join('・') || 'なし'}</p>
                      </div>
                    </div>
                  )}
                  {energyTotal > 0 && (
                    <>
                      <p style={{ color: C.text, fontSize: 12, margin: 0 }}>エナゾーンから選択: {selectedKeyActivatedCost.size} / {energyTotal}枚</p>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, overflowY: 'auto', maxHeight: 180 }}>
                        {myEnergyPayPool.map((payEntry, i) => {
                          const num = payEntry.cardNum;
                          const c = battleCardMap.get(num);
                          const isSel = selectedKeyActivatedCost.has(i);
                          const isWild = isMultiEna(num, battleCards, my.keyword_grants, myEnaAllMulti, myEnaMultiStripped);
                          return (
                            <div key={i} title={energyPayEntryLabel(payEntry, battleCardMap) ?? undefined} onClick={() => setSelectedKeyActivatedCost(prev => { const next = new Set(prev); if (next.has(i)) { next.delete(i); return next; } if (next.size >= energyTotal) return prev; next.add(i); return next; })}
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
                  {discardNeeded > 0 && (
                    <>
                      <p style={{ color: C.text, fontSize: 12, margin: 0 }}>
                        手札から捨てるカードを選択: {selectedKeyActivatedDiscard.size} / {discardNeeded}枚
                      </p>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, overflowY: 'auto', maxHeight: 180 }}>
                        {my.hand.map((num, i) => {
                          const c = battleCardMap.get(num);
                          const isSel = selectedKeyActivatedDiscard.has(i);
                          return (
                            <div key={i}
                              onClick={() => setSelectedKeyActivatedDiscard(prev => {
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
                                border: isSel ? '2px solid #ff9800' : C.borderCard, cursor: 'pointer', overflow: 'hidden' }}>
                              {c ? <img src={c.ImgURL} alt={c.CardName} draggable={false} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                 : <div style={{ width: '100%', height: '100%', backgroundColor: C.bgButton, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><span style={{ fontSize: 7, color: C.textFaint }}>{num}</span></div>}
                              {isSel && <div style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(255,152,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><span style={{ color: '#fff', fontSize: 18, fontWeight: 'bold' }}>✓</span></div>}
                            </div>
                          );
                        })}
                      </div>
                    </>
                  )}
                  {artsNeeded > 0 && (
                    <>
                      <p style={{ color: C.text, fontSize: 12, margin: 0 }}>
                        ルリグデッキからアーツを選択: {selectedKeyArts.length} / {artsNeeded}枚
                      </p>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, overflowY: 'auto', maxHeight: 180 }}>
                        {artsCands.map(num => {
                          const c = battleCardMap.get(getCardNum(num));
                          const isSel = selectedKeyArts.includes(num);
                          return (
                            <div key={num}
                              onClick={() => setSelectedKeyArts(prev => prev.includes(num)
                                ? prev.filter(n => n !== num)
                                : (prev.length >= artsNeeded ? prev : [...prev, num]))}
                              onPointerDown={() => { pickLongPressTimer.current = setTimeout(() => { setExpandedPickImgUrl(c?.ImgURL ?? null); }, 500); }}
                              onPointerUp={() => { if (pickLongPressTimer.current) { clearTimeout(pickLongPressTimer.current); pickLongPressTimer.current = null; } }}
                              onPointerLeave={() => { if (pickLongPressTimer.current) { clearTimeout(pickLongPressTimer.current); pickLongPressTimer.current = null; } }}
                              onContextMenu={e => e.preventDefault()}
                              style={{ position: 'relative', width: 44, height: 62, borderRadius: 3, flexShrink: 0,
                                border: isSel ? '2px solid #9c27b0' : C.borderCard, cursor: 'pointer', overflow: 'hidden' }}>
                              {c ? <img src={c.ImgURL} alt={c.CardName} draggable={false} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                 : <div style={{ width: '100%', height: '100%', backgroundColor: C.bgButton, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><span style={{ fontSize: 7, color: C.textFaint }}>{num}</span></div>}
                              {isSel && <div style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(156,39,176,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><span style={{ color: '#fff', fontSize: 18, fontWeight: 'bold' }}>✓</span></div>}
                            </div>
                          );
                        })}
                      </div>
                    </>
                  )}
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => { setPendingKeyActivated(null); setSelectedKeyActivatedCost(new Set()); setSelectedKeyActivatedDiscard(new Set()); setSelectedKeyArts([]); }} disabled={loading}
                      style={{ flex: 1, padding: '10px 0', borderRadius: 8, border: C.borderUI, backgroundColor: 'transparent', color: C.textSub, fontSize: 13, cursor: 'pointer' }}>
                      キャンセル
                    </button>
                    <button onClick={() => { executeKeyActivated(pendingKeyActivated.cardNum, eff, selectedKeyActivatedCost, selectedKeyActivatedDiscard, selectedKeyArts); setSelectedKeyArts([]); }} disabled={loading || !canAfford}
                      style={{ flex: 2, padding: '10px 0', borderRadius: 8, border: 'none',
                        backgroundColor: (loading || !canAfford) ? C.disabled : C.success,
                        color: C.text, fontSize: 14, fontWeight: 'bold', cursor: (loading || !canAfford) ? 'default' : 'pointer' }}>
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
