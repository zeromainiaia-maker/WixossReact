# 段2 第46バッチ報告：種類数（distinct count）条件

## 1. 結論

着手時 SHA は `ed2a772f3`。群C再測は **83効果 / RECVなし13効果**で、Claudeの13件はスクリプト母集団として再現した。ただし「合計5種類ある」の `WXDi-CP01-031-E1` は母集団regex外なので、依頼表の実スコープは **14効果**だった。

14効果を原文・live・実行器まで照合し、既存語彙だけで完成する **9効果を採用**、専用実行器済み **1効果を偽陽性**、新機構またはCONTINUOUSの2閾値分岐が必要な **4効果を据置**とした。新しい条件type、カード固有表、force-adoptは0。live A/Bの変化は採用9 effectIdだけで outlier 0。

## 2. 着手時ベースライン

`git log --oneline -3`：

```text
ed2a772f3 段2 第45バッチ：トラッシュ／エナゾーンの存在・枚数条件を配線
da1fd9b61 段2 第44バッチ：場の存在・体数条件を配線
7827b5ea0 段2 第43バッチ：ターン内履歴条件を復元
```

着手時 `npm run gates` は全緑。golden **2749/0**、census **582 / baseline 582**、census:stubs A無言/C **0/0**、manual-fields **0/0**、smoke **10693効果・全0**、fuzz **全0**、lint **0 errors / 260 warnings**。`groupSimilar --all` は **5986カード / 265グループ / ★0**、held **76枚 / 31署名群**、台帳 **221 / 111 / 428 / 684**。

## 3. 母集団と表現揺れ

`node tmp_popCond.mjs` は A **587/23**、B **275/29**、C **83/13**。Cの83効果中70効果は `ENERGY_COLOR_TYPES`、`FIELD_LRIG_COLOR_COUNT`、`HAS_CARD_IN_FIELD`、`TRASH_HAS_CARD`、`ENERGY_COUNT_FILTER` 等の既存受け皿を既に持ち、liveを変更していない。

一次情報のCSVはBOMを除去して **6712カード**（`build:effects` の全Sheet合計とも一致）。確認した揺れは次のとおり。

- `N種類以上`、`合計N種類以上`、`合計N種類ある`
- `それぞれ名前の異なる〜がN体`、`名前の異なる〜がN枚以上`
- `カード名に《X》を含む〜がN種類以上`
- `共通するクラスを持つ〜がN種類以上`
- 同一効果内で主語が省略される2段目の `15種類以上あるかぎり`

確定worklistは、採用9件（後掲）、据置4件、偽陽性1件。偽陽性は `WXK05-029-E1` で、条件nodeは無いが `collectAllColorSigni` が原文のカード名包含と `N種類以上` を直接読み、CardNameのSetを閾値比較していた。一般条件は二重に載せていない。

## 4. Claude見立ての検証

見立ては正しかった。`ActiveCondition.TRASH_HAS_CARD` に `distinctName` が無く、`Condition` 側だけにあった。さらに実コードでは次の追加穴も確認した。

- `checkActiveCondition` の `TRASH_HAS_CARD` は既存 `distinctClasses` すら読まず、単純枚数だけを数えていた。
- `ENERGY_COUNT_FILTER` は `Condition` 側だけで、`ActiveCondition` unionと `checkActiveCondition` に無かった。
- `evalConditionForContinuous` の `TRASH_HAS_CARD` / `HAS_CARD_IN_FIELD` もdistinctの一部を読んでいなかった。
- owner `any` の `HAS_CARD_IN_FIELD` は従来selfへ倒れ、両者の場を合算していなかった。

したがって、型宣言だけでなく `checkActiveCondition`、`evalCondition`、`evalConditionForContinuous` を同じ数え方へ揃え、`ACTIVE_CONDITION_TYPES` とgoldenを同時更新した。

## 5. 採用9効果

| effectId | 原文条件節 | 生成条件JSON | 逆翻訳全体 | 判定・消費地点 |
|---|---|---|---|---|
| `WX12-Re14-E1` | トラッシュに＜原子＞のシグニが7種類以上 | `activeCondition: {type:"TRASH_HAS_CARD", owner:"self", filter:{cardType:"シグニ",story:"原子"}, minCount:7, distinctName:true}` | `【常】《あなたのトラッシュにそれぞれ名前の異なる＜原子＞のシグニが7種類以上あるかぎり》このシグニの基本パワーを15000にする` | 意味一致。`checkActiveCondition` → `calcFieldPowers` |
| `WXEX2-65-E1` | トラッシュに＜原子＞のシグニが7種類以上 | 同上 | `【常】《あなたのトラッシュにそれぞれ名前の異なる＜原子＞のシグニが7種類以上あるかぎり》このシグニのパワーを＋5000する` | 意味一致。`checkActiveCondition` → `calcFieldPowers` |
| `WXK10-047-E1` | エナに共通するクラスを持つシグニが5種類以上 | `activeCondition: {type:"ENERGY_COUNT_FILTER",owner:"self",filter:{cardType:"シグニ"},distinctClasses:true,operator:"gte",value:5}` | `【常】《あなたのエナゾーンにあるシグニが持つクラスが合計5種類以上であるかぎり》このシグニのパワーを＋4000する` | 指定された既存フィールドどおり意味一致。`checkActiveCondition` → `calcFieldPowers` |
| `WXDi-P02-004-E1` | 【使用条件】トラッシュに＜天使＞が7種類以上 | `condition: {type:"TRASH_HAS_CARD",owner:"self",filter:{cardType:"シグニ",story:"天使"},minCount:7,distinctName:true}` | `【起】（メイン起動）：〈《無×3》〉あなたのトラッシュにそれぞれ名前の異なる＜天使＞のシグニが7種類以上ある場合、対戦相手のシグニ1体をトラッシュに置く。そしてカードを2枚引く` | 意味一致。`evalUseCondition` → `evalCondition`。fresh採用で既存の誤った対象＜天使＞限定も原文どおり除去 |
| `WXDi-D06-015-E1` | このコストで置いたカードの色が合計3種類以上 | `CONDITIONAL{condition:{type:"COST_TRASHED_MATCHES",filter:{},minCount:3,distinctColors:true},then:BANISH}` | `【自】このシグニが場に出たとき：〈《無×1》《無×1》《無×1》〉この方法でトラッシュに置いたカードが持つ色が合計3種類以上あるなら、対戦相手のパワー12000以上のシグニ1体をバニッシュする` | 「コスト」→「方法」の語形差だけで意味一致。`executeAction` → `evalCondition`（`last_cost_trashed_cards`） |
| `WXDi-P04-071-E1` | この方法で置いたカードの色が合計3種類以上 | 同じ `COST_TRASHED_MATCHES{distinctColors}` | `【自】このシグニが場に出たとき：〈エナゾーンから＜天使＞のカード3枚をトラッシュに置く〉この方法でトラッシュに置いたカードが持つ色が合計3種類以上あるなら、あなたの＜天使＞のシグニ1体に【ランサー】を与える（ターン終了時まで）` | 意味一致。`executeAction` → `evalCondition` |
| `WXK11-063-E2` | エナのカードが持つ色が合計3種類以上なら追加で捨てる | 第2stepだけ `CONDITIONAL{condition:{type:"ENERGY_COUNT_FILTER",owner:"self",filter:{},distinctColor:true,operator:"gte",value:3},then:TRASH}` | `【自】対戦相手のターン終了時：カードを1枚引く。そしてあなたのエナゾーンにあるカードの色が3種類以上なら、対戦相手の手札を1枚トラッシュに置く（相手が選ぶ）` | 無条件ドローを外へ維持して意味一致。`executeAction` → `evalCondition` |
| `WXDi-P03-042-E1` | 自場の色が3種類以上かつこのシグニがアップ | `AND[{type:"HAS_CARD_IN_FIELD",owner:"self",filter:{cardType:"シグニ"},minCount:3,distinctColors:true},{type:"THIS_CARD_IS_UP"}]` を任意コストstepへ付与 | `【自】アタックフェイズ開始時：他のシグニ1体を対象とする。そして場の色が合計3種類以上あるかつこのシグニがアップ状態なら、《緑》《無》を支払ってもよい。そうした場合、それは【ランサー】を得る` | 接続助詞の機械文差だけで意味一致。既存 `IS_MY_TURN`（「そうした場合」の実行器マーカー）を削除せず維持。`executeAction` → `evalCondition` |
| `WXK11-021-E2` | 両者の場のシグニのレベルが合計3種類以上 | `CONDITIONAL{condition:{type:"HAS_CARD_IN_FIELD",owner:"any",filter:{cardType:"シグニ"},minCount:3,distinctLevels:true,distinctPhraseJa:"kinds"},then:BANISH}` | `【自】このシグニがアタックしたとき：場にあるシグニが持つレベルが合計3種類以上あるなら、対戦相手のシグニ1体をバニッシュする` | 意味一致。`owner:any` を両者盤面合算として `evalCondition` が消費。MANUAL兄弟を持つカードなので `_partial_fresh` からAUTO効果単位採用 |

## 6. 見送った全効果と偽陽性

- `WXEX1-40-E1`：10種類で相手シグニ耐性、15種類で相手ルリグ耐性という **2閾値・2帰結**。1本のtop-level activeConditionでは表せず、`collectEffectImmuneSigni` は `CONDITIONAL` 内の保護を収集しない。必要機構はCONTINUOUSの帰結別条件をcollectorが評価する経路。
- `WXDi-CP01-031-E1`：場＋エナの＜世怜音女学院＞を **CardNameで重複排除して2ゾーン合算**する受け皿が無い。指示どおり新型を作らず据置。
- `WXDi-P11-003-E1`：`FIELD_LRIG_COLOR_COUNT` の使用条件自体はfreshに出るが、「このゲームの間、各メインフェイズ開始時に3択から未選択の1つを得る」持続・再選択不可機構が無い。条件だけ採用すると壊れた即時3択を正当化するため、効果全体を据置。
- `WXDi-P15-003-E1`：【ドリームチーム】条件だけでなく、ゲート設置後にゲーム中持続する2能力の付与・使用可否経路が必要。現行はMANUALの `PLACE_OWN_GATE` と恒久付与を別経路で扱うため、E1へ条件だけ足しても使用条件にならない。
- `WXK05-029-E1`：偽陽性。`collectAllColorSigni` がカード名《サーバント》包含と10種類閾値を直接評価済み。一般 `TRASH_HAS_CARD` は重ねていない。

PLANは編集していない。`WXDi-CP01-031-E1` はPLAN §5.3向け候補として報告のみ。

## 7. 条件以外の食い違い

**1件**。`WXDi-P02-004-E1` の旧liveは、使用条件の＜天使＞を帰結の対象へ誤流用し「相手の＜天使＞だけをトラッシュ」にしていた。カード単位fresh採用により、原文どおり「対戦相手のシグニ1体」へ同時是正された。別findingのquoteは今回の台帳へ書かずOPENのままにした。

## 8. ゲート比較

| 計器 | 着手時 | 第46バッチ後 |
|---|---:|---:|
| `npm run gates` | 全緑 | 全緑 |
| golden | 2749 / 0 | **2756 / 0** |
| census | 582 / baseline 582 | **576 / baseline 576** |
| census:stubs A無言 / C | 0 / 0 | **0 / 0** |
| manual-fields | 0 / 0 | **0 / 0** |
| smoke | 10693・全0 | **10693・全0** |
| fuzz | 全0 | **全0** |
| lint | 0 errors / 260 warnings | **0 / 260** |
| groupSimilar | 5986 / 265 / ★0 | **5986 / 265 / ★0** |
| census:goldentypes | 未カバー0 | **147/147・未カバー0** |

`BASELINE_HIGH` は実測改善に合わせ **582→576**。PLANは編集していない。

## 9. live A/Bとheld

着手時snapshotと最終liveのeffectId単位deep compare：

```text
changed 9
WX12-Re14-E1
WXDi-D06-015-E1
WXDi-P02-004-E1
WXDi-P03-042-E1
WXDi-P04-071-E1
WXEX2-65-E1
WXK10-047-E1
WXK11-021-E2
WXK11-063-E2
outliers 0
missing 0
```

heldは **76枚/31署名群 → 77枚/32署名群**。増加1枚は表外 `WXDi-P03-031`。原文の「エナ色3種類以上」は既にliveの `ENERGY_COLOR_TYPES` で正しく表現済みだが、一般化した `カードが持つ色が合計N種類以上` がfreshではaction `CONDITIONAL{ENERGY_COUNT_FILTER}` としても現れ、同値な構造移動がheldになった。scope外なので不採用、live不変。

## 10. 台帳

findingsのquoteを実際に照合し、条件finding 6本だけを追記した。

```text
段0 221 → 221
段1 111 → 111
段2 428 → 434
OPEN 684 → 678
```

findingsに無い標本外3件（`WXK11-021-E2`, `WXK11-063-E2`, `WXDi-P03-042-E1`）は台帳へ書いていない。`WXDi-P02-004-E1` の対象findingも別軸なので閉じていない。

## 11. goldenの負方向

`scripts/goldenTest.ts` の「段2 第46バッチ」節で以下を固定した。

- トラッシュCardName：7種成立 / 6種不成立 / 0枚不成立 / **同名7枚不成立**
- エナクラス：5種 / 4種 / 0枚 / 同一クラス5枚
- コスト支払い色：3色 / 2色 / 0枚 / 同色3枚
- 両者の場のレベル：3種 / 2種 / 0体 / 同レベル3体
- エナ色：3色 / 2色 / 0枚 / 同色3枚
- P03のAND：3色＋アップ成立 / ダウン不成立 / 2色不成立

「同名N枚≠N種類」の主goldenは `段2 第46バッチ TRASH distinctName: 7種／6種／0枚／同名7枚をActive・Condition両経路で固定`。

## 12. 第44・45バッチから写した判定式

- `zoneNameContainsM` は第44/45の1本を拡張し、場／トラッシュ別にregexを増殖させず、種類数captureだけを足した。
- `HAS_CARD_IN_FIELD` の候補収集、CardName Set、色Setは第44の式を両評価器へ揃えた。
- `TRASH_HAS_CARD` のfilter一致候補収集は第45の式を保ち、最後の集計だけ `distinctName` / `distinctClasses` へ分岐した。
- `COST_TRASHED_MATCHES` は第45で確認した `last_cost_trashed_cards` をそのまま使い、色Setへ替えた。
- 写せなかったのは `WXDi-D06/P04` の支払いカード色（現在ゾーンではなく履歴）、`WXDi-CP01-031` の2ゾーン合算、`WXEX1-40` の帰結別2閾値。前者だけ既存履歴へ配線し、後2者は据置。

## 13. 触ったファイル

- `src/types/effects.ts`：Active側の不足フィールド・既存型対称化、`COST_TRASHED_MATCHES.distinctColors`。
- `src/engine/effectEngine.ts`：`checkActiveCondition` とCONTINUOUS補助評価器のdistinct集計、owner any。
- `src/engine/execUtils.ts`：通常Conditionのowner anyと支払い色種類数。
- `src/data/effectParser.ts`：既存条件持ち上げ表と使用条件入口へ文型を追加。ALL_COLOR専用実行器は構造guardで除外。
- `scripts/decompileEffects.ts`：支払い色種類数とレベル種類数の日本語化。
- `scripts/goldenTest.ts`：構造・成立・不成立・同名重複golden。
- `scripts/vocabCensus.ts`：改善実測576へbaseline同期。
- `public/data/effects_WX*.json` 3枚：採用9効果のlive JSON。
- `docs/decompile_sheet*.txt`, `_vocab_census.txt`, `_held_*`, `_census_stubs.txt`, `grouped_sentence_all.txt`：既定コマンドによる再生成物。
- `scripts/archive/.../stage2_closed.txt`：quote一致6findingの台帳。
- `docs/BUGFIXES.md` と本報告：修正記録。

## 14. エンコーディングと差分形状

tracked差分21ファイルと本報告を対象に、追加行の `U+FFFD`、3文字以上連続する疑問符、各ファイル先頭のUTF-8 BOMをbyte走査し、すべて **新規0**。`git diff --check` も空白エラー0（既存のLF→CRLF予告だけ）。本報告は `wc -c` **15972 bytes**で、UTF-8として先頭・末尾を再読済み。

`git diff --numstat` の削除は既存行の置換とregen生成物だけ。live JSONはeffectId deep compareで採用9件以外0、parserの既存一般規則は `zoneNameContainsM` と色種類数regexの置換行だけで、カード固有の削除は0。したがって「既存を触っていない」は追加行の自己申告ではなく、live A/Bの `changed 9 / outlier 0 / missing 0` で固定した。

## 15. やらなかったこと

- ブラウザ実機検証、ネットワーク利用、commit、pushはしていない。
- `docs/PLAN.md` / `docs/PLAN_PROGRESS.md` は編集していない。
- 群A・群B、表外live効果、新条件type、force-adopt、カード固有parser表には手を出していない。
- `WXEX1-40-E1`, `WXDi-CP01-031-E1`, `WXDi-P11-003-E1`, `WXDi-P15-003-E1` は条件だけの部分採用をしていない。
