// グロウ選択モーダル（Phase1: グロウ先選択 → Phase2: コスト支払いカード選択）。BattleScreen.tsx から Stage 1 で抽出。
import { createPortal } from 'react-dom';
import type { Dispatch, SetStateAction } from 'react';
import type { CardData } from '../../../types';
import { collectGrowCostReductions, collectGrowCostSubstitute, collectGrowPayOptions, growPayCandidateHandIndices } from '../../../engine/effectEngine';
import { C } from '../../../components/BoardComponents';
import { applyGrowCostReduction, parseCoinCost, canAffordGrowCost, parseGrowCost, isMultiEna, coinPayableFor } from '../costs';
import { energyPoolCardNums, energyPayEntryLabel } from '../energyPaySource';
import type { BattleModalCtx } from './types';

interface GrowModalProps {
  ctx: BattleModalCtx;
  showGrowModal: boolean;
  setShowGrowModal: Dispatch<SetStateAction<boolean>>;
  pendingGrowCard: CardData | null;
  setPendingGrowCard: Dispatch<SetStateAction<CardData | null>>;
  selectedGrowCost: Set<number>;
  setSelectedGrowCost: Dispatch<SetStateAction<Set<number>>>;
  freeGrowFilter: 'same' | 'plus1' | 'plus1_paid' | null;
  setFreeGrowFilter: Dispatch<SetStateAction<'same' | 'plus1' | 'plus1_paid' | null>>;
  growCandidates: CardData[];
  currentLrigLevel: number;
  executeGrow: (card: CardData, costIndices: Set<number>, options?: { growPayDiscardHandIdx?: number[] }) => void;
  toggleGrowCostCard: (idx: number) => void;
  /** 🆕**§5.3 `O-248`**＝グロウ先の「捨ててもよい」任意コストで捨てる手札の index。 */
  growPayDiscard: Set<number>;
  toggleGrowPayDiscard: (idx: number) => void;
}

export function GrowModal(p: GrowModalProps) {
  const { my, op, isMyTurn, loading, battleCards, battleCardMap, effectsMap, myEnaAllMulti, myEnaMultiStripped, myColorlessOverrides, myColorSubs, myEnergyExtraColors, myEnergyTrashSubInfo, pickLongPressTimer, setExpandedPickImgUrl , myEnergyPayPool } = p.ctx;
  const { showGrowModal, setShowGrowModal, pendingGrowCard, setPendingGrowCard, selectedGrowCost, setSelectedGrowCost, freeGrowFilter, setFreeGrowFilter, growCandidates, currentLrigLevel, executeGrow, toggleGrowCostCard, growPayDiscard, toggleGrowPayDiscard } = p;
  return (
    <>
      {showGrowModal && createPortal(
        <div onClick={() => { setShowGrowModal(false); setPendingGrowCard(null); setSelectedGrowCost(new Set()); setFreeGrowFilter(null); }}
          style={{ position: 'fixed', inset: 0, zIndex: 3500,
            backgroundColor: 'rgba(0,0,0,0.92)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            padding: 20 }}>
          <div onClick={e => e.stopPropagation()}
            style={{ backgroundColor: C.bgModal, border: C.borderUI, borderRadius: 12,
              padding: '20px 16px', width: 'min(92vw, 360px)', maxHeight: '85vh',
              display: 'flex', flexDirection: 'column', gap: 12 }}>

            {!pendingGrowCard ? (
              /* ── Phase 1: グロウ先選択 ── */
              <>
                <p style={{ color: C.textSub, fontSize: 15, fontWeight: 'bold', margin: 0, textAlign: 'center' }}>
                  グロウ先を選択
                </p>
                <p style={{ color: C.textDim, fontSize: 11, margin: 0, textAlign: 'center' }}>
                  {freeGrowFilter === 'same'
                    ? `同レベルへグロウ（Lv.${currentLrigLevel}・コスト不要）`
                    : freeGrowFilter === 'plus1_paid'
                    ? `効果によるグロウ（Lv.${currentLrigLevel} → Lv.${currentLrigLevel + 1}・グロウコストを支払う）`
                    : `現在 Lv.${currentLrigLevel} → Lv.${currentLrigLevel + 1}`}
                </p>
                <div style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {growCandidates.length === 0 ? (
                    <p style={{ color: C.textFaint, textAlign: 'center', margin: '12px 0' }}>候補なし</p>
                  ) : growCandidates.map(card => {
                    // GROW_COST_REDUCTION: 場のCONTINUOUS軽減をグロウコストへ適用（エナ部分のみ・コインは据置）。⚠要実機検証
                    const baseRed = collectGrowCostReductions(my, op, isMyTurn, effectsMap, battleCardMap, card.CardNum);
                    const growCostR = applyGrowCostReduction(card.GrowCost, baseRed);
                    // 🆕**§5.3 `O-248`（2026-09-05）＝グロウ先自身の「捨ててもよい」任意コスト。**
                    //   🔴**払える見込みの判定にも入れる**＝入れないと「エナは足りないが手札で0にできる」形が
                    //     Phase 1 で灰色のままになり、**支払い UI に到達できない**（＝機構を足しても使えない）。
                    const growPayOpt = collectGrowPayOptions(card.CardNum, effectsMap, battleCardMap)[0];
                    const growPayReady = !!growPayOpt
                      && growPayCandidateHandIndices(my, growPayOpt, battleCardMap).length >= growPayOpt.handDiscard.count;
                    const growCostRPaid = growPayOpt && growPayReady
                      ? applyGrowCostReduction(card.GrowCost, [...baseRed, ...growPayOpt.reduction])
                      : growCostR;
                    const growCoinNeeded = parseCoinCost(card.GrowCost);
                    // 🆕§5.3 `O-83`＝`'plus1_paid'` は**効果によるグロウだがコストは払う**＝free 扱いにしない。
                    const isFreeGrow = my.free_grow_this_turn === true
                      || (freeGrowFilter !== null && freeGrowFilter !== 'plus1_paid');
                    // 🆕§5.3 `O-245`（2026-09-04）＝グロウはルリグ＝`coin_use_restriction` の対象。
                    const coinOk = growCoinNeeded === 0 || (my.coins >= growCoinNeeded && coinPayableFor(my, 'lrig'));
                    const enaOkFor = (cost: string) => canAffordGrowCost(energyPoolCardNums(myEnergyPayPool), battleCards, cost, my.keyword_grants, myEnaAllMulti, myEnaMultiStripped, myColorlessOverrides, myColorSubs, myEnergyExtraColors, myEnergyTrashSubInfo.wildcardInstIds, myEnergyTrashSubInfo.colorOverrideMap, undefined, my.cannot_pay_colorless_this_attack_phase);
                    const canAfford = isFreeGrow || (coinOk && (enaOkFor(growCostR) || enaOkFor(growCostRPaid)));
                    const totalReq = isFreeGrow ? 0 : parseGrowCost(growCostR).reduce((s, c) => s + c.count, 0);
                    return (
                      <button key={card.CardNum}
                        onClick={() => {
                          if (!canAfford) return;
                          // ⚠**任意コストがあるカードは即実行しない**＝支払うかどうかを選ばせる必要がある
                          //   （即実行すると「捨てずにタダ」か「捨てられずに払えない」のどちらかに倒れる）。
                          if (totalReq === 0 && !growPayOpt) { executeGrow(card, new Set()); }
                          else { setPendingGrowCard(card); setSelectedGrowCost(new Set()); }
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
                          <p style={{ color: C.text, fontSize: 13, fontWeight: 'bold', margin: '0 0 4px' }}>
                            {card.CardName}
                          </p>
                          {/* 🆕🔴**§5.3 `O-219`（2026-09-04・実機 `V-150` が発見）＝軽減後の実効コストを出す。**
                              🔴旧はここが**印字コスト（`card.GrowCost`）そのまま**で、`growCostR`（軽減後）は
                                支払い可否と要求枚数の計算にしか使われていなかった＝
                                **「《黒》×3 と書いてあるのに2枚しか要求されない」**という表示の嘘。
                              ⚠**軽減が効いている候補だけ**印字を併記する（常に併記すると読みにくい）。 */}
                          <p style={{ color: C.textDim, fontSize: 11, margin: 0 }}>
                            コスト: {growCostR || 'なし'}
                            {growCostR !== card.GrowCost && (
                              <span style={{ marginLeft: 6, textDecoration: 'line-through', opacity: 0.6 }}>
                                {card.GrowCost || 'なし'}
                              </span>
                            )}
                          </p>
                          {(parseInt(card.Coin) || 0) > 0 && (
                            <p style={{ color: C.coin, fontSize: 10, margin: '2px 0 0' }}>
                              コイン+{card.Coin}枚
                            </p>
                          )}
                          {growPayOpt && (
                            <p style={{ color: growPayReady ? '#4caf50' : C.textFaint, fontSize: 10, margin: '2px 0 0' }}>
                              {growPayReady ? '任意: ' : '任意（手札不足）: '}{growPayOpt.labelJa} → {growCostRPaid || 'コストなし'}
                            </p>
                          )}
                          {growCoinNeeded > 0 && (
                            <p style={{ color: C.coin, fontSize: 10, margin: '2px 0 0' }}>
                              コイン×{growCoinNeeded}（所持: {my.coins}）
                            </p>
                          )}
                          {!canAfford && (
                            <p style={{ color: C.danger, fontSize: 10, margin: '2px 0 0' }}>
                              {growCoinNeeded > 0 && my.coins < growCoinNeeded ? 'コイン不足' : 'エナ不足'}
                            </p>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
                <button onClick={() => { setShowGrowModal(false); setPendingGrowCard(null); setSelectedGrowCost(new Set()); setFreeGrowFilter(null); }}
                  style={{ padding: '8px 0', borderRadius: 8, border: C.borderUI,
                    backgroundColor: 'transparent', color: C.textDim, cursor: 'pointer', fontSize: 13 }}>
                  キャンセル（グロウしない）
                </button>
              </>
            ) : (() => {
              /* ── Phase 2: コスト支払いカード選択 ── */
              // GROW_COST_REDUCTION 適用後のグロウコストで支払い枚数を要求（エナ部分のみ・⚠要実機検証）
              const baseRed2 = collectGrowCostReductions(my, op, isMyTurn, effectsMap, battleCardMap, pendingGrowCard.CardNum);
              // 🆕**§5.3 `O-248`（2026-09-05）＝グロウ先自身の「捨ててもよい」任意コスト。**
              //   🔴**選び切ったときだけ**軽減を足す（途中の枚数で安くすると「1枚捨てて0円」になる）。
              //   ⚠候補外の手札を選んでいたら無効＝`growPayCandidateHandIndices` で必ず突き合わせる。
              const growPayOpt = collectGrowPayOptions(pendingGrowCard.CardNum, effectsMap, battleCardMap)[0];
              const growPayCands = growPayOpt ? growPayCandidateHandIndices(my, growPayOpt, battleCardMap) : [];
              const growPayIdx = [...growPayDiscard];
              const growPayPaid = !!growPayOpt && growPayIdx.length === growPayOpt.handDiscard.count
                && growPayIdx.every(i => growPayCands.includes(i));
              const reducedGrowCost = applyGrowCostReduction(pendingGrowCard.GrowCost,
                growPayPaid && growPayOpt ? [...baseRed2, ...growPayOpt.reduction] : baseRed2);
              const costItems = parseGrowCost(reducedGrowCost);
              const totalReq = costItems.reduce((s, c) => s + c.count, 0);
              const selectedNums = [...selectedGrowCost].map(i => myEnergyPayPool[i].cardNum);
              // GROW_COST_SUBSTITUTE_TRASH_SIGNI: 代替コスト情報
              const growSubInfo = collectGrowCostSubstitute(my, battleCardMap, effectsMap);
              const growSubEnaSigni = growSubInfo ? my.energy.filter(cn => {
                const c = battleCardMap.get(cn);
                return c?.Type === 'シグニ' && (c.CardClass ?? '').includes(growSubInfo.signiClass);
              }) : [];
              const canUseGrowSub = growSubInfo && growSubEnaSigni.length > 0 &&
                costItems.some(ci => ci.color === growSubInfo.substituteColor && ci.count > 0);
              const isValidNormal = selectedGrowCost.size === totalReq &&
                canAffordGrowCost(selectedNums, battleCards, reducedGrowCost, my.keyword_grants, myEnaAllMulti, myEnaMultiStripped, myColorlessOverrides, myColorSubs, myEnergyExtraColors, myEnergyTrashSubInfo.wildcardInstIds, myEnergyTrashSubInfo.colorOverrideMap, undefined, my.cannot_pay_colorless_this_attack_phase);
              const isValidWithSub = !!(canUseGrowSub && growSubInfo &&
                selectedGrowCost.size === totalReq - 1 && (() => {
                  const subSigniId = growSubEnaSigni[0];
                  const subMap = new Map([[subSigniId, growSubInfo.substituteColor]]);
                  return canAffordGrowCost(
                    [...selectedNums, subSigniId], battleCards, reducedGrowCost,
                    my.keyword_grants, myEnaAllMulti, myEnaMultiStripped, myColorlessOverrides, myColorSubs,
                    undefined, undefined, subMap,
                  );
                })());
              const isValid = isValidNormal || isValidWithSub;
              return (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <button onClick={() => { setPendingGrowCard(null); setSelectedGrowCost(new Set()); growPayIdx.forEach(toggleGrowPayDiscard); }}
                      style={{ padding: '4px 10px', borderRadius: 6, border: C.borderUI,
                        backgroundColor: 'transparent', color: C.textDim, cursor: 'pointer', fontSize: 12 }}>
                      ← 戻る
                    </button>
                    <p style={{ color: C.textSub, fontSize: 14, fontWeight: 'bold', margin: 0 }}>
                      コストを選択
                    </p>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <img src={pendingGrowCard.ImgURL} alt={pendingGrowCard.CardName}
                      style={{ width: 36, height: 50, objectFit: 'cover', borderRadius: 3, flexShrink: 0 }}
                      onError={e => { const img = e.target as HTMLImageElement; if (!img.src.endsWith('/ErrerCard.webp')) img.src = '/ErrerCard.webp'; }} />
                    <div>
                      <p style={{ color: C.text, fontSize: 12, fontWeight: 'bold', margin: '0 0 2px' }}>
                        {pendingGrowCard.CardName}
                      </p>
                      {/* 🆕**§5.3 `O-219`**＝Phase 1 と同じく**軽減後**を出す（片方だけ直すと画面内で矛盾する）。 */}
                      <p style={{ color: C.textDim, fontSize: 11, margin: 0 }}>
                        コスト: {reducedGrowCost}
                        {reducedGrowCost !== pendingGrowCard.GrowCost && (
                          <span style={{ marginLeft: 6, textDecoration: 'line-through', opacity: 0.6 }}>
                            {pendingGrowCard.GrowCost}
                          </span>
                        )}
                      </p>
                    </div>
                  </div>
                  {growPayOpt && (
                    <div style={{ border: C.borderUI, borderRadius: 8, padding: '6px 8px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <p style={{ color: growPayPaid ? C.success : C.textDim, fontSize: 11, margin: 0, textAlign: 'center' }}>
                        任意コスト: {growPayOpt.labelJa}（{growPayDiscard.size} / {growPayOpt.handDiscard.count}枚）
                      </p>
                      {growPayCands.length === 0 ? (
                        <p style={{ color: C.textFaint, fontSize: 11, margin: 0, textAlign: 'center' }}>対象の手札がありません</p>
                      ) : (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center' }}>
                          {growPayCands.map(i => {
                            const c = battleCardMap.get(my.hand[i]);
                            const sel = growPayDiscard.has(i);
                            return (
                              <div key={i} data-testid={`growpay-hand-${i}`} onClick={() => toggleGrowPayDiscard(i)}
                                style={{ position: 'relative', width: 44, height: 62, borderRadius: 4, overflow: 'hidden',
                                  cursor: 'pointer', flexShrink: 0, border: sel ? C.borderMulliganSel : C.borderCard }}>
                                {c ? (
                                  <img src={c.ImgURL} alt={c.CardName} draggable={false}
                                    style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                                    onError={e => { const img = e.target as HTMLImageElement; if (!img.src.endsWith('/ErrerCard.webp')) img.src = '/ErrerCard.webp'; }} />
                                ) : <span style={{ fontSize: 8, color: C.textFaint }}>{my.hand[i]}</span>}
                                {sel && (
                                  <div style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(244,67,54,0.45)',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <span style={{ color: C.text, fontSize: 13, fontWeight: 'bold' }}>✓</span>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                  <p style={{ color: isValid ? C.success : C.textMuted, fontSize: 12, margin: 0, textAlign: 'center' }}>
                    エナから選択: {selectedGrowCost.size} / {totalReq}枚
                    {costItems.map((c, i) => (
                      <span key={i} style={{ marginLeft: 6, color: C.textDim }}>({c.color}×{c.count})</span>
                    ))}
                  </p>
                  <div style={{ overflowY: 'auto', display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center' }}>
                    {myEnergyPayPool.length === 0 ? (
                      <p style={{ color: C.textFaint, fontSize: 12, margin: '8px 0' }}>エナがありません</p>
                    ) : myEnergyPayPool.map((payEntry, i) => {
                      const num = payEntry.cardNum;
                      const card = battleCardMap.get(num);
                      const isSel = selectedGrowCost.has(i);
                      const isWild = isMultiEna(num, battleCards, my.keyword_grants, myEnaAllMulti, myEnaMultiStripped);
                      return (
                        <div key={i} title={energyPayEntryLabel(payEntry, battleCardMap) ?? undefined} onClick={() => toggleGrowCostCard(i)}
                          onPointerDown={() => { pickLongPressTimer.current = setTimeout(() => { setExpandedPickImgUrl(card?.ImgURL ?? null); }, 500); }}
                          onPointerUp={() => { if (pickLongPressTimer.current) { clearTimeout(pickLongPressTimer.current); pickLongPressTimer.current = null; } }}
                          onPointerLeave={() => { if (pickLongPressTimer.current) { clearTimeout(pickLongPressTimer.current); pickLongPressTimer.current = null; } }}
                          onContextMenu={e => e.preventDefault()}
                          style={{ position: 'relative', width: 52, height: 73, borderRadius: 4,
                            overflow: 'hidden', cursor: 'pointer', flexShrink: 0,
                            border: isSel ? C.borderMulliganSel : isWild ? '1px solid #ffcc00' : C.borderCard }}>
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
                  {canUseGrowSub && growSubInfo && (
                    <p style={{ color: '#4caf50', fontSize: 11, margin: 0, textAlign: 'center',
                      padding: '4px 8px', background: 'rgba(76,175,80,0.1)', borderRadius: 6 }}>
                      ※ 代替: エナ＜{growSubInfo.signiClass}＞1枚をトラッシュで《{growSubInfo.substituteColor}》代替可
                      （自動適用：追加で{growSubInfo.substituteColor}のエナカードを選ばなくてOK）
                    </p>
                  )}
                  <button data-testid="grow-execute" onClick={() => executeGrow(pendingGrowCard, selectedGrowCost, growPayPaid ? { growPayDiscardHandIdx: growPayIdx } : undefined)}
                    disabled={loading || !isValid}
                    style={{ padding: '11px 0', borderRadius: 8, border: 'none',
                      backgroundColor: isValid ? C.success : C.disabled,
                      color: C.text, fontSize: 14, fontWeight: 'bold',
                      cursor: (loading || !isValid) ? 'default' : 'pointer' }}>
                    グロウ実行
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
