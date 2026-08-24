# O-57 実装・検証報告（2026-08-24）

## 1. 触ったファイルと理由

- `src/data/effectParser.ts` — 既存のデッキトップ公開＋直後条件規則を関数化し、前段を保持したまま2文目以降にも限定適用した。
- `src/engine/effectExecutor.ts` — 相手デッキ公開でも宣言値を効果所有者から解決し、直接適用中の `UP{thisCardOnly}` が効果元を指すよう補正した。
- `scripts/decompileEffects.ts` — `REVEAL_AND_PICK` からの `ADD_TO_FIELD.asDown` / `pickUpTo` を逆翻訳へ表示した。
- `scripts/goldenTest.ts` — O-57 の構造assertと実盤面E2E（正負対照、remainder、asDown、未宣言fail-closed、相手デッキ）を5本追加した。
- `public/data/effects_WX.json` / `effects_WXDi.json` / `effects_misc.json` — 対象7枚の採用済みlive JSON。
- `docs/decompile_sheet1.txt` ～ `docs/decompile_sheet9.txt` / `docs/grouped_sentence_all.txt` — `npm run regen` による逆翻訳実出力と下流集計。sheet10 と `grouped_all.txt` は内容不変だった。
- `docs/_held_fresh.json` / `docs/_held_review.txt` — 最終 `build:effects` → `heldReview` の実測出力。
- `docs/_vocab_census.txt` / `docs/_census_stubs.txt` — 全ゲートで再生成した計器出力（件数はベースライン維持）。
- `scripts/archive/scratchpad/semantic_audit_clean_round1/stage2_closed.txt` — 指定された `WDK05-T13-E1` の2 finding をquote前方一致で閉じた。
- `docs/BUGFIXES.md` — O-57 の原因・修正・計器値を先頭へ記録した。
- `docs/O-57_REPORT.md` — 本報告書。

`docs/PLAN.md` と `docs/PLAN_PROGRESS.md` は編集していない。

## 2. 調査結果：7効果を既存 `REVEAL_AND_PICK` で表現できるか

共通の実行根拠は次のとおり。

- `execRevealAndPick`（`src/engine/effectExecutor.ts:5985`）は公開元ownerのデッキ上を取得し、`resolveDynamicFilter`（`:5997-6002`）後に `matchesFilter`（`:6003`）を適用する。
- 不一致時は公開札を `remainder:{location:'deck',position:'top'}` に従ってデッキ上へ復元する（`:6026-6045`）。
- `pickUpTo:true` は pending を `optional:true` にする（`:6054-6058`）。`ADD_TO_FIELD.asDown` は `resumeSearch` が `PLACE_SIGNI_ON_FIELD.asDown` へ渡し（`:9097-9117`）、`resumeSelectSigniZone` が `signi_down` を更新する（`:9438-9459`）。直接配置経路も `applyDirectAction`（`:10073-10133`）が読む。
- `owner:'opponent'` は pending に `deckOwner:'opponent'` を載せる（`:6068-6070`）。`resumeSearch` はそのownerのデッキを使う（`:8878-8881`）。
- `resolveDynamicFilter`（`:2306`）は `levelEqDeclaredNumber`（`:2332-2338`）と `nameEqDeclaredName`（`:2340-2346`）を具体filterへ変換し、未宣言時は `__dynamic_filter_reference_unavailable__` に倒す。O-57では公開元が相手でも宣言値は効果所有者stateから読むよう `execRevealAndPick` の呼出しを補正した（`:5997-6002`）。
- `LAST_PROCESSED_MATCHES` は `execUtils.ts:2430` から `matchesFilter` を直接呼ぶ（`:2454`）ため宣言参照には使っていない。

各効果の判定：

| effectId | 表現可否 | engineが読む根拠 |
|---|---|---|
| `WDK05-T13-E1` | 可 | `filter.cardType:'シグニ'` を `execRevealAndPick` が照合し、一致時だけ `ADD_TO_FIELD`。前段の任意BOUNCEと既存did-it gateを保持。 |
| `WDK07-Y11-E1` | 可 | `cardType:'シグニ'`＋`story:'植物'` を同じ経路で照合。前段 `OPTIONAL_COST.handDiscard` を保持。 |
| `WXDi-P02-044-E1` | 可 | level 3＋シグニを照合し、`:6058` が任意選択、`:9111` / `:9456-9459` がダウン配置を読む。 |
| `PR-372-E1` | 可 | `levelEqDeclaredNumber` を `resolveDynamicFilter` が解決。未宣言はnoMatch番兵でfail-closed。 |
| `WX19-026-E1` | 可 | `owner:'opponent'` で相手デッキを掘り、効果所有者の宣言名と照合。一致時だけ `TRASH{DECK_CARD,opponent}` と `UP{thisCardOnly}`。直接適用の `thisCardOnly` は `execUp` へ戻す（`:10388`）。 |
| `WX19-062-E1` | 可 | 上記と同じ相手デッキ＋宣言照合。一致時だけトラッシュ後に既存 `CHOOSE` を実行。 |
| `WX10-068-E1` | 可 | `GRANT_FIELD_SIGNI_ABILITY.abilities[]` 内が `parseBlock` で再パースされ、内側 `WX10-068-E1-G` に同じ相手デッキ＋宣言照合が生成された。 |

新しいaction型・condition型は不要で、7件すべて既存機構で表現・実行できた。

## 3. 採用した効果の全件

### `WDK05-T13-E1`

- 原文条件節：`それがシグニの場合、それを場に出す。`
- 生成JSON：

```json
{"effectId":"WDK05-T13-E1","effectType":"AUTO","timing":["ON_ATTACK_SIGNI"],"action":{"type":"SEQUENCE","steps":[{"type":"BOUNCE","target":{"type":"SIGNI","owner":"self","count":1,"upToCount":false,"filter":{"cardType":"シグニ","thisCardOnly":true}},"optional":true},{"type":"CONDITIONAL","condition":{"type":"IS_MY_TURN"},"then":{"type":"REVEAL_AND_PICK","owner":"self","revealCount":1,"filter":{"cardType":"シグニ"},"pickCount":1,"then":{"type":"ADD_TO_FIELD","owner":"self"},"remainder":{"location":"deck","position":"top"}}}]},"duration":"INSTANT","mandatory":true,"parseStatus":"AUTO","triggerScope":"self"}
```

- 逆翻訳全文：`【自】このシグニがアタックしたとき：このシグニを手札に戻す（してもよい）。そうした場合、あなたのデッキ上1枚を公開し、その中からシグニを1枚場に出す、残りをデッキの上に戻す`
- 原文との一致：一致。シグニ限定、任意BOUNCE後の実行、非一致札のデッキトップ残留を保持。

### `WDK07-Y11-E1`

- 原文条件節：`それが＜植物＞のシグニの場合、それを場に出す。`
- 生成JSON：

```json
{"effectId":"WDK07-Y11-E1","effectType":"AUTO","timing":["ON_BANISH"],"action":{"type":"SEQUENCE","steps":[{"type":"STUB","id":"OPTIONAL_COST","handDiscard":{"count":1,"filter":{"cardType":"シグニ","story":"植物"}}},{"type":"CONDITIONAL","condition":{"type":"IS_MY_TURN"},"then":{"type":"REVEAL_AND_PICK","owner":"self","revealCount":1,"filter":{"cardType":"シグニ","story":"植物"},"pickCount":1,"then":{"type":"ADD_TO_FIELD","owner":"self"},"remainder":{"location":"deck","position":"top"}}}]},"duration":"INSTANT","mandatory":true,"parseStatus":"AUTO"}
```

- 逆翻訳全文：`【自】このシグニがバニッシュされたとき：手札から＜植物＞のシグニを1枚捨ててもよい。そうした場合、あなたのデッキ上1枚を公開し、その中から＜植物＞のシグニを1枚場に出す、残りをデッキの上に戻す`
- 原文との一致：一致。＜植物＞のシグニ限定で、他3件と異なり場出し自体には任意性を付けていない。

### `WXDi-P02-044-E1`

- 原文条件節：`そのカードがレベル３のシグニの場合、そのシグニをダウン状態で場に出してもよい。`
- 生成JSON：

```json
{"effectId":"WXDi-P02-044-E1","effectType":"AUTO","timing":["ON_BANISH"],"action":{"type":"SEQUENCE","steps":[{"type":"STUB","id":"OPTIONAL_COST","selfEnergyToDeckBottom":true,"costText":"このシグニをエナゾーンからデッキの一番下に置いてもよい"},{"type":"CONDITIONAL","condition":{"type":"IS_MY_TURN"},"then":{"type":"REVEAL_AND_PICK","owner":"self","revealCount":1,"filter":{"cardType":"シグニ","level":3},"pickCount":1,"pickUpTo":true,"then":{"type":"ADD_TO_FIELD","owner":"self","optional":true,"asDown":true},"remainder":{"location":"deck","position":"top"}}}]},"duration":"INSTANT","mandatory":true,"parseStatus":"AUTO"}
```

- 逆翻訳全文：`【自】このシグニがバニッシュされたとき：このシグニをエナゾーンからデッキの一番下に置いてもよい。そうした場合、あなたのデッキ上1枚を公開し、その中からレベル3のシグニを1枚までダウン状態で場に出してもよい、残りをデッキの上に戻す`
- 原文との一致：一致。`pickUpTo:true` と `asDown:true` の両方をJSON・逆翻訳・盤面E2Eで確認。

### `PR-372-E1`

- 原文条件節：`それが宣言した数字と同じレベルのシグニの場合、それを場に出す。`
- 生成JSON：

```json
{"effectId":"PR-372-E1","effectType":"AUTO","timing":["ON_PLAY"],"action":{"type":"SEQUENCE","steps":[{"type":"STUB","id":"DECLARE_NUMBER"},{"type":"REVEAL_AND_PICK","owner":"self","revealCount":1,"filter":{"cardType":"シグニ","levelEqDeclaredNumber":true},"pickCount":1,"then":{"type":"ADD_TO_FIELD","owner":"self"},"remainder":{"location":"deck","position":"top"}}]},"duration":"INSTANT","mandatory":true,"parseStatus":"AUTO"}
```

- 逆翻訳全文：`【自】このシグニが場に出たとき：数字1つを宣言する。そしてあなたのデッキ上1枚を公開し、その中から宣言した数字と同じレベルを持つシグニを1枚場に出す、残りをデッキの上に戻す`
- 原文との一致：一致。未宣言時は1枚も出ないことをE2Eで確認。

### `WX19-026-E1`

- 原文条件節：`それが宣言したカードの場合、それをトラッシュに置き、このシグニをアップする。`
- 生成JSON：

```json
{"effectId":"WX19-026-E1","effectType":"AUTO","timing":["ON_ATTACK_SIGNI"],"action":{"type":"SEQUENCE","steps":[{"type":"STUB","id":"DECLARE_CARD_NAME"},{"type":"REVEAL_AND_PICK","owner":"opponent","revealCount":1,"filter":{"nameEqDeclaredName":true},"pickCount":1,"pickNoun":"カード","then":{"type":"SEQUENCE","steps":[{"type":"TRASH","target":{"type":"DECK_CARD","owner":"opponent","count":1}},{"type":"UP","target":{"type":"SIGNI","owner":"self","count":1,"filter":{"thisCardOnly":true}}}]},"remainder":{"location":"deck","position":"top"}}]},"duration":"INSTANT","mandatory":true,"parseStatus":"AUTO","triggerScope":"self","usageLimit":"once_per_turn"}
```

- 逆翻訳全文：`【自】このシグニがアタックしたとき：《once_per_turn》[STUB:カード名宣言（手札のカード名から選択）]。そして対戦相手のデッキ上1枚を公開し、それが宣言したカード名のカードの場合、対戦相手のデッキの上からカードを1枚トラッシュに置く。そしてこのシグニをアップする`
- 原文との一致：一致。相手トップの移動と効果元アップをE2Eで確認。

### `WX19-062-E1`

- 原文条件節：`それが宣言したカードの場合、それをトラッシュに置き、あなたのデッキの一番上のカードをエナゾーンに置くかカードを１枚引く。`
- 生成JSON：

```json
{"effectId":"WX19-062-E1","effectType":"AUTO","timing":["ON_ATTACK_SIGNI"],"action":{"type":"SEQUENCE","steps":[{"type":"STUB","id":"DECLARE_CARD_NAME"},{"type":"REVEAL_AND_PICK","owner":"opponent","revealCount":1,"filter":{"nameEqDeclaredName":true},"pickCount":1,"pickNoun":"カード","then":{"type":"SEQUENCE","steps":[{"type":"TRASH","target":{"type":"DECK_CARD","owner":"opponent","count":1}},{"type":"CHOOSE","choose_count":1,"from_count":2,"choices":[{"choiceId":"c0","label":"選択肢1","action":{"type":"ENERGY_CHARGE_FROM_DECK","owner":"self","count":1}},{"choiceId":"c1","label":"選択肢2","action":{"type":"DRAW","owner":"self","count":1}}]}]},"remainder":{"location":"deck","position":"top"}}]},"duration":"INSTANT","mandatory":true,"parseStatus":"AUTO","triggerScope":"self"}
```

- 逆翻訳全文：`【自】このシグニがアタックしたとき：[STUB:カード名宣言（手札のカード名から選択）]。そして対戦相手のデッキ上1枚を公開し、それが宣言したカード名のカードの場合、対戦相手のデッキの上からカードを1枚トラッシュに置く。そして以下の2つから1つを選ぶ【あなたのデッキの上から1枚をエナゾーンに置く / あなたのカードを1枚引く】`
- 原文との一致：一致。条件内にトラッシュと二択の両方を保持。

### `WX10-068-E1`

- 原文条件節：`それが宣言されたカードである場合、あなたはカードを２枚引く。`
- 生成JSON：

```json
{"effectId":"WX10-068-E1","effectType":"CONTINUOUS","activeCondition":{"type":"AND","conditions":[{"type":"LRIG_COLOR","owner":"self","color":"青"},{"type":"IS_SELF_IN_CENTER_ZONE"}]},"action":{"type":"GRANT_FIELD_SIGNI_ABILITY","thisCardOnly":true,"abilities":[{"effectId":"WX10-068-E1-G","effectType":"AUTO","timing":["ON_ATTACK_SIGNI"],"action":{"type":"SEQUENCE","steps":[{"type":"STUB","id":"DECLARE_CARD_NAME"},{"type":"REVEAL_AND_PICK","owner":"opponent","revealCount":1,"filter":{"nameEqDeclaredName":true},"pickCount":1,"pickNoun":"カード","then":{"type":"DRAW","owner":"self","count":2},"remainder":{"location":"deck","position":"top"}}]},"duration":"INSTANT","mandatory":true,"parseStatus":"AUTO","triggerScope":"self"}]},"duration":"PERMANENT","mandatory":true,"parseStatus":"AUTO"}
```

- 逆翻訳全文：`【常】《あなたのセンタールリグが青かつこのシグニが中央ゾーンにあるかぎり》このシグニは『【自】このシグニがアタックしたとき：[STUB:カード名宣言（手札のカード名から選択）]。そして対戦相手のデッキ上1枚を公開し、それが宣言したカード名のカードの場合、あなたのカードを2枚引く』を得る`
- 原文との一致：一致。引用付与の内側に `REVEAL_AND_PICK` が生成されることを構造assertで確認。

## 4. 見送った効果

0件。A群4件・B群3件はすべて既存機構だけで実装できた。

C群9効果（`WX25-P3-092-E1` / `WX25-P3-095-E1` / `WXK02-001-E2` / `WDK05-T15-E1` / `WXK02-071-E1` / `WXK10-057-E1` / `WDK07-E11-BURST` / `WXEX2-15-E2` / `WXDi-CP01-040-E1`）は変更していない。公開が1文目の153効果も変更していない。

## 5. 条件以外で見つけた原文との食い違い

0件。

B群の実装中に見つけた「相手デッキ公開時の宣言state参照」と「直接適用内 `UP{thisCardOnly}` の対象」は、本件の条件一致後帰結を成立させるためのengine配線不足であり、同じO-57内でgoldenを付けて修正した。

## 6. ゲート数値

| 計器 | 結果 | ベースライン比 |
|---|---:|---:|
| golden | **2677 PASS / 0 FAIL** | +5 PASS |
| census | **601 / BASELINE_HIGH 601** | 増減0 |
| 同型★ (`groupSimilar --all`) | **0** | 増減0 |
| smoke | **10693 OK / CRASH 0 / HANG 0 / INVARIANT 0 / SKIP 0** | 維持 |
| fuzz | **CRASH 0 / HANG 0 / INVARIANT 0 / EXPLOSION 0** | 維持 |
| lint | **0 errors / 260 warnings** | warnings増減0 |
| census:stubs | **A群🔴0 / C群0** | 維持 |
| check:manual-fields | **0 / 0** | 維持 |

`npm run gates` は全緑。`npm run regen` も完走した。

## 7. 全カード生パースdiff

CSV 6712枚を `parseCardEffects` で修正前／修正後スナップショット化し、effectId単位のJSON文字列で比較した。

変化集合は **7効果ちょうど**：

```text
PR-372-E1
WDK05-T13-E1
WDK07-Y11-E1
WX10-068-E1
WX19-026-E1
WX19-062-E1
WXDi-P02-044-E1
```

- outlier：**0件**
- 公開が1文目の153効果：**変化0件**
- C群9効果：**変化0件**

既存規則ブロックの行単位diffも確認した。入口は修正前の `if (sentences[0]...` から、同じfilter合成本体を持つ `parseDeckTopRevealConditionalAt(revealIndex)`（`effectParser.ts:11826`）へ切り出した。呼出し側（`:11999-12018`）は「公開文の直後が `それが/そのカードが…場合、`」「2文目以降は帰結が場出し（攻撃シグニとしてを除外）または宣言カード照合」「条件文が末尾」を必須にし、前段を `parseActionText` して `SEQUENCE` に保持する。既存filter分岐は複製していない。

## 8. heldバケットとlint warning

報告直前に改めて `npm run build:effects` → `node scripts/heldReview.mjs` を連続実行した。

| バケット | 着手時 | parser修正・採用前 | 7枚採用後の最終実測 |
|---|---:|---:|---:|
| held（要レビュー） | 76 | 83 | **76** |
| 署名グループ | 31 | 33 | **31** |
| fresh空 | 2 | 2 | **2** |
| parseStatusのみ差 | 203 | 203 | **203** |
| id集合ズレ | 45 | 45 | **45** |

held増分7枚は採用した対象7枚と完全一致し、採用後はベースラインへ復帰した。個別に原文・leaf diffを確認し、held内のスコープ外カードは採用していない。

lint warning は **260 → 260（増減0）**。

意味照合台帳は指定2行を追記し、段2消化 **395 → 397（+2）**。`semanticAuditLedger.mjs` の supplied HEAD 実測は残OPEN **715 → 713** だった。依頼票記載の **714 → 712** とは着手時点から絶対値が1件ずれているが、今回2 findingの消化差分は一致する。数合わせのための無関係なfinding操作はしていない。

## 9. やらなかったこと・退化申告

- C群9効果と公開が1文目の153効果は触っていない。生パースdiffで変化0を確認した。
- `LAST_PROCESSED_MATCHES` に宣言参照filterを載せていない。
- 新しいaction型・condition型・専用カードfixupを作っていない。
- `effects_*.json` を手編集していない。`build:effects` → `heldReview --adopt` で対象7枚だけを採用した。
- 実機検証 `scripts/verifyBattleDrive.mjs` とシナリオ作成は行っていない。
- `docs/PLAN.md` / `docs/PLAN_PROGRESS.md` は編集していない。
- commit / push は行っていない。
- **既存効果の退化：確認されたものは0件。** 全カード生パースdiff、golden、smoke、fuzz、census、同型★で確認した。ただしengineの `resolveDynamicFilter` の宣言参照stateと直接適用 `UP{thisCardOnly}` は共通経路を補正しているため、将来その経路に別の意味を期待するデータが追加された場合は退化余地になり得る。現liveの全ゲートでは退化を検出していない。

## 10. 報告書実体確認

保存後に `wc -c docs/O-57_REPORT.md` を実行して **18684 bytes** を確認し、先頭8行・末尾8行も読み返した。空・`undefined`・途中切れではない。tracked変更23件をHEADと比較し、本報告書も含めた文字化け検査は、U+FFFD・3文字以上連続の `?`・先頭BOMの新規増がすべて0だった。`git diff --check` も異常なし。
