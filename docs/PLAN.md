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
| ~~**1**~~ | ~~引用付与の内側 ability parse~~ | parser語彙＋engine機構 | M | **✅クローズ（続き224）**＝本丸 続き164・「アタックできない」家族 続き205・(d)`WX25-P3-085` 単文型 grant mis-parse は続き224（E1 は fresh 側で既に是正済＝再収穫のみ／同カード BURST の DOWN 対象 SIGNI→LRIG を parseSentencePart1 の DOWN 規則へ bare-LRIG 検出追加＝続き223 凍結の DOWN 版・11効果消化・census 1866→1865）。残の (b) 内側「代わりに」置換（WX25-P3-038）は§3タスク6と合流・(c) `GRANT_LRIG_ABILITY` ON_PLAY 誤デフォルトは続き218i（タスク5）で消化済。詳細 BUGFIXES 続き164・205・224 |
| 2 | census「動的比較」の残 | parser語彙＋engine解決器 | S（縮小） | 残＝WXK08-005（キー）のみ＝①「自ルリグレベル＜相手ルリグのかぎり《アタックフェイズアイコン》を得る」が JSON に効果ごと不在（**キーの使用タイミング動的付与＝新機構**）②E2 `GRANT_LRIG_ABILITY{abilities:[]}` が空（E3-E5 は機能近似）。他は**✅続き203で消化**（詳細 BUGFIXES 続き203） |
| 3 | DRAW 脱落の parseSingleSentence 直呼び経路 | parser修正 | S〜M | WX20-071（3項以上の連用中止形）・split ガードで止まる複合（WXK07-042/WX20-049/WX26-CP1-066）・先頭自ドロー未捕捉（WXDi-P13-001）・対戦相手ドロー idiom・per-count ドロー・入れ子条件内。(a)(b)(c) 主部分は✅続き107 |
| 4 | §5c 条件節の残 | parser語彙 | S | 「代わりに」WX25-P2-068/070・「あり」複合条件 WXDi-P11-048（WX25-P3-116 はタスク6送り） |
| 5 | 小口持ち越し（約10件・隙間埋めに最適） | 単点（parser/engine/decompiler混在） | S×件数 | ~~WXDi-P03-005（PAID_ADDITIONAL_COST の置換モード）~~ **✅続き218k（Opus）で消化**＝curated MANUAL が「自分のシグニをデッキに戻す」有害幻覚だったのを REVEAL_AND_PICK+エクシード置換（Pattern④ replace）へ是正。副産物で parser の REVEAL_AND_PICK pick文が `noGuard` filter を弾いていた過剰保守を解消（＋pickNoun 保持）＝P05-021 も AUTO 化可能に。golden 516→517。詳細 BUGFIXES 続き218k。**残＝置換系統40枚の一般化は §6.3級**（分離 pick 単独解決＋置換 else 機構）・WX26-CP1-100（SEND_TO_ENERGY のトラッシュ対象化）・~~GRANT_LRIG_ABILITY 系5枚の parser ON_PLAY 誤デフォルト~~ **✅続き218i（Opus）で消化**＝**実体は ON_PLAY 誤デフォルトではなく内側能力の `triggerScope` 脱落**（外側 ON_PLAY は【出】＝アシストルリグ登場時で妥当）。相手アタック検出 regex が「シグニ」単独しか見ず複合主語「シグニかルリグ」等を取りこぼし、scope 未設定＝engine 既定 `self` → `collectFieldTriggers` の付与AUTO収集（any_opp/any 必須）で弾かれ**完全な no-op（防御能力が丸ごと死亡）**だった。regex 拡張で3効果是正（`WXDi-D06-010`／`WX24-P2-046`／`WXDi-P09-036`）。**残＝`WX15-002-E2`（「対戦相手のセンタールリグ」単独）は engine に「相手ルリグのアタックで自分の付与能力を発火させる」経路が無く据置**（`ON_ATTACK_LRIG` は自分側の付与しか見ない＝拾うと相手シグニのアタックで誤発火する過剰効果を新設するため。→タスク12へ）。「かルリグ」半分の脱落は `markSilentFallback`＋PARTIAL 刻印で計器化。詳細 BUGFIXES 続き218i・~~原文無関係 `TRANSFER_TO_DECK` 混入~~ **✅続き218e（Opus）で消化**＝「（トラッシュから…対象とし、）それをデッキの一番上に置く」がトラッシュ回収→山札トップ（`TRASH_CARD`/top）ではなく場のシグニ移動へ幻覚化していた系統。part1 の緩い field-SIGNI 規則にトラッシュ回収 guard＋position:top、part2 のトラッシュ→トップ規則を「N枚まで」＋level/color/story フィルタへ拡張。8効果是正（census 1891→1888・詳細 BUGFIXES 続き218e）。**残**＝(1)条件/連文分割で「それ」の先行詞が失われた節（`WXDi-P05-009-E1` 等・field-SIGNI のまま＝先行詞解決が要る）(2)`WXEX1-65-E1` の front-of-self owner ニュアンス(3)`WXDi-P11-003`＝無関係な held 差分混在で採用見送り・SEQUENCE 下流「そうした場合」IS_MY_TURN 連鎖・PR-Di038 duration・WX25-P2-095・WXEX2-50-E3 step2 レベル制約・WX12-008 exceed-cost timing・WXK10-033-E1 据置確認・~~WXEX2-25-E3 の decompiler levelLtSelf~~ **✅続き189（Opus）で消化**＝GRANT_EFFECT 付与先が LRIG のとき inner の `levelLtSelf/levelGtSelf` を「このシグニより」→「このルリグより」に読み替え（engine は host 基準で解決済＝表示のみの是正・同型★0維持）。**⚠この表の他項目「代わりに」WX25-P2-068/070・動的比較3枚（タスク2）は実は engine 置換機構＝タスク6級でSではない（要再ラベル）**。**🆕続き203で追加**＝(a)`parseSentencePart1` の catch-all「デッキに戻す」（includes 判定）は依然広すぎ＝「〜デッキに戻す」文脈を SIGNI 移動へ丸める疑い（続き203はルリグデッキのみガード・全数再点検が要る）(b)WXK06-016「カードを１枚引き、このカードをルリグデッキに戻す」の then 分解（現 fresh は DRAW ごと UNKNOWN＝採用見送り中）(c)WX20-053「手札**か**デッキから…探して場に出す」の二重ソース SEARCH（現 bare ADD_TO_FIELD 退化のまま据置） |
| 6 | 「代わりに」残テールの機構系 | engine新機構（置換） | L | D:置換ルール9（バニッシュされない系）・C:コスト代替6・E:リコレクト2・B1残10の条件語彙（§6.3）＋WX16-021 |
| ~~7~~ | ~~§6.1 未実装action型の engine 実装~~ | engine実装 | — | **✅クローズ（続き202/204/204b）＝残型0**（PLAY_FREE_FROM_TRASH／PREVENT_DAMAGE／COST_SUBSTITUTE。詳細 PLAN_DETAIL §3／BUGFIXES 続き202・204） |
| 8 | §6.3 大型機構 | engine機構＋parser | L（項目ごと独立） | ゲーム除外・canCardGuard 統一・多段閾値 nested CONDITIONAL・スペル被破棄【自】収集パス・ON_LEAVE_FIELD 相手scope 3枚・出現条件レゾナ35・正面32の parser 未配線調査 |
| 9 | §6.2 semantic audit 系統残の機構対応 | engine＋decompiler | M | 系統②残（SEQUENCE内 GRANT_PROTECTION＝WX08-017・LAYER付与＝WX15-031・広域24件の subjectFilter/新機構）。系統①は✅続き106で完了 |
| 11 | BEHAVIOR_AUDIT 高シグナル22 の最終仕分け | 仕分け＋engine修正 | S（縮小） | **✅続き133で22件全件精査＝新規の真no-opバグ0件**（詳細 PLAN_DETAIL §3／BUGFIXES 続き133）。残＝WXK01-021-E1 の空文字付与の要確認（低優先）。監査ツールの SPELL_CUTIN/トリガー文脈盲点は §6.4 追記候補 |
| 12 | **Sonnet が積んだ engine/parser バグの修正（常設受け口）** | 可変 | 可変 | **下の在庫リスト参照** |
| 13 | §5b 混線テール（実測823カード・16テーマ分類済み） | JSON再parse（1カードずつ） | L（低優先） | effect 構造そのものが原文とズレたカードの再parse。逓減テール＝他が尽きたら |
| 14 | リファクタ Stage2（useState 11本）→Stage3 純粋バトルコントローラ | BattleScreen構造 | L | 独立・他と並行可 |
| 15 | （大型・任意）§8 CPU AI のメインフェイズ拡張 | 新規設計 | L（特大） | ⏳DESIGN §4「CPU は対人戦と同じ処理」の統一が先 |
| ~~17~~ | ~~timing 判定が本文後半/引用内のトリガー語を先に拾う~~ | parser | — | **✅続き136で修正＝判定を効果ブロック先頭のトリガー句（trigText）に限定・23効果是正**（詳細 BUGFIXES 続き136） |
| 16 | timing 語彙センサス（`npm run census:timing`）の消化 | parser語彙 | S（ロングテール） | [A]完全wired／[B]軽量engine拡張／[C]新規機構 の3階層を続き75-76・172・175-180・207-208・213 で系統消化済み（経緯の全文は PLAN_DETAIL §3・BUGFIXES 各続き。振り分け台帳 `docs/_timing_census_triage.txt`）。**残43効果/40クラスタ**＝「シグニの下からトラッシュ」3・「アタックを効果によって無効にしたとき」2・以降ロングテール |

**Opusタスク12＝未消化の在庫**（Sonnet が観測して積んだ engine/parser バグ。詳細本文と完了行の原文は [PLAN_DETAIL.md](./PLAN_DETAIL.md) §3〔2026-07-19退避節含む〕）：

| ID | 内容 |
|---|---|
| ~~(i)~~ | ~~SP27-002-E3 引用付与の内側条件の無言消費~~ **✅続き193＝二段「かぎり」を AND 平坦化して構造化・旧STUB三重バグ削除**（詳細 BUGFIXES 続き193） |
| ~~(ii)~~ | ~~WXDi-P10-035 の owner エンコード精査~~ **✅続き194＝owner にバグ無しと確定・curated 退化版を fresh へ差し替え**（詳細 BUGFIXES 続き194） |
| ~~(iii)~~ | ~~WXK09-050 GRANT_CHOSEN_ABILITY の held 残存~~ **✅続き195＝parser 主経路から固有ハンドラへ委譲し held ドリフト解消**（詳細 BUGFIXES 続き195） |
| ~~(iv)~~ | ~~applyDirectAction の手札カウンタ3種未更新~~ **✅続き135で修正（手札保護も移植）** |
| ~~(v)~~ | ~~applyDirectAction default 節の暴走再実行~~ **✅続き181＝真の再入は STORY_CHANGE のみ・case 新設で解消、他は benign と機械確認**（詳細 BUGFIXES 続き181） |
| ~~(vi)~~ | ~~POWER_MODIFY_PER_DECK_COUNT が CONTINUOUS 未実装~~ **✅続き135で実装** |
| ~~(vi-4)~~／~~(vi-5)~~ | ~~6コレクタの LRIG ゾーン走査漏れ・usageLimit 書き戻し~~ **✅続き181／続き135で消化＝派生の ON_BANISH any_ally 脱落16効果も根治**（詳細 BUGFIXES 続き181・135） |
| ~~(vii)~~ | ~~「アップ状態のこのシグニをダウンしてもよい」系の対象/自己混同7件~~ **✅完了（続き163/164で6枚・続き220で残1枚 WX25-P2-112）**＝WX25-P2-112 は続き220で消化＝`execDown(LRIG)` がダウンしたルリグを `lastProcessedCards` に記録＋`colorMatchesLastProcessed` 動的フィルタ新設（owner非依存・参照不能で空ヒット＝did-it ゲート）で「共通する色を持つ相手エナをトラッシュ」を実装。DOWN は SIGNI→LRIG 是正＋optional 二択。golden 520・census 1868。詳細 BUGFIXES 続き220 |
| ~~(viii)~~ | ~~checkAllEffects 精査の複合バグ~~ **✅完全クローズ**＝WX25-CP1-062／WX17-028／WX16-070／WX16-038／WDK16-13・WXK08-033／WX26-CP1-048 は続き137〜197で消化。**残の WXDi-P10-034（次メインフェイズ遅延+分岐）は続き221で実装完了**＝(a)裏向き配置＝新ゾーン `facedown_signi`（inert・表向き前はパワー/能力/アタック無し）(b)ターン跨ぎ遅延＝`pending_facedown_flip`（ターン境界クリア対象外の永続フィールド。delayed_triggers は THIS_TURN 限定で相手ターンを跨げないため専用化）＋collectTurnTriggers の ON_MAIN_PHASE_START に RESOLVE_FACEDOWN_FLIP 注入 (c)表向き選択分岐＝CHOOSE で「表向き（場に居るかぎり+5000＝`field_power_mods`）／手札」。裏向き→表向きは開花と同じく「場に出た」扱いにせず ON_PLAY を除外（`detectFacedownFlipped`）。golden 5件追加・全ゲート緑・census 1868→1867（詳細 BUGFIXES 続き221） |
| ~~(x)~~ | ~~collectFieldTriggers の usageLimit 欠落（《ターン1回》過剰発火32枚）~~ **✅続き135＝5コレクタ統一＋書き戻し12箇所・実機PASS** |
| ~~(xi)~~ | ~~CONDITIONAL{条件, then:STUB OPTIONAL_COST}包み46効果のコスト踏み倒し＋ゲート無視~~ **✅続き206で engine 解消**。**要実機検証＝skip 選択時に本体が発動しないこと**（→§7） |
| ~~(xii)~~ | ~~WXEX1-19-E2 自己再帰STUBの無限ループ~~ **✅続き202＝一括受け取り型へ変更で根治・smoke SKIP 1→0**（詳細 BUGFIXES 続き202） |
| ~~(xiii)~~ | ~~WX24-P2-018-E1 の timing 誤登録~~ **✅続き136で ON_ATTACK_PHASE_START へ是正。残る付与先バグはタスク1** |
| ~~(xix)~~ | ~~WX04-005-E3 場出し数制限が未実装~~ **✅続き137＝誤診断・`fieldLimit.ts` に実装済みと確認＋golden 3件**（詳細 BUGFIXES 続き137） |
| ~~(xx)~~ | ~~ON_TARGETED の forced 単一対象 follow-up 未発火~~ **✅続き137＝autoTargetedCards surface で修正・実機PASS** |
| ~~🆕~~ | ~~choice.condition と CONDITIONAL ラップの表現不整合~~ **✅続き156＝liftChoiceOptionCondition 新設・20枚採用** |
| 🆕(xxii) | **後置条件節の IS_MY_TURN 誤変換（当初127件）＝続き143〜212 の12バッチで系統消化**（LAST_PROCESSED 系条件の一般化・`STATE_CONDITION_CLAUSES` 拡充・negate／distinct／ALL_MATCH 等。経緯の全文は PLAN_DETAIL §3・BUGFIXES 各続き）。**残50件＝いずれも構造的ブロッカー待ち**（入れ子26＋前段/属性判定の見送り分。parser が条件を吐いても engine が解決できなければ過小実行に化けるため無理に採用しない）。明細 `docs/_partial_triage.txt`・`docs/_partial_report.txt` |
| ~~🆕(xxiii)~~ | ~~リコレクト分割8件の内容欠落~~ **✅続き173/174で8枚全件消化**（詳細 BUGFIXES 続き173/174）。派生＝WX24-P4-016 の MB 表向きトリガー収集機構は §6.3 送り（未登録） |
| ~~🆕(xxiv)~~ | ~~トリガー発生源フィルタ脱落8件~~ **✅続き162/163/206で全消化**（`discardCostSourceStory`／`powerDecreaseSourceStory`／`last_effect_mill_source`。詳細 BUGFIXES 各続き） |
| ~~(xxv)~~ | ~~driver バッチの累積疲労 flakiness~~ **✅続き140＝DB側累積が真因・injectScenario で既定値張り直し**（詳細 BUGFIXES 続き140） |
| ~~(xxvi)~~ | ~~フルバッチ中の Playwright ブラウザクラッシュ~~ **✅続き142＝RECYCLE_EVERY 予防リサイクル＋クラッシュ時再確立で耐障害化**（詳細 BUGFIXES 続き142） |
| ~~(xxi)~~ | ~~collectOppDrawTriggers が発生源を区別せず PR-423 誤発火~~ **✅続き162＝`drawByDrawerOwnEffect` 新設で修正・E2E 反転は続き170で確認済み**（詳細 BUGFIXES 続き162） |
| ~~🆕(xxx)~~ | ~~WXEX2-76-E1 ON_PLAY の scope/対象幻覚~~ **✅続き188＝同型3枚を根治**（詳細 BUGFIXES 続き188） |
| ~~🆕(xxxi)~~ | ~~レベル比例ドロー/エナチャージの潰れ~~ **✅続き184/187/190＝`DRAW_PER_LRIG_LEVEL`／`ENERGY_CHARGE_PER_LRIG_LEVEL`／`DRAW{perLastProcessedLevel}` 新設でクローズ**（詳細 BUGFIXES 各続き） |
| 🆕(xxxix) | **逆翻訳全文照合で検出した「条件以外の原文不一致」計24効果（続き210/211/212・Codex。各件の不一致内容は BUGFIXES 続き210-212 に明記）**。**続き213（Opus）で全23件を実測＝同型クラスタが無く Codex バッチ化しない判断**（唯一まとまる「このアタックを無効にし」系3枚は攻撃無効化 action 型が engine に無い §6.3級）。**✅続き219（Opus）で先頭条件脱落の過剰効果5枚を消化**＝(1)トリガー句 strip に「各ターン終了時、」を追加（WXK04-027-E2 のエナ2色ゲート復活）(2)相対手札比較 `HAND_DIFF{lt/gt,0}` を `Condition` 型・`execUtils.evalCondition`・parser・decompiler へ配線（WX20-005／WX24-P1-045／WX24-P2-022／WXK10-045 の無条件ドロー/バニッシュ/ハンデスをゲート）。census 1880→1878・golden 517維持。詳細 BUGFIXES 続き219。**✅続き219b（Opus）で CHOOSE 前状態条件の汎用持ち上げを追加＝10枚消化**（「場に《X》/＜C＞/レゾナ がある場合、以下の…から選ぶ」の CHOOSE 無条件発火をゲート化。`matchLeadingStateCondition`＋CHOOSE ヘッダ直後限定。census 1878→1874・golden 518）。詳細 BUGFIXES 続き219b。**残＝「このアタックを無効にし」系3枚（§6.3）＋WXK10-045「差以下のレベル」動的フィルタ＋WXK09-003 赤分岐（ライフクロス→エナ＝新ゾーン遷移§6.3）＋WXDi-P06-039 の対象照応＋WX25-P2-085/SPDi43-30 の選択肢ドリフト＋Magic Box 3件（§6.3級）** |
| ~~🆕(xxxii)~~ | ~~ON_TRASH／ON_BLOOD_CRYSTAL_ARMOR の any_ally scope 脱落~~ **✅続き182/191で消化**（詳細 BUGFIXES 続き182・191）。残2枚＝WXK07-074（チャーム付帯）・WXK11-018（watcher 相対レベル）＝§6.3級で据置 |
| ~~🆕(xxxiii)~~ | ~~any_opp watcher の usageLimit 未評価~~ **✅続き183＝`limitOkWatcher` 追加＋リムーブ経路の両 state 永続化**（詳細 BUGFIXES 続き183） |
| ~~🆕(xxxiv)~~ | ~~`fromFieldByCostOrEffect` の parser 未 emit~~ **✅続き183＝15枚全件消化**（詳細 BUGFIXES 続き183） |
| ~~🆕(xxxv)~~ | ~~ON_TRASH「〜によって」限定の近傍表記が未ゲート~~ **✅続き186で (a)(b)(d) 消化**（詳細 BUGFIXES 続き186）。**(c) 3枚（WX18-062/WX22-027/WXK03-033）＝「シグニの下から」トラッシュの collector が engine に無く §6.3 送り** |
| ~~🆕(未確認)~~ | ~~collectLrigGrowTriggers の usageLimit 書き戻し疑義~~ **✅続き206＝全15コレクタの全数監査で新規の穴なしを確認**（監査スクリプト `scripts/archive/auditUsageLimitWriteback.mjs`・再実行可） |
| ~~🆕(xxvii)~~ | ~~semantic audit 第2弾（seed202607）の実害37枚~~ **✅続き165〜169・207 の Cluster 別消化でクローズ**（F フィルタ50枚／A 条件節／C owner／D timing／`ON_HAND_ADDED` 新設ほか。経緯の全文は PLAN_DETAIL §3・BUGFIXES 各続き。トリアージ `docs/_semantic_audit_scaleup2_triage.txt`） |
| 🆕(xxix) | **semantic audit stub群 round3（2,101枚・findings 2,799件・続き146）**＝①duration系統 **✅続き148で34効果是正**・②選択肢欠落 **✅続き149で84効果是正**・**③「そうした場合」IS_MY_TURN の did-it ゲート欠落 ✅続き218h＝engine で系統解消（155効果152カード）**（詳細 BUGFIXES 各続き）。③は当初「盲点2件」として登録されていたが実測すると**単カードではなく engine の構造欠落**で、`BANISH`/`BOUNCE`/`DOWN`(相手)/`FREEZE`/`TRANSFER_TO_DECK`/`TRANSFER_TO_HAND`/`SEND_TO_ENERGY`/`LIFE_CRASH` の全型が空振り時も発火していた（`TRASH`/`DOWN`(自分)のみ既存ゲート有り）。**残**＝~~(a)`WX06-014-E2` は JSON が原文と別物~~ **✅続き222（Opus）で消化**＝step1 を「自分トラッシュから《古代兵器》5枚をデッキ下」（TRANSFER_TO_DECK・TRASH_CARD/story:古代兵器/count5/bottom）へ是正し MANUAL 化。既存の did-it ゲートで「そうした場合」を表現（古代兵器不足なら banish 不発）。exceed コストは既存・「それ」は相手シグニ1体で盤面不変ゆえ末尾再選択が照応と同値＝専用機構不要と判明。census 1867→1866・golden 526。詳細 BUGFIXES 続き222。**✅(b) 222クラスタ・トリアージ済み（続き223）**＝§5 の未検証7クラスタを直接JSON照合。**機構不要の当たり＝「対戦相手のルリグ1体…凍結」の種別取り違え18効果を parser 一般化で消化**（FREEZE 対象 SIGNI→LRIG・engine は LRIG凍結対応済み・golden 527）。残＝(b1)照応先ロスト系統（「対戦相手のシグニ1体」power-down owner ＋「あなたのトラッシュから」hand-add zone＝`owner:self`+`targetsTriggerSource`/`source:DECK_CARD` に化ける同一 parser 系統。既存 did-it ゲート＋opponent choose 再利用の機構不要だが parser/engine 両面の系統修正＝規模中。一部は engine owner補正STUBで偽陽性）／(b2)§6.3級＝ルリグかシグニ union・置換系【出】能力ロック・BET・unless。詳細と表 `docs/_semantic_audit_stub_round3_triage.txt` §6・BUGFIXES 続き223 |
| ~~🆕(xxxvii)~~ | ~~アタック不可付与の据置4効果~~ **✅続き205で4件とも個別に原文照合し全採用（すべて fresh が正）** |
| ~~🆕(xxxviii)~~ | ~~付与対象に閾値フィルタが乗らない過剰効果~~ **✅続き205＝対象節スコープで抽出＋兄弟規則（付与系4規則）へ横展開・色フィルタも追加** |
| ~~🆕(xxxvi)~~ | ~~エナ代替トラッシュ情報がグロウ経路に未接続~~ **✅続き206＝人間のグロウ経路5箇所へ配線（CPU 可否は据置）**。**要実機検証＝グロウ支払いUIでの実選択**（→§7） |
| ~~🆕(xxviii)~~ | ~~「それをエナゾーンに置く」が TRASH 等へ潰れる系統~~ **✅続き147＝7効果を SEND_TO_ENERGY へ是正（実体は parser の REVEAL 文脈規則の誤適用・Sonnet 推定の executor intercept は誤り）**（詳細 BUGFIXES 続き147・元記録の全文は PLAN_DETAIL §3）。残＝WX24-P4-048-E2（「対象とし」2回＋動的パワー制約＝要専用処理）＋WX26-CP1-086/WXK05-027/WXK05-070 のコスト STUB 精緻化 |
| ~~🆕(xl)~~ | ~~【絆常/絆自/絆起/絆出】が効果ブロック境界として認識されず絆能力が飲み込まれる（134カード137能力）~~ **✅続き215＝parser marker 3箇所＋engine 絆未獲得ゲート新設・112枚一括採用**（詳細 BUGFIXES 続き215） |
| ~~🆕(xli)~~ | ~~絆分離の残ギャップ11件~~ **✅完了（続き215→217→218）**＝7件は計器ノイズ・`BANISH_REDIRECT` 本体は続き217・(b) 種類数条件と (c) は続き218・**(a) 場出し欠落は続き218c**（単カードではなく**15効果の系統**＝場出しのみ pick に parser 規則が無く `LOOK_AND_REORDER` へ縮退し場出しが丸ごと消える no-op だった。`LOOK_PICK_CHAIN[field]` 規則を新設）。詳細 BUGFIXES 続き217／218／218b／218c |
| ~~🆕(xliii)~~ | ~~census の系統的偽陽性＝`BANISH_REDIRECT` 族~~ **✅完了（続き218d・Opus）**＝「ゾーン:エナゾーンに置く」カテゴリに `extraOk` を追加し、`BANISH_REDIRECT` を持ち **redirect イディオム句（`エナゾーンに置かれる代わりに…トラッシュに置く`）を除いた残りに「エナゾーンに置」が残らない**ときだけ合格（lrigDown と同じ安全弁）。族の**全22効果**で残存0を機械確認（隠れた SEND_TO_ENERGY 欠落なし）。subject 側フィルタ脱落（(xliv) §6.3）は各専用カテゴリが引き続き露出＝マスクで隠れない。census 1895→1891。詳細 BUGFIXES 続き218d |
| 🆕(xliv) | **`BANISH_REDIRECT` の残テール（続き217→218b で第1弾消化）**。族36効果を全数棚卸し。**✅消化＝(1)「パワーが０以下の」限定脱落2件**（`WXDi-P10-009-E3`／`WXDi-CP02-102-E2`＝相手の**全**バニッシュが常時トラッシュ送りだった過剰発火。`whenPowerZero` 新設）**(2) owner 誤り5件**（正面3・「それが」照応1・「このシグニによって」1＝いずれも `self` に落ちて原文と逆の意味だった）。詳細 BUGFIXES 続き218b。**残＝⛔§6.3 級**（engine が `banish_redirect` を**真偽フラグ**で持ち `action.target` を見ない設計のため、以下はすべて「どのバニッシュに適用されるか」の target 側スコープ機構が要る）：**(a) 属性フィルタ5件**（レベル／凍結／感染／チャーム＝**ゾーン添字の状態が `removeFromField` 後に消えている**ため `banishDestination` へ除去前 state＋cardMap を渡すシグネチャ変更＝呼び出し16箇所）**(b) 単体対象4件**（対象選択フロー自体が無い）**(c) 正面限定3件**（同スコープ機構）。近似すると偽陰性になるため据置。 |
| 🆕(xlvi) | **parser は `REVEAL_AND_PICK`（手札に加える）を正しく出すのに curated が古い `LOOK_AND_REORDER` のまま held ドリフトし「その中から…手札に加え」＝カードアドバンテージが死んでいた系統**。**✅続き218g＝忠実性を1件ずつ検証し9効果を外科的採用**（build:effects harvest は型スワップを held に上げず temp curated 温存＝heldReview 不可視の死角。census 1886→1880。詳細 BUGFIXES 続き218g）。**残＝真ドリフト36件中の未採用27件**＝大半が `parseStatus:MANUAL` で fresh が filter/条件を落とす**過剰簡約**（`WXK10-022-E3` 無色ではない・`WXK01-004-E1` レベル奇数・`WX02-018-E1` 条件付き2ドロー等）＝忠実表現する parser 拡張が要る §6.3級。cur:AUTO の複雑残（`WXDi-P16-008-E2` 多目的等）は忠実性要確認 |
| ~~🆕(xlv)~~ | ~~「[あなたの/対戦相手の]アタックフェイズの間」限定の CONTINUOUS 常在効果が activeCondition 脱落で PERMANENT 化（相手ターン中も過剰適用）~~ **✅続き218f＝`DURING_ATTACK_PHASE` を新設（型／parser／engine：checkActiveCondition＋calcFieldPowers に turnPhase 貫通・13呼び出し元へ bs.turn_phase／decompiler）。13効果12カード是正・census 1888→1886**（続き215/217 の残ギャップ `WX25-CP1-082-E3` を起点に系統化。詳細 BUGFIXES 続き218f）。**残＝keyword/banish_redirect 経路の phase enforcement は permissive（turnPhase 未配線＝従来同値・退化なし）＝将来 threshold/keyword collect へ turnPhase を通せば自動で効く** |
| ~~🆕(xlvii)~~ | ~~「対戦相手のルリグがアタックしたとき」に防御側の付与AUTO を発火させる収集経路が engine に無い~~ **✅完了（続き218j・Opus）**＝`triggerCollect` に **`collectLrigAttackDefenderTriggers` を新設**（ON_ATTACK_SIGNI 側 2429 と同型・any_opp/any だけ拾い未設定 self は攻撃側収集の担当＝二重発火なし・usageLimit/`lrig_abilities_disabled` ゲート込み）＋BattleScreen へ配線（防御側は playerId も `actions_done` 書き戻し先も別）＋parser の timing 判定（複合主語＝2要素 timing／ルリグ単独＝ON_ATTACK_LRIG。**総称フォールバックより前に判定**）＋decompiler の `このルリグ`→scope 主語置換。**4効果が完全化**（`WX15-002-E2` は ON_ATTACK_SIGNI→ON_ATTACK_LRIG 是正、他3件はルリグ半分を回収し 218i の silent fallback が解消＝PARTIAL→AUTO）。golden 514→516。詳細 BUGFIXES 続き218j |
| 🆕(xlii) | **フォールバックSTUB `GRANT_LEAVE_PLACE_PENDING` 残2枚（続き216・Opus）**＝主因（parser のトリガー句除去漏れ＋ON_LEAVE_FIELD の duringAttackPhase 未評価）は消化し **WXEX2-51-E1 を実装・7枚の scope/DRAW/条件も是正**（詳細 BUGFIXES 続き216）。残＝(a)**WX21-004-E2**＝エナから「そのシグニと**同じ**レベル」配置＝`levelEqTrigger` 語彙が要るが該当1枚のため「過剰語彙を作らない」方針で据置（STUB維持・no-op・退化なし）。(b)**WX22-001-E3**＝【起】でこのアタックフェイズ限定の遅延 ON_LEAVE_FIELD watcher を設置＝`INSTALL_DELAYED_TRIGGER` の ON_LEAVE_FIELD 拡張（フェイズ限定 lifetime＋手札から低レベル配置）が要る §6.3級。どちらも小口だが単発機構待ち。 |

#### Sonnet のタスク（2026-07-15 棚卸し・生きているものだけ）

> **2026-07-15（続き134）の棚卸しで在庫はほぼ枯渇→続き201/208 の採用待ち在庫77件も✅続き214で全消化**。現在の Sonnet 在庫＝タスク1（§7 実機検証＝(xi)/(xxxvi) の要実機検証ほか）と、Opus の新語彙着地待ちのタスク6。タスク8 の次ラウンド（clean群への展開）は任意・低優先。

| # | タスク | 種別 | 規模 | 残っている内容 |
|---|---|---|---|---|
| ~~9~~ | ~~PARTIAL 刻印 151件のトリアージ~~ **✅完了（続き138）** | 計器読み＋分類 | M | **152件全件を3分類完了＝実害144件を Opusタスク12 (xxii)(xxiii)(xxiv) へ登録**（詳細 PLAN_DETAIL §3・成果物 `docs/_partial_triage.txt`） |
| 1 | **§7 実機検証の横展開** | 検証（driver シナリオ追加のみ） | S×件数 | **✅(a)(b)(c)＋`oppDrawOwnEffectOnly`＋続き173/174 復活分2件は消化済み＝既定order 75件**（経緯の全文は PLAN_DETAIL §3）。残＝§7 の未消化項目（(xi) skip検証・(xxxvi) グロウ支払いUI・ON_LRIG_GROW④ ゲット・グロウ経路）＋WX22-001-E3（§6.4）＋**🆕(xlvii) 防御側ルリグアタック収集（続き218j）**＝相手ルリグのアタック時に `WXDi-D06-010`「そのアタックを無効にする」が実際に発火するか、**ガード応答（`pending_lrig_attack`→`lrig_attacked`）とスタック解決順が噛み合うか**（防御側エントリを攻撃側と同一スタックに積む形にしたため、解決順とガード要求のタイミングが要実機確認。golden はコレクタ単体までしか担保していない） |
| 3 | driver バッチ実行の状態汚染 | scripts（engine/JSON 非依存） | M | ⏳主要因は解消済み（続き77・105・139＝`handPrepend` 由来の単体 flakiness 修正／続き140＝DB側累積／続き142＝ブラウザ再確立。経緯の全文は PLAN_DETAIL §3）。**残**＝(b)`oppDraw` 単独FAIL（CPU挙動依存・未解明）(c)`lrigGrowAnyOppP03046` FRESH=1 FAIL（CPUがグロウ判断に至らない）。現在シナリオ 81定義／75既定実行 |
| 4 | ~~BEHAVIOR_AUDIT キュー再生成＋一次トリアージ~~ **⛔枯渇（常設のまま休眠）** | 計器実行＋分析 | S | **続き133 で高シグナル22件を全件精査＝新規の真no-opバグ0件**。残る母数251件（273−22）は**監査ツールの構造的盲点**（COUNTER_SPELL/SPELL_CUTIN・トリガー文脈依存効果）に大半が該当＝そのまま掘っても同じ結論になる。再開するなら**まず盲点フィルタを機械的に実装して除外してから**（＝新規のスクリプト作業。低収量の見込み） |
| 6 | §5c 再収穫サイクル（`/census-batch` 準拠） | JSON採用 | S | **✅続き214で在庫77件を全消化＝64枚採用**（詳細 BUGFIXES 続き214）。次の在庫が発生するまで待機（Opus1〜6の新語彙着地待ち） |
| 8 | semantic audit のスケールアップ＋単点修正 | パイプライン＋JSON単点 | M | **✅stub群母集団2,401枚は続き144〜146で全数監査完了**（findings 2,799件→Opusタスク12 (xxvii)(xxviii)(xxix)。経緯の全文は PLAN_DETAIL §3）。残＝clean群3,574枚への展開（任意・低優先）。累積除外リスト `scripts/archive/scratchpad/semantic_audit_stub_round3/audited_stub_cards_cumulative.txt` |

~~Sonnetタスク6・未採用在庫 第2弾40枚（続き208）~~ **✅続き214で全40枚採用**（詳細 BUGFIXES 続き214）。

~~Sonnetタスク6・未採用在庫37効果（続き201）~~ **✅続き214で消化完了＝24枚採用・11枚は既にMANUAL側で是正済み**。副産物の `WX25-CP1-012-E2` 構造疑義→(xl) 登録→✅続き215で消化。

~~補欠(a) timing census 振り分け台帳／(b) `textNoJson` 56枚の実体確認~~ **✅続き172／続き170で完了**（56枚は全件正当・真の欠落0。詳細 BUGFIXES 続き172・170）。

**依存の要点（交互サイクルの回し方・2026-07-15 更新）**＝待ち関係は3本：**Opus1〜6 → Sonnet6**（新語彙が着地してから再収穫）／**Sonnet1・4・8・9 → Opus12**（Sonnet が観測して積む → Opus が修正する）／**Opus12 → Sonnet1**（修正が着地すると §7 の意図的FAIL回帰シナリオを PASS へ反転させる検証作業が生まれる＝Sonnet の主力在庫が復活する）。それ以外の組はすべて独立＝どの順で取っても衝突しない（バトン式なので同時作業はしない・§11 の「着手中」宣言は大型機構のみ必須）。

**現在の Sonnet 在庫＝タスク1（§7 実機検証）が主力**。タスク6は Opus の新語彙着地待ち・タスク8 clean群は任意。作業中に parser/engine のバグを見つけたら Opusタスク12 へ登録し交互サイクルへ戻す。

---

## 4. 現在地とバトン（直近セッション）
> ① `git pull` → ② 本節を読む → ③ 作業 → ④ 本節と `BUGFIXES.md` を更新 → ⑤ commit & push を回す。詳細な修正履歴は `BUGFIXES.md`（新しい順）に積む。ここは**現在地・計画・残作業数だけ**。

### 📍 進捗サマリ（最新1件のみ・過去は別ファイル）
> **運用ルール（2026-07-07〜）**：この節には**直近の作業1件の要約だけ**を残す（入れ替え式）。新しく作業したら ①いま置いてある要約を [PLAN_PROGRESS.md](./PLAN_PROGRESS.md) の「過去セッション要約」**先頭**へ移す（新しいものが上）→②この節を今回の作業の要約へ丸ごと書き換える。過去の全セッション要約（旧・要約①②を含む）は [PLAN_PROGRESS.md](./PLAN_PROGRESS.md) に集約済み。

- **🆕 セッション（2026-07-20・続き224・Opus・**§3 タスク1(d) 完了＝WX25-P3-085 の単文型 grant mis-parse（再収穫）＋同カード BURST「対戦相手のルリグ1体…ダウン」の DOWN 対象取り違えを parser 一般化で消化＝続き223 凍結の DOWN 版・11効果**。census 1866→**1865**・golden 527維持）**（続き223 は [PLAN_PROGRESS.md](./PLAN_PROGRESS.md) 先頭へ退避）
  - **タスク1 をクローズ**＝本丸 続き164・「アタックできない」家族 続き205・(d) は今回・(c) は続き218i（タスク5）・(b) はタスク6合流と確認。
  - **E1（単文型 grant mis-parse）は fresh 側で既に是正済＝再収穫のみ**。curated が「外側トリガー＋GRANT 構造を丸ごと落とし内側能力（ライフクラッシュ→ドロー）をトップに漏らして `ON_OPP_LIFE_CRASHED/DRAW` に潰れていた」held ドリフト。fresh は正しく `GRANT_EFFECT{ON_DISCARDED_AS_COST, discardCostSourceStory:微菌, effect: crash→draw once_per_turn}` を出す（続き164 grant 語彙＋続き163 discardCostSourceStory の着地済）。
  - **BURST の DOWN 対象取り違え**＝原文「対戦相手のルリグ1体を対象とし、それをダウンする」の DOWN 対象が **SIGNI** に化けていた（owner:opponent は正・type が LRIG→SIGNI）。engine の `execDown` は既に LRIG 分岐（続き220）を持つため **parser 1規則の一般化だけ**で直る。`parseSentencePart1.ts` の DOWN 規則に凍結と同型の bare-LRIG 検出（`(センタールリグ ∨ /ルリグ[１1]体を対象/) ∧ ¬センタールリグではない`）を追加。
  - **消化**＝DOWN 対象が SIGNI→LRIG に変わる全カードを機械抽出→原文照合し**11効果**を消化。9効果 heldReview 採用＋WX24-P1-069/WX24-P3-077 は E1「このシグニをダウンしてもよい」の `optional:true` が fresh 側で落ちる据置系ドリフト（タスク12(vii)系）を避け **BURST のみ手動 LRIG 化**（E1 温存を機械確認）。退化ゼロ・全件原文一致。全ゲート緑（**census 1866→1865**〔E1 grant 再収穫で欠落1件解消／DOWN 種別変更は計器対象外〕・**golden 527維持**・smoke 10722全OK・fuzz 全0・lint 0 errors）。詳細 BUGFIXES 続き224。
  - **次の一手（Opus）**＝**タスク12(xxix)(b)残＝照応先ロスト系統**（「対戦相手のシグニ1体」power-down owner ＋「あなたのトラッシュから」hand-add zone＝「…を対象とし、[任意コスト]。そうした場合、それを[動詞]」で照応先が消え `owner:self`+`targetsTriggerSource`／`source:DECK_CARD` に化ける同一 parser 系統。既存 did-it ゲート＋opponent choose 再利用の機構不要だが `OPTIONAL_COST`/`TRADE_BANISH_SELF_SIGNI` インターセプタへの owner補正＋tts strip 拡張＝parser/engine 両面・規模中。**着手前に engine owner補正STUB該当の偽陽性を機械抽出**）。他＝タスク5 残小口／timing[C] 残43（タスク16）／タスク12(xxii) 残50・**タスク12(vii)系の据置＝「このシグニをダウンしてもよい」E1 の optional 脱落（続き224 で観測・要 parser 是正）**。**Sonnet はタスク1（§7 実機検証）**。
### 📊 恒久指標（維持中・逐次更新）
- **P1 表現①の systematic 指標**：同型★0（`node scripts/groupSimilar.mjs --all`）。**parserWorklist は held 188 / LOSS 154 / VALUE 34（2026-07-19 実測・`npx tsx scripts/parserWorklist.ts`・⚠HEAD比較＝未コミットJSONは反映されない）**。続き29時点（held 79）からの増加は主に**その後の parser 改善で fresh が curated より正しくなった採用待ちバックログ側**（Sonnetタスク6の採用サイクルで消化してから実数を締め直す）。**この数字からさらに増えたら回帰**（JSON手パッチ時は パーサー同修正 or MANUAL化 or ここを実数更新）。旧内訳の詳細は PLAN_DETAIL 参照。
- **脱落疑い 255枚を全分類済み**（偽陽性179／機構待ち72／修正済・`node scripts/_dropTriage.mjs`）。
- **timing flatten**（当初159枚の実バグ）は R5-R58 で完了＝VALUE 0（詳細 §7下部）。
- **🆕 語彙センサス（過剰効果＋幻覚＝両方向の計器）**：`npm run census`（`scripts/vocabCensus.ts`）。**現ベースライン＝高シグナル欠落 1865【効果単位】**（2026-07-20 続き224＝Opus・タスク1(d) 完了＝WX25-P3-085 の単文型 grant mis-parse を再収穫（E1 の GRANT_EFFECT 復元で欠落1件解消）＋同カード BURST の DOWN 対象 SIGNI→LRIG を parser 一般化で是正（DOWN 種別変更は「欠落」計器の対象外）で1866→1865（golden 527維持）。旧・続き223＝Opus・タスク12(xxix)(b) 222クラスタ・トリアージ＝「対戦相手のルリグ1体…凍結」の FREEZE 対象 SIGNI→LRIG 種別取り違え18効果を parser 一般化で消化＝凍結は「欠落」計器の対象外のため1866維持（golden 526→527）。旧・続き222＝Opus・タスク12(xxix) 残(a) クローズ＝WX06-014-E2 の step1 を「自分トラッシュから古代兵器5枚をデッキ下」へ是正し MANUAL 化・did-it ゲートで「そうした場合」を表現し1867→1866。旧・続き221＝Opus・タスク12(viii) 完全クローズ＝WXDi-P10-034 の裏向き設置→ターン跨ぎ遅延→表向き分岐を実装し1868→1867。旧・続き220＝Opus・タスク12(vii) WX25-P2-112 のダウン→共通色エナトラッシュ実装で1869→1868。旧・続き219b＝Opus・タスク12(xxxix) CHOOSE ヘッダ前の状態条件の汎用持ち上げで10枚是正し1878→1874。旧・続き219＝Opus・タスク12(xxxix) 先頭条件脱落5枚＝「各ターン終了時」strip 漏れ＋相対手札比較 `HAND_DIFF` の CONDITIONAL 未配線を是正し1880→1878。旧・続き218g＝Opus・parser は `REVEAL_AND_PICK` を出すのに curated が古い `LOOK_AND_REORDER` のまま「手札に加える」が死んでいた held ドリフト9効果を採用し1886→1880。旧・続き218f＝Opus・「アタックフェイズの間」限定の CONTINUOUS 常在効果の PERMANENT 潰れを `DURING_ATTACK_PHASE` 新設で是正し1888→1886。旧・続き218e＝Opus・「それをデッキの一番上に置く」のトラッシュ回収幻覚を是正し1891→1888。旧・続き218d＝`BANISH_REDIRECT` 族の census 偽陽性を extraOk 較正で解消し1895→1891。旧・続き218＝①「N種類以上」条件の語彙化で1919→1916／②`lrigDown` コスト限定で1916→1899）。**この数字から増えたら回帰（exit 1）／減ったら `BASELINE_HIGH` とここを実数更新**。前提＝`docs/_effect_srctext.json` が最新であること。明細 `docs/_vocab_census.txt`、過去の計測履歴は [PLAN_DETAIL.md](./PLAN_DETAIL.md) §4／BUGFIXES 続き109以降。
- **母数**：効果カード 5975／効果 10719／MANUAL効果 891／STUB含むカード 1862・STUBノード 2432（2026-07-19 実測更新。STUBS.md サマリーと整合）。
- **A3クローズ＋B機構全完了（B1-B4）**。残るP1機構＝C（engine実機配線・P2）のみ。同型★0（5986枚）。
- **decompile再生成は `npm run regen`**（全シート＋下流一括・UTF-8直書き＝シェル非依存。2026-07-07にリダイレクト方式を廃止。旧「⚠Bash の `>`」問題は解消済みだが、万一 UTF-16 が混入すると下流3スクリプトがガードで即 exit 1 する）。

### 📌 次の一手（推奨順）
> **cold start＝まず `npm install` → `npm run gates`（全ゲート一括・数秒）が緑になることを確認する。** 現状＝golden 527・smoke/fuzz 全0（SKIP も 0）・同型★0・census 1866。
>
> **戦略＝続き108 策定の「全カード完成戦略①〜⑤」を最優先で適用する。①（census 効果単位化）は✅続き109で完了＝現在は戦略②「純P1の系統バッチ消化」。** 残作業マップは [P1_COMPLETION_ROADMAP.md](./P1_COMPLETION_ROADMAP.md)（🆕2026-07-16 効果単位で再計測＝純P1 2022効果 92%／混在 88 4%／純§6.3 96 4%）。
>
> 1. **自分のモデル側のタスク表（§3）から取る**。**🆕2026-07-19 整理時点**＝**Opus の主戦場は タスク12 の生き残り在庫（(xliv)・(xxxix)・(xxii)残50件・(xlii)の残）＋タスク16 残43効果**（(i)〜(xl) の大半は消化済み＝1行✅サマリ参照。(vii)(viii)(xxix)(xliii) は完全クローズ）。**Sonnet の主力は タスク1（§7 実機検証＝(xi) skip検証・(xxxvi) グロウ支払いUIほか）**＝タスク6は Opus の新語彙着地待ち・タスク8 clean群（3,574枚）は任意。タスク4（キュー）は枯渇したので取らない（理由は §3 Sonnet 表）。
> 2. **手順はスキルに従う**＝`/census-batch`（§5c 文型バッチ1巡）・`/audit-card <CardNum>`（BEHAVIOR_AUDIT 1カード監査1巡）・`/baton`（セッション終了時の簿記）。散文の記憶で回さない。
> 3. **engine/parser/decompiler を触ったら `npm run gates`・シート再生成は `npm run regen`**（§12）。バグは golden に1件足してから直す。

> **新規 timing 配線の確立パターン**：①該当カードの effect/原文を確認 ②`triggerCollect.ts` に pure collector 追加（`mkLimitOk`/`ownFieldSources`/`effsOf` 流用）③検出が要れば `boardDiff.ts` に detector 追加 ④BattleScreen 中央 diff ブロック（`resolveStackNext` 内・mill/freeze 等と同じ場所）に発火配線＋薄いラッパ ⑤`goldenTest.ts` に発火条件テスト ⑥`decompileEffects.ts` の `engineUnwiredTimings` から除去 ⑦`npm run regen`（全シート＋下流一括再生成）＋同型★0 確認 ⑧`npm run gates` 全緑 → commit/push。

---

## 5. フェーズ1残作業：表現（P1）

> **🆕 P1完了に向けた残作業マップ＝[P1_COMPLETION_ROADMAP.md](./P1_COMPLETION_ROADMAP.md)（2026-07-16に効果単位で再計測）**。census高シグナル2206効果を機械分類＝**純P1（parserで直せる）2022効果(92%)／混在88効果(4%)／純§6.3（機構待ちのみ・即P2/P3送り可）96効果(4%)**。「機構待ちを§6.3送りにすれば宣言が近い」は誤りで、96%はparser表現作業を含む（粗い網カテゴリのみに掛かる効果は114件まで縮小＝効果単位化で旧マスキング死角は解消済み）。着手順・機構待ち効果実IDリストは同ドキュメント＋`docs/_p1_classification.txt`。**最短ルート＝系統カテゴリ（条件節611・クラス389・色133・閾値184）を `STATE_CONDITION_CLAUSES`／続き143の3規則バッチで一括消化**（続き106/107/143手法の横展開）。

### 5a. BEHAVIOR_AUDIT によるバグ収穫（現在の主作業・2026-07-03〜）

**目標＝要レビュー・キュー（`node scripts/_bqTriage.mjs`）を逓減限界まで消化。** 全効果を実行し盤面差分＋ログを原文と目視照合＝逆翻訳の文字列一致では検出できない「真no-op」「未配線timing」「未実装action型」「トリガー主語ミス」を発見して直す。手法・キュー件数の推移は [BEHAVIOR_AUDIT.md](./BEHAVIOR_AUDIT.md) を参照（811→285→261→169→129→高シグナル30）。

- [ ] **キュー消化を継続**：`node scripts/_bqTriage.mjs` で高シグナル選別 → `npm run audit -- --id <CardNum>` で目視 → 「真no-op／シナリオ空振り／STUB未実装」に仕分け → バグは effects JSON 直パッチ＋engine/decompilerセット＋smoke/golden/fuzz で修正。
- [x] **未実装action型 worklist**（§6.1）＝**✅残型0（続き204/204b でクローズ）**。
- [ ] **意味照合監査（semantic audit）の worklist**（§6）＝BEHAVIOR_AUDIT の盤面差分では拾えないSTUB/MANUALの意味エラー（owner取り違え・GRANT_PROTECTION no-op 等）の補完的発見器。
- [ ] **完了判定**：高シグナル件数がこれ以上減らない逓減限界に達した時点で「P1完了＋P2の一部前倒し完了」を宣言し、残りは個別カードの機構待ちとして §6/§7 に送る。

### 5c. 語彙センサスの系統別消化（2026-07-04新設・続き17-18で両方向98計測に拡大・続き23で文型バッチ化・過剰効果＋幻覚バグ）

**目標＝`npm run census` の高シグナル欠落（**現ベースライン 1895 効果**・§4 恒久指標）を文型テンプレ単位のバッチで0へ逓減。** 過剰効果（フィルタ・条件・使用制限の脱落で対象/発火が広がる・ゲームを壊す側）と幻覚（原文に無い効果/数値がJSONに居る・逆方向）は behavior-audit の無変化キューに掛からない別種のバグ母集団（発見経緯は §4 続き15、拡充は続き17-18）。

- **残りの消化対象（生きている worklist のみ・消化済みバッチの履歴は [PLAN_DETAIL.md](./PLAN_DETAIL.md) §5c）**＝(1) **「代わりに」残テール**：C:コスト代替6・D:置換ルール9（バニッシュされない系＝置換機構要）・E:リコレクト2・B1残10（コスト参照・ターン中イベント等＝条件語彙が無い §6.3）＋**CHOOSE平坦化復元の採用待ち held 約35枚**。(2) **幻覚/取り違え系の残**＝WX16-021（置換ルール→即時LIFE_CRASH幻覚＝置換機構要・§6.3）・BURST内IS_MY_TURN残7（§6.3登録済み）。(3) **構造平坦化系**＝引用付与の残107（CONTSELF_COND 18／OTHER 約30／内側品質不全27＝トリガー語彙拡充で再収穫可・held 103 が計器）・代わりに183・IS_MY_TURN誤変換の残53・遅延13・「Nまで」120。(4) 除去系の対象フィルタ脱落（クラス339=`story`・色105・パワー閾値83・レベル閾値90・凍結13・ダウン/アップ38・数値不一致153・小さい数390=粗い網）。(5) トリガー種別（約220）・コスト脱落（コイン24+場トラ25+エナトラ12+他）・ゾーン行き先67・機構census（ライズ31/チーム25/アンコール22/エクシード16等）・公開128・次相手ターン99・相手選ぶ31・制限58・キーワード86。(6) 制限/様相（ターン1回28・ゲーム1回3・任意→強制23）・保護/付与系（同一性46・共通色66・能力なし10）。(7) 語彙自体が無い系統＝最上級（6枚・`TargetFilter` に `superlative:{key,dir}` 新設）・**正面32**（`frontOfSelf` はあるが使用3件＝parser 未配線疑い）・動的比較の残35・合計制約27・**出現条件35＝機構1本の欠落（parser が除去+engine強制なし）**は §3「機構実装の型」で新語彙＋engineセット実装。
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
- [~] **系統②：GRANT_PROTECTION `count:'ALL'`＋subjectFilter無し＝48件**。**単体保護24件は `count:'ALL'→1` 是正済（2026-07-03）**。genuineな残ギャップは(a)SEQUENCE内GRANT_PROTECTION（WX08-017）(b)LAYER付与型（WX15-031）。残る**広域24件**（「あなたのシグニは…」）はsubjectFilter/新機構が要る別課題。
- [ ] **パイロット findings の個別修正**（真バグ39件・要追精査3件＋stub群残20枚・clean群50枚の findings）＝`node scripts/semanticAuditTriage.mjs <outDir>` で精査→1カードずつ標準ワークフロー。
- [x] **スケールアップ**＝stub群 **✅続き144〜146で母集団2,401枚を全数監査完了**（findings は Opusタスク12 (xxvii)(xxviii)(xxix) に集約）。残＝clean群3,574枚への展開（任意・低優先＝Sonnetタスク8）。

### 6.3 残・大型機構（個別カード・機構待ち）

- **🆕 `BANISH_REDIRECT` の target 側スコープ機構（2026-07-19・続き218b・タスク12(xliv) 残12効果）**＝バニッシュ先変更は現在 `PlayerState` の**真偽フラグ**（`banish_redirect` ほか）で実装されており **`action.target` の `filter`／`count` を一切見ない**。残テールはいずれも「**どのバニッシュに適用されるか**」のスコープを要求する：**(a) 属性フィルタ5件**＝「レベル１以下」(`WXK10-053-E1`)・「レベル２以下＋パワー０以下」(`WX25-P3-104-E1`)・「凍結状態」(`WXDi-P12-073-E1`)・「感染状態」(`WX21-005-E1`)・「【チャーム】が付いている」(`WX18-038-E2`)。⚠**凍結/チャーム/感染はゾーン添字の状態**で、`banishDestination` が呼ばれる時点では `removeFromField` 済み＝**判定材料が消えている**。`banishDestination(removed, opponent, num)` に**除去前 state と cardMap を渡す**シグネチャ変更（**呼び出し16箇所**）が前提。**(b) 単体対象4件**＝「対戦相手のシグニ１体を対象とし、このターン、それが…」(`WX25-P2-060-E2`／`WXDi-P12-054-E2`／`WXDi-P15-044-E1`／`WXK06-048-E1`)＝現状 `BANISH_REDIRECT` は**対象選択を一切行わない**ため、選択フローと選択結果（カード番号）の保持が要る。**(c) 正面限定3件**＝`WX19-078-E1`／`WXDi-D09-P14-E1`／`WXDi-P10-044-E2`（owner は続き218b で是正済み・ゾーン限定自体は同機構待ち）。**近似すると「JSON が限定を主張して engine が無視する」偽陰性になるため据置**。パワー0限定と bySource は既に別フラグで消化済み（続き217／218b）＝この機構が入ったらそちらも統合できる。

- **ガード喪失条件の engine 配線（2026-07-04・続き20・表現は STUB `GUARD_LOSS_UNLESS_LRIG` で回復済み）**＝WX12-025/034/036「センタールリグが＜X＞でないかぎり、手札にあるこのシグニは【ガード】を失う」。engine のガード可否判定が `Guard === '1'` 直読みで6箇所超に分散（BattleScreen 9610/11280/12627/13639/13659・CPU側）＝共通ヘルパー `canCardGuard(cardNum, ownerState)` へ統一してから配線するのが本筋。
- **IS_MY_TURN誤変換系統の action層残3枚（2026-07-04・続き21・条件注入で無条件発火は停止済み）**＝WXK03-039（原文「デッキの下から4枚トラッシュ」が mis-parse で `TRASH SIGNI opponent` 化＝デッキ下ミル機構が要る・条件 TRASHED_DISTINCT_LEVELS_GTE 4 は注入済だが前段が誤りで発火せず）・WXK08-055（「シグニの下にあるカードを好きな枚数トラッシュ」＝under-signi trash＋多段閾値1/2/3/4以上）・WXK11-070（「エナ全トラッシュ」＋多段閾値5/10以上）。多段閾値は各しきい値ごとの nested CONDITIONAL 化が要る。**IS_MY_TURN誤変換の未消化サブ系統**＝公開系（`この方法で〜公開された場合`＝REVEAL 前段・WX05-013 美巧8種類/WX12-Re10/WX21-023 等）・エナ置き（`エナゾーンに置かれた場合`・WX14-069/WX15-106）・デッキ加え（WX19-040/WXK02-039/WX22-006）・単一カード公開判定（`そのカードがレベルN/＜X＞の場合`＝多数）＝census IS_MY_TURN誤変換の残53。
- **ダメージ置換系の残テール（2026-07-05・続き25）**＝(a)**WXDi-D07-007 の「防御成功ごとにルリグ【自】付与」**＝現状 log-only STUB `LRIG_GRANT_MILL_PER_PREVENTED_DAMAGE`（シールド PND 2/1 は正実装）。「ダメージを防いだ」イベントのトリガー収集パスが要る。(b)**WX24-P4-006**「それより低いレベルを持つ対戦相手のシグニによってダメージを受ける場合」＝動的ダメージ源フィルタ（engine はダメージ源自体を未追跡）。(c)**「あなたがブーストしていた場合」条件**（WX25-P1-002/006/008/010＝ブースト機構。WX25-P1-010 の相手8枚ミル前段も無条件のまま＝owner是正のみ済み）。
- **スペルの被破棄【自】トリガー2枚（2026-07-04・続き20）**＝WX17-045 FLASH（「このカードが手札からトラッシュに置かれたとき、相手シグニ1体ダウン」）・WXDi-P10-070 枝折（「自ターン中に捨てられたとき+2000」）。スペルは場ソースでなくトリガー収集経路が無い＝手札破棄イベントからスペル側【自】を収集する新パスが要る（census 構造:【自】の残高シグナル2はこれ）。
- **続き20の近似・STUB テール**＝WX24-P2-049-E1b（STUB `POWER_PLUS_BANISHED_POWER`＝バニッシュしたシグニのパワー分+の動的値）・WX25-CP1-040-E1b（STUB `VARIABLE_ENERGY_TRASH_LEVEL_BOUNCE`＝可変エナコスト→同レベルバウンス・【絆自】も未対応）・WX14-028-BURST「異なる色を持つ2枚」制約なし＋E1「緑ではない」colorExclude 未付与（色バッチで）・WX20-028-E2「アクセ3枚以上→自アクセ+相手エナ+相手全シグニをトラッシュ」の再エンコード（現状 hasAcce 相手1体トラッシュの誤形）・NEGATE_NTH_ATTACK はシグニアタックのみ（WX10-018 原文はセンタールリグも）・WXK04-015-E1b/WXK01-028 系のキー自壊コスト省略近似・WXDi-P16-092 のチーム条件（LOSE_COLOR_ALL_ZONES に activeCondition 無し＝機構censusバッチで）。

- **引用AUTO付与の精緻化（`GRANT_QUOTED_AUTO_ABILITY`）** ＝**✅一次完了（B4）**＝引用【自】/【常】能力を実発火（自場シグニ・ターン限定・parse成功時のみ）。**残**＝permanent（このゲームの間）付与・相手シグニ付与・STUB能力＝従来 log-only 据置。例: WX25-CP1-074／WXK09-055／WX24-P2-044。
- **「ゲームから除外」の機構待ちテール（2026-07-04・従来 TRASH 近似のまま no-op 据置）**＝(a)遅延自己除外「ターン終了時に、またはこのシグニが場から離れる場合に、このシグニをゲームから除外する」（WX16-040/WX21-Re06/WD22-035-G）＝遅延トリガー機構が要る。(b)ルリグデッキのピース除外（WXDi-D07-004/WXDi-P04-013/**WXDi-P04-016-E3**＝2026-07-06確認・原文「あなたのルリグデッキにあるピース１枚をゲームから除外する」が curated/fresh とも無関係な `TRASH{DECK_CARD/TRASH_CARD, owner:opponent}` に誤エンコード＝要修正だが本機構未実装のため保留）＝execExile の LRIG_DECK 対応が要る。(c)使用後の自己除外「このカード/このスペルをゲームから除外する」（WXK11-070/PR-378/SP36-001/WX17-044）＝source自身の追跡が要る。(d)文脈参照「それをゲームから除外」（WXDi-D08-012/WXDi-D09-P15）＝直前対象の追跡。
- **状態フィルタ脱落の残テール（2026-07-04・続き16・除去系 凍結7＋ダウン/アップ28効果は是正済）**＝census 残（凍結13・ダウン/アップ38）は別パスで未patch＝(a)**コスト節「アップ状態のルリグ/シグニをダウンする：〜」**（WX14-055/WX24-P2-069/WXK10-023/WXK11-056/WXDi-P12-049/P13-053/P14-043-049 等）＝状態はコスト側（`：`後の効果テキストに状態語なし）＝コストの「アップ状態要求」を表す語彙が要る（現状コストは down 効果のみ）。(b)**条件「このシグニがアップ状態の場合」**（WX15-055/056/WXDi-CP01-045/P02-038/P04-036/WX25-P2-048/WX18-052/WXK08-034）＝activeCondition/条件機構。(c)**CONT REMOVE_ABILITIES**（WXEX1-02-E1＝count:1・filter無しで「凍結シグニは【常】【自】を失う」＝全frozen＋能力種別限定）。(d)WXDi-P02-065-E1（count:2 vs 原文「1体」＋「≥2存在」条件欠落）・WXDi-P01-003（アーツ本体欠落）・WX09-016（ダウン状態シグニへの GRANT_PROTECTION）・CHOOSE/入替系（WX24-P2-087/WXDi-P08-037）。
- **GRANT_LRIG_ABILITY の低品質展開4枚（2026-07-04・MANUAL化で no-op 据置）**＝WX15-016（付与【自】の「この方法で置いたカードが《バーストアイコン》を持つ場合アタック無効」＝条件が IS_MY_TURN に誤約・相手ターントリガーで恒久false）／WD21-009（ルリグ下N枚→2/4/5枚の多段閾値＝平坦化すると無条件ガード封じ+トリクラの過剰発火）／PR-204（「カード2枚をルリグトラッシュに置いてもよい。そうした場合アップ」＝支払いゲート脱落で毎アタック無償ルリグアップ＝無限アタック）／PR-238（置いた枚数×5の比例ミル）。共通で「optional支払い→そうした場合」のコストゲート機構＋多段閾値が要る。SPDi43-03/11/12/13・WXK11-052 の「ターン終了時までこのルリグは『【自】…アップ』を得る」も同根（現状は即時 UP LRIG の平坦化近似＝§7の実機検証対象外）。
- **BURST内「そうした場合/〜の場合」の要新語彙テール7枚（2026-07-04・続き19・TRASH前段32偽陽性と易3枚是正後の残）**＝(a)~~LAST_PROCESSED フィルタ条件: WXEX1-43-BURST・WXEX1-36-BURST~~ **✅続き24で是正**（`LAST_PROCESSED_MATCHES{filter}` 新設・heldReview採用）。(b)**then内容欠落**: WD23-023-E-BURST（「デッキから1枚探してライフクロスに加えシャッフル」→SHUFFLE のみ＝SEARCH の then ADD_TO_LIFE 対応要）。(c)**任意化**: WX14-026-BURST（「クラッシュしてもよい」→強制 LIFE_CRASH）＝optional crash＋conditional ゲート。(d)**コストと対象の参照逆転**: WX16-033-BURST（自シグニバニッシュがコストで対象相手シグニをトラッシュ）・WX17-041-BURST（自トラップ回収がコストで対象相手シグニをバウンス）＝対象保持→コスト→適用の再構成（「それ」参照機構）。(e)**源違い**: WX19-Re10-BURST（「手札1枚をライフクロスに加える」→fromTop＝デッキから）＝ADD_TO_LIFE の from hand 対応要。
- ~~**resume 経路の inline collector 欠落（続き58・§7 R43/R46 実機検証で発見）**~~ **✅続き61（Opus）で根本修正**＝`collectBoardDiffTriggers` へ統合し、`resolveStackNext` の `result.done` 分岐でトリガー収集が落ちる系統（R36/R39/R43/R46）を一括解消。原因分析・対照実験の記録は [PLAN_DETAIL.md](./PLAN_DETAIL.md) §6・BUGFIXES 続き58/61。
- **「対戦相手のシグニが場を離れたとき」トリガー（3枚・behavior-audit 段階4で発見・2026-07-03）**＝`ON_LEAVE_FIELD` の watcher 収集（`collectLeaveFieldTriggers`）は**離れたカードと同じ側（味方）の watcher しか見ない**ため、相手の離脱を見る新 `triggerScope` と相手フィールド走査パスが要る。該当＝**WXEX1-30-E2**／**WXK11-017-E1**／**WXDi-P03-040-E1**（3枚とも現JSON `scope=self`＝誤発火）。
- ~~「このターンにあなたがアーツを使用していた場合」条件~~ **✅実装済（2026-07-03・続き13後半）**＝`ARTS_USED_THIS_TURN`＋`turn_arts_used` 機構で11枚全是正。**✅続き116（Sonnet）で実機PASS確認（2回連続）**＝`verifyBattleDrive.mjs artsUsedThisTurnGate`（WX25-P1-095）＝`turn_arts_used:true`注入→アタック時に条件評価→エナチャージ1が正しく発火（hEnergy 0→1）を確認。既定orderに追加。~~WX25-P1-106 BURST のダメージ置換近似~~ **✅続き25で REPLACE_NEXT_DAMAGE_WITH_MILL に正エンコード**。
- **自パワー閾値条件の残テール（2026-07-03発見・素直な21枚は是正済）**＝(a)「代わりに」昇格型：WXDi-P01-054（【起】バニッシュの昇格）／WXDi-P12-067（被バニ反応の昇格）。(b)多段閾値型：PR-470A（10000/25000）／WXDi-D01-016（15000/20000）。(c)【起】の自パワー条件：WXDi-P03-062（起動時 evalUseCondition 配線の確認要）。
- **WXDi-P05-006＝2択構造ごと崩壊**＝ピース打ち消し（カットイン使用＋対象ピース効果打ち消し＋除外）機構が無く、①②の択も脱落（現 curated は GRANT_KEYWORD 使用条件＋UNKNOWN の残骸）。ピース打ち消し機構待ち。
- `ON_CARD_MILLED_FROM_DECK` の収集機構（WX25-P2-009-E2＝現 `【※engine未配線】`）。
- リフレッシュ置換の実体（WX25-P2-009-E1＝現 no-op STUB `REPLACE_NEXT_OPP_REFRESH_MILL_LRIG`）。
- 「他＜毒牙＞のシグニ効果で相手パワーが減ったとき」トリガー（WX25-P3-062-E1＝現 STUB `POWER_COPY_FROM_DOWNED`）。
- **ビートの残（低優先）**: トラッシュ→beat（WDK14-013）のプレイヤー選択ピッカーのみ自動近似。
- **G072 残6枚**（条件前置き付きの相手シグニ被バニッシュ反応）: WX05-040/WX11-027（「メインフェイズの間」）／WXEX2-23（「アタックフェイズの間」）／WXK11-055（「あなたの効果によって」）／WX13-051（「＜龍獣＞効果で」）／WXDi-P11-TK05（【チャーム】付き相手シグニ）。前置きモデリングの誤りリスク高く個別対応。
- **multi-dest pick（look→手札＋場の二目的）**: WX24-P1-017／WX24-P1-026／WX25-P3-038／WX25-CP1-025／WX26-CP1-019。付与/条件/絆を伴う同時pickは別語彙が要る。
- **REVEAL_AND_PICK remainder の shuffle 保持（機構待ち）**: PR-370-E2「残りをシャッフルしてデッキの一番下に置く」は `RevealAndPickAction['remainder']` に shuffle 語彙がなく、現状は deck bottom のみ表現。
- **GRANT_TO_PLACED_SIGNI 残（続き42で実装＝4枚）**＝「この方法で場に出たシグニは【K】を得る／のパワーを＋N／レベル１につきミル」は parser で `GRANT_KEYWORD`/`POWER_MODIFY`{targetsLastProcessed}＋`MILL{countIsLastProcessedLevelSum}` へ実装済み（WX25-P1-044/WX25-P2-039/WX24-P3-037/WX24-P3-039）。**残る honest STUB 2枚**＝引用複合能力付与：WX24-P1-017（「【自】バトルバニッシュ時、自アップ＋能力喪失」）・WX25-P3-038（「【自】アタック時、パワー8000以下を手札／能力なしならトラッシュ」）＝内側【自】ability の parse（GRANT_QUOTED_AUTO_ABILITY 系＝現状 log-only STUB）が要る。
- **凍結状態フィルタのアサシン変種**: WX25-P2-084②「【アサシン（凍結状態のパワー3000以下のシグニ）】」＋2択。
- **公開カード→自身のアクセ化**: WDK07-E15（新STUB `INTERNAL_ACCE_PICKED_TO_SELF` が要る）。
- **公開カードと同レベルの動的フィルタ**: WX24-P3-063（公開カードのレベルで相手全シグニ能力消失）。
- **前ターン跨ぎ保持**: WXDi-P11-001（「直前のターン」ライフクラッシュ履歴）。
- **使用制限の誤パース＋択崩壊**: WX20-021（「相手ターンにしか使えない」が壊れCONTINUOUS化＋3択全脱落）／WX24-P3-036（スペル打消し＋《無》任意払い）／WD14-011（E1トリガー thisCardOnly化＋BURST2択崩壊）。
- **コスト増加 残**: WXK11-003「このターン」型／WXDi-P06-031 等の起動能力コスト増加／WX20-Re20 等の自アーツコスト選択数依存。
- **引用/LB付与（ディスペア型）未対応**: WXDi-P02-039-E2／WX25-P3-027-E2（現 no-op or 誤バニッシュ）＝要本実装。
- **WXK10-008①**「相手ターン中エナの色と能力を失う」＝新語彙未対応（②のみ実装）。
- **任意コスト＋特定札捨ての複合 STUB 近似（機構待ち）**: WDK08-Y12／WX24-P2-048-E1 choice①。現状 `OPTIONAL_COST` で近似。本実装には「energy＋特定名カード捨て」「per-level 捨て枚数」の汎用コスト機構が要る。
- **その他既出複合**: WX25-CP1-002（リコレクト択一④owner）／WX25-P3-023-E2（遅延トリガー）／WXEX1-08（コインベット誘発＋ライズフィルタ）／WX16-048・WX16-023（ウィルス数+1の選択数スケール）／WX25-P1-103（look-pickチェーン）／WD22-036-G（self-banish起点の複合2択）／WX25-P1-052-E1（《相手ターン》AUTO＋名指しカード在場）／WXDi-P08-037（place-swap＋覚醒トリガー誤）。
- **保留（core改変が必要・1枚のためにはリスク過大）**: WXDi-P00-026（＜さんばか＞ルリグ付与＝ルリグ再アタック未実装がブロッカー）／**47枚の【使用条件】【チーム】**（正規デッキで常に成立＝機能等価のため保留妥当）。

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
