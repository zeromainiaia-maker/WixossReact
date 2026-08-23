# 段2 第33バッチ報告：対象フィルタの色指定

- 実施日: 2026-08-23
- 開始HEAD: `753e917cd`
- 方針: `findings.jsonl` の未closed findingsを母集団の正とし、CSV原文を1効果ずつ再照合した。
- commit / push: 実施していない。

## 1. 母集団の数え直し

`public/data/CardData_Sheet1.csv`～`Sheet10.csv` と `CardData_TK.csv` をUTF-8で直接走査した。全6712行を読み、各ファイルの採用行数は `974 / 929 / 879 / 633 / 360 / 135 / 880 / 866 / 883 / 127 / 46`。`CardData_Sheet8.csv` の先頭3byteが `efbbbf` であることを確認し、走査時に先頭BOMを除去した。

`[白青赤緑黒]の(シグニ|スペル|カード)` を含む効果ブロックは **466効果**。開始liveの機械区分は、action木に `color` があるもの342、action木には無いもの124（うちcost/activeCondition/triggerFilterだけに色があるもの81、色フィールド自体が無いもの43）だった。この区分だけで正誤は決めず、未closed findingsとCSV原文を照合した。

466効果から、既存 `TargetFilter.color`、コスト色、条件色、triggerFilter、別受け皿で原文を保持するもの、または今回の未closed findingに該当しないもの443効果を引いた。残り23効果は、今回採用した21効果と参考据置2効果。regex母集団外では、対象に色指定がないのに条件色が誤付着した `WX24-D2-11-E1` と、否定形「黒ではない」の `WXDi-P03-085-E1` を隣接findingとして加えた。したがって採用は **23効果**（指定16＋同じparser規則で見つかった7）、据置は2効果。

同規則で追加採用した7効果は `WX24-P4-029-E1`、`WX10-022-E1`、`WX12-016-E1`、`WX20-022-BURST`、`WX25-CP1-047-E1`、`WXK10-002-E1`、`WD18-007-E1`。全件CSV原文を個別確認した。

## 2. per-effect 採用表

| effectId | 原文の該当句 | 修正前JSONの要点 | 修正後JSONの要点 | 逆翻訳全体 |
|---|---|---|---|---|
| `WX22-Re06-E1` | あなたの黒のシグニを好きな数 | 最初の`TRASH.target.filter`に色なし | `color:'黒'` | 条件外不一致あり（後述） |
| `PR-K044-E3` | 赤か緑のシグニ／赤か緑のカード | 選択肢1=`緑`のみ、選択肢3=色なし | 両方`color:['赤','緑']` | 一致 |
| `WX24-P4-033-E1` | 青か黒のシグニ1体 | 選択肢2に色なし | `color:['青','黒']` | 一致 |
| `WX24-P4-031-E1` | 赤か緑のシグニ1体 | 選択肢2に色なし | `color:['赤','緑']` | 一致 |
| `WX24-P4-035-E1` | 対戦相手の白か緑のシグニ1体 | `owner:'any'`、色なし | `owner:'opponent'`、`color:['白','緑']` | 一致 |
| `WXK10-028-BURST` | 緑のシグニ1枚を手札に加えるか場に出す | 2選択肢ともsource色なし | 両sourceに`color:'緑'` | 一致 |
| `WXK09-058-E1` | レベル4の黒のシグニ1枚 | `level:4`のみ | `level:4,color:'黒'` | 一致 |
| `WX20-079-E1` | レベルの異なる黒のシグニ4枚 | distinct levelのみ | sourceに`color:'黒'`も追加 | 一致 |
| `WX10-038-E1` | あなたの赤のシグニすべて | `count:1`、色なし | `count:'ALL',color:'赤'` | 一致 |
| `WXK10-042-E1` | 青のシグニ2枚につき | `countFilter`に色なし | `countFilter.color:'青'` | 一致 |
| `WX25-CP1-088-E1` | それがレベル3の黒のシグニの場合、それをアップ | 無条件の`UP{self,count:1}` | `STORE_LAST_PROCESSED_TARGETS`→`LAST_PROCESSED_MATCHES{level:3,color:'黒'}`→`UP{targetsStored:true}` | 意味一致（文体差のみ） |
| `WX09-045-E1` | パワー15000以下（色指定なし） | 2つ目のBANISHに`color:'赤'` | 色を除去しpower上限だけ | 条件外不一致あり（後述） |
| `WX24-D2-11-E1` | パワー2000以下（色指定なし） | targetに`color:'赤'` | 色を除去、条件側の赤アーツだけ保持 | 一致 |
| `WXDi-P03-085-E1` | 黒ではない…すべて | 否定色なし | `colorExclude:'黒'` | 一致 |
| `WXDi-P09-069-E1` | 指定3名称か青のシグニ | `color:'青'`と`cardNames`が同一filterでAND | `anyOf:[{cardNames:[…]},{color:'青'}]` | 一致 |
| `WXDi-P08-061-E1` | 指定3名称か赤のシグニ | `color:'赤'`と`cardNames`がAND | `anyOf:[{cardNames:[…]},{color:'赤'}]` | 一致 |
| `WX24-P4-029-E1` | 白か青のシグニ1体 | `color:'青'`のみ | `color:['白','青']` | 一致 |
| `WX10-022-E1` | 白か黒のシグニを合計2枚まで | 選択肢3 sourceに色なし | `color:['白','黒']` | 条件外不一致あり（カード使用コスト、後述） |
| `WX12-016-E1` | 白か黒のシグニを合計2枚まで | sourceに色なし | `color:['白','黒']` | 一致 |
| `WX20-022-BURST` | 白か赤のシグニ1枚 | 手札／場の両sourceに色なし | 両方`color:['白','赤']` | 一致 |
| `WX25-CP1-047-E1` | 黒の＜ブルアカ＞のシグニ3枚まで | `story:'ブルアカ'`のみ | `story:'ブルアカ',color:'黒'` | JSON意味一致。逆翻訳器は動的枚数を0枚と表示（後述） |
| `WXK10-002-E1` | 白か黒のシグニを合計2枚まで | 選択肢5 sourceに色なし | `color:['白','黒']` | 一致 |
| `WD18-007-E1` | エナゾーンから緑のカード3枚まで | 最初のsourceに色なし | `color:'緑'` | 一致 |

live差分を開始HEADと効果単位で比較し、変更は上表の23 effectIdだけ。追加・削除・同カード別効果の巻き込みは0だった。

## 3. 据置

| effectId | 理由 |
|---|---|
| `WXEX2-51-E3` | 黒指定は既にsource filterへ載っている。欠落は「パワー12000以下」であり今回の色機構ではないため据置。goldenで`powerRange.max:12000`が未表現であることを固定した。 |
| `PR-322-E2` | トラッシュ枝の黒指定は既に正しい。欠落は「手札から黒のシグニを場に出す」選択肢そのもの。色だけを触らず据置し、`HAND_CARD`枝が未表現であることをgolden固定した。 |

途中で同じデッキ下ビルダーが `PR-322-E1` に色だけを足したが、原文は黒の＜天使＞1枚と黒の＜古代兵器＞1枚という別ピックで、freshはクラス・枚数を完全表現できない。全体不一致の部分採用を避けるため、複数クラス時は色も昇格しないガードを入れて開始liveへ戻した。最終live差分に `PR-322-E1` は無い。

## 4. 既存受け皿と消費地点

engineファイルは変更していない。既存の以下を実コードで確認して流用した。

- `TargetFilter.color: string|string[]`：`execUtils.matchesFilter` と `effectEngine.matchesFilter` の `Array.isArray` 分岐が配列をOR評価する。
- `TargetFilter.colorExclude`：上記2つの`matchesFilter`が静的値も直接評価する。
- `TargetFilter.anyOf`：上記2つの`matchesFilter`が子filterを再帰OR評価し、`resolveDynamicFilter`も子filterを再帰解決する。
- field／trash／energy／handの対象・source：各executorが`fieldCandidates`／`matchesFilter`を通す。
- `POWER_SET`：CONTINUOUS経路の`calcFieldPowers`がaction木から直接収集してfilterを評価する。
- `POWER_MODIFY_PER_TRASH_COUNT`：executorが`countFilter`を`matchesFilter`で評価する。
- `WX25-CP1-088-E1`：`execGrantEffect`の`lastProcessedCards`、`STORE_LAST_PROCESSED_TARGETS`、`LAST_PROCESSED_MATCHES`、`execUp`の`targetsStored`を直列利用する。

新しいaction型・型フィールド・死フラグは追加していない。

## 5. golden

開始 `2563 PASS / 0 FAIL` から **2588 PASS / 0 FAIL**。採用23効果に各1本のlive E2E、据置2件に各1本の非採用契約を追加した。

テスト名は `段2 第33バッチ E2E: <effectId> ...` を基本とし、`WX10-038-E1` は `collector E2E`、`WXDi-P08-061-E1`／`WXDi-P09-069-E1` は `anyOf E2E`、参考2件は `据置契約` とした。全採用効果で適合側の成立と、同じ盤面から色・レベル・パワー・名称の原因だけを外した不成立を対にして固定した。golden既存部は削除・置換0で、機械差分は `scripts/goldenTest.ts` **+200/-0、追加hunk 1個**。

## 6. held / partial / idset

| 計器 | before | after | 増減 |
|---|---:|---:|---:|
| `_held_fresh.json` | 86 | 83 | -3 |
| `_partial_fresh.json` | 15 | 15 | 0 |
| `_idset_fresh.json` | 46 | 46 | 0 |

build直後のheld増分は `WX09-045`、`WX10-038`、`WX24-P4-029`、`WX24-P4-035`、`WX25-CP1-088`、`PR-K044`。各カードで変更effectIdが1件だけであることとCSV原文を確認して採用した。`PR-322` は途中の部分採用を戻す過程で一時heldへ出たが、上記理由で開始liveへ復帰させた。

最終heldから減った3件は、既存heldにいた `WX24-D2-11`（条件色のtarget誤付着除去）、`WXDi-P08-061`（名称OR赤）、`WXDi-P09-069`（名称OR青）。全件今回の指定findingを原文照合して採用した。最終追加0。partial/idsetは追加・削除とも0。

## 7. 条件外の不一致

- `WX22-Re06-E1`：色は直ったが、原文のレベル合計6／9／12以上の段階条件がJSONでは後続DRAW／LIFE_CRASH／ADD_TO_FIELDに掛かっておらず、逆翻訳でも無条件の連続処理に見える。今回の色機構外なので据置。
- `WX09-045-E1`：赤限定の誤付着は除去したが、原文の「条件成立時は代わりに15000以下」を排他的置換として表さず、8000以下BANISHと15000以下BANISHの直列のまま。条件・置換機構の別findingとして据置。
- `WX10-022-E1`：対象色ORは一致したが、逆翻訳のカード使用コストはCSVの印字コストと一致しない。今回変更していない既存差分。
- `WX25-CP1-047-E1`：JSONは`countPerLastProcessed:2`で原文どおり実行されるが、逆翻訳器は「0枚トラッシュ」と表示する。decompilerの動的枚数表示の別問題。
- 参考2件 `WXEX2-51-E3`／`PR-322-E2` は据置表のとおり。

## 8. ゲート

| 計器 | before | after |
|---|---:|---:|
| golden | 2563 PASS / 0 FAIL | **2588 PASS / 0 FAIL** |
| census | 640 / BASELINE_HIGH 640 | **630 / BASELINE_HIGH 630** |
| smoke | 10693、異常全0、SKIP 0 | **10693、異常全0、SKIP 0** |
| fuzz | 全0 | **全0** |
| `groupSimilar --all` | 同型★0 | **同型★0** |
| `census:stubs` | A群0 / C群0 | **A群0 / C群0** |
| `check:manual-fields` | 0 | **0** |
| lint | 0 errors / 261 warnings | **0 errors / 261 warnings** |
| held / partial / idset | 86 / 15 / 46 | **83 / 15 / 46** |

`npm run regen` と `npm run gates` を実行し、全緑。census純減10に合わせて`BASELINE_HIGH`を630へ更新した。`groupSimilar.mjs --all` はregen内でも実行し、同型★0。

## 9. エンコーディング検査

日本語を書いた全ファイルを含む `git diff --name-only` 全件をUTF-8 byte列で再読し、開始HEADとの差分で `U+FFFD`、3文字以上連続の`?`、先頭BOMの新規増が0であることを確認した。CSV走査用の一時スクリプトもBOM除去を明示した。報告書はbyte数と先頭／末尾を再読して内容を確認した。

## 10. 既存ブロック不変の機械確認

- live JSONの開始HEAD比較：変更23 effectId、追加0、削除0、同カード別効果差分0。
- golden：`+200/-0`、既存test削除・置換0。
- parser差分は対象文型の既存関数内の追加配線と2つの後処理関数に限定。engine差分0。
- `git diff --check` で空白エラー0。
