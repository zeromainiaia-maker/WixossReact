# §6.2 段2 第31バッチ報告 — 合計レベル上限／相手アーツのコスト上限

- 開始HEAD: `28d043071`
- 開始状態: `git status --porcelain` 出力なし
- 作業日: 2026-08-23
- commit / push: 実施していない

## 1. 触ったファイルと理由

- `src/data/effectParser.ts` — 「レベルの合計がN以下」の一意な対象節を既存actionへ配線し、アーツの `costMax`、B3の2引用能力と各レベル条件を一般文型で復元。
- `src/engine/effectExecutor.ts` — `execGrantKeyword` / `execSendToEnergy` / `execDown` に合計レベル選択を実装し、AUTOの絞り付き保護を期間storeへ保持。`GRANT_PROTECTION.thisCardOnly` も実消費。
- `src/engine/effectEngine.ts` — 期間付与された `PROTECTION_FILTERED` を `collectEffectImmuneSigni` でソースカードに対して評価。
- `src/utils/keywords.ts` — 条件付き引用中の「バニッシュされない」を未発火時に本文fallbackが拾わないよう、`hasBanishResist` の除外対象を両引用括弧へ拡張。
- `scripts/decompileEffects.ts` — `sourceFilter.costMax` と無限定BANISH耐性を逆翻訳へ表示。
- `scripts/goldenTest.ts` — 採用8効果の実行E2E 8本と、A2/C群6効果の非近似契約1本を追加。
- `scripts/vocabCensus.ts` — 実測改善 `647→642` に `BASELINE_HIGH` と説明を更新。
- `public/data/effects_WX.json` — A1をlive採用。
- `public/data/effects_WXDi.json` — A5をlive採用。
- `public/data/effects_WX24_26.json` — A6をlive採用。
- `public/data/effects_WXK.json` — A3/A4/B3をlive採用。
- `docs/decompile_sheet1.txt` / `sheet2.txt` / `sheet3.txt` / `sheet4.txt` / `sheet8.txt` / `sheet9.txt` — `npm run regen` による採用効果の逆翻訳更新。
- `docs/_vocab_census.txt` — census明細を再生成。
- `docs/_census_stubs.txt` / `docs/_manual_drift.txt` — ソース行番号を含む計器出力を最終実装から再生成。
- `docs/BUGFIXES.md` — 本バッチの採否、実装経路、ゲート値を先頭へ追記。
- 本ファイル — 指定の詳細報告。

## 2. 調査結果 — 各効果で機構が成立する前提

### A群

- A1 `WX11-033-BURST`: 成立。`execBanish` が `target.totalLevelMax` を読み、候補の `candidateLevels` を `selectOrInteract` へ渡す。`resumeSelectTarget` が外部応答も合計再検証する。
- A2 `WXEX1-45-E3`: 不成立。`SearchAction` に合計レベル集合制約のフィールドがなく、`execSearch` / `resumeSearch` に消費経路もない。`EffectTarget.totalLevelMax` をSEARCHへ書いても死データなので据置。
- A3 `WXK06-010-E1`: 開始時は不成立。`execGrantKeyword` に `totalLevelMax` 消費がなかったため、候補レベル提示を追加し `resumeSelectTarget` へ接続して成立させた。
- A4 `WXK10-050-E2`: 開始時は不成立。`execStubPart2` に `ENERGY_BY_LEVEL_SUM_LIMIT` の実装は存在したが、処理は「自分のエナ全体のレベル合計が上限を超えたら末尾からエナを捨てる」であり、原文の「相手シグニを選んでエナへ置く」と別物だった。parserで `SEND_TO_ENERGY` へ置換し、`execSendToEnergy` に合計レベル選択を追加して成立。
- A5 `WXDi-P08-034-E2`: 開始時は不成立。`execDown` に合計レベル消費を追加し、`resumeSelectTarget` の再検証へ接続して成立。
- A6 `WX24-P2-006-E1`: A5と同じ `execDown` 経路で成立。先行するアーツコスト軽減stepは変更していない。

全A採用効果の候補提示は action固有関数、resume時の最終防壁は共通 `resumeSelectTarget`。候補0枚は `lastProcessedCards:[]` で完了し、選択待ちや例外へ落ちない。

### B群

`matchesFilter` の `costMax/costMin` は `CardData.Cost` の `《色》×N` を全件合計し、《コイン》を除外する。したがって印刷の「コストの合計」と一致する。

- B1 `WX16-034-LAYER`: 成立。`collectGrantedFromLayer` が外側 `GRANT_FIELD_SIGNI_ABILITY` の内側abilityを＜怪異＞シグニinstanceへ付与し、`collectEffectImmuneSigni` が内側 `GRANT_PROTECTION.sourceFilter` を `matchesFilter` でソースアーツへ評価する。`sourceFilter` は外側ではなく `abilities[0].action` に付けた。
- B2 `WX21-040-E2`: 成立。既存 `activeCondition:{type:'EICHI_LEVEL_SUM',operator:'eq',value:11}` は開始時から存在し維持。`collectEffectImmuneSigni` が条件成立後に `sourceFilter.costMax:1` を評価する。
- B3 `WXK09-047-E1`: 開始時のCONTINUOUS経路だけでは不成立。この効果はAUTOなので `execGrantProtection` が期間keywordへ変換するが、旧 `protectionKeyword` は `sourceFilter` を捨てていた。`PROTECTION_FILTERED` に制約を直列化し、`collectEffectImmuneSigni` の `protMatches` が解決中ソースへ `matchesFilter` を行う経路を追加した。あわせて `evalCondition` が既存 `ENERGY_EACH_LEVEL_FILTER_GTE` を評価し、`execGrantProtection` が `thisCardOnly` を効果元identityへ固定する。

### C群

5効果とも「N以下」ではなくexact「Nになるように」。現状の `totalLevelMax` では表現できない。さらに消費先がSEARCH、トラッシュ→デッキ下、トラッシュ→手札、手札の任意discard、エナの任意trashに分散しており、1型だけ足すと残りが死フラグになる。今回の機構成立前提を満たさない。

## 3. C群の判断

**(b) 据置**を選んだ。`totalLevelExact` は型だけでなく、各zone/actionの候補提示、選択完了可否、resume再検証、任意選択の「exactを満たさない0枚」扱いまで一貫して要る。今回その4点セットをSEARCHと4種の移動・コスト経路すべてへ入れるのは別機構バッチになる。`totalLevelMax` で近似すると合計未満を許す過剰実行になるため禁止した。C群5効果とA2について、live actionに `totalLevelMax` / 見せかけの `totalLevelExact` が入らない非採用契約をgolden固定した。

## 4. 採用した効果の全件

逆翻訳は最終 `npm run regen` 後の1効果ぶん全文。

### A1 `WX11-033-BURST`

- 原文該当節: `対戦相手のシグニを、レベルの合計が３以下になるように好きな数対象とし、それらをバニッシュする。`
- 生成JSON: `{"effectId":"WX11-033-BURST","effectType":"LIFE_BURST","timing":["ON_LIFE_BURST"],"action":{"type":"BANISH","target":{"type":"SIGNI","owner":"opponent","count":"ALL","filter":{"cardType":"シグニ"},"upToCount":true,"totalLevelMax":3}},"duration":"INSTANT","mandatory":false,"parseStatus":"AUTO"}`
- 逆翻訳全文: `【LB】【ライフバースト】：対戦相手のシグニをレベルの合計が3以下になるように好きな数をバニッシュする`
- 一致: 一致。合計3を処理、4を拒否、候補0を空処理でE2E固定。

### A3 `WXK06-010-E1`

- 原文該当節: `対戦相手のシグニを、レベルの合計が６以下になるように好きな数対象とし、ターン終了時まで、それらは「【常】：アタックできない。」を得る。`
- 生成JSON: `{"effectId":"WXK06-010-E1","effectType":"ACTIVATED","timing":["ATTACK"],"cost":{"energy":[{"color":"白","count":3}]},"action":{"type":"SEQUENCE","steps":[{"type":"STUB","id":"ARTS_COST_REDUCTION_BY_EFFECT"},{"type":"GRANT_KEYWORD","target":{"type":"SIGNI","owner":"opponent","count":"ALL","upToCount":true,"totalLevelMax":6},"keyword":"アタックできない","duration":"UNTIL_END_OF_TURN"}]},"duration":"INSTANT","mandatory":false,"parseStatus":"AUTO"}`
- 逆翻訳全文: `【起】（アタックフェイズ起動）：〈《白×3》〉このアーツの使用コストはあなたの場にあるシグニ１体につき《白×1》減る。そして対戦相手のシグニをレベルの合計が6以下になるように好きな数に【アタックできない】を与える（ターン終了時まで）`
- 一致: 一致。前段の既存コスト軽減も維持。

### A4 `WXK10-050-E2`

- 原文該当節: `対戦相手のシグニを、レベルの合計が６以下になるように２体まで対象とし、それらをエナゾーンに置く。`
- 生成JSON: `{"effectId":"WXK10-050-E2","effectType":"ACTIVATED","timing":["MAIN"],"cost":{"energyTrash":{"count":4,"filter":{"cardType":"シグニ","story":"電機","levelRange":{"min":1,"max":4}},"selectionConstraint":{"distinct":"level"}}},"action":{"type":"SEQUENCE","steps":[{"type":"SEND_TO_ENERGY","target":{"type":"SIGNI","owner":"opponent","count":2,"upToCount":true,"filter":{"cardType":"シグニ"},"totalLevelMax":6}}]},"duration":"INSTANT","mandatory":false,"parseStatus":"AUTO"}`
- 逆翻訳全文: `【起】（メイン起動）：〈エナゾーンからそれぞれレベルの異なる＜電機＞のレベル4以下のレベル1以上のカード4枚をトラッシュに置く〉対戦相手のシグニをレベルの合計が6以下になるように2体までをエナゾーンに置く`
- 一致: 意味一致。コストJSONの `cardType:'シグニ'`＋レベル1～4・distinct・4枚は各レベル1枚を表す。逆翻訳のコスト名詞「カード」は既存表示表現だが、実候補はシグニ限定。

### A5 `WXDi-P08-034-E2`

- 原文該当節: `レベルの合計が４以下になるように対戦相手のシグニを２体まで対象とし、それらをダウンする。`
- 生成JSON: `{"effectId":"WXDi-P08-034-E2","effectType":"AUTO","timing":["ON_PLAY"],"cost":{"energy":[{"color":"青","count":1},{"color":"無","count":1},{"color":"無","count":1},{"color":"無","count":1},{"color":"無","count":1}]},"action":{"type":"DOWN","target":{"type":"SIGNI","owner":"opponent","count":2,"filter":{"cardType":"シグニ"},"upToCount":true,"totalLevelMax":4}},"duration":"INSTANT","mandatory":false,"parseStatus":"AUTO"}`
- 逆翻訳全文: `【自】このシグニが場に出たとき：〈《青×1》《無×1》《無×1》《無×1》《無×1》〉対戦相手のシグニをレベルの合計が4以下になるように2体までをダウンする`
- 一致: 一致。

### A6 `WX24-P2-006-E1`

- 原文該当節: `レベルの合計が５以下になるように対戦相手のシグニを２体まで対象とし、それらをダウンする。`
- 生成JSON: `{"effectId":"WX24-P2-006-E1","effectType":"ACTIVATED","timing":["ATTACK"],"cost":{"energy":[{"color":"青","count":3}]},"action":{"type":"SEQUENCE","steps":[{"type":"CONDITIONAL","condition":{"type":"IS_MY_TURN"},"then":{"type":"STUB","id":"ARTS_COST_REDUCTION_BY_EFFECT"}},{"type":"DOWN","target":{"type":"SIGNI","owner":"opponent","count":2,"filter":{"cardType":"シグニ"},"upToCount":true,"totalLevelMax":5}}]},"duration":"INSTANT","mandatory":false,"parseStatus":"AUTO"}`
- 逆翻訳全文: `【起】（アタックフェイズ起動）：〈《青×3》〉そうした場合、（使用時に支払う）このアーツを使用する際、あなたのルリグデッキから青のアーツ１枚をルリグトラッシュに置いてもよい。そうした場合、このアーツの使用コストは《青×3》減る。そして対戦相手のシグニをレベルの合計が5以下になるように2体までをダウンする`
- 一致: 今回対象のダウン節は一致。既存の前段コスト軽減表現は不変。

### B1 `WX16-034-LAYER`

- 原文該当節: `《レイヤーアイコン》【常】：このシグニはコストの合計が１以下の対戦相手のアーツの効果を受けない。`
- 生成JSON: `{"effectId":"WX16-034-LAYER","effectType":"CONTINUOUS","action":{"type":"GRANT_FIELD_SIGNI_ABILITY","filter":{"cardType":"シグニ","story":"怪異"},"abilities":[{"effectId":"WX16-034-LAYER-E1","effectType":"CONTINUOUS","action":{"type":"GRANT_PROTECTION","target":{"type":"SIGNI","owner":"self","count":1},"from":["アーツ"],"sourceOwner":"opponent","duration":"PERMANENT","sourceFilter":{"costMax":1}},"duration":"PERMANENT","mandatory":true,"parseStatus":"AUTO"}]},"duration":"PERMANENT","mandatory":true,"parseStatus":"AUTO"}`
- 逆翻訳全文: `【常】＜怪異＞のシグニは『【常】このシグニはコストの合計が1以下の対戦相手のアーツの効果を受けない』を得る`
- 一致: 一致。入れ子内だけに `sourceFilter` がある。

### B2 `WX21-040-E2`

- 原文該当節: `【常】英知＝１１：あなたの＜英知＞のシグニはコストの合計が１以下の対戦相手のアーツの効果を受けない。`
- 生成JSON: `{"effectId":"WX21-040-E2","effectType":"CONTINUOUS","activeCondition":{"type":"EICHI_LEVEL_SUM","operator":"eq","value":11},"action":{"type":"GRANT_PROTECTION","subjectFilter":{"cardType":"シグニ","story":"英知"},"from":["アーツ"],"sourceOwner":"opponent","duration":"PERMANENT","sourceFilter":{"costMax":1}},"duration":"PERMANENT","mandatory":true,"parseStatus":"AUTO"}`
- 逆翻訳全文: `【常】《英知（＜英知＞シグニのレベル合計）が11であるかぎり》あなたの＜英知＞のシグニはコストの合計が1以下の対戦相手のアーツの効果を受けない`
- 一致: 一致。英知合計11／7、アーツコスト1／2を独立にE2E確認。

### B3 `WXK09-047-E1`

- 原文該当節: `あなたのエナゾーンにレベル１～４の＜電機＞のシグニがそれぞれ２枚以上ある場合、ターン終了時まで、このシグニは「【常】：バニッシュされない。」と「【常】：コストの合計が１以下の対戦相手のアーツの効果を受けない。」を得る。`
- 生成JSON: `{"effectId":"WXK09-047-E1","effectType":"AUTO","timing":["ON_MATERIAL_USED"],"action":{"type":"CONDITIONAL","condition":{"type":"ENERGY_EACH_LEVEL_FILTER_GTE","owner":"self","filter":{"cardType":"シグニ","story":"電機"},"levels":[1,2,3,4],"minEach":2},"then":{"type":"SEQUENCE","steps":[{"type":"GRANT_KEYWORD","target":{"type":"SIGNI","owner":"self","count":1,"filter":{"thisCardOnly":true}},"keyword":"バニッシュされない","duration":"PERMANENT"},{"type":"GRANT_PROTECTION","target":{"type":"SIGNI","owner":"self","count":1,"filter":{"thisCardOnly":true}},"from":["アーツ"],"sourceOwner":"opponent","duration":"PERMANENT","sourceFilter":{"costMax":1}}]}},"duration":"UNTIL_END_OF_TURN","mandatory":true,"parseStatus":"AUTO"}`
- 逆翻訳全文: `【自】このシグニに《改造素材》が使用されたとき：あなたのエナゾーンにレベル1～4の＜電機＞のシグニがそれぞれ2枚以上あるなら、このシグニは【バニッシュされない】を持つ。そしてこのシグニはコストの合計が1以下の対戦相手のアーツの効果を受けない`
- 一致: 一致。条件成立／不成立、BANISH耐性、アーツコスト1／2を同じlive effectでE2E確認。

## 5. 見送った効果の全件と理由

- A2 `WXEX1-45-E3`: SEARCHに集合レベル上限の型・候補提示・resume検証がない。死フィールド禁止のため据置。
- C1 `WXEX1-36-E2`: デッキSEARCHでexact合計8。SEARCH exact機構なし。
- C2 `WXK10-066-E2`: トラッシュ2枚をデッキ下へ移すexact合計5。`TRANSFER_TO_DECK` にexact集合検証なし。
- C3 `WDK13-008-E1`: トラッシュ→手札の2分岐（合計7／12）。`TRANSFER_TO_HAND` とCHOOSEの双方でexact完了を保証できない。
- C4 `PR-K043-E1`: 手札から好きな枚数を任意discardしてexact合計7。任意コストの完了条件を表す受け皿なし。
- C5 `WXDi-P08-045-E2`: エナから好きな枚数を任意trashしてexact合計8。エナ選択のexact完了条件なし。

いずれも「以下」への近似はしていない。

## 6. 条件以外で見つけた原文との食い違い

2件。

1. `WXK10-050-E2`: 旧 `ENERGY_BY_LEVEL_SUM_LIMIT` は同名に見えるが、自分のエナ全体を数えて超過分を捨てる別動作だった。相手シグニの選択・エナ送りを一切していなかったため置換。
2. `WXK09-047-E1`: 旧targetは `{story:'電機'}` で、自分の別の＜電機＞シグニにも耐性を付け替えられた。原文「このシグニ」に合わせ `{thisCardOnly:true}` と executor identity消費を追加。

## 7. ゲート実測

- `npm run regen`: 完走。decompile全10枚＋下流3生成。
- `npm run gates`: 全緑。
- golden: **2555 PASS / 0 FAIL**（開始2546、+9 test）。
- census: **642 / BASELINE_HIGH 642**（647→642。定数とコメントを今回内容へ更新）。
- smoke: **10693 / OK 10693 / CRASH 0 / HANG 0 / INVARIANT 0 / SKIP 0**。
- fuzz: **200ゲーム、CRASH/HANG/INVARIANT/EXPLOSION 0、SKIP 0**。
- lint: **0 errors / 261 warnings**（開始比±0）。
- `node scripts/groupSimilar.mjs --all`: 同型★ **0**。
- `npm run census:stubs`: 無言A **0種/0件**、C **0種/0箇所**。明示deferは4種/5件。
- `npm run check:manual-fields`: **0 effects / parseStatus違反0**。
- held / partial / idset: **87 / 15 / 46**。
- `censusManualDrift` 削除候補: **1**（`WX10-018-E1`）。
- manualEffects: **412カード**。
- live効果総数: **10693**。
- Condition / ActiveCondition: **122 / 52**（型数不変）。

## 8. 全カード生パースdiff（per-effect）

- 比較方法: 開始HEAD `28d043071` のdetached worktreeと現parserで、同じ6712 CSVカードをシート順に読み、Sheet8を含め先頭BOMを除去して個別parse。effectIdをキーにJSON比較。
- 変化: **9効果**。
- 指定由来8: `WX11-033-BURST`, `WXK06-010-E1`, `WXK10-050-E2`, `WXDi-P08-034-E2`, `WX24-P2-006-E1`, `WX16-034-LAYER`, `WX21-040-E2`, `WXK09-047-E1`。
- outlier **1効果**: `WDK13-007-E1`。同じ「レベル合計がN以下」文型のためfresh parserが `else` 側の `count:2/upToCount/totalLevelMax:5` へ追いついた。liveは開始時からMANUALでBETなし5／BETあり7の両上限を正しく保持しており、live差分は0。
- 未説明outlier: **0**。
- A2とC群5効果は生パース不変。

## 9. held / partial / idset とlintの増減

- 初回build直後は **87→92**。一時増5カードは `WX11-033`, `WXK06-010`, `WXK10-050`, `WXK09-047`, `WDK13-007`。
- 前4カードは全効果をCSV照合して `heldReview --adopt`。`WDK13-007` は既存MANUALがfreshより豊富でliveを変更せず、再build後に基準へ戻った。
- B3のBANISH耐性leafを意味の直接な `GRANT_KEYWORD{keyword:'バニッシュされない'}` へ正規化した際、`WXK09-047` だけが再度一時held（**87→88**）。同じ原文とE2Eを再確認して再採用し **88→87**。
- 最終: held **87（±0）** / partial **15（±0）** / idset **46（±0）**。
- lint: **261 warnings（±0） / 0 errors**。報告直前の最終実測。

## 10. parseStatus遷移

0件。生パース変化9効果はbefore/afterとも `AUTO`。採用live8効果も `parseStatus` は遷移していない。

## 11. 指示書との不一致

1. 「engineは `totalLevelMax` 完備／A群はparser専業」の前提は実コードと異なった。開始時に読むのは `execBanish` だけで、A3/A4/A5/A6の `execGrantKeyword` / `execSendToEnergy` / `execDown` は未消費だった。死フラグを避けるためengine実装を追加した。
2. `ENERGY_BY_LEVEL_SUM_LIMIT` は実装有りだったがA4の正しい実装ではなく、同名の別意味だった。5eに従い流用しなかった。
3. `GRANT_PROTECTION.sourceFilter` はCONTINUOUS経路では完備していたが、B3のAUTO期間付与では `protectionKeyword` がfilterを捨てていた。B1/B2は既存経路、B3は新しい期間store経路が必要だった。
4. A2は指定の注意どおり、SEARCHに受け皿が無かった。

## 12. エンコーディング検査

最終 `git diff --name-only` の全ファイルと新規報告書を開始HEADと比較し、U+FFFD、3文字以上連続する `?`、先頭UTF-8 BOMを機械集計した。結果は **U+FFFD 新規0 / 連続`?` 新規0 / BOM 新規0**。CSVは編集しておらず、`CardData_Sheet8.csv` の既存BOMは今回差分外。
