# §6.2 段2 第24バッチ報告 — 「相手を対象→あなたの＜クラス＞を犠牲」の owner 混線

## 結論

指定9効果を1件ずつ原文照合し、必須・場のシグニ1体犠牲を既存語彙で正確に実行できる6効果を採用した。第1ステップは `owner:'self'` となり、先行する相手対象の `level` / `infected` は犠牲側へ混入せず、「レゾナではない」「他の」は犠牲側に残る。全カード生パースの最終変化集合は指定6効果だけで outlier 0。

`WXEX2-70-E1` は任意犠牲経路かつ fresh/live の第2ステップに既存乖離があり、カード単位採用でスコープ外まで変えるため据置。`WX07-039-E2` と `WXEX1-14-E2` は現 engine が count=3 の「全数払えなければ不発」を保証できないため据置。新しい型・フィールド・engine変更はない。`CONDITIONAL{IS_MY_TURN}`、`optional:true`、`excludeSelf:true` は維持した。

## 1. 触ったファイルと各1行の理由

| ファイル | 理由 |
|---|---|
| `src/data/parsers/parseSentencePart1.ts` | 相手対象宣言の後に続く、クラス明示・必須・自分のシグニ1体犠牲の名詞句だけを局所parseする一般規則を追加。 |
| `scripts/goldenTest.ts` | 採用6効果を各3方向E2E固定し、見送り3効果を非採用契約として固定。既存 `WXEX2-18-E2` tripwireを新しい正構造に合わせて非空振り更新。 |
| `public/data/effects_WX.json` | `heldReview --adopt` でWX系5効果のfreshを採用。兄弟効果は不変。 |
| `public/data/effects_WXDi.json` | `heldReview --adopt` で `WXDi-P08-081-E1 c0` のfreshを採用。c1は不変。 |
| `docs/decompile_sheet2.txt` | `WX14-031-E3` の逆翻訳を再生成。 |
| `docs/decompile_sheet3.txt` | `WX22-001-E2` / `WXEX2-18-E2` / `WXEX2-27-E2` / `WXEX2-79-E2` の逆翻訳を再生成。 |
| `docs/decompile_sheet8.txt` | `WXDi-P08-081-E1` の逆翻訳を再生成。 |
| `docs/grouped_sentence_all.txt` | `npm run regen` の下流文型グループを更新。 |
| `docs/_census_stubs.txt` | parserへの行追加に伴う既存DEFERRED STUBの生成元行番号だけを再生成。件数不変。 |
| `docs/BUGFIXES.md` | 第24バッチの一次記録を先頭へ追記。 |
| `scripts/archive/scratchpad/semantic_audit_clean_round1/stage2_batch24_report.md` | 本報告書。 |

## 2. 調査結果 — ガードレール2 (a)(b)(c)

### (a) owner=self の第1ステップと did-it ゲート

**count=1 の採用6効果は正しく評価できる。該当犠牲が0体なら本体は走らない。**

- 根因は `signiClauseOwner` が全文に「対戦相手」を含むだけで先に `opponent` を返すこと（`src/data/parserUtils.ts:592-605`）と、その全文を `parseSigniTarget`（同 `:608`）へ渡していたこと。ownerだけでなく先行節のlevel・infectedも混入した。
- 新設 `parseRequiredSelfSigniSacrifice`（`src/data/parsers/parseSentencePart1.ts:130-140`）は、「相手シグニを対象とし、あなたの＜クラス＞のシグニ1体を必須でBANISH/TRASH」の後半名詞句だけを `parseSigniTarget(...,'self')` へ渡す。BANISH/TRASHの既存分岐から利用する（同 `:1648`、`:1827`）。
- `selectOrInteract` は候補0件で `lastProcessedCards:[]` を返し（`src/engine/execUtils.ts:2596,2654-2658`）、成功時は `resumeSelectTarget` が実処理後に選択集合を記録する（`src/engine/effectExecutor.ts:8270-8276,8377-8400`）。
- BANISHは `DID_IT_GATED_TYPES` に含まれ（同 `:3852-3861`）、`execSequence` のdid-it判定が空集合なら直後の `CONDITIONAL{IS_MY_TURN}` を消費する（同 `:3871,4922-4950`）。self TRASHは実行前に残留値を消し（同 `:4855-4861`）、空集合なら残りSEQUENCEを止める（同 `:4906-4913`）。
- goldenは各採用効果について、①自分の該当クラスが正しい移動先へ行き相手盤面は第1ステップで減らない、②支払えば本体が動く、③該当犠牲0体なら本体が動かない、を実live actionで固定した。

### (b) count>1 の全数支払い

**現状は安全に表現できないため B1/B2 は据置。**

- `selectOrInteract` は候補0件だけを空振りにし、候補が1～2枚でも `count:3` のpendingを作る（`src/engine/execUtils.ts:2654-2666`）。
- UIの `canConfirm` は非upTo時に選択数がcountと完全一致するまで確定不能（`src/screens/battle/modals/EffectInteractionModal.tsx:627-633`）。候補1～2枚では閉じられない。
- 一方 `resumeSelectTarget` は最大数超過をsliceするだけで最低数を検証せず（`src/engine/effectExecutor.ts:8270-8277`）、選ばれた1～2枚を処理して `lastProcessedCards` を非空にし後続を実行できる（同 `:8377-8422`）。したがって「3体/3枚すべて払えた場合だけ」を保証できない。

### (c) エナゾーン3枚の既存対象型

**対象型は既存だが、(b) の全数支払い問題が残るため B2 は据置。**

- `EffectTarget.type` に `ENERGY_CARD` が既にある（`src/types/effects.ts:793-804`）。
- `execTrash` は `ENERGY_CARD` の候補をエナから作り、選択分をエナからトラッシュへ移す（`src/engine/effectExecutor.ts:1752,1953-2015`）。新型は不要。
- しかしcount=3は上記不足時のsoft-lock／部分支払い問題がある。対象型だけ正して後段を過剰発火させないため、`WXEX1-14-E2` は丸ごと据置いた。

## 3. 採用した効果の全件

「一致」は効果全文について判定した。今回の犠牲節は全件一致したが、禁止スコープである最初に対象とした相手シグニへの参照束縛が未実装なので、全文判定は全件Noである。

### `WX14-031-E3`

- 原文の該当節：`対戦相手のシグニ１体を対象とし、あなたの他の＜天使＞のシグニ１体をバニッシュする。そうした場合、ターン終了時まで、それのパワーを－3000する。`
- 生成JSON：`{"type":"SEQUENCE","steps":[{"type":"BANISH","target":{"type":"SIGNI","owner":"self","count":1,"filter":{"cardType":"シグニ","story":"天使","excludeSelf":true},"upToCount":false}},{"type":"CONDITIONAL","condition":{"type":"IS_MY_TURN"},"then":{"type":"POWER_MODIFY","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ"}},"delta":-3000}}]}`
- 逆翻訳全文：`【起】（アタックフェイズ起動）/（メイン起動）：《once_per_turn》〈《黒×1》〉あなたの他の＜天使＞のシグニ1体をバニッシュする。そうした場合、対戦相手のシグニ1体のパワーを－3000する`
- 一致：**No（犠牲節はYes）**。owner/self、天使、他の、1体は一致。本体が最初の対象を保持せず相手シグニを再選択する。

### `WX22-001-E2`

- 原文の該当節：`対戦相手のシグニ１体を対象とし、あなたの＜遊具＞のシグニ１体を場からトラッシュに置く。そうした場合、ターン終了時まで、それのパワーを－12000する。`
- 生成JSON：`{"type":"SEQUENCE","steps":[{"type":"TRASH","target":{"type":"SIGNI","owner":"self","count":1,"filter":{"cardType":"シグニ","story":"遊具"},"upToCount":false}},{"type":"CONDITIONAL","condition":{"type":"IS_MY_TURN"},"then":{"type":"POWER_MODIFY","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ"}},"delta":-12000}}]}`
- 逆翻訳全文：`【起】（アタックフェイズ起動）/（メイン起動）：《once_per_turn》〈《黒×0》〉あなたの＜遊具＞のシグニ1体をトラッシュに置く。そうした場合、対戦相手のシグニ1体のパワーを－12000する`
- 一致：**No（犠牲節はYes）**。自分の遊具1体を場からトラッシュに置く点は一致。本体の対象束縛がない。

### `WXEX2-18-E2`

- 原文の該当節：`対戦相手のシグニ１体を対象とし、レゾナではないあなたの＜遊具＞のシグニ１体をバニッシュする。そうした場合、それをエナゾーンに置く。`
- 生成JSON：`{"type":"SEQUENCE","steps":[{"type":"BANISH","target":{"type":"SIGNI","owner":"self","count":1,"filter":{"cardType":"シグニ","story":"遊具","excludeResona":true},"upToCount":false}},{"type":"CONDITIONAL","condition":{"type":"IS_MY_TURN"},"then":{"type":"SEND_TO_ENERGY","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ"},"upToCount":false}}}]}`
- 逆翻訳全文：`【起】（メイン起動）：《once_per_turn》〈《緑×0》〉あなたの＜遊具＞のレゾナではないシグニ1体をバニッシュする。そうした場合、対戦相手のシグニ1体をエナゾーンに置く`
- 一致：**No（犠牲節はYes）**。owner/self、遊具、非レゾナ、1体は一致。本体が最初の対象を保持しない。

### `WXEX2-27-E2`

- 原文の該当節：`対戦相手のシグニ１体を対象とし、あなたの＜遊具＞のシグニ１体を場からトラッシュに置く。そうした場合、それをトラッシュに置く。`
- 生成JSON：`{"type":"SEQUENCE","steps":[{"type":"TRASH","target":{"type":"SIGNI","owner":"self","count":1,"filter":{"cardType":"シグニ","story":"遊具"},"upToCount":false}},{"type":"CONDITIONAL","condition":{"type":"IS_MY_TURN"},"then":{"type":"TRASH","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ"}}}}]}`
- 逆翻訳全文：`【起】（アタックフェイズ起動）：《once_per_turn》〈《黒×1》〉あなたの＜遊具＞のシグニ1体をトラッシュに置く。そうした場合、対戦相手のシグニ1体をトラッシュに置く`
- 一致：**No（犠牲節はYes）**。自分の遊具1体を場からトラッシュに置く点は一致。本体の対象束縛がない。

### `WXEX2-79-E2`

- 原文の該当節：`対戦相手の感染状態のシグニ１体を対象とし、あなたの他の＜微菌＞のシグニ１体をバニッシュする。そうした場合、ターン終了時まで、それのパワーをこの方法でバニッシュしたシグニのパワーと同じだけ－（マイナス）する。`
- 生成JSON：`{"type":"SEQUENCE","steps":[{"type":"BANISH","target":{"type":"SIGNI","owner":"self","count":1,"filter":{"cardType":"シグニ","story":"微菌","excludeSelf":true},"upToCount":false}},{"type":"CONDITIONAL","condition":{"type":"IS_MY_TURN"},"then":{"type":"STUB","id":"POWER_MOD_PER_COUNT"}}]}`
- 逆翻訳全文：`【起】（メイン起動）：《once_per_turn》〈《黒×1》〉あなたの他の＜微菌＞のシグニ1体をバニッシュする。そうした場合、[STUB:動的パワー修正（COUNT依存）]`
- 一致：**No（犠牲節はYes）**。infected誤付着を除き、owner/self、微菌、他の、1体は一致。本体はSTUBで、対象束縛もない。

### `WXDi-P08-081-E1` `choices[0]` (`c0`)

- 原文の該当節：`①対戦相手のシグニ１体を対象とし、あなたの＜悪魔＞のシグニ１体を場からトラッシュに置く。そうした場合、ターン終了時まで、それのパワーを－10000する。`
- 生成JSON：`{"type":"CHOOSE","choose_count":1,"from_count":2,"choices":[{"choiceId":"c0","label":"選択肢1","action":{"type":"SEQUENCE","steps":[{"type":"TRASH","target":{"type":"SIGNI","owner":"self","count":1,"filter":{"cardType":"シグニ","story":"悪魔"},"upToCount":false}},{"type":"CONDITIONAL","condition":{"type":"IS_MY_TURN"},"then":{"type":"POWER_MODIFY","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ"}},"delta":-10000}}]}},{"choiceId":"c1","label":"選択肢2","action":{"type":"TRANSFER_TO_HAND","source":{"type":"TRASH_CARD","owner":"self","count":1,"upToCount":false,"filter":{"cardType":"シグニ","story":"悪魔"}}}}]}`
- 逆翻訳全文：`【起】（メイン起動）：〈《黒×1》〉以下の2つから1つを選ぶ【あなたの＜悪魔＞のシグニ1体をトラッシュに置く。そうした場合、対戦相手のシグニ1体のパワーを－10000する / あなたの＜悪魔＞のシグニ(トラッシュ)1枚を手札に加える】`
- 一致：**No（c0犠牲節とc1はYes）**。c0の自分の悪魔1体を場からトラッシュに置く点は一致。c0本体の対象束縛がない。

## 4. 見送った効果の全件＋理由

| effectId | 判断 | 理由 | golden |
|---|---|---|---|
| `WXEX2-70-E1` | **丸ごと据置** | 「してもよい」は必須犠牲規則の対象外。さらにfreshは犠牲側を直すだけでなく、第2ステップをliveの `ENERGY_CHARGE{DECK_CARD,self}` から `SEND_TO_ENERGY{SIGNI,opponent}` へ変える既存乖離を含む。カード単位adoptで禁止された第2ステップまで変えるため採用しない。liveの `optional:true` は維持。 | live/fresh双方で第1ステップ `owner:'opponent'` と `optional:true` を固定。 |
| `WX07-039-E2` | **丸ごと据置** | 原文の3体犠牲へcountを直すと、候補1～2体でUI確定不能、外部resumeでは部分支払い後に本体発火可能。全数支払いを表現できないためowner/countとも既存のまま。 | live/fresh双方で第1ステップ `owner:'opponent',count:1` を非採用契約として固定。 |
| `WXEX1-14-E2` | **丸ごと据置** | `ENERGY_CARD` とエナ→トラッシュ実装は既存だが、エナ3枚の全数支払い保証がない。zone/owner/countだけ部分修正して過剰発火を作らないため据置。 | live/fresh双方で既存 `target.type:'SIGNI',owner:'opponent'` を固定。 |

## 5. 条件以外で見つけた原文との食い違い

1. **9効果すべて**：原文は最初に対象とした相手シグニを「それ」で参照するが、liveには対象宣言・保存がなく、第2ステップが一般の `{owner:'opponent',count:1}` を新しく選ぶ。ユーザー指定どおり今回は変更していない。
2. **`WXEX2-79-E2`**：第2ステップは `STUB{POWER_MOD_PER_COUNT}`。非structured fallbackは対象未保存時に全相手シグニへ修正を積む（`src/engine/execStubPart1.ts:1620-1642,1749-1758`）ため、原文の感染状態の対象1体限定と一致しない。今回は犠牲側だけ直した。
3. **`WXEX2-70-E1`**：実リポジトリのlive第2ステップは `ENERGY_CHARGE{DECK_CARD,self,count:1}` で、原文の「それをエナゾーンに置く」と不一致。freshは `SEND_TO_ENERGY{SIGNI,opponent}` まで生成する。この既存live/fresh乖離は第2ステップなので据置いた。

上記以外は0件。

## 6. ゲート数値（before → after）

| 計器 | before | after |
|---|---:|---:|
| `npm run golden` | PASS 2448 / FAIL 0 | **PASS 2455 / FAIL 0** |
| `npm run census` | 高シグナル 702 / baseline 702 | **702 / 702** |
| `npm run smoke` | 10693効果、CRASH/HANG/INVARIANT/SKIP 全0 | **10693効果、全0** |
| `npm run fuzz` | 全0 | **seed 12648430、200 games / max 40 turns、CRASH/HANG/INVARIANT/EXPLOSION 全0、SKIP 0** |
| `npm run census:stubs` | A群🔴0 / C群0 | **A群🔴0 / C群0**（Aの5件は全て明示DEFERRED） |
| `npm run check:manual-fields` | field loss 0 / parseStatus違反0 | **0 / 0** |
| lint | 0 errors / 261 warnings | **0 errors / 261 warnings** |
| `node scripts/groupSimilar.mjs --all` | 同型★0 | **同型★0** |
| held / partial / idset | 88 / 15 / 46 | **88 / 15 / 46** |
| `censusManualDrift` 削除候補 | 86 | **86** |

最終編集後に `npm run gates` を再実行し、全項目PASSを確認した。

## 7. 生パース diff の変化集合（effectId単位）と outlier

修正前に全6712 CSV行を固定順で `parseCardEffects` したsnapshot（10660効果、4,936,481 bytes）を取り、修正後snapshot（4,936,462 bytes）と effectId 単位で機械比較した。

最初の一般規則では指定6効果に加えて `WX16-033-BURST` / `WXEX1-52-E2` / `WXK03-018-E1` のクラス無指定3効果も変化した。3件を原文照合し、このバッチの「＜クラス＞犠牲」外と判断して、クラスマーカーを文型ガードに追加した。

最終変化集合は次の**6効果だけ**：

1. `WX14-031-E3` — BANISH犠牲 `owner:opponent→self`。天使・`excludeSelf` 維持。
2. `WX22-001-E2` — TRASH犠牲 `owner:opponent→self`。遊具維持。
3. `WXEX2-18-E2` — BANISH犠牲 `owner:opponent→self`、`excludeResona:true` 復元。
4. `WXEX2-27-E2` — TRASH犠牲 `owner:opponent→self`。遊具維持。
5. `WXEX2-79-E2` — BANISH犠牲 `owner:opponent→self`、相手対象由来 `infected:true` を除去、`excludeSelf` 維持。
6. `WXDi-P08-081-E1 c0` — TRASH犠牲 `owner:opponent→self`。c1不変。

`WX14-031` / `WX22-001` / `WXEX2-18` / `WXEX2-27` / `WXEX2-79` / `WXDi-P08-081` の兄弟効果は不変。live JSONの変化集合も同じ6 effectIdだけ。**最終outlier: 0効果。**

## 8. held / partial / idset の増減、増分照合、lint warning

- 初回 `build:effects`：held **88→94**、partial **15→15**、idset **46→46**。増分6カードは最終生パース変化集合と1対1。
- `WX14-031`：E3だけ変化。原文の他の天使1体犠牲と一致し採用。
- `WX22-001`：E2だけ変化。原文の自分の遊具1体TRASHと一致し採用。
- `WXEX2-18`：E2だけ変化。原文の非レゾナ遊具1体犠牲と一致し採用。
- `WXEX2-27`：E2だけ変化。原文の自分の遊具1体TRASHと一致し採用。
- `WXEX2-79`：E2だけ変化。原文の他の微菌1体犠牲と一致し、infectedは相手対象側なので犠牲から除去して採用。
- `WXDi-P08-081`：E1 c0だけ変化。c1不変。原文の自分の悪魔1体TRASHと一致し採用。
- `node scripts/heldReview.mjs --adopt WX14-031,WX22-001,WXEX2-18,WXEX2-27,WXEX2-79,WXDi-P08-081` で6増分を個別採用。再build後 held **94→88**、partial **15**、idset **46**。
- `censusManualDrift` の削除候補 **86→86**。parserが同じ実体を出せるため `manualEffects.ts` への影武者コピーはしていない。
- lint warning **261→261**、増減0。errors 0。

## 9. やらなかったことの申告

- `CONDITIONAL{"condition":{"type":"IS_MY_TURN"}}` を削除・変更していない。
- 第2ステップの対象選択／「それ」の束縛を修正していない。
- `WXEX2-70-E1` の `optional:true`、`WX14-031-E3` / `WXEX2-70-E1` / `WXEX2-79-E2` の `excludeSelf:true` を削除していない。
- count>1の完済保証を推測で追加せず、`WX07-039-E2` / `WXEX1-14-E2` は据置いた。
- カード番号・天使・遊具・微菌・悪魔などの具体クラス名をparser規則へ埋め込んでいない。
- 新しい型・フィールド・ゾーン種別を作っていない。engineファイルも変更していない。
- `manualEffects.ts` を変更していない。トップレベルMANUAL/PARTIALの写しを作っていない。
- `buildEffectsJson.ts` にforce-adoptリストを追加していない。採用は `heldReview --adopt` だけ。
- `isPureSuperset` の自動採用差分を手でHEADへ戻していない。
- `docs/PLAN.md` / `docs/PLAN_PROGRESS.md` / `stage2_closed.txt` は編集していない。
- commit / push はしていない。
