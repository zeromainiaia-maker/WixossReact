import { createPortal } from 'react-dom';
import { C } from '../../../components/BoardComponents';
import { getCardNum } from '../../../engine/effectExecutor';
import type { ResonaPaymentItem, ResonaSummonCandidate } from '../resonaSummon';
import { resonaCombinedOptions, resonaPaymentOptions, validateResonaSelection } from '../resonaSummon';
import type { BattleModalCtx } from './types';

interface Props {
  ctx: BattleModalCtx;
  pending: ResonaSummonCandidate | null;
  selected: ResonaPaymentItem[];
  setSelected: (next: ResonaPaymentItem[]) => void;
  close: () => void;
  execute: (zoneIndex: number) => void;
  fieldSigniTotal: number;
  lrigLimit: number;
}

export function ResonaSummonModal({ ctx, pending, selected, setSelected, close, execute, fieldSigniTotal, lrigLimit }: Props) {
  if (!pending) return null;
  const { my, battleCardMap, loading } = ctx;
  const key = (i: ResonaPaymentItem) => `${i.zone}:${i.index}`;
  const chosen = (i: ResonaPaymentItem) => selected.some(s => key(s) === key(i));
  const cardNum = (i: ResonaPaymentItem) => getCardNum(i.zone === 'field'
    ? my.field.signi[i.index]?.at(-1) ?? ''
    : (i.zone === 'hand' ? my.hand : my.energy)[i.index] ?? '');
  const zoneName = (z: ResonaPaymentItem['zone']) => z === 'hand' ? '手札' : z === 'energy' ? 'エナゾーン' : '場';
  const toggle = (item: ResonaPaymentItem) => {
    if (chosen(item)) return setSelected(selected.filter(s => key(s) !== key(item)));
    if (pending.payment.combined) return setSelected([...selected, item]);
    const group = item.group ?? 0;
    const limit = pending.payment.groups[group].count;
    const inGroup = selected.filter(s => (s.group ?? 0) === group);
    if (inGroup.length < limit) setSelected([...selected, item]);
  };
  const sections = pending.payment.combined
    ? [{ label: '合計', items: resonaCombinedOptions(my, pending.payment, battleCardMap) }]
    : pending.payment.groups.map((g, group) => ({
      label: g.label ?? `${zoneName(g.zone)}から${g.count}枚`,
      items: resonaPaymentOptions(my, g, battleCardMap).map(index => ({ zone: g.zone, index, group })),
    }));
  const selectionValid = validateResonaSelection(my, pending.payment, { items: selected }, battleCardMap);
  const paidFieldLevels = selected.filter(i => i.zone === 'field').reduce((sum, item) =>
    sum + (parseInt(battleCardMap.get(cardNum(item))?.Level ?? '0', 10) || 0), 0);
  const resonaLevel = parseInt(battleCardMap.get(getCardNum(pending.cardNum))?.Level ?? '0', 10) || 0;

  return createPortal(
    <div onClick={close} style={{ position: 'fixed', inset: 0, zIndex: 3550, backgroundColor: 'rgba(0,0,0,0.88)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div onClick={e => e.stopPropagation()} style={{ backgroundColor: C.bgModal, border: C.borderUI, borderRadius: 12, padding: '22px 18px', width: 'min(92vw, 680px)', textAlign: 'center' }}>
        <p style={{ color: C.text, fontWeight: 'bold', margin: '0 0 6px' }}>
          {battleCardMap.get(getCardNum(pending.cardNum))?.CardName ?? pending.cardNum} の【出現条件】
        </p>
        <p style={{ color: C.textDim, fontSize: 12, margin: '0 0 14px' }}>{pending.appearance.rawText}</p>
        {sections.map((section, si) => (
          <div key={si} style={{ marginBottom: 12 }}>
            <p style={{ color: C.textSub, fontSize: 13, margin: '6px 0' }}>{section.label}</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}>
              {section.items.map(item => (
                <button key={key(item)} data-testid={`resona-payment-${item.zone}-${item.index}`} onClick={() => toggle(item)}
                  style={{ padding: '9px 10px', borderRadius: 7, border: chosen(item) ? `2px solid ${C.accent}` : C.borderUI, backgroundColor: chosen(item) ? '#243b62' : C.bgButton, color: C.text, cursor: 'pointer' }}>
                  {zoneName(item.zone)}{item.zone === 'field' ? `${item.index + 1}: ` : ': '}
                  {battleCardMap.get(cardNum(item))?.CardName ?? cardNum(item)}
                </button>
              ))}
            </div>
          </div>
        ))}
        <p style={{ color: selectionValid ? C.textSub : '#ffaaaa', fontSize: 13, margin: '12px 0 8px' }}>
          {selectionValid ? '支払い確定後、召喚先を選択' : '枚数・グループ・合計条件を満たすカードを選択'}
        </p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
          {[0, 1, 2].map(zi => {
            const occupied = (my.field.signi[zi]?.length ?? 0) > 0 && !selected.some(i => i.zone === 'field' && i.index === zi);
            const overLimit = fieldSigniTotal - paidFieldLevels + resonaLevel > lrigLimit;
            const disabled = loading || !selectionValid || occupied || overLimit;
            return <button key={zi} data-testid={`resona-zone-${zi}`} disabled={disabled} onClick={() => !disabled && execute(zi)}
              style={{ padding: '10px 15px', borderRadius: 8, border: C.borderUI, backgroundColor: disabled ? C.disabled : C.bgButton, color: disabled ? C.textFaint : C.text }}>
              ゾーン{zi + 1}{occupied ? '（使用中）' : overLimit ? '（リミット超過）' : ''}
            </button>;
          })}
        </div>
        <button onClick={close} style={{ marginTop: 14, padding: '8px 20px', borderRadius: 8, border: C.borderUI, backgroundColor: 'transparent', color: C.textDim }}>キャンセル</button>
      </div>
    </div>,
    document.body,
  );
}
