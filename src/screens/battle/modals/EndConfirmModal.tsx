// 対戦終了確認モーダル。BattleScreen.tsx から Stage 1 で抽出。
import type { Dispatch, SetStateAction } from 'react';
import { createPortal } from 'react-dom';
import { C } from '../../../components/BoardComponents';
import type { BattleModalCtx } from './types';

interface EndConfirmModalProps {
  ctx: BattleModalCtx;
  showEndConfirm: boolean;
  setShowEndConfirm: Dispatch<SetStateAction<boolean>>;
  handleEnd: () => void;
}

export function EndConfirmModal(p: EndConfirmModalProps) {
  const { loading } = p.ctx;
  const { showEndConfirm, setShowEndConfirm, handleEnd } = p;
  return (
    <>
      {showEndConfirm && createPortal(
        <div style={{
          position: 'fixed', inset: 0, zIndex: 9999,
          backgroundColor: 'rgba(0,0,0,0.85)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{
            backgroundColor: C.bgModal, border: C.borderUI, borderRadius: 12,
            padding: '28px 24px', width: 'min(88vw, 320px)', textAlign: 'center',
          }}>
            <p style={{ color: C.text, fontSize: 16, fontWeight: 'bold', margin: '0 0 8px' }}>
              対戦を終了しますか？
            </p>
            <p style={{ color: C.textDimmer, fontSize: 12, margin: '0 0 24px' }}>
              ルームが削除され、対戦データは失われます
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={() => setShowEndConfirm(false)}
                style={{
                  flex: 1, padding: '10px 0', borderRadius: 8,
                  border: C.borderUI, backgroundColor: 'transparent',
                  color: C.textDim, fontSize: 14, cursor: 'pointer',
                }}
              >
                キャンセル
              </button>
              <button
                onClick={handleEnd}
                disabled={loading}
                style={{
                  flex: 1, padding: '10px 0', borderRadius: 8,
                  border: 'none', backgroundColor: loading ? C.disabled : C.dangerEnd,
                  color: C.text, fontSize: 14, fontWeight: 'bold', cursor: loading ? 'default' : 'pointer',
                }}
              >
                {loading ? '削除中...' : '終了する'}
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
