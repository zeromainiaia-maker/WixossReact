// アーツ使用モーダル（Phase1: アーツ選択 → Phase2: コスト支払い＋ベット/アンコール/キー代替）。BattleScreen.tsx から Stage 1 で抽出。
import { createPortal } from 'react-dom';
import type { Dispatch, SetStateAction } from 'react';
import type { CardData } from '../../../types';
import { splitColors, matchesFilter, getCardNum } from '../../../engine/execUtils';
import { C } from '../../../components/BoardComponents';
import { computeCostReplacement, costReplacementOf, canAffordWithExtraCost, parseGrowCost, betOptionsOf, boostCostOf, encoreCostOf, canPayExceed, isMultiEna, applySpecificCardCostReduction, applyNextArtsCostReduction } from '../costs';
import { resolveUseTimeCost, useTimeCostCandidates, applyUseTimeCostReduction, useTimeCostSelectionValid } from '../useTimeCost';
import { UseCostPaymentPanel } from './UseCostPaymentPanel';
import { energyPayEntryLabel } from '../energyPaySource';
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
  selectedArtsUseCostPay: Set<string>;
  setSelectedArtsUseCostPay: Dispatch<SetStateAction<Set<string>>>;
  betAmount: number;
  setBetAmount: Dispatch<SetStateAction<number>>;
  isBoosting: boolean;
  setIsBoosting: Dispatch<SetStateAction<boolean>>;
  isEncore: boolean;
  setIsEncore: Dispatch<SetStateAction<boolean>>;
  keySubstituteEnabled: boolean;
  setKeySubstituteEnabled: Dispatch<SetStateAction<boolean>>;
  executeArts: (card: CardData, costIndices: Set<number>, betCoins?: number, encore?: boolean, discardIndices?: Set<number>, useKeySub?: boolean, boosting?: boolean, useCostPayKeys?: Set<string>) => void;
  toggleArtsCostCard: (idx: number) => void;
}

export function ArtsModal(p: ArtsModalProps) {
  const { my, op, loading, battleCards, battleCardMap, effectsMap, myEnaAllMulti, myEnaMultiStripped, myColorlessOverrides, myColorSubs, myEnergyExtraColors, myEnergyTrashSubInfo, activeCostMods, specificCardCostReductions, isActionBlocked, pickLongPressTimer, setExpandedPickImgUrl , myEnergyPayPool } = p.ctx;
  const { showArtsModal, setShowArtsModal, pendingArtsCard, setPendingArtsCard, pendingArtsEffectiveCost, setPendingArtsEffectiveCost, selectedArtsCost, setSelectedArtsCost, selectedArtsDiscard, setSelectedArtsDiscard, selectedArtsUseCostPay, setSelectedArtsUseCostPay, betAmount, setBetAmount, isBoosting, setIsBoosting, isEncore, setIsEncore, keySubstituteEnabled, setKeySubstituteEnabled, executeArts, toggleArtsCostCard } = p;
  return (
    <>
      {showArtsModal && pendingArtsCard && createPortal(
        <div onClick={() => { setShowArtsModal(false); setPendingArtsCard(null); setSelectedArtsCost(new Set()); setSelectedArtsUseCostPay(new Set()); setBetAmount(0); setIsEncore(false); setKeySubstituteEnabled(false); }}
          style={{ position: 'fixed', inset: 0, zIndex: 3500,
            backgroundColor: 'rgba(0,0,0,0.92)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            padding: 20 }}>
          <div onClick={e => e.stopPropagation()}
            style={{ backgroundColor: C.bgModal, border: C.borderUI, borderRadius: 12,
              padding: '20px 16px', width: 'min(92vw, 360px)', maxHeight: '85vh',
              display: 'flex', flexDirection: 'column', gap: 12 }}>

            {(() => {
              /* コスト支払い（ベット/アンコール/キー代替/使用時の任意支払い）。
                 ⚠**カード未確定の入口はもう無い**（§6.4 `O-19b`）＝唯一の入口 `openArtsModal` が必ず
                 `pendingArtsCard` を立てるので、旧「Phase1: アーツ一覧」は到達不能な死にコードだった（削除済み）。
                 提示可否と実効コストは `artsUseGate.checkArtsUse` が唯一の funnel（コスト計算の入口を増やさない）。 */
              // ベット宣言でコストが置換される札（タスク12(lxxxi)）は betAmount に追従して再計算する
              // （gate から渡された pendingArtsEffectiveCost は宣言前の値なので使えない）。
              const betReplacedCost = betAmount > 0
                ? computeCostReplacement(pendingArtsCard, my, battleCardMap, { oppState: op, cardCostReplacements: my.card_cost_replacements, isBetting: true },
                    costReplacementOf(pendingArtsCard.CardNum, effectsMap))
                : null;
              const rawEffectiveCost = betReplacedCost ?? pendingArtsEffectiveCost ?? pendingArtsCard.Cost;
              // SPECIFIC_CARD_COST_REDUCE の二重適用を防ぐ（タスク12(xcvi)）＝
              // `pendingArtsEffectiveCost` は Phase1（同 :70）で **すでに applySpecificCardCostReduction 済み**の値なので、
              // ここで再適用すると `removeNColorFromCost` が2回走って《無》を2N枚ぶん引く。一方 `betReplacedCost`
              // （ベット宣言の置換値）と印刷コスト（`pendingArtsCard.Cost`）は未適用なので、その2つのときだけ適用する。
              // ⚠適用順は Phase1 と同じ「軽減 → 《無》→センター色 の読み替え」に揃える（読み替え後だと《無》を見失う）。
              const specificAlreadyApplied = betReplacedCost === null && pendingArtsEffectiveCost !== null;
              // ⚠【チェイン】軽減（タスク12(xciii)）も同じ二重適用の罠にかかる＝Phase1 で適用済みの
              //   `pendingArtsEffectiveCost` にはもう乗っているので、未適用の2経路のときだけ適用する。
              const reducedEffectiveCost = specificAlreadyApplied
                ? rawEffectiveCost
                : applyNextArtsCostReduction(
                    applySpecificCardCostReduction(rawEffectiveCost, pendingArtsCard.CardName, specificCardCostReductions),
                    my.next_arts_cost_reduction);
              // ARTS_COLORLESS_MUST_PAY_CENTER_COLOR: 《無》コストをセンタールリグ色で支払わなければならない
              const hasColorlessRestriction = (effectsMap.get(pendingArtsCard.CardNum) ?? [])
                .some(e => e.effectType === 'ACTIVATED' && JSON.stringify(e.action).includes('ARTS_COLORLESS_MUST_PAY_CENTER_COLOR'));
              // Color列は「黒青」のような連結形式（'/'区切りではない）のため splitColors で分解する
              const centerColorForRestr = hasColorlessRestriction
                ? splitColors(battleCardMap.get(my.field.lrig.at(-1) ?? '')?.Color)[0] ?? ''
                : '';
              const effectiveCost = hasColorlessRestriction && centerColorForRestr
                ? reducedEffectiveCost.replace(/《無》/g, `《${centerColorForRestr}》`)
                : reducedEffectiveCost;
              // 使用時の任意支払いによるコスト**軽減**（タスク12(lxxxv)）＝選択枚数に追従して差し引く。
              const useCostSpec = resolveUseTimeCost(pendingArtsCard.CardNum, effectsMap);
              const useCostCands = useCostSpec ? useTimeCostCandidates(useCostSpec, my, battleCardMap) : [];
              const useCostBefore = effectiveCost;
              const useCostIncomplete = !!useCostSpec && selectedArtsUseCostPay.size > 0
                && !useTimeCostSelectionValid(useCostSpec, selectedArtsUseCostPay, useCostCands.length);
              const effectiveCostAfterPay = useCostSpec
                ? applyUseTimeCostReduction(effectiveCost, useCostSpec, selectedArtsUseCostPay.size) : effectiveCost;
              const costItems = parseGrowCost(effectiveCostAfterPay);
              const encoreCostForCard = encoreCostOf(pendingArtsCard.CardNum, effectsMap);
              const encoreExtraEna: { color: string; count: number }[] = encoreCostForCard?.energy ?? [];
              const boostCostForCard = boostCostOf(pendingArtsCard.CardNum, effectsMap);
              const boostExtraEna = isBoosting ? boostCostForCard : [];
              const keySubCount = keySubstituteEnabled && myEnergyTrashSubInfo.keySubInstId ? 2 : 0;
              const baseReq = costItems.reduce((s, c) => s + c.count, 0) +
                (isEncore ? encoreExtraEna.reduce((s, e) => s + e.count, 0) : 0) +
                boostExtraEna.reduce((s, e) => s + e.count, 0);
              const totalReq = Math.max(0, baseReq - keySubCount);
              const selectedNums = [...selectedArtsCost].map(i => myEnergyPayPool[i].cardNum);
              const extraArtsCosts = activeCostMods.forMy
                .filter(m => m.direction === 'increase' && m.targetCardType === 'アーツ')
                .flatMap(m => m.amount);
              // 🆕§5.3 `O-199`＝アンコールの**テキスト形コスト**（アイコンではない支払い）。
              const encoreExceed = encoreCostForCard?.exceed ?? 0;
              const encoreTrashKey = encoreCostForCard?.trashOwnKey === true;
              const encoreHandDiscard = encoreCostForCard?.handDiscardSigni;
              const encoreDiscardNeed = isEncore ? (encoreHandDiscard?.count ?? 0) : 0;
              const encoreHandOk = (n: string) => {
                if (!encoreHandDiscard) return true;
                const c = battleCardMap.get(getCardNum(n));
                return !!c && c.Type === 'シグニ'
                  && (!encoreHandDiscard.story || matchesFilter(c, { story: encoreHandDiscard.story }));
              };
              const encoreHandCandCount = encoreHandDiscard ? my.hand.filter(encoreHandOk).length : 0;
              // 支払える形かどうか（払えない札でアンコールを選ばせない＝踏み倒しも空振りも作らない）
              const encoreTextPayable = (encoreExceed === 0 || canPayExceed(my, encoreExceed))
                && (!encoreTrashKey || !!my.field.key_piece)
                && (!encoreHandDiscard || encoreHandCandCount >= encoreHandDiscard.count);
              const artsDiscardCost = (effectsMap.get(pendingArtsCard.CardNum) ?? [])
                .filter(e => e.effectType === 'ACTIVATED')
                .reduce((sum, e) => sum + (e.cost?.discard ?? 0), 0)
                + encoreDiscardNeed;
              const energyValid = selectedArtsCost.size === totalReq &&
                canAffordWithExtraCost(selectedNums, battleCards, effectiveCostAfterPay, [...extraArtsCosts, ...boostExtraEna], my.keyword_grants, myEnaAllMulti, myEnaMultiStripped, myColorlessOverrides, myColorSubs, myEnergyExtraColors, myEnergyTrashSubInfo.wildcardInstIds, myEnergyTrashSubInfo.colorOverrideMap, keySubCount, my.cannot_pay_colorless_this_attack_phase) &&
                (!isEncore || encoreExtraEna.every(req =>
                  selectedNums.filter(n => {
                    const c = battleCardMap.get(n);
                    return c?.Color?.includes(req.color) || isMultiEna(n, battleCards, my.keyword_grants, myEnaAllMulti, myEnaMultiStripped);
                  }).length >= req.count
                ));
              // 🆕アンコールのテキスト形手札捨ては**条件つき**＝選んだ札が条件を満たすことまで見る。
              const encoreDiscardOk = encoreDiscardNeed === 0
                || [...selectedArtsDiscard].filter(i => encoreHandOk(my.hand[i])).length >= encoreDiscardNeed;
              const isValid = energyValid && selectedArtsDiscard.size >= artsDiscardCost && encoreDiscardOk;
              const betSpec = betOptionsOf(pendingArtsCard.CardNum, effectsMap);
              // ベット宣言でコストが変わる札は、宣言を切り替えたら選択済みエナを白紙に戻す（枚数要件が変わるため）
              const betReplacesCost = computeCostReplacement(pendingArtsCard, my, battleCardMap, { oppState: op, cardCostReplacements: my.card_cost_replacements, isBetting: true },
                costReplacementOf(pendingArtsCard.CardNum, effectsMap)) !== null;
              const encoreCoins = encoreCostForCard?.coins ?? 0;
              const betReservedForEncore = isEncore ? encoreCoins : 0;
              // ベットで選べるコイン枚数（固定/段階/可変）。アンコール併用時はその分を残す
              const betOptions: number[] = betSpec.variable
                ? Array.from({ length: Math.max(0, Math.min(5, my.coins) - betReservedForEncore) }, (_, i) => i + 1)
                : betSpec.options;
              const betBlocked = isActionBlocked('BET') || !!my.negate_coin_abilities;
              const canBet = !betBlocked && betOptions.some(n => n > 0 && n + betReservedForEncore <= my.coins);
              const canEncore = !!encoreCostForCard && (encoreCoins === 0 || my.coins >= encoreCoins + betAmount)
                && encoreTextPayable && !isActionBlocked('ENCORE');
              return (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <button onClick={() => { setShowArtsModal(false); setPendingArtsCard(null); setPendingArtsEffectiveCost(null); setSelectedArtsCost(new Set()); setSelectedArtsUseCostPay(new Set()); setBetAmount(0); setIsEncore(false); setKeySubstituteEnabled(false); }}
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
                        コスト: {effectiveCostAfterPay}{betReplacedCost !== null && <span style={{ color: C.coin }}>（ベット）</span>}
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
                        <button onClick={() => { setBetAmount(0); if (betReplacesCost) setSelectedArtsCost(new Set()); }} disabled={betBlocked}
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
                            <button key={n} onClick={() => { if (affordable || sel) { setBetAmount(sel ? 0 : n); if (betReplacesCost) setSelectedArtsCost(new Set()); } }}
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
                  {boostCostForCard.length > 0 && (
                    <button
                      onClick={() => { setIsBoosting(v => !v); setSelectedArtsCost(new Set()); }}
                      style={{ padding: '8px 12px', borderRadius: 8,
                        border: isBoosting ? '2px solid #66dd88' : C.borderUI,
                        backgroundColor: isBoosting ? 'rgba(40,150,80,0.18)' : C.bgButton,
                        color: isBoosting ? '#88ffaa' : C.text,
                        cursor: 'pointer', fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span>ブーストする</span>
                      <span style={{ fontSize: 11 }}>
                        {isBoosting ? 'ON' : 'OFF'} / {boostCostForCard.flatMap(e => Array(e.count).fill(`《${e.color}》`)).join('')}
                      </span>
                    </button>
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
                        {encoreExceed > 0 && ` / ルリグの下から${encoreExceed}枚`}
                        {encoreTrashKey && ' / キー1枚をルリグTへ'}
                        {encoreHandDiscard && ` / 手札から${encoreHandDiscard.story ? `＜${encoreHandDiscard.story}＞の` : ''}シグニ${encoreHandDiscard.count}枚`}
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
                  {useCostSpec && (
                    <UseCostPaymentPanel spec={useCostSpec} candidates={useCostCands}
                      selected={selectedArtsUseCostPay} setSelected={setSelectedArtsUseCostPay}
                      onChange={() => setSelectedArtsCost(new Set())}
                      cardMap={battleCardMap} costBefore={useCostBefore} costAfter={effectiveCostAfterPay}
                      incomplete={useCostIncomplete} />
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
                    {myEnergyPayPool.length === 0 ? (
                      <p style={{ color: C.textFaint, fontSize: 12, margin: '8px 0' }}>エナがありません</p>
                    ) : myEnergyPayPool.map((payEntry, i) => {
                      const num = payEntry.cardNum;
                      const card = battleCardMap.get(num);
                      const isSel = selectedArtsCost.has(i);
                      const isWild = isMultiEna(num, battleCards, my.keyword_grants, myEnaAllMulti, myEnaMultiStripped);
                      const isTrashWild = myEnergyTrashSubInfo.wildcardInstIds.has(num);
                      const trashColor = myEnergyTrashSubInfo.colorOverrideMap.get(num);
                      const borderColor = isSel ? '#f44336' : isTrashWild ? '#4caf50' : trashColor ? '#9c27b0' : isWild ? '#ffcc00' : undefined;
                      return (
                        <div key={i} title={energyPayEntryLabel(payEntry, battleCardMap) ?? undefined} data-testid={`artscost-energy-${i}`} onClick={() => toggleArtsCostCard(i)}
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
                  <button onClick={() => executeArts(pendingArtsCard, selectedArtsCost, betAmount, isEncore, selectedArtsDiscard, keySubstituteEnabled, isBoosting, useCostIncomplete ? new Set() : selectedArtsUseCostPay)}
                    disabled={loading || !isValid}
                    style={{ padding: '11px 0', borderRadius: 8, border: 'none',
                      backgroundColor: isValid ? (isEncore ? '#3377bb' : C.coin) : C.disabled,
                      color: isValid ? (isEncore ? '#fff' : '#000') : C.text, fontSize: 14, fontWeight: 'bold',
                      cursor: (loading || !isValid) ? 'default' : 'pointer' }}>
                    {isEncore ? 'アーツ使用（アンコール）' : betAmount > 0 ? `アーツ使用（ベット${betAmount}枚）` : isBoosting ? 'アーツ使用（ブースト）' : 'アーツ使用'}
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
