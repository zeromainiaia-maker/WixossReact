/**
 * 🆕**新規アカウント作成の受け付けスイッチ**（2026-09-26 ユーザー指示「一時的に作れないように・すぐ戻せるように」）。
 *
 * - `false`＝ログイン画面の［アカウントを作成］を出さない（既存アカウントのログインはそのまま）。
 * - **戻すときはこの1行を `true` にして push するだけ**（Vercel が自動デプロイ）。
 *
 * ⚠**画面を閉じるだけ**＝Supabase の新規登録 API そのものは止まらない（anon キーで直接呼べば作れる）。
 *   確実に止めるなら Supabase ダッシュボード → Authentication → Sign In / Providers →
 *   「Allow new users to sign up」を OFF（こちらも ON に戻すだけで即復旧。画面はその場合のエラー文言を持っている）。
 */
export const SIGNUP_ENABLED = false;
