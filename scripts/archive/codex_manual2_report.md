# PLAN §5.3「1〜3枚」manual 第2バッチ 完了報告

- 実施日: 2026-08-29
- 投入時 HEAD: `dd2d0c571`
- 採用: 5効果 / 3群
- 方針: `manualEffects.ts` の完全 override のみ。parser / engine / screens は非改変
- commit / push: 未実施

## 1. 触ったファイルと理由

### 手編集

- `src/data/manualEffects.ts`: 指定5効果を、CSV原文と既存受け皿に基づく完全 override として追加。
- `scripts/goldenTest.ts`: 5効果を `manualFreshEffect` で読む fresh assert と、正方向・旧誤形の否定・E2Eを各1本追加。
- `scripts/vocabCensus.ts`: MANUAL免除により高シグナルが `517→514` へ不可視化されたため baseline を実測値へ下げ、旧値を直後のコメントに保存。
- `docs/BUGFIXES.md`: 本バッチの修正内容、非修正範囲、最終ゲート値を冒頭へ追記。
- `tmp_codex_manual2_report.md`: 本報告書。

### 同期・再生成による変更

- `public/data/effects_WX.json`: `WX17-001-E2` / `WX19-023-E2` / `WX15-060-E1` を live 同期。
- `public/data/effects_misc.json`: `WD15-001-E2` / `SP26-008-E1` を live 同期。
- `docs/decompile_sheet2.txt` / `decompile_sheet4.txt` / `decompile_sheet5.txt`: 対象効果の逆翻訳を再生成。
- `docs/grouped_sentence_all.txt`: `npm run regen` の下流出力。
- `docs/_vocab_census.txt` / `_census_stubs.txt` / `_census_orphan_manual.txt` / `_manual_drift.txt`: 最終ゲート・build の計器出力。
- `docs/_held_fresh.json` / `_held_review.txt`: `heldReview.mjs` の最終出力。held から `WD15-001` だけが解消。

`docs/_partial_fresh.json` と `docs/_idset_fresh.json` は再生成したが内容差分なし。`docs/PLAN.md`、`docs/PLAN_PROGRESS.md`、`stage2_closed.txt` は未変更。`src/data/effectParser.ts`、`src/data/parsers/*`、`src/engine/*`、`src/screens/*` も未変更。

## 2. 着手前の再実測

CSVは `CardData_Sheet1..10.csv` と `CardData_TK.csv` を UTF-8 で読み、先頭の `U+FEFF` を除去して `parseCardEffects` → `mergeManualEffects` の順で fresh/live を再構成した。

1. `WX08-036-E1` は既に正しい: live の中間処理は `TRANSFER_TO_DECK{source:{type:'TRASH_CARD',owner:'self',count:5,filter:{cardType:'シグニ',story:['鉱石','宝石']}},shuffle:false,position:'bottom'}`。クラス配列は OR であり、原文の「＜鉱石＞か＜宝石＞」どおり。今回の構造差分でも `WX08-036-E1/E2` は before/after 完全一致だった。
2. `O-75` の誤対象は3効果だけ: CSV原文に `(この|その|あなたのセンター)ルリグは【…】を得る` を含む対象を live と照合したところ、`GRANT_KEYWORD.target.type !== 'LRIG'` は `WX17-001-E2` / `WD15-001-E2` / `WX19-023-E2` の3件だけだった。`WX01-030` / `WD15-010` / `WD21-009` / `WDK05-T01` の4件は既に `{type:'LRIG',owner:'self',count:1}` で正しい。
3. 「そのアタックの間」の慣例: CSV母集団で同句を12効果確認し、live の能力付与例 `SP38-008-E3` / `WX26-CP1-068-SONG` / `WXDi-P09-006-E2` / `WXDi-P13-007-E3` は全て `UNTIL_END_OF_TURN`。`WX19-023-E2` の `PERMANENT` はこの慣例に反するため、既存値 `UNTIL_END_OF_TURN` に縮小した。新しい duration は作っていない。

着手前の `npx tsx scripts/censusManualDrift.ts` は「削除候補 0件」。parser 出力と同一な影武者コピーは追加していない。

## 3. 採用した5効果（per-effect）

### A1 `WX17-001-E2` 選択肢③

- 原文該当節: `③ターン終了時まで、このルリグは【ダブルクラッシュ】を得る。`
- 発火・適用経路: 既存の `ON_ATTACK_LRIG` 収集（`BattleScreen.tsx:10701-10715`）→ `executeAction` → `execChoose` (`effectExecutor.ts:5433`) → `execGrantKeyword` (`:3989`)。
- 生成 JSON:

```json
{"effectId":"WX17-001-E2","effectType":"AUTO","timing":["ON_ATTACK_LRIG"],"action":{"type":"CHOOSE","choose_count":1,"from_count":4,"choices":[{"choiceId":"c0","label":"選択肢1","action":{"type":"DRAW","owner":"self","count":1}},{"choiceId":"c1","label":"選択肢2","action":{"type":"ENERGY_CHARGE_FROM_DECK","owner":"self","count":1}},{"choiceId":"c2","label":"選択肢3","action":{"type":"GRANT_KEYWORD","target":{"type":"LRIG","owner":"self","count":1},"keyword":"ダブルクラッシュ","duration":"UNTIL_END_OF_TURN"}},{"choiceId":"c3","label":"選択肢4","action":{"type":"TRASH","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ"},"upToCount":false}}}]},"duration":"UNTIL_END_OF_TURN","mandatory":true,"parseStatus":"MANUAL"}
```

- 逆翻訳全文: `【自】このルリグがアタックしたとき：以下の4つから1つを選ぶ【あなたのカードを1枚引く / あなたのデッキの上から1枚をエナゾーンに置く / あなたのルリグ1体に【ダブルクラッシュ】を与える（ターン終了時まで） / 対戦相手のシグニ1体をトラッシュに置く】`
- 原文一致: **Yes**。選択肢③の対象と期限が一致し、①②④も before/after 同一。`WX17-001-E1/E3` も live 構造比較で同一。
- 外した慣例候補: SIGNI向け `GRANT_KEYWORD` は原文主語と既存4例に反するため不採用。LRIG/self の既存形を採用。

### A2 `WD15-001-E2` 第3ステップ

- 原文該当節: `２枚以上ある場合、ターン終了時まで、このルリグは【ダブルクラッシュ】を得る。`
- 発火・適用経路: 既存 `ON_PLAY` 経路 → `executeAction` → `execSequence` (`effectExecutor.ts:4349`) → `execGrantKeyword` (`:3989`)。
- 生成 JSON:

```json
{"effectId":"WD15-001-E2","effectType":"AUTO","timing":["ON_PLAY"],"action":{"type":"SEQUENCE","steps":[{"type":"TRASH","target":{"type":"DECK_CARD","owner":"self","count":2}},{"type":"BANISH","target":{"type":"SIGNI","owner":"self","count":1,"filter":{"cardType":"シグニ","story":"龍獣"},"upToCount":false}},{"type":"GRANT_KEYWORD","target":{"type":"LRIG","owner":"self","count":1},"keyword":"ダブルクラッシュ","duration":"UNTIL_END_OF_TURN"}]},"duration":"UNTIL_END_OF_TURN","mandatory":true,"parseStatus":"MANUAL"}
```

- 逆翻訳全文: `【自】このシグニが場に出たとき：あなたのデッキの上からカードを2枚トラッシュに置く。そしてあなたの＜龍獣＞のシグニ1体をバニッシュする。そしてあなたのルリグ1体に【ダブルクラッシュ】を与える（ターン終了時まで）`
- 原文一致: **No（効果全文）**。今回の第3ステップの「このルリグ」と期限は一致したが、既存第1・第2ステップには別軸の原文不一致が残る。ユーザー指定どおりそこは据え置いた。構造比較と golden で `TRASH{DECK_CARD,count:2}` および `BANISH{owner:'self',story:'龍獣'}` が before/after 同一であることを固定。
- 外した慣例候補: 原文の「1枚以上/2枚以上」を今回新造の条件で補う案は、別軸かつ parser/engine判断を広げるため不採用。対象型だけ既存 LRIG/self 形へ修正。

### A3 `WX19-023-E2`

- 原文該当節: `あなたのセンタールリグがアタックしたとき、そのアタックの間、そのルリグは【ダブルクラッシュ】を得る。`
- 発火・適用経路: 味方カードの `ON_ATTACK_LRIG` は `collectAllyLrigAttackTriggers` (`triggerCollect.ts:750-775`) → `executeAction` → `execGrantKeyword` (`effectExecutor.ts:3989`)。
- 生成 JSON:

```json
{"effectId":"WX19-023-E2","effectType":"AUTO","timing":["ON_ATTACK_LRIG"],"action":{"type":"GRANT_KEYWORD","target":{"type":"LRIG","owner":"self","count":1},"keyword":"ダブルクラッシュ","duration":"UNTIL_END_OF_TURN"},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL","triggerScope":"any_ally","usageLimit":"once_per_turn"}
```

- 逆翻訳全文: `【自】あなたのルリグがアタックしたとき：〔範囲:any_ally〕《once_per_turn》あなたのルリグ1体に【ダブルクラッシュ】を与える（ターン終了時まで）`
- 原文一致: **Yes（既存表現上の近似を明記）**。対象は実戦上のセンタールリグ、回数制限は保持。「そのアタックの間」は指定・既存慣例どおり `UNTIL_END_OF_TURN` で近似し、少なくとも旧 `PERMANENT` の永続過剰を除去。
- 外した慣例候補: `PERMANENT` は原文より広く既存4例とも不一致なので不採用。新しい duration 値も作らず、既存慣例を採用。

### B `WX15-060-E1`

- 原文該当節: `対象のあなたのシグニ１体よりパワーの低い対象の対戦相手のシグニ１体をバニッシュする。そうした場合、あなたのデッキの一番上のカードをエナゾーンに置く。`
- 発火・適用経路: `executeAction` → `execSequence` (`effectExecutor.ts:4349`) → `execStub` の `SELECT_TARGET_ONLY` (`execStubPart1.ts:158-198`) → `resumeSelectTarget` (`effectExecutor.ts:9073-9277`) → `execBanish` (`:1163`)。`resolveDynamicFilter` (`:2515`, `:2731-2740`) が比較元の実効パワー `N` を `powerRange.max=N-1` に解決。
- 生成 JSON:

```json
{"effectId":"WX15-060-E1","effectType":"ACTIVATED","timing":["MAIN"],"cost":{"energy":[{"color":"緑","count":3}],"costScaling":[{"direction":"reduce","counts":[{"kind":"zone","zone":"field","owner":"self","filter":{"cardType":"シグニ","cardClass":"調理","hasAcce":true}}],"per":1,"amount":[{"color":"緑","count":1}]}]},"action":{"type":"SEQUENCE","steps":[{"type":"STUB","id":"SELECT_TARGET_ONLY","selectTarget":{"type":"SIGNI","owner":"self","count":1,"filter":{"cardType":"シグニ"}},"abortIfNoCandidate":true},{"type":"BANISH","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ","powerLtLastProcessed":true},"upToCount":false}},{"type":"CONDITIONAL","condition":{"type":"IS_MY_TURN"},"then":{"type":"ENERGY_CHARGE_FROM_DECK","owner":"self","count":1}}]},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"}
```

- 逆翻訳全文: `【起】（メイン起動）：〈《緑×3》＋このカードの使用コストはあなたの場にあるアクセされている＜調理＞のシグニ1体につき《緑×1》減る〉あなたのシグニ1体を対象とする。そして対戦相手の（その後）そのシグニよりパワーの低いシグニ1体をバニッシュする。そうした場合、あなたのデッキの上から1枚をエナゾーンに置く`
- 原文一致: **Yes**。比較元の対象宣言、厳密な「より低い」、相手対象、成功時エナチャージ、costScalingを全て保持。
- `abortIfNoCandidate`: **付与した**。比較元の自分シグニは必須対象なので0体なら効果本体が成立しない。sequence の `effectExecutor.ts:5374-5382` が後続を止め、さらに参照不能時の `powerLtLastProcessed` も `{min:1,max:0}` へ fail-closed する二重防御。
- 外した慣例候補: 末尾の `CONDITIONAL{IS_MY_TURN}` は字面のターン条件ではなく既存 did-it ゲートなので保持。これを別条件へ置換する案は不採用。

### C `SP26-008-E1`

- 原文該当節: `あなたのライフクロスが２枚以下の場合、追加でターン終了時まで、それは【ダブルクラッシュ】を得る。あなたのライフクロスが０枚の場合、追加でターン終了時まで、それは「【自】《ターン１回》：このシグニがアタックしたとき、このシグニをアップする。」を得る。`
- 発火・適用経路: 最初の `GRANT_KEYWORD` は `execGrantKeyword` (`effectExecutor.ts:3989`) で選択し、`resumeSelectTarget` (`:9073-9277`) が選択結果を `lastProcessedCards` に残す。追加キーワードは `execGrantKeyword` の `targetsLastProcessed` 枝 (`:3993-4009`)、引用能力は `execGrantEffect` の同枝 (`:4138-4158`) が同一個体へ格納。`BattleScreen.tsx:865-884` が `granted_effects` を効果マップへ合成し、アタック時に `collectAttackerSelfTriggers` (`triggerCollect.ts:4112-4132`; 呼出 `BattleScreen.tsx:8921-8926`) が `ON_ATTACK_SIGNI` を収集。
- 生成 JSON:

```json
{"effectId":"SP26-008-E1","effectType":"ACTIVATED","timing":["MAIN"],"cost":{"energy":[{"color":"赤","count":6}],"costScaling":[{"direction":"reduce","counts":[{"kind":"lrigLevel","owner":"self"}],"per":1,"amount":[{"color":"赤","count":1}]}]},"action":{"type":"SEQUENCE","steps":[{"type":"GRANT_KEYWORD","target":{"type":"SIGNI","owner":"self","count":1,"filter":{"cardType":"シグニ","color":"赤"}},"keyword":"アサシン","duration":"UNTIL_END_OF_TURN"},{"type":"CONDITIONAL","condition":{"type":"LIFE_COUNT","owner":"self","operator":"lte","value":2},"then":{"type":"GRANT_KEYWORD","targetsLastProcessed":true,"target":{"type":"SIGNI","owner":"self","count":1},"keyword":"ダブルクラッシュ","duration":"UNTIL_END_OF_TURN"}},{"type":"CONDITIONAL","condition":{"type":"LIFE_COUNT","owner":"self","operator":"eq","value":0},"then":{"type":"GRANT_EFFECT","targetsLastProcessed":true,"target":{"type":"SIGNI","owner":"self","count":1},"duration":"UNTIL_END_OF_TURN","effect":{"effectId":"SP26-008-sub-E1","effectType":"AUTO","timing":["ON_ATTACK_SIGNI"],"action":{"type":"UP","target":{"type":"SIGNI","owner":"self","count":1,"filter":{"thisCardOnly":true}}},"duration":"INSTANT","mandatory":true,"parseStatus":"AUTO","triggerScope":"self","triggerFilter":{"thisCardOnly":true},"usageLimit":"once_per_turn"}}}]},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"}
```

- 逆翻訳全文: `【起】（メイン起動）：〈《赤×6》＋このカードの使用コストはあなたのセンタールリグのレベル1につき《赤×1》減る〉あなたの《赤》のシグニ1体に【アサシン】を与える（ターン終了時まで）。そしてあなたのライフが2以下なら、それは【ダブルクラッシュ】を得る（ターン終了時まで）。そしてあなたのライフが0であるなら、それは『【自】このシグニがアタックしたとき：《once_per_turn》このシグニをアップする』を得る（ターン終了時まで）`
- 原文一致: **Yes**。最初に選んだ同一シグニへの3能力、2本のライフ条件、引用AUTOの timing / self scope / once-per-turn / UP、costScalingが一致。
- 外した慣例候補: `STORE_LAST_PROCESSED_TARGETS` + `targetsStored` は不要。間に入る2本の `targetsLastProcessed` 付与は選択UIを出さず `lastProcessedCards` を上書きしないため、直前選択をそのまま参照する既存実例を採用。

## 4. 見送った／触っていないもの

- `WX08-036-E1` (`O-104`③): **触っていない**。live は `story:['鉱石','宝石']` の OR、対象宣言の相手パワー10000以下、5枚を戻した後の did-it ゲートを既に保持。before/after 完全一致。
- `WX17-001-E1/E3`: **触っていない**。A1の CHOOSE も選択肢③以外は構造不変。
- `WD15-001-E1` と `WD15-001-E2` の第1・第2ステップ: **触っていない**。特に `story:'龍獣'` の既存フィルタを構造 diff と golden で保持。
- `WX19-023-E1/E3/BURST`: **触っていない**。
- `WX15-060-E1` の `cost.costScaling` と末尾 did-it ゲート: **触っていない**。
- `SP26-008-E1` の第1ステップ、`LIFE_COUNT` 2本、`cost.costScaling`: **触っていない**。

live JSON を HEAD と effectId 単位で構造比較した結果、変更は指定の `SP26-008-E1, WD15-001-E2, WX15-060-E1, WX17-001-E2, WX19-023-E2` の5件だけ。全対象カードで effectId の順序・集合は一致し、上記 sibling effect は before/after 同一。

## 5. 今回の条件以外で再確認した原文不一致

今回の対象節以外では **3軸**を確認したが、いずれもスコープ外として据え置いた。

1. `WD15-001-E2`: 原文の「その中に＜龍獣＞が1枚以上なら、それ（対象の相手シグニ）をバニッシュ／2枚以上ならDC」に対し、live は条件を表さず自分の＜龍獣＞をバニッシュする。ユーザー指定の別軸。
2. `WX17-001-E1`: 原文はルリグ自身の「自身以外の効果を受けない」だが、現逆翻訳は `このシグニは対戦相手の効果を受けない`。既存 manual と既知の deferred 軸。
3. `WX19-023-E1`: 原文の「あなたのターン中、＜ウェポン＞+3000」が現逆翻訳に無い。既存の別軸。

それ以外の新規食い違いは0件。

## 6. `lastProcessedCards` と既存受け皿の確認

### 群B

- `execStub` の `SELECT_TARGET_ONLY`: `src/engine/execStubPart1.ts:158-198`。候補を選び、盤面を変えない `INTERNAL_NOOP` を後続にする。
- `resumeSelectTarget`: `src/engine/effectExecutor.ts:9073-9277`。汎用選択枝の最後 `:9277` で `lastProcessedCards = selected`。
- `resolveDynamicFilter`: `src/engine/effectExecutor.ts:2515`, `:2731-2740`。`powerLtLastProcessed` を比較元 `N-1` に解決し、参照不能時は空レンジ。
- `STORE_LAST_PROCESSED_TARGETS`: **挟んでいない**。直後の BANISH が即座に `lastProcessedCards` を読むため保存用の中間処理が無く、既存 `choiceTextParser.ts:380-395` と同形。

### 群C

- 最初の `GRANT_KEYWORD` の選択も同じ `resumeSelectTarget:9073-9277` を通り、選択した赤シグニを残す。
- `execGrantKeyword:3993-4009` と `execGrantEffect:4142-4158` は `targetsLastProcessed` から同一個体へ直接付与し、新しい対象選択を行わない。
- `STORE_LAST_PROCESSED_TARGETS`: **挟んでいない**。2つの条件分岐は `lastProcessedCards` を消費するだけで上書きしない。E2Eで別シグニへ何も付かないことまで確認。

## 7. golden と反転確認

追加した authoritative test は5本。全て `manualFreshEffect(cardNum,effectId)` = `mergeManualEffects(cardNum, parseCardEffects(CSV row))` を読む。

- `WX17-001-E2`: LRIGでありSIGNIでない構造、ルリグにDCが付きシグニには付かないE2E。
- `WD15-001-E2`: 第3ステップがLRIGでありSIGNIでない。第1・第2ステップも不変 assert。
- `WX19-023-E2`: LRIGでありSIGNIでない、`UNTIL_END_OF_TURN` かつ非 `PERMANENT`。
- `WX15-060-E1`: 比較元8000を選択すると7000は候補、12000は候補外。7000だけバニッシュされ、比較元0体では両方残る。
- `SP26-008-E1`: ライフ0で最初に選んだ赤シグニだけへアサシン/DC/引用AUTO。別シグニは無付与。選んだシグニの攻撃時に引用AUTOを collector が拾い、実行するとそのシグニがアップ。

反転確認は対象 manual エントリ（または対象カードキー）を一時的に無効化して該当 `--only manual2` test が赤くなることを確認し、直後に復元した。

| effectId | manualなしで赤 | 復元後緑 |
|---|---:|---:|
| `WX17-001-E2` | Yes（旧 `SIGNI` を検出） | Yes |
| `WD15-001-E2` | Yes（旧 `SIGNI` を検出） | Yes |
| `WX19-023-E2` | Yes（旧 `SIGNI/PERMANENT` を検出） | Yes |
| `WX15-060-E1` | Yes（比較元宣言欠落を検出） | Yes |
| `SP26-008-E1` | Yes（照応・引用能力欠落を検出） | Yes |

## 8. `syncManualLive --dry` 差分

初回 dry は全5カードで `~`、effectId集合変更は0。`--allow-idset-change` は使っていない。effect単位の差分は次のとおり。

| effectId | OLD → NEW |
|---|---|
| `WX17-001-E2` | 選択肢③ `target SIGNI/any` → `LRIG/self`; `parseStatus AUTO→MANUAL` |
| `WD15-001-E2` | 第3ステップ `target SIGNI/any` → `LRIG/self`; 他2ステップ保持; `AUTO→MANUAL` |
| `WX19-023-E2` | `target SIGNI/any→LRIG/self`; action duration `PERMANENT→UNTIL_END_OF_TURN`; `AUTO→MANUAL` |
| `WX15-060-E1` | 無条件BANISHの前に self SIGNIの `SELECT_TARGET_ONLY` を追加し、BANISHへ `powerLtLastProcessed:true`; cost/did-it保持; `AUTO→MANUAL` |
| `SP26-008-E1` | 第2を同一対象 `targetsLastProcessed`; 第3の即時 `UP` を同一対象への `GRANT_EFFECT` 引用AUTOへ置換; 第1/条件/cost保持; `AUTO→MANUAL` |

同期後かつ最終 `build:effects` 後に同じ5カードを dry 再実行し、全て `差分なし`。ID集合は全カードで before/after 同一。

## 9. findings.jsonl の紐づき（閉じていない）

`stage2_closed.txt` は更新していない。対象5効果に紐づく finding と、前方一致に使える生の `quote` は次のとおり。

| effectId | finding元 | quote |
|---|---|---|
| `WX17-001-E2` | `semantic_audit_stub_round3` | `このルリグは` |
| `WD15-001-E2` | `semantic_audit_stub_round3` | `それをバニッシュする` |
| `WD15-001-E2` | 同上 | `２枚以上ある場合` |
| `WX19-023-E2` | `semantic_audit_101` | `センタールリグがアタック` |
| `WX19-023-E2` | 同上 | `そのアタックの間` |
| `WX15-060-E1` | `semantic_audit_stub_round2` | `よりパワーの低い` |
| `SP26-008-E1` | `semantic_audit_stub_round3` | `追加でターン終了時まで` |
| `SP26-008-E1` | 同上 | `このシグニがアタックしたとき` |

なお群X `WX08-036-E1` にも clean_round1 の古い finding が3件あるが、現在の live はその後の修正を反映済みで正しいため、本バッチでは閉じも再修正もしていない。

## 10. 最終ゲート・計器

`npm run gates` を最終 manual/live 補正後に再実行し、全緑。

| 計器 | 投入前 | 最終 |
|---|---:|---:|
| golden | 2995/0 | **3000 PASS / 0 FAIL** |
| smoke | 全0 | **10703 OK / CRASH 0 / HANG 0 / INVARIANT 0 / SKIP 0** |
| fuzz | 全0 | **200 games; 7973 actions; CRASH/HANG/INVARIANT/EXPLOSION 全0; SKIP 11; distinct 2665; seed 12648430** |
| census高シグナル | 517/517 | **514/514** |
| census:stubs A無言/C | 0/0 | **0種0件 / 0種0箇所** |
| census:enginetext | A 136行/133 handler, B59, C28, miss40/56 cards | **同値** |
| manual-fields | loss 0 / parseStatus違反0 | **同値** |
| lint | 0 errors / 249 warnings | **同値** |

census 3減は `WX17-001-E2` / `WX19-023-E2` / `SP26-008-E1` の MANUAL免除による不可視化であり前進扱いではない。`scripts/vocabCensus.ts` に旧517を残して514へラチェットした。`SELECT_TARGET_ONLY` は実装済みなので STUB Aへ出ず、逆翻訳にも生IDが出ないためCも0。

報告直前に `npm run build:effects` → `node scripts/heldReview.mjs` を再実行した値:

| fresh計器 | 投入前 | 最終 | 差分 |
|---|---:|---:|---:|
| `_held_fresh` | 93 | **92** | -1 (`WD15-001` のみ) |
| `_partial_fresh` | 11 | **11** | 0 |
| `_idset_fresh` | 11 | **11** | 0 |
| `BASELINE_ORPHAN_MANUAL` | 11 | **11** | 0 |

held は増えていない。除外された1件は今回手書きした `WD15-001` であり、新規採用すべき改善が寝た増分は0。

## 11. 最終差分・エンコーディング・禁止事項の確認

- `git diff --check`: 問題なし（GitのLF→CRLF予告のみで、whitespace errorなし）。
- 書き換えた全 tracked file と本報告書を baseline 比較: `U+FFFD`、3文字以上連続の `?`、先頭BOMはいずれも新規増0。
- live JSONの構造差分: 指定5 effectIdだけ。他カードへの巻き込み0、全対象のID集合変更0。
- `npm run regen`: 全10 sheetと下流3出力をUTF-8直書きで完走。
- commit / push: **していない**。
- parser / engine / screens / PLAN / PLAN_PROGRESS / stage2_closed: **触っていない**。
- `--allow-idset-change`: **使っていない**。
