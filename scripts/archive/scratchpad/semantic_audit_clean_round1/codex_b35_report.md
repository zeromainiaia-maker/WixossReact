# 段2 第35バッチ報告 — O-53 `LOOK_AND_REORDER` の hand source 配線是正

基準 HEAD は `d0b412b594c8c1a59aa0e93a8716f4d67271fffa`。commit / push、PLAN / PLAN_PROGRESS 編集、O-51 の実装、`REVEAL_AND_PICK` / `LOOK_PICK_CHAIN` remainder、deck / life_cloth source の既存処理、ブラウザ / Supabase 検証は行っていない。

## 1. 触ったファイルと理由

- `src/engine/effectExecutor.ts` — hand 閲覧を既存 `REVEAL_CARDS` へ配線し、source / destination の暗黙 deck fallback を fail-loud 化。
- `src/data/parsers/parseSentencePart3.ts` — 「手札からカードN枚を（好きな順番で）デッキの一番下に置く」だけを既存 `TRANSFER_TO_DECK/HAND_CARD` にする文型規則。
- `src/data/manualEffects.ts` — `WXK05-025-E1` の MANUAL 正本を同じ既存型へ是正。
- `public/data/effects_misc.json` — parser 採用した `WDK05-R01-E2` / `WDK05-R14-E1` / `WDK05-R17-E1`。
- `public/data/effects_WXK.json` — parser 採用した `WXK02-089-E1` と `syncManualLive` した `WXK05-025-E1`。
- `scripts/goldenTest.ts` — 群A / 群B の E2E、16件の構造集合、未知 location の成立 / 不成立を固定。
- `scripts/behaviorAudit.ts` — engine が新たに返す既存 `REVEAL_CARDS` を audit autopilot で resume。
- `scripts/vocabCensus.ts` —改善した高シグナル実測 608→607 に baseline を同期。
- `docs/_held_fresh.json` / `docs/_held_review.txt` — build 後の fresh / held 再生成（held 81→80）。
- `docs/_vocab_census.txt` / `docs/_census_stubs.txt` —最終 census / stub census 再生成。stub 文書の差は executor 行番号の追随だけ。
- `docs/decompile_sheet3.txt` / `docs/decompile_sheet5.txt` — `npm run regen` の群B5行の構造追随。群A11行は不変。
- `scripts/archive/scratchpad/semantic_audit_clean_round1/stage2_closed.txt` —指定された群B finding 3本だけを閉じた。
- `docs/BUGFIXES.md` —修正記録を先頭へ追記。
- 本報告書 — 調査・全効果照合・計器実測を保存。

`src/types/index.ts`、`scripts/decompileEffects.ts`、`REVEAL_AND_PICK` / `LOOK_PICK_CHAIN` の engine / parser は変更していない。新 action 型、新 field、新 STUB id、force-adopt list は追加していない。

## 2. 調査結果と既存受け皿

### 群A — `REVEAL_CARDS` はそのまま使える

- `PendingInteractionDef` の既存型は `src/types/index.ts:1316-1319`。`cards` と任意の `title` / `continuation` を持つ閲覧専用対話である。
- 前例 `execStubPart1` の `TK3_DECLARE_DISCARD`（`src/engine/execStubPart1.ts:836-849`）は `cards:[...ctx.otherState.hand]` の `REVEAL_CARDS` を返し、後続を continuation へ渡す。
- `resumeRevealCards`（`src/engine/effectExecutor.ts:9333-9338`）は continuation を実行するか `done(ctx)` を返すだけで、zone を変更しない。
- `LOOK_OPP_LIFE_TOP`（`src/engine/execStubPart1.ts:1573` 以降）は閲覧対象を `lastProcessedCards` に残す前例である。
- 修正した `execLookAndReorder`（`:5287-5373`）は hand / hand・同一 owner のとき `state.hand` を読み、`:5312` で `lastProcessedCards` を設定して `REVEAL_CARDS` を返す。hand から別 zone への移動は `TRANSFER_TO_DECK` 等を要求するログ付き no-op。deck / life_cloth は従来どおり既存 `LOOK_AND_REORDER` pending へ進む。
- 空手札も `lastProcessedCards:[]` に更新するため、後続が古い閲覧結果を誤参照しない。

### 群B — `TRANSFER_TO_DECK/HAND_CARD` は今回の bottom 5件に使える

- `execTransferToDeck`（`src/engine/effectExecutor.ts:5407`）、HAND_CARD 分岐（`:5508-5528`）は `handCandidates` と `selectOrInteract` で N 枚を選択させる。
- `resumeSelectTarget`（`:8578-8721`）は `selected` を並べ替えず、`:8695` から配列順に `applyDirectAction` へ渡す。
- `applyDirectAction` の `TRANSFER_TO_DECK` 分岐（`:10498-10523`）は手札からその札を除去し、bottom なら `deck:[...deck, cardNum]` と末尾へ追加する。従って今回の bottom 5件では選択順が保存される。
- ただし同じ per-card 経路の top は各札を先頭へ prepend するため選択順が逆転する。この一般論は「top でも保存される」とは言えない。今回の5件は全て bottom なので据置理由にはならず、top の一般化はスコープ外として触っていない。

### 発火・適用経路（採用効果ごと）

- `SPDi43-27-E2` / `WD16-010-E1` / `WX17-002-E4` / `WDK05-R01-E2` — MAIN 起動 UI → `executeEffect`（`:8508`）→ `executeAction`（`:7687`）→各 executor。AUTO collector は介在しない。
- `WX06-CB02-E2` / `WX17-042-E2` / `WXDi-P03-025-E1` / `WXDi-P09-065-E1` / `WXK09-039-E2` / `WDK05-R14-E1` / `WDK05-R17-E1` / `WXK02-089-E1` / `WXK05-025-E1` — `collectPlacedSelfOnPlayTriggers`（`src/engine/triggerCollect.ts:395`）→ `executeEffect` → `executeAction`。
- `WX17-069-E1` — `collectAnyZoneTrashSelfTriggers`（`src/engine/triggerCollect.ts:960`、`triggerCondition.fromZones:['hand']`）→ `executeEffect` → `executeAction`。
- `WXDi-P09-067-E1` — rise 配置時の ON_RISE 収集（`src/screens/BattleScreen.tsx:6115-6129`）→ `executeEffect` → `executeAction`。
- `WXK11-061-E1` — `collectAttackerSelfTriggers`（`src/engine/triggerCollect.ts:3763`）→ `executeEffect` → `executeAction`。
- 群Aの適用末尾は `execLookAndReorder` → `REVEAL_CARDS` → `resumeRevealCards`。群Bは `execTransferToDeck` → `selectOrInteract` → `resumeSelectTarget` → `applyDirectAction(TRANSFER_TO_DECK)`。

## 3. 採用した効果 全16件

JSON は比較対象である `action` 全体を記す。群Aは engine 修正なので live JSON 自体は before / after 同一である。

### 群A 11件

#### `SPDi43-27-E2`

- 原文：`【起】《ゲーム１回》インフレーション《緑×0》：対戦相手の手札を見る。その後、あなたのエナゾーンからシグニを３枚まで対象とし、それらを場に出す。数字１つを宣言する。次の対戦相手のターン終了時まで、あなたのすべてのシグニは【シャドウ】を得る。`
- before / after JSON：`SEQUENCE[LOOK_AND_REORDER{source:{location:'hand',owner:'opponent'},count:99,private:true,reorder:false,destination:{location:'hand',owner:'opponent',position:'top'}}, ADD_TO_FIELD{source:ENERGY_CARD,count:3,upToCount:true}, STUB{DECLARE_NUMBER}, GRANT_KEYWORD{keyword:'シャドウ:{"declaredNumberPowerEq":true}',duration:'UNTIL_OPP_TURN_END'}]`（不変）
- 逆翻訳全体：`【起】（メイン起動）：《once_per_game》〈《緑×0》〉対戦相手の手札を見る。そしてあなたのシグニ(エナ)3枚までをコストを支払わずに場に出す。そして数字1つを宣言する。そしてあなたのすべてのシグニに【シャドウ:{"declaredNumberPowerEq":true}】を与える（次の相手ターン終了時まで）`
- 一致判定：意味一致。

#### `WD16-010-E1`

- 原文：`対戦相手の手札を見る。このターン、あなたが次に《ピーピング・アナライズ》を使用する場合、それの使用コストはあなたのセンタールリグのレベル１につき《青×1》減る。`
- before / after JSON：`SEQUENCE[LOOK_AND_REORDER{hand/opponent,count:99,destination:hand/opponent}, STUB{ARTS_COST_REDUCTION_BY_EFFECT}]`（不変）
- 逆翻訳全体：`【起】（メイン起動）：〈《青×0》〉対戦相手の手札を見る。そしてこのターン、あなたが次に《ピーピング・アナライズ》を使用する場合、それの使用コストはあなたのセンタールリグのレベル１につき《青×1》減る`
- 一致判定：意味一致。

#### `WX06-CB02-E2`

- 原文：`【出】：対戦相手の手札を見る。`
- before / after JSON：`LOOK_AND_REORDER{source:{location:'hand',owner:'opponent'},count:99,private:true,reorder:false,destination:{location:'hand',owner:'opponent',position:'top'}}`（不変）
- 逆翻訳全体：`【自】このシグニが場に出たとき：対戦相手の手札を見る`
- 一致判定：意味一致（【出】を ON_PLAY と表示）。

#### `WX17-002-E4`

- 原文：`【起】ピーピング《コインアイコン》《コインアイコン》：対戦相手の手札を見る。その後、数字１つを宣言し、その数字と同じレベルの無色ではないシグニをすべて捨てさせる。`
- before / after JSON：`SEQUENCE[LOOK_AND_REORDER{hand/opponent,count:99,destination:hand/opponent}, STUB{DECLARE_NUMBER}]`（不変）
- 逆翻訳全体：`【起】（メイン起動）：〈コイン2〉対戦相手の手札を見る。そして数字1つを宣言する`
- 一致判定：不一致。後半の同レベル非無色シグニ全捨てが既存 JSON / 逆翻訳に無い。今回の hand 閲覧以外なので据置。

#### `WX17-042-E2`

- 原文：`【出】：このシグニがトラッシュから場に出た場合、対戦相手の手札を見る。`
- before / after JSON：`LOOK_AND_REORDER{hand/opponent,count:99,destination:hand/opponent}` + `condition:THIS_CARD_FROM_TRASH`（不変）
- 逆翻訳全体：`【自】このシグニが場に出たとき：このシグニがトラッシュから場に出た場合、対戦相手の手札を見る`
- 一致判定：意味一致。

#### `WX17-069-E1`

- 原文：`【自】：このカードが手札からトラッシュに置かれたとき、対戦相手の手札を見る。`
- before / after JSON：`LOOK_AND_REORDER{hand/opponent,count:99,destination:hand/opponent}` + `timing:['ON_TRASH'], triggerCondition:{fromZones:['hand']}`（不変）
- 逆翻訳全体：`【自】このカードが手札からトラッシュに置かれたとき：対戦相手の手札を見る`
- 一致判定：意味一致。

#### `WXDi-P03-025-E1`

- 原文：`【出】：カードを２枚引く。対戦相手の手札を見る。`
- before / after JSON：`SEQUENCE[DRAW{self,2}, LOOK_AND_REORDER{hand/opponent,count:99,destination:hand/opponent}]`（不変）
- 逆翻訳全体：`【自】このシグニが場に出たとき：あなたのカードを2枚引く。そして対戦相手の手札を見る`
- 一致判定：意味一致。

#### `WXDi-P09-065-E1`

- 原文：`【出】：対戦相手の場に凍結状態のシグニがある場合、対戦相手の手札を見る。あなたはその中から《ガードアイコン》を持たないカード１枚を選びデッキの一番下に置いてもよい。そうした場合、対戦相手はカードを１枚引く。`
- before / after JSON：`SEQUENCE[CONDITIONAL{HAS_CARD_IN_FIELD(opponent,frozen)→LOOK_AND_REORDER{hand/opponent,count:99,destination:hand/opponent}}, STUB{LOOK_AND_REORDER}, CONDITIONAL{IS_MY_TURN→DRAW{opponent,1}}]`（不変）
- 逆翻訳全体：`【自】このシグニが場に出たとき：対戦相手の場に凍結状態のシグニがいるなら、対戦相手の手札を見る。そして[STUB:デッキを見て並べ替え（STUB版：動的パース）]。そうした場合、対戦相手のカードを1枚引く`
- 一致判定：不一致。閲覧部分と `lastProcessedCards` は是正したが、任意の非ガード1枚を下へ置く後続は既存 STUB / 条件誤表現のまま。別軸 finding は閉じていない。

#### `WXDi-P09-067-E1`

- 原文：`【自】：このシグニがライズされたとき、対戦相手の手札を見る。`
- before / after JSON：`LOOK_AND_REORDER{hand/opponent,count:99,destination:hand/opponent}` + `timing:['ON_RISE']`（不変）
- 逆翻訳全体：`【自】このシグニがライズされたとき：対戦相手の手札を見る`
- 一致判定：意味一致。

#### `WXK09-039-E2`

- 原文：`【出】手札から＜天使＞のシグニを１枚エナゾーンに置く：対戦相手の手札を見る。`
- before / after JSON：`LOOK_AND_REORDER{hand/opponent,count:99,destination:hand/opponent}` + `cost.handToEnergy{count:1,filter:{cardType:'シグニ',story:'天使'}}`（不変）
- 逆翻訳全体：`【自】このシグニが場に出たとき：〈手札から＜天使＞のシグニ1枚をエナゾーンに置く〉対戦相手の手札を見る`
- 一致判定：意味一致。別軸 finding は閉じていない。

#### `WXK11-061-E1`

- 原文：`【自】：このシグニがアタックしたとき、対戦相手の手札を見る。対戦相手の手札が０枚の場合、カードを１枚引く。`
- before / after JSON：`SEQUENCE[LOOK_AND_REORDER{hand/opponent,count:99,destination:hand/opponent}, CONDITIONAL{HAND_COUNT(opponent)==0→DRAW{self,1}}]`（不変）
- 逆翻訳全体：`【自】このシグニがアタックしたとき：対戦相手の手札を見る。そして対戦相手の手札が0枚であるなら、あなたのカードを1枚引く`
- 一致判定：意味一致。

### 群B 5件

#### `WDK05-R01-E2`

- 原文：`【起】《ターン１回》《コインアイコン》：カードを３枚引き、手札からカード２枚を好きな順番でデッキの一番下に置く。`
- before JSON：`SEQUENCE[DRAW{self,3}, LOOK_AND_REORDER{source:{hand,self},count:1,private:true,reorder:false,destination:{deck,self,bottom}}]`
- after JSON：`SEQUENCE[DRAW{self,3}, TRANSFER_TO_DECK{source:{type:'HAND_CARD',owner:'self',count:2},shuffle:false,position:'bottom'}]`
- 逆翻訳全体：`【起】（メイン起動）：《once_per_turn》〈コイン1〉あなたのカードを3枚引く。そしてあなたのカード(手札)2枚をデッキの一番下に置く`
- 一致判定：実行意味は一致。逆翻訳文字列は「好きな順番で」を省略するため全文の文字列一致ではない。

#### `WDK05-R14-E1`

- 原文：`【出】：カードを１枚引き、手札からカード１枚をデッキの一番下に置く。`
- before JSON：`SEQUENCE[DRAW{self,1}, LOOK_AND_REORDER{source:{hand,self},count:1,private:true,reorder:false,destination:{deck,self,bottom}}]`
- after JSON：`SEQUENCE[DRAW{self,1}, TRANSFER_TO_DECK{source:{type:'HAND_CARD',owner:'self',count:1},shuffle:false,position:'bottom'}]`
- 逆翻訳全体：`【自】このシグニが場に出たとき：あなたのカードを1枚引く。そしてあなたのカード(手札)1枚をデッキの一番下に置く`
- 一致判定：意味一致。

#### `WDK05-R17-E1`

- 原文：`【出】：カードを１枚引き、手札からカード１枚をデッキの一番下に置く。`
- before JSON：`SEQUENCE[DRAW{self,1}, LOOK_AND_REORDER{source:{hand,self},count:1,private:true,reorder:false,destination:{deck,self,bottom}}]`
- after JSON：`SEQUENCE[DRAW{self,1}, TRANSFER_TO_DECK{source:{type:'HAND_CARD',owner:'self',count:1},shuffle:false,position:'bottom'}]`
- 逆翻訳全体：`【自】このシグニが場に出たとき：あなたのカードを1枚引く。そしてあなたのカード(手札)1枚をデッキの一番下に置く`
- 一致判定：意味一致。

#### `WXK02-089-E1`

- 原文：`【出】：カードを２枚引き、手札からカード２枚を好きな順番でデッキの一番下に置く。`
- before JSON：`SEQUENCE[DRAW{self,2}, LOOK_AND_REORDER{source:{hand,self},count:1,private:true,reorder:false,destination:{deck,self,bottom}}]`
- after JSON：`SEQUENCE[DRAW{self,2}, TRANSFER_TO_DECK{source:{type:'HAND_CARD',owner:'self',count:2},shuffle:false,position:'bottom'}]`
- 逆翻訳全体：`【自】このシグニが場に出たとき：あなたのカードを2枚引く。そしてあなたのカード(手札)2枚をデッキの一番下に置く`
- 一致判定：実行意味は一致。逆翻訳文字列は「好きな順番で」を省略するため全文の文字列一致ではない。

#### `WXK05-025-E1`

- 原文：`【出】：カードを２枚引き、手札からカード２枚を好きな順番でデッキの一番下に置く。その後、対戦相手のシグニ１体を対象とし、それを凍結する。`
- before JSON：`SEQUENCE[DRAW{self,2}, LOOK_AND_REORDER{source:{hand,self},count:2,private:true,reorder:true,destination:{deck,self,bottom}}, FREEZE{SIGNI,opponent,1}]`、`parseStatus:'MANUAL'`
- after JSON：`SEQUENCE[DRAW{self,2}, TRANSFER_TO_DECK{source:{type:'HAND_CARD',owner:'self',count:2},shuffle:false,position:'bottom'}, FREEZE{SIGNI,opponent,1}]`、`parseStatus:'MANUAL'`
- 逆翻訳全体：`【自】このシグニが場に出たとき：あなたのカードを2枚引く。そしてあなたのカード(手札)2枚をデッキの一番下に置く。そして対戦相手のシグニ1体を凍結する`
- 一致判定：実行意味は一致。逆翻訳文字列は「好きな順番で」を省略するため全文の文字列一致ではない。

## 4. 見送った効果

- 今回提示された16効果の見送りは0件。群A11件は JSON を変えず engine 配線を採用し、群B5件は JSON を採用した。
- `source.location:'deck'/'life_cloth'` の LOOK_AND_REORDER 194効果は既存ブロックを変更せず据置。
- O-51 の `REVEAL_AND_PICK` / `LOOK_PICK_CHAIN` remainder 279効果および既存 `LOOK_AND_REORDER{reorder:true}` 群は据置。
- `WXK03-069-E1` は parser 規則が fresh を既存の正しい live と同型にしただけで、live JSON / 逆翻訳は変更していない。
- `syncManualLive` の初回試行で `WXK05-025-BURST` の `parseStatus` だけが MANUAL→AUTO になった。内容は同一だったがスコープ外なので採用せず、manual に BURST の影武者を作る案も O-42 golden が検出したため撤回した。最終 live の BURST は HEAD と同一である。

## 5. 条件以外で見つけた原文との食い違い

2効果に今回とは別軸の既存不一致があった。

- `WX17-002-E4` — 宣言したレベルと同じ「無色ではないシグニをすべて捨てさせる」後半が JSON / 逆翻訳から欠落。
- `WXDi-P09-065-E1` — 閲覧後の「非ガード1枚を任意でデッキ下、そうした場合だけ相手が1枚引く」が `STUB{LOOK_AND_REORDER}` と不正な `IS_MY_TURN` 条件のまま。

また、群Bの「好きな順番で」3効果は engine では bottom の選択順を保存するが、`TRANSFER_TO_DECK` の decompiler がその語句を表示しない。これは逆翻訳上の表現不足として据置した。したがって「逆翻訳は16件とも元から正しく、regen 後も変わらない」という投入前見立ては、群A11件には当たるが群B5件には当たらない。

## 6. 最終ゲート実測

報告直前の `npm run regen`、`node scripts/groupSimilar.mjs --all`、`npm run gates`、`node scripts/heldReview.mjs` の実測。

| 計器 | 結果 | baseline 差 |
|---|---:|---:|
| golden | PASS 2667 / FAIL 0 | +5 PASS |
| census | 607 / BASELINE 607 | -1（改善、baseline 同期） |
| 同型★ | 総カード5986 / 265 groups / ★0 | 0 |
| smoke | 10693効果、CRASH/HANG/INVARIANT/SKIP 全0 | 0 |
| fuzz | 200 games、CRASH/HANG/INVARIANT/EXPLOSION 全0 | 0 |
| census:stubs | A群0 / C群0 | 0 |
| manual-fields | field loss 0 / parseStatus 違反0 | 0 |
| lint | 0 errors / 269 warnings | warning 増減0 |
| typecheck | PASS | PASS 維持 |

追加 golden は修正前に `PASS 2662 / FAIL 5`（O-53 の5項目だけ失敗）を確認した。失敗内容は16件構造集合、群A E2E、群B E2E、hand→他 destination fail-loud、未知 source fail-loud。修正後に全5項目が PASS へ反転した。群A E2E は双方 deck 不変・pending.cards と相手 hand の集合一致・`lastProcessedCards` 一致・resume 後も不変を assert。群B E2E は hand -2、deck +2、選択順どおり deck bottom を assert した。

## 7. 生パース / live per-effect diff

- CSV は BOM 除去後に Sheet1..10 = 6666、TK = 46、合計6712カードを再確認。
- 全 live JSON の `source.location:'hand'` を action 木末端まで走査し、LOOK_AND_REORDER は指定16 effectId だけ。他は0。
- HEAD snapshot 対 final live の全 `effects_*.json` を effectId 単位で比較：変更5、追加0、削除0。変更集合は `WDK05-R01-E2` / `WDK05-R14-E1` / `WDK05-R17-E1` / `WXK02-089-E1` / `WXK05-025-E1`。意図した16件のうち群A11件は engine-only なので JSON 不変、scope 外 live 変更0。
- baseline / final の parser を6712カード・10660 top-level effects で全再実行した生パース diff：変更6、追加0、削除0。上記群B5件に加え `WXK03-069-E1` が変化したため、厳密な指定16集合外 outlier は1件。
- `WXK03-069-E1` は原文「手札からカード1枚をデッキの一番下に置く」で、baseline fresh は誤った LOOK_AND_REORDER、curated live は既に正しい TRANSFER_TO_DECK だった。新しい一般文型が fresh を live に一致させ、held から外しただけで live 差分は0。意味的な scope 外退化は0だが、生パース outlier 1という数は隠さない。

## 8. held バケットと lint

- `_held_fresh.json`：81→80。追加0、除外 `WXK03-069` だけ。
- `_partial_fresh.json`：15→15、effectId 集合不変、ファイル不変。
- `_idset_fresh.json`：45→45、effectId 集合不変、ファイル不変。
- final `heldReview`：80 cards / 32 signature groups。
- lint：269 warnings→269 warnings、errors 0→0。
- 採用は `node scripts/heldReview.mjs --adopt WDK05-R01,WDK05-R14,WDK05-R17,WXK02-089`。MANUAL は `npx tsx scripts/syncManualLive.ts WXK05-025`。force-adopt list は使用していない。

## 9. 逆翻訳16行 before / after

- 群A11行：全て byte-identical。各全文は §3 に記載。
- `WDK05-R01-E2`：`…カードを3枚引く。そしてあなたの手札1枚を見る` → `…カードを3枚引く。そしてあなたのカード(手札)2枚をデッキの一番下に置く`
- `WDK05-R14-E1`：`…カードを1枚引く。そしてあなたの手札1枚を見る` → `…カードを1枚引く。そしてあなたのカード(手札)1枚をデッキの一番下に置く`
- `WDK05-R17-E1`：同上。
- `WXK02-089-E1`：`…カードを2枚引く。そしてあなたの手札1枚を見る` → `…カードを2枚引く。そしてあなたのカード(手札)2枚をデッキの一番下に置く`
- `WXK05-025-E1`：`…カードを2枚引く。そしてあなたの手札から2枚を見て、好きな順番でデッキの一番下に置く。そして…凍結する` → `…カードを2枚引く。そしてあなたのカード(手札)2枚をデッキの一番下に置く。そして…凍結する`

期待値との差：群Aは不変で正しい。群Bは action 型の是正に伴って5行とも変化し、4件は明確に改善した。`WXK05-025-E1` は実行構造が正しくなった一方、decompiler の「好きな順番」表示は退化したため、文字列完全一致とは判定していない。

## 10. PLAN §5.3 O-51 登録票の実コード確認

投入前訂正の核心は正しい。

- live 全 action node を走査すると `remainder.position:'any'` は40 node / 39 effectId。location は trash 37、energy 2、hand 1、deck 0。39は effectId 数、37+2+1=40は node 数であり、単位を分けると整合する。
- `execRevealAndPick` / `execLookPickChain` / resume 側はいずれも location が deck の分岐でだけ top / bottom / split を読む。live に deck+any は0なので `any` が deck top へ潰れる実害はない。
- `docs/_effect_srctext.json` の effectId 単位では「好きな順番」を含むものは377。live top-level 走査との差4件は付与能力等の nested effectId で、投入前の377という母集団値を確認した。
- 従って PLAN の「`position:'any'` が誤って上へ置く死フラグ」は実測と食い違い、O-51 の本体は remainder の並べ替え対話不足である。PLAN は禁止どおり編集せず、O-51 の279効果にも触っていない。

## 11. 不変ブロック・台帳・やらなかったこと

- `git diff --unified=0` で `effectExecutor.ts` の既存変更は `execLookAndReorder` ブロック内だけ。`execTransferToDeck`、`resumeSelectTarget`、`applyDirectAction`、`resumeLookAndReorder`、`resumeRevealCards` は行単位で HEAD と同一。
- `goldenTest.ts` の既存 scenario は変更せず、import 1件と末尾 O-53 ブロックだけを追加。修正前の5 FAIL→修正後 PASS で空振りでないことを確認。
- `manualEffects.ts` は `WXK05-025-E1` の追加だけで、既存 E2 / BURST は不変。`behaviorAudit.ts` は import と REVEAL_CARDS autopilot case だけ。
- 台帳は指定どおり `WDK05-R01-E2 :: 手札からカード２枚`、`WXK02-089-E1 :: 手札からカード２枚`、`WXK02-089-E1 :: 好きな順番で` の3行だけ。群Aや別軸 finding は閉じていない。ledger は OPEN 729→726。
- O-51、deck / life_cloth LAR、top の選択順一般化、別軸の原文不一致2件、decompiler の「好きな順番」表示、実機検証は未実施。
