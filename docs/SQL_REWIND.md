# SQL — 「何手目に戻る」の土台（2026-09-23 ユーザー要望）

> 🔴**この SQL を Supabase の SQL Editor で1回流すまで、アプリ側の「手を戻す」ボタンは出ない**
> （クライアントは `battle_states.move_no` の有無で機能の可否を判定する＝流す前でも対戦は壊れない）。
> 🔑**Claude はこの SQL を流せない**＝`.env.local` にあるのは anon キーだけで、DDL は service_role
> （＝ダッシュボード）でしか通らない。`supabase` MCP も未認証（`Unauthorized`）。

## 何をするか（3行）

1. `battle_states` に **`move_no`（盤面の通し番号）** と **`rewind_request`（同意のやりとり）** を足す。
2. 行が更新されるたび、トリガーが `move_no` を +1 して **`battle_snapshots` へ行ごと写す**（直近 400 手）。
3. `rewind_battle` RPC が、そのスナップショットを**現在の行へ書き戻す**（＝完全にその状態に戻る）。

- ⚠**ログ（`game_logs`）はスナップショットに含めない／戻さない**＝戻すと「何が起きたか」の記録ごと消える。
  代わりに「N手目の盤面に戻しました」の1行を足す。
- ⚠**巻き戻しても `move_no` は進み続ける**＝履歴が分岐して同じ番号が2つ現れない。
- ⚠**部屋を消すと履歴も消える**（`on delete cascade`）＝対戦終了後に残らない。

```sql
-- ════════════ ① 列を足す ════════════
alter table public.battle_states
  add column if not exists move_no integer not null default 0,
  add column if not exists rewind_request jsonb;

-- ════════════ ② 盤面の履歴テーブル ════════════
create table if not exists public.battle_snapshots (
  room_id    uuid        not null references public.battle_states(room_id) on delete cascade,
  move_no    integer     not null,
  snapshot   jsonb       not null,   -- ⚠列名に `row` を使わない（Postgres の ROW 構成子と衝突して select が壊れる）
  created_at timestamptz not null default now(),
  primary key (room_id, move_no)
);

alter table public.battle_snapshots enable row level security;

-- その部屋の対戦者だけが履歴を読める（書き込みはトリガー＝定義者権限のみ）。
drop policy if exists "battle_snapshots_select_players" on public.battle_snapshots;
create policy "battle_snapshots_select_players" on public.battle_snapshots
  for select to authenticated
  using (exists (
    select 1 from public.battle_states b
    where b.room_id = battle_snapshots.room_id
      and (b.host_id = auth.uid() or b.guest_id = auth.uid())
  ));

-- ════════════ ③ 更新のたびに番号を進める（BEFORE） ════════════
-- 🔑**ログだけの更新では進めない**＝`append_battle_logs` は盤面を変えないので、
--   進めると「同じ盤面のスナップショットが何枚も並ぶ」＝400手の枠をログが食い潰す。
create or replace function public.battle_states_bump_move_no()
returns trigger language plpgsql as $$
begin
  if  (new.host_state          is distinct from old.host_state)
   or (new.guest_state         is distinct from old.guest_state)
   or (new.effect_stack        is distinct from old.effect_stack)
   or (new.pending_effect      is distinct from old.pending_effect)
   or (new.pending_spell       is distinct from old.pending_spell)
   or (new.turn_phase          is distinct from old.turn_phase)
   or (new.global_phase        is distinct from old.global_phase)
   or (new.setup_phase         is distinct from old.setup_phase)
   or (new.active_user_id      is distinct from old.active_user_id)
   or (new.turn_count          is distinct from old.turn_count)
   or (new.winner_id           is distinct from old.winner_id)
  then
    new.move_no := coalesce(old.move_no, 0) + 1;
  end if;
  return new;
end $$;

drop trigger if exists battle_states_bump_move_no on public.battle_states;
create trigger battle_states_bump_move_no
  before update on public.battle_states
  for each row execute function public.battle_states_bump_move_no();

-- ════════════ ④ 進んだら履歴へ写す（AFTER） ════════════
-- ⚠`security definer`＝トリガーは呼び出した人の権限で走るので、付けないと RLS で弾かれる。
create or replace function public.battle_states_save_snapshot()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.move_no is distinct from old.move_no then
    insert into public.battle_snapshots (room_id, move_no, snapshot)
    values (new.room_id, new.move_no, to_jsonb(new) - 'game_logs' - 'rewind_request')
    on conflict (room_id, move_no) do nothing;
    -- 直近 400 手だけ残す（`screens/battle/rewind.ts` の REWIND_SNAPSHOT_KEEP と合わせる）。
    delete from public.battle_snapshots
     where room_id = new.room_id and move_no <= new.move_no - 400;
  end if;
  return null;
end $$;

drop trigger if exists battle_states_save_snapshot on public.battle_states;
create trigger battle_states_save_snapshot
  after update on public.battle_states
  for each row execute function public.battle_states_save_snapshot();

-- ════════════ ⑤ 戻す RPC ════════════
-- 🔴**同意の確認はクライアントが済ませてから呼ぶ**＝ここは「呼んだ人がその部屋の対戦者か」だけを見る。
create or replace function public.rewind_battle(
  p_room_id  uuid,
  p_state_no integer,
  p_log_no   integer
) returns void language plpgsql security definer set search_path = public as $$
declare
  v_host uuid;
  v_guest uuid;
  v_snap jsonb;
begin
  select host_id, guest_id into v_host, v_guest
    from public.battle_states where room_id = p_room_id;
  if not found then
    raise exception '部屋が見つかりません';
  end if;
  if auth.uid() is distinct from v_host and auth.uid() is distinct from v_guest then
    raise exception 'この部屋の対戦者ではありません';
  end if;

  select snapshot into v_snap
    from public.battle_snapshots
   where room_id = p_room_id and move_no = p_state_no;
  if v_snap is null then
    raise exception '% 手目の盤面は保存されていません', p_log_no;
  end if;

  -- 盤面の列だけを書き戻す（room_id / host_id / guest_id / game_logs / move_no は触らない）。
  update public.battle_states b set
    global_phase        = r.global_phase,
    setup_phase         = r.setup_phase,
    turn_phase          = r.turn_phase,
    active_user_id      = r.active_user_id,
    turn_count          = r.turn_count,
    host_state          = r.host_state,
    guest_state         = r.guest_state,
    host_lrig_selected  = r.host_lrig_selected,
    guest_lrig_selected = r.guest_lrig_selected,
    host_janken         = r.host_janken,
    guest_janken        = r.guest_janken,
    host_mulligan_done  = r.host_mulligan_done,
    guest_mulligan_done = r.guest_mulligan_done,
    first_player_id     = r.first_player_id,
    pending_spell       = r.pending_spell,
    pending_effect      = r.pending_effect,
    effect_stack        = r.effect_stack,
    winner_id           = r.winner_id,
    host_end_ack        = r.host_end_ack,
    guest_end_ack       = r.guest_end_ack,
    -- ⚠明示的に進める＝画面は `updated_at` で「自分の書き込みが届いたか」を見ている。
    updated_at          = now(),
    rewind_request      = jsonb_build_object(
                            'by', auth.uid(), 'logNo', p_log_no, 'stateNo', p_state_no,
                            'text', '', 'status', 'DONE', 'at', to_char(now() at time zone 'utc','YYYY-MM-DD"T"HH24:MI:SS"Z"'))
  from jsonb_populate_record(null::public.battle_states, v_snap) r
  where b.room_id = p_room_id;

  -- 戻した証跡を1行だけ足す（⚠ログ本体は戻さない）。
  -- 🔑`move_no` は上の UPDATE でトリガーが進めた**新しい**番号＝この行から先も戻し先にできる。
  update public.battle_states set
    game_logs = coalesce(game_logs, '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
      'timestamp', to_char(now() at time zone 'utc','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'user_id',   auth.uid(),
      'action',    format('━━ %s手目の盤面に戻しました（両者の同意） ━━', p_log_no),
      'move_no',   move_no))
  where room_id = p_room_id;
end $$;

grant execute on function public.rewind_battle(uuid, integer, integer) to authenticated;
```

## つまずいたら

- **`there is no unique constraint matching given keys for referenced table "battle_states"`**
  ＝`battle_states.room_id` に主キー/一意制約が無い。`alter table public.battle_states add primary key (room_id);` を先に流すか、
  ②の `references ... on delete cascade` を外す（外した場合、部屋を消しても履歴が残るので
  `delete from public.battle_snapshots where room_id = '<部屋>';` を手で流す）。
- **アプリで「手を戻す」が出ない** ＝ ①の列が入っていない（`select move_no from public.battle_states limit 1;` で確認）。
- **同意したのに `% 手目の盤面は保存されていません` になる** ＝ その手が 400 手より前＝枠から落ちた（正常）。

## 流したあとの確認

1. アプリで対戦を始める → 右上「終了」→ **「手を戻す」** が出ること（出なければ列が足りていない）。
2. ログの各行に **`12.`** のような手番号が出ること。
3. 手番号を入れて申請 → 相手の画面に同意ダイアログ → 同意 → **両者の盤面がその手に戻る**こと。
4. CPU 対戦は同意なしで即座に戻ること。

## 元に戻す（要らなくなったら）

```sql
drop function if exists public.rewind_battle(uuid, integer, integer);
drop trigger  if exists battle_states_save_snapshot on public.battle_states;
drop trigger  if exists battle_states_bump_move_no  on public.battle_states;
drop function if exists public.battle_states_save_snapshot();
drop function if exists public.battle_states_bump_move_no();
drop table    if exists public.battle_snapshots;
alter table public.battle_states drop column if exists rewind_request, drop column if exists move_no;
```
