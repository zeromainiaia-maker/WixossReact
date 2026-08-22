# 段2 第3バッチ報告：盤面状態フィルタ（`isFrozen` / `infected` / `hasAcce`）の残り配線漏れ

実施 2026-08-22（続き593・Opus 5 単独／Codex 委譲なし）。
バッチ軸＝続き592 の「▶ 次の一手【Opus 側】」に挙がっていた**計器が示す残り配線漏れ**。

## 1. 触ったファイルと理由

- `src/data/parsers/parseSentencePart1.ts`：**能力喪失の汎用枝が対象名詞句の修飾語を一切読んでいなかった**のを是正
  （`removeAbilitiesTargetNounPhraseFilter` 新設）。
- `src/data/effectParser.ts`：①`bindCharmedSigniActionTarget` を「アクセされている」と**所有者語が前に来る語順**へ拡張
  ②`STATE_CONDITION_CLAUSES` に「〈owner〉の場に凍結状態のシグニがある場合」（無冠詞形）を追加
  ③`gate()` が**同一条件の実行時 CONDITIONAL を剥がす**ようにした（手動ゲートと一般規則の二重掛け解消）。
- `src/data/manualEffects.ts`：`WX24-P1-050-E2` の**AUTO 影武者コピー**にパワー上限を反映（下記 §5）。
- `scripts/goldenTest.ts`：E2E 5本を追加（**修正前データで4本が実際に FAIL することを確認済み**）。
- `scripts/vocabCensus.ts`：`BASELINE_HIGH` 781→**776**。
- `scripts/censusWiring.ts`：計器の偽陽性3件を是正（§4）。
- `public/data/effects_*.json`：採用14効果。`docs/decompile_sheet*.txt` ほかは `npm run regen` の再生成物。

## 2. 母集団の数え直し（findings は標本・生データへ戻す）

`docs/_effect_srctext.json`（効果単位の原文）で綴りごとに全数を数え、live JSON と突き合わせた。

| 綴り | 総ヒット | 未配線 | 判断 |
|---|---|---|---|
| 感染状態の〜シグニ（名詞句） | 38 | 3 | 1件を修正／2件は STUB（機構未実装） |
| 〈owner〉の場に凍結状態のシグニがある場合 | 4 | 3 | 3件とも修正（残り1件は手動ゲート済み） |
| アクセされている〜シグニ（名詞句） | 5 | 4 | 2件を修正／2件は STUB |
| アップ状態の〜シグニを対象 | 140 | 2 | 0件（1件は parser 済み・構造ガードで届かず／1件は MANUAL） |

⚠**能力喪失の汎用枝**は状態語だけの問題ではなかった＝`REMOVE_ABILITIES` を持つ139効果を走査したところ、
**対象名詞句にレベル／パワー修飾がある効果でも同じく落ちていた**（感染状態1・レベル3・パワー1）。
バッチの軸は「状態フィルタ」だが、**直した場所は1か所**（対象名詞句の読み取り）。

## 3. 採用した効果（14件）

**A. 能力喪失の汎用枝が対象名詞句を読むようになった（5件）**

| effectId | 落ちていた修飾語 | 直前の意味 |
|---|---|---|
| `WX25-P1-051-E2` | `infected` | 相手シグニなら**誰でも**能力を奪えた |
| `WXDi-P08-049-E2` | `level:1` | 同上 |
| `WXDi-P14-051-E1` | `level<=2` | 相手シグニ**全体**から能力を奪った |
| `WX25-CP1-084-E1` | `level<=2` | 相手シグニなら誰でも |
| `WX24-P1-050-E2` | `powerRange<=10000` | 相手シグニ**全体**（`manualEffects` 経由・§5） |

**B. 「アクセされている〈owner〉のシグニのパワーを＋N」（2件）**

| effectId | 直前の live | 是正後 |
|---|---|---|
| `WX16-031-E2` | `owner:'any' / count:1`（どちらの場の1体か不定） | `owner:'self' / count:'ALL' / hasAcce` |
| `WX16-073-E1` | `count:'ALL'` だが `hasAcce` 無し（**自分の全シグニ**が＋2000） | `hasAcce` を付与 |

**C. 「〈owner〉の場に凍結状態のシグニがある場合」（3件）**

| effectId | 直前の意味 |
|---|---|
| `WXK02-086-E1` | 条件が丸ごと落ちて**無条件でドロー** |
| `WXDi-P09-065-E1` | 無条件で相手手札を公開 |
| `WX25-P2-088-E1` | 🔴**「代わりに」が別ステップ化して手札を2回捨てさせていた**（→ `CONDITIONAL{then:見ないで捨てる, else:通常}`） |

**D. `gate()` の二重ゲート解消（4件）**＝`WXDi-P00-044-E2` / `WXK03-040-E1` / `WX25-P1-062-E2` / `WX25-P3-071-E1`。
`activeCondition` と同一条件の `CONDITIONAL` が action 直下に二重に載っていた（逆翻訳が
「《…かぎり》…：…いるなら、」と条件を2回出していた）。**収集時ゲート側（activeCondition）を残す**。

## 4. 計器の before/after（段2 第2バッチで確立した検証形式）

`npm run census:wiring`（`--key` 単位）

| 語彙 | before | after | 残りの中身 |
|---|---|---|---|
| `hasAcce` | miss 2 / has 1 | **miss 0** / has 3 | — |
| `infected` | miss 2 / has 31 | **miss 0** / has 33 | — |
| `isFrozen` | miss 3 / has 33 | **miss 1** / has 35 | `WXEX2-02-E1`＝`COST_INCREASE` の「1体につき」スケール（機構未実装） |
| `isUp` | miss 3 / has 165 | miss 2 / has 163 | `SPDi43-24-E1`（「この方法でダウンした」機構）／`WXDi-CP02-072-BURST`（§5） |
| `hasCharm` | miss 0 | miss 0 | 前バッチで解消済み |

⚠**計器そのものの偽陽性を3つ潰した**（＝before の miss には「既に正しい効果」が混ざっていた）：
1. `infected`：`FORCE_SIGNI_ATTACK` は専用キー `infectedOnly` で状態を持つ（`WX16-047-E1`）→ `jsonRe` に追加。
2. `isSelfAcced`：離場トリガーは `triggerCondition.leftStateFilter.hasAcce`（`WX20-071-E1`）→ `jsonRe` に追加。
   `hasCharm` の `banishedHadCharm` と同じ罠。
3. `isUp`：コスト側除外の綴りが「をダウンする」限定で「**を好きな数**ダウンする」（`WX24-P4-103-E1`）を漏らしていた。
   ⚠**緩めすぎると穴ごと消える**＝`を[^。、]{0,6}ダウン(する|し)` まで広げたら効果側 DOWN の正しい対象まで落ちて
   **has 165→135** になった（実測）。この計器は `has===0` の語彙を表から捨てるので、除外は最小限にする。

## 5. 据置（このバッチでは触らない）と理由

- **STUB＝機構未実装**（5件）：`WXEX1-51-E2`（感染シグニの【起】封じ）／`WXEX2-26-E1`（感染＋レベル比例パワー）／
  `WX15-003-E1`（アクセ済み自シグニの被バニッシュ）／`WX15-060-E1`（アクセ数でコスト減）／`WXEX2-02-E1`（凍結数でコスト増）。
- **acce 機構**（3件）：`WX17-033-E4`（**アクセホストよりパワーの低い**＝動的比較が未実装）／`WXEX2-69-E3`
  （これにアクセされている＜調理＞へのパワー＋付与が丸ごと落ち、引用能力だけが外側に漏れている）／
  `WX15-038-E2`（**《カード名》にアクセされているかぎり**＝名前つき自己条件が未実装）。
- 🔴**`WXDi-CP02-072-BURST`＝parser は既に正しい（`isUp` を出す）のに live へ届かない**。
  原因は収穫マージの構造ガード＝**effectId 集合が変わるカードは丸ごと温存**（fresh は【絆常】の `-E2` を出すが
  live には無く、代わりに live 固有の `-E3` がある）。しかも live の `-E1` は **`manualEffects.ts` に無い MANUAL**
  なので `syncManualLive` を使うと手修正を潰す。
  📌**実測＝この形（手修正カードで effectId 集合が食い違い、カード丸ごと温存）は45カード**ある。
  多くは id 命名の食い違い（live `E1b` ↔ fresh `E2`）だが、`WXDi-CP02-072`（【絆常】）と `WXDi-P04-040` は
  **live に効果そのものが無い**。→ 次バッチ以降の worklist（PLAN §6.4 へ登録）。
- **`manualEffects.ts` の AUTO 影武者コピー5件**＝`mergeManualEffects` は `parseStatus` を見ずに id 一致で
  **常に manual 側が勝つ**ので、AUTO と書かれた古いコピーが**parser 改善を永久に遮る**。
  今回 `WX24-P1-050-E2` がこれで、手で同じ修正を写して届かせた。残り4件＝`WX24-P1-050-BURST`／
  `WX24-P2-057-E3`／`WXDi-P10-044-E2`／`WXDi-P10-044-E3`（未点検）。

## 6. ゲート結果

`npm run gates` 全緑。golden **2329→2334**（+5＝新規E2E）、census **781→776**（`BASELINE_HIGH` 同期済）、
smoke 10693 全0、fuzz 全0、census:stubs A群🔴0／C群0、manual-fields 0、同型★ **0**、
held **99 据置**、`_partial_fresh` **6 据置**、lint **0 errors / 260 warnings 据置**。
live per-effect diff＝**changed 14 / added 0 / removed 0**（内訳＝上記 A5＋B2＋C3＋D4）。

⚠新規 golden 5本のうち4本は**修正前の live に戻すと実際に FAIL する**ことを確認した（vacuous でない）。
残り1本（感染フィルタ）は初版が vacuous に PASS したため、感染シグニをゾーン0以外へ置く形に書き直した。
