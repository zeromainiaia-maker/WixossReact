// スペルカットインポップアップ（相手のスペル発動中：候補提示→コスト/エクシード選択→使用）。BattleScreen.tsx から Stage 1 で抽出。
import { createPortal } from 'react-dom';
import type { Dispatch, SetStateAction } from 'react';
import { getCardNum } from '../../../engine/effectExecutor';
import { C } from '../../../components/BoardComponents';
import { removeNColorFromCost, canAffordWithExtraCost, parseGrowCost, isMultiEna, effectEnergyCostStr } from '../costs';
import type { BattleModalCtx, CutinCandidate } from './types';

interface CutinModalProps {
  ctx: BattleModalCtx;
  pendingCutinCard: CutinCandidate | null;
  setPendingCutinCard: Dispatch<SetStateAction<CutinCandidate | null>>;
  selectedCutinCost: Set<number>;
  setSelectedCutinCost: Dispatch<SetStateAction<Set<number>>>;
  selectedCutinExceed: Set<number>;
  setSelectedCutinExceed: Dispatch<SetStateAction<Set<number>>>;
  setCutinSpellZoomed: Dispatch<SetStateAction<boolean>>;
  cutinCandidates: CutinCandidate[];
  handleCutinPass: () => void;
  handleCutinUse: (candidate: CutinCandidate, costIndices: Set<number>) => void;
  toggleCutinCostCard: (idx: number) => void;
}

export function CutinModal(p: CutinModalProps) {
  const { bs, user, my, loading, battleCards, battleCardMap, myEnaAllMulti, myEnaMultiStripped, myColorlessOverrides, myColorSubs, myEnergyExtraColors, activeCostMods, specificCardCostReductions, pickLongPressTimer, setExpandedPickImgUrl } = p.ctx;
  const { pendingCutinCard, setPendingCutinCard, selectedCutinCost, setSelectedCutinCost, selectedCutinExceed, setSelectedCutinExceed, setCutinSpellZoomed, cutinCandidates, handleCutinPass, handleCutinUse, toggleCutinCostCard } = p;
  return (
    <>
      {bs.pending_spell && bs.pending_spell.caster_id !== user.id && createPortal(
        <div style={{ position: 'fixed', inset: 0, zIndex: 4000,
          backgroundColor: 'rgba(0,0,0,0.92)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          padding: 20 }}>
          <div style={{ backgroundColor: C.bgModal, border: C.borderUI, borderRadius: 12,
            padding: '20px 16px', width: 'min(92vw, 360px)', maxHeight: '85vh',
            display: 'flex', flexDirection: 'column', gap: 12 }}>
            {(() => {
              const spellCard = battleCardMap.get(bs.pending_spell.card_num);
              if (!pendingCutinCard) {
                return (
                  <>
                    <p style={{ color: C.danger, fontSize: 14, fontWeight: 'bold', margin: 0, textAlign: 'center' }}>
                      スペルカットイン
                    </p>
                    <p style={{ color: C.textDim, fontSize: 12, margin: 0, textAlign: 'center' }}>
                      相手がスペルを発動しました
                    </p>
                    {spellCard && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10,
                        padding: '8px 12px', borderRadius: 8, border: C.borderUI,
                        backgroundColor: C.bgButton }}>
                        <img src={spellCard.ImgURL} alt={spellCard.CardName}
                          onClick={() => setCutinSpellZoomed(true)}
                          onTouchEnd={e => { e.preventDefault(); setCutinSpellZoomed(true); }}
                          style={{ width: 44, height: 62, objectFit: 'cover', borderRadius: 4, flexShrink: 0, cursor: 'pointer' }}
                          onError={e => { const img = e.target as HTMLImageElement; if (!img.src.endsWith('/ErrerCard.webp')) img.src = '/ErrerCard.webp'; }} />
                        <div>
                          <p style={{ color: C.text, fontSize: 13, fontWeight: 'bold', margin: '0 0 2px' }}>{spellCard.CardName}</p>
                          <p style={{ color: C.textDim, fontSize: 11, margin: 0 }}>{spellCard.Timing}</p>
                        </div>
                      </div>
                    )}
                    {cutinCandidates.length > 0 && (
                      <>
                        <p style={{ color: C.textMuted, fontSize: 12, margin: 0 }}>カットインカード:</p>
                        <div style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
                          {cutinCandidates.map(candidate => {
                            const extraArtsCosts = activeCostMods.forMy
                              .filter(m => m.direction === 'increase' && m.targetCardType === 'アーツ')
                              .flatMap(m => m.amount);
                            const exceedCostCand = candidate.source === 'lrig_field'
                              ? (candidate.effect.cost?.exceed ?? 0) : 0;
                            const totalExceedAvailCand = (my.field.lrig.length - 1)
                              + Math.max(0, (my.field.assist_lrig_l ?? []).length - 1)
                              + Math.max(0, (my.field.assist_lrig_r ?? []).length - 1);
                            const canAffordExceedCand = exceedCostCand === 0 || totalExceedAvailCand >= exceedCostCand;
                            const isHandDiscard = candidate.source === 'hand' && candidate.effect.cost?.discardSelfFromHand;
                            const baseCostStr = candidate.source === 'lrig_deck'
                              ? (() => { const r = specificCardCostReductions.find(rr => rr.targetCardName === candidate.card.CardName); return r ? removeNColorFromCost(candidate.card.Cost, '無', r.colorlessReduction) : candidate.card.Cost; })()
                              : effectEnergyCostStr(candidate.effect.cost?.energy);
                            const costStr = `${baseCostStr}${candidate.additionalColorlessCost ? `《無》×${candidate.additionalColorlessCost}` : ''}`;
                            const canAffordEnergy = isHandDiscard
                              ? true
                              : canAffordWithExtraCost(my.energy, battleCards, costStr, extraArtsCosts, my.keyword_grants, myEnaAllMulti, myEnaMultiStripped, myColorlessOverrides, myColorSubs, myEnergyExtraColors);
                            const canAfford = canAffordEnergy && canAffordExceedCand;
                            const exceedPart = exceedCostCand > 0 ? `エクシード${exceedCostCand}` : '';
                            const energyPart = isHandDiscard ? '手札から自分を捨てる' : costStr || '';
                            const costLabel = [exceedPart, energyPart].filter(Boolean).join('・') || 'なし';
                            return (
                              <button key={candidate.instanceId}
                                onClick={() => { if (canAfford) { setPendingCutinCard(candidate); setSelectedCutinCost(new Set()); setSelectedCutinExceed(new Set()); } }}
                                disabled={loading || !canAfford}
                                style={{ display: 'flex', alignItems: 'center', gap: 10,
                                  padding: '8px 12px', borderRadius: 8, border: C.borderUI,
                                  backgroundColor: canAfford ? C.bgButton : C.bgButtonDark,
                                  cursor: (loading || !canAfford) ? 'default' : 'pointer',
                                  opacity: canAfford ? 1 : 0.5, textAlign: 'left' }}>
                                <img src={candidate.card.ImgURL} alt={candidate.card.CardName}
                                  style={{ width: 44, height: 62, objectFit: 'cover', borderRadius: 4, flexShrink: 0 }}
                                  onError={e => { const img = e.target as HTMLImageElement; if (!img.src.endsWith('/ErrerCard.webp')) img.src = '/ErrerCard.webp'; }} />
                                <div>
                                  <p style={{ color: C.text, fontSize: 13, fontWeight: 'bold', margin: '0 0 2px' }}>{candidate.card.CardName}</p>
                                  <p style={{ color: C.textDim, fontSize: 11, margin: '0 0 2px' }}>コスト: {costLabel}</p>
                                  {!canAfford && <p style={{ color: C.danger, fontSize: 10, margin: 0 }}>エナ不足</p>}
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </>
                    )}
                    <button onClick={handleCutinPass} disabled={loading}
                      style={{ padding: '11px 0', borderRadius: 8, border: 'none',
                        backgroundColor: loading ? C.disabled : C.bgButton,
                        color: C.text, fontSize: 14, fontWeight: 'bold',
                        cursor: loading ? 'default' : 'pointer' }}>
                      {loading ? '処理中...' : 'パス（カットインしない）'}
                    </button>
                  </>
                );
              }
              /* カットインのコスト選択 */
              const isHandDiscardModal = pendingCutinCard.source === 'hand' && pendingCutinCard.effect.cost?.discardSelfFromHand;
              const exceedCostModal = pendingCutinCard.source === 'lrig_field'
                ? (pendingCutinCard.effect.cost?.exceed ?? 0) : 0;
              const exceedPoolModal = [
                ...my.field.lrig.slice(0, -1),
                ...(my.field.assist_lrig_l?.slice(0, -1) ?? []),
                ...(my.field.assist_lrig_r?.slice(0, -1) ?? []),
              ];
              const cutinBaseCostStrModal = pendingCutinCard.source === 'lrig_deck'
                ? (() => { const r = specificCardCostReductions.find(rr => rr.targetCardName === pendingCutinCard.card.CardName); return r ? removeNColorFromCost(pendingCutinCard.card.Cost, '無', r.colorlessReduction) : pendingCutinCard.card.Cost; })()
                : effectEnergyCostStr(pendingCutinCard.effect.cost?.energy);
              const cutinCostStrModal = `${cutinBaseCostStrModal}${pendingCutinCard.additionalColorlessCost ? `《無》×${pendingCutinCard.additionalColorlessCost}` : ''}`;
              const exceedPartModal = exceedCostModal > 0 ? `エクシード${exceedCostModal}` : '';
              const energyPartModal = isHandDiscardModal ? '手札から自分を捨てる' : cutinCostStrModal || '';
              const cutinCostLabelModal = [exceedPartModal, energyPartModal].filter(Boolean).join('・') || 'なし';
              const costItems = isHandDiscardModal ? [] : parseGrowCost(cutinCostStrModal);
              const totalReq = costItems.reduce((s, c) => s + c.count, 0);
              const selectedNums = [...selectedCutinCost].map(i => my.energy[i]);
              const extraArtsCosts = activeCostMods.forMy
                .filter(m => m.direction === 'increase' && m.targetCardType === 'アーツ')
                .flatMap(m => m.amount);
              const exceedOkModal = exceedCostModal === 0 || selectedCutinExceed.size === exceedCostModal;
              const isValid = exceedOkModal && (totalReq === 0 || isHandDiscardModal ||
                (selectedCutinCost.size === totalReq &&
                  canAffordWithExtraCost(selectedNums, battleCards, cutinCostStrModal, extraArtsCosts, my.keyword_grants, myEnaAllMulti, myEnaMultiStripped, myColorlessOverrides, myColorSubs, myEnergyExtraColors)));
              return (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <button onClick={() => { setPendingCutinCard(null); setSelectedCutinCost(new Set()); setSelectedCutinExceed(new Set()); }}
                      style={{ padding: '4px 10px', borderRadius: 6, border: C.borderUI,
                        backgroundColor: 'transparent', color: C.textDim, cursor: 'pointer', fontSize: 12 }}>
                      ← 戻る
                    </button>
                    <p style={{ color: C.textSub, fontSize: 14, fontWeight: 'bold', margin: 0 }}>カットインコスト選択</p>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <img src={pendingCutinCard.card.ImgURL} alt={pendingCutinCard.card.CardName}
                      style={{ width: 36, height: 50, objectFit: 'cover', borderRadius: 3, flexShrink: 0 }}
                      onError={e => { const img = e.target as HTMLImageElement; if (!img.src.endsWith('/ErrerCard.webp')) img.src = '/ErrerCard.webp'; }} />
                    <div>
                      <p style={{ color: C.text, fontSize: 12, fontWeight: 'bold', margin: '0 0 2px' }}>{pendingCutinCard.card.CardName}</p>
                      <p style={{ color: C.textDim, fontSize: 11, margin: 0 }}>コスト: {cutinCostLabelModal}</p>
                    </div>
                  </div>
                  {totalReq > 0 && (
                    <>
                      <p style={{ color: isValid ? C.success : C.textMuted, fontSize: 12, margin: 0, textAlign: 'center' }}>
                        エナから選択: {selectedCutinCost.size} / {totalReq}枚
                        {costItems.map((c, i) => (
                          <span key={i} style={{ marginLeft: 6, color: C.textDim }}>({c.color}×{c.count})</span>
                        ))}
                      </p>
                      <div style={{ overflowY: 'auto', display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center' }}>
                        {my.energy.map((num, i) => {
                          const card = battleCardMap.get(num);
                          const isSel = selectedCutinCost.has(i);
                          const isWild = isMultiEna(num, battleCards, my.keyword_grants, myEnaAllMulti, myEnaMultiStripped);
                          return (
                            <div key={i} onClick={() => toggleCutinCostCard(i)}
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
                  {exceedCostModal > 0 && (
                    <>
                      <p style={{ color: exceedOkModal ? C.success : C.textMuted, fontSize: 12, margin: 0, textAlign: 'center' }}>
                        エクシード選択: {selectedCutinExceed.size} / {exceedCostModal}枚（ルリグの下から選択）
                      </p>
                      <div style={{ overflowY: 'auto', display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center' }}>
                        {exceedPoolModal.map((id, i) => {
                          const exCard = battleCardMap.get(getCardNum(id));
                          const isSel = selectedCutinExceed.has(i);
                          return (
                            <div key={i} onClick={() => {
                              setSelectedCutinExceed(prev => {
                                const next = new Set(prev);
                                if (next.has(i)) { next.delete(i); } else if (next.size < exceedCostModal) { next.add(i); }
                                return next;
                              });
                            }}
                            style={{ position: 'relative', width: 52, height: 73, borderRadius: 4,
                              overflow: 'hidden', cursor: 'pointer', flexShrink: 0,
                              border: isSel ? '2px solid #ff6600' : C.borderCard }}>
                              {exCard
                                ? <img src={exCard.ImgURL} alt={exCard.CardName} draggable={false}
                                    style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                                    onError={e => { const img = e.target as HTMLImageElement; if (!img.src.endsWith('/ErrerCard.webp')) img.src = '/ErrerCard.webp'; }} />
                                : <div style={{ width: '100%', height: '100%', backgroundColor: C.bgButton,
                                    display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <span style={{ fontSize: 8, color: C.textFaint }}>{id}</span>
                                  </div>
                              }
                              {isSel && (
                                <div style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(255,102,0,0.45)',
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
                  <button onClick={() => handleCutinUse(pendingCutinCard, selectedCutinCost)}
                    disabled={loading || !isValid}
                    style={{ padding: '11px 0', borderRadius: 8, border: 'none',
                      backgroundColor: isValid ? C.danger : C.disabled,
                      color: C.text, fontSize: 14, fontWeight: 'bold',
                      cursor: (loading || !isValid) ? 'default' : 'pointer' }}>
                    カットイン使用
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
