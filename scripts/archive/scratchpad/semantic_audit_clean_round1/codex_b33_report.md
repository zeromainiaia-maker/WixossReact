# 段2 第33バッチ報告：残りをシャッフルしてデッキの一番下に置く

- 基準 HEAD：`3ef547aa1`
- 実施日：2026-08-24
- CSV 検算：BOM 除去、`CardData_Variants.csv` 除外で 6712カード／該当47カード
- 結論：生パース20効果を安全に改善し、live へは不変条件を満たす11効果だけを採用した。live／生パースとも outlier 0。

## 1. 触ったファイルと理由

- `src/data/effectParser.ts`：効果単位の原文が厳密に「残りをシャッフルしてデッキの一番下に置く／戻す」である AUTO 木だけに、既存の `shuffle:true` を配線した。カード全文では兄弟効果へ誤付着するため、effectId 単位の source log を使った。
- `scripts/goldenTest.ts`：RAP／LAR の parser と engine について、成立・不成立を対で4テスト追加した。
- `scripts/heldReview.mjs`：partial カード内の AUTO 効果だけを fresh へ戻し、MANUAL/PARTIAL の兄弟を保存する汎用 `--adopt-partial-effect` を追加した。カード固有 allowlist は持たない。
- `public/data/effects_WX24_26.json`／`effects_WXDi.json`／`effects_WXK.json`：`build:effects` と review 経路で採用した live 11効果。
- `docs/decompile_sheet3.txt`／`sheet7.txt`／`sheet8.txt`／`sheet9.txt`／`grouped_sentence_all.txt`：`npm run regen` の再生成物。
- `docs/_census_stubs.txt`：parser 行追加に伴う生成元行番号の再生成差分だけ。
- `scripts/archive/scratchpad/semantic_audit_clean_round1/stage2_closed.txt`：findings に存在する4 finding を指定 quote の前方一致形式で閉じた。
- `docs/BUGFIXES.md`：修正、見送り、検証結果を先頭へ追記した。
- 本ファイル：第33バッチの全件報告。

`docs/PLAN.md` と `docs/PLAN_PROGRESS.md` は編集していない。

## 2. 3受け皿の engine 消費確認

1. `REVEAL_AND_PICK.remainder.shuffle`
   - 型は `src/types/effects.ts:1817,1838`。
   - no-pick 経路は `effectExecutor.ts:5926`、SEARCH pending への受け渡しは `:5963`、LOOK_PICK_CHAIN の残り束は `:6077`、SEARCH resume は `:8843` でそれぞれ実際に `shuffle(...)` を分岐実行する。
   - golden で `shuffle` 省略時は公開順を維持し、`true` 時だけ残り2枚の順序が変わることを固定した。
2. `LOOK_AND_REORDER.shuffle`
   - 型は `src/types/effects.ts:1497,1507`。
   - `execLookAndReorder` 本体は `effectExecutor.ts:5287`、`:5341` で pending へ `shuffle:true` を渡し、`resumeLookAndReorder` の `:9229` で `keepRaw` をシャッフルしてから `:9237` 以降の destination へ戻す。
   - golden で bottom 戻しの省略／true を対にして、最終デッキ下の順序差を固定した。
3. `REVEAL_UNTIL` の shuffled-bottom
   - `RevealUntilDestination` は `src/types/effects.ts:1656-1661`。
   - 直接移動は `effectExecutor.ts:6197,6200`、選択を伴う汎用 `REVEAL_UNTIL` は `:6224` 本体から `:6276-6278` で RAP remainder の `shuffle:true` へ橋渡しし、旧 `REVEAL_UNTIL_TO_HAND` も `:6324` で `restDest === 'deck_bottom_shuffled'` を消費する。
   - 今回 A3 は0件なので JSON は変更していないが、受け皿は死フラグではない。

## 3. 採用した効果の全件（11効果）

以下の JSON は各効果で今回変更した受け皿ノード全体。逆翻訳は `npm run regen` 後の全文。

### `WXK04-044-E2`

- 原文節：`あなたのデッキの上からカードを５枚見る。その中から＜紅蓮＞のシグニ１枚を公開し手札に加え、残りをシャッフルしてデッキの一番下に置く。`
- 生成 JSON：`{"type":"REVEAL_AND_PICK","owner":"self","revealCount":5,"filter":{"story":"紅蓮","cardType":"シグニ"},"pickCount":1,"then":{"type":"ADD_TO_HAND","owner":"self"},"remainder":{"location":"deck","position":"bottom","shuffle":true}}`
- 逆翻訳全文：`【自】このシグニが場に出たとき：〈手札1枚を捨てる〉あなたのデッキ上5枚を公開し、その中から＜紅蓮＞のシグニを1枚手札に加える、残りをシャッフルしてデッキの一番下に置く`
- 判定：意味一致（`【出】` を場に出たときの自動能力として逆翻訳する表記差だけ）。

### `WXK05-023-E3`

- 原文節：`あなたのデッキの上からカードを５枚見る。その中から赤のスペル１枚を公開し手札に加え、残りをシャッフルしてデッキの一番下に置く。`
- 生成 JSON：`{"type":"REVEAL_AND_PICK","owner":"self","revealCount":5,"filter":{"color":"赤","cardType":"スペル"},"pickCount":1,"pickNoun":"スペル","then":{"type":"ADD_TO_HAND","owner":"self"},"remainder":{"location":"deck","position":"bottom","shuffle":true}}`
- 逆翻訳全文：`【自】このシグニが場に出たとき：〈《赤×1》〉あなたのデッキ上5枚を公開し、その中から《赤》のスペルを1枚手札に加える、残りをシャッフルしてデッキの一番下に置く`
- 判定：意味一致。

### `WXDi-D01-011-E1`

- 原文節：`あなたのデッキの上からカードを８枚見る。その中からレベル１とレベル２とレベル３のシグニをそれぞれ１枚まで場に出し、残りをシャッフルしてデッキの一番下に置く。その後…能力を得る。`
- 生成 JSON：`{"type":"LOOK_AND_REORDER","source":{"location":"deck","owner":"self"},"count":8,"private":true,"reorder":false,"canTrash":false,"destination":{"location":"deck","owner":"self","position":"bottom"},"shuffle":true}`
- 逆翻訳全文：`【起】（メイン起動）：〈《無×8》〉あなたの場に＜アンシエント・サプライズ＞のルリグが3体以上かつあなたのセンタールリグがレベル1以上の場合、あなたのデッキの上から8枚を公開し、公開したカードをシャッフルしてデッキの一番下に置く`
- 判定：**全文は不一致**。今回の shuffle 軸は原文どおりになったが、既存木にレベル1/2/3を場へ出す選択と3能力付与が無い。条件外で見つけた既存欠落として据え置き、shuffle 以外は変更していない。

### `WXDi-CP02-007-E2`

- 原文節：`あなたのデッキの上からカードを７枚見る。その中からカードを２枚まで手札に加え、残りをシャッフルしてデッキの一番下に置く。`
- 生成 JSON：`{"type":"REVEAL_AND_PICK","owner":"self","revealCount":7,"pickCount":2,"pickUpTo":true,"pickNoun":"カード","then":{"type":"ADD_TO_HAND","owner":"self"},"remainder":{"location":"deck","position":"bottom","shuffle":true}}`
- 逆翻訳全文：`【起】（メイン起動）：《once_per_game》〈《白×0》〉あなたのデッキ上7枚を公開し、その中からカードを2枚まで手札に加える、残りをシャッフルしてデッキの一番下に置く`
- 判定：意味一致。

### `WXDi-CP02-026-E3`

- 原文節：`あなたのデッキの上からカードを７枚見る。その中から＜ブルアカ＞のカード１枚を公開し手札に加え、残りをシャッフルしてデッキの一番下に置く。`
- 生成 JSON：`{"type":"REVEAL_AND_PICK","owner":"self","revealCount":7,"filter":{"story":"ブルアカ"},"pickCount":1,"pickNoun":"カード","then":{"type":"ADD_TO_HAND","owner":"self"},"remainder":{"location":"deck","position":"bottom","shuffle":true}}`
- 逆翻訳全文：`【絆自】このシグニが場に出たとき：あなたのデッキ上7枚を公開し、その中から＜ブルアカ＞のカードを1枚手札に加える、残りをシャッフルしてデッキの一番下に置く`
- 判定：意味一致（原文 `【絆出】` と逆翻訳 `【絆自】このシグニが場に出たとき` は表記差）。

### `WXDi-CP02-027-E3`

- 原文節：`あなたのデッキの上からカードを７枚見る。その中から＜ブルアカ＞のカード１枚を公開し手札に加え、残りをシャッフルしてデッキの一番下に置く。`
- 生成 JSON：`{"type":"REVEAL_AND_PICK","owner":"self","revealCount":7,"filter":{"story":"ブルアカ"},"pickCount":1,"pickNoun":"カード","then":{"type":"ADD_TO_HAND","owner":"self"},"remainder":{"location":"deck","position":"bottom","shuffle":true}}`
- 逆翻訳全文：`【絆自】このシグニが場に出たとき：あなたのデッキ上7枚を公開し、その中から＜ブルアカ＞のカードを1枚手札に加える、残りをシャッフルしてデッキの一番下に置く`
- 判定：意味一致。

### `WXDi-CP02-028-E2`

- 原文節：`あなたのデッキの上からカードを７枚見る。その中から＜ブルアカ＞のカード１枚を公開し手札に加え、残りをシャッフルしてデッキの一番下に置く。`
- 生成 JSON：`{"type":"REVEAL_AND_PICK","owner":"self","revealCount":7,"filter":{"story":"ブルアカ"},"pickCount":1,"pickNoun":"カード","then":{"type":"ADD_TO_HAND","owner":"self"},"remainder":{"location":"deck","position":"bottom","shuffle":true}}`
- 逆翻訳全文：`【絆自】このシグニが場に出たとき：あなたのデッキ上7枚を公開し、その中から＜ブルアカ＞のカードを1枚手札に加える、残りをシャッフルしてデッキの一番下に置く`
- 判定：意味一致。

### `WXDi-CP02-029-E2`

- 原文節：`あなたのデッキの上からカードを７枚見る。その中から＜ブルアカ＞のカード１枚を公開し手札に加え、残りをシャッフルしてデッキの一番下に置く。`
- 生成 JSON：`{"type":"REVEAL_AND_PICK","owner":"self","revealCount":7,"filter":{"story":"ブルアカ"},"pickCount":1,"pickNoun":"カード","then":{"type":"ADD_TO_HAND","owner":"self"},"remainder":{"location":"deck","position":"bottom","shuffle":true}}`
- 逆翻訳全文：`【絆自】このシグニが場に出たとき：あなたのデッキ上7枚を公開し、その中から＜ブルアカ＞のカードを1枚手札に加える、残りをシャッフルしてデッキの一番下に置く`
- 判定：意味一致。

### `WX24-P1-001-E1`

- 原文節：`③あなたのデッキの上からカードを７枚見る。その中からカードを２枚まで手札に加え、残りをシャッフルしてデッキの一番下に置く。`
- 生成 JSON：`{"type":"REVEAL_AND_PICK","owner":"self","revealCount":7,"pickCount":2,"pickUpTo":true,"pickNoun":"カード","then":{"type":"ADD_TO_HAND","owner":"self"},"remainder":{"location":"deck","position":"bottom","shuffle":true}}`
- 逆翻訳全文：`【起】（メイン起動）：〈《白×1》《無×1》〉以下の3つから2つまで選ぶ【【ルリグバリア】１つを得る / 対戦相手のシグニ1体を手札に戻す / あなたのデッキ上7枚を公開し、その中からカードを2枚まで手札に加える、残りをシャッフルしてデッキの一番下に置く】`
- 判定：意味一致。

### `WX25-P2-045-E1`

- 原文節：`あなたのデッキの上からカードを７枚見る。その中からスペルか＜電機＞のシグニを合計２枚まで公開し手札に加え、残りをシャッフルしてデッキの一番下に置く。`
- 生成 JSON：`{"type":"REVEAL_AND_PICK","owner":"self","revealCount":7,"filter":{"anyOf":[{"cardType":"スペル"},{"story":"電機","cardType":"シグニ"}]},"pickCount":2,"pickUpTo":true,"pickNoun":"カード","then":{"type":"ADD_TO_HAND","owner":"self"},"remainder":{"location":"deck","position":"bottom","shuffle":true}}`
- 逆翻訳全文：`【起】（メイン起動）：〈《無×0》〉あなたのデッキ上7枚を公開し、その中からスペルか＜電機＞のシグニを2枚まで手札に加える、残りをシャッフルしてデッキの一番下に置く。そしてこの方法で手札に加えたカードの1枚が青で、もう1枚が黒（別々のカード）なら、対戦相手のシグニ1体のパワーを－10000する（ターン終了時まで）`
- 判定：意味一致。

### `WX25-CP1-001-E1`

- 原文節：`あなたのデッキの上からカードを７枚見る。その中から＜ブルアカ＞のカードを２枚まで公開し手札に加え、残りをシャッフルしてデッキの一番下に置く。`
- 生成 JSON：`{"type":"REVEAL_AND_PICK","owner":"self","revealCount":7,"filter":{"story":"ブルアカ"},"pickCount":2,"pickUpTo":true,"pickNoun":"カード","then":{"type":"ADD_TO_HAND","owner":"self"},"remainder":{"location":"deck","position":"bottom","shuffle":true}}`
- 逆翻訳全文：`【起】（メイン起動）：〈《白×1》《無×1》〉あなたのデッキ上7枚を公開し、その中から＜ブルアカ＞のカードを2枚まで手札に加える、残りをシャッフルしてデッキの一番下に置く。そしてこの方法でカードを2枚以上手札に加えたなら、対戦相手のシグニ1体を手札に戻す。そして（リコレクト：ルリグトラッシュのアーツが4枚以上ある場合のみ以下を行う）。そしてあなたのルリグ1体は『【自】このルリグがアタックしたとき：《once_per_turn》対戦相手は《無》《無》《無》を支払ってもよい。そうしなかった場合、対戦相手のライフクロスを1枚クラッシュする』を得る（ターン終了時まで）`
- 判定：意味一致。

## 4. 見送った効果の全件と理由

### A1/A2 の見送り24効果

| effectId | 理由 |
|---|---|
| `WX20-072-E1` | RAP と後続の全デッキ `SHUFFLE_DECK` が同じ SEQUENCE。フラグ追加だけでは誤った全デッキshuffleを除けず、最終挙動が直らない。 |
| `WX21-037-E2` | 同上。 |
| `WDK01-008-E1` | 同上。 |
| `WX25-P3-047-E1` | 同上。 |
| `WXEX1-13-E1` | LAR destination が `top` で、後続は全デッキ `SHUFFLE_DECK`。bottom化を伴わないフラグは死フラグ。 |
| `WXEX1-13-E2` | 同上。 |
| `WXK04-007-E1` | 同上。 |
| `WXK04-008-E1` | 同上。 |
| `WXK04-009-E2` | 同上。 |
| `WXK04-010-E1` | 同上。生パース側の bottom 受け皿には配線されたが、curated live は top＋全デッキshuffleなので採用しない。 |
| `WXK05-007-E3` | 同上。 |
| `WDK07-Y02-E2` | 同上。 |
| `WDK07-Y03-E2` | 同上。 |
| `WDK07-Y04-E2` | 同上。 |
| `WDK07-Y07-E1` | 同上。 |
| `WXK04-004-E2` | fresh は filter の `cardClass`/`story` 等も変わる。shuffle 以外を変えるため live 採用を見送った。 |
| `WXDi-D02-17AT-E1` | 同上（curated filter と fresh filter が一致しない）。 |
| `WXDi-D04-021-E1` | curated は条件分岐を持つが fresh は単一 RAP。全採用は大幅退化になる。 |
| `WXDi-D08-022-E1` | curated MANUAL 効果で、手書き live を JSON 手編集せず shuffle だけ採る安全な通常経路がない。 |
| `WXDi-P08-023-E1` | 同上。 |
| `WX25-P2-066-E1` | curated は取得後の条件付き手札破棄を持つが fresh は失う。全採用は退化。 |
| `WX25-CP1-002-E1` | curated の4択構造と fresh が異なり、shuffle 以外の不変条件を破る。 |
| `WXDi-D04-021-BURST` | **提示表の偽陽性**。効果単位の原文は「残りを好きな順番でデッキの一番下に置く」であり、shuffle してはいけない。誤採用を効果単位 review で差し戻した。 |
| `WXDi-CP02-007-E3` | **提示表の偽陽性**。同じカードの E2 はshuffleだが、E3原文は「好きな順番で」。兄弟効果の語句を条件にしない golden を追加し差し戻した。 |

### A4 9カードの調査（実装なし）

| カード／効果 | 1行結論 |
|---|---|
| `WX20-041-CB-E1` | `REVEAL_UNTIL` の hit→hand／rest→`deck_bottom_shuffled` は使えるが、停止条件「**青ではない**＜遊具＞」に必要な literal color exclusion が `TargetFilter` に無い。filter 機構追加後に表現可能。 |
| `WX22-021-E2` | 既存 `DECLARE_CARD_NAME`＋`REVEAL_UNTIL.stopCondition:{kind:'declaredName'}`＋hit hand＋rest shuffled-bottom で表現可能。parser の STUB 置換だけで足りる。 |
| `WXK05-050-E1` | 既存 RAP（look3、植物シグニ1、then field、remainder shuffled-bottom）で表現可能。parser の壊れた `ADD_TO_FIELD + SHUFFLE_DECK` 木を置換すれば足りる。 |
| `SP27-005-E1` | `REVEAL_UNTIL` は hit destination を hand または field の固定値で持つだけで、ヒット後の「手札に加える**か**場に出す」の選択を保持できない。選択継続の機構が要る。 |
| `WXDi-D05-006-E1` | A4 の前提と異なり、live は既に2段の `LOOK_PICK_CHAIN`＋`remainder:{bottom,shuffle:true}` で正しい。無変更。 |
| `WXDi-P01-009-E1` | 同上。白＋赤の2段 chain で既に正しい。無変更。 |
| `WXDi-CP01-014-E1` | 同上。白＋黒の2段 chain で既に正しい。無変更。 |
| `WX24-P2-031-E1` | 同上。bounce 後の天使＋悪魔2段 chain に shuffled-bottom が既にある。無変更。 |
| `WX25-P2-026-E2` | LAR は life_cloth 全枚の閲覧・再shuffle自体を扱えるが、そこから1枚を「場**か**エナ」へ選んで残りを life_cloth に戻す継続を表現できない。機構が要る。 |

## 5. 条件以外で見つけた原文との食い違い

- 1件：`WXDi-D01-011-E1`。上記のとおり、既存 live はレベル1/2/3の場出しと3能力付与を欠く。今回は shuffle 以外を触らない不変条件に従い、追加修正していない。
- 提示スコープ自体の誤分類は別に6件：A1/A2 の2偽陽性と、A4内で既に正しい4件。いずれも原文・live を効果単位で照合して無変更にした。

## 6. ゲート実測

- `npm run gates`：全緑
- typecheck：PASS
- golden：**2659 PASS / 0 FAIL**（基準2655から +4、減少なし）
- smoke：10693効果、OK 10693／CRASH 0／HANG 0／INVARIANT 0／SKIP 0
- fuzz：200ゲーム、CRASH 0／HANG 0／INVARIANT 0／EXPLOSION 0、distinct 2663
- census：高シグナル欠落 **608**／BASELINE_HIGH 608（増減0）
- census:stubs：無言 no-op 0、A群/C群 0
- manual-fields：field loss 0／parseStatus違反0
- lint：0 errors／**269 warnings**（基準269、増減0）
- `npm run regen`：完走
- `node scripts/groupSimilar.mjs --all`：同型★ **0**（5986カード、265グループ）
- エンコーディング：変更15ファイルを HEAD と比較し、U+FFFD／3文字以上連続 `?`／先頭BOM の新規増は全項目0。

## 7. 生パース diff・live diff・不変条件

不変条件をスコープ選定前に `tmp_b33_verify.mjs` へ実装し、HEAD の各 effect と leaf 単位で比較した。

- 生パース変化集合（20効果）：`WXK04-004-E2`, `WXK04-010-E1`, `WXK04-044-E2`, `WXK05-023-E3`, `WXDi-D01-011-E1`, `WXDi-D02-17AT-E1`, `WXDi-D04-021-E1`, `WXDi-D08-022-E1`, `WXDi-P08-023-E1`, `WXDi-CP02-007-E2`, `WXDi-CP02-026-E3`, `WXDi-CP02-027-E3`, `WXDi-CP02-028-E2`, `WXDi-CP02-029-E2`, `WX24-P1-001-E1`, `WX25-P2-045-E1`, `WX25-P2-066-E1`, `WX25-P3-047-E1`, `WX25-CP1-001-E1`, `WX25-CP1-002-E1`。
- 生パース outlier：**0**。20件の leaf diff はすべて、bottom RAP remainder または bottom LAR への `shuffle:true` 追加1点だけ。
- live 変化集合：第3節の11効果。
- live outlier：**0**。各効果とも追加 leaf は `action...shuffle:true` の1点だけ。
- `revealCount`／`pickCount`／`filter`／`then`／`remainder.location`／`remainder.position`／`destination` の変更：**0**。
- parser は同一 SEQUENCE に全デッキ `SHUFFLE_DECK` がある木、top LAR、PARTIAL を除外する。効果単位 source log により「好きな順番で」の兄弟効果も除外する。

## 8. held バケットと lint の増減

報告直前に `npm run build:effects` → `node scripts/heldReview.mjs` を連続再実行した実測：

- held：**81 → 81**（増0／減0、33署名）。新規 held は0なので、増減対象の原文照合行も0件。
- partial：**15 → 15**（増0／減0）。
- idset：**46 → 46**（増0／減0）。
- build 最終値：新規採用0／純改善採用1／効果単位採用0／温存(手修正)437／温存(要レビュー)81／fresh空2／parseStatusのみ差198／id集合ズレ46。
- 作業途中にカード全文条件で `WXDi-D04-021-BURST` と `WXDi-CP02-007-E3` が一時誤採用されたが、原文を1効果ずつ照合して発見し、effect source 条件へ絞ったうえで generic review 経路から両方を差し戻した。最終バケットは基準値へ一致。
- lint warning：**269 → 269**（増減0）。

台帳は findings に存在する4件だけが対象。OPEN は **734 → 730**（想定どおり4件減）、消化済みは375 → 379。残り28カードは findings 母集団外なので台帳には書いていない。

## 9. やらなかったこと・非変更証明

- commit／push：していない。
- `docs/PLAN.md`／`docs/PLAN_PROGRESS.md`：編集していない。
- engine、新しい型、新しいフィールド：変更・追加していない。
- A4：調査だけで、9カードとも変更していない。
- 「残りを好きな順番でデッキの下に置く」282カード：一切変更していない。現 engine は RAP remainder の `position !== 'bottom'` を上置きとして扱い、`position:'any'` は並べ替え UI を起動しないため、UI＋pending＋resume の機構が必要。
- D群6カード：カード単位で差分0。7 effectId の canonical JSON SHA-256 は全件 before/after 一致：
  - `WXEX1-06-E2`：`8abcaaee980d41bc4c6f10d89d60b5887c8889386461b03e07c06b7fd32db3f8`
  - `WXK04-045-E1`：`3f1d456ee04768239a5a6933ca24373f37321407a1cea83d47e95dfdff9c14c7`
  - `WXK07-034-E1`：`e2025623906fbe48bf523b94d4ac9b064675b68219cc305634aaa14d464ce064`
  - `WXK10-060-E2`：`509d5034b81fe35430f725335271b9ffd2036a81b45322952061c2b1d3fbfb8f`
  - `PR-370-E2`：`f31c36104f9eca70bb37fe6263f2cdd5e731508a863d2b4cafbd9cd824c0d4fe`
  - `PR-434-E1`：`9d92d7cbe711e9660d0c9ba373f000958bb18c362a2d2fda9c36e7951b695f17`
  - `PR-434-BURST`：`8cdeab3d1193b74d5494831d95bd7ac1e756de0df7809bb1edfa2433c3ffbc73`
- 既存 golden：`git diff --numstat -- scripts/goldenTest.ts` は **94 additions / 0 deletions**。既存行の削除・置換は0で、追加4テストだけ。
- force-adopt list：追加していない。live JSON の手編集もしていない。

機構待ちとして次へ渡すべきものは、(1) top＋全デッキshuffle木の正規化、(2) literal color exclusion、(3) REVEAL_UNTIL hit の hand/field 選択、(4) life_cloth から1枚を field/energyへ移して残りをshuffleする継続、(5) 「好きな順番で」282カード用の並べ替え UI/pending/resume である。今回は PLAN 編集禁止のため O-nn 登録はしていない。
