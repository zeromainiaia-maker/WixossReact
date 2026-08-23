# §6.2 段2 第30バッチ報告 — 盤面集約値（レベル／パワー合計・偶奇）

- 開始HEAD: `9f14ac0208ca9bb26369e134f2a0baabee60c4db`（short `9f14ac020`）
- 開始時 `git status --porcelain`: 出力なし（clean）
- 方針: 新しいaction型は作らず、既存 `TargetFilter.levelParity`、`LAST_PROCESSED_MATCHES`、`ALL_FIELD_SIGNI_MATCH`、`FIELD_LEVEL_SUM` を流用・拡張した。
- commit / push: 実施していない。
- `docs/PLAN.md` / `docs/PLAN_PROGRESS.md`: 編集していない。

## 1. 触ったファイルと理由

- `src/types/effects.ts` — `FIELD_LEVEL_SUM` の両unionへ `parity`、`metric`、`lrigRole` を後方互換で追加。union型数は増やしていない。
- `src/engine/effectEngine.ts` — `checkActiveCondition` の `FIELD_LEVEL_SUM` caseで偶奇、実効パワー合計、センター／アシスト限定を評価。
- `src/engine/execUtils.ts` — `evalCondition` の同caseへAUTO/ACTIVATED用の同一評価を実装。
- `src/data/effectParser.ts` — 対象奇偶、直前カード奇偶＋クラス、レベル合計偶奇、全数奇偶、パワー合計閾値、アシスト多段閾値を一般文型で生成。
- `scripts/decompileEffects.ts` — 拡張した `FIELD_LEVEL_SUM`（偶奇／パワー／アシスト）を日本語へ逆翻訳。
- `scripts/goldenTest.ts` — 採用13効果の実行／評価、正負・境界・空盤面、D2非採用契約、ActiveCondition側を15 testで固定。
- `scripts/vocabCensus.ts` — 高シグナル実測 `656→647` に定数と説明を更新。
- `public/data/effects_WXK.json` — A1〜A3、B1、D1をliveへ採用。
- `public/data/effects_WXDi.json` — C1〜C3、E1、E3、E4と同文型outlierをliveへ採用。
- `public/data/effects_misc.json` — E2をliveへ採用。
- `docs/decompile_sheet3.txt` / `sheet7.txt` / `sheet8.txt` / `sheet10.txt` — `npm run regen` による対象カードの逆翻訳更新。
- `docs/_vocab_census.txt` — census再生成（高シグナル9件減）。
- `docs/_census_stubs.txt` — 行番号参照を再生成。STUB分類数自体は不変。
- `docs/_manual_drift.txt` — parser行番号参照を再生成。削除候補数は不変。
- `docs/BUGFIXES.md` — 本バッチの設計・採否・ゲート結果を先頭へ追記。
- 本ファイル — 指定の詳細報告。

## 2. 調査結果と機構の成立前提

### A群

`TargetFilter.levelParity` は既に `matchesFilter` と場候補抽出の双方で消費されるため、engine追加なしで成立する。parserの対象名詞句から `odd/even`、owner、「すべて」を取り、BANISH / POWER_MODIFY の単一SIGNI leafへ付けた。数値やカード名はregexへ埋めていない。

### B群

既存 `LAST_PROCESSED_MATCHES` は `TargetFilter` を受け、`evalCondition` 内で `matchesFilter` を呼ぶため `levelParity` と `story` を同時に評価できる。直前のデッキトップTRASH後だけを条件化し、ADD_TO_FIELDのトラッシュ候補側にも同じ `{cardType:'シグニ',story,levelParity}` を付けた。

### C群

既存 `FIELD_LEVEL_SUM` を新型へ分裂させず `parity?:'odd'|'even'` で拡張した。今回の効果はすべてAUTOなので実消費地点は `evalCondition` の `case 'FIELD_LEVEL_SUM'`。同じ型がActiveCondition unionにもあるため、`checkActiveCondition` の同caseも同時に拡張しgoldenで固定した。場が空なら合計は0であり、既存の数値合計条件と同じ算術に揃えて「偶数=true／奇数=false」とした。

### D群

D1は既存 `ALL_FIELD_SIGNI_MATCH{owner,filter}` に `{levelParity:'even'}` を渡すだけで表せた。`evalCondition` と `checkActiveCondition` の既存caseはいずれも `tops.length > 0 && every(...)` なので、空集合はfalse。この既存契約を変えていない。D2の「公開領域にある表向きのシグニであるカード」は、場・エナ・トラッシュ・ルリグ系を横断し、非公開領域と裏向きカードを除外する列挙概念がengineに無い。場だけの `ALL_FIELD_SIGNI_MATCH` は意味が狭くなるので使用しなかった。

### E群

`FIELD_LEVEL_SUM` に `metric?:'level'|'power'` を追加し、`metric:'power'` のときシグニの合計パワーを評価する。実消費地点はAUTO側の `evalCondition` とActiveCondition側の `checkActiveCondition` の各 `FIELD_LEVEL_SUM` case。パワーは `FIELD_SIGNI_POWER_COUNT` / `SELF_POWER_THRESHOLD` と同じく `effectivePowers` を優先し、無ければ表記Powerへフォールバックする。goldenで実効値29999/30000/30001を固定した。

E4では既存 `lrigZoneTops` がセンター＋左右アシストを合算するため、そのままでは「アシストルリグ」限定にならない。`lrigRole:'assist'` を足し、左右アシストだけを数える。1以上と4以上はそれぞれ独立した `CONDITIONAL` にし、センターだけ、合計1、合計4をE2E固定した。

## 3. 採用した効果の全件

以下の逆翻訳は `npm run regen` 後の各 `decompile_sheet*.txt` に出た1効果ぶんの全文。

### A1 `WXK03-078-E1`

- 原文該当節: `レベルが奇数の対戦相手のシグニ１体を対象とし、それをバニッシュする。`
- 生成JSON: `{"effectId":"WXK03-078-E1","effectType":"AUTO","timing":["ON_PLAY"],"cost":{"energy":[{"color":"黒","count":1}]},"action":{"type":"BANISH","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ","levelParity":"odd"},"upToCount":false}},"duration":"INSTANT","mandatory":false,"parseStatus":"AUTO"}`
- 逆翻訳全文: `【自】このシグニが場に出たとき：〈《黒×1》〉対戦相手のレベルが奇数のシグニ1体をバニッシュする`
- 一致: 一致。偶数を候補順先頭に置いても選択候補から除外されることをE2E確認。

### A2 `WXK04-024-E1`

- 原文該当節: `レベルが奇数の対戦相手のシグニ１体を対象とし、ターン終了時まで、それのパワーを－3000する。`
- 生成JSON: `{"effectId":"WXK04-024-E1","effectType":"AUTO","timing":["ON_PLAY"],"action":{"type":"POWER_MODIFY","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ","levelParity":"odd"},"upToCount":false},"delta":-3000},"duration":"UNTIL_END_OF_TURN","mandatory":true,"parseStatus":"AUTO"}`
- 逆翻訳全文: `【自】このシグニが場に出たとき：対戦相手のレベルが奇数のシグニ1体のパワーを－3000する`
- 一致: 一致。偶数を先頭に置いた盤面で奇数だけへ－3000。

### A3 `WXK04-024-E2`

- 原文該当節: `ターン終了時まで、レベルが奇数の対戦相手のすべてのシグニのパワーを－15000する。`
- 生成JSON: `{"effectId":"WXK04-024-E2","effectType":"ACTIVATED","timing":["MAIN"],"cost":{"trash_key":true},"action":{"type":"POWER_MODIFY","target":{"type":"SIGNI","owner":"opponent","count":"ALL","filter":{"cardType":"シグニ","levelParity":"odd"}},"delta":-15000},"duration":"UNTIL_END_OF_TURN","mandatory":false,"parseStatus":"AUTO"}`
- 逆翻訳全文: `【起】（メイン起動）：〈コスト:{"trash_key":true}〉対戦相手のすべてのレベルが奇数のシグニのパワーを－15000する`
- 一致: 一致。`ALL` は維持し、偶数には適用されない。

### B1 `WXK03-079-E1`

- 原文該当節: `それがレベルが奇数の＜トリック＞のシグニの場合、それをトラッシュから場に出す。`
- 生成JSON: `{"effectId":"WXK03-079-E1","effectType":"AUTO","timing":["ON_PLAY"],"action":{"type":"CONDITIONAL","condition":{"type":"TURN_OWNER","owner":"self"},"then":{"type":"SEQUENCE","steps":[{"type":"TRASH","target":{"type":"DECK_CARD","owner":"self","count":1}},{"type":"CONDITIONAL","condition":{"type":"LAST_PROCESSED_MATCHES","filter":{"cardType":"シグニ","story":"トリック","levelParity":"odd"}},"then":{"type":"ADD_TO_FIELD","owner":"self","source":{"type":"TRASH_CARD","owner":"self","count":1,"upToCount":false,"filter":{"cardType":"シグニ","story":"トリック","levelParity":"odd"}}}}]}},"duration":"INSTANT","mandatory":true,"parseStatus":"AUTO"}`
- 逆翻訳全文: `【自】このシグニが場に出たとき：あなたのターンの場合、あなたのデッキの上からカードを1枚トラッシュに置く。そしてこの方法で＜トリック＞のレベルが奇数のシグニを1枚以上処理したなら、あなたの＜トリック＞のレベルが奇数のシグニ(トラッシュ)1枚をコストを支払わずに場に出す`
- 一致: 今回対象の条件・候補限定は一致。奇数＜トリック＞で成立し、偶数＜トリック＞ではトラッシュに残ることをE2E確認。

### C1 `WXDi-P04-039-E1`

- 原文該当節: `あなたの場にいるルリグのレベルの合計が偶数の場合、あなたのエナゾーンからシグニを１枚まで対象とし、それを手札に加える。`
- 生成JSON: `{"effectId":"WXDi-P04-039-E1","effectType":"AUTO","timing":["ON_ATTACK_PHASE_START"],"action":{"type":"CONDITIONAL","condition":{"type":"FIELD_LEVEL_SUM","owner":"self","target":"lrig","parity":"even"},"then":{"type":"TRANSFER_TO_HAND","source":{"type":"ENERGY_CARD","owner":"self","count":1,"upToCount":true,"filter":{"cardType":"シグニ"}}}},"duration":"INSTANT","mandatory":true,"parseStatus":"AUTO","triggerScope":"self"}`
- 逆翻訳全文: `【自】あなたのアタックフェイズ開始時：あなたの場にあるルリグのレベルの合計が偶数なら、あなたのシグニ(エナ)1枚までを手札に加える`
- 一致: 一致。合計2で成立、合計1で不成立。

### C2 `WXDi-P04-039-E2`

- 原文該当節: `あなたの場にいるルリグのレベルの合計が奇数の場合、【エナチャージ１】をする。`
- 生成JSON: `{"effectId":"WXDi-P04-039-E2","effectType":"AUTO","timing":["ON_PLAY"],"action":{"type":"CONDITIONAL","condition":{"type":"FIELD_LEVEL_SUM","owner":"self","target":"lrig","parity":"odd"},"then":{"type":"ENERGY_CHARGE_FROM_DECK","owner":"self","count":1}},"duration":"INSTANT","mandatory":true,"parseStatus":"AUTO"}`
- 逆翻訳全文: `【自】このシグニが場に出たとき：あなたの場にあるルリグのレベルの合計が奇数なら、あなたのデッキの上から1枚をエナゾーンに置く`
- 一致: 一致。合計1で成立、合計2で不成立。

### C3 `WXDi-P08-045-E1`

- 原文該当節: `あなたの場にあるシグニのレベルの合計が偶数の場合、【エナチャージ１】をする。`
- 生成JSON: `{"effectId":"WXDi-P08-045-E1","effectType":"AUTO","timing":["ON_ATTACK_PHASE_START"],"action":{"type":"CONDITIONAL","condition":{"type":"FIELD_LEVEL_SUM","owner":"self","target":"signi","parity":"even"},"then":{"type":"ENERGY_CHARGE_FROM_DECK","owner":"self","count":1}},"duration":"INSTANT","mandatory":true,"parseStatus":"AUTO","triggerScope":"self"}`
- 逆翻訳全文: `【自】あなたのアタックフェイズ開始時：あなたの場にあるシグニのレベルの合計が偶数なら、あなたのデッキの上から1枚をエナゾーンに置く`
- 一致: 一致。合計2で成立、合計3で不成立、空盤面（合計0）で成立。

### 同文型outlier `WXDi-P05-051-E1`

- 原文該当節: `あなたの場にあるシグニのレベルの合計が偶数の場合、対戦相手のシグニ１体を対象とし、《白》《白》《無》を支払ってもよい。そうした場合、それを手札に戻す。`
- 生成JSON: `{"effectId":"WXDi-P05-051-E1","effectType":"AUTO","timing":["ON_ATTACK_PHASE_START"],"action":{"type":"SEQUENCE","steps":[{"type":"CONDITIONAL","condition":{"type":"FIELD_LEVEL_SUM","owner":"self","target":"signi","parity":"even"},"then":{"type":"STUB","id":"TARGET_OPP_SIGNI_OPTIONAL_COLOR_COST","costColors":["白","白","無"]}},{"type":"CONDITIONAL","condition":{"type":"IS_MY_TURN"},"then":{"type":"BOUNCE","target":{"type":"SIGNI","owner":"opponent","count":1,"upToCount":false,"filter":{"cardType":"シグニ"}},"optional":false}}]},"duration":"INSTANT","mandatory":true,"parseStatus":"AUTO","triggerScope":"self"}`
- 逆翻訳全文: `【自】あなたのアタックフェイズ開始時：あなたの場にあるシグニのレベルの合計が偶数なら、対戦相手のシグニ１体を対象とし、《白》《白》《無》を支払ってもよい。そうした場合、対戦相手のシグニ1体を手札に戻す`
- 一致: 一致。既存任意コストSTUBを条件で包む正準形を維持し、実条件を合計2/3で評価。

### D1 `WXK07-104-E1`

- 原文該当節: `対戦相手のシグニ１体を対象とし、あなたの場にあるすべてのシグニのレベルが偶数の場合、ターン終了時まで、それのパワーを－4000する。`
- 生成JSON: `{"effectId":"WXK07-104-E1","effectType":"AUTO","timing":["ON_ATTACK_SIGNI"],"action":{"type":"CONDITIONAL","condition":{"type":"ALL_FIELD_SIGNI_MATCH","owner":"self","filter":{"cardType":"シグニ","levelParity":"even"}},"then":{"type":"POWER_MODIFY","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ"},"upToCount":false},"delta":-4000}},"duration":"UNTIL_END_OF_TURN","mandatory":true,"parseStatus":"AUTO","triggerScope":"self"}`
- 逆翻訳全文: `【自】このシグニがアタックしたとき：あなたの場にあるすべてのシグニがレベルが偶数のなら、対戦相手のシグニ1体のパワーを－4000する`
- 一致: 一致。全数偶数かつ非空で成立、奇数混在・空盤面で不成立。旧 `count:'ALL'` も原文どおり1体へ修正。

### E1 `WXDi-P07-042-E2`

- 原文該当節: `あなたの場にあるシグニのパワーの合計が30000以上の場合、カードを１枚引く。`
- 生成JSON: `{"effectId":"WXDi-P07-042-E2","effectType":"AUTO","timing":["ON_TURN_END"],"action":{"type":"CONDITIONAL","condition":{"type":"FIELD_LEVEL_SUM","owner":"self","target":"signi","metric":"power","operator":"gte","value":30000},"then":{"type":"DRAW","owner":"self","count":1}},"duration":"INSTANT","mandatory":true,"parseStatus":"AUTO"}`
- 逆翻訳全文: `【自】ターン終了時：あなたの場にあるシグニのパワーの合計が30000以上なら、あなたのカードを1枚引く`
- 一致: 一致。実効パワー合計29999で不成立、30000で成立。

### E2 `SPDi43-19-E1`

- 原文該当節: `あなたの《VJ.WOLF3rdVerse-ULT》がダウンしたとき、あなたの場にあるシグニのパワーの合計が30000以上の場合、【エナチャージ１】をする。`
- 生成JSON: `{"effectId":"SPDi43-19-E1","effectType":"AUTO","timing":["ON_SIGNI_DOWN"],"action":{"type":"CONDITIONAL","condition":{"type":"FIELD_LEVEL_SUM","owner":"self","target":"signi","metric":"power","operator":"gte","value":30000},"then":{"type":"ENERGY_CHARGE_FROM_DECK","owner":"self","count":1}},"duration":"INSTANT","mandatory":true,"parseStatus":"AUTO","triggerScope":"any_ally","triggerFilter":{"cardName":"VJ.WOLF3rdVerse-ULT"},"usageLimit":"once_per_turn"}`
- 逆翻訳全文: `【自】あなたの《VJ.WOLF3rdVerse-ULT》がダウンしたとき：〔範囲:any_ally〕《once_per_turn》あなたの場にあるシグニのパワーの合計が30000以上なら、あなたのデッキの上から1枚をエナゾーンに置く`
- 一致: 一致。実効パワー合計29999/30000を両方向固定。

### E3 `WXDi-P07-045-E1`

- 原文該当節: `あなたの場にあるシグニのパワーの合計が30000の場合、【エナチャージ２】をする。`
- 生成JSON: `{"effectId":"WXDi-P07-045-E1","effectType":"AUTO","timing":["ON_ATTACK_PHASE_START"],"action":{"type":"CONDITIONAL","condition":{"type":"FIELD_LEVEL_SUM","owner":"self","target":"signi","metric":"power","operator":"eq","value":30000},"then":{"type":"ENERGY_CHARGE_FROM_DECK","owner":"self","count":2}},"duration":"INSTANT","mandatory":true,"parseStatus":"AUTO","triggerScope":"self"}`
- 逆翻訳全文: `【自】あなたのアタックフェイズ開始時：あなたの場にあるシグニのパワーの合計が30000であるなら、あなたのデッキの上から2枚をエナゾーンに置く`
- 一致: 一致。29999と30001は不成立、30000だけ成立。

### E4 `WXDi-P07-008-E2`

- 原文該当節: `あなたの場にいるアシストルリグのレベルの合計が１以上の場合、《コインアイコン》を得る。４以上の場合、追加で《コインアイコン》を得る。`
- 生成JSON: `{"effectId":"WXDi-P07-008-E2","effectType":"ACTIVATED","timing":["MAIN"],"cost":{"energy":[{"color":"赤","count":0}]},"action":{"type":"SEQUENCE","steps":[{"type":"CONDITIONAL","condition":{"type":"FIELD_LEVEL_SUM","owner":"self","target":"lrig","lrigRole":"assist","operator":"gte","value":1},"then":{"type":"GAIN_COIN","owner":"self","count":1}},{"type":"CONDITIONAL","condition":{"type":"FIELD_LEVEL_SUM","owner":"self","target":"lrig","lrigRole":"assist","operator":"gte","value":4},"then":{"type":"GAIN_COIN","owner":"self","count":1}}]},"duration":"INSTANT","mandatory":false,"parseStatus":"AUTO","usageLimit":"once_per_turn"}`
- 逆翻訳全文: `【起】（メイン起動）：《once_per_turn》〈《赤×0》〉あなたの場にあるアシストルリグのレベルの合計が1以上なら、あなたのコインを1枚得る。そしてあなたの場にあるアシストルリグのレベルの合計が4以上なら、あなたのコインを1枚得る`
- 一致: 一致。センタールリグだけなら0、アシスト合計1なら1枚、合計4なら2枚。

## 4. 見送った効果

### D2 `WXK05-028-E2`

- 原文: `あなたの公開領域にある表向きのシグニであるカードのレベルがすべて奇数の場合、それをバニッシュする。`
- 現況: `BANISH{SIGNI,opponent,count:1}` のまま。
- 理由: engineには「全公開領域」を一括列挙し、非公開／裏向きを除外して各カードのレベル奇数を全数判定する条件語彙がない。`ALL_FIELD_SIGNI_MATCH` は場だけなので近似採用しない。
- golden契約: actionが直接BANISHのままで、`ALL_FIELD_SIGNI_MATCH` / `FIELD_LEVEL_SUM` を誤付加しないことを固定。

## 5. F群の現況（変更なし）

### コスト合計以下のスペル／アーツを無償使用

- `WX09-012-E2`: `PLAY_FREE_FROM_TRASH{costThreshold:3, spell, blue}`。正しい。
- `WX19-002-E4`: `PLAY_FREE_FROM_TRASH{costThreshold:5, arts}`。正しい。
- `WX21-038-E1`: `PLAY_FREE{source:'hand',costThreshold:3,ignoreCost:true}`。正しい。
- `WXK01-021-E1`: 引用起動能力内に同じ `PLAY_FREE{costThreshold:3}`。正しい。
- `PR-466-E3`: 場のカード名条件も保持し、`PLAY_FREE{costThreshold:5}`。正しい。
- `WX24-P4-040-E2`: 相手手札を捨てる→相手トラッシュからスペルを無償使用、まではあるが「捨てたそのカード」「コスト合計1以下」が無い。未実装。
- `WXDi-P10-007-E3`: `LOOK_AND_REORDER{count:10}` だけで、合計4以下・2枚まで・チェックゾーン・順番に無償使用が無い。未実装。

### コスト合計以下の相手アーツ耐性

- `WX16-034-LAYER` / `WX21-040-E2`: アーツ耐性自体はあるがコスト合計1以下の上限が無い。
- `WXK09-047-E1`: アーツ耐性の上限が無く、同時付与の「バニッシュされない」も欠落。エナの各レベル枚数条件もaction上に無い。未実装。

### 選択集合のレベル合計

- 指示書の確認事項と異なり、`EffectTarget.totalLevelMax` は既に存在し、`effectExecutor.ts` の候補提示・resume検証まで実装済みだった。
- ただし `WX11-033-BURST` はcount 1のBANISH、`WXDi-P08-034-E2` はcount 2/upToのDOWNに `totalLevelMax` が無く、parser未配線。
- `WXEX1-45-E3` はSEARCHであり、EffectTarget用の `totalLevelMax` をそのまま使う経路ではない。3効果とも今回は変更していない。

### この方法で処理したシグニのレベル合計

- `WX18-006-E1`: `LAST_PROCESSED_LEVEL_SUM` の7/10/12以上をsnapshot付きで全段保持。正しい。
- `WX22-Re06-E1`: 3以上のBANISHだけ条件化済み。6以上DRAW、9以上LIFE_CRASH、12以上ADD_TO_FIELDは無条件で、部分実装。
- `WXDi-P16-087-E1`: `lte:3` のthenとelse（整数上4以上）で両分岐を表現。正しい。
- `WX25-P3-052-E1`: `lte:4` のthenとelse（5以上）で両分岐を表現。正しい。

## 6. 条件以外で見つけた原文との食い違い

- 1件。`WXK07-104-E1` はliveが `count:'ALL'` で相手全シグニへ－4000していたが、原文は対象1体。条件ラップ後の一般再パースで `count:1` へ同時修正し、E2E固定した。

## 7. ゲート実測

- `npm run regen`: 完走。decompile全10枚＋下流3生成。
- `npm run gates`: 全緑。
- golden: **2546 PASS / 0 FAIL**（開始2531、+15 test）。
- census: **647 / BASELINE_HIGH 647**（656→647、定数とコメント更新）。
- smoke: **10693 / OK 10693 / CRASH 0 / HANG 0 / INVARIANT 0 / SKIP 0**。
- fuzz: **200ゲーム、CRASH/HANG/INVARIANT/EXPLOSION 0、SKIP 0**。
- lint: **0 errors / 261 warnings**（開始比±0）。
- `node scripts/groupSimilar.mjs --all`: 同型★ **0**。
- `npm run census:stubs`: 無言A **0種/0件**、C **0種/0箇所**（明示defer Aは4種/5件で不変）。
- `npm run check:manual-fields`: **0 effects / parseStatus違反0**。
- held / partial / idset: **87 / 15 / 46**。
- `censusManualDrift` 削除候補: **1**（`WX10-018-E1`）。
- manualEffects: **412カード**。
- live効果総数: **10693**。
- Condition / ActiveCondition: **122 / 52**（union数不変）。

## 8. 全カード生パースdiff（per-effect）

- 比較方法: 開始HEADのparserをdetached worktreeから読み、現parserと同じ6712 CSVカード（全シートでBOM除去）を個別parseしてeffectId単位比較。
- 変化: **13効果**。
- 指定由来12: `WXK03-078-E1`, `WXK04-024-E1`, `WXK04-024-E2`, `WXK03-079-E1`, `WXDi-P04-039-E1`, `WXDi-P04-039-E2`, `WXDi-P08-045-E1`, `WXK07-104-E1`, `WXDi-P07-042-E2`, `SPDi43-19-E1`, `WXDi-P07-045-E1`, `WXDi-P07-008-E2`。
- outlier **1効果**: `WXDi-P05-051-E1`。原文も同じ「場のシグニのレベル合計が偶数」で旧条件なし。カードIDで除外する理由が無いため原文照合・golden後に採用。
- 未説明outlier: **0**。
- D2は生パース不変。

## 9. held / partial / idset とlintの増減

- build直後は構造変更9カードがheldへ入り **87→96**。全件を1カードずつ原文照合して `heldReview --adopt` し、再buildで **96→87**。
- 最終: held **87（±0）** / partial **15（±0）** / idset **46（±0）**。
- lint: **261 warnings（±0） / 0 errors**。

## 10. parseStatus遷移

0件。全13効果ともbefore/afterで `AUTO` のまま。

## 11. 指示書との不一致

- 指定13効果以外に `WXDi-P05-051-E1` が同文型で1件存在した。全カードper-effect比較で検出し、正当な一般規則の結果として追加採用した。
- 「レベル合計選択のレベル版があるかだけ確認」の答えは **既に `EffectTarget.totalLevelMax` があり、engineとUIまで消費済み**。ただしF群3効果には未配線で、SEARCH型にはそのまま流用できない。
- `FIELD_LEVEL_SUM target:'lrig'` はセンターだけでなく `lrigZoneTops` により左右アシストも数える。よってE4には `lrigRole:'assist'` が必要だった。

## 12. エンコーディング検査

最終の `git diff --name-only` 全ファイルと新規報告書について、開始HEADとの比較で U+FFFD、3文字以上連続する疑問符、先頭UTF-8 BOMを機械集計した。新規増は **U+FFFD 0 / 疑問符連続 0 / BOM 0**。CSVは編集しておらず、`CardData_Sheet8.csv` の既存BOMは今回差分外。
