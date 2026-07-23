// 効果インタラクション モーダル（SELECT_TARGET/SEARCH/CHOOSE/LOOK_AND_REORDER/整列/ゾーン選択等の pending_effect 解決UI）。BattleScreen.tsx から Stage 1 で抽出。
import { createPortal } from 'react-dom';
import type { Dispatch, SetStateAction } from 'react';
import { getCardNum } from '../../../engine/effectExecutor';
import { costSlotIsAny, formatCostSlot, energyMatchesCostSlot, canAddToSelection, satisfiesSelectionConstraint } from '../../../engine/execUtils';
import { C } from '../../../components/BoardComponents';
import type { BattleModalCtx } from './types';

interface EffectInteractionModalProps {
  ctx: BattleModalCtx;
  effectSelectedNums: string[];
  setEffectSelectedNums: Dispatch<SetStateAction<string[]>>;
  selectedOptCost: Set<number>;
  setSelectedOptCost: Dispatch<SetStateAction<Set<number>>>;
  selectedMultiChoiceIds: Set<string>;
  setSelectedMultiChoiceIds: Dispatch<SetStateAction<Set<string>>>;
  lookReorderOrder: string[];
  setLookReorderOrder: Dispatch<SetStateAction<string[]>>;
  lookReorderTrash: Set<string>;
  setLookReorderTrash: Dispatch<SetStateAction<Set<string>>>;
  lookReorderBottom: Set<string>;
  setLookReorderBottom: Dispatch<SetStateAction<Set<string>>>;
  rearrangeSlots: (string | null)[];
  setRearrangeSlots: Dispatch<SetStateAction<(string | null)[]>>;
  handleEffectInteraction: (selectedOrChoiceId: string[]) => void;
  handleSelectZoneForEffect: (zoneIndex: number) => void;
  handleSelectSigniZoneForEffect: (zoneIndex: number) => void;
  handleSelectVirusZoneForEffect: (zoneIndex: number | null) => void;
  handleRearrangeSigniConfirm: (newArrangement: string[] | null) => void;
}

export function EffectInteractionModal(p: EffectInteractionModalProps) {
  const { bs, user, my, op, loading, battleCardMap, pickLongPressTimer, setExpandedPickImgUrl } = p.ctx;
  const { effectSelectedNums, setEffectSelectedNums, selectedOptCost, setSelectedOptCost, selectedMultiChoiceIds, setSelectedMultiChoiceIds, lookReorderOrder, setLookReorderOrder, lookReorderTrash, setLookReorderTrash, lookReorderBottom, setLookReorderBottom, rearrangeSlots, setRearrangeSlots, handleEffectInteraction, handleSelectZoneForEffect, handleSelectSigniZoneForEffect, handleSelectVirusZoneForEffect, handleRearrangeSigniConfirm } = p;
  return (
    <>
      {/* ===== 効果インタラクション モーダル ===== */}
      {(bs.pending_effect?.respondPlayerId ?? bs.pending_effect?.sourcePlayerId) === user.id && (() => {
        const pe = bs.pending_effect!;
        const inter = pe.interaction;
        const srcCard = battleCardMap.get(pe.sourceCardNum);

        // REVEAL_CARDS：閲覧専用モーダル（「対戦相手の手札を見て」等の情報公開）
        if (inter.type === 'REVEAL_CARDS') {
          return createPortal(
            <div style={{ position: 'fixed', inset: 0, zIndex: 4000,
              backgroundColor: 'rgba(0,0,0,0.92)',
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
              <div onClick={e => e.stopPropagation()}
                style={{ backgroundColor: C.bgModal, border: C.borderUI, borderRadius: 12,
                  padding: '16px', width: 'min(94vw, 460px)', maxHeight: '82vh',
                  display: 'flex', flexDirection: 'column', gap: 10, overflowY: 'auto' }}>
                <p style={{ color: C.textSub, fontSize: 14, fontWeight: 'bold', margin: 0, textAlign: 'center' }}>
                  {inter.title ?? `${srcCard?.CardName ?? pe.sourceCardNum}の効果`}
                </p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center' }}>
                  {inter.cards.length === 0
                    ? <p style={{ color: C.textFaint, fontSize: 12 }}>カードがありません</p>
                    : inter.cards.map((num, i) => {
                        const card = battleCardMap.get(num);
                        return (
                          <div key={i} style={{ width: 60, borderRadius: 4, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.15)' }}>
                            <img src={card?.ImgURL ?? '/ErrerCard.webp'} alt={card?.CardName ?? num}
                              style={{ width: '100%', aspectRatio: '3/4', objectFit: 'cover', display: 'block' }}
                              onError={e => { const img = e.target as HTMLImageElement; if (!img.src.endsWith('/ErrerCard.webp')) img.src = '/ErrerCard.webp'; }} />
                            <div style={{ backgroundColor: 'rgba(0,0,0,0.6)', textAlign: 'center', padding: '1px 2px' }}>
                              <span style={{ fontSize: 8, color: '#fff' }}>{card?.CardName ?? num}</span>
                            </div>
                          </div>
                        );
                      })
                  }
                </div>
                <button
                  onClick={() => handleEffectInteraction([])}
                  disabled={loading}
                  style={{ padding: '12px 0', borderRadius: 8, border: 'none',
                    backgroundColor: loading ? C.disabled : C.success,
                    color: C.text, fontSize: 14, fontWeight: 'bold',
                    cursor: loading ? 'default' : 'pointer' }}>
                  確認
                </button>
              </div>
            </div>,
            document.body,
          );
        }

        // SELECT_TARGET / SEARCH 共通：カード選択ピッカー
        if (inter.type === 'SELECT_TARGET' || inter.type === 'SEARCH') {
          const candidates = inter.type === 'SELECT_TARGET' ? inter.candidates : inter.visibleCards;
          const maxPick = inter.type === 'SELECT_TARGET' ? inter.count : inter.maxPick;

          // 選択UIの説明文を生成（何のためにどこから選ぶか）
          const label = (() => {
            if (inter.type === 'SEARCH') {
              const act = inter.thenAction;
              const actionDesc =
                act.type === 'ADD_TO_HAND'    ? '手札に加えるカードを' :
                act.type === 'ADD_TO_FIELD'   ? '場に出すカードを' :
                act.type === 'ENERGY_CHARGE'  ? 'エナに置くカードを' :
                act.type === 'ADD_TO_LIFE'    ? 'ライフに加えるカードを' :
                act.type === 'TRASH'          ? 'トラッシュに置くカードを' :
                'デッキから';
              return `${actionDesc}${maxPick}枚まで選んでください`;
            }
            // SELECT_TARGET
            const scopeDesc: Record<string, string> = {
              self_hand:   '手札から',
              opp_hand:    '相手の手札から',
              self_field:  '自分のシグニゾーンから',
              opp_field:   '相手のシグニゾーンから',
              both_field:  '自分または相手のシグニから',
              self_energy: 'エナから',
              opp_energy:  '相手のエナから',
              self_lrig_deck: 'ルリグデッキから',
              opp_lrig_deck: '相手のルリグデッキから',
              self_trash:  'トラッシュから',
              opp_trash:   '相手のトラッシュから',
            };
            const from = scopeDesc[inter.targetScope] ?? '';
            const act = inter.thenAction;
            const actionDesc =
              act.type === 'BANISH'         ? 'バニッシュする' :
              act.type === 'BOUNCE'         ? '手札に戻す' :
              act.type === 'TRASH'          ? 'トラッシュに置く' :
              act.type === 'ADD_TO_HAND'    ? '手札に加える' :
              act.type === 'ENERGY_CHARGE'  ? 'エナに置く' :
              act.type === 'ADD_TO_FIELD'   ? '場に出す' :
              act.type === 'POWER_MODIFY'   ? (() => { const d = (act as import('../../../types/effects').PowerModifyAction).delta; const n = typeof d === 'number' ? d : 0; return `パワーを${n > 0 ? '+' : ''}${n}する`; })() :
              act.type === 'DOWN'           ? 'ダウンする' :
              act.type === 'FREEZE'         ? '凍結する' :
              act.type === 'DRAW'           ? '引く' :
              act.type === 'ADD_TO_LIFE'    ? 'ライフに加える' :
              act.type === 'BANISH_SUBSTITUTE' ? 'バニッシュ代わりの' :
              act.type === 'REVEAL'         ? '公開する' :
              act.type === 'TRANSFER_TO_DECK' ? 'デッキに加える' :
              act.type === 'BLOOD_CRYSTAL_ARMOR' ? '血晶武装する' :
              '';
            // パワー合計上限つき選択（「パワーの合計がN以下になるように好きな数」）
            if (inter.type === 'SELECT_TARGET' && inter.totalPowerMax !== undefined) {
              return `${from}パワーの合計が${inter.totalPowerMax}以下になるように${actionDesc}カードを好きな数選んでください`;
            }
            if (inter.selectionConstraint) {
              const c = inter.selectionConstraint;
              const constraintJa = c.distinct === 'level' ? 'それぞれレベルの異なる'
                : c.distinct === 'name' ? 'それぞれ名前の異なる'
                : c.distinct === 'class' ? 'それぞれクラスの異なる'
                : c.sharedColor === 'all' ? '全てに共通する色を持つ'
                : 'それぞれ共通する色を持たない';
              return `${from}${constraintJa}${actionDesc}カードを選んでください`;
            }
            const countStr = maxPick === 1 ? '' : `${maxPick}枚`;
            return `${from}${actionDesc}カードを${countStr}選んでください`;
          })();

          // 相手シグニ選択時はゾーン3→2→1の順（画面上の配置に合わせる）で表示
          const sortedCandidates = (inter.type === 'SELECT_TARGET' && inter.targetScope === 'opp_field')
            ? [...candidates].reverse()
            : candidates;

          // パワー合計上限つき選択時：現在の選択合計パワー
          const selectedPowerSum = (inter.type === 'SELECT_TARGET' && inter.totalPowerMax !== undefined)
            ? effectSelectedNums.reduce((s, i) => {
                const rawId = sortedCandidates[parseInt(i, 10)];
                return s + (rawId !== undefined ? (inter.candidatePowers?.[rawId] ?? 0) : 0);
              }, 0)
            : 0;
          const canConfirm = inter.type === 'SELECT_TARGET'
            ? (inter.totalPowerMax !== undefined
                ? selectedPowerSum <= inter.totalPowerMax  // 好きな数（0体含む）。合計上限内なら確定可
                : ((inter.optional || effectSelectedNums.length >= maxPick)
                  && satisfiesSelectionConstraint(
                    effectSelectedNums.map(i => sortedCandidates[parseInt(i, 10)]).filter((n): n is string => n !== undefined),
                    inter.selectionConstraint,
                    battleCardMap)))
            : effectSelectedNums.length <= maxPick
              && satisfiesSelectionConstraint(
                effectSelectedNums.map(i => sortedCandidates[parseInt(i, 10)]).filter((n): n is string => n !== undefined),
                inter.selectionConstraint,
                battleCardMap);

          // フィールド対象の場合: 各候補がどのゾーンに属するかをマッピング
          const fieldZoneInfo: number[] = (() => {
            if (inter.type !== 'SELECT_TARGET') return [];
            const scope = inter.targetScope;
            if (scope !== 'opp_field' && scope !== 'self_field' && scope !== 'both_field') return [];
            const states = scope === 'opp_field' ? [op] : scope === 'self_field' ? [my] : [my, op];
            return sortedCandidates.map(rawId => {
              for (const fs of states) for (let zi = 0; zi < 3; zi++) {
                const top = fs.field.signi[zi]?.at(-1);
                if (top === rawId || top === getCardNum(rawId)) return zi;
              }
              return -1;
            });
          })();
          // both_field: 各候補が自分/相手どちらのシグニかを示す（ゾーン番号と併記）
          const fieldSideInfo: string[] = (() => {
            if (inter.type !== 'SELECT_TARGET' || inter.targetScope !== 'both_field') return [];
            return sortedCandidates.map(rawId => {
              if (my.field.signi.some(s => s?.at(-1) === rawId || s?.at(-1) === getCardNum(rawId))) return '自分の';
              if (op.field.signi.some(s => s?.at(-1) === rawId || s?.at(-1) === getCardNum(rawId))) return '相手の';
              return '';
            });
          })();

          return createPortal(
            <div style={{ position: 'fixed', inset: 0, zIndex: 4000,
              backgroundColor: 'rgba(0,0,0,0.92)',
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
              <div onClick={e => e.stopPropagation()}
                style={{ backgroundColor: C.bgModal, border: C.borderUI, borderRadius: 12,
                  padding: '20px 16px', width: 'min(95vw, 400px)', maxHeight: '85vh',
                  display: 'flex', flexDirection: 'column', gap: 12 }}>
                <p style={{ color: C.textSub, fontSize: 12, margin: 0, textAlign: 'center' }}>
                  {srcCard?.CardName ?? pe.sourceCardNum}の効果
                </p>
                <p style={{ color: C.text, fontSize: 15, fontWeight: 'bold', margin: 0, textAlign: 'center',
                  padding: '6px 8px', backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 6 }}>
                  {label}
                </p>
                {inter.type === 'SELECT_TARGET' && inter.targetScope === 'opp_hand' && (
                  <p style={{ color: C.textDim, fontSize: 10, margin: 0, textAlign: 'center' }}>
                    対戦相手の手札（全{op.hand.length}枚を確認・選べるカードのみ枠が明るい）
                  </p>
                )}
                <div style={{ overflowY: 'auto', display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}>
                  {/* opp_hand「見て選び」では相手の手札全体を表示（候補のみ選択可・非候補はグレー） */}
                  {(inter.type === 'SELECT_TARGET' && inter.targetScope === 'opp_hand' ? op.hand : sortedCandidates).map((rawId, dispIdx) => {
                    const isOppHandView = inter.type === 'SELECT_TARGET' && inter.targetScope === 'opp_hand';
                    const candIdx = isOppHandView ? sortedCandidates.indexOf(rawId) : dispIdx;
                    const selectable = candIdx >= 0;
                    // インスタンスID（CardNum#N）からCardNumを取り出して表示用データを取得
                    const cardNum = getCardNum(rawId);
                    const c = battleCardMap.get(cardNum);
                    // インデックス文字列で管理 → 同名カードでも個別に選択できる
                    const idxStr = String(candIdx);
                    const isSel = selectable && effectSelectedNums.includes(idxStr);
                    // フィールド対象の場合のゾーン番号（candidates[idx] = zone idx が対応）
                    const zoneIdx = selectable ? fieldZoneInfo[candIdx] : undefined;
                    return (
                      <div key={dispIdx} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                        <div
                          data-testid={selectable ? `pick-${candIdx}` : undefined}
                          data-card-num={selectable ? cardNum : undefined}
                          onPointerDown={() => {
                            pickLongPressTimer.current = setTimeout(() => {
                              setExpandedPickImgUrl(c?.ImgURL ?? null);
                            }, 500);
                          }}
                          onPointerUp={() => { if (pickLongPressTimer.current) { clearTimeout(pickLongPressTimer.current); pickLongPressTimer.current = null; } }}
                          onPointerLeave={() => { if (pickLongPressTimer.current) { clearTimeout(pickLongPressTimer.current); pickLongPressTimer.current = null; } }}
                          onContextMenu={e => e.preventDefault()}
                          onClick={() => {
                            if (!selectable) return;
                            setEffectSelectedNums(prev => {
                              if (prev.includes(idxStr)) {
                                return prev.filter(x => x !== idxStr);
                              }
                              // パワー合計上限つき：加えると上限を超える候補は選択不可
                              if (inter.type === 'SELECT_TARGET' && inter.totalPowerMax !== undefined) {
                                const curSum = prev.reduce((s, i) => {
                                  const rid = sortedCandidates[parseInt(i, 10)];
                                  return s + (rid !== undefined ? (inter.candidatePowers?.[rid] ?? 0) : 0);
                                }, 0);
                                const addP = inter.candidatePowers?.[rawId] ?? 0;
                                if (curSum + addP > inter.totalPowerMax) return prev;
                                return [...prev, idxStr];
                              }
                              if (inter.selectionConstraint) {
                                const selected = prev.map(i => sortedCandidates[parseInt(i, 10)]).filter((n): n is string => n !== undefined);
                                if (!canAddToSelection(selected, rawId, inter.selectionConstraint, battleCardMap)) return prev;
                              }
                              if (prev.length >= maxPick) return prev;
                              return [...prev, idxStr];
                            });
                          }}
                          style={{ position: 'relative', width: 60, height: 84, borderRadius: 4,
                            border: isSel ? '2px solid #f44336' : C.borderCard,
                            cursor: selectable ? 'pointer' : 'default',
                            opacity: selectable ? 1 : 0.4, overflow: 'hidden', flexShrink: 0 }}>
                          {c ? (
                            <img src={c.ImgURL} alt={c.CardName} draggable={false}
                              style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          ) : (
                            <div style={{ width: '100%', height: '100%', backgroundColor: C.bgButton,
                              display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              <span style={{ fontSize: 8, color: C.textFaint }}>{cardNum}</span>
                            </div>
                          )}
                          {isSel && (
                            <div style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(244,67,54,0.4)',
                              display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              <span style={{ color: '#fff', fontSize: 20, fontWeight: 'bold' }}>✓</span>
                            </div>
                          )}
                        </div>
                        {zoneIdx !== undefined && zoneIdx >= 0 && (
                          <span style={{ fontSize: 9, color: '#9abcbc', lineHeight: 1 }}>
                            {(fieldSideInfo[candIdx] ?? '')}ゾーン{zoneIdx + 1}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  {inter.type === 'SELECT_TARGET' && inter.optional && (
                    <button onClick={() => handleEffectInteraction([])}
                      disabled={loading}
                      style={{ flex: 1, padding: '10px 0', borderRadius: 8, border: C.borderUI,
                        backgroundColor: 'transparent', color: C.textSub, fontSize: 13, cursor: 'pointer' }}>
                      スキップ
                    </button>
                  )}
                  {inter.type === 'SEARCH' && (
                    <button onClick={() => handleEffectInteraction([])}
                      disabled={loading}
                      style={{ flex: 1, padding: '10px 0', borderRadius: 8, border: C.borderUI,
                        backgroundColor: 'transparent', color: C.textSub, fontSize: 13, cursor: 'pointer' }}>
                      該当なし
                    </button>
                  )}
                  <button onClick={() => {
                    // インデックス文字列 → CardNum に変換してから渡す
                    const selectedNums = effectSelectedNums.map(i => sortedCandidates[parseInt(i, 10)] ?? i);
                    handleEffectInteraction(selectedNums);
                  }}
                    disabled={loading || !canConfirm}
                    style={{ flex: 2, padding: '10px 0', borderRadius: 8, border: 'none',
                      backgroundColor: canConfirm ? C.success : C.disabled,
                      color: C.text, fontSize: 14, fontWeight: 'bold',
                      cursor: (loading || !canConfirm) ? 'default' : 'pointer' }}>
                    {inter.type === 'SELECT_TARGET' && inter.totalPowerMax !== undefined
                      ? `決定 (合計${selectedPowerSum}/${inter.totalPowerMax})`
                      : `決定 (${effectSelectedNums.length}/${maxPick})`}
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          );
        }

        // CHOOSE：選択肢ボタン（任意コスト付きの場合はエナ選択UIを統合）
        if (inter.type === 'CHOOSE') {
          const payOpt = inter.options.find(o => o.id === 'pay' && o.costColors?.length);
          const skipOpt = inter.options.find(o => o.id === 'skip');
          const isOptionalCost = !!payOpt;

          if (isOptionalCost) {
            // 任意コスト: エナ選択 + 発動/スキップボタン
            const costColors = payOpt!.costColors!;
            const totalReq = costColors.length;
            const selectedNums = [...selectedOptCost].map(i => my.energy[i]);
            const colorValid = (() => {
              const needed = [...costColors];
              for (const n of selectedNums) {
                const color = battleCardMap.get(n)?.Color ?? '無';
                // 色一致コストを優先して消費し、なければ無色枠に充てる（多色カード対応・エンジン側resumeOptionalCostと同一ロジック。「青|黒」選択肢スロットも考慮）
                let idx = needed.findIndex(c => !costSlotIsAny(c) && energyMatchesCostSlot(color, c));
                if (idx === -1) idx = needed.findIndex(c => costSlotIsAny(c));
                if (idx === -1) return false;
                needed.splice(idx, 1);
              }
              return needed.length === 0;
            })();
            const canConfirm = selectedOptCost.size === totalReq && colorValid;

            return createPortal(
              <div style={{ position: 'fixed', inset: 0, zIndex: 4000,
                backgroundColor: 'rgba(0,0,0,0.92)',
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
                <div onClick={e => e.stopPropagation()}
                  style={{ backgroundColor: C.bgModal, border: C.borderUI, borderRadius: 12,
                    padding: '16px', width: 'min(94vw, 380px)', maxHeight: '80vh',
                    display: 'flex', flexDirection: 'column', gap: 10, overflowY: 'auto' }}>
                  <p style={{ color: C.textSub, fontSize: 14, fontWeight: 'bold', margin: 0, textAlign: 'center' }}>
                    {srcCard?.CardName ?? pe.sourceCardNum}の効果
                  </p>
                  <p style={{ color: C.text, fontSize: 12, margin: 0, textAlign: 'center' }}>
                    コスト: {costColors.map(formatCostSlot).join('')} を支払いますか？
                  </p>
                  <p style={{ color: canConfirm ? C.success : C.textMuted, fontSize: 11, margin: 0, textAlign: 'center' }}>
                    エナから選択: {selectedOptCost.size} / {totalReq}枚
                    {costColors.map((c, i) => <span key={i} style={{ marginLeft: 4, color: C.textDim }}>({c.split('|').join('か')})</span>)}
                  </p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center' }}>
                    {my.energy.length === 0
                      ? <p style={{ color: C.textFaint, fontSize: 12 }}>エナがありません</p>
                      : my.energy.map((num, i) => {
                          const card = battleCardMap.get(num);
                          const isSel = selectedOptCost.has(i);
                          return (
                            <div key={i}
                              data-testid={`optcost-energy-${i}`}
                              onClick={() => setSelectedOptCost(prev => {
                                const next = new Set(prev);
                                isSel ? next.delete(i) : next.add(i);
                                return next;
                              })}
                              style={{ width: 52, cursor: 'pointer', borderRadius: 4, overflow: 'hidden',
                                border: isSel ? `2px solid ${C.success}` : '2px solid transparent',
                                opacity: isSel ? 1 : 0.75 }}>
                              <img src={card?.ImgURL ?? '/ErrerCard.webp'} alt={card?.CardName ?? num}
                                style={{ width: '100%', aspectRatio: '3/4', objectFit: 'cover', display: 'block' }}
                                onError={e => { const img = e.target as HTMLImageElement; if (!img.src.endsWith('/ErrerCard.webp')) img.src = '/ErrerCard.webp'; }} />
                              <div style={{ backgroundColor: 'rgba(0,0,0,0.6)', textAlign: 'center', padding: '1px 2px' }}>
                                <span style={{ fontSize: 9, color: '#fff' }}>{card?.Color ?? '?'}</span>
                              </div>
                            </div>
                          );
                        })
                    }
                  </div>
                  <button
                    data-testid="optcost-pay"
                    disabled={loading || !canConfirm || !payOpt.available}
                    onClick={() => { handleEffectInteraction(['pay', ...selectedNums]); setSelectedOptCost(new Set()); }}
                    style={{ padding: '12px 0', borderRadius: 8, border: 'none',
                      backgroundColor: (canConfirm && payOpt.available) ? C.success : C.disabled,
                      color: C.text, fontSize: 13, fontWeight: 'bold',
                      cursor: (canConfirm && payOpt.available && !loading) ? 'pointer' : 'default' }}>
                    {payOpt.label}
                  </button>
                  <button
                    data-testid="optcost-skip"
                    disabled={loading}
                    onClick={() => { handleEffectInteraction([skipOpt?.id ?? 'skip']); setSelectedOptCost(new Set()); }}
                    style={{ padding: '10px 0', borderRadius: 8, border: C.borderUI,
                      backgroundColor: 'transparent', color: C.textDim, fontSize: 13,
                      cursor: loading ? 'default' : 'pointer' }}>
                    {skipOpt?.label ?? 'スキップ'}
                  </button>
                </div>
              </div>,
              document.body,
            );
          }

          // multiSelect: 複数選択UI（チェックボックス＋決定ボタン）
          if (inter.multiSelect) {
            const maxSel = inter.count;
            const canConfirm = inter.upTo
              ? true
              : selectedMultiChoiceIds.size === maxSel;
            return createPortal(
              <div style={{ position: 'fixed', inset: 0, zIndex: 4000,
                backgroundColor: 'rgba(0,0,0,0.92)',
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
                <div onClick={e => e.stopPropagation()}
                  style={{ backgroundColor: C.bgModal, border: C.borderUI, borderRadius: 12,
                    padding: '20px 16px', width: 'min(92vw, 380px)',
                    display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <p style={{ color: C.textSub, fontSize: 14, fontWeight: 'bold', margin: 0, textAlign: 'center' }}>
                    {srcCard?.CardName ?? pe.sourceCardNum}の効果
                  </p>
                  <p style={{ color: C.text, fontSize: 13, margin: 0, textAlign: 'center' }}>
                    {inter.upTo ? `${maxSel}個まで選択` : `${maxSel}個選択`}（{selectedMultiChoiceIds.size}/{maxSel}）
                  </p>
                  {inter.options.map(opt => {
                    const isSel = selectedMultiChoiceIds.has(opt.id);
                    const canAdd = isSel || (opt.available && selectedMultiChoiceIds.size < maxSel);
                    return (
                      <button key={opt.id}
                        disabled={loading || (!isSel && !canAdd)}
                        onClick={() => setSelectedMultiChoiceIds(prev => {
                          const next = new Set(prev);
                          isSel ? next.delete(opt.id) : next.add(opt.id);
                          return next;
                        })}
                        style={{ padding: '12px 8px', borderRadius: 8, border: 'none',
                          backgroundColor: isSel ? C.success : (opt.available ? C.bgButton : C.disabled),
                          color: C.text, fontSize: 13, fontWeight: 'bold', textAlign: 'left',
                          cursor: (loading || (!isSel && !canAdd)) ? 'default' : 'pointer',
                          outline: isSel ? `2px solid ${C.success}` : 'none' }}>
                        {isSel ? '✓ ' : ''}{opt.label}
                      </button>
                    );
                  })}
                  <button
                    disabled={loading || !canConfirm}
                    onClick={() => {
                      handleEffectInteraction([...selectedMultiChoiceIds]);
                      setSelectedMultiChoiceIds(new Set());
                    }}
                    style={{ padding: '12px 0', borderRadius: 8, border: 'none',
                      backgroundColor: canConfirm ? C.success : C.disabled,
                      color: C.text, fontSize: 14, fontWeight: 'bold',
                      cursor: (loading || !canConfirm) ? 'default' : 'pointer' }}>
                    決定
                  </button>
                </div>
              </div>,
              document.body,
            );
          }

          return createPortal(
            <div style={{ position: 'fixed', inset: 0, zIndex: 4000,
              backgroundColor: 'rgba(0,0,0,0.92)',
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
              <div onClick={e => e.stopPropagation()}
                style={{ backgroundColor: C.bgModal, border: C.borderUI, borderRadius: 12,
                  padding: '20px 16px', width: 'min(92vw, 360px)',
                  display: 'flex', flexDirection: 'column', gap: 12 }}>
                <p style={{ color: C.textSub, fontSize: 14, fontWeight: 'bold', margin: 0, textAlign: 'center' }}>
                  {srcCard?.CardName ?? pe.sourceCardNum}の効果
                </p>
                <p style={{ color: C.text, fontSize: 13, margin: 0, textAlign: 'center' }}>効果を選択してください</p>
                {inter.options.map(opt => (
                  <button key={opt.id}
                    disabled={loading || !opt.available}
                    onClick={() => handleEffectInteraction([opt.id])}
                    style={{ padding: '12px 0', borderRadius: 8, border: 'none',
                      backgroundColor: opt.available ? C.success : C.disabled,
                      color: C.text, fontSize: 13, fontWeight: 'bold',
                      cursor: (!opt.available || loading) ? 'default' : 'pointer' }}>
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>,
            document.body,
          );
        }

        // LOOK_AND_REORDER：デッキトップのカードを見て並べ替え
        if (inter.type === 'LOOK_AND_REORDER') {
          const moveCard = (idx: number, dir: -1 | 1) => {
            const newOrder = [...lookReorderOrder];
            const swapIdx = idx + dir;
            if (swapIdx < 0 || swapIdx >= newOrder.length) return;
            [newOrder[idx], newOrder[swapIdx]] = [newOrder[swapIdx], newOrder[idx]];
            setLookReorderOrder(newOrder);
          };
          const toggleTrash = (cardNum: string) => {
            setLookReorderTrash(prev => {
              const next = new Set(prev);
              if (next.has(cardNum)) next.delete(cardNum); else next.add(cardNum);
              return next;
            });
          };
          const toggleBottom = (cardNum: string) => {
            setLookReorderBottom(prev => {
              const next = new Set(prev);
              if (next.has(cardNum)) next.delete(cardNum); else next.add(cardNum);
              return next;
            });
          };
          const isSplit = inter.destPosition === 'split_top_bottom';
          const trashCount = lookReorderOrder.filter(n => lookReorderTrash.has(n)).length;
          const topCount = isSplit ? lookReorderOrder.filter(n => !lookReorderBottom.has(n)).length : 0;
          return createPortal(
            <div style={{ position: 'fixed', inset: 0, zIndex: 4000,
              backgroundColor: 'rgba(0,0,0,0.92)',
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
              <div onClick={e => e.stopPropagation()}
                style={{ backgroundColor: C.bgModal, border: C.borderUI, borderRadius: 12,
                  padding: '20px 16px', width: 'min(95vw, 400px)',
                  display: 'flex', flexDirection: 'column', gap: 12 }}>
                <p style={{ color: C.textSub, fontSize: 14, fontWeight: 'bold', margin: 0, textAlign: 'center' }}>
                  {srcCard?.CardName ?? pe.sourceCardNum}の効果
                </p>
                <p style={{ color: C.text, fontSize: 13, margin: 0, textAlign: 'center' }}>
                  {isSplit
                    ? `好きな枚数を「上」（デッキトップ）に、残りを「下」（デッキ下）に置いてください ／ 上:${topCount}枚`
                    : inter.canTrash
                    ? `トラッシュに置くカードを選び、残りを並べ替えてください（上がデッキトップ）${trashCount > 0 ? ` ／ トラッシュ:${trashCount}枚` : ''}`
                    : inter.destPosition === 'first_top_rest_bottom'
                    ? '1枚目をデッキトップへ戻し、残りはデッキ下へ（上が優先）'
                    : 'カードを見て並べ替えてください（上がデッキトップ）'}
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {lookReorderOrder.map((cardNum, i) => {
                    const c = battleCardMap.get(cardNum);
                    const isTrashed = inter.canTrash && lookReorderTrash.has(cardNum);
                    const isBottom = isSplit && lookReorderBottom.has(cardNum);
                    return (
                      <div key={cardNum} style={{ display: 'flex', alignItems: 'center', gap: 8,
                        backgroundColor: C.bgButton, borderRadius: 6, padding: '6px 8px',
                        opacity: isTrashed ? 0.45 : 1 }}>
                        <span style={{ color: isSplit ? (isBottom ? C.textDim : C.success) : C.textDim, fontSize: 11, width: 16 }}>
                          {isTrashed ? '×' : isSplit ? (isBottom ? '下' : '上') : i + 1}</span>
                        <img src={c?.ImgURL} alt={c?.CardName} draggable={false}
                          onClick={() => setExpandedPickImgUrl(c?.ImgURL ?? null)}
                          style={{ width: 36, height: 50, objectFit: 'cover', borderRadius: 3, flexShrink: 0,
                            cursor: 'pointer',
                            filter: isTrashed || isBottom ? 'grayscale(1)' : 'none' }}
                          onError={e2 => { const img = e2.target as HTMLImageElement; if (!img.src.endsWith('/ErrerCard.webp')) img.src = '/ErrerCard.webp'; }} />
                        <span style={{ color: C.textSub, fontSize: 12, flex: 1,
                          textDecoration: isTrashed ? 'line-through' : 'none' }}>{c?.CardName ?? cardNum}</span>
                        {isSplit && (
                          <button onClick={() => toggleBottom(cardNum)}
                            style={{ padding: '4px 8px', fontSize: 11, borderRadius: 4,
                              border: C.borderUI, backgroundColor: isBottom ? 'transparent' : C.success,
                              color: C.text, cursor: 'pointer', flexShrink: 0, width: 44 }}>
                            {isBottom ? '下' : '上'}
                          </button>
                        )}
                        {inter.canTrash && (
                          <button onClick={() => toggleTrash(cardNum)}
                            style={{ padding: '4px 8px', fontSize: 11, borderRadius: 4,
                              border: C.borderUI, backgroundColor: isTrashed ? C.danger : 'transparent',
                              color: C.text, cursor: 'pointer', flexShrink: 0 }}>
                            {isTrashed ? '戻す' : 'トラッシュ'}
                          </button>
                        )}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                          <button onClick={() => moveCard(i, -1)} disabled={i === 0 || isTrashed}
                            style={{ padding: '2px 8px', fontSize: 11, borderRadius: 4,
                              border: C.borderUI, backgroundColor: 'transparent',
                              color: (i === 0 || isTrashed) ? C.textDim : C.text, cursor: (i === 0 || isTrashed) ? 'default' : 'pointer' }}>↑</button>
                          <button onClick={() => moveCard(i, 1)} disabled={i === lookReorderOrder.length - 1 || isTrashed}
                            style={{ padding: '2px 8px', fontSize: 11, borderRadius: 4,
                              border: C.borderUI, backgroundColor: 'transparent',
                              color: (i === lookReorderOrder.length - 1 || isTrashed) ? C.textDim : C.text,
                              cursor: (i === lookReorderOrder.length - 1 || isTrashed) ? 'default' : 'pointer' }}>↓</button>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <button onClick={() => { handleEffectInteraction(lookReorderOrder); setLookReorderOrder([]); setLookReorderTrash(new Set()); setLookReorderBottom(new Set()); }}
                  disabled={loading}
                  style={{ padding: '11px 0', borderRadius: 8, border: 'none',
                    backgroundColor: loading ? C.disabled : C.success,
                    color: C.text, fontSize: 14, fontWeight: 'bold',
                    cursor: loading ? 'default' : 'pointer' }}>
                  決定
                </button>
              </div>
            </div>,
            document.body,
          );
        }

        // SELECT_ZONE：効果によるデッキトップのカードのゾーン選択
        if (inter.type === 'SELECT_ZONE') {
          const placeCard = battleCardMap.get(inter.cardNum);
          return createPortal(
            <div style={{ position: 'fixed', inset: 0, zIndex: 4000,
              backgroundColor: 'rgba(0,0,0,0.92)',
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
              <div onClick={e => e.stopPropagation()}
                style={{ backgroundColor: C.bgModal, border: C.borderUI, borderRadius: 12,
                  padding: '20px 16px', width: 'min(95vw, 380px)',
                  display: 'flex', flexDirection: 'column', gap: 14 }}>
                <p style={{ color: C.textSub, fontSize: 14, fontWeight: 'bold', margin: 0, textAlign: 'center' }}>
                  {srcCard?.CardName ?? pe.sourceCardNum}の効果
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                  <img src={placeCard?.ImgURL} alt={placeCard?.CardName}
                    style={{ width: 60, height: 84, objectFit: 'cover', borderRadius: 6 }}
                    onError={e2 => { const img = e2.target as HTMLImageElement; if (!img.src.endsWith('/ErrerCard.webp')) img.src = '/ErrerCard.webp'; }} />
                  <p style={{ color: C.text, fontSize: 13, margin: 0 }}>
                    {placeCard?.CardName ?? inter.cardNum}
                  </p>
                </div>
                <p style={{ color: C.textDim, fontSize: 12, margin: 0, textAlign: 'center' }}>
                  場に出すゾーンを選択してください
                </p>
                <div style={{ display: 'flex', gap: 8 }}>
                  {([0, 1, 2] as const).map(zi => {
                    const isOccupied = (my.field.signi[zi] ?? []).length > 0;
                    return (
                      <button key={zi}
                        onClick={() => !isOccupied && !loading && handleSelectZoneForEffect(zi)}
                        disabled={isOccupied || loading}
                        style={{ flex: 1, padding: '12px 0', borderRadius: 8,
                          border: isOccupied ? `1px solid ${C.textFaint}` : C.borderUI,
                          backgroundColor: isOccupied ? C.disabled : C.bgButton,
                          color: isOccupied ? C.textFaint : C.text,
                          fontSize: 13, cursor: isOccupied || loading ? 'default' : 'pointer' }}>
                        ゾーン{zi + 1}{isOccupied ? '\n(使用中)' : ''}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>,
            document.body,
          );
        }

        // SELECT_SIGNI_ZONE：トラッシュ/エナ/手札などから場に出す際のゾーン選択
        // REARRANGE_SIGNI：シグニを好きなように配置し直す（各シグニにゾーンを割り当て）
        if (inter.type === 'REARRANGE_SIGNI') {
          const ownerLabelRS = inter.owner === 'opponent' ? '相手の' : '自分の';
          const assignZoneRS = (signi: string, z: number) => {
            setRearrangeSlots(prev => {
              const next = prev.map(x => (x === signi ? null : x));
              next[z] = signi;
              return next;
            });
          };
          const allAssignedRS = inter.signiNums.every(n => rearrangeSlots.includes(n));
          return createPortal(
            <div style={{ position: 'fixed', inset: 0, zIndex: 4000,
              backgroundColor: 'rgba(0,0,0,0.92)',
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
              <div onClick={e => e.stopPropagation()}
                style={{ backgroundColor: C.bgModal, border: C.borderUI, borderRadius: 12,
                  padding: '20px 16px', width: 'min(95vw, 420px)', maxHeight: '85vh', overflowY: 'auto',
                  display: 'flex', flexDirection: 'column', gap: 12 }}>
                <p style={{ color: C.textSub, fontSize: 14, fontWeight: 'bold', margin: 0, textAlign: 'center' }}>
                  {srcCard?.CardName ?? pe.sourceCardNum}の効果
                </p>
                <p style={{ color: C.textDim, fontSize: 12, margin: 0, textAlign: 'center' }}>
                  {ownerLabelRS}シグニを好きなように配置し直してください（各シグニのゾーンを選択）
                </p>
                {/* 新しい配置プレビュー */}
                <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
                  {([0, 1, 2] as const).map(zi => {
                    const occ = rearrangeSlots[zi];
                    const c = occ ? battleCardMap.get(getCardNum(occ)) : undefined;
                    return (
                      <div key={zi} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                        <div style={{ width: 52, height: 73, borderRadius: 4, border: C.borderCard,
                          backgroundColor: C.bgButton, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          {c ? <img src={c.ImgURL} alt={c.CardName} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                             : <span style={{ fontSize: 9, color: C.textFaint }}>空き</span>}
                        </div>
                        <span style={{ fontSize: 10, color: C.textDim }}>ゾーン{zi + 1}</span>
                      </div>
                    );
                  })}
                </div>
                {/* 各シグニのゾーン割り当て */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {inter.signiNums.map(n => {
                    const c = battleCardMap.get(getCardNum(n));
                    const curZone = rearrangeSlots.indexOf(n);
                    return (
                      <div key={n} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <img src={c?.ImgURL} alt={c?.CardName}
                          style={{ width: 34, height: 48, objectFit: 'cover', borderRadius: 3, flexShrink: 0 }} />
                        <span style={{ flex: 1, fontSize: 11, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c?.CardName ?? n}</span>
                        {([0, 1, 2] as const).map(z => (
                          <button key={z} onClick={() => assignZoneRS(n, z)} disabled={loading}
                            style={{ width: 30, padding: '6px 0', borderRadius: 6,
                              border: curZone === z ? `2px solid ${C.success}` : C.borderUI,
                              backgroundColor: curZone === z ? C.success : C.bgButton,
                              color: C.text, fontSize: 12, cursor: 'pointer' }}>
                            {z + 1}
                          </button>
                        ))}
                      </div>
                    );
                  })}
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  {inter.optional && (
                    <button onClick={() => handleRearrangeSigniConfirm(null)} disabled={loading}
                      style={{ flex: 1, padding: '10px 0', borderRadius: 8, border: C.borderUI,
                        backgroundColor: 'transparent', color: C.textSub, fontSize: 13, cursor: 'pointer' }}>
                      配置し直さない
                    </button>
                  )}
                  <button
                    onClick={() => allAssignedRS && handleRearrangeSigniConfirm(rearrangeSlots.map(s => s ?? ''))}
                    disabled={!allAssignedRS || loading}
                    style={{ flex: 2, padding: '10px 0', borderRadius: 8, border: 'none',
                      backgroundColor: allAssignedRS && !loading ? C.success : C.disabled,
                      color: C.text, fontSize: 14, fontWeight: 'bold',
                      cursor: allAssignedRS && !loading ? 'pointer' : 'default' }}>
                    配置を確定
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          );
        }

        if (inter.type === 'SELECT_SIGNI_ZONE') {
          const placeCardSSZ = battleCardMap.get(inter.cardNum);
          const ownerIsHostSSZ = pe.sourcePlayerId === bs.host_id;
          const tgtIsHostSSZ = inter.owner === 'self' ? ownerIsHostSSZ : !ownerIsHostSSZ;
          const tgtStateSSZ = tgtIsHostSSZ ? bs.host_state : bs.guest_state;
          return createPortal(
            <div style={{ position: 'fixed', inset: 0, zIndex: 4000,
              backgroundColor: 'rgba(0,0,0,0.92)',
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
              <div onClick={e => e.stopPropagation()}
                style={{ backgroundColor: C.bgModal, border: C.borderUI, borderRadius: 12,
                  padding: '20px 16px', width: 'min(95vw, 380px)',
                  display: 'flex', flexDirection: 'column', gap: 14 }}>
                <p style={{ color: C.textSub, fontSize: 14, fontWeight: 'bold', margin: 0, textAlign: 'center' }}>
                  {srcCard?.CardName ?? pe.sourceCardNum}の効果
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                  <img src={placeCardSSZ?.ImgURL} alt={placeCardSSZ?.CardName}
                    style={{ width: 60, height: 84, objectFit: 'cover', borderRadius: 6 }}
                    onError={e2 => { const img = e2.target as HTMLImageElement; if (!img.src.endsWith('/ErrerCard.webp')) img.src = '/ErrerCard.webp'; }} />
                  <p style={{ color: C.text, fontSize: 13, margin: 0 }}>
                    {placeCardSSZ?.CardName ?? inter.cardNum}
                  </p>
                </div>
                <p style={{ color: C.textDim, fontSize: 12, margin: 0, textAlign: 'center' }}>
                  場に出すゾーンを選択してください
                </p>
                <div style={{ display: 'flex', gap: 8 }}>
                  {([0, 1, 2] as const).map(zi => {
                    const isOccupied = (tgtStateSSZ.field.signi[zi] ?? []).length > 0;
                    return (
                      <button key={zi}
                        onClick={() => !isOccupied && !loading && handleSelectSigniZoneForEffect(zi)}
                        disabled={isOccupied || loading}
                        style={{ flex: 1, padding: '12px 0', borderRadius: 8,
                          border: isOccupied ? `1px solid ${C.textFaint}` : C.borderUI,
                          backgroundColor: isOccupied ? C.disabled : C.bgButton,
                          color: isOccupied ? C.textFaint : C.text,
                          fontSize: 13, cursor: isOccupied || loading ? 'default' : 'pointer' }}>
                        ゾーン{zi + 1}{isOccupied ? '\n(使用中)' : ''}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>,
            document.body,
          );
        }

        // SELECT_VIRUS_ZONE：【ウィルス】を置くシグニゾーンの選択
        if (inter.type === 'SELECT_VIRUS_ZONE') {
          const ownerIsHost = pe.sourcePlayerId === bs.host_id;
          const tgtIsHost = inter.owner === 'self' ? ownerIsHost : !ownerIsHost;
          const tgtState = tgtIsHost ? bs.host_state : bs.guest_state;
          const tgtVirus = tgtState.field.signi_virus ?? [0, 0, 0];
          const tgtLabel = inter.owner === 'opponent' ? '相手の' : '自分の';
          return createPortal(
            <div style={{ position: 'fixed', inset: 0, zIndex: 4000,
              backgroundColor: 'rgba(0,0,0,0.92)',
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
              <div onClick={e => e.stopPropagation()}
                style={{ backgroundColor: C.bgModal, border: C.borderUI, borderRadius: 12,
                  padding: '20px 16px', width: 'min(95vw, 380px)',
                  display: 'flex', flexDirection: 'column', gap: 14 }}>
                <p style={{ color: C.textSub, fontSize: 14, fontWeight: 'bold', margin: 0, textAlign: 'center' }}>
                  {srcCard?.CardName ?? pe.sourceCardNum}の効果
                </p>
                <p style={{ color: C.textDim, fontSize: 12, margin: 0, textAlign: 'center' }}>
                  {tgtLabel}【ウィルス】を置くシグニゾーンを選択してください
                  {inter.remainingZones > 1 ? `（残り${inter.remainingZones}ゾーン）` : ''}
                </p>
                <div style={{ display: 'flex', gap: 8 }}>
                  {([2, 1, 0] as const).map(zi => {
                    const hasVirus = (tgtVirus[zi] ?? 0) > 0;
                    // powerDeltaOnZone（WD19-009等）はウィルス済みゾーンも選択可（パワー修正のみ適用）
                    const selectable = !hasVirus || inter.powerDeltaOnZone !== undefined;
                    const signiName = battleCardMap.get(tgtState.field.signi[zi]?.at(-1) ?? '')?.CardName;
                    return (
                      <button key={zi}
                        onClick={() => selectable && !loading && handleSelectVirusZoneForEffect(zi)}
                        disabled={!selectable || loading}
                        style={{ flex: 1, padding: '12px 4px', borderRadius: 8,
                          border: !selectable ? `1px solid ${C.textFaint}` : C.borderUI,
                          backgroundColor: !selectable ? C.disabled : C.bgButton,
                          color: !selectable ? C.textFaint : C.text,
                          fontSize: 12, whiteSpace: 'pre-wrap',
                          cursor: !selectable || loading ? 'default' : 'pointer' }}>
                        {`ゾーン${zi + 1}\n${hasVirus ? '(ウィルスあり)' : (signiName ?? '(空き)')}${hasVirus && signiName ? `\n${signiName}` : ''}`}
                      </button>
                    );
                  })}
                </div>
                {inter.upTo && (
                  <button onClick={() => !loading && handleSelectVirusZoneForEffect(null)}
                    disabled={loading}
                    style={{ padding: '10px 0', borderRadius: 8, border: C.borderUI,
                      backgroundColor: 'transparent', color: C.textSub, fontSize: 13,
                      cursor: loading ? 'default' : 'pointer' }}>
                    配置を終了する
                  </button>
                )}
              </div>
            </div>,
            document.body,
          );
        }

        return null;
      })()}

    </>
  );
}
