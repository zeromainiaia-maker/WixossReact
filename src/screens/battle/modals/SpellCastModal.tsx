// スペル発動コスト選択モーダル。BattleScreen.tsx から Stage 1 で抽出。
import type { Dispatch, SetStateAction } from 'react';
import { createPortal } from 'react-dom';
import type { CardData } from '../../../types';
import { collectFirstSpellCostUp } from '../../../engine/effectEngine';
import { C } from '../../../components/BoardComponents';
import { applyContinuousCostDecreases, computeArtsEffectiveCost, removeNColorFromCost, parseGrowCost, canAffordWithExtraCost, isMultiEna, parseBetOptions } from '../costs';
import type { BattleModalCtx } from './types';

interface SpellCastModalProps {
  ctx: BattleModalCtx;
  pendingSpellCast: { cardNum: string; handIndex: number; fromLrigDeck?: boolean } | null;
  setPendingSpellCast: Dispatch<SetStateAction<{ cardNum: string; handIndex: number; fromLrigDeck?: boolean } | null>>;
  selectedSpellCost: Set<number>;
  setSelectedSpellCost: Dispatch<SetStateAction<Set<number>>>;
  betAmount: number;
  setBetAmount: Dispatch<SetStateAction<number>>;
  toggleSpellCostCard: (idx: number) => void;
  castSpell: (card: CardData, costIndices: Set<number>, handIdx: number, fromLrigDeck?: boolean, betCoins?: number) => void;
}

export function SpellCastModal(p: SpellCastModalProps) {
  const { my, op, loading, battleCards, battleCardMap, effectsMap, myEnaAllMulti, myColorlessOverrides, myColorSubs, myEnergyExtraColors, activeCostMods, myLrigNameAliases, isActionBlocked, pickLongPressTimer, setExpandedPickImgUrl } = p.ctx;
  const { pendingSpellCast, setPendingSpellCast, selectedSpellCost, setSelectedSpellCost, betAmount, setBetAmount, toggleSpellCostCard, castSpell } = p;
  return (
    <>
      {pendingSpellCast && createPortal(
        <div onClick={() => { setPendingSpellCast(null); setSelectedSpellCost(new Set()); setBetAmount(0); }}
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
              // フィールド条件によるコスト軽減をスペルにも適用
              const myLrigCardSP = battleCardMap.get(my.field.lrig.at(-1) ?? '');
              let effSpellCost = applyContinuousCostDecreases(
                computeArtsEffectiveCost(spellCard, my, myLrigCardSP?.CardName, battleCardMap.get(op.field.lrig.at(-1) ?? '')?.Color ?? '', myLrigCardSP ? parseInt(myLrigCardSP.Level ?? '0') : 0, battleCardMap, myLrigNameAliases),
                'スペル', spellCard.Color, activeCostMods.forMy);
              // 次スペルコスト軽減（WX04-008《白×2》減）を適用
              for (const r of my.next_spell_cost_reduction ?? []) effSpellCost = removeNColorFromCost(effSpellCost, r.color, r.count);
              const costItems = parseGrowCost(effSpellCost);
              const baseSpellReq = costItems.reduce((s, c) => s + c.count, 0);
              const selectedNums = [...selectedSpellCost].map(i => my.energy[i]);
              const extraSpellCosts = activeCostMods.forMy
                .filter(m => m.direction === 'increase' && m.targetCardType === 'スペル')
                .flatMap(m => m.amount);
              // FIRST_SPELL_COST_UP: 相手フィールドが持つ場合、最初のスペルに《無×1》追加
              const firstSpellExtra = !my.actions_done?.includes('USE_SPELL')
                ? collectFirstSpellCostUp(op, effectsMap)
                : 0;
              const firstSpellExtraCosts: { color: string; count: number }[] =
                firstSpellExtra > 0 ? [{ color: '無', count: firstSpellExtra }] : [];
              const allExtraSpellCosts = [...extraSpellCosts, ...firstSpellExtraCosts];
              const totalReq = baseSpellReq + firstSpellExtra;
              const isValid = totalReq === 0 ||
                (selectedSpellCost.size === totalReq &&
                  canAffordWithExtraCost(selectedNums, battleCards, effSpellCost, allExtraSpellCosts, my.keyword_grants, myEnaAllMulti, myColorlessOverrides, myColorSubs, myEnergyExtraColors));
              return (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <button onClick={() => { setPendingSpellCast(null); setSelectedSpellCost(new Set()); setBetAmount(0); }}
                      style={{ padding: '4px 10px', borderRadius: 6, border: C.borderUI,
                        backgroundColor: 'transparent', color: C.textDim, cursor: 'pointer', fontSize: 12 }}>
                      ← キャンセル
                    </button>
                    <p style={{ color: C.textSub, fontSize: 14, fontWeight: 'bold', margin: 0 }}>
                      スペル発動
                    </p>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <img src={spellCard.ImgURL} alt={spellCard.CardName}
                      style={{ width: 36, height: 50, objectFit: 'cover', borderRadius: 3, flexShrink: 0 }}
                      onError={e => { const img = e.target as HTMLImageElement; if (!img.src.endsWith('/ErrerCard.webp')) img.src = '/ErrerCard.webp'; }} />
                    <div>
                      <p style={{ color: C.text, fontSize: 12, fontWeight: 'bold', margin: '0 0 2px' }}>{spellCard.CardName}</p>
                      <p style={{ color: C.textDim, fontSize: 11, margin: 0 }}>コスト: {spellCard.Cost || 'なし'}</p>
                    </div>
                  </div>
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
                        {my.energy.map((num, i) => {
                          const card = battleCardMap.get(num);
                          const isSel = selectedSpellCost.has(i);
                          const isWild = isMultiEna(num, battleCards, my.keyword_grants, myEnaAllMulti);
                          return (
                            <div key={i} data-testid={`spellcost-energy-${i}`} onClick={() => toggleSpellCostCard(i)}
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
                    const betSpecSp = parseBetOptions(spellCard.EffectText ?? '');
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
                  <button onClick={() => castSpell(spellCard, selectedSpellCost, pendingSpellCast.handIndex, pendingSpellCast.fromLrigDeck, betAmount)}
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
