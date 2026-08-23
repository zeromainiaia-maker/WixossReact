# 段2 第40バッチ報告：持続期間（duration）の脱落・取り違え

- 実施日: 2026-08-23
- 開始 HEAD: `8749b8de6`
- 方針: `findings.jsonl` の残 OPEN を正とし、CSV 原文、live JSON、parser 生出力、executor の格納先、期間境界を effect 単位で照合した。
- 禁止事項: commit / push なし。`docs/PLAN.md` / `docs/PLAN_PROGRESS.md` は変更していない。

## 1. 母集団の数え直し

`CardData_Sheet1.csv`～`CardData_Sheet10.csv` と `CardData_TK.csv` を UTF-8 で直接読み、各ファイルの先頭で `U+FEFF` を除去してから走査した。`CardData_Sheet8.csv` は BOM 付きであり、除去後に **866行**を正常に数えた。全体は **6712行**（974 / 929 / 879 / 633 / 360 / 135 / 880 / 866 / 883 / 127 / TK 46）。`docs/_effect_srctext.json` は母集団の計数に使っていない。

句ごとの件数は次のとおり。長い句が `ターン終了時まで` を内包するため、行同士は排他的ではない。

| 原文句 | 効果 | カード |
|---|---:|---:|
| `ターン終了時まで` | 2044 | 1710 |
| `次の対戦相手のターン終了時まで` | 197 | 186 |
| `次のあなたのターン` | 22 | 21 |
| `そのアタックの間` | 12 | 12 |
| `そのアタックで` | 3 | 2 |
| `対戦相手のターンの間` | 148 | 141 |

重複除去後は **2201 effectId**。live action 木を再帰走査した受け皿は、明示的な `duration` / `until` / delayed-trigger duration を持つものが **911**、action 局所の受け皿がないものが **1290**だった。主な既存受け皿は `GRANT_KEYWORD:UNTIL_END_OF_TURN` 320、`REMOVE_ABILITIES:UNTIL_END_OF_TURN` 95、`POWER_MODIFY:UNTIL_OPP_TURN_END` 95、`GRANT_EFFECT:UNTIL_END_OF_TURN` 86、`POWER_MODIFY:UNTIL_END_OF_TURN` 20、`BLOCK_ACTION:END_OF_ATTACK` 2、`INSTALL_DELAYED_TRIGGER:THIS_TURN` / `THIS_ATTACK_PHASE` だった。

`1290` は欠落数ではない。`DRAW` / `BANISH` / `TRASH` / `SEARCH` / `LOOK_*` など解決時に完結する INSTANT 型、効果全体の duration を使う型、`SEQUENCE` / `CHOOSE` wrapper、CONTINUOUS の再収集型を action 種別ごとに先に列挙し、`duration がない`だけではバグ扱いしなかった。また `GRANT_EFFECT` / `GRANT_LRIG_ABILITY` の内側能力へは期間探索を潜らせず、外側付与期間と混同していない。

この CSV 母集団を残 OPEN と結合すると、依頼表の **16効果**（A 4 / B 6 / C 4 / D 2）になった。消費地点まで読むと、C群の `SP38-008-E1` / `WX04-016-E1` は CONTINUOUS collector が評価のたびに GROW 禁止を再収集する既実装で、永続ストアへ入れる効果ではないため偽陽性。これを引き、A/B/C の **12効果を修正**、D群 **2効果は別主因として据置**とした。同じ parser 規則で変わる fresh 10効果も1件ずつ原文照合した。

## 2. 指定効果の採用表

| effectId | 原文の該当句 | 修正前 JSON の要点 | 修正後 JSON の要点 | 逆翻訳全体と原文 |
|---|---|---|---|---|
| `WX09-021-BURST` | `ターン終了時まで` | 毒牙限定の相手 `POWER_MODIFY -8000`、durationなし。トラッシュ回収も欠落 | `SEQUENCE[毒牙をトラッシュ→手札, 相手シグニ POWER_MODIFY -8000 / UNTIL_END_OF_TURN]` | 一致 |
| `WX24-P3-039-E1` | `ターン終了時まで` | 先頭 `POWER_MODIFY -8000` にdurationなし | `UNTIL_END_OF_TURN`。既存 PARTIAL は `syncManualLive` で同時に `pickUpTo` もlive化 | 一致 |
| `WX24-P3-040-E1` | `①…ターン終了時まで` | 選択肢① `POWER_MODIFY -8000` にdurationなし | 選択肢①だけ `UNTIL_END_OF_TURN` | **不一致あり**。②の「表記パワーと異なる」条件は別findingのまま |
| `WXDi-P05-052-E1` | `ターン終了時まで、あなたのセンタールリグは` | `GRANT_LRIG_ABILITY` に期間・センター指定なし | 外側に `duration:UNTIL_END_OF_TURN`, `targetedCenter:true` | **不一致あり**。公開残りの「好きな順番」は別findingのまま |
| `WX07-023-E2` | `あなたのレゾナ1体…ターン終了時まで` | 自分の一般シグニへ `GRANT_PROTECTION/PERMANENT` | target をレゾナに限定し `UNTIL_END_OF_TURN` | 一致 |
| `WX14-049-E1` | `次のあなたのターンまで` | `GRANT_PROTECTION/PERMANENT` | `UNTIL_OPP_TURN_END` | **不一致あり**。出現条件と「そのレゾナ」同一対象は別findingのまま |
| `WX25-CP1-024-E1` | `置いてもよい。そうしなかった場合、そのアタックの間` | 強制相手ミル→常時 `BLOCK_ACTION/END_OF_TURN` | 相手の無コスト `CHOOSE`。既存 `TRASH{DECK_CARD,opponent,7}` または `BLOCK_ACTION/END_OF_ATTACK` | 一致 |
| `WX15-002-sub-E1` | `そのアタックで` | 宣言外れ時 `PREVENT_DAMAGE/UNTIL_END_OF_TURN` | `PREVENT_DAMAGE/END_OF_ATTACK` | 一致 |
| `SP38-008-E3` | `次にこのルリグがアタック…そのアタックの間` | 起動直後に `BLOCK_ACTION/END_OF_TURN` | 当ターンだけ付与する `ON_ATTACK_LRIG` AUTO。1回消費し、子actionは `END_OF_ATTACK` | 一致 |
| `WXDi-P07-009-E1` | `次の対戦相手のターン終了時まで…対戦相手のターンの間` | `GRANT_KEYWORD` を長期・無条件付与 | 長期 `GRANT_EFFECT` 内に CONTINUOUS `TURN_OWNER:opponent` と内側シャドウ | 一致 |
| `WX21-Re19-E2` | `次のあなたのターンまで` | 外側 `GRANT_LRIG_ABILITY` に局所期間なし（現在ターン末で失効） | `duration:UNTIL_OPP_TURN_END` | **不一致あり**。任意の自己トラッシュと「そうした場合」は別findingのまま |
| `WX25-P2-069-E1` | `次の対戦相手のターン終了時まで…このシグニ…他の＜凶蟲＞` | 相手全シグニを修整、自己除外なし、長期durationなし | `thisCardOnly`, `excludeSelf`, `countFilter:凶蟲`, `UNTIL_OPP_TURN_END` | 一致 |
| `SP38-008-E1` | `グロウフェイズをスキップ` | CONTINUOUS 内 `BLOCK_ACTION/END_OF_TURN` | **JSON変更なし**。場にある間 `calcContinuousBlockedActions` が毎評価時に再収集するためfindingを偽陽性として閉じた | 表示上は期間語が残るが実動は原文一致 |
| `WX04-016-E1` | `グロウフェイズをスキップする` | 同上 | **JSON変更なし**。同じ collector 契約 | 表示上は期間語が残るが実動は原文一致 |

### 同じ parser 規則で変わった10効果の原文照合

| effectId | 照合結果 / 採否 |
|---|---|
| `WX08-017-E1` | 原文はターン末までの耐性。fresh がlive MANUALへ追いついたが、live期間は既に正しく、公開JSON差分なし |
| `WX17-025-E3` | 原文は次の自分ターンまでのシグニ耐性。`PERMANENT→UNTIL_OPP_TURN_END` を採用 |
| `WX24-P1-029-E1` | 原文はターン末までのパワー修整。fresh は改善したが MANUAL 温存のためlive不変。本バッチでforce-adoptしていない |
| `WX25-P1-043-E1` | 同上。MANUAL 温存でlive不変 |
| `WX26-CP1-014-E1` | 原文はターン末までの－10000。`POWER_MODIFY.duration=UNTIL_END_OF_TURN` を採用しfindingを閉じた |
| `WXDi-P09-006-E2` | 原文は「次にこのルリグがアタック…そのアタックの間」。`SP38-008-E3` と同じ一回消費AUTO＋`END_OF_ATTACK` を採用 |
| `WXDi-P09-053-E1` | 原文は次の相手ターン末まで付与し、シャドウ自体は相手ターン中のみ。同じ条件付き長期 `GRANT_EFFECT` を採用しfindingを閉じた |
| `WXEX1-27-E2` | 原文はターン末までの耐性。`PERMANENT→UNTIL_END_OF_TURN` を採用しfindingを閉じた |
| `WXEX1-58-E1` | live MANUAL は既に `UNTIL_OPP_TURN_END` とtrigger sourceを保持。freshだけが期間面で追いついたためlive不変 |
| `WXK10-104-E1` | 選択肢②の耐性だけ `PERMANENT→UNTIL_END_OF_TURN` を採用。回数・対象・耐性範囲の別findingはOPEN継続 |

公開JSONの意味差分は18効果、同カード採用に伴う非挙動差分が `WXDi-P09-006-E1` の不要な `costUnparsed:true` 除去1効果で、合計 **19 effectId**。`WXDi-P09-006-E1` のaction・期間・逆翻訳は不変である。fresh/parser差分22効果はすべて原文照合した。

## 3. 据置した効果

| effectId | 理由 |
|---|---|
| `WX24-P3-086-E1` | `POWER_MODIFY/UNTIL_OPP_TURN_END` 自体は既に正しい。主因は対象が直前の `ADD_TO_FIELD` 結果へ結び付いていないこと。`targetsLastProcessed` 系の別機構なので据置 |
| `WXDi-D04-004-sub-E1` | 主因は `ON_ATTACK_LRIG` 直後ではなくアタック終了時、かつダメージを与えていない場合という発動条件と、アップ対象の自己同一性。duration修正では直らないので据置 |
| `WX24-P1-029-E1` / `WX25-P1-043-E1` | 同文型freshは改善したが MANUAL live 全体の意味確認なしに上書きしない。今回のOPEN採用外として温存 |

据置契約は golden で、D群の target binding / timing が変わっていないことを固定した。

## 4. engine 配線と期間ストア

新しい action 型は追加していない。既存 action へ必要な局所フィールドを追加し、型とconsumerを同時に配線した。

| 値 | 書込先 / 読取先 | 失効境界 |
|---|---|---|
| `POWER_MODIFY(_PER_FIELD).UNTIL_END_OF_TURN` | `execPowerModify` / `execPowerModifyPerField` → `temp_power_mods` | `clearTurnEndScopedState` の turn-end registry |
| `POWER_MODIFY(_PER_FIELD).UNTIL_OPP_TURN_END` | 同executor → `power_mods_until_opp_turn` | 通常ターン末では保持し、相手ターン終了時の `clearUntilOppTurnEffects` |
| `GRANT_PROTECTION.UNTIL_END_OF_TURN` | `execGrantProtection` → `keyword_grants` | turn end |
| `GRANT_PROTECTION.UNTIL_OPP_TURN_END` | `execGrantProtection` → `keyword_grants_until_opp_turn` | `clearUntilOppTurnEffects` |
| `GRANT_EFFECT.UNTIL_OPP_TURN_END` | `execGrantEffect` → `granted_effects_until_opp_turn` | `clearUntilOppTurnEffects`。`collectContinuousGrantedKeywords` が短期・長期の両storeを読む |
| `GRANT_LRIG_ABILITY.UNTIL_OPP_TURN_END` | executor → `lrig_granted_auto_effects_until_opp_turn` | `clearUntilOppTurnEffects`。通常側は `clearTurnGrantedLrigAbilities` |
| `BLOCK_ACTION.END_OF_ATTACK` | `prevent_opp_guard` | `clearEndOfAttackEffects` |
| `PREVENT_DAMAGE.END_OF_ATTACK` | `prevent_damage_windows[].expires=END_OF_ATTACK` | `clearEndOfAttackEffects` |

変更・配線した関数は以下。

- `applyDurationsBatch40`：外側 wrapper だけを走査するparser規則。GRANT内側へ再帰しない。
- `execChoose`：`costlessOpponentChoice` をpending interactionへ伝搬。
- `execPowerModifyPerField`：`thisCardOnly` / `excludeSelf` とduration別storeを実消費。
- `executeAction` の `PREVENT_DAMAGE` 分岐：`END_OF_ATTACK` windowを生成。
- `collectContinuousGrantedKeywords`：`granted_effects` と `granted_effects_until_opp_turn` の両方を収集し、内側 `activeCondition` を毎回評価。
- `clearEndOfAttackEffects`：ガード禁止と `END_OF_ATTACK` damage windowを同時に消し、他期間windowは保持。
- `BattleScreen.handleGuardWithEnergyAlternative` / `handleGuardWithHandAlternative` / `performGuardResponse`：攻撃終了時に攻撃側・防御側双方のwindowを清掃。multiattackも清掃後stateを継続使用。

既存consumerとして `execPowerModify`, `execGrantProtection`, `execGrantEffect`, `GRANT_LRIG_ABILITY` 分岐、`collectAttackingLrigGrantedAutos`, `consumeTriggeredGrantedAutos`, `calcContinuousBlockedActions`, `clearTurnEndScopedState`, `clearUntilOppTurnEffects`, `clearTurnGrantedLrigAbilities` を読み、store選択とreset境界を確認した。`turnScopedState.ts` に未登録の新しい長期stateは増やしていない。

## 5. golden

追加したテストは7本。

1. `段2 第40バッチ parser契約: 対象12効果と同文型10効果の期間受け皿を原文どおりにする`
2. `段2 第40バッチ engine両方向: ターン末の短期修整・耐性はそのターン中だけ有効`
3. `段2 第40バッチ engine両方向: UNTIL_OPP_TURN_END は通常ターン末を跨ぎ、専用境界だけで失効`
4. `段2 第40バッチ engine両方向: END_OF_ATTACK は攻撃中だけ有効で、ターン効果は巻き込まない`
5. `段2 第40バッチ engine両方向: 次のルリグアタック時だけガード禁止AUTOを一回消費する`
6. `段2 第40バッチ engine両方向: 長期GRANT_EFFECT内の相手ターン条件を毎回評価する`
7. `段2 第40バッチ 偽陽性／据置契約: 常時グロウスキップは再収集され、D群の別主因は変えない`

各期間について、期間内で効く正方向と、境界後に効かない負方向を対照にした。`UNTIL_OPP_TURN_END` は通常ターン末を越えて残り、専用境界後だけ消えること、`END_OF_ATTACK` は攻撃中だけ効き、同居するターン末windowを巻き込まないことも固定した。既存goldenブロックの変更はなく、`git diff --numstat scripts/goldenTest.ts` は **139 insertions / 0 deletions**。

## 6. held / partial / idset

| 計器 | before | after | 増減の照合 |
|---|---:|---:|---|
| `_held_fresh.json` | 83 | 82 | `WXDi-P09-006` だけ削除。原文2効果を照合し、E2の次回ルリグアタック一回＋攻撃中ガード禁止がlive/fresh一致。E1は挙動不変で不要な `costUnparsed` だけ消えた |
| `_partial_fresh.json` | 15 | 15 | 追加・削除・内容変更0 |
| `_idset_fresh.json` | 46 | 46 | 追加・削除・内容変更0 |

`WX24-P3-039` は PARTIAL 温存対象だったため `npx tsx scripts/syncManualLive.ts WX24-P3-039` を使い、その後に全ゲートを実行した。force-adopt listは追加していない。

## 7. 条件外の不一致

- `WX24-P3-040-E1`：選択肢②の「表記パワーと現在パワーが異なる」条件がない。
- `WXDi-P05-052-E1`：公開した残りを「好きな順番」でデッキ下へ置く選択がない。
- `WX14-049-E1`：＜宇宙＞レゾナ出現条件によるトラッシュ条件と、保護先「そのレゾナ」が欠ける。
- `WX21-Re19-E2`：任意の自己トラッシュと「そうした場合」ゲートが欠ける。
- `WXK10-104-E1`：センタールリグレベル回数、選択肢①の対象共有、選択肢②のセンタールリグ対象・全効果耐性が未解消。
- `SP38-008-E1` / `WX04-016-E1`：逆翻訳はactionの `END_OF_TURN` を表示するため原文の恒常性を表現し切れないが、実動collectorは正しい。
- `WX24-P3-086-E1` / `WXDi-D04-004-sub-E1`：上記D群の別主因を確認し、未変更。

## 8. 台帳

`stage2_closed.txt` へ第40バッチ見出しと18 effectIdを追記した。IDだけで全findingを閉じる行と、実 `findings.jsonl.quote` の前方一致で1本だけ閉じる行を使い分けた。今回閉じたのは **26 findings / 18 effectId**。段2消化は **337→363**、残 OPEN は **772→746**（HIGH / MED / LOW = 509 / 229 / 8）。D群と上記兄弟findingは記帳していない。

## 9. ゲート before / after

| 計器 | before | after |
|---|---:|---:|
| golden | 2632 PASS / 0 FAIL | **2639 PASS / 0 FAIL** |
| census | 611 / BASELINE_HIGH 611 | **608 / BASELINE_HIGH 608** |
| smoke | 10693、全異常0、SKIP 0 | **10693、CRASH/HANG/INVARIANT 0、SKIP 0** |
| fuzz | 全0 | **全0**（200ゲーム） |
| `groupSimilar --all` | 同型★0 | **同型★0** |
| census:stubs | A無言0 / C0 | **A無言0 / C0**（deferred Aは4種5件） |
| manual-fields | 0 | **0** |
| lint | 0 errors / 261 warnings | **0 errors / 261 warnings** |
| held / partial / idset | 83 / 15 / 46 | **82 / 15 / 46** |

`npm run regen` と最終 `npm run gates` は全緑。census改善に合わせ `scripts/vocabCensus.ts` の `BASELINE_HIGH` を611から608へ更新した。

## 10. エンコーディング検査

`git diff --name-only` の全変更ファイルについて、追加行の `U+FFFD`、3文字以上連続する `?`、先頭UTF-8 BOMの新規混入を検査し、いずれも **0**。`git diff --check` も0。日本語を追加したソース、台帳、BUGFIXES、本報告書を含む。

