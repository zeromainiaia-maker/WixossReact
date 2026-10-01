/**
 * 認証イベントで画面をスタートへ戻すか（2026-10-01 ユーザー報告「iPhone の Safari でホームに戻って戻ると、
 * タイトル画面に即座に戻される」）。
 *
 * 🔴**`SIGNED_IN` は「新しくログインした」だけではない**＝Supabase の認証ライブラリ（auth-js）は
 *   **タブが裏から前面に戻るたび**にセッションを確かめ直し（`_onVisibilityChanged` → `_recoverAndRefresh`）、
 *   **同じユーザーのまま `SIGNED_IN` を通知する**。旧実装はこれを新規ログインとみなしてスタート画面へ戻していた
 *   ＝ホーム画面から戻るたびに対戦・デッキ編集・マッチングが閉じていた。
 * 🔑スタートへ戻すのは**初期化（リロード復元）が終わった後に、別のユーザー（＝未ログインから）がログインした**ときだけ。
 * ⚠React 非依存の純関数＝golden から import して検査する。
 */
export function shouldGoToStartOnSignIn(params: {
  event: string;
  /** 直前までログインしていたユーザー（未ログインなら null）。 */
  prevUserId: string | null;
  newUserId: string | null;
  /** 起動時の復元（`init()`）が終わっているか。終わる前の通知は復元側に任せる。 */
  initDone: boolean;
}): boolean {
  const { event, prevUserId, newUserId, initDone } = params;
  if (event !== 'SIGNED_IN' || !newUserId || !initDone) return false;
  return prevUserId !== newUserId;
}
