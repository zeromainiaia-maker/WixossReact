-- Supabase の権限を締める（2026-10-23・Supabase の security advisor ＋ pg_policies の実測から）。
-- 🔑何が穴だったか
--   S1 `append_battle_logs` は SECURITY DEFINER（RLS を飛ばす）なのに対戦者の確認が無く、anon からも呼べた
--      ＝部屋 ID さえ分かれば誰でもどの対戦のログにも書き足せた。
--   S2 `rooms` / `battle_states` の UPDATE ポリシーに「guest_id IS NULL なら誰でも」が入っていた
--      ＝相手の入る前の部屋を他人が書き換えられた（battle_states は guest_id が NULL の行を作らないので不要）。
--      rooms は「参加」（他人が guest_id を自分にする）にこの条件が要る＝条件は残し、トリガーで「参加の形」だけを通す。
--   S3 `battle_states` に「誰でも読める（true）」ポリシーがあり、他人の対戦の盤面を読めた。
--   S4 同じ意味のポリシーの重複（decks）・search_path 未固定の関数。
-- ⚠クライアントの変更は要らない（参加＝MatchmakingScreen.handleJoinRoom／退出＝handleLeaveRoom の形はどちらも通る）。

-- ── S1 ──
create or replace function public.append_battle_logs(p_room_id uuid, p_logs jsonb)
 returns void
 language sql
 security definer
 set search_path = public
as $function$
  update battle_states
  set game_logs = (
    select jsonb_agg(elem order by (elem->>'timestamp')::timestamptz)
    from (
      select jsonb_array_elements(game_logs || p_logs) as elem
    ) sub
    limit 200
  )
  where room_id = p_room_id
    and (auth.uid() = host_id or auth.uid() = guest_id);
$function$;
revoke execute on function public.append_battle_logs(uuid, jsonb) from anon, public;
grant execute on function public.append_battle_logs(uuid, jsonb) to authenticated;

-- トリガー専用の関数は RPC から呼ばせない（トリガーとしての実行には EXECUTE 権限は要らない）
revoke execute on function public.battle_states_save_snapshot() from anon, authenticated, public;
-- 巻き戻しは本体で対戦者を確かめている＝未ログインからだけ外す
revoke execute on function public.rewind_battle(uuid, integer, integer) from anon, public;
grant execute on function public.rewind_battle(uuid, integer, integer) to authenticated;

-- ── S2 ──
drop policy if exists "Enable update for participants" on public.battle_states;  -- guest_id IS NULL を含む方（残る方と同じ意味＋穴）

create or replace function public.rooms_guard_update()
 returns trigger
 language plpgsql
 set search_path = public
as $function$
begin
  -- ダッシュボード・service_role などは素通し
  if current_user not in ('anon', 'authenticated') then
    return new;
  end if;
  -- 部屋の当事者（ホスト・いまのゲスト）は何でも変えられる（ゲストの退出＝guest_id を NULL にする、を含む）
  if auth.uid() is not null and (auth.uid() = old.host_id or auth.uid() = old.guest_id) then
    return new;
  end if;
  -- それ以外は「空いている部屋に自分が参加する」だけ＝ゲスト側の列以外は1つも変えない
  if auth.uid() is not null and old.guest_id is null and new.guest_id = auth.uid()
     and (to_jsonb(new) - array['guest_id', 'guest_deck_id', 'guest_art_overrides'])
       = (to_jsonb(old) - array['guest_id', 'guest_deck_id', 'guest_art_overrides']) then
    return new;
  end if;
  raise exception 'この部屋を変更する権限がありません';
end;
$function$;
drop trigger if exists rooms_guard_update on public.rooms;
create trigger rooms_guard_update before update on public.rooms
  for each row execute function public.rooms_guard_update();

-- ── S3 ──
drop policy if exists "Enable read access for all users" on public.battle_states;  -- 「対戦者だけ読める」が残る

-- ── S4 ──
drop policy if exists "Users can view their own decks" on public.decks;    -- "Users can only see their own decks" と同一
drop policy if exists "Users can insert their own decks" on public.decks;  -- "Users can create their own decks" と同一
alter function public.update_modified_column() set search_path = public;
alter function public.battle_states_bump_move_no() set search_path = public;
