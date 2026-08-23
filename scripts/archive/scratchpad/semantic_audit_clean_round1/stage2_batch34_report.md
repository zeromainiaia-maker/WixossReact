# 段2 第34バッチ報告：原文「N枚まで」が固定N枚になる効果

日付: 2026-08-23  
基準HEAD: `7e77a2064`  
方針: `findings.jsonl` の未closed findingを起点とし、CSV原文をBOM除去して再走査。commit/pushなし、PLAN/PLAN_PROGRESS編集なし。

## 1. 母集団の数え直し

`public/data/CardData_Sheet1..10.csv` と `CardData_TK.csv` を直接読み、各CSVの先頭BOMを `replace(/^\uFEFF/, '')` で除去した。Sheet8の先頭3 byteは実測 `efbbbf`。6712カードを読み、効果原文の `([０-９\d]+)枚まで` / `([０-９\d]+)体まで` / `好きな枚数` / `好きな数` をeffectId単位で数えた。

- 該当効果: **1013 effectId**
- 下位形（効果単位、重複あり）: `N枚まで` 718 / `N体まで` 199 / `好きな枚数` 81 / `好きな数` 47（重複32）
- HEAD時点で正しく表現済みの機構（効果単位、重複あり）: `upToCount:true` 480 / `count:'ALL'+upToCount` 16 / `optional:true` 8 / `CHOOSE.upTo` 21 / `pickUpTo` 133 / `SEARCH`既定0..max 65
- 上記既存機構の和集合: **679 effectId**
- 差引残: **334 effectId**

差引334は未実装数ではない。「N体までしか場に出せない」の制限文、回数・上限条件、別の専用語彙、STUB/据置を含む。トップレベルactionの `SEQUENCE` / `CHOOSE` / `CONDITIONAL` だけを構造探索し、付与能力内へは再帰していない。今回の文型修正でlive差分になったのは **33 effectId**（指定9＋同じ規則24）だった。

## 2. 実装確認と修正

事前メモのうち「engineが `pickUpTo` を消費していない」は正しかった。一方、型の所在は一部誤りだった。`RevealAndPickAction.pickUpTo` は既存だが、`LookPickChainStage` には `pickUpTo` が無く、`pickCount`だけだったため型を追加した。省略時の既定は一切変えず、真のときだけpendingの `optional:true` を立てた。

配線したengine関数は次の全5箇所。

- `execRevealAndPick`: `pickUpTo:true` → SEARCH `optional:true`
- `execLookPickChain`: `stage.pickUpTo:true` → SEARCH `optional:true`
- `execLookAndReorder`: `upToCount:true` のときだけ、カードを見る前に0..N枚のCHOOSE
- `execTransferToDeck`: `LRIG_TRASH_CARD.source.upToCount:true` をSELECT_TARGETへ
- `applyDirectAction` の `TRANSFER_TO_DECK`: 選択されたルリグトラッシュ札を `lrig_deck` へ1枚ずつ移動

UIはTargetScopeへ `self_lrig_trash` / `opp_lrig_trash` を追加し、既存の `optional || selected >= maxPick` 契約をそのまま利用した。parserは数値そのものをregexへ埋めず、文型captureと一意なaction木だけへ `pickUpTo` / `upToCount` / `$ref:'last_processed_count'` を載せた。

## 3. per-effect採用表

判定欄: ○＝意味上、逆翻訳全体が原文と一致。△＝今回の「まで」は一致したが、既存decompilerの「公開し」省略など条件外の表現差あり。×＝今回以外の既知欠落が残る。

| effectId | 原文の該当句 | 修正前JSON要点 | 修正後JSON要点 | 逆翻訳全体 |
|---|---|---|---|---|
| WX12-024-BURST | 青1枚まで／黒1枚まで | 2 stagesとも`pickCount:1`固定 | 両stage `pickUpTo:true` | △ 公開→見る／pick公開省略 |
| WX20-037-E1 | 赤シグニ2枚まで | stage固定2 | `pickUpTo:true` | ○ |
| WXEX2-84-E1 | アーツ2枚まで | `LRIG_TRASH_CARD count:1`固定 | `count:2,upToCount:true` | × 前段「全ルリグを下に置く」が既存欠落 |
| WXDi-D05-006-E1 | 白・青を各1枚まで | 各stage固定1 | 各stage `pickUpTo:true` | △ pick公開省略 |
| WXDi-P00-010-E1 | 赤・青・緑を各1枚まで | 各stage固定1 | 各stage `pickUpTo:true` | △ pick公開省略 |
| WXDi-P01-009-E1 | 白・赤を各1枚まで | 各stage固定1 | 各stage `pickUpTo:true` | △ pick公開省略 |
| WXDi-P01-035-E2 | スペル・白シグニを各1枚まで | 各stage固定1 | 各stage `pickUpTo:true` | △ pick公開省略 |
| WXDi-P02-017-E1 | 共通色2群を各1枚まで | 各stage固定1 | 各stage `pickUpTo:true` | △ pick公開省略 |
| WXDi-P11-030-E1 | シグニ2枚まで場に出す | stage固定2 | `pickUpTo:true` | ○ |
| WXDi-P15-031-E1 | 共通色／非共通色を各1枚まで | 各stage固定1 | 各stage `pickUpTo:true` | △ pick公開省略 |
| WXDi-P16-032-E1 | Lv1/2/3を各1枚まで | 各stage固定1 | 各stage `pickUpTo:true` | △ pick公開省略 |
| WXDi-CP01-005-E3 | シグニ1枚まで場に出す | stage固定1 | `pickUpTo:true` | ○ |
| WXDi-CP01-014-E1 | 白・黒を各1枚まで | 各stage固定1 | 各stage `pickUpTo:true` | △ pick公開省略 |
| WX24-P2-031-E1 | 天使・悪魔を各1枚まで | 各stage固定1 | 各stage `pickUpTo:true` | △ pick公開省略 |
| WX24-P2-035-E1 | 遊具を手札/場へ各1枚まで | 2 stages固定1 | 両stage `pickUpTo:true` | × 後段動的POWERが既存STUB |
| WX24-P3-033-E1 | Magic Box 1枚まで | magic_box stage固定1 | stage `pickUpTo:true` | △ 公開語・ルール注釈省略 |
| WX24-P4-022-E2 | シグニ3枚まで場に出す | stage固定3 | `pickUpTo:true` | ○ |
| WX25-P1-044-E1 | 怪異を手札/場へ各1枚まで | 2 stages固定1 | 両stage `pickUpTo:true` | △ pick公開省略 |
| WX25-P1-091-E1 | カード1枚までエナ／1枚までtrash | 2 stages固定1 | 両stage `pickUpTo:true` | ○ |
| WX25-P2-039-E1 | 武勇を手札/場へ各1枚まで | 2 stages固定1 | 両stage `pickUpTo:true` | △ pick公開省略 |
| WX25-P2-041-E1 | 遊具を手札/場へ各1枚まで | 2 stages固定1 | 両stage `pickUpTo:true` | △ pick公開省略 |
| WX25-P3-038-E1 | 迷宮を手札/場へ各1枚まで | 2 stages固定1 | 両stage `pickUpTo:true` | △ pick公開省略 |
| WX25-P3-045-E1 | 毒牙を手札/場へ各1枚まで | 2 stages固定1 | 両stage `pickUpTo:true` | △ pick公開省略 |
| WX25-CP1-012-E3 | シグニ2枚まで場に出す | stage固定2 | `pickUpTo:true` | ○ |
| WX25-CP1-043-E2 | ブルアカ2枚まで場に出す | stage固定2 | `pickUpTo:true` | ○ |
| WX26-CP1-012-E1 | プリオケをエナ/手札へ各1枚まで | 2 stages固定1 | 両stage `pickUpTo:true` | △ pick公開省略 |
| WX26-CP1-014-E1 | プリオケをエナ/手札へ各1枚まで | 2 stages固定1 | 両stage `pickUpTo:true` | △ pick公開省略 |
| WX26-CP1-016-E1 | プリオケをエナ/手札へ各1枚まで | 2 stages固定1 | 両stage `pickUpTo:true` | △ pick公開省略 |
| WX26-CP1-070-SONG | シグニ2枚まで場に出す | stage固定2 | `pickUpTo:true` | ○ |
| WXK01-057-E1 | シグニ3枚まで場に出す | stage固定3 | `pickUpTo:true` | ○ |
| WD06-007-E1 | ライフから4枚まで見る | `LOOK_AND_REORDER count:4`固定 | `upToCount:true` | × destinationのtopが既存`any` |
| WD10-007-E1 | Weapon 2枚まで捨て、同数banish | discard固定2／banish固定1 | discard`upToCount:true`／banish`last_processed_count` | ○ |
| PR-380-E1 | arts/resonaを各1枚まで | arts 1枚固定のみ | arts/resona各`upToCount:true`＋両方に支払色filter | ○ |

live差分は上記33 effectIdだけ。同カード内の別effectId追加・削除・巻き込みは0。

## 4. C群の再判定（変更不要・findingを偽陽性として閉じる）

| effectId | 原文 | 実装確認 |
|---|---|---|
| WX11-047-E1 | 5枚まで探してエナ | SEARCH `maxCount:5`、後段count1は各選択札へのpayload。複数選択を全て移動 |
| WXEX1-17-E2 | 2枚まで探してエナ | 同上。アクセfilterを満たす2枚の両方を移動 |
| WD07-006-E1 | 異なるLvを3枚まで探してtrash | SEARCH `maxCount:3`＋distinct level。後段は現在count3だが選択札単位処理 |
| WXK04-041-E1 | 選択肢2で3枚まで探してエナ | SEARCH `maxCount:3`、複数選択を全て移動 |

`execSearch` は `upToTarget !== false` を `optional` へ渡すため0枚可。`resumeSearch` はpicked IDをループして `applyDirectAction` を呼び、`ENERGY_CHARGE{DECK_CARD}` / `TRASH{DECK_CARD}` は明示された1枚を処理する。したがって後段`count:1`は全体上限ではなく1回分payloadであり、`$ref`置換は不要かつ誤り。4効果を複数枚選択E2Eで固定した。

## 5. golden

追加テスト名（成立/不成立の両方向を固定）:

- `段2 第34バッチ engine対照: REVEAL_AND_PICK は pickUpTo=true のときだけ0枚選択可`
- `段2 第34バッチ engine対照: LOOK_PICK_CHAIN は stage.pickUpTo=true のときだけ0枚選択可`
- `段2 第34バッチ engine対照: LOOK_AND_REORDER は upToCount=true のときだけ見る枚数を0..Nから先決め`
- `段2 第34バッチ engine対照: LRIG_TRASH_CARD は upToCount=true のときだけ0枚可、固定はN枚移動`
- `段2 第34バッチ parser契約: 対象9効果は上限フラグと動的枚数をfresh木へ出す`
- `段2 第34バッチ E2E: WD10-007-E1 は0枚捨てを許し、2枚捨てたときだけ相手2体を要求`
- `段2 第34バッチ C群契約: SEARCH後段countは選択1枚ごとのpayloadで、選んだ複数枚をすべて処理`

既存goldenの期待値は、今回意味を持つ `pickUpTo:true` の追加だけを6箇所更新（WX24-P3-033、WX24-P2-031、WX26-CP1-012/014/016、WXDi-P15-031）。その他の既存関数本体は変更していない。golden差分は追加154/削除6行で、削除6行はいずれも同じ期待JSON行を `pickUpTo:true` 付きへ置換したもの。

## 6. held / partial / idset

| 計器 | before | after | 増減・照合 |
|---|---:|---:|---|
| `_held_fresh.json` | 83 | 83 | 追加0 / 削除0 |
| `_partial_fresh.json` | 15 | 15 | 追加0 / 削除0 |
| `_idset_fresh.json` | 46 | 46 | 追加0 / 削除0 |

初回buildで同文型の純改善が自動採用され、構造差分の `WD10-007` / `WXEX2-84` / `PR-380` は原文とfresh全体を照合後、`heldReview --adopt` で採用した。最終buildで83/15/46へ戻り、集合内容もHEADと完全一致（added/removed各0）。

## 7. 条件外の不一致

- `WXEX2-84-E1`: 前段「ルリグトラッシュのすべてのルリグをこのカードの下に置く」がfresh/liveに無い。今回の任意上限外なので据置。
- `WD06-007-E1`: 「デッキの一番上」が `destination.position:'any'` のまま。今回の枚数任意性だけ採用し、位置は据置。
- `WX24-P2-035-E1`: 後段の「場に出たシグニのレベル1につき-5000」が既存STUB。
- 公開して手札に加えるLOOK_PICK_CHAIN群: 逆翻訳が「公開し」を省略して「手札に加え」と表示する。今回の0..N選択自体は正しく実働するが、公開表示差は据置。
- `WX24-P3-033-E1`: マジックボックスのルール注釈と＜トリック＞公開語は逆翻訳に出ない（設置engine自体は既存実装）。

## 8. ゲート before / after

| 計器 | before (7e77a2064) | after | 結果 |
|---|---:|---:|---|
| golden | 2588 PASS / 0 FAIL | **2595 PASS / 0 FAIL** | PASS |
| census | 630 / BASELINE 630 | **628 / BASELINE 628** | 2改善、定数更新 |
| smoke | 10693 / 全異常0 / SKIP0 | **10693 / 全異常0 / SKIP0** | PASS |
| fuzz | 全0 | **全0** | PASS |
| groupSimilar --all | 同型★0 | **同型★0** | PASS |
| census:stubs | A群0 / C群0 | **A群0 / C群0** | PASS |
| manual-fields | 0 | **0** | PASS |
| lint | 0 errors / 261 warnings | **0 errors / 261 warnings** | PASS |
| held / partial / idset | 83 / 15 / 46 | **83 / 15 / 46** | 内容増減0 |

`npm run regen` 実行済み。最終 `npm run gates` 全緑。

## 9. エンコーディング検査

このバッチで変更した全追跡ファイルを対象に、UTF-8としての読込、U+FFFD、3文字以上連続`?`、先頭BOMを検査する。結果は **UTF-8 decode error 0 / U+FFFD 0 / `???` 0 / 新規BOM 0**。報告書は実際に `wc -c` を実行して **12018 bytes** を確認し、先頭・末尾も再読した。
