# §6.2 段2 第27バッチ報告

実施日: 2026-08-23  
開始HEAD: `06c0c1efe0d74f9b5a59ab99f94d244c886e5a00`（開始時 `git status --porcelain` は空）  
結論: A群10効果・B群4効果の全14効果を採用。見送り0。C群・D群は変更していない。commit/push、`docs/PLAN.md`、`docs/PLAN_PROGRESS.md` は触っていない。

## 1. 触ったファイルと理由

- `src/data/parsers/parseSentencePart1.ts`: 能動連用中止形を既存付与枝へ合成。A10/B3/B4の複合形、チャーム対象、ドライブ集合代名詞、B1/B2の保護付与も文型で構造化。
- `src/data/effectParser.ts`: 明示的な「N体を対象とし」がある ON_ZONE_MOVED 効果をトリガー元へ誤束縛しないガード。
- `src/types/effects.ts`: 既存対象の再利用用に `GrantProtectionAction` / `RemoveAbilitiesAction.targetsLastProcessed` を追加（action type の新設なし）。
- `src/engine/effectExecutor.ts`: 上記2 action が `lastProcessedCards` を実際に消費する経路を追加。
- `src/engine/effectEngine.ts`: CONTINUOUS `SEQUENCE` 内の `GRANT_KEYWORD` を収集し、`matchesStateFilter` まで通して `isDrive` を実消費。
- `scripts/goldenTest.ts`: 採用14効果それぞれの engine E2E。実効パワー＋後段付与、対象外、期間境界を両方向固定。
- `scripts/vocabCensus.ts`: 改善実測 693→682 に合わせ `BASELINE_HIGH=682` と今回の説明へ更新。
- `public/data/effects_WX.json` / `effects_WXDi.json` / `effects_WX24_26.json` / `effects_WXK.json` / `effects_misc.json`: 14効果の生成結果を採用。
- `docs/decompile_sheet2.txt` / `3.txt` / `5.txt` / `7.txt` / `9.txt` / `10.txt`、`docs/grouped_sentence_all.txt`: `npm run regen` の生成物。
- `docs/_held_fresh.json` / `_held_review.txt` / `_vocab_census.txt` / `_census_stubs.txt` / `_manual_drift.txt`: 最終計器の生成物。
- `docs/BUGFIXES.md`: 今回の修正・非採用outlier・ゲート値を先頭へ記録。
- 本報告書: 指定の恒久レポート。

`docs/PLAN.md` と `docs/PLAN_PROGRESS.md` は禁止指定どおり未編集。

## 2. A群10・B群4の成立前提調査

| 群 | effectId | 成立前提と判定 |
|---|---|---|
| A1 | `WX24-D4-04-E1` | 単体 `POWER_MODIFY` が選択結果を `lastProcessedCards` に残し、後段ランサーが再利用可能。成立。 |
| A2 | `SPDi47-04-E2` | `count:'ALL'` は選択不要。両actionが同一の全自シグニ・`UNTIL_OPP_TURN_END`。成立。 |
| A3 | `WX24-P4-020-E3` | A2同様。先行 `RECOLLECT_GATE` を維持したまま同一集合へ2action。成立。 |
| A4 | `WXK01-001-E1` | CONTINUOUS は executor 非経由。`calcFieldPowers` は `applyDeltaToState` から `matchesFilter` と `matchesStateFilter` を通るため `isDrive` が届く。付与collectorには SEQUENCE/state-filter 配線が不足していたので同時配線後に成立。 |
| A5 | `WXK07-077-E1` | 先頭【チャーム】は付与語でなく対象状態。`hasCharm:true` を同一targetに載せ、選択結果を後段へ再利用。成立。 |
| A6 | `WXK07-028-E1` c0 | 原文は所有者無指定なので `owner:'any'` を維持。同一選択結果へランサー。成立。 |
| A7 | `WDK08-Y17-E1` | 既存 REVEAL→did-it CONDITIONAL の `then` 内を2step化。`thisCardOnly` なので再選択不要。成立。 |
| A8 | `WXDi-P06-038-E2` | `thisCardOnly` と2つの `UNTIL_OPP_TURN_END` store が既存実装。成立。 |
| A9 | `WX25-CP1-078-E1` | `story/color/excludeSelf` を同一targetへ複製し、選択結果を後段へ再利用。成立。 |
| A10 | `WX21-020-E1` c2 | 既存action 3本で完全表現可能。原文が同一名詞句を3回明示するので `targetsLastProcessed` を付けず3回独立選択。engineで3体を別々に選ぶE2Eが通る。成立。 |
| B1 | `WX16-Re09-E1` | `GRANT_PROTECTION` に選択結果再利用を追加。`duration` も原文どおり `UNTIL_END_OF_TURN` に是正。成立。 |
| B2 | `WXK03-042-E2` | B1同様。ON_ZONE_MOVED の既存後処理が前半PMだけを発生源へ誤束縛したため、「を対象とし」がある場合を除外して成立。 |
| B3 | `WXDi-P02-055-E1` | owner self、PM、REMOVE_ABILITIES、シャドウ、引用常アタック不可を既存4actionで完全表現。後3本が最初の選択を再利用し、全て `UNTIL_OPP_TURN_END`。成立。 |
| B4 | `WX25-P3-054-E1` | `frontOfSelf` は型・候補抽出・executorに既存。自身PMと正面相手REMOVE_ABILITIESの両方を正しく実行可能。成立。 |

## 3. 採用14効果の原文・生成JSON・逆翻訳

### A1 `WX24-D4-04-E1`

- 原文節: `ターン終了時まで、それのパワーを＋3000し、それは【ランサー】を得る。`
- 生成JSON: `SEQUENCE[POWER_MODIFY{target:{SIGNI,self,1},delta:3000,duration:UNTIL_END_OF_TURN}, GRANT_KEYWORD{target:{SIGNI,self,1},keyword:ランサー,duration:UNTIL_END_OF_TURN,targetsLastProcessed:true}]`
- 逆翻訳全文: `【起】（メイン起動）：《once_per_turn》〈《緑×1》＋手札から《緑》のシグニ1枚を捨てる〉あなたのシグニ1体のパワーを＋3000する（ターン終了時まで）。そしてそれは【ランサー】を得る（ターン終了時まで）`
- 一致: 一致。

### A2 `SPDi47-04-E2`

- 原文節: `次の対戦相手のターン終了時まで、あなたのすべてのシグニのパワーを＋10000し、それらは【シャドウ（パワー10000以下のシグニ）】を得る。`
- 生成JSON: `SEQUENCE[RECOLLECT_GATE{minArts:4},ADD_TO_FIELD{ENERGY_CARD,self,3,upTo},SEQUENCE[POWER_MODIFY{SIGNI,self,ALL,+10000,UNTIL_OPP_TURN_END},GRANT_KEYWORD{SIGNI,self,ALL,シャドウ:{powerLte:10000},UNTIL_OPP_TURN_END}]]`
- 逆翻訳全文: `【起】（メイン起動）：《once_per_game》〈《緑×0》〉（リコレクト：ルリグトラッシュのアーツが4枚以上ある場合のみ以下を行う）。そしてあなたのシグニ(エナ)3枚までをコストを支払わずに場に出す。そしてあなたのすべてのシグニのパワーを＋10000する（次の相手ターン終了時まで）。そしてあなたのすべてのシグニに【シャドウ:{"powerLte":10000}】を与える（次の相手ターン終了時まで）`
- 一致: 一致。

### A3 `WX24-P4-020-E3`

- 原文節: `次の対戦相手のターン終了時まで、あなたのすべてのシグニのパワーを＋5000し、それらは【シャドウ（パワーがこのシグニのパワーの半分以下のシグニ）】を得る。`
- 生成JSON: `SEQUENCE[RECOLLECT_GATE{minArts:4},POWER_MODIFY{SIGNI,self,ALL,+5000,UNTIL_OPP_TURN_END},GRANT_KEYWORD{SIGNI,self,ALL,シャドウ:{selfPowerHalfLte:true,cardType:シグニ},UNTIL_OPP_TURN_END}]`
- 逆翻訳全文: `【起】（メイン起動）：《once_per_game》〈《緑×0》〉（リコレクト：ルリグトラッシュのアーツが4枚以上ある場合のみ以下を行う）。そしてあなたのすべてのシグニのパワーを＋5000する（次の相手ターン終了時まで）。そしてあなたのすべてのシグニに【シャドウ:{"selfPowerHalfLte":true,"cardType":"シグニ"}】を与える（次の相手ターン終了時まで）`
- 一致: 一致。

### A4 `WXK01-001-E1`

- 原文節: `あなたのドライブ状態のシグニのパワーを＋3000し、それらは【ダブルクラッシュ】を得る。`
- 生成JSON: `SEQUENCE[POWER_MODIFY{target:{SIGNI,self,ALL,filter:{cardType:シグニ,isDrive:true}},delta:3000,duration:PERMANENT},GRANT_KEYWORD{同target,keyword:ダブルクラッシュ,duration:PERMANENT}]`
- 逆翻訳全文: `【常】あなたのすべてのドライブ状態のシグニのパワーを＋3000する。そしてあなたのすべてのドライブ状態のシグニに【ダブルクラッシュ】を与える`
- 一致: 一致。「すべて」は集合主語の意味の明示。

### A5 `WXK07-077-E1`

- 原文節: `【チャーム】が付いているあなたのシグニ１体を対象とし、ターン終了時まで、それのパワーを＋1000し、それは【ランサー】を得る。`
- 生成JSON: `SEQUENCE[POWER_MODIFY{target:{SIGNI,self,1,filter:{cardType:シグニ,hasCharm:true}},delta:1000,UNTIL_END_OF_TURN},GRANT_KEYWORD{同target,ランサー,UNTIL_END_OF_TURN,targetsLastProcessed:true}]`
- 逆翻訳全文: `【自】このシグニが場に出たとき：あなたのチャームのあるシグニ1体のパワーを＋1000する（ターン終了時まで）。そしてそれは【ランサー】を得る（ターン終了時まで）`
- 一致: 一致。

### A6 `WXK07-028-E1` choice c0

- 原文節: `シグニ１体を対象とし、ターン終了時まで、それのパワーを＋3000し、それは【ランサー】を得る。`
- 生成JSON: `CHOOSE.c0=SEQUENCE[POWER_MODIFY{target:{SIGNI,any,1},delta:3000,UNTIL_END_OF_TURN},GRANT_KEYWORD{同target,ランサー,UNTIL_END_OF_TURN,targetsLastProcessed:true}]`
- 逆翻訳全文: `【自】あなたのアタックフェイズ開始時：以下の3つから1つを選ぶ【自分または対戦相手のシグニ1体のパワーを＋3000する（ターン終了時まで）。そしてそれは【ランサー】を得る（ターン終了時まで） / あなたのシグニ1体に【バニッシュされない】を与える（ターン終了時まで） / 対戦相手のシグニ1体をバニッシュする】`
- 一致: 一致。owner無指定を `any` のまま維持。

### A7 `WDK08-Y17-E1`

- 原文節: `そうした場合、ターン終了時まで、このシグニのパワーを＋1000し、このシグニは【ランサー】を得る。`
- 生成JSON: `SEQUENCE[REVEAL{HAND_CARD,self,3,filter:{cardType:シグニ,story:水獣}},CONDITIONAL{IS_MY_TURN→SEQUENCE[POWER_MODIFY{thisCardOnly,+1000,UNTIL_END_OF_TURN},GRANT_KEYWORD{thisCardOnly,ランサー,UNTIL_END_OF_TURN}]}]`
- 逆翻訳全文: `【自】このシグニが場に出たとき：〈《緑×1》〉あなたの手札から＜水獣＞のシグニ3枚を公開する。そうした場合、このシグニのパワーを＋1000する（ターン終了時まで）。そしてこのシグニは【ランサー】を持つ（ターン終了時まで）`
- 一致: 一致。

### A8 `WXDi-P06-038-E2`

- 原文節: `次の対戦相手のターン終了時まで、このシグニのパワーを＋2000し、このシグニは【シャドウ（レベル３以上のシグニ）】を得る。`
- 生成JSON: `SEQUENCE[POWER_MODIFY{thisCardOnly,+2000,UNTIL_OPP_TURN_END},GRANT_KEYWORD{thisCardOnly,シャドウ:{levelGte:3},UNTIL_OPP_TURN_END}]`
- 逆翻訳全文: `【自】このシグニが場に出たとき：〈《白×1》〉このシグニのパワーを＋2000する（次の相手ターン終了時まで）。そしてこのシグニは【シャドウ:{"levelGte":3}】を持つ（次の相手ターン終了時まで）`
- 一致: 一致。

### A9 `WX25-CP1-078-E1`

- 原文節: `あなたの他の緑の＜ブルアカ＞のシグニ１体を対象とし、ターン終了時まで、それのパワーを＋3000し、それは【シャドウ（レベル３以上のシグニ）】を得る。`
- 生成JSON: `SEQUENCE[POWER_MODIFY{target:{SIGNI,self,1,filter:{cardType:シグニ,story:ブルアカ,color:緑,excludeSelf:true}},+3000,UNTIL_END_OF_TURN},GRANT_KEYWORD{同target,シャドウ:{levelGte:3},UNTIL_END_OF_TURN,targetsLastProcessed:true}]`
- 逆翻訳全文: `【自】あなたのアタックフェイズ開始時：あなたの他の《緑》の＜ブルアカ＞のシグニ1体のパワーを＋3000する（ターン終了時まで）。そしてそれは【シャドウ:{"levelGte":3}】を得る（ターン終了時まで）`
- 一致: 一致。

### A10 `WX21-020-E1` choice c2

- 原文節: `対象のあなたの＜天使＞のシグニ１体のパワーを＋5000し、対象のあなたの＜天使＞のシグニ１体は【ランサー】を得、対象のあなたの＜天使＞のシグニ１体は【ダブルクラッシュ】を得る。（同じシグニを選ぶこともできる）`
- 生成JSON: `CHOOSE.c2=SEQUENCE[POWER_MODIFY{SIGNI,self,1,story:天使,+5000,UNTIL_END_OF_TURN},GRANT_KEYWORD{SIGNI,self,1,story:天使,ランサー,UNTIL_END_OF_TURN},GRANT_KEYWORD{SIGNI,self,1,story:天使,ダブルクラッシュ,UNTIL_END_OF_TURN}]`（束縛フラグなし＝3回独立選択）
- 逆翻訳全文: `【起】（メイン起動）/（アタックフェイズ起動）：〈《赤×1》《青×1》《緑×1》〉以下の3つから1つを選ぶ【あなたのデッキの上から6枚をエナゾーンに置く / 対戦相手のシグニ1体をバニッシュする。そして対戦相手のシグニ1体をダウンする。そしてあなたのカードを1枚引く / あなたの＜天使＞のシグニ1体のパワーを＋5000する（ターン終了時まで）。そしてあなたの＜天使＞のシグニ1体に【ランサー】を与える（ターン終了時まで）。そしてあなたの＜天使＞のシグニ1体に【ダブルクラッシュ】を与える（ターン終了時まで）】`
- 一致: 一致。E2Eでは3体を別々に選び、それぞれに別leafが乗ることを確認。

### B1 `WX16-Re09-E1`

- 原文節: `あなたのシグニ１体を対象とし、ターン終了時まで、それのパワーを＋3000し、それは「【常】：対戦相手のターンの間、このシグニは対戦相手の効果を受けない。」を得る。`
- 生成JSON: `SEQUENCE[POWER_MODIFY{SIGNI,self,1,+3000,UNTIL_END_OF_TURN},GRANT_PROTECTION{同target,from:[any],sourceOwner:opponent,duration:UNTIL_END_OF_TURN,targetsLastProcessed:true}]`
- 逆翻訳全文: `【起】（アタックフェイズ起動）/スペルカットイン：〈《緑×1》〉あなたのシグニ1体のパワーを＋3000する（ターン終了時まで）。そしてあなたのシグニ1体は対戦相手の効果を受けない`
- 一致: JSON/実行意味は一致。逆翻訳は保護側の期間表示を省略する既存表示上の不足あり（JSONは `UNTIL_END_OF_TURN`）。

### B2 `WXK03-042-E2`

- 原文節: `あなたのシグニ１体を対象とし、ターン終了時まで、それのパワーを＋2000し、それは「【常】：このシグニは対戦相手のシグニの効果を受けない。」を得る。`
- 生成JSON: `SEQUENCE[POWER_MODIFY{SIGNI,self,1,+2000,UNTIL_END_OF_TURN},GRANT_PROTECTION{同target,from:[シグニ],sourceOwner:opponent,duration:UNTIL_END_OF_TURN,targetsLastProcessed:true}]`
- 逆翻訳全文: `【自】このシグニが効果によって他のシグニゾーンに移動したとき：《once_per_turn》あなたのシグニ1体のパワーを＋2000する（ターン終了時まで）。そしてあなたのシグニ1体は対戦相手の、シグニの効果を受けない`
- 一致: JSON/実行意味は一致。B1同様、逆翻訳の保護期間だけ表示省略。

### B3 `WXDi-P02-055-E1`

- 原文節: `あなたのシグニ１体を対象とし、次の対戦相手のターン終了時まで、それのパワーを＋5000し、それは能力を失い、【シャドウ】と「【常】：アタックできない。」を得る。`
- 生成JSON: `SEQUENCE[POWER_MODIFY{SIGNI,self,1,+5000,UNTIL_OPP_TURN_END},REMOVE_ABILITIES{同target,targetsLastProcessed:true,until:UNTIL_OPP_TURN_END},GRANT_KEYWORD{同target,targetsLastProcessed:true,シャドウ,UNTIL_OPP_TURN_END},GRANT_KEYWORD{同target,targetsLastProcessed:true,アタックできない,UNTIL_OPP_TURN_END}]`
- 逆翻訳全文: `【起】（メイン起動）：〈《白×1》〉あなたのシグニ1体のパワーを＋5000する（次の相手ターン終了時まで）。そしてあなたのシグニ1体は能力を失い、新たに得られない（次の対戦相手のターン終了時まで）。そしてそれは【シャドウ】を得る（次の相手ターン終了時まで）。そしてそれは【アタックできない】を得る（次の相手ターン終了時まで）`
- 一致: 一致。owner は self、相手側は無変更をE2E確認。

### B4 `WX25-P3-054-E1`

- 原文節: `各アタックフェイズ開始時、ターン終了時まで、このシグニのパワーを＋3000し、このシグニの正面のシグニゾーンにあるシグニは能力を失う。`
- 生成JSON: `SEQUENCE[POWER_MODIFY{target:{SIGNI,self,1,filter:{thisCardOnly:true}},+3000,UNTIL_END_OF_TURN},REMOVE_ABILITIES{target:{SIGNI,opponent,1,filter:{cardType:シグニ,frontOfSelf:true}},until:UNTIL_END_OF_TURN}]`
- 逆翻訳全文: `【自】各アタックフェイズ開始時：このシグニのパワーを＋3000する（ターン終了時まで）。そしてこのシグニの正面のシグニは能力を失い、新たに得られない（ターン終了時まで）`
- 一致: 一致。

## 4. 見送った効果

指定A/B群の見送りは **0件**。

スコープ外として明示的に非採用:

- C群 `WX08-073-E1` / `WX24-P1-014-E1` / `WX24-P1-078-E1` / `WXDi-P06-059-E1` c1: `STUB{GRANT_ABILITY_INNER_TEXT}` のまま。
- C群 `PR-K076-E2`: `STUB{GRANT_QUOTED_AUTO_ABILITY}` のまま。
- C群 `WX26-CP1-024-E1`: 2 STUB のまま。
- C群 `WXDi-P04-079-BURST`: CHOOSE欠落の別バグなので不変更。
- C群 `WXK04-030-E1` / `WX25-P3-007-E1`: `parseStatus:'MANUAL'` のまま。
- D群 `WX10-077-E1`: `POWER_MULTIPLY{multiplier:2}` のまま。
- 新規outlier `WXDi-CP02-092-E2`: 同じ文型で fresh は `POWER_MODIFY{thisCardOnly,+10000} + GRANT_KEYWORD{Sランサー}` になるが、指定母集団外なので live へ採用せず held に残した。

## 5. 条件以外で見つけた原文との食い違い

1件。`WXDi-CP02-092-E2` は原文「このシグニのパワーを＋10000し、このシグニは【Sランサー】を得る」に対し live は後段だけ。同じ根だが、母集団のカード単位「原文POWER_MODIFY数 > live POWER_MODIFY数」では兄弟効果のPOWER_MODIFYが個数を相殺して漏れた。今回は非採用。

逆翻訳表示上は B1/B2 の `GRANT_PROTECTION.duration` が全文に印字されない既存不足も確認したが、JSONとengine期間は正しい。

## 6. ゲート実測

| 指標 | 最終値 | 判定 |
|---|---:|---|
| `npm run golden` | 2492 PASS / 0 FAIL（+14） | 緑 |
| `npm run census` | 682 / BASELINE_HIGH 682（693→682） | 緑、値とコメント更新 |
| `npm run smoke` | 10693 OK / CRASH 0 / HANG 0 / INVARIANT 0 / SKIP 0 | 緑 |
| `npm run fuzz` | 200ゲーム、全不具合0、SKIP 0 | 緑 |
| `npm run lint` | 0 errors / 261 warnings（増減0） | 緑 |
| `node scripts/groupSimilar.mjs --all` | 同型★0 | 緑 |
| `npm run census:stubs` | 無言no-op 0種/0件、A群指定/C群の新規増0 | 緑 |
| `npm run check:manual-fields` | field loss 0 / parseStatus違反0 | 緑 |
| `docs/_held_fresh.json` | 88（87→88） | +1は未採用outlier |
| `docs/_partial_fresh.json` | 15（増減0） | 据置 |
| `docs/_idset_fresh.json` | 46（増減0） | 据置 |
| manual drift 削除候補 | 86 | 据置 |
| live効果総数 | 10693 | 据置 |
| `npm run regen` | 10シート＋下流完走 | 緑 |
| `npm run gates` | 全サブゲートPASS | 緑 |

## 7. 全カード生パースdiff（per-effect）

生パース変化集合は **15 effect / outlier 1件**。

採用14 effect:

1. `WX24-D4-04-E1`
2. `SPDi47-04-E2`
3. `WX24-P4-020-E3`
4. `WXK01-001-E1`
5. `WXK07-077-E1`
6. `WXK07-028-E1`
7. `WDK08-Y17-E1`
8. `WXDi-P06-038-E2`
9. `WX25-CP1-078-E1`
10. `WX21-020-E1`
11. `WX16-Re09-E1`
12. `WXK03-042-E2`
13. `WXDi-P02-055-E1`
14. `WX25-P3-054-E1`

未採用outlier 1 effect: `WXDi-CP02-092-E2`（`GRANT_KEYWORD`→`SEQUENCE[POWER_MODIFY,GRANT_KEYWORD]`）。

curated live JSON の変化集合は上記採用14 effectだけ。兄弟効果の巻き添え0、parseStatusだけの差0、C/D群の変化0。

## 8. held / partial / idset と lint

報告直前に `npm run build:effects` → `node scripts/heldReview.mjs` をこの順で再実行した値:

- held: 87→88。追加はカード `WXDi-CP02-092` の `WXDi-CP02-092-E2` 1 effectのみ。原文照合済みだがスコープ外として非採用。
- partial: 15→15、増減0。
- idset: 46→46、増減0。
- 13カードは一時 held に出た後、各カードの fresh/live差が指定effectId 1本だけと確認して `heldReview --adopt`。B4は `_partial_fresh` から `censusManualDrift --adopt WX25-P3-054-E1` でeffect単位同期。
- lint: 261→261 warnings、errors 0。増減0。

## 9. parseStatus遷移

**0件**。採用14 effect はすべて `AUTO→AUTO`。MANUAL/PARTIAL/UNKNOWNへの遷移なし。

## 10. 指示書との不一致・訂正

1. 指示書の母集団23カードはカード単位の原文/liveノード数差なので、兄弟効果で個数が相殺される `WXDi-CP02-092-E2` を漏らす。effectId単位の原文節照合では同型が1件追加。
2. A4について、`kwCollectiveSelfM` は「シグニは/が」、`kwAllSelfPronoun` は「あなたのすべてのシグニ」だけを読んでおり、「あなたのドライブ状態のシグニのパワー…それらは」の組合せには届かなかった。組合せ用の集合代名詞枝が必要だった。
3. 行番号は進行中コードで移動していた。A4の実消費は `calcFieldPowers` の `applyDeltaToState`（現行約1566行）→ `matchesFilter` + `matchesStateFilter`（約779行）で、executor側 `execUtils` ではない。付与側は `collectContinuousGrantedKeywords` が別経路だった。
4. B4の FRONT_SIGNI 語彙は新設不要で、既存 `TargetFilter.frontOfSelf` と executor 候補抽出をそのまま使えた。
5. 最終heldは基準87ではなく88。差1は採用漏れでなく、意図的に非採用とした新規outlierの生パース差分。

## 11. エンコーディング検査

`git status --porcelain` の全26変更ファイル（新規報告書を含む）を HEAD（新規ファイルは空）と比較し、UTF-8として U+FFFD、3文字以上連続の `?`、先頭BOM `efbbbf` を数えた。合計は HEAD=`U+FFFD 0 / ?連続run 28 / BOM 0`、作業ツリー=`0 / 28 / 0`。**新規増0**。

## やらなかったこと

- C群・D群の修正/採用。
- 未指定outlier `WXDi-CP02-092-E2` のlive採用。
- 新action typeの追加、カード番号/固有数値をregexへ埋め込むこと、JSON単独手パッチ。
- `docs/PLAN.md` / `docs/PLAN_PROGRESS.md` の編集、commit、push。
- B1/B2以外の一般 `GRANT_PROTECTION` 期間補正（生パースoutlier 4件が出たため規則を連用中止形だけへ縮小）。
