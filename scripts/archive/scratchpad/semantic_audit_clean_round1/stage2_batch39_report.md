# 段2 第39バッチ レポート：レベル条件（静的上限／参照値比較／合計）

- 実施日: 2026-08-23
- 基準 HEAD: `9f2ff76d8`
- 方針: CSV 原文を1効果ずつ確認し、既存のレベル filter／選択制約／条件評価を優先して配線した。commit / push、`PLAN.md` / `PLAN_PROGRESS.md` の編集はしていない。

## 1. 母集団の数え直し

`tmp_stage2_batch39_scan.mts` で `public/data/CardData_Sheet*.csv` を直接走査した。各 CSV の先頭 BOM を `replace(/^\uFEFF/, '')` で除去し、カード全文ではなく効果ブロック単位で重複を除いた。

| 粗い文型 | CSV 該当効果 | 既存機構を正しく使用 | 粗い未実装候補 |
|---|---:|---:|---:|
| 静的レベル（`レベルN...`） | 710 | 569 | 141 |
| 参照値比較 | 17 | 2 | 15 |
| レベル合計 | 53 | 43 | 10 |
| 重複除外 union | 777 | 611 | 166 |

引き算では `filter.level` / `levelRange`、既存の動的レベルキー12種、`SelectionConstraint.totalLevelExact/ExactRef/Max`、`FIELD_LEVEL_SUM` / `LAST_PROCESSED_LEVEL_SUM` を live JSON から列挙した。粗い未実装候補166件には引用能力、対象条件でない条件節などが残るため、その数を修正件数とは扱っていない。今回の OPEN スコープは A 7効果、B 9効果、C 5効果の計21効果。結果は採用17、既実装の偽陽性2、機構不足による据置2。同じ一般規則で母集団外8効果も変化し、全件を原文照合して採用した。

`matchesFilter` は `level` と `levelRange` の双方を評価する。このため `WXDi-D02-07LT-E1` の `levelRange.max:2` は有効で、claim は偽陽性だった。

## 2. per-effect 採用表

「逆翻訳一致」は変更後の逆翻訳全体を CSV 原文と照合した結果。`△` は live JSON / engine は一致するが、decompiler が新しい動的 filter または選択制約をまだ表示しないもの。

| effectId | 原文の該当句 | 修正前 JSON の要点 | 修正後 JSON の要点 | 逆翻訳一致 |
|---|---|---|---|---|
| `SP27-017-E1` | レベル４以下の＜天使＞ | trash source にクラスのみ | `filter.level.max:4` | ○ |
| `WXK01-066-E1` | レベル３以下のシグニ | `POWER_SET` 対象に上限なし | `target.filter.level.max:3` | ○ |
| `WX16-053-LAYER-E1` | レベル２以下のシグニの効果を受けない | `sourceFilter` にレベルなし | `sourceFilter.level.max:2` | ○ |
| `WXDi-P04-048-E1` | シャドウ（レベル３） | `levelLte:3` | `levelEq:3` | ○ |
| `WXDi-P08-049-E1` | レベル２のシグニ | `levelLte:2` | `levelEq:2` | ○ |
| `WX20-Re19-E1` | センタールリグのレベル以下 | 上限なし | `levelLteLrig:'self'` | △（動的filter非表示） |
| `WXEX2-63-E1` | センタールリグのレベル以下 | 上限なし | `levelLteLrig:'self'` | △（同上） |
| `WX24-P4-038-sub-E2` | このルリグと同じレベル | 制限なし | `levelEqSelf:true` | △（同上） |
| `WD22-011-G-E1` | レベルがあなたの手札の枚数以下 | 選択肢③に制限なし | `levelLteHandCount:true` | △（同上。別findingは据置） |
| `WX24-P3-048-E1` | この方法でダウンしたシグニの数以下 | ダウン1体固定、戻す対象に制限なし | ダウンを `ALL + upToCount`、戻す対象へ `levelLteLastProcessedCount` | ○ |
| `WXDi-P10-043-E1` | このシグニの下にあるカードの枚数以下 | 制限なし | `levelLteUnderSelfCount:true` | △（動的filter非表示） |
| `WXEX2-57-E1` | 対象の自分のシグニと同じレベル | 相手シグニだけを選択 | 自分の緑＜美巧＞を先に選び、相手へ `levelEqLastProcessed:true` | ○ |
| `WX22-Re06-E1` | 合計3/6/9/12以上 | 後段6/9/12が無条件、途中 action で参照も上書き | 初回結果を退避し、全4枝を `LAST_PROCESSED_LEVEL_SUM gte` | ○（色filterも維持） |
| `WX12-Re02-E1` | 合計が置いたシグニの数以下 | 1体固定、合計上限なし | 両対象を任意複数化し `totalLevelMaxRef:last_processed_count` | △（選択制約非表示） |
| `WX17-026-E2` | 合計が下から落としたレベル合計と等しく | 相手1体固定、合計一致なし | `ALL + upToCount + totalLevelExactRef:last_processed_level_sum` | △（同上） |
| `WXDi-P02-003-E1` | 合計が捨てられたシグニのレベル合計と等しく | 回収上限だけ | trash source に `totalLevelExactRef:last_processed_level_sum` | △（同上） |
| `WXEX2-62-E1` | 合計が７以上の場合 | 後段が無条件 | 初回結果を退避し、exact 7枝と gte 7枝を別条件化 | ○ |

同じ一般規則で直った効果（findings 母集団外を含む）：

| effectId | 原文の該当句 | 修正前 → 修正後 | 逆翻訳一致 |
|---|---|---|---|
| `WXDi-P09-043-E1` | シャドウ（レベル１）／（レベル２） | `levelLte` → 各 `levelEq` | ○ |
| `WXDi-P09-049-E1` | シャドウ（レベル１） | `levelLte` → `levelEq` | ○ |
| `WXDi-P13-058-E1` | シャドウ（レベル１）／（レベル２） | `levelLte` → 各 `levelEq` | ○ |
| `WXDi-CP01-034-E1` | シャドウ（レベル１） | `levelLte` → `levelEq` | ○ |
| `WXDi-CP02-067-E1` | シャドウ（レベル１） | `levelLte` → `levelEq` | ○ |
| `WXDi-CP02-067-E2` | シャドウ（レベル１） | `levelLte` → `levelEq` | ○ |
| `WXEX2-81-E3` | レベル４以下の＜天使＞ | クラスのみ → `level.max:4` | ○ |
| `WXK10-085-E1` | 合計が４の場合／６の場合 | 後段6が無条件 → 退避値に対する exact 4 / exact 6 | ○ |

live 差分で見える `WX16-053-LAYER` と `WX24-P4-038-E1` は上記 leaf effect を内包する親シリアライズ差分で、別効果の巻き込みではない。意味変更は25 leaf effect。

## 3. 据置・偽陽性

- `WD15-023-E1`（据置）: 原文は「その＜龍獣＞がバニッシュしたとき」に遅延発火し、その誘発元より**低い**レベルを参照する。live は赤1の即時起動効果で、誘発元参照を保持していない。`lte` を借りると向きも時点も誤るため据置。
- `WXDi-P03-077-BURST`（据置）: 原文は「レベル3以下のシグニによる、このターン中の全ダメージ」を防ぐ。live は `PREVENT_NEXT_DAMAGE count:1`。既存 damage scope は発生源レベルを運べず、レベルだけ追加しても「次の1回」の過小実行が残るため据置。
- `WXDi-D02-07LT-E1`（偽陽性）: `levelRange.max:2` は `matchesFilter` が消費済み。Lv2成立／Lv3不成立を golden で固定して台帳を閉じた。
- `WXEX2-01-E2`（偽陽性）: `BLOCK_ACTION actionId:'GUARD_LV_LAST_DOWNED'` をガード経路が消費し、直前にダウンしたシグニと同レベルだけを禁止済み。既存 O-41 と今回の契約テストで固定して台帳を閉じた。

## 4. engine 配線

- `resolveDynamicFilter`: `levelLteLrig` / `levelEqSelf` / `levelLteHandCount` / `levelLteUnderSelfCount` を静的 `level` へ解決。ルリグ・効果元不在は空ヒット、手札0枚／下カード0枚は `level.max=0` へ倒す。
- `selectOrInteract`: `totalLevelExactRef` / `totalLevelMaxRef` を pending/UI/CPU 選択前に静的制約へ解決。
- `resolveCountRef`: `last_processed_level_sum` を解決。
- `evalCondition`: `LAST_PROCESSED_LEVEL_SUM.source:'stored_targets'` を評価。
- `execBanish`: `count:'ALL' + upToCount` の BANISH にも `selectionConstraint` を渡す。
- 既存 collector 経路: `GRANT_PROTECTION.sourceFilter` は `collectEffectImmuneSigni` が `matchesFilter` で直接評価することを確認した。
- キーワード経路: `parseShadowKeyword` / `evaluateShadow` は exact `levelEq` を生成・評価するよう統一した。

型追加は上記消費地点と対になっており、死フラグはない。新しい action 型は作っていない。

## 5. golden

追加・更新したテストは次の7本。すべて成立／不成立の対照を同じ盤面条件で固定した。

1. `段2 第39バッチ parser契約: 採用17効果へ正しい向きのレベル条件を配線する`
2. `段2 第39バッチ 偽陽性契約: levelRange は有効、同レベルガード禁止は既実装`
3. `段2 第39バッチ held増分契約: 同じ文型で直る8効果も原文どおり採用する`
4. `段2 第39バッチ engine両方向: ルリグ／手札／下カード／直前処理の参照値で候補を限定し、参照不在は空ヒット`
5. `段2 第39バッチ engine両方向: 動的なレベル合計 exact/max を全選択経路で固定値へ解決する`
6. `段2 第39バッチ engine両方向: 多段レベル合計は退避元を読み、枝の副作用で参照が変わらない`
7. `段2 第39バッチ engine両方向: レベル一致シャドウとレベル上限つき効果耐性を厳密に評価する`

既存 C1 `$ref` トリップワイヤには、実コードで `resolveCountRef` 消費を確認した `SIGNI.totalLevelMaxRef` と `TRASH_CARD.totalLevelExactRef` だけを許可位置へ追加した。

## 6. held / partial / idset

| 計器 | before | 中間 | after |
|---|---:|---:|---:|
| held | 83 | 97 | 83 |
| partial | 15 | 15 | 15 |
| idset | 46 | 46 | 46 |

held 増分14カードは全件 CSV 原文と action 全体を照合して採用した。

- 第1増分8件: `WXDi-P04-048-E1` exact Lv3、`WXDi-P08-049-E1` exact Lv2、`WX24-P3-048-E1` ダウン実数以下、`WXEX2-57-E1` 先行対象と同レベル、`WX12-Re02-E1` 動的合計上限、`WX17-026-E2` 動的合計一致、`WX22-Re06-E1` 3/6/9/12以上、`WXEX2-62-E1` 7以上。
- 第2増分6カード: `WXDi-P09-043-E1`、`WXDi-P09-049-E1`、`WXDi-P13-058-E1`、`WXDi-CP01-034-E1`、`WXDi-CP02-067-E1/E2` の exact シャドウ、`WXK10-085-E1` の exact 4/6。
- `WXEX2-81-E3` など情報追加だけの差分は収穫マージが無損失として採用したが、同様に原文照合済み。

最終 `docs/_held_fresh.json` は83、`_partial_fresh.json` は15、`_idset_fresh.json` は46で基準値に復帰した。partial / idset 増分はない。

## 7. 条件外の不一致

- `WD22-011-G-E1`: 選択肢①の遅延誘発が即時 `POWER_MODIFY`、選択肢②の「そうした場合」が `IS_MY_TURN` のまま。今回閉じたのは手札枚数以下 finding だけ。
- `WXEX2-81-E2`: 原文は「自分の場の＜天使＞が持つ色の種類以下のレベル」の相手シグニだが、live は相手の＜天使＞を選ぶ。別軸なので変更していない。
- decompiler は今回追加した4動的 filter と `totalLevel*Ref` を表示しないため、表で `△` とした効果は JSON/engine が正しくても逆翻訳だけでは条件が見えない。
- `WD15-023-E1` と `WXDi-P03-077-BURST` は §3 の機構不足を残す。

## 8. ゲート before / after

| 計器 | before | after |
|---|---:|---:|
| golden | 2625 PASS / 0 FAIL | **2632 PASS / 0 FAIL** |
| census | 617 / baseline 617 | **611 / baseline 611** |
| smoke | 10693、異常0、SKIP0 | **10693、CRASH/HANG/INVARIANT 0、SKIP0** |
| fuzz | 全0 | **全0** |
| 同型★ | 0 | **0** |
| census:stubs | A群無言0 / C群0 | **A群無言0 / C群0** |
| check:manual-fields | 0 | **0** |
| lint | 0 errors / 261 warnings | **0 errors / 261 warnings** |
| held / partial / idset | 83 / 15 / 46 | **83 / 15 / 46** |

`npm run gates` は全緑。`WX22-Re06-E1` の live per-effect diff では既存 `filter.color:'黒'` を維持した。

台帳は段2消化312→337、残 OPEN 795→771（24減）。追加した20 effect 行のうち複数 finding を全閉じした効果があり、`WD22-011-G-E1` だけ実 quote 前方一致で1 finding を部分クローズした。

## 9. エンコーディング／差分検査

最終差分18ファイル（新規報告書を含む）を UTF-8 として走査した。U+FFFDは0→0、3文字以上連続の `?` は28→28（既存の `BUGFIXES.md` 内記録だけ）、先頭 BOM は0→0で、いずれも新規増0。`git diff --check` はエラー0。報告書は12274 bytesで、先頭／末尾を再読して内容を確認した。
