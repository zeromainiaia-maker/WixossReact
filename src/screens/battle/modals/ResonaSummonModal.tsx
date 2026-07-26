import { createPortal } from 'react-dom';
import { C } from '../../../components/BoardComponents';
import { getCardNum } from '../../../engine/effectExecutor';
import type { ResonaSummonCandidate } from '../resonaSummon';
import { resonaPaymentOptions } from '../resonaSummon';
import type { BattleModalCtx } from './types';

interface Props {
  ctx: BattleModalCtx;
  pending: ResonaSummonCandidate | null;
  selected: Set<number>;
  setSelected: (next: Set<number>) => void;
  close: () => void;
  execute: (zoneIndex: number) => void;
  fieldSigniTotal: number;
  lrigLimit: number;
}

export function ResonaSummonModal({ ctx, pending, selected, setSelected, close, execute, fieldSigniTotal, lrigLimit }: Props) {
  if (!pending) return null;
  const { my, battleCardMap, loading } = ctx;
  const options = resonaPaymentOptions(my, pending.payment, battleCardMap);
  const toggle = (index: number) => {
    const next = new Set(selected);
    if (next.has(index)) next.delete(index);
    else if (next.size < pending.payment.count) next.add(index);
    setSelected(next);
  };
  const zoneLabel = pending.payment.zone === 'hand' ? '手札' : pending.payment.zone === 'energy' ? 'エナゾーン' : '場';
  const itemNum = (index: number) => pending.payment.zone === 'field'
    ? getCardNum(my.field.signi[index]?.at(-1) ?? '')
    : getCardNum((pending.payment.zone === 'hand' ? my.hand : my.energy)[index] ?? '');

  return createPortal(
    <div onClick={close} style={{
      position: 'fixed', inset: 0, zIndex: 3550, backgroundColor: 'rgba(0,0,0,0.88)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        backgroundColor: C.bgModal, border: C.borderUI, borderRadius: 12,
        padding: '22px 18px', width: 'min(92vw, 560px)', textAlign: 'center',
      }}>
        <p style={{ color: C.text, fontWeight: 'bold', margin: '0 0 6px' }}>
          {battleCardMap.get(getCardNum(pending.cardNum))?.CardName ?? pending.cardNum} の【出現条件】
        </p>
        <p style={{ color: C.textDim, fontSize: 12, margin: '0 0 14px' }}>
          {zoneLabel}から条件に合うカードを{pending.payment.count}枚選択
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}>
          {options.map(index => {
            const num = itemNum(index);
            const chosen = selected.has(index);
            return (
              <button key={index} data-testid={`resona-payment-${pending.payment.zone}-${index}`}
                onClick={() => toggle(index)}
                style={{
                  padding: '9px 10px', borderRadius: 7,
                  border: chosen ? `2px solid ${C.accent}` : C.borderUI,
                  backgroundColor: chosen ? '#243b62' : C.bgButton, color: C.text, cursor: 'pointer',
                }}>
                {pending.payment.zone === 'field' ? `ゾーン${index + 1}: ` : ''}{battleCardMap.get(num)?.CardName ?? num}
              </button>
            );
          })}
        </div>
        <p style={{ color: C.textSub, fontSize: 13, margin: '16px 0 8px' }}>
          支払い後の召喚先を選択
        </p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
          {[0, 1, 2].map(zi => {
            const occupied = (my.field.signi[zi]?.length ?? 0) > 0;
            const paidFieldLevels = pending.payment.zone === 'field'
              ? [...selected].reduce((sum, paidZi) => {
                const paidNum = getCardNum(my.field.signi[paidZi]?.at(-1) ?? '');
                return sum + (parseInt(battleCardMap.get(paidNum)?.Level ?? '0', 10) || 0);
              }, 0)
              : 0;
            const resonaLevel = parseInt(battleCardMap.get(getCardNum(pending.cardNum))?.Level ?? '0', 10) || 0;
            const overLimit = fieldSigniTotal - paidFieldLevels + resonaLevel > lrigLimit;
            const disabled = loading || selected.size !== pending.payment.count || occupied || overLimit;
            return (
              <button key={zi} data-testid={`resona-zone-${zi}`} disabled={disabled}
                onClick={() => !disabled && execute(zi)}
                style={{
                  padding: '10px 15px', borderRadius: 8, border: C.borderUI,
                  backgroundColor: disabled ? C.disabled : C.bgButton,
                  color: disabled ? C.textFaint : C.text, cursor: disabled ? 'default' : 'pointer',
                }}>
                ゾーン{zi + 1}{occupied ? '（使用中）' : overLimit ? '（リミット超過）' : ''}
              </button>
            );
          })}
        </div>
        <button onClick={close} style={{
          marginTop: 14, padding: '8px 20px', borderRadius: 8, border: C.borderUI,
          backgroundColor: 'transparent', color: C.textDim, cursor: 'pointer',
        }}>キャンセル</button>
      </div>
    </div>,
    document.body,
  );
}
