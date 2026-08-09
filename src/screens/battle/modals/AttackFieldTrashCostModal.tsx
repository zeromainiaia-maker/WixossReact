import type { Dispatch, SetStateAction } from 'react';
import { createPortal } from 'react-dom';
import { C } from '../../../components/BoardComponents';
import { attackFieldTrashSelectableZones } from '../attackFieldTrashCost';
import type { BattleModalCtx } from './types';

interface AttackFieldTrashCostModalProps {
  ctx: BattleModalCtx;
  payment: { zoneIndex: number; targetOpZone?: number; cardNum: string; count: number } | null;
  selectedZones: Set<number>;
  setSelectedZones: Dispatch<SetStateAction<Set<number>>>;
  onPay: () => void;
  onCancel: () => void;
}

export function AttackFieldTrashCostModal(p: AttackFieldTrashCostModalProps) {
  const { my, loading, battleCardMap } = p.ctx;
  const candidates = p.payment
    ? attackFieldTrashSelectableZones(my, p.payment.cardNum, battleCardMap)
    : [];
  return p.payment ? createPortal(
    <div style={{ position: 'fixed', inset: 0, zIndex: 3600, backgroundColor: 'rgba(0,0,0,0.92)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ backgroundColor: C.bgModal, border: C.borderUI, borderRadius: 12,
          padding: '20px 16px', width: 'min(92vw, 420px)', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <p style={{ color: C.danger, fontSize: 14, fontWeight: 'bold', margin: 0 }}>
          {battleCardMap.get(p.payment.cardNum)?.CardName ?? p.payment.cardNum} のアタック解除コスト
        </p>
        <p style={{ color: C.textMuted, fontSize: 12, margin: 0 }}>
          他のシグニを{p.payment.count}体、場からトラッシュに置きます（{p.selectedZones.size}/{p.payment.count}体選択中）
        </p>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
          {candidates.map(zone => {
            const num = my.field.signi[zone]?.at(-1);
            if (!num) return null;
            const card = battleCardMap.get(num);
            const selected = p.selectedZones.has(zone);
            return (
              <button key={zone} onClick={() => p.setSelectedZones(prev => {
                const next = new Set(prev);
                if (next.has(zone)) next.delete(zone);
                else if (next.size < p.payment!.count) next.add(zone);
                return next;
              })} style={{ padding: 4, borderRadius: 6, cursor: 'pointer',
                border: selected ? '2px solid #e05050' : C.borderCard,
                backgroundColor: selected ? 'rgba(224,80,80,0.3)' : C.bgButton }}>
                {card
                  ? <img src={card.ImgURL} alt={card.CardName} draggable={false}
                      style={{ width: 64, height: 90, objectFit: 'cover', display: 'block' }} />
                  : <span style={{ color: C.text }}>{num}</span>}
              </button>
            );
          })}
        </div>
        <button onClick={p.onPay} disabled={loading || p.selectedZones.size !== p.payment.count}
          style={{ padding: '11px 0', borderRadius: 8, border: 'none',
            backgroundColor: p.selectedZones.size === p.payment.count ? '#e05050' : C.disabled,
            color: C.text, fontSize: 14, fontWeight: 'bold' }}>
          {p.payment.count}体をトラッシュに置いてアタックする
        </button>
        <button onClick={p.onCancel} disabled={loading}
          style={{ padding: '9px 0', borderRadius: 8, border: C.borderUI,
            backgroundColor: 'transparent', color: C.textDim, fontSize: 13 }}>
          キャンセル
        </button>
      </div>
    </div>,
    document.body,
  ) : null;
}
