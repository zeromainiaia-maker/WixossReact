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
| **1** | 引用付与の内側 ability parse（引用付与残107の本丸）**←続き136で最優先に浮上** | parser語彙＋engine機構 | M | **🆕WX24-P2-018-E1（§7 B4）＝timing 是正（続き136）で発火するようになったが、付与先が「対象の＜龍獣＞シグニ」ではなく**ルリグ自身**で、引用内の【自】トリガーと「対戦相手が《無》×3を支払わないかぎり」条件も落ちて即時【アサシン】付与になっている**（実機 `wx24p2018GrantFire` で確認＝意図的FAIL回帰）。対象選択（SELECT_TARGET）と引用内トリガー/条件の再構成が要る。ほかに内側「代わりに」置換（WX25-P3-038＝タスク6と合流）・他の内側トリガー語彙・`GRANT_LRIG_ABILITY` の ON_PLAY 誤デフォルト（タスク5と重複）。第1弾は✅続き75 |
| 2 | census「動的比較」の残 | parser語彙＋engine解決器 | S〜M | WXEX2-28（直前配置シグニ基準）・WXK08-005（条件文）・WXK11-003（opp/own センタールリグ） |
| 3 | DRAW 脱落の parseSingleSentence 直呼び経路 | parser修正 | S〜M | WX20-071（3項以上の連用中止形）・split ガードで止まる複合（WXK07-042/WX20-049/WX26-CP1-066）・先頭自ドロー未捕捉（WXDi-P13-001）・対戦相手ドロー idiom・per-count ドロー・入れ子条件内。(a)(b)(c) 主部分は✅続き107 |
| 4 | §5c 条件節の残 | parser語彙 | S | 「代わりに」WX25-P2-068/070・「あり」複合条件 WXDi-P11-048（WX25-P3-116 はタスク6送り） |
| 5 | 小口持ち越し（約10件・隙間埋めに最適） | 単点（parser/engine/decompiler混在） | S×件数 | WXDi-P03-005（PAID_ADDITIONAL_COST の置換モード）・WX26-CP1-100（SEND_TO_ENERGY のトラッシュ対象化）・GRANT_LRIG_ABILITY 系5枚の parser ON_PLAY 誤デフォルト・原文無関係 `TRANSFER_TO_DECK` 混入5枚・SEQUENCE 下流「そうした場合」IS_MY_TURN 連鎖・PR-Di038 duration・WX25-P2-095・WXEX2-50-E3 step2 レベル制約・WX12-008 exceed-cost timing・WXK10-033-E1 据置確認・WXEX2-25-E3 の decompiler levelLtSelf |
| 6 | 「代わりに」残テールの機構系 | engine新機構（置換） | L | D:置換ルール9（バニッシュされない系）・C:コスト代替6・E:リコレクト2・B1残10の条件語彙（§6.3）＋WX16-021 |
| 7 | §6.1 未実装action型の engine 実装 | engine実装 | M（1型ずつ） | 残3型＝`PLAY_FREE_FROM_TRASH`(2)・`PREVENT_DAMAGE`(5・ダメージ層の置換機構が要る)・`COST_SUBSTITUTE`(2・コスト支払いUI横断) |
| 8 | §6.3 大型機構 | engine機構＋parser | L（項目ごと独立） | ゲーム除外・canCardGuard 統一・多段閾値 nested CONDITIONAL・スペル被破棄【自】収集パス・ON_LEAVE_FIELD 相手scope 3枚・出現条件レゾナ35・正面32の parser 未配線調査 |
| 9 | §6.2 semantic audit 系統残の機構対応 | engine＋decompiler | M | 系統②残（SEQUENCE内 GRANT_PROTECTION＝WX08-017・LAYER付与＝WX15-031・広域24件の subjectFilter/新機構）。系統①は✅続き106で完了 |
| 11 | BEHAVIOR_AUDIT 高シグナル22 の最終仕分け＋engine修正 | 仕分け＋engine修正 | S（縮小） | **続き133でSonnetが22件全件を`npm run audit -- --id`で目視精査＝新規の真no-opバグは0件と判定**（内訳：STUB露出済み・既に§6.1/§6.3で追跡中7件〈WXDi-P09-079/WX24-P2-049/WX25-P2-009/WX25-CP1-040/WX09-012/WXEX2-51/WXDi-P04-065＝最後のみ`freezetrigger`実機PASSで無害確定〉／COUNTER_SPELL＝BattleScreen側cutin経路で実処理・監査ツールの盲点3件／残り約12件はON_ATTACK系・ON_TRASH系等の**トリガー文脈依存効果を監査ツールの直接実行シナリオが構築できない盲点**＝WXK01-021-E1のみ「空の付与文『。』」という軽微なparser残骸の疑い（E2/E4が別途正しく実装済みで機能面の実害なし・低優先）。**残作業＝WXK01-021-E1の空文字付与を要確認する程度**（詳細BUGFIXES続き133）。監査ツールがSPELL_CUTIN/トリガー文脈を構築できない構造的盲点は§6.4「オープンな実装課題」への追記候補。 |
| 12 | **Sonnet が積んだ engine/parser バグの修正（常設受け口）** | 可変 | 可変 | **下の在庫リスト参照** |
| 13 | §5b 混線テール（実測823カード・16テーマ分類済み） | JSON再parse（1カードずつ） | L（低優先） | effect 構造そのものが原文とズレたカードの再parse。逓減テール＝他が尽きたら |
| 14 | リファクタ Stage2（useState 11本）→Stage3 純粋バトルコントローラ | BattleScreen構造 | L | 独立・他と並行可 |
| 15 | （大型・任意）§8 CPU AI のメインフェイズ拡張 | 新規設計 | L（特大） | ⏳DESIGN §4「CPU は対人戦と同じ処理」の統一が先 |
| ~~17~~ | ~~timing 判定が本文後半/引用内のトリガー語を先に拾う系統バグ~~ **✅続き136（Opus）で修正＝判定を「効果ブロック先頭のトリガー句」に限定（`trigText`）。JSON 23効果を ON_ATTACK_PHASE_START へ是正・census 2218→2215・golden 326・同型★0維持。詳細 BUGFIXES 続き136** |
| 16 | timing 語彙センサス（`npm run census:timing`）の消化 | parser語彙 | S（ロングテール） | ✅ engine 配線済みで parser 語彙だけ無いクラスタは続き75/76で出し切った（19系統81枚・376→128）。**残128は engine に受け皿が無い機構待ち＝§6.3 へ**。ロングテール（1〜6件）のみ。運用知見は PLAN_DETAIL §3 |

**Opusタスク12＝未消化の在庫**（Sonnet が観測して積んだ engine/parser バグ。詳細本文は [PLAN_DETAIL.md](./PLAN_DETAIL.md) §3 の (i)〜(xx)）：

> **✅2026-07-15（続き135・Opus）で4件を消化＝(x)・(vi-5)・(vi)・(iv)**（usageLimit ガード欠落5コレクタの一括是正〈実カード60枚超の過剰発火〉／`POWER_MODIFY_PER_DECK_COUNT` の CONTINUOUS 実装／`applyDirectAction` の手札カウンタ3種＋手札保護。golden 319→325・実機 `onPlayUsageLimit` 新設・詳細 BUGFIXES 続き135）。**この消化で Sonnet タスク1（§7横展開）の意図的FAIL回帰シナリオのうち `trashCounterOpp`／ON_LRIG_GROW④／R37③ が PASS へ反転できるはず＝Sonnet の在庫が復活する。**

| ID | 内容 |
|---|---|
| (i) | SP27-002-E3＝引用付与の内側条件が genericKagiri（isTimingMarker）で**無言消費**され PARTIAL にもならず、無条件アサシン付与へ退化 |
| (ii) | WXDi-P10-035＝引用内【自】の「それを手札に戻す」の owner エンコードを lastProcessed 慣例と整合するか要精査 |
| (iii) | WXK09-050＝parser が `GRANT_CHOSEN_ABILITY` を再生成し続け held に残存。Part1固有ハンドラとの dispatch 設計を解消するまで採用不可 |
| ~~(iv)~~ | ~~`applyDirectAction` の TRASH/HAND_CARD 分岐が手札カウンタ3種を更新しない（続き81）~~ **✅続き135（Opus）で修正＝3フィールド更新＋手札保護を即時パスと同形で移植・golden 1件** |
| (v) | `applyDirectAction` 未対応型が `default` 節で元アクションを暴走再実行する系統の残（続き82） |
| ~~(vi)~~ | ~~`POWER_MODIFY_PER_DECK_COUNT`（PR-442・CONTINUOUS）が CONTINUOUS 計算層に未実装（続き84）~~ **✅続き135（Opus）で実装＝`extractPowerModifiesPerDeckCount`＋`calcFieldPowers` 計算ブロック・golden 1件** |
| (vi-4)／~~(vi-5)~~ | 他6コレクタの LRIG ゾーン走査漏れ（該当実カード0＝潜在バグ・**未消化**）／~~二面コレクタ3種の usageLimit 書き戻し~~ **✅続き135（Opus）で(x)と一括修正＝Banish18枚/PowerZero6枚/LrigGrow4枚** |
| (vii) | 「アップ状態のこのシグニをダウンしてもよい」系の対象/自己混同・条件欠落の構造的バグ7件（続き89） |
| (viii) | checkAllEffects 精査で残った複合バグ（続き90）。**✅WX25-CP1-062**（欠落第1能力を MANUAL 復元・heldReview 採用・census 2215→2214）・**✅WX17-028**（TRANSFER_TO_DECK(TRASH) に optional を engine 対応＋JSON付与）・**✅WX16-070**（「＋1か＋2してもよい」を CHOOSE(upTo) 化＋LEVEL_MODIFY thisCardOnly を engine 対応・census 2214→2213）＝続き137（Opus）。残＝WX26-CP1-048（出自条件欠落+owner混同）・WXDi-P10-034（次メインフェイズ遅延+分岐）・WX16-038（アイコン条件）・WDK16-13/WXK08-033（2条件ADD_TO_FIELD＋登録者数条件）。大半 parser混線でMANUAL上書き＋heldReview採用が要る |
| ~~(x)~~ | ~~`collectFieldTriggers` に usageLimit 自体が無く《ターン1回》が過剰発火（続き104・32枚）~~ **✅続き135（Opus）で修正＝5コレクタを `{entries, usedHostIds, usedGuestIds}` 型へ統一＋BattleScreen 12箇所で書き戻し。実機 `onPlayUsageLimit` 2回連続PASS** |
| (xi) | curated の `CONDITIONAL{条件, then:STUB OPTIONAL_COST}` 包み形27枚の扱い（続き110） |
| (xii) | WXEX1-19-E2＝自己再帰STUBと `resumeSelectTarget` の個別適用ループが設計非互換＝実プレイでも無限ループ（続き112） |
| ~~(xiii)~~ | ~~WX24-P2-018-E1＝ルリグの「アタックフェイズ開始時」が `ON_ATTACK_SIGNI`（自己スコープ）で誤登録され一度も発火しない（続き112・§7 B4 のブロッカー）~~ **✅続き136（Opus・タスク17）の timing 系統修正で `ON_ATTACK_PHASE_START` へ是正済み（JSON確認）。残る付与先バグはタスク1（引用付与の内側 parse）** |
| ~~(xix)~~ | ~~WX04-005-E3＝STUB `LIMIT_ALL_FIELD_1`（場出し数制限）が engine 未実装（続き126）~~ **✅続き137（Opus）で誤診断と判明＝実装済み。`src/screens/battle/fieldLimit.ts`（`computeFieldSigniLimit`＝両者上限算出／`reduceFieldSigniToLimit`＝超過分をレベル高順に残しトラッシュ）＋BattleScreen 配線（召喚ブロック `BattleScreen:6024`／グロウ時の対話式トラッシュ `:5116`／CPU自動減量 `:8103`）。続き126 は STUB executor の case だけを見た誤り（継続効果として別モジュールに実装）。golden 3件で挙動固定（compute/reduce）。⚠減量トラッシュの ON_LEAVE/ON_TRASH 未収集は既知の軽微近似（fieldLimit.ts:77）** |
| ~~(xx)~~ | ~~`POWER_MODIFY{targetsTriggerSource:true}` 系＝ON_TARGETED の forced 単一対象 follow-up が未発火（続き127）~~ **✅続き137（Opus）で修正＝`ExecResult` に `autoTargetedCards` を surface し `resolveStackNext` done 分岐で ON_TARGETED を収集。実機 `onTargetedForcedBypass` 2回連続PASS・golden 2件・詳細 BUGFIXES 続き137** |
| 🆕 | `choice.condition`（選択肢の使用可否条件）と fresh の `choice.action` CONDITIONAL ラップの**表現不整合＝設計判断が要る**（続き130・census-batch が採用不能になる原因） |
| 🆕(xxii) | **✅続き143（Opus）で22件消化＝第1バッチ12件〔「そのカードが…の場合」→LAST_PROCESSED_MATCHES 拡張＋盤面状態条件持ち上げ `parseHoistStateCondition`〕＋第2バッチ8件〔結果カウント閾値 Cluster B＝汎用カウント条件 `parseThisWayGenericCount`〕＋第3バッチ2件〔多分岐後続枝 `parseBareBranchCondition`＝WXDi-P13-049の4枝・WX10-031〕。census 2213→2206・golden 338・同型★0維持。残＝多分岐のうち複合条件枝（WDK16-13等・登録者数AND公開）・Cluster B の合計/すべて/種類/枚数系・否定3・LRIG色別多分岐（WXK09-003等）・手札加え動詞。詳細 BUGFIXES 続き143。** **PARTIAL刻印 IS_MY_TURN化 127件＝過剰実行バグ確定（続き138・Sonnet・タスク9トリアージ）**。「その後/この方法で、[条件]の場合」という後置条件節を parser が抽出できず無言で常時true化（`effectParser.ts:2488`）。**152件全件を原文照合＝127件全件が真に偽になり得る条件で§9-9のLIFE_BURST慣例には非該当＝全件(a)実害あり**。文型3クラスタ：属性判定65（レベル/色/センタールリグ等）・結果カウント閾値59（「N枚以上捨てた場合」等）・否定条件3（「〜しなかった場合」＝WD14-012-E2 等は捨てても捨てなくても自壊が発火し最も実害大）。**IDリスト全件は `docs/_partial_triage.txt`**。修正はparser規則の追加（条件節抽出）＝新規機構は不要、定型パターンなので一括処理向き。 |
| 🆕(xxiii) | **リコレクト分割8件＝深刻な内容欠落（続き138・Sonnet・タスク9トリアージ）**。`effectParser.ts:1945-1946`＝《リコレクトアイコン》系の複数ステップ分解でUNKNOWN断片を無言除外。**8件中6件を効果JSON本体で直接確認し実害を確定**：SPDi47-03-E2＝「カードを3枚引き手札を好きな枚数捨てる」の本体actionが丸ごと消失／SPDi47-05-E2＝バニッシュ代替の置換ルールが丸ごと消失／**WX25-P1-001/003/005/007/009（5件同一テンプレ）＝センタールリグへ独立した3つのエクシード起動能力を付与するGRANT機構が丸ごと欠落し、コストゲートも選択もなく3能力全部を即時連続実行してしまう＝過剰実行が最も深刻**／WX24-P4-016-E3＝GRANT_KEYWORD「マジックボックス」が原文トリガー文と不一致（要再確認）。**WX25-P1-00X系列は新規GRANT機構（permanentへの複数独立起動能力の後天付与＋エクシードコストゲート）が要る§6.3級の中型機構**。詳細 `docs/_partial_triage.txt`。 |
| 🆕(xxiv) | **発生源フィルタ脱落8件＝過剰トリガー確定（続き138・Sonnet・タスク9トリアージ）**。`effectParser.ts:2912/2983/2987`＝ON_CARD_MILLED_FROM_DECK(1)/ON_OPP_POWER_DECREASED(2)/ON_DISCARDED_AS_COST(5) のトリガー条件から「＜X＞のシグニの効果/【出】【起】能力」という発生源限定が無言で脱落。**WX25-P3-071-E2で直接確認**＝原文は「＜微菌＞のシグニの【出】【起】コストとして捨てられたとき」限定だが`triggerCondition`にフィルタなし＝微菌以外のコスト捨てでも誤発火。8件全件のIDは `docs/_partial_triage.txt`。parser側でtriggerConditionにsourceFilter追加が必要。 |
| ~~(xxv)~~ | ~~driverバッチランナーの「長時間ブラウザセッション累積疲労」＝71件フルバッチのみで再現する構造的flakiness~~ **✅続き140（Opus）で根本原因を特定・修正**＝JS側の残留ではなく**`battle_states`のdeck/life_cloth/trash/lrig_trashがシナリオを跨いで単調に消耗/増加するDB側累積**が真因（続き105の「clientの累積疲労」診断は誤りだった）。`injectScenario`でシナリオ毎にこれらをフィラーカードで健全な既定値へ張り直す修正＋`exileHandBlind`ピッカーのレース耐性強化。**✅続き141（Sonnet）が74件フルバッチで再検証＝27件目（`acceSelfScope`直後）までは全PASS（既知FAIL除く）＝この対策自体は機能している**（詳細下記(xxvi)参照・DB側累積によるFAILの再現は無くなった）。 |
| ~~(xxvi)~~ | ~~**フルバッチ実行中のPlaywrightブラウザプロセスクラッシュ（続き141・Sonnet・タスク1検証の副産物）**~~ **✅続き142（Opus）で消化＝`verifyBattleDrive.mjs` の driver をセッション（context+page+H+console監視）を作る `establish()` 関数へ切り出し、(a) `RECYCLE_EVERY`（既定12）件ごとに context を作り直してレンダラのヒープ/DOM/Realtime購読の蓄積を解放（`recycle()`）、(b) `isCrashError()` でクラッシュ検知時に再確立→当該シナリオを最大3回再試行、の二段で耐障害化。⚠**スクショは元々バッチ既定で no-op 化されていた（`SHOTS_ON`＝引数指定時のみON・`${id}-final`のみ発火）と判明**＝主因は「20回超の撮影」ではなく単一 page を74件通しで使う累積。RECYCLE_EVERY=2 の実機3件で予防リサイクル1回発火→ルーム再利用で再確立→全PASS を確認。詳細 BUGFIXES 続き142。** 元記録↓。種別＝**scripts（`scripts/verifyBattleDrive.mjs`）のテストインフラ課題**＝ガードレール②の対象外。**現象**：74件フルバッチをFRESH=1で通しで実行したところ、27件目付近（`wxk09050`から数えて`acceSelfScope`のスクリーンショット撮影直後）で`page.screenshot: Target crashed`エラーが発生しバッチが停止した。それ以前の27件は（`lrigGrowAnyOpp`/`lrigGrowAnyOppP03046`/`lrigAttackStepStartUsageLimit`/`oppDraw`という既知のFAILを除き）全てPASSしており、**続き140のDB側累積状態対策自体は機能している**＝別種の問題。**推定原因**：各シナリオが最大20〜22回`page.screenshot({ fullPage: true })`を呼ぶ設計（`SHOT`ディレクトリへPNG出力）のため、単一の`page`/`browser`インスタンスを74シナリオ通しで使い続けるとメモリ蓄積でレンダラープロセスがクラッシュする可能性が高い。**Opusへの依頼**：(a) 数シナリオごとに`page`（または`browser.newContext()`）を再生成してメモリを解放する構造へ`main()`ループを変更、(b) あるいはスクリーンショット頻度を減らす（デバッグ用途以外は撮影しない設計へ）、(c) crashハンドラを追加しcrash時にpage/contextを再生成して当該シナリオ以降を継続する耐障害化、のいずれかで対応。未着手・調査ログはBUGFIXES続き141。 |
| (xxi) | `collectOppDrawTriggers`（`triggerCollect.ts:691`）が ON_DRAW any_opp watcher の発生源（対戦相手自身の効果か reactor 自身の効果か）を区別せず、「対戦相手が**自分の効果で**」を明記するカード（PR-423 等）が reactor 自身の効果由来の対戦相手ドローにも誤発火する＝実機再現済み（続き131・シナリオ`oppDrawOwnEffectOnly`・意図的FAIL回帰） |
| 🆕(未確認) | `collectLrigGrowTriggers`（`triggerCollect.ts:102`）が usageLimit の `usedIds` を返さず書き戻し機構が無い＝ATTACK_STEP_START②（続き116/119・タスク12(xvii)相当）で見つかり修正済みの構造的バグと同型のコード疑義。標準グロウの二重発火は`actions_done.includes('GROW')`で別途ブロックされ無害と確認したが、本命の再現経路（ゲット・グロウ＝GROW_FREE横グロウでの2回目ON_LRIG_GROW）はdriverでlrigTopが変化せず検証不能（原因未特定）＝**E2E未再現・コード読解のみの疑い**として登録（続き132） |
| 🆕(xxvii) | **semantic audit スケールアップ第2弾＝seed202607サンプル200枚が全数監査完了（続き144・Sonnet・タスク8）**。残りclean群80枚を完走しfindings 88件（HIGH57/MED28/LOW3）取得・累計213件（旧125件と統合）。**HIGH中心に37枚が新規の実害ありバグと確認**（3枚は`_partial_triage.txt`のIS_MY_TURN化Cluster A/Bと重複＝既知）。系統別＝A条件節丸ごと欠落11枚（既存PARTIAL計器の死角＝IS_MY_TURN化すらせず無条件化）／B duration/until誤り6枚（POWER_MODIFY/REMOVE_ABILITIES/GRANT_PROTECTION/BLOCK_ACTIONが「ターン終了時まで」等の一時効果を永続化 or 即時化＝続き62のGRANT_KEYWORD向け修正の未カバーaction型）／C owner対象範囲誤り6枚（WX10-061＝相手にも+3000適用の重度バグ等）／D timing取り違え4枚（【自】がON_PLAY化＝タスク16/17と同系統）／E主要処理欠落7枚（WXDi-P15-004＝複数起動能力の後天付与が§6.3級新規機構）／Fフィルター単点欠落13枚。詳細・全IDは `docs/_semantic_audit_scaleup2_triage.txt`＋`scripts/archive/scratchpad/semantic_audit_101/findings_compact.txt`（213件全件）。 |

#### Sonnet のタスク（2026-07-15 棚卸し・生きているものだけ）

> **⚠2026-07-15（続き134）の棚卸し結果＝在庫がほぼ枯渇している**。続き133 で BEHAVIOR_AUDIT 高シグナル22の精査が「新規バグ0件」で終わったことにより、**タスク1（主力在庫）・4 が同時に枯れ、6 は元からブロック**。**🆕続き138でタスク9（PARTIAL刻印151件トリアージ）も完了＝Opusタスク12へ144件分登録**。**残る Sonnet 在庫は 8（`claude -p` 上限リセット済み）／3 の2本のみ**。この2本を消化し切ると Sonnet 側は本当に空になる＝**その時点で Opus のタスク12（在庫）と 1〜6（新語彙）を進めないと Sonnet に流す観測対象が生まれない**。

| # | タスク | 種別 | 規模 | 残っている内容 |
|---|---|---|---|---|
| ~~9~~ | ~~PARTIAL 刻印 151件のトリアージ~~ **✅完了（続き138・Sonnet）** | 計器読み＋分類（parser/engine 非変更） | M | **152件全件を原文照合＋効果JSON本体を直接確認して3分類完了**＝(a)実害あり144件（IS_MY_TURN化127＝属性判定65/カウント閾値59/否定3・リコレクト分割8のうち6件確認＝センタールリグ複数エクシード能力付与が丸ごと崩壊等・発生源フィルタ脱落8）／(b)慣例で無害11件（multi-dest分割＝11件全件をJSONで直接確認し内容欠落なしと確定）／(c)機構待ち0件。**(a) 144件を Opusタスク12 へ (xxii)(xxiii)(xxiv) として登録済み**。一次成果物＝`docs/_partial_triage.txt`（分類根拠・IDリスト・JSON実例つき） |
| 1 | **§7 実機検証の横展開** | 検証（driver シナリオ追加のみ） | S×件数 | **✅(a)(b)(c)は続き141（Sonnet）で消化完了**：(a)`trashCounterOpp`（タスク12(iv)修正の反転＝PASS・既定orderに追加）(b)ON_LRIG_GROW④のusageLimit＝`lrigGrowUsageLimit`（タスク12(vi-5)修正の反転＝旧FAILの真因はdriver側のtestId誤りと判明・修正してPASS・既定orderに追加）(c)R37③ ON_SIGNI_POWER_ZERO_OR_LESSのusageLimit＝専用シナリオ`powerzeroUsageLimit`を新規作成しPASS・既定orderに追加。既定order 71→74件。**残ブロック（未着手のまま）**＝(xiii) B4引用付与（→Opusタスク17 で解消見込み）／(xix) WX04-005-E3／(xx) ON_TARGETED forced／(xxi) oppDraw発生源。WX22-001-E3（クラフトトークン残・§6.4）も引き続き可 |
| 3 | driver バッチ実行の状態汚染 | scripts（engine/JSON 非依存） | M | ⏳部分完了（続き77・105・139）＝ホワイトリスト方式リセット＋シナリオ毎 `page.reload()` で改善を継続中。**🆕2026-07-15（続き139・Sonnet）＝`blockDrawByEffect`/`exileHandBlind`の原因を特定・修正**＝両シナリオが`handPrepend`（`.slice(0,4)`で前シナリオ/mulligan由来の**実ランダム手札**を持ち越す実装）を使っていたため、末尾に紛れ込むランダムな余剰カードが召喚ボタン/pick候補の出現順序を狂わせてdriveのクリック列を空振りさせていた＝**バッチ位置に依存しない単体flakinessと確定**（FRESH=1の単体再実行だけでも複数回FAILを再現）。修正＝両シナリオを`handPrepend`から**完全決定的な`'hand':[...]`直接指定**へ変更（他の安定シナリオと同じパターン）。**5シナリオ連結（freezeLrig→negateAttackLrig→blockDrawByEffect→exileHandBlind→delayedAttackTrigger）で3回連続ALL PASS**を確認。⚠**ただし71件フルバッチでは依然この3件がFAILする場合がある**＝修正後に2回フルバッチを実行し1回目は環境要因（旧`verifyBattleDrive`のdevサーバーがポート4173に残留＝`taskkill`後に再実行したら62/71へ改善）、2回目もこの3件を含む9件がFAIL。**5シナリオの短い連結では再現せず71件通しでのみ再現する＝ホワイトリストの漏れではなく「長時間ブラウザセッションでのReact state/setInterval/Supabase Realtime購読等のクライアント側累積疲労」（該当コード注釈と一致）と判断**＝**根本原因の切り分けと修正は Opusタスク12(xxv) へ登録・引き継ぎ済み**（scriptsインフラ課題だがSonnet単独では確定できず・詳細BUGFIXES続き139）。(b)`oppDraw` 単独FAIL（既知・CPU挙動依存）。(c)`lrigGrowAnyOppP03046` が FRESH=1 でも FAIL＝CPUがグロウ判断に至らない（続き135記載のまま未解決）。現在シナリオは**81定義／71既定実行** |
| 4 | ~~BEHAVIOR_AUDIT キュー再生成＋一次トリアージ~~ **⛔枯渇（常設のまま休眠）** | 計器実行＋分析 | S | **続き133 で高シグナル22件を全件精査＝新規の真no-opバグ0件**。残る母数251件（273−22）は**監査ツールの構造的盲点**（COUNTER_SPELL/SPELL_CUTIN・トリガー文脈依存効果）に大半が該当＝そのまま掘っても同じ結論になる。再開するなら**まず盲点フィルタを機械的に実装して除外してから**（＝新規のスクリプト作業。低収量の見込み） |
| 6 | §5c 再収穫サイクル（`/census-batch` 準拠） | JSON採用 | S | **⛔Opusタスク1〜6 のいずれかが着地するまで着手しない**（現在プラトー＝空振りになる。続き130 で「安全な採用先ゼロ」を実測確認済み） |
| 8 | semantic audit のスケールアップ＋単点修正 | パイプライン＋JSON単点 | M | **✅seed202607サンプル200枚（stub100+clean100）は続き144で全数監査完了**（続き88・102で119枚→続き144で残clean80枚を完走・findings累計213件・新規実害37枚をOpusタスク12(xxvii)へ登録・詳細`docs/_semantic_audit_scaleup2_triage.txt`）。**次の一手＝stub群 母集団2,401枚のうち未サンプリング約2,301枚へのスケールアップ**（`semanticAuditExtract.mjs --per-group <N> --seed <新シード>`で新規サンプリング）。意味判定が割れるもの・機構が要るものは Opusタスク12 へ |

**補欠（在庫が尽きたら）**＝(a) **timing census 残128（113クラスタ）の振り分け台帳作成**＝`docs/_timing_census.txt` の各クラスタについて engine 収集関数の有無を機械照合し「§6.3 送り（受け皿なし）」と「Opusタスク16（parser 語彙のみ不足）」に仕分ける。PLAN は「残128は全て機構待ち」と結論しているが**クラスタ単位の裏取り台帳は未作成**。(b) **`textNoJson` 56枚**（原文はあるが effects JSON が無いカード・semantic audit manifest 由来）の実体確認＝バニラ/ルール系で正当か、真の欠落かが未確認（低コスト）。

**依存の要点（交互サイクルの回し方・2026-07-15 更新）**＝待ち関係は3本：**Opus1〜6 → Sonnet6**（新語彙が着地してから再収穫）／**Sonnet1・4・8・9 → Opus12**（Sonnet が観測して積む → Opus が修正する）／**Opus12 → Sonnet1**（修正が着地すると §7 の意図的FAIL回帰シナリオを PASS へ反転させる検証作業が生まれる＝Sonnet の主力在庫が復活する）。それ以外の組はすべて独立＝どの順で取っても衝突しない（バトン式なので同時作業はしない・§11 の「着手中」宣言は大型機構のみ必須）。

**⚠いまサイクルが Opus 側で詰まっている**＝Sonnet が積んだ在庫（Opusタスク12 の (i)〜(xxi)＋🆕2件＋**続き138のタスク9トリアージ由来 (xxii)(xxiii)(xxiv)＝PARTIAL刻印144件分の系統バグ**／~~(xxv)~~ **✅続き140で消化済み**）が消化されないまま溜まり、その結果 Sonnet 側の 1・4・6 が同時に待ちに入った。**Opus は「新語彙を開く」より先に、まず タスク12 の在庫消化を優先する**（＝Sonnet の在庫を再生産する行為でもある）。

---

## 4. 現在地とバトン（直近セッション）
> ① `git pull` → ② 本節を読む → ③ 作業 → ④ 本節と `BUGFIXES.md` を更新 → ⑤ commit & push を回す。詳細な修正履歴は `BUGFIXES.md`（新しい順）に積む。ここは**現在地・計画・残作業数だけ**。

### 📍 進捗サマリ（最新1件のみ・過去は別ファイル）
> **運用ルール（2026-07-07〜）**：この節には**直近の作業1件の要約だけ**を残す（入れ替え式）。新しく作業したら ①いま置いてある要約を [PLAN_PROGRESS.md](./PLAN_PROGRESS.md) の「過去セッション要約」**先頭**へ移す（新しいものが上）→②この節を今回の作業の要約へ丸ごと書き換える。過去の全セッション要約（旧・要約①②を含む）は [PLAN_PROGRESS.md](./PLAN_PROGRESS.md) に集約済み。

- **🆕 セッション（2026-07-15・続き143・Opus 4.8・PLAN §3 Opusタスク12(xxii)＝IS_MY_TURN化127件バグを3バッチ計22件消化）**
  - **✅ 第1バッチ12件**＝①`parseLastProcessedMatchesCondition` を「それが」に加え**「そのカードが…の場合」**へ拡張②前段の記録に依存しない**盤面状態条件の持ち上げ fallback**（`parseHoistStateCondition`）。内訳＝LAST_PROCESSED_MATCHES 8／LRIG_STORY 2／SELF_POWER_GTE 2。
  - **✅ 第2バッチ8件（結果カウント閾値 Cluster B）**＝汎用カウント条件パーサ **`parseThisWayGenericCount`**（`LAST_PROCESSED_MATCHES{filter,minCount}` で一致数≥閾値を評価）。**記録確認済みの動詞に限定**（公開/トラッシュ/エナ/除外/バニッシュ/デッキ戻し）＋**捕捉不能形（合計/すべて/種類/枚数が/偶数/《…》）は据置**（初回21件フリップ→7件が取りこぼし誤抽出と機械検証で判明し除外語追加）。
  - **✅ 第3バッチ2件（多分岐後続枝）**＝**`parseBareBranchCondition`** を新設。「レベル１の場合、X。レベル２の場合、Y。…」の第2枝以降が接頭辞なしで条件を失い bare step 化（無条件発火）していたのを、**直前が `LAST_PROCESSED_MATCHES` の CONDITIONAL（`prevIsLpmChain`）のときに限り**同じ結果への追加分岐として LPM 化。是正＝**WXDi-P13-049**（レベル1/2/3以上/スペルの4枝全て・前段ミル）／**WX10-031-BURST**（アーム/ウェポン2枝・前段 discard も `resumeSelectTarget:4304` が記録と確認）。盤面語/偶数奇数を含む desc は据置。
  - **検証**：`npm run gates` 全緑（**golden 338〔+4〕**／smoke 全0／fuzz 全0／lint 0 error）。**census 2213 → 2206**（`BASELINE_HIGH` 更新済み）。全バッチ `heldReview --adopt`＋機械diffで「意図した枚数のみ変更」・`npm run regen` で同型★0維持・逆翻訳原文照合。詳細 BUGFIXES 続き143。
  - **次の一手**：**Opus＝タスク12(xxii) の残消化を継続**（残105件・`docs/_partial_triage.txt`）＝(a) **多分岐の複合条件枝**（WDK16-13/WXK08-033＝「登録者数100万達成 AND 公開」／**LRIG色別多分岐** WXK09-003 等＝第1枝が LPM でなく LRIG_COLOR なので `prevIsLpmChain` ゲート外＝別ハンドラが要る）／(b) Cluster B の**据置形**（レベル合計＝`LAST_PROCESSED_LEVEL_SUM_EQ`/新GTE型・すべて＝全一致条件・種類＝distinct・手札加え動詞は ADD_TO_HAND が非記録で不可）／(c) 否定条件 Cluster C 3件（WD14-012 等・**engine に「前アクションが起きなかった」条件型が要る**＝機構寄り）。ほかタスク12在庫＝(xxiii)リコレクト分割8件〔§6.3級 GRANT機構〕／(xxiv)発生源フィルタ脱落8件／(vii)(viii)per-card構造修正／(xii)WXEX1-19無限ループ／(xxi)collectOppDrawTriggers→本丸タスク1（引用付与の内側parse）。Sonnet＝タスク8（semantic audit）在庫、及び続き142のフルバッチ完走確認。
### 📊 恒久指標（維持中・逐次更新）
- **P1 表現①の systematic 指標**：同型★0（`node scripts/groupSimilar.mjs --all`）。**parserWorklist は held 79 / LOSS 67 / VALUE 12（2026-07-05 続き29終了時点・`npx tsx scripts/parserWorklist.ts`・⚠HEAD比較＝未コミットJSONは反映されない）**＝続き25時点の24から増えたのは**回帰ではなく続き29の CHOOSE 平坦化修正の採用待ちバックログ**（parser が curated より正しくなった側＝WX14-011/WX17-020/WX20-Re20/WXDi-P02-005 等の CHOOSE 復元 one-off 約35枚と、その巻き添えバケツ）。内訳＝(a)LOSS 67＝CHOOSE復元の採用待ち約35＋レガシードリフト（EXILE→TRASH系 WX21-027/WXDi-CP02-TK03B 等・owner 等）のパーサー弱点、(b)VALUE 12＝count 慣例の非一貫性（CONT保護は count 無視＝機能同値・WX18-034/WXEX1-35 等）・duration 文脈テール（WX25-P2-062）と単発テール。**CHOOSE復元分を採用し切ったら再計測して実数を締め直す。この数字からさらに増えたら回帰**（JSON手パッチ時は パーサー同修正 or MANUAL化 or ここを実数更新）。
- **脱落疑い 255枚を全分類済み**（偽陽性179／機構待ち72／修正済・`node scripts/_dropTriage.mjs`）。
- **timing flatten**（当初159枚の実バグ）は R5-R58 で完了＝VALUE 0（詳細 §7下部）。
- **🆕 語彙センサス（過剰効果＋幻覚＝両方向の計器）**：`npm run census`（`scripts/vocabCensus.ts`）。**現ベースライン＝高シグナル欠落 2206【効果単位】**（2026-07-13 続き109 で判定粒度を「カード単位」→「効果単位（effectId）」へ切替。旧カード単位の 1447 とは**計測仕様が違うので比較不能**）。**この数字から増えたら回帰（exit 1）／減ったら `BASELINE_HIGH` とここを実数更新**。**前提＝`docs/_effect_srctext.json`（`npm run build:effects` の副産物）が最新であること**（無ければ census は exit 1）。明細 `docs/_vocab_census.txt`・消化の入口は `npm run census:clusters`（§5c）。**切替の根拠と計測履歴は [PLAN_DETAIL.md](./PLAN_DETAIL.md) §4／BUGFIXES 続き109。**
- **母数**：効果カード 5975／効果 10549／MANUAL効果 733／STUB含むカード 1820。
- **A3クローズ＋B機構全完了（B1-B4）**。残るP1機構＝C（engine実機配線・P2）のみ。同型★0（5986枚）。
- **decompile再生成は `npm run regen`**（全シート＋下流一括・UTF-8直書き＝シェル非依存。2026-07-07にリダイレクト方式を廃止。旧「⚠Bash の `>`」問題は解消済みだが、万一 UTF-16 が混入すると下流3スクリプトがガードで即 exit 1 する）。

### 📌 次の一手（推奨順）
> **cold start＝まず `npm install` → `npm run gates`（全ゲート一括・数秒）が緑になることを確認する。** 現状＝golden 338・smoke/fuzz 全0・同型★0・census 2206。
>
> **戦略＝続き108 策定の「全カード完成戦略①〜⑤」を最優先で適用する。①（census 効果単位化）は✅続き109で完了＝現在は戦略②「純P1の系統バッチ消化」。** 残作業マップは [P1_COMPLETION_ROADMAP.md](./P1_COMPLETION_ROADMAP.md)（census 高シグナルの機械分類＝純P1 87%／混在9%／純§6.3 5%）。
>
> 1. **自分のモデル側のタスク表（§3）から取る**。**🆕2026-07-15（続き134）の棚卸しで分担の推奨が変わった**＝**Opus は最優先で タスク12 の在庫（(i)〜(xxi)＋続き138追加の(xxii)(xxiii)(xxiv)＋続き139追加の(xxv)＝driverバッチランナーのscriptsインフラ課題）を消化する**（Sonnet 側の 1・4・6 がこの在庫待ちで同時にブロックされている＝サイクルが Opus で詰まっている）。**✅タスク9（PARTIAL 刻印トリアージ）は続き138・タスク3（driver）は続き139で一部消化完了＝残る Sonnet は タスク8（semantic audit・`claude -p` 上限リセット済み）のみ**。旧推奨だった タスク1（§7横展開）・タスク4（キュー）は**枯渇したので取らない**（理由は §3 Sonnet 表）。
> 2. **手順はスキルに従う**＝`/census-batch`（§5c 文型バッチ1巡）・`/audit-card <CardNum>`（BEHAVIOR_AUDIT 1カード監査1巡）・`/baton`（セッション終了時の簿記）。散文の記憶で回さない。
> 3. **engine/parser/decompiler を触ったら `npm run gates`・シート再生成は `npm run regen`**（§12）。バグは golden に1件足してから直す。

> **新規 timing 配線の確立パターン**：①該当カードの effect/原文を確認 ②`triggerCollect.ts` に pure collector 追加（`mkLimitOk`/`ownFieldSources`/`effsOf` 流用）③検出が要れば `boardDiff.ts` に detector 追加 ④BattleScreen 中央 diff ブロック（`resolveStackNext` 内・mill/freeze 等と同じ場所）に発火配線＋薄いラッパ ⑤`goldenTest.ts` に発火条件テスト ⑥`decompileEffects.ts` の `engineUnwiredTimings` から除去 ⑦`npm run regen`（全シート＋下流一括再生成）＋同型★0 確認 ⑧`npm run gates` 全緑 → commit/push。

---

## 5. フェーズ1残作業：表現（P1）

> **🆕 P1完了に向けた残作業マップ＝[P1_COMPLETION_ROADMAP.md](./P1_COMPLETION_ROADMAP.md)（2026-07-13続き107・Fableで作成）**。census高シグナル1446枚を機械分類＝**純P1（parserで直せる）1253枚(87%)／混在127枚(9%)／純§6.3（機構待ちのみ・即P2/P3送り可）66枚(5%)**。「機構待ちを§6.3送りにすれば宣言が近い」は誤りで、95%はparser表現作業（ただし粗い網で真の残数は大幅に少ない可能性）。着手順・機構待ちカード実IDリストは同ドキュメント＋`docs/_p1_classification.txt`。**最短ルート＝系統カテゴリ（条件節420・色・クラス・閾値）を `STATE_CONDITION_CLAUSES` バッチで一括消化**（続き106/107手法の横展開）。

### 5a. BEHAVIOR_AUDIT によるバグ収穫（現在の主作業・2026-07-03〜）

**目標＝要レビュー・キュー（`node scripts/_bqTriage.mjs`）を逓減限界まで消化。** 全効果を実行し盤面差分＋ログを原文と目視照合＝逆翻訳の文字列一致では検出できない「真no-op」「未配線timing」「未実装action型」「トリガー主語ミス」を発見して直す。手法・キュー件数の推移は [BEHAVIOR_AUDIT.md](./BEHAVIOR_AUDIT.md) を参照（811→285→261→169→129→高シグナル30）。

- [ ] **キュー消化を継続**：`node scripts/_bqTriage.mjs` で高シグナル選別 → `npm run audit -- --id <CardNum>` で目視 → 「真no-op／シナリオ空振り／STUB未実装」に仕分け → バグは effects JSON 直パッチ＋engine/decompilerセット＋smoke/golden/fuzz で修正。
- [ ] **未実装action型 worklist**（§6）＝action位置なのに engine/UI に型名が一度も現れない完全no-opの型。残11種27効果。
- [ ] **意味照合監査（semantic audit）の worklist**（§6）＝BEHAVIOR_AUDIT の盤面差分では拾えないSTUB/MANUALの意味エラー（owner取り違え・GRANT_PROTECTION no-op 等）の補完的発見器。
- [ ] **完了判定**：高シグナル件数がこれ以上減らない逓減限界に達した時点で「P1完了＋P2の一部前倒し完了」を宣言し、残りは個別カードの機構待ちとして §6/§7 に送る。

### 5c. 語彙センサスの系統別消化（2026-07-04新設・続き17-18で両方向98計測に拡大・続き23で文型バッチ化・過剰効果＋幻覚バグ）

**目標＝`npm run census` の高シグナル欠落（**現ベースライン 2218 効果**・§4 恒久指標）を文型テンプレ単位のバッチで0へ逓減。** 過剰効果（フィルタ・条件・使用制限の脱落で対象/発火が広がる・ゲームを壊す側）と幻覚（原文に無い効果/数値がJSONに居る・逆方向）は behavior-audit の無変化キューに掛からない別種のバグ母集団（発見経緯は §4 続き15、拡充は続き17-18）。

- **残りの消化対象（生きている worklist のみ・消化済みバッチの履歴は [PLAN_DETAIL.md](./PLAN_DETAIL.md) §5c）**＝(1) **「代わりに」残テール**：C:コスト代替6・D:置換ルール9（バニッシュされない系＝置換機構要）・E:リコレクト2・B1残10（コスト参照・ターン中イベント等＝条件語彙が無い §6.3）＋**CHOOSE平坦化復元の採用待ち held 約35枚**。(2) **幻覚/取り違え系の残**＝WX16-021（置換ルール→即時LIFE_CRASH幻覚＝置換機構要・§6.3）・BURST内IS_MY_TURN残7（§6.3登録済み）。(3) **構造平坦化系**＝引用付与の残107（CONTSELF_COND 18／OTHER 約30／内側品質不全27＝トリガー語彙拡充で再収穫可・held 103 が計器）・代わりに183・IS_MY_TURN誤変換の残53・遅延13・「Nまで」120。(4) 除去系の対象フィルタ脱落（クラス339=`story`・色105・パワー閾値83・レベル閾値90・凍結13・ダウン/アップ38・数値不一致153・小さい数390=粗い網）。(5) トリガー種別（約220）・コスト脱落（コイン24+場トラ25+エナトラ12+他）・ゾーン行き先67・機構census（ライズ31/チーム25/アンコール22/エクシード16等）・公開128・次相手ターン99・相手選ぶ31・制限58・キーワード86。(6) 制限/様相（ターン1回28・ゲーム1回3・任意→強制23）・保護/付与系（同一性46・共通色66・能力なし10）。(7) 語彙自体が無い系統＝最上級（6枚・`TargetFilter` に `superlative:{key,dir}` 新設）・**正面32**（`frontOfSelf` はあるが使用3件＝parser 未配線疑い）・動的比較の残35・合計制約27・**出現条件35＝機構1本の欠落（parser が除去+engine強制なし）**は §3「機構実装の型」で新語彙＋engineセット実装。
- **進め方＝`/census-batch` スキルに定型化済み**（`.claude/skills/census-batch/SKILL.md`＝続き23確立のパイプライン＋必須ガードレール込み。原文は [PLAN_DETAIL.md](./PLAN_DETAIL.md) §5c）。概要＝①`census:clusters` でテンプレ選定→②既存DSL型で表現できるか確認（不可＝機構待ちとして §6.3 へ）→③parser 規則追加（**JSON手パッチではなく parser を source of truth に**）→④`build:effects`→⑤`heldReview` spot-check→`--adopt`（**STUB退化・「代わりに」昇格・別STUB id 化は採用しない**）→⑥golden 1件/テンプレ＋全ゲート＋BASELINE_HIGH 更新。旧手順（census明細から手パッチ）は廃止＝parserWorklist held を増やさない。
- ⚠判定はカード単位の粗い網（同カード別効果に語彙があれば合格＝過小評価）。効果単位の精密化は消化が進んでから。
- **census 手法自体の残死角（続き18更新＝続き17記載の (a)トリガー種別 (b)小さい数 (c)出現条件 (d)そうした場合誤変換 はすべて98計測に組み込み済み）**＝文字列突き合わせで原理的に見えない残り4つ：(a) **参照解決の誤り**（「それ」の指し先取り違え＝WX09-015 の bounce 対象 self 化。両側に語彙が揃うため不可視）。(b) **効果単位の粒度**（同カード別効果に語彙があれば合格＝カード単位判定のマスキング。消化が進んだら効果単位化）。(c) **JSONは正しいが engine 実装が違う**（behavior-audit／golden の領分）。(d) **文間の実行順序・依存関係**。~~横断的再発防止案＝parser の無言フォールバックに parseStatus:PARTIAL 刻印を義務付ける~~ **✅実装済（2026-07-07・続き38）**＝IS_MY_TURN化（条件抽出失敗の常時true化）・UNKNOWNステップ無言除去（リコレクト/multi-dest分割）で `markSilentFallback()` → fresh の parseStatus を PARTIAL 降格＋`docs/_partial_report.txt` に理由明細（**初回計測142効果＝IS_MY_TURN化125/multi-dest11/リコレクト8・逓減計器**）。parseStatusのみの差分は buildEffectsJson/parserWorklist とも比較から除外（held を汚さない・137枚吸収）。新たな無言近似を parser に足すときは **markSilentFallback を必ず呼ぶ**（「そうした場合」常時true等の意図的慣例は刻印しない）。

### 5b. 逆翻訳機の出力品質（低優先のテール・大半消化済み）

**目標＝英語ID漏れの解消＋B層データ欠落の解消。** 手法は BUGFIXES ⑥〜⑨ で確立済み（engine 実装済みSTUBなら `decompileEffects.ts` に原文抽出/意味文を足すだけ・engine 不変・ゲートは同型★0＋原文照合のみで軽い）。**2026-07-03時点でBEHAVIOR_AUDITに主作業の座を譲ったため、手が空いたときのサブタスク位置づけ。**⚠**「367件」という数字は古い（2026-07-12続き87で実測823カードと判明＝BEHAVIOR_AUDIT等の主作業でカード母集団が増減し続けているため。件数メトリクスを信じない §3の原則どおり）。系統別内訳は`docs/_stub_leak_classification.txt`（`node scripts/_stubLeakScan.mjs`で再生成）参照。**

- ~~**🆕 durational付与の「ターン終了時まで」action内duration脱落＝期間注記の逆翻訳脱落（Opusタスク(A)・母集団132枚）**~~ **✅続き62（Opus）で是正＝decompiler側 `restoreLeadDuration`（原文の当該効果セクションを文スコープで照合し期間注記復元・GRANT_KEYWORD/REMOVE_ABILITIES の2レンダラに配線）で112枚が期間注記を獲得。engine/JSON 不変（parser/JSONは触らず＝held激増を回避）・同型★0維持・全ゲート緑・誤注記ゼロ。母集団132のうち34は抽出の偽陽性（恒久付与 or POWER_MODIFYが期間句の帰属先）で正しく無注記。詳細 BUGFIXES 最上部。** 原因＝`parseActionTextInner`（`effectParser.ts:1398`）の先頭「ターン終了時まで、」strip で action内 duration が PERMANENT/missing に落ちる（engine では PERMANENT と機能同一のため挙動不変）。
- ~~①REVEAL_AND_PICK 文法崩れ／②LOOK_AND_REORDER 行き先欠落／③CHOOSE 圧縮／④BLOCK_ACTION 英語ID漏れ／⑤timing/icon 英語漏れ~~ **✅全て是正済（BUGFIXES①〜⑤・詳細 [PLAN_DETAIL.md](./PLAN_DETAIL.md) §5b）**。
- ~~残＝engine実装済みSTUB id の意味文化~~ **✅是正済（COPY_LRIG_NAME_ABILITY／DESIGNATE_SIGNI_ZONE／SUMMON_RESONA_FROM_LRIG_DECK／DOWN_UP_SIGNI_AND_CHOOSE／CHOOSE_COLOR_FROM_LIST は `decompileEffects.ts` に意味文実装済み・2026-07-07再確認）**。全10シートに残る英語STUB露出は3件のみ（`VARIABLE_ENERGY_TRASH_LEVEL_BOUNCE`／`POWER_PLUS_BANISHED_POWER`／`OPP_LRIG_DECK_TO_LRIG_TRASH`）＝いずれも§6.3で機構待ちとして登録済み（decompilerでは対応不能・engine機構実装が前提）。
- [ ] **残る単発テール（原文とJSON構造がズレた混線／未構造化STUB）**＝**2026-07-02時点で「1 effect=1クリーンSTUB」で原文抽出できるものは全消化済み（444→367→その後の作業でカード母集団が変動し2026-07-12実測823・続き87で機械分類済み）**。effect構造そのものが原文とズレた混線で、1つのSTUBを原文化しても同 effect 内の他のズレが残り原文一致にならない＝decompilerの原文抽出では対応不能なものが大半。**effects JSON の再parse（機構実装・データ層修正）が本筋＝Opusタスク13**。系統別内訳（16テーマ・カード数の多い順＝デッキ操作系184／パワー修正系165／手札系102／トラッシュ系75／対戦相手コスト系63／エナ系50／ライフ系48／シグニ配置系48／ルリグ系36／能力付与系31／ガード・アタック制限系26／ソウル・アーツ系15／ウィルス系10／色・クラス系4／ゲーム除外系3／チャーム系1／その他54）は`docs/_stub_leak_classification.txt`参照（続き87・Sonnet）。進め方＝1カードずつ effects JSON を原文どおりの構造に手修正→逆翻訳が原文一致するか確認→smoke/golden/fuzz→push（**原文コピーでの一括潰しは禁止**＝実装未完成を隠蔽し検証目的に反する）。
- ~~Z-2：BET系の表現描画~~ **✅完了（続き86・詳細は §3 Sonnetタスク7）**。engine 側（ベット判定自体の実装状況）は変更なし＝表現のみの改善。
- ~~B層：JSONデータ欠落の補完（中リスク）~~ **✅是正済（2026-07-06〜07・続き33-36・BUGFIXES参照）**＝REVEAL_AND_PICK/LOOK_AND_REORDER の pick 部分脱落は分類(a)〜(d)を全消化（WXDi-P04-047含む）。2026-07-07に構造走査で再確認＝全10シートで「then/destination 欠落」0件。残る例外2件（WDK07-E15＝新STUB `INTERNAL_ACCE_PICKED_TO_SELF` 要／WXDi-P07-010＝`RULE_REMINDER_TEXT`）とWXDi-P03-005（PAID_ADDITIONAL_COST拡張要）・WX26-CP1-100（新action型要）はいずれも§6.3で機構待ちとして登録済み＝Opus分担。
- [ ] **完了判定**：grep 走査で英語ID漏れ0 ＋ シートごとランダム20枚の原文照合 spot-check で一致を記録 → **§2 DoDの4つ目にチェックを入れる**。

---

## 6. フェーズ2残作業：実行の正しさ（P2）

**目標＝「表現はあるが実行が近似/未実装」の解消。** engine を触るので毎回 smoke・golden・fuzz（＋バグは golden に1件足してから直す）。

### 6.1 未実装action型 worklist（behavior-audit 段階4で発見・完全no-op・2026-07-03）
`npm run audit` の要レビュー・キューから、**action位置なのに engine(`src/engine/*`) にも UI(`BattleScreen.tsx`) にも型名が一度も現れない＝完全未実装で無言no-op**の action型を網羅スキャンで確定。**14種42効果**中 `EQUALIZE_ENERGY`(6)・`LEVEL_MODIFY`(9)は実装済（BUGFIXES上部）。残**11種27効果**。

**⚠修正層は effectType で決まる**（教訓）＝instant(AUTO/ACTIVATED/LIFE_BURST)→`effectExecutor` の `execXxx`+dispatch。CONTINUOUS→`effectEngine.ts` の calcFieldPowers/CONT収集器。`scratchpad` の型別effectType集計で判定してから着手する。

**A. instant型（executor層・優先）**
- ~~`LEVEL_MODIFY`(9)／`LOOK_AT_DECK_AND_LIFE`(3)／`VARIABLE_DISCARD_AND_DRAW`(1)／`NAME_BAN`(2)~~ **✅実装済（詳細 [PLAN_DETAIL.md](./PLAN_DETAIL.md) §6.1）**。
- [ ] `PLAY_FREE_FROM_TRASH`（2・WX09-012・AUTO/ACT）／~~`STACK_SPELL`（1・WX11-029・AUTO）~~ **✅続き122（Opus）で実装＝dispatchを`execPlaceUnderSigni`にアダプト（trashからスペルmaxCount枚選び下に置く）・golden回帰**／`PREVENT_DAMAGE`（5・WX08-029・ACT3/AUTO1/LB1＝ただしダメージ層への置換機構が要る＝実質横断）。

**B. CONTINUOUS型（calcFieldPowers/CONT収集器層）**
- ~~`GROW_COST_REDUCTION`(6)／`POWER_MODIFY_PER_ENERGY`(1)~~ **✅続き116で決着＝詳細 [PLAN_DETAIL.md](./PLAN_DETAIL.md) §6.1**（POWER_MODIFY_PER_ENERGYは実機PASS・GROW_COST_REDUCTIONはWX14-009/WD14-001の2枚でper-count scaling非対応の真バグを発見しOpusタスク12(xviii)へ登録）。
- [ ] `COST_SUBSTITUTE`（2・WX08-042・CONT＝支払い時の代替＝コスト支払いUI統合が要る・BattleScreen横断）／~~`SELF_TRASH_PREVENT`（1・WX07-033・CONT）~~ **✅続き123（Opus）で実装＝`collectSelfTrashPreventNums`新設＋ExecCtx`ownSelfTrashPreventNums`＋`execTrash`の自己シグニ候補除外＋BattleScreen ctx注入。golden回帰。⚠効果解決ctx（stack entry）経由の自己トラッシュを覆う＝コスト支払いの別経路は未カバー（該当希少）**／~~`COLOR_INHERIT`（1・WX11-032・CONT）~~ **✅続き122（Opus）で実装**／~~`GRANT_FIELD_SHADOW`（1・WXDi-P15-058・CONT）~~ **✅既実装（リスト stale・続き122で確認）**。

進め方＝A群から1型ずつ、effectType を確認→ instant なら `execXxx`+dispatch(+必要なら resume 適用case)→golden 1件→smoke/fuzz→キュー減→push（§3）。

### 6.2 意味照合監査（semantic audit）の worklist（2026-07-03新設・仕組みは [SEMANTIC_AUDIT.md](./SEMANTIC_AUDIT.md)）
原文 vs effects JSON を LLM で意味比較する検査パイプライン（`scripts/semanticAudit{Extract,Run,Triage}.mjs`）。パイロット（stub群30枚精査）で precision約78%・30枚中17枚に確定バグ（同型★0・smoke/fuzz緑を通過済みのカード）。

- [x] **系統①：相手デッキ削りの owner 取り違え＝✅完了**。**(a) 純・相手のみ58枚＝✅是正済（2026-07-03）**。**(b)「あなたか対戦相手」選択17枚（18ノード）＝✅続き106（Opus）で CHOOSE 化完了**（WXDi-P04-082 テンプレを横展開＝新規engine機構ゼロ・入れ子CHOOSE含め同型★0維持・census 1461維持・BUGFIXES 続き106）。(c)混在の誤検知9件（WXEX2-21/WXDi-P04-082/WXDi-P11-082/WXDi-P15-055/WX24-P3-088/WX24-P4-034/WX24-P4-049/WX25-CP1-007）＝**修正不要（既に正しい）**。WXDi-P07-007は「対戦相手が２択から選ぶ」構造自体がSTUB化（`OPP_CHOOSES_FOR_YOU`）されており別課題。詳細 BUGFIXES 続き88・106。
- [~] **系統②：GRANT_PROTECTION `count:'ALL'`＋subjectFilter無し＝48件**。**単体保護24件は `count:'ALL'→1` 是正済（2026-07-03）**。genuineな残ギャップは(a)SEQUENCE内GRANT_PROTECTION（WX08-017）(b)LAYER付与型（WX15-031）。残る**広域24件**（「あなたのシグニは…」）はsubjectFilter/新機構が要る別課題。
- [ ] **パイロット findings の個別修正**（真バグ39件・要追精査3件＋stub群残20枚・clean群50枚の findings）＝`node scripts/semanticAuditTriage.mjs <outDir>` で精査→1カードずつ標準ワークフロー。
- [~] **スケールアップ**＝stub群全2,306枚へ拡大（SEMANTIC_AUDIT.md「スケールアップの進め方」）。**続き102（Sonnet）で着手＝stub100+clean100=200枚サンプル中119枚を`claude -p`セッション上限まで精査（findings125件・単点是正21件はBUGFIXES続き102）。残り約2,180枚＋当該サンプルの残り8バッチ（81枚）が未精査＝`claude -p`上限リセット後に`scripts/archive/scratchpad/semantic_audit_101/`のfindings/manifestを参照しつつ再開**。

### 6.3 残・大型機構（個別カード・機構待ち）

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
- **golden の型網羅**：DSLアクション型のうち golden 未カバーの型を洗い出し、1型1テストで追加（現106件）。
- **smoke SKIP 282 の解消**：autopilot 未対応の対話（REVEAL_CARDS/DECLARE_BOND 等）へカバレッジ拡張。
- **`checkAllEffects` の `MANDATORY_SUSPICIOUS`**（ヒューリスティック検出）の精査。`verifyEffects` の「定義なし」誤検出（注釈・トークン）の除外改善。
- **生ID残存＝表示or実装の穴**：`[STUB:X]` 系（残54件＝単発テール・`STUBS.md` 管理）。`[条件:X]`/`[アクション:X]` は解消済み。

---

## 7. フェーズ3残作業：実機挙動（P3）

**目標＝実機で各カードがルール通り動く。** `scripts/verifyBattleDrive.mjs` のシナリオ横展開パターン確立済み（1件＝`scenarios` テーブルに1行追加）。**発火条件は golden で自動検証済みなので実機は「総合動作」だけ**に絞る。

> **実機ヘッドレス検証が可能（2026-06-30〜）**：`scripts/verifyBattleDrive.mjs`＝実ログイン→CPU戦→盤面注入→実UIクリックで効果発火→観測。手順は [VERIFY_BROWSER.md](./VERIFY_BROWSER.md)。**下記の宿題のうち `ON_TARGETED`／`ON_SIGNI_BANISH_OPPONENT_BY_EFFECT`／`ON_LRIG_UNDER_MOVED`／`ON_LRIG_GROW`／`ON_COIN_PAID`／`ON_DECK_SHUFFLED` は「発火すること」自体は既に実UI検証でPASS済み**（`ontargeted`/`banishbyeffect`/`lrigundermoved`/`cpugrow`/`deckshufflespell` 等の既定シナリオ）。**各項目末尾の「follow-up」注記（未カバー経路）だけが真に未検証のまま残っている**。

**engine 配線済み timing（C1 群・R30-R46）は✅ほぼ全項目 実機PASS**（続き57-64・112-128）。**個別の PASS 記録・修正経緯は [PLAN_DETAIL.md](./PLAN_DETAIL.md) §7 に退避**。

**残る実機検証項目（これだけが未消化）**：
- ~~**R40②**＝opp-draw の「自分の効果で」発生源限定なし~~ **✅続き131で実バグと確定**＝PR-423×SPDi43-21で実機再現（Opusタスク12(xxi)）。
- **R37③**＝パワー0以下トリガーの連鎖再発火（Opusタスク12 の usageLimit 書き戻し修正待ち）。
- ~~**ON_COIN_PAID④**＝自分のターン外でも発火するか未検証~~ **✅続き132でコード調査により「現状到達不可能」と結論**＝`collectCoinPaidTriggers`の全5呼び出し元（人間グロウ・CPUグロウ・シグニ【起】《コイン》・シグニ【出】《コイン》・アーツ ベット/アンコール）はいずれも呼び出し元アクション自体が「自分のターンにしか実行できない」操作（【起】は`timing:['MAIN'|'ATTACK']`のみでいずれもターンプレイヤー限定・ARTSベットは自分のアタックのみ）＝対戦相手のターン中にコインを支払う経路がengineに一つも無い。実機シナリオでは到達不能なため近似は実害なしと確定。
- ~~**ON_LRIG_ATTACK_STEP_START②**＝《ターン1回》制限の実機未検証~~ **✅続き116/119で実機検証＝実バグ発見→修正→PASS確認済み**（`lrigAttackStepStartUsageLimit`・既定order）。**PLAN記載が更新漏れで残っていたのを続き132で訂正**。
- **ON_LRIG_GROW④**＝《ターン1回》制限の実機未検証（③のパース近似は既知）。**続き132で部分決着＝標準グロウボタン連打での二重発火は`actions_done.includes('GROW')`により正しくブロック済みと確認**（`wasFreeGrow`＝`freeGrowFilter!==null`の場合のみこの枠消費をスキップする設計）。**ただし本命の検証経路（WX03-024等「ゲット・グロウ」＝GROW_FREEスペルによる横グロウ）はdriverでどうしても2回目グロウを完走させられず（`openFreeGrow`候補クリック後もlrigTopが変化しない・原因未特定）検証空振りのまま**。`collectLrigGrowTriggers`（triggerCollect.ts:102）はコード上`usedIds`を返さずusageLimitの書き戻し機構が無い＝ATTACK_STEP_START②で見つかり修正済みの構造的バグと同型の疑いが残るが、E2Eでの再現はできていない＝Opusタスク12へ「未確認だがコード上疑わしい」扱いで登録（続き119と同じ場所を精査すれば数分で判明する可能性）。
- **ON_TARGETED の forced 単一対象 follow-up**＝pending 無しで自動解決される対象取り経路が未発火（Opusタスク12(xx)）。
- **B4 引用付与の実発火**（WX24-P2-018 等）＝Opusタスク12(xiii) の timing 誤登録修正待ちで一時停止。
- **WX04-005-E3**（場出し数制限）＝STUB `LIMIT_ALL_FIELD_1` が engine 未実装と確定（Opusタスク12(xix)）。
- **クラフトトークンの実機配置**の残＝WX22-001-E3（§6.4）。
- **driver 側**＝30件超の連続実行で出る低頻度フレーク（Sonnetタスク3。`oppDraw` 単独FAILは別要因で未解明）。

### 7.1 timing flatten 系統（実バグ・当初159枚→**✅完了＝VALUE 0**・R58で打ち止め）
> R5-R58 で timing flatten の表現バグ（`timing:ON_TURN_END`だが原文トリガーは「〜したとき」＝ターン終了時に付与即失効の実質no-op）はすべて解消（`npx tsx scripts/parserWorklist.ts` で VALUE=0・LOSS=0・同型★0）。**残る作業は表現ではなく engine 配線の実機検証のみ**（上記）。診断＝`npx tsx scripts/archive/_flattenList.ts`（0枚を確認）。系統別の直し方は `BUGFIXES.md` の R5〜R58 エントリ。

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
- **`npm run smoke`（`scripts/smokeTest.ts`）**：全効果10582件を**オートパイロット**でヘッドレス実行し、CRASH/HANG（STEP_CAP=200）/INVARIANT違反を検出。現状＝全0（OK 10314／SKIP 268）。⚠「壊れないか」を保証するもので「ルール的に正しい結果か」は判定しない。
- **`npm run golden`（`scripts/goldenTest.ts`）**：主要DSLアクション型ごとに制御盤面で効果を実行し「結果がこうなる」をassert。現状＝**PASS 319／FAIL 0**（121型中99型をテスト化＝続き82-85。残22型は機構実装待ち/no-op placeholder）。バグを直す前に1件足すと回帰を防げる。
- **`npm run fuzz`（`scripts/selfPlayFuzz.ts`）**：乱択自己対戦ファズ。ランダム初期盤面で効果を連鎖発動し相互作用/進化盤面クラッシュ/ループ/カード爆発を検出。シード固定で完全再現可能（既定200ゲーム×40手）。現状＝全0。重め検証は `npm run fuzz -- --games 2000 --moves 80`。
- **`node scripts/_dropTriage.mjs`**＝脱落疑いを〔偽陽性／機構待ち／修正済／実バグ候補〕に自動＋手動分類（明細 `docs/_drop_triage.txt`）。
- **`npm run census`（`scripts/vocabCensus.ts`）**＝語彙センサス＝**両方向98計測**（原文修飾句77パターン＋数値/構造/逆方向21計測）×JSON対応語彙の突き合わせで**過剰効果（フィルタ/条件/制限/構造の脱落）と幻覚（原文に無い効果/数値）**を検出（既存網の死角＝盤面が変化するバグ）。高シグナル1872枚ベースライン（続き23消化後）・超過で exit 1・明細 `docs/_vocab_census.txt`。
- **`npm run census:clusters`（`vocabCensus.ts --clusters`・続き23新設）**＝census高シグナルのマッチ節を正規化テンプレ（数値→N・《名前》→《X》・＜クラス＞→＜C＞）にクラスタし、枚数順の文型一覧 `docs/_census_clusters.txt` を出力。**§5c消化バッチの入口**＝カード単位でなくテンプレ単位で作業を組む。
- **`node scripts/heldReview.mjs`（続き23新設）**＝`build:effects` の「温存(要レビュー)」を diff署名（type増減）でグループ化し `docs/_held_review.txt`（原文＋leaf diff付き）に出力→spot-check後 `--adopt ID1,ID2,…` / `--adopt-sig "署名"` で fresh を一括採用。前提＝直前に `npm run build:effects`（fresh を `docs/_held_fresh.json` に保存）。**採用しないもの＝STUB退化・「代わりに」昇格・別STUB id 化**（理由は BUGFIXES 続き23）。
- **`npx tsx scripts/parserWorklist.ts`**＝held/LOSS/VALUEのhealth計器（現在 held 25＝LOSS13/VALUE12）。回帰検出に使う。⚠HEAD比較＝auto-commit 環境では採用コミット後の値で判定する。
- **`npx tsx scripts/archive/_flattenList.ts`**＝timing flattenのEXIST/FRESH差分（現在0枚）。
- **`docs/_partial_report.txt`（2026-07-07新設・`build:effects` が再生成）**＝parser 無言フォールバック刻印の計器＝「原文の条件/ステップを黙って落とす近似」の理由明細（初回142効果＝IS_MY_TURN化125/multi-dest分割11/リコレクト分割8）。この数字から**増えたら**parser に新たな無言近似が入った兆候（減らすのは §5c の条件語彙拡充）。刻印された fresh は parseStatus:PARTIAL＝heldReview で採用時にレビュアーに見える。

---
**関連**：`DESIGN.md`（設計方針）／`PLAN_DETAIL.md`（消化済み履歴）／`BUGFIXES.md`（修正記録）／`BEHAVIOR_AUDIT.md`（原文照合の主軸）／`SEMANTIC_AUDIT.md`（補完的発見器）／`effects-json-guide.md`（語彙）／`STUBS.md`（STUB一覧）／`TokenCallers.md`（トークン対応表）。
