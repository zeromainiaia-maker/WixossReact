// ルリグ付与能力（GRANT_LRIG_ABILITY）発動モーダル（エナ/エクシード/手札捨て/チャーム等のコスト支払い）。BattleScreen.tsx から Stage 1 で抽出。
import { createPortal } from 'react-dom';
import type { Dispatch, SetStateAction } from 'react';
import type { CardEffect } from '../../../types/effects';
import { canSatisfyDiscardGroups } from '../../../engine/execUtils';
import { matchesFilter } from '../../../engine/effectExecutor';
import { C } from '../../../components/BoardComponents';
import { fmtDiscardFilterLabel, fmtHandDiscardSigniLabel, canAffordGrowCost } from '../costs';
import type { BattleModalCtx } from './types';

interface LrigGrantedModalProps {
  ctx: BattleModalCtx;
  pendingLrigGranted: { sourceCardNum: string; effect: CardEffect } | null;
  setPendingLrigGranted: Dispatch<SetStateAction<{ sourceCardNum: string; effect: CardEffect } | null>>;
  selectedLrigGrantedCost: Set<number>;
  setSelectedLrigGrantedCost: Dispatch<SetStateAction<Set<number>>>;
  selectedLrigGrantedHandDiscard: Set<number>;
  setSelectedLrigGrantedHandDiscard: Dispatch<SetStateAction<Set<number>>>;
  selectedLrigGrantedEnergyTrash: Set<number>;
  setSelectedLrigGrantedEnergyTrash: Dispatch<SetStateAction<Set<number>>>;
  selectedLrigGrantedTrashExile: Set<number>;
  setSelectedLrigGrantedTrashExile: Dispatch<SetStateAction<Set<number>>>;
  executeLrigGranted: (effect: CardEffect, costIndices: Set<number>, handDiscardIndices?: Set<number>, energyTrashIndices?: Set<number>, trashExileIndices?: Set<number>) => void;
}

export function LrigGrantedModal(p: LrigGrantedModalProps) {
  const { my, op, loading, battleCards, battleCardMap, myEnaAllMulti, myEnaMultiStripped, myColorlessOverrides, myColorSubs, pickLongPressTimer, setExpandedPickImgUrl } = p.ctx;
  const { pendingLrigGranted, setPendingLrigGranted, selectedLrigGrantedCost, setSelectedLrigGrantedCost, selectedLrigGrantedHandDiscard, setSelectedLrigGrantedHandDiscard, selectedLrigGrantedEnergyTrash, setSelectedLrigGrantedEnergyTrash, selectedLrigGrantedTrashExile, setSelectedLrigGrantedTrashExile, executeLrigGranted } = p;
  return (
    <>
      {pendingLrigGranted && createPortal(
        <div
          onClick={() => { setPendingLrigGranted(null); setSelectedLrigGrantedCost(new Set()); setSelectedLrigGrantedHandDiscard(new Set()); }}
          style={{ position: 'fixed', inset: 0, zIndex: 4000,
            backgroundColor: 'rgba(0,0,0,0.92)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div
            onClick={e => e.stopPropagation()}
            style={{ backgroundColor: C.bgModal, border: C.borderUI, borderRadius: 12,
              padding: '20px 16px', width: 'min(95vw, 400px)', maxHeight: '85vh',
              display: 'flex', flexDirection: 'column', gap: 12 }}>
            {(() => {
              const eff = pendingLrigGranted.effect;
              const energyTotal = (eff.cost?.energy ?? []).reduce((s, c) => s + c.count, 0);
              const exceedCost = eff.cost?.exceed ?? 0;
              const hdSigniCost = eff.cost?.handDiscardSigni;
              const lgGroups = eff.cost?.discardGroups;
              const lgDiscardTotal = lgGroups ? lgGroups.reduce((s, g) => s + g.count, 0) : (hdSigniCost?.count ?? 0);
              const lgGroupsLabel = lgGroups ? lgGroups.map(g => `${fmtDiscardFilterLabel(g.filter) || 'カード'}${g.count}枚`).join('と') : '';
              const costStr = (eff.cost?.energy ?? []).map(e => `《${e.color}》×${e.count}`).join('') || '';
              const selectedNums = [...selectedLrigGrantedCost].map(i => my.energy[i]);
              const canAffordEnergy = energyTotal === 0
                ? true
                : selectedLrigGrantedCost.size === energyTotal &&
                  canAffordGrowCost(selectedNums, battleCards, costStr, my.keyword_grants, myEnaAllMulti, myEnaMultiStripped, myColorlessOverrides, myColorSubs);
              const totalExceedAvail = (my.field.lrig.length - 1)
                + Math.max(0, (my.field.assist_lrig_l ?? []).length - 1)
                + Math.max(0, (my.field.assist_lrig_r ?? []).length - 1);
              const canAffordExceed = exceedCost === 0 || totalExceedAvail >= exceedCost;
              const canAffordHandDiscard = eff.cost?.discardAll
                ? true // 手札をすべて捨てる：常に支払い可能
                : lgGroups
                  ? (selectedLrigGrantedHandDiscard.size === lgDiscardTotal &&
                     canSatisfyDiscardGroups([...selectedLrigGrantedHandDiscard].map(i => battleCardMap.get(my.hand[i])), lgGroups))
                  : (!hdSigniCost || selectedLrigGrantedHandDiscard.size >= hdSigniCost.count);
              const charmTrashNLrigM = eff.cost?.charmTrash ?? 0;
              const charmOkLrig = charmTrashNLrigM === 0 || (my.field.signi_charms ?? []).filter(Boolean).length >= charmTrashNLrigM;
              const virusNeededLrig = eff.cost?.removeOppVirus ?? 0;
              const virusOkLrig = virusNeededLrig === 0 || (op.field.signi_virus ?? []).reduce((s, v) => s + v, 0) >= virusNeededLrig;
              const lgEnergyTrashCost = eff.cost?.energyTrash;
              const lgEnergyTrashOk = !lgEnergyTrashCost || selectedLrigGrantedEnergyTrash.size >= lgEnergyTrashCost.count;
              const lgTrashExileCost = eff.cost?.trashExile;
              const lgTrashExileOk = !lgTrashExileCost || lgTrashExileCost.self
                ? true
                : selectedLrigGrantedTrashExile.size >= (lgTrashExileCost?.count ?? 0);
              const canAfford = canAffordEnergy && canAffordExceed && canAffordHandDiscard && charmOkLrig && virusOkLrig && lgEnergyTrashOk && lgTrashExileOk;
              const lrigTop = my.field.lrig.at(-1);
              const lrigCard = battleCardMap.get(lrigTop ?? '');

              return (
                <>
                  <p style={{ color: C.textSub, fontSize: 14, fontWeight: 'bold', margin: 0, textAlign: 'center' }}>
                    ルリグ付与【起】効果を発動
                  </p>
                  {lrigCard && (
                    <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                      <img src={lrigCard.ImgURL} alt={lrigCard.CardName}
                        style={{ width: 52, height: 72, objectFit: 'cover', borderRadius: 4, flexShrink: 0 }} />
                      <div>
                        <p style={{ color: C.text, fontSize: 13, fontWeight: 'bold', margin: '0 0 4px' }}>{lrigCard.CardName}</p>
                        <p style={{ color: C.textFaint, fontSize: 11, margin: 0 }}>
                          コスト: {[
                            exceedCost > 0 ? `エクシード${exceedCost}` : null,
                            eff.cost?.energyTrashAll ? 'エナをすべてトラッシュ' : (energyTotal > 0 ? costStr : null),
                            eff.cost?.discardAll ? `手札をすべて捨てる（${my.hand.length}枚）` :
                              hdSigniCost ? `手札${fmtHandDiscardSigniLabel(hdSigniCost)}シグニ×${hdSigniCost.count}` :
                                lgGroups ? `手札${lgGroupsLabel}` : null,
                            charmTrashNLrigM > 0 ? `チャーム${charmTrashNLrigM}枚トラッシュ（現在${(my.field.signi_charms ?? []).filter(Boolean).length}枚）` : null,
                            virusNeededLrig > 0 ? `相手の【ウィルス】${virusNeededLrig}個除去（現在${(op.field.signi_virus ?? []).reduce((s, v) => s + v, 0)}個）` : null,
                            lgEnergyTrashCost ? `エナ${fmtDiscardFilterLabel(lgEnergyTrashCost.filter) || 'シグニ'}${lgEnergyTrashCost.count}枚トラッシュ` : null,
                            lgTrashExileCost?.self ? 'このカードをゲームから除外' : lgTrashExileCost ? `トラッシュから${lgTrashExileCost.count ?? 1}枚ゲーム除外` : null,
                          ].filter(Boolean).join('・') || 'なし'}
                        </p>
                        {exceedCost > 0 && !canAffordExceed && (
                          <p style={{ color: C.danger, fontSize: 11, margin: '4px 0 0' }}>
                            ルリグスタックが不足しています
                          </p>
                        )}
                      </div>
                    </div>
                  )}

                  {/* discardAll/energyTrashAll: 自動・選択不要の通知 */}
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

                  {energyTotal > 0 && !eff.cost?.energyTrashAll && (
                    <>
                      <p style={{ color: C.text, fontSize: 12, margin: 0 }}>
                        エナゾーンから選択: {selectedLrigGrantedCost.size} / {energyTotal}枚
                      </p>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, overflowY: 'auto', maxHeight: 180 }}>
                        {my.energy.map((num, i) => {
                          const c = battleCardMap.get(num);
                          const isSel = selectedLrigGrantedCost.has(i);
                          return (
                            <div key={i}
                              onClick={() => setSelectedLrigGrantedCost(prev => {
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
                                border: isSel ? '2px solid #f44336' : C.borderCard,
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

                  {(hdSigniCost || lgGroups) && (
                    <>
                      <p style={{ color: C.text, fontSize: 12, margin: 0 }}>
                        手札から{lgGroups ? lgGroupsLabel : `${fmtHandDiscardSigniLabel(hdSigniCost!)}シグニ`}を選択: {selectedLrigGrantedHandDiscard.size} / {lgDiscardTotal}枚
                      </p>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, overflowY: 'auto', maxHeight: 180 }}>
                        {my.hand.map((num, i) => {
                          const c = battleCardMap.get(num);
                          let isValidTarget: boolean;
                          if (lgGroups) {
                            isValidTarget = lgGroups.some(g => matchesFilter(c, g.filter));
                          } else {
                            const hdColors = hdSigniCost!.color ? (Array.isArray(hdSigniCost!.color) ? hdSigniCost!.color : [hdSigniCost!.color]) : null;
                            const hdStories = hdSigniCost!.story ? (Array.isArray(hdSigniCost!.story) ? hdSigniCost!.story : [hdSigniCost!.story]) : null;
                            isValidTarget = c?.Type === 'シグニ' &&
                              (!hdColors || hdColors.some(col => c?.Color?.includes(col))) &&
                              (!hdStories || hdStories.some(st => (c?.CardClass ?? '').includes(st)));
                          }
                          const isSel = selectedLrigGrantedHandDiscard.has(i);
                          if (!isValidTarget && !isSel) return null;
                          return (
                            <div key={i}
                              onClick={() => {
                                if (!isValidTarget) return;
                                setSelectedLrigGrantedHandDiscard(prev => {
                                  const next = new Set(prev);
                                  if (next.has(i)) { next.delete(i); return next; }
                                  if (next.size >= lgDiscardTotal) return prev;
                                  next.add(i); return next;
                                });
                              }}
                              onPointerDown={() => { pickLongPressTimer.current = setTimeout(() => { setExpandedPickImgUrl(c?.ImgURL ?? null); }, 500); }}
                              onPointerUp={() => { if (pickLongPressTimer.current) { clearTimeout(pickLongPressTimer.current); pickLongPressTimer.current = null; } }}
                              onPointerLeave={() => { if (pickLongPressTimer.current) { clearTimeout(pickLongPressTimer.current); pickLongPressTimer.current = null; } }}
                              onContextMenu={e => e.preventDefault()}
                              style={{ position: 'relative', width: 44, height: 62, borderRadius: 3, flexShrink: 0,
                                border: isSel ? '2px solid #2196f3' : C.borderCard,
                                cursor: isValidTarget ? 'pointer' : 'default',
                                opacity: isValidTarget ? 1 : 0.4, overflow: 'hidden' }}>
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

                  {/* energyTrash: エナゾーンから指定シグニをトラッシュするコスト選択 */}
                  {lgEnergyTrashCost && (
                    <>
                      <p style={{ color: lgEnergyTrashOk ? C.text : C.warn, fontSize: 12, margin: 0 }}>
                        エナから{fmtDiscardFilterLabel(lgEnergyTrashCost.filter) || 'シグニ'}をトラッシュに置く:
                        {' '}{selectedLrigGrantedEnergyTrash.size} / {lgEnergyTrashCost.count}枚
                      </p>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, overflowY: 'auto', maxHeight: 180 }}>
                        {my.energy.map((num, i) => {
                          const c = battleCardMap.get(num);
                          const matches = !lgEnergyTrashCost.filter || matchesFilter(c, lgEnergyTrashCost.filter);
                          const isSel = selectedLrigGrantedEnergyTrash.has(i);
                          return (
                            <div key={i}
                              onClick={() => matches && setSelectedLrigGrantedEnergyTrash(prev => {
                                const next = new Set(prev);
                                if (next.has(i)) { next.delete(i); return next; }
                                if (next.size >= lgEnergyTrashCost.count) return prev;
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
                  {lgTrashExileCost && !lgTrashExileCost.self && (
                    <>
                      <p style={{ color: lgTrashExileOk ? C.text : C.warn, fontSize: 12, margin: 0 }}>
                        トラッシュから{lgTrashExileCost.filter?.cardName ? `《${lgTrashExileCost.filter.cardName}》` : 'カード'}をゲームから除外:
                        {' '}{selectedLrigGrantedTrashExile.size} / {lgTrashExileCost.count ?? 1}枚
                      </p>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, overflowY: 'auto', maxHeight: 180 }}>
                        {my.trash.map((num, i) => {
                          const c = battleCardMap.get(num);
                          const matches = !lgTrashExileCost.filter || matchesFilter(c, lgTrashExileCost.filter);
                          const isSel = selectedLrigGrantedTrashExile.has(i);
                          const needed = lgTrashExileCost.count ?? 1;
                          return (
                            <div key={i}
                              onClick={() => matches && setSelectedLrigGrantedTrashExile(prev => {
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
                  {lgTrashExileCost?.self && (
                    <p style={{ color: C.warn, fontSize: 12, margin: 0, textAlign: 'center' }}>
                      このカードをゲームから除外します
                    </p>
                  )}

                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      onClick={() => { setPendingLrigGranted(null); setSelectedLrigGrantedCost(new Set()); setSelectedLrigGrantedHandDiscard(new Set()); setSelectedLrigGrantedEnergyTrash(new Set()); setSelectedLrigGrantedTrashExile(new Set()); }}
                      disabled={loading}
                      style={{ flex: 1, padding: '10px 0', borderRadius: 8, border: C.borderUI,
                        backgroundColor: 'transparent', color: C.textSub, fontSize: 13, cursor: 'pointer' }}>
                      キャンセル
                    </button>
                    <button
                      onClick={() => executeLrigGranted(eff, selectedLrigGrantedCost, selectedLrigGrantedHandDiscard, selectedLrigGrantedEnergyTrash, selectedLrigGrantedTrashExile)}
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
