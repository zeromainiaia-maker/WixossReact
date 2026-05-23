import { supabase } from '../supabaseClient';
import type { User } from '@supabase/supabase-js';
import type { ViewMode } from '../types';

interface Props {
  user: User;
  setViewMode: (mode: ViewMode) => void;
  onCpuBattle: () => void;
}

export default function StartScreen({ user, setViewMode, onCpuBattle }: Props) {
  const username = user.user_metadata?.username ?? user.email ?? 'プレイヤー';

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  return (
    <div style={{
      height: '100vh',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: '#0a0a0f',
      gap: '16px',
      position: 'relative',
    }}>
      <button onClick={() => window.location.reload()} style={{
        position: 'absolute',
        top: '20px',
        left: '20px',
        padding: '6px 14px',
        fontSize: '12px',
        backgroundColor: 'transparent',
        color: '#666',
        border: '1px solid #333',
        borderRadius: '4px',
        cursor: 'pointer',
      }}>
        ↺ リロード
      </button>

      <button onClick={handleLogout} style={{
        position: 'absolute',
        top: '20px',
        right: '20px',
        padding: '6px 14px',
        fontSize: '12px',
        backgroundColor: 'transparent',
        color: '#666',
        border: '1px solid #333',
        borderRadius: '4px',
      }}>
        ログアウト
      </button>

      <p style={{
        position: 'absolute',
        bottom: '20px',
        right: '20px',
        fontSize: '12px',
        color: '#555',
      }}>
        「{username}」でログイン中
      </p>

      <h1 style={{ fontSize: '32px', letterSpacing: '6px', color: '#007bff' }}>
        WIXOSS ONLINE
      </h1>

      <button onClick={() => setViewMode('MATCHMAKING')} style={{
        width: '260px',
        padding: '16px',
        borderRadius: '8px',
        border: 'none',
        backgroundColor: '#007bff',
        color: '#fff',
        fontSize: '16px',
        fontWeight: 'bold',
      }}>
        オンライン対戦
      </button>

      <button onClick={onCpuBattle} style={{
        width: '260px',
        padding: '16px',
        borderRadius: '8px',
        border: 'none',
        backgroundColor: '#1a7a3a',
        color: '#fff',
        fontSize: '16px',
        fontWeight: 'bold',
      }}>
        CPU対戦
      </button>

      <button onClick={() => setViewMode('DECK_LIST')} style={{
        width: '260px',
        padding: '16px',
        borderRadius: '8px',
        border: '1px solid #333',
        backgroundColor: 'transparent',
        color: '#ccc',
        fontSize: '16px',
      }}>
        デッキ編成
      </button>
    </div>
  );
}
