// v0.277: 手札から発動する【起】コスト選択モーダル。BattleScreen.tsx から Stage 1 で抽出。
import { useState, type Dispatch, type SetStateAction } from 'react';
import { createPortal } from 'react-dom';
import type { CardEffect } from '../../../types/effects';
import { C } from '../../../components/BoardComponents';
import { energyCostToString, isEnergyPaymentSelectionValid, isMultiEna } from '../costs';
import { energyPayEntryLabel } from '../energyPaySource';
import { getCardNum } from '../../../engine/effectExecutor';
import { handActivateFieldTrashOk, handActivateFieldTrashZones, type HandActivateSelections } from '../handActivateCost';
import type { BattleModalCtx } from './types';

interface HandActivatedModalProps {
  ctx: BattleModalCtx;
  pendingHandActivated: { cardNum: string; handIndex: number; effect: CardEffect } | null;
  setPendingHandActivated: Dispatch<SetStateAction<{ cardNum: string; handIndex: number; effect: CardEffect } | null>>;
  selectedHandActivatedCost: Set<number>;
  setSelectedHandActivatedCost: Dispatch<SetStateAction<Set<number>>>;
  executeHandActivated: (cardNum: string, handIndex: number, effect: CardEffect, selections: HandActivateSelections) => void;
}

const fmtStory = (story: string | string[] | undefined) =>
  story ? (Array.isArray(story) ? story : [story]).map(x => `＜${x}＞`).join('か') + 'の' : '';

export function HandActivatedModal(p: HandActivatedModalProps) {
  const { my, loading, battleCards, battleCardMap, myEnaAllMulti, myEnaMultiStripped, myColorlessOverrides, myColorSubs, myEnergyExtraColors, myWholeEnergySubstitutes, pickLongPressTimer, setExpandedPickImgUrl , myEnergyPayPool } = p.ctx;
  const { pendingHandActivated, setPendingHandActivated, selectedHandActivatedCost, setSelectedHandActivatedCost, executeHandActivated } = p;
  // 🆕§5.3 `O-533`＝`fieldTrash`（場のシグニをトラッシュに置く）で選んだゾーン。
  //   開いている効果（`pendingHandActivated`）と組で持つ＝別の効果を開くと空として読む。
  const [fieldTrashSel, setFieldTrashSel] = useState<{ owner: typeof pendingHandActivated; zones: Set<number> }>({ owner: null, zones: new Set() });
  const selectedFieldTrash = fieldTrashSel.owner === pendingHandActivated ? fieldTrashSel.zones : new Set<number>();
  const setSelectedFieldTrash = (f: (prev: Set<number>) => Set<number>) =>
    setFieldTrashSel({ owner: pendingHandActivated, zones: f(selectedFieldTrash) });
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
              const selectedNums = [...selectedHandActivatedCost].map(i => myEnergyPayPool[i].cardNum);
              const discardSelf = haEffect.cost?.discardSelfFromHand === true;
              const fieldTrashCost = haEffect.cost?.fieldTrash;
              const fieldTrashZones = handActivateFieldTrashZones(haEffect, my, battleCardMap);
              const fieldTrashOk = handActivateFieldTrashOk(haEffect, my, selectedFieldTrash, battleCardMap);
              const costParts = [
                ...(discardSelf ? ['このカードを手札から捨てる'] : ['このカードを手札から公開']),
                ...(fieldTrashCost ? [`場の${fmtStory(fieldTrashCost.filter?.story)}シグニ${fieldTrashCost.count}体${fieldTrashCost.upToCount ? 'まで' : ''}をトラッシュ`] : []),
                ...(energyTotal > 0 ? [`エナ${energyTotal}枚`] : []),
              ];
              const isValid = fieldTrashOk && (energyTotal === 0 ||
                isEnergyPaymentSelectionValid({
                  selectedEnergyNums: selectedNums, cards: battleCards, baseCost: energyCostStr,
                  keywordGrants: my.keyword_grants, allMulti: myEnaAllMulti, stripped: myEnaMultiStripped,
                  colorlessOverrides: myColorlessOverrides, colorSubs: myColorSubs, extraColorMap: myEnergyExtraColors,
                  wholeSubstitutes: myWholeEnergySubstitutes,
                }));
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
                      <p style={{ color: C.textDim, fontSize: 11, margin: 0 }}>コスト: {costParts.join('・')}</p>
                    </div>
                  </div>
                  <p style={{ color: C.textMuted, fontSize: 11, margin: 0, textAlign: 'center' }}>
                    {discardSelf ? 'このカードを手札からトラッシュに捨てます' : 'このカードを手札から公開します（手札に残ります）'}
                  </p>
                  {fieldTrashCost && (
                    <>
                      <p style={{ color: fieldTrashOk ? C.success : C.textMuted, fontSize: 12, margin: 0, textAlign: 'center' }}>
                        場からトラッシュに置く{fmtStory(fieldTrashCost.filter?.story)}シグニ: {selectedFieldTrash.size} / {fieldTrashCost.count}体{fieldTrashCost.upToCount ? 'まで' : ''}
                      </p>
                      {fieldTrashZones.length === 0 ? (
                        <p style={{ color: C.warn, fontSize: 11, margin: 0, textAlign: 'center' }}>対象シグニがいません</p>
                      ) : (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center' }}>
                          {fieldTrashZones.map(zi => {
                            const top = my.field.signi[zi]?.at(-1);
                            const c = top ? battleCardMap.get(getCardNum(top)) : undefined;
                            const isSel = selectedFieldTrash.has(zi);
                            return (
                              <div key={zi}
                                data-testid={`handact-fieldtrash-${zi}`}
                                onClick={() => setSelectedFieldTrash(prev => {
                                  const next = new Set(prev);
                                  if (next.has(zi)) { next.delete(zi); return next; }
                                  if (next.size >= fieldTrashCost.count) return prev;
                                  next.add(zi); return next;
                                })}
                                onContextMenu={e => e.preventDefault()}
                                style={{ position: 'relative', width: 52, height: 73, borderRadius: 4, flexShrink: 0,
                                  border: isSel ? '2px solid #4caf50' : C.borderCard, cursor: 'pointer', overflow: 'hidden' }}>
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
                  {energyTotal > 0 && (
                    <>
                      <p style={{ color: isValid ? C.success : C.textMuted, fontSize: 12, margin: 0, textAlign: 'center' }}>
                        エナから選択: {selectedHandActivatedCost.size} / {energyTotal}枚
                        {energyCosts.map((c, i) => (
                          <span key={i} style={{ marginLeft: 6, color: C.textDim }}>({c.color}×{c.count})</span>
                        ))}
                      </p>
                      <div style={{ overflowY: 'auto', display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center' }}>
                        {myEnergyPayPool.map((payEntry, i) => {
                          const num = payEntry.cardNum;
                          const card = battleCardMap.get(num);
                          const isSel = selectedHandActivatedCost.has(i);
                          const isWild = isMultiEna(num, battleCards, my.keyword_grants, myEnaAllMulti, myEnaMultiStripped);
                          return (
                            <div key={i} title={energyPayEntryLabel(payEntry, battleCardMap) ?? undefined}
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
                    data-testid="handact-confirm"
                    onClick={() => executeHandActivated(pendingHandActivated.cardNum, pendingHandActivated.handIndex, haEffect, { energy: selectedHandActivatedCost, fieldTrash: selectedFieldTrash })}
                    disabled={loading || !isValid}
                    style={{ padding: '11px 0', borderRadius: 8, border: 'none',
                      backgroundColor: isValid ? '#ff6b35' : C.disabled,
                      color: C.text, fontSize: 14, fontWeight: 'bold',
                      cursor: (loading || !isValid) ? 'default' : 'pointer' }}>
                    {discardSelf ? '発動する（このカードを捨てる）' : '発動する'}
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
