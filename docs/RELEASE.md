# RELEASE — リリース時に行う作業

> リリースの直前に上から実行する。**まだ実行していない作業だけ**を置き、実行したら日付と一緒に「実行済み」へ移す。

## 1. 未実行

### 1.1 管理者の CPU デッキを全プレイヤーが使えるようにする（2026-09-17 ユーザー決定）

- **いま**＝`decks` の行ポリシーは「本人の行だけ読める」。CPU デッキ（`deck_kind = 'cpu'`）も作った本人にしか見えない。
- **リリース時**＝管理者（ユーザー本人）の CPU デッキだけを、ログインした全員が**読める**ようにする（編集・削除は本人のまま）。
- 🔑**クライアントの変更は要らない**＝`MatchmakingScreen` は CPU デッキを `deck_kind = 'cpu'` だけで引き、`user_id` で絞っていない。
  ポリシーを足すと他人（管理者）の CPU デッキが自動で並び、デッキに「・公開」と表示される。対戦中の CPU デッキの読み込み（`BattleScreen` の `guest_deck_id`）も同じポリシーで通る。

```sql
-- ① 管理者のユーザーIDを調べる（username はログイン時の名前）
select id, raw_user_meta_data->>'username' as username from auth.users order by created_at;

-- ② 管理者の CPU デッキを全員が読めるようにする（<ADMIN_USER_ID> を①の id に置き換える）
create policy "decks_select_public_cpu" on public.decks
  for select to authenticated
  using (deck_kind = 'cpu' and user_id = '<ADMIN_USER_ID>');
```

- ⚠**フォルダのサムネイル（`deck_folders`）は公開されない**＝他のプレイヤーの画面では、管理者の CPU デッキのフォルダの表紙は「先頭デッキのセンタールリグ」になる。
  公開したい場合は `deck_folders` にも同形の select ポリシーを足し、`App.tsx` の読み込みで**自分の行を優先**する
  （同名フォルダのキー `cpu|<フォルダ名>` が自分と管理者で衝突するため）。
- 確認＝管理者以外のアカウント（`claude2` など）で CPU 対戦を開き、CPU デッキの一覧に管理者の CPU デッキが「・公開」付きで出ること。

## 2. 実行済み

（なし）
