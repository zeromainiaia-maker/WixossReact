import { useMemo, useState } from 'react';
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
import { applyFolderReorder, deckKindOf, folderThumbKey, folderThumbnailCandidates, groupDecksByFolder, DECK_KIND_JA, type DeckKind } from '../utils/deckFolders';
import { CardThumbnailPicker } from './deck/CardThumbnailPicker';
import { DeckFolderGrid, DeckFolderHeader } from './deck/DeckFolderGrid';

interface Props {
  /** 自分のデッキ全部（`player` と `cpu` の両方）。表示はタブの種類で絞る。 */
  decks: Deck[];
  cards: CardData[];
  /** 🆕2026-09-17＝いま開いているタブ（自分のデッキ／CPUデッキ）とフォルダ。編集画面から戻っても保つので親が持つ。 */
  kind: DeckKind;
  openFolder: string | null;
  onChangeView: (kind: DeckKind, openFolder: string | null) => void;
  onCreateDeck?: (name: string, kind: DeckKind) => void;
  onEditDeck?: (id: string) => void;
  onReorderDecks?: (reordered: Deck[]) => void;
  /** 🆕フォルダのサムネイル（キー＝`folderThumbKey(kind, name)` → カード番号）と、その保存。 */
  folderThumbnails: Record<string, string>;
  onSetFolderThumbnail: (kind: DeckKind, folderName: string, cardNum: string) => void;
  onBack: () => void;
}

interface SortableDeckCardProps {
  deck: Deck;
  cards: CardData[];
  isCpuKind: boolean;
  isSortMode: boolean;
  onClick: () => void;
}

function SortableDeckCard({ deck, cards, isCpuKind, isSortMode, onClick }: SortableDeckCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: deck.id });

  const thumbnail = deck.thumbnailCardNum ? cards.find(c => c.CardNum === deck.thumbnailCardNum) : null;

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    ...deckCardStyle,
    borderColor: isCpuKind ? '#1a7a3a' : undefined,
    cursor: isSortMode ? 'grab' : 'pointer',
    position: 'relative',
  };

  return (
    <div
      ref={setNodeRef}
      data-testid={`deck-card-${deck.name}`}
      style={style}
      onClick={isSortMode ? undefined : onClick}
      {...(isSortMode ? { ...attributes, ...listeners } : {})}
    >
      {isSortMode && (
        <div style={{
          position: 'absolute', top: 6, right: 6, zIndex: 1,
          backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 6,
          padding: '4px 8px', fontSize: 20, color: '#ccc', pointerEvents: 'none',
          lineHeight: 1,
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

export default function DeckListScreen({ decks, cards, kind, openFolder, onChangeView, onCreateDeck, onEditDeck, onReorderDecks, folderThumbnails, onSetFolderThumbnail, onBack }: Props) {
  const [showFolderThumb, setShowFolderThumb] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [isSortMode, setIsSortMode] = useState(false);
  const [localDecks, setLocalDecks] = useState<Deck[]>(decks);

  const isCpuKind = kind === 'cpu';
  const accent = isCpuKind ? '#28a745' : '#007bff';
  const cardMap = useMemo(() => new Map(cards.map(c => [c.CardNum, c] as const)), [cards]);
  // 🆕2026-09-17＝タブの種類で絞り、センタールリグのルリグタイプ別フォルダにまとめる（`utils/deckFolders.ts`）。
  const folders = useMemo(
    () => groupDecksByFolder(localDecks.filter(d => deckKindOf(d) === kind), cardMap),
    [localDecks, kind, cardMap],
  );
  const current = openFolder ? folders.find(f => f.name === openFolder) ?? null : null;

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  // フォルダ内の並べ替え＝他のフォルダ・他の種類の相対順は動かさずに全体の並びへ書き戻す。
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!current || !over || active.id === over.id) return;
    const oldIndex = current.decks.findIndex(d => d.id === active.id);
    const newIndex = current.decks.findIndex(d => d.id === over.id);
    const reordered = applyFolderReorder(localDecks, arrayMove(current.decks, oldIndex, newIndex));
    setLocalDecks(reordered);
    onReorderDecks?.(reordered);
  };

  const handleCreate = () => {
    const trimmed = nameInput.trim();
    if (!trimmed) return;
    onCreateDeck?.(trimmed, kind);
    setShowModal(false);
    setNameInput('');
  };

  // 親からdecksが更新されたら同期（新規作成・削除後）
  // ⚠**レンダー中に調整する形**にしてある（`useEffect` + `setLocalDecks` は
  //   eslint `react-hooks/set-state-in-effect` の error＝カスケードレンダーになる）。
  //   同期するのは**集合が変わったときだけ**＝並べ替えだけの親更新でローカル順序を潰さない、という
  //   元の意図はそのまま（`added || removed` の判定は元の実装と同一）。
  const [syncedDecks, setSyncedDecks] = useState<Deck[]>(decks);
  if (syncedDecks !== decks) {
    setSyncedDecks(decks);
    const localIds = new Set(localDecks.map(d => d.id));
    const parentIds = new Set(decks.map(d => d.id));
    const added = decks.some(d => !localIds.has(d.id));
    const removed = localDecks.some(d => !parentIds.has(d.id));
    if (added || removed) setLocalDecks(decks);
  }

  const tabStyle = (active: boolean, color: string): React.CSSProperties => ({
    flex: 1, padding: '10px', border: 'none', borderBottom: `3px solid ${active ? color : 'transparent'}`,
    backgroundColor: 'transparent', color: active ? color : '#666', fontSize: 14, fontWeight: active ? 'bold' : 'normal', cursor: 'pointer',
  });

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#0a0a0f', color: '#fff', padding: '24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '16px' }}>
        <button onClick={onBack} style={backButtonStyle}>← 戻る</button>
        <h2 style={{ fontSize: '20px', color: accent }}>デッキ一覧</h2>
        <button onClick={() => { setNameInput(''); setShowModal(true); }} style={{ ...createButtonStyle, backgroundColor: accent }} disabled={isSortMode}>
          ＋ {isCpuKind ? 'CPUデッキを作成' : '新規作成'}
        </button>
        {current && current.decks.length > 1 && (
          <button
            onClick={() => setIsSortMode(prev => !prev)}
            style={{ ...createButtonStyle, backgroundColor: isSortMode ? '#28a745' : '#555', marginLeft: 0 }}
          >
            {isSortMode ? '完了' : '並び替え'}
          </button>
        )}
      </div>

      <div style={{ display: 'flex', borderBottom: '1px solid #222', marginBottom: 16 }}>
        {(['player', 'cpu'] as const).map(k => (
          <button key={k} data-testid={`deck-kind-${k}`} disabled={isSortMode}
            onClick={() => onChangeView(k, null)}
            style={tabStyle(kind === k, k === 'cpu' ? '#28a745' : '#007bff')}>
            {DECK_KIND_JA[k]}（{localDecks.filter(d => deckKindOf(d) === k).length}）
          </button>
        ))}
      </div>

      {folders.length === 0 ? (
        <p style={{ color: '#555', textAlign: 'center', marginTop: '80px' }}>
          {isCpuKind ? 'CPUデッキがありません。「＋ CPUデッキを作成」から作ってください。' : 'デッキがありません。新規作成してください。'}
        </p>
      ) : !current ? (
        <DeckFolderGrid folders={folders} cardMap={cardMap} accent={accent} onOpen={name => onChangeView(kind, name)}
          thumbnailOf={name => folderThumbnails[folderThumbKey(kind, name)]} />
      ) : (
        <>
          <DeckFolderHeader name={current.name} count={current.decks.length} accent={accent}
            onBack={() => { setIsSortMode(false); onChangeView(kind, null); }}
            onEditThumbnail={() => setShowFolderThumb(true)} />
          {showFolderThumb && (
            <CardThumbnailPicker
              title={`フォルダ「${current.name}」のサムネイルを選択`}
              cards={folderThumbnailCandidates(current, cardMap)}
              selectedCardNum={folderThumbnails[folderThumbKey(kind, current.name)]}
              testIdPrefix="folder-thumb-"
              onSelect={cardNum => { onSetFolderThumbnail(kind, current.name, cardNum); setShowFolderThumb(false); }}
              onClose={() => setShowFolderThumb(false)}
            />
          )}
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={current.decks.map(d => d.id)} strategy={rectSortingStrategy}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
                {current.decks.map(deck => (
                  <SortableDeckCard
                    key={deck.id}
                    deck={deck}
                    cards={cards}
                    isCpuKind={isCpuKind}
                    isSortMode={isSortMode}
                    onClick={() => onEditDeck?.(deck.id)}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        </>
      )}

      {showModal && (
        <div
          onClick={() => setShowModal(false)}
          style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}
        >
          <div onClick={e => e.stopPropagation()} style={{ backgroundColor: '#1a1a2e', borderRadius: '12px', padding: '24px', width: '300px', border: '1px solid #333' }}>
            <h3 style={{ marginBottom: '16px', fontSize: '16px' }}>{isCpuKind ? 'CPUデッキ名を入力' : 'デッキ名を入力'}</h3>
            <input
              value={nameInput}
              onChange={e => setNameInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleCreate()}
              placeholder="デッキ名"
              autoFocus
              style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #444', backgroundColor: '#0a0a0f', color: '#fff', fontSize: '14px', boxSizing: 'border-box' }}
            />
            <p style={{ fontSize: 11, color: '#888', margin: '8px 0 0' }}>フォルダはデッキ編成の「ルリグ」タブで指定したセンタールリグのタイプで自動に決まります。</p>
            <div style={{ display: 'flex', gap: '8px', marginTop: '16px', justifyContent: 'flex-end' }}>
              <button onClick={() => setShowModal(false)} style={cancelButtonStyle}>キャンセル</button>
              <button onClick={handleCreate} disabled={!nameInput.trim()} style={{ ...confirmButtonStyle, backgroundColor: accent, opacity: nameInput.trim() ? 1 : 0.4 }}>作成</button>
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
