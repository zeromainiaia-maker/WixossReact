# §6.2 段2 第29バッチ報告 — 引用能力つき合成の外側パワー操作

開始HEAD `4dfca766b`。開始時 `git status --porcelain` は空。採用はA群7＋B群5の計12効果、B5 `WD16-014-E1` は期間を正しく表せないため据置。commit / push は行っていない。

## 1. 触ったファイルと理由

- `src/data/effectParser.ts` — 引用付与STUBの前へ外側 `POWER_MODIFY` を合成し、CONTINUOUSの「基本パワーNになり」の前へ `POWER_SET` を合成。引用内SEARCHの外側漏出も抑止した。
- `src/engine/execStubPart1.ts` — 引用【自】内の実装済み `SET_OPP_SIGNI_POWER_BY_SELF_POWER` を付与対象として許可し、原文が次の相手ターン終了までなら長期付与storeへ積む。
- `src/engine/effectEngine.ts` — CONTINUOUS引用付与を `collectGrantedFromLayer` で当該ブロックから展開し、`SEQUENCE` 内の自己バニッシュ耐性をcollectorへ限定配線した。
- `scripts/goldenTest.ts` — 採用12効果を1効果ずつ実行するE2E 12本と、B5非採用契約1本を追加。A1は非ランサーを候補順の先頭に置く負方向を固定した。
- `scripts/vocabCensus.ts` — 実測改善659→656に `BASELINE_HIGH` とコメントを同期した。
- `public/data/effects_WX.json` — A1、B1〜B4、B6の計6カードを採用。
- `public/data/effects_WXDi.json` — A5/A6の2カードを採用。
- `public/data/effects_WX24_26.json` — A2〜A4の3カードを採用。
- `public/data/effects_misc.json` — A7を採用。
- `docs/decompile_sheet1.txt` / `sheet2.txt` / `sheet6.txt` / `sheet7.txt` / `sheet8.txt` / `sheet9.txt` — `npm run regen` の対象カード逆翻訳を更新。
- `docs/grouped_sentence_all.txt` — regen下流の文型一覧を更新。`docs/grouped_all.txt` は内容差0。
- `docs/_vocab_census.txt` — census 656の明細へ更新。
- `docs/_census_stubs.txt` — STUB総ノード2880とソース行番号を再生成（A無言0/C0）。
- `docs/_idset_fresh.json` — 件数46据置。既にlive正解のoutlier 2カードについてfresh内容だけ更新。
- `docs/_manual_drift.txt` — 最終再計測時刻を更新。削除候補1据置。
- `docs/BUGFIXES.md` — 本バッチの修正・見送り・ゲートを先頭へ記録。
- 本報告書 — 調査、全採用JSON/逆翻訳、見送り、全指標を保存。

`docs/PLAN.md` と `docs/PLAN_PROGRESS.md` は編集していない。最終 `build:effects → heldReview` 後、`docs/_held_fresh.json` / `_partial_fresh.json` / `_held_review.txt` はHEADと内容差0だった。

## 2. 調査結果：機構が成立する前提

### ガードレール2：引用STUBをSEQUENCE後段へ置けるか

- `sourceAbilityText(ctx)`（`src/engine/execUtils.ts`）は `ctx.sourceCardNum` のカードと `ctx.sourceEffectId` を `abilityBlockTextOf(card, sourceEffectId)` へ渡し、カード全文ではなく当該効果ブロックを返す。
- `executeEffect` が `sourceEffectId` を注入し、`execSequence`（`effectExecutor.ts`）はctxを各stepへspreadして維持する。前段の結果だけを `lastProcessedCards` として次stepへ渡すため、ブロック参照はずれない。
- `POWER_MODIFY` は実際に選んだ対象を `lastProcessedCards` へ記録する。`execStubPart1` の引用付与handlerは `lastProcessedCards` を第一候補にするため、原文の同じ「それ」へ能力が付く。A4の `thisCardOnly`、A1/A2/A3/A5/A6/A7の選択対象はいずれもこの契約と一致した。
- A4/A5はパワーだけでなく引用能力も次の相手ターン終了まで必要なので、handlerが能力ブロックの期間句を見て `granted_effects_until_opp_turn` を選ぶようにした。自分ターン終了では両方維持、相手ターン終了で両方消滅をE2E固定した。

| 効果 | 前提確認 |
|---|---|
| A1 `WX08-073-E1` | 成立。`keyword:'ランサー'` 候補だけが前段に残り、同じ対象へ引用EC2を付与。 |
| A2 `WX24-P1-014-E1` | 成立。`story:'地獣'` の同一対象へ+3000と引用BANISH。 |
| A3 `WX24-P1-078-E1` | 成立。`story:'地獣'` の同一対象へ+5000と引用BANISH。 |
| A4 `WX25-CP1-064-E1` | 成立。`thisCardOnly` が `lastProcessedCards` となり、両方が `UNTIL_OPP_TURN_END`。 |
| A5 `WXDi-P13-061-E1` | 成立。`isDisona:true` の同一対象へ両方を長期付与。Sheet8のBOMは走査時に除去した。 |
| A6 `WXDi-P06-059-E1 c1` | 成立。`hasIcon:'ライズ'` の同一対象へ+3000と引用【自】sequence。 |
| A7 `PR-K076-E2` | 成立。`GRANT_QUOTED_AUTO_ABILITY`を保持し、内側の実装済みSTUBも付与する。 |

### ガードレール3：CONTINUOUSのPOWER_SET消費

- `calcFieldPowers`（`effectEngine.ts`）はCONTINUOUS効果ごとに `checkActiveCondition` を評価し、成立時だけ再帰関数 `extractPowerSets` でroot/`SEQUENCE` 内の `POWER_SET` を抽出して基本パワーへ反映する。不成立時は抽出前にskipする。
- 後段は消費地点が別。B1は `collectContinuousGrantedKeywords`、B2は `collectEffectImmuneSigni`、B3は `collectBanishEffectProtectedSigni`、B4/B6の引用【自】は `collectGrantedFromLayer` が読む。B3だけ従来collectorがrootしか見なかったため、`POWER_SET` と同居するSEQUENCEの直接 `GRANT_PROTECTION{from:['BANISH']}` に限定して再帰した。
- `collectGrantedFromLayer` はexecutorを通らないCONTINUOUSについて、`sourceAbilityText` と同じ `abilityBlockTextOf(sourceCard, eff.effectId)` で当該ブロックの引用【自】だけを再パースする。よってB4/B6の外側条件成立時だけ引用AUTOが収集される。

| 効果 | 前提確認 |
|---|---|
| B1 `WX09-017-E1` | 成立。条件成立時だけ15000＋ダブルクラッシュ、不成立時は元の10000。 |
| B2 `WX09-018-E1` | 成立。条件成立時だけ15000＋相手シグニ効果耐性。 |
| B3 `WX12-037-E1` | 成立。条件成立時だけ12000＋バニッシュ耐性。 |
| B4 `WX11-053-E1` | 成立。条件成立時だけ12000＋引用アタック時BOUNCE。 |
| B5 `WD16-014-E1` | **不成立**。`PowerSetAction` にdurationが無く、AUTO解決で「ターン終了時まで」の基本パワー設定を型として保持できない。据置。 |
| B6 `WX09-Re07-E1` | 成立。条件成立時だけ10000＋引用ON_LEAVE_FIELD SEARCH。外側常時SEARCHは除去。 |

## 3. 採用した全効果

以下の「一致」はJSON＋engine実行意味についての判定。引用本文はSTUBが当該ブロック原文を実行時に読むため、STUBを保持した形が正しい。

### A群

1. `WX08-073-E1`
   - 原文節：`あなたの【ランサー】を持つシグニ１体を対象とし、ターン終了時まで、それのパワーを＋10000し、そのシグニは「【自】：…エナゾーンに置く。」を得る。`
   - 生成JSON：`{"effectId":"WX08-073-E1","effectType":"ACTIVATED","timing":["MAIN"],"cost":{"energy":[{"color":"緑","count":1}]},"action":{"type":"SEQUENCE","steps":[{"type":"POWER_MODIFY","target":{"type":"SIGNI","owner":"self","count":1,"filter":{"cardType":"シグニ","keyword":"ランサー"},"upToCount":false},"delta":10000,"duration":"UNTIL_END_OF_TURN"},{"type":"STUB","id":"GRANT_ABILITY_INNER_TEXT"}]},"duration":"INSTANT","mandatory":false,"parseStatus":"AUTO"}`
   - 逆翻訳全文：`【起】（メイン起動）：〈《緑×1》〉あなたのシグニ1体のパワーを＋10000する（ターン終了時まで）。そしてこのカードに記載された継続能力を付与する（テキスト検出型。原文参照）`
   - 一致：**実行意味一致**。逆翻訳formatterは `keyword:'ランサー'` を表示しないが、JSON・候補抽出・非ランサー先頭の負方向E2Eで限定を確認。

2. `WX24-P1-014-E1`
   - 原文節：`あなたのアタックフェイズ開始時、あなたの＜地獣＞のシグニ１体を対象とし、ターン終了時まで、それのパワーを＋3000し、それは「【自】：…バニッシュする。」を得る。`
   - 生成JSON：`{"effectId":"WX24-P1-014-E1","effectType":"AUTO","timing":["ON_ATTACK_PHASE_START"],"action":{"type":"SEQUENCE","steps":[{"type":"POWER_MODIFY","target":{"type":"SIGNI","owner":"self","count":1,"filter":{"cardType":"シグニ","story":"地獣"},"upToCount":false},"delta":3000,"duration":"UNTIL_END_OF_TURN"},{"type":"STUB","id":"GRANT_ABILITY_INNER_TEXT"}]},"duration":"UNTIL_END_OF_TURN","mandatory":true,"parseStatus":"AUTO","triggerScope":"self"}`
   - 逆翻訳全文：`【自】あなたのアタックフェイズ開始時：あなたの＜地獣＞のシグニ1体のパワーを＋3000する（ターン終了時まで）。そしてこのカードに記載された継続能力を付与する（テキスト検出型。原文参照）`
   - 一致：一致。

3. `WX24-P1-078-E1`
   - 原文節：`あなたの＜地獣＞のシグニ１体を対象とし、ターン終了時まで、それのパワーを＋5000し、それは「【自】：…バニッシュする。」を得る。`
   - 生成JSON：`{"effectId":"WX24-P1-078-E1","effectType":"ACTIVATED","timing":["MAIN"],"cost":{"energy":[{"color":"緑","count":1}]},"action":{"type":"SEQUENCE","steps":[{"type":"POWER_MODIFY","target":{"type":"SIGNI","owner":"self","count":1,"filter":{"cardType":"シグニ","story":"地獣"},"upToCount":false},"delta":5000,"duration":"UNTIL_END_OF_TURN"},{"type":"STUB","id":"GRANT_ABILITY_INNER_TEXT"}]},"duration":"INSTANT","mandatory":false,"parseStatus":"AUTO"}`
   - 逆翻訳全文：`【起】（メイン起動）：〈《緑×1》〉あなたの＜地獣＞のシグニ1体のパワーを＋5000する（ターン終了時まで）。そしてこのカードに記載された継続能力を付与する（テキスト検出型。原文参照）`
   - 一致：一致。

4. `WX25-CP1-064-E1`
   - 原文節：`【起】《ダウン》：次の対戦相手のターン終了時まで、このシグニのパワーを＋4000し、このシグニは「【自】：…」を得る。`
   - 生成JSON：`{"effectId":"WX25-CP1-064-E1","effectType":"ACTIVATED","timing":["MAIN"],"cost":{"down_self":true},"action":{"type":"SEQUENCE","steps":[{"type":"POWER_MODIFY","target":{"type":"SIGNI","owner":"self","count":1,"filter":{"thisCardOnly":true}},"delta":4000,"duration":"UNTIL_OPP_TURN_END"},{"type":"STUB","id":"GRANT_ABILITY_INNER_TEXT"}]},"duration":"UNTIL_END_OF_TURN","mandatory":false,"parseStatus":"AUTO"}`
   - 逆翻訳全文：`【起】（メイン起動）：〈《ダウン》〉このシグニのパワーを＋4000する（次の相手ターン終了時まで）。そしてこのカードに記載された継続能力を付与する（テキスト検出型。原文参照）`
   - 一致：一致。パワーと引用能力の両方で期限の両方向を実行確認。

5. `WXDi-P13-061-E1`
   - 原文節：`あなたの《ディソナアイコン》のシグニ１体を対象とし、次の対戦相手のターン終了時まで、それのパワーを＋3000し、それは「【自】：…」を得る。`
   - 生成JSON：`{"effectId":"WXDi-P13-061-E1","effectType":"ACTIVATED","timing":["MAIN"],"cost":{"energy":[{"color":"白","count":0}]},"action":{"type":"SEQUENCE","steps":[{"type":"POWER_MODIFY","target":{"type":"SIGNI","owner":"self","count":1,"filter":{"cardType":"シグニ","isDisona":true},"upToCount":false},"delta":3000,"duration":"UNTIL_OPP_TURN_END"},{"type":"STUB","id":"GRANT_ABILITY_INNER_TEXT"}]},"duration":"INSTANT","mandatory":false,"parseStatus":"AUTO"}`
   - 逆翻訳全文：`【起】（メイン起動）：〈《白×0》〉あなたの《ディソナアイコン》を持つシグニ1体のパワーを＋3000する（次の相手ターン終了時まで）。そしてこのカードに記載された継続能力を付与する（テキスト検出型。原文参照）`
   - 一致：一致。非ディソナ対照と両期限を確認。

6. `WXDi-P06-059-E1` choice `c1`
   - 原文節：`②《ライズアイコン》を持つあなたのシグニ１体を対象とし、ターン終了時まで、それのパワーを＋3000し、それは「【自】：…」を得る。`
   - 生成JSON：`{"effectId":"WXDi-P06-059-E1","effectType":"ACTIVATED","timing":["MAIN"],"cost":{"energy":[{"color":"赤","count":1}]},"action":{"type":"CHOOSE","choose_count":1,"from_count":2,"choices":[{"choiceId":"c0","label":"選択肢1","action":{"type":"TAKE_FROM_UNDER_SIGNI","destination":"hand","count":1,"upToCount":false,"filter":{"cardType":"シグニ"}}},{"choiceId":"c1","label":"選択肢2","action":{"type":"SEQUENCE","steps":[{"type":"POWER_MODIFY","target":{"type":"SIGNI","owner":"self","count":1,"filter":{"cardType":"シグニ","hasIcon":"ライズ"},"upToCount":false},"delta":3000,"duration":"UNTIL_END_OF_TURN"},{"type":"STUB","id":"GRANT_ABILITY_INNER_TEXT"}]}}]},"duration":"INSTANT","mandatory":false,"parseStatus":"AUTO"}`
   - 逆翻訳全文：`【起】（メイン起動）：〈《赤×1》〉以下の2つから1つを選ぶ【このシグニの下のカードを取る / あなたの《ライズアイコン》を持つシグニ1体のパワーを＋3000する（ターン終了時まで）。そしてこのカードに記載された継続能力を付与する（テキスト検出型。原文参照）】`
   - 一致：choice②について一致。非ライズ対照と内側AUTO sequenceを確認。

7. `PR-K076-E2`
   - 原文節：`あなたのシグニ１体を対象とし、ターン終了時まで、それのパワーを＋3000し、それは「【自】：…パワーをこのシグニのパワーと同じだけ－する。」を得る。`
   - 生成JSON：`{"effectId":"PR-K076-E2","effectType":"ACTIVATED","timing":["MAIN"],"cost":{"energy":[{"color":"黒","count":1}],"trash_self":true},"action":{"type":"SEQUENCE","steps":[{"type":"POWER_MODIFY","target":{"type":"SIGNI","owner":"self","count":1,"filter":{"cardType":"シグニ"},"upToCount":false},"delta":3000,"duration":"UNTIL_END_OF_TURN"},{"type":"STUB","id":"GRANT_QUOTED_AUTO_ABILITY"}]},"duration":"UNTIL_END_OF_TURN","mandatory":false,"parseStatus":"AUTO"}`
   - 逆翻訳全文：`【起】（メイン起動）：〈《黒×1》＋このシグニを場からトラッシュに置く〉あなたのシグニ1体のパワーを＋3000する（ターン終了時まで）。そして[STUB:引用された能力を付与する（原文参照）]`
   - 一致：実行意味一致。STUB idは指定どおり保持し、内側の実装済み `SET_OPP_SIGNI_POWER_BY_SELF_POWER` が付与されたことまで確認。

### B群

8. `WX09-017-E1`
   - 原文節：`トラッシュに＜鉱石＞のシグニが５枚以上あるかぎり、このシグニの基本パワーは15000になり、このシグニは【ダブルクラッシュ】を得る。`
   - 生成JSON：`{"effectId":"WX09-017-E1","effectType":"CONTINUOUS","activeCondition":{"type":"TRASH_HAS_CARD","owner":"self","filter":{"cardType":"シグニ","story":"鉱石"},"minCount":5},"action":{"type":"SEQUENCE","steps":[{"type":"POWER_SET","target":{"type":"SIGNI","owner":"self","count":1,"filter":{"thisCardOnly":true}},"value":15000},{"type":"GRANT_KEYWORD","target":{"type":"SIGNI","owner":"self","count":1,"filter":{"thisCardOnly":true}},"keyword":"ダブルクラッシュ","duration":"PERMANENT"}]},"duration":"PERMANENT","mandatory":true,"parseStatus":"AUTO"}`
   - 逆翻訳全文：`【常】《あなたのトラッシュに＜鉱石＞のシグニが5枚以上あるかぎり》このシグニの基本パワーを15000にする。そしてこのシグニは【ダブルクラッシュ】を持つ`
   - 一致：一致。条件不成立時は元パワーかつDCなし。

9. `WX09-018-E1`
   - 原文節：`トラッシュにスペルが５枚以上あるかぎり、このシグニの基本パワーは15000になり、このシグニは対戦相手のシグニの効果を受けない。`
   - 生成JSON：`{"effectId":"WX09-018-E1","effectType":"CONTINUOUS","activeCondition":{"type":"TRASH_HAS_CARD","owner":"self","filter":{"cardType":"スペル"},"minCount":5},"action":{"type":"SEQUENCE","steps":[{"type":"POWER_SET","target":{"type":"SIGNI","owner":"self","count":1,"filter":{"thisCardOnly":true}},"value":15000},{"type":"GRANT_PROTECTION","target":{"type":"SIGNI","owner":"self","count":1},"from":["シグニ"],"sourceOwner":"opponent","duration":"PERMANENT"}]},"duration":"PERMANENT","mandatory":true,"parseStatus":"AUTO"}`
   - 逆翻訳全文：`【常】《あなたのトラッシュにスペルが5枚以上あるかぎり》このシグニの基本パワーを15000にする。そしてこのシグニは対戦相手の、シグニの効果を受けない`
   - 一致：一致。条件成立/不成立のパワーと耐性を同時確認。

10. `WX12-037-E1`
   - 原文節：`トラッシュにカードが２５枚以上あるかぎり、このシグニの基本パワーは12000になり、このシグニはバニッシュされない。`
   - 生成JSON：`{"effectId":"WX12-037-E1","effectType":"CONTINUOUS","activeCondition":{"type":"COUNT_THRESHOLD","location":"trash","owner":"self","operator":"gte","value":25},"action":{"type":"SEQUENCE","steps":[{"type":"POWER_SET","target":{"type":"SIGNI","owner":"self","count":1,"filter":{"thisCardOnly":true}},"value":12000},{"type":"GRANT_PROTECTION","target":{"type":"SIGNI","owner":"self","count":1},"from":["BANISH"],"sourceOwner":"any","duration":"PERMANENT"}]},"duration":"PERMANENT","mandatory":true,"parseStatus":"AUTO"}`
   - 逆翻訳全文：`【常】《あなたのトラッシュが25枚以上であるかぎり》このシグニの基本パワーを12000にする。そしてこのシグニは効果によってバニッシュされない`
   - 一致：一致。条件成立/不成立のパワーとBANISH耐性を同時確認。

11. `WX11-053-E1`
   - 原文節：`対戦相手の場に能力を持たないシグニがあるかぎり、このシグニの基本パワーは12000になり、このシグニは「【自】：…手札に戻す。」を得る。`
   - 生成JSON：`{"effectId":"WX11-053-E1","effectType":"CONTINUOUS","activeCondition":{"type":"HAS_CARD_IN_FIELD","owner":"opponent","filter":{"cardType":"シグニ","noAbilities":true}},"action":{"type":"SEQUENCE","steps":[{"type":"POWER_SET","target":{"type":"SIGNI","owner":"self","count":1,"filter":{"thisCardOnly":true}},"value":12000},{"type":"STUB","id":"GRANT_ABILITY_INNER_TEXT"}]},"duration":"PERMANENT","mandatory":true,"parseStatus":"AUTO"}`
   - 逆翻訳全文：`【常】《対戦相手の場に能力を持たないシグニがいるかぎり》このシグニの基本パワーを12000にする。そしてこのカードに記載された継続能力を付与する（テキスト検出型。原文参照）`
   - 一致：実行意味一致。成立時だけ引用AUTO `BOUNCE` がcollectorに現れ、不成立時はパワー・引用とも無し。

12. `WX09-Re07-E1`
   - 原文節：`場に＜アーム＞か＜ウェポン＞のシグニが合計３体あるかぎり、このシグニの基本パワーは10000になり、このシグニは「【自】：対戦相手の効果によってこのシグニが場を離れたとき、…探して場に出し、デッキをシャッフルする。」を得る。`
   - 生成JSON：`{"effectId":"WX09-Re07-E1","effectType":"CONTINUOUS","activeCondition":{"type":"HAS_CARD_IN_FIELD","owner":"self","filter":{"cardType":"シグニ","story":["アーム","ウェポン"]},"minCount":3},"action":{"type":"SEQUENCE","steps":[{"type":"POWER_SET","target":{"type":"SIGNI","owner":"self","count":1,"filter":{"thisCardOnly":true}},"value":10000},{"type":"STUB","id":"GRANT_ABILITY_INNER_TEXT"}]},"duration":"PERMANENT","mandatory":true,"parseStatus":"AUTO"}`
   - 逆翻訳全文：`【常】《あなたの場に＜アーム・ウェポン＞のシグニが3体以上いるかぎり》このシグニの基本パワーを10000にする。そしてこのカードに記載された継続能力を付与する（テキスト検出型。原文参照）`
   - 一致：実行意味一致。旧liveの外側常時 `SEARCH` は消え、成立時だけ `ON_LEAVE_FIELD` 引用AUTOが収集される。条件不成立時は両方無し。

## 4. 見送った効果と理由

- `WD16-014-E1`（B5）：`PowerSetAction` にdurationが無い。`POWER_SET{12000}` だけ足すとAUTO後の設定をターン終了までと型で保証できず、引用付与だけ現行STUBのままという片方固定になるため非採用。goldenで「STUB単独・POWER_SET無し」を契約固定した。
- `WXDi-P10-034-E1`（C1）：調査のみ。`LOOK_PLACE_FACEDOWN_DELAYED.value=5000` は `execStubPart2` で `PLACE_FACEDOWN_SIGNI.value` へ渡り、`pending_facedown_flip.powerBonus` に保存され、`FACEDOWN_FLIP_UP` 解決時に `field_power_mods` へ積まれる。valueは消費済みなので変更なし。
- `WXDi-P15-002-E1`（C2）：`CONDITIONAL_MULTI_CHOOSE_BY_CENTER_LEVEL_GTE` にchoice④が飲まれる別機構。変更なし。
- `WX14-060-E1` / `WX14-061-E1`（生パースoutlier）：今回の一般則でfreshは `SEQUENCE[POWER_SET, GRANT_PROTECTION]` になったが、liveは既に `E1=POWER_SET` / `E2=GRANT_PROTECTION` の2つのMANUAL効果で原文どおり。id集合を変えてまで統合せず非採用。
- D群5効果 `WX24-P2-030-E2` / `WX25-P2-110-E1` / `WXDi-P15-069-E2` / `WXDi-CP02-TK03A-E2` / `WXK03-042-E1`：指定どおり変更0。

## 5. 条件以外で見つけた原文との食い違い

採用12効果のJSON・実行挙動については **0件**。A1の逆翻訳表示だけが `TargetFilter.keyword` を文に出さない既存formatter制約を持つが、live JSONとengineはランサー限定であり挙動差ではない。B6の旧「引用内SEARCHが外側常時SEARCH」は今回同時に修正した。

## 6. ゲート実測

| 指標 | 開始 | 最終 | 結果 |
|---|---:|---:|---|
| `npm run golden` | 2518 / 0 | **2531 / 0** | +13、全緑 |
| `npm run census` | 659 / 659 | **656 / 656** | −3、定数・コメント更新 |
| `npm run smoke` | 10693、異常0、SKIP0 | **10693、異常0、SKIP0** | 据置 |
| `npm run fuzz` | 全0 | **CRASH/HANG/INVARIANT/EXPLOSION 0** | 据置 |
| `npm run lint` | 0 errors / 261 warnings | **0 / 261** | 増減0 |
| `node scripts/groupSimilar.mjs --all` | 同型★0 | **0（265群/5986枚）** | 据置 |
| `npm run census:stubs` | A群無言0 / C群0 | **A無言0 / C0** | 総ノード2879→2880（保持STUB増） |
| `npm run check:manual-fields` | 0 | **0** | parseStatus違反も0 |
| held / partial / idset | 87 / 15 / 46 | **87 / 15 / 46** | 件数据置 |
| manual drift削除候補 | 1 | **1 (`WX10-018-E1`)** | 据置 |
| manualEffectsカード数 | 412 | **412** | 据置 |
| live効果総数 | 10693 | **10693** | 据置 |
| `npm run regen` | — | **成功** | 全10sheet＋下流再生成 |

最終の `npm run gates` は全緑。報告直前に再度 `npm run build:effects` → `node scripts/heldReview.mjs` を順に実行した。

## 7. 全カード生パースdiff（per-effect）

変化集合は **14効果、outlier 2効果**。

- 採用12：`WX08-073-E1`, `WX24-P1-014-E1`, `WX24-P1-078-E1`, `WX25-CP1-064-E1`, `WXDi-P13-061-E1`, `WXDi-P06-059-E1`, `PR-K076-E2`, `WX09-017-E1`, `WX09-018-E1`, `WX12-037-E1`, `WX11-053-E1`, `WX09-Re07-E1`。
- outlier 2：`WX14-060-E1`, `WX14-061-E1`。同根だがliveは既に2効果分割のMANUAL正解なので非採用。
- B5/C/Dは生パーストップレベル差分0。

開始HEADとのcurated live JSON差分は上記採用12効果だけ（WX 6 / WXDi 2 / WX24_26 3 / misc 1）。追加・削除・未説明差分0。

## 8. held / partial / idset とlint warning

- 初回buildでは指定12カードがheldへ加わり **87→99**。全12件を1件ずつ原文照合後 `heldReview --adopt` し、最終 **87** に戻した。
- `_partial_fresh.json`：**15→15**、集合差0。
- `_idset_fresh.json`：**46→46**。集合差0、内容差は `WX14-060/061` の2件だけ（上記outlier）。
- 最終build後の `_held_fresh.json` はHEADと内容差0。`_held_review.txt` も最終87の既存在庫へ戻った。
- lint：**0 errors / 261 warnings**、warning増減0。途中の調査用 `tmp_*` は削除済み。

## 9. parseStatus遷移

**0件**。採用12効果はいずれも `AUTO→AUTO`。MANUAL/PARTIAL化は行っていない。

## 10. 指示書との不一致・補足

1. `sourceAbilityText` / SEQUENCEの見立ては実コードどおり成立した。`sourceEffectId` は保持され、`lastProcessedCards` だけが前段対象へ更新される。
2. B5は指示書の確認ポイントどおり、実コードの `PowerSetAction` にdurationが存在しなかったため据置。
3. A1について「TargetFilter.keyword はfieldCandidatesへ配線済み」は正しいが、`parseSigniTarget` 自体は「【K】を持つ」を抽出しなかった。合成枝で対象句から汎用抽出し、非所持を先頭にするgoldenへ強化した。
4. B6は両方直せた。引用内 `SEARCH` をquote leak safetyで抑え、`POWER_SET`＋同じSTUBへ変更し、collectorで条件つき引用AUTOとして消費した。
5. C1のvalueは未消費ではなく、遅延配置→保留情報→表向き処理の3段で消費済みだった。
6. `WX14-060/061` は母集団外の同根fresh差分だが、liveにPOWER_SETが既にあるため依頼の母集団手順1からは正しく除外される。

## 11. エンコーディング検査

`git diff --name-only` と未追跡の本報告書を合わせた全22ファイルを、HEAD同名ファイル（新規報告書は空ベースライン）と比較した。

- U+FFFD：**0→0**。
- 3文字以上連続する `?` の列：**28→28**。全28列は既存 `docs/BUGFIXES.md` 内で、新規増0。
- 先頭UTF-8 BOM：**0→0**。

したがって3指標とも **新規増0**。`CardData_Sheet8.csv` は未変更で、既存BOMはCSV走査時だけ `.replace(/^\uFEFF/, '')` で除去した。
