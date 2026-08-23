# §6.2 段2 第32バッチ報告 — 合計レベルexact／SEARCH上限／§6.4 O-42クローズ

- 開始HEAD: `c18dc101d6971bf4d1b1b8b2842cc5d1907987cf`
- 開始状態: `git status --porcelain` 出力なし
- 終了確認時HEAD: `c4a02cd34ab726255bbbc5c7ab96c24240d94a33`（作業中に外部commitが進めたもの。後述）
- 作業日: 2026-08-23
- 本作業からのcommit / push: 実施していない

## 1. 触ったファイルと理由

- `src/types/effects.ts` — `SelectionConstraint.totalLevelExact/totalLevelMax` と、任意手札／エナコストの可変枚数・集合制約payloadを型へ追加。
- `src/engine/execUtils.ts` — exact/maxの集合判定、組み合わせ存在探索、任意コストの支払可否・pay stepを共通化。`energyTrash.upToCount` のruntime spec脱落も修正。
- `src/engine/effectExecutor.ts` — SEARCH／各ゾーン選択の候補提示、resume再検証、達成不能fail-closed、exact任意支払い後段ゲートを実装。
- `src/engine/execStubPart2.ts` — StubActionの可変手札枚数型拡張が別STUBの固定枚数予約へ漏れないようnumberに限定。
- `src/screens/BattleScreen.tsx` — CPUがexactを満たす組み合わせを探索して選ぶよう接続。
- `src/screens/battle/modals/EffectInteractionModal.tsx` — exact/maxを表示し、exact未達の完了／スキップをUIで許さない。
- `src/data/effectParser.ts` — 数値を決め打ちせず、SEARCH、場対象、トラッシュ移動、手札／エナ任意コストへ原文の合計値を配線。A3/A6/A7は対象identityとdid-itを正準形へ再構成。
- `scripts/decompileEffects.ts` — exact/maxをSEARCH・対象・任意コストの逆翻訳へ表示。
- `scripts/goldenTest.ts` — A1〜A7、B1、C1のlive engine E2EとO-42トリップワイヤ残0を固定。
- `scripts/vocabCensus.ts` — 実測 `642→640` に `BASELINE_HIGH` と説明を更新。
- `src/data/manualEffects.ts` — `WX10-018` の影武者manualを削除。
- `public/data/effects_WX.json` / `effects_WXDi.json` / `effects_WXK.json` / `effects_misc.json` — 指定8 effectIdをlive採用し、C1を `AUTO` 化。
- `docs/_held_fresh.json` / `_held_review.txt` / `_manual_drift.txt` / `_vocab_census.txt` / `_census_stubs.txt` — build・held review・各計器の最終出力。
- `docs/decompile_sheet1.txt`〜`sheet6.txt`、`sheet8.txt`、`sheet9.txt`、`docs/grouped_sentence_all.txt` — `npm run regen` の生成物。変更のないsheet7/10等はdiffなし。
- `docs/BUGFIXES.md` — 修正内容、O-42クローズ、最終ゲート値を先頭へ追記。
- 本ファイル — 指定の詳細報告。

`docs/PLAN.md` / `docs/PLAN_PROGRESS.md` / `package-lock.json` は変更していない。

## 2. 受け皿の判断と実消費関数

採用した受け皿は **`SelectionConstraint` 経路**。理由は、今回必要な `SearchAction.selectionConstraint`、`EffectTarget.selectionConstraint`（TRASH/TRANSFERのsourceを含む）、`OptionalCost.energyTrash/handDiscard.selectionConstraint` が既に同じ集合選択契約を共有していたためである。第31バッチの場対象専用 `EffectTarget.totalLevelMax` は既存5効果の互換性のため維持し、今回のexactとSEARCH上限をそこへ重ねなかった。

実消費は次の3段をすべて接続した。

1. 候補提示: `findValidConstrainedSelection` を `selectOrInteract` / `execSearch` が呼び、達成可能な組み合わせが無ければ待機を作らず0枚完了。CPUは `BattleScreen` のSELECT_TARGET/SEARCH自動応答が同関数で合法集合を選ぶ。
2. 完了可否: `canAddToSelection` がprefix合計をexact/max以下に保ち、`satisfiesSelectionConstraint` が最終合計のexact一致／max以下を判定。`EffectInteractionModal` はこれを完了ボタンに使い、exactでSkipを出さない。
3. resume再検証: `resumeSelectTarget` / `resumeSearch` がUI外応答を同じ2関数で再検証し、N−1/N＋1を部分採用せず0枚へ倒す。

効果別の消費関数は、A1/B1が `execSearch`→`resumeSearch`、A2が `execBanish`→`selectOrInteract`→`resumeSelectTarget`、A3が `execTransferToDeck`→同SELECT_TARGET resume、A4/A5が `execTransferToHand`→同resume、A6/A7が `resolveOptionalCostSpec`→`canAffordOptionalCostSpec`→`optionalCostPaySteps`→`execTrash`→同resumeである。

## 3. 調査結果と達成不能時の倒し方

### A群

- A1 `WXEX1-36-E2`: 成立。SEARCHは `selectionConstraint` を既にpendingへ運べる形だったためexact 8を配線。
- A2 `WXEX1-45-BURST`: 成立。`BANISH.count` を1→2、`upToCount:true`、exact 4へ修正。
- A3 `WXK10-066-E2`: 成立。ただし旧actionは相手の `powerRange.max:8000` をトラッシュの＜古代兵器＞候補へ誤付着し、対象identityも保持していなかった。対象選択→保存→exact 5の2枚をデッキ下→実際に2枚置けた場合だけ保存対象をバニッシュ、へ再構成。
- A4/A5 `WDK13-008-E1`: 成立。選択肢順にexact 7/12を各 `TRANSFER_TO_HAND.source` へ配線。A5のキー条件は既に `HAS_CARD_IN_FIELD{owner:'opponent',filter:{cardType:'キー'}}` で、evaluatorが `key_piece` / `key_piece_extra` を走査する正しい実装だったため維持。
- A6 `PR-K043-E1`: 成立。`TARGET_AND_DISCARD_HAND` は実装済みだが「相手シグニを選び、手札を固定1枚捨てる」機能でexact可変コストではなかった。対象固定＋`OPTIONAL_COST.handDiscard{count:'ALL',upToCount:true,totalLevelExact:7}`＋`PAID_ADDITIONAL_COST`へ置換。
- A7 `WXDi-P08-045-E2`: 成立。`TRADE_BANISH_SELF_SIGNI` は実装済みだが「自分の場のシグニをトラッシュして相手をバニッシュ」という別コストだった。エナexact 8の任意コストへ置換。

達成不能時は、必須形A2/A3/A4/A5を既存の0候補契約と同じ **0枚処理・待機なし**へ倒す。これによりA3は `LAST_PROCESSED_COUNT_GTE:2` が不成立で後段も走らない。A1は能力自体が任意コスト付き出能力で、サーチexact集合が無ければ0枚のままシャッフルだけ完了する。任意コストA6/A7は `canAffordOptionalCostSpec` がpayをdisabledにし、外部から不正pay/resumeが来ても選択を0枚化し、`guardExactOptionalSelectionPayment` が後段を止める。根拠は「してもよい」の0枚＝実行しない契約と、第31バッチの候補0枚fail-closedである。

### B1

`WXEX1-45-E3` はA1と同じSEARCH経路で成立。`totalLevelMax:5` を配線し、合計5は許可、6は拒否、候補0枚も完了する。

### C1 / O-42

`execStubPart3.ts` の `NEGATE_NTH_ATTACK` は `stub.negateNthAttack ?? {count:nNNA,signi:true,lrig:false}` を使い、`nNNA` は原文の「一度目か二度目」等から算出する。開始liveはpayload無しなので実際に `lrig:false` へ落ちる見立てどおりだった。manual payloadを `syncManualLive.ts` でliveへ届け、manual削除後に同ツールを再実行してparser由来 `AUTO` へ遷移させた。

## 4. 採用した効果の全件

### A1 `WXEX1-36-E2`

- 原文節: 「あなたのデッキからレベルの合計が８になるように＜宇宙＞のシグニを３枚まで探して公開し手札に加え、デッキをシャッフルする。」
- 生成action JSON: `{"type":"SEARCH","from":{"location":"deck","owner":"self"},"filter":{"cardType":"シグニ","story":"宇宙"},"maxCount":3,"then":{"type":"SEQUENCE","steps":[{"type":"REVEAL"},{"type":"ADD_TO_HAND","owner":"self"}]},"afterSearch":{"type":"SHUFFLE_DECK","owner":"self"},"selectionConstraint":{"totalLevelExact":8}}`
- 逆翻訳全文: `【自】このシグニが場に出たとき：〈《赤×1》《無×1》〉あなたのデッキから3枚までレベルの合計が8になるように＜宇宙＞のシグニを探して公開し手札に加える（その後シャッフル）`
- 判定: 一致。

### A2 `WXEX1-45-BURST`

- 原文節: 「対戦相手のシグニを、レベルの合計が４になるように２体まで対象とし、それらをバニッシュする。」
- 生成action JSON: `{"type":"BANISH","target":{"type":"SIGNI","owner":"opponent","count":2,"filter":{"cardType":"シグニ"},"upToCount":true,"selectionConstraint":{"totalLevelExact":4}}}`
- 逆翻訳全文: `【LB】【ライフバースト】：対戦相手のレベルの合計が4になるようにシグニ2体までをバニッシュする`
- 判定: 一致。

### A3 `WXK10-066-E2`

- 原文節: 「対戦相手のパワー8000以下のシグニ１体を対象とし、あなたのトラッシュからレベルの合計が５になるように＜古代兵器＞のシグニ２枚を好きな順番でデッキの一番下に置く。そうした場合、それをバニッシュする。」
- 生成action JSON: `{"type":"SEQUENCE","steps":[{"type":"STUB","id":"SELECT_TARGET_ONLY","selectTarget":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ","powerRange":{"max":8000}},"upToCount":false}},{"type":"STUB","id":"STORE_LAST_PROCESSED_TARGETS"},{"type":"TRANSFER_TO_DECK","source":{"type":"TRASH_CARD","owner":"self","count":2,"filter":{"cardType":"シグニ","story":"古代兵器"},"selectionConstraint":{"totalLevelExact":5}},"shuffle":false,"position":"bottom"},{"type":"CONDITIONAL","condition":{"type":"LAST_PROCESSED_COUNT_GTE","value":2,"verbJa":"デッキの下に置いた"},"then":{"type":"BANISH","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ"},"upToCount":false},"targetsStored":true}}]}`
- 逆翻訳全文: `【起】（メイン起動）：《once_per_turn》〈手札から＜古代兵器＞のシグニ1枚を捨てる〉対戦相手のパワー8000以下のシグニ1体を対象とする。そしてあなたのレベルの合計が5になるように＜古代兵器＞のシグニ(トラッシュ)2枚をデッキの一番下に置く。そしてこの方法でカードを2枚以上デッキの下に置いたなら、それをバニッシュする`
- 判定: 一致。「好きな順番」は選択順をデッキ下へ置く既存TRANSFER契約で保持。

### A4/A5 `WDK13-008-E1`

- 原文節①: 「トラッシュから＜宇宙＞のシグニを、レベルの合計が７になるように３枚まで…手札に加える。」
- 原文節②: 「…レベルの合計が１２になるように５枚まで…対戦相手の場にキーがある場合、それらを手札に加える。」
- 生成action JSON: `{"type":"CHOOSE","choose_count":1,"from_count":2,"choices":[{"choiceId":"c0","label":"選択肢1","action":{"type":"TRANSFER_TO_HAND","source":{"type":"TRASH_CARD","owner":"self","count":3,"upToCount":true,"filter":{"cardType":"シグニ","story":"宇宙"},"selectionConstraint":{"totalLevelExact":7}}}},{"choiceId":"c1","label":"選択肢2","action":{"type":"CONDITIONAL","condition":{"type":"HAS_CARD_IN_FIELD","owner":"opponent","filter":{"cardType":"キー"}},"then":{"type":"TRANSFER_TO_HAND","source":{"type":"TRASH_CARD","owner":"self","count":5,"upToCount":true,"filter":{"cardType":"シグニ","story":"宇宙"},"selectionConstraint":{"totalLevelExact":12}}}}}]}`
- 逆翻訳全文: `【起】（メイン起動）：〈《黒×1》〉以下の2つから1つを選ぶ【あなたのレベルの合計が7になるように＜宇宙＞のシグニ(トラッシュ)3枚までを手札に加える / 対戦相手の場にキーがあるなら、あなたのレベルの合計が12になるように＜宇宙＞のシグニ(トラッシュ)5枚までを手札に加える】`
- 判定: 両選択肢とも一致。

### A6 `PR-K043-E1`

- 原文節: 「対戦相手のレベル３以下のシグニ１体を対象とし、手札からレベルの合計が７になるようにシグニを好きな枚数捨ててもよい。そうした場合、それをデッキの一番下に置く。」
- 生成action JSON: `{"type":"SEQUENCE","steps":[{"type":"STUB","id":"SELECT_TARGET_ONLY","selectTarget":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ","level":{"max":3}},"upToCount":false}},{"type":"STUB","id":"STORE_LAST_PROCESSED_TARGETS"},{"type":"STUB","id":"OPTIONAL_COST","handDiscard":{"count":"ALL","upToCount":true,"filter":{"cardType":"シグニ"},"selectionConstraint":{"totalLevelExact":7}}},{"type":"CONDITIONAL","condition":{"type":"PAID_ADDITIONAL_COST"},"then":{"type":"TRANSFER_TO_DECK","source":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ","level":{"max":3}}},"shuffle":false,"position":"bottom","targetsStored":true}}]}`
- 逆翻訳全文: `【自】このシグニがアタックしたとき：対戦相手のレベル3以下のシグニ1体を対象とする。そして手札からレベルの合計が7になるようにシグニを好きな枚数捨ててもよい。そして（コストを支払った場合）なら、対戦相手のレベル3以下のシグニ1体をデッキの一番下に置く`
- 判定: 一致。

### A7 `WXDi-P08-045-E2`

- 原文節: 「対戦相手のシグニ１体を対象とし、あなたのエナゾーンからレベルの合計が８になるようにシグニを好きな枚数トラッシュに置いてもよい。そうした場合、それをバニッシュする。」
- 生成action JSON: `{"type":"SEQUENCE","steps":[{"type":"STUB","id":"SELECT_TARGET_ONLY","selectTarget":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ"},"upToCount":false}},{"type":"STUB","id":"STORE_LAST_PROCESSED_TARGETS"},{"type":"STUB","id":"OPTIONAL_COST","energyTrash":{"count":"ALL","upToCount":true,"filter":{"cardType":"シグニ"},"selectionConstraint":{"totalLevelExact":8}}},{"type":"CONDITIONAL","condition":{"type":"PAID_ADDITIONAL_COST"},"then":{"type":"BANISH","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ"},"upToCount":false},"targetsStored":true}}]}`
- 逆翻訳全文: `【自】このシグニがアタックしたとき：対戦相手のシグニ1体を対象とする。そしてあなたのエナゾーンからレベルの合計が8になるようにシグニを好きな枚数トラッシュに置いてもよい。そして（コストを支払った場合）なら、それをバニッシュする`
- 判定: 一致。

### B1 `WXEX1-45-E3`

- 原文節: 「デッキからレベルの合計が５以下になるように＜英知＞のシグニを２枚まで探して公開し手札に加え…」
- 生成action JSON: `{"type":"SEARCH","from":{"location":"deck","owner":"self"},"filter":{"cardType":"シグニ","story":"英知"},"maxCount":2,"then":{"type":"SEQUENCE","steps":[{"type":"REVEAL"},{"type":"ADD_TO_HAND","owner":"self"}]},"afterSearch":{"type":"SHUFFLE_DECK","owner":"self"},"selectionConstraint":{"totalLevelMax":5}}`
- 逆翻訳全文: `【自】このシグニが場に出たとき：〈《緑×1》〉あなたのデッキから2枚までレベルの合計が5以下になるように＜英知＞のシグニを探して公開し手札に加える（その後シャッフル）`
- 判定: 一致。

### C1 `WX10-018-E1`

- 原文節: 「対戦相手のシグニかセンタールリグがアタックしたとき、そのアタックがこのターン一度目か二度目の場合、そのアタックを無効にする。」
- 生成action JSON: `{"type":"STUB","id":"NEGATE_NTH_ATTACK","negateNthAttack":{"count":2,"signi":true,"lrig":true}}`
- 逆翻訳全文: `【起】（アタックフェイズ起動）：〈《緑×2》〉このターン、対戦相手のシグニかセンタールリグがアタックしたとき、そのアタックがこのターン一度目か二度目の場合、そのアタックを無効にする`
- 判定: 一致。

## 5. 見送った効果

**0件。** 指定A1〜A7、B1、C1はすべて、exactを上限近似せず実消費経路と両方向E2Eを揃えて採用できた。したがって非採用契約の追加対象も0件。

## 6. 条件以外で見つけた原文との食い違い

3件（すべて指定効果内で修正）。

1. `WXK10-066-E2`: 相手対象の `powerRange.max:8000` がトラッシュ候補へ誤付着。
2. `PR-K043-E1`: 旧STUBは手札を固定1枚しか捨てず、対象固定後のdid-itも表していなかった。
3. `WXDi-P08-045-E2`: 旧STUBはエナではなく自分の場のシグニを対価にしていた。

それ以外は0件。A5のキー条件は既存実装が原文どおりだった。

## 7. ゲート実測値

| 指標 | 最終実測 | 開始比 |
|---|---:|---:|
| `npm run golden` | **2563 PASS / 0 FAIL** | 2555→2563 |
| `npm run census` | **640 / BASELINE_HIGH 640** | 642→640 |
| `npm run smoke` | **10693 / OK 10693 / CRASH 0 / HANG 0 / INVARIANT 0 / SKIP 0** | 効果総数据置 |
| `npm run fuzz` | **CRASH/HANG/INVARIANT/EXPLOSION 全0、SKIP 0** | 据置 |
| `npm run lint` | **0 errors / 261 warnings** | warnings増減0 |
| `node scripts/groupSimilar.mjs --all` | **同型★0** | 据置 |
| `npm run census:stubs` | **無言no-op A群0 / C群0** | 据置 |
| `npm run check:manual-fields` | **0 effects / parseStatus違反0** | 据置 |
| `docs/_held_fresh.json` | **86カード** | 87→86 |
| `docs/_partial_fresh.json` | **15カード** | 据置 |
| `docs/_idset_fresh.json` | **46カード** | 据置 |
| `censusManualDrift` 削除候補 | **0効果** | 1→0 |
| `manualEffects` | **411カード** | 412→411 |
| live効果総数 | **10693** | 据置 |
| Condition / ActiveCondition | **122 / 52** | 据置 |

`npm run regen` も全10シート＋下流3生成まで完了。heldの−1は `WXK10-066` が今回のparser改善採用でfresh/live一致となり、既存heldから解消したもの。partial/idsetはキー集合・内容とも増減0。初回 `npm run gates` は比較worktreeのWindows junction除去で共有 `node_modules` が消え `tsc` 不在で開始前停止したが、`npm install` で依存だけ復元し、trackedな `package-lock.json` の副作用5行は開始内容へ戻した。以後の全ゲートは上表どおり緑。

## 8. 全カード生パースdiff（per-effect）とoutlier

開始HEADのdetached worktreeと現parserで、同じSheet1〜10＋CardData_TK、全6712カードをシート順・先頭BOM除去で個別parseし、effectId単位でJSON比較した。

- before/after effectId: **10660 / 10660**
- changed **7** / added **0** / removed **0**
- 変化集合: `WXEX1-36-E2`, `WXEX1-45-E3`, `WXEX1-45-BURST`, `WXK10-066-E2`, `WDK13-008-E1`, `PR-K043-E1`, `WXDi-P08-045-E2`
- 指定外outlier: **0件**
- `WX10-018-E1` は開始時点のparserが既にpayloadを生成していたので生パース不変。

curated liveの開始HEAD比は changed **8** / added 0 / removed 0。上記7＋`WX10-018-E1`で、説明不能outlier 0。

## 9. held / partial / idset とlint（報告直前実測）

- held: **87→86**。added 0、removed `WXK10-066` 1カード。これはA3のfreshをlive採用して一致した解消。
- partial: **15→15**。added/removed 0。
- idset: **46→46**。added/removed 0。
- lint: **261→261 warnings**、errors 0。

## 10. `parseStatus` 遷移

- `WX10-018-E1`: **MANUAL→AUTO**。

他7 effectIdはすべてAUTO→AUTO。追加／削除effectIdは0。

## 11. `O-42` 最終状態

- `censusManualDrift` 削除候補: **0効果**。
- `O42_KNOWN_REDUNDANT_MANUAL`: **0件**。トリップワイヤ本体は残し、コメントを「O-42は残0でクローズ」へ更新。
- `manualEffects`: **411カード**。
- C1 live: payloadあり、`parseStatus:AUTO`。
- golden: センタールリグの一度目、シグニの二度目は無効化し、三度目のセンタールリグ攻撃は無効化しない両方向を実行固定。

## 12. 指示書との不一致・実コードによる訂正

1. A群は原文節として7件だが、A4/A5が同一 `WDK13-008-E1` の2選択肢なので、exactのlive effectIdは6件。B1とC1を加えた最終live変更は8 effectId。
2. A5は `HAS_KEY_IN_FIELD` ではなく既存 `HAS_CARD_IN_FIELD{cardType:'キー'}` だったが、実評価はキーゾーンを含み意味は一致。型追加は不要。
3. `SelectionConstraint` が本命という見立ては正しかった。一方、`energyTrash.upToCount` はJSON型にあっても `resolveOptionalCostSpec` が落としており、読む経路が未完だったため追加修正が必要だった。
4. C1の定型手順は、payload同期→manual削除→buildだけではliveの既存MANUAL保護が残った。そのためmanual削除後に `syncManualLive.ts WX10-018` をもう一度実行し、parser由来AUTOを安全に同期した。
5. 最終heldは指示の期待87ではなく86。差分集合をHEADと比較し、`WXK10-066` 1カードの正当な解消だけと確認済み。
6. 開始時は指定どおり `c18dc101d` かつcleanだったが、作業中にこちらがcommitを実行していない状態でHEADが `c4a02cd34` へ進んだ。reflogと `c18dc101d..c4a02cd34` を確認すると、外部commitは `docs/CODEX_GUIDE.md` と `stage2_closed.txt` だけを変更する台帳是正で、今回の作業差分を含まない。外部変更は巻き戻さず保持した。

## 13. エンコーディング検査

tracked差分と未追跡の本報告書を合わせた全31ファイルを開始HEAD版と比較し、U+FFFD、ASCII `?` 3文字以上連続、先頭BOMを数えた。集計は順に **0→0 / 28→28 / 0→0**、増加ファイル **0件**で、**新規増はいずれも0**。28件は `docs/BUGFIXES.md` に開始時から存在する既存文字列である。Sheet8のCSV読み込みは先頭BOMを明示除去した。

## 結論

exactをmaxで近似せず、指定8 effectIdをすべてlive採用した。候補提示・完了判定・resume再検証・達成不能fail-closed・CPU/UIまで同じ制約を消費し、A6/A7の旧STUB別挙動も除去した。`O-42` は削除候補0、許容リスト0、manualEffects 411カードでクローズ。本作業からcommit / pushはしていない。
