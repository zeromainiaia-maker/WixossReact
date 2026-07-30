# PLAN — 開発計画（統合版）

> **2026-07-03統合**：以前は「今後の予定」を決める文章が `P1_PLAN.md`／`ROADMAP.md`／`TODO.md` の3つに分かれていて分かりにくかったため、この1本の `PLAN.md` に統合した。旧3ファイルは削除済み（内容はすべてここに移した）。
> **3人は同時に作業せず、順番に push / pull で引き継ぐ（バトン式）**。新セッション（cold start）は **本ファイル §4「現在地とバトン」→ `DESIGN.md`** の順に読む。
> 個別の修正記録は [BUGFIXES.md](./BUGFIXES.md)（新しいものを上に追記）。**原文照合の主軸ツールは [BEHAVIOR_AUDIT.md](./BEHAVIOR_AUDIT.md)**（実行結果の目視照合・LLM不使用・決定論）。補完的発見器は [SEMANTIC_AUDIT.md](./SEMANTIC_AUDIT.md)（LLM意味比較）。
> **消化済みバッチ・完了項目の詳細履歴は [PLAN_DETAIL.md](./PLAN_DETAIL.md) に分離（2026-07-07）**＝本ファイルは「現在地・ルール・生きている worklist」だけを保つ。完了項目を増やしたら詳細は PLAN_DETAIL.md へ移し、ここには1行の ✅ サマリだけ残す。
> **2026-07-14 に再圧縮**（199KB→約77KB）＝§3 のタスク本文・§7 の実機PASS記録・§4 の census 計測履歴・§6 の完了機構メモを PLAN_DETAIL.md へ退避し、**§3 は「生きているタスクの表」＋Opusタスク12 の在庫表だけ**にした。**タスクは §3 の表から取り、経緯を知りたいときだけ PLAN_DETAIL を開く。**

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
| 12 | **Sonnet が積んだ engine/parser バグの修正（常設受け口）** | 可変 | 可変 | **下の在庫リスト参照** |
| 13 | §5b 混線テール（実測823カード・16テーマ分類済み） | JSON再parse（1カードずつ） | L（低優先） | effect 構造そのものが原文とズレたカードの再parse。逓減テール＝他が尽きたら |
| 14 | リファクタ Stage2→Stage3 純粋バトルコントローラ | BattleScreen構造 | L | ✅Stage2完了＋永続化移行完了（battle_states 全行 I/O 120箇所を `persist` へ移行）＋**reducer 14 action・72/115 commit 経由**（続き244-247＋🆕続き271＝セットアップ3／スペル・カットイン5／WRITE_STATE 4／ADVANCE_TURN_WITH_STATE 1 の計13箇所）。設計/移行レシピ `docs/BATTLE_CONTROLLER.md`。**残＝reducer純粋化の本体（43 commit）**＝(a) 命令的 `update` インクリメンタル構築（`doPhaseAdvance`／`confirmEndDiscard` 等）(b) `result.done` で pending_effect が null/非null に分岐する効果解決本体 (c) `...opUsageUpdate`／`...extraUpdate` の spread 順序依存 (d) CPUターン終了の複数カラム同時更新。⚠ハンドラ側 payload 構築は golden 非カバー＝機械一括変換不可・1件ずつ手動レビュー要（レシピ BATTLE_CONTROLLER.md §4）。**進め方＝「挙動同値と確信できるものだけ N 箇所」に必達を絞って codex へ投げ、Claude が全箇所の diff を手で照合する**のが続き271 で確立した回し方 |
| 15 | （大型・任意）§8 CPU AI のメインフェイズ拡張 | 新規設計 | L（特大） | ⏳DESIGN §4「CPU は対人戦と同じ処理」の統一が先 |
| 16 | timing 語彙センサス（`npm run census:timing`）の消化 | parser語彙 | S（ロングテール） | **✅`cost.underSelfTrash` は 2026-07-30 に残0でクローズ**（実測13効果＝簿記の「16効果」は誤り。全部シグニの【起】で、**カットイン除外は無関係なルリグ/キー経路のみ**＝実体は「コストを払わず撃てる過剰実行」だった。既存の兄弟 `underAnySigniTrash` 配線を踏襲し新機構ゼロで着地。詳細 BUGFIXES 2026-07-30 先頭節）。<br>**残＝timing 半分のみ＝32効果/32クラスタ**（`npm run census:timing` 実測。簿記の「33」は古い）＝原文が【自】なのに timing 判定が外れて `ON_PLAY` へフォールバックし、現在は `timing:[]` で安全停止中の群。<br>🔴**着手するならまず振り分け台帳の再トリアージから**＝`docs/_timing_census_triage.txt` 2026-07-27節の **[B] 判定理由が陳腐化している**（2026-07-30 実測）。「軸が無い」と書かれた `handOwner`／`minCount`／`byOwnEffect`／`byOpponentEffect`／`fromZones` は現行 `triggerCollect.ts:1841-1901`（`collectHandAddedTriggers` ほか）に**実在**する。例＝`WX20-067-E1`「カード1枚がいずれかのプレイヤーの手札に加えられたとき」は `triggerCondition.handOwner` の型（`effects.ts:2129`）に `'any'` を足すだけで閉じる見込み＝**engine 側は既に第3値を素通りさせる形**（`self`/`opponent` のみ skip）。**台帳の停止理由を1件ずつ機械検証してから群を切ること。**<br>🆕**残穴＝`ON_TRASH under_signi` の3効果がコスト起因で発火しない**（`WX18-062-E1`／`WX22-027-E1`／`WXK03-033-E1`。原文はいずれも「このカードが**コストか**効果によってシグニの下からトラッシュに置かれたとき」＝コストを明示的に含む）。`payUnderSelfTrash` は state を直接書き、`executeSigniActivated` がコスト支払いとスタック初期化を**1コミットにまとめる**ため、中央 diff の `detectUnderSigniTrashed`（before スナップショット＝`bs.host_state`）が移動を見ない。**退化ではない**（配線前はカードが動かず発火機会自体が無かった）＝新規に露出した未到達経路。直すならコスト支払いを独立コミットに分けるか支払い時に明示的にトリガーを積むかの設計判断が要る。<br>🆕**同族の未配線1枚＝`WXDi-P06-034`**「このシグニの下からカード１枚**と**あなたのエナゾーンからカード１枚をトラッシュに置く」＝複合コストで regex に当たらず `underSelfTrash` が付かない（従来から不変）。<br>⚠**計器に盲点あり**＝2026-07-28 の誤分類36件を `census:timing` は33件しか報告しなかった。消化済みの経緯（36件停止／続き272・273・277・278 ほか）は [PLAN_DETAIL.md](./PLAN_DETAIL.md)「2026-07-29 整理」節・BUGFIXES 2026-07-28節。ゲートではない（exit 0） |

> **✅消化済のタスク（1〜9・11・17〜19）は 2026-07-29 の整理で退避**＝完了行の原文は [PLAN_DETAIL.md](./PLAN_DETAIL.md)「2026-07-29 整理」節。生きているのは上表の **12〜16** のみ。

**Opusタスク12＝未消化の在庫**（Sonnet が観測して積んだ engine/parser バグ。**下表は残作業のある在庫のみ**。消化済み在庫〔(i)〜(lvi) の大半〕の完了行原文は [PLAN_DETAIL.md](./PLAN_DETAIL.md) §3〔2026-07-19・2026-07-24・2026-07-28・**2026-07-29**の各退避節〕。直近クローズ＝**(xliv) `BANISH_REDIRECT` 残テール**と **(xlii) `GRANT_LEAVE_PLACE_PENDING` 残2枚**は 2026-07-29 に残0で完全クローズ〔詳細 BUGFIXES 2026-07-29節〕）：

| ID | 内容 |
|---|---|
| (lv) | **残＝未配線2経路**（原票 `WXEX2-71-E2` と共通機構、人間グロウ／COLLAB／アシスト配置は✅2026-07-29 に消化）＝**③CPU シグニ召喚 ④CPU グロウ**。いずれも「CPU は任意効果を発動しない」を明示据え置き中。**着手するなら「CPU に任意効果をどう選ばせるか」の方針決めが先**（黙って無条件発動にするのは COLLAB と同じ過剰実行になる）。詳細 BUGFIXES 2026-07-29 (lv) 節 |
| (lx) | **タスク12(l) のクローズで開いた残2件**＝①`WX25-P1-056-E1`（`leaveReplaceBanish`）＝「あなたの＜C＞のシグニが対戦相手の効果によって場を離れる場合、その移動がバニッシュによるものでないなら、代わりにそのシグニをバニッシュしてもよい」。**2026-07-30 に新設した共通離場フック `applyEffectLeaveLrigAbilitySubstitute`（`effectExecutor.ts:179`・BANISH/BOUNCE/TRASH/SEND_TO_ENERGY/TRANSFER_TO_DECK/EXILE の6経路へ配線済み）で閉じられる見込み**＝追加で要るのは「してもよい」の任意選択とバニッシュ先処理の2点。②`WX12-020-E3`（据置）＝「この方法で捨てた手札1枚につき－6000」で、倍率元が**現在の手札枚数ではなく捨てた枚数**のため既存 `POWER_MODIFY_PER_HAND_COUNT` の拡張では意味が混ざる。詳細 BUGFIXES 2026-07-30 の先頭2節 |

> **✅残0でクローズした在庫の完了行原文は [PLAN_DETAIL.md](./PLAN_DETAIL.md)「2026-07-30 整理」節へ退避**＝**(xxix)**〔任意【出】コスト・計15波・残4は明示保留〕／**(xlvi)**〔look-pick 計73効果・第1〜17波〕／**(lvii)**〔census キー表 `pickUpTo` 較正〕／**(lviii)**〔トラップ公開 LPC 移行9効果・残1は honest defer〕／**(lix)**〔`split_top_bottom` 全4効果〕／**(l)**〔置換イベント横取り3文型を含む A群/B群 全体・残0〕。それ以前の消化済み在庫〔(i)〜(lvi) の大半〕は同ファイルの 2026-07-19・07-24・07-28・07-29 の各退避節。

#### Sonnet のタスク（2026-07-15 棚卸し・生きているものだけ）

> **2026-07-15（続き134）の棚卸しで在庫はほぼ枯渇→続き201/208 の採用待ち在庫77件も✅続き214で全消化**。現在の Sonnet 在庫＝タスク1（§7 実機検証＝(xi)/(xxxvi) の要実機検証ほか）と、Opus の新語彙着地待ちのタスク6。タスク8 の次ラウンド（clean群への展開）は任意・低優先。

| # | タスク | 種別 | 規模 | 残っている内容 |
|---|---|---|---|---|
| 1 | **§7 実機検証の横展開** | 検証（driver シナリオ追加のみ） | S×件数 | 既定order 76件まで消化済（(a)(b)(c)＋oppDrawOwnEffectOnly＋続き173/174＋🆕`resonaMainWx08021`〔続き263・レゾナ召喚UI MAIN〕）。**残＝§7 の未消化項目**＝🆕**レゾナ召喚UIの ATTACK 窓／SPELL_CUTIN 窓／REQUIRES_NEW_FLOW／支払いトリガー発火（最優先・§4 参照）**＝(xi) skip検証・(xxxvi) グロウ支払いUI・ON_LRIG_GROW④・WX22-001-E3（§6.4）＋🆕(xlvii) 防御側ルリグアタック収集（続き218j＝ガード応答とスタック解決順が噛み合うかの要実機確認）。経緯は PLAN_DETAIL §3 |
| 3 | driver バッチ実行の状態汚染 | scripts（engine/JSON 非依存） | M | ⏳主要因は解消済み（続き77/105/139/140/142）。**残**＝(b)`oppDraw` 単独FAIL（CPU挙動依存）(c)`lrigGrowAnyOppP03046` FRESH=1 FAIL（CPUがグロウ判断に至らない）。現在シナリオ 81定義／75既定実行 |
| 4 | ~~BEHAVIOR_AUDIT キュー再生成＋一次トリアージ~~ **⛔枯渇（休眠）** | 計器実行＋分析 | S | 続き133 で高シグナル22件精査＝真no-opバグ0件。残る母数は監査ツールの構造的盲点（COUNTER_SPELL/SPELL_CUTIN・トリガー文脈依存）に該当＝再開なら盲点フィルタ実装が先（低収量見込み） |
| 6 | §5c 再収穫サイクル（`/census-batch` 準拠） | JSON採用 | S | **✅続き214で在庫77件を全消化＝64枚採用**。次の在庫が発生するまで待機（Opus 新語彙着地待ち）。⚠P1宣言により新規バッチは切らない |
| 8 | semantic audit のスケールアップ＋単点修正 | パイプライン＋JSON単点 | M | **✅stub群母集団2,401枚は全数監査完了**（findings→Opusタスク12 (xxvii)(xxviii)(xxix)）。残＝clean群3,574枚への展開（任意・低優先）。累積除外リスト `scripts/archive/scratchpad/semantic_audit_stub_round3/audited_stub_cards_cumulative.txt` |

（消化済み在庫＝未採用在庫 第2弾40枚〔続き208〕・未採用在庫37効果〔続き201〕・補欠(a)(b) はいずれも✅続き214/172/170 で全消化。詳細 BUGFIXES 各続き）

**依存の要点（交互サイクルの回し方）**＝待ち関係は3本：**Opus1〜6 → Sonnet6**（新語彙が着地してから再収穫）／**Sonnet1・4・8 → Opus12**（Sonnet が観測して積む → Opus が修正する）／**Opus12 → Sonnet1**（修正が着地すると §7 の意図的FAIL回帰シナリオを PASS へ反転させる検証作業が生まれる）。それ以外の組はすべて独立＝どの順で取っても衝突しない（バトン式・同時作業はしない）。

**現在の Sonnet 在庫＝タスク1（§7 実機検証）が主力**。タスク6は Opus の新語彙着地待ち・タスク8 clean群は任意。作業中に parser/engine のバグを見つけたら Opusタスク12 へ登録し交互サイクルへ戻す。

---

## 4. 現在地とバトン（直近セッション）
> ① `git pull` → ② 本節を読む → ③ 作業 → ④ 本節と `BUGFIXES.md` を更新 → ⑤ commit & push を回す。詳細な修正履歴は `BUGFIXES.md`（新しい順）に積む。ここは**現在地・計画・残作業数だけ**。

### 📍 進捗サマリ（最新1件のみ・過去は別ファイル）
> **運用ルール（2026-07-07〜）**：この節には**直近の作業1件の要約だけ**を残す（入れ替え式）。新しく作業したら ①いま置いてある要約を [PLAN_PROGRESS.md](./PLAN_PROGRESS.md) の「過去セッション要約」**先頭**へ移す（新しいものが上）→②この節を今回の作業の要約へ丸ごと書き換える。過去の全セッション要約（旧・要約①②を含む）は [PLAN_PROGRESS.md](./PLAN_PROGRESS.md) に集約済み。

- **🆕 セッション（2026-07-30・Opus 5〔Claude〕が指示と検証＋codex-work が実装）＝Opusタスク16 の `cost.underSelfTrash`（【起】「このシグニの下からカードN枚をトラッシュに置く」）を13効果ぶん配線＝コスト踏み倒しの過剰実行を停止**（golden **1096→1101**〔codex 4本＋Claude 1本〕・census **1386 据置**・smoke **10679** 全0・fuzz 全0・lint 0 errors/228 warnings 据置・同型★0・held **286枚/106署名 据置**・manual field loss 0。ゲート全緑／live per-effect 差分 **changed 13 / added 0 / removed 0**＝13件とも `cost` フィールドのみ変化・`build:effects` 冪等）
  - **投入前実測で PLAN のタスク16 の記述を2点訂正した**＝①「16効果」は実測 **13効果**（全部シグニの【起】）②「`BattleScreen.tsx:5404` でカットイン候補から除外されるだけで支払い実装が無い」は**誤り**＝その除外は**無関係なルリグ/キー経路のみ**。シグニの【起】経路（`activatable` フィルタ）にも `executeSigniActivated` にも `underSelfTrash` の分岐が無く、**13効果すべてがコストを1枚も払わずに撃てる過剰実行**だった（例＝`WXEX2-41-E3` は下が0枚でも「相手シグニ1体をトラッシュ」が撃てる）。**「未実装で no-op」ではない**＝実害の向きが簿記と逆だった。
  - **新機構ゼロで着地**＝兄弟コスト `cost.underAnySigniTrash`（「あなたのシグニの下から合計N枚」）が parser／型／`canPayOptionalCost`／`optionalCostPaySteps`／BattleScreen 支払い／`SigniOnPlayCostModal` まで **end-to-end で完成済み**だったので、その配線を踏襲して純関数モジュール `src/screens/battle/underAnySigniCost.ts` に**ゾーン限定版3本**（`underSelfCostCandidates`／`canPayUnderSelfTrash`／`payUnderSelfTrash`）を足しただけ。意味の差は「このシグニの下（効果元ゾーン限定）」vs「あなたのシグニの下（全ゾーン横断）」だけ。**配線先4箇所は投入前に Claude が表で全列挙**（発動可否フィルタ／コスト表示／`executeSigniActivated`／SPELL_CUTIN 候補＝§5-20 の片肺配線を回避）。**支払いロジックを純関数へ出させたので golden から直接叩ける**（BattleScreen 直書きだと計器に一切映らない）。
  - **B群2件も原文どおり着地**＝`WX11-029-E3`「下から**スペル**1枚」は `filter.cardType:'スペル'`、`WXDi-P09-044-E3`「下から**同名の**カード2枚」は既存 `SelectionConstraint` へ **`same:'name'` を追加**（新型を作らない＝§5-8）。`underSelfTrash` は `number` → `{count, filter?, selectionConstraint?}` へ統一。
  - **⚠Claude 検証で是正2件＋残穴1件**（いずれも**ゲートが検査しない次元**）：①**parser regex が honor できない種別まで受理していた**＝`(カード|スペル|シグニ)` と書きながら filter へ写すのは `スペル` だけ＝「受理範囲 > honor 範囲」（§5-14 と同型・現データに `シグニ` 版は無く実害0）。`(カード|スペル)` へ絞り、**死フラグ検査 golden**（live 全数走査で `filter` キーが `cardType` 以外／`selectionConstraint` キーが `same` 以外なら FAIL・保有効果数13も固定）を追加して**変異試験で狙った2本だけ FAIL** を確認。②**`goldenTest.ts` の陳腐化コメント**「コスト経路（cost.underSelfTrash・16効果）は未配線で defer」を実態へ更新＝**古い停止理由の簿記は次のセッションを実際に誤誘導する**（本タスクの投入前実測でも PLAN の2点が両方外れていた）。③**残穴＝コスト起因では `ON_TRASH under_signi` の3効果が発火しない**（§3 タスク16 へ登録）。
  - **⚠変異試験の副作用（新しい罠・記録必須）**＝parser を変異させて `npm run build:effects` を回すと、**parser を戻して再ビルドしても live JSON に変異値が残る**（PRESERVE/curated 温存＝§5-10）。`effects_WX.json` を effectId アンカーで外科的に戻した（ミニファイ1行維持）。**parser 変異試験のあとは live JSON を実測で確認する。**
  - **codex の傾向（更新）**＝数値申告（ゲート・per-effect diff・held・エンコーディング）は今回も全項目が独立実測と一致。**BUGFIXES 先頭 `##` 追記と変異試験の自発実施は2回連続で定着**。**外すのは「受理範囲を honor 範囲より広く取る」ときと「古いコメントを更新しない」とき**＝どちらも緑のゲートを素通りする。
  - **次の一手**＝**Opus：①エクシードルリグ6件の本体不一致**（`WX24-P4-011-E2` 次回アタック時アップ→即時UP／`WX24-P4-014-E2` 差分ドロー→固定1枚／`WX24-P4-015-E2` 任意ライフクラッシュ＋動的対象数→強制＋固定1体／`WX24-P4-017-E2` スペル＋青シグニ各1枚→青シグニのみ／`WX24-P4-018-E2` 相手の手札3枚支払い回避→無条件バニッシュ／`WX25-P3-028-E2` リフレッシュ不可の誤分類＋3回の選択脱落。詳細 BUGFIXES 2026-07-29 §「live 原文照合」節）**②`WX25-P1-056-E1`**（`leaveReplaceBanish` の no-op＝2026-07-30 の共通離場フックで閉じられる見込み。任意選択とバニッシュ先処理の追加が要る）**③「コストの合計」族の STUB/UNKNOWN 14件**（本体が無い＝実装すれば既存 filter がそのまま効く）**④`WX11-043-E1` の `crossOnly` 欠落**（原文「《クロスアイコン》…の右【出】」なのにクロス外でも【出】発火）**⑤🆕タスク16 の timing 半分＝まず振り分け台帳の再トリアージ**（`docs/_timing_census_triage.txt` 2026-07-27節の [B] 判定理由が**陳腐化している**＝「軸が無い」とされた `handOwner`／`minCount`／`byOwnEffect`／`byOpponentEffect`／`fromZones` は現行 `triggerCollect.ts:1841-1901` に**実在**する。例＝`WX20-067-E1` は `handOwner` の型を `'self'|'opponent'` に `'any'` を足すだけで閉じる見込み＝engine 側は既に第3値を素通りさせる形）**⑥🆕`ON_TRASH under_signi` の3効果がコスト起因で発火しない**（`WX18-062-E1`／`WX22-027-E1`／`WXK03-033-E1`。詳細は §3 タスク16 の行）**／(xxix) 残4・(lv) 残2経路・ゲート脱落 [B]20件・§6.3 残機構・`WX12-020-E3`（捨て枚数比例）**。**Sonnet：§7 実機検証**＝🆕**【起】「このシグニの下からN枚トラッシュ」の選択UI**（`SigniActivatedModal` のゾーン限定ピッカーと確定／`CutinModal` の `WX11-029-E3` スペル選択／下が足りないとき候補に出ないこと）／ガード代替ボタン（手札1枚捨て）の表示と確定／ホログラフ置換の3枚並べ替えUI→トップ公開／`SigniActivatedModal` の「エナ1枚以上」複数選択と捨て枚数に応じた `PLAY_FREE` 候補絞り込み＋`DECLARE_PARITY_OPPONENT` の相手応答UI＋キー付与【起】のエクシード支払いUI＋分割UI＋宣言UI＋トラップ設置UI＋(xxix) の各支払いUI＋レゾナ召喚UI の ATTACK/SPELL_CUTIN 窓。

### 📊 恒久指標（維持中・逐次更新）

- **🆕 2026-07-30 タスク16 `cost.underSelfTrash` 配線後 最新値（本行を直近の正とする）**：census **1386 据置**（`BASELINE_HIGH=1386`）、golden **1096→1101**、smoke **10679/10679** 全0・SKIP0、fuzz 全0（seed 12648430）、lint 0 errors/**228 warnings**、同型★0（5986枚・265群）、held **286枚/106署名 据置**、manual field loss 0。live per-effect 差分 **changed 13 / added 0 / removed 0**（13件とも `cost` フィールドのみ変化）、`build:effects` 冪等。新語彙は `SelectionConstraint.same`（「同名の」全一致制約）の1本のみ＝**`EffectCost.underSelfTrash` は `number` → `{count, filter?, selectionConstraint?}` へ型変更**（読み手は parser／BattleScreen 4経路／decompiler／golden の全件を追随済み）。
- **2026-07-30 タスク12(l) 残0クローズ後の値（履歴）**：census **1386**（`BASELINE_HIGH=1386`・別置）、golden **1090→1096**、smoke **10679/10679** 全0・SKIP0、fuzz 全0（seed 12648430）、lint 0 errors/**228 warnings**、同型★0（5986枚・265群）、held **286枚/106署名 据置**、manual field loss 0。live per-effect 差分は第1波 **changed 3 / added 0 / removed 0**（`WX24-P4-026-E1`・`SPDi44-08-E2`・`WX25-P1-018-E2`）、第2波 **changed 3 / added 0 / removed 0**（`WX16-004-E1` 本体＋`WX15-002-E2`・`WXEX2-15-E2` の `holograph` マーカーのみ）、`build:effects` 冪等。新語彙は `CardEffect.holograph`（データ側ホログラフ判定）・`LookAndReorderAction.revealTopAfterReorder`・`StubAction.leaveVictimFilter`・`GrantLrigAbilityAction.duration` の4本。
- **2026-07-30 「コストの合計」束縛14効果 の値（履歴）**：census **1391→1386**（`BASELINE_HIGH=1386`）、golden **1085→1090**、smoke **10679/10679** 全0・SKIP0、fuzz 全0、lint 0 errors/**228 warnings**、同型★0（5986枚）、held **286枚/106署名 据置**、manual field loss 0。live per-effect 差分 **changed 14 / added 0 / removed 0**、`build:effects` 冪等。新語彙は `costThresholdFromPaidCount`（動的上限）と `energyTrash.atLeast` の2本のみ＝**いずれも当該2効果だけに付与**（全数走査で確認）。
- **2026-07-30 タスク12(l) A群／手札枚数比例の値（履歴）**：`POWER_MOD_BY_HAND_COUNT`→`POWER_MODIFY_PER_HAND_COUNT` の構造化5効果＋SONG付与展開1＋`WDK04-006-E1-G` の中身＋任意コスト付与2の計**9効果／8カード**。census **1393→1391**（`BASELINE_HIGH=1391`）、golden **1079→1085**、smoke **10679/10679** 全0・SKIP0、fuzz 全0、lint 0 errors/**228 warnings**、同型★0（5986枚）、held **286枚/106署名 据置**、manual field loss 0。live per-effect 差分 **changed 9 / added 0 / removed 0（影響カード8）**、`build:effects` 2回目差分0。⚠**効果総数は 10679 据置**（今回の入れ子化は SONG の1本のみで、その分は census の効果単位側に現れる）。
- **2026-07-30 タスク12(l) B群の値（履歴）**：キーの「センタールリグは以下の能力を得る。」＋後続ブロックを `GRANT_LRIG_ABILITY.abilities` へ入れ子化（**36枚・47効果**）。census **1394→1393**（`BASELINE_HIGH=1393`）、golden **1075→1079**、smoke **10679/10679** 全0、fuzz 全0、lint 0 errors/**228 warnings**、同型★0（5986枚）、held **292→286枚/106署名**、manual field loss 0。live per-effect 差分 **changed 41 / added 1 / removed 48（影響カード36のみ）**、`build:effects` 2回目差分0。⚠**効果総数が 10722→10679 に減る**のは47効果がトップレベルから入れ子へ移ったため（smoke/census の母数もこの値）。⚠census には**構造マーカー判定を「付与 abilities も再帰で数える」へ較正**した分が含まれる（HEAD の live JSON では 1394 据置＝較正単体の影響0）。
- **🆕 2026-07-30 タスク12(xxix) 15波後の最新値（本行を (xxix) 系の正とする）**：**任意cost【出】母集団 981／`optionalOnPlayCostStub` で写せない 4**（＝`costUnparsed` の4件のみ。**すべて明示保留＝理由つきで不発を維持**しており `OPTIONAL_ON_PLAY_COST_REF_DEFERRED` は**0件**。内訳と保留理由は §4 進捗サマリ参照）。**`costUnparsed` 総数 21／AUTO・ON_PLAY・任意 4**。⚠**ゲート値（golden/census/smoke/held）は上の 2026-07-30 タスク12(l) 行が正**（本行の 15波時点の値は 1075／1394／10726／292枚 で、その後 (l) で更新された）。⚠**80/71/59/54/43/35/33/27/20/15/12/10/8/6 等の旧値は母数が違う**（波ごとに新語彙が増えたため）＝**投入前に必ず `npx tsx scripts/archive/xxixResidualCensus.ts` で数え直す**（実関数 `optionalOnPlayCostStub`／`wrapOptionalOnPlay` を import して live JSON を全数走査する計測スクリプト。簿記の数字は信用しない）。
- **P1 表現①の systematic 指標**：同型★0（`node scripts/groupSimilar.mjs --all`）。**held は 286枚／署名グループ 106件（2026-07-30 タスク12(l) 後に実測。旧 292枚/107件＝(xxix) 15波後。⚠2026-07-29 の5波後は 293枚だった。⚠従来ここに書いていた「251枚」は `21a24900` 時点の値で、その後の parser/manual 変更ぶんが `_held_review.txt` に反映されていなかっただけ＝ベースラインコミットの worktree で再生成して 293/107 の一致を確認済み・`node scripts/heldReview.mjs`）。LOSS/VALUE は held 188 / LOSS 154 / VALUE 34（2026-07-19 実測・`npx tsx scripts/parserWorklist.ts`・⚠HEAD比較＝未コミットJSONは反映されない）**。続き29時点（held 79）からの増加は主に**その後の parser 改善で fresh が curated より正しくなった採用待ちバックログ側**（Sonnetタスク6の採用サイクルで消化してから実数を締め直す）。**この数字からさらに増えたら回帰**（JSON手パッチ時は パーサー同修正 or MANUAL化 or ここを実数更新）。旧内訳の詳細は PLAN_DETAIL 参照。
- **脱落疑い 255枚を全分類済み**（偽陽性179／機構待ち72／修正済・`node scripts/_dropTriage.mjs`）。
- **timing flatten**（当初159枚の実バグ）は R5-R58 で完了＝VALUE 0（詳細 §7下部）。
- **🆕 語彙センサス（過剰効果＋幻覚＝両方向の計器）**：`npm run census`（`scripts/vocabCensus.ts`）。**現ベースライン＝高シグナル欠落 1386【効果単位】**（2026-07-30 「コストの合計」束縛14効果）（🏁 P1完了宣言〔2026-07-23〕の凍結基線1581から、§6.3個別機構の消化で逓減中。1393→1391 は本セッションの構造化2件ぶん）。**宣言後の推移チェーン（1581→1393 の各バッチ内訳）は [PLAN_DETAIL.md](./PLAN_DETAIL.md)「2026-07-30 整理：census 推移チェーン」節へ退避**。宣言後は worklist ではなく回帰ゲート＝**この数字から増えたら回帰（exit 1）／減ったら `BASELINE_HIGH` とここを実数更新**（新規 parser バッチは切らない）。前提＝`docs/_effect_srctext.json` が最新。3分類〔§6.3送り282／粗網のみ116／長テール1183〕は [P1_COMPLETION_ROADMAP.md](./P1_COMPLETION_ROADMAP.md) 冒頭。明細 `docs/_vocab_census.txt`、**宣言前のバッチ逓減履歴（1919→1581）と旧計測は [PLAN_DETAIL.md](./PLAN_DETAIL.md) §4 の退避節**／BUGFIXES 続き109以降。
- **母数**：効果カード 5975／効果 **10679**〔2026-07-30 タスク12(l) で47効果がトップレベルから付与入れ子へ移り 10722→10679〕／旧 10719／MANUAL効果 891／STUB含むカード 1862・STUBノード 2432（2026-07-19 実測更新。STUBS.md サマリーと整合）。
- **A3クローズ＋B機構全完了（B1-B4）**。残るP1機構＝C（engine実機配線・P2）のみ。同型★0（5986枚）。
- **decompile再生成は `npm run regen`**（全シート＋下流一括・UTF-8直書き＝シェル非依存。2026-07-07にリダイレクト方式を廃止。旧「⚠Bash の `>`」問題は解消済みだが、万一 UTF-16 が混入すると下流3スクリプトがガードで即 exit 1 する）。

### 📌 次の一手（推奨順）
> **cold start＝まず `npm install` → `npm run gates`（全ゲート一括・数秒）が緑になることを確認する。** 現状＝golden **1101**・smoke **10679** 全0（SKIP も 0）・fuzz 全0・同型★0・census **1386**（回帰ゲート）・held **286枚/106署名**（2026-07-30 タスク16 `underSelfTrash` 配線後に実測）。
>
> **🏁 P1（表現）は 2026-07-23 に完了宣言済み**（宣言・3分類・以後の運用＝[P1_COMPLETION_ROADMAP.md](./P1_COMPLETION_ROADMAP.md) 冒頭／§2 DoD／§5）。**主軸は P2/P3**＝①**§6.3 機構台帳**（宣言で正式送りした282効果の消化先＝正面40・チーム35・ゲームから除外残・アンコール19・動的比較14・ソウル11・ドライブ9 等を機構単位で）②**§7 実機検証** ③**BEHAVIOR_AUDIT（§5a・フェーズ跨ぎで継続）**。
>
> 1. **自分のモデル側のタスク表（§3）から取る**。**Opus の主戦場＝§6.3 の機構実装（上記の機構単位・実IDは `docs/_p1_classification.txt`）＋タスク12 の生き残り在庫（**現存は (lv) 残2経路と (lx) 2件だけ**＝(lx)①`WX25-P1-056-E1`／②`WX12-020-E3`。**(l) は A群/B群とも 2026-07-30 に残0クローズ**、**(xxix) も完全クローズ**＝残4件は明示保留、**(xlvi)／(xlii)／(lix)／(lviii) も残0**）＋**タスク16 残＝timing 半分32効果のみ**（`cost.underSelfTrash` は 2026-07-30 に残0クローズ。**着手前に振り分け台帳の再トリアージが要る**＝§3 タスク16 の行を読む）**（(i)〜(xl) の大半は消化済み＝1行✅サマリ参照。(vii)(viii)(xxii)(xxix)(xxxix)(xliii) は完全クローズ）。**Sonnet の主力は タスク1（§7 実機検証＝(xi) skip検証・(xxxvi) グロウ支払いUI・傀儡 resume・エナ復帰・5a エナ焼き filter・selectionConstraint UI・opponentSelects UI・比例カウントほか）**＝タスク8 clean群（3,574枚）は任意。タスク4（キュー）は枯渇したので取らない（理由は §3 Sonnet 表）。
> 2. **手順はスキルに従う**＝`/audit-card <CardNum>`（BEHAVIOR_AUDIT 1カード監査1巡）・`/baton`（セッション終了時の簿記）。散文の記憶で回さない。⚠`/census-batch` は P1宣言により**新規バッチを切らない**（census 外の計器から新系統が見つかった場合のみ）。
> 3. **engine/parser/decompiler を触ったら `npm run gates`・シート再生成は `npm run regen`**（§12）。バグは golden に1件足してから直す。

> **新規 timing 配線の確立パターン**：①該当カードの effect/原文を確認 ②`triggerCollect.ts` に pure collector 追加（`mkLimitOk`/`ownFieldSources`/`effsOf` 流用）③検出が要れば `boardDiff.ts` に detector 追加 ④BattleScreen 中央 diff ブロック（`resolveStackNext` 内・mill/freeze 等と同じ場所）に発火配線＋薄いラッパ ⑤`goldenTest.ts` に発火条件テスト ⑥`decompileEffects.ts` の `engineUnwiredTimings` から除去 ⑦`npm run regen`（全シート＋下流一括再生成）＋同型★0 確認 ⑧`npm run gates` 全緑 → commit/push。

---

## 5. フェーズ1残作業：表現（P1）

> **🏁 P1完了宣言済み（2026-07-23）＝[P1_COMPLETION_ROADMAP.md](./P1_COMPLETION_ROADMAP.md) 冒頭の宣言節が正**。census 高シグナル 1581 を「**§6.3 正式送り 282／粗網のみ偽陽性 116／長テール単発・別節偽陽性 1183**」へ3分類（機械分類の実IDは `docs/_p1_classification.txt`）。根拠＝最短ルートのバッチ1〜5＋再クラスタリング生存バッチ（11「相手が選ぶ」43・6「数量比例」27）を全消化・バッチ2〜4は投入前実測で枯渇（別節表現済みの census 偽陽性主体）＝「1 parser規則→N効果」の系統クラスタが出尽くした＝逓減限界。**以後この節の worklist から新規バッチは切らない**＝census は回帰ゲート（`BASELINE_HIGH=1580`）としてのみ維持し、残バグは BEHAVIOR_AUDIT／semantic audit／PARTIAL 計器／§7 実機で単発発見→直修正する。§6.3 送り282効果の消化先は §6.3 台帳（P2/P3）。

### 5a. BEHAVIOR_AUDIT によるバグ収穫（現在の主作業・2026-07-03〜）

**目標＝要レビュー・キュー（`node scripts/_bqTriage.mjs`）を逓減限界まで消化。** 全効果を実行し盤面差分＋ログを原文と目視照合＝逆翻訳の文字列一致では検出できない「真no-op」「未配線timing」「未実装action型」「トリガー主語ミス」を発見して直す。手法・キュー件数の推移は [BEHAVIOR_AUDIT.md](./BEHAVIOR_AUDIT.md) を参照（811→285→261→169→129→高シグナル30）。

- [ ] **キュー消化を継続**：`node scripts/_bqTriage.mjs` で高シグナル選別 → `npm run audit -- --id <CardNum>` で目視 → 「真no-op／シナリオ空振り／STUB未実装」に仕分け → バグは effects JSON 直パッチ＋engine/decompilerセット＋smoke/golden/fuzz で修正。
- [x] **未実装action型 worklist**（§6.1）＝**✅残型0（続き204/204b でクローズ）**。
- [ ] **意味照合監査（semantic audit）の worklist**（§6）＝BEHAVIOR_AUDIT の盤面差分では拾えないSTUB/MANUALの意味エラー（owner取り違え・GRANT_PROTECTION no-op 等）の補完的発見器。
- [ ] **完了判定**：高シグナル件数がこれ以上減らない逓減限界に達した時点で「P1完了＋P2の一部前倒し完了」を宣言し、残りは個別カードの機構待ちとして §6/§7 に送る。

### 5c. 語彙センサスの系統別消化（2026-07-04新設・続き17-18で両方向98計測に拡大・続き23で文型バッチ化・過剰効果＋幻覚バグ）

> **🏁 2026-07-23 P1完了宣言により worklist 凍結**＝下記「残りの消化対象」は宣言時点の歴史記録（3分類は [ROADMAP](./P1_COMPLETION_ROADMAP.md) 冒頭）。census は回帰ゲート（`BASELINE_HIGH=1580`）としてのみ維持し、**新規の文型バッチはここからは切らない**（census 外の計器から新系統が見つかった場合のみ検討）。「残死角」4項は引き続き有効＝BEHAVIOR_AUDIT／PARTIAL 計器の領分。

**目標＝`npm run census` の高シグナル欠落（現ベースライン＝§4 恒久指標参照・2026-07-22 時点 **1817 効果**）を文型テンプレ単位のバッチで0へ逓減。** 過剰効果（フィルタ・条件・使用制限の脱落で対象/発火が広がる・ゲームを壊す側）と幻覚（原文に無い効果/数値がJSONに居る・逆方向）は behavior-audit の無変化キューに掛からない別種のバグ母集団（発見経緯は §4 続き15、拡充は続き17-18）。

- **残りの消化対象（生きている worklist のみ・消化済みバッチの履歴は [PLAN_DETAIL.md](./PLAN_DETAIL.md) §5c。⚠各件数は記載時点のスナップショット＝最新件数は `docs/_vocab_census.txt`／[P1_COMPLETION_ROADMAP.md](./P1_COMPLETION_ROADMAP.md) のバッチ表を正とする）**＝(1) ~~**「代わりに」残テール**~~（🏁**全クローズ**：C✅続き259・D✅続き258・E✅続き260）・B1残10（コスト参照・ターン中イベント等＝条件語彙が無い §6.3）＋**CHOOSE平坦化復元の採用待ち held 約35枚**。(2) **幻覚/取り違え系の残**＝WX16-021（置換ルール→即時LIFE_CRASH幻覚＝置換機構要・§6.3）・BURST内IS_MY_TURN残7（§6.3登録済み）。(3) **構造平坦化系**＝引用付与の残107（CONTSELF_COND 18／OTHER 約30／内側品質不全27＝トリガー語彙拡充で再収穫可・held 103 が計器）・代わりに183・IS_MY_TURN誤変換の残53・遅延13・「Nまで」120。(4) 除去系の対象フィルタ脱落（クラス339=`story`・色105・パワー閾値83・レベル閾値90・凍結13・ダウン/アップ38・数値不一致153・小さい数390=粗い網）。(5) トリガー種別（約220）・コスト脱落（コイン24+場トラ25+エナトラ12+他）・ゾーン行き先67・機構census（ライズ31/チーム25/アンコール22/エクシード16等）・公開128・次相手ターン99・相手選ぶ31・制限58・キーワード86。(6) 制限/様相（ターン1回28・ゲーム1回3・任意→強制23）・保護/付与系（同一性46・共通色66・能力なし10）。(7) 語彙自体が無い系統＝最上級（6枚・`TargetFilter` に `superlative:{key,dir}` 新設）・**正面32**（`frontOfSelf` はあるが使用3件＝parser 未配線疑い）・動的比較の残35・合計制約27・**出現条件35＝機構1本の欠落（parser が除去+engine強制なし）**は §3「機構実装の型」で新語彙＋engineセット実装。
- **進め方＝`/census-batch` スキルに定型化済み**（`.claude/skills/census-batch/SKILL.md`＝続き23確立のパイプライン＋必須ガードレール込み。原文は [PLAN_DETAIL.md](./PLAN_DETAIL.md) §5c）。概要＝①`census:clusters` でテンプレ選定→②既存DSL型で表現できるか確認（不可＝機構待ちとして §6.3 へ）→③parser 規則追加（**JSON手パッチではなく parser を source of truth に**）→④`build:effects`→⑤`heldReview` spot-check→`--adopt`（**STUB退化・「代わりに」昇格・別STUB id 化は採用しない**）→⑥golden 1件/テンプレ＋全ゲート＋BASELINE_HIGH 更新。旧手順（census明細から手パッチ）は廃止＝parserWorklist held を増やさない。
- ⚠判定はカード単位の粗い網（同カード別効果に語彙があれば合格＝過小評価）。効果単位の精密化は消化が進んでから。
- **census 手法自体の残死角（続き18更新＝続き17記載の (a)トリガー種別 (b)小さい数 (c)出現条件 (d)そうした場合誤変換 はすべて98計測に組み込み済み）**＝文字列突き合わせで原理的に見えない残り4つ：(a) **参照解決の誤り**（「それ」の指し先取り違え＝WX09-015 の bounce 対象 self 化。両側に語彙が揃うため不可視）。(b) **効果単位の粒度**（同カード別効果に語彙があれば合格＝カード単位判定のマスキング。消化が進んだら効果単位化）。(c) **JSONは正しいが engine 実装が違う**（behavior-audit／golden の領分）。(d) **文間の実行順序・依存関係**。~~横断的再発防止案＝parser の無言フォールバックに parseStatus:PARTIAL 刻印を義務付ける~~ **✅実装済（2026-07-07・続き38）**＝IS_MY_TURN化（条件抽出失敗の常時true化）・UNKNOWNステップ無言除去（リコレクト/multi-dest分割）で `markSilentFallback()` → fresh の parseStatus を PARTIAL 降格＋`docs/_partial_report.txt` に理由明細（**初回計測142効果＝IS_MY_TURN化125/multi-dest11/リコレクト8・逓減計器**）。parseStatusのみの差分は buildEffectsJson/parserWorklist とも比較から除外（held を汚さない・137枚吸収）。新たな無言近似を parser に足すときは **markSilentFallback を必ず呼ぶ**（「そうした場合」常時true等の意図的慣例は刻印しない）。

### 5b. 逆翻訳機の出力品質（低優先のテール・大半消化済み）

**目標＝英語ID漏れの解消＋B層データ欠落の解消。** 手法は BUGFIXES ⑥〜⑨ で確立済み（engine 実装済みSTUBなら `decompileEffects.ts` に原文抽出/意味文を足すだけ・engine 不変・ゲートは同型★0＋原文照合のみで軽い）。**2026-07-03時点でBEHAVIOR_AUDITに主作業の座を譲ったため、手が空いたときのサブタスク位置づけ。**⚠**「367件」という数字は古い（2026-07-12続き87で実測823カードと判明＝BEHAVIOR_AUDIT等の主作業でカード母集団が増減し続けているため。件数メトリクスを信じない §3の原則どおり）。系統別内訳は`docs/_stub_leak_classification.txt`（`node scripts/_stubLeakScan.mjs`で再生成）参照。**

- ~~durational付与の「ターン終了時まで」期間注記の逆翻訳脱落（母数132枚）~~ **✅続き62で112枚復元（decompiler `restoreLeadDuration`・engine/JSON 不変）・34枚は偽陽性で正しく無注記**（詳細 BUGFIXES・原文は PLAN_DETAIL 2026-07-19退避節）。
- ~~①REVEAL_AND_PICK 文法崩れ／②LOOK_AND_REORDER 行き先欠落／③CHOOSE 圧縮／④BLOCK_ACTION 英語ID漏れ／⑤timing/icon 英語漏れ~~ **✅全て是正済（BUGFIXES①〜⑤・詳細 [PLAN_DETAIL.md](./PLAN_DETAIL.md) §5b）**。
- ~~残＝engine実装済みSTUB id の意味文化~~ **✅是正済（2026-07-07再確認）**＝全10シートの英語STUB露出は3件のみ（`VARIABLE_ENERGY_TRASH_LEVEL_BOUNCE`／`POWER_PLUS_BANISHED_POWER`／`OPP_LRIG_DECK_TO_LRIG_TRASH`＝いずれも§6.3機構待ち登録済み）。
- [ ] **残る単発テール（原文とJSON構造がズレた混線／未構造化STUB）**＝**2026-07-02時点で「1 effect=1クリーンSTUB」で原文抽出できるものは全消化済み（444→367→その後の作業でカード母集団が変動し2026-07-12実測823・続き87で機械分類済み）**。effect構造そのものが原文とズレた混線で、1つのSTUBを原文化しても同 effect 内の他のズレが残り原文一致にならない＝decompilerの原文抽出では対応不能なものが大半。**effects JSON の再parse（機構実装・データ層修正）が本筋＝Opusタスク13**。系統別内訳（16テーマ・カード数の多い順＝デッキ操作系184／パワー修正系165／手札系102／トラッシュ系75／対戦相手コスト系63／エナ系50／ライフ系48／シグニ配置系48／ルリグ系36／能力付与系31／ガード・アタック制限系26／ソウル・アーツ系15／ウィルス系10／色・クラス系4／ゲーム除外系3／チャーム系1／その他54）は`docs/_stub_leak_classification.txt`参照（続き87・Sonnet）。進め方＝1カードずつ effects JSON を原文どおりの構造に手修正→逆翻訳が原文一致するか確認→smoke/golden/fuzz→push（**原文コピーでの一括潰しは禁止**＝実装未完成を隠蔽し検証目的に反する）。
- ~~Z-2：BET系の表現描画~~ **✅完了（続き86・詳細は §3 Sonnetタスク7）**。engine 側（ベット判定自体の実装状況）は変更なし＝表現のみの改善。
- ~~B層：JSONデータ欠落の補完~~ **✅是正済（続き33-36・2026-07-07再確認＝全10シートで「then/destination 欠落」0件）**。例外は§6.3登録済み（WDK07-E15／WXDi-P07-010／WXDi-P03-005／WX26-CP1-100）。
- [ ] **完了判定**：grep 走査で英語ID漏れ0 ＋ シートごとランダム20枚の原文照合 spot-check で一致を記録 → **§2 DoDの4つ目にチェックを入れる**。

---

## 6. フェーズ2残作業：実行の正しさ（P2）

**目標＝「表現はあるが実行が近似/未実装」の解消。** engine を触るので毎回 smoke・golden・fuzz（＋バグは golden に1件足してから直す）。

### 6.1 未実装action型 worklist（behavior-audit 段階4で発見・完全no-op・2026-07-03）
**✅全型クローズ＝残型0（2026-07-19時点。最後の `PREVENT_DAMAGE`／`COST_SUBSTITUTE` は続き204/204b で実装）**。当初14種42効果からの逐次実装の経緯・「修正層は effectType で決まる」の教訓は PLAN_DETAIL §6.1・BUGFIXES（続き116/122/123/202/204）参照。

### 6.2 意味照合監査（semantic audit）の worklist（2026-07-03新設・仕組みは [SEMANTIC_AUDIT.md](./SEMANTIC_AUDIT.md)）
原文 vs effects JSON を LLM で意味比較する検査パイプライン（`scripts/semanticAudit{Extract,Run,Triage}.mjs`）。パイロット（stub群30枚精査）で precision約78%・30枚中17枚に確定バグ（同型★0・smoke/fuzz緑を通過済みのカード）。

- [x] **系統①：相手デッキ削りの owner 取り違え＝✅完了**（(a)純・相手のみ58枚是正／(b)「あなたか対戦相手」17枚は続き106で CHOOSE 化／(c)誤検知9件は修正不要。詳細 BUGFIXES 続き88・106・原文は PLAN_DETAIL 2026-07-19退避節）。
- [x] **系統②：GRANT_PROTECTION `count:'ALL'`＋subjectFilter無し＝48件 ✅完了（続き239・Opusタスク9）**。単体保護24件は `count:'ALL'→1` 是正済（2026-07-03）。(a)SEQUENCE内GRANT_PROTECTION（WX08-017）(b)LAYER付与型（WX15-031）(c)広域24件のうち subjectFilter/条件/from で表現可能な**9カードを是正**（下記の engine 中核＝`collectEffectImmuneSigni` の `target:{count:'ALL'}` 偽陰性を subjectFilter へ変換＋`isDrive`/`sourceCostMin`/`excludeSelf`/local matchesFilter への costMin/hasCrossIcon 追加）。残る広域テールは真の§6.3（下記）へ登録。詳細 BUGFIXES 続き239。
- [ ] **パイロット findings の個別修正**（真バグ39件・要追精査3件＋stub群残20枚・clean群50枚の findings）＝`node scripts/semanticAuditTriage.mjs <outDir>` で精査→1カードずつ標準ワークフロー。
- [x] **スケールアップ**＝stub群 **✅続き144〜146で母集団2,401枚を全数監査完了**（findings は Opusタスク12 (xxvii)(xxviii)(xxix) に集約）。残＝clean群3,574枚への展開（任意・低優先＝Sonnetタスク8）。

### 6.3 残・大型機構（個別カード・機構待ち）

> このセクションは機構台帳＝**現存の残作業は下記「残作業（A〜G）＋正面サブ機構の残」に集約**。消化済み機構の実装詳細（フラグ・ファイル・commit）は BUGFIXES 各日付が一次記録（各機構が日付/commit を明記済み）。

**残作業（2026-07-24 整理・現存の全項目）**
- **A. 動的コンテキスト追跡系**＝**✅続き280で完全クローズ**。WX11-027 は「発生源カードがLBを持つか」ではなく解決中 `effectType:'LIFE_BURST'` を照合して相手LBだけを遮断。WX24-P4-006 は対象にしてダウンした相手ルリグの instanceId→レベルを予約へ固定し、`damageSource:'signi'`＋厳密な `< N` をダメージ消費経路で評価。WXDi-D07-007 は防いだ回数ごとにターン終了時5枚ミルを重複予約し、2回防御なら10枚を実移動する。旧「機構待ち」だけでなく前2枚が限定脱落による有害な過剰効果だった実態へ訂正。
- **B. BANISH_REDIRECT 残**＝✅完全クローズ（2026-07-24＝正面限定3件＋WX25-P3-104-E1 単体×パワー0 動的ゲート・268）。
- **C. IS_MY_TURN 誤変換の未消化サブ系統**＝**fresh 残42効果**（2026-07-27 honest 再生成値。⚠続き284/285 の「33→26件」は消化行を手で削った値だったため訂正＝続き286。**`docs/_partial_report.txt` は `fresh parser` の出力を測る計器で、続き283〜287 の修正は curated JSON への外科的適用なので、消化済み効果もレポートには載り続けるのが正しい**）。**live/curated 側では22効果を消化済み**（続き283=2／続き284 公開軸=9／続き285 ミル・トラッシュ軸=7／続き286 移動軸=1／続き287 誤parseテール=3）。全数分類は `docs/_partial_triage.txt`「2026-07-27 §6.3 段3」節。**共通ブロッカーは「前段 action/STUB が結果を `lastProcessedCards` に記録しない」の一点**で、条件語彙（`LAST_PROCESSED_COUNT_GTE`／`_MATCHES{minCount,operator,distinctName}`／`_LEVEL_SUM`／`_ALL_MATCH`）は既に揃っている。⚠**writer を足すたびに「後段で lastProcessed を読む効果」を実データで全数走査すること**（gates では捕まらない。`TRASH` は既存 reader 50件・`REVEAL_DECK_TOP` 22件・`BANISH`／`TRANSFER_TO_DECK` 各7件＝触るなら全数照合が先）。**✅前段 action 誤parse 3枚は続き287で消化**＝`PR-K049-E1`（両者のデッキ最下ミル結果を合算し、レベル合計6以上で正面−5000）／`WX24-P4-045-E1`（固定した相手シグニを相手ライフへ移し、成功時だけ自身へダブルクラッシュ）／`WX22-043-E1`（手札のアクセアイコン持ちを2枚までエナへ移し、実移動2枚でドロー）。
- **D. レゾナ出現条件トリガー7効果**＝**✅続き279で完全消化**。実データ全数は WX10-055-E1／WX10-076-E1／WX10-086-E1／WX21-021-E2／WX21-047-E1（そのレゾナ参照なし）＋WXEX1-58-E1（＜宇宙＞のそのレゾナ）／WXEX1-72-E1（＜遊具＞のそのレゾナ）。続き262の共通召喚支払いを `fieldTrashCostCards` と同じ `collectBoardDiffTriggers` へ載せ、`resonaConditionCardNum` で「出現条件支払い」と今出たレゾナの instanceId を伝達。通常trash・バトル/ルール処理・他コストは非発火、限定2件は `CardClass` 照合後にそのレゾナだけへ次の自ターンまで耐性付与。旧記載の「2枚」は全件走査で7効果へ訂正。
- **E. 個別カード機構待ち**（続き282で全件を実データ・collector/executorまで再診断）＝**✅WX15-016 は消化**：新キャンセル機構は不要で、既存 `GRANT_LRIG_ABILITY`→防御側 `ON_ATTACK_SIGNI(any_opp)` 収集、デッキトップTRASH記録、`LAST_PROCESSED_MATCHES{hasLifeBurst}`、`SET_CANCEL_OPP_ATTACK_FLAG` を合成して忠実化。**✅WXDi-P06-031 は続き288で消化**：センタールリグ【起】の実ルリグゾーン候補を純関数で固定し、既存の相手場コスト増加collectorをルリグ支払いモーダルへ接続。E2は新 `IS_SELF_DOWN` でパワー+3000とガード追加《無》を同時に限定し、従来 `SEQUENCE` 内で読まれずno-opだったガードSTUBも再帰走査へ是正。**✅WXDi-P08-037 は続き290で消化**：単体`swap` pending/UI基盤を新設し、E2のトップ公開シグニ↔アップ状態自シグニ任意交換を忠実化。「入れ替えない」のUI入力nullはswapだけ空配列へ変換し、`count:'ALL'` の恒等配置規約を維持。【出】はこの経路でON_PLAYを積まないため結果として発動しないが、`suppressOnPlay` 自体はpending保持のみで未参照。配置順列の7状態は従来未追従だった範囲を追加した挙動変更。残＝WX20-028-E2（多重アクセ state・§6.4級）／permanent引用付与残（⚠`GRANT_LRIG_ABILITY.permanent` は既に実装済み。残は主に引用シグニ能力のpermanent/相手付与）／WX17-044（自己除外先 `excluded` は既存だが、トラッシュ起動コスト・トラップ選択・表向き発動・攻撃中対象固定が先）／WXDi-P05-006 choice①（ピースカットイン割込み基盤。着手禁止）／WX25-P3-023-E2（2ターン持続＋相手効果による相手手札移動 collector。E1は発火・ターン2回・微菌条件・択一まで既存）／WDK14-013（**トラッシュ→ビート、4枚条件、ON_BECOME_BEAT連鎖は実装済み。残は複数候補時のプレイヤー選択のみ**）／WX20-Re20（選択数依存コストに加え、能力なしfilter・好きな枚数場出し・出した同一群のターン終了時trashが不足）。**WXEX1-08 は✅続き278で消化済み**。旧「各カード全体が単一の機構待ち」という記載を4項目で訂正。
- **F. 保留**（core改変が過大リスク）＝WXDi-P00-026（さんばかルリグ付与・ルリグ再アタック未実装がブロッカー）／47枚の【使用条件】【チーム】（正規デッキ常時成立で機能等価＝保留妥当）。
- **G. 置換else系統の残（続き269・§3タスク5から正式送り）**＝**B 2件の置換else部分は✅続き289で消化**。SPK06-01-E1 は追加赤0/2/4の三択を同一対話で保持し、対象数1/2/3を排他的に実行（付随するレイラのコイン技回数・次回コスト軽減は既存基盤が無く別途defer）。WXK06-032-E1 は既存 `refresh_count_this_turn` を双方参照し、最初に選んだ同一対象へ－4000/－12000を排他的に適用する。**残はC 13件**（反復、引用能力／ルリグ能力付与、複雑CHOOSE、支払い系ルール等）。CのWXDi-P02-042-E1を再確認したが、相手側のターン中手札捨て枚数を読む条件軸が無いためhonest defer。effectId 全明細と不足機構は `docs/_replace_else_triage.txt`。

- **🆕 H. タスク12(xxii) から正式送りの不足機構3件（続き296・2026-07-28）**＝(xxii) 本体は完全クローズしたが、以下は `UNKNOWN{raw}` で honest defer 中（**過剰実行はしない＝現状は安全側**）。実装時は `raw` に原文全文が入っている。
  - **✅ H1 `WX15-067-E1`（メルト・ファクト）完全実装（2026-07-30）**＝`pendingSpellCast.virusRemovalByZone` で支払い前の任意数選択をこの使用宣言だけに保持し、確定時に相手 `field.signi_virus` から実数を除去。1個以上ならこのカードだけ《黒×2》軽減、`pending_spell.pre_use_virus_removed` を解決ctxへ渡し、2個以上なら本体を「2つまで」に上書きする。`next_spell_cost_reduction` は不使用・既存の次スペル規約も不変。goldenで0/1/2個（コスト2/0/0、択1/1/最大2）を固定。
  - **✅ H2 `WXDi-P11-010A-E1`（夢限 -Q-）完全実装（2026-07-30）**＝手札＋エナ＋トラッシュの全デッキ戻し/シャッフル、ルリグデッキ＋場のセンター最上段以外（全シグニスタック・アシスト・キー・アクセ・チャーム・ソウル・各設置カード/トークン・旧ルリグ下敷き）の全除外、同一instanceのB面 `WXDi-P11-010B` 反転を単一state writeで原子的に実装。`ON_LRIG_FLIP`（既存0件）でB面E1の5ドロー＋エナチャージ5を発火し、B面Limit 9/E2【起】へ切替、A面能力とQ専用limit累積を停止。通常盤面diffを通すため最上段シグニの `ON_LEAVE_FIELD` は発火。詳細は BUGFIXES 2026-07-30節。**⚠旧記述の訂正**＝「`faceDown` は表示 prop のみ＝新設が要る唯一の点」は**誤診断**だった。「裏向きにする」は表示ではなく**両面ルリグのB面《夢限 -A-》化**（Limit 9・B面E1「-Q-から-A-になったとき」5ドロー＋エナチャージ5・B面E2【起】）で、必要だったのは新state ではなく**既存 `card_identity_overrides` の再利用＋反転トリガー timing の新設**。**H3 の「ピースの両面反転」も同型なので、この経路（`card_identity_overrides`＋`ON_LRIG_FLIP` 相当）を先に読むこと**（`AWAKEN` はログのみで共通の変身基盤は存在しない）。
  - **✅ I. `WX24-P3-069-E1` ガード追加コスト枚数化（2026-07-30）**＝collectorを合計枚数へ拡張し、STUB `count` 省略時1を維持。既存ルリグ付与ストアのCONTINUOUS走査、警告《無》×N、`energy.length < N`、確定N枚徴収を一体で配線した。新たに有効化される付与ストア効果は全数走査で同カードの1効果だけ。
    - **✅ I' ガード追加《無》11効果を完全クローズ（2026-07-30）**＝parser が連続《無》を `count` へ載せ、`WXDi-P01-035-E1` と `WX24-P2-047-E1` を2枚化。AUTO/ACTIVATED の「このターン」3効果は新 `opp_guard_extra_colorless_this_turn` に加算し、全ターン終了3経路でリセットする。`prevent_opp_guard` は本当の完全禁止語彙だけへ分離。「このゲームの間」2件は既存永続実装を維持し、重複STUBを加算しない。詳細は BUGFIXES 2026-07-30節。
    - **⚠ I の潜在結合（実害なし・将来の落とし穴）**＝`executeSigniOnPlay` の `beatZones`（`Set<number>`）が **`beat_signi` の「場ゾーン index」と `beat_signi_from_trash` の「トラッシュ index」で同じ集合を共有**している。実データで両コストを併せ持つ効果は**0件**（全数走査）なので現状は実害なしだが、将来併記カードが出ると支払いが `ok:false` で**無言 abort** する。併記が現れたら選択集合を分離すること。
    - **⚠ I の付与ストア走査は `activeCondition` を評価しない**（`effectEngine.ts:3137-3142`）。今日の唯一のエントリ `WX24-P3-069-E1-G` は無条件なので実害なしだが、条件付き CONTINUOUS を付与する効果を足すときは effectsMap 側と同じ `checkActiveCondition` を通すこと。
  - **✅ H3 `WXDi-P13-003A-E1`（未知の邂逅・ピース）完全実装（2026-07-30）**＝盤面依存の使用条件「このターンにセンタールリグをグロウしていない」を候補表示・実行直前の両方で評価（【ドリームチーム】白/黒1体以上は §6.3 F の正規デッキ常時成立方針どおり機能等価保留）。手札全捨て＋エナ全トラッシュを中央盤面差分 collector と手札捨て collector に通し、実移動5枚以上なら `key_piece` の同一instanceを `card_identity_overrides` でB面 `WXDi-P13-003B` にして除去、`executeGrow` の optional instance/base/free/consume 引数へ渡して単一commitで無料センターグロウ。`actions_done` には `GROW` を積むため同ターンの通常グロウを封じ、B面E1/E2の【出】は既存ON_PLAY経路で発火する。

**「正面」サブ機構は✅完全消化（続き281）**（機構台帳・commit 5ca1a96d/269931a0）。target 解決型5効果＋CONT パワー修正4効果、続き261の(b)(d)(e)、続き262の(c)に加え、残4枚も実測して完了。WXDi-P13-082／WXK02-084 は引用内側を `GRANT_EFFECT.effect:{CONTINUOUS, activeCondition:FRONT_SIGNI}` へ構造化し、既存 `granted_effects`→BattleScreen `effectsMap` の instanceId マージ経路で毎フレーム評価（新runtime stateなし）。WXDi-P08-060 は引用 `AUTO` の展開・self攻撃時収集は既存どおり使い、誤って自軍任意対象だった内側BANISHを `owner:opponent,frontOfSelf:true` へ訂正。WXDi-P06-042 は旧same-zi規約問題ではなく、JSONが全体強制 `FORCE_SIGNI_ATTACK{self}` に誤変換されていた真バグで、既存 `FORCE_FRONT_SIGNI_ATTACK`（2-zi）へ訂正。production形goldenで正面成立／非正面・条件不成立を両方固定。

**✅消化済み機構の台帳**（実装詳細は BUGFIXES 各日付）＝GRANT_PROTECTION 効果耐性（sourceFilter・self-except・相手エナ免疫・動的盤面条件・POWER_MODIFY 免疫5）／BANISH_REDIRECT target側スコープ（属性・単体・正面・パワー0）／ガード喪失条件（canCardGuard 統一）／IS_MY_TURN action層3枚／ダメージ置換「ブースト」条件（IS_BOOSTING）／スペル被破棄【自】2枚／続き20 STUB（powerPlusBanishedPower・variableEnergyTrashLevelBounce・negateNthAttack 等）／引用AUTO付与（残＝permanent 付与）／「ゲームから除外」基盤+8枚（PlayerState.excluded 実ゾーン化）／状態フィルタ脱落12効果／GRANT_LRIG_ABILITY 低品質展開／BURST内新語彙（全クローズ）／resume経路 collector 統合／対戦相手離脱トリガー3枚（any_opp watcher）／アーツ使用条件（ARTS_USED_THIS_TURN）／自パワー閾値（全クローズ）／ON_CARD_MILLED_FROM_DECK＋ゲーム持続付与AUTO（game_granted_auto_effects）＋リフレッシュ置換／毒牙 ON_OPP_POWER_DECREASED／G072族（完全クローズ）／multi-dest pick（全クローズ）／REVEAL remainder shuffle／GRANT_TO_PLACED_SIGNI／凍結アサシン変種／公開→自身アクセ化（INTERNAL_ACCE_PICKED_TO_SELF）／公開同レベル動的フィルタ（levelEqLastProcessed）／前ターン跨ぎ保持（LIFE_CRASHED_LAST_TURN）／使用制限誤パース＋択崩壊（全クローズ）／引用・LB付与（ディスペア）／WXK10-008／任意コスト+特定札捨て複合／リコレクト択一・ウィルス数スケール・WD22-036-G・WX25-CP1-002 他。

### 6.4 オープンな実装課題（機構・基盤）
- **F-3 効果バニッシュ経路（身代わり置換の execBanish フック）**：現状バトルバニッシュのみ対応。効果バニッシュ/バウンス等の場離れは未フック。対象: WX06-019（効果離場+powerReduction）／WX25-P1-056（非バニッシュ離場→バニッシュ置換）／WX17-075（`ON_PLACED_FRONT` 任意トリガー）。いずれも現状 no-op で無害。
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

**残る実機検証項目（これだけが未消化）**：
- **ON_LRIG_GROW④**＝《ターン1回》の実機検証：標準グロウの二重発火ブロックは確認済（続き132）・コード疑義は✅続き206の全コレクタ監査で「穴なし」確定。**残＝ゲット・グロウ（GROW_FREE横グロウ）経路の E2E が driver で完走できず未検証**（`openFreeGrow` 後に lrigTop が変化しない・原因未特定）。
- **(xi) の skip 検証**＝`CONDITIONAL{条件, then:STUB OPTIONAL_COST}` 包み（続き206修正）で、skip 選択時に本体が発動しないことの実機確認。
- **(xxxvi) のグロウ支払いUI**＝エナ代替トラッシュ（`wildcardInstIds`/`colorOverrideMap`）のグロウ経路配線（続き206）の実選択検証。
- **クラフトトークンの実機配置**の残＝WX22-001-E3（§6.4）。
- **🆕 lrigDown コストの限定（続き218）**＝(a) センター限定（`WXK10-023`・`WXK10-037`・`PR-K064`）で**アシストルリグが支払い候補にならない**こと。(b) レベル限定（`WXDi-P03-009`・`WXDi-P04-042`・`WXDi-P02-009`）で**該当レベル以外のルリグが候補にならない**こと。どちらも支払い可否（コストモーダルの活性）と自動支払いの選択順の両方を見る。
- **driver 側**＝30件超の連続実行で出る低頻度フレーク（Sonnetタスク3。`oppDraw` 単独FAILは別要因で未解明）。

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
