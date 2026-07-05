// 勝敗確定ポップアップ。BattleScreen.tsx から Stage 1 で抽出。
import { createPortal } from 'react-dom';
import { C } from '../../../components/BoardComponents';
import type { BattleModalCtx } from './types';

interface FinishedPopupProps {
  ctx: BattleModalCtx;
  isHost: boolean;
  handleEndAck: () => void;
}

export function FinishedPopup(p: FinishedPopupProps) {
  const { bs, user, loading } = p.ctx;
  const { isHost, handleEndAck } = p;
  return (
    <>
      {bs.global_phase === 'FINISHED' && bs.winner_id && createPortal(
        <div style={{
          position: 'fixed', inset: 0, zIndex: 5000,
          backgroundColor: 'rgba(0,0,0,0.92)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{
            backgroundColor: C.bgModal, border: C.borderUI, borderRadius: 16,
            padding: '40px 32px', width: 'min(88vw, 320px)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20,
            textAlign: 'center',
          }}>
            {bs.winner_id === user.id ? (
              <>
                <p style={{ fontSize: 48, margin: 0 }}>🏆</p>
                <p style={{ color: '#ffd700', fontSize: 28, fontWeight: 'bold', margin: 0 }}>
                  勝利！
                </p>
                <p style={{ color: C.textDim, fontSize: 13, margin: 0 }}>
                  おめでとうございます！
                </p>
              </>
            ) : (
              <>
                <p style={{ fontSize: 48, margin: 0 }}>💀</p>
                <p style={{ color: C.danger, fontSize: 28, fontWeight: 'bold', margin: 0 }}>
                  敗北...
                </p>
                <p style={{ color: C.textDim, fontSize: 13, margin: 0 }}>
                  また挑戦しましょう！
                </p>
              </>
            )}
            {(() => {
              const myAck = isHost ? bs.host_end_ack : bs.guest_end_ack;
              const opAck = isHost ? bs.guest_end_ack : bs.host_end_ack;
              return (
                <>
                  {opAck && !myAck && (
                    <p style={{ color: C.textDim, fontSize: 12, margin: 0 }}>
                      相手が終了を待っています
                    </p>
                  )}
                  <button
                    onClick={handleEndAck}
                    disabled={loading || myAck}
                    style={{
                      width: '100%', padding: '14px 0', borderRadius: 10, border: 'none',
                      backgroundColor: myAck ? C.disabled : C.dangerEnd,
                      color: C.text, fontSize: 15, fontWeight: 'bold',
                      cursor: (loading || myAck) ? 'default' : 'pointer',
                    }}
                  >
                    {myAck ? '終了待機中...' : '対戦終了'}
                  </button>
                </>
              );
            })()}
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
