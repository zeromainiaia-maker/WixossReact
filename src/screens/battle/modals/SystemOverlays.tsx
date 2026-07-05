// 相手のLOOK_AND_REORDER 観戦表示＋長押し拡大オーバーレイ＋終了ボタン（常時固定）。BattleScreen.tsx から Stage 1 で抽出。
import type { Dispatch, SetStateAction } from 'react';
import { createPortal } from 'react-dom';
import { C } from '../../../components/BoardComponents';
import type { BattleModalCtx } from './types';

interface SystemOverlaysProps {
  ctx: BattleModalCtx;
  expandedPickImgUrl: string | null;
  setShowEndConfirm: Dispatch<SetStateAction<boolean>>;
}

export function SystemOverlays(p: SystemOverlaysProps) {
  const { bs, user, battleCardMap, setExpandedPickImgUrl } = p.ctx;
  const { expandedPickImgUrl, setShowEndConfirm } = p;
  return (
    <>
      {/* ===== 相手のLOOK_AND_REORDER 観戦表示（公開する=両者表示 / 見る=待機のみ） ===== */}
      {bs.pending_effect &&
       (bs.pending_effect.respondPlayerId ?? bs.pending_effect.sourcePlayerId) !== user.id &&
       bs.pending_effect.interaction.type === 'LOOK_AND_REORDER' && (() => {
        const inter = bs.pending_effect.interaction;
        const pe = bs.pending_effect;
        const srcCard = battleCardMap.get(pe.sourceCardNum);
        if (!inter.private) {
          // 公開する：相手にもカードを表示（非インタラクティブ）
          return createPortal(
            <div style={{ position: 'fixed', inset: 0, zIndex: 3999,
              backgroundColor: 'rgba(0,0,0,0.80)',
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
              <div style={{ backgroundColor: C.bgModal, border: C.borderUI, borderRadius: 12,
                padding: '20px 16px', width: 'min(95vw, 380px)',
                display: 'flex', flexDirection: 'column', gap: 12 }}>
                <p style={{ color: C.textSub, fontSize: 14, fontWeight: 'bold', margin: 0, textAlign: 'center' }}>
                  {srcCard?.CardName ?? pe.sourceCardNum}の効果（公開）
                </p>
                <p style={{ color: C.textDim, fontSize: 12, margin: 0, textAlign: 'center' }}>
                  相手がカードを確認・並べ替え中...
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {inter.cards.map((cardNum, i) => {
                    const c = battleCardMap.get(cardNum);
                    return (
                      <div key={cardNum} style={{ display: 'flex', alignItems: 'center', gap: 8,
                        backgroundColor: C.bgButton, borderRadius: 6, padding: '6px 8px' }}>
                        <span style={{ color: C.textDim, fontSize: 11, width: 16 }}>{i + 1}</span>
                        <img src={c?.ImgURL} alt={c?.CardName} draggable={false}
                          onClick={() => setExpandedPickImgUrl(c?.ImgURL ?? null)}
                          style={{ width: 36, height: 50, objectFit: 'cover', borderRadius: 3, flexShrink: 0, cursor: 'pointer' }}
                          onError={e2 => { const img = e2.target as HTMLImageElement; if (!img.src.endsWith('/ErrerCard.webp')) img.src = '/ErrerCard.webp'; }} />
                        <span style={{ color: C.textSub, fontSize: 12, flex: 1 }}>{c?.CardName ?? cardNum}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>,
            document.body,
          );
        }
        // 見る：カードは非表示、待機メッセージのみ
        return createPortal(
          <div style={{ position: 'fixed', bottom: 80, left: '50%', transform: 'translateX(-50%)',
            zIndex: 3999, backgroundColor: 'rgba(0,0,0,0.75)', borderRadius: 8,
            padding: '8px 20px', pointerEvents: 'none' }}>
            <p style={{ color: C.textDim, fontSize: 13, margin: 0 }}>
              相手がデッキを確認しています...
            </p>
          </div>,
          document.body,
        );
      })()}

      {/* ===== 長押し拡大オーバーレイ（全モーダル共通） ===== */}
      {expandedPickImgUrl && createPortal(
        <div
          onPointerDown={() => setExpandedPickImgUrl(null)}
          style={{ position: 'fixed', inset: 0, zIndex: 9000,
            backgroundColor: 'rgba(0,0,0,0.85)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer' }}>
          <img src={expandedPickImgUrl} alt=""
            draggable={false}
            style={{ maxWidth: '85vw', maxHeight: '80vh', borderRadius: 8, objectFit: 'contain' }} />
        </div>,
        document.body,
      )}

      {/* 終了ボタン（常に最前面に固定 — エラーで画面が固まっても操作できる） */}
      {createPortal(
        <div style={{ position: 'fixed', top: 6, right: 8, zIndex: 9998, display: 'flex', gap: 6 }}>
          <button
            onClick={() => window.location.reload()}
            style={{
              padding: '4px 10px', borderRadius: 4,
              border: '1px solid #444', backgroundColor: 'rgba(0,0,0,0.55)',
              color: '#666', cursor: 'pointer', fontSize: 11,
              backdropFilter: 'blur(4px)',
            }}
          >
            ↺
          </button>
          <button
            onClick={() => setShowEndConfirm(true)}
            style={{
              padding: '4px 10px', borderRadius: 4,
              border: '1px solid #444', backgroundColor: 'rgba(0,0,0,0.55)',
              color: '#666', cursor: 'pointer', fontSize: 11,
              backdropFilter: 'blur(4px)',
            }}
          >
            終了
          </button>
        </div>,
        document.body,
      )}
    </>
  );
}
