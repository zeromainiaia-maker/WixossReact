# 段2 第38バッチ報告：種別ごとに1枚ずつ取る群割当

- 日付: 2026-08-23
- 基準HEAD: `948a320ef`
- 方針: commit / pushなし、`docs/PLAN.md` / `docs/PLAN_PROGRESS.md` 未編集

## 1. 母集団の数え直し

`public/data/CardData_Sheet*.csv` をUTF-8で直接読み、各ファイル先頭の `U+FEFF` を剥がして、指定された4正規表現を走査した。69カード、重複込み78ヒットだった。文型の重複（例: class_and と signi_spell が同じ句を拾う）を統合し、「それぞれN枚以上ある場合」など選択対象ではなく条件・修飾だった11カードを目視で除くと、58カード・59個の独立した選択／コスト節になった（`WXK05-030` は2節）。「AとB」は全件で対象名詞句を読み、単なる修飾を群選択として数えていない。

トップレベル action から既存受け皿を数えた機械走査の重複込み内訳は `SEQUENCE=27 / LOOK_PICK_CHAIN=14 / CHOOSE=3 / REPEAT=0 / 既存group系field=5`。その後、実JSONとexecutorを目視し、正しく実装済みとして23節を引いた。

| 正しく実装済みの受け皿 | 節数 | 要点 |
|---|---:|---|
| `LOOK_PICK_CHAIN.stages` | 14 | 1回の公開からstage別filter／枚数を選ぶ |
| `SEQUENCE` | 1 | 別々の処理として意味が保たれている |
| `CHOOSE` | 1 | 選択肢内の複数処理として保持 |
| `REPEAT` | 0 | 該当なし |
| `discardGroups` / `energyTrashGroups` / `transferGroups` / 出現条件group | 7 | 既存の群別受け皿で正しい |
| 合計 | 23 | 母集団から引き算 |

残る36節のうち、本バッチの文型で13節を修正した。残り23節はライズ／アクセ／レベル別／色別／カード名3種／各プレイヤー別／非公開レゾナ等の別軸、または既存STUBであり、本バッチでは据置した。具体的には `WX16-026-BURST`, `WX16-031-BURST`, `WX19-027-BURST`, `WXK03-070-E1`, `WXK05-030-E1`（2節）, `WXK09-060-E3`, `WD13-003-E1`, `WXDi-D01-011-E1`, `WXDi-D04-016-BURST`, `WXDi-P04-022-E1`, `WXDi-P06-083-E2`, `WXDi-P07-095-E1`, `WXDi-P08-002-E1`, `WXDi-P09-004-E1`, `WXDi-P09-007-E1`, `WXDi-P11-013-E1`, `WXDi-P11-019-E1`, `WXDi-P11-025-E1`, `WXDi-P11-056-E1`, `WX25-P1-022-E2`, `WX25-P2-017-E1`, `WX25-P2-021-E1`。

指定スコープのうち上記regex外だった「合計2枚」「ルリグ1体とシグニ1体」「カード1枚と【マルチエナ】」等と、同じparser規則で変わった効果も1件ずつCSV原文・live JSON・逆翻訳を照合し、合計23効果を採用した。

## 2. 設計判断

案(b)の変形として、`SearchAction.groups` ではなく既存の共通受け皿 `SelectionConstraint.groups?: Array<{ filter?; count }>` を追加した。SEARCH専用にしなかった理由は、同じ誤りが探索、トラッシュ回収、エナトラッシュ、手札コスト、場のルリグ／シグニ選択にまたがっていたためである。

各カードを1群だけへ割り当てる小規模バックトラックを `satisfiesSelectionConstraint` に接続した。`count` は群容量で、action側のcountが必須総数を担う。したがって探索で片群候補0なら他群の1枚だけを処理でき、コストのようにactionが2枚を要求する経路ではA/B各1枚が必須になる。重複filter（無条件カード群＋【マルチエナ】群）でも1枚を二重計上しない。

SEARCHを2本のSEQUENCEにはしていない。候補提示、公開、シャッフル、`afterSearch` を1回に保つためである。`LOOK_PICK_CHAIN` は原文が「デッキ上を見る」効果だけに継続利用し、通常の「探す」をLOOKへ置換していない。

## 3. per-effect 採用表

| effectId | 原文の該当句 | 修正前JSONの要点 | 修正後JSONの要点 | 逆翻訳全体一致 |
|---|---|---|---|---|
| `WX02-050-E1` | ＜アーム＞1枚と＜天使＞1枚 | `SEARCH maxCount:1`, OR filter | `maxCount:2`, A/B各1群 | 一致 |
| `WX04-001-E2` | ＜アーム＞または＜ウェポン＞を合計2枚 | `discardGroups`で各1枚強制 | `discard:2`＋クラスOR filter | 一致 |
| `WX05-023-BURST` | スペル1枚と＜原子＞1枚 | 原子1枚だけ回収 | `TRANSFER_TO_HAND count:2`＋2群 | 一致 |
| `WX06-002-E1` | センタールリグ1体とシグニ1体 | `CENTER_LRIG_OR_SIGNI count:2` | cardType別2群 | 一致 |
| `WX10-001-E3` | ＜アーム＞と＜ウェポン＞を1枚ずつ | 両クラスから合計1枚 | `SEARCH maxCount:2`＋2群 | 不一致あり（別軸） |
| `WX10-041-E1` | ＜アーム＞1枚と＜ウェポン＞1枚 | 公開2枚から合計1枚 | `LOOK_PICK_CHAIN` 2stage、全stage結果を集計 | 一致 |
| `WX11-027-BURST` | ＜鉱石＞1枚と＜宝石＞1枚 | 合計1枚回収 | `TRANSFER_TO_HAND count:2`＋2群 | 一致 |
| `WX11-052-E2` | 《サーバント X》1枚と《Y》1枚 | Xだけ探索 | 名前別2群、計2枚を場へ | 一致 |
| `WX12-Re07-E1` | シグニ1枚とスペル1枚 | 合計1枚回収 | cardType別2群 | 不一致あり（別軸） |
| `WX14-062-E1` | シグニ1枚とスペル1枚 | スペル欠落 | `SEARCH maxCount:2`＋2群 | 一致 |
| `WX14-CB02-BURST` | 《暁月》1枚と《燦》1枚 | 《暁月》だけ探索 | 名前別2群 | 一致 |
| `WXEX1-01-E3` | ＜アーム＞1枚と＜ウェポン＞1枚 | OR候補から合計1枚 | `SEARCH maxCount:2`＋2群 | 一致 |
| `WXEX1-38-BURST` | ＜電機＞1枚とスペル1枚 | スペル欠落 | cardType／クラス別2群 | 一致 |
| `WXEX1-53-E2` | ＜アーム＞1枚と＜ウェポン＞1枚 | 合計1枚、後段条件が`IS_MY_TURN` | 2群、1回shuffle、処理2枚で後段発火 | 一致 |
| `WXEX2-14-E1` | ＜原子＞1枚とスペル1枚 | 合計1枚回収 | 2群、計2枚回収 | 一致 |
| `WXEX2-43-E3` | レベルの異なる対象を合計2枚 | `distinct:'level'`, `maxCount:1` | 既存distinctを保ち`maxCount:2` | 一致 |
| `WXDi-P10-007-E2` | シグニ1枚とスペル1枚を捨てる | 起動コスト欠落 | 手札discard 2群／計2枚 | 一致 |
| `WX25-P2-047-E1` | ルリグ1体とシグニ1体 | 合計2体でタイプ配分なし | cardType別2群 | 一致 |
| `WX25-P3-002-E1` | ルリグ1体とシグニ1体 | 合計2体でタイプ配分なし | cardType別2群 | 一致 |
| `WXK01-003-E3` | センタールリグ1体とシグニ1体 | 合計2体でタイプ配分なし | cardType別2群 | 一致 |
| `WXK11-006-E1` | センタールリグ1体とシグニ1体 | 合計2体でタイプ配分なし | 引用内GRANT対象へcardType別2群 | 不一致あり（別軸） |
| `WDA-F03-13-BURST` | カード1枚と【マルチエナ】1枚 | 無条件1枚だけ | 無条件群1＋keyword群1、重複割当なし | 一致 |
| `PR-322-E1` | 黒の＜天使＞1枚と黒の＜古代兵器＞1枚 | 無条件シグニ1枚、後段`IS_MY_TURN` | 黒＋クラス別2群、処理2枚で後段発火 | 一致 |

`WX05-023` はE3の既存手修正を壊さないよう、card単位adopt後にE3をHEADどおり温存した。`WX11-027` はE1がMANUALのため `syncManualLive.ts WX11-027` を使い、E1不変を確認してBURSTだけ同期した。

## 4. 据置

- `WXDi-P12-039-E1`: 2群目filterが1枚目との共通色に依存する。固定groupsでは評価できないため据置。
- `WXDi-D01-011-E1`: レベル1/2/3別で第39バッチと重なる。既存 `LOOK_AND_REORDER` のまま据置。
- `WX13-012-E1`: クロス条件から群数が動的に決まる。固定groupsでは表せないため据置。
- 上記母集団の残23節: ライズ／アクセ／レベル／色／複数名／各プレイヤー／非公開選択など別軸、またはSTUB。今回の一般規則を広げていない。
- `WXEX2-43-E3`: これは既存 `SelectionConstraint.distinct:'level'` で足り、枚数だけ2へ直せたため採用した。

据置3効果はgoldenで現在のaction型を固定し、今回のgroups変換に入らないことを確認した。

## 5. engine配線

- `canAssignSelectionGroups`（新規）
- `satisfiesSelectionConstraint`
- `execSearch`
- `execTrash`
- `execGrantKeyword`
- `execLookPickChain`
- `resumeSelectTarget`

`execSearch` は群filterも実行時に動的解決する。`execTrash`／`execGrantKeyword` は従来executorへ届いていなかった `selectionConstraint` を対話へ渡した。`execLookPickChain` は完了stageの選択を `_picked` に集約する。`resumeSelectTarget` は複数枚の `TRANSFER_TO_DECK` を全移動後に1回だけshuffleし、`lastProcessedCards`を集合全体にする。

## 6. golden

追加したテストは次の7件（2618→2625）。

1. `段2 第38バッチ parser契約: 各群1枚・合計2枚・逆向きORを区別する`
2. `段2 第38バッチ engine両方向: SEARCHは各群1枚ずつ計2枚を取り、片群0枚なら他方1枚で停止`
3. `段2 第38バッチ engine負方向: overlapping群は1枚を二重計上せず必須群へ割り当てる`
4. `段2 第38バッチ E2E: LOOK_PICK_CHAINは2群合計を保持し、片群0でも空振り扱いにしない`
5. `段2 第38バッチ engine両方向: デッキ戻し2群は1回だけシャッフルし、片群不足では後段を発火しない`
6. `段2 第38バッチ engine両方向: CENTER_LRIG_OR_SIGNIは各カードタイプ1体ずつだけ選べる`
7. `段2 第38バッチ 据置契約: 依存filter・レベル別場出し・動的クロスは既存木のまま`

成立方向（A/B各1、通常＋マルチ、ルリグ＋シグニ）と不成立方向（同群2枚、通常2枚、シグニ2体）、片群候補0、後段条件の成立／不成立を対照で固定した。既存「続き376d」PR-322トリップワイヤは削除せず、元の目的どおり `source.filter` への片側story誤配線だけを見るよう走査範囲を明確化した。機械差分では既存goldenの変更はこの1ブロックだけで、他は第38バッチ7テストの追加だけだった。

## 7. held / partial / idset

| 計器 | before | after | キー増減 |
|---|---:|---:|---|
| `docs/_held_fresh.json` | 83 | 83 | 追加0 / 削除0 |
| `docs/_partial_fresh.json` | 15 | 15 | 追加0 / 削除0 |
| `docs/_idset_fresh.json` | 46 | 46 | 追加0 / 削除0 |

heldのキー集合は不変。ただし既存heldキー `WX05-023` のfresh payloadは、採用したBURSTが「原子1枚」から「スペル1＋原子1」のgroupsへ変わった。E3のfresh側に既存手修正差が残るためカード自体はheld 1件のままである。増分キーはないため追加照合対象は0件。

## 8. 条件外の不一致

- `WX10-001-E3`: 「白と赤のカード」をエクシードコストに使う限定は未実装。該当findingは `WX10-001-E3 :: ＜アーム＞と＜ウェポン＞` のみ閉じ、コストfindingをOPENに残した。
- `WX12-Re07-E1`: 色選択に応じる後半が `[STUB:動的パワー修正（COUNT依存）]` と無条件BANISH/DRAWに崩れている。今回の回収2群とは別機構のため未修正。
- `WXK11-006-E1`: 引用能力の後半に、相手が自分のトラッシュから選ぶ所有者／ゾーン等の既存不一致がある。今回の付与対象2群だけ採用した。
- `WX05-023-E3`: freshには既存liveの `thisCardOnly` 手修正差があり、意図的に温存した。

## 9. 台帳

採用effectIdを `findings.jsonl` で実検索し、quoteを確認して `stage2_closed.txt` 末尾へ追記した。`WX10-001-E3` だけquote前方一致形式、他のfinding持ちは全finding修正済みなのでID単独。findings外の同規則採用5効果もIDとコメントを記録した。

台帳は段2消化292→312（20 finding記帳）、段0機械除去226→224、残OPEN 813→795。`WX06-002-E1` と `WXK01-003-E3` の2 findingが段0扱いから段2へ再分類されたため、OPENの純減は18である。

## 10. ゲート before / after

| 計器 | before | after |
|---|---:|---:|
| golden | 2618 PASS / 0 FAIL | 2625 PASS / 0 FAIL |
| census | 621 / baseline 621 | 617 / baseline 617 |
| smoke | 10693、全異常0、SKIP 0 | 10693、全異常0、SKIP 0 |
| fuzz | 全0 | 全0（200ゲーム） |
| `groupSimilar --all` | 同型★0 | 同型★0 |
| `census:stubs` | A群0 / C群0 | A群0 / C群0 |
| manual-fields | 0 | 0 |
| lint | 0 errors / 261 warnings | 0 errors / 261 warnings |
| held / partial / idset | 83 / 15 / 46 | 83 / 15 / 46 |
| semantic OPEN | 813 | 795 |

`npm run regen` 実行後、`npm run gates` はtypecheck / golden / smoke / fuzz / census / census-stubs / manual-fields / lintの全項目が緑。census純減4に合わせ `scripts/vocabCensus.ts` の `BASELINE_HIGH` を617へ更新した（PLANは編集していない）。

## 11. エンコーディング検査

`git diff --name-only` の全変更ファイルをHEAD版と比較し、`U+FFFD`、3文字以上連続の `?`、先頭BOM (`efbbbf`) の新規増加はいずれも0。`git diff --check` もエラー0。CSV走査は全シートで先頭BOMを剥がしてから列を解釈した。
