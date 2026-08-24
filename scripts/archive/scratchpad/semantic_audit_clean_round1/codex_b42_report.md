# 意味照合監査 段2 第42バッチ報告

対象HEAD: `02b97abed`（段2 第41バッチ）  
実施日: 2026-08-25  
主題: 【自】トリガー句「（あなた／対戦相手）の効果によって」の原因主体限定

## 1. 触ったファイル

- `src/data/effectParser.ts` — 主語付きcause文型を既存 `byOwnEffect` / `byOpponentEffect` へ抽出し、移動元・scope・フェイズも復元。`WXDi-D05-013-E1` は全体watcherとして既存mill timingへ再分類。
- `src/engine/triggerCollect.ts` — 共通cause判定を追加し、群Aの不足経路と群Bの各collectorへ配線。
- `src/screens/BattleScreen.tsx` — 中央盤面diffが持つ `causeOwnerId` を各collectorへ渡し、cause付きzone moveとenergy watcherを中央経路へ分離。
- `scripts/decompileEffects.ts` — cause、移動元、scope、mill filterを逆翻訳へ復元。
- `scripts/goldenTest.ts` — 20効果の構造、原因の成立／逆主体／非効果、群A・群B E2E、群C・Dの非採用を固定。
- `scripts/verifyBattleDrive.mjs` — 未実行の実機草案2本を追加。既存シナリオは変更なし。
- `scripts/vocabCensus.ts` — より具体的な `ON_CARD_MILLED_FROM_DECK` を「トラッシュに置かれたとき」の実装語彙として認識し、baselineを600へ更新。
- `public/data/effects_WX.json`, `effects_WX24_26.json`, `effects_WXDi.json`, `effects_WXK.json`, `effects_misc.json` — 指定20 effectIdのlive反映。
- `docs/decompile_sheet*.txt`, `docs/_review_repr.txt`, `docs/grouped_all.txt`, `docs/grouped_sentence_all.txt` — `npm run regen` の生成物。
- `docs/_held_review.txt`, `docs/_idset_fresh.json`, `docs/_vocab_census.txt`, `docs/_census_stubs.txt` — build / held / gateの生成物。
- `scripts/archive/scratchpad/semantic_audit_clean_round1/stage2_closed.txt` — 採用した7 findingを所定書式で閉鎖。
- `docs/BUGFIXES.md` — 第42バッチの恒久記録を先頭へ追記。
- `docs/stage2_batch42_report.md` — 本報告書。

`docs/PLAN.md` と `docs/PLAN_PROGRESS.md` は編集していない。

## 2. 調査結果：engineがcauseを評価できるか

共通判定は `src/engine/triggerCollect.ts:66` の `effectCauseMatches`。`byOwnEffect` は `causeOwnerId === controllerId`、`byOpponentEffect` は定義済みかつ不一致、`byEffect` はcause定義済みの場合だけ成立するため、原因不明・コスト・バトル・ルール処理はcause限定効果についてfail-closeになる。中央盤面diffは `src/screens/BattleScreen.tsx:3114-3120` で `meta.causeOwnerId` を分解し、同一ブロックから各collectorへ渡す。

| effectId | timing / consumer | cause評価地点・scope経路 | 判定 |
|---|---|---|---|
| SP27-014-E2 | ON_TRASH / `collectDeckTrashSelfTriggers` :911、`collectAnyZoneTrashSelfTriggers` :970、`collectTrashTriggers` :1051 | self。deck／hand・energy／fieldの各経路で `byOpponentEffect` と効果起因を評価。`fromAnyZone` を各originへ適用 | 評価可 |
| WX13-051-E2 | ON_TRASH / :970 | self、hand origin。相手効果のみ成立 | 評価可 |
| WX18-059-E1 | ON_TRASH / :970 | `any_ally`。場のwatcher走査で＜怪異＞filter、hand origin、相手効果を同時評価 | 評価可 |
| WX25-P2-061-E2 | ON_TRASH / :911 | self、deck origin。自分効果＋MAINだけ成立 | 評価可 |
| WXDi-P07-076-E3 | ON_TRASH / :911, :970 | self、deckまたはhand origin。相手効果のみ成立 | 評価可 |
| WXDi-P09-043-E2 | ON_TRASH / :911, :970, :1051 | self、fromAnyZone。相手効果のみ成立 | 評価可 |
| WXDi-D05-013-E1 | ON_CARD_MILLED_FROM_DECK / `collectMillTriggers` :1803 | 場のself watcher。`milledDeckOwner:any`、1枚以上、自分ターン、自分効果を評価 | 評価可。旧ON_TRASH/selfの恒久no-opも解消 |
| WXK10-047-E2 | ON_ENERGY_CHARGE / `collectEnergyAddedSelfTriggers` :2841 | 場のself watcher。`movedSelf` は付けず、追加1枚＋自分効果を評価 | 評価可 |
| WD15-013-E1 | ON_ENERGY_TO_TRASH / `collectEnergyToTrashTriggers` :2229 | selfだが能力ホストはトラッシュ。`actionRevivesSelfFromTrash` の構造で限定したtrash走査とcause評価 | 評価可 |
| WD15-015-E1 | ON_ENERGY_TO_TRASH / :2229 | 場のself watcher。相手energy枚数＋自分効果 | 評価可 |
| WX05-021-E2 | ON_ENERGY_TO_TRASH / :2229 | 場のself watcher。相手energy枚数＋自分効果 | 評価可 |
| WX11-002-E1 | ON_ZONE_MOVED / `collectZoneMovedTriggers` :3451 | `any`。中央diffのcause限定走査（BattleScreen :3403/:3409）で両陣営の移動元を通す | 評価可 |
| WXDi-P00-059-E1 | ON_ZONE_MOVED / :3451 | self。移動カードinstanceとwatcher instanceを一致させ、自分効果を評価 | 評価可 |
| WXDi-P00-063-E2 | ON_ZONE_MOVED / :3451 | self。同上 | 評価可 |
| WXEX1-55-E1 | ON_ZONE_MOVED / :3451 | `any`。両陣営を通し、自分効果だけ成立 | 評価可 |
| WX13-036-E1 | ON_OPP_POWER_DECREASED / `collectPowerDecreaseTriggers` :2365 | 場のself watcher。相手側の減少差分＋自分効果 | 評価可 |
| WXEX2-52-E1 | ON_OPP_POWER_DECREASED / :2365 | 場のself watcher。同上 | 評価可 |
| WX24-P4-088-E1 | ON_CARD_MILLED_FROM_DECK / `collectMillTriggers` :1803 | 場のself watcher。任意デッキ＋1枚以上＋自分ターン＋自分効果 | 評価可 |
| WXK10-052-E1 | ON_CARD_MILLED_FROM_DECK / :1803 | 場のself watcher。自分デッキ＋＜龍獣＞シグニfilter＋自分効果 | 評価可 |
| WXK06-042-E1 | ON_CARD_MOVED_TO_DECK / `collectMoveToDeckTriggers` :2421 | 場のself watcher。相手カード＋1枚以上＋自分効果 | 評価可 |

群Bは依頼文で「4コレクタ」と記載されているが、表のtimingは実際には5系統あるため5関数すべてを確認・配線した。呼出地点はmill `BattleScreen.tsx:3236/3238`、energy-to-trash `:3312/3314`、power `:3374/3376`、move-to-deck `:3386/3388`、zone-moved `:3403/3409`。

## 3. 採用した20効果

`triggerCondition` は最終live値。逆翻訳は `npm run regen` 後の全文である。表記差（数字の全半角、「得る」対「持つ」等）は意味一致として扱い、残る意味差は明記した。

| effectId | 原文のトリガー句 | 最終 triggerCondition | 逆翻訳全文 | 原文一致 |
|---|---|---|---|---|
| SP27-014-E2 | このシグニが対戦相手の効果によっていずれかの領域からトラッシュに置かれたとき | `{"byOpponentEffect":true,"fromAnyZone":true}` | 【自】このカードが対戦相手の効果によっていずれかの領域からトラッシュに置かれたとき：以下の3つから1つを選ぶ【あなたのカードを1枚引く / あなたのデッキの上から1枚をエナゾーンに置く / あなたの手札を1枚トラッシュに置く。そして対戦相手のシグニ1体をバニッシュする】 | trigger一致。③の対象確定順は既存差あり |
| WX13-051-E2 | このシグニが対戦相手の効果によってあなたの手札からトラッシュに置かれたとき | `{"byOpponentEffect":true,"fromZones":["hand"]}` | 【自】このカードが対戦相手の効果によって手札からトラッシュに置かれたとき：あなたのデッキの上から2枚をエナゾーンに置く | 一致 |
| WX18-059-E1 | あなたの＜怪異＞のシグニ1枚が対戦相手の効果によって手札からトラッシュに置かれたとき | `{"byOpponentEffect":true,"fromZones":["hand"]}`（scope=`any_ally`, filter=`怪異`） | 【自】あなたの＜怪異＞のシグニ1枚が対戦相手の効果によって手札からトラッシュに置かれたとき：次の効果を行ってもよい（行わない場合、以降は実行しない）。そしてあなたのカードを1枚引く | 一致 |
| WX25-P2-061-E2 | あなたのメインフェイズの間、このカードがあなたの効果によってデッキからトラッシュに置かれたとき | `{"byOwnEffect":true,"fromZones":["deck"],"duringMainPhase":true}` | 【自】あなたのメインフェイズの間、このカードがあなたの効果によってデッキからトラッシュに置かれたとき：《黒》を支払ってもよい。そうした場合、このシグニをトラッシュから場に出す | 一致 |
| WXDi-P07-076-E3 | このカードが対戦相手の効果によってデッキか手札からトラッシュに置かれたとき | `{"byOpponentEffect":true,"fromZones":["deck","hand"]}` | 【自】このカードが対戦相手の効果によってデッキか手札からトラッシュに置かれたとき：[STUB:相手のトラッシュからカードをデッキトップに（もよい）] | trigger一致、actionは既存STUB |
| WXDi-P09-043-E2 | このカードが対戦相手の効果によっていずれかの領域からトラッシュに置かれたとき | `{"byOpponentEffect":true,"fromAnyZone":true}` | 【自】このカードが対戦相手の効果によっていずれかの領域からトラッシュに置かれたとき：《無》を支払ってもよい。そうした場合、あなたのシグニ(トラッシュ)1枚を手札に加える | trigger一致、actionのself参照に既存差あり |
| WXDi-D05-013-E1 | 自分ターン、あなたの効果によってカードが1枚以上デッキからトラッシュに置かれたとき | `{"byOwnEffect":true,"milledDeckOwner":"any","milledMinCount":1,"turnOwner":"self"}` | 【自】《自分ターン》あなたの効果によっていずれかのプレイヤーのデッキからカードが1枚以上トラッシュに置かれたとき：対戦相手のすべてのシグニは能力を失い、新たに得られない（ターン終了時まで） | 一致。旧timing差も修正 |
| WXK10-047-E2 | あなたの効果によってカード1枚があなたのエナゾーンに置かれたとき | `{"byOwnEffect":true}` | 【自】あなたの効果によってカード1枚があなたのエナゾーンに置かれたとき：このシグニは【ランサー】を持つ（ターン終了時まで） | 一致。`movedSelf`なしが正しい |
| WD15-013-E1 | あなたの効果によって対戦相手のエナゾーンからカード1枚がトラッシュに置かれたとき | `{"byOwnEffect":true,"energyTrashedOwner":"opponent"}` | 【自】あなたの効果によって対戦相手のエナゾーンからカードが1枚トラッシュに置かれたとき：このシグニをトラッシュから場に出す（してもよい） | 一致 |
| WD15-015-E1 | 同上 | `{"byOwnEffect":true,"energyTrashedOwner":"opponent"}` | 【自】あなたの効果によって対戦相手のエナゾーンからカードが1枚トラッシュに置かれたとき：このシグニは【ダブルクラッシュ】を持つ（ターン終了時まで） | 一致 |
| WX05-021-E2 | 同上 | `{"byOwnEffect":true,"energyTrashedOwner":"opponent"}` | 【自】あなたの効果によって対戦相手のエナゾーンからカードが1枚トラッシュに置かれたとき：このシグニのパワーを＋4000する | 一致（durationはJSONに保持） |
| WX11-002-E1 | 場にあるシグニ1体があなたの効果によって他のシグニゾーンに移動したとき | `{"byOwnEffect":true}`（scope=`any`） | 【自】場にあるシグニ1体があなたの効果によって他のシグニゾーンに移動したとき：《once_per_turn》あなたのデッキの上から1枚をエナゾーンに置く | 一致 |
| WXDi-P00-059-E1 | あなたの効果によって場にあるこのシグニが他のシグニゾーンに移動したとき | `{"byOwnEffect":true}`（scope=`self`） | 【自】このシグニがあなたの効果によって他のシグニゾーンに移動したとき：《once_per_turn》対戦相手の手札を1枚トラッシュに置く（相手が選ぶ） | 一致 |
| WXDi-P00-063-E2 | 同上 | `{"byOwnEffect":true}`（scope=`self`） | 【自】このシグニがあなたの効果によって他のシグニゾーンに移動したとき：《once_per_turn》対戦相手のデッキの上1枚を見る。そして[STUB:ルリグデッキ下操作（多パターン）] | trigger一致、actionは既存STUB |
| WXEX1-55-E1 | 場にあるシグニ1体があなたの効果によって他のシグニゾーンに移動したとき | `{"byOwnEffect":true}`（scope=`any`） | 【自】場にあるシグニ1体があなたの効果によって他のシグニゾーンに移動したとき：《once_per_turn》対戦相手のシグニ1体は能力を失い、新たに得られない（ターン終了時まで） | 一致 |
| WX13-036-E1 | あなたの効果によって対戦相手のシグニのパワーが減ったとき | `{"byOwnEffect":true}` | 【自】あなたの効果によって対戦相手のシグニのパワーが減ったとき：このシグニのパワーを減った値と同じだけ＋する | 一致（durationはJSONに保持） |
| WXEX2-52-E1 | 同上 | `{"byOwnEffect":true}` | 【自】あなたの効果によって対戦相手のシグニのパワーが減ったとき：このシグニのパワーを減った値と同じだけ＋する | 一致（durationはJSONに保持） |
| WX24-P4-088-E1 | 自分ターン、あなたの効果によっていずれかのプレイヤーのデッキからカード1枚がトラッシュに置かれたとき | `{"byOwnEffect":true,"turnOwner":"self","milledDeckOwner":"any","milledMinCount":1}` | 【自】《自分ターン》あなたの効果によっていずれかのプレイヤーのデッキからカードが1枚以上トラッシュに置かれたとき：《once_per_turn》このシグニのパワーを＋4000する（次の相手ターン終了時まで） | 一致 |
| WXK10-052-E1 | あなたの効果によってあなたのデッキから＜龍獣＞のシグニ1枚がトラッシュに置かれたとき | `{"byOwnEffect":true,"milledDeckOwner":"self","milledMinCount":1,"milledCardFilter":{"cardType":"シグニ","cardClass":"龍獣"}}` | 【自】あなたの効果によってあなたのデッキから＜龍獣＞のシグニが1枚以上トラッシュに置かれたとき：対戦相手のシグニ1体のパワーを－2000する | 一致（durationはJSONに保持） |
| WXK06-042-E1 | 対戦相手のカードがあなたの効果によってデッキに移動したとき | `{"byOwnEffect":true,"movedToDeckOwner":"opponent","movedToDeckMinCount":1}` | 【自】対戦相手のカードがあなたの効果によって1枚以上デッキに移動したとき：《once_per_turn》あなたのデッキの上から1枚をエナゾーンに置く | 一致 |

## 4. 見送った効果と再判定

### 群C：別語彙／timing内包／器（cause flagを付けない）

| effectId | 再判定 |
|---|---|
| WXDi-P02-037-E2 | 「コストかあなたの効果」なので `fromFieldByCostOrOwnEffect:true` が正しい。`byOwnEffect` へ狭めるとコスト起因を落とすため据置 |
| WXDi-P04-009-E2 | `byWatcherEffect:true` は捨てた本人ではなく能力watcher所有者を基準にする別軸。妥当 |
| WXDi-P04-063-E1 | 同上。妥当 |
| WXDi-P10-060-E1 | 同上。妥当 |
| WXK11-055-E2 | banish専用 `banishedByOwnEffect:true` がcollectorで評価済み。妥当 |
| WDK08-Y12-E1 | ON_REVEALED_FROM_HAND。発行経路自体が効果公開のみで、causeはtimingに内包。妥当 |
| WDK08-Y13-E1 | 同上 |
| WXK04-054-E2 | 同上 |
| WXK04-056-E1 | 同上 |
| WXK04-084-E1 | 同上。goldenでcause flag不在を固定 |
| WXK05-070-E1 | 同上 |
| WXK05-072-E2 | 同上 |
| WXK10-080-E2 | 同上 |
| WXK11-066-E2 | 同上 |
| WX16-024-LAYER | `GRANT_FIELD_SIGNI_ABILITY` の外器。実体 `WX16-024-LAYER-E2` は `ON_LEAVE_FIELD + byOpponentEffect` 済み。妥当 |
| WX09-Re07-E1 | 外側CONTINUOUSに引用能力がSTUB格納された器。外器へcauseを付けるのは誤り。引用能力STUBの実装不足は別軸として据置 |

### 群D：ターン内履歴条件が欠落する別軸

以下10効果は「このターンに～していた場合」という履歴を保持・評価する仕組みが必要で、causeだけ付けても直らないため全件据置。goldenで3 cause flagが付かないことを固定した。

- ON_TURN_END: `WX24-P2-064-E1`, `WX24-P2-077-E2`, `WX24-P4-073-E1`, `WX25-P2-083-E1`, `WX25-P2-094-E1`, `WXDi-P02-038-E2`
- ON_ATTACK_PHASE_START: `WDK09-014-E1`, `WXK02-034-E1`, `WXK06-068-E1`
- 複合履歴: `WXDi-P11-064-E1`（ON_ALLY_PLAY_OR_OPP_HAND_DISCARD）

## 5. cause以外で見つけた原文差

今回同時に直したものは3件。

1. `WX18-059-E1` — `triggerScope:any_ally` と＜怪異＞filterが欠落していたため復元。
2. `WX25-P2-061-E2` — 「あなたのメインフェイズの間」が欠落していたため `duringMainPhase:true` を復元。
3. `WXDi-P07-076-E3` — 「デッキか手札」のdeck側が落ちていたため `fromZones:["deck","hand"]` を復元。
4. `WXDi-D05-013-E1` — 調査中に、全体mill watcherが `ON_TRASH/self` へ誤分類されている別の恒久no-opを発見。既存mill機構へ再分類して同時修正。

今回のcause軸外として残した差は4効果。

- `SP27-014-E2` — 第3選択肢は原文が対象指定→任意discard→banishだが、liveはdiscard→banish対象選択のSEQUENCE。原因限定とは別軸。
- `WXDi-P07-076-E3` — actionが `OPP_TRASH_TO_DECK_TOP` STUB。
- `WXDi-P09-043-E2` — 原文は「このシグニ」を戻すが、live actionは任意の自分のトラッシュのシグニ1枚。任意コスト後の条件も既存近似。
- `WXDi-P00-063-E2` — デッキ下移動の後半が `LRIG_UNDER_CARD_OP` STUB。

## 6. ゲート

| 計器 | HEAD基準 | 最終実測 | 差 |
|---|---:|---:|---:|
| typecheck | PASS | PASS | 維持 |
| golden | 2709 / 0 | **2735 / 0** | **+26 PASS** |
| smoke | 10693、全0、SKIP 0 | **10693、OK 10693、CRASH/HANG/INVARIANT/SKIP 0** | 維持 |
| fuzz | 全0 | CRASH/HANG/INVARIANT/EXPLOSION 0 | 維持 |
| census | 601 / 601 | **600 / 600** | -1、baseline更新済み |
| census:stubs | A群0 / C群0 | A群0 / C群0 | 維持 |
| manual-fields | 0 / 0 | 0 / 0 | 維持 |
| lint | 0 errors / 260 warnings | **0 errors / 260 warnings** | 増分0 |
| groupSimilar --all | 5986カード、265群、★0 | 5986カード、265群、★0 | 維持 |

`npm run gates` は最終状態で全緑。`npm run regen` も完走した。

## 7. 生パースdiff

全6712カード／10660 raw effectをbefore/afterでkey順正規化して比較した結果、変化は20 effectId、outlier **0**。

- 指定対象のraw変化19件: `SP27-014-E2`, `WD15-013-E1`, `WD15-015-E1`, `WX05-021-E2`, `WX11-002-E1`, `WX13-036-E1`, `WX13-051-E2`, `WX18-059-E1`, `WX24-P4-088-E1`, `WX25-P2-061-E2`, `WXDi-D05-013-E1`, `WXDi-P00-059-E1`, `WXDi-P00-063-E2`, `WXDi-P07-076-E3`, `WXDi-P09-043-E2`, `WXEX1-55-E1`, `WXEX2-52-E1`, `WXK06-042-E1`, `WXK10-047-E2`
- 文型上の既存正常前例1件: `WX04-035-E2`。liveは既に正しいが、raw parserも同じ `byOpponentEffect + fromAnyZone` を生成するようになった。
- 指定対象 `WXK10-052-E1` はMANUAL温存のためraw before時点からcause付き構造を生成済みでraw差なし。liveには同parser出力のleafを反映。

HEAD live対比は指定20 effectIdだけが変化し、added/removed 0、outlier **0**。群C・Dはlive不変。

## 8. heldバケットとlint

報告直前に `npm run build:effects` → `node scripts/heldReview.mjs` を再実行した。

- `_held_fresh.json`: **75 → 75**。途中で `WXDi-P07-076` と `WXDi-D05-013` を1件ずつ原文照合してadoptし、最終対象残留0。
- `_partial_fresh.json`: **15 → 15**。対象残留0。
- `_idset_fresh.json`: **45 → 45**。`WX05-021` はカード内の既存ID集合差により引き続き存在するが、総数不変でE2のcause leafはlive反映済み。
- build集計のparseStatus-only bucket: **203 → 206**。MANUALカードのfresh parser側にcauseが載った3件分で、live leafとの一致は個別確認済み。
- lint: **260 → 260 warnings**、errors 0。途中の新規loop内 `useHost/useGuest` がhooks規則として8 warningを生んだため直接state更新へ改め、最終増分0。

## 9. 台帳

| 指標 | before | after |
|---|---:|---:|
| 段0 機械除去 | 221 | 221 |
| 段1 偽陽性 | 113 | 113 |
| 段2 消化 | 402 | **409** |
| OPEN | 708 | **701** |

after内訳はHIGH 490 / MED 207 / LOW 4、525カード・555効果。所定quote前方一致7本を閉じ、`WX11-002-E1 :: 他のシグニゾーンに移動` は実際のzone移動eventとscopeまで直せたため閉じた。

## 10. 実機シナリオ草案

ファイル: `scripts/verifyBattleDrive.mjs`

| scenario ID | 盤面／ログで見るもの | 修正前でも緑にならないか |
|---|---|---|
| `b42OwnEffectEnergyChargeFires` | `WX01-049` の【起】でdeck markerが実際にenergyへ移り、場の `WXK10-047` がランサーを得る | 正方向。causeを全部抑制する退化なら赤。単独では旧JSONも緑なので、下の負方向との対で使う |
| `b42EnergyPhaseDoesNotFire` | ENERGY phaseでhand markerが実際にenergyへ移ったことを必須にし、その後も `WXK10-047` にランサーが付かない | **修正前JSONでは緑にならない**。causeなし旧React watcherが通常エナチャージでもE2を積み、ランサーを付与するため赤 |

Chromiumがないため2本とも**未実行**。JSON fetch/assertは使っていない。既存シナリオ部分は追加ブロックを除去してHEADと正規化SHA-256を比較し、双方 `38d189bc82df3f82c23755dc17cbb9026cd47ebd574b492c06fdd21f30bd74fb` で一致した。

## 11. やらなかったこと

- commit / pushはしていない。
- `docs/PLAN.md` / `docs/PLAN_PROGRESS.md` は編集していない。
- 群Cへ標準cause flagを追加していない。
- 群Dのターン内履歴機構は実装していない。
- 主語なし「効果によって」を `byEffect` へ広げていない。
- `byWatcherEffect`, `banishedByOwnEffect`, `fromFieldByCostOrOwnEffect` を `byOwnEffect` へ統合していない。
- 実機シナリオを実行したとは扱っていない。
- cause軸外で残した4効果のaction/STUBは修正していない。
- 新しい型・新しいtriggerCondition fieldは追加していない。既存3語彙と既存timingだけを使用した。
