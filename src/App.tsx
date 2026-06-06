import { useState, useEffect, useMemo } from 'react';
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
  const [cards, setCards] = useState<CardData[]>([]);          // デッキ編集用（トークン除外）
  const [allCards, setAllCards] = useState<CardData[]>([]);   // バトル用（トークン含む）
  const [variantCards, setVariantCards] = useState<CardData[]>([]); // 絵柄違いカード
  const [tkCards, setTkCards] = useState<CardData[]>([]);     // トークンカード（デッキ設定用）
  const [decks, setDecks] = useState<Deck[]>([]);
  const [selectedDeckId, setSelectedDeckId] = useState<string | null>(null);
  const [battleRoomId, setBattleRoomId] = useState<string | null>(null);
  const [battleDeckId, setBattleDeckId] = useState<string | null>(null);
  const [battleOppArtOverrides, setBattleOppArtOverrides] = useState<Record<string, string>>({});
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
        if (sessionStorage.getItem('gotoMatchmaking')) {
          sessionStorage.removeItem('gotoMatchmaking');
          setViewMode('MATCHMAKING');
        } else {
          setViewMode('START');
        }
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
    const variantsFetch = fetch('/data/CardData_Variants.csv').then(r => r.ok ? r.text() : null);
    Promise.all([
      Promise.all(sheetFetches),
      tkFetch,
      fetch('/data/effects.json').then(r => r.json() as Promise<Record<string, CardEffect[]>>),
      variantsFetch,
    ])
      .then(([csvResults, tkCsv, effectsJson, variantsCsv]) => {
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
        const variants = variantsCsv ? parseRows(variantsCsv).map(toCardData) : [];
        setCards(sheetCards);
        setAllCards([...sheetCards, ...tokenCards]);
        setVariantCards(variants);
        setTkCards(tokenCards);
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
        artOverrides: d.art_overrides ?? {},
      })));
    });
  }, [user]);

  const handleCreateDeck = async (name: string) => {
    if (!user) return;
    const nextOrder = decks.length;
    const { data, error } = await supabase
      .from('decks')
      .insert([{ user_id: user.id, name, main_deck: [], lrig_deck: [], sort_order: nextOrder }])
      .select().single();
    if (error || !data) { alert('デッキ作成エラー: ' + (error?.message ?? '不明')); return; }
    const newDeck: Deck = { id: data.id, name: data.name, mainDeck: [], lrigDeck: [], sortOrder: nextOrder };
    setDecks(prev => [...prev, newDeck]);
    setSelectedDeckId(data.id);
    setViewMode('DECK_EDITOR');
  };

  const handleReorderDecks = async (reordered: Deck[]) => {
    setDecks(reordered);
    await Promise.all(
      reordered.map((deck, index) =>
        supabase.from('decks').update({ sort_order: index }).eq('id', deck.id)
      )
    );
  };

  const handleUpdateDeck = async (updated: Deck) => {
    const { error } = await supabase.from('decks').update({
      name: updated.name,
      main_deck: updated.mainDeck,
      lrig_deck: updated.lrigDeck,
      thumbnail_card_num: updated.thumbnailCardNum,
      art_overrides: updated.artOverrides ?? {},
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

  // variantCards を CardNum で引けるマップ
  const variantCardMap = useMemo(() => new Map(variantCards.map(c => [c.CardNum, c])), [variantCards]);

  // artOverrides を allCards の ImgURL に適用するユーティリティ
  const applyArtOverrides = (baseCards: CardData[], merged: Record<string, string>): CardData[] => {
    if (Object.keys(merged).length === 0) return baseCards;
    return baseCards.map(c => {
      const vCard = variantCardMap.get(merged[c.CardNum] ?? '');
      return vCard ? { ...c, ImgURL: vCard.ImgURL } : c;
    });
  };

  // バトル用カード配列（自分 + 相手 両デッキの artOverrides を適用）
  const battleCards = useMemo(() => {
    const myDeck = decks.find(d => d.id === battleDeckId);
    const merged = { ...(myDeck?.artOverrides ?? {}), ...battleOppArtOverrides };
    return applyArtOverrides(allCards, merged);
  }, [allCards, battleDeckId, decks, battleOppArtOverrides, variantCardMap]); // eslint-disable-line react-hooks/exhaustive-deps

  // CPU対戦用カード配列（自分 + CPU 両デッキの artOverrides を適用）
  const cpuBattleCards = useMemo(() => {
    const myDeck = decks.find(d => d.id === cpuBattleDeckId);
    const cpuDeck = decks.find(d => d.id !== cpuBattleDeckId);
    const merged = { ...(cpuDeck?.artOverrides ?? {}), ...(myDeck?.artOverrides ?? {}) };
    return applyArtOverrides(allCards, merged);
  }, [allCards, cpuBattleDeckId, decks, variantCardMap]); // eslint-disable-line react-hooks/exhaustive-deps

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
          onReorderDecks={cpuBattleMode ? undefined : handleReorderDecks}
          onBack={() => { setCpuBattleMode(false); setViewMode('START'); }}
        />
      )}
      {viewMode === 'DECK_EDITOR' && currentDeck && (
        <DeckEditorScreen
          deck={currentDeck}
          cards={cards}
          variantCards={variantCards}
          tkCards={tkCards}
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
          onBattleStart={(roomId, deckId, oppArtOverrides) => { setBattleRoomId(roomId); setBattleDeckId(deckId); setBattleOppArtOverrides(oppArtOverrides ?? {}); setViewMode('BATTLE'); }}
          onBack={() => setViewMode('START')}
        />
      )}
      {viewMode === 'BATTLE' && user && battleRoomId && battleDeckId && (
        <BattleScreen
          user={user}
          roomId={battleRoomId}
          myDeckId={battleDeckId}
          cards={battleCards}
          onBack={() => { setBattleRoomId(null); setBattleDeckId(null); setViewMode('START'); }}
        />
      )}
      {viewMode === 'CPU_BATTLE' && user && cpuBattleDeckId && (
        <CpuBattleScreen
          user={user}
          myDeckId={cpuBattleDeckId}
          decks={decks}
          cards={cpuBattleCards}
          onBack={() => { setCpuBattleDeckId(null); setViewMode('START'); }}
        />
      )}
    </>
  );
}
