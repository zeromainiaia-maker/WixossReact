-- 表記ゆれで本体が2枚に割れていたカードを1枚へまとめた（2026-10-23・v0.654・BUGFIXES 第558バッチ）。
-- 保存済みのデッキに残っている「移した番号」を、本体の番号へ書き直す（全ユーザーの行）。
--
-- 🔑なぜ要るか＝アプリは読み込むたびに `src/utils/mergedCardNums.ts` で付け替えているが、DB の行は古い番号のまま。
--   このSQLを流せば、付け替えの処理を消せる（流す前でもアプリは壊れない＝冪等・何度流してもよい）。
-- 🔑元の絵柄は残す＝移した番号を `art_overrides`（本体番号 → 表示する絵柄）に入れる（既に選んでいた絵柄は上書きしない）。
-- ⚠対応表（$m$…$m$ の「旧>新」）は2か所にあり、どちらも `MERGED_CARD_NUMS` と同じでなければならない（golden が突き合わせる）。
-- ⚠列の型（text[] / jsonb）に依存しないよう、文字列にして置き換えてから元の型へ戻す。
-- ⚠単引用符を使わない（ドル引用 $x$…$x$ と concat_ws）＝チャットからコピーすると引用符が化けて構文エラーになった（2026-10-23 実際に起きた）。
-- ⚠一時テーブル・一時関数を使わない＝Supabase の SQL Editor では「relation does not exist」になった（同日 実際に起きた）。
--   書き換えは do ブロック1つ（それ自体が1トランザクション＝途中で失敗すれば何も変わらない）。
--
-- 実行＝Supabase の SQL Editor に全文を貼って Run。最後の select が「移した番号が残っている行」の数＝0 なら完了。

do $do$
declare
  pairs text[] := string_to_array($m$WXDi-D03-020>WXDi-D01-020,SP12-013>WX06-010,PR-186>WX09-007,PR-187>WX09-009,WD23-009-A>WX16-013,WD23-010-A>WX16-014,PR-247>WX17-Re03,SP12-006>PR-202,SPK16-8C>PR-465,SPK03-21>WXK09-022,WDK-F01-02>WDA-F02-02,WDK-F01-04>WDA-F02-04,WDK-F01-03>WDK02-003,WXDi-D09-P27>WXDi-D05-021,WX25-P2-118>WXDi-P09-048,SPDi01-121>WX25-P1-115,WX25-CD1-06>WX25-CP1-030,SPDi37-06>WX24-D3-25$m$, $s$,$s$);
  cols text[] := string_to_array($c$main_deck,lrig_deck,thumbnail_card_num,center_lrig,assist_lrig_l,assist_lrig_r,cpu_plan$c$, $s$,$s$);
  p text; from_num text; to_num text; re text; col text; typ text; art_typ text;
begin
  select format_type(atttypid, atttypmod) into art_typ from pg_attribute
    where attrelid = $t$public.decks$t$::regclass and attname = $t$art_overrides$t$ and not attisdropped;

  foreach p in array pairs loop
    from_num := split_part(p, $s$>$s$, 1);
    to_num := split_part(p, $s$>$s$, 2);
    -- 番号の境目で当てる（`PR-247` が `PR-2470` に当たらない）
    re := $r$(^|[^A-Za-z0-9-])$r$ || from_num || $r$(?![A-Za-z0-9])$r$;

    -- ① 絵柄を残す（デッキの中身を書き換える前にやる）
    if art_typ is not null then
      execute format(
        $q$update public.decks set art_overrides = (jsonb_build_object(%L, %L) || coalesce(art_overrides::jsonb, jsonb_build_object()))::%s
           where concat_ws(chr(32), main_deck::text, lrig_deck::text, thumbnail_card_num) ~ %L
             and not (coalesce(art_overrides::jsonb, jsonb_build_object()) ? %L)$q$,
        to_num, from_num, art_typ, re, to_num);
    end if;

    -- ② 番号を付け替える（型は列ごとに読んで戻す）
    foreach col in array cols loop
      select format_type(atttypid, atttypmod) into typ from pg_attribute
        where attrelid = $t$public.decks$t$::regclass and attname = col and not attisdropped;
      continue when typ is null;
      execute format($q$update public.decks set %I = (regexp_replace(%I::text, %L, %L, %L))::%s where %I::text ~ %L$q$,
        col, col, re, $r$\1$r$ || to_num, $r$g$r$, typ, col, re);
    end loop;

    -- ③ フォルダのサムネイル
    if to_regclass($t$public.deck_folders$t$) is not null then
      execute format($q$update public.deck_folders set thumbnail_card_num = regexp_replace(thumbnail_card_num, %L, %L, %L) where thumbnail_card_num ~ %L$q$,
        re, $r$\1$r$ || to_num, $r$g$r$, re);
    end if;
  end loop;
end
$do$;

-- 確認＝移した番号が残っている行（0 が正）
select count(*) as remaining_rows from public.decks d
  where exists (
    select 1 from unnest(string_to_array($m$WXDi-D03-020>WXDi-D01-020,SP12-013>WX06-010,PR-186>WX09-007,PR-187>WX09-009,WD23-009-A>WX16-013,WD23-010-A>WX16-014,PR-247>WX17-Re03,SP12-006>PR-202,SPK16-8C>PR-465,SPK03-21>WXK09-022,WDK-F01-02>WDA-F02-02,WDK-F01-04>WDA-F02-04,WDK-F01-03>WDK02-003,WXDi-D09-P27>WXDi-D05-021,WX25-P2-118>WXDi-P09-048,SPDi01-121>WX25-P1-115,WX25-CD1-06>WX25-CP1-030,SPDi37-06>WX24-D3-25$m$, $s$,$s$)) as p
    where concat_ws(chr(32), d.main_deck::text, d.lrig_deck::text, d.thumbnail_card_num, d.center_lrig,
                    d.assist_lrig_l, d.assist_lrig_r, d.cpu_plan::text)
          ~ ($r$(^|[^A-Za-z0-9-])$r$ || split_part(p, $s$>$s$, 1) || $r$(?![A-Za-z0-9])$r$));
