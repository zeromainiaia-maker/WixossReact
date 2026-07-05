// マリガン用カード（タップで選択、長押しで拡大）。BattleScreen.tsx から Stage 0 で抽出。
import { useState, useRef } from 'react';
import type { CardData } from '../../types';
import { getCardNum } from '../../engine/effectExecutor';
import { C, CardModal } from '../../components/BoardComponents';

// ─── MulliganCard: マリガン用（タップで選択、長押しで拡大） ────────
export function MulliganCard({ cardNum, cards, selected, onToggle }: {
  cardNum: string;
  cards: CardData[];
  selected: boolean;
  onToggle: () => void;
}) {
  const [enlarged, setEnlarged] = useState(false);
  const longPressed = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const card = cards.find(c => c.CardNum === getCardNum(cardNum));

  const handleStart = () => {
    longPressed.current = false;
    timer.current = setTimeout(() => {
      longPressed.current = true;
      setEnlarged(true);
      timer.current = null;
    }, 400);
  };
  const handleEnd = () => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
      if (!longPressed.current) onToggle();
    }
  };
  const handleCancel = () => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
  };

  return (
    <>
      <div
        style={{
          width: 90, height: 126, position: 'relative', flexShrink: 0, borderRadius: 6,
          overflow: 'hidden', userSelect: 'none', touchAction: 'none', boxSizing: 'border-box',
          border: selected ? C.borderMulliganSel : C.borderMulligan,
          cursor: 'pointer',
        }}
        onMouseDown={handleStart} onMouseUp={handleEnd} onMouseLeave={handleCancel}
        onTouchStart={e => { e.preventDefault(); handleStart(); }}
        onTouchEnd={e => { e.preventDefault(); handleEnd(); }}
        onTouchCancel={handleCancel}
      >
        {card ? (
          <img src={card.ImgURL} alt={card.CardName} draggable={false}
            style={{ width: '100%', height: '100%', objectFit: 'cover', pointerEvents: 'none', display: 'block' }}
            onError={e => { const img = e.target as HTMLImageElement; if (!img.src.endsWith('/ErrerCard.webp')) img.src = '/ErrerCard.webp'; }}
          />
        ) : (
          <div style={{ width: '100%', height: '100%', backgroundColor: C.bgButton, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ fontSize: 9, color: C.textFaint, textAlign: 'center', padding: 4 }}>{cardNum}</span>
          </div>
        )}
        {selected && (
          <div style={{
            position: 'absolute', inset: 0, backgroundColor: 'rgba(244,67,54,0.4)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <span style={{ fontSize: 12, fontWeight: 'bold', color: C.text, textShadow: '0 1px 4px #000' }}>戻す</span>
          </div>
        )}
      </div>
      {enlarged && card && <CardModal card={card} onClose={() => setEnlarged(false)} />}
    </>
  );
}
