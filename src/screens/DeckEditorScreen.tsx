import { useState, useMemo } from 'react';
import type { CardData, Deck } from '../types';
import { isLrigCard } from '../types';

const MAIN_MAX = 40;
const LRIG_MAX = 10;
const LRIG_EXTRA_MAX = 2;
const COPY_MAX = 4;
const LRIG_COPY_MAX = 1;

const SPECIAL_EXTRA_CARD_NUMS = ['PR-470B', 'WX13-005B', 'WX13-006B', 'WX14-006B'];

const isExtraLrigCard = (card: CardData) =>
  card.Type === 'ピース' || SPECIAL_EXTRA_CARD_NUMS.includes(card.CardNum);

interface Props {
  deck: Deck;
  cards: CardData[];
  onUpdate: (deck: Deck) => void;
  onDelete: (id: string) => void;
  onBack: () => void;
}

const COLOR_BG: Record<string, string> = {
  '赤': '#ffcccc',
  '青': '#cce0ff',
  '緑': '#ccf5d8',
  '黒': '#e8d0ff',
  '白': '#fffacc',
  '無色': '#f0f0f0',
  '多色': '#ffddb8',
};

const getCardBg = (color: string) => COLOR_BG[color] ?? '#f5f0fb';

const LRIG_TYPE_ORDER = ['ルリグ', 'アシストルリグ', 'アーツ', 'レゾナ', 'キー', 'ピース'];

export default function DeckEditorScreen({ deck, cards, onUpdate, onDelete, onBack }: Props) {
  const [current, setCurrent] = useState<Deck>(deck);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterColor, setFilterColor] = useState('');
  const [filterLevel, setFilterLevel] = useState('');
  const [filterClass, setFilterClass] = useState('');
  const [deckTab, setDeckTab] = useState<'main' | 'lrig'>('main');
  const [screenTab, setScreenTab] = useState<'deck' | 'search'>('deck');
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState(deck.name);
  const [expandedCardNum, setExpandedCardNum] = useState<string | null>(null);
  const [showThumbnailModal, setShowThumbnailModal] = useState(false);

  const cardMap = useMemo(() => {
    const map = new Map<string, CardData>();
    cards.forEach(c => map.set(c.CardNum, c));
    return map;
  }, [cards]);

  const extraLrigCount = useMemo(() =>
    current.lrigDeck.filter(n => { const c = cardMap.get(n); return c && isExtraLrigCard(c); }).length,
    [current.lrigDeck, cardMap]);

  const regularLrigCount = current.lrigDeck.length - extraLrigCount;

  const types = useMemo(() => [...new Set(cards.map(c => c.Type).filter(Boolean))].sort(), [cards]);
  const colors = useMemo(() => [...new Set(cards.map(c => c.Color).filter(Boolean))].sort(), [cards]);
  const levels = useMemo(() => [...new Set(cards.map(c => c.Level).filter(Boolean))].sort((a, b) => Number(a) - Number(b)), [cards]);
  const classes = useMemo(() => [...new Set(cards.map(c => c.CardClass).filter(Boolean))].sort(), [cards]);

  const filteredCards = useMemo(() => cards.filter(c => {
    if (search && !c.CardName.includes(search) && !c.CardNum.includes(search)) return false;
    if (filterType && c.Type !== filterType) return false;
    if (filterColor && c.Color !== filterColor) return false;
    if (filterLevel && c.Level !== filterLevel) return false;
    if (filterClass && c.CardClass !== filterClass) return false;
    return true;
  }), [cards, search, filterType, filterColor, filterLevel, filterClass]);

  const countInMainByName = (cardName: string) =>
    current.mainDeck.filter(n => cardMap.get(n)?.CardName === cardName).length;

  const countInLrigByName = (cardName: string) =>
    current.lrigDeck.filter(n => cardMap.get(n)?.CardName === cardName).length;

  const addCard = (card: CardData) => {
    if (isLrigCard(card)) {
      if (countInLrigByName(card.CardName) >= LRIG_COPY_MAX) return;
      if (isExtraLrigCard(card)) {
        if (extraLrigCount >= LRIG_EXTRA_MAX) return;
      } else {
        if (regularLrigCount >= LRIG_MAX) return;
      }
      const updated = { ...current, lrigDeck: [...current.lrigDeck, card.CardNum] };
      setCurrent(updated);
      onUpdate(updated);
    } else {
      if (current.mainDeck.length >= MAIN_MAX) return;
      if (countInMainByName(card.CardName) >= COPY_MAX) return;
      const updated = { ...current, mainDeck: [...current.mainDeck, card.CardNum] };
      setCurrent(updated);
      onUpdate(updated);
    }
  };

  const removeCard = (cardNum: string, from: 'main' | 'lrig') => {
    const list = from === 'main' ? current.mainDeck : current.lrigDeck;
    const idx = list.lastIndexOf(cardNum);
    if (idx === -1) return;
    const next = [...list];
    next.splice(idx, 1);
    const updated = from === 'main'
      ? { ...current, mainDeck: next }
      : { ...current, lrigDeck: next };
    setCurrent(updated);
    onUpdate(updated);
  };

  const saveName = () => {
    const updated = { ...current, name: nameInput };
    setCurrent(updated);
    onUpdate(updated);
    setEditingName(false);
  };

  const deckSummary = (cardNums: string[]): [string, number][] => {
    const counts = new Map<string, number>();
    cardNums.forEach(n => counts.set(n, (counts.get(n) ?? 0) + 1));
    return [...counts.entries()];
  };

  const sortMainEntries = (entries: [string, number][]): [string, number][] =>
    [...entries].sort(([aNum], [bNum]) => {
      const a = cardMap.get(aNum);
      const b = cardMap.get(bNum);
      const aIsSpell = a?.Type === 'スペル';
      const bIsSpell = b?.Type === 'スペル';
      if (aIsSpell !== bIsSpell) return aIsSpell ? 1 : -1;
      return Number(b?.Level ?? 0) - Number(a?.Level ?? 0);
    });

  const sortLrigEntries = (entries: [string, number][]): [string, number][] =>
    [...entries].sort(([aNum], [bNum]) => {
      const a = cardMap.get(aNum);
      const b = cardMap.get(bNum);
      const ai = LRIG_TYPE_ORDER.indexOf(a?.Type ?? '');
      const bi = LRIG_TYPE_ORDER.indexOf(b?.Type ?? '');
      const aOrd = ai === -1 ? 999 : ai;
      const bOrd = bi === -1 ? 999 : bi;
      if (aOrd !== bOrd) return aOrd - bOrd;
      return Number(b?.Level ?? 0) - Number(a?.Level ?? 0);
    });

  const renderDeckRow = (cardNum: string, count: number, from: 'main' | 'lrig') => {
    const card = cardMap.get(cardNum);
    const bg = getCardBg(card?.Color ?? '');
    const hasLB = card?.LifeBurst === '1';
    const lrig = from === 'lrig';
    const nameCount = lrig ? countInLrigByName(card?.CardName ?? '') : countInMainByName(card?.CardName ?? '');
    const copyMax = lrig ? LRIG_COPY_MAX : COPY_MAX;
    const extra = lrig && card && isExtraLrigCard(card);
    const canAdd = card != null && nameCount < copyMax && (
      lrig
        ? (extra ? extraLrigCount < LRIG_EXTRA_MAX : regularLrigCount < LRIG_MAX)
        : current.mainDeck.length < MAIN_MAX
    );
    return (
      <div
        key={cardNum}
        onClick={() => setExpandedCardNum(cardNum)}
        style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 10px', borderBottom: '1px solid rgba(0,0,0,0.07)', backgroundColor: bg, borderRadius: '6px', marginBottom: '3px', cursor: 'pointer' }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '2px' }}>
            <p style={{ fontSize: '13px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#111', fontWeight: '500', margin: 0 }}>{card?.CardName ?? cardNum}</p>
            {hasLB && <span style={{ fontSize: '9px', backgroundColor: '#e05c00', color: '#fff', borderRadius: '3px', padding: '1px 4px', flexShrink: 0, fontWeight: 'bold' }}>LB</span>}
          </div>
          <p style={{ fontSize: '10px', color: '#555', margin: 0 }}>{card?.Type}{card?.Level ? ` / Lv.${card.Level}` : ''} / {card?.Color}</p>
          {card?.CardClass && <p style={{ fontSize: '10px', color: '#666', margin: 0 }}>{card.CardClass}</p>}
        </div>
        <span style={{ fontSize: '13px', color: '#5533aa', fontWeight: 'bold', minWidth: '20px', textAlign: 'center' }}>×{count}</span>
        <button
          onClick={e => { e.stopPropagation(); if (card) addCard(card); }}
          disabled={!canAdd}
          style={{ padding: '2px 8px', border: '1px solid #ccc', borderRadius: '4px', backgroundColor: canAdd ? 'rgba(119,85,221,0.15)' : 'rgba(200,200,200,0.3)', color: canAdd ? '#5533aa' : '#aaa', fontSize: '12px' }}
        >＋</button>
        <button onClick={e => { e.stopPropagation(); removeCard(cardNum, from); }} style={{ padding: '2px 8px', border: '1px solid #ccc', borderRadius: '4px', backgroundColor: 'rgba(255,255,255,0.6)', color: '#cc3333', fontSize: '12px' }}>−</button>
      </div>
    );
  };

  const expandedCard = expandedCardNum ? cardMap.get(expandedCardNum) : null;

  const mainEntries = deckSummary(current.mainDeck);
  const mainLbYes = sortMainEntries(mainEntries.filter(([num]) => cardMap.get(num)?.LifeBurst === '1'));
  const mainLbNo = sortMainEntries(mainEntries.filter(([num]) => cardMap.get(num)?.LifeBurst !== '1'));
  const mainLbYesCount = mainLbYes.reduce((s, [, c]) => s + c, 0);
  const mainLbNoCount = mainLbNo.reduce((s, [, c]) => s + c, 0);
  const sortedLrigEntries = sortLrigEntries(deckSummary(current.lrigDeck));

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: '#000000', color: '#222' }}>

      {/* ヘッダー */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 16px', borderBottom: '1px solid #e0e0e0', backgroundColor: '#ffffff', flexShrink: 0 }}>
        <button onClick={onBack} style={iconButtonStyle}>← 戻る</button>
        {editingName ? (
          <>
            <input value={nameInput} onChange={e => setNameInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && saveName()} style={{ ...inputStyle, width: '200px' }} autoFocus />
            <button onClick={saveName} style={smallButtonStyle}>保存</button>
          </>
        ) : (
          <h2 onClick={() => setEditingName(true)} style={{ fontSize: '16px', cursor: 'pointer', borderBottom: '1px dashed #999', margin: 0, color: '#333' }}>{current.name}</h2>
        )}
        <button onClick={() => setShowThumbnailModal(true)} style={{ ...iconButtonStyle, marginLeft: 'auto' }}>🖼 サムネイル</button>
        <button onClick={() => { if (confirm('このデッキを削除しますか？')) onDelete(current.id); }} style={{ ...iconButtonStyle, color: '#cc2222' }}>削除</button>
      </div>

      {/* スクリーンタブ（カード追加 → デッキ内容 の順） */}
      <div style={{ display: 'flex', borderBottom: '1px solid #e9e9e9', flexShrink: 0, backgroundColor: '#ecebeb' }}>
        <button onClick={() => setScreenTab('search')} style={screenTabStyle(screenTab === 'search')}>
          カード追加
        </button>
        <button onClick={() => setScreenTab('deck')} style={screenTabStyle(screenTab === 'deck')}>
          デッキ内容 ({current.mainDeck.length + current.lrigDeck.length})
        </button>
      </div>

      {/* デッキ内容タブ */}
      {screenTab === 'deck' && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ display: 'flex', borderBottom: '1px solid #c8bce8', flexShrink: 0, backgroundColor: '#ede8f5' }}>
            {(['main', 'lrig'] as const).map(tab => (
              <button key={tab} onClick={() => setDeckTab(tab)} style={{
                flex: 1, padding: '10px', border: 'none',
                backgroundColor: deckTab === tab ? '#d5c8f0' : 'transparent',
                color: deckTab === tab ? '#5533aa' : '#888',
                fontSize: '13px', fontWeight: deckTab === tab ? 'bold' : 'normal',
              }}>
                {tab === 'main' ? `メイン ${current.mainDeck.length}/${MAIN_MAX}` : `ルリグ ${regularLrigCount}/${LRIG_MAX} ＋${extraLrigCount}/${LRIG_EXTRA_MAX}`}
              </button>
            ))}
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '8px' }}>
            {deckTab === 'main' ? (
              <>
                <div style={sectionHeaderStyle('#ddeeff', '#1a3a6a')}>LB有 ({mainLbYesCount}/20)</div>
                {mainLbYes.map(([num, count]) => renderDeckRow(num, count, 'main'))}
                <div style={{ ...sectionHeaderStyle('#eeeeee', '#444444'), marginTop: '6px' }}>LB無 ({mainLbNoCount}/20)</div>
                {mainLbNo.map(([num, count]) => renderDeckRow(num, count, 'main'))}
              </>
            ) : (
              sortedLrigEntries.map(([num, count]) => renderDeckRow(num, count, 'lrig'))
            )}
          </div>
        </div>
      )}

      {/* カード追加タブ */}
      {screenTab === 'search' && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ padding: '10px 12px', borderBottom: '1px solid #c8bce8', display: 'flex', gap: '8px', flexWrap: 'wrap', flexShrink: 0, backgroundColor: '#ede8f5' }}>
            <input placeholder="カード名・番号で検索" value={search} onChange={e => setSearch(e.target.value)} style={{ ...inputStyle, flex: 1, minWidth: '150px' }} />
            <select value={filterType} onChange={e => setFilterType(e.target.value)} style={selectStyle}>
              <option value="">タイプ：すべて</option>
              {types.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <select value={filterColor} onChange={e => setFilterColor(e.target.value)} style={selectStyle}>
              <option value="">色：すべて</option>
              {colors.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <select value={filterLevel} onChange={e => setFilterLevel(e.target.value)} style={selectStyle}>
              <option value="">レベル：すべて</option>
              {levels.map(l => <option key={l} value={l}>Lv.{l}</option>)}
            </select>
            <select value={filterClass} onChange={e => setFilterClass(e.target.value)} style={selectStyle}>
              <option value="">クラス：すべて</option>
              {classes.map(cl => <option key={cl} value={cl}>{cl}</option>)}
            </select>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '8px 12px' }}>
            {filteredCards.slice(0, 200).map(card => {
              const lrig = isLrigCard(card);
              const nameCount = lrig ? countInLrigByName(card.CardName) : countInMainByName(card.CardName);
              const copyMax = lrig ? LRIG_COPY_MAX : COPY_MAX;
              const extra = lrig && isExtraLrigCard(card);
              const canAdd = nameCount < copyMax && (
                lrig
                  ? (extra ? extraLrigCount < LRIG_EXTRA_MAX : regularLrigCount < LRIG_MAX)
                  : current.mainDeck.length < MAIN_MAX
              );
              const bg = getCardBg(card.Color);
              const hasLB = card.LifeBurst === '1';
              return (
                <div
                  key={card.CardNum}
                  onClick={() => setExpandedCardNum(card.CardNum)}
                  style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 10px', borderBottom: '1px solid rgba(0,0,0,0.07)', cursor: 'pointer', backgroundColor: bg, borderRadius: '6px', marginBottom: '3px' }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '2px' }}>
                      <p style={{ fontSize: '13px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#111', fontWeight: '500', margin: 0 }}>{card.CardName}</p>
                      {hasLB && <span style={{ fontSize: '9px', backgroundColor: '#e05c00', color: '#fff', borderRadius: '3px', padding: '1px 4px', flexShrink: 0, fontWeight: 'bold' }}>LB</span>}
                    </div>
                    <p style={{ fontSize: '10px', color: '#555', margin: 0 }}>{card.CardNum} / {card.Type}{card.Level ? ` / Lv.${card.Level}` : ''} / {card.Color}</p>
                    {card.CardClass && <p style={{ fontSize: '10px', color: '#666', margin: 0 }}>{card.CardClass}</p>}
                  </div>
                  {nameCount > 0 && <span style={{ fontSize: '12px', color: '#5533aa', minWidth: '24px', textAlign: 'center' }}>×{nameCount}</span>}
                  <button
                    onClick={e => { e.stopPropagation(); addCard(card); }}
                    disabled={!canAdd}
                    style={{ padding: '6px 14px', borderRadius: '4px', border: 'none', fontSize: '12px', backgroundColor: canAdd ? '#7755dd' : '#ddd', color: canAdd ? '#fff' : '#aaa', flexShrink: 0 }}
                  >＋</button>
                </div>
              );
            })}
            {filteredCards.length > 200 && (
              <p style={{ textAlign: 'center', color: '#888', fontSize: '12px', padding: '12px' }}>
                検索を絞り込んでください（{filteredCards.length}件中200件表示）
              </p>
            )}
          </div>
        </div>
      )}

      {/* サムネイル選択モーダル */}
      {showThumbnailModal && (() => {
        const allNums = [...new Set([...current.mainDeck, ...current.lrigDeck])];
        const deckCards = allNums.map(n => cardMap.get(n)).filter((c): c is CardData => !!c);
        return (
          <div
            onClick={() => setShowThumbnailModal(false)}
            style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300 }}
          >
            <div onClick={e => e.stopPropagation()} style={{ backgroundColor: '#1a1a2e', borderRadius: '12px', padding: '20px', width: 'min(90vw, 480px)', maxHeight: '80vh', display: 'flex', flexDirection: 'column', border: '1px solid #444' }}>
              <div style={{ display: 'flex', alignItems: 'center', marginBottom: '14px' }}>
                <h3 style={{ color: '#fff', fontSize: '15px', margin: 0 }}>サムネイルを選択</h3>
                <button onClick={() => setShowThumbnailModal(false)} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: '#888', fontSize: '20px', cursor: 'pointer', lineHeight: 1 }}>×</button>
              </div>
              {deckCards.length === 0 ? (
                <p style={{ color: '#666', textAlign: 'center', padding: '24px' }}>デッキにカードがありません</p>
              ) : (
                <div style={{ overflowY: 'auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(80px, 1fr))', gap: '8px' }}>
                  {deckCards.map(card => {
                    const isSelected = current.thumbnailCardNum === card.CardNum;
                    return (
                      <div
                        key={card.CardNum}
                        onClick={() => {
                          const updated = { ...current, thumbnailCardNum: card.CardNum };
                          setCurrent(updated);
                          onUpdate(updated);
                          setShowThumbnailModal(false);
                        }}
                        style={{ cursor: 'pointer', borderRadius: '6px', overflow: 'hidden', border: isSelected ? '2px solid #7755dd' : '2px solid transparent', position: 'relative' }}
                      >
                        <img
                          src={card.ImgURL}
                          alt={card.CardName}
                          style={{ width: '100%', aspectRatio: '3/4', objectFit: 'cover', display: 'block' }}
                          onError={e => { (e.target as HTMLImageElement).style.opacity = '0.3'; }}
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
      })()}

      {/* カード画像拡大モーダル */}
      {expandedCardNum && expandedCard && (() => {
        const card = expandedCard;
        const lrig = isLrigCard(card);
        const nameCount = lrig ? countInLrigByName(card.CardName) : countInMainByName(card.CardName);
        const copyMax = lrig ? LRIG_COPY_MAX : COPY_MAX;
        const extra = lrig && isExtraLrigCard(card);
        const canAdd = nameCount < copyMax && (
          lrig
            ? (extra ? extraLrigCount < LRIG_EXTRA_MAX : regularLrigCount < LRIG_MAX)
            : current.mainDeck.length < MAIN_MAX
        );
        const hasLB = card.LifeBurst === '1';
        return (
          <div
            onClick={() => setExpandedCardNum(null)}
            style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.88)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }}
          >
            <div onClick={e => e.stopPropagation()} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', padding: '20px', maxWidth: '90vw' }}>
              <img
                src={card.ImgURL}
                alt={card.CardName}
                style={{ maxWidth: '80vw', maxHeight: '65vh', objectFit: 'contain', borderRadius: '8px' }}
                onError={e => { (e.target as HTMLImageElement).style.opacity = '0.3'; }}
              />
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <p style={{ fontSize: '14px', fontWeight: 'bold', textAlign: 'center', color: '#fff', margin: 0 }}>{card.CardName}</p>
                {hasLB && <span style={{ fontSize: '10px', backgroundColor: '#e05c00', color: '#fff', borderRadius: '4px', padding: '2px 6px', fontWeight: 'bold' }}>LB</span>}
              </div>
              <p style={{ fontSize: '11px', color: '#aaa', textAlign: 'center', margin: 0 }}>{card.CardNum} / {card.Type} / {card.Color}{card.Level ? ` / Lv.${card.Level}` : ''}</p>
              {card.CardClass && <p style={{ fontSize: '11px', color: '#888', textAlign: 'center', margin: 0 }}>{card.CardClass}</p>}
              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  onClick={() => addCard(card)}
                  disabled={!canAdd}
                  style={{ padding: '8px 22px', borderRadius: '6px', border: 'none', fontSize: '13px', backgroundColor: canAdd ? '#7755dd' : '#333', color: canAdd ? '#fff' : '#555' }}
                >
                  ＋ 追加 ({nameCount}/{copyMax})
                </button>
                <button
                  onClick={() => setExpandedCardNum(null)}
                  style={{ padding: '8px 22px', borderRadius: '6px', border: '1px solid #666', backgroundColor: 'transparent', color: '#ccc', fontSize: '13px' }}
                >
                  閉じる
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

const sectionHeaderStyle = (bg: string, color: string): React.CSSProperties => ({
  padding: '4px 10px',
  backgroundColor: bg,
  color,
  fontSize: '11px',
  fontWeight: 'bold',
  borderRadius: '4px',
  marginBottom: '4px',
});

const screenTabStyle = (active: boolean): React.CSSProperties => ({
  flex: 1, padding: '12px', border: 'none',
  backgroundColor: active ? '#d5c8f0' : 'transparent',
  color: active ? '#5533aa' : '#888',
  fontSize: '14px', fontWeight: active ? 'bold' : 'normal',
});

const inputStyle: React.CSSProperties = {
  padding: '8px 10px', borderRadius: '6px', border: '1px solid #c8bce8',
  backgroundColor: '#fff', color: '#333', fontSize: '13px',
};
const selectStyle: React.CSSProperties = {
  padding: '8px 10px', borderRadius: '6px', border: '1px solid #c8bce8',
  backgroundColor: '#fff', color: '#333', fontSize: '13px',
};
const iconButtonStyle: React.CSSProperties = {
  padding: '6px 12px', borderRadius: '6px', border: '1px solid #c8bce8',
  backgroundColor: 'transparent', color: '#555', fontSize: '13px',
};
const smallButtonStyle: React.CSSProperties = {
  padding: '6px 12px', borderRadius: '6px', border: 'none',
  backgroundColor: '#7755dd', color: '#fff', fontSize: '13px',
};
