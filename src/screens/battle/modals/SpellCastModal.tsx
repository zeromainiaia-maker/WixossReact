// スペル発動コスト選択モーダル。BattleScreen.tsx から Stage 1 で抽出。
import type { Dispatch, SetStateAction } from 'react';
import { createPortal } from 'react-dom';
import type { CardData } from '../../../types';
import { collectFirstSpellCostUp } from '../../../engine/effectEngine';
import { C } from '../../../components/BoardComponents';
import { parseGrowCost, canAffordWithExtraCost, isMultiEna, betOptionsOf, optionalDiscardCostOf, matchesOptionalDiscardGroup, optionalDiscardSatisfied } from '../costs';
import { resolveUseTimeCost, useTimeCostCandidates as getTimeCostCandidates, applyUseTimeCostReduction, useTimeCostSelectionValid as isTimeCostSelectionValid } from '../useTimeCost';
import { computeSpellEffectiveCost, spellExtraCosts } from '../spellUseGate';
import { UseCostPaymentPanel } from './UseCostPaymentPanel';
import { energyPayEntryLabel } from '../energyPaySource';
import type { BattleModalCtx } from './types';
import type { PendingSpellCast } from '../hooks/useSpellCast';

interface SpellCastModalProps {
  ctx: BattleModalCtx;
  pendingSpellCast: PendingSpellCast | null;
  setPendingSpellCast: Dispatch<SetStateAction<PendingSpellCast | null>>;
  selectedSpellCost: Set<number>;
  setSelectedSpellCost: Dispatch<SetStateAction<Set<number>>>;
  selectedSpellDiscard: Set<number>;
  setSelectedSpellDiscard: Dispatch<SetStateAction<Set<number>>>;
  selectedSpellUseCostPay: Set<string>;
  setSelectedSpellUseCostPay: Dispatch<SetStateAction<Set<string>>>;
  betAmount: number;
  setBetAmount: Dispatch<SetStateAction<number>>;
  toggleSpellCostCard: (idx: number) => void;
  castSpell: (card: CardData, costIndices: Set<number>, handIdx: number, fromLrigDeck?: boolean, betCoins?: number, virusRemovalByZone?: number[], discardIndices?: Set<number>, useCostPayKeys?: Set<string>) => void;
}

export function SpellCastModal(p: SpellCastModalProps) {
  const { my, op, loading, battleCards, battleCardMap, effectsMap, myEnaAllMulti, myEnaMultiStripped, myColorlessOverrides, myColorSubs, myEnergyExtraColors, isActionBlocked, pickLongPressTimer, setExpandedPickImgUrl , myEnergyPayPool, myArtsPayerCtx } = p.ctx;
  const { pendingSpellCast, setPendingSpellCast, selectedSpellCost, setSelectedSpellCost, selectedSpellDiscard, setSelectedSpellDiscard, selectedSpellUseCostPay, setSelectedSpellUseCostPay, betAmount, setBetAmount, toggleSpellCostCard, castSpell } = p;
  return (
    <>
      {pendingSpellCast && createPortal(
        <div onClick={() => { setPendingSpellCast(null); setSelectedSpellCost(new Set()); setSelectedSpellDiscard(new Set()); setSelectedSpellUseCostPay(new Set()); setBetAmount(0); }}
          style={{ position: 'fixed', inset: 0, zIndex: 3500,
            backgroundColor: 'rgba(0,0,0,0.92)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            padding: 20 }}>
          <div onClick={e => e.stopPropagation()}
            style={{ backgroundColor: C.bgModal, border: C.borderUI, borderRadius: 12,
              padding: '20px 16px', width: 'min(92vw, 360px)', maxHeight: '85vh',
              display: 'flex', flexDirection: 'column', gap: 12 }}>
            {(() => {
              const spellCard = battleCardMap.get(pendingSpellCast.cardNum);
              if (!spellCard) return null;
              // 使用時の任意支払い（「手札から青と黒の＜電機＞を1枚ずつ捨ててもよい」＝WX21-035/WX21-071）。
              // 支払いが揃ってはじめてコスト置換が成立する＝選択に追従して再計算する（タスク12(lxxxi)）。
              const optDiscardSpec = optionalDiscardCostOf(spellCard.CardNum, effectsMap);
              const optDiscardNums = [...selectedSpellDiscard].map(i => my.hand[i]).filter(Boolean);
              const optDiscardPaid = !!optDiscardSpec
                && optionalDiscardSatisfied(optDiscardSpec.groups, optDiscardNums, battleCardMap);
              // ⚠**コスト計算は `spellUseGate.computeSpellEffectiveCost` 1本**（§8 `O-1` (b)）＝
              //   提示ゲート（手札の「発動」ボタン）と CPU の候補フィルタも同じ関数を通る。
              //   ここに式を写経すると「一覧では使えるのに払えない／請求額が食い違う」に戻る（PLAN §4 教訓 (d)）。
              //   含まれるもの＝条件つき軽減／場の CONTINUOUS 軽減／次スペル軽減（`WX04-008`）／
              //   カード名指定軽減（タスク12(xci)）／メルト・ファクトの事前ウィルス除去。
              let effSpellCost = myArtsPayerCtx
                ? computeSpellEffectiveCost({
                    card: spellCard, my, op, cardMap: battleCardMap, effectsMap, payer: myArtsPayerCtx,
                    paidOptionalDiscard: optDiscardPaid,
                    virusRemovalByZone: pendingSpellCast.virusRemovalByZone,
                  })
                : spellCard.Cost;
              const meltFactVirusCount = pendingSpellCast.cardNum.startsWith('WX15-067')
                ? (pendingSpellCast.virusRemovalByZone ?? []).reduce((sum, n) => sum + n, 0)
                : 0;
              // 使用時の任意支払いによるコスト**軽減**（タスク12(lxxxv)）＝選択枚数に追従して差し引く。
              const useCostSpec = resolveUseTimeCost(spellCard.CardNum, effectsMap);
              const useCostCands = useCostSpec
                ? getTimeCostCandidates(useCostSpec, my, battleCardMap, pendingSpellCast.handIndex) : [];
              const useCostBefore = effSpellCost;
              const useCostIncomplete = !!useCostSpec && selectedSpellUseCostPay.size > 0
                && !isTimeCostSelectionValid(useCostSpec, selectedSpellUseCostPay, useCostCands.length);
              if (useCostSpec) {
                effSpellCost = applyUseTimeCostReduction(effSpellCost, useCostSpec, selectedSpellUseCostPay.size);
              }
              const costItems = parseGrowCost(effSpellCost);
              const baseSpellReq = costItems.reduce((s, c) => s + c.count, 0);
              const selectedNums = [...selectedSpellCost].map(i => myEnergyPayPool[i].cardNum);
              // 追加コスト（CONTINUOUS の増加ぶん＋`FIRST_SPELL_COST_UP`）も gate と同じ1本を通す。
              const allExtraSpellCosts = myArtsPayerCtx
                ? spellExtraCosts({ my, op, payer: myArtsPayerCtx, effectsMap }) : [];
              // 表示用（「初回」バッジ）だけに使う内訳＝`FIRST_SPELL_COST_UP` のぶん。
              const firstSpellExtra = !my.actions_done?.includes('USE_SPELL')
                ? collectFirstSpellCostUp(op, effectsMap) : 0;
              const totalReq = baseSpellReq + allExtraSpellCosts.reduce((s, c) => s + c.count, 0);
              const isValid = totalReq === 0 ||
                (selectedSpellCost.size === totalReq &&
                  canAffordWithExtraCost(selectedNums, battleCards, effSpellCost, allExtraSpellCosts, my.keyword_grants, myEnaAllMulti, myEnaMultiStripped, myColorlessOverrides, myColorSubs, myEnergyExtraColors));
              return (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <button onClick={() => { setPendingSpellCast(null); setSelectedSpellCost(new Set()); setSelectedSpellUseCostPay(new Set()); setBetAmount(0); }}
                      style={{ padding: '4px 10px', borderRadius: 6, border: C.borderUI,
                        backgroundColor: 'transparent', color: C.textDim, cursor: 'pointer', fontSize: 12 }}>
                      ← キャンセル
                    </button>
                    <p style={{ color: C.textSub, fontSize: 14, fontWeight: 'bold', margin: 0 }}>
                      スペル発動
                    </p>
                  </div>
                  {pendingSpellCast.cardNum.startsWith('WX15-067') && (
                    <div style={{ padding: '8px 10px', borderRadius: 8, border: C.borderUI, display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <p style={{ color: C.text, fontSize: 12, margin: 0 }}>
                        相手の場の【ウィルス】を取り除く（任意）: {meltFactVirusCount}個
                      </p>
                      {(op.field.signi_virus ?? [0, 0, 0]).map((available, zoneIdx) => {
                        const selected = pendingSpellCast.virusRemovalByZone?.[zoneIdx] ?? 0;
                        return (
                          <div key={zoneIdx} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <span style={{ color: C.textDim, fontSize: 11 }}>シグニゾーン{zoneIdx + 1}（{available}個）</span>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <button onClick={() => setPendingSpellCast(prev => {
                                if (!prev) return prev;
                                const next = [...(prev.virusRemovalByZone ?? [0, 0, 0])];
                                next[zoneIdx] = Math.max(0, selected - 1);
                                setSelectedSpellCost(new Set());
                                return { ...prev, virusRemovalByZone: next };
                              })} disabled={selected === 0}>－</button>
                              <span style={{ color: C.text, fontSize: 12 }}>{selected}</span>
                              <button onClick={() => setPendingSpellCast(prev => {
                                if (!prev) return prev;
                                const next = [...(prev.virusRemovalByZone ?? [0, 0, 0])];
                                next[zoneIdx] = Math.min(available, selected + 1);
                                setSelectedSpellCost(new Set());
                                return { ...prev, virusRemovalByZone: next };
                              })} disabled={selected >= available}>＋</button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <img src={spellCard.ImgURL} alt={spellCard.CardName}
                      style={{ width: 36, height: 50, objectFit: 'cover', borderRadius: 3, flexShrink: 0 }}
                      onError={e => { const img = e.target as HTMLImageElement; if (!img.src.endsWith('/ErrerCard.webp')) img.src = '/ErrerCard.webp'; }} />
                    <div>
                      <p style={{ color: C.text, fontSize: 12, fontWeight: 'bold', margin: '0 0 2px' }}>{spellCard.CardName}</p>
                      <p style={{ color: C.textDim, fontSize: 11, margin: 0 }}>
                        コスト: {optDiscardPaid
                          ? <><s style={{ color: C.textFaint }}>{spellCard.Cost || 'なし'}</s> → {effSpellCost}</>
                          : (spellCard.Cost || 'なし')}
                      </p>
                    </div>
                  </div>
                  {optDiscardSpec && (
                    <div style={{ padding: '8px 10px', borderRadius: 8,
                      border: optDiscardPaid ? '2px solid #66dd88' : C.borderUI,
                      backgroundColor: optDiscardPaid ? 'rgba(40,150,80,0.15)' : C.bgButton,
                      display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <p style={{ color: optDiscardPaid ? '#88ffaa' : C.text, fontSize: 12, margin: 0 }}>
                        使用時の任意支払い（捨てると使用コストが {optDiscardSpec.replacement} になる）:
                        {' '}{optDiscardSpec.groups.map(g => `${g.color}の＜${g.story}＞×${g.count}`).join('・')}
                      </p>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, overflowY: 'auto', maxHeight: 160 }}>
                        {my.hand.map((num, i) => {
                          if (i === pendingSpellCast.handIndex) return null; // 使用するスペル自身は捨てられない
                          const cand = optDiscardSpec.groups.some(g => matchesOptionalDiscardGroup(num, g, battleCardMap));
                          if (!cand) return null;
                          const c = battleCardMap.get(num);
                          const isSel = selectedSpellDiscard.has(i);
                          return (
                            <div key={i} data-testid={`spelldiscard-hand-${i}`}
                              onClick={() => { setSelectedSpellDiscard(prev => {
                                const next = new Set(prev);
                                if (next.has(i)) next.delete(i); else next.add(i);
                                return next;
                              }); setSelectedSpellCost(new Set()); }}
                              onPointerDown={() => { pickLongPressTimer.current = setTimeout(() => { setExpandedPickImgUrl(c?.ImgURL ?? null); }, 500); }}
                              onPointerUp={() => { if (pickLongPressTimer.current) { clearTimeout(pickLongPressTimer.current); pickLongPressTimer.current = null; } }}
                              onPointerLeave={() => { if (pickLongPressTimer.current) { clearTimeout(pickLongPressTimer.current); pickLongPressTimer.current = null; } }}
                              onContextMenu={e => e.preventDefault()}
                              style={{ position: 'relative', width: 44, height: 62, borderRadius: 3, flexShrink: 0,
                                border: isSel ? '2px solid #66dd88' : C.borderCard, cursor: 'pointer', overflow: 'hidden' }}>
                              {c
                                ? <img src={c.ImgURL} alt={c.CardName} draggable={false}
                                    style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                : <div style={{ width: '100%', height: '100%', backgroundColor: C.bgButton,
                                    display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <span style={{ fontSize: 7, color: C.textFaint }}>{num}</span>
                                  </div>
                              }
                              {isSel && (
                                <div style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(40,150,80,0.4)',
                                  display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                  <span style={{ color: '#fff', fontSize: 18, fontWeight: 'bold' }}>✓</span>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                      {!optDiscardPaid && selectedSpellDiscard.size > 0 && (
                        <p style={{ color: C.warn, fontSize: 10, margin: 0 }}>組が揃っていません（支払わずに発動もできます）</p>
                      )}
                    </div>
                  )}
                  {useCostSpec && (
                    <UseCostPaymentPanel spec={useCostSpec} candidates={useCostCands}
                      selected={selectedSpellUseCostPay} setSelected={setSelectedSpellUseCostPay}
                      onChange={() => setSelectedSpellCost(new Set())}
                      cardMap={battleCardMap} costBefore={useCostBefore} costAfter={effSpellCost}
                      incomplete={useCostIncomplete} />
                  )}
                  {totalReq > 0 && (
                    <>
                      <p style={{ color: isValid ? C.success : C.textMuted, fontSize: 12, margin: 0, textAlign: 'center' }}>
                        エナから選択: {selectedSpellCost.size} / {totalReq}枚
                        {costItems.map((c, i) => (
                          <span key={i} style={{ marginLeft: 6, color: C.textDim }}>({c.color}×{c.count})</span>
                        ))}
                        {firstSpellExtra > 0 && (
                          <span style={{ marginLeft: 6, color: C.warn }}>(+《無》×{firstSpellExtra} 初回)</span>
                        )}
                      </p>
                      <div style={{ overflowY: 'auto', display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center' }}>
                        {myEnergyPayPool.map((payEntry, i) => {
                          const num = payEntry.cardNum;
                          const card = battleCardMap.get(num);
                          const isSel = selectedSpellCost.has(i);
                          const isWild = isMultiEna(num, battleCards, my.keyword_grants, myEnaAllMulti, myEnaMultiStripped);
                          return (
                            <div key={i} title={energyPayEntryLabel(payEntry, battleCardMap) ?? undefined} data-testid={`spellcost-energy-${i}`} onClick={() => toggleSpellCostCard(i)}
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
                  {(() => {
                    const betSpecSp = betOptionsOf(spellCard.CardNum, effectsMap);
                    if (!betSpecSp.variable && betSpecSp.options.length === 0) return null;
                    const betBlockedSp = isActionBlocked('BET') || !!my.negate_coin_abilities;
                    const betOptionsSp = betSpecSp.variable
                      ? Array.from({ length: Math.min(5, my.coins) }, (_, i) => i + 1)
                      : betSpecSp.options;
                    return (
                      <div style={{ padding: '8px 12px', borderRadius: 8, border: betAmount > 0 ? `2px solid ${C.coin}` : C.borderUI,
                        backgroundColor: betAmount > 0 ? 'rgba(204,136,0,0.15)' : C.bgButton, display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <span style={{ fontSize: 13, color: betAmount > 0 ? C.coin : C.text }}>
                            ベット{betSpecSp.variable ? '（好きな枚数）' : betSpecSp.options.length > 1 ? '（段階）' : `（コイン${betSpecSp.options[0]}枚）`}
                          </span>
                          <span style={{ fontSize: 11, color: C.coin }}>選択: {betAmount}枚 / 所持: {my.coins}枚</span>
                        </div>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          <button onClick={() => setBetAmount(0)} disabled={betBlockedSp}
                            style={{ padding: '4px 10px', borderRadius: 6, fontSize: 12, cursor: betBlockedSp ? 'default' : 'pointer',
                              border: betAmount === 0 ? `2px solid ${C.coin}` : C.borderUI,
                              backgroundColor: betAmount === 0 ? 'rgba(204,136,0,0.2)' : 'transparent',
                              color: betAmount === 0 ? C.coin : C.textDim }}>OFF</button>
                          {betOptionsSp.map(n => {
                            const affordableSp = !betBlockedSp && n <= my.coins;
                            const selSp = betAmount === n;
                            return (
                              <button key={n} onClick={() => { if (affordableSp || selSp) setBetAmount(selSp ? 0 : n); }}
                                disabled={!affordableSp && !selSp}
                                style={{ padding: '4px 10px', borderRadius: 6, fontSize: 12,
                                  cursor: (affordableSp || selSp) ? 'pointer' : 'default',
                                  border: selSp ? `2px solid ${C.coin}` : C.borderUI,
                                  backgroundColor: selSp ? 'rgba(204,136,0,0.2)' : 'transparent',
                                  color: selSp ? C.coin : (affordableSp ? C.text : C.textFaint) }}>{n}枚</button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })()}
                  {/* ⚠支払いが揃っていない選択は**捨てない**（コストも置換されていない）＝半端な支払いで手札を失わせない */}
                  <button onClick={() => castSpell(spellCard, selectedSpellCost, pendingSpellCast.handIndex, pendingSpellCast.fromLrigDeck, betAmount, pendingSpellCast.virusRemovalByZone, optDiscardPaid ? selectedSpellDiscard : new Set(), useCostIncomplete ? new Set() : selectedSpellUseCostPay)}
                    disabled={loading || !isValid}
                    style={{ padding: '11px 0', borderRadius: 8, border: 'none',
                      backgroundColor: isValid ? C.accent : C.disabled,
                      color: C.text, fontSize: 14, fontWeight: 'bold',
                      cursor: (loading || !isValid) ? 'default' : 'pointer' }}>
                    {betAmount > 0 ? `発動する（ベット${betAmount}枚）` : '発動する'}
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
