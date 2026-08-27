// スペルカットインポップアップ（相手のスペル発動中：候補提示→コスト/エクシード選択→使用）。BattleScreen.tsx から Stage 1 で抽出。
import { createPortal } from 'react-dom';
import type { Dispatch, SetStateAction } from 'react';
import { getCardNum } from '../../../engine/effectExecutor';
import { C } from '../../../components/BoardComponents';
import { canAffordWithExtraCost, parseGrowCost, isMultiEna, effectEnergyCostStr, parseBetOptions, computeCostReplacement, computeArtsEffectiveCost, costScalingOf, applyContinuousCostDecreases, applySpecificCardCostReduction } from '../costs';
import type { CardData } from '../../../types';
import type { BattleModalCtx, CutinCandidate, EffectCutinCandidate } from './types';
import { payUnderSelfTrash, underSelfCostCandidates } from '../underAnySigniCost';
import { energyPoolCardNums, energyPayEntryLabel } from '../energyPaySource';
import { collectIncreaseActCost } from '../../../engine/effectEngine';

// ベット宣言（タスク12(lxxxiv)）＝カットイン窓でもアーツ経路（ArtsModal）と同じベット枝を出す。
// 対象は lrig_deck 由来＝アーツ本体のみ（場のルリグ/シグニの【起】は原文にベットを持たない）。
function cutinBetSpec(candidate: EffectCutinCandidate): { options: number[]; variable: boolean } {
  if (candidate.source !== 'lrig_deck') return { options: [], variable: false };
  return parseBetOptions(candidate.card.EffectText ?? '');
}

// 実際に選べるコイン枚数（可変ベットは 1..min(5,所持)、固定/段階は原文の段階そのまま）。
function cutinBetOptions(spec: { options: number[]; variable: boolean }, coins: number): number[] {
  return spec.variable
    ? Array.from({ length: Math.max(0, Math.min(5, coins)) }, (_, i) => i + 1)
    : spec.options;
}

interface CutinModalProps {
  ctx: BattleModalCtx;
  pendingCutinCard: CutinCandidate | null;
  setPendingCutinCard: Dispatch<SetStateAction<CutinCandidate | null>>;
  selectedCutinCost: Set<number>;
  setSelectedCutinCost: Dispatch<SetStateAction<Set<number>>>;
  selectedCutinExceed: Set<number>;
  setSelectedCutinExceed: Dispatch<SetStateAction<Set<number>>>;
  selectedCutinUnderTrash: Set<string>;
  setSelectedCutinUnderTrash: Dispatch<SetStateAction<Set<string>>>;
  cutinBetAmount: number;
  setCutinBetAmount: Dispatch<SetStateAction<number>>;
  setCutinSpellZoomed: Dispatch<SetStateAction<boolean>>;
  cutinCandidates: CutinCandidate[];
  handleCutinPass: () => void;
  handleCutinUse: (candidate: CutinCandidate, costIndices: Set<number>, underTrashKeys?: Set<string>, betCoins?: number) => void;
  handleResonaCutinSelect: (candidate: CutinCandidate) => void;
  toggleCutinCostCard: (idx: number) => void;
}

export function CutinModal(p: CutinModalProps) {
  const { bs, user, my, op, isMyTurn, effectsMap, loading, battleCards, battleCardMap, myEnaAllMulti, myEnaMultiStripped, myColorlessOverrides, myColorSubs, myEnergyExtraColors, activeCostMods, specificCardCostReductions, myLrigNameAliases, myArtsThresholdReductions, isActionBlocked, pickLongPressTimer, setExpandedPickImgUrl , myEnergyPayPool } = p.ctx;
  const { pendingCutinCard, setPendingCutinCard, selectedCutinCost, setSelectedCutinCost, selectedCutinExceed, setSelectedCutinExceed, selectedCutinUnderTrash, setSelectedCutinUnderTrash, cutinBetAmount, setCutinBetAmount, setCutinSpellZoomed, cutinCandidates, handleCutinPass, handleCutinUse, handleResonaCutinSelect, toggleCutinCostCard } = p;
  // ベット宣言でコストが置換される札（WX17-019《青×0》/ WD20-007《緑×0》）の置換後コスト。
  const betReplacedCostOf = (card: { CardName?: string; Cost: string; EffectText?: string }): string | null =>
    computeCostReplacement(card, my, battleCardMap, { oppState: op, cardCostReplacements: my.card_cost_replacements, isBetting: true });
  const betBlocked = isActionBlocked('BET') || !!my.negate_coin_abilities;
  // ルリグデッキ由来（＝アーツ本体）の実効コスト（タスク12(lxxxvii)）。
  // 従来はここだけ **CSV の `Cost` 列＋`specificCardCostReductions`** で出しており、
  // `computeArtsEffectiveCost`（EffectText 由来の条件つき軽減）・`applyContinuousCostDecreases`
  // （場の CONTINUOUS 軽減）・`card_cost_replacements`（カード名指定の置換）を素通りしていた＝
  // **同じアーツがメインフェイズ経由とカットイン経由でコストが食い違っていた**
  // （実測で条件つきにズレる札は `WXK05-004`／`WXK06-016`／`SP36-001`／`SP38-002` の4枚。
  //  うち `SP36-001` は「対戦相手がスペルを使用していた場合」＝**カットイン窓こそ効くべき場面**）。
  // ⚠`specificCardCostReductions` はこの経路だけが持っている軽減なので、最後に重ねて失わない。

  // INCREASE_ACT_ABILITY_COST（`WXDi-P06-031`「対戦相手の、センタールリグとシグニの【起】能力の
  // 使用コストは《無》増える」）＝**カットイン窓経由でも同じ【起】能力なので同じだけ増える**。
  // ⚠従来この窓だけ素通りしていた＝「メインフェイズ経由だと増えるが、カットイン窓経由だと増えない」
  //   という入口ごとの食い違い（このファイル上部のアーツ実効コストで既に一度踏んだ型）。
  // ⚠対象は**センタールリグ（`lrig_field`）とシグニ（`signi_field`）だけ**＝原文がそう限定している。
  //   `lrig_deck`（アーツ本体）／`hand`（手札から捨てて使う【起】）は対象外。
  const actCostExtraOf = (source: string): number =>
    (source === 'lrig_field' || source === 'signi_field')
      ? collectIncreaseActCost(op, isMyTurn, effectsMap) : 0;
  const withActCostExtra = (costStr: string, source: string): string => {
    const n = actCostExtraOf(source);
    return n > 0 ? `${costStr}《無》×${n}` : costStr;
  };
  const myLrigCardCM = battleCardMap.get(my.field.lrig.at(-1) ?? '');
  const oppLrigColorCM = battleCardMap.get(op.field.lrig.at(-1) ?? '')?.Color ?? '';
  const artsBaseCost = (card: CardData): string => {
    const eff = applyContinuousCostDecreases(
      computeArtsEffectiveCost(card, my, myLrigCardCM?.CardName, oppLrigColorCM,
        myLrigCardCM ? parseInt(myLrigCardCM.Level ?? '0') : 0, battleCardMap,
        myLrigNameAliases, myArtsThresholdReductions,
        { oppState: op, cardCostReplacements: my.card_cost_replacements }, costScalingOf(card.CardNum, effectsMap)),
      'アーツ', card.Color, activeCostMods.forMy);
    return applySpecificCardCostReduction(eff, card.CardName, specificCardCostReductions);
  };
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
                            if (candidate.kind === 'resona') {
                              return (
                                <button key={`resona-${candidate.instanceId}`}
                                  onClick={() => handleResonaCutinSelect(candidate)}
                                  disabled={loading}
                                  style={{ display: 'flex', alignItems: 'center', gap: 10,
                                    padding: '8px 12px', borderRadius: 8, border: C.borderUI,
                                    backgroundColor: C.bgButton, color: C.text, cursor: loading ? 'default' : 'pointer' }}>
                                  <img src={candidate.card.ImgURL} alt={candidate.card.CardName}
                                    style={{ width: 44, height: 62, objectFit: 'cover', borderRadius: 4, flexShrink: 0 }} />
                                  <div>
                                    <p style={{ color: C.text, fontSize: 13, fontWeight: 'bold', margin: '0 0 2px' }}>{candidate.card.CardName}</p>
                                    <p style={{ color: C.textDim, fontSize: 11, margin: 0 }}>出現条件を支払いレゾナ召喚</p>
                                  </div>
                                </button>
                              );
                            }
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
                              ? artsBaseCost(candidate.card)
                              : effectEnergyCostStr(candidate.effect.cost?.energy);
                            const addColorless = candidate.additionalColorlessCost ? `《無》×${candidate.additionalColorlessCost}` : '';
                            const costStr = withActCostExtra(`${baseCostStr}${addColorless}`, candidate.source);
                            // ベット宣言（タスク12(lxxxiv)）: 宣言できる札は、置換後コストでも支払い可否を見る。
                            // 印刷コストだけで判定すると WX17-019（《青》×2 → ベットで《青×0》）が
                            // エナ不足で候補から消え、ベットを宣言する画面へ辿り着けない。
                            const betSpecCand = cutinBetSpec(candidate);
                            const betOptionsCand = cutinBetOptions(betSpecCand, my.coins);
                            const canBetCand = !betBlocked && betOptionsCand.some(n => n > 0 && n <= my.coins);
                            const betCostCand = canBetCand ? betReplacedCostOf(candidate.card) : null;
                            const canAffordEnergy = isHandDiscard
                              ? true
                              : canAffordWithExtraCost(energyPoolCardNums(myEnergyPayPool), battleCards, costStr, extraArtsCosts, my.keyword_grants, myEnaAllMulti, myEnaMultiStripped, myColorlessOverrides, myColorSubs, myEnergyExtraColors, undefined, undefined, undefined, my.cannot_pay_colorless_this_attack_phase)
                                || (betCostCand !== null && canAffordWithExtraCost(energyPoolCardNums(myEnergyPayPool), battleCards, `${betCostCand}${addColorless}`, extraArtsCosts, my.keyword_grants, myEnaAllMulti, myEnaMultiStripped, myColorlessOverrides, myColorSubs, myEnergyExtraColors, undefined, undefined, undefined, my.cannot_pay_colorless_this_attack_phase));
                            const canAfford = canAffordEnergy && canAffordExceedCand;
                            const exceedPart = exceedCostCand > 0 ? `エクシード${exceedCostCand}` : '';
                            const energyPart = isHandDiscard ? '手札から自分を捨てる' : costStr || '';
                            const costLabel = [exceedPart, energyPart].filter(Boolean).join('・') || 'なし';
                            return (
                              <button key={candidate.instanceId}
                                onClick={() => { if (canAfford) { setPendingCutinCard(candidate); setSelectedCutinCost(new Set()); setSelectedCutinExceed(new Set()); setSelectedCutinUnderTrash(new Set()); setCutinBetAmount(0); } }}
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
                                  {(betSpecCand.variable || betSpecCand.options.length > 0) && (
                                    <p style={{ color: C.coin, fontSize: 10, margin: '0 0 2px' }}>
                                      ベット{betSpecCand.variable ? '（好きな枚数）' : `（コイン${betSpecCand.options.join('or')}枚）`}
                                      {betCostCand !== null && ` → コスト ${betCostCand}`}
                                    </p>
                                  )}
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
              if (pendingCutinCard.kind === 'resona') return null;
              const isHandDiscardModal = pendingCutinCard.source === 'hand' && pendingCutinCard.effect.cost?.discardSelfFromHand;
              const exceedCostModal = pendingCutinCard.source === 'lrig_field'
                ? (pendingCutinCard.effect.cost?.exceed ?? 0) : 0;
              const exceedPoolModal = [
                ...my.field.lrig.slice(0, -1),
                ...(my.field.assist_lrig_l?.slice(0, -1) ?? []),
                ...(my.field.assist_lrig_r?.slice(0, -1) ?? []),
              ];
              const betSpecModal = cutinBetSpec(pendingCutinCard);
              const betOptionsModal = cutinBetOptions(betSpecModal, my.coins);
              const canBetModal = !betBlocked && betOptionsModal.some(n => n > 0 && n <= my.coins);
              // ベット宣言中はコスト置換を反映する（宣言を切り替えたら選択済みエナは白紙に戻す）。
              const betReplacedCostModal = cutinBetAmount > 0 ? betReplacedCostOf(pendingCutinCard.card) : null;
              const cutinBaseCostStrModal = betReplacedCostModal ?? (pendingCutinCard.source === 'lrig_deck'
                ? artsBaseCost(pendingCutinCard.card)
                : effectEnergyCostStr(pendingCutinCard.effect.cost?.energy));
              const cutinCostStrModal = withActCostExtra(
                `${cutinBaseCostStrModal}${pendingCutinCard.additionalColorlessCost ? `《無》×${pendingCutinCard.additionalColorlessCost}` : ''}`,
                pendingCutinCard.source);
              const exceedPartModal = exceedCostModal > 0 ? `エクシード${exceedCostModal}` : '';
              const energyPartModal = isHandDiscardModal ? '手札から自分を捨てる' : cutinCostStrModal || '';
              const cutinCostLabelModal = [exceedPartModal, energyPartModal].filter(Boolean).join('・') || 'なし';
              const costItems = isHandDiscardModal ? [] : parseGrowCost(cutinCostStrModal);
              const totalReq = costItems.reduce((s, c) => s + c.count, 0);
              const selectedNums = [...selectedCutinCost].map(i => myEnergyPayPool[i].cardNum);
              const extraArtsCosts = activeCostMods.forMy
                .filter(m => m.direction === 'increase' && m.targetCardType === 'アーツ')
                .flatMap(m => m.amount);
              const exceedOkModal = exceedCostModal === 0 || selectedCutinExceed.size === exceedCostModal;
              const underCostModal = pendingCutinCard.effect.cost?.underSelfTrash;
              const underZoneModal = pendingCutinCard.zoneIdx ?? -1;
              const underCandidatesModal = underCostModal && underZoneModal >= 0
                ? underSelfCostCandidates(my, underZoneModal, battleCardMap, underCostModal.filter) : [];
              const underOkModal = !underCostModal || (underZoneModal >= 0 && payUnderSelfTrash(
                my, underZoneModal, selectedCutinUnderTrash, underCostModal.count, battleCardMap,
                underCostModal.filter, underCostModal.selectionConstraint,
              ) !== null);
              const isValid = underOkModal && exceedOkModal && (totalReq === 0 || isHandDiscardModal ||
                (selectedCutinCost.size === totalReq &&
                  canAffordWithExtraCost(selectedNums, battleCards, cutinCostStrModal, extraArtsCosts, my.keyword_grants, myEnaAllMulti, myEnaMultiStripped, myColorlessOverrides, myColorSubs, myEnergyExtraColors, undefined, undefined, undefined, my.cannot_pay_colorless_this_attack_phase)));
              return (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <button onClick={() => { setPendingCutinCard(null); setSelectedCutinCost(new Set()); setSelectedCutinExceed(new Set()); setCutinBetAmount(0); }}
                      style={{ padding: '4px 10px', borderRadius: 6, border: C.borderUI,
                        backgroundColor: 'transparent', color: C.textDim, cursor: 'pointer', fontSize: 12 }}>
                      ← 戻る
                    </button>
                    <p style={{ color: C.textSub, fontSize: 14, fontWeight: 'bold', margin: 0 }}>カットインコスト選択</p>
                  </div>
                  {underCostModal && (
                    <>
                      <p style={{ color: underOkModal ? C.success : C.textMuted, fontSize: 12, margin: 0, textAlign: 'center' }}>
                        このシグニの下からスペルを選択: {selectedCutinUnderTrash.size} / {underCostModal.count}枚
                      </p>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center' }}>
                        {underCandidatesModal.map(candidate => {
                          const key = `${candidate.zone}:${candidate.index}`;
                          const card = battleCardMap.get(getCardNum(candidate.cardNum));
                          const selected = selectedCutinUnderTrash.has(key);
                          return <div key={key} onClick={() => setSelectedCutinUnderTrash(prev => {
                            const next = new Set(prev);
                            if (next.has(key)) next.delete(key);
                            else if (next.size < underCostModal.count) next.add(key);
                            return next;
                          })} style={{ width: 44, height: 62, border: selected ? '2px solid #9c27b0' : C.borderCard, cursor: 'pointer' }}>
                            {card && <img src={card.ImgURL} alt={card.CardName} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
                          </div>;
                        })}
                      </div>
                    </>
                  )}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <img src={pendingCutinCard.card.ImgURL} alt={pendingCutinCard.card.CardName}
                      style={{ width: 36, height: 50, objectFit: 'cover', borderRadius: 3, flexShrink: 0 }}
                      onError={e => { const img = e.target as HTMLImageElement; if (!img.src.endsWith('/ErrerCard.webp')) img.src = '/ErrerCard.webp'; }} />
                    <div>
                      <p style={{ color: C.text, fontSize: 12, fontWeight: 'bold', margin: '0 0 2px' }}>{pendingCutinCard.card.CardName}</p>
                      <p style={{ color: C.textDim, fontSize: 11, margin: 0 }}>
                        コスト: {cutinCostLabelModal}{betReplacedCostModal !== null && <span style={{ color: C.coin }}>（ベット）</span>}
                      </p>
                    </div>
                  </div>
                  {(betSpecModal.variable || betSpecModal.options.length > 0) && (() => {
                    // ベット宣言でコストが変わる札は、宣言を切り替えたら選択済みエナを白紙に戻す（枚数要件が変わるため）
                    const betReplacesCost = betReplacedCostOf(pendingCutinCard.card) !== null;
                    return (
                      <div style={{ padding: '8px 12px', borderRadius: 8, border: cutinBetAmount > 0 ? `2px solid ${C.coin}` : C.borderUI,
                        backgroundColor: cutinBetAmount > 0 ? 'rgba(204,136,0,0.15)' : C.bgButton, display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <span style={{ fontSize: 13, color: cutinBetAmount > 0 ? C.coin : C.text }}>
                            ベット{betSpecModal.variable ? '（好きな枚数）' : betSpecModal.options.length > 1 ? '（段階）' : `（コイン${betSpecModal.options[0]}枚）`}
                          </span>
                          <span style={{ fontSize: 11, color: canBetModal || cutinBetAmount > 0 ? C.coin : C.danger }}>
                            選択: {cutinBetAmount}枚 / 所持: {my.coins}枚
                          </span>
                        </div>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          <button onClick={() => { setCutinBetAmount(0); if (betReplacesCost) setSelectedCutinCost(new Set()); }} disabled={betBlocked}
                            style={{ padding: '4px 10px', borderRadius: 6, fontSize: 12, cursor: betBlocked ? 'default' : 'pointer',
                              border: cutinBetAmount === 0 ? `2px solid ${C.coin}` : C.borderUI,
                              backgroundColor: cutinBetAmount === 0 ? 'rgba(204,136,0,0.2)' : 'transparent',
                              color: cutinBetAmount === 0 ? C.coin : C.textDim }}>
                            OFF
                          </button>
                          {betOptionsModal.map(n => {
                            const affordable = !betBlocked && n <= my.coins;
                            const sel = cutinBetAmount === n;
                            return (
                              <button key={n} onClick={() => { if (affordable || sel) { setCutinBetAmount(sel ? 0 : n); if (betReplacesCost) setSelectedCutinCost(new Set()); } }}
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
                    );
                  })()}
                  {totalReq > 0 && (
                    <>
                      <p style={{ color: isValid ? C.success : C.textMuted, fontSize: 12, margin: 0, textAlign: 'center' }}>
                        エナから選択: {selectedCutinCost.size} / {totalReq}枚
                        {costItems.map((c, i) => (
                          <span key={i} style={{ marginLeft: 6, color: C.textDim }}>({c.color}×{c.count})</span>
                        ))}
                      </p>
                      <div style={{ overflowY: 'auto', display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center' }}>
                        {myEnergyPayPool.map((payEntry, i) => {
                          const num = payEntry.cardNum;
                          const card = battleCardMap.get(num);
                          const isSel = selectedCutinCost.has(i);
                          const isWild = isMultiEna(num, battleCards, my.keyword_grants, myEnaAllMulti, myEnaMultiStripped);
                          return (
                            <div key={i} title={energyPayEntryLabel(payEntry, battleCardMap) ?? undefined} onClick={() => toggleCutinCostCard(i)}
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
                  <button onClick={() => handleCutinUse(pendingCutinCard, selectedCutinCost, selectedCutinUnderTrash, cutinBetAmount)}
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
