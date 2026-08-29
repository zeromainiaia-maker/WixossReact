# PLAN §5.3 `O-60` 第12バッチ報告

対象：`POWER_MOD_PER_REVEALED_LEVEL` / `REVEAL_TOP_CONDITIONAL_ROUTE` の payload 化

## 1. 触ったファイルと理由

実装：

- `src/data/effectParser.ts` — 群Aの既存倍率 payload へ奇数フィルタを配線、群Bの公開→条件→移動を構造化、群Cの公開枚数とトラッシュ枚数を木の形で同期。
- `src/data/parsers/parseSentencePart3.ts` — `POWER_MOD_PER_REVEALED_LEVEL` を生成する catch-all を撤去。
- `src/data/parsers/parseSentencePart4.ts` — `REVEAL_TOP_CONDITIONAL_ROUTE` を生成する2本の catch-all を撤去。
- `src/engine/effectExecutor.ts` — 既存 `TRANSFER_TO_HAND` に `DECK_CARD + fromTop:true` の限定実行分岐を追加。
- `src/engine/execStubPart2.ts` / `src/engine/execStubPart3.ts` — 対象2ハンドラを撤去。
- `scripts/decompileEffects.ts` — 新payloadのデッキトップ移動・公開条件・奇数条件を逆翻訳へ描画。
- `scripts/goldenTest.ts` — fresh parse、成立／不成立、対象1体、倍率、fail-closed の回帰を追加。
- `scripts/censusEngineText.ts` — `BASELINE_SELF_TEXT` を実測136→134へ更新。
- `scripts/vocabCensus.ts` — 公開を表す既存木 `LOOK_AND_REORDER{private:false}` を狭く認識し、`BASELINE_HIGH` を実測489→482へ更新。

収穫・生成物：

- `public/data/effects_WX.json` / `effects_WXK.json` / `effects_misc.json` — 対象7効果の採用結果。
- `docs/_census_enginetext.txt` / `_census_stubs.txt` / `_vocab_census.txt` / `_held_review.txt` — 最終計器・held明細。
- `docs/decompile_sheet1.txt` / `sheet3.txt` / `sheet4.txt` / `sheet5.txt` / `grouped_sentence_all.txt` — `npm run regen` の対象効果を含む再生成結果。
- `docs/BUGFIXES.md` — 修正概要・原因・検証値を追記。
- 本ファイル — 指定の10項目を記録。

`docs/PLAN.md` / `docs/PLAN_PROGRESS.md` / `stage2_closed.txt` は触っていない。commit / push もしていない。

## 2. 調査結果：受け皿が本当に使えたか

### 群A

使用できた。`resumeLookAndReorder` は閲覧したカードそのものを `lastProcessedCards` に保存し、
`lastProcessedUnits()` は `perLastProcessed.filter` で絞った後、`unit:level_sum` ならレベル合計、unit省略なら枚数を返す。
`execPowerModify()` はその値を選択UIより前に `delta` へ焼き込み、選択後に `lastProcessedCards` が対象札へ置き換わっても倍率を失わない。
したがって `deltaPerLastProcessedCount + perLastProcessed` をそのまま使用できた。

`SPK01-09-E1` だけ既存converterが `levelParity` を転記していなかったため、名詞句の「レベルが奇数」を
既存 `TargetFilter.levelParity:odd` へ足した。新型・新フィールドは不要だった。

### 群B

`REVEAL_DECK_TOP` はデッキを動かさず、`last_revealed_deck_cards` と `lastProcessedCards` にトップを記録する。
`LAST_PROCESSED_MATCHES` は `matchesFilter` を通じて `hasCrossIcon` と `cardClass`（配列ORを含む）を評価できた。
不成立時に `else` を持たせなければ、公開札はトップに残る。

エナ行きは既存 `ENERGY_CHARGE_FROM_DECK` をそのまま使用できた。手札行きだけは、既存型に
`EffectTarget.fromTop` がある一方、`execTransferToHand()` が `DECK_CARD` を消費せず no-op にしていた。
そこで新型・新フィールドを作らず、`source.type === DECK_CARD && source.fromTop === true` のときだけ先頭から移す分岐を追加。
`DECK_CARD` だけ、または旧STUBだけでは引き続き no-op なので fail-closed。

## 3. 採用した効果の全件

### `WDK13-012-E1`

原文該当節：「デッキの上からカードを4枚公開。相手シグニ1体を対象とし、公開されたシグニのレベル合計1につき－1000。公開札をシャッフルしてデッキ下。」

```json
{"type":"SEQUENCE","steps":[{"type":"LOOK_AND_REORDER","source":{"location":"deck","owner":"self"},"count":4,"private":false,"reorder":false,"canTrash":false,"destination":{"location":"deck","owner":"self","position":"bottom"},"shuffle":true},{"type":"POWER_MODIFY","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ"},"upToCount":false},"delta":-1000,"deltaPerLastProcessedCount":true,"perLastProcessed":{"filter":{"cardType":"シグニ"},"unit":"level_sum"}}]}
```

逆翻訳全文：`【起】（メイン起動）：〈《ダウン》〉あなたのデッキの上から4枚を公開し、公開したカードをシャッフルしてデッキの一番下に置く。そして対戦相手のシグニ1体のパワーをこの方法で処理したシグニのレベルの合計1につき－1000する`

判定：一致。公開札・後始末・対象1体・レベル合計倍率がすべて見える。

### `WXK10-030-E1`

原文該当節：「デッキの上から4枚公開。相手シグニ1体を対象とし、レベル合計1につき－1000。公開したカードをトラッシュ。」

```json
{"type":"SEQUENCE","steps":[{"type":"LOOK_AND_REORDER","source":{"location":"deck","owner":"self"},"count":4,"private":false,"reorder":false,"canTrash":false,"destination":{"location":"deck","owner":"self","position":"top"}},{"type":"POWER_MODIFY","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ"},"upToCount":false},"delta":-1000,"deltaPerLastProcessedCount":true,"perLastProcessed":{"filter":{"cardType":"シグニ"},"unit":"level_sum"}},{"type":"TRASH","target":{"type":"DECK_CARD","owner":"self","count":4}}]}
```

逆翻訳全文：`【自】このシグニが場に出たとき：〈《黒×1》〉あなたのデッキの上4枚を公開する。そして対戦相手のシグニ1体のパワーをこの方法で処理したシグニのレベルの合計1につき－1000する。そしてあなたのデッキの上からカードを4枚トラッシュに置く`

判定：一致。群Cも採用し、1枚だけ捨てる旧誤りを4枚へ是正。

### `SPK01-09-E1`

原文該当節：「デッキの上から5枚公開。相手シグニ1体を対象とし、公開されたレベルが奇数のシグニ1枚につき－2000。公開札をシャッフルしてデッキ下。」

```json
{"type":"SEQUENCE","steps":[{"type":"LOOK_AND_REORDER","source":{"location":"deck","owner":"self"},"count":5,"private":false,"reorder":false,"canTrash":false,"destination":{"location":"deck","owner":"self","position":"bottom"},"shuffle":true},{"type":"POWER_MODIFY","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ"},"upToCount":false},"delta":-2000,"deltaPerLastProcessedCount":true,"perLastProcessed":{"filter":{"cardType":"シグニ","levelParity":"odd"}}}]}
```

逆翻訳全文：`【自】このシグニがアタックしたとき：あなたのデッキの上から5枚を公開し、公開したカードをシャッフルしてデッキの一番下に置く。そして対戦相手のシグニ1体のパワーをこの方法で処理したレベルが奇数のシグニ1枚につき－2000する`

判定：一致。奇数フィルタを逆翻訳にも表示。

### `WXK07-091-E1`

原文該当節：「デッキの一番上を公開。相手シグニ1体を対象とし、公開シグニのレベル1につき－1000。公開札をトラッシュ。」

```json
{"type":"SEQUENCE","steps":[{"type":"LOOK_AND_REORDER","source":{"location":"deck","owner":"self"},"count":1,"private":false,"reorder":false,"destination":{"location":"deck","owner":"self","position":"top"}},{"type":"POWER_MODIFY","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ"},"upToCount":false},"delta":-1000,"deltaPerLastProcessedCount":true,"perLastProcessed":{"filter":{"cardType":"シグニ"},"unit":"level_sum"}},{"type":"TRASH","target":{"type":"DECK_CARD","owner":"self","count":1}}]}
```

逆翻訳全文：`【自】このシグニが場に出たとき：〈《黒×1》〉あなたのデッキの上1枚を公開する。そして対戦相手のシグニ1体のパワーをこの方法で処理したシグニのレベルの合計1につき－1000する。そしてあなたのデッキの上からカードを1枚トラッシュに置く`

判定：一致。旧ハンドラの相手3体全部への適用を対象選択1体へ修正。

### `WX08-025-BURST`

原文該当節：「カードを1枚引く。その後、トップを公開し、それが《クロスアイコン》を持つシグニなら手札に加える。」

```json
{"type":"SEQUENCE","steps":[{"type":"DRAW","owner":"self","count":1},{"type":"SEQUENCE","steps":[{"type":"REVEAL_DECK_TOP","owner":"self","count":1},{"type":"CONDITIONAL","condition":{"type":"LAST_PROCESSED_MATCHES","filter":{"cardType":"シグニ","hasCrossIcon":true},"verbJa":"公開された"},"then":{"type":"TRANSFER_TO_HAND","source":{"type":"DECK_CARD","owner":"self","count":1,"fromTop":true}}}]}]}
```

逆翻訳全文：`【LB】【ライフバースト】：あなたのカードを1枚引く。そしてあなたのデッキの上からカードを1枚公開する。そしてこの方法で公開されたカードが《クロスアイコン》を持つシグニであるなら、あなたのデッキの一番上のカードを手札に加える`

判定：一致。不成立時は分岐が何もせずトップに残す。

### `WX10-030-BURST`

原文該当節：「カードを1枚引く。その後、トップを公開し、それが＜鉱石＞か＜宝石＞のシグニなら手札に加える。」

```json
{"type":"SEQUENCE","steps":[{"type":"DRAW","owner":"self","count":1},{"type":"SEQUENCE","steps":[{"type":"REVEAL_DECK_TOP","owner":"self","count":1},{"type":"CONDITIONAL","condition":{"type":"LAST_PROCESSED_MATCHES","filter":{"cardType":"シグニ","cardClass":["鉱石","宝石"]},"verbJa":"公開された"},"then":{"type":"TRANSFER_TO_HAND","source":{"type":"DECK_CARD","owner":"self","count":1,"fromTop":true}}}]}]}
```

逆翻訳全文：`【LB】【ライフバースト】：あなたのカードを1枚引く。そしてあなたのデッキの上からカードを1枚公開する。そしてこの方法で公開されたカードが＜鉱石＞か＜宝石＞のシグニであるなら、あなたのデッキの一番上のカードを手札に加える`

判定：一致。クラス配列はORとして評価・描画。

### `WXK05-021-BURST`

原文該当節：「カードを1枚引く。その後、トップを公開し、それが＜植物＞のシグニならエナゾーンに置く。」

```json
{"type":"SEQUENCE","steps":[{"type":"DRAW","owner":"self","count":1},{"type":"SEQUENCE","steps":[{"type":"REVEAL_DECK_TOP","owner":"self","count":1},{"type":"CONDITIONAL","condition":{"type":"LAST_PROCESSED_MATCHES","filter":{"cardType":"シグニ","cardClass":"植物"},"verbJa":"公開された"},"then":{"type":"ENERGY_CHARGE_FROM_DECK","owner":"self","count":1}}]}]}
```

逆翻訳全文：`【LB】【ライフバースト】：あなたのカードを1枚引く。そしてあなたのデッキの上からカードを1枚公開する。そしてこの方法で公開されたカードが＜植物＞のシグニであるなら、あなたのデッキの上から1枚をエナゾーンに置く`

判定：一致。不成立時はトップに残る。

## 4. 見送った効果

0件。指定7効果を全件採用した。スコープ外の `LOOK_AND_REORDER` regex、`POWER_MOD_PER_COUNT`、隣接ハンドラには手を出していない。

## 5. 条件以外で見つけた原文との食い違い

1件：群Cの `WXK10-030-E1`。公開4枚に対し旧JSONが `TRASH{DECK_CARD,count:1}` だった。
同じSEQUENCE内に公開・公開札倍率・デッキトップトラッシュが各1つあり、順序も公開→倍率→トラッシュの木だけを対象に、
トラッシュ枚数を公開枚数へ揃えた。`WXK07-091-E1` は公開1枚なので不変。修正後、残存する食い違いは0件。

## 6. ゲート数値

- `npm run gates`：全緑。
- typecheck：PASS。
- golden：3019 / 3019 PASS（投入前3016、追加3テスト）。
- smoke：10704 / 10704 OK、CRASH/HANG/INVARIANT/SKIPすべて0。
- fuzz：seed 12648430、200ゲーム×最大40手、CRASH/HANG/INVARIANT/EXPLOSIONすべて0。
- census：高シグナル482 / baseline 482（投入前489）。減少理由は `LOOK_AND_REORDER{private:false}` という既存の公開表現を木形で較正したため。`private:true` は免除しない。
- census:stubs：A群0、C群0。
- manual-fields：field loss 0、manual parseStatus違反0。
- lint：0 errors / 249 warnings（投入前と同数）。
- census:enginetext：A群134行 / 131ハンドラ、B 59行、C 28行。miss 38ハンドラ / 50カード。
- `BASELINE_SELF_TEXT`：136→134。
- `npm run regen`：完走。対象2 STUB の逆翻訳残存0。

着手前不変条件は、行番号と集計ヘッダを正規化した非対象 `census:enginetext` 内容で差分0。
実測：`O60_BATCH12_NON_TARGET_NORMALIZED_DIFF=0`。対象2ハンドラだけが消え、他ハンドラの意味的行は増減していない。

## 7. 生パース diff の変化集合と outlier

変化集合は指定7効果だけ：

`WDK13-012-E1 / WXK10-030-E1 / SPK01-09-E1 / WXK07-091-E1 / WX08-025-BURST / WX10-030-BURST / WXK05-021-BURST`

public live JSON の HEAD 比較も同じ7 effectIdだけ。カードの別効果の巻き添えは0。outlierは0件。

## 8. held バケットと lint warning

投入前：held 89枚 / 31署名。
初回fresh：96枚 / 34署名（+7枚は対象7カードだけ）。

原文照合：

- +4 `POWER_MODIFY -STUB`：群A4件。対象1体、単価、level_sum / odd、公開後処理まで一致。
- +2 `REVEAL_DECK_TOP + CONDITIONAL + TRANSFER_TO_HAND -STUB`：WX08 / WX10。条件と手札行き、不成立no-opが一致。
- +1 `REVEAL_DECK_TOP + CONDITIONAL + ENERGY_CHARGE_FROM_DECK -STUB`：WXK05。植物条件とエナ行き、不成立no-opが一致。

7枚を明示採用後、報告直前の再実行は held 89枚 / 31署名。対象由来の増分0。
lint は投入前249 warnings → 最終249 warnings（増減0、errors 0）。

## 9. §5-29 fresh assert の反転確認

新規テスト `O-60⑫ fresh: 公開レベル倍率とデッキトップ条件ルートが7効果すべて payload になる` は
`parseCardEffects()` を直接呼び、live JSONを読まない。

実反転：

1. 群Aの旧 catch-all を一時復活 → exit 1。`WDK13-012-E1: 旧STUBが fresh parse に残った`。
2. `levelParity` 転記を一時除去 → exit 1。`SPK01-09-E1: レベル偶奇 expected=odd got=undefined`。
3. 群Bの新規文型を一時停止 → exit 1。`WX08-025-BURST: 記録付きトップ公開 expected=1 got=0`。

各反転を戻した後、freshテスト PASS、さらにフィルタなし golden 3019/3019 PASSを確認した。

## 10. 報告書の読み返し

実施済み：`wc -c` = 15395 bytes。先頭8行と末尾8行をUTF-8で再読し、本文が途切れていないことを確認。
変更24ファイルの U+FFFD 新規増加0、3文字以上連続 `?` 新規増加0、UTF-8 BOM 新規増加0も確認した。
