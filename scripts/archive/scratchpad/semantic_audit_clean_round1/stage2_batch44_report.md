# 段2 第44バッチ報告：場の存在・体数条件

日付: 2026-08-25  
基準 HEAD: `72e96ed7a`

## 1. 触ったファイル

- `src/data/effectParser.ts` — 場の名前包含、ライズ、レベル、色ルリグ、ディソナ、完全一致名、複合 AND の限定文型を既存の条件持ち上げ節へ追加。
- `src/data/parsers/parseSentencePart1.ts` — `SELF_PLAY_RESTRICT` の「相手場のウィルスN個以上」を配線。
- `src/types/effects.ts` — ActiveCondition にしかなかった `VIRUS_COUNT` を `Condition` union と `CONDITION_TYPES` にも追加。
- `src/engine/execUtils.ts` — AUTO/ACTIVATED 用 `evalCondition` に `VIRUS_COUNT` 実評価を追加。
- `src/engine/effectEngine.ts` — 出撃制限用 `evalConditionForContinuous` に `VIRUS_COUNT` 実評価を追加。
- `src/data/manualEffects.ts` — 既存 MANUAL 本文を保ったまま `WX24-P2-057-E1` / `WX25-P3-054-E2` の条件だけ補完。
- `scripts/goldenTest.ts` — 成立／不足／0体、CONTINUOUS、出撃制限、複合 AND と live 構造を固定。
- `scripts/vocabCensus.ts` — 改善実測 `591 → 583` に `BASELINE_HIGH` を同期。
- `public/data/effects_WX*.json`（4ファイル）— 採用19 effectId の live JSON。
- `docs/decompile_sheet*.txt`、`docs/grouped_sentence_all.txt`、`docs/_vocab_census.txt`、`docs/_census_stubs.txt`、`docs/_held_*`、`docs/_idset_fresh.json`、`docs/_partial_report.txt` — build/held/regen の決定論的生成物。
- `scripts/archive/scratchpad/semantic_audit_clean_round1/stage2_closed.txt` — 今回実際に直した6 finding だけを quote 前方一致で追記。
- `docs/BUGFIXES.md` — 修正概要、見送り、ゲート値を先頭へ記録。
- 本報告書 — 全件照合と非実施事項の記録。

`docs/PLAN.md` / `docs/PLAN_PROGRESS.md`、群B単独、群C、表外効果、ブラウザ spec は編集していない。commit / push / network / 実機検証も実施していない。

## 2. 母集団の再測と確定 worklist

- 投入時 `node tmp_popCond.mjs`: **群A 587効果 / 受け皿なし42効果**。依頼票の42を再現した。
- CSV一次情報は BOM を剥がして読み、**6712カード**と確認した。
- 42件を原文・live・消費側まで1件ずつ照合した結果、受け皿集合 `RECV` の偽陽性は4件だった。
  - `WD09-018-E1`: 条件は本文全体のゲートではなく追加探索だけの分岐。live の `STUB{CONDITIONAL_SEARCH_IF_RESONA}` を `execStubPart2` が自場レゾナで判定済み。
  - `WX10-031-E1`: `STUB{CONDITIONAL_COST_REDUCTION_BY_FIELD}`。＜アーム＞と＜ウェポン＞の AND は本文実行条件ではなく使用コスト軽減。
  - `WX12-049-E1`: 同じく `CONDITIONAL_COST_REDUCTION_BY_FIELD`。青＜電機＞等はコスト軽減条件。
  - `WX20-006-E1`: `STUB{ARTS_COST_REDUCTION_BY_EFFECT}`。＜精羅＞はアーツの使用コスト軽減条件。
- 真の条件欠落は **38効果**。うち表外2件 `SP27-012-E1` / `SPDi43-22-E1` は明示スコープ外なので不変。依頼表40件の確定 worklist は **真バグ36件＋偽陽性4件**。
- 真バグ36件のうち、既存語彙で安全に完成した **19件を採用**、新機構または本文退化を伴う **17件を見送り**。
- 採用後の再測は **587 / 23**。残る23件は、今回の見送り21件（偽陽性4を含む）＋表外2件であり、採用19件の取りこぼしは0。

## 3. 採用19効果

消費関数の略記:

- `AC/Power`: `checkActiveCondition` → `calcFieldPowers`
- `AC/Grant`: `checkActiveCondition` → `collectGrantedFromLayer`
- `Trigger`: `triggerCollect` → `evalUseCondition` → `evalCondition`
- `Conditional`: `execConditional` または任意コストを束ねる `execSequence` → `evalCondition`
- `Choice`: `execChoose` → `evalCondition`
- `PlayRestrict`: `canSelfPlay` → `evalConditionForContinuous`

1. `WX09-034-E1` / 「あなたの場にカード名に《パルテノ》か《パルべック》を含むシグニがあるかぎり」 / `activeCondition={type:"OR",conditions:[{type:"HAS_CARD_IN_FIELD",owner:"self",filter:{cardType:"シグニ",cardName:"パルテノ"}},{type:"HAS_CARD_IN_FIELD",owner:"self",filter:{cardType:"シグニ",cardName:"パルべック"}}]}` / 逆翻訳全文「【常】《あなたの場にカード名に《パルテノ》を含むシグニがいるかあなたの場にカード名に《パルべック》を含むシグニがいるかぎり》このシグニのパワーを＋5000する」 / 条件意味は一致 / 型 `OR + HAS_CARD_IN_FIELD`、消費 `AC/Power`。
2. `WX09-Re20-E2` / 「あなたの場にレベル４の＜ウリス＞がいる場合」 / `activeCondition={type:"HAS_CARD_IN_FIELD",owner:"self",filter:{cardType:["ルリグ","アシストルリグ"],level:4,story:"ウリス"}}` / 「【常】《あなたの場に＜ウリス＞のレベル4のルリグがいるかぎり》このシグニの基本パワーを10000にする」 / 一致 / `HAS_CARD_IN_FIELD`、`AC/Power`。
3. `WX12-033-E1` / 「あなたの場にカード名に《セイリュ》を含むシグニがあるかぎり」 / `activeCondition={type:"HAS_CARD_IN_FIELD",owner:"self",filter:{cardType:"シグニ",cardName:"セイリュ"}}` / 「【常】《あなたの場にカード名に《セイリュ》を含むシグニがいるかぎり》このシグニの基本パワーを15000にする」 / 条件は一致（本文対象の別軸は§5） / `HAS_CARD_IN_FIELD`、`AC/Power`。
4. `WX13-058-E1` / 「あなたの場にカード名に《ダイオ姫》を含むシグニがあるかぎり」 / `activeCondition={type:"HAS_CARD_IN_FIELD",owner:"self",filter:{cardType:"シグニ",cardName:"ダイオ姫"}}` / 「【常】《あなたの場にカード名に《ダイオ姫》を含むシグニがいるかぎり》このシグニは『【起】（メイン起動）：〈《ダウン》〉対戦相手の場のシグニ数に応じてパワーを±する／パワーをN倍にする（テキスト記載）』を得る」 / 条件は一致（付与本文 STUB は別軸） / `HAS_CARD_IN_FIELD`、`AC/Grant`。
5. `WX15-068-E2` / 「この能力はあなたの場に《ライズアイコン》を持つシグニがある場合にしか使用できない」 / `condition={type:"HAS_CARD_IN_FIELD",owner:"self",filter:{cardType:"シグニ",hasRiseIcon:true}}` / 「【起】（メイン起動）：〈《ダウン》〉あなたの場に《ライズアイコン》を持つシグニがいる場合、対戦相手のパワー12000以下のシグニ1体をバニッシュする」 / 一致 / `HAS_CARD_IN_FIELD`、`evalUseCondition/evalCondition`。
6. `WX17-053-E2` / 「あなたの場に《ライズアイコン》を持つシグニが２体ある場合」 / `action.condition={type:"HAS_CARD_IN_FIELD",owner:"self",filter:{cardType:"シグニ",hasRiseIcon:true},minCount:2}` / 「【自】このシグニがアタックしたとき：あなたの場に《ライズアイコン》を持つシグニが2体以上いるなら、あなたのシグニ1体をバニッシュする」 / 条件は一致（BANISH対象は別軸不一致） / `HAS_CARD_IN_FIELD`、`Conditional`。
7. `WX18-030-E2` / 「あなたの場に《ライズアイコン》を持つシグニがある場合」 / `steps[0].condition={type:"HAS_CARD_IN_FIELD",owner:"self",filter:{cardType:"シグニ",hasRiseIcon:true}}` / 「【自】このシグニが対戦相手のライフクロス1枚をクラッシュしたとき：《once_per_turn》あなたの場に《ライズアイコン》を持つシグニがいるなら、《赤》《赤》《赤》を支払ってもよい。そうした場合、あなたの《ライズアイコン》を持つシグニ(手札)1枚をコストを支払わずに場に出す」 / 一致 / `HAS_CARD_IN_FIELD`、任意コスト `execSequence`。
8. `WX19-030-E1` / 「対戦相手の場に【ウィルス】が３つ以上ある場合にしか」 / `SELF_PLAY_RESTRICT.condition={type:"VIRUS_COUNT",owner:"opponent",operator:"gte",value:3}` / 「【常】このシグニは対戦相手の場に【ウィルス】が３つ以上ある場合にしか新たに場に出すことができない。」 / 一致 / `VIRUS_COUNT`、`PlayRestrict`。
9. `WX24-P2-057-E1` / 「アタックフェイズの間、あなたの場に《エニグマ/メイデン　イオナ》がいるかぎり」 / `activeCondition={type:"AND",conditions:[{type:"DURING_ATTACK_PHASE"},{type:"HAS_CARD_IN_FIELD",owner:"self",filter:{cardName:"エニグマ/メイデン　イオナ"}}]}` / 「【常】《アタックフェイズの間かつあなたの場に《エニグマ/メイデン　イオナ》がいるかぎり》対戦相手のこのシグニの正面のシグニ1体のパワーを－3000する」 / 一致 / `AND + HAS_CARD_IN_FIELD`、`AC/Power`。
10. `WX25-P3-054-E2` / 「あなたの場に《解明の巫女　ユキ》がいる場合」 / `condition={type:"HAS_CARD_IN_FIELD",owner:"self",filter:{cardName:"解明の巫女　ユキ"}}` / 「【自】《自分ターン》このカードがトラッシュに置かれたとき：《once_per_turn》あなたの場に《解明の巫女　ユキ》がいる場合、あなたのデッキ上5枚を公開し、その中から＜迷宮＞のシグニを1枚手札に加える、残りをデッキの一番下に置く」 / 条件は一致（トリガー主体は別軸不一致） / `HAS_CARD_IN_FIELD`、`Trigger`。
11. `WXDi-P02-048-E1` / 「あなたの場に他のシグニがあるかぎり」 / `activeCondition={type:"HAS_CARD_IN_FIELD",owner:"self",filter:{cardType:"シグニ"},excludeSelf:true}` / 「【常】《あなたの場に他のシグニがいるかぎり》このシグニのパワーを＋4000する」 / 一致 / `HAS_CARD_IN_FIELD + excludeSelf`、`AC/Power`。
12. `WXDi-P05-049-BURST` / 「あなたの場に白のルリグが２体以上いる場合」 / `action.condition={type:"HAS_CARD_IN_FIELD",owner:"self",filter:{cardType:["ルリグ","アシストルリグ"],color:"白"},minCount:2}` / 「【LB】【ライフバースト】：あなたの場に《白》のルリグが2体以上いるなら、対戦相手のパワー10000以下のシグニ1体を手札に戻す」 / 一致 / `HAS_CARD_IN_FIELD + minCount`、`Conditional`。
13. `WXDi-P07-040-E1` / 「あなたの場にレベル１のシグニがある場合」 / `action.condition={type:"HAS_CARD_IN_FIELD",owner:"self",filter:{cardType:"シグニ",level:1}}` / 「【自】あなたのアタックフェイズ開始時：あなたの場にレベル1のシグニがいるなら、あなたのカードを1枚引く」 / 一致 / `HAS_CARD_IN_FIELD`、`Conditional`。
14. `WXDi-P07-063-E1` / 「あなたの場にレベル３のシグニが２体以上ある場合」 / `steps[0].condition={type:"HAS_CARD_IN_FIELD",owner:"self",filter:{cardType:"シグニ",level:3},minCount:2}` / 「【自】あなたのアタックフェイズ開始時：あなたの場にレベル3のシグニが2体以上いるなら、《赤》《赤》を支払ってもよい。そうした場合、このシグニは『【自】このシグニがアタックしたとき：対戦相手のパワー12000以下のシグニ1体をバニッシュする』を得る（ターン終了時まで）」 / 一致 / `HAS_CARD_IN_FIELD + minCount`、任意コスト `execSequence`。
15. `WXDi-P12-047-E1` / 「あなたの場にあるすべてのシグニが《ディソナアイコン》でかつ対戦相手のエナゾーンにカードが２枚以上ある場合」 / `action.condition={type:"AND",conditions:[{type:"ALL_FIELD_SIGNI_MATCH",owner:"self",filter:{cardType:"シグニ",isDisona:true}},{type:"ENERGY_COUNT",owner:"opponent",operator:"gte",value:2}]}` / 「【自】あなたのアタックフェイズ開始時：あなたの場にあるすべてのシグニが《ディソナアイコン》かつ対戦相手のエナが2以上なら、対戦相手のエナを1枚トラッシュに置く（相手が選ぶ）」 / 一致。複合の両側を実装 / `AND + ALL_FIELD_SIGNI_MATCH + ENERGY_COUNT`、`Conditional`。
16. `WXDi-P12-082-E1` / 「選択肢①：あなたの場に《ディソナアイコン》のシグニがある場合」 / `choices[0].condition={type:"HAS_CARD_IN_FIELD",owner:"self",filter:{cardType:"シグニ",isDisona:true}}` / 「【起】（メイン起動）：〈《緑×0》〉以下の2つから1つを選ぶ【あなたの場に《ディソナアイコン》を持つシグニがいる場合、あなたのデッキの上から1枚をエナゾーンに置く / あなたの《ディソナアイコン》を持つシグニ(エナ)1枚を手札に加える】」 / 一致 / `HAS_CARD_IN_FIELD`、`Choice`。
17. `WXDi-P16-055-E1` / 「あなたの場にカード名に《扉の俯瞰者》を含むルリグがいる場合」 / `condition={type:"HAS_CARD_IN_FIELD",owner:"self",filter:{cardType:["ルリグ","アシストルリグ"],cardName:"扉の俯瞰者"}}` / 「【自】あなたのアタックフェイズ開始時：あなたの場に《扉の俯瞰者》ルリグがいる場合、以下の2つから1つを選ぶ【《白》を支払ってもよい。そうした場合、あなたの《ガードアイコン》を持つシグニ(トラッシュ)1枚を手札に加える / 対戦相手のシグニ１体を対象とし、《黒》を支払ってもよい。そうした場合、対戦相手のシグニ1体のパワーを－10000する】」 / 一致 / `HAS_CARD_IN_FIELD`、`Trigger`。
18. `WXK03-046-E1` / 「あなたの場にレベルが奇数のシグニが３体ある場合」 / `steps[0].condition={type:"HAS_CARD_IN_FIELD",owner:"self",filter:{cardType:"シグニ",levelParity:"odd"},minCount:3}` / 「【自】このシグニが場に出たとき：あなたの場にレベルが奇数のシグニが3体以上いるなら、対戦相手のシグニ１体を対象とし、《黒》を支払ってもよい。そうした場合、対戦相手のシグニ1体のパワーを－12000する」 / 場は最大3体なので「3体以上」は原文の3体と一致 / `HAS_CARD_IN_FIELD + levelParity + minCount`、任意コスト `execSequence`。
19. `WXK07-055-CB-E1` / 「あなたの場に《羅星　人生さんＢ》がある場合」 / `condition={type:"HAS_CARD_IN_FIELD",owner:"self",filter:{cardName:"羅星　人生さんＢ"}}` / 「【自】このシグニがアタックしたとき：あなたの場に《羅星　人生さんＢ》がいる場合、あなたのデッキの上から5枚を見て、その中から不要なカードをトラッシュに置き、残りを好きな順番でデッキの一番上に戻す」 / 条件は一致 / `HAS_CARD_IN_FIELD`、`Trigger`。

## 4. 見送った21効果

### RECV 偽陽性（条件欠落としては直さない）

- `WD09-018-E1` — 追加探索だけをレゾナ存在で分ける `CONDITIONAL_SEARCH_IF_RESONA` が live/engine にある。本文全体を `HAS_CARD_IN_FIELD` で包むと最初の探索まで止める退行。
- `WX10-031-E1` — ＜アーム＞と＜ウェポン＞の AND は本文条件でなくコスト軽減。既存 `CONDITIONAL_COST_REDUCTION_BY_FIELD` を維持。
- `WX12-049-E1` — 青＜電機＞等はコスト軽減。既存 `CONDITIONAL_COST_REDUCTION_BY_FIELD` を維持。
- `WX20-006-E1` — ＜精羅＞はアーツコスト軽減。既存 `ARTS_COST_REDUCTION_BY_EFFECT` を維持。

### 真の欠落だが、既存語彙だけでは安全に完成しない

- `WX15-035-BURST`, `WX15-048-E1`, `WX18-033-BURST`, `WX20-040-E1`, `WX20-040-E2` — 場の【トラップ】存在／枚数を数える `TRAP_COUNT` 相当が無い。シグニ filter へ偽装せず見送り。
- `WX21-032-E1`, `WX21-039-E1` — 「このシグニと共通する色を持たない他の＜天使＞」は source-relative な色非共通判定が必要。現 `TargetFilter` の固定色/negate では表現不能。
- `WX24-P4-105-E1` — 「そのカード」は直前に見た手札カード。既存 `DECK_TOP_SHARES_COLOR_WITH_LRIG` は現在のデッキトップ専用で、参照対象が違う。
- `WX25-P3-110-E1` — 公開したデッキ上カードと場のルリグの共有色を、配置処理後も同一カードとして保持する必要がある。既存 `DECK_TOP_SHARES_COLOR_WITH_LRIG` の現在トップ参照を借りない。
- `WXDi-P15-060-E1` — 場の全シグニ下カード総数の存在条件が無い。
- `WXDi-P06-084-E1` — シグニに付いたカード OR シグニ下カードの存在を合算する条件が無い。
- `WXDi-P14-040-E1` — 相手の凍結ルリグ＋凍結シグニを合算する条件が無い。
- `WXDi-P15-007-E2` — 自場シグニ下のカード合計2枚以上を数える条件が無い。
- `WXDi-P16-056-E1` — ＜解放派＞シグニに限定した下カード合計4枚以上を数える条件が無い。
- `WXK11-021-E2` — 場のシグニの異なるレベル種類数。群C重複のため依頼どおり据置。
- `WXDi-P04-034-E1` — 相手エナ2枚側は既存 `ENERGY_COUNT` で表せるが、自場【ソウル】存在を数える条件が無い。片側だけを採用すると過剰実行が残るため、AND全体を見送り。
- `WXK07-028-E1` — `CHARM_COUNT` 自体は生成できたが、fresh は既存の3択本文を `STUB{RULE_REMINDER_TEXT}` へ退化させた。さらに1枚条件と3枚時の `choose_count:2` の二閾値が必要。held に残し、採用しない。

これら17件は `TRAP_COUNT`、field attachment/under-card aggregate、source-relative shared-color、frozen lrig+signi aggregate、SOUL_COUNT、distinct level count、条件付き choose-count の各機構候補。指示により `docs/PLAN.md` へは書いていない。

## 5. 条件以外で見つけた不一致

今回の条件だけを直し、以下は live を変更していない。

- `WX12-033-E1`: 原文「あなたのシグニの基本パワー」を live collector は `count:1`＝効果元自身として扱う。全自場対象なら `count:"ALL"` が必要。
- `WX13-058-E1`: 付与する引用【起】本文は `STUB{DOUBLE_POWER_MINUS}` のまま。
- `WX17-053-E2`: 原文は「このシグニの正面の（対戦相手の）シグニ」だが live BANISH は `owner:"self"` かつ `frontOfSelf` 無し。
- `WX21-032-E1`: 条件欠落に加え、原文の「このシグニのパワー以下」対象条件が欠け、原文にない＜天使＞対象限定がある。
- `WX21-039-E1`: 二段階の条件付き置換が、無条件のエナチャージ1＋2へ潰れている。
- `WX25-P3-054-E2`: 原文トリガーは「対戦相手のシグニが場からトラッシュ」だが逆翻訳/live は「このカードがトラッシュ」。trigger scope/filter の別軸が残る。

`WX09-Re20-E2` の別 finding「このシグニの基本パワー」は閉じていない。ただし `calcFieldPowers` は CONTINUOUS `POWER_SET` の `count !== "ALL"` を効果元自身として解釈するため、挙動上は効果元へ限定される。この別 finding の正式な偽陽性判定は今回の軸外として行っていない。

## 6. ゲート値

| 計器 | ベースライン | 今回 |
|---|---:|---:|
| `npm run gates` | 全緑 | **全緑** |
| golden | 2738 / 0 | **2743 / 0**（+5テスト群） |
| census HIGH | 591 / baseline 591 | **583 / baseline 583** |
| census:stubs A/C | 0 / 0 | **0 / 0** |
| manual-fields | 0 / 0 | **0 / 0** |
| smoke | 10693、全0 | **10693、CRASH/HANG/INVARIANT/SKIP 全0** |
| fuzz | 全0 | **全0**（200ゲーム） |
| lint | 0 errors / 260 warnings | **0 / 260** |
| groupSimilar `--all` | 5986 / 265 / ★0 | **5986 / 265 / ★0** |

既存 golden は「追加行だけ」ではない。新条件により前提が変わった既存5地点を明示修正した: (1) WX19-030 の旧 permissive 期待を3/2個へ反転、(2) frontOfSelf 共通テストの effectsMap を対象効果だけへ隔離し Iona 条件を満たす、(3) WXDi-P12-082 の `isDisona` 出現数を対象＋条件の2へ更新、(4) ランダムに選ぶ付与先自身の native effect を隔離、(5) Condition型数125→126。既存テスト数2738を削除せず、全件PASSのまま新規5群を加えた。既存ブラウザ scenario は変更0。

## 7. live 生パース A/B

`72e96ed7a` の全5 effects JSON（10693効果）と現 live を effectId 単位で比較。変化集合は以下の **19件だけ**、追加0・削除0・outlier **0**。

`WX09-034-E1`, `WX09-Re20-E2`, `WX12-033-E1`, `WX13-058-E1`, `WX15-068-E2`, `WX17-053-E2`, `WX18-030-E2`, `WX19-030-E1`, `WX24-P2-057-E1`, `WX25-P3-054-E2`, `WXDi-P02-048-E1`, `WXDi-P05-049-BURST`, `WXDi-P07-040-E1`, `WXDi-P07-063-E1`, `WXDi-P12-047-E1`, `WXDi-P12-082-E1`, `WXDi-P16-055-E1`, `WXK03-046-E1`, `WXK07-055-CB-E1`。

群Bの単独効果・群C・表外効果の live 変化は0。複合 `WXDi-P12-047-E1` だけは依頼で許可されたとおり場側とエナ側の AND を同時に完成させた。

## 8. held / lint

- 報告直前に `npm run build:effects` → `node scripts/heldReview.mjs` を再実行。
- held: **75枚 / 31署名群 → 76枚 / 32署名群**。
- 増分は `WXK07-028` 1枚だけ。原文を照合し、fresh の `CHARM_COUNT>=1` は正しいが既存 CHOOSE 本文を STUB へ落とすため不採用。減少0。
- lint warnings: **260 → 260**（増減0、errors 0）。

## 9. 台帳

`stage2_closed.txt` へ quote 前方一致で6 findingだけ追記した。`WX09-Re20-E2` の別 finding、`WX21-*`、`WXK07-028` 等は閉じていない。

| 区分 | before | after |
|---|---:|---:|
| 段0機械除去 | 221 | **221** |
| 段1偽陽性 | 112 | **111** |
| 段2消化 | 417 | **423** |
| 残OPEN | 694 | **689** |

段2は+6だがOPENは-5。今回閉じた1 finding が段1偽陽性集合と重なっており、台帳の優先分類で段1が-1、段2が+6になったためである。

## 10. エンコーディング

最終 `git diff --name-only` 全ファイルを baseline と比較し、`U+FFFD`、3文字以上連続の `?`、先頭 UTF-8 BOM の**新規増分0**を確認。CSV走査も BOM 除去後6712カード。

## 11. CONTINUOUS / AUTO 経路

- CONTINUOUS: `WX09-034`, `WX09-Re20`, `WX12-033`, `WX13-058`, `WX24-P2-057`, `WXDi-P02-048` は `activeCondition`。`checkActiveCondition` が `HAS_CARD_IN_FIELD` / `AND` / `OR` を評価し、各 collector が false 時に skip する。特に `WX09-Re20` は一度 action `CONDITIONAL` に包む形を試したが `calcFieldPowers.extractPowerSets` が内側を読まないため、正しく `activeCondition` へ直した。Lv4ウリス有／別ルリグ／0体の三方向 golden で honor を確認。
- SELF_PLAY_RESTRICT: `WX19-030` は `canSelfPlay` 専用の `evalConditionForContinuous` に `VIRUS_COUNT` を実装。3個=true、2個/0個=falseを固定。
- AUTO/LB/ACTIVATED: 本文内条件は `execConditional` / `execSequence`、effect-level 条件は `triggerCollect→evalUseCondition`、選択肢条件は `execChoose` がいずれも `evalCondition` を呼ぶ。HAS条件は2/1/0体、複合ANDは両成立／非ディソナ混在／エナ0／自場0を golden で固定。

## 非実施事項

- commit / push なし。
- network / browser / 実機検証なし。
- `docs/PLAN.md` / `docs/PLAN_PROGRESS.md` は未編集。
- 群B単独、群C、表外2効果、今回表に無い効果は未変更。
- 見送り17真バグを force-adopt、カード固有分岐、共有関数の固有表で握り潰していない。
- `buildEffectsJson.ts` の force-adopt リストは未変更。
