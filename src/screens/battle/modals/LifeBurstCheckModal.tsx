// ライフバースト確認（自分のチェックゾーン）＋カード拡大＋相手クラッシュ確認（読み取り専用）。BattleScreen.tsx から Stage 1 で抽出。
import type { Dispatch, SetStateAction } from 'react';
import { createPortal } from 'react-dom';
import type { PlayerState } from '../../../types';
import { C } from '../../../components/BoardComponents';
import type { BattleModalCtx } from './types';

interface LifeBurstCheckModalProps {
  ctx: BattleModalCtx;
  eichiSuppressActive: boolean;
  matchesAllZoneBurstGrant: (cardNum: string, ownerState: PlayerState) => boolean;
  burstCardZoomed: boolean;
  setBurstCardZoomed: Dispatch<SetStateAction<boolean>>;
  opCheckCardZoomed: boolean;
  setOpCheckCardZoomed: Dispatch<SetStateAction<boolean>>;
  handleLifeBurstResponse: (activate: boolean, targetCardNum?: string) => void;
}

export function LifeBurstCheckModal(p: LifeBurstCheckModalProps) {
  const { my, op, loading, battleCardMap, effectsMap } = p.ctx;
  const { eichiSuppressActive, matchesAllZoneBurstGrant, burstCardZoomed, setBurstCardZoomed, opCheckCardZoomed, setOpCheckCardZoomed, handleLifeBurstResponse } = p;
  return (
    <>
      {/* ライフバースト確認（自分のチェックゾーンにカードがある場合） */}
      {my.field.check && createPortal(
        <div style={{
          position: 'fixed', inset: 0, zIndex: 4500,
          backgroundColor: 'rgba(0,0,0,0.92)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 20,
        }}>
          {(() => {
            const allCrashCards = [my.field.check!, ...(my.pending_crashed_cards ?? [])];
            const cardCount = allCrashCards.length;
            const modalWidth = cardCount === 1 ? 'min(88vw, 320px)' : `min(96vw, ${160 * cardCount + 40}px)`;
            return (
              <div style={{
                backgroundColor: C.bgModal, border: C.borderUI, borderRadius: 12,
                padding: '24px 20px', width: modalWidth,
                display: 'flex', flexDirection: 'column', gap: 14, textAlign: 'center',
              }}>
                <p style={{ color: C.life, fontSize: 15, fontWeight: 'bold', margin: 0 }}>
                  {cardCount === 1 ? 'ライフクロスクラッシュ' : 'ダブルクラッシュ（好きな順番でバースト選択）'}
                </p>
                <div style={{ display: 'flex', gap: 12, justifyContent: 'center', alignItems: 'flex-start' }}>
                  {allCrashCards.map((cardNum, idx) => {
                    const card = battleCardMap.get(cardNum);
                    // WD14-001 / WX17-036: 付与された【ライフバースト】も含めて判定（burstFilter 一致のみ）
                    const hasBurst = card?.LifeBurst === '1'
                      || (effectsMap.get(cardNum) ?? []).some(e => e.effectType === 'LIFE_BURST')
                      || matchesAllZoneBurstGrant(cardNum, my);
                    const burstSuppressed = !!(my.suppress_life_burst || eichiSuppressActive || my.game_suppress_lb);
                    return (
                      <div key={cardNum + idx} style={{
                        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                        flex: 1,
                        borderRadius: 8,
                        border: `1px solid ${C.borderUI}`,
                        padding: '8px 6px',
                      }}>
                        {card ? (
                          <>
                            <img src={card.ImgURL} alt={card.CardName}
                              onClick={() => setBurstCardZoomed(true)}
                              style={{ width: 72, height: 100, objectFit: 'cover', borderRadius: 6,
                                boxShadow: hasBurst ? `0 0 12px ${C.accent}` : 'none',
                                cursor: 'pointer' }}
                              onError={e => { const img = e.target as HTMLImageElement; if (!img.src.endsWith('/ErrerCard.webp')) img.src = '/ErrerCard.webp'; }} />
                            <p style={{ color: C.textSub, fontSize: 11, fontWeight: 'bold', margin: 0 }}>
                              {card.CardName}
                            </p>
                          </>
                        ) : (
                          <div style={{ width: 72, height: 100, backgroundColor: C.bgButton, borderRadius: 6 }} />
                        )}
                        {hasBurst && !burstSuppressed ? (
                          <>
                            <p style={{ color: C.accent, fontSize: 11, fontWeight: 'bold', margin: 0 }}>
                              ライフバーストあり
                            </p>
                            <button onClick={() => handleLifeBurstResponse(true, cardNum)}
                              disabled={loading}
                              style={{ width: '100%', padding: '8px 0', borderRadius: 8, border: 'none',
                                backgroundColor: loading ? C.disabled : C.accent,
                                color: C.text, fontSize: 12, fontWeight: 'bold',
                                cursor: loading ? 'default' : 'pointer' }}>
                              ライフバースト発動
                            </button>
                            <button onClick={() => handleLifeBurstResponse(false, cardNum)}
                              disabled={loading}
                              style={{ width: '100%', padding: '8px 0', borderRadius: 8, border: C.borderUI,
                                backgroundColor: 'transparent',
                                color: C.textDim, fontSize: 12,
                                cursor: loading ? 'default' : 'pointer' }}>
                              エナに送る
                            </button>
                          </>
                        ) : (
                          <>
                            {hasBurst && burstSuppressed && (
                              <p style={{ color: C.textDim, fontSize: 10, margin: 0 }}>バースト抑制中</p>
                            )}
                            {!hasBurst && (
                              <p style={{ color: C.textFaint, fontSize: 10, margin: 0 }}>ライフバーストなし</p>
                            )}
                            <button onClick={() => handleLifeBurstResponse(false, cardNum)}
                              disabled={loading}
                              style={{ width: '100%', padding: '8px 0', borderRadius: 8, border: 'none',
                                backgroundColor: loading ? C.disabled : C.bgButton,
                                color: C.text, fontSize: 12, fontWeight: 'bold',
                                cursor: loading ? 'default' : 'pointer' }}>
                              エナに送る
                            </button>
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}
        </div>,
        document.body,
      )}

      {/* ライフクロスクラッシュ カード拡大 */}
      {burstCardZoomed && my.field.check && (() => {
        const zCard = battleCardMap.get(my.field.check);
        if (!zCard) return null;
        return createPortal(
          <div
            onClick={() => setBurstCardZoomed(false)}
            onTouchEnd={e => { e.preventDefault(); setBurstCardZoomed(false); }}
            style={{ position: 'fixed', inset: 0, zIndex: 5000,
              backgroundColor: 'rgba(0,0,0,0.85)',
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
            <img src={zCard.ImgURL} alt={zCard.CardName} draggable={false}
              style={{ maxWidth: '80vw', maxHeight: '70vh', borderRadius: 10, objectFit: 'contain' }}
              onError={e => { const img = e.target as HTMLImageElement; if (!img.src.endsWith('/ErrerCard.webp')) img.src = '/ErrerCard.webp'; }} />
            <span style={{ color: C.textFaint, fontSize: 12 }}>タップで閉じる</span>
          </div>,
          document.body,
        );
      })()}

      {/* 相手ライフクロスクラッシュ カード拡大 */}
      {opCheckCardZoomed && op.field.check && (() => {
        const zCard = battleCardMap.get(op.field.check);
        if (!zCard) return null;
        return createPortal(
          <div
            onClick={() => setOpCheckCardZoomed(false)}
            onTouchEnd={e => { e.preventDefault(); setOpCheckCardZoomed(false); }}
            style={{ position: 'fixed', inset: 0, zIndex: 5000,
              backgroundColor: 'rgba(0,0,0,0.85)',
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
            <img src={zCard.ImgURL} alt={zCard.CardName} draggable={false}
              style={{ maxWidth: '80vw', maxHeight: '70vh', borderRadius: 10, objectFit: 'contain' }}
              onError={e => { const img = e.target as HTMLImageElement; if (!img.src.endsWith('/ErrerCard.webp')) img.src = '/ErrerCard.webp'; }} />
            <span style={{ color: C.textFaint, fontSize: 12 }}>タップで閉じる</span>
          </div>,
          document.body,
        );
      })()}

      {/* 相手のライフクロスクラッシュ確認（攻撃側・読み取り専用） */}
      {!my.field.check && op.field.check && createPortal(
        <div style={{
          position: 'fixed', inset: 0, zIndex: 4400,
          backgroundColor: 'rgba(0,0,0,0.80)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 20,
        }}>
          <div style={{
            backgroundColor: C.bgModal, border: C.borderUI, borderRadius: 12,
            padding: '24px 20px', width: 'min(88vw, 320px)',
            display: 'flex', flexDirection: 'column', gap: 14, textAlign: 'center',
          }}>
            {(() => {
              const checkCard = battleCardMap.get(op.field.check!);
              const hasBurst = checkCard?.LifeBurst === '1';
              return (
                <>
                  <p style={{ color: C.life, fontSize: 15, fontWeight: 'bold', margin: 0 }}>
                    相手のライフクロスクラッシュ
                  </p>
                  {checkCard ? (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                      <img src={checkCard.ImgURL} alt={checkCard.CardName}
                        onClick={() => setOpCheckCardZoomed(true)}
                        onTouchEnd={e => { e.preventDefault(); setOpCheckCardZoomed(true); }}
                        style={{ width: 80, height: 112, objectFit: 'cover', borderRadius: 6,
                          boxShadow: hasBurst ? `0 0 14px ${C.accent}` : 'none', cursor: 'pointer' }}
                        onError={e => { const img = e.target as HTMLImageElement; if (!img.src.endsWith('/ErrerCard.webp')) img.src = '/ErrerCard.webp'; }} />
                      <p style={{ color: C.textSub, fontSize: 13, fontWeight: 'bold', margin: 0 }}>
                        {checkCard.CardName}
                      </p>
                    </div>
                  ) : (
                    <div style={{ width: 80, height: 112, backgroundColor: C.bgButton, borderRadius: 6, margin: '0 auto' }} />
                  )}
                  <p style={{ color: hasBurst ? C.accent : C.textFaint, fontSize: 13, fontWeight: 'bold', margin: 0 }}>
                    {hasBurst ? 'ライフバーストあり' : 'ライフバーストなし'}
                  </p>
                  <p style={{ color: C.textGhost, fontSize: 11, margin: 0 }}>
                    相手の応答を待っています…
                  </p>
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
