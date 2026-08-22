# §6.2 段2 第28バッチ 実施報告

実施日: 2026-08-23  
開始HEAD: `2ed155a604f06c3c715ee361691e75584162dc38`（開始時 `git status --porcelain` 空）  
結論: 指定14効果のうち13効果を採用、C2 `WD15-007-E1` は機構不足で据置。全カード生パースで同根3効果を追加採用し、live変更は計16効果。commit / push なし。`docs/PLAN.md` / `docs/PLAN_PROGRESS.md` は無編集。

## 1. 触ったファイルと理由

- `src/types/effects.ts`: ActiveCondition 3型追加、既存3型と Condition のアーツ回数を拡張、型数トリップワイヤの正本を更新。
- `src/engine/effectEngine.ts`: `checkActiveCondition` に新条件・拡張条件の評価を実装し、`collectEffectImmuneSigni` が限定された SEQUENCE 内自己保護を読むよう配線。
- `src/engine/execUtils.ts`: `evalCondition` のアーツ回数評価、`fieldCandidates` の解決済みキーワード所持判定を追加。
- `src/data/effectParser.ts`: A/B/C群の条件・対象限定・裸の複数キーワード列挙を文型ベースで生成。
- `src/data/parserUtils.ts`: `parseStateFilter` に既存 `isDrive` の生成を追加。
- `src/data/parsers/parseSentencePart1.ts`, `parseSentencePart2.ts`: キーワード所持／ドライブ状態を GRANT_KEYWORD 対象へ載せる。
- `scripts/goldenTest.ts`: ActiveCondition 52型トリップワイヤと、採用16効果＋C2非採用契約の成立／不成立E2Eを追加。
- `scripts/decompileEffects.ts`: 新条件の日本語化、AND内の手札同数以上、SEQUENCE内CONTINUOUS自己保護、明示PERMANENTの誤期間復元を是正。
- `scripts/vocabCensus.ts`: 実測低下 `681→671` に合わせて基準値と説明を第28バッチ内容へ更新。
- `public/data/effects_WX.json`, `effects_WXDi.json`, `effects_WXK.json`, `effects_misc.json`: parser収穫と held採用後のlive 16効果。
- `docs/decompile_sheet1/2/3/4/5/6/7/8/10.txt`, `docs/_review_repr.txt`, `docs/grouped_all.txt`, `docs/grouped_sentence_all.txt`: `npm run regen` の再生成物。
- `docs/_vocab_census.txt`, `docs/_census_stubs.txt`, `docs/_manual_drift.txt`, `docs/_partial_fresh.json`, `docs/_idset_fresh.json`: 最終計器の再生成物。
- `scripts/archive/scratchpad/semantic_audit_clean_round1/stage2_closed.txt`: 採用findingを閉じ、C2とWX20-038を閉じない旨を記録。
- `docs/BUGFIXES.md`: 第28バッチの修正・見送り・ゲートを先頭追記。
- 本ファイル: 詳細報告。

## 2. A/B/C群の調査結果と機構成立性

| 群 | effectId | 判定 | 実装／消費地点 |
|---|---|---|---|
| A1 | SPDi43-09-E1 | 成立・採用 | 新型 `IS_SELF_SOUL_ATTACHED`。`checkActiveCondition` が `field.signi_soul` を評価し、`collectContinuousGrantedKeywords` がゲートを消費。`thisCardOnly` も追加。 |
| A2 | SPDi43-10-E1 | 成立・採用 | A1と同じ。 |
| A3 | WX15-038-E2 | 成立・採用 | `IS_SELF_ACCED{cardName}` へ既存型を拡張。`checkActiveCondition` が `acceCardsAt` とカード名を評価。POWERは `calcFieldPowers`、保護は `collectEffectImmuneSigni`。後者のSEQUENCE内leaf未走査も限定配線した。 |
| A4 | WXK03-026-E3 | 成立・採用 | 新ActiveCondition `ARTS_USED_THIS_TURN{minCount}`。`checkActiveCondition` が `turn_arts_used_names.length` を評価し、`collectBanishEffectProtectedSigni` が消費。Condition側の同型も `evalCondition` へ同時配線。 |
| A5 | WDK15-011-E1 | 成立・採用 | `THIS_CARD_HAS_UNDER{minCount}` を拡張。`checkActiveCondition` が下カード一致数を評価。`thisCardOnly` 追加。 |
| A6 | WX20-057-E1 | 成立・採用 | `SELF_HAS_KEYWORD{subject:'center_lrig'}` へ拡張。`checkActiveCondition` がセンタールリグを選び、`hasKeyword` で印字・通常付与・相手ターン終了まで付与を読む。 |
| A7 | WXK09-080-E1 | 成立・採用 | Condition側に既存だった形をActiveConditionへ新設した `ENERGY_EACH_LEVEL_FILTER_GTE`。`checkActiveCondition` が各levelの一致枚数を個別評価。 |
| B1 | WXDi-P06-062-E1 | 成立・採用 | 既存 `HAND_DIFF{gte,0}` と `TURN_OWNER{opponent}` を `AND`。`checkActiveCondition` の既存caseで消費。 |
| B2 | WXDi-P07-054-E2 | 成立・採用 | 既存 `TRASH_HAS_CARD{cardType:'シグニ',color:'白',minCount:7}` と `TURN_OWNER` を `AND`。 |
| C1 | WXDi-P07-045-E2 | 成立・採用 | Condition `SELF_POWER_GTE{operator:'eq',value:13000}`。`evalCondition` が実効パワーで厳密一致を評価。 |
| C2 | WD15-007-E1 | 不成立・据置 | 「その正面」の条件は付与先ごとの動的条件。既存 `fieldCondition` は `FRONT_SIGNI_HAS_CHARM` のみで、効果全体のActiveConditionにすると1体の判定を全体へ誤適用する。durationだけ直しても無条件アサシンが残るため非採用。非採用契約をgolden化。 |
| C3 | WX08-061-E1 | 成立・採用 | 既存 `TargetFilter.keyword`。`fieldCandidates` が印字と解決済み付与storeの双方を評価。 |
| C4 | WXK01-049-E1 | 成立・採用 | 既存 `TargetFilter.isDrive`。AUTOの対象抽出は `fieldCandidates`→`matchesStateFilter` で消費。 |
| C5 | WXK11-053-E1 | 成立・採用 | 裸の `【K1】【K2】` を自己対象 `SEQUENCE[GRANT_KEYWORD,GRANT_KEYWORD]` として生成。両leafに `thisCardOnly`。 |

D群 `WX16-051-LAYER` / `WXEX2-59-LAYER` / `WXEX1-70-E3` は生パース・liveとも変更0。入れ子の正しい条件／別ブロックの `GRANT_ACCE_HOST_ABILITY` を触っていない。

## 3. 採用した効果の全件

以下のJSONは最終liveの効果全体。判定の「一致」は意味一致で、逆翻訳の数値半角化や内部scope表記は許容している。

1. `SPDi43-09-E1` — 原文条件: `【ソウル】が付いているかぎり`  
   JSON: `{"effectId":"SPDi43-09-E1","effectType":"CONTINUOUS","activeCondition":{"type":"IS_SELF_SOUL_ATTACHED"},"action":{"type":"GRANT_KEYWORD","target":{"type":"SIGNI","owner":"self","count":1,"filter":{"thisCardOnly":true}},"keyword":"シャドウ:{\"levelLte\":2}","duration":"PERMANENT"},"duration":"PERMANENT","mandatory":true,"parseStatus":"AUTO"}`  
   逆翻訳: `【常】《このシグニに【ソウル】が付いているかぎり》このシグニは【シャドウ:{"levelLte":2}】を持つ`  
   判定: 一致。

2. `SPDi43-10-E1` — 原文条件: `【ソウル】が付いているかぎり`  
   JSON: `{"effectId":"SPDi43-10-E1","effectType":"CONTINUOUS","activeCondition":{"type":"IS_SELF_SOUL_ATTACHED"},"action":{"type":"GRANT_KEYWORD","target":{"type":"SIGNI","owner":"self","count":1,"filter":{"thisCardOnly":true}},"keyword":"シャドウ:{\"artsCostLte\":1}","duration":"PERMANENT"},"duration":"PERMANENT","mandatory":true,"parseStatus":"AUTO"}`  
   逆翻訳: `【常】《このシグニに【ソウル】が付いているかぎり》このシグニは【シャドウ:{"artsCostLte":1}】を持つ`  
   判定: 一致。

3. `WX15-038-E2` — 原文条件: `このシグニが《コードイート　テキソス》にアクセされているかぎり`  
   JSON: `{"effectId":"WX15-038-E2","effectType":"CONTINUOUS","activeCondition":{"type":"IS_SELF_ACCED","cardName":"コードイート　テキソス"},"action":{"type":"SEQUENCE","steps":[{"type":"POWER_MODIFY","target":{"type":"SIGNI","owner":"self","count":1,"filter":{"thisCardOnly":true}},"delta":3000},{"type":"GRANT_PROTECTION","target":{"type":"SIGNI","owner":"self","count":1},"from":["シグニ"],"sourceOwner":"opponent","duration":"PERMANENT"}]},"duration":"PERMANENT","mandatory":true,"parseStatus":"AUTO"}`  
   逆翻訳: `【常】《このシグニが《コードイート　テキソス》にアクセされているかぎり》このシグニのパワーを＋3000する。そしてこのシグニは対戦相手の、シグニの効果を受けない`  
   判定: 一致（読点位置のみ表示差）。

4. `WXK03-026-E3` — 原文条件: `このターンにあなたがアーツを３回以上使用していた場合`  
   JSON: `{"effectId":"WXK03-026-E3","effectType":"CONTINUOUS","activeCondition":{"type":"ARTS_USED_THIS_TURN","owner":"self","minCount":3},"action":{"type":"GRANT_PROTECTION","target":{"type":"SIGNI","owner":"self","count":1},"from":["BANISH"],"sourceOwner":"any","duration":"PERMANENT"},"duration":"PERMANENT","mandatory":true,"parseStatus":"AUTO"}`  
   逆翻訳: `【常】《このターンにあなたがアーツを3回以上使用していたかぎり》このシグニは効果によってバニッシュされない`  
   判定: 条件・保護範囲とも一致。

5. `WDK15-011-E1` — 原文条件: `この下にカードが３枚以上あるかぎり`  
   JSON: `{"effectId":"WDK15-011-E1","effectType":"CONTINUOUS","activeCondition":{"type":"THIS_CARD_HAS_UNDER","minCount":3},"action":{"type":"GRANT_KEYWORD","target":{"type":"SIGNI","owner":"self","count":1,"filter":{"thisCardOnly":true}},"keyword":"ダブルクラッシュ","duration":"PERMANENT"},"duration":"PERMANENT","mandatory":true,"parseStatus":"AUTO"}`  
   逆翻訳: `【常】《このシグニの下にカードが3枚以上あるかぎり》このシグニは【ダブルクラッシュ】を持つ`  
   判定: 一致。

6. `WX20-057-E1` — 原文条件: `あなたのセンタールリグが【ダブルクラッシュ】を持つかぎり`  
   JSON: `{"effectId":"WX20-057-E1","effectType":"CONTINUOUS","activeCondition":{"type":"SELF_HAS_KEYWORD","subject":"center_lrig","keyword":"ダブルクラッシュ"},"action":{"type":"GRANT_KEYWORD","target":{"type":"SIGNI","owner":"self","count":1,"filter":{"thisCardOnly":true}},"keyword":"ダブルクラッシュ","duration":"PERMANENT"},"duration":"PERMANENT","mandatory":true,"parseStatus":"AUTO"}`  
   逆翻訳: `【常】《あなたのセンタールリグが【ダブルクラッシュ】を持っているかぎり》このシグニは【ダブルクラッシュ】を持つ`  
   判定: 一致。

7. `WXK09-080-E1` — 原文条件: `エナゾーンにレベル１～４の＜電機＞のシグニがそれぞれ１枚以上あるかぎり`  
   JSON: `{"effectId":"WXK09-080-E1","effectType":"CONTINUOUS","activeCondition":{"type":"ENERGY_EACH_LEVEL_FILTER_GTE","owner":"self","filter":{"cardType":"シグニ","story":"電機"},"levels":[1,2,3,4],"minEach":1},"action":{"type":"GRANT_KEYWORD","target":{"type":"SIGNI","owner":"self","count":1,"filter":{"thisCardOnly":true}},"keyword":"ランサー","duration":"PERMANENT"},"duration":"PERMANENT","mandatory":true,"parseStatus":"AUTO"}`  
   逆翻訳: `【常】《あなたのエナゾーンにレベル1～4の＜電機＞のシグニがそれぞれ1枚以上あるかぎり》このシグニは【ランサー】を持つ`  
   判定: 一致。

8. `WXDi-P06-062-E1` — 原文条件: `対戦相手のターンの間、手札枚数が相手以上であるかぎり`  
   JSON: `{"effectId":"WXDi-P06-062-E1","effectType":"CONTINUOUS","activeCondition":{"type":"AND","conditions":[{"type":"TURN_OWNER","owner":"opponent"},{"type":"HAND_DIFF","operator":"gte","value":0}]},"action":{"type":"GRANT_KEYWORD","target":{"type":"SIGNI","owner":"self","count":1,"filter":{"thisCardOnly":true}},"keyword":"シャドウ:{\"levelLte\":2}","duration":"PERMANENT"},"duration":"PERMANENT","mandatory":true,"parseStatus":"AUTO"}`  
   逆翻訳: `【常】《対戦相手のターンの間かつあなたの手札の枚数が対戦相手の手札の枚数以上であるかぎり》このシグニは【シャドウ:{"levelLte":2}】を持つ`  
   判定: 一致。

9. `WXDi-P07-054-E2` — 原文条件: `対戦相手のターンの間、トラッシュに白のシグニが７枚以上あるかぎり`  
   JSON: `{"effectId":"WXDi-P07-054-E2","effectType":"CONTINUOUS","activeCondition":{"type":"AND","conditions":[{"type":"TURN_OWNER","owner":"opponent"},{"type":"TRASH_HAS_CARD","owner":"self","filter":{"cardType":"シグニ","color":"白"},"minCount":7}]},"action":{"type":"GRANT_KEYWORD","target":{"type":"SIGNI","owner":"self","count":1,"filter":{"thisCardOnly":true}},"keyword":"シャドウ:{\"color\":\"赤\"}","duration":"PERMANENT"},"duration":"PERMANENT","mandatory":true,"parseStatus":"AUTO"}`  
   逆翻訳: `【常】《対戦相手のターンの間かつあなたのトラッシュに《白》のシグニが7枚以上あるかぎり》このシグニは【シャドウ:{"color":"赤"}】を持つ`  
   判定: 一致。

10. `WXDi-P07-045-E2` — 原文条件: `このシグニのパワーが13000の場合`  
    JSON: `{"effectId":"WXDi-P07-045-E2","effectType":"AUTO","timing":["ON_ATTACK_SIGNI"],"condition":{"type":"SELF_POWER_GTE","operator":"eq","value":13000},"action":{"type":"GRANT_KEYWORD","target":{"type":"SIGNI","owner":"self","count":1,"filter":{"thisCardOnly":true}},"keyword":"シャドウ:{\"powerLte\":10000}","duration":"UNTIL_OPP_TURN_END"},"duration":"UNTIL_END_OF_TURN","mandatory":true,"parseStatus":"AUTO","triggerScope":"self"}`  
    逆翻訳: `【自】このシグニがアタックしたとき：このシグニのパワーが13000である場合、このシグニは【シャドウ:{"powerLte":10000}】を持つ（次の相手ターン終了時まで）`  
    判定: 一致。`eq` を実効パワー13000/13001で対照固定。

11. `WX08-061-E1` — 原文限定: `あなたの【ダブルクラッシュ】を持つシグニ１体`  
    JSON: `{"effectId":"WX08-061-E1","effectType":"ACTIVATED","timing":["MAIN"],"cost":{"energy":[{"color":"赤","count":1}]},"action":{"type":"GRANT_KEYWORD","target":{"type":"SIGNI","owner":"self","count":1,"filter":{"keyword":"ダブルクラッシュ"}},"keyword":"アサシン","duration":"UNTIL_END_OF_TURN"},"duration":"INSTANT","mandatory":false,"parseStatus":"AUTO"}`  
    逆翻訳: `【起】（メイン起動）：〈《赤×1》〉あなたの【ダブルクラッシュ】を持つシグニ1体に【アサシン】を与える（ターン終了時まで）`  
    判定: 一致。

12. `WXK01-049-E1` — 原文限定: `ドライブ状態のシグニ１体`  
    JSON: `{"effectId":"WXK01-049-E1","effectType":"AUTO","timing":["ON_PLAY"],"cost":{"energy":[{"color":"赤","count":1}]},"action":{"type":"GRANT_KEYWORD","target":{"type":"SIGNI","owner":"self","count":1,"filter":{"isDrive":true}},"keyword":"ダブルクラッシュ","duration":"UNTIL_END_OF_TURN"},"duration":"UNTIL_END_OF_TURN","mandatory":false,"parseStatus":"AUTO"}`  
    逆翻訳: `【自】このシグニが場に出たとき：〈《赤×1》〉あなたのドライブ状態のシグニ1体に【ダブルクラッシュ】を与える（ターン終了時まで）`  
    判定: 一致。

13. `WXK11-053-E1` — 原文能力: `【アサシン】【ダブルクラッシュ】`  
    JSON: `{"effectId":"WXK11-053-E1","effectType":"CONTINUOUS","action":{"type":"SEQUENCE","steps":[{"type":"GRANT_KEYWORD","target":{"type":"SIGNI","owner":"self","count":1,"filter":{"thisCardOnly":true}},"keyword":"アサシン","duration":"PERMANENT"},{"type":"GRANT_KEYWORD","target":{"type":"SIGNI","owner":"self","count":1,"filter":{"thisCardOnly":true}},"keyword":"ダブルクラッシュ","duration":"PERMANENT"}]},"duration":"PERMANENT","mandatory":true,"parseStatus":"AUTO"}`  
    逆翻訳: `【常】このシグニは【アサシン】を持つ。そしてこのシグニは【ダブルクラッシュ】を持つ`  
    判定: 一致。

14. `WDK01-007-E1`（全カード差分の同型追加）— 原文限定: `ドライブ状態のシグニ１体`  
    JSON: `{"effectId":"WDK01-007-E1","effectType":"ACTIVATED","timing":["MAIN"],"cost":{"energy":[{"color":"赤","count":2}]},"action":{"type":"SEQUENCE","steps":[{"type":"STUB","id":"ARTS_COST_REDUCTION_BY_EFFECT"},{"type":"GRANT_KEYWORD","target":{"type":"SIGNI","owner":"self","count":1,"filter":{"isDrive":true}},"keyword":"ダブルクラッシュ","duration":"UNTIL_END_OF_TURN"},{"type":"GRANT_KEYWORD","target":{"type":"SIGNI","owner":"any","count":1,"filter":{"cardType":"シグニ","level":{"min":3}}},"keyword":"トリプルクラッシュ","duration":"UNTIL_END_OF_TURN"}]},"duration":"INSTANT","mandatory":false,"parseStatus":"AUTO"}`  
    逆翻訳: `【起】（メイン起動）：〈《赤×2》〉ベット―《コインアイコン》あなたがベットする場合、このアーツの使用コストは《赤×0》になる。そしてあなたのドライブ状態のシグニ1体に【ダブルクラッシュ】を与える（ターン終了時まで）。そして自分または対戦相手のレベル3以上のシグニ1体に【トリプルクラッシュ】を与える（ターン終了時まで）`  
    判定: 今回採用したドライブ限定は一致。ただし既存の後段は「そのシグニがLv3以上なら代わりに同一対象へトリプル」ではなく、別対象へダブルとトリプルを両方付与できる不一致が残る（§5参照）。

15. `PR-K021-E2`（同型追加）— 原文条件: `このシグニのパワーが8000の場合`  
    JSON: `{"effectId":"PR-K021-E2","effectType":"AUTO","timing":["ON_ATTACK_SIGNI"],"condition":{"type":"SELF_POWER_GTE","operator":"eq","value":8000},"action":{"type":"ENERGY_CHARGE_FROM_DECK","owner":"self","count":1},"duration":"INSTANT","mandatory":true,"parseStatus":"AUTO","triggerScope":"self"}`  
    逆翻訳: `【自】このシグニがアタックしたとき：このシグニのパワーが8000である場合、あなたのデッキの上から1枚をエナゾーンに置く`  
    判定: 一致。

16. `PR-K021-E3`（同型追加）— 原文条件: `このシグニのパワーが12000の場合`  
    JSON: `{"effectId":"PR-K021-E3","effectType":"AUTO","timing":["ON_ATTACK_SIGNI"],"condition":{"type":"SELF_POWER_GTE","operator":"eq","value":12000},"action":{"type":"SEQUENCE","steps":[{"type":"STUB","id":"OPTIONAL_COST","costColors":["白","白","無","無"]},{"type":"CONDITIONAL","condition":{"type":"IS_MY_TURN"},"then":{"type":"BOUNCE","target":{"type":"SIGNI","owner":"self","count":1,"upToCount":false,"filter":{"cardType":"シグニ"}},"optional":false}}]},"duration":"INSTANT","mandatory":true,"parseStatus":"AUTO","triggerScope":"self"}`  
    逆翻訳: `【自】このシグニがアタックしたとき：このシグニのパワーが12000である場合、《白》《白》《無》《無》を支払ってもよい。そうした場合、あなたのシグニ1体を手札に戻す`  
    判定: 今回採用した厳密パワー条件は一致。ただし原文の対象はownerを限定しない「シグニ1体」で、既存JSONは `owner:'self'`。別軸の不一致が残る。

## 4. 見送った効果の全件と理由

- `WD15-007-E1`: 付与先ごとの「その正面のシグニのパワー12000以上」を正しく保持する条件語彙がない。ActiveConditionは効果全体の1回判定であり、各付与先の正面を個別評価できない。`duration:'PERMANENT'` だけを `UNTIL_END_OF_TURN` に変えても無条件アサシンが残るので丸ごと据置。goldenで「現時点ではactiveCondition/fieldConditionなし、PERMANENT」を非採用契約として固定。
- 生パースoutlier `WX20-038-E1`: freshは裸の二キーワードをSEQUENCE化するが、liveは `WX20-038-E1b` MANUALでダブルクラッシュ、`E1c`で保護を既に保持する。カード単位採用するとeffectId集合を崩すため非採用。live挙動は既に正しい。
- D群3効果: 偽陽性のため非採用・変更0。

## 5. 条件以外で見つけた原文との食い違い

2効果。

- `WDK01-007-E1`: 原文は同じドライブ対象がLv3以上なら「代わりに」トリプルクラッシュ。既存JSONは別の任意Lv3以上シグニへトリプルを付与し、元対象のダブルも残す。今回は確実な `isDrive` 復元のみ採用。
- `PR-K021-E3`: 原文はowner未限定の「シグニ1体」だが、既存BOUNCEは `owner:'self'`。今回は厳密パワー条件のみ採用。

表示だけの補正として、逆翻訳器が明示 `PERMANENT` へ原文中の別期間を誤復元する問題と、CONTINUOUSのSEQUENCE内自己保護を「あなたのシグニ1体」と表示する問題も直した。カード挙動の追加変更ではない。

## 6. ゲート数値

最終 `build:effects → heldReview` 後に `npm run gates` を再実行。

| 指標 | 最終値 | 増減／判定 |
|---|---:|---|
| golden | 2511 PASS / 0 FAIL | 2493→2511（+18） |
| census | 671 / BASELINE_HIGH 671 | 681→671（-10、定数と説明を更新） |
| smoke | 10693 OK / CRASH 0 / HANG 0 / INVARIANT 0 / SKIP 0 | live総数据置 |
| fuzz | 200ゲーム、CRASH/HANG/INVARIANT/EXPLOSION 全0、SKIP 0 | 据置 |
| lint | 0 errors / 261 warnings | warnings増減0 |
| groupSimilar --all | 同型★ 0 | 据置 |
| census:stubs | A群無言no-op 0 / C群表示穴0 | 据置 |
| check:manual-fields | field loss 0 / parseStatus違反0 | 据置 |
| held / partial / idset | 87 / 15 / 46 | すべて増減0 |
| censusManualDrift 削除候補 | 86 | 据置 |
| Condition / ActiveCondition | 122 / 52 | Active 49→52、goldenトリップワイヤ更新 |
| live効果総数 | 10693 | 据置 |

`npm run regen` も実行済み。全10シート再生成、`groupSimilar` は5986カード・265同型グループ・★0。

## 7. 全カード生パースdiff（per-effect）とoutlier

開始時スナップショットとの全カード fresh parse 比較は **17 effect / 16 cards**。per-effect集合は以下。

- 指定範囲・採用13: `SPDi43-09-E1`, `SPDi43-10-E1`, `WX15-038-E2`, `WXK03-026-E3`, `WDK15-011-E1`, `WX20-057-E1`, `WXK09-080-E1`, `WXDi-P06-062-E1`, `WXDi-P07-054-E2`, `WXDi-P07-045-E2`, `WX08-061-E1`, `WXK01-049-E1`, `WXK11-053-E1`。
- outlier 4: `WDK01-007-E1`, `PR-K021-E2`, `PR-K021-E3` は原文照合して対象軸を採用。`WX20-038-E1` はlive sibling効果が既に正しいため非採用。
- 指定C2 `WD15-007-E1` とD群3効果はfresh差分0。

従って raw outlier は **4効果**、liveの最終差分は **16効果**。live差分は上記採用全件と完全一致し、説明不能outlier 0。

## 8. held / partial / idset と lint warning

報告直前に `npm run build:effects` を実行し、その直後に `node scripts/heldReview.mjs` を実行した実測:

- held: 87→87（増減0）
- partial: 15→15（増減0）
- idset: 46→46（増減0）
- lint warning: 261→261（増減0、errors 0）

途中でB1/B2/C5のカード単位構造変更3件がheldへ上がったが、全leafを原文照合して `heldReview --adopt` 済み。最終held集合は基準と同一で、未説明の増減はない。

## 9. parseStatus遷移

0件。最終live 16効果はすべて `AUTO→AUTO`。

## 10. 指示書との不一致／補足

- 指定母集団A7/B2/C5の見立ては実コードと一致。
- A3は `IS_SELF_ACCED` のカード名拡張だけでは不十分だった。`GRANT_PROTECTION` がトップレベルSEQUENCE内にあり、`collectEffectImmuneSigni` の再帰抽出がこの自己保護形を拒否していたため、条件を付けても保護leafだけ一度も有効にならない配線穴があった。限定的に同時修正した。
- C4の `isDrive` は `parserUtils.parseStateFilter` だけでは実際のGRANT_KEYWORD対象経路に届かず、`parseSentencePart1` の対象組立にも明示合成が必要だった。
- 全カード差分で指示外の `WDK01-007-E1`, `PR-K021-E2/E3`, `WX20-038-E1` が出た。前3件は同根の正しい追加情報として採用、最後はlive側が別effectIdで既に正しいため非採用。
- C2は指示どおり、既存語彙で正表現不能だったので据置した。

## 11. エンコーディング検査

`git diff --name-only` の追跡済み33ファイルを開始HEADと比較。集計は U+FFFD `0→0`、3文字以上連続の `?` `28→28`、先頭UTF-8 BOM（`efbbbf`）`0→0`。同コマンドに出ない新規報告書1ファイルも別途検査し `0 / 0 / 0`。3指標とも新規増0。
