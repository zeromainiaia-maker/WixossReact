# §6.4 O-42 第2バッチ報告

- 日付: 2026-08-23
- 開始 HEAD: `b08a24640`
- 結果: 指定38効果のうち37効果を解除。`WX10-018-E1` は開始 live 本文が parser/manual と異なり、解除すると `parseStatus` 以外も変わるため残置。
- O-42: 削除候補 `38 → 1`。依頼の「残0・クローズ」は不変条件を優先したため未達。
- commit / push: 未実施。

## 1. 触ったファイルと理由

| ファイル | 理由 |
|---|---|
| `src/data/manualEffects.ts` | 実体同一だった37効果の manual 影武者を削除。`WX10-018-E1` は保持。 |
| `public/data/effects_WX.json` | 対象6効果の `parseStatus` を `MANUAL→AUTO`。 |
| `public/data/effects_WX24_26.json` | 対象4効果の `parseStatus` を `MANUAL→AUTO`。 |
| `public/data/effects_WXDi.json` | 対象6効果の `parseStatus` を `MANUAL→AUTO`。 |
| `public/data/effects_WXK.json` | 対象12効果の `parseStatus` を `MANUAL→AUTO`。 |
| `public/data/effects_misc.json` | 対象9効果の `parseStatus` を `MANUAL→AUTO`。 |
| `scripts/goldenTest.ts` | O-42 tripwire を残1に更新し、既存1テストを live 参照へ変更、実行E2Eを3本追加。 |
| `docs/_manual_drift.txt` | `npm run regen` による現況再生成。削除候補を残1へ更新。 |
| `docs/_vocab_census.txt` | `npm run regen` による現況再生成。HIGH は659据置。 |
| `docs/BUGFIXES.md` | 第2バッチの修正記録を先頭へ追記。 |
| `scripts/archive/scratchpad/semantic_audit_clean_round1/o42_batch2_report.md` | 本報告書。 |

`docs/PLAN.md` と `docs/PLAN_PROGRESS.md` は編集していない。

## 2. 手順1の再実測

開始時に `npx tsx scripts/censusManualDrift.ts` を実行した。

- `manualEffects`: 432カード
- 削除候補: **38効果**
- 指示された38件との差: **不足0件 / 余分0件**
- 乖離5区分: `CHANGED/FRESH_ONLY/LIVE_ONLY/FRESH_GAIN/LIVE_RICHER = 23/20/4/3/2`
- 乖離合計: 52効果 / 47カード

候補集合は指示書と完全一致しており、parser 退化により候補から外れた効果は0件だった。

さらに `censusManualDrift.ts` の判定を流用せず、CSVから各カードを読み、`parseCardEffects` の生出力と `MANUAL_EFFECTS` を effectId で直接取得して `parseStatus` 除外の深い比較を行った。38/38効果で parser 生出力と manual は同一だった。その後、開始HEADの live 本文とも独立比較し、37件は同一、`WX10-018-E1` だけに本文差を検出した。

## 3. 既存 golden 参照の全件確認

「同じ意味」は、解除後も同じ effectId の live/parser 効果を評価し、既存 assert の対象 action・condition・collector 契約が変わらない、という判定。対象効果の既存テストがない場合も、カード番号参照の有無を併記した。

| effectId | 既存参照と意図 | 解除後の判定 |
|---|---|---|
| `WDK08-Y11-E2` | 直接参照あり。wave2 C1、手札公開4/6枚の契約。 | 同じ意味。本文不変。 |
| `WXDi-P06-031-E2` | カード参照あり。center-lrig ACT cost と down-only continuous（E2）を確認。 | 同じ意味。本文不変。 |
| `WXK11-029-E1` | 直接参照あり。§3 task8、正面能力除去・block。 | 同じ意味。本文不変。 |
| `WX12-038-BURST` | 対象effectの直接参照なし。カード参照はE1の正面バニッシュ。 | 既存テストの意味は不変。新規E2Eを追加。 |
| `WD17-009-E2` | 対象effectの直接参照なし。カード参照はE1のpower gate。 | 既存テストの意味は不変。新規E2Eを追加。 |
| `WXDi-P04-049-BURST` | 対象effectの直接参照なし。カード参照はE1。 | 同じ意味。本文不変。 |
| `WX25-P2-060-E2` | 直接参照あり。`BANISH_REDIRECT` の単一対象契約。 | 同じ意味。本文不変。 |
| `WXK04-002-E2` | E2直接参照なし。O-20のE3 block境界テストが、E2の「紅蓮」効果が漏れないことも守る。コメントを含め確認。 | parser由来でもE2本文が同一で、境界assertの意味は不変。 |
| `WXK04-028-E1` | 対象effectの直接参照なし。カード参照はE2 watcher/usage。 | 同じ意味。本文不変。 |
| `WDK08-L15-E1` | effectId・カード番号とも対象テストなし。 | 既存契約なし。本文同一を独立比較。 |
| `WXK04-042-E2` | 対象effectの直接参照なし。カードのoptional cost tripwireは別効果。 | 同じ意味。本文不変。 |
| `WXK08-005-E5` | 対象effectの直接参照なし。カード参照はE2～G2。 | 同じ意味。本文不変。 |
| `WXK04-011-E1` | effectId・カード番号とも対象テストなし。 | 既存契約なし。本文同一を独立比較。 |
| `WXK04-012-E1` | effectId・カード番号とも対象テストなし。 | 既存契約なし。本文同一を独立比較。 |
| `WXK04-013-E2` | effectId・カード番号とも対象テストなし。 | 既存契約なし。本文同一を独立比較。 |
| `WXK05-011-E2` | effectId・カード番号とも対象テストなし。 | 既存契約なし。本文同一を独立比較。 |
| `WDK08-L01-E3` | 対象effectの直接参照なし。カード参照はE1 armor watcher。 | 同じ意味。本文不変。 |
| `WDK08-L02-E2` | effectId・カード番号とも対象テストなし。 | 既存契約なし。本文同一を独立比較。 |
| `WDK08-L03-E2` | effectId・カード番号とも対象テストなし。 | 既存契約なし。本文同一を独立比較。 |
| `WDK08-L04-E2` | effectId・カード番号とも対象テストなし。 | 既存契約なし。本文同一を独立比較。 |
| `WXK05-023-E1` | 直接参照あり。Stage2 `ON_BLOOD_CRYSTAL_ARMOR`。 | 同じ意味。本文不変。 |
| `WXK04-070-E1` | 対象effectの直接参照なし。カード参照はE2 filter。 | 同じ意味。本文不変。 |
| `WX13-034-E2` | 対象effectの直接参照なし。カードの別効果テストあり。 | 同じ意味。本文不変。 |
| `WX16-045-E1` | 対象effectの既存テストなし。 | 既存契約なし。本文同一を独立比較。 |
| `WX24-D3-25-BURST` | effectId・カード番号とも対象テストなし。 | 既存契約なし。本文同一を独立比較。 |
| `SPDi37-06-BURST` | effectId・カード番号とも対象テストなし。 | 既存契約なし。本文同一を独立比較。 |
| `WX12-010-E1` | 直接参照あり。`FORCE_SIGNI_ATTACK` のaction型契約。 | 同じ意味。本文不変。 |
| `WD03-011-E1` | effectId・カード番号とも対象テストなし。 | 既存契約なし。本文同一を独立比較。 |
| `WXDi-P06-007-E2` | effectId・カード番号とも対象テストなし。 | 既存契約なし。本文同一を独立比較。 |
| `WX10-018-E1` | 直接参照あり。O25(d)、optional tripwire、`NEGATE_NTH_ATTACK` のsigni/lrig合計2回契約。 | **解除せずmanualを保持したため同じ意味。** live本文だけでは契約を満たさない。 |
| `WX19-045-E1` | effectId・カード番号とも対象テストなし。 | 既存契約なし。本文同一を独立比較。 |
| `WXDi-P06-034-E2` | effectId・カード番号とも対象テストなし。 | 既存契約なし。本文同一を独立比較。 |
| `WXDi-P14-053-E1` | 直接参照あり。白対象redirect、+2000、覚醒と構造。 | 同じ意味。本文不変。 |
| `WX26-CP1-048-E1` | 対象effectの直接参照なし。カード参照はE2のplacement origin。 | 同じ意味。本文不変。 |
| `WX24-P2-044-E1` | 直接参照あり。CI母集団、B-1 pay3 escape、O30 data invariant。 | 同じ意味。本文不変。 |
| `WXDi-P11-010B-E1` | 直接参照あり。timing triage、B面atomic flip、draw5/EC5。 | 同じ意味。本文不変。新規実行E2Eも追加。 |
| `WXK09-003-E1` | 直接参照あり。condition両方向、赤branchのlife→energy。 | 同じ意味。本文不変。 |
| `WX20-028-E1` | 直接参照あり。multi-acce collectorとStep B。 | 同じ意味。テスト入力をmanual直参照からlive `effectsMap`参照へ変更し、同じassertを維持。 |

## 4. 解除対象の全件結果

`差分` は開始HEAD liveとの効果単位比較で `parseStatus` を除外した結果。

| effectId | live刻印 before→after | manual削除 | parseStatus以外の差分 |
|---|---|---:|---:|
| `WDK08-Y11-E2` | MANUAL→AUTO | 済 | なし |
| `WXDi-P06-031-E2` | MANUAL→AUTO | 済 | なし |
| `WXK11-029-E1` | MANUAL→AUTO | 済 | なし |
| `WX12-038-BURST` | MANUAL→AUTO | 済 | なし |
| `WD17-009-E2` | MANUAL→AUTO | 済 | なし |
| `WXDi-P04-049-BURST` | MANUAL→AUTO | 済 | なし |
| `WX25-P2-060-E2` | MANUAL→AUTO | 済 | なし |
| `WXK04-002-E2` | MANUAL→AUTO | 済 | なし |
| `WXK04-028-E1` | MANUAL→AUTO | 済 | なし |
| `WDK08-L15-E1` | MANUAL→AUTO | 済 | なし |
| `WXK04-042-E2` | MANUAL→AUTO | 済 | なし |
| `WXK08-005-E5` | MANUAL→AUTO | 済 | なし |
| `WXK04-011-E1` | MANUAL→AUTO | 済 | なし |
| `WXK04-012-E1` | MANUAL→AUTO | 済 | なし |
| `WXK04-013-E2` | MANUAL→AUTO | 済 | なし |
| `WXK05-011-E2` | MANUAL→AUTO | 済 | なし |
| `WDK08-L01-E3` | MANUAL→AUTO | 済 | なし |
| `WDK08-L02-E2` | MANUAL→AUTO | 済 | なし |
| `WDK08-L03-E2` | MANUAL→AUTO | 済 | なし |
| `WDK08-L04-E2` | MANUAL→AUTO | 済 | なし |
| `WXK05-023-E1` | MANUAL→AUTO | 済 | なし |
| `WXK04-070-E1` | MANUAL→AUTO | 済 | なし |
| `WX13-034-E2` | MANUAL→AUTO | 済 | なし |
| `WX16-045-E1` | MANUAL→AUTO | 済 | なし |
| `WX24-D3-25-BURST` | MANUAL→AUTO | 済 | なし |
| `SPDi37-06-BURST` | MANUAL→AUTO | 済 | なし |
| `WX12-010-E1` | MANUAL→AUTO | 済 | なし |
| `WD03-011-E1` | MANUAL→AUTO | 済 | なし |
| `WXDi-P06-007-E2` | MANUAL→AUTO | 済 | なし |
| `WX10-018-E1` | MANUAL→MANUAL | **未削除** | **あり（残置理由）** |
| `WX19-045-E1` | MANUAL→AUTO | 済 | なし |
| `WXDi-P06-034-E2` | MANUAL→AUTO | 済 | なし |
| `WXDi-P14-053-E1` | MANUAL→AUTO | 済 | なし |
| `WX26-CP1-048-E1` | MANUAL→AUTO | 済 | なし |
| `WX24-P2-044-E1` | MANUAL→AUTO | 済 | なし |
| `WXDi-P11-010B-E1` | MANUAL→AUTO | 済 | なし |
| `WXK09-003-E1` | MANUAL→AUTO | 済 | なし |
| `WX20-028-E1` | MANUAL→AUTO | 済 | なし |

解除は37効果。空になったカードエントリ20件をカードごと削除し、残り17効果は同じカードに別manual効果があるため効果単位で削除した。巻き添えとなる他manual効果の変更は0件。

## 5. 解除しなかった効果

1件。

- `WX10-018-E1`: parser/manual の `NEGATE_NTH_ATTACK` actionには `negateNthAttack:{count:2,signi:true,lrig:true}` があるが、開始 live action は `{"type":"STUB","id":"NEGATE_NTH_ATTACK"}` のみ。解除後に変わる本文パスは `action.negateNthAttack.count`、`action.negateNthAttack.signi`、`action.negateNthAttack.lrig` の3つ。不変条件に反するため manual エントリと live `MANUAL` を保持した。

## 6. 作業中に見つけた原文との食い違い

1件。

- `WX10-018-E1`: 原文は「次の対戦相手のターンの間、対戦相手のシグニかルリグが合計2回アタックしたとき、そのアタックを無効にする」という契約。manual/parserには対象種別と回数がある一方、開始 live にはそのpayloadがない。依頼どおり action を修正せず、manualを残置して報告だけとした。

他37効果について、本作業の独立比較・既存golden確認・新規E2Eの範囲で新たな原文不一致は検出しなかった。

## 7. ゲート実測値

| 指標 | 開始ベースライン | 最終実測 | 判定 |
|---|---:|---:|---|
| `npm run golden` | 2515 PASS / 0 FAIL | **2518 PASS / 0 FAIL** | +3、全緑 |
| `npm run census` | 659 / BASELINE_HIGH 659 | **659 / 659** | 据置 |
| `npm run smoke` | 10693効果 / 異常0 / SKIP 0 | **10693効果 / CRASH 0 / HANG 0 / INVARIANT 0 / SKIP 0** | 据置 |
| `npm run fuzz` | 全0 | **全0** | 据置 |
| `npm run lint` | 0 errors / 261 warnings | **0 errors / 261 warnings** | 据置 |
| `node scripts/groupSimilar.mjs --all` | 同型★0 | **同型★0**（265 groups） | 据置 |
| `npm run census:stubs` | A群🔴0 / C群0 | **無言A群0 / C群0** | 据置 |
| `npm run check:manual-fields` | 0 | **0** | 据置 |
| `docs/_held_fresh.json` | 87 | **87** | 据置 |
| `docs/_partial_fresh.json` | 15 | **15** | 据置 |
| `docs/_idset_fresh.json` | 46 | **46** | 据置 |
| `censusManualDrift` 削除候補 | 38 | **1** | 37減、残置理由あり |
| `censusManualDrift` 乖離5区分 | 23/20/4/3/2 | **23/20/4/3/2** | 据置 |
| `manualEffects` カード数 | 432 | **412** | 20減 |
| live効果総数 | 10693 | **10693** | 据置 |

`npm run build:effects` → `node scripts/heldReview.mjs`、`npm run regen`、`npm run gates`、`node scripts/groupSimilar.mjs --all`、最終 `npx tsx scripts/censusManualDrift.ts` の順を含めて実行した。新規heldはなく、個別原文照合を要する `--adopt` は発生しなかった。buildログ上のpure improvement自動採用は1件表示されたが、開始HEADとの最終効果単位比較では37件の刻印変更以外は0件だった。

### 新規実行E2E 3件

- `WD17-009-E2`: 単純な自身+3000を選び、対象scopeとdurationを実行結果で固定。
- `WX12-038-BURST`: BURSTのデッキトップ→エナを選び、ゾーン移動とdeck/energy差分を固定。
- `WXDi-P11-010B-E1`: draw5とenergy charge 5の複合効果を選び、手札+5・エナ+5・デッキ-10を固定。

前回の3件とは重複していない。

## 8. parseStatusを除いたlive JSON per-effect diff

開始HEADの5枚のlive JSONと最終working treeを effectId で機械比較した結果:

```text
beforeTotal: 10693
afterTotal:  10693
added:       0
removed:     0
changed:     37
bodyChangedAfterRemovingParseStatus: 0
statusTransitions: 37件すべて MANUAL -> AUTO
```

したがって、解除した37効果の `action` / `cost` / `condition` / `timing` / `duration` / `mandatory` を含む `parseStatus` 以外のlive差分は**0件**。効果の追加・削除も各0件である。

## 9. held / partial / idset と lint の増減

報告直前の再実測:

- held: `87 → 87`（増減0）
- partial: `15 → 15`（増減0）
- idset: `46 → 46`（増減0）
- lint errors: `0 → 0`
- lint warnings: `261 → 261`（増減0）

## 10. censusManualDrift before / after

| 指標 | before | after | 増減 |
|---|---:|---:|---:|
| 削除候補 | 38 | 1 | -37 |
| CHANGED | 23 | 23 | 0 |
| FRESH_ONLY | 20 | 20 | 0 |
| LIVE_ONLY | 4 | 4 | 0 |
| FRESH_GAIN | 3 | 3 | 0 |
| LIVE_RICHER | 2 | 2 | 0 |
| 乖離合計 | 52効果 / 47カード | 52効果 / 47カード | 0 |

afterの削除候補1件は `WX10-018-E1`。

## 11. census変動の判定

HIGHは `659 → 659`、`BASELINE_HIGH` も659で据置。較正コード変更・ベースライン変更は0件で、原文欠落を較正で隠したものはない。

`npm run regen` により `_vocab_census.txt` の非HIGH集計だけがmanual解除を反映して動いた。

- reverse `BANISH` raw original: `937 → 940`
- reverse `DRAW`: `1222 → 1224`
- reverse `SEARCH`: `347 → 348`
- BURST `STUB/MANUAL` stored: `172 → 169`（`SPDi37-06-BURST`、`WX12-038-BURST`、`WX24-D3-25-BURST` がAUTO化）

いずれも本文/actionの変化ではなく、同一本体のparseStatus分類変更による集計移動。偽陽性較正も実バグ修正も行っていない。

## 12. 指示書との不一致

- 指示書は38効果すべてでlive本文不変を前提としていたが、`WX10-018-E1` は開始live本文に `negateNthAttack` payloadがなく、解除すると `parseStatus` 以外の3パスも変わる。
- このため「全38解除」「許容リスト空」「件数assert 0」「O-42クローズ」にはせず、禁止事項どおり同効果を候補から外して許容リストを1件、件数assertを1とした。
- その他、開始候補集合、ゲートベースライン、held/partial/idset、効果総数に指示書との不一致はない。

## 13. エンコーディング検査

最終差分ファイル全件（本報告書を含む）について、開始HEADとのベースライン比で次を機械集計する。

- U+FFFD
- `?` 3文字以上の連続
- ファイル先頭 UTF-8 BOM (`efbbbf`)

最終検査結果は、全11ファイルで**新規増0**。`docs/BUGFIXES.md` の既存連続`?`は `28→28`、その他10ファイルは `0→0`。U+FFFDとBOMは全11ファイルで `0→0`。本報告書も U+FFFD 0、連続`?` 0、BOMなし。`git diff --check` も問題なし。

## 最終結論

安全に解除できたのは37効果で、live総数10693と本文は完全に維持された。`WX10-018-E1` はmanual/parserと開始liveが実体同一ではないため、不変条件に従って残した。O-42を残0にするには、このlive本文不一致を別作業で原文・契約テストに基づいて解消した後、改めて影武者解除する必要がある。
