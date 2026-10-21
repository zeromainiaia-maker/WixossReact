import type { CardData, Deck } from '../../types';
import { ALL_LRIG_FOLDER, ALL_LRIG_FOLDER_JA, folderFaceCard, formatFolderKey, type DeckFolder, type DeckFormatSection } from '../../utils/deckFolders';
import { DECK_FORMAT_JA } from '../../utils/deckFormat';

/**
 * センタールリグのルリグタイプ別フォルダの一覧（デッキ一覧・マッチングで共用）。
 * フォルダの中身の描画（並べ替え・選択）は呼び出し側が持つ＝ここはフォルダを並べて開くだけ。
 */
export function DeckFolderGrid({ folders, cardMap, accent, onOpen, extra, selectedName, thumbnailOf }: {
  folders: DeckFolder<Deck>[];
  cardMap: Map<string, CardData>;
  accent: string;
  /** フォルダに設定したサムネイルのカード番号（無ければ先頭デッキのセンタールリグ）。 */
  thumbnailOf?: (folderName: string) => string | null | undefined;
  onOpen: (name: string) => void;
  /** 選択中として枠を強調するフォルダ（CPU のランダムモード）。 */
  selectedName?: string | null;
  /** フォルダごとの追加ボタン（例：CPU のランダム選択）。 */
  extra?: (folder: DeckFolder<Deck>) => React.ReactNode;
}) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 12 }}>
      {folders.map(folder => {
        // 🆕「全員のルリグ」は擬似フォルダ＝特定のルリグの絵を出すと誤解を招くのでサイコロのままにする。
        const isAll = folder.name === ALL_LRIG_FOLDER;
        const face = isAll ? undefined : folderFaceCard(folder, cardMap, thumbnailOf?.(folder.name));
        return (
          <div key={folder.name} style={{ backgroundColor: '#111', borderRadius: 8, border: selectedName === folder.name ? `2px solid ${accent}` : '1px solid #222', padding: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <button
              data-testid={`deck-folder-${folder.name}`}
              onClick={() => onOpen(folder.name)}
              style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: '#ccc', textAlign: 'left' }}
            >
              <div style={{ width: '100%', aspectRatio: '4/3', backgroundColor: '#1a1a2e', borderRadius: 4, overflow: 'hidden', marginBottom: 6, position: 'relative' }}>
                {face ? (
                  <img src={face.ImgURL} alt={face.CardName} style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top', opacity: 0.85 }}
                    onError={e => { const img = e.target as HTMLImageElement; if (!img.src.endsWith('/ErrerCard.webp')) img.src = '/ErrerCard.webp'; }} />
                ) : (
                  <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: isAll ? accent : '#444', fontSize: 34 }}>{isAll ? '🎲' : '📁'}</div>
                )}
              </div>
              <p style={{ margin: 0, fontSize: 14, fontWeight: 'bold', color: accent, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{isAll ? `🎲 ${ALL_LRIG_FOLDER_JA}` : `📁 ${folder.name}`}</p>
              <p style={{ margin: '2px 0 0', fontSize: 11, color: '#666' }}>{folder.decks.length} デッキ</p>
            </button>
            {extra?.(folder)}
          </div>
        );
      })}
    </div>
  );
}

/** フォルダを開いているときの見出し（フォルダ一覧へ戻る）。 */
export function DeckFolderHeader({ name, count, accent, onBack, onEditThumbnail }: {
  name: string; count: number; accent: string; onBack: () => void;
  /** 指定するとフォルダのサムネイル設定ボタンを出す（自分のフォルダだけ＝デッキ一覧）。 */
  onEditThumbnail?: () => void;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
      <button data-testid="folder-back" onClick={onBack} style={{
        padding: '6px 12px', borderRadius: 6, border: '1px solid #333', backgroundColor: 'transparent', color: '#888', fontSize: 12, cursor: 'pointer',
      }}>← フォルダ一覧</button>
      <span style={{ color: accent, fontWeight: 'bold', fontSize: 15 }}>📁 {name}</span>
      <span style={{ color: '#666', fontSize: 12 }}>{count} デッキ</span>
      {onEditThumbnail && (
        <button data-testid="folder-thumbnail-edit" onClick={onEditThumbnail} style={{
          marginLeft: 'auto', padding: '6px 12px', borderRadius: 6, border: '1px solid #444', backgroundColor: 'transparent', color: '#ccc', fontSize: 12, cursor: 'pointer',
        }}>🖼 サムネイル設定</button>
      )}
    </div>
  );
}

/**
 * 🆕**フォーマットごとの枠**（2026-10-21）＝見出し（ディーバ／レガシー／オールスター）＋その中のフォルダ一覧。
 * `onOpen` には `formatFolderKey(format, name)` を渡す（同じルリグタイプが別の枠にも出るため）。
 * ⚠フォルダの data-testid（`deck-folder-<名前>`）は変えない＝実機ドライバはフォルダを順に開いて探す。
 */
export function DeckFormatSections({ sections, cardMap, accent, onOpen, selectedKey, thumbnailOf }: {
  sections: DeckFormatSection<Deck>[];
  cardMap: Map<string, CardData>;
  accent: string;
  onOpen: (key: string) => void;
  selectedKey?: string | null;
  thumbnailOf?: (folderName: string) => string | null | undefined;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {sections.map(s => (
        <section key={s.format} data-testid={`deck-format-section-${s.format}`}>
          <h3 style={{ margin: '0 0 8px', fontSize: 14, color: accent, borderBottom: '1px solid #222', paddingBottom: 4 }}>
            {DECK_FORMAT_JA[s.format]}<span style={{ marginLeft: 8, fontSize: 11, color: '#666', fontWeight: 'normal' }}>{s.count} デッキ</span>
          </h3>
          <DeckFolderGrid folders={s.folders} cardMap={cardMap} accent={accent} thumbnailOf={thumbnailOf}
            onOpen={name => onOpen(formatFolderKey(s.format, name))}
            selectedName={s.folders.find(f => formatFolderKey(s.format, f.name) === selectedKey)?.name ?? null} />
        </section>
      ))}
    </div>
  );
}
