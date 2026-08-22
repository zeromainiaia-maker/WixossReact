# §6.2 段2 第20バッチ報告

## 1. 触ったファイル

- `src/data/effectParser.ts`：文型「手札に加えるか場に出す／出し」のデッキSEARCHだけへ `handOrField:true` を付ける一般後処理を追加。CHOOSE内には潜らない。
- `src/types/effects.ts`：`SearchAction.handOrField` を宣言。
- `src/engine/effectExecutor.ts`：`execSearch` が同フラグを pending SEARCH へ渡す配線を追加。
- `scripts/decompileEffects.ts`：SEARCHの二択を逆翻訳へ表示。
- `scripts/goldenTest.ts`：採用11効果ごとの手札枝・場枝・満杯時手札枝E2Eと、非採用2件の契約を追加。
- `public/data/effects_WX.json` / `effects_WXK.json`：採用11効果のlive JSON。
- `docs/decompile_sheet1.txt` / `sheet2.txt` / `sheet4.txt`、`docs/_census_stubs.txt`、`docs/grouped_sentence_all.txt`：指定再生成物。
- `docs/BUGFIXES.md`：一次記録。本報告：全件の採否・計測・判断根拠。

## 2. 調査結果

13件すべてについて `public/data/CardData_Sheet*.csv` の該当カード行を直接読み直した。全13件に指定の「手札に加えるか場に出す／出し」があり、CSV候補の false positive は0件。ただしlive実装上は `WXEX2-49-E2` が既に別名の正しい二択経路を持つため、修正候補としては false positive だった。

原文再実測結果：

| effectId | CSV原文 |
|---|---|
| WX08-023-BURST | ：あなたのデッキから＜宇宙＞のシグニ１枚を探して公開し手札に加えるか場に出し、デッキをシャッフルする。 |
| WX09-016-BURST | ：あなたのデッキから白か黒のシグニ１枚を探して公開し手札に加えるか場に出し、デッキをシャッフルする。 |
| WX09-CB02-E2 | 【自】：このシグニがバニッシュされたとき、《緑》を支払ってもよい。そうした場合、あなたのデッキからレベル３以下の《終末の回旋　チェロン》以外の＜美巧＞のシグニ１枚を探して公開し手札に加えるか場に出し、デッキをシャッフルする。 |
| WX11-026-BURST | ：あなたのデッキから＜天使＞のシグニ１枚を探して公開し、手札に加えるか場に出し、デッキをシャッフルする。 |
| WX16-024-BURST | ：あなたのデッキから＜怪異＞のシグニを１枚探して公開し、手札に加えるか場に出し、デッキをシャッフルする。 |
| WX17-Re01-E1 | あなたの＜天使＞のシグニ１体を対象とし、それをバニッシュする。そうした場合、あなたのデッキから＜天使＞のシグニ１枚を探して公開し、手札に加えるか場に出し、デッキをシャッフルする。 |
| WX20-023-BURST | ：あなたのデッキから【レイヤー】を持つシグニ１枚を探して公開し、手札に加えるか場に出し、デッキをシャッフルする。 |
| WX20-050-E2 | 【自】：対戦相手のターンの間、このシグニが場を離れたとき、あなたのデッキからカード名に《ニャローブ》を含むシグニ１枚を探して公開し手札に加えるか場に出し、デッキをシャッフルする。 |
| WXK08-024-BURST | ：あなたのデッキから＜電機＞のシグニ１枚を探して公開し手札に加えるか場に出し、デッキをシャッフルする。 |
| WXK08-040-BURST | ：あなたのデッキから＜電機＞のシグニ１枚を探して公開し手札に加えるか場に出し、デッキをシャッフルする。 |
| WXK11-022-BURST | ：あなたのデッキからレベル３以下のシグニ１枚を探して公開し手札に加えるか場に出し、デッキをシャッフルする。 |
| SP27-005-E1 | 【自】：このシグニがバニッシュされたとき、《青》を支払ってもよい。そうした場合、あなたのデッキの上から＜水獣＞のシグニがめくれるまで公開し、そのシグニを手札に加えるか場に出す。残りをシャッフルしてデッキの一番下に置く。 |
| WXEX2-49-E2 | 【自】：このシグニがアタックしたとき、あなたのデッキの上からカードを３枚トラッシュに置く。その後、この方法でトラッシュに置かれたカードの中からシグニ１枚を対象とし、それを手札に加えるか場に出す。 |

採用11件の pending 経路は `effectExecutor.ts:3758` `execSearch` → pending SEARCH（今回フラグを伝播）→ `effectExecutor.ts:8562-8581` の `pending.handOrField` 分岐 → 手札は `execStubPart1.ts:1965-1975` の `INTERNAL_PICK_TO_HAND`、場は `PLACE_SIGNI_ON_FIELD`。満杯時も手札 option はavailable、場 optionだけ unavailable。

`WXEX2-49-E2` は `execStubPart2.ts:2480-2550` の `PICK_FROM_TRASHED_CARDS` → `INTERNAL_TRASHED_PICK_HAND_OR_FIELD`。直前の `lastProcessedCards ∩ trash` だけを候補にし、既に二択を出す。`SP27-005-E1` はliveが `OPTIONAL_COST → CONDITIONAL{ADD_TO_FIELD} → SHUFFLE_DECK` で、REVEAL_UNTIL/pending SEARCHを生成していない。

## 3. 採用した11効果（per-effect）

JSONはaction全体。全件 `handOrField:true`。逆翻訳は `npm run regen` の全文。

| effectId | 原文 | 生成JSON | 逆翻訳文全体 | 一致 |
|---|---|---|---|---|
| WX08-023-BURST | 宇宙1枚を探して公開し、手札か場、シャッフル | `{"type":"SEARCH","from":{"location":"deck","owner":"self"},"filter":{"cardType":"シグニ","story":"宇宙"},"maxCount":1,"then":{"type":"ADD_TO_FIELD","owner":"self"},"afterSearch":{"type":"SHUFFLE_DECK","owner":"self"},"handOrField":true}` | 【LB】【ライフバースト】：あなたのデッキから1枚まで＜宇宙＞のシグニを探して手札に加えるか場に出す（その後シャッフル） | 一致 |
| WX09-016-BURST | 白か黒1枚を探して公開し、手札か場、シャッフル | `{"type":"SEARCH","from":{"location":"deck","owner":"self"},"filter":{"cardType":"シグニ","color":"黒"},"maxCount":1,"then":{"type":"ADD_TO_FIELD","owner":"self"},"afterSearch":{"type":"SHUFFLE_DECK","owner":"self"},"handOrField":true}` | 【LB】【ライフバースト】：あなたのデッキから1枚まで《黒》のシグニを探して手札に加えるか場に出す（その後シャッフル） | 該当選択肢一致。色filterの既存表現は条件外の既存差分 |
| WX09-CB02-E2 | 緑任意コスト後、レベル3以下・同名以外の美巧1枚を手札か場 | `SEQUENCE[OPTIONAL_COST{緑},CONDITIONAL{IS_MY_TURN,then:SEARCH{filter:{SIGNI,level<=3,美巧,excludeCardName},handOrField:true,afterSearch:SHUFFLE_DECK}}]` | 【自】このシグニがバニッシュされたとき：《緑》を支払ってもよい。そうした場合、あなたのデッキから1枚まで＜美巧＞の《終末の回旋 チェロン》以外のレベル3以下のシグニを探して手札に加えるか場に出す（その後シャッフル） | 一致 |
| WX11-026-BURST | 天使1枚を手札か場 | `SEARCH{deck,self,filter:{SIGNI,天使},maxCount:1,then:ADD_TO_FIELD,afterSearch:SHUFFLE_DECK,handOrField:true}` | 【LB】【ライフバースト】：あなたのデッキから1枚まで＜天使＞のシグニを探して手札に加えるか場に出す（その後シャッフル） | 一致 |
| WX16-024-BURST | 怪異1枚を手札か場 | `SEARCH{deck,self,filter:{SIGNI,怪異},maxCount:1,then:ADD_TO_FIELD,afterSearch:SHUFFLE_DECK,handOrField:true}` | 【LB】【ライフバースト】：あなたのデッキから1枚まで＜怪異＞のシグニを探して手札に加えるか場に出す（その後シャッフル） | 一致 |
| WX17-Re01-E1 | 天使をバニッシュ、成功時に天使1枚を手札か場 | `SEQUENCE[BANISH{self SIGNI 天使 1},CONDITIONAL{IS_MY_TURN,then:SEARCH{deck,天使,handOrField:true,afterSearch:SHUFFLE_DECK}}]` | 【起】（メイン起動）：〈《白×0》〉あなたの＜天使＞のシグニ1体をバニッシュする。そうした場合、あなたのデッキから1枚まで＜天使＞のシグニを探して手札に加えるか場に出す（その後シャッフル） | 一致 |
| WX20-023-BURST | 【レイヤー】持ち1枚を手札か場 | `SEARCH{deck,self,filter:{SIGNI},maxCount:1,then:ADD_TO_FIELD,afterSearch:SHUFFLE_DECK,handOrField:true}` | 【LB】【ライフバースト】：あなたのデッキから1枚までシグニを探して手札に加えるか場に出す（その後シャッフル） | 選択肢一致。【レイヤー】filter脱落は条件外の既存差分 |
| WX20-050-E2 | 相手ターン離場時、ニャローブ名を含む1枚を手札か場 | `SEARCH{deck,self,filter:{SIGNI,cardName:"ニャローブ"},maxCount:1,then:ADD_TO_FIELD,afterSearch:SHUFFLE_DECK,handOrField:true}`＋`triggerCondition.turnOwner:"opponent"` | 【自】《相手ターン》このカードが場を離れたとき：あなたのデッキから1枚まで《ニャローブ》シグニを探して手札に加えるか場に出す（その後シャッフル） | 一致 |
| WXK08-024-BURST | 電機1枚を手札か場 | `SEARCH{deck,self,filter:{SIGNI,電機},maxCount:1,then:ADD_TO_FIELD,afterSearch:SHUFFLE_DECK,handOrField:true}` | 【LB】【ライフバースト】：あなたのデッキから1枚まで＜電機＞のシグニを探して手札に加えるか場に出す（その後シャッフル） | 一致 |
| WXK08-040-BURST | 電機1枚を手札か場 | `SEARCH{deck,self,filter:{SIGNI,電機},maxCount:1,then:ADD_TO_FIELD,afterSearch:SHUFFLE_DECK,handOrField:true}` | 【LB】【ライフバースト】：あなたのデッキから1枚まで＜電機＞のシグニを探して手札に加えるか場に出す（その後シャッフル） | 一致 |
| WXK11-022-BURST | レベル3以下1枚を手札か場 | `SEARCH{deck,self,filter:{SIGNI,level<=3},maxCount:1,then:ADD_TO_FIELD,afterSearch:SHUFFLE_DECK,handOrField:true}` | 【LB】【ライフバースト】：あなたのデッキから1枚までレベル3以下のシグニを探して手札に加えるか場に出す（その後シャッフル） | 一致 |

## 4. 見送った2効果

- `SP27-005-E1`：真バグだが据置。liveは `SEQUENCE[OPTIONAL_COST{青},CONDITIONAL{IS_MY_TURN,then:ADD_TO_FIELD},SHUFFLE_DECK]` で、停止条件つき公開、当たり札、残り札のシャッフル付きデッキ下戻しが全て構造化されていない。SEARCH用 `handOrField` を足す pending が存在せず、場出しだけを二択化しても「めくれるまで」の候補カードを保持できない。reveal-until経路全体の別修正が必要。
- `WXEX2-49-E2`：修正不要。liveは `TRASH{DECK_CARD count:3}` の後に `PICK_FROM_TRASHED_CARDS{trashedPick:{count:1,filter:{SIGNI},dest:"hand_or_field"}}`。`lastProcessedCards` から選び、専用の手札／場CHOOSEへ既に到達するため、`handOrField` キーが無いこと自体はバグでない。

## 5. 条件以外で見つけた原文との食い違い

2件（いずれも既存差分・本バッチでは未修正）：`WX09-016-BURST` の原文「白か黒」に対しlive filterは黒のみ。`WX20-023-BURST` の原文【レイヤー】保持条件がlive filterから脱落。加えて `SP27-005-E1` の reveal-until 全体欠落は上記見送り理由に含む。

## 6. ゲート

| 計器 | 結果 |
|---|---|
| golden | 2410 / FAIL 0（開始2408、+2。1本の表駆動テスト内で採用11効果×3枝を個別assert） |
| census | 708 / baseline 708 |
| smoke | 10693 / CRASH 0 / HANG 0 / INVARIANT 0 / **SKIP 0** |
| fuzz（gates内） | 全0、SKIP 0、distinct 2681 |
| fuzz（追加） | 全0、SKIP 0、distinct 2672 |
| census:stubs | A群🔴0 / C群0 |
| manual-fields | 0 |
| lint | 0 errors / 261 warnings |
| groupSimilar --all | 同型★0 |
| held / partial / idset | 88 / 15 / 46 |
| censusManualDrift 削除候補 | 86 |

`npm run regen`、`npm run gates`、追加 `npm run fuzz`、`node scripts/groupSimilar.mjs --all` を実行し全緑。

## 7. 生パースdiffとoutlier

一般規則の生パース変化集合は採用11効果と同一：`WX08-023-BURST`、`WX09-016-BURST`、`WX09-CB02-E2`、`WX11-026-BURST`、`WX16-024-BURST`、`WX17-Re01-E1`、`WX20-023-BURST`、`WX20-050-E2`、`WXK08-024-BURST`、`WXK08-040-BURST`、`WXK11-022-BURST`。変化は各SEARCHへの `handOrField:true` 追加だけ。追加/削除/effectId/parseStatus変更なし。outlier **0件**。CHOOSE内69件は再帰対象外で変化0。

## 8. heldバケットとlint

- held：88→88（増減0）。報告直前の `build:effects → heldReview` 再実測値。
- partial：15→15、idset：46→46。
- lint warning：261→261（増減0）、error 0→0。

## 9. 真バグごとの慣例エンコード検討

- 採用11件それぞれ：`then:CHOOSE[ADD_TO_HAND,ADD_TO_FIELD]` への展開を検討して外した。SEARCHの選択カード束縛・ゾーン選択・後続SHUFFLEを既存 `resumeSearch` が扱うため、完成済みの慣例 `handOrField:true` が正しい。`ADD_TO_FIELD` を残したまま別の `ADD_TO_HAND` をSEQUENCE追加する形も、両方へ移動する過剰実行になるため不採用。
- 採用11件それぞれ：カードID／クラス名を列挙するoverrideを外し、原文文型＋`SEARCH.from=deck`＋`then=ADD_TO_FIELD` だけで判定した。CHOOSEには潜らない。
- `SP27-005-E1`：`ADD_TO_FIELD` をSEARCHへ置換する局所修正を外した。公開停止条件と公開集合が失われ、原文と異なる任意デッキサーチになるため。
- `WXEX2-49-E2`：SEARCHへ置換／`handOrField:true` 追加を外した。「この方法でトラッシュに置いた」限定を失うため、既存 `trashedPick.dest:"hand_or_field"` を維持。

## 10. 禁止事項と最終確認

- PLAN.md / PLAN_PROGRESS.md は編集していない。commit / push はしていない。
- CHOOSE内69件は変更していない。新STUB、force-adopt、manual影武者は追加していない。
- `git diff --name-only` 全ファイルをUTF-8で走査し、U+FFFD **0件**。追加行の3文字文字化けパターンも **0件**。`git diff --check` も異常0。
