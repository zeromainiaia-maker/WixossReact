// エンドフェイズ：手札上限超過時の捨て選択モーダル。BattleScreen.tsx から Stage 1 で抽出。
import type { Dispatch, SetStateAction } from 'react';
import { createPortal } from 'react-dom';
import { C } from '../../../components/BoardComponents';
import type { BattleModalCtx } from './types';

interface EndDiscardModalProps {
  ctx: BattleModalCtx;
  pendingEndDiscard: number | null;
  selectedEndDiscard: Set<number>;
  setSelectedEndDiscard: Dispatch<SetStateAction<Set<number>>>;
  confirmEndDiscard: () => void;
}

export function EndDiscardModal(p: EndDiscardModalProps) {
  const { my, loading, battleCardMap, pickLongPressTimer, setExpandedPickImgUrl } = p.ctx;
  const { pendingEndDiscard, selectedEndDiscard, setSelectedEndDiscard, confirmEndDiscard } = p;
  return (
    <>
      {pendingEndDiscard !== null && createPortal(
        <div style={{
          position: 'fixed', inset: 0, zIndex: 4200,
          backgroundColor: 'rgba(0,0,0,0.88)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 16,
        }}>
          <div style={{
            backgroundColor: C.bgModal, border: C.borderUI, borderRadius: 12,
            padding: '20px 16px', width: 'min(96vw, 420px)',
            display: 'flex', flexDirection: 'column', gap: 14,
          }}>
            <p style={{ color: C.accent, fontSize: 15, fontWeight: 'bold', margin: 0, textAlign: 'center' }}>
              手札上限超過
            </p>
            <p style={{ color: C.textDimmer, fontSize: 12, margin: 0, textAlign: 'center' }}>
              手札が{my.hand.length}枚あります。{pendingEndDiscard}枚捨ててください（上限{my.hand.length - pendingEndDiscard}枚）。
            </p>
            <p style={{ color: C.text, fontSize: 12, margin: 0, textAlign: 'center' }}>
              捨てるカードを選択: {selectedEndDiscard.size} / {pendingEndDiscard}枚
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center', maxHeight: 220, overflowY: 'auto' }}>
              {my.hand.map((num, i) => {
                const c = battleCardMap.get(num);
                const isSel = selectedEndDiscard.has(i);
                return (
                  <div key={i}
                    onClick={() => setSelectedEndDiscard(prev => {
                      const next = new Set(prev);
                      if (next.has(i)) { next.delete(i); return next; }
                      if (next.size >= pendingEndDiscard) return prev;
                      next.add(i); return next;
                    })}
                    onPointerDown={() => { pickLongPressTimer.current = setTimeout(() => { setExpandedPickImgUrl(c?.ImgURL ?? null); }, 500); }}
                    onPointerUp={() => { if (pickLongPressTimer.current) { clearTimeout(pickLongPressTimer.current); pickLongPressTimer.current = null; } }}
                    onPointerLeave={() => { if (pickLongPressTimer.current) { clearTimeout(pickLongPressTimer.current); pickLongPressTimer.current = null; } }}
                    onContextMenu={e => e.preventDefault()}
                    style={{ position: 'relative', width: 52, height: 73, borderRadius: 4, flexShrink: 0,
                      border: isSel ? '2px solid #e53935' : C.borderCard,
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
                      <div style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(229,57,53,0.45)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <span style={{ color: '#fff', fontSize: 20, fontWeight: 'bold' }}>✓</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <button
              onClick={confirmEndDiscard}
              disabled={loading || selectedEndDiscard.size !== pendingEndDiscard}
              style={{ padding: '11px 0', borderRadius: 8, border: 'none',
                backgroundColor: selectedEndDiscard.size === pendingEndDiscard ? '#e53935' : C.disabled,
                color: '#fff', fontSize: 14, fontWeight: 'bold',
                cursor: selectedEndDiscard.size === pendingEndDiscard ? 'pointer' : 'default' }}>
              {selectedEndDiscard.size === pendingEndDiscard ? `${pendingEndDiscard}枚捨てて終了` : `あと${pendingEndDiscard - selectedEndDiscard.size}枚選択してください`}
            </button>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
