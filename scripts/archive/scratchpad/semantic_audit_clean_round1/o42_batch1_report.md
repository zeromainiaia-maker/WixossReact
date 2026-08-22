# §6.4 O-42 第1バッチ報告 — manual 影武者コピー48効果の解除

開始HEAD: `d0323f4e4`（開始時 `git status --porcelain` は空）
実施日: 2026-08-23

## 1. 触ったファイルと理由

- `src/data/manualEffects.ts` — parser 生出力と実体同一になった48効果を削除し、空になったカードエントリをカードごと除去した。
- `public/data/effects_WX.json` — B群40効果のトップレベル `parseStatus` だけを `MANUAL` から `AUTO` へ戻した。ミニファイ1行を維持した。
- `scripts/goldenTest.ts` — 残38効果を既知在庫として固定する O-42 tripwire と、解除後の意味的挙動を固定する実行E2E 3本を追加した。
- `scripts/vocabCensus.ts` — MANUAL解除で露出した `color:[…]` の偽陽性を較正し、`BASELINE_HIGH` を実測659へ更新した。
- `docs/_manual_drift.txt` — 最終 `censusManualDrift` 再生成結果（削除候補38）を記録した。
- `docs/_vocab_census.txt` — 最終 census 再生成結果（659 / baseline 659）を記録した。
- `docs/BUGFIXES.md` — 本バッチの変更、不変条件、ゲート結果を先頭へ記録した。
- 本報告書 — 指定11項目と全効果明細を保存した。

`docs/PLAN.md` と `docs/PLAN_PROGRESS.md` は編集していない。commit / push もしていない。

## 2. 手順1の再実測

開始時に `npx tsx scripts/censusManualDrift.ts` を実行した結果:

- manualEffects: 451カード
- 削除候補: **86効果**
- 乖離: CHANGED/FRESH_ONLY/LIVE_ONLY/FRESH_GAIN/LIVE_RICHER = **23/20/4/3/2**（計52効果・47カード）
- 指示書の48効果のうち候補から外れていたもの: **0件**

さらに計器の `leaves()` を再利用せず、全48効果について `parseCardEffects` 生出力と `MANUAL_EFFECTS` を独立に比較した。`parseStatus` を除いた値・配列順・フィールド集合は48/48一致。8効果はオブジェクトのキー挿入順だけが違ったが、値の差はなく、`buildEffectsJson.ts` の `equalIgnoringParseStatus` もこの形を明示的に同一扱いして既存liveの直列化を温存する。最終HEAD差分でも本文バイト差0を確認した。

## 3. 解除した効果の全件

全件 `manual削除=はい`、`parseStatus以外のlive差分=なし`。

| effectId | live刻印 before→after | manual削除 | parseStatus以外の差分 |
|---|---|---|---|
| WXDi-P12-054-E2 | AUTO→AUTO | はい | なし |
| WXDi-P15-044-E1 | AUTO→AUTO | はい | なし |
| WXK06-048-E1 | AUTO→AUTO | はい | なし |
| WX04-096-BURST | AUTO→AUTO | はい | なし |
| WX05-008-E2 | AUTO→AUTO | はい | なし |
| WX05-008-E3 | AUTO→AUTO | はい | なし |
| WX04-052-E1 | AUTO→AUTO | はい | なし |
| WX04-041-E1 | AUTO→AUTO | はい | なし |
| WX01-002-E1 | MANUAL→AUTO | はい | なし |
| WX01-025-E1 | MANUAL→AUTO | はい | なし |
| WX01-029-E3 | MANUAL→AUTO | はい | なし |
| WX01-030-E1 | MANUAL→AUTO | はい | なし |
| WX01-032-E1 | MANUAL→AUTO | はい | なし |
| WX01-033-E1 | MANUAL→AUTO | はい | なし |
| WX01-033-E3 | MANUAL→AUTO | はい | なし |
| WX01-034-E1 | MANUAL→AUTO | はい | なし |
| WX01-037-E1 | MANUAL→AUTO | はい | なし |
| WX01-085-E1 | MANUAL→AUTO | はい | なし |
| WX01-085-BURST | MANUAL→AUTO | はい | なし |
| WX04-031-E1 | MANUAL→AUTO | はい | なし |
| WX04-031-E2 | MANUAL→AUTO | はい | なし |
| WX04-032-E1 | MANUAL→AUTO | はい | なし |
| WX04-033-E1 | MANUAL→AUTO | はい | なし |
| WX04-033-E2 | MANUAL→AUTO | はい | なし |
| WX04-033-E3 | MANUAL→AUTO | はい | なし |
| WX04-033-BURST | MANUAL→AUTO | はい | なし |
| WX04-035-BURST | MANUAL→AUTO | はい | なし |
| WX04-040-E1 | MANUAL→AUTO | はい | なし |
| WX04-052-BURST | MANUAL→AUTO | はい | なし |
| WX04-071-E1 | MANUAL→AUTO | はい | なし |
| WX04-078-E1 | MANUAL→AUTO | はい | なし |
| WX04-079-E1 | MANUAL→AUTO | はい | なし |
| WX04-088-E2 | MANUAL→AUTO | はい | なし |
| WX04-089-E1 | MANUAL→AUTO | はい | なし |
| WX04-096-E1 | MANUAL→AUTO | はい | なし |
| WX04-098-E1 | MANUAL→AUTO | はい | なし |
| WX05-001-E2 | MANUAL→AUTO | はい | なし |
| WX05-002-E1 | MANUAL→AUTO | はい | なし |
| WX05-002-E2 | MANUAL→AUTO | はい | なし |
| WX05-002-E3 | MANUAL→AUTO | はい | なし |
| WX05-003-E1 | MANUAL→AUTO | はい | なし |
| WX05-003-E3 | MANUAL→AUTO | はい | なし |
| WX05-004-E1 | MANUAL→AUTO | はい | なし |
| WX05-004-E2 | MANUAL→AUTO | はい | なし |
| WX05-004-E3 | MANUAL→AUTO | はい | なし |
| WX05-005-E1 | MANUAL→AUTO | はい | なし |
| WX05-006-E1 | MANUAL→AUTO | はい | なし |
| WX05-008-E1 | MANUAL→AUTO | はい | なし |

## 4. 解除しなかった効果

**0件**。指定48効果は全件が再実測の削除候補に残り、最終liveの本文不変条件も全件通過した。スコープ外38効果は既知在庫として golden の許容リストに載せただけで、manual/liveは変更していない。

## 5. 作業中に見つけた原文との食い違い

**0件**。全48効果の manual/parser 実体照合および選定E2Eの原文確認で、新たな内容不一致は見つからなかった。

計器側では1件の不一致を発見した。`WX05-004-E3` は原文「白、赤、青、緑、黒のカード」を `filter.color:["白","赤","青","緑","黒"]` で正しく表現しているが、census が単値 `"color":"黒"` しか認識せず、MANUAL解除時に高シグナルへ誤分類した。actionは触らず計器を較正した。

## 6. ゲート数値

| 指標 | before | after | 判定 |
|---|---:|---:|---|
| `npm run golden` | 2511 PASS / 0 FAIL | **2515 PASS / 0 FAIL** | +4（tripwire 1 + E2E 3） |
| `npm run census` | 671 / baseline 671 | **659 / baseline 659** | 偽陽性較正で純減12 |
| `npm run smoke` | 10693 / 異常0 / SKIP0 | **10693 / 異常0 / SKIP0** | 据置 |
| `npm run fuzz` | 全0 | **全0** | 据置 |
| `npm run lint` | 0 errors / 261 warnings | **0 errors / 261 warnings** | 据置 |
| `groupSimilar --all` 同型★ | 0 | **0** | 据置 |
| `npm run census:stubs` A群🔴 / C群 | 0 / 0 | **0 / 0** | 据置 |
| `npm run check:manual-fields` | 0 | **0** | 据置 |
| `_held_fresh.json` | 87 | **87** | 据置 |
| `_partial_fresh.json` | 15 | **15** | 据置 |
| `_idset_fresh.json` | 46 | **46** | 据置 |
| drift削除候補 | 86 | **38** | -48 |
| drift乖離5区分 | 23/20/4/3/2 | **23/20/4/3/2** | 据置 |
| manualEffectsカード数 | 451 | **432** | -19 |
| live効果総数 | 10693 | **10693** | 据置 |

`npm run regen` も完走。`npm run gates` は最終的に全緑。

## 7. parseStatusを除いたlive JSONのper-effect diff

開始HEADの5つの `effects_*.json` と作業ツリーを effectId 単位で機械比較した。

- before総数: 10693
- after総数: 10693
- added: 0
- removed: 0
- JSONが変わった効果: 40（B群のみ）
- **`parseStatus` を除いて変わった効果: 0**

40件はすべて `MANUAL→AUTO` のみ。A群8件は `AUTO→AUTO` でlive JSON自体が不変。したがって候補から戻した効果は0件。

## 8. held / partial / idset と lint warning

報告直前に `npm run build:effects` → `node scripts/heldReview.mjs` を再実行した。

- held: **87→87**（増減0、対象の新規held 0）
- partial: **15→15**（増減0）
- idset: **46→46**（増減0）
- lint: **261→261 warnings**、errors 0→0

`build:effects` の表示は純改善採用1だったが、既存後段補正を含む最終liveをHEADと比較すると、対象40件の刻印以外の差分は0で、追加採用の成果物差分も0だった。§5-13′に従い手で戻していない。

## 9. censusManualDrift before / after

| 区分 | before | after |
|---|---:|---:|
| 削除候補 | 86 | **38** |
| CHANGED | 23 | **23** |
| FRESH_ONLY | 20 | **20** |
| LIVE_ONLY | 4 | **4** |
| FRESH_GAIN | 3 | **3** |
| LIVE_RICHER | 2 | **2** |
| 乖離合計 | 52効果・47カード | **52効果・47カード** |

## 10. 指示書との不一致

1. `docs/PLAN.md` の O-42 行は「87効果（残80）」の古い記録だが、開始HEADの計器実測と依頼本文の正は86効果だった。PLANは編集禁止のため更新していない。
2. 指示書は census 671据置を想定していたが、`WX05-004-E3` の MANUAL解除で色配列を見ない計器偽陽性が露出し一度672になった。`color:[…]` を正規表現として認識させると既存12件も同じ偽陽性だったため、最終659へ低下した。指示どおり定数とコメントを更新した。PLAN側の恒久指標は編集禁止のため未更新。
3. 48件中8件は manual と parser 生オブジェクトのキー挿入順が異なった。JSONデータとしては同一で、buildの同一判定もキー順非依存。最終liveの直列化は既存値を温存し、HEAD比で本文バイト差0だった。

## 11. エンコーディング検査

`git diff --name-only` の全変更ファイルと新規報告書について、HEAD版とのベースライン比で U+FFFD、3文字以上連続の `?`、先頭BOM (`efbbbf`) を検査した。

**結果: 8ファイルすべて新規増0**。U+FFFDは全件0→0、先頭BOMは全件0→0。3文字以上連続の`?`は `docs/BUGFIXES.md` に既存28箇所があり28→28、他7ファイルは0→0だった。

## E2E選定理由

- `WX05-003-E3` — 固定枚数ではなく現在手札から不足分を計算する動的 `untilHandCount` を実行し、手札とデッキの両方を固定できる。
- `WX05-004-E2` — ON_PLAY本体のデッキトップ→ライフクロス移動を実行し、枚数だけでなく移動カード同一性も固定できる。
- `WX01-002-E1` — CONTINUOUSのAND条件（白と赤の両方）と全自シグニ+3000を成立/不成立の両方向で `calcFieldPowers` 経由固定できる。

以上。
