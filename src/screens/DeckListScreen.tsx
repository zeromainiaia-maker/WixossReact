import { useState, useEffect } from 'react';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  arrayMove,
  rectSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { CardData, Deck } from '../types';

interface Props {
  decks: Deck[];
  cards: CardData[];
  onCreateDeck?: (name: string) => void;
  onEditDeck?: (id: string) => void;
  onCpuSelect?: (id: string) => void;
  onReorderDecks?: (reordered: Deck[]) => void;
  onBack: () => void;
}

interface SortableDeckCardProps {
  deck: Deck;
  cards: CardData[];
  isCpuMode: boolean;
  isSortMode: boolean;
  onClick: () => void;
}

function SortableDeckCard({ deck, cards, isCpuMode, isSortMode, onClick }: SortableDeckCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: deck.id });

  const thumbnail = deck.thumbnailCardNum ? cards.find(c => c.CardNum === deck.thumbnailCardNum) : null;

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    ...deckCardStyle,
    borderColor: isCpuMode ? '#1a7a3a' : undefined,
    cursor: isSortMode ? 'grab' : 'pointer',
    position: 'relative',
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      onClick={isSortMode ? undefined : onClick}
      {...(isSortMode ? { ...attributes, ...listeners } : {})}
    >
      {isSortMode && (
        <div style={{
          position: 'absolute', top: 6, right: 6, zIndex: 1,
          backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 4,
          padding: '2px 5px', fontSize: 12, color: '#aaa', pointerEvents: 'none',
        }}>
          ⠿
        </div>
      )}
      <div style={{ width: '100%', aspectRatio: '3/4', backgroundColor: '#1a1a2e', borderRadius: '4px', overflow: 'hidden', marginBottom: '12px' }}>
        {thumbnail ? (
          <img src={thumbnail.ImgURL} alt={thumbnail.CardName} style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            onError={e => { const img = e.target as HTMLImageElement; if (!img.src.endsWith('/ErrerCard.webp')) img.src = '/ErrerCard.webp'; }} />
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
}

export default function DeckListScreen({ decks, cards, onCreateDeck, onEditDeck, onCpuSelect, onReorderDecks, onBack }: Props) {
  const [showModal, setShowModal] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [isSortMode, setIsSortMode] = useState(false);
  const [localDecks, setLocalDecks] = useState<Deck[]>(decks);

  const isCpuMode = !!onCpuSelect;

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = localDecks.findIndex(d => d.id === active.id);
    const newIndex = localDecks.findIndex(d => d.id === over.id);
    const reordered = arrayMove(localDecks, oldIndex, newIndex);
    setLocalDecks(reordered);
    onReorderDecks?.(reordered);
  };

  const handleCreate = () => {
    const trimmed = nameInput.trim();
    if (!trimmed) return;
    onCreateDeck?.(trimmed);
    setShowModal(false);
    setNameInput('');
  };

  // 親からdecksが更新されたら同期（新規作成・削除後）
  if (decks.length !== localDecks.length || decks.some((d, i) => d.id !== localDecks[i]?.id && !localDecks.find(l => l.id === d.id))) {
    setLocalDecks(decks);
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#0a0a0f', color: '#fff', padding: '24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '32px' }}>
        <button onClick={onBack} style={backButtonStyle}>← 戻る</button>
        <h2 style={{ fontSize: '20px', color: isCpuMode ? '#1a7a3a' : '#007bff' }}>
          {isCpuMode ? 'CPU対戦 — デッキ選択' : 'デッキ一覧'}
        </h2>
        {!isCpuMode && (
          <>
            <button onClick={() => { setNameInput(''); setShowModal(true); }} style={createButtonStyle} disabled={isSortMode}>＋ 新規作成</button>
            {decks.length > 1 && (
              <button
                onClick={() => setIsSortMode(prev => !prev)}
                style={{ ...createButtonStyle, backgroundColor: isSortMode ? '#28a745' : '#555', marginLeft: 0 }}
              >
                {isSortMode ? '完了' : '並び替え'}
              </button>
            )}
          </>
        )}
      </div>

      {localDecks.length === 0 ? (
        <p style={{ color: '#555', textAlign: 'center', marginTop: '80px' }}>
          デッキがありません。新規作成してください。
        </p>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={localDecks.map(d => d.id)} strategy={rectSortingStrategy}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
              {localDecks.map(deck => (
                <SortableDeckCard
                  key={deck.id}
                  deck={deck}
                  cards={cards}
                  isCpuMode={isCpuMode}
                  isSortMode={isSortMode}
                  onClick={() => isCpuMode ? onCpuSelect?.(deck.id) : onEditDeck?.(deck.id)}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
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
  backgroundColor: 'transparent', color: '#888', fontSize: '13px', cursor: 'pointer',
};

const createButtonStyle: React.CSSProperties = {
  marginLeft: 'auto', padding: '8px 20px', borderRadius: '6px',
  border: 'none', backgroundColor: '#007bff', color: '#fff', fontSize: '14px', fontWeight: 'bold', cursor: 'pointer',
};

const deckCardStyle: React.CSSProperties = {
  backgroundColor: '#111', borderRadius: '8px', padding: '12px',
  border: '1px solid #222',
};

const cancelButtonStyle: React.CSSProperties = {
  padding: '8px 16px', borderRadius: '6px', border: '1px solid #444',
  backgroundColor: 'transparent', color: '#888', fontSize: '13px', cursor: 'pointer',
};

const confirmButtonStyle: React.CSSProperties = {
  padding: '8px 16px', borderRadius: '6px', border: 'none',
  backgroundColor: '#007bff', color: '#fff', fontSize: '13px', fontWeight: 'bold', cursor: 'pointer',
};
