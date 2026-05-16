import { useState } from 'react';
import { supabase } from '../supabaseClient';

const toFakeEmail = (username: string) =>
  `${username.toLowerCase().trim()}@wixoss.game`;

export default function LoginScreen() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!username.trim() || !password) {
      alert('ユーザーネームとパスワードを入力してください');
      return;
    }
    setLoading(true);
    const email = toFakeEmail(username);

    if (isSignUp) {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { username: username.trim() } },
      });
      if (error) alert('登録エラー: ' + error.message);
      else alert('登録完了！ログインしてください。');
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) alert('ログインエラー: ユーザーネームかパスワードが違います');
    }
    setLoading(false);
  };

  return (
    <div style={{
      height: '100vh',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: '#0a0a0f',
      gap: '12px',
    }}>
      <h1 style={{ fontSize: '32px', letterSpacing: '6px', color: '#007bff', marginBottom: '32px' }}>
        WIXOSS ONLINE
      </h1>

      <input
        type="text"
        placeholder="ユーザーネーム"
        value={username}
        onChange={e => setUsername(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && handleSubmit()}
        style={inputStyle}
      />
      <input
        type="password"
        placeholder="パスワード"
        value={password}
        onChange={e => setPassword(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && handleSubmit()}
        style={inputStyle}
      />

      <button onClick={handleSubmit} disabled={loading} style={primaryButtonStyle}>
        {loading ? '...' : isSignUp ? '新規登録' : 'ログイン'}
      </button>

      <button onClick={() => setIsSignUp(v => !v)} style={secondaryButtonStyle}>
        {isSignUp ? 'ログインに戻る' : 'アカウントを作成'}
      </button>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: '280px',
  padding: '14px 16px',
  borderRadius: '8px',
  border: '1px solid #333',
  backgroundColor: '#1a1a2e',
  color: '#fff',
  fontSize: '15px',
};

const primaryButtonStyle: React.CSSProperties = {
  width: '280px',
  padding: '14px',
  borderRadius: '8px',
  border: 'none',
  backgroundColor: '#007bff',
  color: '#fff',
  fontSize: '15px',
  fontWeight: 'bold',
  marginTop: '8px',
};

const secondaryButtonStyle: React.CSSProperties = {
  width: '280px',
  padding: '10px',
  borderRadius: '8px',
  border: '1px solid #444',
  backgroundColor: 'transparent',
  color: '#888',
  fontSize: '13px',
};
