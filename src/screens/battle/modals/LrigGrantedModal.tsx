// ルリグ付与能力（GRANT_LRIG_ABILITY）発動モーダル（エナ/エクシード/手札捨て/チャーム等のコスト支払い）。BattleScreen.tsx から Stage 1 で抽出。
import { createPortal } from 'react-dom';
import type { Dispatch, SetStateAction } from 'react';
import type { CardEffect } from '../../../types/effects';
import { canSatisfyDiscardGroups } from '../../../engine/execUtils';
import { matchesFilter } from '../../../engine/effectExecutor';
import { collectIncreaseActCost } from '../../../engine/effectEngine';
import { C } from '../../../components/BoardComponents';
import { fmtDiscardFilterLabel, fmtHandDiscardSigniLabel, handDiscardSigniCostSatisfied, canAddHandDiscardSigniIndex, canAffordGrowCost, energyTrashCostSatisfied, canAddEnergyTrashIndex } from '../costs';
import { payLrigDownCost, fmtLrigDownCostLabel } from '../lrigDownCost';
import { fieldTrashSelectableZones } from '../fieldLimit';
import { getCardNum } from '../../../engine/effectExecutor';
import { energyPayEntryLabel } from '../energyPaySource';
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
  /** `fieldBanish`（コストで自分の場のシグニをバニッシュ）で選んだシグニゾーン（§5.3 `O-67`）。 */
  selectedLrigGrantedFieldBanish: Set<number>;
  setSelectedLrigGrantedFieldBanish: Dispatch<SetStateAction<Set<number>>>;
  executeLrigGranted: (effect: CardEffect, costIndices: Set<number>, handDiscardIndices?: Set<number>, energyTrashIndices?: Set<number>, trashExileIndices?: Set<number>, fieldBanishZones?: Set<number>) => void;
}

export function LrigGrantedModal(p: LrigGrantedModalProps) {
  const { my, op, isMyTurn, loading, battleCards, battleCardMap, effectsMap, myEnaAllMulti, myEnaMultiStripped, myColorlessOverrides, myColorSubs, pickLongPressTimer, setExpandedPickImgUrl , myEnergyPayPool } = p.ctx;
  const { pendingLrigGranted, setPendingLrigGranted, selectedLrigGrantedCost, setSelectedLrigGrantedCost, selectedLrigGrantedHandDiscard, setSelectedLrigGrantedHandDiscard, selectedLrigGrantedEnergyTrash, setSelectedLrigGrantedEnergyTrash, selectedLrigGrantedTrashExile, setSelectedLrigGrantedTrashExile, selectedLrigGrantedFieldBanish, setSelectedLrigGrantedFieldBanish, executeLrigGranted } = p;
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
              const baseEnergyTotal = (eff.cost?.energy ?? []).reduce((s, c) => s + c.count, 0);
              const actCostExtra = collectIncreaseActCost(op, isMyTurn, effectsMap);
              const energyTotal = baseEnergyTotal + actCostExtra;
              const exceedCost = eff.cost?.exceed ?? 0;
              const hdSigniCost = eff.cost?.handDiscardSigni;
              const lgGroups = eff.cost?.discardGroups;
              const lgDiscardTotal = lgGroups ? lgGroups.reduce((s, g) => s + g.count, 0) : (hdSigniCost?.count ?? 0);
              const lgGroupsLabel = lgGroups ? lgGroups.map(g => `${fmtDiscardFilterLabel(g.filter) || 'カード'}${g.count}枚`).join('と') : '';
              const costStr = [
                ...(eff.cost?.energy ?? []).map(e => `《${e.color}》×${e.count}`),
                ...(actCostExtra > 0 ? [`《無》×${actCostExtra}`] : []),
              ].join('');
              const selectedNums = [...selectedLrigGrantedCost].map(i => myEnergyPayPool[i].cardNum);
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
                  // 🆕§5.3 `O-108`＝**集合制約**（「それぞれ名前の異なる」）まで見る。可否ゲート／シグニ【起】と同じ関数。
                  : (!hdSigniCost || handDiscardSigniCostSatisfied(my.hand, selectedLrigGrantedHandDiscard, hdSigniCost, battleCardMap));
              const charmTrashNLrigM = eff.cost?.charmTrash ?? 0;
              const charmOkLrig = charmTrashNLrigM === 0 || (my.field.signi_charms ?? []).filter(Boolean).length >= charmTrashNLrigM;
              const virusNeededLrig = eff.cost?.removeOppVirus ?? 0;
              const virusOkLrig = virusNeededLrig === 0 || (op.field.signi_virus ?? []).reduce((s, v) => s + v, 0) >= virusNeededLrig;
              const lgEnergyTrashCost = eff.cost?.energyTrash;
              // ⚠枚数だけでなく**集合制約**（「それぞれレベルの異なる」等）も見る＝共有判定は `costs.ts` の1本
              const lgEnergyTrashOk = energyTrashCostSatisfied(my.energy, selectedLrigGrantedEnergyTrash, lgEnergyTrashCost, battleCardMap);
              const lgTrashExileCost = eff.cost?.trashExile;
              const lgTrashExileOk = !lgTrashExileCost || lgTrashExileCost.self
                ? true
                : selectedLrigGrantedTrashExile.size >= (lgTrashExileCost?.count ?? 0);
              // lrigDown: アップ状態のルリグN体をダウンするコスト（自動支払い）。ルリグ本来の【起】も
              // この経路を通る（WXDi-P02-009-E3／WXDi-P03-009-E3）。判定は支払い関数に委ねる。タスク12(cviii)
              const lgLrigDownCost = eff.cost?.lrigDown;
              const lgLrigDownOk = !lgLrigDownCost || payLrigDownCost(my, lgLrigDownCost, battleCardMap) !== null;
              // fieldBanish: コストで自分の場のシグニをバニッシュ（§5.3 `O-67`・`WX25-P1-022-E1`）。
              // 🔴**行き先はエナゾーン**なので `fieldTrash`（トラッシュ）と混ぜない。⚠**この経路には
              //   場シグニ系コストの支払いが1行も無かった**＝提示だけして踏み倒していた。
              const lgFieldBanishCost = eff.cost?.fieldBanish;
              const lgFbSelectableZones = lgFieldBanishCost
                ? fieldTrashSelectableZones(lgFieldBanishCost, my, battleCardMap)
                : [];
              const lgFieldBanishOk = !lgFieldBanishCost
                || (selectedLrigGrantedFieldBanish.size === lgFieldBanishCost.count
                    && [...selectedLrigGrantedFieldBanish].every(zi => lgFbSelectableZones.includes(zi)));
              const canAfford = canAffordEnergy && canAffordExceed && canAffordHandDiscard && charmOkLrig && virusOkLrig && lgEnergyTrashOk && lgTrashExileOk && lgLrigDownOk && lgFieldBanishOk;
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
                            lgLrigDownCost ? fmtLrigDownCostLabel(lgLrigDownCost) : null,
                            lgFieldBanishCost ? `場から${lgFieldBanishCost.excludeSelf ? '他の' : ''}${fmtDiscardFilterLabel(lgFieldBanishCost.filter)}シグニ${lgFieldBanishCost.count}体をバニッシュ` : null,
                          ].filter(Boolean).join('・') || 'なし'}
                        </p>
                        {lgLrigDownCost && !lgLrigDownOk && (
                          <p style={{ color: C.danger, fontSize: 11, margin: '4px 0 0' }}>
                            ダウンできるルリグが不足しています
                          </p>
                        )}
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
                        {myEnergyPayPool.map((payEntry, i) => {
                          const num = payEntry.cardNum;
                          const c = battleCardMap.get(num);
                          const isSel = selectedLrigGrantedCost.has(i);
                          return (
                            <div key={i} title={energyPayEntryLabel(payEntry, battleCardMap) ?? undefined}
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
                            // ⚠ 判定は costs.ts の共有関数だけを使う（写経すると `level` 指定が片方で落ちる）
                            // 🆕§5.3 `O-108`＝制約を壊す組み合わせは選ばせない。
                            isValidTarget = canAddHandDiscardSigniIndex(
                              my.hand, selectedLrigGrantedHandDiscard, i, hdSigniCost!, battleCardMap);
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
                          const matches = (!lgEnergyTrashCost.filter || matchesFilter(c, lgEnergyTrashCost.filter))
                            && canAddEnergyTrashIndex(my.energy, selectedLrigGrantedEnergyTrash, i, lgEnergyTrashCost, battleCardMap);
                          const isSel = selectedLrigGrantedEnergyTrash.has(i);
                          return (
                            <div key={i}
                              onClick={() => matches && setSelectedLrigGrantedEnergyTrash(prev => {
                                const next = new Set(prev);
                                if (next.has(i)) { next.delete(i); return next; }
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

                  {/* fieldBanish: コストで自分の場のシグニをバニッシュ（行き先はエナゾーン。§5.3 `O-67`） */}
                  {lgFieldBanishCost && (
                    <>
                      <p style={{ color: lgFieldBanishOk ? C.text : C.warn, fontSize: 12, margin: 0 }}>
                        場から{lgFieldBanishCost.excludeSelf ? '他の' : ''}{fmtDiscardFilterLabel(lgFieldBanishCost.filter)}シグニをバニッシュ:
                        {' '}{selectedLrigGrantedFieldBanish.size} / {lgFieldBanishCost.count}体
                      </p>
                      {lgFbSelectableZones.length === 0 ? (
                        <p style={{ color: C.warn, fontSize: 11, margin: 0 }}>対象シグニがいません</p>
                      ) : (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                          {lgFbSelectableZones.map(zi => {
                            const top = my.field.signi[zi]?.at(-1);
                            const c = top ? battleCardMap.get(getCardNum(top)) : undefined;
                            const isSel = selectedLrigGrantedFieldBanish.has(zi);
                            return (
                              <div key={zi}
                                data-testid={`lrigact-fieldbanish-${zi}`}
                                onClick={() => setSelectedLrigGrantedFieldBanish(prev => {
                                  const next = new Set(prev);
                                  if (next.has(zi)) { next.delete(zi); return next; }
                                  if (next.size >= lgFieldBanishCost.count) return prev;
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

                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      onClick={() => { setPendingLrigGranted(null); setSelectedLrigGrantedCost(new Set()); setSelectedLrigGrantedHandDiscard(new Set()); setSelectedLrigGrantedEnergyTrash(new Set()); setSelectedLrigGrantedTrashExile(new Set()); setSelectedLrigGrantedFieldBanish(new Set()); }}
                      disabled={loading}
                      style={{ flex: 1, padding: '10px 0', borderRadius: 8, border: C.borderUI,
                        backgroundColor: 'transparent', color: C.textSub, fontSize: 13, cursor: 'pointer' }}>
                      キャンセル
                    </button>
                    <button
                      onClick={() => executeLrigGranted(eff, selectedLrigGrantedCost, selectedLrigGrantedHandDiscard, selectedLrigGrantedEnergyTrash, selectedLrigGrantedTrashExile, selectedLrigGrantedFieldBanish)}
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
