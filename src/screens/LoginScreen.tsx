import { useState } from 'react';
import { supabase } from '../supabaseClient';
import { APP_VERSION } from '../version';

const toFakeEmail = (username: string): string => {
  const bytes = new TextEncoder().encode(username.trim());
  const binary = Array.from(bytes, b => String.fromCharCode(b)).join('');
  const base64 = btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  return `${base64}@wixoss.game`;
};

function toJapaneseAuthError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes('user already registered') || m.includes('already been registered'))
    return 'このユーザーネームはすでに登録されています';
  if (m.includes('password should be at least'))
    return 'パスワードは6文字以上で入力してください';
  if (m.includes('weak password'))
    return 'パスワードが簡単すぎます。英数字を組み合わせてください';
  if (m.includes('invalid email') || m.includes('unable to validate email'))
    return 'ユーザーネームに使用できない文字が含まれています';
  if (m.includes('signup is disabled'))
    return '現在新規登録は受け付けていません';
  if (m.includes('email rate limit') || m.includes('rate limit'))
    return 'しばらく時間をおいてから再試行してください';
  return '登録に失敗しました。しばらくしてから再試行してください';
}

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
      if (error) alert(toJapaneseAuthError(error.message));
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

      <span style={{ position: 'fixed', bottom: 12, left: 16, fontSize: 11, color: '#333' }}>
        {APP_VERSION}
      </span>
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
