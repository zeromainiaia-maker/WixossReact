import { useState } from 'react';
import type { CardData, Deck } from '../types';

interface Props {
  decks: Deck[];
  cards: CardData[];
  onCreateDeck: (name: string) => void;
  onEditDeck: (id: string) => void;
  onBack: () => void;
}

export default function DeckListScreen({ decks, cards, onCreateDeck, onEditDeck, onBack }: Props) {
  const [showModal, setShowModal] = useState(false);
  const [nameInput, setNameInput] = useState('');

  const getCard = (cardNum: string) => cards.find(c => c.CardNum === cardNum);

  const handleCreate = () => {
    const trimmed = nameInput.trim();
    if (!trimmed) return;
    onCreateDeck(trimmed);
    setShowModal(false);
    setNameInput('');
  };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#0a0a0f', color: '#fff', padding: '24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '32px' }}>
        <button onClick={onBack} style={backButtonStyle}>← 戻る</button>
        <h2 style={{ fontSize: '20px', color: '#007bff' }}>デッキ一覧</h2>
        <button onClick={() => { setNameInput(''); setShowModal(true); }} style={createButtonStyle}>＋ 新規作成</button>
      </div>

      {decks.length === 0 ? (
        <p style={{ color: '#555', textAlign: 'center', marginTop: '80px' }}>
          デッキがありません。新規作成してください。
        </p>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
          {decks.map(deck => {
            const thumbnail = deck.thumbnailCardNum ? getCard(deck.thumbnailCardNum) : null;
            return (
              <div key={deck.id} onClick={() => onEditDeck(deck.id)} style={deckCardStyle}>
                <div style={{ width: '100%', aspectRatio: '3/4', backgroundColor: '#1a1a2e', borderRadius: '4px', overflow: 'hidden', marginBottom: '12px' }}>
                  {thumbnail ? (
                    <img src={thumbnail.ImgURL} alt={thumbnail.CardName} style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={e => { const img = e.target as HTMLImageElement; if (!img.src.endsWith('/ErrorCard.webp')) img.src = '/ErrorCard.webp'; }} />
                  ) : (
                    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#333', fontSize: '12px' }}>NO IMAGE</div>
                  )}
                </div>
                <p style={{ fontSize: '14px', fontWeight: 'bold', marginBottom: '4px' }}>{deck.name}</p>
                <p style={{ fontSize: '11px', color: '#555' }}>
                  メイン {deck.mainDeck.length}/40 &nbsp; ルリグ {deck.lrigDeck.length}/10
                </p>
              </div>
            );
          })}
        </div>
      )}

      {showModal && (
        <div
          onClick={() => setShowModal(false)}
          style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}
        >
          <div onClick={e => e.stopPropagation()} style={{ backgroundColor: '#1a1a2e', borderRadius: '12px', padding: '24px', width: '300px', border: '1px solid #333' }}>
            <h3 style={{ marginBottom: '16px', fontSize: '16px' }}>デッキ名を入力</h3>
            <input
              value={nameInput}
              onChange={e => setNameInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleCreate()}
              placeholder="デッキ名"
              autoFocus
              style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #444', backgroundColor: '#0a0a0f', color: '#fff', fontSize: '14px', boxSizing: 'border-box' }}
            />
            <div style={{ display: 'flex', gap: '8px', marginTop: '16px', justifyContent: 'flex-end' }}>
              <button onClick={() => setShowModal(false)} style={cancelButtonStyle}>キャンセル</button>
              <button onClick={handleCreate} disabled={!nameInput.trim()} style={{ ...confirmButtonStyle, opacity: nameInput.trim() ? 1 : 0.4 }}>作成</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const backButtonStyle: React.CSSProperties = {
  padding: '8px 14px', borderRadius: '6px', border: '1px solid #333',
  backgroundColor: 'transparent', color: '#888', fontSize: '13px',
};

const createButtonStyle: React.CSSProperties = {
  marginLeft: 'auto', padding: '8px 20px', borderRadius: '6px',
  border: 'none', backgroundColor: '#007bff', color: '#fff', fontSize: '14px', fontWeight: 'bold',
};

const deckCardStyle: React.CSSProperties = {
  backgroundColor: '#111', borderRadius: '8px', padding: '12px',
  border: '1px solid #222', cursor: 'pointer',
};

const cancelButtonStyle: React.CSSProperties = {
  padding: '8px 16px', borderRadius: '6px', border: '1px solid #444',
  backgroundColor: 'transparent', color: '#888', fontSize: '13px',
};

const confirmButtonStyle: React.CSSProperties = {
  padding: '8px 16px', borderRadius: '6px', border: 'none',
  backgroundColor: '#007bff', color: '#fff', fontSize: '13px', fontWeight: 'bold',
};
