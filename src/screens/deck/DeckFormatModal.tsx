import type { CardData, Deck } from '../../types';
import {
  DECK_FORMATS, DECK_FORMAT_JA, detectDeckFormat, effectiveDeckFormat, outOfFormatCardNums,
  type DeckFormat,
} from '../../utils/deckFormat';

interface Props {
  deck: Deck;
  cardMap: Map<string, CardData>;
  variantNumIndex: Map<string, string[]>;
  /** `undefined` を渡すと「自動（中身から判定）」に戻す。 */
  onChange: (format: DeckFormat | undefined) => void;
  onClose: () => void;
}

const DESC: Record<DeckFormat, string> = {
  diva: 'WXDi / PR-Di / SPDi と WX24 以降',
  legacy: 'ディーバ以外のすべて',
  allstar: '制限なし（すべてのカード）',
};

/**
 * 🆕デッキフォーマット（カードプール）の設定（2026-09-20 ユーザー決定・`utils/deckFormat.ts`）。
 * 🔑**「自動」は明示設定を消すだけ**＝DB は `null` に戻り、読み側が中身から推定する。
 */
export function DeckFormatModal({ deck, cardMap, variantNumIndex, onChange, onClose }: Props) {
  const detected = detectDeckFormat([...deck.lrigDeck, ...deck.mainDeck], cardMap, variantNumIndex);
  const effective = effectiveDeckFormat(deck, cardMap, variantNumIndex);
  const outOfFormat = outOfFormatCardNums(deck, cardMap, variantNumIndex);
  const outNames = [...new Set(outOfFormat.map(n => cardMap.get(n)?.CardName ?? n))];

  const tile = (value: DeckFormat | undefined, label: string, desc: string) => {
    const selected = deck.format === value;
    return (
      <button
        key={label}
        data-testid={`deck-format-${value ?? 'auto'}`}
        onClick={() => { onChange(value); }}
        style={{
          padding: '10px 12px', borderRadius: 8, textAlign: 'left', cursor: 'pointer',
          border: `2px solid ${selected ? '#7755dd' : '#444'}`,
          backgroundColor: selected ? '#2a2145' : '#26263a', color: '#fff',
        }}
      >
        <div style={{ fontSize: 14, fontWeight: 'bold' }}>{selected ? '✓ ' : ''}{label}</div>
        <div style={{ fontSize: 11, color: '#aaa', marginTop: 2 }}>{desc}</div>
      </button>
    );
  };

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 320 }}>
      <div onClick={e => e.stopPropagation()} style={{ backgroundColor: '#1a1a2e', borderRadius: 12, padding: 20, width: 'min(90vw, 420px)', maxHeight: '80vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10, border: '1px solid #444' }}>
        <h3 style={{ color: '#fff', fontSize: 15, margin: 0 }}>デッキフォーマット</h3>
        <p style={{ color: '#aaa', fontSize: 11, margin: 0, lineHeight: 1.6 }}>
          使えるカードプールを決めます。設定すると、フォーマット外のカードはデッキに追加できなくなります。
        </p>
        {tile(undefined, `自動（いまの中身＝${DECK_FORMAT_JA[detected]}）`, '設定しない。デッキの中身から毎回判定します')}
        {DECK_FORMATS.map(f => tile(f, DECK_FORMAT_JA[f], DESC[f]))}
        <div style={{ borderTop: '1px solid #333', paddingTop: 10, fontSize: 12, color: '#ccc' }}>
          いまの判定：<b style={{ color: '#a98bff' }}>{DECK_FORMAT_JA[effective]}</b>
          {deck.format === undefined && <span style={{ color: '#888' }}>（自動）</span>}
        </div>
        {outNames.length > 0 && (
          <div data-testid="deck-format-violations" style={{ backgroundColor: '#3a2020', border: '1px solid #7a3a3a', borderRadius: 8, padding: 10, fontSize: 12, color: '#ffbbbb' }}>
            ⚠ フォーマット外のカードが <b>{outOfFormat.length}枚</b> 入っています（{outNames.length}種）。
            <div style={{ color: '#ddaaaa', fontSize: 11, marginTop: 4, lineHeight: 1.6 }}>{outNames.join(' / ')}</div>
            <div style={{ color: '#cc9999', fontSize: 11, marginTop: 4 }}>「デッキ内容」タブから取り除いてください。</div>
          </div>
        )}
        <button onClick={onClose} style={{ padding: 10, borderRadius: 8, border: 'none', backgroundColor: '#3a3a5a', color: '#fff', fontSize: 14, cursor: 'pointer' }}>閉じる</button>
      </div>
    </div>
  );
}
