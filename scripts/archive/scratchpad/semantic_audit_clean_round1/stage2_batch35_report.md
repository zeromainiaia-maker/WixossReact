# 段2 第35バッチ報告：動的な枚数（「同じ数だけ」「N枚につき」）

- 実施日: 2026-08-23
- 開始HEAD: `20f2b2254`
- 対象: findings 側で OPEN の指定9 effect（実際の OPEN finding は15件）
- 結果: **9 effect / 15 findings を採用、指定効果の据置0、live の兄弟・対象外 effect 巻き込み0**
- 禁止事項: commit / push なし、`docs/PLAN.md` / `docs/PLAN_PROGRESS.md` 編集なし

## 1. 母集団の数え直し

`public/data/CardData_Sheet1.csv`～`CardData_Sheet10.csv` と `CardData_TK.csv` を直接読み、各ファイルの先頭BOMを `replace(/^\uFEFF/, '')` で除去した。カード数は `974+929+879+633+360+135+880+866+883+127+46 = 6712`、原文 effect ブロックは10719件だった。

指定された6文型を effect 単位で走査した結果は次のとおり。各行は重複を含み、union だけが重複除外値である。

| 原文文型 | ヒット effect 数 |
|---|---:|
| `同じ数だけ` | 5 |
| `([０-９\d]+)枚につき` | 148 |
| `([０-９\d]+)体につき` | 97 |
| `枚数まで` | 5 |
| `枚数と同じ` | 13 |
| `この方法で`＋枚数 | 36 |
| **重複除外 union** | **282** |

この282 effect について、live の各 effect 木をeffect単位で見て、次を「既存機構で表現済み」として引いた。

- `$ref` を既に持つもの
- `CountFromZone` を既に持つもの
- action type 名が `_PER_` を持つもの、および `POWER_MODIFY_PER_TRASH_COUNT` / `POWER_MODIFY_PER_LIFE_COUNT` / `POWER_MODIFY_PER_LRIG_LEVEL` 等の専用比例型
- `LEVEL_MOD_PER_COUNT` 等の既存専用型

引き算の結果は **既存受け皿あり109 / 受け皿なし173**。再帰 leaf 数の差ではなく effect 単位の「受け皿の有無」で判定したため、外側集合化が担う内側 `count:1` を誤って欠落扱いしていない。

さらに `findings.jsonl` の未closedだけと交差した。

| 段階 | finding行 | effectId |
|---|---:|---:|
| 原文union 282 × OPEN | 51 | 35 |
| 受け皿なし173 × OPEN | 25 | 17 |
| 今回指定された母集団 | **15** | **9** |

指定9 effect のうち、単純な引き算後の集合に残るのは8 effect。`SPDi43-24-E1` だけは誤った `DRAW_PER_FIELD_COUNT` が `_PER_` 受け皿として数えられたため機械的には除外されたが、実際は「自分の場の総シグニ数」を読み、先行DOWN自体も欠落していた。これは「名前が近い既存型」を正実装と誤認する偽陰性なので、原文と木を目視照合して指定母集団へ戻した。

受け皿なし×OPEN の残り9 effect は今回の指定木と異なるためスコープ外とした。closed には書いていない。

| effectId | 今回採らなかった理由 |
|---|---|
| `WDA-F02-07-E1` | 捨てた各シグニごとのレベル対応を保つ反復で、単一の動的スカラー枚数ではない |
| `WX05-010-E1` | ライフから任意枚数を移し同数補充する複合移動で、今回の既存 action の count 差替え形ではない |
| `WX07-027-BURST` | 場の＜原子＞数とバニッシュ対象集合の双方が崩れた別木 |
| `WX10-053-E1` | CONTINUOUS の使用コスト軽減＋選択肢フィルタ等4 findingsで、executor action枚数ではなくcollector経路 |
| `WX24-P2-036-E1` | 捨てた各シグニのレベルと個別対応する反復で、単一スカラーではない |
| `WX25-CP1-042-E2` | 現在領域ではなく「このターンにクラッシュしたライフ」の履歴カウンタが必要 |
| `WXDi-P10-036-E1` | 場のレベル1シグニ数だけ多段選択を繰り返す木で、同一選択肢の再選択可否も原文照合が必要 |
| `WXDi-P11-077-E1` | 「このシグニの下のカード」の任意全数であり、`CountFromZone` の既存zone集合ではない |
| `WXEX2-34-E1` | 動的DRAWが木から丸ごと欠落し、別クラスを数えるECとの2本を復元する必要がある |

## 2. 採用した effect（per-effect）

| effectId | 原文の該当句 | 修正前 JSON の要点 | 修正後 JSON の要点 | 逆翻訳全体 |
|---|---|---|---|---|
| `WX22-024-E2` | 「すべての他のシグニをバニッシュしてもよい」「同じ数だけ」 | `BANISH count:'ALL'` 強制、後段 `ADD_TO_FIELD count:1` | `BANISH optional:true`、後段 `count:{$ref:'last_processed_count'}` | ○。任意全件→同数場出しまで一致 |
| `WX10-034-E1` | 「同じ数だけエナゾーンから手札に加える」 | 前段は0..2体、後段は `count:1` | `TRANSFER_TO_HAND.source.count={$ref:'last_processed_count'}` | ○ |
| `WXDi-P14-027-E1` | 「好きな枚数対象」「レベルの合計が…枚数と同じ」 | 戻し1枚、DOWN1体、合計制約なし | 戻し `count:'ALL',upToCount:true`、DOWNも任意全数＋`totalLevelExactRef:last_processed_count` | ○ |
| `WX11-030-E2` | 「引いたカードの枚数まで」「アップするかダウンする」 | `DOWN count:1` のみ | UP/DOWNの `CHOOSE`、両対象数を `$ref:'cards_drawn_this_attack_phase'`、0..N選択 | ○ |
| `SPDi43-24-E1` | 「アップ状態の青…2体までダウン」「この方法でダウンしたシグニ1体につき」 | 先行DOWNなし、DRAWは場の総シグニ数、手札捨て1枚 | 青・アップ限定DOWN 0..2→両選択肢を `last_processed_count` へ接続 | ○。逆翻訳の「処理したカード」は汎化表示だが参照対象・枚数・順序は一致 |
| `PR-442-BURST` | 「デッキの枚数10枚につき1枚引く」 | `DRAW count:1` | `countFromZone:{zone:'deck',unitSize:10,per:1}` | ○ |
| `WXDi-P04-004-E1` | 「トラッシュ…10枚につき1つ」「ターン終了時まで」 | `CHOOSE choose_count:1`、POWER_MODIFY期間欠落 | `countChoose.countFromZone={trash,unitSize:10}`、POWER_MODIFY `UNTIL_END_OF_TURN` | ○ |
| `WXEX2-46-E1` | 「【アクセ】1枚につき【エナチャージ1】」 | EC `count:1` | `countFromZone:{zone:'acce',unitSize:1,per:1}` | ○ |
| `WXEX1-22-E1` | 「【チャーム】1枚につき1つまで」「ターン終了時まで」 | 常に1つ、選択肢③の期間action欠落 | `countChoose.countFromZone={charm,owner:'opponent',unitSize:1},upTo:true`、③に期間明示 | ○ |

`node tmp_stage2_batch35_live_diff.mjs` で HEAD と現liveをeffect単位に構造比較した結果、差が出たのは上の9 effectIdだけだった。カード内の兄弟 effect、追加・削除 effect、対象外 live effect の差は0。

## 3. 据置

指定9 effect の据置は **0**。上表の9件はすべて、型だけでなく実際のexecutor/選択resume経路まで評価可能であることを確認して採用した。スコープ外の残り9 effect は前節のとおり別機構であり、未closedのまま残した。

## 4. 型・engine の配線

新しい action type は作っていない。既存型への追加は次の4点。

- `CountFromZone.unitSize?: number`（除数）と zone `deck` / `charm`
- `ChooseAction.countChoose.countFromZone?: CountFromZone`
- `SelectionConstraint.totalLevelExactRef?: NumberOrRef`
- `PlayerState.cards_drawn_this_attack_phase?: number`

第26バッチ由来の既存 `CountFromZone.per` は実コード上「枚数に掛ける乗数」だった。今回の「N枚につき」のNを `per` に入れると逆にN倍になるため、互換性を壊さず除数 `unitSize` を分離した。`unitSize<=0` / 非有限値は0を返す fail-closed とした。

変更・確認した消費関数は次のとおり。

- `resolveCountRef`：`cards_drawn_this_attack_phase` と `CountFromZone` 解決
- `countFromZone`：deck/charm走査、`floor(matched/unitSize)*per`、不正unitの0化
- `execDraw`：既存 `resolveCountRef(...,countFromZone)` 消費＋アタックフェイズ累計記録
- `execEnergyChargeFromDeck`：既存 `resolveCountRef(...,countFromZone)` 消費を確認
- `execChoose`：`countChoose.countFromZone` 解決、0ならpendingを作らず終了、非repeatは利用可能選択肢数へcap
- `execDown` / `execUp`：`resolveNum` ではなく `resolveCountRef` を通し、0ならno-op
- `execDown`：`totalLevelExactRef` をpending前に静的 `totalLevelExact` へ解決
- `execTrash`：動的手札枚数0なら選択pendingを作らずno-op
- `execTransferToDeck`：`TRASH_CARD count:'ALL',upToCount:true` を0..全件選択として消費
- `execBanish`：`count:'ALL',optional:true` を全件実行／全件スキップとして消費
- `execTransferToHand` / `execAddToField`：既存の `resolveCountRef` 経路で `last_processed_count` が通ることを確認
- `CONVENTION_TURN_SCOPED_STATE` / `applyTurnBoundaryResets`：`attack-phase-start` ごとに累計を0へ戻す既存境界funnelへ登録

decompiler も `CountFromZone.unitSize`、動的UP/DOWN、動的exact、動的CHOOSE、動的手札TRASHを表示するよう配線した。`TRASH` の `NumberOrRef` が `[object Object]枚` になる既存表示穴も同時に塞いだ。

## 5. golden

追加テストは8件。

1. `段2 第35バッチ parser契約: 対象9効果は動的枚数の受け皿をfresh木へ出す`
2. `段2 第35バッチ engine両方向: CountFromZone.unitSize は20枚→2・9枚→0でfail-closed`
3. `段2 第35バッチ engine両方向: 【アクセ】2枚→EC2・0枚→EC0`
4. `段2 第35バッチ engine両方向: 動的CHOOSEは数え元2なら2択・0なら対話なし`
5. `段2 第35バッチ engine両方向: last_processed_count は2なら2枚・0なら0枚`
6. `段2 第35バッチ E2E: WXDi-P14-027 は戻した2枚をexact2へ渡し、0枚ならダウン0`
7. `段2 第35バッチ E2E: SPDi43-24 は実際にダウンした2体/0体を両選択肢へ渡す`
8. `段2 第35バッチ engine両方向: アタックフェイズドロー累計は2を参照し、境界で0へ戻る`

したがって成立方向（数え元2→2件）と不成立方向（数え元0→pendingなし・移動なし）の両方を固定した。`unitSize:0` も既定1や無制限へ倒れず0になることを別assertしている。

既存goldenの機械差分は `git diff --unified=0 scripts/goldenTest.ts` で確認した。追加部より前の変更は、(1) turn-scoped field母数35→36/registry 58→59、(2) C2のDOWN/UP resolver期待を `resolveNum` から `resolveCountRef` へ更新、(3) C1の新規動的field許可、の意図した不変条件更新だけ。既存テストの削除・期待値の数値戻し・無関係ブロック書換えは0。新規8件はファイル末尾へ連続追加した。

## 6. held / partial / idset

| bucket | before | after | 増減 |
|---|---:|---:|---:|
| `docs/_held_fresh.json` | 83 | 83 | 0 |
| `docs/_partial_fresh.json` | 15 | 15 | 0 |
| `docs/_idset_fresh.json` | 46 | 46 | 0 |

3 JSON は `git diff --numstat` に出ず、内容もHEADと同一。したがって増分の原文照合対象は0件。held経由では `WX10-034,WX11-030,WX22-024,WXDi-P14-027,SPDi43-24` をカード単位で採用したが、事前にeffect差分を見て指定effect以外の変化がないことを確認した。純改善で採用された指定効果は `PR-442-BURST`,`WXDi-P04-004-E1`,`WXEX1-22-E1`,`WXEX2-46-E1`。buildログに出る既存後処理 `WXDi-P07-052-E1` は最終liveがHEADと同一で、live差分へは入っていない。

`docs/_held_review.txt` は再生成により旧表示の3グループが整理されたが、fresh bucketの会員・総数には変化がない。

## 7. 条件外の不一致

指定9 effect の逆翻訳全文を `npm run regen` 後に1件ずつ読み直した。今回の15 findings以外に、実行意味が原文と食い違う新規箇所は見つからなかった。表示上は `SPDi43-24-E1` の `$ref:last_processed_count` が汎用句「この方法で処理したカード」となるが、直前stepは青・アップ状態シグニのDOWNだけであり参照集合は原文と同一。`WXEX1-22-E1` の「ターン終了時まで」は当初逆翻訳から落ちたため、条件外として放置せず同effectのaction durationへ明示して一致させた。

## 8. ゲート before / after

| 計器 | before (`20f2b2254`) | after |
|---|---:|---:|
| golden | 2595 PASS / 0 FAIL | **2603 PASS / 0 FAIL** |
| census | 628 / BASELINE_HIGH 628 | **626 / BASELINE_HIGH 626** |
| smoke | 10693 OK、CRASH/HANG/INVARIANT/SKIP 0 | **10693 OK、全0** |
| fuzz | 全0 | **全0** |
| `groupSimilar --all` | 同型★ 0 | **0** |
| `census:stubs` | A群無言0 / C群0 | **A群無言0 / C群0** |
| `check:manual-fields` | 0 | **0** |
| lint | 0 errors / 261 warnings | **0 errors / 261 warnings** |
| held / partial / idset | 83 / 15 / 46 | **83 / 15 / 46** |

`npm run gates` は全緑。censusの正当な改善2件（`SPDi43-24-E1` が「ダウン/アップ状態」と「色」の重複カテゴリから外れ、effectId dedupでは-1、`WX22-024-E2` が「任意」から外れ-1）に合わせ、`scripts/vocabCensus.ts` の定数だけを628→626へ更新した。PLANは禁止に従い編集していない。

## 9. エンコーディング検査

最終 `git diff --name-only` の全ファイルをバイト列/UTF-8として走査し、次を確認する。

- UTF-8 decode error / `U+FFFD`: 0
- 3文字以上連続の `?`: 新規0（既存のデータ文字列は差分比較で除外）
- 先頭BOM `efbbbf`: 新規0

本報告書は **13592 bytes**。先頭見出しと末尾をUTF-8で読み返し、内容が入っていることを確認した。
