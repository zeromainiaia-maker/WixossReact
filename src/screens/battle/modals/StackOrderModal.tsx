// 効果スタック 整列モーダル。BattleScreen.tsx から Stage 1 で抽出。
import type { Dispatch, SetStateAction } from 'react';
import { createPortal } from 'react-dom';
import { C } from '../../../components/BoardComponents';
import type { BattleModalCtx } from './types';

interface StackOrderModalProps {
  ctx: BattleModalCtx;
  stackOrderIds: string[];
  setStackOrderIds: Dispatch<SetStateAction<string[]>>;
  handleConfirmStackOrder: (orderedIds: string[]) => void;
}

export function StackOrderModal(p: StackOrderModalProps) {
  const { bs, user, loading, battleCardMap } = p.ctx;
  const { stackOrderIds, setStackOrderIds, handleConfirmStackOrder } = p;
  if (!bs.effect_stack || !user) return null;
  const stack = bs.effect_stack;
  const isTurnPlayer = bs.active_user_id === user.id;
  const myPending = isTurnPlayer ? stack.pendingTurn : stack.pendingOpp;
  const needOrder = isTurnPlayer ? !stack.orderTurnDone : !stack.orderOppDone;
  if (!needOrder || myPending.length <= 1) return null;

  const ordered = stackOrderIds
    .map(id => myPending.find(e => e.id === id))
    .filter((e): e is NonNullable<typeof e> => !!e);

  const moveUp = (idx: number) => {
    if (idx === 0) return;
    const next = [...stackOrderIds];
    [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
    setStackOrderIds(next);
  };
  const moveDown = (idx: number) => {
    if (idx >= stackOrderIds.length - 1) return;
    const next = [...stackOrderIds];
    [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
    setStackOrderIds(next);
  };

  return createPortal(
    <div style={{ position: 'fixed', inset: 0, zIndex: 4100,
      backgroundColor: 'rgba(0,0,0,0.92)',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div onClick={e => e.stopPropagation()}
        style={{ backgroundColor: C.bgModal, border: C.borderUI, borderRadius: 12,
          padding: '20px 16px', width: 'min(95vw, 420px)',
          display: 'flex', flexDirection: 'column', gap: 12 }}>
        <p style={{ color: C.textSub, fontSize: 14, fontWeight: 'bold', margin: 0, textAlign: 'center' }}>
          効果の発動順序を決めてください
        </p>
        <p style={{ color: C.text, fontSize: 12, margin: 0, textAlign: 'center' }}>
          ↑↓ ボタンで順序を変更し「確定」を押してください
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {ordered.map((entry, idx) => {
            const card = battleCardMap.get(entry.cardNum);
            return (
              <div key={entry.id}
                style={{ display: 'flex', alignItems: 'center', gap: 8,
                  backgroundColor: C.bgButton, borderRadius: 8, padding: '6px 10px' }}>
                <span style={{ color: C.textFaint, fontSize: 12, minWidth: 20, textAlign: 'center' }}>
                  {idx + 1}
                </span>
                {card && (
                  <img src={card.ImgURL} alt={card.CardName} draggable={false}
                    style={{ width: 36, height: 50, objectFit: 'cover', borderRadius: 3, flexShrink: 0 }} />
                )}
                <span style={{ color: C.text, fontSize: 12, flex: 1 }}>{entry.label}</span>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <button onClick={() => moveUp(idx)} disabled={idx === 0 || loading}
                    style={{ padding: '2px 8px', borderRadius: 4, border: 'none',
                      backgroundColor: idx === 0 ? C.disabled : C.bgButton,
                      color: C.text, cursor: idx === 0 ? 'default' : 'pointer', fontSize: 12 }}>
                    ↑
                  </button>
                  <button onClick={() => moveDown(idx)} disabled={idx >= ordered.length - 1 || loading}
                    style={{ padding: '2px 8px', borderRadius: 4, border: 'none',
                      backgroundColor: idx >= ordered.length - 1 ? C.disabled : C.bgButton,
                      color: C.text, cursor: idx >= ordered.length - 1 ? 'default' : 'pointer', fontSize: 12 }}>
                    ↓
                  </button>
                </div>
              </div>
            );
          })}
        </div>
        <button
          onClick={() => handleConfirmStackOrder(stackOrderIds)}
          disabled={loading}
          style={{ padding: '12px 0', borderRadius: 8, border: 'none',
            backgroundColor: loading ? C.disabled : C.success,
            color: C.text, fontSize: 14, fontWeight: 'bold',
            cursor: loading ? 'default' : 'pointer' }}>
          発動順序を確定
        </button>
      </div>
    </div>,
    document.body,
  );
}
