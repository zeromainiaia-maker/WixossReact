# 段2 第36バッチ報告：ライフクロス枚数の比較条件

- 作業日: 2026-08-23
- 開始HEAD: `e50fab566`
- 採用: 7 effects（指定6 + CSV同規則1）
- 据置: 1 effect（比較以外の機構が必要）
- commit / push: 未実施

## 1. 母集団の数え直し

`public/data/CardData_Sheet1.csv`〜`Sheet10.csv` と `CardData_TK.csv` を直接読み、各ファイルの先頭 `U+FEFF` を剝がして `Papa.parse` した。読取りは 6712 rows / 6712 unique cards。BOM付きは `CardData_Sheet8.csv` だけだった。原文の主語と表記ゆれを含めて走査した結果は次のとおり。

| 表記 | 相対比較 | 固定N枚 |
|---|---:|---:|
| ライフクロス | 10節 | 19節 |
| ライフバースト | 0節 | 0節 |
| ライフ（単独語） | 0節 | 0節 |

相対比較10節の内訳:

- 既存機構で正しい: 3節。`WX06-028-E1` はトップレベル `condition:LIFE_COMPARE_OPP{lt}`、`SP38-002-E1` の前半と `WX25-P3-002-E1` は `src/screens/battle/costs.ts` のアーツ使用コスト減少経路で両方向golden済み。
- 今回採用: 6節。指定A群5効果 + 同規則の `WXK07-036-E1`。
- 据置: 1節。`SP38-002-E1` 後半の「ライフクロスが少ないかぎりクラッシュされない」は、live action 自体が `LIFE_CRASH{owner:'opponent'}` に退化しており、比較ゲートだけの修正では直らない。

固定N枚19節の内訳:

- 18節は修正前から該当actionに `LIFE_COUNT` が載っていた。
- 欠落は `WXDi-P09-072-E1` の主語省略後続枝「4枚の場合」1節だけで、`LIFE_COUNT{owner:'self',operator:'eq',value:4}` へ復元した。
- `LIFE_CRASHED_THIS_TURN` / `LIFE_CRASHED_LAST_TURN` / `POWER_MODIFY_PER_LIFE_COUNT` は同一カード内に現れる場合もあるが、クラッシュ履歴や比例数であり、今回の「残り枚数の比較節」を正しく表す例は0節。別軸として差し引いた。

## 2. 設計と実行経路

調査時点で `Condition` 側には既存 `LIFE_COMPARE_OPP` があったため、別の `LIFE_DIFF` は新設していない。既存の意味 `cmp(selfLife, op, opponentLife)` と完全互換な `cmp(selfLife - opponentLife, op, value ?? 0)` へ拡張し、同型を `ActiveCondition` にも追加した。`value` 省略の既存JSONは従来どおり0比較となる。`$ref` は使っていない。

配線した関数・テーブル:

- `src/engine/effectEngine.ts`: `checkActiveCondition`（CONTINUOUSの `activeCondition`）、`evalConditionForContinuous`（CONTINUOUS内actionの `Condition`）
- `src/engine/execUtils.ts`: `evalCondition`（AUTO / ACTIVATED の `Condition`）
- `src/types/effects.ts`: `ActiveCondition` / `Condition` の同型定義と `ACTIVE_CONDITION_TYPES`
- `src/data/effectParser.ts`: `parseActiveCondition`、`STATE_CONDITION_CLAUSES_V2`、`parseBareBranchCondition`、`isBatch1OnlyClause`
- `scripts/decompileEffects.ts`: `condJa`

対象別の消費経路:

- `WXK07-038-E1`, `WD06-009-E1`: CONTINUOUS `activeCondition` → `checkActiveCondition`。
- `WXDi-P16-046-E2`, `WXDi-P06-033-E1`, `WXK10-003-E1`, `WXDi-P09-072-E1`, `WXK07-036-E1`: action / choice の `Condition` → `evalCondition`。

## 3. per-effect 採用表

| effectId | 原文の該当句 | 修正前 JSON の要点 | 修正後 JSON の要点 | 逆翻訳全体が原文と一致 |
|---|---|---|---|---|
| `WXK07-038-E1` | ライフクロスが対戦相手より多いかぎり | `activeCondition=TURN_OWNER:self` のみ | `AND[TURN_OWNER:self,LIFE_COMPARE_OPP{gt,0}]` | 一致（+1000と対相手効果バニッシュ耐性の両方を同ゲート） |
| `WD06-009-E1` | 対戦相手より少ないかぎり | `activeCondition` なし | `LIFE_COMPARE_OPP{lt,0}` | 一致 |
| `WXDi-P16-046-E2` | ライフクロスの枚数が対戦相手より少ない場合 | `DOWN` が直接action | `CONDITIONAL{LIFE_COMPARE_OPP{lt,0}}→DOWN` | 一致 |
| `WXDi-P06-033-E1` | ライフクロスの枚数が同じ場合 | `DRAW` が直接action | `CONDITIONAL{LIFE_COMPARE_OPP{eq,0}}→DRAW` | 一致 |
| `WXK10-003-E1` | 自分のライフクロスが相手より2枚以上少ない場合 | 選択肢④にconditionなし | 選択肢④に `LIFE_COMPARE_OPP{lte,-2}` | **不一致あり**：選択肢④は一致。同効果の選択肢③の「場のシグニが2体以上少ない」が別軸で欠落 |
| `WXDi-P09-072-E1` | 4枚の場合、カードを1枚引く | 5枚のECだけconditional、4枚のDRAWは直接 | 後続枝を `LIFE_COUNT{self,eq,4}→DRAW` | 一致 |
| `WXK07-036-E1` | ライフクロスが対戦相手より多い場合、《赤》を支払ってもよい | `OPTIONAL_COST{赤}` を無条件提示 | `CONDITIONAL{LIFE_COMPARE_OPP{gt,0}}→OPTIONAL_COST` | 一致 |

7効果は全て `parseStatus:AUTO` のまま。修正前HEADとの live JSON 比較で、変更effectIdは上記7件だけ。同カード内の別効果、effect追加・削除、id集合変化は0。

## 4. 据置と条件外の不一致

- 指定6効果の据置は0。全て評価可能な形で採用した。
- `SP38-002-E1` 後半は据置。原文は自分のライフクロスのクラッシュ保護だが、liveは `LIFE_CRASH{owner:'opponent'}`。比較条件の追加では意味が回復しないため、他action機構が必要な別バッチに残した。findings側の今回OPEN母集団には載っていない。
- `WXK10-003-E1` の選択肢③は「自分の場のシグニ数が相手より2体以上少ない」が欠落したまま。ライフ比較と別軸なのでfindingは閉じず、台帳は選択肢④のquote前方一致だけを閉じた。

## 5. golden

追加したテスト名:

1. `段2 第36バッチ parser契約: 対象7効果はfresh木へLIFE_COMPARE_OPPまたはLIFE_COUNTを出す`
2. `段2 第36バッチ engine両方向: LIFE_COMPARE_OPPはself−opponentの符号付き差を両経路で評価`
3. `段2 第36バッチ E2E: WXK07-038-E1 は自ターンかつライフが多いときだけ+1000と対戦相手効果バニッシュ耐性`
4. `段2 第36バッチ E2E: WD06-009-E1 はライフが少ないときだけ自分の全シグニを+1000`
5. `段2 第36バッチ E2E: WXDi-P16-046-E2 はライフが少ないときだけ対戦相手のシグニをダウン`
6. `段2 第36バッチ E2E: WXDi-P06-033-E1 はライフが同じときだけ1枚引く`
7. `段2 第36バッチ E2E: WXK10-003-E1 の選択肢④はライフが2枚以上少ないときだけ選択可`
8. `段2 第36バッチ E2E: WXDi-P09-072-E1 はライフがちょうど4枚のときだけ1枚引く`
9. `段2 第36バッチ E2E: WXK07-036-E1 はライフが多いときだけ赤エナ支払いを提示し、支払うとバニッシュ`

全E2Eで同じ盤面の原因だけを外した成立／不成立対照を固定。特に `WXK10-003-E1` は `diff=-2` で選択肢④が選択可・クラッシュ実行、`diff=-1` で選択不可を対照した。既存goldenの本体ブロックは変更せず、追加型に合わせた `ActiveCondition` 型数の期待値1行だけを 52→53 へ更新したことを `git diff --unified=0 scripts/goldenTest.ts` で確認した。

## 6. held / partial / idset

| 計器 | 開始 | 中間 | 最終 | 増分の原文照合 |
|---|---:|---:|---:|---|
| `_held_fresh.json` | 83 | 88 | 83 | 下記5件を1件ずつ照合して採用 |
| `_partial_fresh.json` | 15 | 15 | 15 | 増減なし |
| `_idset_fresh.json` | 46 | 46 | 46 | 増減なし |

中間held増分5件:

- `WXDi-P06-033`: 同数のときだけDRAWと一致。
- `WXDi-P09-072`: 5枚EC / 4枚DRAWの排他的な固定枚数分岐と一致。
- `WXDi-P16-046`: 手札2枚コスト後、ライフが少ないときだけDOWNと一致。
- `WXK07-036`: ライフが多いときだけ《赤》任意支払いを開き、支払い後だけ保存対象をバニッシュする既存sequence経路と一致。
- `WXK07-038`: 自ターンANDライフ多数の間だけ+1000と引用耐性の両方を付与し、原文と一致。

`node scripts/heldReview.mjs --adopt WXDi-P06-033,WXDi-P09-072,WXDi-P16-046,WXK07-036,WXK07-038` で採用し、再build後は83に復帰。増分を数値だけ戻して寝かせたものは0。

## 7. ゲート before / after

| 計器 | before (`e50fab566`) | after | 結果 |
|---|---:|---:|---|
| `npm run golden` | 2603 PASS / 0 FAIL | 2612 PASS / 0 FAIL | PASS |
| `npm run census` | 626 / baseline 626 | 622 / baseline 622 | PASS（4改善、定数追随） |
| `npm run smoke` | 10693; CRASH/HANG/INVARIANT/SKIP 0 | 10693; 全0 | PASS |
| `npm run fuzz` | 全0 | 全0 | PASS |
| `node scripts/groupSimilar.mjs --all` | 同型★0 | 同型★0 | PASS |
| `npm run census:stubs` | A群0 / C群0 | A群0 / C群0 | PASS |
| `npm run check:manual-fields` | 0 | 0 | PASS |
| lint | 0 errors / 261 warnings | 0 errors / 261 warnings | PASS |
| held / partial / idset | 83 / 15 / 46 | 83 / 15 / 46 | PASS（最終集合増減0） |

`npm run regen` はUTF-8直書きで完了し、同型逆翻訳割れ★0。`npm run gates` は typecheck / golden / smoke / fuzz / census / census-stubs / manual-fields / lint を全PASS。

## 8. 台帳

`findings.jsonl` を採用effectIdごとに実査した。`WXK10-003-E1` だけfindingが2本あり、今回直したquote `ライフクロスが…２枚以上少ない` の前方一致だけを `::` 形式で閉じた。選択肢③のquote `シグニの数が…２体以上少ない` はOPENのまま。他の指定5効果は付与findingを全て直したためIDだけで閉じた。`WXK07-036-E1` はfindings母集団外の同規則採用であることをコメントに残した。

## 9. エンコーディング検査

`git diff --name-only` の全変更ファイルをバイト列とUTF-8文字列の両方で読み、新規の先頭BOM (`efbbbf`) 0、`U+FFFD` 0、`?`連続3文字以上0を確認した。日本語を追加したファイルもUTF-8で再読取り可能。
