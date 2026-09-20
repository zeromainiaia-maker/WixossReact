-- デッキフォーマット（カードプール）の列を足す（2026-09-20）。
-- 🔴**この列が無いと `handleUpdateDeck` の UPDATE が丸ごと失敗し、デッキの保存が静かに効かなくなる**
--    （フォーマットだけでなく、カードの追加・削除・名前変更・サムネイルも全部）。
--    ⇒ **デプロイより先に、Supabase の SQL Editor で実行する。**
-- ⚠既存行は NULL のまま＝「未設定」＝クライアントが中身から推定する
--    （`src/utils/deckFormat.ts` の `effectiveDeckFormat`）。**バックフィルは不要。**
alter table public.decks
  add column if not exists deck_format text;

alter table public.decks
  drop constraint if exists decks_deck_format_check;

alter table public.decks
  add constraint decks_deck_format_check
  check (deck_format is null or deck_format in ('diva', 'legacy', 'allstar'));
