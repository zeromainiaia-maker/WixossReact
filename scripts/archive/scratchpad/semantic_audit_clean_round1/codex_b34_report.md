# 段2 第34バッチ報告：O-50「公開した残りだけをシャッフルしてデッキ下」

- 基準 HEAD：`872a9fbd2`
- 実施日：2026-08-24
- 結論：C2/C4の5効果とC1の10効果を採用した。live の変更集合は指定15効果だけ、生パース差分は対象内14効果だけで、outlier はいずれも0。
- `WXEX1-13-E1` は原文に shuffle が無い誤登録であり無変更。

## 1. 触ったファイルと各1行の理由

- `src/data/effectParser.ts`：効果単位原文と既存 action 木から C2/C4 を RAP、C1を LPC へ畳む `foldO50ShuffledBottom` を追加。
- `src/types/effects.ts`：既存 `LookPickChainStage.then` に `seed` を追加（新 action 型は追加していない）。
- `src/engine/effectExecutor.ts`：LPC の選択結果を既存 `INTERNAL_SEEDS_PLACE_LOOP` へ一度だけ渡す薄い経路を追加。
- `scripts/decompileEffects.ts`：LPC `then:'seed'` の日本語逆翻訳を追加。
- `src/data/manualEffects.ts`：fresh が後段条件を失う `WX25-P3-047-E1` だけを MANUAL で保持。`WX20-072-E1`／`WXK04-010-E1` は AUTO に戻し、影武者を残していない。
- `scripts/goldenTest.ts`：第33バッチの非採用契約を正方向へ反転し、C1全10効果の parser と複数シード／複数トラップの engine 回帰を追加。解消した manual drift 既知項目も除去。
- `scripts/vocabCensus.ts`：LPC `pickUpTo` が実際に SEARCH.optional として消費される任意選択であることを計器へ較正。総数608は維持。
- `public/data/effects_WX.json`／`effects_WX24_26.json`／`effects_WXK.json`／`effects_misc.json`：正規の build→heldReview／syncManualLive 経路で15効果を採用。
- `docs/decompile_sheet2/3/4/5/9.txt`、`docs/_review_repr.txt`、`docs/grouped_all.txt`、`docs/grouped_sentence_all.txt`：`npm run regen` の再生成物。
- `docs/_vocab_census.txt`／`docs/_census_stubs.txt`／`docs/_idset_fresh.json`：最終計器・build の再生成物。
- `scripts/archive/scratchpad/semantic_audit_clean_round1/stage2_closed.txt`：存在した1 finding を quote 前方一致で閉じた。
- `docs/BUGFIXES.md`：修正内容と最終ゲートを先頭へ記録。
- 本ファイル：全件照合と非変更証明を記録。

`docs/PLAN.md`／`docs/PLAN_PROGRESS.md` は編集していない。

## 2. 調査結果：PLACE_SEED_FROM_REVEALED 連鎖と採用した受け皿

実コードを読んだ結果は次のとおり。

- `PLACE_SEED_FROM_REVEALED` は `src/engine/execStubPart2.ts:3341-3367` で `deck.slice(0, 4)`／`maxPick:1` を固定し、`INTERNAL_SEED_FROM_DECK` へ渡す。
- `INTERNAL_SET_SEED` は同ファイル `:3370-3383` で `stub.seedCards[0]` を優先して設置する。
- 複数版 `PLACE_SEEDS_FROM_REVEALED` も `:3385-3397` で公開枚数だけは4固定だが、後段の `INTERNAL_SEEDS_PLACE_LOOP`（`:3399-3420`）は `seedCards` の束を1枚ずつ保持し、ゾーン選択を跨いで `INTERNAL_SET_SEED` へ渡せる。
- トラップはシードと別経路で、`INTERNAL_ASK_TRAP_ZONE`／`INTERNAL_PICK_TO_TRAP`（`:2953-2990`）が選択札をデッキから抜き `signi_traps` へ置く。シード用 STUB は流用していない。
- `REVEAL_AND_PICK` は `src/engine/effectExecutor.ts:5887`、`LOOK_PICK_CHAIN` は `:5995` に既存実装があり、後者は公開束を `_revealed` で保持して、選ばれずデッキに残る札だけを `remainder` へ送る。
- したがって C1 は LPC が適切。`LookPickChainStage.then` に `seed` を1値追加し（`src/types/effects.ts:1778-1788`）、`lookPickThenAction`（`effectExecutor.ts:5972-5987`）から既存ループへ接続。`resumeSearch` の `:8951-8965` で選択束を一度だけ渡し、外側 continuation に remainder を保持した。
- C2 は既存 RAP、C4も `parseRevealPickDescriptor` が植物シグニ／1枚／場出しを解けることを再確認したため RAP を採用した。

新 action 型、新ゾーン、シード／トラップの共用 STUB は作っていない。旧 `PLACE_*_FROM_REVEALED` ハンドラ本体も変更していない。

## 3. 採用した効果の全件

### `WX20-072-E1`

- 原文：`【出】：あなたのデッキの上からカードを５枚見る。その中からカード名に《ウェディング》を含むシグニ１枚を公開し手札に加えるかエナゾーンに置く。残りをシャッフルしてデッキの一番下に置く。`
- 生成 JSON：`{"type":"REVEAL_AND_PICK","owner":"self","revealCount":5,"filter":{"cardName":"ウェディング","cardType":"シグニ"},"pickCount":1,"handOrEnergy":true,"then":{"type":"ADD_TO_HAND","owner":"self"},"remainder":{"location":"deck","position":"bottom","shuffle":true}}`
- 逆翻訳全文：`【自】このシグニが場に出たとき：あなたのデッキ上5枚を公開し、その中から《ウェディング》シグニを1枚手札に加えるかエナゾーンに置く、残りをシャッフルしてデッキの一番下に置く`
- 判定：意味一致。

### `WX21-037-E2`

- 原文：`【出】：あなたのデッキの上からカードを４枚見る。その中から青か黒のスペル１枚を公開し手札に加える。残りをシャッフルしてデッキの一番下に置く。`
- 生成 JSON：`{"type":"REVEAL_AND_PICK","owner":"self","revealCount":4,"filter":{"color":["青","黒"],"cardType":"スペル"},"pickCount":1,"pickNoun":"スペル","then":{"type":"ADD_TO_HAND","owner":"self"},"remainder":{"location":"deck","position":"bottom","shuffle":true}}`
- 逆翻訳全文：`【自】このシグニが場に出たとき：あなたのデッキ上4枚を公開し、その中から《青・黒》のスペルを1枚手札に加える、残りをシャッフルしてデッキの一番下に置く`
- 判定：意味一致。

### `WDK01-008-E1`

- 原文：`以下の２つから１つを選ぶ。①ターン終了時まで、対象のあなたのセンタールリグ１体は対象のあなたの＜乗機＞のシグニ１体に乗る。（すでに他のシグニに乗っている場合は乗り換える）②あなたのデッキの上からカードを５枚見る。その中から＜乗機＞のシグニを３枚まで公開し手札に加える。残りをシャッフルしてデッキの一番下に置く。`
- 生成 JSON：`{"type":"CHOOSE","choose_count":1,"from_count":2,"choices":[{"choiceId":"c0","label":"選択肢1","action":{"type":"STUB","id":"CENTER_LRIG_RIDES_ON_SIGNI"}},{"choiceId":"c1","label":"選択肢2","action":{"type":"REVEAL_AND_PICK","owner":"self","revealCount":5,"filter":{"story":"乗機","cardType":"シグニ"},"pickCount":3,"pickUpTo":true,"then":{"type":"ADD_TO_HAND","owner":"self"},"remainder":{"location":"deck","position":"bottom","shuffle":true}}}]}`
- 逆翻訳全文：`【起】（メイン起動）/（アタックフェイズ起動）：〈《赤×1》〉以下の2つから1つを選ぶ【[STUB:センタールリグが選択した1体の乗機シグニに乗る（乗り換え可）] / あなたのデッキ上5枚を公開し、その中から＜乗機＞のシグニを3枚まで手札に加える、残りをシャッフルしてデッキの一番下に置く】`
- 判定：O-50対象節は意味一致。既存の選択肢①も日本語表示済みの実装 STUB で、今回変更していない。

### `WX25-P3-047-E1`

- 原文：`あなたのデッキの上からカードを７枚見る。その中から＜龍獣＞のシグニを２枚まで公開し手札に加え、残りをシャッフルしてデッキの一番下に置く。その後、この方法で手札に加えたカード１枚が赤で、もう１枚が緑の場合、対戦相手のパワー12000以下のシグニ１体を対象とし、それをバニッシュする。`
- 生成 JSON：`{"type":"SEQUENCE","steps":[{"type":"REVEAL_AND_PICK","owner":"self","revealCount":7,"filter":{"cardType":"シグニ","cardClass":"龍獣"},"pickCount":2,"pickUpTo":true,"then":{"type":"ADD_TO_HAND","owner":"self"},"remainder":{"location":"deck","position":"bottom","shuffle":true}},{"type":"CONDITIONAL","condition":{"type":"AND","conditions":[{"type":"LAST_PROCESSED_MATCHES","filter":{"color":"赤"},"minCount":1},{"type":"LAST_PROCESSED_MATCHES","filter":{"color":"緑"},"minCount":1}]},"then":{"type":"BANISH","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ","powerRange":{"max":12000}},"upToCount":false}}}]}`
- 逆翻訳全文：`【起】（メイン起動）：〈《無×0》〉あなたのデッキ上7枚を公開し、その中から＜龍獣＞のシグニを2枚まで手札に加える、残りをシャッフルしてデッキの一番下に置く。そしてこの方法で《赤》のカードを1枚以上処理したかつこの方法で《緑》のカードを1枚以上処理したなら、対戦相手のパワー12000以下のシグニ1体をバニッシュする`
- 判定：意味一致。fresh は後段条件を失うため、この1効果だけ MANUAL の全体木を維持した。

### `WXK05-050-E1`

- 原文：`【起】《白》このシグニを場からトラッシュに置く：あなたのデッキの上からカードを３枚見て、その中から＜植物＞のシグニ１枚を場に出す。残りをシャッフルしてデッキの一番下に置く。`
- 生成 JSON：`{"type":"REVEAL_AND_PICK","owner":"self","revealCount":3,"filter":{"story":"植物","cardType":"シグニ"},"pickCount":1,"then":{"type":"ADD_TO_FIELD","owner":"self"},"remainder":{"location":"deck","position":"bottom","shuffle":true}}`
- 逆翻訳全文：`【起】（メイン起動）：〈《白×1》＋このシグニを場からトラッシュに置く〉あなたのデッキ上3枚を公開し、その中から＜植物＞のシグニを1枚場に出す、残りをシャッフルしてデッキの一番下に置く`
- 判定：意味一致。第33バッチ時の「既存 RAP で表現可能」という判断は有効だった。

### C1：4枚見て1枚までをシードにする8効果

対象：`WDK07-Y02-E2`／`WDK07-Y03-E2`／`WDK07-Y04-E2`／`WDK07-Y07-E1`／`WXK04-007-E1`／`WXK04-008-E1`／`WXK04-009-E2`／`WXK05-007-E3`。

- 共通原文節：`あなたのデッキの上からカードを４枚見る。その中からカード１枚を【シード】としてあなたのシグニゾーンに出してもよい。残りをシャッフルしてデッキの一番下に置く。`
- 各効果の生成 JSON（`WDK07-Y07-E1` は先行する既存2 STUB の後ろにこのノードを保持）：`{"type":"LOOK_PICK_CHAIN","owner":"self","revealCount":4,"stages":[{"pickCount":1,"pickUpTo":true,"pickNoun":"カード","then":"seed"}],"remainder":{"location":"deck","position":"bottom","shuffle":true}}`
- `WDK07-Y02-E2` 逆翻訳全文：`【自】このシグニが場に出たとき：あなたのデッキの上からカードを4枚見る。その中からカードを1枚まで【シード】としてシグニゾーンに出し、残りをシャッフルしてデッキの一番下に置く`
- `WDK07-Y03-E2` 逆翻訳全文：同上。
- `WDK07-Y04-E2` 逆翻訳全文：同上。
- `WXK04-007-E1` 逆翻訳全文：同上。
- `WXK04-008-E1` 逆翻訳全文：同上。
- `WXK04-009-E2` 逆翻訳全文：同上。
- `WXK05-007-E3` 逆翻訳全文：同上。
- `WDK07-Y07-E1` 逆翻訳全文：`【起】（メイン起動）/（アタックフェイズ起動）：〈《白×2》〉ベット―《コインアイコン》あなたがベットする場合、このアーツの使用コストは《白×0》になる。そしてあなたの【シード】１枚を対象とし、それを開花する。そのシグニゾーンにシグニがある場合、代わりにそのシグニを手札に戻してから開花する。そしてあなたのデッキの上からカードを4枚見る。その中からカードを1枚まで【シード】としてシグニゾーンに出し、残りをシャッフルしてデッキの一番下に置く`
- 判定：8効果とも意味一致。「1枚まで」は原文の「1枚を…出してもよい」と同じ0..1枚の任意選択。

### `WXK04-010-E1`

- 原文：`アンコール－《コインアイコン》（アンコールコストを追加で支払って使用してもよい。そうした場合、これは追加で「このカードをルリグデッキに戻す。」を得る）あなたのデッキの上からカードを４枚見る。その中からカードを２枚まで【シード】としてあなたのシグニゾーンに出し、残りをシャッフルしてデッキの一番下に置く。…`
- 生成 JSON：`{"type":"LOOK_PICK_CHAIN","owner":"self","revealCount":4,"stages":[{"pickCount":2,"pickUpTo":true,"pickNoun":"カード","then":"seed"}],"remainder":{"location":"deck","position":"bottom","shuffle":true}}`
- 逆翻訳全文：`【起】（メイン起動）/（アタックフェイズ起動）：〈《白×0》〉あなたのデッキの上からカードを4枚見る。その中からカードを2枚まで【シード】としてシグニゾーンに出し、残りをシャッフルしてデッキの一番下に置く`
- 判定：O-50対象節（4枚／2枚まで／シード／残り shuffled-bottom）は一致。**効果全文は不一致**で、既存 parser はアンコールの追加コイン支払いとルリグデッキへ戻る付加を表現していない。今回の条件外食い違いとして据え置いた。

### `WXEX1-13-E2`

- 原文：`【起】《ターン１回》《アタックフェイズアイコン》《コインアイコン》：あなたのデッキの上からカードを５枚見る。その中から２枚までを【トラップ】としてあなたのシグニゾーンに設置する。残りをシャッフルしてデッキの一番下に置く。`
- 生成 JSON：`{"type":"LOOK_PICK_CHAIN","owner":"self","revealCount":5,"stages":[{"pickCount":2,"pickUpTo":true,"pickNoun":"カード","then":"trap"}],"remainder":{"location":"deck","position":"bottom","shuffle":true}}`
- 逆翻訳全文：`【起】（アタックフェイズ起動）：《once_per_turn》〈コイン1〉あなたのデッキの上からカードを5枚見る。その中からカードを2枚まで【トラップ】としてシグニゾーンに設置し、残りをシャッフルしてデッキの一番下に置く`
- 判定：意味一致。シード用 STUB は使わず、既存トラップ専用経路へ接続した。

## 4. 見送った効果の全件と理由

- `WXEX1-13-E1`：原文は「残りをデッキの一番下に置く」で shuffle しない。PLAN の誤登録。live を変更していない。
- `SP27-005-E1`：停止条件つき公開後の hit を「手札か場」から選ぶ continuation が既存 `REVEAL_UNTIL` に無い。機構追加禁止に従い据置。
- `WX20-041-CB-E1`：停止条件「青ではない＜遊具＞」の literal color exclusion が既存 filter に無い。据置。
- `WX25-P2-026-E2`：「残り」はライフクロスであり、同効果の `SHUFFLE_DECK` は別の原文「デッキをシャッフルし」に対応する正しい動作。無変更。
- 第33バッチの RAP 据置7効果：`WXK04-004-E2`／`WXDi-D02-17AT-E1`／`WXDi-D04-021-E1`／`WXDi-D08-022-E1`／`WXDi-P08-023-E1`／`WX25-P2-066-E1`／`WX25-CP1-002-E1`。fresh が shuffle 以外の filter・条件・選択木も変えるため今回も無変更。
- 既に正しい17効果：`PR-370-E2`／`PR-434-E1`／`PR-434-BURST`／`WX24-P1-001-E1`／`WX25-CP1-001-E1`／`WX25-P2-045-E1`／`WXDi-CP02-007-E2`／`WXDi-CP02-026-E3`／`WXDi-CP02-027-E3`／`WXDi-CP02-028-E2`／`WXDi-CP02-029-E2`／`WXEX1-06-E2`／`WXK04-044-E2`／`WXK04-045-E1`／`WXK05-023-E3`／`WXK05-023-BURST`／`WXK10-060-E2`。baseline との全effect diffの変更集合に1件も無く、無変更。

## 5. 条件以外で見つけた原文との食い違い

- 1件：`WXK04-010-E1` のアンコール追加コスト（コイン）と「ルリグデッキに戻す」付加が parser/live に無い。O-50の4枚／2枚／シード／残り処理とは別層なので据え置いた。
- `WXEX1-13-E1` は食い違いではなく O-50 リスト側の誤登録。原文・live とも shuffle 無し。

## 6. ゲート実測

- `npm run gates`：全緑。
- golden：**2662 PASS / 0 FAIL**（基準2659から+3、減少なし）。
- census：高シグナル欠落 **608**／BASELINE_HIGH 608。`WXK05-050-E1` 解消-1と、`WXK04-010-E1` の manual 影武者解除で既存アンコール欠落が顕在化+1。総数は増減0。
- `node scripts/groupSimilar.mjs --all`：5986カード／265グループ／同型★ **0**。
- smoke：10693効果、OK 10693／CRASH 0／HANG 0／INVARIANT 0／SKIP 0。
- fuzz：200ゲーム、CRASH 0／HANG 0／INVARIANT 0／EXPLOSION 0（最終 gates は distinct 2671）。
- census:stubs：A群の無言 no-op **0種0件**、C群 **0種0件**。
- manual-fields：field loss 0／parseStatus違反0。
- lint：0 errors／**269 warnings**（基準269、増減0）。
- `npm run regen`：完走。

## 7. 生パース diff・live diff・不変条件

スコープ表を実装する前に `tmp_o50_verify.mjs` を作り、baseline では変更0／`--require-all` では15件すべて未変更として意図どおり赤になることを確認した。採用後の最終実測：

- live 変化集合（15）：`WX20-072-E1`, `WX21-037-E2`, `WXEX1-13-E2`, `WX25-P3-047-E1`, `WXK04-007-E1`, `WXK04-008-E1`, `WXK04-009-E2`, `WXK04-010-E1`, `WXK05-007-E3`, `WXK05-050-E1`, `WDK01-008-E1`, `WDK07-Y02-E2`, `WDK07-Y03-E2`, `WDK07-Y04-E2`, `WDK07-Y07-E1`。
- live scope 外変更：**0**。
- baseline worktree でも同じ全CSVを parse し、10660 effectId の canonical JSON を比較した生パース変化集合（14）：上記から、baseline fresh が既に shuffled-bottom だった `WX25-P3-047-E1` だけを除いた14効果。
- 生パース outlier：**0**。scope外差分0。
- 不変条件①：15/15で `SHUFFLE_DECK` 0。
- 不変条件②：15/15で remainder が `{location:'deck',position:'bottom',shuffle:true}`。
- 不変条件③：C1 10/10で原文から機械抽出した revealCount／pickCount と一致（4/1×8、4/2×1、5/2×1）。固定 `deck.slice(0,4)`／`maxPick:1` の旧 STUB は C1 live から0。
- 不変条件④：全10693 live effect の baseline 比較で対象外変更0。したがって「既に正しい17」と「据置7」を含む touch禁止群は行単位 canonical JSON 一致。

第33バッチの正しい17効果は baseline/current の effect JSON が全件同じであり、4つの scope-out も変更集合に無い。`WXEX1-13-E1` も同一。これは自己申告ではなく全effect diffの結果。

## 8. held バケットの増減と lint warning の増減

報告直前に `npm run build:effects` → `node scripts/heldReview.mjs` を連続再実行した実測：

- held：**81 → 81**（増0／減0、33署名）。SHA-256 は baseline と同じ `5DF7E25361C64757AF9E9086C1D4E5582665042321B76FB373235EDC98A2300A`。原文照合すべき増減0件。
- partial：**15 → 15**（増0／減0）。SHA-256 は baseline と同じ `18AB21BA1E07691B90474814FA13D1A2041B7864E586FD2377EF353B121FB821`。増減0件。
- idset：**46 → 45**。removed は `WX20-072` 1件だけ。E1を parser AUTOへ戻し、同カードの既存 E3P/E3 manual 定義を live と同値に揃えたことで id集合不整合が解消した。追加・既存値変更0。
- build 最終値：新規採用0／純改善採用1／効果単位採用0／温存(手修正)434／温存(要レビュー)81／fresh空2／parseStatusのみ差198／id集合ズレ45。
- lint warning：**269 → 269**（増減0）。

意味照合 `findings.jsonl` を18効果で検索した結果、該当は `WX21-037-E2` の1件だけ。`WX21-037-E2 :: 残りをシャッフルして` を末尾追記し、台帳 OPEN は **730 → 729**。残る17効果は findings 母集団外なので台帳行を追加していない。

## 9. やらなかったことと非変更証明

- commit／push：していない。
- `docs/PLAN.md`／`docs/PLAN_PROGRESS.md`：編集していない。
- 新 action 型、新ゾーン、新シード／トラップ型：追加していない。
- `PLACE_SEED_FROM_REVEALED`／`PLACE_SEEDS_FROM_REVEALED`／`INTERNAL_SET_SEED`／トラップ handlers：読んだだけで本体を変更していない。
- `WXEX1-13-E1`、C3 2効果、X 1効果、RAP据置7、既に正しい17：変更していない（全effect diffのscope外0で証明）。
- `SP27-005-E1`／`WX20-041-CB-E1` の不足機構、`WX25-P2-026-E2` のlife_cloth経路、`WXK04-010-E1` のアンコール欠落：実装していない。
- force-adopt allowlist、`isPureSuperset` の巻き戻し、live JSON の手書き：していない。採用は build→heldReview、既存MANUAL保護の更新は `syncManualLive.ts` を使用した。
- `PLACE_SEED_FROM_REVEALED` 本体を触っていないため `genStubsMd.mjs` は実行していない。`census:stubs` は A無言0／C0。

既存 golden の行差分は O-50契約の反転箇所、追加3テスト、解消した `MANUAL_DRIFT_KNOWN` 1行の削除だけ。他の既存テスト本文は変更していない。

## 10. 第33バッチ非採用契約 golden の反転

元の意図は正しかった。`scripts/goldenTest.ts` の第33バッチ2本目は、(a) `WX21-037-E2` の RAP に shuffle フラグだけを足さない、(b) `WXK04-007-E1` の top LAR に死フラグを足さない、を固定していた。どちらも「受け皿が無い段階で見かけだけ直すな」という非採用契約だった。

今回の反転後（`scripts/goldenTest.ts:45249-45269`）は次を assert する。

1. `WX21-037-E2` は RAP remainder.shuffle=true、`SHUFFLE_DECK`=0。
2. `WXK04-007-E1` は LPC stage.then=`seed`、bottom+shuffle、`SHUFFLE_DECK`=0、旧 `PLACE_SEED_FROM_REVEALED` STUB=0。
3. 別テスト（`:45272`）でC1全10効果の見る枚数・設置上限・seed/trap・shuffled-bottom・全デッキshuffle無しを固定。
4. engineテスト（`:45318`, `:45346`）で4枚から2枚シード／5枚から2枚トラップを別ゾーンへ置き、未公開山札の順序を維持し、公開残りだけを下へ戻すことを固定。

空振り確認として、parser／engine修正前に反転後 golden を実行し、(a) `WX21-037-E2` の `remainder.shuffle` が `undefined`、(b) `WDK07-Y02-E2` に LPC が無い、の **2 FAIL** を実測した。修正後は2662 PASS。旧STUB否定 assert は `batch33Actions(...,'STUB').some(s => s.id === 'PLACE_SEED_FROM_REVEALED')` として id を実際に走査しており、型名を誤って検索する空振りも除去した。

## 11. エンコーディングと台帳

- 変更25ファイルについて baseline と比較し、U+FFFD／3文字以上連続 `?`／先頭BOM `efbbbf` の新規増0を確認した。
- 台帳最終値：消化380、OPEN 729（HIGH/MED/LOW 506/219/4）。
