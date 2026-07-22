// v0.278: WX25-P2-001 付与【起】 ガードシグニ捨て→ルリグバリア モーダル。BattleScreen.tsx から Stage 1 で抽出。
import type { Dispatch, SetStateAction } from 'react';
import { createPortal } from 'react-dom';
import { C } from '../../../components/BoardComponents';
import { canCardGuard } from '../guard';
import type { BattleModalCtx } from './types';

interface GuardBarrierActModalProps {
  ctx: BattleModalCtx;
  pendingGuardBarrierAct: boolean;
  setPendingGuardBarrierAct: Dispatch<SetStateAction<boolean>>;
  selectedBarrierGuardCard: number | null;
  setSelectedBarrierGuardCard: Dispatch<SetStateAction<number | null>>;
  executeGuardBarrierAct: (handIndex: number) => void;
}

export function GuardBarrierActModal(p: GuardBarrierActModalProps) {
  const { my, loading, battleCardMap, effectsMap, pickLongPressTimer, setExpandedPickImgUrl } = p.ctx;
  const { pendingGuardBarrierAct, setPendingGuardBarrierAct, selectedBarrierGuardCard, setSelectedBarrierGuardCard, executeGuardBarrierAct } = p;
  return (
    <>
      {pendingGuardBarrierAct && createPortal(
        <div onClick={() => { setPendingGuardBarrierAct(false); setSelectedBarrierGuardCard(null); }}
          style={{ position: 'fixed', inset: 0, zIndex: 3500,
            backgroundColor: 'rgba(0,0,0,0.92)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div onClick={e => e.stopPropagation()}
            style={{ backgroundColor: C.bgModal, border: C.borderUI, borderRadius: 12,
              padding: '20px 16px', width: 'min(92vw, 360px)', maxHeight: '85vh',
              display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button onClick={() => { setPendingGuardBarrierAct(false); setSelectedBarrierGuardCard(null); }}
                style={{ padding: '4px 10px', borderRadius: 6, border: C.borderUI,
                  backgroundColor: 'transparent', color: C.textDim, cursor: 'pointer', fontSize: 12 }}>
                ← キャンセル
              </button>
              <p style={{ color: '#4db6e0', fontSize: 14, fontWeight: 'bold', margin: 0 }}>
                ルリグバリア付与
              </p>
            </div>
            <p style={{ color: C.textMuted, fontSize: 12, margin: 0 }}>
              手札の《ガードアイコン》を持つシグニを1枚捨てる → ルリグバリア+1
            </p>
            <p style={{ color: C.text, fontSize: 12, margin: 0 }}>
              ガードシグニを選択: {selectedBarrierGuardCard !== null ? '1枚選択中' : '未選択'}
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, overflowY: 'auto', maxHeight: 180 }}>
              {my.hand.map((num, i) => {
                const c = battleCardMap.get(num);
                const isGuard = canCardGuard(num, my, battleCardMap, effectsMap);
                const isSel = selectedBarrierGuardCard === i;
                return (
                  <div key={i}
                    onClick={() => isGuard && setSelectedBarrierGuardCard(isSel ? null : i)}
                    onPointerDown={() => { pickLongPressTimer.current = setTimeout(() => { setExpandedPickImgUrl(c?.ImgURL ?? null); }, 500); }}
                    onPointerUp={() => { if (pickLongPressTimer.current) { clearTimeout(pickLongPressTimer.current); pickLongPressTimer.current = null; } }}
                    onPointerLeave={() => { if (pickLongPressTimer.current) { clearTimeout(pickLongPressTimer.current); pickLongPressTimer.current = null; } }}
                    onContextMenu={e => e.preventDefault()}
                    style={{ position: 'relative', width: 52, height: 73, borderRadius: 4,
                      overflow: 'hidden', cursor: isGuard ? 'pointer' : 'default', flexShrink: 0,
                      border: isSel ? '2px solid #4db6e0' : C.borderCard,
                      opacity: isGuard ? 1 : 0.3 }}>
                    {c
                      ? <img src={c.ImgURL} alt={c.CardName} draggable={false}
                          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                          onError={e => { const img = e.target as HTMLImageElement; if (!img.src.endsWith('/ErrerCard.webp')) img.src = '/ErrerCard.webp'; }} />
                      : <div style={{ width: '100%', height: '100%', backgroundColor: C.bgButton,
                          display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <span style={{ fontSize: 8, color: C.textFaint }}>{num}</span>
                        </div>
                    }
                    {isSel && (
                      <div style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(77,182,224,0.45)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <span style={{ color: C.text, fontSize: 14, fontWeight: 'bold' }}>✓</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <button
              onClick={() => selectedBarrierGuardCard !== null && executeGuardBarrierAct(selectedBarrierGuardCard)}
              disabled={loading || selectedBarrierGuardCard === null}
              style={{ padding: '11px 0', borderRadius: 8, border: 'none',
                backgroundColor: selectedBarrierGuardCard !== null ? '#4db6e0' : C.disabled,
                color: C.text, fontSize: 14, fontWeight: 'bold',
                cursor: (loading || selectedBarrierGuardCard === null) ? 'default' : 'pointer' }}>
              ガードシグニを捨ててバリア付与
            </button>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
