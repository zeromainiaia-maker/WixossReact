import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import type { CardData, PlayerState } from '../types';
import { getCardNum } from '../engine/effectExecutor';

// ── テーマカラー ──────────────────────────────────────────────────────
export const C = {
  bgApp:        '#050508',
  bgSetup:      '#0a0a0f',
  bgBar:        '#0a0a0d',
  bgOpponent:   '#08080e',
  bgSelf:       '#0b0d12',
  bgModal:      '#0d0d14',
  bgCard:       '#060d1a',
  bgCardEmpty:  '#070707',
  bgButton:     '#1a1a2e',
  bgButtonDark: '#111',
  bgBadge:      '#0a0f1a',

  borderCard:        '1px solid #2a4a7a',
  borderEmpty:       '1px dashed #1a1a1a',
  borderBadge:       '1px solid #1e3050',
  borderUI:          '1px solid #333',
  borderUIMid:       '1px solid #444',
  borderPanel:       '1px solid #141414',
  borderSelf:        '1px solid #0a1a2e',
  borderBar:         '1px solid #111',
  borderBarBtn:      '1px solid #1a1a1a',
  borderMulligan:    '2px solid #333',
  borderMulliganSel: '2px solid #f44336',

  text:         '#fff',
  textSub:      '#ddd',
  textMuted:    '#ccc',
  textAlt:      '#aaa',
  textDim:      '#888',
  textDimmer:   '#666',
  textFaint:    '#555',
  textUiFaint:  '#444',
  textVeryFaint:'#333',
  textDimmost:  '#222',
  textGhost:    '#1e1e1e',
  textBadge:    '#688cd2',
  textStatDim:  '#adadad',
  textOpLabel:  '#252525',
  textMyLabel:  '#152030',
  statDefault:  '#999',
  disabled:     '#555',

  accent:       '#007bff',
  accentLight:  '#7ab8ff',
  success:      '#4caf50',
  danger:       '#f44336',
  dangerDark:   '#e53935',
  dangerEnd:    '#c0392b',
  life:         '#bb3333',
  coin:         '#cc8800',
  aiko:         '#ffcc00',
} as const;

// ─── フェイズアクション定義 ───────────────────────────────────────────
export interface CardAction {
  label: string;
  color?: string;
  onClick: () => void;
}

// ─── カード拡大モーダル ─────────────────────────────────────────────
export function CardModal({ card, onClose, actions }: { card: CardData; onClose: () => void; actions?: CardAction[] }) {
  return createPortal(
    <div
      onClick={onClose}
      onTouchEnd={e => { e.preventDefault(); onClose(); }}
      style={{
        position: 'fixed', inset: 0, zIndex: 3000,
        backgroundColor: 'rgba(0,0,0,0.95)',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', padding: 20,
      }}
    >
      <img
        src={card.ImgURL} alt={card.CardName}
        style={{ maxWidth: '90vw', maxHeight: '62vh', objectFit: 'contain', borderRadius: 10, boxShadow: '0 0 40px #007bff44' }}
        onError={e => { const img = e.target as HTMLImageElement; if (!img.src.endsWith('/ErrerCard.webp')) img.src = '/ErrerCard.webp'; }}
      />
      <p style={{ color: C.textSub, fontSize: 14, fontWeight: 'bold', marginTop: 14, textAlign: 'center' }}>{card.CardName}</p>
      <p style={{ color: C.textFaint, fontSize: 11, margin: '4px 0 0', textAlign: 'center' }}>
        {card.CardNum} / {card.Type}{card.Level ? ` Lv.${card.Level}` : ''} / {card.Color}
      </p>
      {actions && actions.length > 0 && (
        <div
          onClick={e => e.stopPropagation()}
          onTouchEnd={e => e.stopPropagation()}
          style={{ display: 'flex', gap: 10, marginTop: 18, flexWrap: 'wrap', justifyContent: 'center' }}>
          {actions.map((act, i) => (
            <button key={i}
              onClick={() => { act.onClick(); onClose(); }}
              onTouchEnd={e => { e.preventDefault(); e.stopPropagation(); act.onClick(); onClose(); }}
              style={{
                padding: '10px 24px', borderRadius: 8, border: 'none',
                backgroundColor: act.color ?? C.accent, color: C.text,
                fontSize: 14, fontWeight: 'bold', cursor: 'pointer',
              }}>
              {act.label}
            </button>
          ))}
        </div>
      )}
      <p style={{ color: C.textVeryFaint, fontSize: 11, marginTop: 10 }}>タップして閉じる</p>
    </div>,
    document.body,
  );
}

// ─── CardStackModal: スタックカード拡大（スワイプで上下移動） ──────────
export function CardStackModal({ stack, cards, onClose, actions }: {
  stack: string[];
  cards: CardData[];
  onClose: () => void;
  actions?: CardAction[];
}) {
  const [idx, setIdx] = useState(stack.length - 1);
  const touchStart = useRef<{ x: number; y: number } | null>(null);

  const card = cards.find(c => c.CardNum === getCardNum(stack[idx]));
  const isTop = idx === stack.length - 1;
  const isBottom = idx === 0;
  const hasStack = stack.length > 1;

  const goDeeper  = () => setIdx(i => Math.max(0, i - 1));
  const goShallow = () => setIdx(i => Math.min(stack.length - 1, i + 1));

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  };
  const handleTouchEnd = (e: React.TouchEvent) => {
    e.preventDefault();
    if (!touchStart.current) return;
    const dx = e.changedTouches[0].clientX - touchStart.current.x;
    const dy = e.changedTouches[0].clientY - touchStart.current.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    touchStart.current = null;
    if (dist < 12) { onClose(); return; }
    if (Math.abs(dx) >= Math.abs(dy)) {
      if (dx < -40) goDeeper(); else if (dx > 40) goShallow();
    } else {
      if (dy > 40) goDeeper(); else if (dy < -40) goShallow();
    }
  };

  return createPortal(
    <div
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 3000,
        backgroundColor: 'rgba(0,0,0,0.95)',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        padding: 20, userSelect: 'none',
      }}
    >
      {hasStack && (
        <div style={{ display: 'flex', gap: 6, marginBottom: 10 }} onClick={e => e.stopPropagation()}>
          {[...stack].reverse().map((_, ri) => {
            const si = stack.length - 1 - ri;
            return (
              <div key={ri} onClick={e => { e.stopPropagation(); setIdx(si); }}
                style={{
                  width: 9, height: 9, borderRadius: '50%', cursor: 'pointer',
                  backgroundColor: si === idx ? C.accent : C.textVeryFaint,
                  border: si === idx ? '1px solid #7ab8ff' : '1px solid #222',
                }} />
            );
          })}
        </div>
      )}
      <div style={{ color: C.textFaint, fontSize: 10, marginBottom: 6, textAlign: 'center' }}>
        {isTop ? '最上層（アクティブ）' : isBottom ? '最下層' : `上から${stack.length - idx}枚目`}
        {hasStack && <span style={{ color: C.textVeryFaint, marginLeft: 8 }}>{idx + 1} / {stack.length}</span>}
      </div>
      {card ? (
        <img
          src={card.ImgURL} alt={card.CardName}
          onClick={e => e.stopPropagation()}
          style={{ maxWidth: '86vw', maxHeight: '66vh', objectFit: 'contain', borderRadius: 10, boxShadow: '0 0 40px #007bff44' }}
          onError={e => { const img = e.target as HTMLImageElement; if (!img.src.endsWith('/ErrerCard.webp')) img.src = '/ErrerCard.webp'; }}
        />
      ) : (
        <div style={{ width: 200, height: 280, backgroundColor: C.bgButtonDark, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={e => e.stopPropagation()}>
          <span style={{ color: C.textUiFaint, fontSize: 12 }}>{stack[idx]}</span>
        </div>
      )}
      <p style={{ color: C.textSub, fontSize: 14, fontWeight: 'bold', marginTop: 12, textAlign: 'center' }}>
        {card?.CardName ?? stack[idx]}
      </p>
      <p style={{ color: C.textFaint, fontSize: 11, margin: '4px 0 0', textAlign: 'center' }}>
        {card?.CardNum} / {card?.Type}{card?.Level ? ` Lv.${card.Level}` : ''} / {card?.Color}
      </p>
      {actions && actions.length > 0 && (
        <div
          onClick={e => e.stopPropagation()}
          onTouchEnd={e => e.stopPropagation()}
          style={{ display: 'flex', gap: 10, marginTop: 18, flexWrap: 'wrap', justifyContent: 'center' }}>
          {actions.map((act, i) => (
            <button key={i}
              onClick={() => { act.onClick(); onClose(); }}
              onTouchEnd={e => { e.preventDefault(); e.stopPropagation(); act.onClick(); onClose(); }}
              style={{ padding: '10px 24px', borderRadius: 8, border: 'none',
                backgroundColor: act.color ?? C.accent, color: C.text,
                fontSize: 14, fontWeight: 'bold', cursor: 'pointer' }}>
              {act.label}
            </button>
          ))}
        </div>
      )}
      <p style={{ color: C.textDimmost, fontSize: 10, marginTop: 12 }}>
        {hasStack ? 'スワイプで移動 / タップで閉じる' : 'タップして閉じる'}
      </p>
    </div>,
    document.body,
  );
}

// ─── CardSlot: フィールド用 ─────────────────────────────────────────
export interface CardSlotProps {
  cardNum: string | null;
  cards: CardData[];
  width?: number;
  height?: number;
  label?: string;
  faceDown?: boolean;
  actions?: CardAction[];
}

export function CardSlot({ cardNum, cards, width = 60, height = 84, label, faceDown, actions }: CardSlotProps) {
  const [enlarged, setEnlarged] = useState(false);
  const touchPos = useRef<{ x: number; y: number } | null>(null);
  const card = cardNum ? cards.find(c => c.CardNum === getCardNum(cardNum)) : null;

  const handleTouchStart = (e: React.TouchEvent) => {
    e.preventDefault();
    touchPos.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  };
  const handleTouchEnd = (e: React.TouchEvent) => {
    e.preventDefault();
    if (!touchPos.current || !cardNum || faceDown) { touchPos.current = null; return; }
    const dx = e.changedTouches[0].clientX - touchPos.current.x;
    const dy = e.changedTouches[0].clientY - touchPos.current.y;
    touchPos.current = null;
    if (Math.sqrt(dx * dx + dy * dy) < 10) setEnlarged(true);
  };

  return (
    <>
      <div
        style={{
          width, height, flexShrink: 0, borderRadius: 4, overflow: 'hidden',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          border: cardNum ? C.borderCard : C.borderEmpty,
          backgroundColor: cardNum ? C.bgCard : C.bgCardEmpty,
          userSelect: 'none', touchAction: 'none',
          cursor: cardNum && !faceDown ? 'pointer' : 'default',
        }}
        onClick={() => { if (cardNum && !faceDown) setEnlarged(true); }}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={() => { touchPos.current = null; }}
      >
        {faceDown && cardNum ? (
          <img src="/Card_Black.jpg" alt="card back" draggable={false}
            style={{ width: '100%', height: '100%', objectFit: 'contain', pointerEvents: 'none', display: 'block' }} />
        ) : card ? (
          <img src={card.ImgURL} alt={card.CardName} draggable={false}
            style={{ width: '100%', height: '100%', objectFit: 'contain', pointerEvents: 'none', display: 'block' }}
            onError={e => { const img = e.target as HTMLImageElement; if (!img.src.endsWith('/ErrerCard.webp')) img.src = '/ErrerCard.webp'; }}
          />
        ) : (
          <span style={{ fontSize: 8, color: C.textGhost, textAlign: 'center', padding: 2, lineHeight: 1.3 }}>{label}</span>
        )}
      </div>
      {enlarged && card && <CardModal card={card} onClose={() => setEnlarged(false)} actions={actions} />}
    </>
  );
}

// ─── StackSlot: ルリグ・アシストルリグ用スタックスロット ─────────────
export interface StackSlotProps {
  stack: string[];
  cards: CardData[];
  width?: number;
  height?: number;
  label?: string;
  faceDown?: boolean;
  actions?: CardAction[];
  isDown?: boolean;
  isFrozen?: boolean;
}

export function StackSlot({ stack, cards, width = 60, height = 84, label, faceDown, actions, isDown = false, isFrozen = false }: StackSlotProps) {
  const [showModal, setShowModal] = useState(false);
  const touchPos = useRef<{ x: number; y: number } | null>(null);

  const topCard = stack.length > 0 ? stack[stack.length - 1] : null;
  const card = topCard ? cards.find(c => c.CardNum === getCardNum(topCard)) : null;

  const handleTouchStart = (e: React.TouchEvent) => {
    e.preventDefault();
    touchPos.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  };
  const handleTouchEnd = (e: React.TouchEvent) => {
    e.preventDefault();
    if (!touchPos.current || !topCard || faceDown) { touchPos.current = null; return; }
    const dx = e.changedTouches[0].clientX - touchPos.current.x;
    const dy = e.changedTouches[0].clientY - touchPos.current.y;
    touchPos.current = null;
    if (Math.sqrt(dx * dx + dy * dy) < 10) setShowModal(true);
  };

  return (
    <>
      <div style={{ position: 'relative', width, flexShrink: 0 }}>
        <div
          style={{
            width, height, borderRadius: 4, overflow: 'hidden',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: topCard ? C.borderCard : C.borderEmpty,
            backgroundColor: topCard ? C.bgCard : C.bgCardEmpty,
            userSelect: 'none', touchAction: 'none',
            cursor: topCard && !faceDown ? 'pointer' : 'default',
          }}
          onClick={() => { if (topCard && !faceDown) setShowModal(true); }}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
          onTouchCancel={() => { touchPos.current = null; }}
        >
          {faceDown && topCard ? (
            <img src="/Card_Black.jpg" alt="card back" draggable={false}
              style={{ width: '100%', height: '100%', objectFit: 'contain', pointerEvents: 'none', display: 'block' }} />
          ) : card ? (
            <img src={card.ImgURL} alt={card.CardName} draggable={false}
              style={{ width: '100%', height: '100%', objectFit: 'contain', pointerEvents: 'none', display: 'block',
                ...(isDown ? { transform: 'rotate(90deg)' } : {}) }}
              onError={e => { const img = e.target as HTMLImageElement; if (!img.src.endsWith('/ErrerCard.webp')) img.src = '/ErrerCard.webp'; }}
            />
          ) : (
            <span style={{ fontSize: 8, color: C.textGhost, textAlign: 'center', padding: 2, lineHeight: 1.3 }}>{label}</span>
          )}
        </div>
        {stack.length > 1 && (
          <div style={{
            position: 'absolute', bottom: 2, right: 2,
            backgroundColor: C.accent, color: C.text,
            fontSize: 8, fontWeight: 'bold', borderRadius: 3,
            padding: '1px 3px', lineHeight: 1, pointerEvents: 'none',
          }}>
            ×{stack.length}
          </div>
        )}
        {isFrozen && (
          <div style={{
            position: 'absolute', bottom: 2, left: 0, right: 0,
            backgroundColor: 'rgba(100,180,255,0.88)', color: '#003366',
            fontSize: 8, fontWeight: 'bold', textAlign: 'center',
            pointerEvents: 'none', lineHeight: '13px',
          }}>
            凍結
          </div>
        )}
      </div>
      {showModal && topCard && (
        <CardStackModal stack={stack} cards={cards} onClose={() => setShowModal(false)} actions={actions} />
      )}
    </>
  );
}

// ─── StackedSigniSlot: シグニゾーン用スタックスロット ──────────────
export const SIGNI_STACK_OFFSET = 4;

export interface StackedSigniSlotProps {
  stack: string[] | null;
  cards: CardData[];
  width?: number;
  height?: number;
  label?: string;
  actions?: CardAction[];
  isDown?: boolean;
  isFrozen?: boolean;
  isAbilityRemoved?: boolean;
  effectivePowers?: Map<string, number>;
  charmCardNum?: string | null;
  acceCardNum?: string | null;
  virusCount?: number;
  isMe?: boolean;
}

export function StackedSigniSlot({ stack, cards, width = 82, height = 82, label, actions, isDown = false, isFrozen = false, isAbilityRemoved = false, effectivePowers, charmCardNum, acceCardNum, virusCount = 0, isMe }: StackedSigniSlotProps) {
  const [showModal, setShowModal] = useState(false);
  const [showCharmModal, setShowCharmModal] = useState(false);
  const touchPos = useRef<{ x: number; y: number } | null>(null);

  const n = stack?.length ?? 0;
  const extraH = Math.max(0, n - 1) * SIGNI_STACK_OFFSET;

  const handleTouchStart = (e: React.TouchEvent) => {
    e.preventDefault();
    touchPos.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  };
  const handleTouchEnd = (e: React.TouchEvent) => {
    e.preventDefault();
    if (!touchPos.current || !n) { touchPos.current = null; return; }
    const dx = e.changedTouches[0].clientX - touchPos.current.x;
    const dy = e.changedTouches[0].clientY - touchPos.current.y;
    touchPos.current = null;
    if (Math.sqrt(dx * dx + dy * dy) < 10) setShowModal(true);
  };

  if (!n) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <div style={{
          width, height, flexShrink: 0, borderRadius: charmCardNum ? '4px 4px 0 0' : 4,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          border: C.borderEmpty, backgroundColor: C.bgCardEmpty,
        }}>
          <span style={{ fontSize: 8, color: C.textGhost, textAlign: 'center', padding: 2, lineHeight: 1.3 }}>{label}</span>
        </div>
        {charmCardNum && (
          <CharmPeek width={width} onTap={() => setShowCharmModal(true)} />
        )}
        {showCharmModal && charmCardNum && (
          <CharmModal cardNum={charmCardNum} cards={cards} isMe={!!isMe} onClose={() => setShowCharmModal(false)} />
        )}
      </div>
    );
  }

  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <div
        style={{
          position: 'relative', width, height: height + extraH, flexShrink: 0,
          userSelect: 'none', touchAction: 'none', cursor: 'pointer',
          borderRadius: charmCardNum ? '4px 4px 0 0' : 4,
        }}
        onClick={() => { if (n) setShowModal(true); }}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={() => { touchPos.current = null; }}
      >
        {stack!.map((cardNum, i) => {
          const card = cards.find(c => c.CardNum === getCardNum(cardNum));
          const top = (n - 1 - i) * SIGNI_STACK_OFFSET;
          const isTopCard = i === n - 1;
          const imgTransform = isDown && isTopCard ? 'rotate(90deg)' : undefined;
          return (
            <div key={i} style={{
              position: 'absolute', top, left: 0,
              width, height, borderRadius: 4, overflow: 'hidden',
              zIndex: i + 1,
              border: C.borderCard, backgroundColor: C.bgCard,
            }}>
              {card ? (
                <img src={card.ImgURL} alt={card.CardName} draggable={false}
                  style={{ width: '100%', height: '100%', objectFit: 'contain', pointerEvents: 'none', display: 'block',
                    ...(imgTransform ? { transform: imgTransform } : {}) }}
                  onError={e => { const img = e.target as HTMLImageElement; if (!img.src.endsWith('/ErrerCard.webp')) img.src = '/ErrerCard.webp'; }}
                />
              ) : (
                <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span style={{ fontSize: 8, color: C.textVeryFaint }}>{cardNum}</span>
                </div>
              )}
            </div>
          );
        })}
        {(() => {
          const topNum = stack![n - 1];
          const topCard = cards.find(c => c.CardNum === getCardNum(topNum));
          const basePow = topCard?.Power;
          if (!basePow || basePow === '-') return null;
          const effPow = effectivePowers?.get(topNum);
          const rawPow = effPow !== undefined ? effPow : parseInt(basePow, 10);
          const displayPow = Math.max(0, rawPow);
          const isBuffed = effPow !== undefined && effPow !== parseInt(basePow, 10);
          return (
            <div style={{
              position: 'absolute',
              bottom: extraH + 3,
              left: 0, right: 0,
              textAlign: 'center',
              zIndex: n + 1,
              pointerEvents: 'none',
              fontSize: 13,
              fontWeight: 'bold',
              color: isBuffed ? (effPow! > parseInt(basePow, 10) ? '#0066ff' : '#ff2200') : '#000000',
              lineHeight: 1,
              textShadow: [
                '-1px -1px 0 #fff', '1px -1px 0 #fff',
                '-1px  1px 0 #fff', '1px  1px 0 #fff',
                ' 0px -1px 0 #fff', '0px  1px 0 #fff',
                '-1px  0px 0 #fff', '1px  0px 0 #fff',
              ].join(', '),
            }}>
              {displayPow.toLocaleString()}
            </div>
          );
        })()}
        {n > 1 && (
          <div style={{
            position: 'absolute', top: extraH + 2, right: 2,
            backgroundColor: C.accent, color: C.text,
            fontSize: 8, fontWeight: 'bold', borderRadius: 3,
            padding: '1px 3px', lineHeight: 1, pointerEvents: 'none',
            zIndex: n + 2,
          }}>
            ×{n}
          </div>
        )}
        {isFrozen && (
          <div style={{
            position: 'absolute', bottom: extraH + 2, left: 0, right: 0,
            backgroundColor: 'rgba(100,180,255,0.88)', color: '#003366',
            fontSize: 8, fontWeight: 'bold', textAlign: 'center',
            pointerEvents: 'none', zIndex: n + 2, lineHeight: '13px',
          }}>
            凍結
          </div>
        )}
        {isAbilityRemoved && (
          <div style={{
            position: 'absolute', top: extraH + 2, left: 0, right: 0,
            backgroundColor: 'rgba(80,0,80,0.82)', color: '#ffaaff',
            fontSize: 7, fontWeight: 'bold', textAlign: 'center',
            pointerEvents: 'none', zIndex: n + 2, lineHeight: '13px',
          }}>
            能力消去
          </div>
        )}
        {virusCount > 0 && (
          <div style={{
            position: 'absolute', top: extraH + 2, right: 2,
            backgroundColor: 'rgba(180,0,0,0.88)', color: '#fff',
            fontSize: 8, fontWeight: 'bold', borderRadius: 3,
            padding: '1px 3px', lineHeight: 1, pointerEvents: 'none', zIndex: n + 3,
          }}>
            V
          </div>
        )}
        {acceCardNum && (
          <div style={{
            position: 'absolute', bottom: extraH + 2, right: 2,
            backgroundColor: 'rgba(0,120,60,0.9)', color: '#fff',
            fontSize: 7, fontWeight: 'bold', borderRadius: 3,
            padding: '1px 3px', lineHeight: 1, pointerEvents: 'none', zIndex: n + 3,
          }}>
            ACE
          </div>
        )}
      </div>
      {charmCardNum && (
        <CharmPeek width={width}
          onTap={() => setShowCharmModal(true)} />
      )}
      </div>
      {showModal && stack && (
        <CardStackModal stack={stack} cards={cards} onClose={() => setShowModal(false)} actions={actions} />
      )}
      {showCharmModal && charmCardNum && (
        <CharmModal cardNum={charmCardNum} cards={cards} isMe={!!isMe} onClose={() => setShowCharmModal(false)} />
      )}
    </>
  );
}

// ─── CharmPeek: チャームカードの覗き表示 ──────────────────────────
const CHARM_PEEK_H = 20;
export function CharmPeek({ width, onTap }: { width: number; onTap: () => void; }) {
  const touchPos = useRef<{ x: number; y: number } | null>(null);
  return (
    <div
      style={{
        width, height: CHARM_PEEK_H, overflow: 'hidden', flexShrink: 0,
        cursor: 'pointer', borderRadius: '0 0 4px 4px',
        border: '1px solid rgba(100,150,255,0.35)', borderTop: 'none',
        touchAction: 'none', userSelect: 'none',
      }}
      onClick={onTap}
      onTouchStart={e => { e.preventDefault(); touchPos.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }; }}
      onTouchEnd={e => {
        e.preventDefault();
        if (!touchPos.current) return;
        const dx = e.changedTouches[0].clientX - touchPos.current.x;
        const dy = e.changedTouches[0].clientY - touchPos.current.y;
        touchPos.current = null;
        if (Math.sqrt(dx * dx + dy * dy) < 10) onTap();
      }}
      onTouchCancel={() => { touchPos.current = null; }}
    >
      <img
        src="/Card_Black.jpg"
        alt="charm"
        draggable={false}
        style={{ width: '100%', height: Math.round(width * 1.4), objectFit: 'cover', objectPosition: 'top',
          display: 'block', pointerEvents: 'none' }}
      />
    </div>
  );
}

// ─── CharmModal: チャームタップ時モーダル ──────────────────────────
export function CharmModal({ cardNum, cards, isMe, onClose }: {
  cardNum: string; cards: CardData[]; isMe: boolean; onClose: () => void;
}) {
  const card = cards.find(c => c.CardNum === getCardNum(cardNum));
  if (isMe && card) return <CardModal card={card} onClose={onClose} />;
  return createPortal(
    <div
      onClick={onClose}
      onTouchEnd={e => { e.preventDefault(); onClose(); }}
      style={{ position: 'fixed', inset: 0, zIndex: 3000,
        backgroundColor: 'rgba(0,0,0,0.95)',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', padding: 20 }}
    >
      <img src="/Card_Black.jpg" alt="charm back" draggable={false}
        style={{ maxWidth: '90vw', maxHeight: '62vh', objectFit: 'contain', borderRadius: 10 }} />
      <p style={{ color: C.textFaint, fontSize: 12, marginTop: 12 }}>チャーム（非公開）</p>
    </div>,
    document.body,
  );
}

// ─── 手札表示 ──────────────────────────────────────────────────────
export function HandCards({ cardNums, cards, faceDown, getCardActions }: {
  cardNums: string[];
  cards: CardData[];
  faceDown?: boolean;
  getCardActions?: (cardNum: string, index: number) => CardAction[];
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [cw, setCw] = useState(0);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    setCw(el.clientWidth);
    const ro = new ResizeObserver(([entry]) => setCw(entry.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const cardW = 50;
  const cardH = 70;
  const n = cardNums.length;

  const spacing = n <= 1
    ? 0
    : Math.min(cardW + 4, cw > cardW ? (cw - cardW) / (n - 1) : 4);

  return (
    <div ref={containerRef} style={{ width: '100%', height: n > 0 ? cardH : 0, flexShrink: 0 }}>
      {n > 0 && (
        <div style={{ position: 'relative', height: cardH, width: '100%' }}>
          {cardNums.map((num, i) => (
            <div key={i} style={{ position: 'absolute', left: i * spacing, top: 0, zIndex: i }}>
              <CardSlot cardNum={num} cards={cards} width={cardW} height={cardH} faceDown={faceDown}
                actions={!faceDown && getCardActions ? getCardActions(num, i) : undefined} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── 数値バッジ ──────────────────────────────────────────────────────
export function Stat({ label, value, color = C.statDefault, onClick }: {
  label: string; value: number; color?: string; onClick?: () => void;
}) {
  return onClick ? (
    <div
      onClick={onClick}
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1,
        padding: '5px 5px', borderRadius: 7,
        backgroundColor: C.bgBadge, border: C.borderBadge,
        cursor: 'pointer', userSelect: 'none',
      }}
    >
      <span style={{ fontSize: 14, fontWeight: 'bold', color, lineHeight: 1 }}>{value}</span>
      <span style={{ fontSize: 8, color: C.textBadge, lineHeight: 1 }}>{label}</span>
    </div>
  ) : (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1, padding: '3px 4px' }}>
      <span style={{ fontSize: 13, fontWeight: 'bold', color, lineHeight: 1 }}>{value}</span>
      <span style={{ fontSize: 8, color: C.textStatDim, lineHeight: 1 }}>{label}</span>
    </div>
  );
}

// ─── ZoneCardModal: ゾーンのカード一覧 ──────────────────────────────
export function ZoneCardModal({ title, cardNums, cards, onClose, getCardActions }: {
  title: string;
  cardNums: string[];
  cards: CardData[];
  onClose: () => void;
  getCardActions?: (cardNum: string) => CardAction[];
}) {
  return createPortal(
    <div
      onClick={onClose}
      onTouchEnd={e => { e.preventDefault(); onClose(); }}
      style={{
        position: 'fixed', inset: 0, zIndex: 2500,
        backgroundColor: 'rgba(0,0,0,0.93)',
        display: 'flex', flexDirection: 'column',
        padding: '14px 12px', boxSizing: 'border-box',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        onTouchEnd={e => e.stopPropagation()}
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexShrink: 0 }}>
        <span style={{ color: C.textSub, fontWeight: 'bold', fontSize: 15 }}>
          {title}
          <span style={{ color: C.textUiFaint, fontSize: 12, fontWeight: 'normal', marginLeft: 8 }}>{cardNums.length}枚</span>
        </span>
        <button onClick={onClose}
          style={{ padding: '5px 16px', borderRadius: 6, border: C.borderUI, backgroundColor: C.bgButtonDark, color: C.textDim, cursor: 'pointer', fontSize: 13 }}>
          閉じる
        </button>
      </div>
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {cardNums.length === 0 ? (
          <p style={{ color: C.textVeryFaint, textAlign: 'center', marginTop: 40, fontSize: 13 }}>カードなし</p>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {cardNums.map((num, i) => (
              <div key={i}
                onClick={e => e.stopPropagation()}
                onTouchEnd={e => e.stopPropagation()}>
                <CardSlot cardNum={num} cards={cards} width={62} height={87}
                  actions={getCardActions ? getCardActions(num) : undefined} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

// ─── プレイヤー盤面 ──────────────────────────────────────────────────
export function PlayerField({ state, cards, isMe, getSigniZoneActions, getLrigDeckCardActions, getLrigFieldActions, getKeyPieceActions, getAssistLActions, getAssistRActions, getFreeZoneActions, closeZoneSignal, effectivePowers }: {
  state: PlayerState; cards: CardData[]; isMe: boolean;
  getSigniZoneActions?: (rawZoneIdx: number) => CardAction[];
  getLrigDeckCardActions?: (cardNum: string) => CardAction[];
  getLrigFieldActions?: () => CardAction[];
  getKeyPieceActions?: () => CardAction[];
  getAssistLActions?: () => CardAction[];
  getAssistRActions?: () => CardAction[];
  getFreeZoneActions?: (cardNum: string) => CardAction[];
  closeZoneSignal?: number;
  effectivePowers?: Map<string, number>;
}) {
  const [zoneModal, setZoneModal] = useState<{
    title: string; cardNums: string[]; isLrigDeck?: boolean; isFreeZone?: boolean;
  } | null>(null);

  useEffect(() => {
    if (closeZoneSignal) setZoneModal(null);
  }, [closeZoneSignal]);
  const signiW = 82, signiH = 82;
  const lowerW = 58, lowerH = 58;
  const lrigW  = 70, lrigH  = 70;

  const showZone = (title: string, cardNums: string[]) => setZoneModal({ title, cardNums });

  const statsRow = (
    <div style={{ display: 'flex', gap: 3, justifyContent: 'center', flexWrap: 'wrap', padding: '2px 0', alignItems: 'center' }}>
      <Stat label="手札"        value={state.hand.length} color="#7ab8ff" />
      <Stat label="デッキ"      value={state.deck.length} />
      {isMe
        ? <Stat label="ルリグDK" value={state.lrig_deck.length} onClick={() => setZoneModal({ title: 'ルリグデッキ', cardNums: state.lrig_deck, isLrigDeck: true })} />
        : <Stat label="ルリグDK" value={state.lrig_deck.length} />
      }
      <Stat label="ライフ"      value={state.life_cloth.length} color="#bb3333" />
      <Stat label="エナ"        value={state.energy.length}     onClick={() => showZone('エナゾーン', state.energy)} />
      <Stat label="トラッシュ"  value={state.trash.length}      onClick={() => showZone('トラッシュ', state.trash)} />
      <Stat label="Lトラッシュ" value={state.lrig_trash.length} onClick={() => showZone('ルリグトラッシュ', state.lrig_trash)} />
      <Stat label="コイン"      value={state.coins} color="#cc8800" />
    </div>
  );

  const rawSigni = state.field.signi ?? [null, null, null];
  const displaySigni = rawSigni;
  const freeZoneCards = state.field.free_zone ?? [];
  const freeZoneW = 52, freeZoneH = signiH;

  const freeZoneSlot = (
    <div
      onClick={() => freeZoneCards.length > 0 && setZoneModal({ title: 'フリーゾーン', cardNums: freeZoneCards, isFreeZone: isMe })}
      style={{
        width: freeZoneW, height: freeZoneH, borderRadius: 6, flexShrink: 0,
        border: freeZoneCards.length > 0 ? '1px solid #5599bb' : '1px dashed #334455',
        backgroundColor: freeZoneCards.length > 0 ? 'rgba(40,80,100,0.35)' : 'rgba(20,30,40,0.2)',
        cursor: freeZoneCards.length > 0 ? 'pointer' : 'default',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        position: 'relative', overflow: 'hidden',
      }}>
      {freeZoneCards.length > 0 ? (
        <>
          <img
            src={cards.find(c => c.CardNum === getCardNum(freeZoneCards[freeZoneCards.length - 1]))?.ImgURL ?? ''}
            alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: 0.6 }}
            onError={e => { const img = e.target as HTMLImageElement; if (!img.src.endsWith('/ErrerCard.webp')) img.src = '/ErrerCard.webp'; }} />
          <div style={{ position: 'relative', zIndex: 1, textAlign: 'center' }}>
            {freeZoneCards.some(n => state.keyword_grants?.[n]?.includes('チアガール')) && (
              <div style={{ fontSize: 8, color: '#aaddff', fontWeight: 'bold', marginBottom: 2 }}>CHEER</div>
            )}
            <div style={{
              backgroundColor: 'rgba(0,0,0,0.7)', borderRadius: 8, padding: '1px 5px',
              fontSize: 11, color: '#fff', fontWeight: 'bold',
            }}>{freeZoneCards.length}</div>
          </div>
        </>
      ) : (
        <span style={{ fontSize: 8, color: '#334455', textAlign: 'center', lineHeight: 1.3 }}>FREE<br/>ZONE</span>
      )}
    </div>
  );

  const signiRow = (
    <div style={{ display: 'flex', gap: 5, alignItems: 'flex-start' }}>
      {freeZoneSlot}
      {displaySigni.map((s, i) => {
        const rawIdx = i;
        return (
          <StackedSigniSlot key={i} stack={s} cards={cards} width={signiW} height={signiH}
            label={`シグニ${i + 1}`}
            actions={getSigniZoneActions ? getSigniZoneActions(rawIdx) : undefined}
            isDown={state.field.signi_down?.[rawIdx] ?? false}
            isFrozen={state.field.signi_frozen?.[rawIdx] ?? false}
            isAbilityRemoved={s ? s.some(num => state.abilities_removed?.includes(num)) : false}
            effectivePowers={effectivePowers}
            charmCardNum={state.field.signi_charms?.[rawIdx] ?? null}
            acceCardNum={state.field.signi_acce?.[rawIdx] ?? null}
            virusCount={state.field.signi_virus?.[rawIdx] ?? 0}
            isMe={isMe} />
        );
      })}
      <div style={{ width: freeZoneW, flexShrink: 0 }} />
    </div>
  );

  const check     = state.field.check ?? null;
  const assist_l  = state.field.assist_lrig_l ?? [];
  const lrig      = state.field.lrig ?? [];
  const assist_r  = state.field.assist_lrig_r ?? [];
  const key_piece = state.field.key_piece ?? null;

  type Slot = { label: string; w: number; h: number; cardNum?: string | null; stack?: string[] };
  const lowerSlots: Slot[] = isMe
    ? [
        { cardNum: check,    label: 'CHECK',      w: lowerW, h: lowerH },
        { stack:   assist_l, label: 'アシスト左',  w: lowerW, h: lowerH },
        { stack:   lrig,     label: 'LRIG',        w: lrigW,  h: lrigH  },
        { stack:   assist_r, label: 'アシスト右',  w: lowerW, h: lowerH },
        { cardNum: key_piece,label: 'KEY',         w: lowerW, h: lowerH },
      ]
    : [
        { cardNum: key_piece,label: 'KEY',         w: lowerW, h: lowerH },
        { stack:   assist_r, label: 'アシスト右',  w: lowerW, h: lowerH },
        { stack:   lrig,     label: 'LRIG',        w: lrigW,  h: lrigH  },
        { stack:   assist_l, label: 'アシスト左',  w: lowerW, h: lowerH },
        { cardNum: check,    label: 'CHECK',       w: lowerW, h: lowerH },
      ];

  const lrig_down = state.field.lrig_down ?? false;

  const lowerRow = (
    <div style={{ display: 'flex', gap: 4, justifyContent: 'center', alignItems: 'center' }}>
      {lowerSlots.map((slot, i) =>
        slot.stack !== undefined
          ? <StackSlot
              key={i} stack={slot.stack} cards={cards} width={slot.w} height={slot.h} label={slot.label}
              actions={
                slot.label === 'LRIG'      && isMe && getLrigFieldActions ? getLrigFieldActions() :
                slot.label === 'アシスト左' && isMe && getAssistLActions  ? getAssistLActions()  :
                slot.label === 'アシスト右' && isMe && getAssistRActions  ? getAssistRActions()  :
                undefined
              }
              isDown={slot.label === 'LRIG' ? lrig_down : false}
              isFrozen={slot.label === 'LRIG' ? (state.field.lrig_frozen ?? false) : false}
            />
          : <CardSlot key={i} cardNum={slot.cardNum ?? null} cards={cards} width={slot.w} height={slot.h} label={slot.label}
              actions={slot.label === 'KEY' && isMe && getKeyPieceActions ? getKeyPieceActions() : undefined} />
      )}
    </div>
  );

  const content = isMe ? (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      {signiRow}
      {lowerRow}
      {statsRow}
    </div>
  ) : (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      {statsRow}
      {lowerRow}
      {signiRow}
    </div>
  );

  return (
    <>
      {content}
      {zoneModal && (
        <ZoneCardModal
          title={zoneModal.title}
          cardNums={zoneModal.isLrigDeck ? state.lrig_deck : zoneModal.cardNums}
          cards={cards}
          onClose={() => setZoneModal(null)}
          getCardActions={
            zoneModal.isLrigDeck ? getLrigDeckCardActions :
            zoneModal.isFreeZone  ? getFreeZoneActions :
            undefined
          }
        />
      )}
    </>
  );
}
