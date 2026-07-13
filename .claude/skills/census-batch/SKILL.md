---
name: census-batch
description: 語彙センサス（PLAN §5c）の文型バッチを1巡消化する。census:clusters でテンプレ選定 → parser 規則追加 → build:effects → heldReview で採用 → ゲート → 簿記。過剰効果/幻覚バグの系統消化に使う。
---

# /census-batch — 語彙センサス文型バッチ 1巡

`npm run census` の高シグナル欠落（過剰効果＝フィルタ/条件/使用制限の脱落・幻覚＝原文に無い効果）を、
**文型テンプレ単位のバッチ**で消化する。続き23で確立したパイプライン。

**source of truth は parser**（`src/data/effectParser.ts`）。effects JSON の手パッチで直すのではなく、
parser に規則を足して `build:effects` で収穫し、`heldReview` で採用する。手パッチは parserWorklist の held を増やす＝禁止。

---

## 必須ガードレール（先に読む・違反すると意味的退化を通す）

- **⛔ `npm run build:effects` の結果を無検証で採用しない。** 採用前に必ず
  ① `build:effects` で fresh を再生成 → ② fresh vs live-curated の**精密 diff** → ③ decompile 出力を**原文と照合**。
  `heldReview` の diff 表示や `census:clusters` の枚数は**古くなりうる**（committed `_held_fresh.json` が古く、
  採用済みカードが旧 diff で held 残存していた前例＝続き31）。鵜呑みにしない。
- **⛔ 1バッチ＝parser 規則追加のみに限定**（engine/型/decompiler の変更を混ぜない）。混ぜると回帰面が広がり、
  退化が起きたとき原因を切り分けられない。engine 変更が要るテンプレは §6.3（機構待ち）へ送る。
- **⛔ 採用しない diff の型**（レガシードリフト＝curated が正・fresh が誤り。**据置**する）：
  - `EXILE` → `TRASH`（ゲーム除外を正しく温存している側が curated）
  - `owner:'opponent'` → `undefined`（owner 脱落）
  - 「このシグニ」→ `ALL` 化（対象の拡大）
  - 「あなたのトラッシュ」→ `opponent` 化
  - STUB 退化（具体アクション → STUB）・別 STUB id への化け
  - 「代わりに」昇格（置換ルールは専用機構待ち）
- **⛔ 全再生成系の一括置換は禁止**（無検証置換で約90枚退化の前例）。
- **✅ 採用後は `git show` / 機械 diff で「意図した枚数のみ変更」を確認**する。
- 作業中に engine/parser のバグを見つけたら**その場で直さず** PLAN §3 の Opus タスク12（常設受け口）に登録する。

---

## 手順

### ① テンプレ選定
```
npm run census:clusters
```
→ `docs/_census_clusters.txt` を**枚数順**に見て、消化する文型テンプレを1つ選ぶ。
残りの worklist は PLAN §5c の「残りの消化対象」を参照（消化済みの履歴は PLAN_DETAIL.md §5c）。

⚠ **クラスタ表の ID は effectId**（2026-07-13 続き109 で効果単位へ切替）。採用時は CardNum へ変換する。

### ② 表現可能性の確認
そのテンプレの条件/構造が**既存 DSL 型（engine/decompiler 対応済み）**で表現できるか確認する。
- できない → **機構待ち**として PLAN §6.3 へ枚数付きで送り、別テンプレを選ぶ（ここで無理に近似すると偽陰性を作る）。
- できる → ③へ。

### ③ parser 規則を足す
`src/data/effectParser.ts`。状態条件節の CONDITIONAL 持ち上げは `CLAUSES` 表がテンプレ追加の定位置。
- **engine/decompiler 対応済みの条件型のみ**使う。
- 既存の STUB 全文規則を横取りしないよう注意（ガード3種の実装コメント参照）。
- トリガー句は actionText から除去しない（除去すると別 STUB へ誤マッチして退化＝WXEX2-40 で実測）。
- 無言フォールバックを新設するなら `markSilentFallback()` を必ず呼ぶ（parseStatus:PARTIAL 刻印）。

### ④ 収穫
```
npm run build:effects
```
純粋上位集合は自動採用され、構造変更は held に落ちる。

### ⑤ spot-check → 採用
```
node scripts/heldReview.mjs
```
diff 署名グループごとに spot-check し、`--adopt <ID群>` / `--adopt-sig <署名>` で一括採用。
**上のガードレールの「採用しない型」を必ず先に除外する**（全数機械分類で偽陽性を切ってから採用）。

### ⑥ ゲート
```
npm run gates      # typecheck→golden/smoke/fuzz/census/lint 一括
npm run regen      # decompile 全10シート＋下流を再生成（UTF-8 直書き）
node scripts/groupSimilar.mjs --all   # 同型★0 を確認
```
- **テンプレ追加につき golden を1件足す**（回帰防止）。
- census が減っていたら `BASELINE_HIGH`（`scripts/vocabCensus.ts`）と PLAN §4 恒久指標の実数を更新する。

### ⑦ 簿記
- `docs/BUGFIXES.md` に追記（**新しいものを上**）。
- PLAN §5c の worklist から消化分を削り、PLAN_DETAIL.md §5c の履歴へ移す。
- PLAN §4 進捗サマリの入れ替えは `/baton` で行う。
- commit / push（CI が typecheck・lint・golden・smoke・fuzz を再実行する）。
