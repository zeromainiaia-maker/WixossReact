// スペルカットイン カード拡大＋スペル発動待機中（発動側）オーバーレイ。BattleScreen.tsx から Stage 1 で抽出。
import type { Dispatch, SetStateAction } from 'react';
import { createPortal } from 'react-dom';
import { C } from '../../../components/BoardComponents';
import type { BattleModalCtx } from './types';

interface SpellCutinOverlaysProps {
  ctx: BattleModalCtx;
  cutinSpellZoomed: boolean;
  setCutinSpellZoomed: Dispatch<SetStateAction<boolean>>;
}

export function SpellCutinOverlays(p: SpellCutinOverlaysProps) {
  const { bs, user, battleCardMap } = p.ctx;
  const { cutinSpellZoomed, setCutinSpellZoomed } = p;
  return (
    <>
      {/* スペルカットイン カード拡大 */}
      {cutinSpellZoomed && bs.pending_spell && (() => {
        const zCard = battleCardMap.get(bs.pending_spell.card_num);
        if (!zCard) return null;
        return createPortal(
          <div
            onClick={() => setCutinSpellZoomed(false)}
            onTouchEnd={e => { e.preventDefault(); setCutinSpellZoomed(false); }}
            style={{ position: 'fixed', inset: 0, zIndex: 5000,
              backgroundColor: 'rgba(0,0,0,0.85)',
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
            <img src={zCard.ImgURL} alt={zCard.CardName} draggable={false}
              style={{ maxWidth: '80vw', maxHeight: '70vh', borderRadius: 10, objectFit: 'contain' }}
              onError={e => { const img = e.target as HTMLImageElement; if (!img.src.endsWith('/ErrerCard.webp')) img.src = '/ErrerCard.webp'; }} />
            <span style={{ color: C.textFaint, fontSize: 12 }}>タップで閉じる</span>
          </div>,
          document.body,
        );
      })()}

      {/* スペル発動待機中（発動側） */}
      {bs.pending_spell && bs.pending_spell.caster_id === user.id && createPortal(
        <div style={{ position: 'fixed', inset: 0, zIndex: 3200,
          backgroundColor: 'rgba(0,0,0,0.70)',
          display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ backgroundColor: C.bgModal, border: C.borderUI, borderRadius: 12,
            padding: '28px 24px', textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {(() => {
              const spellCard = battleCardMap.get(bs.pending_spell.card_num);
              return (
                <>
                  {spellCard && (
                    <img src={spellCard.ImgURL} alt={spellCard.CardName}
                      style={{ width: 60, height: 84, objectFit: 'cover', borderRadius: 6, margin: '0 auto' }}
                      onError={e => { const img = e.target as HTMLImageElement; if (!img.src.endsWith('/ErrerCard.webp')) img.src = '/ErrerCard.webp'; }} />
                  )}
                  <p style={{ color: C.textSub, fontSize: 14, fontWeight: 'bold', margin: 0 }}>
                    {spellCard?.CardName ?? 'スペル'} 発動中
                  </p>
                  <p style={{ color: C.textDim, fontSize: 12, margin: 0 }}>
                    相手のカットイン応答を待っています...
                  </p>
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
