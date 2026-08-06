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
| 12 | **Sonnet が積んだ engine/parser バグの修正（常設受け口）** | 可変 | 可変 | **在庫3件**（(cxiii)(cxiv)(cxv)。🏁(cxvi) は続き366／🏁(cxii) は続き367 で残0クローズ） |
| 13 | §5b 混線テール（実測823カード・16テーマ分類済み） | JSON再parse（1カードずつ） | L | effect 構造そのものが原文とズレたカードの再parse。**🆕2026-08-07 続き369 で「低優先」を解除**＝§5d の欠落パターン D（重度混線）と同じ母集団で、§5c 店じまい後の主戦場のひとつ |
| 20 | **§5d 1効果ずつの原文照合（新設・現在の主戦場）** | 原文照合＋JSON/parser | L（母集団 約874効果） | §5c の文型バッチが届かない**単発テール**。欠落パターン A〜D で分類し、**繰り返し出るパターンは parser へ還元**する。入口は §5d 末尾の照合済み12件 |
| 15 | （大型・任意）§8 CPU AI のメインフェイズ拡張 | 新規設計 | L（特大） | ⏳DESIGN §4「CPU は対人戦と同じ処理」の統一が先 |

> **✅消化済のタスク（1〜9・11・14・16〜19）は 2026-07-29／2026-08-02／2026-08-06 の整理で退避**＝完了行の原文は [PLAN_DETAIL.md](./PLAN_DETAIL.md)「2026-07-29 整理」節（1〜9・11・17〜19）／「2026-08-02 整理②」節（16＝timing 語彙センサス 🏁残0クローズ）／**「2026-08-06 整理③」節（14＝リファクタ Stage2→Stage3 純粋バトルコントローラ。⚠残作業は §7 実機通し確認のみ・手順は [BATTLE_CONTROLLER.md](./BATTLE_CONTROLLER.md)）**。生きているのは上表の **13・15・20**（**12 は常設受け口**）。**主戦場は 20（§5d）**＝2026-08-07 続き369 に §5c の文型バッチを店じまいして移した。

**Opusタスク12＝未消化の在庫（3件・2026-08-07 続き364/365 の §5c 消化で観測）**：

- **(cxiii) 多段閾値「N以上であるかぎり…、M以上であるかぎり代わりに…」**＝`WXEX1-33-E2`（20000でダブルクラッシュ／30000で代わりにトリプルクラッシュ）・`WX09-019-E2`（14000でアーツ耐性／18000でランサー＋【自】）・`WX20-Re18-E2`（レベル4で【自】／レベル5で効果耐性）。1文に閾値が2つあり、後段は「代わりに」置換＝**置換機構待ち**（§6.3）。現状は前段の閾値だけが載り、後段は前段の閾値で発火する（過剰・ただし旧＝無条件よりは近い）。
- **(cxiv) 「このシグニは正面のシグニのパワーがN以下であるかぎり」8カード**＝`WXDi-P05-081` `WXDi-P11-071` `WXDi-P14-065` `WXDi-P15-069` `WXDi-P15-071` `WXDi-CP02-089` `WXDi-P10-025` `WXDi-CP02-057`。engine/型/decompiler は `FRONT_SIGNI_POWER` を実装済みだが、**すべて引用付与の内側**にあり `GRANT_QUOTED_ABILITY` / `SIGNI_GRANT_QUOTED_CONSTANT_ABILITY` STUB か、内側原文がまるごと `keyword` 文字列に入っている（`WXDi-P14-065` / `WXDi-P15-071`）。引用付与の構造化とセットでないと届かない。
- **(cxv) `WX05-021-E1` の【ダブルクラッシュ】欠落**＝原文「パワーが20000以上であるかぎり、【ダブルクラッシュ】**と**「【自】：…」を得る」のうち、curated には【自】側（`SELF_POWER_GTE` つき MANUAL）しか無く**キーワード付与が丸ごと無い**（過小）。

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

**現在の Sonnet 在庫＝タスク1（§7 実機検証）が主力**。タスク6は Opus の新語彙着地待ち・タスク8 clean群は任意。作業中に parser/engine のバグを見つけたら Opusタスク12 へ登録し交互サイクルへ戻す。⚠**2026-08-07（続き367）時点で Opusタスク12 の在庫は3件**〔(cxiii)(cxiv)(cxv)〕。🏁(cxvi)〔コイン支払い累計〕は続き366、🏁(cxii)〔パワー参照ゲートの表記パワー落ち〕は続き367 で残0クローズ。

---

## 4. 現在地とバトン（直近セッション）
> ① `git pull` → ② 本節を読む → ③ 作業 → ④ 本節と `BUGFIXES.md` を更新 → ⑤ commit & push を回す。詳細な修正履歴は `BUGFIXES.md`（新しい順）に積む。ここは**現在地・計画・残作業数だけ**。

### 📍 進捗サマリ（最新1件のみ・過去は別ファイル）
> **運用ルール（2026-07-07〜）**：この節には**直近の作業1件の要約だけ**を残す（入れ替え式）。新しく作業したら ①いま置いてある要約を [PLAN_PROGRESS.md](./PLAN_PROGRESS.md) の「過去セッション要約」**先頭**へ移す（新しいものが上）→②この節を今回の作業の要約へ丸ごと書き換える。過去の全セッション要約（旧・要約①②を含む）は [PLAN_PROGRESS.md](./PLAN_PROGRESS.md) に集約済み。
- **🆕 セッション（2026-08-07・続き368・Opus 5〔**§5c テンプレ消化 第3波**〕）＝ユーザー指示「§5cを進める」。触った層は `effectParser.ts`（規則の**置き場所**を1つ移動）／`public/data/effects_*.json`（採用3枚）／`vocabCensus.ts`（対応語彙3つ＋BASELINE）／`goldenTest.ts`。
  - **①機能是正＝「規則が無い」のではなく「共通表に無い」だった**。「このターンに対戦相手のカードがあなたの効果によってN枚以上デッキに移動していた場合」の規則は `parseSingleSentence` の**局所 `CLAUSES`** に既にあったが、**`STATE_CONDITION_CLAUSES_V2`（共通表）に無かった**ため【自】トリガー文の条件節 hoist 経路では拾えず、`WDK09-014`（E1/E2）・`WXK06-068`・`WXK06-070` の**4効果が無条件発火**していた。共通表へ移すだけで解消（V2 は共通表と局所 CLAUSES の**両方**に spread されるので局所の挙動は保たれる）。多段閾値の `WXK06-071` が壊れていないことを golden で固定。
  - **⚠教訓＝同じ文型なのに一部の効果だけ直らないときは、規則の有無ではなく「どの表に居るか」を疑う。**
  - **②計器較正 33効果**＝`minPower`（`FIELD_SIGNI_POWER_COUNT` の閾値／パワー閾値へ・4）・`LRIG_LEVEL`（センタールリグのレベル閾値／レベル閾値へ・24）・`Under`（下置きコストへ・5）。**3つ目がいちばん学び**＝対応語彙は**部分一致**なので、小文字 `under` は camelCase の **`handToUnderSelf` に当たらない**。新しいフィールド名を parser に足したら census の keys も同時に見る。spot-check 12件で masking なしを確認。
  - **③トリアージで機構待ちへ送った3本**＝「N枚以上ある場合」6〔**ルリグ/シグニの「下」の枚数比較の条件型が無い**＋二段閾値〕／「【使用条件】【チーム】＜C＞＆全員レベルN以上」3〔`使用条件` が keyword 文字列に化け、本体の付与も平坦化＝構造ごと作り直し〕／「それらが共通するクラスを持つ場合」3〔**場のN体が共通クラス**の条件型が無い〕。
  - **ゲート**＝全緑。**golden 1407→1408**（+1）、**census 1233→1199**（−34・`BASELINE_HIGH` 更新）、smoke 10679 全0・SKIP0、fuzz 全0、同型★**0 据置**（265群）、lint 0 errors、held 245 据置。逆翻訳の変更は4行のみ。**実機検証は不要**（parser の置き場所移動＋データ＋計器のみ）。
  - **次の一手**＝§5c「テンプレ2効果以上」は **77本・192効果**が残（当初91本・248効果から14効果を消化＋計器較正で母数が減った）。**残りの主力は機構寄り**＝上の3本に加え「あなたが次にスペルを使用する場合」5〔次スペルのコスト軽減予約〕・「対戦相手がシグニを配置する場合」4〔配置時の応答窓〕・「【トラップ】として設置してもよい」5。**素直な parser 規則で取れるテールはほぼ尽きた**ので、次は**機構を1つ選んで実装する**（例＝「下のカード枚数」条件型は `THIS_CARD_HAS_UNDER` に `minCount` を足すだけで6効果＋3効果に効く見込み・規模S）。**Opusタスク12 の在庫は3件**〔(cxiii)(cxiv)(cxv)〕でいずれも §6.3 の引用付与・置換機構と地続き。**Sonnet**＝§7 実機検証（タスク1）＝続き366 の (cxvi) 分が最優先。
### 📊 恒久指標（最新1件のみ・履歴は PLAN_DETAIL）

- **🆕 2026-08-07 続き368（§5c テンプレ消化 第3波＝デッキ移動累計ゲートを共通表へ＋パワー/レベル/下置きコストの計器較正）後 最新値（本行が直近の正）**：golden **1407→1408**（+1＝4効果の条件構造と `WXK06-071` の多段入れ子の保持）、census **1233→1199**（−34・`BASELINE_HIGH` も 1199 へ更新＝**機能是正4効果＋計器較正33効果**）、smoke **10679/10679** 全0・SKIP0、fuzz 全0、同型★**0 据置**（265群）、lint 0 errors/**248 warnings**（追加0）、manual field loss 0、held **245 据置**。**live JSON の変更は3カード**（`WDK09-014` `WXK06-068` `WXK06-070`）。⚠**残す教訓**＝(a) **「規則が無い」と「規則はあるが共通表に無い」は別物**＝同じ文型なのに一部の効果だけ直らないときは、regex の有無ではなく `STATE_CONDITION_CLAUSES_V2` に居るかを疑う（V2 は共通表と `parseSingleSentence` 局所 CLAUSES の両方に spread される）。(b) **census の対応語彙は部分一致なので大文字小文字で穴が空く**＝小文字 `under` は camelCase の `handToUnderSelf` に当たらない。parser に新しいフィールド名を足したら keys 側も同時に見る。(c) **素直な parser 規則で取れる §5c テールはほぼ尽きた**＝残り77本の主力は「下の枚数」「共通クラス」「配置応答窓」「次スペルのコスト予約」など**engine に条件型/状態を足す**作業。
- **2026-08-06 続き362f（🏁§3 タスク12(xciv) 残0クローズ＝コスト軽減の残テールを全数処理）後 最新値**：golden **1394→1395**（+1＝**増＋減が同一文**の `WX08-026`〔増加方向を含む5ケース〕と**ターン履歴**の `WX13-026`〔実績あり/なし/相手未知の3ケース〕）、census **1283 据置**、smoke **10679/10679** 全0・SKIP0、fuzz 全0、同型★**0 据置**（265群）、lint 0 errors/**248 warnings**（追加0）、manual field loss 0、held 245 据置。**live JSON は不変**。新機構＝`addNColorToCost`（コスト**増加**）／`PlayerState.signi_banished_this_turn`（バニッシュ履歴）。**実機は新規 `banishHistoryForCost` を2回連続 PASS**（【出】で相手シグニをバニッシュ→`guest.signi_banished_this_turn` 0→1）＋回帰2件。既定order 130→**131件**。⚠**未カバー検出の穴**＝カード番号キーのヘルパー（`applyMeltFactPreUseCost`）は regex 走査では見えない。
- **2026-08-06 続き362e（§3 タスク12(xciv)＝コスト軽減の残テールを 23→5枚まで消化）後 最新値（本行が直近の正）**：golden **1393→1394**（+1＝新クラスタ α/β/γ/δ を「満たす盤面なら減る／満たさなければ減らない」の両方向12ケースで固定）、census **1283 据置**、smoke **10679/10679** 全0・SKIP0、fuzz 全0、同型★**0 据置**（265群）、lint 0 errors/**248 warnings**（追加0）、manual field loss 0、held 245 据置。**live JSON は不変**（規則は `costs.ts` の EffectText 由来＝JSON を持たない）。⚠**ピースはコスト計算の入口が別**だったので「キーにセット」ゲートと `KeyUseModal` の2箇所も `computeArtsEffectiveCost` へ通した（(xciii) と同型の食い違い）。既存の過剰適用ゼロガードは `WX25-P3-002` の**正しい発火**1件を期待値へ追加。
- **2026-08-06 続き362d（🏁§3 タスク12(lv)＝CPU の任意・無コスト【出】未配線2経路）後 最新値（本行が直近の正）**：golden **1391→1393**（+2＝CPU が拾う母集団と「コスト付きは入らない」方針の固定／`OPTIONAL_ACTIVATE` の選択肢順が「発動する→発動しない」＝CPU 自動応答の方針そのものであることの固定）、census **1283 据置**、smoke **10679/10679** 全0・SKIP0、fuzz 全0、同型★**0 据置**（265群）、lint 0 errors/**248 warnings**（追加0）、manual field loss 0、held 245 据置。**live JSON は不変**（触ったのは `BattleScreen` の収集コードだけ）。母集団の実測＝③CPU シグニ召喚 **11効果**／④CPU グロウ **0件**（0件でも配線）。**実機は新規 `cpuOptionalOnPlayCharm` を2回連続 PASS**（CPU が `WX04-052` を召喚→【チャーム】が実際に付く）＋回帰3件。既定order 129→**130件**。
- **2026-08-06 続き362c（🏁§3 タスク12(lxxxviii)＝ベット分岐は実装済み〔主張が誤り〕＋`WDK15-007` の実バグと計器較正）後 最新値（本行が直近の正）**：golden **1388→1391**（+3＝BET_MECHANIC がベット有無で選択数を切り替えること〔`WX19-006` 1→2／`WDK12-007` 1→2／`WX16-005` 1→3〕・非ベットでも選択肢が実際に出ること／`WD21-007` のベット繰り返し／`WDK15-007` のベット時コスト軽減）、census **1285→1283**（`BASELINE_HIGH` も 1283 へ更新＝**instrument 側の較正**。`betChoose` が小文字で `/BET/` に掛からず、ベットを正しく表現した2枚が偽陽性だった）、smoke **10679/10679** 全0・SKIP0、fuzz 全0、同型★**0 据置**（265群）、lint 0 errors/**248 warnings**（追加0）、manual field loss 0、held **246→245枚**。**live JSON の変更は `WX18-005` の1カードのみ**（4択すべて原文一致を確認して canonical な `CHOOSE + betChoose` へ移行。A群の残り8枚は静的化すると過剰実行が入るため**据置**）。
- **2026-08-06 続き362b（🏁§3 タスク12(xciii)＝【チェイン】がキーワードごと落ちて次のアーツが一度も安くならなかった）後 最新値（本行が直近の正）**：golden **1386→1388**（+2＝アーツ7枚の【チェイン】軽減ステップ形状〔注釈なし・非文頭・同色2つを含む〕／engine が `next_arts_cost_reduction` に積み UI ヘルパーが実際に引くこと・2枚目の宣言で積み増しになること）、census **1285 据置**、smoke **10679/10679** 全0・SKIP0、fuzz 全0、同型★**0 据置**（265群）、lint 0 errors/**248 warnings**（追加0）、manual field loss 0、held **246 据置**。**live JSON の変更は7カード**（`WX10-004`／`WX10-005`／`WX10-022`／`WX11-018`／`WX11-021`〔MANUAL＝外科採用〕／`WX14-005`／`WX19-004`）。**実機は新規 `chainArtsCostReduction`（エナ0枚で2枚目のアーツが使える＝軽減が無ければ成立しない盤面）を2回連続 PASS**＋回帰3件。既定order 128→**129件**。
- **2026-08-06 続き362（🏁§3 タスク12(cix)＝「この方法でダウンしたルリグ」参照がコスト経路＝実UIで届いていなかった）後 最新値（本行が直近の正）**：golden **1378→1386**（+8＝支払い関数の記録／`WX25-P1-112` のレベル限定と参照不能時の空ヒット／`WX24-P1-040` の LRIG ダウン・アシスト代替・スキップ枝の did-it／シャドウのレベル解決と `thisCardOnly`／`WXDi-D03-004`・`D04-004` の枚数・レベル・owner／`WX24-P2-069` の旧キー不在／「このシグニは〜を得る」の `thisCardOnly`／`WX25-P2-114` の 0..N ダウンと「レベル合計＋1」ミル）、census **1286→1285**（`BASELINE_HIGH` も 1285 へ更新＝利得を固定）、smoke **10679/10679** 全0・SKIP0、fuzz 全0（distinct効果 2705種）、同型★**0 据置**（265群）、lint 0 errors/**248 warnings**（**本セッションの追加0**）、manual field loss 0、held **250→246枚**。**live JSON の変更は133カード**＝(cix) 母集団6枚＋MANUAL 1枚（外科採用）＋**巻き込み127枚**（`+thisCardOnly` の1キーのみ＝全数の差分署名で機械確認）。**実機は新規 `lrigDownLevelRemoveAbilities`（コスト経路の参照＝golden では原理的に守れない）を2回連続 PASS＋回帰9件**（`lrigDownCenterOnlyPays`／`lrigDownCenterOnlyUnwired`／`ontargeted5`／`keywordgained`／`wx24p2018GrantFire`／`banishbyeffect`／`g144DownTrigger`／`freezeLrig`／`lriggrow`）。既定order 127→**128件**。
- **2026-08-06 続き361（🏁§3 タスク12(cxi)＝中断エントリの盤面差分トリガー取りこぼし／🏁(c)＝ON_TARGETED の「そのシグニ」限定）後 最新値（本行が直近の正）**：golden **1374→1378**（+2＝(cxi)〔中断時点でドローが確定していること／その状態から `collectDrawTriggers` が `WX20-026-E3` を返すこと／「ON_DRAW と DRAW が最終でない SEQUENCE」の同居母集団2効果〕／+2＝(c)〔`collectTargetedTriggers` の `triggeringCardNum` 配線と origin なし時の非設定／3効果の `isTriggerSource` と「トリガー元が不明なら no-op＝巻き添えを出さない」実行確認〕）、census **1287→1286**（`BASELINE_HIGH` も 1286 へ更新＝利得を固定）、smoke **10679/10679** 全0・SKIP0、fuzz 全0（distinct効果 2701種）、同型★**0 据置**（265群）、lint 0 errors/**248 warnings**（**本セッションの追加0**）、manual field loss 0、held **250→247枚／105群**。**live JSON の変更は3効果**（`WXDi-P03-056-E1`／`WX05-047-E1`／`WXDi-P13-089-E2`＝per-effect 差分で changed=3 / added=0 / removed=0）。逆翻訳差分も同3行のみ（「対戦相手のを1枚トラッシュに置く」→「そのシグニをゲームから除外する」等）。**実機は `drawBySourceStory`（判定を「実際に -4000 が乗る」まで厳格化）と新設 `onTargetedSourceSigniBanish`（2回連続）＋回帰6件**。既定order 126→**127件**。⚠**(cxi) の穴の規模＝1巡目で中断する効果 5418／うち中断時点で既に盤面が動いている 484**（＝これまで一度も diff 評価されていなかった母数）。
- **2026-08-06 続き360／360b（🏁§3 タスク12(civ)＝engine 非バグと確定／(xcvii)(xcvi)／🏁(lxvi) 残0クローズ）後 最新値（本行が直近の正）**：golden **1371→1374**（+1＝(xcvii) の離場6アクション×`count:1`/`count:'ALL'` 両形態の回帰／+2＝(lxvi) の parser 規則2本）、census **1288→1287**（`BASELINE_HIGH` も 1287 へ更新＝利得を固定）、smoke **10679/10679** 全0・SKIP0、fuzz 全0（distinct効果 2711種）、同型★**0 据置**（265群）、lint 0 errors/**248 warnings**（**本セッションの追加0**＝245→248 の差は未追跡の置き忘れ `scripts/_dbgFresh.ts` が lint 対象に入っている分）、manual field loss 0、held **250枚／107群**。**live JSON の変更は4枚**（`WX24-P3-057`／`WX26-CP1-101`／`WX08-061`／`WXEX2-13`）＋収穫マージの自動採用2枚（`WXDi-P07-087`／`WXDi-D07-019`）＝**parser 変更前後の fresh 全数6712枚 A/B で変化20枚**を確認済み。実機は **`stackLen` を判定に使う20シナリオを全数単体実行（16 PASS）＋残4件を旧/新 driver で A/B して同一**。既定order 125→126件。
- **2026-08-06 続き359（🏁§3 タスク12(cv) 残0クローズ＝`opp_hand` ピッカーの viewer 相対描画によるソフトロック）後 最新値（本行が直近の正）**：**すべてのゲート値が前行から据置**＝golden **1371**、census **1288**、smoke **10679/10679** 全0・SKIP0、fuzz 全0、lint 0 errors/**245 warnings**、manual field loss 0、同型★0（265群）、held **257枚／109群**。**live JSON は完全不変**（`public/data/` に差分なし・**新語彙0本**）＝触った層は `EffectInteractionModal.tsx` のみ。⚠**モーダルの描画は golden 非カバー**＝純関数が無い UI 分岐なので**実機シナリオが唯一の検証手段**。意図的FAILだった2件（`wd16016BurstOpponentDiscard`／`wxex225DiscardAvoids`）の**PASS 反転**と、通常方向の回帰3件（`trashCounterOpp`／`handDiscard`／`exileHandBlind`）で締めた。既定order 124→125件。
- **2026-08-06 続き358（🏁§3 タスク12(ci)＋(cii) 残0クローズ＝`OPPONENT_PAY_OPTIONAL` の無料回避枝と CPU のエナ未選出）後の値**：golden **1368→1371**（+3＝①エナコストの有無で 'pay' 枝が出る／出ないこと、回避手段不足時は `available:false` で**枝は残る**こと ②live 母集団 **OPO 出現71／エナコストあり38／非搭載33**と、**「エナコスト非搭載でも回避枝ゼロの STUB は0件」**（＝'pay' を消しても過剰実行にならない安全弁）＋`costColors` にパイプ記法（`青|黒`）を持つ OPO が live に0件〔`resumeOpponentPayOptional` の色照合が解さないため〕 ③`selectOptionalCostEnergy` の戻りが `resumeOpponentPayOptional` にそのまま通って実際にエナが減ること／`canPayOptionalCost` と可否が一致すること／**instanceId を渡さないと従来どおり空振りする**ことの回帰）、census **1288 据置**、smoke **10679/10679** 全0・SKIP0、fuzz 全0、lint 0 errors/**245 warnings 据置**、manual field loss 0、同型★0（265群）、held **257枚／109群 据置**。**live JSON は完全不変**（`public/data/` に差分なし・**新語彙0本**）＝触った層は `effectExecutor.ts`（枝の条件付き spread 化）・`execUtils.ts`（`selectOptionalCostEnergy` 新設＋`canPayOptionalCost` の委譲）・`BattleScreen.tsx`（CPU 応答のエナ選出）。⚠**CPU 応答と枝の available は golden 非カバー**（固定できるのは pure な options 生成と支払い関数まで）＝**実機4シナリオ（`oppDiscardGate*` 2件＋`oppPayEnergy*` 2件・各2回連続PASS）と対で締めた**。既定order 123→124件。
- **2026-08-06 続き357（🏁§3 タスク12(cvii) 残0クローズ＝`ctx.currentPhase` の配線漏れ是正）後の値**：golden **1367→1368**（+1＝①`DURING_PHASE` を持つ**8効果**を effectId 単位で phases ごと固定 ②**`TurnPhase` に無い phase 値は既知の1件だけ**〔`WX05-013-E2:ATTACK_SIGNI_OP`〕と全数 assert＝不正値が増えたら落ちる ③`ctx.currentPhase` を見る他3機構の宣言元母集団〔`LOCK_OPP_TRASH_MOVE` 2／`NO_ABILITY_SIGNI_TO_DECK_BOTTOM` 1／アタックフェイズ限定バニッシュ先置換 3〕を固定。既存の `ON_OPP_ENERGY_ADDED` テストも4実値＋不正値の両方向へ拡充）、census **1288 据置**、smoke **10679/10679** 全0・SKIP0、fuzz 全0、lint 0 errors/**245 warnings 据置**、manual field loss 0、**同型★0（265群）**、held **257枚／109群 据置**（parser 修正で一時 259 へ増えた2枚は採用して元に戻した）。**live per-effect 差分＝changed 2／added 0／removed 0**（`WX13-035`／`WX24-P2-050` の `phases` のみ＝**機械 diff で「phases 以外の変化 0」を確認済み**）。**新語彙0本**。逆翻訳差分は `decompile_sheet2` の2行のみ（生列挙→「アタックフェイズの間」）。⚠**ExecCtx の配線そのものは golden 非カバー**（固定できるのは母集団と phase 値の妥当性まで）＝**実機4シナリオ（`trashMoveLock*` 2件＋`noAbilityDeckBottom*` 2件・各2回連続PASS）と対で締めた**。既定order 121→123件。
- **2026-08-06 続き356（🏁§3 タスク12(cviii) 残0クローズ＝【起】ACTIVATED の `cost.lrigDown` 配線）後の値**：golden **1366→1367**（+1＝ACTIVATED の `cost.lrigDown` 母集団**13効果**を effectId＋payload 単位で固定し、**実行経路の内訳〔シグニ11／ルリグ2〕**も固定。併せて母集団に実在する3形〔count のみ／centerOnly／level〕の支払い可否を共有関数 `payLrigDownCost` で両方向 assert）、census **1288 据置**、smoke **10679/10679** 全0・SKIP0、fuzz 全0、lint 0 errors/**245 warnings 据置**（ローカル248は未追跡の残置 `scripts/_dbgFresh.ts` の3件ぶん）、manual field loss 0、同型★0、held **257枚／109群 据置**（**parser も JSON も触っていない**）。**live JSON は完全不変**（`public/data/` に差分なし・**新語彙0本**）＝触った層は `BattleScreen.tsx`（実行2経路＋アクション一覧ゲート2箇所）・`SigniActivatedModal.tsx`／`LrigGrantedModal.tsx`（`canAfford`）・`lrigDownCost.ts`（表示ラベル関数の新設のみ）。⚠**コスト支払いUIと available 判定は golden 非カバー**（固定できるのは母集団と純関数の戻りまで）＝**実機3シナリオ（`lrigDownCenterOnlyPays`／`lrigDownCenterOnlyUnwired`／`lrigDownLevelLrigActivated`・各2回連続PASS）と対で締めた**。既定order 118→121件。
- **2026-08-04 続き346（🏁§3 タスク12(xcix) 残0クローズ＝主語なしアタック watcher の scope 是正）後の値**：golden **1363→1366**（+3＝①3効果の `triggerScope:'any'` とターン限定の有無 ②scope:any での収集＋`initStack`／`turnGateOk` の残存・除外 ③母集団3効果の固定）、census **1288 据置**、smoke **10679/10679** 全0・SKIP0、fuzz 全0、lint 0 errors/**245 warnings 据置**、manual field loss 0、同型★0（265群）、held **257枚／109群 据置**。**live per-effect 差分＝changed 3／added 0／removed 0**（`WXEX2-04-E1`／`WXDi-P06-033-E2`／`WXDi-CP02-053-E1` の `triggerScope:'any'` 追加＋後者2枚の `turnOwner`）。**新語彙0本**＝`triggerScope:'any'` も `turnOwner` も既存で collector/`turnGateOk` も対応済み＝**parser が生成していなかっただけ**。⚠**ターン限定を collector に足してはいけない**（`effectStack.turnGateOk` が担当。足すと二重ゲートで既存効果が落ちる＝本セッションで実際に golden 2件が落ちて差し戻した）。
- **2026-08-04 続き345（🏁§3 タスク12(lxviii) 残0クローズ＝散文形「対戦相手のターンの間、」の過剰実行是正）後の値**：golden **1360→1363**（+3＝①対象2枚の相手ターン発火／自ターン非発火〔origin 付き〕②本文側4枚に turnOwner を付けないこと③母集団の固定〔前置き AUTO 30件・未ゲート1件〕）、census **1288 据置**、smoke **10679/10679** 全0・SKIP0、fuzz 全0、lint 0 errors/**245 warnings 据置**（ローカル248は未追跡の残置 `scripts/_dbgFresh.ts` の3件ぶん）、manual field loss 0、同型★0（265群）、held **258→257枚／109群**。**live per-effect 差分＝changed 2／added 0／removed 0**（`WXDi-P12-074-E1`／`WXDi-P13-089-E2` の `turnOwner` 追加のみ）。**新語彙0本**＝`triggerCondition.turnOwner` は既存フィールドで collector も対応済み＝**parser が生成していなかっただけ**。逆翻訳差分は `decompile_sheet8` の当該2行のみ。
- **2026-08-04 続き344（🏁§3 タスク12(xcviii) 残0クローズ＝CPU のターン開始ドロー処理の統一）後の値**：golden **1357→1360**（+3＝①CPU＝guest のターンドローでの `ON_DRAW` 収集と `playerId` ②`drawBySourceStory` の残値あり発火／クリア後 非発火 ③`ON_DRAW` の live 母数13）、census **1288 据置**、smoke **10679/10679** 全0・SKIP0、fuzz 全0、lint 0 errors/**245 warnings 据置**（ローカル248は未追跡の残置 `scripts/_dbgFresh.ts` の3件ぶん）、manual field loss 0、同型★0・held **258枚／109群 据置**（**parser も JSON も触っていない**）。**live JSON は完全不変**（**新語彙0本**）＝触った層は `BattleScreen.tsx` の CPU UP 分岐のみ。⚠**CPU 経路の配線とリフレッシュ回数リセットは golden 非カバー**＝実機通し確認と対で締める。
- **2026-08-04 続き343（🏁§3 タスク12(lxvii) 残0クローズ＝CPU ターンのフェイズ/ターン境界トリガー統一）後の値**：golden **1354→1357**（+3＝①CPU＝guest をターンプレイヤーとした6 timing の pure collector 戻り〔entries の `playerId`・人間側 usageLimit 不消費〕②CPU ターンでの `any_opp` watcher 発火と解決主体 ③**影響母数の固定**〔`ON_TURN_END` 187／`ON_ATTACK_PHASE_START` 非 self 57／`ON_MAIN_PHASE_START` 31／`ON_TURN_START` 3／`ON_LRIG_ATTACK_STEP_START` 1／`ON_GROW_PHASE_START` 2〕）、census **1288 据置**、smoke **10679/10679** 全0・SKIP0、fuzz 全0、lint 0 errors/**245 warnings 据置**（ローカル248は未追跡の残置 `scripts/_dbgFresh.ts` の3件ぶん）、manual field loss 0、同型★0・held **258枚／109群 据置**（**parser も JSON も触っていない**）。**live JSON は完全不変**（**新語彙0本**・`BattleAction` も 18種のまま）＝触った層は `BattleScreen.tsx` のみ（`collectCpuTurnTriggers` 新設＋CPU 5経路への配線＋【ハスターリク】の side 是正＋当該遷移を `SET_TURN_PHASE`→`ADVANCE_TURN_WITH_STATE`）。⚠**CPU 経路の配線は golden 非カバー**＝固定できるのは pure collector の戻りと母数まで。**実機通し確認と対で締める**。
- **2026-08-04 続き342（🏁§3 タスク12(xcv) 残0クローズ＝「能力を持たない」判定の統一）後の値**：golden **1350→1354**（+4＝①`WXEX2-30` の場離れ置換〔バニッシュ/手札戻し/トラッシュ/エナ送り/除外/デッキ戻しの6経路・能力持ちは素通り・メインフェイズでは不成立・宣言者不在・victim が自分側でも成立・`abilities_removed`〕②`ABILITY_CHECK_ELSE_TRASH` の「それ」＝直前 BOUNCE が戻したカード／**効果元シグニが場に残ること**＝旧バグの再発検知／対象なしで盤面不変 ③live 母集団の内訳固定〔STUB 3枚・条件形2枚・宣言1枚〕④**マルチエナ持ちを「能力なし」に倒さないこと**を条件側・置換側の両方で）、census **1288 据置**、smoke **10679/10679** 全0・SKIP0、fuzz 全0、lint 0 errors/**245 warnings 据置**（ローカル248は未追跡の残置 `scripts/_dbgFresh.ts` の3件ぶん）、manual field loss 0、同型★0（265群）・held **258枚／109群 据置**（**parser も JSON も触っていない**）。**live JSON は完全不変**（`public/data/` に差分なし・**新語彙0本**＝engine の action/condition 型は増えていない）＝触った層は `execUtils`（`hasNoAbility` 新設＋`LAST_PROCESSED_HAS_NO_ABILITIES` の委譲）・`execStubPart2`（STUB 2件）・`effectExecutor`（置換1本＋離場11経路への配線）。⚠**修正前は3箇所とも常に no-op**＝計器には一切映っていなかった（smoke も census も緑のまま）＝**実機確認と対で締める**。⚠`docs/STUBS.md`／`grouped_all.txt` の差分には 2026-08-01 以降の未再生成ぶん（続き333〜341 由来）が含まれる。
- **2026-08-04 続き341（🏁§3 タスク12(xcii) 残0クローズ＝相手の盤面を参照するコスト軽減8枚）後の値**：golden **1346→1350**（+4＝①相手の場を数える軽減〔凍結2体・**シグニ不在ゾーンの凍結フラグは数えない**・【ウィルス】2つ・素のシグニと能力持ちの区別・`abilities_removed`〕②合算形の自分側/相手側/両方0と累積形の3状態③相手コイン枚数とライフ枚数比較〔多い/同数/少ない/**相手状態が無ければ減らさない**〕④**相手盤面フルの全数走査＝アーツ/スペル/ピース1236枚のうち動くのは8枚だけ**を期待コスト文字列まで固定）、census **1288 据置**、smoke **10679/10679** 全0・SKIP0、fuzz 全0、lint 0 errors/**245 warnings 据置**（⚠ローカルで248に見えるのは**未追跡の残置ファイル `scripts/_dbgFresh.ts`（3件）**が混じるため＝ベースライン commit の worktree で実測して245を確認済み。本作業の増分は**0**）、manual field loss 0、同型★0・held **258枚／109群**（いずれも前回据置＝**parser も JSON も触っていない**）。**live JSON は完全不変**（`public/data/` に差分なし・**新語彙0本**）＝触った層は `costs.ts`（`CostReplaceCtx.oppState` の型拡張＋規則5本）と `BattleScreen.getMyLrigDeckCardActions`（実効コスト算出を `ArtsModal` Phase1 と同式へ統一）のみ。⚠**コスト表示・請求は golden 非カバー**（純関数 `computeArtsEffectiveCost` までは固定済み）＝実機確認と対で締める。
- **2026-08-03 続き340（§3 タスク12(xc) 37枚実装＋🏁(xci) 残0クローズ）後の値**：golden **1343→1346**（+3＝①新規規則が**条件成立時だけ**効くこと〔A/D/C/E/H の成立・不成立の対、既存 ＜クラス＞規則の回帰、`SP36-001` の3状態〕②**過剰適用ゼロ**の全数走査〔アーツ/スペル/ピース 1236枚を空盤面で走査し0枚〕③(xci) の対象2枚が実在しスペルであること＋対象名以外/カード名不明/発生源不在では何もしないこと）、census **1288 据置**、smoke **10679/10679** 全0・SKIP0、fuzz 全0、lint 0 errors/**245 warnings 据置**、manual field loss 0、同型★0・held **258枚／109群**（いずれも前回据置＝**parser も JSON も触っていない**）。**live JSON は完全不変**（`public/data/` に差分なし・**新語彙0本**）＝触った層は `costs.ts`（規則6本追加＋既存2本の是正＋`applySpecificCardCostReduction` 新設）と3モーダルの呼び出しのみ。⚠**コスト表示・請求は golden 非カバー**（純関数 `computeArtsEffectiveCost` までは固定済み）＝実機確認と対で締める。
- **2026-08-03 続き339（🏁§3 タスク12(lxxxvi)＋(lxxxvii) 残0クローズ）後の値**：golden **1341→1343**（+2＝①ベット持ちスペル7枚の母集団固定〔`ON_COIN_PAID` 収集自体は BattleScreen 層＝非カバー〕②場の CONTINUOUS 軽減が効くべきカットインアーツ3枚＋青以外は効かないこと）、census **1288 据置**、smoke **10679/10679** 全0・SKIP0、fuzz 全0、lint 0 errors/**245 warnings 据置**、manual field loss 0、同型★0・held **258枚／109群**（いずれも前回据置＝**parser も JSON も触っていない**）。**live JSON は完全不変**（`public/data/` に差分なし・live per-effect changed 0・**新語彙0本**）＝触った層は `CutinModal`（`artsBaseCost` 追加）と `castSpell`（`collectCoinPaidTriggers` 追加）のみ。⚠**コスト表示とコイン反応の発火順序は golden 非カバー**＝実機確認と対で締める。
- **2026-08-03 続き338（🏁§3 タスク12(lxxxix) 残0クローズ＝使用時の任意支払い「場のシグニをトラッシュ」2枚）後の値**：golden **1339→1341**（+2＝①場のシグニ払いの後始末〔2ゾーン払いで下のカード・チャーム→トラッシュ／ソウル→ルリグトラッシュ／ダウン・凍結フラグのリセット／選んだゾーンだけ空く／ダウン中でも候補／`WX25-P1-110` のクラス・レベルフィルタ〕②`QUEUE_SPELL` の `effectStack` 指定時のみ `effect_stack` を書く。併せて (lxxxv) の3テーブルを 31→33 へ更新）、census **1288 据置**、smoke **10679/10679** 全0・SKIP0、fuzz 全0、lint 0 errors/**245 warnings 据置**、manual field loss 0、同型★0、held **257枚／109群 → 258枚／109群**。**live per-effect 差分＝changed 2／added 0／removed 0**（2枚とも「先頭1本除去のみ」で完全一致＝相乗りドリフトなし）。**新語彙 0本**＝engine の action/condition 型は増えていない（`BattleAction` も 18種のまま＝`QUEUE_SPELL` の payload 拡張のみ）。⚠**支払いUI・離場トリガーの発火順序は golden 非カバー**＝実機確認と対で締める。
- **2026-08-03 続き337（§3 タスク12(lxxxv)＝使用時の任意支払いによるコスト軽減 31枚）後の値**：golden **1334→1339**（+5＝①対象31枚の spec と軽減後コスト〔支払い元・上限・比例/固定・1枚時・上限時・0枚時の据え置き〕②除外5枚を読まないこと〔理由つき〕③固定形の「ちょうどN枚」境界と候補フィルタ④**5ゾーンすべての支払いが盤面を正しく動かすこと**⑤**31枚の解決中の支払いステップが live から落ち、かつ本体ステップが残っていること**＋据え置き2枚の先頭は不変）、census **1288 据置**、smoke **10679/10679** 全0・SKIP0、fuzz 全0、lint 0 errors/**245 warnings**（+5＝新規2ファイル分）、manual field loss 0、同型★0、held **259枚／110群 → 257枚／109群**。**live per-effect 差分＝changed 31／added 0／removed 0**（29枚は「先頭1本除去のみ」で完全一致・残2枚は採用に相乗りした既存ドリフトで `WX07-024` は純増）。**新語彙 0本**＝engine の action/condition 型は増えていない（UI 層の純関数モジュール `useTimeCost.ts` を新設し、parser は先頭ステップを落とすだけ）。⚠**支払いUIとコスト再計算は golden 非カバー**＝実機確認と対で締める。
- **2026-08-03 続き336（🏁§3 タスク12(lxxxiv) 残0クローズ＝スペルカットインのベット宣言UI）後の値**：golden **1333→1334**（+1＝`FINISH_CUTIN` の `effectStack` 指定時のみ `effect_stack` を書く〔省略＝不干渉は既存2件が保証〕。併せて既存のコスト置換テストに**対象8枚の `parseBetOptions` 段階＋`Timing` にカットインを含むこと**と `WX17-019` のベット時《青×0》を追加＝**ベットUIの枚数ボタンはこの options から出る**ので空になれば落ちる）、census **1288 据置**、smoke **10679/10679** 全0・SKIP0、fuzz 全0、lint 0 errors/**240 warnings 据置**、manual field loss 0、同型★0、held **259枚／110群 据置**。**parser/effects JSON は完全不変**（`public/data/` に差分なし・live per-effect changed 0・**新語彙0本**＝`BattleAction` も 18種のまま〔`FINISH_CUTIN` の payload 拡張のみ〕）。触った層＝`CutinModal`／`useCutin`／`handleCutinUse`／`battleController`。⚠**ベットUIと支払い配線は golden 非カバー**（BattleScreen/モーダル層）＝実機確認と対で締める。
- **2026-08-03 続き335（🏁§3 タスク12(lxxxi) 残0クローズ）後 最新値**：golden **1331→1333**（+2＝`SET_CARD_COST_REPLACEMENT` の engine 書き込み〔クラフト追加との順序・置換後コスト・**同名再設定の後勝ち**〕と UI 読み取り〔別カード名には効かない〕／任意支払い2枚の仕様・未払い/支払い済み・**多色シグニのバックトラック**・境界〔1枚/3枚/クラス違い〕・**母集団は実測2枚だけ**・**先頭 `OPTIONAL_COST` が live から落ちていること**）、census **1289→1288**（`コスト:《コイン》` に《コイン×0》較正を追加＝STUB を実アクション化して表に出た偽陽性の是正。**`BASELINE_HIGH - 2` の暫定オフセットも解消**＝ゲート値は `BASELINE_HIGH` そのもの）、smoke **10679/10679** 全0・SKIP0、fuzz 全0、lint 0 errors/**240 warnings 据置**、manual field loss 0、同型★0、held **259枚／110群**（`WXK03-002` 採用で元に戻った）。**live JSON の変更は全5ファイルで3カードのみ**＝`WXK03-002`（heldReview 採用）／`WX21-035`・`WX21-071`（MANUAL＝PRESERVE 保護のため**外科パッチ**）。**新語彙 1本＝`SET_CARD_COST_REPLACEMENT`**（＋`PlayerState.card_cost_replacements`）。⚠**支払いUI（`SpellCastModal` の任意支払い）とコスト算出は golden 非カバー**＝実機確認と対で締める。
- **2026-08-03 続き334（§3 タスク12(lxxxi)＝使用コストの条件つき置換）後 最新値（本行が直近の正）**：golden **1330→1331**（+1＝`computeCostReplacement` のベット9枚〔宣言前 null／宣言後の置換値〕・`WX09-Re02` の4状態〔未使用／アーツのみ／スペルのみ／両方＝《白×0》〕・`WX05-038` の場の有無・`WD22-041-UG` の24/25枚境界・`computeArtsEffectiveCost` 経由・**既存「対戦相手ルリグ色」経路の回帰**）、census **1289 据置**、smoke **10679/10679** 全0・SKIP0、fuzz 全0、lint 0 errors/**240 warnings 据置**、manual field loss 0、同型★0、held **259枚／110群 据置**。**parser/effects JSON は完全不変**（`public/data/` に差分なし・live per-effect changed 0・**新語彙0本**＝engine の action/condition 型は一切増えていない）。触った層＝`src/screens/battle/costs.ts`（新関数1本）＋`ArtsModal`／`SpellCastModal`／`BattleScreen.getCardActions` のコスト算出呼び出し。⚠**コスト算出は UI 層＝golden から叩けるのは純関数 `computeCostReplacement` までで、モーダルのベット宣言→再計算→支払い検証の配線は非カバー**＝実機確認と対で締める。
- **2026-08-03 続き333（🏁§3 タスク14 完了・5バッチ）後 最新値（本行が直近の正）**：golden **1326→1330**（+4＝`SET_TURN_PHASE` の状態/スタック任意〔キー集合＋null 明示クリア〕／`WRITE_STATE.markCutinResponseComplete`〔既存フィールド温存・**盤面側を書き換えない純粋性**・省略時はキー無し〕／`WRITE_STATES` の片側・両側・スタック省略・空 states／`RESOLVE_EFFECT_STEP.beginNextTurn` のキー集合・`turn_count` 現盤面+1・省略時はターン関連キー無し）、census **1289 据置**、smoke **10679/10679** 全0・SKIP0、fuzz 全0、lint 0 errors/**240 warnings 据置**、manual field loss 0、同型★0、held **259枚／110群 据置**。**parser/effects JSON は完全不変**（BattleScreen 構造のみ＝`public/data/` に差分なし・live per-effect changed 0・**新語彙0本**）。**reducer 経由 102/117→118/118（＝残0）・`BattleAction` 17→18種**（+`WRITE_STATES`。`SET_TURN_PHASE`／`WRITE_STATE`／`RESOLVE_EFFECT_STEP` は payload 拡張）。⚠**ハンドラ側の payload 構築は golden で検出できない**（golden は純粋関数のみ）＝**この作業は実機通し確認と対で締める**。
- **2026-08-03 続き332（§3 タスク14 Stage3・5バッチ）後の値**：golden **1317→1326**（+9＝`RESOLVE_EFFECT_STEP` 4本〔継続/完了・settle の3分岐・スペル解決のキー集合・**新スタックが settle に勝つ順序**〕／`BEGIN_NEXT_TURN` 2本〔`turn_count` +1・**追加ターンは `active_user_id` を書かない**〕／`ADVANCE_TURN_WITH_STATE` の opp/effectStack 任意／`WRITE_STATE` の条件式 undefined／`RESOLVE_JANKEN` の勝敗・あいこ非対称）、census **1289 据置**、smoke **10679/10679** 全0・SKIP0、fuzz 全0、lint 0 errors/**240 warnings 据置**、manual field loss 0、同型★0、held **259枚／110群 据置**。**parser/effects JSON は完全不変**（BattleScreen 構造のみ＝`public/data/` に差分なし・live per-effect changed 0・**新語彙0本**）。**reducer 経由 72/117→102/117・`BattleAction` 14→17種**（+`BEGIN_NEXT_TURN`／`RESOLVE_EFFECT_STEP`／`RESOLVE_JANKEN`）。⚠**ハンドラ側の payload 構築は golden で検出できない**（golden は純粋関数のみ）＝**この作業は実機通し確認と対で締める**。
- **2026-08-02 続き330 第6波後の値＝🏁(lxxxii) 再クローズ**：golden **1312→1317**（+5＝①「Mつまで＝upTo／Mつ＝upTo無し」の両方向 ②`WX20-007-E1` の前置2本保持＋CHOOSE 3択 upTo＋③の suppressOnPlay ＆宙ぶらりん BLOCK 不在 ③採用5効果の choose_count/from_count/upTo とコスト減 marker 保持 ④`WXK08-003-E1` ③の OR ゲート ⑤curated 直書き4件と MANUAL 外科パッチ2件の upTo）、census **1289 据置**、smoke **10679/10679** 全0・SKIP0、fuzz 全0、lint 0 errors/**240 warnings 据置**、manual field loss 0、同型★0、held **264枚／115群 → 259枚／110群**。live per-effect 差分＝**changed 44／added 0／removed 0／outlier 0**（内訳＝**upTo 追加のみ 38**〔機械検証＝`upTo` を剥がすと before と完全一致・それ以外の変化 0〕＋**構造復元 6**〔held 5枚＋`WX20-007`〕）。**新語彙 0本**＝`ChooseAction.upTo` も `ARTS_USED_THIS_TURN`／`SPELL_USED_THIS_TURN`／`OR` も**すべて既存**で、engine/UI も対応済みだった（`effectExecutor.ts:3731`／`EffectInteractionModal.tsx:509,524,967`）＝**parser が語彙を生成していなかっただけ**。⚠**「parser を直した」＝live に届いた、ではない**＝curated 直書き上書き（`STATE_COND_BATCH4_ACTIONS`）と MANUAL の PRESERVE 保護の2群は parser 修正が無効なので、**毎回 live を実測してから件数を締める**。
- **2026-08-02 続き330 第5波後の値**：golden **1311→1312**（+1＝`PR-Di013-E1` を **`manualEffect()` 経路と JSON 生読み経路の両方**で同一検証。スペルの発生源を `field.check` に置き、**①選択直後は手札不変／ルリグアタック時に初めて1枚引く**という即時実行と能力付与を区別する assert、`once_per_turn`、2回目不発火、ターン終了時消滅、支払い時 count=2／未払い時 count=1、2枝同時選択で両方付与、フラグ消費まで固定。`withSavedCursor` 済み）、census **1289 据置**、smoke **10679/10679** 全0・SKIP0、fuzz 全0、lint 0 errors/**240 warnings 据置**、manual field loss 0、同型★0、held **264枚／115署名 据置**。live per-effect 差分＝全5ファイルで **changed 1（`PR-Di013-E1`）**／added 0／removed 0／outlier 0。**新語彙 1本＝`CHOOSE.additionalCostChoose`**（保持効果は live 全数で1件。engine 変更はすべて同フィールドのガード内＝既存 CHOOSE・既存 `OPTIONAL_COST` は分岐に入らない）。⚠**PRESERVE 保護カード（既存 JSON が MANUAL/PARTIAL）は `manualEffects.ts` を書いても JSON に出ない**＝外科パッチが要る（第5波の差し戻し理由）。
- **2026-08-02 続き330 第4波後の値**：golden **1308→1311**（+3＝`WD23-044-EA-E1` の支払/未払 2分岐と両枝の盤面効果／`WX26-CP1-024-E1` の支払時 count=2・未払時 count=1／⛔完動2件の現状固定。`withSavedCursor` 済み）、census **1289 据置**、smoke **10679/10679** 全0・SKIP0、fuzz 全0、lint 0 errors/**240 warnings 据置**、manual field loss 0、同型★0（265群）、held **264枚／115署名 据置**。**生成 JSON は完全不変**（engine-only＝`public/data/` に差分なし・live per-effect changed 0）。**新語彙 0本**。
- **2026-08-02 続き330 第3波後の値**：golden **1307→1308**（+1＝`WXK08-002-E1` のアーツ3択。**発生源を `field.check` に置いてアーツ実戦経路と揃え**、CHOOSE 1/3・前置 marker 保持・①③の**両盤面 JSON 完全一致 no-op**・②の両陣営候補/0-1-2体/3体拒否/合計10000超拒否を**実行で**固定。`withSavedCursor` 済み）、census **1289 据置**、smoke **10679/10679** 全0・SKIP0、fuzz 全0、lint 0 errors/**240 warnings 据置**、manual field loss 0、同型★0（265群）、held **265→264枚／116→115署名**（`WXK08-002` が MANUAL 化で抜けた＝**解決ではなく curated 固定**。⚠**残り6枚の採用禁止在庫**〔`WXK05-002`/`WXK05-004`/`WXK07-002`/`WXK08-001`/`WXK08-003`/`SPK01-14`〕は held に残存を確認済み＝触っていない）。live per-effect 差分＝**全5ファイル**で `changed 1`（`WXK08-002-E1`）／added 0／removed 0／outlier 0。`build:effects` 冪等（md5 不変）・生成 JSON の日本語健全（`???` 0）・regen 差分は sheet4 当該行のみ。**新語彙 0本**（engine は `totalPowerMax` の `count` 反映＋`resumeSelectTarget` の上限 slice のみ＝既存4件は `count:"ALL"` で非影響）。
- **2026-08-02 続き330（タスク12(lxxxii) 第1波＋第2波＝文中 CHOOSE 脱落 計4効果／**codex-work 実装・Claude 検証**）後の値**：census **1289 据置**（⚠4効果とも census の高シグナル語彙に**載っていない**＝実働化しても数字は動かない。`BASELINE_HIGH` 変更なし）、golden **1305→1307**（+2＝第1波1本〔`SEQUENCE[marker, CHOOSE{1/3}]` と3選択肢の condition〕／第2波1本〔同型3件をまとめて。**前置の支払い action と `CONDITIONAL{IS_MY_TURN}` 慣例包みが消えていないこと**・`suppressOnPlay`・②の `TURN_OWNER{opponent}` を assert〕。いずれも `withSavedCursor` で共有 `cursor` を save/restore 済み）、smoke **10679/10679** 全0・SKIP0、fuzz 全0、lint 0 errors/**240 warnings 据置**、manual field loss 0、同型★0（5986枚・265群）、held **258→265枚／署名グループ 109→116**（⚠**増分 +7カードは「採用禁止」在庫**＝parser 緩和が MANUAL/PARTIAL 温存カードの fresh にも波及したもの。live 非影響だが `WXK08-002` の fresh には退化4点あり。明細は [PLAN_DETAIL.md](./PLAN_DETAIL.md)「2026-08-02 整理③」の (lxxxii) 行と BUGFIXES 該当節。⚠**codex 報告の 266 は誤りで 265 が正**＝`node scripts/heldReview.mjs` で数え直すこと）。live per-effect 差分は第1波 **changed 1**（`WXK09-004-E1`）／第2波 **changed 3**（`WD21-008-E1`／`WX20-003-E1`／`SPK01-07-E1`）、いずれも added 0・removed 0・**スコープ外 outlier 0・兄弟効果変更0**。`TURN_OWNER` 保持効果 **23→24**。**新語彙 0本**＝既存救済規則（`effectParser.ts:5730-5765`）の適用条件を緩めただけ（第1波＝前置が非 SEQUENCE でも拾う／本数 2→1／marker id に `ARTS_COST_REDUCTION_BY_CENTER_LRIG` を追加。第2波＝許可する前置の木に「任意支払い action ＋ `CONDITIONAL{IS_MY_TURN}` に包まれた marker」を**狭く固定**して追加）。
> **過去の計測履歴 48 行（続き298〜328 ほか）は [PLAN_DETAIL.md](./PLAN_DETAIL.md)「2026-08-02 整理②」節へ退避**（2026-08-02）。**直近の正は上の1行**。以後もここには最新1件だけを置き、旧行は同節の先頭へ移す。
- **🆕 2026-07-30 タスク12(xxix) 15波後の最新値（本行を (xxix) 系の正とする）**：**任意cost【出】母集団 981／`optionalOnPlayCostStub` で写せない 4**（＝`costUnparsed` の4件のみ。**すべて明示保留＝理由つきで不発を維持**しており `OPTIONAL_ON_PLAY_COST_REF_DEFERRED` は**0件**。内訳と保留理由は §4 進捗サマリ参照）。**`costUnparsed` 総数 21／AUTO・ON_PLAY・任意 4**。⚠**ゲート値（golden/census/smoke/held）は上の 2026-07-30 タスク12(l) 行が正**（本行の 15波時点の値は 1075／1394／10726／292枚 で、その後 (l) で更新された）。⚠**80/71/59/54/43/35/33/27/20/15/12/10/8/6 等の旧値は母数が違う**（波ごとに新語彙が増えたため）＝**投入前に必ず `npx tsx scripts/archive/xxixResidualCensus.ts` で数え直す**（実関数 `optionalOnPlayCostStub`／`wrapOptionalOnPlay` を import して live JSON を全数走査する計測スクリプト。簿記の数字は信用しない）。
- **P1 表現①の systematic 指標**：同型★0（`node scripts/groupSimilar.mjs --all`）。**held は 259枚／署名グループ 110件（2026-08-02 続き330＝タスク12(lxxxii) **第6波**の後に `node scripts/heldReview.mjs` で実測。⚠**第1波が「採用禁止」と書いた +7カードのうち5枚は誤判定だった**＝`WXK08-002` の退化を根拠に巻き添えにしていたもので、実測すると live 側が「選択肢1本に平坦化＝強制実行」で壊れていた（第6波で採用済み）。**held の「採用禁止」ラベルは根拠カードごとに検証してから従うこと**。旧 265枚/116件＝第2波後の実測。⚠第1波の簿記に codex 報告の 266 を書いてしまい第2波で訂正＝**codex の集計値は鵜呑みにせず数え直す**。⚠第1波の簿記に codex 報告の 266 を書いてしまい第2波で訂正＝**codex の集計値は鵜呑みにせず数え直す**。⚠**直近 +7カードは「採用禁止」在庫**＝parser 緩和が MANUAL/PARTIAL 温存カードの fresh にも波及したぶんで、`WXK08-002` の fresh には退化4点がある＝[PLAN_DETAIL.md](./PLAN_DETAIL.md)「2026-08-02 整理③」の (lxxxii) 行を読んでから採る）。旧 258枚/109件＝2026-08-02 (lxxxiii) 第15波後。旧 251枚/99件＝2026-08-01 タスク12(lxxvii) 実働化後（+1 は honest defer＝`WXK03-069`）。旧 288枚/106件＝2026-07-30 タスク12(lxi) 本消化後の値で、以下の内訳はその時点のもの。**内訳＝lxi 規則で新たに 24枚 held に落ちたが、その24枚と既存2枚〔`WX24-P1-071`／`WX25-P1-005`〕を同じ回で全採用したので、正味は前回 290枚から −2**。旧 290枚/107件＝§6.3 H 節クローズ後。旧 286枚＝タスク12(l) 後。旧 292枚/107件＝(xxix) 15波後。⚠2026-07-29 の5波後は 293枚だった。⚠従来ここに書いていた「251枚」は `21a24900` 時点の値で、その後の parser/manual 変更ぶんが `_held_review.txt` に反映されていなかっただけ＝ベースラインコミットの worktree で再生成して 293/107 の一致を確認済み・`node scripts/heldReview.mjs`）。LOSS/VALUE は held 188 / LOSS 154 / VALUE 34（2026-07-19 実測・`npx tsx scripts/parserWorklist.ts`・⚠HEAD比較＝未コミットJSONは反映されない）**。続き29時点（held 79）からの増加は主に**その後の parser 改善で fresh が curated より正しくなった採用待ちバックログ側**（Sonnetタスク6の採用サイクルで消化してから実数を締め直す）。**この数字からさらに増えたら回帰**（JSON手パッチ時は パーサー同修正 or MANUAL化 or ここを実数更新）。旧内訳の詳細は PLAN_DETAIL 参照。
- **脱落疑い 255枚を全分類済み**（偽陽性179／機構待ち72／修正済・`node scripts/_dropTriage.mjs`）。
- **timing flatten**（当初159枚の実バグ）は R5-R58 で完了＝VALUE 0（詳細 §7下部）。
- **🆕 語彙センサス（過剰効果＋幻覚＝両方向の計器）**：`npm run census`（`scripts/vocabCensus.ts`）。**現ベースライン＝高シグナル欠落 1291【効果単位】**（2026-08-02 task12(lxxxiii) 第7波＝leave-field trigger 主語1効果の live 忠実化、1294→1293）（🏁 P1完了宣言〔2026-07-23〕の凍結基線1581から、§6.3個別機構の消化で逓減中。1393→1391 は本セッションの構造化2件ぶん）。**宣言後の推移チェーン（1581→1393 の各バッチ内訳）は [PLAN_DETAIL.md](./PLAN_DETAIL.md)「2026-07-30 整理：census 推移チェーン」節へ退避**。宣言後は worklist ではなく回帰ゲート＝**この数字から増えたら回帰（exit 1）／減ったら `BASELINE_HIGH` とここを実数更新**（新規 parser バッチは切らない）。前提＝`docs/_effect_srctext.json` が最新。3分類〔§6.3送り282／粗網のみ116／長テール1183〕は [P1_COMPLETION_ROADMAP.md](./P1_COMPLETION_ROADMAP.md) 冒頭。明細 `docs/_vocab_census.txt`、**宣言前のバッチ逓減履歴（1919→1581）と旧計測は [PLAN_DETAIL.md](./PLAN_DETAIL.md) §4 の退避節**／BUGFIXES 続き109以降。
- **census 現行補正（第14波）**：高シグナル欠落 **1289**（`WXDi-P14-087-E1` のクラッシュ元限定 live 実働化で 1290→1289）。上行の長期推移文中に残る1291は旧値。
- **母数**：効果カード 5975／効果 **10679**〔2026-07-30 タスク12(l) で47効果がトップレベルから付与入れ子へ移り 10722→10679〕／旧 10719／MANUAL効果 891／STUB含むカード 1862・STUBノード 2432（2026-07-19 実測更新。STUBS.md サマリーと整合）。
- **A3クローズ＋B機構全完了（B1-B4）**。残るP1機構＝C（engine実機配線・P2）のみ。同型★0（5986枚）。
- **decompile再生成は `npm run regen`**（全シート＋下流一括・UTF-8直書き＝シェル非依存。2026-07-07にリダイレクト方式を廃止。旧「⚠Bash の `>`」問題は解消済みだが、万一 UTF-16 が混入すると下流3スクリプトがガードで即 exit 1 する）。

### 📌 次の一手（推奨順）
> **cold start＝まず `npm install` → `npm run gates`（全ゲート一括・数秒）が緑になることを確認する。** 現状＝**全ゲート緑（2026-08-06 続き360b＝🏁§3 タスク12(civ)(xcvii)(xcvi)(lxvi) 消化後）**＝golden **1374**・smoke **10679** 全0（SKIP も 0）・fuzz 全0・同型★0・census **1287**（回帰ゲート）・manual field loss 0・lint 0 errors/**248 warnings**（うち3件は未追跡の置き忘れ `scripts/_dbgFresh.ts`）・held **257枚／109群**・実機 driver 既定order **126件**。
>
> **🏁 P1（表現）は 2026-07-23 に完了宣言済み**（宣言・3分類・以後の運用＝[P1_COMPLETION_ROADMAP.md](./P1_COMPLETION_ROADMAP.md) 冒頭／§2 DoD／§5）。**主軸は P2/P3**＝①**§6.3 機構台帳**（宣言で正式送りした282効果の消化先＝正面40・チーム35・ゲームから除外残・アンコール19・動的比較14・ソウル11・ドライブ9 等を機構単位で）②**§7 実機検証** ③**BEHAVIOR_AUDIT（§5a・フェーズ跨ぎで継続）**。
>
> 1. **自分のモデル側のタスク表（§3）から取る**。**Opus の主戦場＝§6.3 の機構実装（機構単位・実IDは `docs/_p1_classification.txt`）＋タスク12 の生き残り在庫**＝現存は **(lv) 残2経路／(lxvi)／(lxxxviii)／(xciii)／(xciv)／(xcvi)／(xcvii)／(c)** の8件。**🏁(xcii)(xcv)(lxvii)(xcviii)(lxviii)(xcix) は 2026-08-04 に残0クローズ**。**(lxx)／(lxxviii)／(lxxxiii)／🏁(lxxxii) は 2026-08-02 に残0クローズ＝§3 の表から退避済み**（完了行原文は [PLAN_DETAIL.md](./PLAN_DETAIL.md)「2026-08-02 整理③」）。それ以外の残0在庫の完了行原文は同ファイルの各整理節。**🏁タスク16 も残0クローズ**。**Sonnet の主力は タスク1（§7 実機検証）**＝未検証UIの単一 worklist は §7 に集約。⚠**§6.3 H と続き298〜Batch F の全件が UI 未検証**。
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

### 5d. 1効果ずつの原文照合（2026-08-07 続き369 新設・**現在の主戦場**）

**目標＝「すべてのカードが完璧に動作する」に必要な、効果単位の修飾脱落を全数是正する。** §5c の文型バッチが
届かない**単発テール**が本体で、**母集団は約874効果**（census 高シグナル 1199 のうち単発テンプレにしか現れないもの）。
実バグ率は無作為サンプルで **11/11**（§5c 冒頭の根拠節）。

**⚠この作業の単位は「カード/効果」であって「文型」ではない。** 効果はだいたい parse できていて、
**filter / 対象 / owner / トリガー主語 / 条件節が1つ落ちている**のが典型。

**進め方**
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

> このセクションは機構台帳＝**現存の残作業は下記 C／E／F／G＋J（J-1/J-2/J-4/J-5）に集約**。消化済み機構の実装詳細（フラグ・ファイル・commit）は BUGFIXES 各日付が一次記録（各機構が日付/commit を明記済み）。完了行の原文は [PLAN_DETAIL.md](./PLAN_DETAIL.md)「2026-08-02 整理②」節。

**残作業（現存項目のみ・完了項目は PLAN_DETAIL へ退避済み）**
- **E「引用付与の忠実化」追加在庫（2026-08-02）**＝`WX20-036-CB-E1`／`WX24-P2-010-E1` を (lxxxiii) 第15波から移管。両者は付与された【常】の内側に「あなたの他のシグニ」があり、付与先を source として引用能力内の自己除外・攻撃制限コストを評価する共通機構が必要。外側 action の `excludeSelf` では reader に届かないため、カード固有修正をせず同機構の在庫として扱う。
- **C. IS_MY_TURN 誤変換の未消化サブ系統**＝**fresh 残42効果**（2026-07-27 honest 再生成値。⚠続き284/285 の「33→26件」は消化行を手で削った値だったため訂正＝続き286。**`docs/_partial_report.txt` は `fresh parser` の出力を測る計器で、続き283〜287 の修正は curated JSON への外科的適用なので、消化済み効果もレポートには載り続けるのが正しい**）。**live/curated 側では22効果を消化済み**（続き283=2／続き284 公開軸=9／続き285 ミル・トラッシュ軸=7／続き286 移動軸=1／続き287 誤parseテール=3）。全数分類は `docs/_partial_triage.txt`「2026-07-27 §6.3 段3」節。**共通ブロッカーは「前段 action/STUB が結果を `lastProcessedCards` に記録しない」の一点**で、条件語彙（`LAST_PROCESSED_COUNT_GTE`／`_MATCHES{minCount,operator,distinctName}`／`_LEVEL_SUM`／`_ALL_MATCH`）は既に揃っている。⚠**writer を足すたびに「後段で lastProcessed を読む効果」を実データで全数走査すること**（gates では捕まらない。`TRASH` は既存 reader 50件・`REVEAL_DECK_TOP` 22件・`BANISH`／`TRANSFER_TO_DECK` 各7件＝触るなら全数照合が先）。**✅前段 action 誤parse 3枚は続き287で消化**＝`PR-K049-E1`（両者のデッキ最下ミル結果を合算し、レベル合計6以上で正面−5000）／`WX24-P4-045-E1`（固定した相手シグニを相手ライフへ移し、成功時だけ自身へダブルクラッシュ）／`WX22-043-E1`（手札のアクセアイコン持ちを2枚までエナへ移し、実移動2枚でドロー）。
- **E. 個別カード機構待ち**（続き282で全件を実データ・collector/executorまで再診断）＝**✅WX15-016 は消化**：新キャンセル機構は不要で、既存 `GRANT_LRIG_ABILITY`→防御側 `ON_ATTACK_SIGNI(any_opp)` 収集、デッキトップTRASH記録、`LAST_PROCESSED_MATCHES{hasLifeBurst}`、`SET_CANCEL_OPP_ATTACK_FLAG` を合成して忠実化。**✅WXDi-P06-031 は続き288で消化**：センタールリグ【起】の実ルリグゾーン候補を純関数で固定し、既存の相手場コスト増加collectorをルリグ支払いモーダルへ接続。E2は新 `IS_SELF_DOWN` でパワー+3000とガード追加《無》を同時に限定し、従来 `SEQUENCE` 内で読まれずno-opだったガードSTUBも再帰走査へ是正。**✅WXDi-P08-037 は続き290で消化**：単体`swap` pending/UI基盤を新設し、E2のトップ公開シグニ↔アップ状態自シグニ任意交換を忠実化。「入れ替えない」のUI入力nullはswapだけ空配列へ変換し、`count:'ALL'` の恒等配置規約を維持。【出】はこの経路でON_PLAYを積まないため結果として発動しないが、`suppressOnPlay` 自体はpending保持のみで未参照。配置順列の7状態は従来未追従だった範囲を追加した挙動変更。残＝WX20-028-E2（多重アクセ state・§6.4級）／permanent引用付与残（⚠`GRANT_LRIG_ABILITY.permanent` は既に実装済み。残は主に引用シグニ能力のpermanent/相手付与）／WX17-044（自己除外先 `excluded` は既存だが、トラッシュ起動コスト・トラップ選択・表向き発動・攻撃中対象固定が先）／WXDi-P05-006 choice①（ピースカットイン割込み基盤。着手禁止）／WX25-P3-023-E2（2ターン持続＋相手効果による相手手札移動 collector。E1は発火・ターン2回・微菌条件・択一まで既存）／WDK14-013（**トラッシュ→ビート、4枚条件、ON_BECOME_BEAT連鎖は実装済み。残は複数候補時のプレイヤー選択のみ**）／WX20-Re20（選択数依存コストに加え、能力なしfilter・好きな枚数場出し・出した同一群のターン終了時trashが不足）。**WXEX1-08 は✅続き278で消化済み**。旧「各カード全体が単一の機構待ち」という記載を4項目で訂正。
- **F. 保留**（core改変が過大リスク）＝WXDi-P00-026（さんばかルリグ付与・ルリグ再アタック未実装がブロッカー）／47枚の【使用条件】【チーム】（正規デッキ常時成立で機能等価＝保留妥当）。
- **G. 置換else系統の残（続き269・§3タスク5から正式送り）**＝**B 2件の置換else部分は✅続き289で消化**。SPK06-01-E1 は追加赤0/2/4の三択を同一対話で保持し、対象数1/2/3を排他的に実行（付随するレイラのコイン技回数・次回コスト軽減は既存基盤が無く別途defer）。WXK06-032-E1 は既存 `refresh_count_this_turn` を双方参照し、最初に選んだ同一対象へ－4000/－12000を排他的に適用する。**残はC 13件**（反復、引用能力／ルリグ能力付与、複雑CHOOSE、支払い系ルール等）。CのWXDi-P02-042-E1を再確認したが、相手側のターン中手札捨て枚数を読む条件軸が無いためhonest defer。effectId 全明細と不足機構は `docs/_replace_else_triage.txt`。
- **✅ 完了機構（A 動的コンテキスト追跡／B BANISH_REDIRECT／D レゾナ出現条件トリガー／H タスク12(xxii) の不足機構／J-3 ライフクロス閾値遷移／I `WX25-P3-028-E2`／「正面」サブ機構／消化済み機構の台帳）は [PLAN_DETAIL.md](./PLAN_DETAIL.md)「2026-08-02 整理②」節へ退避**（2026-08-02）。実装詳細の一次記録は BUGFIXES 各日付。**下に残るのが現存の残作業＝C／E／F／G＋J（J-1/J-2/J-4/J-5）と、H・I が残した横展開の教訓**。

- **⚠H が残した横展開の教訓＝UNKNOWN を実装するときは fresh parser の出力を先に測る。** H4 は fresh が主語を見ない `STUB DEPLOY_RESTRICT` を既に吐いており、live の `UNKNOWN` だけが「対戦相手は1体まで」への意味反転を止めていた（採用した瞬間に過剰実行へ反転する型のドリフト）。
- **⚠I の潜在結合（実害なし・将来の落とし穴）**＝`executeSigniOnPlay` の `beatZones`（`Set<number>`）が **`beat_signi` の「場ゾーン index」と `beat_signi_from_trash` の「トラッシュ index」で同じ集合を共有**している。実データで両コストを併せ持つ効果は**0件**（全数走査）なので現状は実害なしだが、将来併記カードが出ると支払いが `ok:false` で**無言 abort** する。併記が現れたら選択集合を分離すること。
- **⚠I の付与ストア走査は `activeCondition` を評価しない**（`effectEngine.ts:3137-3142`）。今日の唯一のエントリ `WX24-P3-069-E1-G` は無条件なので実害なしだが、条件付き CONTINUOUS を付与する効果を足すときは effectsMap 側と同じ `checkActiveCondition` を通すこと。
- **⚠honest defer 継続＝`WX20-Re20`**（選択数依存コスト・能力なし filter・任意複数配置UI・同一instance群のターン終了時 trash が**一体で**要る＝部分実装しない）。

- **J. timing collector 不在の13効果（2026-07-31・タスク16 の `[C]` から正式送り）＝🆕 J-3 消化により実残 11効果**＝原文が【自】なのに**そのイベントを検出する collector が engine に存在しない**群。現在は `timing:[]` で安全停止中＝**放置しても過剰実行は起きない**（着手優先度は低いが、機構台帳としてはここが定位置）。判定根拠は `docs/_timing_census_triage.txt`「2026-07-31 [B]群の停止理由 機械再検証」節に `ファイル:行` つき。**5家族に束ねると1家族＝1バッチで複数枚が同時に開く**：
  - **J-1 他能力の発動監視**（2効果）＝`WX19-066-E1`「あなたの【自】の【英知】能力が発動したとき」／`WXEX1-77-E1`「対戦相手の場にあるシグニの【出】能力が発動したとき」。**他 AUTO の解決開始を横から監視し能力クラス/種別を照合するイベント発行が無い**（`abilityTypes` 型は付与能力側にあるが別用途＝`effects.ts:1475`）。effectStack の push 時にフックを置くのが筋。
  - **J-2 付与・離脱イベント**（4効果）＝`WXDi-D07-004-E1`／`WXDi-D07-019-E1`（【ソウル】が付いたとき・味方/自身）／`WXK10-049-E1`「このシグニにカードN枚が付いたとき」（下敷き等を含む汎用付与＋枚数閾値）／`WXEX2-19-E1`「あなたの【アクセ】N枚がトラッシュに置かれたとき」（アクセ離脱）。**soul/acce の状態と付与能力収集は実在するが、付与/離脱の"イベント"を発火させる collector が無い**（`effectEngine.ts:5302`／`triggerCollect.ts:1787`）。既存 `ON_CHARM_TO_TRASH` がチャーム専用の先例。
  - **J-4 フェイズ／アタック終了 timing**（2効果）＝`WX24-P2-075-E1`「あなたのアタックフェイズ終了時」（`ON_ATTACK_PHASE_START` のみ実在＝終了時の発行/収集が無い）／`WXK11-018-E2`「このシグニがアタックしたアタック終了時」（個別シグニのアタック終了）。⚠**着手するならタスク12(lxvii) と一体で見る**＝フェイズ/ターン境界トリガーは**CPU 側の収集が面で欠けている**ので、新 timing を足しても人間ターンだけの片肺になる。
  - **J-5 単発**（3効果）＝`WXEX1-41-E1`「【トラップ】Nつが**設置**されたとき」（`ON_TRAP_ACTIVATE` は発動専用・設置完了イベントが無い）／`SP27-007-E1`「あなたか対戦相手が《コインアイコン》を**得た**とき」（`ON_COIN_PAID` は減少方向のみ）／`WXDi-P11-010B-E1`「《夢限 -Q-》から《夢限 -A-》になったとき」（named form 遷移）。いずれも既存 collector の**逆方向/別イベント**で、単独では割に合わない。


### 6.4 オープンな実装課題（機構・基盤）
- **配置数制限（`signi_deploy_count_limit`）が効くのは通常召喚UI／CPU召喚の3箇所だけ**（`BattleScreen.tsx:5055`／`SigniSummonZoneModal.tsx:70`／`BattleScreen.tsx:9164`）。**engine 側の効果配置（`execAddToField` ほか）は cap も `signi_deploy_power_limit` も一切見ずにすり抜ける**（2026-07-30 実測）。該当7効果（WXDi-P13-003B-E2／WXK06-004-E1／WX07-006-E1／WX12-008-E1／WXDi-P05-024-E1／WXK05-009-E1／WXK11-074-E1）に共通する既存の穴で、塞ぐと7効果すべての挙動が同時に厳しくなる面配線なので単独バッチが必要。
- **F-3 効果バニッシュ経路（身代わり置換の execBanish フック）**：**残＝`WX17-075`（`ON_PLACED_FRONT` 任意トリガー・別機構）だけ**。`WX06-019`（効果離場+powerReduction）は `findEffectLeavePowerReductionSubstitute`、**`WX25-P1-056`（非バニッシュ離場→バニッシュ置換）は 2026-07-31 に `applyEffectLeaveReplaceBanishSubstitute` を非バニッシュ離場9サイトへ配線して実働化**（タスク12(lx)①）。⚠**3つの離場置換はいずれも「してもよい」を自動適用する決定論的近似**＝対話実装があるのはバトルバニッシュの `BANISH_SUBSTITUTE`（BattleScreen）だけ。実機で選ばせるなら3つまとめて対話化する。
- **CPU AI の拡張**：メインフェイズ AI（アーツ/スペル/起動効果の能動使用・グロウ時トリガー）未実装（→§8）。CPU 召喚の ON_PLAY 解決は「全配置後まとめて」の近似（人間は1枚ごと）。トラッシュ起動の CPU 使用も未。
- **トラッシュ自己起動のコストUI 残**：エナコスト以外（手札捨て/コイン/エクシード/ウィルス除去/アタックフェイズ起動）が未対応。対象: WXDi-P03-087/P07-089/P09-045/P12-053/P16-082/CP01-050・WX11-049・WX17-049・WX19-029（14枚）。
- **UNKNOWN（部分未実装・逆翻訳に`【未実装/UNKNOWN】`として露出）**: 24枚（2026-07-03 実測・`grep '未実装/UNKNOWN' docs/decompile_sheet*.txt`）＝WX05-010（ライフ見て任意トラッシュ→同数補充）／WX11-037（5枚公開→宣言カード手札）／WX11-043（ヘブン時に手札青スペル使用）／WX17-003 のほか、WX06-024／WX09-019-E3／WX17-052／WX20-077／WX21-Re19／WXEX1-32／WXK02-037／WXK07-106／WXK08-030／WX24-P1-035／WX24-P3-022／WX24-P4-038／WX25-P3-036／WX25-P3-050／WX26-CP1-061／WD23-017／WD23-024／PR-431／PR-461／PR-Di007（ジョークカード）。表示上「未実装」と明示されているため無言バグではない。
- **クラフトトークンの実機配置検証＋ADD_TO_FIELD source 近似** ＝**✅WXDi-CP02-087／WXDi-P03-078／WXDi-P05-068（続き114）・WXK07-105（続き125）で実機PASS**（過程で見つかった `resumeSelectTarget` の continuation 握り潰しは✅続き117で修正）。**残＝WX22-001-E3**（STUB `GRANT_LEAVE_PLACE_PENDING` が未実装＝機構待ち・§6.4 上部「UNKNOWN」欄と同様）。経緯は [PLAN_DETAIL.md](./PLAN_DETAIL.md) §6。
- **golden の型網羅**：DSLアクション型のうち golden 未カバーの型を洗い出し、1型1テストで追加（現503件・2026-07-19）。
- ~~smoke SKIP の解消~~ **✅解消済（現 SKIP 0・2026-07-19 実測）**。
- **`checkAllEffects` の `MANDATORY_SUSPICIOUS`**（ヒューリスティック検出）の精査。`verifyEffects` の「定義なし」誤検出（注釈・トークン）の除外改善。
- **生ID残存＝表示or実装の穴**：`[STUB:X]` 系の残存は `STUBS.md` で管理（フォールバック20種・2026-07-19 再生成）。`[条件:X]`/`[アクション:X]` は解消済み。

---

## 7. フェーズ3残作業：実機挙動（P3）

**目標＝実機で各カードがルール通り動く。** `scripts/verifyBattleDrive.mjs` のシナリオ横展開パターン確立済み（1件＝`scenarios` テーブルに1行追加）。**発火条件は golden で自動検証済みなので実機は「総合動作」だけ**に絞る。

> **実機ヘッドレス検証が可能（2026-06-30〜）**：`scripts/verifyBattleDrive.mjs`＝実ログイン→CPU戦→盤面注入→実UIクリックで効果発火→観測。手順は [VERIFY_BROWSER.md](./VERIFY_BROWSER.md)。**下記の宿題のうち `ON_TARGETED`／`ON_SIGNI_BANISH_OPPONENT_BY_EFFECT`／`ON_LRIG_UNDER_MOVED`／`ON_LRIG_GROW`／`ON_COIN_PAID`／`ON_DECK_SHUFFLED` は「発火すること」自体は既に実UI検証でPASS済み**（`ontargeted`/`banishbyeffect`/`lrigundermoved`/`cpugrow`/`deckshufflespell` 等の既定シナリオ）。**各項目末尾の「follow-up」注記（未カバー経路）だけが真に未検証のまま残っている**。

**engine 配線済み timing（C1 群・R30-R46）は✅ほぼ全項目 実機PASS**（続き57-64・112-128）。**個別の PASS 記録・修正経緯は [PLAN_DETAIL.md](./PLAN_DETAIL.md) §7 に退避**。

**残る実機検証項目（これだけが未消化＝Sonnetタスク1 の単一 worklist。§4 進捗サマリと二重に持たない＝新しい未検証UIが出たらここへ足す）**：

- **✅ タスク16 残0クローズ（`WXDi-P06-038`／`WX05-020`／`WXDi-P13-051`）が持ち込んだ未検証UI 3件（2026-07-31→2026-08-05クローズ）**
  - [x] **`WXDi-P06-038`（翠美姫 アン//メモリア）**＝✅2026-08-05・Sonnet・`verifyBattleDrive.mjs energyLeftAnyZoneTrigger`で実機確認（2回連続PASS）＝自分のエナゾーンから効果でカードが**トラッシュ以外**（手札）へ動いたとき（WXEX1-42の自己完結する【出】で自身のエナから植物シグニを手札へ）にも`energyLeftToAnyZone`で【エナチャージ１】が発火することを確認（デッキ先頭カードがエナに加わった）。**コスト支払い経路との区別・《ターン1回》超過時の非発火は未個別実機**（低優先＝collector側のusageLimit/コスト経路除外は既存の共通機構に依拠）。
  - [x] **`WX05-020`（羅輝石 ダイヤブライド）**＝✅2026-08-05・Sonnet・`verifyBattleDrive.mjs doubleCrashUpTrigger`で実機確認（2回連続PASS）＝①【ダブルクラッシュ】で1アタック2枚同時クラッシュ→「1ターンに合計2枚以上」条件成立でE1（アップ）が発火しsigni_downがfalseへ復帰することを確認。②の足し方（アタック1枚＋E2アーツ被弾1枚）と**ターンまたぎのリセット**は未個別実機（低優先＝`crashedTotalThisTurn`の閾値比較・`life_crashed_by_signi_this_turn`のターンリセットは共通機構でgolden済み）。
  - [x] **`WXDi-P13-051`（翠美姫 アン//ディソナ）**＝✅2026-08-05・Sonnet・`verifyBattleDrive.mjs oppResourceLossChoose`で実機確認（2回連続PASS）＝相手効果（WXDi-D07-013）で自分のエナがトラッシュされたときに誘発しCHOOSE「引く／エナチャージ」がCPU自動応答で選択されること（従来の「エナチャージ無条件」ではなく2択が実際に生成されることを`pEff=CHOOSE`で確認）を確認。手札喪失経路と「1つの相手効果が両方やった場合は1回だけ」は未個別実機（低優先＝`collectOppResourceLossTriggers`が中央diffで両方を1entryへ畳む設計とコード読解で確認済み）。

- **✅ タスク16 `WXDi-P11-063-E2`（aboveSelf／シグニの下に置かれた）が持ち込んだ未検証UI 2件（2026-07-31→2026-08-05クローズ）**
  - [x] **スペル《無心の豪圧》(`WXDi-P11-063`) をメモリア3種のいずれかの下に置く選択**＝✅2026-08-05・Sonnet・`verifyBattleDrive.mjs spellUnderMemoriaPlace`/`spellUnderMemoriaSkip`（幻怪姫エクス//メモリア＝`WXDi-P11-042`）で実機確認（各2回連続PASS）＝①バニッシュ解決後「無心の豪圧をシグニの下に置きますか？」のCHOOSE（メモリア候補＋「スキップ（トラッシュへ）」）が出ること ②置くとホストのスタック最下部にスペルが入り（`hostZone0=["WXDi-P11-063#1","WXDi-P11-042#1"]`）ホストが+2000されること ③スキップするとトラッシュのまま（+2000は乗らない・スタック不変）ことを確認。⚠この配置経路は **part1 の同名 STUB に食われて長期間到達不能だった**箇所＝UI で初めて実走。**「ターン終了時に戻る」（duration:UNTIL_END_OF_TURN）のターンまたぎ検証は未個別実機**（低優先＝duration機構自体は既存共通処理でgolden済み）。
  - [x] **【常】版4枚の自己バフが止まったこと**＝✅2026-08-05・Sonnet・`verifyBattleDrive.mjs aboveSelfSelfBuffStopped`/`wxdip03057DownUnderRed`で実機確認（各2回連続PASS）＝`WXK08-086`／`WXDi-P03-057`／`WXDi-P05-050`を**単独で場に出しただけ**（下にカードなし）では`host.powerMods`が空＝自己バフが発生しないこと（`effectEngine.ts:1562`のスタック長<2ガードで構造的に保証されている）を確認。対照実験として`WXDi-P03-057`の【起】《ダウン》で他の赤シグニ（`WD02-009`・P12000）の下に潜らせると、そのホストの表示パワーが**12,000→14,000**（aboveSelf+2000）へ実際に上がることも確認（CONTINUOUS/PERMANENTのaboveSelfは`temp_power_mods`に書かれない純計算値のため`temp_power_mods`ではなくDOM表示パワーで判定）。

- **✅ タスク12(lxxiii) が持ち込んだ未検証UI 1件（2026-08-01→2026-08-05に実バグ発見でクローズ）**＝トラッシュ領域移動ロック。engine 側は全効果走査（330→0）と golden で固定済みだが UI 経路は計器に映らない。
  - [x] **`WX24-P4-007-E1`（③まで込み）／`WXDi-P14-005-E1`（選択肢③）を撃った次の相手ターン**に、相手が「あなたのトラッシュから…を手札に加える／場に出す／エナに置く／下に置く／【ビート】にする」系を使おうとしても**候補が0で何も起きない**こと＝**❌FAIL・実バグを発見・Opusタスク12(cvii)へ登録**（2026-08-05・Sonnet・`verifyBattleDrive.mjs trashMoveLockBlocksSelfEffect`／対照`trashMoveLockAllowsWhenUnlocked`で各2回連続再現）。`isOwnTrashMoveLocked`が見る`ctx.currentPhase`を`BattleScreen.tsx`のExecCtx構築6箇所がどこも設定しておらず実UI経路では常に`undefined`＝**ロック機構自体が実ゲームで丸ごと不発**（`lock_trash_move_this_turn:true`を注入してもMAINフェイズで普通にトラッシュのシグニを手札に加えられてしまう）。⚠見るべき境界3つ（①メイン/アタックフェイズ限定 ②そのターンだけ ③相手の効果は止まらない）は、根本のロック自体が効かないため個別検証に進めなかった（(cvii)修正後にあらためて確認）。

- **✅ タスク12(lxi) 第11波が持ち込んだ未検証UI 1件（2026-08-01→2026-08-05に構造的限界を確認しクローズ）**＝**ゾーンを跨いだ選択モーダル**は本プロジェクト初。engine/golden では固定済みだが UI 経路は計器に映らない。
  - [x] **`WXK06-067-E1` の跨ぎプール**＝✅2026-08-05・Sonnet・`verifyBattleDrive.mjs wxk06067CrossZoneStubFires`で実機確認（2回連続PASS）＝【起】《青》＋自身トラッシュで起動するとOPPONENT_PAY_OPTIONAL{opponentHandOrEnergyToDeckTop:2}のSTUBが正しく発火することを確認。⚠**しかし本カードはcostColors非搭載＝Opusタスク12(ci)と同型の穴**（無料「支払う」がoptions配列の先頭かつ常時available）に該当し、CPU自動応答（`options.find(o=>o.available)??options[0]`）は必ず無料pay枝を選ぶため、guestの場/手札/エナは一切変化せず**跨ぎプールのpicker本体（handOrEnergyToDeckTop枝）へ実戦では到達しない**ことを確認（(ci)の影響範囲がさらに1枚拡大）。**跨ぎプールpicker自体のUI描画**（`EffectInteractionModal.tsx`の`self_hand_energy`/`opp_hand_energy`スコープ・「手札とエナから合計」表示・`inter.candidates`経由で(cv)のようなop.hand直接参照バグが無いこと）は**コード読解で確認済み**だが、本カードが非LIFE_BURSTのため`secondWaveEnergyBranch`等のLB所有者反転トリックが使えず、単一アカウントdriverでは実クリックでの検証が構造的に到達不能＝低優先で保留（①②③の跨ぎ選択挙動・手札/エナ合計1枚以下での回避枝非表示・「支払わない」時の相手自己選択は未個別実機のまま）。

- **✅ タスク12(lxi) 第10波（2026-08-01）＋(lxxvi) が持ち込んだ未検証UI＝2026-08-05に(a)(b)+ゾーン供給源2種のうち1種を実機検証完了**＝「シグニを新たに配置できないゾーン」（`BLOCK_OPP_ZONE_PLACEMENT`/`signi_zone_blocks`・`src/screens/battle/signiZoneBlock.ts`）。
  - [x] **(a) 無条件の配置禁止**＝✅2026-08-05・Sonnet・`verifyBattleDrive.mjs zoneBlockUnconditional`/`zoneBlockMultiZones`で実機確認（各2回連続PASS）＝`signi_zone_blocks`注入でSigniSummonZoneModalが対象ゾーンを`ゾーンN (配置禁止) 配置禁止`ラベル＋disabledで表示・選択不可、非ブロックのゾーンには通常どおり配置できることを確認（単一・複数ゾーンの両方）。**「次の相手ターンに昇格」「さらに次のターンで解除」「ライズは禁止されない」「REMOVE_SIGNI_ZONEで消したゾーンがそのターン埋められない」は直接`signi_zone_blocks`を注入する方式では検証範囲外**（`signi_zone_blocks_next_turn`→`signi_zone_blocks`への昇格はターン終了処理の大きな共有コードパスに埋め込まれておりflakeリスクが高いと判断し据置＝低優先）。
  - [x] **(b) 《無》×5 の支払い回避**＝✅2026-08-05・Sonnet・`verifyBattleDrive.mjs zoneBlockColorlessInsufficient`/`zoneBlockColorlessSufficient`で実機確認（各2回連続PASS）＝エナ3枚<5で`《無》×5不足`表示・disabled、エナ5枚でボタン活性化→配置時にちょうど5枚トラッシュへ支払われる（ログ「シグニゾーン{n}への配置コスト《無》×5を支払う」）ことを確認。**CPU側の支払い経路とWXK07-031/WXDi-P00-015等REMOVE_SIGNI_ZONE系4枚の個別実機は未実施**（コード読解＝`BattleScreen.tsx`のCPU自動召喚ループが同一`resolveSigniZonePlacement`を呼ぶ共有関数であることを確認済み・低優先）。
  - [x] **🆕 (lxxvi) のゾーン供給源2種**＝①✅2026-08-05・Sonnet・`verifyBattleDrive.mjs vacatedZoneBlockFollowsActualZone`で実機確認（2回連続PASS）＝`WX08-032-E1`を実際にキャストしてguest zone2（0-index）のシグニをバニッシュ→結果の`signi_zone_blocks`が**zone2に付き、zone0へのフォールバックが無い**ことを確認（state注入では検証できない`signi_zone_vacated_just`の実配線を実際に駆動）。②`WXEX1-24-E1`③（ウィルスゾーン複数禁止）は`signi_zone_blocks`の複数ゾーン描画自体は`zoneBlockMultiZones`で確認済みだが、**当該カードの【起】発動UI自体（コスト`removeOppVirus`消費込み）の個別実機は未実施**（低優先＝DOM描画側は同一コードパスで確認済み）。

- **✅ タスク12(lxi) 第3波が持ち込んだ未検証UI（2026-07-31→2026-08-05に主要部クローズ）**
  - [x] **相手側 CHOOSE の4つ目の枝＝「自分のシグニをNトラッシュに置く」**（`WX22-025-E3`）＝✅2026-08-05・Sonnet・`verifyBattleDrive.mjs wx22025SigniTrashBranch`/`wx22025SigniTrashUnavailable`で実機確認（各2回連続PASS）。**新パターンを確立**＝guest（CPU）をアタッカー＝効果オーナーにすることで「対戦相手」＝host（driver操作アカウント）が応答者になり`respondPlayerId`がCPU_PLAYER_ID以外になってCPU自動応答がbailoutし、host自身の画面にCHOOSEモーダルが実際に描画される（LB所有者反転が使えない非LIFE_BURST効果向けの代替手段＝`wxk06067CrossZoneStubFires`の構造的限界を回避）。①「自分のシグニを1体トラッシュに置く」を明示クリック→②場にシグニが無いとボタンがdisabledになる→③選択すると host自身の場から選ぶSELECT_TARGETになりTRASH解決・LIFE_CRASHは不発（OPPONENT_PAY_OPTIONALのcontinuation設計上'skip'以外の枝では発火しない）ことを確認。`WXDi-P16-088-E1`（「《無》／手札1枚／シグニ1体」の3択・costColors搭載）は同一signiTrashコードパスのため個別実機は任意（低優先）。
  - [x] **`SPDi43-02-E1`＝回避された場合に「以下の２つから１つを選ぶ」の選択UIが出ないこと**（従来は無条件で選択が走った）と、**`WXEX2-25-E1`／`WXDi-P08-007-E1` の対象がトリガー元シグニに固定**され選択UIが出ないこと＝✅2026-08-05・Sonnet・`verifyBattleDrive.mjs`（`spdi4302AvoidedNoChoose`／`wxex225SkipAutoTrashesTrigger`／`wxdip08007SkipRemovesAbilities`／`wxdip08007PaySpares`）で実機確認（各2回連続PASS）。**新パターン＝owner=guest（CPU・受動的watcherとして置くだけ）にし「対戦相手」=hostが応答者になるよう設計する**（wx22025と同型）。SPDi43-02はhostが「支払う」（costColors非搭載STUBの無料pay枝＝(ci)と同型）で回避すると続くCHOOSE(選択肢1/2)が一度も出現しないことを確認、WXEX2-25／WXDi-P08-007は「支払わない」1クリックのみで追加のSELECT_TARGETなしにtargetsTriggerSourceの対象（トリガー元シグニ自身）へ自動解決することを確認。⚠**新規実バグを発見・Opusタスク12(cv)へ追記登録**＝原文どおりの「手札を1枚捨てる」回避コスト（`opponentHandDiscard`）を選ぶと、続くSELECT_TARGET{targetScope:'opp_hand'}の候補描画が真の対象（host自身の手札）ではなくviewer相対の`op.hand`（guestの手札）を表示しソフトロックする＝`wxex225DiscardAvoids`（既定order外・意図的FAIL・2回連続再現）で確認。詳細は(cv)の行。

- **✅ タスク12(lxv) が持ち込んだ未検証UI 1件（2026-07-31→2026-08-05クローズ）**＝**36枚に一斉に載った**。engine の「包み形の解体」は golden で固定済みだが UI 経路は計器に映らない。
  - [x] **条件つき任意コストのゲート**＝✅2026-08-05・Sonnet・`verifyBattleDrive.mjs lxvGateTruePromptsChoose`/`lxvGateFalseSilentSkip`（`WXDi-P02-077-E1`＝手札6枚以上）で実機確認（各2回連続PASS）＝条件成立（手札6枚以上）で従来どおり「支払う／支払わない」CHOOSEが出現→支払うとランサー付与、条件不成立（2枚）だと`pendingEffect`が一度も`CHOOSE`にならず「任意コストの条件を満たさない（スキップ）」ログで静かに不発（本体も起きない）ことを確認。`WX24-P1-011-E1`（＜アーム＞所持）・`WXK07-035-E1`（相手シグニ3体・(lxiv)対象ピッカー前置と同居）は同一の`CONDITIONAL{gate}→STUB OPTIONAL_COST`パターンのため個別実機は未実施（低優先）。⚠`WX24-P1-011-E1`は原文の「手札を1枚捨て」コスト成分がJSONの`OPTIONAL_COST`に反映されておらず白エナのみ要求（コード読解で確認・parser側の据置候補として認識のみ）。

- **✅ タスク12(lxiv) が持ち込んだ未検証UI 1件（2026-07-31→2026-08-05クローズ）**＝**61枚に一斉に載ったので影響範囲が最大**。
  - [x] **支払い前の対象ピッカー前置**＝✅2026-08-05・Sonnet・`verifyBattleDrive.mjs lxivMultiTargetPayBanishesBoth`/`lxivMultiTargetSkipBanishesNone`（`WXDi-P02-043-E1`＝**2体まで**）で実機確認（各2回連続PASS）＝先に`SELECT_TARGET`（対象2体まで・パワー10000以上フィルタ）が出て、確定後に`OPTIONAL_COST`のCHOOSE（支払う／支払わない）が続く順序を確認。支払うと確定した2体がBANISHされ、支払わなければ両方とも場に残ることを確認。⚠実機で判明＝支払い後`freezeStoredTargets`で`fixedCardNums`に絞られたBANISH自体も`selectOrInteract`経由の再確認`SELECT_TARGET`（候補2件でも確認クリックが要る）をもう一度要求する＝対象確定は支払い前後で計2回。`WXDi-D07-013-BURST`（LB経由・パワー8000以下）・`WXK11-031-E1`（ON_OPP_LIFE_CRASHED・手札discardコスト＝OPTIONAL_COSTと別UI）・`WXK03-045-E1`/`WXDi-CP02-090-E1`（(lxv)ゲートと同居）は同一メカニズム（`SELECT_TARGET_ONLY`→`STORE_LAST_PROCESSED_TARGETS`→コスト→`BANISH{targetsStored}`）のため個別実機は未実施（低優先）。
- **✅ タスク12(lxiii) が持ち込んだ未検証UI 2件（2026-07-31→2026-08-05クローズ）**
  - [x] **(a) 選択肢の可否表示**＝`WX17-040-E1`（3つから3つまで選ぶ）＝✅2026-08-05・Sonnet・`verifyBattleDrive.mjs`（`wx17040ConditionsFalseNoop`／`wx17040ConditionsTrueExecuteAll`）で実機確認（各2回連続PASS）。①は**相手の手札が自分より多いときだけ**／②は**相手のエナが自分より多いときだけ**選べること（`choice.condition` が`CHOOSE`の`available`自体を決めている＝条件不成立で3条件すべて不成立にすると①②ボタンがdisabled）を確認。③は`ch.condition`を持たず常に`available:true`（条件はaction内側の`CONDITIONAL`が持つだけ）＝条件不成立でも選べるが、対象選択にすら進まず静かに無効果（hHand/hEnergy/gField無変化）であることを確認。対照実験（3条件すべて成立）では①②がenabledになり、3つ選択して確定するとドロー＋エナチャージ＋（SELECT_TARGETを経て）バニッシュが全実行されることも確認。
  - [x] **(b) 中央ゾーン限定のピッカー**＝`WXDi-P02-065-E2`（`filter.centerZoneOnly:true`）＝✅2026-08-05・Sonnet・`verifyBattleDrive.mjs centerZoneOnlyPicker`で実機確認（2回連続PASS）。対戦相手の場を左中右すべて埋めた状態で召喚すると、SELECT_TARGETの候補が**中央（zone1）の1体だけ**に絞られ（候補数=1を実測）、確定後は中央のシグニだけが凍結される（左右は対象外のまま）ことを確認。`WX15-033-E2`／`WX24-P2-091-E1`は同一の`centerZoneOnly`フィルタ機構（`execUtils.ts:1086`）を共有するため個別実機は任意（低優先）。中央が空のケースの空振り確認は未個別実機（低優先）。
- **✅ タスク12(lxii) が持ち込んだ未検証UI 1件（2026-07-31→2026-08-05クローズ）**
  - [x] **`WD16-016-BURST` の相手側ディスカードUI**＝✅2026-08-05・Sonnet・`verifyBattleDrive.mjs wd16016BurstOpponentDiscard`で実機確認（2回連続再現・意図的FAIL）＝「LB解決時に対戦相手（アタッカー）側にSELECT_TARGETが生成される」こと自体は確認できた。⚠**実バグを発見・Opusタスク12(cv)へ登録**＝`opp_hand`+`opponentResponds:true`の候補描画がviewer視点のopを使うため、対象が自分自身（アタッカー）の場合はLB所有者側の手札が誤って表示され、どれも選択できずソフトロックする。相手手札5枚以下/6枚以上/0枚の分岐は、この描画バグでピッカーへ到達できないため未検証のまま。
- **✅ タスク12(lx) が持ち込んだ未検証UI 2件（2026-07-31→2026-08-05クローズ）**＝engine/golden では固定済みだが UI 経路は計器に映らない。
  - [x] **(a) `WX12-020-E3` の「手札を好きな枚数捨ててもよい」ピッカー**＝✅2026-08-05・Sonnet・`verifyBattleDrive.mjs lxWX12020ScaledDiscardDelta`/`lxWX12020EmptyHandSkipsPicker`で実機確認（各2回連続PASS）＝アタック時にまず相手シグニ1体の対象選択が出て、次に自分の手札から0〜全部を選ぶ画面になり、確定後にその1体だけへ（捨てた枚数×－6000）が乗ることを確認（2枚とも捨てて-12000）。手札0枚のときは選択画面自体が出ず（`execTrash`の`cands.length===0`で`selectOrInteract`に到達しない）、delta=0で静かに素通り・クラッシュしないことも確認。
  - [x] **(b) `POWER_MODIFY{targetsStored}` の再選択が消えたこと**＝✅2026-08-05・Sonnet・`verifyBattleDrive.mjs lxWXDiP03089SingleTargetedFire`で実機確認（2回連続再現）＝**「対象選択は最初の1回だけになり、支払い後にもう一度選ばされないこと」自体は確認できた**（`sawSecondSelectTarget=false`）。⚠一方で**別の実バグを発見・Opusタスク12(civ)へ登録**＝ON_TARGETED watcher（WXDi-P03-067）が期待の1回ではなく**0回**しか発火しない（「対象宣言そのものへのON_TARGETED」がSEQUENCEが即done()せず後続CHOOSEへ続く場合に取りこぼされている疑い）。
- **✅ タスク12(lxi) 第2波が持ち込んだ未検証UI 1件（2026-07-30・最優先→2026-08-05クローズ）**＝相手側 CHOOSE に**3つ目の枝「エナゾーンからカードをN枚トラッシュに置く」**が出るケース。engine 直叩き golden で提示・非提示は固定済みだが UI 経路は未検証だった。
  - [x] **(a) 3択＋エナ枝**＝✅2026-08-05・Sonnet・`verifyBattleDrive.mjs secondWaveEnergyBranch`（`WX15-033-BURST`＝LB経由・所有者反転でdriver自身がCHOOSEを受ける）で実機確認（2回連続PASS）＝手札1枚(<2)で「手札を2枚捨てる」枝はdisabled、エナ3枚(≥2)で「エナゾーンからカードを2枚トラッシュに置く」枝を選択→自分のエナがちょうど2枚トラッシュされ対象シグニ(アタッカー自身)は場に残存を確認。`WXK05-001-E1`は同一`OPPONENT_PAY_OPTIONAL`コードパス（`effectExecutor.ts:3306`以降）のため個別実機は任意。⚠costColors非搭載につき「支払う」枝も常時available（Opusタスク12(ci)と同型の穴だが、本シナリオはそれを踏まずエナ枝を明示クリックして機能確認）。`WX24-P4-023-E3`の`ALL`枝（該当0枚で枝非表示）は未個別実機のまま残（低優先・エクシードコスト込みで別途検証が要る）。
- **🆕 タスク12(lxi) 本消化（29カード30効果）が持ち込んだ未検証UI 5件（2026-07-30・最優先）**＝相手側 CHOOSE の3択（支払う／手札をN枚捨てる／支払わない）が 30効果に一斉に載った。**engine/golden/smoke では固定済みだが UI 経路は計器に映らない**。代表カードは `WX25-P1-038`（エナ《無》×3）・`WX25-P1-040`（手札3枚）・`WXDi-P07-024`（手札3枚＋DOWN）。
  - [x] **(a) エナ不足で「支払う」が選べない**＝✅2026-08-04・Sonnet・`verifyBattleDrive.mjs oppPayEnergyInsufficient` で実機確認（2回連続PASS）＝guest energy=0 で pay が unavailable→CPU自動応答が skip を選択→BANISH実行。**対照実験（`oppPayEnergySufficient`＝energy=3で pay を選ばせる）で別の実バグを発見**＝CPU自動応答（`BattleScreen.tsx:522-530`）はCHOOSEの選択肢IDのみを渡しエナinstanceIdを渡さないため、`resumeOpponentPayOptional`が`energyNums=[]`で「コスト支払いエラー: エナ不足」を返し、エナが足りていてもpay選択が常に空振りする＝**Opusタスク12(cii)へ登録**（§3参照）。
  - [x] **(b) 手札不足で「手札をN枚捨てる」が選べない**＝✅2026-08-04・Sonnet・`verifyBattleDrive.mjs oppDiscardGateBareBug` で実機確認（2回連続、意図的FAIL）＝手札2枚(<3)でも discard が本来 unavailable のはずのところ、**costColors非搭載のOPPONENT_PAY_OPTIONALは無条件で無料「支払う」を選択肢へ積む**（`effectExecutor.ts:3333`）ためCPUがこれを最優先で選びbanishを回避＝discard枝のavailable:false判定に到達すらしない実バグ＝**Opusタスク12(ci)へ登録**（§3参照）。
  - [x] **(c) 併記型で両方の選択肢が同時に出る**＝「手札を1枚捨てるか《無》を支払わないかぎり」形で pay と discard が**並んで**出る＝✅2026-08-05・Sonnet・`verifyBattleDrive.mjs opponentPayOptionalBothBranchesCoexist`で実機確認（2回連続PASS）。**live で併記型が載っているのは現状0**だった当時の記録は古くなっており、`WXDi-P08-007-E3`（【起】《ゲーム1回》「対戦相手が手札を1枚捨てるか《無》を支払わないかぎり…」×3回）が現在 `costColors:['無']` と `opponentHandDiscard:1` を同時に持つ実例として存在する。host自身が【起】を起動しguest(CPU)が応答者になる構成のためCHOOSEの中身はhost画面には描画されない＝`pending_effect.interaction.options`をDB直読みして`options ids=["pay","discard","skip"]`（`pay`はcostColors付き・`discard`は手札1枚捨てるTRASH）が同一CHOOSEに同時に存在することを実機ランタイムのデータで確認した。
  - [x] **(d) ライフバースト経路で相手へ CHOOSE が飛ぶ**（`WX24-P2-071-BURST`／`WX24-P4-062-BURST`／`WX25-P3-076-BURST`／`WXDi-P04-058-BURST` の4件）＝✅2026-08-04・Sonnet・`verifyBattleDrive.mjs lbOwnerReversal`（`WX24-P2-071-BURST`）で実機確認（2回連続PASS）＝`queueCardEffects(...,{id:ownerId})`がLB所有者(guest)をownerStateに固定するため、OPPONENT_PAY_OPTIONALの支払い側(otherState)はターン所有者に関わらず常に「LB所有者の対戦相手＝アタッカー」になる。host（アタッカー）が実際にoptcost-skip等のCHOOSEを受領→無エナでpay不能→skip→host自身のシグニがBANISHされることを確認＝owner反転が正しく機能。残る3枚（`WX24-P4-062`等）は同一機構（`queueCardEffects`のownerId固定）のため構造的に同じ結論と判断・個別実機は任意。
  - [x] **(e) 入れ子 SEQUENCE の continuation が中断を跨いで残る**（`WX24-P1-023-E1`）＝✅2026-08-04・Sonnet・`verifyBattleDrive.mjs sequenceContinuationAcrossGate` で実機確認（2回連続PASS）＝内側ゲート（相手CHOOSE＝今回はOpusタスク12(ci)の無料pay枝をCPUが選択）解決後も、外側SEQUENCEの次ステップ`REVEAL_AND_PICK`（デッキ上5枚→スペル/＜電機＞を2枚まで手札）が中断を跨いで正しく続行することを確認（噴流する知識をpick済み）。同型 `WX24-P2-033-E1`／`WX25-P3-042-E1` は同一JSON構造のため個別実機は任意。
- **✅ エクシード本体5件（次の一手①）が持ち込んだ未検証UI 3件（2026-07-30・最優先→2026-08-05クローズ）**＝engine/golden では固定済みだがUI経路は計器に映らなかった。**このプロジェクト初のLRIG「【出】エクシードN」コストUI（`SigniOnPlayCostModal`のルリグの下からN枚選択→発動/スキップ）を実機で新規に駆動**（`onplaycost-exceed-{i}`testidを新設）。
  - [x] **(a) 群B＝相手側の支払い回避 CHOOSE**＝✅2026-08-05・Sonnet・`verifyBattleDrive.mjs exceedBanishGateA`（`WX24-P4-018-E2`）で実機確認（2回連続再現・意図的FAIL）＝エクシード4コストUI自体はlrigUnder 3→0まで正しく消費して機能したが、`OPPONENT_PAY_OPTIONAL`がcostColors非搭載のため無料「支払う」が常時available→CPUが最優先で選択しbanishが不発＝**Opusタスク12(ci)と同型の穴を新カードで再現**（既存登録を再利用・新規登録は不要）。
  - [x] **(b) 群C＝任意ライフクラッシュ＋動的対象数**＝✅2026-08-05・Sonnet・`verifyBattleDrive.mjs exceedDynamicTargetCountB`（`WX24-P4-015-E2`）で実機確認（2回連続再現・意図的FAIL）＝エクシード4支払い→「クラッシュする」選択→自分のライフクロス1→0枚クラッシュ→チェックゾーン確認（バーストなし「エナに送る」）までは正しく進行するが、続く`BANISH`（動的対象数2体）が一度も発火しない実バグを新規発見＝**Opusタスク12(cvi)へ登録**（§3参照）。
  - [x] **(c) 群E＝2群ピッカー**＝✅2026-08-05・Sonnet・`verifyBattleDrive.mjs exceedTwoGroupPickerC`（`WX24-P4-017-E2`）で実機確認（2回連続再現・意図的FAIL）＝エクシード4支払い→「発動」までは正しく進行するが、続く`TRANSFER_TO_HAND{transferGroups}`（スペル1枚まで→青シグニ1枚まで）が一度も発火しない実バグを新規発見＝スペル群（候補0枚）が無音でauto-skipされた後、続く青シグニ群（候補1件）のSELECT_TARGETも一度も現れない＝**Opusタスク12(cvi)と同根の疑いとして登録**（§3参照）。
- **✅§6.3 H／I′ の機構5件が持ち込んだ未検証UI（2026-07-30・2026-08-04に(a)-(e)全項目クローズ）**＝engine/golden では固定済みだったUI経路5件すべてを実機検証完了（詳細は各項目末尾）。
  - [x] **(a) ガード追加《無》の N枚徴収**（`WX24-P3-069-E1` ほか族11効果）＝✅2026-08-04・Sonnet・`verifyBattleDrive.mjs guardExtraColorlessSufficient`/`guardExtraColorlessInsufficient`（`WX24-P3-069-E1-G`＝`GRANT_LRIG_ABILITY`で付与される`STUB{OPP_GUARD_COST_COLORLESS,count:3}`をguestへ直接注入）で実機確認（各2回連続PASS・FRESHルームで安定）＝エナ十分(3枚)でガード成立→ちょうど3枚徴収（トラッシュ+4＝ガード札1＋エナ3）／エナ不足(2枚)で「使用できるガードカードが手札にありません」表示＋ガード候補ゼロ→「ガードしない」のみ。⚠**ルーム再利用バッチでは前シナリオのguestルリグダウン状態が残りCPUが再アタックせずFAILする**（個別実行/FRESHルームでは安定）＝既定order外・単体実行専用として保持（他の「CPUターン系バッチ限定FAIL」と同型の既知制約）。1枚（count省略）の既存6 CONTINUOUSは今回の注入方式（guestへの直接付与）と独立のため非回帰は自明（未個別実機・低優先）。
  - [x] **(b) `WDK14-013-E1` のトラッシュ＜悪魔＞候補ピッカー**（`SigniOnPlayCostModal`）＝✅2026-08-04・Sonnet・`verifyBattleDrive.mjs wdk14013TrashPicker`で実機確認（2回連続PASS）＝トラッシュに候補2枚（必要1枚を超過）を用意→ピッカー出現→img候補クリック→発動でトラッシュから1枚ビート化。**候補が必要数ちょうど/不足のときピッカーが出ずに従来の自動選択のまま**という側面は未個別実機（`beatTrashNeedSelect`のコード読解では確認済み・低優先）。
  - [x] **(c) メルト・ファクト `WX15-067-E1` の支払い前ウィルス除去UI**（`SpellCastModal` に1段挿さる）＝✅2026-08-04・Sonnet・`verifyBattleDrive.mjs meltFactVirusRemoval`で実機確認（2回連続PASS）＝相手ウィルス2個を除去→コスト《黒×2》が0まで軽減／CHOOSE上限が1→2に拡張されc0（トラッシュの黒シグニを手札に）・c1（相手シグニ-7000）を同時選択→両方実行。**「変えると支払いエナ選択がクリアされる」「モーダルcloseで選択が消える」の2点はコード読解で確認済み**（`SpellCastModal.tsx:119-133`・`35`）だが実機クリック単体では未個別検証（低優先）。0/1個除去の中間ケースも未個別実機（低優先）。
  - [x] **(d) 夢限 -Q- `WXDi-P11-010A-E1` の反転**＝✅2026-08-04・Sonnet・`verifyBattleDrive.mjs mugenQFlip`で実機確認（2回連続PASS）＝`game_lrig_limit_bonus`直接注入で印刷Limit5+4=9を満たしENERGY→GROWの実フェイズ遷移をUIクリックで踏むと、`ON_GROW_PHASE_START`→`MUGEN_Q_RESET_AND_FLIP`が発火し`card_identity_overrides[instanceId]='WXDi-P11-010B'`へ1手で反転（1回目は`hHand=5・hEnergy=5`でB面E1のドロー5+エナチャージ5も確認、2回目はqueryStateのタイミング差でB面E1解決前=0/0を観測したが反転自体は両回とも即時確認）。**「Limit9・B面E2【起】が使えA面能力が消えている」の直接UI確認と「B面【出】2件」の重複起動有無は未個別実機**（コード読解＝`card_identity_overrides`によるCardData解決の切り替えとGRANT_LRIG_ABILITY方式のA面能力（UNTIL_END_OF_TURN）がリセットで自然に失効する構造で確認済み・低優先）。
  - [x] **(e) 未知の邂逅 `WXDi-P13-003A-E1` の無料グロウ**＝✅2026-08-04・Sonnet・`verifyBattleDrive.mjs mayuEncounterFreeGrow`で実機確認（2回連続PASS）＝手札3枚+エナ2枚=5枚移動で`prepareMayuEncounter`の`canGrow`が成立→`card_identity_overrides[instanceId]='WXDi-P13-003B'`へ反転＋`executeGrow(freeCost:true)`で無料グロウ→`actions_done`に`GROW`が記録され同ターンの通常グロウが封じられることを確認。**「4枚以下は代償だけ（反転しない）」「このターン既にセンターグロウ済みなら候補に出ない」の対照ケースと「B面【出】2件」の発火確認は未個別実機**（`prepareMayuEncounter`の`movedCount>=5`分岐とキャンドル表示条件`CENTER_LRIG_NOT_GROWN_THIS_TURN`はコード読解で確認済み・低優先）。

- **✅ ON_LRIG_GROW④**＝《ターン1回》の実機検証：標準グロウの二重発火ブロックは確認済（続き132）・コード疑義は✅続き206の全コレクタ監査で「穴なし」確定。**残＝ゲット・グロウ（GROW_FREE横グロウ）経路の E2E が driver で完走できず未検証**だった旨の記載は2026-08-05時点で**stale＝続き141（`lrigGrowUsageLimit`・既定order内・2026-07-15）で既に解決・実機PASS済み**と判明（WX03-024経由の2回目グロウがlrigTop変化まで完走し、usageLimit《ターン1回》が正しく機能してON_LRIG_GROWが2回目は発火しないことを2回連続PASSで確認済み）。新規シナリオは不要。
- **✅ (xi) の skip 検証**＝`CONDITIONAL{条件, then:STUB OPTIONAL_COST}` 包み（続き206修正）で、skip 選択時に本体が発動しないことの実機確認＝✅2026-08-05・Sonnet・`verifyBattleDrive.mjs lxvGateTrueSkipNoBody`で実機確認（2回連続PASS）。`lxvGateTruePromptsChoose`/`lxvGateFalseSilentSkip`は「ゲート成立→支払う」「ゲート不成立→プロンプト自体が出ない」の2branchのみ検証済みで、(xi)本来の主題（続き206修正前は「ゲート成立→CHOOSEが出たのにスキップしても本体がそのまま実行される」というコスト踏み倒しバグだった）は未検証のまま残っていた。同じ`WXDi-P02-077-E1`で手札6枚以上（ゲート成立）にしたうえで`optcost-skip`を選び、エナは無傷（支払っていない）かつ【ランサー】も付与されないことを確認＝コスト踏み倒しバグは再発していない。
- **✅ (xxxvi) のグロウ支払いUI**＝エナ代替トラッシュ（`wildcardInstIds`/`colorOverrideMap`）のグロウ経路配線（続き206）の実選択検証＝✅2026-08-05・Sonnet・`verifyBattleDrive.mjs lrigDownGrowColorSubstituteFires`で実機確認（2回連続PASS）。`WX16-Re06`（印刷色「白」・エナゾーンにあるかぎりセンタールリグの色として代替可）を**緑の**センタールリグ（`WD04-004`→`WD04-003`・GrowCost《緑×1》）のエナに置き、素の色一致では絶対に払えない組み合わせでグロウが成立する（Phase1候補ボタンがenabled→Phase2でWX16-Re06を選択→グロウ実行→lrigTop変化・WX16-Re06はエナ→トラッシュへ移動）ことを確認＝グロウ支払いUIの代替配線が実選択でも機能している。
- **クラフトトークンの実機配置**の残＝WX22-001-E3（§6.4）。⚠2026-08-05時点で再確認＝`GRANT_LEAVE_PLACE_PENDING`は`src/data/parsers/parseSentencePart1.ts:1946`でparserがSTUBを生成するのみで、`src/engine/effectExecutor.ts`・`execStubPart*.ts`のいずれにも実行側の実装が無いまま＝**引き続き機構待ち**（Sonnet側で実機検証できる状態ではない）。
- **✅🏁完全クローズ（2026-08-06・続き356・Opus 5）lrigDown コストの限定（続き218）**＝下記で発見された未配線バグ（Opusタスク12(cviii)）を修正し、実機3シナリオで(a)(b)ともに検証完了＝`lrigDownCenterOnlyPays`（centerOnly＝アップなら払えて `lrig_down` が実際に true になる）／`lrigDownCenterOnlyUnwired`（centerOnly＝センターがダウン済みならアシストがアップでも【起】が提示されない＝**アシストが支払い候補にならない**）／`lrigDownLevelLrigActivated`（level＝Lv3センターを温存し Lv2 アシスト2体で払う＝**該当レベル以外が候補にならない**）。各2回連続PASS・3件とも既定orderへ。〔以下は発見時の記録〕(a) センター限定（`WXK10-023`・`WXK10-037`・`PR-K064`）で**アシストルリグが支払い候補にならない**こと。(b) レベル限定（`WXDi-P03-009`・`WXDi-P04-042`・`WXDi-P02-009`）で**該当レベル以外のルリグが候補にならない**こと。→**2026-08-05・Sonnet・調査の結果、新規実バグを発見**＝`WXK10-037-E2`（【起】ACTIVATED・`cost:{lrigDown:{count:1,centerOnly:true}}`）で、センタールリグを事前にダウン済みにしても【起】ボタンが`enabled`のまま押せ、コストを一切支払わずにSEARCHが実行された（`verifyBattleDrive.mjs lrigDownCenterOnlyUnwired`・既定order外・意図的FAIL・2回連続再現）。コード読解で確認＝`cost.lrigDown`は`executeSigniActivated`（`BattleScreen.tsx:10530-11138`）にも`SigniActivatedModal.tsx`にも一切参照されておらず（`payLrigDownCost`は`executeSigniOnPlayCost`＝【出】コスト専用経路からしか呼ばれない）、**【起】ACTIVATED効果の`lrigDown`コストがUI/実行経路のどちらにも配線されていない**＝centerOnly/level問わず全件（`WXK10-023`・`WXK10-037`・`WXDi-P03-009`・`WXDi-P04-042`・`WXDi-P02-009`の5枚＋他に存在すれば同様）に影響。**Opusタスク12(cviii)へ登録**（§3参照）。
- **driver 側**＝30件超の連続実行で出る低頻度フレーク（Sonnetタスク3。`oppDraw` 単独FAILは別要因で未解明）。⚠**今回のセッションでは着手せず**＝ユーザーからのフィードバックで「`verifyBattleDrive.mjs` を明示シナリオID無しのフルバッチで実行しない（フリーズ報告あり）」旨の制約があり、この項目の再現には30件超の連続実行が要るため対象外とした。着手する場合は個別セッションで慎重に（タイムアウト・スクショ省略設定込みで）扱うこと。

### 7.1 timing flatten 系統（実バグ・当初159枚→**✅完了＝VALUE 0**・R58で打ち止め）
> R5-R58 で timing flatten の表現バグ（`timing:ON_TURN_END`だが原文トリガーは「〜したとき」＝ターン終了時に付与即失効の実質no-op）はすべて解消（flatten 系統としては VALUE=0・LOSS=0・同型★0。⚠parserWorklist 全体の held/LOSS は別勘定＝§4 恒久指標参照）。**残る作業は表現ではなく engine 配線の実機検証のみ**（上記）。診断＝`npx tsx scripts/archive/_flattenList.ts`（0枚を確認）。系統別の直し方は `BUGFIXES.md` の R5〜R58 エントリ。

### 7.2 対話UIの残実装
- トラッシュ自己起動のエナ以外コストUI（手札捨て/コイン/エクシード等・14枚・上記6.4と同一対象）
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
- **`node scripts/heldReview.mjs`（続き23新設）**＝`build:effects` の「温存(要レビュー)」を diff署名（type増減）でグループ化し `docs/_held_review.txt`（原文＋leaf diff付き）に出力→spot-check後 `--adopt ID1,ID2,…` / `--adopt-sig "署名"` で fresh を一括採用。前提＝直前に `npm run build:effects`（fresh を `docs/_held_fresh.json` に保存）。**採用しないもの＝STUB退化・「代わりに」昇格・別STUB id 化**（理由は BUGFIXES 続き23）。
- **`npx tsx scripts/parserWorklist.ts`**＝held/LOSS/VALUEのhealth計器（2026-07-19 実測＝held 188・LOSS154/VALUE34。§4 恒久指標参照）。回帰検出に使う。⚠HEAD比較＝auto-commit 環境では採用コミット後の値で判定する。
- **`npx tsx scripts/archive/_flattenList.ts`**＝timing flattenのEXIST/FRESH差分（現在0枚）。
- **`docs/_partial_report.txt`（2026-07-07新設・`build:effects` が再生成）**＝parser 無言フォールバック刻印の計器＝「原文の条件/ステップを黙って落とす近似」の理由明細（初回142効果＝IS_MY_TURN化125/multi-dest分割11/リコレクト分割8）。この数字から**増えたら**parser に新たな無言近似が入った兆候（減らすのは §5c の条件語彙拡充）。刻印された fresh は parseStatus:PARTIAL＝heldReview で採用時にレビュアーに見える。

---
**関連**：`DESIGN.md`（設計方針）／`PLAN_DETAIL.md`（消化済み履歴）／`BUGFIXES.md`（修正記録）／`BEHAVIOR_AUDIT.md`（原文照合の主軸）／`SEMANTIC_AUDIT.md`（補完的発見器）／`effects-json-guide.md`（語彙）／`STUBS.md`（STUB一覧）／`TokenCallers.md`（トークン対応表）。
