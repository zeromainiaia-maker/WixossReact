import { useEffect, useRef } from 'react';

/**
 * 🆕2026-10-01（ユーザー要望「ホーム画面からアプリに戻ったとき、正しい最新のゲーム状態から始めたい」）
 * ＝**アプリが前面に戻った合図**を1つにまとめる。
 *
 * 🔴なぜ要るか＝盤面の更新は Supabase のリアルタイム通知で受け取っているが、iPhone はホーム画面へ出ると
 *   ページの実行を止めるので、**裏にいる間の通知を取りこぼす**。戻っても取り直す処理が無く、
 *   **次に何か更新が来るまで古い盤面のまま**だった（自分の手番で相手が待っていると永久に古いまま）。
 * 🔑強制リロードはしない（ユーザー判断）＝デッキ編成の未保存の変更やほかの画面の状態を消さずに、
 *   **戻った画面だけが DB から取り直し、リアルタイムの購読を張り直す**。
 *
 * 合図＝①`visibilitychange` で表示に戻った ②`pageshow` でページがキャッシュから復元された（`persisted`）
 *   ③`online`（通信が戻った）。⚠①と②は同時に来ることがある＝`minIntervalMs` 以内の2回目は捨てる。
 */
export function isResumeEvent(e: { type: string; visibilityState?: string; persisted?: boolean }): boolean {
  if (e.type === 'visibilitychange') return e.visibilityState === 'visible';
  if (e.type === 'pageshow') return e.persisted === true;
  return e.type === 'online';
}

/** 前面に戻ったら `onResume` を呼ぶ（React）。 */
export function useOnResume(onResume: () => void, minIntervalMs = 1000): void {
  const cb = useRef(onResume);
  useEffect(() => { cb.current = onResume; }, [onResume]);
  useEffect(() => {
    let last = 0;
    const handle = (ev: Event) => {
      const ok = isResumeEvent({
        type: ev.type,
        visibilityState: document.visibilityState,
        persisted: (ev as PageTransitionEvent).persisted,
      });
      if (!ok) return;
      const now = Date.now();
      if (now - last < minIntervalMs) return;
      last = now;
      cb.current();
    };
    document.addEventListener('visibilitychange', handle);
    window.addEventListener('pageshow', handle);
    window.addEventListener('online', handle);
    return () => {
      document.removeEventListener('visibilitychange', handle);
      window.removeEventListener('pageshow', handle);
      window.removeEventListener('online', handle);
    };
  }, [minIntervalMs]);
}
