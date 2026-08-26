# 意味照合監査 段2 第43バッチ報告 ― 主語・配置の限定が既定値へ倒れる9効果

- ベースライン: `2d363ceb0`
- 実施日: 2026-08-26
- 結論: 群A〜Cの9効果をすべて採用。群Dは調査のみで実装0件。
- 制約順守: commit / push なし、`docs/PLAN.md` / `docs/PLAN_PROGRESS.md` 編集なし、新しい action / Condition / ActiveCondition なし、`manualEffects.ts` へのトップレベル効果追加なし。

## 1. 触ったファイルと理由

| ファイル | 理由 |
|---|---|
| `src/data/parsers/parseSentencePart1.ts` | 相手中央ゾーンのPOWER_MODIFYと、3種の集合主語BANISH耐性を既存フィルタへ配線 |
| `src/data/effectParser.ts` | 登録者数＋中央、手札枚数＋中央、AUTOの中央ゾーン条件を効果レベルへ持ち上げ |
| `src/data/manualEffects.ts` | 正しいfresh条件を上書きしていた古い `WX06-022-E1` shadowを撤去（追加ではない） |
| `public/data/effects_WX.json` | `WX06-022-E1` / `WX14-CB02-E1` / `WX20-081-E1` を採用 |
| `public/data/effects_WXDi.json` | `WXDi-D06-004-E1` / `WXDi-P12-061-E2` / `WXDi-P01-039-E2` を採用 |
| `public/data/effects_WXK.json` | `WXK08-023-E1` / `WXK01-084-E1` を自動純改善採用 |
| `public/data/effects_misc.json` | `SPDi43-14-E1` を採用 |
| `scripts/goldenTest.ts` | 対象9効果に成立／不成立の両方向E2Eを各1本追加 |
| `scripts/vocabCensus.ts` | census実測563→562に合わせ `BASELINE_HIGH` を562へratchet |
| `docs/_held_fresh.json`, `docs/_held_review.txt` | 最終build/heldReviewのfresh・held実測を保存 |
| `docs/_vocab_census.txt`, `docs/_census_stubs.txt` | 最終ゲート実測を保存 |
| `docs/BUGFIXES.md` | 本バッチの真因・修正・ゲートを先頭へ記録 |
| `scripts/archive/scratchpad/semantic_audit_clean_round1/stage2_closed.txt` | 採用した8効果・9 findingをquote前方一致で段2台帳へ追記（findingsに無い `WXDi-P12-061-E2` は不記載） |
| 本報告書 | 指定10項目、実測値、群D結論を保存 |

## 2. 調査結果（対象効果ごとの成立前提）

### 群A

- `SPDi43-14-E1`: `TargetFilter.centerZoneOnly` は `matchesStateFilter` と `fieldCandidates` が消費済み。原文は選択ではなく相手中央の集合修正なので `owner:'opponent' / count:'ALL'` が成立する。既存 `DURING_ATTACK_PHASE(self)` は維持。
- `WXDi-D06-004-E1`: 同上。既存 `AND[LRIG_TEAM_COUNT(DIAGRAM,gte,3), TURN_OWNER(self)]` は生パースでもliveでも維持され、チーム条件を変更していない。

### 群B

- `WX06-022-E1`: `effectParser.ts:1952` のパターン6eは原文に実際に発火し、freshは最初から `AND[LRIG_COLOR(白), IS_SELF_IN_CENTER_ZONE]` を生成していた。発火順やregexの問題ではない。真因は `manualEffects.ts` に残った同一effectIdの古い無条件shadowで、runtimeの `mergeManualEffects` がfresh/liveを上書きしていたこと。shadow撤去で解決し、6e regexは広げていない。
- `WXK08-023-E1`: `ActiveCondition.SUBSCRIBER_COUNT` と `IS_SELF_IN_CENTER_ZONE` はともに `checkActiveCondition` が消費する。閾値は原文から `parseNum` し、100をregexへ埋め込んでいない。
- `WXK01-084-E1`: `Condition.HAND_COUNT` は既存（新設不要）で `evalCondition` が消費する。AUTO collectorが効果全体の `condition` を評価するため、`AND[HAND_COUNT(self,lte,1), THIS_CARD_IN_CENTER_ZONE]` をトップレベルへ持ち上げた。
- `WXDi-P12-061-E2`: `THIS_CARD_IN_CENTER_ZONE` は既存Condition。既存 `TARGET_OPP_SIGNI_OPTIONAL_COLOR_COST` STUBと後続BOUNCEは一字も変えず、効果トップの `condition` だけ追加した。

### 群C

5 collectorを全件確認した。`collectAbilityProtectedSigni` (`effectEngine.ts:3937`, 分岐`:3957`)、`collectDownProtectedSigni` (`:4909/:4934`)、`collectBanishEffectProtectedSigni` (`:5086/:5133`)、`collectBanishBySourceProtectedSigni` (`:5229/:5282`)、`collectEffectImmuneSigni` (`:5502/:5608`) はすべて `subjectFilter` をhonorする。`subjectOwner`、`excludeSelf` 等も各該当経路で評価されるため、CONTINUOUSを `subjectFilter` 化しても保護は消滅しない。

3効果はいずれも `from:['BANISH']` かつ `bySourceType/bySourceLevel` なしなので、実際に拾うのは **`collectBanishEffectProtectedSigni`**。`collectBanishBySourceProtectedSigni` ではない。

- `WX14-CB02-E1`: `{cardType:'シグニ', cardName:'燦'}` の部分一致が `matchesFilter` 規約に合う。`subjectOwner:'self'`。`sourceOwner:'any'` を維持。相手効果・自分効果の両方で《燦》だけがcollector集合に入り、非一致シグニは実BANISHされた。
- `WX20-081-E1`: `{cardType:'レゾナ'}` と `subjectOwner:'self'` が成立。相手効果ではレゾナだけを守り、自分効果では守らない。
- `WXDi-P01-039-E2`: `{cardType:'シグニ', level:1}` と `subjectOwner:'self'` が成立。既存 `TURN_OWNER(self)` を維持し、自ターンだけLv1全体が保護される。

## 3. 採用した効果の全件

全9効果とも `parseStatus:'AUTO'`。以下の逆翻訳は `npx tsx scripts/decompileEffects.ts <9 cards>` のlive実測全文（当該effect行）。標準メタデータ `duration/mandatory/parseStatus` は生成JSON欄では省略したが、liveでは従来値を維持している。

| effectId | 原文の該当節 | 生成JSON（主要木・完全） | 逆翻訳文全体 | 一致 |
|---|---|---|---|---|
| `SPDi43-14-E1` | あなたのアタックフェイズの間、対戦相手の中央のシグニゾーンにあるシグニのパワーを－5000する | `{"effectType":"CONTINUOUS","activeCondition":{"type":"DURING_ATTACK_PHASE","owner":"self"},"action":{"type":"POWER_MODIFY","target":{"type":"SIGNI","owner":"opponent","count":"ALL","filter":{"cardType":"シグニ","centerZoneOnly":true}},"delta":-5000}}` | `【常】《あなたのアタックフェイズの間》対戦相手のすべての中央ゾーンのシグニのパワーを－5000する` | 一致 |
| `WXDi-D06-004-E1` | 【チーム常】：あなたのターンの間、対戦相手の中央のシグニゾーンにあるシグニのパワーを－2000する | `{"effectType":"CONTINUOUS","activeCondition":{"type":"AND","conditions":[{"type":"LRIG_TEAM_COUNT","owner":"self","team":"DIAGRAM","operator":"gte","value":3},{"type":"TURN_OWNER","owner":"self"}]},"action":{"type":"POWER_MODIFY","target":{"type":"SIGNI","owner":"opponent","count":"ALL","filter":{"cardType":"シグニ","centerZoneOnly":true}},"delta":-2000}}` | `【常】《あなたの場に＜DIAGRAM＞のルリグが3体以上かつ自分のターンの間》対戦相手のすべての中央ゾーンのシグニのパワーを－2000する` | 一致（チーム条件も維持） |
| `WX06-022-E1` | センタールリグが白で、このシグニが中央のシグニゾーンにあるかぎり、基本パワー10000＋相手効果バニッシュ耐性 | `{"effectType":"CONTINUOUS","activeCondition":{"type":"AND","conditions":[{"type":"LRIG_COLOR","owner":"self","color":"白"},{"type":"IS_SELF_IN_CENTER_ZONE"}]},"action":{"type":"SEQUENCE","steps":[{"type":"POWER_SET","target":{"type":"SIGNI","owner":"self","count":1,"filter":{"thisCardOnly":true}},"value":10000},{"type":"GRANT_PROTECTION","target":{"type":"SIGNI","owner":"self","count":1},"from":["BANISH"],"sourceOwner":"opponent","duration":"PERMANENT"}]}}` | `【常】《あなたのセンタールリグが白かつこのシグニが中央ゾーンにあるかぎり》このシグニの基本パワーを10000にする。そしてこのシグニは対戦相手の効果によってバニッシュされない` | 一致 |
| `WXK08-023-E1` | 登録者数が１００万人を達成していて、このシグニが中央にあるかぎり、あなたのターン中バニッシュされない能力を得る | `{"effectType":"CONTINUOUS","activeCondition":{"type":"AND","conditions":[{"type":"SUBSCRIBER_COUNT","operator":"gte","value":100},{"type":"IS_SELF_IN_CENTER_ZONE"}]},"action":{"type":"GRANT_FIELD_SIGNI_ABILITY","thisCardOnly":true,"abilities":[{"effectId":"WXK08-023-E1-G","effectType":"CONTINUOUS","activeCondition":{"type":"TURN_OWNER","owner":"self"},"action":{"type":"GRANT_PROTECTION","target":{"type":"SIGNI","owner":"self","count":1},"from":["BANISH"],"sourceOwner":"any","duration":"PERMANENT"}}]}}` | `【常】《登録者数が100万以上かつこのシグニが中央ゾーンにあるかぎり》このシグニは『【常】《自分のターンの間》このシグニは効果によってバニッシュされない』を得る` | 一致 |
| `WXK01-084-E1` | ターン終了時、手札が１枚以下でこのシグニが中央にある場合、1枚引く | `{"effectType":"AUTO","timing":["ON_TURN_END"],"condition":{"type":"AND","conditions":[{"type":"HAND_COUNT","owner":"self","operator":"lte","value":1},{"type":"THIS_CARD_IN_CENTER_ZONE"}]},"action":{"type":"DRAW","owner":"self","count":1}}` | `【自】ターン終了時：あなたの手札が1枚以下であるかつこのシグニが中央ゾーンにある場合、あなたのカードを1枚引く` | 一致 |
| `WXDi-P12-061-E2` | アタックフェイズ開始時、このシグニが中央にある場合、相手シグニを対象とし白白無を任意支払い、そうした場合バウンス | `{"effectType":"AUTO","timing":["ON_ATTACK_PHASE_START"],"condition":{"type":"THIS_CARD_IN_CENTER_ZONE"},"action":{"type":"SEQUENCE","steps":[{"type":"STUB","id":"TARGET_OPP_SIGNI_OPTIONAL_COLOR_COST","costColors":["白","白","無"]},{"type":"CONDITIONAL","condition":{"type":"IS_MY_TURN"},"then":{"type":"BOUNCE","target":{"type":"SIGNI","owner":"opponent","count":1,"upToCount":false,"filter":{"cardType":"シグニ"}},"optional":false}}]}}` | `【自】あなたのアタックフェイズ開始時：このシグニが中央ゾーンにある場合、対戦相手のシグニ１体を対象とし、《白》《白》《無》を支払ってもよい。そうした場合、対戦相手のシグニ1体を手札に戻す` | 一致（既存STUBの近似範囲は不変） |
| `WX14-CB02-E1` | あなたの《燦》はバニッシュされない | `{"effectType":"CONTINUOUS","action":{"type":"GRANT_PROTECTION","subjectFilter":{"cardType":"シグニ","cardName":"燦"},"subjectOwner":"self","from":["BANISH"],"sourceOwner":"any","duration":"PERMANENT"}}` | `【常】あなたの《燦》シグニは効果によってバニッシュされない` | 一致（`from:BANISH/sourceOwner:any` の既存engine慣例。逆翻訳の「効果によって」はdecompilerの定型表現） |
| `WX20-081-E1` | あなたのレゾナは対戦相手の効果によってバニッシュされない | `{"effectType":"CONTINUOUS","action":{"type":"GRANT_PROTECTION","subjectFilter":{"cardType":"レゾナ"},"subjectOwner":"self","from":["BANISH"],"sourceOwner":"opponent","duration":"PERMANENT"}}` | `【常】あなたのレゾナは対戦相手の効果によってバニッシュされない` | 一致 |
| `WXDi-P01-039-E2` | あなたのターンの間、対戦相手の効果によってあなたのレベル１のシグニはバニッシュされない | `{"effectType":"CONTINUOUS","activeCondition":{"type":"TURN_OWNER","owner":"self"},"action":{"type":"GRANT_PROTECTION","subjectFilter":{"cardType":"シグニ","level":1},"subjectOwner":"self","from":["BANISH"],"sourceOwner":"opponent","duration":"PERMANENT"}}` | `【常】《自分のターンの間》あなたのレベル1のシグニは対戦相手の効果によってバニッシュされない` | 一致 |

## 4. 見送った効果

群A〜Cの対象9効果は見送り0件。群Dは依頼どおり全件を調査だけに留め、実装していない（結論は§9）。

## 5. 条件以外で見つけた原文との食い違い

**0件**。対象effect単位で全文逆翻訳を照合した。対象カードの別effectに既存の近似/STUBがあっても、本バッチの変更集合には含めていない。

## 6. ゲート数値

`npm run gates`（フィルタなしgoldenを含む）全緑。

| ゲート | 実測 | baseline差 |
|---|---:|---:|
| golden | **PASS 2854 / FAIL 0** | 2845→2854（対象9本追加） |
| census | **562 / baseline 562** | 563→562、`BASELINE_HIGH`更新 |
| census:stubs | **無言no-op 0 / A群🔴0 / C群0** | 0維持 |
| census:enginetext | **A🔴 SELF_TEXT 141行 / 137ハンドラ** | 不変 |
| smoke | **10696/10696、CRASH/HANG/INVARIANT 0/0/0** | 異常0維持 |
| fuzz | **CRASH/HANG/INVARIANT/EXPLOSION 0/0/0/0** | 全0維持 |
| lint | **0 errors / 263 warnings** | warnings ±0 |
| manual-fields | **field loss 0 / parseStatus違反 0** | 0/0維持 |

## 7. 生パースdiffの変化集合とoutlier

変更前buildは純改善1 / held 75、parser変更後・採用前は純改善4 / held 81。増分は次の9効果だけだった。

- 自動純改善3: `WXK08-023-E1`, `WXK01-084-E1`, `WXDi-P12-061-E2`
- held増分6: `SPDi43-14-E1`, `WXDi-D06-004-E1`, `WX06-022-E1`, `WX14-CB02-E1`, `WX20-081-E1`, `WXDi-P01-039-E2`

採用後にHEADのlive JSONと現在live JSONをeffect単位で全5ファイル比較した結果も **変更9効果 / outlier 0**。同じカードの別effectは0件変更だった。

## 8. heldバケット・parser worklist・lintの増減

- 投入前: 純改善1 / held 75 / manual温存422 / partial fallback 43 / id集合ズレ43。
- parser変更後・採用前: 純改善4（+3、上記3件）/ held 81（+6、上記6件）。増分9件を1件ずつ原文全文と逆翻訳で照合し、すべて採用可能と判定。
- 採用後、報告直前の再実測: **新規0 / 純改善1 / 効果単位0 / manual温存422 / held 75 / fresh空2 / parseStatus差206 / partial fallback 43 / id集合ズレ43**。対象9カードは held / partial / idset のいずれにも残っていない。
- heldカード集合は最終的に投入前と同一（75→81→75）。parser worklist相当の partial 43 / idset 43も投入前から増分0。
- lint warning: **263→263（±0）**。

台帳は指定quoteを `findings.jsonl` の前方一致として記入。内訳の投入前→投入後は次のとおり。

- findings総数: 1444→1444
- 段0: 221→221
- 段1: 111→111
- 段2: **435→444（+9 finding）**
- OPEN: **677→668**（HIGH 472→463 / MED 201→201 / LOW 4→4、影響カード506→501、効果535→527）

`WXDi-D06-004-E1` の別finding「【チーム常】」は既に正しいため、中央ゾーンquoteだけを閉じ、別findingはコメントして閉じていない。`WXDi-P12-061-E2` はfindingsに無いため台帳へ書いていない。

## 9. 群Dの調査結論

依頼表の4件まとまりをカードごとに展開すると7カード。すべて実装0件。

| カード | 結論 | 根拠 |
|---|---|---|
| `WXDi-P03-087` | **既存受け皿あり。ただしparser優先順位で未到達** | dispatchは Part1→2→3 (`effectParser.ts:5271-5273`)。Part1の汎用トラッシュ→場 (`parseSentencePart1.ts:3226`, return `:3259`) が先に `ADD_TO_FIELD` を返すため、Part3の中央専用 `FROM_TRASH_TO_CENTER_ZONE` (`parseSentencePart3.ts:755-757`) に届かない。専用engineは `execStubPart2.ts:2044-2064` に実在しzone[1]へ置く。一方 `AddToFieldAction` (`effects.ts:1413-1432`) に固定行先フィールドはなく、汎用executorは最初の空き (`effectExecutor.ts:3117-3121`) へ置く。次バッチは優先順位側で直せる候補。 |
| `WXEX2-79` | **既存受け皿あり、liveも既に機能表現済み** | Part2が `PLACE_VIRUS_CENTER` (`parseSentencePart2.ts:973-975`) を生成し、engineが相手 `signi_virus[1]` を1にする (`execStubPart2.ts:2240-2249`)。明示filterが無いのはSTUB ID自体が中央配置を表す慣例で、現状は欠落ではない。 |
| `WXK10-011` ③ | **既存受け皿あり、live配線済み** | `SIGNI_ATTACK_BAN{zones:[1],turns:2}`。静的ゾーン型は `effects.ts:2418-2422`、実行時state格納は `effectExecutor.ts:8296-8302,8334`、判定時に現在ゾーンを引くのは `signiAttackBan.ts:20-31`、attack gateは `signiAttackGate.ts:167-174`。 |
| `WXDi-P03-027` | **既存受け皿あり、live配線済み** | 引用能力の平坦化規則 `effectParser.ts:11363-11375` が `SIGNI_ATTACK_BAN{zones:[1],turns:2}` を生成。消費地点は上記と同じ。 |
| `WX24-P1-038` | **既存受け皿あり、live配線済み** | 同じ引用能力平坦化規則 `effectParser.ts:11363-11375`。消費地点は上記と同じ。 |
| `WX25-CP1-050` | **既存受け皿あり、live配線済み** | 直接文型規則 `parseSentencePart3.ts:1467-1485` が `zones:[1]` と `unlessPayColorless:1` と期間を生成。消費地点は上記と同じ。 |
| `WXDi-P14-068` | **既存受け皿あり。ただし通常の人間召喚UIだけの部分配線** | parserは `OPP_ZONE_PLACEMENT_RESTRICT` (`parseSentencePart3.ts:409-411`)。collectorはCONTINUOUSを走査してLv3を返す (`effectEngine.ts:6610-6633`)。通常召喚は中央index 1かつLv3+を拒否 (`BattleScreen.tsx:5942-5946`)。呼び出しはこの1箇所だけで、CPU配置・効果配置には同collectorが未配線。既存受け皿はあるが全配置経路を覆っていないため次バッチで要判断。 |

## 10. やらなかったこと

- commit / pushをしていない。
- `docs/PLAN.md` / `docs/PLAN_PROGRESS.md` を編集していない。
- 群Dを実装していない。
- 新しいaction型、Condition、ActiveCondition、TargetFilterフィールドを作っていない。
- `manualEffects.ts` に新しいトップレベル効果を足していない。逆に、正しいAUTOを隠していた既存shadow 1件だけ撤去した。
- `buildEffectsJson.ts` にforce-adoptを入れていない。
- `stripRuleParens` / 全角括弧問題、スコープ外37件の正しい単体保護、他カード・他effectを変更していない。
- `WXDi-P12-061-E2` の既存STUBを実装・改変していない。
- 群AのactiveCondition、群CのsourceOwner、`WXDi-P01-039-E2` のTURN_OWNERを変えていない。

## 追加ガードレール確認

- §5-22: `effectEngine.ts` blob SHA-1はHEAD/WORKTREEとも `e8a8f56d04f24e5f17023641a52398fd9c57aaf8`、`execUtils.ts` はともに `a1c275fb2d9762ff37a48209c41b04f7548409bf`。5 collectorと既存消費関数は未変更。`git diff --unified=0 scripts/goldenTest.ts` は結果出力直前への152行追加だけで、既存golden行の変更0。
- §5-19: 最終 `git diff --name-only` 全ファイルをHEAD比で検査し、U+FFFD、3文字以上連続`?`、先頭BOMの新規増はいずれも0。
- temporary inspection scriptsはgitignore圏内でのみ使用し、成果物として残していない。
