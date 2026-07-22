// アーツ使用モーダル（Phase1: アーツ選択 → Phase2: コスト支払い＋ベット/アンコール/キー代替）。BattleScreen.tsx から Stage 1 で抽出。
import { createPortal } from 'react-dom';
import type { Dispatch, SetStateAction } from 'react';
import type { CardData } from '../../../types';
import { splitColors } from '../../../engine/execUtils';
import { C } from '../../../components/BoardComponents';
import { applyContinuousCostDecreases, computeArtsEffectiveCost, canAffordWithExtraCost, parseGrowCost, parseBetOptions, parseEncoreCost, isMultiEna } from '../costs';
import type { BattleModalCtx } from './types';

interface ArtsModalProps {
  ctx: BattleModalCtx;
  showArtsModal: boolean;
  setShowArtsModal: Dispatch<SetStateAction<boolean>>;
  pendingArtsCard: CardData | null;
  setPendingArtsCard: Dispatch<SetStateAction<CardData | null>>;
  pendingArtsEffectiveCost: string | null;
  setPendingArtsEffectiveCost: Dispatch<SetStateAction<string | null>>;
  selectedArtsCost: Set<number>;
  setSelectedArtsCost: Dispatch<SetStateAction<Set<number>>>;
  selectedArtsDiscard: Set<number>;
  setSelectedArtsDiscard: Dispatch<SetStateAction<Set<number>>>;
  betAmount: number;
  setBetAmount: Dispatch<SetStateAction<number>>;
  isEncore: boolean;
  setIsEncore: Dispatch<SetStateAction<boolean>>;
  keySubstituteEnabled: boolean;
  setKeySubstituteEnabled: Dispatch<SetStateAction<boolean>>;
  artsCandidates: CardData[];
  executeArts: (card: CardData, costIndices: Set<number>, betCoins?: number, encore?: boolean, discardIndices?: Set<number>, useKeySub?: boolean) => void;
  toggleArtsCostCard: (idx: number) => void;
}

export function ArtsModal(p: ArtsModalProps) {
  const { my, op, loading, battleCards, battleCardMap, effectsMap, myEnaAllMulti, myEnaMultiStripped, myColorlessOverrides, myColorSubs, myEnergyExtraColors, myEnergyTrashSubInfo, activeCostMods, myLrigNameAliases, myArtsThresholdReductions, isActionBlocked, pickLongPressTimer, setExpandedPickImgUrl } = p.ctx;
  const { showArtsModal, setShowArtsModal, pendingArtsCard, setPendingArtsCard, pendingArtsEffectiveCost, setPendingArtsEffectiveCost, selectedArtsCost, setSelectedArtsCost, selectedArtsDiscard, setSelectedArtsDiscard, betAmount, setBetAmount, isEncore, setIsEncore, keySubstituteEnabled, setKeySubstituteEnabled, artsCandidates, executeArts, toggleArtsCostCard } = p;
  return (
    <>
      {showArtsModal && createPortal(
        <div onClick={() => { setShowArtsModal(false); setPendingArtsCard(null); setSelectedArtsCost(new Set()); setBetAmount(0); setIsEncore(false); setKeySubstituteEnabled(false); }}
          style={{ position: 'fixed', inset: 0, zIndex: 3500,
            backgroundColor: 'rgba(0,0,0,0.92)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            padding: 20 }}>
          <div onClick={e => e.stopPropagation()}
            style={{ backgroundColor: C.bgModal, border: C.borderUI, borderRadius: 12,
              padding: '20px 16px', width: 'min(92vw, 360px)', maxHeight: '85vh',
              display: 'flex', flexDirection: 'column', gap: 12 }}>

            {!pendingArtsCard ? (
              /* Phase 1: アーツ選択 */
              <>
                <p style={{ color: C.textSub, fontSize: 15, fontWeight: 'bold', margin: 0, textAlign: 'center' }}>
                  アーツを選択
                </p>
                <div style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {(() => {
                    const myLrigCard = battleCardMap.get(my.field.lrig.at(-1) ?? '');
                    const myLrigName = myLrigCard?.CardName;
                    const myLrigLevel = myLrigCard ? parseInt(myLrigCard.Level ?? '0') : 0;
                    const oppLrigColor = battleCardMap.get(op.field.lrig.at(-1) ?? '')?.Color ?? '';
                    return artsCandidates.map(card => {
                    const effCost = applyContinuousCostDecreases(
                      computeArtsEffectiveCost(card, my, myLrigName, oppLrigColor, myLrigLevel, battleCardMap, myLrigNameAliases, myArtsThresholdReductions),
                      'アーツ', card.Color, activeCostMods.forMy);
                    const extraArtsCosts = activeCostMods.forMy
                      .filter(m => m.direction === 'increase' && m.targetCardType === 'アーツ')
                      .flatMap(m => m.amount);
                    const canAfford = canAffordWithExtraCost(my.energy, battleCards, effCost, extraArtsCosts, my.keyword_grants, myEnaAllMulti, myEnaMultiStripped, myColorlessOverrides, myColorSubs, myEnergyExtraColors);
                    const totalReq = parseGrowCost(effCost).reduce((s, c) => s + c.count, 0);
                    const betSpecBadge = parseBetOptions(card.EffectText ?? '');
                    const betBadge = betSpecBadge.variable ? 'ベット: 好きな枚数'
                      : betSpecBadge.options.length > 1 ? `ベット: ${betSpecBadge.options.join('か')}枚`
                      : betSpecBadge.options.length === 1 ? `ベット: コイン${betSpecBadge.options[0]}枚` : '';
                    const costReduced = effCost !== card.Cost;
                    return (
                      <button key={card.CardNum}
                        onClick={() => {
                          if (!canAfford) return;
                          setBetAmount(0);
                          if (totalReq === 0) { executeArts(card, new Set()); }
                          else {
                            setPendingArtsCard(card);
                            setPendingArtsEffectiveCost(costReduced ? effCost : null);
                            setSelectedArtsCost(new Set());
                          }
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
                          <p style={{ color: C.text, fontSize: 13, fontWeight: 'bold', margin: '0 0 2px' }}>
                            {card.CardName}
                          </p>
                          <p style={{ color: C.textDim, fontSize: 11, margin: '0 0 2px' }}>
                            コスト: {costReduced ? <><s style={{ color: C.textFaint }}>{card.Cost}</s> → {effCost}</> : (card.Cost || 'なし')}
                          </p>
                          <p style={{ color: C.textFaint, fontSize: 10, margin: 0 }}>
                            {card.Timing}
                          </p>
                          {betBadge && (
                            <p style={{ color: C.coin, fontSize: 10, margin: '2px 0 0' }}>
                              {betBadge}
                            </p>
                          )}
                          {(() => {
                            const encoreCost = parseEncoreCost(card.EffectText ?? '');
                            if (!encoreCost) return null;
                            const encoreEnaStr = encoreCost.energy.map(e => `《${e.color}》${e.count > 1 ? `×${e.count}` : ''}`).join('');
                            const encoreCoinStr = encoreCost.coins > 0 ? ` コイン${encoreCost.coins}枚` : '';
                            return (
                              <p style={{ color: '#88ddff', fontSize: 10, margin: '2px 0 0' }}>
                                アンコール: {encoreEnaStr}{encoreCoinStr}
                              </p>
                            );
                          })()}
                          {!canAfford && (
                            <p style={{ color: C.danger, fontSize: 10, margin: '2px 0 0' }}>エナ不足</p>
                          )}
                        </div>
                      </button>
                    );
                  });
                  })()}
                </div>
                <button onClick={() => { setShowArtsModal(false); setPendingArtsCard(null); setPendingArtsEffectiveCost(null); setSelectedArtsCost(new Set()); setBetAmount(0); }}
                  style={{ padding: '8px 0', borderRadius: 8, border: C.borderUI,
                    backgroundColor: 'transparent', color: C.textDim, cursor: 'pointer', fontSize: 13 }}>
                  キャンセル
                </button>
              </>
            ) : (() => {
              /* Phase 2: コスト支払いカード選択 */
              const rawEffectiveCost = pendingArtsEffectiveCost ?? pendingArtsCard.Cost;
              // ARTS_COLORLESS_MUST_PAY_CENTER_COLOR: 《無》コストをセンタールリグ色で支払わなければならない
              const hasColorlessRestriction = (effectsMap.get(pendingArtsCard.CardNum) ?? [])
                .some(e => e.effectType === 'ACTIVATED' && JSON.stringify(e.action).includes('ARTS_COLORLESS_MUST_PAY_CENTER_COLOR'));
              // Color列は「黒青」のような連結形式（'/'区切りではない）のため splitColors で分解する
              const centerColorForRestr = hasColorlessRestriction
                ? splitColors(battleCardMap.get(my.field.lrig.at(-1) ?? '')?.Color)[0] ?? ''
                : '';
              const effectiveCost = hasColorlessRestriction && centerColorForRestr
                ? rawEffectiveCost.replace(/《無》/g, `《${centerColorForRestr}》`)
                : rawEffectiveCost;
              const costItems = parseGrowCost(effectiveCost);
              const encoreCostForCard = parseEncoreCost(pendingArtsCard.EffectText ?? '');
              const encoreExtraEna: { color: string; count: number }[] = encoreCostForCard?.energy ?? [];
              const keySubCount = keySubstituteEnabled && myEnergyTrashSubInfo.keySubInstId ? 2 : 0;
              const baseReq = costItems.reduce((s, c) => s + c.count, 0) +
                (isEncore ? encoreExtraEna.reduce((s, e) => s + e.count, 0) : 0);
              const totalReq = Math.max(0, baseReq - keySubCount);
              const selectedNums = [...selectedArtsCost].map(i => my.energy[i]);
              const extraArtsCosts = activeCostMods.forMy
                .filter(m => m.direction === 'increase' && m.targetCardType === 'アーツ')
                .flatMap(m => m.amount);
              const artsDiscardCost = (effectsMap.get(pendingArtsCard.CardNum) ?? [])
                .filter(e => e.effectType === 'ACTIVATED')
                .reduce((sum, e) => sum + (e.cost?.discard ?? 0), 0);
              const energyValid = selectedArtsCost.size === totalReq &&
                canAffordWithExtraCost(selectedNums, battleCards, effectiveCost, extraArtsCosts, my.keyword_grants, myEnaAllMulti, myEnaMultiStripped, myColorlessOverrides, myColorSubs, myEnergyExtraColors, myEnergyTrashSubInfo.wildcardInstIds, myEnergyTrashSubInfo.colorOverrideMap, keySubCount) &&
                (!isEncore || encoreExtraEna.every(req =>
                  selectedNums.filter(n => {
                    const c = battleCardMap.get(n);
                    return c?.Color?.includes(req.color) || isMultiEna(n, battleCards, my.keyword_grants, myEnaAllMulti, myEnaMultiStripped);
                  }).length >= req.count
                ));
              const isValid = energyValid && selectedArtsDiscard.size >= artsDiscardCost;
              const betSpec = parseBetOptions(pendingArtsCard.EffectText ?? '');
              const encoreCoins = encoreCostForCard?.coins ?? 0;
              const betReservedForEncore = isEncore ? encoreCoins : 0;
              // ベットで選べるコイン枚数（固定/段階/可変）。アンコール併用時はその分を残す
              const betOptions: number[] = betSpec.variable
                ? Array.from({ length: Math.max(0, Math.min(5, my.coins) - betReservedForEncore) }, (_, i) => i + 1)
                : betSpec.options;
              const betBlocked = isActionBlocked('BET') || !!my.negate_coin_abilities;
              const canBet = !betBlocked && betOptions.some(n => n > 0 && n + betReservedForEncore <= my.coins);
              const canEncore = !!encoreCostForCard && (encoreCoins === 0 || my.coins >= encoreCoins + betAmount) && !isActionBlocked('ENCORE');
              return (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <button onClick={() => { setShowArtsModal(false); setPendingArtsCard(null); setPendingArtsEffectiveCost(null); setSelectedArtsCost(new Set()); setBetAmount(0); setIsEncore(false); setKeySubstituteEnabled(false); }}
                      style={{ padding: '4px 10px', borderRadius: 6, border: C.borderUI,
                        backgroundColor: 'transparent', color: C.textDim, cursor: 'pointer', fontSize: 12 }}>
                      ← 戻る
                    </button>
                    <p style={{ color: C.textSub, fontSize: 14, fontWeight: 'bold', margin: 0 }}>
                      コストを選択
                    </p>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <img src={pendingArtsCard.ImgURL} alt={pendingArtsCard.CardName}
                      style={{ width: 36, height: 50, objectFit: 'cover', borderRadius: 3, flexShrink: 0 }}
                      onError={e => { const img = e.target as HTMLImageElement; if (!img.src.endsWith('/ErrerCard.webp')) img.src = '/ErrerCard.webp'; }} />
                    <div>
                      <p style={{ color: C.text, fontSize: 12, fontWeight: 'bold', margin: '0 0 2px' }}>
                        {pendingArtsCard.CardName}
                      </p>
                      <p style={{ color: C.textDim, fontSize: 11, margin: 0 }}>
                        コスト: {pendingArtsEffectiveCost ?? pendingArtsCard.Cost}
                      </p>
                    </div>
                  </div>
                  {(betSpec.variable || betSpec.options.length > 0) && (
                    <div style={{ padding: '8px 12px', borderRadius: 8, border: betAmount > 0 ? `2px solid ${C.coin}` : C.borderUI,
                      backgroundColor: betAmount > 0 ? 'rgba(204,136,0,0.15)' : C.bgButton, display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: 13, color: betAmount > 0 ? C.coin : C.text }}>
                          ベット{betSpec.variable ? '（好きな枚数）' : betSpec.options.length > 1 ? '（段階）' : `（コイン${betSpec.options[0]}枚）`}
                        </span>
                        <span style={{ fontSize: 11, color: canBet || betAmount > 0 ? C.coin : C.danger }}>
                          選択: {betAmount}枚 / 所持: {my.coins}枚
                        </span>
                      </div>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        <button onClick={() => setBetAmount(0)} disabled={betBlocked}
                          style={{ padding: '4px 10px', borderRadius: 6, fontSize: 12, cursor: betBlocked ? 'default' : 'pointer',
                            border: betAmount === 0 ? `2px solid ${C.coin}` : C.borderUI,
                            backgroundColor: betAmount === 0 ? 'rgba(204,136,0,0.2)' : 'transparent',
                            color: betAmount === 0 ? C.coin : C.textDim }}>
                          OFF
                        </button>
                        {betOptions.map(n => {
                          const affordable = !betBlocked && n + betReservedForEncore <= my.coins;
                          const sel = betAmount === n;
                          return (
                            <button key={n} onClick={() => { if (affordable || sel) setBetAmount(sel ? 0 : n); }}
                              disabled={!affordable && !sel}
                              style={{ padding: '4px 10px', borderRadius: 6, fontSize: 12,
                                cursor: (affordable || sel) ? 'pointer' : 'default',
                                border: sel ? `2px solid ${C.coin}` : C.borderUI,
                                backgroundColor: sel ? 'rgba(204,136,0,0.2)' : 'transparent',
                                color: sel ? C.coin : (affordable ? C.text : C.textFaint) }}>
                              {n}枚
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  {encoreCostForCard && (
                    <button
                      onClick={() => { if (canEncore || isEncore) setIsEncore(b => !b); }}
                      disabled={!canEncore && !isEncore}
                      style={{ padding: '8px 12px', borderRadius: 8,
                        border: isEncore ? '2px solid #88ddff' : C.borderUI,
                        backgroundColor: isEncore ? 'rgba(0,100,180,0.15)' : C.bgButton,
                        color: isEncore ? '#88ddff' : (canEncore ? C.text : C.textFaint),
                        cursor: (canEncore || isEncore) ? 'pointer' : 'default',
                        fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span>アンコール（ルリグデッキに戻す）</span>
                      <span style={{ fontSize: 11 }}>
                        {isEncore ? 'ON' : 'OFF'}
                        {encoreCostForCard.coins > 0 && ` / コイン${encoreCostForCard.coins}枚`}
                      </span>
                    </button>
                  )}
                  {/* キーピース代替トグル */}
                  {myEnergyTrashSubInfo.keySubInstId && baseReq > 0 && (
                    <button
                      onClick={() => { setKeySubstituteEnabled(v => !v); setSelectedArtsCost(new Set()); }}
                      style={{ padding: '6px 10px', borderRadius: 6, border: keySubstituteEnabled ? '2px solid #ff9800' : C.borderUI,
                        backgroundColor: keySubstituteEnabled ? 'rgba(255,152,0,0.2)' : 'transparent',
                        color: C.text, fontSize: 11, cursor: 'pointer', textAlign: 'left' }}>
                      {keySubstituteEnabled ? '✓ ' : ''}キー代替: {battleCardMap.get(myEnergyTrashSubInfo.keySubInstId)?.CardName ?? 'キー'} をルリグTへ (エナ2任意色分)
                    </button>
                  )}
                  <p style={{ color: isValid ? C.success : C.textMuted, fontSize: 12, margin: 0, textAlign: 'center' }}>
                    エナから選択: {selectedArtsCost.size} / {totalReq}枚
                    {costItems.map((c, i) => (
                      <span key={i} style={{ marginLeft: 6, color: C.textDim }}>({c.color}×{c.count})</span>
                    ))}
                    {isEncore && encoreExtraEna.map((e, i) => (
                      <span key={`enc${i}`} style={{ marginLeft: 6, color: '#88ddff' }}>+({e.color}×{e.count})</span>
                    ))}
                  </p>
                  <div style={{ overflowY: 'auto', display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center' }}>
                    {my.energy.length === 0 ? (
                      <p style={{ color: C.textFaint, fontSize: 12, margin: '8px 0' }}>エナがありません</p>
                    ) : my.energy.map((num, i) => {
                      const card = battleCardMap.get(num);
                      const isSel = selectedArtsCost.has(i);
                      const isWild = isMultiEna(num, battleCards, my.keyword_grants, myEnaAllMulti, myEnaMultiStripped);
                      const isTrashWild = myEnergyTrashSubInfo.wildcardInstIds.has(num);
                      const trashColor = myEnergyTrashSubInfo.colorOverrideMap.get(num);
                      const borderColor = isSel ? '#f44336' : isTrashWild ? '#4caf50' : trashColor ? '#9c27b0' : isWild ? '#ffcc00' : undefined;
                      return (
                        <div key={i} data-testid={`artscost-energy-${i}`} onClick={() => toggleArtsCostCard(i)}
                          onPointerDown={() => { pickLongPressTimer.current = setTimeout(() => { setExpandedPickImgUrl(card?.ImgURL ?? null); }, 500); }}
                          onPointerUp={() => { if (pickLongPressTimer.current) { clearTimeout(pickLongPressTimer.current); pickLongPressTimer.current = null; } }}
                          onPointerLeave={() => { if (pickLongPressTimer.current) { clearTimeout(pickLongPressTimer.current); pickLongPressTimer.current = null; } }}
                          onContextMenu={e => e.preventDefault()}
                          style={{ position: 'relative', width: 52, height: 73, borderRadius: 4,
                            overflow: 'hidden', cursor: 'pointer', flexShrink: 0,
                            border: borderColor ? `${isSel ? '2px' : '1px'} solid ${borderColor}` : C.borderCard }}>
                          {card ? (
                            <img src={card.ImgURL} alt={card.CardName} draggable={false}
                              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                              onError={e => { const img = e.target as HTMLImageElement; if (!img.src.endsWith('/ErrerCard.webp')) img.src = '/ErrerCard.webp'; }} />
                          ) : (
                            <div style={{ width: '100%', height: '100%', backgroundColor: C.bgButton,
                              display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              <span style={{ fontSize: 8, color: C.textFaint }}>{num}</span>
                            </div>
                          )}
                          {!isSel && (isTrashWild || trashColor || isWild) && (
                            <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0,
                              backgroundColor: isTrashWild ? 'rgba(76,175,80,0.85)' : trashColor ? 'rgba(156,39,176,0.85)' : 'rgba(255,204,0,0.85)',
                              textAlign: 'center' }}>
                              <span style={{ fontSize: 7, fontWeight: 'bold', color: '#fff' }}>
                                {isTrashWild ? '代替' : trashColor ?? 'マルチ'}
                              </span>
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
                  {artsDiscardCost > 0 && (
                    <>
                      <p style={{ color: C.text, fontSize: 12, margin: 0 }}>
                        手札から捨てるカードを選択: {selectedArtsDiscard.size} / {artsDiscardCost}枚
                      </p>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, overflowY: 'auto', maxHeight: 180 }}>
                        {my.hand.map((num, i) => {
                          const c = battleCardMap.get(num);
                          const isSel = selectedArtsDiscard.has(i);
                          return (
                            <div key={i}
                              onClick={() => setSelectedArtsDiscard(prev => {
                                const next = new Set(prev);
                                if (next.has(i)) { next.delete(i); return next; }
                                if (next.size >= artsDiscardCost) return prev;
                                next.add(i); return next;
                              })}
                              onPointerDown={() => { pickLongPressTimer.current = setTimeout(() => { setExpandedPickImgUrl(c?.ImgURL ?? null); }, 500); }}
                              onPointerUp={() => { if (pickLongPressTimer.current) { clearTimeout(pickLongPressTimer.current); pickLongPressTimer.current = null; } }}
                              onPointerLeave={() => { if (pickLongPressTimer.current) { clearTimeout(pickLongPressTimer.current); pickLongPressTimer.current = null; } }}
                              onContextMenu={e => e.preventDefault()}
                              style={{ position: 'relative', width: 44, height: 62, borderRadius: 3, flexShrink: 0,
                                border: isSel ? '2px solid #ff9800' : C.borderCard,
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
                                <div style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(255,152,0,0.4)',
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
                  <button onClick={() => executeArts(pendingArtsCard, selectedArtsCost, betAmount, isEncore, selectedArtsDiscard, keySubstituteEnabled)}
                    disabled={loading || !isValid}
                    style={{ padding: '11px 0', borderRadius: 8, border: 'none',
                      backgroundColor: isValid ? (isEncore ? '#3377bb' : C.coin) : C.disabled,
                      color: isValid ? (isEncore ? '#fff' : '#000') : C.text, fontSize: 14, fontWeight: 'bold',
                      cursor: (loading || !isValid) ? 'default' : 'pointer' }}>
                    {isEncore ? 'アーツ使用（アンコール）' : betAmount > 0 ? `アーツ使用（ベット${betAmount}枚）` : 'アーツ使用'}
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
