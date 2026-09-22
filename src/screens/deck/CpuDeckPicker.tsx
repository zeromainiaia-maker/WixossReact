import { useMemo, useState } from 'react';
import type { CardData, Deck } from '../../types';
import { ALL_LRIG_FOLDER, ALL_LRIG_FOLDER_JA, folderThumbKey, groupDecksByFolder, pickRandomDeck, withAllLrigFolder } from '../../utils/deckFolders';
import { DECK_FORMATS, DECK_FORMAT_JA, effectiveDeckFormat, type DeckFormat } from '../../utils/deckFormat';
import { DeckFolderGrid, DeckFolderHeader } from './DeckFolderGrid';

/**
 * 🆕**CPU デッキの選択パネル**（2026-09-22・`MatchmakingScreen` の CPU デッキ選択から切り出し）。
 *
 * ■ なぜ共有部品か＝**CPU対戦と CPU観戦で同じ選び方**にする（ユーザー要望「普通の対戦と同じデッキ選択画面にしたい」）。
 *   2つ目の選択画面を書くと、片方にだけフォーマット絞り込みやランダムが入ってズレる。
 * ■ 形＝状態は `useCpuDeckPicker`（親が持つ＝「開始」ボタンや要約を親が描ける）、描画は `CpuDeckPickerBody`。
 * ⚠data-testid（`cpu-pick-mode-*` / `cpu-random-format-*` / `match-deck-*`）は実機ドライバが使う＝名前を変えない。
 *   1画面に2つ並べるときは `testIdPrefix` で区別する（既定は空＝CPU対戦と同じ名前）。
 */

export type CpuPickMode = 'pick' | 'random';

export function useCpuDeckPicker(validCpuDecks: Deck[], cardMap: Map<string, CardData>, variantNumIndex: Parameters<typeof effectiveDeckFormat>[2]) {
  const cpuFolders = useMemo(() => groupDecksByFolder(validCpuDecks, cardMap), [validCpuDecks, cardMap]);
  const [openFolder, setOpenFolder] = useState<string | null>(null);
  /** 決め方＝`pick`（デッキを選ぶ）／`random`（ルリグタイプを選んでその中からランダム）。 */
  const [mode, setMode] = useState<CpuPickMode>('pick');
  const [randomFolder, setRandomFolder] = useState<string | null>(null);
  /** ランダム選出のフォーマット絞り込み（`'all'`＝絞らない）。フォルダの選択とは**直交**する。 */
  const [randomFormat, setRandomFormat] = useState<DeckFormat | 'all'>('all');
  const [deckId, setDeckId] = useState('');

  // フォーマットで絞った CPU デッキ → その中でルリグタイプ別フォルダ＋先頭に「全員のルリグ」。
  //   🔑**絞り込みが先**＝フォルダの件数がそのまま「この条件で引ける数」になる（0 なら開始させない）。
  const randomDecks = useMemo(
    () => (randomFormat === 'all'
      ? validCpuDecks
      : validCpuDecks.filter(d => effectiveDeckFormat(d, cardMap, variantNumIndex) === randomFormat)),
    [validCpuDecks, randomFormat, cardMap, variantNumIndex],
  );
  const randomFolders = useMemo(
    () => withAllLrigFolder(groupDecksByFolder(randomDecks, cardMap), randomDecks),
    [randomDecks, cardMap],
  );
  const randomCandidates = randomFolders.find(f => f.name === randomFolder)?.decks ?? [];

  // 🔴**候補0のフォルダでは開始させない**＝引けずに空 id で走ると止まる。
  const canStart = mode === 'random' ? randomCandidates.length > 0 : !!deckId;
  /** 「開始」を押した時点で1つに決める（ランダムはここで引く＝デッキ名は見せない）。 */
  const resolve = (): Deck | undefined => (mode === 'random'
    ? pickRandomDeck(randomCandidates) ?? undefined
    : validCpuDecks.find(d => d.id === deckId));
  /** 選択の要約（ランダムは条件だけ・デッキ名は出さない）。 */
  const summary = mode === 'random'
    ? (randomFolder
      ? `🎲 ${randomFormat === 'all' ? 'すべてのフォーマット' : DECK_FORMAT_JA[randomFormat]}／${randomFolder === ALL_LRIG_FOLDER ? ALL_LRIG_FOLDER_JA : randomFolder}／候補 ${randomCandidates.length} デッキ`
      : null)
    : (validCpuDecks.find(d => d.id === deckId)?.name ?? null);

  return {
    validCpuDecks, cpuFolders, openFolder, setOpenFolder, mode, setMode,
    randomFolder, setRandomFolder, randomFormat, setRandomFormat, randomDecks, randomFolders,
    deckId, setDeckId, canStart, resolve, summary,
  };
}

export type CpuDeckPickerState = ReturnType<typeof useCpuDeckPicker>;

/** デッキ1つのタイル（サムネイル＋名前＋枚数）。 */
export function DeckTile({ deck, isSelected, color, onClick, cardMap, myUserId, testId }: {
  deck: Deck; isSelected: boolean; color: string; onClick: () => void;
  cardMap: Map<string, CardData>; myUserId: string; testId?: string;
}) {
  const thumbnail = deck.thumbnailCardNum ? cardMap.get(deck.thumbnailCardNum) : null;
  const shared = !!deck.userId && deck.userId !== myUserId;
  return (
    <div
      data-testid={testId ?? `match-deck-${deck.name}`}
      onClick={onClick}
      style={{
        cursor: 'pointer', backgroundColor: '#111', borderRadius: 8, padding: 8,
        border: `2px solid ${isSelected ? color : '#222'}`,
      }}
    >
      <div style={{ width: '100%', aspectRatio: '3/4', backgroundColor: '#1a1a2e', borderRadius: 4, overflow: 'hidden', marginBottom: 8 }}>
        {thumbnail ? (
          <img src={thumbnail.ImgURL} alt={thumbnail.CardName} style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            onError={e => { const img = e.target as HTMLImageElement; if (!img.src.endsWith('/ErrerCard.webp')) img.src = '/ErrerCard.webp'; }} />
        ) : (
          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#333', fontSize: 12 }}>NO IMAGE</div>
        )}
      </div>
      <p style={{ fontSize: 12, fontWeight: 'bold', margin: '0 0 4px', color: isSelected ? color : '#ccc', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{deck.name}</p>
      <p style={{ fontSize: 10, color: '#555', margin: 0 }}>メイン {deck.mainDeck.length}/40 &nbsp; ルリグ {deck.lrigDeck.length}/10{shared ? ' ・公開' : ''}</p>
    </div>
  );
}

/** 「デッキを選ぶ／ルリグタイプからランダム」のタブ（見出しの下に置く）。 */
export function CpuDeckPickerTabs({ picker, accent = '#28a745' }: { picker: CpuDeckPickerState; accent?: string }) {
  const modeBtn = (mode: CpuPickMode, label: string) => (
    <button data-testid={`cpu-pick-mode-${mode}`} onClick={() => picker.setMode(mode)} style={{
      flex: 1, padding: '10px', border: 'none', borderBottom: `3px solid ${picker.mode === mode ? accent : 'transparent'}`,
      backgroundColor: 'transparent', color: picker.mode === mode ? accent : '#666', fontSize: 14, fontWeight: picker.mode === mode ? 'bold' : 'normal', cursor: 'pointer',
    }}>{label}</button>
  );
  return (
    <div style={{ display: 'flex' }}>
      {modeBtn('pick', 'デッキを選ぶ')}
      {modeBtn('random', 'ルリグタイプからランダム')}
    </div>
  );
}

/** 本体（スクロール領域の中身）。 */
export function CpuDeckPickerBody({ picker, cardMap, folderThumbnails, myUserId, accent = '#28a745' }: {
  picker: CpuDeckPickerState;
  cardMap: Map<string, CardData>;
  folderThumbnails: Record<string, string>;
  myUserId: string;
  accent?: string;
}) {
  const p = picker;
  if (p.validCpuDecks.length === 0) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: '#888', textAlign: 'center', maxWidth: 300, lineHeight: 1.6 }}>
          使用可能なCPUデッキがありません。<br />
          デッキ編成の「CPUデッキ」タブで、メインデッキ40枚・センタールリグを指定したデッキを作成してください。
        </p>
      </div>
    );
  }
  const cpuOpen = p.openFolder ? p.cpuFolders.find(f => f.name === p.openFolder) : undefined;
  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
      {p.mode === 'random' ? (
        <>
          <p style={{ margin: '0 0 8px', fontSize: 12, color: '#888' }}>フォーマットとルリグタイプを選ぶと、対戦開始時にその条件のデッキからランダムで1つ使います（デッキ名は表示しません）。</p>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
            {(['all', ...DECK_FORMATS] as const).map(f => {
              const on = p.randomFormat === f;
              const label = f === 'all' ? 'すべて' : DECK_FORMAT_JA[f];
              return (
                <button key={f} data-testid={`cpu-random-format-${f}`} onClick={() => { p.setRandomFormat(f); p.setRandomFolder(null); }} style={{
                  padding: '6px 12px', borderRadius: 999, cursor: 'pointer', fontSize: 12,
                  border: `1px solid ${on ? accent : '#333'}`,
                  backgroundColor: on ? '#123d20' : 'transparent', color: on ? '#4ade80' : '#888',
                  fontWeight: on ? 'bold' : 'normal',
                }}>{label}</button>
              );
            })}
          </div>
          {p.randomDecks.length === 0 ? (
            <p style={{ color: '#888', fontSize: 13 }}>このフォーマットの CPU デッキがありません。</p>
          ) : (
            <DeckFolderGrid folders={p.randomFolders} cardMap={cardMap} accent={accent} onOpen={p.setRandomFolder} selectedName={p.randomFolder}
              thumbnailOf={name => folderThumbnails[folderThumbKey('cpu', name)]} />
          )}
        </>
      ) : !cpuOpen ? (
        <DeckFolderGrid folders={p.cpuFolders} cardMap={cardMap} accent={accent} onOpen={p.setOpenFolder}
          thumbnailOf={name => folderThumbnails[folderThumbKey('cpu', name)]}
          selectedName={p.cpuFolders.find(f => f.decks.some(d => d.id === p.deckId))?.name ?? null} />
      ) : (
        <>
          <DeckFolderHeader name={cpuOpen.name} count={cpuOpen.decks.length} accent={accent} onBack={() => p.setOpenFolder(null)} />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
            {cpuOpen.decks.map(deck => (
              <DeckTile key={deck.id} deck={deck} isSelected={p.deckId === deck.id} color={accent}
                onClick={() => p.setDeckId(deck.id)} cardMap={cardMap} myUserId={myUserId} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
