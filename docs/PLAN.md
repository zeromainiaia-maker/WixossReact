# PLAN — 開発計画（統合版）

> **2026-07-03統合**：以前は「今後の予定」を決める文章が `P1_PLAN.md`／`ROADMAP.md`／`TODO.md` の3つに分かれていて分かりにくかったため、この1本の `PLAN.md` に統合した。旧3ファイルは削除済み（内容はすべてここに移した）。
> **3人は同時に作業せず、順番に push / pull で引き継ぐ（バトン式）**。新セッション（cold start）は **本ファイル §4「現在地とバトン」→ `DESIGN.md`** の順に読む。
> 個別の修正記録は [BUGFIXES.md](./BUGFIXES.md)（新しいものを上に追記）。**原文照合の主軸ツールは [BEHAVIOR_AUDIT.md](./BEHAVIOR_AUDIT.md)**（実行結果の目視照合・LLM不使用・決定論）。補完的発見器は [SEMANTIC_AUDIT.md](./SEMANTIC_AUDIT.md)（LLM意味比較）。
> **消化済みバッチ・完了項目の詳細履歴は [PLAN_DETAIL.md](./PLAN_DETAIL.md) に分離（2026-07-07）**＝本ファイルは「現在地・ルール・生きている worklist」だけを保つ。完了項目を増やしたら詳細は PLAN_DETAIL.md へ移し、ここには1行の ✅ サマリだけ残す。
> **2026-07-14 に再圧縮**（199KB→約77KB）＝§3 のタスク本文・§7 の実機PASS記録・§4 の census 計測履歴・§6 の完了機構メモを PLAN_DETAIL.md へ退避し、**§3 は「生きているタスクの表」＋Opusタスク12 の在庫表だけ**にした。**タスクは §3 の表から取り、経緯を知りたいときだけ PLAN_DETAIL を開く。**
> **2026-08-02 に再々圧縮**（185KB→約110KB）＝[PLAN_DETAIL.md](./PLAN_DETAIL.md)「2026-08-02 整理②」節へ ①§3 在庫表の残0クローズ行〔(lxix)(lxxi)(lxxii)(lxxiv)(lxxix)(lxxx)＋(lxi)ほかの完了まとめ〕②§4 恒久指標の計測履歴48行 ③§3 タスク16（🏁残0クローズ）④§5c の凍結 worklist ⑤§6.2・§6.3 の完了行 を退避。**§4 の指標は「最新1行だけを置き、旧行は PLAN_DETAIL の同節先頭へ移す」入れ替え式**（進捗サマリと同じ運用）。

---

## 0. 全体像（3+1フェーズ）

| 層 | 内容 | 検証手段 |
|---|---|---|
| **① 表現 P1** | JSON がカード原文を正しく**表現**する | 逆翻訳一致／同型★0／BEHAVIOR_AUDIT キュー消化 |
| ② 実行 P2 | エンジンが各DSL構文を正しく**実行** | golden型網羅／smoke／fuzz／BEHAVIOR_AUDITで見つかる実行バグの解消 |
| ③ 挙動 P3 | 実ゲームで各カードがルールどおり動く | 実機/自動対戦テスト（`scripts/verifyBattleDrive.mjs`） |
| ④ 対戦体験 | CPU AI がメインフェイズで能動行動し、一人でも通しで遊べる | 実機通し対戦・fuzz重め |

**注意**：①の「逆翻訳一致」は "JSONがテキストを表す" ことのみ保証。実機での正しさ(③)は別。各コミットは**「要実機検証」**を付す。

---

## 1. 現在の方針＝BEHAVIOR_AUDIT が主軸（2026-07-03〜）

「JSON が原文を正しく表現しているか」を JSON を読んで判定するのではなく、**engine で実際に効果を実行した結果（盤面差分＋ログ）を原文と並べて人間が目視照合する**。LLM不使用・決定論・無料・回帰資産。詳細・使い方・現在のキュー件数は **[BEHAVIOR_AUDIT.md](./BEHAVIOR_AUDIT.md)** を参照。

- この方式は「逆翻訳が原文と文字列一致するか」だけでは見つからない**実行時の真バグ**（engine dispatch未配線・トリガー主語ミス・未実装action型・誤った自作実装）を多数発見している（2026-07-03〜の1週間で10件以上の実バグ）。
- **この作業はP1（表現）とP2（実行）の境界を跨ぐ**：逆翻訳の系統的誤表示（表現バグ）と engine の未配線・no-op（実行バグ）の両方をこの1つのツールが同時に炙り出すため、フェーズ区分は目安として運用する。
- 補完的発見器＝[SEMANTIC_AUDIT.md](./SEMANTIC_AUDIT.md)（BEHAVIOR_AUDITの盤面差分では拾えないSTUB/MANUALの意味エラーに強い）。

## 2. Definition of Done（完了条件）

- [x] 全シートで **同型★ = 0**（`docs/grouped_all.txt`・`node scripts/groupSimilar.mjs --all` で再生成）。**達成・維持中**。
- [x] 「⚠脱落疑い」リストの各カードが、**偽陽性**／**修正済**／**機構待ち（理由明記）** のいずれかに分類済み。**✅2026-06-28＝255枚を全分類**（偽陽性179／機構待ち72／修正済）。`node scripts/_dropTriage.mjs`・明細 `docs/_drop_triage.txt`。
- [x] 残る大型機構（§10）が実装＋配線済み、または明確にスコープ外と合意。**✅2026-06-28＝B1-B4を全完了**。残るは **C（engine 実機配線・全 R5-R58 と B1-B4 は要実機検証・§7）＝P2/P3 スコープ**。
- [~] **逆翻訳機（`scripts/decompileEffects.ts`）の出力品質＝原文一致**（2026-06-30 着手・2026-07-03に主作業の座は次項へ譲った）。英語ID漏れ 582→367（BUGFIXES⑩〜㉒）、レンダラ5系統是正済。残＝§5b（低優先のテール）。
- [x] **🏁 P1（表現）完了宣言（2026-07-23）**＝語彙センサス高シグナルの逓減限界到達を実測確認（バッチ2〜4の投入前実測枯渇＋生きた parser バッチ全消化）し、残 census 1581 効果を「**§6.3 正式送り 282／粗網のみ偽陽性 116／長テール単発・別節偽陽性 1183**」へ3分類。宣言本文・根拠・以後の運用は [P1_COMPLETION_ROADMAP.md](./P1_COMPLETION_ROADMAP.md) 冒頭の宣言節。以後 census は回帰ゲート（`BASELINE_HIGH=1580`）としてのみ運用し、主軸は P2/P3（§6.3 機構・§7 実機・BEHAVIOR_AUDIT 継続）へ移行。
- [ ] **🆕 BEHAVIOR_AUDIT の要レビュー・キューを逓減限界まで消化**（2026-07-03 着手・現在の本丸）。指標＝`node scripts/_bqTriage.mjs` の高シグナル件数（811→285→261→169→129→30…と逓減中）。
- ⚠ **「脱落疑いの件数」は完了指標にしない**（メトリクスが粗く内容修正で減らないため。§3参照）。

## 3. 不変の運用ルール（全員必須）

- **`effects_*.json` の curated 値は「上書きされない」ことが保証されている。**`build:effects` は ①`parseStatus` が `MANUAL`/`PARTIAL` を含むカードを**カード単位で温存**（`PRESERVE_STATUSES`）②それ以外も fresh が curated の純粋な上位集合でなければ**温存して held へ送る**（`buildEffectsJson.ts:158-162`）ため、**再生成しても勝手に値が消えることはない**。`heldReview --adopt` で明示採用したものだけが変わる。
  - ⚠**旧記述「`build:effects` は破壊的＝絶対に実行しない」は本節の §5c パイプライン（下記「Sonnet の必須ガードレール①」・§5c の手順④・`heldReview` の前提）と矛盾していたため 2026-07-28 に訂正した。** `heldReview` は「直前に `build:effects` を実行して `docs/_held_fresh.json` を作る」ことが前提なので、禁止すると採用経路そのものが回らない。
  - **正しい規律は「実行禁止」ではなく「実行後に effectId 単位で全数比較して、意図した件数だけが変わったことを確認する」**（`git show <baseline>:public/data/effects_*.json` と突き合わせる使い捨てスクリプトで `added=0 / removed=0 / changed=<意図した件数>`）。出力は minified 1行なのでテキスト diff は役に立たない。
  - **カード単位 PRESERVE で held に載らない効果**（同居効果が MANUAL 等）は `build` では直せないので、`effectId` をアンカーにした**外科パッチ**で JSON を直接訂正する。共有関数（`mergeManualEffects` 等）にカード固有テーブルを埋めるのは禁止。
- **逆翻訳を直したらエンジン実装までセット**（乖離＝偽陰性を作らない）。語彙が無ければ §10 の機構として実装するか、`engineUnwiredTimings` に登録し逆翻訳へ `【※engine未配線】` を付けて明示する。[[decompile-engine-parity]]
- **日本語を含むスクリプトは `scratchpad` に `.mjs` を書いて `node <path>` 実行**（Git Bash 経由の `node -e` は文字化けする）。papaparse 等が要るカード参照スクリプトは project root に一時 `.ts/.mjs` を置いて `npx tsx`/`node` 実行・終わったら削除。
- **件数メトリクスを信じない**：「脱落疑いNN枚」は「。区切り文数」比較で粗く、逆翻訳器は複数効果を1行（、／そして）に圧縮するため内容を直しても件数は減らない。`_dropTriage` の分類（「文法崩れ」等）も構造ベースで文法品質は測れない。判断は必ず **同型★0＋該当カードの逆翻訳が原文一致（目視/grep）** で行う。
- **ゲートは `npm run typecheck`（＝`tsc -b --noEmit`）**。plain `tsc --noEmit` は project references を見ず CI が拾うエラーを見逃すので不可。
- **全再生成系の一括置換は禁止**（無検証置換で約90枚退化の前例）。系統ごとに機構を1回確立→同パターン適用→各カード verify。
- **CSV の順番を必ず維持する**（スクリプト内の `sorted` ロジックで対応済み）。

### 標準ワークフロー（1カード/1巡）
①要レビュー・キュー（`npm run audit -- --id <CardNum>` または `docs/grouped_sentence_all.txt`）を見る→②欠落把握→③`effects_*.json` を既存語彙で直す→④`npm run typecheck`→⑤〜⑥`npm run regen`（**全シート＋下流を UTF-8 直書きで一括再生成**。旧「Bash の `>` で1枚ずつ」は不要＝2026-07-07に `--sheets` モード化・下流に UTF-16 混入ガードあり）→⑦逆翻訳が原文一致＆同型★0を確認→⑧engineを触ったら `npm run smoke && npm run golden && npm run fuzz`（一括なら `npm run gates`）→⑨`BUGFIXES.md` に追記→⑩本ファイル §4 を更新→commit/push。

### 標準ワークフロー（1ラウンド＝横展開・系統バグ向け）
①**抽出**：全シート走査で「同じ壊れ方」を機械抽出（`scratchpad` の `scan*.mjs` が雛形）。②**分類**：偽陽性(§9)・既知複雑札を除外し、クリーンな系統を確定。③**パッチ**：`effectId` をアンカーにした一括スクリプトで安全に置換（他カードを巻き込まない）。MANUAL化する場合は `parseStatus:'MANUAL'`。④**検証ゲート**：上記ワークフローの④〜⑦と同じ。⑤**記録＆バトン**：`BUGFIXES.md` に追記（新しいものを上）→本ファイル §4 を上書き→コミット（末尾に「要実機検証」）→push。

### 機構実装の「型」
1. `src/types/effects.ts`（アクション/条件/timing の型）→ 2. `src/types/index.ts`（`PlayerState` 状態フィールド）→ 3. `src/engine/effectExecutor.ts`（実行）/`execUtils.ts`（`evalCondition`/`matchesFilter`）/`effectEngine.ts`（CONTINUOUS収集）→ 4. `src/screens/BattleScreen.tsx`（状態読み取り＋**ターン境界リセット3箇所**：PvP通常終了・PvP確認後・CPU）→ 5. `scripts/decompileEffects.ts`（表示）→ 6. JSON 配線 → 検証。

### 主要ファイル
- 語彙: `src/types/effects.ts` / `src/types/index.ts`（PlayerState）
- エンジン: `src/engine/effectExecutor.ts`（`execLookPickChain`/`payBeatSigniCost` 等）・`execUtils.ts`（`evalCondition`/`matchesFilter`/`addToBeatZone`）・`effectEngine.ts`（CONTINUOUS収集・`checkActiveCondition`）
- UI/ルール: `src/screens/BattleScreen.tsx`（コスト計算・バトル・ターン境界リセット・`crashOneLife`）
- 逆翻訳器: `scripts/decompileEffects.ts`、グルーピング: `scripts/group{Similar,BySentence}.mjs`（`--all` で全10シート統合）
- 監査: `scripts/behaviorAudit.ts`（`npm run audit`/`audit:html`/`audit:queue`）

### モデル分担（Sonnet 5 / Opus 4.8）
**判断軸＝「コーディング難度」ではなく「意味的退化を見極める検証規律が要るか」**。自動ゲート（smoke/golden/fuzz/同型★0/census baseline・CI）はクラッシュ・構造破壊を必ず捕まえるが、**「全ゲート通過なのに意味が間違っている」退化は素通りする**（PLAN が警告する「無検証置換で約90枚退化の前例」の失敗モード）。この見極めだけがモデル依存。

- **Opus 側＝機構・語彙の新規実装と退化の見極め**：parser/engine への新規語彙・機構（§6.3 大型機構・引用付与の内側 parse）／意味的退化の見極めが要るバッチ（「代わりに」置換・CHOOSE平坦化復元・条件節持ち上げ等＝全数機械分類して偽陽性を先に切る）／リファクタ Stage2-3／BEHAVIOR_AUDIT の真no-op vs シナリオ空振りの最終仕分けと engine 修正。
- **Sonnet 側＝定型消化・データ単点修正**：§5c パイプラインの機械実行（`build:effects`→`heldReview`→ゲート→`regen`→commit）／owner・値・duration の単点修正バッチ（parser/engine 変更なし）／BEHAVIOR_AUDIT キュー再生成と一次トリアージ／§7 実機検証シナリオの横展開。**作業中に見つけた engine/parser バグはその場で直さず Opusタスク12 へ登録する**。
- **Sonnet の必須ガードレール4点**（プロンプトに固定）：①**採用前に必ず `build:effects` を再生成**して fresh vs live-curated を精密 diff＋decompile 対原文照合する（`heldReview` の diff 表示・`census:clusters` の枚数は古くなりうるので鵜呑みにしない）。②**1バッチ＝parser/engine 変更なしに限定**。③採用後に `git show`/機械 diff で「意図した数枚のみ変更」を確認。④**据置系（curated が正・fresh が誤り）は触らない**＝EXILE→TRASH（ゲーム除外の温存）・owner:opponent→undefined 脱落・「このシグニ」→ALL 化・「あなたのトラッシュ」→opponent 化。
- 定型作業は必ずスキル（`/census-batch`・`/audit-card`・`/baton`）の手順に従う。**Opus が機構を1バッチ開く→Sonnet が再収穫＋ゲート＋簿記で消化する交互サイクル**で回す（バトン式・同時作業はしない）。
- **消化済みタスクの詳細・経緯・知見は [PLAN_DETAIL.md](./PLAN_DETAIL.md) §3**（続き42-47／56-69／71-92／**2026-07-14 退避のタスク全文＝timing センサス消化の運用知見・Opusタスク12 の在庫明細つき**）。

#### Opus のタスク（2026-07-14 整理・生きているものだけ）
> 規模＝**S**:1セッション内で完結／**M**:1〜2セッション／**L**:複数セッション（項目単位で分割可）。種別＝触る層（＝必要ゲートが決まる：parser/engine→`npm run gates` 必須・decompiler 表現のみ→同型★0＋原文照合・scripts のみ→該当スクリプト実行）。

| # | タスク | 種別 | 規模 | 残っている内容 |
|---|---|---|---|---|
| 12 | **Sonnet が積んだ engine/parser バグの修正（常設受け口）** | 可変 | 可変 | 🏁**在庫0**（2026-08-08 に (cxv)(cxiii)(cxiv)(cxvii)(cxviii) を残0クローズ）。Sonnet が新しく積むまで待機 |
| 13 | §5b 混線テール（実測823カード・16テーマ分類済み） | JSON再parse（1カードずつ） | L | effect 構造そのものが原文とズレたカードの再parse。**🆕2026-08-07 続き369 で「低優先」を解除**＝§5d の欠落パターン D（重度混線）と同じ母集団で、§5c 店じまい後の主戦場のひとつ  🆕**続き377n 追加＝`WXK05-052-E1`**（「対戦相手のシグニを２体まで対象とし、**このシグニと同じシグニゾーンに【シード】がある場合**、次のターンの間、それらは「【常】：アタックできない。」を得る」＝**条件節の【シード】をキーワードと誤読**して「あなたのシグニ1体に【シード】を付与」に化けている。⚠**体数だけ広げると誤りを増幅**するので golden にトリップワイヤ設置済み）。 |
| 21 | 🚧**§5d-0 工程改善3件（次セッション最優先・Opus）** | 計測＋スクリプト新設 | S（1セッション想定） | ①`npm run census:wiring` 常設化（語彙×入口の被覆マトリクス。試作で134件検出）②残1162の真バグ率を無作為20件で再測定 ③worklist を作業種別へ組み替え。**2026-08-07 続き375 でユーザー合意・通常バッチより優先**。設計・根拠・実測値は §5d-0 |
| 20 | **§5d 1効果ずつの原文照合（新設・現在の主戦場）** | 原文照合＋JSON/parser | L（母集団 約874効果） | §5c の文型バッチが届かない**単発テール**。欠落パターン A〜D で分類し、**繰り返し出るパターンは parser へ還元**する。入口は §5d 末尾の照合済み12件 |
| 15 | （大型・任意）§8 CPU AI のメインフェイズ拡張 | 新規設計 | L（特大） | ⏳DESIGN §4「CPU は対人戦と同じ処理」の統一が先 |

> **✅消化済のタスク（1〜9・11・14・16〜19）は 2026-07-29／2026-08-02／2026-08-06 の整理で退避**＝完了行の原文は [PLAN_DETAIL.md](./PLAN_DETAIL.md)「2026-07-29 整理」節（1〜9・11・17〜19）／「2026-08-02 整理②」節（16＝timing 語彙センサス 🏁残0クローズ）／**「2026-08-06 整理③」節（14＝リファクタ Stage2→Stage3 純粋バトルコントローラ。⚠残作業は §7 実機通し確認のみ・手順は [BATTLE_CONTROLLER.md](./BATTLE_CONTROLLER.md)）**。生きているのは上表の **13・15・20・21**（**12 は常設受け口**）。**🚧次セッションは 21（§5d-0 工程改善）を最優先**＝それが済んでから **20（§5d）** の通常バッチへ戻る。**主戦場は 20（§5d）**＝2026-08-07 続き369 に §5c の文型バッチを店じまいして移した。

**Opusタスク12＝未消化の在庫 8件（2026-08-10 続き404・408・417／2026-08-13 続き466・468・471／2026-08-14 続き474 で登録）**。

| # | 症状 | 発見経緯 | 見立て |
|---|---|---|---|
| 🆕(cxxix) | 🔴**F-3 身代わりが「コスト0」で成立し、シグニが無償でバニッシュを回避する疑い**＝`WX14-026`（羅石　スイカリン）は `substituteCost:{lifeCrash:1}` なのに、**効果バニッシュで実機ログが `身代わり：羅石　スイカリンの下からスペル0枚をトラッシュして羅石　スイカリンのバニッシュを回避` を出し、`victimLeft=false`／`guest.life 7→7`**（＝**ライフも払わずシグニも場に残る**）。⚠**原文は「代わりにあなたのライフクロス１枚をクラッシュしてもよい」**なので、**ライフを払わずに回避できるのは過剰効果**。⚠**`WX14-026` は「対戦相手のターンの間」限定**（`activeCondition:{TURN_OWNER, owner:'opponent'}`）で、実機は host の MAIN・turn 2＝**victim 側から見て相手ターン**で撃っている | 2026-08-14 続き474（PLAN §7 V-10 の実機検証）＝`effectBanishLifeCrashSubstituteNotOnEffect` が「効果バニッシュでは身代わりされない（engine 対象外＝仕様）」を確認するはずが、**別種の身代わりが成立**した | ⚠**機構は未確定**＝`collectBanishSubstitutes`（`effectEngine.ts:5720-5722`）の `trashStackSpell` 枝は **`cost.trashStackSpell` が真かつ在庫充足**を要求するので、**`amount:0` の選択肢が作られる経路が静的には説明できない**。⇒ **①ログ文言の生成箇所（`effectExecutor.ts:617` 付近）から逆に辿る ②`banishSubstituteAutoEligible`（`:456`）が `lifeCrash` だけを除外している前提が崩れていないか ③`collectEffectBanishSubstituteChoices` の effects フォールバック（`:437-444`＝`effectsMap`→`cardMap.effects`→付与ストア）で別カードの `substituteCost` を拾っていないか**、の順で調べる。⚠**検査用シナリオは既にある**（`effectBanishLifeCrashSubstituteNotOnEffect`＝現在 FAIL） |
| 🆕(cxxviii) | 🔴**`WXDi-P04-051-E1` は timing 誤りでコストが構造的に支払い不能＝恒久 no-op**＝原文は「【自】：**あなたのルリグ１体がアタックしたとき**、あなたのアップ状態の**白のシグニ３体**をダウンし《白》を支払ってもよい。そうした場合、**そのルリグをアップ**し、ターン終了時まで、**そのルリグは能力を失う**」なのに、live は **`timing:['ON_ATTACK_SIGNI']`**／帰結も **`UP{SIGNI}`＋`REMOVE_ABILITIES{SIGNI}`**（＝**ルリグではなくシグニ**）。⚠**シグニアタック経路では攻撃者が先にダウンする**（`BattleScreen.tsx:7858` の `signi_down[zoneIndex]=true` → `ON_ATTACK_SIGNI` 収集は `:7920`）ため、**シグニゾーンは最大3面**しかない盤面では**アップの白シグニが最大2体**しか残らず、`fieldDown:{count:3}` は**永久に成立しない**。**実機実測＝白3体を並べても `pay:発動する（コスト: 《白》）**(disabled)**`／`signiDown=[true,false,false]`**。⇒ **ルリグアタック時（`ON_ATTACK_LRIG`）なら3体ともアップのまま**なので、**timing の誤りがコストを到達不能にしている**という筋が通る | 2026-08-13 続き471（PLAN §7 V-09④ の実機検証）。⭐**codex が投入前の静的読解で「D2 は到達不能」と予告**し、**skip で偽 PASS させず `canAfford極性不一致` で FAIL する設計**にしたため、実機で一撃で確定した | 直すなら **timing を `ON_ATTACK_LRIG` へ**＋**帰結の対象を `LRIG` へ**（(cxxvii) と**同型の「対象種別の取り違え」**）。⚠**parser 側の生成規則も直さないと held drift になる**（§5-9）。⚠**検査用シナリオは既にある**（`fieldDownCostPaysThreeAndWhite`＝**現在 FAIL＝直れば緑に反転**／対照の `fieldDownCostRequiresThreeUpWhite` は PASS 済み） |
| 🆕(cxxvii) | 🔴**「このアタックを無効にする」が自分のアタックに効かない**＝`SPDi43-06-E1`／`WXDi-P05-037-E1` は原文「【自】：**この**シグニがアタックしたとき、対戦相手は〈コスト〉を支払ってもよい。そうした場合、**このアタックを無効にする**」なのに、帰結が `NEGATE_ATTACK{target:{type:'SIGNI', owner:'opponent', count:1}}`。`execNegateAttack`（`effectExecutor.ts:5861-5863`）は **`ownerState(tgtOwner)` の場から候補を作る**ので、**効果主（＝アタックしている側）自身のアタッカーは候補に入らない**。実測＝**CPU がコストを払ったのにアタックが通り `host` のライフが 7→6**（`SPDi43-06` はエナ2枚、`WXDi-P05-037` は手札2枚を実際に徴収済み＝**支払いと極性は正しく動いている**／無効化だけが空振り）。⚠**直接アタック盤面では相手の場が空なので候補0で無言に終わる**＝ログにも出ない | 2026-08-13 続き468（PLAN §7 続き425 ブロックの実機検証）。⭐**codex が投入前の静的読解で「P1/H1 は空振りする可能性が高い」と予告し、指示どおり修正せずトリップワイヤとして残した**＝実機で予告どおり再現 | **live 全数実測＝`NEGATE_ATTACK` は 73件すべてが `owner:'opponent'`**（`self` は語彙に1件も無い）。うち**「自分のアタック時に発火」するのはこの2効果だけ**（`ON_ATTACK_SIGNI` × `triggerScope:'self'`）＝**残り71件は「対戦相手のアタックを無効にする」形で `opponent` が正しい**。⇒ 直し方は「この2件だけを `owner:'self'` にする」＋**`attackingOnly:true`**（`effectExecutor.ts:5879`＝`attackingSigniOf(state)` で宣言中のアタッカーに絞る既存フラグ）の併用が有力。⚠**parser 側の生成規則も直さないと held drift になる**（§5-9）。⚠**検査用シナリオは既にある**（`oppPayNegateAttackWhenPaid`／`oppHandDiscardIsOpponentSide`＝**現在 FAIL＝直れば緑に反転**） |
| 🆕(cxxv) | 🔴**離場置換の対話が「普通の効果バニッシュ」で発火しない**＝続き430 で対話化した離場置換が、**`BANISH{count:数値}`（`selectOrInteract`→SELECT_TARGET→resume の経路）では問いを1度も出さず、engine が従来どおり自動適用している**。実測＝`WX19-023-E3`（`BANISH{count:1, powerRange:{max:12000}}`）で CPU の `WX12-024` を狙っても **`asks=0`／`pending_effect` なし**のまま身代わりが成立し、さらに**注入した `leave_substitute_choices` が honor されず消費もされない**（`{'WX12-024#5':'none'}` を入れても身代わりが適用され、決定は残留）。⚠**`count:'ALL'` 経路は完全に正しく動く**（問い2件・`responder=CPU`・`options=[banishSubstitute…, none:置換しない]`・全応答まで対象が場に残る）＝**同じ機構なのに入口で挙動が割れている** | 2026-08-13 続き466（PLAN §7 続き430 ブロックの実機検証・Codex 起案→Claude 実行）。**対照シナリオ2本（`leaveSubNoOptionMeansNoAsk`／`leaveSubAllTargetsAskedPerVictim`）が両方 PASS したことで局在が確定** | hoist は **`execBanish` の `count:'ALL'` ブランチ（`effectExecutor.ts:1011`）にしか無く、数値 count は `:1021` の `selectOrInteract` へ抜ける**。resume 側の hoist（`:7411` の `leaveSubstituteAskQueue(pending.thenAction.type, selected, cur)`）がこの経路で効いていない理由の特定が先。⚠**盤面は自動適用時と完全に同一になるので golden も census も緑のまま**（§7 の「無言」の壊れ方）。⚠`BOUNCE`/`SEND_TO_ENERGY`/`TRASH`/`EXILE`/`TRANSFER_TO_DECK` の数値 count 経路も同じ疑いがあるので**入口を全数で確認してから直す**。⚠**検査用シナリオは既に4本ある**（`leaveSubCpuAutoRespondsSubstitute`／`leaveSubAskDirectedToVictim`／`leaveSubDecisionNoneIsHonored`／`leaveSubDecisionKeyIsHonored`＝**現在 FAIL＝修正されたら緑に反転する**） |
| 🆕(cxxvi) | 🔴**相互身代わりで同一インスタンスがエナに複製される**＝`count:'ALL'` のバニッシュで、victim A が B を身代わりに指定し、victim B が A を指定すると、**最終盤面のエナに同じインスタンスが2枚**現れる。実測＝`gEnergy=["WX12-024#52","WX12-024#52","WD03-013#53"]`（`#52` が重複）／同時に **`leave_substitute_choices` が1件消費されずに残留**（`{"WX12-024#52":"banishSubstitute:WX12-024#52:WX12-024#51"}`） | 2026-08-13 続き466＝`leaveSubAllTargetsAskedPerVictim` の実機ログ。**シナリオ自体は「体ごとに1回ずつ問う」の検査が主目的で PASS しているが、最終盤面の中に複製が写り込んでいた** | 「先に全部聞く」設計（`hoistLeaveSubstituteAsks`＝`:709-716`）は決定を刻んでから**同じ action を再入**する。再入時に**既に身代わりで場を離れたカードが cands に残っている**か、`applyBanish` のループが**身代わり適用後の盤面を見ていない**疑い。⚠**fuzz が拾えていない**（乱択で相互指定の盤面に到達しない）＝**再現盤面が判明している今のうちに golden で固定する**のが安い |
| 🆕(cxxiii) | 🔴**ピースのコストが二重に請求される疑い＋効果が使用時に解決しない**＝`WXDi-P14-002`（CONNECTスピニング・Type=ピース）は CSV `Cost=《赤》×１《無》×２`、live の `E1` も `effectType:'ACTIVATED'`／`timing:['MAIN']`／`cost.energy=[赤1,無2]` と**同じコストを2箇所に持つ**。実機では `KeyUseModal` で印刷 Cost を徴収して「セット」した時点で `executeKeyPiece`（`BattleScreen.tsx:6613`）が `queueCardEffects(..., ['AUTO'], ['ON_PLAY'], ...)` **しか積まない**ため**効果は一切発火せず**（実測 `pEff=-`）、効果を出すには KEY スロットの【起】（`getKeyPieceActions`→`executeKeyActivated`）を別途起動して `cost.energy` を**もう一度**払う必要がある。ルール上ピースは「使用＝コストを1回払って即解決」なので、**セット時徴収＋起動時徴収の二重取り**か、少なくとも「使っただけでは解決しない」過少実行のどちらかに該当する | 続き436（PLAN §7 実機検証バッチ2）＝`connectSpinningChoice4Pay` を実行し、エナ選択・セットまでは完走するのに効果が出ないところで停止したことから実測で特定 | まず**ピースを キー と同じ「セットして後から起動する」もの**として実装している設計が正しいかの裁定が要る。ピース全体（Type='ピース' の母集団）を数えて、`ACTIVATED` 効果を持つ枚数と `cost.energy` が印刷 Cost と一致する枚数を実測してから決める。⚠**`executeKeyPiece` は キー と ピース の共通経路**なので、片方だけ直すつもりで触ると キー 側が壊れる |
| ✅(cxxiv) | ~~`WX25-CP1-091` の ON_TURN_END 任意コストが実機で出ない~~ **＝2026-08-13 続き463 で解決**。**切り分けの結果、続き436 の見立て（ターンが終わっていない）は誤りで、ターンは正しく進んでいた**（実機スクリーンショットで T3・アーツステップ(相手)を確認）。**真因は engine ではなく parser の runtime 補完**＝`inferTriggerScope` がカード全文の「次の対戦相手のターン終了時**まで**」（＝効果の**期間**）をトリガーと誤読し、`ON_TURN_END` 効果を `any_opp` へ書き換えて**自分側 collector から丸ごと落としていた**（**41効果/40カードが実機で一度も発火しない無言バグ**）。`kokonaUnderThreePay`/`ThreeSkip`/`Insufficient` の3本は反転して**2回連続PASS・既定 order へ登録**。詳細は BUGFIXES 続き463 |
| (cxix) | **`SPDi43-11-E2` の内側付与【自】が timing 誤パース**＝原文「あなたの効果１つによってカードが合計１枚以上あなたの手札に移動したとき」は **ON_HAND_ADDED**（`triggerCondition` つき）なのに、live は **`ON_PLAY` + `triggerScope:'self'`** になっている。同型の `SPDi43-12-E2`（ON_ENERGY_TO_TRASH）／`SPDi43-13-E2`（ON_ENERGY_CHARGE）は正しくパースされているので、**「手札に移動したとき」節だけが ON_PLAY へ落ちている**疑い | 続き404（§6.4 付与ストア共通走査）で付与能力144件を timing 集計した際に発見。**今回は ON_PLAY の scope 集合から `self` を外したので誤発火はしていない**（＝現状は no-op のまま） | parser の「〜が場に出たとき」フォールバックが先に食っている可能性。`GRANT_LRIG_ABILITY` の内側 rawText 再パース経路（続き398 の `WX20-036-CB-E1` と同型）も疑う |
| ~~(cxxi)~~ **🏁2026-08-10 続き416〜417 で残0クローズ** | 「〜てもよい。そうした場合、…」型の任意性脱落 35件 | 続き408 | **見立ては半分外れ**＝「動詞ごとに手書き」ではなく**型ごとに `optional` の受け皿が有る/無い**のが本質だった。`TRASH`/`TAKE_FROM_UNDER_SIGNI` は既に正しく、`DRAW`/`DOWN`/`ATTACH_CHARM`/`TRASH{DECK_CARD}` に受け皿が無い。汎用「連用形＋てもよい→optional」規則は**入れなかった**（受け皿の無い型に付けても黙って無視されるだけ）。正準形の STUB（`OPTIONAL_COST`/`OPTIONAL_ACTIVATE`/`OPTIONAL_TRASH_SELF`）へ寄せる5クラスタで消化。詳細は BUGFIXES 2026-08-10（続き416/417） |
| 🆕(cxxii) | **`WXDi-P05-037-E1` の任意手札捨てが所有者取り違え**＝原文「このシグニがアタックしたとき、**対戦相手は**手札を２枚捨ててもよい。そうした場合、このアタックを無効にする」なのに、live は `TRASH{HAND_CARD, owner:'self'}`＝**アタックされた側（自分）が捨てさせられる**。しかも捨てるかどうかを決めるのも自分になっている | 続き417（§6.4 任意性脱落の掃き出しで隣接発見） | `opponentResponds`（相手自身に選ばせる）＋ `owner:'opponent'` の組が要る。⚠**`opponentResponds` は「誰がクリックするか」だけを変え ctx の視点は反転しない**（続き411 の教訓）ので、候補と適用先を明示的に `otherState` 側へ向けること。1カードの端案件だが**アタック無効化の可否が逆転する**ので影響は大きい |
| (cxx) | **ON_ENERGY_CHARGE watcher 経路の usageLimit が未管理**＝`BattleScreen` のエナ差分 watcher（場のシグニ＋続き404 で足した付与ストア）は entries を積むだけで **`actions_done` へ書き戻さない**ため、《ターン1回/2回》が効かず**エナチャージのたびに撃てる** | 続き404 で `SPDi43-13-E2`（《ターン2回》）を配線したときに判明。**印刷シグニ側にも元からある穴**（今回作った穴ではない） | 他コレクタと同型に `usedIds` を返して呼び出し元で `actions_done` へ書き戻す。該当 useEffect は `SET_STACK` しかしていないので state 書き込みの追加が要る |

> **🏁🏁2026-08-08 に在庫5件を残0クローズ＝(cxv)(cxiii)(cxiv)（先発3件）と (cxvii)(cxviii)（(cxiii) から切り出した機構待ち2件）**。**5件とも登録時の見立てが外れていた**（真因の対照表と登録行の原文は [PLAN_DETAIL.md](./PLAN_DETAIL.md)「2026-08-08 整理④」節へ退避）。live 12カード・golden 1472→1481・smoke 10679→10686・census 927→932。一次記録は `BUGFIXES.md` 2026-08-08 の先頭2節。⚠**要実機検証5件**は §7「残る実機検証項目」へ登録済み。
⚠**5件が残した教訓（(a)〜(f)＝(cxv)(cxiii)(cxiv)／(g)〜(j)＝(cxvii)(cxviii)）**＝(a) **`activeCondition` に `Condition` 型を書いても誰も止めない**＝`checkActiveCondition` は未知の型で `return true`（無条件成立）に落ちるので、型を1つ取り違えるだけで「条件つき常在能力が常時発動」になり **smoke/census/fuzz は全部緑**。両評価器の末尾に `never` 代入を置いて網羅性を typecheck に固定し、JSON 側は golden がミラー表（`ACTIVE_CONDITION_TYPES` / `CONDITION_TYPES`）と機械照合するようにした。 (b) **ミラー表は `src/` に置く**＝`scripts/` は tsconfig の include 外で**型検査されない**（goldenTest 内に書くと自動追随しない）。 (c) 内側 operator switch の後の `break;` は**外側 switch を抜けて末尾の `return true` に落ちる**＝保守側で閉じる。 (d) **「代わりに」は機構ではなく帯**（`AND` ＋ `operator:'lt'`）で表せる／パワー修正は加算分解。 (e) **`STUB` を「未実装」と決めつけない**（引用付与2種は実装済みで、落ちていたのは「条件を置く場所」＝`keyword_grants` は条件を持てない→`granted_effects` へ回す）。 (f) **`build:effects` の収穫マージには構造的な穴がある**＝MANUAL/PARTIAL を含むカードで **effectId の集合が変わる**と `_held_fresh`／`_partial_fresh` の**どちらにも載らずカード丸ごと温存**される（`sameIdSet` ガード）＝効果を新設するバッチは必ずここに落ちるので parser 出力を直接 live へ書く。 (g) **「機構待ち」の見立ては疑う**＝2件とも足りなかったのは新機構ではなく「①動的レベルを**読む条件型**」「②分岐を**書ける場所**」だけで、部品（`calcSigniLevels`／`IS_BETTING`／`GRANT_EFFECT{targetsLastProcessed}`）は既に揃っていた。 (h) **閾値を別の量で近似した手当ては過剰実行の種**＝`WX20-Re18-E2` は「レベル4以上」を`SELF_POWER_GTE 12000` で近似していたが、パワーだけバフされるとレベル3でも発火する（近似は「たまたま境界が合う」だけで、独立に動く量には効かない）。 (i) **`manualEffects.ts` にある効果は parser の後処理では直せない**（`mergeManualEffects` が上書きする）＝実体のある側を直す。 (j) 逆翻訳の `condJa` は **Condition と ActiveCondition を1つの switch で描く**＝同名型の case は1箇所だけ（両方に足すと `no-duplicate-case`）。

🏁**2026-08-07（続き363）に (cx) までは残0クローズ済み**。クローズ済み行の原文は [PLAN_DETAIL.md](./PLAN_DETAIL.md)「2026-08-06 整理③」節（それ以前の〔(i)〜(lvi) の大半〕は同ファイル §3 の 2026-07-19・2026-07-24・2026-07-28・2026-07-29 の各退避節）。

> **🏁🏁2026-08-07（続き363）に最後の (cx) を残0クローズ**＝「対戦相手のシグニ1体がアタックしたときにしか使用できない」【起】（`WX05-013-E2`）。登録時は「新しい ACTIVATED の窓の設計が先＝1枚のために作る費用対効果は低い＝据置が妥当」と結論していたが、**既存の応答窓の作法（`ON_OPP_SIGNI_ATTACK_DIRECT`／`WX04-004-E2`）に合流させれば新規UIは不要**と分かり実装した。⚠**残す教訓**＝(g) **「〜したときにしか使用できない」は使用条件ではなく使用タイミング**。condition に落とすと、仮に真になっても**【起】のUIは全経路が自ターン限定＝到達経路が無い**。窓が要るなら timing を足して収集側（`performSigniAttack`）を書く。 (h) **`TurnPhase` に無い phase 値は「全ゲート緑のまま一生 false」**＝no-op 網にも census にも映らない。golden `(cvii)` の「不正 phase 値0件」を維持するのが唯一の再発検知。 (i) **進行中のアタックは `negated_attacks`（宣言時に見る事前登録）では止まらない**＝`cancel_current_signi_attack` を立てる。一次記録は `BUGFIXES.md` 2026-08-07 の節。

> **✅2026-08-06（続き356〜362f）に残0クローズした16件＝(cviii)(cvii)(ci)(cii)(cv)(civ)(xcvii)(xcvi)(lxvi)(cxi)(c)(cix)(xciii)(lxxxviii)(lv)(xciv)**＝当時の残は (cx) 1件だった（**その (cx) も 2026-08-07 続き363 で残0クローズ＝在庫は空**）。＝完了行の原文は [PLAN_DETAIL.md](./PLAN_DETAIL.md)「2026-08-06 整理③」節。一次記録は `BUGFIXES.md` 2026-08-06 の各節。⚠**残す教訓**＝(a)「実機 FAIL＝engine バグ」ではない〔(civ)＝計器の嘘／(cxi)＝UI の収集漏れ〕 (b) **中断（対話）を挟むと盤面差分は 1巡目ぶんが丸ごと消えていた**＝ON_* 系の実機 FAIL はまず中断の有無を疑う (c) CPU の対象選択は**ランダム**＝「結果が正しい」は合格条件にならず、候補列そのものを見る。 (d) **コスト計算の入口は3箇所ある**〔`ArtsModal` Phase1／Phase2／ルリグデッキのカード詳細「使用」ゲート〕＝1つ落とすと「一覧からは使えるのにタップすると使えない」食い違いになる（(xciii)(xcii)）。 (e) **`STUB` を「未実装」と決めつけない**＝`BET_MECHANIC` / `GRANT_QUOTED_AUTO_ABILITY` は原文から選択肢を組み立てる実装済みハンドラで、**JSON を静的化するとかえって忠実さが落ちる**ことがある（(lxxxviii)）。 (f) **golden が原理的に守れない経路がある**＝engine ハーネスはコスト支払いも同じ ExecCtx で行うので、実UIだけで切れる参照〔`lastProcessedCards`・`seqVars`〕は緑のまま素通りする。コスト由来の参照を足したら**実機シナリオを1本足す**（(cix)）。
> **✅2026-08-04（続き341〜346）に残0クローズした6件＝(xcii)(xcv)(lxvii)(xcviii)(lxviii)(xcix)**（相手盤面参照のコスト軽減8枚／「能力を持たない」判定の統一／CPU ターンの境界トリガー279効果／CPU のターン開始ドロー／散文形「対戦相手のターンの間、」の過剰実行／主語なしアタック watcher の scope）。**完了行の原文は [PLAN_DETAIL.md](./PLAN_DETAIL.md)「2026-08-04 整理」節へ退避**。一次記録は `BUGFIXES.md` 2026-08-04 の各節。
> **✅残0クローズ済みの在庫の完了行原文は [PLAN_DETAIL.md](./PLAN_DETAIL.md) の各整理節へ退避**＝**🆕(lxxxi)〔使用コストの条件つき置換＝2026-08-03 に 続き334＋335 の2セッションで残0クローズ。一次記録は BUGFIXES 2026-08-03 の2節〕**、**🆕(lxxxiv)〔スペルカットイン経路のベット宣言UI＝2026-08-03 続き336 で残0クローズ。一次記録は BUGFIXES 2026-08-03 の先頭節〕**、**🆕(xci)〔カード名指定の《無》軽減がスペル使用モーダルに無かった＝2026-08-03 続き340 で残0クローズ。一次記録は BUGFIXES 2026-08-03 の先頭節〕**、**🆕(lxxxv)＋(lxxxix)〔使用時の任意支払いによるコスト軽減＝2026-08-03 続き337 で 31枚・続き338 で 場のシグニ払い2枚を追加し**残0クローズ（計33枚）**。残3枚は別機構/別意味で対象外。一次記録は BUGFIXES 2026-08-03 の先頭2節〕**、**🆕(lxxxvi)＋(lxxxvii)〔スペル本体のベットの `ON_COIN_PAID` 配線／カットイン窓のコスト算出をアーツ経路と同じ機構へ＝2026-08-03 続き339。一次記録は BUGFIXES 2026-08-03 の先頭節〕**、**🆕(xci)〔カード名指定の《無》軽減がスペル使用モーダルに無かった＝2026-08-03 続き340 で残0クローズ。一次記録は BUGFIXES 2026-08-03 の先頭節〕**、「2026-08-02 整理③」節に (lxx)／(lxxviii)／(lxxxii)〔第3〜6波の追記込み〕／(lxxxiii)**、「2026-08-02 整理②」節に (lxix)(lxxi)(lxxii)(lxxiv)(lxxix)(lxxx)＋(lxi)〔支払い回避クローズ全11波〕(lxxiii)(lxxv)(lxxvi)(lxxvii)。一次記録は BUGFIXES 2026-07-30〜08-02 の各節。⚠**残す教訓**＝(a) engine の回避手段語彙は7系統＝新しい回避手段はそこへ足す／「AかB合計N枚」は2枝に割らず単一プールの候補型で表す (b)「読めた」は「正しい」ではない＝文型 regex は巻き込む。規則を足したら `build:effects` で held 増分と live per-effect 差分を必ず見る (c) 収集経路の無い timing を足すと過剰実行を no-op へ替えるだけ＝collector とセットで。

#### Sonnet のタスク（2026-07-15 棚卸し・生きているものだけ）

> **2026-07-15（続き134）の棚卸しで在庫はほぼ枯渇→続き201/208 の採用待ち在庫77件も✅続き214で全消化**。現在の Sonnet 在庫＝タスク1（§7 実機検証＝(xi)/(xxxvi) の要実機検証ほか）と、Opus の新語彙着地待ちのタスク6。タスク8 の次ラウンド（clean群への展開）は任意・低優先。

| # | タスク | 種別 | 規模 | 残っている内容 |
|---|---|---|---|---|
| 1 | **§7 実機検証の横展開** | 検証（driver シナリオ追加のみ） | S×件数 | 既定order 94件まで消化済（続き263までの既存分＋2026-08-04/05に追加した17シナリオ）。**残作業は §7「残る実機検証項目」が単一の worklist**＝ここには重複を書かない（2026-07-30 に §4 進捗サマリと二分していたのを §7 へ集約）。**✅2026-08-04＝タスク12(lxi) 本消化5件のうち(a)(b)(d)(e)＋§6.3 H／I′ の5件すべて（a-e）を実機検証完了**（タスク12(lxi)(c)併記型はlive実例0件のため据置）。**✅2026-08-05＝タスク12(lxi) 第10波(a)(b)＋(lxxvi) ゾーン供給源2種のうち1種＋タスク12(lxiv)(lxv)(lx)(lxii) を実機検証完了**（「シグニを新たに配置できないゾーン」／「対象ピッカー前置」／「条件つき任意コストのゲート」／「捨てる枚数スケール型ピッカー」を確認）。**検証中に新規実バグ4件を発見・Opusタスク12(ci)〜(cv)へ登録**＝(ci)costColors非搭載OPPONENT_PAY_OPTIONALの無料pay枝／(cii)CPU自動応答のエナinstanceId未送信／(civ)対象宣言直後に別インタラクションへ続く場合ON_TARGETEDが0回発火／(cv)`opp_hand`+`opponentResponds`のviewer視点描画バグでソフトロック。**次の最優先＝タスク12(lxi) 第11波（`WXK06-067-E1` ゾーンを跨いだ選択モーダル）／タスク12(lxiii)(lxi)第2波・第3波 系統**（§7「残る実機検証項目」の残りリストを上から）。経緯は PLAN_DETAIL §3 。**🆕2026-08-07（続き366）＝タスク12(cxvi) の実機検証を追加**＝「コインを払ってからアタック→条件つき効果が発火する／払わなければ発火しない」（`WXDi-P15-068`〔合計2枚以上でエナチャージ〕か `WXDi-P09-039`〔合計1枚以上でバニッシュ〕）。累計の**加算**は `BattleScreen` の支払い経路にあり golden では踏めない|
| 3 | driver バッチ実行の状態汚染 | scripts（engine/JSON 非依存） | M | ⏳主要因は解消済み（続き77/105/139/140/142）。**残**＝(b)`oppDraw` 単独FAIL（CPU挙動依存）(c)`lrigGrowAnyOppP03046` FRESH=1 FAIL（CPUがグロウ判断に至らない）。現在シナリオ 81定義／75既定実行 |
| 6 | §5c 再収穫サイクル（`/census-batch` 準拠） | JSON採用 | S | **✅続き214で在庫77件を全消化＝64枚採用**。次の在庫が発生するまで待機（Opus 新語彙着地待ち）。⚠P1宣言により新規バッチは切らない |
| 8 | semantic audit のスケールアップ＋単点修正 | パイプライン＋JSON単点 | M | **✅stub群母集団2,401枚は全数監査完了**（findings→Opusタスク12 (xxvii)(xxviii)(xxix)）。残＝clean群3,574枚への展開（任意・低優先）。累積除外リスト `scripts/archive/scratchpad/semantic_audit_stub_round3/audited_stub_cards_cumulative.txt` |

> **✅退避＝タスク4（BEHAVIOR_AUDIT キュー再生成＋一次トリアージ）は ⛔枯渇（休眠）**＝続き133 で高シグナル22件精査＝真 no-op バグ0件。行の原文は [PLAN_DETAIL.md](./PLAN_DETAIL.md)「2026-08-06 整理③」節（再開するなら監査ツールの構造的盲点フィルタ実装が先＝低収量見込み）。

（消化済み在庫＝未採用在庫 第2弾40枚〔続き208〕・未採用在庫37効果〔続き201〕・補欠(a)(b) はいずれも✅続き214/172/170 で全消化。詳細 BUGFIXES 各続き）

**依存の要点（交互サイクルの回し方）**＝待ち関係は3本：**Opus1〜6 → Sonnet6**（新語彙が着地してから再収穫）／**Sonnet1・8 → Opus12**（Sonnet が観測して積む → Opus が修正する。タスク4 は⛔枯渇で退避済み）／**Opus12 → Sonnet1**（修正が着地すると §7 の意図的FAIL回帰シナリオを PASS へ反転させる検証作業が生まれる）。それ以外の組はすべて独立＝どの順で取っても衝突しない（バトン式・同時作業はしない）。

**🆕2026-08-07 続き376＝Sonnet がタスク1で「コイン支払い累計」機構を実機検証完了**（`coinsPaidAttackFires`／`coinsPaidAttackSkipped` を既定orderへ・126→128件）。⚠**残＝`coins_paid_this_turn` の加算は `BattleScreen.tsx` の10経路にあり、実走したのは ACTIVATED【起】1本だけ**（グロウ／ベット／アンコール／【出】コストは未検証）。

**現在の Sonnet 在庫＝タスク1（§7 実機検証）が主力**。タスク6は Opus の新語彙着地待ち・タスク8 clean群は任意。作業中に parser/engine のバグを見つけたら Opusタスク12 へ登録し交互サイクルへ戻す。⚠**2026-08-08 時点で Opusタスク12 の在庫は🏁0件**。🏁(cxv)(cxiii)(cxiv)(cxvii)(cxviii) は 2026-08-08、🏁(cxvi)〔コイン支払い累計〕は続き366、🏁(cxii)〔パワー参照ゲートの表記パワー落ち〕は続き367 で残0クローズ。

---

## 4. 現在地とバトン（直近セッション）
> ① `git pull` → ② 本節を読む → ③ 作業 → ④ 本節と `BUGFIXES.md` を更新 → ⑤ commit & push を回す。詳細な修正履歴は `BUGFIXES.md`（新しい順）に積む。ここは**現在地・計画・残作業数だけ**。

### 📍 進捗サマリ（最新1件のみ・過去は別ファイル）
> **運用ルール（2026-07-07〜）**：この節には**直近の作業1件の要約だけ**を残す（入れ替え式）。新しく作業したら ①いま置いてある要約を [PLAN_PROGRESS.md](./PLAN_PROGRESS.md) の「過去セッション要約」**先頭**へ移す（新しいものが上）→②この節を今回の作業の要約へ丸ごと書き換える。過去の全セッション要約（旧・要約①②を含む）は [PLAN_PROGRESS.md](./PLAN_PROGRESS.md) に集約済み。
- **🆕 セッション（2026-08-13・続き460〜464・Opus 5）＝**Codex 委譲で5バッチ連投**＝§7 実機挙動（P3）で**新規シナリオ13本＋反転3本すべて2回連続PASS・既定 order 登録**し、**実バグ3件**（手札スペルの封じゲート欠落／**`ON_TURN_END` 41効果の無言不発**／**追加ターンの所有者が相手に反転**）を解消。さらに**同じ構造の無言バグ層を全数棚卸し**（→§6.4 **O-20**）。ゲート数値は全て据置（golden 1956・census 831・smoke 10688・lint 0 errors/259 warnings）**。
  - **✅① §7 の3ブロックが決着**＝**続き459（2件）・続き458（2件）・続き457（3件）**。残っていた「engine は golden で固定したが実UIでしか踏めない」層を実機で潰した。
  - **⭐② 能力喪失は2軸**＝**cardNum 軸（`abilities_removed`）とフラグ軸（`keys_abilities_disabled`）**。`WXK05-010-E2`（キー1枚を対象）は前者、`alsoKeys`（全キー）は後者。実機で**選んだ1枚だけが喪失しもう1枚は無傷／フラグは false のまま**を確認＝取り違えていない。読みは `activeKeyAbilitySources` funnel が両方を見る。
  - **🔴③ 最重要の回帰確認**＝**キー能力喪失が「捨て札なしでターンを終える」経路でも戻る**（続き457 で `turnScopedState` へ登録するまで、**この経路だけ永久に戻らなかった**）。
  - **⭐④ 焼き込み検出**＝`WDK10-009-E2` の「レベル１につき−2000」は、**ゾーンのシグニを差し替えると新しいレベルで再計算される**（−6000→−2000）。**適用のたびに掛ける実装**が実機で効いていることを確定。
  - **🔴⑤ 観測設計の教訓3つ**＝(a)**ゲートが「画面の持ち主」を見るなら、自分で撃っても観測できない**（`SPDi47-01` は相手側を喪失させる＝engine 側と UI 側で2本に割り、UI 側は注入で見る） (b)**純計算値のパワーは `temp_power_mods` に載らない**＝`powerMods` を見て「効いていない」と判定したら誤り。**DOM 表示で見る** (c)**`injectScenario` は grant を消す**＝継続性の検証用に **`H.patchPlayerState`（削除を一切しない最小 PATCH）** を新設した。
  - **🔴⑥ ドライバの罠3件（どれも engine が壊れて見える FAIL を出す）**＝(a)**`field.check` だけは注入でリセットされない**（前シナリオのライフクラッシュ確認モーダルが全画面を覆い**クリックが1つも通らない**）⇒ spec に `'field.check': null` を必ず入れる (b)**`ATTACK_ARTS_OP` は非ターンプレイヤーが「アーツ終了」で進める**＝押さないと**CPU のターンが永久に終わらない** (c)**`getByRole('button', { name: <正規表現>, exact: true })` は count() が常に 0**（`exact` は文字列名にしか効かない）⇒**ラベル照合は `data-action-label` の前方一致で行う**。⚠**3件とも切り分けの決め手は `scratchpad-verify/<id>-final.png`**＝ログだけ見ると engine 側に誤診する。
  - **⭐⑦ Codex 委譲の型が固まった**＝**実行できないタスクでも起案は成立する**（13本中12本が起案どおり動き、残り1本の FAIL は**実バグの検出**だった）。**指示書の冒頭で「あなたはこれを実行できない・報告の実行結果欄は BLOCKED が正しい」と明言**すると時間を溶かさない。⚠**3バッチ連続で指示書（Claude 側）の誤りを Codex が訂正**（`SP38-006`/`WDK10-009` のカード種別・先例シナリオ・原文）＝**投げる前に行番号とカード種別を自分で開いて確かめること**。
  - **🔴⑧ 続き463＝§7 の未解決ブロックを潰したら engine の無言バグが出た**（Codex 委譲・第4バッチ）＝続き435〜436 が「ターン終了ボタンは押せるのに何も起きない・原因未確定」として既定 order 外に置いていた `WX25-CP1-091`（3本）が**反転して2回連続PASS**。**真因は engine ではなく parser の runtime scope 補完**＝`inferTriggerScope` がカード全文の「次の対戦相手のターン終了時**まで**」（＝効果の**期間**）をトリガーと誤読し、`ON_TURN_END` 効果を `any_opp` に書き換えて**自分側 collector から丸ごと落としていた**。**実測＝41効果/40カードが「あなたのターン終了時」なのに一度も発火しない無言バグ**（golden も census も緑のまま／`docs/BUGFIXES.md` 続き463）。⚠**Codex の修正には副作用があり、検証で全カードの `triggerScope` A/B を取って発見した**＝ON_PLAY 側で**自身の【出】が `any_ally` に化ける**カードが5枚（`WXDi-P11-007`／`WXEX1-15`／`WDK12-001` ほか＝**味方シグニが出るたびに【出】が発動**）。「カードが【出】を持つなら ON_PLAY の推論をしない」ガードで塞ぎ、**恒久解は §6.4 O-19 へ登録**。⭐**教訓＝広い推論を触る変更は、必ず全カードの前後 A/B を取る**（golden は通っていた）。
  - **🔴⑨ 続き464＝同型狩りで「計器に映らない層」を棚卸しした**（Codex 委譲・第5バッチ）＝⑧ と続き459 が**同じ構造**（実行時にカード全文 regex で意味を決めるが、その文が**どの能力に属するかを知らない**）だったので、**生テキスト読取298箇所を全数分類**＝A（単なる存在チェック）18／B（文脈依存だが現行 live では一意）258／**🔴C（別の能力の文に一致しうる）22**。**C は全件に誤爆する live カードを名指し済み**＝§6.4 **O-20** に個票を作った。⭐**修正1件＝`SP38-006-E4` と `WXK05-001-E2` で「あなたはこのターンの次に追加の1ターンを得る」が、同カード内の別能力の「対戦相手は…」を貪欲 `.*` で拾って相手に渡っていた**＝**勝敗直結**。全カード A/B で変化は狙いの2効果だけであることを確認。⚠**共通の直し方は regex を絞ることではなく「その効果を生んだ能力ブロックを渡す（source 配線）」**＝1件ずつの regex 修正は対症療法。
  - **▶ 次の一手**＝**Opus 側**：(a)**O-20 の残21件**（全件に根拠カードがあるので**調査ゼロで着手できる**＝費用対効果が最良の在庫。まず `WXK10-083` の二重配線と `execStubPart3:3704` の3経路のように**同じ真因が複数箇所に跨るもの**から）(b)**O-19**（watcher 文の `triggerScope` を parser が明示する。⚠実測＝live JSON で scope 未定義の AUTO 効果は **2584件**で、うち **parser が出せるのは1件だけ**＝**parser に機構を足す話**であり held drift を伴う**単独バッチ**）(c)**O-18**(d)続き459 の `DEFERRED_*` 26効果(e)**O-1 CPU AI 拡張**。**Sonnet 側**：**§7 実機検証の残り**＝O-13 と続き452〜453、続き403〜436 の未消化ブロック（`WXDi-P14-002` のピース起動＝§3 (cxxiii) が最有力）。⚠**新規シナリオは `'field.check': null` を必ず入れる／ラベル全文一致に依存しない。**

### 📊 恒久指標（最新1件のみ・履歴は PLAN_DETAIL）

- **🆕 2026-08-13 続き460〜464（Codex 委譲5連投＝§7 実機検証＋全文regex層の棚卸し）後 最新値（本行が直近の正）**：census **831 据置**（`BASELINE_HIGH` 831）、golden **1964（1956→+8＝`ON_TURN_END` の scope 誤補完 6本〔続き463〕＋追加ターンの所有者 2本〔続き464〕）**、smoke **10688 / SKIP 0**、fuzz 全0、**同型★ 0**（グループ265）、held（parserWorklist）**106枚 / 署名グループ 47件**（据置）、lint **0 errors / 259 warnings**（据置）、**ターン限定 PlayerState レジストリ 35フィールド**（据置）、**UNKNOWN 25ノード / 25カード**（据置）、`MANDATORY_SUSPICIOUS` **0**、`census:stubs` A群＝**無言 no-op 0**／**明示 defer 24種 42件**、**`FieldGrant` の kind 3種**（`power`〔`perTargetLevel`〕／`abilityLoss`／`blockAction`）。🆕**実機シナリオ（`verifyBattleDrive.mjs`）＝既定 order に +16本**（続き460 の4／461 の6／462 の3／463 の反転3）。🆕**実行時の全文 regex 読取 298箇所＝A 18／B 258／🔴C 22**（C の残21件は §6.4 **O-20** の個票）。live JSON の変更は**0**（続き460〜464 は engine/parser/driver のみ）。
> **過去の計測履歴 48 行（続き298〜328 ほか）は [PLAN_DETAIL.md](./PLAN_DETAIL.md)「2026-08-02 整理②」節へ退避**（2026-08-02）。**直近の正は上の1行**。以後もここには最新1件だけを置き、旧行は同節の先頭へ移す。
- **🆕 2026-07-30 タスク12(xxix) 15波後の最新値（本行を (xxix) 系の正とする）**：**任意cost【出】母集団 981／`optionalOnPlayCostStub` で写せない 4**（＝`costUnparsed` の4件のみ。**すべて明示保留＝理由つきで不発を維持**しており `OPTIONAL_ON_PLAY_COST_REF_DEFERRED` は**0件**。内訳と保留理由は §4 進捗サマリ参照）。**`costUnparsed` 総数 21／AUTO・ON_PLAY・任意 4**。⚠**ゲート値（golden/census/smoke/held）は上の 2026-07-30 タスク12(l) 行が正**（本行の 15波時点の値は 1075／1394／10726／292枚 で、その後 (l) で更新された）。⚠**80/71/59/54/43/35/33/27/20/15/12/10/8/6 等の旧値は母数が違う**（波ごとに新語彙が増えたため）＝**投入前に必ず `npx tsx scripts/archive/xxixResidualCensus.ts` で数え直す**（実関数 `optionalOnPlayCostStub`／`wrapOptionalOnPlay` を import して live JSON を全数走査する計測スクリプト。簿記の数字は信用しない）。
- **P1 表現①の systematic 指標**：同型★0（`node scripts/groupSimilar.mjs --all`）。**held は 229枚／署名グループ 104件（2026-08-07 続き375 実測・据置・`node scripts/heldReview.mjs`）**。旧 242枚/104件＝続き370。旧 259枚/110件＝2026-08-02 続き330＝タスク12(lxxxii) **第6波**の後の実測（⚠**第1波が「採用禁止」と書いた +7カードのうち5枚は誤判定だった**＝`WXK08-002` の退化を根拠に巻き添えにしていたもので、実測すると live 側が「選択肢1本に平坦化＝強制実行」で壊れていた（第6波で採用済み）。**held の「採用禁止」ラベルは根拠カードごとに検証してから従うこと**。旧 265枚/116件＝第2波後の実測。⚠第1波の簿記に codex 報告の 266 を書いてしまい第2波で訂正＝**codex の集計値は鵜呑みにせず数え直す**。⚠第1波の簿記に codex 報告の 266 を書いてしまい第2波で訂正＝**codex の集計値は鵜呑みにせず数え直す**。⚠**直近 +7カードは「採用禁止」在庫**＝parser 緩和が MANUAL/PARTIAL 温存カードの fresh にも波及したぶんで、`WXK08-002` の fresh には退化4点がある＝[PLAN_DETAIL.md](./PLAN_DETAIL.md)「2026-08-02 整理③」の (lxxxii) 行を読んでから採る）。旧 258枚/109件＝2026-08-02 (lxxxiii) 第15波後。旧 251枚/99件＝2026-08-01 タスク12(lxxvii) 実働化後（+1 は honest defer＝`WXK03-069`）。旧 288枚/106件＝2026-07-30 タスク12(lxi) 本消化後の値で、以下の内訳はその時点のもの。**内訳＝lxi 規則で新たに 24枚 held に落ちたが、その24枚と既存2枚〔`WX24-P1-071`／`WX25-P1-005`〕を同じ回で全採用したので、正味は前回 290枚から −2**。旧 290枚/107件＝§6.3 H 節クローズ後。旧 286枚＝タスク12(l) 後。旧 292枚/107件＝(xxix) 15波後。⚠2026-07-29 の5波後は 293枚だった。⚠従来ここに書いていた「251枚」は `21a24900` 時点の値で、その後の parser/manual 変更ぶんが `_held_review.txt` に反映されていなかっただけ＝ベースラインコミットの worktree で再生成して 293/107 の一致を確認済み・`node scripts/heldReview.mjs`）。LOSS/VALUE は **held 259 / LOSS 203 / VALUE 54 / ADD 2（2026-08-07 続き370 実測）**。旧 held 188 / LOSS 154 / VALUE 34（2026-07-19 実測・`npx tsx scripts/parserWorklist.ts`・⚠HEAD比較＝未コミットJSONは反映されない）**。続き29時点（held 79）からの増加は主に**その後の parser 改善で fresh が curated より正しくなった採用待ちバックログ側**（Sonnetタスク6の採用サイクルで消化してから実数を締め直す）。**この数字からさらに増えたら回帰**（JSON手パッチ時は パーサー同修正 or MANUAL化 or ここを実数更新）。旧内訳の詳細は PLAN_DETAIL 参照。
- **脱落疑い 255枚を全分類済み**（偽陽性179／機構待ち72／修正済・`node scripts/_dropTriage.mjs`）。
- **timing flatten**（当初159枚の実バグ）は R5-R58 で完了＝VALUE 0（詳細 §7下部）。
- **🆕 語彙センサス（過剰効果＋幻覚＝両方向の計器）**：`npm run census`（`scripts/vocabCensus.ts`）。**現ベースライン＝高シグナル欠落 1291【効果単位】**（2026-08-02 task12(lxxxiii) 第7波＝leave-field trigger 主語1効果の live 忠実化、1294→1293）（🏁 P1完了宣言〔2026-07-23〕の凍結基線1581から、§6.3個別機構の消化で逓減中。1393→1391 は本セッションの構造化2件ぶん）。**宣言後の推移チェーン（1581→1393 の各バッチ内訳）は [PLAN_DETAIL.md](./PLAN_DETAIL.md)「2026-07-30 整理：census 推移チェーン」節へ退避**。宣言後は worklist ではなく回帰ゲート＝**この数字から増えたら回帰（exit 1）／減ったら `BASELINE_HIGH` とここを実数更新**（新規 parser バッチは切らない）。前提＝`docs/_effect_srctext.json` が最新。3分類〔§6.3送り282／粗網のみ116／長テール1183〕は [P1_COMPLETION_ROADMAP.md](./P1_COMPLETION_ROADMAP.md) 冒頭。明細 `docs/_vocab_census.txt`、**宣言前のバッチ逓減履歴（1919→1581）と旧計測は [PLAN_DETAIL.md](./PLAN_DETAIL.md) §4 の退避節**／BUGFIXES 続き109以降。
- **census 現行補正（第14波）**：高シグナル欠落 **1289**（`WXDi-P14-087-E1` のクラッシュ元限定 live 実働化で 1290→1289）。上行の長期推移文中に残る1291は旧値。
- **母数**：効果カード 5975／効果 **10679**〔2026-07-30 タスク12(l) で47効果がトップレベルから付与入れ子へ移り 10722→10679〕／旧 10719／MANUAL効果 891／STUB含むカード 1862・STUBノード 2432（2026-07-19 実測更新。STUBS.md サマリーと整合）。
- **A3クローズ＋B機構全完了（B1-B4）**。残るP1機構＝C（engine実機配線・P2）のみ。同型★0（5986枚）。
- **decompile再生成は `npm run regen`**（全シート＋下流一括・UTF-8直書き＝シェル非依存。2026-07-07にリダイレクト方式を廃止。旧「⚠Bash の `>`」問題は解消済みだが、万一 UTF-16 が混入すると下流3スクリプトがガードで即 exit 1 する）。

### 📌 次の一手（推奨順）
> **cold start＝まず `npm install` → `npm run gates`（全ゲート一括・数秒）が緑になることを確認する。** 現状＝**全ゲート緑（2026-08-10 続き417）＝golden 1753・smoke 10686 全0（SKIP 0）・fuzz 全0・同型★0（265群）・census 860・manual field loss 0・lint 0 errors。以下の旧値（続き394〜396）は参考**＝golden **1682**・smoke **10686** 全0（SKIP も 0）・fuzz 全0・同型★**0**（265群）・census **882**（回帰ゲート）・manual field loss 0・lint 0 errors/**254 warnings**（⚠`--cache` 使用のため実数とズレる＝簿記前に `rm -rf node_modules/.cache/eslint`）・held **111枚／48群**。**被覆マトリクス miss 277**。**混在カードのレビュー待ち 3カード**。**live の `parseStatus:"UNKNOWN"` は 0**（⚠**入れ子の `action.type:"UNKNOWN"` は 43件**）。⚠**未検証UIが続き380〜392 で計9件**。
>
> **🏁 P1（表現）は 2026-07-23 に完了宣言済み**（宣言・3分類・以後の運用＝[P1_COMPLETION_ROADMAP.md](./P1_COMPLETION_ROADMAP.md) 冒頭／§2 DoD／§5）。**主軸は P2/P3**＝①**§6.3 機構台帳**（宣言で正式送りした282効果の消化先＝正面40・チーム35・ゲームから除外残・アンコール19・動的比較14・ソウル11・ドライブ9 等を機構単位で）②**§7 実機検証** ③**BEHAVIOR_AUDIT（§5a・フェーズ跨ぎで継続）**。
>
>
> 0. 🎯**次の一手（2026-08-11 続き440 更新）＝Opus 側 / Sonnet 側で分ける**
>    - **【Opus 側】(1) `resolveNum` を使う `count` 消費地点の死角を閉じる**（続き440 で発見）＝`TRANSFER_TO_HAND`（`effectExecutor.ts:2288`）ほか `:1005`／`:2238` は `resolveNum(src.count)` を使い、**`resolveNum` は `{$ref}` を問答無用で 0 にする**（`execUtils.ts:118-120`）＝**動的枚数を書いても黙って0枚**。`resolveCountRef` へ寄せるか、**「ここに `$ref` を書くと0になる」を golden のトリップワイヤで固定**する。⚠これが閉じれば `WXEX1-44-E2`（続き440 で defer）も通る。
>    - **【Opus 側】(2) §3 (cxxiii) ピースのコスト二重請求の裁定**＝`executeKeyPiece` は `AUTO`/`ON_PLAY` しか積まないのに `WXDi-P14-002-E1` は `ACTIVATED`/`MAIN`＝**セットしただけでは効果が発火せず**、KEY の【起】から起動すると**印刷 Cost と同じ `cost.energy` をもう一度**払う。⚠**`executeKeyPiece` は キー と ピース の共通経路**なので片方だけ直すと キー が壊れる。**まず Type='ピース' の母集団を数えて設計判断から**。
>    - **【Opus 側】(3) §6.4 の未消化 worklist**＝2026-08-12 に **`O-1`〜`O-15` の番号つき表へ整理済み**（消化済みの詳細は PLAN_DETAIL「2026-08-12 整理⑧」へ退避）。⚠**`O-2` は続き452／`O-3` の第3波は続き453／`O-16` は続き454〜457 で消化済み**（消化済みは PLAN_DETAIL「2026-08-13 整理⑨/⑪」へ退避）。**在庫は §3-1 のとおり実測してから着手する**＝続き453 では簿記の「約16効果」が**実測38効果**だった。**次の一手の候補＝`O-3` の残26（続き459 で `DEFERRED_*` 8種へ可視化済み＝`npm run census:stubs` の A群が常時の在庫表）／`O-6`（`WX25-P3-038-E1` の MANUAL 不可侵＝続き457 の `SP38-006` 外科パッチが直近の先例）／`O-4`（UNKNOWN 25ノード／25カード）**。⚠`O-16` は続き457／`O-17` は続き458 でクローズ済み。⚠**`census:stubs` は「ハンドラの有無」で実装ありを判定する**＝ログを1行出すだけのハンドラは素通りする（続き459 の教訓）。
>    - **【Sonnet 側】(4) §7 実機検証の続き**＝続き436 で `keycost-energy-*`／`my|op-lrig-slot-*`／`card-action-*`+`data-action-label` を整備したので**新規シナリオが安くなっている**。未検証ブロックは §7 に20以上。⚠**(cxxiv) は続き463 で解決済み**（真因は parser の runtime scope 誤補完＝`ON_TURN_END` 41効果の無言不発）。次は §7 の未消化ブロックから。
>    - ⚠**共通の心得（続き435〜440 で確立）**＝①**★★セルでも開くまで投げない**（4 family 連続で偽陽性だった）②**在庫の症状記述は古い前提で live を見る**（3件が既に修正済みだった）③**罠は行番号つきで先出しすると当たる**（8例連続）。
> 0. 🎯**次の一手（2026-08-11 続き432 更新）＝§6.4 の残**＝(a)~~離場置換の対話 policy／`WXDi-CP01-023`／消化済み項目の宿題~~ **✅続き430〜432 で完了**（残は**置換の「してもよい」辞退**＝ライフクラッシュ置換側）。(b)**UNKNOWN 36ノード/34カード**（1カード1機構の単発が大半）(c)**所有者語の「前」に付く修飾が filter に載らない**（`WX25-P3-014-E1` 等・20枚規模）(d)**残 A群16件の明示 defer 見直し**（§6.3 の機構が進んだものから解ける）。**Sonnet 側＝§7 実機検証（続き428 のエナ支払い回帰確認が最優先）**。以下は旧「次の一手」（参考）。
>
> 0-旧. **granted-auto collector の timing 汎用化 →「このゲームの間」型3枚**（`WXDi-P11-002`／`P11-003`／`P04-002`）。⚠**実測済みの障害**＝付与ストア（`lrig_granted_auto_effects`／`game_granted_auto_effects`）の収集は**timing ごとに4箇所へ別々にハードコード**されている（`ON_ATTACK_LRIG`＝`grantedAuto.ts`＋`triggerCollect.ts:535`／`ON_CARD_MILLED_FROM_DECK`＝`:1604`／`ON_ENERGY_TO_TRASH`＝`:1944`／相手側の汎用 scope＝`:3743`）。3枚は **timing 3種＋`P11-002` は付与先が対戦相手**なので、**先に「付与ストアを任意 timing で走査する共通経路」を作る**ほうが安い（**§4 教訓 (i) の同型＝「型ごとに枝を足す層」の再来**）。次点＝**「ルリグとシグニ」母集団の残り4枚**（`WD13-010-E1`／`WXDi-P06-031-E1`／`WXDi-P14-040-E1`／`WXK07-005-E3`＝機構が別々なので1枚ずつ）／`WXDi-P14-002`／`WXDi-P16-002`。**機構待ち8枚**と**計器の死角**は §4 進捗サマリ㉕を参照。次点＝§6.3 の残 **C／E／F／G／K**。
>    ⚠**(i) の ★セルは3回連続で薄い**（377m・378・379 とも上位セルの大半が条件節用法のクロス計上・計器の誤検出）＝**取るなら必ず `--cell` を開いて0件でないことを確かめてから**。
>    ⚠**条件に語彙を足すバッチでは、両評価器（`evalCondition`／`checkActiveCondition`）と両 `matchesFilter` の扱いを先に決める**＝続き378 は**揃えるのが正しく**（`isDisona`）、続き379 は**揃えてはいけなかった**（`powerRange`＝持続側を実効パワーにすると循環）。**「パリティを取る」は自動的に正解ではない。**
>    ✅**続き379 で「`isDisona` の条件節グループ」は消化済み**（8効果＝常在3＋解決時5・新しい条件型ゼロ）。
>
>    🏁**⓪-2 の7効果は続き377n で完遂**（(a) `execAttachCharm` の複数ペア4／(b) `execGrantKeyword` の `upToCount` 2／(c) `classMatchesDiscardSigni` の配線1）。**在庫2効果を取りに行ったら `owner:"any"` の誤りが14効果出た**＝**「関数名まで特定して据置」した在庫は調査ゼロで入れるので費用対効果が最も良い**。次に据置するときも同じ粒度で書き残すこと。
>
>    🏁⚠**(iv) 計器較正は枯れた（続き377m 実測）**＝条件節クラスタ258件では5語彙 −17 が取れたが、続く「Nまで」52件は**1件も較正できず全件が実バグ**だった。**較正で census を下げ続けることはもうできない**＝以後 census を動かすのは機能是正のみ。
>    ⚠**★★セルの残りも薄い**＝続き377m でセル6本を全数分類したところ **41 miss 中 真の脱落は2件**（`levelExact × SIGNI`／`isDisona × SIGNI`／`cardClass × TRASH{HAND_CARD}`／`cardClass × BANISH{SIGNI}` は**4セルとも0件**＝全部が条件節用法のクロス計上）。**(i) から取るなら、まず `--cell` を開いて0件でないことを確かめる。**
> 
>    ⚠**(iv) stale live の「枯渇」は範囲つきで読む**＝続き377h の宣言は *census が見える範囲* だけで、続き377i で `thisCardOnly` のように **census 語彙に無い脱落**がまだ大量にあった。根本原因（`build:effects` のカード単位温存）は続き377i で解消済みなので、**以後は parser を直せば自動で live に届く**。手作業の刈り取りは原則不要。
>    - **⓪ `docs/_partial_fresh.json` は残り3カード＝すべて機構ギャップ**（続き377k で 10→3。行列は「採用待ち」ではなく **parser のバグ台帳**として読む＝続き377j の教訓）。内訳＝`WXK07-031`（fresh が `UNKNOWN`＝「対戦相手の効果はバニッシュ以外であなたの＜宇宙＞のシグニを場から移動させない」の語彙が無い／E2 は REVEAL_UNTIL の構造違い）／`WXK10-075`（fresh が `GRANT_FIELD_SIGNI_ABILITY`＋STUB へ落ちる＝アクセホストへの付与＋自パワー参照セット）／`WDK17-009`（fresh の2段目が `STUB:CONDITIONAL_ARTS_COST`＝live の `LIFE_CRASH{triggerBurst:false}` に届かない）。**この3枚は §6.3 機構台帳として扱い、行列そのものは片付いたものとして読む。**
>    - **🏁⓪-2 (ii) 在庫＝「Nまで」上限がengine側で消費されない7効果 ＝ 続き377n で完遂**（(a) `execAttachCharm` の複数ペア4件／(b) `execGrantKeyword` の `upToCount` 2件／(c) `classMatchesDiscardSigni` を `execRevealAndPick` へ配線1件）。**ペア数＝`min(チャーム候補, 付与先候補, charm.count, to.count)`／`upToCount` は BANISH と同じく `selectOrInteract` の第3引数へ／捨札参照は `resolveDiscardLevelFilter` を先に通す**。⚠**波及して見つかった本命は `owner:"any"`＝engine で `tgtOwner="opponent"` に解決される**（14効果が相手のシグニに付与していた）＝対象名詞句そのものから所有者・体数・上限を取る `signiClauseTargetSpec` を新設して解決。詳細は [BUGFIXES.md](./BUGFIXES.md) の続き377n エントリ。
>    - **① 未分類の ★★セルから取る**（miss/has・2026-08-08 実測）＝`cardClass × TRASH_CARD[filter]` 7（284）／`cardClass × TRASH{HAND_CARD}` 6（70）／`color × SIGNI[filter]` 10（111）／`powerRange × SIGNI[filter]` 10（498）／`levelExact × SIGNI[filter]` 7（69）。⚠**分類済みで「1 regex で N 効果」型ではないもの**＝`cardClass × (filter無)` 25（88・5系統の寄せ集め）／`cardClass × SIGNI[filter]` 18（440・15件がクロス計上）／🆕`cardClass × POWER_MODIFY{SIGNI}` 4（172・続き377l で左右ゾーン3件を消化＝残りは在庫済みの `WX05-044-E1`／`WX24-P3-059-E1` とトリガー主語のクロス計上）。🆕**`color × SIGNI[filter]` は着手前に注意**＝続き377l の下見で 10件のうち**5件が「エナゾーン/場/トラッシュに〈色〉のカードがあるかぎり」の条件節**、2件が「手札から〈色〉のシグニを1枚捨ててもよい」の**効果内コスト**＝対象フィルタは実質3件（較正候補）。
>    - **② `eachDistinctLevel` 28（has 1）** ＝最大の塊だが同入口に配線済みなし。**まず「機構が無いのか、キー綴りが違うのか」を確かめる**（trap (h)）。
>    - **③ 小粒だが has があるセル**＝`powerRange × GRANT_KEYWORD{SIGNI}` 9（8）★／`levelExact × POWER_MODIFY{SIGNI}` 9（7）★／`isDisona` 23（32）。⚠`powerRange` は「パワーを＋N」＝**action の値**との取り違えが濃い（**較正候補**）。
>    - **④ 🆕stale live で見つかった7つの壊れ方は parser 側にも残っている可能性がある**（続き377h）＝**duration 取り違え**（`UNTIL_OPP_TURN_END`→`UNTIL_END_OF_TURN`）／**付与対象の `thisCardOnly` 脱落**／**条件節の常時true化**／**「そうした場合」の対象取り違え**／**trigger timing の平坦化**（内側の付与能力を最上位へ）／**【使用条件】の焼き付き**／**条件節由来の `excludeSelf` が相手側の対象フィルタへ漏れる**。**この7型を探索キーにして全CSV走査すると新しい母集団が取れる。**
>    - ⚠**着手前に必ず読む罠**＝(a) **素の `parseStoryFilter`/`parseLevelFilter`(文全体) を対象フィルタに使わない**＝**`signiClause*Filter` 3兄弟**を使う。(b) **曖昧なら付けない**。(c) **auto-commit があるので `git stash` で A/B が取れない**＝ベースラインコミットから `git show <sha>:<path>` で取り出す。(d) **exec 側の配線を必ず確認する**（`matchesFilter` は `excludeSelf`/`upToCount` を見ない）。(e) **セルは入口であって終点ではない**＝ビルダー全体を読む。(f) **枚数・値だけ先に直さない**。(g) **★★セルの miss 数は見込み件数ではない**。(h) **同じ概念に2つのキー綴りが併存していないか先に確かめる**。(i) **同じ語彙でも入口ごとに壊れ方が違う**。(j) **A/B の件数＝直った件数ではない**。(k) **採用前の確認は JSON パースによる構造比較で**。(l) **セルは母集団の索引であって母集団そのものではない**。(m) **安全弁はコメントの規律ではなく関数の戻り値にする**。(n) **census が減らないときは live と fresh を全件突き合わせる**。(o) 🆕**「held が新しい」は「held が正しい」ではない**（実測 40件中2件が逆方向）＝**全件原文照合は省略できない**。(p) 🆕**`manualEffects.ts` の MANUAL 定義が live より古いことがある**＝held が消えない MANUAL 効果は**ソース側**を直す。
>    - **✅消化済み**＝「他の」ゲート棚卸し（377）／`noGuard`（377b）／アイコン系（377c）／`levelRange`（377d）／全体バフの語順＋据置held（377e）／ON_ATTACK_SIGNI の味方側トリガー主語＋`excludeSelf` の過剰発火（377f）／stale live の一括解消 38効果（377g）／(iv) stale live の刈り取り 37効果（377h）／**収穫マージの効果単位化 70効果（377i・stale live の構造的原因を解消）**／`_partial_fresh` 行列の parser 是正 7効果（377j）／`_partial_fresh` 行列を 10→3カードへ 19効果（377k・acceHost の到達不能規則／2グループ手札コスト／条件節の後続文への持ち上げ／孤立 reorder の畳み込み）／左右のシグニゾーン機構の新設 15効果（377l・`zoneSide`＋`IS_SELF_IN_SIDE_ZONE`。付与側のゾーン限定は中央すら無かった／`from:[種別]` の過剰保護も是正）／🆕**Codex 委譲＝`isDisona`/`excludeResona` の対象フィルタ合成漏れ 22効果（378・engine の `matchesFilter` パリティ穴で5効果が全味方バフだったのを含む）**／Codex 委譲3バッチ（377m）＝(iv)計器較正 第3バッチ〔条件節クラスタの5語彙・偽陽性17件〕・第4バッチ〔置換3語彙・偽陽性3件。🏁ここで (iv) 枯渇〕・(i)配線ギャップ 第18バッチ〔「Nまで」上限スロットの脱落 7効果。残7効果は engine 未配線で据置＝⓪-2 へ〕**。
>    - **(ii) 機構ギャップの安い在庫**＝`parseStatus:UNKNOWN` の完全no-op **6件**（🆕`WX25-P1-048-E1` を追加＝レベル１以上のアシストルリグでアタックできる）／`PARTIAL` **23件**／`LOOK_PICK_CHAIN` の exact-N 表現ギャップ **23効果**（`cardClass × (filter無)` の10件がここに合流）／「場に《ライズアイコン》を持つシグニがN体ある場合／あるかぎり」の条件型 **5件**／左右のシグニゾーン限定の filter キーが無い 3効果／**【ソウル】が付いているシグニの filter キーが無い 1効果**（`WXDi-P04-016-E1`）／🆕**`WX25-P1-061-E1` の `triggerScope:any_ally`＋`placedFromTrash`**（377h で timing だけ是正した途中段階。足すと golden の「段階2 mandatory集合」が 1455→1454 に戻る）。
>    - **(iii) 構造混線の在庫**＝🆕**`WXEX2-18-E2`**（続き378 で据置＝原文「**対戦相手のシグニ1体を対象とし**、レゾナではない**あなたの**＜遊具＞のシグニ1体をバニッシュする。そうした場合、**それを**エナゾーンに置く」なのに live は BANISH も SEND_TO_ENERGY も `owner:"opponent"`＝**2対象の owner ごと取り違え**。⚠**誤った相手対象に `excludeResona` を足して誤りを固定しないこと**＝golden にトリップワイヤ設置済み）／🆕`WXK05-052-E1`（「対戦相手のシグニを２体まで対象とし、**このシグニと同じシグニゾーンに【シード】がある場合**、次のターンの間、それらは「【常】：アタックできない。」を得る」＝**条件節の【シード】をキーワードと誤読**して「あなたのシグニ1体に【シード】を付与」に化けている。⚠体数だけ広げると誤りを増幅するので golden にトリップワイヤ設置済み〔続き377n〕）／`WXK05-043-E1`／`WX24-P3-059-E1` ほか §5d-0 (iii) の登録分／続き377f で分類した8件（`WDK10-001-E3`・`WXEX2-48-E1`＝トラッシュから選んだシグニをライフに加えるはずが `ADD_TO_LIFE{fromTop}`／`WDK07-E07-E1`・`WXK10-074-E1`＝【アクセ】付与が丸ごと脱落／`WX05-080-E1`／`WX25-P2-079-E1`／`WX16-003-E1`）／**コスト節の限定脱落**（`WX05-044-E1`＝「他の＜古代兵器＞のシグニ1体をバニッシュする」コストが丸ごと落ちて**無料で撃てる**／`WX14-016-E1`＝アンコールコストが別物／`WX08-036-E1`＝対象側のパワー条件をコスト側に載せている／`PR-322-E1`）。／🆕**続き377k の発見3型**＝(a) **acceHost の複合形3枚**（「これにアクセされているシグニのパワーを＋Nし、それは「…」を得る」＝`WX20-072`／`WXEX2-69`／`WDK17-015`。単体の `POWER_MODIFY` 形は続き377k で配線済みだが、この複合形は Part1 の POWER_MODIFY 分岐に載らず live の `GRANT_ACCE_HOST_ABILITY` に届かない）／(b) **`WX12-CB02-E1` の多分岐が2段しかない**（原文はレベル1〜5の5分岐だが live MANUAL はレベル1・2のみ＝レベル3〜5が丸ごと無い。⚠parser 側で無条件 SEQUENCE に足すのは禁止＝golden にトリップワイヤ）／(c) **`suppressOnPlay` の配置アンカーが特定できない2形**（`WX20-020`＝CHOOSE の④に属する末尾文が buildChoose の外に出るため選択肢の `ADD_TO_FIELD` に載らない／`WXDi-P11-007-E3`＝直前が `REARRANGE_SIGNI` で `suppressOnPlay` を持てる型が無く `BLOCK_ACTION{ON_PLAY_ABILITY}` が死んだまま残る。live も同じ）。／🆕**続き377l の発見2型**＝(d) **`WX10-036-BURST` の付与キーワードが条件側の【チャーム】に化けている**（正しくは【アサシン】。live も同じ。⚠「`を得る/を持つ` に隣接する【K】を取る」一般化は 36カード中16カードを退化させたので**禁止**＝golden にトリップワイヤ5枚。個別に直すなら「【K】が**付いているかぎり**」等の条件表現を `isPossessionFilterKw` と同じ要領で除外する）／(e) **ゾーン限定付与の duration 取り違え**（`WX05-034-BURST`「このターンと次のターンの間」・`WD15-002-E1`「このターン」が `duration:"PERMANENT"`＝**永続化して効きすぎる**。duration 軸は続き377h の7型の1つと同系統）。
>    - **Sonnet 側**＝§7 実機検証（タスク1）。⚠コイン支払いは `BattleScreen.tsx` の**10経路**のうち ACTIVATED【起】1本しか実走していない。
>    - ⚠**見積もりの現在地**＝census **924**／被覆マトリクス miss **291**。直近バッチの実績＝12／30／17／8／15／11／38／37／70／7／19／15／23／**22**効果。**census が動かない回でも効果は直る**（377c は census 据置で17効果）＝**census の増減だけで成果を測らない。**
> 1. **自分のモデル側のタスク表（§3）から取る**。**Opus の主戦場＝§6.3 の機構実装（機構単位・実IDは `docs/_p1_classification.txt`）＋タスク12 の生き残り在庫**＝🏁**現存0件**（2026-08-08 に (cxv)(cxiii)(cxiv)(cxvii)(cxviii) を残0クローズ＝受け口は空。⚠この行が挙げていた (lv)/(lxvi)/(lxxxviii)/(xciii)/(xciv)/(xcvi)/(xcvii)/(c) は 2026-08-06 に全件残0クローズ済み＝§3 の在庫表が正）。**🏁(xcii)(xcv)(lxvii)(xcviii)(lxviii)(xcix) は 2026-08-04 に残0クローズ**。**(lxx)／(lxxviii)／(lxxxiii)／🏁(lxxxii) は 2026-08-02 に残0クローズ＝§3 の表から退避済み**（完了行原文は [PLAN_DETAIL.md](./PLAN_DETAIL.md)「2026-08-02 整理③」）。それ以外の残0在庫の完了行原文は同ファイルの各整理節。**🏁タスク16 も残0クローズ**。**Sonnet の主力は タスク1（§7 実機検証）**＝未検証UIの単一 worklist は §7 に集約。⚠**§6.3 H と続き298〜Batch F の全件が UI 未検証**。
> 2. **手順はスキルに従う**＝`/audit-card <CardNum>`（BEHAVIOR_AUDIT 1カード監査1巡）・`/baton`（セッション終了時の簿記）。散文の記憶で回さない。⚠`/census-batch` は P1宣言により**新規バッチを切らない**（census 外の計器から新系統が見つかった場合のみ）。
> 3. **engine/parser/decompiler を触ったら `npm run gates`・シート再生成は `npm run regen`**（§12）。バグは golden に1件足してから直す。

> **新規 timing 配線の確立パターン**：①該当カードの effect/原文を確認 ②`triggerCollect.ts` に pure collector 追加（`mkLimitOk`/`ownFieldSources`/`effsOf` 流用）③検出が要れば `boardDiff.ts` に detector 追加 ④BattleScreen 中央 diff ブロック（`resolveStackNext` 内・mill/freeze 等と同じ場所）に発火配線＋薄いラッパ ⑤`goldenTest.ts` に発火条件テスト ⑥`decompileEffects.ts` の `engineUnwiredTimings` から除去 ⑦`npm run regen`（全シート＋下流一括再生成）＋同型★0 確認 ⑧`npm run gates` 全緑 → commit/push。

---

## 5. フェーズ1残作業：表現（P1）

> **🏁 P1完了宣言済み（2026-07-23）＝[P1_COMPLETION_ROADMAP.md](./P1_COMPLETION_ROADMAP.md) 冒頭の宣言節が正**。census 高シグナル 1581 を「**§6.3 正式送り 282／粗網のみ偽陽性 116／長テール単発・別節偽陽性 1183**」へ3分類（機械分類の実IDは `docs/_p1_classification.txt`）。根拠＝最短ルートのバッチ1〜5＋再クラスタリング生存バッチ（11「相手が選ぶ」43・6「数量比例」27）を全消化・バッチ2〜4は投入前実測で枯渇（別節表現済みの census 偽陽性主体）＝「1 parser規則→N効果」の系統クラスタが出尽くした＝逓減限界。**以後この節の worklist から新規バッチは切らない**＝census は回帰ゲート（`BASELINE_HIGH=1580`）としてのみ維持し、残バグは BEHAVIOR_AUDIT／semantic audit／PARTIAL 計器／§7 実機で単発発見→直修正する。§6.3 送り282効果の消化先は §6.3 台帳（P2/P3）。


> **⚠2026-08-07（続き369）に置いた前提**＝**census の高シグナル0は「すべてのカードが完璧に動作する」の十分条件でも必要条件でもない。**
> census は文字列突き合わせの発見器で、死角が4つある（§5c 末尾）。逆に、実データを見ると高シグナルの多くは
> **計器の対応語彙漏れ**でもある（続き365/368 で計68効果を較正）。したがって**完了判定は BEHAVIOR_AUDIT（§5a）と §7 実機検証で出す**。
> census は「回帰ゲート」と「未照合の効果を優先度つきで列挙する索引」として使う。
### 5a. BEHAVIOR_AUDIT によるバグ収穫（現在の主作業・2026-07-03〜）

**目標＝要レビュー・キュー（`node scripts/_bqTriage.mjs`）を逓減限界まで消化。** 全効果を実行し盤面差分＋ログを原文と目視照合＝逆翻訳の文字列一致では検出できない「真no-op」「未配線timing」「未実装action型」「トリガー主語ミス」を発見して直す。手法・キュー件数の推移は [BEHAVIOR_AUDIT.md](./BEHAVIOR_AUDIT.md) を参照（811→285→261→169→129→高シグナル30）。

- [ ] **キュー消化を継続**：`node scripts/_bqTriage.mjs` で高シグナル選別 → `npm run audit -- --id <CardNum>` で目視 → 「真no-op／シナリオ空振り／STUB未実装」に仕分け → バグは effects JSON 直パッチ＋engine/decompilerセット＋smoke/golden/fuzz で修正。
- [x] **未実装action型 worklist**（§6.1）＝**✅残型0（続き204/204b でクローズ）**。
- [ ] **意味照合監査（semantic audit）の worklist**（§6）＝BEHAVIOR_AUDIT の盤面差分では拾えないSTUB/MANUALの意味エラー（owner取り違え・GRANT_PROTECTION no-op 等）の補完的発見器。
- [ ] **完了判定**：高シグナル件数がこれ以上減らない逓減限界に達した時点で「P1完了＋P2の一部前倒し完了」を宣言し、残りは個別カードの機構待ちとして §6/§7 に送る。

### 5c. 語彙センサスの系統別消化（2026-07-04新設・続き17-18で両方向98計測に拡大・続き23で文型バッチ化・過剰効果＋幻覚バグ）

> **🏁🏁 2026-08-07（続き369）＝§5c の「文型バッチ」としての役割を終了する（店じまい）。** 以後 census は
> **回帰ゲート**（`BASELINE_HIGH`）と**発見器**としてのみ維持し、**新規の文型バッチは切らない**。残る
> 「テンプレ2効果以上」77本は §6.3／Opusタスク12 の**機構待ち**へ移送し、主戦場は **§5d「1効果ずつの原文照合」** へ移す。
>
> **根拠（続き369 に実測）**＝残り高シグナル 1199 効果のうち **874（約73%）は「単発テンプレにしか現れない効果」**。
> そこからシード固定で**無作為12件**を抽出して原文照合したところ、**判定できた11件すべてが実バグ**だった
> （残り1件はトークンで原文未取得）。一方、私が枚数順に消化してきた「2効果以上」の頭は **33/37 が計器の偽陽性**。
> これは偶然ではなく**構造的**＝**大きいクラスタ＝systematic な文型＝parser が既に正しく扱っている**から偽陽性が濃く、
> **単発＝汎用規則から漏れた1件もの**だから実バグが濃い。**枚数順に取ると、実バグの薄い側から掘ることになる。**
>
> ⚠**そして単発テールは「文型の問題ではない」**＝無作為12件の内訳は
> 「対象フィルタの脱落」6／「owner 取り違え・任意性喪失」2／「条件節・機構ゲートの脱落」2／「重度の構造混線」1。
> いずれも**効果はだいたい parse できているが修飾が1つ落ちている**形なので、文型テンプレでまとめても作業単位にならない。

> **🏁 2026-07-23 P1完了宣言により worklist 凍結**＝下記「残りの消化対象」は宣言時点の歴史記録（3分類は [ROADMAP](./P1_COMPLETION_ROADMAP.md) 冒頭）。census は回帰ゲート（`BASELINE_HIGH=1580`）としてのみ維持し、**新規の文型バッチはここからは切らない**（census 外の計器から新系統が見つかった場合のみ検討）。「残死角」4項は引き続き有効＝BEHAVIOR_AUDIT／PARTIAL 計器の領分。

**目標＝`npm run census` の高シグナル欠落（現ベースライン＝§4 恒久指標参照・2026-07-22 時点 **1817 効果**）を文型テンプレ単位のバッチで0へ逓減。** 過剰効果（フィルタ・条件・使用制限の脱落で対象/発火が広がる・ゲームを壊す側）と幻覚（原文に無い効果/数値がJSONに居る・逆方向）は behavior-audit の無変化キューに掛からない別種のバグ母集団（発見経緯は §4 続き15、拡充は続き17-18）。

- **消化対象の worklist は 🏁P1完了宣言（2026-07-23）で凍結**＝宣言時点の全文は [PLAN_DETAIL.md](./PLAN_DETAIL.md)「2026-08-02 整理②」節へ退避（2026-08-02）。3分類は [P1_COMPLETION_ROADMAP.md](./P1_COMPLETION_ROADMAP.md) 冒頭、最新件数は `docs/_vocab_census.txt` が正。
- **🎯 現在の消化目標（2026-08-07 続き365〜・ユーザー指示）＝「テンプレ1本あたり2効果以上」の 91テンプレ／248効果（ユニーク効果222・カード215）を全消化する**。単発（1効果）テンプレ 1327本は対象外。母集団は `npm run census:clusters` → `docs/_census_clusters.txt` を件数順に見れば再生成できる。
- **✅消化済みテンプレ**
  - **（続き364）「このシグニはパワーがN以上であるかぎり、〜」（主語先行形の自己パワー閾値）11効果／11カード**＝`genericKagiri` が条件節を無言消費して**無条件付与の過剰効果**になっていた系統。parser パターン6a 1本で是正（census 1283→1274）。
  - **（続き365）「あなたのエナゾーンにレベルA～Bの＜X＞のシグニがそれぞれN枚以上ある場合」6効果**＝`ENERGY_EACH_LEVEL_FILTER_GTE` へ持ち上げ（4効果採用・`WXK09-051` は then/else 両方実行の二重発動だった）。⚠汎用規則を入れたら旧 `wrap('WXK09-083-E1',…)` の名指し hack を撤去すること（二重 CONDITIONAL になる）。
  - **（続き365・計器較正）「〈それ|そのカード〉が〈desc〉(ではない)場合、」＝`REVEAL_AND_PICK{filter}`/`elseAction` が正表現**（テンプレ7本＝「レベルNのシグニ」5／「レベルN以上の＜C＞のシグニ」5／「そのカードが＜C＞」4／「それが＜C＞のシグニ」3／「そのカードがシグニ」3／「それがシグニ」2／「＜C＞か＜C＞のシグニ」5 ほか単発込み **35効果**）。⚠**残渣チェック必須**＝desc からモデル化できた識別子を除いて何か残るなら covered にしない（`WDA-F04-10`「共通する色を持つ」・`WXDi-P08-062`「《X》以外の」・`WXK11-048`「よりパワーの低い」＝filter に載っていない**実バグ**を masking しないため）。
  - **🏁（続き366）「このターンにあなたが《コイン》を合計N枚以上支払っていた場合」10効果／10カード**＝`PlayerState.coins_paid_this_turn`（支払いのみ加算・ターン境界で0）＋Condition `COINS_PAID_THIS_TURN` を新設して**機構ごと実装**。条件節が丸ごと落ちて**無条件発火**していた（アタックのたびに必ずバニッシュ/エナチャージ/パワー−）。⚠加算は `BattleScreen` の支払い経路10箇所＝golden にソース静的走査のガードを入れた。**要実機検証**（§7・Sonnetタスク1）。
  - **🆕（続き368）「このターンに対戦相手のカードがあなたの効果によってN枚以上デッキに移動していた場合」4効果**＝規則は**あった**が `parseSingleSentence` の局所 `CLAUSES` だけで**共通表に無く**、【自】文の hoist 経路で拾えず無条件発火していた（`WDK09-014`×2／`WXK06-068`／`WXK06-070`）。`STATE_CONDITION_CLAUSES_V2` へ移動。⚠「規則が無い」と「共通表に無い」は別物＝**同じ文型なのに一部だけ直らない**ときはどの表に居るかを疑う。
  - **🆕（続き368・計器較正）33効果**＝`minPower`（`FIELD_SIGNI_POWER_COUNT` の閾値・パワー閾値へ）／`LRIG_LEVEL`（センタールリグのレベル閾値・レベル閾値へ）／`Under`（小文字 `under` が camelCase の `handToUnderSelf` に**部分一致しない**・下置きコストへ）。⚠**対応語彙は部分一致なので大文字小文字で穴が空く**。spot-check 12件で masking なしを確認。
- **⏳機構待ち・見送りと判定したテンプレ（続き368 トリアージ）**
  - 「N枚以上ある場合」6＝**ルリグ/シグニの「下」のカード枚数比較の条件型が無い**（`THIS_CARD_HAS_UNDER` は有無のみ）。二段閾値（5枚以上→A／7枚以上→追加でB）も伴う。
  - 「【使用条件】【チーム】＜C＞＆全員レベルN以上…」3＝`使用条件` が `GRANT_KEYWORD` の keyword 文字列に化け、本体の GRANT_LRIG_ABILITY も平坦化。**ピースの使用条件＋ルリグ付与**の構造ごと作り直しが要る。
  - 「それらが共通するクラスを持つ場合」3＝**場のN体が共通クラスを持つ**条件型が無い（`LAST_PROCESSED_MATCHES{shareClass}` は直前処理カード用・`FIELD_SIGNI_ALL_DISTINCT_CLASS` は逆向き）。
- **次に見るべきテンプレ（枚数順・2026-08-07 続き368 時点で **77本・192効果**）**＝「N枚以上ある場合」6〔ルリグ/シグニの**下**のカード枚数＋二段閾値。`THIS_CARD_HAS_UNDER` はあるが**枚数比較の条件型が無い**＝機構寄り〕／「あなたが次にスペルを使用する場合」5〔次回スペルのコスト軽減予約＝機構〕／「その中からカードN枚を【トラップ】として設置してもよい」5／「【常】：対戦相手がシグニを配置する場合」4〔配置時の応答窓＝機構〕／「そのカードが＜C＞の場合」以下は①で消化済み。⚠**選ぶ前に engine/型が表現できるか必ず確認**（不可なら §6.3 か Opusタスク12 へ送る）。
- **進め方＝`/census-batch` スキルに定型化済み**（`.claude/skills/census-batch/SKILL.md`＝続き23確立のパイプライン＋必須ガードレール込み。原文は [PLAN_DETAIL.md](./PLAN_DETAIL.md) §5c）。概要＝①`census:clusters` でテンプレ選定→②既存DSL型で表現できるか確認（不可＝機構待ちとして §6.3 へ）→③parser 規則追加（**JSON手パッチではなく parser を source of truth に**）→④`build:effects`→⑤`heldReview` spot-check→`--adopt`（**STUB退化・「代わりに」昇格・別STUB id 化は採用しない**）→⑥golden 1件/テンプレ＋全ゲート＋BASELINE_HIGH 更新。旧手順（census明細から手パッチ）は廃止＝parserWorklist held を増やさない。
- ⚠判定はカード単位の粗い網（同カード別効果に語彙があれば合格＝過小評価）。効果単位の精密化は消化が進んでから。
- **census 手法自体の残死角（続き18更新＝続き17記載の (a)トリガー種別 (b)小さい数 (c)出現条件 (d)そうした場合誤変換 はすべて98計測に組み込み済み）**＝文字列突き合わせで原理的に見えない残り4つ：(a) **参照解決の誤り**（「それ」の指し先取り違え＝WX09-015 の bounce 対象 self 化。両側に語彙が揃うため不可視）。(b) **効果単位の粒度**（同カード別効果に語彙があれば合格＝カード単位判定のマスキング。消化が進んだら効果単位化）。(c) **JSONは正しいが engine 実装が違う**（behavior-audit／golden の領分）。(d) **文間の実行順序・依存関係**。~~横断的再発防止案＝parser の無言フォールバックに parseStatus:PARTIAL 刻印を義務付ける~~ **✅実装済（2026-07-07・続き38）**＝IS_MY_TURN化（条件抽出失敗の常時true化）・UNKNOWNステップ無言除去（リコレクト/multi-dest分割）で `markSilentFallback()` → fresh の parseStatus を PARTIAL 降格＋`docs/_partial_report.txt` に理由明細（**初回計測142効果＝IS_MY_TURN化125/multi-dest11/リコレクト8・逓減計器**）。parseStatusのみの差分は buildEffectsJson/parserWorklist とも比較から除外（held を汚さない・137枚吸収）。新たな無言近似を parser に足すときは **markSilentFallback を必ず呼ぶ**（「そうした場合」常時true等の意図的慣例は刻印しない）。

### 5d-0. ✅**工程改善3件（2026-08-07 続き375 でユーザー合意 → 続き376 で①②③とも完了）**

> **なぜ**＝続き369〜375 の7セッションで **82効果／census 1199→1162（−37）** を消化した。平均 **約12効果・census −5.3／セッション**で、残 **1162効果**（クラスタ union で数え直して **1162＝census 公称と完全一致**・続き376 実測）。このまま1件ずつ探すと **約100セッション**。しかも**バッチあたりの収穫は逓減している**（36→12→6→4→4）。**探索コスト自体を下げないと終わらない。**
>
> **🏁続き376 で3件とも完了。以後の worklist は下の「③ 作業種別 worklist」が正**（クラスタ別の worklist は索引としてのみ残す）。

#### ✅① 被覆マトリクスを常設スクリプト化（`npm run census:wiring`）— 続き376 完了

**根拠＝7バッチ中4バッチが同じ形**（「語彙は型にも engine にもあるが、一部の入口から呼ばれていない」）。1件ずつ原文照合で探す必要はなく、**(語彙キー × アクション入口) の被覆マトリクス**で機械検出できる。続き375 で試作したところ **134件を1パスで検出**した：

| 語彙キー | 配線済み | 未配線 | 備考 |
|---|---|---|---|
| `eachDistinctLevel` | 1 | **29** | ほぼ手つかず＝最大の未消化 |
| `isDisona` | 21 | **35** | WXDi-P12/P13 系に集中 |
| `noGuard` | 61 | **14** | うち6件は**同じ `TRASH_CARD` 入口で56件配線済み**＝明確な穴 |
| `levelParity` | 4 | 9 | |
| `excludeResona` | 1 | 6 | |
| `noRiseIcon` / `nonColorless` / `excludeCardName` / `levelEqTrigger` ほか | — | 各1〜5 | |

**🏁続き376 で `scripts/censusWiring.ts` として常設化（`npm run census:wiring`／明細 `docs/_census_wiring.txt`）。** 試作の数字は再現できた（`noGuard` 61/14・`eachDistinctLevel` 1/29・`levelParity` 4/9・`excludeResona` 1/6 が完全一致、`isDisona` 21/34 は試作の 21/35 と1件差）。**語彙表を26キーへ拡張して miss 合計 134→203。** 走査 7721効果（STUB除外 2164／MANUAL除外 756）。

**新規に見つかった大物3つ（試作の表には無かった）**＝`isDisona` **34**（原文は「《ディソナアイコン》**の**シグニ」という**連体の「の」**で書かれる。試作が「を持つ」で探していたら 0 になる＝**語彙表の正規表現は必ず実データで表記を確認してから書く**）／`hasRiseIcon` **31**／`hasCrossIcon` **22**。⚠後2つは**過剰効果として実害が明確**＝`WX07-010-E1` ほか7効果「あなたの《クロスアイコン》を持つシグニのパワーを＋1000」が filter 無し＝**自分の全シグニに+1000**、`WX16-026-BURST` ほか9効果「トラッシュから《ライズアイコン》を持つシグニ」が filter 無し＝**どのシグニでも回収できる**。

**使い方**＝`npm run census:wiring` でセル一覧 → `npx tsx scripts/censusWiring.ts --cell <キー>:<入口ラベル>` でそのセルの効果IDと原文を全部出す → 全数分類 → parser の該当ビルダーへフィルタ合成を1本足す。**★印（同じ入口に配線済みの効果がある）が付いたセルが最優先**＝「同じ入口の他の効果は正しいのにこれだけ落ちている」＝明確な穴。

**🆕続き376b＝語彙表を大クラスタへ拡張（miss 203 → 541）。** 従来の26キーは**マイナーな真偽値フラグだけ**で、census の大クラスタ（クラス指定154／レベル閾値57／色79 ほか）を1つも見ていなかった。②の無作為20件でも配線ギャップ5件中2件がここ（`WX12-016-E1` の色／`WXDi-P02-073-E1` の level:1）だった。追加した6キー：

| 語彙キー | has | miss | 性質 |
|---|---|---|---|
| `cardClass`（`story`/`cardClass` 別名対応） | 1407 | **154** | **91%が既に配線済み**＝残りは穴が濃い。ただし条件節用法の誤検出も濃い |
| `levelRange` | 247 | **81** | |
| `color` | 297 | **36** | |
| `powerRange` | 507 | **30** | ⚠「パワーを＋N」は filter ではなく action の値＝取り違え注意 |
| `levelExact`（レベル丁度） | 103 | **29** | |
| **`triggerSubjectClass`** | 37 | **8** | 🆕**トリガー主語**（下記） |

**🆕トリガー主語のクラス限定＝新発見の系統バグ（8件・即バッチ可）**＝「あなたの**＜凶蟲＞の**シグニ1体がアタックしたとき」の**主語限定が丸ごと落ちて `ON_ATTACK_SIGNI` にフィルタ無し**＝**どのシグニがアタックしても発火**する過剰効果。⚠**同型44件のうち36件は `triggerFilter` を持っており、無いのは8件・全部 `ON_ATTACK_SIGNI`** ＝直す場所が1箇所に確定している。`npx tsx scripts/censusWiring.ts --cell 'triggerSubjectClass:TRIGGER{ON_ATTACK_SIGNI}'`（配線済みの見本 `WX25-CP1-047-E1`／`WXDi-CP02-102-E1` も出る）。**直す場所は target の filter ビルダーではなく parser の timing/トリガー抽出**なので、この語彙だけ入口ラベルを timing に差し替えている（`labelBy:'timing'`）。

**⚠⚠セルの miss 数は「1本直せば N 件直る」ではない**（続き376b に実測で判明・**この計器を使う人が最初に読むべき注意**）。判定は**効果単位**だが、その効果は**持っている入口ラベル全部**のセルに計上される＝「原文にフレーズはあるが、それは同じ効果の**別の入口**に掛かっている」効果が関係ないセルにも miss として出る（**クロス計上**）。実測＝`cardClass × SIGNI[filter]`（miss 46）の中身は**少なくとも4系統**だった：
- ①**対象フィルタの真の脱落**（`WDK05-T07-E1`＝「あなたの＜遊具＞のシグニ2体まで」が**自分の全シグニ**を戻せる）
- ②**クロス計上**（`PR-322-E1`＝クラスは対象シグニではなく**トラッシュ側**に掛かる語）
- ③**トリガー主語**（`WX13-037-E2`。→ `triggerSubjectClass` として分離済み）
- ④**コスト側のフィルタ**（`WX05-044-E1`＝「他の＜古代兵器＞をバニッシュする」コスト）

**①②④の切り分けは `--cell` で原文を読むしかない＝セル選定後の全数分類は省略できない。miss 数は「掘る価値の指標」であって「見込み件数」ではない。**

**実装方針**（✅**続き376 で全項目そのまま実装済み**。以下は設計記録として残す）：
1. `docs/_effect_srctext.json` × live JSON を全数走査。
2. `[原文フレーズ正規表現, TargetFilterキー]` の表を持つ（**既に型にも engine にも実装済みの語彙だけ**を載せる。未実装語彙は §6.3 の領分で別物）。
3. 各効果について「**filter を保持しているアクション型**」を列挙してラベル化（`TRASH_CARD` / `SEARCH` / `ENERGY_CARD` / `SIGNI` / `(filter無)` 等）。
4. 原文にフレーズがあるのに JSON にキーが無い＝miss、あり＝has として **(キー, 入口ラベル)** のセルに集計。
5. **一度も配線されていない語彙（has が全0）は除外**＝それは「未実装」であって「配線漏れ」ではない。
6. 出力は miss 降順。⚠STUB/MANUAL 含む効果は除外（別経路）。

**効果**＝作業単位が「1効果」から「**1セル（語彙×入口）**」に変わる。134件は **6〜10バッチ**で消化できる見込み（手探りなら15〜20セッション相当）。→ 実装後は **203件**なので **9〜15バッチ**が現実的な見積もり。

⚠**偽陽性は必ず混じる**（リマインダー文の語・engine が原文から直接読んでいる形＝【ビート】コスト等）。**セルを取るたびに全CSV走査で用法を分類してから配線する**という §5d の既存規律は変えない。

#### ✅② 残1162の**真バグ率を測り直した**（無作為20件・シード固定）— 続き376 完了

**根拠＝続き369 の「11/12 が実バグ」は古かった。** 易しい系統を7バッチ消化した後の母集団で測り直した。

**手順（再現可能）**＝`docs/_vocab_census.txt` の `### 高シグナル` 行を全部 union（注記の `（…）` を剥がすと **ちょうど 1162＝census 公称と一致**）→ `mulberry32(20260807)` で20件抽出 → 原文（`docs/_effect_srctext.json`）と live JSON を並べて目視照合。

**🎯結果＝真バグ 14／20＝70%**（続き369 の 11/12＝92% から**大きく下がった**）。**内訳（作業種別・③の4区分）**：

| 区分 | 件数 | 例（effectId） |
|---|---|---|
| **(i) 配線ギャップ**〔①のマトリクスで機械検出できる〕 | **5** | `WX12-016-E1`「白か黒の」色filter脱落／`WXDi-P02-073-E1` level:1 脱落／`WXDi-P16-046-E2`・`WX13-062-E1` 条件節ごと脱落＝無条件発火／`SP27-010-E1` `excludeResona` 脱落＋無条件2ドロー |
| **(ii) 機構ギャップ**〔§6.3〕 | **6** | `WX11-072-E2`「次に1回だけ」予約が無くターン中無制限軽減／`SPDi43-09-E1`「【ソウル】が付いているかぎり」脱落＝無条件付与／`WXDi-P05-010-E3` **parseStatus:UNKNOWN＝完全no-op**／`WX24-P3-033-E1`【マジックボックス】設置ステップ消失／`WX25-P1-098-E1`／`WX13-015-E1`（アンコール） |
| **(iii) 構造混線**〔タスク13〕 | **3** | `WXK04-090-E1`「＜水獣＞を公開**しないかぎり自分を**トラッシュ」→「自分の水獣シグニをトラッシュ」＝別物／`WXK04-025-CB-E2` 多段閾値全脱落＋`ALL`→1＋能力付与が**直接ライフクラッシュ**に化ける／`WXDi-P16-034-E2` 引用付与の平坦化で《無》支払い回避が消え**無条件アタック禁止**に |
| **(iv) 計器較正**〔`vocabCensus.ts` の対応語彙表を直す・**直す対象ではない**〕 | **6** | 下記 |

**⚠95%信頼区間＝50〜90%**（20件・二項）。**点推定 70% を採ると残りの実バグは約 810件**（区間では 580〜1050）。続き369 の 92% を前提にした「残り約1050件」は**上限側**だった。

**⚠(iv) 計器較正 6件＝サンプルの 30%。ここが一番の伸びしろ**（直す作業ゼロで census が減る）。実測した誤検出の根因と規模：
- **`LOOK_PICK_CHAIN` の `maxPick` が「Nまで」そのもの**（`WX25-P1-091-E1`／`WXDi-P08-050-E1`／`WXDi-P16-032-E1` の3件）＝census は `upToCount`/`pickUpTo` を探すが、`execLookPickChain` は `needsInteraction({type:'SEARCH', maxPick: stage.pickCount})` を渡しており**上限として正しく効いている**。**クラスタ「「Nまで」上限選択」93件のうち 28件が LOOK_PICK_CHAIN＝機械的にまとめて較正できる。**
- **`FORCE_PLACE_FRONT`**（`WD07-010-E1`）＝「配置する**場合**」が条件節クラスタに掛かるだけ。parser／`effectEngine.ts:5610`／`BattleScreen.tsx:5284`／`SigniSummonZoneModal.tsx:58` まで**フル実装済み**。
- **`levelEqLrig` / `colorMatchesLrig`**（`WDA-F03-09-E2`）＝「センタールリグと同じレベル」「共通する色」を正しく持っているのに対応語彙表に無い。
- **`COUNTER_SPELL.maxCost`**（`WX13-015-E1`）＝「コストの合計が1以下」を表現済み（※同カードの**アンコール**は別途 (ii) の実ギャップ）。
- **filter による条件の等価表現**（`WX15-001-E2`）＝「それが赤のシグニの**場合**」を `ADD_TO_FIELD{source:{filter:{color:'赤'}}}` で表している（赤以外は候補0で不発＝等価）。続き365 が `REVEAL_AND_PICK` 形を較正した際に**この形は取りこぼしていた**。

**⚠この測定から出た教訓**＝**「census に残っている＝バグ」ではない**。残り1162のうち約3割は計器側の問題で、**較正は実装より安い**。次バッチを取る前に (iv) を先に潰すと、以後のサンプリング精度も上がる。

#### ✅③ worklist を**クラスタ別ではなく作業種別**へ組み替えた（続き376）

**根拠＝残り1162は均質ではない**（続き375 実測のクラスタ別「もう直っている率」）：

- **機構未実装＝§6.3 の領分（約165効果）**：チーム 0%(34)／アンコール 3%(19)／合計制約 25%(25)／同一性 38%(16)／ゲームから除外 44%(26)／正面 50%(19)／数量比例 51%(26)。**①のマトリクスには出ない**（配線ではなく新機構）。
- **長いテール（75〜92%済み）**：条件節 283／小さい数(2-5枚/体) 181／クラス指定 154／数値不一致 96／「Nまで」 93／色フィルタ 79／キーワード能力語 73／レベル閾値 57 ほか。**①が効くのはここ。**
- **計器の偽陽性**：engine が原文から直接読んで**正しく動いているのに census にだけ残る**形（【ビート】コストの `《X》以外` ＝`analyzeBeatSigniCost`）。**直す対象ではなく census の較正対象。**
- **構造混線（パターンD）**：タスク13 へ送る。

**分類の4区分**＝(i)配線ギャップ〔①で機械検出・バッチ化〕 (ii)機構ギャップ〔§6.3〕 (iii)構造混線〔タスク13〕 (iv)計器較正〔`vocabCensus.ts` の対応語彙表を直す〕。

---

### 🗂 作業種別 worklist（**続き376 以降はこれが正**・クラスタ別 worklist は索引としてのみ残す）

> **取り方**＝上から順ではなく、**(iv)→(i)→(ii)→(iii) の順にコストが安い**。②の実測では残1162の内訳が概ね
> **(i)25% / (ii)30% / (iii)15% / (iv)30%** で、**(iv) は実装ゼロで減る**ぶん最初に取るのが効率がよい。
> 各項目の末尾が**着手時にまず打つコマンド**。

#### (iv) 計器較正 — `scripts/vocabCensus.ts` の対応語彙表を直す（**実装ゼロ**）

**✅第1・2バッチ完了（続き376c）＝census 1151→1089（−62）。実装ゼロ・バグ修正なし。**

> ⚠**較正は「実バグが減った」ではない**＝母集団から偽陽性が抜けただけ。したがって**残りの実バグ率は上がる**。
> §5d-0 ② の実測（1162 のうち 70%＝実バグ約813／偽陽性約349）から算術で更新すると、
> 較正で抜けた62件はすべて偽陽性側なので **1089 のうち実バグ約813＝約75%**。**実バグの絶対数は変わっていない。**
> ⚠**次に `censusSample.mjs` で測り直すのは (iv) をもう1〜2バッチ進めてから**（いま測っても較正途中の母集団を測ることになる）。
- [x] **`LOOK_PICK_CHAIN` の「Nまで」**（−25）＝`stage.pickCount` は `execLookPickChain` が `needsInteraction({type:'SEARCH', maxPick})` へ渡しており**上限として正しく効いている**。⚠**型名を key に足す一括免除はしなかった**＝`vocabCensus.ts` に「LPC は型名を key に足さない」という**過去の明示判断**があり、その理由（効果全体が免除され、同じ効果の**別アクション**にある「N体まで」の脱落まで隠れる＝続き376b のクロス計上と同じ罠）は今も正しい。代わりに **`extraOk` で残渣チェック**＝原文の「Nまで／好きな枚数」の出現数以上の**上限スロット**が JSON にあるときだけ免除。実測＝高シグナル93件中 LPC 28件が**全数 slots ≥ need**。
- [x] **`FORCE_PLACE_FRONT`**（−4）＝「対戦相手がシグニを配置する**場合**」は条件節ではなく行動の言い回し。parser／`effectEngine.ts:5610`／`SigniSummonZoneModal.tsx:58`／`BattleScreen.tsx:5284` までフル実装済み。残渣チェック付きで免除。
- [x] **`COUNTER_SPELL.maxCost`**（−2）＝「コストの合計がN以下のスペル」の正表現。対応表には `costMax`（TargetFilter 側の名前）しか無く、**大文字小文字が違うだけで部分一致しない**という続き368 の `minPower`／`Under` と**同じ罠**だった。
- [ ] **filter による条件の等価表現を条件節クラスタの extraOk に入れる**＝「それが〈desc〉の**場合**」を `ADD_TO_FIELD{source:{filter}}`／`SEARCH{filter}` で表す形（`WX15-001-E2`）。続き365 は `REVEAL_AND_PICK` 形だけ較正しており**この形が漏れていた**。⚠**条件節クラスタは283件と最大**なので、広い extraOk は masking リスクも最大＝残渣チェックを特に厳しく。
- [x] **🆕`trash_key`**（−31・続き376c 第2バッチ）＝「このキーを場からルリグトラッシュに置く：」（【起】コスト）。型（`effects.ts:355`）にも engine（`BattleScreen.tsx:6314` で実際に支払い、コスト表示にも出る）にも実装済みなのに対応表から漏れており、**「コスト:場からトラッシュ」クラスタの高シグナル34件が全部これ1つ**だった。⚠**PLAN の旧記載を訂正**＝「`levelEqLrig`／`colorMatchesLrig` を『同一性』『共通する色』の対応語彙に入れる」は**クラスタの誤記**で、`WDA-F03-09-E2` が落ちていたのは実はこのクラスタ。`levelEq`／`colorMatchesLrig` は同一性・共通する色の対応表に**元から入っていた**。
- ⚠**較正のたびに残渣チェック必須**（続き365 の規律）＝desc からモデル化できた識別子を除いて**何か残るなら covered にしない**。実バグを masking したら計器の意味が消える。**較正後は消えた効果を全件目視し、「新たに高シグナルへ出た効果が0件」を機械確認する**（続き376c で実施）。
- `npm run census`（較正後は `BASELINE_HIGH` と §4 恒久指標を実数更新）

#### (i) 配線ギャップ — ①のマトリクスからセル単位で取る（**バッチ化できる唯一の区分**）

**✅第1〜8バッチ（続き376b〜377c）＝消化済み・計 108効果。第1 `triggerSubjectClass × TRIGGER{ON_ATTACK_SIGNI}` 16／第2 BOUNCE のクラス 3／第3 トラッシュ→デッキ下の source クラス 17／第4 「あなたの〈filter〉シグニ…パワー±N」の owner ごと脱落 18／第5 ディソナ判定の `keyword` 誤用 12／第6 `hasOtherSelfSigniNoun`（「他の」）ゲートの棚卸し 12＋engine 1／第7 `noGuard` セル→同ビルダーの構造バグ 30＋engine 1／第8 《ライズ／クロス／アクセアイコン》 17。****詳細（真因・トリップワイヤ・教訓）は [PLAN_DETAIL.md](./PLAN_DETAIL.md)「2026-08-07 整理：§5d-0(i) 第1〜8バッチ」節と [BUGFIXES.md](./BUGFIXES.md) の各エントリ。**
**✅第19バッチ（続き378・Codex 委譲）＝`isDisona` / `excludeResona` の対象フィルタ合成漏れ 計22効果／census 924 据置・被覆マトリクス miss 307→291・golden 1488→1517。** 真因は `parseIconFilter`（`parserUtils.ts:213`）が `/《(ライズ|クロス|アクセ)アイコン》を持つ/` ＝**「を持つ」接続の3アイコンしか見ない**こと。《ディソナアイコン》は原文で**連体の「の」**で書かれるため、トラッシュ／エナ系ビルダーが呼んでいても**永久に当たらず**「トラッシュから《ディソナ》のシグニを回収／蘇生」が**どのシグニでも取れる**過剰効果だった。`signiClauseDisonaFilter`／`signiClauseExcludeResonaFilter`／`signiClauseResonaFilter` を 3兄弟の隣接規律で新設（⚠**トラッシュ／エナの対象は「N枚」＝助数詞を「枚/体」両対応にしないと当たらない**）。**最大の収穫は engine のパリティ穴**＝`effectEngine.matchesFilter` に `isDisona` が無く（続き372 の移植ブロックから漏れていた）、`HAS_CARD_IN_FIELD`/CONTINUOUS/`activeCondition` では **JSON が正しくても無視**＝`WXDi-P12-044-E1` ほか**5効果が「他の《ディソナ》のシグニのパワーを＋N」を全味方へバフ**していた（1行移植で是正）。据置＝`WXEX2-18-E2`（2対象の owner 取り違え＝(iii) へ）。**🔎教訓＝(a) 判定器が2つある語彙は片方だけ穴が空く＝JSON 差分にもゲートにも映らない。(b) 被覆マトリクスは STUB/MANUAL 同居効果を除外するので同型がセルに出ない（`WXDi-P13-002-E1`）＝全カード A/B でセル外を回収する。**
**✅第9バッチ（続き377d）＝シグニ→デッキ上/下 のレベル範囲 8効果＋計器較正 −38／census 1048→1041・被覆マトリクス miss 422→376。**「対戦相手の**レベルN以下の**シグニ１体を対象とし、それをデッキの一番上／一番下に置く」でレベル限定が丸ごと落ち、**どのレベルのシグニでもデッキへ送れる**過剰効果だった。⚠**miss 22 のうち本物は8件**で残り14件はクロス計上（ルリグのレベル条件／条件節／自身のレベル条件／【ビート】コスト）＝`signiClauseLevelFilter` を新設して隣接判定で分離。これで **`signiClause*Filter` 3兄弟（クラス・アイコン・レベル）が揃った**。同時に計器較正＝`levelRange` の原文正規表現を名詞に係る形へ限定（miss 79→41／`levelRange × GRANT_KEYWORD{SIGNI}` の miss 9 は**9件すべて**が偽陽性だった）。**🔎教訓＝セルを取ったらまず全数分類し、偽陽性の型が分かったら計器を較正するのが最短。**
**✅第15バッチ（続き377j）＝`_partial_fresh` 行列の parser 側を直す・7効果／census 960→**957**。** 続き377i で新設したレビュー行列の12カードは、すべて**live に正しい形があるのに parser だけが退化**していた＝**手で採用しても意味がない**（fresh が退化側）。**parser を直して live と一致させ行列から落とす**方針に切り替えた（一致させれば以後の改善も効果単位マージで自動的に届く）。①「（あなた|対戦相手）のエナゾーンにあるカードがN枚（以上|以下）であるかぎり」＝旧規則は**「あなたの」「N枚以上」「あるかぎり」の1形だけ**を見ており、所有者・不等号・語尾の変種が素通り＝`activeCondition` が落ちて**無条件発火**（4効果。「相手のエナが少ないときだけ強くなる」札が常時強かった）。②🔴「〔X〕以外の効果を受けない」＝`t.includes('アーツ')` が `from:['アーツ']`＝「アーツの効果**だけ**受けない」と読み、**保護範囲が原文とちょうど反対**（2効果）。正しい形（`fromAll`＋`exceptSource`）は同ファイルの「ルリグ以外」規則に既にあった。⚠「**自身**以外」は語彙が無いので触らない。行列は **12→10カード**。**🔎教訓＝(a) レビュー行列に残るものは「採用待ち」ではなく parser のバグ台帳として読む。(b) 1形だけを見ている規則を疑う＝新しい条件規則は最初から〔所有者〕〔不等号〕〔語尾のゆらぎ〕を許す（語順・数量詞に続く4例目）。(c) 🔴`includes(語)` で種別を拾う判定は「以外」で反転する＝否定語の有無を先に見る。(d) ✅ツールを直した効果が次のバッチで実際に効いた＝parser を直して build:effects を回すだけで混在カード4効果が自動収穫された。**

**✅第14バッチ（続き377i）＝収穫マージを「カード単位温存」→「効果単位温存」へ・70効果／census 972→**960**・被覆マトリクス miss 319→318。** 続き377h の「(iv) 枯渇」は *census が見える範囲* だけだったと判明（`thisCardOnly` のように census 語彙に無い脱落が大量に残っていた）。原因は計器ではなく**ツールの構造**＝`build:effects` が「カード内に MANUAL/PARTIAL が1つでもあれば**カード丸ごと**温存」で、**同カードの AUTO 効果への parser 改善が永久に live へ届かなかった**（実測 584カード）。**効果単位の温存**へ変更（MANUAL/PARTIAL は不可侵／残りは `isPureSuperset` を個別通過／effectId 集合が変わるカードはカード丸ごと温存）＝**41カード/43効果を自動収穫**し、以後は parser を直せば自動で届く**恒久的な解決**。あわせて「効果単位でも自動採用できない値変更/構造変更」を出す**第2のレビュー行列 `docs/_partial_fresh.json`** を新設し、39効果を原文照合して **27件採用／12件は live のほうが正しいので不採用**。**🔎教訓＝(a)「計器が0になった＝系統が枯れた」ではない＝枯渇宣言は計器ごとに範囲を書く。(b) 症状を手で刈る前に、なぜ溜まるのかを見る＝2バッチ手作業で刈った系統がツールの1箇所で恒久的に解けた。(c) 🔴テストが落ちたら「実装が悪い」と決めつけない＝golden のトリップワイヤがバグ由来のアーティファクト（E3 の内容が E2 へ漏れた POWER_MODIFY）を検証しており、実装が正しくなった瞬間に落ちた。(d) 保守的すぎる粒度は安全ではなく、ただの取りこぼし＝`isPureSuperset` を効果ごとに通しても保証は同じ。**

**🏁第13バッチ（続き377h）＝(iv) stale live の刈り取り**完了**・37効果／census 1000→**972**・被覆マトリクス miss 320→319。** held 189枚のうち **census 高シグナルに当たる 38カード/40効果を全件原文照合**して消化＝36カードを `heldReview --adopt`、1効果（`WXDi-P06-011-E3`）を外科的に採用。**終了時点で「census 高シグナルに当たる held」は 38カード→0カード＝この系統は枯渇**（held 自体も 189→144枚／89→71群）。**壊れ方は7型に集約**＝duration 取り違え（`UNTIL_OPP_TURN_END`→`UNTIL_END_OF_TURN`＝**相手ターンに効果が切れる**）8／付与対象の `thisCardOnly` 脱落（「**このシグニは**」が味方1体選択になる過剰対象化）6／条件節の常時true化 5／「そうした場合」の対象取り違え（**あなたの**シグニをバニッシュすべきところ**相手**をバニッシュ）2／trigger timing の平坦化（内側の付与能力を最上位へ）3／【使用条件】の焼き付き 4／条件節由来の `excludeSelf` が相手側の対象フィルタへ漏れる 3。**🔎教訓＝(a)「held が新しい」は「held が正しい」ではない（40件中2件が逆方向＝`WXDi-P06-011-E1` の owner／`WXK06-048-E1` の `targetsLastProcessed`）＝全件原文照合は省略できない。(b) カード単位採用だと巻き添えになる＝退化と改善が同居するカードは効果単位で採る。(c) 🔴`manualEffects.ts` の MANUAL 定義が live より古いことがある（逆パターン）＝held が消えない MANUAL 効果は JSON ではなくソース側を直す。(d) この7型は parser 側にも残っている可能性があり、次バッチの探索キーになる。**

**✅第12バッチ（続き377g）＝stale live の一括解消 38効果／census 1030→**1000**・被覆マトリクス miss 338→320。** **`build:effects` の非破壊マージが「parser は直っているのに live は古いまま」の在庫を作る**という**新しい系統**を計器化した＝収穫マージは証明可能に無損失な上位集合だけを自動採用するので、parser を後から直しても live の古い値は上書きされない＝**census には過剰効果として残り続ける**。census 高シグナル 1030件を fresh と全件突き合わせ、①fresh のほうが語彙キーを多く持つ **30効果を外科的に採用**（同カードの別効果が live=MANUAL のとき fresh がそれを退化させるため、**カード単位ではなく効果単位**で採り MANUAL は無条件スキップ）②held から census 高シグナルに当たる **8カードを原文照合のうえ採用**。典型は `GRANT_KEYWORD{keyword:"使用条件"}`＝【使用条件】の前置きをキーワード付与と誤解した古い形が**本文の効果を丸ごと食っていた**もの（`CHOOSE` 4択／`GROW_COST_REDUCTION`／`LRIG_COLOR` 条件が復活）。**parser/engine は1行も触っていない。** **🔎教訓＝(a) census が減らないときはまず live と fresh を全件突き合わせる（parser ではなく live が古い可能性）。(b) 🔴採用値は必ず `build:effects` の出力から取る＝`parseCardEffects` 直呼びの自作ダンプは `_sourceTextLog` を参照する post-pass が効かず後付けフィールドが黙って落ちる（golden のトリップワイヤが検知）。(c) golden が live を読むことの盲点＝parser 側の退化は live が古いままだとテストに映らない＝stale live の解消は回帰検出力そのものを上げる。(d)「held のほうが差分が小さい」は採用理由にならない。**

**✅第11バッチ（続き377f）＝ON_ATTACK_SIGNI の味方側トリガー主語 8効果＋engine の `excludeSelf` 過剰発火 3効果／census 1032→1030・被覆マトリクス miss 349→338。** 最大セル `cardClass × (filter無)`（miss 33／has 83★★）を**全数分類したら「1 regex で N 効果」型ではなく5系統の寄せ集め**だった（アタック主語5／LOOK_PICK_CHAIN 10／構造欠落8／条件節4／コスト2／他 timing 主語4／計器誤検出3）。**真の穴＝アタック主語の修飾語抽出が「クラスのみ」「パワーのみ」「色のみ」の3本の別 regex に分かれており、修飾が2つ以上（パワー＋クラス等）だとどれにも当たらず既定 `self` へ潰れる**＝①味方全体が引き金なのに watcher 自身のアタックでしか発火しない過小実行 ②その自身に対しても「パワー10000以上」等の限定が一切効かない、の二重のズレ。`parseAllyAttackSubject` へ統合し**未知の修飾語が残れば `null`＝配線しない**という安全弁を戻り値で構造化（【ソウル】1件は据置）。engine 同居バグ＝BattleScreen のアタッカー自身経路が `triggerFilter` を素の `matchesFilter` へ丸ごと渡しており `excludeSelf` が無視されていた（pure ヘルパー `attackerSelfTriggerFilterOk` に集約）。較正＝`triggerCondition` の `*Story` 系を `cardClass` の配線済みキーに追加。**🔎教訓＝セルは母集団の索引であって母集団そのものではない（系統が見えたらその語彙全体で全CSV走査＝今回セル外に3件）／安全弁はコメントの規律ではなく関数の戻り値にする／`npm run gates` の lint は `--cache` なので簿記前にキャッシュを消して測り直す。**

**✅第10バッチ（続き377e）＝「あなたのすべての＜X＞のシグニ」の語順 15効果＋計器較正（cardClass 116→98）／census 1041→1032・被覆マトリクス miss 376→349。**`(?:すべての)?` が修飾語群の**後ろ**にしか無く、「あなたの**すべての**＜地獣＞のシグニのパワーを＋3000」で**分岐条件ごと外れて** `{SIGNI, owner:"any", count:1}` へ潰れていた＝**味方全体バフが「シグニ1体」に縮退**＋**相手のシグニにも撃てる**（9効果）。あわせて続き376d が「別系統の改善が同居」として据置した held 3枚を原文照合のうえ採用（6効果＝「**このシグニは**【X】を得る」の `thisCardOnly` 脱落も解消）。較正＝`cardClass` から条件節・コスト軽減用法を否定先読みで除外。**🔎教訓＝A/B の件数と直った件数は違う（6件は live が MANUAL で既に正しかった）／採用前の確認は JSON パースの構造比較で（文字列 strip はネスト括弧で誤検知）。**

> 🔎**census の5つ目の死角＝「語彙はあるが判定器が違う」**（§5c 末尾の4項に追加）。`filter:{keyword:"ディソナアイコン"}` は `matchesFilter` が **EffectText の印字**を見るので、CSV の `Story` 属性であるディソナには**両方向に外れる**（98枚中38枚を取りこぼし／非ディソナ17枚を誤ヒット）。**語彙突き合わせ型の計器は原理的に検出できない。**
> ⚠**「他の」ゲートの穴は再発しやすい**＝第1バッチ（ON_ATTACK_SIGNI 主語）と第5バッチ（`parseSigniTarget` の isDisona）が同型。`hasOtherSelfSigniNoun` で gate している箇所を洗うと同じ穴が出る可能性がある。

> ⚠**follow-up 3件**＝`WX24-P4-079`／`WXDi-CP02-063`／`WXK09-080` は held に**無関係な別系統の改善**（`thisCardOnly` 追加等）が同居していたので分離して据置。原文照合して別途採用すること。
> ⚠**follow-up**＝`WXDi-P13-077-E1`「あなたの《ディソナアイコン》のシグニ1体」は owner だけ是正され `isDisona` は未載（`parseSigniTarget` がこの位置のアイコンを取らない）。

> ⚠**follow-up＝クラスが2つ以上の span は据置**（`PR-322-E1`「＜天使＞1枚**と**＜古代兵器＞1枚」＝別ピック／`WX08-036-E1`「＜鉱石＞**か**＜宝石＞合計5枚」＝OR）。片方だけ載せると**原文と逆の過小実行**になるため、AND/OR/別ピックを区別できる形（`anyOf` か複数ステップ）を用意してから取ること。golden にトリップワイヤあり。

> ⚠**第2バッチで分かった「セルの読み方」**＝`cardClass × SIGNI[filter]`（miss 43）を機械分類すると
> **①対象フィルタの真の脱落 11／条件節（クロス計上）9／別ゾーン指定（クロス計上）13／要目視 10**。
> **大セルはそのままバッチにならない**＝`--cell` で原文を読んで①だけを抜くのが正しい使い方。
> さらに①の11件も内訳が分かれる＝**BOUNCE 対象3件**（消化済み）／**トラッシュ→デッキ下＋レベル相異5件**
> （`SPDi44-12・16`／`WX25-P1-014・030`／`WX25-P2-063-E2`＝同一テンプレの**次のきれいな1本**）／
> コスト側フィルタ1件（`WX05-044-E1`）／機構待ち1件（`WX24-P3-033-E1`＝【マジックボックス】）／`WX17-071-E1`。

**⚠取る前に必ず**：`--cell` で原文を全部読み、**クロス計上**（フレーズが同じ効果の別の入口に掛かっている）・**条件節用法**・**コスト側フィルタ**を仕分ける。miss 数＝見込み件数ではない（①の⚠⚠を参照）。

現在の miss 上位（`npm run census:wiring`・続き376b 実測＝**合計 541**。★★＝同入口に20件以上の配線済み／★＝5件以上）：
- [ ] **大クラスタ（続き376b 追加）**＝`cardClass` **154**（has 1407）／`levelRange` **81**（247）／`color` **36**（297）／`powerRange` **30**（507）／`levelExact` **29**（103）。★★セルは `cardClass × SIGNI[filter]` 46／`cardClass × POWER_MODIFY{SIGNI}` 38／`levelRange × SIGNI[filter]` 25／`cardClass × TRASH_CARD[filter]` 13／`color × SIGNI[filter]` 12 ほか。⚠`cardClass × (filter無)` 37 は**条件節用法が濃い**＝優先度低。
- 以下は続き376 時点の実測（マイナー語彙・★＝同じ入口に配線済みの効果があり穴が明確）：
- [ ] **`isDisona` 34**（has 21）＝WXDi-P12/P13 系に集中。
- [ ] **`hasRiseIcon` 31**（has 8）★＝`TRASH_CARD[filter]` 9／`SIGNI[filter]` 8／`SEARCH[filter]` 7／`BANISH{SIGNI}` 6／`GRANT_KEYWORD{SIGNI}` 6。`WX16-026-BURST` ほか**トラッシュから何でも回収できる**過剰効果。
- [ ] **`eachDistinctLevel` 29**（has 1）＝`TRASH_CARD[filter]` 20／`SIGNI[filter]` 12。⚠**厳密 enforce は engine 側が TODO**（選択補助＋逆翻訳のみ）＝配線しても表現改善どまり。取る前に enforce を入れるか決めること。
- [ ] **`hasCrossIcon` 22**（has 2）★＝`SIGNI[filter]` 11／`SEARCH[filter]` 10／`POWER_MODIFY{SIGNI}` 7。`WX07-010-E1` ほか7効果が**自分の全シグニに+1000**の過剰効果。
- [ ] **`noGuard` 14**（has 61）★＝`TRASH_CARD[filter]` に 7 miss だが**同じ入口で 61件が配線済み**＝最も明確な穴。
- [ ] `isPuppet` 10／`isAwakened` 10／`levelParity` 9（has 4）★／`excludeResona` 6／`hasGuard` 6／`nonColorless` 5／`levelEqTrigger` 5 ほか。
- ⚠**一度も配線されていない語彙は (i) ではない**＝`powerLteSelf` 9／`isDrive` 14／`eachDistinctColor` 3／`levelLtSelf` 2 は has=0＝**機構未実装 (ii)**。スクリプトが自動で別枠に落とす。

**✅消化済みセル**
- **（続き376b・第1バッチ）`triggerSubjectClass × TRIGGER{ON_ATTACK_SIGNI}` 16効果**＝`effectParser.ts` の ON_ATTACK_SIGNI 主語抽出が**「他の」があるときだけ**動いており、「他の」無しは `triggerScope` が既定 `self` に落ちて **watcher 自身がアタックしたときしか発火しない過小実行**だった（原文は味方の該当シグニ全部が引き金）。⚠**当初「どのシグニでも発火する過剰効果」と読んだのは誤りで、実際は逆方向（過小実行）**＝`triggerScope` の既定が `self` であることを確認せずに書いた。**engine（`collectFieldTriggers` の any_ally path）は元から `triggerFilter`/`excludeSelf` に対応済みで、落ちていたのは parser の1行だけ。**
  - 内訳＝クラス有9（`WX13-037-E2` 凶蟲／`WX17-032-E2`・`WXEX2-20-E1` 英知／`WX18-054-E1` 悪魔／`WX19-072-E1` 地獣／`WXEX2-13-E1` 水獣／`WXEX2-18-E1` 遊具／`WX25-CP1-091-E1` ブルアカ／`WXDi-D09-P17-E2` 天使）＋クラス無7（`WD23-032-A-E2`／`WX10-035-E1`／`WX14-006A-E1`／`WXEX2-16-E2`／`WX25-P2-022-E1`／`WX25-P3-023-E1`／`WXDi-P10-054-E1`／`WXK07-030-E1`）。
  - ⚠**抽出を先頭限定（`^`）にして前置き修飾つき3効果を意図的に除外**＝`WXDi-P04-016-E1`「**【ソウル】が付いている**あなたのシグニ」／`WXK10-084-E1・E2`「**レベルが奇数/偶数の**あなたの＜トリック＞のシグニ」。前置きごと無視して any_ally に広げると「条件を満たすシグニだけ」が「味方シグニ全部」になり、**過小実行を過剰発火へ付け替えるだけ**になる。**golden にトリップワイヤを設置済み**（広げたら落ちる）。→ 配線したい場合は先に triggerFilter 側へ前置きの語彙（ソウル付き／`levelParity`）を載せること。`levelParity` は型にも `matchesFilter` にも実装済みなので `WXK10-084` の2件は**すぐ取れる在庫**。
  - ⚠**採用経路が2種混在**＝`WXEX2-18` は held に正しい形が滞留していたので `heldReview --adopt`（同時に E2「それをエナゾーンに置く」＝**デッキトップを自分のエナへ**という別物だったのと、E3 の「＜遊具＞のシグニ5枚まで」フィルタ欠落も是正）。`WX25-CP1-091` は E2 が PARTIAL のため**カード単位 PRESERVE で held に載らない**＝parser 出力と完全一致する形で外科パッチ（続き371 の `WX09-CB02` と同型。**held を増やさないための必須手順**）。
  - **ゲート**＝golden **1419→1422**（+3＝parser 側16効果の固定／前置き除外のトリップワイヤ／engine の同クラス発火・別クラス非発火）、census **1162→1151**（−11・`BASELINE_HIGH` 更新）、smoke 全0、fuzz 全0、同型★**0 据置**（265群）、lint 0 errors/248 warnings（追加0）、manual field loss 0。**A/B 差分で `triggerScope`/`triggerFilter` 以外の変化が 0 件であることを機械確認済み。**
- ⚠**セルを取るたびに全CSV走査で用法を分類してから配線する**（付与文・条件節・リマインダー文を filter にすると**原文と逆の過小実行**になる＝続き369 の教訓）。
- `npm run census:wiring` → `npx tsx scripts/censusWiring.ts --cell <キー>:<入口ラベル>`

#### (ii) 機構ギャップ — §6.3 台帳／Opusタスク12 へ送る（1件ずつ・逓減しない）

**🏁続き377n＝「engine 側で上限/フィルタが消費されない7効果」を完遂**（(a) `execAttachCharm` の複数ペア4／(b) `execGrantKeyword` の `upToCount` 2／(c) `classMatchesDiscardSigni` を `execRevealAndPick` へ配線1）。**この3件は「語彙は型にも engine にもあるのに、その入口では読まれていない」型**で、続き377m が exec の該当行まで書き残していたため調査ゼロで入れた。波及で `owner:"any"`（engine で `tgtOwner="opponent"` へ解決）の誤りが **14効果** 出た。詳細＝[BUGFIXES.md](./BUGFIXES.md) 続き377n。
- ✅**「`isDisona` の条件節グループ」は続き379 で消化**（8効果＝常在3＋解決時5。既存条件型のみ・新設ゼロ）。**残ったのは下の1件＋別機構3件だけ。**
- [ ] **🆕2ゾーン合算の枚数条件が無い**（続き379 の defer）＝`WXDi-P12-056-E1`「あなたの**エナゾーンとトラッシュに**《ディソナアイコン》のカードが**合計７枚以上**ある場合」。`ENERGY_HAS_CARD`＋`TRASH_HAS_CARD` の **`AND` では同値にならない**（合計なので 3+4 でも成立）。⚠**近似禁止**＝現状は条件ごと落ちて**無条件ドロー**。コスト側には先例（`combinedTrash{zones:['energy','field']}`）があるので、条件型にも `zones` を持つ形を1つ足すのが素直。
- [ ] **`isDisona` の別機構3件**（続き378 で実測・続き379 も対象外）＝`WXDi-P13-005-E1`（「捨てたカードが《ディソナ》の場合、代わりに」が2連 BANISH へ平坦化＝(iii)）／`WXDi-P13-007-E3`（「捨てた《ディソナ》1枚につき」の数量比例）／`WXDi-P13-008-E3`（引用付与内の「《ディソナ》のスペルを使用したとき」）。
- ⚠**条件に語彙を足すときの必須確認（続き378・379 で2回続けて要になった）**＝**両 `matchesFilter`（`execUtils` / `effectEngine`）と両評価器（`evalCondition` / `checkActiveCondition`）は別物**。①型にキーがあっても評価器が知らなければ**黙って無視**（378 の `isDisona`＝揃えるのが正しかった）②逆に**揃えてはいけない**こともある（379 の `powerRange`＝持続側を実効パワーにすると**パワー計算が循環する**）。③`activeCondition` に評価器が知らない型を書くと **`return true`＝無条件成立**に落ちる。
- [x] 🏁**`parseStatus:UNKNOWN` の完全no-op ＝ 残0クローズ（2026-08-09 続き385・Codex 委譲）**。⚠**投入前実測で在庫は 6件ではなく 7件**だった。内訳＝群A アシストルリグをルリグデッキへ戻す4（新型 `RETURN_ASSIST_LRIG_TO_DECK`）／群B `WX09-019-E3`「これをトラッシュに置く」＝既存 `thisCardOnly` で表現／群C `WXDi-P00-002-E1`＝既存 `RemoveAbilitiesAction` に `keywords?:string[]` 追加／群D `WX25-P1-048-E1`＝アシストルリグのアタック機構が無いので**専用宣言 STUB へ honest defer**。live 変化 7効果・added/removed 0。詳細は [BUGFIXES.md](./BUGFIXES.md) 続き385。
- [ ] 🆕**`HAS_CARD_IN_FIELD{cardType:'ルリグ'}` がアシストルリグを数え落とす＝live 19効果**（続き385 検証で発見）。`matchesFilter` の cardType 照合は `types.includes(card.Type)` の**厳密一致**（`execUtils.ts:590-597`・緩和はレゾナ→シグニの一方向のみ）で、CSV の Type は **`'ルリグ'` 1234枚と `'アシストルリグ'` 340枚が別値**。`lrigZoneTops`（`execUtils.ts:512`）がアシストを走査していても**黙って全部落ちてセンター限定に戻る**。母集団＝`WXDi-P08-001`〜`005` 系のピース使用条件「あなたの場に○と○と○のルリグがいる」9件／`WX24-P4-068/075/082/089`「レベル4以上のルリグ」4件／ほか。**Diva のピースはセンター＋アシスト2の3体を前提にした使用条件なので、原文照合のうえ `cardType:['ルリグ','アシストルリグ']` の配列形へ寄せる**（続き385 で `WXDi-P00-002-E1` 1件は是正済み＝先例）。⚠**`matchesFilter` 側でレゾナ→シグニと同じ緩和を入れる一般化は禁止**（「ルリグ1体を対象とし」の対象フィルタまで広がる）。⚠**逆翻訳 `decompileEffects.ts:458` も文字列比較だった**ので、配列形にしたら逆翻訳の追随を必ず確認する（続き385 で是正済み）。
- [ ] **`PARTIAL`**＝⚠**PLAN の「union 1162 中 23件」は古い**。2026-08-09 実測＝live の `parseStatus:"PARTIAL"` は **54件**、うち census 高シグナルは **18件**（`WX14-046-E1`／`WX21-028-E1`／`WX24-P4-038-E1`／`WX25-P1-044-E1`／`WX25-P3-050-E1` ほか）。中身は **(iii) 構造混線**（`LOOK_AND_REORDER`＋`UNKNOWN` 残渣・引用付与の内側 UNKNOWN 等）＝1件ずつ木を作り直す種類で、(ii) の「安い在庫」ではない。
- ⚠🆕**`docs/_partial_report.txt` を「直すべき40件のリスト」として読まない**（2026-08-09 実測）＝「IS_MY_TURN化」刻印 40件のうち **38件は live が `MANUAL`** で live JSON に `IS_MY_TURN` を含まない＝**既に解消済み**。刻印レポートは *fresh parse* の記録であって live 実害の一覧ではない。live に残る実害は `WX26-CP1-058-E1` の1件だけ。
- [ ] **未配線語彙（has=0）**＝`isDrive` 14／`powerLteSelf` 9／`eachDistinctColor` 3／`levelLtSelf` 2。
- [ ] **🆕`LOOK_PICK_CHAIN` が「ちょうどN枚」を表現できない＝実測23効果**（続き376c 計測）。`stage.pickCount` は `maxPick`（上限）として渡るため、原文が強制の「その中から＜アーム＞のシグニ**１枚を**場に出し」（`WDK06-R01-E2`）でも **0枚を選べてしまう**（プレイヤー有利側の過小実行）。「〜してもよい」形9件は上限扱いで**正しい**ので除いた残りが23件。⚠**census では原理的に検出できない**（「Nまで」しか見ない）＝(iv) 較正で見えなくなったぶんをここで引き取っている。直すには stage に「上限か固定か」のフラグを足して `needsInteraction` へ最小枚数を渡す必要がある。全23件＝`WDK06-R01-E2`／`WDK14-008-E1`／`WX11-074-E1`／`WX13-019-E2`／`WX15-083-TRAP`／`WX19-039-E1`／`WX19-069-E1`／`WX22-026-E1`／`WXEX1-12-E1`／`WXEX1-15-E2`／`WXEX1-25-E2`／`WX24-P2-065-E1`／`WX25-P1-041-E1`／`WX25-P1-052-E1`／`WX25-P1-053-E2`／`WX25-P1-079-E1`／`WXDi-P00-034-E2`／`WXDi-P15-010-E1`／`WXK01-069-E1`／`WXK02-030-E2`／`WXK05-023-BURST`／`WXK08-025-E3`／`WXK08-056-E1`。
- [ ] **`LOOK_AND_REORDER` の `canTrash` に枚数上限が無い**（続き376 発見・`WX25-P1-098-E1`）＝原文「カードを**1枚まで**トラッシュに置き」なのに `EffectInteractionModal.tsx:661` の `lookReorderTrash` は **Set で無制限**＝公開した3枚全部を捨てられる過剰効果。型に上限フィールドを足して UI で cap する。
- [ ] **🆕続き377 で登録した BANISH{ALL} 側の機構ギャップ4件**＝①**色の否定 filter が型に無い**（`WXDi-P03-085-E1`「**黒ではない**対戦相手のパワー3000以下のすべてのシグニ」＝`color` の否定形が無い）②**「そのターンにアタックしていた」フラグの filter が無い**（`WXDi-P08-010-E3`／`WXK01-035-E1`＝強制アタック後の一斉バニッシュが**全シグニ**になる）③**キーワードOR の filter が無い**（`WX14-004-E1`③「**【アサシン】【ランサー】【ダブルクラッシュ】のいずれかを持つ**すべてのシグニ」）④**自身パワーとの等値比較が無い**（`WX17-046-E3`「**このシグニと同じパワーを持つ**他のすべてのシグニ」＝`excludeSelf` だけ載って比較は未表現）。
- [ ] **既存の機構待ち登録**＝チーム 34／アンコール 19／合計制約 25／同一性 16／ゲームから除外 26／正面 19／数量比例 26（§6.3 台帳）。§5c の「⏳機構待ちと判定したテンプレ」＋§5d の「🆕新機構待ちとして登録」も同区分。
- `npm run census:clusters` → §6.3 台帳

#### (iii) 構造混線 — Opusタスク13（**1件ずつ再parse・バッチ化できない**）
- [ ] **②で新規発見した3件**：`WXK04-090-E1`（「公開しないかぎり**自分を**トラッシュ」→「自分の水獣シグニをトラッシュ」）／`WXK04-025-CB-E2`（多段閾値全脱落・`ALL`→1・能力付与が**直接ライフクラッシュ**に化ける・エナ全トラッシュのコスト欠落）／`WXDi-P16-034-E2`（引用付与の平坦化で《無》支払い回避が消え**無条件アタック禁止**・owner/duration も誤り）。
- [ ] **続き369 で照合済みの `WXDi-P04-016-E3`**（パターンD）。
- [ ] **§5d 末尾の照合済み12件**のうち (D) 相当。
- ⚠**「効果はだいたい parse できていて修飾が1つ落ちている」(i)(ii) と違い、(iii) は木ごと作り直し**＝1件あたりのコストが桁で違う。**後回しでよい。**

#### ⚠️ 併せて記録（続き375 実測・**思い込みの訂正**）

- **held は「安い勝ち筋」ではない**＝229枚を leaf 単位で調べたところ **純増（情報が増えるだけ）は 0枚**。52枚は**情報が減るだけ＝採用してはいけない**、177枚は増減混在で1枚ずつ判断が要る。「held を一括採用すれば稼げる」は成り立たない（`WX24-P3-063` の1件から一般化しすぎていた）。
- **census が 0 になっても「全カードが完璧に動く」にはならない**＝計器の死角は①JSON は正しいが engine 実装が違う ②文間の実行順序 ③効果単位の粒度 ④参照解決の誤り。続き375 の `WD15-018-E1` も真因は **engine 側**（`matchesFilter` が `colorNotMatchesLrig` を知らない）だった。**本当の完了判定器は BEHAVIOR_AUDIT（§5a）と §7 実機検証**であり、**P1 だけ完璧にしても目標には届かない**＝§7 を並行して進める。

---

### 5d. 1効果ずつの原文照合（2026-08-07 続き369 新設・**現在の主戦場**）

**目標＝「すべてのカードが完璧に動作する」に必要な、効果単位の修飾脱落を全数是正する。** §5c の文型バッチが
届かない**単発テール**が本体で、**母集団は約874効果**（census 高シグナル 1199 のうち単発テンプレにしか現れないもの）。
実バグ率は無作為サンプルで **11/11**（§5c 冒頭の根拠節）。

**⚠この作業の単位は「カード/効果」であって「文型」ではない。** 効果はだいたい parse できていて、
**filter / 対象 / owner / トリガー主語 / 条件節が1つ落ちている**のが典型。

**進め方**
0. ⚠**2026-08-07 続き376 以降は、まず §5d-0 末尾の「🗂 作業種別 worklist」から取る**（(iv)計器較正 →(i)配線ギャップ →(ii)機構ギャップ →(iii)構造混線 の順にコストが安い）。下の 1.〜4. は**そこで取った項目を1件ずつ処理する手順**として使う。クラスタ順に単発を掘るのは**探索コストが高い**（実測：直近7セッションで約12効果/セッション）。
1. `npm run census:clusters` → `docs/_census_clusters.txt` の**単発テンプレ**から効果を取り、原文とJSONを並べて照合する。
2. 落ちている修飾を**欠落パターンで分類**する（下表）。分類は毎回更新すること＝**同じパターンが繰り返し出たら parser へ還元する**のがこの作業の要。
3. 単発の外科パッチは curated JSON へ入れてよいが、**parser が同じ出力を出すようにするか MANUAL 化するか**をセットにする（さもないと parserWorklist の held が増える＝[memory] parserworklist-semantics）。
4. ゲートは `npm run gates`＋`npm run regen`＋同型★0。**parser を触ったら A/B 差分で「意図した効果だけ変わった」ことを機械確認**する。

**欠落パターンの分類（続き369 の無作為12件・以後ここを更新して母数を測る）**

| # | 欠落パターン | 例 | 件数(12件中) | parser 還元の見込み |
|---|---|---|---|---|
| A | **対象フィルタの脱落** | 「《X》**以外の**」「**能力を持たない**」「**このターンに捨てた**」「＜C＞の」「数**以下のレベル**」 | 6 | ◎（系統化しやすい・最優先） |
| B | **owner 取り違え・任意性喪失** | 「**対戦相手は**〜しても**よい**」→ 自分・mandatory | 2 | ○ |
| C | **条件節・機構ゲートの脱落** | 「手札が5枚以下の場合」「【チーム】ルリグ3体」 | 2 | ○（§5c の残規則と地続き） |
| D | **重度の構造混線** | `WXDi-P04-016-E3`＝別効果の内容混入・コスト消失・2体→1体 | 1 | ✕（1件ずつ再parse＝タスク13） |

**⚠完了判定について**＝**census が0になっても「すべてのカードが完璧」にはならない**。census の死角は §5c 末尾の4項
（参照解決の誤り／効果単位の粒度／JSONは正しいが engine 実装が違う／文間の実行順序）で、重度混線（D）も
たまたま census に掛かっただけの個体が居る。**最終的な判定器は BEHAVIOR_AUDIT（§5a）と §7 実機検証**。

**✅消化済みバッチ**
- **（続き369）パターンA「能力を持たない〜シグニN体」11効果**＝`TargetFilter.noAbilities` を新設し、`hasNoAbility`（既存・`abilities_removed` も数える）へ委譲。parser は `parseNoAbilitiesFilter()` を新設して6ビルダーへ配線、decompiler にも描画を追加。⚠**同語の別用法3つ（付与形「〜として場に出す」／条件節「〜場合」／リマインダー文）は filter にしない**＝(b) を誤爆すると**原文と逆の過小実行**になる。golden で「載らないこと」も固定（(b)5枚・(c)4枚）。

- **（続き370）パターンA「無色ではない〜」9効果**＝`nonColorless` は**型にも matchesFilter にも実装済み**だったが、**SEARCH と「トラッシュ→手札」のフィルタ合成から漏れて**いて無色シグニまで拾えていた。SEARCH は無条件配線、トラッシュ→手札は既存の**カード whitelist**（`TTH_FILTER_BATCH2_WAVE1_CARDS`＝段階ロールアウト機構）へ**原文照合した4枚だけ**を追加。⚠`WXEX2-06`「そのシグニと同じレベルの無色ではないシグニ」は2系統を同時に表せないため**据置**（部分 filter だけ採用しない方針）。⚠配線前に**全CSV走査で用法55件を分類**し、危険な別用法が無いことを確認（前バッチの教訓の適用）。

- **（続き371）パターンA「《カード名》以外の」36効果**＝`excludeCardName` は**型・`matchesFilter`（execUtils/effectEngine 両方）・decompiler に実装済み**で、漏れていたのは**8ビルダーのフィルタ合成**。⚠**実害が2種**＝①**反転13効果**（除外名が `cardName`＝部分一致に入り「**そのカードしか選べない**」原文と真逆）②**脱落23効果**（自分自身も回収/バフできる過剰効果）。**反転側は parser では既に正しく held に溜まっていただけ**＝`heldReview --adopt` 12枚＋`WX09-CB02` は**カード単位 PRESERVE で held に載らない**ため外科パッチ。⚠**据置＝【ビート】コスト3効果**（`cost.beat_signi` は count のみだが engine `analyzeBeatSigniCost` が EffectText から除外名を読む＝**JSON に語彙が無くても正しい**）。⚠配線前に全CSV走査で50ヒット/49効果を全数分類し、条件節用法が `PR-204`／`PR-238` の2件だけと確認。

- **（続き372）パターンA `nonColorless` の残りビルダー 11効果**＝第2バッチ（続き370）は **SEARCH とトラッシュ→手札だけ**を配線しており、トラッシュ→デッキ／デッキの一番下／トラッシュ→エナ／エナ→手札／相手手札を見て捨てさせる／`POWER_MODIFY_PER_TRASH_COUNT` の countFilter が素通しだった。⚠**同時に独立バグ2件**＝①続き370 の「部分filter禁止ガード」が**全文**を見ており後続文の語が前文の filter を消していた（対象名詞句に限定して是正）②**`effectEngine.ts` の `matchesFilter` が `execUtils` 版と乖離**（`colorExclude`／`excludeResona`／`noAbilities` が無く CONTINUOUS・activeCondition・HAS_CARD_IN_FIELD で黙って無視。live 使用数 3／33／11）＝移植。併せて「場に〈色〉ではないシグニがある場合」の条件節を新設（`WX16-Re06-E1` が**無条件で基本パワー5000**だった）。

**🔁再評価候補＝`WXK09-029-BURST` の据置**。続き370 が `effectParser` に置いた明示ガード（「そのシグニと共通する色を持つスペル」を含むカードでは同じ効果木の `nonColorless` も落とす）で据置中。⚠**「部分filter不採用」は `WXEX2-06`＝同一の対象に2系統が掛かる形でこそ正当**で、本件は**別ステップの別対象**（step1＝無色ではないシグニ／step2＝そのシグニと共通色のスペル）＝step1 だけ正しくしても step2 は悪化しない。次に触る人はこの区別を踏まえて採否を決めること。

- **（続き373）パターンA 動的な同一性参照 6効果＋据置1件の解除**＝①`levelEqTrigger`「そのシグニと同じレベル」を**トラッシュ→手札**へ（トラッシュ→**場**では配線済みだった＝`WXEX2-06-E2`／`WXEX2-78-E1`）②`nameEqLastProcessed`／`levelEqualsVar` をデッキサーチへ（`WXK05-044-E1`／`WXK09-032-E2` が**万能サーチ**だった）③`WXK05-044-E1` は前段 REVEAL が語順「シグニ**N枚を**公開する」未対応で bare に潰れ**参照先ごと消えていた**ので `source:HAND_CARD`＋クラス/レベルを復元 ④`WX24-P3-063-E1` は正しい MANUAL 定義が held に滞留していただけ（採用漏れ）。**🔓据置解除＝`WXEX2-06-E2`**（続き370 から）＝`levelEqTrigger` の配線で2系統とも表せるようになったため。**部分filter禁止は「片方を表せない」ときの規律で、表せるようになったら解く。**

**🆕新機構待ちとして登録（次の入口）**＝①`WXK11-040-E2`「エナからトラッシュに置いたシグニと**同じ名前**」＝コスト経路の**名前**変数が無い（レベル合計版 `last_cost_energy_trash_level_sum` はある）②`WX14-072-E1`／`WX14-075-E1`「手札から公開する**か**トラッシュに置く」＝選択肢構造が潰れて片方だけ（パターンD・タスク13）。

- **（続き374）パターンA 共通色否定＝相手エナ除去 4効果**＝原文38件のうち**30件は既に正しく**、既存の段階ロールアウト表 `LRIG_COLOR_BATCH5_ENERGY` に未登録の分だけが `TRASH{ENERGY_CARD,opponent}` に filter 無し＝**相手エナのどのカードでも落とせる過剰効果**だった。原文照合して3件追加（`WXDi-P14-054-E1`／`WXDi-P15-089-E1`＝PARTIAL で外科パッチ／`WXDi-P12-002-E1`＝held から採用し「ディソナ3体ゲート」も同時復活）。**機構・型・engine は無改造。**

**🆕engine 修正込みの次バッチ2本（ブロッカー特定済み）**＝①**対象ゾーン取り違え3件**（`WXDi-D09-H20-E1`／`WXDi-P04-054-E1`／`WXDi-P11-060-E2`）＝原文は「相手**エナゾーンから**カード1枚」なのに `TRASH{SIGNI, owner:'any'}`。正準修正は既存 `applyDroppedTargetDesignation` だが (i) 入口 `DESIG_BEFORE_COST_RE` がシグニ専用 (ii) `bindToStoredTarget` が `tgt.type!=='SIGNI'` で降りる (iii) executor の ENERGY_CARD × `targetsStored` 対応が未検証。⚠**色フィルタだけ足すのは禁止**（誤った対象に正しい制限を付けて誤りを固定する）＝golden で固定済み。②**`WD15-018-E1`**＝「相手エナに〈相手ルリグと共通色でない〉カードがある場合」の条件節ごと落ちて**無条件バニッシュ**。ブロッカーは `ENERGY_HAS_CARD` が `effectEngine.ts` にしか無く `execUtils.evalCondition` に無いこと＋condition 内 filter での動的ルリグ色の解決経路が無いこと。

- **（続き375）パターンA 続き374 のブロッカー2件を実装（4効果）**＝①**エナゾーン対象宣言のゾーンごと取り違え**3件（`WXDi-D09-H20-E1`／`WXDi-P04-054-E1`／`WXDi-P11-060-E2`）＝帰結が `TRASH{SIGNI,any}`＝**場のシグニを落とす別物**だったのを `applyDroppedEnergyDesignation` 新設で `TRASH{ENERGY_CARD,opponent,filter}` へ。⚠**`SELECT_TARGET_ONLY` 方式は不採用**（コスト量が対象に依存する形の機構で、ここは不要。engine 拡張3点＝うち1つは循環 import が要るのに得るのは選択タイミングだけ）。②**`WD15-018-E1`**＝条件節ごと落ちて**無条件バニッシュ**だったのを `ENERGY_COUNT_FILTER` 節で是正。⚠真のブロッカーは `ENERGY_HAS_CARD` の不在ではなく、**`matchesFilter` が `colorNotMatchesLrig` を知らない**こと＝`evalCondition` 側で cond.owner のルリグ基準に解決する処理を追加した。**この系統は OK 33→37／未配線 5→1**（残1＝`WX25-P3-003-E1` の LB 封じ STUB は別機構）。

**続き369 で照合済み・未修正の12件（次バッチの入口）**＝`WXDi-P11-044-E2`(A+C)／`WX17-Re05-E1`(過小)／
`WXDi-P03-024-E2`(A)／`WXDi-P05-072-E2`(B)／`WXEX2-55-E1`(A)／`WXK05-027-E1`(A)／`WXK05-072-E1`(A+B)／
`WXDi-P16-092-E1`(C)／`WXDi-P04-016-E3`(D)／`WX17-032-E2`(トリガー主語)／`WXK05-016-E2`(A)／`WX25-P1-TK6-E2`(原文未取得・要確認)。

### 5b. 逆翻訳機の出力品質（低優先のテール・大半消化済み）

**目標＝英語ID漏れの解消＋B層データ欠落の解消。** 手法は BUGFIXES ⑥〜⑨ で確立済み（engine 実装済みSTUBなら `decompileEffects.ts` に原文抽出/意味文を足すだけ・engine 不変・ゲートは同型★0＋原文照合のみで軽い）。**2026-07-03時点でBEHAVIOR_AUDITに主作業の座を譲ったため、手が空いたときのサブタスク位置づけ。**⚠**「367件」という数字は古い（2026-07-12続き87で実測823カードと判明＝BEHAVIOR_AUDIT等の主作業でカード母集団が増減し続けているため。件数メトリクスを信じない §3の原則どおり）。系統別内訳は`docs/_stub_leak_classification.txt`（`node scripts/_stubLeakScan.mjs`で再生成）参照。**

- ~~durational付与の「ターン終了時まで」期間注記の逆翻訳脱落（母数132枚）~~ **✅続き62で112枚復元（decompiler `restoreLeadDuration`・engine/JSON 不変）・34枚は偽陽性で正しく無注記**（詳細 BUGFIXES・原文は PLAN_DETAIL 2026-07-19退避節）。
- ~~①REVEAL_AND_PICK 文法崩れ／②LOOK_AND_REORDER 行き先欠落／③CHOOSE 圧縮／④BLOCK_ACTION 英語ID漏れ／⑤timing/icon 英語漏れ~~ **✅全て是正済（BUGFIXES①〜⑤・詳細 [PLAN_DETAIL.md](./PLAN_DETAIL.md) §5b）**。
- ~~残＝engine実装済みSTUB id の意味文化~~ **✅是正済（2026-07-07再確認）**＝全10シートの英語STUB露出は3件のみ（`VARIABLE_ENERGY_TRASH_LEVEL_BOUNCE`／`POWER_PLUS_BANISHED_POWER`／`OPP_LRIG_DECK_TO_LRIG_TRASH`＝いずれも§6.3機構待ち登録済み）。
- [ ] **残る単発テール（原文とJSON構造がズレた混線／未構造化STUB）**＝**2026-07-02時点で「1 effect=1クリーンSTUB」で原文抽出できるものは全消化済み（444→367→その後の作業でカード母集団が変動し2026-07-12実測823・続き87で機械分類済み）**。effect構造そのものが原文とズレた混線で、1つのSTUBを原文化しても同 effect 内の他のズレが残り原文一致にならない＝decompilerの原文抽出では対応不能なものが大半。**effects JSON の再parse（機構実装・データ層修正）が本筋＝Opusタスク13**。系統別内訳（16テーマ・カード数の多い順＝デッキ操作系184／パワー修正系165／手札系102／トラッシュ系75／対戦相手コスト系63／エナ系50／ライフ系48／シグニ配置系48／ルリグ系36／能力付与系31／ガード・アタック制限系26／ソウル・アーツ系15／ウィルス系10／色・クラス系4／ゲーム除外系3／チャーム系1／その他54）は`docs/_stub_leak_classification.txt`参照（続き87・Sonnet）。進め方＝1カードずつ effects JSON を原文どおりの構造に手修正→逆翻訳が原文一致するか確認→smoke/golden/fuzz→push（**原文コピーでの一括潰しは禁止**＝実装未完成を隠蔽し検証目的に反する）。
- ~~Z-2：BET系の表現描画~~ **✅完了（続き86・詳細は §3 Sonnetタスク7）**。engine 側（ベット判定自体の実装状況）は変更なし＝表現のみの改善。
- ~~B層：JSONデータ欠落の補完~~ **✅是正済（続き33-36・2026-07-07再確認＝全10シートで「then/destination 欠落」0件）**。例外は§6.3登録済み（WDK07-E15／WXDi-P07-010／WXDi-P03-005／WX26-CP1-100）。
- [ ] **🆕生JSON漏れ（`【シャドウ:{"levelGte":3}】` 形）72件**（2026-08-07 続き366 で観測）＝`シャドウ:{…}` は**JSON データ側の符号化**（engine もこの文字列を読む）なので、表示だけ日本語化するには decompiler に整形器を足す。`levelGte/levelLte/powerLte/cardType/color` の素直な形のほか `selfPowerHalfLte` `lrigTrashArtsColor` `downerLrigLevel` `declaredNumberPowerEq` `declaredColor` `artsCostLte` `selfColor` `selfPowerLte` など**約20種**あり、**1種ずつ原文照合が要る**（【シャドウ（レベル3以上）】等の原文表記に合わせる）。⚠英語**条件**ID漏れは続き366 で残0にした。
- [ ] **完了判定**：grep 走査で英語ID漏れ0 ＋ シートごとランダム20枚の原文照合 spot-check で一致を記録 → **§2 DoDの4つ目にチェックを入れる**。

---

## 6. フェーズ2残作業：実行の正しさ（P2）

**目標＝「表現はあるが実行が近似/未実装」の解消。** engine を触るので毎回 smoke・golden・fuzz（＋バグは golden に1件足してから直す）。

### 6.1 未実装action型 worklist（behavior-audit 段階4で発見・完全no-op・2026-07-03）
**✅全型クローズ＝残型0（2026-07-19時点。最後の `PREVENT_DAMAGE`／`COST_SUBSTITUTE` は続き204/204b で実装）**。当初14種42効果からの逐次実装の経緯・「修正層は effectType で決まる」の教訓は PLAN_DETAIL §6.1・BUGFIXES（続き116/122/123/202/204）参照。

### 6.2 意味照合監査（semantic audit）の worklist（2026-07-03新設・仕組みは [SEMANTIC_AUDIT.md](./SEMANTIC_AUDIT.md)）
原文 vs effects JSON を LLM で意味比較する検査パイプライン（`scripts/semanticAudit{Extract,Run,Triage}.mjs`）。パイロット（stub群30枚精査）で precision約78%・30枚中17枚に確定バグ（同型★0・smoke/fuzz緑を通過済みのカード）。

- [x] **系統①（相手デッキ削りの owner 取り違え）／系統②（GRANT_PROTECTION `count:ALL`）／スケールアップ（stub群 2,401枚 全数監査）＝✅完了**。完了行の原文は [PLAN_DETAIL.md](./PLAN_DETAIL.md)「2026-08-02 整理②」節（2026-08-02 退避）。findings は Opusタスク12 (xxvii)(xxviii)(xxix) に集約済み。
- [ ] **パイロット findings の個別修正**（真バグ39件・要追精査3件＋stub群残20枚・clean群50枚の findings）＝`node scripts/semanticAuditTriage.mjs <outDir>` で精査→1カードずつ標準ワークフロー。

### 6.3 残・大型機構（個別カード・機構待ち）

> このセクションは機構台帳＝**現存の残作業は下記 F／G／K ＋ E-2 の defer 3件に集約**（🏁**C は 2026-08-09 続き394〜397 で残0クローズ**＝計37効果／🏁**E-1「引用付与の忠実化」は続き398〜399 で残0クローズ**／🏁**E-2 は続き400〜402 で tractable を全消化し、残3件は根拠つき defer**／🏁**J 群は 2026-08-08 に残0クローズ**）。消化済み機構の実装詳細（フラグ・ファイル・commit）は BUGFIXES 各日付が一次記録。完了行の原文は [PLAN_DETAIL.md](./PLAN_DETAIL.md)「2026-08-02 整理②」節。

**残作業（現存項目のみ・完了項目は PLAN_DETAIL へ退避済み）**
- **🏁 E「引用付与の忠実化」追加在庫＝2026-08-09 続き398〜399 で残0クローズ**（`WX20-036-CB-E1`／`WX24-P2-010-E1`）。詳細は BUGFIXES 同日2件。**旧記述（「付与先を source として引用能力内の自己除外・攻撃制限コストを評価する共通機構が必要／外側 action の `excludeSelf` では reader に届かない」）は投入前実測で否定された**＝(a) engine は**既に holder を source として `excludeSelf` を評価済み**（`effectEngine.ts:4777` の `GRANT_PROTECTION.subjectFilter.excludeSelf`／`:1814` の `POWER_MODIFY`）。真因は parser で、引用内側は `rawText`→`parseBlock` で**単独再パースされ結果を上書きする**（`effectParser.ts:10174-10188`）ため外側 fixup が届かないだけだった。(b) 「ライフバーストではない対戦相手のシグニの効果を受けず」は**新語彙0で書けた**（`WXK11-021-E1` が完全なテンプレ）。⚠**engine 側は1点だけ不足**＝`collectEffectImmuneSigni` が action 直下の `GRANT_PROTECTION` しか読まないため SEQUENCE 再帰を追加（**5条件の完全一致ゲート**で限定＝SEQUENCE 内 `GRANT_PROTECTION` の既存8効果は挙動不変）。(c) `WX24-P2-010-E1` は「あなたの他のシグニ2体を場からトラッシュに置かないかぎりアタックできない」＝**解除コストつきアタック制限**を新設（`BLOCK_ACTION.attackCost.fieldTrash` ＋ `signi_attack_field_trash_costs`）。⚠**軸の取り違えに注意**＝`keyword_grants['アタックできない']`（`cannotAttackSigni`）は**人間のアタックボタン生成1箇所しか読まず CPU に効かない**。per-signi の実効軸は `blocked_actions:'ATTACK:<id>'`、支払いは**人間3経路と CPU が共通で通る `performSigniAttack`**（別経路は `handleFlipAttack` のみ）。
- **🏁 C. 「この方法／この効果で〜した場合」の後段条件が live で丸ごと脱落（＝無条件実行）＝2026-08-09 続き394〜397 で残0クローズ（計37効果・Codex 委譲4連投）**。詳細は BUGFIXES 同日4件と PLAN_PROGRESS 先頭。**旧記述（「fresh 残42効果」「共通ブロッカーは前段が `lastProcessedCards` に記録しないこと」）は投入前実測で3点とも否定**＝(a) `docs/_partial_report.txt` は **fresh parser の出力**を測る計器で live の実害を測らない。**生成元（CSV原文×live JSON）から数え直した母集団は60カード**。(b) `lastProcessedCards` の writer は engine に**153箇所**あり完備（`execTrash{DECK_CARD}` は `effectExecutor.ts:1228`）＝機構待ちではなく **parser が条件を1つも生成していなかった**。(c) 条件語彙も既に揃っていた。**消化＝第1波11（効果内トラッシュ）／第2波11（公開・手札に加える）／第3波11（手札捨て・エナ配置）／第4波4（裏向きフリップバック）。**
  - ⚠**この家族に手を出すときの必須知識＝「記録する」の書き方が前段ごとに3通り**（取り違えると恒久 no-op でゲートに一切映らない）：`execTrash` は無条件に書く／**`REVEAL_AND_PICK` は `recordRevealed: true` のオプトイン**（`effectExecutor.ts:4533`）／**`LOOK_AND_REORDER` は `needsInteraction` を返すだけで記録は `resumeLookAndReorder`（`:6791`）＝UI ポーズを跨いだ後**。さらに**コスト由来の捨て札／エナトラッシュは engine ではなく `BattleScreen.tsx` が `last_cost_trashed_cards`／`last_activated_discard_count` に書く**（writer は `src/screens/battle/costs.ts`）。⚠**「公開された全カード（`visible`）」と「手札に加えたカード（`picked`）」は別集合**。
  - **🏁 第4波（続き397）＝裏向きフリップバック4カード**（`WXDi-P09-034-E1`／`WXDi-P05-037-E2`／`WXDi-P01-040-E2`／`WXDi-P09-009-E3`）。**「条件脱落」ではなく機構が空回りしていた**（同じ解決内で裏返して即座に表へ戻す＝裏向きが0秒）。🔑**`PlayerState.face_down_signi`（`string[]`）はその STUB 以外に消費者が0件＝ゾーンが埋まったままで「同じ場所にシグニがない」が永久に偽**。`field.facedown_signi`（ゾーン配列・inert・描画/permute/boardDiff 済み）へ移送する `src/engine/facedownSigni.ts` を新設し、**ターン終了3経路（`doPhaseAdvance`／`confirmEndDiscard`／`cpuTurnAction`）で両プレイヤーを解決**（4枚中2枚は**相手のシグニ**を裏返すので「自分の場だけ直す」既存形の写経は永久 no-op になる）。`WXDi-P09-009-E3` の二重遅延（ターン終了時に裏向き→**次の相手アタックフェイズ開始時**に復帰）は `turn_end_facedown_all` ＋ `pending_opponent_attack_facedown_returns` で実装＝**`delayed_triggers` が THIS_TURN 限定でもターン跨ぎは表せる**（先例は `pending_facedown_flip`／`triggerCollect.ts:3589`）。**残2枚は別機構へ移送**＝`WX15-067`（ウィルス除去によるコスト減）／`WXDi-P13-004A`（離場置換＝§6.4 F-3 の家族）。**抽出計器の偽陽性2枚**（`WX20-053-E2`／`WXEX2-21-E1`）は既に正しい。
- **🏁 E-2. 個別カード機構待ち＝2026-08-09〜10 続き400〜402 で tractable を全消化。残3件は「実装しないのが正しい」defer**（下記）。**消化＝** ✅`WX25-P3-023-E2`（続き400）＝起動即発動→**2ターン持続の監視能力**へ。在庫の「2ターン持続＋相手手札移動 collector が必要」は**両方 stale** で、`ON_HAND_ADDED`（`triggerCondition.handOwner`／`byOpponentEffect`／`excludeGrowPhase`。テンプレ `WX25-P2-063-E1`）＋ `GRANT_LRIG_ABILITY{duration:'UNTIL_OPP_TURN_END'}` で**新語彙0**。⚠**構造だけ直すと恒久 no-op**＝`collectHandAddedTriggers` が付与ストアを走査していなかった。／✅**permanent 引用付与4効果**（続き401）＝母集団は CSV 全文で「このゲームの間」×「「…」を得る」の**4枚だけ**。`WX15-002-E2` は**既に `permanent:true` で修正不要**、`WXK07-001-E1`（内側は honest defer・専用の未実装 STUB を新設）、`WXDi-P03-003-E1`（**新 `GRANT_PLAYER_ABILITY`＋`game_granted_effects`**＝「ルリグ」でなく「あなた」が得る）、`WXK03-001-E3`（**新 `GrantLrigAbilityAction.targetOwner`**＝相手ルリグへの恒久付与）。3経路のターン終了を `clearTurnGrantedLrigAbilities` に統合。／✅`WX20-028`（続き402）＝**多重アクセ**。死語彙 `ACCE_LIMIT_99`/`ACCE_LIMIT_2`（`src` に消費実装0件）を既存 `MULTI_ACCE_LIMIT` へ寄せ、collector を「上限N／ALL／旧値なし=2」対応へ拡張。**`signi_acce` を `(string|null)[]` → `(string[]|null)[]` へ型移行**（105参照・19ファイル。tsc が全参照を落とすので追従漏れを機械的に示せる）。同じ死語彙だった `WX16-031-E1`／`WXK04-053-E1` も検証側で原文照合のうえ採用（census −2）。／✅**`WDK14-013` は実測で消化済みと判明**（在庫「残は複数候補時のプレイヤー選択のみ」が stale＝`SigniOnPlayCostModal.tsx:581-587` が候補を描画して選ばせ、`BattleScreen.tsx:11750` が選択を渡している。古いコメントだけが残存）。**✅WX15-016（続き282）／WXDi-P06-031（続き288）／WXDi-P08-037（続き290）／WXEX1-08（続き278）も消化済み**（詳細は PLAN_DETAIL）。
  - **📋 残3件＝いずれも根拠つき defer（着手前にこの理由が今も有効か再判定すること）**：(a) **`WX17-044`＝⚠2026-08-10 再判定＝先行ブロッカーだった §6.4 は消化済（続き403）だが、このカードは**依然として別要因**で止まっている**＝①`WX17-044-E1` に `trashActivated` が立っておらず（parser が「トラッシュにあるこのカードを〜」の【起】をトラッシュ起動と認識していない）②本体アクションが `ADD_TO_FIELD` ではなく**【トラップ】を表向きにして発動させる**（現行の逆翻訳は別物になっている）③コストの `trashExile.self` は `trashActivateCost.ts` の対応キーに入れていない（使う効果が0件のため未実装のまま置いた）。**着手時は parser 側（①②）から。UI は③を足すだけで載る。**(b) **`WXDi-P05-006` choice①＝着手禁止**（ピースカットイン割込み基盤）。(c) **`WX20-Re20`＝一体で要る**（選択数依存コスト・能力なし filter・任意複数配置UI・同一 instance 群のターン終了時 trash）＝部分実装しない。
- **K. `manualEffects.ts` ↔ live JSON の乖離（2026-08-08 続き381 発見・続き382 で計器化＆消化）＝残 15 効果**＝**`build:effects` は live 側 `parseStatus:MANUAL` を不可侵にするので、`manualEffects.ts` を後から直しても live には永久に届かない**（`buildEffectsJson.ts:187`「手修正は不可侵」＝**JSON 直編集**の保護が意図だが、`mergeManualEffects` の出力も MANUAL なので新しい manual エントリも同じ網に掛かる）。`_held_review` にも `_partial_fresh` にも出ない**第3の死角**。**計器＝`npx tsx scripts/censusManualDrift.ts`**（明細 `docs/_manual_drift.txt`／`--date` で方向判定 `docs/_manual_drift_dates.txt`／`--card <ID>` で1カード完全diff／`--adopt <effectId,…>` で**効果単位**同期）。**ゲート＝goldenTest の「§6.3 K トリップワイヤ」**＝`MANUAL_DRIFT_KNOWN` に無い乖離が出たら即 FAIL・解消したのにリストに残っていても FAIL（＝リストは worklist であって許可リストではない）。⚠🔴**実測値は 52 効果／46 カード**（続き381 の速報 105/427 カードは**素朴な JSON 文字列比較＋キー順依存**の過大計上で、続き382 に計器を作って実測し直した値が正）。**続き382 で 37 効果を同期して残 15**。⚠**一括同期は不可（双方向）**＝(a)`LIVE_ONLY`/`LIVE_RICHER` は live のほうが新しい（`PR-426-E3` 等の後付け手修正）(b)**同じ効果でも項目ごとに新旧が違う**＝`WX16-023-E1`/`WXK10-008-E1` は action は manual が新しいのに **timing は manual が退化**していた（CSV の `Timing` 列より狭い `["ATTACK"]`）＝`--adopt` は timing が変わると既定で中止する（`--allow-timing-change` で明示解除）。(c)🔴**`parser由来` の効果に日付判定を使ってはいけない**＝「manual 側の日付」はそのカードのブロックが触られた時刻でしかない。実測で日付が MANUAL_NEWER と言った parser 由来5件は**全件 live のほうが正しかった**（`WX22-013-E2` は fresh が2択を DRAW 1本へ平坦化＝退化）＝計器はこれを `PARSER_REVIEW` として別枠に出す。**残 15 の内訳＝`PARSER_REVIEW`（通常の目視レビュー案件）＋ manual 定義の `UNDATED` 8／`SAME_TIME` 2**。
- **F. 保留**（core改変が過大リスク）＝WXDi-P00-026（さんばかルリグ付与・ルリグ再アタック未実装がブロッカー）／47枚の【使用条件】【チーム】（正規デッキ常時成立で機能等価＝保留妥当）。
- **G. 置換else系統の残（続き269・§3タスク5から正式送り）**＝**B 2件の置換else部分は✅続き289で消化**。SPK06-01-E1 は追加赤0/2/4の三択を同一対話で保持し、対象数1/2/3を排他的に実行（付随するレイラのコイン技回数・次回コスト軽減は既存基盤が無く別途defer）。WXK06-032-E1 は既存 `refresh_count_this_turn` を双方参照し、最初に選んだ同一対象へ－4000/－12000を排他的に適用する。**残はC 13件**（反復、引用能力／ルリグ能力付与、複雑CHOOSE、支払い系ルール等）。CのWXDi-P02-042-E1を再確認したが、相手側のターン中手札捨て枚数を読む条件軸が無いためhonest defer。effectId 全明細と不足機構は `docs/_replace_else_triage.txt`。
- **✅ 完了機構（A 動的コンテキスト追跡／B BANISH_REDIRECT／D レゾナ出現条件トリガー／H タスク12(xxii) の不足機構／J-3 ライフクロス閾値遷移／I `WX25-P3-028-E2`／「正面」サブ機構／消化済み機構の台帳）は [PLAN_DETAIL.md](./PLAN_DETAIL.md)「2026-08-02 整理②」節へ退避**（2026-08-02）。実装詳細の一次記録は BUGFIXES 各日付。**下に残るのが現存の残作業＝C／E／F／G＋J（J-1/J-2/J-4/J-5）と、H・I が残した横展開の教訓**。

- **⚠H が残した横展開の教訓＝UNKNOWN を実装するときは fresh parser の出力を先に測る。** H4 は fresh が主語を見ない `STUB DEPLOY_RESTRICT` を既に吐いており、live の `UNKNOWN` だけが「対戦相手は1体まで」への意味反転を止めていた（採用した瞬間に過剰実行へ反転する型のドリフト）。
- **⚠I の潜在結合（実害なし・将来の落とし穴）**＝`executeSigniOnPlay` の `beatZones`（`Set<number>`）が **`beat_signi` の「場ゾーン index」と `beat_signi_from_trash` の「トラッシュ index」で同じ集合を共有**している。実データで両コストを併せ持つ効果は**0件**（全数走査）なので現状は実害なしだが、将来併記カードが出ると支払いが `ok:false` で**無言 abort** する。併記が現れたら選択集合を分離すること。
- **⚠I の付与ストア走査は `activeCondition` を評価しない**（`effectEngine.ts:3137-3142`）。今日の唯一のエントリ `WX24-P3-069-E1-G` は無条件なので実害なしだが、条件付き CONTINUOUS を付与する効果を足すときは effectsMap 側と同じ `checkActiveCondition` を通すこと。
- **⚠honest defer 継続＝`WX20-Re20`**（選択数依存コスト・能力なし filter・任意複数配置UI・同一instance群のターン終了時 trash が**一体で**要る＝部分実装しない）。

- **🏁 J. timing collector 不在の13効果（2026-07-31・タスク16 の `[C]` から正式送り）＝🏁2026-08-08 に残0クローズ（J-3→J-2→J-5→J-1→J-4 の順に5家族すべて消化）**＝原文が【自】なのに**そのイベントを検出する collector が engine に存在しない**群。現在は `timing:[]` で安全停止中＝**放置しても過剰実行は起きない**（着手優先度は低いが、機構台帳としてはここが定位置）。判定根拠は `docs/_timing_census_triage.txt`「2026-07-31 [B]群の停止理由 機械再検証」節に `ファイル:行` つき。**5家族に束ねると1家族＝1バッチで複数枚が同時に開く**：
  - **✅J-1 他能力の発動監視（2効果）＝2026-08-08 消化（続き383）**＝新 timing `ON_ABILITY_ACTIVATED`。⭐**「発動した瞬間」の唯一の funnel は `BattleScreen.resolveStackNext` の `shiftQueue` 直後**（`shiftQueue` の呼び出し元はこの1箇所だけ＝人間/CPU・【出】/【自】/LB の全経路をここで押さえられる）。`initStack`/`pushToStack` は BattleScreen 内で**113箇所**あり個別配線は不可能だったので、投入時ではなく**解決開始時**をイベント定義にした（投入されても turnGate 等で落ちるエントリを「発動した」と数えない利点もある）。限定は `triggerCondition.activatedAbility*`＝`Owner`（self/opponent）／`Kind`（`AUTO`＝【自】・`ON_PLAY`＝【出】）／`Eichi`（activeCondition に `EICHI_LEVEL_SUM` を含む）／`FromFieldSigni`（発動元が持ち主の場のシグニ）。`WX19-066-E1`（あなたの【自】の【英知】能力）／`WXEX1-77-E1`（対戦相手の場にあるシグニの【出】能力）。⚠**監視の連鎖を作らない**＝発動した能力自身が `ON_ABILITY_ACTIVATED` なら collector が無視する。⚠**《ターン1回》は `actions_done` へ書き戻す**（既存 collector 群と同じ規約。書き戻さないと同一ターンに何度でも再発火する）。
  - **✅J-2 付与・離脱イベント（4効果）＝2026-08-08 消化（続き380）**＝`ON_ACCE_TO_TRASH`／`ON_SOUL_ATTACHED`／`ON_CARD_ATTACHED` の3 timing を新設し、`boardDiff.ts` の set-diff detector（`countAcceToTrash`／`detectSoulAttached`／`detectCardAttached`）→`triggerCollect.ts` の collector（`collectAcceToTrashTriggers`／`collectAttachedTriggers`）→`BattleScreen` の中央 diff funnel（ON_BANISH/ON_CHARM_TO_TRASH と同じ場所）まで一本に通した。`WXDi-D07-004-E1`（あなたのシグニ1体に【ソウル】＝any_ally・ルリグ側）／`WXDi-D07-019-E1`（このシグニに【ソウル】＝self）／`WXK10-049-E1`（このシグニにカードN枚＝チャーム/アクセ/ソウル横断の汎用付与・minCount）／`WXEX2-19-E1`（あなたの【アクセ】N枚がトラッシュ＝any_ally）。**併せて `THIS_CARD_HAS_ATTACHED` 条件を新設**し、「このシグニにカードが付いている場合」が丸ごと落ちて**無条件【ランサー】**だった `WXK10-049-E2` を是正。⚠**detector は本体が前後で同一のゾーンだけを拾う**（ライズ/場出しでソウル持ちに入れ替わったのを「付いた」と誤検出しない）。⚠**既存 `ON_ACCE` は別経路**（`checkAndFireOnAcceTriggersForOwner`）のまま＝種別指定つきの regex を先に置いて奪わない。census 919→916。golden +6件（collector 3／boardDiff 2／parser 1）。
  - **✅J-4 フェイズ／アタック終了 timing（2効果）＝2026-08-08 消化（続き384）＝これで J 群は残0**。⚠**PLAN のこの行が挙げていた「CPU 側の収集が面で欠けている」は古い警告だった**＝タスク12(lxvii) が 2026-08-04 に残0クローズ済みで、`collectTurnTriggers`（人間）／`collectCpuTurnTriggers`（CPU）が既に対称に揃っていたので、timing を union に足すだけで両経路に載った。**着手前に台帳の警告を実データで検証すること**（J-5 の `WXEX1-41` と同じ教訓）。**(a)`ON_ATTACK_PHASE_END`**＝`ATTACK_LRIG→END` 遷移で発火（既存 `ON_LRIG_ATTACK_STEP_START` が `ATTACK_SIGNI→ATTACK_LRIG` で発火するのと同じ場所）。**(b)`ON_ATTACK_END`**＝個別アタックの終了＝`resolvePendingSigniBattleFor`（バトル解決 Phase2）の末尾＝**`dealtSigniDamage` が既にそこで確定している**ので `triggerCondition.attackDealtNoDamage`（そのアタックでダメージを与えていない場合）をそのまま判定できた。⚠近似＝この後の【ライフバースト】解決は「アタック終了」に含めない。**(c)新条件 `SIGNI_LEFT_FIELD_THIS_ATTACK_PHASE`**＋新フィールド `signi_left_field_this_attack_phase`（アタックフェイズ開始時にリセットし、離場の2経路＝効果解決の中央 diff とバトル解決で追記）。🔴**(d)timing を配線すると action が実際に走るので、action 側の既存誤 parse も同時に直す必要があった**＝`WXK11-018-E2` は「このシグニより低いレベルを持つあなたのシグニ1体」が汎用アナフォラ解決で `thisCardOnly`（＝自分自身をアップ）に化けており、`WX24-P2-075-E1` は「このシグニを場からデッキの一番下に置いてもよい」が無関係な STUB `LRIG_UNDER_CARD_OP` に化けていた。**`manualEffects.ts` で是正し §6.3 K の `--adopt` で live へ同期**（この2件は新設したトリップワイヤが即座に検出した＝ゲートが機能することの実証）。
  - **✅J-5 単発（3効果）＝2026-08-08 消化（続き381）**。⚠**台帳の3件のうち1件は既に消化済みだった**＝`WXEX1-41-E1`「【トラップ】Nつが設置されたとき」は `ON_TRAP_SET` として Batch D／タスク(lxx) で配線済み（この行が古かった）。残り2件を消化：**(a)`SP27-007-E1`「あなたか対戦相手が《コインアイコン》を得たとき」**＝新 timing `ON_COIN_GAINED`（既存 `ON_COIN_PAID` の逆方向）。`boardDiff.countCoinsGained` ＋ `collectCoinGainedTriggers` を、**効果解決の中央 diff ＋ グロウ／アシストグロウ／CPU グロウ**の各獲得サイトに配線（`ON_COIN_PAID` が支払いの全サイトを押さえているのと同じ形）。⚠獲得枚数は**上限5クランプ後の実増加**をサイト側から直接渡す（グロウは支払いと獲得が同じ差分に同居するので before/after 差では取りこぼす）。**(b)`WXDi-P11-010B-E1`「《夢限　-Q-》から《夢限　-A-》になったとき」**＝**collector 不在ではなかった**。既存 `ON_LRIG_FLIP`（`collectLrigFlipTriggers`＝センタールリグの `card_identity_overrides` 変化で検出・BattleScreen 配線済み）が受け皿で、**利用者0件の死んだ受け皿**だっただけ。真の原因は 🔴**live JSON の陳腐化**＝`manualEffects.ts` には A面の産出 stub（`MUGEN_Q_RESET_AND_FLIP`＝`execStubPart1.ts:25` に実装済み・golden 済み・`verifyBattleDrive` シナリオまである）とB面の `ON_LRIG_FLIP` が**両方書かれているのに live には届いておらず**、A面は `UNKNOWN`／B面は `timing:[]` のまま機構全体が死んでいた。live を `manualEffects.ts` へ同期して復旧し、**live 側を直接 assert する golden** を足して再発を止めた（従来この golden は `mergeManualEffects` をテスト内で再適用して陳腐化を迂回していたため、ゲートが1件も検出できなかった）。


### 6.4 オープンな実装課題（機構・基盤）

> **消化済みは1行サマリも含めて [PLAN_DETAIL.md](./PLAN_DETAIL.md) へ全文退避**（実装詳細＝「2026-08-12 整理⑧」／1行サマリ欄＝「2026-08-13 整理⑨」）。
> **ここは生きている worklist だけ**を置く。番号 `O-n` は着手順ではなく**参照用の固定ID**（消化しても番号は再利用しない・欠番はそのまま）。
> 一次記録は [BUGFIXES.md](./BUGFIXES.md) の各日付。**着手前に §3-1 のとおり在庫を実測すること**＝
> 2026-08-12 の整理では消化済みなのに残っていた行が2つあり、2026-08-13 の O-3 では**簿記の「約16効果」が実測38効果**だった。

**■ 未消化 worklist**

| ID | 項目 | 規模 | ブロッカー／次の一手 |
|---|---|---|---|
| **O-1** | **CPU AI の拡張**（→§8） | 大 | メインフェイズ AI（アーツ/スペル/【起】の能動使用・グロウ時トリガー）未実装。CPU 召喚の ON_PLAY 解決は「全配置後まとめて」の近似（人間は1枚ごと）。トラッシュ起動の CPU 使用も未。**§6.4 で唯一の大物＝単独フェーズ扱い** |
| **O-3** | **「次のターンの間」系統の残り** | 26効果（受け皿8種） | 🏁続き448/450（採用14）／🏁続き453＝`REMOVE_ABILITIES.until` の死フィールド解消（7効果）／🏁**続き459＝`LRIG_GROW_RESTRICT` ゴミ箱の解体**＝未パース節の受け皿8つを固有 `DEFERRED_*` へ分割し、**隠れていた26効果を A群に可視化**（＋同族の実バグ3件を修正）。**在庫は `npm run census:stubs` の A群で常時見える**＝内訳は `DEFERRED_UNPARSED_THIS_TURN_OPP_CLAUSE` 7／`_NEXT_OPP_TURN_CLAUSE` 5／`_THIS_AND_NEXT_TURN_CLAUSE` 4／`EXTRA_ATTACK_PHASE` 2／`NEXT_OPP_ATTACK_PHASE_START` 2／`SELF_RESTRICT_THIS_TURN` 2／`UNTIL_NEXT_MAIN_PHASE_CLAUSE` 1／`SKIP_NEXT_TURN` 1／`ATTACKED_SIGNI_TARGET_BY_KEY_TRASH` 1／`SEED_BLOOM_BOUNCE_OCCUPANT` 1。**機構ごとに独立して着手できる**。⚠**期間だけ直すと「誤った対象の効果」が長持ちする**＝対象軸が壊れている札は据置（`WX11-038-E2`＝「次のターンの**メインフェイズ**の間」はフェイズ限定の受け皿が無く据置） |
| **O-4** | **UNKNOWN の残り** | 単発中心 | 代表＝`WXDi-P09-036-E1`「**あなたと対戦相手は**自分のデッキの一番上を公開し…どちらも【ライフバースト】を持っているか」＝**両者同時公開＋比較**の別機構。他は1カード1機構の単発。⚠`WXK07-034-E1` の選択肢①「デッキにあるシグニのレベルは4になる」も UNKNOWN のまま（②は続き444 で消化済み） |
| **O-5** | **複数枚の任意配置UI** | 1効果 | `WX16-Re18`「レゾナを**２枚まで**」＝`SUMMON_RESONA_FROM_LRIG_DECK` が1枚しか出さない。**過剰ではなく過少** |
| **O-6** | **`MANUAL` 不可侵で live に届かない改善** | 1効果 | `WX25-P3-038-E1`＝fresh parser では「能力を持たない」の改善が出るが `PRESERVE_STATUSES` で届かない。**手で MANUAL を更新するか AUTO 採用へ切り替えるかの判断が要る**（手順は §6.3 K／PLAN の UNKNOWN 節） |
| **O-7** | **二ゾーン交換の据置1件** | 1効果 | `WX25-P2-058-E1`＝エナからの交換だが、原文の**アタック終了時タイミング**と**《アイヤイ★クイーン》条件**が現行木から欠落。**交換節だけの部分採用はしない**（非採用を golden で固定済み） |
| **O-8** | **強制アタックの残り** | 2件 | (a)**アタック順**（「他のシグニより先にアタックしなければならない」）＝現行はフェイズを進めさせないだけで、後回しにしても止まらない（`FORCE_FRONT_SIGNI_ATTACK` も同じ近似）(b)`WX12-010-E3` 2段目＝`DEFERRED_UP_REARRANGED_MOVED_SIGNI`（`resumeRearrangeSigni` は移動済みを把握済み＝**要るのは「どれをアップするか選ぶ」対話だけ**） |
| **O-9** | **「対戦相手は〈コスト〉てもよい」の残り** | 2件 | (a)**相手側の可変枚数コスト**（`WXDi-P09-064`「手札を２枚**まで**捨ててもよい。捨てた1枚につき1枚引く」）＝`OPPONENT_PAY_OPTIONAL` が all-or-nothing なので**0枚か2枚**に丸めてある (b)`WXDi-P07-010-E2`＝**繰り返す遅延ゲート**（`DEFERRED_FACEDOWN_RELEASE_BY_OPP_PAYMENT`） |
| **O-10** | **明示 defer の棚卸し** | 14 id（16件） | ⚠**2026-08-13 実測値**（O-2 の消化で 16→14 id）。`npm run census:stubs` の A群に `DEFERRED_*` として可視化済み。**理由が「先にやることがある」型は前提が消えたら着手できる**（例＝`DEFERRED_UNDER_CARD_AS_ENERGY_COST` は funnel 完成後に実装できた）。**定期的に前提を再判定する** |
| **O-11** | **計器の未仕分け** | 8件 | `verifyEffects` の **アクション[STUB代替?] 5件／[要確認] 3件**（`WX09-Re01` の `DRAW_PER_FIELD_COUNT` を「DRAW が無い」と言う等、**名前照合の誤検出が混じっている見込み**）。⚠**過剰報告する計器は無いより悪い**（続き407/408 の教訓）＝仕分けて誤検出はルールで潰す |
| **O-12** | **C群＝表示だけの穴（逆翻訳）** | 259箇所 | engine は動くので**無言バグではない**。(a) 単発は `scripts/decompileEffects.ts` の `miscStubMap` に日本語文を足す (b) ハンドラ直前コメントを日本語説明にして `node scripts/genStubsMd.mjs`。**優先度は低い** |
| **O-13** | **実機UI未検証（→§7送り）** | 数件 | エナ支払い元 funnel（14サイト＋14モーダル）ほか、続き409〜413 の A群実装（相手ルリグデッキ選択モーダル・新規 CHOOSE 等）。🆕**続き452＝相手応答モーダルの実表示**（PvP の相手側／CPU 自動応答）＝`WXEX2-84-E2` が最も踏みやすい。🆕**続き453＝ターン境界を跨いだ能力喪失**（次ターンでの発火抑止／2ターン後の復帰）。**ヘッドレスでは検証できない層** |
| **O-14** | **申告済みの原文不一致（スコープ外で据置）** | 2件 | `WX15-003-E3`＝「アーツとスペルと【起】能力を使用できず」が未表現／`WXDi-P08-010-E3`＝後半は本来「そのターン終了時、**そのターンにアタックしていた**シグニだけ」なのに**即時の全バニッシュ** |
| **O-15** | **手札からの選択機構** | 1効果 | `WXEX1-44-E2`＝原文「**手札から**《アクセアイコン》を持つシグニ2枚まで」に対し `PLACE_ACCE_SIGNI_TO_ENERGY` は**場のアクセゾーンを全部**エナへ送る。⚠**アクセは CardClass ではない**（専用フィルタ `hasIcon:'アクセ'` は既にある）＝**要るのは手札選択の機構だけ** |
| **O-18** | 🆕**ボタン生成側に無い封じゲート（押せるが無反応）** | 2種 | 2026-08-13 続き460 で**手札スペルの「発動」に `isActionBlocked('USE_SPELL')` が無い**のを実機検出→修正したが、**同じ箇所は `PLAY_COLORLESS`（無色のスペル封じ）と `BLOCK_NON_WHITE_SPELL` も見ていない**（`getMyHandCardActions`＝`BattleScreen.tsx:7373` 付近）。実行入口 `castSpell`（`:6769`）にはガードがあるので**ルール違反にはならず、押しても無反応になるだけ**＝優先度は低いが**無言の no-op** なので直す価値はある。⚠検証は `spellArtsBlockedUiHidesUseButtons`／`spellArtsUnblockedUiShowsUseButtons` と同じ**負方向＋対照の対**で書く（非表示だけでは `costOk`/`condOk` と区別できない） |
| **O-19** | 🆕**watcher 文の `triggerScope` を parser が明示していない** | 推論依存 | 2026-08-13 続き463＝`inferTriggerScope`（`effectParser.ts` の runtime 補完）は**カード全文しか見ておらず「どの文からこの effect が生まれたか」を知らない**。そのため【自】…場に出たとき（watcher）と【出】が同居するカードで**自身の【出】に watcher の scope が付く**（実測5枚が `any_ally` 化＝味方シグニが出るたびに発動）。暫定対処＝**カードが `【出】` を持つなら ON_PLAY の推論をしない**ガードを入れた（副作用＝watcher 側が `self` のまま残るカードがある＝**修正前と同じ状態**で新たな退化ではない）。⭐**恒久解＝parser が watcher 文を parse した時点で `triggerScope` を書く**（推論を捨てられる）。⚠**同型が `ON_TURN_END` で41効果/40カードの無言バグを生んでいた**（続き463 で修正）＝**この推論は計器に映らない事故を起こす層**なので優先度は低くない |
| **O-20** | 🔴🆕**実行時にカード全文 regex で意味を決めている箇所（誤った能力に紐づく）** | **21件**（棚卸し済み・全件に根拠カードあり） | 2026-08-13 続き464 で **生テキスト読取298箇所を全数分類**＝A（単なる存在チェック・安全）18／B（文脈依存だが現行 live では一意）258／**🔴C（別の能力の文に一致して意味が決まる）22**。**C は全件に「誤爆する live カード」を名指し済み**。1件（追加ターンの所有者反転）は続き464 で修正、**残21件が在庫**。⚠**この層の事故は golden も census も緑のまま素通りする**（続き459 の `LRIG_GROW_RESTRICT`／続き463 の `inferTriggerScope` はどちらも全ゲート緑だった）＝**計器に映らない**。⭐**共通の直し方＝「カード全文」ではなく「その効果を生んだ能力ブロック」を渡す**（source 配線）。個票は下記。 |

**■ O-20 の個票（2026-08-13 続き464 の棚卸し・残21件）**
> **共通の真因**＝ハンドラが `cardMap.get(sourceCardNum).EffectText` の**カード全文**を regex で読み、**その効果を生んだ能力ブロックを知らない**。
> **共通の直し方**＝「どの能力ブロックから来たか」を ExecCtx か action へ載せて渡す（source 配線）。**1件ずつ regex を絞るのは対症療法**（続き464 で修正した追加ターンの1件はこの形）。
> ⚠**着手前に必ず根拠カードを1枚開く**（続き464 は全件名指し済みなので確認は安い）。

| 場所 | 誤爆するもの | 根拠 live カード |
|---|---|---|
| `effectEngine.ts:3138` 移動禁止ゾーン | E2 の「手札」を拾いエナだけでなく**手札も保護** | `WXK10-083-E1` |
| `execStubPart2.ts:4175` 同（二重配線） | 同上＝**effectEngine 側と一緒に直す必要がある** | `WXK10-083-E1` |
| `effectExecutor.ts:3918` 任意エナコストの行先 | E3 の「それを手札に加える」を拾い、**払ったエナがトラッシュでなく手札へ**行き後続も省略 | `WX25-CP1-049-E1` |
| `execStubPart1.ts:988` 引用能力の付与 | E2 の耐性引用を拾い、**相手シグニ効果耐性まで付与** | `WXK03-042-E1` |
| `execStubPart1.ts:1557` 条件つきパワー | 別能力の条件・数値を実行（**相手をトラッシュする効果が自己バフ化**） | `WX26-CP1-057-E2`／`WX25-CP1-056-E1` |
| `execStubPart1.ts:3021` 全シグニ/キー処理の側 | E1 の「対戦相手」を拾い**相手側だけ**処理（原文は「すべてのシグニ」） | `WXEX2-21-E3` |
| `execStubPart1.ts:3776` ソウル操作 | E2 のコスト句を拾い**ソウルではなくルリグトラッシュへ** | `SPDi43-03/04/05-E1` |
| `execStubPart1.ts:4355` 下に置ける枚数/レベル/クラス | 別能力の制限を採用（レベル3以下→2以下 等） | `WXEX2-61-E1`／`WXK08-048-E2` |
| `execStubPart1.ts:4447` リミット修正の主体 | E1 の「対戦相手」を横断し**自分の＋2が相手の＋2**へ | `WXDi-P13-004B-E3` |
| `execStubPart1.ts:4496` 捨てた枚数ごとの値 | −8000 ではなく E1 の −2000＝**効果量が1/4** | `WX24-P3-052-E2` |
| `execStubPart2.ts:474` 奇数/偶数レベル対象 | **奇数対象が偶数対象へ反転**（同カードに奇偶2能力） | `WXK10-084-E2` |
| `execStubPart2.ts:1654` DRAW 枚数 | E2 の「2枚引く」を拾い**余分な2ドロー** | `WXDi-P10-006-E3` |
| `execStubPart2.ts:2133` チャーム条件パワー | 別能力の符号付き数値を採用し −10000/−20000 を失う | `WX07-031-BURST`／`WX25-P2-103-E1` |
| `execStubPart2.ts:2578` ルリグレベル合計ごとの値 | ＋1000 ではなく E1 の ＋7000 | `WXDi-P05-055-E2` |
| `execStubPart2.ts:2629` 色種類ごとの値 | −3000 ではなく E1 の −10000 | `WXDi-D06-016-E2` |
| `execStubPart2.ts:2671` ルリグデッキへ加えるクラフト | E1 のカード名を拾い**別クラフトを追加** | `WX25-P1-034-E2` |
| `execStubPart2.ts:2817` トラッシュ枚数閾値 | E1 の「25枚以上」を拾い能力が変質 | `WX12-037-E2` |
| `execStubPart3.ts:1137` コラボ人数 | 「1人とコラボ」が E2 の「2人を呼ぶ」で**2人call** | `WXDi-CP01-005-E1` |
| `execStubPart3.ts:3704` 配置替えの側 | 別能力/Burst の「対戦相手のシグニ」を拾い**自シグニ配置替えが相手対象化** | `WXEX2-04-E1`／`WXDi-P00-015-E1`／`WXDi-P00-068-E1` |
| `execStubPart3.ts:4439` 付与対象のクラス | E2 の＜紅蓮＞を拾い**無指定の対象を＜紅蓮＞へ限定** | `WXK04-002-E3` |
| `effectParser.ts` `inferTriggerScope` | **過小発火側**＝続き463 の【出】ガードで watcher が `self` に残る（O-19 と同根） | `WX25-P1-061-E1` |

**■ 監視だけしている項目（着手不要・壊れたら気付く）**
- `POWER_THRESHOLD_TRASH`＝parser が生成しうるのに engine に消費地点が無い。**live 0件**で無害。golden に「live 0件」の契約テストがあり、parser 規則が生えた瞬間に赤くなる。
- **【マジックボックス】の複数枚設置**＝現行の分岐は**1枚目だけ設置する**。原文が「1枚まで」の3効果しか無いので実害なし。「2枚以上を同時に設置」するカードが出たら**トラップ分岐と同じ per-card 展開へ寄せる**。
- `STUB{REVEAL_PICK_HAND_SHUFFLE_BOTTOM}` 5効果＝2026-08-12 に実測したところ**全件 `revealPickParams` が完備**（枚数・行き先・filter・二段ピック）で、`REVEAL_PICK_PLAY` のような原文再parse依存ではない。**対象外。**

**■ 消化済み（続き403〜453）**
> **1行サマリも含めて [PLAN_DETAIL.md](./PLAN_DETAIL.md)「2026-08-13 整理⑨」へ全文退避した**（2026-08-13）。
> ここは**生きている worklist だけ**を置く方針の徹底＝消化済みの記録は PLAN には残さない。
> 一次記録は [BUGFIXES.md](./BUGFIXES.md) の各日付。



## 7. フェーズ3残作業：実機挙動（P3）

**目標＝実機で各カードがルール通り動く。** `scripts/verifyBattleDrive.mjs` のシナリオ横展開パターン確立済み（1件＝`scenarios` テーブルに1行追加）。**発火条件は golden で自動検証済みなので実機は「総合動作」だけ**に絞る。

> **実機ヘッドレス検証が可能（2026-06-30〜）**：`scripts/verifyBattleDrive.mjs`＝実ログイン→CPU戦→盤面注入→実UIクリックで効果発火→観測。手順は [VERIFY_BROWSER.md](./VERIFY_BROWSER.md)。**下記の宿題のうち `ON_TARGETED`／`ON_SIGNI_BANISH_OPPONENT_BY_EFFECT`／`ON_LRIG_UNDER_MOVED`／`ON_LRIG_GROW`／`ON_COIN_PAID`／`ON_DECK_SHUFFLED` は「発火すること」自体は既に実UI検証でPASS済み**（`ontargeted`/`banishbyeffect`/`lrigundermoved`/`cpugrow`/`deckshufflespell` 等の既定シナリオ）。**各項目末尾の「follow-up」注記（未カバー経路）だけが真に未検証のまま残っている**。

**engine 配線済み timing（C1 群・R30-R46）は✅ほぼ全項目 実機PASS**（続き57-64・112-128）。**個別の PASS 記録・修正経緯は [PLAN_DETAIL.md](./PLAN_DETAIL.md) §7 に退避**。**2026-08-11＝チェックが全部埋まった実機検証17ブロックも [PLAN_DETAIL.md](./PLAN_DETAIL.md)「2026-08-11 整理⑥」節へ退避済み**（PLAN 側には1行✅サマリだけ）。

**残る実機検証項目＝下の `V-01`〜`V-24` が単一 worklist**（Sonnetタスク1。§4 進捗サマリと二重に持たない＝**新しい未検証UIが出たらここへ `V-<次番号>` で足す**）。

> **✅ 決着済みブロック8件（続き459／458／457／427／434／431／424／425）は 2026-08-13 続き468 で [PLAN_DETAIL.md](./PLAN_DETAIL.md)「2026-08-13 整理⑬」節へ退避**（原文・シナリオID・実測値ごと）。**残作業だけを下へ採番して持つ**。
>
> **番号の意味**＝`V-01`〜`V-03`＝**§3 の実バグ待ち**（シナリオは既にあり赤で待機／engine が直れば緑へ反転する）。`V-04`〜`V-17`＝**未着手・最優先**。`V-18`〜`V-24`＝**未着手・通常**。
> ⚠**採番は固定**（消化しても番号を詰めない＝`O-nn` と同じ運用）。消化したら行ごと PLAN_DETAIL へ退避して、ここには残さない。

### 🅰 §3 の実バグ待ち（シナリオ作成済み・**赤のまま既定 order に置いてある**）

- **V-01 🔴 離場置換の対話（→§3 (cxxv)/(cxxvi)）**＝`leaveSubCpuAutoRespondsSubstitute`／`leaveSubAskDirectedToVictim`／`leaveSubDecisionNoneIsHonored`／`leaveSubDecisionKeyIsHonored` の**4本が FAIL**。**`BANISH{count:数値}` 経路では問いが1度も出ず engine が自動適用**し、注入した決定も honor されず消費もされない。⚠**`count:'ALL'` 経路は完全に正しい**（`leaveSubAllTargetsAskedPerVictim` PASS）＝**同じ機構が入口で割れている**。⚠**相互身代わりでインスタンスがエナに複製**される件も同時検出（(cxxvi)）。**engine が直ったら4本を回すだけ。**
  - [ ] 📋**人間側モーダル（`場離れの置換`）の描画確認は defer**＝`leaveSubstituteAskQueue`（`effectExecutor.ts:740-743`）は victim を `ctx.otherState.field.signi` に限定するので、**問いは常に「効果を撃った側の対戦相手」にしか飛ばない**＝host vs CPU のドライバでは **host を victim にする決定論的手段が無い**。将来案＝(a) CPU 側に効果バニッシュを撃たせる経路を作る (b) `pending_effect` を直接注入する。
  - [ ] 📋**未実装として送る（バグではない）**＝(a) **CPU は常に先頭の選択肢（＝最も安い置換）を選ぶ**＝盤面評価はしない近似 (b) `WX14-026` の**ライフクラッシュは選択肢に出るが engine の自動適用はしない**。

- **V-02 🔴「このアタックを無効にする」が効かない（→§3 (cxxvii)）**＝`oppPayNegateAttackWhenPaid`／`oppHandDiscardIsOpponentSide` の**2本が FAIL**。**CPU がコストを払ったのにアタックが通り `host.life 7→6`**。真因は `NEGATE_ATTACK{owner:'opponent'}` が**自分のアタッカーを候補にできない**こと（`execNegateAttack`＝`effectExecutor.ts:5861-5863`）。⚠**live 全73件が `owner:'opponent'`** で、**自分のアタック時に発火するのはこの2効果だけ**＝残り71件は `opponent` が正しい。**engine が直ったら2本を回すだけ。**
  - ⚠**観測の注意**＝進行中アタックのキャンセルは **`negatedAttacks` には載らない**（一時フラグ＝`effectExecutor.ts:8822` で立て `BattleScreen.tsx:8119` で消去）。**ライフが減ったかどうかで見る**。

- **V-03 🔴 ピースの効果が使用時に解決しない（→§3 (cxxiii)）**＝`WXDi-P14-002` の選択肢④（「手札を２枚捨ててもよい。そうした場合、対戦相手のライフクロス１枚をクラッシュする」）＝**手札が1枚以下のとき「支払う」が選べない**（`canAfford`）ことを見たいが、**その前段で止まっている**。⚠**2026-08-11（続き436）でセレクタ問題は解消済み**（`KeyUseModal` のエナ選択は完全に機能＝`keycost-energy-0/1/2` → energy 3→0 → セット成功）だが、**その後に効果が一切発火しない**（`pEff=-`）。実測＝`WXDi-P14-002-E1` は `effectType:'ACTIVATED'`／`timing:['MAIN']` なのに `executeKeyPiece`（`BattleScreen.tsx:6613`）は `queueCardEffects(..., ['AUTO'], ['ON_PLAY'], ...)` **しか積まない**。⇒ **§3 (cxxiii) の設計裁定が先**（シナリオに【起】起動の1手を足すだけでは二重請求の是非が決まらない）。既存シナリオ＝`connectSpinningChoice4Pay`／`connectSpinningChoice4Insufficient`。

### 🅱 未着手・最優先

- **🔶 V-04 エナ支払い元の一本化（続き428）＝2026-08-14 続き472 で**代表経路を決着**（Codex 起案→Claude 実機検証・**6シナリオが2回連続PASS**・既定 order 登録済み・**engine バグ0**）。⚠**支払いサイトの本数は資料間で食い違う**＝`energyPaySource.ts:8` は**17本**、`:111` は**13本**、旧 PLAN 記述は**14本**。静的参照も「ラベル利用モーダル14ファイル／`planEnergyPayment` 13箇所」＝**「全経路」の母数は未確定**（codex が実測で指摘）。
  - [x] 🔴**既存のエナ支払いが従来どおり動くか**（回帰確認）＝**実機PASS 2経路**（`energyPayArtsDeductsSelectedOnly`＝アーツ／`energyPayKeyUseDeductsSelectedOnly`＝キー使用）。`UNDER_CARD_AS_ENERGY_COST` を持つカードが**居ない**盤面で、**選んだエナ（index 1）だけがトラッシュへ行き、もう1枚は残る**。⚠**funnel は `applyTo` を呼び忘れると「エナが1枚も減らない＝ただでアーツが撃てる」形に壊れる**設計（`energyPaySource.ts:19-26`）なので、シナリオは**その症状を名指しで FAIL させる**判定を持つ。
    - 📋**残り12経路は未検証**（グロウ／スペル／アシスト各種／シグニ【起】／エナ【起】／手札【起】／トラッシュ【起】／ルリグ付与【起】／カットイン／【出】コスト）。⚠🔑**シグニ【起】は `SigniActivatedModal.tsx:265` にエナ候補の testid が無く、同名エナを決定論的に選べない**＝**踏むなら testid 追加が先**。
  - [x] 🔴**`WXDi-P10-041`（羅植姫 タナバタ）の下カードで払えるか**＝**実機PASS 2本**（`underEnergyPayOfferedInAttackPhase`／`underEnergyPayDeductsUnderCardOnly`）。`ATTACK_ARTS` でアーツのコスト選択を開くと **`artscost-energy-*` が4件**（エナ2＋下2）並び、**下カードのエントリだけ `title` に「（カード名）の下」**を持つ。**下カードだけを選んで支払うと、その1枚が stack からトラッシュへ行き、シグニ本体も残りの下カードもエナも減らない**。
    - 🔑**観測点＝`artscost-energy-{i}` の `i` は pool の index そのもの**（`ArtsModal.tsx:374,383`）で、**pool は先頭が `my.energy` と同順・追加分は末尾**（`energyPaySource.ts:101`）＝**個数と `title` の有無だけで決定論的に観測できる**。
  - [x] **フェイズと上限のゲート**＝**実機PASS 2本**。①`underEnergyPayNotOfferedInMainPhase`＝**盤面を1文字も変えず `top.turn_phase` を `MAIN` にするだけ**で**下カードが候補から消える**（`artscost-energy-*` が2件・`title` 付き0件）＝`duringMyAttackPhase` ゲートが効いている。⚠**「0件だから効いた」ではなくエナ側2件が出ていることを同時に assert**（モーダル未描画との区別）。②`underEnergyPayPerTurnLimit`＝下カードを3枚置き、**`turn_off_zone_energy_paid_count` を 0→2 にするだけ**で **`title` 付き候補が 3→1** に減る＝**上限を候補生成の1点で切っている**（`offZonePayLimit`）。
    - 📋**相手のターン／カットイン窓／ターン跨ぎの復活は未検証**。
  - [ ] **`WXDi-P10-041-E3` と噛み合うか**＝下のカードを払った後にこのシグニが場を離れると、「下にあったカード1枚をトラッシュからエナゾーンへ」の対象に**払ったカードも含まれる**（トラッシュに居るので正しい）。
  - [ ] 📋**未実装として送る（バグではない）**＝(a) 候補の**視覚的マーカーが `title` 属性だけ** (b) **残り上限より下カードが多いとき「どれを払うか」を選べない**（安全側の近似）(c) **CPU は下カードから支払わない**。

- **✅ V-05 対象宣言の脱落（続き423）＝2026-08-13 続き469 で決着**（Codex 起案→Claude 実機検証・**5シナリオが2回連続PASS**・既定 order 登録済み）。⭐**母集団は `STUB{SELECT_TARGET_ONLY}` を使う live 118効果**（PLAN が書いていた「16効果」は**続き423 で変更した数**であって母集団ではない）＝代表2枚で filter の enforce を固定した。
  - [x] 🔴**所有者と体数**（`WXDi-P02-009-E3`）＝**実機PASS 3本**。①`targetDeclOpponentOnlyCandidates`＝`pendingCandidates` が **guest の3体だけ**で**自分のシグニは混入しない**（旧＝自分のシグニ1体が戻っていた）②`targetDeclUpToTwoSelectsBoth`＝**2体選べて、選んだ2体だけが相手の手札へ戻り未選択の1体は場に残存**（旧＝`count:1` 固定）③`targetDeclUpToTwoAllowsZero`＝**`決定 (0/2)` で0体確定でき相手3体すべて残存**（旧＝1体強制）。⚠**0体確定でも《ガードアイコン》の任意コストは提示され、payすると手札→トラッシュへ動く**＝**現状を記録しただけで仕様判断はしていない**（原文「対象とし、〜捨ててもよい。そうした場合、それらを手札に戻す」の解釈が要るなら別途）。
  - [x] **パワー制限が候補に効くか**（`WX06-CB01-E1`）＝**実機PASS 2本**。①`targetDeclPowerCapExcludesAbove`＝候補は **P3000 の1体だけ**で **P15000 は除外**（旧＝無差別）②⭐`targetDeclPowerCapUsesEffectivePower`＝**対照**＝盤面のカードを1枚も変えず `guest.temp_power_mods` に **+1000 を足すだけ**（印字3000→**実効4000**）で**候補が一度も非空にならない** ⇒ **パワー判定が実効パワーで行われている**（`fieldCandidates` に `ctx.effectivePowers` を渡す＝`execStubPart1.ts:163`）ことを実機で証明。⚠**注入が効いたことを `powerMods` で先に確認してから**候補を見ている（効いていないのに「候補0」で PASS すると偽陽性）。

- **V-06 🔴 幻コスト第2波＋下カードコストの絞り込み（続き422）2件**
  - [x] **下カードコストの候補が絞られるか**（`WXDi-P11-042-E1`）＝**実機PASS 2本**（`underCostFiltersByColor` ＋ 対照 `underCostUnavailableWhenNoRed`・2026-08-13 続き471）。下に「赤シグニ1枚＋非赤2枚」を置くと**候補は赤1枚だけ**／支払うと下 stack から trash へ行き対象がバニッシュ（エナへ）。**下の1枚を白へ交換するだけ**の対照で **`pay` が `(disabled)`** になり本体も走らない。⭐**続き421 でこの filter は「型にも無い死フィールド」だった**（逆翻訳にだけ出て engine は無視）＝**続き422 の配線が実UIまで届いていることを実機で確認**。⚠**runtime 型（`execUtils.ts:171-196`）と JSON payload 型は別物**で、**片方にキーを足しただけでは `resolveOptionalCostSpec` が落として黙って無視される**（`:177-179` の警告）。
  - [x] 🔴**捨てさせる向き**（`WXDi-P14-060-E1`）＝**実機PASS 2本**（`revealOppHandSkipKeepsOpponentHand` ＋ 対照 `revealOppHandPayDiscardsOpponentAndDraws`・2026-08-14 続き473）。**辞退**すると `host.hand` 2→2／`guest.hand` 3→3／`guest.trash` 0→0／`guest.deck` 40→40 で**全て不変**（＝捨てさせもドローも起きない）。**pay** すると **`guest.trash` 0→1・`guest.deck` 40→39** で、🔑**`host.hand` は 2→2 のまま**（旧実装＝自分が1枚失って相手が引く**真逆**は再現しない）。⚠**手札の枚数では見えない**（捨て1・引き1で戻る）＝**trash と deck で見る**。
    - 🔑**構造の読み違いに注意**＝この JSON は `SEQUENCE[REVEAL, OPTIONAL_ACTIVATE, TRASH{opponent}, CONDITIONAL→DRAW]` で **`TRASH` が `CONDITIONAL` の外**にあるため「辞退しても捨てさせるのでは」と疑ったが、**実際は Pattern⑤**（`effectExecutor.ts:4314`）が**後続の `TRASH＋CONDITIONAL` を丸ごと pay 側 `cont5` に包み skip 側を no-op にする**（`:4421`）＝**「そうした場合」慣例（`:3745`）は STUB の直後が CONDITIONAL のときだけ**。実機でも辞退時に何も動かないことを確認した。

- **V-07 🔴 幻の手札コストの是正（続き421）2件**＝**16効果**でコストの徴収先が変わった（従来は原文と無関係に**手札**が1枚落ちていた）。
  - [x] 🔴**エナゾーンから正しく徴収されるか**（`WX24-P1-047-E1`）＝**実機PASS 2本**（`energyTrashCostDeductsEnergyNotHand` ＋ 対照 `energyTrashCostUnavailableWhenShort`・2026-08-14 続き473）。エナに「Lv1シグニ2枚＋Lv2シグニ＋スペル」を置くと**候補は Lv1シグニ2枚だけ**／支払うと**その2枚だけがトラッシュへ**行き、🔑**手札は1枚も減らない**（旧実装＝**原文と無関係に手札が1枚落ち、しかもエナは減っていなかった**）。**2枚目を Lv2 へ交換するだけ**（総エナ4枚は維持）の対照で **`pay` が `(disabled)`**。
    - ⚠**検証側で足したドライバ修正**＝**支払い後に `BANISH{targetsStored}` がもう一度 `SELECT_TARGET` を開く**（候補は宣言済み対象に限定）＝**ここに応答しないと `pEff=SELECT_TARGET` のままタイムアウトする**（続き469 の `targetDeclUpToTwoSelectsBoth` と同じ挙動）。**支払い自体は初回から正しく完了していた**。
  - [x] **自己トラッシュコストが二重に取られないか**（`WX06-CB01-E1`）＝**実機PASS**（`optionalTrashSelfNoHandLoss`・2026-08-13 続き469）。**pay**＝`WX06-CB01` 自身が場からトラッシュへ行き対象がバニッシュされ、🔑**host の手札は1枚も減らない**（旧＝手札1枚＋このシグニの**両方**を失っていた）／**skip**＝**双方のシグニも手札も不変**。⚠**同一 spec を再注入して `optcost-pay`／`optcost-skip` のクリックだけを変える**対照形。

- **✅ V-08 `OPTIONAL_COST{handDiscard}` のモーダル（続き420）＝2026-08-13 続き470 で決着**（Codex 起案→Claude 実機検証・**6シナリオが2回連続PASS**・既定 order 登録済み）。**18効果**で「手札を捨てる／捨てない」のモーダルが新たに出るようになった分。
  - [x] **絞り込みが効くか**＝**実機PASS**（`handDiscardCostFiltersCandidates`）。⚠**代表カードは `WX18-001-E3` ではなく `WXK09-041`**（同じ `handDiscard.filter`／`canAfford` 経路を**シグニの【自】アタックだけ**で踏めるため。`WX18-001` はルリグ Lv4・GrowCost《黒》×3・《コインアイコン》起動が要る）。**手札に「＜天使＞シグニ1枚＋非該当2枚」**で pay を選ぶと**候補は該当1枚だけ**／支払い後に本体が走り**相手の手札 2→1**。⚠従来は**末尾の1枚が問答無用で落ちていた**。
  - [x] **`canAfford` が効くか**＝**実機PASS**（`handDiscardCostUnavailableWhenNoMatch`＝**対照**＝手札の該当札を非該当へ**交換するだけ**）。**`pay` が `(disabled)`**（`canAffordOptionalCostSpec`＝`execUtils.ts:250,253-257`）／`skip` しか選べず**本体が走らない**（相手の手札不変）。
  - [x] **辞退できるか**＝**実機PASS 2本**（`handDiscardSkipBlocksBody` ＋ 対照 `handDiscardPayRunsBody`）。`WXDi-CP01-027-E3` で **skip すると本体（相手シグニを手札に戻す）が走らず**自分の手札も減らない／**pay すると《ガードアイコン》持ちシグニだけが候補**になり、支払うと相手の P10000以下シグニが手札へ戻る。
  - [x] 🔴**ルリグを対象にするか**＝**実機PASS 2本**（`handDiscardOptionTwoDownsOpponentLrig` ＋ 対照 `handDiscardOptionThreeDownsOpponentSigni`）。`WX25-CP1-004-E1` の**②だけ**を選ぶと **guest の lrigDown=true・両者の signi は全て up**／**③だけ**を選ぶと **guest の signi だけ down・guest lrig は up**＝**②と③で対象が入れ替わっていない**（旧＝自分のシグニがダウンしていた）。⚠**「4つから2つまで選ぶ」は `choose_count:2`＋`upTo:true` の multiSelect**（`effectExecutor.ts:4567`/`:4613`）で、**1つ選んだ時点で「決定」が押せる**（`EffectInteractionModal.tsx:541`）＝**②③を同時に選ぶと対象の切り分けができないので必ず1つずつ**。
  - 📋**やらなかった**＝`WX18-001-E3` 本体（上記の理由）。⚠**その原文は「捨て**る**」＝強制なのに live は `OPTIONAL_COST`（任意）**という既知差がある＝**仕様判断は未実施**。

- **✅ V-09① 手札捨ての任意コスト＝2026-08-13 続き470 で決着**（上の V-08 と**同一 STUB**なので同じバッチで消化）。`WXK09-041` で ①pay/skip が出る ②**skip で手札が減らず本体も走らない** ③支払うと**＜天使＞のシグニだけ**が候補 ④**該当が0枚なら「支払う」が `(disabled)`**＝**4点すべて実機PASS**。

- **V-09 🔴 任意性脱落の系統消化（続き416〜417）＝残り2件**（①は上で✅・②は続き469 の `optionalTrashSelfNoHandLoss` で✅）＝engine 側は golden で固定したが、**任意コストの pay/skip モーダルが新たに出るカードが 140枚超**あり、実UIでの提示・支払い徴収は golden では踏めない。
  - [x] ~~**手札捨ての任意コスト（`OPTIONAL_COST{handDiscard}`）**~~＝**✅続き470**（上の V-09① を参照）。
  - [x] **効果まるごと任意（`OPTIONAL_ACTIVATE`）**＝**実機PASS**（`optionalActivateSkipThenPay`・2026-08-13 続き471）。⚠**PLAN が例示していた `WX07-003` は記述が誤り**＝実データは**ルリグ**（ミルルン・ユニオン Lv4）で、原文は【自】「あなたの**《クロスアイコン》を持つシグニ１体が場に出たとき**、カードを１枚引いてもよい」＝**【出】でドローではない**。⇒ 代わりに **`WXDi-P02-037-E3`**（シグニ／限定なし／【出】「あなたのライフクロス１枚をクラッシュしてもよい」）で検証＝**通常召喚の ON_PLAY で「発動する／発動しない」が出る**／**発動しないと `host.life` 7→7（不変）**・**発動すると 7→6**（確認フローも消化）。⚠**同一 spec を再注入して応答だけを変える**対照形。
  - [x] ~~**自己トラッシュコスト（`OPTIONAL_TRASH_SELF`）**~~＝**✅続き469**（`optionalTrashSelfNoHandLoss`＝V-07② と同一）。
  - [x] **`underAnySigniTrash{fromThis}` が「このシグニの下」だけに絞るか**＝**実機PASS**（`underCostFromThisOnly`・`WXK08-052`）。**このシグニの下1枚**と**別シグニの下1枚**を同時に置くと、**候補は自分の下の1枚だけ**／支払うと相手シグニに **−3000**、**別 stack は不変**。
  - [ ] 🔴**新設 `fieldDown`（アップ状態の自シグニをダウン＋色）**＝`WXDi-P04-051`。①**アップ白シグニが3体そろっていないと「支払う」が選べない**＝**実機PASS**（`fieldDownCostRequiresThreeUpWhite`）。②**3体そろえても支払えない**＝🔴**実バグを検出**（→§3 **(cxxviii)**）＝`fieldDownCostPaysThreeAndWhite` が **FAIL**（`pay:…(disabled)`／`signiDown=[true,false,false]`）。**シグニアタック経路では攻撃者が先にダウンする**（`BattleScreen.tsx:7858` → 収集は `:7920`）ため**3面盤面では最大2体しかアップで残らず**、`fieldDown:{count:3}` は**永久に成立しない**＝**恒久 no-op**。⇒ ③「そのあとルリグがアップし能力を失う」は**到達不能で未観測**。**engine が直れば緑に反転する**。

- **🔶 V-10 F-3 身代わりを効果バニッシュへ配線（続き406）＝2026-08-14 続き474 で実機検証**（Codex 起案→Claude 実行・シナリオ5本を既定 order へ登録）。⚠**Codex は `0xC0000142`（通算8回目）で最終工程が実行できず、ゲート・SHA・エンコーディング検査は検証側が引き取った**（全緑・削除0・BOMなし）。
  - [x] **バトルバニッシュは従来どおり対話モーダルが出る**（＝自動適用に化けていない）＝**実機PASS**（`battleBanishSubstituteStillInteractive`）。`pending_banish_substitute` が立ち、モーダル「身代わりバニッシュ」と待機ログを確認。
  - [x] **効果バニッシュで身代わりが自動で走る**こと自体は**実測できた**＝`effectBanishSubstituteRunsAutomatically` の実測は `victimStayed=true／sacrificeLeft=true／sacrificeInEnergy=true`＋ログ `身代わり：コードハート　†Ｃ・Ｃ・Ｍ†の代わりにコードアート　Ｓ・Ｃをバニッシュ`＝**挙動は期待どおり**。`effectBanishSubstituteDiscardsSpell` も `victim 残存／spell が hand→trash／身代わりログ` を実測。
  - [ ] 🔴**(cxxix)＝`WX14-026` が「コスト0」で身代わり成立**（→§3）。`effectBanishLifeCrashSubstituteNotOnEffect` が **FAIL**＝**ライフを払わずシグニが場に残る**。
  - [ ] ⚠**シナリオ側の判定が厳しすぎて FAIL している3本を要修正**（**engine の問題ではない**）＝①`effectBanishSubstituteRunsAutomatically` は `asks=0` を要求するが実測 `asks=1`（**続き466 の (cxxv) は「問いが出ない」だったので、ここで `asks=1` が出るのは要確認**）②`effectBanishNoSubstituteWithoutSacrifice` は**盤面は正しい**（victim がエナへ・身代わり0）が `normalLog=false`＝**期待したログ文言が実装と違う** ③`effectBanishSubstituteDiscardsSpell` も**盤面は正しい**が付随条件で FAIL。⇒ **次に触る人は「ログ文言を実装から取る」「`asks` の期待値を実測に合わせる」だけで緑にできる見込み**。
  - 📋**参考（旧記述）**＝下の項目が当初の検証内容。
  - [ ] **効果でバニッシュされたときに身代わりが自動で走るか**＝相手の場に `WX12-024`（＋他の＜電機＞）を置き、**バトルではなく効果**で `WX12-024` を狙う → **`WX12-024` が残り、代わりに他の＜電機＞がバニッシュされてログに「身代わり：〜」が出る**こと。あわせて①`WX10-033`（手札のスペル1枚が自動で捨てられる）②**バトルバニッシュは従来どおり対話モーダルが出る**こと③`WX14-026`（ライフクラッシュ型）は**効果バニッシュでは身代わりされない**ことを確認する。⚠**V-01 と同じカードを使うが軸が違う**（V-01 は対話化・こちらは自動適用の配線）。

- **V-11 🔴 配置制限ゲートの一本化（続き405）2件**＝engine 側は golden で固定したが、**実UIの ExecCtx 経由（`fillDeployCaps`）と CPU 召喚は golden では踏めない**。
  - [ ] **相手に配置数制限を掛けた状態で、相手が「効果で」シグニを場に出せないか**＝`WXDi-P05-024` か `WXK11-074` を使い、①相手の場が2体のときに相手の効果配置が**不発になりログに「配置数制限のため〜」が出る** ②相手の場が1体なら通る ③**通常召喚は従来どおりボタンが出ない**。⚠**CONTINUOUS 版**（`WX07-006`）でも同じことを確認する＝**8箇所ある ExecCtx 生成のどれか1つで呼び忘れると黙って効かない**。
  - [ ] **CPU が配置制限・パワー制限を守って召喚するか**＝①配置数上限に達したら**それ以上召喚しない** ②`signi_deploy_power_limit` を掛けたとき **CPU が上限以上のパワーのシグニを召喚しない**（従来 CPU はパワー上限を一切見ていなかった）。

- **V-12 🔴 アタック可否ゲート一本化＋付与ストア共通走査（続き404）3件**＝**発火点が `BattleScreen` にしかなく golden では原理的に踏めない**3経路。
  - [ ] **CPU がアタック不可のシグニでアタックしないか**（`signiAttackGate`）＝①「アタックできない」を付与して**そのシグニだけダウンせずスキップされ、無限ループしない** ②パワー上限／合計1回制限／エナコストでも同様。⚠**G154 BURST の無効化回避モーダルが「他のシグニ2体トラッシュ」コスト付きでも通ること**（`fieldTrashCostAlreadyPaid` の再入経路）も見る。
  - [ ] **付与された【自】が ON_SPELL_USE / ON_SIGNI_BANISH_OPPONENT で発火するか**＝(a)`WXDi-P13-008-E3` (b)`WXDi-P12-041-E1`→バトルバニッシュで発火・**《ターン1回》が効く**こと。
  - [ ] **付与された【自】が ON_ENERGY_CHARGE で発火するか**（`SPDi43-13-E2`）。⚠**この経路は `actions_done` へ書き戻さない＝《ターン2回》が未管理**なので、**回数超過で撃てるのが見えたら §6.4 に別項目として立てる**。

- **V-13 🔴 トラッシュ起動のコストUI（続き403）4件**＝**トラッシュゾーンUIからの実発動経路（`getMyTrashCardActions` → モーダル → `executeTrashActivated` → `execAddToField`）は golden では原理的に踏めない**。共通の確認点＝**①トラッシュのカードをタップして【起】ボタンが出る ②コスト支払い後にそのカード自身が場に出る（トラッシュに残らない・二重に増えない） ③支払ったカードがトラッシュへ行く**。
  - [ ] **アップ状態のレベル2のルリグ2体をダウン**（`WXDi-P04-042`）＝センター→アシストL の順に**自動で**ダウン。**レベル1のルリグしかアップしていない場合はボタン自体が出ない**。
  - [ ] **アタックフェイズ起動＋複合コスト**（`WX19-029`）＝エナ《黒》2枚＋**手札から＜遊具＞のシグニ2枚**で**ダウン状態で**場に出る（`asDown:true`）。⚠**手札に＜遊具＞が1枚しかなければボタンが出ない**。
  - [ ] **《ディソナアイコン》フィルタつき手札捨て**（`WXDi-P12-053`）＝**《ディソナアイコン》のカードだけが選択可能**。
  - [ ] **コイン2＋ON_COIN_PAID 連鎖**（`WXDi-P16-082`）＝支払い後に**コイン支払いに反応する【自】がスタックに積まれる**（`coins_paid_this_turn` も進む）。
  - [ ] （余力があれば）**【ウィルス】2個除去**（`WX17-049`／`WXEX2-53`）／**【チャーム】1枚トラッシュ**（`WXEX2-73`）／**エナ0コスト＋条件**（`WX11-049`）。

- **V-14 🔴 §6.3 C 第4波／E（続き397〜402）4件**＝いずれも発火点が `BattleScreen` にしかなく **golden では原理的に踏めない**。
  - [ ] **裏向きにしたシグニがターン終了時に戻る／トラッシュされるか**（`WXDi-P09-034`／`WXDi-P05-037`／`WXDi-P01-040`）。⚠**解決直後はまだ裏向きであること**と、**相手のシグニを裏返した場合も戻ること**を見る。⚠`WXDi-P09-009` は**ターン跨ぎ**。
  - [ ] **解除コストつきアタック制限**（`WX24-P2-010`）＝①他シグニ2体を払ってアタックできる ②他シグニが1体以下なら**アタックボタンが出ない** ③払うと実際に2体が場からトラッシュへ ④**CPU が対象にされた場合**に決定論的支払いで正しく動く。
  - [ ] **多重アクセ**（`WX20-028`）＝⚠**2枚では発動しない**／**通常のシグニは従来どおり1枚しか付かない**。🔴**`signi_acce` の型移行で、進行中バトル状態に旧形式が残っている場合の読み込みが未検証**＝**既存の途中局面を開く経路も踏むこと**。
  - [ ] **「このゲームの間」付与がターンを跨いで残るか**（`WXK03-001`／`WXDi-P03-003`）。あわせて **`UNTIL_OPP_TURN_END` が CPU ターン終了で失効するか**（該当 live 152効果）。

- **V-15 🔴 §6.3 J-4 フェイズ／アタック終了 timing（続き384）2件**＝発火点が `doPhaseAdvance` と `resolvePendingSigniBattleFor` にしか無く **golden では原理的に踏めない**。
  - [ ] **アタック終了時の【自】が発火するか**（`WXK11-018-E2`）＝**①正面にシグニがいてダメージが通らなかった場合＝発火**／**②正面が空でライフをクラッシュした場合＝非発火**を撃ち分ける。⚠**アップされるのが自分自身ではない**ことと**《ターン1回》**も見る。
  - [ ] **アタックフェイズ終了時の【自】が発火するか**（`WX24-P2-075-E1`）＝⚠**＜遊具＞が離れていないアタックフェイズでは発火しない**ことが本題（旧＝条件節が丸ごと落ちて無条件発火）。⚠離場の記録は**効果解決の中央 diff とバトル解決の2経路**にあるので両方試す。

- **V-16 🔴 §6.3 J-1 他能力の発動監視（続き383）1件**＝発火点が `resolveStackNext` にしか無く **golden では原理的に踏めない**。
  - [ ] **他の能力の発動に反応して【自】が発火するか**（`WXEX1-77`）。**発動した能力の直後に監視側が解決される**ことと、⚠**《ターン1回》が効く**こと（`actions_done` への書き戻し）を見る。`WX19-066` は後回しでよい。

- **V-17 🔴 §6.3 J-5 単発機構（続き381）2件**＝`BattleScreen` の獲得サイト／グロウ経路にしか無く **golden では原理的に踏めない**。
  - [ ] **コイン獲得で【自】が発火するか**（`SP27-007`）＝①**自分がグロウしたとき**②**CPU がグロウしたとき**の両方で発火（scope `any`）。⚠**コイン5枚での グロウでは発火しない**（上限クランプ後の実増加0）／**コイン"支払い"では発火しない**。
  - [ ] **夢限-Q- の反転機構が実機で通しで動くか**（`WXDi-P11-010A`→`B`）。⚠**既存シナリオ `mugenQFlip` が既定 order にあるので流すだけでよい**。**陳腐化していた間は落ちていたはず**＝復旧で通るようになるかが本題。

### 🅲 未着手・通常

- **V-18 §6.3 J-2 付与・離脱イベント機構（続き380）2件**＝発火の funnel は `BattleScreen` の中央 diff にしか無く **golden では原理的に踏めない**。
  - [ ] **【ソウル】付与で【自】が発火するか**（`WXDi-D07-019`＝self／`WXDi-D07-004`＝any_ally）。⚠**別シグニに付けたときはルリグ側だけ**が発火すること（self scope が他シグニへの付与で発火しない）も併せて確認。
  - [ ] **【アクセ】がトラッシュに置かれて【自】が発火するか**（`WXEX2-19-E1`）。⚠**自分の【アクセ】だけ**（`any_ally`）。あわせて `WXK10-049` で**付いていない状態ではランサーが付かない**ことを見る（旧＝条件脱落で常時ランサー）。

- **V-19 一時レゾナの返却（続き433）2件**＝engine は golden で固定したが、**ターン終了処理は実機でしか踏めない**（2経路ある）。
  - [ ] 🔴**出したレゾナがターン終了時にルリグデッキへ戻るか**（`WX07-050`＝【出】／`WX16-Re18`＝【起】）＝**自分のターン終了時に消え、ルリグデッキへ戻る**（トラッシュではない）。⚠**居座ったら回帰**（従来はずっと場に残る過剰効果だった）。
  - [ ] **手札が多いターンでも戻るか**＝ターン終了時に手札上限の**ディスカードが発生する**盤面で同じことをする。⚠BattleScreen のターン終了処理は2経路あり、**ディスカードを挟む側でも戻る**こと。⚠**先例あり**＝続き462 の `keysAbilityLossTurnEndNoDiscard`／`WithDiscard` が同じ2経路を踏んでいる（そのままコピー元にできる）。
  - [ ] 📋**未実装として送る**＝`WX16-Re18` の「レゾナを**２枚まで**」は**1枚しか出ない**（複数枚の任意配置UIが未実装）＝過少なのでルール違反ではない。

- **V-20 二段の任意（続き426 の残り）1件**
  - [ ] **二段の任意**（`WXDi-P10-039`＝このカードが捨てられたとき）＝①「手札を1枚捨てる／スキップ」→②払った場合だけ「《青》《無》を支払う／スキップ」→③払った場合だけトラッシュから場に出る。⚠①をスキップしたら②が**出ない**こと。⚠「そのターン終了時」の遅延は未実装（②③が即座に来て正しい）。**前提バグは解消済み**（`handDiscard` が既定 order に復帰＝PASS）。**シナリオ未作成。**

- **V-21 `isDisona` 条件節グループ（続き379）1件**
  - [ ] **「あなたの場にパワーN以上の〜シグニがある場合」が**バフ込みの実効パワー**で判定されるか**（`WXDi-P13-078-E1`／`WX06-034-E1`／`WXEX1-50-E1`）＝**印字2000のシグニをバフで10000以上にしたときに条件が成立する**こと。⚠**持続側（`WX15-089/090/091`）は印字のまま据置が正**（実効パワーで見ると循環する）＝**こちらは挙動が変わっていないことも併せて確認**。

- **V-22 `isDisona` パリティ移植（続き378）1件**
  - [ ] **ディソナ限定の CONTINUOUS バフ5効果が実機で「ディソナだけ」に効くか**（`WXDi-P12-044-E1`／`P12-060-E1`／`P13-009-E1`／`P13-047-E1`／`P13-070-E1`）。**従来は `effectEngine.matchesFilter` が `isDisona` を知らず全味方をバフしていた**＝**盤面のパワー表示が非ディソナで増えないこと**と、自分自身（「他の」）が対象外であることを実機で確認する。

- **V-23 機構ギャップ7効果（続き377n）2件**＝engine/golden では固定済みだが `BattleScreen` の経路は計器に映らない。
  - [ ] **ATTACH_CHARM の複数ペア付与が実機で描画されるか**（`WXK07-070`＝【出】でデッキ上2枚を自分のシグニ2体へ／`WXEX1-22-E2`＝相手のトラッシュ3枚を相手のシグニ3体へ）。**`signi_charms` は1ゾーン1枚**なので、2ゾーン以上に同時に付いた状態がボードに出るか・チャーム参照効果（枚数カウント）が正しく数えるかを見る。
  - [ ] **「N体まで＝0体でもよい」選択UIがキーワード付与でも出るか**（`WXDi-P00-004`＝パワー15000以上のシグニ2体まで【ランサー】／`WXDi-P09-053`＝レベル1のシグニ2体まで【シャドウ】）。**0体で確定（キャンセルではなく「選ばずに解決」）できるか**と、**候補が自分のシグニだけ**（従来は `owner:"any"`＝相手のシグニに付いていた）を確認する。

- **V-24 🔴 タスク12 在庫5件の残0クローズ（2026-08-08）5件**＝engine/golden では固定済みだが、いずれも `BattleScreen` の経路にしか無く **golden では原理的に踏めない**（付与の合流・耐性コレクタの呼び出し・レベル表示）。
  - [ ] **(cxiv) 条件つきキーワード付与が `granted_effects` → augmented effectsMap 経由で実際にバッジ／アタック処理に効くか**（`WXDi-CP02-057` か `WXDi-P11-071`。**正面のシグニのパワーを閾値の上下に跨がせ**、【アサシン】/【ランサー】が付く→付かないに変わるのを見る。旧＝正面が誰でも常時付いていた）。
  - [ ] **(cxiii) `WXK10-035` の効果耐性**＝`collectEffectImmuneSigni` の呼び出しは `BattleScreen.tsx:4256` の1箇所だけ。＜電機＞シグニに対し**レベル1のシグニの効果は通らず、レベル2の効果は登録者数50万人を達成して初めて止まる**こと（旧＝`sourceFilter` が無く相手シグニの効果を**全部**受けない過剰保護だった）。
  - [ ] **(cxv) 条件つき常在パワーの出入り**＝`PR-426-E3`（ライフ1枚以下**かつ**中央ゾーンで＋4000）／`WXDi-P07-060-E3`（覚醒で＋2000）。**条件を満たさない盤面で乗っていないこと**が本題（旧＝常時適用）。
  - [ ] **(cxvii) `WX20-Re18` の動的レベル**＝エナ10枚（Lv4）／15枚（Lv5）で場に出し、**レベル表示・アタック時の正面バニッシュ（Lv4以上）・対戦相手の効果を受けない（Lv5以上）**が実効レベルどおりに切り替わるか。⚠`BattleScreen` のレベル表示は `calcSigniLevels` を別途呼ぶので **engine の判定と一致するか**も併せて見る。
  - [ ] **(cxviii) `WXDi-P15-071` のベット分岐**＝**ベットあり／なしで撃ち分け**、ベット時は【Ｓランサー】（無条件）、非ベット時は正面パワー8000以下ゲート付き【ランサー】＝**排他**になること。


### 📌 実機シナリオを書くときの必読（続き460〜469 で実証した罠）

1. 🔴**`spec.hostSet`／`guestSet` の両方に `'field.check': null` を必ず入れる**＝`injectScenario` の `CORE_FIELD_KEYS` に `check` が含まれ**リセットされない**。前シナリオのライフクラッシュ確認モーダルが全画面を覆い**クリックが1つも通らない**（3回踏んだ）。
2. 🔴**`getByRole('button', { name: <正規表現>, exact: true })` は `count()` が常に 0**（`exact` は文字列名にしか効かない）＝**モーダルもボタンも出ているのに30反復空振り**する。ラベル照合は `data-action-label` の前方一致か `H.clickBtn`/`clickTextOrBtn`/`clickTestId`。
3. 🔑**負方向テスト（「出ない」「起きない」）は必ず対照とセット**＝**単独では何も検証していなくても緑になる**。対照は**盤面を1文字も変えず原因だけを外す**（実例＝`damageSource` の1語／guest ルリグ1枚／相手資源の枚数）。
4. 🔑**「盤面だけを見る判定」も偽陽性**＝**機構を1度も通らなくても同じ盤面になる**ことがある（続き466 の実例＝対話が出なくても身代わり成立と同じ絵）。**機構が動いた証拠（問いログ・`asks` 件数など）を必須条件に入れる**。
5. 🔑**クリック前から成立している条件で判定しない**＝`pendingEffect==null && stackLen===0` は**効果の開始前と完了後の両方で true**。**効果が走り出したことを1度でも観測してから判定する**（さもないと単体で PASS・バッチで FAIL の位置依存 flakiness になる）。
6. 🔑**候補が複数ある選択で `pick-0` を盲目に押さない**。⚠🔴**ただし `pendingCandidates` の index を `pick-<idx>` にそのまま使うのも誤り**（続き469 で判明）＝**相手の場が対象のときモーダルは候補を reverse して描画する**（`EffectInteractionModal.tsx:189-192`＝`targetScope==='opp_field'` なら `[...candidates].reverse()`）。`data-testid` は**表示順の index**（`:282`）。⇒ **集合として assert してから `[data-testid^="pick-"][data-card-num="<カード番号>"]` で狙う**（`clickPendingInstance`）。⚠**`data-card-num` はカード番号でインスタンスIDではない**＝**同名カードが複数並ぶ盤面では一意にならない**ので、そのときは表示順を自分で反転して index を出す。⚠先例 `cheatingSameLevelDownFilter` が index で動いていたのは**有効候補が1件しかなかったから**。
7. 🔑**DOM の描画待ちを必ず入れる**（続き469 で2回踏んだ）＝`H.queryState()` は **Supabase を直接照会するので DOM より先に真になる**。`pendingCandidates` が立った瞬間に `pick-*` や `決定 (N/M)` を掴みにいくと**0件で即 null**。**待機予算は 3秒程度で全ヘルパに揃える**（`clickPendingInstance`／`clickExactVisibleText`）。⚠**500ms だと1回目 PASS・2回目 FAIL の位置依存フレークになる**。
8. ⚠**`a?.x === a?.y` は `a` が null のとき `undefined===undefined` で true**＝1周目に誤検出して即 FAIL する。
9. ⚠**`ATTACK_ARTS_OP` は非ターンプレイヤーが「アーツ終了」で進める**＝押さないと**CPU のターンが永久に終わらない**。
10. ⚠**切り分けの決め手は `scratchpad-verify/<id>-final.png`**＝ログだけ見ていると原因を engine 側に誤診する。
11. ⚠**Codex は実行できない**（サンドボックスのネットワーク遮断）＝**起案だけさせて実行・判定は検証側**が引き取る。指示書の冒頭でそれを明言すると時間を溶かさない（CODEX_GUIDE §8 続き460〜468）。

- **✅ 実機検証クローズ済み（2026-07-30〜2026-08-07・17ブロック）＝詳細は [PLAN_DETAIL.md](./PLAN_DETAIL.md)「2026-08-11 整理⑥」節へ退避**＝タスク16 残0クローズ3枚（`WXDi-P06-038`／`WX05-020`／`WXDi-P13-051`）／`WXDi-P11-063-E2`（aboveSelf）／タスク12 (lx)(lxi 第2波・第3波・第10波・第11波・本消化5件)(lxii)(lxiii)(lxiv)(lxv)(lxxiii)(lxxvi)／エクシード本体5件／§6.3 H・I′ の機構5件／ON_LRIG_GROW④／(xi) の skip 検証／(xxxvi) のグロウ支払いUI／lrigDown コストの限定（🏁完全クローズ）／コイン支払い累計。**この検証群で発見した実バグは Opusタスク12 (ci)(cii)(civ)(cv)(cvi)(cvii)(cviii) として登録済み・クローズ済み**。⚠**再検証したい場合はシナリオIDが退避先の原文に全部残っている**（`verifyBattleDrive.mjs`）。

- **クラフトトークンの実機配置**の残＝WX22-001-E3（§6.4）。⚠2026-08-05時点で再確認＝`GRANT_LEAVE_PLACE_PENDING`は`src/data/parsers/parseSentencePart1.ts:1946`でparserがSTUBを生成するのみで、`src/engine/effectExecutor.ts`・`execStubPart*.ts`のいずれにも実行側の実装が無いまま＝**引き続き機構待ち**（Sonnet側で実機検証できる状態ではない）。
- **driver 側**＝30件超の連続実行で出る低頻度フレーク（Sonnetタスク3。`oppDraw` 単独FAILは別要因で未解明）。⚠**今回のセッションでは着手せず**＝ユーザーからのフィードバックで「`verifyBattleDrive.mjs` を明示シナリオID無しのフルバッチで実行しない（フリーズ報告あり）」旨の制約があり、この項目の再現には30件超の連続実行が要るため対象外とした。着手する場合は個別セッションで慎重に（タイムアウト・スクショ省略設定込みで）扱うこと。

### 7.1 timing flatten 系統（実バグ・当初159枚→**✅完了＝VALUE 0**・R58で打ち止め）
> R5-R58 で timing flatten の表現バグ（`timing:ON_TURN_END`だが原文トリガーは「〜したとき」＝ターン終了時に付与即失効の実質no-op）はすべて解消（flatten 系統としては VALUE=0・LOSS=0・同型★0。⚠parserWorklist 全体の held/LOSS は別勘定＝§4 恒久指標参照）。**残る作業は表現ではなく engine 配線の実機検証のみ**（上記）。診断＝`npx tsx scripts/archive/_flattenList.ts`（0枚を確認）。系統別の直し方は `BUGFIXES.md` の R5〜R58 エントリ。

### 7.2 対話UIの残実装
- ~~トラッシュ自己起動のエナ以外コストUI（手札捨て/コイン/エクシード等・14枚・上記6.4と同一対象）~~ **✅実装済（続き403・§6.4 参照）＝実機検証だけ残**
- LOOK_AND_REORDER の canTrash UI
- ビートのトラッシュ版選択ピッカー
- F-3身代わり対話（バトルバニッシュ経路7枚）

### 7.3 既知の近似の裁定
上記各項目の「⚠近似」注記を1つずつ「精緻化する／実害なしと容認する」で消し込む。

---

## 8. フェーズ4：対戦体験の完成

- [ ] **CPU AI のメインフェイズ拡張**（唯一の「新規設計を要する大物」）：アーツ/スペル/起動効果の能動使用・グロウ判断・CPU END分岐の予約型対応（現状 `turn_end_draw_count` のみ）。**先に DESIGN §4「CPU は対人戦と同じ処理」の統一を完遂**してから AI 判断を乗せる。
- [ ] **doPhaseAdvance の pure 抽出は「やらない」を既定**（費用対効果逓減と結論済み）。CPU統一で必要になった部分だけ最小限切り出す。
- [ ] **リリース判定**：fuzz重め（`npm run fuzz -- --games 2000 --moves 80`）＋実機PvP/CPU通し対戦スモークをリリースゲートに。DESIGN §5の手順（version bump→CI→push→`npx vercel --prod`）で本番反映。

---

## 9. 偽陽性パターン（脱落疑いに出るが**直さない**）— 毎回まず除外

1. **使用条件＋本体**（「このカードは〜の場合にしか使用できない」が前置き）＝条件として正しく表現済み。【真の偽陽性】
2. **CHOOSE/チェインの1文圧縮**＝「以下の[N]つから[M]つ（まで）を選ぶ」で改善済み（BUGFIXES③）。択肢が全部出ていれば機能的には正しい。
3. **REVEAL_AND_PICK / LOOK_AND_REORDER の文法崩れ**＝主要系統は是正済（BUGFIXES上部）。残りは§5bの低優先テール。
4. **ルール注記**（「（コストのない【出】能力は発動しないことを選べない）」等）＝効果ではない。
5. **アンコール/ベット注記のみ**訳に出ない＝本体が合っていれば正しい。
6. **BET_MECHANIC STUB**＝§5bのZ-2（機構待ち）。
7. **owner:any の一括変換は禁止**：POWER_MODIFY/BANISH の `owner:'any'` は大半が正当（「シグニ1体を対象とし±N」＝自他選択／「すべてをバニッシュ」）。原文に明示主語があるものだけ個別是正。
8. **`[STUB:id]` を含むからとスキップしない**：実装済みハンドラのタグ表示。ただしハンドラがカード全体を覆うか（◎）／断片だけで残りを落としたか（実バグ）はタグでは区別不可＝各外れは個別検証。[[stub-means-implemented]]
9. **LIFE_BURST 内 `CONDITIONAL{IS_MY_TURN}`** は実害なし（常時true＋「そうした場合」特別処理）。修正不要。

## 10. 触らなくてよい/枯れた系統（調査済み）

- 強制アタック＝実装済み（未配線は WX12-010 複雑レゾナのみ）。BURST丸ごと欠落＝残0。保護系キーワードのowner誤り＝残0。
- 同型★（`grouped_all.txt`）＝**枯れた・常に0維持**。残1件 `WX04-056` は無害な表現差（任意）。
- 「あなたのアタックフェイズ開始時」系（self約407件）は**全再生成禁止**（約90枚退化）。個別にtiming/triggerScopeを直す。

## 11. 残・大型機構オーナー表（ほぼ完了の台帳）

着手前に**この表の「状態」を `着手中(担当名)` に更新してコミット**（重複防止）。実装の型は §3「機構実装の型」に従う。

| 機構 | 影響 | リスク | 状態 |
|---|---|---|---|
| 引用AUTO付与（`GRANT_QUOTED_AUTO_ABILITY`） | 中 | 中 | **表現完了＋engine精緻化(B4)着手済**＝引用【自】/【常】能力を実発火（自場シグニ・ターン限定・parse成功時のみ）。残＝permanent/相手付与対応・誤パース是正（約30枚は原文に引用無しparser案件）。⚠要実機検証 |
| ~~SET_TRAP／動的閾値フィルタ／遅延条件トリガー／《相手ターン》《自分ターン》AUTO基盤／ビート機構Phase1-7／傀儡場出し汎用化・levelLteLastProcessed~~ | — | — | **✅完了**（詳細 [PLAN_DETAIL.md](./PLAN_DETAIL.md) §11） |
| engine未配線 timing 群の実機配線 | 大（~15 timing・R33-R58） | 高 | **✅C1全配線完了**。残るは実機検証のみ（§7参照）。 |

実装済み機構の履歴：コスト増加・ライフクラッシュ履歴・LOOK_PICK_CHAIN field宛先・リコレクト系統・改造素材機構・引用能力付与型・保護/制限系STUB・アーツコスト軽減句 は `BUGFIXES.md` 参照。

---

## 12. 検証ハーネス（整備済み）

> **検証3層（実機検証を Claude がヘッドレスで代替）**：①表現＝decompile逆翻訳一致／②実行（壊れない）＝`smoke`（全効果・新品盤面）＋`fuzz`（乱択連鎖・進化盤面）／③正しさ＝`golden`（型ごと結果assert）。engine/BattleScreen/decompilerを触ったら **smoke・golden・fuzz** を回帰チェックに回す。⚠どれも engine（executeEffect/resume*）が対象＝**BattleScreen.tsx の配線（フェイズ進行・トリガー収集・effect_stack整列）は対象外**（C2実機 or pure抽出＋goldenが要る）。
> **CI 自動実行**：`.github/workflows/ci.yml` が push/PR(master) で **typecheck・lint・golden・smoke・fuzz** を回す（失敗時に非ゼロ終了でCI失敗）。`npm install` のみで動く（env/supabase不要）。
- **`npm run smoke`（`scripts/smokeTest.ts`）**：全効果10722件を**オートパイロット**でヘッドレス実行し、CRASH/HANG（STEP_CAP=200）/INVARIANT違反を検出。現状＝全0（OK 10722／SKIP 0・2026-07-19）。⚠「壊れないか」を保証するもので「ルール的に正しい結果か」は判定しない。
- **`npm run golden`（`scripts/goldenTest.ts`）**：主要DSLアクション型ごとに制御盤面で効果を実行し「結果がこうなる」をassert。現状＝**PASS 503／FAIL 0**（2026-07-19。型網羅化の経緯は続き82-85）。バグを直す前に1件足すと回帰を防げる。
- **`npm run fuzz`（`scripts/selfPlayFuzz.ts`）**：乱択自己対戦ファズ。ランダム初期盤面で効果を連鎖発動し相互作用/進化盤面クラッシュ/ループ/カード爆発を検出。シード固定で完全再現可能（既定200ゲーム×40手）。現状＝全0。重め検証は `npm run fuzz -- --games 2000 --moves 80`。
- **`node scripts/_dropTriage.mjs`**＝脱落疑いを〔偽陽性／機構待ち／修正済／実バグ候補〕に自動＋手動分類（明細 `docs/_drop_triage.txt`）。
- **`npm run census`（`scripts/vocabCensus.ts`）**＝語彙センサス＝**両方向98計測**（原文修飾句77パターン＋数値/構造/逆方向21計測）×JSON対応語彙の突き合わせで**過剰効果（フィルタ/条件/制限/構造の脱落）と幻覚（原文に無い効果/数値）**を検出（既存網の死角＝盤面が変化するバグ）。高シグナル1895効果ベースライン（現値は §4 恒久指標が正）・超過で exit 1・明細 `docs/_vocab_census.txt`。
- **`npm run census:clusters`（`vocabCensus.ts --clusters`・続き23新設）**＝census高シグナルのマッチ節を正規化テンプレ（数値→N・《名前》→《X》・＜クラス＞→＜C＞）にクラスタし、枚数順の文型一覧 `docs/_census_clusters.txt` を出力。**§5c消化バッチの入口**＝カード単位でなくテンプレ単位で作業を組む。
- **`npx tsx scripts/censusManualDrift.ts`（2026-08-08 続き382新設・§6.3 K）**＝**`manualEffects.ts` ↔ live JSON の乖離**を効果単位で分類する計器。**`build:effects` は live 側 `parseStatus:MANUAL` を不可侵にするので、`manualEffects.ts` を後から直しても live に永久に届かない**＝`_held_review` にも `_partial_fresh` にも出ない第3の死角を映す。明細 `docs/_manual_drift.txt`。**`--date`** で git 履歴から方向判定（`docs/_manual_drift_dates.txt`）、**`--card <ID>`** で1カードの原文つき完全 diff、**`--adopt <effectId,…>`** で**効果単位**に live へ同期（⚠timing が変わる採用は既定で中止＝`--allow-timing-change` で解除）。ゲートではない（exit 0）が、**対になるゲートが goldenTest の「§6.3 K トリップワイヤ」**＝新しい乖離が出たら即 FAIL。⚠**`--date` の判定は manual 定義の効果にしか使えない**（parser 由来は `PARSER_REVIEW` として別枠＝原文照合が要る）。
- **`npm run census:wiring`（`scripts/censusWiring.ts`・2026-08-07 続き376新設）**＝**被覆マトリクス**＝「TargetFilter の語彙は型にも engine にも実装済みなのに、parser の**一部のビルダーからだけ**合成されていない」配線漏れを (語彙キー × アクション入口) で機械検出する。**ゲートではない**（常に exit 0）＝「掘る場所を指す索引」。現状 **miss 203件**（走査 7721効果・STUB/MANUAL除外）。明細 `docs/_census_wiring.txt`。セルを取るときは `npx tsx scripts/censusWiring.ts --cell <キー>:<入口ラベル>` で効果IDと原文を全部出す。⚠**★印（同じ入口に配線済みの効果がある）が最優先**＝穴が明確。⚠`has=0` の語彙は自動で別枠に落ちる（＝配線漏れではなく**機構未実装**＝§6.3）。
- **`node scripts/archive/censusSample.mjs [seed] [n]`（2026-08-07 続き376新設）**＝census 高シグナル union（**注記を剥がすとちょうど 1162＝公称と一致**）からシード固定で無作為抽出し、原文＋live JSON を並べて出す**真バグ率の測定器**。続き376 の実測は `seed=20260807 n=20` で **14/20＝70%**（§5d-0 ②）。**バッチを何本か消化したら測り直す**＝残件見積もりの根拠になる唯一の計器。
- **`node scripts/heldReview.mjs`（続き23新設）**＝`build:effects` の「温存(要レビュー)」を diff署名（type増減）でグループ化し `docs/_held_review.txt`（原文＋leaf diff付き）に出力→spot-check後 `--adopt ID1,ID2,…` / `--adopt-sig "署名"` で fresh を一括採用。前提＝直前に `npm run build:effects`（fresh を `docs/_held_fresh.json` に保存）。**採用しないもの＝STUB退化・「代わりに」昇格・別STUB id 化**（理由は BUGFIXES 続き23）。
- **`npx tsx scripts/parserWorklist.ts`**＝held/LOSS/VALUEのhealth計器（**2026-08-07 続き370 実測＝held 259・LOSS 203・VALUE 54・ADD/OTHER 2**。旧 2026-07-19＝held 188・LOSS154/VALUE34。§4 恒久指標参照）。⚠**`heldReview.mjs` の held（242）とは母数が違う**＝こちらは1カード1バケツの分類つき worklist。回帰検出に使う。⚠HEAD比較＝auto-commit 環境では採用コミット後の値で判定する。
- **`npx tsx scripts/archive/_flattenList.ts`**＝timing flattenのEXIST/FRESH差分（現在0枚）。
- **`docs/_partial_report.txt`（2026-07-07新設・`build:effects` が再生成）**＝parser 無言フォールバック刻印の計器＝「原文の条件/ステップを黙って落とす近似」の理由明細（初回142効果＝IS_MY_TURN化125/multi-dest分割11/リコレクト分割8）。この数字から**増えたら**parser に新たな無言近似が入った兆候（減らすのは §5c の条件語彙拡充）。刻印された fresh は parseStatus:PARTIAL＝heldReview で採用時にレビュアーに見える。

---
**関連**：`DESIGN.md`（設計方針）／`PLAN_DETAIL.md`（消化済み履歴）／`BUGFIXES.md`（修正記録）／`BEHAVIOR_AUDIT.md`（原文照合の主軸）／`SEMANTIC_AUDIT.md`（補完的発見器）／`effects-json-guide.md`（語彙）／`STUBS.md`（STUB一覧）／`TokenCallers.md`（トークン対応表）。
