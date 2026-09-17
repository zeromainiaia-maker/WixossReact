import type { CardData } from '../../types';

/**
 * サムネイルにするカードを選ぶモーダル（デッキ編集のデッキサムネイル／デッキ一覧のフォルダサムネイルで共用）。
 */
export function CardThumbnailPicker({ title, cards, selectedCardNum, onSelect, onClose, testIdPrefix }: {
  title: string;
  cards: CardData[];
  selectedCardNum?: string | null;
  onSelect: (cardNum: string) => void;
  onClose: () => void;
  testIdPrefix?: string;
}) {
  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300 }}
    >
      <div onClick={e => e.stopPropagation()} style={{ backgroundColor: '#1a1a2e', borderRadius: '12px', padding: '20px', width: 'min(90vw, 480px)', maxHeight: '80vh', display: 'flex', flexDirection: 'column', border: '1px solid #444' }}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: '14px' }}>
          <h3 style={{ color: '#fff', fontSize: '15px', margin: 0 }}>{title}</h3>
          <button onClick={onClose} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: '#888', fontSize: '20px', cursor: 'pointer', lineHeight: 1 }}>×</button>
        </div>
        {cards.length === 0 ? (
          <p style={{ color: '#666', textAlign: 'center', padding: '24px' }}>デッキにカードがありません</p>
        ) : (
          <div style={{ overflowY: 'auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(80px, 1fr))', gap: '8px' }}>
            {cards.map(card => {
              const isSelected = selectedCardNum === card.CardNum;
              return (
                <div
                  key={card.CardNum}
                  data-testid={testIdPrefix ? `${testIdPrefix}${card.CardNum}` : undefined}
                  onClick={() => onSelect(card.CardNum)}
                  style={{ cursor: 'pointer', borderRadius: '6px', overflow: 'hidden', border: isSelected ? '2px solid #7755dd' : '2px solid transparent', position: 'relative' }}
                >
                  <img
                    src={card.ImgURL}
                    alt={card.CardName}
                    style={{ width: '100%', aspectRatio: '3/4', objectFit: 'cover', display: 'block' }}
                    onError={e => { const img = e.target as HTMLImageElement; if (!img.src.endsWith('/ErrerCard.webp')) img.src = '/ErrerCard.webp'; }}
                  />
                  {isSelected && (
                    <div style={{ position: 'absolute', top: '4px', right: '4px', backgroundColor: '#7755dd', borderRadius: '50%', width: '18px', height: '18px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', color: '#fff', fontWeight: 'bold' }}>✓</div>
                  )}
                  <div style={{ padding: '2px 4px', backgroundColor: 'rgba(0,0,0,0.6)', position: 'absolute', bottom: 0, left: 0, right: 0 }}>
                    <p style={{ fontSize: '9px', color: '#fff', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{card.CardName}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
