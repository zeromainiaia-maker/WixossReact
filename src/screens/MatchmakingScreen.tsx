import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../supabaseClient';
import type { User } from '@supabase/supabase-js';
import type { CardData, Deck, Room } from '../types';

interface Props {
  user: User;
  decks: Deck[];
  cards: CardData[];
  onBattleStart: (roomId: string, deckId: string) => void;
  onBack: () => void;
}

type Step = 'SELECT_DECK' | 'SELECT_MODE' | 'HOST_WAITING' | 'GUEST_WAITING';

// CPU専用プレイヤーID（auth.usersに存在しない固定UUID）
export const CPU_PLAYER_ID = '00000000-0000-0000-0000-000000000001';

const primaryBtn: React.CSSProperties = {
  width: '100%', maxWidth: 280, padding: '14px 0', borderRadius: 8, border: 'none',
  backgroundColor: '#007bff', color: '#fff', fontSize: 15,
  fontWeight: 'bold', cursor: 'pointer', boxSizing: 'border-box',
};

const ghostBtn: React.CSSProperties = {
  ...primaryBtn,
  backgroundColor: 'transparent', border: '1px solid #333', color: '#aaa',
};

const wrap: React.CSSProperties = {
  height: '100vh', display: 'flex', flexDirection: 'column',
  justifyContent: 'center', alignItems: 'center',
  backgroundColor: '#0a0a0f', gap: 16, color: '#ccc',
};

export default function MatchmakingScreen({ user, decks, cards, onBattleStart, onBack }: Props) {
  // メインデッキ40枚 かつ ルリグデッキにLv.0ルリグが存在するデッキのみ表示
  const validDecks = useMemo(() => {
    const cardMap = new Map(cards.map(c => [c.CardNum, c]));
    return decks.filter(deck => {
      if (deck.mainDeck.length !== 40) return false;
      return deck.lrigDeck.some(num => {
        const c = cardMap.get(num);
        return c?.Type === 'ルリグ' && c.Level === '0';
      });
    });
  }, [decks, cards]);

  const [step, setStep] = useState<Step>('SELECT_DECK');
  const [selectedDeckId, setSelectedDeckId] = useState<string>(validDecks[0]?.id ?? '');
  const [room, setRoom] = useState<Room | null>(null);
  const [passcodeInput, setPasscodeInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!room) return;
    const channel = supabase
      .channel(`room-${room.id}`)
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'rooms', filter: `id=eq.${room.id}`,
      }, (payload) => {
        const updated = payload.new as Room;
        setRoom(updated);
        if (updated.status === 'PLAYING') onBattleStart(room.id, selectedDeckId);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [room?.id]);

  // CPU対戦：即時ルーム作成 → battle_states 生成 → 対戦開始
  const handleCpuBattle = async () => {
    if (!selectedDeckId) return;
    setLoading(true); setError(null);

    // CPU デッキ：ユーザーの別デッキを使用（なければ同じデッキ）
    const cpuDeck = validDecks.find(d => d.id !== selectedDeckId) ?? validDecks[0];
    if (!cpuDeck) { setError('対戦用デッキが見つかりません'); setLoading(false); return; }

    // ルーム作成
    const { data: roomData, error: roomErr } = await supabase
      .from('rooms')
      .insert({
        host_id: user.id,
        host_deck_id: selectedDeckId,
        guest_id: CPU_PLAYER_ID,
        guest_deck_id: cpuDeck.id,
        status: 'PLAYING',
        is_cpu_battle: true,
        passcode: null,
      })
      .select()
      .single();

    if (roomErr || !roomData) { setError(roomErr?.message ?? '作成失敗'); setLoading(false); return; }

    // battle_states を即時生成（セットアップ画面から開始）
    const emptyPlayerState = {
      deck: [], lrig_deck: [], hand: [], life_cloth: [], trash: [], lrig_trash: [],
      energy: [], coins: 0,
      field: { lrig: [], signi: [null, null, null], assist_lrig_l: [], assist_lrig_r: [], check: null, key_piece: null, free_zone: [] },
    };
    const { error: bsErr } = await supabase.from('battle_states').insert({
      room_id: roomData.id,
      host_id: user.id,
      guest_id: CPU_PLAYER_ID,
      global_phase: 'SETUP',
      setup_phase: 'JAN_KEN',
      turn_phase: 'UP',
      active_user_id: null,
      turn_count: 1,
      host_state: emptyPlayerState,
      guest_state: emptyPlayerState,
      game_logs: [],
    });

    setLoading(false);
    if (bsErr) { setError(bsErr.message); return; }

    onBattleStart(roomData.id, selectedDeckId);
  };

  const handleCreateRoom = async () => {
    if (!selectedDeckId) return;
    setLoading(true); setError(null);
    const passcode = Math.floor(1000 + Math.random() * 9000).toString();
    const { data, error: e } = await supabase
      .from('rooms').insert({ host_id: user.id, host_deck_id: selectedDeckId, passcode })
      .select().single();
    setLoading(false);
    if (e || !data) { setError(e?.message ?? '作成失敗'); return; }
    setRoom(data as Room);
    setStep('HOST_WAITING');
  };

  const handleJoinRoom = async () => {
    if (!selectedDeckId || passcodeInput.length !== 4) return;
    setLoading(true); setError(null);
    const { data: found } = await supabase
      .from('rooms').select('*')
      .eq('passcode', passcodeInput).eq('status', 'WAITING').maybeSingle();
    if (!found) { setError('ルームが見つかりません'); setLoading(false); return; }
    if ((found as Room).host_id === user.id) { setError('自分のルームには参加できません'); setLoading(false); return; }
    const { data, error: e } = await supabase
      .from('rooms').update({ guest_id: user.id, guest_deck_id: selectedDeckId })
      .eq('id', (found as Room).id).select().single();
    setLoading(false);
    if (e || !data) { setError(e?.message ?? '参加失敗'); return; }
    setRoom(data as Room);
    setStep('GUEST_WAITING');
  };

  const handleStartGame = async () => {
    if (!room?.guest_id) return;
    setLoading(true); setError(null);

    const { error: bsErr } = await supabase.from('battle_states').insert({
      room_id: room.id,
      host_id: room.host_id,
      guest_id: room.guest_id,
      global_phase: 'SETUP',
      setup_phase: 'JAN_KEN',
      turn_phase: 'UP',
      active_user_id: null,
      turn_count: 1,
      host_state: { deck: [], lrig_deck: [], hand: [], life_cloth: [], trash: [], lrig_trash: [], energy: [], coins: 0, field: { lrig: [], signi: [null, null, null], assist_lrig_l: [], assist_lrig_r: [], check: null, key_piece: null } },
      guest_state: { deck: [], lrig_deck: [], hand: [], life_cloth: [], trash: [], lrig_trash: [], energy: [], coins: 0, field: { lrig: [], signi: [null, null, null], assist_lrig_l: [], assist_lrig_r: [], check: null, key_piece: null } },
      game_logs: [],
    });
    if (bsErr) { setError(bsErr.message); setLoading(false); return; }

    await supabase.from('rooms').update({ status: 'PLAYING' }).eq('id', room.id);
    setLoading(false);
    onBattleStart(room.id, selectedDeckId);
  };

  if (step === 'SELECT_DECK') return (
    <div style={wrap}>
      <h2 style={{ color: '#fff', margin: 0 }}>使用デッキを選択</h2>
      {validDecks.length === 0 ? (
        <p style={{ color: '#888', textAlign: 'center', maxWidth: 280, lineHeight: 1.6 }}>
          使用可能なデッキがありません。<br />
          メインデッキ40枚・ルリグデッキにLv.0ルリグが入ったデッキを作成してください。
        </p>
      ) : (
        <select
          value={selectedDeckId}
          onChange={e => setSelectedDeckId(e.target.value)}
          style={{
            width: 260, padding: '12px 16px', borderRadius: 8,
            border: '1px solid #444', backgroundColor: '#111',
            color: '#fff', fontSize: 15, cursor: 'pointer', appearance: 'auto',
          }}
        >
          {validDecks.map(deck => (
            <option key={deck.id} value={deck.id}>{deck.name}</option>
          ))}
        </select>
      )}
      <div style={{ display: 'flex', gap: 10, width: '100%', maxWidth: 280, boxSizing: 'border-box' }}>
        <button style={{ ...ghostBtn, maxWidth: '46%' }} onClick={onBack}>戻る</button>
        <button
          style={{ ...primaryBtn, maxWidth: '54%', opacity: selectedDeckId ? 1 : 0.4 }}
          disabled={!selectedDeckId}
          onClick={() => setStep('SELECT_MODE')}
        >
          次へ
        </button>
      </div>
    </div>
  );

  if (step === 'SELECT_MODE') return (
    <div style={wrap}>
      <h2 style={{ color: '#fff', margin: 0 }}>対戦モード選択</h2>
      <button style={primaryBtn} onClick={handleCreateRoom} disabled={loading}>
        ルームを作成する
      </button>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
        <p style={{ margin: 0, fontSize: 13, color: '#666' }}>または</p>
        <input
          placeholder="パスコード（4桁）"
          value={passcodeInput}
          onChange={e => setPasscodeInput(e.target.value.replace(/\D/g, '').slice(0, 4))}
          style={{
            width: 220, padding: '10px 0', borderRadius: 8, border: '1px solid #333',
            backgroundColor: '#111', color: '#fff', fontSize: 20,
            textAlign: 'center', letterSpacing: 8,
          }}
        />
        <button
          style={{ ...primaryBtn, opacity: passcodeInput.length === 4 ? 1 : 0.4 }}
          disabled={loading || passcodeInput.length !== 4}
          onClick={handleJoinRoom}
        >
          ルームに参加
        </button>
      </div>
      {error && <p style={{ color: '#ff4444', margin: 0 }}>{error}</p>}
      <button style={ghostBtn} onClick={() => setStep('SELECT_DECK')}>戻る</button>
    </div>
  );

  const handleCancelRoom = async () => {
    if (!room) { setStep('SELECT_MODE'); return; }
    setLoading(true);
    await supabase.from('rooms').delete().eq('id', room.id);
    setLoading(false);
    setRoom(null);
    setStep('SELECT_MODE');
  };

  if (step === 'HOST_WAITING') return (
    <div style={wrap}>
      <h2 style={{ color: '#fff', margin: 0 }}>対戦相手を待っています</h2>
      <p style={{ color: '#888', margin: 0 }}>このパスコードを相手に教えてください</p>
      <div style={{
        padding: '16px 40px', borderRadius: 8, backgroundColor: '#001a3a',
        border: '2px solid #007bff', fontSize: 36, fontWeight: 'bold',
        color: '#007bff', letterSpacing: 12,
      }}>
        {room?.passcode}
      </div>
      {room?.guest_id ? (
        <>
          <p style={{ color: '#4caf50', margin: 0 }}>対戦相手が参加しました！</p>
          <button style={primaryBtn} onClick={handleStartGame} disabled={loading}>
            {loading ? '準備中...' : 'ゲーム開始'}
          </button>
        </>
      ) : (
        <p style={{ color: '#555', margin: 0 }}>相手の参加を待っています...</p>
      )}
      {error && <p style={{ color: '#ff4444', margin: 0 }}>{error}</p>}
      <button style={ghostBtn} onClick={handleCancelRoom} disabled={loading}>
        {loading ? 'キャンセル中...' : 'キャンセルしてルームを削除'}
      </button>
    </div>
  );

  const handleLeaveRoom = async () => {
    if (!room) { setStep('SELECT_MODE'); return; }
    setLoading(true);
    await supabase.from('rooms')
      .update({ guest_id: null, guest_deck_id: null, status: 'WAITING' })
      .eq('id', room.id);
    setLoading(false);
    setRoom(null);
    setStep('SELECT_MODE');
  };

  if (step === 'GUEST_WAITING') return (
    <div style={wrap}>
      <h2 style={{ color: '#fff', margin: 0 }}>ゲーム開始を待っています</h2>
      <p style={{ color: '#555', margin: 0 }}>ホストがゲームを開始するまでお待ちください...</p>
      {error && <p style={{ color: '#ff4444', margin: 0 }}>{error}</p>}
      <button style={ghostBtn} onClick={handleLeaveRoom} disabled={loading}>
        {loading ? 'キャンセル中...' : 'キャンセルしてルームを抜ける'}
      </button>
    </div>
  );

  return null;
}
