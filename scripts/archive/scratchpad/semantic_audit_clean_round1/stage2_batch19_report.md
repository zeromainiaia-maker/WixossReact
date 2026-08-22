# §6.2 段2 第19バッチ報告

## 1. 触ったファイル

- `src/data/effectParser.ts`：「デッキをシャッフルし一番上…」を、同一枝内の `SHUFFLE_DECK → 一番上処理` にする一般後処理を追加。既存 `WD21-001` 構造化 override にはその順序を保つ先行 action を追加。
- `scripts/goldenTest.ts`：採用19効果それぞれの実行E2E、乱数非依存の counter/多重集合 assert、`ON_DECK_SHUFFLED` の発火/非発火契約を追加。
- `public/data/effects_misc.json`：`WD21-001-E1` のlive。
- `public/data/effects_WX24_26.json`：WX24/WX25 の7効果のlive。
- `public/data/effects_WXDi.json`：WXDi の11効果のlive。
- `docs/decompile_sheet*.txt`、`docs/_vocab_census.txt`、`docs/_census_stubs.txt`、`docs/_manual_drift.txt`、`docs/grouped_all.txt`、`docs/grouped_sentence_all.txt`：指定ワークフローの再生成物。
- `docs/BUGFIXES.md`：一次記録。
- 本報告：全候補の採否、逆翻訳、影響範囲、計測値を固定。

## 2. 21件のCSV原文再実測

`public/data/CardData_Sheet*.csv` の `EffectText` をカード番号で直接引き、21/21件で指定された「（あなたの）デッキをシャッフルし一番上…」を確認した。effectId と能力ブロックの対応も全件一致し、CSV側の false positive は0件。

ただしlive再実測では指定前提に2件の差があった。`WXDi-D04-011-E1` は `GRANT_QUOTED_ABILITY` の PARTIAL STUB で、内側の `REVEAL_DECK_TOP` 自体がliveにない。`WXDi-P10-006-E3` も `REVEAL_DECK_TOP` ではなく `STUB{DRAW}` と誤ったキーワード付与であり、公開/手札化自体が欠落していた。

## 3. ON_DECK_SHUFFLED の影響範囲

live全effectsを `timing` で走査した結果、`ON_DECK_SHUFFLED` を持つのは **`PR-470A-E1` 1効果のみ**（AUTO / `POWER_MODIFY`）。実行経路は `execShuffleDeck` が `deck_shuffled_count` を1増加 → `detectDeckShuffled` がdelta>0を検出 → `collectDeckShuffledTriggers` がシャッフルした側の場/ルリグの `PR-470A-E1` を収集、と確認した。

goldenでは採用19効果すべてで counter 7→8を実行assert。対照の `ADD_TO_LIFE` 単体では counter 不変・detector false、追加した実 `SHUFFLE_DECK` 後だけ detector true かつ `PR-470A-E1` 収集を確認。「シャッフルしていないのに誘発」はない。

## 4. 採用19効果（per-effect）

以下のJSONは変更した action 部の要約。全件で `SHUFFLE_DECK` は一番上処理の直前、かつ元の CHOOSE/CONDITIONAL 枝内にある。

| effectId | CSV原文の該当句 | 生成JSON | 逆翻訳文全体 | 一致 |
|---|---|---|---|---|
| WD21-001-E1 | アタックフェイズ開始時、デッキをシャッフルし一番上を公開 | `SEQUENCE[SHUFFLE_DECK,LOOK_AND_REORDER(public top 1),level別CONDITIONAL×4]` | 【自】あなたのアタックフェイズ開始時：あなたのデッキをシャッフルする。そしてあなたのデッキの上1枚を見る。そしてこの方法でレベル1/2/3/4のシグニを処理したなら対応能力を与える | 意味一致（公開が「見る」表示の既存表記） |
| WX24-P3-038-E1 | 選択肢②、ライフ0ならシャッフル後に1枚追加 | `CHOOSE.c1.action=SEQUENCE[SHUFFLE_DECK,ADD_TO_LIFE]` | 以下の2つから1つを選ぶ【… / あなたのライフが0である場合、あなたのデッキをシャッフルする。そして一番上から1枚をライフクロスに加える】 | 一致 |
| WX24-P4-005-E1 | シャッフル後に1枚追加 | `SEQUENCE[SHUFFLE_DECK,ADD_TO_LIFE,LIFE_CRASH,...]` | あなたのデッキをシャッフルする。そして1枚をライフクロスに加える。そして自分のライフを1枚クラッシュし、そうした場合相手のライフを1枚クラッシュ | 一致 |
| WX24-P4-019-E3 | 選択肢②、ライフ0ならシャッフル後に1枚追加 | `CHOOSE.c1.action=SEQUENCE[SHUFFLE_DECK,ADD_TO_LIFE]` | リコレクト4枚ゲート後の選択肢②だけ「ライフ0である場合、デッキをシャッフルする。そして1枚をライフクロスに加える」 | 一致 |
| WX25-P2-026-E2 | サーカス起：シャッフル後に1枚追加 | `SEQUENCE[SHUFFLE_DECK,ADD_TO_LIFE,STUB{LOOK_OPP_LIFE_TOP}]` | デッキをシャッフルする。そして1枚をライフクロスに加える。そして［既存STUB：ライフを見る］ | 該当句一致 |
| WX25-P3-008-E1 | コスト軽減後、シャッフル後に1枚追加 | `SEQUENCE[COST_REDUCTION_STUB,SHUFFLE_DECK,ADD_TO_LIFE]` | コスト軽減。そしてデッキをシャッフルする。そして1枚をライフクロスに加える | 一致 |
| WX25-P3-036-E2 | ゲーム1回、シャッフル後に1枚追加 | `SEQUENCE[SHUFFLE_DECK,ADD_TO_LIFE]` | ルリグデッキからアーツ1枚を置くコスト：デッキをシャッフルする。そして1枚をライフクロスに加える | 一致 |
| WX25-CD1-04-E2 | ゲーム1回、緑無：シャッフル後に1枚追加 | `SEQUENCE[SHUFFLE_DECK,ADD_TO_LIFE]` | 〈《緑×1》《無×1》〉デッキをシャッフルする。そして1枚をライフクロスに加える | 一致 |
| WXDi-D04-010-E1 | 選択肢①だけシャッフル後に1枚追加 | `CHOOSE.c0.action=SEQUENCE[SHUFFLE_DECK,ADD_TO_LIFE]` | ライフ上を見た後、選択肢①だけ「デッキをシャッフルする。そして1枚をライフクロスに加える」 | 一致（②の別シャッフルは非対象） |
| WXDi-P01-004-E1 | ライフ0ならシャッフル後に1枚追加 | `condition(LIFE_COUNT=0)+SEQUENCE[SHUFFLE_DECK,ADD_TO_LIFE]` | あなたのライフが0である場合、デッキをシャッフルする。そして1枚をライフクロスに加える | 一致 |
| WXDi-P03-004-E1 | 選択肢②のライフ手札化成功後だけシャッフル | `c1: TRANSFER_TO_HAND→CONDITIONAL.then=SEQUENCE[SHUFFLE_DECK,ADD_TO_LIFE]` | 選択肢②の「ライフを手札に加える。そうした場合」の内側だけシャッフル→1枚追加 | 一致 |
| WXDi-P04-008-E1 | ルリグアタック時、シャッフル後に上1枚公開 | `SEQUENCE[SHUFFLE_DECK,REVEAL_DECK_TOP,conditions...]` | 【自】ルリグアタック時：デッキをシャッフルする。そして上から1枚公開する。そしてレベル1/ガード条件を判定 | 一致 |
| WXDi-P06-030-E1 | 出現時、シャッフル後に1枚追加 | `SEQUENCE[SHUFFLE_DECK,ADD_TO_LIFE]` | 【自】場に出たとき：デッキをシャッフルする。そして1枚をライフクロスに加える | 一致 |
| WXDi-P08-008-E3 | 自ライフクラッシュ成功後、シャッフル後に1枚追加 | `LIFE_CRASH→CONDITIONAL.then=SEQUENCE[SHUFFLE_DECK,ADD_TO_LIFE]` | 自分のライフを1枚クラッシュ。そうした場合だけデッキをシャッフルし、1枚追加 | 一致 |
| WXDi-P12-009-E2 | 緑無無エクシード4：シャッフル後に1枚追加 | `SEQUENCE[SHUFFLE_DECK,ADD_TO_LIFE]` | 〈《緑×1》《無×1》《無×1》＋エクシード4〉デッキをシャッフルする。そして1枚をライフクロスに加える | 一致 |
| WXDi-P12-035-E2 | 出現時コストでライフ1枚クラッシュ：シャッフル後に1枚追加 | `SEQUENCE[SHUFFLE_DECK,ADD_TO_LIFE]` | 〈ライフ1枚クラッシュコスト〉デッキをシャッフルする。そして1枚をライフクロスに加える | 一致 |
| WXDi-P16-006-E1 | 使用条件/軽減後、シャッフル後に1枚追加 | `SEQUENCE[COST_REDUCTION_STUB,SHUFFLE_DECK,ADD_TO_LIFE]` | 緑ルリグ条件とコスト軽減の後、デッキをシャッフルし、1枚追加 | 該当句一致 |
| WXDi-P16-012-E3 | コストで5枚以上トラッシュならシャッフル後に1枚追加 | `CONDITIONAL(COST_TRASHED>=5).then=SEQUENCE[SHUFFLE_DECK,ADD_TO_LIFE]` | この方法で5枚以上トラッシュに置いたなら、デッキをシャッフルし、1枚追加 | 一致 |
| WXDi-CP02-040-E1 | 出現時、シャッフル後に1枚追加 | `SEQUENCE[SHUFFLE_DECK,ADD_TO_LIFE]` | 【自】場に出たとき：デッキをシャッフルする。そして1枚をライフクロスに加える | 一致 |

## 5. 見送った2効果

- `WXDi-D04-011-E1`：CSV原文候補は真。しかしliveは PARTIAL の `STUB{GRANT_QUOTED_ABILITY}`。`censusManualDrift` 削除候補86を確認し、`syncManualLive --dry` も実施。fresh全体同期は引用能力全体を `GRANT_LRIG_ABILITY` へ置換し、未実装 `UNKNOWN`/`CONDITIONAL_POWER_BONUS` も同時に入るため既存PARTIAL契約を破る。manual影武者も作らず据置。
- `WXDi-P10-006-E3`：CSV原文候補は真。ただしliveは指定前提の `REVEAL_DECK_TOP` ではなく `SEQUENCE[STUB{DRAW},GRANT_KEYWORD(ライフバースト)×2]`。原文の公開→手札化、公開カードのLB有無、アサシン/ダブルクラッシュの排他分岐まで同時に崩れている。シャッフルだけ追加すると「後続の一番上処理」が無いままで無意味なため、別の複合修正バッチへ送る。

## 6. 条件以外で見つけた原文との食い違い

1件：`WXDi-P10-006-E3` の公開/手札化とLB有無の排他キーワード付与が上liveで崩れている（上記理由で未修正）。その他の新規発見は0件。

## 7. ゲート

| 計器 | 結果 |
|---|---|
| golden | 2408 / FAIL 0（開始2387、+21＝採用19件の個別E2E＋発火/非発火2） |
| census | 708 / baseline 708 |
| smoke | 10693 / CRASH 0 / HANG 0 / INVARIANT 0 / SKIP 0 |
| fuzz 1（gates内） | seed 12648430 / 200 games / 全不具合0（distinct 2672） |
| fuzz 2（追加再実行） | seed 12648430 / 200 games / 全不具合0（distinct 2678） |
| census:stubs | A群🔴0 / C群0 |
| manual-fields | 0 |
| lint | 0 errors / 261 warnings（増減0） |
| groupSimilar --all | 同型★0 |
| held / partial / idset | 88 / 15 / 46 |
| censusManualDrift 削除候補 | 86（増減0） |

`npm run regen`、`npm run gates`、追加 `npm run fuzz`、`node scripts/groupSimilar.mjs --all` を実行し全緑。

## 8. 生パースdiffとoutlier

一般規則の生パース変化集合は20効果：採用19効果に加え、PARTIAL温存の `WXDi-D04-011-E1` が fresh-only outlier。live変化集合は上表の19カード/19効果のみで、追加/削除/effectId/parseStatus変更0。outlierは **1件**（`WXDi-D04-011-E1`）で、意図的に非採用。`WXDi-P10-006-E3` は「一番上処理」自体をparserが生成していないため本規則の変化集合に入らない。

## 9. held / lint

- held：開始88。parser変更後に対象が要レビューへ現れ、19件を原文照合後に個別採用。報告直前の `build:effects → heldReview` 実測88、増減0。
- partial 15 / idset 46：増減0。`WXDi-D04-011` の fresh は PARTIAL バケットで温存される。
- lint warning 261→261、error 0→0。

## 10. 真バグごとの慣例エンコード検討

- 採用19効果共通：`ADD_TO_LIFE{fromTop:true}` / `REVEAL_DECK_TOP` の `shuffle:true` フィールド追加は検討して外した。engineに消費地点がなく、`deck_shuffled_count` も増えず `ON_DECK_SHUFFLED` が誘発しないため、既存 `SHUFFLE_DECK` 独立actionを採用。
- 無条件の単一action群（`WX25-P3-036`、`WX25-CD1-04`、`WXDi-P06-030`、`WXDi-P12-009`、`WXDi-P12-035`、`WXDi-CP02-040`）：action後ろに `SHUFFLE_DECK` を置く形を排除。後置は取得済みカードに無関係で原文と逆順。
- 前後ステップ付き群（`WX24-P4-005`、`WX25-P2-026`、`WX25-P3-008`、`WXDi-P16-006`）：効果全体の先頭/末尾へ置く形を排除。対象の `ADD_TO_LIFE` 直前だけに差し込み、後続の別シャッフル（`WX25-P2-026` の残り）と混同しない。
- CHOOSE群（`WX24-P3-038`、`WX24-P4-019`、`WXDi-D04-010`、`WXDi-P03-004`）：CHOOSE外へ先行 `SHUFFLE_DECK` を置く形を排除。選ばれていない選択肢でもシャッフルする過剰実行になるため、対象choice内だけをSEQUENCE化。
- CONDITIONAL群（`WXDi-P01-004`、`WXDi-P08-008`、`WXDi-P16-012`）：条件外に置く形を排除。ライフ0/「そうした場合」/コストトラッシュ5枚未達では counter を増やさない。
- 公開群（`WD21-001`、`WXDi-P04-008`）：`LOOK_AND_REORDER`/`REVEAL_DECK_TOP` に乱数化を内包させる新規型を外し、既存カウンタ経路を通る独立actionを直前に置いた。`WD21-001` は既存構造化 override の削除も検討したが、レベル条件が無条件キーワード付与へ退化するため override を温存。
- `WXDi-D04-011-E1`：`manualEffects.ts` へ fresh を写す形を排除。削除候補の新規影武者になるうえ、引用能力全体を未実装構造へ差し替えるため非採用。
- `WXDi-P10-006-E3`：壊れたliveの先頭に `SHUFFLE_DECK` だけ追加する形を排除。一番上の取得/公開が無いため原文の順序を実装したことにならない。

## 11. 禁止事項と最終確認

- PLAN.md / PLAN_PROGRESS.md は編集していない。commit / push はしていない。
- デッキ順をgolden期待値にしていない。fuzzは2回安定。
- `git diff --name-only` の全ファイルに U+FFFD と3文字文字化け検査を実施。結果は末尾に追記する。

最終検査結果：U+FFFD / 3文字文字化けパターンとも **0 hit**。
