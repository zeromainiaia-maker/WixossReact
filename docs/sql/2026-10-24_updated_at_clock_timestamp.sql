-- 2026-10-24：battle_states.updated_at を「確定の順番どおりに増える値」にする
--
-- ■ なぜ
--   update_modified_column() は NEW.updated_at = now() ＝ **トランザクションの開始時刻**。
--   同じ行に2つの書き込みが重なると、後に確定する側（行のロックを待った側）の開始が早いことがあり、
--   **最新の行の updated_at が、ひとつ前の書き込みの updated_at より小さくなる**（通知の記録 SYNC_TRACE=1 で1戦に5回）。
--   画面は updated_at の大小で「自分の書き込みが届いたか」を判定する（cpuDriver.ts の lastCommitArrived）ので、
--   届いているのに「届いていない」と判定し、CPU が待ち続ける（CPU の見張りが6秒後に再実行して救っていた）。
--
-- ■ どう直す
--   clock_timestamp()＝**関数を実行した瞬間の時刻**。BEFORE UPDATE トリガーは行のロックを取った後に走るので、
--   同じ行への書き込みはロックの順＝確定の順に並び、updated_at はその順に増える。
--
-- ■ 影響
--   この関数を使うトリガーは battle_states の update_battle_states_modtime（BEFORE UPDATE）1本だけ（2026-10-24 実測）。
--   意味（「この行が最後に書かれた時刻」）と値の形式（timestamptz）は変わらない。変わるのは、同じ行への書き込みが重なったときの大小だけ。
--
-- ■ 戻し方
--   NEW.updated_at = now(); に戻す。

create or replace function public.update_modified_column()
returns trigger
language plpgsql
set search_path = public
as $function$
begin
    new.updated_at = clock_timestamp();
    return new;
end;
$function$;
