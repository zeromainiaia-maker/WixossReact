# 段2 第25バッチ報告：集合主語の `GRANT_KEYWORD` が `count:1` へ潰れる

実施日: 2026-08-23  
開始HEAD: `1aa12d8ef`（clean）  
commit / push: 未実施

## 1. 触ったファイルと理由

- `src/data/parsers/parseSentencePart1.ts` — 集合主語の `GRANT_KEYWORD`、代名詞「それら」、同一集合へのパワー修整＋キーワード複合、任意の自己犠牲を文型ベースで構造化。
- `src/data/effectParser.ts` — アーツにも既存 `encodeShadowScopesInText` を通し、C1の「シャドウ（レベル3以上）」を失わないようにした。
- `src/engine/execUtils.ts` — 既存 `TargetFilter.isDrive` を `fieldCandidates` でも評価し、B3を非ドライブへ広げないようにした。
- `scripts/goldenTest.ts` — 採用9効果の両方向E2E、実際のアサシン／ダブルクラッシュ消費、期間失効、D1の任意支払い成功／不成立を固定。第24バッチの旧「WXEX2-70据置」契約だけを今回の正契約へ置換し、3体犠牲等の見送り契約は維持。
- `scripts/vocabCensus.ts` — 実測改善 `702 → 701` に合わせて `BASELINE_HIGH` を更新。
- `public/data/effects_WX.json` / `effects_WX24_26.json` / `effects_misc.json` — `heldReview.mjs --adopt` で採用したlive効果。
- `docs/decompile_sheet3.txt` / `decompile_sheet9.txt` / `decompile_sheet10.txt` / `docs/grouped_sentence_all.txt` — `npm run regen` の逆翻訳・下流生成物。
- `docs/_held_fresh.json` / `docs/_held_review.txt` / `docs/_manual_drift.txt` — build / held / manual drift の現況を再生成。
- `docs/BUGFIXES.md` — 今回の修正概要と最終計器を先頭へ追記。
- 本報告書 — 原文照合、実行経路、全差分、見送り範囲、計器を記録。

`docs/PLAN.md`、`docs/PLAN_PROGRESS.md`、`stage2_closed.txt`、`manualEffects.ts` は編集していない。

## 2. 調査結果（ガードレール2）

### (a) executor は `count:'ALL'` + `filter.story` を集合へ付与するか

Yes。`execGrantKeyword`（`src/engine/effectExecutor.ts:3561`）は、`fieldCandidates` で対象側盤面へfilterを掛けて候補を作る（同 `:3627-3631`）。`tgt.count === 'ALL'` は `applyGrant(cands, ctx)` を直接呼ぶ（同 `:3677-3679`）ため、`SELECT_TARGET` pendingや選択UIへ落ちず、全候補へ付与する。実際の書込みは `applyGrant`（同 `:3646-3655`）。

`filter.story` は既存 `matchesFilter` 経路で評価される。B3の `filter.isDrive` は型として既存だったが `fieldCandidates` に評価が無かったため、同関数（`src/engine/execUtils.ts:1243`）の状態filter列へ既存語彙の評価を追加した（同 `:1290-1293`）。これによりドライブ2体だけが候補となり、非ドライブ・相手ドライブは候補外になる。

### (b) CONTINUOUS の `GRANT_KEYWORD` は executor を通るか

No。A1/A2/A3とoutlierは `executeAction` / `execGrantKeyword` ではなく、`collectContinuousGrantedKeywords`（`src/engine/effectEngine.ts:4053`）が毎回直接読む。collectorは場のシグニとセンタールリグを発生源として走査し（同 `:4077-4089`）、`activeCondition` を評価（同 `:4091-4098`）、`target.count === 'ALL'` を `targetsAll` として、`matchesFilter` に一致する全シグニへ付与する（同 `:4104-4111`）。`count:1` の場合は発生源自身しか得ないため、今回の `count:'ALL'` 化はJSON表示だけでなく実挙動を変える。

### (c) `UNTIL_OPP_TURN_END` は正しく失効するか

Yes。`execGrantKeyword.applyGrant` は `duration === 'UNTIL_OPP_TURN_END'` を `keyword_grants_until_opp_turn` に格納する（`src/engine/effectExecutor.ts:3646-3655`）。`clearUntilOppTurnEffects`（`src/screens/battle/untilOppTurn.ts:4`）が次の相手ターン終了境界で同storeと `power_mods_until_opp_turn` を消す（同 `:7-9`）。B1/B2のgoldenで付与直後とclear後を両方assertした。

## 3. 採用した効果の全件

### A1 `WXEX1-46-E1`

- 原文該当節: `【常】：あなたの＜悪魔＞のシグニは【アサシン】を得る。`
- 生成JSON: `{"effectId":"WXEX1-46-E1","effectType":"CONTINUOUS","action":{"type":"GRANT_KEYWORD","target":{"type":"SIGNI","owner":"self","count":"ALL","filter":{"cardType":"シグニ","story":"悪魔"}},"keyword":"アサシン","duration":"PERMANENT"},"duration":"PERMANENT","mandatory":true,"parseStatus":"AUTO"}`
- 逆翻訳全文: `WXEX1-46-E1: 【常】あなたのすべての＜悪魔＞のシグニに【アサシン】を与える`
- 一致: **Yes**。悪魔2体の両方へ付与し、非悪魔へ付かず、攻撃判定でアサシンが実際に消費される。

### A2 `WXEX1-71-E1`

- 原文該当節: `【常】英知＝８：あなたの＜英知＞のシグニは【ランサー】を得る。`
- 生成JSON: `{"effectId":"WXEX1-71-E1","effectType":"CONTINUOUS","activeCondition":{"type":"EICHI_LEVEL_SUM","operator":"eq","value":8},"action":{"type":"GRANT_KEYWORD","target":{"type":"SIGNI","owner":"self","count":"ALL","filter":{"cardType":"シグニ","story":"英知"}},"keyword":"ランサー","duration":"PERMANENT"},"duration":"PERMANENT","mandatory":true,"parseStatus":"AUTO"}`
- 逆翻訳全文: `WXEX1-71-E1: 【常】《英知（＜英知＞シグニのレベル合計）が8であるかぎり》あなたのすべての＜英知＞のシグニに【ランサー】を与える`
- 一致: **Yes**。英知=8成立盤面で英知2体だけが得る。

### A3 `WX24-P3-055-E1`

- 原文該当節: `【常】：あなたの場に《回想の階層　アン＝サード》がいるかぎり、あなたの＜美巧＞のシグニは【シャドウ（レベル３以上のシグニ）】を得る。`
- 生成JSON: `{"effectId":"WX24-P3-055-E1","effectType":"CONTINUOUS","activeCondition":{"type":"HAS_CARD_IN_FIELD","owner":"self","filter":{"cardName":"回想の階層　アン＝サード"}},"action":{"type":"GRANT_KEYWORD","target":{"type":"SIGNI","owner":"self","count":"ALL","filter":{"cardType":"シグニ","story":"美巧"}},"keyword":"シャドウ:{\"levelGte\":3}","duration":"PERMANENT"},"duration":"PERMANENT","mandatory":true,"parseStatus":"AUTO"}`
- 逆翻訳全文: `WX24-P3-055-E1: 【常】《あなたの場に《回想の階層　アン＝サード》がいるかぎり》あなたのすべての＜美巧＞のシグニに【シャドウ:{"levelGte":3}】を与える`
- 一致: **Yes**。条件ルリグ下で美巧2体だけがスコープ付きシャドウを得る。

### B1 `SPDi47-04-E2`

- 原文該当節: `次の対戦相手のターン終了時まで、あなたのすべてのシグニのパワーを＋10000し、それらは【シャドウ（パワー10000以下のシグニ）】を得る。`
- 生成JSON: `{"effectId":"SPDi47-04-E2","effectType":"ACTIVATED","timing":["MAIN"],"cost":{"energy":[{"color":"緑","count":0}]},"action":{"type":"SEQUENCE","steps":[{"type":"RECOLLECT_GATE","minArts":4},{"type":"ADD_TO_FIELD","owner":"self","source":{"type":"ENERGY_CARD","owner":"self","count":3,"upToCount":true,"filter":{"cardType":"シグニ"}}},{"type":"GRANT_KEYWORD","target":{"type":"SIGNI","owner":"self","count":"ALL"},"keyword":"シャドウ:{\"powerLte\":10000}","duration":"UNTIL_OPP_TURN_END"}]},"duration":"UNTIL_END_OF_TURN","mandatory":false,"parseStatus":"AUTO","usageLimit":"once_per_game"}`
- 逆翻訳全文: `SPDi47-04-E2: 【起】（メイン起動）：《once_per_game》〈《緑×0》〉（リコレクト：ルリグトラッシュのアーツが4枚以上ある場合のみ以下を行う）。そしてあなたのシグニ(エナ)3枚までをコストを支払わずに場に出す。そしてあなたのすべてのシグニに【シャドウ:{"powerLte":10000}】を与える（次の相手ターン終了時まで）`
- 一致: **No（部分採用）**。依頼対象のシャドウleafはowner/count/scope/durationとも一致し、自分2体に付き相手へ付かない。パワー+10000は従来どおり欠落しており、今回の「直すもの」外として追加していない。

### B2 `WX24-P4-020-E3`

- 原文該当節: `次の対戦相手のターン終了時まで、あなたのすべてのシグニのパワーを＋5000し、それらは【シャドウ（パワーがこのシグニのパワーの半分以下のシグニ）】を得る。`
- 生成JSON: `{"effectId":"WX24-P4-020-E3","effectType":"ACTIVATED","timing":["MAIN"],"cost":{"energy":[{"color":"緑","count":0}]},"action":{"type":"SEQUENCE","steps":[{"type":"RECOLLECT_GATE","minArts":4},{"type":"GRANT_KEYWORD","target":{"type":"SIGNI","owner":"self","count":"ALL"},"keyword":"シャドウ:{\"selfPowerHalfLte\":true,\"cardType\":\"シグニ\"}","duration":"UNTIL_OPP_TURN_END"}]},"duration":"UNTIL_END_OF_TURN","mandatory":false,"parseStatus":"AUTO","usageLimit":"once_per_game"}`
- 逆翻訳全文: `WX24-P4-020-E3: 【起】（メイン起動）：《once_per_game》〈《緑×0》〉（リコレクト：ルリグトラッシュのアーツが4枚以上ある場合のみ以下を行う）。そしてあなたのすべてのシグニに【シャドウ:{"selfPowerHalfLte":true,"cardType":"シグニ"}】を与える（次の相手ターン終了時まで）`
- 一致: **No（部分採用）**。依頼対象のシャドウleafは正しい。パワー+5000は従来どおり欠落しており、今回の「直すもの」外として追加していない。

### B3 `WXEX2-11-E4`

- 原文該当節: `【起】…ターン終了時まで、このルリグはあなたのすべての＜乗機＞のシグニに乗り、あなたのすべてのドライブ状態のシグニは【ダブルクラッシュ】を得る。`
- 生成JSON: `{"effectId":"WXEX2-11-E4","effectType":"ACTIVATED","timing":["ATTACK_ARTS"],"cost":{"coin":1},"action":{"type":"GRANT_KEYWORD","target":{"type":"SIGNI","owner":"self","count":"ALL","filter":{"cardType":"シグニ","isDrive":true}},"keyword":"ダブルクラッシュ","duration":"UNTIL_END_OF_TURN"},"duration":"UNTIL_END_OF_TURN","mandatory":false,"parseStatus":"AUTO","usageLimit":"once_per_turn"}`
- 逆翻訳全文: `WXEX2-11-E4: 【起】（アタックフェイズ起動）：《once_per_turn》〈コイン1〉あなたのすべてのドライブ状態のシグニに【ダブルクラッシュ】を与える（ターン終了時まで）`
- 一致: **No（明示部分採用）**。ダブルクラッシュ節はowner/count/isDrive/durationまで一致し、ドライブ2体だけに付き、非ドライブ・相手ドライブへ付かず、攻撃判定でも消費される。先行する搭乗機構は依頼どおり未実装のまま。

### C1 `WX25-CP1-005-E1`

- 原文該当節: `あなたのエナゾーンから＜ブルアカ＞のシグニを３枚まで対象とし、それらを場に出す。次の対戦相手のターン終了時まで、あなたのすべての＜ブルアカ＞のシグニのパワーを＋5000し、あなたのすべての＜ブルアカ＞のシグニは【シャドウ（レベル３以上のシグニ）】を得る。《リコレクトアイコン》［４枚以上］その後、追加であなたのシグニ１体を対象とし、ターン終了時まで、それは【Ｓランサー】を得る。`
- 生成JSON: `{"effectId":"WX25-CP1-005-E1","effectType":"ACTIVATED","timing":["MAIN"],"cost":{"energy":[{"color":"緑","count":1}]},"action":{"type":"SEQUENCE","steps":[{"type":"ADD_TO_FIELD","owner":"self","source":{"type":"ENERGY_CARD","owner":"self","count":3,"upToCount":true,"filter":{"cardType":"シグニ","story":"ブルアカ"}}},{"type":"SEQUENCE","steps":[{"type":"POWER_MODIFY","target":{"type":"SIGNI","owner":"self","count":"ALL","filter":{"cardType":"シグニ","story":"ブルアカ"}},"delta":5000,"duration":"UNTIL_OPP_TURN_END"},{"type":"GRANT_KEYWORD","target":{"type":"SIGNI","owner":"self","count":"ALL","filter":{"cardType":"シグニ","story":"ブルアカ"}},"keyword":"シャドウ:{\"levelGte\":3}","duration":"UNTIL_OPP_TURN_END"}]},{"type":"RECOLLECT_GATE","minArts":4},{"type":"GRANT_KEYWORD","target":{"type":"SIGNI","owner":"self","count":1},"keyword":"Sランサー","duration":"UNTIL_END_OF_TURN"}]},"duration":"INSTANT","mandatory":false,"parseStatus":"AUTO"}`
- 逆翻訳全文: `WX25-CP1-005-E1: 【起】（メイン起動）：〈《緑×1》〉あなたの＜ブルアカ＞のシグニ(エナ)3枚までをコストを支払わずに場に出す。そしてあなたのすべての＜ブルアカ＞のシグニのパワーを＋5000する（次の相手ターン終了時まで）。そしてあなたのすべての＜ブルアカ＞のシグニに【シャドウ:{"levelGte":3}】を与える（次の相手ターン終了時まで）。そして（リコレクト：ルリグトラッシュのアーツが4枚以上ある場合のみ以下を行う）。そしてあなたのシグニ1体に【Sランサー】を与える（ターン終了時まで）`
- 一致: **Yes**。開始HEADのfresh/liveには既に「全ブルアカへplainシャドウ」は存在していたため、既存Sランサーleafを書き換えず、欠落していた+5000とシャドウscopeを追加した。Sランサーは `count:1` のまま。

### D1 `WXEX2-70-E1`

- 原文該当節: `【自】《ターン１回》：このシグニがアタックしたとき、対戦相手のレベル３以下のシグニ１体を対象とし、あなたの他の＜遊具＞のシグニ１体をバニッシュしてもよい。そうした場合、それをエナゾーンに置く。`
- 生成JSON: `{"effectId":"WXEX2-70-E1","effectType":"AUTO","timing":["ON_ATTACK_SIGNI"],"action":{"type":"SEQUENCE","steps":[{"type":"BANISH","target":{"type":"SIGNI","owner":"self","count":1,"filter":{"cardType":"シグニ","story":"遊具","excludeSelf":true},"upToCount":false},"optional":true},{"type":"CONDITIONAL","condition":{"type":"IS_MY_TURN"},"then":{"type":"SEND_TO_ENERGY","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ","level":{"max":3}},"upToCount":false}}}]},"duration":"INSTANT","mandatory":true,"parseStatus":"AUTO","triggerScope":"self","usageLimit":"once_per_turn"}`
- 逆翻訳全文: `WXEX2-70-E1: 【自】このシグニがアタックしたとき：《once_per_turn》あなたの他の＜遊具＞のシグニ1体をバニッシュする（してもよい）。そうした場合、対戦相手のレベル3以下のシグニ1体をエナゾーンに置く`
- 一致: **Yes（既存の「そうした場合」慣例表現込み）**。任意性を維持し、犠牲側から相手level条件を除去。liveの誤った自分デッキトップENERGY_CHARGEも、正しいfreshの相手シグニSEND_TO_ENERGYへ採用した。支払いあり／なしをE2E固定。

### 生パースoutlier `WXEX2-07-E1`

- 原文該当節: `【常】：あなたのターンの間、あなたの＜宝石＞のシグニは【ダブルクラッシュ】と「【常】：バニッシュされない。」を得る。`
- 生成JSON: `{"effectId":"WXEX2-07-E1","effectType":"CONTINUOUS","activeCondition":{"type":"TURN_OWNER","owner":"self"},"action":{"type":"GRANT_KEYWORD","target":{"type":"SIGNI","owner":"self","count":"ALL","filter":{"cardType":"シグニ","story":"宝石"}},"keyword":"ダブルクラッシュ","duration":"PERMANENT"},"duration":"PERMANENT","mandatory":true,"parseStatus":"AUTO"}`
- 逆翻訳全文: `WXEX2-07-E1: 【常】《自分のターンの間》あなたのすべての＜宝石＞のシグニに【ダブルクラッシュ】を与える`
- 一致: **No（部分採用）**。今回の一般規則で新たに変化した唯一の指定外効果。同じ集合主語なのでダブルクラッシュの `count:'ALL'` は原文どおりで採用。引用された「バニッシュされない」能力の付与は従来から欠落しており、別の引用能力機構なので追加していない。

## 4. 見送った効果の全件＋理由

効果単位の見送りは **0件**。指定8効果と、生パースで新たに見つかった同型1効果をすべて採用した。

ただし全文一致しない部分は局所採用に留めた。B1/B2のパワー加算、B3の搭乗機構、`WXEX2-07-E1` の引用能力付与は、それぞれ今回追加した集合キーワード規則とは別のparser/engine機構なので据え置いた。これらを埋めるためのカード固有manualやregexは作っていない。

## 5. 条件以外で見つけた原文との食い違い

4件。

1. `SPDi47-04-E2` — 全シグニのパワー+10000が欠落（既存差異、未修正）。
2. `WX24-P4-020-E3` — 全シグニのパワー+5000が欠落（既存差異、未修正）。
3. `WXEX2-11-E4` — 「このルリグは全＜乗機＞へ乗る」搭乗機構が欠落（依頼で明示スコープ外、未修正）。
4. `WXEX2-07-E1` — ＜宝石＞へ引用CONTINUOUS「バニッシュされない」を与える部分が欠落（指定外outlierで発見、未修正）。

補足: C1について、依頼文の「liveはSランサーだけ」と開始HEADの実測は異なった。開始HEADのlive/freshには既に `GRANT_KEYWORD{self,ALL,story:'ブルアカ',keyword:'シャドウ'}` があり、欠けていたのは+5000とシャドウの `levelGte:3` scopeだった。既存leafを重複追加せず、その2点を修正した。

## 6. ゲート数値（before → after）

| 計器 | before | after |
|---|---:|---:|
| `npm run golden` | PASS 2455 / FAIL 0 | **PASS 2464 / FAIL 0** |
| `npm run census` | 高シグナル欠落 702 / BASELINE 702 | **701 / BASELINE 701** |
| `npm run smoke` | 10693効果、全0、SKIP 0 | **10693効果、CRASH/HANG/INVARIANT 0、SKIP 0** |
| `npm run fuzz` | 全0 | **CRASH/HANG/INVARIANT/EXPLOSION 0** |
| `npm run census:stubs` | A群🔴0 / C群0 | **A群🔴0 / C群0** |
| `npm run check:manual-fields` | 0 / 0 | **0 / 0** |
| lint | 0 errors / 261 warnings | **0 errors / 261 warnings** |
| `node scripts/groupSimilar.mjs --all` | 同型★0 | **同型★0** |
| held / partial / idset | 88 / 15 / 46 | **87 / 15 / 46** |
| manual drift 削除候補 | 86 | **86** |

最後に `npm run gates` を通して同じ値を再確認した。

## 7. 生パースdiffの変化集合とoutlier

開始前: `npx tsx tmp_stage2_batch24_snapshot.ts tmp_stage2_batch25_before.json` → `rows=6712 / effects=10660`。  
変更後: 同スクリプトで `tmp_stage2_batch25_after_parser.json` → `rows=6712 / effects=10660`。

effectId単位の変化集合は次の **9件だけ**。

1. `WXEX1-46-E1`
2. `WXEX1-71-E1`
3. `WXEX2-07-E1`（指定外同型。CSV照合して採用）
4. `WXEX2-11-E4`
5. `WXEX2-70-E1`
6. `WX24-P3-055-E1`
7. `WX24-P4-020-E3`
8. `WX25-CP1-005-E1`
9. `SPDi47-04-E2`

指定8件＋説明済み同型1件以外のoutlierは **0件**。同一カードの兄弟effectIdは変化していない。

## 8. held / partial / idset、増分照合、lint warning

- held: **88 → 87**
- partial: **15 → 15**
- idset: **46 → 46**
- lint warning: **261 → 261**（errors 0）
- manual drift削除候補: **86 → 86**

規則追加直後の `build:effects` は held 96（開始値88に新規差分8件）。全9件を `heldReview.mjs --adopt` で採用後に再buildして87となった。差分9件は上記§3のとおり1件ずつCSV原文を引き直した。指定外増分は `WXEX2-07-E1` だけで、集合ダブルクラッシュが原文どおりのため採用した。partial/idset/manual driftの増分は0。

`build:effects` の既存 `isPureSuperset` 表示 `WXDi-P07-052` は今回の生パース差分集合に含まれず、`fixLrigColorFilters.mjs` 後のworktreeにも同カードの差分を残していない。手でHEADへ戻す操作は行っていない。

## 9. やらなかったことの申告

- クラス限定のない直接形「あなたのすべてのシグニは【K】を得る」は、既存 `kwAllSelfSpecM` がすでに扱うため新規規則の対象にしなかった。
- クラス限定のない代名詞形「あなたのすべてのシグニのパワーを…し、それらは【K】を得る」は、B1/B2のキーワード対象を復元する範囲で対象にした。先行パワー修整は今回追加していない。
- 「あなたの（すべての）＜クラス＞のシグニは／が」を対象にした。「シグニN体を対象とし」「それは【K】を得る」「このシグニは【K】を得る」は対象にしておらず、`count:1` を維持した。
- C1の複合規則は、前後に同じ集合主語が明記され、修飾句が文字どおり一致する形だけに限定した。「それらは」形へパワー合成を広げていない。
- `【レイヤー】` 内の「このシグニは」、`WXEX1-70-E3` のアクセホスト参照、`GRANT_ACCE_HOST_ABILITY` は触っていない。
- `WXEX2-11-E4` の搭乗機構は触っていない。新しい型・フィールドを作らず、既存 `isDrive` のexecutor評価だけを接続した。
- `WXEX2-07-E1` の引用「バニッシュされない」は別機構として据え置いた。
- B1/B2のパワー+10000/+5000は、依頼表の「直すもの」外かつC1と異なり主語を再掲しない別文型なので追加していない。
- `manualEffects.ts` へ影武者コピーを置いていない。トップレベルmanualの追加・変更は0。
- `buildEffectsJson.ts` にforce-adoptを追加していない。全採用は `heldReview.mjs --adopt` 経由。
- `docs/PLAN.md` / `docs/PLAN_PROGRESS.md` / `stage2_closed.txt` は触っていない。commit / pushもしていない。
