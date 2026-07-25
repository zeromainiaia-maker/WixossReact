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

- **`effects_*.json` は手動管理。`build:effects`（再生成）は破壊的＝絶対に実行しない。** JSONは直接パッチ（`effectId` をアンカーにした `.mjs` で外科的に）。
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
| ~~**1**~~ | ~~引用付与の内側 ability parse~~ | — | — | **✅クローズ（続き224）**。詳細は [PLAN_DETAIL.md](./PLAN_DETAIL.md) 2026-07-24節・BUGFIXES 続き164/205/224 |
| ~~2~~ | ~~census「動的比較」の残~~ | — | — | **✅クローズ（続き237）**。詳細は [PLAN_DETAIL.md](./PLAN_DETAIL.md) 2026-07-24節・BUGFIXES 続き237/203 |
| ~~3~~ | ~~DRAW 脱落の parseSingleSentence 直呼び経路~~ | — | — | **✅tractable 分クローズ（続き238）**。残＝真の§6.3単発機構待ち（WXK07-042／WX20-049／WX26-CP1-066／per-count ドロー＝タスク6・§6.3 長テールへ合流）。詳細は [PLAN_DETAIL.md](./PLAN_DETAIL.md) 2026-07-24節・BUGFIXES 続き238 |
| ~~4~~ | ~~§5c 条件節の残~~ | — | — | **✅クローズ（続き255・Opus）**。残3枚は engine 置換機構不要と判明＝068/070 は `matchesFilter` の cardType 非対称緩和（レゾナをシグニ扱い）でレゾナ標的化を是正・116 は ARTS_USED_THIS_TURN で既に動作。golden 724→726。詳細 BUGFIXES 続き255 |
| 5 | 小口持ち越し（隙間埋めに最適） | 単点（parser/engine/decompiler混在） | S×件数 | 残＝置換系統40枚の一般化（分離 pick 単独解決＋置換 else 機構・§6.3級）／WXEX1-65 正面 owner＋レベル比較／WXDi-P05-009「それ」先行詞解決／WX20-053「手札かデッキ」二重ソース SEARCH／WXEX2-50 動的レベル制約／catch-all「デッキに戻す」の全数再点検（続き203 (a)(b)(c)）＝いずれも単発機構待ち（§6.3送り）。個別項目（WXDi-P03-005/GRANT_LRIG_ABILITY 5枚/TRANSFER_TO_DECK 混入/WXEX2-25-E3/自己犠牲5枚/WX26-CP1-100/PR-Di038）は続き218e/218i/218k/189/232 で消化済。詳細は [PLAN_DETAIL.md](./PLAN_DETAIL.md) 2026-07-24節・BUGFIXES 各続き |
| ~~6~~ | ~~「代わりに」残テールの機構系~~ | — | — | **B1残5枚 全消化（続き256/257・Opus）**＝WXDi-P11-067（既存 TURN_HAND_DISCARD_GTE）・WX14-070（新 THIS_CARD_UPPED_FROM_DOWN_THIS_TURN）・WDK17-014（新 COST_TRASHED_PUPPET）・WX25-P2-101（新 COST_DISCARDED_SIGNI_LEVEL）・WXK06-071（新 OPP_CARDS_MOVED_TO_DECK_THIS_TURN＝中央 countMovedToDeck 差分・多段閾値ネスト CONDITIONAL）。別対象二重POWER_MODIFYの過剰効果を条件置換へ。census 1567→1562・golden 730。**D:置換ルール9 全数消化（続き258・Opus）**＝実バグ5効果（WX13-031-E1/WX16-001-E1/WXK04-068-E2＝新 `BATTLE_BANISH_PREVENT_LOSE_ABILITY`〔REMOVE_ABILITIES 幻覚を撤去しバニッシュ防止＋能力喪失を実装〕・WX14-026-E1＝新 `substituteCost.lifeCrash`〔CONTINUOUS LIFE_CRASH 幻覚を撤去〕・WX10-033-E1＝trigger.thisCardOnly 脱落是正）＋WX25-P1-056-E1 を acknowledged STUB `EFFECT_LEAVE_REPLACE_BANISH` で§6.3送り、残4件は既実装/偽陽性と確定。census 1562→1557・golden 732。**C:コスト代替6 全数消化（続き259・Opus）**＝実バグ4効果（WX24-P1-060-E1/WX25-P3-076-E1＝新 `COST_TRASHED_MATCHES`・WXEX2-48-E3＝既存 `ACTIVATED_DISCARD_COUNT_GTE` へ配線〔いずれも SEQUENCE 両実行＝二重バニッシュ/最大4体配置の過剰効果を置換 CONDITIONAL へ〕・WX07-027-E2＝能力スコープ任意コスト代替を強制 TRASH ステップから `cost.costSubstitute` 宣言へ〔engine 未実装・安全側〕）＋【出】経路の `last_cost_trashed_cards` 追記バグを上書きへ統一、WX08-042/WX21-044 は色オーバーライドで既実装と確定。census 1557→1554・golden 733。**E:リコレクト2 消化＝🏁タスク6 完全クローズ（続き260・Opus）**＝真因は機構ではなく計器で、`recollectArts` は parser→engine 実装済なのに**逆翻訳が「《リコレクトアイコン》［N枚以上］代わりにKつまで選ぶ」を丸ごと落として原文照合できず**高シグナルに残っていた（decompiler へ追加）。全文照合で見つけた実バグ＝「それは能力を失い、それのパワーを－Nする」複文で**パワー修正が丸ごと脱落**していた4効果（WX26-CP1-009 の－30000／WX25-CP1-084／WX25-CP1-093／SPDi43-09）を `SEQUENCE[REMOVE_ABILITIES, POWER_MODIFY{targetsLastProcessed}]` へ是正＋engine に `REMOVE_ABILITIES` の `lastProcessedCards` 記録を追加。census 1554→1552・golden 734。**残0**。詳細 BUGFIXES 続き256/257/258/259/260/235b |
| ~~7~~ | ~~§6.1 未実装action型の engine 実装~~ | — | — | **✅クローズ（続き202/204/204b）＝残型0**。詳細は [PLAN_DETAIL.md](./PLAN_DETAIL.md) §3・§6.1／BUGFIXES 続き202・204 |
| 8 | §6.3 大型機構 | engine機構＋parser | L（項目ごと独立） | ゲーム除外・canCardGuard 統一・多段閾値 nested CONDITIONAL・スペル被破棄【自】収集パス・ON_LEAVE_FIELD 相手scope 3枚・出現条件レゾナ35・正面32の parser 未配線調査 |
| ~~9~~ | ~~§6.2 semantic audit 系統残の機構対応~~ | — | — | **✅クローズ（続き239・Opus）＝9カード是正**。残の広域テールは §6.3 台帳「GRANT_PROTECTION 効果耐性」へ登録（大半は後日消化済）。詳細は [PLAN_DETAIL.md](./PLAN_DETAIL.md) 2026-07-24節・BUGFIXES 続き239 |
| ~~11~~ | ~~BEHAVIOR_AUDIT 高シグナル22 の最終仕分け~~ | — | — | **✅クローズ（続き234）＝真no-opバグ0件**。副産物でアーツ一時付与の内側【自】parse 失敗3枚をタスク12 (l) へ登録。詳細は [PLAN_DETAIL.md](./PLAN_DETAIL.md) 2026-07-24節・BUGFIXES 続き234 |
| 12 | **Sonnet が積んだ engine/parser バグの修正（常設受け口）** | 可変 | 可変 | **下の在庫リスト参照** |
| 13 | §5b 混線テール（実測823カード・16テーマ分類済み） | JSON再parse（1カードずつ） | L（低優先） | effect 構造そのものが原文とズレたカードの再parse。逓減テール＝他が尽きたら |
| 14 | リファクタ Stage2→Stage3 純粋バトルコントローラ | BattleScreen構造 | L | ✅Stage2完了＋永続化移行完了（battle_states 全行 I/O 120箇所を `persist` へ移行）＋reducer 7 action・58/114 commit 経由（続き244-247）。設計/移行レシピ `docs/BATTLE_CONTROLLER.md`。**残＝reducer純粋化の本体（56 commit）**＝命令的 `update` インクリメンタル構築（約22ハンドラ）／pending_spell・pending_effect／spread。⚠ハンドラ側 payload 構築は golden 非カバー＝機械一括変換不可・1件ずつ手動レビュー要（レシピ BATTLE_CONTROLLER.md §4） |
| 15 | （大型・任意）§8 CPU AI のメインフェイズ拡張 | 新規設計 | L（特大） | ⏳DESIGN §4「CPU は対人戦と同じ処理」の統一が先 |
| ~~17~~ | ~~timing 判定が本文後半/引用内のトリガー語を先に拾う~~ | — | — | **✅続き136で修正＝23効果是正**。詳細は [PLAN_DETAIL.md](./PLAN_DETAIL.md) 2026-07-24節・BUGFIXES 続き136 |
| 16 | timing 語彙センサス（`npm run census:timing`）の消化 | parser語彙 | S（ロングテール） | **残40効果/37クラスタ**（[A]完全wired はほぼ枯渇・大半 [C]§6.3 機構待ち＋[B]軽量拡張）。上位＝「シグニの下からトラッシュ」3・「アタックを効果によって無効にしたとき」2・以降ロングテール。3階層の消化経緯は PLAN_DETAIL §3・振り分け台帳 `docs/_timing_census_triage.txt`。ゲートではない（exit 0） |

**Opusタスク12＝未消化の在庫**（Sonnet が観測して積んだ engine/parser バグ。**下表は残作業のある在庫のみ**。消化済み在庫〔(i)〜(li) の大半〕の完了行原文は [PLAN_DETAIL.md](./PLAN_DETAIL.md) §3〔2026-07-19・2026-07-24退避節〕）：

| ID | 内容 |
|---|---|
| 🆕(liii) | **「それのレベル1につき〈N倍の効果〉」＝対象のレベルに比例する count の語彙が無い**（続き260・Opus観測）＝WX26-CP1-005-E1 選択肢②「＜プリオケ＞のシグニ1体を対象とし、**それのレベル1につき**対戦相手は手札を1枚捨てる」が**対象指定ごと落ちて `count:1` 固定**。**原文15効果の族**（WX13-004-E1 のエナチャージ・WX24-P4-004-E1 の手札捨て等も同じ脱落）。`POWER_MODIFY_BY_TARGET_LEVEL` はパワー専用。忠実実装には ①`resolveNum` の `$ref:'last_processed_level'` ②「対象を選ぶだけで記録する」ステップ（SELECT_ONLY 相当が無い）の2点が要る＝族単位で消化する。|
| 🆕(lii) | **修飾語なし「シグニ1体を対象とし、それを〜する」が `owner:'self'` へ落ちる**（続き259・Opus観測）＝本来は `owner:'any'`（どちらのプレイヤーのシグニでもよい）。WX07-027-E2 のコスト代替消化中に顕在化＝「シグニ1体を対象とし、それをバニッシュする」が**自分のシグニしか狙えない**。`parseSigniTarget` の既定値の問題で**影響範囲が広い**（bare シグニ指定の全カード）ため単発では触らず、全数機械分類して偽陽性を切ってからのバッチ消化が要る。|
| 🆕(xxii) | **後置条件節の IS_MY_TURN 誤変換（当初127件）**＝続き143〜212 の12バッチ＋続き241 で系統消化（LAST_PROCESSED 系条件の一般化・`STATE_CONDITION_CLAUSES` 拡充・`unwrapWrappedRecorder` 等）。**残＝真の§6.3級 約41件**＝ラップ以外の IS_MY_TURN 化はいずれも前段が STUB（非記録アクション）か新規状態追跡機構（ビート数/リミット/ターン累計エナ/did-search/アタック幾何/追加コスト・色支払い）が要る。各々独立した単発機構待ちで据置。明細 `docs/_partial_report.txt`・分類 `docs/_partial_triage.txt` |
| 🆕(xxxix) | **逆翻訳全文照合で検出した「条件以外の原文不一致」計24効果**（続き210-213・Codex/Opus）。先頭条件脱落5枚（続き219・`HAND_DIFF` 配線）・CHOOSE 前状態条件10枚（続き219b・`matchLeadingStateCondition`）・tractable 2枚（続き242・`levelLteHandDiff`）を消化。**残＝真の§6.3級のみ**＝「このアタックを無効にし」系3枚（攻撃無効化 action 型が engine に無い）／WXK09-003 赤分岐（ライフクロス→エナ新ゾーン遷移）／WXDi-P06-039「このシグニの下にあった」照応（leave 時の under-card 追跡機構）／Magic Box 3件。詳細 BUGFIXES 続き219/219b/242 |
| 🆕(xxix) | **semantic audit stub群 round3（2,101枚・findings 2,799件）**＝①duration系統✅続き148（34効果）・②選択肢欠落✅続き149（84効果）・③「そうした場合」IS_MY_TURN の did-it ゲート欠落✅続き218h（engine で系統解消・155効果152カード＝全 action 型の空振り時発火を是正）。(a)WX06-014-E2✅続き222・(b)222クラスタの凍結種別取り違え18効果✅続き223・(b1)照応先ロスト系統（power-down owner 22件＋hand-add zone 13件）✅続き226・(b2-i)「そのシグニの【出】能力」76効果を `suppressOnPlay` fold へ✅続き243。**残＝(b2)真の§6.3級**＝ルリグかシグニ union（NEGATE_ATTACK 対象種別）・別系統 MISSING（ADD_TO_FIELD 自身【出】が未発火）・BET・unless。詳細と表 `docs/_semantic_audit_stub_round3_triage.txt` §6・BUGFIXES 続き223/226/243 |
| 🆕(xliv) | **`BANISH_REDIRECT` の残テール**（族36効果を全数棚卸し）。パワー0限定/owner 誤り/属性フィルタ（続き218b/230）・効果経路 `banishDestination` の【常】走査（続き231・`fieldEffectBanishRedirectToTrash` 新設）を消化。**残＝⛔§6.3 級**：(a3) bySource='by_this' の効果経路（発生源シグニ配線が要る）／(b) 単体対象4件（対象選択フローが無い）。(c) 正面限定3件は✅2026-07-24消化（`frontOnly`＋`zoneIdx`・268）。詳細 BUGFIXES 続き230/231 |
| 🆕(xlvi) | **parser は `REVEAL_AND_PICK`（手札に加える）を出すのに curated が古い `LOOK_AND_REORDER` のまま held ドリフトしカードアドバンテージが死んでいた系統**。✅続き218g で9効果を外科的採用（census 1886→1880）。**残＝真ドリフト36件中の未採用27件**＝大半が `parseStatus:MANUAL` で fresh が filter/条件を落とす過剰簡約（WXK10-022-E3 無色ではない・WXK01-004-E1 レベル奇数等）＝忠実表現する parser 拡張が要る §6.3級。詳細 BUGFIXES 続き218g |
| 🆕(xlii) | **フォールバックSTUB `GRANT_LEAVE_PLACE_PENDING` 残2枚**（続き216・Opus）。主因を消化し WXEX2-51-E1 を実装・7枚も是正。残＝(a)WX21-004-E2「同じレベル」配置＝`levelEqTrigger` 語彙が要るが該当1枚で据置（STUB維持・no-op）(b)WX22-001-E3＝フェイズ限定の遅延 ON_LEAVE_FIELD watcher＝`INSTALL_DELAYED_TRIGGER` の ON_LEAVE_FIELD 拡張が要る §6.3級。詳細 BUGFIXES 続き216 |
| 🆕(l) | **アーツ「ターン終了時まで、あなたのセンタールリグは「【自】…」を得る」の内側【自】parse 失敗3枚＝完全 no-op**（続き234・Opus観測）＝WD21-009／PR-204／WX15-016。`GRANT_LRIG_ABILITY{abilities:[]}` に full rawText を抱えたまま内側【自】が nest されずアーツが何もしない。同パターン11枚中8枚は正しく nest 済＝§6.3 新機構は不要・内側 ability parse 改善で直る。失敗3枚の内側は複雑（アタック時トリガー／数字宣言／バーストアイコン照合／アタック無効）。詳細 BUGFIXES 続き234 |

#### Sonnet のタスク（2026-07-15 棚卸し・生きているものだけ）

> **2026-07-15（続き134）の棚卸しで在庫はほぼ枯渇→続き201/208 の採用待ち在庫77件も✅続き214で全消化**。現在の Sonnet 在庫＝タスク1（§7 実機検証＝(xi)/(xxxvi) の要実機検証ほか）と、Opus の新語彙着地待ちのタスク6。タスク8 の次ラウンド（clean群への展開）は任意・低優先。

| # | タスク | 種別 | 規模 | 残っている内容 |
|---|---|---|---|---|
| ~~9~~ | ~~PARTIAL 刻印 151件のトリアージ~~ | — | — | **✅完了（続き138）＝152件全件を3分類・実害144件を Opusタスク12 (xxii)(xxiii)(xxiv) へ登録**。詳細は [PLAN_DETAIL.md](./PLAN_DETAIL.md)・成果物 `docs/_partial_triage.txt` |
| 1 | **§7 実機検証の横展開** | 検証（driver シナリオ追加のみ） | S×件数 | 既定order 75件まで消化済（(a)(b)(c)＋oppDrawOwnEffectOnly＋続き173/174）。**残＝§7 の未消化項目**＝(xi) skip検証・(xxxvi) グロウ支払いUI・ON_LRIG_GROW④・WX22-001-E3（§6.4）＋🆕(xlvii) 防御側ルリグアタック収集（続き218j＝ガード応答とスタック解決順が噛み合うかの要実機確認）。経緯は PLAN_DETAIL §3 |
| 3 | driver バッチ実行の状態汚染 | scripts（engine/JSON 非依存） | M | ⏳主要因は解消済み（続き77/105/139/140/142）。**残**＝(b)`oppDraw` 単独FAIL（CPU挙動依存）(c)`lrigGrowAnyOppP03046` FRESH=1 FAIL（CPUがグロウ判断に至らない）。現在シナリオ 81定義／75既定実行 |
| 4 | ~~BEHAVIOR_AUDIT キュー再生成＋一次トリアージ~~ **⛔枯渇（休眠）** | 計器実行＋分析 | S | 続き133 で高シグナル22件精査＝真no-opバグ0件。残る母数は監査ツールの構造的盲点（COUNTER_SPELL/SPELL_CUTIN・トリガー文脈依存）に該当＝再開なら盲点フィルタ実装が先（低収量見込み） |
| 6 | §5c 再収穫サイクル（`/census-batch` 準拠） | JSON採用 | S | **✅続き214で在庫77件を全消化＝64枚採用**。次の在庫が発生するまで待機（Opus 新語彙着地待ち）。⚠P1宣言により新規バッチは切らない |
| 8 | semantic audit のスケールアップ＋単点修正 | パイプライン＋JSON単点 | M | **✅stub群母集団2,401枚は全数監査完了**（findings→Opusタスク12 (xxvii)(xxviii)(xxix)）。残＝clean群3,574枚への展開（任意・低優先）。累積除外リスト `scripts/archive/scratchpad/semantic_audit_stub_round3/audited_stub_cards_cumulative.txt` |

（消化済み在庫＝未採用在庫 第2弾40枚〔続き208〕・未採用在庫37効果〔続き201〕・補欠(a)(b) はいずれも✅続き214/172/170 で全消化。詳細 BUGFIXES 各続き）

**依存の要点（交互サイクルの回し方）**＝待ち関係は3本：**Opus1〜6 → Sonnet6**（新語彙が着地してから再収穫）／**Sonnet1・4・8・9 → Opus12**（Sonnet が観測して積む → Opus が修正する）／**Opus12 → Sonnet1**（修正が着地すると §7 の意図的FAIL回帰シナリオを PASS へ反転させる検証作業が生まれる）。それ以外の組はすべて独立＝どの順で取っても衝突しない（バトン式・同時作業はしない）。

**現在の Sonnet 在庫＝タスク1（§7 実機検証）が主力**。タスク6は Opus の新語彙着地待ち・タスク8 clean群は任意。作業中に parser/engine のバグを見つけたら Opusタスク12 へ登録し交互サイクルへ戻す。

---

## 4. 現在地とバトン（直近セッション）
> ① `git pull` → ② 本節を読む → ③ 作業 → ④ 本節と `BUGFIXES.md` を更新 → ⑤ commit & push を回す。詳細な修正履歴は `BUGFIXES.md`（新しい順）に積む。ここは**現在地・計画・残作業数だけ**。

### 📍 進捗サマリ（最新1件のみ・過去は別ファイル）
> **運用ルール（2026-07-07〜）**：この節には**直近の作業1件の要約だけ**を残す（入れ替え式）。新しく作業したら ①いま置いてある要約を [PLAN_PROGRESS.md](./PLAN_PROGRESS.md) の「過去セッション要約」**先頭**へ移す（新しいものが上）→②この節を今回の作業の要約へ丸ごと書き換える。過去の全セッション要約（旧・要約①②を含む）は [PLAN_PROGRESS.md](./PLAN_PROGRESS.md) に集約済み。

- **🆕 セッション（2026-07-25 続き260・Opus 5）＝§3 タスク6 E「リコレクト2」を消化し🏁**タスク6を完全クローズ**（golden 733→734・census 1554→1552・前セッション要約は [PLAN_PROGRESS.md](./PLAN_PROGRESS.md) 先頭へ退避）
  - **スコープ**＝タスク6 の最後の残 E:リコレクト2（WX26-CP1-005-E1／WX26-CP1-009-E1）。これで **B1（続き256/257）・D（258）・C（259）・E（260）が全消化＝タスク6 残0**。
  - **真因は機構ではなく計器**＝`recollectArts` は parser（`chooseRecoM`）→ engine（`execChoose` が excludeSource 付きルリグトラッシュのアーツ枚数で `choose_count`/`upTo` を上書き）まで**既に完全実装済**。ところが**逆翻訳が「《リコレクトアイコン》［N枚以上］代わりにKつまで選ぶ」を丸ごと落としており原文照合できず** census 高シグナルに残り続けていた＝decompiler に `betChoose` と同型の1行を追加して解消。
  - **⚠横断的な教訓**＝**「census 高シグナル＝未実装」ではない**。今回のタスク6 だけで D の WX10-033/WX11-029・C の WX08-042/WX21-044・E の2枚が**実装済みなのに語彙/描画未登録で高シグナル化した偽陽性**だった。**消化前に必ず engine 配線と逆翻訳を確認する**。
  - **全文照合で見つけた実バグ4効果**＝「それは能力を失い、**それのパワーを－Nする**」複文で**パワー修正が丸ごと脱落**（parser が能力消去を返した時点で後続句を捨てていた）。`SEQUENCE[REMOVE_ABILITIES, POWER_MODIFY{targetsLastProcessed}]` へ是正し、engine 側は `REMOVE_ABILITIES` の**選択対象を `lastProcessedCards` に記録**（対話/非対話の両経路）＝後段の「それ」が同じ対象に載る。WX26-CP1-009 の－30000／WX25-CP1-084／WX25-CP1-093（`UNTIL_OPP_TURN_END`）／SPDi43-09。
  - **検証**＝全ゲート緑（golden 734/0・smoke 10725件0・fuzz 200ゲーム0・census 1552＝BASELINE_HIGH更新・**同型★0**・lint 221w/0e）。held 4枚は fresh vs live を effectId 単位で精密 diff（**兄弟効果 byte 一致**）の上で adopt。
  - **次の一手**＝**Opus：§3 タスク6 は残0**。次は §6.3 正面の残サブ機構（BLOCK＝WXK11-029-E1／side attack＝MULTI_ZONE_ATTACK／正面 condition 型）か、タスク12 の新規在庫 **(liii)「それのレベル1につき」比例 count（15効果の族）**・**(lii) 修飾語なし「シグニ1体を対象とし」の `owner:'self'` 誤既定**。**⚠持ち越し**＝`collectContinuousAbilitiesRemovedSigni`（effectEngine.ts:4638）の opponent+count:1 分岐が **same-zi** で facing を解決＝engine 他所の `2-zi` mirrored front と規約が食い違う（WX05-019-E1 待ち）。**Sonnet：タスク1（§7 実機検証）継続**。

### 📊 恒久指標（維持中・逐次更新）
- **P1 表現①の systematic 指標**：同型★0（`node scripts/groupSimilar.mjs --all`）。**parserWorklist は held 188 / LOSS 154 / VALUE 34（2026-07-19 実測・`npx tsx scripts/parserWorklist.ts`・⚠HEAD比較＝未コミットJSONは反映されない）**。続き29時点（held 79）からの増加は主に**その後の parser 改善で fresh が curated より正しくなった採用待ちバックログ側**（Sonnetタスク6の採用サイクルで消化してから実数を締め直す）。**この数字からさらに増えたら回帰**（JSON手パッチ時は パーサー同修正 or MANUAL化 or ここを実数更新）。旧内訳の詳細は PLAN_DETAIL 参照。
- **脱落疑い 255枚を全分類済み**（偽陽性179／機構待ち72／修正済・`node scripts/_dropTriage.mjs`）。
- **timing flatten**（当初159枚の実バグ）は R5-R58 で完了＝VALUE 0（詳細 §7下部）。
- **🆕 語彙センサス（過剰効果＋幻覚＝両方向の計器）**：`npm run census`（`scripts/vocabCensus.ts`）。**現ベースライン＝高シグナル欠落 1552【効果単位】**（🏁 P1完了宣言〔2026-07-23〕の凍結基線1581から、§6.3個別機構の消化で逓減中）。**宣言後の直近推移**＝1581→1580〔WX20-028-E2 誤形撤去〕→1578〔BANISH_REDIRECT 正面限定〕→1577〔BANISH_REDIRECT 単体×パワー0〕→1571〔正面 frontOfSelf target filter 5効果＝WXK11-029-E2/WXDi-P04-049-E1/WXK04-072-E2/WX12-038-E1/WD17-009-E1。⚠WXK04-072 は PRESERVE カードで built JSON 直パッチ必須〕→1567〔正面 CONT パワー修正 frontOfSelf 4効果＝WX24-P1-050-E1/WX24-P2-057-E1/E2/WXDi-P10-044-E1〕→1563〔§3タスク6「代わりに」B1残 per-target 値すり替え4効果＝WXDi-P11-067/WX14-070/WDK17-014/WX25-P2-101〕→1562〔WXK06-071 多段閾値ネスト CONDITIONAL＝OPP_CARDS_MOVED_TO_DECK_THIS_TURN〕→1557〔§3タスク6 D バニッシュ置換ルール5効果＝WX13-031/WX16-001/WXK04-068 の BATTLE_BANISH_PREVENT_LOSE_ABILITY・WX14-026 の substituteCost.lifeCrash・WX10-033 の thisCardOnly・WX25-P1-056 の EFFECT_LEAVE_REPLACE_BANISH〕→1554〔§3タスク6 C コスト代替4効果＝WX24-P1-060/WX25-P3-076 の COST_TRASHED_MATCHES・WXEX2-48 の ACTIVATED_DISCARD_COUNT_GTE 配線・WX07-027 の cost.costSubstitute〕→1552〔§3タスク6 E＝decompiler に recollectArts 描画を追加（機構は実装済・計器バグ）＋「能力を失い＋パワー修正」複文の脱落是正4効果〕。宣言後は worklist ではなく回帰ゲート＝**この数字から増えたら回帰（exit 1）／減ったら `BASELINE_HIGH` とここを実数更新**（新規 parser バッチは切らない）。前提＝`docs/_effect_srctext.json` が最新。3分類〔§6.3送り282／粗網のみ116／長テール1183〕は [P1_COMPLETION_ROADMAP.md](./P1_COMPLETION_ROADMAP.md) 冒頭。明細 `docs/_vocab_census.txt`、**宣言前のバッチ逓減履歴（1919→1581）と旧計測は [PLAN_DETAIL.md](./PLAN_DETAIL.md) §4 の退避節**／BUGFIXES 続き109以降。
- **母数**：効果カード 5975／効果 10719／MANUAL効果 891／STUB含むカード 1862・STUBノード 2432（2026-07-19 実測更新。STUBS.md サマリーと整合）。
- **A3クローズ＋B機構全完了（B1-B4）**。残るP1機構＝C（engine実機配線・P2）のみ。同型★0（5986枚）。
- **decompile再生成は `npm run regen`**（全シート＋下流一括・UTF-8直書き＝シェル非依存。2026-07-07にリダイレクト方式を廃止。旧「⚠Bash の `>`」問題は解消済みだが、万一 UTF-16 が混入すると下流3スクリプトがガードで即 exit 1 する）。

### 📌 次の一手（推奨順）
> **cold start＝まず `npm install` → `npm run gates`（全ゲート一括・数秒）が緑になることを確認する。** 現状＝golden 734・smoke/fuzz 全0（SKIP も 0）・同型★0・census 1552（＝`BASELINE_HIGH`・回帰ゲート）。
>
> **🏁 P1（表現）は 2026-07-23 に完了宣言済み**（宣言・3分類・以後の運用＝[P1_COMPLETION_ROADMAP.md](./P1_COMPLETION_ROADMAP.md) 冒頭／§2 DoD／§5）。**主軸は P2/P3**＝①**§6.3 機構台帳**（宣言で正式送りした282効果の消化先＝正面40・チーム35・ゲームから除外残・アンコール19・動的比較14・ソウル11・ドライブ9 等を機構単位で）②**§7 実機検証** ③**BEHAVIOR_AUDIT（§5a・フェーズ跨ぎで継続）**。
>
> 1. **自分のモデル側のタスク表（§3）から取る**。**Opus の主戦場＝§6.3 の機構実装（上記の機構単位・実IDは `docs/_p1_classification.txt`）＋タスク12 の生き残り在庫（(xliv)・(xxxix)・(xxii)残50件・(xlii)の残）＋タスク16 残**（(i)〜(xl) の大半は消化済み＝1行✅サマリ参照。(vii)(viii)(xxix)(xliii) は完全クローズ）。**Sonnet の主力は タスク1（§7 実機検証＝(xi) skip検証・(xxxvi) グロウ支払いUI・傀儡 resume・エナ復帰・5a エナ焼き filter・selectionConstraint UI・opponentSelects UI・比例カウントほか）**＝タスク8 clean群（3,574枚）は任意。タスク4（キュー）は枯渇したので取らない（理由は §3 Sonnet 表）。
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

> このセクションは機構台帳＝**現存の残作業は下記「残作業（A〜F）＋正面サブ機構の残」に集約**。消化済み機構の実装詳細（フラグ・ファイル・commit）は BUGFIXES 各日付が一次記録（各機構が日付/commit を明記済み）。

**残作業（2026-07-24 整理・現存の全項目）**
- **A. 動的コンテキスト追跡系**＝WX11-027（GRANT_PROTECTION 相手LB効果判定）・WXDi-D07-007（防御成功ごとのトリガー収集）・WX24-P4-006（動的ダメージ源フィルタ）。
- **B. BANISH_REDIRECT 残**＝✅完全クローズ（2026-07-24＝正面限定3件＋WX25-P3-104-E1 単体×パワー0 動的ゲート・268）。
- **C. IS_MY_TURN 誤変換の未消化サブ系統**＝census 残53（公開系 REVEAL 前段／エナ置き／デッキ加え／単一カード公開判定）。
- **D. レゾナ出現条件付与 Group1**＝WX14-049/WXEX1-58（出現条件を支払ってルリグデッキからレゾナを出すフロー自体が engine 未実装）。
- **E. 個別カード機構待ち**＝WX20-028-E2（多重アクセ state・§6.4級）／permanent 付与残（WX24-P2-044 派生）／WX17-044（トラッシュ起動+表向きトラップ発動・§6.4）／WX15-016（進行中アタックのキャンセル機構）／WXDi-P05-006 choice①（ピースカットイン割込み基盤）／WXDi-P08-037（place-swap log-only）／WX25-P3-023-E2（遅延トリガー＝2ターン持続＋相手手札移動 collector）／WXEX1-08（コインベット誘発＝ベット trigger 機構無し・ライズ placed filter）／WDK14-013（ビート＝プレイヤー選択ピッカーのみ自動近似）／WXDi-P06-031・WX20-Re20（コスト増加＝起動能力/自アーツ選択数依存）。
- **F. 保留**（core改変が過大リスク）＝WXDi-P00-026（さんばかルリグ付与・ルリグ再アタック未実装がブロッカー）／47枚の【使用条件】【チーム】（正規デッキ常時成立で機能等価＝保留妥当）。

**「正面」サブ機構の残**（機構台帳・commit 5ca1a96d/269931a0）＝target 解決型5効果＋CONT パワー修正4効果は✅消化済（`frontOfSelf`）。**残**＝(b) 正面の【出】ブロック WXK11-029-E1／(c) 側面・正面以外アタック WX15-093〜096・WXEX2-71-E3・WXK04-072-E1b（MULTI_ZONE_ATTACK）／(d) 正面を条件にする型 WX10-036・WXDi-P13-082・WXK02-084（FRONT_SIGNI condition 変種）／(e) 引用付与・強制正面アタック WXDi-P08-060・WXDi-P06-042／WX05-019-E1（能力喪失 CONT＝`collectContinuousAbilitiesRemovedSigni` の same-zi vs 2-zi 規約食い違いの精査待ち）。

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
