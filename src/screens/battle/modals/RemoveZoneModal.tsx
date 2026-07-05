// リムーブ選択モーダル。BattleScreen.tsx から Stage 1 で抽出。
import type { Dispatch, SetStateAction } from 'react';
import { createPortal } from 'react-dom';
import { C } from '../../../components/BoardComponents';
import type { BattleModalCtx } from './types';

interface RemoveZoneModalProps {
  ctx: BattleModalCtx;
  showRemoveModal: boolean;
  setShowRemoveModal: Dispatch<SetStateAction<boolean>>;
  selectedRemoveZones: Set<number>;
  toggleRemoveZone: (zi: number) => void;
  handleRemove: () => void;
}

export function RemoveZoneModal(p: RemoveZoneModalProps) {
  const { my, loading, battleCardMap } = p.ctx;
  const { showRemoveModal, setShowRemoveModal, selectedRemoveZones, toggleRemoveZone, handleRemove } = p;
  return (
    <>
      {showRemoveModal && createPortal(
        <div onClick={() => setShowRemoveModal(false)}
          style={{ position: 'fixed', inset: 0, zIndex: 3500,
            backgroundColor: 'rgba(0,0,0,0.88)',
            display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div onClick={e => e.stopPropagation()}
            style={{ backgroundColor: C.bgModal, border: C.borderUI, borderRadius: 12,
              padding: '24px 20px', width: 'min(88vw, 320px)', textAlign: 'center',
              display: 'flex', flexDirection: 'column', gap: 14 }}>
            <p style={{ color: C.textSub, fontSize: 15, fontWeight: 'bold', margin: 0 }}>リムーブ</p>
            <p style={{ color: C.textDim, fontSize: 12, margin: 0 }}>
              トラッシュに送るゾーンを選択（レゾナ不可）
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
              {([0, 1, 2] as const).map(zi => {
                const stack = my.field.signi[zi] ?? [];
                const topCardNum = stack[stack.length - 1] ?? null;
                const topCard = topCardNum ? battleCardMap.get(topCardNum) : null;
                const isEmpty = stack.length === 0;
                const isResona = topCard?.Type === 'レゾナ';
                const isDisabled = isEmpty || isResona;
                const isSel = selectedRemoveZones.has(zi);
                return (
                  <button key={zi}
                    onClick={() => { if (!isDisabled) toggleRemoveZone(zi); }}
                    disabled={isDisabled}
                    style={{
                      flex: 1, padding: '10px 4px', borderRadius: 8,
                      border: isSel ? `2px solid ${C.danger}` : isDisabled ? `1px solid #333` : C.borderUI,
                      backgroundColor: isSel ? 'rgba(244,67,54,0.2)' : isDisabled ? C.bgCardEmpty : C.bgButton,
                      color: isDisabled ? C.textFaint : C.text,
                      fontSize: 12, cursor: isDisabled ? 'default' : 'pointer',
                      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                    }}>
                    {topCard ? (
                      <img src={topCard.ImgURL} alt={topCard.CardName}
                        style={{ width: 44, height: 62, objectFit: 'cover', borderRadius: 4 }}
                        onError={e => { const img = e.target as HTMLImageElement; if (!img.src.endsWith('/ErrerCard.webp')) img.src = '/ErrerCard.webp'; }} />
                    ) : (
                      <div style={{ width: 44, height: 62, backgroundColor: C.bgCardEmpty,
                        borderRadius: 4, border: C.borderEmpty }} />
                    )}
                    <span>ゾーン{zi + 1}</span>
                    {isResona && <span style={{ fontSize: 10, color: C.danger }}>レゾナ</span>}
                    {isEmpty  && <span style={{ fontSize: 10, color: C.textFaint }}>空</span>}
                  </button>
                );
              })}
            </div>
            <button onClick={handleRemove}
              disabled={loading || selectedRemoveZones.size === 0}
              style={{ padding: '11px 0', borderRadius: 8, border: 'none',
                backgroundColor: selectedRemoveZones.size > 0 ? '#8b4513' : C.disabled,
                color: C.text, fontSize: 14, fontWeight: 'bold',
                cursor: (loading || selectedRemoveZones.size === 0) ? 'default' : 'pointer' }}>
              {selectedRemoveZones.size > 0 ? `${selectedRemoveZones.size}枚をトラッシュへ` : 'ゾーンを選択してください'}
            </button>
            <button onClick={() => setShowRemoveModal(false)}
              style={{ padding: '8px 0', borderRadius: 8, border: C.borderUI,
                backgroundColor: 'transparent', color: C.textDim, cursor: 'pointer', fontSize: 13 }}>
              キャンセル
            </button>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
