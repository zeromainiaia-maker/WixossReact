# PLAN — 開発計画（唯一の正）

> **読み方**＝cold start は **§1 現在地 → §2 作業の流れ → §5 作業キュー** の順。着手を決めたら [LESSONS.md](./LESSONS.md) を読んでから実装へ入る。
> **ここに置くのは「現在地・手順・ルール・生きている worklist（残数と一行）」だけ。** 経緯・教訓・日付つきの実績は書かない
> （経緯＝[BUGFIXES.md](./BUGFIXES.md)／登録票と消化済み項目＝[PLAN_DETAIL.md](./PLAN_DETAIL.md)／過去の §1＝[PLAN_PROGRESS.md](./PLAN_PROGRESS.md)／教訓＝[LESSONS.md](./LESSONS.md)・[DRIVE_TRAPS.md](./DRIVE_TRAPS.md)）。
> **節番号・索引の文字・`O-nn`／`V-nn` は住所**＝他ファイルから参照されるので詰めない・再利用しない。

---

## 1. 現在地（直近1セッション）

> **運用**＝直近1件だけを置く入れ替え式。作業したら ①この要約を [PLAN_PROGRESS.md](./PLAN_PROGRESS.md) の先頭へ移す ②今回の要約へ書き換える。

**直近＝2026-09-22＝🏁**CPU の作戦モーダルを作り直した**（ユーザー指摘・全文は [BUGFIXES.md](./BUGFIXES.md) 第455バッチ）
- 🔴📏**推測で直さず実機（390×844）で採寸した**＝［切替を追加］が**モーダルの外へ 18px はみ出し**、
  クラスの `select` は**「ク:」まで潰れて**いた。原因＝操作行が `flexWrap` なしで **`flex:'0 0 150px'` の固定幅**を並べていたこと。
  ⇒ 全行を折り返し＋固定幅を廃止／**本文をひとつのスクロール領域**へ（旧はカード一覧だけがスクロールし、
  規則が増えると**コンボ節が画面外へ出て触れなかった**）。📏**再採寸＝390px・360px とも 溢れ 0**。
- 🔴**表示と保存が食い違う実バグ**＝「使いどころ」は**カード未選択だと選択肢が `['never']` だけなのに state は `'defense'`**
  ＝**画面は「使わない」と出しているのに［追加］すると `defense` が保存された**。⇒ `cpuPlanClampOption` で必ず選択肢へ丸める。
- 🔴**効かない操作が全カードに並んでいた**＝engine の消費地点を当たって絞った＝
  ［キー］はメインデッキの札だけ（ルリグデッキの札は手札にもエナにも行かない）／［優先］は出す札だけ／
  コンボの使い方は `cpuPlanMoveStep` が拾える形だけ（**キー・ピースは加点が1点も乗らない**）。
- 🆕**相手の札を名指しする入口を作った**＝`pruneCpuDeckPlan` は「狙う／避ける」だけデッキ外を**わざと落とさない**のに、
  **画面は自分のデッキの札しか出していなかった**（その設計に到達できなかった）。
- 🔑**判定は `src/screens/deck/cpuPlanOptions.ts`（純関数）へ出した**＝
  「指定したのに効かない」は**どの計器にも映らない**（JSON も engine も正しく golden も緑）＝
  **純関数にして golden から全カードに当てる**（反転確認＝2か所を旧実装へ戻すとどちらも FAIL）。
- ⚠**実機シナリオも直した**＝`selectOption('deploy')` の決め打ちは、種別で絞った新 UI では
  **"did not find some options" で 30秒待ってから落ちる**（罠 [DRIVE_TRAPS.md](./DRIVE_TRAPS.md) §4.4-132）。

| 軸 | いまの値 |
|---|---|
| 🔥**次に取るもの** | 🔵**§5.7 `S-6`**（機械学習＝CPU の強さの残り1件） |
| 📊**進捗3計器** | Sheet1 要対応 **1 / 863**／台帳 残 OPEN **0**／census 高シグナル **1 / BASELINE 1** |
| 📦**在庫** | 🏁**機構 worklist 0**／🏁**実機 `V-nn` 0**／実装キュー **0**／🏁**CPU 完成度 0**／**CPU の強さ 1**（🔵`S-6`）／リリース作業 **1**／**作戦データの入力 21デッキ**（ユーザー作業） |
| ⚠**直近の不具合** | 🏁**未修正で登録済みのものは無い** |
| ⚠**バグ報告** | 🏁**未消化 0**。次は必ず **`--replay` から**（§5.6.4b の 3.） |
| 🔧**ゲート** | `npm run gates` 全緑（golden **4376**）｜**実機 PASS**（通し対戦＝`VERIFY_DECK` と `VERIFY_DECK_MECH`／作戦モーダル＝`v268CpuDeckPlan`） |

---

## 2. 作業の流れ（1巡の定義）

1巡＝**①取る → ②母集団を実測 → ②'レーンを決める → ③実装 → ④ゲート → ⑤実機（要るときだけ） → ⑥簿記 → ⑦通知**。

### 2.0 実装レーンの選び方 ★③に入る前に必ず決める

| レーン | 使う条件 | 書く先 | 検証 |
|---|---|---|---|
| **速い（既定）** | **同型が2枚以下** | **`manualEffects.ts` に手書き** | `build:effects` → **逆翻訳を目視** → `golden -- --only` ＋ `smoke`（約5秒） |
| **遅い（例外）** | 同型が3枚以上 ／ 新しいアクション型・条件型を足す ／ `src/engine/` か `src/screens/` を触る | `effectParser.ts` ほか | `npm run gates`（＋§2.2 で要れば実機） |

- 根拠＝`npm run census:clusters` の実測で **1テンプレあたり約1効果**＝parser に regex を1本足しても平均1効果しか直らない。**新カードで同型が増えたら遅いレーンへ戻す。**
- 🔴**「移設だけ」の manual 化は禁止**＝parser の出力をそのままコピーしても何も直らず、計器から消え、以後の parser 改善も届かなくなる。**原文を読み直して正しい JSON を手で書く。** トップレベル効果の `parseStatus` は `MANUAL`／`PARTIAL` のみ（`manual-fields` ゲート）。
- **「あと何割か」には答えない**＝在庫の総量を測る手段は無い。残項目数だけを報告する。

### 2.1 1巡＝1バッチの手順

| # | 工程 | やること |
|---|---|---|
| ① | **取る** | §5 から**1件**。§5.3 は索引の並び順に取る |
| ② | **数える** | 着手前に母集団を実測する（`npm run census:population` ほか・[LESSONS.md](./LESSONS.md) §4.1）。登録票の件数は仮説＝**別名で grep し直す** |
| ②' | **レーンを決める** | §2.0 |
| ③ | **実装** | 型を足すなら**型＋両評価器＋golden**（条件型は6箇所＝§5.3「1〜3枚の項目の取り方」） |
| ④ | **ゲート** | 速いレーン＝1件ごとに `golden -- --only` ＋ `smoke`、`gates` は10件ごとに1回。遅いレーン＝`npm run gates`。parser を触ったら `npm run regen` ＋ live の A/B 差分 |
| ⑤ | **実機** | §2.2 で要る回だけ `node scripts/verifyBattleDrive.mjs <シナリオID>`（着手前に [DRIVE_TRAPS.md](./DRIVE_TRAPS.md)） |
| ⑥ | **簿記** | 速いレーンは10件まとめて1回（BUGFIXES＝真因1行／影響枚数／検証コマンド／反転確認の有無）。遅いレーン・機構変更は `/baton` |
| ⑦ | **通知** | 手が止まったら停止通知メール（§2.5）。push が要る作業は push してから |

- 🔴**`golden -- --only` の結果は全件実行と等価ではない**（POOL カーソルがテスト間で共有される）＝**1巡を閉じる前にフィルタなしで全件を回す。**
- `BASELINE_HIGH` を更新する回は、先に `npm run census` 単独で実数へ直してから `gates` を1回。

### 2.2 完了の定義 ★実機の要否は触ったディレクトリで決める

| 触ったもの | 完了に要るもの |
|---|---|
| **`src/screens/`** | 🔴**⑤実機まで**（golden で反転確認を取っていても省かない） |
| **新しいアクション型・条件型・機構を足した** | 🔴**⑤実機まで** |
| **`src/data/` `src/engine/` `public/data/` だけ** | **④まで**（実機不要・`V-nn` も不要） |

- `src/screens/` を触ったのに実機を省いてよいのは、**実機から原理的に観測できない**ときだけ。そのときは golden で両方向を固定し、理由を §5.1 に `V-<次番号>` で残す。
- ④までと判定した回はそれで完了＝判定した理由を BUGFIXES に1行書く。
- 1巡のスコープの目安＝速いレーン10件／遅いレーン15〜20効果。

### 2.3 （§2.2 へ統合済み）

### 2.4 作業中にバグを見つけたとき

**その場で直すのが既定。** 登録して先送りしてよいのは ①新しい機構が要る（§5.3 に `O-nn`）②母集団が別（§5 の該当節へ1行）のときだけ。
⚠**監査ラウンドの findings は例外**＝直さずに `O-nn` で登録する（§2.6）。登録には見立てではなく実測値を書く。

### 2.5 停止通知メール（工程⑦）

手が止まって指示待ちになったら送る（完了／測定だけで終わった／判断待ち／ブロッカー）。途中経過では送らない。

```bash
node C:/Users/zerom/.claude-shared/notify-mail.mjs --subject "[WixossReact] <状態> — <一行主題>" --body "<本文>"
node C:/Users/zerom/.claude-shared/notify-mail.mjs --subject "件名" --body-file <絶対パス>   # 長文
node C:/Users/zerom/.claude-shared/notify-mail.mjs --check                                   # 設定だけ確認
```

- **件名の先頭**＝`完了`／`指示待ち`／`要判断`／`ブロック`。
- **本文**＝①終わったこと・終わっていないこと ②次の選択肢（推奨） ③判断が要る点 ④commit SHA と push 済みか。実装した回は加えて真因／ゲートと3計器＋在庫／実機シナリオと反転確認／登録した `O-nn`。監査ラウンド中は5行以内。
- ⚠宛先 `MAIL_TO` は書き換えない／`notify-mail.mjs` に `process.exit()` を足さない／`--body-file` に `$TMPDIR` を使わない／`notify.env` をリポジトリへコピーしない。

### 2.6 監査ラウンド・委譲バッチの軽量運用

- 🔑**LLM は「まだ知らない型」を見つけるためだけに使い、型の全数は grep／census／機械走査で取る。**
- 🔴**止め時は残枚数ではなく「新型数」**（ラウンドごとの単位は §5.2）。
- **findings の出口**＝①**BUG** → 直さずに §5.3 へ `O-nn`（`semantic_bug_deferred.txt` に `REGISTERED`）②**ASK**（ルール解釈に依存）→ **先に原文コーパス（`docs/_effect_srctext.json`）で minimal pair を探し**、見つからなければ §5.3 索引 H ③**FP** → `file:line` か原文の実測値を書けるものだけ閉じ、読み方ルールへ還元（書けないなら FP にしない）。round6 はこれに ④**HARNESS** を加える（§5.2）。`triaged.txt` は `BUG`／`ASK`／`FP` で書き、`BUG`・`ASK` には O 番号を併記。
- **固定費はセッション単位**＝作業中は `golden -- --only` ＋ `smoke`、full `gates` と簿記はセッション末に1回、メールは5行以内。
- **委譲バッチ**＝1項目ごとに `BUGFIXES.md` へ追記させる。判定（triage・parser/engine 修正）は Opus、監査実行・grep 展開・手書き・ゲート・簿記は Sonnet／Codex でよい。
- ⚠この軽量運用は監査・委譲ラウンド中だけ。`src/engine/` `src/screens/` を触る回は §2.1〜§2.5 に戻る。

---

## 3. 不変の運用ルール

- **`effects_*.json` の curated 値は上書きされない**＝`build:effects` は `MANUAL`/`PARTIAL` を含むカードを温存し、fresh が curated の純粋な上位集合でなければ held へ送る（`buildEffectsJson.ts:158-162`）。**変わるのは `heldReview --adopt` で明示採用したものだけ。**
- **逆翻訳を直したらエンジン実装までセット**。語彙が無ければ §5.3 で機構にするか、`engineUnwiredTimings` に登録して逆翻訳へ `【※engine未配線】` を付ける。
- **型チェックは `npm run typecheck`**（plain `tsc --noEmit` は空振り）。`scripts/` は対象外＝**`scripts/` を直したら `npm run golden` を走らせるまで直ったと言わない。**
- 🔴**一括置換は禁止**（全再生成系も、ソースの文字列置換も）＝行番号を指定した1行だけの置換にする。`git diff --stat` が想定より多い行を言ったら止まる。
- **系統ごとの直し方**＝機構を1回確立 → 同パターンに適用 → 各カードを verify。
- **日本語を含むスクリプトは `.mjs` ファイルに書いて `node <path>`**（Git Bash の `node -e` は文字化けする）。使い捨ては `tmp_*`。
- **CSV の順番を維持する**。
- **件数メトリクスを完了指標にしない**＝判断は該当カードの逆翻訳が原文と一致するか（目視／grep）で行う。

### 進捗の報告の仕方

**「3計器＋在庫3本」を併記する。** どれか1本を進捗指標に固定しない。

| | 指標 | 取り方 |
|---|---|---|
| ① | Sheet1 の要対応カード数 | `npm run census:cards -- --sheet 1` |
| ② | 意味照合 段2 台帳の残 OPEN | `node scripts/archive/semanticAuditLedger.mjs` |
| ③ | census 高シグナル数 | `npm run census` |
| ④ | 機構 worklist の残項目数 | §5.3 の索引 |
| ⑤ | 実機の残 `V-nn` 数 | §5.1 |
| ⑥ | 実装キューの残効果数 | `node scripts/archive/semanticAuditBugList.mjs` |

- ①〜③は底を打っている＝**動かないことを停滞と読まない**。進捗は④〜⑥で見る。
- 在庫は実測すると割れて増えることがある＝**増減の理由を1行書く**。バッチ着手時に「どれが動く見込みか」を宣言する。

### 横展開（系統バグ）のときの追加手順

①全シート走査で同じ壊れ方を機械抽出 → ②付録B の偽陽性を除外して系統を確定 → ③`effectId` をアンカーにパッチ → ④§2.1 ④〜⑤ → ⑤`BUGFIXES.md` へ追記 → §1 を入れ替え → commit / push。

### 機構実装の「型」

1. `src/types/effects.ts`（アクション/条件/timing の型）→ 2. `src/types/index.ts`（`PlayerState`）→ 3. `src/engine/effectExecutor.ts`／`execUtils.ts`（`evalCondition`/`matchesFilter`）／`effectEngine.ts`（CONTINUOUS収集）→ 4. `src/screens/BattleScreen.tsx`（状態読み取り＋**ターン境界リセット3箇所**：PvP通常終了・PvP確認後・CPU）→ 5. `scripts/decompileEffects.ts`（表示）→ 6. JSON 配線 → 検証。

### 主要ファイル

- 語彙: `src/types/effects.ts` / `src/types/index.ts`
- エンジン: `src/engine/effectExecutor.ts`・`execUtils.ts`・`effectEngine.ts`
- UI/ルール: `src/screens/BattleScreen.tsx` ＋ `src/screens/battle/`
- 逆翻訳器: `scripts/decompileEffects.ts`、グルーピング: `scripts/group{Similar,BySentence}.mjs`
- 監査: `scripts/behaviorAudit.ts`（`npm run audit`／`--json-out`）、`scripts/semanticAuditExtract.mjs`（JSON 軸）、`scripts/semanticAuditTraceExtract.mjs`（実行結果軸）

---

## 4. 教訓集 → 別ファイル

**この節に教訓を書かない。** 節番号 `§4.1`〜`§4.8` は住所として別ファイル側で維持している。

| ファイル | 中身 | 読むタイミング |
|---|---|---|
| **[LESSONS.md](./LESSONS.md)** | §4.1 着手前／§4.2 実装／§4.3 計器の読み方／§4.5 live へ届ける経路／§4.6 Codex への委譲／§4.7 意味照合と triage／§4.8 監視だけしている項目 | 🔑§5 のどの項目に着手するときも先に読む |
| **[DRIVE_TRAPS.md](./DRIVE_TRAPS.md)** | §4.4 実機シナリオの罠（番号つき・末尾に採番） | 実機シナリオを書く／直す回だけ |

---

## 5. 作業キュー（単一・上から取る）

> **上から1件**。並行して別の節から取らない。**消化したら行ごと消す**（全文は PLAN_DETAIL と BUGFIXES が正）。
> **残数は毎回コマンドで数え直して書く**（表の数字を足し引きしない）。経緯はこの節に書かない。

### 残作業の全体像 ★まずここを見る

| 順 | キュー | 残 | 中身 | 測り直すコマンド |
|---|---|---|---|---|
| **①** | **§5.1 実機 `V-nn`** | **0** | `src/screens/` を触った回・機構を足した回の返済先 | §5.1 の表 |
| **②** | **§5.3 機構 worklist `O-nn`** | **0** | 新しい型・評価器・engine が要るもの | §5.3 の索引 |
| **③** | **§5.0 実装キュー** | **0** | triage で BUG と確定した未修正の効果 | `node scripts/archive/semanticAuditBugList.mjs` |
| **④** | 🆕**§5.6 CPU 完成度 `C-nn`** | **0** | **プレイ駆動の発見器**＝CPU が撃たない機構＝未検査な向き | §5.6.2 の表 |
| 🔥**④b** | 🆕**§5.7 CPU の強さ `S-nn`** | **7** | 探索＋評価のゲーム AI（対戦中に LLM は呼ばない） | §5.7.1 の表 |
| **⑤** | **§5.2 意味照合** | **round6 完了** | 監査による新しい型の発見 | `semantic_audit_round6/TYPE_LEDGER.md` |
| **⑥** | **§5.6.2b ルール解釈の残件** | **0** | 裁定は全部済み。残りは Claude が取ってよい実装の穴 | §5.6.2b の表（全文は [RULES.md](./RULES.md) §2） |
| — | §5.4 構造混線 | **0** | 新しく見つけたときだけ足す | — |

**取る順**＝①実機（寝かせるほど切り分けが高くつく）→ ②機構（索引の並び順）→ ③実装キュー（機構不要の候補だけ）→ 🔥**④CPU 完成度（`C-9`／`C-8`。順は `census:play` の未踏で決める）** → ⑤意味照合（①〜④が空のとき）。
🔑**2026-09-16 現在は ①②③ が全部 0 なので ④ が本線**。§5.6 で見つかった engine/parser のバグは**その場で直す**（既定）か、新機構が要るなら §5.3 へ `O-nn` で登録する（§2 の1巡と同じ）。
索引 H（カード原文の解釈待ち）はユーザーの判断が出るまで取らない。§5.6.2b は**裁定済み**＝残件は取ってよい。

---

### 5.0 実装キュー（triage 済みの確定バグ）

**残0**（`node scripts/archive/semanticAuditBugList.mjs`＝在庫カウンタ と `semanticAuditQueue.mjs`＝候補プール は**一致するのが正**）。

- **per-effect の正本**＝各ラウンド dir の `triaged.txt` の `:: BUG ::` 行。finding を BUG と triage した瞬間に `semanticAuditPool.mjs` からも `census:cards` からも消えるので、**ここが唯一の追跡先**。
- **行を消してよいのは** (a) 直して golden を張った (b) 偽陽性と確定した (c) §5.3 へ `O-nn` で登録し直した ときだけ。

#### 1バッチの回し方（Codex 委譲）

```
# ① 候補を組む（引数なしなら残数・優先度だけ）
node scripts/archive/semanticAuditQueue.mjs --take 30 --out <scratchpad>
#    → batch.json と batch_table.md（指示書に貼る表）
# ② 指示書＝ scripts/archive/scratchpad/codex_batch_template.md をコピーして埋め、batch_table.md を貼る
# ③ 投入（先に git status --porcelain を空にする）
CODEX_HOME=/c/Users/zerom/.codex-work codex exec -C "C:/Users/zerom/WixossReact" \
  -c model_reasoning_effort="high" -o <report> - < <指示書> > <log> 2>&1
```

- 候補の母集団＝`triaged.txt` の `:: BUG ::` − `semantic_bug_fixed.txt` − `semantic_bug_deferred.txt`（外部状態に依存しない）。
- `pri=2`（機構が要ると明言）は既定で候補から外れる。
- Codex の「実装した」を信用しない＝Claude が `git diff`／`typecheck`／`golden`／`gates` で独立検証してから採用する。

#### 記録の付け方

- **直した** → `scripts/archive/scratchpad/semantic_bug_fixed.txt` に `<effectId> :: <日付> :: <一言>`。
- **直さないと判定した** → `semantic_bug_deferred.txt`（`MECH`／`STALE`／`FP`／`REGISTERED`）。在庫からは引かない（次バッチの候補から外すだけ）。
- 🔴**`MECH` には必ず `O-nn` を併記する**（無ければ同じ回に §5.3 へ新設）。
- 🔴**`O-nn` をクローズした回は、その登録票が引用する effectId を `semantic_bug_fixed.txt` へ書き、最後に在庫カウンタと §5.3 の残数を突き合わせる。**
- `triaged.txt` の行は消さない。
- モデルは1セッション内で切り替えない（簿記 → commit → `/clear` → `/model` の順）。

---

### 5.1 実機で確かめる（`V-nn`）

> 着手前に [DRIVE_TRAPS.md](./DRIVE_TRAPS.md) を読む。`verifyBattleDrive.mjs` は**必ず明示シナリオIDで**実行する（引数なしのフルバッチはフリーズ報告あり）。
> **FAIL の切り分け**＝(a) シナリオの腐り → その場で直す (b) engine/parser のバグ → その場で直す (c) 未実装 → §5.3 へ登録。

**残0**（直近＝🏁`V-284`＝**じゃんけんの「あいこ」で止まらない**＝2026-09-22 第451バッチで**ソースの形の回帰ガード**（予約の鍵・cleanup でタイマーを消さない・失敗時の解放・クリック経路の二重 commit 防止）＋**reducer の純関数検査**を張った。📏**反転確認＝修正前のソースでは4項目すべて FAIL**。⚠**実機シナリオは作っていない**＝じゃんけんはセットアップ中で `verifyBattleDrive.mjs` の対象外。代わりにハーネスへ**名前付きの失敗**を足した）。
（直近＝🏁`V-283`＝**コンボの「使い方」を画面から保存できる**＝2026-09-21 に `v268CpuDeckPlan` へ②'として足して PASS）。

（過去＝`V-281`＝`placeLevelTrashOver`／`V-282`＝`placeLevelTrashWithin`（反転＝ルリグ Lv3 なら同じ操作で出る）＝2026-09-18 に PASS。対象選択が候補1枚でも**出せる候補が0なら上限も0**＝「決定 (0/0)」だけが道（コストは払う・トラッシュに残る）の回帰ガード／`V-279`＝`placeLevelOver`／`V-280`＝`placeLevelWithin`（反転＝ルリグ Lv3 なら同じ操作で出せる）＝2026-09-18 に PASS。「場に出す」効果の配置レベル制限（`R-48`①）の回帰ガード＝超過候補は並ぶが決定ボタンが押せない（ボタン文言まで assert）／`V-264`＝`c9resonalimitexcess`＝2026-09-17 第401バッチで PASS。バニッシュ以外でもレゾナがルリグデッキへ戻る回帰ガード／`V-263`＝`c9lriglevellowered`＝2026-09-17 第400バッチで PASS。ルリグのレベル低下で超過したシグニの回帰ガード／`V-262`＝`v262LrigTypeClashBlocksAssist`＝2026-09-17 第399バッチで PASS＋判定を外すと golden FAIL。センターと同タイプのアシストを構築で弾く回帰ガード／`V-259`＝`c9levelupover`／`V-260`＝`c9levelupwithin`（反転＝レベルが上がっていなければ落とさない）／`V-261`＝`c9forcedextraturn`＝2026-09-17 第398バッチで PASS＋修正前のコードで FAIL を確認。レベル変動による超過と、強制終了時の追加ターンの回帰ガード／`V-256`＝`c9limitexcesspick`／`V-257`＝`c9limitwithin`（反転＝リミット内なら落とさない）／`V-258`＝`c9risesubcount`＝2026-09-17 第397バッチで PASS＋修正前のコードで FAIL を確認。リミット超過のルール処理とライズ置換の枚数の回帰ガード／`V-255`＝`c9removecleanup`＝2026-09-17 第396バッチで PASS＋修正前のコードで FAIL を確認。リムーブのゾーン後始末の回帰ガード／`V-253`＝`c9refreshturnend`／`V-254`＝`c9refreshturnendone`（反転＝1回目では終わらない）＝2026-09-17 第395バッチで PASS＋修正前のしきい値で FAIL を確認。2回目のリフレッシュでターンが終わる回帰ガード／`V-251`＝`c9resonabanish`／`V-252`＝`c9lrigtriplecrush`＝2026-09-17 第394バッチで PASS＋**修正前のコードで FAIL を確認**（レゾナがエナへ／トリプルが1枚）。レゾナの行き先とルリグの【トリプルクラッシュ】の回帰ガード／`V-248`〜`V-250`＝`c7cpukey`／`c7cpupiece`／`c7cpupieceonelrig`（反転＝ルリグ1体では使わない）＝2026-09-17 第393バッチで PASS。CPU のキー・ピースとピースの体数ルールの回帰ガード／`V-247`＝2026-09-17 第391バッチでクローズ＝CPU の起動の停止・二重実行。回帰ガード＝`v247AfterCpuRiseNoTrigger`（判別力あり）／`v247AfterCpuRise`／`v247AfterCpuAssistGrow`／`c3cpufirstturngrow`／`V-242`〜`V-246`＝`c2cpuguard`／`c4cpuhandlimit`／`c5cpuassistgrow`／`c5cpuresona`／`c6cpurise`＝2026-09-17 第390バッチで PASS。CPU のガード・手札上限・アシストグロウ・レゾナ・ライズの回帰ガード／`V-240`＝`c9lancerreplaced`／`V-241`＝`c9extraturnup`＝2026-09-17 第389バッチで PASS＋修正前のコードで FAIL を確認。ランサー置換とアップフェイズの受け手の回帰ガード／`V-239`＝`battleequalpower`＝2026-09-17 第388バッチで PASS。同値バトルの回帰ガード／`V-238`＝`bugreport`＝報告導線の回帰ガード／`V-237`＝`distinctlevelshortpick`＝`O-530` の実機ソフトロック回帰ガード）。

| ID | 観測点（何を見れば PASS か） | 出所 |
|---|---|---|

- `src/screens/` を触った回・新しい型や機構を足した回は `V-<次番号>` で登録する。**採番は `grep -o "scenarios\.v[0-9]\+" scripts/verifyBattleDrive.mjs | sort -n | tail` で実測する。**
- 観測点は**反転側まで**書く（効かないはずの側・帰結の数値＝DRIVE_TRAPS 109〜110）。
- **リリース前の通し対戦**＝`node scripts/verifyFullMatch.mjs`（`cpu`／`pvp` 片方も可。CPU 約4分／PvP 約33分）。`src/screens/` や engine の再入経路を触ってリリースする前に1回。
- `order` に入れたシナリオは返済後も外さない（壊れたら気づく番人）。

---

### 5.2 意味照合監査（semantic audit）

**現状**＝round4（全11シート）・段2 台帳・round5（全5,976枚）・**round6（R6-0／R6-1／R6-3・2026-09-16）は完了**。R6-2（LLM 監査）は R6-0 の再現率 6/16 で未達のためやらなかった。総括は `round6/TYPE_LEDGER.md`。
過去ラウンドの置き場＝`scripts/archive/scratchpad/semantic_audit_*`（round5 の総括は `semantic_audit_round5/TYPE_LEDGER.md`）。

#### round6 計画（原文 × 実行結果）

**狙い**＝round1〜5 は「原文 × effects JSON」を読ませたので、engine が JSON を裏で読み替える箇所は原理的に見えなかった。
round6 は **JSON を見せず、engine で解決した結果（初期盤面・選択・盤面差分・ログ）**を原文と並べる。
台帳＝`scripts/archive/scratchpad/semantic_audit_round6/TYPE_LEDGER.md`（試行の結果と、この計画の根拠）。
**方針**＝LLM を回す前にテスト盤面を広げ、機械で取れる不変条件を全数で取る。LLM は機械が言えない「原文と意味が違う」だけに使う。

**対象外**＝発動タイミング・トリガー条件／コストの支払い／【常】／対象を宣言する順序。これらは JSON 軸（round5 の道具）で見る。

| 段 | 何をするか | 道具 | 完了条件 |
|---|---|---|---|
| **R6-0** ハーネス整備（LLM 不使用） | ①位置の死角をふさぐ＝チャーム・アクセ・トラップ・シード・【マジックボックス】・除外領域を snapshot の「位置」として追跡 ②**盤面の変種**＝各効果を **基本／満杯**（両者シグニ3体・エナ多）／**枯渇**（手札0・デッキ1・トラッシュ0・エナ0）× 断る／受ける で解決 ③選択の**候補を全部**ラベルつきで出す | `scripts/behaviorAudit.ts --json-out`（`--ids-file` で全カード＝約100秒/変種） | ①`vanish_all_cards.txt` を作り直して「空きシグニゾーンなし」以外の (消滅) が **0** ②🔴**再現率セットで 9/16 以上**（試行は 6/16）。**届かなければ R6-2 をやらず R6-1 で閉じる** |
| **R6-1** 不変条件センサス（LLM 不使用・全カード × 変種） | **I1** カード保存則（消滅・二重存在）／**I2** 任意の不履行（ブロックに「てもよい」があるのに 断る＝受ける で差分が非空）／**I3** 辞退後の後続（「そうした場合」があるのに断るの差分が非空）／**I4** ログと差分の枚数不一致／**I5** 側跨ぎ（ブロックに「対戦相手」が無いのに相手の領域が動いた） | 新設 `scripts/censusTraceInvariants.mjs`（traces.json を読むだけ） | 5本とも**標本20件を判定して精度を台帳へ**。真バグは `O-nn`。候補出しであって判定ではない＝精度が出たものから `gates` へラチェット同梱。I1 は `O-524` 修正済み（2026-09-16）＝**0 でゲート化** |
| **R6-2** LLM 監査（codex） | 変種つきトレースを原文と照合。対象の順＝`round6/card_order.txt`（round5 以降に live が変わった 2,272枚）→ 残り。どの変種でも差分もログも空の効果は送らない | `semanticAuditTraceExtract.mjs` → `semanticAuditRunCodex.mjs`（`.codex-work`・10枚/バッチ） | 🔴**止め時＝台帳1行を30バッチ（300枚）とし、連続3行で新型0** |
| **R6-3** 締め | 再現率セットを測り直して台帳へ。ゲート化した不変条件を CLAUDE.md の検証コマンドへ登録 | — | 台帳の総括・`gates` 全緑 |

**triage の出口**＝§2.6 の BUG／ASK／FP に加えて **HARNESS**（テスト盤面・自動操縦・差分器のせいで出た偽陽性）→ **`behaviorAudit.ts` を直して該当バッチを作り直す**（読み方ルールに逃がさない）。

**再現率の測り方**（R6-0 と R6-3 で使う。期待値＝`round6/recall/expected.txt`）：
```
git worktree add --detach <scratchpad>/r5wt 40940e1f3
# PowerShell: New-Item -ItemType Junction -Path <scratchpad>\r5wt\node_modules -Target <repo>\node_modules
cp scripts/behaviorAudit.ts <scratchpad>/r5wt/scripts/   # ハーネスだけ最新にする
(cd <scratchpad>/r5wt && npx tsx scripts/behaviorAudit.ts --ids <expected.txt の16枚> --json-out <repo>/scripts/archive/scratchpad/semantic_audit_round6/recall/traces_recall.json)
node scripts/semanticAuditTraceExtract.mjs --out <recall dir> --traces <recall dir>/traces_recall.json --batch-size 8
CODEX_HOME="C:/Users/zerom/.codex-work" node scripts/semanticAuditRunCodex.mjs --out <recall dir>
# 後片付け: junction を rmdir で外してから git worktree remove --force（junction ごと消すと本体の node_modules が消える）
```
⚠`recall/raw/` があると再実行がスキップされる＝測り直すときは `recall/raw/` と `findings.jsonl` を退避してから。

#### JSON 軸（round5 まで）を回すとき

```
node scripts/semanticAuditExtract.mjs --out <dir> --cards-file <dir>/card_order.txt --batch-size 10
CODEX_HOME="C:/Users/zerom/.codex-work" node scripts/semanticAuditRunCodex.mjs --out <dir> --batches 1,2,...
```
- 読み方ルールを足したらプロンプトを作り直す（`raw/` のあるバッチは再実行されない）。消化したら `audited_cards_cumulative.txt` にカード番号、`TYPE_LEDGER.md` に1行。
- 🔴**findings をそのまま直さない**＝引き当てたら engine の受け皿を読んでから triage する。
- 止め時＝連続3バッチで新型0（§2.6）。

---

### 5.3 機構 worklist（新しい型・評価器・engine が要るもの）

> **索引（ここ）＝残数と一行だけ／登録票の全文＝[PLAN_DETAIL.md](./PLAN_DETAIL.md)**。🔴**ID を決めたら着手前に登録票を読む。**

**使い方**
1. 索引 **A' → A → B → G → I** の順に取る（母集団の大きい順。**I は parser 側で直すもの**）。欠番の C/D/F は閉じた枠＝再利用しない。
2. **母集団を実測し直す**（§2.1 ②）＝索引の数字は登録時点の上限値。**別名で grep し直す**（型のコメント・golden・`manualEffects.ts` まで）。
3. **レーンを決める**（§2.0）＝索引 G は速いレーンが既定、A/B は遅いレーン。

**登録のルール**
- 新規登録＝**索引に1行（表）＋ PLAN_DETAIL に登録票**。索引に経緯を書かない。
- 登録時に**母集団を実測して書く**（`S`/`M`/`L` は実装量の見立てであって母集団ではない）。
- **消化したら索引の行ごと消し**、§1／§6／この節の残数を直すところまでがクローズ。
- 実機で確かめるだけの項目はここに書かない（§5.1 へ `V-nn`）。

> 🔴**書式を守る（`census:cards` の `mech` フラグがこの節を機械で読む）**
> - 開いている項目は必ず `| \`O-nn\` |` で始まる表の行（ID セルの先頭に絵文字を置かない）。
> - **クローズ注記を残さない・不要なカード番号を書かない**（本文のカード番号は全部「機構待ち」に数えられる）。
> - 索引を全部消化したら見出しの下に `🏁**残0**` と書く（「書式が壊れた」と区別するため）。
> - 編集したら `npm run census:cards` で差分を見る。

**母集団の測り直し方**＝`node scripts/archive/censusMechPopulation.mjs [--id O-nn]`。「原文にフレーズがあるのに live にキーが無い」型の計器は受け皿の別名を知らないと必ず過大に出る＝**着手前のふるいであって残量の答えではない。**

#### 1〜3枚の項目の取り方（型を足す前に読む）

1. 🔑**まず受け皿を疑う**＝原文の言い回しで `src/` と `scripts/goldenTest.ts` を grep する。
2. **アクション側は `STUB` ハンドラ1本で書く**（`execStubPart*.ts`）。
3. 🔴**条件側には STUB の道が無い**＝`COND_STUB` は `return true`（無条件成立）。条件は**型＋`CONDITION_TYPES`＋`evalCondition`＋`checkActiveCondition`＋golden＋parser の6箇所**を揃える。
4. 1枚のために機構を作らないと決めてよい＝そのときは無言 no-op にせず id を `DEFERRED_*` へ改名し、理由をこの節に書く。

#### 索引 A'. 実機が出した配線ギャップ

🏁**残0**（`O-535` は 2026-09-19 にクローズ＝PLAN_DETAIL）

#### 索引 I. parser 側で直すもの

🏁**残0**（`O-536` は 2026-09-19 にクローズ＝PLAN_DETAIL）

#### 索引 A. 母集団2桁（遅いレーン）

🏁**残0**（`O-534` は 2026-09-18 にクローズ＝PLAN_DETAIL）

#### 索引 B. 母集団 3〜8効果

🏁**残0**（`O-532` は 2026-09-17 第397バッチでクローズ＝PLAN_DETAIL）

#### 索引 G. 母集団 1〜2効果（速いレーンが既定）

🏁**残0**（`O-533` は 2026-09-18 にクローズ＝PLAN_DETAIL）

#### 索引 H. ルール解釈待ち（Claude は取らない）

**原文コーパスで minimal pair が見つからなかったものだけ**を置く（§2.6）。ユーザーの判断が出たら、BUG なら索引 A/B/G へ移して母集団を測り直し、FP なら行を消して読み方ルールへ還元する。
**書き方**＝表の行の下に、項目ごとに「カード・原文・いまの実装の読み・読みA/B・コーパスで試したこととその結果」。

🏁**残0**（`O-528` は 2026-09-16 に読みA で決着＝PLAN_DETAIL）

#### 索引 E. 計器の較正・掃除（カードの挙動は変わらない）

🏁**残0**

⚠「計器が嘘をつく」形を見つけたらここへ足す。挙動を直したい回にここから取らない。

#### 個別カードの機構待ち・監視項目（worklist ではない）

> ここに実作業を置かない。残してよいのは根拠つき defer と監視だけ。stale と分かった記述はその場で消すか索引へ `O-nn` で出す。

**■ 根拠つき defer（着手前に理由が今も有効か再判定する）**

- **CPU 盤面評価 v2＝着手不要**（カードの正しさの穴ではない。v1＝`src/screens/battle/cpuBoardEval.ts`）。
- **`doPhaseAdvance` の pure 抽出＝やらない**（必要になった部分だけ切り出す）。
- **BEHAVIOR_AUDIT キューの消化＝休眠**＝高シグナルはシナリオの空振りがほとんど（[LESSONS.md](./LESSONS.md) §4.3）。盤面の変種は §5.2 round6 の R6-0 で作る。
  測り直す＝`npx tsx scripts/behaviorAudit.ts --queue > docs/_behavior_queue.txt` → `node scripts/_bqTriage.mjs`。

**■ 監視だけしている項目（着手不要・壊れたら気付く）**

[LESSONS.md](./LESSONS.md) §4.8 にある（ここへ書き戻さない＝本文のカード番号が `mech` に数えられる）。

**■ 測り直す計器（異常が出たら索引へ出す）**

- **同型★**＝`node scripts/groupSimilar.mjs --all`（いま **0**）。
- **BURST丸ごと欠落**＝**0**（CSV の BurstText あり × live に `LIFE_BURST` 無し）。
- **保護系キーワードの owner 誤り**＝測るコマンドが無い（測るなら計器を先に作る）。

### 5.4 原文照合テール（構造混線）

**残0**。原文と JSON の構造がズレた効果を新しく見つけたときだけ足す（着手前に現在の逆翻訳を読み直す）。
**測り直し方**＝`parseCardEffects` → `mergeManualEffects` を回して `parseStatus==='PARTIAL'` と `"type":"UNKNOWN"` を数える使い捨て（`tmp_*`）。

### 5.5 （廃止）

優先度を節の名前で表さない＝取る順は §5.3 の索引だけで表す。旧項目の移設先は [PLAN_DETAIL.md](./PLAN_DETAIL.md)「2026-09-12 登録：`O-348`〜`O-351`」。

---

### 5.6 CPU 完成度（`C-nn`）＝プレイ駆動の発見器


🏁**`C-10`〜`C-13` カットイン窓（スペル／ピース／レゾナ）**（2026-09-22 第452〜454バッチでクローズ）＝
📏母集団＝カットインできる札 **61カード**／**ユーザー作27デッキ中 7デッキ**（ピース窓・レゾナは**実デッキに0枚**）。
🏁`C-10`＝候補（`cutinCandidates.ts`）と実行（`controller/performCutinUse.ts`）の1本化／
🏁`C-11`＝**打ち消す価値を先読みで測る**（`cutinCounterGain`＋ポリシー `cutinGainMin`）／
🏁`C-12`＝**ピース応答窓**（`controller/resolvePendingPiece.ts` を画面から出してヘッドレスと共有）／
🏁`C-13`＝**レゾナのカットイン**（`pickCpuResonaSelection`／`pickCpuResonaZone` へ繋いだ）。
golden `§5.6 C-10`／`§5.6 C-10 第2段`／`§5.6 C-11`／`§5.6 C-12`／`§5.6 C-13`（全文は [BUGFIXES.md](./BUGFIXES.md) 第454バッチ）

> **2026-09-16 新設（ユーザー決定）。** §5.3 の索引が全部 残0 になり、**静的に読む計器（census／golden／smoke／fuzz／traceinv）では届かない層**だけが残った。
> その層＝**`BattleScreen.tsx`（16,486行）のオーケストレーション**（フェイズ進行・トリガー収集・スタック整列・コスト支払い・対話）。
> `selfPlayFuzz.ts` のヘッダが自分で「**React/supabase 結合のため本ファズの対象外**」と書いている領域で、`reduceBattle` で純粋化できているのは **18 action だけ**（`supabase` 直書きが 17箇所残）。

#### 5.6.0 なぜ CPU なのか（3行）

- 🔑**人間が遊ぶと、人間側の経路は全部踏まれる。踏まれないのは CPU 側の半分だけ。**
- 🔴このプロジェクトのバグ史は**向きの取り違え**（`owner:'self'` ↔ `'opponent'`）で埋まっている（`lifeCrashGate` の「正反対の `LIFE_CRASH{owner:'self'}` に化けていた」／`O-77`／第57バッチ）。
  ⇒ **CPU が撃たない機構は、「相手から撃たれたとき」が一度も試されていない**＝下の欠落表はそのまま**未検査な向きのリスト**。
- 🔑根拠になった実例＝**`O-530` は実機のソフトロック**（決定ボタンが永久に押せない）で、**5計器すべてが緑のまま**だった（実機シナリオを書いて初めて出た）。

#### 5.6.1 実測した CPU の欠落（2026-09-16・`BattleScreen.tsx` と `cpu*.ts` を走査）

| 機構 | 状態 | 根拠（実測） |
|---|---|---|
| ~~**ガード**~~ | 🏁`C-2`（2026-09-17） | `guardableHandIndices`（人間のダイアログと共通）→ `pickCpuGuardHandIndex` → `performGuardResponse` |
| ~~**ピース／リレーピース**~~ | 🏁`C-7`（2026-09-17） | 可否＝`checkKeyPieceUse`（人間と共通・体数ルール込み）→ `pickCpuKeyPiece` → `performKeyPiece` |
| ~~**キー（キープレイ）**~~ | 🏁`C-7`（2026-09-17） | 同上（キーの【起】は未対応＝場に出すまで） |
| ~~**レゾナ**~~ | 🏁`C-5`（2026-09-17） | 候補＝`getResonaSummonCandidate`／支払い＝`pickCpuResonaSelection`／実行＝`performSummonSigni`（人間と共通） |
| ~~**ライズ**~~ | 🏁`C-6`（2026-09-17） | 置き方＝`planRiseSummon`（人間の「召喚」ゲートと共通）／実行＝`performSummonSigni` |
| ~~**アシストグロウ**~~ | 🏁`C-5`（2026-09-17） | 候補＝`listAssistGrowCandidates`／実行＝`performAssistGrow`（人間と共通） |
| ~~**手札上限処理**~~ | 🏁`C-4`（2026-09-17） | `collectHandLimits` → `pickCpuHandLimitDiscards`（捨て札の誘発も人間と同じ収集） |
| ~~**マリガン**~~ | 🏁`C-4`（2026-09-17） | `pickCpuMulliganIndices` → `applyMulligan`（人間と共通） |
| ~~**対話応答**~~ | 🏁`C-8`（2026-09-17） | `cpuInteraction.ts`（対象・選択肢・サーチ・割り振り・ゾーン・配置し直し）＝方針は混合（損得が分かれば得な方／断る肢があればする／「AかB」は seed 付き乱数）。実行は人間と同じハンドラ |

- 🔑**ガードは試合の長さの主因**＝ルリグアタックが毎回素通りするので **CPU 戦は 8ターン / 232秒で終わる**（`verifyFullMatch.mjs` の実測注記）。ここを直すと**全機構の到達深度がまとめて伸びる**。
- 🏁**乱数の seam は `C-1` で入れた**（2026-09-16）。⚠**着手前の見立て「4箇所」は誤りで、実測は 11箇所**だった
  （`BattleScreen` 2／`execUtils` 1／`battleUtils` 1 に加え、**`effectExecutor` 1・`execStubPart1` 1・`execStubPart2` 2・`execStubPart3` 4**）。
  🔴うち4箇所は `sort(() => Math.random() - 0.5)`＝**一様でない偏ったシャッフル**（「デッキをシャッフルする」がほとんど混ざらない盤面を作りえた）。

#### 5.6.2 取る順（🔑「CPU が強くなる順」ではなく「踏まれていない経路が増える順」）

| ID | 機構 | 規模 | なぜこの順か |
|---|---|---|---|
| 🏁`C-0` | ~~バグ報告の導線~~ | S | **2026-09-16 クローズ**＝`EndConfirmModal`（`zIndex 9999`・最前面）に「バグを報告（対戦は続きます）」＋タグ5択＋任意コメント。`bug_reports` へ保存 → `npm run reports` で取り込み → `replayReport.mjs` で triage／注入。実機 `V-238` |
| 🏁`C-1` | ~~乱数の seed 化~~ | S | **2026-09-16 クローズ**＝`src/engine/rng.ts` が唯一の seam。11箇所を集約＋偏る sort シャッフル4箇所を解消。ラチェットは golden `§5.6 C-1`（`src/` を走査して増えたら FAIL） |
| 🏁`C-2` | ~~ガード判定~~ | S〜M | **2026-09-17 クローズ**＝可否を `guard.ts` `guardableHandIndices` へ出し（JSX から移設）、CPU は `pickCpuGuardHandIndex`（負ける／2枚以上割られる／ライフ2以下／ガード札2枚以上なら受ける・低レベルから）。実機 `V-242` |
| 🏁`C-3` | ~~機構踏破計器（`census:play`）~~ | S | **2026-09-17 クローズ**＝規則は `playCensus.ts`（ログ `[CPU] …` の正規表現＋anchor）。入力は `verifyFullMatch.mjs cpu` が書く `scratchpad-verify/playlogs-cpu.json`。golden が anchor の残存を検査 |
| 🏁`C-4` | ~~手札上限・マリガン~~ | S | **2026-09-17 クローズ**＝`mulligan.ts` `applyMulligan`（人間の JSX から移設）＋ CPU の END に手札上限。実機 `V-243` |
| 🏁`C-5` | ~~アシストグロウ・レゾナ~~ | M | **2026-09-17 クローズ**＝`assistGrow.ts`／`performAssistGrow`／`performSummonSigni`（`handleSummonSigni` を「誰が出すか」の引数で一般化）。ついでに**人間のアシストグロウが相手のアタックフェイズに押しても無反応**だった穴を修正。実機 `V-244`/`V-245` |
| 🏁`C-6` | ~~ライズ召喚（`O-147` の CPU 側）~~ | M | **2026-09-17 クローズ**＝`riseSummon.ts` `planRiseSummon`（人間の「召喚」ゲートの判定を移設）→ `performSummonSigni`。実機 `V-246` |
| 🏁`C-7` | ~~キー・ピース（【チーム】条件つき）~~ | M〜L | **2026-09-17 クローズ**＝`keyPieceUseGate.ts`（提示・モーダル・実行・CPU の1本）→ `cpuKeyPiece.ts` → `performKeyPiece`。ピースの体数ルールを実装（`R-53`）。実機 `V-248`〜`V-250` |
| 🏁`C-8` | ~~対話応答を pure 化＋方針つきに（`cpuInteraction.ts`）~~ | M | **2026-09-17 クローズ**＝判断は純関数（golden `§5.6 C-8`）・画面は呼ぶだけ。断る肢は `declines` だけでなく ID（`skip`/`none`/`no`）とラベルで見分ける（印だけだと実機6本が FAIL）。`census:play` に「選択肢：する側／断る側」。実機 `V-267` |
| 🔥`C-9` | **ルール規則の棚卸し**（バトル／ダメージ／フェイズ／ゾーン移動の行き先） | M〜L | **台帳＝[RULES.md](./RULES.md)**（公式ルールの1文 × 実装箇所 × 状態）。**2026-09-17 着手**＝✅1／🔴→✅15／👀19／**⚠0**（読み待ちは全部決着＝残件は §5.6.2b の下表）。取り方は RULES.md §4（⚠を上から・写経を全部数える・純関数＋golden） |

#### 5.6.2b ルール解釈の裁定と残件

> **全文（規則の原文・実装箇所・状態）は [RULES.md](./RULES.md) §2**。
> 🏁**2026-09-17 にユーザー裁定で5件とも決着**＝`R-50`（ピース＝ルリグトラッシュ＝いまの実装が正）／
> `R-48`（配置制限＋レベル変動で超過したら落とす）／`R-45b`（クラフトは場を離れると除外）／
> `R-27`（強制終了でも追加ターンを開始する）／`R-47`（**構築の制限**＝センターと同じルリグタイプの
> アシストは入れられない＝場のルール処理は要らない）。実装は第398・399バッチ（BUGFIXES）。
> ＋`R-54`（〈ルリグ〉限定は**センタールリグだけ**を参照）を台帳へ追加＝実装と一致を確認済み。

**決着した項目の残件**＝🏁**0件**（最後の `R-47` の既存デッキは 2026-09-17 にユーザーが保存済みデッキを全消去して決着＝対戦開始時の検証は足さない）

#### 5.6.3 規律（`cpu*.ts` の既存5本と同じ＝[DESIGN.md](./DESIGN.md) §4）

1. 🔴**可否の判定は書かない**＝`*Gate.ts`（`signiActivateGate` / `artsUseGate` / `spellUseGate` / `signiAttackGate` …）が唯一の権威。
   ⚠写経すると「**人間には見えないのに CPU は使える**」型の無言のズレになり、ゲートにも census にも映らない。
2. 🔴**実行も書かない**＝人間と同じ関数（`performSigniActivated` / `handleGuardResponse` / `performSigniAttack` …）を呼ぶ。**CPU 専用の実行経路を作らない。**
3. CPU 側が担うのは「**通った候補から1つ選ぶ**」だけ＝純関数として `src/screens/battle/cpu*.ts` に置き、**golden から import して固定する**。
4. 🔴**コストは allowlist**（`cpuActivate.ts` の規約）＝「CPU が支払い内訳を自動で決められるキー」だけを載せる。denylist にすると**新しいコストキーが増えたとき CPU が黙って踏み倒す**側へ倒れる。
5. 🔴**半分だけ実装しない**＝選択経路を与えられないなら fail-closed で候補から外す（`O-147` の CPU ライズがこの形）。

#### 5.6.4 進捗指標と止め時

- 📊**指標は `C-3` の機構踏破表1本**（既存の3計器はどれも静的に読むので**動かない**＝「停滞」と読まない）。
- 🏁**止め時**＝①**機構踏破表が全機構 ≥1回**（機械判定）かつ ②**連続3バッチで新しい型0**（§2.6 と同じ規約）。
  ⚠**「CPU が強くなったら」を止め時にしない**＝目的は発見であって AI の強さではない。

#### 5.6.4b 報告の流れ（🏁`C-0`・2026-09-16 完了）

1. **アプリ**＝右上「終了」（`SystemOverlays`・`zIndex 9998`・「エラーで画面が固まっても操作できる」）→ 確認ダイアログ（`zIndex 9999`）
   → **「バグを報告（対戦は続きます）」** → タグ5択（進まない／出ない／起きるはずがない／順番／その他）＋任意コメント → 送信 → **対戦に戻る**。
   🔑**報告しても終了しない**＝終了に同居させると「変だったけど続けられる」型が報告されなくなる。
2. **取り込み**＝`npm run reports`（`--list` は下見・`--keep-open` は消化印を書かない）→ `scratchpad-reports/` に落として `OPEN → TRIAGED`。
   🔴🔑**RLS は既定が「本人の行だけ」**＝**遊ぶ人と取り込む人が別アカウントなら、DB に届いていても1件も出ない**
   （2026-09-16 に実際に踏んだ）。⇒ 取り込み用アカウント（`claude1`＝`a523368e-…`）に「全件読める」ポリシーを足してある。
   ⚠**0件を「報告が無い」と即断しない**（スクリプトがその切り分けを促す警告を出す）。
3. 🔥**撃ち直す**＝`node scripts/replayReport.mjs <file> --replay`（実体＝`scripts/replayReportEngine.ts`・**engine だけ・数秒・無料**）＝
   ログに出てくる効果を報告の盤面で1つずつ撃ち直し、**原文 × 提示 × 請求 × 盤面差分 × engine ログ**を並べる。
   🔴🔑**コードを読んで推論する前に必ずこれを回す**（2026-09-20 ユーザー提案）＝報告 `c32a37ce` は**推論で2往復ムダにした**。
   出る型＝「原文は"場に出す"なのに盤面差分なし」「原文は《黒×0》なのに請求が満額」「撃てないはずなのに撃てる」。
   ⚠**盤面は報告を送った時点の1枚**＝ログ各行の時点ではない＝「数ターン前の状態に依存する」型は出ない。
4. **triage**＝**複数件なら先に `node scripts/replayReport.mjs`（引数なし）**＝溜まった報告を1画面で一覧し、
   **同じ症状らしい束**（タグ×フェイズ×開いている対話×最後のログ）をまとめる。⚠束は「同じバグ」の保証ではない＝代表1件を読んで確かめる。
   1件を詳しく＝`node scripts/replayReport.mjs <file>`＝局面・開いている対話・ログ末尾を出す。
   ⚠**1件 ≒ 20KB**（実測）＝生の JSON を何件も開かない。取り込みは何件でも通る（実測6件・消化印は50件ずつに分割）。
   **実機で見たい**＝`--inject`＝claude1 の PLAYING ルームへ**全行復元**（ID は再帰的に張り替える）。
   🔴**`injectScenario` は使わない**＝あちらはシナリオ汚染対策で**一時状態を全部消す**が、報告の再現で欲しいのは真逆。

#### 5.6.5 デッキ（ユーザー担当・2026-09-16 決定）

- **CPU のデッキはアプリ内で作れる**（既存の `MatchmakingScreen` の `CPU_DECK_SELECT` ステップ＝`decks` テーブルから選ぶ）。条件は `validDecks` の2つだけ＝**メイン40枚**かつ**ルリグデッキに Lv0 のルリグがある**こと。
- 🔑**選定基準はカードではなく「機構」**＝カードの網羅は生成器（将来）に任せ、手作りデッキは**踏む機構が重ならないこと**を狙う（上の踏破表の軸）。
- 🆕🔑**実戦的な CPU デッキはユーザーが作っている**（2026-09-20 共有）＝**アカウント `カルカドール`**。実測 **27件（CPU 21 / プレイヤー 6・うち26件がメイン40枚・作戦データ `cpu_plan` つき5件）**。
  🔴**認証情報は `verify-accounts.json`（`.gitignore` 圏内）にだけ置く＝docs にもスクリプトにも書かない。** クローンし直した環境では付いてこないので、ユーザーに再共有してもらう。
  **見る**＝`node scripts/listDecks.mjs`（一覧）／`--cpu`（CPU 用だけ）／`--name <名前の一部>`（中身をカード名つき）／`--user <別アカウント>`／`--export <dir>`（JSON 書き出し・gitignore 圏内）。
  ⚠**RLS は既定が「本人の行だけ」**＝ログインしたアカウントのデッキしか返らない（0件を「無い」と即断しない）。
  ⚠**`deck_format` は全件 `null`**（v0.512 で新設した列＝既存デッキには未設定）。
- 🏁**ハーネスとの往復は通った**（2026-09-20）＝**`node scripts/importDecks.mjs --apply`** で `カルカドール` のデッキを `claude1` へ取り込み、
  **`DECK="<名前>" node scripts/verifyFullMatch.mjs cpu`** で通し対戦が回る（実測＝`ケトッシー軸` で **PASS・6ターン/125手**）。
  取り込みは**冪等**（同一なら何もしない）で、**`player` と `cpu` の両方**を作る（通し対戦は種別の違う2つの山から選ぶ）。
  🔴**書き込み先は `harnessAccounts()` に限る**＝`harness:false`（ユーザー本人）へは書かない。
  ⚠`verify-deck.json` は **`.gitignore` 圏内**＝クローンし直すと `VERIFY_DECK` は再現できない（`verify-accounts.json` があれば `importDecks.mjs` で作り直せる）。
  🆕**機構踏破も測れる**＝`npm run census:play -- --file scratchpad-verify/playlogs-cpu-<デッキ名>.json`
  （`ケトッシー軸` の初回実測＝**踏破 7 / 23 機構**＝スペル・アーツ・【起】・アシスト系が未踏＝**山にその札が無い**）。

#### 5.6.6 いまはやらないと決めたこと

- 🔴**`BattleScreen.tsx` の完全ヘッドレス化**＝16,486行に対し `reduceBattle` は **18 action**、投資が桁で大きい。
  ブラウザ実行でも **1戦232秒＝一晩で約120戦**回るので、**回してみて「遅すぎる」と数字で言えてから**着手する。
- **LLM 監査バッチ**＝§2.6 の実績（precision 50%／266バッチ ≒ 940万トークン）から割に合わない。
  🔑この線での LLM（Opus）の役割は**「人間が遊んで見つけた型を、その場で機械の全数検出に翻訳する」ことだけ**。

### 5.7 CPU の強さ（`S-nn`）＝強い CPU を作る

> **2026-09-17 新設（ユーザー決定）。** §5.6 は「CPU が機構を**踏めるか**」だった（🏁`C-0`〜`C-8`）。ここからは「CPU が**強く打てるか**」。
> ユーザーの問題意識＝①使うデッキで強い行動が変わる ②数手先まで考えたほうが強い ③パワーが低くても効果が強いカードがある ④複数カードのコンボが強い。
> 🆕**2026-09-19 追加（ユーザー）**＝⑤**相手の盤面と自分の取れうる手段を読み、そのターンの最善を打ってほしい** ⑥**次のターンのためのリソースを残す** ⑦**サーチなど自分のデッキを把握して手段を増やす**。
> ⇒ **§5.7.0 に第2版の決定を追記した**（ターンを `ATTACK_ARTS_OP` で2ブロックに割って探索する／到達点は「読み落としが少ない中級者」／カンニングの線引き）。

#### 5.7.0 決めたこと（2026-09-17）

- 🔴**対戦中に LLM を呼ばない**＝有料 API はプレイ数に比例して費用が増える／無料枠は上限・規約が変わる／ブラウザ内の小型 LLM は日本語のカード文とルール判断が弱い。
  ⇒ **チェス・将棋の CPU と同じ「探索＋評価」のゲーム AI**を作る（端末で軽く動き、人数が増えても費用ゼロ）。
- 🔑LLM（Claude Code）は**作るときだけ**使う＝CPU デッキの作戦データの下書き等（プラン枠内・API 料金なし）。
- 🔑**機械学習は `S-3` のシミュレータができてから**＝どの方式も「画面なしで対戦を大量に回す」ことが前提。順は ①評価の重みを自己対戦で調整 → ②カード／コンボの強さを対戦統計から学ぶ → ③強化学習（重い・最後）。
- 🔴**規律は §5.6.3 のまま**＝可否の判定・実行は書かない（`*Gate.ts`／人間と同じ実行関数）。CPU は「通った候補から選ぶ」純関数だけを強くする。
- 🆕🔴**2026-09-19 ユーザー決定＝ターンを2ブロックに割って探索する**（第2版）。🔑**割る場所は実装のフェイズ境界とそのまま一致する**（`TurnPhase`＝`src/types/index.ts:83`）＝
  `ENERGY → GROW → MAIN → ATTACK_ARTS`｜**`ATTACK_ARTS_OP`（相手の妨害）**｜`ATTACK_SIGNI → ATTACK_LRIG`。**新しい配管は要らない。**
  **根拠（ユーザー）＝ウィクロスは自分のターンに相手が動くことが少ない**＝メインフェイズの割り込みは相手の【自】とスペルカットインだけで、まとまった妨害は相手のアーツステップに来る。
  ⇒ **前半は相手の応答を無視して探索してよい**（近似として妥当）／**後半は妨害された実際の盤面から探索し、そこで初めて相手の返しを見る**。
  🔑**ターン全体を1本で探索する必要が消える**＝枝の積が和に落ちる（`S-16` と `S-17` が独立した探索になる）。
- 🆕**到達点は「読み落としが少ない中級者」**（2026-09-19 ユーザー決定）＝相手の手札・ライフバースト・デッキは非公開なので**真の最善は原理的に不可能**（不完全情報ゲーム）。
  🔑**上限を決めるのは探索幅ではなく評価関数の質**＝だから `S-10`／`S-18` を探索より前・直後に置く。
- 🆕🔴**カンニングの線引き＝「山の中身（集合）は知ってよい／山の順序は見てはいけない」**＝デッキを組んだのは CPU 自身なので集合は正当な情報
  （サーチの価値は「山に残るキーカード枚数 ÷ 山の残枚数」の期待値で出せる＝`S-2` の作戦データのキーカード指定とそのまま繋がる）。
  ⚠**いまの先読みはこの線を既に越えている**＝`simulateEffect` は実 state を clone して engine に渡すので、**ドローをシミュレートすると本物の山の一番上を引く**（`S-16` の前提）。

#### 5.7.1 取る順

| ID | 内容 | 規模 | 何が良くなるか |
|---|---|---|---|
| 🏁`S-1` | ~~**カードの強さ表**~~ | 数時間〜1日 | **2026-09-17 クローズ**＝`cpuCardStrength.ts`（効果 JSON の特徴量→パワー換算・文脈 deploy/field）。使う場所＝召喚（`pickCpuDeployCard` の `value`・最後の【ガード】は出さない）／対象・サーチ・割り振り（`cpuInteraction.ts`）／手札上限の捨て札／**エナチャージ（旧＝手札の先頭固定）**。golden `§5.7 S-1` |
| 🏁`S-2` | ~~**CPU デッキごとの作戦データ**~~ | 1〜2日 | **2026-09-17 クローズ**＝`decks.cpu_plan`（キーカード／優先して出す札／コンボ「A の後に B」）。判断は `cpuDeckPlan.ts`（強さに足し引き）→ 召喚・エナチャージ・手札上限・マリガン・サーチ。編集はデッキ設定「🤖 CPU の作戦」（`CpuDeckPlanModal`）。golden `§5.7 S-2`／実機 `V-268` |
| 🏁`S-3` | ~~**1ターン分のシミュレータの見積もり**~~ | 調査 | **2026-09-17 クローズ**＝実測と3案は §5.7.3。🔑**ユーザー決定＝A（`S-4`）で先読みの効果を先に確かめ、そのあと C（`S-5`）へ段階的に進む** |
| 🏁`S-4` | ~~**A 浅い先読み**~~ | 2〜4日 | **2026-09-17 クローズ**＝`cpuLookahead.ts`（自動応答つきの効果解決＋盤面の採点＝場の強さ・正面が空いている数・相手の凍結・ライフ／手札／エナ）。召喚＝`scoreDeploy`（【出】の結果）／スペル＝結果が `SPELL_GAIN_MIN` 以上良くなるものを除去以外も使う／攻めのアーツ＝候補のうち一番得なもの（使う条件は据置）。golden `§5.7 S-4`／実機 `V-269`。🔴同時に **CPU がブースト等の任意コストを持つアーツ・スペル（約230効果）を使っていなかった**退化を修正（`O-86` 後） |
| 🏁`S-7` | ~~**場以外の【起】を CPU が使う**~~ | 1〜2日 | **2026-09-18 クローズ**＝提示判定 `offFieldActivateGate.ts`（人間の3入口と共有）／実行は人間と同じ `executeTrashActivated`・`executeHandActivated`（行為者つき）／選択 `cpuOffFieldActivate.ts`（払ったあとの盤面を先読みして得なものだけ・グロウ用エナの予約）。窓＝CPU のターンの MAIN・ATTACK_ARTS（トラッシュ・手札・エナ）＋**人間のターンのアーツステップ `ATTACK_ARTS_OP`（手札の《アタックフェイズアイコン》【起】で応答）**。実機 `V-273`／`V-274`／`V-276`・`V-276b` |
| 🏁`S-5` | ~~**C 対戦丸ごとのシミュレータ**~~（§5.7.3 の案C・段階的） | 3〜5週間 | **2026-09-19 クローズ**＝**画面も DB も無しで CPU 同士が決着まで回る**（`npm run selfplay`＝1戦 ≒ 300〜430手・14〜18ターン・約35秒／`gates` 同梱＝`idle`・`cap` で exit 1）。段＝🏁`S-5a` メモリ上の persist＋`resolveStackNext`（`controller/memoryPersist.ts`・`controller/stackResolve.ts`）→ 🏁`S-5b` 盤面差分トリガー（`controller/boardDiffTriggers.ts`）→ 🏁`S-5c` 実行関数 `perform*` 12本・ルール処理4本・`cpuTurnAction`（`controller/`）→ 🏁`S-5d` 相手側の応答と人間側ターンの駆動（第1段＝対話の解決7本 `controller/effectInteraction.ts`／第2段＝CPU の対話応答の振り分け `battle/cpuInteractionRespond.ts`／第3段＝材料 `controller/battleMaterials.ts`・ルール処理8本 `controller/ruleChecks.ts`・対戦ループ `controller/headlessMatch.ts`＋**席の鏡** `mirrorSeats`）。⚠**対戦開始（じゃんけん・マリガン・ルリグ配置）はハーネス側で組んでいる**＝画面の SETUP 経路は未移設（要るようになったら移す）。🔑**相手の「バニッシュされたとき」を判断に入れる**（2026-09-18 ユーザー指示）は**判断側＝`S-17`**（`S-8` を吸収。要件メモは [PLAN_DETAIL.md](./PLAN_DETAIL.md)）。 |
| 🔵`S-6` | **機械学習①＝自己対戦で重みを調整**。🏁**第1段＝分岐スクリーニング**（`npm run selfplay:scan`・`scripts/cpuWeightScan.ts`・golden `§5.7 S-6`）＝**候補を両席に置いて1戦回し、打った手の並びを基準と突き合わせる**＝**1候補1戦（35秒）**で「判断を変えるか」が分かる。🏁**第2段（2026-09-21）＝①調整できる49個を全部 `--a-set` で振れるようにした**（`strength.` 14／`keyword.` 8／`plan.` 6／`guardKeepValue` 1 を `CpuPolicy` へ・**値は不変**）**②93候補 × 6デッキ × 2シード＝1,128対戦を全数走査**（判断を変えるのは**93候補中57件**・分岐0 の36件は原因が(a)山に札が無い／(e)順位が反転しない）**③多次元 A/B 4束（各96戦）＝全6デッキで「差があるとは言えない」＝合計 24-144-24 のちょうど五分**。🔴🔑**ここで壁に当たった**＝**分岐しているのに勝率が動かない**（`actionBias` は 12/12 分岐で勝率 42.9%）＝**192組の75%が1勝1敗＝勝敗の二値が情報の4分の3を捨てている**。1候補8分で決着する組は10〜14しか出ず、下限が50%を超えるには70%以上が要る＝**検出できるのは大きな差だけ**。🏁**`S-27`（測定台の感度）で測り直した（2026-09-21）＝4束とも「ライフ半枚ぶんより大きい差は無い」**＝**微調整に差が無いことを測り切った**。⤵🔵**第3段があるとすれば「小さく振る」のをやめて****①大きく振る**（桁で変える・`fieldPowerScale` を 0 や 1 にする等）**②効く場所が無い数値を先に直す**（`S-26`）**③測れる山を用意する**（`plan.*` は `keyCards` 1枚・`combos` 1つしか無く測れない＝`S-14`）のどれか。🔴**同じ幅で振り直しても結論は変わらない**（実測済み）。 | 大 | 手で決めた重みを勝率で置き換える |
| 🔴`S-33` | **エナゾーンのアクセ【起】を CPU が使わない**（バグ報告 `a4d1cc1b`・2026-09-22） | 中 | 《コードイート　マヨ／ケチャ》ほか**アクセ付与の【起】 live 28効果 / 28カード**（`ATTACH_ACCE`・`timing:MAIN`）。人間は `BattleScreen.tsx` の専用ボタン（「【アクセ】」）で使えるが、**JSON に `energyActivated` が立っていない**ので CPU の場以外の【起】（`offFieldActivateGate`＝`S-7`）に1件も出ない。⚠直すには①ゲートにエナの `ATTACH_ACCE` を入れる ②`offFieldActivateExec.ts` にエナの入口（いまは手札とトラッシュだけ）③付け先のシグニの選び方 ④探索の近似適用（`applyCpuMoveSim`）⑤`census:play` の規則＝**`src/screens/` を触るので実機まで必須** |
| 🏁`S-34` | ~~**CPU が【ベット】を判断する**~~ | 小〜中 | **2026-09-22 クローズ**（ユーザー要望）＝`cpuBet.ts`（先読みの差 ≥ `betCoinValue`×枚数／先読みが無ければ「ベットでだけ除去の対象がいる」とき）。旧挙動は `legacy-bet`。A/B 48戦＝差なし。⚠枚数を選べるベット（1効果）は未対応。golden「CPU のベット判断」 |
| 🏁`S-9` | ~~**強さの A/B 測定台**~~ | 小 | **2026-09-20 クローズ**＝`npm run selfplay:ab -- --a <名> --b <名> --games N [--jobs N] [--first host|guest]`。①席ごとのポリシー（`cpuPolicy.ts`＝`CpuPolicy`／既定値の在処をここ1つにした）②**1シード＝2戦の席入れ替え** ③Wilson 95% 区間（`scripts/selfPlayStats.ts`）＋子プロセス並列（8ジョブで約7倍）。検算＝`default` 同士で**ちょうど 50.0%**・決定論は同一。golden `§5.7 S-9`／実機 `verifyFullMatch.mjs cpu` PASS |
| 🏁`S-10` | ~~**盤面の採点のパワー項**~~ | 小〜中 | **2026-09-20 クローズ**＝`evaluateBoard` を線形から閾値へ（①生パワー `fieldPowerScale` 0.25 ②`laneWin` 1500＝正面とのバトルに勝てているレーン差 ③**パワー0以下は居ないものとして数える**）。旧は `CPU_POLICIES['legacy-power']`。**370戦 A/B で 50.0% [44.9, 55.1]＝下がらず**／過剰使用は **46.6%→0.1%**。golden `§5.7 S-10`／実機 PASS |
| 🏁`S-15` | ~~**候補列挙器 `listCpuMoves`**~~ | 中 | **2026-09-20 クローズ**＝`cpuMoves.ts`（12種の `CpuMove`・支払いの内訳まで決めた形）。各 `pickCpu*` を「列挙 `listCpu*`／選ぶ」に割り、`tryCpu*` も同じ入力の組み立てを通す（道は1本）。**挙動不変**（自己対戦3シードの全ログが一致）＋**「打った手は必ず列挙に出ている」を selfplay・golden で常時照合**。実測＝MAIN 候補 中央2・p90 8・最大18／**engine だけの1手適用 平均0.3ms**。⤵`S-11`・`S-12` の「選ぶ側」は `S-16` へ持ち越し |
| 🏁`S-16` | ~~**前半ブロックの探索**~~ | 大 | **2026-09-20 クローズ**＝`cpuSearch.ts`（列挙 `S-15` → 近似適用 `applyCpuMoveSim` → 採点 `evaluateBoard` のビーム）＋ `cpuTurnAction` の MAIN へ配線（**実行は人間と同じ `perform*`**・召喚はループが置く・扱えない4種は従来の優先順）。**入切は `searchWidth`/`searchDepth`・既定 0＝オフ**。**A/B 80戦で 50.0% [39.3, 60.7]＝従来と互角**（最初の 72.5% は**配線のバグ**＝1ターン1体しか置けなかった＝修正済み）。⇒ **既定を上げるのは `S-21`（目的関数）の後**。⤵`S-13` を吸収 |
| 🏁`S-21` | ~~**探索の目的関数**~~ | 中 | **2026-09-20 クローズ**＝①**計器を割った**（`candidates`/`applied`/`actionScore`）＝「打たない58」は **候補0 12＋却下46（うち 34 は本番が探索を呼ばない ENERGY）**＝**本番の問題は MAIN の 12件だけ**。②🔴**探索が【起】のエナ以外のコストを1つも払っていなかった**（live **569効果**）→ `payCpuSelfCostSim`。③数値を2本追加（`turnDamage`＝案①の安い形・`actionBias`＝案③の連続版、**どちらも既定 0＝実機不変**）。④🔴**A/B の読み方を直した**＝主の判定を**組**へ（`pairRate`）。**3本とも差なし⇒ `default` には何も採用しない**（全文は [PLAN_DETAIL.md](./PLAN_DETAIL.md)） |
| 🏁`S-17` | ~~**後半ブロックの探索**~~（`ATTACK_SIGNI`／`ATTACK_LRIG`） | 大 | **2026-09-21 クローズ**（全3段・**既定オフのまま**＝`CpuPolicy.searchAttacks` false）。🏁第1段＝アタックを候補列挙へ（`signiAttack`／`lrigAttack`）🏁第2段＝近似適用（`simAttack`）と探索の配線＝**決めるのは順番だけ**🏁第3段＝**期待損**（`CpuSimBoard.risk`＋`cpuAttackRisk.ts`・公開ゾーンだけ・超幾何）と「撃たない」判断（4条件）。📏A/B は**全段で「差があるとは言えない」**（第3段＝6デッキ96戦の46/48組が1勝1敗）。🔑**閾値は解析で出る**＝ライフ1枚＝`life − energy = 6000` ／ 期待損＝`p × lifeBurstCost`（`p ≤ 1`）⇒ **実測のバースト価値（平均2,960・p90 6,000）では「撃たない」は成立しない**（2500 で0件・12000 で45件と実測）。⤵**残りは `S-6`**（`lifeBurstCost` / `guardDeckCount` も学習対象）。⤵**`S-8` を吸収**。登録票は [PLAN_DETAIL.md](./PLAN_DETAIL.md) |
| 🏁`S-18` | ~~**終端評価の「次ターン」項**~~ | 小〜中 | **2026-09-20 クローズ**＝`BoardWeights` に4項（**`lrigLevel` 2500＝グロウの価値**／`growReady` 2500＝次のグロウを払えるか（**グロウ後は確保済み**）／`handEmpty` -2000／`guardKept` 800）。🔴左右対称に数える（`guardKept` だけ自分側＝相手の手札は非公開）。旧は `legacy-nextturn`。**探索の「打たない」 74→58・一致 24→40・グロウを選ぶようになった**。⚠**勝率では測れない**（80戦で 51.2% [40.5, 61.9]＝席の偏りに埋もれる）。golden `§5.7 S-18` |
| 🏁`S-19` | ~~**先攻が勝てない（28.1%）**~~ | 中 | **2026-09-20 クローズ（再計測で否定）**＝`S-23` で**本物のデッキ4つの総当たり96戦**を測ると **先攻 59.4% [49.4, 68.7]**＝合成デッキの **28.1% [18.6, 40.1]** と**区間が重ならない**。⇒ **engine の先攻不利ではなく `VERIFY_DECK_MECH` 固有の偏り**（ライズ・レゾナ・キー・ピースを詰めた計器用の山）。🔑**「勝率の偏り」は山の性質を測っていることがある**＝ポリシーの A/B と同じで**山を書かずに勝率を語らない**。⚠合成デッキ側の偏りの原因は未解明（`selfplay` のゲートはこの山のまま＝決定論の確認用なので害は無い） |
| 🏁`S-20` | ~~**A/B の山が「測りたい型」を踏んでいない**~~ | 中 | **2026-09-20 クローズ**＝`S-23` と同時に消化。①**`--deck` / `--deck-a` / `--deck-b` / `--decks`（総当たり）**を追加（既定の山は不変）③**出力に「その山が踏みうる型の数」を必ず出す**（`formatDeckCoverage`）。**実測＝既定の山 23種／ユーザー作26デッキの和集合 85種（64種は既定の山に出てこない）**・**`POWER_MODIFY` は既定の山 0枚 / 26デッキ中23デッキ**。⤵②「型ごとの山を1つずつ足す」は**やらない**＝本物のデッキがその役を果たす |
| 🏁`S-23` | ~~**本物のデッキで CPU を測る**~~ | 中 | **2026-09-20 クローズ**＝`scripts/selfPlayDecks.ts`（書き出した本物のデッキを山として解決・**一意でなければ例外**）＋`headlessSelfPlay.ts` の `--deck*`／`--decks`（総当たり）／`--logs-out`＋`headlessMatch.ts` の**席ごとの作戦データ**（`cpuPlans`）＋`censusPlay.ts` の `--dir`/`--grep`。**実測＝総当たり4デッキ96戦（止まり0）＝WD13 75.0% ＞ 天使軸1 60.4% ＞ ケトッシー軸 45.8% ＞ WD06 18.8%**／**山ごとの機構踏破 13〜14 / 23**（実機1戦の 7/23 の倍）。golden `§5.7 S-23`／実機 `verifyFullMatch.mjs cpu` PASS |
| 🏁`S-25` | ~~**探索の勝率を本物のデッキで測り直す**~~ | 中 | **2026-09-21 クローズ（測り切った）**＝①🏁**既定を `searchWidth/Depth: 4/4` へ上げた**（ユーザー決定・旧値は `legacy-greedy`）＝根拠は**6デッキ × 8シード＝96戦で 合算 組 83.3% [66.4, 92.7]**（強い＝ケトッシー軸 8-0-0／天使軸1 6-2-0／WD06 6-2-0｜差なし＝WD15・WD16｜**弱い＝WD13 だけ**）。②🔴**WD13 が弱い原因は「単一の重みのズレ」では説明も修復もできない**＝`fieldPowerScale=1` は WD13 単体では 2-6-0 だが、**6デッキへ広げると合算 組 53.8% [29.1, 76.8]＝ほぼ五分**（`hand=800` は **0-8-0＝1組も動かない**／`openLane=1500` 0-7-1／`turnDamage` 混在）。⇒ **多次元の調整は `S-6` の仕事**（重み同士が干渉するので1本ずつ動かしても見つからない）。🆕**道具を2つ残した**＝**`--a-set "key=数値"`**（`patchCpuPolicy`）と**ポリシー × 山の表**（`--a <p> --b <p> --decks "…"`）＝**1候補の評価が6デッキ × 8シードで8分**＝`S-6` が回せる状態になった。 |
| 🏁`S-24` | ~~**自己対戦がマリガンを一度も踏まない**~~ | 小〜中 | **2026-09-21 クローズ**＝判断（`pickCpuMulliganIndices`）も実行（`applyMulligan`）も純関数だったのに、**繋いでログを出す段が画面にしか無かった**＝ヘッドレスは戻す札を空にした固定呼び出しで**マリガンを1度も踏んでいなかった**（`S-2` の判断が A/B に乗っていなかった）。⇒ 🆕**`controller/performMulligan.ts`**（画面も自己対戦も同じ1本）＋`createHeadlessMatch` の **`initialLogs`**。📏母集団＝本物のデッキ6つ × 400手札で**初手の 87% がマリガン対象**。🆕**規則はユーザー決定＝「レベル1を優先して持つ」**（Lv1 が2枚未満なら Lv2 も戻して掘る＝`mulliganLv1Target`・旧規則は `legacy-mulligan`）＝**Lv1 が0枚の手札 6.1% → 4.1%**。📏計器＝`census:play` の `mulligan` が自己対戦で **0 → 全戦・両席**。📊A/B 96戦は6山とも差なし。🔴**この回に自己対戦のベースラインを撮り直した**（⇒ `S-30`）。golden `§5.7 S-24`／実機 PASS |
| 🏁`S-22` | ~~**CPU が「対象を選ぶ」ときに効果の意味を見ていない**~~ | 中 | **2026-09-21 クローズ**（バグ報告 `c32a37ce`）＝損得を **`thenAction` の型だけ**で見ていたが、**`SELECT_TARGET` の最大の塊は「対象宣言」**で `thenAction` は `INTERNAL_NOOP`（印）だけ＝**帰結は宣言の後ろのステップ**＝**型からは永久に読めず全部乱数**だった。📏**母集団**＝本物のデッキ6つ × 1戦で **66件中32件（48%）が乱数**（対象宣言17／`TRANSFER_TO_HAND` 12／`ADD_TO_LIFE` 2・**`both_*` は0**）。🔑**置き場が答えを持っている**＝`targetIntentFor`（**`opp_*`＝`harm`／`self_*`＝`benefit`／`both_*`＝乱数のまま**）＋🆕**第3の向き `cost`**（`ADD_TO_LIFE{fromHand}`・`ENERGY_CHARGE`＝**価値の低い順・任意でも選ぶ**）＋`POWER_MODIFY_PER_*` は `deltaPer*` の符号。🆕計器＝`census:play` の `targetRandom`（**0 が正**・WD15 4戦で **42 → 0**）。📊A/B 96戦は6山とも差なし＝**採否は直接指標**。旧挙動は `legacy-targetrandom`。golden `§5.7 S-22`／実機 PASS |
| 🏁`S-28` | ~~**場のシグニをエナチャージする選択肢が CPU に無い**~~ | 中 | **2026-09-21 クローズ**（ユーザー指摘）＝**人間は前から出来たのに CPU は手札しか見ていなかった**。🔴**ついでに CPU だけ「エナチャージの色制限」を無視していたバグも直した**＝画面に2本＋CPU の第3の写経を**新設 `controller/performEnergyCharge.ts` の1本**へ寄せた。🔑**門は2つ**＝①正面に格上がいる ②手札に「そのゾーンの置き換え」がある（②が無いとレーンが空くだけ）。⚠🔴**正面は左右が反転する**（自分の 0 は相手の 2）。📏母集団＝条件が立つ ENERGY 盤面は **WD13 56% / WD06 24% / ケトッシー軸 0%**／実測＝WD13 3戦で**エナチャージ37回中4回**。🆕計器＝`census:play` の `enaChargeField`。🔑🔴📊**A/B で初めて明確な差**＝**全山合算のライフ差 -0.69 [-1.09, -0.29]**（旧目線＝新機構が良い）／WD06 は勝率でも有意。旧挙動は `legacy-fieldcharge`。golden `§5.7 S-28`／実機 PASS |
| 🏁`S-26` | ~~**グロウの判断がターンをまたいでいない**~~ | 小〜中 | **2026-09-21 クローズ**。🔴**登録票の向きが逆だった**（ユーザー指摘）＝**グロウしないことが悪手**で、**払えなくなるのは前のターンにエナを使いすぎたから**⇒ 直す場所は GROW ではなく **ENERGY フェイズ**。📏**実測＝グロウ機会 214 のうち 15（7%）が払えない**（色7／枚数8）／**ターン1にレベル1をエナへ置くため MAIN で出せる札が無い盤面が 22/98**。🏁**エナチャージに3つの補正**＝①**次のグロウに要る色を確保**（`chargeGrowColor`）②**出せる札の温存**（`chargeKeepPlayable`）③レベル差の割引を数値化。🔑🔴**「このターンのグロウ」を見ても遅い**＝**1回グロウしたあとの盤面**で見る（`chargeNeedColors`）。🆕**恒久の計器**＝`census:play` の `growUnpayable`（0 が正）。📏**15 → 8（色起因 7 → 0）**／📊A/B は勝率もライフ差も差なし。旧挙動は `legacy-charge`。golden `§5.7 S-26`／実機 PASS |
| 🏁`S-27` | ~~**A/B の感度を上げる＝勝敗の二値ではなく連続量で測る**~~ | 小〜中 | **2026-09-21 クローズ**＝`AbGameResult.margin`（A 視点の残ライフ差）＋`summarizeAb` の `pairMargins`／**t 区間**（`tCritical95`＝**z で済ませない**）。🔴**補助であって主の判定ではない**（目的関数は勝率＝表の文言を golden が固定）。🔴**前提が1つ外れた**＝**ライフ0 はまだ敗北ではない**＝**勝者もライフ0で勝てる**（実測＝**両者ライフ0での決着 27/96＝28%**）⇒ `margin===0` は接戦＝`marginTied` で別に数え、**割合＝感度の上限**を毎回出す。📏**反転確認**＝`S-6` 第2段と同じ4束・同じシードで**勝敗の数字は1セルも変わらず、標本は 14組 → 48組（3.4〜6倍）**。🔑**結論が「測れていない」から「差が無い」へ上がった**＝**4束とも全山合算のライフ差が ±0.5枚に収まった**。⚠**多重比較の警告**も出力に入れた（6山検定＝5%で0.3山は偶然光る）。golden `§5.7 S-27` |
| 🏁`S-32` | ~~**効果の対象の指示**~~ | 中 | **2026-09-21 クローズ**（ユーザー要望・第440〜443バッチ）＝**大まかな指示3種**（強い／**下げて落とせる**／弱い）＋**固有のカード指定**（狙う／避ける・±12000）＋**属性での指定**（クラス41種／レベル／パワー帯・`matchesFilter` の1本・**実効パワー**で判定）＋**狙い方の切り替え規則**（**この札の効果のとき**／**盤面の条件のとき**＝上から順に最初の1つ・解決は `resolveCpuTargetMode`）。⚠**既定は `strongest`＋指定なし＝`S-22` の挙動**（指定したデッキだけ動く）。⚠**「下げて落とせる」が効くのは21デッキ中5つ**＝**A/B の6デッキには0件**＝既定の測定台では測れない（`S-20` と同型）。golden `§5.7 S-32`／`S-32 ②③`／実機 `v268CpuDeckPlan` |
| 🏁`S-31` | ~~**CPU の作戦をもっと細かく設定できるように**~~ | 中 | **2026-09-22 クローズ**（ユーザー要望）＝🏁①測って否定／🏁③札の使いどころ（守り・攻め・使わない）／🏁②**撃てない【起】 210 → 0**（全6段）。②の中身＝**踏み倒しの修正 22効果**（支払いがどこにも無かったコスト＝人間も踏み倒していた）＋**CPU の選び方 その他全部**。🔑**測り方が効いた**＝「CPU が撃てない」ではなく**「実行経路がそのコストキーを読むか」を全数で**見た。⚠残り＝**入口が場ではない2効果**（`handExileSelf`／`energyTrashSelf`）の入口作り。golden `§5.7 S-31 ②`〜`第6段`／実機 PASS |
| 🏁`S-29` | ~~**対象宣言の「帰結のコスト」を見ずに選んでいる**~~ | 小〜中 | **2026-09-22 クローズ**＝📏**母集団は live 14効果 / 14カード**（登録票の1キーではなく**同性質のキー6つの和集合**）。🔴**ユーザー作27デッキには0枚**＝A/B では測れない＝**直接指標は golden**。実装＝🆕`cpuDeclarationCost.ts`（効果の木から倍率コストを読む）＋`pickCpuTargets` は**払えない候補を外すだけ**（🔑**払える候補が0なら絞らない**＝悪化させない・エナが足りれば従来どおり強い方）。配線は**本番の応答と探索の先読みの2か所**。⤵**登録票のもう半分（`POWER_SET` の `unknown`）は `S-22` の置き場フォールバックで解消済み**＝作業不要だった。⚠`TARGET_OPP_SIGNI_OPTIONAL_COLOR_COST`（110カード）は**固定色コスト＝対象で額が変わらない**ので対象外。golden `§5.7 S-29`／実機 PASS |
| 🏁`S-30` | ~~**探索の既定の効きが山ごとに極端（WD13 8.3%）**~~ | 中 | **2026-09-21 クローズ（測って否定）**＝①`--a legacy-greedy --b default --deck WD13` は**組 4-2-2 [30.0, 90.3]＝差なし**（`S-25` 時点の 0-4-4 から戻っている）②6デッキ96戦で**探索なしが強い山は0**・**合算ライフ差 -2.13 [-2.88, -1.37]**＝**CPU は退化していない**③🔴**総当たりの山ランキングは CPU の版をまたいで比べられない**＝同じ CPU なら順位は安定（seed 1／100 で同じ並び）なのに、**戻せるノブを全部戻しても 2026-09-20 の表は再現しない**（WD06 18.8 → 77.1）＝戻せない変更（`S-24` のマリガン・`S-28` の色制限の修正）が効いている⇒**「75.0 → 8.3」はどの変更にも帰属できない**。🆕総当たりの出力に版跨ぎ禁止の警告を追加。④`S-25` の「`evaluateBoard` に『アップ』の価値が無い」は**この札については誤り**（`WD13-003` は `Timing` が `-`＝アタックフェイズでは撃てず、MAIN では「アップする」が空振り）。 |
| 🏁`S-14` | ~~**作戦データのコンボに「使い方」を持たせる**~~ | 中 | **2026-09-21 クローズ**＝コンボを**順番に打つ手の列**（`{num, use}`・2手に限らない）へ。`use` は **出す／【起】で使う／アーツで撃つ／スペルで使う**。🔴**旧形 `{first, then}` は「出す → 出す」として読める**。加点は `planUseBonus` の1本（**「済んだ」の判定は使い方ごと**・`available` にトラッシュとエナ）。配線＝探索の `moveBonus` → `cpuPlanMoveStep` → `planUseBonus`（🔴`effectId` からカード番号を regex で削り出さない＝接尾辞が開いた集合）。編集 UI＝「カード」＋「使い方」→ 手を足す → コンボに追加。📏**実測＝コンボが判断を変えた対戦 6/6**・`WD06`/`WD08` は動作確認済み。⚠`WD16` は**CPU が払えないコスト**で未達（⇒ `S-31`）。golden `§5.7 S-14`／`S-14 第2段`／実機 PASS＋`v268CpuDeckPlan`／残り実機 `V-283` |

🔑**取る順（2026-09-19 ユーザー決定・第2版／2026-09-20 に 🏁`S-9`・🏁`S-10`・🏁`S-15`・🏁`S-23`・🏁`S-20`・🏁`S-19` を消化）**＝~~`S-15`（候補列挙器）~~ → 🏁~~`S-18`（次ターン項）~~ → 🏁~~`S-16`（前半探索＝**配線済み・既定オフ・互角**）~~ → 🏁~~`S-21`（探索の目的関数）~~ → 🏁~~`S-17`（後半＝攻撃探索＝**全段3段完了・既定オフ・互角**）~~ → 🔵**`S-6`（機械学習＝🏁第1〜2段／微調整は差が無いと測り切った）**→ 🏁~~`S-27`（測定台の感度）~~ → 🏁~~`S-26`（エナチャージがターンをまたいでいない）~~ → 🏁~~`S-28`（場のシグニをチャージ）~~ → 🏁~~`S-22`（対象選択が効果の意味を見ていない）~~ → 🏁~~`S-24`（自己対戦のマリガン）~~ → 🏁~~`S-30`（測って否定＝CPU は退化していない）~~ → 🏁~~`S-14`（作戦データの「使い方」）~~ → 🏁~~`S-31`（CPU の作戦をもっと細かく＝ユーザー要望・**全段消化**）~~ → 🏁~~`S-32`（対象の指示）~~ → 🏁~~`S-29`（宣言の帰結のコスト＝**測って 14効果・実装済み**）~~。
🆕🏁**`S-20`／`S-19` は `S-23` で同時にクローズした**（2026-09-20）＝**以後の A/B は本物のデッキで回す**（`npm run selfplay:ab -- --deck-a <名> --deck-b <名>` ／ `--decks "A,B,C"`）。🔴**勝率を書くときは必ず山の名前も書く**＝`S-19` は「engine の先攻不利」に見えて**合成デッキ固有の偏り**だった。
⤵🔴**`S-8`／`S-11`／`S-12`／`S-13` は `S-15`〜`S-17` へ吸収した**（2026-09-19 ユーザー決定・第2版）＝**単独では取らない**。**登録票は [PLAN_DETAIL.md](./PLAN_DETAIL.md) に残す**（先頭に吸収先を明記＝実測した母集団と罠はそのまま吸収先が引き継ぐ）。
🔴**判断ロジックを触る項目は全部 `S-9` の後**（据置）＝`evaluateBoard` は召喚・スペル・アーツ・対象選択の共通の土台なので、A/B が無いと「直ったが弱くなった」を判別できない。
🆕🔴**`S-10` は探索より前**＝**探索は評価関数を増幅する**＝線形のパワー項を残したまま探索を足すと、過剰使用は減るどころか悪化する。
**登録票は [PLAN_DETAIL.md](./PLAN_DETAIL.md) の同じ ID。**

#### 5.7.3 `S-3` の見積もり（2026-09-17 実測・コードは変えていない）

**実測（`BattleScreen.tsx` 16,780行）**

| 部品 | 行数 | DB 書き込み | 画面の状態更新 | 備考 |
|---|---|---|---|---|
| CPU のターン進行 `cpuTurnAction` | 1,273 | 23 | 0 | 1段ごとに DB へ書き、更新の通知を待って次の段へ進む（`cpuDriver.ts` が起動を管理） |
| スタック解決 `resolveStackNext` | 381 | 2 | 3 | 誘発の収集24種・`executeEffect` の呼び出し元（唯一の choke point） |
| 対話の解決 `handleEffectInteraction` | 298 | 1 | 3 | resume の呼び出し |
| CPU が使う実行関数 `performSummonSigni`/`Grow`/`Spell`/`Arts`/`KeyPiece`/`AssistGrow`/`SigniAttack`/`LrigAttack`/`SigniActivated`/`LrigActivated` | 計 2,688 | 計 21 | 計 43 | **人間の操作と共有**（C-nn で一般化済み） |
| 相手側の応答 `performGuardResponse`／`performLifeBurstResponse` | 615 | 5 | 4 | 対戦丸ごと（両者 CPU）には要る |
| 効果の一覧 `effectsMap`（付与・上書きの合成） | 168 | – | – | `useMemo` の中身＝純関数へ出せる |

- 🔑**すでに純粋なもの**＝engine（`effectExecutor.ts` 14,677行・`triggerCollect.ts` 5,833行・`effectStack.ts`）は smoke／fuzz が画面なしで回している。判定は `*Gate.ts` 8本・CPU の選択は `cpu*.ts` 13本。
- 🔑**DB 書き込みは1つの口**（`persist.commit(patch)`＝`reduceBattle` の出力）＝メモリ上の盤面に差し替えられる形になっている。
- 🔴**難所**＝①実行関数が**人間の操作と共有**＝切り出すと人間側も動く（実機の回帰が要る）②「書いて通知を待つ」非同期の段取り（CPU の起動・スタック解決・対話応答が別々の `useEffect`）を、1本の同期ループに直す必要がある。

**3案**

| 案 | 中身 | 工数 | できること | できないこと |
|---|---|---|---|---|
| **A 浅い先読み** | 盤面をコピーして engine だけで試す（【出】・スペル・アーツの効果を `executeEffect` で解決→盤面を採点）。ターン進行は切り出さない | 2〜4日 | 「どのシグニから出すか」「除去をどれに撃つか」「このスペルを今使うか」を**結果を見て**選ぶ | 誘発の連鎖・相手の応答（ガード・ライフバースト）は見ない。自己対戦はできない |
| **B 1ターン分のシミュレータ** | 上表の CPU ターン側（約5,000行＝画面の約3割）を React から切り離した「ターンのコントローラ」へ移す。DB はメモリ上の盤面に差し替え | 2〜3週間（段階的に） | CPU の1ターンを画面なしで丸ごと回す＝**ターン全体の手順を比べる先読み** | 相手（人間側）のターンは回せない |
| **C 対戦丸ごと** | B＋相手側の応答（ガード・ライフバースト）と人間側ターンの駆動 | B＋1〜2週間 | **CPU 同士の自己対戦**＝勝率で強さを測る・`S-4` の機械学習 | – |

- 🔑**B/C は段階に割れる**（`C-nn` と同じ作法）＝①メモリ上の persist と `resolveStackNext` の切り出し ②CPU が使う実行関数 ③`cpuTurnAction` ④相手側の応答。各段で `gates`＋実機の回帰を通す。
- ⚠§5.6.6 の「完全ヘッドレス化は数字で必要と言えてから」＝**機械学習（`S-6`）をやるなら C が前提**。🔑**2026-09-17 ユーザー決定＝A（`S-4`）→ C（`S-5`）の順**（§5.6.6 の保留を解く根拠は「自己対戦で強さを測る」目的が決まったこと）。

#### 5.7.2 進捗指標

- 🔑**強さは CPU 同士の勝率で測る**（`S-9` の A/B 測定台＝席ごとのポリシー＋席を入れ替えて同じシードをもう1戦＋N戦の勝率と誤差幅）。それまでは golden で「それらしい選択」を固定し、通し対戦で回帰が無いことだけを見る。

---

## 6. 恒久指標（最新1ブロックのみ）

> 作業したら ①このブロックを [PLAN_DETAIL.md](./PLAN_DETAIL.md) の恒久指標アーカイブへ移す ②今回の値へ書き換える。

- **2026-09-22 時点**（第421〜453バッチ＝§5.7 `S-23`／`S-20`・`S-19` 決着 ＋ 🏁`S-17` 第1〜3段 ＋ 🏁`S-25`・既定の引き上げ ＋ 🏁`S-6` 第1〜2段 ＋ 🏁`S-27`・`S-26`・`S-28`・`S-22`・`S-24`・`S-30` ＋ 🏁`S-14`・🏁`S-31` ②・🏁`S-32` 第1段・①・🏁`S-31` ② 第2段・🏁`S-32`・🏁`S-31` ①・🏁`S-31` ③）
  - 📊**進捗3計器**＝Sheet1 要対応 **1 / 863**｜意味照合 段2 台帳 残 OPEN **0**｜census 高シグナル **1 / BASELINE 1**（**live JSON 未変更＝3計器は動かない**）
  - 📦**在庫**＝🏁**機構 worklist 0**｜実機 `V-nn` **0**｜実装キュー **0**｜**CPU 完成度 0**｜**CPU の強さ 1**（🔵`S-6`）｜**作戦データの入力 21デッキ**（ユーザー作業）｜リリース作業 **1**｜実機シナリオの既存 FAIL **0**｜🏁**未消化のバグ報告 0**
  - 🔧**ゲート**＝`npm run gates` 全緑（golden **4363**・`census:traceinv` I1=0・`selfplay` 外れ0）｜**実機＝`verifyFullMatch.mjs cpu` PASS 9本**（6/133手・8/191手・7/174手・7/170手・7/161手・6/139手・7/164手・7/165手・8/177手・7/175手・5/130手・6/133手・6/135手・7/161手・**7/165手**）
  - 📏**対象の狙い方「落とせるものを優先」が効くデッキ**（§5.7 `S-32`・2026-09-21）＝**21デッキ中5つ**（`WD11` 6件／`WD07` 5／`WD08` 4／`WD05` 3／`WD14` 3）｜🔴**A/B の6デッキには0件**
  - 📏**CPU デッキのアーツ**（§5.7 `S-31` ③・2026-09-21）＝ユーザー作21デッキで **76種**（延べ）／分類できない **51**／🔴**守りの窓の在庫＝アタックフェイズに使えるのに分類できない 19（25.0%）**（13/21デッキ）＝**「使いどころ」を書くまで一生撃たない**｜⚠**攻めは探索が列挙をそのまま使うので分類の絞りが掛からない**（もう撃っている）
  - 📏**自分の場の並びを条件にする効果**（§5.7 `S-31` ①・2026-09-21）＝**147効果**（`POWER_SET` 86／`POWER_MODIFY` 22＝**109（74%）は実効パワーに出る**＝採点に既に効いている）｜残り38は強さ表が `activeCondition` を見ていない（**過大評価**）
  - 📏**宣言の帰結が「対象のレベル１につき」のコスト**（§5.7 `S-29`・2026-09-22）＝**live 14効果 / 14カード**（キー6つの和集合）｜🔴**ユーザー作27デッキに0枚**＝A/B では測れない｜実測＝エナ2枚・相手にレベル5とレベル2 ⇒ **旧はレベル5を宣言して空振り／新はレベル2で通る**
  - 📏**CPU が撃てない【起】**（§5.7 `S-31` ②・**その文脈の gate が提示するものだけを分母にする**）＝🏁**場のシグニ 695効果中 0／ルリグ 567効果中 0**（第439〜449バッチで 210 → 108 → 37 → 26 → 15 → **0**）。🔴**過去の大きい数字は分母の取り方が違う**＝旧「648（24.6%）」は文脈を混ぜた値／旧「83」は**入口が場ではない【起】**を含んでいた。⚠**0 は「全部のキーを払える」であって「正しく払える」ではない**＝判定は実カード照合（`scripts/archive/checkCpuActivateCostAgreement.ts`＝提示 44＋20 で食い違い0）
  - 📏**CPU デッキの作戦データ**（§5.7 `S-14`・2026-09-21）＝**入力済み 2 / 21デッキ**｜下書き＝[CPU_DECK_PLANS.md](./CPU_DECK_PLANS.md)（キーカード20／優先札34／コンボ14）｜🏁**`{num, use}` は実装済み**（`WD06`／`WD08` は動作確認済み・`WD16` は CPU が払えないコストで未達＝`S-31`）
  - 📏**CPU の対象選択**（§5.7 `S-22`・本物のデッキ6つ × 1戦）＝CPU が答えた `SELECT_TARGET` **66件／うち乱数 32（48%）→ 0**（先読みの中はさらに 857件）。`census:play` の `targetRandom`＝**0 が正**
  - 📏**山が踏みうる効果の型**＝既定の合成デッキ `VERIFY_DECK_MECH` **23種** ／ ユーザー作26デッキの**和集合 85種**（**64種は既定の山に出てこない**）。`POWER_MODIFY` ＝**既定の山 0枚 / 26デッキ中23デッキ**
  - 📊**総当たり（4デッキ・96戦・止まり0／🆕2026-09-21 に `S-24` で撮り直し）**＝ケトッシー軸 **85.4%** ＞ 天使軸1 56.3% ＞ WD06 50.0% ＞ **WD13 8.3%**（seed 100 でも同じ並び＝75.0／64.6／45.8／14.6）。🔴**この表は CPU の版をまたいで比べられない**（`S-30` で実測＝旧表の1位と4位が入れ替わり、ノブを全部戻しても再現しない）＝**ポリシーの良し悪しは mirror A/B で測る**
  - 📏**先攻の勝率**＝**本物のデッキ 47.9%（46/96）[38.2, 57.8]**（2026-09-20 は 59.4%／同じ4デッキ・CPU が変わった） ／ **合成デッキ 28.1%（18/64）[18.6, 40.1]**（`S-19` は山の性質だった）
  - 📊**機構踏破（自己対戦・48戦ずつ）**＝**13〜14 / 23**（実機1戦は 7/23）。**未踏9のうち8は「山に札が無い／アシスト役が未設定」**・🏁**マリガンは `S-24` で踏むようになった**（自己対戦で全戦・両席）
  - 📏**ユーザー作26デッキの編成**＝**アシスト役の指定は26件すべて未設定**（アシストルリグの札も0枚）／レゾナ **3デッキ**・キー **1デッキ**・ピース **0**・ライズ **0**
  - 📏**アタックの候補数**（`--census-moves --games 2`・§5.7 `S-17` 第1段）＝`ATTACK_SIGNI` **98盤面／平均1.2・中央1・p90 3・最大3**（候補0が31盤面）｜`ATTACK_LRIG` **60盤面／平均0.5**
  - 📏**アタック系トリガー**＝`ON_ATTACK_SIGNI` **684効果/667枚**｜`ON_ATTACK_LRIG` **60/59**｜`ON_BANISH` **157/157**｜`ON_LEAVE_FIELD` **68/68**｜**被アタック側は 5効果**
  - 📊**探索の強さ（🆕2026-09-21 `S-30` で測り直し＝`--a legacy-greedy --b default`・6デッキ × 8シード＝96戦・止まり0）**＝**探索なしが強い山は0**｜探索が有意に強い＝ケトッシー軸 0-0-8／天使軸1・WD06・WD15 0-3-5｜差なし＝**WD13 4-2-2**（`S-25` 時点は 0-4-4＝唯一の負け山だった）・WD16 1-5-2｜**全山合算のライフ差 -2.13 [-2.88, -1.37]**
  - 📏**WD13 で探索が使わないもの**＝**ルリグの【起】 0回 / default 30回**（`WD13-003-E2`）｜召喚 **1.27 / 1.59 体（1ターン）**｜試合の長さ **28・17T / 13・14T**
  - 📊**重みの1本ずつの掃引（`S-25` ①・すべて外れ）**＝`fieldPowerScale=1` 6デッキ合算 **組 53.8% [29.1, 76.8]**｜WD13 単体では `fieldPowerScale=1` 2-6-0／`hand=800` **0-8-0**／`openLane=1500` 0-7-1／`turnDamage+fps` 2-5-1
  - 🔥**CPU の既定（2026-09-21）**＝`searchWidth/searchDepth` **4/4**（探索あり・`searchAttacks` は false・`lifeBurstCost` / `guardDeckCount` は 0）｜旧値＝`legacy-greedy`｜反転の実測＝`legacy-greedy` vs `default` **ケトッシー軸 0-0-8／WD13 4-4-0**｜機構踏破 **15/23**（自己対戦2戦）
  - 📏**探索のコスト（アタック込み）**＝226盤面／1盤面 **平均2.4ms・p90 6.9ms・最大39.3ms**（展開 平均3.2・最大54）
  - 🆕📏**【ライフバースト】・【ガード】の実デッキ比率**（§5.7 `S-17` 第3段・ユーザー作26デッキ＋`VERIFY_DECK_MECH`・主デッキ1,080枚）＝
    LB **528（48.9%）**（全カードは 1,751/6,713＝**26.1%**）｜ガード **204（18.9%）＝中央 8/40**（全カードは 23/6,713＝**0.3%**）。**構築上限 `LB_MAX = 20/40`**
  - 🆕📏**バーストが解決したときの価値**（`effectValueOf`・LB 528枚）＝**平均 2,960 / 中央 2,500 / p25 1,500 / p75 4,000 / p90 6,000 / 最大 8,500**
  - 🆕📊**アタックの期待損（`search-attack` vs `search-attack-risk`・6デッキ × 8シード＝96戦・止まり0・454秒）**＝**48組のうち46組が1勝1敗＝差があるとは言えない**（WD13 1-7-0／WD06 0-7-1／他4山は 0-8-0）
  - 🆕🔑📏**「撃たない」判断の閾値**＝ライフ1枚＝`life − energy = 6000` ／ 期待損＝`p × lifeBurstCost`（`p ≤ 1`）⇒ **`lifeBurstCost > 6000` が要る**。実測（3デッキ×4シード＝24戦）＝**2500 で 0件 / 582アタック**・**12000 で 45件（7.7%）/ 581アタック**

---

## 付録B. 偽陽性パターン（脱落疑いに出るが直さない）— 毎回まず除外

1. **使用条件＋本体**（「このカードは〜の場合にしか使用できない」が前置き）＝条件として正しく表現済み。
2. **CHOOSE/チェインの1文圧縮**＝択肢が全部出ていれば機能的には正しい。
3. **REVEAL_AND_PICK / LOOK_AND_REORDER の文法崩れ**＝主要系統は是正済み。
4. **ルール注記**（「（コストのない【出】能力は発動しないことを選べない）」等）＝効果ではない。
5. **アンコール/ベット注記のみ**訳に出ない＝本体が合っていれば正しい。
6. **BET_MECHANIC STUB**＝機構として扱う。
7. **owner:any の一括変換は禁止**＝POWER_MODIFY/BANISH の `owner:'any'` は大半が正当。原文に明示主語があるものだけ個別是正。
8. **`[STUB:id]` を含むからとスキップしない**＝実装済みハンドラのタグ表示。ハンドラがカード全体を覆うか断片だけかはタグでは区別できない＝個別に検証。
9. **LIFE_BURST 内 `CONDITIONAL{IS_MY_TURN}`** は実害なし（常時 true＋「そうした場合」特別処理）。

---
**関連**：[DESIGN.md](./DESIGN.md)／[PLAN_DETAIL.md](./PLAN_DETAIL.md)／[PLAN_PROGRESS.md](./PLAN_PROGRESS.md)／[BUGFIXES.md](./BUGFIXES.md)／[LESSONS.md](./LESSONS.md)／[DRIVE_TRAPS.md](./DRIVE_TRAPS.md)／[BEHAVIOR_AUDIT.md](./BEHAVIOR_AUDIT.md)／[SEMANTIC_AUDIT.md](./SEMANTIC_AUDIT.md)／[CODEX_GUIDE.md](./CODEX_GUIDE.md)／[BATTLE_CONTROLLER.md](./BATTLE_CONTROLLER.md)／[effects-json-guide.md](./effects-json-guide.md)／[STUBS.md](./STUBS.md)
