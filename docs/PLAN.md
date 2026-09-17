# PLAN — 開発計画（唯一の正）

> **読み方**＝cold start は **§1 現在地 → §2 作業の流れ → §5 作業キュー** の順。着手を決めたら [LESSONS.md](./LESSONS.md) を読んでから実装へ入る。
> **ここに置くのは「現在地・手順・ルール・生きている worklist（残数と一行）」だけ。** 経緯・教訓・日付つきの実績は書かない
> （経緯＝[BUGFIXES.md](./BUGFIXES.md)／登録票と消化済み項目＝[PLAN_DETAIL.md](./PLAN_DETAIL.md)／過去の §1＝[PLAN_PROGRESS.md](./PLAN_PROGRESS.md)／教訓＝[LESSONS.md](./LESSONS.md)・[DRIVE_TRAPS.md](./DRIVE_TRAPS.md)）。
> **節番号・索引の文字・`O-nn`／`V-nn` は住所**＝他ファイルから参照されるので詰めない・再利用しない。

---

## 1. 現在地（直近1セッション）

> **運用**＝直近1件だけを置く入れ替え式。作業したら ①この要約を [PLAN_PROGRESS.md](./PLAN_PROGRESS.md) の先頭へ移す ②今回の要約へ書き換える。

**直近＝2026-09-17＝第397バッチ：`O-532`（リミット超過のルール処理）と `O-531`（ライズ置換の枚数・任意性）をクローズ**（全文は [BUGFIXES.md](./BUGFIXES.md)）
- 🔴**`O-532`**＝リミット超過のルール処理が**そもそも無く**、配置ゲートを通ったあとにリミットが下がっても場が減らなかった ⇒ `limitExcess.ts`（判定）＋`LimitExcessModal`（持ち主が1体ずつ選ぶ）＋`pickLimitExcessZone`（CPU）＋盤面が動くたび回る funnel。行き先は `R-45`／`R-41` の funnel を通す。
- ⚠**「レベル超過」は測るだけで落とさない**＝原文コーパスで**ルリグのレベルを下げる効果は0枚**（実測）＝live に道が無く、自動トラッシュは**注入盤面の実機シナリオ27本にしか当たらない**。読みも未確定なので `R-48` に ❓ で出した。
- 🔴**`O-531`**＝ライズのバニッシュ置換が「下を**全部**・**強制**・**被バニッシュシグニ自身の宣言だけ**」＝**ルリグが宣言する `WX16-002-E1` は一度も発火しない恒久 no-op**だった ⇒ STUB に `count`／`optional` を足し、任意版は身代わり funnel の選択肢（`trash_under`）へ。
- 実機 新規3本（`V-256`〜`V-258`）PASS＋修正前のコードで FAIL を確認。通し対戦 CPU も PASS。腐り1本（`o180NextAssistGrowMods`＝`C-7` のピース体数ルール未追随）も直した。

| 軸 | いまの値 |
|---|---|
| 🔥**次に取るもの** | 🔴**ユーザー判断待ち5件＝[§5.6.2b](#562b-ルール解釈待ちr-nnclaude-は取らない) の表**（`R-50` 前半／`R-48`／`R-47`／`R-45b`／`R-27`。全文は [RULES.md](./RULES.md) §2）／**`C-8`**（対話応答の pure 化） |
| 📊**進捗3計器** | Sheet1 要対応 **1 / 863**／台帳 残 OPEN **0**／census 高シグナル **1 / BASELINE 1**（今回は engine・UI 層＝3計器の対象外） |
| 📦**在庫** | 機構 worklist **0**／実機 **0**／実装キュー **0**／**CPU 完成度 1**（§5.6 `C-8`）／ルール台帳 ⚠3＋❓1（全部読み待ち） |
| 🔧**ゲート** | `npm run gates` 全緑（golden 4292）／通し対戦 `verifyFullMatch cpu` PASS |
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
| 🔥**④** | 🆕**§5.6 CPU 完成度 `C-nn`** | **2** | **プレイ駆動の発見器**＝CPU が撃たない機構＝未検査な向き | §5.6.2 の表 |
| **⑤** | **§5.2 意味照合** | **round6 完了** | 監査による新しい型の発見 | `semantic_audit_round6/TYPE_LEDGER.md` |
| 🔴**⑥** | 🆕**§5.6.2b ルール解釈待ち `R-nn`** | **5** | **Claude は取らない**＝読みを決めないと盤面からカードを消す／消さない側の実装になる | §5.6.2b の表（全文は [RULES.md](./RULES.md) §2） |
| — | §5.4 構造混線 | **0** | 新しく見つけたときだけ足す | — |

**取る順**＝①実機（寝かせるほど切り分けが高くつく）→ ②機構（索引の並び順）→ ③実装キュー（機構不要の候補だけ）→ 🔥**④CPU 完成度（`C-9`／`C-8`。順は `census:play` の未踏で決める）** → ⑤意味照合（①〜④が空のとき）。
🔑**2026-09-16 現在は ①②③ が全部 0 なので ④ が本線**。§5.6 で見つかった engine/parser のバグは**その場で直す**（既定）か、新機構が要るなら §5.3 へ `O-nn` で登録する（§2 の1巡と同じ）。
索引 H（カード原文の解釈待ち）と §5.6.2b（**ルールの**解釈待ち `R-nn`）はユーザーの判断が出るまで取らない。

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

**残0**（直近＝`V-256`＝`c9limitexcesspick`／`V-257`＝`c9limitwithin`（反転＝リミット内なら落とさない）／`V-258`＝`c9risesubcount`＝2026-09-17 第397バッチで PASS＋修正前のコードで FAIL を確認。リミット超過のルール処理とライズ置換の枚数の回帰ガード／`V-255`＝`c9removecleanup`＝2026-09-17 第396バッチで PASS＋修正前のコードで FAIL を確認。リムーブのゾーン後始末の回帰ガード／`V-253`＝`c9refreshturnend`／`V-254`＝`c9refreshturnendone`（反転＝1回目では終わらない）＝2026-09-17 第395バッチで PASS＋修正前のしきい値で FAIL を確認。2回目のリフレッシュでターンが終わる回帰ガード／`V-251`＝`c9resonabanish`／`V-252`＝`c9lrigtriplecrush`＝2026-09-17 第394バッチで PASS＋**修正前のコードで FAIL を確認**（レゾナがエナへ／トリプルが1枚）。レゾナの行き先とルリグの【トリプルクラッシュ】の回帰ガード／`V-248`〜`V-250`＝`c7cpukey`／`c7cpupiece`／`c7cpupieceonelrig`（反転＝ルリグ1体では使わない）＝2026-09-17 第393バッチで PASS。CPU のキー・ピースとピースの体数ルールの回帰ガード／`V-247`＝2026-09-17 第391バッチでクローズ＝CPU の起動の停止・二重実行。回帰ガード＝`v247AfterCpuRiseNoTrigger`（判別力あり）／`v247AfterCpuRise`／`v247AfterCpuAssistGrow`／`c3cpufirstturngrow`／`V-242`〜`V-246`＝`c2cpuguard`／`c4cpuhandlimit`／`c5cpuassistgrow`／`c5cpuresona`／`c6cpurise`＝2026-09-17 第390バッチで PASS。CPU のガード・手札上限・アシストグロウ・レゾナ・ライズの回帰ガード／`V-240`＝`c9lancerreplaced`／`V-241`＝`c9extraturnup`＝2026-09-17 第389バッチで PASS＋修正前のコードで FAIL を確認。ランサー置換とアップフェイズの受け手の回帰ガード／`V-239`＝`battleequalpower`＝2026-09-17 第388バッチで PASS。同値バトルの回帰ガード／`V-238`＝`bugreport`＝報告導線の回帰ガード／`V-237`＝`distinctlevelshortpick`＝`O-530` の実機ソフトロック回帰ガード）。

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
1. 索引 **A' → A → B → G** の順に取る（母集団の大きい順）。欠番の C/D/F は閉じた枠＝再利用しない。
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

🏁**残0**

#### 索引 A. 母集団2桁（遅いレーン）

🏁**残0**（`O-530` は 2026-09-16 第385バッチでクローズ＝PLAN_DETAIL）

#### 索引 B. 母集団 3〜8効果

🏁**残0**（`O-532` は 2026-09-17 第397バッチでクローズ＝PLAN_DETAIL）

#### 索引 G. 母集団 1〜2効果（速いレーンが既定）

🏁**残0**（`O-531` は 2026-09-17 第397バッチでクローズ＝PLAN_DETAIL）

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
| **対話応答** | ⚠「最初の available」固定（乱数は `C-1` で seam 化済み） | `BattleScreen.tsx:660`（対象シャッフル）／`:2263`（じゃんけん） |

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
| `C-8` | 対話応答を pure 化＋方針つきに（`cpuInteraction.ts`） | M | 「最初の available」固定では**分岐の片側しか踏まない** |
| 🔥`C-9` | **ルール規則の棚卸し**（バトル／ダメージ／フェイズ／ゾーン移動の行き先） | M〜L | **台帳＝[RULES.md](./RULES.md)**（公式ルールの1文 × 実装箇所 × 状態）。**2026-09-17 着手**＝✅1／🔴→✅10／👀19／**⚠3＋❓1**（残りは全部**ルールの読み待ち**＝**§5.6.2b の表**）。取り方は RULES.md §4（⚠を上から・写経を全部数える・純関数＋golden） |

#### 5.6.2b ルール解釈待ち（`R-nn`・🔴Claude は取らない）

> **全文（規則の原文・実装箇所・状態）は [RULES.md](./RULES.md) §2**。ここは**何を決めればいいか**の索引だけ。
> 🔴**どれも「読みを決めないと盤面からカードを消す／消さない側の実装になる」**＝golden は読みを固定するので、
> 誤った読みを入れると**正しい修正を止める側**に回る（RULES.md §4-4）。判断が出たら RULES.md の該当行を ✅／⚠ へ動かし、
> 実装が要るなら §5.3 へ `O-nn` で登録して母集団を測り直す。

| ID | 決めること | いまの実装 | 決まったらやること |
|---|---|---|---|
| `R-50` 前半 | **ピースは使用後「ゲームから除外」か「ルリグトラッシュ」か** | ルリグトラッシュ（golden `pieceUseResolvesAndGoesToLrigTrash` が固定済み） | 除外なら `performKeyPiece` の1行＋golden の差し替え。⚠**カード原文に根拠が無い**（ピース122枚中「ゲームから除外」0枚）／**ルリグトラッシュのピースを参照するカードも0枚**＝どちらでも他に波及しない |
| `R-48` | **「シグニのレベル ≦ センタールリグのレベル」は配置制限か、ルール処理（超過したら落とす）か** | 配置ゲートのみ。`planLimitExcess` は超過を**測るが落とさない** | ルール処理なら funnel に1分岐。⚠**その瞬間に実機シナリオ27本の注入盤面が illegal になって食われる**（実測）＝先にシナリオの盤面を正す |
| `R-47` | **同じルリグタイプのルリグが複数場にあるとき、落とすのは「センター以外」全部か、センターと重なったものだけか** | 実装なし（突き合わせる箇所が `src/` に1つも無い） | 前者だと**アシスト同士**が同タイプのとき両方消える。ルリグの `CardClass` がそのままルリグタイプ（89種）＝同タイプのアシストを積めば成立しうる |
| `R-45b` | **`シグニ/レゾナクラフト`（live 10枚）が場を離れる先**（クラフトは「ゲームから取り除かれる」か） | 未実装。レゾナ規則（→ルリグデッキ）は `Type === 'レゾナ'` の**完全一致だけ**に掛けてある | クラフト規則を `resonaZone.ts` へ足す。⚠間違えるとルリグデッキに溜まって**無限に出し直せる** |
| `R-27` | **「このターンを終了する」（強制終了）でも、予約済みの追加ターン／相手のスキップは効くか** | `applyForcedTurnEnd` は `resolveTurnHandover` を見ず**常に交代** | 効くなら `applyForcedTurnEnd` を `resolveTurnHandover` 経由に。⚠盤面としては極めて稀（公式の明文は未発見） |

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
3. **triage**＝**複数件なら先に `node scripts/replayReport.mjs`（引数なし）**＝溜まった報告を1画面で一覧し、
   **同じ症状らしい束**（タグ×フェイズ×開いている対話×最後のログ）をまとめる。⚠束は「同じバグ」の保証ではない＝代表1件を読んで確かめる。
   1件を詳しく＝`node scripts/replayReport.mjs <file>`＝局面・開いている対話・ログ末尾を出す。
   ⚠**1件 ≒ 20KB**（実測）＝生の JSON を何件も開かない。取り込みは何件でも通る（実測6件・消化印は50件ずつに分割）。
   **実機で見たい**＝`--inject`＝claude1 の PLAYING ルームへ**全行復元**（ID は再帰的に張り替える）。
   🔴**`injectScenario` は使わない**＝あちらはシナリオ汚染対策で**一時状態を全部消す**が、報告の再現で欲しいのは真逆。

#### 5.6.5 デッキ（ユーザー担当・2026-09-16 決定）

- **CPU のデッキはアプリ内で作れる**（既存の `MatchmakingScreen` の `CPU_DECK_SELECT` ステップ＝`decks` テーブルから選ぶ）。条件は `validDecks` の2つだけ＝**メイン40枚**かつ**ルリグデッキに Lv0 のルリグがある**こと。
- 🔑**選定基準はカードではなく「機構」**＝カードの網羅は生成器（将来）に任せ、手作りデッキは**踏む機構が重ならないこと**を狙う（上の踏破表の軸）。
- 🔴**ハーネスとの往復が未整備**＝`verifyFullMatch.mjs` / `verifyBattleDrive.mjs` は **`claude1`/`claude2` でログインして `VERIFY_DECK` 固定名**を探すので、ユーザー個人アカウントのデッキは見えない。
  さらに `verify-deck.json` は **`.gitignore` 圏内**＝クローンし直すと全マッチテストが再現できない。⇒ **エクスポート／インポート／デッキ名を引数化の3本**（いずれも既存スクリプトの一般化）。

#### 5.6.6 いまはやらないと決めたこと

- 🔴**`BattleScreen.tsx` の完全ヘッドレス化**＝16,486行に対し `reduceBattle` は **18 action**、投資が桁で大きい。
  ブラウザ実行でも **1戦232秒＝一晩で約120戦**回るので、**回してみて「遅すぎる」と数字で言えてから**着手する。
- **LLM 監査バッチ**＝§2.6 の実績（precision 50%／266バッチ ≒ 940万トークン）から割に合わない。
  🔑この線での LLM（Opus）の役割は**「人間が遊んで見つけた型を、その場で機械の全数検出に翻訳する」ことだけ**。

---

## 6. 恒久指標（最新1ブロックのみ）

> 作業したら ①このブロックを [PLAN_DETAIL.md](./PLAN_DETAIL.md) の恒久指標アーカイブへ移す ②今回の値へ書き換える。

- **2026-09-17 時点**（第393バッチ＝§5.6 `C-7` クローズ）
  - 📊**進捗3計器**＝Sheet1 要対応 **1 / 863**｜意味照合 段2 台帳 残 OPEN **0**｜census 高シグナル **1 / BASELINE 1**（CPU・UI 層の回＝3計器は対象外）
  - 📦**在庫**＝機構 worklist **1**（索引G `O-531`）｜実機 **0**｜実装キュー **0**｜**CPU 完成度 2**（§5.6 `C-8`・`C-9`・🏁`C-0`〜`C-7` 済）｜ルール台帳 ⚠15
  - 🔧**ゲート**＝`npm run gates` 全緑（golden 4284・`census:traceinv` I1=0）
  - 📊**機構踏破**＝`census:play`（`VERIFY_DECK_MECH` 1戦）**10 / 20**（ピース 1・キー 0＝レベル4に届く前に決着。キーは実機シナリオ `c7cpukey` で確認）

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
