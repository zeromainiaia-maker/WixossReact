# 段2 第26バッチ報告：〈自分のゾーンの枚数〉に基づく動的な上限（パワー／レベル）

## 1. 触ったファイル

- `src/types/effects.ts` — `CountFromZone` のゾーンと動的 `TargetFilter` 4項目を型宣言。
- `src/engine/execUtils.ts` — `CountFromZone` の数え上げを `countFromZone` に一本化し、hand/acce/trap を追加。
- `src/engine/effectExecutor.ts` — 4項目を `powerRange.max` / `level.max` へ解決。
- `src/data/parserUtils.ts` — 数え元・修飾filter・乗数を本文から読む `parseDynamicCountLimit` を追加。
- `src/data/effectParser.ts` — 動的上限を後段の SIGNI 対象leafに載せ、数え元クラスの誤付着と C4 の誤 `GRANT_KEYWORD` を除去。B3 は既存 `TRASH{ENERGY_CARD,upToCount}` へ構造化。
- `scripts/decompileEffects.ts` — 新フィルタの数え元・乗数・修飾filterを逆翻訳に表示。
- `scripts/goldenTest.ts` — 13効果と併修正1効果の fresh parse → executor E2E を追加。既存「対象クラス誤付着」トリップワイヤは、数え元の nested filter まで誤検出しないよう対象filter直下の `story` だけを見る形へ狭め、直下 `story` を必ず検出する陽性対照を追加。
- `scripts/vocabCensus.ts` — 高シグナル実数低下に合わせ `BASELINE_HIGH` を 701 → 693 に更新。
- `public/data/effects_WX.json` / `effects_WX24_26.json` / `effects_WXK.json` — heldReview 経由で対象効果を curated live へ採用。
- `docs/_held_fresh.json` — 採用後の held 87枚を再生成。
- `docs/_vocab_census.txt` / `docs/_census_stubs.txt` / `docs/_manual_drift.txt` — 対応する計器を再生成。
- `docs/BUGFIXES.md` — 修正と検証値を先頭に追記。
- 本レポート — 原文照合、実行経路、差分、ゲートを記録。

`docs/PLAN.md` / `docs/PLAN_PROGRESS.md` / `stage2_closed.txt` / `manualEffects.ts` は編集していない。

## 2. 調査結果（ガードレール2）

### (a) 対象選択への配線

`resolveDynamicFilter` は `src/engine/effectExecutor.ts:2243` にある。今回の対象actionはすべて候補列挙の直前にこれを呼ぶ。

- `execBanish` の BANISH：`src/engine/effectExecutor.ts:1074`
- `execBounce` の BOUNCE：`src/engine/effectExecutor.ts:1256`
- `execSendToEnergy` の SEND_TO_ENERGY：`src/engine/effectExecutor.ts:1437`
- `execTrash` の `TRASH{SIGNI}`：`src/engine/effectExecutor.ts:1776`

解決後は共通 `fieldCandidates` (`src/engine/execUtils.ts:1256`) が `matchesFilter` を通す。したがって A/B/C 全群で新フィルタは実際の対象候補に作用する。

### (b) 0枚時の fail-closed

`resolveDynamicFilter` は、

- `powerLteZoneCount` を `powerRange.max = countFromZone(...)` (`effectExecutor.ts:2568-2572`)
- `levelLteZoneCount` を `level.max = countFromZone(...)` (`:2573-2577`)
- `powerLteLastProcessedCount` を `powerRange.max = lastProcessedCards.length × multiplier` (`:2578-2582`)
- `levelLteLastProcessedCount` を一致した `lastProcessedCards` の枚数で `level.max` へ解決 (`:2327-2349`)

する。0枚はどれも0として解決され、フィルタが消えない。`matchesFilter` は `level.max` を `execUtils.ts:784-790`、`powerRange.max` を `:827-834` で厳密に落とす。通常のシグニはレベル/パワーが0超なので候補0件になる。各13効果の0枚盤面を golden で固定し、対象が勝手に移動しないことを実行確認した。

### (c) B3/C5 の実処理枚数

- B3：`execTrash` の ENERGY_CARD 分岐は `applyTrashEnergy` (`effectExecutor.ts:1969`) で選択したカードだけを移動し、`resumeSelectTarget` が実選択集合を `lastProcessedCards` に残す (`:8289`, `:8333`, `:8418`)。golden で0枚選択は上限0、3枚選択は上限12000になることを continuation 込みで確認した。
- C5：`execTrash` の DECK_CARD 分岐は実際にデッキ上から移動した `took` を `lastProcessedCards` に設定する (`effectExecutor.ts:2018-2028`)。その後 `levelLteLastProcessedCount` が＜鉱石／宝石＞一致分のみ数える。golden で「5枚ミル中2枚一致 → Lv2は可/Lv3は不可」と0枚一致を固定した。

`CountFromZone` は `resolveCountRef` と動的対象フィルタの両方が共通 `countFromZone` (`src/engine/execUtils.ts:182`) を使う。これにより `hand` など新しい列挙値が既存消費経路でも未対応にならない。

## 3. 採用した効果の全件

JSON は curated live の対象 effect 全体。逆翻訳は該当 effectId の全文。

### A1 `WX06-018-BURST`

- 原文：「パワーが「あなたのトラッシュにある＜ウェポン＞のシグニの枚数×3000」以下の対戦相手のシグニ１体を対象とし、それをバニッシュする。」
- 生成 JSON：`{"effectId":"WX06-018-BURST","effectType":"LIFE_BURST","timing":["ON_LIFE_BURST"],"action":{"type":"BANISH","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ","powerLteZoneCount":{"zone":"trash","owner":"self","filter":{"cardType":"シグニ","story":"ウェポン"},"per":3000}},"upToCount":false}},"duration":"INSTANT","mandatory":false,"parseStatus":"AUTO"}`
- 逆翻訳：「【LB】【ライフバースト】：対戦相手のパワーが「あなたのトラッシュにある＜ウェポン＞のシグニの枚数×3000」以下のシグニ1体をバニッシュする」
- 一致：**Yes**。数え元の＜ウェポン＞は `powerLteZoneCount.filter` だけにあり、対象クラスは無限定。

### A2 `WX09-017-BURST`

- 原文：「パワーが「あなたのトラッシュにある＜鉱石＞と＜宝石＞のシグニを合計した枚数×3000」以下の対戦相手のシグニ１体を対象とし、それをバニッシュする。」
- 生成 JSON：`{"effectId":"WX09-017-BURST","effectType":"LIFE_BURST","timing":["ON_LIFE_BURST"],"action":{"type":"BANISH","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ","powerLteZoneCount":{"zone":"trash","owner":"self","filter":{"cardType":"シグニ","story":["鉱石","宝石"]},"per":3000}},"upToCount":false}},"duration":"INSTANT","mandatory":false,"parseStatus":"AUTO"}`
- 逆翻訳：「【LB】【ライフバースト】：対戦相手のパワーが「あなたのトラッシュにある＜鉱石・宝石＞のシグニの枚数×3000」以下のシグニ1体をバニッシュする」
- 一致：**Yes**。合計枚数と乗数を復元し、対象の鉱石/宝石誤限定を除去。

### A3 `WX11-041-E2`

- 原文：「【クロス自】：このシグニが《ヘブン》したとき、パワーが「あなたのトラッシュにある＜鉱石＞と＜宝石＞のシグニを合わせた枚数×1000」以下の対戦相手のシグニ１体を対象とし、それをバニッシュする。」
- 生成 JSON：`{"effectId":"WX11-041-E2","effectType":"AUTO","timing":["ON_HEAVEN"],"action":{"type":"BANISH","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ","powerLteZoneCount":{"zone":"trash","owner":"self","filter":{"cardType":"シグニ","story":["鉱石","宝石"]},"per":1000}},"upToCount":false}},"duration":"INSTANT","mandatory":true,"parseStatus":"AUTO","crossOnly":true}`
- 逆翻訳：「《羅石　ロズオラ》の左に置かれているかぎり 【クロス自】ヘブンヘブン（すべてのクロスシグニがダウン状態でアタックしたとき）：対戦相手のパワーが「あなたのトラッシュにある＜鉱石・宝石＞のシグニの枚数×1000」以下のシグニ1体をバニッシュする」
- 一致：**Yes**。乗数1000と対象無限定を保持。

### A4 `WX17-Re02-E2`

- 原文：「【出】：パワーが「あなたのトラッシュにある＜龍獣＞のシグニの枚数×1000」以下の対戦相手のシグニ１体を対象とし、それをバニッシュする。」
- 生成 JSON：`{"effectId":"WX17-Re02-E2","effectType":"AUTO","timing":["ON_PLAY"],"action":{"type":"BANISH","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ","powerLteZoneCount":{"zone":"trash","owner":"self","filter":{"cardType":"シグニ","story":"龍獣"},"per":1000}},"upToCount":false}},"duration":"INSTANT","mandatory":true,"parseStatus":"AUTO"}`
- 逆翻訳：「【自】このシグニが場に出たとき：対戦相手のパワーが「あなたのトラッシュにある＜龍獣＞のシグニの枚数×1000」以下のシグニ1体をバニッシュする」
- 一致：**Yes**。数え元の龍獣だけを限定し、対象は無限定。

### A5 `WX12-019-E2`

- 原文：「【起】手札からカード名に《フレイスロ》を含むカードを１枚捨てる：パワーが「あなたのトラッシュにあるカード名に《フレイスロ》を含むカードの枚数×2000」以下の対戦相手のシグニ１体を対象とし、それをバニッシュする。」
- 生成 JSON：`{"effectId":"WX12-019-E2","effectType":"ACTIVATED","timing":["MAIN"],"cost":{"discard":1,"discardFilter":{"cardName":"フレイスロ","cardType":"カード"}},"action":{"type":"BANISH","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ","powerLteZoneCount":{"zone":"trash","owner":"self","filter":{"cardName":"フレイスロ"},"per":2000}},"upToCount":false}},"duration":"INSTANT","mandatory":false,"parseStatus":"AUTO"}`
- 逆翻訳：「【起】（メイン起動）：〈手札から《フレイスロ》カード1枚を捨てる〉対戦相手のパワーが「あなたのトラッシュにある《フレイスロ》カードの枚数×2000」以下のシグニ1体をバニッシュする」
- 一致：**Yes**。`cardName` は既存 `matchesFilter` の部分一致であり、数え元のカード名包含を表す。

### B1 `WX17-027-E3`

- 原文：「【出】《赤》：パワーが「あなたの手札の枚数×4000」以下の対戦相手のシグニ１体を対象とし、それをバニッシュする。」
- 生成 JSON：`{"effectId":"WX17-027-E3","effectType":"AUTO","timing":["ON_PLAY"],"cost":{"energy":[{"color":"赤","count":1}]},"action":{"type":"BANISH","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ","powerLteZoneCount":{"zone":"hand","owner":"self","per":4000}},"upToCount":false}},"duration":"INSTANT","mandatory":false,"parseStatus":"AUTO"}`
- 逆翻訳：「【自】このシグニが場に出たとき：〈《赤×1》〉対戦相手のパワーが「あなたの手札にあるカードの枚数×4000」以下のシグニ1体をバニッシュする」
- 一致：**Yes**。`CountFromZone.zone:'hand'` で現在の手札枚数を読む。

### B2 `WX17-027-BURST`

- 原文：「パワーが「あなたの手札の枚数×4000」以下の対戦相手のシグニ１体を対象とし、それをバニッシュする。」
- 生成 JSON：`{"effectId":"WX17-027-BURST","effectType":"LIFE_BURST","timing":["ON_LIFE_BURST"],"action":{"type":"BANISH","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ","powerLteZoneCount":{"zone":"hand","owner":"self","per":4000}},"upToCount":false}},"duration":"INSTANT","mandatory":false,"parseStatus":"AUTO"}`
- 逆翻訳：「【LB】【ライフバースト】：対戦相手のパワーが「あなたの手札にあるカードの枚数×4000」以下のシグニ1体をバニッシュする」
- 一致：**Yes**。E3と別effectIdとして同じ動的上限を固定。

### B3 `WX25-CP1-080-E1`

- 原文：「【自】：あなたのアタックフェイズ開始時、あなたのエナゾーンから＜ブルアカ＞のカードを４枚までトラッシュに置いてもよい。その後、パワーが「この方法でトラッシュに置いたカードの枚数×4000」以下の対戦相手のシグニ１体を対象とし、それをバニッシュする。」
- 生成 JSON：`{"effectId":"WX25-CP1-080-E1","effectType":"AUTO","timing":["ON_ATTACK_PHASE_START"],"action":{"type":"SEQUENCE","steps":[{"type":"TRASH","target":{"type":"ENERGY_CARD","owner":"self","count":4,"upToCount":true,"filter":{"story":"ブルアカ"}}},{"type":"BANISH","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ","powerLteLastProcessedCount":4000},"upToCount":false}}]},"duration":"INSTANT","mandatory":true,"parseStatus":"AUTO","triggerScope":"self"}`
- 逆翻訳：「【自】あなたのアタックフェイズ開始時：あなたの＜ブルアカ＞のエナを4枚までトラッシュに置く。そして対戦相手のパワーが「この方法で処理したカードの枚数×4000」以下のシグニ1体をバニッシュする」
- 一致：**Yes**。`upToCount:true` により0〜4枚を実選択し、実移動枚数を乗じる。`OPTIONAL_COST` executor は変更していない。

### C1 `WXEX2-55-E1`

- 原文：「【自】：このシグニがアタックしたとき、あなたの場にある＜天使＞のシグニの数以下のレベルを持つ対戦相手のシグニ１体を対象とし、それを手札に戻す。」
- 生成 JSON：`{"effectId":"WXEX2-55-E1","effectType":"AUTO","timing":["ON_ATTACK_SIGNI"],"action":{"type":"BOUNCE","target":{"type":"SIGNI","owner":"opponent","count":1,"upToCount":false,"filter":{"cardType":"シグニ","levelLteZoneCount":{"zone":"field","owner":"self","filter":{"cardType":"シグニ","story":"天使"}}}},"optional":false},"duration":"INSTANT","mandatory":true,"parseStatus":"AUTO","triggerScope":"self"}`
- 逆翻訳：「【自】このシグニがアタックしたとき：対戦相手のあなたの場にある＜天使＞のシグニの枚数以下のレベルを持つシグニ1体を手札に戻す」
- 一致：**Yes**（逆翻訳の語順は近似）。データは自場の天使数をレベル上限にし、対象は相手シグニ。

### C2 `WXEX1-44-E1`

- 原文：「【自】：各アタックフェイズ開始時、あなたの【アクセ】の枚数以下のレベルを持つ対戦相手のシグニ１体を対象とし、それをエナゾーンに置く。」
- 生成 JSON：`{"effectId":"WXEX1-44-E1","effectType":"AUTO","timing":["ON_ATTACK_PHASE_START"],"action":{"type":"SEND_TO_ENERGY","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ","levelLteZoneCount":{"zone":"acce","owner":"self"}}}},"duration":"INSTANT","mandatory":true,"parseStatus":"AUTO","triggerScope":"any"}`
- 逆翻訳：「【自】各アタックフェイズ開始時：対戦相手のあなたの【アクセ】にあるカードの枚数以下のレベルを持つシグニ1体をエナゾーンに置く」
- 一致：**Yes**（逆翻訳の語順は近似）。全 `signi_acce` スロットの実枚数を数える。

### C3 `WXK11-017-E2`

- 原文：「【自】：このシグニがアタックしたとき、あなたのシグニゾーンにあるカードの数以下のレベルを持つ対戦相手のシグニ１体を対象とし、手札を１枚捨ててもよい。そうした場合、それをトラッシュに置く。」
- 生成 JSON：`{"effectId":"WXK11-017-E2","effectType":"AUTO","timing":["ON_ATTACK_SIGNI"],"action":{"type":"SEQUENCE","steps":[{"type":"STUB","id":"OPTIONAL_COST","handDiscard":{"count":1}},{"type":"CONDITIONAL","condition":{"type":"IS_MY_TURN"},"then":{"type":"TRASH","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ","levelLteZoneCount":{"zone":"field","owner":"self","filter":{"cardType":"シグニ"}}}}}}]},"duration":"INSTANT","mandatory":true,"parseStatus":"AUTO","triggerScope":"self"}`
- 逆翻訳：「【自】このシグニがアタックしたとき：手札からカードを1枚捨ててもよい。そうした場合、対戦相手のあなたの場にあるシグニの枚数以下のレベルを持つシグニ1体をトラッシュに置く」
- 一致：**Yes**。既存 `OPTIONAL_COST` と `CONDITIONAL{IS_MY_TURN}` は無変更。数え元は場のトップシグニだけ。

### C4 `WXEX1-67-E1`

- 原文：「【自】：このシグニがアタックしたとき、【トラップ】の数以下のレベルを持つ対戦相手のシグニ１体を対象とし、《青》を支払ってもよい。そうした場合、それを手札に戻す。」
- 生成 JSON：`{"effectId":"WXEX1-67-E1","effectType":"AUTO","timing":["ON_ATTACK_SIGNI"],"action":{"type":"SEQUENCE","steps":[{"type":"CONDITIONAL","condition":{"type":"IS_MY_TURN"},"then":{"type":"BOUNCE","target":{"type":"SIGNI","owner":"opponent","count":1,"upToCount":false,"filter":{"cardType":"シグニ","levelLteZoneCount":{"zone":"trap","owner":"self"}}},"optional":false}}]},"duration":"INSTANT","mandatory":true,"parseStatus":"AUTO","triggerScope":"self"}`
- 逆翻訳：「【自】このシグニがアタックしたとき：そうした場合、対戦相手のあなたの【トラップ】にあるカードの枚数以下のレベルを持つシグニ1体を手札に戻す」
- 一致：**No（動的上限は一致）**。`levelLteZoneCount{zone:'trap'}` と対象移動は一致し、原文に無い `GRANT_KEYWORD{トラップ}` も除去した。ただし既存liveで落ちていた任意の《青》支払いは今回の上限スコープで新規実装せず、保護指示どおり `CONDITIONAL{IS_MY_TURN}` は維持した。

### C5 `WX08-036-E2`

- 原文：「【起】《赤》このシグニを場からトラッシュに置く：あなたのデッキの上からカードを５枚トラッシュに置く。その後、この効果でトラッシュに置かれた＜鉱石＞と＜宝石＞のシグニを合わせた枚数以下のレベルを持つシグニ１体を対象とし、それをバニッシュする。」
- 生成 JSON：`{"effectId":"WX08-036-E2","effectType":"ACTIVATED","timing":["MAIN"],"cost":{"energy":[{"color":"赤","count":1}],"trash_self":true},"action":{"type":"SEQUENCE","steps":[{"type":"TRASH","target":{"type":"DECK_CARD","owner":"self","count":5}},{"type":"BANISH","target":{"type":"SIGNI","owner":"any","count":1,"filter":{"cardType":"シグニ","levelLteLastProcessedCount":{"cardType":"シグニ","story":["鉱石","宝石"]}},"upToCount":false}}]},"duration":"INSTANT","mandatory":false,"parseStatus":"AUTO"}`
- 逆翻訳：「【起】（メイン起動）：〈《赤×1》＋このシグニを場からトラッシュに置く〉あなたのデッキの上からカードを5枚トラッシュに置く。そして自分または対戦相手のこの方法で処理した＜鉱石・宝石＞のシグニの枚数以下のレベルを持つシグニ1体をバニッシュする」
- 一致：**Yes**。対象 `owner:'any'` を維持し、鉱石/宝石は数え元のみ。

### 併修正 `WXK03-074-E1`

- 原文：「この方法でトラッシュに置かれた＜武勇＞のシグニの枚数と同じレベルを持つ対戦相手のシグニ１体を対象とし、それをバニッシュする。」
- 生成 JSON：`{"effectId":"WXK03-074-E1","effectType":"AUTO","timing":["ON_PLAY"],"cost":{"energy":[{"color":"黒","count":1}]},"action":{"type":"SEQUENCE","steps":[{"type":"TRASH","target":{"type":"DECK_CARD","owner":"self","count":5}},{"type":"BANISH","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ","levelEqLastProcessedCount":{"cardType":"シグニ","story":"武勇"}},"upToCount":false}}]},"duration":"INSTANT","mandatory":false,"parseStatus":"AUTO"}`
- 逆翻訳：「【自】このシグニが場に出たとき：〈《黒×1》〉あなたのデッキの上からカードを5枚トラッシュに置く。そして対戦相手のこの方法で処理した＜武勇＞のシグニの枚数と同じレベルのシグニ1体をバニッシュする」
- 一致：**Yes**。既存 `levelEqLastProcessedCount` の武勇filterを保持し、対象自体の `story:'武勇'` だけを除去。

## 4. 見送った効果

0件。依頼13効果の動的上限はすべて採用した。`WXEX1-67-E1` の任意の《青》支払い脱落は、動的上限とは別の事項として「効果全体の Yes」にはせず、本バッチでは未修正とした。

## 5. 条件以外で見つけた原文との食い違い

1効果に2点（う1点修正、1点残置）。

- `WXEX1-67-E1` の `GRANT_KEYWORD{keyword:'トラップ'}` は原文に付与文が無く、「【トラップ】の数」の先頭語を parser がキーワード付与と誤分割したものと確定。除去した。
- 同効果の「《青》を支払ってもよい」は live/fresh とも action に存在しない。逆翻訳が支払いを表示しないことで再確認した。これを直すと任意コストの別スコープに入るため、指示どおり `CONDITIONAL{IS_MY_TURN}` には触れず残した。

その他、今回の13効果の上限と無関係な兄弟効果の新規食い違いは0件。heldReview のカード単位採用が一時的に連れてきた `WX08-036-E1` / `WX25-CP1-080-E2` の既存 held 差分は curated へ採用せず、再build後に当該兄弟が HEAD と同一であることを effectId 単位で機械確認した。

## 6. ゲート数値（before → after）

| 計器 | before | after |
|---|---:|---:|
| `npm run golden` | PASS 2464 / FAIL 0 | **PASS 2478 / FAIL 0** |
| `npm run census` | 高シグナル欠落 701 / BASELINE 701 | **693 / BASELINE 693** |
| `npm run smoke` | 10693効果、全0、SKIP 0 | **10693効果、CRASH/HANG/INVARIANT 0、SKIP 0** |
| `npm run fuzz` | 全0 | **CRASH/HANG/INVARIANT/EXPLOSION 0** |
| `npm run census:stubs` | A群🔴0 / C群0 | **A群🔴0 / C群0** |
| `npm run check:manual-fields` | 0 / 0 | **0 / 0** |
| lint | 0 errors / 261 warnings | **0 errors / 261 warnings** |
| `node scripts/groupSimilar.mjs --all` | 同型★0 | **同型★0** |
| held / partial / idset | 87 / 15 / 46 | **87 / 15 / 46** |
| manual drift 削除候補 | 86 | **86** |
| `npm run census:goldentypes` | 未カバー0 | **未カバー0（147/147）** |

`npm run gates` も最後に実行し、同値で全緑を確認した。

## 7. 生パース diff の変化集合と outlier

- 開始前：`tmp_stage2_batch26_before.json` — `rows=6712 / effects=10660 / bytes=4936697`
- parser変更後：`tmp_stage2_batch26_after_parser.json` — `rows=6712 / effects=10660 / bytes=4937638`

effectId 単位の変化集合は次の14件だけ。

1. `WX06-018-BURST`
2. `WX08-036-E2`
3. `WX09-017-BURST`
4. `WX11-041-E2`
5. `WX12-019-E2`
6. `WX17-027-E3`
7. `WX17-027-BURST`
8. `WX17-Re02-E2`
9. `WXEX1-44-E1`
10. `WXEX1-67-E1`
11. `WXEX2-55-E1`
12. `WXK03-074-E1`（依頼で併修正可とされた数え元クラス誤付着）
13. `WXK11-017-E2`
14. `WX25-CP1-080-E1`

指定13効果＋許可された併修正1効果以外の outlier は **0件**。curated live JSON の HEAD 比較も同じ14 effectId のみで、兄弟効果の変化は0。

## 8. held / partial / idset、増分照合、lint warning

- held：**87 → 87**
- partial：**15 → 15** (`docs/_partial_fresh.json` のカード数)
- idset：**46 → 46**
- lint warning：**261 → 261**（errors 0）
- manual drift 削除候補：**86 → 86**

初回 `build:effects` は情報の純追加を自動採用し、クラス誤付着除去やaction構造変更を held へ送った。対象カードは `node scripts/heldReview.mjs --adopt ...` だけで採用した。カード単位adoptで既存 held の無関係な兄弟2効果まで一時的に変化したため、その2効果は非採用として従来 curated を維持し、再buildで held 87 に戻ることを確認した。

増えた生パース差分は上訔14件で、各々CSV原文と照合した結果は§3のとおり。13件の動的上限と `WXK03-074-E1` の対象クラス誤限定除去は採用相当。それ以外の増分は0件なので据置判断の追加対象は無い。

## 9. やらなかったことの申告

### 新設フィールと消費地点

- `TargetFilter.powerLteZoneCount` — 型 `src/types/effects.ts:791`、消費 `src/engine/effectExecutor.ts:2568-2572`。
- `TargetFilter.levelLteZoneCount` — 型 `src/types/effects.ts:792`、消費 `src/engine/effectExecutor.ts:2573-2577`。
- `TargetFilter.powerLteLastProcessedCount` — 型 `src/types/effects.ts:794`、消費 `src/engine/effectExecutor.ts:2578-2582`。
- `TargetFilter.levelLteLastProcessedCount` — 型 `src/types/effects.ts:686`、消費 `src/engine/effectExecutor.ts:2327-2349`。
- `CountFromZone.zone` に追加した列挙値 `hand` / `acce` / `trap` — 型 `src/types/effects.ts:162-167`、唯一の解決器 `src/engine/execUtils.ts:182-204`。`resolveCountRef` も `:143-146` から同解決器を呼ぶ。

parserの生成地点は `parseDynamicCountLimit` (`src/data/parserUtils.ts:307-348`) と `applyDynamicCountTargetLimit` (`src/data/effectParser.ts:12384-12450`)。通常効果は `effectParser.ts:14507`、ライフバーストは `:15472` で適用される。JSONにだけ存在する死フラグは無い。

### 明示的にやらなかったこと

- 新しい action 型、state、`Condition` / `ActiveCondition` は作っていない。
- 既存 golden の元の意図（別節のクラスを対象filter直下へ付けない）は変えていない。新しい数え元filterを対象限定と誤解しないよう探索範囲を正し、同assertが空振りしない陽性probeを追加した。
- `manualEffects.ts` に写していない。作業前後の manual drift 削除候補は86のまま。
- `buildEffectsJson.ts` に force-adopt リストを作っていない。
- `STUB{OPTIONAL_COST}` executor は変更していない。C3の任意手札捨ても無変更。B3は原文の効果処理を既存 `TRASH{ENERGY_CARD,upToCount:true}` で表現した。
- C3/C4 の `CONDITIONAL{IS_MY_TURN}` を外していない。
- C5 の `owner:'any'` を変えていない。
- `WXEX1-67-E1` の欠落した《青》任意支払いは、別スコープの宿題として実装していない。
- 数値、クラス名、カード名、カード番号を regex の分岐ガードに決め打ちしていない。すべて原文の捕捉値からデータ化した。
- スコープ外の兄弟効果を採用していない。
- `docs/PLAN.md` / `docs/PLAN_PROGRESS.md` / `stage2_closed.txt` を編集していない。commit / push もしていない。
