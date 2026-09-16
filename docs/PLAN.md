# PLAN — 開発計画（唯一の正）

> **読み方**＝cold start は **§1 現在地 → §2 作業の流れ → §5 作業キュー** の順。着手を決めたら [LESSONS.md](./LESSONS.md) を読んでから実装へ入る。
> **ここに置くのは「現在地・手順・ルール・生きている worklist（残数と一行）」だけ。** 経緯・教訓・日付つきの実績は書かない
> （経緯＝[BUGFIXES.md](./BUGFIXES.md)／登録票と消化済み項目＝[PLAN_DETAIL.md](./PLAN_DETAIL.md)／過去の §1＝[PLAN_PROGRESS.md](./PLAN_PROGRESS.md)／教訓＝[LESSONS.md](./LESSONS.md)・[DRIVE_TRAPS.md](./DRIVE_TRAPS.md)）。
> **節番号・索引の文字・`O-nn`／`V-nn` は住所**＝他ファイルから参照されるので詰めない・再利用しない。

---

## 1. 現在地（直近1セッション）

> **運用**＝直近1件だけを置く入れ替え式。作業したら ①この要約を [PLAN_PROGRESS.md](./PLAN_PROGRESS.md) の先頭へ移す ②今回の要約へ書き換える。

**直近＝2026-09-16＝第382バッチ：§5.2 round6 R6-1（不変条件センサス）**（全文は [BUGFIXES.md](./BUGFIXES.md)・台帳は `round6/TYPE_LEDGER.md`）
- 新設 `npm run census:traceinv`＝全カード × 5変種で I1〜I5 を数える。**I1（消滅・二重存在）は 0 で `gates` に同梱**。I2〜I5 は候補出し。
- 精度（実バグ／標本）＝I1 4/16・I2 0/20・I3 5/20・I4 挙動0（ログの根1つ）・I5 0/35。
- 直した engine バグ＝カードの複製2系統（ライフバーストの発動／シグニの下へ置く）・「手札から出してもよい。そうした場合」が出せなくても後続・ドロー／エナチャージのログ枚数。

| 軸 | いまの値 |
|---|---|
| 🔥**次に取るもの** | **§5.2 round6 の R6-3**（締め＝ゲート化した I1 を CLAUDE.md の検証コマンドへ登録・台帳の総括）→ `O-527` |
| 📊**進捗3計器** | Sheet1 要対応 **2 / 863**（`census:cards -- --sheet 1` で測り直す）／台帳 残 OPEN **0**／census 高シグナル **1 / BASELINE 1** |
| 📦**在庫** | 機構 worklist **1**（索引G 1）／実機 **0**／実装キュー **0** |
| 🔧**ゲート** | `npm run gates` 全緑（golden 4267・`census:traceinv` 同梱＝壁時計 2分47秒） |

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
| **②** | **§5.3 機構 worklist `O-nn`** | **3**（索引A 2・索引H 1） | 新しい型・評価器・engine が要るもの | §5.3 の索引 |
| **③** | **§5.0 実装キュー** | **0** | triage で BUG と確定した未修正の効果 | `node scripts/archive/semanticAuditBugList.mjs` |
| **④** | **§5.2 意味照合** | **round6＝R6-0 から** | 監査による新しい型の発見 | `semantic_audit_round6/TYPE_LEDGER.md` |
| — | §5.4 構造混線 | **0** | 新しく見つけたときだけ足す | — |

**取る順**＝①実機（寝かせるほど切り分けが高くつく）→ ②機構（索引の並び順）→ ③実装キュー（機構不要の候補だけ）→ ④意味照合（①〜③が空のとき。出た BUG は②へ入る）。
索引 H（解釈待ち）はユーザーの判断が出るまで取らない。

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

**残0**。

| ID | 観測点（何を見れば PASS か） | 出所 |
|---|---|---|

- `src/screens/` を触った回・新しい型や機構を足した回は `V-<次番号>` で登録する。**採番は `grep -o "scenarios\.v[0-9]\+" scripts/verifyBattleDrive.mjs | sort -n | tail` で実測する。**
- 観測点は**反転側まで**書く（効かないはずの側・帰結の数値＝DRIVE_TRAPS 109〜110）。
- **リリース前の通し対戦**＝`node scripts/verifyFullMatch.mjs`（`cpu`／`pvp` 片方も可。CPU 約4分／PvP 約33分）。`src/screens/` や engine の再入経路を触ってリリースする前に1回。
- `order` に入れたシナリオは返済後も外さない（壊れたら気づく番人）。

---

### 5.2 意味照合監査（semantic audit）

**現状**＝round4（全11シート）・段2 台帳・round5（全5,976枚）は完了。round6 は **R6-0 済（再現率 6/16 で未達）・R6-1 済（I1 をゲート化）⇒ R6-2 はやらず、残りは R6-3（締め）。**
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

🏁**残0**

#### 索引 B. 母集団 3〜8効果

🏁**残0**

| ID | 規模 | 何が無いか（一行） |
|---|---|---|

#### 索引 G. 母集団 1〜2効果（速いレーンが既定）

| ID | 規模 | 何が無いか（一行） |
|---|---|---|
| `O-527` | S・**3効果**（R6-1 I3 で実測） | 「【トラップ】１つをトラッシュに置く。そうした場合、…」でトラップが無くても後続（デッキ上3枚から設置）が走る＝「そうした場合」が `IS_MY_TURN` で表されている |

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

## 6. 恒久指標（最新1ブロックのみ）

> 作業したら ①このブロックを [PLAN_DETAIL.md](./PLAN_DETAIL.md) の恒久指標アーカイブへ移す ②今回の値へ書き換える。

- **2026-09-16 時点**（第382バッチ＝round6 R6-1）
  - 📊**進捗3計器**＝Sheet1 要対応 **2 / 863**（held 1・mech 1）｜意味照合 段2 台帳 残 OPEN **0**｜census 高シグナル **1 / BASELINE 1**
  - 📦**在庫**＝機構 worklist **1**（索引G 1＝`O-527`）｜実機 **0**｜実装キュー **0**｜round6 **R6-0・R6-1 済 → R6-3**
  - 🔧**ゲート**＝`npm run gates` 全緑（golden 4267・`census:traceinv` I1=0）

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
