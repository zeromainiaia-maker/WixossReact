import { useState, useEffect } from 'react';
import Papa from 'papaparse';
import { supabase } from './supabaseClient';
import type { User } from '@supabase/supabase-js';
import type { ViewMode, CardData, Deck } from './types';
import type { CardEffect } from './types/effects';
import LoginScreen from './screens/LoginScreen';
import StartScreen from './screens/StartScreen';
import DeckListScreen from './screens/DeckListScreen';
import DeckEditorScreen from './screens/DeckEditorScreen';
import MatchmakingScreen from './screens/MatchmakingScreen';
import BattleScreen from './screens/BattleScreen';
import CpuBattleScreen from './screens/CpuBattleScreen';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('LOGIN');
  const [loading, setLoading] = useState(true);
  const [cards, setCards] = useState<CardData[]>([]);       // デッキ編集用（トークン除外）
  const [allCards, setAllCards] = useState<CardData[]>([]); // バトル用（トークン含む）
  const [decks, setDecks] = useState<Deck[]>([]);
  const [selectedDeckId, setSelectedDeckId] = useState<string | null>(null);
  const [battleRoomId, setBattleRoomId] = useState<string | null>(null);
  const [battleDeckId, setBattleDeckId] = useState<string | null>(null);
  const [cpuBattleDeckId, setCpuBattleDeckId] = useState<string | null>(null);
  const [cpuBattleMode, setCpuBattleMode] = useState(false);

  // 認証状態の監視 + 対戦ルームへの再入場
  useEffect(() => {
    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const u = session?.user ?? null;
      setUser(u);

      if (u) {
        // PLAYING 状態のルームが残っていれば対戦画面へ直接復帰
        const { data } = await supabase
          .from('rooms')
          .select('id, host_id, guest_id, host_deck_id, guest_deck_id')
          .eq('status', 'PLAYING')
          .or(`host_id.eq.${u.id},guest_id.eq.${u.id}`)
          .limit(1);

        const room = (data as { id: string; host_id: string; guest_id: string | null; host_deck_id: string | null; guest_deck_id: string | null }[] | null)?.[0];
        if (room) {
          const deckId = (room.host_id === u.id ? room.host_deck_id : room.guest_deck_id) ?? null;
          if (deckId) {
            setBattleRoomId(room.id);
            setBattleDeckId(deckId);
            setViewMode('BATTLE');
            setLoading(false);
            return;
          }
        }
        setViewMode('START');
      } else {
        setViewMode('LOGIN');
      }
      setLoading(false);
    };

    init();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      const u = session?.user ?? null;
      setUser(u);
      if (!u) {
        setViewMode('LOGIN');
      } else if (event === 'SIGNED_IN') {
        // 新規ログイン時はスタート画面へ（リロード復元は init() が担当）
        setViewMode('START');
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // CSV と事前生成 effects.json を並行 fetch してカードデータを構築
  useEffect(() => {
    const sheetFetches = Array.from({ length: 10 }, (_, i) =>
      fetch(`/data/CardData_Sheet${i + 1}.csv`).then(r => r.ok ? r.text() : null)
    );
    const tkFetch = fetch('/data/CardData_TK.csv').then(r => r.ok ? r.text() : null);
    Promise.all([
      Promise.all(sheetFetches),
      tkFetch,
      fetch('/data/effects.json').then(r => r.json() as Promise<Record<string, CardEffect[]>>),
    ])
      .then(([csvResults, tkCsv, effectsJson]) => {
        const parseRows = (csv: string) =>
          Papa.parse<Record<string, string>>(csv, { header: true, skipEmptyLines: true }).data;
        const storageBase = import.meta.env.VITE_CARD_IMAGE_BASE;
        const toCardData = (r: Record<string, string>): CardData => ({
          CardNum:     r.CardNum,
          CardName:    r.CardName,
          ImgURL:      `${storageBase}/${r.CardNum}.webp`,
          Type:        r.Type,
          CardClass:   r.CardClass,
          Color:       r.Color,
          Level:       r.Level,
          GrowCost:    r.GrowCost,
          Cost:        r.Cost,
          Limit:       r.Limit,
          Power:       r.Power,
          Restriction: r.Restriction,
          Team:        r.Team,
          Timing:      r.Timing,
          Guard:       r.Guard,
          Coin:        r.Coin,
          Story:       r.Story,
          LifeBurst:   r.LifeBurst,
          EffectText:  r.EffectText,
          BurstText:   r.BurstText,
          effects:     effectsJson[r.CardNum] ?? [],
        });
        const sheetCards = csvResults
          .filter((t): t is string => t !== null)
          .flatMap(parseRows)
          .map(toCardData);
        const tokenCards = tkCsv ? parseRows(tkCsv).map(toCardData) : [];
        setCards(sheetCards);
        setAllCards([...sheetCards, ...tokenCards]);
      })
      .catch(e => console.error('カードデータ読み込み失敗:', e));
  }, []);

  // デッキ一覧の取得
  useEffect(() => {
    if (!user) return;
    supabase.from('decks').select('*').eq('user_id', user.id).order('sort_order', { ascending: true }).then(({ data }) => {
      if (data) setDecks(data.map(d => ({
        id: d.id,
        name: d.name,
        mainDeck: d.main_deck ?? [],
        lrigDeck: d.lrig_deck ?? [],
        thumbnailCardNum: d.thumbnail_card_num,
        sortOrder: d.sort_order ?? 0,
      })));
    });
  }, [user]);

  const handleCreateDeck = async (name: string) => {
    if (!user) return;
    const { data, error } = await supabase
      .from('decks')
      .insert([{ user_id: user.id, name, main_deck: [], lrig_deck: [] }])
      .select().single();
    if (error || !data) { alert('デッキ作成エラー: ' + (error?.message ?? '不明')); return; }
    const newDeck: Deck = { id: data.id, name: data.name, mainDeck: [], lrigDeck: [] };
    setDecks(prev => [...prev, newDeck]);
    setSelectedDeckId(data.id);
    setViewMode('DECK_EDITOR');
  };

  const handleUpdateDeck = async (updated: Deck) => {
    const { error } = await supabase.from('decks').update({
      name: updated.name,
      main_deck: updated.mainDeck,
      lrig_deck: updated.lrigDeck,
      thumbnail_card_num: updated.thumbnailCardNum,
    }).eq('id', updated.id);
    if (!error) {
      setDecks(prev => prev.map(d => d.id === updated.id ? updated : d));
    }
  };

  const handleDeleteDeck = async (deckId: string) => {
    const { error } = await supabase.from('decks').delete().eq('id', deckId);
    if (error) { alert('削除に失敗しました: ' + error.message); return; }
    setDecks(prev => prev.filter(d => d.id !== deckId));
    setViewMode('DECK_LIST');
  };

  const currentDeck = decks.find(d => d.id === selectedDeckId);

  if (loading) return null;

  return (
    <>
      {viewMode === 'LOGIN' && <LoginScreen />}
      {viewMode === 'START' && user && <StartScreen user={user} setViewMode={setViewMode} onCpuBattle={() => setViewMode('MATCHMAKING')} />}
      {viewMode === 'DECK_LIST' && user && (
        <DeckListScreen
          decks={decks}
          cards={cards}
          onCreateDeck={cpuBattleMode ? undefined : handleCreateDeck}
          onEditDeck={cpuBattleMode ? undefined : (id => { setSelectedDeckId(id); setViewMode('DECK_EDITOR'); })}
          onCpuSelect={cpuBattleMode ? (id => { setCpuBattleDeckId(id); setCpuBattleMode(false); setViewMode('CPU_BATTLE'); }) : undefined}
          onBack={() => { setCpuBattleMode(false); setViewMode('START'); }}
        />
      )}
      {viewMode === 'DECK_EDITOR' && currentDeck && (
        <DeckEditorScreen
          deck={currentDeck}
          cards={cards}
          onUpdate={handleUpdateDeck}
          onDelete={handleDeleteDeck}
          onBack={() => setViewMode('DECK_LIST')}
        />
      )}
      {viewMode === 'MATCHMAKING' && user && (
        <MatchmakingScreen
          user={user}
          decks={decks}
          cards={cards}
          onBattleStart={(roomId, deckId) => { setBattleRoomId(roomId); setBattleDeckId(deckId); setViewMode('BATTLE'); }}
          onBack={() => setViewMode('START')}
        />
      )}
      {viewMode === 'BATTLE' && user && battleRoomId && battleDeckId && (
        <BattleScreen
          user={user}
          roomId={battleRoomId}
          myDeckId={battleDeckId}
          cards={allCards}
          onBack={() => { setBattleRoomId(null); setBattleDeckId(null); setViewMode('START'); }}
        />
      )}
      {viewMode === 'CPU_BATTLE' && user && cpuBattleDeckId && (
        <CpuBattleScreen
          user={user}
          myDeckId={cpuBattleDeckId}
          decks={decks}
          cards={allCards}
          onBack={() => { setCpuBattleDeckId(null); setViewMode('START'); }}
        />
      )}
    </>
  );
}
