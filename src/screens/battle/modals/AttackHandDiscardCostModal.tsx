// §6.4 O-3: 「手札をN枚捨てないかぎりアタックできない」の解除コスト支払いモーダル（`SP38-003`）。
// ⚠`NegateEscapeModal`（1回きりのアタック無効化回避）とは**別機構**＝こちらは**アタックするごとに**払う。
import type { Dispatch, SetStateAction } from 'react';
import { createPortal } from 'react-dom';
import { C } from '../../../components/BoardComponents';
import type { BattleModalCtx } from './types';

interface AttackHandDiscardCostModalProps {
  ctx: BattleModalCtx;
  payment: { zoneIndex: number; targetOpZone?: number; cardNum: string; count: number } | null;
  selected: Set<number>;
  setSelected: Dispatch<SetStateAction<Set<number>>>;
  onPay: () => void;
  onCancel: () => void;
}

export function AttackHandDiscardCostModal(p: AttackHandDiscardCostModalProps) {
  const { my, loading, battleCardMap } = p.ctx;
  const payment = p.payment;
  if (!payment) return null;
  const ready = p.selected.size === payment.count;
  return createPortal(
    <div style={{ position: 'fixed', inset: 0, zIndex: 3600, backgroundColor: 'rgba(0,0,0,0.92)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ backgroundColor: C.bgModal, border: C.borderUI, borderRadius: 12,
          padding: '20px 16px', width: 'min(92vw, 380px)', maxHeight: '85vh',
          display: 'flex', flexDirection: 'column', gap: 12 }}
        data-testid="attack-hand-discard-cost-modal">
        <p style={{ color: C.danger, fontSize: 14, fontWeight: 'bold', margin: 0 }}>
          {battleCardMap.get(payment.cardNum)?.CardName ?? payment.cardNum} のアタック解除コスト
        </p>
        <p style={{ color: C.textMuted, fontSize: 12, margin: 0 }}>
          手札を{payment.count}枚捨てないかぎりアタックできません（{p.selected.size}/{payment.count}枚選択中）
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, overflowY: 'auto', maxHeight: 180 }}>
          {my.hand.map((num, i) => {
            const c = battleCardMap.get(num);
            const isSel = p.selected.has(i);
            return (
              <div key={i} data-testid={`attack-hand-discard-${i}`}
                onClick={() => p.setSelected(prev => {
                  const next = new Set(prev);
                  if (next.has(i)) next.delete(i);
                  else if (next.size < payment.count) next.add(i);
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
        <button onClick={p.onPay} disabled={loading || !ready}
          data-testid="attack-hand-discard-pay"
          style={{ padding: '11px 0', borderRadius: 8, border: 'none',
            backgroundColor: ready ? '#e05050' : C.disabled,
            color: C.text, fontSize: 14, fontWeight: 'bold',
            cursor: (loading || !ready) ? 'default' : 'pointer' }}>
          手札{payment.count}枚を捨ててアタックする
        </button>
        <button onClick={p.onCancel} disabled={loading}
          data-testid="attack-hand-discard-cancel"
          style={{ padding: '9px 0', borderRadius: 8, border: C.borderUI,
            backgroundColor: 'transparent', color: C.textDim, fontSize: 13,
            cursor: loading ? 'default' : 'pointer' }}>
          キャンセル（アタックしない）
        </button>
      </div>
    </div>,
    document.body,
  );
}
