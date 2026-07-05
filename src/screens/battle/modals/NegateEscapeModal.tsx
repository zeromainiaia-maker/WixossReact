// G154 BURST: アタック無効化の「手札N枚捨て」回避モーダル。BattleScreen.tsx から Stage 1 で抽出。
import type { Dispatch, SetStateAction } from 'react';
import { createPortal } from 'react-dom';
import { C } from '../../../components/BoardComponents';
import type { BattleModalCtx } from './types';

interface NegateEscapeModalProps {
  ctx: BattleModalCtx;
  negateEscape: { zoneIndex: number; targetOpZone?: number; cardNum: string; count: number } | null;
  selectedNegateEscape: Set<number>;
  setSelectedNegateEscape: Dispatch<SetStateAction<Set<number>>>;
  resolveNegateEscapeDiscard: () => void;
  resolveNegateEscapeAccept: () => void;
}

export function NegateEscapeModal(p: NegateEscapeModalProps) {
  const { my, loading, battleCardMap } = p.ctx;
  const { negateEscape, selectedNegateEscape, setSelectedNegateEscape, resolveNegateEscapeDiscard, resolveNegateEscapeAccept } = p;
  return (
    <>
      {negateEscape && createPortal(
        <div style={{ position: 'fixed', inset: 0, zIndex: 3600, backgroundColor: 'rgba(0,0,0,0.92)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ backgroundColor: C.bgModal, border: C.borderUI, borderRadius: 12,
              padding: '20px 16px', width: 'min(92vw, 380px)', maxHeight: '85vh',
              display: 'flex', flexDirection: 'column', gap: 12 }}>
            <p style={{ color: C.danger, fontSize: 14, fontWeight: 'bold', margin: 0 }}>
              {battleCardMap.get(negateEscape.cardNum)?.CardName ?? negateEscape.cardNum} のアタックが無効化されます
            </p>
            <p style={{ color: C.textMuted, fontSize: 12, margin: 0 }}>
              手札を{negateEscape.count}枚捨てればアタックを通せます（{selectedNegateEscape.size}/{negateEscape.count}枚選択中）
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, overflowY: 'auto', maxHeight: 180 }}>
              {my.hand.map((num, i) => {
                const c = battleCardMap.get(num);
                const isSel = selectedNegateEscape.has(i);
                return (
                  <div key={i}
                    onClick={() => setSelectedNegateEscape(prev => {
                      const next = new Set(prev);
                      if (next.has(i)) next.delete(i);
                      else if (next.size < negateEscape.count) next.add(i);
                      return next;
                    })}
                    style={{ position: 'relative', width: 52, height: 73, borderRadius: 4,
                      overflow: 'hidden', cursor: 'pointer', flexShrink: 0,
                      border: isSel ? '2px solid #e05050' : C.borderCard }}>
                    {c
                      ? <img src={c.ImgURL} alt={c.CardName} draggable={false}
                          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                          onError={e => { const img = e.target as HTMLImageElement; if (!img.src.endsWith('/ErrerCard.webp')) img.src = '/ErrerCard.webp'; }} />
                      : <div style={{ width: '100%', height: '100%', backgroundColor: C.bgButton }} />}
                    {isSel && (
                      <div style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(224,80,80,0.45)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <span style={{ color: C.text, fontSize: 14, fontWeight: 'bold' }}>✓</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <button onClick={resolveNegateEscapeDiscard}
              disabled={loading || selectedNegateEscape.size !== negateEscape.count}
              style={{ padding: '11px 0', borderRadius: 8, border: 'none',
                backgroundColor: selectedNegateEscape.size === negateEscape.count ? '#e05050' : C.disabled,
                color: C.text, fontSize: 14, fontWeight: 'bold',
                cursor: (loading || selectedNegateEscape.size !== negateEscape.count) ? 'default' : 'pointer' }}>
              手札{negateEscape.count}枚を捨ててアタックを通す
            </button>
            <button onClick={resolveNegateEscapeAccept} disabled={loading}
              style={{ padding: '9px 0', borderRadius: 8, border: C.borderUI,
                backgroundColor: 'transparent', color: C.textDim, fontSize: 13,
                cursor: loading ? 'default' : 'pointer' }}>
              捨てずに無効化を受け入れる
            </button>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
