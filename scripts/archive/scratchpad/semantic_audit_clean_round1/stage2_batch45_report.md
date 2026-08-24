# 段2 第45バッチ報告：トラッシュ／エナゾーンの存在・枚数条件

日付: 2026-08-25  
基準 HEAD: `da1fd9b61`

## 1. 触ったファイルと理由

- `src/data/effectParser.ts` — 第44バッチの条件持ち上げ節を再利用し、トラッシュ／エナの名前・レベル・色・クラス・枚数、2ゾーンOR、既存条件とのANDを配線。
- `src/types/effects.ts` — 新型は作らず、既存 `LRIG_TRASH_COUNT` に任意 `filter` を追加。評価器が既に扱っていた複数 `cardType` も型へ明示。
- `src/engine/effectEngine.ts` — `checkActiveCondition` と `evalConditionForContinuous` の `LRIG_TRASH_COUNT` で `filter` を実評価。
- `src/engine/execUtils.ts` — AUTO/ACTIVATED 側 `evalCondition` の `LRIG_TRASH_COUNT` で `filter` を実評価。
- `scripts/decompileEffects.ts` — filtered `LRIG_TRASH_COUNT` を逆翻訳し、ルリグ＋アシストルリグの型配列を「ルリグ」と表示。
- `scripts/goldenTest.ts` — live/fresh、閾値／閾値−1／0、2ゾーンOR、3評価経路、偽陽性・見送り不変の6群を追加。
- `scripts/vocabCensus.ts` — 改善実測 `583 → 582` に `BASELINE_HIGH` を同期。
- `public/data/effects_WX.json`, `effects_WX24_26.json`, `effects_WXDi.json` — 採用11 effectIdのlive JSON。
- `docs/decompile_sheet1/2/7/8/9.txt`, `docs/_vocab_census.txt`, `docs/_census_stubs.txt`, `docs/_held_fresh.json`, `docs/_held_review.txt`, `docs/_partial_fresh.json` — build/held/regenの決定論的生成物。
- `scripts/archive/scratchpad/semantic_audit_clean_round1/stage2_closed.txt` — findingsに存在する採用5 findingだけをquote前方一致で閉鎖。
- `docs/BUGFIXES.md` — 母集団訂正、採用・見送り、ゲートを先頭へ記録。
- 本報告書 — 全件照合と非実施事項を記録。

`docs/PLAN.md` / `docs/PLAN_PROGRESS.md`、群A、群C、表外効果、ブラウザspecは編集していない。commit / push / network / 実機検証も実施していない。

## 2. ベースライン

着手時の `git log --oneline -3`:

```text
da1fd9b61 段2 第44バッチ 実機検証＋簿記...
7827b5ea0 段2 第44バッチ: 場...
72e96ed7a ...
```

ワークツリーはclean、比較基準は `da1fd9b61` として `tmp_batch45_baseline/` に全5 effects JSONを退避した。着手時 `npm run gates` は全緑: golden **2743/0**、census **583 / baseline 583**、stubs A/C **0/0**、manual-fields **0/0**、smoke **10693効果・CRASH/HANG/INVARIANT/SKIP全0**、fuzz全0、lint **0 errors / 260 warnings**。`groupSimilar --all` は **5986カード / 265群 / ★0**、heldは **76枚 / 32署名群**、台帳は **221 / 111 / 423 / 689**。

## 3. 母集団の再測と確定worklist

- 投入時 `tmp_popCond.mjs`: 群A **587/23**、群B **275/40**、群C **83/13**。依頼文の「41候補」は再現せず、**群Bは40候補**が正しい。
- CSV一次情報は各Sheetの先頭BOMを剥がして読み、**6712カード**と確認した。
- 指定の既実装10件を実コードで再確認した。`WXK09-031/047/051/052/055/077-E2/080/081/083-E1` は `ENERGY_EACH_LEVEL_FILTER_GTE`、`WX16-Re02-E1` は `LAST_PROCESSED_ALL_MATCH` で正しい。
- さらにRECV外だが専用受け皿で正しい7件を確認した。
  - `WX12-013-E1` — `ARTS_COST_REDUCTION_BY_EFFECT`。青アーツ存在は本文ゲートではなく使用コスト軽減条件。
  - `WX12-037-E2` — `MILL_EACH_REPEAT_ON_NAME`。`execStubPart2` が直前にトラッシュへ置いたカード名を判定。
  - `WX19-005-E1` — `BET_MECHANIC`。`execStubPart1` が相手エナ4枚条件を選択数強化へ反映。
  - `WXEX1-07-E1` — `OPP_ENERGY_EXCESS_TRASH`。`execStubPart1` が原文閾値5を読み、相手エナを実測。
  - `WX26-CP1-004-E1`, `WX26-CP1-006-E1` — `RECOLLECT_GATE`。`execSequence` が使用中アーツを除くルリグトラッシュのアーツ4枚を判定。
  - `WXDi-P16-064-E1` — `CONDITIONAL_TRASH_UNDER_SIGNI`。`execStubPart3` が相手エナ2枚条件を判定。
- 群C重複9件 `WX12-Re14`, `WXDi-CP01-031`, `WXDi-D06-015`, `WXDi-P04-071`, `WXEX1-40`, `WXEX2-65`, `WXK05-029`, `WXK10-047`, `WXK11-063` は種類数条件なので今回の群Bから除外。表外 `WX09-027-E2` も明示スコープ外で不変。
- `WXDi-P12-047-E1` はraw 40には出ず、第44バッチ時点で `AND{ALL_FIELD_SIGNI_MATCH, ENERGY_COUNT}` が両方入っていたため済。

したがってraw 40の内訳は、既実装17、群C重複9、表外1、依頼表内の真の穴13。真の穴13は **採用11 / 機構待ち2**。Claude見立ての「真の穴約30」は、専用受け皿7件と群C重複を未分離だったため訂正する。採用後の群B再測は **275/29** で、40→29の差11が採用集合と完全一致した。

## 4. 採用11効果

消費関数の略記:

- `AC/Power`: `calcFieldPowers` → `checkActiveCondition`
- `AC/Grant`: CONTINUOUS付与collector → `checkActiveCondition`
- `Conditional`: `executeAction` → `execConditional` / `execSequence` → `evalCondition`
- `UseCondition`: `evalUseCondition` → `evalCondition`

1. `WX09-034-E2` / 原文条件「あなたのトラッシュにカード名に《パルテノ》か《パルべック》を含むシグニがあるかぎり」 / `activeCondition={type:"OR",conditions:[{type:"TRASH_HAS_CARD",owner:"self",filter:{cardType:"シグニ",cardName:"パルテノ"}},{type:"TRASH_HAS_CARD",owner:"self",filter:{cardType:"シグニ",cardName:"パルべック"}}]}` / 逆翻訳全文「【常】《あなたのトラッシュにカード名に《パルテノ》を含むシグニがあるかあなたのトラッシュにカード名に《パルべック》を含むシグニがあるかぎり》このシグニのパワーを＋5000する」 / 原文と一致 / `OR + TRASH_HAS_CARD`、`AC/Power`。
2. `WX20-074-E2` / 「あなたの場かトラッシュにカード名に《ルシファル》を含むシグニがある場合」 / `action.condition={type:"OR",conditions:[{type:"HAS_CARD_IN_FIELD",owner:"self",filter:{cardType:"シグニ",cardName:"ルシファル"}},{type:"TRASH_HAS_CARD",owner:"self",filter:{cardType:"シグニ",cardName:"ルシファル"}}]}` / 「【自】このシグニが場に出たとき：あなたの場にカード名に《ルシファル》を含むシグニがいるかあなたのトラッシュにカード名に《ルシファル》を含むシグニがあるなら、対戦相手のシグニ1体のパワーを－7000する。そしてあなたのデッキの上から1枚をエナゾーンに置く」 / ゾーン条件は一致、全文はパワー0以下ゲート欠落で不一致 / `OR + HAS_CARD_IN_FIELD + TRASH_HAS_CARD`、`Conditional`。
3. `WX25-P3-015-E1` / 「ルリグトラッシュに＜タマ＞のルリグと＜イオナ＞のルリグがそれぞれ1枚以上ある場合」 / `action.condition={type:"AND",conditions:[{type:"LRIG_TRASH_COUNT",filter:{cardType:["ルリグ","アシストルリグ"],story:"タマ"},operator:"gte",value:1},{type:"LRIG_TRASH_COUNT",filter:{cardType:["ルリグ","アシストルリグ"],story:"イオナ"},operator:"gte",value:1}]}` / 「【起】（メイン起動）：〈エクシード5〉ルリグトラッシュに＜タマ＞のルリグが1枚以上かつルリグトラッシュに＜イオナ＞のルリグが1枚以上なら、あなたのアーツ(ルリグトラッシュ)1枚をルリグデッキに戻す」 / 条件は一致、本文枚数・色は不一致 / `AND + filtered LRIG_TRASH_COUNT`、`Conditional`。
4. `WXDi-P05-069-E1` / 「あなたの場かエナゾーンに《翠将姫　ロビンフッド》があるかぎり」 / `activeCondition={type:"OR",conditions:[{type:"HAS_CARD_IN_FIELD",owner:"self",filter:{cardName:"翠将姫　ロビンフッド"}},{type:"ENERGY_HAS_CARD",owner:"self",filter:{cardName:"翠将姫　ロビンフッド"}}]}` / 「【常】《あなたの場に《翠将姫　ロビンフッド》がいるかあなたのエナゾーンに《翠将姫　ロビンフッド》カードがあるかぎり》このシグニのパワーを＋5000する」 / 一致 / `OR + HAS_CARD_IN_FIELD + ENERGY_HAS_CARD`、`AC/Power`。
5. `WXDi-P03-049-E1` / 「相手ターン、あなたのエナゾーンにレベル1のシグニがあるかぎり」 / `activeCondition={type:"AND",conditions:[{type:"TURN_OWNER",owner:"opponent"},{type:"ENERGY_HAS_CARD",owner:"self",filter:{cardType:"シグニ",level:1}}]}` / 「【常】《対戦相手のターンの間かつあなたのエナゾーンにレベル1のシグニがあるかぎり》このシグニのパワーを＋4000する」 / 一致。既存TURN_OWNERを保持 / `AND + TURN_OWNER + ENERGY_HAS_CARD`、`AC/Power`。
6. `WXDi-CP01-042-E1` / 「トラッシュに＜バーチャル＞のシグニが10枚以上ある場合」 / `steps[1].condition={type:"TRASH_HAS_CARD",owner:"self",filter:{cardType:"シグニ",story:"バーチャル"},minCount:10}` / 「【自】このシグニが場に出たとき：あなたのデッキの上からカードを1枚トラッシュに置く。そしてあなたのトラッシュに＜バーチャル＞のシグニが10枚以上あるなら、《無》《無》を支払ってもよい。そうした場合、あなたの＜バーチャル＞のシグニ(トラッシュ)1枚を手札に加える」 / 一致 / `TRASH_HAS_CARD.minCount`、`execSequence → evalCondition`。
7. `WXDi-P03-066-E1` / 「トラッシュにレベル1のシグニが2枚以上あるかぎり」 / `activeCondition={type:"TRASH_HAS_CARD",owner:"self",filter:{cardType:"シグニ",level:1},minCount:2}` / 「【常】《あなたのトラッシュにレベル1のシグニが2枚以上あるかぎり》このシグニのパワーを＋4000する」 / 一致 / `TRASH_HAS_CARD.minCount`、`AC/Power`。
8. `WXDi-P11-054-E2` / 「トラッシュに白のカードが15枚以上あるかぎり」 / `activeCondition={type:"TRASH_HAS_CARD",owner:"self",filter:{color:"白"},minCount:15}` / 「【常】《あなたのトラッシュに《白》のカードが15枚以上あるかぎり》このシグニは『【常】《対戦相手のターンの間》あなたのシグニ1体に【シャドウ:{\"selfPowerLte\":true}】を与える』を得る」 / 条件と付与期間は一致 / `TRASH_HAS_CARD.minCount`、`AC/Grant`。
9. `WXDi-P12-053-E1` / 「トラッシュに《ディソナアイコン》のカードが10枚以上ある場合」 / `steps[0].condition={type:"TRASH_HAS_CARD",owner:"self",filter:{isDisona:true},minCount:10}` / 「【自】このシグニがアタックしたとき：あなたのトラッシュに《ディソナアイコン》を持つカードが10枚以上あるなら、対戦相手のシグニ1体を対象とし、《黒》を支払ってもよい。そうした場合、対戦相手のシグニ1体のパワーを－10000する」 / 一致 / `TRASH_HAS_CARD.minCount`、`execSequence → evalCondition`。
10. `WXDi-P13-056-E1` / 「あなたのターンの間、トラッシュにスペルが3枚以上あるかぎり」 / `activeCondition={type:"AND",conditions:[{type:"TURN_OWNER",owner:"self"},{type:"TRASH_HAS_CARD",owner:"self",filter:{cardType:"スペル"},minCount:3}]}` / 「【常】《自分のターンの間かつあなたのトラッシュにスペルが3枚以上あるかぎり》このシグニのパワーを＋5000する」 / 一致。既存TURN_OWNERを保持 / `AND + TURN_OWNER + TRASH_HAS_CARD`、`AC/Power`。
11. `WXDi-P11-053-E1` / 「このカードがトラッシュにあり、かつトラッシュに《コードアンチ　メジェド》が4枚ある場合」 / `condition={type:"AND",conditions:[{type:"THIS_CARD_IN_LOCATION",location:"trash"},{type:"TRASH_HAS_CARD",owner:"self",filter:{cardName:"コードアンチ　メジェド"},minCount:4}]}` / 「【起】（メイン起動）：〈《白×1》《白×1》《無×1》〉このカードがtrashにあるかつあなたのトラッシュにカード名に《コードアンチ　メジェド》を含むカードが4枚以上ある場合、対戦相手のシグニ1体を手札に戻す」 / 一致。`COND_STUB`を除去し既存位置条件を保持 / `AND + THIS_CARD_IN_LOCATION + TRASH_HAS_CARD`、`UseCondition`。

## 5. 見送った／変更しなかった全件

### 既実装17件

- `WXK09-031-E1`, `WXK09-047-E1`, `WXK09-051-E1`, `WXK09-052-E1`, `WXK09-055-E1`, `WXK09-077-E2`, `WXK09-080-E1`, `WXK09-081-E1`, `WXK09-083-E1` — `ENERGY_EACH_LEVEL_FILTER_GTE` でレベル1〜4の各閾値を表現済み。
- `WX16-Re02-E1` — `LAST_PROCESSED_ALL_MATCH` で「置かれたカードがすべて＜ウェポン＞」を表現済み。
- `WX12-013-E1`, `WX12-037-E2`, `WX19-005-E1`, `WXEX1-07-E1`, `WX26-CP1-004-E1`, `WX26-CP1-006-E1`, `WXDi-P16-064-E1` — §3記載の専用STUB/actionと消費関数で条件をhonor済み。一般条件を重ねるとコスト軽減・追加処理などの意味を本文全体ゲートへ変えるため不採用。

### 既に正しい複合1件

- `WXDi-P12-047-E1` — `AND{ALL_FIELD_SIGNI_MATCH(self,isDisona), ENERGY_COUNT(opponent,gte,2)}` 済み。第44バッチ成果を維持し、今回のlive差分0。

### 真の穴だが機構待ち2件

- `WXDi-P04-034-E1` — 自場【ソウル】存在と相手エナ2枚のAND。`ENERGY_COUNT`だけは表せるがSOUL存在条件が無い。片側だけ足すと無条件過剰実行が残るので全体を据置。必要機構はfield SOUL count/has condition。
- `WXDi-P12-056-E1` — エナ＋トラッシュにあるディソナカードの**合計**7枚。単独ゾーン条件のANDは「各ゾーン7枚」を要求して別意味になる。必要機構は複数locationのfiltered aggregate count。

### 明示スコープ外10件

- 群C重複9件: `WX12-Re14-E1`, `WXDi-CP01-031-E1`, `WXDi-D06-015-E1`, `WXDi-P04-071-E1`, `WXEX1-40-E1`, `WXEX2-65-E1`, `WXK05-029-E1`, `WXK10-047-E1`, `WXK11-063-E2`。種類数／色種類数は次バッチのため不変。
- 表外 `WX09-027-E2` — 原文上はトラッシュ名存在の穴に見えるが「表に無い効果へ手を出さない」に従い不変。

## 6. 条件以外で見つけた原文不一致

2 effectId。

- `WX20-074-E2` — 原文のエナチャージは「**この効果によって**対象のパワーが0以下になった場合」だけ。liveはゾーンOR成立後、パワー結果を見ず常にエナチャージする。finding「パワーが0以下になった場合」は閉じていない。
- `WX25-P3-015-E1` — 原文は「**無色ではない**アーツを**2枚まで**」、liveは色無制限のアーツ1枚。今回直したタマ／イオナANDとは別軸なので不変。

## 7. ゲート（baseline → after）

| 計器 | baseline `da1fd9b61` | after |
|---|---:|---:|
| `npm run gates` | 全緑 | **全緑** |
| golden | 2743 / 0 | **2749 / 0** |
| census HIGH | 583 / baseline 583 | **582 / baseline 582** |
| census:stubs A/C | 0 / 0 | **0 / 0** |
| manual-fields | 0 / 0 | **0 / 0** |
| smoke | 10693、全0 | **10693、CRASH/HANG/INVARIANT/SKIP全0** |
| fuzz | 全0 | **全0**（200ゲーム） |
| lint | 0 errors / 260 warnings | **0 / 260** |
| groupSimilar `--all` | 5986 / 265 / ★0 | **5986 / 265 / ★0** |

golden追加6群は、(1) 採用11のlive/fresh構造、(2) CONTINUOUS Lv1トラッシュ2/1/0、(3) AUTOディソナ10/9/0、(4) filtered LRIG_TRASH_COUNTを`evalCondition`/`checkActiveCondition`の両方、(5) 場ORトラッシュの場／トラッシュ／双方0、(6) 専用実装・見送り不変。既存goldenの削除・期待値緩和は0。

## 8. live生パースA/B

基準 `da1fd9b61` の全5 effects JSONと現liveをeffectId単位で比較。変化は以下 **11件だけ**、追加0・削除0・outlier **0**、expected missing **0**。

`WX09-034-E2`, `WX20-074-E2`, `WX25-P3-015-E1`, `WXDi-CP01-042-E1`, `WXDi-P03-049-E1`, `WXDi-P03-066-E1`, `WXDi-P05-069-E1`, `WXDi-P11-053-E1`, `WXDi-P11-054-E2`, `WXDi-P12-053-E1`, `WXDi-P13-056-E1`。

採用後 `tmp_popCond.mjs B` は受け皿なし **40→29**。差11はA/B変化集合と一致。群A・群C・表外効果のlive変化は0。

## 9. held / lint

- 報告直前に `npm run build:effects` → `node scripts/heldReview.mjs` を再実行。
- held: **76枚→76枚**、署名群 **32→31**。カード増減0。署名群の減少1は今回の採用で差分形が統合された結果。
- 最終build内訳: 新規0 / 純改善1 / 効果単位0 / 手書き新規0 / manual温存426 / held review76 / fresh空2 / parseStatusのみ208 / id集合ズレ45。
- lint: **260→260 warnings**、errors 0。

## 10. 台帳

`findings.jsonl` の実quoteを確認し、次の5 findingだけを前方一致で閉じた: `WX09-034-E2 :: あなたのトラッシュに`, `WX20-074-E2 :: 《ルシファル》を含むシグニがある場合`, `WXDi-P03-049-E1 :: エナゾーンにレベル１のシグニ`, `WXDi-P03-066-E1 :: レベル１のシグニが２枚以上`, `WXDi-P11-054-E2 :: 白のカードが１５枚以上あるかぎり`。標本外6効果はfindingsに無いため記帳していない。

| 区分 | before | after |
|---|---:|---:|
| 段0機械除去 | 221 | **221** |
| 段1偽陽性 | 111 | **111** |
| 段2消化 | 423 | **428** |
| 残OPEN | 689 | **684** |

`WX20-074-E2` の別finding「パワーが0以下になった場合」、据置 `WXDi-P12-056-E1`、第44で未閉鎖ならという条件付きの `WXDi-P04-034-E1` は閉じていない。

## 11. CONTINUOUS / AUTO / ACTIVATED経路

- CONTINUOUS 6件 (`WX09-034`, `WXDi-P05-069`, `WXDi-P03-049/066`, `WXDi-P11-054`, `WXDi-P13-056`) は `activeCondition`。各collectorが `checkActiveCondition` を通し、`OR` / `AND` / `TRASH_HAS_CARD` / `ENERGY_HAS_CARD` / `TURN_OWNER` をfalse時にskipする。POWERは実盤面で閾値／不足／0を固定、付与も同じ共通評価器を通る。
- AUTO 3件 (`WX20-074`, `WXDi-CP01-042`, `WXDi-P12-053`) はaction `CONDITIONAL`。`executeAction` → `execConditional` または条件付き任意コストを処理する `execSequence` → `evalCondition` でhonorされる。
- ACTIVATED 2件は、`WX25-P3-015` が `execConditional → evalCondition`、`WXDi-P11-053` が `evalUseCondition → evalCondition`。filtered `LRIG_TRASH_COUNT` は `evalCondition` / `checkActiveCondition` / `evalConditionForContinuous` の3本すべてに同じfilter評価を実装し、未対応型がdefault trueになる穴を残していない。

## 12. 第44バッチ判定式の再利用

- 写した箇所: `parseActiveCondition` の第44 `HAS_CARD_IN_FIELD` 名前包含regexと第45 `TRASH_HAS_CARD`を、ゾーン・名前列・名詞を一度だけ捕捉する共通 `zoneNameContainsM` に統合。同じ名前抽出regexを二重化していない。
- 写した箇所: V2条件表で、第44の `HAS_CARD_IN_FIELD` と既存 `TRASH_HAS_CARD` を `OR` 合成して `WX20-074-E2` を表現。第44の `AND + ENERGY_COUNT` で完成済みの `WXDi-P12-047-E1` はそのまま維持。
- 写せなかった箇所: エナ＋トラッシュ合算 (`WXDi-P12-056`) は論理AND/ORでは合計にならず、SOUL存在 (`WXDi-P04-034`) は第44の通常カード存在filterでは盤面付着物を数えられないため据置。

## 13. 差分・エンコーディング・非実施事項

`git diff --numstat` と `git diff --unified=0` を確認。既存行の削除は、(a) 第44の場専用regexを第44/45共通regexへ置換、(b) evaluator/decompiler/typeの既存case拡張、(c) 決定論的生成物の更新だけ。既存golden削除0、カード固有分岐0、スコープ外live差分0。最終 `git diff --name-only` 全ファイルと未追跡の本報告書をbaselineと比較し、`U+FFFD`、3文字以上連続の `?`、先頭UTF-8 BOMの新規増分0。報告書は `wc -c` と先頭／末尾を読み返して確認した。

非実施事項:

- commit / pushをしていない。
- network / browser / 実機検証をしていない。
- `docs/PLAN.md` / `docs/PLAN_PROGRESS.md` を編集していない。
- 群A、群C、表外 `WX09-027-E2`、依頼表に無い効果を変更していない。
- `WXDi-P04-034-E1` / `WXDi-P12-056-E1` を不完全な近似で採用していない。
- 新条件型、`buildEffectsJson.ts`のforce-adopt、共有関数のカード固有テーブルを追加していない。
- `isPureSuperset` の自動採用をHEADへ戻していない。
